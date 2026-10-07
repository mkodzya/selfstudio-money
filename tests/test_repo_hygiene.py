"""What the repository itself must never hold or let out, read off its files.

The real ledger lives in ``data/`` beside the code on one Mac, and a founder's password or a
session never lives anywhere in git. These tests read the repository as it is and fail when

* a ledger, a copy of one, or an environment file is tracked by git;
* ``.dockerignore`` stops being an allow-list, so that ``data/`` could reach a build context;
* a port in ``deploy/compose.yml`` is published anywhere but on ``127.0.0.1``;
* a stand file (``deploy/stands/*.env``) gains a key the build spec does not know, or
  anything that looks like a secret;
* ``moneyd`` imports the laptop server, or a test file forgets ``tests/_safety.py``;
* a vendored reader changed: the three files of ``vendor/`` are pinned here by sha256 (the
  laptop tool's own two files: ``tests/test_laptop_frozen.py``);
* the page, its checks or its made-up studio are gone. They are **not** pinned: the page lives
  in this repository now and changes with every release of it. What holds the page is its own
  checks (``scripts/money-checks.mjs``, the ``page-checks`` job of CI) and the browser run
  against the real service (``checks/stand-smoke.mjs``).

    python3 -m unittest tests.test_repo_hygiene

Nothing here needs a network, Docker or a YAML library: the two deploy files are read as text.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import unittest
from typing import Dict, List, Optional, Tuple

from moneyd import config

CHECKOUT = _safety.CHECKOUT
KIB = 1024

#: A JSON file of this size is no settings file. The real ledger is about two megabytes.
LEDGER_SIZED = 32 * KIB


def path_of(*parts: str) -> str:
    return os.path.join(CHECKOUT, *parts)


def read_text(*parts: str) -> str:
    with open(path_of(*parts), "rb") as handle:
        return handle.read().decode("utf-8")


def git(*args: str) -> Optional[bytes]:
    """The output of a read-only git command in this checkout; None when this is not a git checkout."""
    environ = dict(os.environ, GIT_OPTIONAL_LOCKS="0", LC_ALL="C")
    try:
        done = subprocess.run(["git", "-C", CHECKOUT] + list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              stdin=subprocess.DEVNULL, env=environ, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout if done.returncode == 0 else None


def tracked_files() -> Optional[List[str]]:
    listed = git("ls-files", "-z")
    if listed is None:
        return None
    return [name for name in listed.decode("utf-8", "surrogateescape").split("\0") if name]


# ---------------------------------------------------------------------------
# What git tracks
# ---------------------------------------------------------------------------

class TrackedFilesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tracked = tracked_files()

    def setUp(self):
        if self.tracked is None:
            self.skipTest("not a git checkout (or no git): nothing to say about what is tracked")

    def test_git_tracks_this_repository(self):
        for name in ("moneyd/store.py", "server.py", "index.html", "deploy/compose.yml", ".gitignore", ".dockerignore"):
            self.assertIn(name, self.tracked)

    def test_nothing_under_data_backups_or_design_is_tracked(self):
        for name in self.tracked:
            parts = name.split("/")
            for folder in ("data", "backups", "design"):
                self.assertNotIn(folder, parts[:-1], "%s is tracked: %s/ holds the studio's money and never enters git"
                                 % (name, folder))
            self.assertNotIn(parts[-1], ("data", "backups"), "%s is tracked" % name)

    def test_no_environment_file_is_tracked(self):
        for name in self.tracked:
            self.assertFalse(os.path.basename(name).startswith(".env"),
                             "%s is tracked: an environment file is where a secret would arrive" % name)

    def test_the_only_env_files_are_the_two_stand_files(self):
        found = sorted(name for name in self.tracked if name.endswith(".env"))
        self.assertEqual(found, ["deploy/stands/prod.env", "deploy/stands/test.env"])

    def test_no_file_is_named_like_a_ledger_a_copy_of_one_or_a_stands_state(self):
        named = re.compile(
            r"(db|cash)\.json|(db|cash)-\d{4}-\d{2}-\d{2}\.json|(cash-)?before-shrink-.*\.json"     # the laptop tool's
            r"|current\.json.*|(day|shrink|restore)-.*\.json\.gz|EVER_SAVED|NEVER_SAVED|STAND"      # a stand's documents
            r"|users\.json.*|USERS_WRITTEN|sessions\.json.*|security\.log.*"                        # a stand's accounts
            r"|money-(prod|test)-.*\.tar\.gz(\.part)?")                                             # a stand's backups
        for name in self.tracked:
            self.assertIsNone(named.fullmatch(os.path.basename(name)), "%s is tracked: it is data, not code" % name)

    def test_no_ledger_sized_json_is_tracked_under_any_name(self):
        for name in self.tracked:
            path = path_of(name)
            if not os.path.isfile(path) or os.path.islink(path):
                continue
            size = os.path.getsize(path)
            if name.endswith((".json", ".jsonl", ".ndjson")):
                self.assertLess(size, LEDGER_SIZED, "%s is %d bytes of JSON: a document, not a settings file" % (name, size))
            if size < LEDGER_SIZED:
                continue
            with open(path, "rb") as handle:
                content = handle.read()
            self.assertFalse(content[:2] == b"\x1f\x8b", "%s is a gzip file of %d bytes: a snapshot or a backup?" % (name, size))
            if content.lstrip()[:1] not in (b"{", b"["):
                continue
            try:
                json.loads(content.decode("utf-8"))
            except ValueError:
                continue
            self.fail("%s is %d bytes and reads as one JSON document: a ledger under another name?" % (name, size))

    def test_git_ignores_the_ledger_its_copies_design_notes_and_environment_files(self):
        must = ["data/db.json", "data/cash.json", "data/backups/db-2026-10-07.json", "backups/db-2026-10-07.json",
                "design/notes.md", ".env", ".env.prod", ".env.local", "deploy/.env", "node_modules/x/index.js"]
        for name in must:
            self.assertIsNotNone(git("check-ignore", "-q", "--no-index", name), "%s is not ignored by .gitignore" % name)
        for name in ("deploy/stands/prod.env", "deploy/stands/test.env", "moneyd/store.py", "tests/test_store.py"):
            self.assertIsNone(git("check-ignore", "-q", "--no-index", name), "%s is ignored by .gitignore" % name)


class WorkingTreeTests(unittest.TestCase):
    def test_this_checkout_holds_no_data_folder(self):
        self.assertFalse(os.path.lexists(_safety.DATA),
                         "%s exists: this is the folder that holds a ledger, not a development clone" % _safety.DATA)

    def test_gitignore_names_the_ledger_and_takes_nothing_back(self):
        lines = [line.strip() for line in read_text(".gitignore").splitlines()]
        patterns = [line for line in lines if line and not line.startswith("#")]
        for pattern in ("data/", "backups/", "design/", ".env*"):
            self.assertIn(pattern, patterns)
        for pattern in patterns:
            self.assertFalse(pattern.startswith("!"), "%s takes something back out of .gitignore" % pattern)


# ---------------------------------------------------------------------------
# What can reach a build
# ---------------------------------------------------------------------------

def docker_patterns(text: str) -> List[Tuple[bool, str]]:
    """``(is an exception, pattern)`` for every line of a .dockerignore that is a pattern."""
    patterns = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        negated = line.startswith("!")
        pattern = (line[1:] if negated else line).strip()
        patterns.append((negated, pattern))
    return patterns


def _docker_regex(pattern: str) -> "re.Pattern[str]":
    pattern = pattern.strip("/")        # Docker cleans a pattern like a path: a slash at either end means nothing
    out = []
    at = 0
    while at < len(pattern):
        if pattern.startswith("**/", at):
            out.append("(?:.*/)?")
            at += 3
        elif pattern.startswith("**", at):
            out.append(".*")
            at += 2
        elif pattern[at] == "*":
            out.append("[^/]*")
            at += 1
        elif pattern[at] == "?":
            out.append("[^/]")
            at += 1
        else:
            out.append(re.escape(pattern[at]))
            at += 1
    return re.compile("".join(out))


def left_out(patterns: List[Tuple[bool, str]], path: str) -> bool:
    """Docker's rule: the last pattern that matches the path, or a directory above it, decides."""
    parts = path.split("/")
    candidates = ["/".join(parts[:count]) for count in range(1, len(parts) + 1)]
    out = False
    for negated, pattern in patterns:
        matcher = _docker_regex(pattern)
        if any(matcher.fullmatch(candidate) for candidate in candidates):
            out = not negated
    return out


