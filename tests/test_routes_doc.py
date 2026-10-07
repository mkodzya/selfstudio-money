"""``docs/api.md`` held to the code, both ways.

    python3 -m unittest tests.test_routes_doc -v

The document is the contract the frozen page was written against, so the document and the
server have to say the same thing. A parser reads three parts of it here:

* the table under ``## Routes``, against ``moneyd.httpd.ROUTES`` and against what a running
  stand answers on every row;
* the fenced list under ``## Paths that answer without a session``, against
  ``moneyd.httpd.PUBLIC_PATHS`` - and the list is pinned in this file, so a path can only be
  opened to strangers by a change that also changes a test;
* every status and error code the document names in backticks (```401 unauthenticated```,
  ```409` `{"error": "money_stale", ...}```), door by door, against what the running server
  answers when that door is made to refuse - and the other way round: what the server
  answers must be named for that door, or in the three sections that speak for every
  request (``Conventions``, ``Every other request``, ``What every request passes first``).

How the document has to be written for this file to read it is said in the document's own
HTML comments, and in ``DOORS`` below (which heading speaks for which rows).
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import contextlib
import json
import os
import re
import socket
import stat
import time
import unittest
from typing import Any, Callable, Dict, Iterator, List, NamedTuple, Optional, Set, Tuple
from unittest import mock

from moneyd import auth, config, httpd, store
from tests import _harness
from tests._harness import PASSWORD, ledger, plan

DOC = os.path.join(_harness.CHECKOUT, "docs", "api.md")
KIB = 1024
MIB = 1024 * 1024

LOGIN = "/api/auth/login"
SETUP = "/api/auth/setup"
LOGOUT = "/api/auth/logout"
LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
JSON = {"Content-Type": "application/json"}

#: BUILD-SPEC 3: "the exact list of paths that answer without a session is pinned". Here.
#: /login, /logout: spec 2.1. The two assets: spec 2.2. The rest: the design, 1.5.
PINNED_PUBLIC = (
    "/login",
    "/set-password",
    "/logout",
    "/assets/auth.js",
    "/assets/auth.css",
    "/robots.txt",
    "/favicon.ico",
    "/healthz",
    "/api/auth/login",
    "/api/auth/setup",
    "/api/auth/logout",
)

#: The headings (``###``) that speak for a door, and the rows of the table each speaks for.
DOORS = (
    ("GET /login", (("GET", "/login"),)),
    ("POST /api/auth/login", (("POST", LOGIN),)),
    ("GET /set-password", (("GET", "/set-password"),)),
    ("POST /api/auth/setup", (("POST", SETUP),)),
    ("POST /api/auth/logout", (("POST", LOGOUT),)),
    ("GET /logout", (("GET", "/logout"),)),
    ("GET / and GET /index.html", (("GET", "/"), ("GET", "/index.html"))),
    ("GET /money/vendor/…", (("GET", "/money/vendor/pdf.min.js"), ("GET", "/money/vendor/pdf.worker.min.js"),
                             ("GET", "/money/vendor/xlsx.full.min.js"))),
    ("GET /assets/auth.js and GET /assets/auth.css", (("GET", "/assets/auth.js"), ("GET", "/assets/auth.css"))),
    ("GET /data", (("GET", "/data"),)),
    ("The platform's old links", (("GET", "/tracker/board"), ("GET", "/dashboard"), ("GET", "/money/"),
                                  ("GET", "/money/index.html"))),
    ("GET /api/me", (("GET", "/api/me"),)),
    ("GET", (("GET", LEDGER), ("GET", PLAN))),
    ("PUT", (("PUT", LEDGER), ("PUT", PLAN))),
)
#: Rows that have a line in the table and no section of their own.
TABLE_ONLY = (("GET", "/robots.txt"), ("GET", "/favicon.ico"), ("GET", "/healthz"))
#: The sections that speak for every request, whatever the door.
GENERIC = ("Conventions", "Every other request", "What every request passes first")

#: Refusals of the code that belong to ``ctl`` and have no door (the document: "What has no door").
NO_DOOR = {"unknown_login", "login_disabled", "no_such_snapshot", "bad_snapshot", "refused"}

#: Root is not stopped by a directory's mode, so "the disk refuses" cannot be staged for it.
CAN_DENY = hasattr(os, "geteuid") and os.geteuid() != 0


# ---------------------------------------------------------------------------
# Reading the document
# ---------------------------------------------------------------------------

class Row(NamedTuple):
    method: str
    path: str
    session: str
    body: str
    answer: str


_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_FENCE = re.compile(r"(?ms)^```[^\n]*\n(.*?)^```[ \t]*$")
_SPAN = re.compile(r"`([^`]+)`")
_STATUS = re.compile(r"(\d{3})(?: ([a-z][a-z_]*))?")
_ERROR_MEMBER = re.compile(r'"error":\s*"([a-z_]+)"')
_RULE = re.compile(r":?-{3,}:?")
_SIZE = re.compile(r"JSON, (\d+) (KiB|MiB)")


def document() -> str:
    """The document without its HTML comments (they speak to whoever edits it, not to a reader)."""
    with open(DOC, encoding="utf-8") as handle:
        return _COMMENT.sub("", handle.read())


def section(text: str, title: str, level: int) -> str:
    """What stands under the heading ``title`` of ``level``, up to the next heading of that level or above.

    A title that ends in ``…`` is matched by what stands before it.
    """
    marks = "#" * level
    if title.endswith("…"):
        pattern = r"(?m)^%s %s[^\n]*$" % (marks, re.escape(title[:-1]))
    else:
        pattern = r"(?m)^%s %s[ \t]*$" % (marks, re.escape(title))
    found = re.findall(pattern, text)
    if len(found) != 1:
        raise AssertionError("docs/api.md must have exactly one heading %r; it has %d" % (marks + " " + title, len(found)))
    start = re.search(pattern, text)
    rest = text[start.end():]
    end = re.search(r"(?m)^#{1,%d} " % level, _blank_fences(rest))
    return rest[:end.start()] if end else rest


def _blank_fences(text: str) -> str:
    """The same text with what stands inside ``` fences blanked out, so that it is not read as headings."""
    return _FENCE.sub(lambda block: " " * len(block.group(0)), text)


def tables(text: str) -> List[List[List[str]]]:
    """Every Markdown table of ``text``: a list of rows, each a list of cells (header and rule included)."""
    found, current = [], []     # type: List[List[List[str]]], List[List[str]]
    for line in _blank_fences(text).splitlines() + [""]:
        line = line.strip()
        if line.startswith("|"):
            current.append([cell.strip() for cell in line.strip("|").split("|")])
        elif current:
            found.append(current)
            current = []
    return found


def routes(text: Optional[str] = None) -> List[Row]:
    """The rows of the table under ``## Routes``."""
    found = tables(section(text if text is not None else document(), "Routes", 2))
    if len(found) != 1:
        raise AssertionError("the Routes section must hold exactly one table; it holds %d" % len(found))
    rows = []
    for cells in found[0]:
        if cells and cells[0] == "Method":
            continue
        if all(_RULE.fullmatch(cell) for cell in cells):
            continue
        if len(cells) != 5:
            raise AssertionError("a row of the Routes table must have five cells: %r" % (cells,))
        rows.append(Row(*cells))
    return rows


def public_paths(text: Optional[str] = None) -> List[str]:
    """The lines of the fenced block under ``## Paths that answer without a session``."""
    body = section(text if text is not None else document(), "Paths that answer without a session", 2)
    blocks = _FENCE.findall(body)
    if len(blocks) != 1:
        raise AssertionError("that section must hold exactly one fenced block; it holds %d" % len(blocks))
    return [line.strip() for line in blocks[0].splitlines() if line.strip()]


def answers(text: str) -> Set[Tuple[int, Optional[str]]]:
    """Every status the text names in backticks, with its error code where it gives one.

    ```401 unauthenticated``` is ``(401, "unauthenticated")``; ```421``` is ``(421, None)``;
    ```409` `{"error": "money_stale", ...}``` and ```500` with `{"error": "internal"}``` give the
    code of the JSON that follows the status.
    """
    text = _FENCE.sub("", text)
    spans = [(found.start(), found.end(), " ".join(found.group(1).split())) for found in _SPAN.finditer(text)]
    named = set()   # type: Set[Tuple[int, Optional[str]]]
    for index, (_start, end, content) in enumerate(spans):
        status = _STATUS.fullmatch(content)
        if status is None:
            continue
        code = status.group(2)
        if code is None and index + 1 < len(spans):
            following_start, _following_end, following = spans[index + 1]
            between = text[end:following_start]
            member = _ERROR_MEMBER.search(following)
            if member is not None and len(between) <= 8 and "\n\n" not in between:
                code = member.group(1)
        named.add((int(status.group(1)), code))
    return named


def members(snippet: str) -> List[str]:
    """The member names of an object as the document sketches one: ``{"rev": N, "doc": {…}, "updatedAt": "<UTC time>"}``
    gives ``["rev", "doc", "updatedAt"]``, and so does a sketch that leaves the values out (``{"id", "name"}``)."""
    names, depth, at, expecting = [], 0, 0, False
    while at < len(snippet):
        char = snippet[at]
        if char == '"':
            end = at + 1
            while end < len(snippet) and snippet[end] != '"':
                end += 2 if snippet[end] == "\\" else 1
            if depth == 1 and expecting:
                names.append(snippet[at + 1:end])
            expecting = False
            at = end
        elif char in "{[":
            depth += 1
            expecting = depth == 1 and char == "{"
        elif char in "}]":
            depth -= 1
        elif char == "," and depth == 1:
            expecting = True
        elif not char.isspace():
            expecting = False
        at += 1
    return names


def sketches(text: str, status: int) -> List[List[str]]:
    """The member names of every object the text sketches right after naming ``status`` in backticks."""
    text = _FENCE.sub("", text)
    spans = [(found.start(), found.end(), " ".join(found.group(1).split())) for found in _SPAN.finditer(text)]
    found = []
    for index, (_start, end, content) in enumerate(spans[:-1]):
        following_start, _following_end, following = spans[index + 1]
        if content == str(status) and following.startswith("{") and len(text[end:following_start]) <= 12:
            found.append(members(following))
    return found


def is_listed(pair: Tuple[int, Optional[str]], *where: Set[Tuple[int, Optional[str]]]) -> bool:
    """Whether a document names an answer: by status and code, or by its status alone
    (the document names a few refusals of the HTTP layer "by status only")."""
    status, _code = pair
    return any(pair in listed or (status, None) in listed for listed in where)


# ---------------------------------------------------------------------------
# Asking the server
# ---------------------------------------------------------------------------

def pair(answer: Any) -> Tuple[int, Optional[str]]:
    """``(status, error code)`` of an answer; the code is None when the answer is not a JSON refusal."""
    code = None
    if (answer.header("Content-Type") or "").startswith("application/json"):
        try:
            said = answer.json()
        except ValueError:
            said = None
        if isinstance(said, dict) and isinstance(said.get("error"), str):
            code = said["error"]
    return answer.status, code


def until(probe: Callable[[], Any], seconds: float = 3.0, every: float = 0.01) -> Any:
    deadline = time.monotonic() + seconds
    while True:
        value = probe()
        if value or time.monotonic() > deadline:
            return value
        time.sleep(every)


@contextlib.contextmanager
def read_only(directory: str) -> Iterator[None]:
    """The directory refuses new files for as long as the ``with`` lasts: a disk that refuses a write."""
    mode = stat.S_IMODE(os.stat(directory).st_mode)
    os.chmod(directory, 0o500)
    try:
        yield
    finally:
        os.chmod(directory, mode)


def head(stand: Any, method: str, path: str, *lines: str, cookie: Optional[str] = None) -> bytes:
    """The head of a request as bytes: the request line, Host, then ``lines``, then the blank line."""
    out = ["%s %s HTTP/1.1" % (method, path), "Host: %s" % stand.host]
    if cookie:
        out.append("Cookie: %s" % cookie)
    out.extend(lines)
    return ("\r\n".join(out) + "\r\n\r\n").encode("ascii")


class Bare(NamedTuple):
    """An answer read off a raw socket, with what ``pair`` and the tests ask of an answer."""
    status: int
    content_type: str
    body: bytes

    def header(self, name: str) -> Optional[str]:
        return self.content_type if name.lower() == "content-type" else None

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def bare(data: bytes) -> Bare:
    """Raw bytes of an answer as a ``Bare``. An empty answer is status 0."""
    if not data.startswith(b"HTTP/1.1 "):
        return Bare(0, "", b"")
    top, _blank, body = data.partition(b"\r\n\r\n")
    lines = top.split(b"\r\n")
    content_type = ""
    for line in lines[1:]:
        name, _colon, value = line.partition(b":")
        if name.strip().lower() == b"content-type":
            content_type = value.strip().decode("ascii")
    return Bare(int(lines[0].split(b" ")[1]), content_type, body)


@contextlib.contextmanager
def held(stand: Any, data: bytes) -> Iterator[socket.socket]:
    """A connection that has sent ``data`` and stays open for as long as the ``with`` lasts."""
    connection = socket.create_connection(("127.0.0.1", stand.port), timeout=5)
    try:
        if data:
            connection.sendall(data)
        yield connection
    finally:
        connection.close()


# ---------------------------------------------------------------------------
# The parser's own ground: the document is written the way this file reads it
# ---------------------------------------------------------------------------

class DocumentShapeTests(unittest.TestCase):
    def test_the_routes_section_is_one_table_of_method_path_session_body_answer(self):
        found = tables(section(document(), "Routes", 2))
        self.assertEqual(len(found), 1, "one table, and only one, under ## Routes")
        self.assertEqual(found[0][0], ["Method", "Path", "Session", "Body", "Answer"])
        rows = routes()
        self.assertGreater(len(rows), 0)
        for row in rows:
            with self.subTest(row=row[:2]):
                self.assertIn(row.method, ("GET", "POST", "PUT"), "a method as plain text")
                self.assertRegex(row.path, r"^/[!-~]*$", "an exact path as plain text, no backticks")
                self.assertNotIn("`", row.path)
                self.assertIn(row.session, ("yes", "no"))
                self.assertRegex(row.answer, r"^(\d{3}\b|as GET /)", "an answer begins with its status")

    def test_a_method_and_a_path_are_one_row(self):
        keys = [(row.method, row.path) for row in routes()]
        self.assertEqual(sorted(set(keys)), sorted(keys), "a method and a path stand in the table once")

    def test_no_other_table_of_the_document_lists_a_route(self):
        text = document()
        inside = section(text, "Routes", 2)
        outside = text.replace(inside, "")
        for table in tables(outside):
            for cells in table:
                self.assertNotIn(cells[0], ("GET", "POST", "PUT", "HEAD", "DELETE", "PATCH", "OPTIONS"), cells)

    def test_the_public_section_is_one_fenced_block_of_paths(self):
        listed = public_paths()
        self.assertGreater(len(listed), 0)
        for path in listed:
            self.assertRegex(path, r"^/[!-~]*$")
        self.assertEqual(len(set(listed)), len(listed), "a path stands in the list once")

    def test_every_row_has_a_section_or_is_known_to_have_none(self):
        text = document()
        rows = {(row.method, row.path) for row in routes()}
        spoken_for = []     # type: List[Tuple[str, str]]
        for title, keys in DOORS:
            section(text, title, 3)                     # raises when the heading is gone or doubled
            spoken_for.extend(keys)
        self.assertEqual(sorted(set(spoken_for)), sorted(spoken_for), "a row has one section")
        self.assertEqual(sorted(set(spoken_for) | set(TABLE_ONLY)), sorted(rows),
                         "every row of the table has a section in the document (or is one of the three "
                         "that need none), and no section speaks for a row the table does not have")

    def test_the_parser_reads_a_status_with_and_without_its_code(self):
        self.assertEqual(
            answers('- `401 unauthenticated`.\n- `409` `{"error": "money_stale", "rev": 1}` - x\n'
                    '- `421`, the `400` for `Transfer-Encoding`\n- is `500` with `{"error": "internal"}` and\n'
                    '- `200` `{"ok": true}`\n```\nSet-Cookie: `503 never`\n```\n'),
            {(401, "unauthenticated"), (409, "money_stale"), (421, None), (400, None), (500, "internal"), (200, None)})


