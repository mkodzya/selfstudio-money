"""The two documents as files: every storage rule of the documents, held to the code.

Where a rule comes from is said at each class: BUILD-SPEC 2.5 (fail closed), 2.7 (the data
directory), 2.8 (the contract and the snapshots), the design's section 1.4, ``docs/api.md``
("The two documents") and ``docs/security.md`` ("Damaged state fails closed", "Keeping the
stands and the laptop apart"). The platform's route file ``apps/api/src/routes/founder/money.ts``
is the reference for what a body may be.

    python3 -m unittest tests.test_store

``tests/test_core_smoke.py`` and ``tests/test_service_smoke.py`` walk the main paths once.
This file goes where they do not: the edges of every number, each refusal and what it
leaves on disk, a writer that dies in the middle, two writers at once, and what a person
with a shell on the server is and is not shown.

Two kinds of test case:

* ``StoreCase`` - ``moneyd.store`` on a temporary directory with a clock the test moves;
* ``DoorCase`` - a whole dev stand (``tests/_harness.py``), asked over HTTP like the page asks.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import datetime
import errno
import gzip
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock

from moneyd import __main__ as boot
from moneyd import auth, config, ctl, log, store
from tests import _harness
from tests._harness import FakeClock, ledger

MIB = 1024 * 1024
UTC = datetime.timezone.utc
CHECKOUT = _safety.CHECKOUT
LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
DOORS = {"ledger": LEDGER, "plan": PLAN}
EMPTY = b'{"rev":0,"doc":{},"updatedAt":null}'
NOON = "2026-10-07T12:00:00.000Z"       # where tests._harness.FakeClock starts
PLAN_LISTS = ("banks", "inflows", "team", "taxes", "other")
#: Something no fabricated document would hold by chance: if it shows up in an output, contents leaked.
CANARY = "KANAREIKA-7731"


def plan(**rows):
    """A cash plan as the page sends it; ``plan(banks=3, team=2)`` has five rows in two of its five lists."""
    doc = {"v": 2, "cushion": 0}
    for name in PLAN_LISTS:
        doc[name] = [{"id": "%s-%d" % (name, index)} for index in range(rows.get(name, 0))]
    return json.dumps(doc)


def envelope(rev, doc, updated=NOON):
    """The stored file, and the GET answer, of a document saved as ``doc`` at ``updated``."""
    return b'{"rev":%d,"doc":%s,"updatedAt":"%s"}' % (rev, doc.encode("utf-8"), updated.encode("ascii"))


def read_file(path):
    with open(path, "rb") as handle:
        return handle.read()


def write_new(path, content):
    """Put ``content`` at ``path`` as a new file, the way a restored backup or an editor does."""
    scratch = path + ".being-put"
    with open(scratch, "wb") as handle:
        handle.write(content)
    os.replace(scratch, path)


def tree(root):
    """Every file and folder under ``root``: what it is, how large, when it last changed."""
    found = {}
    for base, folders, files in os.walk(root):
        for name in folders + files:
            path = os.path.join(base, name)
            status = os.lstat(path)
            found[os.path.relpath(path, root)] = (stat.S_IFMT(status.st_mode), stat.S_IMODE(status.st_mode),
                                                  0 if stat.S_ISDIR(status.st_mode) else status.st_size,
                                                  status.st_mtime_ns)
    return found


def child_environ():
    """What a child process gets: this environment without any ``MONEY_*`` of its own, and no ``.pyc`` files."""
    environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
    environ["PYTHONDONTWRITEBYTECODE"] = "1"
    return environ


class StoreCase(unittest.TestCase):
    """``moneyd.store`` on a temporary data directory, with a clock that stands still until the test moves it."""

    STAND = "dev"

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="money-store-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.clock = FakeClock()
        store.prepare_data_dir(self.dir, self.STAND)
        self.ledger = self.open("ledger")
        self.plan = self.open("plan")

    def open(self, kind, **options):
        """Another ``DocStore`` on the same directory - what a second process, or a restart, is."""
        return store.DocStore(self.dir, kind, self.clock, **options)

    def path(self, *parts):
        return os.path.join(self.dir, *parts)

    def names(self, kind="ledger"):
        return sorted(os.listdir(self.path(kind, "snapshots")))

    def unpack(self, name, kind="ledger"):
        """What a snapshot holds once unpacked - with gzip itself, not with the store."""
        return gzip.decompress(read_file(self.path(kind, "snapshots", name)))

    def kept(self, kind="ledger"):
        """Everything stored for a document but its lock file: (beside the document, in snapshots/)."""
        beside = sorted(name for name in os.listdir(self.path(kind)) if name not in (".lock", "snapshots"))
        return beside, self.names(kind)

    def assertNoLitter(self, kind="ledger"):
        beside, copies = self.kept(kind)
        self.assertEqual([name for name in beside + copies if ".tmp-" in name], [])


class DoorCase(unittest.TestCase):
    """A dev stand in this process, asked over HTTP as a signed-in founder's page asks."""

    def setUp(self):
        self.stand = _harness.Stand()
        self.addCleanup(self.stand.stop)
        self.cookie = self.stand.session("mika")

    def get(self, door):
        return self.stand.get(door, cookie=self.cookie)

    def put(self, door, base, doc):
        return self.stand.put(door, {"base": base, "doc": doc}, cookie=self.cookie)

    def put_raw(self, door, raw):
        """A body sent as these bytes: JSON types are part of what is tested."""
        return self.stand.put(door, body=raw, cookie=self.cookie, headers={"Content-Type": "application/json"})

    def file(self, kind="ledger", name="current.json"):
        return os.path.join(self.stand.data_dir, kind, name)

    def stored(self, kind="ledger"):
        return read_file(self.file(kind))

    def copies(self, kind="ledger"):
        return sorted(os.listdir(self.file(kind, "snapshots")))

    def assertSaved(self, answer, rev):
        self.assertEqual((answer.status, answer.body), (200, b'{"rev":%d}' % rev), answer.body[:200])

    def assertRefused(self, answer, status, code):
        self.assertEqual(answer.status, status, answer.body[:200])
        self.assertEqual(answer.json().get("error"), code, answer.body[:200])
        self.assertTrue(answer.header("Content-Type").startswith("application/json"))


# ---------------------------------------------------------------------------
# Revisions (BUILD-SPEC 2.8; design 1.4 "Revisions")
# ---------------------------------------------------------------------------

class RevisionTests(DoorCase):
    def test_before_the_first_save_each_document_is_revision_0_an_empty_object_and_no_time(self):
        for kind, door in DOORS.items():
            with self.subTest(kind=kind):
                answer = self.get(door)
                self.assertEqual((answer.status, answer.body), (200, EMPTY))
                self.assertEqual(list(answer.json()), ["rev", "doc", "updatedAt"])
                self.assertTrue(answer.header("Content-Type").startswith("application/json"))
                self.assertEqual(answer.header("Cache-Control"), "no-store")
                self.assertEqual(sorted(name for name in os.listdir(os.path.join(self.stand.data_dir, kind))
                                        if name != ".lock"), ["snapshots"], "reading stores nothing")

    def test_an_accepted_save_answers_the_next_revision_and_exactly_that(self):
        for kind, door, first, second in (("ledger", LEDGER, ledger(3, "one"), ledger(4, "two")),
                                          ("plan", PLAN, plan(banks=2), plan(banks=3, team=1))):
            with self.subTest(kind=kind):
                self.assertSaved(self.put(door, 0, first), 1)
                self.assertEqual(self.get(door).body, envelope(1, first))
                self.stand.clock.tick(seconds=61, milliseconds=7)
                self.assertSaved(self.put(door, 1, second), 2)
                answer = self.get(door)
                self.assertEqual(answer.body, envelope(2, second, "2026-10-07T12:01:01.007Z"))
                self.assertEqual(list(answer.json()), ["rev", "doc", "updatedAt"])
                self.stand.clock.set(datetime.datetime(2026, 10, 7, 12, 0, 0, tzinfo=UTC))

    def test_a_save_from_a_revision_that_is_not_the_stored_one_is_409_money_stale_and_writes_nothing(self):
        for kind, door, full, empty in (("ledger", LEDGER, ledger(30, "kept"), ledger(0)),
                                        ("plan", PLAN, plan(banks=30), plan())):
            with self.subTest(kind=kind):
                self.stand.clock.set(datetime.datetime(2026, 10, 7, 12, 0, 0, tzinfo=UTC))
                self.assertSaved(self.put(door, 0, full), 1)
                self.assertSaved(self.put(door, 1, full), 2)
                before, copies = self.stored(kind), self.copies(kind)
                self.assertEqual(copies, ["day-2026-10-07-rev000001.json.gz"])
                self.stand.clock.tick(days=1)       # the copy of a new day is due: a refused save must not take it
                for base in (1, 0, 3, 99, 2 ** 53 - 1):
                    late = self.put(door, base, empty)
                    self.assertEqual(late.status, 409, base)
                    said = late.json()
                    self.assertEqual(sorted(said), ["error", "message", "rev"])
                    self.assertEqual((said["error"], said["rev"]), ("money_stale", 2))
                    self.assertTrue(said["message"])
                self.assertEqual(self.stored(kind), before)
                self.assertEqual(self.copies(kind), copies)
                self.assertSaved(self.put(door, 2, full), 3)
                self.assertEqual(self.copies(kind), copies + ["day-2026-10-08-rev000002.json.gz"])

    def test_a_restart_counts_on_from_the_revision_on_disk(self):
        for rev in range(3):
            self.assertSaved(self.put(LEDGER, rev, ledger(2, "n%d" % rev)), rev + 1)
        again = store.open_stores(self.stand.settings, self.stand.clock)["ledger"]      # what a new process holds
        self.assertEqual((again.read().rev, again.revision()), (3, 3))
        with self.assertRaises(store.Stale) as late:
            again.save(0, ledger(1), "mika")
        self.assertEqual(late.exception.rev, 3)
        self.assertEqual(again.save(3, ledger(2, "after the restart"), "mika").rev, 4)
        self.assertEqual(self.get(LEDGER).body, envelope(4, ledger(2, "after the restart")))


# ---------------------------------------------------------------------------
# What a body may be (BUILD-SPEC 2.8: "read money.ts and match it")
# ---------------------------------------------------------------------------

GOOD = '{"tx":[]}'


def member(doc_text):
    """A document's text as the JSON string the page puts into ``doc``."""
    return json.dumps(doc_text, ensure_ascii=False)


def body(base, doc):
    """A PUT body out of two pieces of JSON text, exactly as given. None leaves the member out."""
    members = []
    if base is not None:
        members.append('"base":' + base)
    if doc is not None:
        members.append('"doc":' + doc)
    return ("{" + ",".join(members) + "}").encode("utf-8")


