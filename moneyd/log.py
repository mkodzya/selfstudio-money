"""The two logs (BUILD-SPEC 2.9): requests on standard output, security events in a file.

API for the HTTP layer and the CLI
----------------------------------
The request log - one JSON line per request, fixed fields, never a body, a
cookie, a token or a password::

    rlog = RequestLog(stream=sys.stdout, clock=utcnow)
    rid = new_request_id()                      # also goes into a 500 answer
    rlog.request(method="PUT", path=self.path, status=200, bytes_out=11, ms=12.3,
                 addr="203.0.113.7", login="mika", rid=rid)
    rlog.event("large-body", doc="ledger", bytes=9000000)   # an operational note

    request_line(now=..., method=..., path=..., status=..., bytes_out=..., ms=...,
                 addr=..., login=None, rid=None) -> str     # the pure builder
    safe_path(target) -> str                                # what `path` is cut down to

  ``login`` is the login of a *signed-in* caller. For a failed sign-in pass
  what was typed only when it is one of ``settings.logins``, else None: people
  type passwords into the login field.
  ``path`` may be the raw request target; the query, the fragment and any
  over-long segment (a pasted token) are removed here.

The security log - ``<data>/security.log``, append-only JSON lines, rotated by
size: 20 MB x 10. Beyond those ten, a rotated file whose last entry is younger
than 400 days is kept all the same, up to 40 files::

    seclog = SecurityLog(settings.data_dir, clock,
                         max_bytes=settings.security_log_bytes, keep=settings.security_log_files)
    seclog.write("boot", stand="prod", version="1.0.0")   # -> True when written
    seclog.write("link-issued", strict=True, login="mika", by="ctl")   # raises OSError instead
    seclog.tail(50)        # the last 50 entries, newest first, as dicts
    seclog.status()        # files and bytes, for ctl doctor

  ``EVENTS`` names the events the core writes and what each means; the
  ``/data`` page words them. ``auth.Auth`` and ``store.DocStore`` write their
  own events when they are given the log; ``__main__`` writes ``boot`` and
  ``ctl`` writes ``seed``.

  Values are short scalars. A field whose name smells of a secret (password,
  token, cookie, secret, hash) is refused with ``ValueError``; a text is cut at
  200 characters, so no document can end up here.
"""
import datetime
import errno
import fcntl
import ipaddress
import json
import os
import re
import secrets
import sys
import threading
import time
from typing import Any, Dict, List, Optional

from .config import Clock, as_utc, iso, iso_ms, parse_iso, utcnow
from .store import parse_json

__all__ = [
    "RequestLog", "SecurityLog", "EVENTS", "request_line", "event_line", "safe_path", "new_request_id",
]

MIB = 1024 * 1024

#: The events of the security log. Anything else is still written; this is the
#: vocabulary the core uses and the ``/data`` page can rely on.
EVENTS = {
    "boot": "the service started (stand, version, csp)",
    "sign-in": "a founder signed in (login, addr)",
    "sign-in-failed": "a wrong sign-in (addr; login only when it is a founder's; n = failures of that address in the window)",
    "sign-in-blocked": "the limiter refused a sign-in; written once per key and window (addr, login if a founder's, reason, retryAfter)",
    "login-flood": "more than 200 attempts were turned away within one clock hour; the rest of that hour's "
                   "are not written one by one (count)",
    "sign-out": "a session was closed by its owner (login, addr)",
    "link-issued": "a one-time link was issued (login, by, expires)",
    "link-used": "a one-time link was used (login, addr)",
    "link-refused": "a set-password attempt with a link that does not work (addr, n)",
    "link-blocked": "the limiter refused the set-password door; once per address and window (addr, retryAfter)",
    "password-set": "a password was set through a link; the login's other sessions were closed (login, addr, count)",
    "session-created": "a session was created from the server, not by signing in (login, by, purpose, expires)",
    "sessions-closed": "sessions were closed from the server (login or 'all', by, count)",
    "user-disabled": "a login was disabled (login, by)",
    "user-enabled": "a login was enabled again (login, by)",
    "sessions-damaged": "sessions.json could not be read and was moved aside; everybody signs in again (detail)",
    "seed": "a document was written by ctl seed (doc, by, rev)",
    "doc-shrunk": "a save dropped more than half of a document's rows; the copy it replaced is a shrink- snapshot "
                  "(doc, by, rev, rows, fromRows, snapshot)",
    "restore": "a snapshot was restored as a new revision (doc, snapshot, rev, fromRev, kept, by)",
    "snapshots-purged": "snapshots were deleted on a test or dev stand (doc, count, days, by)",
}

