# Self Studio — Money

Bank statements in, the nine blocks of "All Transactions by trimester" out, a
monthly dashboard on top, and a cash plan for the weeks ahead. One page,
`index.html`, for the studio's three founders.

The page has two homes, and this repository holds both:

| | The laptop tool | The hosted service |
|---|---|---|
| What runs | `server.py`, started by `Запустить Money.command` | `moneyd/`, one process per stand |
| Who can open it | whoever sits at that Mac | the three founders, from any device, after signing in |
| Where the data is | `data/`, beside the code | a directory on the studio's server, one per stand |
| State on 7 October 2026 | in use | being built on `feature/hosted-service`; not deployed |

The two are separate programs on purpose. `server.py` has no sign-in and keeps
the real ledger beside itself; a "hosted mode" in that file would put one
setting between the ledger and the internet. So the hosted service is a new
program, and the laptop tool is not edited by it at all.

Where the work stands today is in [`docs/handoff.md`](docs/handoff.md) (in
Russian). The rules for working in this repository are in
[`CLAUDE.md`](CLAUDE.md) — read "The laptop folder" there before running
anything in a folder that has `data/` in it.

## The laptop tool

It works today exactly as described here. Nothing in the hosted work changes
it: `server.py` and the launcher are not edited, and a test pins the sha256 of
both.

### Start

Double-click `Запустить Money.command`. It opens <http://127.0.0.1:5190>.
Keep the Terminal window open while working; Ctrl+C stops it. If Money is
already running, the launcher only opens the page.

It needs nothing but the Mac's own `/usr/bin/python3`: the server uses the
Python standard library only.

### What is where on the Mac

| | |
|---|---|
| `index.html` | the whole tool: page, styles and logic in one file |
| `server.py` | serves the page and reads/writes the data files; Python standard library only |
| `vendor/` | SheetJS and pdf.js, so Excel and PDF statements are read without the internet |
| `data/db.json` | the ledger: transactions, the inbox, rules, settings |
| `data/cash.json` | the cash plan of the «Касса» tab: balances, expected invoices, payouts, taxes — appears on the first save |
| `data/backups/` | each data file as it stood at the start of each day, last 90 of each kept |

### The data

`data/` is the only thing here that cannot be rebuilt. It holds the studio's
money and is not in git on purpose.

- The ledger and the cash plan are two files, each written whole on every
  save.
- Before the first write of a day the server copies `db.json` into
  `data/backups/` as `db-<date>.json`. The newest 90 of these are kept.
- A save that would drop more than half the rows (of a file that has more than
  20) makes an extra copy named `before-shrink-…` first, whatever the day.
  These copies are never deleted by the server.
- `cash.json` is kept the same way, in copies named `cash-<date>.json` and
  `cash-before-shrink-…`.
- A save names the revision it was read at. One made from a page that is
  behind is refused, and the page asks to be reloaded.

To move the tool to another Mac, copy the whole folder.

### The folder that holds `data/` is not a work checkout

On the owner's Mac the code and the ledger share one folder, because
`server.py` keeps its data beside itself. So that folder follows `main`, is
updated only by `git pull --ff-only` on the owner's word, and nothing else is
done in it: no branch switch, no `git clean`, no Docker build, no mount of the
folder, no tests. Work on this repository happens in a separate clone that has
no `data/`.

### Who can reach it

Only this computer. The server listens on `127.0.0.1` and refuses any request
that did not come from its own page (it checks the `Host` and `Origin`
headers). There is no sign-in: whoever can open a browser on that Mac can open
the ledger. Of the files in the folder only `index.html` and `vendor/` are
handed out; `data/` is read through the server's two doors, by the page, and by
nothing else.

## The hosted service

Not deployed yet. This section describes what `moneyd/` is built to be; the
exact contract is in [`docs/api.md`](docs/api.md), the server side in
[`docs/deploy.md`](docs/deploy.md), the protections and their limits in
[`docs/security.md`](docs/security.md).

`moneyd` serves the same `index.html`, unchanged, to the three founders:

- **One process per stand.** Python standard library only, started with
  `python -m moneyd`, in one container, behind the edge proxy that already
  stands on the studio's server. Its port is published on the server's loopback
  address and nowhere else.