class BuildContextTests(unittest.TestCase):
    LET_IN = ["index.html", "moneyd", "vendor"]

    def setUp(self):
        self.patterns = docker_patterns(read_text(".dockerignore"))

    def test_dockerignore_shuts_everything_out_first_and_then_lets_exactly_three_things_in(self):
        self.assertTrue(self.patterns, ".dockerignore holds no pattern at all")
        self.assertEqual(self.patterns[0], (False, "*"), "the first pattern must leave everything out")
        exceptions = self.patterns[1:]
        for negated, pattern in exceptions:
            self.assertTrue(negated, "'%s' is a list of things to leave out; this file is an allow-list" % pattern)
            self.assertIsNone(re.search(r"[*?\[\]]", pattern), "'!%s' lets in whatever matches a wildcard" % pattern)
        self.assertEqual(sorted(pattern.strip("/") for _negated, pattern in exceptions), self.LET_IN)

    def test_the_ledger_an_environment_file_or_the_laptop_tool_cannot_enter_a_build_context(self):
        for name in ("data", "data/db.json", "data/cash.json", "data/backups/db-2026-10-07.json",
                     "data/backups/before-shrink-2026-10-07-120000.json", "backups/db.json", "design/notes.md",
                     ".env", ".env.prod", "deploy/stands/prod.env", "deploy/compose.yml", "server.py",
                     "Запустить Money.command", ".git/config", ".github/workflows/ci.yml", "tests/test_store.py",
                     "docs/security.md", "scripts/money-demo.mjs", "README.md", "package.json", "node_modules/x/y.js",
                     "db.json", "money-prod-20261007T000000Z.tar.gz", "vendor.bak/x.js", "moneyd.old/store.py"):
            with self.subTest(name=name):
                self.assertTrue(left_out(self.patterns, name), "%s would be sent to the Docker daemon" % name)

    def test_what_the_image_is_made_of_does_enter(self):
        for name in ("moneyd/__main__.py", "moneyd/store.py", "moneyd/pages/login.html", "moneyd/assets/auth.js",
                     "index.html", "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/xlsx.full.min.js"):
            with self.subTest(name=name):
                self.assertFalse(left_out(self.patterns, name), "%s is left out of the build" % name)

    def test_the_image_copies_only_what_the_allow_list_names(self):
        copied = []
        for line in read_text("deploy", "Dockerfile").splitlines():
            words = line.split()
            if not words or words[0].startswith("#"):
                continue
            self.assertNotEqual(words[0].upper(), "ADD", "ADD can fetch and unpack; the image is three COPY lines")
            if words[0].upper() == "COPY":
                sources = [word for word in words[1:-1] if not word.startswith("--")]
                self.assertTrue(sources, line)
                copied.extend(source.strip("/") for source in sources)
        self.assertEqual(sorted(copied), self.LET_IN, "a COPY of anything else (or of '.') could carry data/ into an image")