# ---------------------------------------------------------------------------
# The table and the list against the data the code exposes
# ---------------------------------------------------------------------------

class RouteTableTests(unittest.TestCase):
    def setUp(self):
        self.rows = routes()
        self.documented = {(row.method, row.path): row for row in self.rows}
        self.served = {(route.method, route.path): route for route in httpd.ROUTES}

    def test_every_row_of_the_document_is_served(self):
        missing = sorted(set(self.documented) - set(self.served))
        self.assertEqual(missing, [], "docs/api.md promises doors that moneyd.httpd.ROUTES does not have")

    def test_everything_served_is_a_row_of_the_document(self):
        undocumented = sorted(set(self.served) - set(self.documented))
        self.assertEqual(undocumented, [], "moneyd.httpd.ROUTES has doors that docs/api.md does not name")

    def test_the_code_has_one_row_per_method_and_path(self):
        keys = [(route.method, route.path) for route in httpd.ROUTES]
        self.assertEqual(sorted(set(keys)), sorted(keys))

    def test_the_session_column_is_what_the_code_asks(self):
        for key, row in sorted(self.documented.items()):
            with self.subTest(route=key):
                route = self.served.get(key)
                self.assertIsNotNone(route)
                self.assertEqual(row.session == "yes", route.session,
                                 "the document says session: %s" % row.session)

    def test_the_body_column_is_the_limit_the_code_applies(self):
        with _harness.Stand(start=False) as stand:
            settings = stand.settings
        limits = {"auth": settings.auth_max_bytes, "ledger": settings.put_limit("ledger"),
                  "plan": settings.put_limit("plan")}
        for key, row in sorted(self.documented.items()):
            with self.subTest(route=key):
                route = self.served.get(key)
                self.assertIsNotNone(route)
                if not row.body:
                    self.assertIsNone(route.body, "the document names no body for this door")
                    continue
                size = _SIZE.fullmatch(row.body)
                self.assertIsNotNone(size, "a body is written 'JSON, <n> KiB|MiB': %r" % row.body)
                promised = int(size.group(1)) * (KIB if size.group(2) == "KiB" else MIB)
                self.assertIsNotNone(route.body, "the document promises a body")
                self.assertEqual(limits[route.body], promised)

    def test_a_door_with_a_body_is_a_post_or_a_put_and_the_others_are_gets(self):
        for row in self.rows:
            with self.subTest(route=(row.method, row.path)):
                self.assertEqual(bool(row.body), row.method in ("POST", "PUT"))

    def test_the_three_vendor_names_are_the_documents_and_no_others(self):
        documented = sorted(path[len("/money/vendor/"):] for (_method, path) in self.documented
                            if path.startswith("/money/vendor/"))
        self.assertEqual(documented, ["pdf.min.js", "pdf.worker.min.js", "xlsx.full.min.js"])
        self.assertEqual(sorted(httpd.VENDOR_FILES), documented)

    def test_the_two_documents_have_the_doors_the_page_calls(self):
        self.assertEqual(httpd.DOC_PATHS, {"ledger": LEDGER, "plan": PLAN})
        for path in (LEDGER, PLAN):
            self.assertEqual(sorted(method for (method, where) in self.documented if where == path), ["GET", "PUT"])

    def test_every_method_the_server_serves_is_named_where_the_document_lists_its_routes(self):
        # "A route is added, removed or opened only together with its line here." A method that
        # is answered on every GET row is a great many routes.
        text = document()
        named = {row.method for row in self.rows}
        for part in (section(text, "Routes", 2), section(text, "Every other request", 2)):
            named.update(word for word in re.findall(r"`([A-Z]+)`", part))
        self.assertEqual(sorted(set(httpd.SERVED_METHODS) - named), [],
                         "the server answers these methods, and neither the Routes section nor "
                         "'Every other request' of docs/api.md names them")


