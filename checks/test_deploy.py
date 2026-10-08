"""The server's commands, run here against stand-ins: deploy/stand.sh and deploy/bin/*.

The scripts are the real ones. They are copied into a sandbox in which every path of the
server (/opt/money, /var/lib/money, /var/log/money, /run/lock ...) lies under a temporary
directory, and they find ``docker``, ``git``, ``flock`` and a few more at the front of
``PATH`` as stand-ins (``checks/standins.py``): a small model of the Docker daemon that
remembers images, tags, containers, their environment and their logs, and that runs the
real ``python -m moneyd.ctl`` of this checkout on whatever directory a container has
mounted. The data a restore is tried on is made by the real ``moneyd.store`` and
``moneyd.auth``. Nothing here needs Docker, node, a network or root, and nothing is left
behind.

    python3 -B checks/test_deploy.py                        (or: -m unittest discover -s checks -p 'test_*.py')
    python3 -B checks/test_deploy.py RestoreTests           one class
    DEPLOY_SHELL=bash python3 -B checks/test_deploy.py      everything under another shell

Every script is run under ``dash`` when the machine has it - it is /bin/sh on the server,
and it is the shell that does not run an EXIT trap when a signal ends it - and the syntax
of every script is checked under each of sh, dash and bash that is here.

What cannot be checked this way, and is checked by the ``image`` job of CI with a real
Docker: that the docker commands themselves are spelled as Docker takes them, shellcheck,
``caddy validate``, systemd's reading of the units.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tests import _safety  # noqa: E402,F401  - first: nothing is run beside a ledger

import datetime  # noqa: E402
import glob  # noqa: E402
import gzip  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import shutil  # noqa: E402
import signal  # noqa: E402
import socket  # noqa: E402
import stat  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
import unittest  # noqa: E402

from moneyd import auth, config, log, store  # noqa: E402

SCRIPTS = ["deploy/stand.sh"] + sorted(
    "deploy/bin/" + name for name in os.listdir(os.path.join(ROOT, "deploy", "bin"))) + sorted(
    "deploy/motd/" + name for name in os.listdir(os.path.join(ROOT, "deploy", "motd")))
SHELLS = [name for name in ("dash", "sh", "bash") if shutil.which(name)]
#: The shell the scripts are run under: the server's own when this machine has it. DEPLOY_SHELL names
#: another one, to run everything under it as well (DEPLOY_SHELL=bash python3 -B checks/test_deploy.py).
SHELL = os.environ.get("DEPLOY_SHELL") or ("dash" if "dash" in SHELLS else "sh")
STANDINS = ("docker", "git", "flock", "pgrep", "systemctl", "id", "install", "chown", "date", "sleep", "tar",
            "mktemp")
REAL_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
TODAY = "2026-10-07"
FOUNDERS = "mika:Mika,misha:Misha,vanya:Vanya"

#: Every path of the server a script names, and where it lies in a sandbox.
SERVER_PATHS = (
    ("/opt/money-dev", "opt/money-dev"),
    ("/opt/money", "opt/money"),
    ("/run/lock/", "run/lock/"),
    ("/proc/meminfo", "proc/meminfo"),
    ("/var/backups/money", "var/backups/money"),
    ("/var/lib/money", "var/lib/money"),
    ("/var/log/money", "var/log/money"),
    ("=/var/tmp", "=%s/var/tmp"),
)


def read(path):
    with open(path, "rb") as handle:
        return handle.read().decode("utf-8")


def write(path, text, mode=None):
    with open(path, "wb") as handle:
        handle.write(text.encode("utf-8"))
    if mode is not None:
        os.chmod(path, mode)


class Done(object):
    """How a script ended: ``status``, ``out``, ``err`` and the lines of ``out``."""

    def __init__(self, status, out, err):
        self.status = status
        self.out = out
        self.err = err
        self.lines = [line for line in out.splitlines() if line.strip()]
        self.last = self.lines[-1] if self.lines else ""

    def __repr__(self):
        return "status %s\n--- stdout\n%s--- stderr\n%s" % (self.status, self.out, self.err)


class Sandbox(object):
    """A machine that is not the server: both checkouts, the stand-ins, and their state."""

    def __init__(self, case, smoke="stand-in"):
        self.case = case
        self.home = os.path.realpath(tempfile.mkdtemp(prefix="money-deploy-"))
        case.addCleanup(shutil.rmtree, self.home, True)
        self.bin = os.path.join(self.home, "bin")
        self.state_dir = os.path.join(self.home, "state")
        for name in ("bin", "state", "tmp", "opt", "run/lock", "proc", "var/lib/money", "var/backups", "var/tmp",
                     "var/log"):
            os.makedirs(os.path.join(self.home, name))
        write(os.path.join(self.home, "proc", "meminfo"),
              "MemTotal:        3905536 kB\nMemFree:          200000 kB\nMemAvailable:    2553856 kB\n")
        self.checkouts = {"prod": os.path.join(self.home, "opt", "money"),
                          "test": os.path.join(self.home, "opt", "money-dev")}
        for checkout in self.checkouts.values():
            self._copy_deploy(checkout)
            os.makedirs(os.path.join(checkout, "scripts"))
            write(os.path.join(checkout, "scripts", "money-demo.mjs"), "// the generator; a stand-in plays node\n")
        standins = os.path.join(ROOT, "checks", "standins.py")
        for name in STANDINS:
            self._launcher(os.path.join(self.bin, name), standins, name)
        if smoke == "stand-in":
            for checkout in self.checkouts.values():
                self._launcher(os.path.join(checkout, "deploy", "bin", "money-smoke"), standins, "money-smoke")
        write(os.path.join(self.state_dir, "state.json"), json.dumps(
            {"images": {}, "containers": {}, "events": [], "seq": 0, "plan": {"today": TODAY}}))
        write(os.path.join(self.state_dir, "calls.log"), "")

    # -- building ---------------------------------------------------------------

    def _copy_deploy(self, checkout):
        source = os.path.join(ROOT, "deploy")
        for base, _dirs, files in os.walk(source):
            target = os.path.join(checkout, "deploy", os.path.relpath(base, source))
            os.makedirs(target, exist_ok=True)
            for name in files:
                text = read(os.path.join(base, name))
                for at, (server, _local) in enumerate(SERVER_PATHS):
                    text = text.replace(server, "@@%d@@" % at)
                for at, (_server, local) in enumerate(SERVER_PATHS):
                    there = local % self.home if "%s" in local else os.path.join(self.home, local)
                    text = text.replace("@@%d@@" % at, there)
                write(os.path.join(target, name), text, stat.S_IMODE(os.stat(os.path.join(base, name)).st_mode))

    def _launcher(self, path, standins, name):
        write(path, "#!/bin/sh\nexec '%s' -B -S '%s' %s \"$@\"\n" % (sys.executable, standins, name), 0o755)

    def script(self, stand, name):
        """A script of the checkout a stand is deployed from: ``stand.sh``, or a name of deploy/bin."""
        if name == "stand.sh":
            return os.path.join(self.checkouts[stand], "deploy", "stand.sh")
        return os.path.join(self.checkouts[stand], "deploy", "bin", name)

    def data(self, stand):
        return os.path.join(self.home, "var", "lib", "money", stand)

    def logs(self, stand):
        return os.path.join(self.home, "var", "log", "money", stand)

    def make_data_dir(self, stand):
        os.makedirs(self.data(stand), 0o700)
        return self.data(stand)

    def mark_real(self, stand="test", content="the real ledger, since 8 October 2026\n"):
        """A person's marker in a stand's data directory: its documents are real. Returns its path."""
        path = os.path.join(self.data(stand), store.REAL_DATA_FILE)
        write(path, content)
        return path

    def backups(self, stand=None):
        """The names in /var/backups/money, sorted - of one stand, or all of them; [] when the directory is not there."""
        folder = os.path.join(self.home, "var", "backups", "money")
        if not os.path.isdir(folder):
            return []
        return sorted(name for name in os.listdir(folder) if stand is None or name.startswith("money-%s-" % stand))

    def stand_file(self, stand, extra):
        """Add lines to the stand file of a stand's own checkout."""
        path = os.path.join(self.checkouts[stand], "deploy", "stands", stand + ".env")
        write(path, read(path) + extra)

    # -- the model ----------------------------------------------------------------

    def state(self):
        return json.loads(read(os.path.join(self.state_dir, "state.json")))

    def _put(self, state):
        write(os.path.join(self.state_dir, "state.json"), json.dumps(state))

    def plan(self, **answers):
        state = self.state()
        state["plan"].update(answers)
        self._put(state)

    def image(self, *tags):
        """An image that exists already, under these names. Returns its id."""
        state = self.state()
        state["seq"] += 1
        image = "sha256:image%04d" % state["seq"]
        state["images"][image] = {"tags": list(tags)}
        self._put(state)
        return image

    def container(self, stand, image, status="running", health="healthy", said=("line one", "line two"), **env):
        """The container a stand has, as an earlier deploy left it. Returns its id."""
        state = self.state()
        state["seq"] += 1
        cid = "container%04d" % state["seq"]
        environment = {"MONEY_STAND": stand, "MONEY_CSP": "enforce", "MONEY_CSP_OVERRIDE_UNTIL": "",
                       "MONEY_PUBLIC_URL": "https://finance.%sselfstudio.se" % ("" if stand == "prod" else "test."),
                       "MONEY_FOUNDERS": FOUNDERS, "MONEY_DATA_DIR": "/data", "MONEY_BIND": "0.0.0.0:8080",
                       "MONEY_TRUSTED_PROXIES": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "TZ": "UTC"}
        environment.update(env)
        state["containers"][cid] = {"project": "money-" + stand, "name": "money-%s-app-1" % stand, "image": image,
                                    "env": environment, "status": status, "health": health,
                                    "data": self.data(stand)}
        self._put(state)
        write(os.path.join(self.state_dir, "log-" + cid), "".join(line + "\n" for line in said))
        return cid

    def events(self, cmd=None):
        return [event for event in self.state()["events"] if cmd is None or event["cmd"] == cmd]

    def calls(self, pattern=None):
        lines = read(os.path.join(self.state_dir, "calls.log")).splitlines()
        return [line for line in lines if pattern is None or re.search(pattern, line)]

    def tags(self):
        """``{tag: image id}`` of everything the model holds."""
        return {tag: image for image, record in self.state()["images"].items() for tag in record["tags"]}

    # -- running ------------------------------------------------------------------

    def environ(self, extra=None):
        environ = {
            "PATH": self.bin + ":" + REAL_PATH, "HOME": self.home, "TMPDIR": os.path.join(self.home, "tmp"),
            "LC_ALL": "C", "STANDIN_STATE": self.state_dir, "STANDIN_REPO": ROOT, "STANDIN_PYTHON": sys.executable,
            "STANDIN_REAL_PATH": REAL_PATH,
        }
        environ.update(extra or {})
        return environ

    def run(self, script, *args, **options):
        shell = options.pop("shell", SHELL)
        done = subprocess.run(
            [shell, script] + list(args), input=options.pop("stdin", "").encode("utf-8"),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.environ(options.pop("env", None)),
            cwd=options.pop("cwd", self.home), timeout=options.pop("timeout", 120))
        assert not options, options
        return Done(done.returncode, done.stdout.decode("utf-8", "replace"), done.stderr.decode("utf-8", "replace"))

    def start(self, script, *args, **options):
        """A script in a process group of its own, with the three signals as a terminal leaves them."""
        deaf_to_pipes = options.pop("deaf_to_pipes", False)

        def own_group():
            os.setsid()
            for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                signal.signal(number, signal.SIG_DFL)
            if deaf_to_pipes:
                # A write to a terminal that has gone fails; it does not kill. With SIGPIPE ignored a
                # closed pipe behaves the same way.
                signal.signal(signal.SIGPIPE, signal.SIG_IGN)
        stdin = options.pop("stdin", "")
        process = subprocess.Popen(
            [options.pop("shell", SHELL), script] + list(args), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=self.environ(options.pop("env", None)), cwd=self.home,
            preexec_fn=own_group, restore_signals=not deaf_to_pipes)
        self.case.addCleanup(self._end, process)
        process.stdin.write(stdin.encode("utf-8"))
        process.stdin.close()
        return process

    @staticmethod
    def _end(process):
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except OSError:
                pass
        process.wait()
        for stream in (process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                stream.close()

    def blocked(self, process, seconds=30.0, marker="blocked"):
        """Wait until a ctl word the plan blocks on has been reached (or, with ``at-up``, `compose up`)."""
        marker = os.path.join(self.state_dir, marker)
        end = time.time() + seconds
        while time.time() < end:
            if os.path.exists(marker):
                return True
            if process.poll() is not None:
                return False
            time.sleep(0.05)
        return False

    def signalled(self, process, number, seconds=30.0):
        """Send the whole group a signal, as a terminal does, and collect how the script ended."""
        os.killpg(process.pid, number)
        return self.ended(process, seconds)

    def ended(self, process, seconds=60.0):
        """Wait for a started script and collect how it ended."""
        try:
            process.wait(seconds)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            self.case.fail("the script did not end within %d s" % seconds)
        out = process.stdout.read().decode("utf-8", "replace")
        err = process.stderr.read().decode("utf-8", "replace")
        process.stdout.close()
        process.stderr.close()
        return Done(process.returncode, out, err)


class DeployCase(unittest.TestCase):
    maxDiff = None

    def sandbox(self, **options):
        return Sandbox(self, **options)

    def assertVerdict(self, done, stand, word, *fragments):
        """The last line of standard output is the one verdict line."""
        self.assertTrue(done.last.startswith("money-%s: %s - " % (stand, word)), done)
        for fragment in fragments:
            self.assertIn(fragment, done.last, done)

    def assertUntouched(self, box, done=None):
        """No command that changes anything was given to docker or git."""
        changing = box.calls(r"^docker (tag|compose .* (build|up|stop|start|down)|stop|start|rm|run|image rm)\b"
                             r"|^git .*(pull|checkout|fetch)")
        self.assertEqual(changing, [], done)


# ---------------------------------------------------------------------------
# Every script, under every shell that is here
# ---------------------------------------------------------------------------

class SyntaxTests(unittest.TestCase):
    def test_every_script_parses_under_sh_dash_and_bash(self):
        self.assertIn("deploy/bin/money-restore", SCRIPTS)
        for name in SCRIPTS:
            for shell in SHELLS:
                with self.subTest(script=name, shell=shell):
                    done = subprocess.run([shell, "-n", os.path.join(ROOT, name)], stdout=subprocess.PIPE,
                                          stderr=subprocess.PIPE, timeout=30)
                    self.assertEqual(done.returncode, 0, done.stderr.decode("utf-8", "replace"))

    def test_every_script_is_a_plain_sh_script_that_can_be_run(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                path = os.path.join(ROOT, name)
                self.assertEqual(read(path).splitlines()[0], "#!/bin/sh")
                self.assertTrue(os.stat(path).st_mode & stat.S_IXUSR, "%s is not executable" % name)

    def test_no_script_uses_what_dash_does_not_have(self):
        # shellcheck holds this in CI; here the few words that would pass `sh -n` on a Mac (where sh is
        # bash) and then fail on the server.
        for name in SCRIPTS:
            text = "\n".join(line for line in read(os.path.join(ROOT, name)).splitlines()
                             if not line.lstrip().startswith("#"))
            with self.subTest(script=name):
                for word in (r"(^|[\s;(])\[\[\s", r"\blocal\s", r"\bfunction\s", r"<<<", r"\$'", r"\bpipefail\b",
                             r"\$\{[A-Z_]+//", r"\bsource\s", r"&>", r"\becho -[ne]\b", r"\$RANDOM", r"\bdeclare\s",
                             r"\s==\s"):
                    self.assertIsNone(re.search(word, text), "%s uses %s" % (name, word))

    def test_an_exit_trap_never_stands_alone(self):
        # dash runs an EXIT trap only when the script ends by itself. Beside every one of them the three
        # signals a terminal sends are turned into endings.
        for name in SCRIPTS:
            text = read(os.path.join(ROOT, name))
            if not re.search(r"^\s*trap .* EXIT$", text, re.M):
                continue
            with self.subTest(script=name):
                for line in ("trap 'exit 130' INT", "trap 'exit 143' TERM", "trap 'exit 129' HUP"):
                    self.assertEqual(len(re.findall(r"^\s*%s$" % re.escape(line), text, re.M)),
                                     len(re.findall(r"^\s*trap .* EXIT$", text, re.M)),
                                     "%s: every EXIT trap needs `%s` beside it" % (name, line))


# ---------------------------------------------------------------------------
# stand.sh: the policy settings of one deploy (D1)
# ---------------------------------------------------------------------------

class PolicyTests(DeployCase):
    REFUSED = (
        # stand, MONEY_CSP, MONEY_CSP_OVERRIDE_UNTIL, a fragment of the reason
        ("prod", "reportonly", "", "must be enforce or report-only"),
        ("test", "reportonly", "", "must be enforce or report-only"),
        ("test", "off", "", "no way to switch the policy off"),
        ("prod", "report-only", "", "names the day the override ends"),
        ("prod", "report-only", "12.11.2026", "a real day written YYYY-MM-DD"),
        ("prod", "report-only", "2026-02-30", "a real day written YYYY-MM-DD"),
        ("prod", "report-only", "2026-13-01", "a real day written YYYY-MM-DD"),
        ("prod", "report-only", "2026-10-06", "has passed"),
        ("prod", "report-only", "2025-12-31", "has passed"),
        ("prod", "report-only", "0000-01-01", "a real day written YYYY-MM-DD"),
        ("test", "report-only", "tomorrow", "a real day written YYYY-MM-DD"),
        ("test", "enforce", "2026-9-1", "a real day written YYYY-MM-DD"),
        ("prod", "enforce", "20261110", "a real day written YYYY-MM-DD"),
    )
    TAKEN = (
        ("prod", "", ""),
        ("prod", "enforce", ""),
        ("prod", "report-only", TODAY),            # the day itself has not passed
        ("prod", "report-only", "2026-11-10"),
        ("prod", "report-only", "2028-02-29"),     # a leap day
        ("prod", "enforce", "2020-01-01"),         # a day is only read with report-only
        ("test", "report-only", ""),               # test needs no day
        ("test", "report-only", "2020-01-01"),     # and holds none against the calendar
        ("test", "enforce", "2026-11-10"),
    )

    def given(self, mode, until):
        env = {}
        if mode:
            env["MONEY_CSP"] = mode
        if until:
            env["MONEY_CSP_OVERRIDE_UNTIL"] = until
        return env

    def test_a_setting_the_service_would_not_start_on_is_refused_before_anything_is_touched(self):
        box = self.sandbox()
        for stand in ("prod", "test"):
            box.make_data_dir(stand)
            box.container(stand, box.image("money-%s:1.0.0" % stand))
        for stand, mode, until, why in self.REFUSED:
            for word in ("up", "preflight"):
                with self.subTest(stand=stand, mode=mode, until=until, word=word):
                    done = box.run(box.script(stand, "stand.sh"), stand, word, env=self.given(mode, until))
                    self.assertEqual(done.status, 1, done)
                    self.assertVerdict(done, stand, "FAILED", why, "Nothing was changed.")
                    self.assertEqual(len(done.lines), 1, done)
                    self.assertEqual(box.calls(r"^(docker|git|flock)"), [], "something was asked of docker, git or the lock")
                    self.assertFalse(os.path.exists(os.path.join(box.home, "run", "lock", "money-deploy.lock")))

    def test_the_same_setting_in_the_stand_file_is_refused_too(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        box.stand_file("prod", "MONEY_CSP=report-only\nMONEY_CSP_OVERRIDE_UNTIL=2026-10-01\n")
        done = box.run(box.script("prod", "stand.sh"), "prod", "up")
        self.assertVerdict(done, "prod", "FAILED", "MONEY_CSP_OVERRIDE_UNTIL=2026-10-01 has passed", "Nothing was changed.")
        self.assertUntouched(box, done)

    def test_what_the_caller_gives_goes_before_the_stand_file(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.stand_file("test", "MONEY_CSP=report-only\n")
        done = box.run(box.script("test", "stand.sh"), "test", "up", env={"MONEY_CSP": "enforce"})
        self.assertVerdict(done, "test", "OK")
        self.assertEqual(box.events("up")[-1]["env"]["MONEY_CSP"], "enforce")
        self.assertNotIn("NOTE", done.err)

    def test_a_setting_the_service_takes_goes_to_the_container_as_it_was_checked(self):
        for stand, mode, until in self.TAKEN:
            with self.subTest(stand=stand, mode=mode, until=until):
                box = self.sandbox()
                box.make_data_dir(stand)
                done = box.run(box.script(stand, "stand.sh"), stand, "up", env=self.given(mode, until))
                self.assertEqual(done.status, 0, done)
                self.assertVerdict(done, stand, "OK")
                started = box.events("up")[-1]["env"]
                self.assertEqual((started["MONEY_CSP"], started["MONEY_CSP_OVERRIDE_UNTIL"]), (mode or "enforce", until))
                self.assertEqual("NOTE - this deploy asks for MONEY_CSP=report-only" in done.err, mode == "report-only")

    def test_a_value_is_shown_cut_down_and_on_the_one_verdict_line(self):
        box = self.sandbox()
        box.make_data_dir("test")
        done = box.run(box.script("test", "stand.sh"), "test", "up",
                       env={"MONEY_CSP": "enforce\nmoney-test: OK - all is well " + "x" * 200})
        self.assertEqual(done.status, 1, done)
        self.assertEqual(len(done.lines), 1, done)
        self.assertVerdict(done, "test", "FAILED", "must be enforce or report-only", "Nothing was changed.")
        self.assertLess(len(done.last), 260)

    def test_the_stand_in_for_the_service_agrees_with_the_service_about_these_settings(self):
        # What stand.sh refuses is what moneyd refuses at boot - and, on prod, a day that has passed, which
        # moneyd takes since it enforces by itself after the day (it only warns).
        clock = lambda: datetime.datetime(2026, 10, 7, 12, 0, tzinfo=datetime.timezone.utc)  # noqa: E731

        def boots(stand, mode, until):
            environ = {"MONEY_STAND": stand, "MONEY_PUBLIC_URL": "https://finance.%sselfstudio.se" % (
                "" if stand == "prod" else "test."), "MONEY_FOUNDERS": FOUNDERS, "MONEY_DATA_DIR": "/data",
                "MONEY_BIND": "0.0.0.0:8080", "MONEY_CSP": mode, "MONEY_CSP_OVERRIDE_UNTIL": until}
            try:
                return config.Settings.from_env(environ, clock, scrypt_available=True)
            except config.ConfigError:
                return None
        for stand, mode, until in self.TAKEN:
            with self.subTest(taken=(stand, mode, until)):
                self.assertIsNotNone(boots(stand, mode, until))
        for stand, mode, until, why in self.REFUSED:
            with self.subTest(refused=(stand, mode, until)):
                settings = boots(stand, mode, until)
                if "has passed" in why:
                    self.assertIsNotNone(settings, "moneyd starts on an override that has ended, and enforces")
                    self.assertFalse(settings.csp_report_only(clock()))
                else:
                    self.assertIsNone(settings)


# ---------------------------------------------------------------------------
# stand.sh up: what is kept to go back to, and going back (D2, D5)
# ---------------------------------------------------------------------------

class UpTests(DeployCase):
    def up(self, box, stand="test", **env):
        return box.run(box.script(stand, "stand.sh"), stand, "up", env=env)

    def test_a_first_deploy_builds_starts_checks_and_says_ok(self):
        box = self.sandbox()
        box.make_data_dir("test")
        done = self.up(box)
        self.assertEqual(done.status, 0, done)
        self.assertVerdict(done, "test", "OK", "1.2.3-4-gabcdef0 is up on 127.0.0.1:5192", "self-check and smoke passed")
        order = [event["cmd"] for event in box.events() if event["cmd"] in ("build", "up", "ctl")]
        self.assertEqual(order, ["build", "up", "ctl"])
        self.assertEqual(box.calls(r"^money-smoke"), ["money-smoke test"])
        self.assertEqual(box.tags(), {"money-test:1.2.3-4-gabcdef0": box.events("build")[0]["image"]})
        self.assertFalse(os.path.exists(box.logs("test")), "there was no container whose log had to be kept")

    def test_the_stand_is_started_only_from_its_own_checkout(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        done = box.run(box.script("test", "stand.sh"), "prod", "up")
        self.assertVerdict(done, "prod", "FAILED", "started only from", "Nothing was changed.")
        self.assertUntouched(box, done)

    def test_a_deploy_without_memory_or_beside_another_build_is_refused(self):
        box = self.sandbox()
        box.make_data_dir("test")
        write(os.path.join(box.home, "proc", "meminfo"), "MemAvailable:    512000 kB\n")
        done = self.up(box)
        self.assertVerdict(done, "test", "FAILED", "only 500 MB of memory is available", "Nothing was changed.")
        self.assertUntouched(box, done)
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(builds="4242 docker compose build api")
        done = self.up(box)
        self.assertVerdict(done, "test", "FAILED", "another image build is running", "Nothing was changed.")
        self.assertUntouched(box, done)

    def test_an_image_that_does_not_build_changes_nothing(self):
        box = self.sandbox()
        box.make_data_dir("test")
        running = box.container("test", box.image("money-test:1.0.0"))
        box.plan(build=[1])
        done = self.up(box)
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "the image did not build", "Nothing was changed")
        self.assertEqual(box.state()["containers"][running]["status"], "running")
        self.assertEqual(box.events("compose-stop"), [])
        self.assertEqual(box.events("tag"), [], "`previous` moved although nothing was deployed")
        self.assertEqual(box.tags(), {"money-test:1.0.0": box.state()["containers"][running]["image"]})

    def test_the_way_back_uses_the_settings_the_previous_container_had_not_those_of_the_failed_attempt(self):
        # review-deploy/rollback-inherits-policy-setting. The attempt asks for report-only (test takes
        # that); the container before it ran enforce. The new container does not come up.
        box = self.sandbox()
        box.make_data_dir("test")
        old_image = box.image("money-test:1.0.0")
        box.container("test", old_image, MONEY_CSP="enforce")
        box.plan(up=["unhealthy", "healthy"])
        done = self.up(box, MONEY_CSP="report-only", MONEY_CSP_OVERRIDE_UNTIL="2026-12-01")
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "did not report healthy", "The previous image is running again.")
        first, second = box.events("up")
        self.assertEqual((first["tag"], first["env"]["MONEY_CSP"], first["env"]["MONEY_CSP_OVERRIDE_UNTIL"]),
                         ("money-test:1.2.3-4-gabcdef0", "report-only", "2026-12-01"))
        self.assertEqual((second["tag"], second["image"]), ("money-test:previous", old_image))
        self.assertEqual((second["env"]["MONEY_CSP"], second["env"]["MONEY_CSP_OVERRIDE_UNTIL"]), ("enforce", ""))
        self.assertEqual(second["outcome"], "healthy")

    def test_the_way_back_keeps_an_override_that_is_still_in_force(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        old_image = box.image("money-prod:1.0.0")
        box.container("prod", old_image, MONEY_CSP="report-only", MONEY_CSP_OVERRIDE_UNTIL="2026-10-20")
        box.plan(up=["unhealthy", "healthy"])
        done = self.up(box, "prod")
        self.assertVerdict(done, "prod", "FAILED", "The previous image is running again.")
        first, second = box.events("up")
        self.assertEqual((first["env"]["MONEY_CSP"], first["env"]["MONEY_CSP_OVERRIDE_UNTIL"]), ("enforce", ""))
        self.assertEqual((second["env"]["MONEY_CSP"], second["env"]["MONEY_CSP_OVERRIDE_UNTIL"]),
                         ("report-only", "2026-10-20"))

    def test_the_way_back_enforces_when_the_previous_containers_override_has_ended(self):
        # The service treats an ended override as enforce already; an image from before that change
        # would not start on it at all. Either way enforce is what the previous image is given.
        box = self.sandbox()
        box.make_data_dir("prod")
        box.container("prod", box.image("money-prod:1.0.0"), MONEY_CSP="report-only",
                      MONEY_CSP_OVERRIDE_UNTIL="2026-10-01")
        box.plan(up=["unhealthy", "healthy"], up_rule="moneyd")
        done = self.up(box, "prod")
        self.assertVerdict(done, "prod", "FAILED", "The previous image is running again.")
        second = box.events("up")[1]
        self.assertEqual((second["env"]["MONEY_CSP"], second["env"]["MONEY_CSP_OVERRIDE_UNTIL"]), ("enforce", ""))

    def test_a_mistyped_setting_no_longer_takes_a_healthy_stand_down(self):
        # The finding's own scenario: `MONEY_CSP=report-only money-deploy` on prod, no day. The stand-in
        # for docker fails every container that is given what moneyd would not start on.
        box = self.sandbox()
        box.make_data_dir("prod")
        running = box.container("prod", box.image("money-prod:1.0.0"))
        box.plan(up_rule="moneyd")
        done = self.up(box, "prod", MONEY_CSP="report-only")
        self.assertVerdict(done, "prod", "FAILED", "Nothing was changed.")
        self.assertEqual(box.events("up"), [])
        self.assertEqual(box.state()["containers"][running]["status"], "running")

    def test_a_failed_self_check_goes_back_too(self):
        box = self.sandbox()
        box.make_data_dir("test")
        old_image = box.image("money-test:1.0.0")
        box.container("test", old_image)
        box.plan(selfcheck=[1])
        done = self.up(box)
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "the self-check failed", "The previous image is running again.")
        self.assertEqual([event["image"] for event in box.events("up")][-1], old_image)

    def test_only_a_container_that_runs_and_is_healthy_is_something_to_go_back_to(self):
        # review-deploy/previous-may-be-a-failed-image: a failed first deploy leaves its container stopped.
        for status, health in (("exited", "unhealthy"), ("exited", "healthy"), ("running", "unhealthy"),
                               ("running", "starting"), ("restarting", "unhealthy")):
            with self.subTest(status=status, health=health):
                box = self.sandbox()
                box.make_data_dir("test")
                failed_image = box.image("money-test:0.9.0")
                box.container("test", failed_image, status=status, health=health)
                box.plan(up=["unhealthy"])
                done = self.up(box)
                self.assertEqual(done.status, 1, done)
                self.assertIn("is not running and healthy", done.err)
                self.assertVerdict(done, "test", "FAILED", "There was no previous image to go back to, so the stand is stopped.")
                self.assertEqual(len(box.events("up")), 1, "the image that never passed was started as the way back")
                self.assertNotIn("money-test:previous", box.tags())
                self.assertEqual([c["status"] for c in box.state()["containers"].values()], ["exited"])

    def test_when_the_previous_image_does_not_come_up_either_the_stand_is_stopped_not_left_looping(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"))
        box.plan(up=["unhealthy", "unhealthy"])
        done = self.up(box)
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "The previous image did not come up either: the stand is DOWN.")
        self.assertEqual([c["status"] for c in box.state()["containers"].values()], ["exited"])
        self.assertEqual(box.events()[-1]["cmd"], "compose-stop")

    def test_a_failed_smoke_leaves_test_up_and_takes_prod_back(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"))
        box.plan(smoke=[1])
        done = self.up(box)
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "the smoke check failed", "1.2.3-4-gabcdef0 is still running")
        self.assertEqual(len(box.events("up")), 1)

        box = self.sandbox()
        box.make_data_dir("prod")
        old_image = box.image("money-prod:1.0.0")
        box.container("prod", old_image)
        box.plan(smoke=[1])
        done = self.up(box, "prod")
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "prod", "FAILED", "the smoke check failed", "The previous image is running again.")
        self.assertEqual([event["image"] for event in box.events("up")][-1], old_image)

    def test_each_deploy_leaves_two_images_and_no_nameless_third(self):
        # review-deploy/dangling-image-per-deploy: three deploys of three versions in a row.
        box = self.sandbox()
        box.make_data_dir("test")
        built = []
        for version in ("1.0.0", "1.0.1", "1.0.2", "1.0.3"):
            box.plan(describe=version)
            done = self.up(box)
            self.assertVerdict(done, "test", "OK", version)
            built.append(box.events("build")[-1]["image"])
            images = box.state()["images"]
            self.assertLessEqual(len(images), 2, "an image without a name stayed behind: %r" % (images,))
            self.assertEqual([tags for tags in (record["tags"] for record in images.values()) if not tags], [])
        self.assertEqual(box.tags(), {"money-test:1.0.3": built[3], "money-test:previous": built[2]})

    def test_a_deploy_that_goes_back_leaves_no_nameless_image_either(self):
        box = self.sandbox()
        box.make_data_dir("test")
        for version in ("1.0.0", "1.0.1"):
            box.plan(describe=version)
            self.assertVerdict(self.up(box), "test", "OK", version)
        good = box.tags()["money-test:1.0.1"]
        box.plan(describe="1.0.2", up=["unhealthy", "healthy"])
        done = self.up(box)
        self.assertVerdict(done, "test", "FAILED", "The previous image is running again.")
        images = box.state()["images"]
        self.assertEqual([image for image, record in images.items() if not record["tags"]], [], images)
        self.assertEqual(box.tags()["money-test:previous"], good)
        self.assertEqual([c["image"] for c in box.state()["containers"].values()], [good])

    def test_the_image_previous_named_is_not_removed_while_something_still_names_or_runs_it(self):
        box = self.sandbox()
        box.make_data_dir("test")
        shared = box.image("money-test:previous", "money-prod:1.0.0")       # the other stand runs the same image
        box.container("test", box.image("money-test:1.0.0"))
        box.plan(describe="1.0.1")
        self.assertVerdict(self.up(box), "test", "OK")
        self.assertEqual(box.tags().get("money-prod:1.0.0"), shared)
        self.assertNotIn(shared, [event["ref"] for event in box.events("image-rm")])
        # going back to `previous` and deploying again: previous is the running image, and stays
        box = self.sandbox()
        box.make_data_dir("test")
        previous = box.image("money-test:previous")
        box.container("test", previous)
        box.plan(describe="1.0.1")
        self.assertVerdict(self.up(box), "test", "OK")
        self.assertEqual(box.tags().get("money-test:previous"), previous)

    def test_a_hangup_while_the_container_is_replaced_does_not_end_the_deploy(self):
        # The stand is stopped by the script itself from the moment the old container is stopped until
        # the new one is up. A dropped connection in that moment must not leave it stopped.
        for number in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
            with self.subTest(signal=number):
                box = self.sandbox()
                box.make_data_dir("test")
                box.container("test", box.image("money-test:1.0.0"))
                box.plan(up_gate=True)
                process = box.start(box.script("test", "stand.sh"), "test", "up")
                self.assertTrue(box.blocked(process, marker="at-up"), "compose up was never reached")
                self.assertEqual([c["status"] for c in box.state()["containers"].values()], ["exited"])
                os.killpg(process.pid, number)
                time.sleep(0.3)
                self.assertIsNone(process.poll(), "the signal ended the script while the stand was stopped")
                write(os.path.join(box.state_dir, "go"), "")
                done = box.ended(process)
                self.assertEqual(done.status, 0, done)
                self.assertVerdict(done, "test", "OK")
                self.assertEqual([c["status"] for c in box.state()["containers"].values()], ["running"])

    def test_a_terminal_that_is_gone_after_the_replacement_ends_the_deploy_without_going_back(self):
        # Nobody can be told, and a self-check whose output cannot be written would look like a failed
        # one: the script ends, and the new container - up and healthy - stays.
        box = self.sandbox()
        box.make_data_dir("test")
        old = box.container("test", box.image("money-test:1.0.0"))
        box.plan(up_gate=True)
        process = box.start(box.script("test", "stand.sh"), "test", "up", deaf_to_pipes=True)
        self.assertTrue(box.blocked(process, marker="at-up"), "compose up was never reached")
        process.stdout.close()
        process.stderr.close()
        write(os.path.join(box.state_dir, "go"), "")
        self.assertEqual(process.wait(60), 1)
        ups = box.events("up")
        self.assertEqual([(event["outcome"], event["replaced"]) for event in ups], [("healthy", old)])
        self.assertEqual(box.events("ctl"), [], "a self-check was run for nobody to read")
        self.assertEqual([c["status"] for c in box.state()["containers"].values()], ["running"])
        self.assertEqual(box.state()["containers"][ups[0]["container"]]["image"], box.events("build")[0]["image"])

    def test_the_last_word_can_be_left_to_the_command_that_called(self):
        box = self.sandbox()
        box.make_data_dir("test")
        done = self.up(box, MONEY_VERDICT="deferred")
        self.assertEqual(done.status, 0, done)
        self.assertEqual([line for line in done.lines if line.startswith("money-test: OK")], [])
        self.assertIn("is up on 127.0.0.1:5192; self-check and smoke passed", done.last)


# ---------------------------------------------------------------------------
# stand.sh: what a container said is kept before the container goes (D4)
# ---------------------------------------------------------------------------

class RequestLogTests(DeployCase):
    SAID = ('{"t":"2026-10-06T10:00:00.000Z","method":"PUT","path":"/api/founder/money","status":200,"login":"mika"}',
            '{"t":"2026-10-06T10:00:05.000Z","method":"GET","path":"/api/me","status":200,"login":"vanya"}')

    def kept(self, box, stand="test"):
        """``{file name: its text}`` of what is kept for a stand."""
        found = {}
        for path in sorted(glob.glob(os.path.join(box.logs(stand), "*"))):
            with gzip.open(path, "rb") as handle:
                found[os.path.basename(path)] = handle.read().decode("utf-8")
        return found

    def test_a_deploy_keeps_what_the_replaced_container_said(self):
        # review-deploy/request-log-lost-at-deploy
        box = self.sandbox()
        box.make_data_dir("test")
        old = box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        done = box.run(box.script("test", "stand.sh"), "test", "up")
        self.assertVerdict(done, "test", "OK")
        kept = self.kept(box)
        self.assertEqual(len(kept), 1, kept)
        name, text = list(kept.items())[0]
        self.assertRegex(name, r"^requests-20[0-9]{6}T[0-9]{6}Z\.log\.gz$")
        for line in self.SAID:
            self.assertIn(line, text)
        self.assertIn('"event": "stopped"', text, "the container was stopped first, so its last lines are in the file")
        self.assertIn("is kept as " + os.path.join(box.logs("test"), name), done.err)
        # the order: stopped, read, and only then replaced - by a container that is new
        order = [call.split("   [")[0] for call in box.calls(r"^docker (compose .* (stop|up)|logs)")]
        self.assertRegex(order[0], r"compose .* stop app$")
        self.assertEqual(order[1], "docker logs " + old)
        self.assertRegex(order[2], r"compose .* up -d --no-build --force-recreate --wait --wait-timeout 120 app$")
        self.assertEqual(box.events("up")[0]["replaced"], old)
        self.assertNotIn(old, box.state()["containers"])
        # closed to everybody but root
        self.assertEqual(stat.S_IMODE(os.stat(box.logs("test")).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(box.logs("test"), name)).st_mode), 0o600)
        self.assertEqual([n for n in os.listdir(box.logs("test")) if n.startswith(".")], [], "a half-written file stayed")

    def test_a_deploy_of_the_same_version_starts_a_new_container_too(self):
        # Without --force-recreate compose keeps the container when nothing changed, and the next deploy
        # would keep the same lines a second time.
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(build_same=True)
        for _again in range(3):
            self.assertVerdict(box.run(box.script("test", "stand.sh"), "test", "up"), "test", "OK")
        ups = box.events("up")
        self.assertEqual(len({event["container"] for event in ups}), 3)
        self.assertEqual([event["replaced"] for event in ups], [None, ups[0]["container"], ups[1]["container"]])

    def test_going_back_keeps_what_the_container_that_failed_said(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        box.plan(up=["unhealthy", "healthy"])
        done = box.run(box.script("test", "stand.sh"), "test", "up")
        self.assertVerdict(done, "test", "FAILED", "The previous image is running again.")
        text = "".join(self.kept(box).values())
        for line in self.SAID:
            self.assertEqual(text.count(line), 1, "the first container's lines are kept once")
        failed = box.events("up")[0]["container"]
        self.assertIn('"container": "%s"' % failed, text, "what the container that failed said is kept as well")

    def test_down_keeps_the_log_and_only_then_removes_the_container(self):
        box = self.sandbox()
        box.make_data_dir("test")
        old = box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        done = box.run(box.script("test", "stand.sh"), "test", "down")
        self.assertEqual(done.status, 0, done)
        self.assertEqual(box.state()["containers"], {})
        text = "".join(self.kept(box).values())
        self.assertIn(self.SAID[0], text)
        order = [event["cmd"] for event in box.events() if event["cmd"].startswith("compose-")]
        self.assertEqual(order, ["compose-stop", "compose-down"])
        self.assertLess(box.calls().index(box.calls(r"^docker logs " + old)[0]),
                        box.calls().index(box.calls(r"^docker compose .* down")[0]))

    def test_down_on_prod_asks_for_the_stands_name(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        cid = box.container("prod", box.image("money-prod:1.0.0"))
        done = box.run(box.script("prod", "stand.sh"), "prod", "down", stdin="yes\n")
        self.assertEqual(done.status, 1, done)
        self.assertIn(cid, box.state()["containers"])
        self.assertUntouched(box, done)
        done = box.run(box.script("prod", "stand.sh"), "prod", "down", stdin="prod\n")
        self.assertEqual(done.status, 0, done)
        self.assertEqual(box.state()["containers"], {})
        self.assertEqual(len(self.kept(box, "prod")), 1)

    def test_a_log_that_cannot_be_kept_stops_the_deploy_before_anything_is_touched(self):
        box = self.sandbox()
        box.make_data_dir("test")
        running = box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        write(os.path.join(box.home, "var", "log", "money"), "a file where the directory should be\n")
        done = box.run(box.script("test", "stand.sh"), "test", "up")
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "could not be kept", "Nothing was changed.")
        self.assertUntouched(box, done)
        self.assertEqual(box.state()["containers"][running]["status"], "running")

    def test_a_container_whose_log_cannot_be_read_is_not_replaced_and_runs_on(self):
        box = self.sandbox()
        box.make_data_dir("test")
        running = box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        box.plan(logs=[1])
        done = box.run(box.script("test", "stand.sh"), "test", "up")
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "could not be kept", "the container was not replaced",
                           "The stand is as it was before.")
        self.assertEqual(box.events("up"), [])
        self.assertEqual(box.state()["containers"][running]["status"], "running")
        self.assertEqual(os.listdir(box.logs("test")), [], "a half-written file stayed")

    def test_down_leaves_the_container_when_its_log_cannot_be_kept(self):
        box = self.sandbox()
        box.make_data_dir("test")
        cid = box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        box.plan(logs=[1])
        done = box.run(box.script("test", "stand.sh"), "test", "down")
        self.assertEqual(done.status, 1, done)
        self.assertIn("NOT removed", done.err)
        self.assertEqual(box.state()["containers"][cid]["status"], "exited")

    def test_a_container_that_said_nothing_leaves_no_file(self):
        box = self.sandbox()
        box.make_data_dir("test")
        cid = box.container("test", box.image("money-test:1.0.0"), status="exited", said=())
        done = box.run(box.script("test", "stand.sh"), "test", "down")
        self.assertEqual(done.status, 0, done)
        self.assertNotIn(cid, box.state()["containers"])
        self.assertEqual(os.listdir(box.logs("test")), [])

    def test_files_older_than_400_days_go_and_younger_ones_stay(self):
        box = self.sandbox()
        box.make_data_dir("test")
        os.makedirs(box.logs("test"))
        now = time.time()
        for name, days in (("requests-20250801T000000Z.log.gz", 401), ("requests-20250901T000000Z.log.gz", 399),
                           (".requests-20261001T000000Z-77.part", 3), ("notes.txt", 500)):
            path = os.path.join(box.logs("test"), name)
            write(path, "x")
            os.utime(path, (now - days * 86400, now - days * 86400))
        box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        self.assertVerdict(box.run(box.script("test", "stand.sh"), "test", "up"), "test", "OK")
        left = sorted(os.listdir(box.logs("test")))
        self.assertNotIn("requests-20250801T000000Z.log.gz", left)
        self.assertNotIn(".requests-20261001T000000Z-77.part", left)
        self.assertIn("requests-20250901T000000Z.log.gz", left)
        self.assertIn("notes.txt", left, "only its own files are removed")
        self.assertEqual(len(left), 3)

    def test_logs_shows_the_running_container_and_says_where_the_earlier_ones_are(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"), said=self.SAID)
        done = box.run(box.script("test", "stand.sh"), "test", "logs", "--no-log-prefix")
        self.assertEqual(done.status, 0, done)
        self.assertEqual(done.out.splitlines(), list(self.SAID), "standard output is the log and nothing else")
        self.assertIn(os.path.join(box.logs("test"), "requests-<utc>.log.gz"), done.err)
        self.assertIn("400 days", done.err)


# ---------------------------------------------------------------------------
# deploy/bin/money-deploy and money-deploy-test
# ---------------------------------------------------------------------------

class DeployCommandTests(DeployCase):
    def test_a_tag_from_before_the_hosted_service_is_refused_before_the_checkout_moves(self):
        # review-deploy/deploy-tag-without-deploy-dir: 0.1.0 exists and holds no deploy/ folder.
        box = self.sandbox()
        box.make_data_dir("prod")
        box.plan(tags={"0.1.0": "laptop", "1.0.0": "hosted"})
        done = box.run(box.script("prod", "money-deploy"), "0.1.0")
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "prod", "FAILED", "tag 0.1.0 has no hosted service to deploy",
                           "The checkout was not moved.", "Nothing was deployed.")
        self.assertEqual(box.events("git-checkout"), [])
        self.assertEqual(box.events("build"), [])

    def test_a_release_tag_is_checked_out_and_deployed(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        box.plan(tags={"0.1.0": "laptop", "1.0.0": "hosted"}, release="1.0.0", describe="1.0.0")
        done = box.run(box.script("prod", "money-deploy"), "1.0.0")
        self.assertEqual(done.status, 0, done)
        self.assertEqual(box.events("git-checkout")[0]["args"], ["-q", "--detach", "refs/tags/1.0.0"])
        self.assertIn("release 1.0.0", done.lines)
        self.assertVerdict(done, "prod", "OK", "1.0.0 is up on 127.0.0.1:5191")

    def test_a_tag_that_is_not_there_or_not_bare_semver_deploys_nothing(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        box.plan(tags={"1.0.0": "hosted"})
        done = box.run(box.script("prod", "money-deploy"), "1.0.1")
        self.assertVerdict(done, "prod", "FAILED", "there is no tag 1.0.1", "Nothing was deployed.")
        done = box.run(box.script("prod", "money-deploy"), "v1.0.0")
        self.assertVerdict(done, "prod", "FAILED", "bare semver", "Nothing was deployed.")
        self.assertEqual(box.events("git-checkout") + box.events("build"), [])

    def test_a_plain_prod_deploy_takes_main_and_says_when_it_carries_no_release_tag(self):
        box = self.sandbox()
        box.make_data_dir("prod")
        done = box.run(box.script("prod", "money-deploy"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual([event["args"] for event in box.events("git-checkout")], [["-q", "main"]])
        self.assertIn("WARNING: this commit of main carries no release tag", done.lines)
        self.assertVerdict(done, "prod", "OK")
        self.assertEqual(box.events("seed"), [], "prod never takes a seed")

    def test_a_refused_policy_setting_stops_a_prod_deploy_before_the_backup_and_the_checkout(self):
        box = self.sandbox()
        prod = box.make_data_dir("prod")
        write(os.path.join(prod, "STAND"), "prod\n")
        done = box.run(box.script("prod", "money-deploy"), env={"MONEY_CSP": "report-only"})
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "prod", "FAILED", "names the day the override ends", "Nothing was changed.")
        self.assertEqual(box.calls(r"^git"), [])
        self.assertFalse(os.path.exists(os.path.join(box.home, "var", "backups", "money")), "a backup was taken")

    def test_the_test_deploy_seeds_an_empty_stand_and_purges_every_snapshot(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(empty=[0])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual(done.last, "money-test: OK - deployed and seeded with the fabricated studio.")
        self.assertEqual([(event["kind"], event["fresh"]) for event in box.events("seed")],
                         [("ledger", True), ("plan", True)])
        generated = [event for event in box.events("run") if event["image"] == "node:22-alpine"]
        self.assertEqual(len(generated), 2)
        for event in generated:
            self.assertEqual(event["network"], "none")
            self.assertEqual(list(event["mounts"].items()), [("/s", os.path.join(box.checkouts["test"], "scripts"))])
        self.assertEqual([event["args"] for event in box.events("ctl") if event["words"] == "purge-snapshots"],
                         [["purge-snapshots", "--older-than-days", "0"]])

    def test_a_checkout_on_a_feature_branch_is_deployed_with_a_warning(self):
        # The first test stand is brought up from the work branch, before develop holds the service.
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(branch="feature/hosted-service", empty=[0])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 0, done)
        self.assertIn("WARNING: %s is on 'feature/hosted-service', not on develop" % box.checkouts["test"], done.lines)
        self.assertEqual(done.last, "money-test: OK - deployed and seeded with the fabricated studio.")
        self.assertEqual(len(box.events("git-pull")), 1)

    def test_a_stand_that_holds_data_is_not_reseeded_unless_asked(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(empty=[1])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 0, done)
        self.assertTrue(done.last.startswith("money-test: OK - deployed. The stand holds data and was not reseeded"))
        self.assertEqual(box.events("seed"), [])
        done = box.run(box.script("test", "money-deploy-test"), "--reseed")
        self.assertEqual(done.last, "money-test: OK - deployed and seeded with the fabricated studio.")
        self.assertEqual(len(box.events("seed")), 2)

    def test_a_night_that_failed_is_said_above_the_verdict(self):
        # review-deploy/reseed-fails-or-hangs-unseen
        for failed, enabled, words in (
                (["money-test-reseed.service"], ["money-test-reseed.timer"], "the last nightly reseed of the test stand FAILED"),
                ([], [], "money-test-reseed.timer is not switched on")):
            for empty in (0, 1):
                with self.subTest(words=words, empty=empty):
                    box = self.sandbox()
                    box.make_data_dir("test")
                    box.plan(empty=[empty], failed_units=failed, enabled_units=enabled)
                    done = box.run(box.script("test", "money-deploy-test"))
                    self.assertEqual(done.status, 0, done)
                    self.assertTrue(done.lines[-2].startswith("WARNING: ") and words in done.lines[-2], done)
                    self.assertTrue(done.last.startswith("money-test: OK - "), done)
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(empty=[1])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual([line for line in done.lines if "nightly" in line or "switched on" in line], [],
                         "a good night is not spoken about")

    def test_without_the_marker_no_backup_is_taken_and_the_night_is_asked_about_as_before(self):
        # The promise to CI's rehearsal and to a stand of fabricated data: nothing of the lock is seen.
        for empty, last in ((0, "money-test: OK - deployed and seeded with the fabricated studio."),
                            (1, "money-test: OK - deployed. The stand holds data and was not reseeded (--reseed does that on purpose).")):
            with self.subTest(empty=empty):
                box = self.sandbox()
                box.make_data_dir("test")
                box.plan(empty=[empty])
                done = box.run(box.script("test", "money-deploy-test"))
                self.assertEqual((done.status, done.last), (0, last), done)
                self.assertEqual(box.backups(), [], "a stand of fabricated data was backed up")
                self.assertEqual(box.calls(r"^systemctl"), ["systemctl is-failed --quiet money-test-reseed.service",
                                                           "systemctl is-enabled --quiet money-test-reseed.timer"])
                self.assertEqual([line for line in done.lines + done.err.splitlines()
                                  if re.search(r"REAL_DATA|real data|real documents|money-backup", line, re.I)], [])
                self.assertEqual([event["words"] for event in box.events("ctl") if event["words"] == "empty"], ["empty"])

    def test_reseed_is_refused_on_a_stand_that_holds_real_documents_before_anything_is_touched(self):
        for content in ("the real ledger, since 8 October 2026\n", ""):
            with self.subTest(content=content):
                box = self.sandbox()
                box.make_data_dir("test")
                marker = box.mark_real(content=content)
                box.container("test", box.image("money-test:1.0.0"))
                before = box.state()
                done = box.run(box.script("test", "money-deploy-test"), "--reseed")
                self.assertEqual(done.status, 1, done)
                self.assertEqual(done.lines, [
                    "money-test: FAILED - --reseed is refused: %s is there, so the test stand holds real documents, "
                    "and a reseed would replace them with the fabricated studio. Nothing was deployed." % marker])
                self.assertEqual(box.calls(), [], "docker, git, flock or systemctl was called")
                self.assertEqual(box.state(), before)
                self.assertEqual(box.backups(), [])
                self.assertEqual(os.listdir(os.path.join(box.home, "run", "lock")), [], "not even the lock was taken")
                self.assertEqual(read(marker), content)

    def test_a_stand_that_holds_real_documents_is_backed_up_first_and_never_seeded(self):
        box = self.sandbox()
        stand = Stand(box.make_data_dir("test"), Clock("2026-10-08T09:00:00"))
        stand.save("ledger", 0, 3)
        write(os.path.join(stand.data, "STAND"), "test\n")
        marker = box.mark_real()
        # Were it asked, the stand would call itself empty - and an empty stand is what a deploy seeds.
        box.plan(empty=[0], enabled_units=["money-backup-test.timer"])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual(done.last, "money-test: OK - deployed. The stand holds real data (%s is there): nothing was "
                                    "seeded." % marker)
        # the backup: one tarball of the test stand, the marker in it, and it was written before the code moved
        (name,) = box.backups()
        self.assertRegex(name, r"^money-test-20\d{6}T\d{6}Z\.tar\.gz$")
        tarball = os.path.join(box.home, "var", "backups", "money", name)
        listed = subprocess.run(["tar", "-tzf", tarball], stdout=subprocess.PIPE, check=True).stdout.decode("utf-8").split()
        for inside in ("./REAL_DATA", "./STAND", "./ledger/current.json"):
            self.assertIn(inside, listed)
        said = [line.split(" (")[0] for line in done.lines]
        self.assertLess(said.index(tarball), said.index("abcdef0 A Verdict Phrase in the Style of the Times"),
                        "the backup came after the pull")
        self.assertLess(os.stat(tarball).st_mtime_ns, os.stat(os.path.join(box.state_dir, "calls.log")).st_mtime_ns)
        self.assertEqual(len(box.events("git-pull")), 1)
        self.assertEqual(len(box.events("up")), 1)
        # never seeded: the stand was not even asked whether it is empty
        self.assertEqual(box.events("seed"), [])
        self.assertEqual([event["image"] for event in box.events("run")], [], "the generator ran")
        self.assertEqual([event["words"] for event in box.events("ctl")], ["selfcheck"])
        self.assertEqual([line for line in done.lines if line.startswith("WARNING")], [])
        self.assertEqual(stand.stores["ledger"].revision(), 1)
        self.assertTrue(os.path.exists(marker))

    def test_a_backup_that_fails_stops_the_deploy_of_a_stand_that_holds_real_documents(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.mark_real()
        cid = box.container("test", box.image("money-test:1.0.0"))
        # Something lies where the backups go: the directory cannot be made.
        write(os.path.join(box.home, "var", "backups", "money"), "not a directory\n")
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 1, done)
        self.assertEqual(done.last, "money-test: FAILED - the backup failed, so nothing was deployed.")
        self.assertEqual(box.calls(r"^git"), [])
        self.assertUntouched(box, done)
        self.assertEqual(box.state()["containers"][cid]["status"], "running")
        # the same when tar itself fails: no file that looks like a backup, and no deploy
        box = self.sandbox()
        box.make_data_dir("test")
        box.mark_real()
        box.plan(pack=[2])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 1, done)
        self.assertIn("money-backup: tar failed with status 2. NO BACKUP WAS WRITTEN.", done.err)
        self.assertEqual(done.last, "money-test: FAILED - the backup failed, so nothing was deployed.")
        self.assertEqual(box.backups(), [])
        self.assertUntouched(box, done)

    def test_on_a_stand_that_holds_real_documents_the_warnings_are_turned_round(self):
        night_on = ("WARNING: money-test-reseed.timer IS SWITCHED ON, and this stand holds REAL data. money-seed-test "
                    "refuses the night, but the timer must be off. Switch it off now: systemctl disable --now "
                    "money-test-reseed.timer")
        no_backup = ("WARNING: money-backup-test.timer is not switched on, so no night backs up the real data of this "
                     "stand: systemctl enable --now money-backup-test.timer (its units are linked first: docs/deploy.md, "
                     "the test stand's data)")
        for what, plan, warnings in (
                ("the night is off and the backup is on", dict(enabled_units=["money-backup-test.timer"]), []),
                ("the last reseed failed, long ago", dict(enabled_units=["money-backup-test.timer"],
                                                         failed_units=["money-test-reseed.service"]), []),
                ("no timer is on", dict(enabled_units=[]), [no_backup]),
                ("the night is enabled", dict(enabled_units=["money-test-reseed.timer", "money-backup-test.timer"]), [night_on]),
                ("the night was started by hand", dict(enabled_units=["money-backup-test.timer"],
                                                       active_units=["money-test-reseed.timer"]), [night_on]),
                ("the night is on and the backup is off", dict(enabled_units=["money-test-reseed.timer"]), [night_on, no_backup])):
            with self.subTest(what=what):
                box = self.sandbox()
                box.make_data_dir("test")
                box.mark_real()
                box.plan(**plan)
                done = box.run(box.script("test", "money-deploy-test"))
                self.assertEqual(done.status, 0, done)
                self.assertEqual([line for line in done.lines if line.startswith("WARNING")], warnings)
                self.assertEqual(done.lines[-1 - len(warnings):-1], warnings, "the warnings stand right above the verdict")
                self.assertTrue(done.last.startswith("money-test: OK - deployed. The stand holds real data ("), done)
                self.assertEqual([line for line in done.lines if "nightly reseed" in line or "fabricated studio" in line], [],
                                 "a night that did not reseed is not spoken about")
                self.assertEqual(box.calls(r"^systemctl is-failed"), [])

    def test_a_refused_policy_setting_stops_a_test_deploy_before_the_pull(self):
        box = self.sandbox()
        box.make_data_dir("test")
        done = box.run(box.script("test", "money-deploy-test"), env={"MONEY_CSP": "reportonly"})
        self.assertEqual(done.status, 1, done)
        self.assertVerdict(done, "test", "FAILED", "must be enforce or report-only", "Nothing was changed.")
        self.assertEqual(box.calls(r"^git"), [])

    def test_a_checkout_that_does_not_fast_forward_deploys_nothing(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.plan(pull=[1])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.last, "money-test: FAILED - the checkout did not fast-forward. Nothing was deployed.")
        self.assertEqual(box.events("build"), [])

    def test_without_the_generator_the_deploy_succeeds_and_says_it_did_not_seed(self):
        box = self.sandbox()
        box.make_data_dir("test")
        os.unlink(os.path.join(box.checkouts["test"], "scripts", "money-demo.mjs"))
        box.plan(empty=[0])
        done = box.run(box.script("test", "money-deploy-test"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual(done.last, "money-test: OK - deployed, but NOT seeded: the generator of the fabricated studio is absent.")


# ---------------------------------------------------------------------------
# deploy/bin/money-seed-test
# ---------------------------------------------------------------------------

class SeedTests(DeployCase):
    def seeded_stand(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"))
        return box

    def test_after_a_reseed_no_snapshot_is_left(self):
        # review-store/test-data-outlives-a-day: the seed's own save keeps what it replaces as the day's
        # copy, so every copy goes - "older than two days" left that one for three nights.
        box = self.seeded_stand()
        done = box.run(box.script("test", "money-seed-test"))
        self.assertEqual(done.status, 0, done)
        words = [event["args"] for event in box.events("ctl")]
        self.assertEqual(words, [["seed", "ledger", "--fresh"], ["seed", "plan", "--fresh"],
                                 ["purge-snapshots", "--older-than-days", "0"]])
        self.assertRegex(done.last, r"^money-test: seeded with the fabricated studio as of 20\d\d-\d\d-\d\d; every snapshot purged$")
        self.assertEqual(os.listdir(os.path.join(box.home, "tmp")), [], "the generated documents were left behind")

    def test_the_real_store_keeps_nothing_of_what_a_seed_replaced_once_every_snapshot_is_purged(self):
        # The same on the real store: a "statement" typed on test, the night's seed, the purge of the night.
        data = tempfile.mkdtemp(prefix="money-deploy-")
        self.addCleanup(shutil.rmtree, data, True)
        clock = Clock("2026-10-05T00:11:00")
        store.prepare_data_dir(data, "test")
        ledger = store.DocStore(data, "ledger", clock)
        ledger.save(0, json.dumps({"tx": []}), "ctl")
        ledger.save(1, json.dumps({"tx": [{"note": "A REAL STATEMENT"}]}), "vanya")
        clock.set("2026-10-06T00:10:00")
        ledger.save(2, json.dumps({"tx": []}), "ctl")                       # the night's seed

        def copies():
            found = []
            for name in os.listdir(os.path.join(data, "ledger", "snapshots")):
                with gzip.open(os.path.join(data, "ledger", "snapshots", name), "rb") as handle:
                    if b"A REAL STATEMENT" in handle.read():
                        found.append(name)
            return found
        self.assertEqual(copies(), ["day-2026-10-06-rev000002.json.gz"], "the seed keeps what it replaced as the day's copy")
        self.assertEqual(ledger.purge(2, "test"), 0, "which a purge of two days leaves where it is")
        self.assertEqual(copies(), ["day-2026-10-06-rev000002.json.gz"])
        self.assertEqual(ledger.purge(0, "test"), len(ledger.snapshots()) or 2)
        self.assertEqual(copies(), [])
        self.assertNotIn("A REAL STATEMENT", ledger.read().body.decode("utf-8"))

    def test_a_stand_that_holds_real_documents_is_refused_before_anything_is_generated(self):
        for how in ("a file with words", "an empty file", "a link to nowhere"):
            with self.subTest(marker=how):
                box = self.seeded_stand()
                marker = os.path.join(box.data("test"), "REAL_DATA")
                if how == "a link to nowhere":
                    os.symlink(os.path.join(box.data("test"), "no-such-file"), marker)
                else:
                    self.assertEqual(box.mark_real(content="" if how == "an empty file" else "real\n"), marker)
                before = box.state()
                done = box.run(box.script("test", "money-seed-test"))
                self.assertEqual((done.status, done.out), (4, ""), done)
                self.assertEqual(done.err, "money-seed-test: REFUSED - %s is there: the test stand holds real documents. "
                                           "Nothing was generated, nothing was seeded and no snapshot was purged.\n" % marker)
                self.assertEqual(box.calls(), [], "docker or flock was called")
                self.assertEqual(box.state(), before, "the generator ran, or the stand was asked")
                self.assertEqual(os.listdir(os.path.join(box.home, "tmp")), [])
                self.assertTrue(os.path.lexists(marker))
        # the same for a deploy that holds the lock, and before the missing generator is noticed
        box = self.seeded_stand()
        marker = box.mark_real()
        os.unlink(os.path.join(box.checkouts["test"], "scripts", "money-demo.mjs"))
        done = box.run(box.script("test", "money-seed-test"), env={"MONEY_DEPLOY_LOCK_HELD": "1"})
        self.assertEqual((done.status, box.calls()), (4, []), done)
        # the marker gone, the night is what it was
        box = self.seeded_stand()
        os.unlink(box.mark_real())
        done = box.run(box.script("test", "money-seed-test"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual(len(box.events("seed")), 2)

    def test_a_seed_the_stand_refuses_is_tried_once_more(self):
        box = self.seeded_stand()
        box.plan(seed=[1])
        done = box.run(box.script("test", "money-seed-test"))
        self.assertEqual(done.status, 0, done)
        self.assertEqual([event["kind"] for event in box.events("seed")], ["ledger", "ledger", "plan"])
        self.assertIn("trying once more", done.err)

    def test_a_seed_refused_twice_fails_and_says_so(self):
        box = self.seeded_stand()
        box.plan(seed=[1, 1])
        done = box.run(box.script("test", "money-seed-test"))
        self.assertEqual(done.status, 1, done)
        self.assertIn("money-seed-test: the stand did not take the ledger", done.err)
        self.assertEqual([event for event in box.events("ctl") if event["words"] == "purge-snapshots"], [])

    def test_a_generator_that_fails_leaves_the_stand_as_it_was(self):
        box = self.seeded_stand()
        box.plan(generator=[0, 1])
        done = box.run(box.script("test", "money-seed-test"))
        self.assertEqual(done.status, 1, done)
        self.assertIn("the generator failed on the plan. Nothing was seeded.", done.err)
        self.assertEqual(box.events("seed"), [])

    def test_without_the_generator_it_ends_with_status_3(self):
        box = self.seeded_stand()
        os.unlink(os.path.join(box.checkouts["test"], "scripts", "money-demo.mjs"))
        self.assertEqual(box.run(box.script("test", "money-seed-test")).status, 3)

    def test_a_signal_removes_the_generated_documents(self):
        # review-deploy/no-cleanup-on-signals: dash runs an EXIT trap only when the script ends by itself.
        for number, status in ((signal.SIGINT, 130), (signal.SIGTERM, 143), (signal.SIGHUP, 129)):
            with self.subTest(signal=number):
                box = self.seeded_stand()
                box.plan(block="seed")
                process = box.start(box.script("test", "money-seed-test"))
                self.assertTrue(box.blocked(process), "the seed was never reached")
                self.assertEqual(len(os.listdir(os.path.join(box.home, "tmp"))), 1)
                done = box.signalled(process, number)
                self.assertEqual(done.status, status, done)
                self.assertEqual(os.listdir(os.path.join(box.home, "tmp")), [], "the work directory was left behind")


class WrapperTests(DeployCase):
    """deploy/bin/money-user and the words at login."""

    def stand(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.container("test", box.image("money-test:1.0.0"))
        return box

    def test_money_user_hands_each_word_to_ctl(self):
        box = self.stand()
        for words, wanted in ((["list"], ["user", "list"]), (["disable", "vanya"], ["user", "disable", "vanya"]),
                              (["retire-links"], ["user", "retire-links"]), (["sessions"], ["sessions", "list"]),
                              (["logout", "--all"], ["sessions", "logout", "--all"]),
                              (["user", "retire-links"], ["user", "retire-links"])):
            with self.subTest(words=words):
                done = box.run(box.script("test", "money-user"), "test", *words)
                self.assertEqual(done.status, 0, done)
                self.assertEqual(box.events("ctl")[-1]["args"], wanted)

    def test_an_invite_without_a_terminal_is_refused_before_ctl_is_asked(self):
        box = self.stand()
        for words in (["invite", "mika"], ["user", "invite", "mika"]):
            done = box.run(box.script("test", "money-user"), "test", *words)
            self.assertEqual(done.status, 1, done)
            self.assertIn("shows it to a terminal only", done.err)
        self.assertEqual(box.events("ctl"), [])
        self.assertEqual(box.run(box.script("test", "money-user"), "test", "retire-links", "now").status, 2)

    def test_the_words_at_login_speak_only_of_a_night_that_went_wrong(self):
        # review-deploy/reseed-fails-or-hangs-unseen
        box = self.stand()
        motd = os.path.join(box.checkouts["test"], "deploy", "motd", "97-money-test-reseed")
        self.assertEqual(box.run(motd).out, "", "a good night is not spoken about")
        box.plan(failed_units=["money-test-reseed.service"])
        done = box.run(motd)
        self.assertEqual(done.status, 0, done)
        self.assertIn("The last nightly reseed of Money (test) FAILED.", done.out)
        self.assertIn("journalctl -u money-test-reseed -n 30 --no-pager", done.out)
        box.plan(failed_units=[], enabled_units=[])
        self.assertIn("The nightly reseed of Money (test) is not switched on.", box.run(motd).out)
        # and nothing at all on a machine where the test stand was never set up
        shutil.rmtree(box.data("test"))
        box.plan(failed_units=["money-test-reseed.service"])
        self.assertEqual(box.run(motd).out, "")

    def test_with_real_documents_on_the_stand_the_words_at_login_say_so_and_nothing_about_the_night(self):
        box = self.stand()
        marker = box.mark_real()
        motd = os.path.join(box.checkouts["test"], "deploy", "motd", "97-money-test-reseed")
        for plan in (dict(), dict(failed_units=["money-test-reseed.service"]), dict(failed_units=[], enabled_units=[])):
            with self.subTest(plan=plan):
                box.plan(**plan)
                done = box.run(motd)
                self.assertEqual((done.status, done.err), (0, ""), done)
                self.assertEqual(len(done.lines), 1, done)
                self.assertIn("Money (test) holds REAL data", done.last)
                self.assertIn("(%s)" % marker, done.last)
                self.assertNotIn("FAILED", done.out)
                self.assertNotIn("not switched on", done.out)
                self.assertNotIn("journalctl", done.out)
        self.assertEqual(box.calls(r"^systemctl"), [], "the night was asked about")
        # the marker gone, the words are about the night again
        os.unlink(marker)
        self.assertIn("The nightly reseed of Money (test) is not switched on.", box.run(motd).out)

    def test_the_reseed_unit_cannot_hold_the_deploy_lock_all_night(self):
        unit = read(os.path.join(ROOT, "deploy", "systemd", "money-test-reseed.service"))
        self.assertRegex(unit, r"(?m)^TimeoutStartSec=15min$")
        self.assertRegex(unit, r"(?m)^Type=oneshot$")


class Clock(object):
    """A clock a test sets: ``Clock("2026-10-06T22:00:00")`` is called like ``config.utcnow``."""

    def __init__(self, text):
        self.set(text)

    def set(self, text):
        self.now = datetime.datetime.strptime(text, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)

    def __call__(self):
        self.now += datetime.timedelta(seconds=1)       # no two moments are the same
        return self.now


# ---------------------------------------------------------------------------
# deploy/bin/money-smoke, against the real service
# ---------------------------------------------------------------------------

def free_port():
    probe = socket.socket()
    try:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]
    finally:
        probe.close()


class SmokeTests(DeployCase):
    """The real ``money-smoke`` and the real ``curl`` against a real ``python -m moneyd`` (a dev stand)."""

    def serve(self, box, trusted):
        """Start the service; the sandbox's test stand file points at it, and `logs` shows what it says."""
        port = free_port()
        data = os.path.join(box.home, "served")
        os.makedirs(data, 0o700)
        said = os.path.join(box.state_dir, "served.log")
        environ = {"PATH": REAL_PATH, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1", "MONEY_STAND": "dev",
                   "MONEY_BIND": "127.0.0.1:%d" % port, "MONEY_PUBLIC_URL": "http://finance.localhost:%d" % port,
                   "MONEY_DATA_DIR": data, "MONEY_WEB_DIR": ROOT, "MONEY_FOUNDERS": FOUNDERS,
                   "MONEY_TRUSTED_PROXIES": trusted}
        with open(said, "wb") as out:
            process = subprocess.Popen([sys.executable, "-B", "-m", "moneyd"], cwd=ROOT, env=environ,
                                       stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT)
        self.addCleanup(self.stop, process)
        path = os.path.join(box.checkouts["test"], "deploy", "stands", "test.env")
        text = read(path).replace("MONEY_PORT=5192", "MONEY_PORT=%d" % port).replace(
            "MONEY_PUBLIC_URL=https://finance.test.selfstudio.se", "MONEY_PUBLIC_URL=http://finance.localhost:%d" % port)
        write(path, text)
        box.container("test", box.image("money-test:1.0.0"))
        box.plan(logs_from=said)
        end = time.time() + 30
        while time.time() < end:
            if process.poll() is not None:
                self.fail("moneyd did not start: %s" % read(said))
            try:
                socket.create_connection(("127.0.0.1", port), 0.5).close()
                return port
            except OSError:
                time.sleep(0.1)
        self.fail("moneyd did not answer within 30 s: %s" % read(said))

    @staticmethod
    def stop(process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    def test_the_stand_holds_its_refusals_and_believes_the_proxy_about_the_address(self):
        for shell in SHELLS:
            with self.subTest(shell=shell):
                box = self.sandbox(smoke="real")
                port = self.serve(box, "127.0.0.0/8")
                done = box.run(box.script("test", "money-smoke"), "test", shell=shell)
                self.assertEqual(done.status, 0, done)
                self.assertEqual(done.last, "money-smoke test: all 15 checks passed on http://127.0.0.1:%d "
                                            "(Host: finance.localhost:%d)" % (port, port))
                self.assertIn("ok    the stand counts a visitor by the address the proxy names in X-Forwarded-For",
                              done.lines)
                self.assertEqual([line for line in done.lines if line.startswith("FAIL")], [])
                self.assertEqual(os.listdir(os.path.join(box.home, "tmp")), [])

    def test_a_stand_that_does_not_believe_the_proxy_fails_the_smoke(self):
        # review-deploy/smoke-does-not-prove-proxy-trust: the Docker network is outside
        # MONEY_TRUSTED_PROXIES, so every visitor is counted as the bridge's own address.
        box = self.sandbox(smoke="real")
        port = self.serve(box, "10.99.0.0/16")
        done = box.run(box.script("test", "money-smoke"), "test")
        self.assertEqual(done.status, 1, done)
        self.assertEqual(done.last, "money-smoke test: 1 of 15 checks FAILED on http://127.0.0.1:%d "
                                    "(Host: finance.localhost:%d)" % (port, port))
        self.assertIn("FAIL  the stand counts a visitor by the address the proxy names in X-Forwarded-For", done.lines)
        self.assertIn("it counted 127.0.0.1, not 192.0.2.10: the stand does not believe X-Forwarded-For from the host. "
                      "Check MONEY_TRUSTED_PROXIES", done.out)

    def test_a_log_that_cannot_be_read_is_not_taken_for_proof(self):
        box = self.sandbox(smoke="real")
        self.serve(box, "127.0.0.0/8")
        box.plan(**{"compose-logs": 1})
        done = box.run(box.script("test", "money-smoke"), "test")
        self.assertEqual(done.status, 1, done)
        self.assertIn("is not in the stand's log", done.out)
        self.assertIn("1 of 15 checks FAILED", done.last)

    def test_the_line_has_to_be_this_runs_own(self):
        # An earlier smoke's lines in the log prove nothing about the stand as it is now.
        box = self.sandbox(smoke="real")
        self.serve(box, "10.99.0.0/16")
        with open(os.path.join(box.state_dir, "served.log"), "ab") as handle:
            handle.write(b'{"t":"2026-10-07T10:00:00.000Z","rid":"aa","method":"GET","path":"/api/smoke-1-000000",'
                         b'"status":401,"bytes":60,"ms":0.4,"addr":"192.0.2.10","login":null}\n')
        done = box.run(box.script("test", "money-smoke"), "test")
        self.assertEqual(done.status, 1, done)
        self.assertIn("does not believe X-Forwarded-For", done.out)

    def test_nothing_answering_is_said_in_one_line(self):
        box = self.sandbox(smoke="real")
        done = box.run(box.script("test", "money-smoke"), "test")
        self.assertEqual(done.status, 1, done)
        self.assertIn("money-smoke test: nothing answers on http://127.0.0.1:5192", done.err)
        self.assertEqual(os.listdir(os.path.join(box.home, "tmp")), [])

    def test_a_signal_removes_the_work_directory(self):
        # A port that takes the connection and never answers: curl waits, and the signal finds the script there.
        for number, status in ((signal.SIGINT, 130), (signal.SIGTERM, 143), (signal.SIGHUP, 129)):
            with self.subTest(signal=number):
                silent = socket.socket()
                self.addCleanup(silent.close)
                silent.bind(("127.0.0.1", 0))
                silent.listen(5)
                box = self.sandbox(smoke="real")
                path = os.path.join(box.checkouts["test"], "deploy", "stands", "test.env")
                write(path, read(path).replace("MONEY_PORT=5192", "MONEY_PORT=%d" % silent.getsockname()[1]))
                process = box.start(box.script("test", "money-smoke"), "test")
                work = os.path.join(box.home, "tmp")
                end = time.time() + 20
                while time.time() < end and not (os.listdir(work) and os.listdir(os.path.join(work, os.listdir(work)[0]))):
                    time.sleep(0.05)
                self.assertEqual(len(os.listdir(work)), 1, "the smoke never began")
                time.sleep(0.3)
                done = box.signalled(process, number)
                self.assertEqual(done.status, status, done)
                self.assertEqual(os.listdir(work), [], "the work directory was left behind")
                silent.close()


# ---------------------------------------------------------------------------
# A stand's data, made by the real store and the real accounts
# ---------------------------------------------------------------------------

PASSWORD = "Zx9!vT4#qLm2@Rb7-chosen"


class Stand(object):
    """A data directory as the service leaves it: made by ``moneyd.store`` and ``moneyd.auth`` themselves.

    It is worked on as a dev stand (the Mac's Python has no scrypt, and prod hashes with nothing
    else) and carries prod's ``STAND`` marker, which is what the commands under test look at.
    """

    def __init__(self, data, clock, fresh=True):
        self.data = data
        self.clock = clock
        environ = {"MONEY_STAND": "dev", "MONEY_PUBLIC_URL": "http://finance.localhost:8099",
                   "MONEY_BIND": "127.0.0.1:8099", "MONEY_DATA_DIR": data, "MONEY_WEB_DIR": ROOT,
                   "MONEY_FOUNDERS": FOUNDERS, "MONEY_KDF": "pbkdf2"}
        self.settings = config.Settings.from_env(environ, clock)
        if fresh:
            store.prepare_data_dir(data, "dev")
        self.security = log.SecurityLog(data, clock)
        self.auth = auth.Auth(self.settings, clock, self.security)
        if fresh:
            self.auth.boot()
            write(os.path.join(data, "STAND"), "prod\n")
        self.stores = store.open_stores(self.settings, clock, self.security)

    def save(self, kind, base, rows):
        member = "tx" if kind == "ledger" else "banks"
        return self.stores[kind].save(base, json.dumps({member: [{"n": n} for n in range(rows)]}), "mika").rev

    def invite(self, login):
        link, _expires = self.auth.issue_invite(login, by="ctl")
        return link.split("#t=", 1)[1]

    def users(self):
        return {user.login: user for user in self.auth.users.list()}

    def events(self):
        return [entry["event"] for entry in self.security.tail(200)]


class BackupTests(DeployCase):
    def test_a_backup_is_a_closed_tarball_of_everything_but_the_sessions(self):
        box = self.sandbox()
        stand = Stand(box.make_data_dir("prod"), Clock("2026-10-06T22:00:00"))
        stand.save("ledger", 0, 3)
        stand.stores["plan"].raise_floor(7, "ctl")                           # leaves NEVER_SAVED beside EVER_SAVED
        token = stand.invite("vanya")
        stand.auth.set_password(token, PASSWORD, "203.0.113.5")            # leaves a session
        write(os.path.join(stand.data, "ledger", "current.json.tmp-1234"), "half a write")
        done = box.run(box.script("prod", "money-backup"))
        self.assertEqual(done.status, 0, done)
        backups = os.path.join(box.home, "var", "backups", "money")
        names = os.listdir(backups)
        self.assertEqual(len(names), 1, names)
        self.assertRegex(names[0], r"^money-prod-20\d{6}T\d{6}Z\.tar\.gz$")
        self.assertEqual(stat.S_IMODE(os.stat(backups).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(backups, names[0])).st_mode), 0o600)
        listed = subprocess.run(["tar", "-tzf", os.path.join(backups, names[0])], stdout=subprocess.PIPE,
                                check=True).stdout.decode("utf-8").split()
        for name in ("./STAND", "./ledger/current.json", "./ledger/EVER_SAVED", "./plan/EVER_SAVED",
                     "./plan/NEVER_SAVED", "./auth/users.json", "./auth/USERS_WRITTEN", "./security.log"):
            self.assertIn(name, listed)
        self.assertTrue(os.path.exists(os.path.join(stand.data, "auth", "sessions.json")))
        self.assertEqual([name for name in listed if "/sessions.json" in name or ".tmp-" in name], [])

    def test_no_argument_and_prod_are_the_same_backup(self):
        box = self.sandbox()
        Stand(box.make_data_dir("prod"), Clock("2026-10-06T22:00:00")).save("ledger", 0, 3)
        Stand(box.make_data_dir("test"), Clock("2026-10-06T22:00:00")).save("ledger", 0, 3)
        box.mark_real("test")
        backups = os.path.join(box.home, "var", "backups", "money")
        for arguments in ((), ("prod",)):
            with self.subTest(arguments=arguments):
                before = box.backups()
                done = box.run(box.script("prod", "money-backup"), *arguments)
                self.assertEqual((done.status, done.err), (0, ""), done)
                (new,) = set(box.backups()) - set(before) or (box.backups()[-1],)
                self.assertRegex(new, r"^money-prod-20\d{6}T\d{6}Z\.tar\.gz$")
                self.assertRegex(done.out, r"^%s \([^()\n]+\)\n$" % re.escape(os.path.join(backups, new)))
                listed = subprocess.run(["tar", "-tzf", os.path.join(backups, new)], stdout=subprocess.PIPE,
                                        check=True).stdout.decode("utf-8").split()
                self.assertIn("./ledger/current.json", listed)
                self.assertNotIn("./REAL_DATA", listed, "it is prod's directory that was packed")
        self.assertEqual(box.backups("test"), [], "a backup of prod wrote one of test")
        # and the words of prod's refusals are what they were
        shutil.rmtree(box.data("prod"))
        done = box.run(box.script("prod", "money-backup"))
        self.assertEqual((done.status, done.out), (1, ""), done)
        self.assertEqual(done.err, "money-backup: no data directory %s: is the prod stand set up on this machine?\n"
                         % box.data("prod"))
        os.makedirs(box.data("prod"))
        done = box.run(box.script("prod", "money-backup"))
        self.assertEqual((done.status, done.err), (0, ""), done)
        self.assertEqual(done.out, "money-backup: %s is empty, so there is nothing to back up yet\n" % box.data("prod"))

    def test_the_test_stand_is_backed_up_only_while_it_holds_real_documents(self):
        box = self.sandbox()
        stand = Stand(box.make_data_dir("test"), Clock("2026-10-08T09:00:00"))
        write(os.path.join(stand.data, "STAND"), "test\n")
        stand.save("ledger", 0, 3)
        token = stand.invite("vanya")
        stand.auth.set_password(token, PASSWORD, "203.0.113.5")            # leaves a session
        write(os.path.join(stand.data, "ledger", "current.json.tmp-1234"), "half a write")
        marker = os.path.join(stand.data, "REAL_DATA")
        # The fabricated studio: nothing to keep, nothing written - not even the directory - and no failure.
        done = box.run(box.script("test", "money-backup"), "test")
        self.assertEqual((done.status, done.err), (0, ""), done)
        self.assertEqual(done.out, "money-backup: the test stand holds the fabricated studio (%s is not there), so there "
                                   "is nothing to keep\n" % marker)
        self.assertFalse(os.path.exists(os.path.join(box.home, "var", "backups", "money")))
        # Real documents: the same tarball prod gets, under the test stand's name.
        self.assertEqual(box.mark_real(), marker)
        done = box.run(box.script("test", "money-backup"), "test")
        self.assertEqual((done.status, done.err), (0, ""), done)
        backups = os.path.join(box.home, "var", "backups", "money")
        (name,) = os.listdir(backups)
        self.assertRegex(name, r"^money-test-20\d{6}T\d{6}Z\.tar\.gz$")
        self.assertRegex(done.out, r"^%s \([^()\n]+\)\n$" % re.escape(os.path.join(backups, name)))
        self.assertEqual(stat.S_IMODE(os.stat(backups).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(backups, name)).st_mode), 0o600)
        listed = subprocess.run(["tar", "-tzf", os.path.join(backups, name)], stdout=subprocess.PIPE,
                                check=True).stdout.decode("utf-8").split()
        for inside in ("./REAL_DATA", "./STAND", "./ledger/current.json", "./ledger/EVER_SAVED", "./auth/users.json",
                       "./auth/USERS_WRITTEN", "./security.log"):
            self.assertIn(inside, listed)
        self.assertTrue(os.path.exists(os.path.join(stand.data, "auth", "sessions.json")))
        self.assertEqual([inside for inside in listed if "/sessions.json" in inside or ".tmp-" in inside], [])
        # It works from prod's checkout as well: the command a person finds in /usr/local/bin is prod's.
        os.unlink(os.path.join(backups, name))
        done = box.run(box.script("prod", "money-backup"), "test")
        self.assertEqual((done.status, len(box.backups("test")), box.backups("prod")), (0, 1, []), done)
        # money-restore puts back prod's tarballs only: this one it refuses.
        refused = box.run(box.script("prod", "money-restore"), os.path.join(backups, box.backups("test")[0]), stdin="prod\n")
        self.assertEqual(refused.status, 1, refused)
        self.assertIn("is not a backup of the prod stand (its STAND marker says 'test')", refused.err)

    def test_an_empty_test_directory_with_nothing_but_the_marker_is_still_a_backup(self):
        # A person may mark the stand before the first upload: the marker itself is then what is kept.
        box = self.sandbox()
        box.make_data_dir("test")
        self.assertEqual(box.run(box.script("test", "money-backup"), "test").status, 0)
        self.assertEqual(box.backups(), [])
        box.mark_real()
        done = box.run(box.script("test", "money-backup"), "test")
        self.assertEqual((done.status, len(box.backups("test"))), (0, 1), done)
        # and a test stand that was never set up is an error, as for prod
        shutil.rmtree(box.data("test"))
        done = box.run(box.script("test", "money-backup"), "test")
        self.assertEqual((done.status, done.out), (1, ""), done)
        self.assertEqual(done.err, "money-backup: no data directory %s: is the test stand set up on this machine?\n"
                         % box.data("test"))

    def test_a_wrong_argument_is_a_usage_line_and_status_2_and_nothing_is_written(self):
        box = self.sandbox()
        Stand(box.make_data_dir("prod"), Clock("2026-10-06T22:00:00")).save("ledger", 0, 3)
        box.make_data_dir("test")
        box.mark_real()
        for arguments in (("staging",), ("dev",), ("--test",), ("TEST",), ("",), ("prod", "test"), ("test", "now"),
                          ("/var/lib/money/test",)):
            with self.subTest(arguments=arguments):
                done = box.run(box.script("prod", "money-backup"), *arguments)
                self.assertEqual((done.status, done.out, done.err), (2, "", "usage: money-backup [prod|test]\n"), done)
        self.assertFalse(os.path.exists(os.path.join(box.home, "var", "backups", "money")))

    def test_each_stand_prunes_its_own_tarballs_and_never_the_others(self):
        box = self.sandbox()
        Stand(box.make_data_dir("prod"), Clock("2026-10-06T22:00:00")).save("ledger", 0, 3)
        box.make_data_dir("test")
        box.mark_real()
        backups = os.path.join(box.home, "var", "backups", "money")
        os.makedirs(backups, 0o700)

        def aged(name, days):
            path = os.path.join(backups, name)
            write(path, "an older run\n", 0o600)
            then = time.time() - days * 86400 - 3600
            os.utime(path, (then, then))
            return name
        old = {stand: aged("money-%s-20260901T000000Z.tar.gz" % stand, 20) for stand in ("prod", "test")}
        young = {stand: aged("money-%s-20261001T000000Z.tar.gz" % stand, 5) for stand in ("prod", "test")}
        part = {stand: aged(".money-%s-20261001T000000Z.tar.gz.part" % stand, 2) for stand in ("prod", "test")}
        stranger = aged("money-prodigal-20260901T000000Z.tar", 20)          # nobody's: not a tarball of either stand

        done = box.run(box.script("prod", "money-backup"))
        self.assertEqual(done.status, 0, done)
        left = set(os.listdir(backups))
        self.assertEqual(done.lines[1:], [os.path.join(backups, old["prod"])], "what was pruned is named, and only that")
        self.assertFalse({old["prod"], part["prod"]} & left, "prod's old tarball or half-written file stayed")
        self.assertTrue({young["prod"], old["test"], young["test"], part["test"], stranger} <= left,
                        "a backup of prod removed a file that is not prod's: %s" % sorted(left))
        self.assertEqual(len(box.backups("prod")), 2)

        done = box.run(box.script("test", "money-backup"), "test")
        self.assertEqual(done.status, 0, done)
        left = set(os.listdir(backups))
        self.assertEqual(done.lines[1:], [os.path.join(backups, old["test"])])
        self.assertFalse({old["test"], part["test"]} & left, "test's old tarball or half-written file stayed")
        self.assertTrue({young["prod"], young["test"], stranger} <= left, sorted(left))
        self.assertEqual((len(box.backups("prod")), len(box.backups("test"))), (2, 2))

        # KEEP_DAYS is each run's own as well
        done = box.run(box.script("test", "money-backup"), "test", env={"KEEP_DAYS": "3"})
        self.assertEqual(done.status, 0, done)
        self.assertNotIn(young["test"], os.listdir(backups))
        self.assertIn(young["prod"], os.listdir(backups))

    def test_an_interrupted_backup_of_the_test_stand_leaves_no_half_written_file_either(self):
        box = self.sandbox()
        box.make_data_dir("test")
        box.mark_real()
        box.plan(block="tar")
        process = box.start(box.script("test", "money-backup"), "test")
        self.assertTrue(box.blocked(process), "tar was never reached")
        backups = os.path.join(box.home, "var", "backups", "money")
        (half,) = os.listdir(backups)
        self.assertRegex(half, r"^\.money-test-20\d{6}T\d{6}Z\.tar\.gz\.part$")
        done = box.signalled(process, signal.SIGTERM)                       # what systemd sends a unit it ends
        self.assertEqual(done.status, 143, done)
        self.assertEqual(os.listdir(backups), [], "half of an archive was left behind")

    def test_an_interrupted_backup_leaves_no_half_written_file(self):
        # review-deploy/no-cleanup-on-signals, for the one file that holds the ledger and the hashes.
        for number, status in ((signal.SIGINT, 130), (signal.SIGTERM, 143), (signal.SIGHUP, 129)):
            with self.subTest(signal=number):
                box = self.sandbox()
                Stand(box.make_data_dir("prod"), Clock("2026-10-06T22:00:00")).save("ledger", 0, 3)
                box.plan(block="tar")
                process = box.start(box.script("prod", "money-backup"))
                self.assertTrue(box.blocked(process), "tar was never reached")
                backups = os.path.join(box.home, "var", "backups", "money")
                self.assertEqual(len(os.listdir(backups)), 1, "the half-written file is there while tar runs")
                done = box.signalled(process, number)
                self.assertEqual(done.status, status, done)
                self.assertEqual(os.listdir(backups), [], "half of an archive was left behind")


# ---------------------------------------------------------------------------
# deploy/bin/money-restore
# ---------------------------------------------------------------------------

class RestoreCase(DeployCase):
    """A prod stand with a history: a backup in the evening, and a morning that the backup does not hold.

    In the evening (before the backup): the ledger at revision 3, the cash plan at 1, and a one-time
    link issued for vanya and not used yet. After the backup: vanya uses the link and chooses a
    password, misha's login is disabled, and the ledger reaches revision 5 on the next day - so the
    day's copy of revision 3 lies in its snapshots. A page that was open in the morning holds
    revision 5.
    """

    def history(self, box=None):
        box = box or self.sandbox()
        self.box = box
        self.clock = Clock("2026-10-06T22:00:00")
        live = Stand(box.make_data_dir("prod"), self.clock)
        for base in range(3):
            live.save("ledger", base, 30 + base)
        live.save("plan", 0, 4)
        self.token = live.invite("vanya")
        done = box.run(box.script("prod", "money-backup"))
        self.assertEqual(done.status, 0, done)
        self.tarball = done.lines[0].split(" (")[0]
        self.assertTrue(os.path.isfile(self.tarball), done)
        # --- what the backup does not hold ---
        self.clock.set("2026-10-07T08:00:00")
        live.auth.set_password(self.token, PASSWORD, "203.0.113.5")
        live.auth.set_disabled("misha", True, by="ctl")
        live.save("ledger", 3, 33)
        live.save("ledger", 4, 34)
        self.assertEqual(live.stores["ledger"].revision(), 5)
        self.assertEqual(max(copy.rev for copy in live.stores["ledger"].snapshots()), 3, "the day's copy of revision 3")
        self.image = box.image("money-prod:1.0.0")
        self.cid = box.container("prod", self.image)
        self.live = live
        return box

    def restore(self, *args, **options):
        options.setdefault("stdin", "prod\n")
        return self.box.run(self.box.script("prod", "money-restore"), *(args or (self.tarball,)), **options)

    def restored(self):
        """The stand as it is on the disk now, read by the real store and accounts."""
        return Stand(self.box.data("prod"), self.clock, fresh=False)

    def aside(self):
        found = glob.glob(self.box.data("prod") + ".before-restore-*")
        self.assertEqual(len(found), 1, found)
        return found[0]

    def ctl_words(self):
        """Every word given to ctl, in order - but for the questions whether the image knows a word."""
        return [" ".join(event["args"]) for event in self.box.events("ctl") if "--help" not in event["args"]]

    def assertAsBefore(self, done=None):
        """Nothing of the stand has changed: the morning's data, and a container that runs."""
        after = self.restored()
        self.assertEqual(after.stores["ledger"].revision(), 5, done)
        self.assertTrue(after.users()["vanya"].has_password, done)
        self.assertTrue(after.users()["misha"].disabled, done)
        self.assertEqual(glob.glob(self.box.data("prod") + ".before-restore-*"), [], done)
        self.assertEqual(self.box.state()["containers"][self.cid]["status"], "running", done)


class RestoreTests(RestoreCase):
    def test_a_restore_keeps_the_accounts_of_the_morning_when_their_file_reads(self):
        # review-store/restore-revives-spent-links, review-deploy/restore-revives-links-and-passwords
        self.history()
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        self.assertIn("money-restore: OK - the stand runs on the data of %s and passes its self-check." % self.tarball,
                      done.lines)
        after = self.restored()
        self.assertEqual(read(os.path.join(after.data, "auth", "users.json")),
                         read(os.path.join(self.aside(), "auth", "users.json")))
        users = after.users()
        self.assertTrue(users["vanya"].has_password, "the password chosen after the backup went back in time")
        self.assertTrue(users["misha"].disabled, "a login disabled after the backup is enabled again")
        self.assertIsNone(users["vanya"].invite_expires)
        with self.assertRaises(auth.InvalidLink):
            after.auth.set_password(self.token, PASSWORD + "-again", "198.51.100.7")
        self.assertIn("the accounts are kept as they were before the restore", done.out)
        self.assertIn("Accounts: as they were before the restore", done.out)
        # what the operator is shown: the counts of what was moved aside, and who may sign in
        self.assertIn("      accounts: 3 (with a password: 1, disabled: 1, pending links: 0)", done.lines)
        self.assertTrue([line for line in done.lines if re.match(r"^misha\s+Misha\s+no: disabled", line)], done)
        self.assertNotIn("retire-links", " ".join(self.ctl_words()))
        self.assertFalse(os.path.exists(os.path.join(after.data, "auth", "sessions.json")), "everybody signs in again")

    def test_a_restore_retires_the_backups_links_when_the_accounts_of_the_morning_do_not_read(self):
        # The link was pending when the backup was taken and has been used since: in the backup's
        # accounts it is pending again, for whoever still has the message.
        self.history()
        write(os.path.join(self.live.data, "auth", "users.json"), '{"v":1,"users":{"vanya":')
        with self.assertRaises(auth.AuthDamaged):
            self.live.auth.users.list()
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        after = self.restored()
        users = after.users()
        self.assertFalse(users["vanya"].has_password, "the accounts are the backup's")
        self.assertFalse(users["misha"].disabled)
        self.assertIsNone(users["vanya"].invite_expires, "the link of the backup is pending again")
        self.assertIsNone(after.auth.invites.peek(self.token))
        with self.assertRaises(auth.InvalidLink):
            after.auth.set_password(self.token, PASSWORD + "-again", "198.51.100.7")
        self.assertIn("link-retired", after.events())
        self.assertIn("user retire-links", self.ctl_words())
        self.assertIn("vanya: its pending one-time link is retired; issue a new one with: user invite vanya", done.lines)
        self.assertIn("Accounts: the backup's", done.out)
        self.assertIn("      accounts: DAMAGED", done.lines)

    def test_without_the_retiring_the_backups_link_would_work_again(self):
        # What the two tests above are about, shown on the tarball alone: unpacked as it is, the link
        # that was used in the morning sets vanya's password a second time.
        self.history()
        scratch = tempfile.mkdtemp(prefix="money-deploy-")
        self.addCleanup(shutil.rmtree, scratch, True)
        subprocess.run(["tar", "-xzf", self.tarball, "-C", scratch], check=True)
        unpacked = Stand(scratch, self.clock, fresh=False)
        self.assertIsNotNone(unpacked.auth.invites.peek(self.token))
        self.assertEqual(unpacked.auth.set_password(self.token, PASSWORD + "-thief", "198.51.100.7").identity.login, "vanya")

    def test_a_page_left_open_from_before_the_restore_is_told_to_reload_and_never_saves_over_what_came_after(self):
        # review-store/restore-rewinds-revisions, review-deploy/restore-rewinds-revisions
        self.history()
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        self.assertIn("floor ledger 5", self.ctl_words())
        self.assertIn("floor plan 1", self.ctl_words())
        self.assertIn("money-restore: the ledger had reached revision 5 before the restore", done.lines)
        ledger = self.restored().stores["ledger"]
        self.assertEqual(ledger.revision(), 3, "the document is the backup's")
        self.assertEqual(ledger.floor(), 5)
        # the old tab, at once
        with self.assertRaises(store.Stale) as refused:
            ledger.save(5, json.dumps({"tx": [{"n": "the old tab"}]}), "vanya")
        self.assertEqual(refused.exception.rev, 3)
        # a founder reloads and works on: the count does not climb through 4 and 5 again
        self.assertEqual(ledger.save(3, json.dumps({"tx": [{"n": "after the restore"}]}), "mika").rev, 6)
        self.assertEqual(ledger.save(6, json.dumps({"tx": [{"n": "after the restore"}, {"n": 2}]}), "mika").rev, 7)
        for held in (4, 5):
            with self.assertRaises(store.Stale):
                ledger.save(held, json.dumps({"tx": [{"n": "the old tab"}]}), "vanya")
        self.assertIn("after the restore", ledger.read().body.decode("utf-8"))
        self.assertEqual(self.restored().events().count("floor-raised"), 2, "both floors leave their line")

    def test_the_floor_is_the_highest_number_any_of_the_three_places_names(self):
        # EVER_SAVED, the first bytes of current.json, the names of the snapshots - whichever is highest.
        for name, change, wanted in (
                ("the marker is ahead (a floor raised by an earlier restore)",
                 lambda data: write(os.path.join(data, "ledger", "EVER_SAVED"), "412\n"), 412),
                ("a snapshot's name is ahead, zero-padded as they are",
                 lambda data: write(os.path.join(data, "ledger", "snapshots", "restore-20261007T080000Z-rev000090.json.gz"), "x"), 90),
                ("a snapshot's name with an eight and a nine in it is not read as octal",
                 lambda data: write(os.path.join(data, "ledger", "snapshots", "shrink-20261007T080000Z-rev000089.json.gz"), "x"), 89),
                ("the document itself is ahead of its marker",
                 lambda data: write(os.path.join(data, "ledger", "EVER_SAVED"), "2\n"), 5)):
            with self.subTest(name):
                self.history()
                change(self.live.data)
                done = self.restore()
                self.assertEqual(done.status, 0, done)
                self.assertIn("floor ledger %d" % wanted, self.ctl_words())
                self.assertEqual(self.restored().stores["ledger"].floor(), wanted)

    def test_when_what_was_moved_aside_cannot_say_the_floor_goes_a_million_above_the_backup(self):
        import os as _os
        for name, change, wanted in (
                ("the ledger's directory is gone",
                 lambda data: shutil.rmtree(_os.path.join(data, "ledger")), 1000003),
                ("its marker does not read as a number",
                 lambda data: write(_os.path.join(data, "ledger", "EVER_SAVED"), "five\n"), 1000005),
                ("its marker is longer than a revision can be",
                 lambda data: write(_os.path.join(data, "ledger", "EVER_SAVED"), "9" * 16 + "\n"), 1000005),
                ("its marker is gone while the document is there",
                 lambda data: _os.unlink(_os.path.join(data, "ledger", "EVER_SAVED")), 1000005),
                ("the document is cut short",
                 lambda data: write(_os.path.join(data, "ledger", "current.json"), '{"re'), 1000005)):
            with self.subTest(name):
                self.history()
                change(self.live.data)
                done = self.restore()
                self.assertEqual(done.status, 0, done)
                self.assertIn("floor ledger %d" % wanted, self.ctl_words())
                self.assertIn("floor plan 1", self.ctl_words(), "the other document is read as usual")
                self.assertIn("cannot be read, so its floor is put 1000000 above the %d that is known" % (wanted - 1000000),
                              done.out)
                ledger = self.restored().stores["ledger"]
                self.assertEqual(ledger.save(3, json.dumps({"tx": []}), "mika").rev, wanted + 1)

    def test_a_data_directory_that_is_gone_is_restored_with_both_floors_a_million_up_and_every_link_retired(self):
        self.history()
        shutil.rmtree(self.live.data)
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        self.assertEqual(glob.glob(self.box.data("prod") + ".before-restore-*"), [])
        self.assertEqual([word for word in self.ctl_words() if word.startswith("floor")],
                         ["floor ledger 1000003", "floor plan 1000001"])
        after = self.restored()
        self.assertIsNone(after.auth.invites.peek(self.token))
        self.assertEqual(after.stores["ledger"].revision(), 3)
        self.assertNotIn("The directory as it was", done.out)

    def test_a_document_that_was_never_saved_stays_never_saved(self):
        box = self.sandbox()
        self.box = box
        self.clock = Clock("2026-10-06T22:00:00")
        live = Stand(box.make_data_dir("prod"), self.clock)
        live.save("ledger", 0, 3)
        self.tarball = box.run(box.script("prod", "money-backup")).lines[0].split(" (")[0]
        box.container("prod", box.image("money-prod:1.0.0"))
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        self.assertIn("floor plan 0", self.ctl_words(), "the floor is asked for all the same: it leaves its line")
        plan = self.restored().stores["plan"]
        self.assertEqual((plan.revision(), plan.floor()), (0, 0))
        self.assertFalse(os.path.exists(os.path.join(box.data("prod"), "plan", "EVER_SAVED")))

    def test_the_steps_come_in_the_order_that_keeps_the_stand_shut_until_it_is_safe(self):
        self.history()
        self.restore()
        calls = [call.split("   [")[0] for call in self.box.calls(r"^docker (stop|start|run|exec)")]
        kinds = []
        for call in calls:
            if call.startswith("docker stop"):
                kinds.append("stop")
            elif call.startswith("docker start"):
                kinds.append("start")
            elif "--help" in call:
                kinds.append("asks the image")
            elif call.startswith("docker run"):
                kinds.append("prepares: " + call.split("moneyd.ctl ", 1)[1].split(" /")[0])
            else:
                kinds.append("asks the stand: " + call.split("moneyd.ctl ", 1)[1])
        self.assertEqual(kinds, [
            "asks the image", "asks the image", "stop", "prepares: verify", "prepares: user list",
            "prepares: floor ledger 5", "prepares: floor plan 1", "start", "asks the stand: ping",
            "asks the stand: selfcheck"])
        for event in self.box.events("run"):
            self.assertEqual(event["network"], "none", "a throwaway container needs no network")
            self.assertEqual(event["image"], self.image)
        look = [event for event in self.box.events("run") if event["command"][-2:-1] == ["verify"]][0]
        self.assertEqual(look["mounts"], {"/look": self.aside()})
        self.assertIn("-v %s:/look:ro " % self.aside(), " ".join(self.box.calls(r"verify /look")))

    def test_nothing_of_a_document_is_printed(self):
        self.history()
        done = self.restore()
        self.assertNotIn('"n"', done.out + done.err)
        self.assertNotIn(self.token, done.out + done.err)
        self.assertNotIn("pbkdf2", done.out + done.err)

    def test_the_stands_name_has_to_be_typed(self):
        self.history()
        done = self.restore(stdin="yes\n")
        self.assertEqual(done.status, 1, done)
        self.assertIn("not confirmed - nothing done", done.err)
        self.assertAsBefore(done)
        self.assertEqual(self.box.events("stop"), [])

    def test_a_tarball_of_another_stand_or_no_tarball_at_all_is_refused(self):
        self.history()
        write(os.path.join(self.box.home, "notes.tar.gz"), "not an archive")
        done = self.restore(os.path.join(self.box.home, "notes.tar.gz"))
        self.assertEqual(done.status, 1, done)
        self.assertIn("does not read as gzip", done.err)
        other = os.path.join(self.box.home, "other")
        os.makedirs(other)
        write(os.path.join(other, "STAND"), "test\n")
        subprocess.run(["tar", "-C", other, "-czf", os.path.join(self.box.home, "test.tar.gz"), "."], check=True)
        done = self.restore(os.path.join(self.box.home, "test.tar.gz"))
        self.assertIn("is not a backup of the prod stand (its STAND marker says 'test')", done.err)
        self.assertAsBefore(done)

    def test_an_image_that_cannot_prepare_a_restore_is_refused_before_anything_is_moved(self):
        self.history()
        self.box.plan(old_image=True)
        done = self.restore()
        self.assertEqual(done.status, 1, done)
        self.assertIn("does not know `ctl floor` and `ctl user retire-links`", done.err)
        self.assertIn("Nothing was changed.", done.err)
        self.assertAsBefore(done)
        self.assertEqual(self.box.events("stop"), [])

    def test_without_any_image_there_is_nothing_to_prepare_with(self):
        self.history()
        state = self.box.state()
        state["images"], state["containers"] = {}, {}
        self.box._put(state)
        done = self.restore()
        self.assertEqual(done.status, 1, done)
        self.assertIn("there is no Money image on this machine", done.err)
        self.assertEqual(self.restored().stores["ledger"].revision(), 5)

    def test_a_stand_without_a_container_is_prepared_and_left_for_the_deploy(self):
        self.history()
        state = self.box.state()
        state["containers"] = {}
        self.box._put(state)
        done = self.restore()
        self.assertEqual(done.status, 0, done)
        self.assertIn("No container exists for the stand: start it with money-deploy.", done.out)
        self.assertEqual(self.restored().stores["ledger"].floor(), 5)
        self.assertEqual(self.box.events("start"), [])

    def test_every_failure_after_the_directory_is_moved_puts_it_back(self):
        for name, plan, words in (
                ("the tarball does not unpack", {"untar": [2]}, "did not unpack"),
                ("the accounts cannot be listed", {"ctl:user list": [1]}, "do not read in the restored directory"),
                ("a floor cannot be raised", {"ctl:floor": [0, 1]}, "the floor of the plan could not be raised to 1"),
                ("the stand does not answer", {"ping": 1}, "did not come up"),
                ("the self-check fails", {"selfcheck": [1]}, "did not come up")):
            with self.subTest(name):
                self.history()
                self.box.plan(**plan)
                done = self.restore()
                self.assertEqual(done.status, 1, done)
                self.assertTrue(done.last.startswith("money-restore: FAILED - "), done)
                self.assertIn(words, done.last)
                self.assertIn("The data is as it was before.", done.last)
                self.assertAsBefore(done)
                kept = glob.glob(self.box.data("prod") + ".failed-restore-*")
                self.assertEqual(len(kept), 1, "what the attempt left is kept for looking at")
                self.assertIn("What the attempt left is in " + kept[0], done.last)
                self.assertEqual([event["cmd"] for event in self.box.events() if event["cmd"] in ("stop", "start")][-1],
                                 "start")

    def test_links_that_cannot_be_retired_stop_the_restore(self):
        self.history()
        write(os.path.join(self.live.data, "auth", "users.json"), "garbage")
        self.box.plan(**{"ctl:user retire-links": [1]})
        done = self.restore()
        self.assertEqual(done.status, 1, done)
        self.assertIn("the pending one-time links of the backup's accounts could not be retired", done.last)
        self.assertEqual(read(os.path.join(self.box.data("prod"), "auth", "users.json")), "garbage")
        self.assertEqual(self.box.state()["containers"][self.cid]["status"], "running")

    def test_a_stand_that_was_stopped_before_is_not_started_by_a_failed_restore(self):
        self.history()
        state = self.box.state()
        state["containers"][self.cid]["status"] = "exited"
        self.box._put(state)
        self.box.plan(**{"ctl:floor": [1]})
        done = self.restore()
        self.assertEqual(done.status, 1, done)
        self.assertEqual(self.restored().stores["ledger"].revision(), 5)
        self.assertEqual(self.box.events("start"), [])

    def test_a_failed_restore_of_a_lost_directory_makes_up_no_empty_stand(self):
        # An empty directory with the container started on it would hand every founder an empty ledger.
        self.history()
        shutil.rmtree(self.live.data)
        self.box.plan(**{"ctl:floor": [1]})
        done = self.restore()
        self.assertEqual(done.status, 1, done)
        self.assertFalse(os.path.exists(self.box.data("prod")))
        self.assertIn("There was no data directory before, and there is none now; the container is left stopped.", done.last)
        self.assertEqual(len(glob.glob(self.box.data("prod") + ".failed-restore-*")), 1)
        self.assertEqual(self.box.events("start"), [])

    def test_a_signal_in_the_middle_puts_the_directory_back_and_starts_the_stand_again(self):
        # review-deploy/no-cleanup-on-signals (b): between `mv` and the verdict there was no handler at all.
        for number, status, where in ((signal.SIGINT, 130, "floor"), (signal.SIGTERM, 143, "floor"),
                                      (signal.SIGHUP, 129, "floor"), (signal.SIGHUP, 129, "user list")):
            if True:
                with self.subTest(signal=number, where=where):
                    self.history()
                    self.box.plan(block=where)
                    process = self.box.start(self.box.script("prod", "money-restore"), self.tarball, stdin="prod\n")
                    self.assertTrue(self.box.blocked(process), "the step was never reached")
                    self.assertEqual(len(glob.glob(self.box.data("prod") + ".before-restore-*")), 1)
                    self.assertEqual(self.box.state()["containers"][self.cid]["status"], "exited")
                    done = self.box.signalled(process, number)
                    self.assertEqual(done.status, status, done)
                    self.assertTrue(done.last.startswith("money-restore: FAILED - the restore was interrupted"), done)
                    self.assertAsBefore(done)
                    self.assertEqual(len(glob.glob(self.box.data("prod") + ".failed-restore-*")), 1)


class RehearsalTests(RestoreCase):
    def rehearse(self, **options):
        return self.box.run(self.box.script("prod", "money-restore"), "--rehearse", self.tarball, **options)

    def test_a_rehearsal_proves_the_tarball_and_the_images_preparations_and_touches_nothing(self):
        self.history()
        before = read(os.path.join(self.live.data, "auth", "users.json"))
        done = self.rehearse()
        self.assertEqual(done.status, 0, done)
        self.assertEqual(done.last, "money-restore --rehearse: OK - %s unpacks, starts, passes the self-check and "
                                    "takes a restore's preparations. Prod was not touched." % self.tarball)
        started = [event for event in self.box.events("run") if event["detached"]]
        self.assertEqual(len(started), 1)
        self.assertEqual(started[0]["network"], "none", "the throwaway container has no network at all")
        self.assertTrue(started[0]["mounts"]["/data"].startswith(os.path.join(self.box.home, "var", "tmp", "money-rehearse.")))
        self.assertEqual(self.ctl_words(), ["ping", "verify /data", "selfcheck", "floor ledger 0", "floor plan 0",
                                            "user retire-links"])
        self.assertIn("  ledger: revision 3, 32 rows", done.out)
        self.assertIn("vanya: its pending one-time link is retired", done.out, "on the copy: the backup holds the link")
        # prod is as it was, and nothing of the rehearsal is left
        self.assertEqual(read(os.path.join(self.live.data, "auth", "users.json")), before)
        self.assertEqual(self.live.stores["ledger"].revision(), 5)
        self.assertEqual(os.listdir(os.path.join(self.box.home, "var", "tmp")), [])
        self.assertEqual(list(self.box.state()["containers"]), [self.cid])
        self.assertEqual(self.box.state()["containers"][self.cid]["status"], "running")

    def test_an_image_that_cannot_prepare_a_restore_fails_the_rehearsal(self):
        self.history()
        self.box.plan(old_image=True)
        done = self.rehearse()
        self.assertEqual(done.status, 1, done)
        self.assertIn("FAILED - this image could not set a floor under the ledger", done.last)
        self.assertEqual(os.listdir(os.path.join(self.box.home, "var", "tmp")), [])

    def test_a_signal_removes_the_container_and_the_copy_of_prods_data(self):
        # review-deploy/no-cleanup-on-signals (a): a whole, plain copy of the ledger and the accounts.
        for number, status in ((signal.SIGINT, 130), (signal.SIGTERM, 143), (signal.SIGHUP, 129)):
            with self.subTest(signal=number):
                self.history()
                self.box.plan(block="selfcheck")
                process = self.box.start(self.box.script("prod", "money-restore"), "--rehearse", self.tarball)
                self.assertTrue(self.box.blocked(process), "the self-check was never reached")
                scratch = os.path.join(self.box.home, "var", "tmp")
                self.assertEqual(len(os.listdir(scratch)), 1)
                self.assertEqual(len(self.box.state()["containers"]), 2)
                done = self.box.signalled(process, number)
                self.assertEqual(done.status, status, done)
                self.assertEqual(os.listdir(scratch), [], "the copy of prod's data was left behind")
                self.assertEqual(list(self.box.state()["containers"]), [self.cid], "the throwaway container was left running")


# ---------------------------------------------------------------------------
# .github/workflows/ci.yml, read as text
# ---------------------------------------------------------------------------

class WorkflowTests(unittest.TestCase):
    """What the workflow must not do in a working copy, and when its rehearsals run. No YAML library is needed."""

    @classmethod
    def setUpClass(cls):
        text = read(os.path.join(ROOT, ".github", "workflows", "ci.yml"))
        cls.text = text
        cls.steps = {}
        for block in re.split(r"(?m)^      - (?=name: |uses: )", text)[1:]:
            first = block.splitlines()[0]
            name = re.sub(r'^(name|uses): "?(.*?)"?$', r"\2", first)
            cls.steps.setdefault(name, block)

    def step(self, start):
        found = [block for name, block in self.steps.items() if name.startswith(start)]
        self.assertEqual(len(found), 1, "%r names %d steps" % (start, len(found)))
        return found[0]

    def test_the_rehearsals_run_whatever_shellcheck_said(self):
        # review-deploy/shellcheck-skips-rehearsals
        self.assertRegex(self.step("Build deploy/Dockerfile"), r"(?m)^        id: build$")
        for start in ("Rehearsal: the test stand", "Rehearsal: the prod stand"):
            self.assertRegex(self.step(start), r"(?m)^        if: \$\{\{ !cancelled\(\) && steps\.build\.outcome == 'success' \}\}$")
        lint = self.step("shellcheck")
        self.assertRegex(lint, r"(?m)^        if: \$\{\{ !cancelled\(\) \}\}$")
        self.assertIn("shellcheck deploy/bin/* deploy/stand.sh deploy/motd/*", lint)
        self.assertIn("shellcheck", self.steps)

    def test_no_step_writes_to_or_removes_a_path_called_data_beside_the_code(self):
        # review-store/ci-step-deletes-data-by-name: the decoys are planted in a copy, never in the working copy.
        self.assertIsNone(re.search(r"\brm\s+-[a-z]*r", self.text), "a step removes a tree")
        context = self.step("The build context is the allow-list")
        self.assertIn('git archive HEAD | tar -x -C "$ctx"', context)
        self.assertIn('docker build -q -f - -t money-ctx:ci "$ctx"', context)
        for line in self.text.splitlines():
            if line.lstrip().startswith("#"):
                continue
            for decoy in ("data/db.json", ".env.decoy", "design/notes.md"):
                if decoy in line:
                    self.assertIn('"$ctx/' + decoy + '"', line, "a decoy is planted outside the copy: %s" % line.strip())
            self.assertIsNone(re.search(r"\bmkdir (-p )?(data|design)\b", line), line)

    def test_the_rehearsals_stop_at_once_anywhere_but_on_a_runner(self):
        for start, home in (("Rehearsal: the test stand", "/opt/money-dev"), ("Rehearsal: the prod stand", "/opt/money")):
            block = self.step(start)
            run = block.split("        run: |\n", 1)[1]
            first = [line.strip() for line in run.splitlines() if line.strip() and not line.strip().startswith("#")]
            self.assertTrue(first[0].startswith('if [ "${GITHUB_ACTIONS:-}" != true ]'), first[0])
            self.assertIn('if [ -e %s ] && [ "$(readlink -f %s)" != "$(readlink -f "$GITHUB_WORKSPACE")" ]; then' % (home, home),
                          first[:6])
            self.assertLess(run.index("is a checkout of its own"), run.index("sudo ln -sfn"))

    def test_the_rehearsals_hold_the_restore_and_the_kept_log_to_what_was_decided(self):
        # FIX-PLAN D7: accounts kept, floors raised, the log of a replaced container kept.
        test = self.step("Rehearsal: the test stand")
        for words in ("requests-*.log.gz", '= 600', '= 700', '"addr":"192.0.2.10"', "every snapshot purged"):
            self.assertIn(words, test)
        prod = self.step("Rehearsal: the prod stand")
        for words in ("money-user prod disable vanya", "no: disabled", "ledger/EVER_SAVED)\" = 57",
                      "ledger/EVER_SAVED)\" = 1000041", "so the accounts are the backup's", "--rehearse"):
            self.assertIn(words, prod)

    def test_the_unit_job_runs_these_checks(self):
        self.assertIn("run: python -B checks/test_deploy.py", self.text)


if __name__ == "__main__":
    unittest.main()
