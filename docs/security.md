# Money — security

What the hosted service (`moneyd`) protects, how, and what is still open.

**State on 7 October 2026, evening.** This text describes the code as it
stands after that day's fix round and was read against it. What stands behind
it, and what does not:

- The first build was verified the same day by three testers, who wrote their
  tests from the documents and not from the code, and five reviewers, who read
  the code to find what breaks it. They found 45 things — 5 high, 11 medium,
  29 low, none critical. The round that followed closed them, each change of
  code with a test that failed before it; the few that were left open on
  purpose are listed under "Residual risks" and in `docs/handoff.md`.
- Those testers and reviewers were separate sessions of the same assistant
  that built the service. **Nobody outside the studio's own sessions has
  reviewed it**, and the fixes themselves have not been looked at by the
  reviewers who found the faults.
- **It has no record of facing the internet yet.** A test stand was being
  brought up on the server's loopback port, and the owner's word to open it to
  the outside as soon as it is ready has been given; whether that has
  happened is in `docs/handoff.md`. There is no prod stand.
- The Python tests ran on Python 3.9 on the Mac. Python 3.13, Linux, the real
  container and a real browser are CI's part; its result on the fixed code is
  not recorded here.

The laptop tool (`server.py`) is not covered by this document: its whole
defence is that it listens on `127.0.0.1` and has the real ledger beside it,
which is why it is never exposed and never edited by the hosted work. The
verification found two gaps and one weakness in it; they wait for the owner's
word and are written down in `docs/handoff.md`.

## What the reader needs first

What is behind the sign-in: the studio's income, what each person is paid, what
each founder took out, and what is in the bank. The people the owner has let
in may see it; the owner, and whoever the owner says, may change it (see
"People and what each may do").

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

- no review by anyone outside the studio's own sessions has taken place;
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
  first names). They are created without a password at the stand's first
  start.
- People the owner adds from the page («Настройки → Люди») are accounts of
  `users.json` alone: a login, a name, and a note of who added them and when.
  A stand holds 20 accounts at most, the list's and the added ones together.
- An account in `users.json` that the list no longer names and nobody added
  cannot sign in, gets no link, and its login is never handed to anyone else.
- No e-mail, no self-service reset: a forgotten password is a new link.
- An account can be switched off and on: by the owner from the page, and from
  the server (`money-user <stand> disable <login>` / `enable <login>`).
  Disabling closes the login's sessions and retires its pending link; both
  take effect at the next request.
- The user record reserves a `totp` field for a second factor. Nothing reads it
  yet.

## People and what each may do

Since 9 October 2026 (the owner's decision: «я хочу сам создать профили для
Миши и Вани, они могут только читать, писать могу пока только я»).

- **The owner** is the first login `MONEY_FOUNDERS` names — `mika` on both
  stands, and a test holds the stand files to that. The owner saves the
  documents and is the only one who adds people, issues their links, disables
  them and says what each may do. "Owner" is never a value in `users.json`: no
  edit of an account can make a second one, and a file that says so is a
  damaged file.
- **A reader** is everybody else, until the owner says otherwise: both
  documents are sent to them, and neither is taken from them. A reader's `PUT`
  is `403 read_only`, said before a byte of its body is read. The page draws a
  reader nothing that changes anything, but that is a courtesy: the door
  judges by itself. (Where `/api/me` gives the page no answer at all - it is
  asked twice - the page is drawn as a writer's, and becomes a reader's when
  its first save is refused.)
- **An editor** is a person the owner has let save. An editor manages nobody.
- The role is read from `users.json` at every request, so a change holds from
  that person's next request, on a page they have open as well.
- **The owner's own sign-in is not changed from the page**: no role, no
  switching off, no link for the owner's own login. Nobody could undo the
  first two from there; and a way back in for an owner who has lost the
  password is made on the server, by somebody who can reach it.
- **Before a link is made the owner's password is asked for again**, and a
  wrong one is counted (10 per address, in the sign-in door's own count; 30
  per login in 15 minutes, in a count of its own): a link signs its holder in
  for thirty days and sets their password, so a page somebody walked away from
  must not be enough to make one, nor a way to guess the password without a
  limit. The count per login is not the sign-in door's, on purpose: a stranger
  who keeps failing to sign in as the owner must not be able to shut the
  owner's own doors.
- **Anybody changes their own password** at a door of its own, which asks for
  the current one, closes every sign-in of that login and opens a new one for
  the browser that asked. Should the new sign-in fail to be written, the
  answer says that the password was changed all the same
  (`503 password_changed`), and the log has its line.
- **A sign-in that was open when a login was shut out never works again**:
  the sessions are closed when a login is disabled, and once more before it is
  enabled.
- Every one of these — a person added, a role, a name, a link issued, a login
  switched off or on, a password changed, a password asked for again and not
  given — is a line in the security log with who did it.
- **The security log on `/data` is the owner's to read.** It names everybody's
  sign-ins and the addresses they came from; its entries are not in the markup
  sent to anybody else. A reader's `/data` has the two downloads and no upload.

What this changed. Until that day nobody who had a founder's password could
give anybody access: that took root on the server. Now the owner's password,
in a browser, is enough to let a person in — as a reader. It cannot make an
owner, and it cannot be done with a session alone.

## One-time links

