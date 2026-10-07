"""Sign-in, held to the documents - not to the code.

Every test here states one rule of BUILD-SPEC 2.4-2.7, of the design's section 2 ("Sign-in")
or of docs/api.md and docs/security.md, and fails when the service breaks it. The happy paths
are in test_core_smoke.py and test_service_smoke.py; this file goes to the edges: the limiter
under a burst, the window to the second, what a refusal leaves on disk, what another process
does to a running server, forged headers, and every way a link or a session can end.

    python3 -m unittest tests.test_auth -v

Two ways of driving the sign-in are used:

* ``AuthCase`` - ``auth.Auth`` on a temporary directory, no server: fast, and the address a
  request comes from is whatever the test says;
* ``StandCase`` - a dev stand served from this process (``tests/_harness.py``), asked over HTTP.
  With ``EDGE`` the test client is trusted as the edge, so ``X-Forwarded-For`` says who asks.

Time is the test's own clock everywhere; nothing sleeps for longer than a few hundredths of a
second, and that only to keep a password hash busy while a burst piles up behind it.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import datetime
import errno
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import unittest
from unittest import mock

from moneyd import auth, config, log, store
from tests import _harness
from tests._harness import PASSWORD, ledger

MIB = 1024 * 1024
HAS_SCRYPT = hasattr(hashlib, "scrypt")

LOGIN = "/api/auth/login"
SETUP = "/api/auth/setup"
LOGOUT = "/api/auth/logout"
ME = "/api/me"
LEDGER = "/api/founder/money"

#: The test client is the edge: what it writes into X-Forwarded-For is who is asking.
EDGE = {"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"}
#: Room for a burst of fifty connections at once, so that only the limiter stands in its way: one
#: address may hold only two signed-out bodies by default (docs/security.md, "Signed-out slots").
ROOMY = {"signed_out_slots": 64, "signed_out_body_slots_per_address": 64,
         "max_connections": 64, "max_connections_per_address": 64}

INVALID = b'{"error":"invalid_credentials","message":"That login and password do not match."}'
WRONG = "not the password, not at all"
DENY_LIST = ("password", "пароль", "qwerty", "123456", "selfstudio", "money", "finance")   # docs/security.md


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read(path):
    with open(path, "rb") as handle:
        return handle.read()


def files_under(directory):
    """Every file below ``directory``: relative path -> content."""
    found = {}
    for root, _directories, names in os.walk(directory):
        for name in names:
            path = os.path.join(root, name)
            found[os.path.relpath(path, directory)] = read(path)
    return found


def full_width(text):
    """The same ASCII text in full-width letters and digits: another spelling NFKC folds back."""
    return "".join(chr(ord(ch) + 0xFEE0) if "!" <= ch <= "~" else ch for ch in text)


def ctl_process(stand, *args, text=None):
    """``python3 -m moneyd.ctl <args>`` as a process of its own, on ``stand``'s data directory."""
    environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
    environ.update(stand.environ)
    environ["PYTHONDONTWRITEBYTECODE"] = "1"
    return subprocess.run([sys.executable, "-m", "moneyd.ctl"] + list(args), cwd=_harness.CHECKOUT, env=environ,
                          input=text, stdin=None if text is not None else subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, timeout=30)


class CountedHash:
    """The dev stand's password hash, ``hashlib.pbkdf2_hmac``, counted for as long as the ``with`` lasts.

    ``calls`` is how many hashes ran and ``most`` how many of them ran at the same moment.
    ``hold`` keeps each one busy that many seconds longer, so that whatever can pile up
    behind a hash has the time to do it.
    """

    def __init__(self, hold=0.0):
        self.calls = 0
        self.most = 0
        self._running = 0
        self._hold = hold
        self._lock = threading.Lock()
        self._real = hashlib.pbkdf2_hmac
        self._patch = None

    def _hash(self, *args, **options):
        with self._lock:
            self.calls += 1
            self._running += 1
            self.most = max(self.most, self._running)
        try:
            if self._hold:
                time.sleep(self._hold)
            return self._real(*args, **options)
        finally:
            with self._lock:
                self._running -= 1

    def __enter__(self):
        self._patch = mock.patch.object(hashlib, "pbkdf2_hmac", self._hash)
        self._patch.start()
        return self

    def __exit__(self, *_exc):
        self._patch.stop()


