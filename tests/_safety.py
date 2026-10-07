"""Tests do not run in a folder that holds a ledger.

Every test module imports this first::

    from tests import _safety  # noqa: F401

The laptop tool keeps the studio's real money in ``<checkout>/data``. A test run
there could one day write into it, so the run stops before the first test - not
with a failed test, with the process ending (exit code 2). The same when the
suite is started inside a stand, with ``MONEY_STAND=prod`` or ``test`` in the
environment: tests belong on a development clone.

The stop is ``os._exit``: unittest's discovery swallows every exception an
import raises, ``SystemExit`` included, and would go on to run the other files.
"""
import os
import sys

__all__ = ["CHECKOUT", "DATA", "refusal", "check"]

#: The root of this checkout: the folder that holds ``tests/`` and ``moneyd/``.
CHECKOUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
#: Where the laptop tool keeps the ledger. It must not exist where tests run.
DATA = os.path.join(CHECKOUT, "data")


def refusal(checkout: str = CHECKOUT, environ=None):
    """Why tests must not run here, as one sentence; None when they may."""
    environ = os.environ if environ is None else environ
    data = os.path.join(checkout, "data")
    if os.path.lexists(data):
        return ("%s exists: this folder holds a ledger. Tests run only in a development clone "
                "that has no data/ folder." % data)
    stand = (environ.get("MONEY_STAND") or "").strip()
    if stand in ("prod", "test"):
        return "MONEY_STAND=%s is set: tests do not run inside a stand." % stand
    return None


def check() -> None:
    """End the process when tests must not run here."""
    why = refusal()
    if why is not None:
        sys.stderr.write("\nmoney tests refused: %s\n" % why)
        sys.stderr.flush()
        try:
            sys.stdout.flush()
        except (OSError, ValueError):
            pass
        os._exit(2)


check()
