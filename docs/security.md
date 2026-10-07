# Money — security

What the hosted service (`moneyd`) protects, how, and what is still open.
Written on 7 October 2026 together with the first build. **Nothing described
here has run on a server yet, and none of it has been reviewed by anyone but
its authors.** The text was checked against the settings, storage, sign-in and
log modules; the HTTP module and the pages were not written yet, so what is
said about headers, policies, thread and deadline limits is the build
specification, to be held to the code by its tests.

The laptop tool (`server.py`) is not covered: its whole defence is that it
listens on `127.0.0.1` and has the real ledger beside it, which is why it is
never exposed and never edited by this work.

## What the reader needs first

What is behind the sign-in: the studio's income, what each person is paid, what
each founder took out, and what is in the bank. Three people may see it.

What stands between a stranger and those two documents:

1. The edge proxy (Caddy, in the platform's repository) is the only thing that
   faces the internet. `moneyd` is published on the server's loopback address
   only.
2. `moneyd` answers a signed-out caller on a short, pinned list of paths
   (`docs/api.md`, "Paths that answer without a session"). Every other path
   answers alike: `401` under `/api/`, a redirect to `/login` elsewhere.
3. Signing in needs a password of 12 or more characters that only its owner
   has ever typed, chosen through a one-time link.
4. A session is a random token in a `__Host-` cookie; the server keeps only its
   sha256.

What is **not** done, and gates the real ledger (the full lists are at the end):

- no independent security review has taken place;
- there is no second factor: a password alone signs a founder in;
- backups, once they exist, will sit on the same disk as the data, and no copy
  leaves the machine;
- any session with root ssh on the server can read the data directory. Only a
  rule stands in the way.

Where this document and the code disagree, the code is what runs: fix the
document in the same change.

## Accounts

- Exactly the logins named in `MONEY_FOUNDERS`
  (`mika:Mika,misha:Misha,vanya:Vanya`; the page hard-codes the same three
  first names). They are created without a password at start.
- An account in `users.json` that the list no longer names cannot sign in.
- No roles, no admin screen, no e-mail, no self-service reset.
- An account can be switched off and on from the server:
  `money-user <stand> disable <login>` / `enable <login>`. Disabling closes the
  login's sessions and retires its pending link; both take effect at the next
  request.
- The user record reserves a `totp` field for a second factor. Nothing reads it
  yet.

## One-time links

A password is set, and reset, in one way: a person issues a one-time link on
the server.

```
ssh -t root@204.168.164.31 money-user prod invite mika
```

It prints `https://finance.selfstudio.se/set-password#t=<token>`.

- Single use, valid 48 hours, stored on the server only as sha256.
- Issuing a new link for a login retires the old one. No link is issued for a
  disabled login, and none is handed out unless its line could be written to
  the security log first.
- Using the link replaces the password, closes every session of that login and
  signs the founder in. A password that is refused as weak does not spend the
  link.
- The token is in the address fragment, so it reaches no server log and no
  `Referer`; the page removes it from the address bar at once and sends it in
  the request body.
- `ctl` prints a link only when its output is a terminal. That is a tripwire,
  not a lock (`ssh -t` provides a terminal), so the rule is written down as
  well: **a session never runs `invite`** (`CLAUDE.md`).
- Mika runs the line once per founder and passes each link in the messenger the
  founders already use. A link that turns out to be dead when its founder opens
  it is the alarm that somebody else used it; issuing and use are both in the
  security log.

Consequences: a password is only ever typed by its owner, into a browser, over
TLS; nobody else knows it; nothing passes through a chat with a session; there
is no SMTP.

**There are no secrets in any environment file.** Tokens are random and stored
hashed, nothing is signed, there is no pepper. The stand files
(`deploy/stands/*.env`) are committed, and a test fails when one gains a key it
does not know.

## Passwords and hashing

- 12 to 256 characters, counted after NFKC normalisation. Refused
  (`400 weak_password`, with `min: 12`) when shorter or longer, or when the
  password contains — whatever the letter case — the login, the first name, or
  one of a short deny-list: `password`, `пароль`, `qwerty`, `123456`,
  `selfstudio`, `money`, `finance`.
- Normalised to NFKC, then
  `hashlib.scrypt(password, salt=16 random bytes, n=2**15, r=8, p=3, dklen=32, maxmem=64 MiB)`.
  That is about 32 MiB of memory per hash. (`maxmem` has to be passed: OpenSSL's
  default is just under what `n=2**15` needs.) The time per hash on the server
  has not been measured.
- Stored as `scrypt$15$8$3$<salt>$<hash>`: the parameters travel with the hash,
  so they can be raised later and a sign-in re-hashes. A scrypt hash is never
  replaced by a weaker one.
- At most two hashes run at once. A request waits at most 5 seconds for a hash
  slot and then gets `503 busy`.
- `prod` and `test` refuse to start on a Python without `hashlib.scrypt`. Only
  `MONEY_STAND=dev` accepts the stand-in, PBKDF2-SHA256 with 20 000 rounds
  (`pbkdf2$…`), so that the tests run on the Mac's Python 3.9, which has no
  scrypt. On prod and test a `pbkdf2$` hash is as good as no hash. CI runs the
  scrypt path, including the RFC 7914 test vector.

## Sessions

- The token is `secrets.token_urlsafe(32)`, issued at sign-in and never
  accepted from outside. The server keeps `sha256(token)` only, in
  `auth/sessions.json`.
- Lifetime: 30 days from sign-in; 14 days without use; at most 10 per login —
  an eleventh sign-in closes the one used longest ago.
- A session also ends when its login is disabled, is dropped from
  `MONEY_FOUNDERS`, or is given a new password.
- **The last 24 hours.** A session in its last 24 hours no longer opens the
  page: `GET /` redirects to `/login`, which shows the form with the line «Вход
  скоро закончится — войдите заново». A page that is already open keeps saving
  to the end. The reason is the page itself: after a `401` it stops saving and
  the edits made since are lost, so a sign-in must not run out in the middle of
  work.
- Signing in always issues a fresh session and deletes the one the browser
  presented.
- `sessions.json` is re-read when it changes on disk, so closing sessions or
  disabling a login from the server (`money-user <stand> logout <login>`,
  `money-user <stand> disable <login>`) takes effect at the next request.
- `seen` is written at most once per 5 minutes per session.
- A deploy or a reboot signs nobody out: sessions are a file.

## The cookie

```
Set-Cookie: __Host-money=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000
```

- `__Host-` makes the browser refuse a copy set by any other `*.selfstudio.se`
  site, the test stand included, and ties the cookie to the exact host.
- `Secure` is unconditional on a stand. `X-Forwarded-Proto` is never consulted.
- `Lax`, not `Strict`: the page itself is behind the session, and a link opened
  from a messenger must still open it.
- `MONEY_STAND=dev` alone uses `money-dev`, without `Secure` and without the
  prefix, because it speaks plain http on loopback.
- The platform's old `ssp_session` cookie, which founders' browsers will go on
  sending to `finance.selfstudio.se` for up to 30 days after the name moves, is
  ignored, never read into a log, and removed from the browser.

## Signing out

- `POST /api/auth/logout` deletes the session and clears the cookie with the
  attributes it was set with; it also sends `Clear-Site-Data: "cache"`.
- The frozen page has no sign-out control. Until it gets one, the way out is
  the address `/login` (or `/logout`, which redirects there): for a signed-in
  founder it shows «Вы вошли как {firstName}», a link «Открыть Money» and a
  button «Выйти».
- `GET /login` never redirects. That removes the loop a design draft had
  between `/` and `/login` for a session in its last day.

## Limits, and the way out of a lock-out

The limiter lives in the process's memory.

| What is counted | Limit per 15 minutes | Over it |
|---|---|---|
| failed sign-ins from one client address | 10 | `429 too_many_attempts`, `retryAfter`, `Retry-After` |
| failed sign-ins for one login | 30 | the same |
| failures at the set-password door from one client address | 10 | the same |

- Under **one lock** the attempt is checked and counted for both keys (login
  and client address) **before** it waits for a hash slot. So a burst of
  parallel wrong passwords gets exactly as many hashed as the limit allows.
- A successful sign-in gives its count back. So does an attempt that reached no
  verdict (no hash slot came free). An attempt the limiter refuses is not
  counted at all, so hammering a full count does not keep it full.
- An unknown login, a disabled one and one without a password yet cost the same
  hash and get the same answer as a known one.
- At the set-password door only a link that does not work counts as a failure.
- The client address is the one described under "Proxy trust". IPv6 addresses
  are counted by `/64`.
- The table is bounded: 10 000 keys, the one touched longest ago evicted first.
  The founders' own logins are never evicted.
- A restart of the process forgets the counts.

**The lock-out and its escape.** Three logins are easy to guess, so a stranger
who keeps failing on `mika` can hold that login at its limit and keep Mika from
signing in on a new device. Three things bound this:

1. sessions that are already open are not affected;
2. one address can cause only 10 of the 30 failures a login tolerates;
3. **using a valid one-time link does not pass the per-login limit.** A founder
   who is locked out asks Mika for a new link
   (`money-user <stand> invite <login>`), opens it, chooses a password and is
   signed in.

What remains: only a person with root ssh can issue that link. If Mika cannot
be reached, nobody can reset a password.

## Cross-site requests

There is no anti-forgery token. Every `/api/*` request has to pass four
independent conditions:

1. `Sec-Fetch-Site`, when the browser sends it, must be `same-origin` (or
   `none` for a GET typed into the address bar). `same-site` and `cross-site`
   are refused: `403 bad_origin`.
2. Anything but GET and HEAD must carry an `Origin` header equal to
   `MONEY_PUBLIC_URL`, character for character (`403 bad_origin`). A GET that
   does carry an `Origin` must carry the right one.
3. Anything with a body must be `Content-Type: application/json`
   (`415 bad_content_type`), which a foreign page cannot send without a
   preflight, and no preflight is ever granted: `OPTIONS` answers `405` and no
   `Access-Control-*` header exists anywhere.
4. The cookie is `SameSite=Lax`.

Conditions 1 and 2 are the ones that matter here. Every `*.selfstudio.se` site,
Money's own test stand included, is same-site with prod, so `SameSite` alone
separates nothing between them.

The page's own calls pass all four: `fetch` with `credentials: "same-origin"`
and a JSON content type, including the save it makes while the tab closes.

## Proxy trust

- The container's port is published on the host's loopback only, so the only
  possible peer is the host itself through the Docker bridge.
- `X-Forwarded-For` is believed only from a peer inside
  `MONEY_TRUSTED_PROXIES` (the private ranges), and the **right-most** entry is
  taken — the one the edge itself appended. A header sent by a client cannot
  move it. A trusted range wider than a `/8` is refused at start: it would
  mean believing anybody's header.
- `Host` must equal the host of `MONEY_PUBLIC_URL`; anything else is `421`.
  Links are built from the setting, never from a request.
- `X-Forwarded-Proto` is not consulted at all.

## Headers and policies

Set by the service on every answer and pinned by tests:

```
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Server: money
Connection: close
```

`Cache-Control: no-store` on the API and on the sign-in pages; `no-cache` on the
page, the vendor files and the two assets; `Vary: Cookie` on `/`.

A `Content-Security-Policy` on everything, by kind of answer:

| Answer | Policy |
|---|---|
| the page (`/`) | `default-src 'none'; script-src 'self' 'sha256-<hash>'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` |
| Money's own pages (`/login`, `/set-password`, `/data`) | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` |
| vendor scripts (`/money/vendor/*`) | `default-src 'none'; script-src 'self'` |
| JSON answers | `default-src 'none'` |

- The page's hash is computed at start from the inline scripts found in
  `index.html` as it was handed over. Today that is one script, with no inline
  handlers and no `eval`. Nothing is injected into the page: `GET /` is the
  file, byte for byte.
- Money's own pages carry **no inline script and no inline style**. They load
  `/assets/auth.js` and `/assets/auth.css`, use the system font stack (no web
  fonts), and set every text with `textContent`.
- The vendor policy has no `unsafe-eval`.
- **There is no "off".** `MONEY_CSP` is `enforce` (the default) or
  `report-only`; any other value stops the boot. `report-only` is refused on
  `prod` unless `MONEY_CSP_OVERRIDE_UNTIL=YYYY-MM-DD` names a day that has not
  passed, and the override runs out by itself: the day after that date a
  running prod enforces again, without a restart. `ctl selfcheck` prints the
  mode. The switch exists because the page is rewritten elsewhere and arrives
  whole: a policy that breaks the new page would otherwise have to be answered
  by loosening the code.
- `Strict-Transport-Security` and `X-Robots-Tag` are set at the edge, in the
  two Money blocks of the platform's `Caddyfile.edge`.

## What the server itself refuses

`moneyd` stands on Python's `http.server`, which Python's own documentation
does not recommend for production. It is used here because of what stands in
front of it and what is not used from it; each known gap is closed explicitly.

| Gap of `http.server` | What closes it |
|---|---|
| it would face the internet | published on `127.0.0.1` only; Caddy terminates TLS and HTTP/2 and re-serialises every request |
| URLs mapped to files | `SimpleHTTPRequestHandler` is not used. The page, three vendor files and the small pages are read into memory at start and served from a fixed table of exact paths. No directory listing, no path translation, no traversal |
| no cap on threads | 32 connection threads in all; with none free, a bare `503` |
| signed-out traffic starving founders | after the headers are parsed, a request without a valid session takes one of 8 signed-out slots or gets `503` at once; signed-in requests never wait behind signed-out ones |
| one address holding many connections | at most 12 concurrent connections per client address |
| slow bodies | total deadlines, not per read: 5 s for the sign-in doors (4 KiB at most); `20 s + 1 s per 50 000 bytes of Content-Length` for a document. A body that misses its deadline has its connection closed |
| request-boundary tricks | every answer carries `Connection: close`, one request per connection; `Transfer-Encoding` is refused (`400`); a body needs a numeric `Content-Length` (`411`) and is refused over its limit before a byte is read (`413`) |
| work done for strangers | session, `Origin` and `Content-Type` are judged before the body is read |
| a body that kills the parser | the JSON parse runs with a bounded depth check (16 levels); a maximally nested 4 KiB body answers `400`, and `RecursionError` and its relatives are caught |
| answers that echo input | error pages, log lines and the `Server` header are overridden: fixed bodies, own JSON log, nothing a caller sent is repeated |
| the process growing without bound | container limits: 256 MB, one CPU, 64 pids; read-only root; all capabilities dropped; `no-new-privileges`; user 10001 |

What remains true: this is a few hundred lines of the studio's own HTTP glue
with no framework's history behind it. It is meant for three users behind
Caddy. It is not something to expose directly or to grow.

## Damaged state fails closed

A file that cannot be read is never treated as "empty": an empty document is
what the next open page would save over the real one.

- A `current.json` that is truncated, unparseable or missing its envelope is
  never read as revision 0. That document's `GET` and `PUT` answer
  `503 storage_damaged`, and `ctl doctor` names the newest snapshot.
- "Never saved" is told apart from "lost": the first accepted save writes a
  marker `EVER_SAVED` beside the document. Marker present and `current.json`
  missing is `503 storage_damaged`. No marker and no file is the empty answer
  `{rev: 0, doc: {}, updatedAt: null}`.
- A damaged `users.json` stops the boot. A server that is already running
  answers `503 auth_damaged` on the sign-in doors and on every door that needs
  a session — not `401`, because a page that is told `401` stops saving. The
  file is never repaired by guessing.
- A damaged `sessions.json` is moved aside as `sessions.json.damaged-<utc>` and
  treated as empty: everybody signs in again, and the security log says so.
- A snapshot restore is the one write a damaged document takes; the damaged
  file is moved aside, not deleted.
- `users.json`, `sessions.json` and the one-time links are written like the
  documents: temporary file, `fsync`, rename, under `flock`, because the server
  and `ctl` are two processes.

## Keeping the stands and the laptop apart

| What must not happen | What stops it |
|---|---|
| prod's data directory mounted under test, or the reverse | a `STAND` marker in the data directory, written at the first start; a marker that names another stand stops the boot, and so does a directory that holds a stand's files but no marker |
| the laptop's `data/` served by the hosted service | every stand, dev included, refuses a data directory that holds the laptop layout (`db.json`, `cash.json`, `backups/`) or that is the checkout's own `data/`; `moneyd` uses different file names and never imports `server.py` |
| the hosted code run with a public listener by mistake | `MONEY_STAND=dev` refuses to start unless it binds a loopback address **and** its public host ends in `.localhost` |
| a stand on a name where the page would quietly keep data in the browser | `prod` and `test` refuse a public host that does not begin with `finance.` |
| the ledger in an image | `.dockerignore` is an allow-list |
| the ledger in git, or tests run beside it | `data/` is ignored; every test stops when `<checkout>/data` exists; a hygiene test looks for tracked data and ledger-sized JSON |
| real statements on the test stand | it is filled only from the generator, reseeded every night at 00:10 UTC, and its snapshots older than two days are purged, so anything put there lives a day at most; `/data` on test draws no upload control; `ctl seed` and `ctl purge-snapshots` refuse on prod; the test sign-in pages are dark and carry the band «Тестовый стенд — выдуманная студия. Настоящие выписки сюда не загружать» |

What remains a rule and not a lock: the frozen page's own «Загрузить данные из
файла» works on the test stand like anywhere else, and `ctl seed` reads its
document from standard input, so a person with root ssh could pipe a real file
into test. The nightly reseed bounds how long such a mistake lives.

## Logs

Two logs.

**The request log** — standard output of the container, one JSON line per
request with fixed fields: time, request id, method, path, status, bytes,
milliseconds, client address, and the login when signed in. Never logged:
bodies, the `Cookie` header, tokens, passwords, and what somebody typed into a
login field (people type passwords there). The path is logged without its
query, and a path segment longer than 32 characters is replaced by `~`: nothing
this service serves is that long, a pasted token is. Docker keeps the log in
rotated `json-file` files. A save is a `PUT` line with the founder's login.

**The security log** — `security.log` in the data directory: append-only JSON
lines, written under a lock and synced to disk, rotated by size (20 MB × 10),
and a rotated file younger than 400 days is not deleted. A field whose name
suggests a secret is refused by the code, and a text is cut at 200 characters,
so neither a token nor a document can end up in it. Its events:

| Event | Written when |
|---|---|
| `boot` | the service started |
| `sign-in`, `sign-out` | a founder signed in; a session was closed by its owner |
| `sign-in-failed` | a wrong sign-in: the address and the count; the login only when it is a founder's |
| `sign-in-blocked`, `link-blocked` | the limiter refused the sign-in door or the set-password door; once per key and window |
| `login-flood` | more than 200 attempts were turned away within one clock hour; the rest of that hour's are not written one by one |
| `link-issued`, `link-used`, `link-refused` | a one-time link was issued on the server, used, or tried when it does not work |
| `password-set` | a password was set through a link and the login's other sessions were closed |
| `session-created`, `sessions-closed` | a session was created or closed from the server, not by signing in |
| `user-disabled`, `user-enabled` | a login was switched off or on |
| `sessions-damaged` | `sessions.json` could not be read and was moved aside |
| `seed`, `snapshots-purged` | test and dev only: a document written by `ctl seed`; snapshots deleted |
| `doc-shrunk` | a save dropped more than half of a document's rows; what it replaced is kept as a `shrink-` snapshot |
| `restore` | a snapshot was restored as a new revision |

The `/data` page lists the last 50 entries for a signed-in founder, so what was
done with root on the server leaves a trace the founders can see.

Errors are codes plus fixed English sentences. A `500` is `{error: "internal"}`
and a request id; the detail is in the log.

## Threats considered

| Threat | How it is closed |
|---|---|
| Guessing passwords online | limits per address (10) and per login (30) in 15 minutes, counted before the hash under one lock; two hashes at a time; 12+ characters; one answer for every failure |
| A stranger locking a founder out through the per-login limit | one address can cause 10 of the 30 failures; open sessions are untouched; a one-time link signs in without passing the limit. Residual: only Mika can issue the link |
| Cracking hashes from a stolen `users.json` or backup | scrypt n=2^15 r=8 p=3, salt per user, backups readable by root only. Residual: no pepper, and the backup holds the ledger itself |
| Session theft | `HttpOnly`, `Secure`, `__Host-`; never in an address or a log; sha256 at rest; revocation from the server; expiry |
| Session fixation | only server-issued tokens; a new one at every sign-in and the presented one deleted; a new password closes all |
| Forged requests from another site | the four conditions above; no CORS |
| Forged requests or planted cookies from a sibling `*.selfstudio.se` site or from the test stand | exact `Origin` and `Sec-Fetch-Site: same-origin`; `__Host-` cookie, host-only |
| Script injected through a statement file or an imported JSON (the page draws with `innerHTML`) | the page's policy with the script's hash, no inline handlers possible, `connect-src 'self'`, `HttpOnly` cookie. Residual: a page bug can still change data inside a session |
| Script injected into Money's own pages | no inline script at all; `script-src 'self'`; texts set with `textContent` |
| Framing, cross-origin reads, side channels | `frame-ancestors`, `X-Frame-Options`, no CORS, CORP, COOP, `nosniff`, condition 1 on every API GET |
| Poisoned `Host`, DNS rebinding, forged links | one allowed `Host` (`421` otherwise); links built from the setting |
| Forged `X-Forwarded-For` | believed from the edge only, right-most entry; loopback publish; the firewall allows 22, 80 and 443 |
| Smuggling and oversized requests | Caddy faces the internet and caps a body at 17 MB; one request per connection; `Transfer-Encoding` refused; length required and limited before reading; session before body |
| Slow requests that hold the server | 32 threads, 8 signed-out slots, 12 connections per address, total body deadlines, container limits |
| Path traversal, reading the data folder over HTTP | no path mapping exists; a fixed table of exact paths; the post-deploy smoke asks for `/server.py`, `/.git/config` and `/data/ledger/current.json` and expects none of them |
| What a stranger can learn | signed out, only the pinned list of paths answers; everything else answers alike |
| Secrets in logs | fixed log fields; tokens only in bodies and fragments. Caddy redacts `Cookie` in its own log by default — not verified on the server |
| A link intercepted on its way to a founder | single use, 48 hours; issuing and use are in the security log and on `/data`; a dead link is the alarm. Residual: no confirmation code yet |
| A bad save emptying a document | revisions and `409`; day copies and before-shrink copies; nightly tarball; restore as a new revision |
| A damaged file read as an empty document and saved over | fail closed, as above |
| A protection switched off by configuration | no `off` value for the policy; `report-only` refused on prod without a dated override; dev mode refuses a public listener; no scrypt, no boot |
| The real ledger on the wrong stand, in git or in an image | the table in "Keeping the stands and the laptop apart" |
| A session with root ssh reading prod | a rule only: `ctl` prints counts, never contents, and writes to the security log. Residual |
| Supply chain | no runtime dependency beyond the official Python image; Playwright exists only in CI. Residual: the vendored readers, see "Next" |

## Residual risks, stated plainly

1. **Home-made sign-in and HTTP glue in front of bank balances and payroll.**
   Nobody outside its authors has attacked it. This is the reason for the first
   gate below.
2. **Password only.** No second factor in the first version. Passkeys are not
   possible on the standard library alone (it cannot verify a public-key
   signature); a one-time code from an authenticator app is.
3. **The one-time link is a bearer credential for 48 hours** and travels through
   a messenger. There is no confirmation code yet. If a messenger rewrites the
   `#` of a link as `%23`, the token becomes part of the request path: Money
   keeps it out of its own log, but the edge's access log records request
   paths. Such a link does not open the set-password page; a new one is issued,
   which retires it.
4. **A stranger can still slow a founder down.** With three or more addresses
   the per-login limit can be held shut; the escape needs Mika.
5. **Backups share the disk with the data**, are not encrypted, and contain the
   ledger and the password hashes. Nothing is off the host.
6. **Root ssh reads everything.** Any session with root on the server can read
   `/var/lib/money/prod` and could run `invite`. Only rules stand in the way.
7. **The edge is the platform's.** Money's two proxy blocks live in the
   platform's `Caddyfile.edge`; a mistake in that file takes every name of both
   products down. `docs/deploy.md` has the guards.
8. **The page is not Money's to change yet.** It draws with `innerHTML`, has no
   sign-out control and no stand mark, and its own import works on the test
   stand. The policy is the compensating control for the first; rules for the
   last.
9. **The vendored SheetJS is 0.18.5**, which has a published prototype-pollution
   advisory. Until it is replaced the enforced policy is the compensating
   control.
10. **The container can reach the internet**, although it needs nothing from it.
11. **Python fixes arrive only with a deploy.** Each deploy builds on the newest
    3.13 patch image; nothing rebuilds by itself. `ctl selfcheck` prints the
    image's age.
12. **One process per stand.** A deploy is a few seconds of `502` for Money, and
    a save in flight at that moment is lost unless the founder changes
    something again.
13. **The limiter is in memory** and forgets on restart.
14. **Storage rules exist twice** — in `server.py` and in `moneyd/store.py` —
    and can drift apart.
15. **Detection is thin.** A flood of failed sign-ins and a stale backup are
    seen only by someone who opens the security log, the `/data` page or an ssh
    session.

## Before prod

Gates. Money's prod is not cut over, and the real ledger is not loaded into it,
until each of these is done or decided:

- [ ] an independent security review of `moneyd`'s sign-in and HTTP code and of
      its tests has **passed**;
- [ ] a backup of the prod stand has been taken **and a restore of it
      rehearsed** (`money-restore --rehearse`);
- [ ] the **off-host copy** is decided by the owner: where a copy of the backups
      lives outside this machine, or an explicit acceptance of same-disk only;
- [ ] the **second factor** is decided by the owner: password only for now, or a
      one-time code before the real ledger is hosted.

## Next

Not in the first version; none of these is built.

- A one-time code from an authenticator app at sign-in (the user record already
  reserves `totp`).
- A known-device exemption from the per-login limit, so that a browser that has
  signed in before is not locked out by a stranger's failures.
- A confirmation code for one-time links, told to the founder over a different
  channel than the link.
- Blocking outbound network for the container.
- A scheduled rebuild for Python patch releases (today `selfcheck` only prints
  the image's age).
- Replacing the vendored SheetJS 0.18.5, after the page's hand-over.
