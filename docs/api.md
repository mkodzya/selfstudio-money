# Money — the HTTP contract

What the hosted service (`moneyd`) answers, door by door. The laptop tool
(`server.py`) speaks a different, older contract and is not described here.

The only client that matters is the page, `index.html`. It is edited in this
repository now, but the doors are still not free to change: the released page
speaks them, and so does every tab a founder has open. On a host name that
begins with `finance.` the page reads and saves the ledger at
`/api/founder/money`, the cash plan at `/api/founder/money/cash`, asks
`/api/me` for who is signed in and what they may do, and loads its Excel and
PDF readers from `/money/vendor/`. Its «Люди» screen speaks the four doors
under `/api/people` and the door that changes one's own password. Everything
else in this document exists so that a person can sign in, sign out and move a
document as a file.

`tests/test_routes_doc.py` holds this document to the server, both ways: the
table under "Routes" against the server's route table and against what a
running stand answers on every row; the list under "Paths that answer without
a session", which is pinned there; every status and code named here, door by
door, against what that door answers when it is made to refuse; the members of
the bodies and answers sketched here; and the numbers — slots, limits,
deadlines — against the settings. A route is added, removed or opened only
together with its line here.

**State on 7 October 2026, evening.** Brought in line with the server after the
independent verification of that day: the methods and statuses the HTTP layer
answers by itself are named with their codes, the signed-out slots and the body
deadline are as the fix round left them, and the set-password door names the
login.

## Conventions

- **Where.** prod `https://finance.selfstudio.se`, test
  `https://finance.test.selfstudio.se`, dev `http://finance.localhost:<port>`.
- **Paths are exact.** The server has a fixed table of paths. No path is ever
  mapped to a file, and nothing is matched by prefix.
- **Session** means a valid session cookie: `__Host-money` on a stand,
  `money-dev` in dev. Nothing else identifies a caller.
- **One request per connection.** Every answer carries `Connection: close`.
- **Refusals are JSON**: `{"error": "<code>", "message": "<a fixed English
  sentence>"}`, sometimes with one more field named below. The code is the
  contract; the sentence is for a person reading a log. Nothing a caller sent
  is echoed. The one exception is the answer of a server with no thread to
  give: a status and no body (see "What every request passes first").
- **Every refusal has a code**, also the ones the HTTP layer gives before any
  door is reached: `400 bad_request`, `400 bad_json`, `405 method_not_allowed`,
  `414 bad_request`, `417 bad_request`, `421 misdirected`, `431 bad_request`,
  `503 busy` and `503 too_many_connections`. Each is described where it is
  given, below. One code may stand under several statuses; the pair is what a
  client reads.
- **A fault of the server's own** is `500` with `{"error": "internal"}`, the
  usual `message` and a `requestId`; the detail is in the server's log under
  that id and never in the answer.
- **No CORS.** `OPTIONS` answers `405 method_not_allowed`, and no
  `Access-Control-*` header exists anywhere.

## Routes

<!-- Read by tests/test_routes_doc.py. One row per method and path. The first
     two cells are the method and the exact path, as plain text. The third is
     "yes" or "no". Keep this the only table in the section. -->

