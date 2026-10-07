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
2. **The real ledger never enters git and never reaches the test stand.** See
   "Data rules".
3. **Prod only on the owner's word.** That includes the edge proxy, which is
   read from the platform's prod checkout. A word for test is not a word for
   prod.
4. **A session never runs `invite` on a stand.** The command prints a one-time
   sign-in link. A person runs it, in their own Terminal.
5. **Secrets never pass through a chat**: no password, no one-time link, no
   session cookie, no private key.
6. **Never edit the frozen files.** See "Frozen files".

## The laptop folder

One folder on the owner's Mac holds the real ledger: the checkout with `data/`
in it (the platform's `docs/handoff.md` records it as
`~/Desktop/claude-mika/selfstudio-money`). `server.py` keeps its data beside
itself and has no setting to keep it anywhere else, so in that folder the code
and the studio's money share a directory.

- It follows `main`. It is updated only by `git pull --ff-only`, and only on
  the owner's word.
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
- The test stand holds a fabricated studio and nothing else. It is filled only
  from `scripts/money-demo.mjs` and goes back to that studio every night. No
  real statement is uploaded to it, by a person or by a session.
- Design notes that quote figures taken from real statements stay out of git
  (`design/` is ignored). A note is committed only after the figures are gone.
- The hosted work never reads the laptop's `data/`. Tests use documents they
  build themselves or the fabricated studio.
- On a server, `ctl verify` and `ctl doctor` print counts, revisions and sizes,
  never contents. A session with root ssh does not open the files under
  `/var/lib/money/prod`.
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

## Frozen files

Three files are being rewritten by another session and arrive here whole:

| File | State |
|---|---|
| `index.html` | the page; frozen until the hand-over |
| `scripts/money-checks.mjs` | the page's browser checks; frozen until the hand-over |
| `scripts/money-demo.mjs` | the fabricated studio; frozen until the hand-over |

The session that is finishing iteration 2 of the page on the platform branch
`feature/money-live2` hands all three over in one commit. Until then they are
read, run and served exactly as they are; a change to any of them here would be
overwritten. After the hand-over the page is edited in this repository.

Three more things are not edited by the hosted work at all:

- `server.py` and `Запустить Money.command` — the laptop tool.
  `tests/test_laptop_frozen.py` pins the sha256 of both, so a change to either
  is a deliberate commit that also changes the pin. `moneyd` never imports
  `server.py`.
- `vendor/` — the Excel and PDF readers the page loads. Replacing the vendored
  SheetJS is on the "Next" list of `docs/security.md` and waits for the
  hand-over.

## Stands

| Stand | Address | Branch | On the machine | Updated by |
|---|---|---|---|---|
| prod | `https://finance.selfstudio.se` | `main`, at a release tag | checkout `/opt/money`, data `/var/lib/money/prod`, port `127.0.0.1:5191`, compose project `money-prod` | `ssh root@204.168.164.31 money-deploy` — only on the owner's word |
| test | `https://finance.test.selfstudio.se` | `develop` | checkout `/opt/money-dev`, data `/var/lib/money/test`, port `127.0.0.1:5192`, compose project `money-test` | `ssh root@204.168.164.31 money-deploy-test` |
| dev | `http://finance.localhost:<port>` | the working tree | a clone without `data/`, a temporary data directory, a plain process | `python3 -m moneyd` with `MONEY_STAND=dev` |
| laptop tool | `http://127.0.0.1:5190` | `main` | the laptop folder, data in `data/` beside the code | `git pull --ff-only`, on the owner's word |

Which of these exist today is in `docs/handoff.md`. On 7 October 2026 only the
laptop tool did; the name `finance.selfstudio.se` was still answered by the
platform.

The two server stands share a host and nothing else: separate checkout, compose
project, data directory, loopback port and accounts. A password set on test is
not a password on prod.

The test stand forgets. It is seeded with the fabricated studio when it is
empty, and every night at 00:10 UTC it is reseeded and its snapshots older than
two days are purged. Whatever was typed there lives a day at most.

## Before a change lands

```sh
python3 -m unittest discover -s tests -t .
```

Run it from the root of a clone that has no `data/` folder. It needs nothing
but the Mac's own `/usr/bin/python3`: temporary directories, free loopback
ports, no Docker, no node, no network, and no process left behind
(`pgrep -fl moneyd` prints nothing afterwards). The whole suite is meant to
finish in under a minute.

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
- Every closed finding gets a test that would have failed before the fix.

## Heavy jobs

The Mac has 8 GB of memory and other sessions running on it (handbook
ADR-0010). Nothing with Docker, node, npm or Chromium is run on it for this
repository. That work belongs to CI (`.github/workflows/ci.yml`): the image
build, the page's browser checks, and the browser smoke of the unchanged page
against the real backend. The Python tests above are not a heavy job.

## Prod, invites and secrets

- **Prod moves only on the owner's word**, given for that step: a release, a
  deploy, the prod stand's first setup, each edge change, the import of real
  data, the removal of Money from the platform, the drop of its tables. The
  word once given for the test stand does not cover any of these.
- **A session never runs `invite` on a server stand**, prod or test — not
  `money-user <stand> invite <login>`, not `python -m moneyd.ctl user invite`
  in the stand's container, not with `ssh -t`. The link it prints signs its
  holder in as a founder. Mika runs the line in a Terminal and passes each
  link to its founder; a session may write the line out for Mika to copy.
  (The tests issue links on throwaway dev stands in temporary directories;
  that is not this.)
- **Secrets never pass through a chat.** A founder types a password only into
  Money's own page. If a link or a password does end up in a conversation or a
  log, Mika issues a new link for that login: it retires the old link, and
  using it replaces the password and closes that login's sessions.
- There is no secret to keep in this repository, and none may be added. The
  stand files are committed because they hold none.

## Project memory

`docs/handoff.md` is the running state of the work: what is decided, what
exists, what is being built, what comes next and who does it. It is in git on
purpose — anything that has to outlive a session belongs in the repository.
Update it in the same change that makes it untrue.
