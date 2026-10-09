"""Sign-in: passwords, accounts, one-time links, sessions, the limiter, and the checks a request passes.

API for the HTTP layer and the CLI
----------------------------------
Almost everything goes through one object::

    auth = Auth(settings, clock, security_log)
    auth.boot()                       # __main__: makes users.json and its founders; raises AuthDamaged

    auth.session(token) -> Identity | None           # every request; cheap. Raises AuthDamaged
        Identity(login, first_name, session, may_open_page, role)
        ``may_open_page`` is False in a session's last 24 hours: GET / then redirects to /login,
        while every /api/ door still answers, so an open page keeps saving.
        ``role`` is "owner", "editor" or "reader"; ``can_write`` and ``can_manage`` are read off it.

    auth.sign_in(login, password, addr, agent="", presented=None) -> NewSession(token, identity)
        MissingCredentials 400 | TooManyAttempts 429 (.retry_after) | Busy 503 |
        InvalidCredentials 401 | AuthDamaged 503 | AuthStorageFailed 507
    auth.set_password(token, password, addr, agent="", presented=None) -> NewSession
        TooManyAttempts 429 | InvalidLink 404 | WeakPassword 400 (.minimum == 12) | Busy 503 |
        AuthDamaged 503 | AuthStorageFailed 507
    auth.sign_out(token, addr=None) -> bool
    auth.change_password(identity, current, password, addr, agent="") -> NewSession
        WrongPassword 403 | TooManyAttempts 429 | WeakPassword 400 | Busy 503 | AuthDamaged 503 |
        AuthStorageFailed 507. The login's other sessions are closed; the answer carries a new one.

  Who may do what (see "Roles" below). The owner's own doors, each with ``by`` = the owner's login::

    auth.people() -> [Person, ...]                             everybody, with when each was last here
    auth.add_person(login, name, by) -> User                   BadPerson 400 | LoginTaken 409 | TooManyPeople 409
    auth.update_person(login, by, name=None, role=None) -> User    BadPerson | UnknownLogin 404 | OwnerFixed 409
    auth.confirm_password(login, password, addr)               WrongPassword 403 | TooManyAttempts 429
    auth.issue_invite(login, by) / auth.set_disabled(login, disabled, by)      as for ``ctl``, below

  Nothing but an ``AuthError`` comes out of these doors for a reason outside the program:
  a disk that refuses a write is ``AuthStorageFailed``, a lock that stays taken is ``Busy``.

  ``addr`` is ``client_address(...)`` below. ``presented`` is the session token the browser
  sent with the request, if any: it is deleted when a new session is issued. Every ``AuthError``
  is a ``config.Refusal``: ``status``, ``code``, ``message``, ``extra()`` (``{"retryAfter": n}``,
  ``{"min": 12}``) and ``body()``, the whole JSON answer.

  For ``ctl`` (each call writes its line into the security log)::

    auth.issue_invite(login, by="ctl") -> (link, expires)      UnknownLogin | LoginDisabled
    auth.retire_links(by="ctl") -> [login, ...]                every pending link is retired; for a stand
                                                               put back from a backup, where a spent link
                                                               is pending again. One log line per login
    auth.set_disabled(login, disabled, by="ctl") -> User       closes the login's sessions when disabling
    auth.close_sessions(login=None, by="ctl") -> int           None closes everybody's
    auth.internal_session(login, ttl=300, purpose="selfcheck", by="ctl") -> (token, Session)
    auth.users.list() | auth.sessions.list() | auth.status()
    verify(data_dir) -> dict          module function: counts of any directory's auth files, read-only

Roles
    The first login ``MONEY_FOUNDERS`` names is the stand's **owner**: it saves the documents and
    is the only one who adds people, issues their links, disables them and says what each may do.
    Everybody else is a **reader** - the documents are sent to them and never taken from them -
    until the owner makes them an **editor**, who saves like the owner and manages nobody. The
    role is read from ``users.json`` at every request, so a change holds from the next one.
    People the owner adds from the page live in ``users.json`` only (``added``: by whom, when).

The parts, for tests and for anything unusual: ``auth.users`` (``Users``), ``auth.invites``
(``Invites``), ``auth.sessions`` (``Sessions``), ``auth.limiter`` (``Limiter``).

Pure functions for the HTTP layer::

    client_address(peer, forwarded_for, settings.trusted_proxies) -> str
    address_key(addr) -> str                          IPv4 as it is, IPv6 by its /64
    is_loopback(addr) -> bool                         for /healthz
    host_ok(settings, host_header) -> bool            else 421
    origin_ok(settings, origin_header) -> bool
    fetch_site_ok(sec_fetch_site, method) -> bool
    api_refusal(settings, method, origin, sec_fetch_site) -> None | "bad_origin"      else 403
    is_json(content_type) -> bool                     else 415
    cookie_token(settings, cookie_header) -> str | None
    session_cookie(settings, token) -> str            the Set-Cookie value after sign-in
    clear_session_cookie(settings) -> str             the Set-Cookie value after sign-out
    has_legacy_cookie(cookie_header) / clear_legacy_cookie(settings)      the platform's old ssp_session
    invite_link(public_url, token) -> str

    hash_password(password, kdf="scrypt") -> str
    verify_password(password, stored, kdf="scrypt", allow_pbkdf2=False) -> Verdict(ok, new_hash)
    check_password(password, login, first_name)       raises WeakPassword

On disk (``<data>/auth/``, written whole: temporary file, fsync, rename, under flock)
    ``users.json``     per login: password hash, generation, disabled, a reserved ``totp``, and the
                       sha256 and expiry of a pending one-time link; where the owner has said so,
                       a ``name``, a ``role`` ("reader" | "editor") and, for a login the page added,
                       ``added``. Damaged -> ``AuthDamaged``; it is never repaired by guessing.
    ``USERS_WRITTEN``  left beside it by its first write. With it there, a ``users.json`` that is
                       missing was lost: ``AuthDamaged``, as for a damaged one - never "no accounts
                       yet". (To begin the accounts anew on purpose, a person deletes both.)
    ``sessions.json``  sha256(token) -> login, created, seen, expires, address, user agent.
                       Damaged -> moved aside as ``sessions.json.damaged-<utc>`` and treated as
                       empty: everybody signs in again.

  The directory itself is made by the stand's first start (``store.prepare_data_dir``). When it
  has gone later, the accounts are lost with it: ``AuthDamaged``, and it is not made anew.

Nothing here is secret-keyed: tokens are random and kept as sha256, nothing is signed.
Time comes from the injected ``clock``; only waiting for a hash slot or a lock runs on the real one.
"""
import collections
import contextlib
import copy
import datetime
import errno
import hashlib
import hmac
import ipaddress
import json
import math
import os
import re
import secrets
import threading
import time
import unicodedata
from typing import Any, Dict, Iterator, List, NamedTuple, Optional, Sequence, Tuple

from .config import Clock, Refusal, as_utc, iso, parse_iso, stamp, utcnow
from .store import FileLock, LockTimeout, Unsynced, atomic_write, has_run, parse_json

__all__ = [
    "Auth", "Identity", "NewSession", "Users", "User", "Invites", "Sessions", "Session", "Limiter", "Attempt",
    "AuthError", "MissingCredentials", "InvalidCredentials", "TooManyAttempts", "Busy", "InvalidLink",
    "WeakPassword", "AuthDamaged", "AuthStorageFailed", "UnknownLogin", "LoginDisabled",
    "WrongPassword", "BadPerson", "LoginTaken", "TooManyPeople", "OwnerFixed", "Person", "ROLES", "PEOPLE_MAX",
    "hash_password", "verify_password", "Verdict", "check_password", "normalize_password",
    "client_address", "address_key", "is_loopback", "host_ok", "origin_ok", "fetch_site_ok", "api_refusal",
    "is_json", "cookie_token", "session_cookie", "clear_session_cookie", "has_legacy_cookie",
    "clear_legacy_cookie", "invite_link", "verify",
    "PASSWORD_MIN", "PASSWORD_MAX", "PASSWORD_DENY", "LEGACY_COOKIE",
]

MIB = 1024 * 1024

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class AuthError(Refusal):
    """Base of what the sign-in doors answer with: ``status``, ``code``, ``message``, ``extra()``, ``body()``."""

    sentence = "Something broke on our side."

    def __init__(self, message: Optional[str] = None):
        super().__init__(message or self.sentence)


class MissingCredentials(AuthError):
    status = 400
    code = "missing_credentials"
    sentence = "A login and a password are both needed."


class InvalidCredentials(AuthError):
    """Every failed sign-in, whatever the reason: one answer, so nothing is told apart."""
    status = 401
    code = "invalid_credentials"
    sentence = "That login and password do not match."


class TooManyAttempts(AuthError):
    """The limiter refused. ``retry_after`` is in seconds; send it as ``retryAfter`` and ``Retry-After``."""
    status = 429
    code = "too_many_attempts"
    sentence = "Too many attempts. Try again in a few minutes."

    def __init__(self, retry_after: int, key: str = "address", first: bool = False):
        super().__init__()
        self.retry_after = int(retry_after)
        #: Which count is full: "address", "login" or "setup".
        self.key = key
        #: True for the first refusal of that count in its window - the one worth a log line.
        self.first = first

    def extra(self) -> Dict[str, Any]:
        return {"retryAfter": self.retry_after}


class Busy(AuthError):
    """No hash slot came free in time, or a file's lock stayed taken."""
    status = 503
    code = "busy"
    sentence = "The server is busy. Try again in a moment."


class InvalidLink(AuthError):
    """An unknown, a used, a replaced and an expired link answer alike."""
    status = 404
    code = "invalid_link"
    sentence = "That link does not work any more."


class WeakPassword(AuthError):
    status = 400
    code = "weak_password"
    sentence = ("Choose another password: 12 to 256 characters, without your login, "
                "your name or a common word.")

    def __init__(self, reason: str):
        super().__init__()
        #: "too_short" | "too_long" | "contains_login" | "contains_name" | "common" | "unusable"
        self.reason = reason
        self.minimum = PASSWORD_MIN

    def extra(self) -> Dict[str, Any]:
        return {"min": self.minimum}