| Method | Path | Session | Body | Answer |
|---|---|---|---|---|
| GET | /login | no | | 200 HTML. Never a redirect |
| GET | /set-password | no | | 200 HTML |
| GET | /logout | no | | 302 to /login |
| GET | /assets/auth.js | no | | 200 script for Money's own pages |
| GET | /assets/auth.css | no | | 200 stylesheet for Money's own pages |
| GET | /robots.txt | no | | 200 text, disallows everything |
| GET | /favicon.ico | no | | 204 |
| GET | /healthz | no | | 200 text, to a loopback peer only |
| POST | /api/auth/login | no | JSON, 4 KiB | 200 JSON and the session cookie |
| POST | /api/auth/setup | no | JSON, 4 KiB | 200 JSON and the session cookie |
| POST | /api/auth/logout | no | JSON, 4 KiB | 200 JSON, cookie cleared |
| POST | /api/auth/password | yes | JSON, 4 KiB | 200 JSON and the session cookie |
| GET | / | yes | | 200 the page; 302 to /login without a session that may open it |
| GET | /index.html | yes | | as GET / |
| GET | /money/vendor/pdf.min.js | yes | | 200 script |
| GET | /money/vendor/pdf.worker.min.js | yes | | 200 script |
| GET | /money/vendor/xlsx.full.min.js | yes | | 200 script |
| GET | /data | yes | | 200 HTML |
| GET | /api/me | yes | | 200 JSON |
| GET | /api/founder/money | yes | | 200 JSON, the ledger |
| PUT | /api/founder/money | yes | JSON, 16 MiB | 200 JSON, the new revision |
| GET | /api/founder/money/cash | yes | | 200 JSON, the cash plan |
| PUT | /api/founder/money/cash | yes | JSON, 4 MiB | 200 JSON, the new revision |
| GET | /api/rates | yes | | 200 JSON, the exchange rates by day |
| GET | /api/people | yes | | 200 JSON, who can sign in |
| POST | /api/people | yes | JSON, 4 KiB | 200 JSON, who can sign in |
| POST | /api/people/update | yes | JSON, 4 KiB | 200 JSON, who can sign in |
| POST | /api/people/link | yes | JSON, 4 KiB | 200 JSON, a one-time link |
| GET | /tracker/board | yes | | 302 to / |
| GET | /dashboard | yes | | 302 to / |
| GET | /money/ | yes | | 302 to / |
| GET | /money/index.html | yes | | 302 to / |

Four methods are served: `GET`, `HEAD`, `POST` and `PUT`. `HEAD` has no rows of
its own: it is answered wherever `GET` is, under the session rule of that row,
with the status and the headers `GET` would give (`Content-Length` included)
and no body.

## Paths that answer without a session

These, and no others, give their own answer to a caller who is not signed in.

<!-- Read by tests/test_routes_doc.py. One path per line inside the fence,
     nothing else. Keep this the only fenced block in the section. -->

```
/login
/set-password
/logout
/assets/auth.js
/assets/auth.css
/robots.txt
/favicon.ico
/healthz
/api/auth/login
/api/auth/setup
/api/auth/logout
```

`/healthz` answers only a peer on the loopback address, which is the
container's own health check. Through the edge it behaves like a path that does
not exist.

## Every other request

So that a stranger cannot tell an existing path from a missing one:

- **Signed out**: any other path under `/api/` answers `401 unauthenticated`,
  as JSON, never HTML and never a redirect. The three vendor files answer
  `401 unauthenticated` as well: the page asks for them as scripts, and a
  script that gets a redirect gets the sign-in page. (So these three names can
  be told from other names under `/money/vendor/`; they are the names of the
  libraries the page loads and say nothing about what a stand holds.) Any other
  path answers `302` to `/login`.
- **Signed in**: a path that is not in the table answers `404 not_found`.
- **A path of the table under a method it does not have** answers
  `405 method_not_allowed` with an `Allow` header that names the methods it
  has (`HEAD` beside every `GET`). A stranger is told so only on the paths
  that answer without a session; on any other path a stranger gets what every
  path gives a stranger.
- **A method the server does not serve at all** — anything but `GET`, `HEAD`,
  `POST` and `PUT` — answers `405 method_not_allowed` on every path, for
  everybody, with `Allow: GET, HEAD, POST, PUT`.

## What every request passes first

Before any door does its own work, in this order. **None of a request's body is
read until everything in the first list has passed.**

Before the body:

- **A free thread.** 32 connection threads in all. With none free the server
  gives a bare answer — the status `503 Service Unavailable`, `Retry-After: 1`,
  no body and no code — and closes.
- **A request line and headers that can be read.** A request is
  `METHOD target HTTP/1.x` and then header lines of the form `name: value`,
  nothing else: no folded lines, no blank before the colon, no control byte in
  a value. Anything else is `400 bad_request`. A request line over 8 KiB is
  `414 bad_request`; a header line over 8 KiB, more than 100 header lines, or
  more than 32 KiB of them is `431 bad_request`. The request line and the
  headers have 30 seconds between them; a request that takes longer has its
  connection closed without an answer.
- **At most 12 concurrent connections per client address.** The thirteenth is
  `503 too_many_connections`, with `Retry-After: 1`. A connection is counted
  from the moment its headers are read.
- **`Host`** must equal the host of the stand's public URL, letter case aside.
  Otherwise `421 misdirected`.
