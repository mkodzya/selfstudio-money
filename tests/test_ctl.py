"""The command line, held to BUILD-SPEC 2.10 - through its real entry point.

``python3 -m moneyd.ctl <command>`` is run here as a process of its own, against a dev stand
that this process serves (``tests/_harness.py``): two processes on one data directory, as on a
server. What is checked is what a person or a deploy script meets: the exit status, what is
printed where, and what is on disk afterwards. Where only the wording of many wrong inputs is
of interest, ``moneyd.ctl.main`` is called with the same arguments instead (``Stand.ctl``).

    python3 -m unittest tests.test_ctl -v

Exit status, as the documents give it: 0 done or "yes"; 1 failed or "no"; 2 refused before
anything was changed (a command this stand does not take, a wrong command line, a setting or a
data directory the service itself would not start on).

A prod or a test stand cannot boot on a Python without ``hashlib.scrypt``, and the Mac's has
none. So for those the entry point is started through ``_WITH_SCRYPT``: the same module run as
``__main__`` in a real process, after a cheap stand-in for scrypt has been put in place where
(and only where) it is missing. The data directory is a temporary one that carries the stand's
own ``STAND`` marker and documents saved by ``store.DocStore``; nothing listens for it.

The two processes cannot share a test's clock, so both read the real one. Nothing here depends
on time passing; documents that need a history are saved with dates of their own.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import datetime
import gzip
import hashlib
import io
import json
import os
import pty
import re
import select
import shutil
import subprocess
import sys
import tempfile
import unittest
from typing import NamedTuple

from moneyd import config, ctl, store
from tests import _harness
from tests._harness import PASSWORD, ledger, plan

UTC = datetime.timezone.utc
LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
ME = "/api/me"
EMPTY = b'{"rev":0,"doc":{},"updatedAt":null}'
#: The day copies ``history`` leaves behind, newest first.
SNAPSHOTS = ("day-2026-09-03-rev000002.json.gz", "day-2026-09-02-rev000001.json.gz")

_COMMAND = [sys.executable, "-m", "moneyd.ctl"]
#: The same entry point where a server stand needs scrypt and this Python has none (see the module's words).
_WITH_SCRYPT = [sys.executable, "-c", (
    "import hashlib, runpy\n"
    "if not hasattr(hashlib, 'scrypt'):\n"
    "    def scrypt(secret, *, salt, n, r, p, dklen=64, maxmem=0):\n"
    "        return hashlib.pbkdf2_hmac('sha256', secret, salt + bytes([n.bit_length(), r, p]), 20, dklen)\n"
    "    hashlib.scrypt = scrypt\n"
    "runpy.run_module('moneyd.ctl', run_name='__main__', alter_sys=True)\n")]


class Done(NamedTuple):
    status: int
    out: str
    err: str

    @property
    def said(self):
        """Everything it printed, to either stream."""
        return self.out + self.err


def process_environ(stand_environ):
    """What the other process gets: this one's environment without any MONEY_* of its own, plus the stand's."""
    environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
    environ.update(stand_environ)
    environ["PYTHONDONTWRITEBYTECODE"] = "1"
    return environ


def run_ctl(environ, args, text=None, terminal=None, scrypt=False, stdout=None):
    """Run the command line as a process. ``text`` is its standard input (none: /dev/null).

    ``terminal`` puts a pseudo-terminal in place of ``"stdout"`` or of ``"stderr"`` (the other
    stream stays a pipe); ``stdout`` puts a file there instead. What a terminal received comes
    back in ``out`` or ``err`` like anything else.
    """
    command = (_WITH_SCRYPT if scrypt else _COMMAND) + list(args)
    common = dict(cwd=_harness.CHECKOUT, env=environ)
    if terminal is None:
        # Bytes both ways, so that nothing here depends on this machine's locale.
        done = subprocess.run(command, input=text.encode("utf-8") if text is not None else None,
                              stdin=None if text is not None else subprocess.DEVNULL,
                              stdout=subprocess.PIPE if stdout is None else stdout, stderr=subprocess.PIPE,
                              timeout=60, **common)
        return Done(done.returncode, (done.stdout or b"").decode("utf-8", "replace"), done.stderr.decode("utf-8", "replace"))
    master, slave = pty.openpty()
    try:
        streams = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
        streams[terminal] = slave
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, **streams, **common)
    finally:
        os.close(slave)
    try:
        piped = process.stderr if terminal == "stdout" else process.stdout
        shown = []
        while True:                                             # the terminal first: it is what can fill up
            ready, _writers, _errors = select.select([master], [], [], 30)
            if not ready:
                break
            try:
                chunk = os.read(master, 4096)
            except OSError:                                     # Linux says EIO once the other end is closed
                break
            if not chunk:
                break
            shown.append(chunk)
        other = piped.read().decode("utf-8", "replace")
        status = process.wait(30)
    finally:
        os.close(master)
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                stream.close()
        if process.poll() is None:
            process.kill()
            process.wait(10)
    seen = b"".join(shown).decode("utf-8", "replace").replace("\r\n", "\n")
    return Done(status, seen, other) if terminal == "stdout" else Done(status, other, seen)


def read(path):
    with open(path, "rb") as handle:
        return handle.read()


def files_under(directory):
    """Every file below ``directory``: relative path -> content. Lock files are left out: taking a lock makes one."""
    found = {}
    for root, _directories, names in os.walk(directory):
        for name in names:
            if name.endswith(".lock"):
                continue
            path = os.path.join(root, name)
            found[os.path.relpath(path, directory)] = read(path)
    return found


def write(path, data):
    with open(path, "wb") as handle:
        handle.write(data)


def truncate(path, size):
    with open(path, "r+b") as handle:
        handle.truncate(size)


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main_with(environ, *args, typed=""):
    """``moneyd.ctl.main`` in this process with an environment of the test's making."""
    out, err = io.StringIO(), io.StringIO()
    status = ctl.main(list(args), environ=environ, stdin=io.StringIO(typed), stdout=out, stderr=err)
    return Done(status, out.getvalue(), err.getvalue())


def history(data_dir, kind, documents):
    """Save ``documents`` one a day from 1 September 2026: each save after the first leaves a day copy."""
    clock = _harness.FakeClock(datetime.datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC))
    document = store.DocStore(data_dir, kind, clock)
    for base, text in enumerate(documents):
        document.save(base, text, "tests")
        clock.tick(days=1)
    return document