class AuthDamaged(AuthError):
    """``users.json`` cannot be read. The boot stops; a running server answers 503 on the sign-in doors."""
    status = 503
    code = "auth_damaged"
    sentence = "The accounts file is damaged. Nobody can sign in until it is repaired."


class AuthStorageFailed(AuthError):
    """The disk refused a write of the accounts or the sessions (full, read-only). Nothing was half-written."""
    status = 507
    code = "storage_failed"
    sentence = "The server could not write to its disk."


class UnknownLogin(AuthError):
    """For ``ctl`` and the owner's doors: nobody on this stand has that login."""
    status = 404
    code = "unknown_login"
    sentence = "That login is not one of this stand's people."


class LoginDisabled(AuthError):
    """For ``ctl``: the login is disabled, so no link is issued for it."""
    status = 409
    code = "login_disabled"
    sentence = "That login is disabled. Enable it first."


class WrongPassword(AuthError):
    """A signed-in person was asked for their own password again, and it is not this one.

    403 and never 401: the page reads 401 as "the sign-in has ended" and stops saving.
    """
    status = 403
    code = "wrong_password"
    sentence = "That is not your password."


class BadPerson(AuthError):
    """A login, a name or a role the owner's doors cannot take. ``reason`` says which."""
    status = 400
    code = "bad_person"
    sentence = "That login, name or role cannot be used."

    def __init__(self, reason: str):
        super().__init__()
        #: "login" | "name" | "role" | "nothing"
        self.reason = reason

    def extra(self) -> Dict[str, Any]:
        return {"reason": self.reason}


class LoginTaken(AuthError):
    status = 409
    code = "login_taken"
    sentence = "Somebody on this stand has that login already."


class TooManyPeople(AuthError):
    status = 409
    code = "too_many_people"
    sentence = "This stand holds as many people as it is built for."


class OwnerFixed(AuthError):
    """The owner cannot be disabled or given another role from the page: nobody could undo it."""
    status = 409
    code = "owner_fixed"
    sentence = "The owner's own sign-in is not changed from the page."


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------

#: scrypt as it is run for a new hash: about 32 MiB and a quarter of a second.
SCRYPT_LOG_N = 15
SCRYPT_R = 8
SCRYPT_P = 3
SCRYPT_DKLEN = 32
#: OpenSSL refuses n=2**15 under its default of 32 MiB, so the ceiling is passed.
SCRYPT_MAXMEM = 64 * MIB
SALT_BYTES = 16
#: The dev stand's stand-in where hashlib has no scrypt. Never accepted on prod or test.
PBKDF2_ITERATIONS = 20_000

PASSWORD_MIN = 12
PASSWORD_MAX = 256
PASSWORD_DENY = ("password", "пароль", "qwerty", "123456", "selfstudio", "money", "finance")


class Verdict(NamedTuple):
    ok: bool
    #: When ``ok`` and the stored hash is not what ``hash_password`` would make today: its replacement.
    new_hash: Optional[str]


def normalize_password(password: str) -> bytes:
    """NFKC, then UTF-8: what is hashed. Raises ``ValueError`` for text that cannot be encoded."""
    if not isinstance(password, str):
        raise ValueError("a password is text")
    return unicodedata.normalize("NFKC", password).encode("utf-8")


def _scrypt(secret: bytes, salt: bytes, log_n: int, r: int, p: int, dklen: int = SCRYPT_DKLEN) -> bytes:
    """``hashlib.scrypt`` with the memory ceiling passed. Raises ``ValueError`` where scrypt is absent or refuses."""
    scrypt = getattr(hashlib, "scrypt", None)
    if scrypt is None:
        raise ValueError("this Python has no hashlib.scrypt")
    return scrypt(secret, salt=salt, n=1 << log_n, r=r, p=p, dklen=dklen, maxmem=SCRYPT_MAXMEM)


def hash_password(password: str, kdf: str = "scrypt") -> str:
    """A new hash of ``password``: ``scrypt$15$8$3$<salt hex>$<hash hex>``.

    ``kdf="pbkdf2"`` gives ``pbkdf2$<iterations>$<salt hex>$<hash hex>`` - for the dev stand only.
    """
    secret = normalize_password(password)
    salt = secrets.token_bytes(SALT_BYTES)
    if kdf == "scrypt":
        digest = _scrypt(secret, salt, SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P)
        return "scrypt$%d$%d$%d$%s$%s" % (SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, salt.hex(), digest.hex())
    if kdf == "pbkdf2":
        digest = hashlib.pbkdf2_hmac("sha256", secret, salt, PBKDF2_ITERATIONS, SCRYPT_DKLEN)
        return "pbkdf2$%d$%s$%s" % (PBKDF2_ITERATIONS, salt.hex(), digest.hex())
    raise ValueError("no such password hash: %r" % (kdf,))


def _small_int(text: str, low: int, high: int) -> int:
    if not (text.isascii() and text.isdigit()) or len(text) > 9:
        raise ValueError("not a number")
    value = int(text)
    if not low <= value <= high:
        raise ValueError("out of range")
    return value


def verify_password(password: str, stored: Optional[str], kdf: str = "scrypt",
                    allow_pbkdf2: bool = False) -> Verdict:
    """Check ``password`` against a stored hash. Never raises for a bad password or a bad hash.

    The parameters travel in the stored string, so an older hash still verifies;
    ``new_hash`` is then its replacement with today's parameters (``kdf`` names
    today's scheme). A ``pbkdf2`` hash verifies only with ``allow_pbkdf2`` - on
    the dev stand; anywhere else it is as good as no hash.
    """
    if not isinstance(password, str) or not isinstance(stored, str):
        return Verdict(False, None)
    try:
        secret = normalize_password(password)
        parts = stored.split("$")
        if parts[0] == "scrypt" and len(parts) == 6:
            log_n = _small_int(parts[1], 10, 20)
            r = _small_int(parts[2], 1, 32)
            p = _small_int(parts[3], 1, 16)
            salt, expected = bytes.fromhex(parts[4]), bytes.fromhex(parts[5])
            if 128 * r * (1 << log_n) > SCRYPT_MAXMEM or not 8 <= len(salt) <= 64 or not 16 <= len(expected) <= 64:
                return Verdict(False, None)
            actual = _scrypt(secret, salt, log_n, r, p, len(expected))
            current = kdf == "scrypt" and (log_n, r, p, len(expected), len(salt)) == (
                SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN, SALT_BYTES)
            # A scrypt hash is never traded for a weaker one, whatever the stand's scheme is.
            upgrade = kdf == "scrypt" and not current
        elif parts[0] == "pbkdf2" and len(parts) == 4:
            if not allow_pbkdf2:
                return Verdict(False, None)
            iterations = _small_int(parts[1], 1000, 10_000_000)
            salt, expected = bytes.fromhex(parts[2]), bytes.fromhex(parts[3])
            if not 8 <= len(salt) <= 64 or not 16 <= len(expected) <= 64:
                return Verdict(False, None)
            actual = hashlib.pbkdf2_hmac("sha256", secret, salt, iterations, len(expected))
            upgrade = kdf == "scrypt" or (iterations, len(expected), len(salt)) != (
                PBKDF2_ITERATIONS, SCRYPT_DKLEN, SALT_BYTES)
        else:
            return Verdict(False, None)
    except (ValueError, TypeError, OverflowError, MemoryError):
        return Verdict(False, None)
    if not hmac.compare_digest(actual, expected):
        return Verdict(False, None)
    if not upgrade:
        return Verdict(True, None)
    try:
        return Verdict(True, hash_password(password, kdf))
    except (ValueError, MemoryError):
        return Verdict(True, None)


def check_password(password: Any, login: str, first_name: str) -> None:
    """The rules for a new password. Raises ``WeakPassword`` (``.reason`` says which rule).

    12 to 256 characters after NFKC, and not containing the login, the first
    name or a word of ``PASSWORD_DENY``, whatever the letter case.
    """
    if not isinstance(password, str):
        raise WeakPassword("unusable")
    try:
        normal = unicodedata.normalize("NFKC", password)
        normal.encode("utf-8")
    except (ValueError, UnicodeError):
        raise WeakPassword("unusable")
    if len(normal) < PASSWORD_MIN:
        raise WeakPassword("too_short")
    if len(normal) > PASSWORD_MAX:
        raise WeakPassword("too_long")
    folded = normal.casefold()
    if login and unicodedata.normalize("NFKC", login).casefold() in folded:
        raise WeakPassword("contains_login")
    if first_name and unicodedata.normalize("NFKC", first_name).casefold() in folded:
        raise WeakPassword("contains_name")
    if any(word in folded for word in PASSWORD_DENY):
        raise WeakPassword("common")


# ---------------------------------------------------------------------------
# What every request passes (pure functions)
# ---------------------------------------------------------------------------

def _ip(text: Any) -> Any:
    """An address as an ``ipaddress`` object, or None. ``::ffff:1.2.3.4`` is 1.2.3.4; a zone id is dropped."""
    if not isinstance(text, str):
        return None
    text = text.strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    text = text.split("%", 1)[0]
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return None
    if address.version == 6 and address.ipv4_mapped is not None:
        return address.ipv4_mapped
    return address


def client_address(peer: Any, forwarded_for: Any, trusted: Sequence[Any]) -> str:
    """The address a request is counted and logged under.

    It is the peer's own, unless the peer is inside ``trusted`` (the networks of
    ``MONEY_TRUSTED_PROXIES``); then it is the right-most entry of
    ``X-Forwarded-For``, the one the edge itself appended - a header a client
    sent cannot move that. An entry that is not an address leaves the peer's.

    ``forwarded_for`` is the header's value, or the list of its values when the
    header came more than once. ``X-Forwarded-Proto`` is never asked.
    """
    address = _ip(peer)
    if address is None:
        return "0.0.0.0"
    if forwarded_for and any(address.version == net.version and address in net for net in trusted):
        if isinstance(forwarded_for, (list, tuple)):
            forwarded_for = ",".join(str(value) for value in forwarded_for)
        if isinstance(forwarded_for, str) and len(forwarded_for) <= 4096:
            entries = [entry.strip() for entry in forwarded_for.split(",")]
            entries = [entry for entry in entries if entry]
            last = _ip(entries[-1]) if entries else None
            if last is not None:
                return str(last)
    return str(address)


