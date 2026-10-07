"""The HTTP layer: one fixed table of exact paths in front of the two documents and the sign-in.

API for ``__main__``, ``ctl`` and the tests
-------------------------------------------
``ROUTES``
    The whole surface as data: ``Route(method, path, session, handler, body, doc)``, one row
    per method and path, in the order of ``docs/api.md``. Nothing is served that is not a
    row here, and no path is ever mapped to a file. ``HEAD`` is answered wherever ``GET``
    is, with the same headers and no body; it has no rows of its own.
``PUBLIC_PATHS``
    The paths that give their own answer to a caller who is not signed in.
``SERVED_METHODS``, ``VENDOR_FILES``
    The methods that are served at all (anything else is 405) and the three vendor names.
``CSP_OWN_PAGES``, ``CSP_VENDOR``, ``CSP_JSON``, ``page_policy(hashes)``, ``FIXED_HEADERS``
    The four policies and the headers every answer carries.
``inspect_page(data) -> PageFacts(script_hashes, inline_handlers)``
    What the page's policy is built from: the sha256 of every inline script of the file as
    it is, and how many inline event handlers it has (the policy would not run them).
``WebFiles(settings, clock)``
    Everything that is ever sent from a file, read into memory once. Raises ``WebDirError``
    (a ``config.BootRefusal``) when the page or a vendor file is missing.
``MoneyServer(settings, auth_, stores, request_log, clock=utcnow, security_log=None, web=None)``
    The server. ``serve_forever()`` as usual, or ``serve_in_thread()``; ``stop(grace)`` ends
    it: no new connections, requests in flight get ``grace`` seconds, the rest are cut.
    ``port`` is the bound port.

What a request passes, in this order, and what it is told when it does not
    a free thread (32)                        bare 503, written by the accept loop
    the request line and the headers          400 / 414 / 431; 30 s in all, then the connection is closed
    12 connections per client address         503 too_many_connections
    Host is the public host                   421
    Transfer-Encoding, Content-Length, Expect 400 / 417
    the method is GET, HEAD, POST or PUT      405
    the session cookie                        (a damaged accounts file: 503 auth_damaged, never 401)
    no session: one of 8 signed-out slots     503 busy
    the route                                 signed out: 401 under /api/ and for the vendor files,
                                              302 /login for the rest; signed in: 404, or 405 with Allow
    /api/ only: Origin and Sec-Fetch-Site     403 bad_origin
    a door with a body: Content-Type          415 bad_content_type
                        Content-Length        411 length_required, 413 body_too_large
                        free space (PUT)      507 storage_failed
  and only then is the body read, under one deadline for all of it (5 s for the sign-in doors,
  20 s + 1 s per 50 000 bytes for a document); a body that misses it gets no answer, the
  connection is closed. A body that is not JSON, or nests deeper than 16 levels, is 400 bad_json.

One request per connection: every answer says ``Connection: close`` and the handler never
reads a second request, so there is no request boundary to disagree about with the proxy.

Three things the table above does not say
    * A request is read strictly: ``METHOD target HTTP/1.x``, then header lines that are
      ``name: value`` and nothing else (no folded lines, no space before the colon), 8 KiB a
      line, 32 KiB and 100 headers in all. ``100 Continue`` is said only when a body is
      about to be read.
    * A document body of a megabyte or more is "large": at most three of them are in memory
      at once, and one at a time is parsed and saved (at the 16 MiB limit that takes the
      process to about 130 MB for a moment). A request waits up to 30 seconds for its turn
      and is then told ``503 storage_busy``. A ``PUT`` body that nests deeper than
      ``{"base": N, "doc": "<string>"}`` is ``400 bad_money_doc`` without being parsed.
    * After an answer to a request whose body was not read, the sending side is closed and
      what still arrives is thrown away for half a second, so that the proxy reads the
      answer instead of meeting a reset.

Times: ``Last-Modified`` of the page, the vendor files and the two assets is the moment this
process read them, and 304 is answered only to exactly that ``If-Modified-Since``. A file can
only change with a restart, so a browser can never be left on the page of an earlier deploy.

Money's own pages (``pages/*.html``) are filled on the server: ``{{name}}`` takes an escaped
value, ``<!--only:test-->...<!--/only-->`` and ``<!--except:test-->...<!--/except-->`` keep or
drop a block by stand, once, at start. That is how ``/login`` knows its three states and
``/data`` its fifty log entries without a door of their own, and how the upload control is
simply not in the markup of the test stand.
"""
import base64
import email.utils
import errno
import hashlib
import html
import http
import http.client
import http.server
import io
import json
import os
import re
import socket
import socketserver
import threading
import time
from typing import Any, Dict, Iterable, List, NamedTuple, Optional, Sequence, Tuple

from . import auth, config, log, store

__all__ = [
    "ROUTES", "Route", "PUBLIC_PATHS", "SERVED_METHODS", "VENDOR_FILES", "DOC_PATHS",
    "CSP_OWN_PAGES", "CSP_VENDOR", "CSP_JSON", "page_policy", "FIXED_HEADERS",
    "inspect_page", "PageFacts", "WebFiles", "WebDirError", "MoneyServer", "Handler",
]

KIB = 1024
MIB = 1024 * 1024

# ---------------------------------------------------------------------------
# The surface, as data
# ---------------------------------------------------------------------------

#: Anything else is answered 405, whatever the path.
SERVED_METHODS = ("GET", "HEAD", "POST", "PUT")

#: The page's Excel and PDF readers. Exact names; nothing else under /money/vendor/ exists.
VENDOR_FILES = ("pdf.min.js", "pdf.worker.min.js", "xlsx.full.min.js")

#: Where the page reads and saves each document.
DOC_PATHS = {"ledger": "/api/founder/money", "plan": "/api/founder/money/cash"}


class Route(NamedTuple):
    method: str             # "GET" | "POST" | "PUT"
    path: str               # exact; the query of a request is ignored, nothing is decoded
    session: bool           # True: only a signed-in founder gets this door's own answer
    handler: str            # Handler._do_<handler>
    body: Optional[str] = None   # "auth" | "ledger" | "plan": a JSON body under that limit and deadline
    doc: Optional[str] = None    # "ledger" | "plan": which document a document door is for