- **Nothing that makes the end of the request a matter of opinion.** A
  `Transfer-Encoding` header, or two `Content-Length` headers that are not
  written alike: `400 bad_request`. An `Expect` header other than
  `100-continue`, or any on HTTP/1.0: `417 bad_request`. (`100 Continue` is
  said only when a body is about to be read, never before it is judged.)
- **A method the server serves**: `405 method_not_allowed` otherwise.
- **A signed-out slot, for a request without a session that announces a
  body** (`Content-Length` above 0, whatever the method and the path). It must
  take one of 8 signed-out slots, and one of the 2 that its client address may
  hold; with either missing it is answered `503 busy` at once, with
  `Retry-After: 1`. The slot is kept until the request is over. A request that
  announces no body takes no slot — once its head is read it cannot keep the
  server waiting — so the sign-in page, its script and stylesheet and every
  refusal are answered however many bodies are stalled, and one address cannot
  shut the sign-in door or the set-password door for the others. Signed-in
  requests never wait behind signed-out ones.
- **The session**, where the table says "yes"; without one the answer is that
  of "Every other request". While the accounts file cannot be read, a request
  that carries a live session is answered `503 auth_damaged` and not
  `401 unauthenticated`: a page that is told its sign-in has ended stops
  saving. A request with no cookie, or with a cookie that is no session, is
  told what it is always told.
- **Cross-site rules**, on every `/api/` path. Each refusal is
  `403 bad_origin`:
  - `Sec-Fetch-Site`, when the browser sends it, must be `same-origin`, or
    `none` for a GET typed into the address bar. `same-site` and `cross-site`
    are refused;
  - anything but GET and HEAD must carry `Origin` equal to the stand's public
    URL, character for character;
  - a GET that does carry an `Origin` must carry the right one.
- **What the door asks of the one who is signed in.** A door that saves is not
  for a reader, and the doors under `/api/people` are the owner's alone (see
  "Who may do what"). The refusal is given here, before the body, and is named
  at each of those doors.
- **`Content-Type`**, on the nine doors that take a body (the rows with a
  "Body" cell), must be `application/json` (a `charset` parameter is fine):
  `415 bad_content_type`. A body sent to any other door is never read.
- **`Content-Length`**, on the same nine doors, must be present and a number
  written in digits: `411 length_required`. Over the door's limit — by however
  many digits — the request is refused unread: `413 body_too_large`.
- **Room on the disk**, for a document `PUT`: free space must be above three
  times the announced length plus 64 MB, or the answer is `507 storage_failed`
  before a byte of the body is read — whatever the body would have held.

The body:

- **A deadline**, total and not per read: 5 seconds for the doors with a 4 KiB
  body; `20 s + 1 s per 10 000 bytes of Content-Length` for a document, and
  600 seconds at most (about four minutes for a ledger of 2 MB). The edge does
  not hold a body back until it is whole, so this clock runs against the
  founder's own connection: 10 000 bytes a second is what a phone has on a
  train. A body that misses its deadline has its connection closed without an
  answer. An answer on its way out has the same time for its own length.
- **The JSON itself.** A body that is not JSON, or is nested deeper than 16
  levels, answers `400 bad_json`. It never ends the process.

**The client address** used for the limits and the logs is the peer's, unless
the peer is inside `MONEY_TRUSTED_PROXIES`; then it is the right-most entry of
`X-Forwarded-For`. `X-Forwarded-Proto` is never consulted. An IPv6 address is
counted by its /64 — one subscriber, many addresses — for the 12 connections,
for the 2 signed-out slots and for the sign-in limits alike.

## When to come back

A refusal that is about load says in a `Retry-After` header when to try again.

<!-- Read by tests/test_routes_doc.py. One line per header value: the value in
     backticks first, then every answer that carries it, each as a status and a
     code in backticks. -->

- `Retry-After: 1` — `503 busy` for want of a signed-out slot,
  `503 too_many_connections`, and the answer without a body of a server with
  no thread to give.
- `Retry-After: 2` — `503 busy` from a door (no hash slot came free, a file's
  lock stayed taken) and `503 storage_busy`.
- `429 too_many_attempts` carries the seconds of its own `retryAfter`.

