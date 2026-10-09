"""The exchange rates by day: what is asked of the source, what is believed, what the door answers.

    python3 -m unittest tests.test_rates -v

Every test is one rule of ``moneyd/rates.py`` or of docs/api.md, "GET /api/rates", and its name
says the rule. Nothing here reaches the internet: the source is a function handed to ``Rates``,
or - where the point is what is asked over a socket - a stand-in on a loopback port.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import datetime
import http.server
import json
import os
import threading
import time
import unittest
from typing import Any, Dict, List, Optional

from tests import _harness
from tests._harness import PATIENCE, until

from moneyd import config, rates

RATES = "/api/rates"
URLS = ("https://one.example/{day}.json", "https://two.example/{day}.json")
#: The stand's clock stands on 7 October 2026, 12:00 UTC.
TODAY = "2026-10-07"
GOOD = {"USD": 1.3247, "EUR": 1.1705, "RUB": 110.48, "AMD": 482.49}


def answer_for(day: str, **changes: Any) -> bytes:
    """What the source says for ``day``: its own JSON, with more in it than is ever read."""
    quoted = {"usd": GOOD["USD"], "eur": GOOD["EUR"], "rub": GOOD["RUB"], "amd": GOOD["AMD"], "jpy": 201.5, "btc": 0.00001}
    quoted.update(changes)
    return json.dumps({"date": day, "gbp": quoted}).encode("ascii")


class Source:
    """The source as a function: what it was asked, and what it says (per day, or for every day)."""

    def __init__(self, says: Optional[Dict[str, Any]] = None):
        self.asked = []  # type: List[str]
        self.says = says or {}
        self.gate = None  # type: Optional[threading.Event]

    def __call__(self, url: str, timeout: float) -> bytes:
        self.asked.append(url)
        if self.gate is not None:
            self.gate.wait(PATIENCE)
        day = url.rsplit("/", 1)[1][:10]
        said = self.says.get(url, self.says.get(day, answer_for(day)))
        if isinstance(said, Exception):
            raise said
        return said

    def days(self, host: str = "one.example") -> List[str]:
        return [url.rsplit("/", 1)[1][:10] for url in self.asked if host in url]


class Case(unittest.TestCase):
    def setUp(self):
        self.stand = _harness.Stand(start=False, tune={"rates_urls": URLS, "rates_door_wait": 0.05})
        self.addCleanup(self.stand.stop)
        self.source = Source()

    def table(self, **options: Any) -> rates.Rates:
        made = rates.Rates(self.stand.settings, self.stand.clock, self.stand.security_log, fetch=self.source, **options)
        self.addCleanup(made.idle)
        return made

    def events(self, name: str) -> List[Dict[str, Any]]:
        return [entry for entry in self.stand.security_events() if entry.get("event") == name]


# ---------------------------------------------------------------------------
# What is believed
# ---------------------------------------------------------------------------

class ReadingTests(unittest.TestCase):
    def test_four_numbers_are_read_out_of_the_sources_answer_and_nothing_else(self):
        self.assertEqual(rates.read_answer(answer_for(TODAY), TODAY), GOOD)

    def test_an_answer_that_is_not_the_days_rates_is_refused_whole(self):
        refused = (
            (b"", "not-json"), (b"<html>", "not-json"), (b"[1,2]", "another-day"), (b'{"date":"2026-10-06","gbp":{}}', "another-day"),
            (json.dumps({"date": TODAY}).encode(), "no-rates"), (json.dumps({"date": TODAY, "gbp": []}).encode(), "no-rates"),
            (answer_for(TODAY, usd="1.32"), "no-rates"), (answer_for(TODAY, eur=True), "no-rates"), (answer_for(TODAY, rub=None), "no-rates"),
            (answer_for(TODAY, usd=0), "out-of-bounds"), (answer_for(TODAY, usd=-1.3), "out-of-bounds"), (answer_for(TODAY, rub=5), "out-of-bounds"),
            (answer_for(TODAY, amd=1e9), "out-of-bounds"), (answer_for(TODAY).replace(b"1.3247", b"NaN"), "no-rates"),
            (answer_for(TODAY).replace(b"1.3247", b"Infinity"), "no-rates"),
        )
        for raw, reason in refused:
            with self.subTest(raw=raw[:60]):
                with self.assertRaises(rates.Refused) as said:
                    rates.read_answer(raw, TODAY)
                self.assertEqual(said.exception.reason, reason)

    def test_a_missing_currency_is_a_refusal_not_a_gap(self):
        raw = json.dumps({"date": TODAY, "gbp": {"usd": 1.32, "eur": 1.17, "rub": 110.0}}).encode()
        with self.assertRaises(rates.Refused):
            rates.read_answer(raw, TODAY)


# ---------------------------------------------------------------------------
# The table and the asking
# ---------------------------------------------------------------------------

class TableTests(Case):
    def test_a_refresh_asks_for_today_first_and_then_for_the_days_behind_it_back_to_the_first(self):
        table = self.table()
        self.assertEqual(table.refresh(), 7)
        self.assertEqual(self.source.days(), ["2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03",
                                              "2026-10-02", "2026-10-01"])
        said = table.table()
        self.assertEqual((said["base"], sorted(said["days"]), said["days"][TODAY], said["asked"]),
                         ("GBP", ["2026-10-0%d" % n for n in range(1, 8)], GOOD, "2026-10-07T12:00:00Z"))

    def test_a_day_that_is_in_is_never_asked_for_again_and_never_rewritten(self):
        table = self.table()
        table.refresh()
        self.source.says = {TODAY: answer_for(TODAY, usd=1.4)}
        self.stand.clock.tick(days=1)
        self.assertEqual(table.refresh(), 1)
        self.assertEqual(self.source.days()[7:], ["2026-10-08"])
        self.assertEqual(table.table()["days"][TODAY]["USD"], GOOD["USD"])

    def test_no_more_days_are_asked_for_at_once_than_the_setting_says(self):
        self.stand.clock.tick(days=30)
        table = self.table()
        self.assertEqual(table.refresh(), 10)
        self.assertEqual(len(self.source.asked), 10)
        self.assertEqual(table.refresh(), 10)
        self.assertEqual(len(table.table()["days"]), 20)

    def test_the_second_address_is_asked_when_the_first_does_not_answer(self):
        self.source.says = {URLS[0].replace("{day}", TODAY): rates.Refused("no-answer")}
        table = self.table()
        table.refresh()
        self.assertIn(TODAY, table.table()["days"])
        self.assertEqual(self.source.days("two.example"), [TODAY])

    def test_a_rate_too_far_from_the_day_before_is_thrown_away_said_in_the_log_once_and_asked_again(self):
        table = self.table()
        table.refresh()
        self.stand.clock.tick(days=1)
        self.source.says = {"2026-10-08": answer_for("2026-10-08", rub=GOOD["RUB"] * 1.2)}
        self.assertEqual(table.refresh(), 0)
        self.assertNotIn("2026-10-08", table.table()["days"])
        self.stand.clock.tick(hours=1)
        self.assertEqual(table.refresh(), 0)
        self.assertEqual([(entry["day"], entry["reason"]) for entry in self.events("rates-refused")], [("2026-10-08", "jump")])
        for _attempt in range(8):                                      # a day in doubt is asked for again, however often
            self.stand.clock.tick(hours=1)
            self.assertEqual(table.refresh(), 0)
        self.source.says = {}
        self.stand.clock.tick(hours=1)
        self.assertEqual(table.refresh(), 1)
        self.assertEqual(table.table()["days"]["2026-10-08"], GOOD)

    def test_a_long_silence_allows_three_days_of_movement_and_no_more(self):
        table = self.table()
        table.refresh()
        self.stand.clock.tick(days=40)
        day = "2026-11-16"
        away = {"2026-11-%02d" % n: rates.Refused("no-answer") for n in range(7, 16)}       # only today's day can be had
        self.source.says = dict(away, **{day: answer_for(day, usd=GOOD["USD"] * 1.4)})
        table.refresh()
        self.assertNotIn(day, table.table()["days"], "40% from the last day held, forty days back: three days of movement is 36%")
        self.source.says = dict(away, **{day: answer_for(day, usd=GOOD["USD"] * 1.3)})
        self.stand.clock.tick(hours=1)
        table.refresh()
        self.assertEqual(table.table()["days"][day]["USD"], round(GOOD["USD"] * 1.3, 6))

    def test_a_day_is_held_by_what_a_market_moves_in_the_days_to_its_nearest_neighbour(self):
        # Two days back 24% would pass; the day beside it is one day away, and one day is 12%.
        table = self.table()
        table.refresh()
        self.stand.clock.tick(days=1)
        self.source.says = {"2026-10-08": answer_for("2026-10-08", usd=GOOD["USD"] * 1.2)}
        self.assertEqual(table.refresh(), 0)
        self.assertNotIn("2026-10-08", table.table()["days"])

    def test_one_wrong_day_in_the_table_does_not_shut_it_against_the_true_ones(self):
        # review, 9 October 2026: the first answer into an empty table is held by the bounds alone. A wrong
        # one that got in was then the day every true answer was "too far" from, for good.
        self.stand.clock.set(_harness.FakeClock().now.replace(day=1))           # 1 October: the table is empty
        self.source.says = {"2026-10-01": answer_for("2026-10-01", usd=2.19)}
        table = self.table()
        self.assertEqual(table.refresh(), 1)
        self.source.says = {}
        came = []
        for _day in range(3):
            self.stand.clock.tick(days=1)
            came.append(table.refresh())
        self.assertEqual(came, [0, 0, 3], "two true days are doubted; the third has two that say the same, and all three come in")
        said = table.table()["days"]
        self.assertEqual([said[d]["USD"] for d in sorted(said)], [2.19, GOOD["USD"], GOOD["USD"], GOOD["USD"]])
        self.assertEqual([entry["day"] for entry in self.events("rates-moved")], ["2026-10-04"])
        self.stand.clock.tick(days=1)
        self.assertEqual(table.refresh(), 1, "and from then on a true day is near to its neighbours")

    def test_a_market_that_really_moved_is_believed_on_the_third_day_that_says_so(self):
        table = self.table()
        table.refresh()
        fallen = lambda day: answer_for(day, rub=GOOD["RUB"] * 1.5)             # by half in a day: more than three days allow
        self.source.says = {"2026-10-08": fallen("2026-10-08"), "2026-10-09": fallen("2026-10-09"), "2026-10-10": fallen("2026-10-10")}
        came = []
        for _day in range(3):
            self.stand.clock.tick(days=1)
            came.append(table.refresh())
        self.assertEqual(came, [0, 0, 3])
        self.assertEqual([entry["day"] for entry in self.events("rates-moved")], ["2026-10-10"])
        self.assertEqual(table.table()["days"]["2026-10-08"]["RUB"], round(GOOD["RUB"] * 1.5, 6))
        self.assertEqual(table.table()["days"]["2026-10-08"]["USD"], GOOD["USD"], "the other three of that day came in with it")

    def test_a_doubted_day_the_table_has_gone_on_past_is_given_up_like_a_day_that_never_comes(self):
        # second reading, 9 October 2026: one wrong day at the source stayed in doubt and was asked for at
        # every round for good.
        table = self.table()
        table.refresh()
        self.source.says = {"2026-10-08": answer_for("2026-10-08", rub=GOOD["RUB"] * 1.5)}
        self.stand.clock.tick(days=1)
        self.assertEqual(table.refresh(), 0, "the 8th, on the 8th: in doubt, and nothing after it yet")
        self.stand.clock.tick(days=1)
        for _attempt in range(9):
            table.refresh()
            self.stand.clock.tick(hours=1)
        self.assertIn("2026-10-09", table.table()["days"])
        self.assertNotIn("2026-10-08", table.table()["days"])
        self.assertEqual(self.source.days().count("2026-10-08"), 6, "once on its own day, and five times after the 9th did not bear it out")

    def test_two_doubted_days_bear_a_third_out_only_when_they_are_of_the_same_week(self):
        # second reading, 9 October 2026: three slips of the source weeks apart that happened to agree
        # were "the market has moved".
        table = self.table()
        table.refresh()
        slip = lambda day: answer_for(day, rub=GOOD["RUB"] * 1.5)
        self.source.says = {day: slip(day) for day in ("2026-10-08", "2026-10-17", "2026-10-27")}
        for _day in range(20):
            self.stand.clock.tick(days=1)
            table.refresh()
        said = table.table()["days"]
        self.assertEqual([day for day in ("2026-10-08", "2026-10-17", "2026-10-27") if day in said], [])
        self.assertEqual(len(said), 7 + 20 - 3, "every other day came in")
        self.assertEqual(self.events("rates-moved"), [])

    def test_of_two_addresses_that_refuse_the_one_that_said_more_is_the_answer(self):
        # second reading, 9 October 2026: "no such day" at the first address and no connection to the second
        # was "nobody answered", so a day the source never published was asked for at every round for good.
        one, two = (url.replace("{day}", "2026-10-04") for url in URLS)
        self.source.says = {one: rates.Refused("status"), two: rates.Refused("no-answer")}
        table = self.table()
        for _attempt in range(8):
            table.refresh()
            self.stand.clock.tick(hours=1)
        self.assertEqual(self.source.days().count("2026-10-04"), 5, "the first address said it has no such day: five tries")
        # ... and what one address read and would not take is said in the log, whatever the other did
        one, two = (url.replace("{day}", "2026-10-08") for url in URLS)
        self.source.says = {one: answer_for("2026-10-08", usd=5.0), two: rates.Refused("status")}
        self.stand.clock.tick(days=1)
        table.refresh()
        self.assertEqual([(entry["day"], entry["reason"]) for entry in self.events("rates-refused")], [("2026-10-08", "out-of-bounds")])

    def test_a_day_nobody_could_be_asked_for_is_not_given_up(self):
        # review, 9 October 2026: five failures of any kind dropped a past day until the process was started again.
        self.source.says = {day: rates.Refused("no-answer") for day in ("2026-10-0%d" % n for n in range(1, 8))}
        table = self.table()
        for _attempt in range(8):
            table.refresh()
            self.stand.clock.tick(hours=1)
        self.source.says = {}
        self.assertEqual(table.refresh(), 7, "the connection is back: every day is asked for and comes")

    def test_todays_day_that_is_not_out_yet_is_no_fault_and_a_past_day_that_never_comes_is_given_up(self):
        self.source.says = {TODAY: rates.Refused("status"), "2026-10-04": rates.Refused("status")}
        table = self.table()
        for _attempt in range(8):
            table.refresh()
            self.stand.clock.tick(hours=1)
        self.assertEqual(self.source.days().count(TODAY), 8, "today is asked for at every attempt")
        self.assertEqual(self.source.days().count("2026-10-04"), 5, "a past day gets five tries")
        self.assertEqual(self.events("rates-refused"), [], "a day that is not there is not a line in the log")

    def test_the_table_is_on_the_disk_and_a_new_process_reads_it(self):
        self.table().refresh()
        self.source.asked = []
        again = self.table()
        self.assertEqual(again.table()["days"][TODAY], GOOD)
        self.assertEqual(again.refresh(), 0)
        self.assertEqual(self.source.asked, [])
        self.assertEqual(oct(os.stat(again.path).st_mode & 0o777), "0o600")

    def test_a_table_that_cannot_be_read_is_moved_aside_and_begun_anew(self):
        first = self.table()
        first.refresh()
        for damage in (b"{", b'{"v":2,"days":{}}', b'{"v":1,"days":{"2026-10-07":{"USD":"1.3"}}}', b'{"v":1,"days":{"yesterday":{}}}'):
            with self.subTest(damage=damage):
                with open(first.path, "wb") as handle:
                    handle.write(damage)
                again = self.table()
                self.assertEqual(again.table()["days"], {})
                self.assertTrue([name for name in os.listdir(os.path.dirname(first.path)) if ".damaged-" in name])
                self.assertEqual(again.refresh(), 7)
                self.stand.clock.tick(seconds=1)
        self.assertEqual(len(self.events("rates-damaged")), 4)

    def test_a_stand_that_is_told_no_address_asks_nobody(self):
        stand = _harness.Stand(start=False)
        self.addCleanup(stand.stop)
        self.assertEqual(stand.settings.rates_urls, (), "the dev stand, and every test but these")
        table = rates.Rates(stand.settings, stand.clock, stand.security_log, fetch=self.source)
        self.assertEqual((table.refresh(), json.loads(table.answer().decode("ascii"))), (0, {"base": "GBP", "days": {}, "asked": None}))
        self.assertEqual(self.source.asked, [])

    def test_a_stand_asks_the_source_at_its_two_addresses_and_dev_asks_nobody(self):
        for name in ("prod", "test"):
            with _harness.scrypt_stand_in():
                environ = _harness.dev_environ("/tmp/nowhere", 1)
                environ.update(_harness.stand_changes(name))
                settings = config.Settings.from_env({k: v for k, v in environ.items() if v is not None}, scrypt_available=True)
            self.assertEqual(settings.rates_urls, config.RATES_URLS, name)
        for url in config.RATES_URLS:
            self.assertTrue(url.startswith("https://") and "{day}" in url and "gbp" in url, url)


# ---------------------------------------------------------------------------
# What is asked over a socket
# ---------------------------------------------------------------------------

class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args: Any) -> None:
        pass

    def do_GET(self) -> None:            # noqa: N802 - the base class's name
        self.server.seen.append(self.path)
        if self.path.startswith("/ok/"):
            body = answer_for(self.path[4:14])
        elif self.path.startswith("/large/"):
            body = b" " * (rates.MAX_BYTES + 10)
        elif self.path.startswith("/moved/"):
            self.send_response(302)
            self.send_header("Location", "/ok/" + self.path[7:])
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        elif self.path.startswith("/unwell/"):
            self.send_error(503)
            return
        elif self.path.startswith("/busy/"):
            self.send_error(429)
            return
        elif self.path.startswith("/slow/"):
            self.server.hold.wait(PATIENCE)
            body = answer_for(self.path[6:16])
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class SocketTests(unittest.TestCase):
    def setUp(self):
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.seen = []
        self.server.hold = threading.Event()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.hold.set)
        self.base = "http://127.0.0.1:%d" % self.server.server_address[1]

    def test_the_days_file_is_fetched_as_it_is(self):
        self.assertEqual(rates.read_answer(rates.fetch_day(self.base + "/ok/%s.json" % TODAY, 5.0), TODAY), GOOD)

    def test_a_redirect_is_not_followed(self):
        with self.assertRaises(rates.Refused):
            rates.fetch_day(self.base + "/moved/%s.json" % TODAY, 5.0)
        self.assertEqual(self.server.seen, ["/moved/%s.json" % TODAY], "the address it was sent on to was never asked")

    def test_an_answer_that_is_too_large_or_missing_is_refused(self):
        with self.assertRaises(rates.Refused) as large:
            rates.fetch_day(self.base + "/large/x", 5.0)
        self.assertEqual(large.exception.reason, "too-large")
        with self.assertRaises(rates.Refused) as missing:
            rates.fetch_day(self.base + "/nothing", 5.0)
        self.assertEqual(missing.exception.reason, "status", "the source answered: it has no such day")

    def test_a_source_that_is_unwell_or_busy_has_said_nothing_about_the_day(self):
        # second reading, 9 October 2026: five 503s in an afternoon gave a past day up until the next start.
        for path in ("/unwell/x", "/busy/x"):
            with self.assertRaises(rates.Refused) as unwell:
                rates.fetch_day(self.base + path, 5.0)
            self.assertEqual(unwell.exception.reason, "no-answer", path)

    def test_a_source_that_says_nothing_is_waited_for_no_longer_than_its_time(self):
        began = time.monotonic()
        with self.assertRaises(rates.Refused) as slow:
            rates.fetch_day(self.base + "/slow/%s.json" % TODAY, 0.3)
        self.assertEqual(slow.exception.reason, "no-answer")
        self.assertLess(time.monotonic() - began, PATIENCE, "it was given up long before the stand-in let go")

    def test_only_https_is_asked_and_plain_http_only_on_a_loopback_address(self):
        for url in ("http://example.com/x", "ftp://127.0.0.1/x", "file:///etc/passwd", "http://localhost.evil.example/x",
                    "gopher://127.0.0.1/", "//127.0.0.1/x", "", "http://[::ffff:8.8.8.8]/x"):
            with self.subTest(url=url):
                with self.assertRaises(rates.Refused) as said:
                    rates.fetch_day(url, 0.2)
                self.assertEqual(said.exception.reason, "bad-address")
        self.assertEqual(self.server.seen, [])


# ---------------------------------------------------------------------------
# The door
# ---------------------------------------------------------------------------

class DoorTests(unittest.TestCase):
    def setUp(self):
        self.stand = _harness.Stand(tune={"rates_urls": URLS, "rates_door_wait": 5.0})
        self.addCleanup(self.stand.stop)
        self.source = Source()
        self.stand.server.rates = rates.Rates(self.stand.settings, self.stand.clock, self.stand.security_log, fetch=self.source)
        self.addCleanup(self.stand.server.rates.idle)

    def test_the_door_answers_the_table_to_anybody_who_is_signed_in_and_to_nobody_else(self):
        stand = self.stand
        self.assertEqual(stand.get(RATES).status, 401)
        for login in ("mika", "misha"):
            answer = stand.get(RATES, cookie=stand.session(login))
            self.assertEqual((answer.status, answer.header("Cache-Control")), (200, "no-store"), login)
            said = answer.json()
            self.assertEqual((sorted(said), said["base"], said["days"][TODAY]), (["asked", "base", "days"], "GBP", GOOD))
        self.assertTrue(stand.server.rates.idle())
        self.assertEqual(self.source.days().count(TODAY), 1, "the second opening found the day in and asked for nothing")

    def test_the_first_opening_of_a_day_gets_that_days_rate_in_its_own_answer(self):
        said = self.stand.get(RATES, cookie=self.stand.session("mika")).json()
        self.assertEqual(sorted(said["days"]), ["2026-10-0%d" % n for n in range(1, 8)],
                         "the door waited the moment it takes, and hands over the whole table, not today alone")

    def test_a_source_that_hangs_holds_no_page(self):
        stand = self.stand
        stand.server.rates = rates.Rates(stand.settings.__class__(**{**stand.settings.__dict__, "rates_door_wait": 0.05}),
                                         stand.clock, stand.security_log, fetch=self.source)
        self.addCleanup(stand.server.rates.idle)
        stand.server.settings = stand.server.rates._settings
        self.source.gate = threading.Event()
        self.addCleanup(self.source.gate.set)
        began = time.monotonic()
        first = stand.get(RATES, cookie=stand.session("mika"))
        second = stand.get(RATES, cookie=stand.session("mika"))
        self.assertLess(time.monotonic() - began, PATIENCE)
        self.assertEqual((first.status, first.json()["days"], second.json()["days"]), (200, {}, {}))
        self.assertTrue(until(lambda: len(self.source.asked) == 1), "one refresh is on its way, and no second one was begun")
        self.source.gate.set()
        self.assertTrue(stand.server.rates.idle())
        self.assertIn(TODAY, stand.get(RATES, cookie=stand.session("mika")).json()["days"])

    def test_the_source_is_not_asked_again_for_half_an_hour_after_an_attempt(self):
        stand = self.stand
        self.source.says = {TODAY: rates.Refused("status")}
        cookie = stand.session("mika")
        stand.get(RATES, cookie=cookie)
        self.assertTrue(stand.server.rates.idle())
        asked = len(self.source.asked)
        stand.clock.tick(minutes=29)
        stand.get(RATES, cookie=cookie)
        self.assertTrue(stand.server.rates.idle())
        self.assertEqual(len(self.source.asked), asked)
        stand.clock.tick(minutes=2)
        stand.get(RATES, cookie=cookie)
        self.assertTrue(stand.server.rates.idle())
        self.assertGreater(len(self.source.asked), asked)


if __name__ == "__main__":
    unittest.main()