def address_key(addr: Any) -> str:
    """What an address is counted as: itself for IPv4, its /64 for IPv6 (one subscriber, many addresses)."""
    address = _ip(addr)
    if address is None:
        return "?"
    if address.version == 6:
        return str(ipaddress.IPv6Network((int(address) >> 64 << 64, 64)))
    return str(address)


def is_loopback(addr: Any) -> bool:
    address = _ip(addr)
    return address is not None and bool(address.is_loopback)


def host_ok(settings: Any, host_header: Any) -> bool:
    """``Host`` must be the host of the public URL, exactly (letter case aside). Else the answer is 421."""
    return isinstance(host_header, str) and host_header.strip().lower() == settings.public_host


def origin_ok(settings: Any, origin_header: Any) -> bool:
    """``Origin`` must equal the public URL, character for character."""
    return isinstance(origin_header, str) and origin_header.strip() == settings.public_url


def fetch_site_ok(sec_fetch_site: Any, method: str) -> bool:
    """``Sec-Fetch-Site``, when a browser sends it: ``same-origin``, or ``none`` for a typed GET."""
    if sec_fetch_site is None:
        return True
    value = sec_fetch_site.strip().lower() if isinstance(sec_fetch_site, str) else ""
    if value == "same-origin":
        return True
    return value == "none" and str(method).upper() in ("GET", "HEAD")


def api_refusal(settings: Any, method: str, origin: Any, sec_fetch_site: Any) -> Optional[str]:
    """The cross-site rules of an ``/api/`` request: None when it may go on, else the code of a 403.

    * ``Sec-Fetch-Site``, when present, as ``fetch_site_ok``;
    * anything but GET and HEAD must carry ``Origin`` equal to the public URL;
    * a GET or HEAD that does carry an ``Origin`` must carry the right one.
    """
    if not fetch_site_ok(sec_fetch_site, method):
        return "bad_origin"
    if str(method).upper() in ("GET", "HEAD"):
        return None if origin is None or origin_ok(settings, origin) else "bad_origin"
    return None if origin_ok(settings, origin) else "bad_origin"


def is_json(content_type: Any) -> bool:
    """Whether a ``Content-Type`` is ``application/json`` (parameters such as a charset aside). Else 415."""
    return isinstance(content_type, str) and content_type.split(";", 1)[0].strip().lower() == "application/json"


_TOKEN = re.compile(r"[A-Za-z0-9_-]{20,128}")
LEGACY_COOKIE = "ssp_session"


def cookie_token(settings: Any, cookie_header: Any) -> Optional[str]:
    """The session token out of a ``Cookie`` header, or None. Join several Cookie headers with ``"; "``.

    Only this stand's cookie name is looked at, and only a value shaped like a
    token comes back; the platform's old ``ssp_session`` is ignored.
    """
    if not isinstance(cookie_header, str) or len(cookie_header) > 16384:
        return None
    for part in cookie_header.split(";"):
        name, equals, value = part.strip().partition("=")
        if equals and name == settings.cookie_name:
            value = value.strip()
            if _TOKEN.fullmatch(value):
                return value
    return None


def _cookie(name: str, value: str, secure: bool, max_age: int) -> str:
    return "%s=%s; Path=/; %sHttpOnly; SameSite=Lax; Max-Age=%d" % (name, value, "Secure; " if secure else "", max_age)


def session_cookie(settings: Any, token: str) -> str:
    """``__Host-money=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`` (dev: ``money-dev``, no Secure)."""
    return _cookie(settings.cookie_name, token, settings.cookie_secure, settings.session_ttl)


def clear_session_cookie(settings: Any) -> str:
    """The same cookie with the attributes it was set with, emptied and expired."""
    return _cookie(settings.cookie_name, "", settings.cookie_secure, 0)


def has_legacy_cookie(cookie_header: Any) -> bool:
    """Whether the browser still sends the platform's ``ssp_session`` to this name."""
    if not isinstance(cookie_header, str):
        return False
    return any(part.strip().startswith(LEGACY_COOKIE + "=") for part in cookie_header.split(";"))


def clear_legacy_cookie(settings: Any) -> str:
    """A ``Set-Cookie`` value that removes the platform's old cookie. Its value is never read or logged."""
    return _cookie(LEGACY_COOKIE, "", settings.cookie_secure, 0)


def invite_link(public_url: str, token: str) -> str:
    """The one-time link. The token is in the fragment, so it reaches no server log and no Referer."""
    return "%s/set-password#t=%s" % (public_url, token)


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# A small JSON file that two processes share
# ---------------------------------------------------------------------------

class _Unreadable(Exception):
    """The file is there and is not what this program writes."""


class _JsonFile:
    """Whole-file reads cached by (inode, mtime, size); writes under a thread lock and flock.

    The cache is believed for two seconds at most: file times are coarse on
    some systems, and "the other process closed a session" must not depend on
    two writes happening to look alike.
    """

    MAX_BYTES = 4 * MIB
    BELIEVE = 2.0

    def __init__(self, path: str, check: Any, lock_timeout: float = 10.0, unsynced: Any = None):
        self.path = path
        self._check = check
        self._lockfile = os.path.join(os.path.dirname(path), ".%s.lock" % os.path.basename(path))
        self._lock_timeout = lock_timeout
        #: Called with the file's name when a write is in place but its directory could not be synced.
        self._unsynced = unsynced
        self._thread_lock = threading.RLock()
        self._depth = 0
        self._flock = None  # type: Optional[FileLock]
        # (signature, content, when it was read on the monotonic clock)
        self._cache = None  # type: Optional[Tuple[Tuple[int, int, int], Dict[str, Any], float]]

    def read(self, fresh: bool = False) -> Optional[Dict[str, Any]]:
        """The file's content - shared, do not change it - or None when there is no file.

        Raises ``_Unreadable``. ``fresh`` reads the disk even when the file looks unchanged.
        """
        try:
            with open(self.path, "rb") as handle:
                status = os.fstat(handle.fileno())
                signature = (status.st_ino, status.st_mtime_ns, status.st_size)
                cache = self._cache
                if (not fresh and cache is not None and cache[0] == signature
                        and time.monotonic() - cache[2] < self.BELIEVE):
                    return cache[1]
                if status.st_size > self.MAX_BYTES:
                    raise _Unreadable("it is far larger than it can be")
                raw = handle.read()
        except FileNotFoundError:
            self._cache = None
            return None
        except OSError as error:
            raise _Unreadable("it cannot be read (%s)" % errno.errorcode.get(error.errno, "error"))
        try:
            data = parse_json(raw, max_depth=8)
        except ValueError:
            raise _Unreadable("it is empty, cut short or not JSON")
        self._check(data)
        self._cache = (signature, data, time.monotonic())
        return data

    @contextlib.contextmanager
    def locked(self) -> Iterator[None]:
        """Hold the file for a read-change-write. Re-entrant within a thread.

        Raises ``Busy`` when the lock stays taken and ``AuthStorageFailed`` when the directory cannot be used -
        or is not there on a stand that has run before: that directory was lost, and is not made anew.
        """
        if not self._thread_lock.acquire(timeout=self._lock_timeout):
            raise Busy()
        try:
            if self._depth == 0:
                lock = FileLock(self._lockfile, self._lock_timeout)
                directory = os.path.dirname(self.path)
                if not os.path.isdir(directory) and has_run(os.path.dirname(directory)):
                    raise AuthStorageFailed("The accounts directory is missing, although this stand has run "
                                            "before. It is not made anew.")
                try:
                    try:
                        os.mkdir(directory, 0o700)
                    except FileExistsError:
                        pass
                    lock.__enter__()
                except LockTimeout:
                    raise Busy()
                except OSError as error:
                    raise AuthStorageFailed("The server could not use its accounts directory (%s)."
                                            % errno.errorcode.get(error.errno, "error"))
                self._flock = lock
            self._depth += 1
            try:
                yield
            finally:
                self._depth -= 1
                if self._depth == 0 and self._flock is not None:
                    lock, self._flock = self._flock, None
                    lock.__exit__(None, None, None)
        finally:
            self._thread_lock.release()

    def write(self, data: Dict[str, Any]) -> None:
        """Replace the file. Call inside ``locked()``. Raises ``AuthStorageFailed`` when the file is as it was.

        A write that is in place while only the sync of its directory failed is a write: every
        reader gets the new file, so saying "as it was" would be false - a link would be spent,
        a password set, and the caller told that nothing happened. It is noted, not raised.
        """
        raw = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("ascii") + b"\n"
        try:
            # Under the lock nobody else is writing: a temporary file here is a crash's leftover.
            directory, prefix = os.path.split(self.path)
            for name in os.listdir(directory):
                if name.startswith(prefix + ".tmp-"):
                    os.unlink(os.path.join(directory, name))
            atomic_write(self.path, (raw,))
        except Unsynced:
            if self._unsynced is not None:
                self._unsynced(os.path.basename(self.path))
        except OSError as error:
            raise AuthStorageFailed("The server could not write %s (%s); the file is as it was."
                                    % (os.path.basename(self.path), errno.errorcode.get(error.errno, "error")))
        try:
            status = os.stat(self.path)
            self._cache = ((status.st_ino, status.st_mtime_ns, status.st_size), data, time.monotonic())
        except OSError:
            self._cache = None


def _is_time(value: Any) -> bool:
    try:
        parse_iso(value)
        return True
    except ValueError:
        return False


_HEX64 = re.compile(r"[0-9a-f]{64}")
_LOGIN = re.compile(r"[a-z][a-z0-9._-]{0,31}")
#: The marker beside ``users.json``: the file has been written here, so its absence is a loss.
_USERS_WRITTEN = "USERS_WRITTEN"


def _lost_accounts(data_dir: str) -> Optional[str]:
    """Why a ``users.json`` that is not in ``data_dir`` is a loss; None when no account was written there yet.

    Either the marker beside it says that it was written, or its whole directory has gone on
    a stand that has run before (``STAND`` is written after ``auth/`` is made).
    """
    directory = os.path.join(data_dir, "auth")
    if os.path.lexists(os.path.join(directory, _USERS_WRITTEN)):
        return "it is missing, although accounts have been written here before"
    if not os.path.isdir(directory) and has_run(data_dir):
        return "its directory is missing, although this stand has run before"
    return None