`503 auth_damaged` and `503 storage_damaged` carry none: waiting does not mend
them.

## The cookie

Set by a successful `POST /api/auth/login` and `POST /api/auth/setup`:

```
Set-Cookie: __Host-money=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000
```

Cleared by `POST /api/auth/logout` with the same attributes. In dev the name is
`money-dev`, without `Secure` and without the `__Host-` prefix.

A session lasts 30 days from sign-in and 14 days without use. In its **last 24
hours** it still passes on every `/api/` door, so an open page goes on saving,
but it no longer opens the page: `GET /` answers `302` to `/login`.

## Signing in and out

### GET /login

`200`, HTML, `Cache-Control: no-store`. It never redirects, whoever asks:

- no session — the sign-in form. Under «Логин» it says «Логин — имя из
  ссылки-приглашения, не e-mail»: the login is the word issued with the
  one-time link, and the page names nobody's;
- a session that may still open the page — «Вы вошли как {firstName}», the
  login of that session («Ваш логин: …»), a link «Открыть Money» to `/`, and a
  button «Выйти»;
- a session in its last 24 hours — the form, with the line «Вход скоро
  закончится — войдите заново» and the login of that session already in its
  field.

The page loads `/assets/auth.js` and `/assets/auth.css` and has no inline
script. The server says which of the three it is in `data-state` on `<body>`,
and sends what belongs to another state with the `hidden` attribute, so the
page shows the right thing even when its stylesheet does not arrive.

### POST /api/auth/login

The body is `{"login": "<login>", "password": "<password>"}`: one JSON object
of at most 4 KiB. The login is compared the way a person types it — blanks
around it dropped, letter case and width aside (`" MIKA "` is `mika`) — and
every spelling of a login counts against that one login in the limiter.

- `200` `{"ok": true, "firstName": "<first name>"}` and the session cookie. A
  fresh session is always issued; the one the browser presented, if any, is
  deleted.
- `400 missing_credentials` — the login or the password is absent, empty, or
  not a string; or the body is JSON that is not an object.
- `401 invalid_credentials` — every failure answers this, whatever the reason:
  a wrong password, an unknown login, a disabled one, one without a password
  yet. An unknown login costs the server the same hash as a known one.
- `429 too_many_attempts`, with `retryAfter` (seconds) in the body and a
  `Retry-After` header — after 10 failures from one client address, or 30 for
  one login, within 15 minutes, the next attempt is refused. A refused attempt
  is not counted.
- `503 busy` — no hash slot came free within 5 seconds (two hashes run at
  once), or a file's lock stayed taken. The attempt is not counted.
- `503 auth_damaged` — the accounts file cannot be read. Nobody can sign in
  until it is repaired.
- `507 storage_failed` — the disk refused a write of the accounts or the
  sessions. Nothing was half-written.

### GET /set-password

`200`, HTML, `no-store`. The page reads the one-time token from the address
fragment (`#t=<token>`), removes it from the address bar and sends it in the
body of the next door. The token is never part of a path or a query.

The page itself knows nobody: the same markup is sent to everyone, and it holds
no login. Once the door below has accepted the link, the page puts the login
from the answer into a read-only field of its form (so that a password manager
files login and password together), says «Пароль сохранён. Логин: …» and
offers «Открыть Money». A link that does not work is told nothing but that.

### POST /api/auth/setup

The body is `{"token": "<token>", "password": "<password>"}`: one JSON object
of at most 4 KiB.

- `200` `{"ok": true, "firstName": "<first name>", "login": "<login>"}` and
  the session cookie. The password is replaced, every other session of that
  login is closed, the link is spent. `login` is what the sign-in door will ask
  for: the set-password page shows it («Пароль сохранён. Логин: …») before it
  goes on, because nothing else ever tells a founder their login. It is told
  to the holder of a link that worked, and to nobody else: every other answer
  of this door is silent about whose link it was.
- `404 invalid_link` — an unknown, a used, a replaced and an expired token
  answer alike. The link is judged before the password.
- `400 weak_password`, with `min: 12` — shorter than 12 characters, longer than
  256, or containing the login, the first name or a word of the deny-list. The
  link is not spent and the attempt is not counted.
- `429 too_many_attempts`, with `retryAfter` and `Retry-After` — after 10
  failures from one client address within 15 minutes. Only a link that does
  not work is a failure.
