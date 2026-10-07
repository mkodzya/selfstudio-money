"""What the laptop tool does, pinned on a COPY of ``server.py`` in a temporary directory.

``server.py`` keeps its data beside itself (``<its folder>/data``) and has no setting to keep
it anywhere else. So it is never started in place: every test copies the file into a fresh
temporary directory, puts a stub page and a stub vendor file beside it, and starts the copy
as its own process on a free loopback port (``PORT`` in its environment). What it writes, it
writes into that directory, which is removed afterwards.

    python3 -m unittest tests.test_laptop_server

The rules held here are the README's ("The laptop tool") and the file's own comments:

* it listens on 127.0.0.1 and on no other address;
* ``/api/data`` and ``/api/cash`` are two documents, each written whole, each with its own
  revision; a save names the revision it was read at, and one that is behind is refused;
* a request that did not come from its own page (``Host``, ``Origin``) is refused;
* before the first write of a day the file is copied into ``data/backups``; the newest 90 of
  those are kept; a save that drops more than half of more than 20 rows keeps an extra copy
  that the server never deletes;
* of the files in the folder only ``index.html`` and ``vendor/`` are handed out;
* a data file that cannot be read does not stop the server, and what a save replaces is
  copied aside first.

``tests/test_laptop_frozen.py`` pins the bytes of ``server.py``; this file says what those
bytes do, for the day somebody changes them on purpose.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import ast
import datetime
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from typing import Any, Dict, List, NamedTuple, Optional

from tests import _harness

CHECKOUT = _safety.CHECKOUT
SERVER = os.path.join(CHECKOUT, "server.py")
PAGE = b"<!doctype html><title>a stub of the page</title>"
READER = b"// a stub of a vendor file\n"
AUTO = object()


class Answer(NamedTuple):
    status: int
    headers: Any
    body: bytes

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


def ledger(rows: int, note: str = "") -> Dict[str, Any]:
    return {"tx": [{"id": "t-%d" % i, "a": 100 + i} for i in range(rows)], "note": note}


def plan(**lists: int) -> Dict[str, Any]:
    doc = {"v": 2, "cushion": 0}     # type: Dict[str, Any]
    for name in ("banks", "inflows", "team", "taxes", "other"):
        doc[name] = [{"id": "%s-%d" % (name, i)} for i in range(lists.get(name, 0))]
    return doc


def other_addresses() -> List[str]:
    """IPv4 addresses of this machine that are not the loopback one.

    Connecting a datagram socket sends nothing; it only makes the system choose the
    address it would send from. TEST-NET-1 is never routed to a real host.
    """
    found = set()
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 9))
        found.add(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()
    if sys.platform.startswith("linux"):
        found.add("127.0.0.2")      # all of 127/8 is this machine on Linux: a wildcard bind would answer here
    return sorted(address for address in found if address not in ("127.0.0.1", "0.0.0.0"))


class LaptopCase(unittest.TestCase):
    """A copy of ``server.py`` in a temporary folder, running as its own process."""

    def setUp(self):
        self.assertFalse(os.path.lexists(_safety.DATA), "tests never run in a folder that holds data/")
        self.root = tempfile.mkdtemp(prefix="laptop-tool-")
        self.addCleanup(shutil.rmtree, self.root, True)
        self.said = tempfile.mkdtemp(prefix="laptop-tool-said-")
        self.addCleanup(shutil.rmtree, self.said, True)
        shutil.copyfile(SERVER, os.path.join(self.root, "server.py"))
        with open(os.path.join(self.root, "index.html"), "wb") as handle:
            handle.write(PAGE)
        os.mkdir(os.path.join(self.root, "vendor"))
        with open(os.path.join(self.root, "vendor", "reader.js"), "wb") as handle:
            handle.write(READER)
        self.data = os.path.join(self.root, "data")
        self.backups = os.path.join(self.data, "backups")
        self.process = None     # type: Optional[subprocess.Popen]
        self.port = 0
        self.addCleanup(self.stop)
        self.start()

    # -- the process ---------------------------------------------------------

    def environ(self, port: int) -> Dict[str, str]:
        environ = {name: value for name, value in os.environ.items() if not name.startswith("MONEY_")}
        # The file prints two Russian lines when it starts; they must not depend on the terminal's locale here.
        environ.update({"PORT": str(port), "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
        return environ

    def spawn(self, port: int) -> subprocess.Popen:
        with open(os.path.join(self.said, "server-%d.txt" % port), "ab") as sink:
            return subprocess.Popen([sys.executable, os.path.join(self.root, "server.py")], cwd=self.root,
                                    env=self.environ(port), stdin=subprocess.DEVNULL, stdout=sink,
                                    stderr=subprocess.STDOUT)

    def start(self) -> None:
        for _attempt in range(5):
            port = _harness.free_port()
            process = self.spawn(port)
            deadline = time.monotonic() + 15.0
            while time.monotonic() < deadline and process.poll() is None:
                try:
                    socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
                except OSError:
                    time.sleep(0.02)
                    continue
                self.process, self.port = process, port
                return
            if process.poll() is None:
                process.kill()
            process.wait(5.0)       # the port was taken between the look and the bind: try another
        self.fail("the copy of server.py did not start: %s" % self.output())

    def stop(self) -> None:
        process, self.process = self.process, None
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(5.0)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(5.0)

    def output(self) -> str:
        said = []
        for name in sorted(os.listdir(self.said)):
            with open(os.path.join(self.said, name), "rb") as handle:
                said.append(handle.read().decode("utf-8", "replace"))
        return "".join(said)

    # -- asking it -----------------------------------------------------------

    @property
    def host(self) -> str:
        return "127.0.0.1:%d" % self.port

    def ask(self, method: str, path: str, body: Any = None, *, host: Any = AUTO, origin: Optional[str] = None) -> Answer:
        """One request, the way the page sends it: under the server's own name unless said otherwise."""
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        sent = {"Host": self.host if host is AUTO else host}
        if origin is not None:
            sent["Origin"] = origin
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10.0)
        try:
            connection.request(method, path, body=body, headers=sent)
            response = connection.getresponse()
            return Answer(response.status, response.headers, response.read())
        finally:
            connection.close()

    def raw(self, data: bytes) -> bytes:
        """Bytes in, bytes out: for a request no client library would send."""
        connection = socket.create_connection(("127.0.0.1", self.port), timeout=10.0)
        try:
            connection.sendall(data)
            connection.shutdown(socket.SHUT_WR)
            chunks = []
            while True:
                chunk = connection.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        finally:
            connection.close()

    def save(self, door: str, doc: Dict[str, Any], base: int, method: str = "PUT") -> Answer:
        return self.ask(method, door, dict(doc, base=base))

    def stored(self, name: str) -> bytes:
        with open(os.path.join(self.data, name), "rb") as handle:
            return handle.read()

    def copies(self) -> List[str]:
        return sorted(os.listdir(self.backups)) if os.path.isdir(self.backups) else []

    def assertNothingStored(self):
        self.assertFalse(os.path.exists(self.data), "nothing was written: %s" % (
            sorted(os.listdir(self.data)) if os.path.isdir(self.data) else ""))


