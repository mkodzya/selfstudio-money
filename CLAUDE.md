# Self Studio — Money: how work moves through this repository

Money is the founders' tool for the studio's own money: bank statements filed
into the nine blocks the founders have always kept, a dashboard on top, and a
cash plan for the weeks ahead. One page, `index.html`, with two ways to run it:

- **the laptop tool** — `server.py` and a launcher on the owner's Mac, beside
  the real ledger in `data/`. It works today, and nothing done in this
  repository may break it;
- **the hosted service** — `moneyd/`, one small Python process per stand with
  its own sign-in, for the three founders. Since the owner's decision of
  7 October 2026 Money is a product of its own and not a part of the platform
  (`mkodzya/selfops`): its own repository, checkouts, data, sign-in, deploy
  commands and test stand.

The page itself lives here too. Until 7 October 2026 it was written in the
platform's repository and handed over whole; since that day it is edited in
this one.

What the tool is — `README.md`. What the hosted doors promise — `docs/api.md`.
How the server is put together — `docs/deploy.md`. What protects the data —
`docs/security.md`. Where the work stands today — `docs/handoff.md`. This file
is the working agreement: the rules a session follows before it touches
anything.

Conversations with Mika are in Russian. Code, comments, logs, error codes and
documentation are in English. Two exceptions: `docs/handoff.md` is in Russian,
and so is every text a person sees on Money's pages.

## Six rules that come before everything else

1. **The folder on the owner's Mac that holds `data/` is not a work checkout.**
   See "The laptop folder" below.
2. **The real ledger never enters git.** Since the owner's decision of
   8 October 2026 the test stand holds it, for the rehearsal before prod, and
   nothing may return that stand to the fabricated studio. See "Data rules".
3. **Prod only on the owner's word.** That includes the edge proxy, which is
   read from the platform's prod checkout. A word for test is not a word for
   prod.
4. **A session never runs `invite` on a stand, and never presses «Ссылка для
   входа».** The command prints a one-time sign-in link, and so does the page's
   «Настройки → Люди» for the owner (`POST /api/people/link`). A person runs
   the one in their own Terminal and presses the other in their own browser.
5. **Secrets never pass through a chat**: no password, no one-time link, no
   session cookie, no private key.
6. **The laptop tool changes only on the owner's word.** `server.py`, the
   launcher and `vendor/` are pinned by tests, and no work on the hosted
   service or on the page edits them in passing. See "The page, and the files
   that are pinned".

## The laptop folder

One folder on the owner's Mac holds the real ledger: the checkout with `data/`
in it (the platform's `docs/handoff.md` records it as
`~/Desktop/claude-mika/selfstudio-money`). `server.py` keeps its data beside
itself and has no setting to keep it anywhere else, so in that folder the code
and the studio's money share a directory.

- It follows `main`. It is updated only by `git pull --ff-only`, and only on
  the owner's word. That is also the only way a new page reaches the laptop
  tool.
- It is never a work checkout: no branch switch, no edit, no commit, no
  worktree made from it.
- Nobody runs `git clean`, a Docker build, a mount of the folder, or the tests
  in it. `git clean -fdx` deletes what git ignores, and `data/` is ignored. A
  build context or a mount carries the ledger to where it must not be.
- A session does not read anything under `~/Desktop`.

Engineering happens in a development clone that has no `data/` folder. The
tests enforce their half of this: every test imports `tests/_safety.py`, which
stops the run when `<checkout>/data` exists.

## Data rules

- `data/` is in `.gitignore` on purpose. Nothing from it is ever committed,
  quoted in a commit message, pasted into a document or used as a fixture.