class CtlCase(unittest.TestCase):
    """A dev stand served from this process, and ``moneyd.ctl`` run on its data directory as another process."""

    env = None

    def setUp(self):
        self.stand = _harness.Stand(clock=config.utcnow, env=self.env)
        self.addCleanup(self.stand.stop)
        self.environ = process_environ(self.stand.environ)

    def ctl(self, *args, **options):
        """The command line as a process of its own."""
        return run_ctl(self.environ, args, **options)

    def main(self, *args, typed="", terminal=False):
        """The same command through ``moneyd.ctl.main`` in this process: for the many wrong inputs of one kind."""
        result = self.stand.ctl(*args, stdin=typed, terminal=terminal)
        return Done(result.status, result.out, result.err)

    def path(self, *parts):
        return os.path.join(self.stand.data_dir, *parts)

    def stop_server(self):
        """Nothing listens on the stand's port any more."""
        self.stand.server.stop(grace=1.0)
        self.stand.server = None

    def events(self, name):
        return [entry for entry in self.stand.security_events() if entry["event"] == name]

    def revision(self, kind):
        return store.DocStore(self.stand.data_dir, kind).revision()

    def snapshots(self, kind="ledger"):
        return sorted(os.listdir(self.path(kind, "snapshots")))

    def users(self):
        return json.loads(read(self.path("auth", "users.json")).decode("ascii"))["users"]

    def assertNoTraceback(self, done):
        self.assertNotIn("Traceback", done.said)


# ---------------------------------------------------------------------------
# ping, selfcheck
# ---------------------------------------------------------------------------

class PingAndSelfcheckTests(CtlCase):
    def test_ping_is_0_and_ok_while_the_service_answers_and_1_when_nothing_listens(self):
        self.assertEqual(self.ctl("ping"), Done(0, "ok\n", ""))
        self.assertEqual(os.listdir(self.path("auth")).count("sessions.json"), 0, "a ping makes no session")
        self.stop_server()
        down = self.ctl("ping")
        self.assertEqual((down.status, down.out), (1, ""))
        self.assertIn("does not answer", down.err)

    def test_selfcheck_is_0_against_a_running_dev_server_writes_nothing_and_leaves_no_session(self):
        stand = self.stand
        cookie = stand.session("mika")
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(5)}, cookie=cookie).json(), {"rev": 1})
        documents = (files_under(self.path("ledger")), files_under(self.path("plan")))
        done = self.ctl("selfcheck")
        self.assertEqual(done.status, 0, done.said)
        self.assertRegex(done.out, r"self-check: OK - \d+ checks passed\n$")
        self.assertNotIn("FAIL", done.out)
        self.assertIn("  policy: enforced\n", done.out)                     # BUILD-SPEC 2.7: selfcheck prints the mode
        self.assertRegex(done.out, r"\n  image: Python \d+\.\d+")           # and 2.14: how old what it runs on is
        self.assertEqual((files_under(self.path("ledger")), files_under(self.path("plan"))), documents)
        self.assertEqual([(session.login, session.kind) for session in stand.auth.sessions.list()], [("mika", "web")],
                         "the session it made for itself is gone, and nobody else's")
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        (made,) = self.events("session-created")
        self.assertEqual((made["by"], made["purpose"]), ("ctl", "selfcheck"))
        lifetime = config.parse_iso(made["expires"]) - config.parse_iso(made["t"])
        self.assertTrue(datetime.timedelta(minutes=4, seconds=50) <= lifetime <= datetime.timedelta(minutes=5), lifetime)
        self.assertIsNone(re.search(r"[A-Za-z0-9_-]{43,}", done.said), "nothing shaped like a session token is printed")

    def test_selfcheck_is_1_when_nothing_listens_and_leaves_nothing_behind(self):
        stand = self.stand
        cookie = stand.session("mika")
        stand.put(LEDGER, {"base": 0, "doc": ledger(5)}, cookie=cookie)
        before = files_under(stand.data_dir)
        self.stop_server()
        done = self.ctl("selfcheck")
        self.assertEqual(done.status, 1, done.said)
        self.assertRegex(done.out, r"self-check: FAILED - \d+ of \d+ checks\n$")
        self.assertNoTraceback(done)
        after = files_under(stand.data_dir)
        self.assertEqual({name: content for name, content in after.items() if name != "security.log"},
                         {name: content for name, content in before.items() if name != "security.log"})
        self.assertEqual([session.kind for session in stand.auth.sessions.list()], ["web"])


class SelfcheckModeTests(CtlCase):
    env = {"MONEY_CSP": "report-only"}

    def test_selfcheck_says_so_when_the_policy_only_reports(self):
        done = self.ctl("selfcheck")
        self.assertEqual(done.status, 0, done.said)
        self.assertRegex(done.out, r"\n  policy: REPORT-ONLY")
        self.assertNotIn("policy: enforced", done.out)


# ---------------------------------------------------------------------------
# user list | invite | disable | enable
# ---------------------------------------------------------------------------