- `503 busy`, `503 auth_damaged`, `507 storage_failed` — as for the sign-in
  door.

A valid link does not pass the per-login limit of the sign-in door: it is the
way out of a lock-out.

### POST /api/auth/logout

The body is `{}`; an empty body (`Content-Length: 0`) is taken as well.

- `200` `{"ok": true}`. The session is deleted, the cookie cleared, and the
  answer carries `Clear-Site-Data: "cache"`.
- It needs no session: signing out with a session that has already ended is
  still signing out.
- `507 storage_failed` — the disk refused to forget the session; `503 busy`
  with `Retry-After: 2` — the lock of the sessions file stayed taken. Either
  way the answer still clears the cookie and carries `Clear-Site-Data`: **this
  browser is signed out, and the session is still open on the server** until
  it runs out or is closed there (`ctl sessions logout`). Whoever holds a copy
  of that cookie could go on using it; the page says so instead of "nothing
  changed". (A refusal that comes from before the door — for want of a
  signed-out slot, say — clears nothing and closes nothing.)

### GET /logout

`302` to `/login`, where the «Выйти» button is. It changes nothing by itself.

### POST /api/auth/password

A signed-in person chooses a new password. The body is
`{"current": "<the password now>", "password": "<the new one>"}`.

- `200` `{"ok": true}` and the session cookie. The password is replaced, every
  session of that login is closed — the one that asked included — and a new
  one is opened for this browser.
- `403 wrong_password` — `current` is absent, not a string, or not the
  password. It is counted: for the address in the sign-in door's own count,
  for the login in a count of its own (30 in 15 minutes as well). So a session
  somebody walked away from is not a way to guess the password without a
  limit, and a stranger who keeps failing to sign in as somebody cannot shut
  this door for the person it belongs to. `403` and not `401`: the page reads
  `401` as "the sign-in has ended".
- `400 weak_password`, with `min: 12` — the rules of the set-password door.
  Nothing is changed.
- `429 too_many_attempts`, with `retryAfter` and `Retry-After`.
- `503 password_changed` — the new password is stored, and with it every
  sign-in of the login is void, but no new sign-in could be written for this
  browser (the disk refused the sessions file, or its lock stayed taken). It
  is not "nothing happened": the person signs in again, with the new password.
- `401 unauthenticated`.

A disk that refuses the write of the password itself and a lock that stays
taken answer as they do at the sign-in door, and then nothing was changed.

## The page and its files

### GET / and GET /index.html

- `200` — `index.html` exactly as it is in the repository; nothing is injected.
  `Cache-Control: no-cache`, `Last-Modified`, `Vary: Cookie`, and the page's
  own `Content-Security-Policy`.
- `304` on a matching `If-Modified-Since`.
- `302` to `/login` — no session, or a session in its last 24 hours.

`Last-Modified` — here, for the vendor files and for the two assets — is the
moment this process read its files, which is its start. `304` is answered only
to exactly that `If-Modified-Since`: a file can only change with a restart, so
a browser is never left with the page of an earlier deploy.

### GET /money/vendor/…

Three exact names: `pdf.min.js`, `pdf.worker.min.js`, `xlsx.full.min.js`.

- `200`, `text/javascript`, `Cache-Control: no-cache`; `304` on a matching
  `If-Modified-Since`.
- `401 unauthenticated` without a session.

### GET /assets/auth.js and GET /assets/auth.css

The script and the stylesheet of Money's own pages. `200`, `no-cache`, no
session needed. Exact paths only.

### GET /data

`200`, HTML, `no-store`: download of each document as a file, upload of a
document from a file, and the last 50 entries of the security log. Documents
move through the four document doors below; `/data` adds no door for them.

The page is sent in one of three states, by the role of the one who asks
(`data-state` on `<body>`; what belongs to another state carries `hidden`): a
reader gets the two downloads and nothing else — the upload would be refused
by the document doors anyway; an editor gets the uploads too; the security log
is the owner's alone, and its entries are not in the markup sent to anybody
else.

