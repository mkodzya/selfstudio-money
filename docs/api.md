# Money — the HTTP contract

What the hosted service (`moneyd`) answers, door by door. The laptop tool
(`server.py`) speaks a different, older contract and is not described here.

The only client that matters is the page, `index.html`, and it is frozen: it
already speaks these doors, so they are not free to change. On a host name that
begins with `finance.` the page reads and saves the ledger at
`/api/founder/money`, the cash plan at `/api/founder/money/cash`, asks
`/api/me` for the founder's first name, and loads its Excel and PDF readers
from `/money/vendor/`. Everything else in this document exists so that a person
can sign in, sign out and move a document as a file.

`tests/test_routes_doc.py` holds the table under "Routes" to the server's route
table, and pins the list under "Paths that answer without a session". A route
is added, removed or opened only together with its line here.

**State on 7 October 2026.** This document was written from the build
specification and checked against the modules below the HTTP layer — storage,
sign-in, the limiter, their error codes and limits. The HTTP module itself
(`moneyd/httpd.py`) did not exist yet. Where it and this document disagree,
one of the two is wrong, and the test above is what says so.

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
  is echoed. The one exception is the bare `503` the server writes when it has
  no thread to give.
- **Status without a code.** A few refusals of the HTTP layer itself have a
  status fixed by the build specification and no code: `421`, the `400` for a
  `Transfer-Encoding` header or for a body that is not JSON, `405`, and the
  `503` of a server with no slot free. They are named here by status only.
- **A fault of the server's own** is `500` with `{"error": "internal"}` and a
  request id; the detail is in the server's log and never in the answer.
- **No CORS.** `OPTIONS` answers `405`, and no `Access-Control-*` header exists
  anywhere.

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
| GET | /tracker/board | yes | | 302 to / |
| GET | /dashboard | yes | | 302 to / |
| GET | /money/ | yes | | 302 to / |
| GET | /money/index.html | yes | | 302 to / |

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
  `401` as well. Any other path answers `302` to `/login`.
- **Signed in**: a path that is not in the table answers `404 not_found`.
- A method the server does not serve at all answers `405`.

## What every request passes first

Before any door does its own work. **None of a request's body is read until
everything in the first list has passed.**

Before the body:

- **A free thread.** 32 connection threads in all; with none free the server
  writes a bare `503` and closes. At most 12 concurrent connections per client
  address.
- **`Host`** must equal the host of the stand's public URL, letter case aside.
  Otherwise `421`.
- **`Transfer-Encoding`** on a request is refused: `400`.
- **The session**, where the table says "yes". A request without a valid
  session must also take one of 8 signed-out slots, or it gets `503` at once;
  signed-in requests never wait behind signed-out ones. While the accounts file
  cannot be read, a door that needs a session answers `503 auth_damaged` and
  not `401`: a page that is told `401` stops saving.
- **Cross-site rules**, on every `/api/` path. Each refusal is
  `403 bad_origin`:
  - `Sec-Fetch-Site`, when the browser sends it, must be `same-origin`, or
    `none` for a GET typed into the address bar. `same-site` and `cross-site`
    are refused;
  - anything but GET and HEAD must carry `Origin` equal to the stand's public
    URL, character for character;
  - a GET that does carry an `Origin` must carry the right one.
- **`Content-Type`** of anything with a body must be `application/json` (a
  `charset` parameter is fine): `415 bad_content_type`.
- **`Content-Length`** must be present and numeric: `411 length_required`. Over
  the door's limit the request is refused unread: `413 body_too_large`.

The body:

- **A deadline**, total and not per read: 5 seconds for the three `/api/auth/`
  doors; `20 s + 1 s per 50 000 bytes of Content-Length` for a document (about
  a minute for a ledger of 2 MB). A body that misses it has its connection
  closed without an answer.
- **The JSON itself.** A body that is not JSON, or is nested deeper than 16
  levels, answers `400`. It never ends the process.

The client address used for limits and logs is the peer's, unless the peer is
inside `MONEY_TRUSTED_PROXIES`; then it is the right-most entry of
`X-Forwarded-For`. `X-Forwarded-Proto` is never consulted.

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

- no session — the sign-in form;
- a session that may still open the page — «Вы вошли как {firstName}», a link
  «Открыть Money» to `/`, and a button «Выйти»;
- a session in its last 24 hours — the form, with the line «Вход скоро
  закончится — войдите заново».