- **Since 8 October 2026 the test stand holds the studio's real ledger**, by
  the owner's decision, for the rehearsal before prod: the history as the
  founders' sheet has it up to 1 October 2026, and what the owner enters after
  that. Until that day it held a fabricated studio and nothing else, and it
  goes back to one only on the owner's word, once prod is live.
  - The owner uploads the real file, through the page. A session never
    uploads one, never carries one and never asks for one in a chat.
  - Nothing returns the stand to the fabricated studio: the nightly timer
    (`money-test-reseed.timer`) is switched off and stays off, and nobody runs
    `money-seed-test`, `money-deploy-test --reseed`, `ctl seed` or
    `ctl purge-snapshots` there. Each of them replaces or deletes the real
    documents. `money-deploy-test` without `--reseed` leaves a stand that
    holds something alone.
  - The lock is a file a person puts in the stand's data directory,
    `/var/lib/money/test/REAL_DATA`: while it is there those four refuse, and
    `money-deploy-test` backs the stand up before it deploys. A person makes
    and removes it; a session does neither. Until it is there, only this rule
    holds them back.
  - The fabricated studio (`scripts/money-demo.mjs`) lives in CI and on dev
    stands.
  - What this decision accepts, and what still protects the data on that
    stand, is in `docs/handoff.md`, «Настоящие данные на тестовом стенде».
- The owner asked a session to compare that stand with the founders' sheet
  (8 October 2026). A real figure seen in such a comparison stays in the
  conversation and in scratch files outside every repository: none goes into a
  commit, a document, a test, a fixture or a memory note.
- Design notes that quote figures taken from real statements stay out of git
  (`design/` is ignored). A note is committed only after the figures are gone.
  The same holds for a document: no sum, no total and no row count of the real
  ledger is written into this repository.
- The hosted work never reads the laptop's `data/`. Tests use documents they
  build themselves or the fabricated studio.
- On a server, `ctl verify` and `ctl doctor` print counts, revisions and sizes,
  never contents. A session with root ssh does not open the files under
  `/var/lib/money/prod` - nor, while the test stand holds real data, under
  `/var/lib/money/test`.
- A file exported from a prod stand lives outside every repository and is never
  copied onto a server's disk.

## Branches: GitFlow

The studio's model (handbook ADR-0007), the same as in the platform repository.

- **`develop`** — the working branch and the default branch on GitHub.
  Everything finished lands here. The test stand follows it.
- **`main`** — releases only. A release is a fast-forward from `develop` plus a
  tag of **bare semver `X.Y.Z`**, no `v` prefix. `0.1.0` is the laptop tool as
  it stood when Money got a repository of its own; the first hosted release is
  `1.0.0`. Prod and the laptop folder follow `main`.
- **`feature/<topic>`** — off `develop`, back into `develop`.
- **`hotfix/<topic>`** — off `main`, merged into **both** `main` and `develop`.
- No other long-lived branches. A branch abandoned before it is merged keeps
  its history as a tag `archive/<branch>-<date>` and is then deleted.

