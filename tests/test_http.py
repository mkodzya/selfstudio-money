"""The HTTP surface of moneyd, rule by rule, against a real dev-mode server.

    python3 -m unittest tests.test_http -v

Every test is one rule of the documents (BUILD-SPEC, the design it amends, docs/api.md,
docs/security.md), and its name says the rule. The server is the real one, in this process,
on a free loopback port (``tests/_harness.py``); where ``http.client`` would hide the point
- a body that is announced and never sent, a request that is not HTTP at all, two headers
of one name - the bytes go over a raw socket.

What is expected is written here from the documents, as literals: the eight fixed headers,
the four policies, the statuses, the codes. Nothing is taken from ``moneyd.httpd``, so a
change there that breaks a promise cannot also change what is expected.

The happy paths are walked once in ``test_service_smoke.py``; this file is about the
edges: every row with and without a session, what a stranger is told, what is refused and
when, limits and deadlines, and what is left in the logs.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import base64
import contextlib
import email.utils
import hashlib
import html
import json
import os
import random
import re
import socket
import struct
import time
import unittest
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple
from unittest import mock

from tests import _harness
from tests._harness import HELD, NEVER, PASSWORD, PATIENCE, ledger, plan, until

CHECKOUT = _harness.CHECKOUT
API_MD = os.path.join(CHECKOUT, "docs", "api.md")
INDEX = os.path.join(CHECKOUT, "index.html")

LOGIN = "/api/auth/login"
SETUP = "/api/auth/setup"
LOGOUT = "/api/auth/logout"
ME = "/api/me"
LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
AUTH_DOORS = (LOGIN, SETUP, LOGOUT)
PASSWORD_DOOR = "/api/auth/password"
PEOPLE = "/api/people"
PEOPLE_UPDATE = "/api/people/update"
PEOPLE_LINK = "/api/people/link"
#: The doors with a small body that ask for a session: one's own password, and the owner's three.
SESSION_DOORS = (PASSWORD_DOOR, PEOPLE, PEOPLE_UPDATE, PEOPLE_LINK)
#: A second password the rules accept, for the door that changes one.
NEW_PASSWORD = "another horse battery staple"
DOCUMENTS = ((LEDGER, "ledger", 16 * 1024 * 1024), (PLAN, "plan", 4 * 1024 * 1024))
VENDOR = ("/money/vendor/pdf.min.js", "/money/vendor/pdf.worker.min.js", "/money/vendor/xlsx.full.min.js")
OLD_LINKS = ("/tracker/board", "/dashboard", "/money/", "/money/index.html")
JSON = {"Content-Type": "application/json"}
KIB = 1024
MIB = 1024 * 1024
EMPTY = {"rev": 0, "doc": {}, "updatedAt": None}

#: docs/api.md, "Headers on every answer".
FIXED = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Server": "money",
    "Connection": "close",
}
#: BUILD-SPEC 2.2: Money's own pages.
POLICY_OWN_PAGES = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                    "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
#: BUILD-SPEC 2.7: the vendor scripts, and JSON.
POLICY_VENDOR = "default-src 'none'; script-src 'self'"
POLICY_JSON = "default-src 'none'"
#: The design, section 2 "Response headers": the page. %s is 'sha256-<hash>' of every inline script.
POLICY_PAGE = ("default-src 'none'; script-src 'self' %s; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
               "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
               "worker-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")

TYPE_HTML = "text/html; charset=utf-8"
TYPE_JSON = "application/json; charset=utf-8"

#: Methods the server serves, by the documents: the table's three, and HEAD wherever GET is
#: (the service's stated deviation). Everything else is 405.
SERVED = ("GET", "HEAD", "POST", "PUT")
NOT_SERVED = ("OPTIONS", "DELETE", "PATCH", "TRACE", "CONNECT", "PROPFIND", "BREW")


def read(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def policy_of_the_page() -> str:
    """The page's policy as the design writes it, for ``index.html`` as it is in the checkout."""
    text = read(INDEX).decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    hashes = []
    for script in re.finditer(r"<script\b([^>]*)>(.*?)</script\s*>", text, re.DOTALL | re.IGNORECASE):
        if re.search(r"\bsrc\s*=", script.group(1), re.IGNORECASE) or not script.group(2):
            continue
        digest = hashlib.sha256(script.group(2).encode("utf-8")).digest()
        hashes.append("'sha256-%s'" % base64.b64encode(digest).decode("ascii"))
    return POLICY_PAGE % " ".join(hashes)


def documented_routes() -> List[Tuple[str, str, bool]]:
    """``(method, path, needs a session)`` for every row of the table under "## Routes" of docs/api.md."""
    text = read(API_MD).decode("utf-8")
    start = text.index("\n## Routes")
    section = text[start:text.index("\n## ", start + 1)]
    rows = re.findall(r"(?m)^\| (GET|POST|PUT) \| (/\S*) \| (yes|no) \|", section)
    assert len(rows) >= 20, "the Routes table of docs/api.md could not be read"
    return [(method, path, session == "yes") for method, path, session in rows]


def tags(markup: str, name: str) -> List[Dict[str, str]]:
    """The attributes of every ``<name ...>`` tag of ``markup``, as dicts (an attribute without a value is "")."""
    found = []
    for tag in re.finditer(r"<%s\b([^>]*)>" % re.escape(name), markup, re.IGNORECASE):
        attributes = {}
        for attribute in re.finditer(r'([^\s"=<>/]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s">]+)))?', tag.group(1)):
            value = next((group for group in attribute.groups()[1:] if group is not None), "")
            attributes[attribute.group(1).lower()] = value
        found.append(attributes)
    return found


# ---------------------------------------------------------------------------
# The wire: what http.client would hide
# ---------------------------------------------------------------------------

class Answer(NamedTuple):
    """An answer read off a raw socket."""
    status: int
    reason: str
    lines: Tuple[Tuple[str, str], ...]      # the header lines, in order, as they were sent
    body: bytes
    raw: bytes

    def all(self, name: str) -> List[str]:
        return [value for key, value in self.lines if key.lower() == name.lower()]

    def header(self, name: str) -> Optional[str]:
        values = self.all(name)
        return values[0] if values else None

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def parse(data: bytes) -> Optional[Answer]:
    """Raw bytes as an ``Answer``; None when nothing that begins like an answer came."""
    if not data.startswith(b"HTTP/1.1 "):
        return None
    top, _blank, body = data.partition(b"\r\n\r\n")
    first, *rest = top.split(b"\r\n")
    parts = first.decode("latin-1").split(" ", 2)
    lines = []
    for line in rest:
        name, _colon, value = line.decode("latin-1").partition(":")
        lines.append((name, value.strip()))
    return Answer(int(parts[1]), parts[2] if len(parts) > 2 else "", tuple(lines), body, data)


def _whole(data: bytes) -> bool:
    """Whether ``data`` holds one whole answer: its head and as much body as it announces."""
    top, blank, body = data.partition(b"\r\n\r\n")
    if not blank:
        return False
    length = re.search(rb"(?im)^Content-Length:[ \t]*(\d+)\r?$", top)
    return length is None or len(body) >= int(length.group(1))


class Wire:
    """One raw connection to a stand.

    What is waited for here - an answer, the server hanging up - is waited for ``PATIENCE`` seconds
    and comes long before: the wait is how long a failure takes, not how long the test does.
    """

    def __init__(self, stand: Any, timeout: float = PATIENCE):
        self.sock = socket.create_connection(("127.0.0.1", stand.port), timeout=timeout)
        self.received = b""
        self.ended = False      # the server closed its side

    def send(self, data: bytes) -> "Wire":
        self.sock.sendall(data)
        return self

    def done(self) -> "Wire":
        """Close the sending side: "that is all I have to say"."""
        with contextlib.suppress(OSError):
            self.sock.shutdown(socket.SHUT_WR)
        return self

    def _more(self, deadline: float) -> bool:
        left = deadline - time.monotonic()
        if left <= 0 or self.ended:
            return False
        self.sock.settimeout(left)
        try:
            chunk = self.sock.recv(65536)
        except socket.timeout:
            return False
        except OSError:
            self.ended = True
            return False
        if not chunk:
            self.ended = True
            return False
        self.received += chunk
        return True

    def answer(self, wait: float = PATIENCE) -> Optional[Answer]:
        """The answer, as soon as it is whole - without waiting for the server to hang up.
        None when the server said nothing within ``wait`` seconds, or closed without a word."""
        deadline = time.monotonic() + wait
        while not _whole(self.received) and self._more(deadline):
            pass
        return parse(self.received)

    def peek(self) -> bytes:
        """What the server has said so far, without waiting for more."""
        self.sock.setblocking(False)
        try:
            while not self.ended:
                chunk = self.sock.recv(65536)
                if not chunk:
                    self.ended = True
                self.received += chunk
        except (BlockingIOError, InterruptedError):
            pass
        except OSError:
            self.ended = True
        finally:
            self.sock.setblocking(True)
        return self.received

    def hangs_up(self, within: float = PATIENCE) -> bool:
        """Whether the server closes the connection within so many seconds."""
        deadline = time.monotonic() + within
        while self._more(deadline):
            pass
        return self.ended

    def close(self) -> None:
        with contextlib.suppress(OSError):
            self.sock.close()


def exchange(stand: Any, data: bytes, done: bool = True, wait: float = PATIENCE) -> Optional[Answer]:
    """Send ``data`` on a connection of its own and return the answer (None: closed without one)."""
    wire = Wire(stand)
    try:
        wire.send(data)
        if done:
            wire.done()
        wire.hangs_up(wait)
        return parse(wire.received)
    finally:
        wire.close()


def lines_of(stand: Any, method: str, path: str, *lines: str, cookie: Optional[str] = None,
             host: Optional[str] = None, version: str = "HTTP/1.1") -> bytes:
    """A request's head as bytes: the request line, Host, then ``lines``, then the blank line."""
    out = ["%s %s %s" % (method, path, version)]
    if host != "":
        out.append("Host: %s" % (host or stand.host))
    if cookie:
        out.append("Cookie: %s" % cookie)
    out.extend(lines)
    return ("\r\n".join(out) + "\r\n\r\n").encode("latin-1")


def comparable(answer: Any) -> Tuple[int, Tuple[Tuple[str, str], ...], bytes]:
    """An answer without the one thing that differs between two of the same kind: its Date."""
    if isinstance(answer, Answer):
        pairs = answer.lines
    else:
        pairs = tuple(answer.headers.items())
    return answer.status, tuple(sorted((key.lower(), value) for key, value in pairs if key.lower() != "date")), answer.body


class Case(unittest.TestCase):
    """A dev stand in this process, with a clock the test moves."""

    env = None      # type: Optional[Dict[str, Optional[str]]]
    tune = None     # type: Optional[Dict[str, Any]]

    def setUp(self):
        self.stand = self.new_stand(env=self.env, tune=self.tune)

    def new_stand(self, **options: Any) -> Any:
        stand = _harness.Stand(**options)
        self.addCleanup(stand.stop)
        return stand

    def server_stand(self, name: str, **options: Any) -> Any:
        """A stand with the settings of ``prod`` or ``test``: the https name, the ``__Host-`` cookie."""
        stand_in = _harness.scrypt_stand_in()
        stand_in.__enter__()
        self.addCleanup(stand_in.__exit__, None, None, None)
        env = dict(_harness.stand_changes(name))
        env.update(options.pop("env", None) or {})
        return self.new_stand(env=env, **options)

    def wire(self, data: bytes = b"", stand: Any = None) -> Wire:
        """A raw connection that has sent ``data`` and is closed when the test ends (before the stand stops)."""
        wire = Wire(stand or self.stand)
        self.addCleanup(wire.close)
        if data:
            wire.send(data)
        return wire

    def head(self, method: str, path: str, *lines: str, **options: Any) -> bytes:
        return lines_of(options.pop("stand", None) or self.stand, method, path, *lines, **options)

    def events(self, name: str, stand: Any = None) -> List[Dict[str, Any]]:
        return [line for line in (stand or self.stand).log_lines() if line.get("event") == name]

    # -- what an answer has to be --------------------------------------------

    def assertFixedHeaders(self, answer: Any, what: str = "") -> None:
        """The eight headers of every answer, each exactly once, and a policy that begins by forbidding everything."""
        for name, value in FIXED.items():
            self.assertEqual(answer.all(name), [value], "%s: %s" % (what, name))
        policies = answer.all("Content-Security-Policy")
        self.assertEqual(len(policies), 1, "%s: one Content-Security-Policy" % what)
        self.assertTrue(policies[0].startswith("default-src 'none'"), "%s: %s" % (what, policies[0]))
        self.assertEqual(answer.all("Content-Security-Policy-Report-Only"), [], what)
        self.assertEqual(len(answer.all("Date")), 1, "%s: Date" % what)
        self.assertEqual(len(answer.all("Cache-Control")), 1, "%s: Cache-Control" % what)
        names = [name.lower() for name in (answer.headers.keys() if hasattr(answer, "headers")
                                           else [key for key, _value in answer.lines])]
        for name in names:
            self.assertFalse(name.startswith("access-control-"), "%s: no CORS header exists anywhere (%s)" % (what, name))
        for edge_only in ("strict-transport-security", "x-robots-tag"):
            self.assertNotIn(edge_only, names, "%s: that header is the edge's" % what)
        for telling in ("x-powered-by", "via", "www-authenticate"):
            self.assertNotIn(telling, names, what)

    def assertRefused(self, answer: Any, status: int, code: Optional[str] = None, extra: Sequence[str] = (),
                      what: str = "") -> Dict[str, Any]:
        """A refusal: the status, JSON ``{"error": code, "message": a sentence}`` and nothing more, never cached."""
        self.assertIsNotNone(answer, "%s: the server answered nothing" % what)
        self.assertEqual(answer.status, status, "%s: %r" % (what, answer.body[:200]))
        self.assertEqual(answer.header("Content-Type"), TYPE_JSON, what)
        said = answer.json()
        self.assertIsInstance(said, dict, what)
        if code is not None:
            self.assertEqual(said.get("error"), code, what)
        self.assertRegex(said.get("error", ""), r"^[a-z][a-z_]*$", what)
        self.assertIsInstance(said.get("message"), str, what)
        self.assertRegex(said["message"], r"^[^\x00-\x1f\x7f]{8,300}$", "%s: a fixed sentence" % what)
        self.assertEqual(sorted(said), sorted(["error", "message"] + list(extra)), what)
        self.assertEqual(answer.header("Cache-Control"), "no-store", what)
        self.assertEqual(answer.header("Content-Security-Policy"), POLICY_JSON, what)
        self.assertIsNone(answer.header("Location"), what)
        return said

    def assertToLogin(self, answer: Any, what: str = "") -> None:
        """302 to /login, and not a word more."""
        self.assertIsNotNone(answer, what)
        self.assertEqual((answer.status, answer.header("Location"), answer.body), (302, "/login", b""), what)

    def assertNothingStored(self, stand: Any = None) -> None:
        stand = stand or self.stand
        cookie = stand.session("vanya")
        for path in (LEDGER, PLAN):
            self.assertEqual(stand.get(path, cookie=cookie).json(), EMPTY, "%s was written" % path)


# ---------------------------------------------------------------------------
# Every row of docs/api.md, without a session and with one
# ---------------------------------------------------------------------------

class EveryRouteTests(Case):
    """Each row of the document's table gives the status, the type and the headers the documents promise."""

    def own_page(self, answer: Any, state: Optional[str] = None) -> None:
        self.assertEqual(answer.status, 200)
        self.assertEqual(answer.header("Content-Type"), TYPE_HTML)
        self.assertEqual(answer.header("Cache-Control"), "no-store")
        self.assertEqual(answer.header("Content-Security-Policy"), POLICY_OWN_PAGES)
        self.assertIsNone(answer.header("Location"))
        self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertTrue(answer.text.lstrip().lower().startswith("<!doctype html>"))
        if state is not None:
            self.assertIn('data-state="%s"' % state, answer.text)

    def a_file(self, answer: Any, content_type: str, body: bytes) -> None:
        self.assertEqual(answer.status, 200)
        self.assertTrue(answer.header("Content-Type").startswith(content_type), answer.header("Content-Type"))
        self.assertEqual(answer.header("Cache-Control"), "no-cache")
        self.assertEqual(answer.header("Content-Length"), str(len(body)))
        self.assertEqual(hashlib.sha256(answer.body).hexdigest(), hashlib.sha256(body).hexdigest())

    def json_answer(self, answer: Any, status: int = 200) -> Any:
        self.assertEqual(answer.status, status, answer.body[:200])
        self.assertEqual(answer.header("Content-Type"), TYPE_JSON)
        self.assertEqual(answer.header("Cache-Control"), "no-store")
        self.assertEqual(answer.header("Content-Security-Policy"), POLICY_JSON)
        return answer.json()

    def the_same_for_everybody(self, method: str, path: str, cookie: Optional[str]) -> bool:
        """The rows that answer alike whoever asks. True when this was one of them."""
        stand = self.stand
        if (method, path) == ("GET", "/set-password"):
            self.own_page(stand.get(path, cookie=cookie))
        elif (method, path) == ("GET", "/logout"):
            self.assertToLogin(stand.get(path, cookie=cookie))
        elif (method, path) == ("GET", "/assets/auth.js"):
            self.a_file(stand.get(path, cookie=cookie), "text/javascript",
                        read(os.path.join(CHECKOUT, "moneyd", "assets", "auth.js")))
        elif (method, path) == ("GET", "/assets/auth.css"):
            self.a_file(stand.get(path, cookie=cookie), "text/css",
                        read(os.path.join(CHECKOUT, "moneyd", "assets", "auth.css")))
        elif (method, path) == ("GET", "/robots.txt"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual(answer.status, 200)
            self.assertTrue(answer.header("Content-Type").startswith("text/plain"))
            self.assertEqual([line.strip() for line in answer.text.splitlines() if line.strip()],
                             ["User-agent: *", "Disallow: /"], "it disallows everything")
        elif (method, path) == ("GET", "/favicon.ico"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual((answer.status, answer.body), (204, b""))
        elif (method, path) == ("GET", "/healthz"):
            answer = stand.get(path, cookie=cookie)         # the tests are a loopback peer
            self.assertEqual((answer.status, answer.body.strip()), (200, b"ok"))
            self.assertTrue(answer.header("Content-Type").startswith("text/plain"))
        else:
            return False
        return True

    def test_every_row_answers_a_stranger_as_the_documents_say(self):
        stand = self.stand
        stand.set_password("mika")
        for method, path, session in documented_routes():
            with self.subTest(route="%s %s" % (method, path)):
                if session:
                    answer = stand.request(method, path, {"base": 0, "doc": ledger()} if method == "PUT" else None)
                    if path.startswith("/api/") or path in VENDOR:
                        self.assertRefused(answer, 401, "unauthenticated")
                    else:
                        self.assertToLogin(answer)
                    self.assertEqual(answer.all("Set-Cookie"), [])
                elif self.the_same_for_everybody(method, path, None):
                    pass
                elif (method, path) == ("GET", "/login"):
                    self.own_page(stand.get(path), "form")
                elif (method, path) == ("POST", LOGIN):
                    answer = stand.post(path, {"login": "mika", "password": "not " + PASSWORD})
                    self.assertRefused(answer, 401, "invalid_credentials")
                    self.assertEqual(answer.all("Set-Cookie"), [])
                elif (method, path) == ("POST", SETUP):
                    answer = stand.post(path, {"token": "t" * 43, "password": PASSWORD})
                    self.assertRefused(answer, 404, "invalid_link")
                    self.assertEqual(answer.all("Set-Cookie"), [])
                elif (method, path) == ("POST", LOGOUT):
                    answer = stand.post(path, {})
                    self.assertEqual(self.json_answer(answer), {"ok": True})
                    self.assertEqual(answer.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
                    self.assertEqual(answer.header("Clear-Site-Data"), '"cache"')
                else:
                    self.fail("docs/api.md has a row this test knows nothing about")
        self.assertNothingStored()

    def test_every_row_answers_a_founder_as_the_documents_say(self):
        stand = self.stand
        stand.set_password("mika")
        page = read(INDEX)
        for method, path, _session in documented_routes():
            with self.subTest(route="%s %s" % (method, path)):
                cookie = stand.session("mika")
                if self.the_same_for_everybody(method, path, cookie):
                    pass
                elif (method, path) == ("GET", "/login"):
                    answer = stand.get(path, cookie=cookie)
                    self.own_page(answer, "signed-in")
                    self.assertIn("Вы вошли как Mika", answer.text)
                elif (method, path) == ("POST", LOGIN):
                    answer = stand.post(path, {"login": "mika", "password": PASSWORD}, cookie=cookie)
                    self.assertEqual(self.json_answer(answer), {"ok": True, "firstName": "Mika"})
                    fresh = answer.cookie("money-dev")
                    self.assertEqual(answer.all("Set-Cookie"),
                                     ["%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" % fresh])
                    self.assertNotEqual(fresh, cookie, "a fresh session is always issued")
                    self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")   # the presented one is deleted
                    self.assertEqual(stand.get(ME, cookie=fresh).status, 200)
                elif (method, path) == ("POST", SETUP):
                    answer = stand.post(path, {"token": stand.invite("misha"), "password": PASSWORD}, cookie=cookie)
                    # The login goes back with the answer: the page that set the password says what to type at the next sign-in.
                    self.assertEqual(self.json_answer(answer), {"ok": True, "firstName": "Misha", "login": "misha"})
                    fresh = answer.cookie("money-dev")
                    self.assertEqual(answer.all("Set-Cookie"),
                                     ["%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" % fresh])
                    self.assertEqual(stand.get(ME, cookie=fresh).json()["firstName"], "Misha")
                elif (method, path) == ("POST", LOGOUT):
                    answer = stand.post(path, {}, cookie=cookie)
                    self.assertEqual(self.json_answer(answer), {"ok": True})
                    self.assertEqual(answer.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
                    self.assertEqual(answer.header("Clear-Site-Data"), '"cache"')
                    self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
                elif path in ("/", "/index.html"):
                    answer = stand.get(path, cookie=cookie)
                    self.a_file(answer, TYPE_HTML, page)
                    self.assertEqual(answer.header("Content-Type"), TYPE_HTML)
                    self.assertEqual(answer.header("Vary"), "Cookie")
                    self.assertIsNotNone(email.utils.parsedate_to_datetime(answer.header("Last-Modified")))
                    self.assertEqual(answer.header("Content-Security-Policy"), policy_of_the_page())
                elif path in VENDOR:
                    answer = stand.get(path, cookie=cookie)
                    self.a_file(answer, "text/javascript", read(os.path.join(CHECKOUT, "vendor", path.rsplit("/", 1)[1])))
                    self.assertEqual(answer.header("Content-Security-Policy"), POLICY_VENDOR)
                elif path == "/data":
                    self.own_page(stand.get(path, cookie=cookie))
                elif path == ME:
                    self.assertEqual(self.json_answer(stand.get(path, cookie=cookie)),
                                     {"id": "mika", "name": "Mika", "firstName": "Mika", "isFounderTier": True,
                                      "role": "owner", "canWrite": True, "canManage": True,
                                      "stand": "dev", "version": "dev"})
                elif (method, path) == ("POST", PASSWORD_DOOR):
                    answer = stand.post(path, {"current": PASSWORD, "password": NEW_PASSWORD}, cookie=cookie)
                    self.assertEqual(self.json_answer(answer), {"ok": True})
                    fresh = answer.cookie("money-dev")
                    self.assertEqual(answer.all("Set-Cookie"),
                                     ["%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" % fresh])
                    self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")   # every sign-in before it is closed
                    self.assertEqual(stand.get(ME, cookie=fresh).status, 200)
                    self.assertRefused(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}), 401, "invalid_credentials")
                    self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": NEW_PASSWORD}).status, 200)
                    stand.set_password("mika")          # the rows after this one sign in with the password of the tests
                elif (method, path) == ("GET", PEOPLE):
                    listed = self.json_answer(stand.get(path, cookie=cookie))
                    self.assertEqual(sorted(listed), ["max", "people"])
                    self.assertEqual([(p["login"], p["role"], p["me"]) for p in listed["people"]][:3],
                                     [("mika", "owner", True), ("misha", "reader", False), ("vanya", "reader", False)])
                elif (method, path) == ("POST", PEOPLE):
                    listed = self.json_answer(stand.post(path, {"login": "anna", "name": "Anna"}, cookie=cookie))
                    self.assertEqual({p["login"]: (p["name"], p["role"], p["hasPassword"], p["added"]) for p in listed["people"]}["anna"],
                                     ("Anna", "reader", False, True))
                elif (method, path) == ("POST", PEOPLE_UPDATE):
                    listed = self.json_answer(stand.post(path, {"login": "vanya", "role": "editor"}, cookie=cookie))
                    self.assertEqual({p["login"]: p["role"] for p in listed["people"]}["vanya"], "editor")
                elif (method, path) == ("POST", PEOPLE_LINK):
                    answer = self.json_answer(stand.post(path, {"login": "vanya", "password": PASSWORD}, cookie=cookie))
                    self.assertEqual(sorted(answer), ["expires", "link", "login"])
                    self.assertRegex(answer["link"], r"^http://finance\.localhost:\d+/set-password#t=[A-Za-z0-9_-]{43}$")
                elif (method, path) in (("GET", LEDGER), ("GET", PLAN)):
                    answer = stand.get(path, cookie=cookie)
                    self.assertEqual(self.json_answer(answer), EMPTY)
                    self.assertEqual(list(answer.json()), ["rev", "doc", "updatedAt"], "exactly {rev, doc, updatedAt}")
                elif (method, path) in (("PUT", LEDGER), ("PUT", PLAN)):
                    text = ledger(4, note="как есть") if path == LEDGER else plan(3)
                    answer = stand.put(path, {"base": 0, "doc": text}, cookie=cookie)
                    self.assertEqual(self.json_answer(answer), {"rev": 1})
                    stored = stand.get(path, cookie=cookie)
                    self.assertEqual(stored.json(), {"rev": 1, "doc": json.loads(text), "updatedAt": "2026-10-07T12:00:00.000Z"})
                    self.assertEqual(list(stored.json()), ["rev", "doc", "updatedAt"])
                    self.assertIn(text.encode("utf-8"), stored.body, "the document comes back text for text")
                elif path in OLD_LINKS:
                    answer = stand.get(path, cookie=cookie)
                    self.assertEqual((answer.status, answer.header("Location"), answer.body), (302, "/", b""))
                else:
                    self.fail("docs/api.md has a row this test knows nothing about")

    def test_get_logout_changes_nothing_by_itself(self):
        cookie = self.stand.session("mika")
        self.assertToLogin(self.stand.get("/logout", cookie=cookie))
        self.assertEqual(self.stand.get("/logout", cookie=cookie).all("Set-Cookie"), [])
        self.assertEqual(self.stand.get(ME, cookie=cookie).status, 200)

    def test_one_document_never_touches_the_revision_of_the_other(self):
        stand = self.stand
        cookie = stand.session("mika")
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie).json(), {"rev": 1})
        self.assertEqual(stand.put(LEDGER, {"base": 1, "doc": ledger(5)}, cookie=cookie).json(), {"rev": 2})
        self.assertEqual(stand.get(PLAN, cookie=cookie).json(), EMPTY)
        self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan()}, cookie=cookie).json(), {"rev": 1})
        self.assertEqual(stand.get(LEDGER, cookie=cookie).json()["rev"], 2)

    def test_the_base_of_a_save_is_a_whole_number_however_json_writes_it_and_nothing_else(self):
        stand = self.stand
        cookie = stand.session("mika")
        text = json.dumps(ledger()).encode("ascii")

        def save(base: bytes) -> Any:
            return stand.put(LEDGER, body=b'{"base":' + base + b',"doc":' + text + b"}", cookie=cookie, headers=JSON)

        self.assertEqual(save(b"0").json(), {"rev": 1})
        self.assertEqual(save(b"1.0").json(), {"rev": 2}, "3 and 3.0 are the same revision")
        self.assertEqual(save(b"2e0").json(), {"rev": 3})
        for base in (b"true", b"false", b'"3"', b"null", b"-1", b"2.5", b"3.5", b"[3]", b'{"n":3}', b'""', b"1e400"):
            with self.subTest(base=base):
                self.assertRefused(save(base), 400, "bad_money_doc")
        self.assertRefused(stand.put(LEDGER, {"doc": ledger()}, cookie=cookie), 400, "bad_money_doc")
        self.assertEqual(stand.get(LEDGER, cookie=cookie).json()["rev"], 3)

    def test_the_doc_of_a_save_is_a_string_of_json_that_holds_this_doors_document(self):
        stand = self.stand
        cookie = stand.session("mika")
        refused = {
            LEDGER: [json.loads(ledger()), None, 7, True, ["{}"], "", "not json", "[1, 2]", '"a string"', "12", "null",
                     "{}", '{"banks":[]}', '{"tx":{}}', '{"tx":"[]"}', '{"tx":null}', '{"tx":[],"x":NaN}',
                     '{"tx":[],"x":Infinity}', '{"tx":[]', plan()],
            PLAN: [json.loads(plan()), None, 7, "", "not json", "[]", "{}", '{"tx":[]}', '{"banks":{}}',
                   '{"banks":7}', '{"banks":[],"x":-Infinity}', ledger()],
        }
        for path, docs in refused.items():
            for doc in docs:
                with self.subTest(path=path, doc=str(doc)[:30]):
                    self.assertRefused(stand.put(path, {"base": 0, "doc": doc}, cookie=cookie), 400, "bad_money_doc")
            self.assertRefused(stand.put(path, {"base": 0}, cookie=cookie), 400, "bad_money_doc")
            self.assertEqual(stand.get(path, cookie=cookie).json(), EMPTY)
        # Nothing but that one member is looked at: what the server has never heard of comes back untouched.
        text = '{"tx":[],"future":{"a":[1,2.50,"x"]},  "v":99,"пробел":  "как есть"}'
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": text}, cookie=cookie).json(), {"rev": 1})
        self.assertIn(text.encode("utf-8"), stand.get(LEDGER, cookie=cookie).body)

    def test_a_stale_save_is_409_with_the_stored_revision_and_writes_nothing(self):
        stand = self.stand
        cookie = stand.session("mika")
        for path, text, newer in ((LEDGER, ledger(3), ledger(9)), (PLAN, plan(2), plan(5))):
            with self.subTest(door=path):
                self.assertEqual(stand.put(path, {"base": 0, "doc": text}, cookie=cookie).status, 200)
                before = stand.get(path, cookie=cookie).body
                for base in (0, 2, 99):
                    said = self.assertRefused(stand.put(path, {"base": base, "doc": newer}, cookie=cookie),
                                              409, "money_stale", extra=("rev",))
                    self.assertEqual(said["rev"], 1)
                self.assertEqual(stand.get(path, cookie=cookie).body, before)


