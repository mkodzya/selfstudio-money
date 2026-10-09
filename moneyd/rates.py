"""Exchange rates by day: asked of a public source once a day, kept in ``<data>/rates/days.json``.

The owner's decision of 9 October 2026: the rates are no longer typed by hand - the server takes
them once a day from an open source, without a key and without a fee - and what has already
happened is counted at the rate of its own day and does not move with today's. So the table is
kept **by day**, a day is never rewritten once it is in, and the page is handed all of it.

API for the HTTP layer and the tests
------------------------------------
    rates = Rates(settings, clock, security_log)      # ``settings.rates_urls`` empty: nothing is ever asked
    rates.answer(wait=2.5) -> bytes                   # GET /api/rates: the table as JSON, and - when the
                                                      # table is behind and it is time - a refresh begun
    rates.table() -> {"base": "GBP", "days": {"2026-10-01": {"USD": 1.32, ...}, ...}, "asked": "<UTC>" | None}
    rates.refresh() -> int                            # ask now, in this thread: how many days came in
    rates.idle(seconds) -> bool                       # for tests: no refresh is running (any more)

What is asked, and of whom
    One address per day, ``settings.rates_urls`` with ``{day}`` filled in - the first that answers.
    Only ``https`` (``http`` to a loopback address, for the tests), never a redirect, 512 KiB at
    most, ``settings.rates_timeout`` seconds. The answer is the source's own JSON,
    ``{"date": "<day>", "gbp": {"usd": 1.32, ...}}``, and four numbers are read out of it: what one
    pound costs in USD, EUR, RUB and AMD. Nothing else in it is looked at, nothing in it is kept.

What is believed
    The day the answer names must be the day that was asked. Each of the four must be a number
    within the bounds a rate of that currency could have (``BOUNDS``), and within ``JUMP`` a day
    of one of the three days nearest to it that the table already holds: a source that has gone
    wrong - or been made to - must not be able to move the studio's figures by more than a market
    does in a day. An answer that fails is thrown away whole, with a line in the security log, and
    the day is asked again later.

    Two things keep one wrong answer from shutting the table against the true ones. It is held
    against three neighbours, not one: a day that is wrong and got in (into an empty table, say,
    where only the bounds stand) is outvoted as soon as two true days stand beside it. And when
    the market really has moved further than ``JUMP`` allows, the days refused for it agree with
    each other: an answer that is as near to two other refused days as it should have been to the
    table is believed after all (``_doubt``) - two of the same week (``AGREE_DAYS``); a doubt that
    nothing bore out is dropped after a month (``DOUBT_DAYS``).

When
    Never on a timer. The page asks ``GET /api/rates`` once when it opens; if the table lacks a day
    between ``settings.rates_first_day`` and today (UTC) and the last attempt was more than
    ``settings.rates_wait`` seconds ago, a refresh is begun in a thread of its own - today first,
    then the days behind it, ``settings.rates_days_per_ask`` at most - and the door waits for it
    no longer than ``settings.rates_door_wait``: a source that is slow or away never holds a page,
    and one that answers hands the page the whole table at once. What did not come this time
    comes at a later opening. A day the source says it does not have is given up after
    ``settings.rates_tries_per_day`` askings, and so is a day in doubt once the table holds a day
    after it; a day that could not be asked for at all - no connection, a source that is unwell
    (5xx, 429) - is not counted against it.

On disk
    ``rates/days.json``, written whole (temporary file, fsync, rename). A file that cannot be read
    is not repaired by guessing: it is moved aside as ``days.json.damaged-<utc>`` and the table
    begins anew - every day in it can be asked again.
"""
import datetime
import http.client
import ipaddress
import json
import math
import os
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

from .config import Clock, as_utc, iso, stamp, utcnow
from .store import atomic_write

__all__ = ["Rates", "CURRENCIES", "BOUNDS", "JUMP", "MAX_BYTES", "fetch_day", "read_answer", "Refused"]