ROUTES = (
    Route("GET", "/login", False, "page_login"),
    Route("GET", "/set-password", False, "page_set_password"),
    Route("GET", "/logout", False, "redirect_login"),
    Route("GET", "/assets/auth.js", False, "asset"),
    Route("GET", "/assets/auth.css", False, "asset"),
    Route("GET", "/robots.txt", False, "robots"),
    Route("GET", "/favicon.ico", False, "favicon"),
    Route("GET", "/healthz", False, "healthz"),
    Route("POST", "/api/auth/login", False, "api_login", body="auth"),
    Route("POST", "/api/auth/setup", False, "api_setup", body="auth"),
    Route("POST", "/api/auth/logout", False, "api_logout", body="auth"),
    Route("GET", "/", True, "page_money"),
    Route("GET", "/index.html", True, "page_money"),
    Route("GET", "/money/vendor/pdf.min.js", True, "vendor"),
    Route("GET", "/money/vendor/pdf.worker.min.js", True, "vendor"),
    Route("GET", "/money/vendor/xlsx.full.min.js", True, "vendor"),
    Route("GET", "/data", True, "page_data"),
    Route("GET", "/api/me", True, "api_me"),
    Route("GET", "/api/founder/money", True, "api_doc_get", doc="ledger"),
    Route("PUT", "/api/founder/money", True, "api_doc_put", body="ledger", doc="ledger"),
    Route("GET", "/api/founder/money/cash", True, "api_doc_get", doc="plan"),
    Route("PUT", "/api/founder/money/cash", True, "api_doc_put", body="plan", doc="plan"),
    Route("GET", "/tracker/board", True, "redirect_home"),
    Route("GET", "/dashboard", True, "redirect_home"),
    Route("GET", "/money/", True, "redirect_home"),
    Route("GET", "/money/index.html", True, "redirect_home"),
)  # type: Tuple[Route, ...]

#: These, and no others, answer for themselves without a session.
PUBLIC_PATHS = tuple(dict.fromkeys(route.path for route in ROUTES if not route.session))

_TABLE = {(route.method, route.path): route for route in ROUTES}
_PATH_METHODS = {}  # type: Dict[str, List[str]]
for _route in ROUTES:
    _PATH_METHODS.setdefault(_route.path, []).append(_route.method)
del _route
_VENDOR_PATHS = frozenset("/money/vendor/" + name for name in VENDOR_FILES)
_HEALTH = "/healthz"

# ---------------------------------------------------------------------------
# Headers and policies
# ---------------------------------------------------------------------------

#: Money's own pages: no inline script, no inline style, nothing from another host.
CSP_OWN_PAGES = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                 "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
#: The vendor scripts and Money's own script. No unsafe-eval.
CSP_VENDOR = "default-src 'none'; script-src 'self'"
#: JSON, redirects, refusals and everything else that is not a page.
CSP_JSON = "default-src 'none'"


def page_policy(script_hashes: Sequence[str]) -> str:
    """The policy of the page: its inline scripts by their sha256, and nothing else inline."""
    scripts = " ".join(["'self'"] + ["'sha256-%s'" % digest for digest in script_hashes])
    return ("default-src 'none'; script-src %s; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
            "worker-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" % scripts)