class UserTests(CtlCase):
    LINK = r"http://finance\.localhost:%d/set-password#t=([A-Za-z0-9_-]{43})"

    def links(self, text):
        return re.findall(self.LINK % self.stand.port, text)

    def test_user_list_is_0_and_shows_who_may_sign_in_and_never_a_hash(self):
        stand = self.stand
        stand.set_password("mika")
        token = stand.invite("misha")
        stand.auth.set_disabled("vanya", True)
        done = self.ctl("user", "list")
        self.assertEqual((done.status, done.err), (0, ""))
        rows = {line.split()[0]: line for line in done.out.splitlines()[1:]}
        self.assertEqual(sorted(rows), ["mika", "misha", "vanya"])
        self.assertRegex(rows["mika"], r"^mika +Mika +yes +set \d{4}-\d\d-\d\dT")
        self.assertRegex(rows["misha"], r"^misha +Misha +yes +not set +valid until \d{4}-\d\d-\d\dT")
        self.assertRegex(rows["vanya"], r"^vanya +Vanya +no: disabled +not set")
        stored = self.users()["mika"]["hash"]
        for secret in [stored, "pbkdf2$", token, sha256(token)] + stored.split("$")[2:]:
            self.assertNotIn(secret, done.said)

    def test_invite_prints_its_link_to_a_terminal_and_that_link_sets_a_password(self):
        stand = self.stand
        done = self.ctl("user", "invite", "mika", terminal="stdout")
        self.assertEqual((done.status, done.err), (0, ""), done.said)
        (token,) = self.links(done.out)
        self.assertEqual(self.users()["mika"]["invite"]["sha256"], sha256(token))
        (issued,) = self.events("link-issued")
        self.assertEqual((issued["login"], issued["by"]), ("mika", "ctl"))
        self.assertNotIn(token, json.dumps(self.stand.security_events()))
        answer = stand.post("/api/auth/setup", {"token": token, "password": PASSWORD})
        self.assertEqual((answer.status, answer.json()), (200, {"ok": True, "firstName": "Mika"}))

    def test_invite_to_a_pipe_a_file_or_dev_null_is_2_prints_no_link_and_issues_none(self):
        before = read(self.path("auth", "users.json"))
        handle, name = tempfile.mkstemp(prefix="money-test-", suffix=".out")
        os.close(handle)
        self.addCleanup(os.unlink, name)
        with open(name, "w") as into_file:
            answers = [self.ctl("user", "invite", "mika"),
                       self.ctl("user", "invite", "mika", stdout=into_file),
                       self.ctl("user", "invite", "mika", stdout=subprocess.DEVNULL)]
        for done in answers:
            self.assertEqual((done.status, done.out), (2, ""))
            self.assertEqual(self.links(done.said), [])
            self.assertIn("terminal", done.err)
        self.assertEqual(read(name), b"")
        self.assertEqual(read(self.path("auth", "users.json")), before, "refused before a link was issued")
        self.assertEqual(self.events("link-issued"), [])

    def test_a_refused_invite_does_not_retire_the_link_issued_before_it(self):
        stand = self.stand
        (earlier,) = self.links(self.ctl("user", "invite", "mika", terminal="stdout").out)
        self.assertEqual(self.ctl("user", "invite", "mika").status, 2)
        self.assertEqual(stand.post("/api/auth/setup", {"token": earlier, "password": PASSWORD}).status, 200)

    def test_invite_is_refused_when_only_standard_error_is_a_terminal(self):
        done = self.ctl("user", "invite", "mika", terminal="stderr")
        self.assertEqual((done.status, done.out), (2, ""))
        self.assertEqual(self.links(done.said), [])
        self.assertIsNone(self.users()["mika"]["invite"])

    def test_print_shows_the_link_to_a_pipe_on_a_dev_stand(self):
        done = self.ctl("user", "invite", "vanya", "--print")
        self.assertEqual((done.status, done.err), (0, ""))
        (token,) = self.links(done.out)
        self.assertEqual(self.users()["vanya"]["invite"]["sha256"], sha256(token))

    def test_invite_is_1_for_a_login_nobody_has_and_for_a_disabled_one_and_prints_no_link(self):
        self.stand.auth.set_disabled("misha", True)
        before = read(self.path("auth", "users.json"))
        answers = [(self.ctl("user", "invite", "nobody", terminal="stdout"), "unknown_login"),
                   (self.ctl("user", "invite", "misha", "--print"), "login_disabled"),
                   (self.main("user", "invite", "nobody", "--print"), "unknown_login"),
                   (self.main("user", "invite", "Mika", terminal=True), "unknown_login"),
                   (self.main("user", "invite", "misha", terminal=True), "login_disabled")]
        for done, code in answers:
            self.assertEqual(done.status, 1, done.said)
            self.assertIn(code, done.said)
            self.assertEqual(self.links(done.said), [])
        self.assertEqual(read(self.path("auth", "users.json")), before)

    def test_no_link_is_handed_out_when_its_line_cannot_be_written_into_the_security_log(self):
        # docs/security.md: "none is handed out unless its line could be written to the security log first".
        os.mkdir(self.path("security.log"))                     # nothing can be appended to this
        done = self.ctl("user", "invite", "mika", terminal="stdout")
        self.assertEqual(done.status, 1, done.said)
        self.assertEqual(self.links(done.said), [])
        self.assertNoTraceback(done)
        self.assertIsNone(self.users()["mika"]["invite"], "and none is left waiting unseen")

    def test_disable_and_enable_are_0_reach_the_running_server_and_are_1_for_nobody(self):
        stand = self.stand
        cookie, token = stand.session("misha"), stand.invite("misha")
        done = self.ctl("user", "disable", "misha")
        self.assertEqual((done.status, done.err), (0, ""))
        self.assertEqual(stand.get(ME, cookie=cookie).status, 401)
        self.assertEqual(stand.post("/api/auth/setup", {"token": token, "password": PASSWORD}).status, 404)
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("user-disabled")], [("misha", "ctl")])
        self.assertEqual(self.ctl("user", "enable", "misha").status, 0)
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("user-enabled")], [("misha", "ctl")])
        self.assertFalse(self.users()["misha"]["disabled"])
        before = read(self.path("auth", "users.json"))
        for nobody in (self.ctl("user", "disable", "nobody"), self.main("user", "enable", "nobody")):
            self.assertEqual((nobody.status, nobody.out), (1, ""))
            self.assertIn("unknown_login", nobody.err)
        self.assertEqual(read(self.path("auth", "users.json")), before)


# ---------------------------------------------------------------------------
# sessions list | logout
# ---------------------------------------------------------------------------

class SessionsTests(CtlCase):
    def test_sessions_list_is_0_and_shows_who_and_since_when_and_never_a_token(self):
        stand = self.stand
        stand.set_password("mika")
        signed = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD}, headers={"User-Agent": "Firefox-of-Mika/1.0"})
        cookies = [signed.cookie("money-dev"), stand.session("misha"), stand.session("misha")]
        done = self.ctl("sessions", "list")
        self.assertEqual((done.status, done.err), (0, ""))
        self.assertTrue(done.out.endswith("3 session(s)\n"), done.out)
        lines = done.out.splitlines()[1:-1]
        self.assertEqual(sorted(line.split()[1] for line in lines), ["mika", "misha", "misha"])
        self.assertIn("Firefox-of-Mika/1.0", done.out)
        for cookie in cookies:
            token = stand.token_of(cookie)
            self.assertNotIn(token, done.said)
            self.assertNotIn(sha256(token), done.said, "nor the whole of what is kept in its place")
        self.assertEqual([stand.get(ME, cookie=cookie).status for cookie in cookies], [200, 200, 200], "listing closes nothing")

    def test_logout_closes_one_logins_sessions_or_everybodys_and_says_who_did_it(self):
        stand = self.stand
        mika, misha, vanya = stand.session("mika"), stand.session("misha"), stand.session("vanya")
        done = self.ctl("sessions", "logout", "mika")
        self.assertEqual((done.status, done.err), (0, ""))
        self.assertIn("1 session", done.out)
        self.assertEqual([stand.get(ME, cookie=cookie).status for cookie in (mika, misha, vanya)], [401, 200, 200])
        everybody = self.ctl("sessions", "logout", "--all")
        self.assertEqual((everybody.status, everybody.err), (0, ""))
        self.assertIn("2 session", everybody.out)
        self.assertEqual([stand.get(ME, cookie=cookie).status for cookie in (misha, vanya)], [401, 401])
        self.assertEqual([(entry["login"], entry["by"], entry["count"]) for entry in self.events("sessions-closed")],
                         [("mika", "ctl", 1), ("all", "ctl", 2)])

    def test_logout_is_1_for_a_login_nobody_has_and_2_without_a_login_or_with_both(self):
        stand = self.stand
        cookie = stand.session("mika")
        nobody = self.ctl("sessions", "logout", "nobody")
        self.assertEqual((nobody.status, nobody.out), (1, ""))
        both = self.ctl("sessions", "logout", "mika", "--all")
        self.assertEqual((both.status, both.out), (2, ""))
        for arguments in (("sessions", "logout"), ("sessions", "logout", "mika", "--all"), ("sessions",),
                          ("sessions", "close", "mika")):
            done = self.main(*arguments)
            self.assertEqual((done.status, done.out), (2, ""), arguments)
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "none of them closed anything")
        self.assertEqual(self.events("sessions-closed"), [])


# ---------------------------------------------------------------------------
# snapshots, restore
# ---------------------------------------------------------------------------