# ---------------------------------------------------------------------------
# Where it listens
# ---------------------------------------------------------------------------

class ListeningTests(LaptopCase):
    def test_it_serves_its_page_on_the_loopback_address(self):
        answer = self.ask("GET", "/")
        self.assertEqual((answer.status, answer.body), (200, PAGE))

    def test_no_other_address_of_this_machine_answers(self):
        addresses = other_addresses()
        if not addresses:
            self.skipTest("this machine has no address but the loopback one to try")
        for address in addresses:
            with self.subTest(address=address):
                try:
                    connection = socket.create_connection((address, self.port), timeout=1.0)
                except OSError:
                    continue        # refused, unreachable or silent: nobody is listening there
                connection.close()
                self.fail("the laptop server answers on %s:%d - it must listen on 127.0.0.1 only"
                          % (address, self.port))

    def test_the_file_binds_127_0_0_1_and_has_no_other_listener(self):
        with open(SERVER, "rb") as handle:
            tree = ast.parse(handle.read())
        listeners = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
                if name and (name.endswith("Server") or name in ("bind", "listen", "create_server")):
                    listeners.append(node)
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                self.assertNotIn(node.value, ("0.0.0.0", "::"), "a wildcard address in the laptop server")
        self.assertEqual(len(listeners), 1, "the laptop server opens exactly one listener")
        address = listeners[0].args[0]
        self.assertIsInstance(address, ast.Tuple)
        self.assertEqual(ast.literal_eval(address.elts[0]), "127.0.0.1")