class MountTests(unittest.TestCase):
    """CLAUDE.md, "The laptop folder": a mount of a folder that holds data/ carries the ledger to where it must not be."""

    MOUNT = re.compile(r"""(?:^|\s)(?:-v|--volume)[=\s]+["']?([^"'\s:]+):([^"'\s:]+)(?::([a-z,]+))?""")

    def mounts(self):
        found = []
        folder = path_of("deploy", "bin")
        scripts = [os.path.join(folder, name) for name in sorted(os.listdir(folder))] + [path_of("deploy", "stand.sh")]
        for script in scripts:
            for number, line in enumerate(read_text(os.path.relpath(script, CHECKOUT)).splitlines(), 1):
                if line.lstrip().startswith("#"):
                    continue
                for source, target, options in self.MOUNT.findall(line):
                    found.append((os.path.relpath(script, CHECKOUT), number, source, target, options))
        return found

    def test_no_deploy_script_mounts_a_checkout_or_a_data_folder_beside_the_code(self):
        mounts = self.mounts()
        self.assertTrue(mounts, "the seeding of the test stand mounts scripts/: this test has stopped seeing it")
        whole = re.compile(r"^(\.|\$\{?(ROOT|PWD|HERE|CHECKOUT|DIR)\}?|\$\(pwd\)|/opt/money(-dev)?)/?$")
        for script, number, source, target, options in mounts:
            where = "%s:%d mounts %s" % (script, number, source)
            self.assertIsNone(whole.match(source), where + " - a whole checkout, with whatever lies beside the code")
            self.assertIsNone(re.search(r"^(\$\{?(ROOT|PWD|HERE|CHECKOUT|DIR)\}?|\.|/opt/money(-dev)?)/data(/|$)", source),
                              where + " - the folder the laptop tool keeps the ledger in")
            if source.endswith("/scripts"):
                self.assertEqual((target, options), ("/s", "ro"), where + ": the generator is mounted read-only")