class PublicPathsTests(unittest.TestCase):
    def test_the_list_is_pinned(self):
        self.assertEqual(tuple(public_paths()), PINNED_PUBLIC,
                         "the paths that answer a stranger changed in docs/api.md: that takes a decision, "
                         "and then a change of PINNED_PUBLIC in this file")

    def test_the_code_opens_exactly_the_pinned_paths(self):
        self.assertEqual(sorted(httpd.PUBLIC_PATHS), sorted(PINNED_PUBLIC))
        self.assertEqual(len(httpd.PUBLIC_PATHS), len(set(httpd.PUBLIC_PATHS)))

    def test_every_listed_path_is_a_row_without_a_session_and_every_such_row_is_listed(self):
        open_rows = sorted({row.path for row in routes() if row.session == "no"})
        self.assertEqual(sorted(public_paths()), open_rows)

    def test_the_code_asks_a_session_on_every_row_outside_the_list(self):
        for route in httpd.ROUTES:
            with self.subTest(route=(route.method, route.path)):
                self.assertEqual(route.session, route.path not in PINNED_PUBLIC)

    def test_a_stranger_gets_an_answer_of_its_own_on_the_listed_paths_only(self):
        with _harness.Stand() as stand:
            for row in routes():
                with self.subTest(route=(row.method, row.path)):
                    body = {} if row.body else None
                    answer = stand.request(row.method, row.path, body)
                    closed = (answer.status == 401 and pair(answer)[1] == "unauthenticated") or \
                             (answer.status == 302 and answer.header("Location") == "/login")
                    if row.path in PINNED_PUBLIC:
                        if row.path != "/logout":           # whose own answer is the redirect to /login
                            self.assertFalse(closed, "a listed path gives its own answer")
                    else:
                        self.assertTrue(closed, "%d: a path outside the list tells a stranger nothing" % answer.status)


