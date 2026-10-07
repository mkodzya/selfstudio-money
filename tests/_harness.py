"""A running stand for tests: a dev stand on a free loopback port, in a temporary directory.

Two ways to have one, with the same doors on both::

    from tests import _harness

    with _harness.Stand() as stand:              # in this process: fast, and the clock is the test's
        cookie = stand.session("mika")           # a signed-in session, made in the store: no browser, no password
        answer = stand.get("/api/me", cookie=cookie)
        answer.status, answer.header("cache-control"), answer.json()
        stand.put("/api/founder/money", {"base": 0, "doc": _harness.ledger(3)}, cookie=cookie)
        stand.clock.tick(days=29)                # sessions, links and day copies follow this clock
        stand.ctl("user", "list")                # moneyd.ctl in this process, on this stand's data

    with _harness.ProcessStand() as stand:       # the real thing: `python -m moneyd` as a child process
        stand.ctl("empty").returncode            # `python -m moneyd.ctl` as another one
        stand.get("/login")
        status = stand.stop()                    # SIGTERM; the exit status

    with _harness.scrypt_stand_in():             # a prod or a test stand, in this process only:
        with _harness.Stand(env=_harness.stand_changes("test")) as stand:    # https name, __Host- cookie,
            stand.ctl("selfcheck")                                           # the edge's X-Forwarded-For believed

What is here
    ``FakeClock``                 a clock that stands still until the test moves it (``tick``, ``set``)
    ``free_port()``               a loopback port nobody listens on
    ``dev_environ(dir, port)``    the ``MONEY_*`` settings of a dev stand; ``Stand(env={...})`` changes them
    ``Stand(clock=, env=, tune=)``  ``tune`` replaces fields of the settings (``{"signed_out_slots": 1}``).
                                  Without a trusted proxy every request of a test comes from one address,
                                  127.0.0.1, which may hold two signed-out slots: a test that stalls more
                                  sign-ins at once names an address for each (``MONEY_TRUSTED_PROXIES`` set to
                                  ``127.0.0.0/8`` and an ``X-Forwarded-For``), or tunes ``signed_out_body_slots_per_address``
    ``ProcessStand(env=)``
    ``stand_changes(name)``       what turns the dev settings into those of ``prod`` or ``test``
    ``scrypt_stand_in()``         ``hashlib.scrypt`` replaced by a cheap digest, for as long as the ``with`` lasts
    ``request(port, method, path, ...) -> Response``    one request with ``http.client``
    ``raw(port, data) -> bytes``  bytes in, bytes out: for requests no client library would send
    ``ledger(rows)``, ``plan(rows)``                    documents as the page sends them: strings of JSON
    ``PASSWORD``                  a password the rules accept

Nothing is left behind: ``stop()`` (or leaving the ``with``) removes the directory and ends the
process, and whatever a failing test forgot is cleaned up when the interpreter exits.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import atexit
import contextlib
import dataclasses
import datetime
import hashlib
import http.client
import io
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, Iterator, List, NamedTuple, Optional
from unittest import mock

from moneyd import auth, config, ctl, httpd, log, store

__all__ = [
    "CHECKOUT", "FOUNDERS", "PASSWORD", "FakeClock", "free_port", "dev_environ", "stand_changes", "scrypt_stand_in",
    "Response", "request", "raw", "Stand", "ProcessStand", "CtlResult", "ledger", "plan",
]

CHECKOUT = _safety.CHECKOUT
FOUNDERS = "mika:Mika,misha:Misha,vanya:Vanya"
#: 28 characters, none of the refused words, no founder's login or name in it.
PASSWORD = "correct horse battery staple"
UTC = datetime.timezone.utc


class FakeClock:
    """A clock that stands still until the test moves it. ``clock()`` is the current moment (UTC)."""

    def __init__(self, start: datetime.datetime = datetime.datetime(2026, 10, 7, 12, 0, 0, tzinfo=UTC)):
        self.now = start

    def __call__(self) -> datetime.datetime:
        return self.now

    def tick(self, **delta: float) -> datetime.datetime:
        """Move on: ``tick(seconds=5)``, ``tick(days=29, hours=1)``."""
        self.now += datetime.timedelta(**delta)
        return self.now

    def set(self, moment: datetime.datetime) -> None:
        self.now = config.as_utc(moment)


def free_port() -> int:
    """A loopback port that was free a moment ago."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]
    finally:
        probe.close()


