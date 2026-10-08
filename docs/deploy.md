# Deploying Money

Two stands on the studio's one server, **prod** and **test**, each a single
container behind the edge proxy that already stands there.

**State on 7 October 2026, evening.** What has run, and where:

- **On the Mac and in CI.** The service, its command line (`ctl`) and the
  commands in `deploy/` are built, on the branch `feature/hosted-service`. CI
  was green on the build that holds the page of iteration 2 (the run on commit
  `b529a46`: the Python tests on 3.9 and 3.13, the image job with its
  rehearsals, the page's checks 1025 of 1025, the browser smoke). An
  independent verification then found 45 things, none critical, and the round
  that fixed them changed the service and nearly every script in `deploy/`.
  This document describes the scripts as they are after that round. The
  changed scripts have run against stand-ins for Docker and git
  (`checks/test_deploy.py`), under `dash`; they have **not yet run against a
  real Docker**. That is CI's `image` job, and its result on the fixed code is
  not recorded here.
- **On the server.** Three steps of the test stand's setup are done: the
  deploy key, the checkout `/opt/money-dev`, the data directory
  `/var/lib/money/test`. The test stand was being brought up from the work
  branch on `127.0.0.1:5192` when this was written; the result of that first
  deploy is not recorded here. Nothing else below has been run there: no prod
  setup, no backup, no restore.
- **The edge.** The block for `finance.test.selfstudio.se` is written, as a
  hotfix branch of the platform, and was validated with the server's own Caddy
  (2.11.4). Its release and the recreate of the proxy are not recorded here.
- **Prod.** There is no prod stand. `finance.selfstudio.se` is answered by the
  platform, and the real statements are in the platform's database.

A step is real only once it has been run and `docs/handoff.md` says so.

Who may do what:

| Mark | Meaning |
|---|---|
| **[owner's word]** | happens only after Mika has said so, for that step. A word for test is not a word for prod |
| **[Mika]** | only Mika does it, by hand. A session writes the line out and does not run it |
| **[session]** | a session may do it as part of its work |

Three things a session never does, whatever the step: run `invite`; read the
files under `/var/lib/money/prod`; put a real statement or a file exported from
prod anywhere but where the step says.

## Stands

| | prod | test | dev |
|---|---|---|---|
| public URL | `https://finance.selfstudio.se` | `https://finance.test.selfstudio.se` | `http://finance.localhost:<port>` |
| loopback port on the host | `127.0.0.1:5191` | `127.0.0.1:5192` | any free port |
| checkout and branch | `/opt/money`, `main` at a tag | `/opt/money-dev`, `develop` | a clone without `data/` |
| compose project | `money-prod` | `money-test` | none: a plain process |
| data on the host | `/var/lib/money/prod` | `/var/lib/money/test` | a temporary directory |
| what its containers said | `/var/log/money/prod` | `/var/log/money/test` | standard output |
| stand file | `deploy/stands/prod.env` | `deploy/stands/test.env` | — |
| updated by | `money-deploy` **[owner's word]** | `money-deploy-test` | — |
| holds | the studio's real money | a fabricated studio, reseeded nightly — **since 8 October 2026 the studio's real ledger, and nothing reseeds it** ("The test stand's data") | whatever a test puts there |

One compose file, `deploy/compose.yml`, serves both server stands under an
explicit project name. `deploy/stand.sh <prod|test> <up|ctl ...|down|logs>`
wraps
`docker compose -p money-<stand> --env-file deploy/stands/<stand>.env -f deploy/compose.yml …`.

The container: `python:3.13-alpine`, a build that only copies files, user
10001, read-only root, all capabilities dropped, `no-new-privileges`, 256 MB,
one CPU, 64 pids, the port published on `127.0.0.1` only, a health check
(`python -m moneyd.ctl ping`) every 60 seconds, and every 2 seconds while the
container starts.

**Settings, by name.** None is a secret, and the stand files are committed.

| Where it is set | Names |
|---|---|
| the stand file | `MONEY_STAND`, `MONEY_PUBLIC_URL`, `MONEY_FOUNDERS`, `MONEY_PORT`, `MONEY_DATA_HOST_DIR`; optionally `MONEY_CSP`, `MONEY_CSP_OVERRIDE_UNTIL` |
| the caller's environment, for one deploy | `MONEY_CSP`, `MONEY_CSP_OVERRIDE_UNTIL` (see "If a page breaks under the policy") |
| fixed by the compose file | `MONEY_DATA_DIR` (`/data`), `MONEY_BIND`, `MONEY_TRUSTED_PROXIES`, `TZ` (`UTC`) |
| set by the build | `MONEY_VERSION`, `MONEY_WEB_DIR` |
| dev only | `MONEY_KDF` |

The five values of a stand file come from the file and from nowhere else: a
`MONEY_PORT` that happens to be in the caller's environment is overwritten by
`stand.sh` before compose sees it.

**The data directory** of a stand, as the container sees it at `/data`:

```
STAND                                         the stand's name; a mismatch with MONEY_STAND stops the boot.
                                              The first start writes it last
ledger/current.json                           {"rev":N,"doc":…,"updatedAt":"…Z"} — the GET answer as stored
ledger/EVER_SAVED                             digits: the highest revision given out, or a higher floor (`ctl floor`).
                                              With it there, a missing current.json is a lost document
ledger/NEVER_SAVED                            only between `ctl floor` on a document never saved and its first save
ledger/snapshots/day-YYYY-MM-DD-revNNNNNN.json.gz
ledger/snapshots/shrink-<utc>-revNNNNNN.json.gz
ledger/snapshots/restore-<utc>-revNNNNNN.json.gz
plan/…                                        the same, for the cash plan
auth/users.json                               per login: password hash, disabled or not, a pending one-time link (hashed)
auth/USERS_WRITTEN                            left by the first write of users.json.
                                              With it there, a missing users.json is the accounts lost
auth/sessions.json                            sha256 of each session token
security.log                                  sign-ins, links, restores, floors, seeds, boots
```

It is a bind mount of a host directory, not a named volume, so
`docker compose down -v` and `docker volume prune` cannot delete it, and backup
and hand restore are plain file work. Kept per document: the newest 90 `day-`
copies and the newest 50 `shrink-` copies; `restore-` copies stay until
somebody removes them. On test every snapshot is purged after each successful
nightly reseed.

The first start of a stand makes `ledger/`, `plan/` and `auth/` and writes
`STAND` last. From then on **one of these three that is missing is never made
anew** — not by a start, not by a request, not by `ctl`: a directory that has
gone was lost, and the stand says so instead of beginning again from nothing
(see "When a directory or the accounts file is lost"). The scripts follow the
same rule: none of them creates or deletes `ledger/`, `plan/` or `auth/`
inside a data directory.

A first start that is killed half-way leaves empty directories and no `STAND`.
The next start refuses, names them and says to remove them; after that the
stand starts fresh. (Two processes that make a stand's very first start in
the same moment can make one of them refuse once. A stand has one container,
so only tests meet this.)

## The server as it was found (7 October 2026, read-only)

One machine, `204.168.164.31`: Ubuntu 24.04, Docker 29.8, Compose v5.5, 2 vCPU,
3,814 MB of memory (2,494 MB available at the time), 58 GB of disk free.

- Three compose projects run there, all the platform's: `selfops-edge` (Caddy
  on the host network; owns ports 80 and 443), `selfops-prod` (web on
  `127.0.0.1:5173`) and `selfops-test` (web on `127.0.0.1:5174`). Nine
  containers, about 570 MB together, none with a memory limit.
- Listening: 80, 443, 22, and on loopback 2019, 5173, 5174. Loopback ports from
  5175 up were free, so 5191 and 5192 were.
- `/opt` held `selfops` (prod, `main`), `selfops-dev` (test, `develop`) and
  `containerd`. Nothing of Money's.
- GitHub: `/root/.ssh` held one key pair, a deploy key of `mkodzya/selfops`
  alone, and no `/root/.ssh/config`. So Money needed a key of its own.
- The platform's two deploy commands exist only on the server
  (`/usr/local/bin/selfops-deploy`, `selfops-deploy-test`). Money's commands
  are kept in this repository and only symlinked there.
- The platform's nightly backup covers the platform's prod database only.

Changed since, the same day, by steps 1–3 of the test stand's setup:
`/root/.ssh/money_deploy` (a key pair of Money's own), `/root/.ssh/config`
with the alias `github-money`, the checkout `/opt/money-dev`, the directory
`/var/lib/money/test`.

## One-time setup: the test stand

**[session]** — Mika allowed this on 7 October 2026: the session may create
Money's test stand on the server itself.

All commands run as root on the server (`ssh root@204.168.164.31`).

**0. Look before touching.** Read-only; stop if available memory is under
700 MB (a deploy refuses below that anyway).

```sh
free -m; df -h /; docker compose ls; docker compose version
ss -ltnp; docker stats --no-stream; docker system df
ls /opt /var/lib/money 2>/dev/null
```

**1. A deploy key and a host alias.** Done on 7 October. The private half
never leaves the server and is never printed. Only the `.pub` line is shown.

```sh
ssh-keygen -t ed25519 -N '' -f /root/.ssh/money_deploy
cat /root/.ssh/money_deploy.pub
cat >> /root/.ssh/config <<'EOF'
Host github-money
    HostName github.com
    User git
    IdentityFile /root/.ssh/money_deploy
    IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
```

The printed public line is added to the repository `mkodzya/selfstudio-money`
as a **read-only** deploy key (GitHub → Settings → Deploy keys). `IdentitiesOnly`
matters: without it ssh offers the platform's key first, GitHub accepts it as
the key of `selfops`, and the clone of Money is refused. The platform's own
pulls are not affected — they use the name `github.com`, which this entry does
not touch.

```sh
ssh -T git@github-money        # expect: "Hi mkodzya/selfstudio-money! …" (the exit code is 1 even then)
```

**2. The checkout.** Done on 7 October.

```sh
git clone -b develop git@github-money:mkodzya/selfstudio-money.git /opt/money-dev
```

That is the line for a `develop` that holds the hosted service. On 7 October
it did not hold it yet — the merge waits for the owner's look at the test
stand — so the stand is brought up from the work branch
`feature/hosted-service`. `money-deploy-test` deploys whatever branch the
checkout stands on and says so in a `WARNING` line. Once `develop` holds the
service the checkout is moved to it by hand, once
(`git -C /opt/money-dev checkout develop`; not run yet), and the warning goes.

Root's usual umask (022) is assumed. The image copies the files with the modes
they have in the checkout, and the container's user has to be able to read
them: a checkout made under a umask of 077 builds an image that cannot start.

**3. The data directory.** Done on 7 October. Owned by the container's user,
closed to everybody else. The service does not create it and refuses to start
without it.

```sh
install -d -o 10001 -g 10001 -m 700 /var/lib/money/test
```

**4. The commands.** Every command the test stand needs is linked now,
`money-user` included: the first sign-in on test needs it.

```sh
ln -sf /opt/money-dev/deploy/bin/money-deploy-test \
       /opt/money-dev/deploy/bin/money-seed-test \
       /opt/money-dev/deploy/bin/money-user \
       /opt/money-dev/deploy/bin/money-smoke \
       /usr/local/bin/
```

**5. The first deploy.**

```sh
money-deploy-test
```

It builds the image, starts the stack on `127.0.0.1:5192`, runs the self-check
and the smoke (15 checks), and — because the stand is empty — seeds it with
the fabricated studio. It ends with one verdict line. Two `WARNING` lines
above the verdict are expected on this first run and mean what they say: the
checkout is not on `develop` (step 2), and `money-test-reseed.timer` is not
switched on yet (step 6).

**6. The nightly reseed, and the words at login when a night fails.**

```sh
ln -sf /opt/money-dev/deploy/systemd/money-test-reseed.service \
       /opt/money-dev/deploy/systemd/money-test-reseed.timer \
       /etc/systemd/system/
ln -sf /opt/money-dev/deploy/motd/97-money-test-reseed /etc/update-motd.d/
systemctl daemon-reload
systemctl enable --now money-test-reseed.timer
systemctl list-timers money-test-reseed --no-pager
```

**7. The name.** The stand now answers on its loopback port and nowhere else.
It gets its public name only through the edge — see "The edge", hotfix 1.

**8. The first sign-in.** **[Mika]**

```sh
ssh -t root@204.168.164.31 money-user test invite mika
```

The command prints the login on a line of its own (`login: mika`) and the
link under it. Mika opens the link, chooses a password, and looks at
`https://finance.test.selfstudio.se`. The sign-in page asks for that login,
not for an e-mail; the set-password page repeats it once the password is
saved.

## One-time setup: the prod stand

**[owner's word]** for all of it. The gates of "Before prod" in
`docs/security.md` come first.

```sh
git clone -b main git@github-money:mkodzya/selfstudio-money.git /opt/money
install -d -o 10001 -g 10001 -m 700 /var/lib/money/prod
install -d -m 700 /var/backups/money
ln -sf /opt/money/deploy/bin/money-deploy \
       /opt/money/deploy/bin/money-backup \
       /opt/money/deploy/bin/money-restore \
       /opt/money/deploy/bin/money-user \
       /opt/money/deploy/bin/money-smoke \
       /usr/local/bin/
money-deploy
```

`money-user` and `money-smoke` serve both stands, and from now on their links
point into the released checkout. That is safe for test: they only talk to a
running container, which `stand.sh` allows from either checkout, while a stand
is *started* only from its own.

The stack is now up on `127.0.0.1:5191`: empty, never seeded, and not reachable
under any name. Then the backup schedule, one backup, and the rehearsal — a
backup nobody has restored is a guess:

```sh
ln -sf /opt/money/deploy/systemd/money-backup.service \
       /opt/money/deploy/systemd/money-backup.timer \
       /etc/systemd/system/
ln -sf /opt/money/deploy/motd/98-money-backup /etc/update-motd.d/
systemctl daemon-reload
systemctl enable --now money-backup.timer
money-backup
money-restore --rehearse "$(ls -t /var/backups/money/money-prod-*.tar.gz | head -1)"
```

This first rehearsal runs on a stand that holds nothing: it proves `tar`, the
unpacking, the boot and that the image can prepare a restore. It does not
prove that a ledger of megabytes comes back. So the rehearsal is **run again
after the real ledger is in** — cut-over step 13.

## Day to day

### Test

```sh
# on the Mac, in the development clone
git checkout develop && git merge --no-ff feature/<topic> && git push
ssh root@204.168.164.31 money-deploy-test
```

`money-deploy-test`, in this order:

1. takes the deploy lock: one Money deploy at a time, whichever stand;
2. refuses a `MONEY_CSP` or `MONEY_CSP_OVERRIDE_UNTIL` the service would not
   start on, and refuses when memory is short or another image build is
   running — before anything has been touched;
3. pulls, fast-forward only, and warns when the checkout is on anything but
   `develop`;
4. hands over to `deploy/stand.sh test up`;
5. seeds **only when the stand is empty** (`ctl empty`).
   `money-deploy-test --reseed` returns the stand to the fabricated studio on
   purpose — after the generator changed, for instance. A plain deploy does
   not throw away what somebody is looking at; the night does;
6. says so in a `WARNING` line when the last nightly reseed failed, or when
   its timer is not switched on;
7. prints the verdict, the last line: `money-test: OK - …` or
   `money-test: FAILED - …`.

While `scripts/money-demo.mjs` is not in the checkout the deploy still
succeeds: it prints a warning and skips the seeding.

`develop` is never rewound. The server pulls fast-forward only: a branch that
was moved back leaves the stand on the code it had, without a word, and a
branch that was rewritten makes the deploy refuse.

### Prod

**[owner's word]**, every time.

```sh
# on the Mac
git checkout main && git merge --ff-only develop
git tag -a 1.0.0 -m "release 1.0.0 — <one line, in English>"
git push origin main 1.0.0
ssh root@204.168.164.31 money-deploy
```

`money-deploy`, in this order:

1. takes the lock `/run/lock/money-deploy.lock`: one Money deploy at a time,
   whichever stand;
2. refuses a policy setting the service would not start on, and refuses when
   less than 700 MB of memory is available or another image build is running
   — before anything has been touched. The machine also serves the platform's
   prod;
3. takes a backup (`money-backup`). A deploy that cannot back up does not go
   on;
4. moves the checkout: `main`, fast-forward only — a deploy that has to merge
   is a deploy nobody reviewed — or the tag that was named. A tag from before
   the hosted service existed is refused before the checkout moves (see
   "Rollback");
5. says which release that is, with a `WARNING` line when the commit carries no
   release tag;
6. hands over to `deploy/stand.sh prod up`.

It never seeds.

### What `stand.sh <stand> up` does

Both deploy commands end here. A stand is started only from its own checkout —
prod from `/opt/money`, test from `/opt/money-dev`; `up` refuses anywhere
else, so the wrong branch cannot be put on a stand.

1. **The policy settings are checked**, before the lock, the build and the
   container: see "If a page breaks under the policy". A refusal ends with
   "Nothing was changed."
2. The lock, the memory rule and the build rule, as above. The data directory
   must exist. If the stand has a container, the directory for what it said
   (`/var/log/money/<stand>`) must be writable, or the deploy refuses here.
3. Builds `money-<stand>:<version>` on the newest patch of the base image. The
   version is `git describe` of the checkout; `/api/me` and `ctl selfcheck`
   report it. An image that does not build changes nothing.
4. Keeps the image the stand runs now as `money-<stand>:previous` — **only
   when its container is running and healthy**. An image that never came up
   is nothing to go back to; the script says so and treats the deploy as a
   first one.
5. Stops the container, keeps what it said (see "The request log"), and starts
   a new one: `up -d --force-recreate --wait`, which has to report healthy
   within 120 seconds. **Every deploy starts a new container, also for the
   same version.** While the stand is stopped by the script, the script itself
   does not end on Ctrl-C or on a dropped connection. (`docker compose` does
   take a Ctrl-C typed at the terminal: it cancels the start, and the script
   then goes back to the previous image.)
6. `ctl selfcheck`, inside the container: the sign-in page, the page
   byte for byte with its policy, the three vendor files, `/api/me`, both
   documents readable, and a save with a far-future `base` that must be
   refused with `409` — the whole write path, with nothing written. It prints
   the policy mode and the image's age. Under an enforced policy it also
   **fails** when the page's own markup has an inline event handler or a
   `javascript:` address: the policy would not run them, and the controls
   they belong to would do nothing. (Two more things it only warns about,
   because they are guesses: markup with a handler inside the page's script
   text, and a name under `/money/vendor/` that is not one of the three files
   served.)
7. `money-smoke <stand>`, on the host, through the loopback port, with the
   headers the edge would send — 15 checks: `/login` is `200` and carries its
   policy; `/` without a session is sent to `/login`; four paths under `/api/`
   without a session answer `401` as JSON, never HTML and never a redirect; a
   `POST` from a foreign `Origin` is `403`; `text/plain` is `415`; one byte
   over the limit is `413`; `/server.py`, `/.git/config`,
   `/data/ledger/current.json` and a path that climbs out of the vendor
   folder are not served; a foreign `Host` is `421`; and **the stand believes
   the proxy about who is asking** — one request to a path made up for the run
   is found again in the stand's own log under the address that was sent in
   `X-Forwarded-For`. Nobody signs in and nothing is written.
8. Removes the stand's older images, the one `previous` named before
   included: the running one and `previous` stay.
9. Prints one verdict line, the last line of its output:
   `money-<stand>: OK - …` or `money-<stand>: FAILED - …`.

When it goes wrong:

- **a policy setting is refused, memory is short, a build is running, the
  image does not build** — nothing was changed; the stand runs what it ran
  before;
- **the new container does not report healthy, or fails its self-check** — the
  previous image is started again, with the policy settings its own container
  had and not those of the attempt that failed (if those would be refused
  today — an override that has ended — it is started enforcing). The exit
  status is not zero. On a first deploy there is no previous image; the stand
  is stopped;
- **the smoke fails** — on prod the previous image is started again as well:
  a stand that does not hold its refusals does not stay in front of the real
  money until somebody arrives. On test the new version stays up, the verdict
  says `FAILED`, and the exit status is not zero;
- **the previous image does not come up either** — the stand is stopped, not
  left in a restart loop, and the verdict ends "the stand is DOWN";
- **what the outgoing container said cannot be kept** after it was stopped —
  the container is not replaced; it is started again as it was;
- **the connection drops** while the container is being replaced — the
  script finishes the replacement and then ends with a non-zero status, the
  new container up and healthy, without the self-check and the smoke: there is
  nobody to read them, and a write that fails must not be taken for a check
  that failed. Run `stand.sh <stand> ctl selfcheck` and `money-smoke <stand>`
  by hand afterwards.

`ctl`, `logs` and `down` only talk to a container that exists and work from
either checkout. `down` on prod asks for the stand's name to be typed; it
stops the container, keeps what it said and only then removes it.

A deploy is a restart: Money answers `502` through the edge while the old
container is stopped, its log is kept and the new one starts — seconds, not
measured on the server yet. Nobody is signed out. The service gives a request
in flight eight seconds to finish; a save that arrives while nothing is
running is not stored, and the page says «не сохранено — проверьте связь». The
page sends a ledger again only with the next change; a plan it sends again by
itself after a few seconds.

### Rollback

```sh
ssh root@204.168.164.31 money-deploy 1.0.0      # [owner's word]
```

With a tag, `money-deploy` checks that tag out and deploys it. That is the
rollback. The next plain `money-deploy` goes back to `main`. A rollback changes
the code, not the data: to take data back, see "Backup and restore".

A tag that does not hold the hosted service is refused before the checkout
moves: `0.1.0`, the laptop tool as it stood, has no `deploy/` folder, and
checking it out would take every `money-*` command and the nightly backup
away with it.

One caution about going back to code from **before 7 October's fix round** (no
release is that old; an image on the test stand may be): if `ctl floor` has
since been used on a document that was never saved, the older code reads that
document as lost and answers `503` for it.

### If a page breaks under the policy

The page's content security policy is enforced. If a new page stops working
because of the policy, the policy can be sent as report-only for one deploy,
which reports and does not block:

```sh
ssh root@204.168.164.31 MONEY_CSP=report-only money-deploy-test
```

There is no "off". On prod the same needs a day on which it ends, and the
owner's word:

```sh
ssh root@204.168.164.31 MONEY_CSP=report-only MONEY_CSP_OVERRIDE_UNTIL=<YYYY-MM-DD> money-deploy
```

**What is checked, and when.** `stand.sh` checks the two values before a
deploy touches anything, whether they come from the caller's environment or
from the stand file:

- `MONEY_CSP` is `enforce` (the default) or `report-only`, nothing else;
- `MONEY_CSP_OVERRIDE_UNTIL`, when given, is a real day written `YYYY-MM-DD`,
  on every stand;
- on prod, `report-only` needs that day, and the day must not have passed
  (UTC). The day itself still counts.

A refusal is one line — `money-<stand>: FAILED - <why>. Nothing was changed.` —
and the stand keeps running what it ran. A mistyped value can therefore no
longer take a healthy stand down.

**When the day passes.** A running prod goes back to enforcing by itself on
the day after the named date, without a restart. The stand keeps working:
its health check, its restarts and every `ctl` command go on, and `ctl
selfcheck`, `ctl doctor` and a warning under the boot line say that the
override ended on that day. The stale pair of values stays in the container
until the next deploy; a deploy that names the same passed day again is
refused, a plain one clears it.

**What it does not bound.** Any day that has not passed is accepted on prod,
however far ahead: a date years away is an off-switch in effect. Whether to
cap it, and at how many days, is the owner's decision
(`docs/handoff.md`).

The deploy says what it was asked for in a `NOTE` line, `ctl selfcheck` prints
the mode, and the smoke adds a `WARNING`. Under report-only the self-check
only warns about inline handlers in the page instead of failing. The fix is
in the page or in the policy, not in leaving this on.

### Accounts and sessions

```sh
ssh -t root@204.168.164.31 money-user <stand> invite <login>     # [Mika] — never a session
ssh root@204.168.164.31 money-user <stand> list                  # who may sign in, who has a password, who has a link pending
ssh root@204.168.164.31 money-user <stand> disable <login>       # stops working at the next request
ssh root@204.168.164.31 money-user <stand> enable <login>
ssh root@204.168.164.31 money-user <stand> retire-links          # every pending one-time link stops working
ssh root@204.168.164.31 money-user <stand> sessions              # counts and dates, never tokens
ssh root@204.168.164.31 money-user <stand> logout <login>
ssh root@204.168.164.31 money-user <stand> logout --all
```

`invite` needs a terminal on both ends (`ssh -t`). Without one it refuses
before anything changes: the link would be issued and shown to nobody, and
issuing a link retires the one before it. Its last two lines are the login
(`login: <login>`) and the link. **Both are passed on**: the sign-in page asks
for the login, and it is not an e-mail. The founder sees the login again on
the set-password page once the password is saved, and on `/login` when signed
in.

`retire-links` is for the moment after a whole stand came back from a backup;
`money-restore` runs it by itself when it has to.

Everything else of `ctl` goes through the stand wrapper:

```sh
/opt/money/deploy/stand.sh prod ctl doctor       # what is wrong, and which snapshot to bring back
/opt/money/deploy/stand.sh prod ctl selfcheck
/opt/money/deploy/stand.sh prod logs             # the last 200 lines; add -f to follow
```

For test the same with `/opt/money-dev/deploy/stand.sh test …`.

The whole command line, `python -m moneyd.ctl <command>` inside the container:

| Command | What it does |
|---|---|
| `ping` | is the service answering — the container's health check |
| `selfcheck` | the doors, end to end, through the service's own port |
| `doctor` | what is wrong with the data, and which snapshot brings a damaged document back |
| `verify <dir>` | the same counts for any data directory — an unpacked backup, say. Read-only |
| `user list` · `user invite <login>` · `user disable <login>` · `user enable <login>` · `user retire-links` | accounts and one-time links |
| `sessions list` · `sessions logout <login>` · `sessions logout --all` | open sessions |
| `snapshots <ledger\|plan>` | names, revisions and sizes, newest first |
| `restore <ledger\|plan> <snapshot>` | one document back from a snapshot; asks to type the stand's name |
| `floor <ledger\|plan> <N>` | no later revision of that document is `N` or lower. Loses nothing, lowers nothing; allowed on every stand; exit 0 also when the floor was that high already, and for `N` = 0 |
| `empty` | exit 0 when both documents are at revision 0, else 1 |
| `seed <ledger\|plan> [--fresh]` | **test and dev only**: the document on standard input, written through the stand's own save door. Without `--fresh` it fills an empty document only; with it, it replaces what is there. It never deletes a snapshot |
| `purge-snapshots --older-than-days N` | **test and dev only**; `N` is 0 to 36500, and 0 means all of them |

Exit status: 0 done, or "yes"; 1 failed, or "no"; 2 refused before anything
was changed — a command this stand does not take (`seed` on prod), a setting
that stops the service too, a wrong command line, a number no command takes.
No command prints what a document holds: revisions, row counts, sizes and file
names only. `doctor` and `verify` name paths as the container sees them
(`/data/…`); on the host that is the stand's data directory.

### The request log

Who asked for what, from which address, and who saved, is the container's
standard output: one JSON line per request. Docker keeps it in the container's
own directory, in rotated files of 5 × 10 MB, and deletes it together with
the container. So before a container is replaced (`up`, and the way back
after a failed `up`) or removed (`down`), `stand.sh` stops it and keeps what
it said:

```
/var/log/money/<stand>/requests-<utc>.log.gz      mode 600, in a directory of mode 700
```

- One file for each container, named for the moment it was set aside; standard
  output and standard error together, as plain lines without Docker's own
  timestamps (every line carries its time). It is read after the container
  has stopped, so the last second is in it. Read one with `zcat`.
- Files older than 400 days are removed when the next one is kept.
- `stand.sh <stand> logs` shows the container that runs now and says, on
  standard error, where the earlier ones are.
- The directory appears with the first deploy that has a container to
  replace; after a stand's very first deploy there is none yet.
- **How far back it reaches within one container's life** is Docker's
  rotation: the last 50 MB. A container that runs for many months without a
  deploy loses its oldest lines. Raising that is not decided.
- When the log cannot be kept: `up` refuses before touching anything if the
  directory cannot be made or written, and does not replace the container if
  the read fails after the stop; `down` leaves the container stopped and not
  removed. Only the way back after a failed deploy goes on with a warning: a
  stand that serves comes first there.

The security log is a different file — `security.log` in the data directory —
and travels with the data: it is in every backup, and after a whole-stand
restore the directory that was moved aside holds its lines for the days since
the backup.

## The test stand's data

**Since 8 October 2026 this stand holds the studio's real ledger** — the
owner's decision, for the rehearsal before prod (`CLAUDE.md`, "Data rules";
`docs/handoff.md`, «Настоящие данные на тестовом стенде»). What follows is how
the stand is filled with the fabricated studio, and so it is the list of what
must not run there now:

- the timer is switched off on the server
  (`systemctl disable --now money-test-reseed.timer`) and stays off;
- nobody runs `money-seed-test`, `money-deploy-test --reseed`, `ctl seed` or
  `ctl purge-snapshots` on it. No command refuses them yet: only the rule
  holds them back. A lock and a daily backup of this stand are being built;
- `money-deploy-test` without `--reseed` leaves a stand that holds something
  alone, and warns at every run that the timer is not switched on. That
  warning is expected.

The rest of this section describes the stand as it was until that day and as
it is again once the owner returns it to the fabricated studio.

- Only the fabricated studio, from `scripts/money-demo.mjs`, which runs as it
  is in a throwaway container with no network:

  ```sh
  docker run --rm --network none --read-only -v /opt/money-dev/scripts:/s:ro \
    node:22-alpine node /s/money-demo.mjs <ledger|plan> <YYYY-MM-DD>
  ```

  Its output goes into `ctl seed <ledger|plan> --fresh`, which writes it through
  the stand's own save door with a session of a few minutes that the stand
  makes for itself. So there is no robot login and no password anywhere, and
  every seeding also proves the write path. `money-seed-test` is that pipeline:
  both documents are made first, for the same day, and stored after, so a
  generator that fails leaves the stand as it was. The day is today's date in
  London, which is how the page reckons "today". A seed the stand refuses — a
  save by somebody in the same moment answers `409` — is tried once more.
- `ctl seed` exists only on `test` and `dev`. On `prod` it refuses and exits
  with 2.
- `money-test-reseed.timer`, every night at 00:10 UTC, runs `money-seed-test`:
  the reseed, then `ctl purge-snapshots --older-than-days 0` — **every
  snapshot**. A seed is a save, and a save keeps what it replaces as the day's
  copy, which is exactly what was typed or uploaded on test since the night
  before; with all copies gone after each reseed, **anything put on test lives
  a day at most — out of the document and out of every copy by the next
  successful reseed.** Accounts and passwords survive. A deploy in progress is
  waited for, up to five minutes, not raced.
- **A night that fails leaves the stand as it was**, and with it whatever was
  put there. It is said in three places: `journalctl -u money-test-reseed -n
  30 --no-pager`, a `WARNING` line of the next `money-deploy-test`, and the
  words at login (`deploy/motd/97-money-test-reseed`). The unit ends a run
  after fifteen minutes, so a reseed that hangs cannot hold the lock every
  Money deploy needs, prod's included, all night.
- `/data` on test draws no upload control.

## Backup and restore

### What is backed up

Prod only. `money-backup`, from `money-backup.timer` every night at 03:40
Asia/Yerevan (ten minutes after the platform's own) and before every prod
deploy:

- a tarball of `/var/lib/money/prod` — both documents, their snapshots and
  markers, `users.json` and its marker, the security log — without
  `auth/sessions.json` and without temporary files;
- written as a `.part` file, checked (`gzip -t`, `tar -tzf`), then renamed to
  `/var/backups/money/money-prod-<utc>.tar.gz`; mode 600 in a directory of
  mode 700. An interrupted run leaves no half-written file;
- 14 days kept. Each tarball carries up to 90 day copies, so the tarballs reach
  further back than 14 days;
- no stop and no lock are needed: every file in the data directory is replaced
  whole. `tar` may still see a file vanish while it runs (exit code 1); the
  script tries once more and then fails loudly, leaving no file behind;
- a stand that has never started has an empty directory, and nothing is written
  for it: an archive of nothing would only look like a backup;
- `deploy/motd/98-money-backup` speaks at login only when the newest tarball is
  older than 26 hours. `journalctl -u money-backup` is what a night said.

The test stand is not backed up: it is a generated copy by definition.

### One document back from a snapshot

For "a save emptied the ledger" and its relatives. **[owner's word]** on prod.

```sh
/opt/money/deploy/stand.sh prod ctl snapshots ledger           # names, revisions, sizes; newest first
/opt/money/deploy/stand.sh prod ctl restore ledger <snapshot>  # asks to type the stand's name
```

`restore` copies the current state aside as a `restore-…` snapshot and writes
the chosen one as a new revision, one above the highest the document ever had.
Every open page therefore gets `409` and reloads instead of saving its old
copy over the restore. There is no HTTP door to this. It asks a question, so
run it with `ssh -t`.

"Newest" means the highest revision: revisions only grow, while a day copy is
dated at the start of its day and would otherwise sort below a restore copy
made earlier the same day.

When a document answers `503 storage_damaged`, `ctl doctor` names the snapshot
to restore: **the newest one that reads back**. A copy that does not unpack is
passed over, and `doctor` says which ones it passed over; when none reads back
it says so. `restore` is the one write a damaged document takes: the damaged
file is moved aside as `current.json.damaged-<utc>`, not deleted.

`current.json` is never edited by hand. It has one exact layout, the one a
save writes; a file that was reformatted, cut short or replaced by a bare
document is treated as damaged. Removing `current.json` and `EVER_SAVED` by
hand is not a way to empty a document either: while copies of it lie in
`snapshots/`, a missing document is a lost one.

### When a directory or the accounts file is lost

Lost is not "never saved", and nothing here is made anew by itself. What the
stand does, and the two ways out — each a person's decision, **[owner's
word]** on prod:

| What is gone | What the stand does | To bring it back | To begin anew on purpose |
|---|---|---|---|
| `ledger/` or `plan/`, with its copies | starts; that document's doors answer `503 storage_damaged`; the other document works; `ctl doctor` says so | stop the stand and put the directory back from a tarball, or restore the whole stand | make the directory, empty, by hand: `install -d -o 10001 -g 10001 -m 700 /var/lib/money/<stand>/<kind>`. The document then reads as never saved |
| `auth/users.json`, while `auth/USERS_WRITTEN` is there | does not start (`auth_damaged`); a running one answers `503 auth_damaged` to the sign-in doors and to every request that carries a live session — not `401`, which would stop open pages from saving | put `auth/users.json` back from a tarball | delete `auth/USERS_WRITTEN` by hand. The next start makes the three accounts without passwords; every founder needs a link |
| the whole `auth/` | the same | put it back from a tarball | make the directory, empty, by hand, as above |
| the data directory itself | does not start; a running one answers `503` on reads and `507` on saves | "A whole stand back from a tarball" | — |

Whatever is put back or made by hand belongs to the container's user (10001)
and is closed to everybody else, like the rest of the directory. There is no
command for one document's directory out of a tarball; it is plain file work
on a stopped stand, and it is not rehearsed. Restoring the whole stand is the
rehearsed path, and it does two things that hand work has to do itself:

- **a document put back from a tarball is at the tarball's revision**, while a
  page left open holds a later one. Right after the stand is started, raise
  the document's floor far above it —
  `stand.sh <stand> ctl floor <ledger|plan> <N>`; `money-restore` takes a
  million above the highest revision it knows — or that page could later save
  its old copy over what came after;
- **an accounts file put back from a tarball brings its pending links back.**
  Run `money-user <stand> retire-links` at once: a link that was pending in
  the tarball and has been used since would work again.

### A whole stand back from a tarball

For a lost or damaged data directory. **[owner's word]**.

```sh
ssh -t root@204.168.164.31 money-restore /var/backups/money/money-prod-<utc>.tar.gz
```

It replaces the stand's data directory. Before anything is touched it refuses
when the tarball does not read whole or does not carry prod's own `STAND`
marker, when no Money image exists on the machine, and when the stand's image
does not know `ctl floor` and `ctl user retire-links` (an image from before
they existed: deploy a current release first). Then, in this order:

1. the stand's name has to be typed;
2. the deploy lock is taken, and the container is stopped;
3. the directory as it stands is moved aside, never deleted:
   `/var/lib/money/prod.before-restore-<utc>`;
4. the tarball is unpacked into a new, empty directory owned by 10001;
5. **the accounts do not go back in time when that can be helped.** If the
   accounts file in the directory that was moved aside reads — `ctl verify` on
   that directory, mounted read-only, prints a count for it — that newer file
   is kept in place of the backup's. A restore is about the documents, not
   about undoing passwords, disabled logins and used one-time links. If it
   does not read, the accounts are the backup's, and **every pending one-time
   link in them is retired** (`ctl user retire-links`): a link that was
   pending when the backup was taken and has been used since would otherwise
   work again, for whoever still has the message it was sent in. Either way
   the list of accounts is printed;
6. **the revisions cannot return to a number a browser may hold.** The
   backup's documents are at the backup's revisions; a page left open from
   before the restore holds a later one and would be let in again as soon as
   the count reached it — saving its old copy over everything saved since. So
   for both documents `ctl floor <ledger|plan> <N>` forbids every revision up
   to `N`: the highest the directory that was moved aside knows of (the number
   in its `EVER_SAVED`, the first bytes of its `current.json`, the names of
   its snapshots — counts, never contents). When that directory cannot say —
   it is gone, or it does not read — `N` is 1,000,000 above the highest
   revision known. The stored revision stays the backup's; the next save is
   written above `N`, and the page from before is told to reload (`409`);
7. the container is started and has to pass `ctl selfcheck`;
8. if any of 4 to 7 does not hold — or the run is interrupted: Ctrl-C, a
   dropped connection — the directory that was moved aside is put back, the
   container is started on it again if it was running, and what the attempt
   left is kept beside it as `prod.failed-restore-<utc>`. The last line says
   `money-restore: FAILED - …`.

Steps 5 and 6 run in a throwaway container of the stand's own image with no
network, before the stand serves a byte of the restored data, and leave their
lines in the security log — `floor-raised` for each document, and
`link-retired` for each link that was pending — which a founder sees on
`/data`.

Afterwards:

- the tarball has no sessions in it, so every founder signs in again, and
  **every Money page that was open is reloaded**. One that is not is refused
  at its next save and says so — `401` until its founder has signed in again,
  `409` after;
- when the accounts were kept, nothing of them went back in time. When they
  are the backup's, the script says so: a password set after the backup is
  gone and that founder needs a new link (`money-user prod invite <login>`,
  **[Mika]**); a login disabled after the backup is enabled again and is
  disabled again by hand if it should be;
- the directory that was moved aside also holds the security log of the days
  since the backup. It is removed by hand, once somebody has looked;
- a stand that had no container is prepared and left for `money-deploy` to
  start. A restore that fails on a machine where the data directory was gone
  makes up no empty directory and leaves the container stopped: a stand
  started on an empty directory would hand every founder an empty ledger to
  save into.

### The rehearsal

```sh
money-restore --rehearse /var/backups/money/money-prod-<utc>.tar.gz
```

Unpacks the tarball into a scratch directory, starts a throwaway container on
it — the stand's own image, no network, no published port — runs `ctl verify`
(revisions, row counts and sizes, never contents) and `ctl selfcheck` inside,
then the two preparations of a real restore on the copy (`ctl floor` for both
documents, `ctl user retire-links`), and removes the container and the
directory — also when it is interrupted. Prod is not touched.

It is run twice before the name moves: on the day prod is set up, on a stand
that holds nothing, and **again on the first backup taken after the real
ledger is in** (cut-over step 13) — the first tarball that matters. It is a
gate before the real ledger is loaded (`docs/security.md`, "Before prod").

A prod tarball is never restored into the test stand; `money-restore` cannot
do it.

### What the backups do not cover

They sit on the same disk as the data, unencrypted, and contain the ledger and
the password hashes. That is enough for an emptied document and not for a dead
disk or a lost machine. **Nothing is off the host.** Where an off-host copy
lives is the owner's decision and a gate before prod.

Until then the manual copy is «Скачать» on `/data`. It saves the **bare
document** — `money-ledger-YYYY-MM-DD.json`, `money-plan-YYYY-MM-DD.json`, by
the day on the founder's own clock — and not the `{rev, doc, updatedAt}`
answer around it. Either file goes back in through `/data`'s own upload; the
ledger file is also what the page's own «Загрузить данные из файла» reads, on
a stand and in the laptop tool alike. The names carry no stand: a file from
test and one from prod are named alike. Nothing is saved when the door does
not answer `200` with a document that has been saved before.

An upload on `/data` replaces a document whole. Before it does, the page
itself downloads what the server holds at that moment as
`money-<ledger|plan>-before-replace-YYYY-MM-DD.json`; if that copy cannot be
had, or the server has moved on since the question was asked, nothing is
replaced. A save by itself keeps what it replaces only on the day's first save
or when most rows go.

## The edge: two blocks in the platform's `Caddyfile.edge`

One machine has one port 443, and the proxy that owns it belongs to the
platform: compose project `selfops-edge`, started from `/opt/selfops`, reading
`/opt/selfops/Caddyfile.edge` — a file in the platform's **prod checkout**.
So a Money name, even the test one, reaches the world only through a change on
the platform's `main`. That is the one place where the split stops.

Three facts about that proxy decide the procedure:

- **The edge is not part of a deploy.** `selfops-deploy` rebuilds the
  platform's prod stack and leaves the proxy alone. The proxy holds the file
  through a bind mount of the file itself, and `git pull` replaces the file
  rather than editing it, so the running proxy keeps the old one until it is
  recreated.
- **Recreating it takes every name away for a few seconds** — the platform's
  four and Money's.
- **A file that does not parse takes every name away** — at the recreate, and
  equally at any later start of the proxy for any reason, a reboot included —
  until it is fixed by another commit on `main`. So a broken file must never
  reach the prod checkout at all.

Hence two rules for the blocks — a name goes in only once it exists in DNS, and
a block points only at a port where something already answers — and the guards
below.

The reference copy of the two blocks is `deploy/edge/Caddyfile.money`; CI runs
`caddy validate` on it. Each block has this shape (if this excerpt and that
file differ, the file wins; and what the proxy reads is the platform's file,
not this copy):

```
finance.test.selfstudio.se {
	request_body {
		max_size 17MB
	}
	reverse_proxy 127.0.0.1:5192
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	header X-Robots-Tag "noindex, nofollow"
	log {
		output stdout
		format console
	}
}
```

- The body cap sits just above Money's own 16 MiB limit, so Money answers the
  `413` itself, as JSON, and the edge only stops what is larger still.
- `encode` is here because Money has no web container of its own to compress a
  page of half a megabyte and a ledger of megabytes for a phone.
- **Request buffering is not in the blocks.** It is added only after
  `caddy validate` accepts the option on the server's Caddy version. Until
  then a body reaches Money as fast as the founder's own connection sends it,
  and Money's deadline for it runs against that connection: 20 seconds plus
  one second per 10 000 bytes, ten minutes at most. A link that carries 10 000
  bytes a second is enough for a ledger of up to about 5.8 MB; at the 16 MiB
  limit the ten-minute cap asks for about 28 000 bytes a second. Below that a
  save is cut without an answer and the page says «не сохранено — проверьте
  связь».
- Validating the reference copy in CI does not test the file the proxy reads.
  The guards below do.

### The procedure, for each of the two hotfixes

**[owner's word]** — an edge change counts as touching prod, and the hour is
Mika's to pick: the team uses the platform every day.

1. **Before anything**: the name exists in DNS (at Cloudflare, "DNS only" —
   behind Cloudflare's own proxy the machine never sees the certificate
   challenge), and the Money stack the block points at already answers on its
   port.
2. **The change**, in the platform repository and under its rules: a branch
   `hotfix/<topic>` off `main` that touches only `Caddyfile.edge` and
   `docs/deploy.md`; merged into `main`, tagged as the next patch release,
   pushed; merged into `develop` as well.
3. **The new file is validated as a copy, before it reaches the prod
   checkout.** `git fetch` does not move the checkout:

   ```sh
   ssh root@204.168.164.31 '
     git -C /opt/selfops fetch -q &&
     git -C /opt/selfops show origin/main:Caddyfile.edge > /root/Caddyfile.next &&
     docker run --rm -v /root/Caddyfile.next:/etc/caddy/Caddyfile:ro caddy:2-alpine \
       caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   '
   ```

   If this fails, stop here: nothing on the server has changed, and the fix is
   another commit on the platform's `main`. Only when it passes:
4. **The pull**: `ssh root@204.168.164.31 selfops-deploy`. No platform image
   copies either file, so nothing should be rebuilt or restarted (inferred from
   the Dockerfiles; not observed).
5. **The guards and the recreate, as one chain.** Each step runs only if the
   one before it succeeded:

   ```sh
   ssh root@204.168.164.31 '
     test "$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
            -H "Host: finance.test.selfstudio.se" http://127.0.0.1:5192/login)" = 200 &&
     docker run --rm -v /opt/selfops/Caddyfile.edge:/etc/caddy/Caddyfile:ro caddy:2-alpine \
       caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile &&
     cd /opt/selfops &&
     docker compose -p selfops-edge -f docker-compose.edge.yml up -d --force-recreate
   '
   ```

   - the port answers: Money's `/login`, asked under the stand's public name,
     is `200` (for the prod hotfix: `finance.selfstudio.se` and port `5191`);
   - `caddy validate` reads once more, now **the real file** the proxy is
     about to load;
   - only then is the proxy recreated.
6. **Afterwards every name is asked for a status line**:

   ```sh
   for h in time.selfstudio.dev ops.selfstudio.dev time.test.selfstudio.dev \
            ops.test.selfstudio.dev finance.selfstudio.se finance.test.selfstudio.se; do
     printf '%-28s ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "https://$h/login"
   done
   ```

   Six lines, six times `200` (expected from reading the two repositories; not
   observed). A name that is new to the proxy may fail for some seconds while
   Caddy obtains its certificate; it keeps trying on its own. For a Money
   name, one more line tells whose answer it is: `https://<name>/` without a
   session is `302` from Money, where the platform answered `200`.
7. **Going back** is a reverting hotfix and the same procedure: one more blink.

### Hotfix 1 — the test name

**[owner's word]** — given on 7 October 2026: open the test stand to the
outside as soon as it is ready.

Adds the `finance.test.selfstudio.se` block pointing at `127.0.0.1:5192`; the
header's count of names and ports becomes six names and three ports; the
sentence that says the finance name has no test twin is replaced. The
platform's `docs/deploy.md` gets the matching row.

State on 7 October, evening: the change is written as the platform's branch
`hotfix/money-test-name`, and its file was validated on the server with the
image the edge runs (`caddy:2-alpine`, Caddy 2.11.4). What followed — its
release as the platform's next patch tag, the pull, the recreate, the six
status lines — is recorded in `docs/handoff.md` when it has happened.

Needs: the DNS record (exists since 7 October), and Money's test stack
answering on 5192 (setup steps 1–5 above).

### Hotfix 2 — the prod name, which is the cut-over

Not written yet. In the `finance.selfstudio.se` block the rewrite of the root
to `/money/index.html` goes, the port becomes `127.0.0.1:5191`, `request_body`
and `encode` are added, and the comment is rewritten: Money is a product of
its own, and the block is there only because one Caddy owns 80 and 443. Six
names, four ports.

Needs: everything in the cut-over plan up to that step. From the second the
proxy is recreated, the name is Money's. The certificate is the one the proxy
already holds: the block keeps its name.

**Until the platform's removal release, the platform ships nothing from its
`develop` except these two hotfixes.** Its `develop` carries an unreleased
page and the migration `0060`; a release from it would put both on prod. An
urgent platform fix in that time goes as its own hotfix off `main`.

## The cut-over plan

**Real statements are loaded on the platform's prod**, so there is something
to move, and it moves **before** the name does. New prod is never emptier than
old prod.

| # | Step | Who | State / reversible |
|---|---|---|---|
| 1 | Server probes | **[session]** | done 7 Oct; read-only |
| 2 | Money repository: `develop` from `main`, default on GitHub; tag `0.1.0` | **[session]** | done 7 Oct |
| 3 | Cloudflare: record `finance.test` → `204.168.164.31`, "DNS only" | **[Mika]** | done 7 Oct |
| 4 | The hosted service on `feature/hosted-service`; merged into `develop` | **[session]**; the merge after the owner's look at the test stand | built and verified 7 Oct; **not merged** |
| 5 | The hand-over of `index.html`, `scripts/money-checks.mjs`, `scripts/money-demo.mjs`, whole; the page checks and the browser smoke green in CI | the page's session, then **[session]** | done 7 Oct (commit `b529a46`) |
| 6 | The test stand on the server, on `127.0.0.1:5192`, seeded, self-check and smoke passed | **[session]** — allowed on 7 Oct | key, checkout and data directory done; the first deploy under way |
| 7 | Edge hotfix 1: the test name | session prepares; **[owner's word]** — given 7 Oct | written and validated; yes: a reverting hotfix |
| 8 | Invite on test; Mika sets a password and looks | **[Mika]** | — |
| 9 | The gates of "Before prod" (`docs/security.md`) | reviewer; **[Mika]** decides | — |
| 10 | Money release `1.0.0`; the prod stand on `127.0.0.1:5191`: empty, backed up, the restore rehearsed, not reachable by name | **[owner's word]** | yes |
| 11 | **Export.** The founders stop saving in Money. Mika saves the ledger from the platform's prod as one file on the Mac and notes its revision | **[Mika]** | read-only |
| 12 | **The floor, then the import** into Money's prod, over ssh, from standard input | **[Mika]** — the import command is **not built yet** | yes: `ctl restore`, or import again |
| 13 | Counts only: Money's prod holds the ledger that was exported; a backup of it is rehearsed; the platform's revision has not moved | **[session]**, **[Mika]** | read-only |
| 14 | Edge hotfix 2: the name moves. Every founder closes or reloads every Money tab | session prepares; **[owner's word]** | yes, until step 19 |
| 15 | Invites for `mika`, `misha`, `vanya`; each founder chooses a password | **[Mika]** | yes |
| 16 | From outside: `401` without a session, the headers, HSTS; Mika's own look | **[session]**, **[Mika]** | read-only |
| 17 | Platform `develop`: Money leaves the code | **[session]** | yes |
| 18 | The platform's test stand stops serving `/money/` | **[session]**, ordinary cycle | yes |
| 19 | Platform release without Money | **[owner's word]** | yes: no data is touched |
| 20 | Not before 30 days after step 14: the Money tables are dropped on the platform's prod by hand | **[Mika]**, **[owner's word]** | **no** |
| 21 | A platform release with the drop migration, a no-op on prod | **[owner's word]** | — |

### Step 11 — the export

**[Mika]**. The platform's prod has one Money document, the ledger: release
`0.18.0` has no cash-plan door, so there is nothing else to take. The cash plan
is not on the platform's prod at all.

- From this moment until step 14 the founders leave Money alone. A save into
  the platform after the export would stay behind; step 13 looks for one.
- Signed in at `https://finance.selfstudio.se`, Mika opens
  `https://finance.selfstudio.se/api/founder/money` and saves what the browser
  shows as a file. It is one JSON object, `{"rev":…,"doc":{…},"updatedAt":…}`,
  and it is the whole ledger.
- **The revision in its first bytes is written down.** It is a count of saves,
  not a figure from the ledger, and it is used three more times: as the floor
  in step 12, in the check of step 13 and in the guard of step 20. One line
  prints it and nothing else of the file:

  ```sh
  head -c 40 <the exported file> | grep -o '^{"rev":[0-9]*'
  ```

  If it prints nothing, the browser saved something other than the answer as
  it came; save it again.
- The file is kept on the Mac in a folder outside every repository. It is not
  sent through a chat, not attached anywhere, and not copied to the server's
  disk.

### Step 12 — the floor, then the import

**[Mika]**.

**First the floor.** A page that was open on the platform's Money holds the
platform's revision, and from the moment its founder signs in to Money in the
same browser it carries a valid Money cookie. If Money's count began at 1, it
would climb through that number, and the old tab's next save would be accepted
— writing the ledger as it was before the export over everything saved in
Money since. So before anything is imported, Money's ledger is told to stay
above the platform's revision `N`:

```sh
ssh root@204.168.164.31 /opt/money/deploy/stand.sh prod ctl floor ledger <N>
```

It changes no document: the stand still counts as empty, `ctl doctor` shows
the floor, and the first save — the import — becomes revision `N + 1`. From
then on the old tab can only be answered `409` and told to reload. (The plan
needs no floor: the platform's prod has no cash plan, so no tab holds a
revision of one.)

**Then the import.** The shape of the step:

```sh
# NOT BUILT YET. The command that reads a document on standard input on prod
# does not exist: `ctl seed` is for test and dev only and refuses on prod.
ssh root@204.168.164.31 <the import command> prod ledger < <the exported file>
```

What the command has to do, when it is built: read one document from standard
input; accept both a bare document and a saved `{rev, doc, updatedAt}` answer;
write it through the stand's own save door, so that every check of a normal
save applies and the floor is honoured; refuse when the stand already holds a
ledger, unless told otherwise; print the new revision, the row count and the
size, never contents; and leave a line in the security log.

Because the file arrives on standard input over ssh, it never lands on the
server's disk. The platform's own snapshots are not carried over. The dump
kept in step 20 is their archive.

The real ledger and plan on Mika's Mac are a separate matter and not part of
the cut-over. If and when they go to hosted prod is Mika's decision; the way in
is the page (Настройки → «Загрузить данные из файла») for the ledger and
`/data` for a plan.

### Step 13 — counts, a rehearsed backup, and the platform's revision

Three checks, all of counts and none of contents:

1. `stand.sh prod ctl doctor` — **[session]** — shows one ledger at revision
   `N + 1` of the size that was exported.
2. `money-backup`, then `money-restore --rehearse` on that tarball —
   **[session]** — and the counts its `ctl verify` prints (revision, rows,
   size, snapshots, accounts) are the ones `ctl doctor` shows on the live
   stand. This is the first backup that holds a real ledger, and the first
   time a restore of one is proved.
3. **Right before step 14**, Mika reloads
   `https://finance.selfstudio.se/api/founder/money` on the platform — **[Mika]**
   — and its `rev` must still be `N`. If it is higher, somebody saved into
   the platform after the export: export again, raise the floor to the new
   number, import again.

### Step 14 and after

At the moment the name moves, **every founder closes or reloads every Money
tab**.

- A page that was open on the platform's Money keeps the platform's cookie.
  Its next save is answered `401` by Money and the page says «вход
  закончился». That holds only until its founder signs in to Money in the same
  browser; after that only the revision stops the old page, which is what the
  floor of step 12 is for: its save is answered `409`.
- The platform's old page still answers at
  `ops.selfstudio.dev/money/index.html` until step 19. No menu links to it. A
  founder who saved there would write into the platform's database; the dry
  run in step 20 catches that.
- **Going back** is possible until step 19: the platform still holds the page,
  the doors and the ledger as it was exported. First download both documents
  from Money's `/data` — what was saved in Money since the cut-over exists
  nowhere else. Then a reverting edge hotfix returns the name, and the ledger
  file — a bare document — goes back in through the platform page's own
  «Загрузить данные из файла». The platform's prod cannot take a cash plan
  back; that file stays on the Mac. This path has not been rehearsed, and
  whether the platform's `0.18.0` page opens a ledger that Money's page has
  saved has not been checked.

## Removing Money from the platform

In the platform repository, under its rules. Line numbers are deliberately not
given here: they were read at `a4f51bb` and the platform has moved since.

### Step 17 — the code leaves, on `develop`

**[session]**, branch `feature/money-leaves`. Removal goes through `develop`
and not as a hotfix, because the tests that hold the platform's contract to its
route table exist only on `develop`.

- Deleted: the page and its vendor files (`apps/web/public/money/`), the route
  file `apps/api/src/routes/founder/money.ts` and its registration in
  `apps/api/src/server.ts`, `apps/api/test/money.test.ts`,
  `scripts/money-checks.mjs`, `scripts/money-demo.mjs`.
- Edited: the Money refusal codes in `apps/api/src/lib/refusals.ts` together
  with their lines in `apps/web/src/i18n/serverErrors.ts`; the finance-host
  branch in `apps/web/src/landing.ts` together with `apps/web/src/LoginPage.tsx`
  in one commit (the web image type-checks at build); the allow-word in
  `scripts/i18n-guard.mjs`; a comment in `apps/api/src/lib/personTraces.ts`.
- Documents: the Money rows, the route count and the two Money sections of
  `API-CONTRACT.md`; the Money row of `docs/deploy.md`; the Money chapter of
  `docs/handoff.md` becomes a dated pointer to this repository, where its
  substance now lives.
- **Migrations: `0060_money_cash.sql` is deleted, `0059_money_state.sql` is
  left untouched, and no drop is added.** `0060` was never applied on prod. The
  platform's migration runner walks the files on disk: a deleted file is not
  noticed, an edited one stops the boot. So this release deletes no data
  anywhere, and prod never grows the two cash tables only to have them dropped.
  Test and local databases keep the two tables and an orphan row in
  `_migrations`, which the runner ignores.

### Steps 18 and 19 — test, then the release

`selfops-deploy-test` **[session]**; then the platform release
**[owner's word]**. From then on the platform neither contains nor serves
Money. The same release ships the platform commits that have been waiting on
its `develop` — 14 when they were counted on 7 October, four of them product
fixes.

Until step 20 the platform's procedure "put a prod dump on test" must not be
used: the dump would carry the Money tables, with real statements in them, to
the platform's test stand. The platform's handoff gets that rule in step 17.

### Step 20 — the tables are dropped by hand

**[Mika]**, **[owner's word]**, **irreversible**. Not before 30 days after the
cut-over, and only after Mika has seen the data in Money. The platform's prod
database is closed to sessions; a session prepares each line and Mika runs it.

On the platform's prod two of the four Money tables exist — `money_state` and
`money_snapshots`. `money_cash` and `money_cash_snapshots` exist only where
`0060` ran (the platform's test and local databases).

The platform's rule for any deletion on prod is three steps, in this order
(its `CLAUDE.md`, written after 23 September). The SQL below is a draft: it has
never been run and is re-read against the schema on the day.

1. **A dump, kept** until the result has been looked at. Not the nightly file
   that rotates away in 14 days: one set aside.
2. **A dry run** that prints what would go — four values, no contents:

   ```sql
   SELECT rev,
          jsonb_array_length(coalesce(doc->'tx', '[]'::jsonb)) AS rows,
          updated_at,
          (SELECT count(*) FROM money_snapshots) AS snapshots
     FROM money_state WHERE id = 1;
   ```

   **`rev` must equal the revision of the file exported in step 11.** If it is
   higher, somebody saved into the platform after the export — in the hours
   before the name moved, or later through the old page left at
   `ops.selfstudio.dev/money/index.html`: **stop and reconcile** before
   anything is dropped. (Comparing `updated_at` with the time of the cut-over
   would miss a save made between the export and the cut-over.)
3. **One guarded transaction**, with two numbers typed in: `<REV>` is the
   exported file's revision, which the dry run has just confirmed, and
   `<ROWS>` the dry run's row count. It refuses to start unless what is being
   **kept** was found — a deletion written as "everything except X" destroys
   everything the moment X is misspelt — and unless the ledger is exactly the
   one that was exported:

   ```sql
   BEGIN;
   DO $$
   DECLARE r int; n int;
   BEGIN
     IF to_regclass('public.people') IS NULL OR to_regclass('public.time_entries') IS NULL THEN
       RAISE EXCEPTION 'not the platform database - nothing dropped';
     END IF;
     SELECT rev, jsonb_array_length(coalesce(doc->'tx', '[]'::jsonb)) INTO r, n
       FROM money_state WHERE id = 1;
     IF r IS DISTINCT FROM <REV> OR n IS DISTINCT FROM <ROWS> THEN
       RAISE EXCEPTION 'the ledger is not the one that was exported (rev %, rows %)', r, n;
     END IF;
   END $$;
   DROP TABLE IF EXISTS money_cash_snapshots, money_cash, money_snapshots, money_state;
   COMMIT;
   ```

For 14 days after the drop the platform's nightly dumps still hold the tables;
after that only the dump set aside in step 1 does.

### Step 21 — the migration that is a no-op on prod

Only now does a platform release carry `0061_drop_money_tool.sql`:

```sql
DROP TABLE IF EXISTS money_cash_snapshots, money_cash, money_snapshots, money_state;
```

On prod the tables are already gone, so it does nothing there. It cleans the
test, local and restored databases. A drop migration runs by itself at every
API start, which is exactly why it must not be the thing that deletes prod's
data: it would leave no room for the dump, the dry run and the guard.

## Not built, not verified

Not built:

- **The prod import command** (step 12). `ctl floor`, which it needs first,
  exists.
- **Edge hotfix 2**, the block that moves the prod name.
- **Request buffering at the edge.** Until it is there, a founder's upload has
  to meet the body deadline (see "The edge").
- **An off-host copy of the backups**: not decided, not set up.
- A cap on how far ahead a prod policy override may be dated; a longer reach
  of the request log within one container's life. Both wait for the owner
  (`docs/handoff.md`).

Run so far, and against what:

- The Python tests of the service and of the laptop tool: on the Mac (Python
  3.9, no `hashlib.scrypt`) and in CI on 3.9 and 3.13.
- `deploy/stand.sh` and every command in `deploy/bin`: under `dash` in a
  sandbox against stand-ins for `docker`, `git`, `flock`, `systemctl` and a
  few more, in which `ctl` inside a "container" is the real one of the
  checkout (`python3 -B checks/test_deploy.py`). That proves the order of the
  steps, the refusals, the handling of signals and what a restore does to real
  store and auth files. It does not prove that the docker commands are spelled
  as Docker takes them.
- CI's `image` job runs the same commands on a runner with a real Docker: two
  deploys of the test stand with the kept log, the reseed, a prod deploy, the
  refusals of the policy settings, a backup, the rehearsal, and two restores —
  one that keeps the accounts, one that retires the links and raises the
  floor by a million. It was green before the fix round; **on the fixed
  scripts it has not been observed yet.** Read it before anything of this
  round reaches the server.
- On the server: setup steps 1–3 of the test stand, and the validation of the
  hotfix's Caddyfile. The first deploy of the test stand was under way when
  this was written — from the work branch as it was pushed then, which did
  **not** yet hold this round's fixes.

Not verified anywhere:

- Linux with real Docker for the fixed scripts (`--force-recreate`,
  `--network none`, the `docker inspect` formats, `docker logs` after a stop),
  `shellcheck` on them, GNU `tar` — CI's part, as above.
- How long a deploy keeps Money at `502` on the server.
- Whether `selfops-deploy` after an edge-only hotfix restarts nothing: it is
  inferred, not observed.
- Whether a ledger saved by the platform's `0.18.0` page opens cleanly in the
  page this repository serves — it matters at step 12 — and the reverse, which
  matters for going back.
- Putting one document's directory back from a tarball by hand; the way back
  after the cut-over. Neither is rehearsed.
- Reloading the proxy without dropping names (`caddy reload`) exists in Caddy;
  it has not been tried on this setup and the procedure above does not rely on
  it.
- The page and Money's own pages in a browser other than CI's Chromium, and
  through the real edge (Caddy, HTTPS, HTTP/2, the `__Host-` cookie).
