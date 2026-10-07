# Deploying Money

Two stands on the studio's one server, **prod** and **test**, each a single
container behind the edge proxy that already stands there.

**State on 7 October 2026: nothing below has been run.** The server has been
looked at with read-only probes and nothing on it was changed. Neither stand
exists. `finance.selfstudio.se` is still answered by the platform. The commands
in `deploy/` are written, on `feature/hosted-service`, and this document was
read against them; the service's own command line (`ctl`) and its HTTP layer
were not built yet, so what is said about them is the build specification. A
step is real only once it has been run and `docs/handoff.md` says so.

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
| stand file | `deploy/stands/prod.env` | `deploy/stands/test.env` | — |
| updated by | `money-deploy` **[owner's word]** | `money-deploy-test` | — |
| holds | the studio's real money | a fabricated studio, reseeded nightly | whatever a test puts there |

One compose file, `deploy/compose.yml`, serves both server stands under an
explicit project name. `deploy/stand.sh <prod|test> <up|ctl ...|down|logs>`
wraps
`docker compose -p money-<stand> --env-file deploy/stands/<stand>.env -f deploy/compose.yml …`.

The container: `python:3.13-alpine`, a build that only copies files, user
10001, read-only root, all capabilities dropped, `no-new-privileges`, 256 MB,
one CPU, 64 pids, the port published on `127.0.0.1` only, a health check
(`python -m moneyd.ctl ping`) every 60 seconds.

**Settings, by name.** None is a secret, and the stand files are committed.

| Where it is set | Names |
|---|---|
| the stand file | `MONEY_STAND`, `MONEY_PUBLIC_URL`, `MONEY_FOUNDERS`, `MONEY_PORT`, `MONEY_DATA_HOST_DIR`; optionally `MONEY_CSP`, `MONEY_CSP_OVERRIDE_UNTIL` |
| fixed by the compose file | `MONEY_DATA_DIR` (`/data`), `MONEY_BIND`, `MONEY_TRUSTED_PROXIES`, `TZ` (`UTC`) |
| set by the build | `MONEY_VERSION`, `MONEY_WEB_DIR` |
| dev only | `MONEY_KDF` |

**The data directory** of a stand, as the container sees it at `/data`:

```
STAND                                         the stand's name; a mismatch with MONEY_STAND stops the boot
ledger/current.json                           {"rev":N,"doc":…,"updatedAt":"…Z"} — the GET answer as stored
ledger/EVER_SAVED                             written by the first accepted save
ledger/snapshots/day-YYYY-MM-DD-revNNNNNN.json.gz
ledger/snapshots/shrink-<utc>-revNNNNNN.json.gz
ledger/snapshots/restore-<utc>-revNNNNNN.json.gz
plan/…                                        the same, for the cash plan
auth/users.json                               logins, first names, password hashes, one-time links (hashed)
auth/sessions.json                            sha256 of each session token
security.log                                  sign-ins, links, restores, seeds, boots
```

It is a bind mount of a host directory, not a named volume, so
`docker compose down -v` and `docker volume prune` cannot delete it, and backup
and hand restore are plain file work. Kept per document: the newest 90 `day-`
copies and the newest 50 `shrink-` copies; `restore-` copies stay until
somebody removes them. On test, everything older than two days is purged every
night.

## The server as it was found (7 October 2026, read-only)

One machine, `204.168.164.31`: Ubuntu 24.04, Docker 29.8, Compose v5.5, 2 vCPU,
3,814 MB of memory (2,494 MB available at the time), 58 GB of disk free.

- Three compose projects run there, all the platform's: `selfops-edge` (Caddy
  on the host network; owns ports 80 and 443), `selfops-prod` (web on
  `127.0.0.1:5173`) and `selfops-test` (web on `127.0.0.1:5174`). Nine
  containers, about 570 MB together, none with a memory limit.
- Listening: 80, 443, 22, and on loopback 2019, 5173, 5174. Loopback ports from
  5175 up are free, so 5191 and 5192 are.
- `/opt` holds `selfops` (prod, `main`), `selfops-dev` (test, `develop`) and
  `containerd`. Nothing of Money's.
- GitHub: `/root/.ssh` holds one key pair, a deploy key of `mkodzya/selfops`
  alone. There is no `/root/.ssh/config`. So Money needs a key of its own.
- The platform's two deploy commands exist only on the server
  (`/usr/local/bin/selfops-deploy`, `selfops-deploy-test`). Money's commands
  are kept in this repository and only symlinked there.