# ---------------------------------------------------------------------------
# deploy/compose.yml, read as text
# ---------------------------------------------------------------------------

def _uncomment(line: str) -> str:
    """A line of YAML without its comment (a # at the start, or after white space outside quotes)."""
    quote = ""
    for at, char in enumerate(line):
        if quote:
            if char == quote:
                quote = ""
        elif char in "\"'":
            quote = char
        elif char == "#" and (at == 0 or line[at - 1] in " \t"):
            return line[:at].rstrip()
    return line.rstrip()


def yaml_lines(text: str) -> List[Tuple[int, str]]:
    """``(indent, content)`` of every line that says something."""
    lines = []
    for raw in text.splitlines():
        line = _uncomment(raw)
        if line.strip():
            lines.append((len(line) - len(line.lstrip(" ")), line.strip()))
    return lines


def yaml_blocks(text: str, key: str) -> List[Tuple[int, str, List[Tuple[int, str]]]]:
    """Every ``key:`` in the file as ``(indent, what follows on its line, the lines under it)``."""
    lines = yaml_lines(text)
    found = []
    for at, (indent, content) in enumerate(lines):
        if content != key + ":" and not content.startswith(key + ": "):
            continue
        under = []
        for child_indent, child in lines[at + 1:]:
            if child_indent > indent or (child_indent == indent and child.startswith("- ")):
                under.append((child_indent, child))
            else:
                break
        found.append((indent, content[len(key) + 1:].strip(), under))
    return found


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def yaml_items(inline: str, under: List[Tuple[int, str]]) -> List[List[str]]:
    """The entries of a list: each one as its lines (a plain entry is one line)."""
    if inline:
        assert inline.startswith("[") and inline.endswith("]"), inline
        return [[_unquote(item)] for item in inline[1:-1].split(",") if item.strip()]
    items = []      # type: List[List[str]]
    for _indent, content in under:
        if content.startswith("- "):
            items.append([_unquote(content[2:])])
        elif items:
            items[-1].append(content)
    return items


def interpolate(value: str, values: Dict[str, str]) -> str:
    """Compose's ``${NAME}``, ``${NAME:-default}`` and ``${NAME:?message}`` with ``values`` filled in."""
    def fill(match: "re.Match[str]") -> str:
        name, operator, rest = match.group(1), match.group(2), match.group(3)
        if values.get(name):
            return values[name]
        if operator == ":-":
            return rest or ""
        if operator == ":?":
            raise KeyError("%s is not set: %s" % (name, rest))
        return ""
    return re.sub(r"\$\{([A-Z0-9_]+)(?:(:-|:\?)([^}]*))?\}", fill, value)


def compose_environment(text: str) -> Dict[str, str]:
    blocks = yaml_blocks(text, "environment")
    assert len(blocks) == 1, "one service, one environment"
    environment = {}
    for _indent, content in blocks[0][2]:
        name, _colon, value = content.partition(":")
        environment[name.strip()] = _unquote(value)
    return environment


