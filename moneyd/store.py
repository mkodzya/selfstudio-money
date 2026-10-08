"""The two documents as files: revisions, atomic writes, snapshots, restore.

API for the HTTP layer and the CLI
----------------------------------
At boot (``__main__``; ``ctl`` may call it too, it changes nothing the second time)::

    prepare_data_dir(settings.data_dir, settings.stand)     # raises DataDirError (a BootRefusal)
    stores = open_stores(settings, clock, security_log)     # {"ledger": DocStore, "plan": DocStore}

One ``DocStore`` per document; every method is safe to call from many threads,
and ``ctl`` (another process) may work on the same directory at the same time::

    store.read() -> Envelope(rev, updated_at, body, rows)
        ``body`` is the GET answer byte for byte: ``{"rev":N,"doc":{...},"updatedAt":"...Z"}``.
        Never saved: ``{"rev":0,"doc":{},"updatedAt":null}``. Raises ``Damaged``.

    store.save(base, doc, who) -> SaveResult(rev, rows, bytes, updated_at, snapshot)
        ``base`` and ``doc`` are the two members of the PUT body exactly as the
        JSON parser returned them (``fields_of(body)`` picks them out of
        whatever the body was). ``rev`` is ``base + 1`` - or one above the
        floor, when ``raise_floor`` lifted that over the stored revision.
        What it raises, in the order it is checked -
        the body first, as in the platform's route file, then the stored state:
          BadDoc      400 bad_money_doc     base not a whole number >= 0; doc not a string;
                                            doc not JSON / NaN / too deep / not UTF-8;
                                            not an object; no ``tx`` list (ledger) / ``banks`` list (plan)
          TooLarge    413 body_too_large    the document is over the door's limit
          Busy        503 storage_busy      the lock could not be had in time
          Damaged     503 storage_damaged   the stored file cannot be trusted; nothing is written
          Stale       409 money_stale       ``.rev`` is the stored revision; nothing is written
          NoSpace     507 storage_failed    free space is not above 3 x the document + 64 MB
          StorageFailed 507 storage_failed  the disk refused the write (NoSpace is one of these);
                                            what was stored is untouched

    store.revision() -> int                 # 0 when never saved; raises Damaged (``ctl empty``)
    store.check_space(content_length)       # raises NoSpace; lets the door refuse before reading a body
    store.snapshots() -> [Snapshot(name, kind, rev, taken, bytes)]      newest first: by revision
    store.check_snapshot(name) -> (rev, rows)                           unpacks and reads it back
    store.restore(name, who) -> RestoreResult(rev, from_rev, replaced_rev, snapshot, kept)
        The snapshot becomes revision "highest ever + 1", so every open page
        gets 409. Raises ``NoSuchSnapshot``, ``BadSnapshot``.
    store.raise_floor(n, who="ctl") -> FloorResult(floor, was, rev)
        Lifts the number in ``EVER_SAVED`` to at least ``n``; never lowers it,
        never touches the document. Every later save and restore is a
        revision above it. For a stand put back from a backup and for the
        cut-over: the stored revision is then behind what open pages hold.
        ``Refused`` (403) for a number below 0 or longer than 15 digits.
    store.floor() -> int          the number no later revision goes at or below; 0 when there is none
    store.purge(older_than_days, stand, who="ctl") -> int      test and dev only, and never beside
                                                               ``REAL_DATA``, else ``Refused``
    store.status() -> dict        state, rev, rows, sizes, floor, snapshot counts, the newest snapshot. Never contents.

Every ``StoreError`` is a ``config.Refusal``: ``status``, ``code``, ``message``
(a fixed English sentence - for the two documents the platform's own),
``extra()`` (``{"rev": N}`` on ``Stale``) and ``body()``, the whole JSON answer.

For ``ctl``::

    doctor(data_dir, stand=None, clock=utcnow) -> dict      what is wrong, and which snapshot brings a
                                                            damaged document back: the newest that reads back
    verify(data_dir, deep=True) -> dict                     the same for any directory, read-only; counts only
    read_stand_marker(data_dir) -> str | None               what <data>/STAND says
    has_run(data_dir) -> bool                               the stand has been through its first start here
    holds_real_data(data_dir) -> bool                       a person has put <data>/REAL_DATA there

For the HTTP layer's own bodies::

    parse_json(data, max_depth=16) -> object    str or bytes; ValueError on anything that is not
                                                JSON within the depth (never RecursionError)
    json_depth_ok(data, max_depth) -> bool      the check parse_json runs first; bytes or str

Shared with ``auth``: ``atomic_write`` (raises ``OSError``; ``Unsynced`` when the
file is in place and only the directory's sync failed), ``FileLock`` (raises
``LockTimeout``), ``has_run``.

On disk
-------
::

    <data>/STAND                                  the stand's name; another name stops the boot.
                                                  Written last by the first start: with it there,
                                                  a directory below that is missing was lost
    <data>/REAL_DATA                              only when a person put it there, by hand: the documents
                                                  are real. Its presence is the fact, its content is free
                                                  text and is never read. Nothing here makes or removes it;
                                                  beside it no copy is purged and ``ctl`` takes no seed
    <data>/<kind>/current.json                    the GET answer
    <data>/<kind>/EVER_SAVED                      ASCII digits and a newline. Written with the first save:
                                                  "missing" then means "lost". The number is the highest
                                                  revision given out - or a higher one put there by
                                                  ``raise_floor``; no later revision is at or below it
    <data>/<kind>/NEVER_SAVED                     only between ``raise_floor`` on a document never saved
                                                  and its first save: the marker is a bare floor
    <data>/<kind>/.lock                           flock: the server and ctl are two processes
    <data>/<kind>/snapshots/day-YYYY-MM-DD-revNNNNNN.json.gz       the document as the day found it
    <data>/<kind>/snapshots/shrink-<utc>-revNNNNNN.json.gz         before a save that dropped most rows
    <data>/<kind>/snapshots/restore-<utc>-revNNNNNN.json.gz        what a restore replaced

A file is never changed in place: temporary file, fsync, rename, fsync of the
directory. ``current.json`` has one exact layout, the one ``save`` writes;
anything else - cut short, reformatted by hand, the laptop's bare document - is
``Damaged`` and is never read as revision 0.

Lost is not "never saved". A ``current.json`` that is not there is ``Damaged``
when the marker says the document was saved, when copies of it lie in
``snapshots/``, when its whole directory has gone on a stand that has run
before, or when the data directory itself has gone. Only a document with none
of these answers ``{"rev":0,"doc":{},"updatedAt":null}``.

Time comes from the injected ``clock`` (a callable returning a UTC datetime).
Waiting for a lock is the one thing measured on the real clock.
"""
import contextlib
import datetime
import errno
import fcntl
import gzip
import io
import json
import os
import re
import secrets
import threading
import time
import zlib
from typing import Any, Callable, Dict, Iterable, Iterator, List, NamedTuple, Optional, Tuple

from .config import BootRefusal, Clock, Refusal, STANDS, as_utc, iso_ms, parse_iso, parse_stamp, stamp, utcnow

__all__ = [
    "KINDS", "DocStore", "Envelope", "SaveResult", "RestoreResult", "FloorResult", "Snapshot",
    "StoreError", "BadDoc", "Stale", "TooLarge", "Damaged", "StorageFailed", "NoSpace", "Busy",
    "NoSuchSnapshot", "BadSnapshot", "Refused", "DataDirError", "LockTimeout", "Unsynced",
    "prepare_data_dir", "read_stand_marker", "has_run", "holds_real_data", "open_stores", "doctor", "verify",
    "fields_of",
    "parse_json", "json_depth_ok", "atomic_write", "FileLock",
]

MIB = 1024 * 1024

KINDS = ("ledger", "plan")

#: Under this many rows, losing half of them is an afternoon's editing and not a page that loaded badly.
SMALL = 20
#: Deepest nesting of a stored document. The page's own documents are about six deep.
MAX_DEPTH = 64
#: Free space a save needs beyond three times the document.
SPACE_MARGIN = 64 * MIB
#: The highest number a floor may be: fifteen digits. The revision after it still has sixteen,
#: which is what a stored file's head may carry and what a browser counts exactly (below 2**53).
FLOOR_MAX = 10 ** 15 - 1