# ---------------------------------------------------------------------------
# What a stranger is told
# ---------------------------------------------------------------------------

class StrangerTests(Case):
    def test_under_api_a_stranger_is_told_401_as_json_and_never_html_or_a_redirect(self):
        stand = self.stand
        paths = [path for _method, path, session in documented_routes() if session and path.startswith("/api/")]
        paths += ["/api/", "/api/nothing", "/api/auth", "/api/auth/", "/api/auth/login/", "/api/auth/nothing",
                  "/api/founder", "/api/founder/money/", "/api/founder/money/cash/", "/api/founder/money/snapshots",
                  "/api/me/", "/api/users", "/api/data", "/api/healthz", "/api/../login", "/api/%2e%2e/login",
                  "/api/me?next=/login", "/api//me"]
        for path in dict.fromkeys(paths):
            for method in ("GET", "POST", "PUT"):
                with self.subTest(method=method, path=path):
                    answer = exchange(stand, self.head(method, path, "Origin: " + stand.origin,
                                                       "Content-Type: application/json", "Content-Length: 2") + b"{}")
                    self.assertRefused(answer, 401, "unauthenticated")
                    self.assertNotIn(b"<", answer.body, "never HTML")
            with self.subTest(method="HEAD", path=path):
                answer = exchange(stand, self.head("HEAD", path))
                self.assertEqual((answer.status, answer.body, answer.header("Location")), (401, b"", None))
                self.assertEqual(answer.header("Content-Type"), TYPE_JSON)

    def test_everywhere_else_a_stranger_is_sent_to_login(self):
        stand = self.stand
        paths = [path for _method, path, session in documented_routes()
                 if session and not path.startswith("/api/") and path not in VENDOR]
        paths += ["/nothing", "/index.htm", "/data/", "/money", "/money/vendor/", "/money/vendor/other.js",
                  "/money/vendor/pdf.min.js.map", "/assets/", "/assets/other.js", "/login/", "/logout/",
                  "/set-password/x", "/api", "/apiary", "/API/me", "/healthz/", "/favicon.png", "/robots.txt.bak",
                  "/?next=https://evil.example/", "/index.html?x=1"]
        for path in dict.fromkeys(paths):
            for method in ("GET", "HEAD", "POST", "PUT"):
                with self.subTest(method=method, path=path):
                    answer = exchange(stand, self.head(method, path))
                    self.assertToLogin(answer)
                    self.assertEqual(answer.all("Set-Cookie"), [])

    def test_a_stranger_cannot_tell_a_path_that_exists_from_one_that_does_not(self):
        # Whatever a stranger adds to the request, a door behind the session and a path that was
        # never there give the same answer, byte for byte (the Date aside).
        stand = self.stand
        ways = {
            "plain": (),
            "a body": ("Origin: " + stand.origin, "Content-Type: application/json", "Content-Length: 2"),
            "a foreign origin": ("Origin: https://evil.example", "Sec-Fetch-Site: cross-site",
                                 "Content-Type: text/plain", "Content-Length: 2"),
            "no length": ("Origin: " + stand.origin, "Content-Type: application/json"),
            "far too long": ("Origin: " + stand.origin, "Content-Type: application/json",
                             "Content-Length: 99999999"),
            "a held copy": ("If-Modified-Since: Wed, 07 Oct 2026 12:00:00 GMT",),
            "a session that never was": ("Cookie: money-dev=" + "A" * 43,),
        }
        for method, path, session in documented_routes():
            if not session:
                continue
            twin = "/api/no-such-door" if path.startswith("/api/") or path in VENDOR else "/no-such-page"
            for verb in SERVED:
                for way, lines in ways.items():
                    with self.subTest(path=path, method=verb, way=way):
                        body = b"{}" if "Content-Length: 2" in lines else b""
                        real = exchange(stand, self.head(verb, path, *lines) + body)
                        made_up = exchange(stand, self.head(verb, twin, *lines) + body)
                        self.assertIsNotNone(real)
                        self.assertIn(real.status, (401, 302))
                        self.assertEqual(comparable(real), comparable(made_up))

    def test_a_cookie_that_is_no_session_is_no_cookie_at_all(self):
        stand = self.stand
        ended = stand.session("mika")
        self.assertEqual(stand.post(LOGOUT, {}, cookie=ended).status, 200)
        token = stand.token_of(stand.session("misha"))
        for cookie in ("money-dev=" + "A" * 43, "money-dev=", "money-dev=short", "money-dev=" + "é" * 30, ended,
                       "__Host-money=" + token, "session=" + token, "MONEY-DEV=" + token, "money-dev =" + token + "x",
                       "money-dev=" + token + "x", "money-dev=x" + token, "money-dev=" + token[:-1],
                       'money-dev="' + token + '"'):
            with self.subTest(cookie=cookie.split("=")[0] + "=..."):
                self.assertRefused(exchange(stand, self.head("GET", ME, cookie=cookie)), 401, "unauthenticated")
                self.assertToLogin(exchange(stand, self.head("GET", "/", cookie=cookie)))
        self.assertEqual(stand.get(ME, cookie="other=1; money-dev=" + token + "; more=2").status, 200,
                         "the session cookie is found among others")
        # "Nothing else identifies a caller."
        for lines in (("Authorization: Bearer " + token,), ("Authorization: Basic bWlrYTp4",), ("X-Session: " + token,),
                      ("X-Auth-Token: " + token,), ("Money-Dev: " + token,), ("X-Forwarded-User: mika",),
                      ("Remote-User: mika",), ("Set-Cookie: money-dev=" + token,)):
            with self.subTest(header=lines[0].split(":")[0]):
                self.assertRefused(exchange(stand, self.head("GET", ME, *lines)), 401, "unauthenticated")
        for path in (ME + "?money-dev=" + token, ME + "?session=" + token, ME + ";money-dev=" + token):
            self.assertRefused(exchange(stand, self.head("GET", path)), 401, "unauthenticated")

    def test_head_is_held_to_what_get_is_held_to(self):
        stand = self.stand
        cookie = stand.session("mika")
        for method, path, session in documented_routes():
            if method != "GET":
                continue
            with self.subTest(path=path):
                for who in (None, cookie):
                    got = stand.get(path, cookie=who)
                    asked = stand.request("HEAD", path, cookie=who)
                    self.assertEqual((asked.status, asked.body), (got.status, b""))
                    self.assertEqual(asked.header("Location"), got.header("Location"))
                    self.assertEqual(asked.header("Content-Type"), got.header("Content-Type"))
                    self.assertEqual(asked.header("Content-Security-Policy"), got.header("Content-Security-Policy"))
                    if got.status == 200:
                        self.assertEqual(asked.header("Content-Length"), str(len(got.body)))


# ---------------------------------------------------------------------------
# Nothing but the table is ever served
# ---------------------------------------------------------------------------

class NothingElseIsServedTests(Case):
    #: Files that exist in the checkout or in a data directory, and ways of spelling a path to them.
    FILES = (
        "/server.py", "/.git/config", "/.git/HEAD", "/.gitignore", "/.dockerignore", "/README.md", "/CLAUDE.md",
        "/package.json", "/docs/api.md", "/docs/security.md", "/deploy/compose.yml", "/deploy/stands/prod.env",
        "/moneyd/auth.py", "/moneyd/httpd.py", "/moneyd/__main__.py", "/moneyd/pages/login.html",
        "/moneyd/assets/auth.js", "/pages/login.html", "/pages/data.html", "/tests/_harness.py",
        "/scripts/money-demo.mjs", "/vendor/pdf.min.js", "/vendor/", "/index.html/..", "/index.html/.",
        "/index.html/", "/index.html%00", "/index.html%20", "/INDEX.HTML", "/Index.html", "/./index.html",
        "//index.html", "/%69ndex.html", "/index%2ehtml",
        "/data/ledger/current.json", "/data/plan/current.json", "/data/auth/users.json", "/data/auth/sessions.json",
        "/data/security.log", "/data/STAND", "/ledger/current.json", "/plan/current.json", "/auth/users.json",
        "/auth/sessions.json", "/security.log", "/STAND", "/data/ledger/", "/data/ledger/snapshots/",
        "/data/", "/data/.", "/data/..", "/data%2fledger%2fcurrent.json", "/data/ledger%2Fcurrent.json",
        "/../server.py", "/..%2fserver.py", "/%2e%2e/server.py", "/%2e%2e%2fserver.py", "/..;/server.py",
        "/..\\server.py", "/%5c..%5cserver.py", "/.%2e/.%2e/etc/passwd", "/../../../../etc/passwd",
        "/money/vendor/../../server.py", "/money/vendor/..%2f..%2fserver.py", "/money/vendor/%2e%2e/%2e%2e/server.py",
        "/money/vendor/pdf.min.js/../../../server.py", "/money/vendor/./pdf.min.js", "/money/vendor//pdf.min.js",
        "/money/vendor/pdf.min.js/", "/money/vendor/pdf.min.js%00.html", "/money/vendor/PDF.MIN.JS",
        "/money/vendor/pdf%2emin%2ejs", "/money%2fvendor%2fpdf.min.js",
        "/assets/../moneyd/auth.py", "/assets/..%2fauth.py", "/assets/auth.js/../../config.py", "/assets/auth.js/",
        "/assets/auth.js.map", "/assets/AUTH.JS", "/assets/auth%2ejs", "/assets//auth.js", "/assets/./auth.js",
        "/login/../server.py", "/login/..", "/login%2f..%2fserver.py", "/api/../server.py", "/api/%2e%2e/server.py",
        "/api/founder/money/../../../server.py", "/api/founder/money/current.json",
        "file:///etc/passwd", "http://127.0.0.1/server.py", "*",
    )
    #: A sentence that is in the ledger a founder saved, and in nothing the server may send a stranger.
    MARK = "ONLY-IN-THE-LEDGER-7f3a"

    def setUp(self):
        super().setUp()
        self.cookie = self.stand.session("mika")
        saved = self.stand.put(LEDGER, {"base": 0, "doc": ledger(2, note=self.MARK)}, cookie=self.cookie)
        self.assertEqual(saved.status, 200)
        self.assertTrue(os.path.isfile(os.path.join(self.stand.data_dir, "ledger", "current.json")))

    def test_no_file_of_the_checkout_or_of_the_data_directory_is_served_to_a_stranger(self):
        for path in self.FILES:
            with self.subTest(path=path):
                answer = exchange(self.stand, self.head("GET", path))
                self.assertIsNotNone(answer)
                self.assertIn(answer.status, (302, 401))
                if answer.status == 302:
                    self.assertToLogin(answer)
                else:
                    self.assertTrue(path.startswith("/api/"))
                    self.assertRefused(answer, 401, "unauthenticated")
                self.assertNotIn(self.MARK.encode("ascii"), answer.raw)

    def test_no_file_of_the_checkout_or_of_the_data_directory_is_served_to_a_founder(self):
        for path in self.FILES:
            for method in ("GET", "HEAD"):
                with self.subTest(method=method, path=path):
                    answer = exchange(self.stand, self.head(method, path, cookie=self.cookie))
                    if method == "HEAD":
                        self.assertEqual((answer.status, answer.body), (404, b""))
                    else:
                        self.assertRefused(answer, 404, "not_found")
                    self.assertNotIn(self.MARK.encode("ascii"), answer.raw)

    def test_a_path_is_matched_whole_and_never_by_prefix_letter_case_or_decoding(self):
        stand = self.stand
        doors = {path for _method, path, _session in documented_routes()}
        for path in sorted(doors - {"/"}):
            encoded = "/%%%02x%s" % (ord(path[1]), path[2:])            # its first letter, percent-encoded
            for variant in (path + "/", path + "/x", path + "%2f", path + "%00", path + ";x=1", path + ".json",
                            path + path[-1], path[:-1], path.upper(), "/" + path, "/." + path, encoded):
                if variant in doors:
                    continue
                with self.subTest(path=variant):
                    self.assertRefused(exchange(stand, self.head("GET", variant, cookie=self.cookie)), 404, "not_found")
                    stranger = exchange(stand, self.head("GET", variant))
                    if variant.startswith("/api/"):
                        self.assertRefused(stranger, 401, "unauthenticated")
                    else:
                        self.assertToLogin(stranger)

    def test_a_query_is_never_part_of_what_is_matched(self):
        # The page is opened from links that carry a query; whatever follows the "?" opens no other door.
        stand = self.stand
        for query in ("?x=1", "?/../server.py", "?path=/data/ledger/current.json", "?", "?%00", "?a=b&c=d#e"):
            with self.subTest(query=query):
                self.assertEqual(exchange(stand, self.head("GET", "/login" + query)).status, 200)
                self.assertToLogin(exchange(stand, self.head("GET", "/" + query)))
                answer = exchange(stand, self.head("GET", "/" + query, cookie=self.cookie))
                self.assertEqual(hashlib.sha256(answer.body).hexdigest(), hashlib.sha256(read(INDEX)).hexdigest())
                self.assertRefused(exchange(stand, self.head("GET", "/server.py" + query, cookie=self.cookie)), 404, "not_found")

    def test_a_founder_is_told_404_not_found_for_a_path_that_is_not_in_the_table(self):
        stand = self.stand
        for path in ("/nothing", "/api/nothing", "/api/", "/api", "/money", "/money/vendor/", "/money/vendor/other.js",
                     "/assets/", "/login/", "/data/x", "/api/founder/money/cash/x", "/api/auth/login/x", "/favicon.png"):
            for method in ("GET", "POST", "PUT"):
                with self.subTest(method=method, path=path):
                    answer = stand.request(method, path, {} if method != "GET" else None, cookie=self.cookie)
                    self.assertRefused(answer, 404, "not_found")
        self.assertEqual(stand.get(LEDGER, cookie=self.cookie).json()["rev"], 1)

    def test_the_health_check_is_a_path_that_does_not_exist_for_anyone_the_edge_speaks_for(self):
        # "Through the edge it behaves like a path that does not exist": the edge always says whom it speaks for.
        stand = self.new_stand(env={"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"})
        cookie = stand.session("mika")
        through_the_edge = {"X-Forwarded-For": "203.0.113.9"}
        self.assertEqual(stand.get("/healthz").status, 200)
        for method in SERVED:
            with self.subTest(method=method):
                answer = stand.request(method, "/healthz", headers=through_the_edge, origin=None)
                twin = stand.request(method, "/no-such-page", headers=through_the_edge, origin=None)
                self.assertEqual(comparable(answer), comparable(twin))
                self.assertEqual(answer.status, 302)
                founder = stand.request(method, "/healthz", headers=through_the_edge, cookie=cookie, origin=None)
                self.assertEqual(founder.status, 404)


# ---------------------------------------------------------------------------
# Methods
# ---------------------------------------------------------------------------