class SnapshotTests(CtlCase):
    def setUp(self):
        super().setUp()
        self.versions = [ledger(30, note="the first"), ledger(31, note="the second"), ledger(32, note="the third")]
        history(self.stand.data_dir, "ledger", self.versions)

    def stored(self):
        """The ledger as the running server hands it out."""
        return self.stand.get(LEDGER, cookie=self.stand.session("mika")).body.decode("utf-8")

    def test_snapshots_is_0_and_lists_names_revisions_and_sizes_newest_first(self):
        done = self.ctl("snapshots", "ledger")
        self.assertEqual((done.status, done.err), (0, ""))
        listed = [line.split()[0] for line in done.out.splitlines() if line.startswith(("day-", "shrink-", "restore-"))]
        self.assertEqual(listed, list(SNAPSHOTS))
        self.assertRegex(done.out, r"day-2026-09-03-rev000002\.json\.gz +day +2 +2026-09-03T00:00:00Z +\d+ B")
        none = self.ctl("snapshots", "plan")
        self.assertEqual(none.status, 0)
        self.assertIn("0 snapshot(s)", none.out)
        self.assertEqual(self.ctl("snapshots", "other").status, 2)
        for arguments in (("snapshots",), ("snapshots", "other"), ("snapshots", "ledger", "plan")):
            self.assertEqual(self.main(*arguments).status, 2, arguments)

    def test_restore_asks_for_the_stands_name_and_a_wrong_one_is_2_with_nothing_done(self):
        stand = self.stand
        before = files_under(stand.data_dir)
        done = self.ctl("restore", "ledger", SNAPSHOTS[1], text="prod\n")          # the real process, once
        self.assertEqual((done.status, done.out), (2, ""))
        self.assertIn("name", done.err)
        self.assertIn("nothing was done", done.err)
        for answer in ("test\n", "DEV\n", "Dev\n", "yes\n", "y\n", "dev2\n", "money-dev\n", "\n", ""):
            with self.subTest(typed=answer):
                wrong = self.main("restore", "ledger", SNAPSHOTS[1], typed=answer)
                self.assertEqual((wrong.status, wrong.out), (2, ""))
        self.assertEqual(files_under(stand.data_dir), before)
        self.assertEqual(self.events("restore"), [])
        self.assertIn('"rev":3,', self.stored()[:12])

    def test_restore_with_the_stands_name_is_0_a_new_revision_and_keeps_what_it_replaced(self):
        stand = self.stand
        page = stand.session("mika")                                               # a page that is open, at revision 3
        done = self.ctl("restore", "ledger", SNAPSHOTS[1], text="dev\n")
        self.assertEqual(done.status, 0, done.said)
        self.assertIn("revision 4", done.out)
        self.assertTrue(self.stored().startswith('{"rev":4,"doc":%s,"updatedAt":' % self.versions[0]))
        kept = [name for name in self.snapshots() if name.startswith("restore-")]
        self.assertEqual(len(kept), 1)
        self.assertRegex(kept[0], r"^restore-\d{8}T\d{6}Z-rev000003\.json\.gz$")
        (entry,) = self.events("restore")
        self.assertEqual((entry["doc"], entry["snapshot"], entry["rev"], entry["by"]), ("ledger", SNAPSHOTS[1], 4, "ctl"))
        stale = stand.put(LEDGER, {"base": 3, "doc": ledger(1)}, cookie=page)
        self.assertEqual((stale.status, stale.json()["error"], stale.json()["rev"]), (409, "money_stale", 4))
        for text in self.versions:
            self.assertNotIn(text[:60], done.said)

    def test_restore_takes_the_name_of_a_snapshot_and_nothing_that_is_a_path(self):
        stand = self.stand
        before = files_under(stand.data_dir)
        real = self.ctl("restore", "ledger", "../../auth/users.json", text="dev\n")
        self.assertEqual((real.status, real.out), (1, ""))
        self.assertNoTraceback(real)
        for name in ("current.json", "../current.json", "/etc/hosts", SNAPSHOTS[1] + "/../../current.json",
                     "day-2026-09-09-rev000009.json.gz", "", "day-2026-09-02-rev000001.json", SNAPSHOTS[1].upper()):
            with self.subTest(name=name):
                done = self.main("restore", "ledger", name, typed="dev\n")
                self.assertEqual((done.status, done.out), (1, ""))
        self.assertEqual(self.main("restore", "plan", SNAPSHOTS[1], typed="dev\n").status, 1, "a ledger's snapshot is not the plan's")
        self.assertEqual(self.main("restore", "other", SNAPSHOTS[1], typed="dev\n").status, 2)
        self.assertEqual(self.main("restore", "ledger", typed="dev\n").status, 2)
        self.assertEqual(files_under(stand.data_dir), before)


# ---------------------------------------------------------------------------
# empty
# ---------------------------------------------------------------------------

class EmptyTests(CtlCase):
    def test_empty_is_0_only_while_both_documents_are_at_revision_0(self):
        stand = self.stand
        self.assertEqual(self.ctl("empty"), Done(0, "empty: both documents are at revision 0\n", ""))
        store.DocStore(stand.data_dir, "plan").save(0, plan(2), "tests")
        only_plan = self.ctl("empty")
        self.assertEqual((only_plan.status, only_plan.err), (1, ""))
        with _harness.Stand(clock=config.utcnow) as other:
            store.DocStore(other.data_dir, "ledger").save(0, ledger(2), "tests")
            only_ledger = run_ctl(process_environ(other.environ), ["empty"])
            self.assertEqual((only_ledger.status, only_ledger.err), (1, ""))
            store.DocStore(other.data_dir, "plan").save(0, plan(2), "tests")
            self.assertEqual(main_with(other.environ, "empty").status, 1)

    def test_empty_is_1_for_a_document_that_is_damaged_or_lost_never_0(self):
        stand = self.stand
        for garbage in (b"", b"{}", b'{"rev":0,"doc":{},"updatedAt":null}', b'{"rev":1,"doc":{"banks":['):
            with self.subTest(plan=garbage):                    # the ledger was never saved; the plan is not what was saved
                write(self.path("plan", "current.json"), garbage)
                self.assertEqual(self.main("empty").status, 1)
        os.unlink(self.path("plan", "current.json"))
        self.assertEqual(self.main("empty").status, 0)
        store.DocStore(stand.data_dir, "ledger").save(0, ledger(2), "tests")
        truncate(self.path("ledger", "current.json"), 20)
        truncated = self.ctl("empty")
        self.assertEqual(truncated.status, 1, truncated.said)
        self.assertNoTraceback(truncated)
        os.unlink(self.path("ledger", "current.json"))          # saved once, and now gone: lost, not "never saved"
        self.assertTrue(os.path.exists(self.path("ledger", "EVER_SAVED")))
        lost = self.ctl("empty")
        self.assertEqual(lost.status, 1, lost.said)
        self.assertNoTraceback(lost)

    def test_empty_is_2_and_never_0_when_it_cannot_tell(self):
        stand = self.stand
        with open(self.path("STAND"), "w") as handle:
            handle.write("prod\n")
        other = self.ctl("empty")
        self.assertEqual((other.status, other.out), (2, ""))
        missing = main_with(dict(stand.environ, MONEY_DATA_DIR=self.path("no-such-directory")), "empty")
        self.assertEqual((missing.status, missing.out), (2, ""))
        unset = main_with({name: value for name, value in stand.environ.items() if name != "MONEY_STAND"}, "empty")
        self.assertEqual((unset.status, unset.out), (2, ""))