# ---------------------------------------------------------------------------
# The Answer column against a running stand
# ---------------------------------------------------------------------------

class AnswerColumnTests(unittest.TestCase):
    def setUp(self):
        self.stand = _harness.Stand()
        self.addCleanup(self.stand.stop)

    def ask(self, row: Row, cookie: Optional[str]) -> Any:
        """The request this row is about, sent the way it is meant to be sent."""
        stand = self.stand
        if (row.method, row.path) == ("POST", LOGIN):
            stand.set_password("vanya")
            return stand.post(LOGIN, {"login": "vanya", "password": PASSWORD}, cookie=cookie)
        if (row.method, row.path) == ("POST", SETUP):
            return stand.post(SETUP, {"token": stand.invite("misha"), "password": PASSWORD}, cookie=cookie)
        if (row.method, row.path) == ("POST", LOGOUT):
            return stand.post(LOGOUT, {}, cookie=cookie)
        if row.method == "PUT":
            text = ledger() if row.path == LEDGER else plan()
            return stand.put(row.path, {"base": 0, "doc": text}, cookie=cookie)
        return stand.get(row.path, cookie=cookie)

    def promised(self, row: Row, rows: Dict[Tuple[str, str], Row]) -> int:
        answer = row.answer
        referred = re.match(r"as (GET|POST|PUT) (/\S*)", answer)
        if referred is not None:
            answer = rows[(referred.group(1), referred.group(2))].answer
        return int(re.match(r"(\d{3})\b", answer).group(1))

    def test_every_row_answers_with_the_status_its_answer_column_begins_with(self):
        rows = {(row.method, row.path): row for row in routes()}
        for row in rows.values():
            with self.subTest(route=(row.method, row.path)):
                cookie = self.stand.session("mika") if row.session == "yes" else None
                self.assertEqual(self.ask(row, cookie).status, self.promised(row, rows))

    def test_every_row_answers_with_the_kind_of_thing_its_answer_column_names(self):
        kinds = {"HTML": "text/html", "the page": "text/html", "JSON": "application/json", "script": "text/javascript",
                 "stylesheet": "text/css", "text": "text/plain"}
        rows = {(row.method, row.path): row for row in routes()}
        for row in rows.values():
            with self.subTest(route=(row.method, row.path)):
                words = row.answer
                referred = re.match(r"as (GET|POST|PUT) (/\S*)", words)
                if referred is not None:
                    words = rows[(referred.group(1), referred.group(2))].answer
                said = re.match(r"\d{3}(?: (HTML|JSON|script|stylesheet|text|the page)\b| to (/[^\s;,.]*))?", words)
                self.assertIsNotNone(said, "an answer is '<status>', '<status> <kind> ...' or '<status> to <path>'")
                answer = self.ask(row, self.stand.session("mika") if row.session == "yes" else None)
                if said.group(1):
                    self.assertTrue((answer.header("Content-Type") or "").startswith(kinds[said.group(1)]),
                                    "%r is not %s" % (answer.header("Content-Type"), said.group(1)))
                elif said.group(2):
                    self.assertEqual(answer.header("Location"), said.group(2))
                else:
                    self.assertEqual(answer.body, b"", "a status and nothing else")
                name = self.stand.settings.cookie_name
                if "the session cookie" in words:
                    self.assertIsNotNone(answer.cookie(name), "the row promises the session cookie")
                elif "cookie cleared" in words:
                    self.assertEqual([value.split(";")[0] for value in answer.all("Set-Cookie")], [name + "="])
                else:
                    self.assertEqual(answer.all("Set-Cookie"), [], "the row promises no cookie")

    def test_a_row_without_a_session_answers_the_same_status_to_a_founder(self):
        rows = {(row.method, row.path): row for row in routes()}
        for row in rows.values():
            if row.session == "no":
                with self.subTest(route=(row.method, row.path)):
                    self.assertEqual(self.ask(row, self.stand.session("mika")).status, self.promised(row, rows))

    def test_a_row_with_a_session_answers_a_stranger_401_under_api_and_for_the_vendor_files_and_302_elsewhere(self):
        for row in routes():
            if row.session != "yes":
                continue
            with self.subTest(route=(row.method, row.path)):
                answer = self.ask(row, None)
                if row.path.startswith("/api/") or row.path.startswith("/money/vendor/"):
                    self.assertEqual(pair(answer), (401, "unauthenticated"))
                    self.assertIsNone(answer.header("Location"))
                else:
                    self.assertEqual((answer.status, answer.header("Location")), (302, "/login"))


# ---------------------------------------------------------------------------
# What an answer holds: the objects, the cookie and the headers the document writes out
# ---------------------------------------------------------------------------