A password is set, and reset, through a one-time link. A person issues one on
the server, or the owner issues one for somebody else from the page
(`POST /api/people/link`, after the owner's own password); for the owner's own
login only the server does.

```
ssh -t root@204.168.164.31 money-user prod invite mika
```

It prints the login on a line of its own (`login: mika`) and, under it,
`https://finance.selfstudio.se/set-password#t=<token>`.

- Single use, valid 48 hours, stored on the server only as sha256.
- Issuing a new link for a login retires the old one. No link is issued for a
  disabled login, and none is handed out unless its line could be written to
  the security log first. An issue that fails at that point has already
  retired the earlier link: afterwards no link is pending for that login at
  all, and the command is run again.
- Using the link replaces the password, closes every session of that login and
  signs the founder in. A password that is refused as weak does not spend the
  link.
- The token is in the address fragment, so it reaches no server log and no
  `Referer`; the page removes it from the address bar at once and sends it in
  the request body.
- **The login is told to the holder of a link that worked, and to nobody
  else.** The door's `200` answer carries it, and the set-password page then
  shows it in a read-only field of its form — so that a password manager files
  login and password together — and in the words «Пароль сохранён. Логин: …».
  Nothing else ever told a founder their login, and the natural guess, the
  e-mail the same host used to ask for, fails and counts against the address.
  A link that does not work is told nothing but that; the page's markup is the
  same for everyone and holds no login. The sign-in page says under «Логин»
  that it is the name from the invitation and not an e-mail, and says so again
  after a sign-in that was refused — in the same words whatever the reason, so
  nothing is told apart.
- `ctl` prints a link only when its output is a terminal. That is a tripwire,
  not a lock (`ssh -t` provides a terminal), so the rule is written down as
  well: **a session never runs `invite`** (`CLAUDE.md`).
- A link issued from the page is in that one answer and nowhere else: the page
  shows it once, and neither log nor any file holds it — the server keeps its
  sha256, as for a link issued on the server.
- Mika issues a link once per person — from the page, or with the line above —
  and passes the login and the link in the messenger the founders already use. A link that turns out to be dead when
  its founder opens it is the alarm that somebody else used it; issuing and
  use are both in the security log.
- **A backup must not bring a used link back.** A pending link is a record in
  `users.json`, and a backup holds that file. A link that was pending when a
  backup was taken and has been used since would be pending again in the
  restored file, for whoever still has the message it was sent in. So a
  whole-stand restore (`money-restore`) keeps the accounts file that was in
  place when it reads, and otherwise retires every pending link of the
  backup's accounts before the stand serves them (`ctl user retire-links`; one
  `link-retired` line per login). It takes every link on record — also one
  whose 48 hours have run out, and one of an account the founders list no
  longer names. The same choice keeps a password changed after the backup, and
  a login disabled after it, from going back in time whenever the newer file
  can be read. `docs/deploy.md`, "A whole stand back from a tarball".

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
  to the end. The reason is the page itself: after a `401` it stops saving
  until it is reloaded, and the edits made since are lost.
- **What that rule does not cover.** It softens the 30-day end and nothing
  else. A tab left open through 14 idle days, a session closed from the
  server, a login disabled, a password replaced through a new link, a
  `sessions.json` moved aside as damaged: each of these meets `401` at the
  tab's next save, the page says «вход закончился» and stops saving, and what
  is typed after that is lost on the reload. The idle time was left at 14 days
  on purpose: the shorter life is the safer one.
- Signing in always issues a fresh session and deletes the one the browser
  presented.
- `sessions.json` is re-read when it changes on disk, so closing sessions or
  disabling a login from the server (`money-user <stand> logout <login>`,
  `money-user <stand> disable <login>`) takes effect at the next request.
- `seen` is written at most once per 5 minutes per session — also when a page
  asks for several things at the same moment: the test is made again under the
  file's lock, and one of the parallel requests writes.
- A deploy or a reboot signs nobody out: sessions are a file. A whole-stand
  restore signs everybody out: a backup holds no sessions.

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
  ignored, never read into a log, and removed from the browser by every answer
  made once the request's cookies have been looked at. A few refusals come
  before that point and leave it alone: a foreign `Host` (`421`), a request
  whose end is a matter of opinion (`400`, `417`), a method nobody serves
  (`405`), an over-long request (`414`, `431`), too many connections from one
  address (`503`). Every ordinary first request clears it.

## Signing out

- `POST /api/auth/logout` deletes the session and clears the cookie with the
  attributes it was set with; it also sends `Clear-Site-Data: "cache"`.
- **When the server cannot forget the session** — the disk refuses the write
  (`507 storage_failed`) or the file's lock stays taken (`503 busy`) — the
  answer still clears the cookie. This browser is then signed out, and the
  session is still open on the server until it runs out or is closed there
  (`money-user <stand> logout <login>`). Whoever holds a copy of that cookie
  could go on using it. Money's own pages say so in words instead of "nothing
  changed".
- The page signs out from «Настройки → Люди», one's own card: «Выйти»
  (since 9 October 2026). The address `/login` (or `/logout`, which redirects
  there) is the other way out: for a signed-in founder it shows «Вы вошли как
  {firstName}», the login of that session («Ваш логин: …»), a link «Открыть
  Money» and a button «Выйти».
- `GET /login` never redirects. That removes the loop a design draft had
  between `/` and `/login` for a session in its last day; the form that such
  a session is shown comes with its login filled in. The server says which of
  its three states the page is in, and sends what belongs to another state
  with the `hidden` attribute, so a stranger is never shown «Вы вошли как»
  because a stylesheet did not arrive.

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
- A successful sign-in gives its own count back, for the login and for the
  address alike; the failures before it stay counted. An attempt that reached
  no verdict — no hash slot came free, the accounts file could not be read,
  the disk refused — is given back as well. An attempt the limiter refuses is
  not counted at all, so hammering a full count does not keep it full.
  (The build specification gave back only the login's count. The address's is
  given back too, on purpose: three founders behind one office address would
  otherwise be shut out after ten good sign-ins. A wrong password that was
  hashed always stays counted, so this buys no guess; both the tests and the
  review of the sign-in confirmed that.)