# ---------------------------------------------------------------------------
# seed, purge-snapshots (test and dev only)
# ---------------------------------------------------------------------------

class SeedTests(CtlCase):
    def internal_sessions(self):
        return [session for session in self.stand.auth.sessions.list() if session.kind != "web"]

    def test_seed_writes_the_document_on_standard_input_through_the_stands_own_put_door(self):
        stand = self.stand
        text = ledger(4, note="засеяно: «тест»")
        done = self.ctl("seed", "ledger", text=text)
        self.assertEqual(done.status, 0, done.said)
        self.assertIn("WARNING", done.err)                      # the loud line
        self.assertIn("DEV", done.err)
        self.assertNotIn("засеяно", done.said)
        cookie = stand.session("mika")
        self.assertTrue(stand.get(LEDGER, cookie=cookie).body.decode("utf-8").startswith('{"rev":1,"doc":%s,"updatedAt":"' % text))
        puts = [line for line in stand.log_lines() if line.get("method") == "PUT"]
        self.assertEqual([(line["path"], line["status"], line["addr"]) for line in puts], [(LEDGER, 200, "127.0.0.1")])
        self.assertIn(puts[0]["login"], ("mika", "misha", "vanya"))
        self.assertEqual(self.internal_sessions(), [], "the session it made does not outlive it")
        (made,) = self.events("session-created")
        self.assertEqual((made["by"], made["purpose"]), ("ctl", "seed"))
        self.assertLessEqual(config.parse_iso(made["expires"]) - config.parse_iso(made["t"]), datetime.timedelta(minutes=5))
        self.assertEqual([(entry["doc"], entry["rev"], entry["by"]) for entry in self.events("seed")], [("ledger", 1, "ctl")])
        self.assertEqual(stand.get(PLAN, cookie=cookie).body, EMPTY, "the other document is not touched")

    def test_seed_without_fresh_fills_an_empty_document_only_and_with_it_replaces(self):
        first, second = ledger(3), ledger(5)
        self.assertEqual(self.main("seed", "ledger", typed=first).status, 0)
        kept = self.ctl("seed", "ledger", text=second)
        self.assertEqual((kept.status, kept.out), (1, ""))
        self.assertEqual(self.revision("ledger"), 1)
        fresh = self.main("seed", "ledger", "--fresh", typed=second)
        self.assertEqual(fresh.status, 0, fresh.said)
        self.assertEqual(self.revision("ledger"), 2)

    def test_seed_is_1_and_leaves_no_session_when_the_door_refuses_the_document(self):
        stand = self.stand
        for kind, text in (("plan", ledger(3)), ("ledger", plan(2)), ("ledger", "not json"), ("ledger", ""),
                           ("ledger", '{"tx":"MARKER-NOT-A-LIST"}'), ("ledger", "[1,2,3]")):
            with self.subTest(kind=kind, text=text[:20]):
                done = self.main("seed", kind, "--fresh", typed=text)
                self.assertEqual((done.status, done.out), (1, ""))
                self.assertNotIn("MARKER", done.said)
        real = self.ctl("seed", "plan", "--fresh", text=ledger(3))
        self.assertEqual((real.status, real.out), (1, ""))
        self.assertNoTraceback(real)
        self.assertEqual((self.revision("ledger"), self.revision("plan")), (0, 0))
        self.assertEqual(self.internal_sessions(), [])
        self.assertEqual(self.events("seed"), [])
        self.assertEqual(self.main("seed", "other", typed=ledger(1)).status, 2)
        self.assertEqual(self.main("seed", typed=ledger(1)).status, 2)

    def test_seed_is_1_and_leaves_no_session_when_nothing_listens(self):
        self.stop_server()
        done = self.ctl("seed", "ledger", "--fresh", text=ledger(3))
        self.assertEqual((done.status, done.out), (1, ""))
        self.assertIn("does not answer", done.err)
        self.assertNoTraceback(done)
        self.assertEqual(self.revision("ledger"), 0, "a seed goes through the door or not at all")
        self.assertEqual(self.stand.auth.sessions.list(), [])


class PurgeTests(CtlCase):
    def setUp(self):
        super().setUp()
        stand = self.stand
        history(stand.data_dir, "ledger", [ledger(30), ledger(31), ledger(32)])       # two day copies of September
        history(stand.data_dir, "plan", [plan(2), plan(3)])                           # one
        stand.stores["ledger"].save(3, ledger(33), "tests")                           # and one of today

    def test_purge_snapshots_is_0_and_deletes_what_is_older_and_nothing_else(self):
        self.assertEqual(len(self.snapshots("ledger")), 3)
        current = (read(self.path("ledger", "current.json")), read(self.path("plan", "current.json")))
        done = self.ctl("purge-snapshots", "--older-than-days", "2")
        self.assertEqual((done.status, done.err), (0, ""))
        (today,) = self.snapshots("ledger")
        self.assertRegex(today, r"^day-\d{4}-\d\d-\d\d-rev000003\.json\.gz$")
        self.assertNotIn(today, SNAPSHOTS)
        self.assertEqual(self.snapshots("plan"), [])
        self.assertEqual((read(self.path("ledger", "current.json")), read(self.path("plan", "current.json"))), current)
        self.assertEqual(sorted((entry["doc"], entry["count"], entry["days"], entry["by"]) for entry in self.events("snapshots-purged")),
                         [("ledger", 2, 2, "ctl"), ("plan", 1, 2, "ctl")])
        everything = self.ctl("purge-snapshots", "--older-than-days", "0")
        self.assertEqual(everything.status, 0)
        self.assertEqual(self.snapshots("ledger"), [])
        self.assertEqual(self.revision("ledger"), 4)

    def test_purge_snapshots_without_a_whole_number_of_days_is_2_and_deletes_nothing(self):
        before = files_under(self.stand.data_dir)
        for arguments in ((), ("--older-than-days",), ("--older-than-days", "-1"), ("--older-than-days", "two"),
                          ("--older-than-days", "1.5"), ("--older-than-days", "1e3"), ("2",), ("--older-than", "2")):
            with self.subTest(arguments=arguments):
                done = self.main("purge-snapshots", *arguments)
                self.assertEqual((done.status, done.out), (2, ""))
        real = self.ctl("purge-snapshots", "--older-than-days", "-1")
        self.assertEqual((real.status, real.out), (2, ""))
        self.assertEqual(files_under(self.stand.data_dir), before)

    def test_a_number_of_days_no_calendar_reaches_is_answered_and_not_a_crash(self):
        # Nothing is older than ten thousand years: either "that is no number of days" (2) or "nothing
        # was that old" (0) is an answer. A Python traceback is not.
        before = self.snapshots("ledger")
        for days in ("3660000", "99999999999999999999"):
            with self.subTest(days=days):
                done = self.ctl("purge-snapshots", "--older-than-days", days)
                self.assertNoTraceback(done)
                self.assertIn(done.status, (0, 2), done.said)
        self.assertEqual(self.snapshots("ledger"), before)


# ---------------------------------------------------------------------------
# verify, doctor: counts, never contents - and never a write
# ---------------------------------------------------------------------------

