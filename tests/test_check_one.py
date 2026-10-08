"""``scripts/check-one`` runs one check of the page on the Mac; what it must refuse, it refuses before any browser.

It is the one place where a browser runs outside CI (the owner's decision of 8 October 2026: until then nothing with
node or Chromium ran on the Mac at all). So its edges are held here: never the whole file, never beside a ledger,
never with tools it would have to fetch, and nothing left behind. No node is needed for any of this - a stand-in
script takes its place, and every refusal stops before it would be started.

    python3 -m unittest tests.test_check_one
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import os
import shutil
import subprocess
import tempfile
import unittest

CHECKOUT = _safety.CHECKOUT
SCRIPT = os.path.join(CHECKOUT, "scripts", "check-one")

#: Stands in for node: says what it was handed, and what lay in the copy while it ran.
STAND_IN = """#!/bin/sh
{
  echo "args=$*"
  echo "ONLY=$ONLY"
  echo "PUB=$PUB"
  echo "page=$(cat "$PUB/money/index.html")"
  echo "vendor=$(ls "$PUB/money/vendor" | tr '\n' ' ')"
  echo "beside=$(ls "$(dirname "$1")" | tr '\n' ' ')"
} > "$SEEN"
exit 7
"""


class CheckOneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="money-check-one-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = os.path.join(self.tmp, "checkout")
        self.tools = os.path.join(self.tmp, "tools")
        self.seen = os.path.join(self.tmp, "seen")
        os.makedirs(os.path.join(self.root, "scripts"))
        os.makedirs(os.path.join(self.root, "vendor"))
        shutil.copy(SCRIPT, os.path.join(self.root, "scripts", "check-one"))
        self.write(os.path.join(self.root, "package.json"), '{\n  "devDependencies": {\n    "playwright": "1.2.3"\n  }\n}\n')
        self.write(os.path.join(self.root, "index.html"), "the page")
        self.write(os.path.join(self.root, "vendor", "a.js"), "")
        self.write(os.path.join(self.root, "scripts", "money-checks.mjs"), "")
        self.write(os.path.join(self.root, "scripts", "money-demo.mjs"), "")

    @staticmethod
    def write(path, text):
        with open(path, "w") as handle:
            handle.write(text)

    def tools_with(self, version):
        os.makedirs(os.path.join(self.tools, "node", "bin"))
        os.makedirs(os.path.join(self.tools, "node_modules", "playwright"))
        node = os.path.join(self.tools, "node", "bin", "node")
        self.write(node, STAND_IN)
        os.chmod(node, 0o755)
        self.write(os.path.join(self.tools, "node_modules", "playwright", "package.json"),
                   '{\n  "name": "playwright",\n  "version": "%s"\n}\n' % version)

    def check_one(self, *keys):
        environ = dict(os.environ, MONEY_TOOLS=self.tools, SEEN=self.seen)
        done = subprocess.run(["/bin/sh", os.path.join(self.root, "scripts", "check-one")] + list(keys),
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
                              env=environ, timeout=60)
        return done.returncode, done.stderr.decode("utf-8", "replace")

    def refused(self, keys, words):
        code, said = self.check_one(*keys)
        self.assertEqual(code, 2, said)
        self.assertIn(words, said)
        self.assertFalse(os.path.exists(self.seen), "node was started all the same")

    def test_the_real_script_is_what_is_tested_and_it_can_be_run(self):
        self.assertTrue(os.access(SCRIPT, os.X_OK), "scripts/check-one is not executable")

    def test_without_a_key_it_runs_nothing_the_whole_file_is_cis(self):
        self.tools_with("1.2.3")
        self.refused([], "never the whole file")

    def test_a_key_is_letters_digits_and_little_else(self):
        self.tools_with("1.2.3")
        for key in ("", "a;b", "$(id)", "a,b", "получено"):
            self.refused([key], "a key is letters, digits, spaces, dots and dashes")

    def test_beside_a_ledger_it_runs_nothing(self):
        self.tools_with("1.2.3")
        os.makedirs(os.path.join(self.root, "data"))
        self.refused(["rv-x"], "checks are not run beside a ledger")

    def test_it_installs_nothing_tools_that_are_not_there_are_said_to_be_missing(self):
        self.refused(["rv-x"], "are not set up")
        self.assertFalse(os.path.exists(self.tools), "it made the tools folder itself")

    def test_another_playwright_than_package_json_names_is_refused(self):
        self.tools_with("9.9.9")
        self.refused(["rv-x"], "package.json names 1.2.3")

    def test_it_runs_the_named_checks_on_a_copy_and_leaves_nothing_behind(self):
        self.tools_with("1.2.3")
        code, said = self.check_one("rv-x", "p5 on screen")
        if "already going" in said:
            self.skipTest("a real run of the page's checks is going on this machine")
        self.assertEqual(code, 7, said)                     # node's own answer is the script's
        with open(self.seen) as handle:
            seen = dict(line.rstrip("\n").split("=", 1) for line in handle)
        self.assertEqual(seen["ONLY"], "rv-x,p5 on screen")
        self.assertTrue(seen["PUB"].startswith(os.path.join(self.tools, "run.")), seen["PUB"])
        self.assertTrue(seen["args"].endswith("/scripts/money-checks.mjs"))
        self.assertTrue(seen["args"].startswith(os.path.join(self.tools, "run.")), "the checks ran from the checkout")
        self.assertEqual([seen["page"], seen["vendor"].split(), seen["beside"].split()],
                         ["the page", ["a.js"], ["money-checks.mjs", "money-demo.mjs"]])
        self.assertEqual(sorted(os.listdir(self.tools)), ["node", "node_modules"], "the copy was left behind")
        self.assertEqual(sorted(os.listdir(self.root)), ["index.html", "package.json", "scripts", "vendor"], "the checkout was written to")


if __name__ == "__main__":
    unittest.main()