class AnswerShapeTests(unittest.TestCase):
    def setUp(self):
        self.text = document()
        self.stand = _harness.Stand()
        self.addCleanup(self.stand.stop)

    def sketched(self, title: str, status: int = 200) -> List[str]:
        found = sketches(section(self.text, title, 3), status)
        self.assertGreaterEqual(len(found), 1, "'### %s' must sketch its %d answer as an object in backticks" % (title, status))
        return found[0]

    def test_the_parser_reads_the_members_of_a_sketched_object(self):
        self.assertEqual(members('{"rev": N, "doc": {…}, "updatedAt": "<UTC time>"}'), ["rev", "doc", "updatedAt"])
        self.assertEqual(members('{"id", "name", "isFounderTier": true, "stand"}'), ["id", "name", "isFounderTier", "stand"])
        self.assertEqual(members('{"error": "money_stale", "message": …, "rev": <the stored revision>}'), ["error", "message", "rev"])
        self.assertEqual(members('{"a": {"b": 1, "c": [{"d": 2}]}, "e": "x, \\"y"}'), ["a", "e"])

    def test_the_sign_in_doors_answer_the_members_the_document_sketches(self):
        stand = self.stand
        stand.set_password("mika")
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD})
        self.assertEqual(sorted(signed.json()), sorted(self.sketched("POST /api/auth/login")))
        fresh = stand.post(SETUP, {"token": stand.invite("misha"), "password": PASSWORD})
        self.assertEqual(sorted(fresh.json()), sorted(self.sketched("POST /api/auth/setup")))
        out = stand.post(LOGOUT, {}, cookie=signed.cookie(stand.settings.cookie_name))
        self.assertEqual(sorted(out.json()), sorted(self.sketched("POST /api/auth/logout")))

    def test_who_am_i_answers_the_members_the_document_sketches(self):
        me = self.stand.get("/api/me", cookie=self.stand.session("mika")).json()
        self.assertEqual(sorted(me), sorted(self.sketched("GET /api/me")))
        self.assertIs(me["isFounderTier"], True)

    def test_a_document_is_read_and_saved_with_the_members_the_document_sketches(self):
        stand = self.stand
        cookie = stand.session("mika")
        read, save = section(self.text, "GET", 3), section(self.text, "PUT", 3)
        never_saved = re.search(r"Before the first save: `([^`]+)`", read)
        self.assertIsNotNone(never_saved, "the GET section says what a document that was never saved answers")
        for path, body in ((LEDGER, ledger()), (PLAN, plan())):
            with self.subTest(path=path):
                first = stand.get(path, cookie=cookie)
                self.assertEqual(first.json(), json.loads(never_saved.group(1)))
                self.assertEqual(list(first.json()), sketches(read, 200)[0], "exactly these members, in this order")
                saved = stand.put(path, {"base": 0, "doc": body}, cookie=cookie)
                self.assertEqual(sorted(saved.json()), sorted(sketches(save, 200)[0]))
                self.assertEqual(list(stand.get(path, cookie=cookie).json()), sketches(read, 200)[0])
                stale = stand.put(path, {"base": 0, "doc": body}, cookie=cookie)
                self.assertEqual(sorted(stale.json()), sorted(sketches(save, 409)[0]))
        sent = re.search(r"The body is `([^`]+)`", save)
        self.assertIsNotNone(sent, "the PUT section says what the body is")
        self.assertEqual(members(sent.group(1)), ["base", "doc"])

    def test_a_refusal_holds_the_two_members_the_document_sketches(self):
        convention = re.search(r"\*\*Refusals are JSON\*\*: `([^`]+)`", self.text)
        self.assertIsNotNone(convention, "Conventions says what a refusal looks like")
        sketched = members(" ".join(convention.group(1).split()))
        self.assertEqual(sketched, ["error", "message"])
        cookie = self.stand.session("mika")
        for answer in (self.stand.get("/api/me"), self.stand.get("/nothing", cookie=cookie),
                       self.stand.post(LOGIN, {"login": "mika"}), self.stand.get("/login", host="evil.example"),
                       self.stand.request("DELETE", "/login", origin=None)):
            self.assertEqual(sorted(answer.json()), sorted(sketched), answer.status)

    def test_the_cookie_is_set_and_cleared_as_the_document_writes_it(self):
        blocks = _FENCE.findall(section(self.text, "The cookie", 2))
        self.assertEqual(len(blocks), 1, "one fenced block: the Set-Cookie line of a stand")
        written = blocks[0].strip()
        self.assertTrue(written.startswith("Set-Cookie: ") and "<token>" in written, written)
        template = written[len("Set-Cookie: "):]
        stand_in = _harness.scrypt_stand_in()
        stand_in.__enter__()
        self.addCleanup(stand_in.__exit__, None, None, None)
        for name in ("prod", "test"):
            with self.subTest(stand=name):
                stand = _harness.Stand(env=_harness.stand_changes(name))
                self.addCleanup(stand.stop)
                stand.set_password("mika")
                signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD})
                self.assertEqual(signed.status, 200, signed.body)
                cookie = signed.cookie(template.split("=", 1)[0])
                self.assertIsNotNone(cookie, "the cookie has the name the document gives it")
                self.assertEqual(signed.all("Set-Cookie"), [template.replace("<token>", cookie.split("=", 1)[1])])
                out = stand.post(LOGOUT, {}, cookie=cookie)
                cleared = re.sub(r"Max-Age=\d+", "Max-Age=0", template.replace("<token>", ""))
                self.assertEqual(out.all("Set-Cookie"), [cleared], "cleared with the same attributes")
        # "In dev the name is money-dev, without Secure and without the __Host- prefix."
        self.stand.set_password("mika")
        dev = self.stand.post(LOGIN, {"login": "mika", "password": PASSWORD})
        value = dev.cookie("money-dev")
        self.assertIsNotNone(value)
        self.assertEqual(dev.all("Set-Cookie"),
                         [template.replace("__Host-money=<token>", value).replace(" Secure;", "")])

    def test_every_answer_carries_the_headers_the_document_lists(self):
        blocks = _FENCE.findall(section(self.text, "Headers on every answer", 2))
        self.assertEqual(len(blocks), 1, "one fenced block: the headers of every answer")
        listed = [line.split(": ", 1) for line in blocks[0].splitlines() if line.strip()]
        self.assertGreaterEqual(len(listed), 8)
        stand = self.stand
        cookie = stand.session("mika")
        answers = {
            "the page": stand.get("/", cookie=cookie), "a vendor file": stand.get("/money/vendor/pdf.min.js", cookie=cookie),
            "the sign-in page": stand.get("/login"), "an asset": stand.get("/assets/auth.css"),
            "JSON": stand.get("/api/me", cookie=cookie), "a document": stand.get(LEDGER, cookie=cookie),
            "a redirect": stand.get("/"), "401": stand.get("/api/me"), "404": stand.get("/nothing", cookie=cookie),
            "405": stand.request("PATCH", "/login", origin=None), "421": stand.get("/login", host="evil.example"),
            "400": stand.get("/login", headers={"Transfer-Encoding": "chunked"}), "204": stand.get("/favicon.ico"),
            "403": stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie, origin="https://evil.example"),
            "robots.txt": stand.get("/robots.txt"), "the health check": stand.get("/healthz"),
        }
        for what, answer in answers.items():
            for name, value in listed:
                with self.subTest(answer=what, header=name):
                    self.assertEqual(answer.all(name), [value])
            with self.subTest(answer=what, header="Content-Security-Policy"):
                self.assertEqual(len(answer.all("Content-Security-Policy")), 1, "and a policy that depends on the kind of answer")
            for name in ("Strict-Transport-Security", "X-Robots-Tag"):
                with self.subTest(answer=what, header=name):
                    self.assertEqual(answer.all(name), [], "added by the edge, not by moneyd")