class VerifyAndDoctorTests(CtlCase):
    def setUp(self):
        super().setUp()
        history(self.stand.data_dir, "ledger", [ledger(30), ledger(31), ledger(32)])
        self.stand.set_password("mika")
        self.stand.session("mika")

    def copy(self):
        """The data directory as a backup would hold it, somewhere else."""
        parent = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, parent, True)
        return shutil.copytree(self.stand.data_dir, os.path.join(parent, "unpacked"))

    def test_verify_is_0_on_a_sound_copy_counts_it_and_needs_no_setting(self):
        copy = self.copy()
        before = files_under(copy)
        nothing_set = {name: value for name, value in self.environ.items() if not name.startswith("MONEY_")}
        done = run_ctl(nothing_set, ["verify", copy])
        self.assertEqual((done.status, done.err), (0, ""), done.said)
        self.assertRegex(done.out, r"\n  ledger: revision 3, 32 rows, [\d.]+ k?B, ")
        self.assertIn("snapshots: 2 ", done.out)
        self.assertIn("read back: 2, bad: 0", done.out)
        self.assertIn("  plan: never saved (revision 0)", done.out)
        self.assertIn("  accounts: 3 (with a password: 1, disabled: 0, pending links: 0)\n", done.out)
        self.assertIn("  sessions: 1\n", done.out)
        self.assertEqual(files_under(copy), before)
        self.assertEqual(sorted(os.listdir(copy)), sorted(os.listdir(self.stand.data_dir)), "not even a lock file was made")

    def test_verify_is_1_on_a_copy_with_a_bad_document_a_bad_snapshot_or_bad_accounts_and_on_no_directory(self):
        damage = {
            "a truncated document": lambda copy: truncate(os.path.join(copy, "ledger", "current.json"), 50),
            "a lost document": lambda copy: os.unlink(os.path.join(copy, "ledger", "current.json")),
            "a snapshot that does not unpack": lambda copy: write(os.path.join(copy, "ledger", "snapshots", SNAPSHOTS[0]), b"not gzip"),
            "accounts that are not JSON": lambda copy: write(os.path.join(copy, "auth", "users.json"), b'{"v":1,'),
            "the laptop tool's files": lambda copy: write(os.path.join(copy, "db.json"), b"{}"),
        }
        for what, harm in damage.items():
            with self.subTest(what=what):
                copy = self.copy()
                harm(copy)
                before = files_under(copy)
                done = self.main("verify", copy)
                self.assertEqual(done.status, 1, done.said)
                self.assertRegex(done.out, r"verify: \d+ problem\(s\)\n$")
                self.assertEqual(files_under(copy), before)
        real = self.ctl("verify", os.path.join(self.copy(), "current.json"))           # no such directory
        self.assertEqual(real.status, 1, real.said)
        self.assertNoTraceback(real)
        self.assertEqual(self.ctl("verify").status, 2)

    def test_doctor_is_0_on_a_sound_stand_and_writes_nothing(self):
        before = files_under(self.stand.data_dir)
        names = sorted(os.listdir(self.path("auth")))
        done = self.ctl("doctor")
        self.assertEqual((done.status, done.err), (0, ""), done.said)
        self.assertRegex(done.out, r"doctor: OK - nothing is wrong\n$")
        self.assertIn("  STAND marker: dev\n", done.out)
        self.assertRegex(done.out, r"\n  ledger: revision 3, 32 rows, ")
        self.assertEqual(files_under(self.stand.data_dir), before)
        self.assertEqual(sorted(os.listdir(self.path("auth"))), names)

    def test_doctor_is_1_on_a_damaged_document_and_names_the_newest_snapshot(self):
        truncate(self.path("ledger", "current.json"), 50)
        before = files_under(self.stand.data_dir)
        done = self.ctl("doctor")
        self.assertEqual(done.status, 1, done.said)
        self.assertIn("  ledger: DAMAGED", done.out)
        self.assertIn(SNAPSHOTS[0], done.out)
        self.assertRegex(done.out, r"doctor: 1 problem\(s\)\n$")
        self.assertEqual(files_under(self.stand.data_dir), before, "a doctor looks; it does not treat")

    def test_doctor_tells_a_document_that_was_lost_from_one_that_was_never_saved(self):
        os.unlink(self.path("ledger", "current.json"))
        done = self.main("doctor")
        self.assertEqual(done.status, 1, done.said)
        self.assertIn("  ledger: DAMAGED", done.out)
        self.assertIn("  plan: never saved (revision 0)", done.out)
        self.assertIn(SNAPSHOTS[0], done.out)

    def test_neither_doctor_nor_verify_moves_a_damaged_sessions_file_aside(self):
        garbage = b'{"v":1,"sessions":{"MARKER-IN-A-DAMAGED-SESSIONS-FILE'
        write(self.path("auth", "sessions.json"), garbage)
        before = files_under(self.stand.data_dir)
        for arguments in (("doctor",), ("verify", self.stand.data_dir)):
            done = self.ctl(*arguments)
            self.assertNoTraceback(done)
            self.assertNotIn("MARKER", done.said)
            self.assertIn("sessions: unreadable", done.out)
            self.assertEqual(files_under(self.stand.data_dir), before, arguments)
        self.assertEqual(read(self.path("auth", "sessions.json")), garbage)


# ---------------------------------------------------------------------------
# Nothing a command prints is what a document holds, a password hash or a token
# ---------------------------------------------------------------------------