class ComposeTests(unittest.TestCase):
    def setUp(self):
        self.text = read_text("deploy", "compose.yml")

    def published(self) -> List[List[str]]:
        entries = []
        for _indent, inline, under in yaml_blocks(self.text, "ports"):
            entries.extend(yaml_items(inline, under))
        return entries

    def test_every_published_port_is_on_the_hosts_loopback_address(self):
        entries = self.published()
        self.assertTrue(entries, "no port is published: the edge could not reach the stand")
        for entry in entries:
            with self.subTest(entry=entry):
                if len(entry) == 1 and ":" in entry[0] and not re.match(r"[a-z_]+:\s", entry[0]):
                    self.assertTrue(entry[0].startswith("127.0.0.1:"),
                                    "%s is published on every address of the host, not on its loopback" % entry[0])
                    self.assertRegex(entry[0], r"^127\.0\.0\.1:(\$\{[^}]*\}|\d+):\d+(/tcp)?$")
                else:
                    # The long form, a mapping - or a bare container port. It must name the loopback address itself.
                    said = dict(part.partition(":")[::2] for part in entry)
                    self.assertEqual(_unquote(said.get("host_ip", "")), "127.0.0.1",
                                     "%s does not publish on 127.0.0.1" % (entry,))

    def test_the_published_port_leads_to_the_port_the_service_binds(self):
        environment = compose_environment(self.text)
        bind = environment["MONEY_BIND"]
        self.assertRegex(bind, r"^0\.0\.0\.0:\d+$", "inside the container the service listens for the Docker bridge")
        for entry in self.published():
            self.assertTrue(entry[0].endswith(":" + bind.rsplit(":", 1)[1]), entry)

    def test_the_container_shares_no_network_with_the_host(self):
        for _indent, inline, _under in yaml_blocks(self.text, "network_mode"):
            self.assertNotIn(_unquote(inline), ("host",), "network_mode: host publishes every port on every address")

    def test_the_data_is_one_host_directory_and_never_a_named_volume(self):
        blocks = yaml_blocks(self.text, "volumes")
        self.assertEqual([indent for indent, _inline, _under in blocks if indent == 0], [],
                         "a named volume can be deleted by `down -v` and `volume prune`")
        entries = [item for _indent, inline, under in blocks for item in yaml_items(inline, under)]
        self.assertEqual(len(entries), 1, entries)
        self.assertRegex(entries[0][0], r"^\$\{MONEY_DATA_HOST_DIR(:\?[^}]*)?\}:/data$")

    def test_compose_hands_the_container_only_settings_the_service_knows(self):
        environment = compose_environment(self.text)
        for name in environment:
            self.assertIn(name, config.ENV_NAMES + ("TZ",), "%s is not a setting moneyd reads" % name)
            self.assertIsNone(re.search(r"SECRET|TOKEN|PASSWORD|PEPPER|PRIVATE|CREDENTIAL|COOKIE", name), name)
        # BUILD-SPEC 2.7: the policy's mode and its dated override are passed through, and nothing is hard-wired.
        self.assertEqual(environment.get("MONEY_CSP"), "${MONEY_CSP:-enforce}")
        self.assertEqual(environment.get("MONEY_CSP_OVERRIDE_UNTIL"), "${MONEY_CSP_OVERRIDE_UNTIL:-}")
        self.assertEqual(environment.get("MONEY_DATA_DIR"), "/data")
        self.assertNotIn("MONEY_KDF", environment, "a weaker hash is for the dev stand only")


# ---------------------------------------------------------------------------
# The stand files
# ---------------------------------------------------------------------------

#: BUILD-SPEC section 1, the table of stands.
STANDS = {
    "prod": {
        "MONEY_STAND": "prod",
        "MONEY_PUBLIC_URL": "https://finance.selfstudio.se",
        "MONEY_FOUNDERS": "mika:Mika,misha:Misha,vanya:Vanya",
        "MONEY_PORT": "5191",
        "MONEY_DATA_HOST_DIR": "/var/lib/money/prod",
    },
    "test": {
        "MONEY_STAND": "test",
        "MONEY_PUBLIC_URL": "https://finance.test.selfstudio.se",
        "MONEY_FOUNDERS": "mika:Mika,misha:Misha,vanya:Vanya",
        "MONEY_PORT": "5192",
        "MONEY_DATA_HOST_DIR": "/var/lib/money/test",
    },
}
#: The five every stand file has (design, section 4), and the two BUILD-SPEC 2.7 lets a stand add.
REQUIRED_KEYS = ("MONEY_STAND", "MONEY_PUBLIC_URL", "MONEY_FOUNDERS", "MONEY_PORT", "MONEY_DATA_HOST_DIR")
ALLOWED_KEYS = REQUIRED_KEYS + ("MONEY_CSP", "MONEY_CSP_OVERRIDE_UNTIL")