class MethodTests(Case):
    def test_a_method_the_server_does_not_serve_is_405_on_every_path_for_everybody(self):
        stand = self.stand
        cookie = stand.session("mika")
        paths = [path for _method, path, _session in documented_routes()] + ["/nothing", "/api/nothing", "*"]
        for method in NOT_SERVED:
            for path in dict.fromkeys(paths):
                for who in (None, cookie):
                    with self.subTest(method=method, path=path, founder=who is not None):
                        answer = exchange(stand, self.head(method, path, cookie=who))
                        self.assertRefused(answer, 405, "method_not_allowed")
                        self.assertEqual(answer.all("Allow"), ["GET, HEAD, POST, PUT"])
                        self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)

    def test_options_is_405_and_a_preflight_is_never_granted(self):
        stand = self.stand
        cookie = stand.session("mika")
        for path in (LEDGER, PLAN, LOGIN, LOGOUT, ME, "/", "/login", "*"):
            for origin in ("https://evil.example", stand.origin):
                with self.subTest(path=path, origin=origin):
                    answer = exchange(stand, self.head(
                        "OPTIONS", path, "Origin: " + origin, "Access-Control-Request-Method: PUT",
                        "Access-Control-Request-Headers: content-type", cookie=cookie))
                    self.assertRefused(answer, 405, "method_not_allowed")
                    self.assertFixedHeaders(answer)         # which also says: no Access-Control-* header

    def test_a_door_under_a_method_it_does_not_have_is_405_and_names_the_methods_it_has(self):
        stand = self.stand
        cookie = stand.session("mika")
        doors = {}  # type: Dict[str, set]
        for method, path, _session in documented_routes():
            doors.setdefault(path, set()).add(method)
        for path, methods in doors.items():
            has = sorted(methods | ({"HEAD"} if "GET" in methods else set()))
            for verb in SERVED:
                if verb in has:
                    continue
                with self.subTest(path=path, method=verb):
                    answer = stand.request(verb, path, {} if verb in ("POST", "PUT") else None, cookie=cookie)
                    if verb == "HEAD":
                        self.assertEqual((answer.status, answer.body), (405, b""))
                    else:
                        self.assertRefused(answer, 405, "method_not_allowed")
                    self.assertEqual(answer.all("Allow"), [", ".join(has)])
                    self.assertEqual(answer.all("Set-Cookie"), [])
        # ... and none of it did anything: the session lives, nothing was stored.
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        self.assertNothingStored()

    def test_a_stranger_is_told_405_only_where_a_stranger_may_know_the_path(self):
        stand = self.stand
        for method, path, session in documented_routes():
            for verb in ("GET", "POST", "PUT"):
                if verb == method or (verb, path) in [(m, p) for m, p, _s in documented_routes()]:
                    continue
                with self.subTest(path=path, method=verb):
                    answer = stand.request(verb, path, {} if verb != "GET" else None)
                    if session:
                        self.assertIn(answer.status, (401, 302), "a door behind the session tells a stranger nothing")
                        self.assertIsNone(answer.header("Allow"))
                    else:
                        self.assertRefused(answer, 405, "method_not_allowed")
                        self.assertIsNotNone(answer.header("Allow"))


# ---------------------------------------------------------------------------
# Host
# ---------------------------------------------------------------------------

class HostTests(Case):
    def requests(self, cookie: str) -> List[Tuple[str, str, Optional[str], Tuple[str, ...]]]:
        body = ("Origin: " + self.stand.origin, "Content-Type: application/json", "Content-Length: 2")
        return [("GET", "/login", None, ()), ("GET", "/", cookie, ()), ("GET", ME, cookie, ()),
                ("GET", "/robots.txt", None, ()), ("GET", "/healthz", None, ()), ("HEAD", "/login", None, ()),
                ("POST", LOGIN, None, body), ("PUT", LEDGER, cookie, body), ("DELETE", "/login", None, ()),
                ("GET", "/nothing", None, ())]

    def test_any_host_but_the_stands_own_is_421(self):
        stand = self.stand
        cookie = stand.session("mika")
        name, port = stand.host.rsplit(":", 1)
        others = ["evil.example", "evil.example:" + port, name, name + ":1", name + ":0" + port, name + ".:" + port,
                  "x." + stand.host, stand.host + ".evil.example", "evil.example@" + stand.host,
                  "127.0.0.1:" + port, "localhost:" + port, "[::1]:" + port, stand.host + ",evil.example",
                  stand.host + " evil.example", "http://" + stand.host, stand.host + "/", ""]
        for host in others:
            for method, path, who, more in self.requests(cookie):
                with self.subTest(host=host, method=method, path=path):
                    answer = exchange(stand, self.head(method, path, "Host: " + host, *more, cookie=who, host="")
                                      + (b"{}" if more else b""))
                    if method == "HEAD":
                        self.assertEqual((answer.status, answer.body), (421, b""))
                    else:
                        self.assertRefused(answer, 421, "misdirected")
                    self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertNothingStored()

    def test_the_host_is_the_stands_own_whatever_the_letter_case(self):
        stand = self.stand
        for host in (stand.host, stand.host.upper(), stand.host.title()):
            with self.subTest(host=host):
                self.assertEqual(exchange(stand, self.head("GET", "/login", "Host: " + host, host="")).status, 200)

    def test_no_host_and_more_than_one_host_are_421(self):
        stand = self.stand
        own = "Host: " + stand.host
        cases = {
            "none": (),
            "none, HTTP/1.0": (),
            "the right one twice": (own, own),
            "the right one, then another": (own, "Host: evil.example"),
            "another, then the right one": ("Host: evil.example", own),
        }
        for name, hosts in cases.items():
            with self.subTest(hosts=name):
                version = "HTTP/1.0" if name.endswith("1.0") else "HTTP/1.1"
                answer = exchange(stand, self.head("GET", "/login", *hosts, host="", version=version))
                self.assertRefused(answer, 421, "misdirected")

    def test_a_wrong_host_is_refused_before_the_body_is_read(self):
        stand = self.stand
        cookie = stand.session("mika")
        wire = self.wire(self.head("PUT", LEDGER, "Host: evil.example", "Origin: " + stand.origin,
                                   "Content-Type: application/json", "Content-Length: 5000", cookie=cookie, host=""))
        self.assertRefused(wire.answer(), 421, "misdirected")       # and not one byte of the body was sent
        self.assertNothingStored()

    def test_what_a_proxy_says_the_host_was_is_not_asked(self):
        stand = self.stand
        for claim in ("X-Forwarded-Host: " + stand.host, "Forwarded: host=" + stand.host, "X-Host: " + stand.host,
                      "X-Original-Host: " + stand.host):
            with self.subTest(claim=claim.split(":")[0]):
                answer = exchange(stand, self.head("GET", "/login", "Host: evil.example", claim, host=""))
                self.assertRefused(answer, 421, "misdirected")
        for claim in ("X-Forwarded-Host: evil.example", "Forwarded: host=evil.example;proto=https"):
            with self.subTest(claim=claim):
                self.assertEqual(exchange(stand, self.head("GET", "/login", claim)).status, 200)

    def test_an_address_in_the_request_line_does_not_stand_in_for_the_host(self):
        stand = self.stand
        answer = exchange(stand, self.head("GET", "http://%s/login" % stand.host, "Host: evil.example", host=""))
        self.assertRefused(answer, 421, "misdirected")
        # And the other way round, the page of another name is not what this name's /login is.
        answer = exchange(stand, self.head("GET", "http://evil.example/login"))
        self.assertToLogin(answer)


# ---------------------------------------------------------------------------
# Requests from another site
# ---------------------------------------------------------------------------

class CrossSiteTests(Case):
    def setUp(self):
        super().setUp()
        stand = self.stand
        stand.set_password("mika")
        self.cookie = stand.session("mika")
        self.token = stand.invite("misha")
        self.bodies = {
            ("POST", LOGIN): {"login": "mika", "password": PASSWORD},
            ("POST", SETUP): {"token": self.token, "password": PASSWORD},
            ("POST", LOGOUT): {},
            ("PUT", LEDGER): {"base": 0, "doc": ledger()},
            ("PUT", PLAN): {"base": 0, "doc": plan()},
            ("POST", PASSWORD_DOOR): {"current": PASSWORD, "password": NEW_PASSWORD},
            ("POST", PEOPLE): {"login": "anna", "name": "Anna"},
            ("POST", PEOPLE_UPDATE): {"login": "vanya", "role": "editor"},
            ("POST", PEOPLE_LINK): {"login": "vanya", "password": PASSWORD},
        }
        self.api = [(method, path) for method, path, _session in documented_routes() if path.startswith("/api/")]
        self.assertEqual(len(self.api), 13, "the thirteen doors under /api/ of docs/api.md")
        self.sessions = len(stand.auth.sessions.list())

    def ask(self, method: str, path: str, **options: Any) -> Any:
        return self.stand.request(method, path, self.bodies.get((method, path)), cookie=self.cookie, **options)

    def assertUntouched(self) -> None:
        """Nobody was signed in or out, nothing was saved, and the one-time link is still good."""
        stand = self.stand
        self.assertEqual(stand.get(ME, cookie=self.cookie).status, 200, "the session was closed")
        self.assertEqual(len(stand.auth.sessions.list()), self.sessions, "a session was opened")
        for path in (LEDGER, PLAN):
            self.assertEqual(stand.get(path, cookie=self.cookie).json(), EMPTY)
        self.assertEqual([(user.login, user.role, user.invite_expires is not None) for user in stand.auth.users.list()],
                         [("mika", "owner", False), ("misha", "reader", True), ("vanya", "reader", False)],
                         "somebody was added, given another role or issued a link")
        self.assertEqual(stand.post(SETUP, self.bodies[("POST", SETUP)]).status, 200, "the link was spent")

    def test_sec_fetch_site_of_another_site_or_of_the_same_site_is_403_on_every_api_door(self):
        for method, path in self.api:
            for site in ("cross-site", "same-site", "Cross-Site", "SAME-SITE", "same-origin, cross-site", "bogus", ""):
                with self.subTest(method=method, path=path, site=site):
                    self.assertRefused(self.ask(method, path, headers={"Sec-Fetch-Site": site}), 403, "bad_origin")
                    if method == "GET":
                        answer = self.stand.request("HEAD", path, cookie=self.cookie, headers={"Sec-Fetch-Site": site})
                        self.assertEqual((answer.status, answer.body), (403, b""))
        self.assertUntouched()

    def test_sec_fetch_site_none_is_a_typed_address_and_passes_a_get_only(self):
        for method, path in self.api:
            with self.subTest(method=method, path=path):
                answer = self.ask(method, path, headers={"Sec-Fetch-Site": "none"})
                if method == "GET":
                    self.assertEqual(answer.status, 200)
                else:
                    self.assertRefused(answer, 403, "bad_origin")
        self.assertUntouched()

    def test_sec_fetch_site_twice_is_403_even_when_both_say_same_origin(self):
        stand = self.stand
        for method, path in self.api:
            with self.subTest(method=method, path=path):
                more = ("Origin: " + stand.origin, "Content-Type: application/json", "Content-Length: 2") \
                    if method != "GET" else ()
                answer = exchange(stand, self.head(method, path, "Sec-Fetch-Site: same-origin", "Sec-Fetch-Site: same-origin",
                                                   *more, cookie=self.cookie) + (b"{}" if more else b""))
                self.assertRefused(answer, 403, "bad_origin")
        self.assertUntouched()

    def test_anything_but_a_get_needs_the_stands_own_origin_character_for_character(self):
        stand = self.stand
        scheme, rest = stand.origin.split("://")
        name, port = rest.rsplit(":", 1)
        foreign = [None, "null", "", stand.origin + "/", stand.origin.upper(), "HTTP://" + rest, "https://" + rest,
                   "%s://%s" % (scheme, name), "%s://%s:%d" % (scheme, name, int(port) + 1), "%s://x.%s" % (scheme, rest),
                   stand.origin + ".evil.example", "https://evil.example", "https://evil.example/" + stand.origin,
                   "%s://evil.example@%s" % (scheme, rest), stand.origin + " https://evil.example",
                   stand.origin + ", " + stand.origin, "%s://127.0.0.1:%s" % (scheme, port), rest, "//" + rest]
        for method, path in self.api:
            if method == "GET":
                continue
            for origin in foreign:
                with self.subTest(method=method, path=path, origin=origin):
                    self.assertRefused(self.ask(method, path, origin=origin), 403, "bad_origin")
                    self.assertRefused(self.ask(method, path, origin=origin, headers={"Sec-Fetch-Site": "same-origin"}),
                                       403, "bad_origin")
        self.assertUntouched()

    def test_two_origins_are_no_origin(self):
        stand = self.stand
        for method, path in self.api:
            if method == "GET":
                continue
            for second in (stand.origin, "https://evil.example"):
                with self.subTest(method=method, path=path, second=second):
                    answer = exchange(stand, self.head(method, path, "Origin: " + stand.origin, "Origin: " + second,
                                                       "Content-Type: application/json", "Content-Length: 2",
                                                       cookie=self.cookie) + b"{}")
                    self.assertRefused(answer, 403, "bad_origin")
        self.assertUntouched()

    def test_a_get_may_come_without_an_origin_but_not_with_a_foreign_one(self):
        stand = self.stand
        for method, path in self.api:
            if method != "GET":
                continue
            with self.subTest(path=path):
                self.assertEqual(self.ask("GET", path).status, 200)
                self.assertEqual(self.ask("GET", path, origin=stand.origin).status, 200)
                self.assertEqual(self.ask("GET", path, origin=stand.origin,
                                          headers={"Sec-Fetch-Site": "same-origin"}).status, 200)
                for origin in ("https://evil.example", "null", stand.origin + "/", stand.origin.upper()):
                    self.assertRefused(self.ask("GET", path, origin=origin), 403, "bad_origin")
                    head = stand.request("HEAD", path, cookie=self.cookie, origin=origin)
                    self.assertEqual((head.status, head.body), (403, b""))

    def test_the_page_calls_its_own_doors_as_a_browser_sends_them_and_passes(self):
        # fetch() with credentials "same-origin" and a JSON content type: Origin, Sec-Fetch-Site: same-origin.
        stand = self.stand
        browser = {"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty"}
        self.assertEqual(self.ask("GET", ME, headers=browser).status, 200)
        self.assertEqual(self.ask("PUT", LEDGER, headers=browser).json(), {"rev": 1})
        self.assertEqual(self.ask("PUT", PLAN, headers=browser).json(), {"rev": 1})
        self.assertEqual(self.ask("GET", LEDGER, headers=browser).json()["rev"], 1)
        self.assertEqual(self.ask("GET", PEOPLE, headers=browser).status, 200)
        for door in (PEOPLE, PEOPLE_UPDATE, PEOPLE_LINK):
            self.assertEqual(self.ask("POST", door, headers=browser).status, 200, door)
        changed = self.ask("POST", PASSWORD_DOOR, headers=browser)        # last: it closes the session that asked
        self.assertEqual(changed.status, 200)
        self.assertEqual(stand.post(LOGOUT, {}, cookie=changed.cookie("money-dev"), headers=browser).status, 200)

    def test_the_cross_site_rules_are_judged_before_the_body_is_read(self):
        stand = self.stand
        for method, path in self.api:
            if method == "GET":
                continue
            with self.subTest(method=method, path=path):
                wire = self.wire(self.head(method, path, "Origin: https://evil.example", "Content-Type: application/json",
                                           "Content-Length: 4000", cookie=self.cookie))
                self.assertRefused(wire.answer(), 403, "bad_origin")     # the body was never sent
                wire.done()
        self.assertUntouched()

    def test_a_link_on_another_site_still_opens_the_page_and_the_sign_in_page(self):
        # The cookie is Lax and the page is behind it: "a link opened from a messenger must still open it".
        stand = self.stand
        link = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document",
                "Referer": "https://messenger.example/chat"}
        self.assertEqual(stand.get("/", cookie=self.cookie, headers=link).status, 200)
        self.assertEqual(stand.get("/login", headers=link).status, 200)
        self.assertEqual(stand.get("/set-password", headers=link).status, 200)
        self.assertToLogin(stand.get("/", headers=link))


class SiblingSiteTests(Case):
    """Every *.selfstudio.se name, the test stand included, is the same site as prod: SameSite separates nothing."""

    def setUp(self):
        pass

    def test_prod_refuses_the_test_stand_and_every_other_sibling(self):
        prod = self.server_stand("prod")
        self.assertEqual(prod.origin, "https://finance.selfstudio.se")
        cookie = prod.session("mika")
        self.assertTrue(cookie.startswith("__Host-money="))
        body = {"base": 0, "doc": ledger()}
        for origin in ("https://finance.test.selfstudio.se", "https://ops.selfstudio.se", "https://selfstudio.se",
                       "https://www.finance.selfstudio.se", "http://finance.selfstudio.se",
                       "https://finance.selfstudio.se:443", "https://finance.selfstudio.se.",
                       "https://finance.selfstudio.se.evil.example", "https://finance.selfstudio.dev"):
            with self.subTest(origin=origin):
                for site in (None, "same-site"):
                    headers = {"Sec-Fetch-Site": site} if site else {}
                    self.assertRefused(prod.put(LEDGER, body, cookie=cookie, origin=origin, headers=headers), 403, "bad_origin")
                    self.assertRefused(prod.post(LOGOUT, {}, cookie=cookie, origin=origin, headers=headers), 403, "bad_origin")
        # The right origin does not help a request the browser itself marks as coming from a sibling.
        self.assertRefused(prod.put(LEDGER, body, cookie=cookie, headers={"Sec-Fetch-Site": "same-site"}), 403, "bad_origin")
        self.assertRefused(prod.get(LEDGER, cookie=cookie, headers={"Sec-Fetch-Site": "same-site"}), 403, "bad_origin")
        self.assertEqual(prod.get(LEDGER, cookie=cookie).json(), EMPTY)
        self.assertEqual(prod.get(ME, cookie=cookie).status, 200)
        self.assertEqual(prod.put(LEDGER, body, cookie=cookie, headers={"Sec-Fetch-Site": "same-origin"}).json(), {"rev": 1})

    def test_the_test_stand_refuses_prod(self):
        test = self.server_stand("test")
        self.assertEqual(test.origin, "https://finance.test.selfstudio.se")
        cookie = test.session("mika")
        refused = test.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie, origin="https://finance.selfstudio.se")
        self.assertRefused(refused, 403, "bad_origin")
        self.assertRefused(test.get("/login", host="finance.selfstudio.se"), 421, "misdirected")


# ---------------------------------------------------------------------------
# A body: its type, its length, its limit
# ---------------------------------------------------------------------------