class NothingIsShownTests(CtlCase):
    """BUILD-SPEC 2.10 "counts, never contents"; the design: a session with root ssh gets counts from ctl, never contents."""

    AMOUNT = 918273645546372819
    CYRILLIC = "МАРКЕР-зарплата"

    def setUp(self):
        super().setUp()
        stand = self.stand
        ledgers = [json.dumps({
            "v": 1, "MARKER-KEY-%d" % version: {"MARKER-NESTED": ["MARKER-ITEM", self.CYRILLIC]},
            "tx": [{"id": "MARKER-TX-%d" % row, "d": "2026-09-01", "a": self.AMOUNT + row, "memo": "MARKER " + self.CYRILLIC}
                   for row in range(30 + version)],
        }, ensure_ascii=False) for version in range(3)]
        plans = [json.dumps({
            "v": 2, "cushion": self.AMOUNT, "banks": [{"id": "MARKER-BANK", "n": self.CYRILLIC, "bal": self.AMOUNT}],
            "inflows": [], "team": [{"n": "MARKER-PERSON", "pay": self.AMOUNT + version}], "taxes": [], "other": [],
        }, ensure_ascii=False) for version in range(2)]
        history(stand.data_dir, "ledger", ledgers)
        history(stand.data_dir, "plan", plans)
        stand.set_password("mika")
        stand.set_password("misha", "MARKER-is-not-a-good-password")
        signed = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD})
        self.tokens = [stand.token_of(signed.cookie("money-dev")), stand.token_of(stand.session("misha")), stand.invite("vanya")]
        hashes = [record["hash"] for record in self.users().values() if record["hash"]]
        self.secrets = ["MARKER", "МАРКЕР", "\\u041c\\u0410\\u0420", str(self.AMOUNT)[:14], PASSWORD, "pbkdf2$", "scrypt$"]
        self.secrets += self.tokens + [sha256(token) for token in self.tokens]
        for stored in hashes:
            self.secrets += [stored] + stored.split("$")[2:]            # the whole string, its salt, its digest

    def assertShowsNothing(self, done, command):
        for stream in (done.out, done.err):
            for secret in self.secrets:
                self.assertNotIn(secret, stream, "%s printed %r" % (" ".join(command), secret[:12]))
        self.assertNoTraceback(done)

    def test_no_command_prints_what_a_document_holds_a_password_hash_or_a_token(self):
        stand = self.stand
        expected = {
            ("verify", stand.data_dir): 0, ("doctor",): 0, ("snapshots", "ledger"): 0, ("snapshots", "plan"): 0,
            ("sessions", "list"): 0, ("user", "list"): 0, ("selfcheck",): 0,
        }
        for command, status in expected.items():
            with self.subTest(command=command[0]):
                done = self.ctl(*command)
                self.assertEqual(done.status, status, done.said)
                self.assertShowsNothing(done, command)
        for command, typed in ((("restore", "ledger", SNAPSHOTS[0]), "no\n"), (("restore", "plan", "day-2026-09-02-rev000001.json.gz"), "dev\n"),
                               (("seed", "ledger"), '{"tx":[{"memo":"MARKER-ON-STDIN"}]}'),
                               (("seed", "plan", "--fresh"), '{"banks":"MARKER-ON-STDIN"}'),
                               (("purge-snapshots", "--older-than-days", "99999"), ""), (("empty",), "")):
            with self.subTest(command=command[0]):
                self.assertShowsNothing(self.main(*command, typed=typed), command)

    def test_a_damaged_file_is_named_and_never_quoted(self):
        stand = self.stand
        truncate(self.path("ledger", "current.json"), 300)              # cut in the middle of its rows
        self.assertIn(b"MARKER", read(self.path("ledger", "current.json")))
        write(self.path("plan", "current.json"), ('{"banks":[{"n":"MARKER-BARE-DOCUMENT %s"}]}' % self.CYRILLIC).encode("utf-8"))
        write(self.path("ledger", "snapshots", SNAPSHOTS[1]), b"MARKER-NOT-GZIP " * 40)
        with gzip.open(self.path("plan", "snapshots", "day-2026-09-02-rev000001.json.gz"), "wb") as handle:
            handle.write(b'{"rev":1,"doc":{"MARKER-NO-BANKS":true},"updatedAt":"2026-09-01T12:00:00.000Z"}')
        write(self.path("auth", "users.json"),
              b'{"v":1,"users":{"mika":{"hash":"pbkdf2$20000$MARKER-SALT$MARKER-DIGEST","gen":"MARKER"}}}')
        write(self.path("auth", "sessions.json"),
              b'{"v":1,"sessions":{"' + sha256(self.tokens[0]).encode("ascii") + b'":{"login":"MARKER"}}}')
        for command in (("restore", "ledger", SNAPSHOTS[1]), ("restore", "plan", "day-2026-09-02-rev000001.json.gz"),
                        ("user", "disable", "mika"), ("user", "invite", "mika", "--print"), ("empty",)):
            with self.subTest(command=command):
                done = self.main(*command, typed="dev\n")
                self.assertEqual(done.status, 1, done.said)
                self.assertShowsNothing(done, command)
        expected = {
            ("verify", stand.data_dir): 1, ("doctor",): 1, ("snapshots", "ledger"): 0, ("snapshots", "plan"): 0,
            ("user", "list"): 1, ("selfcheck",): 1, ("sessions", "list"): 0,            # the last one moves the file aside
        }
        for command, status in expected.items():
            with self.subTest(command=command[0]):
                done = self.ctl(*command)
                self.assertEqual(done.status, status, done.said)
                self.assertShowsNothing(done, command)


# ---------------------------------------------------------------------------
# prod and test, as far as the stand's name decides what a command may do
# ---------------------------------------------------------------------------

