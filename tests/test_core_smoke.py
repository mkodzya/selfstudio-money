"""A first pass over the core: every class once, end to end.

The full suites (test_store.py, test_auth.py, ...) go deeper; this file proves
that config, store, auth and log hold together, and shows how to drive them:
a temporary directory, the dev settings, and a clock the test moves by hand.

    python3 -m unittest tests.test_core_smoke
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import dataclasses
import datetime
import hashlib
import io
import ipaddress
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock

from moneyd import auth, config, log, store

MIB = 1024 * 1024
UTC = datetime.timezone.utc
PASSWORD = "correct horse battery"       # 21 characters, none of the refused words
HAS_SCRYPT = hasattr(hashlib, "scrypt")


class FakeClock:
    """A clock that stands still until the test moves it."""

    def __init__(self, start=datetime.datetime(2026, 10, 7, 12, 0, 0, tzinfo=UTC)):
        self.now = start

    def __call__(self):
        return self.now

    def tick(self, **delta):
        self.now += datetime.timedelta(**delta)


class CoreCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="money-core-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.clock = FakeClock()

    def env(self, **changes):
        env = {
            "MONEY_STAND": "dev",
            "MONEY_PUBLIC_URL": "http://finance.localhost:8123",
            "MONEY_FOUNDERS": "mika:Mika,misha:Misha,vanya:Vanya",
            "MONEY_DATA_DIR": self.dir,
            "MONEY_BIND": "127.0.0.1:8123",
            "MONEY_KDF": "pbkdf2",
        }
        env.update(changes)
        return {name: value for name, value in env.items() if value is not None}

    def prod_env(self, **changes):
        return self.env(**dict({
            "MONEY_STAND": "prod", "MONEY_PUBLIC_URL": "https://finance.selfstudio.se",
            "MONEY_BIND": "0.0.0.0:8080", "MONEY_KDF": None,
            "MONEY_TRUSTED_PROXIES": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
        }, **changes))

    def settings(self, **changes):
        return config.Settings.from_env(self.env(**changes), self.clock)


def ledger(rows, note=""):
    return json.dumps({"tx": [{"id": "s-%d" % i, "d": "2026-09-01", "a": 100, "c": "rev"} for i in range(rows)],
                       "note": note})


def plan(rows, cushion=0):
    lists = ("banks", "inflows", "team", "taxes", "other")
    counts = rows if isinstance(rows, dict) else dict.fromkeys(lists, rows)
    doc = {"v": 2, "cushion": cushion}
    doc.update({name: [{"id": "%s-%d" % (name, i)} for i in range(counts.get(name, 0))] for name in lists})
    return json.dumps(doc)


# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

class ConfigTests(CoreCase):
    def test_a_dev_stand(self):
        s = self.settings()
        self.assertEqual((s.stand, s.public_url, s.public_host), ("dev", "http://finance.localhost:8123",
                                                                  "finance.localhost:8123"))
        self.assertEqual(s.founders, (("mika", "Mika"), ("misha", "Misha"), ("vanya", "Vanya")))
        self.assertEqual((s.first_name("misha"), s.first_name("nobody")), ("Misha", None))
        self.assertEqual((s.cookie_name, s.cookie_secure, s.kdf), ("money-dev", False, "pbkdf2"))
        self.assertEqual((s.bind_host, s.bind_port, s.data_dir), ("127.0.0.1", 8123, self.dir))
        self.assertEqual((s.put_limit("ledger"), s.put_limit("plan"), s.auth_max_bytes), (16 * MIB, 4 * MIB, 4096))
        self.assertEqual(s.put_deadline(1_000_000), 40.0)
        self.assertEqual((s.warn_limit("ledger"), s.warn_limit("plan")), (8 * MIB, 512 * 1024))
        self.assertEqual((s.max_connections, s.signed_out_slots, s.max_connections_per_address), (32, 8, 12))
        self.assertEqual((s.limiter_per_address, s.limiter_per_login, s.hash_slots, s.hash_wait), (10, 30, 2, 5.0))
        self.assertTrue(os.path.isfile(os.path.join(s.web_dir, "moneyd", "config.py")))
        self.assertEqual(s.describe()["founders"], ["mika", "misha", "vanya"])

    def test_a_prod_stand(self):
        s = config.Settings.from_env(self.prod_env(), self.clock, scrypt_available=True)
        self.assertEqual((s.public_url, s.public_host), ("https://finance.selfstudio.se", "finance.selfstudio.se"))
        self.assertEqual((s.cookie_name, s.cookie_secure, s.kdf, s.csp_mode), ("__Host-money", True, "scrypt", "enforce"))
        self.assertEqual([str(net) for net in s.trusted_proxies], ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"])
        self.assertEqual(s.warnings, ())
        self.assertEqual(s.session_ttl, 2592000)

    def test_refusals(self):
        dev, prod = self.env, self.prod_env
        cases = [
            (dev(MONEY_STAND="staging"), True, "MONEY_STAND must be prod, test or dev"),
            (dev(MONEY_PUBLIC_URL=None), True, "MONEY_PUBLIC_URL is not set"),
            (dev(MONEY_PUBLIC_URL="http://money.localhost:8123"), True, "must start with 'finance.'"),
            (dev(MONEY_PUBLIC_URL="http://finance.example.com"), True, r"must end in \.localhost"),
            (dev(MONEY_PUBLIC_URL="https://finance.localhost"), True, "plain http"),
            (dev(MONEY_PUBLIC_URL="http://finance.localhost:8123/money"), True, "and nothing more"),
            (dev(MONEY_BIND="0.0.0.0:8123"), True, "must bind a loopback address"),
            (dev(MONEY_BIND="localhost:8123"), True, "MONEY_BIND must be address:port"),
            (dev(MONEY_FOUNDERS=None), True, "MONEY_FOUNDERS is not set"),
            (dev(MONEY_FOUNDERS="mika"), True, "is not login:FirstName"),
            (dev(MONEY_FOUNDERS="mika:Mika,mika:Other"), True, "twice"),
            (dev(MONEY_DATA_DIR=None), True, "MONEY_DATA_DIR is not set"),
            (dev(MONEY_DATA_DIR="data"), True, "absolute path"),
            (dev(MONEY_DATA_DIR=os.path.join(_safety.CHECKOUT, "data")), True, "laptop tool"),
            (dev(MONEY_TRUSTED_PROXIES="0.0.0.0/0"), True, "too wide"),
            (dev(MONEY_TRUSTED_PROXIES="edge"), True, "not an address or a network"),
            (dev(MONEY_CSP="off"), True, "no way to switch the policy off"),
            (dev(MONEY_KDF="md5"), True, "MONEY_KDF must be scrypt or pbkdf2"),
            (dev(MONEY_KDF="scrypt"), False, "no hashlib.scrypt"),
            (prod(), False, "does not start without it"),
            (prod(MONEY_KDF="pbkdf2"), True, "only MONEY_STAND=dev"),
            (prod(MONEY_PUBLIC_URL="http://finance.selfstudio.se"), True, "must have an https:// public URL"),
            (prod(MONEY_PUBLIC_URL="https://ops.selfstudio.dev"), True, "must start with 'finance.'"),
            (prod(MONEY_STAND="test", MONEY_PUBLIC_URL="https://money.test.selfstudio.se"), True, "'finance.'"),
            (prod(MONEY_CSP="report-only"), True, "refused on prod unless MONEY_CSP_OVERRIDE_UNTIL"),
            (prod(MONEY_CSP="report-only", MONEY_CSP_OVERRIDE_UNTIL="2026-10-06"), True, "the override ended"),
            (prod(MONEY_CSP="report-only", MONEY_CSP_OVERRIDE_UNTIL="soon"), True, "YYYY-MM-DD"),
        ]
        for env, scrypt, sentence in cases:
            with self.subTest(sentence=sentence):
                with self.assertRaisesRegex(config.ConfigError, sentence):
                    config.Settings.from_env(env, self.clock, scrypt_available=scrypt)
        self.assertTrue(issubclass(config.ConfigError, config.BootRefusal))

    def test_report_only_is_dated_on_prod_and_free_on_test(self):
        env = self.prod_env(MONEY_CSP="report-only", MONEY_CSP_OVERRIDE_UNTIL="2026-10-07")
        s = config.Settings.from_env(env, self.clock, scrypt_available=True)      # the day itself has not passed
        self.assertTrue(s.csp_report_only(self.clock()))
        self.assertIn("report-only", " ".join(s.warnings))
        self.clock.tick(days=1)
        self.assertFalse(s.csp_report_only(self.clock()))                          # a running server enforces again
        with self.assertRaises(config.ConfigError):
            config.Settings.from_env(env, self.clock, scrypt_available=True)       # and a restart is refused
        test = self.prod_env(MONEY_STAND="test", MONEY_PUBLIC_URL="https://finance.test.selfstudio.se",
                             MONEY_CSP="report-only")
        self.assertTrue(config.Settings.from_env(test, self.clock, scrypt_available=True).csp_report_only())

    def test_unknown_settings_and_missing_proxies_are_said_out_loud(self):
        s = config.Settings.from_env(self.prod_env(MONEY_TRUSTED_PROXIES=None, MONEY_TURBO="1", MONEY_PORT="5191"),
                                     self.clock, scrypt_available=True)
        self.assertEqual(len(s.warnings), 2)
        self.assertIn("MONEY_TURBO", s.warnings[0])
        self.assertNotIn("MONEY_PORT", s.warnings[0])
        self.assertIn("MONEY_TRUSTED_PROXIES is empty", s.warnings[1])

    def test_time_formats(self):
        moment = datetime.datetime(2026, 10, 7, 14, 3, 22, 123456, tzinfo=UTC)
        self.assertEqual(config.iso(moment), "2026-10-07T14:03:22Z")
        self.assertEqual(config.iso_ms(moment), "2026-10-07T14:03:22.123Z")
        self.assertEqual(config.stamp(moment), "20261007T140322Z")
        self.assertEqual(config.parse_iso("2026-10-07T14:03:22.123Z"), moment.replace(microsecond=123000))
        self.assertEqual(config.parse_stamp("20261007T140322Z"), moment.replace(microsecond=0))
        self.assertEqual(config.as_utc(datetime.datetime(2026, 10, 7, 14, 3, 22)).tzinfo, UTC)
        for bad in ("2026-10-07 14:03:22", "2026-10-07T14:03:22+00:00", "", None):
            with self.assertRaises(ValueError):
                config.parse_iso(bad)


# ---------------------------------------------------------------------------
# store
# ---------------------------------------------------------------------------

class StoreCase(CoreCase):
    def setUp(self):
        super().setUp()
        store.prepare_data_dir(self.dir, "dev")
        self.ledger = store.DocStore(self.dir, "ledger", self.clock)
        self.plan = store.DocStore(self.dir, "plan", self.clock)

    def names(self, doc=None):
        return [snap.name for snap in (doc or self.ledger).snapshots()]


class StoreTests(StoreCase):
    def test_starts_empty_and_keeps_a_save_text_for_text(self):
        empty = self.ledger.read()
        self.assertEqual((empty.rev, empty.updated_at, empty.rows), (0, None, 0))
        self.assertEqual(empty.body, b'{"rev":0,"doc":{},"updatedAt":null}')

        sent = '{"zeta":1, "tx":[{"id":"a","l":"Кафе ☕"}],"new":{"deep":[1,2,{"x":null}]},"n":1e3}'
        saved = self.ledger.save(0, "  " + sent + "\n", "mika")
        self.assertEqual((saved.rev, saved.rows, saved.snapshot, saved.updated_at), (1, 1, None,
                                                                                    "2026-10-07T12:00:00.000Z"))
        back = self.ledger.read()
        self.assertEqual(back.body, b'{"rev":1,"doc":' + sent.encode("utf-8")
                         + b',"updatedAt":"2026-10-07T12:00:00.000Z"}')
        self.assertEqual(json.loads(back.body), {"rev": 1, "doc": json.loads(sent),
                                                 "updatedAt": "2026-10-07T12:00:00.000Z"})
        self.assertEqual((back.rev, back.rows, back.updated_at), (1, 1, "2026-10-07T12:00:00.000Z"))
        self.assertEqual(oct(os.stat(self.ledger.path).st_mode & 0o777), "0o600")

    def test_a_save_from_a_copy_that_is_behind_is_refused_and_writes_nothing(self):
        self.ledger.save(0, ledger(3, "first"), "mika")
        self.ledger.save(1, ledger(3, "second"), "mika")
        before = self.ledger.read().body
        with self.assertRaises(store.Stale) as late:
            self.ledger.save(1, ledger(1, "late"), "misha")
        self.assertEqual((late.exception.rev, late.exception.status, late.exception.code), (2, 409, "money_stale"))
        self.assertEqual(late.exception.extra(), {"rev": 2})
        self.assertEqual(late.exception.message, "The ledger was saved from somewhere else since this copy was read.")
        self.assertEqual(self.ledger.read().body, before)

    def test_stores_a_document_and_nothing_that_only_looks_like_one(self):
        self.ledger.save(0, ledger(2), "mika")
        self.plan.save(0, plan(1), "mika")
        refused = {
            "doc is an object, not a string of JSON": (self.ledger, 1, {"tx": []}),
            "doc is not JSON": (self.ledger, 1, "not json"),
            "doc has no list of rows": (self.ledger, 1, json.dumps({"rows": []})),
            "doc is a list": (self.ledger, 1, json.dumps([1, 2])),
            "doc is null": (self.ledger, 1, "null"),
            "doc is a number": (self.ledger, 1, "7"),
            "doc holds NaN": (self.ledger, 1, '{"tx":[NaN]}'),
            "doc holds Infinity": (self.ledger, 1, '{"tx":[],"a":-Infinity}'),
            "something follows the doc": (self.ledger, 1, '{"tx":[]},"rev":99'),
            "tx named twice, the last is not a list": (self.ledger, 1, '{"tx":[],"tx":5}'),
            "text that is not Unicode": (self.ledger, 1, '{"tx":[],"a":"\ud800"}'),
            "the ledger's door does not take a plan": (self.ledger, 1, plan(3)),
            "the plan's door does not take a ledger": (self.plan, 1, ledger(3)),
            "banks is not a list": (self.plan, 1, json.dumps({"banks": {"Wise": 100}})),
            "base is a word": (self.ledger, "latest", ledger(1)),
            "base is the revision as text": (self.ledger, "1", ledger(1)),
            "base is below zero": (self.ledger, -1, ledger(1)),
            "base is not whole": (self.ledger, 1.5, ledger(1)),
            "base is null": (self.ledger, None, ledger(1)),
            "base is true": (self.ledger, True, ledger(1)),
            "base is not a number at all": (self.ledger, float("nan"), ledger(1)),
        }
        for why, (doc_store, base, doc) in refused.items():
            with self.subTest(why=why):
                with self.assertRaises(store.BadDoc) as bad:
                    doc_store.save(base, doc, "mika")
                self.assertEqual((bad.exception.status, bad.exception.code), (400, "bad_money_doc"))
        self.assertEqual((self.ledger.read().rev, self.plan.read().rev), (1, 1))
        # A bad document is told so even when its base is behind too: the platform's order.
        with self.assertRaises(store.BadDoc):
            self.ledger.save(0, "not json", "mika")
        # JSON has one kind of number: 1.0 is the whole number 1, and a twice-named tx counts as its last value.
        self.assertEqual(self.ledger.save(1.0, '{"tx":5,"tx":[]}', "mika").rev, 2)
        self.assertEqual(store.fields_of({"base": 3, "doc": "x", "more": 1}), (3, "x"))
        self.assertEqual(store.fields_of([1, 2]), (None, None))

    def test_two_documents_two_revisions(self):
        self.ledger.save(0, ledger(3, "filed"), "mika")
        self.plan.save(0, plan(3, 20), "misha")
        ledger_was = self.ledger.read()
        self.assertEqual(self.plan.save(1, plan(3, 21), "misha").rev, 2)
        self.assertEqual(self.ledger.read(), ledger_was)
        self.assertEqual(self.ledger.save(1, ledger(4, "filed again"), "mika").rev, 2)
        self.assertEqual(json.loads(self.plan.read().body)["doc"]["cushion"], 21)
        self.assertEqual(self.plan.read().rows, 15)

    def test_keeps_the_document_as_each_day_found_it_and_only_that_once(self):
        self.assertIsNone(self.ledger.save(0, ledger(4, "one"), "mika").snapshot)      # nothing to copy yet
        self.assertEqual(self.ledger.save(1, ledger(4, "two"), "mika").snapshot, "day-2026-10-07-rev000001.json.gz")
        self.assertIsNone(self.ledger.save(2, ledger(4, "three"), "mika").snapshot)
        self.clock.tick(hours=13)                                                      # 01:00 UTC the next day
        self.assertEqual(self.ledger.save(3, ledger(4, "four"), "mika").snapshot, "day-2026-10-08-rev000003.json.gz")
        self.assertIsNone(self.ledger.save(4, ledger(4, "five"), "mika").snapshot)
        self.assertEqual(self.names(), ["day-2026-10-08-rev000003.json.gz", "day-2026-10-07-rev000001.json.gz"])
        newest = self.ledger.snapshots()[0]
        self.assertEqual((newest.kind, newest.rev, newest.taken), ("day", 3, datetime.datetime(2026, 10, 8, tzinfo=UTC)))
        self.assertEqual(self.ledger.check_snapshot(newest.name), (3, 4))

    def test_keeps_the_document_as_it_stood_before_a_save_that_drops_most_of_it(self):
        self.ledger.save(0, ledger(60, "full"), "mika")
        self.ledger.save(1, ledger(60, "full"), "mika")                    # takes the day's copy
        self.assertIsNone(self.ledger.save(2, ledger(30, "half"), "mika").snapshot)       # half is editing
        emptied = self.ledger.save(3, ledger(14, "emptied"), "mika")       # 14 < 30 / 2
        self.assertEqual(emptied.snapshot, "shrink-20261007T120000Z-rev000003.json.gz")
        self.assertEqual(self.ledger.check_snapshot(emptied.snapshot), (3, 30))
        self.assertIsNone(self.ledger.save(4, ledger(1), "mika").snapshot)                # 14 rows is not "more than 20"
        # The plan's rows are in five lists: thirty of fifty left is editing, ten of thirty is not.
        self.plan.save(0, plan(10), "misha")
        self.plan.save(1, plan(10), "misha")
        self.assertIsNone(self.plan.save(2, plan({"banks": 10, "inflows": 10, "team": 10}), "misha").snapshot)
        self.assertRegex(self.plan.save(3, plan({"banks": 10}), "misha").snapshot, r"^shrink-.*-rev000003\.json\.gz$")

    def test_retention(self):
        kept = store.DocStore(self.dir, "ledger", self.clock, keep_day=3, keep_shrink=2)
        kept.save(0, ledger(60), "mika")
        rev = 1
        for _day in range(5):
            self.clock.tick(days=1)
            for rows in (60, 2, 60, 2, 60):          # a day copy, then two before-shrink copies
                kept.save(rev, ledger(rows), "mika")
                rev += 1
                self.clock.tick(seconds=1)
        snaps = kept.snapshots()
        self.assertEqual(sorted(snap.name[:14] for snap in snaps if snap.kind == "day"),
                         ["day-2026-10-10", "day-2026-10-11", "day-2026-10-12"])
        self.assertEqual(len([snap for snap in snaps if snap.kind == "shrink"]), 2)
        self.assertTrue(all(snap.taken.date() == datetime.date(2026, 10, 12) for snap in snaps if snap.kind == "shrink"))

    def test_another_process_and_a_restart(self):
        self.ledger.save(0, ledger(3, "by the page"), "mika")
        other = store.DocStore(self.dir, "ledger", self.clock)             # what ctl is: a second process
        self.assertEqual(other.read().rev, 1)                              # a restart reads the revision from disk
        other.save(1, ledger(5, "by ctl"), "ctl")
        self.assertEqual(self.ledger.read().rev, 2)                        # and the running server sees ctl's save
        with self.assertRaises(store.Stale):
            self.ledger.save(1, ledger(1), "mika")
        self.assertEqual(self.ledger.save(2, ledger(6), "mika").rev, 3)

    def test_a_temporary_file_left_by_a_crash(self):
        self.ledger.save(0, ledger(3), "mika")
        left = [os.path.join(self.ledger.directory, "current.json.tmp-4242-deadbeef"),
                os.path.join(self.ledger.directory, "snapshots", "day-2026-10-07-rev000001.json.gz.tmp-4242-deadbeef")]
        for path in left:
            with open(path, "wb") as handle:
                handle.write(b'{"rev":9,"doc":{"tx":[')
        self.assertEqual(self.ledger.read().rev, 1)
        self.assertEqual(self.ledger.status()["temporaryFiles"], 2)
        self.assertEqual(self.names(), [])                                 # half a snapshot is not a snapshot
        self.ledger.save(1, ledger(3), "mika")
        self.assertFalse(any(os.path.exists(path) for path in left))

    def test_a_damaged_file_is_never_read_as_revision_zero(self):
        self.ledger.save(0, ledger(30, "real"), "mika")
        self.ledger.save(1, ledger(30, "real"), "mika")                    # leaves a day copy to restore from
        good = self.ledger.read().body
        damage = {
            "empty": b"",
            "cut short": good[:len(good) // 2],
            "the laptop's bare document": b'{"v":1,"tx":[],"rev":41}',
            "a list": b"[]",
            "revision zero": b'{"rev":0,"doc":{"tx":[]},"updatedAt":"2026-10-07T12:00:00.000Z"}',
            "no updatedAt": b'{"rev":3,"doc":{"tx":[]}}',
            "another kind of document": b'{"rev":3,"doc":{"banks":[]},"updatedAt":"2026-10-07T12:00:00.000Z"}',
            "something after it": good + b',{"rev":9}',
            "reformatted by hand": json.dumps(json.loads(good), indent=1).encode("utf-8"),
            "not text": b"\xff\xfe\x00\x00",
        }
        for why, content in damage.items():
            with self.subTest(why=why):
                with open(self.ledger.path, "wb") as handle:
                    handle.write(content)
                for attempt in (self.ledger.read, self.ledger.revision, lambda: self.ledger.save(2, ledger(1), "mika"),
                                lambda: self.ledger.save(0, ledger(1), "mika")):
                    with self.assertRaises(store.Damaged) as damaged:
                        attempt()
                    self.assertEqual((damaged.exception.status, damaged.exception.code), (503, "storage_damaged"))
                with open(self.ledger.path, "rb") as handle:
                    self.assertEqual(handle.read(), content)               # nothing was written over it
                self.assertEqual(self.ledger.status()["state"], "damaged")
        os.unlink(self.ledger.path)                                        # saved before, and now gone: lost, not new
        with self.assertRaises(store.Damaged):
            self.ledger.read()
        report = store.doctor(self.dir, "dev", self.clock)
        self.assertIn("ctl restore ledger day-2026-10-07-rev000001.json.gz", " ".join(report["problems"]))
        self.assertEqual(self.plan.read().rev, 0)                          # the other document is untouched by it

    def test_restore_is_a_new_revision_and_takes_a_damaged_document(self):
        self.ledger.save(0, ledger(3, "monday"), "mika")
        self.ledger.save(1, ledger(4, "tuesday"), "mika")                  # day copy of rev 1
        self.ledger.save(2, ledger(5, "wednesday"), "mika")
        log_ = log.SecurityLog(self.dir, self.clock)
        doc_store = store.DocStore(self.dir, "ledger", self.clock, security_log=log_)
        done = doc_store.restore("day-2026-10-07-rev000001.json.gz", "ctl")
        self.assertEqual((done.rev, done.from_rev, done.replaced_rev), (4, 1, 3))
        self.assertEqual(done.kept, "restore-20261007T120000Z-rev000003.json.gz")
        self.assertEqual(json.loads(self.ledger.read().body)["doc"]["note"], "monday")
        with self.assertRaises(store.Stale):                               # a page still open at 3 cannot save over it
            self.ledger.save(3, ledger(9), "misha")
        self.assertEqual(log_.tail(1)[0]["event"], "restore")
        self.assertEqual({key: log_.tail(1)[0][key] for key in ("doc", "rev", "fromRev", "by")},
                         {"doc": "ledger", "rev": 4, "fromRev": 1, "by": "ctl"})
        for name in ("no-such.json.gz", "../../auth/users.json", "day-2026-01-01-rev000001.json.gz"):
            with self.assertRaises(store.NoSuchSnapshot):
                doc_store.restore(name, "ctl")
        # The current file is lost with one save made since the last copy: the restore still lands above it.
        self.ledger.save(4, ledger(7, "thursday"), "mika")
        os.unlink(self.ledger.path)
        again = doc_store.restore(done.kept, "ctl")
        self.assertEqual((again.rev, again.from_rev, again.replaced_rev), (6, 3, None))
        self.assertEqual(json.loads(self.ledger.read().body)["doc"]["note"], "wednesday")
        with open(self.ledger.path, "wb") as handle:                       # and a cut file is kept aside, not lost
            handle.write(b'{"rev":6,"doc":{"tx":[')
        third = doc_store.restore(done.kept, "ctl")
        self.assertEqual((third.rev, third.kept), (7, "current.json.damaged-20261007T120000Z"))
        with open(os.path.join(self.dir, "ledger", "snapshots", "day-2026-10-09-rev000009.json.gz"), "wb") as handle:
            handle.write(b"not gzip")
        with self.assertRaises(store.BadSnapshot):
            doc_store.restore("day-2026-10-09-rev000009.json.gz", "ctl")
        self.assertEqual(self.ledger.read().rev, 7)

    def test_purge_is_for_made_up_data_only(self):
        self.ledger.save(0, ledger(60), "mika")
        for _day in range(4):
            self.clock.tick(days=1)
            self.ledger.save(self.ledger.revision(), ledger(60), "mika")
        self.assertEqual(len(self.names()), 4)
        with self.assertRaises(store.Refused):
            self.ledger.purge(0, "prod")
        with self.assertRaises(store.Refused):
            self.ledger.purge(0, "test")                                   # the directory itself says "dev"
        self.assertEqual(len(self.names()), 4)
        self.assertEqual(self.ledger.purge(2, "dev"), 2)
        self.assertEqual(self.names(), ["day-2026-10-11-rev000004.json.gz", "day-2026-10-10-rev000003.json.gz"])
        self.assertEqual(self.ledger.purge(0, "dev"), 2)
        self.assertEqual((self.names(), self.ledger.read().rev), ([], 5))

    def test_no_room_no_save(self):
        tight = store.DocStore(self.dir, "ledger", self.clock, free_bytes=lambda path: 64 * MIB)
        with self.assertRaises(store.NoSpace) as full:
            tight.save(0, ledger(3), "mika")
        self.assertEqual((full.exception.status, full.exception.code), (507, "storage_failed"))
        self.assertIsInstance(full.exception, store.StorageFailed)
        self.assertEqual(tight.read().rev, 0)
        roomy = store.DocStore(self.dir, "ledger", self.clock, free_bytes=lambda path: 64 * MIB + 3 * 4096 + 1)
        roomy.check_space(4096)
        with self.assertRaises(store.NoSpace):
            roomy.check_space(4097)
        small = store.DocStore(self.dir, "plan", self.clock, max_bytes=200)
        with self.assertRaises(store.TooLarge) as large:
            small.save(0, plan(10), "mika")
        self.assertEqual((large.exception.status, large.exception.code), (413, "body_too_large"))

    def test_deep_json_is_a_refusal_and_never_a_crash(self):
        deep = lambda levels: '{"tx":[],"x":' + "[" * (levels - 1) + "]" * (levels - 1) + "}"
        self.assertEqual(self.ledger.save(0, deep(store.MAX_DEPTH), "mika").rev, 1)
        with self.assertRaises(store.BadDoc):
            self.ledger.save(1, deep(store.MAX_DEPTH + 1), "mika")
        with self.assertRaises(store.BadDoc):
            self.ledger.save(1, '{"tx":' + "[" * 200000, "mika")
        for body in (b"[" * 4096, b'{"a":' * 2000 + b"1" + b"}" * 2000, b'{"a":NaN}', b"\xff", b"", b'{"a":1}{', 7):
            with self.subTest(body=str(body)[:20]):
                with self.assertRaises(ValueError):
                    store.parse_json(body, 16)
        self.assertEqual(store.parse_json(b'{"login":"mika","password":"[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[["}', 2),
                         {"login": "mika", "password": "[" * 32})
        self.assertEqual(store.parse_json('{"a":[[[1]]]}', 4), {"a": [[[1]]]})
        with self.assertRaises(ValueError):
            store.parse_json('{"a":[[[1]]]}', 3)
        self.assertTrue(store.json_depth_ok(b'["]","[",{"k\\"]":"\\\\"}]', 2))
        self.assertTrue(store.json_depth_ok('[[["\u2603"]]]' * 30, 3))                     # text is taken as well as bytes
        self.assertFalse(store.json_depth_ok('[[["\u2603"]]]' * 30, 2))
        self.assertFalse(store.json_depth_ok(b'["]",' * 50 + b"1" + b"]" * 50, 40))

    def test_the_data_directory_belongs_to_one_stand(self):
        with open(os.path.join(self.dir, "STAND")) as handle:
            self.assertEqual(handle.read(), "dev\n")
        store.prepare_data_dir(self.dir, "dev")                            # the second start changes nothing
        with self.assertRaisesRegex(store.DataDirError, "belongs to the 'dev' stand"):
            store.prepare_data_dir(self.dir, "prod")
        with open(os.path.join(self.dir, "STAND"), "wb") as handle:
            handle.write(b"prod; rm -rf /\n\x1b[31m")
        self.assertEqual(store.read_stand_marker(self.dir), "prod??rm??rf????")           # safe to print, equal to no stand
        with self.assertRaisesRegex(store.DataDirError, "names no stand"):
            store.prepare_data_dir(self.dir, "prod")
        os.unlink(os.path.join(self.dir, "STAND"))
        self.assertIsNone(store.read_stand_marker(self.dir))
        with self.assertRaisesRegex(store.DataDirError, "no STAND marker"):
            store.prepare_data_dir(self.dir, "dev")
        for name in ("db.json", "cash.json", "backups"):
            fresh = tempfile.mkdtemp(prefix="money-core-")
            self.addCleanup(shutil.rmtree, fresh, True)
            os.mkdir(os.path.join(fresh, name)) if name == "backups" else open(os.path.join(fresh, name), "w").close()
            for stand in ("prod", "test", "dev"):
                with self.assertRaisesRegex(store.DataDirError, "laptop tool"):
                    store.prepare_data_dir(fresh, stand)
            self.assertEqual(os.listdir(fresh), [name])
        with self.assertRaisesRegex(store.DataDirError, "does not exist"):
            store.prepare_data_dir(os.path.join(self.dir, "nowhere"), "dev")
        self.assertTrue(issubclass(store.DataDirError, config.BootRefusal))

    def test_verify_counts_and_never_shows(self):
        secret = "Hartwell Insurance 4417"
        self.ledger.save(0, ledger(30, secret), "mika")
        self.ledger.save(1, ledger(31, secret), "mika")
        self.plan.save(0, plan(2), "misha")
        before = sorted(os.listdir(os.path.join(self.dir, "plan")))
        report = store.verify(self.dir)
        self.assertEqual(report["problems"], [])
        self.assertEqual(report["stand"], "dev")
        led = report["documents"]["ledger"]
        self.assertEqual((led["state"], led["rev"], led["rows"], led["snapshots"]["count"], led["snapshotsChecked"],
                          led["snapshotsBad"]), ("ok", 2, 31, 1, 1, []))
        self.assertEqual(report["documents"]["plan"]["rows"], 10)
        self.assertNotIn("Hartwell", json.dumps(report))
        self.assertNotIn("Hartwell", json.dumps(store.doctor(self.dir, "dev", self.clock)))
        self.assertEqual(sorted(os.listdir(os.path.join(self.dir, "plan"))), before)       # it left nothing behind
        with open(os.path.join(self.dir, "ledger", "snapshots", self.names()[0]), "r+b") as handle:
            handle.truncate(20)
        self.assertEqual(store.verify(self.dir)["documents"]["ledger"]["snapshotsBad"], self.names())

    def test_open_stores(self):
        stores = store.open_stores(self.settings(), self.clock)
        self.assertEqual(sorted(stores), ["ledger", "plan"])
        self.assertEqual((stores["ledger"].max_bytes, stores["plan"].max_bytes), (16 * MIB, 4 * MIB))
        self.assertEqual(stores["plan"].save(0, plan(1), "vanya").rev, 1)


# ---------------------------------------------------------------------------
# auth: passwords
# ---------------------------------------------------------------------------

def fake_scrypt(calls):
    """Stands in for hashlib.scrypt where there is none: same signature, a cheap digest."""
    def scrypt(secret, *, salt, n, r, p, dklen=64, maxmem=0):
        calls.append((n, r, p, dklen, maxmem))
        return hashlib.pbkdf2_hmac("sha256", secret, salt + bytes([n.bit_length(), r, p]), 20, dklen)
    return scrypt


class PasswordTests(unittest.TestCase):
    def test_the_dev_hash(self):
        stored = auth.hash_password(PASSWORD, "pbkdf2")
        self.assertRegex(stored, r"^pbkdf2\$20000\$[0-9a-f]{32}\$[0-9a-f]{64}$")
        self.assertNotEqual(stored, auth.hash_password(PASSWORD, "pbkdf2"))                # a salt each
        check = lambda password, **how: auth.verify_password(password, stored, **how)
        self.assertEqual(check(PASSWORD, kdf="pbkdf2", allow_pbkdf2=True), auth.Verdict(True, None))
        self.assertFalse(check("correct horse batterx", kdf="pbkdf2", allow_pbkdf2=True).ok)
        self.assertFalse(check(PASSWORD, kdf="scrypt", allow_pbkdf2=False).ok)             # as good as no hash on a stand
        self.assertFalse(check(PASSWORD).ok)
        # NFKC: the same password typed in full-width letters is the same password.
        self.assertTrue(check("ｃｏｒｒｅｃｔ horse battery", kdf="pbkdf2", allow_pbkdf2=True).ok)
        # Other parameters still verify, and come back hashed anew.
        salt = bytes(range(16))
        old = "pbkdf2$5000$%s$%s" % (salt.hex(), hashlib.pbkdf2_hmac(
            "sha256", PASSWORD.encode("utf-8"), salt, 5000, 32).hex())
        verdict = auth.verify_password(PASSWORD, old, kdf="pbkdf2", allow_pbkdf2=True)
        self.assertTrue(verdict.ok)
        self.assertRegex(verdict.new_hash, r"^pbkdf2\$20000\$")
        self.assertTrue(auth.verify_password(PASSWORD, verdict.new_hash, kdf="pbkdf2", allow_pbkdf2=True).ok)
        for broken in (None, "", "x", "pbkdf2$20000$zz$zz", "pbkdf2$1$00$00", "scrypt$15$8$3$zz$zz",
                       "scrypt$99$8$3$" + "00" * 16 + "$" + "00" * 32, "scrypt$20$32$3$" + "00" * 16 + "$" + "00" * 32,
                       "plain$" + PASSWORD, 7):
            self.assertEqual(auth.verify_password(PASSWORD, broken, kdf="pbkdf2", allow_pbkdf2=True),
                             auth.Verdict(False, None))
        self.assertFalse(auth.verify_password(None, stored, kdf="pbkdf2", allow_pbkdf2=True).ok)
        with self.assertRaises(ValueError):
            auth.hash_password(PASSWORD, "md5")

    def test_the_scrypt_path_with_a_stand_in(self):
        calls = []
        with mock.patch.object(hashlib, "scrypt", fake_scrypt(calls), create=True):
            stored = auth.hash_password(PASSWORD)
            self.assertRegex(stored, r"^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$")
            self.assertEqual(calls[-1], (2 ** 15, 8, 3, 32, 64 * MIB))                    # maxmem is passed
            self.assertEqual(auth.verify_password(PASSWORD, stored), auth.Verdict(True, None))
            self.assertFalse(auth.verify_password("correct horse batterx", stored).ok)
            # A hash with yesterday's parameters verifies with them, and is replaced with today's.
            salt = bytes(16)
            secret = auth.normalize_password(PASSWORD)
            old = "scrypt$14$8$1$%s$%s" % (salt.hex(), fake_scrypt([])(secret, salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex())
            verdict = auth.verify_password(PASSWORD, old)
            self.assertTrue(verdict.ok)
            self.assertIn((2 ** 14, 8, 1, 32, 64 * MIB), calls)
            self.assertRegex(verdict.new_hash, r"^scrypt\$15\$8\$3\$")
            self.assertEqual(auth.verify_password("wrong", old), auth.Verdict(False, None))
            # On the dev stand a pbkdf2 hash is taken, and traded up once scrypt is the stand's scheme;
            # a scrypt hash is never traded down.
            weak = auth.hash_password(PASSWORD, "pbkdf2")
            self.assertRegex(auth.verify_password(PASSWORD, weak, kdf="scrypt", allow_pbkdf2=True).new_hash, r"^scrypt\$")
            self.assertEqual(auth.verify_password(PASSWORD, stored, kdf="pbkdf2", allow_pbkdf2=True),
                             auth.Verdict(True, None))

    @unittest.skipUnless(HAS_SCRYPT, "this Python has no hashlib.scrypt")
    def test_rfc_7914_vectors(self):
        vectors = [
            (b"", b"", 4, 1, 1,
             "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442"
             "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906"),
            (b"password", b"NaCl", 10, 8, 16,
             "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162"
             "2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640"),
            (b"pleaseletmein", b"SodiumChloride", 14, 8, 1,
             "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2"
             "d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887"),
        ]
        for secret, salt, log_n, r, p, expected in vectors:
            with self.subTest(n=2 ** log_n, r=r, p=p):
                self.assertEqual(auth._scrypt(secret, salt, log_n, r, p, 64).hex(), expected)

    @unittest.skipUnless(HAS_SCRYPT, "this Python has no hashlib.scrypt")
    def test_the_real_scrypt_hash(self):
        stored = auth.hash_password(PASSWORD)
        self.assertRegex(stored, r"^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$")
        self.assertEqual(auth.verify_password(PASSWORD, stored), auth.Verdict(True, None))
        self.assertEqual(auth.verify_password("correct horse batterx", stored), auth.Verdict(False, None))
        salt = bytes(16)
        old = "scrypt$14$8$1$%s$%s" % (salt.hex(), hashlib.scrypt(
            PASSWORD.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex())
        self.assertRegex(auth.verify_password(PASSWORD, old).new_hash, r"^scrypt\$15\$8\$3\$")

    def test_password_rules(self):
        auth.check_password(PASSWORD, "mika", "Mika")
        auth.check_password("twelve chars", "mika", "Mika")
        auth.check_password("x" * 256, "mika", "Mika")
        auth.check_password("длинная фраза про чай", "mika", "Mika")
        weak = {
            "eleven char": "too_short", "x" * 257: "too_long", "MIKA rides a bicycle": "contains_login",
            "who is MICHAEL really": "contains_name", "my Password is long": "common",
            "мой Пароль длинный": "common", "qwerty-and-then-some": "common",
            "the year 1234567 was": "common", "SelfStudio forever!": "common", "show me the money ok": "common",
            "high finance is dull": "common", 12345678901234: "unusable", "lone \ud800 surrogate here": "unusable",
        }
        for password, reason in weak.items():
            with self.subTest(reason=reason, password=str(password)[:24]):
                with self.assertRaises(auth.WeakPassword) as refusal:
                    auth.check_password(password, "mika", "Michael")
                self.assertEqual((refusal.exception.reason, refusal.exception.status, refusal.exception.code,
                                  refusal.exception.extra()), (reason, 400, "weak_password", {"min": 12}))


# ---------------------------------------------------------------------------
# auth: accounts, links, sessions, the limiter
# ---------------------------------------------------------------------------

class AuthCase(CoreCase):
    def setUp(self):
        super().setUp()
        self.settings_ = self.settings()
        store.prepare_data_dir(self.dir, "dev")
        self.log = log.SecurityLog(self.dir, self.clock)
        self.auth = auth.Auth(self.settings_, self.clock, self.log)
        self.auth.boot()

    def give_password(self, login="mika", password=PASSWORD, addr="203.0.113.7"):
        link, _expires = self.auth.issue_invite(login)
        return self.auth.set_password(link.split("#t=", 1)[1], password, addr, "Firefox")

    def events(self):
        return [entry["event"] for entry in reversed(self.log.tail(1000))]

    def users_file(self):
        with open(self.auth.users.path, "rb") as handle:
            return handle.read()

    def sessions_file(self):
        with open(self.auth.sessions.path, "rb") as handle:
            return handle.read()


class AuthTests(AuthCase):
    def test_founders_exist_without_a_password(self):
        users = self.auth.users.list()
        self.assertEqual([(u.login, u.first_name, u.listed, u.has_password, u.disabled, u.gen, u.totp) for u in users],
                         [("mika", "Mika", True, False, False, 0, None), ("misha", "Misha", True, False, False, 0, None),
                          ("vanya", "Vanya", True, False, False, 0, None)])
        self.assertIsNone(self.auth.users.get("nobody"))
        self.assertEqual(oct(os.stat(self.auth.users.path).st_mode & 0o777), "0o600")
        with self.assertRaises(auth.InvalidCredentials):
            self.auth.sign_in("mika", PASSWORD, "203.0.113.7")
        self.assertEqual(self.auth.status()["users"], {
            "state": "ok", "problem": None, "founders": 3, "withPassword": 0, "disabled": 0, "pendingLinks": 0,
            "notListed": 0})

    def test_a_one_time_link_sets_a_password_and_signs_in(self):
        link, expires = self.auth.issue_invite("mika")
        self.assertTrue(link.startswith("http://finance.localhost:8123/set-password#t="))
        self.assertEqual(expires, self.clock() + datetime.timedelta(hours=48))
        token = link.split("#t=", 1)[1]
        self.assertNotIn(token.encode(), self.users_file())                                # only its sha256 is kept
        self.assertIn(hashlib.sha256(token.encode()).hexdigest().encode(), self.users_file())
        self.assertEqual(self.auth.invites.peek(token).login, "mika")

        new = self.auth.set_password(token, PASSWORD, "203.0.113.7", "Firefox")
        self.assertEqual((new.identity.login, new.identity.first_name, new.identity.may_open_page), ("mika", "Mika", True))
        self.assertEqual(self.auth.session(new.token).session.id, new.identity.session.id)
        self.assertNotIn(PASSWORD.encode(), self.users_file())
        self.assertIsNone(self.auth.invites.peek(token))
        user, stored = self.auth.users.credentials("mika")                                 # read together, for a sign-in
        self.assertEqual((user.login, user.gen, user.has_password, stored), ("mika", 1, True,
                                                                             self.auth.users.password_hash("mika")))
        self.assertRegex(stored, r"^pbkdf2\$20000\$")
        self.assertEqual(self.auth.users.credentials("nobody"), (None, None))
        with self.assertRaises(auth.InvalidLink) as spent:                                 # single use
            self.auth.set_password(token, "another long password", "203.0.113.7")
        self.assertEqual((spent.exception.status, spent.exception.code), (404, "invalid_link"))
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "203.0.113.7").identity.first_name, "Mika")
        self.assertEqual(self.events(), ["link-issued", "link-used", "password-set", "link-refused", "sign-in"])
        self.assertEqual(self.log.tail(200)[-1]["by"], "ctl")

    def test_links_expire_are_retired_by_a_newer_one_and_close_sessions(self):
        first, _ = self.auth.issue_invite("mika")
        second, _ = self.auth.issue_invite("mika")                                         # retires the first
        with self.assertRaises(auth.InvalidLink):
            self.auth.set_password(first.split("#t=")[1], PASSWORD, "203.0.113.7")
        self.clock.tick(hours=48, seconds=1)
        with self.assertRaises(auth.InvalidLink):                                          # 48 hours, no more
            self.auth.set_password(second.split("#t=")[1], PASSWORD, "203.0.113.7")
        old = self.give_password()
        other_device = self.auth.sign_in("mika", PASSWORD, "198.51.100.1")
        misha = self.give_password("misha", "a different long one")
        renewed = self.give_password(password="brand new long phrase")
        self.assertIsNone(self.auth.session(old.token))                                    # every session of the login
        self.assertIsNone(self.auth.session(other_device.token))
        self.assertIsNotNone(self.auth.session(renewed.token))
        self.assertIsNotNone(self.auth.session(misha.token))                               # and nobody else's
        with self.assertRaises(auth.InvalidCredentials):
            self.auth.sign_in("mika", PASSWORD, "198.51.100.1")
        self.assertEqual(self.auth.users.get("mika").gen, 2)
        for junk in (None, "", "short", "x" * 500, 7, {"t": 1}):
            with self.assertRaises(auth.InvalidLink):
                self.auth.set_password(junk, PASSWORD, "198.51.100.2")
        with self.assertRaises(auth.UnknownLogin):
            self.auth.issue_invite("nobody")

    def test_a_weak_password_keeps_the_link(self):
        link, _ = self.auth.issue_invite("vanya")
        token = link.split("#t=")[1]
        for _ in range(15):                                                                # not counted as failures
            with self.assertRaises(auth.WeakPassword):
                self.auth.set_password(token, "vanya vanya vanya", "203.0.113.7")
        self.assertEqual(self.auth.set_password(token, PASSWORD, "203.0.113.7").identity.login, "vanya")

    def test_every_failure_answers_alike_and_costs_a_hash(self):
        self.give_password("mika")
        self.give_password("misha", "a different long one")
        self.auth.set_disabled("misha", True)
        real = auth.verify_password
        with mock.patch.object(auth, "verify_password", side_effect=real) as verify:
            attempts = [("mika", "wrong password here"), ("nobody", PASSWORD), ("misha", "a different long one"),
                        ("vanya", PASSWORD), ("x" * 64, PASSWORD), ("mika", "x" * 3000)]
            for number, (login, password) in enumerate(attempts):
                with self.assertRaises(auth.InvalidCredentials) as refusal:
                    self.auth.sign_in(login, password, "198.51.100.%d" % number)
                self.assertEqual((refusal.exception.status, refusal.exception.code, refusal.exception.message),
                                 (401, "invalid_credentials", "That login and password do not match."))
            self.assertEqual(verify.call_count, len(attempts))
        for login, password in ((None, PASSWORD), ("", PASSWORD), ("mika", ""), ("mika", None), (7, PASSWORD),
                                ("x" * 65, PASSWORD), ("mika", ["a"])):
            with self.assertRaises(auth.MissingCredentials) as missing:
                self.auth.sign_in(login, password, "198.51.100.9")
            self.assertEqual((missing.exception.status, missing.exception.code), (400, "missing_credentials"))
        # A failed attempt is in the security log without the tried password, and without a login nobody has.
        written = json.dumps(self.log.tail(200))
        self.assertNotIn("nobody", written)
        self.assertNotIn("wrong password here", written)
        self.assertNotIn("xxxx", written)
        failed = [entry for entry in self.log.tail(200) if entry["event"] == "sign-in-failed"]
        self.assertEqual(sorted(str(entry["login"]) for entry in failed), ["None", "None", "mika", "mika", "misha", "vanya"])

    def test_sessions_are_kept_as_sha256_and_follow_the_three_clocks(self):
        new = self.give_password()
        on_disk = self.sessions_file()
        self.assertNotIn(new.token.encode(), on_disk)
        self.assertIn(hashlib.sha256(new.token.encode()).hexdigest().encode(), on_disk)
        self.assertEqual(oct(os.stat(self.auth.sessions.path).st_mode & 0o777), "0o600")
        self.assertEqual(new.identity.session.expires - new.identity.session.created, datetime.timedelta(days=30))
        for junk in (None, "", "x", new.token + "x", "../../etc/passwd", 7):
            self.assertIsNone(self.auth.session(junk))
        # Used every few days it lives 30 days, and in its last 24 hours it no longer opens the page.
        for _ in range(4):
            self.clock.tick(days=7)
            self.assertTrue(self.auth.session(new.token).may_open_page)
        self.clock.tick(days=1, seconds=-1)                                                # 29 days less a second
        self.assertTrue(self.auth.session(new.token).may_open_page)
        self.clock.tick(seconds=1)
        last_day = self.auth.session(new.token)
        self.assertFalse(last_day.may_open_page)                                           # still a session: it saves
        self.assertTrue(self.auth.sessions.in_last_day(last_day.session))
        self.clock.tick(days=1, seconds=-1)
        self.assertIsNotNone(self.auth.session(new.token))
        self.clock.tick(seconds=1)
        self.assertIsNone(self.auth.session(new.token))                                    # 30 days to the second
        # Left alone, a session ends after 14 days.
        idle = self.auth.sign_in("mika", PASSWORD, "203.0.113.7")
        self.clock.tick(days=14)
        self.assertIsNotNone(self.auth.session(idle.token))
        self.clock.tick(days=14, seconds=1)
        self.assertIsNone(self.auth.session(idle.token))

    def test_signing_in_replaces_the_presented_session_and_ten_is_the_most(self):
        first = self.give_password()
        second = self.auth.sign_in("mika", PASSWORD, "203.0.113.7", "Safari", presented=first.token)
        self.assertIsNone(self.auth.session(first.token))
        self.assertNotEqual(first.token, second.token)
        tokens = [second.token]
        for number in range(11):
            self.clock.tick(minutes=6)
            self.assertIsNotNone(self.auth.session(tokens[-1]))                            # the newest stays in use
            tokens.append(self.auth.sign_in("mika", PASSWORD, "203.0.113.%d" % (10 + number)).token)
        alive = [token for token in tokens if self.auth.session(token) is not None]
        self.assertEqual(len(alive), 10)
        self.assertEqual(alive, tokens[-10:])                                              # the ones used longest ago went
        self.assertTrue(self.auth.sign_out(tokens[-1], "203.0.113.20"))
        self.assertFalse(self.auth.sign_out(tokens[-1]))                                   # twice is still signed out
        self.assertIsNone(self.auth.session(tokens[-1]))
        listed = self.auth.sessions.list()
        self.assertEqual(len(listed), 9)
        self.assertNotIn(tokens[-2], json.dumps([session._asdict() for session in listed], default=str))

    def test_seen_is_written_at_most_once_in_five_minutes(self):
        new = self.give_password()
        with mock.patch.object(self.auth.sessions._file, "write", wraps=self.auth.sessions._file.write) as write:
            for _ in range(50):
                self.clock.tick(seconds=5)
                self.assertIsNotNone(self.auth.session(new.token))
            self.assertEqual(write.call_count, 0)                                          # 4 min 10 s of requests
            self.clock.tick(seconds=50)
            self.assertEqual(self.auth.session(new.token).session.seen, self.clock())
            for _ in range(50):
                self.clock.tick(seconds=5)
                self.auth.session(new.token)
            self.assertEqual(write.call_count, 1)

    def test_what_ctl_does_reaches_a_running_server(self):
        mika = self.give_password("mika")
        misha = self.give_password("misha", "a different long one")
        ctl = auth.Auth(self.settings_, self.clock, self.log)                              # the other process
        self.assertEqual(sorted(session.login for session in ctl.sessions.list()), ["mika", "misha"])
        self.assertEqual(ctl.close_sessions("mika"), 1)
        self.assertIsNone(self.auth.session(mika.token))
        self.assertIsNotNone(self.auth.session(misha.token))
        self.assertTrue(ctl.set_disabled("misha", True).disabled)
        self.assertIsNone(self.auth.session(misha.token))
        with self.assertRaises(auth.InvalidCredentials):
            self.auth.sign_in("misha", "a different long one", "203.0.113.7")
        with self.assertRaises(auth.LoginDisabled):
            ctl.issue_invite("misha")
        self.assertFalse(ctl.set_disabled("misha", False).disabled)
        self.assertEqual(self.auth.sign_in("misha", "a different long one", "203.0.113.7").identity.login, "misha")
        # A short session for a self-check: it opens the page for as long as it lives.
        token, session = ctl.internal_session("vanya", ttl=300, purpose="selfcheck")
        self.assertEqual((session.kind, session.expires - session.created), ("internal", datetime.timedelta(minutes=5)))
        self.assertTrue(self.auth.session(token).may_open_page)
        self.clock.tick(minutes=5)
        self.assertIsNone(self.auth.session(token))
        self.assertEqual(ctl.close_sessions(), 1)
        self.assertEqual([event for event in self.events() if event.startswith(("session", "user"))],
                         ["sessions-closed", "user-disabled", "user-enabled", "session-created", "sessions-closed"])
        with self.assertRaises(auth.UnknownLogin):
            ctl.internal_session("nobody")
        with self.assertRaises(ValueError):
            ctl.internal_session("vanya", ttl=86400)                                       # "short" is enforced here

    def test_a_founder_dropped_from_the_list_is_out(self):
        new = self.give_password("vanya")
        fewer = auth.Auth(self.settings(MONEY_FOUNDERS="mika:Mika,misha:Misha"), self.clock, self.log)
        fewer.boot()
        self.assertIsNone(fewer.session(new.token))
        with self.assertRaises(auth.InvalidCredentials):
            fewer.sign_in("vanya", PASSWORD, "203.0.113.7")
        self.assertEqual([(user.login, user.listed) for user in fewer.users.list()],
                         [("mika", True), ("misha", True), ("vanya", False)])

    def test_a_damaged_sessions_file_is_moved_aside_and_everybody_signs_in_again(self):
        new = self.give_password()
        for garbage in (b"", b'{"v":1,"sessions":{"abc":', b'{"v":1,"sessions":{"zz":{}}}', b"[]"):
            with self.subTest(garbage=garbage):
                with open(self.auth.sessions.path, "wb") as handle:
                    handle.write(garbage)
                self.assertIsNone(self.auth.session(new.token))
                self.assertEqual(json.loads(self.sessions_file()), {"v": 1, "sessions": {}})
                new = self.auth.sign_in("mika", PASSWORD, "203.0.113.7")
                self.assertIsNotNone(self.auth.session(new.token))
                self.clock.tick(seconds=1)
        aside = sorted(name for name in os.listdir(os.path.join(self.dir, "auth")) if ".damaged-" in name)
        self.assertEqual(len(aside), 4)
        self.assertRegex(aside[0], r"^sessions\.json\.damaged-\d{8}T\d{6}Z$")
        self.assertEqual(self.events().count("sessions-damaged"), 4)

    def test_a_damaged_accounts_file_stops_everything_and_is_left_alone(self):
        new = self.give_password()
        for garbage in (b"", b'{"v":1,"users":{"mika":{"hash":', b'{"v":1,"users":{"mika":{"hash":7}}}', b'{"v":2}',
                        b'{"v":1,"users":{"mika":{"gen":0,"disabled":false}}}'):
            with self.subTest(garbage=garbage):
                with open(self.auth.users.path, "wb") as handle:
                    handle.write(garbage)
                for attempt in (lambda: self.auth.session(new.token),
                                lambda: self.auth.sign_in("mika", PASSWORD, "203.0.113.7"),
                                lambda: self.auth.issue_invite("mika"),
                                lambda: self.auth.set_password("x" * 43, PASSWORD, "203.0.113.7"),
                                lambda: auth.Auth(self.settings_, self.clock).boot()):
                    with self.assertRaises(auth.AuthDamaged) as damaged:
                        attempt()
                    self.assertEqual((damaged.exception.status, damaged.exception.code), (503, "auth_damaged"))
                self.assertEqual(self.users_file(), garbage)
                self.assertEqual(self.auth.users.status()["state"], "damaged")
                self.assertEqual(auth.verify(self.dir)["users"]["state"], "damaged")
        self.assertEqual(self.auth.limiter.count("address", "203.0.113.7"), 0)             # nothing was counted

    def test_verify_counts_the_auth_files_of_any_directory(self):
        self.give_password()
        self.auth.issue_invite("misha")
        before = sorted(os.listdir(os.path.join(self.dir, "auth")))
        report = auth.verify(self.dir)
        self.assertEqual(report, {
            "users": {"state": "ok", "problem": None, "accounts": 3, "withPassword": 1, "disabled": 0, "pendingLinks": 1},
            "sessions": {"state": "ok", "problem": None, "sessions": 1}})
        self.assertEqual(sorted(os.listdir(os.path.join(self.dir, "auth"))), before)
        self.assertEqual(auth.verify(os.path.join(self.dir, "nowhere"))["users"]["state"], "missing")


class LimiterTests(AuthCase):
    def wrong(self, login, addr):
        with self.assertRaises(auth.InvalidCredentials):
            self.auth.sign_in(login, "not the password", addr)

    def test_ten_failures_per_address(self):
        self.give_password()
        for _ in range(10):
            self.wrong("mika", "198.51.100.9")
        with self.assertRaises(auth.TooManyAttempts) as refusal:
            self.auth.sign_in("mika", PASSWORD, "198.51.100.9")                           # even the right password
        self.assertEqual((refusal.exception.status, refusal.exception.code, refusal.exception.retry_after,
                          refusal.exception.extra(), refusal.exception.key),
                         (429, "too_many_attempts", 900, {"retryAfter": 900}, "address"))
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "198.51.100.10").identity.login, "mika")   # elsewhere: fine
        self.clock.tick(minutes=10)
        with self.assertRaises(auth.TooManyAttempts) as later:
            self.auth.sign_in("vanya", PASSWORD, "198.51.100.9")                          # the address, whatever the login
        self.assertEqual(later.exception.retry_after, 300)
        self.clock.tick(minutes=5)
        self.assertEqual(self.auth.sign_in("mika", PASSWORD, "198.51.100.9").identity.login, "mika")
        self.assertEqual(self.events().count("sign-in-blocked"), 1)                        # once per window, not per knock

    def test_thirty_failures_per_login_and_the_way_out(self):
        self.give_password()
        for address in ("198.51.100.1", "198.51.100.2", "198.51.100.3"):
            for _ in range(10):
                self.wrong("mika", address)
        with self.assertRaises(auth.TooManyAttempts) as refusal:
            self.auth.sign_in("mika", PASSWORD, "203.0.113.7")                            # Mika, from home
        self.assertEqual(refusal.exception.key, "login")
        self.wrong("misha", "203.0.113.7")                                                 # other logins are not held
        # The way out: a valid one-time link does not pass the per-login count.
        link, _ = self.auth.issue_invite("mika")
        new = self.auth.set_password(link.split("#t=")[1], "a new long passphrase", "203.0.113.7")
        self.assertEqual(self.auth.session(new.token).login, "mika")

    def test_success_gives_the_count_back(self):
        self.give_password()
        for _ in range(9):
            self.wrong("mika", "198.51.100.9")
        for _ in range(5):
            self.auth.sign_in("mika", PASSWORD, "198.51.100.9")
        self.assertEqual((self.auth.limiter.count("address", "198.51.100.9"), self.auth.limiter.count("login", "mika")),
                         (9, 9))
        self.wrong("mika", "198.51.100.9")
        with self.assertRaises(auth.TooManyAttempts):
            self.auth.sign_in("mika", PASSWORD, "198.51.100.9")

    def test_a_burst_gets_no_more_hashed_than_the_limit(self):
        self.give_password()
        real = auth.verify_password
        outcomes = []
        start = threading.Barrier(50)

        def knock():
            start.wait()
            try:
                self.auth.sign_in("mika", "not the password", "198.51.100.9")
            except auth.AuthError as refusal:
                outcomes.append(type(refusal).__name__)

        with mock.patch.object(auth, "verify_password", side_effect=real) as verify:
            threads = [threading.Thread(target=knock) for _ in range(50)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(30)
            self.assertEqual(verify.call_count, 10)
        self.assertEqual((outcomes.count("InvalidCredentials"), outcomes.count("TooManyAttempts"), len(outcomes)),
                         (10, 40, 50))

    def test_waiting_for_a_hash_slot_is_bounded_and_not_counted(self):
        quick = auth.Auth(dataclasses.replace(self.settings_, hash_wait=0.05), self.clock, self.log)
        with quick.limiter.hash_slot(), quick.limiter.hash_slot():                        # both slots taken
            with self.assertRaises(auth.Busy) as busy:
                quick.sign_in("mika", PASSWORD, "198.51.100.9")
            self.assertEqual((busy.exception.status, busy.exception.code), (503, "busy"))
            link, _ = quick.issue_invite("vanya")
            with self.assertRaises(auth.Busy):
                quick.set_password(link.split("#t=")[1], PASSWORD, "198.51.100.9")
        self.assertEqual((quick.limiter.count("address", "198.51.100.9"), quick.limiter.count("login", "mika"),
                          quick.limiter.count("setup", "198.51.100.9")), (0, 0, 0))
        self.assertEqual(quick.set_password(link.split("#t=")[1], PASSWORD, "198.51.100.9").identity.login, "vanya")

    def test_the_set_password_door_has_its_own_count(self):
        for _ in range(10):
            with self.assertRaises(auth.InvalidLink):
                self.auth.set_password("x" * 43, PASSWORD, "198.51.100.9")
        link, _ = self.auth.issue_invite("mika")
        with self.assertRaises(auth.TooManyAttempts) as refusal:
            self.auth.set_password(link.split("#t=")[1], PASSWORD, "198.51.100.9")
        self.assertEqual((refusal.exception.key, refusal.exception.retry_after), ("setup", 900))
        self.wrong("mika", "198.51.100.9")                                                 # the sign-in door counts apart
        self.assertEqual(self.auth.set_password(link.split("#t=")[1], PASSWORD, "198.51.100.10").identity.login, "mika")

    def test_a_flood_is_one_line_not_a_thousand(self):
        with mock.patch.object(auth, "verify_password", return_value=auth.Verdict(False, None)):   # no need to hash
            for number in range(260):                                                      # a new address and a new
                self.wrong("guess-%d" % number, "10.%d.%d.1" % (number // 200, number % 200))   # login each time
        events = self.events()
        self.assertEqual((events.count("sign-in-failed"), events.count("login-flood"), len(events)), (200, 1, 201))
        self.assertEqual(events[-1], "login-flood")
        self.assertNotIn("guess-", json.dumps(self.log.tail(500)))
        self.clock.tick(hours=1)                                                           # the next hour is written again
        self.wrong("vanya", "198.51.100.77")
        self.assertEqual(self.events()[-1], "sign-in-failed")

    def test_ipv6_is_counted_by_its_64(self):
        for number in range(10):
            self.wrong("mika", "2001:db8:1:2::%x" % (number + 1))
        with self.assertRaises(auth.TooManyAttempts):
            self.auth.sign_in("mika", PASSWORD, "2001:db8:1:2:ffff:ffff:ffff:ffff")
        self.wrong("mika", "2001:db8:1:3::1")                                              # the neighbour's /64
        self.assertEqual(self.auth.limiter.count("address", "2001:db8:1:2::77"), 10)

    def test_the_table_is_bounded_and_keeps_the_founders(self):
        limiter = auth.Limiter(self.clock, max_keys=50, pinned_logins=("mika",))
        limiter.begin_login("mika", "198.51.100.1")
        for number in range(500):
            limiter.begin_login("guess-%d" % number, "10.%d.%d.1" % (number // 250, number % 250))
        self.assertLessEqual(limiter.size(), 50)
        self.assertEqual(limiter.count("login", "mika"), 1)                               # a flood does not reset it
        self.assertEqual(limiter.count("login", "guess-0"), 0)                            # the oldest went
        self.assertEqual(limiter.count("login", "guess-499"), 1)
        attempt = limiter.begin_setup("198.51.100.1")
        self.assertEqual(attempt.counts, {"setup": 1})
        attempt.abandon()
        attempt.abandon()                                                                 # once is once
        self.assertEqual(limiter.count("setup", "198.51.100.1"), 0)


# ---------------------------------------------------------------------------
# auth: what every request passes
# ---------------------------------------------------------------------------

class RequestCheckTests(CoreCase):
    def test_the_client_address(self):
        edge = (ipaddress.ip_network("10.0.0.0/8"), ipaddress.ip_network("172.16.0.0/12"), ipaddress.ip_network("fd00::/8"))
        cases = [
            ("172.18.0.1", "203.0.113.9", "203.0.113.9"),                  # the edge appended it
            ("172.18.0.1", "1.2.3.4, 203.0.113.9", "203.0.113.9"),         # the right-most; the rest is the client's word
            ("172.18.0.1", ["1.2.3.4", "5.6.7.8, 203.0.113.9"], "203.0.113.9"),
            ("203.0.113.50", "1.2.3.4", "203.0.113.50"),                   # not from the edge: not believed
            ("172.18.0.1", None, "172.18.0.1"),
            ("172.18.0.1", "", "172.18.0.1"),
            ("172.18.0.1", "unknown", "172.18.0.1"),                       # not an address: the peer's stands
            ("172.18.0.1", "203.0.113.9, ", "203.0.113.9"),
            ("::ffff:172.18.0.1", "2001:db8::5", "2001:db8::5"),           # a v4 peer on a v6 socket
            ("fd00::1", "[2001:db8::5]", "2001:db8::5"),
            ("fe80::1%eth0", "1.2.3.4", "fe80::1"),
            ("127.0.0.1", "1.2.3.4", "127.0.0.1"),                         # loopback is not the edge unless named
            ("garbage", "1.2.3.4", "0.0.0.0"),
        ]
        for peer, forwarded, expected in cases:
            with self.subTest(peer=peer, forwarded=forwarded):
                self.assertEqual(auth.client_address(peer, forwarded, edge), expected)
        self.assertEqual(auth.client_address("10.0.0.1", "1.2.3.4", ()), "10.0.0.1")
        self.assertEqual([auth.address_key(a) for a in ("203.0.113.9", "2001:db8:1:2:3:4:5:6", "::ffff:10.1.2.3", "?")],
                         ["203.0.113.9", "2001:db8:1:2::/64", "10.1.2.3", "?"])
        self.assertEqual([auth.is_loopback(a) for a in ("127.0.0.1", "::1", "::ffff:127.0.0.1", "10.0.0.1", None)],
                         [True, True, True, False, False])

    def test_host_origin_and_fetch_site(self):
        prod = config.Settings.from_env(self.prod_env(), self.clock, scrypt_available=True)
        dev = self.settings()
        self.assertTrue(auth.host_ok(prod, "finance.selfstudio.se"))
        self.assertTrue(auth.host_ok(prod, "Finance.SelfStudio.se"))
        for host in (None, "", "finance.selfstudio.se:443", "finance.selfstudio.se.", "ops.selfstudio.dev",
                     "finance.test.selfstudio.se", "evil.example", "127.0.0.1:8080", "finance.selfstudio.se, evil"):
            self.assertFalse(auth.host_ok(prod, host), host)
        self.assertTrue(auth.host_ok(dev, "finance.localhost:8123"))
        self.assertFalse(auth.host_ok(dev, "finance.localhost"))

        self.assertTrue(auth.origin_ok(prod, "https://finance.selfstudio.se"))
        for origin in (None, "", "null", "http://finance.selfstudio.se", "https://finance.selfstudio.se:443",
                       "https://finance.test.selfstudio.se", "https://finance.selfstudio.se.evil.example",
                       "https://FINANCE.selfstudio.se", "https://finance.selfstudio.se/"):
            self.assertFalse(auth.origin_ok(prod, origin), origin)

        self.assertTrue(auth.fetch_site_ok(None, "PUT"))                   # a browser that does not send it
        self.assertTrue(auth.fetch_site_ok("same-origin", "PUT"))
        self.assertTrue(auth.fetch_site_ok("none", "GET"))                 # typed into the address bar
        for value, method in (("none", "PUT"), ("same-site", "GET"), ("cross-site", "GET"), ("cross-site", "PUT"),
                              ("", "GET"), ("weird", "GET")):
            self.assertFalse(auth.fetch_site_ok(value, method), (value, method))

        ours = "https://finance.selfstudio.se"
        self.assertIsNone(auth.api_refusal(prod, "PUT", ours, "same-origin"))            # the page's own save
        self.assertIsNone(auth.api_refusal(prod, "GET", None, "same-origin"))            # the page's own read
        self.assertIsNone(auth.api_refusal(prod, "GET", None, None))
        self.assertIsNone(auth.api_refusal(prod, "POST", ours, None))
        for method, origin, site in (("PUT", None, None), ("PUT", "https://finance.test.selfstudio.se", "same-site"),
                                     ("POST", ours, "cross-site"), ("PUT", ours, "same-site"),
                                     ("GET", None, "cross-site"), ("GET", "https://evil.example", None),
                                     ("DELETE", "null", None)):
            self.assertEqual(auth.api_refusal(prod, method, origin, site), "bad_origin", (method, origin, site))

        for content_type in ("application/json", "application/json; charset=utf-8", "Application/JSON"):
            self.assertTrue(auth.is_json(content_type))
        for content_type in (None, "", "text/plain", "application/x-www-form-urlencoded", "application/jsonp",
                             "text/plain; application/json"):
            self.assertFalse(auth.is_json(content_type), content_type)

    def test_the_cookie(self):
        prod = config.Settings.from_env(self.prod_env(), self.clock, scrypt_available=True)
        dev = self.settings()
        token = "k" * 43
        self.assertEqual(auth.session_cookie(prod, token),
                         "__Host-money=%s; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000" % token)
        self.assertEqual(auth.clear_session_cookie(prod), "__Host-money=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0")
        self.assertEqual(auth.session_cookie(dev, token), "money-dev=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" % token)
        self.assertEqual(auth.clear_session_cookie(dev), "money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        self.assertEqual(auth.cookie_token(prod, "theme=dark; __Host-money=%s; ssp_session=abc" % token), token)
        self.assertEqual(auth.cookie_token(dev, "money-dev=%s" % token), token)
        for header in (None, "", "money-dev=%s" % token, "ssp_session=%s" % token, "__Host-money=", "__Host-money=a b",
                       "x__Host-money=%s" % token, "__Host-money=" + "k" * 500):
            self.assertIsNone(auth.cookie_token(prod, header), header)
        self.assertTrue(auth.has_legacy_cookie("a=b; ssp_session=abcdef"))
        self.assertFalse(auth.has_legacy_cookie("a=b; xssp_session=1"))
        self.assertEqual(auth.clear_legacy_cookie(prod), "ssp_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0")
        self.assertEqual(auth.invite_link(prod.public_url, token), "https://finance.selfstudio.se/set-password#t=" + token)


# ---------------------------------------------------------------------------
# log
# ---------------------------------------------------------------------------

class LogTests(CoreCase):
    def test_the_request_line(self):
        out = io.StringIO()
        requests = log.RequestLog(out, self.clock)
        token = "s3cr3t-token-" + "x" * 30
        requests.request(method="put", path="/api/founder/money?debug=" + token, status=200, bytes_out=11, ms=12.34,
                         addr="203.0.113.7", login="mika", rid="ab12cd34ef56")
        requests.request(method="GET", path="/set-password%23t=" + token, status=200, addr="not an address",
                         login="Tr0ub4dor&3 typed into the login field")
        requests.request(method="GET", path="/set-password/" + token, status=302)
        requests.event("large-body", doc="ledger", bytes=9000000, password="nope", note=["a"])
        lines = out.getvalue().splitlines()
        self.assertEqual(lines[0], '{"t":"2026-10-07T12:00:00.000Z","rid":"ab12cd34ef56","method":"PUT",'
                                   '"path":"/api/founder/money","status":200,"bytes":11,"ms":12.3,'
                                   '"addr":"203.0.113.7","login":"mika"}')
        second, third, event = (json.loads(line) for line in lines[1:])
        self.assertEqual((second["path"], second["addr"], second["login"], second["rid"]), ("/set-password", "-", None, None))
        self.assertEqual(third["path"], "/set-password/~")
        self.assertEqual(event, {"t": "2026-10-07T12:00:00.000Z", "event": "large-body", "doc": "ledger",
                                 "bytes": 9000000, "note": "<list>"})
        self.assertNotIn(token, out.getvalue())
        self.assertNotIn("Tr0ub4dor", out.getvalue())
        self.assertRegex(log.new_request_id(), r"^[0-9a-f]{12}$")
        closed = io.StringIO()
        closed.close()
        log.RequestLog(closed, self.clock).request(method="GET", path="/", status=200)     # never raises

    def test_the_security_log(self):
        security = log.SecurityLog(self.dir, self.clock)
        self.assertEqual(security.tail(50), [])
        self.assertTrue(security.write("boot", stand="dev", version="1.0.0"))
        self.clock.tick(seconds=5)
        security.write("sign-in", login="mika", addr="203.0.113.7")
        security.write("restore", doc="ledger", snapshot="day-2026-10-07-rev000001.json.gz", rev=4, fromRev=1,
                       kept=None, by="ctl", detail="x" * 500)
        tail = security.tail(50)
        self.assertEqual([entry["event"] for entry in tail], ["restore", "sign-in", "boot"])                # newest first
        self.assertEqual(tail[2], {"t": "2026-10-07T12:00:00Z", "event": "boot", "stand": "dev", "version": "1.0.0"})
        self.assertEqual(len(tail[0]["detail"]), 200)
        self.assertEqual([entry["event"] for entry in security.tail(2)], ["restore", "sign-in"])
        self.assertEqual(oct(os.stat(security.path).st_mode & 0o777), "0o600")
        for bad in ({"password": "x"}, {"sessionToken": "x"}, {"cookie": "x"}, {"passwordHash": "x"}, {"t": "x"},
                    {"doc": {"tx": []}}, {"rows": [1, 2]}, {"ms": 1.5}):
            with self.assertRaises(ValueError):
                security.write("sign-in", **bad)
        with self.assertRaises(ValueError):
            security.write("Not An Event")
        with open(security.path, "ab") as handle:
            handle.write(b"half a li")                                                     # a torn line is skipped
        self.assertEqual(len(security.tail(50)), 3)
        self.assertEqual(security.status()["files"], 1)
        for event in ("boot", "sign-in", "sign-in-failed", "link-issued", "link-used", "password-set",
                      "session-created", "sessions-closed", "seed", "restore"):
            self.assertIn(event, log.EVENTS)
        gone = log.SecurityLog(os.path.join(self.dir, "nowhere"), self.clock)
        self.assertFalse(gone.write("boot"))                                               # swallowed, counted
        self.assertEqual(gone.failed, 1)
        with self.assertRaises(OSError):
            gone.write("boot", strict=True)

    def test_the_security_log_rotates_by_size_and_keeps_the_young(self):
        security = log.SecurityLog(self.dir, self.clock, max_bytes=400, keep=2)
        for number in range(40):
            security.write("sign-in", login="mika", addr="203.0.113.7", n=number)
            self.clock.tick(minutes=1)
        files = sorted(name for name in os.listdir(self.dir) if name.startswith("security.log"))
        self.assertGreater(len(files), 3)                    # beyond keep=2, yet nothing is 400 days old
        self.assertEqual([entry["n"] for entry in security.tail(40)], list(range(39, -1, -1)))
        self.assertEqual(security.status()["files"], len(files))
        self.clock.tick(days=401)
        for number in range(40, 50):
            security.write("sign-in", login="mika", addr="203.0.113.7", n=number)
        files = sorted(name for name in os.listdir(self.dir) if name.startswith("security.log"))
        self.assertEqual(files, ["security.log", "security.log.1", "security.log.2"])
        self.assertEqual(security.tail(1)[0]["n"], 49)
        capped = log.SecurityLog(self.dir, self.clock, max_bytes=400, keep=2, hard_keep=4)
        for number in range(60):
            capped.write("sign-in", login="mika", addr="203.0.113.7", n=number)
        self.assertLessEqual(capped.status()["files"], 5)    # the hard ceiling holds whatever the age


class SafetyTests(CoreCase):
    def test_tests_do_not_run_beside_a_ledger_or_inside_a_stand(self):
        self.assertIsNone(_safety.refusal())
        self.assertIsNone(_safety.refusal(environ={"MONEY_STAND": "dev"}))
        self.assertIn("inside a stand", _safety.refusal(environ={"MONEY_STAND": "prod"}))
        self.assertIn("inside a stand", _safety.refusal(environ={"MONEY_STAND": "test"}))
        # A copy of the guard in a folder that holds data/: importing it ends the process, exit code 2,
        # before a test module that imports it gets to run anything - discovery included.
        os.mkdir(os.path.join(self.dir, "tests"))
        os.mkdir(os.path.join(self.dir, "data"))
        open(os.path.join(self.dir, "tests", "__init__.py"), "w").close()
        shutil.copy(_safety.__file__, os.path.join(self.dir, "tests", "_safety.py"))
        with open(os.path.join(self.dir, "tests", "test_never.py"), "w") as handle:
            handle.write("from tests import _safety\nimport unittest\n"
                         "class T(unittest.TestCase):\n    def test_it(self):\n        print('RAN ANYWAY')\n")
        self.assertIn("holds a ledger", _safety.refusal(checkout=self.dir, environ={}))
        env = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        done = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", "."], cwd=self.dir,
                              env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        self.assertEqual(done.returncode, 2)
        self.assertIn(b"money tests refused", done.stderr)
        self.assertNotIn(b"RAN ANYWAY", done.stdout + done.stderr)
        self.assertEqual(os.listdir(os.path.join(self.dir, "data")), [])


class ContractTests(unittest.TestCase):
    """What the HTTP layer leans on without looking: one base for every refusal, one vocabulary of events."""

    def test_every_refusal_is_one_kind_of_answer(self):
        stale = store.Stale("The ledger was saved from somewhere else since this copy was read.", 7)
        self.assertEqual(stale.body(), {"error": "money_stale", "rev": 7,
                                        "message": "The ledger was saved from somewhere else since this copy was read."})
        self.assertEqual(auth.TooManyAttempts(120).body(), {
            "error": "too_many_attempts", "message": "Too many attempts. Try again in a few minutes.", "retryAfter": 120})
        self.assertEqual(auth.WeakPassword("too_short").body()["min"], 12)
        answers = {
            store.BadDoc: (400, "bad_money_doc"), store.Stale: (409, "money_stale"), store.TooLarge: (413, "body_too_large"),
            store.Damaged: (503, "storage_damaged"), store.NoSpace: (507, "storage_failed"),
            store.StorageFailed: (507, "storage_failed"), store.Busy: (503, "storage_busy"),
            auth.MissingCredentials: (400, "missing_credentials"), auth.InvalidCredentials: (401, "invalid_credentials"),
            auth.TooManyAttempts: (429, "too_many_attempts"), auth.Busy: (503, "busy"),
            auth.InvalidLink: (404, "invalid_link"), auth.WeakPassword: (400, "weak_password"),
            auth.AuthDamaged: (503, "auth_damaged"), auth.AuthStorageFailed: (507, "storage_failed"),
        }
        for refusal, (status, code) in answers.items():
            self.assertTrue(issubclass(refusal, config.Refusal), refusal)
            self.assertEqual((refusal.status, refusal.code), (status, code), refusal)

    def test_every_event_the_core_writes_is_in_the_vocabulary(self):
        import re
        written = set()
        for module in (auth, store):
            with open(module.__file__, encoding="utf-8") as handle:
                written.update(re.findall(r'(?:_note|_refused|_security_log\.write)\(\s*"([a-z-]+)"', handle.read()))
        self.assertGreaterEqual(len(written), 15)
        self.assertEqual(sorted(written - set(log.EVENTS)), [])


if __name__ == "__main__":
    unittest.main()