class BodyGateTests(Case):
    def setUp(self):
        super().setUp()
        self.cookie = self.stand.session("mika")
        #: Every door that takes a body: (method, path, cookie, limit in bytes).
        self.doors = [("POST", door, None, 4096) for door in AUTH_DOORS] + \
                     [("POST", door, self.cookie, 4096) for door in SESSION_DOORS] + \
                     [("PUT", path, self.cookie, limit) for path, _kind, limit in DOCUMENTS]

    def sent(self, method: str, path: str, cookie: Optional[str], *lines: str, body: bytes = b"{}",
             length: Any = True) -> Optional[Answer]:
        """The request with the stand's own Origin and ``lines``; ``length`` True counts the body."""
        more = ["Origin: " + self.stand.origin] + list(lines)
        if length is True:
            more.append("Content-Length: %d" % len(body))
        elif length is not None:
            more.append("Content-Length: %s" % length)
        return exchange(self.stand, self.head(method, path, *more, cookie=cookie) + body)

    def test_the_doors_with_a_body_are_the_nine_of_the_document(self):
        documented = sorted((method, path) for method, path, _session in documented_routes() if method != "GET")
        self.assertEqual(sorted((method, path) for method, path, _cookie, _limit in self.doors), documented)

    # -- Content-Type ---------------------------------------------------------

    def test_a_body_that_is_not_application_json_is_415_on_every_door_that_takes_one(self):
        types = ("text/plain", "text/plain; charset=utf-8", "application/x-www-form-urlencoded",
                 "multipart/form-data; boundary=x", "text/json", "application/jsonp", "application/json5",
                 "application/x-json", "application/ld+json", "application/javascript", "json", "*/*",
                 "application/json, text/plain", "text/plain; application/json", "application/", "")
        for method, path, cookie, _limit in self.doors:
            with self.subTest(path=path, type="none at all"):
                self.assertRefused(self.sent(method, path, cookie), 415, "bad_content_type")
            for content_type in types:
                with self.subTest(path=path, type=content_type):
                    answer = self.sent(method, path, cookie, "Content-Type: " + content_type)
                    self.assertRefused(answer, 415, "bad_content_type")
            with self.subTest(path=path, type="application/json, twice"):
                answer = self.sent(method, path, cookie, "Content-Type: application/json", "Content-Type: application/json")
                self.assertRefused(answer, 415, "bad_content_type")
        self.assertEqual(self.stand.get(ME, cookie=self.cookie).status, 200, "a refused sign-out signed nobody out")
        self.assertNothingStored()

    def test_application_json_is_json_with_or_without_a_charset(self):
        for content_type in ("application/json", "application/json; charset=utf-8", "application/json;charset=UTF-8"):
            with self.subTest(type=content_type):
                answer = self.sent("POST", LOGIN, None, "Content-Type: " + content_type,
                                   body=b'{"login":"mika","password":"not the password"}')
                self.assertRefused(answer, 401, "invalid_credentials")

    def test_the_type_is_judged_before_the_body_is_read(self):
        for method, path, cookie, _limit in self.doors:
            with self.subTest(path=path):
                wire = self.wire(self.head(method, path, "Origin: " + self.stand.origin, "Content-Type: text/plain",
                                           "Content-Length: 3000", cookie=cookie))
                self.assertRefused(wire.answer(), 415, "bad_content_type")       # the body was never sent
                wire.done()

    # -- Transfer-Encoding ------------------------------------------------------

    def test_a_transfer_encoding_is_400_on_every_request(self):
        stand = self.stand
        chunks = b"2\r\n{}\r\n0\r\n\r\n"
        requests = [("GET", "/login", None), ("GET", "/", self.cookie), ("GET", ME, self.cookie),
                    ("GET", "/nothing", None)] + [(method, path, cookie) for method, path, cookie, _l in self.doors]
        for method, path, cookie in requests:
            for coding in ("chunked", "identity", "gzip, chunked", "Chunked", "x", ""):
                for name in ("Transfer-Encoding", "transfer-encoding"):
                    for with_length in (False, True):
                        with self.subTest(path=path, method=method, coding=coding, name=name, length=with_length):
                            more = ["Origin: " + stand.origin, "Content-Type: application/json", "%s: %s" % (name, coding)]
                            if with_length:
                                more.append("Content-Length: %d" % len(chunks))
                            answer = exchange(stand, self.head(method, path, *more, cookie=cookie) + chunks)
                            self.assertRefused(answer, 400, "bad_request")
                            self.assertEqual(answer.raw.count(b"HTTP/1.1 "), 1, "what followed was not read as a request")
        self.assertEqual(stand.get(ME, cookie=self.cookie).status, 200)
        self.assertNothingStored()

    # -- Content-Length ---------------------------------------------------------

    def test_a_body_without_a_length_is_411(self):
        for method, path, cookie, _limit in self.doors:
            with self.subTest(path=path):
                answer = self.sent(method, path, cookie, "Content-Type: application/json", length=None)
                self.assertRefused(answer, 411, "length_required")
        self.assertNothingStored()

    def test_a_length_that_is_not_a_number_is_411(self):
        for method, path, cookie, _limit in self.doors:
            for length in ("ten", "-1", "+2", "1_0", "0x2", "2e0", "2.0", "2 2", "2,2", "2;q=1", "", " ", "٢"):
                with self.subTest(path=path, length=length):
                    answer = exchange(self.stand, self.head(
                        method, path, "Origin: " + self.stand.origin, "Content-Type: application/json",
                        cookie=cookie) [:-2] + b"Content-Length: " + length.encode("utf-8") + b"\r\n\r\n{}")
                    self.assertRefused(answer, 411, "length_required")
        self.assertEqual(self.stand.get(ME, cookie=self.cookie).status, 200)
        self.assertNothingStored()

    def test_two_lengths_that_differ_are_400(self):
        for method, path, cookie, _limit in self.doors:
            for first, second in (("2", "3"), ("3", "2"), ("2", "02"), ("2", "x")):
                with self.subTest(path=path, lengths=(first, second)):
                    answer = self.sent(method, path, cookie, "Content-Type: application/json",
                                       "Content-Length: " + first, "Content-Length: " + second, length=None)
                    self.assertRefused(answer, 400, "bad_request")
        self.assertNothingStored()

    # -- the limits -------------------------------------------------------------

    def test_one_byte_over_the_limit_is_413_before_a_byte_of_the_body_is_read(self):
        for method, path, cookie, limit in self.doors:
            with self.subTest(path=path, limit=limit):
                wire = self.wire(self.head(method, path, "Origin: " + self.stand.origin, "Content-Type: application/json",
                                           "Content-Length: %d" % (limit + 1), cookie=cookie))
                # Only the head was sent. The answer comes all the same: the body was not waited for.
                self.assertRefused(wire.answer(), 413, "body_too_large")
                wire.done()
        self.assertNothingStored()

    def test_a_length_of_any_number_of_digits_over_the_limit_is_413(self):
        # "Content-Length must be present and numeric: 411. Over the door's limit the request is refused
        # unread: 413." A length of thirteen digits is numeric, and it is over every limit there is.
        told = {}   # type: Dict[str, Any]
        for method, path, cookie, limit in self.doors:
            for length in (limit * 2, 10 ** 9, 10 ** 11, 10 ** 12, 10 ** 15, 10 ** 30):
                wire = self.wire(self.head(method, path, "Origin: " + self.stand.origin,
                                           "Content-Type: application/json", "Content-Length: %d" % length,
                                           cookie=cookie))
                answer = wire.answer()
                wire.done()
                got = None if answer is None else "%d %s" % (answer.status, answer.json().get("error"))
                if got != "413 body_too_large":
                    told["%s, a length of %d digits" % (path, len(str(length)))] = got
        self.assertEqual(told, {}, "a numeric Content-Length over the limit was not answered 413 body_too_large")

    def test_a_length_of_thousands_of_digits_is_413_too_and_never_a_fault_of_the_server(self):
        # Nothing counts such a number out: it is over every limit by its length alone.
        for method, path, cookie, _limit in self.doors:
            for digits in (1000, 5000, 8000):
                with self.subTest(path=path, digits=digits):
                    wire = self.wire(self.head(method, path, "Origin: " + self.stand.origin,
                                               "Content-Type: application/json", "Content-Length: " + "9" * digits,
                                               cookie=cookie))
                    self.assertRefused(wire.answer(), 413, "body_too_large")
                    wire.done()
        self.assertEqual(self.events("exception"), [])
        self.assertNothingStored()

    def test_a_length_written_with_leading_zeros_is_the_number_it_says(self):
        body = b'{"login":"mika","password":"not the password"}'
        for zeros in (1, 12, 40):
            with self.subTest(zeros=zeros):
                answer = self.sent("POST", LOGIN, None, "Content-Type: application/json", body=body,
                                   length="0" * zeros + str(len(body)))
                self.assertRefused(answer, 401, "invalid_credentials")
        nothing = self.sent("POST", LOGOUT, None, "Content-Type: application/json", body=b"", length="0" * 30)
        self.assertEqual((nothing.status, nothing.json()), (200, {"ok": True}))

    def test_a_sign_in_body_of_exactly_4096_bytes_is_let_in(self):
        stand = self.stand
        bodies = {LOGIN: (b'{"login":"mika","password":"not the password"}', 401, "invalid_credentials"),
                  SETUP: (b'{"token":"' + b"t" * 43 + b'","password":"' + PASSWORD.encode("ascii") + b'"}', 404, "invalid_link"),
                  LOGOUT: (b"{}", 200, None)}
        for door, (body, status, code) in bodies.items():
            with self.subTest(door=door):
                body = body + b" " * (4096 - len(body))
                answer = self.sent("POST", door, None, "Content-Type: application/json", body=body)
                if code is None:
                    self.assertEqual((answer.status, answer.json()), (status, {"ok": True}))
                else:
                    self.assertRefused(answer, status, code)
                over = self.sent("POST", door, None, "Content-Type: application/json", body=body + b" ")
                self.assertRefused(over, 413, "body_too_large")

    def test_a_document_of_exactly_the_limit_is_let_in_to_be_read(self):
        # Seen without sending sixteen megabytes: a caller that asks "Expect: 100-continue" is told to
        # go on only when the body is about to be read - and is told 413 one byte later.
        usage = os.statvfs(self.stand.data_dir)
        if usage.f_bavail * usage.f_frsize < 256 * MIB:
            self.skipTest("the disk under the temporary directory has no room for a document at its limit")
        for method, path, cookie, limit in self.doors:
            if method != "PUT":
                continue
            with self.subTest(path=path, limit=limit):
                lines = ("Origin: " + self.stand.origin, "Content-Type: application/json", "Expect: 100-continue")
                wire = self.wire(self.head(method, path, "Content-Length: %d" % limit, *lines, cookie=cookie))
                answer = wire.answer()
                self.assertIsNotNone(answer)
                self.assertEqual(answer.status, 100, answer.raw[:200])
                wire.close()
                over = self.wire(self.head(method, path, "Content-Length: %d" % (limit + 1), *lines, cookie=cookie))
                self.assertRefused(over.answer(), 413, "body_too_large")
                over.close()
        self.assertTrue(until(lambda: self.stand.server.in_flight() == 0))
        self.assertNothingStored()

    def test_a_refused_request_does_not_keep_its_connection_waiting_for_the_body(self):
        # A document's body has 20 seconds and more to arrive (this one two minutes), and a caller who
        # says nothing is given 30. A request that was refused has none of that: the server hangs up
        # while this test still waits - and it waits less than any of those.
        stand = self.stand
        self.assertLess(PATIENCE, min(stand.settings.socket_timeout, stand.settings.put_deadline(1000000)))
        wire = self.wire(self.head("PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: application/json",
                                   "Content-Length: 1000000"))
        self.assertRefused(wire.answer(), 401, "unauthenticated")
        self.assertTrue(wire.hangs_up(), "the server kept the connection of a request it had refused")
        self.assertTrue(until(lambda: stand.server.connections() == 0))


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------

