"""Settings of one stand, and every refusal to start that settings alone decide.

API for the HTTP layer and the CLI
----------------------------------
``Settings.from_env(environ, clock=utcnow, scrypt_available=None) -> Settings``
    Reads the ``MONEY_*`` variables (the names are in ``ENV_NAMES``) and returns
    a frozen ``Settings``. Raises ``ConfigError`` - one clear English sentence -
    for every refusal of BUILD-SPEC 2.7 that needs nothing but the settings:

    * ``MONEY_STAND`` is not ``prod``, ``test`` or ``dev``;
    * the public URL is not ``scheme://host[:port]``, is not https on prod/test,
      is not http on dev, or its host does not start with ``finance.``;
    * ``dev`` that does not bind a loopback address, or whose public host does
      not end in ``.localhost``;
    * ``MONEY_CSP`` other than ``enforce`` / ``report-only``; ``report-only`` on
      prod without ``MONEY_CSP_OVERRIDE_UNTIL=YYYY-MM-DD``, or with a value that
      is not a day. A day that has passed (UTC) is **not** a refusal: the
      override has simply ended, the settings load, the policy is enforced
      (``csp_report_only()`` is False) and ``warnings`` says on which day it
      ended. Refusing a passed day is the deploy script's work, before
      anything is touched - a stand that is already running must not lose
      its command line and its restarts to a date;
    * prod/test on a Python without ``hashlib.scrypt``, or with ``MONEY_KDF``
      set to anything but ``scrypt``;
    * a founders list, a bind address, a proxy list or a data directory that
      cannot be read as one.

    The refusals that need the disk (the ``STAND`` marker, the laptop layout)
    are in ``store.prepare_data_dir`` (``DataDirError``); a damaged
    ``users.json`` stops ``auth.Auth.boot`` (``AuthDamaged``). ``__main__``
    calls all three. ``ConfigError`` and ``DataDirError`` are ``BootRefusal``.

``Settings`` fields the other modules rely on
    ``stand`` ``public_url`` (also the only accepted ``Origin``) ``public_host``
    (the only accepted ``Host``) ``founders`` ``data_dir`` ``web_dir``
    ``bind_host`` ``bind_port`` ``trusted_proxies`` ``csp_mode``
    ``csp_override_until`` ``kdf`` ``version`` ``warnings``, the limits of
    BUILD-SPEC 2.3 / 2.4 / 2.8 as plain numbers, and the helpers ``is_dev``,
    ``cookie_name``, ``cookie_secure``, ``logins``, ``first_name(login)``,
    ``put_limit(kind)``, ``warn_limit(kind)``, ``put_deadline(content_length)``,
    ``csp_report_only(now)``, ``describe()``.

    Two of the plain numbers, because the HTTP layer is built on them:
    ``signed_out_slots`` (8) is how many requests without a session may be
    reading a body at once, and ``signed_out_body_slots_per_address`` (2) how
    many of those one client address may hold - so that one address cannot
    shut the sign-in and the set-password doors for everybody else.
    ``put_deadline(n)`` is 20 s + 1 s per 10 000 bytes, 600 s at most
    (``put_deadline_base``, ``put_deadline_bytes_per_second``,
    ``put_deadline_max``).

    Tests shrink a limit with ``dataclasses.replace(settings, hash_wait=0.05)``.

``Refusal``
    The base of every error a door answers with (``store.StoreError``,
    ``auth.AuthError``): ``status``, ``code``, ``message``, ``extra()``, and
    ``body()`` - the whole JSON answer. One ``except Refusal`` in the HTTP layer
    turns any of them into its answer.

The clock
    Everything that depends on time takes ``clock``: a callable returning the
    current moment as a UTC ``datetime``. ``utcnow`` is the real one. The helpers
    ``as_utc``, ``iso``, ``iso_ms``, ``parse_iso``, ``stamp`` and ``parse_stamp``
    are the only time formats the service writes.

There are no secrets in the environment: nothing here is one.
"""
import dataclasses
import datetime
import hashlib
import ipaddress
import os
import re
from typing import Any, Callable, Dict, Mapping, Optional, Tuple, Union
from urllib.parse import urlsplit