#: The currencies the page counts in beside the pound, as the page names them.
CURRENCIES = ("USD", "EUR", "RUB", "AMD")
#: What one pound could cost in each: about half and about twice what it has cost in the last
#: twenty years. Outside it an answer is not a rate. An empty table is guarded by nothing else.
BOUNDS = {"USD": (0.9, 2.2), "EUR": (0.9, 1.8), "RUB": (40.0, 500.0), "AMD": (250.0, 1500.0)}
#: How far a rate may stand from a day the table holds, per day between them (and three times that
#: at most): 12% is more than three of the four have moved in a day in twenty years; the fourth,
#: the rouble, has - and ``_doubt`` is for that.
JUMP = 0.12
#: Two doubted days bear a third out only when they are of the same week as it; a doubt that nothing
#: bore out is forgotten after a month.
AGREE_DAYS = 7
DOUBT_DAYS = 30
#: The source's answer for one day is about 12 KiB.
MAX_BYTES = 512 * 1024

_DAY_FORMAT = "%Y-%m-%d"


class Refused(Exception):
    """An answer that is not believed, or did not come. ``reason`` is a short fixed word for the log."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """The address that was asked is the one that answers, or nobody does."""

    def redirect_request(self, req: Any, fp: Any, code: Any, msg: Any, headers: Any, newurl: Any) -> None:
        return None


def _allowed(url: str) -> bool:
    """``https``; or ``http`` to a loopback address, which is what a test's stand-in is."""
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    if parts.scheme == "https":
        return bool(parts.hostname)
    if parts.scheme != "http" or not parts.hostname:
        return False
    try:
        return ipaddress.ip_address(parts.hostname).is_loopback
    except ValueError:
        return False


def read_answer(raw: bytes, day: str) -> Dict[str, float]:
    """The four rates out of the source's answer for ``day``. Raises ``Refused``.

    Read strictly, and only what is needed: the day it names, and under ``gbp`` the four numbers.
    """
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, RecursionError):
        raise Refused("not-json")
    if not isinstance(data, dict) or data.get("date") != day:
        raise Refused("another-day")
    quoted = data.get("gbp")
    if not isinstance(quoted, dict):
        raise Refused("no-rates")
    found = {}  # type: Dict[str, float]
    for currency in CURRENCIES:
        value = quoted.get(currency.lower())
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise Refused("no-rates")
        low, high = BOUNDS[currency]
        if not low <= value <= high:
            raise Refused("out-of-bounds")
        found[currency] = round(float(value), 6)
    return found


def fetch_day(url: str, timeout: float) -> bytes:
    """What ``url`` answers, as bytes. Raises ``Refused``: for anything but a 200 of a sane size."""
    if not _allowed(url):
        raise Refused("bad-address")
    opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    request = urllib.request.Request(url, headers={"User-Agent": "selfstudio-money", "Accept": "application/json"})
    try:
        with opener.open(request, timeout=timeout) as answer:
            if getattr(answer, "status", 200) != 200:
                raise Refused("status")
            raw = answer.read(MAX_BYTES + 1)
    except Refused:
        raise
    except urllib.error.HTTPError as answered:
        code = answered.code
        answered.close()
        if code >= 500 or code == 429:
            raise Refused("no-answer")          # the source is unwell or busy: that says nothing about the day
        raise Refused("status")                 # the source answered: it has no such day (yet), or will not say
    except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError):
        raise Refused("no-answer")              # nobody answered: no connection, a broken one, a slow one
    if len(raw) > MAX_BYTES:
        raise Refused("too-large")
    return raw