class DeadlineTests(Case):
    """A deadline is tuned to a third of a second and met on a real socket, so these tests do read a clock.
    What they say about it holds on any machine: nothing is cut before its deadline (the clock here is
    started before the server starts its own), and it is that deadline which cuts it - the connection
    closes while the test still waits, and the test waits less than the 30 seconds after which a stand
    lets go of a silent caller anyway. How soon after the deadline is not asserted: that is the
    machine's business."""

    def setUp(self):
        pass

    def half(self, stand: Any, method: str, path: str, cookie: Optional[str] = None, length: int = 40) -> bytes:
        """A request whose body is announced and only begun."""
        return lines_of(stand, method, path, "Origin: " + stand.origin, "Content-Type: application/json",
                        "Content-Length: %d" % length, cookie=cookie) + b'{"login":'

    def test_the_deadlines_are_the_documented_ones(self):
        # The edge does not buffer request bodies, so a document's deadline runs against the founder's own
        # uplink: 10 000 bytes a second is what a phone has on a train. (It was 50 000 until a reviewer
        # showed that a slow link could then never save today's ledger.)
        settings = self.new_stand(start=False).settings
        self.assertEqual(settings.auth_body_deadline, 5.0, "5 seconds for the doors with a 4 KiB body")
        self.assertEqual(settings.put_deadline(0), 20.0)
        self.assertEqual(settings.put_deadline(50000), 25.0, "20 s + 1 s per 10 000 bytes of Content-Length")
        self.assertEqual(settings.put_deadline(2000000), 220.0, "about four minutes for a ledger of 2 MB")
        self.assertEqual(settings.put_deadline(16 * MIB), 600.0, "and ten minutes at most, whatever the length")
        self.assertEqual(settings.put_deadline(10 ** 30), 600.0)
        self.assertEqual(settings.socket_timeout, 30.0)

    def test_half_a_body_at_a_sign_in_door_is_cut_at_the_deadline_without_an_answer(self):
        # Three doors at once from one address: for this test the address may hold three slots (its share is two).
        stand = self.new_stand(tune={"auth_body_deadline": 0.3, "signed_out_body_slots_per_address": 3})
        began = time.monotonic()
        wires = {door: self.wire(self.half(stand, "POST", door), stand) for door in AUTH_DOORS}
        self.assertLess(PATIENCE, stand.settings.socket_timeout)
        for door, wire in wires.items():
            with self.subTest(door=door):
                self.assertTrue(wire.hangs_up(), "the connection was not closed")
                waited = time.monotonic() - began
                self.assertEqual(wire.received, b"", "a body that misses its deadline gets no answer")
                self.assertGreater(waited, 0.25, "it was cut before its deadline")
        said = until(lambda: len([line for line in stand.log_lines() if line.get("status") == 408]) == 3 and
                     [line for line in stand.log_lines() if line.get("status") == 408])
        self.assertEqual(sorted(line["path"] for line in said), sorted(AUTH_DOORS))
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        for _slot in range(3):      # and the three slots they held are free again
            self.assertRefused(stand.post(LOGIN, {}), 400, "missing_credentials")

    def test_a_body_that_trickles_in_is_cut_at_the_same_deadline_for_all_of_it(self):
        stand = self.new_stand(tune={"auth_body_deadline": 0.4})
        wire = self.wire(lines_of(stand, "POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                                  "Content-Length: 4000"), stand)
        # A byte every twentieth of a second: at that pace the 4000 would take more than three minutes,
        # and a deadline that started anew with every read would never come.
        began = time.monotonic()
        cut = False
        while not cut and time.monotonic() - began < PATIENCE:
            try:
                wire.send(b" ")             # every read of the server succeeds; the deadline is not per read
            except OSError:
                cut = True
            else:
                cut = wire.hangs_up(0.05)
        self.assertTrue(cut, "a body that never stops trickling was never cut")
        self.assertEqual(wire.received, b"")

    def test_a_save_that_stalls_is_cut_at_its_own_deadline_and_nothing_is_stored(self):
        stand = self.new_stand(tune={"put_deadline_base": 0.3})
        cookie = stand.session("mika")
        began = time.monotonic()
        wires = {path: self.wire(lines_of(stand, "PUT", path, "Origin: " + stand.origin, "Content-Type: application/json",
                                          "Content-Length: 400", cookie=cookie) + b'{"base":0,"doc":"{', stand)
                 for path, _kind, _limit in DOCUMENTS}
        for path, wire in wires.items():
            with self.subTest(path=path):
                self.assertTrue(wire.hangs_up())
                self.assertEqual(wire.received, b"")
                self.assertGreater(time.monotonic() - began, 0.25)
        self.assertEqual(sorted(line["path"] for line in stand.log_lines() if line.get("status") == 408),
                         sorted(wires))
        self.assertNothingStored(stand)

    def test_a_request_that_stops_in_its_headers_is_dropped_at_the_socket_timeout(self):
        stand = self.new_stand(tune={"socket_timeout": 0.3})
        begun = (b"", b"GET /login HTT", b"GET /login HTTP/1.1\r\nHost: " + stand.host.encode("ascii"),
                 b"GET /login HTTP/1.1\r\nHost: " + stand.host.encode("ascii") + b"\r\nX-Slow: 1\r\n")
        began = time.monotonic()
        wires = [self.wire(data, stand) for data in begun]
        for data, wire in zip(begun, wires):
            with self.subTest(begun=data[:20]):
                self.assertTrue(wire.hangs_up())
                self.assertEqual(wire.received, b"")
                self.assertGreater(time.monotonic() - began, 0.25)
        self.assertEqual(stand.get("/login").status, 200)
        self.assertEqual(self.events("exception", stand), [])


# ---------------------------------------------------------------------------
# The headers of every answer, and the policy of each kind
# ---------------------------------------------------------------------------

class HeadersTests(Case):
    def kinds(self) -> List[Tuple[str, Any, Optional[str], Optional[str]]]:
        """Every kind of answer: ``(what, the answer, its policy, its Cache-Control)``; None is "whatever"."""
        stand = self.stand
        stand.set_password("mika")
        cookie = stand.session("mika")
        page = policy_of_the_page()
        held = {"If-Modified-Since": stand.get("/", cookie=cookie).header("Last-Modified")}
        good = {"base": 0, "doc": ledger()}
        body = ("Origin: " + stand.origin, "Content-Type: application/json")
        kinds = [
            ("the page", stand.get("/", cookie=cookie), page, "no-cache"),
            ("the page as /index.html", stand.get("/index.html", cookie=cookie), page, "no-cache"),
            ("the page, not modified", stand.get("/", cookie=cookie, headers=held), page, "no-cache"),
            ("a vendor file, not modified", stand.get(VENDOR[0], cookie=cookie, headers=held), POLICY_VENDOR, "no-cache"),
            ("the sign-in page", stand.get("/login"), POLICY_OWN_PAGES, "no-store"),
            ("the sign-in page of a founder", stand.get("/login", cookie=cookie), POLICY_OWN_PAGES, "no-store"),
            ("the set-password page", stand.get("/set-password"), POLICY_OWN_PAGES, "no-store"),
            ("the data page", stand.get("/data", cookie=cookie), POLICY_OWN_PAGES, "no-store"),
            ("the script of Money's own pages", stand.get("/assets/auth.js"), None, "no-cache"),
            ("the stylesheet of Money's own pages", stand.get("/assets/auth.css"), None, "no-cache"),
            ("an asset, not modified", stand.get("/assets/auth.css", headers=held), None, "no-cache"),
            ("robots.txt", stand.get("/robots.txt"), None, None),
            ("the icon", stand.get("/favicon.ico"), None, None),
            ("the health check", stand.get("/healthz"), None, None),
            ("who am I", stand.get(ME, cookie=cookie), POLICY_JSON, "no-store"),
            ("a document", stand.get(LEDGER, cookie=cookie), POLICY_JSON, "no-store"),
            ("a save", stand.put(LEDGER, good, cookie=cookie), POLICY_JSON, "no-store"),
            ("a document that was saved", stand.get(LEDGER, cookie=cookie), POLICY_JSON, "no-store"),
            ("a sign-in", stand.post(LOGIN, {"login": "mika", "password": PASSWORD}), POLICY_JSON, "no-store"),
            ("a password set", stand.post(SETUP, {"token": stand.invite("misha"), "password": PASSWORD}), POLICY_JSON, "no-store"),
            ("a sign-out", stand.post(LOGOUT, {}, cookie=stand.session("vanya")), POLICY_JSON, "no-store"),
            ("302: a stranger at the page", stand.get("/"), None, None),
            ("302: /logout", stand.get("/logout", cookie=cookie), None, None),
            ("302: an old link of the platform", stand.get("/dashboard", cookie=cookie), None, None),
            ("400: a transfer-encoding", stand.get("/login", headers={"Transfer-Encoding": "chunked"}), POLICY_JSON, "no-store"),
            ("400: a body that is not JSON", stand.post(LOGIN, body=b"{", headers=JSON), POLICY_JSON, "no-store"),
            ("400: not this door's document", stand.put(LEDGER, {"base": 1, "doc": "[]"}, cookie=cookie), POLICY_JSON, "no-store"),
            ("400: no password", stand.post(LOGIN, {"login": "mika"}), POLICY_JSON, "no-store"),
            ("401: no session", stand.get(ME), POLICY_JSON, "no-store"),
            ("401: a vendor file, no session", stand.get(VENDOR[1]), POLICY_JSON, "no-store"),
            ("401: a wrong password", stand.post(LOGIN, {"login": "mika", "password": "x" * 12}), POLICY_JSON, "no-store"),
            ("403: a foreign origin", stand.put(LEDGER, good, cookie=cookie, origin="https://evil.example"), POLICY_JSON, "no-store"),
            ("404: no such path", stand.get("/nothing", cookie=cookie), POLICY_JSON, "no-store"),
            ("404: a dead link", stand.post(SETUP, {"token": "t" * 43, "password": PASSWORD}), POLICY_JSON, "no-store"),
            ("405: a method nobody serves", stand.request("DELETE", LEDGER, cookie=cookie, origin=None), POLICY_JSON, "no-store"),
            ("405: a door's other method", stand.post("/login", {}), POLICY_JSON, "no-store"),
            ("409: a stale save", stand.put(LEDGER, good, cookie=cookie), POLICY_JSON, "no-store"),
            ("411: no length", exchange(stand, self.head("PUT", LEDGER, *body, cookie=cookie)), POLICY_JSON, "no-store"),
            ("413: too long", stand.post(LOGIN, body=b" " * 4097, headers=JSON), POLICY_JSON, "no-store"),
            ("415: not JSON by type", stand.post(LOGIN, body=b"a=b", headers={"Content-Type": "text/plain"}), POLICY_JSON, "no-store"),
            ("421: another host", stand.get("/login", host="evil.example"), POLICY_JSON, "no-store"),
            ("400: not a request", exchange(stand, b"GET /login\r\n\r\n"), POLICY_JSON, "no-store"),
            ("400: not a header", exchange(stand, self.head("GET", "/login", "Broken header")), POLICY_JSON, "no-store"),
            ("414", exchange(stand, self.head("GET", "/" + "a" * 9000)), POLICY_JSON, "no-store"),
            ("431", exchange(stand, self.head("GET", "/login", *["X-%d: 1" % n for n in range(101)])), POLICY_JSON, "no-store"),
            ("417", exchange(stand, self.head("GET", "/login", "Expect: something")), POLICY_JSON, "no-store"),
        ]   # type: List[Tuple[str, Any, Optional[str], Optional[str]]]
        kinds += [("the vendor file " + path, stand.get(path, cookie=cookie), POLICY_VENDOR, "no-cache") for path in VENDOR]
        for _attempt in range(10):
            limited = stand.post(LOGIN, {"login": "mika", "password": "x" * 12})
        kinds.append(("429: too many attempts", limited, POLICY_JSON, "no-store"))
        with mock.patch.object(stand.stores["plan"], "read", side_effect=RuntimeError("a fault of ours")):
            kinds.append(("500: a fault of the server's own", stand.get(PLAN, cookie=cookie), POLICY_JSON, "no-store"))
        stand.clock.tick(days=29, hours=1)
        aged = stand.session("vanya", ttl=3600)     # a session with an hour left: in its last 24 hours
        kinds.append(("302: a session in its last day at the page", stand.get("/", cookie=aged), None, None))
        kinds.append(("the sign-in page in the last day", stand.get("/login", cookie=aged), POLICY_OWN_PAGES, "no-store"))
        return kinds

    def test_every_kind_of_answer_carries_the_eight_headers_and_its_own_policy(self):
        statuses = set()
        for what, answer, policy, cache in self.kinds():
            with self.subTest(answer=what):
                self.assertIsNotNone(answer, "no answer at all")
                expected = re.match(r"(\d{3})", what)
                if expected:
                    self.assertEqual(answer.status, int(expected.group(1)), answer.body[:200])
                statuses.add(answer.status)
                self.assertFixedHeaders(answer, what)
                if policy is not None:
                    self.assertEqual(answer.header("Content-Security-Policy"), policy)
                if cache is not None:
                    self.assertEqual(answer.header("Cache-Control"), cache)
                policy_sent = answer.header("Content-Security-Policy")
                self.assertNotIn("unsafe-eval", policy_sent)
                self.assertNotRegex(policy_sent, r"script-src[^;]*('unsafe-inline'|\*|https?:|data:)")
                if answer.status in (204, 304):
                    self.assertEqual(answer.body, b"")
                elif answer.body:
                    self.assertEqual(answer.all("Content-Length"), [str(len(answer.body))])
                    self.assertRegex(answer.header("Content-Type"), r"; charset=utf-8$")
                if answer.status == 302:
                    self.assertEqual(answer.body, b"")
        self.assertTrue({200, 204, 302, 304, 400, 401, 403, 404, 405, 409, 411, 413, 414, 415, 417, 421, 429, 431, 500}
                        <= statuses, sorted(statuses))

    def test_a_session_cookie_is_set_by_a_sign_in_and_a_password_set_and_by_nothing_else(self):
        setting = []
        for what, answer, _policy, _cache in self.kinds():
            cookies = answer.all("Set-Cookie")
            if any(not cookie.startswith("money-dev=;") for cookie in cookies):
                setting.append(what)
            for cookie in cookies:
                self.assertRegex(cookie, r"^money-dev=[A-Za-z0-9_-]*; Path=/; HttpOnly; SameSite=Lax; Max-Age=(0|2592000)$", what)
        self.assertEqual(sorted(setting), ["a password set", "a sign-in"])

    def test_the_answers_to_a_full_server_carry_the_headers_and_say_when_to_come_back(self):
        stand = self.new_stand(tune=dict(HELD, signed_out_slots=1, max_connections_per_address=2))
        cookie = stand.session("mika")
        stalled = ("Origin: " + stand.origin, "Content-Type: application/json", "Content-Length: 40")
        self.wire(lines_of(stand, "POST", LOGIN, *stalled), stand)
        # The one signed-out slot is taken by a body that never comes: the next request that brings a body
        # is told so. The slot is seen taken before that request is sent: sent at once, it can reach the
        # slot first, and then it is the stalled sign-in that is turned away and nobody is ever told 503.
        self.assertTrue(until(lambda: stand.server.signed_out() == 1), "the stalled sign-in was not let in")
        busy = stand.post(LOGIN, {})
        self.assertRefused(busy, 503, "busy")
        self.assertFixedHeaders(busy)
        self.assertEqual(busy.header("Retry-After"), "1")
        # The address may have two connections. The one that was just turned away is counted until the
        # server has let go of it, a moment after its answer: only then is there room for the save.
        self.assertTrue(until(lambda: stand.counted() == 1), "the request that was turned away is still counted")
        self.wire(lines_of(stand, "PUT", LEDGER, *stalled, cookie=cookie), stand)
        self.assertTrue(until(lambda: stand.counted() == 2), "the stalled save was not let in")
        full = stand.get(ME, cookie=cookie)
        self.assertRefused(full, 503, "too_many_connections")
        self.assertFixedHeaders(full)
        self.assertEqual(full.header("Retry-After"), "1")

    def test_nothing_a_caller_sent_comes_back_in_an_answer(self):
        stand = self.stand
        cookie = stand.session("mika")
        mark = "Zq7ECHOzq7"
        body = json.dumps({"login": mark, "password": mark + mark, "token": mark * 5, "base": mark, "doc": mark}).encode("ascii")
        json_body = ("Origin: " + stand.origin, "Content-Type: application/json", "Content-Length: %d" % len(body))
        requests = [
            self.head("GET", "/" + mark + "?" + mark + "=" + mark),
            self.head("GET", "/" + mark, cookie=cookie),
            self.head("GET", "/api/" + mark, cookie=cookie),
            self.head("GET", "/login?next=" + mark, "Referer: https://" + mark + ".example/", "User-Agent: " + mark,
                      "X-" + mark + ": " + mark, "Accept-Language: " + mark),
            self.head("GET", "/login", "Host: " + mark + ".example", host=""),
            self.head("GET", "/login", "Cookie: money-dev=" + mark * 3 + "; ssp_session=" + mark + "; " + mark + "=" + mark),
            self.head("POST", LOGIN, *json_body) + body,
            self.head("POST", SETUP, *json_body) + body,
            self.head("PUT", LEDGER, *json_body, cookie=cookie) + body,
            self.head("PUT", LEDGER, "Origin: https://" + mark + ".example", "Content-Type: application/json",
                      "Content-Length: 2", cookie=cookie) + b"{}",
            self.head("PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: text/" + mark, "Content-Length: 2",
                      cookie=cookie) + b"{}",
            self.head("PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: application/json",
                      "Content-Length: " + mark, cookie=cookie),
            self.head("GET", "/login", "Transfer-Encoding: " + mark),
            self.head("GET", "/login", "Expect: " + mark),
            self.head("GET", "/login", "Sec-Fetch-Site: " + mark, "If-Modified-Since: " + mark),
            self.head("GET", ME, "Sec-Fetch-Site: " + mark, cookie=cookie),
            self.head("ZQECHOZQ", "/login"),
            self.head("GET", "/login", mark + " is not a header"),
            ("GET /login " + mark + "/1.1\r\nHost: " + stand.host + "\r\n\r\n").encode("ascii"),
            (mark + "\r\n\r\n").encode("ascii"),
        ]
        for request in requests:
            with self.subTest(request=request[:60]):
                answer = exchange(stand, request)
                self.assertIsNotNone(answer)
                self.assertNotIn(mark.lower().encode("ascii"), answer.raw.lower())
                self.assertNotIn(b"ZQECHOZQ", answer.raw)
                if answer.status == 302:
                    self.assertEqual(answer.header("Location"), "/login", "no return address is built from the request")

    def test_one_connection_carries_one_request(self):
        stand = self.stand
        one = self.head("GET", "/robots.txt", "Connection: keep-alive")
        # Asked to keep the connection, the server answers, says "Connection: close" and hangs up.
        wire = self.wire(one)
        answer = wire.answer()
        self.assertEqual((answer.status, answer.all("Connection")), (200, ["close"]))
        self.assertTrue(wire.hangs_up(), "every answer says Connection: close, and the server keeps its word")
        self.assertEqual(wire.received.count(b"HTTP/1.1 "), 1)
        # Three requests sent in one breath: one is served. (Whether the caller still gets to read that one
        # answer is the network's business once the server has hung up on the other two; what was served is
        # in the log.)
        served = len([line for line in stand.log_lines() if line.get("path") == "/robots.txt"])
        wire = self.wire(one + one + one)
        self.assertTrue(wire.hangs_up())
        self.assertLessEqual(wire.received.count(b"HTTP/1.1 "), 1, "a second request on the connection was answered")
        self.assertEqual(len([line for line in stand.log_lines() if line.get("path") == "/robots.txt"]), served + 1)
        # A request hidden in what a GET announces as its body is never served either.
        hidden = exchange(stand, self.head("GET", "/login", "Content-Length: %d" % len(one)) + one)
        self.assertEqual((hidden.status, hidden.raw.count(b"HTTP/1.1 ")), (200, 1))
        self.assertEqual(len([line for line in stand.log_lines() if line.get("path") == "/robots.txt"]), served + 1)
        # And so is one that follows the body of a request that has one.
        body = b'{"login":"mika","password":"not the password"}'
        after = exchange(stand, self.head("POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                                          "Content-Length: %d" % len(body)) + body + one)
        if after is not None:
            self.assertEqual((after.status, after.raw.count(b"HTTP/1.1 ")), (401, 1))
        self.assertEqual([line["status"] for line in stand.log_lines() if line.get("path") == LOGIN], [401])
        self.assertEqual(len([line for line in stand.log_lines() if line.get("path") == "/robots.txt"]), served + 1)


class PolicyModeTests(Case):
    def setUp(self):
        pass

    def answers(self, stand: Any) -> Dict[str, Tuple[Any, str]]:
        cookie = stand.session("mika")
        return {
            "the page": (stand.get("/", cookie=cookie), policy_of_the_page()),
            "a vendor file": (stand.get(VENDOR[2], cookie=cookie), POLICY_VENDOR),
            "the sign-in page": (stand.get("/login"), POLICY_OWN_PAGES),
            "the data page": (stand.get("/data", cookie=cookie), POLICY_OWN_PAGES),
            "JSON": (stand.get(ME, cookie=cookie), POLICY_JSON),
            "a refusal": (stand.get(ME), POLICY_JSON),
        }

    def test_the_policy_is_enforced_unless_the_stand_was_told_otherwise(self):
        stand = self.new_stand()
        for what, (answer, policy) in self.answers(stand).items():
            with self.subTest(answer=what):
                self.assertEqual(answer.all("Content-Security-Policy"), [policy])
                self.assertEqual(answer.all("Content-Security-Policy-Report-Only"), [])

    def test_report_only_sends_the_same_policies_under_the_other_name(self):
        stand = self.new_stand(env={"MONEY_CSP": "report-only"})
        for what, (answer, policy) in self.answers(stand).items():
            with self.subTest(answer=what):
                self.assertEqual(answer.all("Content-Security-Policy-Report-Only"), [policy])
                self.assertEqual(answer.all("Content-Security-Policy"), [])
                for name, value in FIXED.items():
                    self.assertEqual(answer.all(name), [value], "the other headers are not a matter of this switch")

    def test_on_prod_report_only_runs_out_by_itself_the_day_after_its_date(self):
        # The clock of the tests stands at noon of 7 October 2026 (UTC).
        prod = self.server_stand("prod", env={"MONEY_CSP": "report-only", "MONEY_CSP_OVERRIDE_UNTIL": "2026-10-08"})
        for moment, enforced in ((None, False), ({"hours": 35, "minutes": 59}, False), ({"minutes": 2}, True),
                                 ({"days": 30}, True)):
            if moment:
                prod.clock.tick(**moment)
            with self.subTest(now=prod.clock().isoformat()):
                cookie = prod.session("mika")
                for what, (answer, policy) in self.answers(prod).items():
                    name, other = ("Content-Security-Policy", "Content-Security-Policy-Report-Only") if enforced \
                        else ("Content-Security-Policy-Report-Only", "Content-Security-Policy")
                    self.assertEqual(answer.all(name), [policy], what)
                    self.assertEqual(answer.all(other), [], what)
                self.assertEqual(prod.get(ME, cookie=cookie).status, 200, "the same running server")


# ---------------------------------------------------------------------------
# The page and the files beside it
# ---------------------------------------------------------------------------

class PageTests(Case):
    def setUp(self):
        super().setUp()
        self.cookie = self.stand.session("mika")
        #: path -> (who may ask, the file it is, the policy it is sent under)
        own = os.path.join(CHECKOUT, "moneyd", "assets")
        self.files = {"/": (self.cookie, INDEX, policy_of_the_page()),
                      "/index.html": (self.cookie, INDEX, policy_of_the_page()),
                      "/assets/auth.js": (None, os.path.join(own, "auth.js"), None),
                      "/assets/auth.css": (None, os.path.join(own, "auth.css"), None)}
        for path in VENDOR:
            self.files[path] = (self.cookie, os.path.join(CHECKOUT, "vendor", path.rsplit("/", 1)[1]), POLICY_VENDOR)

    def test_the_page_is_index_html_byte_for_byte(self):
        page = read(INDEX)
        for path in ("/", "/index.html"):
            with self.subTest(path=path):
                answer = self.stand.get(path, cookie=self.cookie)
                self.assertEqual(answer.status, 200)
                self.assertTrue(answer.body == page, "what was served is not the file (%d bytes against %d)"
                                % (len(answer.body), len(page)))
                self.assertEqual(answer.header("Content-Length"), str(len(page)))
                self.assertIsNone(answer.header("Content-Encoding"))
                self.assertIsNone(answer.header("ETag"), "Last-Modified, so that the edge's compression cannot disturb it")

    def test_every_file_is_asked_for_again_each_time_and_answered_304_to_the_copy_it_gave(self):
        stand = self.stand
        for path, (who, source, policy) in self.files.items():
            with self.subTest(path=path):
                first = stand.get(path, cookie=who)
                self.assertEqual((first.status, first.header("Cache-Control")), (200, "no-cache"))
                self.assertTrue(first.body == read(source))
                modified = first.header("Last-Modified")
                self.assertIsNotNone(email.utils.parsedate_to_datetime(modified))
                again = exchange(stand, self.head("GET", path, "If-Modified-Since: " + modified, cookie=who))
                self.assertEqual((again.status, again.body), (304, b""))
                self.assertEqual(again.header("Cache-Control"), "no-cache")
                self.assertEqual(again.header("Last-Modified"), modified)
                self.assertIn(again.header("Content-Length"), (None, "0"))
                self.assertEqual(again.header("Content-Security-Policy"), first.header("Content-Security-Policy"))
                if policy is not None:
                    self.assertEqual(first.header("Content-Security-Policy"), policy)
                asked = stand.request("HEAD", path, cookie=who, headers={"If-Modified-Since": modified})
                self.assertEqual((asked.status, asked.body), (304, b""))

    def test_a_copy_of_another_moment_or_a_date_that_is_none_gets_the_whole_file(self):
        stand = self.stand
        moment = email.utils.parsedate_to_datetime(stand.get("/", cookie=self.cookie).header("Last-Modified"))
        earlier = email.utils.format_datetime(moment.replace(year=moment.year - 1), usegmt=True)
        for path, (who, source, _policy) in self.files.items():
            for held in (earlier, "Thu, 01 Jan 1970 00:00:00 GMT", "yesterday", "0", "",
                         "é" * 8, "Wed, 99 Oct 2026 99:99:99 GMT", "Wed, 07 Oct 99999 12:00:00 GMT"):
                with self.subTest(path=path, held=held):
                    answer = exchange(stand, self.head("GET", path, cookie=who)[:-2]
                                      + b"If-Modified-Since: " + held.encode("utf-8") + b"\r\n\r\n")
                    self.assertEqual(answer.status, 200)
                    self.assertEqual(len(answer.body), os.path.getsize(source))
        self.assertEqual(self.events("exception"), [])

    def test_holding_a_copy_opens_nothing_for_a_stranger(self):
        stand = self.stand
        held = {"If-Modified-Since": stand.get("/", cookie=self.cookie).header("Last-Modified")}
        for path in ("/", "/index.html"):
            self.assertToLogin(stand.get(path, headers=held))
        for path in VENDOR:
            self.assertRefused(stand.get(path, headers=held), 401, "unauthenticated")
        stand.post(LOGOUT, {}, cookie=self.cookie)
        self.assertToLogin(stand.get("/", cookie=self.cookie, headers=held))

    def test_the_page_says_that_it_depends_on_the_cookie(self):
        stand = self.stand
        first = stand.get("/", cookie=self.cookie)
        self.assertEqual(first.all("Vary"), ["Cookie"])
        again = stand.get("/", cookie=self.cookie, headers={"If-Modified-Since": first.header("Last-Modified")})
        self.assertEqual((again.status, again.all("Vary")), (304, ["Cookie"]))

    def test_only_the_three_vendor_files_exist(self):
        stand = self.stand
        for name in os.listdir(os.path.join(CHECKOUT, "vendor")):
            self.assertIn("/money/vendor/" + name, VENDOR, "vendor/ holds a file the documents do not name")
        for path in ("/money/vendor/", "/money/vendor", "/money/vendor/pdf.js", "/money/vendor/pdf.min.mjs",
                     "/money/vendor/xlsx.min.js", "/money/vendor/pdf.worker.js", "/vendor/pdf.min.js",
                     "/money/pdf.min.js", "/pdf.min.js"):
            with self.subTest(path=path):
                self.assertRefused(stand.get(path, cookie=self.cookie), 404, "not_found")
                self.assertToLogin(stand.get(path))


# ---------------------------------------------------------------------------
# /login
# ---------------------------------------------------------------------------

class LoginPageTests(Case):
    FORM_LINE = "Вход скоро закончится — войдите заново"

    def aged(self, login: str = "mika") -> str:
        """A session of ``login`` that is in its last 24 hours now: opened 29 days and an hour ago, and used since."""
        stand = self.stand
        cookie = stand.session(login)
        for _fortnight in range(2):
            stand.clock.tick(days=13)
            self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        stand.clock.tick(days=3, hours=1)
        return cookie

    def state(self, answer: Any) -> str:
        found = re.findall(r'<body[^>]*\bdata-state="([a-z-]+)"', answer.text)
        self.assertEqual(len(found), 1, "the page says its state once, on <body>")
        return found[0]

    def test_login_never_redirects_whoever_asks(self):
        stand = self.stand
        stand.set_password("misha")
        callers = {
            "nobody": None,
            "a cookie that is no session": "money-dev=" + "A" * 43,
            "the platform's old cookie": "ssp_session=" + "B" * 43,
            "a founder": stand.session("vanya"),
            "a founder whose login was switched off": stand.session("misha"),
        }
        self.assertEqual(stand.ctl("user", "disable", "misha").status, 0)
        callers["a session in its last day"] = self.aged("mika")
        ended = stand.session("vanya")
        self.assertEqual(stand.post(LOGOUT, {}, cookie=ended).status, 200)
        callers["a session that was signed out"] = ended
        for who, cookie in callers.items():
            for path in ("/login", "/login?next=/", "/login?next=https://evil.example/", "/login?"):
                for method in ("GET", "HEAD"):
                    with self.subTest(who=who, path=path, method=method):
                        answer = exchange(stand, self.head(
                            method, path, "Sec-Fetch-Site: cross-site", "Referer: https://evil.example/",
                            "If-Modified-Since: Wed, 07 Oct 2026 12:00:00 GMT", cookie=cookie))
                        self.assertEqual(answer.status, 200)
                        self.assertIsNone(answer.header("Location"))
                        self.assertIsNone(answer.header("Refresh"))
                        self.assertEqual(answer.header("Content-Type"), TYPE_HTML)
                        self.assertEqual(answer.header("Cache-Control"), "no-store")
                        self.assertEqual(answer.header("Content-Security-Policy"), POLICY_OWN_PAGES)
                        if method == "GET":
                            self.assertNotRegex(answer.text, r'(?i)http-equiv\s*=\s*"?refresh')

    def test_without_a_session_it_is_the_form_and_names_nobody(self):
        stand = self.stand
        for cookie in (None, "money-dev=" + "A" * 43, "ssp_session=" + "B" * 43):
            answer = stand.get("/login", cookie=cookie)
            self.assertEqual(self.state(answer), "form")
            for name in ("Mika", "Misha", "Vanya", "mika", "misha", "vanya"):
                self.assertNotIn(name, answer.text, "the sign-in page tells a stranger a founder's name")
            forms = tags(answer.text, "form")
            self.assertEqual([form.get("method", "").lower() for form in forms], ["post"],
                             "one form, and a browser without script must not put a password into an address")
            fields = tags(answer.text, "input")
            self.assertEqual([field.get("autocomplete") for field in fields], ["username", "current-password"])
            self.assertEqual(fields[1].get("type"), "password")

    def test_with_a_session_it_says_who_is_signed_in_and_offers_the_page_and_the_way_out(self):
        stand = self.stand
        for login, name in (("mika", "Mika"), ("misha", "Misha"), ("vanya", "Vanya")):
            with self.subTest(login=login):
                answer = stand.get("/login", cookie=stand.session(login))
                self.assertEqual(self.state(answer), "signed-in")
                self.assertIn("Вы вошли как %s" % name, answer.text)
                self.assertRegex(answer.text, r'<a\b[^>]*\bhref="/"[^>]*>\s*Открыть Money\s*</a>')
                self.assertRegex(answer.text, r"<button\b[^>]*>\s*Выйти\s*</button>")

    def test_in_its_last_day_a_session_is_shown_the_form_again_with_the_line(self):
        stand = self.stand
        cookie = self.aged("mika")
        answer = stand.get("/login", cookie=cookie)
        self.assertEqual(self.state(answer), "ending")
        self.assertIn(self.FORM_LINE, answer.text)
        self.assertIn("password", [field.get("type") for field in tags(answer.text, "input")])

    def test_the_sign_in_page_is_whole_without_a_line_of_inline_script_or_style(self):
        for path, cookie in (("/login", None), ("/login", self.stand.session("mika")), ("/set-password", None),
                             ("/data", self.stand.session("mika"))):
            with self.subTest(path=path, founder=cookie is not None):
                text = self.stand.get(path, cookie=cookie).text
                self.assertEqual([script.get("src") for script in tags(text, "script")], ["/assets/auth.js"])
                self.assertEqual(re.findall(r"<script\b[^>]*>(.*?)</script>", text, re.DOTALL | re.IGNORECASE), [""],
                                 "no script text in the page itself")
                sheets = [link.get("href") for link in tags(text, "link") if link.get("rel") == "stylesheet"]
                self.assertEqual(sheets, ["/assets/auth.css"])
                self.assertNotRegex(text, r"(?i)<style\b")
                self.assertNotRegex(text, r'(?i)<[^>]+\sstyle\s*=')
                self.assertNotRegex(text, r'(?i)<[^>]+\son[a-z]+\s*=')
                self.assertNotRegex(text, r"(?i)javascript:")
                self.assertNotRegex(text, r'(?i)(src|href)\s*=\s*"(https?:)?//', "nothing is loaded from another host")


    def test_moneys_own_pages_load_no_web_font_and_put_no_text_on_a_page_as_markup(self):
        style = self.stand.get("/assets/auth.css").text.lower()
        for loaded in ("@font-face", "@import", "fonts.googleapis", "fonts.gstatic", "url(http", "url(//"):
            self.assertNotIn(loaded, style, "the system font stack, and nothing from another host")
        script = self.stand.get("/assets/auth.js").text
        for markup in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "createContextualFragment",
                       "srcdoc", "eval(", "new Function"):
            self.assertNotIn(markup, script, "texts are set with textContent")
        self.assertIn("textContent", script)


# ---------------------------------------------------------------------------
# The last 24 hours of a session
# ---------------------------------------------------------------------------

class LastDayTests(Case):
    def aged(self, days: float, **more: float) -> str:
        """A session of mika's that is ``days`` old now, and was used often enough not to idle out."""
        stand = self.stand
        cookie = stand.session("mika")
        left = days
        while left > 13:
            stand.clock.tick(days=13)
            left -= 13
            self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        stand.clock.tick(days=left, **more)
        return cookie

    def test_a_session_lasts_thirty_days_and_opens_the_page_until_its_last_day_begins(self):
        stand = self.stand
        cookie = self.aged(29, seconds=-2)                      # two seconds before its last 24 hours
        self.assertEqual(stand.get("/", cookie=cookie).status, 200)
        self.assertEqual(stand.get("/index.html", cookie=cookie).status, 200)
        held = {"If-Modified-Since": stand.get("/", cookie=cookie).header("Last-Modified")}
        self.assertEqual(stand.get("/", cookie=cookie, headers=held).status, 304)
        stand.clock.tick(seconds=4)                             # two seconds into them
        for path in ("/", "/index.html"):
            self.assertToLogin(stand.get(path, cookie=cookie))
            self.assertToLogin(stand.get(path, cookie=cookie, headers=held))    # a held copy opens nothing either
            self.assertEqual(stand.request("HEAD", path, cookie=cookie).status, 302)
        stand.clock.tick(hours=23, minutes=59)                  # a minute before the end
        self.assertToLogin(stand.get("/", cookie=cookie))
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        stand.clock.tick(minutes=2)                             # past the thirty days
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
        self.assertToLogin(stand.get("/", cookie=cookie))

    def test_in_its_last_day_every_api_door_still_answers_so_an_open_page_goes_on_saving(self):
        stand = self.stand
        cookie = self.aged(29, hours=12)
        self.assertToLogin(stand.get("/", cookie=cookie))
        self.assertEqual(stand.get(ME, cookie=cookie).json()["firstName"], "Mika")
        for path, text in ((LEDGER, ledger(3)), (PLAN, plan(2))):
            self.assertEqual(stand.get(path, cookie=cookie).json(), EMPTY)
            self.assertEqual(stand.put(path, {"base": 0, "doc": text}, cookie=cookie).json(), {"rev": 1})
            self.assertEqual(stand.get(path, cookie=cookie).json()["rev"], 1)
        for path in VENDOR:                                     # the readers an open page may still have to load
            self.assertEqual(stand.get(path, cookie=cookie).status, 200)

    def test_the_form_signs_a_session_in_its_last_day_in_afresh(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.aged(29, hours=1)
        self.assertToLogin(stand.get("/", cookie=cookie))
        page = stand.get("/login", cookie=cookie)
        self.assertEqual(page.status, 200)
        self.assertIn('data-state="ending"', page.text)
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, cookie=cookie)
        self.assertEqual((signed.status, signed.json()), (200, {"ok": True, "firstName": "Mika"}))
        fresh = signed.cookie("money-dev")
        self.assertIsNotNone(fresh)
        self.assertNotEqual(fresh, cookie)
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")       # the presented one is deleted
        self.assertEqual(stand.get("/", cookie=fresh).status, 200)
        self.assertIn('data-state="signed-in"', stand.get("/login", cookie=fresh).text)
        for _fortnight in range(2):                             # and the fresh one has its own thirty days
            stand.clock.tick(days=13)
            self.assertEqual(stand.get("/", cookie=fresh).status, 200)
        stand.clock.tick(days=4, minutes=1)
        self.assertRefused(stand.get(ME, cookie=fresh), 401, "unauthenticated")

    def test_a_wrong_password_in_the_last_day_leaves_the_old_session_as_it_was(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.aged(29, hours=1)
        refused = stand.post(LOGIN, {"login": "mika", "password": "not " + PASSWORD}, cookie=cookie)
        self.assertRefused(refused, 401, "invalid_credentials")
        self.assertEqual(refused.all("Set-Cookie"), [])
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "an open page must go on saving")

    def test_a_session_unused_for_fourteen_days_is_over(self):
        stand = self.stand
        cookie = stand.session("mika")
        stand.clock.tick(days=13, hours=23)
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        stand.clock.tick(days=14, minutes=1)
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
        self.assertToLogin(stand.get("/", cookie=cookie))
        self.assertIn('data-state="form"', stand.get("/login", cookie=cookie).text)


# ---------------------------------------------------------------------------
# Signing out
# ---------------------------------------------------------------------------

class SignOutTests(Case):
    def test_sign_out_closes_the_session_on_every_door_and_clears_the_cookie_as_it_was_set(self):
        stand = self.stand
        cookie = stand.session("mika")
        other = stand.session("mika")
        out = stand.post(LOGOUT, {}, cookie=cookie)
        self.assertEqual((out.status, out.json()), (200, {"ok": True}))
        self.assertEqual(out.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertEqual(out.all("Clear-Site-Data"), ['"cache"'])
        for method, path, session in documented_routes():
            if not session:
                continue
            with self.subTest(route="%s %s" % (method, path)):
                answer = stand.request(method, path, {"base": 0, "doc": ledger()} if method == "PUT" else None, cookie=cookie)
                if path.startswith("/api/") or path in VENDOR:
                    self.assertRefused(answer, 401, "unauthenticated")
                else:
                    self.assertToLogin(answer)
        self.assertIn('data-state="form"', stand.get("/login", cookie=cookie).text)
        self.assertEqual(stand.get(ME, cookie=other).status, 200, "the same founder's other browser stays signed in")
        self.assertNothingStored()
        self.assertEqual([entry["login"] for entry in stand.security_events() if entry["event"] == "sign-out"], ["mika"])

    def test_sign_out_needs_no_session(self):
        stand = self.stand
        ended = stand.session("mika")
        stand.post(LOGOUT, {}, cookie=ended)
        for cookie in (None, ended, "money-dev=" + "A" * 43, "money-dev=x"):
            with self.subTest(cookie=cookie):
                out = stand.post(LOGOUT, {}, cookie=cookie)
                self.assertEqual((out.status, out.json()), (200, {"ok": True}))
                self.assertEqual(out.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
                self.assertEqual(out.all("Clear-Site-Data"), ['"cache"'])

    def test_another_site_cannot_sign_a_founder_out(self):
        stand = self.stand
        cookie = stand.session("mika")
        for options in ({"origin": "https://evil.example"}, {"origin": None}, {"headers": {"Sec-Fetch-Site": "cross-site"}},
                        {"headers": {"Sec-Fetch-Site": "same-site"}}):
            self.assertRefused(stand.post(LOGOUT, {}, cookie=cookie, **options), 403, "bad_origin")
        self.assertRefused(stand.post(LOGOUT, body=b"", cookie=cookie,
                                      headers={"Content-Type": "application/x-www-form-urlencoded"}), 415, "bad_content_type")
        for method in ("GET", "HEAD", "PUT", "DELETE"):
            self.assertEqual(stand.request(method, LOGOUT, cookie=cookie, origin=None).status, 405)
        self.assertToLogin(stand.get("/logout", cookie=cookie, headers={"Sec-Fetch-Site": "cross-site"}))
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "the founder is still signed in")

    def test_on_a_stand_the_cookie_is_host_bound_and_secure_when_set_and_when_cleared(self):
        for name in ("prod", "test"):
            with self.subTest(stand=name):
                stand = self.server_stand(name)
                stand.set_password("mika")
                # What a proxy says about the scheme is never asked.
                for scheme in ({}, {"X-Forwarded-Proto": "http"}, {"X-Forwarded-Proto": "https"}, {"Forwarded": "proto=http"}):
                    signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=scheme)
                    self.assertEqual(signed.status, 200, signed.body)
                    cookie = signed.cookie("__Host-money")
                    self.assertEqual(signed.all("Set-Cookie"),
                                     ["%s; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000" % cookie])
                    out = stand.post(LOGOUT, {}, cookie=cookie, headers=scheme)
                    self.assertEqual(out.all("Set-Cookie"), ["__Host-money=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"])
                    self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
                # The dev stand's cookie name opens nothing on a stand.
                token = stand.token_of(stand.session("mika"))
                self.assertRefused(stand.get(ME, cookie="money-dev=" + token), 401, "unauthenticated")
                self.assertEqual(stand.get(ME, cookie="__Host-money=" + token).status, 200)

    def test_what_a_proxy_says_about_the_scheme_does_not_make_the_dev_cookie_secure(self):
        stand = self.stand
        stand.set_password("mika")
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-Proto": "https"})
        self.assertEqual(signed.all("Set-Cookie"),
                         ["%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" % signed.cookie("money-dev")])


# ---------------------------------------------------------------------------
# The platform's old cookie
# ---------------------------------------------------------------------------

class OldCookieTests(Case):
    OLD = "ssp_session=PLATFORM-SESSION-0123456789abcdefghijklmnopqrstuv"

    def test_the_platforms_cookie_signs_nobody_in(self):
        stand = self.stand
        token = stand.token_of(stand.session("mika"))
        for cookie in (self.OLD, "ssp_session=" + token, "ssp_session=" + token + "; money-dev=", "money-dev=; ssp_session=" + token):
            with self.subTest(cookie=cookie[:24]):
                self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
                self.assertToLogin(stand.get("/", cookie=cookie))
                self.assertIn('data-state="form"', stand.get("/login", cookie=cookie).text)

    def test_the_platforms_cookie_is_cleared_by_the_first_answer_whatever_that_answer_is(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = stand.session("mika")
        clear = "ssp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        both = self.OLD + "; " + cookie
        first_answers = {
            "the page": stand.get("/", cookie=both),
            "a stranger at the page": stand.get("/", cookie=self.OLD),
            "the sign-in page": stand.get("/login", cookie=self.OLD),
            "a refusal under /api/": stand.get(ME, cookie=self.OLD),
            "a document": stand.get(LEDGER, cookie=both),
            "a vendor file": stand.get(VENDOR[0], cookie=both),
            "a path that is not there": stand.get("/nothing", cookie=both),
            "a failed sign-in": stand.post(LOGIN, {"login": "mika", "password": "x" * 12}, cookie=self.OLD),
        }
        for what, answer in first_answers.items():
            with self.subTest(answer=what):
                self.assertEqual(answer.all("Set-Cookie"), [clear])
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, cookie=self.OLD)
        self.assertEqual(sorted(value.split("=")[0] for value in signed.all("Set-Cookie")), ["money-dev", "ssp_session"])
        self.assertIn(clear, signed.all("Set-Cookie"))
        # A browser that no longer sends it is not told again.
        self.assertEqual(stand.get("/", cookie=cookie).all("Set-Cookie"), [])
        self.assertEqual(stand.get("/login").all("Set-Cookie"), [])

    def test_on_a_stand_it_is_cleared_with_the_attributes_the_platform_set_it_with(self):
        # The platform: path "/", HttpOnly, SameSite=Lax, Secure on https, no Domain.
        prod = self.server_stand("prod")
        answer = prod.get("/", cookie=self.OLD)
        self.assertEqual(answer.all("Set-Cookie"), ["ssp_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"])

    def test_the_platforms_cookie_is_never_written_down(self):
        stand = self.stand
        cookie = stand.session("mika")
        stand.get("/", cookie=self.OLD + "; " + cookie)
        stand.get(ME, cookie=self.OLD)
        stand.post(LOGIN, {"login": "mika", "password": "x" * 12}, cookie=self.OLD)
        stand.post(LOGOUT, {}, cookie=self.OLD + "; " + cookie)
        secret = self.OLD.split("=", 1)[1]
        self.assertNotIn(secret, stand.log_text())
        for root, _directories, files in os.walk(stand.data_dir):
            for name in files:
                self.assertNotIn(secret.encode("ascii"), read(os.path.join(root, name)), name)


# ---------------------------------------------------------------------------
# Whose request it is: X-Forwarded-For
# ---------------------------------------------------------------------------

class ForwardedForTests(Case):
    EDGE = {"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"}     # the tests' own address stands in for the edge

    def setUp(self):
        pass

    def address(self, stand: Any, *lines: str) -> str:
        """The address the server wrote down for a request that carried ``lines``."""
        before = len(stand.log_lines())
        answer = exchange(stand, lines_of(stand, "GET", "/robots.txt", *lines))
        self.assertEqual(answer.status, 200)
        written = stand.log_lines()[before:]
        self.assertEqual(len(written), 1)
        return written[0]["addr"]

    def test_without_a_trusted_proxy_the_address_is_the_peers_whatever_a_header_says(self):
        stand = self.new_stand()
        for lines in (("X-Forwarded-For: 203.0.113.9",), ("X-Forwarded-For: 198.51.100.1, 203.0.113.9",),
                      ("X-Forwarded-For: 203.0.113.9", "X-Forwarded-For: 203.0.113.10"), ("X-Forwarded-For: ::1",),
                      ("X-Real-IP: 203.0.113.9",), ("Forwarded: for=203.0.113.9",)):
            with self.subTest(lines=lines):
                self.assertEqual(self.address(stand, *lines), "127.0.0.1")

    def test_a_peer_outside_the_trusted_ranges_is_not_believed(self):
        # The ranges of the compose file: the Docker bridge. The tests' loopback peer is in none of them.
        stand = self.new_stand(env={"MONEY_TRUSTED_PROXIES": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"})
        self.assertEqual(self.address(stand, "X-Forwarded-For: 203.0.113.9"), "127.0.0.1")
        self.assertEqual(self.address(stand, "X-Forwarded-For: 10.1.2.3"), "127.0.0.1")

    def test_a_trusted_peer_is_believed_and_the_right_most_entry_is_the_one(self):
        stand = self.new_stand(env=self.EDGE)
        cases = (
            (("X-Forwarded-For: 203.0.113.9",), "203.0.113.9"),
            (("X-Forwarded-For: 198.51.100.1, 203.0.113.9",), "203.0.113.9"),
            (("X-Forwarded-For: 198.51.100.1,203.0.113.9",), "203.0.113.9"),
            (("X-Forwarded-For:   198.51.100.1 ,  203.0.113.9  ",), "203.0.113.9"),
            (("X-Forwarded-For: 127.0.0.1, 10.0.0.1, 203.0.113.9",), "203.0.113.9"),
            (("X-Forwarded-For: 198.51.100.1", "X-Forwarded-For: 203.0.113.9"), "203.0.113.9"),
            (("x-forwarded-for: 203.0.113.9",), "203.0.113.9"),
            (("X-Forwarded-For: 2001:db8::1, 2001:db8:0:1::7",), "2001:db8:0:1::7"),
            (("X-Forwarded-For: ::ffff:203.0.113.9",), "203.0.113.9"),
            ((), "127.0.0.1"),
        )
        for lines, expected in cases:
            with self.subTest(lines=lines):
                self.assertEqual(self.address(stand, *lines), expected)

    def test_an_entry_that_is_no_address_leaves_the_peers_and_never_an_entry_a_client_wrote(self):
        stand = self.new_stand(env=self.EDGE)
        for value in ("unknown", "203.0.113.9:4711", "203.0.113.999", "evil.example", "203.0.113.9, garbage",
                      "203.0.113.9,", "203.0.113.9 203.0.113.10", "203.0.113.9;203.0.113.10", "", ",", "1.2.3"):
            with self.subTest(value=value):
                self.assertIn(self.address(stand, "X-Forwarded-For: " + value), ("127.0.0.1", "203.0.113.9")
                              if value == "203.0.113.9," else ("127.0.0.1",))

    def test_no_other_header_is_asked_who_is_calling(self):
        stand = self.new_stand(env=self.EDGE)
        for line in ("X-Real-IP: 203.0.113.9", "Forwarded: for=203.0.113.9;proto=https", "X-Client-IP: 203.0.113.9",
                     "CF-Connecting-IP: 203.0.113.9", "True-Client-IP: 203.0.113.9", "X-Forwarded: 203.0.113.9",
                     "X_Forwarded_For: 203.0.113.9", "X-Forwarded-For-Original: 203.0.113.9"):
            with self.subTest(line=line):
                self.assertEqual(self.address(stand, line), "127.0.0.1")

    def test_a_forged_header_does_not_get_a_stranger_past_the_sign_in_limit(self):
        # Ten failures per client address in fifteen minutes. Nobody is believed but the edge.
        stand = self.new_stand()
        stand.set_password("mika")
        wrong = {"login": "mika", "password": "not the password at all"}
        for attempt in range(10):
            answer = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "198.51.100.%d" % attempt})
            self.assertRefused(answer, 401, "invalid_credentials")
        blocked = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "198.51.100.200"})
        self.assertRefused(blocked, 429, "too_many_attempts", extra=("retryAfter",))
        self.assertEqual(blocked.header("Retry-After"), str(blocked.json()["retryAfter"]))

    def test_behind_the_edge_what_a_client_wrote_into_the_header_does_not_move_its_address(self):
        stand = self.new_stand(env=self.EDGE)
        stand.set_password("mika")
        wrong = {"login": "mika", "password": "not the password at all"}
        for attempt in range(10):
            forged = "198.51.100.%d, 203.0.113.7" % attempt        # the client's own line, then what the edge appended
            self.assertRefused(stand.post(LOGIN, wrong, headers={"X-Forwarded-For": forged}), 401, "invalid_credentials")
        blocked = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "192.0.2.55, 203.0.113.7"})
        self.assertRefused(blocked, 429, "too_many_attempts", extra=("retryAfter",))
        # Another client of the same edge has a count of its own - and the right password still signs in.
        other = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "203.0.113.7, 203.0.113.8"})
        self.assertRefused(other, 401, "invalid_credentials")
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "203.0.113.8"})
        self.assertEqual(signed.status, 200)
        failed = [entry for entry in stand.security_events() if entry["event"] == "sign-in-failed"]
        self.assertEqual({entry["addr"] for entry in failed}, {"203.0.113.7", "203.0.113.8"})


    def test_behind_the_edge_an_ipv6_subscriber_is_one_address_whichever_of_its_addresses_it_uses(self):
        # "IPv6 addresses are counted by /64": ten failures from ten addresses of one /64 are ten failures of one caller.
        stand = self.new_stand(env=self.EDGE)
        stand.set_password("mika")
        wrong = {"login": "mika", "password": "not the password at all"}
        for attempt in range(10):
            answer = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "2001:db8:1:2::%x" % (attempt + 1)})
            self.assertRefused(answer, 401, "invalid_credentials")
        blocked = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "2001:db8:1:2:ffff:ffff:ffff:ffff"})
        self.assertRefused(blocked, 429, "too_many_attempts", extra=("retryAfter",))
        neighbour = stand.post(LOGIN, wrong, headers={"X-Forwarded-For": "2001:db8:1:3::1"})
        self.assertRefused(neighbour, 401, "invalid_credentials")