STAND_FILE = "STAND"
#: A person's own marker in the root of a data directory: "the documents here are real".
#: See ``holds_real_data``. The deploy scripts look for the same name on the host.
REAL_DATA_FILE = "REAL_DATA"
LAPTOP_LAYOUT = ("db.json", "cash.json", "backups")
_STAND_OWNED = ("ledger", "plan", "auth", "security.log")

EMPTY_BODY = b'{"rev":0,"doc":{},"updatedAt":null}'

_CLOEXEC = getattr(os, "O_CLOEXEC", 0)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class StoreError(Refusal):
    """Base of what a document door answers with: ``status``, ``code``, ``message``, ``extra()``, ``body()``."""


class BadDoc(StoreError):
    """The body is not this door's document. Nothing was written."""
    status = 400
    code = "bad_money_doc"


class Stale(StoreError):
    """Somebody saved after this copy was read. ``rev`` is where the document is now."""
    status = 409
    code = "money_stale"

    def __init__(self, message: str, rev: int):
        super().__init__(message)
        self.rev = rev

    def extra(self) -> Dict[str, Any]:
        return {"rev": self.rev}


class TooLarge(StoreError):
    status = 413
    code = "body_too_large"


class Damaged(StoreError):
    """The stored file cannot be trusted. It is never read as revision 0 and never written over."""
    status = 503
    code = "storage_damaged"


class StorageFailed(StoreError):
    """The disk refused. Whatever was stored before is still there, whole."""
    status = 507
    code = "storage_failed"


class NoSpace(StorageFailed):
    """Not enough free space to write safely."""


class Busy(StoreError):
    """The document's lock could not be had in time (``ctl`` is holding it, or a save hangs)."""
    status = 503
    code = "storage_busy"


class NoSuchSnapshot(StoreError):
    status = 404
    code = "no_such_snapshot"


class BadSnapshot(StoreError):
    """A snapshot that cannot be read back as this document."""
    status = 422
    code = "bad_snapshot"


class Refused(StoreError):
    """The operation is not allowed on this stand (purging snapshots anywhere but test and dev)."""
    status = 403
    code = "refused"


class DataDirError(BootRefusal):
    """The data directory must not be used by this process."""


class LockTimeout(Exception):
    """``FileLock`` waited as long as it was allowed to."""


class Unsynced(OSError):
    """``atomic_write`` put the new file in place, but its directory could not be synced.

    Every reader already sees the new file, so the write has happened; what is
    not confirmed is that it survives a power cut. It is an ``OSError``: a
    caller that does not tell the two apart treats it as a write that failed.
    """


# ---------------------------------------------------------------------------
# Files: whole or not at all
# ---------------------------------------------------------------------------

def _fsync_dir(directory: str) -> None:
    try:
        fd = os.open(directory, os.O_RDONLY | _CLOEXEC)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError as error:
        # Some filesystems cannot sync a directory; the rename has still happened.
        if error.errno not in (errno.EINVAL, errno.ENOTSUP, errno.EBADF, errno.EACCES):
            raise
    finally:
        os.close(fd)


def atomic_write(path: str, chunks: Iterable[bytes], mode: int = 0o600, sync: bool = True) -> None:
    """Replace ``path`` with ``chunks`` so that a reader sees the old bytes or the new, never a mixture.

    Temporary file in the same directory (``<name>.tmp-<pid>-<random>``), write,
    ``fsync``, rename over, ``fsync`` of the directory. ``sync=False`` skips the
    two fsyncs for a file whose loss a crash may cost. Raises ``OSError`` and
    leaves no temporary file behind.

    One ``OSError`` is not "nothing was written": ``Unsynced`` is raised when
    the rename has happened and only the sync of the directory failed. The new
    file is then what every reader gets.
    """
    directory = os.path.dirname(path) or "."
    temporary = "%s.tmp-%d-%s" % (path, os.getpid(), secrets.token_hex(4))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | _CLOEXEC, mode)
    try:
        try:
            os.fchmod(fd, mode)
            for chunk in chunks:
                view = memoryview(chunk)
                while view:
                    view = view[os.write(fd, view):]
            if sync:
                os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    if sync:
        try:
            _fsync_dir(directory)
        except OSError as error:
            raise Unsynced(error.errno, "the file is in place, but its directory could not be synced") from error


class FileLock:
    """An exclusive ``flock`` on a lock file, with a bounded wait.

    ``with FileLock(path, timeout=10.0): ...`` - raises ``LockTimeout`` when the
    lock stays taken, ``OSError`` when the lock file cannot be opened. The lock
    belongs to the open file, so two objects in one process exclude each other
    just as two processes do.
    """

    def __init__(self, path: str, timeout: float = 10.0):
        self._path = path
        self._timeout = timeout
        self._fd = None  # type: Optional[int]

    def __enter__(self) -> "FileLock":
        fd = os.open(self._path, os.O_RDWR | os.O_CREAT | _CLOEXEC, 0o600)
        deadline = time.monotonic() + self._timeout
        try:
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError as error:
                    if error.errno not in (errno.EAGAIN, errno.EWOULDBLOCK):
                        raise
                    if time.monotonic() >= deadline:
                        raise LockTimeout(self._path)
                    time.sleep(0.01)
        except BaseException:
            os.close(fd)
            raise
        self._fd = fd
        return self

    def __exit__(self, *_exc: Any) -> None:
        fd, self._fd = self._fd, None
        if fd is not None:
            os.close(fd)   # closing the descriptor releases the lock


def _free_bytes(path: str) -> int:
    usage = os.statvfs(path)
    return usage.f_bavail * usage.f_frsize


# ---------------------------------------------------------------------------
# JSON that cannot hurt the process
# ---------------------------------------------------------------------------

_KEEP = b'"[]{}'
_DELETE = bytes(byte for byte in range(256) if byte not in _KEEP)
_UNIFY = bytes.maketrans(b"[]", b"{}")
_QUOTED = re.compile(rb'"[^"]*"')


def json_depth_ok(data: Any, max_depth: int) -> bool:
    """Whether arrays and objects in ``data`` nest at most ``max_depth`` deep.

    Python's parser recurses once per level, and on a small thread stack deep
    nesting ends the process before it raises anything. So the depth is measured
    first, without recursion and without building anything per token: escapes
    are dropped, everything but quotes and brackets is deleted, strings are
    removed, and what is left is peeled one level per pass.

    Exact for valid JSON. For anything else it may say either, but it never
    passes a text the parser would follow deeper than ``max_depth``.
    """
    if isinstance(data, str):
        data = data.encode("utf-8", "surrogatepass")
    if data.count(b"[") + data.count(b"{") <= max_depth:
        return True
    # \\ first, then \": what is left of a backslash run decides whether the quote after it is real.
    marks = data.replace(b"\\\\", b"").replace(b'\\"', b"").translate(None, _DELETE)
    # Two quotes with nothing between are an empty string, or the end of one string and the start
    # of the next; dropping them either way leaves every bracket on the side of the quotes it was on.
    marks = marks.replace(b'""', b"")
    if b'"' in marks:
        outside = bytearray()
        at = 0
        for quoted in _QUOTED.finditer(marks):
            outside += marks[at:quoted.start()]
            at = quoted.end()
        outside += marks[at:]
        if b'"' in outside:
            return False        # a string that never ends
        marks = bytes(outside)
    marks = marks.translate(_UNIFY)
    for _ in range(max_depth):
        if not marks:
            return True
        peeled = marks.replace(b"{}", b"")
        if len(peeled) == len(marks):
            return False        # brackets that do not pair
        marks = peeled
    return not marks


def _no_constants(name: str) -> Any:
    raise ValueError("%s is not JSON" % name)


def parse_json(data: Any, max_depth: int = 16) -> Any:
    """Parse a request body. ``data`` is ``bytes`` (UTF-8) or ``str``.

    Raises ``ValueError`` for anything that is not JSON as a browser's
    ``JSON.parse`` understands it (``NaN`` and ``Infinity`` are not), that is
    not UTF-8, or that nests deeper than ``max_depth``. Never ``RecursionError``.
    """
    if isinstance(data, str):
        raw = data.encode("utf-8")
        text = data
    elif isinstance(data, (bytes, bytearray, memoryview)):
        raw = bytes(data)
        text = raw.decode("utf-8")
    else:
        raise ValueError("a JSON text is bytes or str")
    if not json_depth_ok(raw, max_depth):
        raise ValueError("nested deeper than %d levels" % max_depth)
    try:
        return json.JSONDecoder(parse_constant=_no_constants).decode(text)
    except RecursionError:
        raise ValueError("nested too deeply")