SECRET_NAME = re.compile(r"SECRET|TOKEN|PASSWORD|PASSWD|PEPPER|SALT|HASH|PRIVATE|CREDENTIAL|COOKIE|SESSION|API_?KEY|_KEY$")
#: A run this long with letters and digits mixed is a key, a token or a hash - not a word of prose or a path.
RANDOM_LOOKING = re.compile(r"[A-Za-z0-9_-]{24,}")


def stand_file(name: str) -> List[Tuple[str, str]]:
    pairs = []
    for line in read_text("deploy", "stands", name + ".env").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, _equals, value = line.partition("=")
        pairs.append((key, value))
    return pairs


class StandFilesTests(unittest.TestCase):
    def test_there_is_a_file_for_prod_one_for_test_and_no_other(self):
        self.assertEqual(sorted(os.listdir(path_of("deploy", "stands"))), ["prod.env", "test.env"])

    def test_a_stand_file_is_plain_key_value_lines(self):
        for name in STANDS:
            for line in read_text("deploy", "stands", name + ".env").splitlines():
                if not line.strip() or line.startswith("#"):
                    continue
                with self.subTest(stand=name, line=line[:40]):
                    self.assertRegex(line, r"^[A-Z][A-Z0-9_]*=\S+$", "KEY=value, no spaces, no quotes, no export")
                    self.assertIsNone(re.search(r"[\"'`$\\;&|<>(){}]", line),
                                      "the file is read by a shell script and by compose: nothing to expand or run")

    def test_a_stand_file_holds_the_five_keys_and_none_the_spec_does_not_allow(self):
        for name in STANDS:
            with self.subTest(stand=name):
                keys = [key for key, _value in stand_file(name)]
                self.assertEqual(len(keys), len(set(keys)), "a key is named twice")
                for key in keys:
                    self.assertIn(key, ALLOWED_KEYS, "deploy/stands/%s.env gained the key %s. A stand file holds no "
                                  "secret and no setting the build spec does not name." % (name, key))
                for key in REQUIRED_KEYS:
                    self.assertIn(key, keys)

    def test_the_values_are_those_of_the_stand_the_file_is_named_for(self):
        for name, expected in STANDS.items():
            with self.subTest(stand=name):
                values = dict(stand_file(name))
                self.assertEqual({key: values.get(key) for key in REQUIRED_KEYS}, expected)
                if "MONEY_CSP" in values:
                    self.assertIn(values["MONEY_CSP"], ("enforce", "report-only"))

    def test_the_two_stands_share_no_port_no_directory_and_no_address(self):
        prod, test = dict(stand_file("prod")), dict(stand_file("test"))
        for key in ("MONEY_PORT", "MONEY_DATA_HOST_DIR", "MONEY_PUBLIC_URL", "MONEY_STAND"):
            self.assertNotEqual(prod[key], test[key], key)
        for mine, other in ((prod, test), (test, prod)):
            self.assertFalse((other["MONEY_DATA_HOST_DIR"] + "/").startswith(mine["MONEY_DATA_HOST_DIR"] + "/"))
            self.assertFalse(mine["MONEY_DATA_HOST_DIR"].startswith("/opt/"), "a checkout is not where data lives")

    def test_nothing_in_a_stand_file_looks_like_a_secret(self):
        for name in STANDS:
            text = read_text("deploy", "stands", name + ".env")
            with self.subTest(stand=name):
                for key, value in stand_file(name):
                    self.assertIsNone(SECRET_NAME.search(key), "%s is the name of a secret" % key)
                    self.assertIsNone(re.search(r"://[^/@\s]*:[^/@\s]*@", value), "%s carries a password in a URL" % key)
                self.assertNotIn("-----BEGIN", text)
                for run in RANDOM_LOOKING.findall(text):
                    self.assertFalse(re.search(r"[0-9]", run) and re.search(r"[A-Za-z]", run),
                                     "'%s...' in deploy/stands/%s.env looks like a key, a token or a hash" % (run[:8], name))

    def test_the_service_starts_on_what_each_stand_file_and_compose_give_it(self):
        compose = compose_environment(read_text("deploy", "compose.yml"))
        for name in STANDS:
            with self.subTest(stand=name):
                values = dict(stand_file(name))
                environ = {key: interpolate(value, values) for key, value in compose.items()}
                environ = {key: value for key, value in environ.items() if key.startswith("MONEY_")}
                settings = config.Settings.from_env(environ, scrypt_available=True)
                self.assertEqual((settings.stand, settings.public_url), (name, STANDS[name]["MONEY_PUBLIC_URL"]))
                self.assertEqual(settings.csp_mode, "enforce")
                self.assertEqual(settings.kdf, "scrypt")
                self.assertEqual(settings.cookie_name, "__Host-money")
                self.assertEqual(settings.data_dir, "/data")
                self.assertEqual(settings.logins, ("mika", "misha", "vanya"))
                self.assertEqual(settings.warnings, (), "the stand would start with a warning")