def _noting(security_log: Any) -> Any:
    """What a ``_JsonFile`` calls when a write is in place but unconfirmed: a line in the security log, or nothing."""
    if security_log is None:
        return None

    def note(name: str) -> None:
        security_log.write("storage-unsynced", file=name)
    return note


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

#: What a person may do. "owner" is never stored: it is the first login MONEY_FOUNDERS names.
ROLES = ("owner", "editor", "reader")
#: How many accounts a stand holds at most, MONEY_FOUNDERS and the people the owner added together.
PEOPLE_MAX = 20


class User(NamedTuple):
    login: str
    first_name: str
    #: Named by MONEY_FOUNDERS, or added by the owner from the page. An account that is neither -
    #: one the list has dropped - cannot sign in.
    listed: bool
    disabled: bool
    has_password: bool
    #: Counts the passwords set through a link. A session remembers the number it was made under
    #: and is void once it has moved on - that is how a new password closes the old sessions.
    gen: int
    password_set_at: Optional[str]
    #: When the pending one-time link runs out; None when there is none.
    invite_expires: Optional[str]
    #: Reserved for a one-time code from an authenticator app. Always None in this version.
    totp: Any = None
    #: "owner" | "editor" | "reader". Without a word from the owner a person only looks.
    role: str = "reader"
    #: Added by the owner from the page, and so known to ``users.json`` alone.
    added: bool = False

    @property
    def can_sign_in(self) -> bool:
        return self.listed and not self.disabled


def _is_name(value: Any) -> bool:
    """A first name as MONEY_FOUNDERS would take one: 1 to 40 characters, no control character, no colon."""
    return (isinstance(value, str) and 0 < len(value) <= 40 and value == value.strip() and ":" not in value
            and not any(ord(ch) < 32 or ord(ch) == 127 for ch in value))


def _check_users(data: Any) -> None:
    if not isinstance(data, dict) or data.get("v") != 1 or not isinstance(data.get("users"), dict):
        raise _Unreadable("it is not an accounts file")
    for login, record in data["users"].items():
        ok = (
            isinstance(login, str) and _LOGIN.fullmatch(login) is not None and isinstance(record, dict)
            and "hash" in record
            and (record["hash"] is None or (isinstance(record["hash"], str) and 0 < len(record["hash"]) <= 512))
            and isinstance(record.get("gen"), int) and not isinstance(record.get("gen"), bool) and record["gen"] >= 0
            and isinstance(record.get("disabled"), bool)
            and (record.get("setAt") is None or _is_time(record["setAt"]))
            and (record.get("name") is None or _is_name(record["name"]))
            and record.get("role") in (None, "reader", "editor")
        )
        added = record.get("added") if ok else None
        if ok and added is not None:
            ok = (isinstance(added, dict) and isinstance(added.get("by"), str)
                  and _LOGIN.fullmatch(added["by"]) is not None and _is_time(added.get("at")))
        invite = record.get("invite") if ok else None
        if ok and invite is not None:
            ok = (isinstance(invite, dict) and isinstance(invite.get("sha256"), str)
                  and _HEX64.fullmatch(invite["sha256"]) is not None
                  and _is_time(invite.get("expires")) and _is_time(invite.get("issued")))
        if not ok:
            raise _Unreadable("an account in it is not as this program writes one")


def _blank_user() -> Dict[str, Any]:
    return {"hash": None, "gen": 0, "disabled": False, "setAt": None, "invite": None, "totp": None}


class Users:
    """The accounts: the logins of ``MONEY_FOUNDERS`` and the people the owner added, kept in
    ``<data>/auth/users.json``.

    ``founders`` is ``settings.founders`` (pairs or a mapping login -> first name). The first of
    them is the stand's owner (``owner``); a name or a role the owner has given somebody is in
    the file and comes before what the list says.
    The file is read again whenever it changes on disk, so what ``ctl`` does
    reaches a running server at its next request. Every method raises
    ``AuthDamaged`` while the file cannot be read; writers may raise ``Busy``
    and ``AuthStorageFailed``.

    A file that is not there is "no accounts yet" only on a stand that has
    never written one. The first write leaves the marker ``USERS_WRITTEN``
    beside the file; with the marker there, a missing file was lost, and that
    is ``AuthDamaged`` like a file that cannot be read - not three founders
    quietly made anew without passwords, every session void and the open pages
    told 401. The same when the whole ``auth/`` directory has gone on a stand
    that has run before.
    """

    #: Beside ``users.json``: says that the file has been written here, so that its absence is a loss.
    WRITTEN = _USERS_WRITTEN

    def __init__(self, data_dir: str, founders: Any, clock: Clock = utcnow, *, lock_timeout: float = 10.0,
                 security_log: Any = None):
        self._founders = collections.OrderedDict(founders.items() if hasattr(founders, "items") else founders)
        #: The first login MONEY_FOUNDERS names: the one who saves and who manages the others.
        self.owner = next(iter(self._founders), None)
        self._clock = clock
        self._data_dir = data_dir
        self.path = os.path.join(data_dir, "auth", "users.json")
        self._written = os.path.join(data_dir, "auth", self.WRITTEN)
        self._file = _JsonFile(self.path, _check_users, lock_timeout, unsynced=_noting(security_log))

    # -- lost, or not written yet? ---------------------------------------------

    def _lost(self) -> Optional[str]:
        """Why a ``users.json`` that is not there is a loss; None when no account was written here yet."""
        return _lost_accounts(self._data_dir)

    def _refuse_lost(self) -> None:
        if not os.path.lexists(self.path):
            why = self._lost()
            if why is not None:
                raise AuthDamaged("The accounts file is damaged: %s. Nobody can sign in until it is repaired." % why)

    def _mark_written(self) -> None:
        """Leave the marker: from now on a ``users.json`` that is missing here was lost."""
        if os.path.lexists(self._written):
            return
        try:
            atomic_write(self._written, (iso(self._clock()).encode("ascii") + b"\n",))
        except OSError:
            pass            # the accounts themselves are written; the next write tries the marker again

    # -- reading -------------------------------------------------------------

    def _records(self, fresh: bool = False) -> Dict[str, Any]:
        try:
            data = self._file.read(fresh)
        except _Unreadable as why:
            raise AuthDamaged("The accounts file is damaged: %s. Nobody can sign in until it is repaired." % why)
        if data is None:
            self._refuse_lost()
            return {}
        return data["users"]

    def _listed(self, login: str, record: Optional[Dict[str, Any]]) -> bool:
        """Named by MONEY_FOUNDERS, or added by the owner."""
        return login in self._founders or bool(record and record.get("added"))

    def _user(self, login: str, record: Optional[Dict[str, Any]]) -> User:
        record = record or _blank_user()
        invite = record.get("invite")
        return User(
            login=login, first_name=record.get("name") or self._founders.get(login, login),
            listed=self._listed(login, record),
            disabled=bool(record["disabled"]), has_password=record["hash"] is not None, gen=record["gen"],
            password_set_at=record.get("setAt"), invite_expires=invite["expires"] if invite else None,
            totp=record.get("totp"),
            role="owner" if login == self.owner else (record.get("role") or "reader"),
            added=bool(record.get("added")))

    def get(self, login: Any) -> Optional[User]:
        """The account of ``login``, or None when neither the founders list nor the file knows it."""
        if not isinstance(login, str):
            return None
        record = self._records().get(login)
        if record is None and login not in self._founders:
            return None
        return self._user(login, record)

    def list(self) -> List[User]:
        """The founders in the order MONEY_FOUNDERS names them, then the people the owner added, in the
        order they were added, then accounts the list has dropped."""
        records = self._records()
        users = [self._user(login, records.get(login)) for login in self._founders]
        rest = [login for login in records if login not in self._founders]
        rest.sort(key=lambda login: (not records[login].get("added"), (records[login].get("added") or {}).get("at", ""), login))
        users += [self._user(login, records[login]) for login in rest]
        return users

    def password_hash(self, login: str) -> Optional[str]:
        record = self._records().get(login)
        return record["hash"] if record else None

    def credentials(self, login: Any) -> Tuple[Optional[User], Optional[str]]:
        """The account and its stored hash, taken from one reading of the file.

        A sign-in checks the password against this hash and gives the session
        this account's generation; read apart, a password set in between could
        hand a session of the new generation to the old password.
        """
        if not isinstance(login, str):
            return None, None
        record = self._records().get(login)
        if record is None and login not in self._founders:
            return None, None
        return self._user(login, record), record["hash"] if record else None

    def status(self) -> Dict[str, Any]:
        """Counts for ``ctl doctor``; never a hash. Does not raise: a damaged file is a state."""
        try:
            users = self.list()
        except AuthDamaged as damaged:
            return {"state": "damaged", "problem": damaged.message}
        return {
            "state": "ok" if os.path.exists(self.path) else "missing",
            "problem": None,
            "founders": sum(1 for user in users if user.listed),
            "added": sum(1 for user in users if user.added),
            "withPassword": sum(1 for user in users if user.listed and user.has_password),
            "disabled": sum(1 for user in users if user.disabled),
            "pendingLinks": sum(1 for user in users if user.invite_expires),
            "notListed": sum(1 for user in users if not user.listed),
        }

    # -- writing -------------------------------------------------------------

    def _change(self, login: Optional[str], change: Any) -> Any:
        """Read the file anew under the lock, let ``change(records)`` edit a copy, write it if it asks to.

        A file that was lost is not written anew: ``AuthDamaged``, before the lock is taken and again under it.
        """
        self._refuse_lost()
        with self._file.locked():
            try:
                data = self._file.read(fresh=True)
            except _Unreadable as why:
                raise AuthDamaged("The accounts file is damaged: %s. Nobody can sign in until it is repaired." % why)
            if data is None:
                self._refuse_lost()
                data = {"v": 1, "users": {}}
            else:
                data = copy.deepcopy(data)
            records = data["users"]
            if login is not None and login not in records:
                if login not in self._founders:
                    raise UnknownLogin()
                records[login] = _blank_user()
            write, result = change(records)
            if write:
                self._file.write(data)
                self._mark_written()
            return result

    def ensure(self) -> None:
        """The boot step: make the file and an account without a password for each founder it lacks.

        Raises ``AuthDamaged`` when a file is there and cannot be read, or was there and is gone -
        the boot stops on it. A file from before the marker existed gets its marker here.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, None]:
            missing = [login for login in self._founders if login not in records]
            for login in missing:
                records[login] = _blank_user()
            return bool(missing) or not os.path.exists(self.path), None
        self._change(None, change)
        if os.path.exists(self.path):
            self._mark_written()

    def set_password(self, login: str, password_hash: str) -> User:
        """Store a new password hash, drop any pending link, and move the generation on (old sessions are void)."""
        def change(records: Dict[str, Any]) -> Tuple[bool, User]:
            record = records[login]
            record.update(hash=password_hash, gen=record["gen"] + 1, setAt=iso(self._clock()), invite=None)
            return True, self._user(login, record)
        return self._change(login, change)

    def replace_hash(self, login: str, old_hash: str, new_hash: str) -> bool:
        """Swap a hash for the same password hashed anew. Sessions stay; False when the hash has changed since."""
        def change(records: Dict[str, Any]) -> Tuple[bool, bool]:
            record = records.get(login)
            if record is None or record["hash"] != old_hash:
                return False, False
            record["hash"] = new_hash
            return True, True
        return self._change(None, change)

    def change_password(self, login: str, old_hash: str, new_hash: str) -> User:
        """Store a password its holder chose while signed in, and move the generation on.

        Only over the hash the current password was checked against: ``Busy`` when the password
        has changed in between, and nothing is written.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, User]:
            record = records.get(login)
            if record is None or record["hash"] != old_hash:
                raise Busy("That password has just been changed from somewhere else; sign in again.")
            record.update(hash=new_hash, gen=record["gen"] + 1, setAt=iso(self._clock()), invite=None)
            return True, self._user(login, record)
        return self._change(None, change)

    def set_disabled(self, login: str, disabled: bool) -> User:
        def change(records: Dict[str, Any]) -> Tuple[bool, User]:
            record = records[login]
            changed = record["disabled"] != bool(disabled)
            record["disabled"] = bool(disabled)
            if disabled:
                record["invite"] = None
            return changed or disabled, self._user(login, record)
        return self._change(login, change)

    def add(self, login: str, name: str, by: str) -> User:
        """A new account without a password, for a person the owner adds. It only looks.

        Raises ``LoginTaken`` (also for a login MONEY_FOUNDERS names and for one the list has
        dropped: a login is never handed to a second person) and ``TooManyPeople``.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, User]:
            if login in records or login in self._founders:
                raise LoginTaken()
            if len(set(records) | set(self._founders)) >= PEOPLE_MAX:
                raise TooManyPeople()
            record = _blank_user()
            record.update(name=name, role="reader", added={"by": by, "at": iso(self._clock())})
            records[login] = record
            return True, self._user(login, record)
        return self._change(None, change)

    def update(self, login: str, name: Optional[str] = None, role: Optional[str] = None) -> Tuple[User, User]:
        """Give a person another name, another role, or both: ``(as it was, as it is)``.

        Raises ``UnknownLogin`` for a login nobody has and for an account the list has dropped,
        ``OwnerFixed`` when a role is named for the owner.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, Tuple[User, User]]:
            record = records[login]
            if not self._listed(login, record):
                raise UnknownLogin()
            if role is not None and login == self.owner:
                raise OwnerFixed()
            before = self._user(login, record)
            if name is not None:
                record["name"] = name
            if role is not None:
                record["role"] = role
            after = self._user(login, record)
            return after != before, (before, after)
        return self._change(login, change)