# ---------------------------------------------------------------------------
# Statuses and error codes, door by door
# ---------------------------------------------------------------------------

def refusals_of_login(case: unittest.TestCase) -> Dict[str, Any]:
    out = {}    # type: Dict[str, Any]
    with _harness.Stand(tune={"hash_wait": 0.05}) as stand:
        stand.set_password("mika")
        good = {"login": "mika", "password": PASSWORD}
        wrong = {"login": "mika", "password": "wrong " + PASSWORD}
        out["no password"] = stand.post(LOGIN, {"login": "mika"})
        out["a wrong password"] = stand.post(LOGIN, wrong)
        out["an unknown login"] = stand.post(LOGIN, {"login": "nobody", "password": PASSWORD})
        with stand.auth.limiter.hash_slot(), stand.auth.limiter.hash_slot():
            out["no hash slot in time"] = stand.post(LOGIN, good)
        if CAN_DENY:
            with read_only(os.path.join(stand.data_dir, "auth")):
                out["the disk refuses the session"] = stand.post(LOGIN, good)
        out["a foreign origin"] = stand.post(LOGIN, good, origin="https://evil.example")
        out["not json"] = stand.post(LOGIN, body=b"login=mika", headers={"Content-Type": "text/plain"})
        out["no length"] = bare(stand.raw(head(stand, "POST", LOGIN, "Origin: " + stand.origin,
                                               "Content-Type: application/json"), half_close=True))
        out["too long"] = stand.post(LOGIN, body=b" " * 4097, headers=JSON)
        out["a body that is not json"] = stand.post(LOGIN, body=b"{", headers=JSON)
        for _attempt in range(12):
            last = stand.post(LOGIN, wrong)
        out["after ten failures"] = last
    with _harness.Stand() as stand:
        stand.set_password("mika")
        with open(os.path.join(stand.data_dir, "auth", "users.json"), "wb") as handle:
            handle.write(b"{")
        out["the accounts file is damaged"] = stand.post(LOGIN, {"login": "mika", "password": PASSWORD})
    return out


def refusals_of_setup(case: unittest.TestCase) -> Dict[str, Any]:
    out = {}    # type: Dict[str, Any]
    with _harness.Stand(tune={"hash_wait": 0.05}) as stand:
        token = stand.invite("misha")
        good = {"token": token, "password": PASSWORD}
        dead = {"token": "A" * 43, "password": PASSWORD}
        out["a link that does not work"] = stand.post(SETUP, dead)
        out["no token at all"] = stand.post(SETUP, {"password": PASSWORD})
        out["a weak password"] = stand.post(SETUP, {"token": token, "password": "short"})
        with stand.auth.limiter.hash_slot(), stand.auth.limiter.hash_slot():
            out["no hash slot in time"] = stand.post(SETUP, good)
        if CAN_DENY:
            with read_only(os.path.join(stand.data_dir, "auth")):
                out["the disk refuses the password"] = stand.post(SETUP, good)
        out["a foreign origin"] = stand.post(SETUP, good, origin="https://evil.example")
        out["not json"] = stand.post(SETUP, body=b"token=x", headers={"Content-Type": "text/plain"})
        out["too long"] = stand.post(SETUP, body=b" " * 4097, headers=JSON)
        out["a body that is not json"] = stand.post(SETUP, body=b"{", headers=JSON)
        for _attempt in range(12):
            last = stand.post(SETUP, dead)
        out["after ten failures"] = last
    with _harness.Stand() as stand:
        token = stand.invite("misha")
        with open(os.path.join(stand.data_dir, "auth", "users.json"), "wb") as handle:
            handle.write(b"{")
        out["the accounts file is damaged"] = stand.post(SETUP, {"token": token, "password": PASSWORD})
    return out


def refusals_of_logout(case: unittest.TestCase) -> Dict[str, Any]:
    out = {}    # type: Dict[str, Any]
    with _harness.Stand() as stand:
        cookie = stand.session("mika")
        out["a foreign origin"] = stand.post(LOGOUT, {}, cookie=cookie, origin="https://evil.example")
        out["not json"] = stand.post(LOGOUT, body=b"x", cookie=cookie, headers={"Content-Type": "text/plain"})
        out["too long"] = stand.post(LOGOUT, body=b" " * 4097, cookie=cookie, headers=JSON)
        if CAN_DENY:
            with read_only(os.path.join(stand.data_dir, "auth")):
                out["the disk refuses to forget the session"] = stand.post(LOGOUT, {}, cookie=cookie)
    return out


def refusals_of_a_session_page(path: str) -> Callable[[unittest.TestCase], Dict[str, Any]]:
    def provoke(case: unittest.TestCase) -> Dict[str, Any]:
        out = {}    # type: Dict[str, Any]
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            out["no session"] = stand.get(path)
            out["a session that has ended"] = stand.get(path, cookie="%s=%s" % (stand.settings.cookie_name, "A" * 43))
            with open(os.path.join(stand.data_dir, "auth", "users.json"), "wb") as handle:
                handle.write(b"{")
            out["the accounts file is damaged"] = stand.get(path, cookie=cookie)
        return out
    return provoke


def refusals_of_a_document_get(path: str, kind: str) -> Callable[[unittest.TestCase], Dict[str, Any]]:
    def provoke(case: unittest.TestCase) -> Dict[str, Any]:
        out = {}    # type: Dict[str, Any]
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            text = ledger() if kind == "ledger" else plan()
            out["no session"] = stand.get(path)
            out["from another site"] = stand.get(path, cookie=cookie, headers={"Sec-Fetch-Site": "cross-site"})
            case.assertEqual(stand.put(path, {"base": 0, "doc": text}, cookie=cookie).status, 200)
            with open(os.path.join(stand.data_dir, kind, "current.json"), "wb") as handle:
                handle.write(b'{"rev":1,"doc":{')
            out["the stored file is cut short"] = stand.get(path, cookie=cookie)
            os.unlink(os.path.join(stand.data_dir, kind, "current.json"))
            out["the stored file is gone"] = stand.get(path, cookie=cookie)
        return out
    return provoke