- The platform's nightly backup covers the platform's prod database only.

## One-time setup: the test stand

**[session]** — Mika allowed this on 7 October 2026: the session may create
Money's test stand on the server itself. It needs `develop` to hold the hosted
service first, so it comes after `feature/hosted-service` is merged.

All commands run as root on the server (`ssh root@204.168.164.31`).

**0. Look before touching.** Read-only; stop if available memory is under
700 MB (a deploy refuses below that anyway).

```sh
free -m; df -h /; docker compose ls; docker compose version
ss -ltnp; docker stats --no-stream; docker system df
ls /opt /var/lib/money 2>/dev/null
```

**1. A deploy key and a host alias.** The private half never leaves the server
and is never printed. Only the `.pub` line is shown.

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

**2. The checkout.**

```sh
git clone -b develop git@github-money:mkodzya/selfstudio-money.git /opt/money-dev
```

Root's usual umask (022) is assumed. The image copies the files with the modes
they have in the checkout, and the container's user has to be able to read
them: a checkout made under a umask of 077 builds an image that cannot start.

**3. The data directory.** Owned by the container's user, closed to everybody
else. The service does not create it and refuses to start without it.

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
and the smoke, and — because the stand is empty — seeds it with the fabricated
studio. It ends with one verdict line.

**6. The nightly reseed.**

```sh
ln -sf /opt/money-dev/deploy/systemd/money-test-reseed.service \
       /opt/money-dev/deploy/systemd/money-test-reseed.timer \
       /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now money-test-reseed.timer
systemctl list-timers money-test-reseed --no-pager
```