__all__ = [
    "BootRefusal", "ConfigError", "Refusal", "Settings", "STANDS", "ENV_NAMES", "COMPOSE_ONLY_ENV",
    "Clock", "utcnow", "as_utc", "iso", "iso_ms", "parse_iso", "stamp", "parse_stamp",
]

KIB = 1024
MIB = 1024 * 1024

STANDS = ("prod", "test", "dev")

#: Every variable the process reads. None of them is a secret.
ENV_NAMES = (
    "MONEY_STAND",               # prod | test | dev
    "MONEY_PUBLIC_URL",          # https://finance.selfstudio.se
    "MONEY_FOUNDERS",            # mika:Mika,misha:Misha,vanya:Vanya - the first one named is the owner
    "MONEY_DATA_DIR",            # /data
    "MONEY_BIND",                # 0.0.0.0:8080 (default 127.0.0.1:8080)
    "MONEY_TRUSTED_PROXIES",     # 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
    "MONEY_CSP",                 # enforce (default) | report-only
    "MONEY_CSP_OVERRIDE_UNTIL",  # YYYY-MM-DD, only read with report-only
    "MONEY_VERSION",             # set by the image build
    "MONEY_WEB_DIR",             # where index.html and vendor/ are
    "MONEY_KDF",                 # dev only: scrypt | pbkdf2
)

#: Where a stand asks for a day's exchange rates (``moneyd/rates.py``): one open source, without a key,
#: at the two addresses it publishes under. A day is a file of its own there, so a day in the past
#: can be asked for as well.
RATES_URLS = (
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{day}/v1/currencies/gbp.min.json",
    "https://{day}.currency-api.pages.dev/v1/currencies/gbp.min.json",
)

#: Keys of a stand file that only compose reads; harmless if they reach the process.
COMPOSE_ONLY_ENV = ("MONEY_PORT", "MONEY_DATA_HOST_DIR")

Network = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]
Clock = Callable[[], datetime.datetime]

UTC = datetime.timezone.utc


# ---------------------------------------------------------------------------
# The clock and the time formats
# ---------------------------------------------------------------------------

def utcnow() -> datetime.datetime:
    """The real clock: now, as an aware UTC datetime."""
    return datetime.datetime.now(UTC)