- A login is compared the way a person types it: blanks around it dropped,
  letter case and width aside. Every spelling of a login is that login and
  shares its one count — a count cannot be split by writing `MIKA`.
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
signing in on a new device. Four things bound this:

1. sessions that are already open are not affected;
2. one address can cause only 10 of the 30 failures a login tolerates;
3. **using a valid one-time link does not pass the per-login limit.** A founder
   who is locked out asks Mika for a new link
   (`money-user <stand> invite <login>`), opens it, chooses a password and is
   signed in;
4. **one address cannot shut the door that link leads to** — see the next
   section.

What remains: only the owner can issue that link for somebody else, and only
a person with root ssh for the owner. If Mika cannot be reached, nobody can
reset a password.

## Signed-out slots: strangers do not hold the threads founders need

The service has 32 connection threads. What could take them from founders is a
request that makes the server wait, and only one kind can: a request that
announces a body (`Content-Length` above 0) and then sends it slowly or not at
all. So:

- **A request without a session that announces a body** must take one of **8**
  signed-out slots **and** one of the **2** that its client address may hold
  (IPv6 by `/64`). With either missing it is answered `503 busy` at once, with
  `Retry-After: 1`. It keeps its slot until the request is over. That holds
  whatever the method and the path — a `GET` that announces a body takes a
  slot too, although no body sent to a door without one is ever read.
- **A request that announces no body takes no slot.** Once its head is read it
  cannot stall: the sign-in page, its script and stylesheet, the set-password
  page and every refusal are answered from memory however many bodies are
  stalled. `ctl selfcheck` asks without a body, or with a session, and so
  passes while slots are held: it does not send a deploy back. The post-deploy
  smoke is not as free: three of its checks send a body to the sign-in door
  without a session, each needs a slot, and with all eight held they fail
  ("Residual risks", point 4).
- **Signed-in requests never wait behind signed-out ones.**
- The slot is taken once the session is known and before the door is chosen.
  So a save without a session is told `503 busy` when no slot is free and
  `401` otherwise, and no body from a signed-out caller is ever read, and no
  password hashed, without a slot.
- A request whose session cannot be judged because the accounts file is
  damaged counts as signed out for this rule. Under contention an open page's
  save may then be told `503 busy` instead of `503 auth_damaged`; neither is
  `401`, so the page does not stop saving.

What this closed: in the first build every signed-out request needed a slot,
and the 12 connections one address may hold were more than the 8 slots — so a
single address, with eight stalled sign-in bodies renewed every five seconds,
shut the sign-in page, the sign-in door and the set-password door for
everybody, the documented way out of a lock-out included. Now one address
holds two slots at most, and the pages need none.

What remains is in "Residual risks", point 4: several addresses together can
still hold the doors that take a body from a signed-out caller — the sign-in
door and the set-password door among them.

## Cross-site requests

There is no anti-forgery token. Every `/api/*` request has to pass four
independent conditions:

1. `Sec-Fetch-Site`, when the browser sends it, must be `same-origin` (or
   `none` for a GET typed into the address bar). `same-site` and `cross-site`
   are refused: `403 bad_origin`.
2. Anything but GET and HEAD must carry an `Origin` header equal to
   `MONEY_PUBLIC_URL`, character for character (`403 bad_origin`). A GET that
   does carry an `Origin` must carry the right one.
3. A door that takes a body — there are five: the three under `/api/auth/` and
   the two document `PUT`s — accepts only `Content-Type: application/json`
   (`415 bad_content_type`), which a foreign page cannot send without a
   preflight, and no preflight is ever granted: `OPTIONS` answers `405` and no
   `Access-Control-*` header exists anywhere. A body sent to any other door is
   never read.
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
- **Every deploy proves that the stand believes the proxy.** If the Docker
  network the container sits in were ever outside the trusted ranges, every
  visitor would count as one address, and ten wrong passwords from anybody
  would shut the sign-in door for all three founders. Only a deployed stand
  can get this wrong, and only from the host can it be seen: the post-deploy
  smoke sends a request under an address reserved for documentation and
  finds its own line again in the stand's request log under that address. A
  stand that counted another address fails the smoke, and on prod the deploy
  goes back.
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
  `index.html` as the image holds it. Today that is one script, with no
  inline handlers and no `eval`. Nothing is injected into the page: `GET /` is
  the file, byte for byte.
- **A page the policy would not run in full does not pass a deploy.** The
  enforced policy does not run an inline event handler (`onclick=` and its
  relatives) or a `javascript:` address. `ctl selfcheck` counts them in the
  page's own markup, and while the policy is enforced one of them fails the
  self-check, so the deploy goes back and says why. Two more things only earn
  a warning, because they are guesses: markup with a handler inside the text
  of the page's script, and a name under `/money/vendor/` that is not one of
  the three files served. The boot itself is never refused for any of this: a
  restart must not take a stand down.
- Money's own pages carry **no inline script and no inline style**. They load
  `/assets/auth.js` and `/assets/auth.css`, use the system font stack (no web
  fonts), and set every text with `textContent`.
- The vendor policy has no `unsafe-eval`.
- **There is no "off".** `MONEY_CSP` is `enforce` (the default) or
  `report-only`; any other value stops the boot, and before that the deploy.
  `report-only` on `prod` needs `MONEY_CSP_OVERRIDE_UNTIL=YYYY-MM-DD`, a day
  that has not passed. Two places hold that, and they differ on purpose:
  - **the deploy** (`deploy/stand.sh`) refuses a missing day, a day that is
    not a real one and a day that has passed — before anything is touched;
  - **the service** refuses a missing day and a day that is not one. A day
    that has **passed** is not a refusal there: the override has simply ended,
    the stand starts, enforces, and says in a warning on which day it ended.
    A stand that is already running must not lose its health check, its
    command line and its restarts to a date.

  Either way the override runs out by itself: the day after the named date a
  running prod enforces again, without a restart. `ctl selfcheck` prints the
  mode. The switch exists because a policy that breaks a new page would
  otherwise have to be answered by loosening the code.
