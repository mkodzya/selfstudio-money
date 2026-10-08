"""The stand's command line: ``python -m moneyd.ctl <command>``.

It runs inside the stand's container (on a server: ``deploy/stand.sh <stand> ctl ...``),
reads the same ``MONEY_*`` settings as the service and works on the same data directory.
The service and this are two processes; every file they share is written whole under a lock.

    ping                                  is the service answering? (the container's health check)
    selfcheck                             the doors, end to end, through the service's own port
    doctor                                what is wrong with the data, and which snapshot is newest
    user list
    user invite <login> [--print]         a one-time link to choose a password, and the login it is for
    user disable <login>
    user enable <login>
    user retire-links                     every pending one-time link stops working (after a whole-stand restore)
    sessions list
    sessions logout <login>
    sessions logout --all
    snapshots <ledger|plan>
    restore <ledger|plan> <snapshot>      asks to type the stand's name
    floor <ledger|plan> <N>               no later revision of that document is N or lower
    verify <dir>                          counts of any data directory - an unpacked backup, say
    seed <ledger|plan> [--fresh]          test and dev only, never beside REAL_DATA: the document on standard input
    purge-snapshots --older-than-days N   test and dev only, never beside REAL_DATA; N is 0 to 36500
    empty                                 exit 0 when both documents are at revision 0, else 1

Exit status: 0 done, or "yes"; 1 failed, or "no" (``ping``, ``selfcheck``, ``doctor``,
``verify``, ``empty``); 2 refused before anything was changed - a command this stand does
not take (``seed`` on prod, ``seed`` on a stand marked as holding real documents), a setting
that stops the service too, a wrong command line, a number no command takes (a floor below 0
or longer than fifteen digits).

``user retire-links`` and ``floor`` are for the two moments when a stand's files are older
than what browsers and messengers hold: a stand put back from a backup, and the cut-over.
In a backup a one-time link that has been used since is pending again - ``retire-links``
ends every pending link, and whoever needs one is issued a new one. And the documents are
back at revisions that pages opened before still hold, so such a page could save over what
came after: ``floor <kind> <N>`` makes every later save and restore a revision above ``N``,
which those pages can only meet with "reload". It loses nothing and lowers nothing, the
stored revision stays what it is, and it is allowed on every stand.

``seed`` without ``--fresh`` fills a document that is at revision 0 and nothing else (exit 1,
nothing written, when the document holds something); with ``--fresh`` it replaces what is
there, as an ordinary save. It never deletes a snapshot - that is ``purge-snapshots``.

``REAL_DATA`` in the root of the data directory is a person's marker: the documents of this
stand are real (``store.holds_real_data``). A person makes it and removes it, by hand; no
command here does either. While it is there ``seed`` and ``purge-snapshots`` are refused on
every stand - exit 2, before anything is read or written - and ``doctor`` and ``verify``
name it in one line. It is never a problem to them.

Three things hold for every command:

* nothing ever prints what a document holds - revisions, row counts, sizes and file names only;
* ``user invite`` shows its link to a terminal and to nothing else. Without one it refuses
  before a link is issued, because issuing retires the link before it. ``--print`` lifts that
  on a dev stand only, for the checks that drive a browser. The login stands on a line of its
  own above the link: both are passed on, because the sign-in page asks for the login;
* ``selfcheck`` and ``seed`` go through the running service's own doors over loopback HTTP,
  under the public host name, with a session of five minutes that is made in the store and
  deleted afterwards. No password and no robot login exist anywhere.

For tests: ``main(argv, environ=, stdin=, stdout=, stderr=, clock=) -> int``.
"""
import argparse
import datetime
import errno
import hashlib
import http.client
import json
import os
import platform
import re
import sys
from typing import Any, Dict, List, NamedTuple, Optional, Sequence

from . import auth, config, httpd, log, store

__all__ = ["main", "EXIT_OK", "EXIT_NO", "EXIT_REFUSED"]

EXIT_OK = 0
EXIT_NO = 1
EXIT_REFUSED = 2

#: Stands whose data is made up, so that a command may replace it.
_FABRICATED = ("test", "dev")
#: The most days ``purge-snapshots`` takes: a hundred years. Beyond it the number is a slip of the hand.
_PURGE_DAYS_MAX = 36500
#: A base no document will ever reach: a save from it must be refused with 409, having written nothing.
_FAR_FUTURE = 2 ** 53 - 1
_EMPTY_DOC = {"ledger": '{"tx":[]}', "plan": '{"banks":[]}'}
_NAMES = {"ledger": "the ledger", "plan": "the cash plan"}
_LOOPBACK = {"0.0.0.0": "127.0.0.1", "::": "::1"}
_REV = re.compile(rb'\{"rev":([0-9]{1,16}),')
#: An answer saved from a document door, in the one layout the service writes: {"rev":N,"doc":{...},"updatedAt":...}
_SAVED_HEAD = re.compile(r'\s*\{"rev":[0-9]{1,16},"doc":(?=\{)')
_SAVED_TAIL = re.compile(r',"updatedAt":(?:"[^"\\]*"|null)\}\s*$')


class _Exit(Exception):
    def __init__(self, status: int):
        super().__init__(status)
        self.status = status


class _Failed(Exception):
    """A command cannot go on. The sentence is for the person at the terminal."""