# ---------------------------------------------------------------------------
# Threads, the slots of strangers, connections of one address
# ---------------------------------------------------------------------------

class CapacityTests(Case):
    """What is held here is held until the test lets go of it: the stands are tuned ``HELD``, so that a body
    that never comes is waited for as long as the test runs, and not for the five seconds after which a
    busy machine would find the slots free again. The five seconds themselves are ``DeadlineTests``'."""

    EDGE = {"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"}     # the tests' own address stands in for the edge: it says who asks

    def setUp(self):
        pass

    def stalled_sign_in(self, stand: Any, *more: str) -> bytes:
        """The head of a sign-in whose body never comes: it holds a signed-out slot until its deadline."""
        return lines_of(stand, "POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                        "Content-Length: 40", *more)

    def stalled_save(self, stand: Any, cookie: str, *more: str) -> bytes:
        """The head of a founder's save whose body never comes: a connection of its address, and no slot."""
        return lines_of(stand, "PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: application/json",
                        "Content-Length: 40", *more, cookie=cookie)

    def hold(self, stand: Any, count: int, data: bytes, already: int = 0, saves: bool = False) -> List[Wire]:
        """``count`` more connections that have sent ``data``, on top of the ``already`` held - and every one
        of them let in before this returns: a stalled sign-in holds a signed-out slot, a founder's stalled
        save (``saves``) is counted for its address. Not merely begun: between a request's first line and
        the limit it is counted under, whatever the test sends next can overtake it - and is then let in
        in its place, while the one that was meant to be held is turned away."""
        wires = [self.wire(data, stand) for _number in range(count)]
        taken = stand.counted if saves else stand.server.signed_out
        self.assertTrue(until(lambda: taken() == already + count), "the stalled requests were not let in")
        return wires

    def assertWaitedFor(self, wires: List[Wire], why: str) -> None:
        """None of these connections has been answered or closed: the server is still waiting for each body."""
        self.assertEqual([(wire.peek(), wire.ended) for wire in wires], [(b"", False)] * len(wires), why)

    def test_the_numbers_are_the_documented_ones(self):
        settings = self.new_stand(start=False).settings
        self.assertEqual((settings.max_connections, settings.signed_out_slots, settings.max_connections_per_address),
                         (32, 8, 12))
        self.assertEqual(settings.signed_out_body_slots_per_address, 2, "one address holds two of the eight, no more")

    # -- the signed-out slots ----------------------------------------------------
    #
    # A request without a session that announces a body takes one of 8 slots, and one of the 2 its
    # client address may hold; with no slot it is told 503 busy at once. A request without a body
    # takes none: once its head is read it cannot make the server wait.

    def fill(self, stand: Any) -> List[Wire]:
        """Eight sign-ins whose bodies never come, two from each of four addresses: every signed-out slot is taken."""
        wires = []     # type: List[Wire]
        for last in (1, 2, 3, 4):
            wires += self.hold(stand, 2, self.stalled_sign_in(stand, "X-Forwarded-For: 203.0.113.%d" % last),
                               already=len(wires))
        return wires

    def test_eight_stalled_sign_ins_keep_no_founder_waiting_and_the_ninth_body_gets_503_at_once(self):
        # The numbers are the stand's own: eight slots, two an address. Only the bodies are waited for longer.
        stand = self.new_stand(env=self.EDGE, tune=HELD)
        cookie = stand.session("mika")
        wires = self.fill(stand)
        # Signed-in requests never wait behind signed-out ones: each is answered while all eight still stall.
        self.assertEqual(stand.get(ME, cookie=cookie).json()["firstName"], "Mika")
        self.assertEqual(len(stand.get("/", cookie=cookie).body), os.path.getsize(INDEX))
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie).json(), {"rev": 1})
        self.assertEqual(stand.get("/data", cookie=cookie).status, 200)
        self.assertEqual(stand.get("/login", cookie=cookie).status, 200)
        self.assertEqual(stand.post(LOGOUT, {}, cookie=stand.session("vanya")).status, 200)
        self.assertEqual(stand.server.signed_out(), 8, "a founder was served by letting go of a stranger")
        ninth = {"X-Forwarded-For": "203.0.113.9"}  # an address that holds no slot of its own
        for method, path in (("POST", LOGIN), ("POST", SETUP), ("POST", LOGOUT), ("PUT", LEDGER), ("PUT", "/nothing"),
                             ("POST", "/login")):
            with self.subTest(ninth="%s %s" % (method, path)):
                # 503 at once, not after somebody's deadline: nobody's deadline comes on this stand.
                answer = stand.request(method, path, {"base": 0, "doc": ledger()}, headers=ninth)
                self.assertRefused(answer, 503, "busy")
                self.assertEqual(answer.header("Retry-After"), "1")
                self.assertEqual(stand.server.signed_out(), 8)
        # A body announced on a door that takes none is still a body somebody may dawdle over.
        odd = exchange(stand, lines_of(stand, "GET", "/login", "Content-Length: 2", "X-Forwarded-For: 203.0.113.9") + b"{}")
        self.assertRefused(odd, 503, "busy")
        # A cookie that is no session does not make a stranger a founder.
        self.assertRefused(stand.post(LOGIN, {}, cookie="money-dev=" + "A" * 43, headers=ninth), 503, "busy")
        # The container's own health check is not a stranger: a full house is not an unhealthy one.
        self.assertEqual(stand.get("/healthz").status, 200)
        self.assertWaitedFor(wires, "the eight are still being waited for")

    def test_a_request_without_a_body_takes_no_slot_so_the_pages_stay_reachable_when_every_slot_is_taken(self):
        # Once its head is read, a request without a body cannot make the server wait: it is answered
        # whatever is stalled. So the sign-in page, its script and stylesheet and every refusal stay
        # reachable - a founder who opens /login during an attack sees the page, not a line of JSON.
        stand = self.new_stand(env=self.EDGE, tune=HELD)
        wires = self.fill(stand)
        for who in ("203.0.113.9", "203.0.113.1"):  # a bystander, and an address that holds its two slots
            mine = {"X-Forwarded-For": who}
            for path in ("/login", "/set-password", "/assets/auth.js", "/assets/auth.css", "/robots.txt"):
                with self.subTest(who=who, path=path):
                    self.assertEqual(stand.get(path, headers=mine).status, 200)
                    self.assertEqual(stand.request("HEAD", path, headers=mine).status, 200)
            self.assertToLogin(stand.get("/", headers=mine))
            self.assertToLogin(stand.get("/nothing", headers=mine))
            self.assertRefused(stand.get(ME, headers=mine), 401, "unauthenticated")
            self.assertRefused(stand.get(VENDOR[0], headers=mine), 401, "unauthenticated")
            self.assertEqual(stand.get("/logout", headers=mine).header("Location"), "/login")
            # "Content-Length: 0" announces no body either: the request is judged by its door, not turned away.
            empty = dict(mine, **JSON)
            self.assertEqual(stand.post(LOGOUT, body=b"", headers=empty).status, 200)
            self.assertRefused(stand.post(LOGIN, body=b"", headers=empty), 400, "bad_json")
            # ... and so does a request that names no length at all: 411 from its door, as ever.
            unsized = exchange(stand, lines_of(stand, "POST", LOGIN, "Origin: " + stand.origin,
                                               "Content-Type: application/json", "X-Forwarded-For: " + who))
            self.assertRefused(unsized, 411, "length_required")
        # The self-check that gates a deploy asks for pages as a stranger does: a deploy made while
        # somebody stalls the slots must not be told that the new image is broken, and go back.
        check = stand.ctl("selfcheck")
        self.assertEqual(check.status, 0, check.out)
        self.assertWaitedFor(wires, "none of the eight was let go to make room")

    def test_one_address_holds_two_slots_and_cannot_shut_the_sign_in_or_the_way_out_of_a_lock_out(self):
        # The reviewers' attack: eight sign-ins whose bodies never come, from ONE address, renewed as they
        # are cut. It used to keep every stranger - a founder on a new phone - at 503, the one-time link included.
        stand = self.new_stand(env=self.EDGE, tune=HELD)
        stand.set_password("mika")
        token = stand.invite("misha")
        attacker = "X-Forwarded-For: 203.0.113.7"
        held = self.hold(stand, 2, self.stalled_sign_in(stand, attacker))
        for _more in range(6):                      # the other six are turned away at once, each of them:
            wire = self.wire(self.stalled_sign_in(stand, attacker), stand)
            answer = wire.answer()                  # answered with no body sent, and no deadline to wait out
            self.assertRefused(answer, 503, "busy")
            self.assertEqual(answer.header("Retry-After"), "1")
            wire.close()
        self.assertWaitedFor(held, "the address keeps the two slots it may hold")
        self.assertEqual((stand.server.signed_out(), stand.server.signed_out("203.0.113.7")), (2, 2))
        self.assertTrue(until(lambda: stand.server.in_flight() == 2), "the six that were turned away are not gone")
        # Everybody else is served: the page, the sign-in, and the link that is the way out of a lock-out.
        founder = {"X-Forwarded-For": "203.0.113.8"}
        self.assertEqual(stand.get("/login", headers=founder).status, 200)
        self.assertEqual(stand.get("/assets/auth.css", headers=founder).status, 200)
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=founder)
        self.assertEqual((signed.status, signed.json()["firstName"]), (200, "Mika"))
        linked = stand.post(SETUP, {"token": token, "password": PASSWORD}, headers=founder)
        self.assertEqual((linked.status, linked.json()["firstName"]), (200, "Misha"), "a valid link always gets through")
        # The address itself is not shut out of what cannot stall: it still gets the page.
        self.assertEqual(stand.get("/login", headers={"X-Forwarded-For": "203.0.113.7"}).status, 200)
        # An IPv6 subscriber is one address whichever of its addresses it uses, here as for every other count.
        six = self.hold(stand, 2, self.stalled_sign_in(stand, "X-Forwarded-For: 2001:db8:1:2::1"), already=2)
        same = stand.post(LOGIN, {}, headers={"X-Forwarded-For": "2001:db8:1:2:aaaa::9"})
        self.assertRefused(same, 503, "busy")
        self.assertRefused(stand.post(LOGIN, {}, headers={"X-Forwarded-For": "2001:db8:1:3::1"}), 400, "missing_credentials")
        self.assertWaitedFor(six, "two of one /64 are let in")
        # And when its two are over, the address is taken in again: its share is given back.
        for wire in held:
            wire.close()
        self.assertTrue(until(lambda: stand.server.signed_out("203.0.113.7") == 0))
        again = self.hold(stand, 2, self.stalled_sign_in(stand, attacker), already=2)
        self.assertWaitedFor(again, "the address did not get its two slots back")
        self.assertEqual(stand.server.signed_out("203.0.113.7"), 2)

    def test_without_a_trusted_proxy_a_header_gets_an_address_no_more_slots(self):
        stand = self.new_stand(tune=HELD)           # nobody is believed about who is asking: one address, the peer's
        held = self.hold(stand, 2, self.stalled_sign_in(stand, "X-Forwarded-For: 198.51.100.1"))
        for forwarded in ("198.51.100.2", "10.0.0.1", "::1"):
            answer = stand.post(LOGIN, {}, headers={"X-Forwarded-For": forwarded})
            self.assertRefused(answer, 503, "busy")
        self.assertWaitedFor(held, "the peer's own two")

    def given_back(self, stand: Any, count: int, lost: str) -> None:
        """``count`` stalled sign-ins are as many as this stand lets in at once. They end in each of the three
        ways a request can end, and each time ``count`` more are let in - not one fewer."""
        def taken(why: str) -> List[Wire]:
            wires = self.hold(stand, count, self.stalled_sign_in(stand))
            self.assertRefused(stand.post(LOGIN, {}), 503, "busy")
            self.assertWaitedFor(wires, why)
            return wires

        for how in ("the caller hung up", "the body missed its deadline", "the body came"):
            with self.subTest(how=how):
                if how == "the body missed its deadline":
                    # A deadline that comes cannot be held still while the slots are counted: a third of a
                    # second is nothing to a machine that is busy elsewhere. So these are not counted at one
                    # moment. Each is seen let in - it is not answered - and cut: the server hangs up.
                    stand.retune(auth_body_deadline=0.3)
                    wires = [self.wire(self.stalled_sign_in(stand), stand) for _number in range(count)]
                    for wire in wires:
                        self.assertTrue(wire.hangs_up(), "a body that missed its deadline was not cut")
                        self.assertEqual(wire.received, b"", "one of them was turned away, or answered")
                    stand.retune(auth_body_deadline=NEVER)
                else:
                    wires = taken("one of them was turned away")
                    for wire in wires:
                        if how == "the caller hung up":
                            wire.close()
                        else:
                            self.assertTrue(wire.send(b" " * 40).hangs_up(), "a body that came was not answered")
                self.assertTrue(until(lambda: stand.server.connections() == 0))
                self.assertEqual((stand.server.signed_out(), stand.server.signed_out("127.0.0.1")), (0, 0))
                # All of them are free again: as many more strangers can be served at the same time.
                again = taken(lost)
                for wire in again:
                    wire.close()
                self.assertTrue(until(lambda: stand.server.connections() == 0))
                self.assertRefused(stand.post(LOGIN, {}), 400, "missing_credentials")
        self.assertEqual((stand.server.signed_out(), stand.server.signed_out("127.0.0.1")), (0, 0))

    def test_a_slot_is_given_back_however_its_request_ended(self):
        # One address may take all eight on this stand, so that what is counted is the eight themselves.
        stand = self.new_stand(tune=dict(HELD, signed_out_body_slots_per_address=8))
        self.given_back(stand, 8, "one of the eight was turned away: a slot was not given back")

    def test_an_address_gets_its_two_back_however_its_requests_ended(self):
        stand = self.new_stand(tune=HELD)
        self.given_back(stand, 2, "one of the two was turned away: the address's share was not given back")

    def test_a_request_that_is_refused_gives_its_slot_back_too(self):
        stand = self.new_stand(tune=dict(HELD, signed_out_body_slots_per_address=8))
        body = ("Content-Type: application/json", "Content-Length: 2")
        for _round in range(3):
            for request in (self.head("GET", ME, stand=stand), self.head("GET", "/nothing", stand=stand),
                            self.head("DELETE", "/login", stand=stand), self.head("POST", "/login", stand=stand),
                            self.head("GET", "/login", "Host: evil.example", host="", stand=stand),
                            self.head("POST", LOGIN, "Origin: https://evil.example", "Content-Length: 2", stand=stand) + b"{}",
                            self.head("POST", LOGIN, "Origin: " + stand.origin, "Content-Type: text/plain",
                                      "Content-Length: 2", stand=stand) + b"{}",
                            self.head("POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                                      "Content-Length: 9999", stand=stand),
                            self.head("POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                                      "Content-Length: 1", stand=stand) + b"{",
                            # a body sent to a door behind the session, to no door at all, under no method at all
                            self.head("PUT", LEDGER, "Origin: " + stand.origin, *body, stand=stand) + b"{}",
                            self.head("POST", "/nothing", *body, stand=stand) + b"{}",
                            self.head("DELETE", LEDGER, *body, stand=stand) + b"{}",
                            b"not a request\r\n\r\n"):
                answered = exchange(stand, request)
                self.assertGreaterEqual(answered.status, 300)
                self.assertNotEqual(answered.status, 503, "a slot was lost on the way")
                # Given back a moment after the answer: a refused request is let go of once it is answered.
                self.assertTrue(until(lambda: stand.server.signed_out() == 0), "a refused request kept its slot")
            # ... and a body sent to a door that takes none: served, the body never read, its slot given back.
            self.assertEqual(exchange(stand, self.head("GET", "/login", *body, stand=stand) + b"{}").status, 200)
            self.assertTrue(until(lambda: stand.server.signed_out() == 0), "a body nobody read kept its slot")
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        again = self.hold(stand, 8, self.stalled_sign_in(stand))
        self.assertRefused(stand.post(LOGIN, {}), 503, "busy")
        self.assertWaitedFor(again, "a refused request kept a slot")

    def test_twelve_connections_of_one_address_and_the_thirteenth_is_turned_away(self):
        stand = self.new_stand(env=self.EDGE, tune=HELD)        # the edge says who is asking
        cookie = stand.session("mika")
        seven, eight, nine = ({"X-Forwarded-For": "203.0.113.%d" % last} for last in (7, 8, 9))
        first = self.hold(stand, 12, self.stalled_save(stand, cookie, "X-Forwarded-For: 203.0.113.7"), saves=True)
        for who in (cookie, None):
            answer = stand.get(ME if who else "/login", cookie=who, headers=seven)
            self.assertRefused(answer, 503, "too_many_connections")
            self.assertEqual(answer.header("Retry-After"), "1")
        # What the client itself wrote into the header does not give it another address.
        forged = stand.get(ME, cookie=cookie, headers={"X-Forwarded-For": "203.0.113.8, 203.0.113.7"})
        self.assertRefused(forged, 503, "too_many_connections")
        # Everybody else is served: the cap is the client's, not the edge's.
        self.assertEqual(stand.get(ME, cookie=cookie, headers=eight).status, 200)
        self.assertEqual(stand.get("/login", headers=eight).status, 200)
        more = self.hold(stand, 12, self.stalled_save(stand, cookie, "X-Forwarded-For: 203.0.113.8"), already=12,
                         saves=True)
        self.assertRefused(stand.get(ME, cookie=cookie, headers=eight), 503, "too_many_connections")
        self.assertWaitedFor(more, "twelve of another address are let in beside the first twelve")
        self.assertEqual(stand.get(ME, cookie=cookie, headers=nine).status, 200)
        self.assertWaitedFor(first, "the twelfth connection of an address is still let in")

    def test_the_twelve_are_counted_for_an_ipv6_subscriber_as_a_whole(self):
        stand = self.new_stand(env=self.EDGE, tune=HELD)
        cookie = stand.session("mika")
        wires = [self.wire(self.stalled_save(stand, cookie, "X-Forwarded-For: 2001:db8:1:2::%x" % (number + 1)), stand)
                 for number in range(12)]
        self.assertTrue(until(lambda: stand.counted() == 12), "the stalled saves were not let in")
        same = stand.get(ME, cookie=cookie, headers={"X-Forwarded-For": "2001:db8:1:2:aaaa::9"})
        self.assertRefused(same, 503, "too_many_connections")
        other = stand.get(ME, cookie=cookie, headers={"X-Forwarded-For": "2001:db8:1:3::1"})
        self.assertEqual(other.status, 200)
        self.assertWaitedFor(wires, "twelve addresses of one /64 are twelve connections of one caller, all let in")

    def test_without_a_trusted_proxy_a_header_gets_an_address_no_more_connections(self):
        stand = self.new_stand(tune=HELD)
        cookie = stand.session("mika")
        wires = self.hold(stand, 12, self.stalled_save(stand, cookie), saves=True)
        for forwarded in ("198.51.100.77", "10.0.0.1", "::1"):
            answer = stand.get(ME, cookie=cookie, headers={"X-Forwarded-For": forwarded})
            self.assertRefused(answer, 503, "too_many_connections")
        # ... and the count is given back with the connection.
        for wire in wires:
            wire.close()
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        again = self.hold(stand, 12, self.stalled_save(stand, cookie), saves=True)
        self.assertRefused(stand.get(ME, cookie=cookie), 503, "too_many_connections")
        self.assertWaitedFor(again, "the address did not get its twelve back")

    def test_with_no_thread_free_the_answer_is_a_bare_503(self):
        # 32 threads, each kept by a caller that says nothing - for as long as the test runs, not for 30 seconds.
        stand = self.new_stand(tune={"socket_timeout": NEVER})
        cookie = stand.session("mika")
        idle = [self.wire(stand=stand) for _number in range(32)]
        self.assertTrue(until(lambda: stand.server.connections() == 32))
        for _who in ("a stranger", "a founder"):
            wire = self.wire(stand=stand)
            self.assertTrue(wire.hangs_up())
            self.assertTrue(wire.received.startswith(b"HTTP/1.1 503 "), wire.received[:80])
            head, blank, body = wire.received.partition(b"\r\n\r\n")
            self.assertEqual((blank, body), (b"\r\n\r\n", b""), "bare: a status and no body")
            self.assertIn(b"\r\nContent-Length: 0", head)
            self.assertIn(b"\r\nConnection: close", head)
        for wire in idle:
            wire.close()
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        self.assertEqual(stand.get("/login").status, 200)


# ---------------------------------------------------------------------------
# Bodies that are not what a door takes
# ---------------------------------------------------------------------------

class JsonTests(Case):
    #: 4 KiB at most, and nothing but nesting.
    NESTED = {
        "arrays": b"[" * 2048 + b"]" * 2048,
        "arrays that never close": b"[" * 4096,
        "objects": b'{"a":' * 682 + b"1" + b"}" * 682,
        "objects that never close": b'{"":' * 1024,
        "arrays in objects": b'[{"a":' * 500 + b"1" + b"}]" * 500,
        "under a member the door reads": b'{"login":' + b"[" * 2040 + b"]" * 2040 + b"}",
        "under the token": b'{"token":' + b"[" * 2040 + b"]" * 2040 + b"}",
        "under the document": b'{"base":0,"doc":' + b"[" * 2038 + b"]" * 2038 + b"}",
    }

    def test_a_maximally_nested_4_kib_body_is_400_at_every_door_and_the_server_goes_on_answering(self):
        stand = self.stand
        cookie = stand.session("mika")
        doors = [("POST", door, None) for door in AUTH_DOORS] + [("PUT", LEDGER, cookie), ("PUT", PLAN, cookie)]
        for method, path, who in doors:
            for what, body in self.NESTED.items():
                with self.subTest(door=path, body=what):
                    self.assertLessEqual(len(body), 4096)
                    answer = stand.request(method, path, body=body, cookie=who, headers=JSON)
                    said = self.assertRefused(answer, 400)
                    self.assertIn(said["error"], ("bad_json", "bad_money_doc"))
                    self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "the server stopped answering")
        self.assertEqual(self.events("exception"), [])
        self.assertEqual(self.events("connection-error"), [])
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertNothingStored()

    def test_a_document_nested_past_all_reason_inside_its_string_is_400_bad_money_doc(self):
        stand = self.stand
        cookie = stand.session("mika")
        for path, member in ((LEDGER, "tx"), (PLAN, "banks")):
            for text in ("[" * 5000 + "]" * 5000, '{"%s":%s1%s}' % (member, "[" * 5000, "]" * 5000),
                         '{"%s":[],"x":%s1%s}' % (member, '{"a":' * 5000, "}" * 5000)):
                with self.subTest(path=path, text=text[:20]):
                    answer = stand.put(path, {"base": 0, "doc": text}, cookie=cookie)
                    self.assertRefused(answer, 400, "bad_money_doc")
        self.assertEqual(self.events("exception"), [])
        self.assertNothingStored()

    def test_sixteen_levels_are_read_and_the_seventeenth_is_refused(self):
        stand = self.stand
        for depth, code in ((1, "missing_credentials"), (16, "missing_credentials"), (17, "bad_json"), (64, "bad_json")):
            with self.subTest(depth=depth):
                arrays = b"[" * depth + b"]" * depth
                objects = b'{"login":"mika","password":' + b'{"a":' * (depth - 1) + b"1" + b"}" * (depth - 1) + b"}"
                self.assertRefused(stand.post(LOGIN, body=arrays, headers=JSON), 400, code)
                self.assertRefused(stand.post(LOGIN, body=objects, headers=JSON), 400, code)

    def test_a_body_that_is_not_json_is_400_and_never_what_the_door_would_have_said(self):
        stand = self.stand
        cookie = stand.session("mika")
        bodies = (b" ", b"{", b"}", b"nul", b"{'login': 'mika'}", b'{"a": NaN}', b'{"a": Infinity}', b'{"a": -Infinity}',
                  b"\xff\xfe", b'{"a": "\xff"}', b'{"a":1}{"b":2}', b"[1,]", b'{"a":1,}', b'{"login":"mika","password":"x\x00y"}',
                  b"login=mika&password=x", b"<json/>")
        for body in bodies:
            for method, path, who in (("POST", LOGIN, None), ("POST", SETUP, None), ("POST", LOGOUT, cookie),
                                      ("PUT", LEDGER, cookie), ("PUT", PLAN, cookie)):
                with self.subTest(path=path, body=body):
                    self.assertRefused(stand.request(method, path, body=body, cookie=who, headers=JSON), 400, "bad_json")
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "a sign-out that was not JSON signed nobody out")
        self.assertEqual(self.events("exception"), [])
        self.assertNothingStored()

    def test_json_that_is_not_an_object_holds_no_credentials_and_no_document(self):
        stand = self.stand
        cookie = stand.session("mika")
        for body in (b'"mika"', b"12", b"null", b"true", b"[]", b'["mika","' + PASSWORD.encode("ascii") + b'"]'):
            with self.subTest(body=body):
                self.assertRefused(stand.post(LOGIN, body=body, headers=JSON), 400, "missing_credentials")
                self.assertRefused(stand.put(LEDGER, body=body, cookie=cookie, headers=JSON), 400, "bad_money_doc")
        for fields in ({}, {"login": "mika"}, {"password": PASSWORD}, {"login": "", "password": PASSWORD},
                       {"login": "mika", "password": ""}, {"login": ["mika"], "password": PASSWORD},
                       {"login": "mika", "password": 12345678901234}, {"login": None, "password": None},
                       {"login": "mika", "password": {"$ne": ""}}, {"login": {"$gt": ""}, "password": PASSWORD}):
            with self.subTest(fields=sorted(fields)):
                answer = stand.post(LOGIN, fields)
                self.assertRefused(answer, 400, "missing_credentials")
                self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertNothingStored()


# ---------------------------------------------------------------------------
# What is not HTTP at all
# ---------------------------------------------------------------------------

class MalformedTests(Case):
    def garbage(self) -> List[bytes]:
        host = b"Host: " + self.stand.host.encode("ascii") + b"\r\n"
        start = b"GET /login HTTP/1.1\r\n"
        end = b"\r\n"
        lines = [
            b"\r\n\r\n", b"\n", b"\x00", b"\x00" * 300, b"\xff" * 300, b"GET", b"GET ", b"GET /", b"GET / ", b"GET / HTTP",
            b"GET / HTTP/1.1", b"GET / HTTP/1.1\r\n", b"GET / HTTP/1.1\r\nHost", b"GET / HTTP/1.1\r\nHost: x",
            b"GET /login\r\n\r\n", b"GET /login HTTP/0.9\r\n" + host + end, b"GET /login HTTP/2.0\r\n" + host + end,
            b"GET /login HTTP/1.2\r\n" + host + end, b"GET /login HTTP/1.1 more\r\n" + host + end,
            b"GET /login http/1.1\r\n" + host + end, b"get /login HTTP/1.1\r\n" + host + end,
            b"Get /login HTTP/1.1\r\n" + host + end, b"G\xc3\x89T /login HTTP/1.1\r\n" + host + end,
            b"GET /lo gin HTTP/1.1\r\n" + host + end, b"GET\t/login\tHTTP/1.1\r\n" + host + end,
            b"GET  /login HTTP/1.1\r\n" + host + end, b" GET /login HTTP/1.1\r\n" + host + end,
            b"GET /login HTTP/1.1 \r\n" + host + end, b"GET /log\x00in HTTP/1.1\r\n" + host + end,
            b"GET /log\xffin HTTP/1.1\r\n" + host + end, b"GET /log\x7fin HTTP/1.1\r\n" + host + end,
            b"GET /login HTTP/1.1\r\r\n" + host + end, b"GET /login HTTP/1.1\r" + host + end,
            b"GET HTTP/1.1\r\n" + host + end, b" / HTTP/1.1\r\n" + host + end, b"/login\r\n" + host + end,
            b"TOOLONGAMETHODNAMEFORANYONE /login HTTP/1.1\r\n" + host + end, b"G=T /login HTTP/1.1\r\n" + host + end,
            b"\r\nGET /login HTTP/1.1\r\n" + host + end,
            b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n",
            b"\x16\x03\x01\x02\x00\x01\x00\x01\xfc\x03\x03" + bytes(range(256)),
            b"SSH-2.0-OpenSSH_9.6\r\n", b"\x05\x01\x00", b"EHLO finance.localhost\r\n", b"*1\r\n$4\r\nPING\r\n",
            start + host + b"NoColonHere\r\n" + end, start + host + b": no name\r\n" + end,
            start + host + b"Na me: x\r\n" + end, start + host + b"Name : x\r\n" + end,
            start + host + b" leading: space\r\n" + end, start + host + b"X-Folded: a\r\n b\r\n" + end,
            start + host + b"X-Folded: a\r\n\tb\r\n" + end, start + host + b"Name\x00: x\r\n" + end,
            start + host + b"Name: v\x00alue\r\n" + end, start + host + b"Name: v\ralue\r\n" + end,
            start + host + b"Na\xffme: x\r\n" + end, start + host + b"Name: \x01\x02\x03\r\n" + end,
            start + host + b"Name: \x7f\r\n" + end, start + host + b"(Name): x\r\n" + end,
            start + host + b"X" * 65 + b": long name\r\n" + end, start + b"Host: \xc3\xa9vil\r\n" + end,
            start + host, start + host + b"X-Cut: off",
            start + host + b"Expect: something\r\n" + end, start + host + b"Expect: 100-continue, x\r\n" + end,
            b"GET /login HTTP/1.0\r\n" + host + b"Expect: 100-continue\r\n" + end,
            b"GET /" + b"a" * 9000 + b" HTTP/1.1\r\n" + host + end,
            b"GET /" + b"a" * 5000 + b" HTTP/1.1\r\n" + host + end,
            start + host + b"X-Big: " + b"a" * 9000 + b"\r\n" + end,
            start + host + (b"X-Big: " + b"a" * 8000 + b"\r\n") * 5 + end,
            start + host + b"".join(b"X-%d: 1\r\n" % number for number in range(101)) + end,
            start + host + b"Cookie: " + b"money-dev=" + b"A" * 8200 + b"\r\n" + end,
            start + host * 50 + end,
        ]
        return lines

    def test_what_is_not_a_request_is_refused_with_a_4xx_and_never_breaks_a_thread(self):
        stand = self.stand
        cookie = stand.session("mika")
        for data in self.garbage():
            with self.subTest(sent=data[:48]):
                answer = exchange(stand, data)
                self.assertIsNotNone(answer, "no answer")
                self.assertIn(answer.status, (400, 414, 417, 421, 431), answer.raw[:120])
                self.assertRefused(answer, answer.status)
                self.assertFixedHeaders(answer)
                self.assertEqual(answer.raw.count(b"HTTP/1.1 "), 1)
                # The thread that read it is gone, and the next request is answered.
                self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        self.assertEqual(self.events("exception"), [])
        self.assertEqual(self.events("connection-error"), [])
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertEqual([line for line in stand.log_lines() if line.get("status", 0) >= 500], [])

    def test_a_header_value_may_hold_bytes_beyond_ascii_and_changes_nothing(self):
        stand = self.stand
        cookie = stand.session("mika")
        for line in (b"X-Latin: caf\xe9", b"X-Utf: \xd0\xbf\xd1\x80\xd0\xb8", b"User-Agent: \xf0\x9f\x92\xb8",
                     b"Cookie: other=\xd0\xb4; " + cookie.encode("ascii"), b"Accept-Language: ru\xff",
                     b"Cookie: big=" + b"A" * 8000 + b"; " + cookie.encode("ascii")[:0]):
            with self.subTest(line=line[:24]):
                answer = exchange(stand, self.head("GET", "/login", cookie=cookie)[:-2] + line + b"\r\n\r\n")
                self.assertEqual(answer.status, 200)
        self.assertEqual(self.events("exception"), [])

    # -- a header line is read in one pass, whatever it holds ----------------------------------------
    #
    # The headers are read before anything knows whose request this is: before the per-address cap,
    # before the signed-out slots. So what a header line costs must not depend on what a stranger put
    # into it. (It did: a value with a long run of blanks inside cost time that grew with the square of
    # the line - a second of the stand's one processor for four lines inside every documented limit.)

    def blanks(self, shape: bytes) -> bytes:
        """A whole request for /robots.txt with four header lines of about 8 KiB each, made of ``shape``:
        just inside every limit the documents name (8 KiB a line, 32 KiB and 100 headers in all)."""
        head = b"GET /robots.txt HTTP/1.1\r\nHost: " + self.stand.host.encode("ascii") + b"\r\n"
        lines = []
        for number in range(4):
            name = b"X-Pad-%d: " % number
            fill = (shape * (8150 // len(shape) + 1))[:8150 - len(name)]
            lines.append(name + b"a" + fill + b"b\r\n")
        data = head + b"".join(lines) + b"\r\n"
        self.assertLess(max(len(line) for line in lines), 8192)
        self.assertLess(len(b"".join(lines)), 32 * KIB)
        return data

    def served_in(self, data: bytes) -> float:
        """The quickest of three: what this request costs, in seconds of this process's own work (the
        server is a thread of it). Not seconds on the wall: those also count every moment the machine
        gave to somebody else, and a line of blanks is not slow because a neighbour is busy."""
        took = []
        for _run in range(3):
            began = time.process_time()
            answer = exchange(self.stand, data)
            took.append(time.process_time() - began)
            self.assertEqual(answer.status, 200, answer.raw[:120])
        return min(took)

    def test_a_header_line_full_of_blanks_costs_what_any_line_of_its_length_costs(self):
        plain = self.served_in(self.blanks(b"x"))
        for what, shape in (("spaces", b" "), ("tabs", b"\t"), ("spaces and tabs", b" \t"), ("blanks between words", b"a  \t "),
                            ("a blank, a letter, a run of blanks", b"x" + b" " * 63)):
            with self.subTest(value=what):
                took = self.served_in(self.blanks(shape))
                # The pattern this replaced needed about a second here, three hundred times the plain line.
                self.assertLess(took, plain * 10 + 0.1,
                                "a header line of blanks took %.3f s where a plain one of its length takes %.3f s"
                                % (took, plain))

    def test_a_header_value_loses_the_blanks_around_it_and_keeps_what_stands_inside(self):
        stand = self.new_stand(env={"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"})
        cookie = stand.session("mika")
        pad = b" \t" * 1500                         # 3 000 bytes of blanks: the line stays under 8 KiB
        cases = (
            (b"X-Forwarded-For:" + pad + b"203.0.113.9" + pad, "203.0.113.9"),                  # blanks around: gone
            (b"X-Forwarded-For:198.51.100.1," + pad + b"203.0.113.9", "203.0.113.9"),           # blanks inside: kept
            (b"X-Forwarded-For:203.0.113.9", "203.0.113.9"),                                    # none at all
        )
        for line, address in cases:
            with self.subTest(line=line[:32]):
                before = len(stand.log_lines())
                answer = exchange(stand, lines_of(stand, "GET", "/api/me", cookie=cookie)[:-2] + line + b"\r\n\r\n")
                self.assertEqual((answer.status, answer.json()["firstName"]), (200, "Mika"))
                self.assertEqual(stand.log_lines()[before]["addr"], address)
        # A value of nothing but blanks is an empty value, and a cookie between blanks is still the cookie.
        blank = exchange(stand, lines_of(stand, "GET", "/login")[:-2] + b"X-Empty:" + b" " * 8000 + b"\r\n\r\n")
        self.assertEqual(blank.status, 200)
        spaced = exchange(stand, lines_of(stand, "GET", "/api/me")[:-2] + b"Cookie:\t  " + cookie.encode("ascii") + b" \t \r\n\r\n")
        self.assertEqual(spaced.status, 200)

    def test_a_header_line_is_still_a_name_a_colon_and_a_value_and_nothing_else(self):
        stand = self.stand
        start = lines_of(stand, "GET", "/login")[:-2]
        good = (b"X: y", b"X:y", b"X:", b"X: ", b"x-" + b"a" * 62 + b": 1", b"X: a:b:c", b"X: \xe9\xff", b"X: a\tb",
                b"!#$%&'*+-.^_`|~0aZ: token", b"X: " + b"a" * 8000)
        bad = (b": no name", b"X y", b"X : y", b" X: y", b"X\t: y", b"x-" + b"a" * 63 + b": 1", b"X: a\x00b", b"X: a\x7fb",
               b"X: a\x0bb", b"X: a\rb", b"X: y\r", b"X(y): z", b"X\xff: y", b"X=y", b"\xd0\xa5: y", b"")
        for line in good:
            with self.subTest(good=line[:24]):
                self.assertEqual(exchange(stand, start + line + b"\r\n\r\n").status, 200)
                self.assertEqual(exchange(stand, start + line + b"\n\n").status, 200, "a bare line feed ends a line too")
        for line in bad:
            with self.subTest(bad=line[:24]):
                answer = exchange(stand, start + line + b"\r\n" + (b"\r\n" if line else b"X: y\r\n\r\n")) \
                    if line else exchange(stand, start + b"\r\nX y\r\n\r\n")
                self.assertIsNotNone(answer)
                if line:
                    self.assertRefused(answer, 400, "bad_request")
                else:
                    self.assertEqual(answer.status, 200, "a blank line ends the headers; what follows is not read as one")
        self.assertEqual(self.events("exception"), [])

    def test_nothing_asked_is_nothing_answered(self):
        stand = self.stand
        for data in (b"",):
            wire = self.wire(data)
            wire.done()
            self.assertTrue(wire.hangs_up())
            self.assertEqual(wire.received, b"")
        self.assertEqual([line for line in stand.log_lines() if "path" in line], [], "and nothing is written down")

    def test_a_peer_that_goes_away_in_the_middle_of_anything_breaks_nothing(self):
        stand = self.stand
        cookie = stand.session("mika")
        whole = self.head("PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: application/json",
                          "Content-Length: 4000", cookie=cookie) + b'{"base":0,"doc":"{'
        for cut in (1, 7, 20, len(whole) - 30, len(whole) - 18, len(whole)):
            for rude in (False, True):
                wire = Wire(stand)
                wire.send(whole[:cut])
                if rude:        # a reset instead of a goodbye
                    wire.sock.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
                wire.close()
        # A caller that asks for the page and hangs up without reading it.
        for _number in range(5):
            wire = Wire(stand)
            wire.send(self.head("GET", "/", cookie=cookie))
            wire.sock.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
            wire.close()
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertEqual(self.events("exception"), [])
        self.assertEqual(self.events("connection-error"), [])
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        self.assertNothingStored()

    def test_two_thousand_requests_broken_at_random_never_get_a_5xx_or_stop_the_server(self):
        # The same breakage every run: the generator has a fixed seed.
        stand = self.new_stand(tune={"limiter_per_address": 10 ** 6, "limiter_per_login": 10 ** 6,
                                     "limiter_setup_per_address": 10 ** 6, "signed_out_body_slots_per_address": 8})
        stand.set_password("mika")
        cookie = stand.session("mika")
        body = json.dumps({"base": 7, "doc": ledger()}).encode("ascii")
        sign_in = json.dumps({"login": "mika", "password": "never the password"}).encode("ascii")
        whole = [
            lines_of(stand, "GET", "/login"),
            lines_of(stand, "GET", "/", cookie=cookie),
            lines_of(stand, "GET", ME, "Sec-Fetch-Site: same-origin", cookie=cookie),
            lines_of(stand, "HEAD", LEDGER, cookie=cookie),
            lines_of(stand, "PUT", LEDGER, "Origin: " + stand.origin, "Content-Type: application/json",
                     "Content-Length: %d" % len(body), cookie=cookie) + body,
            lines_of(stand, "POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                     "Content-Length: %d" % len(sign_in)) + sign_in,
            lines_of(stand, "POST", LOGOUT, "Origin: " + stand.origin, "Content-Type: application/json",
                     "Content-Length: 2") + b"{}",
        ]
        dice = random.Random(20261007)
        spice = [b"\r\n", b"\n", b"\r", b"\x00", b" ", b":", b"\xff", b"Content-Length: 5\r\n", b"Transfer-Encoding: chunked\r\n",
                 b"Host: evil.example\r\n", b"Expect: 100-continue\r\n", b"[" * 40, b"{" * 40, b"%00", b"/../", b"HTTP/1.1"]
        statuses = {}   # type: Dict[int, int]
        for _number in range(2000):
            data = bytearray(dice.choice(whole))
            for _change in range(dice.randint(1, 3)):
                if not data:
                    break
                at = dice.randrange(len(data))
                kind = dice.randrange(4)
                if kind == 0:
                    data[at] = dice.randrange(256)
                elif kind == 1:
                    del data[at:at + dice.randint(1, 12)]
                elif kind == 2:
                    data[at:at] = dice.choice(spice)
                else:
                    del data[at:]
            answer = exchange(stand, bytes(data))
            status = answer.status if answer is not None else 0
            statuses[status] = statuses.get(status, 0) + 1
            if answer is not None and answer.status >= 500:
                self.fail("a broken request was answered %d: %r" % (answer.status, bytes(data)[:200]))
            if answer is not None and answer.status != 100 and _whole(answer.raw):
                self.assertEqual(answer.all("Connection"), ["close"])
        self.assertGreater(statuses.get(400, 0), 100, statuses)
        self.assertEqual(self.events("exception", stand), [])
        self.assertEqual(self.events("connection-error", stand), [])
        self.assertTrue(until(lambda: stand.server.connections() == 0))
        self.assertEqual([line for line in stand.log_lines() if line.get("status", 0) >= 500], [])
        # Every thread, every slot and every count is back where it was: the eight signed-out slots can all
        # be taken again (this stand lets one address take them all, so that the count of all is what is seen).
        self.assertEqual(stand.get("/login").status, 200)
        self.assertEqual((stand.server.signed_out(), stand.counted()), (0, 0))
        stand.retune(**HELD)        # from here on: what is held stays held until the test ends
        wires = [self.wire(lines_of(stand, "POST", LOGIN, "Origin: " + stand.origin, "Content-Type: application/json",
                                    "Content-Length: 40"), stand) for _slot in range(8)]
        self.assertTrue(until(lambda: stand.server.signed_out() == 8), "a slot was lost on the way")
        self.assertRefused(stand.post(LOGIN, {}), 503, "busy")
        self.assertEqual([(wire.peek(), wire.ended) for wire in wires], [(b"", False)] * 8, "a slot was lost on the way")
        self.assertIn(stand.get(LEDGER, cookie=stand.session("vanya")).json()["rev"], (0, 1))


# ---------------------------------------------------------------------------
# What is written down
# ---------------------------------------------------------------------------

class LogTests(Case):
    def requests(self) -> List[Dict[str, Any]]:
        return [line for line in self.stand.log_lines() if "path" in line]

    def test_every_request_is_one_line_of_the_fixed_fields(self):
        stand = self.stand
        cookie = stand.session("misha")
        answers = [stand.get("/login"), stand.get(ME, cookie=cookie), stand.get(ME),
                   stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie), stand.get("/", cookie=cookie),
                   stand.request("HEAD", "/", cookie=cookie), stand.get("/nothing")]
        lines = self.requests()
        self.assertEqual(len(lines), len(answers))
        for line, answer in zip(lines, answers):
            self.assertEqual(sorted(line), ["addr", "bytes", "login", "method", "ms", "path", "rid", "status", "t"])
            self.assertEqual(line["status"], answer.status)
            self.assertEqual(line["bytes"], len(answer.body))
            self.assertEqual(line["addr"], "127.0.0.1")
            self.assertRegex(line["t"], r"^2026-10-07T12:00:00(\.000)?Z$")
            self.assertIsInstance(line["ms"], (int, float))
        self.assertEqual([(line["method"], line["path"], line["login"]) for line in lines],
                         [("GET", "/login", None), ("GET", ME, "misha"), ("GET", ME, None), ("PUT", LEDGER, "misha"),
                          ("GET", "/", "misha"), ("HEAD", "/", "misha"), ("GET", "/nothing", None)])
        self.assertEqual(len({line["rid"] for line in lines}), len(lines), "a request id of its own each")

    def test_the_path_is_written_without_its_query_and_a_pasted_token_is_never_written(self):
        stand = self.stand
        token = stand.invite("mika")
        session = stand.token_of(stand.session("misha"))
        self.assertGreater(len(token), 32)
        asked = ["/login?t=" + token, "/set-password?t=" + token + "&password=" + "Zx9" * 6,
                 "/set-password%23t=" + token, "/set-password%23T=" + token, "/set-password/" + token,
                 "/" + token, "/api/" + token, "/set-password;t=" + token, "/set-password/t/" + token + "/x",
                 "/login?cookie=" + session, "/" + session + "?x", "/%23t=" + token, "/set-password#t=" + token]
        for path in asked:
            self.assertIsNotNone(exchange(stand, self.head("GET", path)))
        written = stand.log_text()
        self.assertEqual(len(self.requests()), len(asked))
        self.assertNotIn(token, written)
        self.assertNotIn(session, written)
        self.assertNotIn("Zx9", written)
        self.assertNotIn("?", "".join(line["path"] for line in self.requests()))
        self.assertEqual([line["path"] for line in self.requests()][:5],
                         ["/login", "/set-password", "/set-password", "/set-password", "/set-password/~"],
                         "no query, nothing after an encoded #, and ~ for a segment longer than 32 characters")
        # The link still works: asking for a path spends nothing.
        self.assertEqual(stand.post(SETUP, {"token": token, "password": PASSWORD}).status, 200)

    def test_what_is_typed_into_the_login_field_is_written_only_when_it_is_a_founders_login(self):
        stand = self.stand
        stand.set_password("mika")
        typed = ("Hunter2-typed-into-login", "hunter2typedintologin", "nobody", "root", "mika2", "mikaa", "m", "ми́ка")
        for login in typed:
            self.assertRefused(stand.post(LOGIN, {"login": login, "password": "whatever it was 123"}), 401, "invalid_credentials")
        self.assertRefused(stand.post(LOGIN, {"login": " MIKA ", "password": "not the password"}), 401, "invalid_credentials")
        lines = [line for line in self.requests() if line["path"] == LOGIN]
        self.assertEqual([line["login"] for line in lines], [None] * len(typed) + ["mika"])
        failed = [entry for entry in stand.security_events() if entry["event"] == "sign-in-failed"]
        self.assertEqual([entry.get("login") for entry in failed], [None] * len(typed) + ["mika"])
        for where in (stand.log_text(), read(stand.security_log.path).decode("utf-8")):
            for login in ("hunter2", "nobody", "root", "mika2", "mikaa", "ми́ка"):
                self.assertNotIn(login, where.lower())

    def test_nothing_that_signs_anyone_in_is_in_a_log_or_in_clear_on_the_disk(self):
        stand = self.stand
        old = "PLATFORM-COOKIE-" + "q" * 24
        wrong = "Wrong-horse-battery-77"
        weak = "weak-pw-9"
        typed_as_login = "Staple-typed-as-login-55"
        secrets = [PASSWORD, wrong, weak, typed_as_login, old]

        token = stand.invite("mika")
        dead = "D" * 43
        secrets += [token, dead]
        browser = {"User-Agent": "Mozilla/5.0 (tests)"}
        self.assertEqual(stand.get("/set-password?t=" + token).status, 200)
        self.assertRefused(stand.post(SETUP, {"token": dead, "password": PASSWORD}), 404, "invalid_link")
        self.assertRefused(stand.post(SETUP, {"token": token, "password": weak}), 400, "weak_password", extra=("min",))
        setup = stand.post(SETUP, {"token": token, "password": PASSWORD}, cookie="ssp_session=" + old, headers=browser)
        self.assertEqual(setup.status, 200)
        first = setup.cookie("money-dev")
        secrets.append(stand.token_of(first))
        self.assertRefused(stand.post(SETUP, {"token": token, "password": PASSWORD}), 404, "invalid_link")
        for body in ({"login": "mika", "password": wrong}, {"login": typed_as_login, "password": wrong},
                     {"login": PASSWORD, "password": "mika"}, {"login": "mika", "password": PASSWORD + " "}):
            self.assertRefused(stand.post(LOGIN, body, cookie=first), 401, "invalid_credentials")
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, cookie=first, headers=browser)
        self.assertEqual(signed.status, 200)
        cookie = signed.cookie("money-dev")
        secrets.append(stand.token_of(cookie))
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(3)}, cookie=cookie).status, 200)
        self.assertEqual(stand.get("/", cookie=cookie + "; ssp_session=" + old).status, 200)
        self.assertEqual(stand.get("/login?password=" + PASSWORD.replace(" ", "+"), cookie=cookie).status, 200)
        self.assertEqual(stand.get("/" + stand.token_of(cookie), cookie=cookie).status, 404)
        internal = stand.ctl("selfcheck")
        self.assertEqual(internal.status, 0, internal.out + internal.err)
        journal = stand.get("/data", cookie=cookie)
        self.assertEqual(stand.post(LOGOUT, {}, cookie=cookie).status, 200)
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")

        self.assertEqual(len(set(secrets)), len(secrets))
        said = {"the request log": stand.log_text().encode("utf-8"), "the data page": journal.body,
                "what ctl printed": (internal.out + internal.err).encode("utf-8")}
        on_disk = 0
        for root, _directories, files in os.walk(stand.data_dir):
            for name in files:
                said["the file %s" % os.path.relpath(os.path.join(root, name), stand.data_dir)] = read(os.path.join(root, name))
                on_disk += 1
        self.assertGreaterEqual(on_disk, 4, sorted(said))        # users, sessions, the security log, a document
        self.assertIn("the file security.log", said)
        for where, data in said.items():
            lowered = data.lower()
            for secret in secrets:
                with self.subTest(where=where, secret=secret[:6] + "..."):
                    self.assertNotIn(secret.encode("utf-8"), data)
                    self.assertNotIn(secret.lower().encode("utf-8"), lowered, "not in other letters either")
                    self.assertNotIn(secret.replace(" ", "+").encode("utf-8"), data)
        # What the logs do hold: who signed in, from where, and that a link was issued and used.
        events = [entry["event"] for entry in stand.security_events()]
        for expected in ("link-issued", "link-refused", "link-used", "password-set", "sign-in-failed", "sign-in", "sign-out"):
            self.assertIn(expected, events)
        self.assertNotIn(b"Mozilla", said["the file security.log"])

    def test_a_document_that_passes_half_a_megabyte_or_eight_is_said_out_loud_in_the_log(self):
        # The page words a 413 as "check your connection", so the log speaks up well before the limit.
        stand = self.stand
        self.assertEqual((stand.settings.ledger_warn_bytes, stand.settings.plan_warn_bytes), (8 * MIB, 512 * KIB))
        cookie = stand.session("mika")
        self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan(3)}, cookie=cookie).status, 200)
        self.assertEqual(self.events("large-body"), [])
        big = json.dumps({"v": 2, "banks": [], "inflows": [], "team": [], "taxes": [], "other": [], "note": "n" * (520 * KIB)})
        self.assertEqual(stand.put(PLAN, {"base": 1, "doc": big}, cookie=cookie).json(), {"rev": 2})
        said = self.events("large-body")
        self.assertEqual([(line.get("doc"), line.get("limit")) for line in said], [("plan", 4 * MIB)])
        self.assertGreater(said[0]["bytes"], 512 * KIB)
        self.assertNotIn("nnnnnnnn", stand.log_text(), "and not a byte of the document with it")
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(50)}, cookie=cookie).status, 200)
        self.assertEqual(len(self.events("large-body")), 1, "half a megabyte is nothing for the ledger")

    def test_the_data_page_shows_a_founder_the_last_fifty_entries_of_the_security_log(self):
        stand = self.stand
        for number in range(57):                     # fifty-seven things worth an entry, a second apart
            login = ("mika", "misha", "vanya")[number % 3]
            self.assertEqual(stand.post(LOGOUT, {}, cookie=stand.session(login)).status, 200)
            stand.clock.tick(seconds=1)
        written = stand.security_events()
        self.assertEqual(len(written), 57)
        self.assertEqual(len({entry["t"] for entry in written}), 57)
        page = stand.get("/data", cookie=stand.session("mika"))
        self.assertEqual(page.status, 200)
        shown = re.findall(r'data-entries="([^"]*)"', page.text)
        self.assertEqual(len(shown), 1, "the journal is in the page once")
        entries = json.loads(html.unescape(shown[0]))
        self.assertEqual(len(entries), 50)
        self.assertEqual(sorted(entries, key=lambda entry: entry["t"]), written[-50:],
                         "the last fifty, and each as it was written")
        self.assertToLogin(stand.get("/data"))       # and nobody else sees a line of it

    def test_a_refusal_before_the_request_was_read_is_written_without_what_was_sent(self):
        stand = self.stand
        mark = "Zq7LOGzq7"
        for request in ((mark + " /" + mark + " HTTP/1.1\r\nHost: " + stand.host + "\r\n\r\n").encode("ascii"),
                        self.head("GET", "/login", mark + " broken"), self.head("GET", "/login", "X-" + mark + ": " + mark),
                        self.head("GET", "/login", "Host: " + mark + ".example", host=""),
                        self.head("GET", "/login?" + mark), self.head("GET", "/login", "User-Agent: " + mark),
                        self.head("GET", "/login", "Cookie: " + mark + "=" + mark, "Referer: https://x.example/" + mark),
                        self.head("POST", LOGIN, "Origin: https://" + mark + ".example", "Content-Type: text/" + mark,
                                  "Content-Length: 9") + mark.encode("ascii")):
            self.assertIsNotNone(exchange(stand, request))
        self.assertNotIn(mark.lower(), stand.log_text().lower())
        for root, _directories, files in os.walk(stand.data_dir):
            for name in files:
                self.assertNotIn(mark.lower().encode("ascii"), read(os.path.join(root, name)).lower(), name)