# ---------------------------------------------------------------------------
# One-time links
# ---------------------------------------------------------------------------

class Invites:
    """One-time links to set a password. They live in ``users.json``, one per login at most.

    48 hours, single use, kept as sha256 only; issuing a new one retires the
    old. ``Auth.set_password`` is the door that spends one.
    """

    def __init__(self, users: Users, clock: Clock = utcnow, ttl: int = 48 * 3600):
        self._users = users
        self._clock = clock
        self._ttl = int(ttl)

    def issue(self, login: str) -> Tuple[str, datetime.datetime]:
        """A fresh token for ``login`` and the moment it runs out. Raises ``UnknownLogin``, ``LoginDisabled``."""
        token = secrets.token_urlsafe(32)
        now = as_utc(self._clock())
        expires = now + datetime.timedelta(seconds=self._ttl)

        def change(records: Dict[str, Any]) -> Tuple[bool, None]:
            record = records[login]
            if not self._users._listed(login, record):
                raise UnknownLogin()            # an account the list has dropped gets no way back in
            if record["disabled"]:
                raise LoginDisabled()
            record["invite"] = {"sha256": _sha256(token), "issued": iso(now), "expires": iso(expires)}
            return True, None
        self._users._change(login, change)
        return token, expires

    def _find(self, records: Dict[str, Any], token: Any) -> Optional[str]:
        """The login whose live link ``token`` is, or None."""
        if not isinstance(token, str) or not _TOKEN.fullmatch(token):
            return None
        digest = _sha256(token)
        now = as_utc(self._clock())
        found = None
        for login, record in records.items():
            invite = record.get("invite")
            if invite and hmac.compare_digest(invite["sha256"], digest) and parse_iso(invite["expires"]) > now:
                found = login
        return found

    def peek(self, token: Any) -> Optional[User]:
        """Whose link this is, without spending it. None for an unknown, a used or an expired one."""
        records = self._users._records()
        login = self._find(records, token)
        return self._users._user(login, records[login]) if login is not None else None

    def redeem(self, token: Any, password_hash: str) -> User:
        """Spend the link and set the password in one write. Raises ``InvalidLink``.

        Two requests with the same link: exactly one gets through.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, User]:
            login = self._find(records, token)
            if login is None:
                raise InvalidLink()
            record = records[login]
            if record["disabled"] or not self._users._listed(login, record):
                raise InvalidLink()
            record.update(hash=password_hash, gen=record["gen"] + 1, setAt=iso(self._clock()), invite=None)
            return True, self._users._user(login, record)
        return self._users._change(None, change)

    def revoke(self, login: str) -> bool:
        """Retire a pending link. True when there was one."""
        def change(records: Dict[str, Any]) -> Tuple[bool, bool]:
            record = records.get(login)
            if record is None or record.get("invite") is None:
                return False, False
            record["invite"] = None
            return True, True
        return self._users._change(None, change)

    def revoke_all(self) -> List[str]:
        """Retire every pending link, in one write. The logins that had one: the founders in their order, then the rest.

        "Pending" is every link on record, also one whose 48 hours have run out: it is dead either way.
        """
        def change(records: Dict[str, Any]) -> Tuple[bool, List[str]]:
            held = [login for login, record in records.items() if record.get("invite") is not None]
            for login in held:
                records[login]["invite"] = None
            return bool(held), held
        held = self._users._change(None, change)
        founders = [login for login in self._users._founders if login in held]
        return founders + sorted(login for login in held if login not in self._users._founders)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class Session(NamedTuple):
    #: The first 12 hex digits of sha256(token): enough to tell sessions apart, useless as a credential.
    id: str
    login: str
    created: datetime.datetime
    seen: datetime.datetime
    expires: datetime.datetime
    addr: str
    agent: str
    gen: int
    #: "web" for a sign-in; "internal" for the short ones ctl makes for a self-check or a seed.
    kind: str


def _check_sessions(data: Any) -> None:
    if not isinstance(data, dict) or data.get("v") != 1 or not isinstance(data.get("sessions"), dict):
        raise _Unreadable("it is not a sessions file")
    for digest, record in data["sessions"].items():
        ok = (
            isinstance(digest, str) and _HEX64.fullmatch(digest) is not None and isinstance(record, dict)
            and isinstance(record.get("login"), str) and _LOGIN.fullmatch(record["login"]) is not None
            and _is_time(record.get("created")) and _is_time(record.get("seen")) and _is_time(record.get("expires"))
            and isinstance(record.get("addr"), str) and isinstance(record.get("agent"), str)
            and isinstance(record.get("gen"), int) and not isinstance(record.get("gen"), bool)
            and record.get("kind") in ("web", "internal")
        )
        if not ok:
            raise _Unreadable("a session in it is not as this program writes one")


class Sessions:
    """Sessions in ``<data>/auth/sessions.json``: sha256(token) -> who, since when, until when.

    30 days from sign-in, 14 days without use, 10 per login at most. The file is
    read again whenever it changes on disk, so a session closed by ``ctl`` is
    closed for the server at its next request. A file that cannot be read is
    moved aside and everybody signs in again.
    """

    def __init__(self, data_dir: str, clock: Clock = utcnow, *, ttl: int = 30 * 86400, idle: int = 14 * 86400,
                 per_login: int = 10, last_day: int = 86400, seen_every: int = 300,
                 security_log: Any = None, lock_timeout: float = 10.0):
        self._clock = clock
        self._ttl = int(ttl)
        self._idle = int(idle)
        self._per_login = max(1, int(per_login))
        self._last_day = int(last_day)
        self._seen_every = int(seen_every)
        self._security_log = security_log
        self.path = os.path.join(data_dir, "auth", "sessions.json")
        self._file = _JsonFile(self.path, _check_sessions, lock_timeout, unsynced=_noting(security_log))

    # -- the file ------------------------------------------------------------

    def _records(self, fresh: bool = False) -> Dict[str, Any]:
        try:
            data = self._file.read(fresh)
        except _Unreadable as why:
            try:
                data = self._set_aside(str(why))
            except (AuthStorageFailed, Busy):
                data = None                 # it could not even be moved: still nobody is signed in
        return data["sessions"] if data is not None else {}

    def _set_aside(self, why: str) -> Optional[Dict[str, Any]]:
        """A sessions file that cannot be read: keep it under another name and start empty."""
        with self._file.locked():
            try:
                return self._file.read(fresh=True)      # the other process may have dealt with it already
            except _Unreadable:
                pass
            now = as_utc(self._clock())
            name = "%s.damaged-%s" % (self.path, stamp(now))
            number = 1
            while os.path.lexists(name):
                number += 1
                name = "%s.damaged-%s-%d" % (self.path, stamp(now), number)
            try:
                os.replace(self.path, name)
            except OSError:
                name = ""
            data = {"v": 1, "sessions": {}}  # type: Dict[str, Any]
            self._file.write(data)
        if self._security_log is not None:
            self._security_log.write("sessions-damaged", detail=os.path.basename(name) or "could not be moved aside",
                                     reason=why)
        return data

    def _change(self, change: Any) -> Any:
        with self._file.locked():
            records = copy.deepcopy(self._records(fresh=True))
            now = as_utc(self._clock())
            dead = [digest for digest, record in records.items() if not self._alive(record, now)]
            for digest in dead:
                del records[digest]
            write, result = change(records, now)
            if write or dead:
                self._file.write({"v": 1, "sessions": records})
            return result

    def _alive(self, record: Dict[str, Any], now: datetime.datetime) -> bool:
        if now >= parse_iso(record["expires"]):
            return False
        return (now - parse_iso(record["seen"])).total_seconds() <= self._idle

    @staticmethod
    def _session(digest: str, record: Dict[str, Any]) -> Session:
        return Session(
            id=digest[:12], login=record["login"], created=parse_iso(record["created"]),
            seen=parse_iso(record["seen"]), expires=parse_iso(record["expires"]), addr=record["addr"],
            agent=record["agent"], gen=record["gen"], kind=record["kind"])

    # -- the doors -----------------------------------------------------------

    def create(self, login: str, addr: str = "", agent: str = "", gen: int = 0, ttl: Optional[int] = None,
               kind: str = "web") -> Tuple[str, Session]:
        """A new session for ``login``: ``(token, session)``. The token exists only in this return value.

        ``ttl`` (seconds) is for the short internal sessions of ``ctl``; a
        sign-in takes the stand's 30 days. Over 10 web sessions of one login,
        the ones used longest ago go.
        """
        if kind not in ("web", "internal"):
            raise ValueError("no such kind of session: %r" % (kind,))
        token = secrets.token_urlsafe(32)
        digest = _sha256(token)
        text = lambda value, limit: "".join(ch for ch in str(value or "")[:limit] if ch.isprintable())

        def change(records: Dict[str, Any], now: datetime.datetime) -> Tuple[bool, Session]:
            if kind == "web":
                mine = sorted((digest_ for digest_, record in records.items()
                               if record["login"] == login and record["kind"] == "web"),
                              key=lambda digest_: records[digest_]["seen"])
                for digest_ in mine[:max(0, len(mine) - (self._per_login - 1))]:
                    del records[digest_]
            lifetime = self._ttl if ttl is None else max(1, int(ttl))
            records[digest] = {
                "login": login, "created": iso(now), "seen": iso(now),
                "expires": iso(now + datetime.timedelta(seconds=lifetime)),
                "addr": text(addr, 64), "agent": text(agent, 200), "gen": int(gen), "kind": kind,
            }
            return True, self._session(digest, records[digest])
        return token, self._change(change)

    def get(self, token: Any) -> Optional[Session]:
        """The live session of ``token``, or None. Notes the use - on disk at most once per 5 minutes."""
        if not isinstance(token, str) or not _TOKEN.fullmatch(token):
            return None
        digest = _sha256(token)
        record = self._records().get(digest)
        now = as_utc(self._clock())
        if record is None or not self._alive(record, now):
            return None
        session = self._session(digest, record)
        if (now - session.seen).total_seconds() >= self._seen_every:
            def change(records: Dict[str, Any], _now: datetime.datetime) -> Tuple[bool, Optional[str]]:
                fresh = records.get(digest)
                if fresh is None:
                    return False, None
                # Judged again on what is on disk now, under the lock: a page asks for several
                # things at the same moment, and all of them read the same stale ``seen`` above.
                # The first one writes it down; for the others it is written already.
                if (now - parse_iso(fresh["seen"])).total_seconds() < self._seen_every:
                    return False, fresh["seen"]
                fresh["seen"] = iso(now)
                return True, fresh["seen"]
            try:
                seen = self._change(change)
                if seen is None:
                    return None             # closed by the other process in this very moment
                session = session._replace(seen=parse_iso(seen))
            except (AuthStorageFailed, Busy):
                pass                        # the use goes unnoted; the session itself is good
        return session

    def in_last_day(self, session: Session) -> bool:
        """The last-24-hours rule: such a session still saves, but no longer opens the page.

        Only for a session made by signing in; ctl's short internal ones are
        never "in their last day", or a self-check could not ask for the page.
        """
        if session.kind != "web":
            return False
        return (session.expires - as_utc(self._clock())).total_seconds() <= self._last_day

    def delete(self, token: Any) -> Optional[Session]:
        """Close one session by its token. The session that was closed, or None."""
        if not isinstance(token, str) or not _TOKEN.fullmatch(token):
            return None
        digest = _sha256(token)

        def change(records: Dict[str, Any], _now: datetime.datetime) -> Tuple[bool, Optional[Session]]:
            record = records.pop(digest, None)
            return record is not None, self._session(digest, record) if record is not None else None
        return self._change(change)

    def close_login(self, login: str) -> int:
        """Close every session of one login. How many were open."""
        def change(records: Dict[str, Any], _now: datetime.datetime) -> Tuple[bool, int]:
            mine = [digest for digest, record in records.items() if record["login"] == login]
            for digest in mine:
                del records[digest]
            return bool(mine), len(mine)
        return self._change(change)

    def close_all(self) -> int:
        def change(records: Dict[str, Any], _now: datetime.datetime) -> Tuple[bool, int]:
            count = len(records)
            records.clear()
            return bool(count), count
        return self._change(change)

    def list(self) -> List[Session]:
        """The live sessions, most recently used first. No token and no way back to one."""
        now = as_utc(self._clock())
        sessions = [self._session(digest, record) for digest, record in self._records().items()
                    if self._alive(record, now)]
        sessions.sort(key=lambda session: session.seen, reverse=True)
        return sessions

    def status(self) -> Dict[str, Any]:
        """Counts for ``ctl doctor``. Reading a damaged file here sets it aside, as any read does."""
        sessions = self.list()
        by_login = collections.Counter(session.login for session in sessions)
        return {"state": "ok" if os.path.exists(self.path) else "missing", "sessions": len(sessions),
                "byLogin": dict(sorted(by_login.items()))}


# ---------------------------------------------------------------------------
# The limiter
# ---------------------------------------------------------------------------

class Attempt:
    """One attempt the limiter has counted. Tell it how the attempt ended.

    Saying nothing leaves it counted, and that is what a failure is.
    """

    __slots__ = ("_limiter", "_keys", "_stamp", "_counted", "counts")

    def __init__(self, limiter: "Limiter", keys: List[Tuple[str, str]], moment: float, counts: Dict[str, int]):
        self._limiter = limiter
        self._keys = keys
        self._stamp = moment
        self._counted = True
        #: How many attempts each count holds now, this one included: {"address": n, "login": n} or {"setup": n}.
        self.counts = counts

    def succeeded(self) -> None:
        """The attempt was no failure: its count is given back."""
        self._give_back()

    def abandon(self) -> None:
        """The attempt never reached a verdict (no hash slot, a broken file): it is not counted either."""
        self._give_back()

    def _give_back(self) -> None:
        if self._counted:
            self._counted = False
            self._limiter._give_back(self._keys, self._stamp)


class Limiter:
    """Failed sign-ins per client address and per login, in the process's memory (BUILD-SPEC 2.4).

    * ``begin_login`` checks **and counts** the attempt for both keys under one
      lock, before any hash is run; so a burst of parallel wrong passwords gets
      exactly as many hashed as the limit allows. Success gives the count back.
    * 10 failures per address and 30 per login in any 15 minutes; the
      set-password door: 10 per address. Over it: ``TooManyAttempts``.
    * IPv6 is counted by /64. The table holds 10 000 keys; the one touched
      longest ago goes first, except the founders' own logins, which stay.
    * ``hash_slot`` lets two hashes run at once and waits at most 5 seconds.

    A refused attempt is not counted, so hammering a full count does not keep it full.
    """

    def __init__(self, clock: Clock = utcnow, *, window: float = 900.0, per_address: int = 10, per_login: int = 30,
                 setup_per_address: int = 10, max_keys: int = 10_000, hash_slots: int = 2, hash_wait: float = 5.0,
                 pinned_logins: Sequence[str] = ()):
        self._clock = clock
        self._window = float(window)
        self._per_address = int(per_address)
        self._per_login = int(per_login)
        self._setup_per_address = int(setup_per_address)
        self._max_keys = max(8, int(max_keys))
        self._hash_wait = float(hash_wait)
        self._slots = threading.BoundedSemaphore(max(1, int(hash_slots)))
        self._pinned = frozenset(("login", login) for login in pinned_logins)
        self._lock = threading.Lock()
        # key -> [moments of the counted attempts, oldest first; when a refusal was last reported]
        self._table = collections.OrderedDict()  # type: collections.OrderedDict

    def begin_login(self, login: str, addr: str) -> Attempt:
        """Count a sign-in attempt for the address and for the login. Raises ``TooManyAttempts``."""
        return self._begin([
            (("address", address_key(addr)), self._per_address),
            (("login", login), self._per_login),
        ])

    def begin_setup(self, addr: str) -> Attempt:
        """Count an attempt at the set-password door for the address. Raises ``TooManyAttempts``."""
        return self._begin([(("setup", address_key(addr)), self._setup_per_address)])

    def _begin(self, wanted: List[Tuple[Tuple[str, str], int]]) -> Attempt:
        now = as_utc(self._clock()).timestamp()
        horizon = now - self._window
        with self._lock:
            wait, full, first = 0, "", False
            for key, limit in wanted:
                entry = self._table.get(key)
                if entry is None:
                    continue
                moments = entry[0]
                gone = 0
                while gone < len(moments) and moments[gone] <= horizon:
                    gone += 1
                if gone:
                    del moments[:gone]
                if len(moments) >= limit:
                    # Room again once enough of the oldest have left the window.
                    seconds = max(1, int(math.ceil(moments[len(moments) - limit] + self._window - now)))
                    if seconds > wait:
                        wait, full = seconds, key[0]
                    if entry[1] is None or entry[1] <= horizon or entry[1] > now:
                        entry[1] = now
                        first = True
            if wait:
                raise TooManyAttempts(wait, key=full, first=first)
            counts = {}
            for key, _limit in wanted:
                entry = self._table.get(key)
                if entry is None:
                    entry = self._table[key] = [[], None]
                entry[0].append(now)
                self._table.move_to_end(key)
                counts[key[0]] = len(entry[0])
            while len(self._table) > self._max_keys:
                oldest = next((key for key in self._table if key not in self._pinned), None)
                if oldest is None:
                    break
                del self._table[oldest]
        return Attempt(self, [key for key, _limit in wanted], now, counts)

    def _give_back(self, keys: List[Tuple[str, str]], moment: float) -> None:
        with self._lock:
            for key in keys:
                entry = self._table.get(key)
                if entry is None:
                    continue
                moments = entry[0]
                for index in range(len(moments) - 1, -1, -1):
                    if moments[index] == moment:
                        del moments[index]
                        break
                if not moments and entry[1] is None:
                    del self._table[key]

    @contextlib.contextmanager
    def hash_slot(self, wait: Optional[float] = None) -> Iterator[None]:
        """Hold one of the two hash slots. Raises ``Busy`` when none comes free within ``wait`` seconds (5)."""
        if not self._slots.acquire(timeout=self._hash_wait if wait is None else wait):
            raise Busy()
        try:
            yield
        finally:
            self._slots.release()

    def count(self, kind: str, value: str) -> int:
        """How many attempts a key holds in the current window. ``kind``: "address", "login" or "setup"."""
        key = (kind, address_key(value) if kind in ("address", "setup") else value)
        horizon = as_utc(self._clock()).timestamp() - self._window
        with self._lock:
            entry = self._table.get(key)
            return sum(1 for moment in entry[0] if moment > horizon) if entry else 0

    def size(self) -> int:
        with self._lock:
            return len(self._table)


# ---------------------------------------------------------------------------
# All of it together
# ---------------------------------------------------------------------------

class Identity(NamedTuple):
    login: str
    first_name: str
    session: Session
    #: False in the session's last 24 hours: GET / then goes to /login; the /api/ doors still answer.
    may_open_page: bool
    #: "owner" | "editor" | "reader", as ``users.json`` and MONEY_FOUNDERS have it at this request.
    role: str = "reader"

    @property
    def can_write(self) -> bool:
        """May save the documents. A reader is sent them and saves nothing."""
        return self.role in ("owner", "editor")

    @property
    def can_manage(self) -> bool:
        """May add people, issue their links, disable them and say what each may do: the owner."""
        return self.role == "owner"


class Person(NamedTuple):
    """One line of the owner's list: an account, and when its holder was last here."""
    user: User
    #: The latest use of any of the login's sign-ins that are still open; None when there is none.
    last_seen: Optional[datetime.datetime]