class BodyTests(DoorCase):
    def setUp(self):
        super().setUp()
        self.rev = 0

    def save(self, count=1):
        for _save in range(count):
            self.assertSaved(self.put(LEDGER, self.rev, ledger(2, "rev %d" % self.rev)), self.rev + 1)
            self.rev += 1

    def assertUntouched(self, before):
        self.assertEqual(self.stored(), before, "a refused save wrote something")

    def test_base_is_a_whole_number_of_0_or_more_and_nothing_else_is(self):
        self.save()
        before = self.stored()
        refused = {
            "missing": None, "null": "null", "true": "true", "false": "false", "the revision as text": '"1"',
            "an empty string": '""', "a list": "[1]", "an object": '{"rev":1}', "below zero": "-1",
            "below zero, written as a fraction": "-1.0", "a half": "0.5", "one and a half": "1.5",
            "a tenth": "1e-1", "too large to be a number": "1E400", "too small to be one": "-1E400",
        }
        for why, base in refused.items():
            with self.subTest(why=why):
                self.assertRefused(self.put_raw(LEDGER, body(base, member(GOOD))), 400, "bad_money_doc")
        self.assertUntouched(before)

    def test_a_whole_number_written_another_way_is_the_same_revision(self):
        # JSON has one kind of number; to JSON.parse and Number.isInteger 3.0, 3e0 and 30e-1 are all 3.
        self.save(3)
        before = self.stored()
        for base in ("0", "-0", "0.0", "-0.0", "0e5", "1e-400", "2", "2.0", "7", "1e3", "9007199254740993",
                     "123456789012345678901234567890", "1e308"):
            with self.subTest(base=base):
                late = self.put_raw(LEDGER, body(base, member(GOOD)))
                self.assertRefused(late, 409, "money_stale")        # a revision, only not the stored one
                self.assertEqual(late.json()["rev"], 3)
        self.assertUntouched(before)
        for base, rev in (("3.0", 4), ("4e0", 5), ("50e-1", 6), ("600E-2", 7), ("7.000", 8)):
            with self.subTest(base=base):
                self.assertSaved(self.put_raw(LEDGER, body(base, member(GOOD))), rev)

    def test_doc_is_a_string_of_json_and_never_the_document_itself(self):
        self.save()
        before = self.stored()
        refused = {
            "missing": None, "null": "null", "true": "true", "a number": "7", "a list": "[]",
            "the document as an object": GOOD, "the document as an object with rows": '{"tx":[{"id":"a"}],"note":"x"}',
            "a list of one string": "[%s]" % member(GOOD),
        }
        for why, doc in refused.items():
            with self.subTest(why=why):
                self.assertRefused(self.put_raw(LEDGER, body("1", doc)), 400, "bad_money_doc")
        self.assertUntouched(before)

    def test_the_string_must_hold_json_as_json_parse_reads_it(self):
        self.save()
        before = self.stored()
        not_json = ["", " ", "not json", "{", '{"tx":[]', "{'tx':[]}", '{"tx":[],}', '{"tx":[]} x', '{"tx":[]}{"tx":[]}',
                    chr(0xFEFF) + GOOD, '{"tx":[01]}', '{"tx":[1.]}', '{"tx":[+1]}', '{"tx":[.5]}', '{"tx":[0x10]}',
                    '{"tx":["a\tb"]}', '{"tx":["a\nb"]}', "{tx:[]}", '{"tx":[undefined]}', '{"tx":[],"a":\'x\'}',
                    "// a comment\n" + GOOD, '{"tx":[NaN]}', '{"tx":[],"a":Infinity}', '{"tx":[],"a":-Infinity}',
                    '{"tx":[],"a":"\\x41"}', '{"tx":[],"a":"\\u12"}', "\x0c" + GOOD, GOOD + "\x00"]
        for doc in not_json:
            with self.subTest(doc=doc[:24]):
                self.assertRefused(self.put(LEDGER, 1, doc), 400, "bad_money_doc")
        # Text that is not Unicode cannot be stored: a lone surrogate, written as an escape of the BODY's own string.
        lone = b'{"base":1,"doc":"{\\"tx\\":[],\\"a\\":\\"\\ud800\\"}"}'
        self.assertRefused(self.put_raw(LEDGER, lone), 400, "bad_money_doc")
        self.assertUntouched(before)

    def test_the_json_must_be_an_object_with_the_ledgers_list_of_rows(self):
        self.save()
        before = self.stored()
        not_a_ledger = ["null", "true", "7", '"text"', "[]", "[%s]" % GOOD, "{}", '{"rows":[]}', '{"TX":[]}',
                        '{"tx":null}', '{"tx":{}}', '{"tx":"[]"}', '{"tx":0}', '{"tx":true}', '{"doc":{"tx":[]}}',
                        '{"banks":[]}', plan(banks=3),
                        '{"tx":[],"tx":5}',         # named twice: the last one counts, as in JSON.parse
                        '{"tx":[],"tx":null}']
        for doc in not_a_ledger:
            with self.subTest(doc=doc[:24]):
                self.assertRefused(self.put(LEDGER, 1, doc), 400, "bad_money_doc")
        self.assertUntouched(before)

    def test_what_json_parse_takes_as_a_ledger_this_door_takes(self):
        taken = [GOOD, " \n\t" + GOOD + "\r\n ", '{"tx":5,"tx":[]}', '{"tx":[],"tx":[1,2,3]}', '{"tx":[1e999,-1E-999,-0]}',
                 '{"tx":[],"__proto__":{"tx":7},"constructor":null}', '{"tx":[],"a":"\\ud800"}', '{"tx":[[],{},"",0,null,false]}',
                 '{"\\u0074x":[]}']
        for doc in taken:
            with self.subTest(doc=doc[:24]):
                self.assertSaved(self.put(LEDGER, self.rev, doc), self.rev + 1)
                self.rev += 1

    def test_the_plans_door_wants_a_list_of_banks_and_the_ledgers_door_a_list_of_rows(self):
        self.assertSaved(self.put(PLAN, 0, plan(banks=1)), 1)
        before = self.stored("plan")
        for doc in (GOOD, ledger(3), "{}", '{"banks":{}}', '{"banks":null}', '{"banks":"[]"}', '{"inflows":[],"team":[]}',
                    '{"Banks":[]}', '{"banks":[],"banks":0}', "[]", "null"):
            with self.subTest(doc=doc[:24]):
                self.assertRefused(self.put(PLAN, 1, doc), 400, "bad_money_doc")
        self.assertEqual(self.stored("plan"), before)
        self.assertSaved(self.put(PLAN, 1, '{"banks":[]}'), 2)
        self.assertSaved(self.put(PLAN, 2, '{"tx":[1],"banks":[]}'), 3)       # only banks is asked for

    def test_a_body_that_is_not_an_object_has_neither_member(self):
        self.save()
        before = self.stored()
        for raw in (b"[]", b"null", b"7", b'"x"', b"true", b"{}", b'[{"base":1,"doc":"{\\"tx\\":[]}"}]'):
            with self.subTest(raw=raw):
                self.assertRefused(self.put_raw(LEDGER, raw), 400, "bad_money_doc")
        for raw in (b"", b"{", b'{"base":1,"doc":"{\\"tx\\":[]}"', b"\xff\xfe", b'{"base":1,"doc":NaN}'):
            with self.subTest(raw=raw):
                self.assertEqual(self.put_raw(LEDGER, raw).status, 400)
        self.assertUntouched(before)

    def test_the_body_is_judged_before_the_revision_as_on_the_platform(self):
        self.save(2)
        before = self.stored()
        self.assertRefused(self.put(LEDGER, 0, "not json"), 400, "bad_money_doc")              # behind AND not JSON
        self.assertRefused(self.put(LEDGER, 0, '{"rows":[]}'), 400, "bad_money_doc")           # behind AND no ledger
        self.assertRefused(self.put_raw(LEDGER, body('"2"', '{"tx":[]}')), 400, "bad_money_doc")   # both members wrong
        self.assertRefused(self.put_raw(LEDGER, body("-1", member("not json"))), 400, "bad_money_doc")
        self.assertRefused(self.put(LEDGER, 0, GOOD), 409, "money_stale")                      # a good body, behind
        self.assertUntouched(before)

    def test_members_the_door_does_not_know_are_ignored_and_a_member_named_twice_counts_as_its_last(self):
        self.save()
        extra = b'{"by":"mika","base":1,"rev":99,"doc":"{\\"tx\\":[]}","updatedAt":null}'
        self.assertSaved(self.put_raw(LEDGER, extra), 2)
        twice = b'{"base":99,"doc":"not json","base":2,"doc":"{\\"tx\\":[1]}"}'
        self.assertSaved(self.put_raw(LEDGER, twice), 3)
        self.assertEqual(self.get(LEDGER).body, envelope(3, '{"tx":[1]}'))


# ---------------------------------------------------------------------------
# Two documents, one contract, nothing shared (design 1.4; docs/api.md)
# ---------------------------------------------------------------------------

class IndependenceTests(DoorCase):
    def test_saving_one_document_never_moves_the_other(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(30, "filed")), 1)
        self.assertSaved(self.put(PLAN, 0, plan(banks=30)), 1)
        ledger_file, plan_file = self.stored("ledger"), self.stored("plan")
        for rev in range(1, 6):
            self.assertSaved(self.put(PLAN, rev, plan(banks=30, team=rev)), rev + 1)
        self.assertEqual(self.stored("ledger"), ledger_file)
        self.assertEqual(self.get(LEDGER).body, ledger_file)
        self.assertEqual(self.copies("ledger"), [], "the plan's copies are the plan's")
        self.assertRefused(self.put(LEDGER, 6, ledger(1)), 409, "money_stale")      # the plan's revision is not the ledger's
        self.assertSaved(self.put(LEDGER, 1, ledger(30, "filed again")), 2)
        self.assertEqual(self.get(PLAN).json()["rev"], 6)
        self.assertNotEqual(self.stored("plan"), plan_file)

    def test_a_damaged_document_leaves_the_other_one_working(self):
        for broken, sound, sound_doc in (("ledger", "plan", plan(banks=2)), ("plan", "ledger", ledger(2))):
            with self.subTest(broken=broken):
                write_new(self.file(broken), b'{"rev":7,"doc":{')
                self.assertRefused(self.get(DOORS[broken]), 503, "storage_damaged")
                rev = self.get(DOORS[sound]).json()["rev"]
                self.assertSaved(self.put(DOORS[sound], rev, sound_doc), rev + 1)
                self.assertEqual(self.get(DOORS[sound]).status, 200)
                os.unlink(self.file(broken))

    def test_a_lock_held_on_one_document_keeps_only_that_one_waiting(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(2)), 1)
        impatient = store.DocStore(self.stand.data_dir, "ledger", self.stand.clock, lock_timeout=0.05)
        with store.FileLock(self.file("ledger", ".lock"), timeout=1.0):      # what a restore in another process holds
            with self.assertRaises(store.Busy):
                impatient.save(1, ledger(3), "mika")
            self.assertSaved(self.put(PLAN, 0, plan(banks=1)), 1)
            self.assertEqual(self.get(LEDGER).status, 200, "reading takes no lock")
        self.assertEqual(impatient.save(1, ledger(3), "mika").rev, 2)

    def test_copies_restore_and_purge_of_one_document_leave_the_other_alone(self):
        for rev in range(3):
            self.assertSaved(self.put(LEDGER, rev, ledger(30, "l%d" % rev)), rev + 1)
            self.assertSaved(self.put(PLAN, rev, plan(banks=30, other=rev)), rev + 1)
        plan_file, plan_copies = self.stored("plan"), self.copies("plan")
        self.assertEqual(plan_copies, ["day-2026-10-07-rev000001.json.gz"])
        done = self.stand.stores["ledger"].restore("day-2026-10-07-rev000001.json.gz", "ctl")
        self.assertEqual(done.rev, 4)
        self.assertEqual(self.stand.stores["ledger"].purge(0, "dev"), 2)
        self.assertEqual((self.stored("plan"), self.copies("plan")), (plan_file, plan_copies))
        self.assertEqual(self.get(PLAN).json()["rev"], 3)


# ---------------------------------------------------------------------------
# Text for text (design 1.4 "stored verbatim"; docs/api.md "text for text")
# ---------------------------------------------------------------------------