# ---------------------------------------------------------------------------
# The hosted service and the laptop tool stay apart
# ---------------------------------------------------------------------------

def python_files(folder: str) -> List[str]:
    found = []
    for base, _dirs, files in os.walk(path_of(folder)):
        found.extend(os.path.join(base, name) for name in files if name.endswith(".py"))
    return sorted(found)


def parse(path: str) -> ast.Module:
    with open(path, "rb") as handle:
        return ast.parse(handle.read(), filename=path)


class ApartTests(unittest.TestCase):
    def test_moneyd_never_imports_the_laptop_server(self):
        files = python_files("moneyd")
        self.assertGreaterEqual(len(files), 7)
        for path in files:
            name = os.path.relpath(path, CHECKOUT)
            for node in ast.walk(parse(path)):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        self.assertNotEqual(alias.name.split(".")[0], "server", "%s imports server.py" % name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    self.assertNotEqual(module.split(".")[0], "server", "%s imports from server.py" % name)
                    for alias in node.names:
                        self.assertNotEqual(alias.name, "server", "%s imports a module called server" % name)
        self.assertFalse(os.path.exists(path_of("moneyd", "server.py")), "one server.py is enough to confuse the two")

    def test_moneyd_loads_no_code_by_name_or_from_a_path(self):
        # An import the reader cannot see is how the laptop server (or anything else) would come in unnoticed.
        forbidden_names = ("__import__", "exec", "eval", "compile", "execfile")
        forbidden_attributes = ("import_module", "run_path", "run_module", "spec_from_file_location", "exec_module",
                                "load_module", "SourceFileLoader")
        for path in python_files("moneyd"):
            name = os.path.relpath(path, CHECKOUT)
            for node in ast.walk(parse(path)):
                if not isinstance(node, ast.Call):
                    continue
                if isinstance(node.func, ast.Name):
                    self.assertNotIn(node.func.id, forbidden_names, "%s:%d calls %s()" % (name, node.lineno, node.func.id))
                elif isinstance(node.func, ast.Attribute):
                    self.assertNotIn(node.func.attr, forbidden_attributes,
                                     "%s:%d calls .%s()" % (name, node.lineno, node.func.attr))

    def test_importing_all_of_moneyd_loads_nothing_else_from_the_checkout(self):
        code = (
            "import importlib, os, pkgutil, sys\n"
            "import moneyd\n"
            "for found in pkgutil.walk_packages(moneyd.__path__, 'moneyd.'):\n"
            "    importlib.import_module(found.name)\n"
            "root = os.path.realpath(sys.argv[1]) + os.sep\n"
            "inside = os.path.join(root, 'moneyd') + os.sep\n"
            "for name, module in sorted(sys.modules.items()):\n"
            "    origin = getattr(module, '__file__', None)\n"
            "    if origin and os.path.realpath(origin).startswith(root) and not os.path.realpath(origin).startswith(inside):\n"
            "        print(name)\n"
            "print('loaded', len([name for name in sys.modules if name.startswith('moneyd')]))\n"
        )
        environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
        environ["PYTHONDONTWRITEBYTECODE"] = "1"
        done = subprocess.run([sys.executable, "-c", code, CHECKOUT], cwd=CHECKOUT, env=environ, stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=60)
        self.assertEqual(done.returncode, 0, done.stderr)
        lines = done.stdout.split()
        self.assertEqual(lines[:1], ["loaded"], "moneyd pulled in other code of this checkout: %s" % done.stdout)
        self.assertGreaterEqual(int(lines[1]), 7)

    def test_the_laptops_file_names_appear_in_moneyd_only_to_be_refused(self):
        laptop = ("db.json", "cash.json", "backups")
        for path in python_files("moneyd"):
            name = os.path.relpath(path, CHECKOUT)
            tree = parse(path)
            allowed = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign) and any(getattr(target, "id", "") == "LAPTOP_LAYOUT" for target in node.targets):
                    allowed.update(id(constant) for constant in ast.walk(node.value))
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in allowed:
                    self.assertNotIn(node.value, laptop, "%s:%d uses the laptop tool's file name %r"
                                     % (name, getattr(node, "lineno", 0), node.value))
        from moneyd import store
        self.assertEqual(sorted(store.LAPTOP_LAYOUT), sorted(laptop))

    def test_every_test_file_imports_the_safety_module_before_anything_else(self):
        files = sorted(name for name in os.listdir(path_of("tests"))
                       if name.endswith(".py") and name not in ("__init__.py", "_safety.py"))
        self.assertIn("test_store.py", files)
        for name in files:
            with self.subTest(file=name):
                first = next((node for node in parse(path_of("tests", name)).body
                              if isinstance(node, (ast.Import, ast.ImportFrom))), None)
                self.assertIsNotNone(first, "tests/%s imports nothing" % name)
                is_safety = (isinstance(first, ast.ImportFrom) and first.module == "tests"
                             and [alias.name for alias in first.names] == ["_safety"]) or (
                    isinstance(first, ast.Import) and [alias.name for alias in first.names] == ["tests._safety"])
                self.assertTrue(is_safety, "tests/%s must start with `from tests import _safety`: without it a run "
                                           "in the folder that holds data/ is not stopped" % name)