- **«Скачать выписки» / «Скачать план»** save the **bare document**: the text
  between the head and the tail of the door's answer, cut out as it stands —
  not the `{rev, doc, updatedAt}` answer around it. Either file goes back in
  through the upload below; the ledger file is also what the page's own
  «Загрузить данные из файла» reads, on a stand and in the laptop tool alike
  (that import takes a ledger only: it refuses a file without a `tx` list, so
  a plan goes back through `/data`). The file is named
  `money-ledger-YYYY-MM-DD.json` or `money-plan-YYYY-MM-DD.json`, by the day
  on the founder's own clock. Nothing is saved unless the door answered `200`
  with a document that has been saved before.
- **An upload** accepts a bare document as well as a saved
  `{rev, doc, updatedAt}` answer, shows what the file and the server hold, and
  asks before it replaces. On «Заменить» the page first saves what the server
  holds at that moment as `money-ledger-before-replace-YYYY-MM-DD.json` (or
  `money-plan-…`), and only then sends the file — a save by itself keeps what
  it replaces only on the day's first save or when most rows go. If that copy
  cannot be had, or the server has moved on since the question was asked,
  nothing is replaced. On the test stand the upload control is not drawn.

### The platform's old links

`GET /tracker/board`, `/dashboard`, `/money/` and `/money/index.html` answer
`302` to `/` for a signed-in founder. They are the only platform addresses the
page can still send a founder to.

## Who am I

### GET /api/me

- `200` `{"id", "name", "firstName", "isFounderTier": true, "role", "canWrite", "canManage", "stand", "version"}`.
  `id` is the login. `firstName` is the name the owner gave the person, or the
  one `MONEY_FOUNDERS` gives the login; the page signs a change to the plan
  with it. `role` is `"owner"`, `"editor"` or `"reader"`; `canWrite` says
  whether the document doors take a save from this person, `canManage` whether
  the doors under `/api/people` answer them. The page draws nothing that
  changes anything for a person who cannot write.
- `401 unauthenticated`.

## The exchange rates

### GET /api/rates

- `200` `{"base": "GBP", "days": {"<YYYY-MM-DD>": {"USD", "EUR", "RUB", "AMD"}}, "asked"}`,
  `Cache-Control: no-store`. `days` is what one pound cost on each day the
  table holds, from 1 October 2026 on; a day that is in it never changes.
  `asked` is the moment the source was last asked, in UTC, or `null`. For
  anybody who is signed in: a reader counts by the same rates.
- `401 unauthenticated`.

The table is filled by the server, from one open source that takes no key
(`moneyd/rates.py`): a day's rates are asked once, checked - the day named,
four numbers, each within the bounds a rate could have and near the days
beside it - and kept. Nothing asks on a timer. This door is what begins a
refresh, when the table lacks a day and the source was last asked more than
half an hour ago; it waits for that refresh 2.5 seconds at most and answers
with what it has - the whole table, when the source answers in that time. So a
source that is slow, away or wrong never holds a page:
the page then counts by the latest day it was given, or - where the table is
empty, as on a dev stand, which asks nobody - by the rates typed into it.

The page asks when it opens, and once more - by somebody's own act - before
it reads a statement whose days its copy of the table does not hold. It counts
what has already happened - a payment in a statement, a row marked paid - at
the rate of that day, and only what is still ahead, and what the accounts hold
today, at the latest.

## Who may do what

The first login `MONEY_FOUNDERS` names is the stand's **owner**. Everybody
else is a **reader** until the owner says otherwise, and may be made an
**editor**:

| | owner | editor | reader |
|---|---|---|---|
| reads both documents | yes | yes | yes |
| saves them | yes | yes | no |
| changes their own password, signs out | yes | yes | yes |
| adds people, issues their links, disables them, says what each may do | yes | no | no |
| reads the security log on `/data` | yes | no | no |

The role is read from the accounts file at every request: what the owner
changes holds from the next request of the person it is about, on a page they
have open as well. Nothing here is a matter of what the page draws — a door
judges for itself.

### GET /api/people

- `200` `{"people": [{"login", "name", "role", "me", "hasPassword", "passwordSetAt", "disabled", "linkExpires", "added", "lastSeen"}], "max"}`.
  Everybody who can be signed in, the logins of `MONEY_FOUNDERS` first, then
  the people the owner added, in that order. `me` marks the one who asks.
  `linkExpires` is the end of a pending one-time link, `lastSeen` the latest
  use of a sign-in of that login that is still open; both `null` when there is
  none. `added` is true for a login the page added. `max` is how many accounts
  a stand holds. Never a hash, a token or a link.