class VerbatimTests(DoorCase):
    LEDGERS = {
        "letters of several alphabets, a sign, an emoji beyond the basic plane":
            '{"tx":[{"l":"Кафе ☕ — «тест»","e":"😀🇦🇲","z":"a%sb%sc","n":"e%s é"}],"ключ":"значение","":""}'
            % (chr(0x2028), chr(0x2029), chr(0x0301)),      # a line and a paragraph separator, a combining accent
        "escapes, kept as they were written":
            '{"tx":[{"l":"\\u041a\\u0430\\u0444\\u0435 \\ud83d\\ude00 \\/ \\\\ \\" \\b\\f\\n\\r\\t \\u0000 \\u005b\\u0022"}]}',
        "numbers no two parsers print alike":
            '{"tx":[1.10,1E+2,-0.0,0.1000,123456789012345678901234567890,1e999,-1E-999,2.5e-3,0,-0],"n":1.0}',
        "members named twice, in the order they came":
            '{"zeta":1,"tx":[{"id":1}],"alpha":2,"zeta":3,"tx":[{"id":1},{"id":2}]}',
        "white space inside":
            '{ "tx" : [ 1 ,\n\t2 ] ,\r\n "note" : "a  b" }',
        "brackets, quotes and backslashes inside strings":
            r'{"tx":["]}","[{","\"]","a\\","{\"tx\":[]}","","\\\"[","]\\"],"]":"[","\"":"\\"}',
        "nesting as deep as a document may be":
            '{"tx":[],"deep":' + "[" * 63 + "]" * 63 + "}",
        "members of a later version of the page":
            '{"v":9,"tx":[],"inbox":[],"future":{"a":[{"b":null}]},"flag":true,"rev":41,"updatedAt":"never","doc":{}}',
        "the smallest ledger there is": '{"tx":[]}',
    }
    PLANS = {
        "a plan with a list of tomorrow": '{"banks":[{"n":"Ameria ֏","bal":1.50}],"inflows":[],"loans":[{"x":[1,[2,[3]]]}]}',
        "a plan with nothing but banks": '{"banks":[]}',
    }

    def test_what_is_saved_comes_back_text_for_text_and_lies_on_disk_as_the_answer(self):
        for kind, door, documents in (("ledger", LEDGER, self.LEDGERS), ("plan", PLAN, self.PLANS)):
            rev = 0
            for what, doc in documents.items():
                with self.subTest(kind=kind, what=what):
                    json.loads(doc)                                     # the fixture itself is JSON
                    self.assertSaved(self.put(door, rev, doc), rev + 1)
                    rev += 1
                    answer = self.get(door)
                    self.assertEqual(answer.body, envelope(rev, doc))
                    self.assertEqual(self.stored(kind), answer.body, "the file is the GET answer, byte for byte")

    def test_only_white_space_around_the_document_is_not_kept(self):
        inside = '{ "tx" : [ ] ,\n "note" : " padded " }'
        self.assertSaved(self.put(LEDGER, 0, " \r\n\t" + inside + "\n\n  "), 1)
        self.assertEqual(self.get(LEDGER).body, envelope(1, inside))

    def test_nesting_is_taken_to_64_levels_and_refused_beyond_without_harm(self):
        def deep(levels, opener="[", closer="]"):
            return '{"tx":[],"x":' + opener * (levels - 1) + closer * (levels - 1) + "}"
        objects = lambda levels: '{"tx":[],"x":' + '{"a":' * (levels - 2) + "[]" + "}" * (levels - 2) + "}"
        mixed = lambda levels: '{"tx":[],"x":' + '[{"a":' * ((levels - 1) // 2) + "0" + "}]" * ((levels - 1) // 2) + "}"
        self.assertSaved(self.put(LEDGER, 0, deep(64)), 1)
        self.assertEqual(self.get(LEDGER).body, envelope(1, deep(64)))
        self.assertSaved(self.put(LEDGER, 1, objects(64)), 2)
        self.assertSaved(self.put(LEDGER, 2, mixed(63)), 3)
        self.assertEqual(self.get(LEDGER).body, envelope(3, mixed(63)))
        before = self.stored()
        for doc in (deep(65), deep(66), objects(65), mixed(65), deep(5000), '{"tx":' + "[" * 100000,
                    '{"tx":[],"x":' + '{"a":' * 3000):
            with self.subTest(size=len(doc)):
                self.assertRefused(self.put(LEDGER, 3, doc), 400, "bad_money_doc")
        self.assertEqual(self.stored(), before)
        self.assertEqual(self.get("/api/me").status, 200, "and the server lives")

    def test_updated_at_is_the_moment_of_the_save_in_utc_to_the_millisecond(self):
        yerevan = datetime.timezone(datetime.timedelta(hours=4))
        self.stand.clock.set(datetime.datetime(2026, 10, 8, 2, 3, 22, 123999, tzinfo=yerevan))
        self.assertSaved(self.put(LEDGER, 0, GOOD), 1)
        self.assertEqual(self.get(LEDGER).json()["updatedAt"], "2026-10-07T22:03:22.123Z")
        self.stand.clock.set(datetime.datetime(2026, 12, 31, 23, 59, 59, 999999, tzinfo=UTC))
        self.cookie = self.stand.session("mika")        # the first session ended weeks ago
        self.assertSaved(self.put(LEDGER, 1, GOOD), 2)
        self.assertEqual(self.get(LEDGER).json()["updatedAt"], "2026-12-31T23:59:59.999Z")
        self.assertRegex(self.get(LEDGER).body.decode("ascii"), r'^\{"rev":2,"doc":\{"tx":\[\]\},"updatedAt":"[^"]{24}"\}$')


# ---------------------------------------------------------------------------
# Limits (BUILD-SPEC 2.8: ledger 16 MiB, plan 4 MiB)
# ---------------------------------------------------------------------------

def padded(head, size, pad="x"):
    """A document of exactly ``size`` bytes: ``head`` (an object's members, no closing brace) plus padding."""
    frame = head + ',"p":""}'
    room = size - len(frame.encode("utf-8"))
    count, rest = divmod(room, len(pad.encode("utf-8")))
    doc = head + ',"p":"' + pad * count + "x" * rest + '"}'
    assert len(doc.encode("utf-8")) == size, (len(doc.encode("utf-8")), size)
    return doc


class LimitTests(StoreCase):
    def stores(self):
        settings = config.Settings.from_env(_harness.dev_environ(self.dir, 8123))
        self.assertEqual((settings.put_limit("ledger"), settings.put_limit("plan")), (16 * MIB, 4 * MIB))
        return store.open_stores(settings, self.clock)

    def test_a_plan_of_exactly_4_mib_is_stored_and_one_byte_more_is_refused(self):
        document = self.stores()["plan"]
        exact = padded('{"banks":[]', 4 * MIB)
        self.assertEqual(document.save(0, exact, "mika").bytes, 4 * MIB)
        self.assertEqual(document.read().body, envelope(1, exact))
        with self.assertRaises(store.TooLarge) as large:
            document.save(1, padded('{"banks":[]', 4 * MIB + 1), "mika")
        self.assertEqual((large.exception.status, large.exception.code), (413, "body_too_large"))
        self.assertEqual(document.read().body, envelope(1, exact))
        self.assertNoLitter("plan")

    def test_a_ledger_of_exactly_16_mib_is_stored_and_one_byte_more_is_refused(self):
        document = self.stores()["ledger"]
        document.save(0, ledger(3, "small"), "mika")
        exact = padded('{"tx":[]', 16 * MIB)
        self.assertEqual(document.save(1, exact, "mika").bytes, 16 * MIB)
        self.assertEqual(len(document.read().body), 16 * MIB + len(envelope(2, "")))
        before = self.kept()
        with self.assertRaises(store.TooLarge) as large:
            document.save(2, padded('{"tx":[]', 16 * MIB + 1), "mika")
        self.assertEqual((large.exception.status, large.exception.code), (413, "body_too_large"))
        self.assertEqual((document.read().rev, self.kept()), (2, before))
        self.assertEqual(document.status()["state"], "ok", "a document at its limit still reads back")
        self.assertEqual(store.open_stores(config.Settings.from_env(_harness.dev_environ(self.dir, 8123)),
                                           self.clock)["ledger"].read().rev, 2)

    def test_the_limit_counts_bytes_not_letters(self):
        document = self.stores()["plan"]
        cyrillic = padded('{"banks":[]', 4 * MIB, pad="я")
        self.assertLess(len(cyrillic), 4 * MIB * 0.6)
        self.assertEqual(document.save(0, cyrillic, "mika").bytes, 4 * MIB)
        with self.assertRaises(store.TooLarge):
            document.save(1, cyrillic[:-2] + 'x"}', "mika")             # one byte more
        self.assertEqual(document.read().rev, 1)

    def test_white_space_around_a_document_does_not_count_against_it_and_too_large_is_said_before_stale(self):
        document = self.stores()["plan"]
        exact = padded('{"banks":[]', 4 * MIB)
        self.assertEqual(document.save(0, "\n" + exact + "\n", "mika").bytes, 4 * MIB)
        with self.assertRaises(store.TooLarge):
            document.save(0, padded('{"banks":[]', 4 * MIB + 1), "mika")    # behind as well: the size is said first


class DoorLimitTests(DoorCase):
    def test_a_body_of_exactly_the_plans_limit_is_read_and_one_byte_more_is_refused_unread(self):
        def sized(size, base):
            head = b'{"base":%d,"doc":"{\\"banks\\":[],\\"p\\":\\"' % base
            tail = b'\\"}"}'
            return head + b"x" * (size - len(head) - len(tail)) + tail
        exact = sized(4 * MIB, 0)
        self.assertEqual(len(exact), 4 * MIB)
        self.assertSaved(self.put_raw(PLAN, exact), 1)
        stored = self.stored("plan")
        self.assertRefused(self.put_raw(PLAN, sized(4 * MIB + 1, 1)), 413, "body_too_large")
        self.assertEqual(self.stored("plan"), stored)
        self.assertEqual(self.get(PLAN).json()["rev"], 1)


# ---------------------------------------------------------------------------
# Whole or not at all (design 1.4 "Atomic writes")
# ---------------------------------------------------------------------------

#: A writer that dies - os._exit, no cleanup - at a chosen step of a save. argv: directory, kind, when, base, doc.
#: ``when`` is "before:<suffix>" or "after:<suffix>": the rename whose target ends with that suffix.
DYING_WRITER = r'''
import os, sys
from moneyd import store
directory, kind, when, base, doc = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
moment, suffix = when.split(":", 1)
rename = os.replace
def dying(source, target, *rest, **more):
    if moment == "before" and target.endswith(suffix):
        os._exit(9)
    rename(source, target, *rest, **more)
    if moment == "after" and target.endswith(suffix):
        os._exit(9)
os.replace = dying
store.DocStore(directory, kind).save(base, doc, "mika")
os._exit(0)
'''


class AtomicTests(StoreCase):
    def die(self, when, base, doc, kind="ledger"):
        done = subprocess.run([sys.executable, "-c", DYING_WRITER, self.dir, kind, when, str(base), doc], cwd=CHECKOUT,
                              env=child_environ(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=60)
        self.assertEqual(done.returncode, 9, done.stderr.decode("utf-8", "replace"))

    def test_a_temporary_file_is_never_read_however_good_it_looks_and_goes_with_the_next_save(self):
        self.ledger.save(0, ledger(3, "stored"), "mika")
        stored = self.ledger.read().body
        left = [self.path("ledger", "current.json.tmp-4242-deadbeef"),
                self.path("ledger", "snapshots", "day-2026-10-07-rev000008.json.gz.tmp-4242-deadbeef")]
        write_new(left[0], envelope(9, ledger(500, "newer, larger, and never renamed into place")))
        write_new(left[1], gzip.compress(envelope(8, ledger(400))))
        for document in (self.ledger, self.open("ledger")):
            self.assertEqual(document.read().body, stored)
            self.assertEqual(document.snapshots(), [], "half a snapshot is not a snapshot")
            self.assertEqual(document.status()["temporaryFiles"], 2)
        report = store.doctor(self.dir, "dev", self.clock)
        self.assertIn("2 temporary file(s)", " ".join(report["problems"]))
        with self.assertRaises(store.Stale):
            self.ledger.save(9, ledger(1), "mika")                      # the left-over's revision is nobody's
        self.assertEqual(self.ledger.save(1, ledger(3, "next"), "mika").rev, 2)
        self.assertEqual([path for path in left if os.path.exists(path)], [])
        self.assertNoLitter()

    def test_a_writer_that_dies_before_the_rename_leaves_the_stored_document_whole(self):
        self.ledger.save(0, ledger(3, "stored"), "mika")
        self.ledger.save(1, ledger(3, "stored twice"), "mika")          # the day's copy exists: one rename per save now
        stored, copies = self.ledger.read().body, self.names()
        self.die("before:current.json", 2, ledger(900, "half done"))
        self.assertEqual(read_file(self.ledger.path), stored)
        beside, _copies = self.kept()
        self.assertEqual(len([name for name in beside if ".tmp-" in name]), 1, beside)
        for document in (self.ledger, self.open("ledger")):
            self.assertEqual(document.read().body, stored)
        self.assertEqual(self.names(), copies)
        self.assertEqual(self.open("ledger").save(2, ledger(3, "after the crash"), "mika").rev, 3)
        self.assertNoLitter()

    def test_a_first_save_that_dies_before_the_rename_was_never_made(self):
        self.die("before:current.json", 0, ledger(3))
        self.assertEqual(self.ledger.read().body, EMPTY)
        self.assertFalse(os.path.lexists(self.path("ledger", "EVER_SAVED")), "nothing was saved, so nothing is lost")
        self.assertEqual(self.ledger.save(0, ledger(3), "mika").rev, 1)
        self.assertNoLitter()

    def test_a_first_save_that_dies_right_after_the_rename_is_stored_and_the_next_save_writes_the_marker(self):
        doc = ledger(3, "made it to disk")
        self.die("after:current.json", 0, doc)
        self.assertEqual(self.ledger.read().rev, 1)
        self.assertTrue(read_file(self.ledger.path).startswith(b'{"rev":1,"doc":' + doc.encode("utf-8")))
        self.assertEqual(self.ledger.status()["state"], "ok")
        self.assertIn("EVER_SAVED marker is missing", " ".join(store.doctor(self.dir, "dev", self.clock)["problems"]))
        self.assertEqual(self.ledger.save(1, ledger(3), "mika").rev, 2)
        self.assertTrue(os.path.isfile(self.path("ledger", "EVER_SAVED")))
        self.assertEqual(store.doctor(self.dir, "dev", self.clock)["problems"], [])

    def test_a_writer_that_dies_while_copying_aside_leaves_no_half_snapshot_and_the_document_untouched(self):
        self.ledger.save(0, ledger(3, "stored"), "mika")
        stored = self.ledger.read().body
        self.die("before:.json.gz", 1, ledger(3, "never written"))
        self.assertEqual(read_file(self.ledger.path), stored)
        self.assertEqual(self.ledger.snapshots(), [])
        self.assertEqual(len([name for name in self.names() if ".tmp-" in name]), 1)
        saved = self.ledger.save(1, ledger(3, "after the crash"), "mika")
        self.assertEqual((saved.rev, saved.snapshot), (2, "day-2026-10-07-rev000001.json.gz"))
        self.assertEqual(self.unpack(saved.snapshot), stored)
        self.assertNoLitter()

    def test_a_reader_never_sees_part_of_a_document(self):
        small, large = ledger(1, "s"), ledger(2000, "L" * 40)
        self.assertGreater(len(large), 100 * 1024)
        other = self.open("ledger")
        stop, wrong, seen = threading.Event(), [], []

        def read_on():
            while not stop.is_set():
                try:
                    raw = read_file(self.ledger.path)               # as the GET door and a backup's tar read it
                except FileNotFoundError:
                    continue
                if not (raw.startswith(b'{"rev":') and raw.endswith(b'Z"}')):
                    wrong.append("a file of %d bytes that is not one whole envelope" % len(raw))
                    continue
                try:
                    rev = json.loads(raw.decode("utf-8"))["rev"]
                    body_ = other.read().body                       # and as another process's store reads it
                    json.loads(body_.decode("utf-8"))
                except (ValueError, store.StoreError) as error:
                    wrong.append(repr(error)[:120])
                    continue
                seen.append(rev)

        reader = threading.Thread(target=read_on)
        reader.start()
        try:
            for rev in range(80):
                self.ledger.save(rev, large if rev % 2 else small, "mika")
        finally:
            stop.set()
            reader.join(30)
        self.assertFalse(reader.is_alive())
        self.assertEqual(wrong, [])
        self.assertGreater(len(seen), 0)
        self.assertEqual(seen, sorted(seen), "revisions only ever go up for a reader")

    def test_a_disk_that_refuses_is_507_and_leaves_the_stored_document_whole_and_no_half_file(self):
        self.ledger.save(0, ledger(3, "stored"), "mika")
        faults = {
            "no room while writing": ("write", OSError(errno.ENOSPC, "No space left on device")),
            "an error while syncing": ("fsync", OSError(errno.EIO, "Input/output error")),
            "the rename refused": ("replace", OSError(errno.EROFS, "Read-only file system")),
        }
        rev = 1
        for why, (call, fault) in faults.items():
            # Twice: on a new day the fault meets the copy of the day first; later that day, the document itself.
            for moment in ("while the day's copy is written", "while the document is written"):
                with self.subTest(why=why, moment=moment):
                    if moment.startswith("while the day"):
                        self.clock.tick(days=1)
                    stored, kept = self.ledger.read().body, self.kept()
                    with mock.patch.object(store.os, call, side_effect=fault):
                        with self.assertRaises(store.StorageFailed) as failed:
                            self.ledger.save(rev, ledger(3, "refused by the disk"), "mika")
                    self.assertEqual((failed.exception.status, failed.exception.code), (507, "storage_failed"))
                    self.assertEqual(read_file(self.ledger.path), stored)
                    self.assertEqual(self.kept(), kept, "no copy, no temporary file, the marker as it was")
                    saved = self.ledger.save(rev, ledger(3, "revision %d" % (rev + 1)), "mika")
                    self.assertEqual(saved.rev, rev + 1)
                    if moment.startswith("while the day"):
                        self.assertEqual(self.unpack(saved.snapshot), stored)
                    else:
                        self.assertIsNone(saved.snapshot)
                    rev += 1

    def test_a_first_save_the_disk_refuses_leaves_a_document_that_was_never_saved(self):
        with mock.patch.object(store.os, "fsync", side_effect=OSError(errno.EIO, "Input/output error")):
            with self.assertRaises(store.StorageFailed):
                self.plan.save(0, plan(banks=1), "mika")
        self.assertEqual(self.kept("plan"), ([], []))
        self.assertEqual(self.plan.read().body, EMPTY)
        self.assertEqual(self.plan.save(0, plan(banks=1), "mika").rev, 1)

    def test_a_data_directory_that_vanished_is_not_quietly_made_anew(self):
        self.ledger.save(0, ledger(3), "mika")
        shutil.rmtree(self.dir)
        with self.assertRaises(store.StorageFailed):
            self.ledger.save(1, ledger(3), "mika")
        with self.assertRaises(store.StorageFailed):
            self.open("plan").save(0, plan(banks=1), "mika")
        self.assertFalse(os.path.exists(self.dir))


# ---------------------------------------------------------------------------
# Fail closed (BUILD-SPEC 2.5; docs/security.md "Damaged state fails closed")
# ---------------------------------------------------------------------------

class MarkerTests(StoreCase):
    def marker(self, kind="ledger"):
        return self.path(kind, "EVER_SAVED")

    def test_only_an_accepted_save_writes_the_marker(self):
        refusals = [
            (store.BadDoc, self.ledger, 0, "not json"),
            (store.BadDoc, self.ledger, "0", ledger(1)),
            (store.Stale, self.ledger, 3, ledger(1)),
            (store.TooLarge, self.open("ledger", max_bytes=10), 0, ledger(1)),
            (store.NoSpace, self.open("ledger", free_bytes=lambda path: 0), 0, ledger(1)),
        ]
        for refusal, document, base, doc in refusals:
            with self.subTest(refusal=refusal.__name__):
                with self.assertRaises(refusal):
                    document.save(base, doc, "mika")
                self.assertEqual(self.kept(), ([], []))
                self.assertEqual(self.ledger.read().body, EMPTY, "still never saved")
        self.assertEqual(self.ledger.save(0, ledger(1), "mika").rev, 1)
        self.assertEqual(self.kept()[0], ["EVER_SAVED", "current.json"])
        self.assertFalse(os.path.lexists(self.marker("plan")), "the marker is each document's own")

    def test_once_saved_a_missing_file_is_lost_and_never_revision_0(self):
        self.ledger.save(0, ledger(3), "mika")
        self.ledger.save(1, ledger(3), "mika")
        os.unlink(self.ledger.path)
        for document in (self.ledger, self.open("ledger")):
            for attempt in (document.read, document.revision, lambda: document.save(0, ledger(1), "mika"),
                            lambda: document.save(2, ledger(1), "mika")):
                with self.assertRaises(store.Damaged) as lost:
                    attempt()
                self.assertEqual((lost.exception.status, lost.exception.code), (503, "storage_damaged"))
        self.assertFalse(os.path.exists(self.ledger.path), "nothing was written in its place")
        self.assertEqual(self.ledger.status()["state"], "damaged")
        self.assertEqual(self.plan.read().body, EMPTY)

    def test_without_a_marker_and_without_a_file_the_document_was_never_saved(self):
        self.ledger.save(0, ledger(3), "mika")
        os.unlink(self.ledger.path)
        os.unlink(self.marker())
        self.assertEqual(self.open("ledger").read().body, EMPTY)
        self.assertEqual(self.open("ledger").status()["state"], "empty")

    def test_a_file_cut_at_any_byte_is_damaged_and_takes_no_save(self):
        self.ledger.save(0, ledger(2, "Кафе"), "mika")
        self.ledger.save(1, ledger(2, "Кафе"), "mika")
        good = read_file(self.ledger.path)
        self.assertLess(len(good), 400)
        for length in range(len(good)):
            write_new(self.ledger.path, good[:length])
            with self.assertRaises(store.Damaged, msg="cut to %d of %d bytes" % (length, len(good))):
                self.ledger.read()
            if length % 16 == 0:
                for base in (0, 2):
                    with self.assertRaises(store.Damaged):
                        self.ledger.save(base, ledger(1), "mika")
                self.assertEqual(read_file(self.ledger.path), good[:length])
        write_new(self.ledger.path, good)
        self.assertEqual(self.ledger.read().rev, 2)


class DamagedDoorTests(DoorCase):
    def setUp(self):
        super().setUp()
        for rev in range(3):
            self.assertSaved(self.put(LEDGER, rev, ledger(2, "real")), rev + 1)
        self.assertSaved(self.put(PLAN, 0, plan(banks=2)), 1)
        self.good = self.stored()

    def damages(self):
        good = self.good
        doc = ledger(2, "real").encode("utf-8")
        when = b'"updatedAt":"2026-10-07T12:00:00.000Z"'
        return {
            "zero-length": b"",
            "white space and nothing else": b" \n",
            "cut in the middle": good[:len(good) // 2],
            "its last byte gone": good[:-1],
            "its first byte gone": good[1:],
            "a list": b"[]",
            "a word": b'"current"',
            "a number": b"3",
            "null": b"null",
            "the bare document, no envelope": doc,
            "the laptop tool's file": doc[:-1] + b',"rev":3}',
            "the members in another order": b'{"doc":' + doc + b',"rev":3,' + when + b"}",
            "no rev": b'{"doc":' + doc + b"," + when + b"}",
            "revision 0": b'{"rev":0,"doc":' + doc + b"," + when + b"}",
            "a revision below zero": b'{"rev":-3,"doc":' + doc + b"," + when + b"}",
            "the revision as text": b'{"rev":"3","doc":' + doc + b"," + when + b"}",
            "the revision as a fraction": b'{"rev":3.0,"doc":' + doc + b"," + when + b"}",
            "the revision with a zero in front": b'{"rev":03,"doc":' + doc + b"," + when + b"}",
            "a revision of seventeen digits": b'{"rev":12345678901234567,"doc":' + doc + b"," + when + b"}",
            "the document as a string": b'{"rev":3,"doc":' + json.dumps(doc.decode("utf-8")).encode("utf-8") + b"," + when + b"}",
            "null for a document": b'{"rev":3,"doc":null,' + when + b"}",
            "a list for a document": b'{"rev":3,"doc":[],' + when + b"}",
            "an object that is no ledger": b'{"rev":3,"doc":{},' + when + b"}",
            "the other document": b'{"rev":3,"doc":' + plan(banks=2).encode("utf-8") + b"," + when + b"}",
            "no updatedAt": b'{"rev":3,"doc":' + doc + b"}",
            "updatedAt null": b'{"rev":3,"doc":' + doc + b',"updatedAt":null}',
            "updatedAt that is no time": b'{"rev":3,"doc":' + doc + b',"updatedAt":"yesterday"}',
            "updatedAt in another zone": b'{"rev":3,"doc":' + doc + b',"updatedAt":"2026-10-07T16:00:00.000+04:00"}',
            "a member after updatedAt": b'{"rev":3,"doc":' + doc + b"," + when + b',"by":"mika"}',
            "something after it": good + b"x",
            "two envelopes": good + good,
            "written out prettily": json.dumps(json.loads(good.decode("utf-8")), indent=2).encode("utf-8"),
            "a byte order mark first": b"\xef\xbb\xbf" + good,
            "bytes that are not text": b"\xff\xfe" + good,
            "NaN inside": b'{"rev":3,"doc":{"tx":[NaN]},' + when + b"}",
            "nested deeper than a document can be": b'{"rev":3,"doc":{"tx":[],"x":' + b"[" * 70 + b"]" * 70 + b"}," + when + b"}",
        }

    def assertShut(self, why):
        self.assertRefused(self.get(LEDGER), 503, "storage_damaged")
        for base in (3, 0, 4):
            self.assertRefused(self.put(LEDGER, base, ledger(1, "over the damage")), 503, "storage_damaged")
        self.assertEqual(self.get(PLAN).status, 200, "%s: the plan is not the ledger" % why)

    def test_every_damage_of_the_stored_file_is_503_on_get_and_put_and_the_file_is_left_as_it_is(self):
        for why, content in self.damages().items():
            with self.subTest(why=why):
                write_new(self.file(), content)
                self.assertShut(why)
                self.assertEqual(self.stored(), content, "nothing is written over a damaged file")
        self.assertEqual(self.copies(), ["day-2026-10-07-rev000001.json.gz"], "and no copy was taken of it")
        write_new(self.file(), self.good)
        self.assertEqual(self.get(LEDGER).body, self.good)
        self.assertSaved(self.put(LEDGER, 3, ledger(2, "whole again")), 4)

    def test_a_file_that_is_missing_after_a_save_is_503_and_stays_missing(self):
        os.unlink(self.file())
        self.assertShut("missing")
        self.assertFalse(os.path.exists(self.file()))
        self.assertTrue(os.path.isfile(self.file(name="EVER_SAVED")))

    def test_a_folder_or_an_unreadable_file_in_its_place_is_503_too(self):
        os.unlink(self.file())
        os.mkdir(self.file())
        self.assertShut("a folder")
        self.assertTrue(os.path.isdir(self.file()))
        os.rmdir(self.file())
        if os.geteuid() == 0:
            return                      # nothing is unreadable to root
        write_new(self.file(), self.good)
        os.chmod(self.file(), 0)
        try:
            self.assertShut("unreadable")
        finally:
            os.chmod(self.file(), 0o600)
        self.assertEqual(self.stored(), self.good)

    def test_restore_is_the_one_write_a_damaged_document_takes_and_the_damaged_file_is_kept(self):
        self.stand.clock.tick(hours=1)
        damaged = self.good[:50]
        write_new(self.file(), damaged)
        restored = self.stand.ctl("restore", "ledger", "day-2026-10-07-rev000001.json.gz", stdin="dev\n")
        self.assertEqual(restored.status, 0, restored.err)
        answer = self.get(LEDGER)
        self.assertEqual(answer.body, envelope(4, ledger(2, "real"), "2026-10-07T13:00:00.000Z"),
                         "above the revision the damaged file still named, so no open page can save over it")
        self.assertEqual(read_file(self.file(name="current.json.damaged-20261007T130000Z")), damaged)
        self.assertRefused(self.put(LEDGER, 3, ledger(1)), 409, "money_stale")
        self.assertSaved(self.put(LEDGER, 4, ledger(3)), 5)


class DoctorTests(DoorCase):
    """BUILD-SPEC 2.5: for a damaged document "``ctl doctor`` names the newest snapshot"."""

    def damage(self):
        write_new(self.file(), self.stored()[:40])

    def test_doctor_says_so_when_there_is_no_snapshot_to_go_back_to(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(30)), 1)
        self.damage()
        sick = self.stand.ctl("doctor")
        self.assertEqual(sick.status, 1)
        self.assertIn("ledger: DAMAGED", sick.out)
        self.assertIn("There is no snapshot to restore from.", sick.out)
        self.assertNotIn("ctl restore", sick.out)

    def test_doctor_names_the_newest_of_several_snapshots_with_the_command_that_brings_it_back(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(30)), 1)
        self.assertSaved(self.put(LEDGER, 1, ledger(30)), 2)                # day-2026-10-07-rev000001
        self.stand.clock.tick(days=1)
        self.assertSaved(self.put(LEDGER, 2, ledger(30)), 3)                # day-2026-10-08-rev000002
        self.stand.clock.tick(hours=1)
        self.assertSaved(self.put(LEDGER, 3, ledger(2)), 4)                 # shrink-20261008T130000Z-rev000003
        self.assertEqual(self.copies(), ["day-2026-10-07-rev000001.json.gz", "day-2026-10-08-rev000002.json.gz",
                                         "shrink-20261008T130000Z-rev000003.json.gz"])
        self.damage()
        sick = self.stand.ctl("doctor")
        self.assertEqual(sick.status, 1)
        self.assertIn("The newest snapshot is shrink-20261008T130000Z-rev000003.json.gz", sick.out)
        self.assertIn("ctl restore ledger shrink-20261008T130000Z-rev000003.json.gz", sick.out)
        self.assertEqual(self.stand.ctl("restore", "ledger", "shrink-20261008T130000Z-rev000003.json.gz",
                                        stdin="dev\n").status, 0)
        self.assertEqual(self.get(LEDGER).json()["rev"], 5)
        self.assertEqual(self.stand.ctl("doctor").status, 0)

    def test_doctor_names_the_snapshot_taken_last_not_the_one_a_restore_set_aside_before_it(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(30, "good")), 1)
        self.assertSaved(self.put(LEDGER, 1, ledger(30, "good")), 2)        # day-2026-10-07-rev000001
        self.stand.clock.tick(days=1)
        self.assertSaved(self.put(LEDGER, 2, ledger(2, "emptied by a page that loaded badly")), 3)   # day-...-08-rev000002
        self.stand.clock.tick(hours=21)                                     # 9 October, 09:00 UTC
        back = self.stand.ctl("restore", "ledger", "day-2026-10-08-rev000002.json.gz", stdin="dev\n")
        self.assertEqual(back.status, 0, back.err)                          # keeps restore-20261009T090000Z-rev000003
        self.stand.clock.tick(hours=5)                                      # the same day, 14:00 UTC
        self.assertSaved(self.put(LEDGER, 4, ledger(31, "good, and worked on")), 5)     # day-2026-10-09-rev000004
        self.assertEqual(self.copies(), ["day-2026-10-07-rev000001.json.gz", "day-2026-10-08-rev000002.json.gz",
                                         "day-2026-10-09-rev000004.json.gz", "restore-20261009T090000Z-rev000003.json.gz"])
        self.damage()
        sick = self.stand.ctl("doctor")
        self.assertEqual(sick.status, 1)
        # The copy taken last, of the highest revision, is the restored ledger as 9 October's first save
        # found it. The restore- copy is older: it is the emptied ledger that the restore replaced.
        self.assertIn("ctl restore ledger day-2026-10-09-rev000004.json.gz", sick.out,
                      "doctor sends the operator back to the document that the restore had just replaced")
        self.assertEqual(self.stand.stores["ledger"].snapshots()[0].name, "day-2026-10-09-rev000004.json.gz")