# ---------------------------------------------------------------------------
# The real thing: python -m moneyd as a process of its own
# ---------------------------------------------------------------------------

class RealProcessTests(unittest.TestCase):
    def test_no_body_and_no_line_ends_the_process_or_puts_a_secret_or_a_traceback_into_its_output(self):
        with _harness.ProcessStand() as stand:
            invited = stand.ctl("user", "invite", "mika", "--print")
            self.assertEqual(invited.returncode, 0, invited.stderr)
            token = re.search(r"/set-password#t=(\S+)", invited.stdout).group(1)
            setup = stand.post(SETUP, {"token": token, "password": PASSWORD})
            self.assertEqual(setup.status, 200, setup.body)
            cookie = setup.cookie("money-dev")
            session = cookie.split("=", 1)[1]
            # Bodies that are nothing but nesting, at every door that reads one.
            for body in JsonTests.NESTED.values():
                for door in AUTH_DOORS:
                    self.assertEqual(stand.post(door, body=body, headers=JSON).status, 400)
                for path in (LEDGER, PLAN):
                    self.assertEqual(stand.put(path, body=body, cookie=cookie, headers=JSON).status, 400)
            deep = stand.put(LEDGER, {"base": 0, "doc": "[" * 100000 + "]" * 100000}, cookie=cookie)
            self.assertEqual((deep.status, deep.json()["error"]), (400, "bad_money_doc"))
            # Lines that are not HTTP.
            for data in (b"\x00" * 64, b"GET /login\r\n\r\n", b"\x16\x03\x01" + bytes(range(256)), b"GET " + b"/" * 9000,
                         b"GET /login HTTP/1.1\r\nHost: " + stand.host.encode("ascii") + b"\r\nBroken\r\n\r\n",
                         b"POST %s HTTP/1.1\r\nHost: %s\r\nTransfer-Encoding: chunked\r\n\r\n" % (
                             LOGIN.encode("ascii"), stand.host.encode("ascii"))):
                answer = parse(stand.raw(data, half_close=True))
                self.assertIsNotNone(answer)
                self.assertIn(answer.status, (400, 414))
            wrong = stand.post(LOGIN, {"login": "mika", "password": "Wrong-horse-battery-77"})
            self.assertEqual(wrong.status, 401)
            # It is still the same process, and it still answers.
            self.assertIsNone(stand.process.poll(), "the service ended")
            self.assertEqual(stand.get(ME, cookie=cookie).json()["firstName"], "Mika")
            self.assertEqual(stand.get(LEDGER, cookie=cookie).json(), EMPTY)
            status = stand.stop()
            output = stand.output()
        self.assertEqual(status, 0, output[-2000:])
        self.assertNotIn("Traceback", output)
        for secret in (PASSWORD, token, session, "Wrong-horse-battery-77"):
            self.assertNotIn(secret, output)
        lines = [line for line in output.splitlines() if line.strip()]
        self.assertGreater(len(lines), 40)
        for line in lines:                              # nothing but the log's own JSON lines came out
            self.assertIsInstance(json.loads(line), dict, line[:200])
        self.assertEqual([entry for entry in map(json.loads, lines) if entry.get("event") == "exception"], [])
        self.assertEqual([entry for entry in map(json.loads, lines) if entry.get("status", 0) >= 500], [])


if __name__ == "__main__":
    unittest.main()