# ---------------------------------------------------------------------------
# What every command stands on
# ---------------------------------------------------------------------------

class _Stand(NamedTuple):
    settings: Any
    security_log: Any
    auth: Any
    stores: Dict[str, Any]


class _Ctl:
    """One run of the command line: its settings, its streams, and the stand it works on."""

    def __init__(self, environ: Any, stdin: Any, stdout: Any, stderr: Any, clock: config.Clock):
        self.environ = environ
        self.stdin = stdin
        self.stdout = stdout
        self.stderr = stderr
        self.clock = clock
        self._settings = None   # type: Any
        self._stand = None      # type: Optional[_Stand]

    def say(self, text: str = "") -> None:
        self.stdout.write(text + "\n")
        self.stdout.flush()

    def warn(self, text: str) -> None:
        self.stderr.write(text + "\n")
        self.stderr.flush()

    def settings(self) -> Any:
        """The stand's settings. Raises ``config.ConfigError`` exactly where the service would."""
        if self._settings is None:
            self._settings = config.Settings.from_env(self.environ, self.clock)
        return self._settings

    def stand(self) -> _Stand:
        """The data directory, made sure to be this stand's own, and what works on it.

        Raises ``store.DataDirError`` for a directory that belongs to another stand or holds
        the laptop tool's files - before anything in it is read or written.
        """
        if self._stand is None:
            settings = self.settings()
            store.prepare_data_dir(settings.data_dir, settings.stand)
            security_log = log.SecurityLog(settings.data_dir, self.clock, max_bytes=settings.security_log_bytes,
                                           keep=settings.security_log_files)
            self._stand = _Stand(settings, security_log, auth.Auth(settings, self.clock, security_log),
                                 store.open_stores(settings, self.clock, security_log))
        return self._stand

    def read_all(self, limit: int) -> bytes:
        """Standard input, ``limit`` bytes at most."""
        stream = getattr(self.stdin, "buffer", self.stdin)
        data = stream.read(limit)
        return data.encode("utf-8") if isinstance(data, str) else (data or b"")

    def read_line(self) -> str:
        line = self.stdin.readline()
        return line.decode("utf-8", "replace") if isinstance(line, bytes) else (line or "")

    def is_terminal(self) -> bool:
        try:
            return bool(self.stdout.isatty())
        except (AttributeError, ValueError):
            return False


def _why(error: BaseException) -> str:
    code = getattr(error, "errno", None)
    return errno.errorcode.get(code, type(error).__name__) if code else type(error).__name__


def _size(count: Optional[int]) -> str:
    if count is None:
        return "?"
    if count < 1024:
        return "%d B" % count
    if count < 1024 * 1024:
        return "%.1f kB" % (count / 1024.0)
    if count < 1024 ** 3:
        return "%.1f MB" % (count / 1024.0 ** 2)
    return "%.1f GB" % (count / 1024.0 ** 3)


def _table(ctl: _Ctl, head: Sequence[str], rows: List[Sequence[Any]]) -> None:
    cells = [[str(cell) for cell in row] for row in [head] + [list(row) for row in rows]]
    widths = [max(len(row[i]) for row in cells) for i in range(len(head))]
    for row in cells:
        ctl.say("  ".join(cell.ljust(width) for cell, width in zip(row, widths)).rstrip())


# ---------------------------------------------------------------------------
# Asking the running service, the way a browser behind the edge does
# ---------------------------------------------------------------------------

class _Answer(NamedTuple):
    status: int
    headers: Dict[str, str]
    body: bytes

    def code(self) -> Optional[str]:
        """The ``error`` member of a JSON refusal, if that is what this is."""
        if self.status < 400 or len(self.body) > 4096:
            return None                 # a document is megabytes, and is never taken apart here
        try:
            answer = store.parse_json(self.body, 4)
        except ValueError:
            return None
        return answer.get("error") if isinstance(answer, dict) and isinstance(answer.get("error"), str) else None

    def policy(self) -> Optional[str]:
        return self.headers.get("content-security-policy") or self.headers.get("content-security-policy-report-only")


def _where(settings: Any) -> str:
    return "%s:%d" % (_LOOPBACK.get(settings.bind_host, settings.bind_host), settings.bind_port)


def _ask(settings: Any, method: str, path: str, token: Optional[str] = None, body: Optional[bytes] = None,
         timeout: float = 30.0) -> _Answer:
    """One request to the service's own port, under the stand's public host name.

    Raises ``OSError`` or ``http.client.HTTPException`` when nothing answers.
    """
    connection = http.client.HTTPConnection(_LOOPBACK.get(settings.bind_host, settings.bind_host),
                                            settings.bind_port, timeout=timeout)
    headers = {"Host": settings.public_host, "User-Agent": "moneyd.ctl", "Connection": "close"}
    if token:
        headers["Cookie"] = "%s=%s" % (settings.cookie_name, token)
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Origin"] = settings.public_url
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        return _Answer(response.status, {name.lower(): value for name, value in response.getheaders()}, data)
    finally:
        connection.close()


def _rev_of(body: bytes) -> Optional[int]:
    """The revision a document door answered with - read off the answer's first bytes, the rest is not looked at."""
    head = _REV.match(body[:32])
    return int(head.group(1)) if head else None