def all_at_once(jobs):
    """Run every callable of ``jobs`` in a thread of its own, started together. Their results, in order."""
    results = [None] * len(jobs)
    gate = threading.Barrier(len(jobs))

    def run(index, job):
        try:
            gate.wait(20)
            results[index] = job()
        except BaseException as error:     # noqa: BLE001 - the test looks at what came out
            results[index] = error

    threads = [threading.Thread(target=run, args=(index, job)) for index, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(60)
    return results


class AuthCase(unittest.TestCase):
    """``auth.Auth`` on a temporary directory with a dev stand's settings and a clock the test moves."""

    env = {}

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.clock = _harness.FakeClock()
        self.settings = config.Settings.from_env(_harness.dev_environ(self.dir, 8123, **self.env), self.clock)
        store.prepare_data_dir(self.dir, "dev")
        self.security = log.SecurityLog(self.dir, self.clock)
        self.auth = auth.Auth(self.settings, self.clock, self.security)
        self.auth.boot()

    def give_password(self, login="mika", password=PASSWORD):
        self.auth.users.set_password(login, auth.hash_password(password, self.settings.kdf))

    def wrong(self, login, addr, password=WRONG):
        """One failed sign-in: it must be told so, and nothing else."""
        with self.assertRaises(auth.InvalidCredentials):
            self.auth.sign_in(login, password, addr)

    def refused(self, login, addr, password=PASSWORD):
        """One sign-in the limiter turns away. Returns the refusal."""
        with self.assertRaises(auth.TooManyAttempts) as caught:
            self.auth.sign_in(login, password, addr)
        refusal = caught.exception
        self.assertEqual((refusal.status, refusal.code), (429, "too_many_attempts"))
        self.assertEqual(refusal.extra(), {"retryAfter": refusal.retry_after})
        return refusal

    def outcome(self, call):
        """What a door said: "in", or the code of its refusal."""
        try:
            call()
            return "in"
        except auth.AuthError as refusal:
            return refusal.code


class StandCase(unittest.TestCase):
    """A dev stand in this process, asked over HTTP, with a clock the test moves."""

    env = None
    tune = None

    def setUp(self):
        self.stand = _harness.Stand(env=self.env, tune=self.tune)
        self.addCleanup(self.stand.stop)

    def sign_in(self, login="mika", password=PASSWORD, addr=None, **options):
        if addr is not None:
            options.setdefault("headers", {})["X-Forwarded-For"] = addr
        return self.stand.post(LOGIN, {"login": login, "password": password}, **options)

    def set_up(self, token, password=PASSWORD, addr=None, **options):
        if addr is not None:
            options.setdefault("headers", {})["X-Forwarded-For"] = addr
        return self.stand.post(SETUP, {"token": token, "password": password}, **options)

    def path(self, *parts):
        return os.path.join(self.stand.data_dir, *parts)

    def users(self):
        return json.loads(read(self.path("auth", "users.json")).decode("utf-8"))["users"]

    def sessions(self):
        """What sessions.json holds: sha256(token) -> record. No file yet is no session yet."""
        if not os.path.exists(self.path("auth", "sessions.json")):
            return {}
        return json.loads(read(self.path("auth", "sessions.json")).decode("utf-8"))["sessions"]

    def events(self, name=None):
        return [entry for entry in self.stand.security_events() if name is None or entry["event"] == name]

    def assertRefused(self, answer, status, code):
        self.assertEqual(answer.status, status, answer.body[:200])
        self.assertEqual(answer.json().get("error"), code)
        self.assertTrue(answer.header("Content-Type").startswith("application/json"))

    def assertSignedIn(self, cookie, login="mika"):
        answer = self.stand.get(ME, cookie=cookie)
        self.assertEqual(answer.status, 200, answer.body[:200])
        self.assertEqual(answer.json()["id"], login)

    def assertSignedOut(self, cookie):
        self.assertRefused(self.stand.get(ME, cookie=cookie), 401, "unauthenticated")


def server_stand(case, name, **options):
    """A prod or a test stand in this process, with a cheap stand-in for scrypt (the Mac's Python has none)."""
    stand_in = _harness.scrypt_stand_in()
    stand_in.__enter__()
    case.addCleanup(stand_in.__exit__, None, None, None)
    stand = _harness.Stand(env=_harness.stand_changes(name), **options)
    case.addCleanup(stand.stop)
    return stand


# ---------------------------------------------------------------------------
# The stored hash: its format, and what a sign-in does to an older one
# ---------------------------------------------------------------------------

class StoredHashTests(unittest.TestCase):
    """docs/security.md "Passwords and hashing": ``scrypt$15$8$3$<salt>$<hash>``, parameters travel, a sign-in re-hashes."""

    def scrypt_calls(self):
        """A stand-in for ``hashlib.scrypt`` that writes down how it was called."""
        calls = []

        def scrypt(secret, *, salt, n, r, p, dklen=64, maxmem=0):
            calls.append({"secret": secret, "salt": salt, "n": n, "r": r, "p": p, "dklen": dklen, "maxmem": maxmem})
            return hashlib.pbkdf2_hmac("sha256", secret, salt + bytes([n.bit_length(), r, p]), 20, dklen)

        patch = mock.patch.object(hashlib, "scrypt", scrypt, create=True)
        patch.start()
        self.addCleanup(patch.stop)
        return calls

    def old_scrypt_hash(self, password=PASSWORD):
        """A hash with yesterday's parameters (n=2**14, r=8, p=1), made with whatever scrypt is in place."""
        salt = bytes(range(16))
        secret = unicodedata.normalize("NFKC", password).encode("utf-8")
        return "scrypt$14$8$1$%s$%s" % (salt.hex(), hashlib.scrypt(secret, salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex())

    def test_a_new_hash_is_scrypt_15_8_3_over_the_nfkc_password_with_a_16_byte_salt_of_its_own(self):
        calls = self.scrypt_calls()
        typed = full_width("cafe") + "\u0301 horse battery \ufb01x"      # full-width letters, a combining accent, a ligature
        stored = auth.hash_password(typed)
        kind, log_n, r, p, salt, digest = stored.split("$")
        self.assertEqual((kind, log_n, r, p), ("scrypt", "15", "8", "3"))
        self.assertEqual((len(bytes.fromhex(salt)), len(bytes.fromhex(digest))), (16, 32))
        call = calls[-1]
        self.assertEqual((call["n"], call["r"], call["p"], call["dklen"]), (2 ** 15, 8, 3, 32))
        self.assertEqual(call["maxmem"], 64 * MIB, "OpenSSL's default ceiling is just under what n=2**15 needs")
        self.assertEqual(call["salt"].hex(), salt, "the salt in the string is the salt that was used")
        self.assertEqual(call["secret"], unicodedata.normalize("NFKC", typed).encode("utf-8"))
        self.assertNotEqual(salt, auth.hash_password(typed).split("$")[4], "a salt per hash")

    @unittest.skipUnless(HAS_SCRYPT, "this Python has no hashlib.scrypt")
    def test_the_stored_string_names_n_r_p_salt_and_hash_as_rfc_7914_computes_them(self):
        # RFC 7914, section 12, third vector: scrypt("pleaseletmein", "SodiumChloride", N=16384, r=8, p=1, dkLen=64).
        vector = ("7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2"
                  "d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887")
        salt = b"SodiumChloride".hex()
        for digest in (vector, vector[:64]):                    # the first 32 bytes are what dkLen=32 gives
            with self.subTest(bytes=len(digest) // 2):
                stored = "scrypt$14$8$1$%s$%s" % (salt, digest)
                self.assertTrue(auth.verify_password("pleaseletmein", stored).ok)
                self.assertFalse(auth.verify_password("pleaseletmeim", stored).ok)
        swapped = "scrypt$14$1$8$%s$%s" % (salt, vector[:64])   # r and p the other way round is another hash
        self.assertFalse(auth.verify_password("pleaseletmein", swapped).ok)

    def test_a_sign_in_replaces_a_hash_with_older_parameters_by_one_with_todays(self):
        stand = server_stand(self, "test")
        old = self.old_scrypt_hash()
        stand.auth.users.set_password("mika", old)
        answer = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "203.0.113.5"})
        self.assertEqual(answer.status, 200, answer.body)
        stored = json.loads(read(os.path.join(stand.data_dir, "auth", "users.json")).decode("ascii"))["users"]["mika"]["hash"]
        self.assertRegex(stored, r"^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$")
        self.assertNotEqual(stored.split("$")[4], old.split("$")[4], "hashed anew, with a new salt")
        self.assertEqual(stand.get(ME, cookie=answer.cookie("__Host-money")).status, 200)
        # The same password signs in against the new hash, and the new hash is left alone.
        again = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "203.0.113.5"})
        self.assertEqual(again.status, 200, again.body)
        after = json.loads(read(os.path.join(stand.data_dir, "auth", "users.json")).decode("ascii"))["users"]["mika"]["hash"]
        self.assertEqual(after, stored)

    def test_a_wrong_password_never_replaces_a_hash(self):
        stand = server_stand(self, "test")
        old = self.old_scrypt_hash()
        stand.auth.users.set_password("mika", old)
        before = read(os.path.join(stand.data_dir, "auth", "users.json"))
        answer = stand.post(LOGIN, {"login": "mika", "password": WRONG}, headers={"X-Forwarded-For": "203.0.113.5"})
        self.assertEqual((answer.status, answer.body), (401, INVALID))
        self.assertEqual(read(os.path.join(stand.data_dir, "auth", "users.json")), before)

    def test_a_scrypt_hash_is_never_replaced_by_a_weaker_one(self):
        self.scrypt_calls()
        with _harness.Stand() as stand:                         # a dev stand whose own scheme is the weak stand-in
            self.assertEqual(stand.settings.kdf, "pbkdf2")
            strong = auth.hash_password(PASSWORD)
            stand.auth.users.set_password("mika", strong)
            answer = stand.post(LOGIN, {"login": "mika", "password": PASSWORD})
            self.assertEqual(answer.status, 200, answer.body)
            stored = json.loads(read(os.path.join(stand.data_dir, "auth", "users.json")).decode("ascii"))["users"]["mika"]["hash"]
            self.assertEqual(stored, strong)

    def test_on_a_server_stand_a_pbkdf2_hash_is_as_good_as_no_hash(self):
        for name in ("prod", "test"):
            with self.subTest(stand=name):
                stand = server_stand(self, name)
                stand.auth.users.set_password("mika", auth.hash_password(PASSWORD, "pbkdf2"))
                answer = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "203.0.113.5"})
                self.assertEqual((answer.status, answer.body), (401, INVALID))
                self.assertEqual(answer.all("Set-Cookie"), [])

    @unittest.skipUnless(HAS_SCRYPT, "this Python has no hashlib.scrypt")
    def test_with_the_real_scrypt_a_link_a_sign_in_and_a_failure_cost_one_hash_each(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        clock = _harness.FakeClock()
        environ = _harness.dev_environ(directory, 8123, **_harness.stand_changes("test"))
        settings = config.Settings.from_env(environ, clock)
        self.assertEqual(settings.kdf, "scrypt")
        store.prepare_data_dir(directory, "test")
        door = auth.Auth(settings, clock, log.SecurityLog(directory, clock))
        door.boot()
        real = hashlib.scrypt
        with mock.patch.object(hashlib, "scrypt", side_effect=real) as scrypt:
            link, _expires = door.issue_invite("mika")
            new = door.set_password(link.split("#t=", 1)[1], PASSWORD, "203.0.113.5")
            self.assertEqual(scrypt.call_count, 1)
            self.assertEqual(scrypt.call_args[1], dict(scrypt.call_args[1], n=2 ** 15, r=8, p=3, dklen=32, maxmem=64 * MIB))
            self.assertRegex(door.users.password_hash("mika"), r"^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$")
            self.assertEqual(door.session(new.token).login, "mika")
            self.assertEqual(door.sign_in("mika", PASSWORD, "203.0.113.5").identity.first_name, "Mika")
            self.assertEqual(scrypt.call_count, 2)
            for number, (login, password) in enumerate((("mika", WRONG), ("nobody", PASSWORD), ("vanya", PASSWORD))):
                with self.assertRaises(auth.InvalidCredentials):
                    door.sign_in(login, password, "203.0.113.5")
                self.assertEqual(scrypt.call_count, 3 + number, "one hash a failure, whoever it is for")


# ---------------------------------------------------------------------------
# The rules for a new password
# ---------------------------------------------------------------------------

class PasswordRuleTests(StandCase):
    """docs/security.md: 12 to 256 characters counted after NFKC; not the login, the first name or a deny-list word."""

    def weak(self, password, login="mika", name="Mika"):
        with self.assertRaises(auth.WeakPassword) as refusal:
            auth.check_password(password, login, name)
        self.assertEqual((refusal.exception.status, refusal.exception.code, refusal.exception.extra()),
                         (400, "weak_password", {"min": 12}))

    def test_twelve_to_256_characters_counted_after_nfkc(self):
        auth.check_password("a b c d e f ", "mika", "Mika")                    # 12
        auth.check_password("z" * 256, "mika", "Mika")
        auth.check_password("\ufb03" + "-nine more", "mika", "Mika")         # 11 as typed, 13 once the ligature is three letters
        for password in ("a b c d e f", "", "z" * 257,
                         "e\u0301" * 11,                                   # 22 as typed, 11 once each accent joins its letter
                         "z" * 255 + "\ufb03"):                           # 256 as typed, 258 once the ligature is three letters
            with self.subTest(typed=len(password)):
                self.weak(password)

    def test_the_login_and_the_first_name_are_refused_in_any_case_and_any_width(self):
        for password in ("ivan the terrible 12", "IVAN the terrible 12", "the great iVaN of all",
                         "vanya goes to school", "VANYA goes to school", "a school for VaNyA ok",
                         full_width("ivan") + " the terrible 12", full_width("VANYA") + " goes to school"):
            with self.subTest(password=password):
                self.weak(password, login="ivan", name="Vanya")
        auth.check_password("correct horse battery staple", "ivan", "Vanya")

    def test_every_word_of_the_deny_list_is_refused_inside_a_longer_password(self):
        for word in DENY_LIST:
            for spelling in (word, word.upper(), word.capitalize(), full_width(word), full_width(word.upper())):
                with self.subTest(word=word, spelling=spelling):
                    self.weak("long-" + spelling + "-and-then-some")

    def test_a_weak_password_is_400_with_min_12_and_neither_spends_the_link_nor_counts(self):
        stand = self.stand
        token = stand.invite("misha")
        before = read(self.path("auth", "users.json"))
        for password in ["short"] + ["misha is my name ok", "My Password is long", "z" * 257] * 4:     # 13 refusals
            answer = self.set_up(token, password)
            self.assertRefused(answer, 400, "weak_password")
            self.assertEqual(answer.json()["min"], 12)
            self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertEqual(read(self.path("auth", "users.json")), before, "the link is as it was, and no password is set")
        self.assertEqual(self.sessions(), {})
        good = self.set_up(token)
        self.assertEqual(good.status, 200, "thirteen weak passwords were not thirteen failures: %r" % good.body)
        self.assertSignedIn(good.cookie("money-dev"), "misha")

    def test_the_link_is_judged_before_the_password(self):
        answer = self.set_up("x" * 43, "short")
        self.assertRefused(answer, 404, "invalid_link")

    def test_a_password_is_hashed_after_nfkc_so_every_spelling_of_it_signs_in(self):
        stand = self.stand
        typed = "caf\u00e9 horse battery staple"                           # e-acute as one character
        self.assertEqual(self.set_up(stand.invite("mika"), typed).status, 200)
        for spelling in (typed, unicodedata.normalize("NFD", typed), full_width("caf") + "\u00e9 horse battery staple"):
            with self.subTest(spelling=[hex(ord(ch)) for ch in spelling[:5]]):
                self.assertEqual(self.sign_in(password=spelling).status, 200)
        self.assertEqual(self.sign_in(password="cafe horse battery staple").body, INVALID, "without the accent it is another password")


# ---------------------------------------------------------------------------
# One answer and one cost for every failed sign-in
# ---------------------------------------------------------------------------

class OneAnswerTests(StandCase):
    """BUILD-SPEC 2.4: an unknown login costs the same hash and gets the same answer as a known one."""

    env = EDGE

    def failures(self):
        stand = self.stand
        stand.set_password("mika")
        stand.set_password("misha", "another long passphrase")
        stand.auth.set_disabled("misha", True)
        return [
            ("a wrong password", "mika", WRONG),
            ("a login nobody has", "nobody", PASSWORD),
            ("a disabled login with its right password", "misha", "another long passphrase"),
            ("a founder who has no password yet", "vanya", PASSWORD),
            ("the right password in capitals", "mika", PASSWORD.upper()),
            ("a password as long as the door takes", "mika", "x" * 3000),
            ("a login as long as a login can be", "x" * 32, PASSWORD),
        ]

    def test_every_failed_sign_in_gets_the_same_status_the_same_headers_and_the_same_body(self):
        answers = []
        for number, (what, login, password) in enumerate(self.failures()):
            answer = self.sign_in(login, password, addr="203.0.113.%d" % (number + 1))
            self.assertEqual((answer.status, answer.body), (401, INVALID), what)
            self.assertEqual(answer.all("Set-Cookie"), [], what)
            answers.append((what, sorted((name.lower(), value) for name, value in answer.headers.items()
                                         if name.lower() != "date")))
        for what, headers in answers[1:]:
            self.assertEqual(headers, answers[0][1], what)
        self.assertEqual(self.sessions(), {})

    def test_every_failed_sign_in_costs_exactly_one_hash_known_login_or_not(self):
        for number, (what, login, password) in enumerate(self.failures()):
            with CountedHash() as hashes:
                answer = self.sign_in(login, password, addr="203.0.113.%d" % (number + 1))
            self.assertEqual(answer.status, 401, what)
            self.assertEqual(hashes.calls, 1, what)

    def test_a_login_the_founders_list_no_longer_names_fails_like_any_other(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        clock = _harness.FakeClock()
        store.prepare_data_dir(directory, "dev")
        everybody = auth.Auth(config.Settings.from_env(_harness.dev_environ(directory, 8123), clock), clock)
        everybody.boot()
        everybody.users.set_password("vanya", auth.hash_password(PASSWORD, "pbkdf2"))
        token = everybody.sign_in("vanya", PASSWORD, "203.0.113.5").token
        fewer = auth.Auth(config.Settings.from_env(
            _harness.dev_environ(directory, 8123, MONEY_FOUNDERS="mika:Mika,misha:Misha"), clock), clock)
        fewer.boot()
        with CountedHash() as hashes:
            with self.assertRaises(auth.InvalidCredentials) as refusal:
                fewer.sign_in("vanya", PASSWORD, "203.0.113.5")
        self.assertEqual(json.dumps(refusal.exception.body(), separators=(",", ":")).encode("ascii"), INVALID)
        self.assertEqual(hashes.calls, 1)
        self.assertIsNone(fewer.session(token), "and the session it had is no session any more")

    def test_an_attempt_the_limiter_refuses_costs_no_hash_and_answers_alike_for_any_login(self):
        for _attempt in range(10):
            self.sign_in("nobody", WRONG, addr="203.0.113.9")
        answers = []
        with CountedHash() as hashes:
            for login in ("mika", "nobody", "vanya"):
                answers.append(self.sign_in(login, PASSWORD, addr="203.0.113.9"))
        self.assertEqual(hashes.calls, 0)
        self.assertEqual([answer.status for answer in answers], [429, 429, 429])
        self.assertEqual(len(set(answer.body for answer in answers)), 1)

    def test_what_is_typed_into_the_login_field_and_the_tried_password_reach_no_log(self):
        stand = self.stand
        stand.set_password("mika")
        self.sign_in("Hunter2-Typed-Into-The-Wrong-Field", "Tried-Password-Number-One", addr="203.0.113.1")
        self.sign_in("mika", "Tried-Password-Number-Two", addr="203.0.113.2")
        self.sign_in("mika", "Tried-Password-Number-Three", addr="203.0.113.2")
        self.sign_in("MIKA", PASSWORD, addr="203.0.113.3")
        written = stand.log_text() + read(self.path("security.log")).decode("utf-8")
        for secret in ("Hunter2", "hunter2", "Tried-Password", PASSWORD, PASSWORD.upper()):
            self.assertNotIn(secret, written)
        # What is written instead: where it came from, how many times by now, and the login only when it is a founder's.
        failed = self.events("sign-in-failed")
        self.assertEqual([(entry["login"], entry["addr"], entry["n"]) for entry in failed],
                         [(None, "203.0.113.1", 1), ("mika", "203.0.113.2", 1), ("mika", "203.0.113.2", 2)])
        self.assertEqual([(entry["login"], entry["addr"]) for entry in self.events("sign-in")], [("mika", "203.0.113.3")])


# ---------------------------------------------------------------------------
# The limiter (BUILD-SPEC 2.4)
# ---------------------------------------------------------------------------

class LimiterTests(AuthCase):
    """10 failures per client address and 30 per login in any 15 minutes; the set-password door: 10 per address."""

    def test_the_eleventh_failure_from_one_address_is_refused_whatever_the_login(self):
        self.give_password()
        for number in range(10):
            self.wrong("guess-%d" % number, "198.51.100.9")
        refusal = self.refused("mika", "198.51.100.9")                         # the right password, even
        self.assertEqual(refusal.retry_after, 900)
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "198.51.100.10").identity.login, "mika", "the neighbour is not held")

    def test_the_thirty_first_failure_for_one_login_is_refused_wherever_it_comes_from(self):
        self.give_password()
        for number in range(29):
            self.wrong("mika", "198.51.100.%d" % (number // 10 + 1))            # no address fails more than ten times
        self.auth.sign_in("mika", PASSWORD, "203.0.113.50")                    # 29 failures hold nobody
        self.wrong("mika", "198.51.100.3")                                      # the thirtieth
        self.refused("mika", "203.0.113.50")                                   # Mika, from home, with the right password
        self.refused("mika", "203.0.113.51", password=WRONG)
        self.wrong("misha", "203.0.113.50")                                     # the other logins are not held

    def test_a_login_nobody_has_meets_the_same_limit_so_the_limit_tells_nothing(self):
        for number in range(29):
            self.wrong("ghost", "198.51.100.%d" % (number // 10 + 1))
        self.wrong("ghost", "203.0.113.50")                                     # the thirtieth: still answered like any failure
        ghost = self.refused("ghost", "203.0.113.50")
        # ... and then turned away in the very words a founder's login is turned away in.
        self.assertEqual(ghost.body(), {"error": "too_many_attempts", "retryAfter": 900,
                                        "message": auth.TooManyAttempts(900).message})
        self.give_password()
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "203.0.113.50").identity.login, "mika")

    def test_one_address_can_cause_only_ten_of_the_thirty_failures_a_login_takes(self):
        self.give_password()
        for _attempt in range(10):
            self.wrong("mika", "198.51.100.9")
        for _knock in range(60):                                               # it goes on knocking, and is turned away
            self.refused("mika", "198.51.100.9", password=WRONG)
        for number in range(19):                                               # 10 + 19: still one short of thirty
            self.wrong("mika", "203.0.113.%d" % (number // 10 + 1))
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "203.0.113.50").identity.login, "mika")

    def test_the_window_slides_with_each_attempt_and_is_not_a_fixed_quarter_of_an_hour(self):
        for number in range(5):
            self.wrong("early-%d" % number, "198.51.100.9")                     # five at 12:00:00
        self.clock.tick(seconds=600)
        for number in range(5):
            self.wrong("late-%d" % number, "198.51.100.9")                      # five at 12:10:00
        self.clock.tick(seconds=299)
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 1)     # 12:14:59: a second to go
        self.clock.tick(seconds=1)
        for number in range(5):
            self.wrong("again-%d" % number, "198.51.100.9")                     # 12:15:00: the early five have left
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 600)   # the late five stay until 12:25:00
        self.clock.tick(seconds=599)
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 1)
        self.clock.tick(seconds=1)
        self.wrong("x", "198.51.100.9")

    def test_retry_after_is_the_seconds_until_there_is_room_again(self):
        for number in range(10):
            self.wrong("guess-%d" % number, "198.51.100.9")
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 900)
        self.clock.tick(seconds=100)
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 800)
        self.clock.tick(seconds=799)
        self.assertEqual(self.refused("x", "198.51.100.9").retry_after, 1)
        self.clock.tick(seconds=1)
        self.wrong("x", "198.51.100.9")

    def test_hammering_a_full_count_does_not_keep_it_full(self):
        self.give_password()
        for number in range(10):
            self.wrong("guess-%d" % number, "198.51.100.9")
        for _second in range(899):
            self.clock.tick(seconds=1)
            self.refused("mika", "198.51.100.9")                               # a refused attempt is not counted
        self.clock.tick(seconds=1)
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "198.51.100.9").identity.login, "mika")

    def test_a_success_gives_back_its_own_attempt_and_no_failure_before_it(self):
        self.give_password()
        for _attempt in range(9):
            self.wrong("mika", "198.51.100.9")
        for _attempt in range(12):                                             # more than the limit, all of them right
            self.auth.sign_in("mika", PASSWORD, "198.51.100.9")
        self.wrong("mika", "198.51.100.9")                                      # the tenth failure: the nine were not forgiven
        self.refused("mika", "198.51.100.9")

    def test_ipv6_is_counted_by_its_64_and_ipv4_address_by_address(self):
        for number in range(10):
            self.wrong("guess-%d" % number, "2001:db8:1:2:%x::%x" % (number + 1, number + 7))
        self.refused("x", "2001:db8:1:2:ffff:ffff:ffff:ffff")
        self.wrong("x", "2001:db8:1:3::1")                                      # the neighbour's /64
        for number in range(10):
            self.wrong("guess-%d" % number, "198.51.100.9")
        self.wrong("x", "198.51.100.8")                                         # an IPv4 neighbour is somebody else
        self.refused("x", "::ffff:198.51.100.9")                               # the same IPv4 caller on an IPv6 socket

    def test_the_table_holds_10000_keys_at_most_the_oldest_go_and_the_founders_stay(self):
        limiter = self.auth.limiter                                            # as the stand's own settings make it
        self.wrong("mika", "198.51.100.9")
        limiter.begin_login("first-guess", "10.99.0.1")
        for number in range(6000):                                             # 12 000 keys asked for
            limiter.begin_login("guess-%d" % number, "10.%d.%d.%d" % (number // 62500, number // 250 % 250, number % 250 + 1))
        self.assertLessEqual(limiter.size(), 10000)
        self.assertEqual(limiter.count("login", "first-guess"), 0, "the oldest went")
        self.assertEqual(limiter.count("address", "10.99.0.1"), 0)
        self.assertEqual(limiter.count("login", "guess-5999"), 1, "the newest stayed")
        self.assertEqual(limiter.count("login", "mika"), 1, "a flood of made-up logins does not reset a founder's count")

    def test_the_set_password_door_refuses_the_eleventh_dead_link_from_one_address(self):
        for number in range(10):
            self.assertEqual(self.outcome(lambda: self.auth.set_password("dead-link-%02d-%s" % (number, "x" * 30), PASSWORD,
                                                                         "2001:db8:5:5::%x" % (number + 1))), "invalid_link")
        link, _expires = self.auth.issue_invite("mika")
        token = link.split("#t=", 1)[1]
        with self.assertRaises(auth.TooManyAttempts) as refusal:
            self.auth.set_password(token, PASSWORD, "2001:db8:5:5:9::9")       # even the good link, from that /64
        self.assertEqual((refusal.exception.status, refusal.exception.retry_after), (429, 900))
        self.wrong("mika", "2001:db8:5:5:9::9")                                 # the sign-in door counts apart
        self.clock.tick(seconds=900)
        self.assertEqual(self.auth.set_password(token, PASSWORD, "2001:db8:5:5:9::9").identity.login, "mika")

    def test_every_spelling_of_a_login_is_that_login_and_shares_its_one_count(self):
        # What is typed into the login field is compared trimmed, lower-cased and NFKC-folded. So "MIKA"
        # signs in as mika - and, the half that matters here, another spelling is not another count.
        self.give_password()
        spellings = ("mika", "MIKA", "Mika", "  mika  ", "\tmika\n", full_width("mika"), full_width("MIKA"), "mIkA ")
        for number, spelling in enumerate(spellings):
            with self.subTest(spelling=spelling):
                self.assertEqual(self.auth.sign_in(spelling, PASSWORD, "203.0.113.%d" % (number + 1)).identity.login, "mika")
        for number in range(30):                                               # thirty failures, in eight spellings
            self.wrong(spellings[number % len(spellings)], "198.51.100.%d" % (number // 10 + 1))
        self.assertEqual(self.auth.limiter.count("login", "mika"), 30)
        for number, spelling in enumerate(spellings):
            with self.subTest(refused=spelling):
                self.assertEqual(self.refused(spelling, "203.0.113.%d" % (number + 100)).key, "login")
        for other in ("mikа", "mika2", "m ika"):                               # a Cyrillic а; a digit; a space inside
            self.wrong(other, "203.0.113.200")                                  # somebody else: not held, and not mika


class BurstTests(AuthCase):
    """BUILD-SPEC 2.4: checked and counted under one lock before the hash - a burst gets no more hashed than the limit."""

    def burst(self, attempts, hold=0.004):
        with CountedHash(hold=hold) as hashes:
            outcomes = all_at_once([
                (lambda login=login, password=password, addr=addr:
                 self.outcome(lambda: self.auth.sign_in(login, password, addr)))
                for login, password, addr in attempts])
        return hashes, outcomes

    def test_fifty_wrong_passwords_at_once_from_one_address_get_ten_hashed(self):
        self.give_password()
        hashes, outcomes = self.burst([("mika", WRONG, "198.51.100.9")] * 50)
        self.assertEqual(hashes.calls, 10)
        self.assertEqual((outcomes.count("invalid_credentials"), outcomes.count("too_many_attempts")), (10, 40), outcomes)
        self.refused("mika", "198.51.100.9")

    def test_fifty_wrong_passwords_at_once_from_fifty_addresses_get_thirty_hashed(self):
        self.give_password()
        hashes, outcomes = self.burst([("mika", WRONG, "198.51.100.%d" % (number + 1)) for number in range(50)])
        self.assertEqual(hashes.calls, 30)
        self.assertEqual((outcomes.count("invalid_credentials"), outcomes.count("too_many_attempts")), (30, 20), outcomes)
        self.refused("mika", "203.0.113.50")

    def test_fifty_logins_at_once_from_one_address_get_ten_hashed(self):
        hashes, outcomes = self.burst([("guess-%d" % number, WRONG, "198.51.100.9") for number in range(50)])
        self.assertEqual(hashes.calls, 10)
        self.assertEqual((outcomes.count("invalid_credentials"), outcomes.count("too_many_attempts")), (10, 40), outcomes)

    def test_a_burst_leaves_the_files_whole_and_no_temporary_file_behind(self):
        self.give_password()
        attempts = [("mika", PASSWORD, "203.0.113.%d" % (number + 1)) for number in range(8)]
        attempts += [("guess-%d" % number, WRONG, "198.51.100.%d" % (number + 1)) for number in range(32)]
        _hashes, outcomes = self.burst(attempts)
        self.assertEqual((outcomes.count("in"), outcomes.count("invalid_credentials")), (8, 32), outcomes)
        names = sorted(os.listdir(os.path.join(self.dir, "auth")))
        self.assertEqual([name for name in names if ".tmp-" in name], [])
        self.assertEqual(sorted(json.loads(read(self.auth.users.path).decode("ascii"))["users"]), ["mika", "misha", "vanya"])
        sessions = json.loads(read(self.auth.sessions.path).decode("ascii"))["sessions"]
        self.assertEqual([record["login"] for record in sessions.values()], ["mika"] * 8)
        self.assertEqual(len(self.auth.sessions.list()), 8)

    def test_fifty_dead_links_at_once_from_one_address_get_ten_judged(self):
        outcomes = all_at_once([
            (lambda number=number: self.outcome(
                lambda: self.auth.set_password("dead-link-%02d-%s" % (number, "x" * 30), PASSWORD, "198.51.100.9")))
            for number in range(50)])
        self.assertEqual((outcomes.count("invalid_link"), outcomes.count("too_many_attempts")), (10, 40), outcomes)

    def test_no_more_than_two_hashes_run_at_the_same_moment(self):
        # Nine sign-ins and three passwords being set through links, all at once: twelve hashes, two at a time.
        jobs = [(lambda number=number: self.outcome(
            lambda: self.auth.sign_in("guess-%d" % number, WRONG, "198.51.100.%d" % (number + 1)))) for number in range(9)]
        for number, login in enumerate(("mika", "misha", "vanya")):
            token = self.auth.issue_invite(login)[0].split("#t=", 1)[1]
            jobs.append(lambda number=number, token=token: self.outcome(
                lambda: self.auth.set_password(token, PASSWORD, "203.0.113.%d" % (number + 1))))
        with CountedHash(hold=0.03) as hashes:
            outcomes = all_at_once(jobs)
        self.assertEqual(outcomes, ["invalid_credentials"] * 9 + ["in"] * 3)
        self.assertEqual((hashes.calls, hashes.most), (12, 2))


class BurstOverHttpTests(unittest.TestCase):
    """The same burst through the real door: fifty connections at once, and the hash counted."""

    def burst(self, stand, addresses):
        jobs = [(lambda addr=addr: stand.post(
            LOGIN, {"login": "mika", "password": WRONG},
            headers={"X-Forwarded-For": addr} if addr else None).status) for addr in addresses]
        with CountedHash(hold=0.004) as hashes:
            statuses = all_at_once(jobs)
        return hashes, statuses

    def test_fifty_requests_at_once_from_one_address_get_ten_hashed(self):
        with _harness.Stand(tune=ROOMY) as stand:
            stand.set_password("mika")
            hashes, statuses = self.burst(stand, [None] * 50)
            self.assertEqual(hashes.calls, 10)
            self.assertEqual((statuses.count(401), statuses.count(429)), (10, 40), statuses)

    def test_fifty_requests_at_once_from_fifty_addresses_get_thirty_hashed(self):
        with _harness.Stand(env=EDGE, tune=ROOMY) as stand:
            stand.set_password("mika")
            hashes, statuses = self.burst(stand, ["203.0.113.%d" % (number + 1) for number in range(50)])
            self.assertEqual(hashes.calls, 30)
            self.assertEqual((statuses.count(401), statuses.count(429)), (30, 20), statuses)
            blocked = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "198.51.100.77"})
            self.assertEqual(blocked.status, 429)


class LimiterOverHttpTests(StandCase):
    """What the limiter says through the door: 429, ``retryAfter`` and ``Retry-After``; and the hash slots."""

    env = EDGE

    def test_over_the_limit_is_429_with_retry_after_in_the_body_and_in_the_header(self):
        for number in range(10):
            self.assertEqual(self.sign_in("guess-%d" % number, WRONG, addr="203.0.113.9").status, 401)
        self.stand.clock.tick(seconds=100)
        blocked = self.sign_in("mika", PASSWORD, addr="203.0.113.9")
        self.assertRefused(blocked, 429, "too_many_attempts")
        self.assertEqual(blocked.json()["retryAfter"], 800)
        self.assertEqual(blocked.header("Retry-After"), "800")
        self.assertEqual(blocked.all("Set-Cookie"), [])
        self.stand.clock.tick(seconds=800)
        self.assertEqual(self.sign_in("guess", WRONG, addr="203.0.113.9").status, 401)

    def test_the_set_password_door_says_429_and_retry_after_too(self):
        for number in range(10):
            self.assertRefused(self.set_up("dead-link-%02d-%s" % (number, "x" * 30), addr="203.0.113.9"), 404, "invalid_link")
        blocked = self.set_up(self.stand.invite("mika"), addr="203.0.113.9")
        self.assertRefused(blocked, 429, "too_many_attempts")
        self.assertEqual((blocked.json()["retryAfter"], blocked.header("Retry-After")), (900, "900"))
        self.assertIsNotNone(self.users()["mika"]["invite"], "the good link was not spent by the refusal")

    def test_success_gives_the_count_back_through_the_door(self):
        self.stand.set_password("mika")
        for _attempt in range(9):
            self.assertEqual(self.sign_in("mika", WRONG, addr="203.0.113.9").status, 401)
        for _attempt in range(12):
            self.assertEqual(self.sign_in("mika", PASSWORD, addr="203.0.113.9").status, 200)
        self.assertEqual(self.sign_in("mika", WRONG, addr="203.0.113.9").status, 401)
        self.assertEqual(self.sign_in("mika", PASSWORD, addr="203.0.113.9").status, 429)

    def test_a_missing_login_or_password_is_400_whatever_shape_the_body_has(self):
        for body in ({}, {"login": "mika"}, {"password": PASSWORD}, {"login": "", "password": PASSWORD},
                     {"login": "mika", "password": ""}, {"login": None, "password": None}, {"login": 7, "password": PASSWORD},
                     {"login": "mika", "password": 123456789012}, {"login": ["mika"], "password": PASSWORD},
                     {"login": "mika", "password": {"is": PASSWORD}}, [], ["mika", PASSWORD], "mika", 7, None, True):
            with self.subTest(body=body):
                answer = self.stand.post(LOGIN, body=json.dumps(body).encode("utf-8"),
                                         headers={"Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9"})
                self.assertRefused(answer, 400, "missing_credentials")
                self.assertEqual(answer.all("Set-Cookie"), [])


class HashSlotTests(unittest.TestCase):
    """BUILD-SPEC 2.4: two hash slots; waiting for one is bounded (5 s, then 503)."""

    def test_the_wait_is_five_seconds_and_the_slots_are_two_on_every_stand(self):
        with _harness.Stand(start=False) as stand:
            self.assertEqual((stand.settings.hash_slots, stand.settings.hash_wait), (2, 5.0))
            limiter = stand.auth.limiter
            with limiter.hash_slot(wait=0.01), limiter.hash_slot(wait=0.01):
                with self.assertRaises(auth.Busy):
                    with limiter.hash_slot(wait=0.01):
                        self.fail("a third hash slot was given")
            with limiter.hash_slot(wait=0.01):
                pass                                            # given back

    def test_a_sign_in_that_gets_no_slot_in_time_is_503_busy_and_is_not_counted(self):
        with _harness.Stand(tune={"hash_wait": 0.02}) as stand:
            stand.set_password("mika")
            began = time.monotonic()
            with stand.auth.limiter.hash_slot(), stand.auth.limiter.hash_slot():
                answers = [stand.post(LOGIN, {"login": "mika", "password": PASSWORD}) for _attempt in range(12)]
                link = stand.post(SETUP, {"token": stand.invite("vanya"), "password": PASSWORD})
            self.assertLess(time.monotonic() - began, 4.0, "the wait is bounded")
            for answer in answers + [link]:
                self.assertEqual((answer.status, answer.json()["error"]), (503, "busy"))
                self.assertEqual(answer.all("Set-Cookie"), [])
            # Twelve attempts that never reached a verdict are not twelve failures, and the link is not spent.
            self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).status, 200)
            self.assertIsNotNone(json.loads(read(os.path.join(stand.data_dir, "auth", "users.json")).decode("ascii"))["users"]["vanya"]["invite"])