#: On every answer, besides Server, Date, Cache-Control, a policy and Connection: close.
FIXED_HEADERS = (
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "same-origin"),
    ("X-Frame-Options", "DENY"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
    ("Cross-Origin-Resource-Policy", "same-origin"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"),
)

_TYPE_HTML = "text/html; charset=utf-8"
_TYPE_JSON = "application/json; charset=utf-8"
_TYPE_JS = "text/javascript; charset=utf-8"
_TYPE_CSS = "text/css; charset=utf-8"
_TYPE_TEXT = "text/plain; charset=utf-8"

#: What a refusal of the HTTP layer itself says: status -> (code, a fixed English sentence).
_REFUSALS = {
    400: ("bad_request", "That request could not be read."),
    401: ("unauthenticated", "Sign in first."),
    403: ("bad_origin", "That request did not come from Money's own page."),
    404: ("not_found", "No such path."),
    405: ("method_not_allowed", "That method is not served here."),
    411: ("length_required", "A request with a body must say how long it is."),
    413: ("body_too_large", "That request body is too large."),
    414: ("bad_request", "That request could not be read."),
    415: ("bad_content_type", "That kind of body is not accepted here."),
    417: ("bad_request", "That request could not be read."),
    421: ("misdirected", "This server does not answer under that host name."),
    431: ("bad_request", "That request could not be read."),
    500: ("internal", "Something broke on our side."),
    503: ("busy", "The server is busy. Try again in a moment."),
}

#: The answer of a server with no thread to give. Written by the accept loop itself.
_BARE_503 = b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"

_LINE_MAX = 8192            # the request line, or one header line
_HEADERS_MAX = 32 * KIB     # all header lines together
_HEADER_COUNT_MAX = 100
_SMALL_ANSWER = 64 * KIB    # up to here head and body leave in one write
_HEAVY_BYTES = 1 * MIB      # a document body from this size on is "large":
_LARGE_SLOTS = 3            #   so many of them are held in memory at once, read or waiting,
_HEAVY_WAIT = 30.0          #   and one at a time is parsed and saved; this long a request waits for either
_LINGER_SECONDS = 0.5       # for the rest of a body that was announced and not read
_DRAIN_SECONDS = 0.5        # for whatever follows a request that was refused before its end was known
_DRAIN_BYTES = 256 * KIB

#: What a socket says when the other end has gone, where the exception's type does not say it.
_GONE = frozenset(getattr(errno, name) for name in (
    "EPIPE", "ECONNRESET", "ECONNABORTED", "ENOTCONN", "ESHUTDOWN", "ETIMEDOUT", "EBADF", "EHOSTUNREACH",
    "ENETUNREACH", "ENETDOWN", "ENETRESET") if hasattr(errno, name))

_REQUEST_LINE = re.compile(rb"([A-Z]{1,16}) ([\x21-\x7e]{1,4096}) HTTP/1\.([01])\r?\n")
_HEADER_LINE = re.compile(rb"([!#$%&'*+\-.^_`|~0-9A-Za-z]{1,64}):[ \t]*([\t\x20-\x7e\x80-\xff]*?)[ \t]*\r?\n")
_DIGITS = re.compile(r"[0-9]{1,12}")


def _reason(status: int) -> str:
    try:
        return http.HTTPStatus(status).phrase
    except ValueError:
        return "Status"


# ---------------------------------------------------------------------------
# The page as it was handed over: what its policy has to allow
# ---------------------------------------------------------------------------

class PageFacts(NamedTuple):
    #: base64 sha256 of each inline script, in the order they stand in the file.
    script_hashes: Tuple[str, ...]
    #: Inline event handlers and javascript: addresses. The policy does not run them.
    inline_handlers: int


_TAG = re.compile(r"<(/?)([A-Za-z][^\t\n\f />]*)")
_SPACE = "\t\n\f "
#: Elements whose content is text up to their own end tag, whatever it looks like.
_RAW_TEXT = frozenset(("script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"))
_SCRIPT_MARK = re.compile(r"<!--|-->|<(/?)script(?=[\t\n\f />])", re.IGNORECASE)
_ADDRESS_ATTRIBUTES = frozenset(("href", "src", "action", "formaction", "xlink:href"))


def _read_tag(text: str, at: int) -> Tuple[Optional[List[Tuple[str, str]]], int]:
    """The attributes of a tag whose name ends at ``at``: ``(attributes, index after '>')``.

    ``(None, len(text))`` when the tag never ends. Follows the HTML tokenizer: a quote
    opens a value only after ``=``.
    """
    attributes = []  # type: List[Tuple[str, str]]
    size = len(text)
    i = at
    while i < size:
        ch = text[i]
        if ch in _SPACE or ch == "/":
            i += 1
            continue
        if ch == ">":
            return attributes, i + 1
        start = i
        i += 1                      # an "=" in first place belongs to the name
        while i < size and text[i] not in "\t\n\f />=":
            i += 1
        name = text[start:i].lower()
        while i < size and text[i] in _SPACE:
            i += 1
        value = ""
        if i < size and text[i] == "=":
            i += 1
            while i < size and text[i] in _SPACE:
                i += 1
            if i < size and text[i] in "\"'":
                end = text.find(text[i], i + 1)
                if end < 0:
                    return None, size
                value = text[i + 1:end]
                i = end + 1
            else:
                start = i
                while i < size and text[i] not in "\t\n\f >":
                    i += 1
                value = text[start:i]
        attributes.append((name, value))
    return None, size


def _script_end(text: str, at: int) -> int:
    """Where the script whose content starts at ``at`` ends: the index of its ``</script``.

    A script may hold ``<!-- <script> ... </script> -->``; inside such a comment the first
    ``</script`` does not end it. The three states are the tokenizer's: script data, escaped
    (after ``<!--``), double escaped (after a ``<script`` inside that).
    """
    state = 0
    position = at
    while True:
        mark = _SCRIPT_MARK.search(text, position)
        if mark is None:
            return len(text)
        token = mark.group(0)
        position = mark.end()
        if token == "<!--":
            # "<!-->" and "<!--->" open and close in one breath.
            if state == 0 and not text.startswith(">", position) and not text.startswith("->", position):
                state = 1
        elif token == "-->":
            state = 0
        elif mark.group(1):             # </script
            if state != 2:
                return mark.start()
            state = 1
        elif state == 1:                # <script, inside <!--
            state = 2


def inspect_page(data: bytes) -> PageFacts:
    """Read a page the way a browser's tokenizer does, far enough to find its inline scripts.

    The hash of a script is taken over the text between its tags exactly as the browser
    sees it (line ends normalised, as the parser does before anything else). A script with
    ``src`` has no inline text to allow. Raises ``ValueError`` for a file that is not UTF-8.
    """
    text = data.decode("utf-8")
    if text.startswith("﻿"):
        text = text[1:]
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    hashes = []  # type: List[str]
    handlers = 0
    size = len(text)
    position = 0
    while position < size:
        lt = text.find("<", position)
        if lt < 0:
            break
        if text.startswith("<!--", lt):
            if text.startswith(">", lt + 4) or text.startswith("->", lt + 4):
                position = text.find(">", lt + 4) + 1
                continue
            ends = [end for end in (text.find("-->", lt + 4), text.find("--!>", lt + 4)) if end >= 0]
            if not ends:
                break
            end = min(ends)
            position = end + (3 if text.startswith("-->", end) else 4)
            continue
        if text.startswith("<!", lt) or text.startswith("<?", lt):
            end = text.find(">", lt)    # a doctype, or what the parser calls a bogus comment
            if end < 0:
                break
            position = end + 1
            continue
        tag = _TAG.match(text, lt)
        if tag is None:
            position = lt + 1
            continue
        attributes, after = _read_tag(text, tag.end())
        if attributes is None:
            break
        position = after
        if tag.group(1):
            continue                    # an end tag
        name = tag.group(2).lower()
        for attribute, value in attributes:
            if len(attribute) > 2 and attribute.startswith("on"):
                handlers += 1
            elif attribute in _ADDRESS_ATTRIBUTES and \
                    re.sub(r"[\x00-\x20]", "", value).lower().startswith("javascript:"):
                handlers += 1
        if name == "plaintext":
            break
        if name not in _RAW_TEXT:
            continue
        if name == "script":
            end = _script_end(text, after)
            if not any(attribute == "src" for attribute, _value in attributes) and end > after:
                content = text[after:end].replace("\x00", "�")
                hashes.append(base64.b64encode(hashlib.sha256(content.encode("utf-8")).digest()).decode("ascii"))
        else:
            close = re.compile(r"</%s(?=[\t\n\f />])" % re.escape(name), re.IGNORECASE).search(text, after)
            end = close.start() if close else size
        position = end
    return PageFacts(tuple(hashes), handlers)


# ---------------------------------------------------------------------------
# What is sent from files: read once, at start
# ---------------------------------------------------------------------------

class WebDirError(config.BootRefusal):
    """The page, a vendor file or one of Money's own pages cannot be read. The service does not start."""


class _Markup(str):
    """Text that is HTML already. Everything else a page is filled with is escaped."""


_ONLY = re.compile(r"<!--only:([a-z,]+)-->\n?(.*?)<!--/only-->\n?", re.DOTALL)
_EXCEPT = re.compile(r"<!--except:([a-z,]+)-->\n?(.*?)<!--/except-->\n?", re.DOTALL)
_SLOT = re.compile(r"\{\{([A-Za-z]+)\}\}")

#: Money's own pages and what each is filled with at every request.
_PAGES = {
    "login": ("stand", "state", "firstName"),
    "set-password": ("stand",),
    "data": ("stand", "firstName", "entries"),
}


class WebFiles:
    """The page, the vendor files, Money's own pages and their two assets, held in memory.

    ``settings.web_dir`` holds ``index.html`` and ``vendor/``; the pages and the assets are
    beside this module. ``render(name, **values)`` fills one of Money's own pages; every
    value is escaped.
    """

    def __init__(self, settings: Any, clock: config.Clock = config.utcnow):
        web = settings.web_dir
        own = os.path.dirname(os.path.abspath(__file__))
        self.stand = settings.stand
        #: The moment these files were read: the Last-Modified of all of them.
        self.loaded = config.as_utc(clock()).replace(microsecond=0)
        self.last_modified = email.utils.format_datetime(self.loaded, usegmt=True)
        self.index = self._read(os.path.join(web, "index.html"), "MONEY_WEB_DIR")
        self.index_sha256 = hashlib.sha256(self.index).hexdigest()
        try:
            self.facts = inspect_page(self.index)
        except ValueError:
            raise WebDirError("%s is not UTF-8 text, so it cannot be the page." % os.path.join(web, "index.html"))
        self.page_policy = page_policy(self.facts.script_hashes)
        self.vendor = {
            "/money/vendor/" + name: self._read(os.path.join(web, "vendor", name), "MONEY_WEB_DIR")
            for name in VENDOR_FILES
        }
        script = self._read(os.path.join(own, "assets", "auth.js"), "the package")
        style = self._read(os.path.join(own, "assets", "auth.css"), "the package")
        self.assets = {
            "/assets/auth.js": (script, _TYPE_JS, CSP_VENDOR),
            "/assets/auth.css": (style, _TYPE_CSS, CSP_JSON),
        }
        self._pages = {}  # type: Dict[str, str]
        for name, slots in _PAGES.items():
            raw = self._read(os.path.join(own, "pages", name + ".html"), "the package")
            try:
                template = raw.decode("utf-8")
            except ValueError:
                raise WebDirError("The page %s.html is not UTF-8 text." % name)
            # A block marked for some stands only is cut here, once: on the test stand the
            # upload control is not in the markup at all.
            template = _ONLY.sub(lambda m: m.group(2) if self.stand in m.group(1).split(",") else "", template)
            template = _EXCEPT.sub(lambda m: "" if self.stand in m.group(1).split(",") else m.group(2), template)
            unknown = sorted(set(_SLOT.findall(template)) - set(slots))
            if unknown:
                raise WebDirError("The page %s.html asks for a value nobody gives it: %s." % (name, ", ".join(unknown)))
            self._pages[name] = template

    @staticmethod
    def _read(path: str, where: str) -> bytes:
        try:
            with open(path, "rb") as handle:
                data = handle.read(64 * MIB + 1)
        except OSError as error:
            raise WebDirError("%s cannot be read (%s). It is part of what this service serves; check %s."
                              % (path, error.strerror or "error", where))
        if not data or len(data) > 64 * MIB:
            raise WebDirError("%s is empty or far too large to be what this service serves." % path)
        return data

    def render(self, name: str, **values: Any) -> bytes:
        """One of Money's own pages, filled. Values are escaped unless they are ``_Markup``."""
        values.setdefault("stand", self.stand)

        def put(slot: Any) -> str:
            value = values[slot.group(1)]
            return value if isinstance(value, _Markup) else html.escape(str(value), quote=True)
        return _SLOT.sub(put, self._pages[name]).encode("utf-8", "replace")


# ---------------------------------------------------------------------------
# Reading under a deadline
# ---------------------------------------------------------------------------

class _DeadlineReader(io.RawIOBase):
    """The socket as a raw stream whose reads end at ``deadline`` (``time.monotonic()``), however
    slowly the bytes arrive; without a deadline a read waits ``idle`` seconds."""

    def __init__(self, sock: socket.socket, idle: float):
        super().__init__()
        self._sock = sock
        self._idle = float(idle)
        self.deadline = None  # type: Optional[float]

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        wait = self._idle
        if self.deadline is not None:
            left = self.deadline - time.monotonic()
            if left <= 0:
                raise socket.timeout("the request took too long")
            wait = min(wait, left)
        self._sock.settimeout(wait)
        return self._sock.recv_into(buffer)


class _Dropped(Exception):
    """The connection is given up without an answer. ``status`` is what the request log says."""

    def __init__(self, status: int):
        super().__init__(status)
        self.status = status


# ---------------------------------------------------------------------------
# One connection, one request
# ---------------------------------------------------------------------------

class Handler(http.server.BaseHTTPRequestHandler):
    """One request: read it under the limits, find its row in ``ROUTES``, answer, close."""

    server_version = "money"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # -- nothing of the standard library's own words reaches a caller or a log --

    def version_string(self) -> str:
        return "money"

    def log_message(self, format: str, *args: Any) -> None:     # noqa: A002 - the base class's name
        """The standard library's log lines quote the request. The request log is written in ``handle``."""

    def log_request(self, code: Any = "-", size: Any = "-") -> None:
        pass

    def log_error(self, format: str, *args: Any) -> None:       # noqa: A002
        pass

    def send_error(self, code: Any, message: Any = None, explain: Any = None) -> None:
        """Whoever asks for an error answer gets the fixed one of that status: ``message`` and
        ``explain`` may quote the request, so they are not sent."""
        try:
            status = int(code)
        except (TypeError, ValueError):
            status = 500
        self._refuse(status if status in _REFUSALS else (400 if 400 <= status < 500 else 500))

    def handle_expect_100(self) -> bool:
        """``100 Continue`` is said when a body is about to be read, not before it is judged."""
        self._continue = True
        return True

    # -- the frame ----------------------------------------------------------

    def setup(self) -> None:
        settings = self.server.settings
        self.connection = self.request
        self._reader = _DeadlineReader(self.connection, settings.socket_timeout)
        self.rfile = io.BufferedReader(self._reader, 16 * KIB)
        self.wfile = self.connection.makefile("wb", 0)
        self.command = ""
        self.path = ""
        self.request_version = "HTTP/1.1"
        self.headers = http.client.HTTPMessage()
        self.close_connection = True
        self._rid = log.new_request_id()
        self._seen = False              # a request line arrived: there is something to log
        self._status = None             # type: Optional[int]   what the request log will say
        self._answered = False
        self._bytes_out = 0
        self._addr = None               # type: Optional[str]
        self._address_key = None        # type: Optional[str]
        self._slot = False
        self._identity = None           # type: Optional[auth.Identity]
        self._token = None              # type: Optional[str]
        self._log_login = None          # type: Optional[str]
        self._cookies = ""
        self._declared = None           # type: Optional[int]   Content-Length: None absent, -1 unreadable
        self._unread = 0                # bytes of an announced body nobody has read
        self._body = b""                # the body, once read; the door that wants it takes it away
        self._large = False             # this request holds one of the slots for large bodies
        self._half_read = True          # it is not known yet where this request ends
        self._continue = False          # the caller waits for "100 Continue" before sending its body

    def finish(self) -> None:
        for stream in (self.wfile, self.rfile):
            try:
                stream.close()
            except (OSError, ValueError):
                pass

    def handle(self) -> None:
        server = self.server
        began = time.monotonic()
        try:
            try:
                self._serve()
            except _Dropped as dropped:
                self._status = dropped.status
            except socket.timeout:
                # Too slow, or silent: the connection is closed, nothing is answered.
                if self._status is None:
                    self._status = 408
            except OSError as error:
                if isinstance(error, (ConnectionError, TimeoutError)) or error.errno in _GONE:
                    # The peer went away while it was being read from or written to.
                    if self._status is None:
                        self._status = 400
                else:
                    self._crashed(error)    # not the socket: something of ours
            except Exception as error:      # noqa: BLE001 - the last net: a 500 with a request id
                self._crashed(error)
        finally:
            elapsed = (time.monotonic() - began) * 1000.0
            if self._seen:
                server.log.request(
                    method=self.command, path=self.path, status=self._status or 0, bytes_out=self._bytes_out,
                    ms=elapsed, addr=self._addr or self._peer(), login=self._log_login, rid=self._rid)
            try:
                if self._answered and not self._continue:
                    if self._half_read:
                        self._linger(_DRAIN_BYTES, _DRAIN_SECONDS)
                    elif self._unread > 0:
                        self._linger(self._unread, _LINGER_SECONDS)
            finally:
                if self._large:
                    server.large.release()
                if self._slot:
                    server.leave_signed_out()
                if self._address_key is not None:
                    server.leave_address(self._address_key)

    def _peer(self) -> str:
        return auth.client_address(self.client_address[0], None, ())

    def _crashed(self, error: BaseException) -> None:
        """Something in this program broke. Say where - never what the request held - and answer 500."""
        where = []
        trace = error.__traceback__
        while trace is not None:
            code = trace.tb_frame.f_code
            where.append("%s:%d" % (os.path.basename(code.co_filename), trace.tb_lineno))
            trace = trace.tb_next
        self.server.log.event("exception", rid=self._rid, kind=type(error).__name__, at=" > ".join(where[-6:]))
        if self._answered:
            return
        try:
            self._json(500, {"error": "internal", "message": _REFUSALS[500][1], "requestId": self._rid})
        except Exception:               # noqa: BLE001 - the answer could not be sent either
            self._status = 500

    def _linger(self, left: int, seconds: float) -> None:
        """An answer was sent while the caller may still be sending. Closing now would reset
        the connection, and a proxy that meets a reset in mid-write may report 502 instead
        of the answer - and a page that is told 502 instead of 401 says "check your
        connection" where it should say "sign in again". So the sending side is closed and
        what still arrives is thrown away, ``left`` bytes and ``seconds`` at most: long
        enough for the answer to be read, not for the whole body to arrive."""
        try:
            self.connection.shutdown(socket.SHUT_WR)
        except OSError:
            return
        self._reader.deadline = time.monotonic() + seconds
        try:
            while left > 0:
                chunk = self.rfile.read1(min(left, 64 * KIB))
                if not chunk:
                    break
                left -= len(chunk)
        except (OSError, ValueError):
            pass

    # -- reading the request ------------------------------------------------

    def _serve(self) -> None:
        server = self.server
        settings = server.settings
        # The request line and the headers have 30 seconds between them, however they trickle in.
        self._reader.deadline = time.monotonic() + settings.socket_timeout
        line = self.rfile.readline(_LINE_MAX + 1)
        if not line:
            return                      # connected and went away: nothing was asked
        self._seen = True
        server.mark_busy(self.request)
        self.raw_requestline = line
        request = _REQUEST_LINE.fullmatch(line)
        if request is None:
            return self._refuse(414 if len(line) > _LINE_MAX else 400)
        self.command = request.group(1).decode("ascii")
        self.path = request.group(2).decode("ascii")
        self.request_version = "HTTP/1." + request.group(3).decode("ascii")
        if not self._read_headers():
            return
        self._reader.deadline = None
        headers = self.headers

        # Who is asking, as far as an address says: the peer, or what the edge wrote down.
        self._addr = auth.client_address(self.client_address[0], headers.get_all("X-Forwarded-For"),
                                         settings.trusted_proxies)
        key = auth.address_key(self._addr)
        if not server.enter_address(key):
            return self._refuse(503, "too_many_connections", "Too many connections from this address at once.",
                                headers=(("Retry-After", "1"),))
        self._address_key = key

        # This server answers under one name.
        hosts = headers.get_all("Host") or []
        if len(hosts) != 1 or not auth.host_ok(settings, hosts[0]):
            return self._refuse(421)

        # What would make the end of this request a matter of opinion.
        if headers.get("Transfer-Encoding") is not None:
            return self._refuse(400)
        lengths = headers.get_all("Content-Length")
        if lengths:
            if len(set(lengths)) != 1:
                return self._refuse(400)
            self._declared = int(lengths[0]) if _DIGITS.fullmatch(lengths[0]) else -1
            self._unread = max(0, self._declared)
        expect = headers.get("Expect")
        if expect is not None:
            if expect.strip().lower() != "100-continue" or self.request_version != "HTTP/1.1":
                return self._refuse(417)
            self.handle_expect_100()
        self._half_read = False         # from here on: exactly self._unread bytes may follow

        method = self.command
        if method not in SERVED_METHODS:
            return self._refuse(405, headers=(("Allow", ", ".join(SERVED_METHODS)),))

        # The session. A cookie that is not this stand's own is not looked at.
        self._cookies = "; ".join(headers.get_all("Cookie") or [])
        self._token = auth.cookie_token(settings, self._cookies)
        damaged = None  # type: Optional[config.Refusal]
        if self._token:
            try:
                self._identity = server.auth.session(self._token)
            except config.Refusal as refusal:
                # The accounts cannot be read, so nobody can be told apart. That is 503 and
                # never 401: a page that is told 401 stops saving for good.
                damaged = refusal
        identity = self._identity
        if identity is not None:
            self._log_login = identity.login

        path = self.path.split("?", 1)[0]
        route = _TABLE.get(("GET" if method == "HEAD" else method, path))
        # /healthz is the container's own health check and nobody else's: a loopback peer that
        # no proxy spoke for. To anyone else the path does not exist, under any method.
        probe = auth.is_loopback(self.client_address[0]) and headers.get("X-Forwarded-For") is None
        hidden = path == _HEALTH and not probe
        if hidden:
            route = None
        probe = probe and route is not None and route.handler == "healthz"

        # A caller without a session works within eight slots, so that founders never wait behind strangers.
        if identity is None and not probe:
            if not server.enter_signed_out():
                return self._refuse(503, headers=(("Retry-After", "1"),))
            self._slot = True

        try:
            if route is None:
                return self._no_route(path, damaged, hidden)
            if route.session and identity is None:
                if damaged is not None:
                    raise damaged
                return self._closed(path)
            if path.startswith("/api/"):
                code = auth.api_refusal(settings, method, self._single("Origin"), self._single("Sec-Fetch-Site"))
                if code is not None:
                    return self._refuse(403, code)
            if route.body is not None and not self._read_body(route):
                return
            getattr(self, "_do_" + route.handler)(route)
        except config.Refusal as refusal:
            self._refusal(refusal)

    def _read_headers(self) -> bool:
        """Read the header lines into ``self.headers``. False when the request was refused.

        Strict on purpose: a name is a token, a colon follows it at once, a value is one
        line. A line that is anything else is 400, not something to be guessed at.
        """
        message = http.client.HTTPMessage()
        total = 0
        count = 0
        while True:
            line = self.rfile.readline(_LINE_MAX + 1)
            total += len(line)
            if len(line) > _LINE_MAX or total > _HEADERS_MAX:
                self._refuse(431)
                return False
            if not line.endswith(b"\n"):
                self._refuse(400)       # the headers stop in the middle
                return False
            if line in (b"\r\n", b"\n"):
                break
            count += 1
            if count > _HEADER_COUNT_MAX:
                self._refuse(431)
                return False
            header = _HEADER_LINE.fullmatch(line)
            if header is None:
                self._refuse(400)
                return False
            message[header.group(1).decode("ascii")] = header.group(2).decode("iso-8859-1")
        self.headers = message
        return True

    def _single(self, name: str) -> Optional[str]:
        """A header that may come once: its value, None when absent, "" when it came twice
        (which no check accepts)."""
        values = self.headers.get_all(name)
        if not values:
            return None
        return values[0] if len(values) == 1 else ""

    def _read_body(self, route: Route) -> bool:
        """Read the body of a door that takes one into ``self._body`` - judged before a byte of it is read.

        False when the request was refused (the answer is sent). Raises ``_Dropped`` when the
        body does not arrive whole within its deadline: the connection is closed, unanswered.
        """
        server = self.server
        settings = server.settings
        if not auth.is_json(self._single("Content-Type")):
            self._refuse(415)
            return False
        length = self._declared
        if length is None or length < 0:
            self._refuse(411)
            return False
        limit = settings.auth_max_bytes if route.body == "auth" else settings.put_limit(route.body)
        if length > limit:
            self._refuse(413)
            return False
        if route.doc is not None:
            server.stores[route.doc].check_space(length)
            if length >= settings.warn_limit(route.doc):
                # Still accepted - but the page words a 413 as "check your connection".
                server.log.event("large-body", doc=route.doc, bytes=length, limit=limit, rid=self._rid)
            if length >= _HEAVY_BYTES:
                # No more than a few large bodies are in memory at once, whoever sends them:
                # this one is not read until there is room for it.
                if not server.large.acquire(timeout=_HEAVY_WAIT):
                    raise store.Busy("Too many large documents are being saved at once; try again.")
                self._large = True
            deadline = settings.put_deadline(length)
        else:
            deadline = settings.auth_body_deadline
        if self._continue:
            self._continue = False
            self.connection.settimeout(settings.socket_timeout)
            self.connection.sendall(b"HTTP/1.1 100 Continue\r\n\r\n")
        self._reader.deadline = time.monotonic() + deadline
        chunks = []
        left = length
        while left > 0:
            chunk = self.rfile.read1(min(left, 64 * KIB))
            if not chunk:
                raise _Dropped(400)     # the caller hung up before it had sent what it announced
            chunks.append(chunk)
            left -= len(chunk)
            self._unread = left
        self._reader.deadline = None
        self._body = b"".join(chunks)
        return True

    def _take(self) -> bytes:
        """The body, handed over: after this nothing but the caller holds it."""
        body, self._body = self._body, b""
        return body

    def _parse(self, raw: bytes) -> Any:
        """A body as JSON, or ``_NOT_JSON`` after the 400 has been sent."""
        try:
            return store.parse_json(raw, self.server.settings.json_max_depth)
        except ValueError:
            self._refuse(400, "bad_json", "That request body is not valid JSON.")
            return _NOT_JSON

    # -- answering ----------------------------------------------------------

    def _send(self, status: int, body: bytes = b"", content_type: Optional[str] = None, *,
              cache: Optional[str] = "no-store", policy: str = CSP_JSON,
              headers: Iterable[Tuple[str, str]] = ()) -> None:
        if self._answered:
            return
        server = self.server
        settings = server.settings
        now = server.clock()
        bodiless = status in (204, 304)
        lines = ["HTTP/1.1 %d %s" % (status, _reason(status)), "Server: money",
                 "Date: %s" % email.utils.format_datetime(config.as_utc(now), usegmt=True)]
        if not bodiless:
            if content_type:
                lines.append("Content-Type: %s" % content_type)
            lines.append("Content-Length: %d" % len(body))
        if cache:
            lines.append("Cache-Control: %s" % cache)
        lines.append("%s: %s" % (
            "Content-Security-Policy-Report-Only" if settings.csp_report_only(now) else "Content-Security-Policy",
            policy))
        lines.extend("%s: %s" % pair for pair in FIXED_HEADERS)
        lines.extend("%s: %s" % pair for pair in headers)
        if auth.has_legacy_cookie(self._cookies):
            # The platform's old cookie, which browsers keep sending to this name. Never read; removed.
            lines.append("Set-Cookie: %s" % auth.clear_legacy_cookie(settings))
        lines.append("Connection: close")
        head = ("\r\n".join(lines) + "\r\n\r\n").encode("ascii")
        payload = b"" if bodiless or self.command == "HEAD" else body
        self._status = status
        self._answered = True
        # One deadline for the whole answer, as for a body on its way in.
        self.connection.settimeout(max(settings.socket_timeout, settings.put_deadline(len(payload))))
        if len(payload) <= _SMALL_ANSWER:
            self.connection.sendall(head + payload)
        else:
            self.connection.sendall(head)
            self.connection.sendall(payload)
        self._bytes_out = len(payload)

    def _json(self, status: int, answer: Any, headers: Iterable[Tuple[str, str]] = ()) -> None:
        # Plain ASCII: whatever a name or a sentence holds, the answer can always be written.
        body = json.dumps(answer, separators=(",", ":")).encode("ascii")
        self._send(status, body, _TYPE_JSON, headers=headers)

    def _refuse(self, status: int, code: Optional[str] = None, message: Optional[str] = None,
                headers: Iterable[Tuple[str, str]] = ()) -> None:
        fixed = _REFUSALS.get(status, _REFUSALS[500])
        self._json(status, {"error": code or fixed[0], "message": message or fixed[1]}, headers)

    def _refusal(self, refusal: config.Refusal, headers: Iterable[Tuple[str, str]] = ()) -> None:
        """What the store and the sign-in refuse with: their own status, code and sentence."""
        extra = list(headers)
        retry = getattr(refusal, "retry_after", None)
        if retry is not None:
            extra.append(("Retry-After", "%d" % max(1, int(retry))))
        elif refusal.code in ("busy", "storage_busy"):
            extra.append(("Retry-After", "2"))
        self._json(refusal.status, refusal.body(), extra)

    def _redirect(self, where: str) -> None:
        self._send(302, headers=(("Location", where), ("Vary", "Cookie")))

    def _html(self, body: bytes) -> None:
        self._send(200, body, _TYPE_HTML, policy=CSP_OWN_PAGES, headers=(("Vary", "Cookie"),))

    def _file(self, body: bytes, content_type: str, policy: str, vary: bool = False) -> None:
        """A file held in memory: ``no-cache``, so the browser asks every time, and 304 when it
        holds exactly the copy this process has."""
        web = self.server.web
        headers = [("Last-Modified", web.last_modified)]
        if vary:
            headers.append(("Vary", "Cookie"))
        since = self._single("If-Modified-Since")
        if since:
            try:
                held = config.as_utc(email.utils.parsedate_to_datetime(since))
            except (TypeError, ValueError, IndexError, OverflowError):
                held = None
            if held is not None and held == web.loaded:
                return self._send(304, cache="no-cache", policy=policy, headers=headers)
        self._send(200, body, content_type, cache="no-cache", policy=policy, headers=headers)

    def _closed(self, path: str) -> None:
        """What a door that needs a session says to a caller without one."""
        if path.startswith("/api/") or path in _VENDOR_PATHS:
            # JSON and never a redirect: the page reads a redirect as "the server is down".
            return self._refuse(401)
        self._redirect("/login")

    def _no_route(self, path: str, damaged: Optional[config.Refusal], hidden: bool = False) -> None:
        """A method and a path that are not a row of the table."""
        methods = None if hidden else _PATH_METHODS.get(path)
        if methods and (self._identity is not None or path in PUBLIC_PATHS):
            allowed = sorted(set(methods + (["HEAD"] if "GET" in methods else [])))
            return self._refuse(405, headers=(("Allow", ", ".join(allowed)),))
        if self._identity is not None:
            return self._refuse(404)
        if damaged is not None:
            raise damaged
        # A stranger is told the same about a path that exists and one that does not.
        self._closed(path)

    # -- the doors ----------------------------------------------------------

    def _do_page_login(self, route: Route) -> None:
        identity = self._identity
        if identity is None:
            state, name = "form", ""
        elif identity.may_open_page:
            state, name = "signed-in", identity.first_name
        else:
            state, name = "ending", identity.first_name     # the session's last 24 hours
        self._html(self.server.web.render("login", state=state, firstName=name))

    def _do_page_set_password(self, route: Route) -> None:
        self._html(self.server.web.render("set-password"))

    def _do_redirect_login(self, route: Route) -> None:
        self._redirect("/login")

    def _do_redirect_home(self, route: Route) -> None:
        self._redirect("/")

    def _do_asset(self, route: Route) -> None:
        data, content_type, policy = self.server.web.assets[route.path]
        self._file(data, content_type, policy)

    def _do_robots(self, route: Route) -> None:
        self._send(200, b"User-agent: *\nDisallow: /\n", _TYPE_TEXT, cache="no-cache")

    def _do_favicon(self, route: Route) -> None:
        self._send(204, cache="max-age=86400")

    def _do_healthz(self, route: Route) -> None:
        self._send(200, b"ok\n", _TYPE_TEXT)

    def _do_page_money(self, route: Route) -> None:
        if not self._identity.may_open_page:
            # In its last 24 hours a session still saves, but no longer opens the page: a
            # sign-in must not run out in the middle of somebody's work.
            return self._redirect("/login")
        web = self.server.web
        self._file(web.index, _TYPE_HTML, web.page_policy, vary=True)

    def _do_vendor(self, route: Route) -> None:
        self._file(self.server.web.vendor[route.path], _TYPE_JS, CSP_VENDOR, vary=True)

    def _do_page_data(self, route: Route) -> None:
        server = self.server
        entries = server.security_log.tail(50) if server.security_log is not None else []
        self._html(server.web.render("data", firstName=self._identity.first_name,
                                     entries=json.dumps(entries, separators=(",", ":"))))

    def _do_api_me(self, route: Route) -> None:
        identity = self._identity
        settings = self.server.settings
        self._json(200, {"id": identity.login, "name": identity.first_name, "firstName": identity.first_name,
                         "isFounderTier": True, "stand": settings.stand, "version": settings.version})

    def _do_api_doc_get(self, route: Route) -> None:
        # The stored file is the answer, byte for byte.
        self._send(200, self.server.stores[route.doc].read().body, _TYPE_JSON)

    def _do_api_doc_put(self, route: Route) -> None:
        server = self.server
        document = server.stores[route.doc]
        raw = self._take()
        if not store.json_depth_ok(raw, 1):
            # {"base": N, "doc": "<a string>"} nests one level. Deeper than that is a document
            # sent as an object, which the platform refuses in these words - and it is refused
            # here before a parser has built sixteen megabytes of it.
            raise store.BadDoc("doc is %s as a string of JSON." % _DOC_NAMES[route.doc])
        heavy = len(raw) >= _HEAVY_BYTES
        if heavy and not server.heavy.acquire(timeout=_HEAVY_WAIT):
            raise store.Busy("%s is being saved by somebody else; try again." % _DOC_NAMES[route.doc].capitalize())
        try:
            parsed = self._parse(raw)
            if parsed is _NOT_JSON:
                return
            del raw                         # sixteen megabytes at the limit: nothing needs them any more
            base, doc = store.fields_of(parsed)
            del parsed
            saved = document.save(base, doc, self._identity.login)
        finally:
            if heavy:
                server.heavy.release()
        self._json(200, {"rev": saved.rev})

    def _do_api_login(self, route: Route) -> None:
        server = self.server
        settings = server.settings
        body = self._parse(self._take())
        if body is _NOT_JSON:
            return
        fields = body if isinstance(body, dict) else {}
        login = fields.get("login")
        # A failed attempt is logged under a login only when it is a founder's: people type
        # passwords into this field.
        typed = login.strip().lower() if isinstance(login, str) else None
        self._log_login = typed if typed in settings.logins else None
        new = server.auth.sign_in(login, fields.get("password"), self._addr, self._agent(), presented=self._token)
        self._log_login = new.identity.login
        self._json(200, {"ok": True, "firstName": new.identity.first_name},
                   headers=(("Set-Cookie", auth.session_cookie(settings, new.token)),))

    def _do_api_setup(self, route: Route) -> None:
        server = self.server
        body = self._parse(self._take())
        if body is _NOT_JSON:
            return
        fields = body if isinstance(body, dict) else {}
        new = server.auth.set_password(fields.get("token"), fields.get("password"), self._addr, self._agent(),
                                       presented=self._token)
        self._log_login = new.identity.login
        self._json(200, {"ok": True, "firstName": new.identity.first_name},
                   headers=(("Set-Cookie", auth.session_cookie(server.settings, new.token)),))

    def _do_api_logout(self, route: Route) -> None:
        server = self.server
        raw = self._take()
        if raw and self._parse(raw) is _NOT_JSON:
            return
        # Whatever happens to the session on disk, this browser is signed out.
        gone = (("Set-Cookie", auth.clear_session_cookie(server.settings)), ("Clear-Site-Data", '"cache"'))
        try:
            server.auth.sign_out(self._token, self._addr)
        except config.Refusal as refusal:
            return self._refusal(refusal, gone)
        self._json(200, {"ok": True}, headers=gone)

    def _agent(self) -> str:
        return self._single("User-Agent") or ""


_NOT_JSON = object()
_DOC_NAMES = {"ledger": "the ledger", "plan": "the cash plan"}


# ---------------------------------------------------------------------------
# The server
# ---------------------------------------------------------------------------

class MoneyServer(http.server.ThreadingHTTPServer):
    """One stand's listener: a thread per connection, 32 at most, one request each.

    ``auth_`` is ``auth.Auth``, ``stores`` what ``store.open_stores`` returned, ``request_log``
    a ``log.RequestLog``, ``security_log`` the ``log.SecurityLog`` whose last entries ``/data``
    shows. Making one binds the address and reads every file that will ever be sent
    (``WebDirError``, ``OSError``); nothing is answered until ``serve_forever`` runs.
    """

    daemon_threads = True
    block_on_close = False
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(self, settings: Any, auth_: Any, stores: Dict[str, Any], request_log: Any,
                 clock: config.Clock = config.utcnow, security_log: Any = None, web: Optional[WebFiles] = None):
        self.settings = settings
        self.auth = auth_
        self.stores = stores
        self.log = request_log
        self.security_log = security_log
        self.clock = clock
        self.web = web if web is not None else WebFiles(settings, clock)
        #: One large document is parsed and saved at a time: at the 16 MiB limit a save
        #: takes the process to about 130 MB for a moment, and the container has 256.
        self.heavy = threading.BoundedSemaphore(1)
        #: And only a few large bodies are held at all - being read, or waiting for that turn.
        self.large = threading.BoundedSemaphore(_LARGE_SLOTS)
        self._free = threading.BoundedSemaphore(settings.max_connections)
        self._signed_out = threading.BoundedSemaphore(settings.signed_out_slots)
        self._lock = threading.Lock()
        self._quiet = threading.Condition(self._lock)
        self._addresses = {}    # type: Dict[str, int]
        #: connection -> [its thread, whether a request has begun on it]
        self._open = {}         # type: Dict[Any, List[Any]]
        self._refused = 0
        self._refused_said = float("-inf")      # time.monotonic() may start at zero with the process
        self._accepting = None  # type: Optional[threading.Thread]
        self._serving = False
        if ":" in settings.bind_host:
            self.address_family = socket.AF_INET6
        super().__init__((settings.bind_host, settings.bind_port), Handler)

    @property
    def port(self) -> int:
        return self.server_address[1]

    def server_bind(self) -> None:
        # Not HTTPServer's own: that one asks the resolver for this machine's name.
        socketserver.TCPServer.server_bind(self)
        self.server_name = self.settings.public_hostname
        self.server_port = self.server_address[1]

    # -- connections --------------------------------------------------------

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._free.acquire(blocking=False):
            # No thread to give. A bare answer from the accept loop itself, which must not wait.
            try:
                request.setblocking(False)
                request.send(_BARE_503)
            except OSError:
                pass
            self.shutdown_request(request)
            self._overloaded()
            return
        thread = threading.Thread(target=self._connection, args=(request, client_address),
                                  name="money-connection", daemon=True)
        with self._lock:
            self._open[request] = [thread, False]
        try:
            thread.start()
        except BaseException:
            with self._lock:
                self._open.pop(request, None)
            self._free.release()
            self.shutdown_request(request)
            raise

    def _connection(self, request: Any, client_address: Any) -> None:
        try:
            try:
                self.finish_request(request, client_address)
            except Exception as error:      # noqa: BLE001 - a connection never takes the server down
                self.log.event("connection-error", kind=type(error).__name__)
            finally:
                self.shutdown_request(request)
        finally:
            with self._quiet:
                self._open.pop(request, None)
                self._quiet.notify_all()
            self._free.release()

    def handle_error(self, request: Any, client_address: Any) -> None:
        """The standard library prints a traceback and the caller's address to stderr. One line instead."""
        self.log.event("connection-error", kind="accept")

    def _overloaded(self) -> None:
        with self._lock:
            self._refused += 1
            now = time.monotonic()
            if now - self._refused_said < 5.0:
                return
            count, self._refused, self._refused_said = self._refused, 0, now
        self.log.event("overload", refused=count, threads=self.settings.max_connections)

    def enter_address(self, key: str) -> bool:
        """Count one more connection of a client address; False when it has twelve already."""
        with self._lock:
            count = self._addresses.get(key, 0)
            if count >= self.settings.max_connections_per_address:
                return False
            self._addresses[key] = count + 1
            return True

    def leave_address(self, key: str) -> None:
        with self._lock:
            count = self._addresses.get(key, 0) - 1
            if count > 0:
                self._addresses[key] = count
            else:
                self._addresses.pop(key, None)

    def enter_signed_out(self) -> bool:
        """Take one of the slots for callers without a session; False when all eight are taken."""
        return self._signed_out.acquire(blocking=False)

    def leave_signed_out(self) -> None:
        self._signed_out.release()

    def mark_busy(self, request: Any) -> None:
        """A request has begun on this connection: ``stop`` lets it finish."""
        with self._lock:
            entry = self._open.get(request)
            if entry is not None:
                entry[1] = True

    def connections(self) -> int:
        """How many connections are open right now."""
        with self._lock:
            return len(self._open)

    def in_flight(self) -> int:
        """On how many of them a request has begun."""
        with self._lock:
            return sum(1 for entry in self._open.values() if entry[1])

    # -- starting and stopping ----------------------------------------------

    def serve_forever(self, poll_interval: float = 0.5) -> None:
        self._serving = True
        try:
            super().serve_forever(poll_interval)
        finally:
            self._serving = False

    def serve_in_thread(self, poll_interval: float = 0.5) -> threading.Thread:
        """Run the accept loop in a thread of its own and return it."""
        self._serving = True                # so that a stop() right after this waits for the loop
        thread = threading.Thread(target=self.serve_forever, kwargs={"poll_interval": poll_interval},
                                  name="money-accept", daemon=True)
        self._accepting = thread
        thread.start()
        return thread

    def stop(self, grace: float = 8.0) -> int:
        """Stop: no new connections; requests in flight get ``grace`` seconds; the rest are cut.

        Returns how many connections had to be cut. Every write of this service is a whole
        file renamed into place, so a request cut here leaves nothing half-written.
        """
        if self._serving:
            self.shutdown()
        if self._accepting is not None:
            self._accepting.join(5.0)
        try:
            self.socket.close()
        except OSError:
            pass
        def close(connections: Dict[Any, List[Any]]) -> None:
            for request in connections:
                try:
                    request.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

        with self._lock:
            idle = {request: entry for request, entry in self._open.items() if not entry[1]}
        close(idle)                         # connected, and nothing asked yet
        deadline = time.monotonic() + max(0.0, grace)
        with self._quiet:
            while self._open:
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                self._quiet.wait(left)
            cut = dict(self._open)
        close(cut)
        patience = time.monotonic() + 2.0
        for entry in list(idle.values()) + list(cut.values()):
            entry[0].join(max(0.0, patience - time.monotonic()))
        self.server_close()
        return len(cut)