**7. The name.** The stand now answers on its loopback port and nowhere else.
It gets its public name only through the edge — see "The edge", hotfix 1,
**[owner's word]**.

**8. The first sign-in.** **[Mika]**

```sh
ssh -t root@204.168.164.31 money-user test invite mika
```

Mika opens the printed link, chooses a password, and looks at
`https://finance.test.selfstudio.se`.

## One-time setup: the prod stand

**[owner's word]** for all of it. The gates of "Before prod" in
`docs/security.md` come first: the review has passed, and the owner has decided
on the off-host copy and on the second factor.

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

## Day to day

### Test

```sh
# on the Mac, in the development clone
git checkout develop && git merge --no-ff feature/<topic> && git push
ssh root@204.168.164.31 money-deploy-test
```

`money-deploy-test`, in this order: takes the deploy lock; refuses when memory
is short or another image build is running; pulls `develop` fast-forward only
(and warns when the checkout is on anything else); hands over to
`deploy/stand.sh test up`; then seeds **only when the stand is empty**
(`ctl empty`). `money-deploy-test --reseed` returns the stand to the fabricated
studio on purpose — after the generator changed, for instance. A plain deploy
does not throw away what somebody is looking at; the night does.

While `scripts/money-demo.mjs` is not in the checkout the deploy still
succeeds: it prints a warning and skips the seeding.

Its last line is the verdict: `money-test: OK - …` or `money-test: FAILED - …`.

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
2. refuses when less than 700 MB of memory is available or another image build
   is running — before anything has been touched. The machine also serves the
   platform's prod;
3. takes a backup (`money-backup`). A deploy that cannot back up does not go
   on;
4. moves the checkout: `main`, fast-forward only — a deploy that has to merge
   is a deploy nobody reviewed — or the tag that was named;
5. says which release that is, with a `WARNING` line when the commit carries no
   release tag;
6. hands over to `deploy/stand.sh prod up`.

It never seeds.

### What `stand.sh <stand> up` does

Both deploy commands end here.

1. Keeps the image the stand runs now as `money-<stand>:previous`.
2. Builds `money-<stand>:<version>` on the newest patch of the base image. The
   version is `git describe` of the checkout; `/api/me` and `ctl selfcheck`
   report it.
3. `up -d --wait`: the new container has to report healthy within 120 seconds.
4. `ctl selfcheck`, inside the container: the sign-in page, the page
   byte for byte, a vendor file, `/api/me`, both documents readable, and a save
   with a far-future `base` that must be refused with `409` — the whole write
   path, with nothing written. It also prints the policy mode and the image's
   age.
5. `money-smoke <stand>`, on the host, through the loopback port, with the
   headers the edge would send: `/login` is `200` and carries its policy; `/`
   without a session is sent to `/login`; a path under `/api/` without a
   session answers `401` as JSON, never HTML and never a redirect; a `POST`
   from a foreign `Origin` is `403`; `text/plain` is `415`; one byte over the
   limit is `413`; `/server.py`, `/.git/config` and
   `/data/ledger/current.json` are not served; a foreign `Host` is `421`.
   Nobody signs in and nothing is written.
6. Removes the stand's older images: the running one and `previous` stay.
7. Prints one verdict line, the last line of its output:
   `money-<stand>: OK - …` or `money-<stand>: FAILED - …`.

When it goes wrong:

- **the image does not build** — nothing was changed; the stand runs what it
  ran before;
- **the new container does not report healthy, or fails its self-check** — the
  previous image is started again and the exit status is not zero. On a first
  deploy there is no previous image; the stand is stopped;
- **the smoke fails** — the new version stays up, the verdict says `FAILED`
  and the exit status is not zero. Read the lines above it, then fix forward or
  deploy the earlier version.

A stand is started only from its own checkout — prod from `/opt/money`, test
from `/opt/money-dev`; `up` refuses anywhere else, so the wrong branch cannot
be put on a stand. `ctl`, `logs` and `down` only talk to a running container
and work from either checkout. `down` on prod asks for the stand's name to be
typed.

A deploy is a restart: Money answers `502` for a few seconds. Nobody is signed
out. A save in flight at that moment is lost unless the founder changes
something again.

### Rollback

```sh
ssh root@204.168.164.31 money-deploy 1.0.0      # [owner's word]
```

With a tag, `money-deploy` checks that tag out and deploys it. That is the
rollback. The next plain `money-deploy` goes back to `main`. A rollback changes
the code, not the data: to take data back, see "Backup and restore".

### If a handed-over page breaks under the policy

The page is rewritten elsewhere and arrives whole, and its content security
policy is enforced here. If a new page stops working because of the policy,
the policy can be sent as report-only for one deploy, which reports and does
not block:

```sh
ssh root@204.168.164.31 MONEY_CSP=report-only money-deploy-test
```

There is no "off". On prod the same needs a day on which it ends, and the
owner's word:

```sh
ssh root@204.168.164.31 MONEY_CSP=report-only MONEY_CSP_OVERRIDE_UNTIL=<YYYY-MM-DD> money-deploy
```

The deploy says so in a `NOTE` line, `ctl selfcheck` prints the mode, and the
smoke adds a `WARNING`. The next deploy without these variables enforces again;
on prod the override also runs out by itself the day after the named date. The
fix is in the page or in the policy, not in leaving this on.

### Accounts and sessions

```sh
ssh -t root@204.168.164.31 money-user <stand> invite <login>     # [Mika] — never a session
ssh root@204.168.164.31 money-user <stand> list                  # who may sign in, who has a password
ssh root@204.168.164.31 money-user <stand> disable <login>       # stops working at the next request
ssh root@204.168.164.31 money-user <stand> enable <login>
ssh root@204.168.164.31 money-user <stand> sessions              # counts and dates, never tokens
ssh root@204.168.164.31 money-user <stand> logout <login>
ssh root@204.168.164.31 money-user <stand> logout --all
```

`invite` needs a terminal on both ends (`ssh -t`). Without one it refuses
before anything changes: the link would be issued and shown to nobody, and
issuing a link retires the one before it.

Everything else of `ctl` goes through the stand wrapper:

```sh
/opt/money/deploy/stand.sh prod ctl doctor       # what is wrong, and which snapshot is newest
/opt/money/deploy/stand.sh prod ctl selfcheck
/opt/money/deploy/stand.sh prod logs             # add -f to follow
```

For test the same with `/opt/money-dev/deploy/stand.sh test …`.

## The test stand's data

- Only the fabricated studio, from the frozen generator, which runs unchanged
  in a throwaway container with no network:

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
  London, which is how the page reckons "today".
- `ctl seed` exists only on `test` and `dev`. On `prod` it refuses and exits
  with 2.
- `money-test-reseed.timer`, every night at 00:10 UTC, runs `money-seed-test`:
  the reseed, then `ctl purge-snapshots --older-than-days 2`. Anything typed
  or uploaded on test lives a day at most. Accounts and passwords survive. A
  deploy in progress is waited for, up to five minutes, not raced. A night
  that fails leaves the stand as it was:
  `journalctl -u money-test-reseed -n 30 --no-pager`.
- `/data` on test draws no upload control.

## Backup and restore

### What is backed up

Prod only. `money-backup`, from `money-backup.timer` every night at 03:40
Asia/Yerevan (ten minutes after the platform's own) and before every prod
deploy:

- a tarball of `/var/lib/money/prod` — both documents, their snapshots,
  `users.json`, the security log — without `auth/sessions.json` and without
  temporary files;
- written as a `.part` file, checked (`gzip -t`, `tar -tzf`), then renamed to
  `/var/backups/money/money-prod-<utc>.tar.gz`; mode 600 in a directory of
  mode 700;
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
/opt/money/deploy/stand.sh prod ctl snapshots ledger           # lists names, revisions, sizes
/opt/money/deploy/stand.sh prod ctl restore ledger <snapshot>  # asks to type the stand's name
```

`restore` copies the current state aside as a `restore-…` snapshot and writes
the chosen one as a new revision, one above the highest the document ever had.
Every open page therefore gets `409` and reloads instead of saving its old
copy over the restore. There is no HTTP door to this. It needs a terminal
(`ssh -t`), because it asks a question.

When a document answers `503 storage_damaged`, `ctl doctor` names the newest
snapshot to restore, and `restore` is the one write a damaged document takes:
the damaged file is moved aside as `current.json.damaged-<utc>`, not deleted.

`current.json` is never edited by hand. It has one exact layout, the one a
save writes; a file that was reformatted, cut short or replaced by a bare
document is treated as damaged.

### A whole stand back from a tarball

For a lost or damaged data directory. **[owner's word]**.

```sh
ssh -t root@204.168.164.31 money-restore /var/backups/money/money-prod-<utc>.tar.gz
```

It replaces the stand's data directory, in this order:

1. the tarball is read whole and must carry prod's own `STAND` marker;
2. the stand's name has to be typed;
3. the container is stopped;
4. the directory as it stands is moved aside, never deleted:
   `/var/lib/money/prod.before-restore-<utc>`;
5. the tarball is unpacked into a new, empty directory owned by 10001;
6. the container is started and has to pass `ctl selfcheck`;
7. if it does not, the directory that was moved aside is put back, and the one
   that failed is kept beside it as `prod.failed-restore-<utc>`.

The tarball has no sessions in it, so after a restore every founder signs in
again; accounts and passwords come back as they were when the backup was
taken. The directory that was moved aside is removed by hand, once somebody
has looked.

### The rehearsal

```sh
money-restore --rehearse /var/backups/money/money-prod-<utc>.tar.gz
```

Unpacks the tarball into a scratch directory, starts a throwaway container on
it — the stand's own image, no published port — runs `ctl verify` (revisions,
row counts and sizes, never contents) and `ctl selfcheck` inside, and removes
the container and the directory. Prod is not touched. It is run on the day prod
is set up and is a gate before the real ledger is loaded (`docs/security.md`,
"Before prod").

A prod tarball is never restored into the test stand; `money-restore` cannot
do it.

### What the backups do not cover

They sit on the same disk as the data, unencrypted, and contain the ledger and
the password hashes. That is enough for an emptied document and not for a dead
disk or a lost machine. **Nothing is off the host.** Where an off-host copy
lives is the owner's decision and a gate before prod. Until then the manual
copy is «Скачать» on `/data`.

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
- **A file that does not parse takes every name away until it is fixed** by
  another commit on `main`.

Hence two rules for the blocks — a name goes in only once it exists in DNS, and
a block points only at a port where something already answers — and the guards
below.

The reference copy of the two blocks is `deploy/edge/Caddyfile.money`; CI runs
`caddy validate` on it. Each block has this shape (if this excerpt and that
file differ, the file wins):

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
  400 KB page and a ledger of megabytes for a phone.
- **Buffering options** (so that short bodies are received whole by Caddy
  before Python sees them) are not in the blocks. They are added only after
  `caddy validate` accepts them on the server's Caddy version.
- Validating the reference copy in CI does not test the file the proxy reads.
  The guard below does.

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
   pushed; merged into `develop` as well. Both files are identical on the
   platform's `main` and `develop` (checked on 7 October at `a4f51bb`), so the
   merge back is clean. This is the platform's first hotfix branch.
3. **The pull**: `ssh root@204.168.164.31 selfops-deploy`. No platform image
   copies either file, so nothing should be rebuilt or restarted (inferred from
   the Dockerfiles; not run).
4. **The guards and the recreate, as one chain.** Each step runs only if the
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
   - `caddy validate` reads **the real file** the proxy is about to load, in a
     throwaway container;
   - only then is the proxy recreated.
5. **Afterwards every name is asked for a status line**:

   ```sh
   for h in time.selfstudio.dev ops.selfstudio.dev time.test.selfstudio.dev \
            ops.test.selfstudio.dev finance.selfstudio.se finance.test.selfstudio.se; do
     printf '%-28s ' "$h"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "https://$h/login"
   done
   ```

   Six lines, six times `200` (expected from reading the two repositories; not
   run). A name that is new to the proxy may fail for some seconds while Caddy
   obtains its certificate; it keeps trying on its own. For a Money name, one
   more line tells whose answer it is: `https://<name>/` without a session is
   `302` from Money, where the platform answered `200`.
6. **Going back** is a reverting hotfix and the same chain: one more blink.

### Hotfix 1 — the test name

Branch `hotfix/money-edge-test`, the next patch tag (`0.18.1` if nothing else
has shipped). Adds the `finance.test.selfstudio.se` block pointing at
`127.0.0.1:5192`; the header's count of names and ports becomes six names and
three ports; the sentence that says the finance name has no test twin is
replaced. `docs/deploy.md` of the platform gets the matching row.

Needs: the DNS record (exists since 7 October), and Money's test stack
answering on 5192 (setup steps 1–6 above).

### Hotfix 2 — the prod name, which is the cut-over

Branch `hotfix/money-edge-prod`, the patch tag after that (`0.18.2`). In the
`finance.selfstudio.se` block the rewrite of the root to `/money/index.html`
goes, the port becomes `127.0.0.1:5191`, `request_body` and `encode` are
added, and the comment is rewritten: Money is a product of its own, and the
block is there only because one Caddy owns 80 and 443. Six names, four ports.

Needs: everything in the cut-over plan up to that step. From the second the
proxy is recreated, the name is Money's. The certificate is the one the proxy
already holds: the block keeps its name.

**Until the platform's removal release, the platform ships nothing from its
`develop` except these two hotfixes.** Its `develop` carries the unreleased
page and the migration `0060`; a release from it would put both on prod. An
urgent platform fix in that time goes as its own hotfix off `main`.

## The cut-over plan

Design section 6, as amended on 7 October: **real statements are loaded on the
platform's prod**, so there is something to move, and it moves **before** the
name does. New prod is never emptier than old prod.

| # | Step | Who | Reversible |
|---|---|---|---|
| 1 | Server probes | **[session]** — done 7 Oct | read-only |
| 2 | Money repository: `develop` from `main`, default on GitHub; tag `0.1.0` | **[session]** — done 7 Oct | yes |
| 3 | Cloudflare: record `finance.test` → `204.168.164.31`, "DNS only" | **[Mika]** — done 7 Oct | yes |
| 4 | Build the hosted service on `feature/hosted-service`; merge into `develop` | **[session]** — in progress | yes |
| 5 | The hand-over of `index.html`, `scripts/money-checks.mjs`, `scripts/money-demo.mjs`, whole; the page checks and the browser smoke green in CI | the page's session, then **[session]** | yes |
| 6 | The test stand on the server, on `127.0.0.1:5192`, seeded, self-check and smoke passed | **[session]** — allowed on 7 Oct | yes |
| 7 | Edge hotfix 1: the test name | session prepares; **[owner's word]** | yes: a reverting hotfix |
| 8 | Invite on test; Mika sets a password and looks | **[Mika]** | — |
| 9 | The gates of "Before prod": the review has passed; the off-host copy and the second factor are decided | reviewer; **[Mika]** decides | — |
| 10 | Money release `1.0.0`; the prod stand on `127.0.0.1:5191`: empty, backed up, the restore rehearsed, not reachable by name | **[owner's word]** | yes |
| 11 | **Export.** The founders stop saving in Money. Mika saves the ledger from the platform's prod as one file on the Mac | **[Mika]** | read-only |
| 12 | **Import** into Money's prod, over ssh, from standard input | **[Mika]** — the command is **not built yet** | yes: `ctl restore`, or import again |
| 13 | Counts only: Money's prod holds one ledger of the size that was exported | **[session]** | read-only |
| 14 | Edge hotfix 2: the name moves | session prepares; **[owner's word]** | yes, until step 19 |
| 15 | Invites for `mika`, `misha`, `vanya`; each founder chooses a password | **[Mika]** | yes |
| 16 | From outside: `401` without a session, the headers, HSTS; Mika's own look | **[session]**, **[Mika]** | read-only |
| 17 | Platform `develop`: Money leaves the code | **[session]** | yes |
| 18 | The platform's test stand stops serving `/money/` | **[session]**, ordinary cycle | yes |
| 19 | Platform release without Money | **[owner's word]** | yes: no data is touched |
| 20 | Not before 30 days after step 14: the Money tables are dropped on the platform's prod by hand | **[Mika]**, **[owner's word]** | **no** |
| 21 | A platform release with the drop migration, a no-op on prod | **[owner's word]** | — |

Steps 5 and 6–8 do not wait for each other: the test stand can be created
before the hand-over, and is redeployed after it.

### Step 11 — the export

**[Mika]**. The platform's prod has one Money document, the ledger: release
`0.18.0` has no cash-plan door, so there is nothing else to take. The cash plan
is not on the platform's prod at all.

- From this moment until step 14 the founders leave Money alone. A save into
  the platform after the export would stay behind.
- Signed in at `https://finance.selfstudio.se`, Mika opens
  `https://finance.selfstudio.se/api/founder/money` and saves what the browser
  shows as a file. It is one JSON object, `{"rev":…,"doc":{…},"updatedAt":…}`,
  and it is the whole ledger.
- The file is kept on the Mac in a folder outside every repository. It is not
  sent through a chat, not attached anywhere, and not copied to the server's
  disk.

### Step 12 — the import

**[Mika]**. The shape of the step:

```sh
# NOT BUILT YET. The command that reads a document on standard input on prod
# does not exist: `ctl seed` is for test and dev only and refuses on prod.
ssh root@204.168.164.31 <the import command> prod ledger < <the exported file>
```

What the command has to do, when it is built: read one document from standard
input; accept both a bare document and a saved `{rev, doc, updatedAt}` answer;
write it through the stand's own save door, so that every check of a normal
save applies; refuse when the stand already holds a ledger, unless told
otherwise; print the new revision, the row count and the size, never contents;
and leave a line in the security log.

Because the file arrives on standard input over ssh, it never lands on the
server's disk. Money's revision count starts anew: the platform's `rev` is not
carried over.

The platform's own snapshots are not carried either. The dump kept in step 20
is their archive.

The real ledger and plan on Mika's Mac are a separate matter and not part of
the cut-over. If and when they go to hosted prod is Mika's decision; the way in
is the page (Настройки → «Загрузить данные из файла») for the ledger and
`/data` for a plan.

### After step 14

- A page that was open on the platform's Money keeps the platform's cookie.
  Its next save is answered `401` by Money and the page says «вход закончился».
  Nothing is written across.
- The platform's old page still answers at
  `ops.selfstudio.dev/money/index.html` until step 19. No menu links to it. A
  founder who saved there would write into the platform's database; the dry
  run in step 20 catches that.
- **Going back** is possible until step 19: the platform still holds the page,
  the doors and the ledger as it was exported. First download both documents
  from Money's `/data` — what was saved in Money since the cut-over exists
  nowhere else. Then a reverting edge hotfix returns the name. The platform's
  prod cannot take a cash plan back; that file stays on the Mac. This path has
  not been rehearsed.

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
  `docs/handoff.md` becomes a dated pointer to this repository.
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
its `develop` — 14 on 7 October, four of them product fixes.

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

   An `updated_at` later than the cut-over means somebody saved into the old
   page left at `ops.selfstudio.dev/money/index.html`: **stop and reconcile**
   before anything is dropped.
3. **One guarded transaction**, with the dry run's two numbers typed in. It
   refuses to start unless what is being **kept** was found — a deletion
   written as "everything except X" destroys everything the moment X is
   misspelt — and unless the ledger is exactly the one the dry run saw:

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
       RAISE EXCEPTION 'the ledger is not what the dry run saw (rev %, rows %)', r, n;
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

- **The prod import command** (step 12) does not exist.
- **`ctl` and the HTTP layer** were not built when this was written. Every
  `ctl …` line here — `selfcheck`, `doctor`, `verify`, `snapshots`, `restore`,
  `seed`, `purge-snapshots`, `empty`, `user …`, `sessions …` — is the build
  specification, and the deploy commands that call them cannot pass until they
  exist.
- No command in this document has been run on the server. The first run of
  each is recorded in `docs/handoff.md`.
- Whether `selfops-deploy` after an edge-only hotfix restarts nothing is
  inferred, not observed.
- Whether a ledger saved by the platform's `0.18.0` page opens cleanly in the
  page this repository serves has not been checked. It matters at step 12.
- Reloading the proxy without dropping names (`caddy reload`) exists in Caddy;
  it has not been tried on this setup and the procedure above does not rely on
  it.
- An off-host copy of the backups: not decided, not set up.