Cutting a release (prod: only on the owner's word):

```sh
git checkout main && git merge --ff-only develop
git tag -a 1.0.0 -m "release 1.0.0 — <what changed, in one line, in English>"
git push origin main 1.0.0
ssh root@204.168.164.31 money-deploy
```

## One checkout, one writer

A checkout has one writer at a time. The root of the development clone stands
on `develop` and stays clean: only `pull`, merges and releases happen in it. A
task gets its own worktree of that clone, or a separate clone:

```sh
# in the root of the development clone
git worktree add ../_worktrees/selfstudio-money-<topic> -b feature/<topic> develop
# ... work in the worktree: commit, push ...
git merge --no-ff feature/<topic> && git push
git worktree remove ../_worktrees/selfstudio-money-<topic> && git branch -d feature/<topic>
```

A branch is merged when its own CI run is green, and the test stand is
deployed in the same step: nobody waits for the run that `develop` starts
after the merge (the owner's decision of 8 October 2026 - two rounds of CI for
one change were half of every wait). That second run still has to come out
green. When it does not, the fix goes before any other work, and the stand is
deployed again. This holds for the test stand only: a release is cut from a
`develop` whose own run is green.

A session works inside its own worktree or clone only. It does not edit files
in someone else's and does not switch branches there. In a multi-agent run the
orchestrator commits; the agents write files and run no git command that
changes state.

Never `push --force`, `reset --hard`, or `stash` someone else's work.

## Commit and push as you go

Every finished change is committed at once and pushed in the same step. A
session does not end with work uncommitted or unpushed: until a commit is on
`origin`, no other session and no other machine can see it.

Commit subjects are verdict phrases in English, in headline case, like the two
that started the history:

```
Money Gets a Repository of Its Own; the Ledger Stays on the Mac
The Page's Checks and Its Made-Up Studio Come Over From the Platform, Byte for Byte
```

The subject says what is now true, not what was done to the files. The body
says why, and what a reader cannot see in the diff.

## The page, and the files that are pinned

**The page lives here.** `index.html`, its checks `scripts/money-checks.mjs`
and the fabricated studio `scripts/money-demo.mjs` were written in the
platform's repository until 7 October 2026 and arrived whole that day (commit
`b529a46`: the files of the platform's commit `f1b184d`, byte for byte). The
freeze on them ended with that commit. They are edited in this repository now,
and the platform's copy stays as it is until it is removed. No test pins
their sha256 — a pin of a file that changes with every page change guards
nothing — but one holds that all three exist: CI's `page-checks` job is
skipped silently when one of them is missing.

What the page is and the rules it works by — `docs/handoff.md`, «Страница:
устройство и правила».

**How a page change is checked.** By CI, on every push to `develop`, `main`,
`feature/*` and `hotfix/*`. The whole file of checks is CI's to run and nobody
else's:

| CI job | What it runs | What it proves |
|---|---|---|
| `page-checks`, in four parts side by side | `scripts/money-checks.mjs`, on a copy of the page, with a stand-in for the server | the page: its calculation and its screens |
| `stand-smoke` | `checks/stand-smoke.mjs`: the page on a real `python -m moneyd`, in Chromium | that the page and the hosted service fit, under the enforced policy |

Node 22 and Playwright at the one version `package.json` names. `ONLY=<key>`
narrows the page checks to one scenario; `SHOTS=<folder>` saves pictures of
the screens; `SHARD=<part>/<parts>` is how CI splits the file - every fourth
check to each of four jobs, so a change waits for the longest part and not for
the sum. A change to the page is not finished until every part of
`page-checks` and `stand-smoke` are green.

**One check, on the Mac.** Since the owner's decision of 8 October 2026 the
check that is being written may be run where it is written:

```sh
scripts/check-one rv-inbal        # the key of a check, or a word of its name
```

One check (or a few named ones), one browser, one run at a time - never the
whole file, which the script refuses to run. It is there so that a slip in a
new check is seen in seconds and not after a round of CI; it proves nothing
that CI has not also proved. It refuses beside a `data/` folder, like the
tests. node and Playwright for it live outside every checkout, in
`~/Developer/_tools/money-checks` (how they got there - `docs/handoff.md`,
«Проверки страницы»); the script installs nothing, and no `npm install` is
ever run in a checkout.

**What the hosted service assumes about the page.** The service serves
`index.html` as it is, byte for byte, and injects nothing. A page change that
breaks one of these breaks the stand, and only some of them are caught before
a deploy:

- **No inline event handler and no `javascript:` address.** The page's policy
  does not run them. `ctl selfcheck` fails a deploy for one in the page's own
  markup. One inside a template that the script draws is not seen by the
  server and is blocked by the browser all the same.
- **No code made from strings** (`eval`, `new Function`, a string given to
  `setTimeout`): the policy has no `unsafe-eval`. The PDF reader is called with
  `isEvalSupported: false` for that reason.
- **Inline scripts are allowed by their hash**, computed from the file at
  start. Scripts from files: only from the stand itself.
- **Three library files and no fourth**: `/money/vendor/pdf.min.js`,
  `pdf.worker.min.js`, `xlsx.full.min.js`, by their absolute paths. Another
  file under `/money/vendor/` is not served.
- **No other host** but Google Fonts (`fonts.googleapis.com` for the
  stylesheet, `fonts.gstatic.com` for the fonts): `connect-src 'self'`,
  `img-src 'self' data: blob:`.
- **A save is `PUT {"base": N, "doc": "<the document as a string of JSON>"}`**
  and nothing nested beside those two. The ledger needs a `tx` array, the plan
  a `banks` array; nothing else in a document is read. The plan's save
  carries one number more, `"ledger": M` - see "A window whose table is
  older" below.
- **Rows are counted** for the before-shrink copy and the `doc-shrunk` alarm:
  `tx` in the ledger; `banks`, `inflows`, `team`, `taxes` and `other` in the
  plan. The plan's `div` list is not counted, so rows moved out of a counted
  list look like rows lost.
- **Limits are on the body**: 16 MiB for the ledger, 4 MiB for the plan. The
  document travels in it as a string, with its quotes escaped, so the document
  itself has to be somewhat smaller. The plan's last save while a tab closes
  uses `fetch` with `keepalive`, and browsers cap such a body at 64 KiB.
- **Every save raises the revision**, and every other open page then gets
  `409` and stops saving until it is reloaded. So a save that nobody asked
  for — on open, on a timer — shuts the other founders' pages. The page makes
  exactly one: an older plan rewritten as version 3, once. A request on a
  timer would also keep a session from ever going idle.
- **`/api/me` is short**: `id` (the login), `name`, `firstName`,
  `isFounderTier`, `role`, `canWrite`, `canManage`, `stand`, `version`. Nothing
  else of the platform's is there. The page waits for this answer before it
  draws: what it may offer depends on it.
- **A reader saves nothing** (the owner's decision of 9 October 2026). The
  first login `MONEY_FOUNDERS` names is the owner; everybody else reads until
  the owner makes them an editor. For a reader (`canWrite: false`) the page
  draws nothing that changes a document and sends no `PUT` — not the save it
  makes when it opens either — and the server answers a reader's `PUT` with
  `403 read_only` whatever the page does. **Every new control that changes a
  document is added to `ACT` in `index.html`**: that list is what a reader's
  page hides, shuts and ignores, and the check `rv-reader` walks every tab for
  a control that is in neither.
- **«Что если» saves nothing** (the owner's decision of 11 October 2026). A
  trial is a list of changes made to a copy of the plan and computed by the
  same engine; it sends no request, changes neither document, and a reload
  forgets it. Its controls (`data-wi-*`) are deliberately not in `ACT`, so a
  reader may ask too; its figures carry `data-wi-k`, never `data-live` - every
  other figure on the page stays the plan's while a trial is on. A change
  that lets a trial write, or lets its figures stand in for the plan's, breaks
  rule 1 of the page; the check `rv-whatif` holds both. A trial says what the
  page would say of a plan written so and no more: no «Можно вывести» and no
  «денег хватает» where the page itself gives none, a split row (`rec.chain`)
  as one payment, a part that has come counted once - `rv-whatif-rules`
  holds each of these, and `docs/handoff.md`, rule 13, lists them.
- **The exchange rates come from the stand, by day** (the owner's decision of
  9 October 2026). The page asks `GET /api/rates` once when it opens, and
  again only by somebody's own act - before it reads a statement whose days
  its copy of the table lacks; nothing asks on a timer, and the page itself
  still speaks to no other host - it is the server that asks the source
  (`moneyd/rates.py`; a dev stand asks nobody). What has already happened is counted at the rate of its own
  day and is never counted over when today's rate moves: a statement row is
  turned into pounds once, when it is read, and carries the rate it was read
  at (`o.r`, and the table's day that answered, `o.rd`); a row marked paid is
  counted by the table's rate of that day. Pounds somebody typed in «Таблица»
  are marked `o.hand` and no rate is put over them (`o.h` is taken: on a row
  in «Разбор» it is the name on the card).
  Only what is still ahead, and what the accounts hold today, follows the
  latest rate - or a rate somebody typed over it (`fxo` in the ledger
  document, beside the typed rates `fx`, which stay as they are for the days
  before the table began). **A change to how the page counts must keep this**:
  the check `rv-rates` moves today's rate and holds every figure of the past.
- **A change to the plan deals nothing of a marked withdrawal over**
  (13 October 2026). Which ledger rows a withdrawal holds is decided by a
  walk over every withdrawal of the plan, so a change to another line used
  to deal old rows into a marked withdrawal or out of it, and «Денег сейчас»
  moved with nothing new from the bank. The page now sees what every
  withdrawal whose mark can count in «Денег сейчас» holds before it changes
  the plan (`Live.write.see`), and keeps it after (`Live.write.keep`):
  where the change would have dealt those rows over, or moved the window
  the statements close the withdrawal by, each such mark is given a memory
  of what its withdrawal held (`paid.saw`) and holds to it; where it would
  not, the plan holds no memory and is counted exactly as before. **A
  change to how withdrawals are dealt must keep three things**: a plan with
  no memory in force is read as it always was - the model differs by its
  one new field, `item.saw`, and by nothing else; a change to another line
  never moves a withdrawal whose mark counts; and no ledger row gives the
  withdrawals more than its own sum. The first is held against the page of
  before the rule by the scripts in `checks/withdrawals/` (run by hand,
  under node - its README says how); the check `rv-wdmark` holds the other
  two and the page's own hand. **A change the page makes to the plan sees
  before and keeps after**: `Plan.edit` does, the keystroke in a row of
  «Касса» does it by hand, and «Что если» does it on its copy - a new way
  to change the plan that goes past them brings the fault back. Three
  things go past them as it is: «Отменить» and the plan loaded from the old
  «Касса», which put a whole plan in the place of this one, and a name
  trimmed as the cursor leaves its row, which changes no count.
- **A window whose table is older than the stand's does not change the
  plan** (13 October 2026). The seeing and the keeping above go by the table
  the window holds, and the ledger and the plan are two documents with two
  revisions: a window opened before another founder uploaded a statement
  would keep by the rows it has and deal over the ones it has never seen.
  So the plan's `PUT` names the revision of the table the window holds
  (`ledger`, beside `base` and `doc`; `S.rev`), and the stand takes the plan
  only while its ledger stands there - otherwise `409 ledger_stale`, and
  nothing is written. That save is the one moment the window learns of a
  newer table: there is no request for it, and none on a timer or on open.
  The page then is what it is after a `409` on the ledger itself: the band
  «Таблица изменилась в другом окне» over every tab, no file taken, and
  every hand that would change the plan refused where it is pressed
  (`Plan.lost`, which also refuses at once in a window that already knows
  its table is behind - `ledOld`). The window does not take its own save of
  the table for somebody else's: the plan waits for that save's answer
  (`ledSaving`), and a plan refused because the window's own save of the
  table overtook it is sent again. **A new way to save the plan sends the
  table's revision with it, and a new way to change the plan asks
  `Plan.lost` first.** The laptop's `server.py` knows no such member and is
  sent none; a page from before the rule, `/data` and `ctl` send none
  either, and are judged by the plan's own revision. The check
  `rv-oldtable` holds all of it with two windows.
  `docs/handoff.md` says it in words: rule 4, and the entry of 13 October
  with what is known and kept.
- **«Люди» speaks five doors of its own**: `GET` and `POST /api/people`,
  `POST /api/people/update`, `POST /api/people/link` (the owner's alone) and
  `POST /api/auth/password`; «Выйти» is `POST /api/auth/logout`. None of them
  is asked before the screen is opened.
- **Four methods**: `GET`, `HEAD`, `POST`, `PUT`. A `POST` to a document door
  is `405`, so `sendBeacon` cannot save on a stand.
- **Addresses**: the page is at `/` on a host that begins with `finance.`. Of
  the platform's old addresses only `/login`, `/tracker/board`, `/dashboard`,
  `/money/` and `/money/index.html` lead anywhere.
- **Refusals the platform never sent**: `storage_busy`, `storage_damaged`,
  `storage_failed`, `body_too_large`, `bad_origin`, `busy`,
  `too_many_connections`, `auth_damaged`, `read_only`, `not_owner`,
  `ledger_stale`; and
  `updatedAt` is `null` before the first save. The page words `409` as
  "reload" - `409 ledger_stale`, from the plan's door, as "the table changed
  in another window: reload" - `403 read_only` as "you only look now" (and
  becomes a reader's page), any other `401` or `403` as "sign in again", and
  everything else as "check the connection".

If a page has to ship before it fits the policy, the policy can be sent as
report-only for a dated while (`docs/deploy.md`, "If a page breaks under the
policy"). On prod that needs the owner's word.

**What is pinned and not edited in passing:**

- `server.py` and `Запустить Money.command` — the laptop tool.
  `tests/test_laptop_frozen.py` pins the sha256 of both, so a change to either
  is a deliberate commit that also changes the pin — and it is made only on
  the owner's word. `moneyd` never imports `server.py`. The verification of
  7 October 2026 found two gaps in `server.py`; they are not fixed, their two
  tests in `tests/test_laptop_server.py` are marked `expectedFailure`, and the
  findings wait in `docs/handoff.md`.
- `vendor/` — the Excel and PDF readers the page loads, pinned in
  `tests/test_repo_hygiene.py`. Replacing the vendored SheetJS is on the
  "Next" list of `docs/security.md`.

One page serves both homes: a change to `index.html` reaches the founders on a
stand with the next deploy, and the laptop tool when the laptop folder is
pulled.

## Stands

| Stand | Address | Branch | On the machine | Updated by |
|---|---|---|---|---|
| prod | `https://finance.selfstudio.se` | `main`, at a release tag | checkout `/opt/money`, data `/var/lib/money/prod`, port `127.0.0.1:5191`, compose project `money-prod` | `ssh root@204.168.164.31 money-deploy` — only on the owner's word |
| test | `https://finance.test.selfstudio.se` | `develop` | checkout `/opt/money-dev`, data `/var/lib/money/test`, port `127.0.0.1:5192`, compose project `money-test` | `ssh root@204.168.164.31 money-deploy-test` |
| dev | `http://finance.localhost:<port>` | the working tree | a clone without `data/`, a temporary data directory, a plain process | `python3 -m moneyd` with `MONEY_STAND=dev` |
| laptop tool | `http://127.0.0.1:5190` | `main` | the laptop folder, data in `data/` beside the code | `git pull --ff-only`, on the owner's word |

Which of these exist today is in `docs/handoff.md`. On the evening of
7 October 2026 the laptop tool was in use, the test stand was being brought up
on the server — from the work branch, because `develop` did not hold the
service yet — and there was no prod stand: the name `finance.selfstudio.se`
was still answered by the platform.

The two server stands share a host and nothing else: separate checkout, compose
project, data directory, loopback port and accounts. A password set on test is
not a password on prod.

The test stand was built to forget: seeded with the fabricated studio when it
is empty, reseeded every night at 00:10 UTC, every snapshot purged. **Since
8 October 2026 it does not forget**: it holds real data (see "Data rules"), so
the nightly timer is switched off on the server. With the marker `REAL_DATA`
in its data directory `money-deploy-test` backs the stand up first, seeds
nothing, and warns when the reseed timer is on or the backup timer
(`money-backup-test.timer`) is off. Without the marker it still prints the old
`WARNING` that the timer is not switched on: switching the timer back on is
not the answer to it.

## Before a change lands

```sh
python3 -B -m unittest discover -s tests -t .
```

Run it from the root of a clone that has no `data/` folder. It needs nothing
but the Mac's own `/usr/bin/python3`: temporary directories, free loopback
ports, no Docker, no node, no network, and no process left behind
(`pgrep -fl moneyd` prints nothing afterwards). `-B` keeps `__pycache__` out
of the checkout. The whole suite is meant to finish in under a minute.

A change to `deploy/` has a second set of checks:

```sh
python3 -B checks/test_deploy.py RestoreTests      # one class; the whole file takes about five minutes
```

They run the real scripts under `dash` against stand-ins for `docker`, `git`
and `flock`, with the real `ctl` behind them. No Docker is needed. CI runs the
whole file, and then the same scripts against a real Docker in its `image`
job; a change to `deploy/` is not finished until that job is green.

What the code has to respect:

- Python standard library only. No package is installed, on any machine.
- It runs on Python 3.9 and on 3.13. The Mac's Python is 3.9.6 and has no
  `hashlib.scrypt`; the image is 3.13. So: no `match`, no `X | Y` in
  annotations that are evaluated at run time, no dependence on `zoneinfo`.
  On the Mac the tests sign in through a KDF that only `MONEY_STAND=dev`
  accepts; the scrypt path is run in CI.
- A new or changed route is a new or changed row in `docs/api.md`.
  `tests/test_routes_doc.py` holds that file to the server's route table and
  pins the exact list of paths that answer without a session, so an open door
  cannot be added by accident.
- A stand file (`deploy/stands/*.env`) holds no secret, and
  `tests/test_repo_hygiene.py` fails when one gains a key it does not know.
- No deploy script creates or deletes `ledger/`, `plan/` or `auth/` inside a
  stand's data directory: on a stand that has run, a missing one is a lost
  one, and the service says so instead of making it anew.
- Every closed finding gets a test that would have failed before the fix.
- The script of Money's own pages (`moneyd/assets/auth.js`) has tests that run
  only where the macOS JavaScript shell `jsc` exists — on the Mac. In CI they
  are skipped, and the browser smoke drives those pages in Chromium instead.
- A document that the change makes untrue is corrected in the same change.

## Heavy jobs

The Mac has 8 GB of memory and other sessions running on it (handbook
ADR-0010). Nothing with Docker is run on it for this repository, no `npm
install` in a checkout, and no whole run of the browser checks. That work
belongs to CI (`.github/workflows/ci.yml`): the image build and the rehearsals
of the deploy commands, the page's browser checks, and the browser smoke of
the page against the real backend. One exception, by the owner's decision of
8 October 2026: `scripts/check-one <key>` - one check of the page, in one
headless browser, one run at a time (see "The page"). The Python tests above
are not a heavy job. `checks/test_deploy.py` as a whole is five minutes
of a busy core: on the Mac run the class you need, and leave the rest to CI.

A step of the workflow is never pasted into a terminal. The rehearsal steps
link the checkout into `/opt`, write under `/var/lib/money` and `/var/log/money`
and replace "prod's" data. They are written to stop at once anywhere but on a
GitHub runner; that guard is a last line, not a permission.

## Prod, invites and secrets

- **Prod moves only on the owner's word**, given for that step: a release, a
  deploy, the prod stand's first setup, each edge change, the import of real
  data, the removal of Money from the platform, the drop of its tables. The
  word once given for the test stand does not cover any of these.
- **A session never runs `invite` on a server stand**, prod or test — not
  `money-user <stand> invite <login>`, not `python -m moneyd.ctl user invite`
  in the stand's container, not with `ssh -t` — **and never asks the page for
  a link there**: not «Ссылка для входа» in «Настройки → Люди», not
  `POST /api/people/link` by hand. The link signs its holder in. A session
  that drives a stand's page in a browser stays away from that card; it also
  never types the owner's password, which that card asks for. Mika runs the line in a Terminal and passes each
  link to its founder, together with the login the command prints above it; a
  session may write the line out for Mika to copy - as plain text, never as a
  block the app can run. Run from inside a conversation, the command prints
  its link into the chat: that happened twice on 8 October 2026, and both
  links had to be spent.
  (The tests issue links on throwaway dev stands in temporary directories;
  that is not this.)
- **Secrets never pass through a chat.** A founder types a password only into
  Money's own page. If a link or a password does end up in a conversation or a
  log, Mika issues a new link for that login: it retires the old link, and
  using it replaces the password and closes that login's sessions. A login is
  not a secret.
- There is no secret to keep in this repository, and none may be added. The
  stand files are committed because they hold none.

## Project memory

`docs/handoff.md` is the running state of the work: what is decided, what
exists, what is being built, what comes next and who does it. It is in git on
purpose — anything that has to outlive a session belongs in the repository.
Update it in the same change that makes it untrue.
