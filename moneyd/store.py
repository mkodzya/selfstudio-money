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
        whatever the body was). What it raises, in the order it is checked -
        the body first, as in the platform's route file, then the stored state:
          BadDoc      400 bad_money_doc     base not a whole number >= 0; doc not a string;
                                            doc not JSON / NaN / too deep / not UTF-8;
                                            not an object; no ``tx`` list (ledger) / ``banks`` list (plan)
          TooLarge    413 body_too_large    the document is over the door's limit
          Busy        503 storage_busy      the lock could not be had in time
          Damaged     503 storage_damaged   the stored file cannot be trusted; nothing is written
          Stale       409 money_stale       ``.rev`` is the stored revision; nothing is written
          NoSpace     507 storage_failed    free space is not above 3 x the document + 64 MB
          StorageFailed 507 storage_failed  the disk refused the write (NoSpace is one of these)

    store.revision() -> int                 # 0 when never saved; raises Damaged (``ctl empty``)
    store.check_space(content_length)       # raises NoSpace; lets the door refuse before reading a body
    store.snapshots() -> [Snapshot(name, kind, rev, taken, bytes)]      newest first
    store.check_snapshot(name) -> (rev, rows)                           unpacks and reads it back
    store.restore(name, who) -> RestoreResult(rev, from_rev, replaced_rev, snapshot, kept)
        The snapshot becomes revision "highest ever + 1", so every open page
        gets 409. Raises ``NoSuchSnapshot``, ``BadSnapshot``.
    store.purge(older_than_days, stand, who="ctl") -> int      test and dev only, else ``Refused``
    store.status() -> dict        state, rev, rows, sizes, snapshot counts, the newest snapshot. Never contents.