# ---------------------------------------------------------------------------
# The copy of each day (BUILD-SPEC 2.8; design 1.4 "Snapshots": the UTC day)
# ---------------------------------------------------------------------------

class DayCopyTests(StoreCase):
    def test_the_first_save_of_each_utc_day_copies_the_document_as_the_day_found_it(self):
        self.clock.set(datetime.datetime(2026, 10, 7, 23, 59, 59, 998000, tzinfo=UTC))
        self.assertIsNone(self.ledger.save(0, ledger(4, "one"), "mika").snapshot, "nothing to copy yet")
        one = read_file(self.ledger.path)
        self.clock.tick(milliseconds=1)                                     # 23:59:59.999
        self.assertEqual(self.ledger.save(1, ledger(4, "two"), "mika").snapshot, "day-2026-10-07-rev000001.json.gz")
        two = read_file(self.ledger.path)
        self.clock.tick(milliseconds=1)                                     # midnight, to the millisecond
        self.assertEqual(self.ledger.save(2, ledger(4, "three"), "misha").snapshot, "day-2026-10-08-rev000002.json.gz")
        for _later in range(3):
            self.clock.tick(hours=7, minutes=59)
            rev = self.ledger.revision()
            self.assertIsNone(self.ledger.save(rev, ledger(4, "later"), "vanya").snapshot, "one copy a day")
        six = read_file(self.ledger.path)
        self.clock.tick(minutes=3)                                          # 9 October, 00:00
        self.assertEqual(self.ledger.save(6, ledger(4, "next day"), "mika").snapshot, "day-2026-10-09-rev000006.json.gz")
        self.assertEqual(self.names(), ["day-2026-10-07-rev000001.json.gz", "day-2026-10-08-rev000002.json.gz",
                                        "day-2026-10-09-rev000006.json.gz"])
        self.assertEqual([self.unpack(name) for name in self.names()], [one, two, six])
        for name in self.names():
            self.assertRegex(name, r"^day-\d{4}-\d{2}-\d{2}-rev\d{6}\.json\.gz$")
        newest = self.ledger.snapshots()[0]
        self.assertEqual((newest.name, newest.kind, newest.rev, newest.taken),
                         ("day-2026-10-09-rev000006.json.gz", "day", 6, datetime.datetime(2026, 10, 9, tzinfo=UTC)))
        self.assertEqual(self.ledger.check_snapshot(newest.name), (6, 4))

    def test_the_day_is_the_utc_day_whatever_zone_the_clock_speaks(self):
        yerevan = datetime.timezone(datetime.timedelta(hours=4))
        self.clock.set(datetime.datetime(2026, 10, 8, 3, 58, tzinfo=yerevan))       # 7 October, 23:58 UTC
        self.ledger.save(0, ledger(4), "mika")
        self.assertEqual(self.ledger.save(1, ledger(4), "mika").snapshot, "day-2026-10-07-rev000001.json.gz")
        self.clock.now = datetime.datetime(2026, 10, 8, 3, 59, tzinfo=yerevan)      # still 7 October in UTC
        self.assertIsNone(self.ledger.save(2, ledger(4), "mika").snapshot)
        self.clock.now = datetime.datetime(2026, 10, 8, 4, 0, tzinfo=yerevan)       # 8 October, 00:00 UTC
        self.assertEqual(self.ledger.save(3, ledger(4), "mika").snapshot, "day-2026-10-08-rev000003.json.gz")
        self.clock.now = datetime.datetime(2026, 10, 8, 23, 30, tzinfo=yerevan)     # 8 October, 19:30 UTC
        self.assertIsNone(self.ledger.save(4, ledger(4), "mika").snapshot)
        self.assertTrue(read_file(self.ledger.path).endswith(b'"updatedAt":"2026-10-08T19:30:00.000Z"}'))

    def test_a_refused_save_takes_no_copy_and_does_not_use_up_the_days_copy(self):
        self.ledger.save(0, ledger(4, "day one"), "mika")
        stored = read_file(self.ledger.path)
        self.clock.tick(days=1)
        refusals = [(store.Stale, self.ledger, 0, ledger(1)), (store.BadDoc, self.ledger, 1, "{}"),
                    (store.TooLarge, self.open("ledger", max_bytes=10), 1, ledger(1)),
                    (store.NoSpace, self.open("ledger", free_bytes=lambda path: 64 * MIB), 1, ledger(1))]
        for refusal, document, base, doc in refusals:
            with self.assertRaises(refusal):
                document.save(base, doc, "mika")
            self.assertEqual(self.names(), [])
        saved = self.ledger.save(1, ledger(4, "day two"), "mika")
        self.assertEqual(saved.snapshot, "day-2026-10-08-rev000001.json.gz")
        self.assertEqual(self.unpack(saved.snapshot), stored)

    def test_a_day_on_which_nothing_is_saved_has_no_copy_and_each_document_has_its_own(self):
        self.ledger.save(0, ledger(4), "mika")
        self.plan.save(0, plan(banks=2), "mika")
        self.clock.tick(days=3)
        self.assertEqual(self.plan.save(1, plan(banks=3), "mika").snapshot, "day-2026-10-10-rev000001.json.gz")
        self.assertEqual((self.names("ledger"), self.names("plan")), ([], ["day-2026-10-10-rev000001.json.gz"]))
        self.ledger.read()
        self.assertEqual(self.names("ledger"), [], "reading is not a save")