def _usable_login(stand: _Stand) -> str:
    """A founder an internal session can be made for: the first one that may sign in."""
    for user in stand.auth.users.list():
        if user.can_sign_in:
            return user.login
    raise _Failed("every founder's login is disabled, so no session can be made for this command")


# ---------------------------------------------------------------------------
# ping, selfcheck
# ---------------------------------------------------------------------------

def _ping(ctl: _Ctl, args: Any) -> int:
    settings = ctl.settings()
    try:
        answer = _ask(settings, "GET", "/healthz", timeout=4.0)
    except (OSError, http.client.HTTPException) as error:
        ctl.warn("moneyd does not answer on %s (%s)" % (_where(settings), _why(error)))
        return EXIT_NO
    if answer.status != 200:
        ctl.warn("moneyd answered /healthz with %d on %s" % (answer.status, _where(settings)))
        return EXIT_NO
    ctl.say("ok")
    return EXIT_OK


def _policy_words(settings: Any, now: datetime.datetime) -> str:
    if settings.csp_mode != "report-only":
        return "enforced"
    if not settings.csp_report_only(now):
        return "enforced (the report-only override ended on %s)" % settings.csp_override_until
    until = " until %s" % settings.csp_override_until if settings.stand == "prod" else ""
    return "REPORT-ONLY%s - it reports and does not block" % until