class Rates:
    """The table of rates by day, and the asking that fills it. See the module's own description."""

    def __init__(self, settings: Any, clock: Clock = utcnow, security_log: Any = None,
                 fetch: Optional[Callable[[str, float], bytes]] = None):
        self._settings = settings
        self._clock = clock
        self._security_log = security_log
        self._fetch = fetch or fetch_day
        self.path = os.path.join(settings.data_dir, "rates", "days.json")
        self._lock = threading.Lock()           # the table in memory, and its file
        self._asking = threading.Lock()         # one refresh at a time
        self._landed = threading.Event()        # set whenever a refresh has brought a day in, or ended
        self._days = None  # type: Optional[Dict[str, Dict[str, float]]]
        self._asked = None  # type: Optional[datetime.datetime]
        self._gaps = {}  # type: Dict[str, int]     day -> how often the source said it did not have it
        self._noted = set()  # type: set          (day, reason) already in the security log
        self._doubt = {}  # type: Dict[str, Dict[str, float]]     day -> what was refused as too far from the table

    # -- the table -----------------------------------------------------------

    @property
    def on(self) -> bool:
        return bool(self._settings.rates_urls)

    def _load(self) -> Dict[str, Dict[str, float]]:
        """The table off the disk, once. Called under ``self._lock``."""
        if self._days is not None:
            return self._days
        days = {}  # type: Dict[str, Dict[str, float]]
        try:
            with open(self.path, "rb") as handle:
                raw = handle.read(8 * 1024 * 1024)
        except FileNotFoundError:
            raw = None
        except OSError:
            raw = None
        if raw is not None:
            try:
                data = json.loads(raw.decode("utf-8"))
                if not isinstance(data, dict) or data.get("v") != 1 or not isinstance(data.get("days"), dict):
                    raise ValueError("not a table of rates")
                for day, quoted in data["days"].items():
                    self._day(day)
                    if not isinstance(quoted, dict):
                        raise ValueError("a day that is not a table")
                    kept = {}
                    for currency in CURRENCIES:
                        value = quoted.get(currency)
                        low, high = BOUNDS[currency]
                        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                            raise ValueError("a rate that is not one")
                        kept[currency] = float(value)
                    days[day] = kept
                asked = data.get("asked")
                self._asked = datetime.datetime.strptime(asked, "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=datetime.timezone.utc) if isinstance(asked, str) else None
            except (ValueError, TypeError):
                days = {}
                self._asked = None
                self._set_aside()
        self._days = days
        return days

    def _set_aside(self) -> None:
        name = "%s.damaged-%s" % (self.path, stamp(as_utc(self._clock())))
        try:
            os.replace(self.path, name)
        except OSError:
            name = ""
        self._note("rates-damaged", detail=os.path.basename(name) or "could not be moved aside")

    def _save(self) -> None:
        """The table onto the disk, whole. Called under ``self._lock``; a disk that refuses is not a fault."""
        data = {"v": 1, "base": "GBP", "days": {day: self._days[day] for day in sorted(self._days or {})},
                "asked": iso(self._asked) if self._asked is not None else None}
        try:
            os.makedirs(os.path.dirname(self.path), mode=0o700, exist_ok=True)
            atomic_write(self.path, (json.dumps(data, separators=(",", ":")).encode("ascii"),))
        except OSError:
            pass            # the table is in memory; the next day that comes in writes it again

    @staticmethod
    def _day(text: Any) -> datetime.date:
        if not isinstance(text, str) or len(text) != 10:
            raise ValueError("not a day")
        return datetime.datetime.strptime(text, _DAY_FORMAT).date()

    def table(self) -> Dict[str, Any]:
        with self._lock:
            days = self._load()
            return {"base": "GBP", "days": {day: dict(days[day]) for day in sorted(days)},
                    "asked": iso(self._asked) if self._asked is not None else None}

    def answer(self, wait: float = 2.5) -> bytes:
        """The table as the door sends it. Begins a refresh when it is time, and waits for it a moment."""
        if self.on and self._due():
            if not self._asking.locked():       # a refresh that is on its way is waited for, not doubled
                self._landed.clear()
                threading.Thread(target=self._refresh_quietly, name="money-rates", daemon=True).start()
            self._landed.wait(max(0.0, wait))
        return json.dumps(self.table(), separators=(",", ":")).encode("ascii")

    # -- the asking ----------------------------------------------------------

    def _today(self) -> datetime.date:
        return as_utc(self._clock()).date()

    def _wanted(self) -> List[str]:
        """The days the table lacks, today first, then backwards. Called under ``self._lock``."""
        days = self._load()
        first = self._settings.rates_first_day
        day = self._today()
        wanted = []  # type: List[str]
        while day >= first and len(wanted) < self._settings.rates_days_per_ask:
            text = day.strftime(_DAY_FORMAT)
            if text not in days and self._gaps.get(text, 0) < self._settings.rates_tries_per_day:
                wanted.append(text)
            day -= datetime.timedelta(days=1)
        return wanted

    def _due(self) -> bool:
        with self._lock:
            if not self._wanted():
                return False
            if self._asked is None:
                return True
            return (as_utc(self._clock()) - self._asked).total_seconds() >= self._settings.rates_wait

    def _refresh_quietly(self) -> None:
        try:
            self.refresh()
        except Exception:                       # noqa: BLE001 - a thread of its own: nothing may come out of it
            pass
        finally:
            self._landed.set()

    def refresh(self) -> int:
        """Ask for the days the table lacks. How many came in. Never raises for what the source does."""
        if not self.on or not self._asking.acquire(False):
            return 0
        try:
            with self._lock:
                wanted = self._wanted()
                today = self._today()
                for day in [day for day in self._doubt if (today - self._day(day)).days > DOUBT_DAYS]:
                    del self._doubt[day]        # a doubt nobody confirmed in a month was a slip of the source's
                self._asked = as_utc(self._clock()).replace(microsecond=0)
                self._save()                    # the attempt is noted first: a source that hangs is not asked again at once
            came = 0
            for day in wanted:
                try:
                    quoted = self._ask(day)
                    with self._lock:
                        self._believe(day, quoted)
                        self._days[day] = quoted
                        self._gaps.pop(day, None)
                        self._save()
                    came += 1
                except Refused as refusal:
                    with self._lock:
                        # Counted against a day only when the source answered and did not have it: a day
                        # nobody could be asked for is asked for again, and so is one that is in doubt -
                        # until the table has gone on past it: then the days after it did not bear it out,
                        # it was a slip of the source's, and it is not asked for on every round for good.
                        # (Today's day is simply not out yet for some hours; that is no fault of anybody's.)
                        counted = refusal.reason != "no-answer" and day != self._today().strftime(_DAY_FORMAT)
                        if refusal.reason == "jump":
                            counted = any(other > day for other in self._days or {})
                        if counted:
                            self._gaps[day] = self._gaps.get(day, 0) + 1
                    if refusal.reason not in ("no-answer", "status") and (day, refusal.reason) not in self._noted:
                        self._noted.add((day, refusal.reason))
                        self._note("rates-refused", day=day, reason=refusal.reason)
            return came
        finally:
            self._asking.release()

    def _ask(self, day: str) -> Dict[str, float]:
        # Of two addresses that both refuse, the one that said more is the answer: what it read and
        # would not take, before "no such day", before nobody answering at all.
        weight = {"no-answer": 0, "status": 1}
        said = Refused("no-answer")
        for template in self._settings.rates_urls:
            try:
                return read_answer(self._fetch(template.replace("{day}", day), self._settings.rates_timeout), day)
            except Refused as refusal:
                if weight.get(refusal.reason, 2) > weight.get(said.reason, 2):
                    said = refusal
        raise said

    def _apart(self, day: str, other: str) -> int:
        return max(1, abs((self._day(other) - self._day(day)).days))

    @staticmethod
    def _near(quoted: Dict[str, float], held: Dict[str, float], days: int) -> bool:
        """Whether ``quoted`` is as near to ``held`` as a market moves in ``days`` days (three at most)."""
        allowed = JUMP * min(3, days)
        return all(abs(quoted[currency] - held[currency]) <= allowed * held[currency] for currency in CURRENCIES)

    def _believe(self, day: str, quoted: Dict[str, float]) -> None:
        """Hold the new day against the days the table has. Raises ``Refused``. Under ``self._lock``.

        Near enough to one of the three days nearest to it - by what a market moves in the days to the
        nearest of them: believed. Else it is kept as doubted, and believed all the same once two other
        doubted days of the same week are that near to it - then it is the table that is out of step,
        and not the source three days running.

        Three days' files that agree are believed whether they were asked for on three mornings or in one
        round after a quiet weekend: a day's file does not change once it is out, so waiting adds nothing
        to what it says. A source that is wrong three days running is held by ``BOUNDS`` alone.
        """
        known = sorted(self._days or {}, key=lambda other: self._apart(day, other))[:3]
        if not known:
            return
        reach = self._apart(day, known[0])
        if any(self._near(quoted, self._days[other], reach) for other in known):
            self._doubt.pop(day, None)
            return
        agree = [other for other, held in self._doubt.items()
                 if other != day and self._apart(day, other) <= AGREE_DAYS
                 and self._near(quoted, held, self._apart(day, other))]
        self._doubt[day] = quoted
        if len(agree) >= 2:
            self._doubt.pop(day, None)
            self._note("rates-moved", day=day)
            return
        raise Refused("jump")

    def idle(self, seconds: float = 10.0) -> bool:
        """For tests: wait until no refresh is running. True when none is."""
        if self._asking.acquire(timeout=seconds):
            self._asking.release()
            return True
        return False

    def _note(self, event: str, **fields: Any) -> None:
        if self._security_log is not None:
            try:
                self._security_log.write(event, **fields)
            except Exception:                   # noqa: BLE001 - the log is not what this is for
                pass