def dev_environ(data_dir: str, port: int, **changes: Optional[str]) -> Dict[str, str]:
    """The settings of a dev stand. A change to None takes a setting away."""
    environ = {
        "MONEY_STAND": "dev",
        "MONEY_PUBLIC_URL": "http://finance.localhost:%d" % port,
        "MONEY_FOUNDERS": FOUNDERS,
        "MONEY_DATA_DIR": data_dir,
        "MONEY_BIND": "127.0.0.1:%d" % port,
        "MONEY_WEB_DIR": CHECKOUT,
        # The dev stand-in: about 9 ms a hash. Without it Python 3.13 runs the real scrypt, a quarter of a second each.
        "MONEY_KDF": "pbkdf2",
    }  # type: Dict[str, Optional[str]]
    environ.update(changes)
    return {name: value for name, value in environ.items() if value is not None}


def stand_changes(name: str) -> Dict[str, Optional[str]]:
    """What turns the dev settings into a server stand's, for ``Stand(env=stand_changes("test"))``.

    The stand still listens on loopback and is asked there; what changes is everything a
    stand's name decides: the https address, the ``__Host-`` cookie with ``Secure``, scrypt
    only, the look of the test stand, what ``ctl`` refuses on prod. Loopback is trusted as
    the edge, so a test can say whose request it is with ``X-Forwarded-For``. Such a stand
    runs in this process only (``Stand``), inside ``scrypt_stand_in()`` where Python has no scrypt.
    """
    if name not in ("prod", "test"):
        raise ValueError("a server stand is prod or test")
    return {
        "MONEY_STAND": name,
        "MONEY_PUBLIC_URL": "https://finance.selfstudio.se" if name == "prod" else "https://finance.test.selfstudio.se",
        "MONEY_KDF": None,
        "MONEY_TRUSTED_PROXIES": "127.0.0.0/8",
    }


@contextlib.contextmanager
def scrypt_stand_in() -> Iterator[None]:
    """``hashlib.scrypt`` replaced by a cheap digest with the same signature.

    So that a prod or a test stand can be run where Python has no scrypt (the Mac's 3.9),
    and fast where it has. The real scrypt is held to its vectors in the core's own tests.
    """
    def scrypt(secret: bytes, *, salt: bytes, n: int, r: int, p: int, dklen: int = 64, maxmem: int = 0) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", secret, salt + bytes([n.bit_length(), r, p]), 20, dklen)
    with mock.patch.object(hashlib, "scrypt", scrypt, create=True):
        yield


def ledger(rows: int = 3, note: str = "") -> str:
    """A ledger of ``rows`` rows, as the page sends it: a string of JSON."""
    return json.dumps({"v": 1, "tx": [{"id": "t-%d" % i, "d": "2026-09-01", "a": 100 + i, "c": "rev"}
                                      for i in range(rows)], "note": note}, ensure_ascii=False)


def plan(rows: int = 2, cushion: int = 0) -> str:
    """A cash plan with ``rows`` banks, as the page sends it: a string of JSON."""
    return json.dumps({"v": 2, "cushion": cushion, "banks": [{"id": "b-%d" % i, "n": "Bank %d" % i, "bal": 1000 * i}
                                                              for i in range(rows)],
                       "inflows": [], "team": [], "taxes": [], "other": []}, ensure_ascii=False)


# ---------------------------------------------------------------------------
# One request
# ---------------------------------------------------------------------------

class Response(NamedTuple):
    status: int
    reason: str
    headers: Any            # http.client.HTTPMessage: .get(name), .get_all(name), case-insensitive
    body: bytes

    def header(self, name: str) -> Optional[str]:
        return self.headers.get(name)

    def all(self, name: str) -> List[str]:
        """Every value of a header that may come more than once (``Set-Cookie``)."""
        return self.headers.get_all(name) or []

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))

    def cookie(self, name: str) -> Optional[str]:
        """The ``name=value`` a ``Set-Cookie`` of this answer sets, ready to be sent back; None when it sets none."""
        for line in self.all("Set-Cookie"):
            pair = line.split(";", 1)[0].strip()
            if pair.startswith(name + "=") and len(pair) > len(name) + 1:
                return pair
        return None