- `Strict-Transport-Security` and `X-Robots-Tag` are set at the edge, in the
  two Money blocks of the platform's `Caddyfile.edge`.

## What the server itself refuses

`moneyd` stands on Python's `http.server`, which Python's own documentation
does not recommend for production. It is used here because of what stands in
front of it and what is not used from it; each known gap is closed explicitly.

| Gap of `http.server` | What closes it |
|---|---|
| it would face the internet | published on `127.0.0.1` only; Caddy terminates TLS and HTTP/2 and re-serialises every request |
| URLs mapped to files | `SimpleHTTPRequestHandler` is not used. The page, three vendor files and the small pages are read into memory at start and served from a fixed table of exact paths. No directory listing, no path translation, no percent-decoding, no traversal |
| no cap on threads | 32 connection threads in all; with none free, a bare `503` with `Retry-After: 1` |
| signed-out traffic starving founders | the signed-out slots above: 8 for bodies without a session, 2 of them per client address; nothing for a request without a body; signed-in requests never wait behind signed-out ones |
| one address holding many connections | at most 12 concurrent connections per client address (`503 too_many_connections`). A connection is counted from the moment its headers are read; one that sends nothing holds a thread for 30 seconds at most, uncounted. From outside the machine only the edge can open a connection to a stand, and it opens one when it has a whole request head to send |
| a header that is costly to read | a request line and its headers are read strictly — `name: value` and nothing else, 8 KiB a line, 32 KiB and 100 lines in all (`414`, `431`) — and each line is taken apart in one pass, whatever it holds. (The first build read a line with a pattern whose cost grew with the square of its length: four header lines of blanks cost a second of the stand's one processor, before any limit knew whose request it was.) |
| slow bodies | total deadlines, not per read: 5 s for the sign-in doors (4 KiB at most); `20 s + 1 s per 10 000 bytes of Content-Length`, 600 s at most, for a document. A body that misses its deadline has its connection closed. An answer on its way out has the same time for its own length; nothing that long is ever sent to a stranger |
| many large bodies at once | a document body of a megabyte or more is "large": at most three are held in memory at once, one at a time is parsed and saved, and a request that waits more than 30 seconds for its turn is told `503 storage_busy` |
| request-boundary tricks | every answer carries `Connection: close`, one request per connection; `Transfer-Encoding` is refused (`400`), and so are two `Content-Length` headers that are not written alike; a body needs a `Content-Length` written in digits (`411`) and is refused over its limit, by however many digits, before a byte is read (`413`) |
| work done for strangers | session, `Origin`, `Content-Type`, length and free space on the disk are judged before the body is read. (So on a disk that is short every save is told `507`, a stale one included: megabytes are not read onto a full disk to learn that) |
| a body that kills the parser | the JSON parse runs with a bounded depth check (16 levels); a maximally nested 4 KiB body answers `400`, and `RecursionError` and its relatives are caught. A save whose body nests deeper than `{"base", "doc": "<string>"}` is refused without being parsed |
| answers that echo input | error pages, log lines and the `Server` header are overridden: fixed bodies, own JSON log, nothing a caller sent is repeated |
| a second process on the same port | the listener does not share its port: `allow_reuse_port` is set to off explicitly, so the answer does not depend on a Python release's default |
| the process growing without bound | container limits: 256 MB, one CPU, 64 pids; read-only root; all capabilities dropped; `no-new-privileges`; user 10001 |

The body deadline runs against the founder's own connection, because the edge
does not hold a body back until it is whole (request buffering is not in the
edge blocks yet). 10 000 bytes a second is what a phone has on a train: enough
for a ledger of up to about 5.8 MB, while at the 16 MiB limit the ten-minute
cap asks for about 28 000 bytes a second. Below that a save is cut and the page
says «не сохранено — проверьте связь».

What remains true: this is the studio's own HTTP glue with no framework's
history behind it. It is meant for three users behind Caddy. It is not
something to expose directly or to grow.

## Damaged state fails closed

A file that cannot be read is never treated as "empty": an empty document is
what the next open page would save over the real one. The same holds for a
file or a directory that is not there when it should be: no document, no
accounts file and no directory of theirs is made anew by a request, by `ctl`
or by a restart.

**The documents.**

- A `current.json` that is truncated, unparseable or missing its envelope is
  never read as revision 0. That document's `GET` and `PUT` answer
  `503 storage_damaged`, and `ctl doctor` names the newest snapshot that reads
  back, passing over — and naming — any that does not.
- **"Never saved" is told apart from "lost".** The first accepted save writes a
  marker `EVER_SAVED` beside the document. A `current.json` that is missing is
  a lost document — `503 storage_damaged` — when that marker is there; when
  copies of the document lie among its snapshots; when the document's whole
  directory has gone from a stand that has run (the `STAND` marker is the last
  thing a first start writes, so with it there a missing directory was lost);
  or when the data directory itself has gone. Only a document with none of
  these answers `{rev: 0, doc: {}, updatedAt: null}`.
- A snapshot restore is the one write a damaged document takes; the damaged
  file is moved aside, not deleted.

**The accounts.**

- A damaged `users.json` stops the boot. A server that is already running
  answers `503 auth_damaged` on the sign-in doors and to every request that
  carries a live session — not `401`, because a page that is told `401` stops
  saving. (A request with no cookie, or with a cookie that is no session, is
  told what it is always told.) The file is never repaired by guessing.
- **A `users.json` that is missing is the same damage**, not "no accounts
  yet", once accounts have been written: its first write leaves a marker,
  `USERS_WRITTEN`, beside it. Without this, a lost file would have been
  answered with `401` to every open page and, at the next start, with three
  founders quietly made anew without passwords. The same when the whole
  `auth/` directory has gone from a stand that has run.
- A damaged `sessions.json` is moved aside as `sessions.json.damaged-<utc>` and
  treated as empty: everybody signs in again, and the security log says so.

**Writes.**

- `users.json`, `sessions.json` and the one-time links are written like the
  documents: temporary file, `fsync`, rename, `fsync` of the directory, under
  `flock`, because the server and `ctl` are two processes.
- **A write is answered for what is on the disk.** A failure before the rename
  is `507 storage_failed`, and what was stored is untouched. Once the rename
  has happened every reader gets the new file, so when only the last step —
  the sync of the directory — fails, the write is still a write: a save gets
  its `200` and its revision, a link is spent, a password is set, and a
  `storage-unsynced` line in the security log says that the disk did not
  confirm it will survive a power cut. (The first build answered such a save
  `507` "what was stored is untouched"; the page then kept its old revision
  and stopped saving at the next edit.)
- **A revision never comes back.** Every save and every restore writes a
  revision above the stored one *and* above the number in `EVER_SAVED`, the
  highest ever given out. (That marker is synced to disk with every save,
  like the document: it is what a whole-stand restore reads to learn how far
  the lost days had counted.) `ctl floor` can lift that number — never lower
  it —
  for the two moments when a stand's files are older than what browsers hold:
  a stand put back from a backup, and the cut-over. Without it a page left
  open from before would be let in again as soon as the count reached the
  number it holds, and would save its old copy over everything saved since,
  with no `409`. A number longer than fifteen digits is no revision: it is
  refused as a floor and ignored in a marker.

How to bring each of these back, or to begin one anew on purpose, is in
`docs/deploy.md`, "Backup and restore".

## Keeping the stands and the laptop apart

| What must not happen | What stops it |
|---|---|
| prod's data directory mounted under test, or the reverse | a `STAND` marker in the data directory, written by the first start; a marker that names another stand stops the boot, and so does a directory that holds a stand's files but no marker |
| the laptop's `data/` served by the hosted service | every stand, dev included, refuses a data directory that holds the laptop layout (`db.json`, `cash.json`, `backups/`) or that is the checkout's own `data/` — also when that `data/` is a link to somewhere else; `moneyd` uses different file names and never imports `server.py` |
| the hosted code run with a public listener by mistake | `MONEY_STAND=dev` refuses to start unless it binds a loopback address **and** its public host ends in `.localhost` |
| a stand on a name where the page would quietly keep data in the browser | `prod` and `test` refuse a public host that does not begin with `finance.` |
| the ledger in an image | `.dockerignore` is an allow-list, and CI builds from a copy with decoys planted to prove it |
| the ledger in git, or tests run beside it | `data/` is ignored; every test stops when `<checkout>/data` exists; a hygiene test looks for tracked data and ledger-sized JSON; no CI step writes to or removes a path called `data/` beside the code |
| real statements on the test stand | **since 8 October 2026 the owner keeps them there on purpose**, for the rehearsal before prod (`docs/handoff.md`, «Настоящие данные на тестовом стенде»). What must not happen now is the reverse — see the next row. Until that day, and again once the stand returns to the fabricated studio: it is filled only from the generator and reseeded every night at 00:10 UTC, and **every snapshot is purged after each successful reseed** — so anything put there is out of the document and out of every copy within a day, while the nights succeed; `/data` on test draws no upload control; `ctl seed` and `ctl purge-snapshots` refuse on prod; the test sign-in pages are dark and carry the band «Тестовый стенд Money — проверка перед выпуском» |
| the real documents on the test stand replaced by the fabricated studio, or their copies purged | a marker a person puts into the stand's data directory, `REAL_DATA` (`docs/deploy.md`, "The test stand's data"). Beside it `ctl seed` and `ctl purge-snapshots` refuse on every stand, before anything is read or written; `money-seed-test` — and so the nightly unit — refuses before the generator runs; `money-deploy-test --reseed` is refused before anything is touched, and a plain `money-deploy-test` seeds nothing and takes a backup first. A marker that cannot be looked at counts as there. The stand is backed up nightly (`money-backup test`) once its timer is switched on |
| a prod backup unpacked onto test | `money-restore` restores prod's tarballs into prod only, and checks the tarball's own `STAND` marker; the rehearsal's copy of prod's data is served by a container without a network and removed afterwards, also when the run is interrupted |

What remains a rule and not a lock, on a stand that holds the fabricated
studio: the page's own «Загрузить данные из файла» works on the test stand
like anywhere else, and `ctl seed` reads its document from standard input, so
a person with root ssh could pipe a real file into test. The nightly reseed
bounds how long such a mistake lives, and the bound is only as good as the
nights: a reseed that fails leaves the stand as it was for another day. A
failed night is therefore said where people look — in a `WARNING` of the next
test deploy and in the words at login — and a reseed that hangs is ended
after fifteen minutes.

And on a stand that holds real documents: the marker is a file, made and
removed by hand, and root can remove it — the lock holds against a command
typed by mistake and a timer left on, not against somebody who means to. It
is not put there by itself either: a stand whose real documents nobody has
marked is reseeded like any other. An upload through the page still replaces
a document whole — it is an ordinary save, which keeps what it replaces only
on the day's first save or when most rows go — and `ctl restore` is not
refused. A script run by somebody who is not root cannot look into the data
directory and does not see the marker; it is then `ctl` inside the container
that refuses. The test stand's backups share the disk with its data, like
prod's, and nothing says at login when they have stopped.

## Logs

Two logs.

**The request log** — standard output of the container, one JSON line per
request with fixed fields: time, request id, method, path, status, bytes,
milliseconds, client address, and the login when signed in. Never logged:
bodies, the `Cookie` header, tokens, passwords, and what somebody typed into a
login field (people type passwords there). The path is logged without its
query, and a path segment longer than 32 characters is replaced by `~`: nothing
this service serves is that long, a pasted token is.

**It is the only record of who saved**: a save is a `PUT` line with the
founder's login, and the security log has no event for a save. How far back it
reaches:

- across deploys: Docker deletes a container's log with the container, so
  `deploy/stand.sh` stops a container and keeps what it said before the
  container is replaced or removed —
  `/var/log/money/<stand>/requests-<utc>.log.gz`, mode 600 in a directory of
  mode 700, kept 400 days (`docs/deploy.md`, "The request log");
- within one container's life: Docker's rotation, the last 5 × 10 MB. A
  container that runs for many months without a deploy loses its oldest lines.

**The security log** — `security.log` in the data directory: append-only JSON
lines, written under a lock and synced to disk, rotated by size (20 MB × 10),
and a rotated file younger than 400 days is not deleted (up to 40 files). A
field whose name suggests a secret is refused by the code, and a text is cut
at 200 characters, so neither a token nor a document can end up in it. It is
part of every backup; after a whole-stand restore the directory that was moved
aside holds its lines for the days since the backup. Its events:

| Event | Written when |
|---|---|
| `boot` | the service started |
| `sign-in`, `sign-out` | a founder signed in; a session was closed by its owner |
| `sign-in-failed` | a wrong sign-in: the address and the count; the login only when it is a founder's |
| `password-changed` | a signed-in person chose a new password; the login's other sessions were closed |
| `password-check-failed` | a signed-in person was asked for their own password again — before a link was issued or a password changed — and gave another |
| `user-added`, `user-renamed`, `role-changed` | the owner added a person, gave one another name, said what one may do |
| `sign-in-blocked`, `link-blocked` | the limiter refused the sign-in door or the set-password door; once per key and window |
| `login-flood` | more than 200 attempts were turned away within one clock hour; the rest of that hour's are not written one by one |
| `link-issued`, `link-used`, `link-refused` | a one-time link was issued on the server, used, or tried when it does not work |
| `link-retired` | a pending link was retired from the server before it was used — after a stand was put back from a backup |
| `password-set` | a password was set through a link and the login's other sessions were closed |
| `session-created`, `sessions-closed` | a session was created or closed from the server, not by signing in |
| `user-disabled`, `user-enabled` | a login was switched off or on |
| `sessions-damaged` | `sessions.json` could not be read and was moved aside |
| `seed`, `snapshots-purged` | test and dev only, and never on a stand marked `REAL_DATA`: a document written by `ctl seed`; snapshots deleted. A seed or a purge that is refused leaves no line: it writes nothing at all |
| `doc-shrunk` | a save dropped more than half of a document's rows (of more than 20). It names the snapshot that kept what was replaced: a `shrink-` copy, or the day's copy when that save was the first of its day |
| `restore` | a snapshot was restored as a new revision |
| `floor-raised` | the server was told that no revision of a document at or below a number may be given out again — after a stand was put back from a backup, or before the cut-over import |
| `storage-unsynced` | a file was put in place, but the disk did not confirm that it will survive a power cut |

The `/data` page lists the last 50 entries for the owner, so what was done
with root on the server leaves a trace the owner can see. Nobody else is sent
them.

Errors are codes plus fixed English sentences. A `500` is `{error: "internal"}`
and a request id; the detail is in the log.

## Threats considered

| Threat | How it is closed |
|---|---|
| Guessing passwords online | limits per address (10) and per login (30) in 15 minutes, counted before the hash under one lock; two hashes at a time; 12+ characters; one answer for every failure |
| A stranger locking a founder out through the per-login limit | one address can cause 10 of the 30 failures; open sessions are untouched; a one-time link signs in without passing the limit, and one address cannot shut the door it leads to. Residual: only Mika can issue the link |
| Cracking hashes from a stolen `users.json` or backup | scrypt n=2^15 r=8 p=3, salt per user, backups readable by root only. Residual: no pepper, and the backup holds the ledger itself |
| Session theft | `HttpOnly`, `Secure`, `__Host-`; never in an address or a log; sha256 at rest; revocation from the server; expiry. Residual: a sign-out the server could not record leaves the session open until it is closed there |
| Session fixation | only server-issued tokens; a new one at every sign-in and the presented one deleted; a new password closes all |
| Forged requests from another site | the four conditions above; no CORS |
| Forged requests or planted cookies from a sibling `*.selfstudio.se` site or from the test stand | exact `Origin` and `Sec-Fetch-Site: same-origin`; `__Host-` cookie, host-only |
| Script injected through a statement file or an imported JSON (the page draws with `innerHTML`) | the page's policy with the script's hash, no inline handlers possible, `connect-src 'self'`, `HttpOnly` cookie. Residual: a page bug can still change data inside a session |
| Script injected into Money's own pages | no inline script at all; `script-src 'self'`; texts set with `textContent` |
| Framing, cross-origin reads, side channels | `frame-ancestors`, `X-Frame-Options`, no CORS, CORP, COOP, `nosniff`, condition 1 on every API GET |
| Poisoned `Host`, DNS rebinding, forged links | one allowed `Host` (`421` otherwise); links built from the setting |
| Forged `X-Forwarded-For` | believed from the edge only, right-most entry; loopback publish; the firewall allows 22, 80 and 443 |
| A stand that stopped believing the edge, so that everybody counts as one address | the post-deploy smoke finds its own request in the stand's log under the address it sent; a stand that counted another fails the deploy |
| Smuggling and oversized requests | Caddy faces the internet and caps a body at 17 MB; one request per connection; `Transfer-Encoding` refused; length required and limited before reading; session before body |
| Slow requests that hold the server | 32 threads; 8 signed-out body slots, 2 per address, none needed for a page; 12 connections per address; total body deadlines; container limits. Residual 4 |
| A request built to be costly to read | headers parsed in one pass; depth-bounded JSON; large bodies one at a time |
| Path traversal, reading the data folder over HTTP | no path mapping exists; a fixed table of exact paths; the post-deploy smoke asks for `/server.py`, `/.git/config`, `/data/ledger/current.json` and a path that climbs out of the vendor folder, and expects none of them |
| What a stranger can learn | signed out, only the pinned list of paths answers; everything else answers alike. The three vendor names answer `401` where other names under `/money/vendor/` answer `302`: they are the names of the libraries the page loads and say nothing about what a stand holds |
| Secrets in logs | fixed log fields; tokens only in bodies and fragments. Caddy redacts `Cookie` in its own log by default — not verified on the server |
| A reader, or somebody with a reader's password, changing the documents | the document doors refuse a reader's save before its body is read (`403 read_only`); the role is the server's, read at every request; `/data` offers a reader no upload and the doors would refuse one |
| Somebody who is let in letting others in, or making themselves more | the doors under `/api/people` answer the owner alone (`403 not_owner`); "owner" is not a value an account can hold |
| A page the owner walked away from being used to make a link | the owner's password is asked for again, and counted like a failed sign-in when it is wrong. Residual 22 |
| A link intercepted on its way to a founder | single use, 48 hours; issuing and use are in the security log and on `/data`; a dead link is the alarm. Residual: no confirmation code yet |
| A used link, an old password or a re-enabled login coming back with a backup | a whole-stand restore keeps the newer accounts file when it reads, and otherwise retires every pending link before the stand serves |
| A page left open from before a restore or the cut-over saving its old copy over what came after | revisions never come back: the floor (`ctl floor`), raised by `money-restore` for both documents and before the cut-over import |
| A bad save emptying a document | revisions and `409`; day copies and before-shrink copies, and a `doc-shrunk` line whichever copy was taken; `/data` downloads what it is about to replace; nightly tarball; restore as a new revision |
| A damaged or lost file read as an empty document and saved over | fail closed, as above |
| A protection switched off by configuration | no `off` value for the policy; `report-only` refused on prod without a dated override, at the deploy and at the boot; an override that has ended enforces; dev mode refuses a public listener; no scrypt, no boot. Residual 17 |
| A page whose controls the policy will not run | `ctl selfcheck` fails the deploy for an inline handler under an enforced policy |
| The record of who saved lost with a container | the request log is kept before a container is replaced or removed |
| The real ledger on the wrong stand, in git or in an image | the table in "Keeping the stands and the laptop apart" |
| A session with root ssh reading prod | a rule only: `ctl` prints counts, never contents, and writes to the security log. Residual |
| A source of exchange rates that is wrong, or made to be | one day's file, asked by day over https, no redirect followed, 512 KiB at most, four numbers read out of it; bounds per currency and 12% a day from the day beside it; a refused answer is in the security log; a rate the owner types stands over the source's. Residual 12 |
| Supply chain | no runtime dependency beyond the official Python image; Playwright exists only in CI. Residual: the vendored readers, see "Next" |

## Residual risks, stated plainly

1. **Home-made sign-in and HTTP glue in front of bank balances and payroll.**
   It has been verified once, by sessions of the assistant that built it, and
   the round that fixed what they found has not been reviewed again. Nobody
   outside has attacked it. This is the reason for the first gate below.
2. **Password only.** No second factor in the first version. Passkeys are not
   possible on the standard library alone (it cannot verify a public-key
   signature); a one-time code from an authenticator app is.
3. **The one-time link is a bearer credential for 48 hours** and travels through
   a messenger. There is no confirmation code yet. If a messenger rewrites the
   `#` of a link as `%23`, the token becomes part of the request path: Money
   keeps it out of its own log, but the edge's access log records request
   paths. Such a link does not open the set-password page; a new one is issued,
   which retires it.
4. **A stranger can still slow a founder down**, in two ways.
   With three or more addresses the per-login limit can be held shut; the
   escape is a new link, and that needs Mika.
   And with four addresses, each stalling two request bodies and renewing them
   every five seconds, the eight signed-out slots can be held: the sign-in
   door and the set-password door then answer `503 busy` for as long as it is
   kept up. The pages stay reachable, founders who are signed in are not
   touched, and a restart does not help. A deploy made while it lasts fails
   its smoke — three of the smoke's checks send a body to the sign-in door —
   so on prod it goes back to the previous image and on test it ends
   `FAILED`; it is repeated once the stalling stops. Request buffering at the
   edge would keep stalled bodies away from the stand; it is not built.
5. **A slow connection can be too slow to save.** The body deadline runs
   against the founder's own upload (see "What the server itself refuses").
   The platform had no such limit.
6. **A sign-in can still end under an open page** — after 14 idle days, or
   when a session is closed from the server. The page then stops saving, and
   what was typed after that moment is lost on the reload.
7. **Backups share the disk with the data**, are not encrypted, and contain the
   ledger and the password hashes. Nothing is off the host. That holds for the
   test stand's tarballs too, for as long as it holds real documents.
8. **Root ssh reads everything.** Any session with root on the server can read
   `/var/lib/money/prod` — and `/var/lib/money/test`, which holds the real
   ledger since 8 October 2026 — could run `invite`, and could remove the
   `REAL_DATA` marker. Only rules stand in the way.
9. **The edge is the platform's.** Money's two proxy blocks live in the
   platform's `Caddyfile.edge`; a mistake in that file takes every name of both
   products down. `docs/deploy.md` has the guards.
10. **The page is only partly changed for the split.** It draws with
    `innerHTML` — the names the owner gives people included, each through the
    page's own escape — has no stand mark, its own import works on the test
    stand, and behind a closed door it still says that Money opens under the
    platform's sign-in. The sign-out control came on 9 October 2026 with
    «Люди». The policy is the compensating control for the first; rules for
    the import.
11. **The vendored SheetJS is 0.18.5**, which has a published prototype-pollution
    advisory. Until it is replaced the enforced policy is the compensating
    control.
12. **The container reaches the internet, and since 9 October 2026 it asks
    one thing of it**: a day's exchange rates, from one open source at two
    addresses (`moneyd/rates.py`; the owner's decision - the rates are no
    longer typed by hand). Nothing of the studio's is sent: the request names
    a day. What comes back is read strictly - four numbers, each within the
    bounds a rate could have and within 12% a day of the day beside it - never
    followed to another address, and thrown away whole when it fails, with a
    line in the security log. What remains: a source that is wrong within
    those bounds is believed, and a day once in the table is not asked for
    again; the owner sees the rates in «Настройки» and can type one of their
    own over any of them. Outbound traffic is not restricted to those two
    names.
13. **Python fixes arrive only with a deploy.** Each deploy builds on the newest
    3.13 patch image; nothing rebuilds by itself. `ctl selfcheck` prints the
    image's age.
14. **One process per stand, and every deploy restarts it** — also a deploy of
    the same version: the container is replaced each time so that its log is
    kept whole. Money answers `502` meanwhile, and a ledger save that falls
    into that gap is sent again only when the founder changes something.
15. **The limiter is in memory** and forgets on restart — so every deploy
    forgets it too.
16. **Storage rules exist twice** — in `server.py` and in `moneyd/store.py` —
    and can drift apart. They already differ where it matters: the laptop tool
    reads a file it cannot parse as revision 0 (`docs/handoff.md`).
17. **A prod policy override can be dated years ahead.** Any day that has not
    passed is accepted, so a far date is an off-switch in effect. A cap needs
    the owner's number.
18. **The record of who saved reaches back 50 MB within one container's life.**
    Across deploys it is kept for 400 days; a container that is never
    redeployed outruns Docker's rotation.
19. **A sign-out can fail on the server's side** (a full disk) while the
    browser is signed out; the session then stays open until it is closed
    there.
20. **Detection is thin.** A stale backup of prod and a failed test reseed are
    said at login to whoever opens an ssh session. A stale backup of the test
    stand is said nowhere but in its journal; only a backup timer that is not
    switched on is said, by the next test deploy. A flood of failed sign-ins
    is seen only by someone who opens the security log or the `/data` page.
21. **Not seen in a browser beyond CI's Chromium.** That a file handed over by
    `/data` downloads under the pages' policy, and that password managers file
    the login with the password on the set-password page, is checked only
    there; Safari, Firefox and the real edge are unchecked.
22. **The owner's password, in a browser, lets a person in.** Until 9 October
    2026 a link could be issued only with root on the server. Now whoever
    holds the owner's password and a sign-in of the owner's can issue one from
    the page — for a reader or an editor, never for a second owner — and so
    can add a login of their own choosing. There is no second factor and no
    confirmation code. Every such step is a line in the security log, which
    the owner reads on `/data`.

## Before prod

Gates. Money's prod is not cut over, and the real ledger is not loaded into it,
until each of these is done or decided:

- [x] an independent security review of `moneyd`'s sign-in and HTTP code and of
      its tests has **passed**. What has happened so far is the verification
      of 7 October described at the top, by the studio's own sessions, and one
      round of fixes that nobody has re-reviewed. Whether that is the review
      this gate means, or a person from outside is, is the owner's decision.
      **Decided 8 October 2026: the owner launches on the verification of
      7 October.** Nobody from outside has read the code; that is accepted, not
      done, and a reader from outside is still wanted after the launch. The
      same ledger was by then on the test stand, behind the same code;
- [ ] a backup of the prod stand has been taken **and a restore of it
      rehearsed** (`money-restore --rehearse`) — once on the empty stand, and
      again on the first backup that holds the real ledger;
- [x] the **off-host copy** is decided by the owner: where a copy of the backups
      lives outside this machine, or an explicit acceptance of same-disk only.
      **Decided 8 October 2026: same disk only, accepted.** A dead disk takes
      the stand and its backups together; what is then left is whatever a
      founder last took with «Скачать» on `/data`;
- [x] the **second factor** is decided by the owner: password only for now, or a
      one-time code before the real ledger is hosted. **Decided 8 October
      2026: password only for now.**

## Next

Not in the first version; none of these is built.

- A one-time code from an authenticator app at sign-in (the user record already
  reserves `totp`).
- A known-device exemption from the per-login limit, so that a browser that has
  signed in before is not locked out by a stranger's failures.
- A confirmation code for one-time links, told to the founder over a different
  channel than the link.
- Request buffering at the edge, once `caddy validate` accepts the option on
  the server's Caddy: it takes stalled bodies and slow uploads off the stand.
- A cap on how far ahead a prod policy override may be dated.
- A longer reach for the request log within one container's life.
- A stand mark in the page, and its closed-door words. (The sign-out control
  is there since 9 October 2026: «Настройки → Люди», one's own card.)
- Restricting the container's outbound network to the two addresses the
  exchange rates are asked at.
- A scheduled rebuild for Python patch releases (today `selfcheck` only prints
  the image's age).
- Replacing the vendored SheetJS 0.18.5.
- The laptop tool's two gaps — on the owner's word only (`docs/handoff.md`).