- `403 not_owner` — anybody but the owner.
- `401 unauthenticated`.

### POST /api/people

The owner adds a person. The body is `{"login": "<login>", "name": "<first name>"}`:
a login of lower-case letters, digits, dot, dash or underscore that starts
with a letter, 32 characters at most; a name of 1 to 40 characters. The new
account has no password and only looks; its link is issued by the door below.

- `200` — the list, as `GET /api/people` answers it.
- `400 bad_person`, with `reason` (`"login"` or `"name"`).
- `409 login_taken` — somebody has that login, or had it: a login is never
  handed to a second person.
- `409 too_many_people` — the stand holds as many accounts as it is built for.
- `403 not_owner`.
- `401 unauthenticated`.

### POST /api/people/update

The body names a login and what changes:
`{"login": "<login>", "name": "<first name>", "role": "reader" | "editor", "disabled": true | false}`
— any of the last three, at least one. Disabling closes the login's sessions
and retires its pending link; a role holds from that person's next request.

- `200` — the list, as `GET /api/people` answers it.
- `400 bad_person`, with `reason`: `"name"`, `"role"`, or `"nothing"` when the
  body names nothing to change.
- `404 unknown_login`.
- `409 owner_fixed` — a role or the switch, for the owner's own login: nobody
  could undo it from the page.
- `403 not_owner`.
- `401 unauthenticated`.

### POST /api/people/link

A one-time link for somebody, shown to the owner once. The body is
`{"login": "<whose link>", "password": "<the owner's own password>"}`: the
password is asked for again, because a link signs its holder in and sets their
password — a session somebody walked away from must not be enough to make one.

- `200` `{"login", "link", "expires"}`. `link` is the whole address, with the
  token in its fragment; it works once, until `expires`, and retires the link
  issued for that login before it. It is in this answer and nowhere else: the
  server keeps its sha256.
- `403 wrong_password` — counted, as at `POST /api/auth/password`.
- `429 too_many_attempts`, with `retryAfter` and `Retry-After`.
- `404 unknown_login`.
- `409 login_disabled` — enable the login first.
- `409 owner_fixed` — the owner's own login: the owner changes their password
  at its own door, and a way back in for an owner who has lost it is made on
  the server.
- `403 not_owner`.
- `401 unauthenticated`.

## The two documents

The ledger at `/api/founder/money` and the cash plan at
`/api/founder/money/cash` are two documents with one contract. Each has its own
revision; saving one never touches the other.

### GET

- `200` exactly `{"rev": N, "doc": {…}, "updatedAt": "<UTC time>"}`,
  `Cache-Control: no-store`. `doc` is the document as it was last saved, text
  for text: fields the server has never heard of come back untouched.
  `updatedAt` is the moment of the last save in UTC, to the millisecond, in
  JavaScript's own form: `2026-10-07T14:03:22.123Z`.
- Before the first save: `{"rev": 0, "doc": {}, "updatedAt": null}`.
- `401 unauthenticated`.
- `503 storage_damaged` — the stored file is truncated, unparseable or missing
  its envelope; or it is missing although the document has been saved before,
  although copies of it lie among the snapshots, or because its whole
  directory has gone from a stand that has run. A damaged or a lost document is
  never answered as revision 0, and nothing makes it anew.

### PUT

The body is `{"base": N, "doc": "<the document, as a string of JSON>"}`.

- `base` is the revision the page read the document at: a whole number, 0 or
  more. JSON has one kind of number, so `3` and `3.0` are the same revision, as
  they are to the platform; `true`, `"3"`, `null`, `-1` and `2.5` are refused.
- `doc` is a **string** that holds JSON, not an object. The ledger must be a
  JSON object with a `tx` array; the plan a JSON object with a `banks` array.
  Nothing else in it is read.
- Limits: 16 MiB for the ledger, 4 MiB for the plan.

Answers:

- `200` `{"rev": <the new revision>}`. It is `base + 1` — except after the
  server was told, with `ctl floor`, that pages may hold higher numbers than
  the stored one (a stand put back from a backup; the cut-over): then the save
  lands above that floor. Revisions only ever grow, and the page takes the
  number from this answer.
