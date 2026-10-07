"""The laptop tool is not touched by the hosted work: its two files are pinned by sha256.

``server.py`` and ``Запустить Money.command`` are everything that runs on the owner's Mac,
in the folder that holds the real ledger. ``server.py`` has no sign-in; all that guards the
ledger there is that it listens on 127.0.0.1 and checks Host and Origin. The hosted service
(``moneyd/``) is a separate program for exactly that reason, and nothing done for it may
change a byte of these two files.

    python3 -m unittest tests.test_laptop_frozen

IF A TEST HERE FAILS, one of two things happened:

1. The file was changed by accident - an editor, a formatter, a merge, a search-and-replace
   across the repository. Put the file back as git has it; do not touch the pin.

2. The laptop tool was changed on purpose. That is the owner's decision, not a side effect of
   other work: the change reaches the Mac that holds the real ledger at its next
   ``git pull``. Then, in the SAME commit as the change:
     - run ``python3 -m unittest tests.test_laptop_server`` (it drives a copy of
       ``server.py`` in a temporary directory) and extend it for what changed;
     - replace the pin below with the new ``shasum -a 256 <file>``;
     - say in the commit message that the laptop tool changed, and why.

A pin that is updated without the second half of that list has stopped doing its work.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import hashlib
import os
import re
import unittest

CHECKOUT = _safety.CHECKOUT

SERVER = "server.py"
LAUNCHER = "Запустить Money.command"

#: sha256 of the two files as they stood on 7 October 2026 - unchanged since the repository's first commit.
PINS = {
    SERVER: "37ec10a5f06b1bb925ad076a9f3181e99a22cef90da91f5e2b74bade8bf69de5",
    LAUNCHER: "078fb2b348841ebc97c0e52dd903d643e64bc0b27994190c2ee2a8c1f26d963e",
}

WHAT_IT_MEANS = (
    "\n\n%(name)s is part of the LAPTOP TOOL and is not what git pinned any more."
    "\n  pinned: %(pinned)s\n  found:  %(found)s"
    "\nThe laptop tool runs beside the owner's real ledger and is never edited by the hosted work."
    "\n- Changed by accident? Put the file back as git has it and leave the pin alone."
    "\n- Changed on purpose, on the owner's word? Then in the same commit: run and extend"
    "\n  tests/test_laptop_server.py, replace the pin in tests/test_laptop_frozen.py with the new"
    "\n  sha256, and say in the commit message that the laptop tool changed and why."
)


def sha256_of(name):
    with open(os.path.join(CHECKOUT, name), "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


class LaptopFrozenTests(unittest.TestCase):
    def assertPinned(self, name):
        path = os.path.join(CHECKOUT, name)
        self.assertTrue(os.path.isfile(path),
                        "%s is gone. It is the laptop tool: the owner's Mac runs it from this repository. "
                        "Put it back as git has it." % name)
        found = sha256_of(name)
        self.assertEqual(found, PINS[name], WHAT_IT_MEANS % {"name": name, "pinned": PINS[name], "found": found})

    def test_server_py_is_byte_for_byte_the_pinned_laptop_server(self):
        self.assertPinned(SERVER)

    def test_the_launcher_is_byte_for_byte_the_pinned_file(self):
        self.assertPinned(LAUNCHER)

    def test_a_pin_is_a_whole_sha256_and_there_is_one_for_each_of_the_two_files(self):
        self.assertEqual(sorted(PINS), sorted([SERVER, LAUNCHER]))
        for name, pin in PINS.items():
            self.assertRegex(pin, r"^[0-9a-f]{64}$", "the pin of %s is not a whole sha256" % name)

    def test_the_launcher_is_the_only_command_file_and_can_still_be_double_clicked(self):
        commands = sorted(name for name in os.listdir(CHECKOUT) if name.endswith(".command"))
        self.assertEqual(commands, [LAUNCHER], "the laptop tool has one launcher, under the name the owner knows")
        self.assertTrue(os.access(os.path.join(CHECKOUT, LAUNCHER), os.X_OK),
                        "%s lost its executable bit: a double click in Finder no longer starts Money. "
                        "The mode is part of what git tracks (100755); put it back." % LAUNCHER)

    def test_the_launcher_starts_the_pinned_server_and_nothing_else(self):
        # Pinned bytes can only say this, but the sentence is what a reader needs: the launcher runs
        # server.py beside itself with the system's own Python, and opens the loopback address.
        with open(os.path.join(CHECKOUT, LAUNCHER), "rb") as handle:
            text = handle.read().decode("utf-8")
        self.assertIn('cd "$(dirname "$0")"', text)
        self.assertRegex(text, r"(?m)^exec /usr/bin/python3 server\.py$")
        self.assertRegex(text, r'(?m)^URL="http://127\.0\.0\.1:\$PORT"$')
        self.assertIsNone(re.search(r"moneyd|MONEY_|docker|0\.0\.0\.0", text),
                          "the launcher knows nothing of the hosted service")


if __name__ == "__main__":
    unittest.main()