# ---------------------------------------------------------------------------
# The two doors
# ---------------------------------------------------------------------------

class DoorTests(LaptopCase):
    def test_before_the_first_save_each_door_hands_over_an_empty_object_and_writes_nothing(self):
        for door in ("/api/data", "/api/cash"):
            answer = self.ask("GET", door)
            self.assertEqual((answer.status, answer.body), (200, b"{}"), door)
            self.assertEqual(answer.headers.get("Content-Type"), "application/json")
            self.assertEqual(answer.headers.get("Cache-Control"), "no-store")
            self.assertEqual(answer.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertNothingStored()

    def test_a_save_names_the_revision_it_was_read_at_and_comes_back_as_the_next_one(self):
        sent = dict(ledger(3, "Кафе ☕ — «тест»"), settings={"deep": [1, 2, {"x": None}]}, fresh="a field of tomorrow")
        saved = self.save("/api/data", sent, base=0)
        self.assertEqual((saved.status, saved.json()), (200, {"ok": True, "rev": 1}))
        back = self.ask("GET", "/api/data")
        self.assertEqual(back.status, 200)
        self.assertEqual(back.json(), dict(sent, rev=1), "the document as it was sent, with its revision inside")
        self.assertNotIn("base", back.json())
        self.assertEqual(back.body, self.stored("db.json"), "the door hands over the file as it lies")
        self.assertIn("Кафе ☕".encode("utf-8"), back.body)
        again = self.save("/api/data", dict(sent, note="second"), base=1)
        self.assertEqual(again.json(), {"ok": True, "rev": 2})
        self.assertEqual(self.ask("GET", "/api/data").json()["rev"], 2)

    def test_a_save_from_a_page_that_is_behind_is_refused_with_the_stored_revision(self):
        self.assertEqual(self.save("/api/data", ledger(3, "first"), base=0).status, 200)
        self.assertEqual(self.save("/api/data", ledger(3, "second"), base=1).status, 200)
        before = self.stored("db.json")
        for why, body in {
            "a page that read revision 1": dict(ledger(1, "late"), base=1),
            "a page that never read it": dict(ledger(1, "late"), base=0),
            "a base ahead of the file": dict(ledger(1, "late"), base=7),
            "no base at all": ledger(1, "late"),
            "the revision as text": dict(ledger(1, "late"), base="2"),
            "null": dict(ledger(1, "late"), base=None),
        }.items():
            with self.subTest(why=why):
                late = self.ask("PUT", "/api/data", body)
                self.assertEqual((late.status, late.json()), (409, {"rev": 2}))
                self.assertEqual(self.stored("db.json"), before, "a refused save writes nothing")
        self.assertEqual(self.save("/api/data", ledger(4, "third"), base=2).json(), {"ok": True, "rev": 3})

    def test_each_door_stores_its_own_document_and_nothing_that_is_not_one(self):
        self.assertEqual(self.save("/api/data", ledger(2), base=0).status, 200)
        self.assertEqual(self.save("/api/cash", plan(banks=2), base=0).status, 200)
        files = {name: self.stored(name) for name in ("db.json", "cash.json")}
        refused = {
            "a ledger without rows": ("/api/data", {"note": "x", "base": 1}),
            "rows that are not a list": ("/api/data", {"tx": {"a": 1}, "base": 1}),
            "a plan at the ledger's door": ("/api/data", dict(plan(banks=3), base=1)),
            "a ledger at the plan's door": ("/api/cash", dict(ledger(3), base=1)),
            "a plan whose banks are not a list": ("/api/cash", {"banks": None, "base": 1}),
            "a list": ("/api/data", [1, 2, 3]),
            "a word": ("/api/data", b'"tx"'),
            "not JSON": ("/api/data", b"{tx: []"),
            "nothing": ("/api/data", b""),
        }
        for why, (door, body) in refused.items():
            with self.subTest(why=why):
                answer = self.ask("PUT", door, body)
                self.assertEqual((answer.status, answer.body), (400, b""))
        self.assertEqual({name: self.stored(name) for name in files}, files)

    def test_the_two_documents_have_a_revision_each(self):
        self.assertEqual(self.save("/api/data", ledger(3), base=0).json()["rev"], 1)
        self.assertEqual(self.save("/api/data", ledger(4), base=1).json()["rev"], 2)
        self.assertEqual(self.ask("GET", "/api/cash").body, b"{}", "the plan has not been saved yet")
        self.assertEqual(self.save("/api/cash", plan(banks=1), base=0).json()["rev"], 1)
        ledger_file = self.stored("db.json")
        self.assertEqual(self.save("/api/cash", plan(banks=2), base=1).json()["rev"], 2)
        self.assertEqual(self.save("/api/cash", plan(banks=3), base=2).json()["rev"], 3)
        self.assertEqual(self.stored("db.json"), ledger_file, "saving the plan never touches the ledger")
        self.assertEqual(self.ask("GET", "/api/data").json()["rev"], 2)
        self.assertEqual(self.ask("GET", "/api/cash").json()["rev"], 3)

    def test_the_last_save_of_a_closing_page_arrives_as_a_post_and_counts_like_any_other(self):
        self.assertEqual(self.save("/api/data", ledger(2), base=0, method="POST").json(), {"ok": True, "rev": 1})
        self.assertEqual(self.save("/api/cash", plan(banks=1), base=0, method="POST").json(), {"ok": True, "rev": 1})
        self.assertEqual(self.save("/api/data", ledger(2), base=0, method="POST").status, 409)
        self.assertEqual(self.ask("GET", "/api/data?whatever=1").json()["rev"], 1)

    def test_a_door_that_does_not_exist_takes_no_save(self):
        for path in ("/api/other", "/api/data/extra", "/", "/index.html", "/data/db.json"):
            with self.subTest(path=path):
                self.assertEqual(self.ask("PUT", path, dict(ledger(1), base=0)).status, 403)
                self.assertEqual(self.ask("POST", path, dict(ledger(1), base=0)).status, 403)
        self.assertEqual(self.ask("GET", "/api/other").status, 404)
        self.assertNothingStored()

    def test_what_it_stores_lies_beside_the_copy_and_nowhere_else(self):
        self.save("/api/data", ledger(2), base=0)
        self.save("/api/cash", plan(banks=1), base=0)
        self.assertEqual(sorted(os.listdir(self.data)), ["cash.json", "db.json"])
        self.assertEqual(json.loads(self.stored("db.json").decode("utf-8"))["rev"], 1)
        self.assertFalse(os.path.lexists(_safety.DATA), "the checkout itself got no data/ folder")
        self.assertEqual(sorted(os.listdir(self.root)), ["data", "index.html", "server.py", "vendor"])


class TwoPagesTests(LaptopCase):
    def test_of_two_saves_from_one_revision_exactly_one_is_stored_and_the_other_is_told_to_reload(self):
        for round_ in range(12):
            base = self.ask("GET", "/api/data").json().get("rev", 0)
            start, answers = threading.Barrier(2), []

            def save(name):
                start.wait(10)
                answers.append((name, self.save("/api/data", ledger(2, "%s in round %d" % (name, round_)), base)))

            pages = [threading.Thread(target=save, args=(name,)) for name in ("mika", "misha")]
            for page in pages:
                page.start()
            for page in pages:
                page.join(30)
            self.assertEqual(sorted(answer.status for _name, answer in answers), [200, 409], round_)
            winner = [name for name, answer in answers if answer.status == 200][0]
            loser = [answer for _name, answer in answers if answer.status == 409][0]
            stored = self.ask("GET", "/api/data").json()
            self.assertEqual((stored["rev"], stored["note"]), (base + 1, "%s in round %d" % (winner, round_)))
            self.assertEqual(loser.json(), {"rev": base + 1})


# ---------------------------------------------------------------------------
# Only its own page
# ---------------------------------------------------------------------------

class OwnPageOnlyTests(LaptopCase):
    def foreign_hosts(self):
        return ["evil.example", "evil.example:%d" % self.port, "127.0.0.1", "localhost", "127.0.0.1:%d" % (self.port + 1),
                "LOCALHOST:%d" % self.port, "[::1]:%d" % self.port, "0.0.0.0:%d" % self.port,
                "127.0.0.1:%d.evil.example" % self.port, ""]

    def test_both_names_of_this_machine_are_its_own(self):
        for host in ("127.0.0.1:%d" % self.port, "localhost:%d" % self.port):
            with self.subTest(host=host):
                self.assertEqual(self.ask("GET", "/", host=host).status, 200)
                self.assertEqual(self.ask("GET", "/api/data", host=host).status, 200)

    def test_a_request_under_any_other_name_reads_nothing(self):
        self.assertEqual(self.save("/api/data", ledger(3, "PRIVATE"), base=0).status, 200)
        for host in self.foreign_hosts():
            with self.subTest(host=host):
                for path in ("/api/data", "/api/cash", "/", "/index.html", "/vendor/reader.js"):
                    answer = self.ask("GET", path, host=host)
                    self.assertEqual((answer.status, answer.body), (403, b""), path)
        # No Host header at all: the first version of the protocol had none.
        self.assertTrue(self.raw(b"GET /api/data HTTP/1.0\r\n\r\n").startswith(b"HTTP/1.0 403 "))

    def test_a_request_under_any_other_name_writes_nothing(self):
        self.assertEqual(self.save("/api/data", ledger(3), base=0).status, 200)
        before = self.stored("db.json")
        for host in self.foreign_hosts():
            with self.subTest(host=host):
                for method in ("PUT", "POST"):
                    self.assertEqual(self.ask(method, "/api/data", dict(ledger(1), base=1), host=host).status, 403)
                    self.assertEqual(self.ask(method, "/api/cash", dict(plan(banks=1), base=0), host=host).status, 403)
        self.assertEqual(self.stored("db.json"), before)
        self.assertEqual(sorted(os.listdir(self.data)), ["db.json"], "no plan was written and no copy was made")

    def test_a_page_of_another_site_can_neither_read_nor_write(self):
        self.assertEqual(self.save("/api/data", ledger(3), base=0).status, 200)
        before = self.stored("db.json")
        foreign = ["https://evil.example", "http://evil.example:%d" % self.port, "null", "",
                   "https://127.0.0.1:%d" % self.port, "http://127.0.0.1", "http://localhost",
                   "http://127.0.0.1:%d" % (self.port + 1), "http://127.0.0.1:%d/" % self.port,
                   "http://127.0.0.1:%d.evil.example" % self.port]
        for origin in foreign:
            with self.subTest(origin=origin):
                self.assertEqual(self.ask("GET", "/api/data", origin=origin).status, 403)
                self.assertEqual(self.ask("GET", "/", origin=origin).status, 403)
                self.assertEqual(self.ask("PUT", "/api/data", dict(ledger(1), base=1), origin=origin).status, 403)
                self.assertEqual(self.ask("POST", "/api/cash", dict(plan(banks=1), base=0), origin=origin).status, 403)
        self.assertEqual(self.stored("db.json"), before)
        self.assertEqual(sorted(os.listdir(self.data)), ["db.json"])

    def test_a_head_request_is_held_to_the_same_checks_as_any_other(self):
        # README, "Who can reach it": the server "refuses any request that did not come from its own page
        # (it checks the Host and Origin headers)". A site that points its own name at 127.0.0.1 is
        # exactly whom the Host check is for; with HEAD it must learn no more than with GET.
        self.assertEqual(self.save("/api/data", ledger(3, "PRIVATE"), base=0).status, 200)
        self.assertEqual(self.save("/api/data", ledger(3, "PRIVATE"), base=1).status, 200)   # leaves a daily copy
        told = []
        for host, origin in (("evil.example:%d" % self.port, None), (self.host, "https://evil.example")):
            for path in ("/", "/index.html", "/vendor/reader.js", "/server.py", "/data/db.json",
                         "/data/backups/" + self.copies()[0]):
                answer = self.ask("HEAD", path, host=host, origin=origin)
                if answer.status != 403:
                    told.append("HEAD %s as %s -> %d, Content-Length %s, Last-Modified %s" % (
                        path, origin or host, answer.status, answer.headers.get("Content-Length"),
                        answer.headers.get("Last-Modified")))
        self.assertEqual(told, [], "a caller that is not the server's own page was answered")

    def test_its_own_page_passes_with_its_origin_and_without_one(self):
        for origin in (None, "http://127.0.0.1:%d" % self.port, "http://localhost:%d" % self.port):
            with self.subTest(origin=origin):
                rev = self.ask("GET", "/api/data", origin=origin).json().get("rev", 0)
                saved = self.ask("PUT", "/api/data", dict(ledger(2), base=rev), origin=origin)
                self.assertEqual((saved.status, saved.json()["rev"]), (200, rev + 1))


# ---------------------------------------------------------------------------
# Which files it hands out
# ---------------------------------------------------------------------------

class FilesTests(LaptopCase):
    def setUp(self):
        super().setUp()
        self.assertEqual(self.save("/api/data", ledger(2, "PRIVATE-LEDGER"), base=0).status, 200)
        self.assertEqual(self.save("/api/data", ledger(2, "PRIVATE-LEDGER"), base=1).status, 200)   # makes a daily copy
        with open(os.path.join(self.root, "notes.txt"), "wb") as handle:
            handle.write(b"PRIVATE-NOTES")

    def test_the_page_and_the_vendor_files_are_handed_out(self):
        for path in ("/", "/index.html", "/?utm=1", "/index.html?v=2"):
            answer = self.ask("GET", path)
            self.assertEqual((answer.status, answer.body), (200, PAGE), path)
            self.assertEqual(answer.headers.get("X-Content-Type-Options"), "nosniff")
        answer = self.ask("GET", "/vendor/reader.js")
        self.assertEqual((answer.status, answer.body), (200, READER))

    def test_nothing_else_in_the_folder_is_handed_out_as_a_file(self):
        backup = self.copies()[0]
        for path in ("/server.py", "/notes.txt", "/data/db.json", "/data/", "/data", "/data/backups/",
                     "/data/backups/" + backup, "/.git/config", "/vendor/../data/db.json", "/vendor/../server.py",
                     "/vendor/..", "/index.html/../data/db.json", "//data/db.json", "/./data/db.json", "/nothing"):
            with self.subTest(path=path):
                answer = self.raw(("GET %s HTTP/1.1\r\nHost: %s\r\n\r\n" % (path, self.host)).encode("ascii"))
                self.assertTrue(answer.startswith(b"HTTP/1.0 404 "), answer[:60])
                self.assertNotIn(b"PRIVATE", answer)

    def test_the_data_folder_cannot_be_reached_through_the_vendor_folder_with_encoded_dots(self):
        # README, "Who can reach it": "Of the files in the folder only index.html and vendor/ are
        # handed out; data/ is read through the server's two doors, by the page, and by nothing else."
        backup = self.copies()[0]
        leaked = []
        for path in ("/vendor/%2e%2e/data/db.json", "/vendor/%2E%2E/data/backups/" + backup, "/vendor/.%2e/data/",
                     "/vendor/%2e./server.py", "/vendor/%2e%2e/notes.txt"):
            answer = self.raw(("GET %s HTTP/1.1\r\nHost: %s\r\n\r\n" % (path, self.host)).encode("ascii"))
            if not answer.startswith(b"HTTP/1.0 404 "):
                leaked.append("%s -> %s" % (path, answer.split(b"\r\n", 1)[0].decode("ascii", "replace")))
        self.assertEqual(leaked, [], "files outside index.html and vendor/ were handed out")


# ---------------------------------------------------------------------------
# The copies it keeps
# ---------------------------------------------------------------------------

class BackupTests(LaptopCase):
    def today(self, moment_before: datetime.date, prefix: str) -> str:
        """The name of today's copy. The day is the machine's own; a test that crosses midnight sees either."""
        names = [name for name in self.copies() if re.fullmatch(r"%s-\d{4}-\d{2}-\d{2}\.json" % prefix, name)]
        self.assertEqual(len(names), 1, self.copies())
        self.assertIn(names[0], ("%s-%s.json" % (prefix, moment_before.isoformat()),
                                 "%s-%s.json" % (prefix, datetime.date.today().isoformat())))
        return names[0]

    def test_the_first_write_of_a_day_copies_the_file_as_it_stood_and_only_that_once(self):
        started = datetime.date.today()
        self.assertEqual(self.save("/api/data", ledger(4, "as the day found it"), base=0).status, 200)
        self.assertEqual(self.copies(), [], "the first save ever has nothing to copy")
        found = self.stored("db.json")
        self.assertEqual(self.save("/api/data", ledger(4, "second"), base=1).status, 200)
        name = self.today(started, "db")
        self.assertEqual(self.stored(os.path.join("backups", name)), found)
        if datetime.date.today() == started:
            self.assertEqual(self.save("/api/data", ledger(4, "third"), base=2).status, 200)
            self.assertEqual(self.copies(), [name], "one copy a day")
            self.assertEqual(self.stored(os.path.join("backups", name)), found, "and it stays what the day started with")

    def test_the_plan_is_kept_the_same_way_under_its_own_name(self):
        started = datetime.date.today()
        self.assertEqual(self.save("/api/cash", plan(banks=2), base=0).status, 200)
        found = self.stored("cash.json")
        self.assertEqual(self.save("/api/cash", plan(banks=3), base=1).status, 200)
        name = self.today(started, "cash")
        self.assertEqual(self.stored(os.path.join("backups", name)), found)
        self.assertEqual([copy for copy in self.copies() if copy.startswith("db-")], [])

    def test_a_refused_save_copies_nothing(self):
        self.assertEqual(self.save("/api/data", ledger(30), base=0).status, 200)
        self.assertEqual(self.save("/api/data", ledger(0), base=5).status, 409)
        self.assertEqual(self.ask("PUT", "/api/data", {"note": "no rows", "base": 1}).status, 400)
        self.assertEqual(self.ask("PUT", "/api/data", dict(ledger(0), base=1), host="evil.example").status, 403)
        self.assertEqual(self.copies(), [])

    def test_a_save_that_drops_more_than_half_of_more_than_twenty_rows_keeps_an_extra_copy(self):
        shrink = r"before-shrink-\d{4}-\d{2}-\d{2}-\d{6}\.json"
        self.assertEqual(self.save("/api/data", ledger(21, "full"), base=0).status, 200)
        full = self.stored("db.json")
        self.assertEqual(self.save("/api/data", ledger(10, "emptied"), base=1).status, 200)     # 10 < 21 / 2
        extra = [name for name in self.copies() if re.fullmatch(shrink, name)]
        self.assertEqual(len(extra), 1, self.copies())
        self.assertEqual(self.stored(os.path.join("backups", extra[0])), full, "the copy is the file as it stood")
        # 10 rows is not "more than 20": emptying it further is editing.
        self.assertEqual(self.save("/api/data", ledger(0), base=2).status, 200)
        self.assertEqual([name for name in self.copies() if re.fullmatch(shrink, name)], extra)

    def test_half_or_more_left_is_editing_and_twenty_rows_are_not_many(self):
        self.assertEqual(self.save("/api/data", ledger(21), base=0).status, 200)
        self.assertEqual(self.save("/api/data", ledger(11), base=1).status, 200)        # 11 is not fewer than 10.5
        self.assertEqual(self.save("/api/data", ledger(20), base=2).status, 200)
        self.assertEqual(self.save("/api/data", ledger(0), base=3).status, 200)         # 20 is not more than 20
        self.assertEqual([name for name in self.copies() if "shrink" in name], [])

    def test_the_rows_of_a_plan_are_counted_in_its_five_lists_together(self):
        shrink = r"cash-before-shrink-\d{4}-\d{2}-\d{2}-\d{6}\.json"
        spread = plan(banks=5, inflows=5, team=5, taxes=3, other=3)                     # 21 rows in five lists
        self.assertEqual(self.save("/api/cash", spread, base=0).status, 200)
        full = self.stored("cash.json")
        self.assertEqual(self.save("/api/cash", plan(banks=5, inflows=5), base=1).status, 200)      # 10 < 21 / 2
        extra = [name for name in self.copies() if re.fullmatch(shrink, name)]
        self.assertEqual(len(extra), 1, self.copies())
        self.assertEqual(self.stored(os.path.join("backups", extra[0])), full)

    def test_the_newest_ninety_daily_copies_are_kept_and_the_other_copies_never_go(self):
        self.assertEqual(self.save("/api/data", ledger(3), base=0).status, 200)
        os.mkdir(self.backups)
        first = datetime.date(2025, 1, 1)
        old = ["db-%s.json" % (first + datetime.timedelta(days=day)).isoformat() for day in range(95)]
        kept_for_good = ["before-shrink-2025-01-01-120000.json", "before-shrink-2025-01-02-120000.json",
                         "cash-2025-01-01.json", "cash-before-shrink-2025-01-01-120000.json", "by-hand.json"]
        for name in old + kept_for_good:
            with open(os.path.join(self.backups, name), "wb") as handle:
                handle.write(b"{}")
        started = datetime.date.today()
        self.assertEqual(self.save("/api/data", ledger(3), base=1).status, 200)         # today's copy, then the pruning
        daily = [name for name in self.copies() if re.fullmatch(r"db-\d{4}-\d{2}-\d{2}\.json", name)]
        self.assertEqual(len(daily), 90)
        self.assertEqual(daily[:89], old[6:], "the six oldest went, the newest stayed")
        self.assertIn(daily[-1], ("db-%s.json" % started.isoformat(), "db-%s.json" % datetime.date.today().isoformat()))
        for name in kept_for_good:
            self.assertIn(name, self.copies())


# ---------------------------------------------------------------------------
# A data file that cannot be read
# ---------------------------------------------------------------------------

class BrokenFileTests(LaptopCase):
    BROKEN = {
        "cut short": b'{"tx": [{"id": "t-0", "a": 1',
        "empty": b"",
        "not JSON at all": b"\x00\xff garbage",
        "a list": b"[1, 2, 3]",
    }

    def setUp(self):
        super().setUp()
        self.assertEqual(self.save("/api/data", ledger(5, "good"), base=0).status, 200)
        self.assertEqual(self.save("/api/cash", plan(banks=2), base=0).status, 200)

    def break_ledger(self, content: bytes) -> None:
        with open(os.path.join(self.data, "db.json"), "wb") as handle:
            handle.write(content)

    def test_a_broken_ledger_file_does_not_stop_the_server_or_the_plan(self):
        for why, content in self.BROKEN.items():
            with self.subTest(why=why):
                self.break_ledger(content)
                answer = self.ask("GET", "/api/data")
                self.assertEqual((answer.status, answer.body), (200, content), "handed over as it lies, not judged")
                self.assertEqual(self.ask("GET", "/").body, PAGE)
                rev = self.ask("GET", "/api/cash").json()["rev"]
                self.assertEqual(self.save("/api/cash", plan(banks=3), base=rev).json(), {"ok": True, "rev": rev + 1})
        self.assertIsNone(self.process.poll(), "the server is still running")

    def test_a_page_that_read_the_file_before_it_broke_cannot_save_over_it(self):
        for why, content in self.BROKEN.items():
            with self.subTest(why=why):
                self.break_ledger(content)
                late = self.save("/api/data", ledger(6, "from an open page"), base=1)
                self.assertEqual(late.status, 409)
                self.assertEqual(self.stored("db.json"), content, "the broken file was not written over")
        self.assertEqual(self.copies(), [])

    def test_a_half_written_temporary_file_is_never_read_and_is_gone_after_the_next_save(self):
        good = self.stored("db.json")
        left = os.path.join(self.data, "db.json.tmp")           # what a crash in the middle of a save leaves
        with open(left, "wb") as handle:
            handle.write(b'{"tx": [{"id": "half of a newer led')
        self.assertEqual(self.ask("GET", "/api/data").body, good)
        self.assertEqual(self.save("/api/data", ledger(5, "after the crash"), base=1).json(), {"ok": True, "rev": 2})
        self.assertFalse(os.path.exists(left))
        self.assertEqual(self.ask("GET", "/api/data").json()["note"], "after the crash")

    def test_what_a_save_puts_over_a_broken_file_is_copied_aside_first(self):
        # The file reads as revision 0 once it cannot be parsed, so a page that starts empty may
        # save over it. Whether it should is not this test's rule; that the bytes survive is.
        content = self.BROKEN["cut short"]
        self.break_ledger(content)
        started = datetime.date.today()
        answer = self.save("/api/data", ledger(1, "a page that loaded nothing"), base=0)
        if answer.status != 200:
            self.assertEqual(self.stored("db.json"), content)
            return
        daily = [name for name in self.copies() if re.fullmatch(r"db-\d{4}-\d{2}-\d{2}\.json", name)]
        self.assertEqual(len(daily), 1, self.copies())
        self.assertIn(daily[0], ("db-%s.json" % started.isoformat(), "db-%s.json" % datetime.date.today().isoformat()))
        self.assertEqual(self.stored(os.path.join("backups", daily[0])), content)

    def test_the_copy_the_day_started_with_outlives_a_file_that_broke_later(self):
        self.assertEqual(self.save("/api/data", ledger(5, "second"), base=1).status, 200)       # the day's copy: "good"
        self.assertEqual(len(self.copies()), 1)
        name = self.copies()[0]
        good = self.stored(os.path.join("backups", name))
        self.assertEqual(json.loads(good.decode("utf-8"))["note"], "good")
        self.break_ledger(self.BROKEN["empty"])
        self.save("/api/data", ledger(0, "a page that loaded nothing"), base=0)
        self.assertIn(name, self.copies())
        self.assertEqual(self.stored(os.path.join("backups", name)), good, "whatever was saved over the broken file")


if __name__ == "__main__":
    unittest.main()