class ServerStandTests(unittest.TestCase):
    """A prod-shaped and a test-shaped data directory, and the real entry point on each (see the module's words)."""

    def stand(self, name):
        """-> (the environment of a ``name`` stand, its data directory with two documents and their day copies)."""
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        store.prepare_data_dir(directory, name)                 # the STAND marker says whose it is
        history(directory, "ledger", [ledger(30), ledger(31), ledger(32)])
        history(directory, "plan", [plan(2), plan(3)])
        environ = process_environ({
            "MONEY_STAND": name,
            "MONEY_PUBLIC_URL": "https://finance.selfstudio.se" if name == "prod" else "https://finance.test.selfstudio.se",
            "MONEY_FOUNDERS": _harness.FOUNDERS, "MONEY_DATA_DIR": directory, "MONEY_WEB_DIR": _harness.CHECKOUT,
            "MONEY_BIND": "127.0.0.1:%d" % _harness.free_port(),        # a port nobody listens on: asking it is refused at once
            "MONEY_TRUSTED_PROXIES": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
        })
        return environ, directory

    def test_the_stand_in_is_only_what_lets_a_prod_stand_read_its_settings_here(self):
        environ, directory = self.stand("prod")
        done = run_ctl(environ, ["empty"], scrypt=True)
        self.assertEqual((done.status, done.err), (1, ""), done.said)   # it ran as prod, and prod holds two documents
        self.assertIn("revision 3", done.out)
        self.assertEqual(read(os.path.join(directory, "STAND")), b"prod\n")

    def test_seed_refuses_on_prod_with_2_before_it_reads_or_writes_anything(self):
        environ, directory = self.stand("prod")
        before = files_under(directory)
        names = sorted(os.listdir(directory))
        for arguments in (("seed", "ledger", "--fresh"), ("seed", "plan")):
            with self.subTest(arguments=arguments):
                done = run_ctl(environ, arguments, text=ledger(1, note="MARKER-ON-STDIN"), scrypt=True)
                self.assertEqual((done.status, done.out), (2, ""), done.said)
                self.assertIn("prod", done.err)
                self.assertIn("test and dev only", done.err)
                self.assertNotIn("MARKER", done.said)
                self.assertNotIn("Traceback", done.said)
        self.assertEqual(files_under(directory), before)
        self.assertEqual(sorted(os.listdir(directory)), names, "no log, no lock, no session: nothing at all")
        self.assertFalse(os.path.exists(os.path.join(directory, "auth", "sessions.json")))

    def test_purge_snapshots_refuses_on_prod_with_2_and_every_snapshot_stays(self):
        environ, directory = self.stand("prod")
        before = files_under(directory)
        for days in ("0", "2"):
            done = run_ctl(environ, ["purge-snapshots", "--older-than-days", days], scrypt=True)
            self.assertEqual((done.status, done.out), (2, ""), done.said)
            self.assertIn("test and dev only", done.err)
        self.assertEqual(files_under(directory), before)
        self.assertEqual(sorted(os.listdir(os.path.join(directory, "ledger", "snapshots"))), sorted(SNAPSHOTS))

    def test_on_test_the_same_two_commands_are_not_refused_for_the_stands_name(self):
        environ, directory = self.stand("test")
        seeded = run_ctl(environ, ["seed", "ledger", "--fresh"], text=ledger(1), scrypt=True)
        self.assertEqual(seeded.status, 1, seeded.said)                 # it went as far as the door, and nobody is there
        self.assertIn("does not answer", seeded.err)
        self.assertNotIn("test and dev only", seeded.err)
        sessions = json.loads(read(os.path.join(directory, "auth", "sessions.json")).decode("ascii"))["sessions"]
        self.assertEqual(sessions, {}, "the session it made for the door is gone")
        purged = run_ctl(environ, ["purge-snapshots", "--older-than-days", "2"], scrypt=True)
        self.assertEqual((purged.status, purged.err), (0, ""), purged.said)
        self.assertEqual(os.listdir(os.path.join(directory, "ledger", "snapshots")), [])
        self.assertEqual(store.DocStore(directory, "ledger").revision(), 3, "what is current is never purged")

    def test_print_is_refused_outside_dev_whatever_standard_output_is(self):
        for name, ways in (("prod", ({}, {"terminal": "stdout"})), ("test", ({"terminal": "stdout"},))):
            environ, directory = self.stand(name)
            before = files_under(directory)
            for how in ways:
                with self.subTest(stand=name, how=how):
                    done = run_ctl(environ, ["user", "invite", "mika", "--print"], scrypt=True, **how)
                    self.assertEqual(done.status, 2, done.said)
                    self.assertNotIn("#t=", done.said)
                    self.assertIn("--print", done.err)
            piped = run_ctl(environ, ["user", "invite", "mika"], scrypt=True)
            self.assertEqual((piped.status, piped.out), (2, ""))
            self.assertEqual(files_under(directory), before, "no link was issued on %s" % name)

    def test_on_prod_a_terminal_still_gets_its_link_and_the_link_is_of_the_public_name(self):
        environ, directory = self.stand("prod")
        done = run_ctl(environ, ["user", "invite", "misha"], terminal="stdout", scrypt=True)
        self.assertEqual((done.status, done.err), (0, ""), done.said)
        (token,) = re.findall(r"\nhttps://finance\.selfstudio\.se/set-password#t=([A-Za-z0-9_-]{43})\n", done.out)
        users = json.loads(read(os.path.join(directory, "auth", "users.json")).decode("ascii"))["users"]
        self.assertEqual(users["misha"]["invite"]["sha256"], sha256(token))
        self.assertNotIn(token.encode("ascii"), b"".join(files_under(directory).values()))

    def test_restore_on_prod_wants_the_word_prod(self):
        environ, directory = self.stand("prod")
        before = files_under(directory)
        for typed in ("test\n", "PROD\n", ""):
            with self.subTest(typed=typed):
                done = run_ctl(environ, ["restore", "ledger", SNAPSHOTS[1]], text=typed, scrypt=True)
                self.assertEqual((done.status, done.out), (2, ""), done.said)
                self.assertIn("PROD", done.err, "it says which stand is about to be changed")
        self.assertEqual(files_under(directory), before)
        done = run_ctl(environ, ["restore", "ledger", SNAPSHOTS[1]], text="prod\n", scrypt=True)
        self.assertEqual(done.status, 0, done.said)
        self.assertEqual(store.DocStore(directory, "ledger").revision(), 4)


# ---------------------------------------------------------------------------
# The command line itself
# ---------------------------------------------------------------------------

class CommandLineTests(CtlCase):
    def test_a_wrong_command_line_is_2_on_standard_error_and_changes_nothing(self):
        stand = self.stand
        before = files_under(stand.data_dir)
        for arguments in ((), ("nothing",), ("user",), ("user", "invite"), ("user", "remove", "mika"), ("user", "list", "extra"),
                          ("sessions",), ("restore",), ("restore", "ledger"), ("verify",), ("verify", "a", "b"), ("seed",),
                          ("empty", "now"), ("ping", "--fast"), ("selfcheck", "x"), ("doctor", "--fix"), ("--stand", "prod", "empty")):
            with self.subTest(arguments=arguments):
                done = self.main(*arguments)
                self.assertEqual((done.status, done.out), (2, ""))
                self.assertIn("usage: ", done.err)
        for arguments in ((), ("user", "invite")):                             # and the process itself ends with that status
            real = self.ctl(*arguments)
            self.assertEqual((real.status, real.out), (2, ""), arguments)
        self.assertEqual(files_under(stand.data_dir), before)
        self.assertEqual(self.ctl("--help").status, 0)

    def test_a_setting_the_service_would_not_start_on_is_2_for_every_command(self):
        stand = self.stand
        broken = {
            "MONEY_STAND": "staging", "MONEY_PUBLIC_URL": "http://money.localhost:%d" % stand.port,
            "MONEY_BIND": "0.0.0.0:%d" % stand.port, "MONEY_FOUNDERS": "",
        }
        cookie = stand.session("mika")
        before = files_under(stand.data_dir)
        for name, value in broken.items():
            environ = dict(stand.environ, **{name: value})
            for arguments in (("empty",), ("user", "list"), ("user", "invite", "mika", "--print"), ("sessions", "logout", "--all"),
                              ("doctor",), ("ping",), ("selfcheck",), ("snapshots", "ledger"), ("seed", "ledger", "--fresh"),
                              ("purge-snapshots", "--older-than-days", "0")):
                with self.subTest(setting=name, arguments=arguments):
                    done = main_with(environ, *arguments, typed=ledger(1))
                    self.assertEqual((done.status, done.out), (2, ""), done.said)
                    self.assertIn("refused", done.err)
        real = run_ctl(dict(self.environ, MONEY_STAND="staging"), ["sessions", "logout", "--all"])
        self.assertEqual((real.status, real.out), (2, ""), real.said)
        self.assertEqual(files_under(stand.data_dir), before)
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)

    def test_a_data_directory_of_another_stand_is_2_and_is_not_touched(self):
        stand = self.stand
        cookie = stand.session("mika")
        with open(self.path("STAND"), "w") as handle:
            handle.write("test\n")
        before = files_under(stand.data_dir)
        for arguments, typed in ((("empty",), None), (("user", "list"), None), (("user", "invite", "mika", "--print"), None),
                                 (("user", "disable", "mika"), None), (("sessions", "list"), None),
                                 (("sessions", "logout", "--all"), None), (("snapshots", "ledger"), None),
                                 (("restore", "ledger", SNAPSHOTS[0]), "dev\n"), (("seed", "ledger", "--fresh"), ledger(1)),
                                 (("purge-snapshots", "--older-than-days", "0"), None), (("selfcheck",), None)):
            with self.subTest(arguments=arguments):
                done = self.main(*arguments, typed=typed or "")
                self.assertEqual((done.status, done.out.count("#t=")), (2, 0), done.out + done.err)
        real = self.ctl("sessions", "logout", "--all")
        self.assertEqual((real.status, real.out), (2, ""))
        self.assertEqual(files_under(stand.data_dir), before)
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)


if __name__ == "__main__":
    unittest.main()