class NewSession(NamedTuple):
    #: The cookie's value. It exists here and in the browser, nowhere else.
    token: str
    identity: Identity


def _login_of(login: Any) -> Optional[str]:
    """What was typed into the login field, as a login; None when it cannot be one."""
    if not isinstance(login, str):
        return None
    login = unicodedata.normalize("NFKC", login).strip().lower()
    return login if 0 < len(login) <= 64 else None


class Auth:
    """Sign-in as the doors use it: the right checks in the right order, and the security log kept.

    ``settings`` is ``config.Settings``; ``security_log`` anything with
    ``write(event, **fields)`` (``log.SecurityLog``), or None.
    """

    #: Refused attempts (wrong passwords, dead links, limiter refusals) that are written to the security
    #: log one by one within a clock hour. The next one writes a single "login-flood" line and the rest
    #: of that hour's go unwritten: a flood must not be able to push a year of history out of the log.
    FLOOD = 200

    def __init__(self, settings: Any, clock: Clock = utcnow, security_log: Any = None):
        self.settings = settings
        self._clock = clock
        self._security_log = security_log
        self.users = Users(settings.data_dir, settings.founders, clock, security_log=security_log)
        self.invites = Invites(self.users, clock, ttl=settings.invite_ttl)
        self.sessions = Sessions(
            settings.data_dir, clock, ttl=settings.session_ttl, idle=settings.session_idle,
            per_login=settings.sessions_per_login, last_day=settings.session_last_day,
            seen_every=settings.session_seen_every, security_log=security_log)
        self.limiter = Limiter(
            clock, window=settings.limiter_window, per_address=settings.limiter_per_address,
            per_login=settings.limiter_per_login, setup_per_address=settings.limiter_setup_per_address,
            max_keys=settings.limiter_max_keys, hash_slots=settings.hash_slots, hash_wait=settings.hash_wait,
            pinned_logins=settings.logins)
        self._dummy_hash = None  # type: Optional[str]
        self._dummy_lock = threading.Lock()
        self._flood = [None, 0]  # type: List[Any]
        self._flood_lock = threading.Lock()

    # -- starting ------------------------------------------------------------

    def boot(self) -> None:
        """Make ``users.json`` and its founders, read both files once. Raises ``AuthDamaged``: the boot stops."""
        self.users.ensure()
        self.sessions.list()
        self._dummy()

    def _dummy(self) -> str:
        """A hash nobody's password matches, so an unknown login costs what a known one costs."""
        with self._dummy_lock:
            if self._dummy_hash is None:
                self._dummy_hash = hash_password(secrets.token_urlsafe(24), self.settings.kdf)
            return self._dummy_hash

    def _note(self, event: str, **fields: Any) -> None:
        if self._security_log is not None:
            self._security_log.write(event, **fields)

    def _refused(self, event: str, **fields: Any) -> None:
        """Note an attempt that was turned away - within the hour's budget of such lines."""
        hour = as_utc(self._clock()).strftime("%Y-%m-%dT%H")
        with self._flood_lock:
            if self._flood[0] != hour:
                self._flood[0], self._flood[1] = hour, 0
            self._flood[1] += 1
            count = self._flood[1]
        if count <= self.FLOOD:
            self._note(event, **fields)
        elif count == self.FLOOD + 1:
            self._note("login-flood", count=self.FLOOD)

    def _identity(self, user: User, session: Session) -> Identity:
        return Identity(user.login, user.first_name, session, not self.sessions.in_last_day(session), user.role)

    # -- every request -------------------------------------------------------

    def session(self, token: Any) -> Optional[Identity]:
        """Who a session token belongs to, or None: unknown, expired, idle for 14 days, closed, or its
        login disabled, dropped from MONEY_FOUNDERS or given a new password since.

        Raises ``AuthDamaged`` while ``users.json`` cannot be read: answer 503, not 401 - a page
        that is told 401 stops saving.
        """
        if not token:
            return None
        session = self.sessions.get(token)
        if session is None:
            return None
        user = self.users.get(session.login)
        if user is None or not user.can_sign_in or user.gen != session.gen:
            return None
        return self._identity(user, session)

    # -- the sign-in door ----------------------------------------------------

    def sign_in(self, login: Any, password: Any, addr: str, agent: str = "", presented: Any = None) -> NewSession:
        """Check a login and a password and open a session.

        The attempt is counted for the address and the login before anything is
        hashed; an unknown login, a disabled one and one without a password run
        the same hash as a real one and get the same ``InvalidCredentials``.
        """
        name = _login_of(login)
        if name is None or not isinstance(password, str) or not password:
            raise MissingCredentials()
        user = self.users.get(name)                # AuthDamaged comes out here, before anything is counted
        founder = name if user is not None and user.listed else None    # the only login a log line may name
        try:
            attempt = self.limiter.begin_login(name, addr)
        except TooManyAttempts as refusal:
            if refusal.first:
                self._refused("sign-in-blocked", addr=addr, login=founder, reason=refusal.key,
                              retryAfter=refusal.retry_after)
            raise
        try:
            with self.limiter.hash_slot():
                user, stored = self.users.credentials(name)       # the hash and its generation, read together
                if user is None or not user.can_sign_in:
                    stored = None
                verdict = verify_password(password, stored if stored is not None else self._dummy(),
                                          kdf=self.settings.kdf, allow_pbkdf2=self.settings.is_dev)
                ok = verdict.ok and stored is not None
                if ok and verdict.new_hash:
                    try:
                        self.users.replace_hash(name, stored, verdict.new_hash)
                    except AuthError:
                        pass                       # the old hash still works; the next sign-in tries again
        except BaseException:
            attempt.abandon()                      # no verdict was reached, so nothing was guessed
            raise
        if not ok or user is None:
            self._refused("sign-in-failed", addr=addr, login=founder, n=attempt.counts.get("address", 0))
            raise InvalidCredentials()
        attempt.succeeded()
        if presented:
            self.sessions.delete(presented)
        token, session = self.sessions.create(name, addr, agent, gen=user.gen)
        self._note("sign-in", login=name, addr=addr)
        return NewSession(token, self._identity(user, session))

    # -- the set-password door -----------------------------------------------

    def set_password(self, token: Any, password: Any, addr: str, agent: str = "", presented: Any = None) -> NewSession:
        """Spend a one-time link: set the password, close the login's sessions, open a new one.

        This door has its own count (10 failures per address) and does not pass
        the per-login count of the sign-in door: it is the way out of a lock-out.
        Only a link that does not work counts as a failure.
        """
        try:
            attempt = self.limiter.begin_setup(addr)
        except TooManyAttempts as refusal:
            if refusal.first:
                self._refused("link-blocked", addr=addr, retryAfter=refusal.retry_after)
            raise
        try:
            user = self.invites.peek(token)
            if user is None or not user.can_sign_in:
                self._refused("link-refused", addr=addr, n=attempt.counts.get("setup", 0))
                raise InvalidLink()
        except InvalidLink:
            raise                                  # counted
        except BaseException:
            attempt.abandon()
            raise
        try:
            check_password(password, user.login, user.first_name)
            with self.limiter.hash_slot():
                new_hash = hash_password(password, self.settings.kdf)
        except BaseException:
            attempt.abandon()                      # the link is good; a weak password is not a guess at one
            raise
        try:
            user = self.invites.redeem(token, new_hash)
        except InvalidLink:
            self._refused("link-refused", addr=addr, n=attempt.counts.get("setup", 0))
            raise                                  # somebody else spent it in between: counted
        except BaseException:
            attempt.abandon()
            raise
        attempt.succeeded()
        closed = self.sessions.close_login(user.login)
        if presented:
            self.sessions.delete(presented)
        new_token, session = self.sessions.create(user.login, addr, agent, gen=user.gen)
        self._note("link-used", login=user.login, addr=addr)
        self._note("password-set", login=user.login, addr=addr, count=closed)
        return NewSession(new_token, self._identity(user, session))

    # -- signing out ---------------------------------------------------------

    def sign_out(self, token: Any, addr: Optional[str] = None) -> bool:
        """Close the session of ``token``. True when there was one; signing out twice is still signing out."""
        if not token:
            return False
        session = self.sessions.delete(token)
        if session is None:
            return False
        self._note("sign-out", login=session.login, addr=addr)
        return True

    # -- one's own password, again ---------------------------------------------

    def _check_current(self, login: str, password: Any, addr: str, what: str) -> Tuple[User, str]:
        """The account and the hash its current password was just checked against. Raises ``WrongPassword``.

        Counted like a sign-in, for the address and for the login, before anything is hashed:
        a stolen session must not be a way to guess the password without a limit.
        """
        if not isinstance(password, str) or not password:
            raise WrongPassword()
        try:
            attempt = self.limiter.begin_login(login, addr)
        except TooManyAttempts as refusal:
            if refusal.first:
                self._refused("sign-in-blocked", addr=addr, login=login, reason=refusal.key,
                              retryAfter=refusal.retry_after)
            raise
        try:
            with self.limiter.hash_slot():
                user, stored = self.users.credentials(login)
                if user is None or not user.can_sign_in:
                    stored = None
                verdict = verify_password(password, stored if stored is not None else self._dummy(),
                                          kdf=self.settings.kdf, allow_pbkdf2=self.settings.is_dev)
        except BaseException:
            attempt.abandon()
            raise
        if not verdict.ok or stored is None or user is None:
            self._refused("password-check-failed", addr=addr, login=login, what=what,
                          n=attempt.counts.get("address", 0))
            raise WrongPassword()
        attempt.succeeded()
        return user, stored

    def confirm_password(self, login: str, password: Any, addr: str, what: str = "link") -> None:
        """A signed-in person says their password again, before something that outlives the session.

        Raises ``WrongPassword``, ``TooManyAttempts``, ``Busy``, ``AuthDamaged``.
        """
        self._check_current(login, password, addr, what)

    def change_password(self, identity: Identity, current: Any, password: Any, addr: str,
                        agent: str = "") -> NewSession:
        """A signed-in person chooses a new password: the current one is asked for, every sign-in of
        the login is closed, and a new one is opened for this browser.

        Raises ``WrongPassword``, ``TooManyAttempts``, ``WeakPassword``, ``Busy``, ``AuthDamaged``,
        ``AuthStorageFailed``. Nothing is changed unless the whole of it went through.
        """
        login = identity.login
        user, stored = self._check_current(login, current, addr, "password")
        check_password(password, login, user.first_name)
        with self.limiter.hash_slot():
            new_hash = hash_password(password, self.settings.kdf)
        user = self.users.change_password(login, stored, new_hash)
        closed = self.sessions.close_login(login)
        token, session = self.sessions.create(login, addr, agent, gen=user.gen)
        self._note("password-changed", login=login, addr=addr, count=closed)
        return NewSession(token, self._identity(user, session))

    # -- the owner's doors -----------------------------------------------------

    def people(self) -> List[Person]:
        """Everybody ``users.list()`` has, each with the latest use of a sign-in that is still open."""
        seen = {}  # type: Dict[str, datetime.datetime]
        for session in self.sessions.list():
            if session.kind == "web" and (session.login not in seen or session.seen > seen[session.login]):
                seen[session.login] = session.seen
        return [Person(user, seen.get(user.login)) for user in self.users.list()]

    def add_person(self, login: Any, name: Any, by: str) -> User:
        """A new login that only looks, without a password: the owner issues its link next.

        Raises ``BadPerson`` (``reason`` "login" or "name"), ``LoginTaken``, ``TooManyPeople``.
        """
        if not isinstance(login, str) or _LOGIN.fullmatch(login) is None:
            raise BadPerson("login")
        if not _is_name(name):
            raise BadPerson("name")
        user = self.users.add(login, name, by)
        self._note("user-added", login=login, by=by)
        return user

    def update_person(self, login: Any, by: str, name: Any = None, role: Any = None) -> User:
        """Another name, another role, or both. Raises ``BadPerson``, ``UnknownLogin``, ``OwnerFixed``."""
        if not isinstance(login, str) or _LOGIN.fullmatch(login) is None:
            raise UnknownLogin()
        if name is None and role is None:
            raise BadPerson("nothing")
        if name is not None and not _is_name(name):
            raise BadPerson("name")
        if role is not None and role not in ("reader", "editor"):
            raise BadPerson("role")
        before, after = self.users.update(login, name=name, role=role)
        if after.role != before.role:
            self._note("role-changed", login=login, by=by, role=after.role)
        if after.first_name != before.first_name:
            self._note("user-renamed", login=login, by=by)
        return after

    # -- for ctl -------------------------------------------------------------

    def issue_invite(self, login: str, by: str = "ctl") -> Tuple[str, datetime.datetime]:
        """A one-time link for ``login`` and when it runs out. The earlier link of that login stops working.

        The line goes into the security log (strictly: no line, no link).
        Raises ``UnknownLogin``, ``LoginDisabled``, ``AuthStorageFailed``.
        """
        token, expires = self.invites.issue(login)
        if self._security_log is not None:
            try:
                self._security_log.write("link-issued", strict=True, login=login, by=by, expires=iso(expires))
            except OSError as error:
                self.invites.revoke(login)
                raise AuthStorageFailed("The security log could not be written (%s), so no link was issued."
                                        % errno.errorcode.get(error.errno, "error"))
        return invite_link(self.settings.public_url, token), expires

    def retire_links(self, by: str = "ctl") -> List[str]:
        """Retire every pending one-time link. Returns the logins that had one; ``[]`` when there was none.

        For a stand that was put back from a backup: a link that was pending when the backup
        was taken and has been used - or replaced - since is pending again in the restored
        accounts file, and whoever still has that message could set the founder's password.
        Nothing but the links is touched: passwords, disabled logins and sessions stay as
        they are. Each founder who needs a link is issued a new one afterwards.

        One write of ``users.json`` for all of them, then one ``link-retired`` line (login, by)
        per login in the security log. The logins come back in the order ``users.list()`` has.
        Raises ``AuthDamaged``, ``Busy``, ``AuthStorageFailed``; then no link was retired.
        """
        logins = self.invites.revoke_all()
        for login in logins:
            self._note("link-retired", login=login, by=by)
        return logins

    def set_disabled(self, login: str, disabled: bool, by: str = "ctl") -> User:
        """Disable or enable a login. Disabling closes its sessions and retires its pending link."""
        if not isinstance(login, str) or (login not in self.settings.logins and self.users.get(login) is None):
            raise UnknownLogin()
        user = self.users.set_disabled(login, disabled)
        if disabled:
            closed = self.sessions.close_login(login)
            self._note("user-disabled", login=login, by=by, count=closed)
        else:
            self._note("user-enabled", login=login, by=by)
        return user

    def close_sessions(self, login: Optional[str] = None, by: str = "ctl") -> int:
        """Close every session of ``login``, or of everybody when it is None. How many were open."""
        count = self.sessions.close_all() if login is None else self.sessions.close_login(login)
        self._note("sessions-closed", login=login if login is not None else "all", by=by, count=count)
        return count

    def internal_session(self, login: str, ttl: int = 300, purpose: str = "selfcheck",
                         by: str = "ctl") -> Tuple[str, Session]:
        """A short session made on the server, for a self-check or a seed: ``(token, session)``.

        It opens the page for as long as it lives, and that is an hour at most (``ValueError`` beyond).
        Never print the token. Raises ``UnknownLogin``.
        """
        if isinstance(ttl, bool) or not isinstance(ttl, int) or not 1 <= ttl <= 3600:
            raise ValueError("an internal session lives 1 to 3600 seconds")
        user = self.users.get(login)
        if user is None or not user.listed:
            raise UnknownLogin()
        token, session = self.sessions.create(login, "127.0.0.1", "moneyd.ctl " + str(purpose), gen=user.gen,
                                              ttl=ttl, kind="internal")
        self._note("session-created", login=login, by=by, purpose=str(purpose), expires=iso(session.expires))
        return token, session

    def status(self) -> Dict[str, Any]:
        """Counts for ``ctl doctor`` and ``ctl selfcheck``. Never a hash, a token or a link."""
        return {"users": self.users.status(), "sessions": self.sessions.status(),
                "limiterKeys": self.limiter.size(), "kdf": self.settings.kdf}


