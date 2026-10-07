"""moneyd - the hosted Money service.

One process per stand, started with ``python -m moneyd``. Standard library
only; runs on Python 3.9 to 3.13. The laptop tool (``server.py``) is a
different program and is never imported from here.

API for the HTTP layer and the CLI
----------------------------------
``moneyd.__version__``
    What this process was built as: the image sets ``MONEY_VERSION``; a checkout
    that is simply run says ``dev``. (``Settings.version`` is the same value,
    checked.)

The modules below the HTTP layer, each with its own section like this one::

    config   Settings.from_env: a stand's settings, and every refusal to start they decide;
             the clock and the time formats; Refusal, the base of every door's error
    store    DocStore: the two documents as files - revisions, snapshots, restore;
             prepare_data_dir; doctor / verify; parse_json for request bodies
    auth     Auth: sign-in, one-time links, sessions, the limiter; the request checks
             (client address, Host, Origin, Sec-Fetch-Site) and the cookie strings
    log      RequestLog (stdout) and SecurityLog (a file in the data directory)

How a process starts (``__main__`` and ``ctl`` both)::

    settings = config.Settings.from_env(os.environ)             # ConfigError
    store.prepare_data_dir(settings.data_dir, settings.stand)   # DataDirError
    seclog = log.SecurityLog(settings.data_dir, clock, max_bytes=settings.security_log_bytes,
                             keep=settings.security_log_files)
    auth_ = auth.Auth(settings, clock, seclog); auth_.boot()    # AuthDamaged
    stores = store.open_stores(settings, clock, seclog)         # a damaged document does not stop the boot:
                                                                # its doors answer 503 storage_damaged

``ConfigError`` and ``DataDirError`` are both ``config.BootRefusal``.
"""
import os

__all__ = ["__version__"]

#: The version this process was built as. The image sets MONEY_VERSION; a
#: checkout that is simply run says "dev".
__version__ = (os.environ.get("MONEY_VERSION") or "").strip() or "dev"