def fields_of(body: Any) -> Tuple[Any, Any]:
    """``(base, doc)`` out of a parsed PUT body, whatever the body turned out to be.

    A body that is not an object has neither, and ``save`` then answers what the
    platform does: ``400 bad_money_doc``.
    """
    if isinstance(body, dict):
        return body.get("base"), body.get("doc")
    return None, None


# ---------------------------------------------------------------------------
# What a document is
# ---------------------------------------------------------------------------

class _Kind(NamedTuple):
    key: str
    name: str                 # as a refusal names it, in the middle of a sentence
    need: str                 # the list a document of this kind cannot be without
    lists: Tuple[str, ...]    # where its rows are
    not_one: str
    max_bytes: int


_KINDS = {
    "ledger": _Kind("ledger", "the ledger", "tx", ("tx",),
                    "doc is not a ledger: it has no list of rows.", 16 * MIB),
    # A plan keeps its rows in five lists, and a row is a row in any of them:
    # a plan that lost every payout still has all of its banks.
    "plan": _Kind("plan", "the cash plan", "banks", ("banks", "inflows", "team", "taxes", "other"),
                  "doc is not a cash plan: it has no list of banks.", 4 * MIB),
}


class _Leaf(object):
    __slots__ = ()


#: Stands for any object none of whose members is a list - every row of a ledger.
_LEAF = _Leaf()


def _shape(pairs: List[Tuple[str, Any]]) -> Any:
    """The parser's hook: keep of an object only which members are lists and how long.

    So a 16 MiB ledger is checked without its rows ever being held. A member
    named twice counts as its last value, as in ``JSON.parse``.
    """
    lists = None  # type: Optional[Dict[str, int]]
    for key, value in pairs:
        if type(value) is list:
            if lists is None:
                lists = {}
            lists[key] = len(value)
        elif lists is not None:
            lists.pop(key, None)
    return _LEAF if lists is None else lists


def _decoder() -> json.JSONDecoder:
    return json.JSONDecoder(object_pairs_hook=_shape, parse_constant=_no_constants)


def _is_kind(shape: Any, kind: _Kind) -> bool:
    return type(shape) is dict and kind.need in shape


def _rows(shape: Any, kind: _Kind) -> int:
    if type(shape) is not dict:
        return 0
    return sum(shape.get(name, 0) for name in kind.lists)


_HEAD = re.compile(r'\{"rev":([1-9][0-9]{0,15}),"doc":')
_HEAD_BYTES = re.compile(rb'\{"rev":([1-9][0-9]{0,15}),"doc":\{')
_TAIL = re.compile(r',"updatedAt":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z)"\}[ \t\r\n]*')


class _Parsed(NamedTuple):
    rev: int
    updated_at: str
    rows: int
    text: str
    doc_start: int
    doc_end: int


def _parse_envelope(body: bytes, kind: _Kind) -> _Parsed:
    """Read a stored file. Raises ``ValueError`` with the reason it cannot be trusted."""
    if not body:
        raise ValueError("it is empty")
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("it is not UTF-8 text")
    head = _HEAD.match(text)
    if head is None or text[head.end():head.end() + 1] != "{":
        raise ValueError("it does not start with the {rev, doc, updatedAt} envelope")
    if not json_depth_ok(body, MAX_DEPTH + 1):
        raise ValueError("it is cut short or nested too deeply")
    try:
        shape, end = _decoder().raw_decode(text, head.end())
    except (ValueError, RecursionError):
        raise ValueError("the document in it is cut short or is not JSON")
    tail = _TAIL.fullmatch(text, end)
    if tail is None:
        raise ValueError("it is cut short, or something follows the document")
    try:
        parse_iso(tail.group(1))
    except ValueError:
        raise ValueError("its updatedAt is not a time")
    if not _is_kind(shape, kind):
        raise ValueError("the document in it is not %s" % kind.name)
    return _Parsed(int(head.group(1)), tail.group(1), _rows(shape, kind), text, head.end(), end)


# ---------------------------------------------------------------------------
# What the doors hand back
# ---------------------------------------------------------------------------

class Envelope(NamedTuple):
    """What GET answers. ``body`` is the answer itself; the rest is read off it."""
    rev: int
    updated_at: Optional[str]
    body: bytes
    rows: int


class SaveResult(NamedTuple):
    rev: int                   # the new revision: answer {"rev": rev}
    rows: int
    bytes: int                 # size of the stored document
    updated_at: str
    snapshot: Optional[str]    # the name of the copy this save made of what it replaced, if it made one


class RestoreResult(NamedTuple):
    rev: int                       # the revision the restored document now has
    from_rev: int                  # the revision it had when the snapshot was taken
    replaced_rev: Optional[int]    # the revision that was current; None when the current file was damaged
    snapshot: str                  # the snapshot that was restored
    kept: Optional[str]            # where the replaced state went (a restore- snapshot or a .damaged- file)


class FloorResult(NamedTuple):
    floor: int                     # the number now in EVER_SAVED: no revision at or below it is given out again
    was: int                       # that number before the call; 0 when there was none
    rev: Optional[int]             # the stored revision (0: never saved); None when the stored file is damaged


class Snapshot(NamedTuple):
    name: str
    kind: str                      # "day" | "shrink" | "restore"
    rev: int
    taken: datetime.datetime       # for a day copy: the start of that UTC day
    bytes: int                     # size of the gzip file


_SNAPSHOT = re.compile(
    r"(?:(day)-([0-9]{4}-[0-9]{2}-[0-9]{2})|(shrink|restore)-([0-9]{8}T[0-9]{6}Z))-rev([0-9]{6,16})\.json\.gz")
_DAMAGED_COPY = re.compile(r"current\.json\.damaged-([0-9]{8}T[0-9]{6}Z)(?:-[0-9]+)?")


def _snapshot_of(name: str) -> Optional[Tuple[str, int, datetime.datetime]]:
    """``(kind, rev, taken)`` when ``name`` is a snapshot's file name."""
    match = _SNAPSHOT.fullmatch(name)
    if match is None:
        return None
    try:
        if match.group(1):
            year, month, day = (int(part) for part in match.group(2).split("-"))
            taken = datetime.datetime(year, month, day, tzinfo=datetime.timezone.utc)
            return "day", int(match.group(5)), taken
        return match.group(3), int(match.group(5)), parse_stamp(match.group(4))
    except ValueError:
        return None


def _newness(snap: Snapshot) -> Tuple[int, datetime.datetime, str]:
    """What snapshots are ordered by: the revision first - revisions only grow - then the time, then the name."""
    return (snap.rev, snap.taken, snap.name)


def _signature(status: os.stat_result) -> Tuple[int, int, int]:
    return (status.st_ino, status.st_mtime_ns, status.st_size)


class _State(NamedTuple):
    rev: int
    rows: int
    updated_at: Optional[str]
    exists: bool


# ---------------------------------------------------------------------------
# One document
# ---------------------------------------------------------------------------