def refusals_of_a_document_put(path: str, kind: str) -> Callable[[unittest.TestCase], Dict[str, Any]]:
    def provoke(case: unittest.TestCase) -> Dict[str, Any]:
        out = {}    # type: Dict[str, Any]
        text = ledger() if kind == "ledger" else plan()
        other = plan() if kind == "ledger" else ledger()
        good = {"base": 0, "doc": text}
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            limit = stand.settings.put_limit(kind)
            lines = ("Origin: " + stand.origin, "Content-Type: application/json")
            out["no session"] = stand.put(path, good)
            out["a foreign origin"] = stand.put(path, good, cookie=cookie, origin="https://evil.example")
            out["not json"] = stand.put(path, body=b"{}", cookie=cookie, headers={"Content-Type": "text/plain"})
            out["no length"] = bare(stand.raw(head(stand, "PUT", path, *lines, cookie=cookie), half_close=True))
            out["one byte too long"] = bare(stand.raw(
                head(stand, "PUT", path, "Content-Length: %d" % (limit + 1), *lines, cookie=cookie), half_close=True))
            out["a body that is not json"] = stand.put(path, body=b"{", cookie=cookie, headers=JSON)
            out["the other document"] = stand.put(path, {"base": 0, "doc": other}, cookie=cookie)
            out["a document sent as an object"] = stand.put(path, {"base": 0, "doc": {"tx": [], "banks": []}}, cookie=cookie)
            out["no base"] = stand.put(path, {"doc": text}, cookie=cookie)
            case.assertEqual(stand.put(path, good, cookie=cookie).status, 200)
            out["a stale base"] = stand.put(path, good, cookie=cookie)
            # The lock is held by somebody else (ctl is a second process) for longer than a save waits.
            patient = stand.stores[kind]
            stand.stores[kind] = store.DocStore(stand.data_dir, kind, stand.clock, max_bytes=limit, lock_timeout=0.05)
            with store.FileLock(os.path.join(stand.data_dir, kind, ".lock")):
                out["the lock is taken"] = stand.put(path, {"base": 1, "doc": text}, cookie=cookie)
            # The disk has no room: free space is not above three times the document plus 64 MB.
            stand.stores[kind] = store.DocStore(stand.data_dir, kind, stand.clock, max_bytes=limit,
                                                free_bytes=lambda _path: 64 * MIB)
            out["no room on the disk"] = stand.put(path, {"base": 1, "doc": text}, cookie=cookie)
            stand.stores[kind] = patient
            with open(os.path.join(stand.data_dir, kind, "current.json"), "wb") as handle:
                handle.write(b'{"rev":1,"doc":{')
            out["the stored file is cut short"] = stand.put(path, {"base": 1, "doc": text}, cookie=cookie)
        return out
    return provoke


def nothing_of_its_own(case: unittest.TestCase) -> Dict[str, Any]:
    return {}


#: How each door is made to refuse. A door that is not here refuses nothing by itself.
PROVOCATIONS = {
    "POST /api/auth/login": refusals_of_login,
    "POST /api/auth/setup": refusals_of_setup,
    "POST /api/auth/logout": refusals_of_logout,
    "GET / and GET /index.html": refusals_of_a_session_page("/"),
    "GET /money/vendor/…": refusals_of_a_session_page("/money/vendor/pdf.min.js"),
    "GET /data": refusals_of_a_session_page("/data"),
    "The platform's old links": refusals_of_a_session_page("/dashboard"),
    "GET /api/me": refusals_of_a_session_page("/api/me"),
    "GET": refusals_of_a_document_get(LEDGER, "ledger"),
    "PUT": refusals_of_a_document_put(LEDGER, "ledger"),
}   # type: Dict[str, Callable[[unittest.TestCase], Dict[str, Any]]]


class DoorAnswersTests(unittest.TestCase):
    """Every refusal the document lists for a door can be met there, and every refusal met there is listed."""

    _seen = {}      # type: Dict[str, Dict[str, Any]]

    @classmethod
    def setUpClass(cls):
        cls.text = document()
        cls.generic = set()     # type: Set[Tuple[int, Optional[str]]]
        for title in GENERIC:
            cls.generic |= answers(section(cls.text, title, 2))
        cls.listed = {title: answers(section(cls.text, title, 3)) for title, _rows in DOORS}
        cls._seen = {}

    def seen(self, title: str) -> Dict[str, Any]:
        """label -> answer: what the door of ``title`` said to each way of making it refuse."""
        if title not in self._seen:
            type(self)._seen[title] = PROVOCATIONS.get(title, nothing_of_its_own)(self)
        return self._seen[title]

    def refusals(self, title: str) -> Dict[Tuple[int, Optional[str]], str]:
        """(status, code) -> the label of one provocation that met it; refusals only."""
        met = {}    # type: Dict[Tuple[int, Optional[str]], str]
        for label, answer in self.seen(title).items():
            if answer.status >= 400:
                met.setdefault(pair(answer), label)
        return met

    def test_every_refusal_the_document_lists_for_a_door_is_given_by_that_door(self):
        for title, _rows in DOORS:
            met = self.refusals(title)
            statuses = {status for status, _code in met}
            for status, code in sorted(self.listed[title], key=str):
                if status < 400:
                    continue
                with self.subTest(door=title, listed="%d %s" % (status, code or "")):
                    if not CAN_DENY and status == 507 and title.startswith("POST /api/auth/"):
                        continue
                    if code is None:
                        self.assertIn(status, statuses)
                    else:
                        self.assertIn((status, code), met, "the document lists it; the door never said it. "
                                      "What the door said: %s" % sorted(met, key=str))

    def test_every_refusal_a_door_gives_is_listed_for_that_door(self):
        for title, _rows in DOORS:
            for met, label in sorted(self.refusals(title).items(), key=str):
                with self.subTest(door=title, answer="%d %s" % (met[0], met[1] or ""), when=label):
                    self.assertTrue(
                        is_listed(met, self.listed[title], self.generic),
                        "the door answered %d %s (%s); docs/api.md lists it neither under '### %s' nor in "
                        "the sections that speak for every request" % (met[0], met[1] or "", label, title))

    def test_the_other_document_has_the_same_refusals(self):
        ledger_door = self.refusals("PUT")
        plan_door = {}     # type: Dict[Tuple[int, Optional[str]], str]
        for label, answer in refusals_of_a_document_put(PLAN, "plan")(self).items():
            if answer.status >= 400:
                plan_door.setdefault(pair(answer), label)
        self.assertEqual(sorted(plan_door, key=str), sorted(ledger_door, key=str),
                         "'two documents with one contract'")
        reads = {pair(answer) for answer in refusals_of_a_document_get(PLAN, "plan")(self).values()
                 if answer.status >= 400}
        self.assertEqual(sorted(reads, key=str), sorted(self.refusals("GET"), key=str))

    def test_a_refusal_carries_what_the_document_says_goes_with_it(self):
        # 409 names the stored revision; 429 says how long to wait, twice; weak_password says the minimum.
        stale = self.seen("PUT")["a stale base"]
        self.assertEqual((stale.status, stale.json()["error"], stale.json()["rev"]), (409, "money_stale", 1))
        for title in ("POST /api/auth/login", "POST /api/auth/setup"):
            limited = self.seen(title)["after ten failures"]
            self.assertEqual(pair(limited), (429, "too_many_attempts"), title)
            seconds = limited.json()["retryAfter"]
            self.assertTrue(isinstance(seconds, int) and 0 < seconds <= 900, seconds)
            self.assertEqual(limited.header("Retry-After"), str(seconds))
        weak = self.seen("POST /api/auth/setup")["a weak password"]
        self.assertEqual((pair(weak), weak.json()["min"]), ((400, "weak_password"), 12))


