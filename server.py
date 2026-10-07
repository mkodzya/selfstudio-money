#!/usr/bin/env python3
"""Self Studio — Money: the page and its data, served to this computer only.

Two files of data, each written whole on every save: the ledger (data/db.json)
and the cash plan (data/cash.json). The page is the only client. Nothing here leaves the machine: the server listens on 127.0.0.1
and refuses requests that did not come from its own page.
"""
import datetime
import json
import os
import shutil
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
DB = os.path.join(DATA, 'db.json')
CASH = os.path.join(DATA, 'cash.json')
BACKUPS = os.path.join(DATA, 'backups')
PORT = int(os.environ.get('PORT', '5190'))
HOSTS = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
KEEP_BACKUPS = 90
LOCK = threading.Lock()

# Only these are ever handed out as files. The data folder is not among them:
# it is read through /api/data and /api/cash, by the page, and by nothing else.
STATIC = ('/index.html', '/vendor/')

CASH_LISTS = ('banks', 'inflows', 'team', 'taxes', 'other')


def ledger_rows(doc):
    return len(doc.get('tx') or []) if isinstance(doc, dict) else 0


def cash_rows(doc):
    if not isinstance(doc, dict):
        return 0
    return sum(len(doc.get(k) or []) for k in CASH_LISTS if isinstance(doc.get(k), list))


# The two documents the page keeps. They are saved apart on purpose: the plan
# changes with every keystroke and the ledger is megabytes, and somebody
# planning next month must not be told to reload because a statement was filed.
#   path          — the file
#   prefix        — what its copies in data/backups are called
#   rows          — how many rows a document has, for the "is it being emptied" rule
#   is_doc        — the one thing checked before a body is stored as this document
DOCS = {
    '/api/data': {'path': DB, 'prefix': 'db', 'rows': ledger_rows,
                  'is_doc': lambda d: isinstance(d.get('tx'), list)},
    '/api/cash': {'path': CASH, 'prefix': 'cash', 'rows': cash_rows,
                  'is_doc': lambda d: isinstance(d.get('banks'), list)},
}


def current_rev(path):
    try:
        with open(path, encoding='utf-8') as f:
            return int(json.load(f).get('rev') or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        return 0


def backup(kind, name):
    os.makedirs(BACKUPS, exist_ok=True)
    shutil.copy2(kind['path'], os.path.join(BACKUPS, name))
    old = sorted(f for f in os.listdir(BACKUPS) if f.startswith(kind['prefix'] + '-2'))
    for f in old[:-KEEP_BACKUPS]:
        os.remove(os.path.join(BACKUPS, f))


def save(kind, doc):
    """Write the new state, keeping what it replaces.

    Once a day the file as it stood is copied aside before the first write.
    And a save that would drop more than half the rows copies the old file
    aside first, whatever the day: a page that loaded badly and then saved is
    how a ledger gets emptied, and the copy is what makes that recoverable.
    """
    os.makedirs(DATA, exist_ok=True)
    path, prefix, rows = kind['path'], kind['prefix'], kind['rows']
    now = datetime.datetime.now()
    if os.path.exists(path):
        today = f'{prefix}-{now:%Y-%m-%d}.json'
        if not os.path.exists(os.path.join(BACKUPS, today)):
            backup(kind, today)
        try:
            with open(path, encoding='utf-8') as f:
                before = rows(json.load(f))
        except (OSError, ValueError):
            before = 0
        if before > 20 and rows(doc) < before / 2:
            # The ledger's copies kept their old name; the plan's say whose they are.
            shrink = 'before-shrink' if prefix == 'db' else f'{prefix}-before-shrink'
            backup(kind, f'{shrink}-{now:%Y-%m-%d-%H%M%S}.json')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def ours(self):
        """True when the request comes from this server's own page.

        Any website open in the same browser can send a request to
        127.0.0.1. The Host check stops a page that reached us under another
        name; the Origin check stops a page from another site writing here.
        """
        if self.headers.get('Host') not in HOSTS:
            return False
        origin = self.headers.get('Origin')
        return origin is None or origin in {'http://' + h for h in HOSTS}

    def reply(self, code, body=b'', kind='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.ours():
            return self.reply(403)
        path = self.path.split('?')[0]
        if path in DOCS:
            with LOCK:
                try:
                    with open(DOCS[path]['path'], 'rb') as f:
                        return self.reply(200, f.read())
                except OSError:
                    return self.reply(200, b'{}')
        if path == '/':
            self.path = '/index.html'
            path = self.path
        if not path.startswith(STATIC) or '..' in path:
            return self.reply(404)
        return super().do_GET()

    def do_PUT(self):
        kind = DOCS.get(self.path.split('?')[0])
        if not self.ours() or kind is None:
            return self.reply(403)
        try:
            doc = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
            if not isinstance(doc, dict) or not kind['is_doc'](doc):
                raise ValueError('not the document this door keeps')
        except (ValueError, OSError):
            return self.reply(400)
        with LOCK:
            # A page saves the whole state, so a page that loaded before
            # someone else's save would write that save away. Every write
            # names the revision it was read at; one that is behind is
            # refused, and the page asks to be reloaded.
            now = current_rev(kind['path'])
            if doc.pop('base', None) != now:
                return self.reply(409, json.dumps({'rev': now}).encode())
            doc['rev'] = now + 1
            save(kind, doc)
        self.reply(200, json.dumps({'ok': True, 'rev': doc['rev']}).encode())

    do_POST = do_PUT  # the page's last save on closing arrives as a beacon, which can only POST

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


if __name__ == '__main__':
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        sys.exit(f'Порт {PORT} занят: Money уже запущен. Откройте http://127.0.0.1:{PORT}')
    print(f'Self Studio — Money: http://127.0.0.1:{PORT}')
    print('Окно не закрывайте, пока работаете. Остановить: Ctrl+C.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