class DocStore:
    """One of the two documents: ``DocStore(data_dir, "ledger" | "plan", clock)``.

    Making one touches nothing on disk; directories appear with the first write.
    ``security_log`` (anything with ``write(event, **fields)``) gets ``restore``,
    ``snapshots-purged``, ``doc-shrunk``, ``floor-raised`` and ``storage-unsynced``.
    ``free_bytes`` (``path -> int``) is for tests.
    """

    def __init__(self, data_dir: str, kind: str, clock: Clock = utcnow, *, max_bytes: Optional[int] = None,
                 keep_day: int = 90, keep_shrink: int = 50, security_log: Any = None,
                 free_bytes: Optional[Callable[[str], int]] = None, lock_timeout: float = 10.0):
        if kind not in _KINDS:
            raise ValueError("no such document: %r" % (kind,))
        self.kind = kind
        self._spec = _KINDS[kind]
        self._data_dir = data_dir
        self.directory = os.path.join(data_dir, kind)
        self.path = os.path.join(self.directory, "current.json")
        self._marker = os.path.join(self.directory, "EVER_SAVED")
        self._never = os.path.join(self.directory, "NEVER_SAVED")
        self._snapshots = os.path.join(self.directory, "snapshots")
        self._lockfile = os.path.join(self.directory, ".lock")
        self._clock = clock
        self.max_bytes = int(max_bytes) if max_bytes else self._spec.max_bytes
        self._keep_day = int(keep_day)
        self._keep_shrink = int(keep_shrink)
        self._security_log = security_log
        self._free = free_bytes or _free_bytes
        self._lock_timeout = float(lock_timeout)
        self._thread_lock = threading.Lock()
        # (signature of current.json, rev, rows, updatedAt): what is known without reading it again.
        self._meta = None  # type: Optional[Tuple[Tuple[int, int, int], int, int, str]]

    # -- reading -------------------------------------------------------------

    def read(self) -> Envelope:
        """The GET answer. Takes no lock: a file is replaced whole, so what is read is one whole save."""
        try:
            with open(self.path, "rb") as handle:
                signature = _signature(os.fstat(handle.fileno()))
                if signature[2] > self.max_bytes + 4096:
                    raise Damaged(self._damaged("it is larger than %s can be" % self._spec.name))
                body = handle.read()
        except FileNotFoundError:
            lost = self._lost()
            if lost is not None:
                raise Damaged(self._damaged(lost))
            return Envelope(0, None, EMPTY_BODY, 0)
        except OSError as error:
            raise Damaged(self._damaged("it cannot be read (%s)" % (errno.errorcode.get(error.errno, "error"),)))
        meta = self._meta
        if meta is not None and meta[0] == signature:
            return Envelope(meta[1], meta[3], body, meta[2])
        try:
            parsed = _parse_envelope(body, self._spec)
        except ValueError as reason:
            raise Damaged(self._damaged(str(reason)))
        self._meta = (signature, parsed.rev, parsed.rows, parsed.updated_at)
        return Envelope(parsed.rev, parsed.updated_at, body, parsed.rows)

    def revision(self) -> int:
        """The stored revision; 0 when nothing was ever saved. Raises ``Damaged``."""
        return self.read().rev

    def _damaged(self, reason: str) -> str:
        return "The stored copy of %s cannot be trusted: %s. Nothing is read from it or written over it." % (
            self._spec.name, reason)

    # -- lost, or never saved? -------------------------------------------------

    def _lost(self) -> Optional[str]:
        """Why a ``current.json`` that is not there is a loss; None when the document was simply never saved.

        A loss is never answered as revision 0: the next page to open would save an empty
        document where the real one was. What tells the two apart, in this order:

        * the ``EVER_SAVED`` marker, written with the first accepted save;
        * the data directory itself having gone (a volume that is no longer mounted);
        * the document's own directory having gone on a stand that has run before - the
          marker went with it, but ``STAND`` is written only after both directories are made;
        * snapshots: there is no copy of a document that was never saved.
        """
        if self._ever_saved():
            return "it is missing, although this document has been saved before"
        if not os.path.isdir(self._data_dir):
            return "the data directory is missing"
        if not os.path.isdir(self.directory):
            if has_run(self._data_dir):
                return "its directory is missing, although this stand has run before"
            return None
        try:
            names = os.listdir(self._snapshots)
        except OSError:
            names = []
        if any(_snapshot_of(name) is not None for name in names):
            return "it is missing, although copies of it are there"
        return None

    def _number_in(self, path: str) -> int:
        """The number a marker file holds; 0 when there is no file or it holds no number of 1 to 15 digits.

        A longer number is not believed: the revision after it could not be stored or counted.
        """
        try:
            with open(path, "rb") as handle:
                text = handle.read(32).strip()
        except OSError:
            return 0
        return int(text) if text.isdigit() and len(text) <= len(str(FLOOR_MAX)) else 0

    def _ever_saved(self) -> bool:
        """Whether a save was ever accepted here.

        That is what ``EVER_SAVED`` says by being there - unless ``NEVER_SAVED`` stands beside
        it and holds a number no smaller: then the marker was made by ``raise_floor`` for a
        document nobody has saved yet, and holds a floor and nothing else.
        """
        if not os.path.lexists(self._marker):
            return False
        if os.path.lexists(self._never):
            vouched = self._number_in(self._never)
            return not (vouched >= 1 and vouched >= self._number_in(self._marker))
        return True

    def floor(self) -> int:
        """No save and no restore gives out a revision at or below this number; 0 when there is none.

        It is the number in ``EVER_SAVED``: the highest revision this document has given
        out, or a higher one that ``raise_floor`` put there. Reads; takes no lock.
        """
        return max(self._number_in(self._marker), self._number_in(self._never))

    # -- saving --------------------------------------------------------------

    def save(self, base: Any, doc: Any, who: str) -> SaveResult:
        """Store ``doc`` as the next revision, if ``base`` is still the stored revision.

        The next revision is ``base + 1`` - or, when the number in ``EVER_SAVED`` is
        higher than the stored revision, one above that number. It is higher after
        a whole stand was put back from an older backup and ``raise_floor`` was
        told what the lost days had reached: a page left open from before must
        never find the counter standing on the number it holds, or its save would
        replace everything saved since without a 409. A ``base`` that is not the
        stored revision is ``Stale`` as ever, with the stored revision.

        ``doc`` is the document as a string of JSON; it is stored as it was sent
        (without the white space around it), so members this service has never
        heard of come back untouched. ``who`` is the login of the founder saving;
        it is written down only when the save drops most of the rows (the
        security log's ``doc-shrunk``) - the request log has every save.

        Before a document that has been saved before is overwritten, the stored
        one is copied aside when no copy was made yet on this UTC day (a
        ``day-`` snapshot), or else when it has more than 20 rows and the new
        one fewer than half as many (a ``shrink-`` snapshot). A save that drops
        more than half of more than 20 rows is written into the security log
        whichever of the two copies kept what it replaced.

        A save whose file is in place but whose directory could not be synced is
        a save: it is answered with its revision, because that is what every
        reader now gets, and the security log says ``storage-unsynced``.
        """
        spec = self._spec
        if not isinstance(who, str) or not who:
            raise ValueError("who saved it must be a login")
        base = self._base(base)
        if not isinstance(doc, str):
            raise BadDoc("doc is %s as a string of JSON." % spec.name)
        try:
            raw = doc.encode("utf-8").strip(b" \t\r\n")
        except UnicodeEncodeError:
            raise BadDoc("doc is not JSON that can be stored: it holds text that is not Unicode.")
        if len(raw) > self.max_bytes:
            raise TooLarge("%s stops at %d bytes." % (spec.name[0].upper() + spec.name[1:], self.max_bytes))
        if not json_depth_ok(raw, MAX_DEPTH):
            raise BadDoc("doc is not JSON this door takes: it is nested deeper than %d levels." % MAX_DEPTH)
        try:
            shape = _decoder().decode(doc)
        except (ValueError, RecursionError):
            raise BadDoc("doc is not JSON.")
        if not _is_kind(shape, spec):
            raise BadDoc(spec.not_one)
        rows = _rows(shape, spec)
        del shape

        now = as_utc(self._clock())
        with self._locked():
            state = self._state()
            if base != state.rev:
                # Somebody saved after this copy was read. Writing it would put
                # their save away without a trace, so the page is told to reload.
                raise Stale("%s was saved from somewhere else since this copy was read."
                            % (spec.name[0].upper() + spec.name[1:]), state.rev)
            self.check_space(len(raw))
            # Above the stored revision, and above every number this document has given out or was
            # told to stay clear of: the counter never comes back to a number a browser may hold.
            rev = max(state.rev, self.floor()) + 1
            # Somebody's page dropped most of the document: worth a line of its own, whichever
            # copy keeps what it replaced.
            shrinks = state.exists and state.rows > SMALL and rows < state.rows / 2
            try:
                names = self._sweep()
                snapshot = None
                if state.exists and state.rev > 0:
                    today = "day-%s-" % now.strftime("%Y-%m-%d")
                    if not any(name.startswith(today) and _snapshot_of(name) for name in names):
                        snapshot = self._copy_aside("day", state.rev, now)
                    elif shrinks:
                        snapshot = self._copy_aside("shrink", state.rev, now)
                updated_at, synced = self._write(rev, raw, rows, now)
            except OSError as error:
                raise StorageFailed("%s could not be written (%s); what was stored is untouched."
                                    % (spec.name[0].upper() + spec.name[1:],
                                       errno.errorcode.get(error.errno, "error")))
        if shrinks:
            self._note("doc-shrunk", doc=self.kind, by=who, rev=rev, rows=rows, fromRows=state.rows,
                       snapshot=snapshot)
        if not synced:
            self._note("storage-unsynced", file=self.kind, rev=rev, by=who)
        return SaveResult(rev, rows, len(raw), updated_at, snapshot)

    def _base(self, base: Any) -> int:
        refusal = "base is the revision %s was read at — a whole number, 0 or more." % self._spec.name
        if isinstance(base, bool) or not isinstance(base, (int, float)):
            raise BadDoc(refusal)
        if isinstance(base, float):
            # JSON has one kind of number: 3.0 is the whole number 3, as it is to the platform.
            if base != base or base in (float("inf"), float("-inf")) or not base.is_integer():
                raise BadDoc(refusal)
            base = int(base)
        if base < 0:
            raise BadDoc(refusal)
        return base

    def check_space(self, nbytes: int) -> None:
        """Raise ``NoSpace`` unless free space exceeds three times ``nbytes`` plus 64 MB."""
        where = self.directory if os.path.isdir(self.directory) else self._data_dir
        try:
            free = self._free(where)
        except OSError as error:
            raise StorageFailed("Free space could not be measured (%s)." % errno.errorcode.get(error.errno, "error"))
        if free <= 3 * max(0, int(nbytes)) + SPACE_MARGIN:
            raise NoSpace("Not enough free space to save %s safely." % self._spec.name)

    @contextlib.contextmanager
    def _locked(self) -> Iterator[None]:
        """One writer: the thread lock inside this process, flock against the other one."""
        if not self._thread_lock.acquire(timeout=self._lock_timeout):
            raise Busy("%s is being written; try again." % (self._spec.name[0].upper() + self._spec.name[1:]))
        try:
            try:
                # A document's directory that has gone on a stand that has run before is a lost
                # document. Making it anew here would turn "lost" into "never saved" - and the
                # next save from revision 0 into a new, empty ledger.
                if not os.path.isdir(self.directory) and has_run(self._data_dir):
                    raise Damaged(self._damaged("its directory is missing, although this stand has run before"))
                # mkdir, not makedirs: a data directory that has gone is not quietly made anew.
                for directory in (self.directory, self._snapshots):
                    try:
                        os.mkdir(directory, 0o700)
                    except FileExistsError:
                        pass
                lock = FileLock(self._lockfile, self._lock_timeout)
                lock.__enter__()
            except LockTimeout:
                raise Busy("%s is locked by another process; try again."
                           % (self._spec.name[0].upper() + self._spec.name[1:]))
            except OSError as error:
                raise StorageFailed("The directory of %s cannot be used (%s)."
                                    % (self._spec.name, errno.errorcode.get(error.errno, "error")))
            try:
                yield
            finally:
                lock.__exit__(None, None, None)
        finally:
            self._thread_lock.release()

    def _state(self) -> _State:
        """What is stored now. Call under the lock. Raises ``Damaged``."""
        try:
            handle = open(self.path, "rb")
        except FileNotFoundError:
            lost = self._lost()
            if lost is not None:
                raise Damaged(self._damaged(lost))
            return _State(0, 0, None, False)
        except OSError as error:
            raise Damaged(self._damaged("it cannot be read (%s)" % (errno.errorcode.get(error.errno, "error"),)))
        try:
            with handle:
                signature = _signature(os.fstat(handle.fileno()))
                meta = self._meta
                if meta is not None and meta[0] == signature:
                    # The same file by inode, time and size. The revision is in its first bytes,
                    # so one small read makes sure before a save is judged against it.
                    head = _HEAD_BYTES.match(handle.read(48))
                    if head is not None and int(head.group(1)) == meta[1]:
                        return _State(meta[1], meta[2], meta[3], True)
                    handle.seek(0)
                if signature[2] > self.max_bytes + 4096:
                    raise Damaged(self._damaged("it is larger than %s can be" % self._spec.name))
                body = handle.read()
        except OSError as error:
            raise Damaged(self._damaged("it cannot be read (%s)" % (errno.errorcode.get(error.errno, "error"),)))
        try:
            parsed = _parse_envelope(body, self._spec)
        except ValueError as reason:
            raise Damaged(self._damaged(str(reason)))
        self._meta = (signature, parsed.rev, parsed.rows, parsed.updated_at)
        return _State(parsed.rev, parsed.rows, parsed.updated_at, True)

    def _sweep(self) -> List[str]:
        """Under the lock nobody else is writing, so a temporary file is a crash's leftover: remove it.

        Returns the names in the snapshots directory.
        """
        for directory in (self.directory, self._snapshots):
            for name in os.listdir(directory):
                if ".tmp-" in name:
                    try:
                        os.unlink(os.path.join(directory, name))
                    except OSError:
                        pass
        return os.listdir(self._snapshots)

    def _write(self, rev: int, raw: bytes, rows: int, now: datetime.datetime) -> Tuple[str, bool]:
        """Put revision ``rev`` in place. Call under the lock. Returns ``(updatedAt, synced)``.

        Raises ``OSError`` only when the stored file is as it was. Once the rename has
        happened the save is what every reader gets, so it is a save: when no more than
        the sync of the directory failed, ``synced`` is False and nothing is raised.
        """
        updated_at = iso_ms(now)
        synced = True
        try:
            atomic_write(self.path, (
                b'{"rev":%d,"doc":' % rev, raw, b',"updatedAt":"%s"}' % updated_at.encode("ascii")))
        except Unsynced:
            synced = False
        try:
            self._meta = (_signature(os.stat(self.path)), rev, rows, updated_at)
        except OSError:
            self._meta = None       # the save is done; the next reader looks for itself
        # The marker says "this document has been saved", and holds the highest revision given
        # out: the floor under every later save and restore, and what a whole-stand restore
        # reads to learn how far the lost days had counted. So it is synced like the document.
        try:
            if os.path.lexists(self._never):
                os.unlink(self._never)      # saved now: the marker stops being a bare floor
        except OSError:
            pass
        try:
            atomic_write(self._marker, (b"%d\n" % rev,))
        except OSError:
            pass        # the save itself is done; the next one writes the marker again
        return updated_at, synced

    def _copy_aside(self, prefix: str, rev: int, now: datetime.datetime) -> str:
        """Gzip the current file into a snapshot, then prune. Call under the lock. Raises ``OSError``."""
        if prefix == "day":
            name = "day-%s-rev%06d.json.gz" % (now.strftime("%Y-%m-%d"), rev)
        else:
            name = "%s-%s-rev%06d.json.gz" % (prefix, stamp(now), rev)
        with open(self.path, "rb") as handle:
            data = handle.read()
        packed = io.BytesIO()
        mtime = min(max(int(now.timestamp()), 0), 0xFFFFFFFF)
        with gzip.GzipFile(filename="", mode="wb", fileobj=packed, compresslevel=6, mtime=mtime) as archive:
            archive.write(data)
        atomic_write(os.path.join(self._snapshots, name), (packed.getvalue(),))
        self._prune()
        return name

    def _prune(self) -> None:
        """Keep the newest 90 day copies and the newest 50 before-shrink copies. Restore copies stay."""
        kept = sorted(self.snapshots(), key=_newness)
        for prefix, keep in (("day", self._keep_day), ("shrink", self._keep_shrink)):
            mine = [snap for snap in kept if snap.kind == prefix]
            for snap in (mine[:-keep] if keep > 0 else mine):
                try:
                    os.unlink(os.path.join(self._snapshots, snap.name))
                except OSError:
                    pass

    # -- snapshots -----------------------------------------------------------

    def snapshots(self) -> List[Snapshot]:
        """Every snapshot of this document, newest first. Reads names and sizes only.

        Newest is the highest revision: revisions only grow, whereas a day copy is dated
        at the start of its day and so would sort below a restore copy made earlier that
        same day, although it was taken later and holds a later state.
        """
        found = []
        try:
            names = os.listdir(self._snapshots)
        except OSError:
            return []
        for name in names:
            parts = _snapshot_of(name)
            if parts is None:
                continue
            try:
                size = os.stat(os.path.join(self._snapshots, name)).st_size
            except OSError:
                continue
            found.append(Snapshot(name, parts[0], parts[1], parts[2], size))
        found.sort(key=_newness, reverse=True)
        return found

    def _read_snapshot(self, name: str) -> _Parsed:
        """A snapshot's content, checked. Raises ``NoSuchSnapshot`` / ``BadSnapshot``."""
        if not isinstance(name, str) or _snapshot_of(name) is None:
            raise NoSuchSnapshot("That is not the name of a snapshot of %s." % self._spec.name)
        path = os.path.join(self._snapshots, name)
        limit = self.max_bytes + 4096
        try:
            with gzip.open(path, "rb") as archive:
                data = archive.read(limit + 1)
        except FileNotFoundError:
            raise NoSuchSnapshot("There is no such snapshot of %s." % self._spec.name)
        except (OSError, EOFError, zlib.error):
            raise BadSnapshot("The snapshot cannot be unpacked.")
        if len(data) > limit:
            raise BadSnapshot("The snapshot is larger than %s can be." % self._spec.name)
        try:
            return _parse_envelope(data, self._spec)
        except ValueError as reason:
            raise BadSnapshot("The snapshot cannot be read back as %s: %s." % (self._spec.name, reason))

    def check_snapshot(self, name: str) -> Tuple[int, int]:
        """``(rev, rows)`` of a snapshot that reads back whole. Raises ``NoSuchSnapshot`` / ``BadSnapshot``."""
        parsed = self._read_snapshot(name)
        return parsed.rev, parsed.rows

    def restore(self, name: str, who: str) -> RestoreResult:
        """Make the snapshot ``name`` the current document, as a new revision.

        The state it replaces is copied aside first (``restore-<utc>-rev...``;
        a damaged ``current.json`` is moved to ``current.json.damaged-<utc>``).
        The new revision is one above the highest this document ever had, so a
        page that is still open gets 409 at its next save and reloads instead of
        saving over the restore. This is the one write a damaged document takes.
        """
        if not isinstance(who, str) or not who:
            raise ValueError("who restores must be named")
        spec = self._spec
        now = as_utc(self._clock())
        with self._locked():
            parsed = self._read_snapshot(name)
            raw = parsed.text[parsed.doc_start:parsed.doc_end].encode("utf-8")
            try:
                state = self._state()  # type: Optional[_State]
            except Damaged:
                state = None
            # Every number a page may hold: the floor, the names of the copies, what a damaged
            # file still says of itself. A number of sixteen digits is nobody's revision.
            heard = [self.floor(), self._salvaged_rev()] + [snap.rev for snap in self.snapshots()]
            known = [parsed.rev] + [number for number in heard if number <= FLOOR_MAX]
            if state is not None:
                known.append(state.rev)
            rev = max(known) + 1
            self.check_space(len(raw))
            try:
                self._sweep()
                kept = None
                if state is None:
                    kept = self._move_damaged_aside(now)
                elif state.exists and state.rev > 0:
                    kept = self._copy_aside("restore", state.rev, now)
                _updated_at, synced = self._write(rev, raw, parsed.rows, now)
            except OSError as error:
                raise StorageFailed("%s could not be restored (%s); what was stored is untouched."
                                    % (spec.name[0].upper() + spec.name[1:],
                                       errno.errorcode.get(error.errno, "error")))
        result = RestoreResult(rev, parsed.rev, state.rev if state is not None else None, name, kept)
        self._note("restore", doc=self.kind, snapshot=name, rev=rev, fromRev=parsed.rev, kept=kept, by=who)
        if not synced:
            self._note("storage-unsynced", file=self.kind, rev=rev, by=who)
        return result

    def raise_floor(self, floor: int, who: str = "ctl") -> FloorResult:
        """Lift the number in ``EVER_SAVED`` to at least ``floor``: no save and no restore gives out
        a revision at or below it again. It never lowers the number and it never touches the document.

        For the two moments when the stored revision is behind what browsers hold:

        * a whole stand was put back from a backup - the documents are at the backup's revisions,
          while pages opened before the restore hold the later ones of the lost days;
        * the cut-over - Money's documents start at revision 0, while pages opened on the
          platform hold the platform's revision.

        The stored revision stays what it is, so a page that reloads saves from it; that save
        is written as ``floor + 1``, and from then on a page from before can only get 409.

        The marker is made when there is none. For a document that was never saved it is made
        together with ``NEVER_SAVED``, which keeps the document reading as revision 0 and not as
        lost; the first accepted save removes that file again.

        ``floor`` is a whole number; ``Refused`` (403 ``refused``) when it is below 0 or longer
        than 15 digits, ``ValueError`` when it is not a whole number at all. Also raises ``Busy``,
        ``StorageFailed`` (the disk refused, or could not be made to keep it) and ``Damaged``
        (the document's directory is lost). Returns ``FloorResult(floor, was, rev)`` and writes
        ``floor-raised`` (doc, floor, was, by) into the security log - also when the number was
        high enough already, so that a whole-stand restore always leaves its line.
        """
        if isinstance(floor, bool) or not isinstance(floor, int):
            raise ValueError("a floor is a revision: a whole number")
        if not isinstance(who, str) or not who:
            raise ValueError("who raises the floor must be named")
        if not 0 <= floor <= FLOOR_MAX:
            raise Refused("A floor is a revision: a whole number from 0 to %d - fifteen digits at most. "
                          "Nothing was changed." % FLOOR_MAX)
        spec = self._spec
        with self._locked():
            try:
                state = self._state()  # type: Optional[_State]
            except Damaged:
                state = None
            was = self.floor()
            # The marker never says less than what is stored: it is the highest revision given out.
            stored = state.rev if state is not None else self._salvaged_rev()
            wanted = max(floor, was, stored if stored <= FLOOR_MAX else 0)
            never_saved = state is not None and not state.exists
            try:
                if wanted > self._number_in(self._marker):
                    if never_saved and self._number_in(self._never) < wanted:
                        # First the file that says "a floor, not a save": were the marker alone
                        # there for a moment, the document would read as lost.
                        atomic_write(self._never, (b"%d\n" % wanted,))
                    atomic_write(self._marker, (b"%d\n" % wanted,))
            except OSError as error:
                raise StorageFailed("The floor of %s could not be written and kept (%s). Run it again."
                                    % (spec.name, errno.errorcode.get(error.errno, "error")))
        self._note("floor-raised", doc=self.kind, floor=wanted, was=was, by=who)
        return FloorResult(wanted, was, state.rev if state is not None else None)

    def _salvaged_rev(self) -> int:
        """The revision a damaged file still names in its first bytes, if it does."""
        try:
            with open(self.path, "rb") as handle:
                head = re.match(rb'\{"rev":([1-9][0-9]{0,15}),', handle.read(48))
            return int(head.group(1)) if head else 0
        except OSError:
            return 0

    def _move_damaged_aside(self, now: datetime.datetime) -> Optional[str]:
        if not os.path.lexists(self.path):
            return None
        name = "current.json.damaged-%s" % stamp(now)
        number = 1
        while os.path.lexists(os.path.join(self.directory, name)):
            number += 1
            name = "current.json.damaged-%s-%d" % (stamp(now), number)
        os.replace(self.path, os.path.join(self.directory, name))
        self._meta = None
        return name

    def purge(self, older_than_days: int, stand: str, who: str = "ctl") -> int:
        """Delete snapshots taken more than ``older_than_days`` days ago (0: all of them).

        Only for the stands whose data is made up: ``stand`` must be ``test`` or
        ``dev`` **and** be what the directory's own ``STAND`` marker says, else
        ``Refused`` - and ``Refused`` as well, whatever the stand, while a person's
        ``REAL_DATA`` marker lies in the directory: the copies are then copies of
        real documents. Returns how many files went. ``current.json`` is never touched.
        A number of days that reaches further back than the calendar does purges
        nothing: no copy is that old.
        """
        if isinstance(older_than_days, bool) or not isinstance(older_than_days, int) or older_than_days < 0:
            raise ValueError("older_than_days is a whole number of days, 0 or more")
        if stand not in ("test", "dev"):
            raise Refused("Snapshots are purged on the test and dev stands only.")
        try:
            marker = read_stand_marker(self._data_dir)
        except DataDirError:
            marker = None
        if marker != stand:
            raise Refused("This data directory is marked %r, not %r; nothing was purged." % (marker, stand))
        if holds_real_data(self._data_dir):
            raise Refused("This data directory holds real documents (its %s marker is there); nothing was purged."
                          % REAL_DATA_FILE)
        now = as_utc(self._clock())
        try:
            cutoff = now - datetime.timedelta(days=older_than_days)  # type: Optional[datetime.datetime]
        except OverflowError:
            cutoff = None       # further back than the calendar reaches: nothing is that old
        gone = 0
        if not os.path.isdir(self.directory):
            return 0
        with self._locked():
            for snap in self.snapshots():
                if older_than_days == 0 or (cutoff is not None and snap.taken < cutoff):
                    try:
                        os.unlink(os.path.join(self._snapshots, snap.name))
                        gone += 1
                    except OSError:
                        pass
            for name in os.listdir(self.directory):
                match = _DAMAGED_COPY.fullmatch(name)
                if match is None:
                    continue
                try:
                    if older_than_days == 0 or (cutoff is not None and parse_stamp(match.group(1)) < cutoff):
                        os.unlink(os.path.join(self.directory, name))
                        gone += 1
                except (OSError, ValueError):
                    pass
        self._note("snapshots-purged", doc=self.kind, count=gone, days=older_than_days, by=who)
        return gone

    def _note(self, event: str, **fields: Any) -> None:
        if self._security_log is not None:
            self._security_log.write(event, **fields)

    # -- looking without touching -------------------------------------------

    def status(self) -> Dict[str, Any]:
        """Counts and sizes for ``ctl doctor`` and ``ctl verify``. Reads; never writes; never raises.

        ``state`` is ``"empty"`` (never saved), ``"ok"`` or ``"damaged"`` (then
        ``problem`` says why). ``floor`` is the number no later revision goes at or
        below, ``directory`` whether the document's directory is there at all,
        ``snapshots.newest`` the copy of the highest revision. No member of the
        document is ever in here.
        """
        status = {
            "kind": self.kind, "state": "empty", "rev": 0, "rows": 0, "bytes": 0, "updatedAt": None,
            "problem": None, "everSaved": self._ever_saved(), "floor": self.floor(),
            "directory": os.path.isdir(self.directory),
        }  # type: Dict[str, Any]
        try:
            envelope = self.read()
            status.update(rev=envelope.rev, rows=envelope.rows, updatedAt=envelope.updated_at)
            if envelope.rev > 0:
                status.update(state="ok", bytes=len(envelope.body))
        except Damaged as error:
            status.update(state="damaged", rev=None, rows=None, bytes=None, problem=error.message)
        snaps = self.snapshots()
        status["snapshots"] = {
            "count": len(snaps),
            "day": sum(1 for snap in snaps if snap.kind == "day"),
            "shrink": sum(1 for snap in snaps if snap.kind == "shrink"),
            "restore": sum(1 for snap in snaps if snap.kind == "restore"),
            "bytes": sum(snap.bytes for snap in snaps),
            "newest": snaps[0].name if snaps else None,
            "oldest": snaps[-1].name if snaps else None,
        }
        temporary = damaged = 0
        for directory in (self.directory, self._snapshots):
            try:
                names = os.listdir(directory)
            except OSError:
                continue
            temporary += sum(1 for name in names if ".tmp-" in name)
            damaged += sum(1 for name in names if _DAMAGED_COPY.fullmatch(name))
        status["temporaryFiles"] = temporary
        status["damagedCopies"] = damaged
        return status