# ---------------------------------------------------------------------------
# Looking at any directory without touching it
# ---------------------------------------------------------------------------

def verify(data_dir: str) -> Dict[str, Any]:
    """Counts of the accounts and the sessions of any data directory - an unpacked backup, say.

    Read-only: no lock is taken, nothing is moved aside, nothing is written.
    The answer never holds a hash, a token or a link. ``state`` is ``"ok"``,
    ``"missing"`` or ``"damaged"`` (then ``problem`` says why). A ``users.json``
    that is not there is ``"damaged"``, not ``"missing"``, when the marker beside
    it says it was written, or when ``auth/`` itself has gone from a directory
    that carries a ``STAND`` marker: the accounts were lost.
    """
    report = {}  # type: Dict[str, Any]
    for key, name, check in (("users", "users.json", _check_users), ("sessions", "sessions.json", _check_sessions)):
        try:
            data = _JsonFile(os.path.join(data_dir, "auth", name), check).read()
        except _Unreadable as why:
            report[key] = {"state": "damaged", "problem": "%s cannot be trusted: %s." % (name, why)}
            continue
        lost = _lost_accounts(data_dir) if data is None and key == "users" else None
        if lost is not None:
            report[key] = {"state": "damaged", "problem": "%s cannot be trusted: %s." % (name, lost)}
        elif data is None:
            report[key] = {"state": "missing", "problem": None}
        elif key == "users":
            records = data["users"].values()
            report[key] = {
                "state": "ok", "problem": None, "accounts": len(records),
                "withPassword": sum(1 for record in records if record["hash"] is not None),
                "disabled": sum(1 for record in records if record["disabled"]),
                "pendingLinks": sum(1 for record in records if record.get("invite")),
            }
        else:
            report[key] = {"state": "ok", "problem": None, "sessions": len(data["sessions"])}
    return report