def request(port: int, method: str, path: str, *, host: Optional[str] = None, headers: Optional[Dict[str, str]] = None,
            body: Optional[bytes] = None, timeout: float = 10.0) -> Response:
    """One request to 127.0.0.1:``port``. ``host`` is the Host header; nothing else is added but what
    ``http.client`` itself adds (``Accept-Encoding: identity``, and a ``Content-Length`` for a body).
    Returns when the service has closed the connection."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    sent = {} if host is None else {"Host": host}
    sent.update(headers or {})
    try:
        connection.request(method, path, body=body, headers=sent)
        answer = connection.getresponse()
        try:
            # Read to the end of the connection, not to Content-Length: the service closes once
            # it is done with a request, its log line written - so what a test reads from the
            # log right after this call is already there.
            received = answer.fp.read() if answer.fp is not None else b""
        finally:
            answer.close()
        return Response(answer.status, answer.reason, answer.headers, received)
    finally:
        connection.close()


def raw(port: int, data: bytes, *, timeout: float = 5.0, pause: float = 0.0, then: bytes = b"",
        half_close: bool = False) -> bytes:
    """Send ``data`` as it is, optionally wait and send ``then``, and return everything that comes back
    until the server closes (b"" when it closes without a word).

    ``half_close`` ends the sending side first: "that is all I have to say". A request that
    announces a body and does not send it should say so, or the server waits half a second
    for the rest before it lets go of the connection.
    """
    connection = socket.create_connection(("127.0.0.1", port), timeout=timeout)
    try:
        connection.sendall(data)
        if pause:
            time.sleep(pause)
        if then:
            try:
                connection.sendall(then)
            except OSError:
                pass
        if half_close:
            try:
                connection.shutdown(socket.SHUT_WR)
            except OSError:
                pass
        chunks = []
        while True:
            try:
                chunk = connection.recv(65536)
            except (socket.timeout, ConnectionError):
                break
            if not chunk:
                break
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        connection.close()


_AUTO = object()


class _Doors:
    """The doors of a stand, for both kinds of stand. Needs ``port`` and ``settings``."""

    port = 0
    settings = None  # type: Any

    @property
    def origin(self) -> str:
        return self.settings.public_url

    @property
    def host(self) -> str:
        return self.settings.public_host

    def request(self, method: str, path: str, json_body: Any = None, *, body: Optional[bytes] = None,
                cookie: Optional[str] = None, headers: Optional[Dict[str, str]] = None, origin: Any = _AUTO,
                host: Any = _AUTO, timeout: float = 10.0) -> Response:
        """A request the way the page behind the edge would send it.

        ``json_body`` is sent as JSON with its content type. ``origin`` is the stand's own for
        anything but GET and HEAD unless said otherwise (``origin=None``: no Origin at all).
        ``host`` is the stand's public host unless said otherwise. ``cookie`` is a Cookie value,
        as ``session()`` and ``Response.cookie()`` give it.
        """
        sent = {}  # type: Dict[str, str]
        if json_body is not None:
            body = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
            sent["Content-Type"] = "application/json"
        if origin is _AUTO:
            origin = self.origin if method not in ("GET", "HEAD") else None
        if origin is not None:
            sent["Origin"] = origin
        if cookie:
            sent["Cookie"] = cookie
        sent.update(headers or {})
        return request(self.port, method, path, host=self.host if host is _AUTO else host, headers=sent,
                       body=body, timeout=timeout)

    def get(self, path: str, **options: Any) -> Response:
        return self.request("GET", path, **options)

    def post(self, path: str, json_body: Any = None, **options: Any) -> Response:
        return self.request("POST", path, json_body, **options)

    def put(self, path: str, json_body: Any = None, **options: Any) -> Response:
        return self.request("PUT", path, json_body, **options)

    def raw(self, data: bytes, **options: Any) -> bytes:
        return raw(self.port, data, **options)


# ---------------------------------------------------------------------------
# A stand in this process
# ---------------------------------------------------------------------------

class CtlResult(NamedTuple):
    status: int
    out: str
    err: str


class _Terminal(io.StringIO):
    def isatty(self) -> bool:
        return True


_LIVE = set()  # type: set


def _reap() -> None:
    for stand in list(_LIVE):
        try:
            stand.stop()
        except Exception:       # noqa: BLE001 - the interpreter is going away
            pass


atexit.register(_reap)


class Stand(_Doors):
    """A dev stand served from this process.

    ``clock`` is a ``FakeClock`` unless given (``config.utcnow`` for the real one); the store,
    the sign-in and the server all read it. ``env`` changes ``MONEY_*`` settings, ``tune``
    replaces fields of ``Settings`` after they are read. Attributes: ``settings``, ``environ``,
    ``data_dir``, ``port``, ``clock``, ``auth``, ``stores``, ``security_log``, ``server``.
    """

    def __init__(self, clock: Any = None, env: Optional[Dict[str, Optional[str]]] = None,
                 tune: Optional[Dict[str, Any]] = None, start: bool = True):
        self.clock = clock if clock is not None else FakeClock()
        self.data_dir = tempfile.mkdtemp(prefix="money-test-")
        self._output = io.StringIO()
        self.server = None  # type: Any
        _LIVE.add(self)
        try:
            refused = None  # type: Optional[OSError]
            for _attempt in range(5):
                self.port = free_port()
                self.environ = dev_environ(self.data_dir, self.port, **(env or {}))
                settings = config.Settings.from_env(self.environ, self.clock)
                self.settings = dataclasses.replace(settings, **tune) if tune else settings
                store.prepare_data_dir(self.settings.data_dir, self.settings.stand)
                self.security_log = log.SecurityLog(self.data_dir, self.clock,
                                                    max_bytes=self.settings.security_log_bytes,
                                                    keep=self.settings.security_log_files)
                self.auth = auth.Auth(self.settings, self.clock, self.security_log)
                self.auth.boot()
                self.stores = store.open_stores(self.settings, self.clock, self.security_log)
                try:
                    self.server = httpd.MoneyServer(self.settings, self.auth, self.stores,
                                                    log.RequestLog(self._output, self.clock), self.clock,
                                                    self.security_log)
                    break
                except OSError as error:        # the port was taken between the look and the bind
                    refused = error
            else:
                raise refused  # type: ignore[misc]
            if start:
                self.start()
        except BaseException:
            self.stop()
            raise

    def start(self) -> None:
        # The accept loop looks every 5 ms whether it has been told to stop: stopping a stand is
        # then a matter of milliseconds, and a suite stops several hundred of them.
        self.server.serve_in_thread(poll_interval=0.005)

    def stop(self) -> None:
        """End the server and remove the directory. Safe to call twice."""
        _LIVE.discard(self)
        server, self.server = self.server, None
        if server is not None:
            server.stop(grace=2.0)
        shutil.rmtree(self.data_dir, True)

    def __enter__(self) -> "Stand":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.stop()

    # -- being somebody, without a browser ----------------------------------

    def session(self, login: str = "mika", ttl: Optional[int] = None) -> str:
        """A signed-in session of ``login``, made in the store. Returns the Cookie value (``money-dev=<token>``)."""
        user = self.auth.users.get(login)
        token, _session = self.auth.sessions.create(login, "127.0.0.1", "tests", gen=user.gen, ttl=ttl)
        return "%s=%s" % (self.settings.cookie_name, token)

    def token_of(self, cookie: str) -> str:
        return cookie.split("=", 1)[1]

    def set_password(self, login: str = "mika", password: str = PASSWORD) -> str:
        """Give ``login`` a password without a link. Returns the password. (It closes the login's sessions.)"""
        self.auth.users.set_password(login, auth.hash_password(password, self.settings.kdf))
        return password

    def invite(self, login: str = "mika") -> str:
        """Issue a one-time link for ``login`` and return its token (what follows ``#t=``)."""
        link, _expires = self.auth.issue_invite(login, by="tests")
        return link.split("#t=", 1)[1]

    # -- what the stand wrote down ------------------------------------------

    def log_text(self) -> str:
        """Everything the server wrote to its standard output so far."""
        return self._output.getvalue()

    def log_lines(self) -> List[Dict[str, Any]]:
        """The request log so far, oldest first, as dicts (requests have ``path``, notes have ``event``)."""
        return [json.loads(line) for line in self._output.getvalue().splitlines() if line.strip()]

    def security_events(self) -> List[Dict[str, Any]]:
        """The security log, oldest first."""
        return list(reversed(self.security_log.tail(10000)))

    def ctl(self, *args: str, stdin: Any = "", terminal: bool = False) -> CtlResult:
        """Run ``moneyd.ctl`` in this process, on this stand's settings. ``stdin`` is text or bytes;
        ``terminal`` makes standard output look like one (``user invite`` asks)."""
        out = _Terminal() if terminal else io.StringIO()
        err = io.StringIO()
        source = io.BytesIO(stdin) if isinstance(stdin, bytes) else io.StringIO(stdin)
        status = ctl.main(list(args), environ=self.environ, stdin=source, stdout=out, stderr=err, clock=self.clock)
        return CtlResult(status, out.getvalue(), err.getvalue())


# ---------------------------------------------------------------------------
# A stand as a child process
# ---------------------------------------------------------------------------

class ProcessStand(_Doors):
    """``python -m moneyd`` as a child process, on a dev stand's settings.

    ``environ`` is what the child (and ``ctl``) get: this process's environment without any
    ``MONEY_*`` of its own, plus the dev stand's. ``settings`` are the same settings read here.
    """

    def __init__(self, env: Optional[Dict[str, Optional[str]]] = None, start: bool = True,
                 python: str = sys.executable):
        self.python = python
        self.data_dir = tempfile.mkdtemp(prefix="money-test-")
        self.port = free_port()
        stand = dev_environ(self.data_dir, self.port, **(env or {}))
        self.environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
        self.environ.update(stand)
        self.environ.update({"PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1"})
        self.settings = config.Settings.from_env(stand)
        self.process = None     # type: Optional[subprocess.Popen]
        # The child writes into a file, not a pipe: nobody has to keep reading it.
        handle, self._output = tempfile.mkstemp(prefix="money-test-", suffix=".log")
        os.close(handle)
        self._said = None       # type: Optional[str]
        _LIVE.add(self)
        if start:
            try:
                self.start()
            except BaseException:
                self.stop()
                raise

    def start(self, wait: float = 15.0) -> None:
        """Start the service and wait until it answers. Raises ``AssertionError`` with its output when it does not."""
        with open(self._output, "ab") as sink:
            self.process = subprocess.Popen([self.python, "-m", "moneyd"], cwd=CHECKOUT, env=self.environ,
                                            stdin=subprocess.DEVNULL, stdout=sink, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + wait
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise AssertionError("moneyd ended at once with status %s:\n%s"
                                     % (self.process.returncode, self.output()))
            try:
                if self.get("/healthz", timeout=1.0).status == 200:
                    return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(0.03)
        raise AssertionError("moneyd did not answer within %.0f s:\n%s" % (wait, self.output()))

    def stop(self, timeout: float = 12.0) -> Optional[int]:
        """SIGTERM, wait, and SIGKILL if that was not enough. Returns the exit status. Safe to call twice."""
        _LIVE.discard(self)
        process = self.process
        status = None
        if process is not None:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(5.0)
            status = process.returncode
        if self._said is None:
            self._said = self.output()
            try:
                os.unlink(self._output)
            except OSError:
                pass
        shutil.rmtree(self.data_dir, True)
        return status

    def __enter__(self) -> "ProcessStand":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.stop()

    def output(self) -> str:
        """What the service wrote to standard output and standard error - so far, or in all once it is stopped."""
        if self._said is not None:
            return self._said
        try:
            with open(self._output, "rb") as written:
                return written.read().decode("utf-8", "replace")
        except OSError:
            return ""

    def ctl(self, *args: str, input: Optional[str] = None,       # noqa: A002 - subprocess's own word
            timeout: float = 60.0) -> "subprocess.CompletedProcess[str]":
        """``python -m moneyd.ctl <args>`` as its own process: ``.returncode``, ``.stdout``, ``.stderr``."""
        return subprocess.run([self.python, "-m", "moneyd.ctl"] + list(args), cwd=CHECKOUT, env=self.environ,
                              input=input, stdin=None if input is not None else subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=timeout)