# ---------------------------------------------------------------------------
# The data directory
# ---------------------------------------------------------------------------

def read_stand_marker(data_dir: str) -> Optional[str]:
    """What ``<data>/STAND`` says; None when there is no marker.

    A stand's name comes back as it is. Anything else comes back cut to 16
    characters with every character that is not a letter or a digit replaced by
    ``?``, so it is safe to print and equal to no stand.
    """
    try:
        with open(os.path.join(data_dir, STAND_FILE), "rb") as handle:
            text = handle.read(64).decode("ascii", "replace").strip()
    except FileNotFoundError:
        return None
    except OSError as error:
        raise DataDirError("The STAND marker in %s cannot be read (%s)."
                           % (data_dir, errno.errorcode.get(error.errno, "error")))
    if text in STANDS:
        return text
    return "".join(ch if ch.isascii() and ch.isalnum() else "?" for ch in text[:16]) or "?"


def has_run(data_dir: str) -> bool:
    """Whether a stand has been through its first start in ``data_dir``: the ``STAND`` marker is there.

    The first start makes ``ledger/``, ``plan/`` and ``auth/`` and writes the marker last. So
    with the marker there, one of the three that is missing was lost - it is not a part of
    the stand that has yet to begin, and nothing makes it anew.
    """
    return os.path.lexists(os.path.join(data_dir, STAND_FILE))