The page loads `/assets/auth.js` and `/assets/auth.css` and has no inline
script.

### POST /api/auth/login

The login and the password, as one JSON object of at most 4 KiB.

- `200` `{"ok": true, "firstName": "<first name>"}` and the session cookie. A
  fresh session is always issued; the one the browser presented, if any, is
  deleted.
- `400 missing_credentials` — the login or the password is absent.
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

### POST /api/auth/setup

The token and the new password, as one JSON object of at most 4 KiB.

- `200` `{"ok": true, "firstName": "<first name>"}` and the session cookie. The
  password is replaced, every other session of that login is closed, the link
  is spent.
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

- `200` `{"ok": true}`. The session is deleted, the cookie cleared, and the
  answer carries `Clear-Site-Data: "cache"`.
- It needs no session: signing out with a session that has already ended is
  still signing out.

### GET /logout

`302` to `/login`, where the «Выйти» button is. It changes nothing by itself.

## The page and its files

### GET / and GET /index.html

- `200` — `index.html` exactly as it is in the repository; nothing is injected.
  `Cache-Control: no-cache`, `Last-Modified`, `Vary: Cookie`, and the page's
  own `Content-Security-Policy`.
- `304` on a matching `If-Modified-Since`.
- `302` to `/login` — no session, or a session in its last 24 hours.

### GET /money/vendor/…

Three exact names: `pdf.min.js`, `pdf.worker.min.js`, `xlsx.full.min.js`.

- `200`, `text/javascript`, `Cache-Control: no-cache`; `304` on a matching
  `If-Modified-Since`.
- `401` without a session.

### GET /assets/auth.js and GET /assets/auth.css

The script and the stylesheet of Money's own pages. `200`, `no-cache`, no
session needed. Exact paths only.

### GET /data

`200`, HTML, `no-store`: download of each document as a file, upload of a
document from a file, and the last 50 entries of the security log. Documents
move through the four document doors below; `/data` adds no door for them. An
upload accepts a bare document as well as a saved `{rev, doc, updatedAt}`
answer. On the test stand the upload control is not drawn.

### The platform's old links

`GET /tracker/board`, `/dashboard`, `/money/` and `/money/index.html` answer
`302` to `/` for a signed-in founder. They are the only platform addresses the
frozen page can still send a founder to.

## Who am I

### GET /api/me

- `200` `{"id", "name", "firstName", "isFounderTier": true, "stand", "version"}`.
  The page reads `firstName` only, to sign a change to the plan. `firstName` is
  the name given for the login in `MONEY_FOUNDERS`.
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
  its envelope, or it is missing although the document has been saved before.
  A damaged document is never answered as revision 0.

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

- `200` `{"rev": N + 1}`.
- `400 bad_money_doc` — `base` is missing or is not a whole number of 0 or
  more; `doc` is missing or is sent as an object instead of a string; `doc` is
  not JSON, holds `NaN` or `Infinity`, is nested deeper than 64 levels, or
  cannot be stored as UTF-8; `doc` is not a JSON object; a ledger without a
  `tx` array; a plan without a `banks` array.
- `401 unauthenticated`.
- `403 bad_origin`.
- `409` `{"error": "money_stale", "message": …, "rev": <the stored revision>}` —
  somebody saved after this copy was read. Nothing is written.
- `411 length_required`, `413 body_too_large`, `415 bad_content_type`.
- `503 storage_damaged` — as for GET. Nothing is written over a damaged file.
- `503 storage_busy` — the document's lock could not be had in time; nothing
  was written, and the same save may be sent again.
- `507 storage_failed` — free space is not above three times the document plus
  64 MB, or the disk refused the write. What was stored is untouched.

Inside the door the checks run in this order, the platform's own: the shape of
`base` and `doc` (`400`), the size of the document (`413`), the state of the
stored file (`503 storage_damaged`), the revision (`409`), the free space
(`507`).

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
- `401` or `403` — «вход закончился — войдите заново и обновите страницу»; the
  page stops saving, and what is typed afterwards is lost. This is why a
  session in its last day is sent to sign in again before the page opens.
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
- a caller is one of the three founders or nobody: there is no
  `403 founder_tier_required`.

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
- Accounts and one-time links: `money-user`, on the server. Closing somebody's
  sessions: `ctl sessions`, on the server.
- Seeding: `ctl seed`, test and dev only.