Every ``StoreError`` is a ``config.Refusal``: ``status``, ``code``, ``message``
(a fixed English sentence - for the two documents the platform's own),
``extra()`` (``{"rev": N}`` on ``Stale``) and ``body()``, the whole JSON answer.

For ``ctl``::

    doctor(data_dir, stand=None, clock=utcnow) -> dict      what is wrong, and which snapshot is newest
    verify(data_dir, deep=True) -> dict                     the same for any directory, read-only; counts only
    read_stand_marker(data_dir) -> str | None               what <data>/STAND says

For the HTTP layer's own bodies::

    parse_json(data, max_depth=16) -> object    str or bytes; ValueError on anything that is not
                                                JSON within the depth (never RecursionError)
    json_depth_ok(data, max_depth) -> bool      the check parse_json runs first; bytes or str

Shared with ``auth``: ``atomic_write``, ``FileLock`` (raises ``LockTimeout``).

On disk
-------
::

    <data>/STAND                                  the stand's name; another name stops the boot
    <data>/<kind>/current.json                    the GET answer
    <data>/<kind>/EVER_SAVED                      written at the first save: "missing" then means "lost"
    <data>/<kind>/.lock                           flock: the server and ctl are two processes
    <data>/<kind>/snapshots/day-YYYY-MM-DD-revNNNNNN.json.gz       the document as the day found it
    <data>/<kind>/snapshots/shrink-<utc>-revNNNNNN.json.gz         before a save that dropped most rows
    <data>/<kind>/snapshots/restore-<utc>-revNNNNNN.json.gz        what a restore replaced

A file is never changed in place: temporary file, fsync, rename, fsync of the
directory. ``current.json`` has one exact layout, the one ``save`` writes;
anything else - cut short, reformatted by hand, the laptop's bare document - is
``Damaged`` and is never read as revision 0.

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
    "KINDS", "DocStore", "Envelope", "SaveResult", "RestoreResult", "Snapshot",
    "StoreError", "BadDoc", "Stale", "TooLarge", "Damaged", "StorageFailed", "NoSpace", "Busy",
    "NoSuchSnapshot", "BadSnapshot", "Refused", "DataDirError", "LockTimeout",
    "prepare_data_dir", "read_stand_marker", "open_stores", "doctor", "verify", "fields_of",
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

STAND_FILE = "STAND"
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
        _fsync_dir(directory)


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
    ``snapshots-purged`` and ``doc-shrunk``. ``free_bytes`` (``path -> int``) is for tests.
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
            if os.path.lexists(self._marker):
                raise Damaged(self._damaged("it is missing, although this document has been saved before"))
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

    # -- saving --------------------------------------------------------------

    def save(self, base: Any, doc: Any, who: str) -> SaveResult:
        """Store ``doc`` as revision ``base + 1``, if ``base`` is still the stored revision.

        ``doc`` is the document as a string of JSON; it is stored as it was sent
        (without the white space around it), so members this service has never
        heard of come back untouched. ``who`` is the login of the founder saving;
        it is written down only when the save drops most of the rows (the
        security log's ``doc-shrunk``) - the request log has every save.

        Before a document that has been saved before is overwritten, the stored
        one is copied aside when no copy was made yet on this UTC day (a
        ``day-`` snapshot), or else when it has more than 20 rows and the new
        one fewer than half as many (a ``shrink-`` snapshot).
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
            try:
                names = self._sweep()
                snapshot = None
                shrunk = False
                if state.exists and state.rev > 0:
                    today = "day-%s-" % now.strftime("%Y-%m-%d")
                    if not any(name.startswith(today) and _snapshot_of(name) for name in names):
                        snapshot = self._copy_aside("day", state.rev, now)
                    elif state.rows > SMALL and rows < state.rows / 2:
                        snapshot = self._copy_aside("shrink", state.rev, now)
                        shrunk = True
                updated_at = self._write(state.rev + 1, raw, rows, now)
            except OSError as error:
                raise StorageFailed("%s could not be written (%s); what was stored is untouched."
                                    % (spec.name[0].upper() + spec.name[1:],
                                       errno.errorcode.get(error.errno, "error")))
        if shrunk:
            # The one save worth a line of its own: somebody's page dropped most of the document.
            self._note("doc-shrunk", doc=self.kind, by=who, rev=state.rev + 1, rows=rows, fromRows=state.rows,
                       snapshot=snapshot)
        return SaveResult(state.rev + 1, rows, len(raw), updated_at, snapshot)

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
            if os.path.lexists(self._marker):
                raise Damaged(self._damaged("it is missing, although this document has been saved before"))
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

    def _write(self, rev: int, raw: bytes, rows: int, now: datetime.datetime) -> str:
        """Put revision ``rev`` in place. Call under the lock. Raises ``OSError``."""
        updated_at = iso_ms(now)
        atomic_write(self.path, (
            b'{"rev":%d,"doc":' % rev, raw, b',"updatedAt":"%s"}' % updated_at.encode("ascii")))
        try:
            self._meta = (_signature(os.stat(self.path)), rev, rows, updated_at)
        except OSError:
            self._meta = None       # the save is done; the next reader looks for itself
        # The marker says "this document has been saved", and remembers the highest revision
        # given out, so a restore over a lost file can still pick a revision no page holds.
        try:
            atomic_write(self._marker, (b"%d\n" % rev,), sync=not os.path.lexists(self._marker))
        except OSError:
            pass        # the save itself is done; the next one writes the marker again
        return updated_at

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
        kept = sorted(self.snapshots(), key=lambda snap: (snap.taken, snap.rev, snap.name))
        for prefix, keep in (("day", self._keep_day), ("shrink", self._keep_shrink)):
            mine = [snap for snap in kept if snap.kind == prefix]
            for snap in (mine[:-keep] if keep > 0 else mine):
                try:
                    os.unlink(os.path.join(self._snapshots, snap.name))
                except OSError:
                    pass

    # -- snapshots -----------------------------------------------------------

    def snapshots(self) -> List[Snapshot]:
        """Every snapshot of this document, newest first. Reads names and sizes only."""
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
        found.sort(key=lambda snap: (snap.taken, snap.rev, snap.name), reverse=True)
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
            known = [parsed.rev, self._marker_rev()] + [snap.rev for snap in self.snapshots()]
            known.append(state.rev if state is not None else self._salvaged_rev())
            rev = max(known) + 1
            self.check_space(len(raw))
            try:
                self._sweep()
                kept = None
                if state is None:
                    kept = self._move_damaged_aside(now)
                elif state.exists and state.rev > 0:
                    kept = self._copy_aside("restore", state.rev, now)
                self._write(rev, raw, parsed.rows, now)
            except OSError as error:
                raise StorageFailed("%s could not be restored (%s); what was stored is untouched."
                                    % (spec.name[0].upper() + spec.name[1:],
                                       errno.errorcode.get(error.errno, "error")))
        result = RestoreResult(rev, parsed.rev, state.rev if state is not None else None, name, kept)
        self._note("restore", doc=self.kind, snapshot=name, rev=rev, fromRev=parsed.rev, kept=kept, by=who)
        return result

    def _marker_rev(self) -> int:
        try:
            with open(self._marker, "rb") as handle:
                text = handle.read(32).strip()
            return int(text) if text.isdigit() else 0
        except (OSError, ValueError):
            return 0

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
        ``Refused``. Returns how many files went. ``current.json`` is never touched.
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
        now = as_utc(self._clock())
        cutoff = now - datetime.timedelta(days=older_than_days)
        gone = 0
        if not os.path.isdir(self.directory):
            return 0
        with self._locked():
            for snap in self.snapshots():
                if older_than_days == 0 or snap.taken < cutoff:
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
                    if older_than_days == 0 or parse_stamp(match.group(1)) < cutoff:
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
        ``problem`` says why). No member of the document is ever in here.
        """
        status = {
            "kind": self.kind, "state": "empty", "rev": 0, "rows": 0, "bytes": 0, "updatedAt": None,
            "problem": None, "everSaved": os.path.lexists(self._marker),
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


def prepare_data_dir(data_dir: str, stand: str) -> None:
    """Make sure ``data_dir`` is this stand's own, then lay out its directories.

    Raises ``DataDirError`` - on every stand, dev included - when:

    * the directory does not exist or cannot be written;
    * it holds the laptop tool's layout (``db.json``, ``cash.json``, ``backups/``);
    * its ``STAND`` marker names another stand;
    * it has no marker but already holds a stand's files (whose they are is then
      a person's call: write the stand's name into ``STAND`` by hand).

    On an empty directory it writes the marker: that is the first start.
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
            if owned:
                raise DataDirError(
                    "The data directory %s holds a stand's files (%s) but no STAND marker, so it cannot be "
                    "told whose they are. If they belong to the %s stand, write that name into %s."
                    % (data_dir, ", ".join(owned), stand, os.path.join(data_dir, STAND_FILE)))
            atomic_write(os.path.join(data_dir, STAND_FILE), (stand.encode("ascii") + b"\n",))
        elif marker not in STANDS:
            raise DataDirError(
                "The STAND marker in %s names no stand ('%s'). It must hold one word - prod, test or dev - "
                "and that is a person's call, not this program's." % (data_dir, marker))
        elif marker != stand:
            raise DataDirError(
                "The data directory %s belongs to the '%s' stand, and this process is '%s'. "
                "Nothing was read or written." % (data_dir, marker, stand))
        for kind in KINDS:
            os.makedirs(os.path.join(data_dir, kind), 0o700, exist_ok=True)
            os.makedirs(os.path.join(data_dir, kind, "snapshots"), 0o700, exist_ok=True)
        os.makedirs(os.path.join(data_dir, "auth"), 0o700, exist_ok=True)
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


def doctor(data_dir: str, stand: Optional[str] = None, clock: Clock = utcnow) -> Dict[str, Any]:
    """What is wrong with a data directory, in words, and which snapshot is the newest.

    ``problems`` is a list of English sentences, empty when nothing is wrong.
    Read-only. No member of a document is ever in the answer.
    """
    report = {
        "dataDir": data_dir, "exists": os.path.isdir(data_dir), "stand": None, "expectedStand": stand,
        "laptopLayout": [], "freeBytes": None, "documents": {}, "problems": [],
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
        status = DocStore(data_dir, kind, clock).status()
        report["documents"][kind] = status
        if status["state"] == "damaged":
            newest = status["snapshots"]["newest"]
            problems.append("%s: %s %s" % (kind, status["problem"], (
                "The newest snapshot is %s; bring it back with: ctl restore %s %s" % (newest, kind, newest)
                if newest else "There is no snapshot to restore from.")))
        elif status["state"] == "ok" and not status["everSaved"]:
            problems.append("%s: the EVER_SAVED marker is missing; the next save writes it again." % kind)
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