def holds_real_data(data_dir: str) -> bool:
    """Whether a person has marked ``data_dir`` as holding real documents: ``<data>/REAL_DATA`` is there.

    The file's presence is the fact. What it holds is free text - who put it there, and when -
    and is never read. It is made and removed by a person, by hand; nothing in this program
    does either. While it is there nothing replaces the documents with made-up ones and
    nothing deletes their copies: ``ctl seed`` and ``ctl purge-snapshots`` refuse, on every
    stand, and so does ``DocStore.purge``.

    A marker that cannot be looked at - the directory is closed to this process, the disk
    does not answer - counts as there: nothing is replaced or deleted on a guess. A
    directory that does not exist holds nothing.
    """
    try:
        os.lstat(os.path.join(data_dir, REAL_DATA_FILE))
    except (FileNotFoundError, NotADirectoryError):
        return False
    except OSError:
        return True
    return True


def _bare(path: str) -> bool:
    """Whether ``path`` is a directory of the layout with nothing in it yet (a document's may hold an empty ``snapshots``)."""
    try:
        if not os.path.isdir(path) or os.path.islink(path):
            return False
        for name in os.listdir(path):
            inner = os.path.join(path, name)
            if name != "snapshots" or os.path.islink(inner) or not os.path.isdir(inner) or os.listdir(inner):
                return False
        return True
    except OSError:
        return False