# ---------------------------------------------------------------------------
# The copy before a save that drops most rows (BUILD-SPEC 2.8; money.ts: SMALL = 20, fewer than half)
# ---------------------------------------------------------------------------

class ShrinkCopyTests(StoreCase):
    def fresh(self, kind):
        """A document in a directory of its own, already past its day's copy."""
        directory = tempfile.mkdtemp(prefix="money-store-")
        self.addCleanup(shutil.rmtree, directory, True)
        store.prepare_data_dir(directory, "dev")
        return store.DocStore(directory, kind, self.clock)

    def shrinks(self, document, before, after):
        document.save(0, before, "mika")
        document.save(1, before, "mika")                    # takes the day's copy
        stored = read_file(document.path)
        snapshot = document.save(2, after, "mika").snapshot
        if snapshot is None:
            return False
        self.assertRegex(snapshot, r"^shrink-20261007T120000Z-rev000002\.json\.gz$")
        self.assertEqual(gzip.decompress(read_file(os.path.join(document.directory, "snapshots", snapshot))), stored,
                         "the copy is the document as it stood")
        return True

    def test_more_than_twenty_rows_and_fewer_than_half_of_them_left(self):
        table = [(21, 10, True), (21, 11, False), (20, 9, False), (20, 0, False), (22, 10, True), (22, 11, False),
                 (40, 19, True), (40, 20, False), (101, 50, True), (101, 51, False), (1000, 499, True), (1000, 500, False),
                 (21, 0, True), (21, 21, False), (21, 400, False)]
        for before, after, expected in table:
            with self.subTest(before=before, after=after):
                self.assertEqual(self.shrinks(self.fresh("ledger"), ledger(before), ledger(after)), expected)

    def test_the_rows_of_a_plan_are_those_of_its_five_lists_together(self):
        spread = dict(banks=5, inflows=5, team=5, taxes=3, other=3)         # 21 rows
        self.assertTrue(self.shrinks(self.fresh("plan"), plan(**spread), plan(banks=5, inflows=5)))            # 10 left
        self.assertFalse(self.shrinks(self.fresh("plan"), plan(**spread), plan(banks=5, inflows=5, taxes=1)))  # 11 left
        self.assertTrue(self.shrinks(self.fresh("plan"), plan(**spread), plan()))
        self.assertFalse(self.shrinks(self.fresh("plan"), plan(banks=4, inflows=4, team=4, taxes=4, other=4), plan()))
        self.assertTrue(self.shrinks(self.fresh("plan"), plan(other=21), plan(banks=10)))

    def test_a_list_under_another_name_is_not_rows_and_a_list_that_is_not_one_counts_nothing(self):
        many_elsewhere = json.dumps({"banks": [{"id": 1}], "archive": [{"id": i} for i in range(60)]})
        self.assertFalse(self.shrinks(self.fresh("plan"), many_elsewhere, plan()))
        not_lists = json.dumps({"banks": [{"id": i} for i in range(11)], "team": {"a": 1}, "taxes": "none", "other": 30,
                                "inflows": [{"id": i} for i in range(10)]})                   # 21 rows, all real
        self.assertTrue(self.shrinks(self.fresh("plan"), not_lists, plan(banks=10)))
        self.assertFalse(self.shrinks(self.fresh("ledger"), json.dumps({"tx": [1], "inbox": list(range(60))}),
                                      json.dumps({"tx": [], "inbox": []})))
        twice = '{"tx":[1,2,3],"tx":[%s]}' % ",".join("0" for _row in range(21))              # the last tx counts: 21 rows
        self.assertTrue(self.shrinks(self.fresh("ledger"), twice, '{"tx":[1,2,3,4,5,6,7,8,9,10]}'))

    def test_a_save_that_empties_the_document_keeps_what_it_replaced_also_as_the_first_save_of_a_day(self):
        self.ledger.save(0, ledger(60, "the whole ledger"), "mika")
        stored = read_file(self.ledger.path)
        self.clock.tick(days=1)
        emptied = self.ledger.save(1, ledger(0), "mika")
        self.assertIsNotNone(emptied.snapshot)
        self.assertEqual(self.unpack(emptied.snapshot), stored)
        self.assertEqual(self.ledger.check_snapshot(emptied.snapshot), (1, 60))

    def test_a_save_that_takes_a_before_shrink_copy_leaves_a_line_in_the_security_log_and_no_contents(self):
        # docs/security.md, the table of events: "doc-shrunk - a save dropped more than half of a document's
        # rows; what it replaced is kept as a shrink- snapshot".
        journal = log.SecurityLog(self.dir, self.clock)
        document = self.open("ledger", security_log=journal)
        marked = lambda rows: json.dumps({"tx": [{"id": index, "l": CANARY} for index in range(rows)], CANARY: CANARY})
        shrunk = lambda: [entry for entry in journal.tail(50) if entry["event"] == "doc-shrunk"]
        document.save(0, marked(60), "mika")
        document.save(1, marked(60), "mika")                # the day's copy
        document.save(2, marked(31), "mika")                # 31 of 60 left: editing, no line
        self.assertEqual(shrunk(), [])
        emptied = document.save(3, marked(2), "misha")      # 2 of 31 left
        self.assertEqual([(entry["doc"], entry["by"], entry["rev"], entry["rows"], entry["fromRows"], entry["snapshot"])
                          for entry in shrunk()], [("ledger", "misha", 4, 2, 31, emptied.snapshot)])
        self.assertRegex(emptied.snapshot, r"^shrink-\d{8}T\d{6}Z-rev000003\.json\.gz$")
        document.save(4, marked(60), "mika")                # growing back is no line either
        self.assertEqual(len(shrunk()), 1)
        self.assertNotIn(CANARY, json.dumps(journal.tail(50)))
        self.assertNotIn(CANARY, read_file(journal.path).decode("utf-8"))


# ---------------------------------------------------------------------------
# Retention: newest 90 day copies, newest 50 before-shrink copies (BUILD-SPEC 2.8)
# ---------------------------------------------------------------------------

class RetentionTests(StoreCase):
    def test_the_newest_90_day_copies_and_the_newest_50_before_shrink_copies_are_kept(self):
        settings = config.Settings.from_env(_harness.dev_environ(self.dir, 8123))
        self.assertEqual((settings.keep_day_snapshots, settings.keep_shrink_snapshots), (90, 50))
        document = store.open_stores(settings, self.clock)["ledger"]
        of = lambda kind: sorted(snapshot.name for snapshot in document.snapshots() if snapshot.kind == kind)
        document.save(0, ledger(60), "mika")
        rev, days, shrinks = 1, [], []
        for _day in range(95):
            self.clock.tick(days=1)
            days.append(document.save(rev, ledger(60), "mika").snapshot)
            rev += 1
        self.assertEqual(len(set(days)), 95)
        self.assertEqual(of("day"), sorted(days[5:]), "the five oldest went")
        for _time in range(55):
            self.clock.tick(seconds=1)
            shrinks.append(document.save(rev, ledger(2), "mika").snapshot)
            self.clock.tick(seconds=1)
            self.assertIsNone(document.save(rev + 1, ledger(60), "mika").snapshot)
            rev += 2
        self.assertEqual(len(set(shrinks)), 55)
        self.assertEqual(of("shrink"), sorted(shrinks[5:]))
        self.assertEqual(of("day"), sorted(days[5:]), "before-shrink copies push no day copy out")
        # What a restore set aside is a person's doing and stays, however many copies come after it.
        aside = document.restore(days[-1], "ctl").kept
        rev = document.revision()
        for _time in range(3):
            self.clock.tick(days=1)
            document.save(rev, ledger(60), "mika")
            self.clock.tick(seconds=1)
            document.save(rev + 1, ledger(2), "mika")
            rev += 2
        self.assertEqual((len(of("day")), len(of("shrink")), of("restore")), (90, 50, [aside]))
        self.assertEqual(self.names("plan"), [])
        self.assertEqual(document.read().rev, rev)

    def test_a_store_made_without_settings_keeps_the_same_numbers(self):
        document = self.ledger
        document.save(0, ledger(60), "mika")
        for rev in range(1, 93):
            self.clock.tick(days=1)
            document.save(rev, ledger(60), "mika")
        self.assertEqual(len(self.names()), 90)


# ---------------------------------------------------------------------------
# The test stand forgets (BUILD-SPEC 2.8, 2.10, 2.11)
# ---------------------------------------------------------------------------