# ---------------------------------------------------------------------------
# The page and what it loads
# ---------------------------------------------------------------------------

#: The page, its checks and the generator of its made-up studio. They are in this repository and are
#: NOT pinned: the page was handed over whole on 7 October 2026 and changes here with every release
#: of it, so a pin would be replaced in every such commit and hold nothing. They have to be there:
#: the service serves the first, and CI's page-checks job runs only while all three exist - a file
#: that went missing would switch the page's own checks off without a word.
PAGE_AND_ITS_CHECKS = ("index.html", "scripts/money-checks.mjs", "scripts/money-demo.mjs")

#: sha256 of each vendored reader as it stood on 7 October 2026.
VENDOR = {
    "vendor/pdf.min.js": "5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946",
    "vendor/pdf.worker.min.js": "feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b",
    "vendor/xlsx.full.min.js": "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99",
}

NOT_EDITED = (
    "\n\n%s is not the vendored file (pinned %s, found %s)."
    "\nvendor/ holds the readers the page loads (pdf.js, SheetJS); the hosted work does not edit them, and"
    "\nthe served policy counts on them being what they are. Replacing one is a decision of its own"
    "\n(docs/security.md, \"Next\"): do it in a commit that says so and changes this pin."
)


def sha256_of(name: str) -> str:
    with open(path_of(*name.split("/")), "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


class FrozenFilesTests(unittest.TestCase):
    def test_the_page_its_checks_and_its_made_up_studio_are_there_and_are_not_pinned(self):
        for name in PAGE_AND_ITS_CHECKS:
            with self.subTest(file=name):
                path = path_of(*name.split("/"))
                self.assertTrue(os.path.isfile(path) and not os.path.islink(path),
                                "%s is gone. The service serves the page, and CI runs the page's own checks only "
                                "while index.html and both scripts exist: without it they are skipped silently." % name)
                self.assertGreater(os.path.getsize(path), 1000, "%s is all but empty" % name)
        # Nothing in this file holds the page to a sha256 any more - a pin of a file that changes with
        # every release is replaced in every such commit and so guards nothing.
        self.assertFalse(set(PAGE_AND_ITS_CHECKS) & set(VENDOR))

    def test_the_vendored_readers_are_byte_for_byte_the_pinned_files(self):
        for name, pin in VENDOR.items():
            with self.subTest(file=name):
                found = sha256_of(name)
                self.assertEqual(found, pin, NOT_EDITED % (name, pin, found))

    def test_the_vendor_folder_holds_the_three_readers_and_nothing_else(self):
        self.assertEqual(sorted("vendor/" + name for name in os.listdir(path_of("vendor"))), sorted(VENDOR))

    def test_every_pin_is_a_whole_sha256(self):
        for name, pin in VENDOR.items():
            self.assertRegex(pin, r"^[0-9a-f]{64}$", name)


if __name__ == "__main__":
    unittest.main()