def _lay_out(data_dir: str, stand: str) -> None:
    """The first start: the three directories, then the marker. Raises ``OSError``, leaving what it made behind only
    together with the marker."""
    marker = os.path.join(data_dir, STAND_FILE)
    made = []
    try:
        for parts in (("ledger",), ("ledger", "snapshots"), ("plan",), ("plan", "snapshots"), ("auth",)):
            path = os.path.join(data_dir, *parts)
            try:
                os.mkdir(path, 0o700)
                made.append(path)
            except FileExistsError:
                pass
        atomic_write(marker, (stand.encode("ascii") + b"\n",))
    except OSError:
        if not os.path.lexists(marker):
            for path in reversed(made):
                try:
                    os.rmdir(path)
                except OSError:
                    pass
        raise


def prepare_data_dir(data_dir: str, stand: str) -> None:
    """Make sure ``data_dir`` is this stand's own; on its first start, lay out its directories.

    Raises ``DataDirError`` - on every stand, dev included - when:

    * the directory does not exist or cannot be written;
    * it holds the laptop tool's layout (``db.json``, ``cash.json``, ``backups/``);
    * its ``STAND`` marker names another stand;
    * it has no marker but already holds a stand's files (whose they are is then
      a person's call: write the stand's name into ``STAND`` by hand).

    On a directory with no marker and none of a stand's files it makes
    ``ledger/``, ``plan/`` and ``auth/`` and then writes the marker: that is
    the first start, and the marker is its last step.

    On every later start nothing that is missing is made anew. A document's
    directory that has gone is a lost document (its doors answer
    ``503 storage_damaged``, ``doctor`` says so), and ``auth/`` that has gone
    is the accounts lost (``auth.AuthDamaged``: the boot stops) - neither is a
    part of the stand that may quietly begin again from nothing. To begin one
    anew on purpose, a person makes the empty directory by hand.
    """
    if stand not in STANDS:
        raise ValueError("no such stand: %r" % (stand,))
    if not os.path.isdir(data_dir):
        raise DataDirError("The data directory %s does not exist. Create it for this stand first." % data_dir)
    laptop = [name for name in LAPTOP_LAYOUT if os.path.lexists(os.path.join(data_dir, name))]
    if laptop:
        raise DataDirError(
            "The data directory %s holds the laptop tool's files (%s). The hosted service never runs "
            "on the laptop's data folder; give it a directory of its own." % (data_dir, ", ".join(laptop)))
    marker = read_stand_marker(data_dir)
    try:
        if marker is None:
            owned = [name for name in _STAND_OWNED if os.path.lexists(os.path.join(data_dir, name))]
            if owned and all(_bare(os.path.join(data_dir, name)) for name in owned):
                raise DataDirError(
                    "The data directory %s holds empty directories of a stand (%s) and no STAND marker: most "
                    "likely a first start that did not finish. Remove them, and the stand starts fresh."
                    % (data_dir, ", ".join(owned)))
            if owned:
                raise DataDirError(
                    "The data directory %s holds a stand's files (%s) but no STAND marker, so it cannot be "
                    "told whose they are. If they belong to the %s stand, write that name into %s."
                    % (data_dir, ", ".join(owned), stand, os.path.join(data_dir, STAND_FILE)))
            _lay_out(data_dir, stand)
        elif marker not in STANDS:
            raise DataDirError(
                "The STAND marker in %s names no stand ('%s'). It must hold one word - prod, test or dev - "
                "and that is a person's call, not this program's." % (data_dir, marker))
        elif marker != stand:
            raise DataDirError(
                "The data directory %s belongs to the '%s' stand, and this process is '%s'. "
                "Nothing was read or written." % (data_dir, marker, stand))
        else:
            for kind in KINDS:
                # Only the place for its copies is made again, beside a document that is there.
                if os.path.isdir(os.path.join(data_dir, kind)):
                    os.makedirs(os.path.join(data_dir, kind, "snapshots"), 0o700, exist_ok=True)
        if not os.access(data_dir, os.W_OK | os.X_OK):
            raise DataDirError("The data directory %s cannot be written by this process." % data_dir)
    except OSError as error:
        raise DataDirError("The data directory %s cannot be prepared (%s)."
                           % (data_dir, errno.errorcode.get(error.errno, "error")))