class PurgeTests(StoreCase):
    STAND = "test"

    def test_on_the_test_stand_every_copy_older_than_two_days_goes_and_the_document_stays(self):
        self.clock.set(datetime.datetime(2026, 10, 1, 0, 10, tzinfo=UTC))
        document = self.ledger
        document.save(0, ledger(60, "the night's seed"), "ctl")
        for day in range(1, 7):
            self.clock.tick(days=1)                                         # 00:10 UTC, the nightly reseed
            document.save(document.revision(), ledger(60, "seed of day %d" % day), "ctl")
            if day in (2, 5):
                self.clock.tick(hours=9)
                document.save(document.revision(), ledger(2, "typed on test"), "mika")        # a before-shrink copy
                document.restore(document.snapshots()[0].name, "ctl")                           # and a restore copy
                self.clock.tick(hours=-9)
        write_new(self.path("ledger", "current.json.damaged-20261002T101000Z"), b"what a restore moved aside")
        write_new(self.path("ledger", "current.json.damaged-20261007T000000Z"), b"moved aside tonight")
        kinds = lambda: sorted(set(snapshot.kind for snapshot in document.snapshots()))
        self.assertEqual(kinds(), ["day", "restore", "shrink"])
        before, stored = document.snapshots(), read_file(document.path)
        cutoff = self.clock() - datetime.timedelta(days=2)
        gone = document.purge(2, "test")
        after = document.snapshots()
        self.assertEqual([snapshot for snapshot in after if snapshot.taken < cutoff], [], "something older than two days stayed")
        self.assertEqual(sorted(after), sorted(snapshot for snapshot in before if snapshot.taken >= cutoff),
                         "something younger than two days went")
        self.assertEqual(kinds(), ["day", "restore", "shrink"], "the younger copies of every kind are still there")
        self.assertEqual(gone, len(before) - len(after) + 1)                # and the older of the two damaged files
        self.assertEqual(self.kept()[0], ["EVER_SAVED", "current.json", "current.json.damaged-20261007T000000Z"])
        self.assertEqual(read_file(document.path), stored)
        self.assertEqual(document.purge(0, "test"), len(after) + 1)
        self.assertEqual((self.kept(), read_file(document.path)), ((["EVER_SAVED", "current.json"], []), stored))
        rev = document.revision()
        self.assertEqual(document.save(rev, ledger(3), "mika").rev, rev + 1, "and the document goes on being saved")

    def test_what_was_typed_on_test_leaves_the_document_the_next_night_and_every_copy_by_the_third(self):
        # BUILD-SPEC 2.11: every night at 00:10 UTC the stand is reseeded and `purge-snapshots --older-than-days 2` runs.
        document = self.ledger
        seed = lambda: json.dumps({"tx": list(range(60)), "seeded": self.clock().isoformat()})

        def night(day):
            self.clock.set(datetime.datetime(2026, 10, day, 0, 10, tzinfo=UTC))
            document.save(document.revision(), seed(), "ctl")
            document.purge(2, "test")

        def holding():
            return [name for name in self.names() if CANARY.encode("ascii") in self.unpack(name)]

        self.clock.set(datetime.datetime(2026, 10, 5, 0, 10, tzinfo=UTC))
        document.save(0, seed(), "ctl")
        night(6)
        self.clock.set(datetime.datetime(2026, 10, 6, 10, 0, tzinfo=UTC))       # a real statement, by mistake
        document.save(document.revision(), json.dumps({"tx": list(range(61)), "statement": CANARY}), "mika")
        self.assertIn(CANARY.encode("ascii"), document.read().body)
        night(7)
        self.assertNotIn(CANARY.encode("ascii"), document.read().body, "the next night's seed replaced it")
        self.assertEqual(holding(), ["day-2026-10-07-rev000003.json.gz"], "as the copy of the day, it is still on disk")
        night(8)
        night(9)
        self.assertEqual(holding(), [], "three nights on, no copy of it is left")
        self.assertNotIn(CANARY.encode("ascii"), document.read().body)

    def test_purging_is_for_the_stand_the_directory_is_marked_for_and_never_for_prod(self):
        document = self.ledger
        document.save(0, ledger(60), "ctl")
        self.clock.tick(days=5)
        document.save(1, ledger(60), "ctl")
        kept = self.kept()
        for stand in ("prod", "dev", "", "TEST", None):
            with self.subTest(stand=stand):
                with self.assertRaises(store.Refused) as refused:
                    document.purge(0, stand)
                self.assertEqual((refused.exception.status, refused.exception.code), (403, "refused"))
        for days in (-1, 1.5, "2", True, None):
            with self.subTest(days=days):
                with self.assertRaises(ValueError):
                    document.purge(days, "test")
        self.assertEqual(self.kept(), kept)

    def test_a_prod_directory_is_never_purged_whatever_the_caller_says(self):
        directory = tempfile.mkdtemp(prefix="money-store-")
        self.addCleanup(shutil.rmtree, directory, True)
        store.prepare_data_dir(directory, "prod")
        document = store.DocStore(directory, "ledger", self.clock)
        document.save(0, ledger(60), "mika")
        self.clock.tick(days=5)
        document.save(1, ledger(60), "mika")
        for stand in ("prod", "test", "dev"):
            with self.assertRaises(store.Refused):
                document.purge(0, stand)
        self.assertEqual(len(document.snapshots()), 1)


# ---------------------------------------------------------------------------
# Restore: a new revision (design 1.4 "Restore"; BUILD-SPEC 2.8, 2.10)
# ---------------------------------------------------------------------------