def _image_words(now: datetime.datetime) -> str:
    """How old the Python under this service is: fixes reach a stand only when it is rebuilt."""
    version = platform.python_version()
    build = " ".join(platform.python_build()[1].split())
    try:
        built = datetime.datetime.strptime(build, "%b %d %Y %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return "Python %s (built: %s)" % (version, build or "unknown")
    days = max(0, (config.as_utc(now) - built).days)
    words = "Python %s, built %s, %d day(s) ago" % (version, built.date().isoformat(), days)
    if days > 60:
        words += " - a newer patch release may be out; the next deploy takes it"
    return words


class _Checks:
    def __init__(self, ctl: _Ctl):
        self._ctl = ctl
        self.count = 0
        self.failed = 0

    def hold(self, what: str, ok: Any, got: Any = None) -> bool:
        self.count += 1
        if ok:
            self._ctl.say("ok    %s" % what)
            return True
        self.failed += 1
        self._ctl.say("FAIL  %s%s" % (what, "" if got is None else "\n        got: %s" % (got,)))
        return False


def _selfcheck(ctl: _Ctl, args: Any) -> int:
    settings = ctl.settings()
    now = ctl.clock()
    ctl.say("Money self-check: stand %s, version %s, %s" % (settings.stand, settings.version, settings.public_url))
    ctl.say("  policy: %s" % _policy_words(settings, now))
    ctl.say("  image: %s" % _image_words(now))
    ctl.say("  password hash: %s" % settings.kdf)
    for warning in settings.warnings:
        ctl.say("  WARNING: %s" % warning)
    stand = ctl.stand()
    checks = _Checks(ctl)
    # What this image holds, to compare with what the service hands out.
    vendor = {}  # type: Dict[str, bytes]
    try:
        with open(os.path.join(settings.web_dir, "index.html"), "rb") as handle:
            page = handle.read()
        facts = httpd.inspect_page(page)
        for name in httpd.VENDOR_FILES:
            with open(os.path.join(settings.web_dir, "vendor", name), "rb") as handle:
                vendor[name] = handle.read()
    except (OSError, ValueError) as error:
        checks.hold("the page and its vendor files are where MONEY_WEB_DIR says (%s)" % settings.web_dir,
                    False, _why(error))
        ctl.say("self-check: FAILED - what this stand serves cannot be read")
        return EXIT_NO
    if settings.csp_report_only(now):
        # The documented way to carry such a page for a dated while: it is said, and the check goes on.
        if facts.inline_handlers:
            ctl.say("  WARNING: the page has %d inline event handler(s); the policy will not run them once "
                    "it is enforced" % facts.inline_handlers)
    else:
        # The one thing known for certain about the page and its policy. A deploy that passes this
        # check with such a page puts controls in front of founders that do nothing.
        checks.hold("the page's markup has no inline event handler and no javascript: address "
                    "(the enforced policy does not run them)",
                    facts.inline_handlers == 0,
                    "%d found: what they belong to does nothing in a browser. Move them into the page's "
                    "script, or deploy with MONEY_CSP=report-only for a dated while" % facts.inline_handlers)
    if facts.scripted_handlers:
        ctl.say("  WARNING: %d place(s) in the page's inline script look like markup with an inline event "
                "handler; the policy does not run such a handler either - have a look at them"
                % facts.scripted_handlers)
    if facts.unknown_vendor:
        ctl.say("  WARNING: the page names %s under /money/vendor/, and only %s are served there"
                % (", ".join(facts.unknown_vendor[:5]), ", ".join(httpd.VENDOR_FILES)))

    try:
        answer = _ask(settings, "GET", "/healthz")
        checks.hold("/healthz answers", answer.status == 200, answer.status)

        answer = _ask(settings, "GET", "/login")
        checks.hold("/login is 200, not stored, and under the policy of Money's own pages",
                    answer.status == 200 and answer.headers.get("cache-control") == "no-store"
                    and answer.policy() == httpd.CSP_OWN_PAGES,
                    "status %d, cache-control %s, policy %s"
                    % (answer.status, answer.headers.get("cache-control"), answer.policy()))

        answer = _ask(settings, "GET", "/")
        checks.hold("/ without a session is sent to /login",
                    answer.status == 302 and answer.headers.get("location") == "/login",
                    "status %d, location %s" % (answer.status, answer.headers.get("location")))

        answer = _ask(settings, "GET", httpd.DOC_PATHS["ledger"])
        checks.hold("the ledger door answers a stranger 401, as JSON",
                    answer.status == 401 and answer.code() == "unauthenticated",
                    "status %d, %s" % (answer.status, answer.headers.get("content-type")))

        login = _usable_login(stand)
        token, _session = stand.auth.internal_session(login, ttl=300, purpose="selfcheck")
        try:
            answer = _ask(settings, "GET", "/", token=token)
            checks.hold("/ is the page of this image, byte for byte (sha256 %s...)"
                        % hashlib.sha256(page).hexdigest()[:12],
                        answer.status == 200 and answer.body == page,
                        "status %d, %d bytes against %d" % (answer.status, len(answer.body), len(page)))
            checks.hold("the page is not cached unasked, and its policy allows its %d inline script(s) by hash"
                        % len(facts.script_hashes),
                        answer.headers.get("cache-control") == "no-cache"
                        and answer.policy() == httpd.page_policy(facts.script_hashes),
                        "cache-control %s, policy %s" % (answer.headers.get("cache-control"), answer.policy()))

            for name in httpd.VENDOR_FILES:
                answer = _ask(settings, "GET", "/money/vendor/" + name, token=token)
                checks.hold("/money/vendor/%s is the file of this image" % name,
                            answer.status == 200 and answer.body == vendor[name]
                            and answer.policy() == httpd.CSP_VENDOR,
                            "status %d, %d bytes against %d" % (answer.status, len(answer.body), len(vendor[name])))

            answer = _ask(settings, "GET", "/api/me", token=token)
            me = {}  # type: Any
            try:
                me = store.parse_json(answer.body, 4)
            except ValueError:
                pass
            checks.hold("/api/me knows the founder, the stand and the version",
                        answer.status == 200 and isinstance(me, dict)
                        and me.get("firstName") == settings.first_name(login)
                        and me.get("stand") == settings.stand and me.get("version") == settings.version,
                        "status %d, stand %s, version %s" % (
                            answer.status, me.get("stand") if isinstance(me, dict) else None,
                            me.get("version") if isinstance(me, dict) else None))

            for kind in store.KINDS:
                path = httpd.DOC_PATHS[kind]
                answer = _ask(settings, "GET", path, token=token)
                rev = _rev_of(answer.body) if answer.status == 200 else None
                readable = checks.hold(
                    "%s is readable (%s)" % (_NAMES[kind], "revision %d, %s" % (rev, _size(len(answer.body)))
                                             if rev is not None else "no revision"),
                    rev is not None,
                    "status %d %s%s" % (answer.status, answer.code() or "",
                                        " - run: ctl doctor" if answer.code() == "storage_damaged" else ""))
                if not readable:
                    continue
                # The whole write path, with nothing written: a save from a revision that
                # will never exist has to be refused, and the refusal has to name the real one.
                body = json.dumps({"base": _FAR_FUTURE, "doc": _EMPTY_DOC[kind]}).encode("ascii")
                answer = _ask(settings, "PUT", path, token=token, body=body)
                refused = {}  # type: Any
                try:
                    refused = store.parse_json(answer.body, 4)
                except ValueError:
                    pass
                checks.hold("a save of %s from a far-future revision is refused with 409, and nothing is written"
                            % _NAMES[kind],
                            answer.status == 409 and isinstance(refused, dict)
                            and refused.get("error") == "money_stale" and refused.get("rev") == rev,
                            "status %d %s" % (answer.status, answer.code() or ""))
        finally:
            stand.auth.sessions.delete(token)
        answer = _ask(settings, "GET", "/api/me", token=token)
        checks.hold("the session made for this check is closed again", answer.status == 401, answer.status)
    except (OSError, http.client.HTTPException) as error:
        checks.hold("the service answers on %s" % _where(settings), False, _why(error))

    if checks.failed:
        ctl.say("self-check: FAILED - %d of %d checks" % (checks.failed, checks.count))
        return EXIT_NO
    ctl.say("self-check: OK - %d checks passed" % checks.count)
    return EXIT_OK


# ---------------------------------------------------------------------------
# doctor, verify: counts, never contents
# ---------------------------------------------------------------------------

def _show_directory(ctl: _Ctl, report: Dict[str, Any], accounts: Dict[str, Any]) -> List[str]:
    """Print what a data directory holds. Returns the problems found in the accounts."""
    problems = []  # type: List[str]
    ctl.say("  STAND marker: %s" % (report["stand"] or "none"))
    if report.get("realData"):
        ctl.say("  %s marker: there - the documents are real; seed and purge-snapshots are refused"
                % store.REAL_DATA_FILE)
    if report.get("freeBytes") is not None:
        ctl.say("  free space: %s" % _size(report["freeBytes"]))
    for kind in store.KINDS:
        status = report["documents"].get(kind)
        if status is None:
            continue
        if status["state"] == "ok":
            words = "revision %d, %d rows, %s, saved %s" % (
                status["rev"], status["rows"], _size(status["bytes"]), status["updatedAt"])
        elif status["state"] == "empty":
            words = "never saved (revision 0)"
        else:
            words = "DAMAGED"
        floor = status.get("floor") or 0
        if status["state"] != "damaged" and floor > status["rev"]:
            # Raised by `ctl floor`: the stored revision is behind what pages may hold.
            words += "; floor %d (the next save becomes revision %d)" % (floor, floor + 1)
        snapshots = status["snapshots"]
        words += "; snapshots: %d" % snapshots["count"]
        if snapshots["count"]:
            words += " (day %d, shrink %d, restore %d; %s; newest %s)" % (
                snapshots["day"], snapshots["shrink"], snapshots["restore"], _size(snapshots["bytes"]),
                snapshots["newest"])
        if "snapshotsChecked" in status:
            words += "; read back: %d, bad: %d" % (status["snapshotsChecked"], len(status["snapshotsBad"]))
        ctl.say("  %s: %s" % (kind, words))
    users = accounts.get("users")
    if users is not None:
        if users["state"] == "ok":
            ctl.say("  accounts: %d (with a password: %d, disabled: %d, pending links: %d)" % (
                users["accounts"], users["withPassword"], users["disabled"], users["pendingLinks"]))
        elif users["state"] == "missing":
            ctl.say("  accounts: no users.json - the service makes one at its first start; "
                    "every founder then needs a link")
        else:
            ctl.say("  accounts: DAMAGED")
            problems.append("auth: %s The service does not start on it." % users["problem"])
    sessions = accounts.get("sessions")
    if sessions is not None:
        if sessions["state"] == "ok":
            ctl.say("  sessions: %d" % sessions["sessions"])
        elif sessions["state"] == "missing":
            ctl.say("  sessions: no sessions.json - everybody signs in again")
        else:
            ctl.say("  sessions: unreadable - the service moves the file aside and everybody signs in again")
    return problems


def _verdict(ctl: _Ctl, name: str, problems: List[str]) -> int:
    if problems:
        ctl.say("problems:")
        for problem in problems:
            ctl.say("  - %s" % problem)
        ctl.say("%s: %d problem(s)" % (name, len(problems)))
        return EXIT_NO
    ctl.say("%s: OK - nothing is wrong" % name)
    return EXIT_OK


def _doctor(ctl: _Ctl, args: Any) -> int:
    settings = ctl.settings()
    ctl.say("Money doctor: stand %s, version %s, data in %s" % (settings.stand, settings.version, settings.data_dir))
    for warning in settings.warnings:
        ctl.say("  WARNING: %s" % warning)
    report = store.doctor(settings.data_dir, settings.stand, ctl.clock)
    problems = list(report["problems"])
    if report["exists"]:
        problems += _show_directory(ctl, report, auth.verify(settings.data_dir))
        security = log.SecurityLog(settings.data_dir, ctl.clock).status()
        ctl.say("  security log: %d file(s), %s" % (security["files"], _size(security["bytes"])))
    return _verdict(ctl, "doctor", problems)


def _verify(ctl: _Ctl, args: Any) -> int:
    directory = os.path.abspath(args.dir)
    ctl.say("Money verify: %s" % directory)
    report = store.verify(directory, deep=True)
    problems = list(report["problems"])
    if report["exists"]:
        problems += _show_directory(ctl, report, auth.verify(directory))
    return _verdict(ctl, "verify", problems)


# ---------------------------------------------------------------------------
# user, sessions
# ---------------------------------------------------------------------------

def _user_list(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    rows = []
    for user in stand.auth.users.list():
        may = "yes" if user.can_sign_in else ("no: disabled" if user.listed else "no: not in MONEY_FOUNDERS")
        password = "set %s" % user.password_set_at if user.has_password else "not set"
        link = "valid until %s" % user.invite_expires if user.invite_expires else "-"
        rows.append((user.login, user.first_name, may, password, link))
    _table(ctl, ("login", "name", "may sign in", "password", "one-time link"), rows)
    return EXIT_OK


def _user_invite(ctl: _Ctl, args: Any) -> int:
    settings = ctl.settings()
    if args.show and not settings.is_dev:
        ctl.warn("moneyd.ctl: refused: --print exists on a dev stand only. On %s a link is shown to a terminal "
                 "and to nothing else. No link was issued." % settings.stand)
        return EXIT_REFUSED
    if not args.show and not ctl.is_terminal():
        ctl.warn("moneyd.ctl: refused: standard output is not a terminal, so the link would be shown to nobody "
                 "- and issuing one retires the link before it. No link was issued. Run it yourself, with a "
                 "terminal (over ssh: ssh -t).")
        return EXIT_REFUSED
    stand = ctl.stand()
    link, expires = stand.auth.issue_invite(args.login, by="ctl")
    ctl.say("One-time link for %s on the %s stand. It works once, until %s, and replaces any earlier link."
            % (args.login, settings.stand, config.iso(expires)))
    ctl.say("Pass on both lines below. The login is what the sign-in page asks for - it is not an e-mail:")
    ctl.say("login: %s" % args.login)
    ctl.say(link)
    return EXIT_OK


def _user_retire_links(ctl: _Ctl, args: Any) -> int:
    """Every pending one-time link stops working: one line per login that had one, then who may sign in."""
    stand = ctl.stand()
    retired = stand.auth.retire_links(by="ctl")
    for login in retired:
        ctl.say("%s: its pending one-time link is retired; issue a new one with: user invite %s" % (login, login))
    if not retired:
        ctl.say("no one-time link was pending; nothing was changed")
    return _user_list(ctl, args)


def _user_switch(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    disable = args.action == "disable"
    stand.auth.set_disabled(args.login, disable, by="ctl")
    if disable:
        ctl.say("%s is disabled: its sessions are closed, its pending link is retired, and it cannot sign in"
                % args.login)
    else:
        ctl.say("%s is enabled" % args.login)
    return EXIT_OK


def _sessions_list(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    sessions = stand.auth.sessions.list()
    rows = [(session.id, session.login, session.kind, config.iso(session.created), config.iso(session.seen),
             config.iso(session.expires), session.addr or "-", session.agent[:40] or "-") for session in sessions]
    if rows:
        _table(ctl, ("id", "login", "kind", "signed in", "last seen", "ends", "from", "browser"), rows)
    ctl.say("%d session(s)" % len(rows))
    return EXIT_OK


def _sessions_logout(ctl: _Ctl, args: Any) -> int:
    if bool(args.login) == bool(args.everybody):
        ctl.warn("moneyd.ctl: sessions logout takes a login or --all, one of the two")
        return EXIT_REFUSED
    stand = ctl.stand()
    if args.everybody:
        ctl.say("%d session(s) closed: everybody signs in again" % stand.auth.close_sessions(None, by="ctl"))
        return EXIT_OK
    if stand.auth.users.get(args.login) is None:
        raise auth.UnknownLogin()
    ctl.say("%d session(s) of %s closed" % (stand.auth.close_sessions(args.login, by="ctl"), args.login))
    return EXIT_OK


# ---------------------------------------------------------------------------
# snapshots, restore, seed, purge-snapshots, empty
# ---------------------------------------------------------------------------

def _snapshots(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    snapshots = stand.stores[args.kind].snapshots()
    rows = [(snapshot.name, snapshot.kind, snapshot.rev, config.iso(snapshot.taken), _size(snapshot.bytes))
            for snapshot in snapshots]
    if rows:
        _table(ctl, ("snapshot", "kind", "revision", "taken", "size"), rows)
    ctl.say("%d snapshot(s) of %s, newest first" % (len(rows), _NAMES[args.kind]))
    return EXIT_OK


def _restore(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    settings = stand.settings
    document = stand.stores[args.kind]
    rev, rows = document.check_snapshot(args.snapshot)
    now = document.status()
    stored = ("revision %d, %d rows" % (now["rev"], now["rows"]) if now["state"] == "ok"
              else "nothing saved yet" if now["state"] == "empty" else "DAMAGED - it will be moved aside, not deleted")
    ctl.warn("About to replace %s of Money's %s stand." % (_NAMES[args.kind], settings.stand.upper()))
    ctl.warn("  stored now:  %s" % stored)
    ctl.warn("  to restore:  %s (revision %d, %d rows)" % (args.snapshot, rev, rows))
    ctl.warn("What is stored now is kept as a restore- snapshot. Every open page will be told to reload.")
    ctl.warn("Type the stand's name to go on:")
    if ctl.read_line().strip() != settings.stand:
        ctl.warn("not confirmed - nothing was done")
        return EXIT_REFUSED
    result = document.restore(args.snapshot, "ctl")
    ctl.say("restored %s from %s: it is revision %d now (the snapshot was taken at revision %d)%s"
            % (_NAMES[args.kind], result.snapshot, result.rev, result.from_rev,
               "; what it replaced is kept as %s" % result.kept if result.kept else ""))
    return EXIT_OK


def _floor(ctl: _Ctl, args: Any) -> int:
    """No later revision of a document is ``N`` or lower. Counts only; the document is not touched."""
    stand = ctl.stand()
    result = stand.stores[args.kind].raise_floor(args.floor, "ctl")
    if result.rev is None:
        stored = "its stored file is damaged or lost, so its revision is not known (run: ctl doctor)"
    elif result.rev == 0:
        stored = "never saved (revision 0)"
    else:
        stored = "revision %d" % result.rev
    if result.floor > result.was:
        floor = "floor %d (was %d)" % (result.floor, result.was)
    else:
        floor = "floor %d (it was that already; nothing was changed)" % result.floor
    ctl.say("%s: %s; %s. The next save or restore becomes revision %d%s." % (
        args.kind, stored, floor, max(result.floor, result.rev or 0) + 1,
        "" if result.rev is not None else " or higher"))
    return EXIT_OK


def _fabricated_only(ctl: _Ctl, command: str, why: str) -> bool:
    """Whether ``command`` may run here: on a stand whose data is made up, and on no directory a person
    has marked as holding real documents. Says why not; looks at nothing but the marker."""
    settings = ctl.settings()
    if settings.stand not in _FABRICATED:
        ctl.warn("moneyd.ctl: refused: %s %s, so it exists on test and dev only. This stand is %s. "
                 "Nothing was read or written." % (command, why, settings.stand))
        return False
    if store.holds_real_data(settings.data_dir):
        ctl.warn("moneyd.ctl: refused: %s %s, and the documents of this %s stand are real: %s is there. "
                 "Nothing was read or written." % (command, why, settings.stand,
                                                   os.path.join(settings.data_dir, store.REAL_DATA_FILE)))
        return False
    return True


def _seed(ctl: _Ctl, args: Any) -> int:
    if not _fabricated_only(ctl, "seed", "writes a document over the stand's own"):
        return EXIT_REFUSED
    stand = ctl.stand()
    settings = stand.settings
    kind = args.kind
    limit = settings.put_limit(kind)
    raw = ctl.read_all(limit + 1)
    if len(raw) > limit:
        raise _Failed("standard input is larger than %s can be (%s)" % (_NAMES[kind], _size(limit)))
    try:
        text = raw.decode("utf-8")
    except ValueError:
        raise _Failed("standard input is not UTF-8 text, so it is not a JSON document")
    del raw
    # A file saved from a document door holds {rev, doc, updatedAt}: the document is taken out of
    # it as it stands. Anything else goes to the door as it is, and the door is the judge of it -
    # the document is never taken apart here.
    head = _SAVED_HEAD.match(text[:64])
    tail = _SAVED_TAIL.search(text[-96:])
    if head and tail:
        text = text[head.end():len(text) - (len(text[-96:]) - tail.start())]
    path = httpd.DOC_PATHS[kind]
    token, _session = stand.auth.internal_session(_usable_login(stand), ttl=300, purpose="seed")
    try:
        try:
            answer = _ask(settings, "GET", path, token=token)
            rev = _rev_of(answer.body) if answer.status == 200 else None
            if rev is None:
                raise _Failed("the stand does not hand over %s (%d %s)%s" % (
                    _NAMES[kind], answer.status, answer.code() or "",
                    " - run: ctl doctor" if answer.code() == "storage_damaged" else ""))
            if rev and not args.fresh:
                raise _Failed("%s is at revision %d already. Without --fresh a seed fills an empty document only; "
                              "with it, it replaces what is there. Nothing was written." % (_NAMES[kind], rev))
            ctl.warn("WARNING: seed is writing over %s of Money's %s stand (now at revision %d) with the "
                     "document on standard input." % (_NAMES[kind], settings.stand.upper(), rev))
            body = json.dumps({"base": rev, "doc": text}, ensure_ascii=False).encode("utf-8")
            answer = _ask(settings, "PUT", path, token=token, body=body, timeout=180.0)
        except (OSError, http.client.HTTPException) as error:
            raise _Failed("the service does not answer on %s (%s); a seed goes through its own door"
                          % (_where(settings), _why(error)))
    finally:
        stand.auth.sessions.delete(token)
    saved = None  # type: Any
    try:
        saved = store.parse_json(answer.body, 4)
    except ValueError:
        pass
    if answer.status != 200 or not isinstance(saved, dict) or not isinstance(saved.get("rev"), int):
        raise _Failed("the stand did not take the document (%d %s). Nothing was written."
                      % (answer.status, answer.code() or ""))
    stand.security_log.write("seed", doc=kind, by="ctl", rev=saved["rev"])
    ctl.say("seeded %s: revision %d, %s" % (_NAMES[kind], saved["rev"], _size(len(text.encode("utf-8")))))
    return EXIT_OK


def _purge(ctl: _Ctl, args: Any) -> int:
    if not _fabricated_only(ctl, "purge-snapshots", "deletes the copies a stand keeps of its documents"):
        return EXIT_REFUSED
    if not 0 <= args.days <= _PURGE_DAYS_MAX:
        ctl.warn("moneyd.ctl: refused: --older-than-days takes a whole number of days from 0 to %d. "
                 "Nothing was deleted." % _PURGE_DAYS_MAX)
        return EXIT_REFUSED
    stand = ctl.stand()
    for kind in store.KINDS:
        gone = stand.stores[kind].purge(args.days, stand.settings.stand, who="ctl")
        ctl.say("%s: %d snapshot(s) older than %d day(s) purged" % (kind, gone, args.days))
    return EXIT_OK


def _empty(ctl: _Ctl, args: Any) -> int:
    stand = ctl.stand()
    held = []
    for kind in store.KINDS:
        try:
            rev = stand.stores[kind].revision()
        except store.Damaged:
            held.append("%s is damaged, which is not empty (run: ctl doctor)" % _NAMES[kind])
            continue
        if rev:
            held.append("%s is at revision %d" % (_NAMES[kind], rev))
    if held:
        ctl.say("not empty: %s" % "; ".join(held))
        return EXIT_NO
    ctl.say("empty: both documents are at revision 0")
    return EXIT_OK


# ---------------------------------------------------------------------------
# The command line
# ---------------------------------------------------------------------------

def _whole(text: str) -> int:
    """A whole number as it is typed on the command line: digits, with or without a minus.

    Nothing else is a number here - no ``1_000``, no ``+5``, no ``1e3`` - and a number of more
    digits than any command takes comes back as one that is refused for its size, uncounted.
    """
    if not re.fullmatch(r"-?[0-9]+", text, re.ASCII):
        raise argparse.ArgumentTypeError("%r is not a whole number" % (text[:24],))
    digits = text.lstrip("-").lstrip("0") or "0"
    if len(digits) > 30:
        return -1 if text.startswith("-") else 10 ** 30
    return -int(digits) if text.startswith("-") else int(digits)


def _parser(out: Any, err: Any) -> argparse.ArgumentParser:
    class Parser(argparse.ArgumentParser):
        """argparse, saying what it has to say on this run's own streams and never ending the process."""

        def __init__(self, **options: Any):
            options.setdefault("allow_abbrev", False)
            super().__init__(**options)

        def _print_message(self, message: str, file: Any = None) -> None:
            if message:
                (out if file is sys.stdout else err).write(message)

        def exit(self, status: int = 0, message: Optional[str] = None) -> Any:     # noqa: A003
            if message:
                err.write(message)
            raise _Exit(EXIT_REFUSED if status else EXIT_OK)

    parser = Parser(prog="python -m moneyd.ctl",
                    description="The command line of one Money stand. It never prints what a document holds.")
    commands = parser.add_subparsers(dest="command", metavar="<command>")
    commands.required = True

    def command(name: str, run: Any, summary: str, parent: Any = commands) -> argparse.ArgumentParser:
        made = parent.add_parser(name, help=summary, description=summary)
        made.set_defaults(run=run)
        return made

    command("ping", _ping, "is the service answering?")
    command("selfcheck", _selfcheck, "the doors, end to end, through the service's own port")
    command("doctor", _doctor, "what is wrong with the data, and which snapshot is newest")

    user = commands.add_parser(
        "user", help="accounts: list | invite <login> | disable <login> | enable <login> | retire-links")
    actions = user.add_subparsers(dest="action", metavar="list|invite|disable|enable|retire-links")
    actions.required = True
    command("list", _user_list, "who may sign in, and who has a password", actions)
    invite = command("invite", _user_invite, "a one-time link to choose a password; shown to a terminal only", actions)
    invite.add_argument("login")
    invite.add_argument("--print", dest="show", action="store_true",
                        help="print the link although standard output is not a terminal (dev stand only)")
    for name in ("disable", "enable"):
        command(name, _user_switch, "%s a login" % name, actions).add_argument("login")
    command("retire-links", _user_retire_links,
            "every pending one-time link stops working - for a stand put back from a backup, where a link "
            "used since is pending again", actions)

    sessions = commands.add_parser("sessions", help="sessions: list | logout <login> | logout --all")
    actions = sessions.add_subparsers(dest="action", metavar="list|logout")
    actions.required = True
    command("list", _sessions_list, "open sessions: dates and addresses, never tokens", actions)
    logout = command("logout", _sessions_logout, "close every session of one login, or of everybody", actions)
    logout.add_argument("login", nargs="?")
    logout.add_argument("--all", dest="everybody", action="store_true", help="close everybody's sessions")

    command("snapshots", _snapshots, "the copies kept of a document, newest first").add_argument(
        "kind", choices=store.KINDS)
    restore = command("restore", _restore, "make a snapshot the current document, as a new revision")
    restore.add_argument("kind", choices=store.KINDS)
    restore.add_argument("snapshot")
    floor = command("floor", _floor,
                    "no later revision of a document is N or lower - for a stand put back from a backup and for "
                    "the cut-over, when pages hold revisions above the stored one. Nothing is lost or lowered")
    floor.add_argument("kind", choices=store.KINDS)
    floor.add_argument("floor", type=_whole, metavar="N", help="a revision: a whole number, fifteen digits at most")
    command("verify", _verify, "counts of any data directory; never contents").add_argument("dir")
    seed = command("seed", _seed,
                   "test and dev only, never beside REAL_DATA: write the document on standard input through "
                   "the stand's own door")
    seed.add_argument("kind", choices=store.KINDS)
    seed.add_argument("--fresh", action="store_true",
                      help="replace what the stand holds; without it only an empty document is filled")
    purge = command("purge-snapshots", _purge,
                    "test and dev only, never beside REAL_DATA: delete snapshots older than N days")
    purge.add_argument("--older-than-days", dest="days", type=_whole, required=True, metavar="N",
                       help="a whole number of days, 0 to %d" % _PURGE_DAYS_MAX)
    command("empty", _empty, "exit 0 when both documents are at revision 0, else 1")
    return parser


def main(argv: Optional[Sequence[str]] = None, environ: Any = None, stdin: Any = None, stdout: Any = None,
         stderr: Any = None, clock: config.Clock = config.utcnow) -> int:
    """Run one command. Returns the exit status; never calls ``sys.exit``."""
    out = stdout if stdout is not None else sys.stdout
    err = stderr if stderr is not None else sys.stderr
    try:
        args = _parser(out, err).parse_args(list(sys.argv[1:] if argv is None else argv))
    except _Exit as done:
        return done.status
    ctl = _Ctl(os.environ if environ is None else environ, stdin if stdin is not None else sys.stdin, out, err, clock)
    try:
        return int(args.run(ctl, args) or EXIT_OK)
    except config.BootRefusal as refusal:
        # A setting or a data directory the service itself would not start on.
        ctl.warn("moneyd.ctl: refused: %s" % refusal)
        return EXIT_REFUSED
    except store.Refused as refusal:
        ctl.warn("moneyd.ctl: refused: %s" % refusal.message)
        return EXIT_REFUSED
    except config.Refusal as refusal:
        ctl.warn("moneyd.ctl: %s (%s)" % (refusal.message, refusal.code))
        return EXIT_NO
    except _Failed as failed:
        ctl.warn("moneyd.ctl: %s" % failed)
        return EXIT_NO
    except BrokenPipeError:
        return EXIT_NO
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