- `400 bad_money_doc` — `base` is missing or is not a whole number of 0 or
  more; `doc` is missing or is sent as an object instead of a string; `doc` is
  not JSON, holds `NaN` or `Infinity`, is nested deeper than 64 levels, or
  cannot be stored as UTF-8; `doc` is not a JSON object; a ledger without a
  `tx` array; a plan without a `banks` array.
- `401 unauthenticated`.
- `403 bad_origin`.
- `403 read_only` — the one who asks is a reader. Said before a byte of the
  body is read.
- `409` `{"error": "money_stale", "message": …, "rev": <the stored revision>}` —
  somebody saved after this copy was read. Nothing is written.
- `411 length_required`, `413 body_too_large`, `415 bad_content_type`.
- `503 storage_damaged` — as for GET. Nothing is written over a damaged file.
- `503 storage_busy` — the document's lock could not be had in time; nothing
  was written, and the same save may be sent again.
- `507 storage_failed` — free space is not above three times the document plus
  64 MB, or the disk refused the write. What was stored is untouched. (A save
  that is in place, though the disk could not confirm it will survive a power
  cut, is answered `200`: every reader gets it from then on.)

The checks run in this order. Before the body is read: the session, the
cross-site rules, the role, the type, the length, and room on the disk for the announced
length (`507`) — so on a disk that is short every save is told so, a stale or a
malformed one included. Then, inside the door, the platform's own order: the
shape of `base` and `doc` (`400`), the size of the document (`413`), the state
of the stored file (`503 storage_damaged`), the revision (`409`), the free
space for the document itself (`507`).

What a save keeps of the state it replaces: before a document that has been
saved before is overwritten, the stored one is copied aside — as a day copy
when none has been made yet on that UTC day, otherwise as a before-shrink copy
when it has more than 20 rows and the new one has fewer than half as many
(rows of the ledger: `tx`; rows of the plan: `banks`, `inflows`, `team`,
`taxes` and `other` together). There is no door to these copies; they are
restored on the server (`docs/deploy.md`).

### How the page reads these answers

- `409` — «данные изменились в другом окне — обновите страницу»; the page
  stops saving until it is reloaded.
- `403 read_only` — the owner has made this person a reader while their page
  stood open. The page says «Теперь у вас только просмотр: сохранить нельзя»,
  becomes a reader's page — nothing on it changes anything any more — and
  sends no further save. (A page that knew from `/api/me` that its person only
  looks never sent one.)
- `401`, or any other `403` — «вход закончился — войдите заново и обновите
  страницу»; the page stops saving, and what is typed afterwards is lost. This
  is why a session in its last day is sent to sign in again before the page
  opens.
- any other refusal — «не сохранено — проверьте связь». That includes `413`,
  so a ledger near its limit would be told to check the connection.

### Where this differs from the platform's doors

The semantics follow the platform's route file
(`apps/api/src/routes/founder/money.ts` in `mkodzya/selfops`), with these
differences:

- the plan may be up to 4 MiB (the platform: 1 MiB);
- before the first save `updatedAt` is `null` (the platform answers the moment
  its migration ran);
- `503 storage_damaged` and `507 storage_failed` exist here only;
- a caller is somebody the stand knows or nobody: there is no
  `403 founder_tier_required`. Who may save is the stand's own matter
  (`403 read_only`, above).

## Headers on every answer

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

and a `Content-Security-Policy` that depends on the kind of answer; the four
policies are written out in `docs/security.md`. JSON and the sign-in pages are
`Cache-Control: no-store`; the page, the vendor files and the two assets are
`no-cache`. `Strict-Transport-Security` and `X-Robots-Tag` are added by the
edge, not by `moneyd`.

## What has no door

- Snapshots and their restore: `ctl snapshots`, `ctl restore`, on the server.
- The owner's own way back in: a link for the owner is issued on the server
  only (`money-user`; `ctl user invite` prints the login on a line of its own
  above the link). `ctl user retire-links` ends every pending link after a
  whole stand was put back from a backup. Closing somebody's sessions without
  disabling them: `ctl sessions`, on the server.
- Lifting the revisions above what open pages may hold: `ctl floor`, on the
  server.
- Seeding: `ctl seed`, test and dev only.
