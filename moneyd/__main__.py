"""Start one stand: ``python -m moneyd``.

In this order, and each step may refuse to go on (exit status 2, one sentence on stderr):

1. the settings (``config.Settings.from_env``): the stand's name, its one public address,
   what a dev stand may and a server stand must be - BUILD-SPEC 2.7;
2. the page, the vendor files and Money's own pages (``httpd.WebFiles``): all of them are
   read into memory here, and the page's policy is computed from the page as it is;
3. the data directory (``store.prepare_data_dir``): the laptop tool's files, another stand's
   ``STAND`` marker, files without a marker. On an empty directory the marker is written;
4. the accounts (``auth.Auth.boot``): a damaged ``users.json`` stops the boot - BUILD-SPEC 2.5.
   A damaged document does not: its two doors answer 503 until it is restored;
5. the address to listen on.

Then one ``boot`` line on standard output (and one in the security log), and requests are
served until SIGTERM or SIGINT. On the signal no new connection is taken, requests in flight
get eight seconds to finish, and the process ends with status 0. Every write of this service
is a whole file renamed into place, so being killed in the middle of one loses nothing that
was stored before.

Standard output is the request log: one JSON line per request, and the odd line with an
``event`` member - ``boot``, ``warning``, ``large-body``, ``overload``, ``exception``, ``stopped``.
"""
import os
import platform
import signal
import sys
import threading
from typing import Any, Optional

from . import auth, config, httpd, log, store

__all__ = ["main", "EXIT_REFUSED", "GRACE"]

EXIT_REFUSED = 2
#: What requests in flight get to finish after SIGTERM. Docker waits ten seconds before it kills.
GRACE = 8.0
#: A connection thread's stack. The default of some C libraries is too small to trust.
_STACK = 1024 * 1024


def main(environ: Optional[Any] = None, stdout: Any = None, stderr: Any = None,
         clock: config.Clock = config.utcnow) -> int:
    """Boot, serve, stop. Returns the exit status."""
    environ = os.environ if environ is None else environ
    out = sys.stdout if stdout is None else stdout
    err = sys.stderr if stderr is None else stderr
    requests = log.RequestLog(out, clock)

    def refuse(why: Any) -> int:
        err.write("moneyd: not starting: %s\n" % (why,))
        err.flush()
        requests.event("refused", why=str(why))
        return EXIT_REFUSED

    try:
        settings = config.Settings.from_env(environ, clock)
        # Read-only steps first: a boot that is refused for the page has not touched the data directory.
        web = httpd.WebFiles(settings, clock)
        store.prepare_data_dir(settings.data_dir, settings.stand)
        security = log.SecurityLog(settings.data_dir, clock, max_bytes=settings.security_log_bytes,
                                   keep=settings.security_log_files)
        accounts = auth.Auth(settings, clock, security)
        accounts.boot()
        stores = store.open_stores(settings, clock, security)
    except config.BootRefusal as refusal:
        return refuse(refusal)
    except config.Refusal as refusal:
        # The accounts file: damaged (auth_damaged), or it could not be written at all.
        return refuse("%s (%s)" % (refusal.message, refusal.code))

    try:
        threading.stack_size(_STACK)
    except (ValueError, RuntimeError):
        pass
    try:
        server = httpd.MoneyServer(settings, accounts, stores, requests, clock, security, web)
    except OSError as error:
        return refuse("cannot listen on %s port %d (%s)" % (settings.bind_host, settings.bind_port,
                                                           error.strerror or type(error).__name__))

    mode = "report-only" if settings.csp_report_only(clock()) else "enforce"
    security.write("boot", stand=settings.stand, version=settings.version, csp=mode)
    requests.event("boot", stand=settings.stand, version=settings.version, publicUrl=settings.public_url,
                   bind="%s:%d" % (settings.bind_host, server.port), dataDir=settings.data_dir, csp=mode,
                   kdf=settings.kdf, python=platform.python_version(), pid=os.getpid(),
                   inlineScripts=len(web.facts.script_hashes))
    # What is allowed but should be seen, right under the boot line.
    for warning in settings.warnings:
        requests.event("warning", text=warning)
    # The service starts all the same: `ctl selfcheck` is what fails a deploy for a page whose
    # handlers the enforced policy will not run, and the deploy then goes back by itself.
    if web.facts.inline_handlers:
        requests.event("warning", text="the page has %d inline event handler(s); its policy does not run them"
                       % web.facts.inline_handlers)
    if web.facts.scripted_handlers:
        requests.event("warning", text="%d place(s) in the page's inline script look like markup with an inline "
                       "event handler; its policy does not run such a handler either" % web.facts.scripted_handlers)
    if web.facts.unknown_vendor:
        requests.event("warning", text="the page names %s under /money/vendor/, and only %s are served there"
                       % (", ".join(web.facts.unknown_vendor[:5]), ", ".join(httpd.VENDOR_FILES)))
    for kind, document in stores.items():
        if document.status()["state"] == "damaged":
            requests.event("warning",
                           text="%s is damaged: its doors answer 503 until it is restored (ctl doctor)" % kind)

    stopping = threading.Event()

    def on_signal(number: int, frame: Any) -> None:
        stopping.set()

    handled = {}
    if threading.current_thread() is threading.main_thread():
        for number in (signal.SIGTERM, signal.SIGINT):
            handled[number] = signal.signal(number, on_signal)
    accepting = server.serve_in_thread()
    status = 0
    try:
        while not stopping.wait(1.0):
            if not accepting.is_alive():
                requests.event("warning",
                               text="the accept loop ended by itself; stopping so that the stand is restarted")
                status = 1
                break
    finally:
        cut = server.stop(GRACE)
        requests.event("stopped", cut=cut)
        for number, previous in handled.items():
            signal.signal(number, previous)
    return status


if __name__ == "__main__":
    sys.exit(main())