class EveryRequestTests(unittest.TestCase):
    """The refusals of the HTTP layer itself, which no door owns, against the sections that speak for every request."""

    @classmethod
    def setUpClass(cls):
        text = document()
        cls.generic = set()     # type: Set[Tuple[int, Optional[str]]]
        for title in GENERIC:
            cls.generic |= answers(section(text, title, 2))

    _met = None     # type: Optional[Dict[str, Any]]

    def met(self) -> Dict[str, Any]:
        """label -> answer, for every way the HTTP layer turns a request away before a door sees it."""
        if type(self)._met is None:
            type(self)._met = self._meet()
        return type(self)._met

    def _meet(self) -> Dict[str, Any]:
        out = {}    # type: Dict[str, Any]
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            host = "Host: %s\r\n" % stand.host
            lines = ("Origin: " + stand.origin, "Content-Type: application/json")

            def send(data: str) -> Bare:
                return bare(stand.raw(data.encode("latin-1"), half_close=True))

            out["another host"] = stand.get("/login", host="evil.example")
            out["a transfer-encoding"] = stand.get("/login", headers={"Transfer-Encoding": "chunked"})
            out["two lengths"] = send("POST %s HTTP/1.1\r\n%sContent-Length: 2\r\nContent-Length: 3\r\n\r\n{}" % (LOGIN, host))
            out["a method nobody serves"] = stand.request("DELETE", LEDGER, cookie=cookie, origin=None)
            out["a path's other method"] = stand.post("/login", {})
            out["no session, under /api/"] = stand.get("/api/me")
            out["a path that is not in the table"] = stand.get("/nothing", cookie=cookie)
            out["from another site"] = stand.get("/api/me", cookie=cookie, headers={"Sec-Fetch-Site": "same-site"})
            out["a body that is not json by type"] = stand.put(LEDGER, body=b"{}", cookie=cookie,
                                                              headers={"Content-Type": "text/plain"})
            out["no length"] = bare(stand.raw(head(stand, "PUT", LEDGER, *lines, cookie=cookie), half_close=True))
            out["too long"] = stand.post(LOGIN, body=b" " * 4097, headers=JSON)
            out["a body that is not json"] = stand.post(LOGIN, body=b"{", headers=JSON)
            out["a body nested too deep"] = stand.post(LOGIN, body=b"[" * 17 + b"]" * 17, headers=JSON)
            out["a request line that is not one"] = send("GET /login\r\n\r\n")
            out["a header line that is not one"] = send("GET /login HTTP/1.1\r\n%sBroken header\r\n\r\n" % host)
            out["a request line that is too long"] = send("GET /%s HTTP/1.1\r\n%s\r\n" % ("a" * 9000, host))
            out["too many headers"] = send("GET /login HTTP/1.1\r\n%s%s\r\n" % (
                host, "".join("X-%d: 1\r\n" % number for number in range(101))))
            out["an expectation nobody meets"] = send("GET /login HTTP/1.1\r\n%sExpect: something\r\n\r\n" % host)
            with mock.patch.object(stand.stores["plan"], "read", side_effect=RuntimeError("a fault of ours")):
                out["a fault of the server's own"] = stand.get(PLAN, cookie=cookie)
            with open(os.path.join(stand.data_dir, "auth", "users.json"), "wb") as handle:
                handle.write(b"{")
            out["the accounts file is damaged"] = stand.get("/api/me", cookie=cookie)
        with _harness.Stand(tune={"signed_out_slots": 1, "max_connections_per_address": 2}) as stand:
            cookie = stand.session("mika")
            lines = ("Origin: " + stand.origin, "Content-Type: application/json", "Content-Length: 40")
            # A sign-in whose body never comes holds the one signed-out slot ...
            with held(stand, head(stand, "POST", LOGIN, *lines)):
                out["no signed-out slot"] = until(
                    lambda: (lambda a: a if a.status == 503 else None)(stand.get("/login")))
                # ... and with a founder's save that stalls as well, the address has its two connections.
                with held(stand, head(stand, "PUT", LEDGER, *lines, cookie=cookie)):
                    out["too many connections of one address"] = until(
                        lambda: (lambda a: a if pair(a) == (503, "too_many_connections") else None)(
                            stand.get("/api/me", cookie=cookie)))
        with _harness.Stand(tune={"max_connections": 1}) as stand:
            with held(stand, b""):
                out["no thread"] = until(lambda: (lambda a: a if a.status == 503 else None)(
                    bare(stand.raw(b"", half_close=True))))
        return out

    def test_every_way_of_being_turned_away_was_met(self):
        for label, answer in self.met().items():
            with self.subTest(when=label):
                self.assertIsNotNone(answer, "the server never turned this request away")
                self.assertGreaterEqual(answer.status, 400)

    def test_every_status_the_http_layer_refuses_with_is_named_in_the_document(self):
        named = {status for status, _code in self.generic}
        unnamed = {}    # type: Dict[int, str]
        for label, answer in self.met().items():
            if answer is not None and answer.status not in named:
                unnamed.setdefault(answer.status, label)
        self.assertEqual(unnamed, {}, "the server answers these statuses (status -> when), and none of the "
                                      "sections %s of docs/api.md names them" % (GENERIC,))

    def test_every_code_the_document_gives_for_every_request_is_the_code_the_server_gives(self):
        met = {pair(answer) for answer in self.met().values() if answer is not None}
        for status, code in sorted(self.generic, key=str):
            if status < 400:
                continue
            with self.subTest(named="%d %s" % (status, code or "")):
                if code is None:
                    self.assertIn(status, {seen for seen, _code in met})
                else:
                    self.assertIn((status, code), met)

    def test_every_refusal_of_the_code_is_in_the_document_or_has_no_door(self):
        # The classes are the code's own list of what a door can answer with.
        named = answers(document())
        classes, queue = [], [config.Refusal]
        while queue:
            for kind in queue.pop().__subclasses__():
                if kind.__module__ in (auth.__name__, store.__name__, config.__name__, httpd.__name__):
                    classes.append(kind)
                    queue.append(kind)
        self.assertGreater(len(classes), 10)
        for kind in classes:
            if kind.code == "internal":
                continue
            with self.subTest(refusal=kind.__name__):
                if kind.code in NO_DOOR:
                    self.assertNotIn(kind.code, {code for _status, code in named},
                                     "the document says this has no door")
                else:
                    self.assertIn((kind.status, kind.code), named,
                                  "%s answers %d %s, which docs/api.md never names" % (kind.__name__, kind.status, kind.code))


if __name__ == "__main__":
    unittest.main()