- **Two documents as files.** The ledger and the cash plan, each saved whole
  with a revision; a save from a stale page is refused with `409`. Day copies
  and before-shrink copies are kept as files beside them. No database.
- **Its own sign-in.** Three accounts, one per founder. Each founder chooses a
  password through a one-time link that a person issues on the server. The
  password is Money's own, not the platform's. There is no secret in any
  environment file.
- **The same doors the page already speaks.** On a name that begins with
  `finance.` the page asks for `/api/founder/money`, `/api/founder/money/cash`
  and `/api/me` and loads its readers from `/money/vendor/`; `moneyd` answers
  exactly those.
- **One page of its own for people**, `/data`: download each document as a
  file, and upload one. On the test stand it has no upload.

### Two stands

| | prod | test |
|---|---|---|
| Address | `https://finance.selfstudio.se` | `https://finance.test.selfstudio.se` |
| Follows | `main`, at a release tag | `develop` |
| Holds | the studio's real money | a fabricated studio, generated by `scripts/money-demo.mjs` |
| Updated by | `ssh root@204.168.164.31 money-deploy` — only on the owner's word | `ssh root@204.168.164.31 money-deploy-test` |
| Remembers | everything, with nightly backups | a day at most: it is reseeded every night |

The stands share a machine and nothing else: separate checkouts, data
directories, ports and accounts. The sign-in pages of the test stand look
different on purpose (a dark page with a band saying it is the test stand).

There is a third mode, `dev`: a plain local process for the tests and for page
work, at `http://finance.localhost:<port>`. It refuses to start unless it binds
a loopback address.

On 7 October 2026 neither stand exists. `finance.selfstudio.se` is still
answered by the platform (`mkodzya/selfops`), which Money is being separated
from; the plan for moving the name is in `docs/deploy.md`.

## What is where in the repository

| Path | What it is |
|---|---|
| `index.html` | the page. Frozen until another session hands over its next iteration |
| `vendor/` | `pdf.min.js`, `pdf.worker.min.js`, `xlsx.full.min.js` |
| `server.py`, `Запустить Money.command` | the laptop tool |
| `scripts/money-checks.mjs` | the page's browser checks. Frozen, as above |
| `scripts/money-demo.mjs` | the fabricated studio for the test stand and the checks. Frozen, as above |
| `moneyd/` | the hosted service: settings, storage, sign-in, the HTTP server, logs, the `ctl` command line, its own small pages |
| `tests/` | the Python tests of the hosted service and of the laptop tool |
| `checks/stand-smoke.mjs` | the unchanged page against the real backend in a browser; run in CI |
| `deploy/` | `Dockerfile`, `compose.yml`, `stand.sh`, the stand files, the server commands in `bin/`, timers, and a reference copy of the edge blocks |
| `.github/workflows/ci.yml` | CI: the Python tests on 3.9 and 3.13, the image, the page checks, the browser smoke |
| `docs/handoff.md` | the running state of the work, in Russian |
| `docs/api.md` | the HTTP contract of the hosted service |
| `docs/deploy.md` | stands, server setup, deploy, backup and restore, the edge, the cut-over |
| `docs/security.md` | sign-in, sessions, limits, headers, logs, threats and what is still open |
| `CLAUDE.md` | the working agreement: branches, checkouts, data rules |

Not in the repository, on purpose: `data/` (the ledger) and `design/` (notes
that quote figures from real statements).

## Tests

```sh
python3 -m unittest discover -s tests -t .
```

Run it from the root of a clone that has no `data/` folder; the tests refuse to
run beside one. They need only the system `python3` (3.9 or newer): temporary
directories and free loopback ports, no Docker, no node, no network.

Everything that needs a browser or a container runs in CI, not on the Mac: the
image build, `scripts/money-checks.mjs`, and `checks/stand-smoke.mjs`.

## Where it came from

The same page is published as two claude.ai artifacts (a seeded one and an
empty trial copy). The laptop folder is the one in use; the artifacts are
older. Since 3 October 2026 the page has also been served by the platform, at
`finance.selfstudio.se`. On 7 October 2026 this repository was created, and the
owner decided to separate Money from the platform for good. Styles follow
`selfstudio-OPS/apps/web/src/styles/tokens.css`.