def open_stores(settings: Any, clock: Clock = utcnow, security_log: Any = None) -> Dict[str, "DocStore"]:
    """``{"ledger": DocStore, "plan": DocStore}`` for a stand's settings."""
    return {
        kind: DocStore(
            settings.data_dir, kind, clock, max_bytes=settings.put_limit(kind),
            keep_day=settings.keep_day_snapshots, keep_shrink=settings.keep_shrink_snapshots,
            security_log=security_log)
        for kind in KINDS
    }


def _way_back(document: "DocStore", status: Dict[str, Any]) -> str:
    """For a damaged document: the sentence that says what brings it back.

    Names the newest snapshot **that reads back** - one that does not is passed over and
    named as such, because ``restore`` would refuse it and the operator would be left with
    a command that changes nothing. Fills ``status["restore"]`` (that snapshot's name, or
    None) and ``status["passedOver"]`` (the names passed over). Unpacks; shows nothing.
    """
    status["restore"] = None
    status["passedOver"] = []
    if not status["directory"]:
        return ("Its directory %s is not there, and its copies went with it: put the directory back from a "
                "backup. To begin this document anew instead, make that directory, empty, by hand."
                % document.directory)
    passed = status["passedOver"]
    for snap in document.snapshots():
        try:
            document.check_snapshot(snap.name)
        except StoreError:
            passed.append(snap.name)
            continue
        status["restore"] = snap.name
        if not passed:
            return "The newest snapshot is %s; bring it back with: ctl restore %s %s" % (
                snap.name, document.kind, snap.name)
        return ("The newest snapshot that reads back is %s; bring it back with: ctl restore %s %s "
                "(passed over, because %s not read back: %s)" % (
                    snap.name, document.kind, snap.name, "it does" if len(passed) == 1 else "they do",
                    _some(passed)))
    if passed:
        return "None of its %d snapshot(s) reads back (%s): there is nothing here to restore from." % (
            len(passed), _some(passed))
    return "There is no snapshot to restore from."


def _some(names: List[str], most: int = 5) -> str:
    return ", ".join(names[:most]) + (" and %d more" % (len(names) - most) if len(names) > most else "")


def doctor(data_dir: str, stand: Optional[str] = None, clock: Clock = utcnow) -> Dict[str, Any]:
    """What is wrong with a data directory, in words, and which snapshot brings a damaged document back.

    ``problems`` is a list of English sentences, empty when nothing is wrong.
    For a damaged document the sentence names the newest snapshot that reads
    back (the copy of the highest revision; one that does not unpack is passed
    over, and said to be). Read-only. No member of a document is ever in the answer.

    ``realData`` says whether a person's ``REAL_DATA`` marker is there. It is a
    fact about the directory and never a problem.
    """
    report = {
        "dataDir": data_dir, "exists": os.path.isdir(data_dir), "stand": None, "expectedStand": stand,
        "realData": False, "laptopLayout": [], "freeBytes": None, "documents": {}, "problems": [],
    }  # type: Dict[str, Any]
    problems = report["problems"]
    if not report["exists"]:
        problems.append("The data directory %s does not exist." % data_dir)
        return report
    try:
        report["stand"] = read_stand_marker(data_dir)
    except DataDirError as error:
        problems.append(str(error))
    if stand is not None and report["stand"] != stand:
        problems.append("The STAND marker says %r, and this stand is %r." % (report["stand"], stand))
    report["realData"] = holds_real_data(data_dir)
    report["laptopLayout"] = [name for name in LAPTOP_LAYOUT if os.path.lexists(os.path.join(data_dir, name))]
    if report["laptopLayout"]:
        problems.append("The directory holds the laptop tool's files: %s." % ", ".join(report["laptopLayout"]))
    try:
        report["freeBytes"] = _free_bytes(data_dir)
        if report["freeBytes"] <= SPACE_MARGIN:
            problems.append("Less than 64 MB is free: saves are refused.")
    except OSError:
        problems.append("Free space could not be measured.")
    for kind in KINDS:
        document = DocStore(data_dir, kind, clock)
        status = document.status()
        report["documents"][kind] = status
        if status["state"] == "damaged":
            problems.append("%s: %s %s" % (kind, status["problem"], _way_back(document, status)))
        elif status["state"] == "ok" and not status["everSaved"]:
            problems.append("%s: the EVER_SAVED marker %s; the next save writes it again." % (
                kind, "still stands for a bare floor (NEVER_SAVED lies beside it)"
                if os.path.lexists(os.path.join(document.directory, "EVER_SAVED")) else "is missing"))
        if status["temporaryFiles"]:
            problems.append("%s: %d temporary file(s) left by an interrupted write; the next save removes them."
                            % (kind, status["temporaryFiles"]))
    return report


def verify(data_dir: str, deep: bool = True) -> Dict[str, Any]:
    """``doctor`` for any directory - an unpacked backup, say - plus, with ``deep``, every snapshot unpacked.

    Read-only: it takes no lock and leaves no file. The answer holds revisions,
    row counts, sizes and file names, and never anything from inside a document.
    """
    report = doctor(data_dir)
    if not report["exists"]:
        return report
    for kind in KINDS:
        store = DocStore(data_dir, kind)
        checked = 0
        bad = []
        if deep:
            for snap in store.snapshots():
                checked += 1
                try:
                    rev, _rows_in_it = store.check_snapshot(snap.name)
                    if rev != snap.rev:
                        bad.append(snap.name)
                except StoreError:
                    bad.append(snap.name)
        report["documents"][kind]["snapshotsChecked"] = checked
        report["documents"][kind]["snapshotsBad"] = bad
        if bad:
            report["problems"].append("%s: %d snapshot(s) cannot be read back: %s."
                                      % (kind, len(bad), ", ".join(bad[:5])))
    return report