# ---------------------------------------------------------------------------
# One-time links
# ---------------------------------------------------------------------------

class LinkTests(StandCase):
    """docs/security.md "One-time links": single use, 48 hours, only a sha256 kept, a newer one retires the older."""

    env = EDGE

    def test_a_link_works_once(self):
        token = self.stand.invite("mika")
        first = self.set_up(token)
        self.assertEqual((first.status, first.json()), (200, {"ok": True, "firstName": "Mika", "login": "mika"}))
        second = self.set_up(token, "another long passphrase")
        self.assertRefused(second, 404, "invalid_link")
        self.assertNotIn(b"mika", second.body.lower(), "a link that does not work is told no login")
        self.assertEqual(second.all("Set-Cookie"), [])
        self.assertEqual(self.sign_in(password="another long passphrase").status, 401, "the second use set nothing")
        self.assertEqual(self.sign_in().status, 200)

    def test_a_link_lasts_48_hours_and_not_a_second_longer(self):
        stand = self.stand
        early, late = stand.invite("mika"), stand.invite("misha")
        stand.clock.tick(hours=48, seconds=-1)
        self.assertEqual(self.set_up(early).status, 200)
        stand.clock.tick(seconds=1)
        self.assertRefused(self.set_up(late), 404, "invalid_link")
        self.assertFalse(self.users()["misha"]["hash"], "an expired link sets no password")

    def test_a_newer_link_retires_the_older_one_and_only_for_that_login(self):
        stand = self.stand
        old, other = stand.invite("mika"), stand.invite("misha")
        new = stand.invite("mika")
        self.assertRefused(self.set_up(old), 404, "invalid_link")
        self.assertEqual(self.set_up(new).json()["firstName"], "Mika")
        self.assertEqual(self.set_up(other, "another long passphrase").json()["firstName"], "Misha")

    def test_unknown_used_replaced_expired_and_malformed_links_all_answer_alike(self):
        stand = self.stand
        used = stand.invite("mika")
        self.assertEqual(self.set_up(used).status, 200)
        replaced = stand.invite("misha")
        stand.invite("misha")
        disabled = stand.invite("vanya")
        stand.auth.set_disabled("vanya", True)
        expired = stand.invite("misha")
        stand.clock.tick(hours=49)
        answers = []
        for number, body in enumerate(({"token": "x" * 43, "password": PASSWORD}, {"token": used, "password": PASSWORD},
                                       {"token": replaced, "password": PASSWORD}, {"token": expired, "password": PASSWORD},
                                       {"token": disabled, "password": PASSWORD}, {"password": PASSWORD},
                                       {"token": "", "password": PASSWORD}, {"token": 7, "password": PASSWORD},
                                       {"token": [used], "password": PASSWORD}, {"token": "../../auth/users.json", "password": PASSWORD},
                                       {"token": used + "x", "password": PASSWORD}, [], "token")):
            answer = self.stand.post(SETUP, body=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "X-Forwarded-For": "203.0.113.%d" % (number + 1)})
            self.assertRefused(answer, 404, "invalid_link")
            self.assertEqual(answer.all("Set-Cookie"), [])
            answers.append(answer.body)
        self.assertEqual(len(set(answers)), 1, "nothing tells one dead link from another")

    def test_only_the_sha256_of_a_link_is_on_disk_and_it_goes_when_the_link_is_used(self):
        stand = self.stand
        token = stand.invite("mika")
        self.assertRegex(token, r"^[A-Za-z0-9_-]{43}$")
        for name, content in files_under(stand.data_dir).items():
            self.assertNotIn(token.encode("ascii"), content, name)
        self.assertEqual(self.users()["mika"]["invite"]["sha256"], sha256(token))
        self.assertEqual(self.set_up(token).status, 200)
        for name, content in files_under(stand.data_dir).items():
            self.assertNotIn(token.encode("ascii"), content, name)
            self.assertNotIn(sha256(token).encode("ascii"), content, name)
            self.assertNotIn(PASSWORD.encode("utf-8"), content, name)
        self.assertNotIn(token, stand.log_text())
        self.assertIsNone(self.users()["mika"]["invite"])

    def test_using_a_link_sets_the_password_closes_every_session_of_that_login_and_signs_in(self):
        stand = self.stand
        stand.set_password("mika", "the password before it")
        phone = self.sign_in(password="the password before it", addr="203.0.113.1").cookie("money-dev")
        laptop = self.sign_in(password="the password before it", addr="203.0.113.2").cookie("money-dev")
        misha = stand.session("misha")
        answer = self.set_up(stand.invite("mika"), addr="203.0.113.3", cookie=laptop)
        self.assertEqual((answer.status, answer.json()), (200, {"ok": True, "firstName": "Mika", "login": "mika"}))
        fresh = answer.cookie("money-dev")
        self.assertEqual(answer.all("Set-Cookie"), [fresh + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"])
        self.assertSignedIn(fresh)
        self.assertSignedOut(phone)
        self.assertSignedOut(laptop)
        self.assertSignedIn(misha, "misha")
        self.assertEqual(self.sign_in(password="the password before it", addr="203.0.113.4").body, INVALID)
        self.assertEqual(self.sign_in(addr="203.0.113.4").status, 200)
        self.assertEqual([record["login"] for record in self.sessions().values()].count("mika"), 2)
        self.assertEqual([entry["event"] for entry in self.events() if entry["event"] in ("link-used", "password-set")],
                         ["link-used", "password-set"])

    def test_a_valid_link_gets_a_founder_in_through_a_full_per_login_count(self):
        stand = self.stand
        stand.set_password("mika")
        for number in range(30):
            self.assertEqual(self.sign_in("mika", WRONG, addr="198.51.100.%d" % (number // 10 + 1)).status, 401)
        for number in range(10):
            self.assertEqual(self.sign_in("other-%d" % number, WRONG, addr="203.0.113.7").status, 401)
        home = self.sign_in("mika", PASSWORD, addr="203.0.113.7")              # the login is full, and so is Mika's own address
        self.assertRefused(home, 429, "too_many_attempts")
        answer = self.set_up(stand.invite("mika"), "a new long passphrase", addr="203.0.113.7")
        self.assertEqual(answer.status, 200, answer.body)
        self.assertSignedIn(answer.cookie("money-dev"))

    def test_two_requests_with_one_link_exactly_one_gets_through(self):
        stand = self.stand
        token = stand.invite("mika")
        answers = all_at_once([
            (lambda number=number: self.set_up(token, "passphrase number %02d here" % number, addr="203.0.113.%d" % (number + 1)))
            for number in range(8)])
        self.assertEqual(sorted(answer.status for answer in answers), [200] + [404] * 7)
        winner = [number for number, answer in enumerate(answers) if answer.status == 200][0]
        self.assertSignedIn(answers[winner].cookie("money-dev"))
        self.assertEqual(self.sign_in(password="passphrase number %02d here" % winner, addr="198.51.100.1").status, 200)
        self.assertEqual(len(self.events("password-set")), 1)

    def test_disabling_a_login_retires_its_link_and_enabling_does_not_bring_it_back(self):
        stand = self.stand
        token = stand.invite("misha")
        stand.auth.set_disabled("misha", True)
        self.assertRefused(self.set_up(token), 404, "invalid_link")
        stand.auth.set_disabled("misha", False)
        self.assertRefused(self.set_up(token, addr="203.0.113.2"), 404, "invalid_link")
        self.assertFalse(self.users()["misha"]["hash"])

    def test_no_link_is_issued_for_a_disabled_login_or_for_a_login_nobody_has(self):
        stand = self.stand
        stand.auth.set_disabled("misha", True)
        before = read(self.path("auth", "users.json"))
        with self.assertRaises(auth.LoginDisabled):
            stand.auth.issue_invite("misha")
        with self.assertRaises(auth.UnknownLogin):
            stand.auth.issue_invite("nobody")
        with self.assertRaises(auth.UnknownLogin):
            stand.auth.issue_invite("Mika")
        self.assertEqual(read(self.path("auth", "users.json")), before)
        self.assertEqual(self.events("link-issued"), [])

    def test_a_link_is_built_from_the_setting_and_carries_its_token_in_the_fragment(self):
        link, expires = self.stand.auth.issue_invite("mika")
        self.assertRegex(link, r"^http://finance\.localhost:%d/set-password#t=[A-Za-z0-9_-]{43}$" % self.stand.port)
        self.assertEqual(expires, self.stand.clock() + datetime.timedelta(hours=48))

    def test_a_token_that_became_part_of_the_path_is_not_written_into_the_request_log(self):
        stand = self.stand
        token = stand.invite("mika")
        for target in ("/set-password%23t=" + token, "/set-password?t=" + token, "/" + token):
            stand.get(target)
        self.assertNotIn(token, stand.log_text())


class RetireLinksTests(StandCase):
    """A pending link is a record in users.json, and users.json is in every backup. So a stand that is put
    back from a tarball has every link pending again that was pending when the tarball was made - also the
    ones spent or replaced since. ``Auth.retire_links`` is what the restore runs before the stand starts."""

    env = EDGE

    def put_back(self, accounts):
        """What a whole-stand restore does to the accounts: the backup's file in place, and no sessions."""
        path = self.path("auth", "users.json")
        with open(path + ".unpacked", "wb") as handle:
            handle.write(accounts)
        os.replace(path + ".unpacked", path)
        if os.path.exists(self.path("auth", "sessions.json")):
            os.unlink(self.path("auth", "sessions.json"))

    def test_a_link_spent_after_the_backup_does_not_come_back_to_life_with_the_restored_accounts(self):
        stand = self.stand
        token = stand.invite("vanya")                           # 22:00 - sent in the messenger, where it stays
        stand.clock.tick(hours=1, minutes=40)
        backup = read(self.path("auth", "users.json"))          # 23:40 - the nightly tarball
        stand.clock.tick(hours=8, minutes=20)
        self.assertEqual(self.set_up(token, addr="203.0.113.1").status, 200)       # 08:00 - Vanya uses it
        self.assertRefused(self.set_up(token, "another long passphrase", addr="203.0.113.2"), 404, "invalid_link")
        stand.clock.tick(hours=6)                               # 14:00 - the stand is put back from the tarball
        self.put_back(backup)
        self.assertEqual(stand.auth.invites.peek(token).login, "vanya", "the file that came back holds the link")
        self.assertEqual(stand.auth.retire_links(by="money-restore"), ["vanya"])
        stolen = self.set_up(token, "whoever can read that chat", addr="198.51.100.66")
        self.assertRefused(stolen, 404, "invalid_link")
        self.assertEqual(stolen.all("Set-Cookie"), [])
        self.assertIsNone(self.users()["vanya"]["hash"], "a password was set through a link that had been spent")
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("link-retired")], [("vanya", "money-restore")])
        fresh = stand.invite("vanya")                           # and Mika issues him a new one
        self.assertEqual(self.set_up(fresh, addr="203.0.113.1").json()["firstName"], "Vanya")

    def test_every_pending_link_goes_in_one_write_and_nothing_else_is_touched(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in(addr="203.0.113.1").cookie("money-dev")
        misha, vanya = stand.invite("misha"), stand.invite("vanya")
        stand.invite("mika")                                    # a founder with a password may hold a link too
        before = self.users()
        inode = os.stat(self.path("auth", "users.json")).st_ino
        self.assertEqual(stand.auth.retire_links(), ["mika", "misha", "vanya"], "in the order of MONEY_FOUNDERS")
        after = self.users()
        self.assertEqual([record["invite"] for record in after.values()], [None, None, None])
        for record in before.values():
            record["invite"] = None
        self.assertEqual(after, before, "something other than the links was changed")
        self.assertNotEqual(os.stat(self.path("auth", "users.json")).st_ino, inode)
        for token in (misha, vanya):
            self.assertRefused(self.set_up(token), 404, "invalid_link")
        self.assertSignedIn(cookie)                             # sessions and passwords are as they were
        self.assertEqual(self.sign_in(addr="203.0.113.2").status, 200)
        self.assertEqual(sorted((entry["login"], entry["by"]) for entry in self.events("link-retired")),
                         [("mika", "ctl"), ("misha", "ctl"), ("vanya", "ctl")])
        self.assertEqual([sorted(entry) for entry in self.events("link-retired")], [["by", "event", "login", "t"]] * 3)

    def test_with_no_link_pending_nothing_is_written_and_nothing_is_said(self):
        stand = self.stand
        stand.set_password("mika")
        path = self.path("auth", "users.json")
        before = (os.stat(path).st_ino, read(path))
        self.assertEqual(stand.auth.retire_links(), [])
        self.assertEqual((os.stat(path).st_ino, read(path)), before)
        self.assertEqual(self.events("link-retired"), [])

    def test_a_link_whose_time_has_run_out_and_one_of_a_dropped_login_are_retired_with_the_rest(self):
        stand = self.stand
        stand.invite("misha")
        stand.clock.tick(hours=49)                              # dead already, and still on record
        token = stand.invite("vanya")
        fewer = auth.Auth(config.Settings.from_env(dict(stand.environ, MONEY_FOUNDERS="mika:Mika,misha:Misha"), stand.clock),
                          stand.clock, stand.security_log)      # vanya is no founder any more; the record is still there
        self.assertEqual(fewer.retire_links(), ["misha", "vanya"])
        self.assertEqual([record["invite"] for record in self.users().values()], [None, None, None])
        self.assertRefused(self.set_up(token), 404, "invalid_link")

    def test_accounts_that_cannot_be_read_are_not_touched(self):
        stand = self.stand
        token = stand.invite("misha")
        path = self.path("auth", "users.json")
        good = read(path)
        with open(path, "wb") as handle:
            handle.write(good[:40])
        with self.assertRaises(auth.AuthDamaged):
            stand.auth.retire_links()
        self.assertEqual(read(path), good[:40])
        self.assertEqual(self.events("link-retired"), [])
        with open(path, "wb") as handle:
            handle.write(good)
        self.assertEqual(self.set_up(token).status, 200)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class SessionTests(StandCase):
    """docs/security.md "Sessions": 30 days, 14 idle, 10 per login, the last 24 hours, sha256 at rest."""

    env = EDGE

    def test_a_session_ends_30_days_after_sign_in_however_much_it_is_used(self):
        stand = self.stand
        stand.set_password("mika")
        signed = self.sign_in()
        cookie = signed.cookie("money-dev")
        self.assertIn("Max-Age=%d" % (30 * 86400), signed.all("Set-Cookie")[0])
        for _visit in range(29):
            stand.clock.tick(days=1)
            self.assertSignedIn(cookie)
        stand.clock.tick(days=1, seconds=-1)
        self.assertSignedIn(cookie)                             # 30 days less a second
        stand.clock.tick(seconds=1)
        self.assertSignedOut(cookie)

    def test_a_session_nobody_uses_ends_after_14_days(self):
        stand = self.stand
        used, unused = stand.session("mika"), stand.session("misha")
        stand.clock.tick(days=14, seconds=-1)
        self.assertSignedIn(used)
        stand.clock.tick(seconds=2)
        self.assertSignedOut(unused)                            # 14 days and a second without a request
        self.assertSignedIn(used)                               # used a moment ago
        stand.clock.tick(days=14, seconds=1)
        self.assertSignedOut(used)

    def test_the_eleventh_sign_in_closes_the_session_used_longest_ago_not_the_oldest(self):
        stand = self.stand
        stand.set_password("mika")
        cookies = []
        for number in range(10):
            cookies.append(self.sign_in(addr="203.0.113.%d" % (number + 1)).cookie("money-dev"))
            stand.clock.tick(minutes=1)
        stand.clock.tick(minutes=6)
        self.assertSignedIn(cookies[0])                         # the oldest session is the one used last
        stand.clock.tick(minutes=1)
        self.assertSignedIn(stand.session("misha"), "misha")    # somebody else's session takes no place
        eleventh = self.sign_in(addr="203.0.113.11").cookie("money-dev")
        self.assertSignedOut(cookies[1])
        for cookie in [cookies[0]] + cookies[2:] + [eleventh]:
            self.assertSignedIn(cookie)
        self.assertEqual([record["login"] for record in self.sessions().values()].count("mika"), 10)

    def test_in_its_last_24_hours_a_session_no_longer_opens_the_page_but_saves_to_the_end(self):
        stand = self.stand
        cookie = stand.session("mika")
        for _fortnight in range(2):
            stand.clock.tick(days=13)
            self.assertSignedIn(cookie)
        stand.clock.tick(days=3, seconds=-1)                    # 29 days less a second
        self.assertEqual(stand.get("/", cookie=cookie).status, 200)
        stand.clock.tick(seconds=1)                             # 24 hours to go
        for path in ("/", "/index.html"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual((answer.status, answer.header("Location")), (302, "/login"), path)
        self.assertSignedIn(cookie)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(2)}, cookie=cookie).json(), {"rev": 1})
        stand.clock.tick(days=1, seconds=-1)
        self.assertEqual(stand.put(LEDGER, {"base": 1, "doc": ledger(3)}, cookie=cookie).json(), {"rev": 2})
        stand.clock.tick(seconds=1)
        self.assertRefused(stand.put(LEDGER, {"base": 2, "doc": ledger(4)}, cookie=cookie), 401, "unauthenticated")

    def test_seen_is_written_at_most_once_in_five_minutes(self):
        stand = self.stand
        cookie = stand.session("mika")
        path = self.path("auth", "sessions.json")
        before = (os.stat(path).st_ino, read(path))
        for _request in range(59):                              # 4 minutes 55 seconds of an open page
            stand.clock.tick(seconds=5)
            self.assertSignedIn(cookie)
        self.assertEqual((os.stat(path).st_ino, read(path)), before, "not a byte was written")
        stand.clock.tick(seconds=5)
        self.assertSignedIn(cookie)
        (record,) = self.sessions().values()
        self.assertEqual(record["seen"], config.iso(stand.clock()))
        after = (os.stat(path).st_ino, read(path))
        for _request in range(59):
            stand.clock.tick(seconds=5)
            self.assertSignedIn(cookie)
        self.assertEqual((os.stat(path).st_ino, read(path)), after)

    def test_seen_is_written_once_when_a_page_asks_for_several_things_at_the_same_moment(self):
        # BUILD-SPEC 2.5: "`seen` of a session is written at most once per 5 minutes." A page that opens
        # sends its requests side by side: the six of them are one use of the session, and one write.
        stand = self.stand
        cookie = stand.session("mika")
        stand.clock.tick(minutes=6)
        written = []
        real = os.replace

        def slow_disk(source, target, *args, **options):
            # Every write of the file is a temporary file renamed into its place (BUILD-SPEC 2.5).
            if os.path.basename(str(target)) == "sessions.json":
                written.append(target)
                time.sleep(0.05)                                # a disk that takes its time, so the six overlap
            return real(source, target, *args, **options)

        with mock.patch.object(os, "replace", slow_disk):
            statuses = all_at_once([(lambda: stand.get(ME, cookie=cookie).status) for _request in range(6)])
        self.assertEqual(statuses, [200] * 6)
        self.assertEqual(len(written), 1, "sessions.json was written %d times for one moment of use" % len(written))

    def test_only_the_sha256_of_a_session_token_is_kept_and_no_log_holds_the_token(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        token = stand.token_of(cookie)
        self.assertRegex(token, r"^[A-Za-z0-9_-]{43}$")           # secrets.token_urlsafe(32)
        self.assertSignedIn(cookie)
        self.assertEqual(list(self.sessions()), [sha256(token)])
        for name, content in files_under(stand.data_dir).items():
            self.assertNotIn(token.encode("ascii"), content, name)
        self.assertNotIn(token, stand.log_text())
        self.assertNotIn(token, json.dumps(stand.security_events()))

    def test_a_token_is_only_ever_issued_by_the_server_and_never_taken_from_a_request(self):
        stand = self.stand
        stand.set_password("mika")
        planted = "A" * 43                                      # what an attacker put into the victim's browser
        self.assertSignedOut("money-dev=" + planted)
        signed = self.sign_in(cookie="money-dev=" + planted)
        self.assertEqual(signed.status, 200)
        self.assertNotEqual(signed.cookie("money-dev"), "money-dev=" + planted)
        self.assertSignedOut("money-dev=" + planted)
        self.assertEqual(len(self.sessions()), 1)

    def test_signing_in_issues_a_fresh_session_and_deletes_the_presented_one(self):
        stand = self.stand
        stand.set_password("mika")
        first = self.sign_in().cookie("money-dev")
        elsewhere = self.sign_in(addr="203.0.113.2").cookie("money-dev")
        second = self.sign_in(cookie=first).cookie("money-dev")
        self.assertNotEqual(first, second)
        self.assertSignedOut(first)
        self.assertSignedIn(second)
        self.assertSignedIn(elsewhere)                          # only the one this browser presented
        self.assertEqual(sorted(self.sessions()), sorted(sha256(stand.token_of(cookie)) for cookie in (second, elsewhere)))

    def test_a_failed_sign_in_leaves_the_presented_session_as_it_was(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        self.assertEqual(self.sign_in(password=WRONG, cookie=cookie).status, 401)
        self.assertEqual(self.sign_in("nobody", cookie=cookie).status, 401)
        self.assertSignedIn(cookie)

    def test_signing_out_closes_that_session_on_disk_and_no_other(self):
        stand = self.stand
        mine, other, misha = stand.session("mika"), stand.session("mika"), stand.session("misha")
        out = stand.post(LOGOUT, {}, cookie=mine)
        self.assertEqual((out.status, out.json()), (200, {"ok": True}))
        self.assertEqual(out.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertEqual(out.header("Clear-Site-Data"), '"cache"')
        self.assertSignedOut(mine)
        self.assertSignedIn(other)
        self.assertSignedIn(misha, "misha")
        self.assertNotIn(sha256(stand.token_of(mine)), self.sessions())
        again = stand.post(LOGOUT, {}, cookie=mine)             # signing out twice is still signing out
        self.assertEqual((again.status, again.all("Set-Cookie")), (200, ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"]))
        self.assertEqual(stand.post(LOGOUT, {}).status, 200)    # and so is signing out with no session at all

    def test_a_sign_out_is_final_whatever_the_session_was_doing_at_that_moment(self):
        # Requests that note the use of a session (a write) and the sign-out (a write) at once:
        # whichever comes first, the session is gone afterwards and no late write brings it back.
        stand = self.stand
        cookie, other = stand.session("mika"), stand.session("misha")
        stand.clock.tick(minutes=6)                             # so that every request has a use to write down
        jobs = [(lambda: stand.get(ME, cookie=cookie).status) for _request in range(5)]
        jobs.insert(2, lambda: stand.post(LOGOUT, {}, cookie=cookie).status)
        statuses = all_at_once(jobs)
        self.assertEqual(statuses[2], 200)
        self.assertTrue(set(statuses) <= {200, 401}, statuses)
        self.assertSignedOut(cookie)
        self.assertEqual(list(self.sessions()), [sha256(stand.token_of(other))])
        self.assertSignedIn(other, "misha")

    def test_twenty_sign_ins_of_one_founder_at_once_all_succeed_and_ten_sessions_remain(self):
        with _harness.Stand(env=EDGE, tune=ROOMY) as stand:     # room for twenty strangers at once: the slots are not the point
            stand.set_password("mika")
            answers = all_at_once([
                (lambda number=number: stand.post(LOGIN, {"login": "mika", "password": PASSWORD},
                                                  headers={"X-Forwarded-For": "203.0.113.%d" % (number + 1)}))
                for number in range(20)])
            self.assertEqual([answer.status for answer in answers], [200] * 20)
            cookies = [answer.cookie("money-dev") for answer in answers]
            self.assertEqual(len(set(cookies)), 20, "a session each")
            alive = [cookie for cookie in cookies if stand.get(ME, cookie=cookie).status == 200]
            self.assertEqual(len(alive), 10)
            directory = os.path.join(stand.data_dir, "auth")
            kept = json.loads(read(os.path.join(directory, "sessions.json")).decode("ascii"))["sessions"]
            self.assertEqual(sorted(kept), sorted(sha256(stand.token_of(cookie)) for cookie in alive))
            self.assertEqual([name for name in os.listdir(directory) if ".tmp-" in name], [])

    def test_get_logout_changes_nothing_by_itself(self):
        stand = self.stand
        cookie = stand.session("mika")
        answer = stand.get("/logout", cookie=cookie)
        self.assertEqual((answer.status, answer.header("Location"), answer.all("Set-Cookie")), (302, "/login", []))
        self.assertSignedIn(cookie)

    def test_a_restart_signs_nobody_out_and_forgets_the_counts(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        for number in range(10):
            self.sign_in("guess-%d" % number, WRONG, addr="203.0.113.9")
        self.assertEqual(self.sign_in(addr="203.0.113.9").status, 429)
        restarted = auth.Auth(stand.settings, stand.clock, stand.security_log)     # what a new process starts with
        restarted.boot()
        self.assertEqual(restarted.session(stand.token_of(cookie)).login, "mika")
        self.assertEqual(restarted.sign_in("mika", PASSWORD, "203.0.113.9").identity.login, "mika")


class OtherProcessTests(unittest.TestCase):
    """BUILD-SPEC 2.5 and the design: the server and ``ctl`` are two processes; what one writes the other sees."""

    def setUp(self):
        # Both processes read the real clock: the other one cannot be given this one's.
        self.stand = _harness.Stand(clock=config.utcnow)
        self.addCleanup(self.stand.stop)

    def status(self, cookie):
        return self.stand.get(ME, cookie=cookie).status

    def test_logout_disable_and_enable_from_another_process_reach_the_running_server(self):
        stand = self.stand
        stand.set_password("mika")
        stand.set_password("misha", "another long passphrase")
        mika = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).cookie("money-dev")
        misha = stand.post(LOGIN, {"login": "misha", "password": "another long passphrase"}).cookie("money-dev")
        vanya = stand.session("vanya")
        self.assertEqual([self.status(cookie) for cookie in (mika, misha, vanya)], [200, 200, 200])

        self.assertEqual(ctl_process(stand, "sessions", "logout", "mika").returncode, 0)
        self.assertEqual([self.status(cookie) for cookie in (mika, misha, vanya)], [401, 200, 200])

        self.assertEqual(ctl_process(stand, "user", "disable", "misha").returncode, 0)
        self.assertEqual([self.status(cookie) for cookie in (misha, vanya)], [401, 200])
        refused = stand.post(LOGIN, {"login": "misha", "password": "another long passphrase"})
        self.assertEqual((refused.status, refused.body), (401, INVALID))

        self.assertEqual(ctl_process(stand, "user", "enable", "misha").returncode, 0)
        self.assertEqual(self.status(misha), 401, "the sessions that were closed stay closed")
        back = stand.post(LOGIN, {"login": "misha", "password": "another long passphrase"})
        self.assertEqual(back.status, 200, back.body)
        self.assertEqual(self.status(back.cookie("money-dev")), 200)

        self.assertEqual(ctl_process(stand, "sessions", "logout", "--all").returncode, 0)
        self.assertEqual([self.status(cookie) for cookie in (vanya, back.cookie("money-dev"))], [401, 401])

    def test_a_session_made_by_another_process_is_a_session_for_the_running_server(self):
        check = ctl_process(self.stand, "selfcheck")            # it makes its own five-minute session in the file
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        self.assertIn("ok    /api/me knows the founder", check.stdout)
        self.assertEqual(self.stand.auth.sessions.list(), [], "and takes it away again")

    def test_a_sessions_file_rewritten_under_the_server_is_read_again_at_the_next_request(self):
        stand = self.stand
        mika, misha = stand.session("mika"), stand.session("misha")
        path = os.path.join(stand.data_dir, "auth", "sessions.json")
        self.assertEqual([self.status(mika), self.status(misha)], [200, 200])
        whole = json.loads(read(path).decode("ascii"))
        without = {"v": 1, "sessions": {digest: record for digest, record in whole["sessions"].items()
                                        if record["login"] != "mika"}}
        with open(path + ".by-hand", "w") as handle:            # replaced whole, as the service itself writes
            json.dump(without, handle)
        os.replace(path + ".by-hand", path)
        self.assertEqual([self.status(mika), self.status(misha)], [401, 200])
        with open(path, "w") as handle:                         # and written in place, as a careless hand would
            json.dump(whole, handle)
        self.assertEqual([self.status(mika), self.status(misha)], [200, 200])


# ---------------------------------------------------------------------------
# Damaged state (BUILD-SPEC 2.5)
# ---------------------------------------------------------------------------

class DamagedAccountsTests(StandCase):
    """A damaged users.json stops the boot; a running server answers 503 on the auth doors. It is never repaired by guessing."""

    env = EDGE
    GARBAGE = (b"", b'{"v":1,"users":{"mika":{"hash":"pbkdf2$20000$', b"[]", b'{"v":1,"users":{"mika":{"hash":null}}}')

    def test_a_running_server_answers_503_on_the_auth_doors_and_neither_counts_nor_spends_anything(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        token = stand.invite("misha")
        path = self.path("auth", "users.json")
        good = read(path)
        for garbage in self.GARBAGE:
            with self.subTest(garbage=garbage[:24]):
                with open(path, "wb") as handle:
                    handle.write(garbage)
                for _attempt in range(12):                      # more than either limit of an address
                    self.assertRefused(self.sign_in(password=WRONG), 503, "auth_damaged")
                    self.assertRefused(self.set_up(token), 503, "auth_damaged")
                for answer in (stand.get(ME, cookie=cookie), stand.get(LEDGER, cookie=cookie),
                               stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie), stand.get("/", cookie=cookie)):
                    self.assertRefused(answer, 503, "auth_damaged")     # never 401: a page told 401 stops saving
                self.assertEqual(read(path), garbage, "the file is left exactly as it was found")
        with open(path, "wb") as handle:
            handle.write(good)
        self.assertSignedIn(cookie)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}', "nothing was saved meanwhile")
        self.assertEqual(self.sign_in(password=WRONG).body, INVALID, "the refused attempts were not counted")
        self.assertEqual(self.set_up(token, "another long passphrase").json(), {"ok": True, "firstName": "Misha", "login": "misha"})

    def test_the_real_process_does_not_start_on_a_damaged_accounts_file_and_leaves_it_alone(self):
        stand = _harness.ProcessStand(start=False)
        self.addCleanup(stand.stop)
        store.prepare_data_dir(stand.data_dir, "dev")
        path = os.path.join(stand.data_dir, "auth", "users.json")
        with open(path, "wb") as handle:
            handle.write(b'{"v":1,"users":{"mika":{"hash":"MARKER-OF-A-HASH')
        done = subprocess.run([sys.executable, "-m", "moneyd"], cwd=_harness.CHECKOUT, env=stand.environ,
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              universal_newlines=True, timeout=20)
        self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
        self.assertIn("moneyd: not starting: ", done.stderr)
        self.assertIn("auth_damaged", done.stderr)
        self.assertNotIn("MARKER-OF-A-HASH", done.stdout + done.stderr)
        self.assertEqual(read(path), b'{"v":1,"users":{"mika":{"hash":"MARKER-OF-A-HASH')
        with self.assertRaises(OSError):
            stand.get("/login", timeout=1.0)


class LostAccountsTests(StandCase):
    """A users.json that has gone is lost, not "no accounts yet": the first write leaves a marker beside it.

    Without the marker a missing file made a running server answer 401 to every open page - which then
    stops saving for good - and made the next start create three founders without passwords, with no
    refusal, no warning and a doctor that said all was well."""

    env = EDGE

    def marker(self):
        return self.path("auth", "USERS_WRITTEN")

    def test_the_first_write_of_the_accounts_leaves_a_marker_beside_them(self):
        self.assertTrue(os.path.isfile(self.marker()), "the boot wrote users.json and left no marker")
        self.assertEqual(os.stat(self.marker()).st_mode & 0o777, 0o600)
        self.assertNotIn(b"hash", read(self.marker()))
        before = (os.stat(self.marker()).st_ino, read(self.marker()))
        self.stand.set_password("mika")
        self.stand.invite("misha")
        self.assertEqual((os.stat(self.marker()).st_ino, read(self.marker())), before, "it is written once")
        self.assertEqual(self.stand.ctl("doctor").status, 0)

    def test_a_running_server_answers_503_and_never_401_when_the_accounts_file_has_gone(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        token = stand.invite("misha")
        path = self.path("auth", "users.json")
        good = read(path)
        os.unlink(path)
        for answer in (stand.get(ME, cookie=cookie), stand.get(LEDGER, cookie=cookie),
                       stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie), stand.get("/", cookie=cookie)):
            self.assertRefused(answer, 503, "auth_damaged")     # 401 would stop the open page from saving, for good
        for _attempt in range(12):                              # more than either limit of an address
            self.assertRefused(self.sign_in(password=WRONG), 503, "auth_damaged")
            self.assertRefused(self.set_up(token), 503, "auth_damaged")
        self.assertFalse(os.path.exists(path), "the accounts were made anew: three founders without a password")
        sick = stand.ctl("doctor")
        self.assertEqual(sick.status, 1)
        self.assertIn("accounts: DAMAGED", sick.out)
        self.assertEqual(auth.verify(stand.data_dir)["users"]["state"], "damaged")
        self.assertEqual(stand.auth.status()["users"]["state"], "damaged")
        for command in (("user", "list"), ("user", "invite", "mika", "--print"), ("user", "disable", "misha")):
            refused = stand.ctl(*command)
            self.assertEqual(refused.status, 1, command)
            self.assertIn("auth_damaged", refused.err)
        self.assertFalse(os.path.exists(path), "ctl made the accounts anew")
        with open(path, "wb") as handle:                        # put back from last night's tarball
            handle.write(good)
        self.assertSignedIn(cookie)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}', "nothing was saved meanwhile")
        self.assertEqual(self.sign_in(password=WRONG).body, INVALID, "the refused attempts were not counted")
        self.assertEqual(self.set_up(token, "another long passphrase").json()["firstName"], "Misha")

    def test_a_stand_does_not_start_on_accounts_that_have_gone_and_makes_none_anew(self):
        process = _harness.ProcessStand(start=False)
        self.addCleanup(process.stop)
        store.prepare_data_dir(process.data_dir, "dev")
        first = auth.Auth(process.settings)                     # the first start, as far as the accounts go
        first.boot()
        first.users.set_password("mika", auth.hash_password(PASSWORD, "pbkdf2"))
        path = os.path.join(process.data_dir, "auth", "users.json")
        os.unlink(path)
        done = subprocess.run([sys.executable, "-m", "moneyd"], cwd=_harness.CHECKOUT, env=process.environ,
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              universal_newlines=True, timeout=20)
        self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
        self.assertIn("moneyd: not starting: ", done.stderr)
        self.assertIn("auth_damaged", done.stderr)
        self.assertFalse(os.path.exists(path), "the boot made the accounts anew")
        with self.assertRaises(OSError):
            process.get("/login", timeout=1.0)

    def test_where_no_account_was_ever_written_a_start_makes_them_and_an_older_stand_gets_its_marker(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        clock = _harness.FakeClock()
        settings = config.Settings.from_env(_harness.dev_environ(directory, 8123), clock)
        store.prepare_data_dir(directory, "dev")
        path, marker = os.path.join(directory, "auth", "users.json"), os.path.join(directory, "auth", "USERS_WRITTEN")
        self.assertEqual(auth.verify(directory)["users"], {"state": "missing", "problem": None})
        auth.Auth(settings, clock).boot()                       # the first start
        self.assertEqual(sorted(json.loads(read(path).decode("ascii"))["users"]), ["mika", "misha", "vanya"])
        self.assertTrue(os.path.isfile(marker))
        os.unlink(marker)                                       # a stand from before the marker existed
        written = (os.stat(path).st_ino, read(path))
        auth.Auth(settings, clock).boot()
        self.assertTrue(os.path.isfile(marker), "an accounts file that is there and sound got no marker")
        self.assertEqual((os.stat(path).st_ino, read(path)), written, "and was written again for it")
        # To begin the accounts anew is a person's call: both files are deleted by hand.
        os.unlink(path)
        os.unlink(marker)
        auth.Auth(settings, clock).boot()
        self.assertTrue(os.path.isfile(path) and os.path.isfile(marker))

    def test_the_accounts_directory_gone_from_a_stand_that_has_run_is_the_accounts_lost(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        directory = self.path("auth")
        aside = directory + ".moved-aside"
        os.rename(directory, aside)
        self.assertRefused(self.sign_in(), 503, "auth_damaged")
        self.assertRefused(stand.post(LOGOUT, {}, cookie=cookie), 507, "storage_failed")   # nowhere to forget a session
        with self.assertRaises(auth.AuthDamaged):
            auth.Auth(stand.settings, stand.clock).boot()       # what the next start does
        store.prepare_data_dir(stand.data_dir, "dev")           # ... after this, which makes nothing anew
        with self.assertRaises(auth.AuthDamaged):
            stand.auth.issue_invite("mika")
        self.assertFalse(os.path.lexists(directory), "the lost directory was made anew")
        self.assertEqual(auth.verify(stand.data_dir)["users"]["state"], "damaged")
        self.assertIn("directory is missing", auth.verify(stand.data_dir)["users"]["problem"])
        os.rename(aside, directory)
        self.assertEqual(self.sign_in().status, 200)
        self.assertSignedIn(cookie)


class DiskTests(StandCase):
    """BUILD-SPEC 2.5: users.json, sessions.json and the links are written whole - a temporary file, then a rename."""

    @unittest.skipIf(os.geteuid() == 0, "root writes into a read-only directory all the same")
    def test_a_disk_that_refuses_a_write_is_507_and_leaves_both_files_as_they_were(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        token = stand.invite("misha")
        directory = self.path("auth")
        before = files_under(directory)
        os.chmod(directory, 0o500)
        try:
            signed = self.sign_in()                             # the right password, and nowhere to keep the session
            linked = self.set_up(token)
            out = stand.post(LOGOUT, {}, cookie=cookie)
        finally:
            os.chmod(directory, 0o700)
        for answer in (signed, linked, out):
            self.assertRefused(answer, 507, "storage_failed")
        self.assertEqual(signed.all("Set-Cookie") + linked.all("Set-Cookie"), [])
        self.assertEqual(files_under(directory), before, "nothing was half-written")
        self.assertSignedIn(cookie)
        self.assertEqual(self.set_up(token).status, 200, "the link was not spent by the write that failed")
        self.assertEqual(self.sign_in().status, 200)

    def test_a_write_that_is_in_place_but_could_not_be_synced_is_answered_for_what_is_on_disk(self):
        # The rename has happened: the link is spent and the password set for every reader. Answering
        # "the file is as it was" would leave the founder with a dead link and no word of the password.
        stand = self.stand
        token = stand.invite("mika")
        directory = os.path.realpath(self.path("auth"))
        real = store._fsync_dir

        def fsync_dir(target):
            if os.path.realpath(target) == directory:
                raise OSError(errno.EIO, "Input/output error")
            return real(target)

        with mock.patch.object(store, "_fsync_dir", fsync_dir):
            linked = self.set_up(token)
            self.assertEqual(linked.status, 200, linked.body)
            cookie = linked.cookie("money-dev")
            self.assertSignedIn(cookie)
            self.assertEqual(self.sign_in().status, 200)
        self.assertTrue(self.users()["mika"]["hash"])
        self.assertIsNone(self.users()["mika"]["invite"])
        self.assertRefused(self.set_up(token, "another long passphrase"), 404, "invalid_link")
        self.assertSignedIn(cookie)
        said = self.events("storage-unsynced")
        self.assertEqual(sorted(set(entry["file"] for entry in said)), ["sessions.json", "users.json"])
        self.assertEqual([sorted(entry) for entry in said][0], ["event", "file", "t"])
        self.assertEqual([name for name in os.listdir(self.path("auth")) if ".tmp-" in name], [])

    def test_a_temporary_file_left_by_a_crash_is_never_read_and_goes_with_the_next_write(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = self.sign_in().cookie("money-dev")
        for name in ("users.json.tmp-4242-deadbeef", "sessions.json.tmp-4242-deadbeef"):
            with open(self.path("auth", name), "wb") as handle:
                handle.write(b'{"v":1,"')                       # as far as the write got
        self.assertSignedIn(cookie)
        self.assertEqual(self.sign_in(password=WRONG).body, INVALID)
        stand.invite("misha")                                   # a write of users.json
        self.assertEqual(self.sign_in().status, 200)            # and one of sessions.json
        self.assertEqual([name for name in os.listdir(self.path("auth")) if ".tmp-" in name], [])
        self.assertSignedIn(cookie)

    def test_each_write_puts_a_new_file_in_place_and_never_changes_the_one_a_reader_has_open(self):
        stand = self.stand
        stand.set_password("mika")
        self.sign_in()
        opened = {}
        for name in ("users.json", "sessions.json"):
            handle = open(self.path("auth", name), "rb")
            self.addCleanup(handle.close)
            opened[name] = (handle, read(self.path("auth", name)), os.fstat(handle.fileno()).st_ino)
        stand.invite("misha")
        self.sign_in()
        for name, (handle, content, inode) in opened.items():
            self.assertEqual(handle.read(), content, "%s: what a reader had open is whole and as it was" % name)
            self.assertNotEqual(os.stat(self.path("auth", name)).st_ino, inode, "%s was replaced, not written into" % name)
            self.assertNotEqual(read(self.path("auth", name)), content)


class DamagedSessionsTests(StandCase):
    """A damaged sessions.json is moved aside as sessions.json.damaged-<utc> and treated as empty."""

    def test_it_is_moved_aside_under_its_utc_stamp_and_everybody_signs_in_again(self):
        stand = self.stand
        stand.set_password("mika")
        mika = self.sign_in().cookie("money-dev")
        misha = stand.session("misha")
        garbage = b'{"v":1,"sessions":{"' + sha256(stand.token_of(mika)).encode("ascii") + b'":{"login":"mika","crea'
        with open(self.path("auth", "sessions.json"), "wb") as handle:
            handle.write(garbage)
        stand.clock.tick(hours=3, minutes=4, seconds=5)
        for cookie in (mika, misha):
            self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")       # not 503, not 500
        aside = [name for name in os.listdir(self.path("auth")) if name.startswith("sessions.json.damaged-")]
        self.assertEqual(aside, ["sessions.json.damaged-20261007T150405Z"])
        self.assertEqual(read(self.path("auth", aside[0])), garbage, "moved, not rewritten")
        self.assertEqual(self.sessions(), {})
        self.assertEqual(len(self.events("sessions-damaged")), 1)
        fresh = self.sign_in()
        self.assertEqual(fresh.status, 200, "the passwords are where they were")
        self.assertSignedIn(fresh.cookie("money-dev"))
        self.assertSignedOut(mika)

    def test_every_kind_of_damage_ends_the_same_way_and_the_doors_stay_open(self):
        stand = self.stand
        stand.set_password("mika")
        for number, garbage in enumerate((b"", b"\x00\xff\x00", b"[]", b'{"v":2,"sessions":{}}',
                                          b'{"v":1,"sessions":{"not-a-digest":{}}}', b'{"v":1,"sessions":' + b"[" * 5000)):
            with self.subTest(garbage=garbage[:24]):
                cookie = self.sign_in().cookie("money-dev")
                with open(self.path("auth", "sessions.json"), "wb") as handle:
                    handle.write(garbage)
                stand.clock.tick(seconds=1)
                self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
                self.assertEqual(stand.get("/login", cookie=cookie).status, 200)
                self.assertEqual(self.sessions(), {})
                self.assertEqual(len([name for name in os.listdir(self.path("auth")) if ".damaged-" in name]), number + 1)


# ---------------------------------------------------------------------------
# Who is asking: the peer, and X-Forwarded-For under the trusted-proxy rule
# ---------------------------------------------------------------------------

class ClientAddressTests(unittest.TestCase):
    """BUILD-SPEC 2.6: X-Forwarded-For only from a peer inside MONEY_TRUSTED_PROXIES, right-most entry."""

    def counted_as(self, stand, forwarded=None, lines=None):
        """The address one failed sign-in is counted under, as the security log wrote it down."""
        before = len(stand.security_events())
        if lines is None:
            answer = stand.post(LOGIN, {"login": "mika", "password": WRONG},
                                headers={"X-Forwarded-For": forwarded} if forwarded is not None else None)
            self.assertEqual(answer.status, 401)
        else:
            body = json.dumps({"login": "mika", "password": WRONG}).encode("ascii")
            head = ["POST %s HTTP/1.1" % LOGIN, "Host: %s" % stand.host, "Origin: %s" % stand.origin,
                    "Content-Type: application/json", "Content-Length: %d" % len(body)] + list(lines)
            answer = stand.raw(("\r\n".join(head) + "\r\n\r\n").encode("ascii") + body)
            self.assertTrue(answer.startswith(b"HTTP/1.1 401 "), answer[:40])
        entry = stand.security_events()[before]
        self.assertEqual(entry["event"], "sign-in-failed")
        self.assertEqual(stand.log_lines()[-1]["addr"], entry["addr"], "the request log names the same caller")
        return entry["addr"]

    def test_a_peer_outside_the_trusted_proxies_is_never_believed(self):
        with _harness.Stand() as stand:                         # no trusted proxy at all
            for forwarded in ("203.0.113.9", "198.51.100.1, 203.0.113.9", "::1", "10.0.0.1", "unknown"):
                self.assertEqual(self.counted_as(stand, forwarded), "127.0.0.1", forwarded)
        with _harness.Stand(env={"MONEY_TRUSTED_PROXIES": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"}) as stand:
            self.assertEqual(self.counted_as(stand, "203.0.113.9"), "127.0.0.1", "loopback is not the edge unless it is named")

    def test_forged_headers_from_an_untrusted_peer_do_not_spread_the_failures_over_made_up_addresses(self):
        with _harness.Stand() as stand:
            stand.set_password("mika")
            for number in range(10):
                answer = stand.post(LOGIN, {"login": "mika", "password": WRONG},
                                    headers={"X-Forwarded-For": "203.0.113.%d" % (number + 1)})
                self.assertEqual(answer.status, 401)
            blocked = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers={"X-Forwarded-For": "198.51.100.200"})
            self.assertEqual(blocked.status, 429, "eleven addresses were claimed; one peer was counted")

    def test_from_the_edge_the_right_most_entry_is_the_caller_whatever_the_client_wrote_before_it(self):
        with _harness.Stand(env=EDGE) as stand:
            stand.set_password("mika")
            cases = (
                ("203.0.113.9", "203.0.113.9"),
                ("198.51.100.1, 203.0.113.9", "203.0.113.9"),
                ("203.0.113.9,198.51.100.1", "198.51.100.1"),
                ("127.0.0.1, 10.0.0.1, 2001:db8::7", "2001:db8::7"),
                ("unknown, 203.0.113.9", "203.0.113.9"),
                ("203.0.113.9, unknown", "127.0.0.1"),          # not an address: the peer's own stands
                ("", "127.0.0.1"),
            )
            for forwarded, expected in cases:
                self.assertEqual(self.counted_as(stand, forwarded), expected, forwarded)
            self.assertEqual(self.counted_as(stand), "127.0.0.1")
            self.assertEqual(self.counted_as(stand, lines=["X-Forwarded-For: 203.0.113.9", "X-Forwarded-For: 198.51.100.4"]),
                             "198.51.100.4", "two header lines are one list; its last entry is the edge's")
            self.assertEqual(self.counted_as(stand, lines=["X-Forwarded-For: 203.0.113.9, 198.51.100.4",
                                                           "X-Forwarded-For: 192.0.2.44, 192.0.2.55"]), "192.0.2.55")

    def test_what_a_client_writes_to_the_left_cannot_move_its_count(self):
        with _harness.Stand(env=EDGE) as stand:
            stand.set_password("mika")
            for number in range(10):
                answer = stand.post(LOGIN, {"login": "mika", "password": WRONG},
                                    headers={"X-Forwarded-For": "198.51.100.%d, 10.1.2.%d, 203.0.113.9" % (number + 1, number + 1)})
                self.assertEqual(answer.status, 401)
            blocked = stand.post(LOGIN, {"login": "mika", "password": PASSWORD},
                                 headers={"X-Forwarded-For": "198.51.100.99, 203.0.113.9"})
            self.assertEqual(blocked.status, 429)
            elsewhere = stand.post(LOGIN, {"login": "mika", "password": PASSWORD},
                                   headers={"X-Forwarded-For": "203.0.113.9, 203.0.113.10"})
            self.assertEqual(elsewhere.status, 200, "the address the edge wrote is another one")

    def test_x_forwarded_proto_and_x_forwarded_host_are_never_consulted(self):
        with _harness.Stand(env=EDGE) as stand:
            stand.set_password("mika")
            signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD},
                                headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "finance.selfstudio.se"})
            self.assertEqual(signed.all("Set-Cookie"), [signed.cookie("money-dev") + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"])
            misdirected = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, host="evil.example",
                                     headers={"X-Forwarded-Host": stand.host})
            self.assertEqual(misdirected.status, 421)
        stand = server_stand(self, "prod")
        stand.set_password("mika")
        signed = stand.post(LOGIN, {"login": "mika", "password": PASSWORD},
                            headers={"X-Forwarded-For": "203.0.113.9", "X-Forwarded-Proto": "http"})
        self.assertEqual(signed.all("Set-Cookie"),
                         [signed.cookie("__Host-money") + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000"])


# ---------------------------------------------------------------------------
# Host, Origin and Sec-Fetch-Site
# ---------------------------------------------------------------------------

class HostTests(StandCase):
    """BUILD-SPEC 2.6: Host must equal the host of MONEY_PUBLIC_URL, else 421 - before anything else is looked at."""

    def test_any_other_host_is_421_and_nothing_of_the_request_is_acted_on(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = stand.session("misha")
        port = stand.port
        with CountedHash() as hashes:
            for host in ("evil.example", "finance.localhost", "finance.localhost:%d" % (port + 1), "localhost:%d" % port,
                         "127.0.0.1:%d" % port, "finance.localhost.:%d" % port, "finance.localhost:%d.evil.example" % port,
                         "evil.example, finance.localhost:%d" % port, "finance.selfstudio.se", ""):
                with self.subTest(host=host):
                    answer = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, host=host)
                    self.assertEqual(answer.status, 421, answer.body)
                    self.assertEqual(answer.all("Set-Cookie"), [])
                    self.assertEqual(stand.get(ME, cookie=cookie, host=host).status, 421)
                    self.assertEqual(stand.get("/login", host=host).status, 421)
        self.assertEqual(hashes.calls, 0, "the right password under a wrong name is not even checked")
        self.assertEqual([record["login"] for record in self.sessions().values()], ["misha"])
        self.assertEqual(self.events("sign-in"), [])

    def test_a_request_with_no_host_or_with_two_is_421(self):
        stand = self.stand
        for head in ("GET /login HTTP/1.0\r\n\r\n", "GET /login HTTP/1.1\r\n\r\n",
                     "GET /login HTTP/1.1\r\nHost: %s\r\nHost: %s\r\n\r\n" % (stand.host, stand.host),
                     "GET /login HTTP/1.1\r\nHost: %s\r\nHost: evil.example\r\n\r\n" % stand.host):
            with self.subTest(head=head):
                self.assertTrue(stand.raw(head.encode("ascii")).startswith(b"HTTP/1.1 421 "))

    def test_the_letter_case_of_the_host_does_not_matter(self):
        stand = self.stand
        self.assertEqual(stand.get("/login", host="FINANCE.LocalHost:%d" % stand.port).status, 200)


class OriginTests(unittest.TestCase):
    """The design's "Cross-site requests": anything but GET and HEAD must carry Origin equal to MONEY_PUBLIC_URL, exactly."""

    def test_a_sign_in_from_any_other_origin_is_403_and_is_not_even_looked_at(self):
        stand = server_stand(self, "prod")
        stand.set_password("mika")
        forwarded = {"X-Forwarded-For": "203.0.113.9"}
        with mock.patch.object(hashlib, "scrypt", wraps=hashlib.scrypt) as hashes:
            for origin in (None, "", "null", "https://evil.example", "http://finance.selfstudio.se",
                           "https://finance.selfstudio.se:443", "https://finance.selfstudio.se:8443",
                           "https://finance.test.selfstudio.se", "https://ops.selfstudio.se", "https://selfstudio.se",
                           "https://finance.selfstudio.se.evil.example", "https://evil.example/https://finance.selfstudio.se",
                           "https://FINANCE.SELFSTUDIO.SE", "HTTPS://finance.selfstudio.se", "https://finance.selfstudio.se/",
                           "https://finance.selfstudio.se, https://evil.example", "finance.selfstudio.se"):
                with self.subTest(origin=origin):
                    answer = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, origin=origin, headers=forwarded)
                    self.assertEqual((answer.status, answer.json()["error"]), (403, "bad_origin"))
                    self.assertEqual(answer.all("Set-Cookie"), [])
            self.assertEqual(hashes.call_count, 0)
        self.assertEqual(stand.auth.sessions.list(), [])
        self.assertEqual(stand.auth.limiter.count("address", "203.0.113.9"), 0, "and it is no failed attempt either")
        ours = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=forwarded)
        self.assertEqual(ours.status, 200)

    def test_two_origin_headers_are_no_origin(self):
        with _harness.Stand() as stand:
            stand.set_password("mika")
            body = json.dumps({"login": "mika", "password": PASSWORD}).encode("ascii")
            head = ["POST %s HTTP/1.1" % LOGIN, "Host: %s" % stand.host, "Origin: %s" % stand.origin,
                    "Origin: %s" % stand.origin, "Content-Type: application/json", "Content-Length: %d" % len(body)]
            answer = stand.raw(("\r\n".join(head) + "\r\n\r\n").encode("ascii") + body)
            self.assertTrue(answer.startswith(b"HTTP/1.1 403 "), answer[:40])
            self.assertNotIn(b"Set-Cookie", answer)

    def test_the_test_stand_cannot_save_sign_out_or_set_a_password_on_prod(self):
        stand = server_stand(self, "prod")
        cookie = stand.session("mika")
        token = stand.invite("misha")
        sibling = {"origin": "https://finance.test.selfstudio.se", "headers": {"Sec-Fetch-Site": "same-site"}}
        for answer in (stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie, **sibling),
                       stand.post(LOGOUT, {}, cookie=cookie, **sibling),
                       stand.post(SETUP, {"token": token, "password": PASSWORD}, **sibling)):
            self.assertEqual((answer.status, answer.json()["error"]), (403, "bad_origin"))
            self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200, "still signed in")
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')
        self.assertEqual(stand.post(SETUP, {"token": token, "password": PASSWORD}).status, 200, "the link was not spent")

    def test_a_get_that_carries_an_origin_must_carry_the_right_one(self):
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
            self.assertEqual(stand.get(ME, cookie=cookie, origin=stand.origin).status, 200)
            for origin in ("https://evil.example", "null", stand.origin.replace("http://", "https://"), stand.origin + "/"):
                answer = stand.get(LEDGER, cookie=cookie, origin=origin)
                self.assertEqual((answer.status, answer.json()["error"]), (403, "bad_origin"), origin)
                self.assertNotIn(b'"rev"', answer.body)


class FetchSiteTests(StandCase):
    """Sec-Fetch-Site, when the browser sends it: ``same-origin``, or ``none`` for a GET typed into the address bar."""

    def test_same_site_and_cross_site_are_403_on_every_api_door_with_the_right_origin_or_not(self):
        stand = self.stand
        stand.set_password("mika")
        cookie = stand.session("misha")
        for site in ("same-site", "cross-site", "SAME-SITE", "weird", "", "same-origin, cross-site"):
            with self.subTest(site=site):
                headers = {"Sec-Fetch-Site": site}
                for answer in (stand.get(ME, cookie=cookie, headers=headers),
                               stand.get(LEDGER, cookie=cookie, headers=headers),
                               stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie, headers=headers),
                               stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=headers),
                               stand.post(LOGOUT, {}, cookie=cookie, headers=headers)):
                    self.assertRefused(answer, 403, "bad_origin")
                    self.assertEqual(answer.all("Set-Cookie"), [])
        self.assertSignedIn(cookie, "misha")
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')
        self.assertEqual(self.events("sign-in"), [])

    def test_none_passes_for_a_get_and_for_nothing_that_changes_anything(self):
        stand = self.stand
        cookie = stand.session("mika")
        typed = {"Sec-Fetch-Site": "none"}
        self.assertEqual(stand.get(ME, cookie=cookie, headers=typed).status, 200)
        self.assertEqual(stand.get(LEDGER, cookie=cookie, headers=typed).status, 200)
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie, headers=typed), 403, "bad_origin")
        self.assertRefused(stand.post(LOGOUT, {}, cookie=cookie, headers=typed), 403, "bad_origin")
        self.assertSignedIn(cookie)

    def test_the_pages_own_calls_pass(self):
        stand = self.stand
        stand.set_password("mika")
        own = {"Sec-Fetch-Site": "same-origin"}
        cookie = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=own).cookie("money-dev")
        self.assertEqual(stand.get(ME, cookie=cookie, headers=own).status, 200)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(1)}, cookie=cookie, headers=own).json(), {"rev": 1})
        self.assertEqual(stand.post(LOGOUT, {}, cookie=cookie, headers=own).status, 200)

    def test_a_link_opened_from_another_site_still_opens_the_page(self):
        # The cookie is Lax and not Strict for this: the rule is for /api/, the page itself is a navigation.
        stand = self.stand
        cookie = stand.session("mika")
        answer = stand.get("/", cookie=cookie, headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate"})
        self.assertEqual(answer.status, 200)
        self.assertEqual(stand.get("/login", headers={"Sec-Fetch-Site": "cross-site"}).status, 200)


# ---------------------------------------------------------------------------
# The cookie
# ---------------------------------------------------------------------------

class CookieTests(unittest.TestCase):
    """docs/api.md "The cookie": the exact strings, for a stand and for dev."""

    def walk(self, stand, name, attributes):
        """Sign in through a link, then by password, then out; every Set-Cookie on the way, to the letter."""
        forwarded = {"X-Forwarded-For": "203.0.113.9"}
        by_link = stand.post(SETUP, {"token": stand.invite("mika"), "password": PASSWORD}, headers=forwarded)
        by_password = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, headers=forwarded)
        cookies = []
        for answer in (by_link, by_password):
            self.assertEqual(answer.status, 200, answer.body)
            (line,) = answer.all("Set-Cookie")
            pair, rest = line.split("; ", 1)
            cookie_name, token = pair.split("=", 1)
            self.assertEqual((cookie_name, rest), (name, attributes + "; Max-Age=2592000"))
            self.assertRegex(token, r"^[A-Za-z0-9_-]{43}$")
            self.assertNotIn("domain", line.lower())
            cookies.append(pair)
        self.assertNotEqual(cookies[0], cookies[1])
        self.assertEqual(stand.get(ME, cookie=cookies[1], headers=forwarded).status, 200)
        out = stand.post(LOGOUT, {}, cookie=cookies[1], headers=forwarded)
        self.assertEqual(out.all("Set-Cookie"), ["%s=; %s; Max-Age=0" % (name, attributes)], "cleared with the attributes it was set with")
        self.assertEqual(stand.get(ME, cookie=cookies[1], headers=forwarded).status, 401)

    def test_on_prod_and_on_test_it_is_host_money_with_secure(self):
        for name in ("prod", "test"):
            with self.subTest(stand=name):
                self.walk(server_stand(self, name), "__Host-money", "Path=/; Secure; HttpOnly; SameSite=Lax")

    def test_on_dev_it_is_money_dev_without_secure_and_without_the_prefix(self):
        with _harness.Stand() as stand:
            self.walk(stand, "money-dev", "Path=/; HttpOnly; SameSite=Lax")

    def test_no_refusal_of_a_sign_in_door_sets_a_cookie(self):
        with _harness.Stand() as stand:
            stand.set_password("mika")
            token = stand.invite("misha")
            refusals = [
                stand.post(LOGIN, {"login": "mika", "password": WRONG}),
                stand.post(LOGIN, {"login": "mika"}),
                stand.post(LOGIN, {"login": "mika", "password": PASSWORD}, origin="https://evil.example"),
                stand.post(LOGIN, body=b"{", headers={"Content-Type": "application/json"}),
                stand.post(LOGIN, body=b"login=mika", headers={"Content-Type": "application/x-www-form-urlencoded"}),
                stand.post(SETUP, {"token": "x" * 43, "password": PASSWORD}),
                stand.post(SETUP, {"token": token, "password": "short"}),
                stand.get(LOGIN), stand.get(SETUP), stand.get(LOGOUT),
            ]
            self.assertEqual([answer.status for answer in refusals], [401, 400, 403, 400, 415, 404, 400, 405, 405, 405])
            for answer in refusals:
                self.assertEqual(answer.all("Set-Cookie"), [], answer.status)

    def test_only_this_stands_own_cookie_name_is_a_session(self):
        with _harness.Stand() as stand:
            cookie = stand.session("mika")
            token = stand.token_of(cookie)
            self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
            self.assertEqual(stand.get(ME, cookie="theme=dark; %s; other=1" % cookie).status, 200)
            for header in ("__Host-money=" + token, "ssp_session=" + token, "MONEY-DEV=" + token, "xmoney-dev=" + token,
                           "money-dev=" + token + "x", "money-dev=" + token[:-1], 'money-dev="%s"' % token,
                           "money-dev=" + token.swapcase(), "money-dev=", "money-dev=%s%s" % (token, token),
                           "money-dev=" + sha256(token)):
                self.assertEqual(stand.get(ME, cookie=header).status, 401, header.split("=")[0])
        stand = server_stand(self, "test")
        cookie = stand.session("mika")
        self.assertEqual(stand.get(ME, cookie=cookie).status, 200)
        self.assertEqual(stand.get(ME, cookie=cookie.replace("__Host-money", "money-dev")).status, 401)
        self.assertEqual(stand.get(ME, cookie=cookie.replace("__Host-money", "__Secure-money")).status, 401)


if __name__ == "__main__":
    unittest.main()