class RestoreTests(DoorCase):
    def setUp(self):
        super().setUp()
        self.monday, self.tuesday = ledger(30, "monday"), ledger(31, "tuesday")
        self.assertSaved(self.put(LEDGER, 0, self.monday), 1)
        self.assertSaved(self.put(LEDGER, 1, self.tuesday), 2)             # day-2026-10-07-rev000001 holds monday
        self.copy = "day-2026-10-07-rev000001.json.gz"

    def restore(self, name, word="dev\n", kind="ledger"):
        return self.stand.ctl("restore", kind, name, stdin=word)

    def test_a_restore_is_the_next_revision_and_an_open_pages_save_is_409(self):
        page = self.get(LEDGER).json()["rev"]                              # a page opens at revision 2
        self.stand.clock.tick(minutes=5)
        done = self.restore(self.copy)
        self.assertEqual(done.status, 0, done.err)
        late = self.put(LEDGER, page, ledger(32, "typed before the restore"))
        self.assertRefused(late, 409, "money_stale")
        self.assertEqual(late.json()["rev"], page + 1)
        for base in (1, 0):                                                 # nor a page from before the snapshot
            self.assertRefused(self.put(LEDGER, base, ledger(1)), 409, "money_stale")
        self.assertEqual(self.get(LEDGER).body, envelope(3, self.monday, "2026-10-07T12:05:00.000Z"))
        self.assertSaved(self.put(LEDGER, 3, ledger(33, "after reloading")), 4)

    def test_what_a_restore_replaces_is_kept_as_a_copy_that_can_be_restored_in_turn(self):
        tuesday_file = self.stored()
        self.stand.clock.tick(minutes=5)
        self.assertEqual(self.restore(self.copy).status, 0)
        aside = "restore-20261007T120500Z-rev000002.json.gz"
        self.assertEqual(self.copies(), [self.copy, aside])
        self.assertEqual(gzip.decompress(read_file(self.file(name=os.path.join("snapshots", aside)))), tuesday_file)
        self.assertRegex(aside, r"^restore-\d{8}T\d{6}Z-rev\d{6}\.json\.gz$")
        self.stand.clock.tick(minutes=5)
        self.assertEqual(self.restore(aside).status, 0)
        self.assertEqual(self.get(LEDGER).body, envelope(4, self.tuesday, "2026-10-07T12:10:00.000Z"))
        events = [entry for entry in self.stand.security_events() if entry["event"] == "restore"]
        self.assertEqual([(entry["doc"], entry["snapshot"], entry["rev"], entry["fromRev"]) for entry in events],
                         [("ledger", self.copy, 3, 1), ("ledger", aside, 4, 2)])

    def test_a_restore_over_a_lost_file_still_lands_above_every_revision_a_page_may_hold(self):
        for rev in range(2, 6):
            self.assertSaved(self.put(LEDGER, rev, ledger(30, "rev %d" % (rev + 1))), rev + 1)
        os.unlink(self.file())                                             # at revision 6, with one copy, of revision 1
        self.assertRefused(self.get(LEDGER), 503, "storage_damaged")
        self.assertEqual(self.restore(self.copy).status, 0)
        self.assertEqual(self.get(LEDGER).json()["rev"], 7)
        for base in range(7):
            self.assertRefused(self.put(LEDGER, base, ledger(1, "an open page")), 409, "money_stale")
        self.assertEqual(self.get(LEDGER).json()["doc"]["note"], "monday")

    def test_only_a_snapshot_of_this_document_that_reads_back_whole_is_restored(self):
        self.assertSaved(self.put(PLAN, 0, plan(banks=3)), 1)
        self.assertSaved(self.put(PLAN, 1, plan(banks=4)), 2)              # the plan's own day copy, same name
        snapshots = self.file(name="snapshots")
        good = read_file(os.path.join(snapshots, self.copy))
        planted = {
            "day-2026-10-06-rev000009.json.gz": read_file(os.path.join(self.file("plan", "snapshots"), self.copy)),
            "day-2026-10-05-rev000009.json.gz": b"not gzip at all",
            "day-2026-10-04-rev000009.json.gz": good[:len(good) // 2],
            "day-2026-10-03-rev000009.json.gz": gzip.compress(self.stored()[:60]),
            "day-2026-10-02-rev000009.json.gz": gzip.compress(ledger(30).encode("utf-8")),
            "day-2026-10-01-rev000009.json.gz": gzip.compress(b""),
        }
        for name, content in planted.items():
            write_new(os.path.join(snapshots, name), content)
        os.mkdir(os.path.join(snapshots, "day-2026-09-30-rev000009.json.gz"))
        before = (self.stored(), self.copies())
        for name in sorted(planted) + ["day-2026-09-30-rev000009.json.gz"]:
            with self.subTest(name=name):
                refused = self.restore(name)
                self.assertEqual((refused.status, refused.out), (1, ""), refused.err)
                self.assertIn("bad_snapshot", refused.err)
        for name in ("day-2026-01-01-rev000001.json.gz", "current.json", "../current.json", "../../plan/current.json",
                     "../../auth/users.json", os.path.join(snapshots, self.copy), "day-2026-10-07-rev000001.json",
                     self.copy + "/", ""):
            with self.subTest(name=name):
                refused = self.restore(name)
                self.assertEqual((refused.status, refused.out), (1, ""), refused.err)
                self.assertIn("no_such_snapshot", refused.err)
        self.assertEqual((self.stored(), self.copies()), before, "a refused restore changes nothing")
        self.assertEqual(self.restore(self.copy, kind="plan").status, 0, "each document restores its own copy")
        self.assertEqual(self.get(PLAN).body, envelope(3, plan(banks=3)))
        self.assertEqual(self.get(LEDGER).json()["rev"], 2)

    def test_a_restore_that_is_not_typed_for_does_nothing(self):
        before = (self.stored(), self.copies())
        for word in ("", "\n", "prod\n", "DEV\n", "yes\n", "dev-ish\n"):
            with self.subTest(word=word):
                refused = self.restore(self.copy, word)
                self.assertEqual((refused.status, refused.out), (2, ""))
        self.assertEqual((self.stored(), self.copies()), before)

    def test_a_restore_needs_room_like_a_save_and_is_refused_whole_without_it(self):
        tight = store.DocStore(self.stand.data_dir, "ledger", self.stand.clock, free_bytes=lambda path: 64 * MIB)
        before = (self.stored(), self.copies())
        with self.assertRaises(store.NoSpace):
            tight.restore(self.copy, "ctl")
        self.assertEqual((self.stored(), self.copies()), before)


# ---------------------------------------------------------------------------
# Two writers (design 1.4 "Locking": a thread lock, and flock because ctl is a second process)
# ---------------------------------------------------------------------------

#: A process that keeps saving on top of whatever is stored until ``wanted`` of its saves were accepted.
#: It says "ready", waits for the gate file so that all of them start together, and prints
#: [[revision, base], ...] of the accepted saves. argv: directory, name, wanted, gate.
SAVING_WORKER = r'''
import json, os, sys, time
from moneyd import store
directory, name, wanted, gate = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
document = store.DocStore(directory, "ledger")
accepted = []
print("ready", flush=True)
deadline = time.monotonic() + 60
while not os.path.exists(gate):
    if time.monotonic() > deadline:
        sys.exit("the gate never opened")
    time.sleep(0.001)
while len(accepted) < wanted:
    base = document.read().rev
    try:
        saved = document.save(base, json.dumps({"tx": [], "by": name, "n": len(accepted)}), name)
    except store.Stale:
        continue
    accepted.append([saved.rev, base])
    time.sleep(0.003)       # a founder's page does not save in a closed loop: let the others in
print(json.dumps(accepted))
'''


class TwoWritersTests(StoreCase):
    def race(self, first, second, rounds):
        """Two saves from the same revision, started together, ``rounds`` times. Returns the revisions accepted."""
        accepted = []
        for round_ in range(rounds):
            base = first.read().rev
            start = threading.Barrier(2)
            outcome = []

            def save(document, who):
                start.wait(10)
                try:
                    outcome.append(("saved", document.save(base, ledger(2, "%s in round %d" % (who, round_)), who).rev, who))
                except store.Stale as stale:
                    outcome.append(("stale", stale.rev, who))

            threads = [threading.Thread(target=save, args=pair) for pair in ((first, "mika"), (second, "misha"))]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(30)
            self.assertEqual(sorted(kind for kind, _rev, _who in outcome), ["saved", "stale"], outcome)
            self.assertEqual([rev for _kind, rev, _who in outcome], [base + 1, base + 1],
                             "one is the next revision, the other is told that revision")
            winner = [who for kind, _rev, who in outcome if kind == "saved"][0]
            stored = json.loads(first.read().body.decode("utf-8"))
            self.assertEqual((stored["rev"], stored["doc"]["note"]), (base + 1, "%s in round %d" % (winner, round_)))
            accepted.append(base + 1)
        return accepted

    def test_of_two_saves_from_one_revision_in_one_process_exactly_one_is_accepted(self):
        self.assertEqual(self.race(self.ledger, self.ledger, 40), list(range(1, 41)))

    def test_of_two_saves_through_two_stores_exactly_one_is_accepted(self):
        # Two DocStore objects share no thread lock: what keeps them apart is the flock, as between two processes.
        self.assertEqual(self.race(self.ledger, self.open("ledger"), 40), list(range(1, 41)))

    def test_writers_in_separate_processes_never_lose_an_update(self):
        wanted, names = 30, ("mika", "misha", "vanya")
        gate = os.path.join(tempfile.mkdtemp(prefix="money-store-"), "go")
        self.addCleanup(shutil.rmtree, os.path.dirname(gate), True)
        workers = [subprocess.Popen([sys.executable, "-c", SAVING_WORKER, self.dir, name, str(wanted), gate], cwd=CHECKOUT,
                                    env=child_environ(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE) for name in names]
        accepted = {}
        try:
            for worker in workers:
                self.assertEqual(worker.stdout.readline(), b"ready\n", "a worker did not start")
            write_new(gate, b"")                        # all three are waiting: now they save against each other
            for name, worker in zip(names, workers):
                out, err = worker.communicate(timeout=120)
                self.assertEqual(worker.returncode, 0, err.decode("utf-8", "replace"))
                accepted[name] = json.loads(out.decode("utf-8"))
        finally:
            for worker in workers:
                if worker.poll() is None:
                    worker.kill()
                    worker.communicate()
        every = sorted(pair for pairs in accepted.values() for pair in pairs)
        self.assertEqual([rev for rev, _base in every], list(range(1, 3 * wanted + 1)),
                         "every accepted save is a revision of its own: none was written over, none handed out twice")
        self.assertTrue(all(base == rev - 1 for rev, base in every), "and each was made on top of the one before it")
        last = json.loads(self.ledger.read().body.decode("utf-8"))
        self.assertEqual(last["rev"], 3 * wanted)
        owner = [name for name, pairs in accepted.items() if pairs[-1][0] == 3 * wanted]
        self.assertEqual([last["doc"]["by"], last["doc"]["n"]], [owner[0], wanted - 1], "what is stored is the last accepted save")
        self.assertEqual(store.verify(self.dir)["problems"], [])
        self.assertNoLitter()

    def test_a_writer_that_cannot_have_the_lock_in_time_is_503_storage_busy_and_has_written_nothing(self):
        self.ledger.save(0, ledger(3), "mika")
        self.clock.tick(days=1)
        stored, kept = read_file(self.ledger.path), self.kept()
        impatient = self.open("ledger", lock_timeout=0.05)
        with store.FileLock(self.path("ledger", ".lock"), timeout=1.0):
            for attempt in (lambda: impatient.save(1, ledger(4), "misha"), lambda: impatient.restore("nothing", "ctl"),
                            lambda: impatient.purge(0, "dev")):
                with self.assertRaises(store.Busy) as busy:
                    attempt()
                self.assertEqual((busy.exception.status, busy.exception.code), (503, "storage_busy"))
            self.assertEqual(impatient.read().body, stored, "reading does not wait for a writer")
            self.assertEqual(impatient.status()["rev"], 1)
        self.assertEqual((read_file(self.ledger.path), self.kept()), (stored, kept))
        self.assertEqual(impatient.save(1, ledger(4), "misha").rev, 2)


class TwoPagesTests(DoorCase):
    def test_of_two_pages_saving_from_one_revision_one_gets_200_and_the_other_409_with_that_revision(self):
        for kind, door, doc in (("ledger", LEDGER, lambda note: ledger(2, note)),
                                ("plan", PLAN, lambda note: json.dumps({"banks": [], "note": note}))):
            for round_ in range(12):
                base = self.get(door).json()["rev"]
                start, answers = threading.Barrier(2), []

                def save(name):
                    start.wait(10)
                    answers.append((name, self.put(door, base, doc("%s in round %d" % (name, round_)))))

                pages = [threading.Thread(target=save, args=(name,)) for name in ("mika", "misha")]
                for page in pages:
                    page.start()
                for page in pages:
                    page.join(30)
                self.assertEqual(sorted(answer.status for _name, answer in answers), [200, 409], (kind, round_))
                winner = [name for name, answer in answers if answer.status == 200][0]
                for _name, answer in answers:
                    self.assertEqual(answer.json()["rev"], base + 1)
                stored = self.get(door).json()
                self.assertEqual((stored["rev"], stored["doc"]["note"]), (base + 1, "%s in round %d" % (winner, round_)))
        self.assertEqual((self.get(LEDGER).json()["rev"], self.get(PLAN).json()["rev"]), (12, 12))


class TwoProcessesTests(unittest.TestCase):
    """The real thing: ``python -m moneyd`` as one process, this test and ``python -m moneyd.ctl`` as others."""

    def test_what_another_process_writes_the_running_server_answers_at_its_next_request(self):
        stand = _harness.ProcessStand()
        self.addCleanup(stand.stop)
        token, _session = auth.Auth(stand.settings).internal_session("mika", ttl=600, purpose="tests")
        cookie = "%s=%s" % (stand.settings.cookie_name, token)

        def get(door):
            return stand.get(door, cookie=cookie)

        def put(door, base, doc):
            return stand.put(door, {"base": base, "doc": doc}, cookie=cookie)

        # The server saves; this process reads the same bytes from the same directory.
        self.assertEqual(put(PLAN, 0, plan(banks=1)).json(), {"rev": 1})
        mine = store.DocStore(stand.data_dir, "plan")
        self.assertEqual(mine.read().body, get(PLAN).body)
        # This process saves; the server answers the new revision and refuses a page that is now behind.
        self.assertEqual(mine.save(1, plan(banks=2), "ctl").rev, 2)
        self.assertTrue(get(PLAN).body.startswith(b'{"rev":2,"doc":' + plan(banks=2).encode("utf-8") + b","))
        late = put(PLAN, 1, plan(banks=9))
        self.assertEqual((late.status, late.json()["error"], late.json()["rev"]), (409, "money_stale", 2))
        self.assertEqual(put(PLAN, 2, plan(banks=3)).json(), {"rev": 3})
        # And the other way round: this process is behind the server's save, and is told so.
        with self.assertRaises(store.Stale) as behind:
            mine.save(2, plan(banks=7), "ctl")
        self.assertEqual(behind.exception.rev, 3)
        self.assertEqual(mine.read().body, get(PLAN).body)

        # A restore made by `ctl`, a third process: the open page's save is refused, the next read is the restored text.
        first = ledger(3, CANARY)
        self.assertEqual(put(LEDGER, 0, first).json(), {"rev": 1})
        self.assertEqual(put(LEDGER, 1, ledger(3, "second")).json(), {"rev": 2})
        copies = os.listdir(os.path.join(stand.data_dir, "ledger", "snapshots"))
        self.assertEqual(len(copies), 1, copies)
        self.assertRegex(copies[0], r"^day-\d{4}-\d{2}-\d{2}-rev000001\.json\.gz$")
        wrong = stand.ctl("restore", "ledger", copies[0], input="prod\n")
        self.assertEqual(wrong.returncode, 2, wrong.stderr)
        self.assertEqual(get(LEDGER).json()["rev"], 2)
        done = stand.ctl("restore", "ledger", copies[0], input="dev\n")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertNotIn(CANARY, done.stdout + done.stderr, "ctl says what it restored, never what is in it")
        late = put(LEDGER, 2, ledger(4, "typed in the open page"))
        self.assertEqual((late.status, late.json()["rev"]), (409, 3))
        self.assertTrue(get(LEDGER).body.startswith(b'{"rev":3,"doc":' + first.encode("utf-8") + b","))
        self.assertEqual(put(LEDGER, 3, ledger(5, "after reloading")).json(), {"rev": 4})
        self.assertEqual(stand.stop(), 0)


# ---------------------------------------------------------------------------
# Free space (design 1.4: "must exceed three times the body plus 64 MB, else 507 storage_failed")
# ---------------------------------------------------------------------------

class SpaceTests(StoreCase):
    def test_a_save_needs_free_space_above_three_times_the_document_plus_64_mib(self):
        doc = padded('{"tx":[]', 5000)
        needed = 3 * 5000 + 64 * MIB
        for free in (0, 64 * MIB, needed - 1, needed):
            with self.subTest(free=free):
                tight = self.open("ledger", free_bytes=lambda path, free=free: free)
                with self.assertRaises(store.NoSpace) as full:
                    tight.save(0, doc, "mika")
                self.assertEqual((full.exception.status, full.exception.code), (507, "storage_failed"))
                self.assertIsInstance(full.exception, store.StorageFailed)
                self.assertEqual((self.kept(), tight.read().body), (([], []), EMPTY))
        roomy = self.open("ledger", free_bytes=lambda path: needed + 1)
        self.assertEqual(roomy.save(0, doc, "mika").bytes, 5000)
        with self.assertRaises(store.NoSpace):
            roomy.save(1, padded('{"tx":[]', 5001), "mika")             # one byte more asks for three more
        self.assertEqual(roomy.read().rev, 1)

    def test_the_door_can_ask_before_it_reads_a_body(self):
        tight = self.open("plan", free_bytes=lambda path: 64 * MIB + 3 * 4096)
        with self.assertRaises(store.NoSpace):
            tight.check_space(4096)
        tight.check_space(4095)
        with self.assertRaises(store.StorageFailed):
            self.open("plan", free_bytes=mock.Mock(side_effect=OSError(errno.EIO, "Input/output error"))).check_space(1)

    def test_stale_is_said_before_no_room_and_a_damaged_file_before_both(self):
        # docs/api.md: "the state of the stored file (503), the revision (409), the free space (507)".
        self.ledger.save(0, ledger(3), "mika")
        tight = self.open("ledger", free_bytes=lambda path: 0)
        with self.assertRaises(store.Stale):
            tight.save(0, ledger(3), "mika")
        with self.assertRaises(store.NoSpace):
            tight.save(1, ledger(3), "mika")
        write_new(self.ledger.path, b"{")
        for base in (0, 1):
            with self.assertRaises(store.Damaged):
                tight.save(base, ledger(3), "mika")


class DoorSpaceTests(DoorCase):
    def test_no_room_is_507_storage_failed_at_the_door_and_what_is_stored_stays(self):
        self.assertSaved(self.put(LEDGER, 0, ledger(3, "stored")), 1)
        stored = self.stored()
        self.stand.stores["ledger"] = store.DocStore(self.stand.data_dir, "ledger", self.stand.clock,
                                                     max_bytes=16 * MIB, free_bytes=lambda path: 64 * MIB)
        for base in (1, 0):
            self.assertRefused(self.put(LEDGER, base, ledger(3, "no room for this")), 507, "storage_failed")
        self.assertEqual(self.stored(), stored)
        self.assertEqual(self.get(LEDGER).body, stored, "what is stored can still be read")
        self.assertEqual(self.copies(), [])
        self.assertSaved(self.put(PLAN, 0, plan(banks=1)), 1)


# ---------------------------------------------------------------------------
# The data directory: one stand's own, and never the laptop's (BUILD-SPEC 2.7; design 1.1, 1.4)
# ---------------------------------------------------------------------------

class DataDirTests(unittest.TestCase):
    def directory(self):
        directory = tempfile.mkdtemp(prefix="money-store-")
        self.addCleanup(shutil.rmtree, directory, True)
        return directory

    def test_the_first_start_writes_the_stands_name_and_a_later_start_changes_nothing(self):
        for stand in config.STANDS:
            with self.subTest(stand=stand):
                directory = self.directory()
                self.assertIsNone(store.read_stand_marker(directory))
                store.prepare_data_dir(directory, stand)
                self.assertEqual(read_file(os.path.join(directory, "STAND")), stand.encode("ascii") + b"\n")
                self.assertEqual(store.read_stand_marker(directory), stand)
                self.assertEqual(sorted(os.listdir(directory)), ["STAND", "auth", "ledger", "plan"])
                before = tree(directory)
                store.prepare_data_dir(directory, stand)
                self.assertEqual(tree(directory), before)

    def test_a_marker_that_names_another_stand_stops_every_stand_and_nothing_is_touched(self):
        for marked in config.STANDS:
            directory = self.directory()
            store.prepare_data_dir(directory, marked)
            store.DocStore(directory, "ledger").save(0, ledger(3), "mika")
            before = tree(directory)
            for stand in config.STANDS:
                if stand == marked:
                    continue
                with self.subTest(marked=marked, stand=stand):
                    with self.assertRaises(store.DataDirError):
                        store.prepare_data_dir(directory, stand)
                    self.assertIsInstance(store.DataDirError("x"), config.BootRefusal)
            self.assertEqual(tree(directory), before)

    def test_a_marker_that_is_not_a_stands_name_is_no_ones_and_is_never_overwritten(self):
        for content in (b"", b"\n", b"Prod\n", b"prod test\n", b"production\n", b"dev\x00", b"\xff\xfe"):
            with self.subTest(content=content):
                directory = self.directory()
                write_new(os.path.join(directory, "STAND"), content)
                for stand in config.STANDS:
                    with self.assertRaises(store.DataDirError):
                        store.prepare_data_dir(directory, stand)
                self.assertEqual(read_file(os.path.join(directory, "STAND")), content)
                self.assertEqual(os.listdir(directory), ["STAND"])

    def test_a_stands_files_without_a_marker_are_not_adopted(self):
        for name in ("ledger", "plan", "auth", "security.log"):
            with self.subTest(name=name):
                directory = self.directory()
                if name == "security.log":
                    write_new(os.path.join(directory, name), b"")
                else:
                    os.mkdir(os.path.join(directory, name))
                for stand in config.STANDS:
                    with self.assertRaises(store.DataDirError):
                        store.prepare_data_dir(directory, stand)
                self.assertEqual(os.listdir(directory), [name], "no marker was written over somebody's files")

    def laptop_folders(self):
        """Data folders as the laptop tool leaves them, each holding one thing ``moneyd`` must refuse."""
        made = {}
        for what in ("db.json", "cash.json", "backups", "db.json and its backups", "a dangling link named db.json"):
            directory = self.directory()
            if "db.json" in what and "dangling" not in what:
                write_new(os.path.join(directory, "db.json"), ('{"tx":[{"n":"%s"}],"rev":41}' % CANARY).encode("ascii"))
            if what == "cash.json":
                write_new(os.path.join(directory, "cash.json"), ('{"banks":[{"n":"%s"}],"rev":3}' % CANARY).encode("ascii"))
            if "backups" in what:
                os.mkdir(os.path.join(directory, "backups"))
                write_new(os.path.join(directory, "backups", "db-2026-10-06.json"), CANARY.encode("ascii"))
            if "dangling" in what:
                os.symlink(os.path.join(directory, "gone"), os.path.join(directory, "db.json"))
            made[what] = directory
        return made

    def test_the_laptop_tools_layout_is_refused_by_every_stand_and_left_exactly_as_it_was(self):
        for what, directory in self.laptop_folders().items():
            before = tree(directory)
            for stand in config.STANDS:
                with self.subTest(what=what, stand=stand):
                    with self.assertRaises(store.DataDirError) as refused:
                        store.prepare_data_dir(directory, stand)
                    self.assertNotIn(CANARY, str(refused.exception))
            self.assertEqual(tree(directory), before)

    def test_the_laptop_tools_files_stop_a_stand_that_already_ran_in_the_directory(self):
        # The marker is right and the stand's own files are there - and then a ledger of the laptop appears beside them.
        for name in ("db.json", "cash.json", "backups"):
            for stand in config.STANDS:
                with self.subTest(name=name, stand=stand):
                    directory = self.directory()
                    store.prepare_data_dir(directory, stand)
                    store.DocStore(directory, "ledger").save(0, ledger(3), "mika")
                    if name == "backups":
                        os.mkdir(os.path.join(directory, name))
                    else:
                        write_new(os.path.join(directory, name), b"{}")
                    before = tree(directory)
                    with self.assertRaises(store.DataDirError):
                        store.prepare_data_dir(directory, stand)
                    self.assertEqual(tree(directory), before)

    def boot(self, stand, directory):
        """``python -m moneyd`` in this process, on a prod or test stand's settings. Returns (status, stderr)."""
        environ = _harness.dev_environ(directory, _harness.free_port(), **_harness.stand_changes(stand))
        out, err, status = io.StringIO(), io.StringIO(), []
        with _harness.scrypt_stand_in():
            # In a thread, so that a boot that is NOT refused shows as a failure and not as a test that never ends.
            runner = threading.Thread(target=lambda: status.append(boot.main(environ=environ, stdout=out, stderr=err)),
                                      daemon=True)
            runner.start()
            runner.join(20)
        self.assertFalse(runner.is_alive(), "the %s stand started serving on %s" % (stand, sorted(os.listdir(directory))))
        return status[0], err.getvalue()

    def test_prod_and_test_do_not_boot_on_the_laptop_tools_layout(self):
        for what, directory in self.laptop_folders().items():
            before = tree(directory)
            for stand in ("prod", "test"):
                with self.subTest(what=what, stand=stand):
                    status, said = self.boot(stand, directory)
                    self.assertEqual(status, 2)
                    self.assertIn("moneyd: not starting: ", said)
                    self.assertIn("laptop tool", said)
                    self.assertNotIn(CANARY, said)
            self.assertEqual(tree(directory), before, "a refused boot wrote nothing: no marker, no accounts, no log")

    def test_prod_and_test_do_not_boot_on_a_directory_marked_for_another_stand(self):
        for marked, stand in (("test", "prod"), ("dev", "prod"), ("prod", "test"), ("dev", "test")):
            with self.subTest(marked=marked, stand=stand):
                directory = self.directory()
                store.prepare_data_dir(directory, marked)
                store.DocStore(directory, "ledger").save(0, ledger(3, CANARY), "mika")
                before = tree(directory)
                status, said = self.boot(stand, directory)
                self.assertEqual(status, 2)
                self.assertIn("belongs to the '%s' stand" % marked, said)
                self.assertEqual(tree(directory), before)

    def test_ctl_works_on_no_directory_that_is_another_stands_or_the_laptops(self):
        commands = (("empty",), ("snapshots", "ledger"), ("restore", "ledger", "day-2026-10-07-rev000001.json.gz"),
                    ("seed", "ledger", "--fresh"), ("purge-snapshots", "--older-than-days", "0"), ("user", "list"),
                    ("sessions", "list"), ("sessions", "logout", "--all"), ("user", "disable", "mika"))
        folders = dict(self.laptop_folders())
        foreign = self.directory()
        store.prepare_data_dir(foreign, "prod")
        store.DocStore(foreign, "ledger").save(0, ledger(3, CANARY), "mika")
        folders["a directory marked prod"] = foreign
        for what, directory in folders.items():
            before = tree(directory)
            environ = _harness.dev_environ(directory, _harness.free_port())
            for command in commands:
                with self.subTest(what=what, command=command):
                    out, err = io.StringIO(), io.StringIO()
                    status = ctl.main(list(command), environ=environ, stdin=io.StringIO('dev\n{"tx":[]}'), stdout=out, stderr=err)
                    self.assertEqual((status, out.getvalue()), (2, ""), err.getvalue())
                    self.assertIn("refused", err.getvalue())
                    self.assertNotIn(CANARY, err.getvalue())
            self.assertEqual(tree(directory), before)

    def settings_for(self, data_dir, web_dir):
        return config.Settings.from_env(_harness.dev_environ(data_dir, 8123, MONEY_WEB_DIR=web_dir))

    def test_the_checkouts_own_data_folder_is_refused_as_a_data_directory(self):
        checkout = self.directory()
        data = os.path.join(checkout, "data")
        os.makedirs(os.path.join(data, "inside"))
        for chosen in (data, data + os.sep, os.path.join(data, "inside"), os.path.join(checkout, ".", "data"),
                       os.path.join(checkout, "vendor", "..", "data")):
            with self.subTest(chosen=chosen):
                with self.assertRaises(config.ConfigError):
                    self.settings_for(chosen, checkout)
        self.assertEqual(self.settings_for(os.path.join(checkout, "data-of-a-stand"), checkout).stand, "dev")
        with self.assertRaises(config.ConfigError):
            config.Settings.from_env(_harness.dev_environ(_safety.DATA, 8123))    # the real checkout's, by default

    def test_the_checkouts_own_data_folder_is_refused_also_when_it_is_a_link_to_somewhere_else(self):
        # The owner may keep the laptop's data on another volume and link it in; it is the laptop's data all the same.
        checkout, elsewhere = self.directory(), self.directory()
        os.symlink(elsewhere, os.path.join(checkout, "data"))
        with self.assertRaises(config.ConfigError):
            self.settings_for(os.path.join(checkout, "data"), checkout)


# ---------------------------------------------------------------------------
# Counts, never contents (BUILD-SPEC 2.10 "verify <dir> (counts, never contents)"; docs/security.md)
# ---------------------------------------------------------------------------

class NoContentsTests(StoreCase):
    def fill(self):
        """Both documents, copies of every kind, a damaged file and a bad snapshot - the canary in all of them."""
        marked = lambda rows: json.dumps({"tx": [{"id": index, CANARY + "-key": CANARY} for index in range(rows)],
                                          CANARY: {"note": CANARY}})
        self.ledger.save(0, marked(40), "mika")
        self.clock.tick(days=1)
        self.ledger.save(1, marked(40), "mika")                             # a day copy
        self.ledger.save(2, marked(2), "mika")                              # a before-shrink copy
        self.ledger.restore(self.ledger.snapshots()[0].name, "ctl")         # a restore copy
        self.plan.save(0, json.dumps({"banks": [{"n": CANARY}], CANARY: [1, 2]}), "mika")
        self.plan.save(1, json.dumps({"banks": [{"n": CANARY}], CANARY: [1, 2, 3]}), "mika")
        write_new(self.path("ledger", "snapshots", "day-2026-10-09-rev000009.json.gz"),
                  gzip.compress(('{"rev":9,"doc":{"oops":"%s"},"updatedAt":"x"}' % CANARY).encode("ascii")))
        write_new(self.path("ledger", "current.json.damaged-20261007T120000Z"), CANARY.encode("ascii"))
        write_new(self.path("ledger", "current.json.tmp-1-%s" % "ab12cd34"), CANARY.encode("ascii"))

    def ctl(self, *command, stdin=""):
        out, err = io.StringIO(), io.StringIO()
        environ = _harness.dev_environ(self.dir, 8123)
        status = ctl.main(list(command), environ=environ, stdin=io.StringIO(stdin), stdout=out, stderr=err, clock=self.clock)
        return status, out.getvalue() + err.getvalue()

    def test_doctor_and_verify_never_return_or_print_what_a_document_holds(self):
        self.fill()
        states = {
            "sound": lambda: None,
            "the ledger cut short": lambda: write_new(self.ledger.path, read_file(self.ledger.path)[:200]),
            "the ledger replaced by words": lambda: write_new(self.ledger.path, ("%s %s" % (CANARY, CANARY)).encode("ascii")),
            "the plan gone": lambda: os.unlink(self.plan.path),
        }
        for state, make in states.items():
            make()
            with self.subTest(state=state):
                for report in (store.doctor(self.dir, "dev", self.clock), store.verify(self.dir), store.verify(self.dir, deep=False),
                               self.ledger.status(), self.plan.status(), auth.verify(self.dir)):
                    self.assertNotIn(CANARY, json.dumps(report, default=str))
                for command in (("doctor",), ("verify", self.dir), ("snapshots", "ledger"), ("snapshots", "plan"), ("empty",),
                                ("restore", "ledger", "day-2026-10-09-rev000009.json.gz"),
                                ("restore", "ledger", self.ledger.snapshots()[-1].name)):
                    status, said = self.ctl(*command, stdin="not the stand's name\n")
                    self.assertNotIn(CANARY, said, command)
                    self.assertIn(status, (0, 1, 2))
        status, said = self.ctl("restore", "ledger", self.ledger.snapshots()[-1].name, stdin="dev\n")
        self.assertEqual(status, 0, said)
        self.assertNotIn(CANARY, said)
        self.assertIn(CANARY, read_file(self.ledger.path).decode("utf-8"), "the canary was really there to be shown")

    def test_what_doctor_and_verify_do_show_is_counts_revisions_sizes_and_file_names(self):
        self.fill()
        report = store.verify(self.dir)
        said = report["documents"]["ledger"]
        self.assertEqual((said["state"], said["rev"], said["rows"], said["everSaved"]), ("ok", 4, 40, True))
        self.assertEqual((said["snapshots"]["day"], said["snapshots"]["shrink"], said["snapshots"]["restore"]), (2, 1, 1))
        self.assertEqual((said["snapshotsChecked"], said["snapshotsBad"]), (4, ["day-2026-10-09-rev000009.json.gz"]))
        self.assertEqual((said["temporaryFiles"], said["damagedCopies"]), (1, 1))
        self.assertEqual(report["documents"]["plan"]["rows"], 1)
        self.assertEqual(report["stand"], "dev")
        status, out = self.ctl("verify", self.dir)
        self.assertEqual(status, 1, "a snapshot that does not read back is a problem")
        self.assertIn("ledger: revision 4, 40 rows", out)
        self.assertIn("read back: 4, bad: 1", out)

    def test_doctor_and_verify_leave_a_directory_exactly_as_they_found_it(self):
        self.fill()
        empty, missing = tempfile.mkdtemp(prefix="money-store-"), self.path("nowhere")
        self.addCleanup(shutil.rmtree, empty, True)
        states = {
            "sound": lambda: None,
            "the ledger cut short": lambda: write_new(self.ledger.path, read_file(self.ledger.path)[:200]),
            "the plan gone": lambda: os.unlink(self.plan.path),
        }
        for state, make in states.items():
            make()
            before = tree(self.dir)
            with self.subTest(state=state):
                store.doctor(self.dir, "dev", self.clock)
                store.verify(self.dir)
                auth.verify(self.dir)
                for command in (("doctor",), ("verify", self.dir), ("snapshots", "ledger"), ("empty",)):
                    self.ctl(*command)
                self.assertEqual(tree(self.dir), before)
        for directory in (empty, missing):
            store.doctor(directory, "dev", self.clock)
            store.verify(directory)
            self.ctl("verify", directory)
        self.assertEqual(os.listdir(empty), [], "not even a marker or a lock file")
        self.assertFalse(os.path.exists(missing))

    def test_verify_reads_a_copy_of_the_laptops_folder_as_a_problem_and_opens_none_of_its_files(self):
        folder = tempfile.mkdtemp(prefix="money-store-")
        self.addCleanup(shutil.rmtree, folder, True)
        write_new(os.path.join(folder, "db.json"), ('{"tx":[{"n":"%s"}],"rev":41}' % CANARY).encode("ascii"))
        os.mkdir(os.path.join(folder, "backups"))
        write_new(os.path.join(folder, "backups", "db-2026-10-06.json"), CANARY.encode("ascii"))
        before = tree(folder)
        report = store.verify(folder)
        self.assertEqual(report["laptopLayout"], ["db.json", "backups"])
        self.assertIn("laptop tool's files", " ".join(report["problems"]))
        status, said = self.ctl("verify", folder)
        self.assertEqual(status, 1)
        self.assertNotIn(CANARY, json.dumps(report, default=str) + said)
        self.assertEqual(tree(folder), before)


class NoContentsDoorTests(DoorCase):
    def test_neither_log_of_a_stand_ever_holds_what_a_document_holds(self):
        marked = lambda rows: json.dumps({"tx": [{"id": index, "l": CANARY} for index in range(rows)], CANARY: CANARY})
        self.assertSaved(self.put(LEDGER, 0, marked(40)), 1)
        self.assertSaved(self.put(LEDGER, 1, marked(40)), 2)
        self.assertSaved(self.put(LEDGER, 2, marked(2)), 3)                 # a before-shrink copy and its line
        self.assertRefused(self.put(LEDGER, 0, marked(1)), 409, "money_stale")
        self.assertRefused(self.put(LEDGER, 3, '{"rows":"%s"}' % CANARY), 400, "bad_money_doc")
        self.assertRefused(self.put_raw(LEDGER, ('{"base":3,"doc":{"tx":["%s"]}}' % CANARY).encode("ascii")), 400, "bad_money_doc")
        self.assertEqual(self.put_raw(LEDGER, ('{"base":3,"doc":"%s' % CANARY).encode("ascii")).status, 400)
        write_new(self.file(), ('{"rev":3,"doc":{"tx":["%s"' % CANARY).encode("ascii"))
        self.assertRefused(self.get(LEDGER), 503, "storage_damaged")
        self.assertNotIn(CANARY, self.get(LEDGER).text, "a refusal says nothing of what the file holds")
        self.assertEqual(self.stand.ctl("restore", "ledger", "shrink-20261007T120000Z-rev000002.json.gz", stdin="dev\n").status, 0)
        self.assertEqual(self.get("/data").status, 200)
        self.assertNotIn(CANARY, self.get("/data").text, "the journal on /data is the security log")
        events = self.stand.security_events()
        self.assertEqual([entry["event"] for entry in events if entry["event"] in ("doc-shrunk", "restore")],
                         ["doc-shrunk", "restore"])
        self.assertNotIn(CANARY, json.dumps(events))
        self.assertNotIn(CANARY, self.stand.log_text())
        self.assertGreaterEqual(len([line for line in self.stand.log_lines() if line.get("method") == "PUT"]), 7)


if __name__ == "__main__":
    unittest.main()