def as_utc(moment: datetime.datetime) -> datetime.datetime:
    """``moment`` as an aware UTC datetime; a naive one is taken to be UTC already."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)


def iso(moment: datetime.datetime) -> str:
    """``2026-10-07T14:03:22Z`` - whole seconds."""
    return as_utc(moment).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_ms(moment: datetime.datetime) -> str:
    """``2026-10-07T14:03:22.123Z`` - what ``updatedAt`` looks like (JavaScript's own form)."""
    moment = as_utc(moment)
    return "%s.%03dZ" % (moment.strftime("%Y-%m-%dT%H:%M:%S"), moment.microsecond // 1000)


_ISO = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?Z")


def parse_iso(text: str) -> datetime.datetime:
    """The inverse of ``iso`` and ``iso_ms``. Raises ``ValueError`` on anything else."""
    match = _ISO.fullmatch(text) if isinstance(text, str) else None
    if not match:
        raise ValueError("not a UTC timestamp")
    year, month, day, hour, minute, second = (int(part) for part in match.groups()[:6])
    micro = int((match.group(7) or "0").ljust(6, "0"))
    return datetime.datetime(year, month, day, hour, minute, second, micro, tzinfo=UTC)


def stamp(moment: datetime.datetime) -> str:
    """``20261007T140322Z`` - the form used inside file names."""
    return as_utc(moment).strftime("%Y%m%dT%H%M%SZ")


_STAMP = re.compile(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")


def parse_stamp(text: str) -> datetime.datetime:
    """The inverse of ``stamp``. Raises ``ValueError`` on anything else."""
    match = _STAMP.fullmatch(text) if isinstance(text, str) else None
    if not match:
        raise ValueError("not a compact UTC timestamp")
    return datetime.datetime(*(int(part) for part in match.groups()), tzinfo=UTC)


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------

class BootRefusal(Exception):
    """The service must not start. ``str()`` is the sentence to print."""


class Refusal(Exception):
    """What a door answers instead of doing what was asked - the base of ``store.StoreError`` and ``auth.AuthError``.

    ``status`` is the HTTP status, ``code`` the ``error`` member of the JSON
    answer, ``message`` a fixed English sentence, ``extra()`` any further
    members (``{"rev": N}``, ``{"retryAfter": n}``, ``{"min": 12}``). Nothing a
    caller sent is ever in any of them.
    """

    status = 500
    code = "internal"

    def __init__(self, message: str = "Something broke on our side."):
        super().__init__(message)
        self.message = message

    def extra(self) -> Dict[str, Any]:
        return {}

    def body(self) -> Dict[str, Any]:
        """The whole JSON answer: ``{"error": code, "message": message, ...extra}``."""
        answer = {"error": self.code, "message": self.message}  # type: Dict[str, Any]
        answer.update(self.extra())
        return answer


class ConfigError(BootRefusal):
    """A setting is missing, unreadable or forbidden on this stand."""


def _short(value: str) -> str:
    """A setting's value, safe to put into an error line."""
    text = "".join(ch if 32 <= ord(ch) < 127 else "?" for ch in value)
    return text if len(text) <= 48 else text[:45] + "..."


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@dataclasses.dataclass(frozen=True)
class Settings:
    """What one stand is. Build it with ``Settings.from_env``; it never changes afterwards."""

    stand: str
    #: ``scheme://host[:port]`` with no trailing slash. Links are built from it
    #: and it is the one value of ``Origin`` that is accepted.
    public_url: str
    #: The one value of ``Host`` that is accepted: the host of ``public_url``,
    #: with the port only when the URL names a non-default one.
    public_host: str
    #: ``(("mika", "Mika"), ...)`` in the order they were given.
    founders: Tuple[Tuple[str, str], ...]
    data_dir: str
    web_dir: str
    bind_host: str
    bind_port: int
    #: Peers whose ``X-Forwarded-For`` is believed.
    trusted_proxies: Tuple[Network, ...] = ()
    csp_mode: str = "enforce"
    csp_override_until: Optional[datetime.date] = None
    #: ``scrypt`` on a stand; ``pbkdf2`` is possible on ``dev`` only.
    kdf: str = "scrypt"
    version: str = "dev"
    #: Things that are allowed but should be seen: ``__main__`` and ``ctl selfcheck`` print them.
    warnings: Tuple[str, ...] = ()

    # -- request limits (BUILD-SPEC 2.3, 2.8) --------------------------------
    ledger_max_bytes: int = 16 * MIB
    plan_max_bytes: int = 4 * MIB
    auth_max_bytes: int = 4 * KIB
    #: A body over this is accepted but logged: the page words a 413 as "check your connection".
    ledger_warn_bytes: int = 8 * MIB
    plan_warn_bytes: int = 512 * KIB
    max_connections: int = 32
    #: Requests without a session that may be reading a body at the same moment.
    signed_out_slots: int = 8
    #: Of those, how many one client address may hold. Well under ``signed_out_slots``, so that
    #: one address cannot take them all and shut the sign-in and set-password doors for the others.
    signed_out_body_slots_per_address: int = 2
    max_connections_per_address: int = 12
    socket_timeout: float = 30.0
    auth_body_deadline: float = 5.0
    #: A document body has ``base + length / bytes_per_second`` seconds in all, ``max`` at most.
    #: The edge does not buffer request bodies, so this clock runs against the founder's own uplink:
    #: 10 000 bytes a second is a link a phone has on a train.
    put_deadline_base: float = 20.0
    put_deadline_bytes_per_second: int = 10_000
    put_deadline_max: float = 600.0
    #: Deepest nesting of a request body; ``store.parse_json`` enforces it.
    json_max_depth: int = 16

    # -- the limiter (BUILD-SPEC 2.4) ----------------------------------------
    limiter_window: float = 900.0
    limiter_per_address: int = 10
    limiter_per_login: int = 30
    limiter_setup_per_address: int = 10
    limiter_max_keys: int = 10_000
    hash_slots: int = 2
    hash_wait: float = 5.0

    # -- sessions and links (design section 2) -------------------------------
    session_ttl: int = 30 * 86400
    session_idle: int = 14 * 86400
    session_last_day: int = 86400
    sessions_per_login: int = 10
    session_seen_every: int = 300
    invite_ttl: int = 48 * 3600

    # -- exchange rates (moneyd/rates.py) -----------------------------------
    #: Where a day's rates are asked, ``{day}`` filled in; the first that answers. Empty: nothing is
    #: ever asked of anybody, and the page counts by the rates typed into it - the dev stand, the tests.
    rates_urls: Tuple[str, ...] = ()
    #: The first day the table is kept for: before it the studio's history is the founders' sheet.
    rates_first_day: datetime.date = datetime.date(2026, 10, 1)
    #: Seconds between two attempts; days asked for in one; tries a past day gets; seconds one answer has.
    rates_wait: float = 1800.0
    rates_days_per_ask: int = 10
    rates_tries_per_day: int = 5
    rates_timeout: float = 4.0
    #: How long ``GET /api/rates`` waits for a refresh it has just begun before it answers with what there is.
    rates_door_wait: float = 2.5

    # -- storage and logs (BUILD-SPEC 2.8, 2.9) ------------------------------
    keep_day_snapshots: int = 90
    keep_shrink_snapshots: int = 50
    security_log_bytes: int = 20 * MIB
    security_log_files: int = 10

    # -- helpers -------------------------------------------------------------

    @property
    def is_dev(self) -> bool:
        return self.stand == "dev"

    @property
    def cookie_name(self) -> str:
        """``__Host-money`` on a stand; ``money-dev`` on dev, which speaks plain http."""
        return "money-dev" if self.is_dev else "__Host-money"

    @property
    def cookie_secure(self) -> bool:
        return not self.is_dev

    @property
    def public_hostname(self) -> str:
        """The host of the public URL without any port."""
        return self.public_host.rsplit(":", 1)[0] if ":" in self.public_host else self.public_host

    @property
    def logins(self) -> Tuple[str, ...]:
        return tuple(login for login, _name in self.founders)

    @property
    def owner(self) -> str:
        """The first login ``MONEY_FOUNDERS`` names: the one who saves the documents and manages the others."""
        return self.founders[0][0]

    def first_name(self, login: str) -> Optional[str]:
        """The first name ``MONEY_FOUNDERS`` gives a login, or None when it names no such login."""
        for known, name in self.founders:
            if known == login:
                return name
        return None

    def put_limit(self, kind: str) -> int:
        """The largest PUT body, in bytes, for ``"ledger"`` or ``"plan"``."""
        if kind == "ledger":
            return self.ledger_max_bytes
        if kind == "plan":
            return self.plan_max_bytes
        raise ValueError("no such document: %r" % (kind,))

    def warn_limit(self, kind: str) -> int:
        """The size from which a PUT body is worth a line in the log, although it is still accepted."""
        if kind == "ledger":
            return self.ledger_warn_bytes
        if kind == "plan":
            return self.plan_warn_bytes
        raise ValueError("no such document: %r" % (kind,))

    def put_deadline(self, content_length: int) -> float:
        """Seconds a document body may take in total: 20 s + 1 s per 10 000 bytes, and 600 s at most.

        A ledger of 2 MB has about four minutes; one at the 16 MiB limit has the ten.
        """
        length = max(0, int(content_length))
        longest = float(self.put_deadline_max)
        if length >= longest * self.put_deadline_bytes_per_second:
            return longest              # also a length no float could hold
        return min(longest, self.put_deadline_base + length / float(self.put_deadline_bytes_per_second))

    def csp_report_only(self, now: Optional[datetime.datetime] = None) -> bool:
        """Whether the policy is sent as ``Content-Security-Policy-Report-Only`` at ``now``.

        On prod the override runs out by itself: a server that is still up the
        day after ``csp_override_until`` enforces again without a restart, and a
        stand that is started after that day enforces from its first answer.
        """
        if self.csp_mode != "report-only":
            return False
        if self.stand != "prod":
            return True
        if self.csp_override_until is None:
            return False
        today = as_utc(now if now is not None else utcnow()).date()
        return today <= self.csp_override_until

    def describe(self) -> Dict[str, Any]:
        """The settings as plain values, for ``ctl selfcheck`` and the boot line. No secret exists to leave out."""
        return {
            "stand": self.stand,
            "version": self.version,
            "publicUrl": self.public_url,
            "bind": "%s:%d" % (("[%s]" % self.bind_host) if ":" in self.bind_host else self.bind_host, self.bind_port),
            "dataDir": self.data_dir,
            "webDir": self.web_dir,
            "founders": list(self.logins),
            "trustedProxies": [str(net) for net in self.trusted_proxies],
            "csp": self.csp_mode,
            "cspOverrideUntil": self.csp_override_until.isoformat() if self.csp_override_until else None,
            "kdf": self.kdf,
            "cookie": self.cookie_name,
            "warnings": list(self.warnings),
        }

    # -- reading the environment ---------------------------------------------

    @classmethod
    def from_env(cls, environ: Mapping[str, str], clock: Clock = utcnow,
                 scrypt_available: Optional[bool] = None) -> "Settings":
        """Read ``MONEY_*`` from ``environ``. Raises ``ConfigError`` when the stand must not start.

        ``clock`` decides whether ``MONEY_CSP_OVERRIDE_UNTIL`` has passed.
        ``scrypt_available`` is for tests; None asks this Python.
        """
        def get(name: str) -> str:
            value = environ.get(name)
            return value.strip() if isinstance(value, str) else ""

        warnings = []
        unknown = sorted(
            name for name in environ
            if isinstance(name, str) and name.startswith("MONEY_")
            and name not in ENV_NAMES and name not in COMPOSE_ONLY_ENV
        )
        if unknown:
            warnings.append("unknown setting ignored: %s" % ", ".join(_short(name) for name in unknown[:8]))

        stand = get("MONEY_STAND")
        if stand not in STANDS:
            raise ConfigError("MONEY_STAND must be prod, test or dev (got '%s')." % _short(stand))

        public_url, public_host, hostname = _public_url(get("MONEY_PUBLIC_URL"), stand)
        bind_host, bind_port, loopback = _bind(get("MONEY_BIND"))
        if stand == "dev" and not loopback:
            raise ConfigError(
                "MONEY_STAND=dev speaks plain http with a weak password hash, so it must bind a "
                "loopback address (127.0.0.1 or ::1), not %s." % bind_host)

        founders = _founders(get("MONEY_FOUNDERS"))
        data_dir, web_dir = _directories(get("MONEY_DATA_DIR"), get("MONEY_WEB_DIR"))
        proxies = _proxies(get("MONEY_TRUSTED_PROXIES"))
        if stand != "dev" and not proxies:
            warnings.append(
                "MONEY_TRUSTED_PROXIES is empty: X-Forwarded-For is never believed, "
                "so every caller behind the edge counts as one address")

        csp_mode, csp_until, csp_ended = _csp(get("MONEY_CSP"), get("MONEY_CSP_OVERRIDE_UNTIL"), stand, clock)
        if csp_ended and csp_until is not None:
            # Not a refusal. The override is baked into the container until the next deploy; were this
            # one, the health check and every ctl command would stop on the day after, and the next
            # restart would not come up - for a setting that asks for nothing any more.
            warnings.append(
                "MONEY_CSP=report-only is no longer in force: the override ended on %s, so the content "
                "security policy is enforced. Deploy without MONEY_CSP, or name a new day"
                % csp_until.isoformat())
        elif csp_mode == "report-only":
            warnings.append("the content security policy is report-only" + (
                " until %s" % csp_until.isoformat() if stand == "prod" and csp_until else ""))

        kdf = _kdf(get("MONEY_KDF"), stand,
                   hasattr(hashlib, "scrypt") if scrypt_available is None else bool(scrypt_available))

        version = get("MONEY_VERSION") or "dev"
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,63}", version):
            raise ConfigError("MONEY_VERSION must be a short version string like 1.0.0 (got '%s')." % _short(version))

        return cls(
            stand=stand, public_url=public_url, public_host=public_host, founders=founders,
            data_dir=data_dir, web_dir=web_dir, bind_host=bind_host, bind_port=bind_port,
            trusted_proxies=proxies, csp_mode=csp_mode, csp_override_until=csp_until,
            kdf=kdf, version=version, warnings=tuple(warnings),
            # A stand asks for the day's rates; a dev stand - a test, CI's browser smoke - asks nobody.
            rates_urls=() if stand == "dev" else RATES_URLS,
        )


# ---------------------------------------------------------------------------
# One setting at a time
# ---------------------------------------------------------------------------

_HOSTNAME = re.compile(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*")


def _public_url(raw: str, stand: str) -> Tuple[str, str, str]:
    """-> (public_url, public_host, hostname)."""
    if not raw:
        raise ConfigError(
            "MONEY_PUBLIC_URL is not set: it is the one address this stand answers on, "
            "for example https://finance.selfstudio.se.")
    try:
        parts = urlsplit(raw)
        port = parts.port
        hostname = (parts.hostname or "").lower()
    except ValueError:
        raise ConfigError("MONEY_PUBLIC_URL is not a URL (got '%s')." % _short(raw))
    if parts.scheme not in ("http", "https"):
        raise ConfigError("MONEY_PUBLIC_URL must start with https:// (http:// on dev); got '%s'." % _short(raw))
    if parts.username is not None or parts.password is not None or parts.query or parts.fragment \
            or parts.path not in ("", "/") or "?" in raw or "#" in raw:
        raise ConfigError("MONEY_PUBLIC_URL must be scheme://host[:port] and nothing more (got '%s')." % _short(raw))
    if not hostname or len(hostname) > 253 or not _HOSTNAME.fullmatch(hostname):
        raise ConfigError("MONEY_PUBLIC_URL has no usable host name (got '%s')." % _short(raw))
    if port == 0:
        raise ConfigError("MONEY_PUBLIC_URL names port 0, which no browser can reach.")
    if not hostname.startswith("finance."):
        raise ConfigError(
            "The public host must start with 'finance.' (got '%s'): on any other name the page "
            "quietly keeps the data in the browser instead of on this server." % _short(hostname))
    if stand == "dev":
        if parts.scheme != "http":
            raise ConfigError("MONEY_STAND=dev speaks plain http: MONEY_PUBLIC_URL must start with http://.")
        if not hostname.endswith(".localhost"):
            raise ConfigError(
                "MONEY_STAND=dev speaks plain http with a weak password hash, so its public host must "
                "end in .localhost, for example http://finance.localhost:8123 (got '%s')." % _short(hostname))
    elif parts.scheme != "https":
        raise ConfigError("MONEY_STAND=%s must have an https:// public URL (got '%s')." % (stand, _short(raw)))
    default_port = 443 if parts.scheme == "https" else 80
    host = hostname if port in (None, default_port) else "%s:%d" % (hostname, port)
    return "%s://%s" % (parts.scheme, host), host, hostname


_BIND = re.compile(r"\[([0-9A-Fa-f:.]+)\]:([0-9]{1,5})|([0-9.]+):([0-9]{1,5})")


def _bind(raw: str) -> Tuple[str, int, bool]:
    """-> (host, port, is_loopback). The host must be an address, so the rule needs no DNS."""
    raw = raw or "127.0.0.1:8080"
    match = _BIND.fullmatch(raw)
    if not match:
        raise ConfigError(
            "MONEY_BIND must be address:port with a literal address, like 0.0.0.0:8080 or [::1]:8080 "
            "(got '%s')." % _short(raw))
    host = match.group(1) or match.group(3)
    port = int(match.group(2) or match.group(4))
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        raise ConfigError("MONEY_BIND does not name an IP address (got '%s')." % _short(raw))
    if not 1 <= port <= 65535:
        raise ConfigError("MONEY_BIND names port %d; a port is 1 to 65535." % port)
    return str(address), port, bool(address.is_loopback)


_LOGIN = re.compile(r"[a-z][a-z0-9._-]{0,31}")


def _founders(raw: str) -> Tuple[Tuple[str, str], ...]:
    if not raw:
        raise ConfigError(
            "MONEY_FOUNDERS is not set: it names who may sign in, as login:FirstName,login:FirstName.")
    found = []
    seen = set()
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        login, colon, name = item.partition(":")
        login, name = login.strip(), name.strip()
        if not colon or not _LOGIN.fullmatch(login):
            raise ConfigError(
                "MONEY_FOUNDERS: '%s' is not login:FirstName (a login is lower-case letters, digits, "
                "dot, dash or underscore, starting with a letter, 32 at most)." % _short(item))
        if not name or len(name) > 40 or ":" in name or any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
            raise ConfigError("MONEY_FOUNDERS: the first name of '%s' is empty or not a name." % login)
        if login in seen:
            raise ConfigError("MONEY_FOUNDERS names the login '%s' twice." % login)
        seen.add(login)
        found.append((login, name))
    if not found:
        raise ConfigError("MONEY_FOUNDERS names nobody.")
    if len(found) > 20:
        raise ConfigError("MONEY_FOUNDERS names %d logins; this service is built for a handful." % len(found))
    return tuple(found)


def _directories(raw_data: str, raw_web: str) -> Tuple[str, str]:
    if not raw_data:
        raise ConfigError("MONEY_DATA_DIR is not set: it is the directory this stand keeps its documents in.")
    if not os.path.isabs(raw_data):
        raise ConfigError("MONEY_DATA_DIR must be an absolute path (got '%s')." % _short(raw_data))
    data_dir = os.path.normpath(raw_data)
    # Without the variable the page is beside the package: a checkout that is simply run.
    web_dir = os.path.abspath(raw_web) if raw_web else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Both sides are resolved through every link: the laptop's data/ may itself be a link to
    # another volume, and it is the laptop's data wherever it lies.
    laptop = os.path.realpath(os.path.join(web_dir, "data"))
    real = os.path.realpath(data_dir)
    if real == laptop or real.startswith(laptop + os.sep):
        raise ConfigError(
            "MONEY_DATA_DIR points at the checkout's own data/ folder (%s): that is where the laptop tool "
            "keeps the real ledger. Give the hosted service a directory of its own." % _short(data_dir))
    return data_dir, web_dir


def _proxies(raw: str) -> Tuple[Network, ...]:
    networks = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            network = ipaddress.ip_network(item, strict=False)
        except ValueError:
            raise ConfigError("MONEY_TRUSTED_PROXIES: '%s' is not an address or a network." % _short(item))
        # A range this wide is "believe anybody's X-Forwarded-For", which is an off-switch.
        if network.prefixlen < (8 if network.version == 4 else 7):
            raise ConfigError(
                "MONEY_TRUSTED_PROXIES: '%s' is too wide to be a proxy; name the edge's own range." % _short(item))
        networks.append(network)
    return tuple(networks)


_DAY = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")


def _csp(raw_mode: str, raw_until: str, stand: str, clock: Clock) -> Tuple[str, Optional[datetime.date], bool]:
    """-> (mode, the day an override ends, whether a prod override has already ended)."""
    mode = raw_mode or "enforce"
    if mode not in ("enforce", "report-only"):
        raise ConfigError(
            "MONEY_CSP must be enforce or report-only (got '%s'); there is no way to switch the policy off."
            % _short(raw_mode))
    until = None
    if raw_until:
        match = _DAY.fullmatch(raw_until)
        try:
            until = datetime.date(*(int(part) for part in match.groups())) if match else None
        except ValueError:
            until = None
        if until is None:
            raise ConfigError("MONEY_CSP_OVERRIDE_UNTIL must be a day as YYYY-MM-DD (got '%s')." % _short(raw_until))
    ended = False
    if mode == "report-only" and stand == "prod":
        if until is None:
            raise ConfigError(
                "MONEY_CSP=report-only is refused on prod unless MONEY_CSP_OVERRIDE_UNTIL=YYYY-MM-DD "
                "names the day the override ends.")
        # A day that has passed is the override running out, as it was always going to:
        # ``Settings.csp_report_only`` enforces from then on, and the caller says so in a warning.
        ended = until < as_utc(clock()).date()
    return mode, until, ended


def _kdf(raw: str, stand: str, scrypt_available: bool) -> str:
    if stand != "dev":
        if raw and raw != "scrypt":
            raise ConfigError(
                "MONEY_KDF=%s is refused on %s: only MONEY_STAND=dev may use a weaker password hash."
                % (_short(raw), stand))
        if not scrypt_available:
            raise ConfigError(
                "This Python has no hashlib.scrypt, and MONEY_STAND=%s does not start without it." % stand)
        return "scrypt"
    kdf = raw or ("scrypt" if scrypt_available else "pbkdf2")
    if kdf not in ("scrypt", "pbkdf2"):
        raise ConfigError("MONEY_KDF must be scrypt or pbkdf2 (got '%s')." % _short(raw))
    if kdf == "scrypt" and not scrypt_available:
        raise ConfigError("MONEY_KDF=scrypt, but this Python has no hashlib.scrypt; use MONEY_KDF=pbkdf2 on dev.")
    return kdf