_EVENT_NAME = re.compile(r"[a-z][a-z0-9-]{0,39}")
_FIELD_NAME = re.compile(r"[a-z][A-Za-z0-9]{0,23}")
_SECRETIVE = ("password", "token", "cookie", "secret", "hash")
_RESERVED = ("t", "event")
_TEXT_MAX = 200

_METHODS = frozenset(("GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "CONNECT", "TRACE"))
_LOGIN = re.compile(r"[a-z][a-z0-9._-]{0,31}")
_RID = re.compile(r"[A-Za-z0-9]{1,32}")
_PATH_MAX = 120
_SEGMENT_MAX = 32   # the longest segment this service serves is "pdf.worker.min.js"


def new_request_id() -> str:
    """A short random id that ties a ``500`` answer to its log line."""
    return secrets.token_hex(6)


def _clean_text(value: str, limit: int = _TEXT_MAX) -> str:
    text = "".join(ch if ch.isprintable() else "?" for ch in value)
    return text if len(text) <= limit else text[:limit - 1] + "~"


def safe_path(target: Any) -> str:
    """The path of a request target as it may be logged.

    The query and the fragment are dropped - also when a messenger has encoded
    the ``#`` of a one-time link as ``%23`` and so turned the token into part of
    the path. A segment longer than 32 characters is replaced by ``~``: nothing
    this service serves is that long, a pasted token is.
    """
    if not isinstance(target, str) or not target:
        return "-"
    path = target
    for cut in ("?", "#"):
        path = path.split(cut, 1)[0]
    lowered = path.lower()
    for cut in ("%23", "%3f"):
        at = lowered.find(cut)
        if at >= 0:
            path, lowered = path[:at], lowered[:at]
    segments = [seg if len(seg) <= _SEGMENT_MAX else "~" for seg in path.split("/")]
    path = "/".join(segments)
    path = "".join(ch if 33 <= ord(ch) < 127 else "?" for ch in path)
    return path if len(path) <= _PATH_MAX else path[:_PATH_MAX - 1] + "~"


def _address(value: Any) -> str:
    try:
        return str(ipaddress.ip_address(value)) if isinstance(value, str) else "-"
    except ValueError:
        return "-"


def request_line(*, now, method: Any, path: Any, status: Any, bytes_out: Any = 0, ms: Any = 0.0,
                 addr: Any = None, login: Any = None, rid: Any = None) -> str:
    """One request as one line of JSON: ``t rid method path status bytes ms addr login``.

    Every field is rebuilt from a narrow form, so nothing a caller sent arrives
    here unchecked: an unknown method becomes ``OTHER``, an address that is not
    one becomes ``-``, a login that does not look like a login becomes null.
    """
    method = method.upper() if isinstance(method, str) else ""
    try:
        status = int(status)
    except (TypeError, ValueError):
        status = 0
    try:
        bytes_out = max(0, int(bytes_out))
    except (TypeError, ValueError):
        bytes_out = 0
    try:
        ms = round(float(ms), 1)
        if ms != ms or ms in (float("inf"), float("-inf")):
            ms = 0.0
    except (TypeError, ValueError):
        ms = 0.0
    entry = {
        "t": iso_ms(now),
        "rid": rid if isinstance(rid, str) and _RID.fullmatch(rid) else None,
        "method": method if method in _METHODS else "OTHER",
        "path": safe_path(path),
        "status": status,
        "bytes": bytes_out,
        "ms": ms,
        "addr": _address(addr),
        "login": login if isinstance(login, str) and _LOGIN.fullmatch(login) else None,
    }
    return json.dumps(entry, separators=(",", ":"))


def _scalar(value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if value == value and value not in (float("inf"), float("-inf")) else None
    if isinstance(value, str):
        return _clean_text(value)
    return "<%s>" % type(value).__name__


def event_line(now, event: str, **fields: Any) -> str:
    """An operational note for standard output: ``{"t", "event", ...short scalars}``. Never raises."""
    entry = {"t": iso_ms(now), "event": _clean_text(str(event), 40)}  # type: Dict[str, Any]
    for name, value in fields.items():
        if name in _RESERVED or not isinstance(name, str) or not _FIELD_NAME.fullmatch(name):
            continue
        if any(word in name.lower() for word in _SECRETIVE):
            continue
        entry[name] = _scalar(value)
    return json.dumps(entry, separators=(",", ":"))


class RequestLog:
    """Standard output as a log: one line per request, and the odd operational note.

    Writing never raises: a closed or full stdout must not turn a served request
    into a failed one.
    """

    def __init__(self, stream=None, clock: Clock = utcnow):
        self._stream = stream
        self._clock = clock
        self._lock = threading.Lock()

    def request(self, **fields: Any) -> None:
        """Write one request. Takes the keyword arguments of ``request_line`` except ``now``."""
        self._emit(request_line(now=self._clock(), **fields))

    def event(self, event: str, **fields: Any) -> None:
        """Write an operational note (a boot, a large body, a warning)."""
        self._emit(event_line(self._clock(), event, **fields))

    def _emit(self, line: str) -> None:
        stream = self._stream if self._stream is not None else sys.stdout
        with self._lock:
            try:
                stream.write(line + "\n")
                stream.flush()
            except (OSError, ValueError):
                pass


class SecurityLog:
    """``<data>/security.log``: what was done to the accounts and the documents, and from where.

    Append-only JSON lines ``{"t": "...Z", "event": "...", ...}``. The server and
    ``ctl`` are two processes, so every write takes ``flock`` on a lock file,
    appends one line with one ``write`` and ``fsync``\\ s it. Nothing is kept
    open between writes, so a rotation by the other process is simply seen.
    """

    NAME = "security.log"

    def __init__(self, data_dir: str, clock: Clock = utcnow, *, max_bytes: int = 20 * MIB, keep: int = 10,
                 min_days: int = 400, hard_keep: int = 40):
        self._dir = data_dir
        self._clock = clock
        self._max_bytes = int(max_bytes)
        self._keep = max(1, int(keep))
        self._min_age = int(min_days) * 86400
        self._hard_keep = max(self._keep, int(hard_keep))
        self._lock = threading.Lock()
        #: How many writes failed since this object was made (a full disk, a read-only directory).
        self.failed = 0

    @property
    def path(self) -> str:
        return os.path.join(self._dir, self.NAME)

    # -- writing -------------------------------------------------------------

    def write(self, event: str, strict: bool = False, **fields: Any) -> bool:
        """Append one entry. Returns True when it is on disk.

        A failure to write is swallowed (and counted in ``failed``) unless
        ``strict`` is true: a sign-in must not fail because the log is full, but
        ``ctl`` should not hand out a link it could not record.

        Raises ``ValueError`` for an event or a field name that is not one, and
        for a field named like a secret - those are programming errors.
        """
        entry = self._entry(event, fields)
        data = (json.dumps(entry, separators=(",", ":")) + "\n").encode("ascii")
        try:
            with self._lock:
                self._append(data)
            return True
        except OSError:
            self.failed += 1
            if strict:
                raise
            return False

    def _entry(self, event: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(event, str) or not _EVENT_NAME.fullmatch(event):
            raise ValueError("not an event name: %r" % (event,))
        entry = {"t": iso(self._clock()), "event": event}  # type: Dict[str, Any]
        for name, value in fields.items():
            if name in _RESERVED or not _FIELD_NAME.fullmatch(name):
                raise ValueError("not a field name: %r" % (name,))
            if any(word in name.lower() for word in _SECRETIVE):
                raise ValueError("the security log does not take a field named %r" % (name,))
            if value is None or isinstance(value, (bool, int)):
                entry[name] = value
            elif isinstance(value, str):
                entry[name] = _clean_text(value)
            else:
                raise ValueError("field %r must be a short text, a whole number, true, false or null" % (name,))
        return entry

    def _append(self, data: bytes) -> None:
        cloexec = getattr(os, "O_CLOEXEC", 0)
        lock_fd = os.open(os.path.join(self._dir, ".security.lock"), os.O_RDWR | os.O_CREAT | cloexec, 0o600)
        try:
            self._flock(lock_fd)
            try:
                size = os.stat(self.path).st_size
            except OSError as error:
                if error.errno != errno.ENOENT:
                    raise
                size = 0
            if size and size + len(data) > self._max_bytes:
                self._rotate()
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | cloexec, 0o600)
            try:
                view = memoryview(data)
                while view:
                    view = view[os.write(fd, view):]
                os.fsync(fd)
            finally:
                os.close(fd)
        finally:
            os.close(lock_fd)   # closing the descriptor releases the lock

    @staticmethod
    def _flock(fd: int, timeout: float = 5.0) -> None:
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return
            except OSError as error:
                if error.errno not in (errno.EAGAIN, errno.EWOULDBLOCK, errno.EACCES):
                    raise
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.01)

    def _rotated(self) -> List[int]:
        """The numbers N of the existing ``security.log.N`` files, ascending."""
        numbers = []
        prefix = self.NAME + "."
        try:
            names = os.listdir(self._dir)
        except OSError:
            return []
        for name in names:
            suffix = name[len(prefix):]
            if name.startswith(prefix) and suffix.isascii() and suffix.isdigit() and len(suffix) <= 6:
                numbers.append(int(suffix))
        return sorted(numbers)

    def _rotate(self) -> None:
        """security.log -> .1 -> .2 ...; beyond ``keep`` a file goes only once it is 400 days old."""
        for number in reversed(self._rotated()):
            os.replace("%s.%d" % (self.path, number), "%s.%d" % (self.path, number + 1))
        os.replace(self.path, self.path + ".1")
        now = as_utc(self._clock())
        for number in self._rotated():
            if number <= self._keep:
                continue
            name = "%s.%d" % (self.path, number)
            newest = self._newest_entry(name)
            old = newest is not None and (now - newest).total_seconds() >= self._min_age
            if old or number > self._hard_keep:
                try:
                    os.unlink(name)
                except OSError:
                    pass

    def _newest_entry(self, name: str) -> Optional[datetime.datetime]:
        """When the last entry of a rotated file was written, by the entry's own time; None if it has none."""
        for line in reversed(self._last_lines(name, 3)):
            try:
                return parse_iso(parse_json(line, 2)["t"])
            except (ValueError, KeyError, TypeError):
                continue
        return None

    # -- reading -------------------------------------------------------------

    def tail(self, n: int = 50) -> List[Dict[str, Any]]:
        """The last ``n`` entries, newest first. Lines that are not an entry are skipped."""
        n = max(0, int(n))
        entries = []  # type: List[Dict[str, Any]]
        files = [self.path] + ["%s.%d" % (self.path, number) for number in self._rotated()]
        for name in files:
            if len(entries) >= n:
                break
            for line in reversed(self._last_lines(name, n - len(entries))):
                try:
                    entry = parse_json(line, 2)         # an entry is flat; nothing deeper is read
                except ValueError:
                    continue
                if isinstance(entry, dict) and isinstance(entry.get("event"), str) and isinstance(entry.get("t"), str):
                    entries.append(entry)
                    if len(entries) >= n:
                        break
        return entries

    @staticmethod
    def _last_lines(name: str, wanted: int) -> List[str]:
        """Up to ``wanted`` last complete lines of a file, oldest first, reading only its end."""
        if wanted <= 0:
            return []
        try:
            with open(name, "rb") as handle:
                handle.seek(0, os.SEEK_END)
                size = handle.tell()
                chunk = min(size, max(64 * 1024, wanted * 1024))
                while True:
                    handle.seek(size - chunk)
                    data = handle.read(chunk)
                    lines = data.split(b"\n")
                    if chunk < size:
                        lines = lines[1:]          # the first one is cut in the middle
                    lines = [line for line in lines if line.strip()]
                    if len(lines) >= wanted or chunk >= size:
                        break
                    chunk = min(size, chunk * 4)
        except OSError:
            return []
        return [line.decode("utf-8", "replace") for line in lines[-wanted:]]

    def status(self) -> Dict[str, Any]:
        """Files and sizes, for ``ctl doctor``. Never an entry."""
        files = 0
        total = 0
        for name in [self.path] + ["%s.%d" % (self.path, number) for number in self._rotated()]:
            try:
                total += os.stat(name).st_size
                files += 1
            except OSError:
                pass
        return {"files": files, "bytes": total, "failedWrites": self.failed}
