#!/usr/bin/env node
// Money's forecast, checked in a real browser.
//
// Money (apps/web/public/money/index.html) is one static page; everything it
// knows about the weeks ahead comes out of one pure function inside it,
// Live.compute(ledger, plan, T, opts). This file is that function's acceptance
// test: the fixtures of the design run through window.__money.compute, and
// after every one of them the invariants of §5 — the rules that keep a pound
// from being counted twice. A tap, in these checks, is made by the page's own
// hands (window.__money.write) on a copy of the plan, so what a check hands to
// the engine is what the screen would have written.
//
// And it is the test of the screens that draw that model and edit the plan:
// the checks named «… on screen» load the page on a fixture, press what a
// founder would press, and hold every figure the screen shows (each carries
// data-live and data-v) against the model — and the model against §5 — after
// every press. «Касса» has its own: a row typed into where it stands
// («typing», «empty amount»), «каждый месяц» in every place («repeat»), the
// hand mark («mark»), the one way in for the old planner's plan («old plan»),
// the plan's own save («saving», «clash», «refused»), and how the tab looks on
// a phone and on a desk («phone», «looks»).
//
// Why a browser when the function is pure: it lives in the page, between the
// page's own helpers, and there is no build step that could hand it to node.
// So the page is served from here, by a server of a dozen lines that also
// plays the two documents of the founder API (revision, base, 409), and the
// function is called where it runs for the founders.
//
//   docker run --rm -v "$PWD/scripts":/app/scripts \
//     -v "$PWD/apps/web/public":/app/pub -w /app selfops-checks \
//     node scripts/money-checks.mjs
//
// `-e ONLY=p8` or `-e ONLY=late` narrows a run to the checks whose key or
// name matches. `-e SHOTS=/app/shots` (with a folder mounted there) also saves
// full-page pictures of «Сегодня» and «Касса» in their main states, for
// looking at.
//
// TWO ITERATIONS, TWO DESIGNS. The first (live-spec) forecast regular clients,
// people and subscriptions from history, averaged what was not regular, and
// drew a cautious line beside the expected one. The second (live-spec-2, the
// founder's decisions of 7 October) took all of that out: the forecast is
// exactly the rows a founder wrote — one-off rows and rows marked «каждый
// месяц» — and the studio's taxes are worked out by rules. So the checks are
// in two families:
//  · «p1» … «p16» are §7 of the second design, on its fixture P, test by test
//    under its own number («p15», the shell, is with the screens);
//  · «w1» … «w26» are what §7 of the FIRST design said of written rows — a
//    hand mark, a typed balance, a row closed by a statement, a part, a fee,
//    lateness — on its fixture A with the three lines history used to give it
//    written down as rows that repeat. Every figure the design gave for them
//    stands.
//
// WHAT WENT WITH THE HISTORY, AND WHAT STANDS IN ITS PLACE. Each of these
// checked a rule that no longer exists; none was kept switched off.
//  · 1, 2, 3 (fixture A forecast from history; its month) → «w1»: the same line
//    from rows that repeat; «p1»–«p3» for the second design's own figures.
//  · 8, «8 on screen» (a typed row taken out of its client's forecast, «это
//    сверх обычного») → gone with D4: a one-off row adds to a repeating one
//    («w17»); R1 keeps a month from being counted twice («p5»).
//  · 15, 19 (history that did not come true; a client goes quiet; «Жду до…»,
//    «В этом месяце не будет», «Больше не ждём», «Понятно») → «p6», «p7»: a
//    month of a repeating row that nobody paid is `missed`, a client who
//    stops is `doubt`.
//  · 16 (VAT by the rule, a typed VAT row beside it) → «p8», «p9», «p16».
//  · 18, «regular», «parts» (cycles, what is regular, a month paid in parts by
//    a forecast's rule) → C1–C5 now feed only the helper («p2», «p12»,
//    «edges»), and a month is paid by its label («p6»).
//  · 20, «20 on screen», 21, «average», «typed ahead», «midnight», «made» (the
//    averages of what is not regular) → nothing is averaged; that nothing
//    moves at midnight on the 1st is in «p5».
//  · «monthly» (plan.ser, «каждый месяц» as a series beside the rows) → «p5»:
//    the repeat lives on the row.
//  · «cautious» (the second line, its switch) → no second scenario exists; §5
//    asserts that no key of it is left in any model.
//  · «one press», «one press, reviewed» (a forecast written down by the press
//    that marked it; the cycle a marked forecast claims) → «w4» and «p-taps»:
//    a month of a repeating row is marked where it stands, in rec.x, and has
//    first claim on the payment that then shows it.
//  · «taps» §5.11 (a typed row inside an average) → «p-taps» keeps §5.2.
//
// THE SCREENS OF THE SECOND DESIGN have their own checks, each through the
// controls a founder presses: «p1 on screen» (day one, the two questions about
// a tax, the helper — tests 1 and 2), «p4 on screen» (a written withdrawal —
// test 4), «p5 on screen» («только этот месяц» and «и дальше» — test 5),
// «repeat» («каждый месяц» on every kind of row in every place a row stands),
// «p9 on screen» (a typed tax row and «К чему относится», cards 11, 12 and 14 —
// tests 9 and 16), «tax cards» (cards 13 and 15), «tax settings» (the rules, the clients' marks, how old the
// balances may be, a thin plan), «partly» («оплачено» means paid, «частично» is
// its own answer — with «partly, other days» and «partly, from before», see
// below), «advice» (the advice and «Автоплан» on rows that repeat),
// «phone» (375 and 390 wide) and «looks» (the pictures, with SHOTS). After every press each figure on the screen is held against the
// model, the model against §5, and both tabs against three rules of their
// own: no «≈» anywhere, no word of history, an average or a cautious
// scenario, and no founder named as a kind of money.
//
// THE REVIEW OF THE SECOND ITERATION left its own checks, each of which failed
// on the build that was reviewed. In the model: «rv-thin» (a paid line is
// still a cost of its slice), «rv-inbox» (an unsorted receipt is not counted
// twice in «Можно вывести»), «rv-rows» (an ended repeat, a month with its
// payment already filed, a rate, a deleted rule, a tax row renamed after a
// founder), and cases added to «marks» (a payout of the balance's own day),
// «p8» (a payment made before the mark), «p12» (the upgrade beside another
// row of the same name; «+ VAT» with the rule off), «verdicts» (when «Разбор»
// is the sentence) and «p2» (the helper skips no month). On screen:
// «rv-save» (what is decided survives a reload — `carry` and the day of the
// rest, `fresh`, every field), «rv-day», «rv-ended», «rv-helper», «rv-tax»,
// «rv-small».
//
// THE FOUNDER'S DECISION OF 7 OCTOBER — «оплачено» means paid, «частично» is its
// own answer — arrived after the second design was written and outranks its
// R7.4, E6 and T9. So where that design's tests say «Ещё должны», `keep`,
// "unseen" or «Всё верно», the checks here («w6», «p6», «p8», «marks»,
// «partly») hold what was decided instead: a marked line stays closed, and a
// debt remains only where a founder says «Частично».
//
// HIS SECOND DECISION OF THAT DAY — «при выборе Частично, пусть лучше не на
// следующий месяц уходит, а я сам выбираю дату оплаты остатка, как при
// переносе» — replaced the end of the first, not its beginning: the rest no
// longer goes to the next month without a date, counted from the 1st; the
// question «Частично…» asks for its day, and the rest is a dated row. Held in
// the model by «dated rest» (what is written; the day it stands on — the same
// month, the next, two months on, past the days in view; money coming in; a
// rest of a rest) and «rest and month» (whose a payment is that fits both the
// rest and its label's own month; the tick and the helper do not take a rest
// for the month's own row). On screen by «partly» (the question and its three
// refusals, the three tabs, «Отменить»), «partly, other days» (the same month;
// a second «Частично» two months on, answered with Enter; an inflow from its
// card of «Нужно решить»; «Повторять каждый месяц» beside a rest), «partly,
// from before» (a plan that still holds a rest WITHOUT a date reads exactly
// as it did), «rv-save» (saved and opened again), «phone» and «looks». Each of
// these fails on the page as it stood before that decision. What
// Live.write.partial writes when it is given no day is unchanged — «p6»,
// «rv-thin» and «marks» call it so, as before: that is the form a stored plan
// from before holds.
//
// THE REVIEW OF THAT CHANGE left its own, each of which failed on the page it
// reviewed. In the model: «part shown» — the row that then shows the part
// said with «Частично» is the marked line's own; dealt out with the others it
// closed the REST of that very line, or paid the label's next month, and what
// was still owed stood in no figure — and a case in «dated rest» (a rest a
// founder made «каждый месяц» is a rest still). On screen, in «partly»: the
// card's own «Только ноябрь», and Enter in a field of the row, answer the
// question that stands open instead of closing the card over it; «Частично…»
// pressed twice keeps what was typed; a day of another year is said with its
// year. In «partly, other days»: an inflow is refused in an inflow's words;
// and where the row itself was changed too, the toast says the answer was not
// taken.
// And four that only close a gap in what was held, and pass before and after:
// the two cases of «rest and month» that hold rule 5 for money coming in and
// against a payment of the rest's own size; today as a day the rest may stand
// on («partly»); a row typed under a rest's own name («partly, other days»);
// the question inside the table of «Касса» («looks»).
//
// OF THE FIRST ITERATION'S SCREEN CHECKS, these were written again for rows
// that repeat: «saving», «refused», «old plan», «typing», «empty amount»,
// «odd ledger», and «earlier months» (what «small words» said of a month gone
// by). NOT BROUGHT ALONG: «constructor» and «kassa looks» (held now by
// «repeat», «phone» and «looks»), «days» (its day lists are in «repeat» and
// «mark», its advice and «Автоплан» in «advice»; the calendar is not walked),
// «word», «today marks», «early» and the rest of «small words».
//
// HOW THE DESIGNS' FIXTURES WERE ADAPTED. Both designs read a balance off a
// statement; the page has only the balance a founder types, and a bank's
// statements "reach" the date of its newest row. So:
//  · «statement, balance 10,000, thru 5 Oct» is here a typed balance as of
//    30 Sep, the statement's rows after it, and one row of nothing dated
//    5 Oct on that bank (`reach`), which is what "reaches 5 Oct" means now.
//  · The designs' names are kept — Client A, Person B — and each ledger also
//    knows a Client Z and a Person Z from 2025. Without them the rule that
//    links a typed name to "the only label with the same first word" takes
//    every «Person …» for Person B, which no real ledger would do.
//  · «tap, then upload the statement» is a mark whose `at` is earlier than
//    the `at` of the statement's rows: the engine lets a row take a mark's
//    place only if it was uploaded after the mark was made.
//  · A date the second design leaves open is chosen and said in the check.
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { demoLedger, demoPlan } from './money-demo.mjs';

const PUB = process.env.PUB || '/app/pub';
const PORT = 8097;
const BASE = `http://localhost:${PORT}`;
const ONLY = (process.env.ONLY || '').toLowerCase();

// ---- saying what happened ----
let n = 0;
let failed = 0;
const ok = (cond, msg, got) => {
  n++;
  console.log((cond ? 'ok    ' : 'FAIL  ') + msg + (cond || got === undefined ? '' : '\n        got: ' + JSON.stringify(got)));
  if (!cond) failed++;
  return cond;
};
// Two things are the same if they say the same, whatever order an object's keys were written in.
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));
const same = (a, b, msg) => ok(canon(a) === canon(b), msg, a);
const close = (a, b, tol = 0.005) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol + 1e-9;
// Figures of the model against the design's, to the penny. `free` is «Можно вывести» today, `res` «под налоги сейчас».
const figs = (M, want, msg) => {
  const got = {};
  let good = true;
  for (const [k, v] of Object.entries(want)) {
    const g = k === 'verdict' ? M.verdict.id : k === 'free' ? M.free && M.free.now : k === 'res' ? M.taxes.reserve : M[k];
    got[k] = g;
    if (typeof v === 'number' ? !close(g, v) : g !== v) good = false;
  }
  return ok(good, msg + ' — ' + Object.entries(want).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toLocaleString('en-GB') : v}`).join(' · '), got);
};
const sum = (list) => list.reduce((a, v) => a + v, 0);

// ---- dates and moments the fixtures name ----
const pad = (v) => String(v).padStart(2, '0');
const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

// ---- made-up rows, plans and the two fixtures ----
// A row of the old sheet has a block, a name and pounds; a statement row that has been filed carries what the bank
// said, signed, in its currency, and when it was uploaded; the same row still in «Разбор» is recognised (a block, a
// name, `auto`) or not. `reach` is «the statements of this bank reach this day»: a row of nothing.
const T = '2026-10-06';
const FX = { USD: 1.35, EUR: 1.17, RUB: 118, AMD: 525 };
const ms = (iso) => Date.parse(iso);
const AT1 = ms('2026-10-05T09:00:00Z');
const C0 = ms('2026-10-06T08:00:00Z');
const AT2 = ms('2026-10-06T10:00:00Z');
const TAP = ms('2026-10-06T11:00:00Z');
const AT3 = ms('2026-10-06T13:00:00Z');
const round2 = (v) => Math.round(v * 100) / 100;
const sheet = (id, d, a, c, l, more = {}) => ({ id, d, a, c, b: 'Wise', l, v: 0, s: 'sheet', key: 'k|' + id, ...more });
const filed = (id, d, amt, c, l, more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, v = 0 } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  const forward = c === 'skip' || Math.sign(amt) === (c === 'rev' ? 1 : -1);
  return { id, d, a: forward ? g : -g, c, b, l, v, s: 'file', o: { a: amt, cur, t: l }, key: 'k|' + id, at };
};
const inbox = (id, d, amt, c, l, more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, auto = !!c } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  return { id, f: 'file', d, b, ac: '', dir: amt > 0 ? 1 : -1, a: g, o: { a: amt, cur, t: l || 'unknown', p: '', h: '', fix: true }, key: 'k|' + id, s: 'file', c, l, v: 0, auto, twin: null, at };
};
const reach = (b, d, cur = 'GBP', at = AT1) => filed(`reach-${b}-${d}`, d, 0, 'skip', '', { b, cur, at });
const ledger = (tx, inb = []) => ({ v: 1, tx, inbox: inb, rules: [], fx: { ...FX }, history: {}, aliases: {}, own: [], ownSeen: [], holders: {} });
const bal = (bank, cur, amt, asOf, more = {}) => ({ id: `b-${bank}-${cur}`, name: `${bank} — ${cur}`, bank, cur, amt, asOf, at: ms(asOf + 'T17:00:00Z'), by: 'Mika', ...more });
const row = (id, name, amt, date, more = {}) => ({ id, name, amt, cur: 'GBP', bank: 'Wise', date, on: true, c0: C0, m: { t: C0, by: 'Mika' }, ...more });
const VAT = () => ({ id: 'vat', name: 'UK VAT', base: 'ontop', rate: 20, per: 'q', day: 7, off: 2, on: true, builtin: true });
const USN = (more = {}) => ({ id: 'usn', name: 'УСН по Точке', base: 'share', rate: 6, acct: 'Tochka|RUB', per: 'q', day: 28, off: 1, on: true, ask: true, builtin: true, ...more });
const plan3 = (parts = {}) => ({ v: 3, cushion: 5000, banks: [], inflows: [], team: [], taxes: [], other: [], div: [], log: [], ...parts, tax: { since: T, rules: [VAT(), USN()], cl: {}, per: {}, ...(parts.tax || {}) } });
const paid = (on, at = TAP, more = {}) => ({ on, at, by: 'Mika', ...more });
const HALF = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
// Fixture P.
function ledP({ tx = [], inb = [], skip = () => false, hmrc = [['2026-08-07', 4700]] } = {}) {
  const rows = [sheet('z-client', '2025-06-10', 900, 'rev', 'Client Z'), sheet('z-person', '2025-06-12', 700, 'cogs', 'Person Z')];
  HALF.forEach((m, i) => {
    rows.push(sheet('pa' + i, m + '-28', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600 }));
    rows.push(sheet('pr' + i, m + '-15', 2000, 'rev', 'Client R', { b: 'Tochka' }));
    rows.push(sheet('pb' + i, m + '-20', 6000, 'cogs', 'Person B'));
    rows.push(sheet('ps' + i, m + '-03', 120, 'fixed', 'Tool S'));
    rows.push(sheet('pm' + i, m + '-10', 3000, 'mika', ''));
    rows.push(sheet('pt' + i, m + '-05', 500, 'tax', 'HMRC Mika'));
  });
  hmrc.forEach(([d, a], i) => rows.push(sheet('ph' + i, d, a, 'tax', 'HMRC', { b: 'Barclays' })));
  return ledger(rows.filter((r) => !skip(r)).concat(tx), inb);
}
const BALS = (day = '2026-10-05', w = 20000, b = 10000, t = 236000) => [bal('Wise', 'GBP', w, day), bal('Barclays', 'GBP', b, day), bal('Tochka', 'RUB', t, day)];
const planP = (parts = {}) => plan3({ banks: BALS(), ...parts });
// Fixture A, written down. The ledger of the first iteration's fixture — sheet rows April–September: Client A £8,000
// on the 28th, Person B £6,000 on the 20th, Tool S £120 on the 3rd; statement f1 brought Tool S on 3 Oct and reaches
// 5 Oct — and, where that iteration forecast those three from history, a plan that says them: three rows marked
// «каждый месяц». Wise GBP was 10,120 at the end of 30 Sep.
function ledA({ skip = () => false, tx = [], inb = [], f1 = 'filed' } = {}) {
  const rows = [sheet('z-client', '2025-06-10', 900, 'rev', 'Client Z'), sheet('z-person', '2025-06-12', 700, 'cogs', 'Person Z')];
  HALF.forEach((m, i) => {
    rows.push(sheet('a' + i, m + '-28', 8000, 'rev', 'Client A'));
    rows.push(sheet('b' + i, m + '-20', 6000, 'cogs', 'Person B'));
    rows.push(sheet('s' + i, m + '-03', 120, 'fixed', 'Tool S'));
  });
  const waiting = [...inb];
  if (f1 === 'filed') rows.push(filed('f1', '2026-10-03', -120, 'fixed', 'Tool S'));
  else waiting.push(inbox('f1', '2026-10-03', -120, 'fixed', 'Tool S'));
  rows.push(reach('Wise', '2026-10-05'));
  return ledger(rows.filter((r) => !skip(r)).concat(tx), waiting);
}
const every = (id, name, amt, day, from, more = {}) => row(id, name, amt, from + '-' + String(day).padStart(2, '0'), { rec: { day, from }, ...more });
const planW = (parts = {}) => plan3({
  ...parts,
  banks: [bal('Wise', 'GBP', 10120, '2026-09-30'), ...(parts.banks || [])],
  inflows: [every('rA', 'Client A', 8000, 28, '2026-10', { vat: false }), ...(parts.inflows || [])],
  team: [every('rB', 'Person B', 6000, 20, '2026-10'), ...(parts.team || [])],
  other: [every('rS', 'Tool S', 120, 3, '2026-11'), ...(parts.other || [])],
});

// ---- the server: the page, and the two documents of the founder API, in memory ----
const store = {
  led: { rev: 3, doc: demoLedger(T), puts: 0 },
  cash: { rev: 2, doc: demoPlan(T), puts: 0, clash: null, bases: [], fail: false },
};
// A fresh pair of documents for a check that loads the page on them. Each pair starts at revisions nobody has seen:
// a page of the check before, closing with a change half a second old, still sends it — and must be refused.
let gen = 100;
const serve = (led, cash) => {
  gen += 100;
  Object.assign(store.led, { rev: gen + 1, doc: JSON.parse(JSON.stringify(led)), puts: 0 });
  Object.assign(store.cash, { rev: gen, rev0: gen, doc: JSON.parse(JSON.stringify(cash)), puts: 0, clash: null, bases: [], fail: false, putFail: false, failed: 0 });
};
http
  .createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const body = () => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
    // The page asks who is signed in, to sign the changes it makes to the plan.
    if (url === '/api/me') return send(200, { id: 'p1', name: 'Mika Example', firstName: 'Mika', isFounderTier: true });
    const doc = url === '/api/founder/money' ? store.led : url === '/api/founder/money/cash' ? store.cash : null;
    if (doc) {
      // The plan's server can be made to fail, for the check of a plan that does not load.
      if (req.method === 'GET') return doc.fail ? send(500, { error: 'boom' }) : send(200, { rev: doc.rev, doc: doc.doc, updatedAt: null });
      const b = JSON.parse(await body());
      // A page that has been closed may still be heard from; what it sends is not this check's.
      if (b.base < doc.rev - 50) return send(409, { error: 'money_stale', rev: doc.rev });
      // The server can be made to fail a save, for the check of a change that did not reach it.
      if (doc.putFail) { doc.failed = (doc.failed || 0) + 1; return send(500, { error: 'boom' }); }
      doc.puts++;
      if (doc.bases) doc.bases.push(b.base);
      // Another founder's page saved a moment earlier: what it wrote is the document now.
      if (doc.clash) { doc.doc = doc.clash; doc.clash = null; doc.rev++; }
      if (b.base !== doc.rev) return send(409, { error: 'money_stale', rev: doc.rev });
      doc.doc = JSON.parse(b.doc);
      doc.rev++;
      return send(200, { rev: doc.rev });
    }
    if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    let buf = null;
    let type = 'text/html; charset=utf-8';
    try {
      if (url === '/money/' || url === '/money/index.html') buf = fs.readFileSync(PUB + '/money/index.html');
      else if (url.startsWith('/money/vendor/')) { buf = fs.readFileSync(PUB + url); type = 'text/javascript'; }
    } catch (e) { /* 404 below */ }
    if (!buf) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': type });
    res.end(buf);
  })
  .listen(PORT, '127.0.0.1');

// ---- the browser ----
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const errs = [];
async function open(name, at = '2026-10-06T12:00:00+01:00', { w = 1320, h = 900, hash = '', quiet = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: PAGEERROR ${e.message}`));
  // `quiet` is for the one check that makes the server refuse a save on purpose: the browser reports the refusal itself.
  page.on('console', (m) => { if (m.type() === 'error' && !(quiet && quiet.test(m.text()))) errs.push(`${name}: CONSOLE ${m.text()} ${m.location().url || ''}`); });
  // The page asks Google for its fonts; the checks have no use for them and must not wait on the network.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.clock.install({ time: new Date(at) });
  await page.goto(BASE + '/money/index.html' + hash);
  await page.waitForFunction(() => !document.querySelector('#sync').textContent.includes('загружаю'));
  await page.waitForFunction(() => window.__cash && window.__cash.state() && window.__money.by === 'Mika');
  return page;
}
const page = await open('money');


// ---- one compute, and everything that must be true of any model ----
const LISTS = ['inflows', 'team', 'taxes', 'other', 'div'];
const held = { runs: 0, bad: [] };
// What §5 asks of every model, whatever went in. The numbers are the design's (live-spec-2 §5, which restates
// live-spec §5): 1 END = NOW + IN − OUT; 3 a ledger row closes one line (or one set of lines it is the sum of) unless a
// founder linked it by hand, and only a withdrawal shares a founders' row with the next withdrawal; 5 every open
// dated line is counted once, on one day, and what is done, doubted, missed, switched off or late-and-out is counted
// nowhere; 7 a hand mark is inside «сейчас» only while no statement uploaded after it has reached its day and only
// if it is later than the typed balance; 16 no total while an account in use has no balance; 18 the forecast holds
// nothing no founder wrote; 19 one occurrence per month of a «каждый месяц» row, none outside its months; 20–21 a
// month its label paid is never late, missed or part, and a chain carries at most one unpaid month; 22 «Можно
// вывести» never asks more of a day than that day holds after taxes and the cushion; 24 VAT accrued from facts is
// the ledger's own figure; 25–27 one bill per tax period, a closed period reserves nothing, a rule that is off,
// away or unconfirmed counts nowhere; 31 no key names a founder. And G: the month's columns add up.
const addM = (ym, k) => { const n = +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1 + k; return Math.floor(n / 12) + '-' + String((n % 12) + 1).padStart(2, '0'); };
const addD = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
function inv(M, P) {
  const bad = [];
  const say = (cond, msg) => { if (!cond) bad.push(msg); };
  const by = Object.fromEntries(M.items.map((it) => [it.id, it]));
  const acc = Object.fromEntries(M.accounts.map((a) => [a.key, a]));
  say(Object.keys(by).length === M.items.length, 'two items share an id');
  // 16
  const open = M.accounts.filter((a) => a.active && !a.anchor).map((a) => a.key);
  say(M.v0 === open.length > 0 && JSON.stringify(M.missing) === JSON.stringify(open), '16: v0 is not "an active account has no balance"');
  say((M.now === null) === M.v0 && (M.verdict.id === 'v0') === M.v0 && (M.need === null) === !M.v0 && (M.free === null) === M.v0 && (M.taxes.reserve === null) === M.v0, '16: v0 and «—» do not go together');
  M.accounts.forEach((a) => {
    if (a.anchor) say(close(a.est, a.anchor.amt + a.after + a.marks, 0.011), `balance of ${a.key} is not anchor + after + marks`);
    else say(a.est === null && a.gbp === null, `${a.key} has a figure without a balance`);
  });
  if (!M.v0) say(close(M.now, sum(M.accounts.map((a) => a.gbp || 0)), 0.005 * (M.accounts.length + 1)), 'NOW is not the sum of the accounts');
  // 1
  const base = M.v0 ? 0 : M.now;
  say(Math.abs(M.END - (base + M.IN - M.OUT)) <= 0.0100001, `1: END ${M.END} ≠ NOW ${base} + IN ${M.IN} − OUT ${M.OUT}`);
  say(M.days.length === M.H + 1 && M.days[0].d === M.T && M.days[M.H].d === M.end && M.days[M.H].e === M.END, 'the days are not T … T+H, or END is not the last of them');
  const low = Math.min(...M.days.map((D) => D.e));
  say(low === M.LOW && M.days.find((D) => D.e === low).d === M.LOWDAY, 'LOW is not the lowest day, or LOWDAY not its first');
  say(M.days.every((D) => close(D.f, D.e - D.res, 0.011) && D.res >= 0), 'a day\'s f is not e − res, or its reserve is negative');
  // 5
  const inW = (d) => !!d && d >= M.T && d <= M.end;
  const seen = {};
  M.days.forEach((D) => D.items.forEach((id) => { seen[id] = (seen[id] || 0) + 1; say(by[id] && by[id].day === D.d, `5: ${id} is listed under a day that is not its own`); }));
  let inSum = 0;
  let outSum = 0;
  let counted = 0;
  M.items.forEach((it) => {
    const may = ['due', 'blind', 'waiting', 'carry'].includes(it.state) || (it.state === 'late' && !(it.dir > 0 && it.step === 2));
    say(!!it.day === may, `5: ${it.id} is ${it.state} and is ${it.day ? '' : 'not '}counted`);
    say((seen[it.id] || 0) === (inW(it.day) ? 1 : 0), `5: ${it.id} is counted ${seen[it.id] || 0} times`);
    if (['done', 'doubt', 'missed', 'off', 'empty'].includes(it.state)) say(it.cash === 0 && !it.day, `5: ${it.id} is ${it.state} and still carries money`);
    if (it.day) say(it.day >= M.T, `5: ${it.id} is counted on a day gone by`);
    if (inW(it.day)) { counted++; if (it.cash > 0) inSum += it.cash; else outSum -= it.cash; }
  });
  say(close(inSum, M.IN, 0.005 * (counted + 2)) && close(outSum, M.OUT, 0.005 * (counted + 2)), `5: IN/OUT are not the items (${inSum} / ${outSum} against ${M.IN} / ${M.OUT})`);
  const op = M.outParts;
  say(close(op.team + op.other + op.taxes + op.div, M.OUT, 0.03) && op.ptax <= op.div + 0.011 && M.inParts.vat <= M.IN + 0.011, 'the parts of OUT do not add up, or a part is larger than its whole');
  // 18
  const rows = {};
  LISTS.forEach((k) => (P[k] || []).forEach((r) => { rows[String(r.id)] = { r, k }; }));
  const ruleOn = Object.fromEntries(M.taxes.rules.map((r) => [r.id, r]));
  M.items.forEach((it) => {
    if (it.src === 'row') say(!!rows[it.id] && !rows[it.id].r.rec && rows[it.id].k === it.list, `18: ${it.id} is not a stored row`);
    else if (it.src === 'occ') say(!!rows[it.row] && !!rows[it.row].r.rec && it.id === `${it.row}@${it.occ.ym}`, `18: ${it.id} is not a month of a stored row`);
    else say(it.src === 'tax' && it.id === 't|' + it.tax.key && ruleOn[it.tax.rule] && ruleOn[it.tax.rule].on && !ruleOn[it.tax.rule].away && !ruleOn[it.tax.rule].ask, `18: ${it.id} comes from no rule that counts`);
    say(it.kind === (it.src === 'tax' ? 'tax' : 'typed'), `18: ${it.id} is of a kind that no longer exists`);
  });
  // 19
  const ymT = M.T.slice(0, 7);
  const g0 = addM(ymT, -24);
  const g1 = addD(M.T, 120).slice(0, 7);
  Object.entries(rows).forEach(([id, { r }]) => {
    if (!r.rec || !/^\d{4}-\d\d$/.test(String(r.rec.from)) || !(r.rec.day >= 1)) return;
    const mine = M.items.filter((it) => it.row === id && it.src === 'occ');
    const want = [];
    for (let ym = r.rec.from > g0 ? r.rec.from : g0; ym <= (r.rec.to && r.rec.to < g1 ? r.rec.to : g1); ym = addM(ym, 1)) want.push(ym);
    say(JSON.stringify(mine.map((it) => it.occ.ym).sort()) === JSON.stringify(want), `19: the months of ${id} are not one per month of its repeat`);
    mine.forEach((it) => { const e = (r.rec.x || {})[it.occ.ym] || {}; say(it.amt === Math.max(0, +(e.amt != null ? e.amt : r.amt) || 0), `19: ${it.id} is not worth its month's amount`); });
  });
  // 3
  const hand = new Set();
  LISTS.forEach((k) => (P[k] || []).forEach((r) => { (r.tx || []).forEach((id) => hand.add(String(id))); Object.values((r.rec && r.rec.x) || {}).forEach((e) => (e.tx || []).forEach((id) => hand.add(String(id)))); }));
  Object.values((P.tax && P.tax.per) || {}).forEach((e) => (e.tx || []).forEach((id) => hand.add(String(id))));
  const claim = {};
  M.items.forEach((it) => it.rows.forEach((id) => (claim[id] = claim[id] || []).push(it)));
  Object.entries(claim).forEach(([id, its]) => {
    if (its.length > 1 && !hand.has(id)) say(its.every((it) => (it.done && it.done.note === 'sum') || it.wd), `3: ledger row ${id} closes ${its.length} lines by rule`);
  });
  M.taxes.periods.forEach((p) => p.rows.forEach((id) => { if (!hand.has(id)) say(M.taxes.periods.filter((q) => q.rows.includes(id)).length === 1, `26: payment ${id} serves two periods`); }));
  // 7
  M.items.forEach((it) => {
    const m = it.mark;
    if (!m) return;
    const a = acc[it.acct];
    const alive = !!it.done && it.done.by === 'mark';
    if (alive) say(!m.cov || m.cov < m.on, `7: the mark on ${it.id} outlived the statements uploaded after it`);
    say(it.state !== 'unseen' && !('unseen' in m), `7: ${it.id} is «unseen» — a marked line is never owed again by itself`);
    const want = alive && !!a && !!a.anchor && (m.on > a.anchor.asOf || (m.on === a.anchor.asOf && m.at > a.anchor.at));
    say(m.counts === want, `7: the mark on ${it.id} ${m.counts ? 'is' : 'is not'} in the balance`);
  });
  // 20, 21, 23
  const chains = {};
  M.items.forEach((it) => { if (it.src === 'occ') (chains[it.occ.chain] = chains[it.occ.chain] || []).push(it); });
  Object.entries(chains).forEach(([c, l]) => {
    l.sort((a, b) => (a.date < b.date ? -1 : 1));
    l.forEach((it) => { if (it.done && it.done.by === 'row' && !it.wd) say(!it.part && it.state === 'done', `20: ${it.id} is paid and still open`); });
    if (l[0].wd) return;
    if (l[0].dir < 0) say(l.filter((it) => it.state === 'late' && it.day && !it.occ.moved && !it.part).length <= 1, `21: the payout ${c} carries two unpaid months`);
    else { const d = l.filter((it) => it.state === 'doubt'); if (d.length) say(l.some((it) => it.occ.stops && it.state === 'late' && d.every((x) => it.occ.ym < x.occ.ym)) && !l.some((it) => d.some((x) => it.occ.ym > x.occ.ym) && it.done && it.done.by === 'row'), `21: ${c} is doubted without a late month before it, or after a later month was paid`); }
  });
  M.items.forEach((it) => { if (it.wd) say(!['late', 'missed'].includes(it.state) && !M.cards.some((cd) => cd.item === it.id), `23: the withdrawal ${it.id} is ${it.state}, or is in a card`); });
  // 22
  if (M.free) {
    const f = M.free;
    say(f.now >= 0 && f.steps.every((s, i) => s.amt > (i ? f.steps[i - 1].amt : f.now) && s.d >= M.T) && f.steps.length <= 3, '22: a step of «Можно вывести» does not rise');
    if (f.now > 0) M.days.forEach((D, i) => { if (i <= 60) say(f.now + D.res + M.cushion <= D.e + 0.011, `22: free ${f.now} + reserve ${D.res} + cushion is more than ${D.d} holds (${D.e})`); });
    if (f.now > 0) say(f.now + M.cushion <= f.tight.e - f.tight.res + 0.011, '22: free is more than the tight day leaves');
    say(['', 'stale', 'noout', 'thin', 'minus', 'cushion'].includes(f.why) && (f.why !== 'cushion' || f.now === 0) && (f.why !== '' || f.now > 0), `22: why «${f.why}» does not fit free ${f.now}`);
    say((M.verdict.id === 'vT') === (!M.empty && M.LOW >= M.cushion && !!f.thin && f.thin.half) || M.verdict.id === 'vE', '33: the verdict and the card do not agree that the plan is thin');
  }
  say((M.verdict.id === 'vE') === (!M.v0 && M.empty), '33: vE is not "nothing written ahead"');
  // 24–27
  const per = Object.fromEntries(M.taxes.periods.map((p) => [p.key, p]));
  M.taxes.periods.forEach((p) => {
    const rule = ruleOn[p.rule];
    const counts = rule.on && !rule.away && !rule.ask;
    const it = p.item ? by[p.item] : null;
    const W = p.row ? by[p.row] : null;
    say(!(it && W), `25: ${p.key} has a computed item and a typed bill`);
    if (!counts) say(!it && p.left === 0 && ['ask', 'away'].includes(p.state), `27: ${p.key} of a rule that does not count has an item or a remainder`);
    if (['paid', 'word', 'none'].includes(p.state)) say(p.left === 0 && !(it && it.open) && p.parts.every((id) => !by[id] || !by[id].open), `26: ${p.key} is closed and still owes, or holds an open line`);
    if (it && it.open) say(close(Math.abs(it.cash), p.left, 0.011), `25: the item of ${p.key} is not what the period has left`);
    say(p.left >= -0.001 && p.paid >= -0.001 && p.accF >= -0.001 || p.accF < 0, `${p.key} has a negative figure`);
  });
  if (!M.v0) {
    const cap = sum(M.taxes.periods.filter((p) => !['paid', 'word', 'none', 'away'].includes(p.state) && !(p.state === 'ask' && !p.asked)).map((p) => (p.asked ? Math.max(0, p.accF - p.found) : Math.max(p.accF + p.accP, p.owed))));
    say(M.taxes.reserve >= -0.001 && M.taxes.reserve <= cap + 0.011, `27: «под налоги» ${M.taxes.reserve} is more than the open periods can owe (${cap})`);
  }
  // 31
  const named = [];
  const walk = (x, path) => { if (Array.isArray(x)) x.forEach((v, i) => walk(v, path)); else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => { if (/^(mika|misha|vanya|founders?)$/i.test(k)) named.push(path + '.' + k); walk(v, path + '.' + k); }); };
  Object.entries(M).forEach(([k, v]) => { if (k !== 'accounts') walk(v, k); });
  say(!named.length, '31: a key of the model names a founder: ' + named.slice(0, 3).join(', '));
  // removed with the history: no key of it is left
  ['cautious', 'series', 'avg', 'IN_C', 'OUT_C', 'END_C', 'LOW_C', 'LOWDAY_C'].forEach((k) => say(!(k in M), `the model still has «${k}»`));
  say(M.days.every((D) => !('c' in D) && !('dripIn' in D) && !('inT' in D)) && !('hist' in M.inParts) && !('founders' in M.outParts), 'a day or a part still carries a figure of the history');
  // G
  const mb = M.month.blocks;
  ['fact', 'rest', 'total'].forEach((f) => say(close(mb.result[f], mb.rev[f] - mb.team[f] - mb.other[f] - mb.tax[f] - mb.div[f], 0.05), `G: the month's ${f} column does not add up`));
  say(Object.values(mb).every((x) => close(x.total, x.fact + x.rest, 0.011)) && M.month.M_EXP === mb.result.total, 'G: total is not fact + rest');
  say(M.month.byWord >= 0 && M.month.before.in >= 0 && M.month.before.out >= 0 && M.month.accrued >= -0.001 && mb.div.ptaxFact <= mb.div.fact + 0.011 && mb.div.ptaxRest <= mb.div.rest + 0.011, 'G: a part of the month is negative, or larger than its whole');
  // the constructor's months hold every item once
  const placed = {};
  Object.entries(M.months.by).forEach(([m, lists]) => LISTS.forEach((k) => {
    lists[k].rows.forEach((id) => { placed[id] = (placed[id] || 0) + 1; say(by[id] && by[id].ym === m && by[id].list === k, `months: ${id} is in the wrong month or list`); });
    const mine = lists[k].rows.map((id) => by[id]).filter(Boolean);
    say(lists[k].done <= lists[k].expected + 0.011 && close(sum(mine.map((it) => it.exp)), lists[k].expected, 0.006 * (mine.length + 1)) && close(sum(mine.map((it) => it.expDone)), lists[k].done, 0.006 * (mine.length + 1)), `months: ${m} ${k} is not the sum of its rows`);
  }));
  say(M.items.every((it) => placed[it.id] === 1), 'months: an item is missing from its month, or there twice');
  say(M.months.list.every((m) => M.months.by[m]) && M.months.list.includes(ymT), 'months: the switcher names a month the constructor does not have');
  say(M.items.every((it) => it.exp >= 0 && it.expDone >= 0 && it.expDone <= it.exp + 0.011 && (['off', 'empty', 'doubt', 'missed'].includes(it.state) ? it.exp === 0 : true)), 'months: a row expects something it should not');
  return bad;
}
// Runs the engine where it lives. The documents go in frozen — a function that changed what it was handed would
// throw — and the plan goes in a second time with everything the engine must not read turned upside down (§5.14):
// the plan's own rates, its horizon, the old on/off tick of the balances, and all that the first iteration kept
// about history — plan.ser, tails, the cautious switch, plan.vat, and on the rows sure, extra, inv, src, cyc.
async function C(led, P, day = T, opts = { H: 30 }, note = '') {
  const r = await page.evaluate(([l, p, t, o]) => {
    const freeze = (x) => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(freeze); } return x; };
    const a = JSON.stringify(l);
    const b = JSON.stringify(p);
    const model = JSON.stringify(window.__money.compute(freeze(l), freeze(p), t, o));
    const other = JSON.parse(b);
    other.fx = { USD: 7, EUR: 7, RUB: 7, AMD: 7 };
    other.horizon = '2031-01-01';
    (other.banks || []).forEach((x) => { x.on = !x.on; });
    if (other.v >= 3) {
      other.ser = { 'rev|client a': { made: true, amt: 5, day: 3 } }; other.tails = { rev: { on: false } }; other.cautious = { on: true }; other.vat = { on: false };
      ['inflows', 'team', 'taxes', 'other', 'div'].forEach((k) => (other[k] || []).forEach((x) => { x.sure = false; x.extra = true; x.inv = true; x.src = 'hist'; x.cyc = '2026-10'; }));
    }
    return { model, deaf: model === JSON.stringify(window.__money.compute(JSON.parse(a), other, t, o)), again: model === JSON.stringify(window.__money.compute(JSON.parse(a), JSON.parse(b), t, o)) };
  }, [led, P, day, opts]);
  const M = JSON.parse(r.model);
  // The invariants read the plan as the engine did: a plan older than v3 is upgraded first.
  const bad = inv(M, P.v >= 3 ? P : await up(P, led, day));
  if (!r.deaf) bad.push('14: the model changed with something the engine must not read');
  if (!r.again) bad.push('12: the same documents gave another model');
  held.runs++;
  bad.forEach((b) => held.bad.push((note ? note + ' — ' + b : b)));
  return M;
}
// A tap, as the page's own hands write it: the plan comes back changed, the one handed in is left alone.
const wr = (P, verb, ...args) => page.evaluate(([p, v, a]) => { window.__money.write[v](p, ...a); return p; }, [P, verb, args]);
const up = (P, led, day = T) => page.evaluate(([p, l, t]) => window.__money.upgrade(p, l, t), [P, led, day]);
const vf = (M, key, bank) => page.evaluate(([m, k, b]) => window.__money.vatFor(m, k, b), [M, key, bank]);
const passed = (M, key, asOf) => page.evaluate(([m, k, d]) => window.__money.passed(m, k, d), [M, key, asOf]);
// Nothing at all, and nonsense, through the engine: what it makes of each, or that it threw.
const nonsense = (t) => page.evaluate((t) => {
  const out = [];
  for (const [l, p] of [[undefined, undefined], [{}, {}], [{ tx: 'x', inbox: null, fx: null, rules: 7 }, { banks: 'no', inflows: [null, 5, { amt: 'abc', date: '2026-13-45' }], ser: [], tails: 3, tax: 7 }], [{ tx: [{ id: 1, d: 'nope', a: 5, c: 'rev' }, { id: 2, d: '2026-10-01', a: NaN, c: 'rev', l: 'X', o: { a: 'q' } }, null] }, { v: 3, banks: [{ bank: 'Wise', cur: 'XXX', amt: 'a lot', asOf: '2026-02-31' }], tax: { rules: [null, { id: 'x' }, { id: 'y', per: 'z', rate: 'no', day: 99, off: 0 }], per: 5 } }]]) {
    try { const M = window.__money.compute(l, p, t, { H: 30 }); out.push([M.verdict.id, M.now, M.IN, M.OUT, M.items.length, M.days.length]); } catch (e) { out.push('threw: ' + e.message); }
  }
  try { window.__money.compute({}, {}, 'today'); out.push('took a date that is not one'); } catch (e) { out.push('T refused'); }
  return out;
}, t);
// The same two documents through the engine in this browser, in one whose clock is somewhere else, and in one whose
// own zone is Auckland.
async function twoZones(L, P, t) {
  const args = [L, P, t, { H: 60 }];
  const one = await page.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args);
  const other = await open('second', '2026-12-31T23:59:00+13:00');
  const two = await other.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args);
  await other.context().close();
  const tz = await browser.newContext({ timezoneId: 'Pacific/Auckland' });
  const far = await tz.newPage();
  await tz.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  far.on('pageerror', (e) => errs.push(`auckland: PAGEERROR ${e.message}`));
  await far.goto(BASE + '/money/index.html');
  await far.waitForFunction(() => window.__money && window.__cash && window.__cash.state());
  const three = await far.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args);
  await tz.close();
  return [one, two === three ? two : 'the browser in Auckland disagrees'];
}
const item = (M, id) => M.items.find((it) => it.id === id) || null;
const card = (M, k) => M.cards.filter((c) => c.n === k);
const acct = (M, key) => M.accounts.find((a) => a.key === key) || null;
const per = (M, key) => M.taxes.periods.find((p) => p.key === key) || null;
const run = async (key, title, fn) => {
  // A key picks the check of that key; a word, every check with it in its key or its name.
  if (ONLY && !ONLY.split(',').some((k) => String(key) === k || String(key).includes(k) || title.toLowerCase().includes(k))) return;
  console.log(`\n— ${key}. ${title}`);
  held.runs = 0;
  held.bad = [];
  try {
    await fn();
  } catch (e) {
    ok(false, `check ${key} threw: ${String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')}`);
  }
  if (held.runs) ok(!held.bad.length, `§5 held after each of its ${held.runs} computes (nothing handed in was changed)`, [...new Set(held.bad)].slice(0, 8));
};

// =====================================================================================================================
// THE MODEL. The fixtures of the two designs, through window.__money.compute.
// =====================================================================================================================

// ---- the second iteration: written rows, taxes by rules, «Можно вывести» (live-spec-2 §7, on fixture P) ----
// A tap is made the way the page makes it: window.__money.write, on a copy of the plan.
const BY = 'Mika';
const usnYes = (P) => wr(P, 'rule', 'usn', { ask: null }, TAP, BY);
// The plan of test 2: the built-in УСН confirmed, its quarter before the start answered «Нет, закрыто», and every
// line of the helper ticked — five rows marked «каждый месяц», each a founder's own from then on.
// The helper starts every line this month unless the ledger shows this month's payment. A line whose day has passed
// where no statement reaches — Tool S on the 3rd, the personal tax on the 5th, balances typed for the 5th — is flagged
// (`gap`) and left for the founder to choose; in the design's test 2 both were paid, so here he picks «с ноября».
const paidAlready = (lines) => lines.map((l) => (l.why === 'gap' ? { ...l, start: l.opts[1] } : l));
let base2 = null;
async function plan2() {
  if (base2) return JSON.parse(JSON.stringify(base2));
  let P = await usnYes(planP());
  let M = await C(ledP(), P);
  P = await wr(P, 'shut', card(M, 14)[0], TAP, BY);
  M = await C(ledP(), P);
  P = await wr(P, 'helper', paidAlready(M.helper.lines), ['rA', 'rR', 'rB', 'rS', 'rT'], C0, BY);
  base2 = P;
  return JSON.parse(JSON.stringify(P));
}
const dayOf = (M, d) => M.days.find((D) => D.d === d);
const states = (M, ids) => ids.map((id) => (item(M, id) || {}).state || 'none');

// ---- what the first iteration's checks said of written rows, on fixture A written down ----
// Its tests 4, 6, 7, 9–14, 17 and 26 keep their mechanics: a hand mark and the row that takes its place, a typed
// balance, a row closed by a statement, a part, a fee, VAT, a row closed by amount, money that was already on the
// screen, lateness. The three regular lines its ledger forecast are now three rows marked «каждый месяц», so the
// figures the design gave for them stand: NOW 10,000 · IN 8,000 · OUT 6,120 · END 11,880 · LOW 4,000 on 20 Oct.
await run('w1', 'fixture A, written down: the line is exactly the rows a founder wrote', async () => {
  let M = await C(ledA(), planW());
  figs(M, { now: 10000, IN: 8000, OUT: 6120, END: 11880, LOW: 4000, LOWDAY: '2026-10-20', LATE: 0, verdict: 'v3', res: 0 }, 'three rows marked «каждый месяц» — Person B −6,000 on 20 Oct, Client A +8,000 on 28 Oct, Tool S −120 on 3 Nov');
  same([M.nowIsToday, M.nowDate, M.items.filter((it) => it.day).map((it) => [it.id, it.kind, it.src, it.state, it.day, it.cash].join(' ')), M.cards, M.free.why],
    [true, '2026-10-05', ['rA@2026-10 typed occ due 2026-10-28 8000', 'rA@2026-11 typed occ due 2026-11-28 8000', 'rA@2026-12 typed occ due 2026-12-28 8000', 'rA@2027-01 typed occ due 2027-01-28 8000', 'rA@2027-02 typed occ due 2027-02-28 8000', 'rB@2026-10 typed occ due 2026-10-20 -6000', 'rB@2026-11 typed occ due 2026-11-20 -6000', 'rB@2026-12 typed occ due 2026-12-20 -6000', 'rB@2027-01 typed occ due 2027-01-20 -6000', 'rB@2027-02 typed occ due 2027-02-20 -6000', 'rS@2026-11 typed occ due 2026-11-03 -120', 'rS@2026-12 typed occ due 2026-12-03 -120', 'rS@2027-01 typed occ due 2027-01-03 -120', 'rS@2027-02 typed occ due 2027-02-03 -120'], [], 'cushion'],
    '… «Денег сейчас»; every line is a month of a written row, generated to the month of T + 120; no card — and УСН, with no receipt on its account anywhere, asks nothing');
  M = await C(ledA(), planW(), T, { H: 60 });
  figs(M, { IN: 16000, OUT: 12240, END: 13760, LOW: 4000, LOWDAY: '2026-10-20' }, '60 days');
  // the running month: fact so far, plan for the rest
  M = await C(ledA(), planW());
  const b = M.month.blocks;
  same([b.other.fact, b.result.fact, b.rev.rest, b.team.rest, b.result.rest, M.month.M_EXP, b.result.usual, b.rev.usual, b.team.usual, b.other.usual, M.month.through, M.month.inInbox], [120, -120, 8000, 6000, 2000, 1880, 1880, 8000, 6000, 120, '2026-10-03', 0],
    'October: fact — прочие 120; ещё по плану — выручка 8,000, команда 6,000; итог 1,880, as a usual month');
  const W = await C(ledA({ f1: 'inbox' }), planW());
  same([W.month.blocks, W.month.inInbox, W.now, W.IN, W.OUT], [b, 120, M.now, M.IN, M.OUT], 'with the 3 Oct row recognised but not yet accepted the figures are the same — «в т.ч. в разборе £120»');
  // the constructor's months
  same([M.months.list, M.months.by['2026-10'].inflows, M.months.by['2026-11'].other, M.months.by['2026-10'].other], [['2026-10', '2026-11', '2026-12'], { rows: ['rA@2026-10'], expected: 8000, done: 0 }, { rows: ['rS@2026-11'], expected: 120, done: 0 }, { rows: [], expected: 0, done: 0 }],
    'the constructor walks this month and the two after it; a month holds the months of the repeating rows, in date order');
});

await run('w4', 'a hand mark, and the statement row that takes its place (test 4)', async () => {
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  let P = planW({ team: [g()] });
  let M = await C(ledA(), P);
  figs(M, { now: 10000, OUT: 7120, END: 10880 }, 'a one-off outflow Person G £1,000 on 7 Oct');
  same([item(M, 'g').how, item(M, 'g').kind, item(M, 'g').src, item(M, 'g').state], ['', 'typed', 'row', 'due'], '… a name the table does not know: unlinked, due');
  P = planW({ team: [g({ paid: paid(T) })] });
  same(await wr(planW({ team: [g()] }), 'mark', item(M, 'g'), T, TAP, BY), P, '«Оплачено» writes the mark on the row');
  M = await C(ledA(), P);
  figs(M, { now: 9000, OUT: 6120, END: 10880 }, '«Оплачено», one tap, 6 Oct');
  same([M.nowApprox, M.marksGbp, item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').done.day, item(M, 'g').mark.counts, acct(M, 'Wise|GBP').anchor.amt], [true, -1000, 'done', 'mark', '2026-10-07', true, 10120], '… NOW is «≈»: the mark is counted in it; the row is done and stays under its own date; the typed balance is as it was');
  M = await C(ledA({ inb: [inbox('f2', T, -1000, '', '', { at: AT3 })] }), P);
  figs(M, { now: 9000, OUT: 6120, END: 10880 }, 'then the statement brings 6 Oct −1,000 and nobody files it: the same three figures');
  same([M.nowApprox, M.marksGbp, item(M, 'g').done.by, item(M, 'g').done.note, item(M, 'g').done.rows, item(M, 'g').mark.counts, acct(M, 'Wise|GBP').after], [false, 0, 'row', 'mark', ['f2'], false, -1120], '… without «≈»: the row has replaced the mark, the money is in the statement rows now');
  same([card(M, 4).length, M.inbox.n, M.verdict.subs.includes('inbox')], [1, 1, true], '… and «Разбор» is one card and one line under the verdict');
  M = await C(ledA({ inb: [inbox('f2', T, -1000, '', '', { at: AT2 })] }), P);
  same([item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').rows, M.now, M.OUT, M.END, M.marksGbp], ['done', 'row', ['f2'], 9000, 6120, 10880, 0], 'had that row been uploaded before the tap and left unfiled, it replaces the mark just the same: the payout is in the balance once');
  M = await C(ledA({ tx: [filed('q', T, -1000, 'cogs', 'Person Q', { at: AT1 })] }), P);
  same([item(M, 'g').done.by, item(M, 'g').rows, item(M, 'g').mark.counts, item(M, 'g').mark.cov, M.now, M.OUT], ['mark', [], true, '2026-09-28', 8000, 6120], 'a row filed before the line was typed is not the line\'s: the mark does not take it and still stands for its own payment');
  // A month of a repeating row is marked the same way: the mark lives in that month's exception.
  const A = await C(ledA(), planW());
  const Q = await wr(planW(), 'mark', item(A, 'rB@2026-10'), T, TAP, BY);
  same(Q.team[0].rec, { day: 20, from: '2026-10', x: { '2026-10': { paid: paid(T) } } }, '«Оплачено» on October\'s month of Person B: the mark is in rec.x for that month');
  M = await C(ledA(), Q);
  figs(M, { now: 4000, OUT: 120, END: 11880 }, '… 6,000 moves from the plan into «сейчас»; END stays');
  M = await C(ledA({ tx: [filed('pb', '2026-10-06', -6000, 'cogs', 'Person B', { at: AT3 })] }), Q, '2026-10-07');
  same([item(M, 'rB@2026-10').done.by, item(M, 'rB@2026-10').rows, M.now, M.marksGbp, states(M, ['rB@2026-11'])], ['row', ['pb'], 4000, 0, ['due']], '… and the payment that then shows it — a fortnight before its day — is that month\'s: a marked month has first claim on the row');
  same((await wr(Q, 'unmark', item(M, 'rB@2026-10'))).team[0].rec, { day: 20, from: '2026-10' }, '… the mark taken off leaves no empty exception behind');
});

await run('w6', 'a mark the statement does not show (test 6)', async () => {
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  let M = await C(ledA(), planW({ team: [g({ paid: paid('2026-10-02', ms('2026-10-02T15:00:00Z')) })] }));
  figs(M, { now: 10000, OUT: 6120, END: 11880 }, 'marked on 2 Oct, statements reach 5 Oct and hold no such row: «оплачено» means paid — the row stays closed and nothing is counted again');
  same([item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').day, item(M, 'g').mark.counts, M.nowApprox, M.cards.map((c) => c.n)], ['done', 'ok', '', false, false, []], '… closed on the founder\'s word: out of the plan, and out of the balance — the statements carry the money now; no card asks about it');
  M = await C(ledA(), planW({ team: [g({ paid: paid('2026-10-02', ms('2026-10-02T15:00:00Z'), { ok: true }) })] }));
  figs(M, { now: 10000, OUT: 6120, END: 11880 }, 'a mark that an older page had answered «Всё верно» reads the same');
  same(item(M, 'g').done.by, 'ok', '… done by the founder\'s word');
});

await run('w7', 'a typed balance, and «Что из этого уже прошло?» (test 7)', async () => {
  const rent = (more = {}) => row('rent', 'Rent', 900, '2026-10-02', { bank: 'Barclays', ...more });
  let P = planW({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], other: [rent()] });
  let M = await C(ledA(), P);
  figs(M, { now: 13000, OUT: 7020 }, 'Barclays 3,000 as of 30 Sep and Rent £900 on 2 Oct');
  same([item(M, 'rent').state, item(M, 'rent').cov, item(M, 'rent').day, acct(M, 'Barclays|GBP').est, M.between.n], ['blind', '2026-09-28', T, 3000, 0], '… «не видно: выписки по 28 сен» — no Barclays statement reaches 2 Oct; it is counted today, and it is after the typed balance');
  same(await passed(M, 'Barclays|GBP', T), [{ id: 'rent', tick: false, on: '2026-10-02' }], '«Вписать остаток» Barclays lists Rent, unticked: every line is a founder\'s own, and theirs to say');
  const now = bal('Barclays', 'GBP', 2100, T, { at: TAP });
  M = await C(ledA(), planW({ banks: [now], other: [rent({ paid: paid('2026-10-02', TAP - 1) })] }));
  figs(M, { now: 12100, OUT: 6120, END: 13980 }, 'Barclays 2,100 with Rent ticked');
  same([item(M, 'rent').state, item(M, 'rent').mark.counts, M.between.n], ['done', false, 0], '… Rent is done and adds nothing to the balance it is already inside');
  M = await C(ledA(), planW({ banks: [now], other: [rent()] }));
  figs(M, { now: 12100, OUT: 7020, END: 13080 }, 'Barclays 2,100 saved without the tick');
  same([M.between, M.verdict.subs[0], item(M, 'rent').state], [{ n: 1, gbp: 900, ids: ['rent'] }, 'between', 'blind'], '… «1 строка на £900 между выписками и вписанным остатком» is the first line under the verdict');
  // Three weeks on with no new statement: Person B's 20 Oct may have gone. Nothing is ticked beforehand any more
  // (the first iteration ticked a payout it had forecast from history) — the line is the founder's, and so is the answer.
  const later = '2026-10-27';
  M = await C(ledA(), planW(), later);
  same(await passed(M, 'Wise|GBP', later), [{ id: 'rB@2026-10', tick: false, on: '2026-10-20' }], 'three weeks on, typing Wise: Person B\'s 20 Oct is listed, and not ticked');
  same([M.nowIsToday, M.nowDate, M.nowApprox, acct(M, 'Wise|GBP').stale, M.verdict.asOf, M.verdict.subs.includes('stale'), M.free.why], [false, '2026-10-05', true, 'old', '2026-10-05', true, 'stale'], '… and until it is typed the page says «Денег на 5 окт», «≈», «По остаткам на 5 окт», and names no sum to take out: 22 days without a statement');
  same(await passed(await C(ledA({ tx: [reach('Wise', T)] }), planW()), 'Wise|GBP', T), [], 'when the statements reach the day the balance is typed for, there is nothing to ask');
});

await run('w9', 'a one-off row closed by a statement; a part; a fee, VAT, a row closed by amount (tests 9–11)', async () => {
  const P = planW({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] });
  let M = await C(ledA(), P);
  figs(M, { now: 10000, IN: 10400, END: 14280 }, 'Client C £2,400 typed for 8 Oct');
  M = await C(ledA({ tx: [filed('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] }), P);
  figs(M, { now: 12400, IN: 8000, END: 14280 }, 'f2 brings 6 Oct +2,400, filed under Client C and accepted');
  same([item(M, 'c').state, item(M, 'c').done.by, item(M, 'c').done.on, item(M, 'c').done.day, item(M, 'c').done.rows, item(M, 'c').how, M.doneDays[T]], ['done', 'row', T, T, ['f2'], 'name', ['c']], '… the line is closed by that row and stays listed under the row\'s date');
  M = await C(ledA({ inb: [inbox('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] }), P);
  figs(M, { now: 12400, IN: 8000, END: 14280 }, 'recognised in «Разбор» and not yet accepted: the same — a payment does not open its line again between upload and accept');
  // a part
  M = await C(ledA({ tx: [filed('f2', T, 1000, 'rev', 'Client C', { at: AT2 })] }), P);
  figs(M, { now: 11000, IN: 9400, END: 14280 }, '+1,000 of the 2,400');
  same([item(M, 'c').part, item(M, 'c').cash, item(M, 'c').full, item(M, 'c').state], [{ got: 1000, of: 2400 }, 1400, 2400, 'due'], '… «частично £1,000 из £2,400», 1,400 still expected');
  const X = await C(ledA({ tx: [filed('f2', T, 1000, 'rev', 'Client C', { at: AT2 })] }), await wr(P, 'closed', item(M, 'c')));
  same([X.IN, item(X, 'c').state, item(X, 'c').done.by], [8000, 'done', 'closed'], '«Это всё» closes it at what came');
  // a fee, VAT, and by amount
  const Q = planW({ banks: [bal('Wise', 'USD', 1350, '2026-10-05')], team: [row('h', 'Person H', 540, '2026-10-07', { cur: 'USD' })], inflows: [row('d', 'Client D', 1000, '2026-10-09', { vat: true })], other: [row('ar', 'Аренда', 900, '2026-10-08')] });
  M = await C(ledA(), Q);
  figs(M, { now: 11000, IN: 9200, OUT: 7420 }, 'before the statement: $1,350 is £1,000; the VAT invoice counts 1,200; $540 is £400');
  same([item(M, 'd').cash, item(M, 'd').amt, item(M, 'd').factor, item(M, 'h').cash, item(M, 'h').acct, per(M, 'vat|2026Q4').accP], [1200, 1000, 1.2, -400, 'Wise|USD', 200], '… the line of Client D shows +1,200 for a typed 1,000, and the quarter accrues its 200 of VAT');
  M = await C(ledA({ tx: [filed('f-h', T, -552.66, 'cogs', 'Person H', { cur: 'USD', at: AT2 }), filed('f-d', T, 1200, 'rev', 'Client D', { at: AT2, v: 200 }), filed('f-l', T, -900, 'other', 'Landlord Ltd', { at: AT2 })] }), Q);
  same([item(M, 'h').state, item(M, 'h').done.note, item(M, 'h').done.rows, item(M, 'd').state, item(M, 'd').done.rows], ['done', '', ['f-h'], 'done', ['f-d']], '$540 typed, −$552.66 in the statement: done — Wise folds its fee into the payment; £1,000 + VAT 20%, +1,200 in the statement: done');
  same([item(M, 'ar').state, item(M, 'ar').how, item(M, 'ar').done.note, item(M, 'ar').done.label, item(M, 'ar').done.on], ['done', '', 'amount', 'Landlord Ltd', T], '«Аренда» £900, −900 filed as Other «Landlord Ltd»: «закрыто по сумме: Landlord Ltd, 6 окт»');
  figs(M, { IN: 8000, OUT: 6120, now: round2(10000 + (1350 - 552.66) / 1.35 + 1200 - 900), res: 200 }, 'and the three are out of the plan and in the balances — with the 200 of VAT that came now in the reserve');
  const known = [sheet('old-d', '2025-02-02', 100, 'rev', 'Client D'), sheet('old-v', '2025-02-03', 100, 'rev', 'Client V')];
  M = await C(ledA({ tx: [...known, filed('f-d', T, 1200, 'rev', 'Client D', { at: AT2 }), filed('f-v', T, 1300, 'rev', 'Client V', { at: AT2 })] }), planW({ inflows: [row('d', 'Client D', 1000, '2026-10-09'), row('v', 'Client V', 1000, '2026-10-09')] }));
  same([item(M, 'd').done.note, item(M, 'v').done.note, item(M, 'v').done.over, M.IN], ['vat', 'over', 300, 8000], '£1,000 typed without the tick and +1,200 came: done, «с VAT»; £1,000 typed and +1,300 came: done, «пришло больше на £300»');
  M = await C(ledA({ tx: [...known, filed('f-v', T, 1600, 'rev', 'Client V', { at: AT2 })] }), planW({ inflows: [row('v', 'Client V', 1000, '2026-10-09')] }));
  same([item(M, 'v').state, M.IN], ['due', 9000], '+1,600 against a typed 1,000 is more than half as much again: not this invoice');
  // A payment of a label that has ever been regular never closes another row by its amount (E3, the guard).
  M = await C(ledA({ tx: [filed('pb', T, -6000, 'cogs', 'Person B', { at: AT2 })] }), plan3({ banks: [bal('Wise', 'GBP', 10120, '2026-09-30')], team: [row('x', 'Somebody new', 6000, '2026-10-08')] }));
  same([item(M, 'x').state, item(M, 'x').rows], ['due', []], 'Person B\'s −6,000 does not close a row «Somebody new» of the same sum: his label has been a series');
});

await run('w12', 'money that was already on the screen (test 12)', async () => {
  const L = ledA({ tx: [filed('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] });
  const c = (more = {}) => row('c', 'Client C', 2400, '2026-10-12', { c0: AT2 + 3600e3, ...more });
  let M = await C(L, planW({ inflows: [c()] }));
  figs(M, { now: 12400, IN: 10400 }, 'f2 accepted first, then Client C £2,400 typed for 12 Oct: the row stays open');
  same([item(M, 'c').state, item(M, 'c').hint], ['due', { id: 'f2', d: T, amt: 2400, cur: 'GBP', label: 'Client C' }], '… with «Похоже, уже пришло: +£2,400 · 6 окт» to ask about');
  same(await wr(planW({ inflows: [c()] }), 'tx', item(M, 'c'), 'f2'), planW({ inflows: [c({ tx: ['f2'] })] }), '«Это оно» writes the link');
  M = await C(L, planW({ inflows: [c({ tx: ['f2'] })] }));
  figs(M, { IN: 8000, END: 14280 }, '«Это оно»');
  same([item(M, 'c').state, item(M, 'c').done.note], ['done', 'hand'], '… closed by the founder\'s word');
  M = await C(L, planW({ inflows: [c({ notx: ['f2'] })] }));
  figs(M, { IN: 10400 }, '«Нет, это новый счёт»');
  same(item(M, 'c').hint, null, '… and it is not asked again');
  const early = (date) => C(L, planW({ inflows: [row('c', 'Client C', 2400, date)] }));
  same([item(await early('2026-10-16'), 'c').state, item(await early('2026-10-17'), 'c').state, item(await early('2026-10-17'), 'c').hint.id, item(await early('2026-11-07'), 'c').hint], ['done', 'due', 'f2', null], 'typed before the statement came: a row ten days early closes the line; eleven days early it only asks; more than 31 days early it is another matter');
  // Last month's salary is not «возможно, уже оплачено» for this month of a repeating row.
  M = await C(ledA({ skip: (r) => r.id === 'b5', tx: [filed('b-sep', '2026-09-20', -6000, 'cogs', 'Person B')] }), planW());
  same([item(M, 'rB@2026-10').hint, item(M, 'rB@2026-10').state], [null, 'due'], 'September\'s payment of the same sum, in the statements before the row was written: no hint on October\'s month — it is September\'s');
});

await run('w13', 'a late inflow leaves in two steps; a late outflow stays (tests 13, 14)', async () => {
  const e = (date, more = {}) => row('e', 'Client E', 4000, date, more);
  let M = await C(ledA(), planW({ inflows: [e('2026-09-22')] }));
  figs(M, { IN: 12000, LATE: 4000 }, 'Client E £4,000 for 22 Sep — 13 days at the coverage date, tolerance 10: still expected');
  same([item(M, 'e').state, item(M, 'e').step, item(M, 'e').lateDays, item(M, 'e').g, item(M, 'e').day, M.late], ['late', 1, 13, 10, T, { n: 1, name: 'Client E', days: 13 }], '… late, step 1');
  same(M.cards, [{ n: 7, item: 'e', name: 'Client E', gbp: 4000, date: '2026-09-22', account: 'Wise GBP', cov: '2026-10-05', days: 13, hint: null, occ: false, step: 1, left: 8, stops: false }], '… card 7: «ждали 22 сен … 13 дн.», out of the forecast in 8 days');
  M = await C(ledA(), planW({ inflows: [e('2026-09-10')] }));
  figs(M, { IN: 8000, LATE: 4000, END: 11880 }, 'dated 10 Sep, 25 days: out of the line');
  same([card(M, 7)[0].step, card(M, 7)[0].days, item(M, 'e').day, item(M, 'e').cash], [2, 25, '', 4000], '… card 7: «Из расчёта убран, пока не перенесёте.»');
  M = await C(ledA(), planW({ inflows: [e('2026-10-20')] }));
  figs(M, { IN: 12000, LATE: 0, LOW: 8000, LOWDAY: '2026-10-20' }, '«Перенести на…» 20 Oct');
  same(M.cards, [], '… and the card is gone');
  const L = ledA({ tx: [sheet('old-e', '2025-03-03', 500, 'rev', 'Client E'), filed('f1-x', '2026-10-02', 4000, 'rev', 'Somebody Else')] });
  const open = await C(L, planW({ inflows: [e('2026-09-22')] }));
  M = await C(L, planW({ inflows: [e('2026-09-22', { tx: ['f1-x'] })] }));
  same([open.LATE, open.now, item(open, 'e').hint, M.LATE, M.now, item(M, 'e').state], [4000, 14000, null, 0, 14000, 'done'], '«Выбрать операцию», the row of 2 Oct: LATE 0, NOW unchanged');
  M = await C(ledA(), planW({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], inflows: [e('2026-09-30', { bank: 'Barclays' })] }));
  same([M.LATE, item(M, 'e').state, item(M, 'e').cov, M.cards.length], [0, 'blind', '2026-09-28', 0], 'the same row on Barclays, dated 30 Sep: not late — «не видно: выписки по 28 сен»');
  M = await C(ledA(), planW({ team: [row('f', 'Person F', 700, '2026-09-20')] }));
  figs(M, { OUT: 6820, LOW: 3300, LOWDAY: '2026-10-20', LATE: 0 }, 'Person F £700 for 20 Sep');
  same([item(M, 'f').state, item(M, 'f').day, M.cards.map((c) => [c.n, c.item, c.days])], ['late', T, [[8, 'f', 15]]], '… late, counted today — it is still owed — and card 8');
  same((await wr(planW({ team: [row('f', 'Person F', 700, '2026-09-20')] }), 'off', item(M, 'f'))).team[1].on, false, '«Не платим» switches the row off');
});

await run('w17', 'two invoices, one payment — beside a row that repeats (test 17)', async () => {
  const P = planW({ inflows: [row('i1', 'Client A', 1000, '2026-10-08'), row('i2', 'Client A', 1500, '2026-10-09')] });
  let M = await C(ledA(), P);
  figs(M, { IN: 10500 }, 'Client A £1,000 (8 Oct) and £1,500 (9 Oct) beside his 8,000 a month: a one-off row ADDS to a repeating one (the first iteration took it out of a forecast)');
  same([M.inParts.n, item(M, 'i1').how, item(M, 'i1').sk], [3, 'name', 'rev|client a'], '… three inflows in the window');
  M = await C(ledA({ tx: [filed('f2', T, 2500, 'rev', 'Client A', { at: AT2 })] }), P);
  figs(M, { now: 12500, IN: 8000, END: 14380 }, '+2,500 from Client A on 6 Oct');
  same([item(M, 'i1').done.note, item(M, 'i2').done.note, item(M, 'i1').done.rows, item(M, 'rA@2026-10').state, item(M, 'rA@2026-10').rows], ['sum', 'sum', ['f2'], 'due', []], '… both one-off rows done by the one row; a label\'s one-off rows are tried first, so it is not also October\'s month');
  M = await C(ledA({ tx: [filed('f2', T, 1500, 'rev', 'Client A', { at: AT2 })] }), P);
  figs(M, { IN: 9000 }, '+1,500 instead');
  same(states(M, ['i1', 'i2', 'rA@2026-10']), ['due', 'done', 'due'], '… the £1,500 row done, the £1,000 one open');
  // with no one-off row to take it, a payment of the label goes to the month whose date is nearest
  M = await C(ledA({ tx: [filed('f2', '2026-10-20', 7900, 'rev', 'Client A', { at: ms('2026-10-21T08:00:00Z') })] }), planW(), '2026-10-21');
  same([item(M, 'rA@2026-10').state, item(M, 'rA@2026-10').done.note, item(M, 'rA@2026-10').done.got], ['done', '', 7900], '7,900 of his 8,000, eight days early: October\'s month, within an invoice\'s tolerance');
});

await run('w26', 'day one: an account in use without a balance (test 26)', async () => {
  const L = ledA({ tx: [sheet('bc', '2026-09-15', 40, 'other', 'Bank fee', { b: 'Barclays' })], inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] });
  let M = await C(L, planW());
  same([M.verdict.id, M.now, M.missing, M.need, M.cards.map((c) => c.n), M.cards[0].accounts, M.free, M.taxes.reserve], ['v0', null, ['Barclays|GBP'], 11000, [1, 4], [{ key: 'Barclays|GBP', name: 'Barclays GBP', old: null }], null, null], 'verdict v0 «Нет остатка: Barclays GBP», `now` «—», «Нужно на счетах сегодня» 11,000, card 1 first; nothing is said of what can be taken out');
  same([M.IN, M.OUT, M.days[0].e, M.END, acct(M, 'Wise|GBP').est, acct(M, 'Barclays|GBP').inPlan], [8000, 6120, 0, 1880, 10000, false], '… the flows are still told, from zero; Wise\'s own balance is known and is not passed off as the total');
  M = await C(L, planW({ banks: [bal('Barclays', 'GBP', 15000, T, { at: TAP })] }));
  figs(M, { now: 25000, verdict: 'v1' }, '«Вписать остаток» Barclays 15,000');
  same([acct(M, 'Barclays|GBP').after, M.cards.map((c) => c.n)], [0, [4]], '… the row of 2 Oct is inside the figure typed today');
});

await run('links', 'whose money a written row is (D2)', async () => {
  const L = ledA({ tx: [sheet('g1', '2026-08-15', 96, 'fixed', 'Google'), sheet('n1', '2026-08-11', 300, 'behalf', 'Northlight print')] });
  L.rules = [{ k: 'kestrel bank', c: 'rev', l: 'Client A' }];
  L.aliases = { 'pb': 'Person B' };
  const M = await C(L, plan3({
    banks: [bal('Wise', 'GBP', 10120, '2026-09-30')],
    inflows: [row('1', 'client a', 10, '2026-10-20'), row('2', 'KESTREL BANK LTD inv 7', 10, '2026-10-20'), row('3', 'Client A — second half', 10, '2026-10-20'), row('4', 'Client Q', 10, '2026-10-20'), row('5', 'Somebody', 10, '2026-10-20')],
    team: [row('6', 'PB', 10, '2026-10-20'), row('7', 'Person', 10, '2026-10-20')],
    other: [row('8', 'Google Workspace', 10, '2026-10-20'), row('9', 'Northlight print', 10, '2026-10-20'), row('10', 'Tool', 10, '2026-10-20'), row('12', 'Client A', 10, '2026-10-20', { sk: 'rev|client z', skBy: 'hand' })],
    taxes: [row('13', 'HMRC Vanya', 10, '2026-10-20'), row('14', 'Corporation tax', 10, '2026-10-20', { of: false })],
    div: [row('11', 'Вывод', 10, '2026-10-20', { blk: 'div' }), row('15', 'HMRC Mika', 10, '2026-10-20', { blk: 'div', ptax: true, f: 'mika' })],
  }));
  same(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '13', '14', '11', '15'].map((id) => { const it = item(M, id); return [it.how, it.sk, it.blk, it.grp, it.wd ? 'wd' : it.ptax ? 'ptax' : ''].join(' · '); }), [
    'name · rev|client a · rev · rev · ', 'rule · rev|client a · rev · rev · ', 'prefix · rev|client a · rev · rev · ', ' ·  · rev · rev · ', ' ·  · rev · rev · ',
    'name · cogs|person b · cogs · team · ', ' ·  · cogs · team · ',
    'rule · fixed|google · fixed · other · ', 'name · behalf|northlight print · behalf · other · ', 'word · fixed|tool s · fixed · other · ', 'hand · rev|client z · rev · other · ',
    'block ·  · div · div · ptax', 'block ·  · tax · tax · ', 'block ·  · div · div · wd', 'block ·  · div · div · ptax',
  ], 'the name as the table spells it (any case, any alias) · a rule key inside it · a label it begins with · the only label with its first word · two such labels: nobody\'s · a founder\'s own choice over all of it · a tax with a founder in its name is a personal tax wherever it is stored · a withdrawal and a personal tax are known by their list');
});

await run('verdicts', 'the verdict, top down, and the order of «Нужно решить»', async () => {
  const at = (amt, more = {}) => ({ ...planW(more), banks: [bal('Wise', 'GBP', amt + 120, '2026-09-30')] });
  let M = await C(ledA(), at(4880));
  same([M.verdict.id, M.LOW, M.LOWDAY, M.plusDay, M.free.why, M.free.now], ['v4', -1120, '2026-10-20', '2026-10-28', 'minus', 0], 'NOW 4,880 — v4: «20 окт не хватит 1,120. В плюс выходим 28 окт»; «Выводить нельзя»');
  M = await C(ledA(), { ...at(4880), inflows: [] });
  same([M.verdict.id, M.plusDay, M.IN], ['v4', '', 0], '… and with nothing coming in: «До конца периода в плюс не выходим»');
  M = await C(ledA(), at(10000));
  same([M.verdict.id, M.LOW, M.cushion], ['v3', 4000, 5000], 'NOW 10,000 — v3: enough, but 4,000 is under the cushion of 5,000');
  M = await C(ledA(), at(13000));
  same([M.verdict.id, M.LOW, M.verdict.subs, M.free.now, M.free.tight], ['v1', 7000, [], 2000, { d: '2026-10-20', e: 7000, res: 0, inbox: 0 }], 'NOW 13,000 — v1: enough by what is written; 2,000 over the cushion on the tight day');
  M = await C(ledA({ inb: [inbox('in1', T, 500, '', 'UNKNOWN PAYER', { at: AT2 })] }), at(13000));
  same([M.verdict.id, M.verdict.subs, M.inbox, M.now], ['v1', ['inbox'], { n: 1, gbp: 500, inN: 1, inGbp: 500, prov: 0, provGbp: 0 }, 13500], 'the same with an incoming £500 nobody has filed — still v1: were the whole £500 money the plan waits for, the lowest point would be 7,000, over the cushion; «Разбор» is the sub-line, not the sentence');
  M = await C(ledA({ inb: [inbox('in1', T, 2000, '', 'UNKNOWN PAYER', { at: AT2 })] }), at(10000));
  same([M.verdict.id, M.LOW, M.LOW - M.inbox.inGbp < M.cushion], ['vi', 6000, true], 'NOW 10,000 and an incoming £2,000 nobody has filed — vi: the lowest point is 6,000 only if that money is new; were it money the plan still waits for, it would be 4,000, under the cushion — so «Сначала разберите 1 поступление на £2,000»');
  M = await C(ledA(), at(10000, { cushion: 3000 }));
  same([M.verdict.id, M.cushion], ['v1', 3000], 'the cushion is the plan\'s: at 3,000 the base fixture is v1');
  M = await C(ledA(), { ...at(13000), inflows: [], team: [], other: [] });
  same([M.verdict.id, M.empty, M.free.why], ['vE', true, 'noout'], 'nothing written ahead — vE stands above v3 and v4: «впритык» on an empty plan is a verdict about nothing');
  M = await C(ledA(), { ...at(13000), inflows: [], team: [], other: [row('u', 'Something', 900, '')] });
  same([M.verdict.id, M.empty, card(M, 9).map((c) => c.items)], ['vT', false, [['u']]], '… while a row without a date is something written: not vE — the plan is thin, vT — and card 9 asks for its date');
  // Everything at once: the balance first, then what counts two bills, then late money by size, then what has no date.
  M = await C(ledA({ inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] }), planW({
    inflows: [row('e', 'Client E', 4000, '2026-09-22'), row('u', 'Client U', 900, '')],
    team: [row('f', 'Person F', 700, '2026-09-20'), row('big', 'Person Y', 5000, '2026-09-18')],
  }));
  same(M.cards.map((c) => [c.n, c.item || c.count || c.accounts.length]), [[1, 1], [4, 1], [8, 'big'], [7, 'e'], [8, 'f'], [9, 1]], 'cards: 1 no balance · 4 «Разбор» · the late rows by size, 5,000 then 4,000 then 700 · 9 without a date');
});

await run('stale', 'how old the balances are (H1, H2)', async () => {
  let M = await C(ledA(), planW(), '2026-10-13');
  same([M.nowIsToday, M.nowDate, M.nowAcct, M.nowApprox, acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, M.verdict.asOf, M.free.why === 'stale'], [false, '2026-10-05', 'Wise|GBP', false, 8, '', '2026-10-05', false], '13 Oct, statements through 5 Oct: «Денег на 5 окт», «По остаткам на 5 окт: …», eight days is not yet stale');
  M = await C(ledA(), planW(), '2026-10-15');
  same([acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, M.nowApprox, M.verdict.subs.includes('stale'), M.free.why], [10, 'ask', true, true, 'stale'], '15 Oct: ten days without a statement — «≈» on NOW, a line under the verdict, and no sum to take out');
  M = await C(ledA({ tx: [reach('Wise', '2026-11-04')] }), planW(), '2026-11-05');
  same([acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, acct(M, 'Wise|GBP').handDays, acct(M, 'Wise|GBP').handOld, M.nowApprox, M.nowIsToday], [1, '', 36, true, true, true], '5 Nov with fresh statements: the balance itself was typed 36 days ago — «≈», «сверьте с банком»');
  M = await C(ledA({ tx: [filed('mosta-fee', '2026-08-20', -50, 'other', 'Bank fee', { b: 'Mosta', cur: 'USD', at: 1 })] }), planW({ banks: [bal('Mosta', 'USD', 100, '2026-08-20')] }));
  same([acct(M, 'Mosta|USD').active, acct(M, 'Mosta|USD').material, acct(M, 'Mosta|USD').through, M.nowIsToday, M.nowDate, M.now], [true, false, '2026-09-28', true, '2026-10-05', 10074.07], 'Mosta holds $100 and is known only through 28 Sep, where the sheet ends: in use, not material — the total is still «Денег сейчас», dated by Wise');
  M = await C(ledA(), planW({ banks: [bal('Mosta', 'USD', 0, '2026-06-01'), { id: 'old', name: 'Tochka — RUB', bank: 'Tochka', cur: 'RUB', amt: 5000, legacy: true }] }));
  same([M.v0, M.nowIsToday, M.nowApprox, acct(M, 'Mosta|USD').active, acct(M, 'Tochka|RUB').active, acct(M, 'Tochka|RUB').old], [false, true, false, false, false, 5000], 'a Mosta balance from June and an old Tochka one, neither in use: no v0, no «≈»');
});

await run('edges', 'what must not be counted, and what must not break', async () => {
  // A row that repeats on a bank whose statements stopped in July: nothing of it is late on days nobody has seen.
  const L = ledger([...['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((m, i) => filed('q' + i, m + '-10', -1000, 'cogs', 'Person Q', { b: 'Barclays', at: 1 })), reach('Wise', '2026-10-05')]);
  let M = await C(L, plan3({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05'), bal('Barclays', 'GBP', 5000, '2026-07-10')], team: [every('q', 'Person Q', 1000, 10, '2026-08', { bank: 'Barclays' })] }));
  same(M.items.map((it) => [it.occ.ym, it.state, it.day, it.cash]).slice(0, 4), [['2026-08', 'blind', T, -1000], ['2026-09', 'blind', T, -1000], ['2026-10', 'due', '2026-10-10', -1000], ['2026-11', 'due', '2026-11-10', -1000]], 'statements of the bank stop on 10 Jul: August and September are counted today — no statement could have shown them — October on its day');
  same([M.OUT, M.now, acct(M, 'Barclays|GBP').active, M.nowDate, M.sheetEnd, M.helper.lines, M.helper.have], [3000, 15000, true, '2026-07-10', '', [], ['Person Q']], '… the account an open row names is in use, and dates the total; the helper, which reads a bank only as far as its statements reach, shows him under «Уже в плане»');
  // A row in roubles stands on the rouble account, and its mark is in that balance.
  const R = ledger([...HALF.map((m, i) => filed('r' + i, m + '-08', 354000, 'rev', 'Client R', { cur: 'RUB', b: 'Tochka', at: 1 })), reach('Tochka', '2026-10-05', 'RUB')]);
  const PR = (more = {}) => plan3({ banks: [bal('Tochka', 'RUB', 118000, '2026-10-05')], inflows: [every('rr', 'Client R', 354000, 8, '2026-10', { cur: 'RUB', bank: 'Tochka', vat: false, ...more })], tax: { since: T, rules: [VAT(), USN({ ask: false })], cl: {}, per: {} } });
  const r0 = await C(R, PR());
  const occ = item(r0, 'rr@2026-10');
  same([occ.cash, occ.cur, occ.bank, occ.acct, r0.now, r0.missing, r0.helper.have], [3000, 'RUB', 'Tochka', 'Tochka|RUB', 1000, [], ['Client R']], 'a client paid in roubles: ≈£3,000 on Tochka, on the rouble account — the helper shows him under «Уже в плане»');
  M = await C(R, await wr(PR(), 'mark', occ, T, TAP, BY));
  same([M.now, acct(M, 'Tochka|RUB').marks, M.END, M.nowApprox], [4000, 354000, r0.END, true], '«Получено» on it: the mark is in the rouble balance at today\'s rate, END where it was');
  same([per(r0, 'usn|2026Q3').accN, per(r0, 'usn|2026Q3').accF, per(r0, 'usn|2026Q3').sheet, per(r0, 'usn|2026Q4').accP, per(M, 'usn|2026Q4').accP], [63720, 540, false, 540, 540], '… УСН: 6% of what arrived in III кв., in roubles (₽63,720), from the bank\'s own amounts; IV кв. accrues from the plan, and a line marked received accrues on the day of its mark');
  // A refund is not a payment.
  M = await C(ledA({ tx: [filed('refund', '2026-10-04', 120, 'fixed', 'Tool S')] }), planW());
  same([M.now, M.month.blocks.other.fact], [10120, 0], 'Tool S refunds its 120 on 4 Oct: the balance has it back, the month\'s fact is nil');
  M = await C(ledA({ tx: [filed('refund', '2026-10-04', 2400, 'cogs', 'Client C')] }), planW({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] }));
  same([item(M, 'c').state, M.IN], ['due', 10400], 'money coming back into a cost block does not close an invoice of the same sum');
  // Nothing at all, and nonsense: a model, not an exception.
  const odd = await nonsense(T);
  same(odd, [['vE', 0, 0, 0, 0, 31], ['vE', 0, 0, 0, 0, 31], ['vE', 0, 0, 0, 1, 31], ['vE', 0, 0, 0, 0, 31], 'T refused'], 'no documents, empty ones, and ones full of nonsense give an empty model; only a T that is not a date is refused');
});

await run('transfer', 'own transfers; a founder\'s own tax; studio tax (§5.10)', async () => {
  const P = planW({ banks: [bal('Barclays', 'GBP', 4618, '2026-10-05')] });
  const one = await C(ledA(), P);
  const two = await C(ledA({ tx: [filed('t-out', T, -1000, 'skip', '', { b: 'Barclays', at: AT2 }), filed('t-in', T, 1000, 'skip', '', { at: AT2 })] }), P);
  same([acct(two, 'Wise|GBP').est, acct(two, 'Barclays|GBP').est, two.now, two.IN, two.OUT, two.month.M_EXP], [11000, 3618, one.now, one.IN, one.OUT, one.month.M_EXP], 'Wise +1,000 and Barclays −1,000 paired as a transfer: 11,000 and 3,618, NOW unchanged, in no flow figure');
  // HMRC Mika, monthly: a founder's own tax. The page never forecasts it; the helper offers it under «Дивиденды»,
  // and the month view counts it as dividends. The studio's own PAYE is no series and is offered by nobody.
  const L = ledA({ tx: HALF.flatMap((m, i) => [sheet('hm' + i, m + '-23', 800 + 10 * i, 'tax', 'HMRC Mika', { b: 'Barclays' }), sheet('paye' + i, m + '-19', 300, 'tax', 'PAYE', { b: 'Barclays' })]).concat([sheet('ct', '2026-07-09', 5000, 'tax', 'HMRC CT', { b: 'Barclays' })]) });
  const M = await C(L, P);
  const l = M.helper.lines.find((x) => x.ptax);
  same([M.items.some((it) => it.ptax), l.label, l.list, l.amt, l.day, l.start, M.helper.lines.some((x) => /PAYE|CT/.test(x.label))], [false, 'HMRC Mika', 'div', 850, 23, '2026-10', false], 'HMRC Mika is in no line until a founder writes it; the helper offers it — last time\'s 850, on the 23rd — under «Дивиденды», and offers no studio tax');
  same([M.month.blocks.div.usual, M.month.blocks.tax.usual, M.month.blocks.div.rest, M.month.blocks.tax.rest], [825, 300, 0, 0], '… a usual month: dividends 825 (his tax), studio tax 300 — and nothing of either is expected ahead');
  const Q = await wr(P, 'helper', [l], ['pt'], C0, BY);
  const N = await C(L, Q, T, { H: 30 });
  same([Q.div.map((r) => [r.id, r.ptax, r.f, r.rec]), N.outParts.div, N.outParts.ptax, N.outParts.taxes, N.month.blocks.div.rest, N.month.blocks.div.ptaxRest, N.month.blocks.tax.rest], [[['pt', true, 'mika', { day: 23, from: '2026-10' }]], 850, 850, 0, 850, 850, 0], '… ticked: a personal tax in «Дивиденды», 850 on the 23rd — «дивиденды 850 (личные налоги 850)», and not a studio tax');
});

await run('browsers', 'two browsers, one answer (§5.12)', async () => {
  const P = await plan2();
  const L = ledP();
  const a = await twoZones(L, P, T);
  ok(a[0] === a[1] && a[0].length > 5000, 'the same two documents and T give byte-equal models in a browser in London and one in Vladivostok', [a[0].length, a[1].length]);
});
// ---- the second iteration's own tests (live-spec-2 §7), on fixture P ----
await run('p1', 'day one (D8): the facts, an empty plan, taxes accrued by the rules, and a rule nobody has confirmed', async () => {
  const L = ledP();
  let P = planP();
  let M = await C(L, P);
  figs(M, { now: 32000, verdict: 'vE', res: 4800, IN: 0, OUT: 0, END: 32000 }, 'nothing is written: the page says what is in the bank and what of it is not the studio\'s, and forecasts nothing');
  same([M.empty, M.items.map((it) => it.id), M.free.why, Object.values(M.month.blocks).map((b) => b.fact + b.rest)], [true, ['t|vat|2026Q3'], 'noout', [0, 0, 0, 0, 0, 0]], '… the plan is empty, the one line in it is a tax the rules worked out, «Можно вывести» names no sum, the month has no fact and no plan');
  let v = per(M, 'vat|2026Q3');
  same([v.accF, v.due, v.state, v.left, v.approx, per(M, 'vat|2026Q2'), card(M, 14)], [4800, '2026-11-07', 'open', 4800, true, null, []], 'UK VAT: III кв. is kept — 4,800 accrued, due 7 Nov; II кв. was looked at, found paid (4,700 of 4,800) and is in no figure and no card');
  let u = per(M, 'usn|2026Q3');
  same([u.state, u.accN, u.accF, u.sheet, u.left, u.item, card(M, 15).map((c) => [c.rule, c.pname, c.accN, c.acc, c.cur, c.rate])], ['ask', 42480, 360, true, 0, '', [['usn', 'III кв. 2026', 42480, 360, 'RUB', 6]]],
    'УСН is not confirmed: its row shows ≈ ₽42,480 (£360) for III кв. and nothing else — no item, no reserve — and card 15 asks');
  figs(await C(L, P, T, { H: 60 }), { OUT: 4800, END: 27200 }, 'at 60 days the VAT item is inside the window');
  // [Да, 6%]
  P = await usnYes(P);
  M = await C(L, P);
  const c14 = card(M, 14);
  same([item(M, 't|usn|2026Q3') && [item(M, 't|usn|2026Q3').cash, item(M, 't|usn|2026Q3').date, item(M, 't|usn|2026Q3').amt, item(M, 't|usn|2026Q3').cur, item(M, 't|usn|2026Q3').acct], c14.map((c) => [c.key, c.accN, c.found, c.count, c.rest, c.parts]), card(M, 15)],
    [[-360, '2026-10-28', 42480, 'RUB', 'Tochka|RUB'], [['usn|2026Q2', 42480, 0, 0, 360, null]], []], '[Да, 6%]: the item of III кв. — −£360 on 28 Oct, on the Tochka account — and card 14 asks about the quarter before the start, where no payment was found');
  figs(M, { res: 5520, verdict: 'vE' }, '… until it is answered its accrual is in the reserve: the safe side');
  let Q = await wr(P, 'shut', c14[0], TAP, BY);
  figs(await C(L, Q), { res: 5160, IN: 0, OUT: 360, END: 31640 }, '[Нет, закрыто]');
  figs(await C(L, Q, T, { H: 60 }), { OUT: 5160, END: 26840 }, '… and at 60 days');
  // [Не со счетов студии]
  Q = await wr(planP(), 'rule', 'usn', { away: true, ask: null }, TAP, BY);
  M = await C(L, Q);
  same([per(M, 'usn|2026Q3').state, per(M, 'usn|2026Q3').accN, M.items.length, M.taxes.reserve, M.cards.map((c) => c.n)], ['away', 42480, 1, 4800, []], '[Не со счетов студии] on card 15 instead: the accrual is still shown, and the rule has no item, no reserve and no card');
  // almost nothing in the bank
  M = await C(L, { ...P, banks: BALS('2026-10-05', 100, 100, 11800) });
  same([M.now, M.verdict.id, M.verdict.short], [300, 'vE', { d: '2026-10-28', name: 'УСН по Точке', gbp: 360 }], 'with £300 in the bank the plan is still empty — vE, not v3 or v4 — and the sentence names the tax that the accounts cannot cover');
});

await run('p2', 'the helper «Подставить по прошлым месяцам», and the plan it leaves: the line, the reserve, «Можно вывести»', async () => {
  const L = ledP();
  let P = await usnYes(planP());
  P = await wr(P, 'shut', card(await C(L, P), 14)[0], TAP, BY);
  let M = await C(L, P);
  same(M.helper.lines.map((l) => [l.label, l.list, l.amt, l.cur, l.approx, l.sheet, l.vat, l.day, l.bank, l.start, l.why, l.ptax].join(' ')), [
    'Client A inflows 8000 GBP false 0 true 28 Barclays 2026-10  false',
    'Client R inflows 236000 RUB true 2000 false 15 Tochka 2026-10  false',
    'Person B team 6000 GBP false 0 false 20 Wise 2026-10  false',
    'Tool S other 120 GBP false 0 false 3 Wise 2026-10 gap false',
    'HMRC Mika div 500 GBP false 0 false 5 Wise 2026-10 gap true',
  ], 'five lines, as in the last month: Client A without its VAT and «+ VAT» on; Client R in roubles at the table\'s rate; Tool S and the personal tax start in October like the rest and are flagged — their day has passed where no statement reaches, and the balance is newer: the founder chooses; the founders\' block is not listed');
  // Left as the helper offers them, the two lines are in October — owed, counted today, and named by the sentence as
  // possibly counted twice: nothing is left out of the plan without a word.
  {
    const Q = await wr(P, 'helper', M.helper.lines, ['rA', 'rR', 'rB', 'rS', 'rT'], C0, BY);
    const N = await C(L, Q);
    same([states(N, ['rS@2026-10', 'rT@2026-10']), item(N, 'rS@2026-10').day, N.OUT, N.between.n, N.between.gbp, N.verdict.subs.includes('between')], [['blind', 'blind'], T, 6980 + 620, 2, 620, true],
      'ticked without choosing: October holds both — −120 and −500 on today, OUT 7,600 — and the sentence carries «2 строки на £620 между выписками и вписанным остатком — возможно, посчитаны дважды»');
  }
  same([M.helper.have, M.items.filter((it) => it.src !== 'tax').length], [[], 0], '… nothing is ticked and nothing is in the plan until «Добавить»');
  P = await plan2();
  same(['inflows', 'team', 'other', 'div'].flatMap((k) => P[k].map((r) => [k, r.id, r.name, r.amt, r.cur, r.bank, r.rec.day, r.rec.from, r.vat, r.sk || '', r.skBy || '', !!r.ptax, r.f || ''].join(' '))), [
    'inflows rA Client A 8000 GBP Barclays 28 2026-10 true rev|client a hand false ',
    'inflows rR Client R 236000 RUB Tochka 15 2026-10 false rev|client r hand false ',
    'team rB Person B 6000 GBP Wise 20 2026-10  cogs|person b hand false ',
    'other rS Tool S 120 GBP Wise 3 2026-11  fixed|tool s hand false ',
    'div rT HMRC Mika 500 GBP Wise 5 2026-11    true mika',
  ], '«Добавить»: five rows with `rec`, Client A\'s with vat:true, the personal tax in «Дивиденды»');
  M = await C(L, P);
  same(M.days.flatMap((D) => D.items.map((id) => [D.d.slice(5), item(M, id).cash].join(' '))), ['10-15 2000', '10-20 -6000', '10-28 9600', '10-28 -360', '11-03 -120', '11-05 -500'], 'the items in the window');
  figs(M, { IN: 11600, OUT: 6980, END: 36620, LOW: 28000, LOWDAY: '2026-10-20', verdict: 'v1', res: 5160, free: 17720 }, 'the line');
  same([M.inParts, M.outParts], [{ n: 2, vat: 1600 }, { team: 6000, other: 120, taxes: 360, div: 500, ptax: 500 }], '«2 поступления · в т.ч. VAT £1,600» · команда 6,000 · прочее 120 · налоги 360 · дивиденды 500, из них личные налоги 500');
  const M60 = await C(L, P, T, { H: 60 });
  // RES rises when a tax is EARNED and falls on the day its item leaves the line.
  same(['2026-10-06', '2026-10-15', '2026-10-28', '2026-11-07', '2026-11-15'].map((d) => dayOf(M60, d).res), [5160, 5280, 6520, 1720, 1840], 'the reserve: 5,160 → 5,280 from 15 Oct → 6,520 from 28 Oct → 1,720 from 7 Nov → 1,840 from 15 Nov');
  same(['2026-10-06', '2026-10-15', '2026-10-20', '2026-10-28', '2026-11-05', '2026-11-20'].map((d) => dayOf(M60, d).f), [26840, 28720, 22720, 30720, 30100, 25980], 'the studio\'s own money, day by day');
  same([M.free.tight, M.free.steps, M.free.why, M.free.thin, M.free.wait, M.free.wd.n], [{ d: '2026-10-20', e: 28000, res: 5280, inbox: 0 }, [{ d: '2026-10-28', amt: 20980, by: 'Client A', date: '2026-10-28' }, { d: '2026-11-28', amt: 24240, by: 'Client A', date: '2026-11-28' }], '', null, null, 0],
    '«Сегодня можно вывести £17,700»: the tight day is 20 Oct — 28,000 in the bank, 5,280 of it taxes — and it grows when Client A pays on 28 Oct and on 28 Nov; the plan is not thin (6,120 in each slice)');
  const b = M.month.blocks;
  same([b.rev.rest, b.rev.vat, b.team.rest, b.other.rest, b.tax.rest, b.div.rest, b.result.rest, M.month.accrued, per(M, 'vat|2026Q4').accP, per(M, 'vat|2026Q4').state], [11600, 1600, 6000, 0, 360, 0, 5240, 1720, 4800, 'run'],
    'October: выручка 11,600 «в т.ч. VAT 1,600» · команда 6,000 · налоги 360 · результат 5,240 «из него начислено налогов ≈ 1,720»; UK VAT за IV кв. — «ещё по плану» 4,800, three months of it, though the window holds one');
});

await run('p3', 'one figure, either chip — and money that is counted on today but has not come', async () => {
  const L = ledP();
  const P = await plan2();
  const M30 = await C(L, P);
  let M = await C(L, P, T, { H: 60 });
  figs(M, { IN: 23200, OUT: 18400, END: 36800, LOW: 27820, LOWDAY: '2026-11-20', free: 17720 }, '60 days');
  same([M.free, M.taxes, M.cards], [M30.free, M30.taxes, M30.cards], '… «Можно вывести», its tight day and its steps, the taxes and the cards are the same at 30 and at 60');
  const big = { ...P, other: P.other.concat([row('eq', 'Equipment', 15000, '2026-11-25')]) };
  for (const H of [30, 60]) {
    M = await C(L, big, T, { H });
    same([M.free.now, M.free.tight], [5980, { d: '2026-11-25', e: 12820, res: 1840, inbox: 0 }], `a one-off −15,000 on 25 Nov, at ${H} days: £5,900, the tight day is 25 Nov though the 30-day chip does not reach it`);
  }
  // 28 Oct: the statements show Client R and Person B paid; balances typed for 27 Oct; Client A is due today.
  const AT = ms('2026-10-27T09:00:00Z');
  const paidRows = [filed('sR', '2026-10-15', 236000, 'rev', 'Client R', { b: 'Tochka', cur: 'RUB', at: AT }), filed('sB', '2026-10-20', -6000, 'cogs', 'Person B', { at: AT })];
  const P28 = { ...P, banks: BALS('2026-10-27', 14000, 10000, 472000) };
  M = await C(ledP({ tx: paidRows }), P28, '2026-10-28');
  figs(M, { now: 28000, res: 5280, free: 17720 }, '28 Oct, Client A due today and not in the bank: the sum does not count on it');
  same([M.free.tight, M.free.wait, M.free.steps[0], states(M, ['rR@2026-10', 'rB@2026-10', 'rA@2026-10'])], [{ d: '2026-10-28', e: 27640, res: 4920, inbox: 0 }, { n: 1, gbp: 9600, name: 'Client A', date: '2026-10-28' }, { d: '2026-10-28', amt: 20980, by: 'Client A', date: '2026-10-28' }, ['done', 'done', 'due']],
    '«на счетах £27,640; £4,920 — налоги, £5,000 — запас. Client A £9,600 (ждали 28 окт) ещё не пришло» — and the first step is what its arrival frees');
  M = await C(ledP({ tx: paidRows.concat([filed('sA', '2026-10-28', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600, at: ms('2026-10-28T10:00:00Z') })]) }), P28, '2026-10-28');
  figs(M, { now: 37600, free: 20980 }, 'the payment is filed: the sum is the one the step named');
  same([M.free.wait, item(M, 'rA@2026-10').state], [null, 'done'], '… and nothing is waited for');
});

await run('p4', 'a written withdrawal: a budget the founders\' blocks use up, never late, never a card', async () => {
  const L = ledP();
  const P = await plan2();
  const wd = (amt, date, more = {}) => ({ ...P, div: P.div.concat([row('wd', 'Вывод', amt, date, { blk: 'div', ...more })]) });
  let M = await C(L, wd(17700, T));
  same([M.free.now, M.free.wd, M.free.why], [20, { gbp: 17700, n: 1, date: T }, ''], '«Вписать вывод» for the £17,700 on offer, today: «В плане уже выводы: £17,700 (6 окт). Сверх них — £0» (20 is under £100)');
  let Q = wd(10000, '2026-10-10');
  M = await C(L, Q);
  figs(M, { OUT: 16980, LOW: 18000, LOWDAY: '2026-10-20', free: 7720, now: 32000 }, '10,000 on 10 Oct instead');
  same([M.free.wd, M.outParts.div, item(M, 'wd').wd, M.cards.length], [{ gbp: 10000, n: 1, date: '2026-10-10' }, 10500, { from: '2026-09-30', to: '2026-10-30', got: 0 }, 0], '… «В плане уже выводы: £10,000 (10 окт). Сверх них сегодня можно вывести ещё £7,700»; it is in «дивиденды» of «Уйдёт»');
  // «Оплачено»
  M = await C(L, await wr(Q, 'mark', item(M, 'wd'), T, TAP, BY));
  figs(M, { now: 22000, free: 7720, OUT: 6980 }, '«Оплачено» on it: the money moves from the plan into «сейчас», the sum on offer stays');
  same([M.nowApprox, item(M, 'wd').done.by], [true, 'mark'], '… with «≈» on «сейчас»');
  // A week on: the statement shows it taken, in two transfers, by two founders.
  const AT = ms('2026-10-13T08:00:00Z');
  const took = [filed('w1', '2026-10-09', -6000, 'mika', '', { at: AT }), filed('w2', '2026-10-12', -4000, 'misha', '', { at: AT })];
  M = await C(ledP({ tx: took }), Q, '2026-10-13');
  figs(M, { now: 22000, free: 7720 }, '13 Oct, 6,000 and 4,000 taken: the same sum on offer');
  same([item(M, 'wd').state, item(M, 'wd').done.day, item(M, 'wd').rows, M.free.asOf, M.month.blocks.div.fact, M.month.blocks.div.rest, M.cards.length], ['done', '2026-10-12', ['w1', 'w2'], '2026-10-05', 10000, 0, 0],
    '… the row is done under 12 Oct; «По остаткам на 5 окт можно вывести £7,700»; the month\'s «Дивиденды» holds it once, as fact');
  M = await C(ledP({ tx: [took[0]] }), Q, '2026-10-13');
  figs(M, { now: 26000, free: 7720 }, 'with the first transfer alone');
  same([item(M, 'wd').state, item(M, 'wd').day, item(M, 'wd').cash, item(M, 'wd').wd.got, item(M, 'wd').part, M.month.blocks.div.fact, M.month.blocks.div.rest, M.cards.length], ['blind', '2026-10-13', -4000, 6000, { got: 6000, of: 10000 }, 6000, 4000, 0],
    '… «взято £6,000 из £10,000»: the 4,000 stands on today, is never late, raises no card');
  M = await C(ledP({ tx: [took[0], reach('Wise', '2026-10-30', 'GBP', ms('2026-10-31T08:00:00Z'))] }), Q, '2026-10-31');
  same([item(M, 'wd').state, item(M, 'wd').done.note, item(M, 'wd').done.got, item(M, 'wd').cash, M.cards.filter((c) => c.item === 'wd').length], ['done', 'taken', 6000, 0, 0], 'once the Wise statements reach 30 Oct, the end of its window, what was not taken is dropped');
  // 20,000
  Q = wd(20000, '2026-10-10');
  M = await C(L, Q);
  figs(M, { LOW: 8000, verdict: 'v1', free: 0 }, 'a withdrawal of 20,000');
  same([M.verdict.subs, M.verdict.lowRes, M.free.why, M.free.tight, M.free.steps.map((s) => [s.d, s.amt, s.by].join(' '))], [['tax'], 5280, 'cushion', { d: '2026-10-20', e: 8000, res: 5280, inbox: 0 }, ['2026-10-28 980 Client A', '2026-11-28 4240 Client A']],
    '… «В нижней точке £5,280 — деньги под налоги»; «Сверх них — £0: 20 окт без новых выводов на счетах будет £8,000»; «Когда придёт Client A (ждём 28 окт) — до £900»');
  // §5.23: a ≤ free(T), dated T, lowers free by exactly a; a founders' row lowers written withdrawals by its own amount at most
  for (const a of [500, 4000, 17720]) same((await C(L, wd(a, T))).free.now, 17720 - a, `a withdrawal of ${a} today lowers the sum on offer by exactly that`);
  const two = { ...P, div: P.div.concat([row('wdA', 'Вывод', 3000, '2026-10-08', { blk: 'div' }), row('wdB', 'Вывод 2', 5000, '2026-10-12', { blk: 'div' })]) };
  M = await C(ledP({ tx: [filed('w3', '2026-10-09', -4500, 'vanya', '', { at: AT })] }), two, '2026-10-13');
  same([item(M, 'wdA').state, item(M, 'wdB').wd.got, item(M, 'wdB').cash, item(M, 'wdA').rows, item(M, 'wdB').rows], ['done', 1500, -3500, ['w3'], ['w3']], 'one transfer of 4,500 against withdrawals of 3,000 and 5,000: it closes the first and what it has over passes on to the second — 4,500 in all, no more');
});

await run('p5', '«каждый месяц»: this month, this month and onward, the end of a repeat, a month switched off (R1–R5)', async () => {
  const L = ledP();
  const P = await plan2();
  const H60 = { H: 60 };
  let M = await C(L, P, T, H60);
  const oct = item(M, 'rB@2026-10');
  const nov = item(M, 'rB@2026-11');
  same([M.OUT, oct.occ, oct.date, nov.date], [18400, { ym: '2026-10', chain: 'rB', day: 20, from: '2026-10', to: '', until: '', last: false, exc: false, moved: false, stops: false }, '2026-10-20', '2026-11-20'], 'a month of a repeating row is an item of its own, <row id>@<month>');
  // «Только октябрь»
  let Q = await wr(P, 'set', oct, { amt: 6500 }, TAP, BY);
  same([Q.team[0].amt, Q.team[0].rec.x], [6000, { '2026-10': { amt: 6500 } }], '«Только октябрь»: the amount goes into that month\'s exception, the row is as it was');
  M = await C(L, Q, T, H60);
  same([M.OUT, item(M, 'rB@2026-10').occ.exc, item(M, 'rB@2026-11').amt], [18900, true, 6000], '… OUT 18,900; November is the row\'s');
  same((await wr(Q, 'set', item(M, 'rB@2026-10'), { amt: 6000 }, TAP, BY)).team[0].rec.x, undefined, '… and typed back to the row\'s own amount, the exception is gone');
  // «Октябрь и дальше» on the first month: no split
  Q = await wr(P, 'onward', oct, { amt: 6500 }, 'rB2', TAP, BY);
  same([Q.team.length, Q.team[0].amt, Q.team[0].rec], [1, 6500, { day: 20, from: '2026-10' }], '«Октябрь и дальше» on the row\'s first month changes the row itself');
  figs(await C(L, Q, T, H60), { OUT: 19400 }, '…');
  // «Ноябрь и дальше»: a split
  Q = await wr(P, 'onward', nov, { amt: 7000 }, 'rB2', TAP, BY);
  same(Q.team.map((r) => [r.id, r.amt, r.c0, r.rec]), [['rB', 6000, C0, { day: 20, from: '2026-10', to: '2026-10' }], ['rB2', 7000, C0, { day: 20, from: '2026-11', chain: 'rB' }]], '«Ноябрь и дальше»: the old row ends in October, a copy with the same c0 takes over from November and remembers its chain');
  M = await C(L, Q, T, H60);
  same([M.OUT, item(M, 'rB@2026-10').amt, item(M, 'rB@2026-11'), item(M, 'rB2@2026-11').occ.chain, M.helper.have.slice().sort(), M.helper.lines.some((l) => l.label === 'Person B')], [19400, 6000, null, 'rB', ['Client A', 'Client R', 'Tool S', 'Person B', 'HMRC Mika'].sort(), false],
    '… OUT 19,400, October\'s item is unchanged, every month has one occurrence, and the helper shows Person B under «Уже в плане»');
  // the tick taken off October
  Q = await wr(P, 'untick', oct);
  same(Q.team[0].rec, { day: 20, from: '2026-10', to: '2026-10' }, 'the tick taken off October\'s month: the repeat ends after it');
  M = await C(L, Q, T, H60);
  same([M.OUT, M.items.filter((it) => it.row === 'rB').map((it) => it.id)], [12400, ['rB@2026-10']], '… OUT 12,400, the row lives in that one month');
  same((await wr(Q, 'resume', oct)).team[0].rec, { day: 20, from: '2026-10' }, '… and «Вернуть» lets it go on');
  // November switched off
  Q = await wr(P, 'off', nov);
  same(Q.team[0].rec.x, { '2026-11': { off: true } }, 'November switched off for itself');
  M = await C(L, Q, T, H60);
  same([M.OUT, states(M, ['rB@2026-10', 'rB@2026-11', 'rB@2026-12'])], [12400, ['due', 'off', 'due']], '… OUT 12,400; December stays');
  // a one-off row typed first, then the same name made monthly
  Q = { ...P, team: P.team.concat([row('h1', 'Person H', 6300, '2026-11-20'), row('h2', 'Person H', 6000, '2026-10-20')]) };
  M = await C(L, Q, T, H60);
  same(item(M, 'h2').twins, [{ ym: '2026-11', id: 'h1', amt: 6300, cur: 'GBP' }], 'a one-off «Person H» in November, and a row «Person H» in October about to repeat: the model names the month that already has its own row');
  Q = await wr(Q, 'tick', item(M, 'h2'));
  same(Q.team.find((r) => r.id === 'h2').rec, { day: 20, from: '2026-10', x: { '2026-11': { off: true } } }, '«каждый месяц» ticked: the repeat is switched off in November');
  M = await C(L, Q, T, H60);
  const novH = (m) => m.items.filter((it) => it.name === 'Person H' && it.ym === '2026-11').reduce((a, it) => a - it.cash, 0);
  same([novH(M), item(M, 'h2@2026-11').state], [6300, 'off'], '… November counts 6,300 once (§5.32)');
  same(novH(await C(L, await wr(Q, 'on', item(M, 'h2@2026-11')), T, H60)), 12300, '[Включить]: 12,300');
  // §5.19: T and T+1 across a month's end give the same ids and amounts
  const a = await C(L, P, '2026-10-31', H60);
  const b = await C(L, P, '2026-11-01', H60);
  const ids = (m) => Object.fromEntries(m.items.filter((it) => it.src === 'occ').map((it) => [it.id, it.amt]));
  ok(Object.entries(ids(a)).every(([id, amt]) => !(id in ids(b)) || ids(b)[id] === amt) && Object.keys(ids(b)).filter((id) => !(id in ids(a))).every((id) => id.endsWith('@2027-03')), 'across the end of a month every month both days generate has the same id and amount; the later day only adds the month that came into reach', [Object.keys(ids(a)).length, Object.keys(ids(b)).length]);
  ok(b.OUT >= 0 && a.items.filter((it) => it.src === 'occ' && it.day).every((it) => { const z = item(b, it.id); return z && (z.day || z.state === 'missed' || z.state === 'doubt'); }), 'no occurrence leaves a figure because a date passed');
});

await run('p6', 'a month of a repeating row is paid by its label, whatever the sum (R7); one that nobody paid (R6)', async () => {
  const P = await plan2();
  const AT = ms('2026-10-22T08:00:00Z');
  const pay = (id, d, amt, at = AT) => filed(id, d, amt, 'cogs', 'Person B', { at });
  const D22 = '2026-10-22';
  const M0 = await C(ledP({ tx: [reach('Wise', '2026-10-20', 'GBP', AT)] }), P, D22);
  let M = await C(ledP({ tx: [pay('b1', '2026-10-20', -6000)] }), P, D22);
  let it = item(M, 'rB@2026-10');
  same([it.state, it.done.day, it.done.note, it.done.got, M0.OUT - M.OUT, M0.now - M.now], ['done', '2026-10-20', '', 6000, 6000, 6000], 'the statement shows −6,000 Person B on 20 Oct: October\'s month is done under that day');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400)] }), P, D22);
  it = item(M, 'rB@2026-10');
  same([it.state, it.done.note, it.done.got, it.amt, it.part, M0.OUT - M.OUT, M0.now - M.now, M.cards.filter((c) => c.item === it.id)], ['done', 'other', 5400, 6000, null, 6000, 5400, []], '−5,400 instead: done at 5,400 — «заплатили £5,400, в плане £6,000» — its line leaves OUT whole, and no card asks');
  same((await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), reach('Wise', '2026-12-15', 'GBP', AT)] }), P, '2026-12-16')).cards.filter((c) => c.item === 'rB@2026-10'), [], '… nor later');
  // «Частично» (the founder's decision of 7 October: the difference is a debt only when he says so). The hand is
  // called here as it was before the founder chose the day of the rest himself — with no day: it then writes a row
  // of the next month with no date, which is what a plan from before may still hold, and the engine reads it as it
  // did. With the day — as the question always gives it now — it is «dated rest», below.
  const PT = ms('2026-10-22T11:00:00Z');
  let Q = await wr(P, 'partial', it, 5400, 'debt', PT, BY, D22);
  same([Q.team[0].rec.x, Q.team[1]], [{ '2026-10': { paid: { on: D22, at: PT, by: BY, amt: 5400 } } }, { id: 'debt', name: 'Person B — остаток с октября', amt: 600, cur: 'GBP', bank: 'Wise', on: true, date: '', mon: '2026-11', c0: PT, m: { t: PT, by: BY }, blk: 'cogs', carry: { ym: '2026-10' }, sk: 'cogs|person b', skBy: 'hand' }],
    '«Частично», £5,400 of £6,000: the month is marked paid at 5,400, and the 600 becomes a row of NOVEMBER with no date, named after where it came from');
  let K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400)] }), Q, D22);
  same([item(K, 'rB@2026-10').state, item(K, 'rB@2026-10').done.note, item(K, 'rB@2026-10').done.got, item(K, 'debt').state, item(K, 'debt').day, item(K, 'debt').cash, item(K, 'debt').ym, K.OUT - M.OUT, K.now - M.now, item(K, 'rB@2026-11').cash, K.undated.n, card(K, 9)],
    ['done', 'partial', 5400, 'carry', '2026-11-01', -600, '2026-11', 600, 0, -6000, 0, []], '… October is closed at what was paid; the 600 the studio owes is in the line on 1 November though it has no date — the page must not look richer by it — and November\'s own month stands beside it untouched; no «без даты» card');
  same(K.months.by['2026-11'].team, { rows: ['rB@2026-11', 'debt'], expected: 6600, done: 0 }, '… and it is in November\'s list and total');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), reach('Wise', '2026-11-04', 'GBP', AT)] }), Q, '2026-11-05');
  same([item(K, 'debt').state, item(K, 'debt').day], ['carry', '2026-11-05'], '… once November has begun it is counted on today, until it gets a date');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400)] }), await wr(Q, 'set', item(K, 'debt'), { date: '2026-11-12' }, PT, BY), D22);
  same([item(K, 'debt').state, item(K, 'debt').day], ['due', '2026-11-12'], '… and with a date it is a row like any other');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), pay('b6', '2026-11-03', -600, ms('2026-11-04T08:00:00Z'))] }), Q, '2026-11-05');
  same([item(K, 'debt').state, item(K, 'debt').rows, item(K, 'rB@2026-11').state], ['done', ['b6'], 'due'], 'a payment of −600 to Person B on 3 Nov closes the debt, and leaves November\'s month alone');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), pay('b7', '2026-11-20', -6000, ms('2026-11-21T08:00:00Z'))] }), Q, '2026-11-22');
  same([item(K, 'debt').state, item(K, 'rB@2026-11').state, item(K, 'rB@2026-11').rows], ['carry', 'done', ['b7']], '… while −6,000 on 20 Nov is November\'s month, not the debt\'s: a payment that is exactly its own month\'s pays that month');
  // The same answer on an inflow: what a client still owes is counted nowhere until it has a date.
  const AI = await C(ledP({ tx: [filed('a1', '2026-10-28', 8000, 'rev', 'Client A', { b: 'Barclays', v: 1333.33, at: ms('2026-10-29T08:00:00Z') })] }), P, '2026-10-30');
  same([item(AI, 'rA@2026-10').state, item(AI, 'rA@2026-10').done.note, item(AI, 'rA@2026-10').done.got], ['done', 'other', 8000], 'Client A pays 8,000 of the 9,600: done — «пришло £8,000, в плане £9,600», and nothing is owed by itself');
  const QI = await wr(P, 'partial', item(AI, 'rA@2026-10'), 8000, 'owed', ms('2026-10-30T11:00:00Z'), BY, '2026-10-30');
  const KI = await C(ledP({ tx: [filed('a1', '2026-10-28', 8000, 'rev', 'Client A', { b: 'Barclays', v: 1333.33, at: ms('2026-10-29T08:00:00Z') })] }), QI, '2026-10-30');
  same([QI.inflows.find((r) => r.id === 'owed').amt, QI.inflows.find((r) => r.id === 'owed').vat, item(KI, 'owed').state, item(KI, 'owed').day, item(KI, 'owed').full, KI.IN - AI.IN, KI.undated.ids, item(KI, 'rA@2026-10').done.note],
    [1333.33, true, 'undated', '', 1600, 0, ['owed'], 'partial'], '«Частично» on it: the 1,600 still owed (1,333.33 + VAT) is a row of November without a date — in no figure until the founder dates it, and in the «без даты» card');
  // [И дальше так же]
  Q = await wr(P, 'same', it, 'rB2', TAP, BY);
  same(Q.team.map((r) => [r.id, r.amt, r.rec.from, r.rec.to || '', r.rec.chain || '']), [['rB', 6000, '2026-10', '2026-10', ''], ['rB2', 5400, '2026-11', '', 'rB']], '[И дальше так же]: a split from November at 5,400');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -9500)] }), P, D22);
  same([item(M, 'rB@2026-10').state, item(M, 'rB@2026-10').done.got, M0.OUT - M.OUT], ['done', 9500, 6000], '−9,500: done at 9,500, and OUT falls by the 6,000 that was written');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -3000)] }), P, D22);
  same([item(M, 'rB@2026-10').state, item(M, 'rB@2026-10').cash, item(M, 'rB@2026-10').part], ['waiting', -3000, { got: 3000, of: 6000 }], '−3,000, under 0.7: the other 3,000 stays open on its date');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -3000), reach('Wise', '2026-10-24', 'GBP', AT)] }), P, '2026-10-24');
  same(item(M, 'rB@2026-10').state, 'waiting', '… still inside its grace on the 24th');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -3000), reach('Wise', '2026-10-25', 'GBP', AT)] }), P, '2026-10-26');
  same([item(M, 'rB@2026-10').state, item(M, 'rB@2026-10').done.note, item(M, 'rB@2026-10').done.got, M.cards.filter((c) => c.item === 'rB@2026-10')], ['done', 'part', 3000, []], '… and once the Wise statements reach 25 Oct the month is done at 3,000 — never late');
  M = await C(ledP({ tx: [pay('b0', '2026-10-12', -1000), pay('b1', '2026-10-20', -6000)] }), P, D22);
  same([item(M, 'rB@2026-10').done.got, item(M, 'rB@2026-10').rows], [7000, ['b0', 'b1']], '−1,000 on the 12th and −6,000 on the 20th: done at 7,000');
  // A month nobody paid.
  const octPaid = pay('b1', '2026-10-20', -6000);
  M = await C(ledP({ tx: [octPaid, reach('Wise', '2026-12-04', 'GBP', AT)] }), P, '2026-12-05');
  it = item(M, 'rB@2026-11');
  same([it.state, it.lateDays, it.g, it.day, card(M, 8).filter((c) => c.item === it.id).length, item(M, 'rB@2026-12').state], ['late', 14, 5, '2026-12-05', 1, 'due'], '5 Dec, Wise up to 4 Dec, no Person B in November: November\'s month is late (14 days, grace 5), counted on today, card 8');
  let M21 = await C(ledP({ tx: [octPaid, reach('Wise', '2026-12-18', 'GBP', AT)] }), P, '2026-12-21');
  it = item(M21, 'rB@2026-11');
  const mid = M21.cards.filter((c) => [7, 8, 10, 11].includes(c.n));
  same([it.state, it.cash, it.day, it.exp, card(M21, 10).filter((c) => c.item === it.id).map((c) => [c.gbp, c.ym]), mid[0].item, mid.every((c, i) => !i || mid[i - 1].gbp >= c.gbp), item(M21, 'rB@2026-12').state, item(M21, 'rB@2026-12').day],
    ['missed', 0, '', 0, [[6000, '2026-11']], 'rB@2026-11', true, 'blind', '2026-12-21'], '21 Dec, Wise up to 18 Dec — December\'s window: November is given up, in no figure, card 10, ranked by its 6,000 among cards 7, 8 and 11; December\'s is counted on today');
  Q = await wr(P, 'partial', it, 0, 'owe', ms('2026-12-21T11:00:00Z'), BY, '2026-12-21');
  K = await C(ledP({ tx: [octPaid, reach('Wise', '2026-12-18', 'GBP', AT)] }), Q, '2026-12-21');
  same([item(K, 'rB@2026-11').state, item(K, 'rB@2026-11').done.note, item(K, 'rB@2026-11').done.got, item(K, 'owe').state, item(K, 'owe').name, K.OUT - M21.OUT, K.now, K.nowApprox === M21.nowApprox, card(K, 10).filter((c) => c.item === 'rB@2026-11'), item(await C(ledP({ tx: [octPaid, reach('Wise', '2027-01-15', 'GBP', AT)] }), Q, '2027-01-16'), 'owe').day],
    ['done', 'partial', 0, 'carry', 'Person B — остаток с ноября', 6000, M21.now, true, [], '2027-01-16'], '«Частично» with nothing paid — the studio still owes all of it: November is closed at £0, the 6,000 is a debt of December, OUT + 6,000, «сейчас» as it was, the card is gone, and it is still counted on 16 Jan');
  M = await C(ledP({ tx: [octPaid, reach('Wise', '2026-12-18', 'GBP', AT), pay('b3', '2026-12-20', -6000, ms('2026-12-22T08:00:00Z'))] }), Q, '2026-12-22');
  same(states(M, ['owe', 'rB@2026-12']), ['carry', 'done'], 'a row −6,000 of 20 Dec closes December\'s month, not the debt of November');
  same((await wr(P, 'stop', it)).team[0].rec, { day: 20, from: '2026-10', to: '2026-11', x: { '2026-11': { off: true } } }, '[Больше не повторять] on card 10: that month is the last, and is off');
  // a split, and October unpaid
  Q = await wr(P, 'onward', item(M0, 'rB@2026-11'), { date: '2026-11-25' }, 'rB2', TAP, BY);
  same(Q.team.map((r) => [r.id, r.rec.day, r.rec.to || '']), [['rB', 20, '2026-10'], ['rB2', 25, '']], 'Person B\'s day moved to the 25th from November on');
  M = await C(ledP({ tx: [reach('Wise', '2026-11-14', 'GBP', AT)] }), Q, '2026-11-15');
  same(item(M, 'rB@2026-10').state, 'late', '… October unpaid, Wise up to 14 Nov: late');
  M = await C(ledP({ tx: [reach('Wise', '2026-11-15', 'GBP', AT)] }), Q, '2026-11-16');
  same(item(M, 'rB@2026-10').state, 'missed', '… it is given up once Wise reaches 15 Nov — the window of the next month of its chain, across the split');
  M = await C(ledP({ tx: [pay('b2', '2026-11-25', -6000, ms('2026-11-26T08:00:00Z'))] }), Q, '2026-11-26');
  same(states(M, ['rB@2026-10', 'rB2@2026-11']), ['missed', 'done'], '… and −6,000 on 25 Nov pays November');
});

// ---- the founder's second decision of 7 October: the rest of a line paid in part stands on the day he names ----
// «p6», above, holds what the hand writes when it is given no day: a row of the next month with no date — the form a
// plan from before may still hold. Here the hand is given the day, as the question «Частично…» now always gives it.
await run('dated rest', '«Частично» with a day for the rest: a dated row like any other — in the same month, the next, two months on; for money coming in; and a rest of a rest keeps its name', async () => {
  const P = await plan2();
  const AT = ms('2026-10-22T08:00:00Z');
  const pay = (id, d, amt, at = AT) => filed(id, d, amt, 'cogs', 'Person B', { at });
  const D22 = '2026-10-22';
  const PT = ms('2026-10-22T11:00:00Z');
  const H60 = { H: 60 };
  const L = ledP({ tx: [pay('b1', '2026-10-20', -5400)] });
  const M = await C(L, P, D22);
  const M60 = await C(L, P, D22, H60);
  const oct = item(M, 'rB@2026-10');
  figs(M, { now: 26600, OUT: 11780, END: 28420, free: 16440 }, '22 Oct, Person B was paid 5,400 of the 6,000 and October\'s month is closed at that (the fixture of «p6»): thirty days');
  figs(M60, { OUT: 18400, END: 33400 }, '… and sixty');
  // What is written.
  const on = (d) => wr(P, 'partial', oct, 5400, 'debt', PT, BY, D22, d);
  let Q = await on('2026-11-12');
  same([Q.team[0].rec.x, Q.team[1], Q.team.length, Q.v], [{ '2026-10': { paid: { on: D22, at: PT, by: BY, amt: 5400 } } }, { id: 'debt', name: 'Person B — остаток с октября', amt: 600, cur: 'GBP', bank: 'Wise', on: true, date: '2026-11-12', c0: PT, m: { t: PT, by: BY }, blk: 'cogs', carry: { ym: '2026-10' }, sk: 'cogs|person b', skBy: 'hand' }, 2, 3],
    '«Частично», £5,400 of £6,000, the rest on 12 Nov: the month is marked paid at 5,400, and the 600 is a one-off row DATED 12 Nov, right under the row it came from — no `mon` (a dated row belongs to the month of its date), `carry` still saying which month the debt is from; the document is still version 3');
  const bare = await wr(P, 'partial', oct, 5400, 'debt', PT, BY, D22);
  same(await wr(bare, 'set', item(await C(L, bare, D22), 'debt'), { date: '2026-11-12' }, PT, BY), Q, '… the very document that «Частично» and then a date typed into the new row made until now: nothing new is stored');
  // In the next month.
  let K = await C(L, Q, D22);
  let K60 = await C(L, Q, D22, H60);
  same([item(K, 'rB@2026-10').state, item(K, 'rB@2026-10').done.note, item(K, 'rB@2026-10').done.got, item(K, 'debt').state, item(K, 'debt').day, item(K, 'debt').cash, item(K, 'debt').ym, K.OUT - M.OUT, K.END - M.END, K.now - M.now, K.undated.n, K.cards],
    ['done', 'partial', 5400, 'due', '2026-11-12', -600, '2026-11', 600, -600, 0, 0, []], '… October is closed at what was paid, and the 600 is planned on 12 Nov like any written payout: «Уйдёт» + 600, the end of the line − 600, «сейчас» as it was; nothing is «без даты», and nothing is asked');
  same([K60.months.by['2026-10'].team, K60.months.by['2026-11'].team, dayOf(K60, '2026-11-12').out, dayOf(K60, '2026-11-12').e, dayOf(K60, '2026-11-12').items, item(K60, 'rB@2026-11').state, item(K60, 'rB@2026-11').day, item(K60, 'rB@2026-11').cash],
    [{ rows: ['rB@2026-10'], expected: 5400, done: 5400 }, { rows: ['debt', 'rB@2026-11'], expected: 6600, done: 0 }, 600, 31820, ['debt'], 'due', '2026-11-20', -6000], '… the month it left expects what was paid, and has it; November\'s list holds the rest on the 12th and, untouched beside it, November\'s own month on the 20th');
  // In the same month; and on the very day of the next month's own payment.
  K = await C(L, await on('2026-10-30'), D22);
  same([item(K, 'debt').state, item(K, 'debt').day, item(K, 'debt').ym, K.OUT - M.OUT, K.months.by['2026-10'].team, K.months.by['2026-11'].team, [K.month.blocks.team.fact, K.month.blocks.team.rest, K.month.blocks.team.total]],
    ['due', '2026-10-30', '2026-10', 600, { rows: ['rB@2026-10', 'debt'], expected: 6000, done: 5400 }, { rows: ['rB@2026-11'], expected: 6000, done: 0 }, [5400, 600, 6000]], 'the rest in the SAME month, on 30 Oct: October\'s list holds both rows — 6,000 expected, 5,400 done — and the month keeps its whole: 5,400 paid, 600 still to go');
  K = await C(L, await on('2026-11-20'), D22);
  same([dayOf(K, '2026-11-20').out, dayOf(K, '2026-11-20').items, item(K, 'rB@2026-11').cash, item(K, 'debt').cash], [6600, ['rB@2026-11', 'debt'], -6000, -600], 'the rest on 20 Nov, the day of November\'s own payment: the day holds both — 6,600 — each a line of its own');
  K = await C(L, await on(D22), D22);
  same([item(K, 'debt').state, item(K, 'debt').day, K.OUT - M.OUT, M.free.now - K.free.now], ['due', D22, 600, 600], 'the rest on today itself: counted today, and «Можно вывести» is less by it at once');
  // Two months on, and past the days in view.
  Q = await on('2026-12-15');
  K = await C(L, Q, D22);
  K60 = await C(L, Q, D22, H60);
  same([item(K, 'debt').state, item(K, 'debt').day, K.OUT, K.END, K60.OUT, K60.END, K60.months.by['2026-12'].team, K60.months.by['2026-11'].team], ['due', '2026-12-15', 11780, 28420, 19000, 32800, { rows: ['debt', 'rB@2026-12'], expected: 6600, done: 0 }, { rows: ['rB@2026-11'], expected: 6000, done: 0 }],
    'the rest on 15 Dec, two months on: outside the thirty days it moves neither «Уйдёт» nor the end of the line, inside the sixty it does — and it is a row of December\'s list, not of November\'s');
  K60 = await C(L, await on('2027-01-10'), D22, H60);
  same([item(K60, 'debt').state, item(K60, 'debt').day, K60.OUT, K60.END, K60.free.now, K60.months.list, K60.months.by['2027-01'].team], ['due', '2027-01-10', 18400, 33400, 16440, ['2026-10', '2026-11', '2026-12', '2027-01'], { rows: ['debt', 'rB@2027-01'], expected: 6600, done: 0 }],
    'on 10 Jan, past the sixty days: due on its day and a row of January — a month the constructor now walks to — but in no figure of the sixty days, like any row a founder moves that far');
  // A payment that fits it closes it; past its day it is asked about, like any written payout.
  Q = await on('2026-11-12');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), pay('b6', '2026-11-03', -600, ms('2026-11-04T08:00:00Z'))] }), Q, '2026-11-05');
  same([item(K, 'debt').state, item(K, 'debt').rows, item(K, 'rB@2026-11').state], ['done', ['b6'], 'due'], 'a payment of −600 to Person B on 3 Nov, nine days before its day, closes the rest and leaves November\'s month alone');
  K = await C(ledP({ tx: [pay('b1', '2026-10-20', -5400), reach('Wise', '2026-11-19', 'GBP', ms('2026-11-20T08:00:00Z'))] }), Q, '2026-11-20', H60);
  same([item(K, 'debt').state, item(K, 'debt').day, item(K, 'debt').lateDays, card(K, 8).filter((c) => c.item === 'debt').map((c) => [c.name, c.gbp, c.date, c.account, c.cov, c.days])], ['late', '2026-11-20', 7, [['Person B — остаток с октября', 600, '2026-11-12', 'Wise GBP', '2026-11-19', 7]]],
    'not paid by 20 Nov, with Wise up to the 19th: late like any written payout — still counted, on today, and asked about in card 8 (a rest carried without a date was never asked about)');
  // A rest of a rest keeps the name and the month the debt first came from.
  K = await C(L, Q, D22);
  const Q2 = await wr(Q, 'partial', item(K, 'debt'), 200, 'debt2', ms('2026-11-12T11:00:00Z'), BY, '2026-11-12', '2026-12-10');
  const K2 = await C(L, Q2, '2026-11-12', H60);
  same([Q2.team.map((r) => [r.id, r.name, r.amt, r.date, r.carry || null]), Q2.team[1].paid.amt, states(K2, ['debt', 'debt2']), item(K2, 'debt').done.note, item(K2, 'debt').done.got, item(K2, 'debt2').day, item(K2, 'debt2').cash],
    [[['rB', 'Person B', 6000, '2026-10-20', null], ['debt', 'Person B — остаток с октября', 600, '2026-11-12', { ym: '2026-10' }], ['debt2', 'Person B — остаток с октября', 400, '2026-12-10', { ym: '2026-10' }]], 200, ['done', 'due'], 'partial', 200, '2026-12-10', -400],
    '«Частично» on the rest itself — 200 of the 600 on 12 Nov, the other 400 on 10 Dec: the new row keeps the name and the month the debt first came from — «Person B — остаток с октября», not «… — остаток с октября — остаток с ноября»');
  const bare2 = (await wr(Q, 'partial', item(K, 'debt'), 200, 'debt3', ms('2026-11-12T11:00:00Z'), BY, '2026-11-12')).team.find((r) => r.id === 'debt3');
  same([bare2.name, bare2.date, bare2.mon, bare2.carry], ['Person B — остаток с октября — остаток с ноября', '', '2026-12', { ym: '2026-11' }], '… (the hand called WITHOUT a day is the hand from before to the letter, on such a row too: no control of the page calls it so any more, and what a caller from before meant by it is kept)');
  // … and so does a rest a founder has since made «каждый месяц»: its months no longer say where the debt is from —
  // the engine reads `carry` only on a row that does not repeat — but the stored row does.
  const TK = await wr(Q, 'tick', item(K, 'debt'));
  const KT = await C(L, TK, D22, H60);
  const made = (await wr(TK, 'partial', item(KT, 'debt@2026-11'), 200, 'debt4', ms('2026-11-12T11:00:00Z'), BY, '2026-11-12', '2026-12-10')).team.find((r) => r.id === 'debt4');
  same([TK.team[1].rec, TK.team[1].carry, item(KT, 'debt@2026-11').carry, made.name, made.amt, made.date, made.carry], [{ day: 12, from: '2026-11' }, { ym: '2026-10' }, null, 'Person B — остаток с октября', 400, '2026-12-10', { ym: '2026-10' }],
    'the rest ticked «каждый месяц», then «Частично» on its November: what is left keeps the name and the month the debt first came from all the same — read off the stored row, not off the month, which carries no origin — and not «… — остаток с октября — остаток с ноября»');
  // Money coming in: what a client still owes is expected on the day named.
  const a1 = filed('a1', '2026-10-28', 8000, 'rev', 'Client A', { b: 'Barclays', v: 1333.33, at: ms('2026-10-29T08:00:00Z') });
  const AI = await C(ledP({ tx: [a1] }), P, '2026-10-30');
  const QI = await wr(P, 'partial', item(AI, 'rA@2026-10'), 8000, 'owed', ms('2026-10-30T11:00:00Z'), BY, '2026-10-30', '2026-11-10');
  const KI = await C(ledP({ tx: [a1] }), QI, '2026-10-30');
  const owed = QI.inflows.find((r) => r.id === 'owed');
  same([owed.name, owed.amt, owed.vat, owed.date, 'mon' in owed, owed.carry, item(KI, 'owed').state, item(KI, 'owed').day, item(KI, 'owed').cash, KI.IN - AI.IN, KI.END - AI.END, KI.undated.ids, card(KI, 9), item(KI, 'rA@2026-10').done.note, round2(per(KI, 'vat|2026Q4').accP - per(AI, 'vat|2026Q4').accP)],
    ['Client A — остаток с октября', 1333.33, true, '2026-11-10', false, { ym: '2026-10' }, 'due', '2026-11-10', 1600, 1600, 1600, [], [], 'partial', 266.67],
    'the same answer on an inflow — Client A paid 8,000 of the 9,600, the rest on 10 Nov: the 1,600 still owed (1,333.33 + VAT) is expected on that day — «Придёт» and the end of the line + 1,600, the quarter\'s VAT by the plan + 266.67 — and is in no «без даты» card');
  const KL = await C(ledP({ tx: [a1, reach('Barclays', '2026-11-19', 'GBP', ms('2026-11-20T08:00:00Z'))] }), QI, '2026-11-20', H60);
  same([item(KL, 'owed').state, item(KL, 'owed').step, item(KL, 'owed').day, KL.LATE, card(KL, 7).filter((c) => c.item === 'owed').map((c) => [c.gbp, c.date, c.days, c.step])], ['late', 1, '2026-11-20', 1600, [[1600, '2026-11-10', 9, 1]]], '… and if it has not come by 20 Nov, with Barclays up to the 19th, it is late like any written invoice: in «Ждём и не пришло», card 7');
});

await run('rest and month', 'a rest is never the month\'s own row of its label: a payment that fits both goes to the nearer date (a tie to the month), and the tick and the helper do not see it', async () => {
  const P = await plan2();
  const AT = ms('2026-10-22T08:00:00Z');
  const pay = (id, d, amt, at = AT) => filed(id, d, amt, 'cogs', 'Person B', { at });
  const H60 = { H: 60 };
  // Nobody paid Person B in November (as in «p6»). On 21 Dec «Частично» with £0: the whole 6,000 is still owed — a
  // rest of exactly a month's sum, which December's own payment fits as well as it fits December.
  const base = [pay('b1', '2026-10-20', -6000), reach('Wise', '2026-12-18', 'GBP', AT)];
  const M21 = await C(ledP({ tx: base }), P, '2026-12-21');
  const nov = item(M21, 'rB@2026-11');
  same([nov.state, card(M21, 10).filter((c) => c.item === nov.id).length], ['missed', 1], '21 Dec, Wise up to 18 Dec: November\'s month of Person B was never paid — given up, card 10');
  const owe = (d) => wr(P, 'partial', nov, 0, 'owe', ms('2026-12-21T11:00:00Z'), BY, '2026-12-21', d);
  let K = await C(ledP({ tx: base }), await owe('2026-12-28'), '2026-12-21');
  same([item(K, 'rB@2026-11').state, item(K, 'rB@2026-11').done.note, item(K, 'rB@2026-11').done.got, item(K, 'owe').state, item(K, 'owe').day, item(K, 'owe').name, K.OUT - M21.OUT, K.now, card(K, 10).filter((c) => c.item === 'rB@2026-11')],
    ['done', 'partial', 0, 'due', '2026-12-28', 'Person B — остаток с ноября', 6000, M21.now, []], '«Частично» with nothing paid, the rest on 28 Dec: November is closed at £0, the 6,000 is planned on the 28th — «Уйдёт» + 6,000, «сейчас» as it was — and the card is gone');
  // One payment of exactly 6,000, seen two days later: whose is it?
  const seen = async (rest, paidOn) => { const day = addDays(paidOn, 2); const X = await C(ledP({ tx: base.concat([pay('b3', paidOn, -6000, ms(day + 'T08:00:00Z'))]) }), await owe(rest), day); return [states(X, ['owe', 'rB@2026-12']), item(X, 'owe').rows, item(X, 'rB@2026-12').rows]; };
  same(await seen('2026-12-28', '2026-12-20'), [['due', 'done'], [], ['b3']], '−6,000 on 20 Dec, December\'s own day and eight days before the rest\'s: it is December\'s month — the rest stays planned on the 28th (given to the rest, December would be given up as unpaid in January while the debt was closed in its place)');
  same(await seen('2026-12-28', '2026-12-28'), [['done', 'late'], ['b3'], []], '−6,000 on 28 Dec, the day the founder named for the rest: it is the rest\'s — December\'s month is still owed, and late');
  same(await seen('2026-12-28', '2026-12-24'), [['due', 'done'], [], ['b3']], '−6,000 on 24 Dec, four days from each: a tie goes to the month');
  same(await seen('2026-12-22', '2026-12-24'), [['done', 'waiting'], ['b3'], []], '… and with the rest on 22 Dec the same payment is two days from it and four from the month: the rest\'s');
  K = await C(ledP({ tx: base.concat([pay('b3', '2026-12-20', -6000, ms('2026-12-22T08:00:00Z')), pay('b4', '2026-12-28', -6000, ms('2026-12-29T08:00:00Z'))]) }), await owe('2026-12-28'), '2026-12-30');
  same([states(K, ['owe', 'rB@2026-12']), item(K, 'owe').rows, item(K, 'rB@2026-12').rows], [['done', 'done'], ['b4'], ['b3']], 'both paid, on the 20th and on the 28th: each closes its own');
  K = await C(ledP({ tx: base.concat([pay('b3', '2026-12-20', -6000, ms('2026-12-22T08:00:00Z')), reach('Wise', '2027-01-12', 'GBP', ms('2027-01-13T08:00:00Z'))]) }), await owe('2026-12-28'), '2027-01-13', H60);
  same([states(K, ['owe', 'rB@2026-12', 'rB@2027-01']), item(K, 'owe').day, card(K, 8).filter((c) => c.item === 'owe').length, card(K, 10).filter((c) => c.item === 'rB@2026-12').length], [['late', 'done', 'due'], '2027-01-13', 1, 0],
    '13 Jan, with only the payment of 20 Dec: December is paid and nobody asks about it; what is still owed is the rest — late, counted on today, card 8 — so the 6,000 has not left the line');
  // The same rule for money coming in. Client A's October — 8,000 + VAT — never came: on 30 Oct «Частично» with £0,
  // the 9,600 still owed on 5 Dec. On 28 Nov, November's own day, 9,600 arrives.
  const MA = await C(ledP(), P, '2026-10-30', H60);
  const QA = await wr(P, 'partial', item(MA, 'rA@2026-10'), 0, 'owed', ms('2026-10-30T11:00:00Z'), BY, '2026-10-30', '2026-12-05');
  const a11 = filed('a11', '2026-11-28', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600, at: ms('2026-11-29T08:00:00Z') });
  K = await C(ledP({ tx: [a11] }), QA, '2026-11-29', H60);
  same([states(K, ['owed', 'rA@2026-11', 'rA@2026-12']), item(K, 'rA@2026-11').rows, item(K, 'owed').rows, item(K, 'owed').day, item(K, 'owed').cash], [['due', 'done', 'due'], ['a11'], [], '2026-12-05', 9600],
    'an inflow: Client A\'s October never came — «Частично» with £0, the 9,600 on 5 Dec — and 9,600 arrives on 28 Nov, November\'s own day: it is November\'s, and the rest is still expected on 5 Dec (given to the rest, November would go late and the months after it would not be counted on)');
  // A payment of the REST's own size is the rest's, though a month's window is open and that month's day is nearer.
  const b54 = pay('b1', '2026-10-20', -5400);
  const M54 = await C(ledP({ tx: [b54] }), P, '2026-10-22', H60);
  const Q54 = await wr(P, 'partial', item(M54, 'rB@2026-10'), 5400, 'debt', ms('2026-10-22T11:00:00Z'), BY, '2026-10-22', '2026-11-22');
  K = await C(ledP({ tx: [b54, pay('b6', '2026-11-19', -600, ms('2026-11-20T08:00:00Z'))] }), Q54, '2026-11-20', H60);
  same([states(K, ['debt', 'rB@2026-11']), item(K, 'debt').rows, item(K, 'rB@2026-11').rows, item(K, 'rB@2026-11').part, item(K, 'rB@2026-11').cash], [['done', 'due'], ['b6'], [], null, -6000],
    'a rest of 600 on 22 Nov, and −600 paid on 19 Nov — a day from November\'s own day, three from the rest\'s: it is the rest\'s all the same. Only a payment that is exactly what the MONTH lacks is weighed between the two; this one is no part of November\'s 6,000');
  // «The month's own row»: a one-off Person B of 20 Oct paid in part, the rest on 12 Nov.
  const D22 = '2026-10-22';
  const PT = ms('2026-10-22T11:00:00Z');
  const helperB = (X) => X.helper.lines.filter((l) => l.label === 'Person B').map((l) => [l.start, l.why, l.rows.map((r) => r.ym)]);
  const one = planP({ team: [row('pb', 'Person B', 6000, '2026-10-20')] });
  const O = await C(ledP(), one, D22, H60);
  same([item(O, 'pb').twins, helperB(O)], [[], [['2026-11', 'row', ['2026-10']]]], 'a one-off row «Person B» for 20 Oct: no later month holds a row of his, and the helper offers him from November — October is the founder\'s own row');
  const oneQ = await wr(one, 'partial', item(O, 'pb'), 4000, 'rest', PT, BY, D22, '2026-11-12');
  const OQ = await C(ledP(), oneQ, D22, H60);
  same([states(OQ, ['pb', 'rest']), item(OQ, 'rest').day, item(OQ, 'rest').ym, item(OQ, 'pb').twins, helperB(OQ)], [['done', 'due'], '2026-11-12', '2026-11', [], [['2026-11', 'row', ['2026-10']]]],
    '«Частично» 4,000 of it, the rest on 12 Nov: the rest is a row of November, but not «November\'s own row of Person B» — the row it came from has no twin there, and the helper still offers him from November, not from December');
  const ticked = await wr(oneQ, 'tick', item(OQ, 'pb'));
  const TK = await C(ledP(), ticked, D22, H60);
  same([ticked.team[0].rec, states(TK, ['pb@2026-10', 'pb@2026-11', 'rest']), item(TK, 'pb@2026-11').cash, TK.months.by['2026-11'].team], [{ day: 20, from: '2026-10', x: { '2026-10': { paid: { on: D22, at: PT, by: BY, amt: 4000 } } } }, ['done', 'due', 'due'], -6000, { rows: ['rest', 'pb@2026-11'], expected: 8000, done: 0 }],
    '«Повторять каждый месяц» on the row it came from: the repeat is NOT switched off in November — its own 6,000 stands on the 20th beside the 2,000 still owed for October');
  const two = planP({ team: [row('pb', 'Person B', 6000, '2026-10-20'), row('dec', 'Person B', 6300, '2026-12-20')] });
  const TQ = await C(ledP(), await wr(two, 'partial', item(await C(ledP(), two, D22, H60), 'pb'), 4000, 'rest', PT, BY, D22, '2026-11-12'), D22, H60);
  same([item(TQ, 'pb').twins, helperB(TQ)], [[{ ym: '2026-12', id: 'dec', amt: 6300, cur: 'GBP' }], [['2026-11', 'row', ['2026-10', '2026-12']]]], '… while a row a founder wrote for December is December\'s own as before: the tick would switch the repeat off there, and the helper knows of it');
});

// «Частично» is said first and the statement comes after: the commonest order of the two. The row that then shows the
// part is the marked line's own. The review of the day's change found it dealt to the REST of that very line —
// wherever the part was about the rest's size and the rest stood within ten days — or to the label's next month;
// the marked line then stayed closed on the founder's word, and what was still owed was in no figure.
await run('part shown', 'the row that then shows the part said with «Частично» is that line\'s own: it does not close the rest, and it does not pay the label\'s next month', async () => {
  const P = await plan2();
  const D22 = '2026-10-22';
  const PT = ms('2026-10-22T11:00:00Z');
  const U23 = ms('2026-10-23T08:00:00Z');
  const H60 = { H: 60 };
  const pay = (id, d, amt, at = U23) => filed(id, d, amt, 'cogs', 'Person B', { at });
  // Person B, 6,000 on the 20th of every month. On 22 Oct half of October's is paid, and the founder says so.
  const M = await C(ledP(), P, D22, H60);
  figs(M, { now: 32000, OUT: 24400, END: 32800 }, '22 Oct, sixty days: October\'s 6,000 to Person B is not in the statements yet');
  const half = (d) => (d ? wr(P, 'partial', item(M, 'rB@2026-10'), 3000, 'rest', PT, BY, D22, d) : wr(P, 'partial', item(M, 'rB@2026-10'), 3000, 'rest', PT, BY, D22));
  const Q = await half('2026-10-30');
  let K = await C(ledP(), Q, D22, H60);
  same([states(K, ['rB@2026-10', 'rest']), item(K, 'rB@2026-10').done.by, K.now, K.marksGbp, K.OUT, K.END], [['done', 'due'], 'mark', 29000, -3000, 21400, 32800],
    '«Частично» 3,000 of the 6,000, the rest on 30 Oct: October is closed on the mark, which is in «сейчас»; «Уйдёт» holds the other 3,000');
  // The next morning the Wise statement is uploaded, and shows −3,000 of 22 Oct.
  const seen = (X) => [states(X, ['rB@2026-10', 'rest', 'rB@2026-11']), item(X, 'rB@2026-10').done.by, item(X, 'rB@2026-10').rows, item(X, 'rB@2026-10').done.got, item(X, 'rest').rows, item(X, 'rest').day, item(X, 'rest').cash, X.now, X.marksGbp, X.OUT, X.END];
  const L23 = ledP({ tx: [pay('h1', '2026-10-22', -3000)] });
  K = await C(L23, Q, '2026-10-23', H60);
  same(seen(K), [['done', 'due', 'due'], 'row', ['h1'], 3000, [], '2026-10-30', -3000, 29000, 0, 21400, 32800],
    'the statement of the next morning shows −3,000 of 22 Oct: the row takes the place of October\'s mark. The rest — of exactly that size, eight days off — is still due on the 30th, and «Уйдёт» and the end of the line are what they were (given to the rest, everything read paid, and the 3,000 still owed was in no figure)');
  same([K.months.by['2026-10'].team, [K.month.blocks.team.fact, K.month.blocks.team.rest, K.month.blocks.team.total]], [{ rows: ['rB@2026-10', 'rest'], expected: 6000, done: 3000 }, [3000, 3000, 6000]], '… October\'s list has 3,000 of its 6,000, and the month still expects the other half');
  same(seen(await C(L23, await half(D22), '2026-10-23', H60)), [['done', 'waiting', 'due'], 'row', ['h1'], 3000, [], '2026-10-23', -3000, 29000, 0, 21400, 32800], 'the rest named for 22 Oct itself, the day of the payment: the row is the mark\'s all the same, and the rest is waited for — counted on today');
  same(seen(await C(L23, await half(''), '2026-10-23', H60)), [['done', 'carry', 'due'], 'row', ['h1'], 3000, [], '2026-11-01', -3000, 29000, 0, 21400, 32800],
    'a rest with NO date, as a plan from before holds it: the row is the mark\'s there too, and the debt stays in the line on 1 Nov. (The one thing such a plan reads otherwise than it did: before, this row closed the undated rest and the debt left every figure.)');
  K = await C(ledP({ tx: [pay('h1', '2026-10-22', -3000), pay('h2', '2026-10-30', -3000, ms('2026-10-31T08:00:00Z'))] }), Q, '2026-10-31', H60);
  same([states(K, ['rB@2026-10', 'rest']), item(K, 'rB@2026-10').rows, item(K, 'rest').rows], [['done', 'done'], ['h1'], ['h2']], 'the other half paid on the 30th: each row closes its own line — the first the month, the second the rest');
  // The row is the mark's when it is exactly the part said (within what any payout is allowed), uploaded after the
  // mark, and dated from three days before the mark to seven after — the days any mark is given.
  K = await C(ledP({ tx: [pay('h1', '2026-10-22', -3100)] }), Q, '2026-10-23', H60);
  same([states(K, ['rB@2026-10', 'rest']), item(K, 'rB@2026-10').rows, item(K, 'rB@2026-10').done.got, item(K, 'rest').cash], [['done', 'due'], ['h1'], 3100, -3000], '−3,100 shown for the 3,000 said — a fee on top: the part all the same, and the rest untouched');
  const late = async (paidOn, rest) => { const day = addDays(paidOn, 1); const X = await C(ledP({ tx: [pay('h1', paidOn, -3000, ms(day + 'T08:00:00Z'))] }), await half(rest), day, H60); return [states(X, ['rB@2026-10', 'rest']), item(X, 'rB@2026-10').done.by, item(X, 'rB@2026-10').rows, item(X, 'rest').rows]; };
  same([await late('2026-10-29', '2026-11-05'), await late('2026-10-30', '2026-11-05')], [[['done', 'due'], 'row', ['h1'], []], [['done', 'done'], 'ok', [], ['h1']]],
    '−3,000 on 29 Oct, seven days after the mark, with the rest on 5 Nov: still the mark\'s. On 30 Oct, eight days after: no longer — it is a payment within ten days of the rest\'s day and closes the rest, and October stays closed on the founder\'s word');
  // … and it is the PART that is claimed, not whatever the label pays in those days: another line's own payment is
  // that line's.
  const PB = { ...P, team: P.team.concat([row('bon', 'Person B', 500, '2026-10-24')]) };
  K = await C(ledP({ tx: [pay('h0', '2026-10-24', -500, ms('2026-10-25T08:00:00Z'))] }), await wr(PB, 'partial', item(await C(ledP(), PB, D22, H60), 'rB@2026-10'), 3000, 'rest', PT, BY, D22, '2026-10-30'), '2026-10-25', H60);
  same([states(K, ['bon', 'rB@2026-10', 'rest']), item(K, 'bon').rows, item(K, 'rB@2026-10').rows, item(K, 'rB@2026-10').done.got], [['done', 'done', 'due'], ['h0'], [], 3000], 'a one-off «Person B» of 500 for 24 Oct, paid on its day while October\'s mark still waits for its 3,000: the −500 is that row\'s, not a piece of the part');
  // … nor a row that was on the page before «Частично» was said: the founder saw it, and did not mean it.
  const PC = { ...P, team: P.team.concat([row('pb3', 'Person B', 3000, '2026-10-20')]) };
  const LC = ledP({ tx: [pay('h9', '2026-10-20', -3000, ms('2026-10-21T08:00:00Z'))] });
  K = await C(LC, await wr(PC, 'partial', item(await C(LC, PC, D22, H60), 'rB@2026-10'), 3000, 'rest', PT, BY, D22, '2026-10-30'), D22, H60);
  same([states(K, ['pb3', 'rB@2026-10', 'rest']), item(K, 'pb3').rows, item(K, 'rB@2026-10').done.by, item(K, 'rB@2026-10').rows], [['done', 'done', 'due'], ['h9'], 'mark', []],
    'a one-off «Person B» of 3,000 for 20 Oct, paid that day and already in the statements when October is said to be paid in part, 3,000 too: the row stays that row\'s — it was uploaded before the mark — and October\'s mark goes on waiting for its own');
  // One-off rows, a payout and an invoice: Person Z 2,000 with 1,000 paid and the rest on 29 Oct; Client A 5,000 +
  // VAT with 3,000 received and the rest on 30 Oct.
  const P2 = { ...P, team: P.team.concat([row('z', 'Person Z', 2000, D22)]), inflows: P.inflows.concat([row('y', 'Client A', 5000, D22, { vat: true, bank: 'Barclays' })]) };
  const M2 = await C(ledP(), P2, D22, H60);
  const Q2 = await wr(await wr(P2, 'partial', item(M2, 'z'), 1000, 'zrest', PT, BY, D22, '2026-10-29'), 'partial', item(M2, 'y'), 3000, 'yrest', PT + 1, BY, D22, '2026-10-30');
  K = await C(ledP(), Q2, D22, H60);
  figs(K, { now: 34000, IN: 28200, OUT: 25400, END: 36800 }, 'two one-off rows marked «Частично» on 22 Oct — Person Z 1,000 of 2,000, Client A 3,000 of 6,000 with its VAT: the two marks are in «сейчас», the two rests in «Придёт» and «Уйдёт»');
  K = await C(ledP({ tx: [filed('z1', '2026-10-22', -1000, 'cogs', 'Person Z', { at: U23 }), filed('y1', '2026-10-22', 3000, 'rev', 'Client A', { b: 'Barclays', v: 500, at: U23 })] }), Q2, '2026-10-23', H60);
  same([states(K, ['z', 'zrest', 'y', 'yrest']), item(K, 'z').done.by, item(K, 'z').rows, item(K, 'zrest').rows, item(K, 'y').done.by, item(K, 'y').rows, item(K, 'yrest').rows, item(K, 'zrest').cash, item(K, 'yrest').cash],
    [['done', 'due', 'done', 'due'], 'row', ['z1'], [], 'row', ['y1'], [], -1000, 3000], 'the statements show −1,000 and +3,000 of 22 Oct: each takes the place of its mark, and both rests are still open — what Person Z is owed, and what Client A owes');
  figs(K, { now: 34000, IN: 28200, OUT: 25400, END: 36800 }, '… so not a figure moves when the statements come: they show what the founder had said');
  K = await C(ledP({ tx: [filed('z1', '2026-10-21', -1000, 'cogs', 'Person Z', { at: U23 })] }), Q2, '2026-10-23', H60);
  same([item(K, 'z').done.by, item(K, 'z').rows, item(K, 'z').mark.counts, K.marksGbp, item(K, 'zrest').state, K.now], ['row', ['z1'], false, 3000, 'due', 34000],
    'paid the day BEFORE it was said, in a statement that stops on that day: the row closes the line at once — it stands in the place of the mark, and it, not the mark, is now what «сейчас» counts (the one mark left there is Client A\'s 3,000)');
  // A row the table has no name for closes by amount — and so would its rest.
  const P3 = { ...P, team: P.team.concat([every('nqm', 'Монтажёр', 1200, 18, '2026-10')]) };
  const M3 = await C(ledP(), P3, D22, H60);
  const Q3 = await wr(P3, 'partial', item(M3, 'nqm@2026-10'), 600, 'qrest', PT, BY, D22, '2026-10-30');
  K = await C(ledP({ tx: [filed('q1', '2026-10-22', -600, 'cogs', 'Nobody Q', { at: U23 })] }), Q3, '2026-10-23', H60);
  same([item(M3, 'nqm@2026-10').sk, states(K, ['nqm@2026-10', 'qrest']), item(K, 'nqm@2026-10').done.by, item(K, 'nqm@2026-10').rows, item(K, 'qrest').rows, item(K, 'qrest').cash], ['', ['done', 'due'], 'row', ['q1'], [], -600],
    '«Монтажёр», 1,200 on the 18th, a name the table does not know: 600 of October said paid, the rest on 30 Oct, and the bank then shows −600 to somebody it calls «Nobody Q» — the part, in the place of the mark; the rest is still due');
  // A second «Частично», on a rest: the row that shows that part is the rest's, not November's.
  const Q4 = await wr(P, 'partial', item(M, 'rB@2026-10'), 0, 'r1', PT, BY, D22, '2026-11-12');
  const K4 = await C(ledP(), Q4, '2026-11-12', H60);
  const Q5 = await wr(Q4, 'partial', item(K4, 'r1'), 5000, 'r2', ms('2026-11-12T11:00:00Z'), BY, '2026-11-12', '2026-12-10');
  K = await C(ledP(), Q5, '2026-11-12', H60);
  figs(K, { now: 27000, OUT: 20020, END: 41780 }, 'October was not paid at all — «Частично» with £0, the 6,000 on 12 Nov. On 12 Nov 5,000 of it is paid: «Частично» on the rest, the last 1,000 on 10 Dec');
  const b2 = pay('b2', '2026-11-12', -5000, ms('2026-11-13T08:00:00Z'));
  K = await C(ledP({ tx: [b2] }), Q5, '2026-11-13', H60);
  same([states(K, ['r1', 'r2', 'rB@2026-11']), item(K, 'r1').done.by, item(K, 'r1').rows, item(K, 'r1').done.got, item(K, 'rB@2026-11').rows, item(K, 'rB@2026-11').part, item(K, 'rB@2026-11').day, item(K, 'rB@2026-11').cash],
    [['done', 'due', 'due'], 'row', ['b2'], 5000, [], null, '2026-11-20', -6000], 'the statement shows −5,000 of 12 Nov: it is the rest\'s — November\'s own 6,000 is still due on the 20th, untouched (as a payment «of the label» it had paid November a week early, at 5,000, and November\'s 6,000 was in no figure)');
  figs(K, { now: 27000, OUT: 20020, END: 41780 }, '… and nothing moves');
  K = await C(ledP({ tx: [b2, pay('b3', '2026-11-20', -6000, ms('2026-11-21T08:00:00Z'))] }), Q5, '2026-11-21', H60);
  same([states(K, ['r1', 'r2', 'rB@2026-11']), item(K, 'r1').rows, item(K, 'rB@2026-11').rows, item(K, 'rB@2026-11').done.got], [['done', 'due', 'done'], ['b2'], ['b3'], 6000], 'November\'s own −6,000 on the 20th then pays November, at its sum; the last 1,000 is still owed on 10 Dec');
});

await run('p7', 'a client stops, and one who only skipped a month (R6)', async () => {
  const P = await plan2();
  const AT = ms('2026-11-20T08:00:00Z');
  const charge = (d, at = AT) => filed('bc' + d, d, -12, 'fixed', 'Barc charges', { b: 'Barclays', at });
  const cameA = (id, d, amt, at) => filed(id, d, amt, 'rev', 'Client A', { b: 'Barclays', v: round2(amt / 6), at });
  const L = ledP({ tx: [charge('2026-11-19')] });
  const D = '2026-11-20';
  let M = await C(L, P, D, { H: 60 });
  const oct = item(M, 'rA@2026-10');
  same([oct.state, oct.lateDays, oct.g, oct.step, oct.day, M.LATE, states(M, ['rA@2026-11', 'rA@2026-12']), card(M, 7).filter((c) => c.item === oct.id).map((c) => [c.stops, c.days, c.step]), per(M, 'vat|2026Q4').accP],
    ['late', 22, 5, 2, '', 9600, ['doubt', 'doubt'], [[true, 22, 2]], 0], '20 Nov, Barclays up to 19 Nov, no Client A: October is 22 days late — out of the line, in «Ждём и не пришло» — and November and December are not counted on: «следующие месяцы пока не считаю»');
  // … also across a split
  let Q = await wr(P, 'onward', item(M, 'rA@2026-11'), { amt: 9000 }, 'rA2', TAP, BY);
  same(states(await C(L, Q, D, { H: 60 }), ['rA@2026-10', 'rA2@2026-11', 'rA2@2026-12']), ['late', 'doubt', 'doubt'], '… also when his amount was changed «с ноября»');
  // [Перенести на…] 30 Nov
  Q = await wr(P, 'set', oct, { date: '2026-11-30' }, TAP, BY);
  same(Q.inflows[0].rec.x, { '2026-10': { date: '2026-11-30' } }, '[Перенести на…] writes the new date for that month alone');
  M = await C(L, Q, D, { H: 60 });
  same([item(M, 'rA@2026-10').day, item(M, 'rA@2026-10').ym, item(M, 'rA@2026-11').day, M.LATE, per(M, 'vat|2026Q4').accP, item(M, 'rA@2026-10').occ.moved], ['2026-11-30', '2026-11', '2026-11-28', 0, 4800, true], '… October\'s is in the line on 30 Nov, November\'s on the 28th, the quarter accrues its 4,800 again');
  M = await C(ledP({ tx: [charge('2026-11-19'), cameA('a1', '2026-11-29', 9600, ms('2026-12-01T08:00:00Z')), cameA('a2', '2026-11-30', 9600, ms('2026-12-01T08:00:00Z'))] }), Q, '2026-12-01');
  same([item(M, 'rA@2026-11').rows, item(M, 'rA@2026-10').rows], [['a1'], ['a2']], 'two payments, 29 and 30 Nov: the first is November\'s (a tie goes to the earlier date), the second October\'s');
  Q = await wr(P, 'set', oct, { date: '2026-12-20' }, TAP, BY);
  M = await C(ledP({ tx: [charge('2026-11-19'), charge('2026-12-15')] }), Q, '2026-12-16');
  same([item(M, 'rA@2026-10').state, item(M, 'rA@2026-10').day], ['due', '2026-12-20'], 'moved to 20 Dec instead: on 16 Dec it is still in the line, on the 20th — nothing expires with age');
  // he only skipped
  const AT5 = ms('2026-12-05T08:00:00Z');
  M = await C(ledP({ tx: [charge('2026-12-04', AT5), cameA('a1', '2026-11-28', 9600, AT5)] }), P, '2026-12-05', { H: 60 });
  same([states(M, ['rA@2026-10', 'rA@2026-11', 'rA@2026-12', 'rA@2027-01']), item(M, 'rA@2027-01').day, M.LATE, card(M, 7).filter((c) => c.item === 'rA@2026-10').map((c) => c.stops)], [['late', 'done', 'due', 'due'], '2027-01-28', 9600, [false]],
    'nothing moved, and he pays 9,600 on 28 Nov: November is done, December and January are counted, October keeps its card 7 without the sentence about later months');
  M = await C(ledP({ tx: [charge('2026-11-19'), cameA('a1', '2026-11-10', 8000, AT)] }), P, D);
  same([item(M, 'rA@2026-10').state, item(M, 'rA@2026-10').done.note, item(M, 'rA@2026-10').done.got, M.LATE, states(M, ['rA@2026-11'])], ['done', 'other', 8000, 0, ['due']], 'he pays 8,000 of the 9,600: done — «пришло £8,000, в плане £9,600» — nothing is waited for');
});

await run('p8', 'VAT paid — by another sum, late, from the wrong account, by hand (T6, T9)', async () => {
  const P = await plan2();
  const AT = ms('2026-11-10T08:00:00Z');
  const hmrc = (id, d, amt, more = {}) => filed(id, d, amt, 'tax', 'HMRC', { b: 'Barclays', at: AT, ...more });
  const cameA = filed('a1', '2026-10-28', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600, at: AT });
  const K = 'vat|2026Q3';
  const D = '2026-11-10';
  const M0 = await C(ledP({ tx: [cameA, reach('Barclays', '2026-11-09', 'GBP', AT)] }), P, D);
  same([per(M0, K).state, item(M0, 't|' + K).state, item(M0, 't|' + K).day, card(M0, 11).length], ['open', 'waiting', D, 0], '10 Nov, Barclays up to 9 Nov and no payment: the bill of 7 Nov is waited for, on today');
  let M = await C(ledP({ tx: [cameA, hmrc('h1', '2026-11-06', -4128)] }), P, D);
  let p = per(M, K);
  let it = item(M, 't|' + K);
  same([p.state, p.by, p.paid, p.left, it.state, it.done.day, it.done.got, M0.taxes.reserve - M.taxes.reserve, M0.now - M.now, M.cards.filter((c) => c.n >= 11)], ['paid', 'row', 4128, 0, 'done', '2026-11-06', 4128, 4800, 4128, []],
    '−4,128 to HMRC on 6 Nov, 0.86 of the 4,800: the quarter is closed whatever the difference — a done item under 6 Nov, the reserve falls by 4,800, «сейчас» by 4,128, no card');
  M = await C(ledP({ tx: [cameA, hmrc('h1', '2026-12-12', -4128, { at: ms('2026-12-14T08:00:00Z') })] }), P, '2026-12-15');
  same([per(M, K).state, per(M, K).paid], ['paid', 4128], 'the same payment on 12 Dec closes it as well');
  const L20 = ledP({ tx: [cameA, hmrc('h1', '2027-01-20', -4128, { at: ms('2027-01-24T08:00:00Z') })] });
  M = await C(L20, P, '2027-01-25');
  const c12 = card(M, 12);
  same([per(M, K).state, per(M, 'vat|2026Q4').state, c12.map((c) => [c.row, c.gbp, c.periods.map((x) => x.pname), c.mark])], ['late', 'open', [['h1', 4128, ['III кв. 2026', 'IV кв. 2026'], null]]],
    'on 20 Jan it closes neither quarter by itself — too late for III кв., and IV кв. cannot be paid while III кв. is owed — and card 12 offers both');
  let Q = await wr(P, 'pay', K, 'h1', false, TAP, BY);
  M = await C(L20, Q, '2027-01-25');
  same([per(M, K).state, per(M, K).by, per(M, K).paid, card(M, 12)], ['paid', 'parts', 4128, []], '[III кв. 2026]: closed at 4,128');
  same(card(await C(L20, P, '2027-01-25'), 11).filter((c) => c.key === K).map((c) => c.pays.map((x) => [x.id, x.gbp])), [[['h1', 4128]]], '[Оплачено] on card 11 first lists that payment');
  Q = await wr(P, 'pay', K, 'h1', true, TAP, BY);
  M = await C(L20, Q, '2027-01-25');
  same([per(M, K).state, per(M, K).by, Q.tax.per[K].paid, item(M, 't|' + K).done.by], ['paid', 'closed', undefined, 'row'], '[Это он — весь]: the same, and no mark is written');
  // a small payment from another account
  M = await C(ledP({ tx: [cameA, filed('h3', '2026-11-05', -300, 'tax', 'HMRC', { at: AT }), reach('Barclays', '2026-11-09', 'GBP', AT)] }), P, D);
  same([card(M, 12), M.taxes.periods.filter((x) => x.rows.includes('h3')), per(M, K).left], [[], [], 4800], '−300 to HMRC from Wise is nobody\'s: under a tenth of the VAT, and УСН takes no row from a pound account');
  // a part
  const L12 = ledP({ tx: [cameA, hmrc('h2', '2026-11-07', -1200)] });
  M = await C(L12, P, D);
  same([per(M, K).state, per(M, K).left, card(M, 12).map((c) => [c.row, c.periods.map((x) => x.key)])], ['open', 4800, [['h2', [K]]]], '−1,200 on 7 Nov (0.25): the period stays open and card 12 asks «За какой период этот платёж?»');
  Q = await wr(P, 'pay', K, 'h2', false, TAP, BY);
  M = await C(L12, Q, D);
  same([per(M, K).state, per(M, K).paid, per(M, K).left, item(M, 't|' + K).cash, card(M, 12)], ['parts', 1200, 3600, -3600, []], '[III кв. 2026]: paid 1,200, left 3,600 — «частями: £1,200 из ≈ £4,800»');
  Q = await wr(P, 'nopay', [K], 'h2', TAP, BY);
  M = await C(L12, Q, D);
  same([per(M, K).left, card(M, 12)], [4800, []], '[Другой налог]: 4,800 is still owed, and the card does not return');
  M = await C(ledP({ tx: [cameA, hmrc('h2', '2026-11-07', -1200), hmrc('h4', '2026-12-07', -1200, { at: ms('2026-12-08T08:00:00Z') })] }), Q, '2026-12-09');
  same(card(M, 12).map((c) => c.row), ['h4'], 'a second −1,200 on 7 Dec raises card 12 again, for itself');
  // «Оплачено» by hand
  const D7 = '2026-11-07';
  const MARK = ms('2026-11-07T11:00:00Z');
  const A7 = await C(ledP(), P, D7);
  Q = await wr(P, 'mark', item(A7, 't|' + K), D7, MARK, BY);
  same(Q.tax.per[K], { paid: { on: D7, at: MARK, by: BY } }, '«Оплачено» on 7 Nov with nothing in the statements writes a mark on the period');
  M = await C(ledP(), Q, D7);
  same([A7.now - M.now, M.nowApprox, per(M, K).state, per(M, K).by, item(M, 't|' + K).mark.counts, A7.taxes.reserve - M.taxes.reserve], [4800, true, 'paid', 'mark', true, 4800], '… «сейчас» −4,800 with «≈», the period is closed and reserves nothing');
  const LATER = ms('2026-11-09T08:00:00Z');
  M = await C(ledP({ tx: [hmrc('h1', '2026-11-06', -4128, { at: LATER })] }), Q, '2026-11-09');
  same([A7.now - M.now, per(M, K).by, per(M, K).paid, M.marksGbp], [4128, 'row', 4128, 0], 'then −4,128 of 6 Nov arrives: it takes the mark\'s place — «сейчас» −4,128, and no mark is counted');
  M = await C(ledP({ tx: [hmrc('h0', '2026-10-30', -4128, { at: LATER })] }), Q, '2026-11-09');
  same([A7.now - M.now, per(M, K).by, per(M, K).paid, M.marksGbp, item(M, 't|' + K).done.day], [4128, 'row', 4128, 0, '2026-10-30'], 'a payment made a week BEFORE the mark and filed after it takes the mark\'s place as well — «сейчас» −4,128, not the mark and the payment both: what counts is that the row was uploaded after the mark, not how near the mark it is dated');
  const L7 = ledP({ tx: [hmrc('h2', '2026-11-07', -1200, { at: LATER })] });
  M = await C(L7, Q, '2026-11-09');
  same([card(M, 12), card(M, 11), per(M, K).state, per(M, K).by, per(M, K).paid, per(M, K).left, A7.now - M.now, M.marksGbp, 'mark' in (card(M, 12)[0] || {})], [[], [], 'paid', 'row', 1200, 0, 1200, 0, false],
    '−1,200 arrives instead: marked is paid — the payment takes the mark\'s place, the quarter stays closed at 1,200, «сейчас» −1,200, and no card asks (the decision of 7 October)');
  let Q2 = await wr(Q, 'pay', K, 'h2', false, TAP, BY);
  M = await C(L7, Q2, '2026-11-09');
  same([Q2.tax.per[K].paid, per(M, K).left, per(M, K).state, M.taxes.reserve - (await C(L7, await wr(P, 'pay', K, 'h2', true, TAP, BY), '2026-11-09')).taxes.reserve], [undefined, 3600, 'parts', 3600], 'only a founder makes it a part: named «часть», the mark goes, 3,600 is owed and is in the reserve');
  M = await C(ledP({ tx: [reach('Barclays', '2026-11-20', 'GBP', ms('2026-11-21T08:00:00Z'))] }), Q, '2026-11-21');
  it = item(M, 't|' + K);
  same([per(M, K).state, per(M, K).by, per(M, K).left, it.state, it.day, card(M, 11).filter((c) => c.key === K), M.taxes.periods.some((x) => x.state === 'unseen'), A7.taxes.reserve - M.taxes.reserve, M.marksGbp],
    ['word', 'word', 0, 'done', '', [], false, 4800, 0], 'a statement to 20 Nov with no such payment: the period stays closed on the founder\'s word — not on today again, no card, nothing reserved, and the mark no longer in «сейчас»');
  same((await wr(Q, 'unmark', it)).tax.per[K], undefined, '«Вернуть» takes the mark off, and leaves no empty answer behind');
});

await run('p9', 'a tax row a founder typed: the whole bill, a part of it, a bill of its own (T11)', async () => {
  const L = ledP();
  const P = await plan2();
  const H60 = { H: 60 };
  const K = 'vat|2026Q3';
  const tx = (id, name, amt, date, of) => ({ ...P, taxes: P.taxes.concat([row(id, name, amt, date, { bank: 'Barclays', blk: 'tax', ...(of === undefined ? {} : { of }) })]) });
  let M = await C(L, tx('v', 'VAT Q3', 4500, '2026-11-07', { r: 'vat', p: '2026Q3' }), T, H60);
  same([M.OUT, item(M, 't|' + K), per(M, K).state, per(M, K).row, per(M, K).owed, per(M, K).left, per(M, K).approx, dayOf(M, '2026-11-06').res - dayOf(M, '2026-11-07').res], [18100, null, 'typed', 'v', 4500, 4500, false, 4500],
    '«VAT Q3» 4,500 saved as «Весь UK VAT за III кв. 2026»: OUT 18,100, one line for the period — the founder\'s — and the reserve holds 4,500 for it');
  figs(await C(L, tx('v', 'VAT Q3', 4500, '2026-11-07', false), T, H60), { OUT: 22900 }, 'saved as «Отдельный налог или платёж»: it adds');
  M = await C(L, tx('v', 'VAT Q3 часть', 1200, '2026-10-20', { r: 'vat', p: '2026Q3', part: true }), T, H60);
  same([M.OUT, item(M, 't|' + K).cash, per(M, K).state, per(M, K).parts], [18400, -3600, 'parts', ['v']], 'saved as «Часть UK VAT за III кв. 2026», 1,200 on 20 Oct: OUT 18,400 — the part and a computed 3,600');
  M = await C(L, tx('c', 'Corporation tax', 5500, '2026-11-01', false), T, H60);
  same([M.OUT, item(M, 't|' + K).cash, card(M, 13)], [23900, -4800, []], '«Corporation tax» 5,500 on 1 Nov saved as a bill of its own: OUT 23,900, the VAT item untouched');
  // rows from before v3 say nothing
  M = await C(L, tx('v', 'VAT Q3', 4500, '2026-11-07'), T, H60);
  same([M.OUT, item(M, 't|' + K), item(M, 'v').guess, item(M, 'v').of, card(M, 13).map((c) => [c.item, c.by, c.part, c.key, c.comp])], [18100, null, 'name', { r: 'vat', p: '2026Q3', part: false }, [['v', 'name', false, K, 4800]]],
    'a row from before v3 named «VAT Q3»: read by its name as the whole bill — OUT 18,100, card 13 «Пока считаю один раз — вашу строку»');
  M = await C(ledP({ tx: [filed('late', '2026-09-20', -99, 'cogs', 'Person Z', { at: AT1 })] }), { ...tx('c', 'Corporation tax', 5500, '2026-11-01'), team: P.team.concat([row('pz', 'Person Z', 99, '2026-09-10')]) }, T, H60);
  same([M.OUT - 99, item(M, 't|' + K).cash, item(M, 'c').guess, item(M, 'c').of, M.cards.map((c) => c.n), card(M, 13).map((c) => [c.item, c.by, c.key, c.comp])], [23900, -4800, 'size', null, [13, 8], [['c', 'size', K, 4800]]],
    '«Corporation tax» from before v3, a week before the VAT date at about its size: NOT read as the VAT — both count, and card 13 «Пока считаю оба» stands ahead of cards 7–11');
  // a personal tax typed into «Налоги»
  const Q = await wr(P, 'add', 'taxes', row('hv', 'HMRC Vanya', 400, '2026-10-21', { blk: 'tax' }));
  same([Q.taxes.length, Q.div.map((r) => [r.id, r.blk, !!r.ptax, r.f, 'of' in r])], [0, [['rT', 'div', true, 'mika', false], ['hv', 'div', true, 'vanya', false]]], '«HMRC Vanya» typed in «Налоги» is stored in «Дивиденды», as a personal tax');
  const A = await C(L, P);
  M = await C(L, Q);
  same([M.outParts.div - A.outParts.div, M.outParts.ptax - A.outParts.ptax, M.outParts.taxes - A.outParts.taxes, item(M, 'hv').ptax, item(M, 'hv').grp], [400, 400, 0, true, 'div'], '… «Уйдёт»: дивиденды + 400, налоги + 0');
});

await run('p10', 'a tax no statement shows: asked once, closable by hand, never late for ever (T9)', async () => {
  const P = await plan2();
  const AT = ms('2026-11-12T08:00:00Z');
  const K = 'usn|2026Q3';
  const D = '2026-11-12';
  const L = ledP({ tx: [reach('Tochka', '2026-11-11', 'RUB', AT)] });
  let M = await C(L, P, D);
  let it = item(M, 't|' + K);
  same([it.state, it.lateDays, it.day, card(M, 11).filter((c) => c.key === K).map((c) => [c.noPay, c.pays, c.account, c.gbp])], ['late', 14, D, [[true, [], 'Tochka RUB', 360]]], '12 Nov, Tochka up to 11 Nov, no tax row: УСН за III кв. is late, on today — card 11 with «Платежей по этому налогу в выписках ещё не было»');
  const MARK = ms('2026-11-12T11:00:00Z');
  const Q = await wr(P, 'mark', it, D, MARK, BY);
  const B = await C(L, Q, D);
  same([item(B, 't|' + K).state, card(B, 11).filter((c) => c.key === K), M.taxes.reserve - B.taxes.reserve, M.now - B.now, B.nowApprox, acct(B, 'Tochka|RUB').marks], ['done', [], 360, 360, true, -42480], '[Оплачено], with nothing to list: no item, no card, the reserve −360, «сейчас» −£360 (₽42,480 on the Tochka account) with «≈»');
  const L2 = ledP({ tx: [reach('Tochka', '2026-11-11', 'RUB', AT), reach('Tochka', '2026-11-20', 'RUB', ms('2026-11-21T08:00:00Z'))] });
  const Z = await C(L2, Q, '2026-11-21');
  const N = await C(L2, P, '2026-11-21');
  same([per(Z, K).state, per(Z, K).left, item(Z, 't|' + K).state, N.now - Z.now, Z.month.blocks.tax.fact, Z.month.byWord, card(Z, 11).filter((c) => c.key === K), card(Z, 12)], ['word', 0, 'done', 0, 0, 0, [], []],
    'after the next Tochka statement, with no such row and no tax payment on that account at all: closed on the founder\'s word — «сейчас» no longer lowered, in no fact of the month, and nobody is asked again');
  const A = await C(L, await wr(P, 'rule', 'usn', { away: true }, TAP, BY), D);
  same([A.items.filter((x) => x.src === 'tax' && x.tax.rule === 'usn'), A.taxes.periods.filter((x) => x.rule === 'usn').map((x) => x.state), M.taxes.reserve - A.taxes.reserve, card(A, 11).filter((c) => c.rule === 'usn')], [[], ['away', 'away', 'away'], 360 + 0, []].map((x) => x),
    '[Платим не со счетов студии] instead: no УСН item or reserve for any period, the accrual still shown');
});

await run('p11', 'VAT on a row: stored when it is saved, proposed per client and bank, changed only by a founder\'s own switch (T2)', async () => {
  const L = ledP();
  const P = await plan2();
  const A = await C(L, P);
  same([await vf(A, 'client n', 'Barclays'), await vf(A, 'client a', 'Barclays'), await vf(A, 'client a', 'Wise'), await vf(A, 'client r', 'Tochka'), await vf(A, 'client a website', 'Barclays')], [false, true, true, false, true], 'the tick the editor starts with: off for a client with no history, on for Client A (on any bank — he has paid through one only), off for Client R');
  let Q = await wr(P, 'add', 'inflows', row('n1', 'Client N', 5000, '2026-10-28', { bank: 'Barclays' }));
  let M = await C(L, Q);
  same([Q.inflows[2].vat, M.IN - A.IN, item(M, 'n1').vat], [false, 5000, false], 'Client N 5,000 on 28 Oct, unticked: every inflow stores `vat`, here false — IN + 5,000');
  // the tick, for a client with no mark and no history, also stores the mark
  Q = await wr(Q, 'set', item(M, 'n1'), { vat: true }, TAP, BY);
  same(await wr(Q, 'client', M, 'client n', 'vat'), { ...Q, tax: { ...Q.tax, cl: { 'client n': 'vat' } } }, '«+ VAT 20%» ticked: vat:true on the row, and the client is remembered as «UK, с VAT»');
  Q = await wr(Q, 'client', M, 'client n', 'vat');
  M = await C(L, Q);
  same([M.IN - A.IN, per(M, 'vat|2026Q4').accP - per(A, 'vat|2026Q4').accP, item(M, 'n1').cash, M.clients.find((c) => c.key === 'client n')], [6000, 1000, 6000, { key: 'client n', name: 'Client N', mark: 'vat', set: true, last: '', banks: [], show: true, rows: ['n1'], odd: 0 }], '… IN + 6,000, UK VAT за IV кв. accrues 1,000 more');
  M = await C(ledP({ tx: [filed('fn', '2026-10-28', 5000, 'rev', 'Client N', { b: 'Barclays', at: AT3 })] }), Q, '2026-10-29');
  same([item(M, 'n1').state, item(M, 'n1').done.note], ['done', 'novat'], 'a payment of 5,000 filed under Client N closes it — «без VAT»');
  M = await C(ledP({ tx: [filed('fn', '2026-10-28', 6000, 'rev', 'Client N', { b: 'Barclays', v: 1000, at: AT3 })] }), await wr(P, 'add', 'inflows', row('n1', 'Client N', 5000, '2026-10-28', { bank: 'Barclays' })), '2026-10-29');
  same([item(M, 'n1').state, item(M, 'n1').done.note], ['done', 'vat'], '… and the other way: a row without the tick paid at 6,000 is done «с VAT»');
  // an untick is the founder's own
  Q = await wr(P, 'add', 'inflows', row('a1', 'Client A', 1000, '2026-10-20', { bank: 'Barclays', vat: false }));
  M = await C(L, Q);
  same([M.IN - A.IN, item(M, 'a1').vat, item(M, 'rA@2026-10').vat], [1000, false, true], 'Client A 1,000 with the tick taken off: IN + 1,000 — what the founder saw is what the plan counts');
  // the switch in settings
  const n = (await wr(Q, 'client', M, 'client a', 'no'));
  same([n.tax.cl, n.inflows.map((r) => r.vat)], [{ 'client a': 'no' }, [false, false, false]], 'Client A set «международный, без VAT»: the mark is stored and the repeating row\'s `vat` goes off — one row changed');
  M = await C(L, n);
  same([item(M, 'rA@2026-10').cash, per(M, 'vat|2026Q3').accF, per(M, 'vat|2026Q4').accP, M.clients.find((c) => c.key === 'client a').odd, M.clients.find((c) => c.key === 'client a').set], [8000, 4800, 0, 6, true], '… its cash is 8,000; what the ledger says of the past is untouched — III кв. still 4,800 — and the six receipts that disagree with the mark are counted for the note');
  same((await wr(n, 'client', M, 'client a', null)).tax.cl, {}, '[Как в таблице] takes the mark off (and changes no row)');
  // a client invoiced both ways, through two banks
  const both = [];
  HALF.forEach((m, i) => { both.push(sheet('mb' + i, m + '-12', 1200, 'rev', 'Client M', { b: 'Barclays', v: 200 })); both.push(sheet('mw' + i, m + '-22', 1000, 'rev', 'Client M')); });
  const LM = ledP({ tx: both });
  const Pm = { ...P, inflows: P.inflows.concat([row('m1', 'Client M', 1000, '2026-10-12', { bank: 'Barclays', vat: true })]) };
  M = await C(LM, Pm);
  same([await vf(M, 'client m', 'Barclays'), await vf(M, 'client m', 'Wise'), M.clients.find((c) => c.key === 'client m').banks, M.clients.find((c) => c.key === 'client m').set], [true, false, [{ bank: 'Barclays', vat: true }, { bank: 'Wise', vat: false }], false], 'Client M — with VAT through Barclays, without through Wise: a new inflow on Barclays starts ticked, on Wise not');
  const M2 = await C(ledP({ tx: both.concat([filed('mx', '2026-10-05', 1000, 'rev', 'Client M', { at: AT1 }), filed('my', '2026-10-05', 900, 'rev', 'Client M', { at: AT1 })]) }), Pm);
  same(M2.items.filter((it) => it.src !== 'tax').map((it) => [it.id, it.full]), M.items.filter((it) => it.src !== 'tax').map((it) => [it.id, it.full]), 'two more Wise rows filed: the proposal may change, the cash of no written row does (§5.28)');
  const rev = (m) => m.taxes.periods.filter((x) => x.rule === 'vat').reduce((a, x) => a + x.accF, 0);
  same([rev(M), rev(await C(LM, { ...Pm, tax: { ...Pm.tax, cl: { 'client m': 'no', 'client a': 'no' } } }))], [4800 + 600, 4800 + 600], '§5.24: VAT accrued from facts is the sum of the ledger\'s own figure, whatever a mark says');
});

await run('p12', 'the upgrade v2 → v3: every stored row survives; what leaves is what the page had invented (§3.4)', async () => {
  // A ledger A could forecast from: Client A, Client D and Person B regular, Tool S a subscription.
  const rows = [sheet('z-client', '2025-06-10', 900, 'rev', 'Client Z'), sheet('z-person', '2025-06-12', 700, 'cogs', 'Person Z')];
  HALF.forEach((m, i) => { rows.push(sheet('ua' + i, m + '-28', 8000, 'rev', 'Client A'), sheet('ud' + i, m + '-25', 5000, 'rev', 'Client D'), sheet('ub' + i, m + '-20', 6000, 'cogs', 'Person B'), sheet('us' + i, m + '-03', 120, 'fixed', 'Tool S')); });
  const L = ledger(rows.concat([reach('Wise', '2026-10-05')]));
  const h = (list, sk, cyc, name, amt, date, more = {}) => ({ id: `h|${sk}|${cyc}`, name, amt, cur: 'GBP', bank: 'Wise', on: true, date, sk, cyc, src: 'hist', blk: sk.split('|')[0], c0: C0, m: { t: C0, by: BY }, ...more });
  const v2 = {
    v: 2, cushion: 7000, savedAt: '2026-10-06T08:00:00Z', log: [],
    banks: [bal('Wise', 'GBP', 10000, '2026-09-30')],
    inflows: [
      h('inflows', 'rev|client a', '2026-10', 'Client A', 8500, '2026-10-28', { sure: true }),
      row('d1', 'Client D', 850, '2026-10-20', { sure: true, blk: 'rev' }),
      h('inflows', 'rev|client d', '2026-10', 'Client D', 5000, '2026-10-30', { sure: false }),
      row('v1', 'Client V', 1000, '2026-10-15', { sure: true, vat: true, blk: 'rev' }),
    ],
    team: [
      row('x1', 'Person X', 700, '2026-10-12', { sure: true, blk: 'cogs', tx: ['some-row'], notx: ['other-row'] }),
      h('team', 'cogs|person b', '2026-10', 'Person B', 6000, '2026-10-25', { sure: false }),
      h('team', 'cogs|person g', '2026-09', 'Person G', 1500, '2026-09-30', { sure: false, paid: { on: T, at: TAP, by: BY, made: true } }),
    ],
    taxes: [
      row('t1', 'VAT за Q3 2026', 3800, '2026-11-05', { sure: true, blk: 'tax', sk: 'tax|vat|2026Q3' }),
      row('t2', 'HMRC Mika', 500, '2026-10-05', { sure: true, blk: 'tax' }),
    ],
    other: [
      h('other', 'fixed|tool s', '2026-10', 'Tool S', 120, '2026-10-03', { sure: false, on: false, offAt: C0 }),
      row('rent', 'Аренда', 900, '2026-10-01', { sure: true, blk: 'other', sk: 'm|аренда' }),
      row('draw', 'Mika', 3000, '2026-10-15', { sure: true, blk: 'mika' }),
    ],
    ser: { 'm|аренда': { made: true, amt: 900, cur: 'GBP', day: 1, bank: 'Wise', blk: 'other', name: 'Аренда', by: BY, at: C0 }, 'rev|client k': { off: true, by: BY, at: C0 } },
    tails: { rev: { on: true }, cogs: { on: false } }, vat: { on: false }, cautious: { on: true },
  };
  const X = await up(v2, L);
  const all = ['inflows', 'team', 'taxes', 'other', 'div'].flatMap((k) => X[k].map((r) => ({ k, ...r })));
  const r = (id) => all.find((x) => x.id === id) || null;
  same([X.v, X.cushion, 'ser' in X, 'tails' in X, 'vat' in X, 'cautious' in X, X.tax.rules.map((q) => [q.id, q.on, !!q.ask]), X.tax.cl, X.tax.per, 'since' in X.tax], [3, 7000, false, false, false, false, [['vat', false, false], ['usn', true, true]], {}, {}, false],
    'v:3; ser, tails, cautious and vat are gone; the two built-in rules — UK VAT off, as «Считать VAT» was, УСН waiting for its answer; the page stamps `since` when it saves');
  same([r('x1'), r('d1').amt], [{ k: 'team', ...v2.team[0], sure: undefined }, 850].map((x) => JSON.parse(JSON.stringify(x))), 'a typed row is as it was, with its links');
  same([['h|rev|client a|2026-10', 'h|cogs|person b|2026-10', 'h|rev|client d|2026-10'].map((id) => [r(id).amt, r(id).date, r(id).sk, r(id).skBy, 'src' in r(id) || 'cyc' in r(id) || 'sure' in r(id)]), r('h|fixed|tool s|2026-10')],
    [[[8500, '2026-10-28', 'rev|client a', 'hand', false], [6000, '2026-10-25', 'cogs|person b', 'hand', false], [4150, '2026-10-30', 'rev|client d', 'hand', false]], null],
    'the forecast rows a founder touched are one-off rows: 8,500 as confirmed; 6,000 on its moved date; 4,150 for Client D — the 5,000 A counted less the 850 typed beside it; the row that only said «в этом месяце не будет» is gone');
  same([r('h|cogs|person g|2026-09').paid, r('h|cogs|person g|2026-09').amt], [{ on: T, at: TAP, by: BY }, 1500], 'a marked one keeps its mark');
  same([r('rent').rec, r('rent').k, r('rent').amt, 'sk' in r('rent')], [{ day: 1, from: '2026-10' }, 'other', 900, false], '«каждый месяц» now lives on the row it was ticked on: rec {day 1, from October}');
  same([r('t1').of, 'sk' in r('t1'), r('t1').k, r('t2').k, r('t2').ptax, r('t2').f, r('draw').k, r('draw').blk, r('draw').f, !!r('draw').ptax], [{ r: 'vat', p: '2026Q3' }, false, 'taxes', 'div', true, 'mika', 'div', 'div', 'mika', false],
    'the edited VAT item is that quarter\'s whole bill; the founder\'s tax and the founder\'s draw are in «Дивиденды», the first as a personal tax');
  same(X.inflows.map((q) => q.vat), [false, false, false, true], 'every inflow says whether it carries VAT: what it said before');
  same(await up(X, L), X, 'the upgrade is idempotent: a v3 plan comes back as it went in');
  same(await up(v2, L), X, '… and pure: the same documents give the same plan');
  // nothing a founder wrote changed its money
  const M = await C(L, X);
  same(['h|rev|client a|2026-10', 'd1', 'h|rev|client d|2026-10', 'v1', 'x1', 'h|cogs|person b|2026-10', 't1', 't2', 'rent@2026-10', 'rent@2026-11', 'draw'].map((id) => item(M, id) && item(M, id).full), [8500, 850, 4150, 1200, -700, -6000, -3800, -500, -900, -900, -3000],
    '… each line is worth what A counted for it — the row with «+ VAT» too, 1,200 for its 1,000, though «Считать VAT» was off and the rule is: a rule that is off is not worked out, the client pays it all the same (§5.30)');
  same([M.taxes.rate, M.inParts.vat, per(M, 'vat|2026Q4')], [20, 200, null], '… its VAT is inside «Придёт» (£200), and nothing is accrued or reserved for a rule that is off');
  same([item(M, 'h|cogs|person g|2026-09').state, M.taxes.periods.filter((p) => p.rule === 'vat').length, M.taxes.periods.filter((p) => p.rule === 'usn').every((p) => p.state === 'ask')], ['done', 0, true], '… the marked row is done; the rule that is off has no periods, the one not confirmed counts nowhere');
  // the helper afterwards
  const pb = M.helper.lines.find((l) => l.label === 'Person B');
  same([pb.start, pb.why, pb.row, M.helper.lines.map((l) => l.label).sort(), M.helper.have], ['2026-11', 'row', { ym: '2026-10', amt: 6000, cur: 'GBP' }, ['Client A', 'Client D', 'Person B', 'Tool S'], []], 'the helper then offers Person B «с ноября» — «в октябре уже есть строка £6,000»');
  const Y = await wr(X, 'helper', [pb], ['pbr'], TAP, BY);
  const N = await C(L, Y);
  same(N.items.filter((it) => it.name === 'Person B' && it.ym === '2026-10').map((it) => it.full), [-6000], '… October holds 6,000 once');
  // «каждый месяц» beside another stored row of the same name. Deliverable A took a typed row out of its series'
  // month; the upgrade must not count that month twice — and must put the repeat on the row that was ticked.
  const rentPlan = (other, ser) => ({ v: 2, cushion: 5000, savedAt: '2026-10-06T08:00:00Z', log: [], banks: [bal('Wise', 'GBP', 10000, '2026-09-30')], inflows: [], team: [], taxes: [], other, ser: { 'm|аренда': { made: true, amt: 900, cur: 'GBP', bank: 'Wise', blk: 'other', name: 'Аренда', by: BY, at: C0, ...ser } }, tails: {}, vat: { on: true }, cautious: { on: false } });
  const rr = (id, amt, date, more = {}) => row(id, 'Аренда', amt, date, { sure: true, blk: 'other', ...more });
  const byMonth = (Mx, ym) => Mx.items.filter((it) => it.name === 'Аренда' && it.ym === ym && it.state !== 'off').map((it) => [it.id, it.full]);
  let U = await up(rentPlan([rr('rent', 900, '2026-10-01', { sk: 'm|аренда' }), rr('rentN', 950, '2026-11-01')], { day: 1 }), L);
  let MU = await C(L, U, T, { H: 60 });
  same([U.other.map((q) => [q.id, q.rec || null]), byMonth(MU, '2026-10'), byMonth(MU, '2026-11'), byMonth(MU, '2026-12')], [[['rent', { day: 1, from: '2026-10', x: { '2026-11': { off: true } } }], ['rentN', null]], [['rent@2026-10', -900]], [['rentN', -950]], [['rent@2026-12', -900]]],
    'a row ticked «каждый месяц» in October and a typed row of the same name in November: the repeat is switched off in November (rec.x.off, as the tick itself does) — November is the typed 950 once, not 1,850; December repeats');
  U = await up(rentPlan([rr('rentS', 900, '2026-09-01', { paid: { on: '', legacy: true } }), rr('rent', 900, '2026-10-08', { sk: 'm|аренда' })], { day: 8 }), L);
  MU = await C(L, U, T, { H: 60 });
  same([U.other.map((q) => [q.id, q.rec || null, !!q.paid]), byMonth(MU, '2026-10'), byMonth(MU, '2026-09')], [[['rentS', null, true], ['rent', { day: 8, from: '2026-10' }, false]], [['rent@2026-10', -900]], [['rentS', -900]]],
    'an older paid row of the same name and the row that was ticked (it carries the series\' key): the repeat goes to the ticked row, from October — October is 900 once — and September\'s row stays a one-off with its mark');
  U = await up(rentPlan([rr('rent', 900, '2026-10-01', { sk: 'm|аренда' }), rr('rentX', 300, '2026-11-10', { extra: true })], { day: 1 }), L);
  MU = await C(L, U, T, { H: 60 });
  same([U.other[0].rec, byMonth(MU, '2026-11')], [{ day: 1, from: '2026-10' }, [['rent@2026-11', -900], ['rentX', -300]]], '… while a row a founder had marked «это сверх обычного» is counted beside the repeat, as it was');
  // v1 → v3 in one step
  const v1 = { cushion: 4000, savedAt: '2026-09-20T10:00:00Z', banks: [{ id: 'r1', name: 'Wise — GBP', bank: 'Wise', cur: 'GBP', amt: 18000, on: true }], inflows: [{ id: 'r2', name: 'Client A', amt: 8000, cur: 'GBP', bank: 'Wise', date: '2026-10-28', on: true }], team: [], taxes: [], other: [{ id: 'r3', name: 'Подписки', amt: 300, cur: 'GBP', bank: 'Wise', date: '', on: true, paid: true }] };
  const Z = await up(v1, L);
  same([Z.v, Z.banks[0].legacy, Z.inflows[0].vat, Z.inflows[0].c0, /^r\d+$/.test(Z.inflows[0].id), Z.other[0].paid, Z.div, Z.tax.rules.length], [3, true, false, 0, false, { on: '', legacy: true }, [], 2], 'a v1 plan becomes v3 in one step: ids that last, balances to be confirmed, the old «оплачено» a founder\'s word');
});

await run('p13', 'no balance; an old balance', async () => {
  const L = ledP();
  const P = await plan2();
  let M = await C(L, { ...P, banks: BALS().slice(0, 2) });
  same([M.verdict.id, M.missing, M.IN, M.OUT, M.free, M.now, M.taxes.reserve], ['v0', ['Tochka|RUB'], 11600, 6980, null, null, null], 'the Tochka balance is not typed: «Нет остатка: Tochka RUB… По плану за 30 дней придёт £11,600 и уйдёт £6,980»; no sum to take out');
  M = await C(L, { ...P, banks: BALS('2026-09-28') });
  same([M.free.now, M.free.why, M.free.asOf, M.verdict.asOf, M.nowIsToday], [17720, '', '2026-09-28', '2026-09-28', false], 'balances typed for 28 Sep, eight days old: «По остаткам на 28 сен можно вывести £17,700 — минус всё, что взяли после 28 сен»');
  M = await C(L, { ...P, banks: BALS('2026-09-28') }, '2026-10-07');
  same([M.free.why, M.free.asOf], ['stale', '2026-09-28'], 'a day later they are nine days old: no sum — «Остатки от 28 сен — впишите свежие»');
});

await run('p14', 'a thin plan is a state, not a footnote', async () => {
  const L = ledP();
  let P = await usnYes(planP());
  let M = await C(L, P);
  P = await wr(P, 'shut', card(M, 14)[0], TAP, BY);
  M = await C(L, P);
  const line = (name) => M.helper.lines.find((l) => l.label === name);
  let Q = await wr(P, 'helper', paidAlready([line('Tool S')]), ['rS'], C0, BY);
  let N = await C(L, Q);
  same([N.free.why, N.verdict.id, N.free.thin, N.empty], ['thin', 'vT', { from: '2026-10-06', to: '2026-11-05', plan: 120, usual: 6120, month: '2026-10', half: true }, false], 'only Tool S is in the plan: no sum, verdict vT, both naming 6 окт – 5 ноя with £120 of the usual £6,120, and October as the month to fill');
  Q = await wr(P, 'helper', paidAlready([line('Tool S'), line('Person B')]), ['rS', 'rB'], C0, BY);
  Q.team[0].rec.to = '2026-10';
  N = await C(L, Q);
  same([N.free.why, N.verdict.id, N.free.thin], ['thin', 'vT', { from: '2026-11-06', to: '2026-12-06', plan: 120, usual: 6120, month: '2026-11', half: true }], 'Person B as well, ended after October: thin by the second slice, 6 ноя – 6 дек');
  Q = await wr(P, 'helper', paidAlready([line('Tool S'), { ...line('Person B'), amt: 4200 }]), ['rS', 'rB'], C0, BY);
  N = await C(L, Q);
  same([N.free.why, N.verdict.id, N.free.now > 0, N.free.thin], ['', 'v1', true, { from: '2026-10-06', to: '2026-11-05', plan: 4320, usual: 6120, month: '2026-10', half: false }], 'Person B at 4,200 a month (0.71 of usual): the sum is shown, with the line «В плане … расходов на команду и прочее — £4,320; обычный месяц — £6,120»');
  // noout: a plan with inflows only
  Q = await wr(P, 'helper', [line('Client A')], ['rA'], C0, BY);
  N = await C(L, Q);
  same([N.free.why, N.free.fill, N.verdict.id, N.empty], ['noout', '2026-10', 'vT', false], 'inflows only: «Сколько можно вывести, скажу, когда в плане будут расходы… заполните октябрь»');
});

await run('p16', 'a quarter before the start, paid in parts (T10)', async () => {
  const two = [['2026-08-07', 1150], ['2026-09-07', 1150]];
  const L = ledP({ hmrc: two });
  const K = 'vat|2026Q2';
  let P = planP();
  let M = await C(L, P, T, { H: 60 });
  const c = card(M, 14).find((x) => x.key === K);
  same([c.acc, c.found, c.count, c.rest, c.rows, c.parts, c.bank, c.payCur, per(M, K).state, per(M, K).asked, per(M, K).item, M.taxes.reserve, M.OUT], [4800, 2300, 2, 2500, ['ph0', 'ph1'], { amt: 1150, day: 7, from: '2026-10', to: '2026-11', n: 2, last: 1350 }, 'Barclays', 'GBP', 'ask', true, '', 7300, 4800],
    'day one: card 14 «UK VAT за II кв. 2026: начислено ≈ £4,800, платежей найдено на £2,300 (2)… Остаток ≈ £2,500 ещё платите?» — no item for it, and the 2,500 is in the reserve until answered');
  ok(M.cards[0].n === 14 && !card(M, 12).length, '… the card stands first, and no payment is asked about');
  // [Да, частями как раньше]
  let Q = await wr(P, 'parts', c, 'pp', TAP, BY);
  same([Q.tax.per[K].tx, Q.taxes.map((r) => [r.id, r.name, r.amt, r.cur, r.bank, r.of, r.rec])], [['ph0', 'ph1'], [['pp', 'UK VAT за II кв. 2026 — часть', 1150, 'GBP', 'Barclays', { r: 'vat', p: '2026Q2', part: true }, { day: 7, from: '2026-10', to: '2026-11', x: { '2026-11': { amt: 1350 } } }]]],
    '[Да, частями как раньше]: the payments found are named, and a tax row is written on the rhythm seen — 1,150 on the 7th, October and November, the last month what is then left');
  M = await C(L, Q, T, { H: 60 });
  same([M.items.filter((it) => it.row === 'pp').map((it) => [it.id, it.cash, it.day]), per(M, K).state, per(M, K).left, per(M, K).item, M.taxes.reserve, card(M, 14), dayOf(M, '2026-10-06').res - dayOf(M, '2026-10-07').res], [[['pp@2026-10', -1150, '2026-10-07'], ['pp@2026-11', -1350, '2026-11-07']], 'parts', 0, '', 7300, [], 1150],
    '… the items are −1,150 on 7 Oct and −1,350 on 7 Nov, there is no computed item beside them, the reserve is 7,300 and falls as each part leaves');
  const AT = ms('2026-10-08T08:00:00Z');
  const p7 = filed('p7', '2026-10-07', -1150, 'tax', 'HMRC', { b: 'Barclays', at: AT });
  M = await C(ledP({ hmrc: two, tx: [p7] }), Q, '2026-10-08');
  same([item(M, 'pp@2026-10').state, item(M, 'pp@2026-10').rows, card(M, 12), per(M, K).paid, M.taxes.reserve], ['done', ['p7'], [], 3450, 4800 + 1350], 'a payment of 1,150 on 7 Oct, uploaded later, closes October\'s part and raises no card 12');
  // [Нет, закрыто]
  M = await C(L, await wr(P, 'shut', c, TAP, BY));
  same([M.taxes.reserve, per(M, K).state, card(M, 14)], [4800, 'paid', []], '[Нет, закрыто] instead: the reserve is 4,800');
  // [Да, одной суммой]
  Q = await wr(P, 'lump', c, T, TAP, BY);
  M = await C(L, Q);
  same([item(M, 't|' + K).cash, item(M, 't|' + K).day, per(M, K).state, M.taxes.reserve], [-2500, T, 'parts', 7300], '[Да, одной суммой]: an ordinary open period — 2,500 on today, to be moved by «Перенести на…»');
  // no answer
  M = await C(ledP({ hmrc: two, tx: [p7] }), P, '2026-10-08');
  same(card(M, 14).filter((x) => x.key === K).map((x) => [x.found, x.count, x.rest, x.parts.n, x.parts.last]), [[3450, 3, 1350, 1, 1350]], 'with no answer and that 7 Oct payment: found £3,450 (3), остаток ≈ £1,350');
  M = await C(ledP({ hmrc: two, tx: [p7, filed('p8', '2026-11-07', -1150, 'tax', 'HMRC', { b: 'Barclays', at: ms('2026-11-08T08:00:00Z') })] }), P, '2026-11-09');
  same([card(M, 12).map((x) => [x.row, x.periods.map((y) => y.pname)]), per(M, 'vat|2026Q3').state, per(M, 'vat|2026Q3').paid], [[['p8', ['II кв. 2026', 'III кв. 2026']]], 'open', 0], 'a payment of 1,150 on 7 Nov then raises card 12 — [II кв. 2026] [III кв. 2026] [Другой налог]: III кв. is never put «в части» by itself');
  // «‹ раньше»: the rule now takes in the quarter before; the answer already given stays
  Q = await wr(await wr(P, 'shut', c, TAP, BY), 'rule', 'vat', { from: '2026-08-07' }, TAP, BY);
  M = await C(L, Q);
  same([per(M, K).state, M.taxes.rules.find((r) => r.id === 'vat').first, card(M, 14), card(M, 11)], ['paid', '2026Q2', [], []], '«‹ раньше» moves the start back a period: the answer stays, and a quarter due before the page began is still never called late');
});

await run('p-taps', 'what a tap must not change (§5.2): a mark, its removal, «Только {месяц}» with the same values', async () => {
  const L = ledP();
  const P = await plan2();
  const Q = { ...P, div: P.div.concat([row('wd', 'Вывод', 4000, '2026-10-10', { blk: 'div' })]), other: P.other.concat([row('one', 'Printer', 300, '2026-10-09')]) };
  const A = await C(L, Q, T, { H: 60 });
  let n = 0;
  for (const it of A.items.filter((x) => x.day && x.day <= A.end)) {
    const marked = await wr(Q, 'mark', it, T, TAP, BY);
    const B = await C(L, marked, T, { H: 60 }, 'mark ' + it.id);
    const good = close(B.END, A.END, 0.011) && close(B.month.blocks.result.total, A.month.blocks.result.total, 0.011) && item(B, it.id).state === 'done' && close(B.now - A.now, it.cash, 0.011);
    const back = await C(L, await wr(marked, 'unmark', item(B, it.id)), T, { H: 60 }, 'unmark ' + it.id);
    if (!good || JSON.stringify(back) !== JSON.stringify(A)) ok(false, `marking ${it.id} paid moved END or the month — or taking the mark off did not give the plan back`, [A.END, B.END]);
    n++;
  }
  ok(n >= 12, `marking any of ${n} counted lines — rows, months of repeating rows, a withdrawal, computed taxes — leaves END at ${A.END} and the month's result where they were; «сейчас» moves by the line; the mark taken off gives the same model back`);
  const same0 = await wr(Q, 'set', item(A, 'rB@2026-10'), { amt: 6000, date: '2026-10-20' }, TAP, BY);
  same([same0.team[0].rec, (await C(L, same0, T, { H: 60 })).END], [Q.team[0].rec, A.END], '«Только октябрь» saved with unchanged values writes no exception and moves nothing');
  // with every rule off and no rows: IN = OUT = 0 whatever the ledger holds (§5.18)
  const none = planP({ tax: { since: T, rules: [{ ...VAT(), on: false }, { ...USN(), on: false }], cl: {}, per: {} } });
  const Z = await C(L, none, T, { H: 60 });
  same([Z.IN, Z.OUT, Z.END, Z.items, Z.taxes.periods, Z.taxes.reserve, Z.cards], [0, 0, 32000, [], [], 0, []], 'with every rule off and no rows IN = OUT = 0 and END = NOW, whatever the ledger holds');
});

// ---- the review of the second iteration: each of these failed on the build that was reviewed ----
await run('rv-thin', 'paying the team on its day does not make the plan read as unwritten: a paid line is still a cost of its slice', async () => {
  const L = ledP();
  const P = { ...(await plan2()), banks: BALS('2026-10-19') };
  const D = '2026-10-20';
  const A = await C(L, P, D);
  same([A.free.why, A.verdict.id, A.free.thin, item(A, 'rB@2026-10').day], ['', 'v1', null, D], '20 Oct, Person B due today: a sum is named, the plan is not thin (6,120 written for the thirty days from today)');
  const Q = await wr(P, 'mark', item(A, 'rB@2026-10'), D, ms('2026-10-20T10:00:00Z'), BY);
  const B = await C(L, Q, D);
  same([B.free.why, B.verdict.id, B.free.thin, item(B, 'rB@2026-10').state], ['', 'v1', null, 'done'], '«Оплачено» on it: still a sum, still «денег хватает» — the 6,000 that was paid is counted in the slice of its own date, and November\'s lies a day past it');
  const filedB = ledP({ tx: [filed('b1', D, -6000, 'cogs', 'Person B', { at: ms('2026-10-20T18:00:00Z') })] });
  const E = await C(filedB, P, '2026-10-21');
  same([E.free.why, E.verdict.id, item(E, 'rB@2026-10').done.by], ['', 'v1', 'row'], '… and the same when the statement shows the payment the next morning');
  const Q2 = await wr(P, 'partial', item(A, 'rB@2026-10'), 5000, 'debt', ms('2026-10-20T10:00:00Z'), BY, D);
  const G = await C(L, Q2, D);
  same([G.free.thin && [G.free.thin.plan, G.free.thin.half], G.free.why !== 'thin'], [null, true], '«Частично» 5,000 of 6,000: the slice holds the 5,000 paid and the 1,000 carried to 1 Nov — 6,120 with Tool S, not thin');
});

await run('rv-inbox', 'a receipt nobody has sorted is not counted twice in «Можно вывести»: once in the bank, and again as the line it may have paid', async () => {
  const AT = ms('2026-10-21T08:00:00Z');
  const D = '2026-10-21';
  const P = { ...(await plan2()), banks: BALS('2026-10-19'), other: (await plan2()).other.concat([row('big', 'Printer', 15000, '2026-11-25')]) };
  const paidB = filed('b1', '2026-10-20', -6000, 'cogs', 'Person B', { at: AT });
  const base = await C(ledP({ tx: [paidB] }), P, D, { H: 60 });
  const unsorted = await C(ledP({ tx: [paidB], inb: [inbox('u1', '2026-10-20', 9600, '', 'SOME PAYER', { b: 'Barclays', at: AT })] }), P, D, { H: 60 });
  const sorted = await C(ledP({ tx: [paidB, filed('u1', '2026-10-20', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600, at: AT })] }), P, D, { H: 60 });
  same([unsorted.now - base.now, item(unsorted, 'rA@2026-10').state, item(sorted, 'rA@2026-10').state, sorted.now - base.now], [9600, 'due', 'done', 9600], '21 Oct: £9,600 arrived on Barclays yesterday. Unsorted in «Разбор» it is in «сейчас» and Client A\'s October line is still open; filed under Client A the line is closed');
  same([close(unsorted.free.now, sorted.free.now), unsorted.free.tight.inbox, unsorted.free.tight.d, sorted.free.tight.inbox, unsorted.free.now <= base.free.now + 0.005],
    [true, 9600, '2026-11-25', 0, true], '«Можно вывести» is the same either way: while the receipt is unsorted, £9,600 of the tight day (25 Nov) is held back as money that may be counted twice — never more free than before the receipt came');
  const small = await C(ledP({ tx: [paidB], inb: [inbox('u2', '2026-10-20', 300, '', 'SOME PAYER', { b: 'Barclays', at: AT })] }), P, D, { H: 60 });
  same([small.free.tight.inbox, close(small.free.now, base.free.now)], [300, true], 'an unsorted £300: £300 is held back, no more — it cannot be more of the plan\'s money than it is');
  // No more can have been counted twice than the plan has brought in by the tight day. Without Client A the plan
  // expects only Client R's £2,000 a month: that, by the tight day, is all that is held back of the £9,600.
  const few = { ...P, inflows: P.inflows.filter((r) => r.id !== 'rA') };
  const E = await C(ledP({ tx: [paidB], inb: [inbox('u1', '2026-10-20', 9600, '', 'SOME PAYER', { b: 'Barclays', at: AT })] }), few, D, { H: 60 });
  const broughtIn = sum(E.days.filter((x) => x.d <= E.free.tight.d).map((x) => x.in));
  same([E.free.wait, E.free.tight.inbox, broughtIn > 0 && broughtIn < 9600], [null, broughtIn, true], `with only Client R\'s £2,000 a month expected, £${broughtIn.toLocaleString('en-GB')} is held back on the tight day (${E.free.tight.d}), not £9,600: no more can have been counted twice than the plan has brought in by then`);
});

await run('rv-rows', 'an ended repeat takes no later payment; a marked month with its payment already filed is offered it; a rate is a percentage; a deleted rule takes its answers along', async () => {
  // A repeat ended after October: November\'s payment of the same name is not of the plan.
  const AT = ms('2026-11-24T08:00:00Z');
  const P = await plan2();
  P.team[0].rec.to = '2026-10';
  const pay = (id, d, a) => filed(id, d, a, 'cogs', 'Person B', { at: AT });
  let M = await C(ledP({ tx: [pay('b1', '2026-10-20', -6000), pay('b2', '2026-11-20', -6000)] }), P, '2026-11-25', { H: 60 });
  let o = item(M, 'rB@2026-10');
  same([o.done.by, o.done.got, o.rows, o.done.note, o.occ.last, o.occ.until, M.items.some((it) => it.rows.includes('b2'))], ['row', 6000, ['b1'], '', true, '2026-10', false], 'Person B ended after October, paid 6,000 on 20 Oct and again on 20 Nov: October is closed at 6,000 by its own payment; November\'s is nobody\'s — not «заплатили £12,000, в плане £6,000»');
  M = await C(ledP({ tx: [pay('b1', '2026-10-20', -4000), pay('b2', '2026-10-27', -2000)] }), P, '2026-11-25', { H: 60 });
  same([item(M, 'rB@2026-10').done.got, item(M, 'rB@2026-10').rows], [6000, ['b1', 'b2']], '… while a second payment a week later is still that month\'s');
  // A month nobody paid, whose payment was on the page before the row was written: card 10 offers it.
  const Q = planP({ other: [every('tg', 'Tool Grid', 240, 2, '2026-10')], banks: BALS('2026-10-27') });
  const before = filed('g1', '2026-10-02', -240, 'fixed', 'Tool Grid', { at: ms('2026-10-05T09:00:00Z') });
  M = await C(ledP({ tx: [before, reach('Wise', '2026-10-28', 'GBP', ms('2026-10-28T08:00:00Z'))] }), Q, '2026-10-29');
  same([item(M, 'tg@2026-10').state, card(M, 10).map((c) => [c.item, c.hint && c.hint.id, c.hint && c.hint.amt])], ['missed', [['tg@2026-10', 'g1', 240]]], 'Tool Grid £240 «каждый месяц», its 2 Oct payment filed before the row was typed: October is «платежа не было», and the card carries the payment that looks like it');
  const Q1 = await wr(Q, 'tx', item(M, 'tg@2026-10'), 'g1');
  const M1 = await C(ledP({ tx: [before, reach('Wise', '2026-10-28', 'GBP', ms('2026-10-28T08:00:00Z'))] }), Q1, '2026-10-29');
  same([item(M1, 'tg@2026-10').state, item(M1, 'tg@2026-10').done.rows, M1.now - M.now, card(M1, 10).length], ['done', ['g1'], 0, 0], '«Это оно»: the month is closed by that payment, «сейчас» does not move, the card is gone');
  // A rate is a percentage.
  const R = planP({ inflows: [row('a', 'Client A', 8000, '2026-10-28', { vat: true, bank: 'Barclays' })], tax: { since: T, rules: [{ ...VAT(), rate: 1000 }, USN()], cl: {}, per: {} } });
  M = await C(ledP(), R);
  same([M.taxes.rules[0].rate, item(M, 'a').factor, item(M, 'a').cash], [100, 2, 16000], 'a rate of 1000 stored in a rule is read as 100%: a rule cannot make £8,000 worth £88,000');
  // A deleted rule takes its answers along.
  let D = planP({ tax: { since: T, rules: [VAT(), USN(), { id: 'own', name: 'Сбор', base: 'share', rate: 10, acct: 'Wise|GBP', per: 'm', day: 15, off: 1, on: true, from: T, at: C0 }], cl: {}, per: { 'own|2026-09': { paid: paid(T) }, 'vat|2026Q3': { amt: 4000 } } } });
  D = await wr(D, 'ruleDel', 'own');
  same([D.tax.rules.map((r) => r.id), D.tax.per], [['vat', 'usn'], { 'vat|2026Q3': { amt: 4000 } }], '«Удалить» on a founder\'s own rule: its answers in tax.per go with it — another rule\'s stay');
  D = await wr(D, 'ruleDel', 'vat');
  same(D.tax.rules.map((r) => r.id), ['vat', 'usn'], '… and a built-in rule is never deleted');
  // A tax row renamed after a founder is a personal tax, stored in «Дивиденды».
  let X = planP({ taxes: [row('sa', 'Self assessment', 400, '2026-11-05', { of: false })] });
  M = await C(ledP(), X, T, { H: 60 });
  X = await wr(X, 'set', item(M, 'sa'), { name: 'HMRC Misha' }, TAP, BY);
  const N = await C(ledP(), X, T, { H: 60 });
  same([X.taxes.length, X.div.map((r) => [r.id, r.name, r.ptax, r.f, r.blk, 'of' in r]), item(N, 'sa').list, N.months.by['2026-11'].taxes.rows.includes('sa'), N.months.by['2026-11'].div.rows, N.outParts.ptax - M.outParts.ptax, M.outParts.taxes - N.outParts.taxes],
    [0, [['sa', 'HMRC Misha', true, 'misha', 'div', false]], 'div', false, ['sa'], 400, 400], 'a row of «Налоги» renamed «HMRC Misha»: stored in «Дивиденды» as a personal tax — November\'s «Налоги» no longer holds it, «Дивиденды» does, and «Уйдёт» moves 400 from налоги to личные налоги');
});

// =====================================================================================================================
// THE SCREEN. From here on a check loads the page on a pair of documents and presses what a founder would press.
// =====================================================================================================================
const sleep = (t) => new Promise((r) => setTimeout(r, t));
// The plan is saved half a second after a change, the ledger a little sooner; the fake counts every PUT it is sent.
const puts = async (doc, atLeast) => { for (let i = 0; i < 80 && store[doc].puts < atLeast; i++) await sleep(50); await sleep(150); return store[doc].puts; };
const plain = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const text = async (pg, sel) => plain(await pg.$eval(sel, (e) => e.textContent));
const texts = async (pg, sel) => (await pg.$$eval(sel, (l) => l.map((e) => e.textContent))).map(plain);
// The first iteration's fixture A as the screens' checks name it: the same line, from rows that repeat.
const planA = planW;
// … and the same three rows beside balances of the check's own choosing.
const planX = (parts = {}) => ({ ...planW(parts), banks: parts.banks || [] });

// The page on a fixture: its two documents put on the fake, the page opened on them, «Сегодня» drawn.
async function scene(name, led, P, { w = 1320, h = 900, H = 30, at } = {}) {
  serve(led, P);
  const pg = await open(name, at, { w, h });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  if (H === 30) await pg.click('#view-today [data-td-h="30"]');
  return pg;
}
// What «Сегодня» — or «Касса» — shows, as it says it: every element that carries a figure, by its key. And whatever
// the tab still says of what the page no longer does: history, averages, a cautious scenario (live-spec-2 §7.15).
const look = (pg, tab = 'today') => pg.evaluate((tab) => {
  const p = tab === 'today' ? 'td' : 'cs';
  const H = +document.querySelector(`#view-${tab} [data-${p}-h][aria-pressed="true"]`).dataset[p + 'H'];
  const live = {};
  const twice = [];
  document.querySelectorAll(`#view-${tab} [data-live]`).forEach((e) => { const k = e.dataset.live; if (k in live) twice.push(k); live[k] = { v: e.dataset.v, t: e.textContent }; });
  const root = document.querySelector(`#view-${tab}`);
  const word = /по истории|в среднем|осторожн/i;
  // Nothing on either tab is a guess, so no «≈» stands anywhere on them — not in a text, not in a label, not in a
  // title: a tax worked out by a rule is muted and says «посчитано по правилу». And no founder is named as a kind of
  // money: a founder's name may stand only where somebody typed it — a row's own name, and who wrote a line.
  const founder = /(^|[^a-zа-яё])(mika|misha|vanya|мика|миша|ваня)([^a-zа-яё]|$)/i;
  const typed = '.td-nm, .cs-nmt, .cs-nt, .cs-hn, .op-name, .ed-why, .cs-act, .td-accs, .td-fwhy, .td-fsay, .kpi .hint, .td-steps, .cs-note, .cs-rm, .cs-sugg, .cs-auto, .cs-undo, .ed-ask, .ed-an, .ed-passed, #cs-have, .td-tax .td-meta, option';
  const invented = [...root.querySelectorAll('*')].filter((e) => !e.closest('svg') && ([...e.childNodes].some((x) => x.nodeType === 3 && (x.textContent.includes('≈') || (founder.test(x.textContent) && !e.closest(typed)))) || /≈/.test((e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '') + (e.getAttribute('placeholder') || ''))))
    .map((e) => `<${e.tagName.toLowerCase()} class="${e.getAttribute('class') || ''}"> ${e.textContent.trim().slice(0, 60)}`);
  const said = [...root.querySelectorAll('*')].filter((e) => !e.closest('svg') && ([...e.childNodes].some((x) => x.nodeType === 3 && word.test(x.textContent)) || word.test((e.getAttribute('aria-label') || '') + (e.getAttribute('title') || ''))))
    .map((e) => `<${e.tagName.toLowerCase()} class="${e.getAttribute('class') || ''}"> ${e.textContent.trim().slice(0, 60)}`);
  return { H, live, twice, said, invented, pills: root.querySelectorAll('.pill').length, M: window.__money.model({ H }), P: JSON.parse(JSON.stringify(window.__cash.state())), at: window.__cash.at() };
}, tab);
// The model's value for a key of the screen. `at` is where «Касса» stands: its month, for the keys of a month.
function want(M, k, at) {
  if (k.startsWith('mon.') && k !== 'mon.div.ptax' && k !== 'mon.tax.accrued') { const [, list, f] = k.split('.'); return ((M.months.by[at.month] || {})[list] || {})[{ exp: 'expected', done: 'done' }[f]]; }
  if (k === 'say') return M.v0 ? 'v0' : M.LOW < 0 ? 'minus' : M.LOW < M.cushion ? 'low' : 'fine';
  const b = M.month.blocks;
  // No figure of the forecast is shown while nothing is written ahead — with the balances typed (vE) or without (v0).
  const vE = M.verdict.id === 'vE' || (M.v0 && M.empty);
  const out = (f) => round2(b.team[f] + b.other[f] + b.tax[f] + b.div[f]);
  // «Можно вывести» names a sum (or a zero) only when the balances are there and fresh and the plan holds its costs.
  const named = !!M.free && !['stale', 'noout', 'thin'].includes(M.free.why);
  const freeState = M.v0 ? 'v0' : !named ? M.free.why : Math.floor((M.free.now + 1e-6) / 100) * 100 >= 100 ? 'sum' : 'zero';
  const one = { verdict: M.verdict.id, now: M.now, marks: M.marksGbp, reserve: M.taxes.reserve, 'tax.reserve': M.taxes.reserve, in: vE ? null : M.IN, out: vE ? null : M.OUT, end: M.END, late: M.LATE, low: vE ? null : M.v0 ? M.need : M.LOW, lowday: M.LOWDAY, lowres: M.verdict.lowRes, minusday: M.minusDay,
    free: named ? M.free.now : null, 'free.say': freeState, 'in.n': M.inParts.n, 'in.vat': M.inParts.vat, 'm.rev.vat': b.rev.vat, 'm.div.ptax': round2(b.div.ptaxFact + b.div.ptaxRest), 'm.accrued': M.month.accrued, 'm.out.total': out('total'), 'm.out.fact': out('fact'),
    'mon.div.ptax': round2(sum((((M.months.by[(at || {}).month] || {}).div || {}).rows || []).map((id) => item(M, id)).filter((it) => it && it.ptax).map((it) => it.exp))), 'mon.tax.accrued': (((M.months.by[(at || {}).month] || {}).tax) || {}).gbp };
  if (k in one) return one[k];
  if (k.startsWith('free.step.')) return (M.free.steps[+k.slice(10)] || {}).amt;
  if (k.startsWith('tax.')) { const [, key, f] = /^tax\.(.+)\.(\w+)$/.exec(k); return (per(M, key) || {})[f]; }
  if (k.startsWith('out.')) return M.outParts[k.slice(4)];
  if (k.startsWith('m.')) { const [, blk, f] = k.split('.'); return M.month.blocks[blk][f]; }
  if (k.startsWith('acct.')) return acct(M, k.slice(5)).est;
  if (k.startsWith('it.')) return item(M, k.slice(3)).cash;
  if (k.startsWith('day.')) { const [, d, f] = k.split('.'); const D = M.days.find((x) => x.d === d); return f === 'e' ? D.e : f === 'in' ? D.in : D.out; }
  return undefined;
}
const PRINTED = ['now', 'in', 'out', 'low', 'late', 'end', 'tax.reserve', 'm.rev.total', 'm.rev.fact', 'm.out.total', 'm.out.fact', 'm.result.total', 'm.result.usual'];
const SIX = ['now', 'in', 'out', 'low', 'late', 'free'];
// What «Сегодня» always shows: the sentence, the six figures, the answer of «Можно вывести», and the month's three
// bars — income, spending with its four parts, the result beside a usual one.
const MONTH3 = ['m.rev.total', 'm.rev.fact', 'm.out.total', 'm.out.fact', 'm.team.total', 'm.tax.total', 'm.div.total', 'm.other.total', 'm.result.total', 'm.result.usual'];
const MUST = ['verdict', 'free.say'].concat(SIX, MONTH3);
// Every figure on «Сегодня» (or, with tab 'cash', on «Касса») is the model's, and the model keeps §5. Returns what
// was seen, for the check's own figures.
async function holds(pg, msg, tab = 'today') {
  const S = await look(pg, tab);
  const off = [];
  for (const [k, e] of Object.entries(S.live)) {
    const w = want(S.M, k, S.at);
    const good = w === undefined ? false : w === null ? e.v === '' : typeof w === 'number' ? close(parseFloat(e.v), w, 0.006) : e.v === w;
    if (!good) off.push(`${k}: the screen says ${e.v}, the model ${w}`);
    if (!plain(e.t)) off.push(`${k}: nothing is drawn`);
    // … and what is printed is that number: the large figures and the month's bars are whole pounds. («Можно
    // вывести» alone is printed rounded down to a hundred; its own check holds what is printed.)
    if (typeof w === 'number' && PRINTED.includes(k)) {
      const shown = parseFloat(e.t.replace(/[^\d.]/g, '')) * (/[−-]/.test(e.t) ? -1 : 1);
      if (!(Math.abs(shown - w) <= 0.51)) off.push(`${k}: «${plain(e.t)}» is printed for ${w}`);
    }
  }
  (tab === 'today' ? MUST : SIX).concat(S.M.v0 || S.M.verdict.id === 'vE' ? [] : ['lowday', 'in.n', 'out.team', 'out.other', 'out.taxes', 'out.div'], tab === 'today' && !S.M.empty ? ['end'] : []).forEach((k) => { if (!(k in S.live)) off.push(`${k}: not on the screen`); });
  // «Можно вывести» is the one figure printed rounded: down to a hundred pounds, never up.
  if (S.live.free && S.live.free.v !== '') { const shown = parseFloat(S.live.free.t.replace(/[^\d.]/g, '')); if (!(shown <= S.M.free.now + 0.005 && S.M.free.now - shown < 100 && shown % 100 === 0)) off.push(`free: «${plain(S.live.free.t)}» is printed for ${S.M.free.now}`); }
  // Nothing the page shows is invented: no «≈» anywhere, and no line names a founder as a kind of money.
  S.invented.forEach((e) => off.push(`«≈» is on the screen, or a founder is named as a kind of money: ${e}`));
  // Nothing of what went with the history is said or drawn, and nothing on a row is a sticker.
  S.said.forEach((e) => off.push(`the screen still speaks of history, an average or a cautious scenario: ${e}`));
  if (S.pills) off.push(`${S.pills} elements have the class «pill»`);
  S.twice.forEach((k) => off.push(`${k}: on the screen twice`));
  const n = Object.keys(S.live).length;
  ok(!off.length, `${msg}: each of the ${n} figures on ${tab === 'today' ? 'the screen' : '«Касса»'} is the model's (verdict ${S.M.verdict.id})`, off.slice(0, 8));
  held.runs++;
  inv(S.M, S.P).forEach((b) => held.bad.push(msg + ' — ' + b));
  S.fig = (k) => (k in S.live ? (isNaN(+S.live[k].v) || S.live[k].v === '' ? S.live[k].v : +S.live[k].v) : undefined);
  return S;
}
// The screen's own figures against the design's.
const shows = (S, wanted, msg) => {
  const got = {};
  let good = true;
  for (const [k, v] of Object.entries(wanted)) { got[k] = S.fig(k); if (typeof v === 'number' ? !close(got[k], v) : got[k] !== v) good = false; }
  return ok(good, msg + ' — ' + Object.entries(wanted).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toLocaleString('en-GB') : v}`).join(' · '), got);
};
// Brief F1: nothing on «Сегодня» or «Касса» is a sticker. A capsule is a button's shape and only a button's; a word
// in a box of its own — a border round it or a ground under it — is a tag whatever its corners. Chart marks are
// not words.
const stickers = (pg, tab = 'today') => pg.evaluate((root) => {
  const bad = [];
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const p = m[1].split(/[ ,/]+/); return p.length > 3 ? +p[3] : 1; };
  for (const el of document.querySelectorAll(root + ' *')) {
    if (el.closest('svg') || !el.getClientRects().length) continue;
    if (['BUTTON', 'INPUT', 'SELECT', 'OPTION', 'TEXTAREA', 'DATALIST'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const round = Math.max(parseFloat(cs.borderTopLeftRadius) || 0, parseFloat(cs.borderBottomRightRadius) || 0);
    const named = /(^|[\s_-])(pill|chip|tag|badge|sticker)($|[\s_-])/.test(String(el.getAttribute('class') || ''));
    const boxed = cs.display.startsWith('inline') && words && ((parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0) || alpha(cs.backgroundColor) > 0);
    if (round >= 6 || named || boxed) bad.push(`<${el.tagName.toLowerCase()} class="${el.getAttribute('class') || ''}"> ${el.textContent.trim().slice(0, 40)}`);
  }
  const capsules = [...document.querySelectorAll(root + ' button')].filter((b) => b.getClientRects().length && parseFloat(getComputedStyle(b).borderTopLeftRadius) >= 6).length;
  return { bad, capsules, seen: document.querySelectorAll(root + ' *').length };
}, '#view-' + tab);
const calm = async (pg, msg, tab = 'today') => { const r = await stickers(pg, tab); return ok(!r.bad.length && r.seen > 50, `${msg}: none of ${r.seen} elements is a pill, a chip, a tag or a badge; the ${r.capsules} capsules are buttons`, r.bad.slice(0, 6)); };

// ---- a founder's hands ----
const K = (kind) => `[data-ed-card="${kind}"] `;
async function fill(pg, kind, f) {
  const c = K(kind);
  if (f.name !== undefined) await pg.fill(c + '#ed-name', f.name);
  if (f.amt !== undefined) await pg.fill(c + '#ed-amt', String(f.amt));
  if (f.cur) await pg.selectOption(c + '#ed-cur', f.cur);
  if (f.bank) await pg.selectOption(c + '#ed-bank', f.bank);
  if (f.date !== undefined) await pg.fill(c + '#ed-date', f.date);
  for (const k of ['vat', 'monthly']) if (f[k] !== undefined) await pg.setChecked(c + `[data-ed-f="${k}"]`, f[k]);
}
const rowIds = (pg) => pg.evaluate(() => { const P = window.__cash.state(); return ['inflows', 'team', 'taxes', 'other', 'div'].flatMap((k) => P[k].map((r) => String(r.id))); });
// «Добавить» → what → the fields → «Добавить». Returns the id the new row was given.
async function addRow(pg, what, f) {
  const before = new Set(await rowIds(pg));
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + `[data-ed-what="${what}"]`);
  await fill(pg, 'add', f);
  await pg.click(K('add') + '[data-ed-save]');
  return (await rowIds(pg)).find((id) => !before.has(id));
}
// The list of days at its full length, not only the next seven.
const allDays = async (pg) => { if ((await text(pg, '#view-today [data-td-flip="all"]')).startsWith('Показать')) await pg.click('#view-today [data-td-flip="all"]'); };
const inDays = (id) => `#view-today .td-days .td-row[data-ed-open="${id}"]`;
// Tap a row of the days; the list is opened to its full length if the row is further than a week.
async function openRow(pg, id) {
  if (!(await pg.$(inDays(id)))) await allDays(pg);
  await pg.click(inDays(id));
  await pg.waitForSelector(K('row'));
}
// A row of the days as it is drawn: its classes, whether its name is struck through, the name, the remark, the
// figure, and the day it stands under.
const drawn = (pg, id) => pg.$eval(inDays(id), (e) => {
  let d = e.previousElementSibling;
  while (d && !d.classList.contains('td-day')) d = d.previousElementSibling;
  const t = (x) => (x ? x.textContent.replace(/\s/g, ' ') : '');
  return [e.className, getComputedStyle(e.querySelector('.td-nm')).textDecorationLine, t(e.querySelector('.td-nm')), t(e.querySelector('.td-meta')), t(e.querySelector('.td-am')), t(d && d.querySelector('b'))].join(' | ');
});
// The end of a check's page: closed once it has nothing left to send.
const finish = async (pg) => { await saved(pg); await pg.context().close(); };
// The plan is saved half a second after a change. Waits until what the fake holds is what the page holds.
async function saved(pg) {
  const of = (P) => canon([P.banks, P.inflows, P.team, P.taxes, P.other, P.div, P.tax, P.cushion, P.fresh || null]);
  const mine = async () => of(await pg.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state()))));
  for (let i = 0; i < 80; i++) { if ((await mine()) === of(store.cash.doc)) return true; await sleep(50); }
  return false;
}
const editRow = async (pg, id, f) => { await openRow(pg, id); await fill(pg, 'row', f); await pg.click(K('row') + '[data-ed-save]'); };
const tapRow = async (pg, id, verb) => { await openRow(pg, id); await pg.click(K('row') + `[data-ed-do="${verb}"]`); };
const stored = (S, id) => LISTS.flatMap((k) => S.P[k]).find((r) => String(r.id) === id) || null;
// The question «Частично…» asks in a row's card: how much has been paid, and the day of the rest — two fields of its
// own, beside the card's «Дата», which is the row's. `answer` fills them (the sum only where one is given: it may
// stand there already, from the statement) and presses «Готово» — or Enter in the day.
const ASK = K('row') + '[data-ed-askbox="part"]';
const PART = K('row') + '[data-ed-part]';
const REST = K('row') + '[data-ed-partdate]';
async function answer(pg, amt, day, enter = false) {
  if (amt !== undefined) await pg.fill(PART, String(amt));
  await pg.fill(REST, day);
  if (enter) await pg.press(REST, 'Enter');
  else await pg.click(K('row') + '[data-ed-go="part"]');
}

await run('30 the shell', 'where the page opens, its tabs, a phone, midnight — and that opening it writes nothing', async () => {
  // `page` was opened at the top on the fabricated studio, whose «Разбор» holds four rows.
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, [...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden).map((e) => e.id), location.hash, document.querySelector('#inboxBadge').textContent]), ['today', ['view-today'], '', '4'], 'with four rows waiting in «Разбор» the page opens on «Сегодня», and puts nothing in the address');
  same(await page.$$eval('.nav [data-tab]', (e) => e.map((x) => [x.firstChild.textContent.trim(), x.dataset.tab].join(' '))), ['Сегодня today', 'Касса cash', 'Разбор inbox', 'Месяцы dashboard', 'Отчёты reports', 'Настройки settings'], 'the tabs read Сегодня · Касса · Разбор · Месяцы · Отчёты · Настройки, each under the id it had — «Загрузка» and «Таблица» are not in the bar');
  ok(/<a class="wordmark" href="#today" data-tab="today">/.test(fs.readFileSync(PUB + '/money/index.html', 'utf8')), 'the wordmark leads to «Сегодня» — on every name the page is served under: Money has no link to the studio\'s other product («rv-small» holds it on the running page)');
  for (const t of ['cash', 'inbox', 'dashboard', 'reports', 'settings', 'today']) {
    await page.click(`.nav [data-tab="${t}"]`);
    const vis = await page.evaluate(() => [[...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden).map((e) => e.id).join(), location.hash].join(' '));
    ok(vis === `view-${t} #${t}` && (await page.$eval('#view-' + t, (e) => e.innerText.trim().length)) > 20, `tab ${t} opens, alone, under #${t}, with something in it`, vis);
  }
  // «Загрузка» and «Таблица» are opened from «Настройки» (Mika, 8 October 2026): the three screens begin with one
  // switch, and the bar keeps «Настройки» lit on each of them. Their addresses are as they were.
  const here = () => page.evaluate(() => {
    const v = [...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden), nav = v.length === 1 ? v[0].querySelector('.set-nav') : null;
    return [v.map((e) => e.id).join(), location.hash, [...document.querySelectorAll('.nav .active, .nav [aria-current="page"]')].map((e) => e.dataset.tab).join(), nav ? [...nav.querySelectorAll('button')].map((b) => [b.textContent.trim(), b.dataset.tabgo, b.getAttribute('aria-pressed')].join(' ')) : null, !!nav && v[0].firstElementChild === nav, document.activeElement.dataset.tabgo || ''];
  });
  const sw = (on) => [['Общие', 'settings'], ['Загрузка выписок', 'upload'], ['Таблица', 'ledger']].map(([n, k]) => `${n} ${k} ${k === on}`);
  await page.click('.nav [data-tab="settings"]');
  same((await here()).slice(0, 5), ['view-settings', '#settings', 'settings', sw('settings'), true], '«Настройки» begins with a switch of its three screens: Общие · Загрузка выписок · Таблица');
  for (const [t, h1, has] of [['upload', 'Загрузка выписок', '#drop'], ['ledger', 'Таблица', '.blocks'], ['settings', 'Настройки', '#ed-forecast']]) {
    await page.click(`main > [id^="view-"]:not([hidden]) .set-nav [data-tabgo="${t}"]`);
    same([await here(), await text(page, `#view-${t} h1`), await page.isVisible(`#view-${t} ${has}`)], [[`view-${t}`, `#${t}`, 'settings', sw(t), true, t], h1, true], `… «${h1}» opens from it: alone, under #${t}, «Настройки» still lit in the bar, the switch saying where one is and the keyboard left on it`);
  }
  await page.click('.nav [data-tab="dashboard"]');
  same([await text(page, '#view-dashboard h1'), await page.$eval('#periodSel', (e) => e.value), await text(page, '#view-dashboard .page-sub'), (await texts(page, '#view-dashboard .dash th')).find((x) => x.includes('идёт')), await page.$eval('#view-dashboard .dash a[data-tab]', (e) => e.dataset.tab)],
    ['Месяцы', '2026-09', 'Сентябрь 2026 · вся студия', 'окт 26 · идёт', 'today'], '«Месяцы» opens on September 2026, the last month that is whole; October\'s column is headed «идёт» and links to «Сегодня»');
  await page.click('#view-dashboard .dash a[data-tab]');
  same(await page.evaluate(() => document.querySelector('.nav .active').dataset.tab), 'today', '… and the link goes there');
  same(await page.evaluate(() => [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => /скопировать/i.test(e.textContent)).length), 0, 'no button anywhere says «Скопировать» ');
  same(await page.evaluate(() => [typeof window.__money.compute, typeof window.__money.model, typeof window.__money.upgrade, typeof window.__money.passed, window.__money.today, window.__money.by]), ['function', 'function', 'function', 'function', T, 'Mika'], 'window.__money: compute, model, upgrade, passed, today — the date in London — and who is signed in');
  const S = await holds(page, 'the fabricated studio, 60 days');
  same([S.M.v0, S.P.v, S.P.banks.every((b) => b.asOf === '2026-10-04' && !b.legacy)], [false, 3, true], '… whose plan is version 3, with every balance typed as of 4 Oct');
  ok(/^вт 6 окт · выписки и остатки по 4 окт \(.+\)$/.test(await text(page, '#view-today .page-sub')) && (await text(page, '#view-today .kpi .lbl')) === 'Денег на 4 окт' && S.M.verdict.id === 'v1' && (await text(page, '#view-today .td-say')).startsWith('По остаткам на 4 октября: денег хватает на 60 дней') && (await texts(page, '#view-today .td-verdict .note')).some((x) => x.startsWith('В разборе ')), 'the head and the first figure say as of which day they speak — 4 Oct, two days back; the sentence answers the question — «денег хватает» — and the one incoming payment nobody has filed, too small to change that answer, is the line under it', [await text(page, '#view-today .page-sub'), await text(page, '#view-today .td-say'), await texts(page, '#view-today .td-verdict .note')]);
  await calm(page, 'the fabricated studio');
  const viaDocs = await page.evaluate(async () => {
    const led = (await (await fetch('/api/founder/money')).json()).doc;
    return JSON.stringify(window.__money.compute(led, window.__cash.state(), window.__money.today, { H: 60 }));
  });
  ok(JSON.stringify(S.M) === viaDocs && S.M.T === T && S.M.items.length > 20, `model() is compute() on what the page holds: ${S.M.items.length} items, every one a row somebody wrote or a tax worked out by a rule`);
  // The chart answers a tap with that day's lines; «Открыть день» and the sentence's own button lead to «Касса · По дням».
  await page.click('#view-today #td-chart .hit[data-td-i="23"]');
  ok((await text(page, '#view-today #td-dayinfo .td-day b')) === 'чт 29 окт' && (await texts(page, '#view-today #td-dayinfo .td-row .td-nm')).includes('Meridian Labs'), 'a tap on a day of the chart lists that day: on 29 Oct, the payment the largest client promised', await texts(page, '#view-today #td-dayinfo .td-row .td-nm'));
  await calm(page, 'with a day of the chart open');
  await page.click('#view-today #td-dayinfo [data-td-days]');
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, location.hash, document.querySelector('#cs-days').hidden]), ['cash', '#cash-days', false], '«Открыть день» goes to «Касса · По дням»');
  await page.click('#view-cash [data-cs-view="plan"]');
  await page.click('.nav [data-tab="today"]');
  same(await text(page, '#view-today .td-need .op[data-td-card="4"] button'), 'Разобрать', '«Нужно решить» carries the button that answers it');
  await page.click('#view-today .td-need .op[data-td-card="4"] button');
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, location.hash]), ['inbox', '#inbox'], '… which goes to «Разбор»');
  await page.click('.nav [data-tab="today"]');
  // live-spec-2 §7.15, what of it this stage draws: seven days, one setting.
  ok((await page.$$eval('#view-today .td-days .td-day', (l) => l.length)) <= 8 && /Ближайшие 7 дней/.test(await text(page, '#view-today [aria-label="Ближайшие дни"] h2')), '«Ближайшие 7 дней»: seven day headers at most (and the fold of what was closed in the month)', await texts(page, '#view-today .td-days .td-day b'));
  await page.click('.nav [data-tab="settings"]');
  same(await page.$$eval('#ed-forecast input, #ed-forecast select', (l) => l.map((e) => e.dataset.edSet)), ['cushion', 'fresh', 'freshDays'], '«Настройки → Прогноз» holds the cushion and the one setting the founder asked for on 7 October — how old the balances may be — and no switch of what went with the history');
  await page.click('.nav [data-tab="today"]');
  // London, not the browser's zone and not UTC: at 23:30 UTC on the 6th it is already the 7th there (summer time).
  await page.clock.setFixedTime(new Date('2026-10-06T23:30:00Z'));
  same(await page.evaluate(() => window.__money.today), '2026-10-07', 'half an hour after London midnight «сегодня» is the next day, without a reload');
  await page.click('#view-today [data-td-h="60"]');
  const next = await holds(page, 'the tab left open past midnight, at its next redraw');
  ok(next.M.T === '2026-10-07' && (await text(page, '#view-today .page-sub')).startsWith('ср 7 окт') && (await text(page, '#view-today .td-day b')) !== '', '… the screen is the 7th\'s: nothing kept the date the page was loaded on', [next.M.T, await text(page, '#view-today .page-sub')]);
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00+01:00'));
  await page.click('#view-today [data-td-h="60"]');
  // A phone.
  for (const w of [375, 390]) {
    const ph = await open('phone ' + w, undefined, { w, h: 812 });
    await ph.waitForSelector('#view-today [data-live="verdict"]');
    const r = await ph.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const k = [...document.querySelectorAll('#view-today .kpi')].map((e) => e.getBoundingClientRect());
      const tab = box('.nav [data-tab="inbox"]');
      const badge = box('#inboxBadge');
      return { wide: document.documentElement.scrollWidth, win: window.innerWidth, tab: [Math.round(tab.left), Math.round(tab.right)], badge: Math.round(badge.right), badgeW: badge.width,
        two: k.length === 6 && k[0].top === k[1].top && k[2].top > k[0].top && k[2].top === k[3].top && k[4].top === k[5].top, need: box('#view-today .td-need').top, chart: box('#view-today #td-chart').top, chartH: Math.round(box('#view-today #td-chart').height) };
    });
    ok(r.wide <= w && r.win === w, `${w}px: the page does not scroll sideways`, r);
    ok(r.tab[0] >= 0 && r.tab[1] <= w && r.badge <= w && r.badgeW > 0, `${w}px: «Разбор» and its counter are inside the screen`, r);
    ok(r.two && r.need < r.chart && r.chartH <= 200, `${w}px: the six figures stand two to a row, «Нужно решить» above the chart, the chart no taller than 190`, r);
    await holds(ph, `${w}px`);
    await calm(ph, `${w}px`);
    // The widest things the screen can hold: a row's card, the sheet of balances, «Добавить».
    await ph.click('#view-today .td-acc summary');
    await ph.click('#view-today .td-days .td-row[data-ed-open]');
    await ph.waitForSelector(K('row'));
    const a = await ph.evaluate(() => document.documentElement.scrollWidth);
    await ph.click('#view-today .td-kpi');
    await ph.waitForSelector(K('bal'));
    const b = await ph.evaluate(() => [document.documentElement.scrollWidth, document.querySelectorAll('[data-ed-card]').length]);
    await ph.click('#view-today .page-head [data-ed-add]');
    await ph.click(K('add') + '[data-ed-what="inflows"]');
    const c = await ph.evaluate(() => document.documentElement.scrollWidth);
    ok(a <= w && b[0] <= w && c <= w && b[1] === 1, `${w}px: nor does it with the accounts unfolded and a row's card open, with the balances open, with «Добавить» open — one card at a time`, [a, b, c]);
    await calm(ph, `${w}px with «Добавить» open`);
    await ph.context().close();
  }
  same([await puts('led', 0), await puts('cash', 0)], [0, 0], '§5.13: loading the page three times, walking its tabs, opening every card and closing none with «Сохранить» wrote nothing');
});


await run('26 on screen', 'day one: an account in use without a balance, and typing it', async () => {
  const L = ledA({ tx: [sheet('bc', '2026-09-15', 40, 'other', 'Bank fee', { b: 'Barclays' })], inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] });
  const pg = await scene('day one', L, planW());
  let S = await holds(pg, 'day one');
  shows(S, { verdict: 'v0', now: '', low: 11000, in: 8000, out: 6120 }, 'the screen');
  same([await text(pg, '#view-today .td-say'), S.live.now.t, (await texts(pg, '#view-today .kpi .lbl'))[3], (await texts(pg, '#view-today .kpi .hint'))[0], await pg.$eval('#view-today .td-need .op', (e) => e.dataset.tdCard)],
    ['Нет остатка: Barclays GBP. Без него итог не посчитать. По плану за 30 дней придёт £8,000 и уйдёт £6,120.', '—', 'Нужно на счетах сегодня', 'не хватает остатка: Barclays GBP', '1'],
    'the sentence names the account and tells the flows; «Денег сейчас» is «—»; the fourth figure is «Нужно на счетах сегодня»; the first card is the balance');
  same([await text(pg, '#view-today .td-two h2'), (await text(pg, '#view-today .td-acc summary')).includes('нет остатка — Barclays GBP')], ['Изменение кассы по днямчерез 30 дней: +£1,880', true], 'the chart is «Изменение кассы по дням», from zero; the line of accounts says which one is missing');
  same([await texts(pg, '#view-today .td-verdict button'), (await texts(pg, '#view-today .kpi .hint'))[3], (await texts(pg, '#view-today .td-days .td-dayf')).every((t) => t.includes('от сегодняшнего: ')), await texts(pg, '#view-today .td-accs button')], [['Вписать остатки'], 'чтобы пройти 30 дней без минуса и с запасом £5,000', true, ['Вписать остаток', 'Загрузить выписки']],
    'the sentence offers the one way out there is — «Вписать остатки»: a statement brings no balance yet, so «Загрузить выписки» stays under «Счета»; the fourth figure says it includes the cushion; a day reads «от сегодняшнего: +£…»');
  await calm(pg, 'day one');
  // «Вписать остатки»: Barclays, which has none, is first.
  await pg.click('#view-today .td-verdict [data-ed-bal]');
  same(await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => [e.dataset.edAcct, e.querySelector('[data-ed-bamt]').value, e.querySelector('[data-ed-bdate]').value].join(' '))), ['Barclays|GBP  2026-10-06', 'Wise|GBP 10000 2026-10-06'], 'the sheet: Barclays first and empty, Wise with what the page works it out to be, both «на сейчас»');
  await calm(pg, 'the sheet of balances');
  await pg.fill(K('bal') + '[data-ed-acct="Barclays|GBP"] [data-ed-bamt]', '15000');
  await pg.click(K('bal') + '[data-ed-save]');
  S = await holds(pg, 'Barclays typed');
  shows(S, { verdict: 'v1', now: 25000, 'acct.Barclays|GBP': 15000, 'acct.Wise|GBP': 10000 }, '«Вписать остаток» Barclays 15,000');
  const b = S.P.banks.find((r) => r.bank === 'Barclays');
  same([S.P.banks.length, b.amt, b.asOf, b.by, typeof b.at, 'legacy' in b, S.P.banks[0].asOf, S.P.banks[0].amt, (await texts(pg, '#view-today .kpi .lbl'))[0]], [2, 15000, T, 'Mika', 'number', false, '2026-09-30', 10120, 'Денег сейчас'], '… one account written into the plan — the amount, today, who — and the other, which nobody touched, left as it was');
  same([await saved(pg), store.cash.puts, store.cash.doc.v, store.cash.doc.savedBy, store.cash.doc.banks.length, store.led.puts], [true, 1, 3, 'Mika', 2, 0], '… saved once, as version 3, signed; the ledger untouched');
  // «Касса» reads the same balances: what was typed, on which day, by whom — and beside it what it comes to now.
  await pg.click('.nav [data-tab="cash"]');
  same(await pg.$$eval('#cs-accts .cs-ac[data-cs-acct]', (l) => l.map((e) => [e.dataset.csAcct, ...[...e.querySelectorAll('.cs-acv')].map((x) => x.textContent.replace(/\s+/g, ' ').trim())].join(' / '))), ['Wise|GBP / £10,120 на 30 сен · вручную · Mika / £10,000', 'Barclays|GBP / £15,000 на 6 окт · вручную · Mika / £15,000'], '«Касса · Остатки» shows each balance as «на {день} · вручную · {кто}», the one typed on «Сегодня» among them, and beside it what the account comes to now');
  same(await pg.$$eval('#cs-accts input, #cs-accts select', (l) => l.length), 0, '… and a balance is not typed into its row: «Вписать остаток» is the way');
  await pg.click('#cs-accts [data-ed-bal]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => e.dataset.edAcct))], [1, ['Wise|GBP', 'Barclays|GBP']], '… which opens the same sheet as on «Сегодня»');
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '9900');
  await pg.click(K('bal') + '[data-ed-save]');
  S = await holds(pg, 'a balance typed from «Касса»', 'cash');
  same([S.fig('now'), S.fig('acct.Wise|GBP'), S.P.banks[0].asOf, S.P.banks[0].by, await text(pg, '#cs-accts [data-cs-acct="Wise|GBP"] .cs-act')], [24900, 9900, T, 'Mika', '£9,900 на 6 окт · вручную · Mika'], '… Wise typed there as 9,900: a balance as of today, signed, and «Денег сейчас» follows');
  await saved(pg);
  await pg.click('#toastUndo');
  await saved(pg);
  await pg.click('.nav [data-tab="today"]');
  // The same after a reload: nothing more is written, and the row ids are the ones that were saved.
  const ids = S.P.banks.map((r) => r.id);
  await pg.reload();
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  const again = await look(pg);
  same([again.M.verdict.id, again.M.now, again.P.banks.map((r) => r.id), await puts('cash', 3)], ['v1', 25000, ids, 3], 'reloaded: the same answer, the same row ids, and opening the page wrote nothing');
  await finish(pg);
});

await run('27 on screen', 'the old plan: rewritten as version 3 once, by whoever opens it first', async () => {
  const v1 = {
    v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, horizon: '2026-11-10', fx: { USD: 1.3, RUB: 110, EUR: 1.2, AMD: 500 },
    banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }, { id: 'r2', name: 'Tochka — RUB', amt: 0, cur: 'RUB', bank: 'Tochka', on: true, tag: '', info: false, date: '' }],
    inflows: [{ id: 'r3', name: 'Client A', amt: 8000, cur: 'GBP', bank: 'Wise', on: true, tag: 'нужен PO', info: false, date: '2026-10-27' }],
    team: [{ id: 'r4', name: 'Person B', amt: 6000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-09-20', paid: true, paidAdj: { bank: 'Wise', cur: 'GBP', delta: -6000 } }],
    taxes: [], other: [{ id: 'r5', name: 'Подписки', amt: 400, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-15' }],
  };
  const pg = await scene('old plan', ledA(), v1);
  same([await puts('cash', 1), store.cash.rev - store.cash.rev0, store.cash.doc.v], [1, 1, 3], 'the first page to load the old plan saves it once, as version 3');
  const expect = await page.evaluate((p) => window.__money.upgrade(p), v1);
  const sent = store.cash.doc;
  same([['banks', ...LISTS].map((k) => sent[k]), sent.ser, sent.tails, sent.vat], [['banks', ...LISTS].map((k) => expect[k]), expect.ser, expect.tails, expect.vat], '… and what it saved is exactly Live.upgrade of what was stored: no r1, r2…, old balances marked as not confirmed, rows with their block, «оплачено» as an old mark');
  let S = await holds(pg, 'the old plan');
  shows(S, { verdict: 'v0', now: '' }, 'the screen');
  same([await text(pg, '#view-today .td-say'), await text(pg, '#view-today .td-need .op .op-text')], ['Нет остатка: Wise GBP. Без него итог не посчитать. По плану за 30 дней придёт £8,000 и уйдёт £400.', 'В старой Кассе было Wise GBP £18,000 — подтвердите сумму и дату.'], 'v0 naming Wise GBP — Tochka, which nothing uses, is not asked for — and the card offers the old 18,000');
  await pg.click('#view-today .td-need [data-ed-bal]');
  same(await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => [e.dataset.edAcct, e.querySelector('[data-ed-bamt]').value, e.querySelector('[data-ed-bdate]').value].join(' '))), ['Wise|GBP 18000 ', 'Tochka|RUB  2026-10-06'], 'the sheet pre-fills 18,000 with an empty date: when it was true is the founder\'s to say');
  // Confirmed as of the end of September: the date is all a founder has to add.
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bdate]', '2026-09-30');
  await pg.click(K('bal') + '[data-ed-save]');
  S = await holds(pg, 'the old balance confirmed as of 30 Sep');
  shows(S, { verdict: 'vT', now: 17880, 'acct.Wise|GBP': 17880 }, '18,000 as of 30 Sep, less the statement row of 3 Oct — and a plan of two rows is a thin one: the sentence says so instead of «денег хватает»');
  same([await saved(pg), store.cash.puts, store.cash.doc.banks[0].legacy, store.cash.doc.banks[0].asOf, store.cash.doc.banks[1].legacy], [true, 2, undefined, '2026-09-30', true], '… the second save is the founder\'s; the account nobody touched is still an old balance');
  await finish(pg);
  // A second founder opens the page while the first one's upgrade is on its way: the save is refused, and the page
  // reads what the first one wrote instead of putting its own on top.
  serve(ledA(), v1);
  store.cash.clash = expect;
  const two = await open('old plan, second founder', undefined, { quiet: /409/ });
  await two.waitForSelector('#view-today [data-live="verdict"]');
  await puts('cash', 1);
  await two.waitForFunction((r) => window.__cash.rev() === r, store.cash.rev0 + 1);
  same([store.cash.puts, store.cash.rev - store.cash.rev0, await two.evaluate(() => window.__cash.state().v), await text(two, '#sync'), (await look(two)).M.verdict.id], [1, 1, 3, 'сохранено', 'v0'], 'two founders at once: the later upgrade is refused, that page reads the plan again, and stays in step — nothing says «обновите страницу»');
  await two.reload();
  await two.waitForSelector('#view-today [data-live="verdict"]');
  same(await puts('cash', 1), 1, '… and from then on opening the page writes nothing');
  await two.context().close();
});

await run('13 on screen', 'a late inflow leaves in two steps, and the card that asks about it', async () => {
  const pg = await scene('test 13', ledA(), planW());
  const base = await holds(pg, 'fixture A');
  const id = await addRow(pg, 'inflows', { name: 'Client E', amt: 4000, date: '2026-09-22' });
  let S = await holds(pg, 'Client E £4,000 for 22 Sep');
  shows(S, { in: 12000, late: 4000, end: base.fig('end') + 4000 }, 'typed inflow Client E £4,000, 22 Sep — 13 days late: still expected');
  const need = '#view-today .td-need .op[data-td-card="7"] ';
  same([await text(pg, need + '.op-name'), await text(pg, need + '.op-text'), await texts(pg, need + '> .row button'), (await texts(pg, '#view-today .kpi .hint'))[4]],
    ['Client E · £4,000', 'Ждали 22 сен, в выписках Wise GBP по 5 окт его нет · 13 дн. Из расчёта уберу через 8 дн.', ['Получено', 'Частично…', 'Перенести на…', 'Не придёт'], '1 клиент · дольше всех Client E, 13 дн.'], 'card 7 and the fifth figure say who, how long, and what happens next — with «Частично» as the third answer');
  same(await drawn(pg, id), 'td-row | none | Client E | Wise · просрочено 13 дн. | +£4,000 | сегодня, вт 6 окт', '… and the row, under today, says it in plain small words');
  await calm(pg, 'with a card of «Нужно решить»');
  // «Перенести на…» opens the row's card inside the card of «Нужно решить», the cursor on the date.
  await pg.click(need + '[data-ed-focus="date"]');
  same(await pg.evaluate(() => [document.querySelectorAll('[data-ed-card]').length, !!document.querySelector('#view-today .td-need [data-ed-card="row"]'), document.activeElement.id]), [1, true, 'ed-date'], '«Перенести на…»: the row\'s card opens in place, on the date');
  await calm(pg, 'with a row\'s card open');
  await fill(pg, 'row', { date: '2026-09-10' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'dated 10 Sep');
  shows(S, { in: 8000, late: 4000, end: 11880 }, 'dated 10 Sep, 25 days: out of the line');
  same([(await text(pg, need + '.op-text')).endsWith('25 дн. Из расчёта убран, пока не перенесёте.'), await pg.$(inDays(id))], [true, null], '… card 7: «Из расчёта убран, пока не перенесёте», and the row is in no day');
  await pg.click(need + '[data-ed-focus="date"]');
  await fill(pg, 'row', { date: '2026-10-20' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'moved to 20 Oct');
  shows(S, { in: 12000, late: 0, low: 8000, lowday: '2026-10-20' }, '«Перенести на…» 20 Oct');
  same([await pg.$(need), (await texts(pg, '#view-today .kpi .hint'))[4]], [null, 'просрочек нет'], '… the card is gone');
  // «Получено», one tap: the money moves from the line into «сейчас», and END stays.
  const before = S.fig('end');
  await tapRow(pg, id, 'paid');
  S = await holds(pg, '«Получено»');
  shows(S, { now: 14000, in: 8000, end: before, marks: 4000 }, '«Получено» on it');
  const r = stored(S, id);
  same([r.paid.on, r.paid.by, typeof r.paid.at, S.live.now.t, S.P.banks[0].amt, S.P.banks[0].asOf], [T, 'Mika', 'number', '£14,000', 10120, '2026-09-30'], '… a mark dated today; the money now says in words what of it is marked by hand — no «≈»; the typed balance exactly as it was (§5.8)');
  same(await drawn(pg, id), 'td-row td-done | line-through | Client E | Wise · отмечено · ждёт выписку | +£4,000 | вт 20 окт', 'the row stays under its own date, struck through and muted (brief F3)');
  // «Отменить» in the toast takes the tap back.
  await pg.click('#toastUndo');
  S = await holds(pg, '«Отменить»');
  shows(S, { now: 10000, in: 12000, end: before }, '«Отменить» in the toast: the mark is off');
  // … and its toggle still works: marked again, then «Вернуть в план» from the struck-through row.
  await tapRow(pg, id, 'paid');
  await tapRow(pg, id, 'unpaid');
  S = await holds(pg, '«Вернуть в план»');
  shows(S, { now: 10000, in: 12000, end: before }, 'marked again, then «Вернуть в план» on the struck-through row');
  same('paid' in stored(S, id), false, '… the mark is gone from the plan');
  await finish(pg);
});

await run('9 on screen', 'a typed row closed by a statement that is uploaded and filed after it', async () => {
  const pg = await scene('test 9', ledA(), planW());
  const id = await addRow(pg, 'inflows', { name: 'Client C', amt: 2400, date: '2026-10-08' });
  let S = await holds(pg, 'Client C £2,400 for 8 Oct');
  shows(S, { now: 10000, in: 10400, end: 14280 }, 'typed inflow Client C £2,400, 8 Oct');
  same([item(S.M, id).how, 'sk' in stored(S, id)], ['', false], '… a name the table does not know: nothing is tied, a statement will close it by amount');
  // The statement arrives a minute later — a Wise file with one row — and the row waits in «Разбор».
  await pg.clock.fastForward(60000);
  const csv = 'TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Payer Name,Payee Name,Merchant,Card Holder Full Name\nTRANSFER-1,06-10-2026,2400.00,GBP,Received money from CLIENT C with reference INV-7,INV-7,Client C,,,';
  const fed = await pg.evaluate((c) => { const r = window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'wise.csv'), 'wise.csv'); return [r.bank, r.added]; }, csv);
  same(fed, ['Wise', 1], 'a Wise statement with 6 Oct +2,400 from Client C is read');
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'the row in «Разбор»');
  shows(S, { now: 12400, in: 10400 }, 'while the row waits in «Разбор», unfiled: the bank\'s money is in «сейчас», the line is still open');
  same([S.M.cards.map((c) => c.n), await text(pg, '#view-today .td-verdict .note'), await text(pg, '#view-today .td-need .op .op-name')], [[4], 'В разборе 1 операция на £2,400 — пока она не разнесена, часть плана может считаться дважды.', 'В разборе 1 операция на £2,400'], '… and the screen says so, under the sentence and in a card');
  // Filed under Client C.
  await pg.click('#view-today .td-need [data-tabgo="inbox"]');
  await pg.click('#view-inbox .op [data-accept]');
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'filed under Client C');
  shows(S, { now: 12400, in: 8000, end: 14280 }, 'filed under Client C: the line is closed, NOW as it was (§5.6), END back where it stood');
  const it = item(S.M, id);
  same([it.state, it.done.by, it.done.on, it.rows.length], ['done', 'row', T, 1], '… closed by the row, on the row\'s date');
  same(await drawn(pg, id), 'td-row td-done | line-through | Client C | Wise | +£2,400 | сегодня, вт 6 окт', '… and it stays, struck through, under the day the money came');
  await puts('led', 1);
  const row = store.led.doc.tx.find((r) => r.l === 'Client C');
  ok(!!row && row.at > stored(S, id).c0, 'the ledger that was saved carries the moment the row was uploaded — later than the moment the line was typed, which is what let it close the line', row && [row.at, stored(S, id).c0]);
  await finish(pg);
});

await run('clash', 'the plan was saved from somewhere else: nothing typed here is kept, and «Сегодня» says so', async () => {
  serve(ledA(), planW());
  const pg = await open('clash', undefined, { quiet: /409/ });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  // Another founder saves the plan while this page is open.
  store.cash.doc = planW({ cushion: 9000 });
  store.cash.rev++;
  await addRow(pg, 'inflows', { name: 'Client C', amt: 2400, date: '2026-10-08' });
  await pg.waitForSelector('#view-today .banner');
  same([await text(pg, '#view-today .banner b'), await text(pg, '#sync'), store.cash.doc.inflows.length, store.cash.doc.cushion, store.cash.puts], ['План изменился в другом окне.', 'касса изменилась в другом окне — обновите страницу', 1, 9000, 1],
    'the save is refused (409), the other founder\'s plan is left as it is, and both the first screen and the pill say «обновите страницу»');
  await pg.click('#view-today .banner [data-td-reload]');
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same([(await look(pg)).P.cushion, await pg.$('#view-today .banner')], [9000, null], '«Обновить» reads the plan as it now is');
  await pg.context().close();
});

await run('cards', 'the rest of what the row\'s card and «Нужно решить» can do', async () => {
  // Fixture A written down, with a row that has no date, and one client whose September invoice carried VAT — so
  // the page has a tax to work out: UK VAT за III кв., £200, due 7 Nov.
  const L = ledA({ tx: [sheet('va', '2026-09-10', 1200, 'rev', 'Client Z', { v: 200 })] });
  const P0 = planW({ inflows: [row('u', 'Client U', 900, '', { mon: '2026-10', vat: false })] });
  const pg = await scene('cards', L, P0, { H: 60 });
  let S = await holds(pg, 'a row without a date, three rows that repeat, a tax by the rule');
  same([S.M.cards.map((c) => c.n), await texts(pg, '#view-today .td-need .op .op-name')], [[9], ['Без даты и не в расчёте: 1 строка на £900']], 'one card: 9 — a row without a date');
  // Card 9: a date for the row that has none.
  await pg.click('#view-today .td-need [data-td-flip="undated"]');
  await pg.click('#view-today .td-need .td-row[data-ed-open="u"]');
  await fill(pg, 'row', { date: '2026-10-12' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'a date for the row without one');
  same([S.M.cards.length, stored(S, 'u').date, 'mon' in stored(S, 'u'), item(S.M, 'u').day], [0, '2026-10-12', false, '2026-10-12'], 'card 9 → «Поставить даты»: dated, counted, and nothing is left to decide');
  // A month of a row that repeats: its card says what it is, and a new amount is that month's alone.
  const occ = 'rA@2026-10';
  const was = [S.fig('in'), S.fig('end')];
  await openRow(pg, occ);
  same([await text(pg, K('row') + '.ed-why'), await texts(pg, K('row') + '.ed-foot button'), await pg.$eval(K('row') + '[data-ed-f="monthly"]', (e) => e.checked), await pg.$eval('#ed-name', (e) => e.disabled)],
    ['В плане: вписал Mika 6 окт · каждый месяц, 28-го · в таблице это Client A.', ['Получено', 'Частично…', 'Перенести на…', 'Не придёт', 'Убрать', 'Закрыть', 'Только октябрь', 'Октябрь и дальше'], true, false], 'the card of October\'s month of Client A: whose row, that it repeats, what can be done with this month — and two ways to save: this month only, or from now on');
  same(await text(pg, K('row') + '[data-ed-n="monthly"]'), '28-го числа, с октября', '… the tick «каждый месяц» says on which day and since when');
  await fill(pg, 'row', { amt: 8500 });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'October\'s amount changed');
  same([S.P.inflows[0].amt, S.P.inflows[0].rec, S.fig('in') - was[0], item(S.M, 'rA@2026-11').amt, (await drawn(pg, occ)).split(' | ').slice(2, 5).join(' | ')], [8000, { day: 28, from: '2026-10', x: { '2026-10': { amt: 8500 } } }, 500, 8000, 'Client A | Wise · каждый месяц · в октябре иначе | +£8,500'],
    '8,500 saved on it: the row is still 8,000 a month, October alone is 8,500 — «каждый месяц · в октябре иначе»');
  await editRow(pg, occ, { date: '2026-11-02' });
  S = await holds(pg, 'October\'s month moved');
  same([S.P.inflows[0].rec.x, item(S.M, occ).day, item(S.M, occ).ym, item(S.M, 'rA@2026-11').day], [{ '2026-10': { amt: 8500, date: '2026-11-02' } }, '2026-11-02', '2026-11', '2026-11-28'], 'moved to 2 Nov: that month\'s date alone; November\'s own month stays on the 28th');
  // «В этом месяце не платим» switches one month off; the tick taken off a month ends the repeat after it.
  await tapRow(pg, 'rB@2026-11', 'skip');
  same([await text(pg, K('row') + '.ed-ask > span'), await texts(pg, K('row') + '.ed-ask button')], ['Не платим:', ['только ноябрь', 'ноябрь и дальше', 'Отмена']], '«Не платим» on a month of a row that repeats asks which: this month, or this month and on');
  await pg.click(K('row') + '[data-ed-go="skip-only"]');
  S = await holds(pg, 'November\'s Person B switched off');
  same([S.P.team[0].rec.x, item(S.M, 'rB@2026-11').state, item(S.M, 'rB@2026-12').state], [{ '2026-11': { off: true } }, 'off', 'due'], '«только ноябрь» on November\'s Person B: that month is off, December stays');
  await editRow(pg, 'rS@2026-11', { monthly: false });
  S = await holds(pg, 'Tool S ends after November');
  same([S.P.other[0].rec, S.M.items.filter((x) => x.row === 'rS').map((x) => x.id)], [{ day: 3, from: '2026-11', to: '2026-11' }, ['rS@2026-11']], '«каждый месяц» unticked on Tool S\'s November: the repeat ends after that month');
  // The tax the page worked out: its card, and «Сумма по декларации».
  const vat = 't|vat|2026Q3';
  await openRow(pg, vat);
  same([await text(pg, K('row') + '.ed-why'), await pg.$eval('#ed-name', (e) => [e.disabled, e.value]), await text(pg, K('row') + 'label[for="ed-amt"] span'), await texts(pg, K('row') + '.ed-foot button'), (await drawn(pg, vat)).split(' | ').slice(0, 5).join(' | ')],
    ['Посчитано: 20% сверху счетов клиентов с VAT за III кв. 2026 — начислено £200. Сумму по декларации и дату можно поправить.', [true, 'UK VAT за III кв. 2026'], 'Сумма по декларации', ['Оплачено', 'Перенести на…', 'Не платим', 'Закрыть', 'Сохранить'], 'td-row td-hist | none | UK VAT за III кв. 2026 | Wise · посчитано по правилу | −£200'],
    'the computed tax: muted, «посчитано по правилу», no «≈»; its card says where the figure comes from, and its name is not to be typed');
  await fill(pg, 'row', { amt: 180, date: '2026-11-05' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'the declared sum typed');
  same([S.P.taxes.length, S.P.tax.per['vat|2026Q3'].amt, S.P.tax.per['vat|2026Q3'].date, item(S.M, vat).cash, item(S.M, vat).day, per(S.M, 'vat|2026Q3').approx], [0, 180, '2026-11-05', -180, '2026-11-05', false], '£180 on 5 Nov saved: no row is written — the period remembers its declared sum and its date');
  // «каждый месяц» on a new row; a tax with a founder in its name; a withdrawal.
  const out = S.fig('out');
  const inst = await addRow(pg, 'taxes', { name: 'Corporation tax — части', amt: 500, date: '2026-10-19', monthly: true });
  S = await holds(pg, 'an instalment every month');
  same([stored(S, inst).rec, stored(S, inst).of, S.M.items.filter((x) => x.row === inst && x.day <= S.M.end).map((x) => [x.src, x.date, x.cash].join(' ')), close(S.fig('out'), out + 1000)], [{ day: 19, from: '2026-10' }, false, ['occ 2026-10-19 -500', 'occ 2026-11-19 -500'], true],
    '«каждый месяц» on a new tax row of £500 on the 19th: a bill of its own that repeats — two of it inside 60 days');
  const pv = await addRow(pg, 'taxes', { name: 'HMRC Vanya', amt: 400, date: '2026-10-21' });
  const wd = await addRow(pg, 'div', { name: 'Вывод', amt: 3000, date: '2026-10-10' });
  S = await holds(pg, 'a personal tax and a withdrawal');
  same([S.P.div.map((r) => [r.id === pv ? 'pv' : 'wd', r.blk, !!r.ptax, r.f || '']), S.P.taxes.map((r) => r.id === inst), S.fig('out.div'), S.fig('out.ptax'), !!item(S.M, wd).wd], [[['pv', 'div', true, 'vanya'], ['wd', 'div', false, '']], [true], 3400, 400, true],
    '«HMRC Vanya» typed as a tax is stored in «Дивиденды» as a personal tax; «Вывод» is a withdrawal — «дивиденды £3.4k (личные налоги £400)»');
  // «Удалить» asks twice.
  await openRow(pg, wd);
  await pg.click(K('row') + '[data-ed-do="del"]');
  same([await text(pg, K('row') + '[data-ed-do="del"]'), !!stored(await look(pg), wd)], ['Точно удалить?', true], '«Удалить» asks once more before it deletes');
  await pg.click(K('row') + '[data-ed-do="del"]');
  S = await holds(pg, '«Удалить»');
  same(stored(S, wd), null, '… and then does');
  await calm(pg, 'after all of it');
  await finish(pg);

  // The sheet of balances: «Что из этого уже прошло?» and «расходится с расчётом» (test 7 on the screen).
  const P7 = planW({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], other: [row('rent', 'Rent', 900, '2026-10-02', { bank: 'Barclays' })] });
  const p7 = await scene('test 7', ledA(), P7);
  S = await holds(p7, 'Barclays 3,000 and Rent £900 on 2 Oct');
  shows(S, { now: 13000, out: 7020 }, 'Barclays 3,000 as of 30 Sep and Rent £900 on 2 Oct');
  same(await drawn(p7, 'rent'), 'td-row | none | Rent | Barclays · не видно: выписки по 28 сен | −£900 | сегодня, вт 6 окт', 'Rent, under today, says «не видно: выписки по 28 сен»');
  await p7.click('#view-today .td-kpi');
  const box = K('bal') + '[data-ed-acct="Barclays|GBP"] ';
  await p7.fill(box + '[data-ed-bamt]', '2100');
  same([await p7.$$eval(box + '[data-ed-pass]', (l) => l.map((i) => i.dataset.edPass + (i.checked ? ' ticked' : ' unticked'))), await text(p7, box + '[data-ed-drift]')], [['rent unticked'], 'расходится с расчётом на £900'], '«Вписать остаток» Barclays 2,100 lists Rent, unticked, and says «расходится с расчётом на £900»');
  await p7.check(box + '[data-ed-pass="rent"]');
  same(await text(p7, box + '[data-ed-drift]'), '', '… ticked, the typed figure and the reckoning agree');
  await p7.click(K('bal') + '[data-ed-save]');
  S = await holds(p7, 'Barclays 2,100 with Rent ticked');
  shows(S, { now: 12100, out: 6120, end: 13980 }, 'saved with the tick');
  same([stored(S, 'rent').paid.on, stored(S, 'rent').paid.at === S.P.banks[1].at - 1, item(S.M, 'rent').mark.counts, S.M.nowApprox], ['2026-10-02', true, false, false], '… Rent is marked a moment before the balance: inside it, adding nothing, no «≈»');
  await p7.click('#toastUndo');
  await p7.click('#view-today .td-kpi');
  await p7.fill(box + '[data-ed-bamt]', '2100');
  await p7.click(K('bal') + '[data-ed-save]');
  S = await holds(p7, 'Barclays 2,100 without the tick');
  shows(S, { now: 12100, out: 7020, end: 13080 }, 'saved without the tick');
  same(await text(p7, '#view-today .td-verdict .note'), '1 строка на £900 между выписками и вписанным остатком — возможно, посчитана дважды.', '… and the first line under the sentence says what may be counted twice');
  await finish(p7);
});

// =====================================================================================================================
// «КАССА». The same model, typed into: one month at a time, and the same plan day by day.
// =====================================================================================================================
// To «Касса», on the half asked for.
const goCash = async (pg, view = 'plan') => {
  await pg.click('.nav [data-tab="cash"]');
  await pg.click(`#view-cash [data-cs-view="${view}"]`);
  await pg.waitForSelector(view === 'plan' ? '#cs-plan' : '#cs-stmt');
};
// A row of a month's list, and one of its boxes.
const cs = (k, id) => `#cs-sec-${k} tr[data-cs-id="${id}"]`;
const box = (k, id, f) => `${cs(k, id)} [data-cs-f="${f}"]`;
const listed = (pg, k) => pg.$$eval(`#cs-sec-${k} tr[data-cs-id]`, (l) => l.map((tr) => tr.dataset.csId));
// A row as it is drawn: its classes; whether its name is struck through; name, amount, currency, day, bank;
// the one remark; what its last cell offers.
const csRow = (pg, k, id) => pg.$eval(cs(k, id), (tr) => {
  const v = (f) => { const e = tr.querySelector(`[data-cs-f="${f}"]`); return e ? e.value : null; };
  const t = (s) => { const e = tr.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const name = tr.querySelector('[data-cs-f="name"]') || tr.querySelector('.cs-nt');
  const tick = tr.querySelector('[data-cs-f="on"]');
  return [tr.className.replace('cs-r', '').trim() || 'typed', getComputedStyle(name).textDecorationLine, tick ? (tick.checked ? 'on' : 'off') : 'no tick', v('name') ?? t('.cs-nt'), v('amt') ?? t('.cs-at'), v('cur') ?? t('.cs-ct'), v('date') ?? t('.cs-dd'), v('bank') ?? t('.cs-bkn'), t('[data-cs-rm]'), t('[data-cs-st]')].join(' | ');
});
// The month in view; and a walk to another one by the switcher's own buttons.
const monthAt = (pg) => pg.evaluate(() => window.__cash.at().month);
async function toMonth(pg, ym) {
  for (let i = 0; i < 30; i++) {
    const at = await monthAt(pg);
    if (at === ym) return true;
    const b = `#cs-month [data-cs-mon="${at < ym ? 1 : -1}"]`;
    if (await pg.$eval(b, (e) => e.disabled)) return false;
    await pg.click(b);
  }
  return false;
}
// «+ новая строка» of a list: the card opens under that list, already knowing what is being added.
async function addInList(pg, k, f) {
  await pg.click(`#cs-sec-${k} [data-ed-add]`);
  await pg.waitForSelector(`#cs-sec-${k} ` + K('add'));
  await fill(pg, 'add', f);
  await pg.click(K('add') + '[data-ed-save]');
  return pg.evaluate((list) => { const l = window.__cash.state()[list]; return l[l.length - 1].id; }, k);
}
// The cursor leaves the row: a tap on the month's name, which does nothing else.
const leave = async (pg) => { await pg.click('#cs-mname'); await sleep(60); };
const fmtP = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
const toastText = (pg) => pg.$eval('#toast', (e) => (e.hidden ? '' : e.querySelector('#toastText').textContent.replace(/ /g, ' ')));
// A line of «Выписка по дням»: its cells; and the rows under it, each as it is drawn.
const dayLine = (pg, d) => pg.$eval(`#cs-stmt tr[data-cs-row="${d}"]`, (tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
const dayRows = (pg, d) => pg.$$eval(`#cs-stmt tr[data-cs-row="${d}"] + tr.cs-items li`, (l) => l.map((li) => {
  const g = (s) => li.querySelector(s);
  const b = g('.cs-ctl button');
  return [li.dataset.csLi, li.className.trim() || 'typed', getComputedStyle(g('.cs-nmt')).textDecorationLine, b ? b.textContent.trim() + '|' + (b.getAttribute('aria-pressed') ?? '') : g('.cs-ctl').textContent.trim(), li.querySelectorAll('[data-cs-ldate]').length ? 'date' : 'no date', li.querySelectorAll('[data-cs-fix]').length ? 'фикс' : 'no фикс', g('.cs-rm') ? g('.cs-rm').textContent : '', g('.cs-am').textContent.replace(/\s+/g, ' ').trim()].join(' | ').replace(/ /g, ' ');
}));
const openDay = async (pg, d) => { if ((await pg.$eval(`#cs-stmt tr[data-cs-row="${d}"]`, (e) => e.getAttribute('aria-expanded'))) === 'false') await pg.click(`#cs-stmt tr[data-cs-row="${d}"] td:first-child`); };
const wiseCsv = (rows) => 'TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Payer Name,Payee Name,Merchant,Card Holder Full Name\n' + rows.map(([id, d, a, text, payer, payee]) => `${id},${d.slice(8)}-${d.slice(5, 7)}-${d.slice(0, 4)},${a.toFixed(2)},GBP,${text},,${payer || ''},${payee || ''},,`).join('\n');
const feed = (pg, csv) => pg.evaluate((c) => { const r = window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'wise.csv'), 'wise.csv'); return [r.bank, r.added]; }, csv);

await run('kassa figures', '«Касса» stands the same six figures at its head as «Сегодня», from the same model', async () => {
  // Three states of one studio: money enough, a balance missing, a minus.
  const none = JSON.parse(JSON.stringify(demoPlan(T)));
  none.banks.forEach((r) => { delete r.asOf; delete r.at; delete r.by; r.legacy = true; });
  const minus = JSON.parse(JSON.stringify(demoPlan(T)));
  minus.banks.forEach((r) => { r.amt = 0; });
  // The studio without the one incoming payment nobody has filed: with it the sentence is «Сначала разберите…»,
  // and the three states this check walks are the ones below it.
  const L0 = { ...demoLedger(T), inbox: [] };
  for (const [name, P, verdict] of [['the fabricated studio', demoPlan(T), 'v1'], ['with no balance typed', none, 'v0'], ['with nothing in the bank', minus, 'v4']]) {
    const pg = await scene('kassa figures', L0, P, { H: 60 });
    const A = await holds(pg, `${name}, «Сегодня»`);
    const six = (S) => SIX.concat(S.M.v0 ? [] : ['lowday', 'marks'].filter((k) => k in S.live)).map((k) => [k, S.live[k].v, plain(S.live[k].t)].join(' '));
    const heads = (tab) => pg.$$eval(`#view-${tab} .kpis .kpi`, (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    const today = [six(A), await heads('today'), await text(pg, '#view-today .page-sub')];
    await goCash(pg);
    let B = await holds(pg, `${name}, «Касса · План»`, 'cash');
    same([B.M.verdict.id, six(B), await heads('cash'), await text(pg, '#view-cash .page-sub')], [verdict, ...today], `${name} (${verdict}): the six figures of «Касса», their labels, the words under them and the line under the heading are those of «Сегодня», to the letter`);
    await goCash(pg, 'days');
    B = await holds(pg, `${name}, «Касса · По дням»`, 'cash');
    same([six(B), await heads('cash')], today.slice(0, 2), '… the same on «По дням»');
    same([B.fig('say'), plain(await text(pg, '#cs-answer .cs-hl')).slice(0, verdict === 'v0' ? 12 : verdict === 'v4' ? 0 : 20)], [{ v1: 'fine', v0: 'v0', v4: 'minus' }[verdict], { v1: 'Денег хватает на 60 ', v0: 'Нет остатка:', v4: '' }[verdict]], `… and «Итог» says what the sentence on «Сегодня» says: ${plain(await text(pg, '#cs-answer .cs-hl')).slice(0, 70)}…`);
    // Its own «30 дней» is the same switch.
    await pg.click('#view-cash [data-cs-h="30"]');
    B = await holds(pg, `${name}, 30 days chosen in «Касса»`, 'cash');
    await pg.click('.nav [data-tab="today"]');
    const A30 = await holds(pg, `${name}, back on «Сегодня»`);
    same([A30.H, six(A30)], [30, six(B)], '… «30 дней» pressed in «Касса» is 30 days on «Сегодня» too, and the figures agree again');
    await pg.click('#view-today [data-td-h="60"]');
    same([await puts('cash', 0), await puts('led', 0)], [0, 0], '… and none of the looking wrote anything');
    await pg.context().close();
  }
  // Nothing in the tab reads what the old page kept in the plan: its own rates, its horizon, the tick of a balance.
  // (The plan has a payment typed in dollars, so a rate read from the wrong place would show.)
  const usd = (P) => { P.team.push(row('usd-out', 'Person U', 1350, addDays(T, 10), { cur: 'USD', blk: 'cogs' })); return P; };
  const odd = usd(JSON.parse(JSON.stringify(demoPlan(T))));
  odd.fx = { USD: 9, RUB: 9, EUR: 9, AMD: 9 };
  odd.horizon = '2031-01-01';
  odd.banks.forEach((r) => { r.on = false; });
  const pg = await scene('kassa deaf', demoLedger(T), odd, { H: 60 });
  await goCash(pg);
  const plain60 = await holds(pg, 'a plan with wild rates, a far horizon and every balance unticked', 'cash');
  const M0 = await C(demoLedger(T), usd(demoPlan(T)), T, { H: 60 });
  same([plain60.fig('now'), plain60.fig('in'), plain60.fig('out'), plain60.fig('low'), await pg.$$eval('#view-cash [data-cs-fx], #view-cash #cs-horizon, #view-cash #cs-cushion, #cs-accts input', (l) => l.length)], [M0.now, M0.IN, M0.OUT, M0.LOW, 0], '§5.14: «Касса» draws the same figures whatever plan.fx, plan.horizon and banks[].on say — and has no box for a rate, a horizon or a balance');
  // … and not only the six: every word of both halves is what the same plan without those oddities draws.
  const both = async (g) => { const o = [await g.$eval('#cs-plan', (e) => e.innerText)]; await g.click('#view-cash [data-cs-view="days"]'); o.push(await g.$eval('#cs-days', (e) => e.innerText)); await g.click('#view-cash [data-cs-view="plan"]'); return o; };
  const wild = await both(pg);
  await pg.context().close();
  const sane = await scene('kassa sane', demoLedger(T), usd(demoPlan(T)), { H: 60 });
  await goCash(sane);
  const tame = await both(sane);
  ok(wild[0] === tame[0] && wild[1] === tame[1] && wild[0].length > 2000 && wild[1].length > 2000 && /Ещё платить\s*\$[\d,]+/.test(tame[0]), `… every word of «План» (${wild[0].length} characters) and of «По дням» (${wild[1].length}) is the same with them and without`, [wild[0].length, tame[0].length, wild[1].length, tame[1].length]);
  await sane.clock.setFixedTime(new Date('2026-10-06T23:30:00Z'));
  await sane.click('#view-cash [data-cs-view="days"]');
  const late = await holds(sane, 'half an hour after London midnight', 'cash');
  same([late.M.T, await sane.$eval('#cs-cal .cs-today', (e) => e.dataset.csCal), (await text(sane, '#view-cash .page-sub')).slice(0, 8), late.at.month], ['2026-10-07', '2026-10-07', 'ср 7 окт', '2026-10'], '… nor a date kept from when the page was loaded: past London midnight its today, its calendar and its heading are the 7th');
  await sane.context().close();
});

await run('mark', '«Оплачено» in «Касса» is a founder\'s word: it moves the money from the plan into «сейчас» and changes no balance (test 4)', async () => {
  const pg = await scene('mark', ledA(), planW());
  await goCash(pg);
  const g = await addInList(pg, 'team', { name: 'Person G', amt: 1000, date: '2026-10-07' });
  let S = await holds(pg, 'Person G £1,000 for 7 Oct', 'cash');
  shows(S, { now: 10000, out: 7120 }, 'typed outflow Person G £1,000, 7 Oct, from «Касса»\'s own «+ новая строка»');
  same(S.M.END, 10880, '… END 10,880');
  const banks = JSON.stringify(S.P.banks);
  await pg.click(cs('team', g) + ' [data-ed-do="paid"]');
  S = await holds(pg, '«✓ оплачено»', 'cash');
  shows(S, { now: 9000, out: 6120, marks: -1000 }, '«✓ оплачено», one tap');
  const r = stored(S, g);
  same([S.M.END, plain(S.live.now.t), JSON.stringify(S.P.banks) === banks, r.paid.on, r.paid.by, typeof r.paid.at, 'paidAdj' in r, S.fig('acct.Wise|GBP'), await text(pg, '#cs-accts [data-cs-acct="Wise|GBP"] .cs-act')], [10880, '£9,000', true, T, 'Mika', 'number', false, 9000, '£10,120 на 30 сен · вручную · Mika'],
    '… END unchanged, NOW with the words «в т.ч. отмечено вручную» under it, plan.banks deep-equal (§5.8): the mark is {on: today, at, by} on the row, the typed balance still reads £10,120 as of 30 Sep, and only the reckoning beside it is 1,000 lower');
  same([await csRow(pg, 'team', g), await toastText(pg)], ['cs-done | line-through | no tick | Person G | 1,000 | GBP | 7 окт | Wise | отмечено · ждёт выписку | оплачено ✓', 'Оплачено: Person G'], '… the row stays in its place in October, struck through, its toggle pressed');
  // under its own day in «По дням», toggle still working
  await pg.click('#view-cash [data-cs-view="days"]');
  await openDay(pg, '2026-10-07');
  same([await dayLine(pg, '2026-10-07'), await dayRows(pg, '2026-10-07')], [['ср 7 окт', '£9,000', '—', '—', '£9,000', 'оплачено 1'], [`${g} | cs-ispaid cs-done | line-through | оплачено ✓|true | no date | no фикс | отмечено · ждёт выписку | −£1,000`]], 'in «По дням» it stands under its own day, 7 Oct, struck through and counted in nothing: the day\'s line has no money and says «оплачено 1»');
  await pg.click(`#cs-stmt li[data-cs-li="${g}"] [data-ed-do="unpaid"]`);
  S = await holds(pg, 'the mark taken back', 'cash');
  shows(S, { now: 10000, out: 7120 }, 'pressed again there: back in the plan');
  same(['paid' in stored(S, g), JSON.stringify(S.P.banks) === banks, await dayLine(pg, '2026-10-07'), (await dayRows(pg, '2026-10-07'))[0]], [false, true, ['ср 7 окт', '£10,000', '—', '−£1,000', '£9,000', '1'], `${g} | typed | none | ✓ оплачено|false | date | фикс |  | −£1,000`], '… the mark is gone, the balances as they were, the day counts its £1,000 again');
  await pg.click(`#cs-stmt li[data-cs-li="${g}"] [data-ed-do="paid"]`);
  // the statement that shows the payment takes the mark's place: the row is then closed by the bank's own row, under the bank's date
  await pg.clock.fastForward(60000);
  same(await feed(pg, wiseCsv([['TRANSFER-9', T, -1000, 'Sent money to somebody', '', 'Somebody']])), ['Wise', 1], 'a statement uploaded after the tap brings 6 Oct −1,000');
  await goCash(pg, 'days');
  S = await holds(pg, 'the statement row in the mark\'s place', 'cash');
  shows(S, { now: 9000, out: 6120 }, 'the row, still unrecognised in «Разбор», replaces the mark');
  same([S.M.END, plain(S.live.now.t), 'marks' in S.live, item(S.M, g).done.by, item(S.M, g).done.day], [10880, '£9,000', false, 'row', T], '… NOW 9,000 without «≈», END where it was; the line is closed by the row');
  await openDay(pg, T);
  same((await dayRows(pg, T)).filter((x) => x.startsWith(g)), [`${g} | cs-ispaid cs-done | line-through | по выписке 6 окт | no date | no фикс |  | −£1,000`], '… and now stands under the day of the statement\'s row, 6 Oct — «по выписке», with nothing left to press');
  await pg.click('#view-cash [data-cs-view="plan"]');
  same((await csRow(pg, 'team', g)).split(' | ').slice(-2), ['', 'по выписке 6 окт'], '… the same in its month');
  ok(JSON.stringify((await look(pg, 'cash')).P.banks) === banks, 'through all of it no bank row of the plan changed');
  await finish(pg);

  // What the old Касса had as paid arrives as a founder's old word: done, moving no balance, and can be taken back.
  const v1 = { v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, horizon: '2026-11-10', fx: { USD: 1.3, RUB: 110, EUR: 1.2, AMD: 500 },
    banks: [{ id: 'r1', name: 'Wise — GBP', amt: 9000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }],
    inflows: [], team: [{ id: 'r2', name: 'Person G', amt: 1000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-07', paid: true, paidAdj: { bank: 'Wise', cur: 'GBP', delta: -1000 } }], taxes: [], other: [] };
  const po = await scene('old paid row', ledA(), v1);
  await goCash(po);
  S = await holds(po, 'a row the old Касса had as paid', 'cash');
  const old = S.P.team[0];
  same([old.paid, 'paidAdj' in old, await csRow(po, 'team', old.id), S.P.banks[0].amt, S.P.banks[0].legacy], [{ on: '', legacy: true }, false, 'cs-done | line-through | no tick | Person G | 1,000 | GBP | 7 окт | Wise | отмечено в старой Кассе | оплачено ✓', 9000, true], 'a row the old Касса had as «оплачено» is done on that old word; the note of what it once did to a balance is dropped');
  await po.click(cs('team', old.id) + ' [data-ed-do="unpaid"]');
  S = await holds(po, 'the old mark taken back', 'cash');
  same(['paid' in S.P.team[0], S.P.banks[0].amt, (await csRow(po, 'team', old.id)).split(' | ')[0]], [false, 9000, 'typed'], '… taken back, it is an open row again, and the old balance is left exactly as it came');
  await finish(po);
});

// =====================================================================================================================
// WHAT THE REVIEW FOUND. Each check below failed on the build it was written against: a mark that made a month
// look better than it was, a payment that came back into «сейчас», a forecast that moved at midnight.
// =====================================================================================================================
const T2 = '2026-10-13';
const AT4 = ms('2026-10-13T08:00:00Z'); // the statement uploaded a week on
const blocksOf = (M) => Object.fromEntries(Object.entries(M.month.blocks).map(([k, x]) => [k, x.total]));

await run('marks', 'a hand mark and the statements: the day it is tapped, a payment a little over, the balance\'s own day, upload before the tap', async () => {
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  // This morning's upload holds a row dated today, so the bank's statements "reach" today — and say nothing about a
  // payment made after them.
  const today = filed('coffee', T, -50, 'other', 'Coffee', { at: AT2 });
  let M = await C(ledA({ tx: [today] }), planW({ team: [g({ paid: paid(T) })] }));
  same([acct(M, 'Wise|GBP').cov, item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').mark.counts, item(M, 'g').mark.cov, M.now, M.OUT], [T, 'done', 'mark', true, '2026-09-28', 8950, 6120],
    '«Оплачено» tapped on a day the morning\'s statement already reaches: the mark stands and is in «сейчас» — a statement uploaded before the tap cannot contradict it');
  // A week on the next statement reaches 12 Oct and holds no such row: only now is the line open again.
  M = await C(ledA({ tx: [today, reach('Wise', '2026-10-12', 'GBP')].map((r) => (r.id.startsWith('reach') ? { ...r, at: AT4 } : r)) }), planW({ team: [g({ paid: paid(T) })] }), T2);
  same([item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').mark.cov, item(M, 'g').mark.counts, item(M, 'g').day, M.marksGbp], ['done', 'ok', '2026-10-12', false, '', 0], '… a statement uploaded AFTER the tap that reaches past its day and shows no such row: the line stays closed, on the founder\'s word, and leaves «сейчас»');

  // Paid a little over. A line the table knows by name, marked, and the bank shows 8% more: the row closes it as it
  // would have closed it unmarked — not "unseen" beside its own payment.
  const z = (more = {}) => row('z', 'Person Z', 1000, '2026-10-07', more);
  const over = ledA({ tx: [filed('z1', '2026-10-07', -1080, 'cogs', 'Person Z', { at: AT4 }), { ...reach('Wise', '2026-10-12'), at: AT4 }] });
  const marked = await C(over, planW({ team: [z({ paid: paid(T) })] }), T2);
  const plainRow = await C(over, planW({ team: [z()] }), T2);
  same([item(marked, 'z').state, item(marked, 'z').done.by, item(marked, 'z').done.note, item(marked, 'z').done.over, item(marked, 'z').mark.counts], ['done', 'row', 'over', 80, false], 'marked £1,000, the bank shows −£1,080 from the same name: closed by that row, «пришло больше на £80»');
  same([marked.now, marked.OUT, marked.END, marked.month.M_EXP], [plainRow.now, plainRow.OUT, plainRow.END, plainRow.month.M_EXP], '… and every figure is what it would be had the line never been marked: the payout is counted once');
  // … and in part: the statement that brought the part has shown the mark's day. Marked is paid: the line is closed at
  // what came, and the rest is not a debt unless a founder says «Частично».
  const partL = ledA({ tx: [filed('z1', T, -400, 'cogs', 'Person Z', { at: AT3 })] });
  const part = await C(partL, planW({ team: [z({ paid: paid(T) })] }));
  const partPlain = await C(partL, planW({ team: [z()] }));
  same([item(part, 'z').state, item(part, 'z').done.by, item(part, 'z').done.note, item(part, 'z').done.got, part.marksGbp, part.now, part.OUT, partPlain.OUT - part.OUT, item(partPlain, 'z').part], ['done', 'row', 'other', 400, 0, 9600, 6120, 600, { got: 400, of: 1000 }],
    'marked £1,000, a row of −£400 arrives: closed at what came — «заплатили £400, в плане £1,000» — where the unmarked row still waits for its 600');
  const partQ = await wr(planW({ team: [z()] }), 'partial', item(partPlain, 'z'), 400, 'zr', TAP, BY, T);
  const partM = await C(partL, partQ);
  same([item(partM, 'z').done.note, item(partM, 'z').done.got, item(partM, 'zr').name, item(partM, 'zr').state, item(partM, 'zr').day, partM.OUT, partM.END, partM.now], ['partial', 400, 'Person Z — остаток с октября', 'carry', '2026-11-01', 6720, partPlain.END, 9600],
    '«Частично» on the same row, £400: closed for October at 400, the 600 a debt of November — END is what it was before either answer');

  // The balance's own day. Typed at 09:00 for today; a payout dated today marked at noon; the statement then shows
  // the payout — on the day of the balance. It was on top of the balance as a mark and must stay there as a row.
  const typedToday = (team) => planX({ banks: [bal('Wise', 'GBP', 9880, T, { at: ms('2026-10-06T08:00:00Z') })], team });
  const g6 = (more = {}) => row('g', 'Person G', 1000, T, more);
  const open0 = await C(ledA(), typedToday([g6()]));
  const tapped = await C(ledA(), typedToday([g6({ paid: paid(T) })]));
  figs(open0, { now: 9880, OUT: 7120 }, 'a balance typed this morning for today, and a payout planned for today');
  figs(tapped, { now: 8880, OUT: 6120, END: open0.END }, '«Оплачено» at noon: it is on top of the morning\'s balance');
  for (const [how, L] of [['left unfiled in «Разбор»', ledA({ inb: [inbox('s', T, -1000, '', '', { at: AT3 })] })], ['filed under its name', ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] })]]) {
    M = await C(L, typedToday([g6({ paid: paid(T) })]));
    same([item(M, 'g').done.by, item(M, 'g').rows, acct(M, 'Wise|GBP').after, M.marksGbp, M.now, M.OUT, M.END], ['row', ['s'], -1000, 0, 8880, 6120, open0.END], `the statement then shows −£1,000 on that same day, ${how}: the row takes the mark's place and «сейчас» does not move`);
  }
  // A payment OUT of the balance's own day, uploaded after the balance was typed «на сейчас» and marked by nobody,
  // is taken to have left after it — the cautious half of a question the page does not ask yet. Taken to be inside,
  // a payroll paid that afternoon stayed in «сейчас» for good, and «Можно вывести» rose by it the day after.
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), typedToday([g6()]));
  same([item(M, 'g').done.by, acct(M, 'Wise|GBP').after, acct(M, 'Wise|GBP').same, M.now, M.now === tapped.now], ['row', -1000, -1000, 8880, true],
    'a payout of the balance\'s own day, in a statement uploaded after the balance was typed for «сейчас»: it left after the balance — «сейчас» 8,880, the figure «Оплачено» at noon gave');
  // … and «Можно вывести» the next morning is what it was before the payout, not more by it.
  const rich = (team, at = '2026-10-06T08:00:00Z') => planX({ banks: [bal('Wise', 'GBP', 29880, T, { at: ms(at) })], team });
  const before = await C(ledA(), rich([g6()]));
  const after = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: ms('2026-10-07T08:00:00Z') })] }), rich([g6()]), '2026-10-07');
  same([before.now, before.free.why, after.now, after.free.now - before.free.now], [29880, '', 28880, 0], '… typed 29,880 in the morning, 1,000 paid in the afternoon, the statement filed the next day: «сейчас» 28,880, and «Можно вывести» has not grown by the payout');
  // Money IN of that day stays inside the balance; so does any row that was on the page when the balance was typed;
  // and a balance typed the next day for the 6th — «на конец дня» — holds the whole of the 6th.
  M = await C(ledA({ tx: [filed('s', T, 500, 'rev', 'Client Q', { at: AT3 })] }), typedToday([]));
  same([acct(M, 'Wise|GBP').after, acct(M, 'Wise|GBP').same, M.now], [0, 0, 9880], 'money IN of that day, uploaded later, stays inside the balance');
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person Q', { at: ms('2026-10-06T07:00:00Z') })] }), typedToday([]));
  same([acct(M, 'Wise|GBP').after, M.now], [0, 9880], 'a payout that was already on the page when the balance was typed is inside it');
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person Q', { at: ms('2026-10-07T10:00:00Z') })] }), planX({ banks: [bal('Wise', 'GBP', 9880, T, { at: ms('2026-10-07T08:00:00Z') })] }), '2026-10-07');
  same([acct(M, 'Wise|GBP').after, M.now], [0, 9880], 'a balance typed the next day for the 6th is «на конец дня»: every row of the 6th is inside it');
  // A line ticked in «Что из этого уже прошло?» was marked a moment before the balance: the founder said it is
  // inside. The row that then shows it is inside too.
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), typedToday([g6({ paid: paid(T, ms('2026-10-06T08:00:00Z') - 1) })]));
  same([item(M, 'g').done.by, acct(M, 'Wise|GBP').after, M.now], ['row', 0, 9880], 'a line ticked as already inside the balance, and the row that then shows it: counted once, inside');

  // Upload, then the tap, then the filing. The payout is in «Разбор», unrecognised; the founder marks the line; then
  // files the row. At no step is it taken off twice.
  const up = ledA({ inb: [inbox('s', T, -1000, '', '', { at: AT2 })] });
  const steps = [await C(up, planW({ team: [g()] })), await C(up, planW({ team: [g({ paid: paid(T) })] })), await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT2 })] }), planW({ team: [g({ paid: paid(T) })] }))];
  same(steps.map((X) => [X.now, X.OUT, X.END]), [[9000, 7120, 9880], [9000, 6120, 10880], [9000, 6120, 10880]], 'uploaded and unfiled (the line still open beside its payment, as «Разбор» warns) → «Оплачено» (the unfiled row is the payment) → filed: «сейчас» is 9,000 at every step');
  same([steps[1].marksGbp, item(steps[1], 'g').done.by, item(steps[2], 'g').done.by, item(steps[2], 'g').state], [0, 'row', 'row', 'done'], '… the mark never stands beside the row it was made for');
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT2 }), { ...reach('Wise', '2026-10-12'), at: AT4 }] }), planW({ team: [g({ paid: paid(T) })] }), T2);
  same([item(M, 'g').state, M.OUT, M.cards.filter((c) => c.item === 'g').length], ['done', 6120, 0], '… and a week on it is closed, not reopened');
});

await run('first minus', 'a minus ahead: the sentence names the day the money runs out, and «Как закрыть» lands on the advice', async () => {
  // Person T is paid 10,500 on the 12th: 500 short that day; Person B's 6,000 on the 20th makes it 6,500; Client A
  // pays on the 28th.
  const P = planW({ team: [row('t1', 'Person T', 10500, '2026-10-12')] });
  const M = await C(ledA(), P);
  same([M.verdict.id, M.minusDay, M.minus, M.LOWDAY, M.LOW, M.plusDay], ['v4', '2026-10-12', -500, '2026-10-20', -6500, '2026-10-28'], 'the model: first below zero on the 12th, deepest on the 20th, above zero again on the 28th');
  for (const w of [1320, 375]) {
    const pg = await scene('first minus ' + w, ledA(), P, { w, h: 812 });
    const S = await holds(pg, `${w}px, a minus`);
    same([await text(pg, '#view-today .td-say'), plain(S.live.minusday.t), await pg.$eval('#view-today .td-verdict [data-td-days]', (b) => b.dataset.tdDays + ' ' + b.textContent)],
      ['12 октября не хватит £500 — это первый минус. Глубже всего 20 октября: не хватит £6,500. В плюс выходим 28 октября.', '12 окт', '2026-10-12 Как закрыть'], `${w}px: the sentence leads with the first day short and then names the deepest; «Нижняя точка» says «первый минус 12 окт»`);
    await pg.click('#view-today .td-verdict [data-td-days]');
    await pg.waitForSelector('#cs-answer');
    const r = await pg.evaluate(() => { const a = document.querySelector('#cs-answer').getBoundingClientRect(); const bar = document.querySelector('.topbar').getBoundingClientRect(); const k = document.querySelector('#view-cash .cs-sum'); const stuck = getComputedStyle(k).position === 'sticky' ? k.getBoundingClientRect().bottom : bar.bottom; return { top: Math.round(a.top - stuck), inView: a.top < window.innerHeight / 2, y: Math.round(window.scrollY), sel: (document.querySelector('#cs-stmt tr.cs-sel') || { dataset: {} }).dataset.csRow, view: window.__cash.at().view }; });
    ok(r.view === 'days' && r.sel === '2026-10-12' && r.top >= 0 && r.top <= 40 && r.inView && r.y > 0, `${w}px: «Как закрыть» opens «По дням» on the first day short, scrolled so that «Итог» stands right under the bar`, r);
    same(plain(await text(pg, '#cs-answer .cs-hl')), 'С пн 12 окт по вт 27 окт не хватает до £6,500.', `${w}px: … which says the stretch in one sentence`);
    await pg.context().close();
  }
  // One stretch of minus whose first day is its deepest reads as the design has it.
  const pg = await scene('one minus', ledA(), planW({ team: [row('t1', 'Person T', 9000, '2026-10-12')] }));
  same([await text(pg, '#view-today .td-say'), await pg.$('#view-today [data-live="minusday"]')], ['20 октября не хватит £5,000. В плюс выходим 28 октября.', null], 'when the first day short is the deepest, one sentence says both');
  await pg.context().close();
});


await run('demo', 'the fabricated studio on three different days', async () => {
  for (const day of ['2026-10-06', '2026-11-12', '2026-12-21']) {
    // The studio's ledger carries the moment each statement row was uploaded; its plan is version 3 — every balance
    // typed as of the day the statements reach, and every client, person and subscription a row that repeats.
    const L = demoLedger(day);
    const P = demoPlan(day);
    const before = JSON.parse(JSON.stringify(P));
    before.banks.forEach((r) => { delete r.asOf; delete r.at; delete r.by; r.legacy = true; });
    const old = await C(L, before, day, { H: 60 }, `demo ${day}, balances not confirmed`);
    const M = await C(L, P, day, { H: 60 }, `demo ${day}`);
    const count = (list, f) => Object.entries(list.reduce((o, x) => { o[f(x)] = (o[f(x)] || 0) + 1; return o; }, {})).sort().map(([k, v]) => `${k} ${v}`).join(' · ');
    const money = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
    console.log(`      ${day}: old balances → ${old.verdict.id} (${old.missing.length} without a balance); typed → ${M.verdict.id}`);
    console.log(`        NOW ${money(M.now)}${M.nowApprox ? ' ≈' : ''} as of ${M.nowDate} · IN ${money(M.IN)} (${M.inParts.n} поступлений, VAT ${money(M.inParts.vat)}) · OUT ${money(M.OUT)} (команда ${money(M.outParts.team)} · прочее ${money(M.outParts.other)} · налоги ${money(M.outParts.taxes)} · дивиденды ${money(M.outParts.div)}) · END ${money(M.END)} · LOW ${money(M.LOW)} on ${M.LOWDAY} · LATE ${money(M.LATE)}`);
    console.log(`        можно вывести ${money(M.free.now)}${M.free.why ? ' (' + M.free.why + ')' : ''} · тесный день ${M.free.tight.d}: ${money(M.free.tight.e)}, из них налоги ${money(M.free.tight.res)} · шаги: ${M.free.steps.map((s) => `${s.d} ${money(s.amt)} (${s.by})`).join('; ') || '—'} · под налоги сейчас ${money(M.taxes.reserve)}`);
    M.taxes.periods.filter((p) => p.state !== 'next').forEach((p) => console.log(`        ${p.name}: ${p.state}${p.asked ? ' (asked)' : ''} · начислено ${money(p.accF)} · ещё по плану ${money(p.accP)} · оплачено ${money(p.paid)} · осталось ${money(p.left)} · срок ${p.due}`));
    console.log(`        rows: ${LISTS.map((k) => `${k} ${P[k].length} (${P[k].filter((r) => r.rec).length} каждый месяц)`).join(' · ')} · items ${M.items.length}: ${count(M.items, (it) => it.state)} · cards ${M.cards.map((c) => c.n).join(' ') || 'none'}`);
    ok(old.v0 && old.missing.length === 5 && !M.v0 && M.now !== null && M.accounts.every((a) => !a.active || a.anchor), `${day}: with the old balances there is no total and five accounts to type; the plan as it stands has every account in use typed`, [old.verdict.id, M.verdict.id, old.missing, M.missing]);
    ok(P.v === 3 && P.team.every((r) => r.rec) && P.other.every((r) => r.rec) && P.inflows.filter((r) => r.rec).length >= 6 && P.div.some((r) => !r.ptax) && P.div.filter((r) => r.ptax).length === 2 && M.helper.lines.length === 0 && M.helper.have.length > 20,
      `${day}: the plan is written rows — every client, person and subscription a row that repeats, one withdrawal a month, two personal taxes — and the helper has nothing left to offer`, [P.inflows.length, P.team.length, M.helper.lines.map((l) => l.label)]);
    const vat = M.taxes.periods.filter((p) => p.rule === 'vat');
    const cl = (name) => M.clients.find((c) => c.name === name);
    ok(vat.some((p) => p.state === 'paid' && p.by === 'parts') && vat.some((p) => p.state === 'paid' && p.by === 'row' && p.paid < p.owed) && vat.some((p) => ['open', 'run'].includes(p.state)) && M.taxes.reserve > 5000 && card(M, 14).some((c) => c.rule === 'usn') && !card(M, 12).length,
      `${day}: UK VAT — the quarter due before the plan began paid in parts, one paid whole at nine tenths, one open; УСН asks about the quarter before its start; no payment is left unexplained`, vat.map((p) => [p.per, p.state, p.by]));
    ok(cl('Kestrel Bank').mark === 'vat' && cl('Halden & Co').mark === 'no' && cl('Orchard Lane').mark === 'no' && cl('Brightwater').banks.length === 2 && cl('Brightwater').banks.find((b) => b.bank === 'Barclays').vat && !cl('Brightwater').banks.find((b) => b.bank === 'Wise').vat,
      `${day}: clients with VAT and without, and one invoiced both ways — with VAT through Barclays, without through Wise`, M.clients.filter((c) => c.show).map((c) => [c.name, c.mark]));
    ok(M.IN > 10000 && M.OUT > 10000 && Math.abs(M.END) < 400000 && M.free.now > 0 && M.items.some((it) => it.wd && (it.part || (it.done && it.done.rows.length > 1))), `${day}: the figures are a studio's — and the month's withdrawal is being taken in several transfers`);
    if (day === T) {
      const big = item(M, 'c-meridian-labs@2026-10');
      same([M.verdict.id, M.nowIsToday, M.nowDate, M.cards.map((c) => c.n), big.day, big.occ.moved, M.LATE], ['v1', false, '2026-10-04', [4, 14, 7], '2026-10-29', true, 1900],
        '6 Oct: one incoming payment waits in «Разбор» — too small to change «денег хватает»; the money is «на 4 окт»; the largest client\'s October is moved to the 29th — that month alone; one invoice is late');
    }
    // §5.2 on the studio: a mark on any line counted this month leaves END and the month's result where they were.
    // (A line of another quarter marked today is another matter: its tax then accrues in this quarter, as T4 says a
    // marked line's does, and the two quarters' bills fall due on different sides of the window's end. So is the
    // late month of a client whose later months are not counted on: marking it received is the answer that brings
    // them back, and END rises by them.)
    let nTaps = 0;
    for (const it of M.items.filter((x) => x.day && x.day.slice(0, 7) === day.slice(0, 7) && !(x.occ && x.occ.stops)).slice(0, 14)) {
      const B = await C(L, await wr(P, 'mark', it, day, Date.parse(day + 'T11:00:00Z'), 'Mika'), day, { H: 60 }, `demo ${day}, mark ${it.id}`);
      if (!(close(B.END, M.END, 0.011) && close(B.month.blocks.result.total, M.month.blocks.result.total, 0.011))) ok(false, `demo ${day}: marking ${it.id} moved END or the month`, [M.END, B.END]);
      nTaps++;
    }
    ok(nTaps >= 8, `demo ${day}: marking any of ${nTaps} lines counted this month paid leaves END at ${M.END} and the month's result at ${M.month.blocks.result.total}`);
  }
});

// =====================================================================================================================
// THE SCREENS OF THE SECOND ITERATION. «Можно вывести», «Налоги», the month as three bars, the helper, «каждый месяц»
// on every row, «только этот месяц / и дальше», «Частично», and «Настройки → Налоги» — through the controls a founder
// presses, on the second design's fixture P. Three of its acceptance tests run end to end here: day one and the
// helper (tests 1 and 2 — taxes and rows that repeat), a written withdrawal (test 4 — dividends), this month and
// onward (test 5 — recurrence), and a typed tax row (test 9 — taxes).
// =====================================================================================================================
// «Можно вывести» as it reads: what stands above the answer, the answer, the reason — one paragraph, in that order.
const freeSays = async (pg) => plain((await texts(pg, '#view-today .td-free .td-fwhy, #view-today .td-free .td-fsay')).join(' '));
const freeRows = (pg) => pg.$$eval('#view-today .td-free .td-steps .td-row', (l) => l.map((r) => [r.querySelector('.td-nm').textContent, r.querySelector('.td-am').textContent].map((s) => s.replace(/ /g, ' ')).join(' → ')));
// A period of the block «Налоги» as it is drawn: its name and due date, its words, the figure on the right.
const taxRow = (pg, key) => pg.$eval(`#view-today .td-tax .td-row[data-td-per="${key}"]`, (r) => [r.querySelector('.td-nm').textContent, r.querySelector('.td-meta').textContent, r.querySelector('.td-am').textContent].map((s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())).catch(() => null);
const kpi = async (pg, i, tab = 'today') => { const l = await pg.$$eval(`#view-${tab} .kpi`, (k) => k.map((e) => [e.querySelector('.lbl').textContent, e.querySelector('.val').textContent, e.querySelector('.hint').textContent].map((s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()))); return l[i]; };
const undo = async (pg) => { await pg.click('#toastUndo'); await sleep(60); };
const goToday = async (pg) => { await pg.click('.nav [data-tab="today"]'); await pg.waitForSelector('#view-today [data-live="verdict"]'); };
const needCard = (n, k = 0) => `#view-today .td-need .op[data-td-card="${n}"] >> nth=${k}`;
const band = (pg, i) => pg.$$eval('#view-today .td-month .td-band', (l, i) => [...l[i].querySelectorAll('b, .td-bv, .td-cap')].map((e) => e.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()), i);
const money0 = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
const moneyK = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + '£' + (a >= 1000 ? (a / 1000).toLocaleString('en-GB', { maximumFractionDigits: a >= 10000 ? 0 : 1 }) + 'k' : Math.round(a)); };
const signed = (v) => (v > 0 ? '+' : '') + money0(v);
// «Касса · По дням» on a phone: the statement does not scroll inside its card, and every opened line's name, sum,
// mark, date and bank end inside the screen. Returns how many lines were looked at, and what was off.
const linesInSight = (pg, w) => pg.evaluate((w) => {
  const out = [];
  const t = document.querySelector('#cs-stmt').closest('.tbl');
  if (t.scrollWidth > t.clientWidth + 1) out.push('the statement scrolls inside its card: ' + t.scrollWidth + ' > ' + t.clientWidth);
  const lis = [...document.querySelectorAll('#cs-stmt li[data-cs-li]')];
  lis.forEach((li) => { for (const s of ['.cs-nmt', '.cs-am', '.cs-ctl button', '.cs-mv input', '.cs-bkn']) { const e = li.querySelector(s); if (!e) continue; const r = e.getBoundingClientRect(); if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push(li.dataset.csLi + ': ' + s + ' ends at ' + Math.round(r.right)); } });
  return [lis.length, out];
}, w);

await run('p1 on screen', 'day one, the taxes\' two questions and the helper, through the real controls (tests 1 and 2)', async () => {
  const pg = await scene('day one', ledP(), planP());
  let S = await holds(pg, 'day one: a ledger, three balances, no row');
  same([S.M.verdict.id, S.M.empty, S.M.cards.map((c) => c.n), S.M.items.map((it) => it.id)], ['vE', true, [15], ['t|vat|2026Q3']], 'the plan is empty: verdict vE, one question — the tax nobody has confirmed — and the only line anywhere is a tax the rules worked out from the facts');
  same([await text(pg, '#view-today .td-say'), await texts(pg, '#view-today .td-verdict button')], ['План пуст: на счетах £32,000, из них £4,800 — под налоги. Вперёд ничего не вписано, поэтому на сколько хватит денег, сказать не могу.', ['Заполнить октябрь', 'Подставить по прошлым месяцам']],
    'the sentence says what is in the bank, what of it is not the studio\'s, and that nothing is written ahead — with the two things to do');
  same([await kpi(pg, 1), await kpi(pg, 2), await kpi(pg, 3), await kpi(pg, 5)], [['Придёт за 30 дней', '—', 'план пуст'], ['Уйдёт за 30 дней', '—', 'план пуст'], ['Нижняя точка', '—', 'план пуст'], ['Можно вывести', '—', 'впишите расходы']], 'no figure of a forecast is on the screen: «—» and «план пуст» for what comes, what goes and the lowest point; «Можно вывести» names no sum');
  same([(await kpi(pg, 0))[2], S.fig('reserve')], ['выписки и остатки по 5 окт · 3 счёта · под налоги £4,800', 4800], '… while «Денег сейчас» says «под налоги £4,800»: the VAT of the quarter that has ended, from the facts');
  same([await freeSays(pg), await texts(pg, '#view-today .td-free button'), await pg.$('#td-chart'), await text(pg, '#view-today .td-two .card:first-child .note')], ['Сколько можно вывести, скажу, когда в плане будут расходы: впереди их не вписано — заполните октябрь. На счетах £32,000, из них £4,800 — под налоги.', ['Заполнить октябрь'], null, 'План пуст — линии пока нет.'],
    '«Можно вывести» says why it names no sum, and what to fill; the chart draws no line of a plan that is not there');
  same([await taxRow(pg, 'vat|2026Q3'), await taxRow(pg, 'usn|2026Q3'), await taxRow(pg, 'vat|2026Q2'), await text(pg, '#view-today .td-tsum span'), S.fig('tax.reserve')], [['UK VAT за III кв. 2026 · до 7 ноя', 'начислено £4,800 · оплачено £0', '£4,800'], ['УСН по Точке за III кв. 2026', 'начислено ₽42,480 (£360) · ответьте, платите ли его со счёта студии — пока в расчёт не входит', '—'], null, 'Из денег на счетах сегодня под налоги нужно держать', 4800],
    'the block «Налоги»: UK VAT of III кв. accrued from the facts and due 7 Nov; УСН shown as an accrual only until somebody confirms it; the quarter before the start, paid at 0.98, is not there');
  same([await band(pg, 0), (await band(pg, 2))[0]], [['Доход за октябрь', '£0', 'получено £0 из £0'], 'Результат'], 'the month so far is its facts: nothing has come in October yet, and nothing is filled in for it');
  await calm(pg, 'day one');
  // Card 15: the rule nobody confirmed.
  same([await text(pg, needCard(15) + ' >> .op-name'), await text(pg, needCard(15) + ' >> .op-text'), await texts(pg, '#view-today .td-need .op[data-td-card="15"] button')], ['УСН по Точке: начислено ₽42,480 за III кв. 2026', 'Считаю 6% от поступлений на Tochka RUB. Платите этот налог со счёта студии?', ['Да, 6%', 'Да, другая ставка', 'Не со счетов студии']], 'card 15 asks once about the built-in УСН');
  await pg.click('#view-today .td-need .op[data-td-card="15"] [data-ed-tax="yes"]');
  S = await holds(pg, '[Да, 6%]');
  same([S.P.tax.rules[1].ask, S.M.cards.map((c) => c.n), S.fig('reserve'), item(S.M, 't|usn|2026Q3').day, item(S.M, 't|usn|2026Q3').cash, S.M.verdict.id], [undefined, [14], 5520, '2026-10-28', -360, 'vE'], '[Да, 6%]: the rule counts — its III кв. is a line of −£360 on 28 Oct, «под налоги» 5,520 — and the quarter before the start is asked about; the plan is still empty');
  same([await text(pg, needCard(14) + ' >> .op-name'), await text(pg, needCard(14) + ' >> .op-text'), await texts(pg, '#view-today .td-need .op[data-td-card="14"] button')], ['УСН по Точке за II кв. 2026: начислено ₽42,480, платежей в выписках не найдено', 'Срок был 28 июл — до того, как страница начала считать. Остаток £360 ещё платите?', ['Да, одной суммой', 'Нет, закрыто']], 'card 14: a quarter that was due before the page began, with no payment found — and no «частями», since no part was ever paid');
  await pg.click('#view-today .td-need .op[data-td-card="14"] [data-ed-tax="shut"]');
  S = await holds(pg, '[Нет, закрыто]');
  same([S.P.tax.per['usn|2026Q2'].closed, S.M.cards.length, S.fig('reserve')], [true, 0, 5160], '[Нет, закрыто]: answered, nothing left to decide, «под налоги» 5,160');
  // The helper.
  await pg.click('#view-today .td-verdict [data-td-helper]');
  await pg.waitForSelector('#cs-helper');
  const lines = () => pg.$$eval('#cs-helper .cs-hrow', (l) => l.map((e) => [e.dataset.csHl, e.querySelector('[data-cs-ht]').checked ? 'ticked' : 'unticked', e.querySelector('[data-cs-ha]').value, e.querySelector('[data-cs-hd]').value, e.querySelector('.cs-bkn').textContent.trim(), e.querySelector('[data-cs-hs]').selectedOptions[0].textContent, e.querySelector('.cs-rm').textContent.replace(/ /g, ' ')].join(' | ')));
  same(await pg.evaluate(() => [document.querySelector('.nav .active').dataset.tab, window.__cash.at().view, window.__cash.at().month]), ['cash', 'plan', '2026-10'], '«Подставить по прошлым месяцам» opens it in «Касса · План», on the running month');
  same(await lines(), ['rev|client a | unticked | 8000 | 28 | Barclays | октября | в прошлый раз £8,000 + VAT, 28 сен', 'rev|client r | unticked | 236000 | 15 | Tochka | октября | в прошлый раз £2,000 по таблице — это ₽236,000 по её курсу, 15 сен', 'cogs|person b | unticked | 6000 | 20 | Wise | октября | в прошлый раз £6,000, 20 сен',
    'fixed|tool s | unticked | 120 | 3 | Wise | октября | в прошлый раз £120, 3 сен · 3-е уже прошло, а выписки до него не дошли: если уже заплатили — выберите «с ноября»', 'tax|@mika | unticked | 500 | 5 | Wise | октября | в прошлый раз £500, 5 сен · 5-е уже прошло, а выписки до него не дошли: если уже заплатили — выберите «с ноября»'],
    'it lists five payments — who, what it was LAST time, the usual day, the bank, the month to start from — none ticked; the founders\' own draws are not among them. No line is moved to November because its day has passed: the two whose day fell where no statement reaches say so, and what to choose if they were paid');
  // The button on «Сегодня» lands on the list it promised, not on the six figures above it.
  same(await pg.evaluate(() => { const h = document.querySelector('#cs-helper h2').getBoundingClientRect(), b = document.querySelector('.topbar').getBoundingClientRect(); return [h.top >= b.bottom - 1, h.top < innerHeight / 2, scrollY > 0]; }), [true, true, true], '… and the page is scrolled to it: the helper\'s heading stands under the top bar, in the upper half of the window');
  // Both were paid, and the balances typed for the 5th hold it: the founder picks «с ноября» for the two.
  for (const id of ['fixed|tool s', 'tax|@mika']) await pg.selectOption(`#cs-helper .cs-hrow[data-cs-hl="${id}"] [data-cs-hs]`, '2026-11');
  same([await pg.$eval('#cs-helper [data-cs-hadd]', (b) => [b.disabled, b.textContent]), (await rowIds(pg)).length, await saved(pg), LISTS.map((k) => store.cash.doc[k].length)], [[true, 'Отметьте, что подставить'], 0, true, [0, 0, 0, 0, 0]], '… and nothing is written by opening it: the plan, as saved, holds the two answers about the tax and not one row');
  for (const id of ['rev|client a', 'rev|client r', 'cogs|person b', 'fixed|tool s', 'tax|@mika']) await pg.check(`#cs-helper .cs-hrow[data-cs-hl="${id}"] [data-cs-ht]`);
  same(await text(pg, '#cs-helper [data-cs-hadd]'), 'Добавить 5 строк', 'five ticked: «Добавить 5 строк»');
  await pg.click('#cs-helper [data-cs-hadd]');
  S = await holds(pg, 'the helper\'s five rows', 'cash');
  const rowsNow = LISTS.flatMap((k) => S.P[k].map((r) => [k, r.name, r.amt, r.cur, r.bank, r.rec.day, r.rec.from, k === 'inflows' ? r.vat : r.ptax ? 'ptax' : ''].join(' ')));
  same(rowsNow, ['inflows Client A 8000 GBP Barclays 28 2026-10 true', 'inflows Client R 236000 RUB Tochka 15 2026-10 false', 'team Person B 6000 GBP Wise 20 2026-10 ', 'other Tool S 120 GBP Wise 3 2026-11 ', 'div HMRC Mika 500 GBP Wise 5 2026-11 ptax'], 'exactly what was ticked became rows «каждый месяц» — Client A with its VAT, the founder\'s own tax in «Дивиденды»');
  // … and the plan it leaves, on «Сегодня»: the figures of test 2.
  await goToday(pg);
  S = await holds(pg, 'the plan of test 2');
  shows(S, { verdict: 'v1', now: 32000, in: 11600, out: 6980, end: 36620, low: 28000, lowday: '2026-10-20', free: 17720, reserve: 5160, 'in.vat': 1600, 'out.team': 6000, 'out.other': 120, 'out.taxes': 360, 'out.div': 500, 'out.ptax': 500 }, 'test 2');
  same(await freeSays(pg), 'Сегодня можно вывести £17,700. Самый тесный день впереди — 20 окт: без вывода на счетах будет £28,000; £5,280 — налоги, £5,000 — запас, остальное можно вывести.', '«Можно вывести»: the sum rounded down to a hundred, the tight day, and what of that day\'s money is taxes and cushion');
  same([await freeRows(pg), S.fig('free.step.0'), S.fig('free.step.1'), await texts(pg, '#view-today .td-free button')], [['сегодня → £17,700', 'когда придёт Client A (ждём 28 окт) → £20,900', 'когда придёт Client A (ждём 28 ноя) → £24,200'], 20980, 24240, ['Вписать вывод']], '… and when more becomes possible, each step by whose payment has to arrive: 20,980 and 24,240 in the model, rounded down on the screen');
  same([await kpi(pg, 5), (await kpi(pg, 1))[2], (await kpi(pg, 2))[2]], [['Можно вывести', '£17,700', 'когда придёт Client A — £20,900'], 'по плану · 2 поступления · в т.ч. VAT £1.6k', 'команда £6k · прочее £120 · налоги £360 · дивиденды £500 (личные налоги £500)'], 'the sixth figure is «Можно вывести»; the hints say what comes — by the plan — and what goes: команда, прочее, налоги, дивиденды, never a founder');
  const B = S.M.month.blocks;
  same([B.rev.total, B.team.total, B.tax.total, B.other.total, B.div.total, B.result.total, S.M.month.accrued], [11600, 6000, 360, 0, 0, 5240, 1720], 'October by the plan: revenue 11,600, the team 6,000, the УСН payment 360, result 5,240 — of which 1,720 of taxes accrue for later');
  same([await band(pg, 0), await band(pg, 1), await band(pg, 2)], [['Доход за октябрь', '£11,600', 'получено £0 из £11,600 · в т.ч. VAT £1.6k'], ['Расход за октябрь', '£6,360', 'оплачено £0 из £6,360', 'команда £6k · платежи налогов £360 · дивиденды £0 · прочее £0'], ['Результат', '+£5,240', `по плану за месяц · обычно ${signed(B.result.usual)}`]],
    'the month is three bars and no more: income, spending with its four parts in one muted line, and the result beside a usual one');
  same(await pg.$$eval('#view-today .td-month .td-bar3', (l) => l.map((b) => [...b.children].map((i) => i.style.width))), [['0%', '100%'], ['0%', '54.83%']], '… the two bars share one scale — spending is 54.83% of income — solid for what has happened, an outline for what is ahead');
  ok(/Налоги здесь — только платежи; начисленное за октябрь, £1,720, — в блоке «Налоги»\.$/.test(await text(pg, '#view-today .td-month > .note')), 'its note says that taxes here are payments only, and where October\'s accrual of £1,720 is', await text(pg, '#view-today .td-month > .note'));
  same([await taxRow(pg, 'vat|2026Q4'), await taxRow(pg, 'usn|2026Q3'), await text(pg, '#view-today .td-tax h2 .note')], [['UK VAT за IV кв. 2026 · до 7 фев', 'начислено £0 · по плану ещё £4,800 · оплачено £0 · идёт', '£0'], ['УСН по Точке за III кв. 2026 · до 28 окт', 'начислено ₽42,480 (£360) · оплачено £0', '£360'], 'ближайший платёж: 28 окт, £360'],
    '«Налоги»: IV кв. will accrue 4,800 by the plan — three months of Client A, though thirty days hold one; the confirmed УСН is owed £360 by 28 Oct');
  await calm(pg, 'the plan of test 2');
  // A second run of the helper offers nothing: every one of them is in the plan already.
  await goCash(pg);
  await pg.click('#cs-plan [data-cs-helper]');
  same([await pg.$$eval('#cs-helper .cs-hrow', (l) => l.length), await text(pg, '#cs-have'), await text(pg, '#cs-helper .cs-secnote'), (await rowIds(pg)).length], [0, 'Уже в плане: Person B, Tool S, Client A, Client R, HMRC Mika.', 'Все, кому платят каждый месяц, уже стоят в плане.', 5], 'opened a second time the helper has nobody left to offer — «Уже в плане: …» — so nothing can be added twice');
  await pg.click('#cs-helper [data-cs-hx]');
  await finish(pg);
});

await run('p4 on screen', 'a written withdrawal, through the real controls (test 4): «Вписать вывод», a withdrawal typed, «Оплачено», one too large', async () => {
  const pg = await scene('withdrawal', ledP(), await plan2());
  let S = await holds(pg, 'the plan of test 2');
  // «Вписать вывод»: «Добавить» → «Дивиденды» → «Вывод», the sum the page named, today.
  await pg.click('#view-today .td-free [data-ed-add]');
  same([await texts(pg, K('add') + '[data-ed-kind]'), await pg.$eval(K('add') + '[data-ed-kind].active', (e) => e.textContent), await pg.$eval('#ed-amt', (e) => e.value), await pg.$eval('#ed-date', (e) => e.value), await texts(pg, K('add') + '[data-ed-what]')], [['Вывод', 'Личный налог'], 'Вывод', '17700', T, ['Поступление', 'Команда', 'Прочий расход', 'Налог студии', 'Дивиденды']],
    '«Вписать вывод» opens «Добавить» on «Дивиденды → Вывод» with £17,700 and today — and «Дивиденды» is of two kinds, neither of them a founder');
  await pg.click(K('add') + '[data-ed-save]');
  S = await holds(pg, 'the whole free sum written down as a withdrawal');
  same([S.P.div.filter((r) => !r.ptax).map((r) => [r.name, r.amt, r.date, r.blk, 'f' in r]), S.fig('free'), await freeSays(pg), await pg.$('#view-today .td-free h2 .note')], [[['Вывод', 17700, T, 'div', false]], 20, 'В плане уже выводы: £17,700 (6 окт). Сверх них — £0: 20 окт без новых выводов на счетах будет £10,300; £5,280 — налоги, £5,000 — запас.', null],
    'written, it is a row of «Дивиденды» for the studio, not for a founder; free(T) falls to £20, and the page says «Сверх них — £0»');
  await undo(pg);
  // Instead: «Дивиденды» 10,000 on 10 Oct.
  const wd = await addRow(pg, 'div', { name: 'Дивиденды', amt: 10000, date: '2026-10-10' });
  S = await holds(pg, 'a withdrawal of 10,000 on 10 Oct');
  shows(S, { out: 16980, low: 18000, lowday: '2026-10-20', free: 7720, 'out.div': 10500 }, 'test 4, «Дивиденды» 10,000 on 10 Oct');
  same([await freeSays(pg), await kpi(pg, 5), (await freeRows(pg))[0]], ['В плане уже выводы: £10,000 (10 окт). Сверх них сегодня можно вывести ещё £7,700. Самый тесный день впереди — 20 окт: без новых выводов на счетах будет £18,000; £5,280 — налоги, £5,000 — запас, остальное можно вывести.', ['Можно вывести', '£7,700', 'когда придёт Client A — £10,900 · сверх выводов в плане £10k'], 'сегодня → £7,700'], '«В плане уже выводы: £10,000 (10 окт). Сверх них сегодня можно вывести ещё £7,700.» — and the arithmetic of it: the tight day, what the accounts hold then, what of that is taxes and cushion');
  await tapRow(pg, wd, 'paid');
  S = await holds(pg, '«Оплачено» on the withdrawal');
  same([S.fig('now'), S.fig('marks'), S.fig('free'), (await kpi(pg, 0))[1], /в т\.ч\. отмечено вручную −£10,000/.test((await kpi(pg, 0))[2]), item(S.M, wd).state, S.M.cards.length], [22000, -10000, 7720, '£22,000', true, 'done', 0], '«Оплачено» on it: «сейчас» 22,000 — said in words, «в т.ч. отмечено вручную −£10,000», with no «≈» — and the free sum is what it was');
  await tapRow(pg, wd, 'unpaid');
  // 20,000 is more than the plan can give.
  await editRow(pg, wd, { amt: 20000 });
  S = await holds(pg, 'the withdrawal made 20,000');
  shows(S, { verdict: 'v1', low: 8000, free: 0, lowres: 5280 }, 'test 4, a withdrawal of 20,000');
  same([await freeSays(pg), await freeRows(pg), await text(pg, '#view-today .td-verdict .note'), await pg.$('#view-today .td-free [data-ed-add]')], ['В плане уже выводы: £20,000 (10 окт). Сверх них — £0: 20 окт без новых выводов на счетах будет £8,000; £5,280 — налоги, £5,000 — запас.', ['когда придёт Client A (ждём 28 окт) → до £900', 'когда придёт Client A (ждём 28 ноя) → до £4,200'], 'В нижней точке £5,280 — деньги под налоги.', null],
    '… «Сверх них — £0», the steps read «до £900» and «до £4,200», the sentence adds «В нижней точке £5,280 — деньги под налоги», and no «Вписать вывод» is offered');
  // A founder's own tax is a row he types: «Дивиденды → Личный налог».
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="div"]');
  await pg.click(K('add') + '[data-ed-kind="ptax"]');
  await fill(pg, 'add', { name: 'HMRC Vanya', amt: 400, date: '2026-10-21' });
  await pg.click(K('add') + '[data-ed-save]');
  S = await holds(pg, 'a personal tax typed');
  const pt = S.P.div.find((r) => r.name === 'HMRC Vanya');
  same([pt.ptax, pt.f, pt.blk, S.fig('out.ptax'), S.fig('out.taxes'), item(S.M, pt.id).grp], [true, 'vanya', 'div', 900, 360, 'div'], '«Личный налог» HMRC Vanya £400: a row of «Дивиденды» with ptax — «личные налоги» +400, the studio\'s taxes untouched');
  await goCash(pg);
  same([await text(pg, '#cs-sec-div h2'), await text(pg, '#cs-sec-div th:nth-child(2)')], ['Дивиденды£20,400 · в т.ч. личные налоги £400', 'Что'], 'in the constructor «Дивиденды» is one list — withdrawals and personal taxes — and its total says what part of it is tax');
  await holds(pg, '«Касса» with a withdrawal and a personal tax', 'cash');
  await finish(pg);
});

await run('p5 on screen', '«каждый месяц» through the real controls (test 5): this month only, this month and onward, the end of a repeat, a month switched off, a month that already has a row', async () => {
  const pg = await scene('recurrence', ledP(), await plan2(), { H: 60 });
  let S = await holds(pg, 'the plan of test 2, 60 days');
  shows(S, { out: 18400 }, 'test 5, the base');
  const save = (how) => pg.click(K('row') + `[data-ed-save="${how}"]`);
  // «Только октябрь»
  await openRow(pg, 'rB@2026-10');
  await fill(pg, 'row', { amt: 6500 });
  await save('only');
  S = await holds(pg, '«Только октябрь»');
  same([S.P.team[0].amt, S.P.team[0].rec.x, S.fig('out'), S.P.team.length, await toastText(pg)], [6000, { '2026-10': { amt: 6500 } }, 18900, 1, 'Сохранено: Person B — только октябрь'], '«Только октябрь», 6,500: that month\'s exception, the row as it was, OUT 18,900');
  await undo(pg);
  // «Октябрь и дальше» on the row's first month: the row itself.
  await openRow(pg, 'rB@2026-10');
  await fill(pg, 'row', { amt: 6500 });
  await save('onward');
  S = await holds(pg, '«Октябрь и дальше»');
  same([S.P.team[0].amt, S.P.team[0].rec, S.fig('out'), S.P.team.length, await toastText(pg)], [6500, { day: 20, from: '2026-10' }, 19400, 1, 'Сохранено: Person B — с октября'], '«Октябрь и дальше»: October is its first month, so the row itself is 6,500 — no split — OUT 19,400');
  await undo(pg);
  // «Ноябрь и дальше»: a split.
  await openRow(pg, 'rB@2026-11');
  same(await texts(pg, K('row') + '[data-ed-save]'), ['Только ноябрь', 'Ноябрь и дальше'], 'the card of November\'s month saves two ways: «Только ноябрь» and «Ноябрь и дальше»');
  await fill(pg, 'row', { amt: 7000 });
  await save('onward');
  S = await holds(pg, '«Ноябрь и дальше»');
  const [a, b] = S.P.team;
  same([S.P.team.length, a.id, a.amt, a.rec.to, b.amt, b.rec.from, b.rec.chain, S.fig('out'), item(S.M, 'rB@2026-10').amt, S.M.helper.have.includes('Person B'), S.M.helper.lines.length], [2, 'rB', 6000, '2026-10', 7000, '2026-11', 'rB', 19400, 6000, true, 0],
    '«Ноябрь и дальше», 7,000: two rows of one chain — the old one ends with October, the new one takes over from November — OUT 19,400, October\'s line untouched, and the helper still knows Person B is in the plan');
  await undo(pg);
  // The tick taken off October ends the repeat after it.
  await openRow(pg, 'rB@2026-10');
  await fill(pg, 'row', { monthly: false });
  await save('only');
  S = await holds(pg, '«каждый месяц» unticked on October');
  same([S.P.team[0].rec, S.fig('out')], [{ day: 20, from: '2026-10', to: '2026-10' }, 12400], '«каждый месяц» unticked on October\'s month: the repeat ends after October, OUT 12,400');
  await undo(pg);
  // «Не платим» on November: this month only.
  await tapRow(pg, 'rB@2026-11', 'skip');
  await pg.click(K('row') + '[data-ed-go="skip-only"]');
  S = await holds(pg, 'November switched off');
  same([S.P.team[0].rec.x, S.fig('out'), item(S.M, 'rB@2026-12').state], [{ '2026-11': { off: true } }, 12400, 'due'], '«Не платим → только ноябрь»: that month is off, OUT 12,400, December stays');
  await undo(pg);
  // … and «ноябрь и дальше»: the repeat ends before it.
  await tapRow(pg, 'rB@2026-11', 'skip');
  await pg.click(K('row') + '[data-ed-go="skip-onward"]');
  S = await holds(pg, 'November and on switched off');
  same([S.P.team[0].rec.to, S.fig('out')], ['2026-10', 12400], '«Не платим → ноябрь и дальше»: the repeat ends with October');
  await undo(pg);
  // A month that already holds the founder's own row: the repeat is switched off there, and says so.
  const h1 = await addRow(pg, 'team', { name: 'Person H', amt: 6300, date: '2026-11-20' });
  const h0 = await addRow(pg, 'team', { name: 'Person H', amt: 6000, date: '2026-10-20', monthly: true });
  S = await holds(pg, 'Person H: a one-off row in November, then a row that repeats from October');
  const nov = (M) => sum(M.items.filter((it) => it.name === 'Person H' && it.ym === '2026-11').map((it) => -it.cash));
  same([stored(S, h0).rec, nov(S.M), await toastText(pg), item(S.M, h0 + '@2026-11').state, !!stored(S, h1)], [{ day: 20, from: '2026-10', x: { '2026-11': { off: true } } }, 6300, 'В плане: Person H · в ноябре стоит ваша строка £6,300 — повтор там выключен', 'off', true],
    'ticked «каждый месяц» on a row whose November already holds a row of the same name: the repeat is off for that month — «в ноябре стоит ваша строка £6,300 — повтор там выключен» — and November counts 6,300 once');
  await goCash(pg);
  await toMonth(pg, '2026-11');
  await pg.check(box('team', h0 + '@2026-11', 'on'));
  S = await holds(pg, 'the repeat switched back on in November', 'cash');
  same([nov(S.M), stored(S, h0).rec.x], [12300, undefined], '[the tick back on] → November counts both: 12,300');
  await finish(pg);
});

await run('repeat', '«каждый месяц» is a plain control on every kind of row, in every place a row stands — and a tax worked out by a rule has none', async () => {
  // One row of each list, none repeating, and the computed УСН of the plan of test 2.
  const base = await plan2();
  const P = { ...base, inflows: base.inflows.concat([row('i1', 'Client N', 500, '2026-10-12', { vat: false })]), team: base.team.concat([row('t1', 'Person N', 300, '2026-10-12')]), taxes: [row('x1', 'Corporation tax', 700, '2026-10-12', { blk: 'tax', of: false, bank: 'Barclays' })], other: base.other.concat([row('o1', 'Thing N', 40, '2026-10-12')]), div: base.div.concat([row('d1', 'Вывод', 900, '2026-10-12', { blk: 'div' })]) };
  const ONES = [['inflows', 'i1'], ['team', 't1'], ['taxes', 'x1'], ['other', 'o1'], ['div', 'd1']];
  const TAX = 't|usn|2026Q3';
  const pg = await scene('repeat', ledP(), P, { H: 60 });
  let S = await holds(pg, 'one row of each list');
  // The editor, opened from «Сегодня».
  const inCard = [];
  for (const [, id] of ONES) { await openRow(pg, id); inCard.push(await pg.$eval(K('row') + '[data-ed-f="monthly"]', (e) => [e.type, e.checked, e.closest('label').textContent.replace(/ /g, ' ').trim()].join(' '))); await pg.click(K('row') + '[data-ed-x]'); }
  same(inCard, ONES.map(() => 'checkbox false каждый месяц 12-го числа, с октября'), 'the row\'s card, from «Сегодня»: a tick «каждый месяц» on a row of every list, with the day and the month it would repeat from');
  await openRow(pg, TAX);
  same(await pg.$(K('row') + '[data-ed-f="monthly"]'), null, '… and none on a tax the page worked out');
  await pg.click(K('row') + '[data-ed-x]');
  // «Добавить».
  await pg.click('#view-today .page-head [data-ed-add]');
  const inAdd = [];
  for (const k of ['inflows', 'team', 'other', 'taxes', 'div']) { await pg.click(K('add') + `[data-ed-what="${k}"]`); inAdd.push(await pg.$eval(K('add') + '[data-ed-f="monthly"]', (e) => e.closest('label').textContent.replace(/ /g, ' ').trim())); }
  same(inAdd, ['каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата'], '«Добавить»: the same tick whatever is being added — and it says a date is needed while there is none');
  await pg.fill(K('add') + '#ed-date', '2026-10-25');
  same(await text(pg, K('add') + '[data-ed-n="monthly"]'), '25-го числа, с октября', '… with a date typed it says «25-го числа, с октября»');
  await pg.click(K('add') + '[data-ed-what="team"]');
  await pg.fill(K('add') + '#ed-name', 'Person B');
  same(await text(pg, K('add') + '[data-ed-n="also"]'), 'В октябре у Person B уже стоит строка «каждый месяц» £6,000 — эта добавится к ней.', 'a one-off row typed for somebody who already has a row «каждый месяц» in that month is told it will ADD to it — nothing is taken out of the other');
  await pg.click(K('add') + '[data-ed-x]');
  // «Касса · План»: a column of its own.
  await goCash(pg);
  const col = await pg.evaluate((ones) => ones.map(([k, id]) => { const tr = document.querySelector(`#cs-sec-${k} tr[data-cs-id="${id}"]`); const e = tr.querySelector('[data-cs-f="rec"]'); return [!!e && e.type, e && e.checked, e && e.closest('td').className, document.querySelector(`#cs-sec-${k} th.cs-rc`).textContent].join(' '); }), ONES);
  same(col, ONES.map(() => 'checkbox false cs-rc каждый месяц'), '«Касса · План»: a column «каждый месяц» in every list, a plain tick in every row');
  same([await pg.$(`#cs-sec-taxes tr[data-cs-id="${TAX}"] [data-cs-f="rec"]`), await pg.$eval(`#cs-sec-team tr[data-cs-id="rB@2026-10"] [data-cs-f="rec"]`, (e) => e.checked), await csRow(pg, 'team', 'rB@2026-10')], [null, true, 'typed | none | on | Person B | 6000 | GBP | 2026-10-20 | Wise |  | ✓ оплаченочастично'],
    '… ticked on a row that repeats, absent on the computed tax; and beside «✓ оплачено» every row has the third answer, «частично»');
  // Ticked where the row stands: it repeats from its own month, and the line under it says so.
  await pg.click(box('other', 'o1', 'rec'));
  S = await holds(pg, 'the tick in a row of the month', 'cash');
  same([stored(S, 'o1').rec, await text(pg, '#cs-sec-other tr.cs-line'), await listed(pg, 'other')], [{ day: 12, from: '2026-10' }, 'Повторяется каждый месяц, 12-го числа.', ['o1@2026-10']], 'ticked on «Thing N»: the row repeats on the 12th from October, and the line under it says so');
  await pg.click(box('other', 'o1@2026-10', 'rec'));
  S = await holds(pg, 'the tick taken off', 'cash');
  same([stored(S, 'o1').rec, await text(pg, '#cs-sec-other tr.cs-line')], [{ day: 12, from: '2026-10', to: '2026-10' }, 'Вернуть повтор'], 'taken off: the row says «повтор закончится после октября», and the line under it offers [Вернуть повтор]');
  await pg.click('#cs-sec-other tr.cs-line [data-cs-resume]');
  S = await holds(pg, '[Вернуть]', 'cash');
  same(stored(S, 'o1').rec, { day: 12, from: '2026-10' }, '[Вернуть]: the repeat goes on');
  // A sum typed into a month of a row that repeats is that month's alone — and «И дальше так же» makes it the row's.
  await pg.fill(box('team', 'rB@2026-10', 'amt'), '6100');
  await leave(pg);
  S = await holds(pg, 'a month\'s sum typed in the constructor', 'cash');
  same([S.P.team[0].amt, S.P.team[0].rec.x, await text(pg, '#cs-sec-team tr.cs-line')], [6000, { '2026-10': { amt: 6100 } }, 'Изменено только в октябре. И дальше так же'], '6,100 typed into October\'s Person B: October alone — «Изменено только в октябре. [И дальше так же]»');
  await pg.click('#cs-sec-team tr.cs-line [data-cs-onward]');
  S = await holds(pg, '[И дальше так же]', 'cash');
  same([S.P.team[0].amt, S.P.team[0].rec, await pg.$('#cs-sec-team tr.cs-line')], [6100, { day: 20, from: '2026-10' }, null], '[И дальше так же]: the row is 6,100 from October on, and the line is gone');
  // «Касса · По дням»: the same tick at the right edge of every written line.
  await pg.click('#view-cash [data-cs-view="days"]');
  await openDay(pg, '2026-10-12');
  const inDay = await pg.$$eval('#cs-stmt tr[data-cs-row="2026-10-12"] + tr.cs-items li[data-cs-li]', (l) => l.map((li) => { const e = li.querySelector('[data-cs-lrec]'); return [li.dataset.csLi, e ? (e.checked ? 'ticked' : 'unticked') : 'none', e ? e.closest('label').textContent.trim() : ''].join(' '); }).sort());
  same(inDay, ['d1 unticked каждый месяц', 'i1 unticked каждый месяц', 'o1@2026-10 ticked каждый месяц', 't1 unticked каждый месяц', 'x1 unticked каждый месяц'], '«Касса · По дням», 12 Oct: every written line carries the tick — the one that repeats, ticked');
  await openDay(pg, '2026-10-28');
  same(await pg.$eval(`#cs-stmt li[data-cs-li="${TAX}"]`, (li) => [!!li.querySelector('[data-cs-lrec]'), li.className]), [false, 'cs-hist'], '… and the tax worked out by a rule, in muted ink, has none');
  await pg.click('#cs-stmt [data-cs-lrec="d1"]');
  S = await holds(pg, 'a withdrawal ticked in the day list', 'cash');
  same(stored(S, 'd1').rec, { day: 12, from: '2026-10' }, 'ticked there on the withdrawal: it repeats on the 12th — a dividend every month is a row like any other');
  await calm(pg, '«Касса · По дням» with its ticks', 'cash');
  await finish(pg);
});

await run('p9 on screen', 'a typed tax row says what it is, through the real controls (test 9); a payment the page cannot place; a quarter before the start paid in parts', async () => {
  const pg = await scene('typed tax', ledP(), await plan2(), { H: 60 });
  let S = await holds(pg, 'the plan of test 2, 60 days');
  const K3 = 'vat|2026Q3';
  const ofSel = () => pg.$eval(K('add') + '[data-ed-f="of"]', (s) => [s.value, s.selectedOptions[0].textContent]);
  const add = async (f, of) => { await pg.click('#view-today .page-head [data-ed-add]'); await pg.click(K('add') + '[data-ed-what="taxes"]'); await fill(pg, 'add', f); const was = await ofSel(); if (of !== undefined) await pg.selectOption(K('add') + '[data-ed-f="of"]', of); await pg.click(K('add') + '[data-ed-save]'); return was; };
  // «VAT Q3» 4,500 on 7 Nov: the name says which bill it is.
  let was = await add({ name: 'VAT Q3', amt: 4500, date: '2026-11-07', bank: 'Barclays' });
  S = await holds(pg, '«VAT Q3» saved as the whole bill');
  same([was, S.P.taxes[0].of, S.fig('out'), item(S.M, 't|' + K3), per(S.M, K3).state, await taxRow(pg, K3)], [['w|' + K3, 'Весь UK VAT за III кв. 2026 — вместо расчётных £4,800'], { r: 'vat', p: '2026Q3' }, 18100, null, 'typed', ['UK VAT за III кв. 2026 · до 7 ноя', 'начислено £4,800 · оплачено £0 · вместо расчёта — строка «VAT Q3»', '£4,500']],
    '«VAT Q3» 4,500: the select stands on «Весь UK VAT за III кв. 2026 — вместо расчётных £4,800» by its name; saved, OUT is 18,100 — one bill for the period, the founder\'s — and the block says so');
  await undo(pg);
  was = await add({ name: 'VAT Q3', amt: 4500, date: '2026-11-07', bank: 'Barclays' }, 'own');
  S = await holds(pg, '«VAT Q3» saved as a bill of its own');
  same([S.P.taxes[0].of, S.fig('out')], [false, 22900], 'saved as «Отдельный налог или платёж» instead: it adds — OUT 22,900');
  await undo(pg);
  was = await add({ name: 'VAT Q3 часть', amt: 1200, date: '2026-10-20', bank: 'Barclays' });
  S = await holds(pg, 'a part of the VAT');
  same([was[0], was[1], S.P.taxes[0].of, S.fig('out'), item(S.M, 't|' + K3).cash, (await taxRow(pg, K3))[1]], ['p|' + K3, 'Часть UK VAT за III кв. 2026', { r: 'vat', p: '2026Q3', part: true }, 18400, -3600, 'начислено £4,800 · оплачено £0 · частями: £0 из £4,800'],
    '«VAT Q3 часть» 1,200 on 20 Oct: pre-set to «Часть…» — under 0.7 of the bill — OUT 18,400: the part and a computed 3,600');
  await undo(pg);
  // «Corporation tax» falls a week before the VAT date at about its size: the page does not guess.
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="taxes"]');
  await fill(pg, 'add', { name: 'Corporation tax', amt: 5500, date: '2026-11-01', bank: 'Barclays' });
  same(await ofSel(), ['', 'Выберите, к чему относится'], '«Corporation tax» 5,500 on 1 Nov: no word of a rule in its name, near the VAT date at about its size — the select stands on «Выберите, к чему относится»');
  await pg.click(K('add') + '[data-ed-save]');
  same([(await rowIds(pg)).length, await toastText(pg), !!(await pg.$(K('add')))], [5, 'Выберите, к чему относится этот налог', true], '… and the row is not saved without a choice');
  await pg.selectOption(K('add') + '[data-ed-f="of"]', 'own');
  await pg.click(K('add') + '[data-ed-save]');
  S = await holds(pg, '«Corporation tax» as a bill of its own');
  same([S.P.taxes[0].of, S.fig('out'), item(S.M, 't|' + K3).cash, card(S.M, 13)], [false, 23900, -4800, []], '«Отдельный…»: OUT 23,900, the computed VAT untouched, nothing to ask');
  // … and in the row's own card the same select says, and changes, what the row is.
  const ct = S.P.taxes[0].id;
  await openRow(pg, ct);
  same(await pg.$eval(K('row') + '[data-ed-f="of"]', (s) => [s.value, [...s.options].map((o) => o.value)]), ['own', ['own', 'w|usn|2026Q3', 'p|usn|2026Q3', 'w|vat|2026Q3', 'p|vat|2026Q3', 'w|usn|2026Q4', 'p|usn|2026Q4', 'w|vat|2026Q4', 'p|vat|2026Q4']], 'the row\'s card has «К чему относится» too: a bill of its own, or the whole or a part of any open period, nearest due date first');
  await pg.selectOption(K('row') + '[data-ed-f="of"]', 'w|' + K3);
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, '«this row is that period\'s tax»');
  same([stored(S, ct).of, S.fig('out'), per(S.M, K3).row], [{ r: 'vat', p: '2026Q3' }, 19100, ct], 'changed to «Весь UK VAT за III кв. 2026»: the row IS that period\'s tax — the computed 4,800 steps aside, OUT 19,100, counted once');
  await finish(pg);

  // A payment to the tax authority the page cannot place (card 12), and «Оплачено» that first shows it (T9).
  const AT = ms('2027-01-24T08:00:00Z');
  const L20 = ledP({ tx: [filed('a1', '2026-10-28', 9600, 'rev', 'Client A', { b: 'Barclays', v: 1600, at: ms('2026-11-10T08:00:00Z') }), filed('h1', '2027-01-20', -4128, 'tax', 'HMRC', { b: 'Barclays', at: AT })] });
  const jan = await scene('card 12', L20, await plan2(), { H: 60, at: '2027-01-25T12:00:00Z' });
  S = await holds(jan, '25 Jan, a payment of −4,128 to HMRC on 20 Jan');
  const c12 = '#view-today .td-need .op[data-td-card="12"]';
  await jan.click('#view-today [data-td-flip="more"]').catch(() => {});
  same([await text(jan, c12 + ' .op-name'), await text(jan, c12 + ' .op-text'), await texts(jan, c12 + ' button')], ['HMRC · £4,128 · 20 янв', 'За какой период этот платёж?', ['III кв. 2026', 'IV кв. 2026', 'Другой налог']], 'card 12: «HMRC · £4,128 · 20 янв — За какой период этот платёж?» with a button for each open quarter');
  const c11 = '#view-today .td-need .op[data-td-card="11"]';
  ok((await texts(jan, c11 + ' .op-name')).includes('UK VAT за III кв. 2026 · £4,800'), 'card 11 says the bill of III кв. is late — £4,800, no «≈»', await texts(jan, c11 + ' .op-name'));
  // «Оплачено» on the late bill: the payment found, first.
  const vatCard = (await jan.$$(c11)).length;
  await jan.click(`${c11}:has-text("UK VAT за III кв. 2026") [data-ed-do="paid"]`);
  same([await text(jan, K('row') + '.ed-ask > span'), await texts(jan, K('row') + '.ed-pay > span:first-child'), await texts(jan, K('row') + '.ed-ask button'), S.P.tax.per[K3]], ['Какой из платежей — этот налог?', ['HMRC · £4,128 · 20 янв'], ['Это он — весь', 'Это часть', 'В выписках нет — оплачено сегодня', 'Отмена'], undefined],
    '«Оплачено» on it does not mark at once: it first shows the payment that may be it — [Это он — весь] [Это часть] — with «В выписках нет — оплачено сегодня» as the last line');
  await jan.click(K('row') + '[data-ed-payrow][data-ed-whole]');
  S = await holds(jan, '[Это он — весь]');
  same([S.P.tax.per[K3].tx, S.P.tax.per[K3].closed, 'paid' in S.P.tax.per[K3], per(S.M, K3).state, per(S.M, K3).paid, card(S.M, 12).length, vatCard > 0], [['h1'], true, false, 'paid', 4128, 0, true], '[Это он — весь]: the payment is that quarter\'s, the quarter is closed at 4,128, no mark is written, and card 12 is gone');
  await undo(jan);
  await jan.click('#view-today [data-td-flip="more"]').catch(() => {});
  await jan.click(c12 + ' [data-ed-tax="nopay"]');
  S = await holds(jan, '[Другой налог]');
  same([S.P.tax.per[K3].notx, S.P.tax.per['vat|2026Q4'].notx, card(S.M, 12).length, per(S.M, K3).left], [['h1'], ['h1'], 0, 4800], '[Другой налог] on card 12: the payment is neither quarter\'s, the card does not return, 4,800 is still owed');
  await calm(jan, 'the tax cards');
  await finish(jan);

  // Test 16 on the screen: the quarter before the start, half paid in two parts.
  const d1 = await scene('test 16', ledP({ hmrc: [['2026-08-07', 1150], ['2026-09-07', 1150]] }), planP());
  S = await holds(d1, 'day one, II кв. half paid');
  const c14 = '#view-today .td-need .op[data-td-card="14"]';
  same([await text(d1, c14 + ' .op-name'), await text(d1, c14 + ' .op-text'), await texts(d1, c14 + ' button'), S.fig('reserve'), await taxRow(d1, 'vat|2026Q2')], ['UK VAT за II кв. 2026: начислено £4,800, платежей найдено на £2,300 (2)', 'Срок был 7 авг — до того, как страница начала считать. Остаток £2,500 ещё платите?', ['Да, частями как раньше', 'Да, одной суммой', 'Нет, закрыто'], 7300, ['UK VAT за II кв. 2026 · срок был 7 авг', 'начислено £4,800 · оплачено £2,300 · срок был до начала расчёта — ответьте, платите ли остаток', '£2,500']],
    'card 14: «UK VAT за II кв. 2026: начислено £4,800, платежей найдено на £2,300 (2)… Остаток £2,500 ещё платите?» — and until answered the 2,500 is in «под налоги» (7,300) and in the block');
  await d1.click(c14 + ' [data-ed-tax="parts"]');
  S = await holds(d1, '[Да, частями как раньше]');
  const pr = S.P.taxes[0];
  same([pr.name, pr.amt, pr.of, pr.rec, S.M.items.filter((it) => it.row === pr.id).map((it) => [it.date, it.cash].join(' ')), S.fig('reserve'), card(S.M, 14).length, S.M.verdict.id], ['UK VAT за II кв. 2026 — часть', 1150, { r: 'vat', p: '2026Q2', part: true }, { day: 7, from: '2026-10', to: '2026-11', x: { '2026-11': { amt: 1350 } } }, ['2026-10-07 -1150', '2026-11-07 -1350'], 7300, 0, 'vT'],
    '[Да, частями как раньше]: a row «UK VAT за II кв. 2026 — часть» of 1,150 on the 7th, every month to November, the last one 1,350 — the founder\'s row from now on');
  await finish(d1);
});

await run('tax settings', '«Настройки → Налоги»: a client\'s mark moves the accrual, a founder\'s own rule appears in the block, a rule switched off leaves it; «Прогноз»: how old the balances may be', async () => {
  const pg = await scene('settings', ledP(), await plan2(), { H: 60 });
  let S = await holds(pg, 'the plan of test 2');
  const A0 = S.M;
  await pg.click('.nav [data-tab="settings"]');
  await pg.waitForSelector('#ed-taxes .ed-rule');
  const model = () => pg.evaluate(() => [window.__money.model({ H: 60 }), JSON.parse(JSON.stringify(window.__cash.state()))]);
  same(await pg.$$eval('#ed-taxes .ed-rule', (l) => l.map((r) => [r.dataset.edRule, r.querySelector('.ed-rh b').textContent + ' · ' + r.querySelector('.ed-rh .note').textContent, [...r.querySelectorAll('[data-ed-rv]')].map((e) => e.dataset.edRv + '=' + (e.type === 'checkbox' ? e.checked : e.value)).join(' '), r.querySelector('[data-ed-first]').textContent, !!r.querySelector('[data-ed-rdel]')].join(' | '))),
    ['vat | UK VAT · встроенное правило | name=UK VAT base=ontop rate=20 per=q day=7 off=2 pay= on=true away=false | III кв. 2026 | false', 'usn | УСН по Точке · встроенное правило | name=УСН по Точке base=share acct=Tochka|RUB rate=6 per=q day=28 off=1 pay= on=true away=false | III кв. 2026 | false'],
    'the two built-in rules, each a card: what it is charged on, the rate, the period, the due day, where it is paid from, whether it counts, from which period — editable, not deletable');
  same(await pg.$$eval('#ed-taxes .ed-cl', (l) => l.map((c) => [c.querySelector('b').textContent, c.querySelector('.note').textContent.replace(/ /g, ' ').trim(), [...c.querySelectorAll('[data-ed-cl]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' / ')].join(' | '))),
    ['Client A | · последнее поступление 28 сен · предложено | UK, с VAT* / международный, без VAT', 'Client R | · последнее поступление 15 сен · предложено | UK, с VAT / международный, без VAT*'], 'the clients, each with its mark — proposed from the table until a founder sets it: Client A carries VAT, Client R does not (a client last seen fifteen months ago is not listed)');
  // A client's mark, switched: it changes his open written invoices, and the accrual with them — never the facts.
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="no"]');
  let [M, P] = await model();
  same([await toastText(pg), P.tax.cl, P.inflows[0].vat, item(M, 'rA@2026-10').cash, A0.IN - M.IN, per(M, 'vat|2026Q4').accP, per(M, 'vat|2026Q3').accF, per(A0, 'vat|2026Q4').accP, await pg.$eval('#ed-taxes .ed-cl[data-ed-client="client a"]', (c) => [c.querySelector('.note').textContent.includes('предложено'), !!c.querySelector('[data-ed-cl="auto"]')])],
    ['В плане изменено строк: 1', { 'client a': 'no' }, false, 8000, 3200, 0, 4800, 4800, [false, true]], 'Client A switched to «международный, без VAT»: «В плане изменено строк: 1» — his row comes at 8,000, the plan\'s accrual of IV кв. falls from 4,800 to nothing, and what III кв. accrued from the facts stays 4,800');
  ok(/6 поступлений в таблице расходятся с отметкой клиента\. В уже полученных деньгах VAT — тот, что стоит в строке таблицы; поправить его можно там\.$/.test(await text(pg, '#ed-taxes')), '… and the foot says how many receipts of the table disagree with the mark, and that their VAT is the table\'s own', (await text(pg, '#ed-taxes')).slice(-200));
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="auto"]');
  [M, P] = await model();
  same([P.tax.cl, P.inflows[0].vat, await toastText(pg)], [{}, false, 'Client A: отметка снята — как в таблице'], '[Как в таблице] takes the founder\'s mark off; the row keeps what it was saved with');
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="vat"]');
  [M, P] = await model();
  same([P.inflows[0].vat, per(M, 'vat|2026Q4').accP, M.IN], [true, 4800, A0.IN], 'switched back to «UK, с VAT»: the row carries VAT again, and the accrual is back');
  // A founder's own rule.
  await pg.click('#ed-taxes [data-ed-radd]');
  [M, P] = await model();
  const mine = P.tax.rules[2];
  same([P.tax.rules.length, mine.name, mine.base, mine.per, mine.on, mine.from, !!mine.builtin, await pg.$eval(`#ed-taxes .ed-rule[data-ed-rule="${mine.id}"]`, (r) => [!!r.querySelector('[data-ed-rdel]'), r.textContent.includes('для тех же клиентов, что и VAT')])], [3, 'Новый налог', 'ontop', 'q', true, T, false, [true, true]], '«Добавить налог»: a third rule — a quarter, from today — that can be deleted, and says it is charged on the same clients as VAT');
  const rv = (k) => `#ed-taxes .ed-rule[data-ed-rule="${mine.id}"] [data-ed-rv="${k}"]`;
  await pg.fill(rv('name'), 'Сбор');
  await pg.press(rv('name'), 'Enter');
  await pg.selectOption(rv('base'), 'share');
  await pg.selectOption(rv('acct'), 'Barclays|GBP');
  await pg.fill(rv('rate'), '1');
  await pg.press(rv('rate'), 'Enter');
  await pg.selectOption(rv('per'), 'm');
  [M, P] = await model();
  same([P.tax.rules[2].name, P.tax.rules[2].base, P.tax.rules[2].acct, P.tax.rules[2].rate, P.tax.rules[2].per, per(M, mine.id + '|2026-10').accP, item(M, 't|' + mine.id + '|2026-10').cash, item(M, 't|' + mine.id + '|2026-10').date], ['Сбор', 'share', 'Barclays|GBP', 1, 'm', 96, -96, '2026-11-07'],
    'made «Сбор», 1% of what arrives on Barclays GBP, monthly: October will accrue £96 by the plan (Client A\'s 9,600), due 7 Nov');
  await goToday(pg);
  S = await holds(pg, 'with a founder\'s own rule');
  same([await taxRow(pg, mine.id + '|2026-10'), /Сбор — 1% от поступлений на Barclays GBP/.test(await text(pg, '#view-today .td-tax')), S.fig('out.taxes') - A0.outParts.taxes], [['Сбор за октябрь 2026 · до 7 ноя', 'начислено £0 · по плану ещё £96 · оплачено £0 · идёт', '£0'], true, 96 + 96], 'on «Сегодня» the rule is in the block «Налоги» — «Сбор за октябрь 2026 · до 7 ноя», £96 still to accrue — and its payments are in «Уйдёт»');
  await pg.click('.nav [data-tab="settings"]');
  await pg.uncheck(rv('on'));
  [M, P] = await model();
  same([P.tax.rules[2].on, M.items.filter((it) => it.tax && it.tax.rule === mine.id).length, M.taxes.periods.filter((p) => p.rule === mine.id).length], [false, 0, 0], '«Считать» off: the rule has no line and no period');
  await pg.click(`#ed-taxes .ed-rule[data-ed-rule="${mine.id}"] [data-ed-rdel]`);
  await pg.click(`#ed-taxes .ed-rule[data-ed-rule="${mine.id}"] [data-ed-rdel]`);
  [M, P] = await model();
  same([P.tax.rules.map((r) => r.id), M.OUT], [['vat', 'usn'], A0.OUT], '«Удалить», asked twice: gone, and «Уйдёт» is what it was');
  // «Считать с периода»: one period earlier, and back.
  await pg.click('#ed-taxes .ed-rule[data-ed-rule="vat"] [data-ed-rfrom="-1"]');
  [M, P] = await model();
  same([P.tax.rules[0].from, M.taxes.rules[0].first, await text(pg, '#ed-taxes .ed-rule[data-ed-rule="vat"] [data-ed-first]')], ['2026-08-07', '2026Q2', 'II кв. 2026'], '«‹ раньше» on UK VAT: it answers from II кв. 2026 — its start is that quarter\'s due date');
  await pg.click('#ed-taxes .ed-rule[data-ed-rule="vat"] [data-ed-rfrom="1"]');
  [M, P] = await model();
  same(M.taxes.rules[0].first, '2026Q3', '«позже ›»: back to III кв. 2026');
  // «Прогноз»: how old the balances may be.
  same(await pg.$$eval('#ed-forecast [data-ed-set]', (l) => l.map((e) => e.dataset.edSet + '=' + (e.type === 'checkbox' ? e.checked : e.value))), ['cushion=5000', 'fresh=true', 'freshDays=8'], '«Прогноз»: the cushion, and «Не называть сумму вывода, если остатки старше 8 дней» — on');
  await finish(pg);

  // Nine days after the balances: no sum is named — until the founders say it may be.
  const old = await scene('old balances', ledP(), await plan2(), { at: '2026-10-14T12:00:00+01:00' });
  S = await holds(old, 'balances nine days old');
  same([S.M.free.why, await freeSays(old), await kpi(old, 5), await texts(old, '#view-today .td-free button')], ['stale', 'Остатки от 5 окт — впишите свежие: по старым сумму не назову.', ['Можно вывести', '—', 'остатки от 5 окт'], ['Вписать остатки']], '14 Oct, balances typed for 5 Oct: «Остатки от 5 окт — впишите свежие: по старым сумму не назову.»');
  await old.click('.nav [data-tab="settings"]');
  await old.uncheck('#ed-forecast [data-ed-set="fresh"]');
  await goToday(old);
  S = await holds(old, 'the setting switched off');
  same([S.P.fresh, S.M.free.why, (await freeSays(old)).startsWith(`По остаткам на 5 окт можно вывести ${money0(Math.floor(S.M.free.now / 100) * 100)} — минус всё, что взяли после 5 окт.`), (await kpi(old, 5))[0]], [{ on: false, days: 8 }, '', true, 'Можно вывести · на 5 окт'], 'switched off in «Настройки → Прогноз»: the sum is named, with the day of the balances it rests on — «По остаткам на 5 окт можно вывести … — минус всё, что взяли после 5 окт»');
  await old.click('.nav [data-tab="settings"]');
  await old.check('#ed-forecast [data-ed-set="fresh"]');
  await old.fill('#ed-forecast [data-ed-set="freshDays"]', '12');
  await old.press('#ed-forecast [data-ed-set="freshDays"]', 'Enter');
  await goToday(old);
  S = await holds(old, 'twelve days allowed');
  same([S.P.fresh, S.M.free.why, S.M.fresh], [{ on: true, days: 12 }, '', { on: true, days: 12 }], '… or the number of days is made 12: nine-day-old balances are fresh enough again');
  await finish(old);

  // A thin plan: the sentence and the card name the same slice, and what an ordinary month costs.
  let thin = planP();
  thin = await usnYes(thin);
  thin = await wr(thin, 'shut', card(await C(ledP(), thin), 14)[0], TAP, BY);
  const hl = (await C(ledP(), thin)).helper.lines.filter((l) => l.label === 'Tool S');
  thin = await wr(thin, 'helper', paidAlready(hl), ['rS'], C0, BY);
  const tp = await scene('thin plan', ledP(), thin);
  S = await holds(tp, 'only Tool S written');
  same([S.M.verdict.id, S.M.free.why, await text(tp, '#view-today .td-say'), await freeSays(tp), await kpi(tp, 5), await texts(tp, '#view-today .td-free button')],
    ['vT', 'thin', 'План на 6 окт – 5 ноя не дописан: расходов на команду и прочее вписано £120, обычный месяц — £6,120. Пока так, «денег хватает» сказать не могу. Нижняя точка по вписанному — £31,520, 3 ноября.', 'Сумму пока не назову: в плане на 6 окт – 5 ноя расходов на команду и прочее — £120, а обычный месяц — £6,120. Допишите октябрь.', ['Можно вывести', '—', 'в плане расходов £120 из обычных £6.1k'], ['Заполнить октябрь']],
    'only Tool S in the plan: the sentence and «Можно вывести» name the same thirty days — £120 written against an ordinary month of £6,120 — and no sum');
  await finish(tp);
});

await run('partly', '«Оплачено» means paid, and «Частично» is its own answer — how much has been paid, and on what day the rest will be — through the real controls (the founder\'s decisions of 7 October)', async () => {
  const AT = ms('2026-10-22T08:00:00Z');
  const L = ledP({ tx: [filed('b1', '2026-10-20', -5400, 'cogs', 'Person B', { at: AT })] });
  const pg = await scene('partly', L, await plan2(), { H: 60, at: '2026-10-22T12:00:00+01:00' });
  let S = await holds(pg, '22 Oct, Person B was paid 5,400 of the 6,000');
  const oct = 'rB@2026-10';
  shows(S, { now: 26600, out: 18400, end: 33400 }, '22 Oct, sixty days');
  await pg.click('#view-today [data-td-flip="past"]');
  same([item(S.M, oct).state, (await drawn(pg, oct)).split(' | ').slice(1, 5).join(' | '), S.M.cards.filter((c) => c.item === oct).length], ['done', 'line-through | Person B | Wise · заплатили £5,400, в плане £6,000 | −£5,400', 0], 'the month is closed by its payment at what came — «заплатили £5,400, в плане £6,000» — and nobody is asked about the difference');
  await pg.click(inDays(oct));
  same(await texts(pg, K('row') + '.ed-foot button'), ['И дальше так же', 'Частично…', 'Закрыть'], 'its card offers the two things that can follow: «И дальше так же», and «Частично…» for a debt that really remains');
  await pg.click(K('row') + '[data-ed-do="part"]');
  // The question asks two things in one box.
  same([await pg.inputValue(PART), await text(pg, K('row') + 'label[for="ed-part"] span'), await text(pg, K('row') + '[data-ed-partnote]'), await pg.$eval(REST, (e) => [e.type, e.value, e.min, e.max, e.id, 'edF' in e.dataset]), await text(pg, K('row') + 'label[for="ed-partdate"] span'), await texts(pg, ASK + ' button'), await pg.evaluate(() => document.activeElement.id)],
    ['5400', 'Сколько уже оплачено, £', 'остаток £600', ['date', '', '2026-10-22', '2028-10-22', 'ed-partdate', false], 'Когда заплатите остаток', ['Готово', 'Отмена'], 'ed-part'],
    '«Частично…» asks two things in one box: how much has been paid — filled in from the statement\'s payment, the cursor in it — and on what day the rest will be: a date field of the question\'s own, empty, from today to two years on, and not the card\'s «Дата»');
  same(await text(pg, ASK + ' > .note:last-child'), 'Строка закроется за октябрь на том, что оплачено. Остаток встанет отдельной строкой на выбранный день.', '… and says what the answer will do');
  await calm(pg, 'with the question «Частично…» open');
  // No day, a day gone by, a day too far: each is refused in words, the box stays open with the cursor on the day,
  // and nothing is written — neither the mark nor the row. The first of the three is asked by Enter in the SUM:
  // Enter in either field of the question answers the question.
  const refused = [];
  for (const d of ['', '2026-10-21', '2028-10-23']) {
    await pg.fill(REST, d);
    if (d) await pg.click(K('row') + '[data-ed-go="part"]');
    else await pg.press(PART, 'Enter');
    refused.push([await toastText(pg), !!(await pg.$(ASK)), await pg.evaluate(() => document.activeElement.id), (await rowIds(pg)).length, await pg.evaluate(() => 'x' in window.__cash.state().team[0].rec)]);
  }
  same(refused, [['Укажите день, когда заплатите остаток', true, 'ed-partdate', 5, false], ['Остаток — не раньше сегодняшнего дня', true, 'ed-partdate', 5, false], ['Слишком далёкая дата: прогноз смотрит не дальше двух лет', true, 'ed-partdate', 5, false]],
    'answered without a day (Enter in the sum), with yesterday, with a day more than two years off: «Укажите день, когда заплатите остаток», «Остаток — не раньше сегодняшнего дня», «Слишком далёкая дата…» — the question stays open on the day, and nothing is written');
  // Today itself is a day the rest may stand on — «заплачу сегодня» is the commonest answer there is: not refused.
  await answer(pg, undefined, '2026-10-22');
  S = await holds(pg, '«Частично»: 5,400 of 6,000, the rest today');
  const today = S.P.team.find((r) => r.carry);
  same([!!today && [today.amt, today.date], today && item(S.M, today.id).state, today && item(S.M, today.id).day, await toastText(pg), await pg.$(K('row'))], [[600, '2026-10-22'], 'due', '2026-10-22', 'Person B: оплачено £5,400 из £6,000, остаток — на чт 22 окт', null],
    'answered with today, 22 Oct: taken — the rest is a row of today, due today (only a day gone by is refused)');
  await undo(pg);
  same([(await rowIds(pg)).length, await pg.evaluate(() => 'x' in window.__cash.state().team[0].rec)], [5, false], '… and «Отменить» in the toast takes that answer back whole');
  await pg.click(inDays(oct));
  await pg.click(K('row') + '[data-ed-do="part"]');
  // Answered: the rest on 12 Nov.
  await answer(pg, undefined, '2026-11-12');
  S = await holds(pg, '«Частично»: 5,400 of 6,000, the rest on 12 Nov');
  const debt = S.P.team.find((r) => r.carry);
  same([Object.keys(S.P.team[0].rec.x), Object.keys(S.P.team[0].rec.x['2026-10']), S.P.team[0].rec.x['2026-10'].paid.amt, S.P.team.indexOf(debt), debt.name, debt.amt, debt.date, 'mon' in debt, debt.carry, 'rec' in debt, S.P.v, await toastText(pg), await pg.$(K('row'))],
    [['2026-10'], ['paid'], 5400, 1, 'Person B — остаток с октября', 600, '2026-11-12', false, { ym: '2026-10' }, false, 3, 'Person B: оплачено £5,400 из £6,000, остаток — на чт 12 ноя', null],
    'answered with 12 Nov: October is marked paid at 5,400 — its own date untouched — and the 600 is a one-off row DATED 12 Nov, named «Person B — остаток с октября», with no `mon`; the plan is still version 3; the toast names the day, and the card is closed');
  same([item(S.M, debt.id).state, item(S.M, debt.id).day, item(S.M, debt.id).cash, item(S.M, 'rB@2026-11').day, item(S.M, 'rB@2026-11').cash, card(S.M, 9).length], ['due', '2026-11-12', -600, '2026-11-20', -6000, 0], '… it is due on that day; November\'s own month stands on the 20th untouched; nothing is «без даты»');
  shows(S, { now: 26600, out: 19000, end: 32800 }, '… «Уйдёт» is more by the 600 and the end of the sixty days less by it; «сейчас» is as it was');
  await allDays(pg);
  same([(await drawn(pg, oct)).split(' | ').slice(1, 5).join(' | '), (await drawn(pg, debt.id)).split(' | ').slice(2).join(' | '), (await drawn(pg, 'rB@2026-11')).split(' | ').slice(2).join(' | ')], ['line-through | Person B | Wise · оплачено £5,400 из £6,000 | −£5,400', 'Person B — остаток с октября | Wise | −£600 | чт 12 ноя', 'Person B | Wise · каждый месяц | −£6,000 | пт 20 ноя'],
    'on «Сегодня» October reads «оплачено £5,400 из £6,000», the rest stands under the day the founder named — 12 Nov, saying nothing but its name — and November\'s own payment under the 20th');
  await pg.click(inDays(debt.id));
  same([await text(pg, K('row') + '.ed-why'), await texts(pg, K('row') + '.ed-foot button'), await pg.inputValue(K('row') + '#ed-date')], ['В плане: вписал Mika 22 окт · остаток с октября · в таблице это Person B.', ['Оплачено', 'Частично…', 'Перенести на…', 'Удалить', 'Закрыть', 'Сохранить'], '2026-11-12'],
    'its card says where it came from and offers what any written payout has: «Оплачено», «Частично…» again, «Перенести на…» with its date, «Удалить»');
  await pg.click(K('row') + '[data-ed-x]');
  // The constructor: the month it left is closed at what was paid; the rest is a row of the month of its day.
  await goCash(pg);
  S = await holds(pg, 'October in the constructor', 'cash');
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), S.fig('mon.team.done'), await csRow(pg, 'team', oct)], [[oct], 5400, 5400, 'cs-done | line-through | no tick | Person B | 6,000 | GBP | 20 окт | Wise | оплачено £5,400 из £6,000 | по выписке 20 окт'],
    'in the constructor October — the month it left — holds its one row, closed at what was paid: 5,400 expected, 5,400 done');
  await toMonth(pg, '2026-11');
  S = await holds(pg, 'November with the rest', 'cash');
  same([await csRow(pg, 'team', debt.id), await listed(pg, 'team'), S.fig('mon.team.exp')], ['typed | none | on | Person B — остаток с октября | 600 | GBP | 2026-11-12 | Wise |  | ✓ оплаченочастично', [debt.id, 'rB@2026-11'], 6600],
    '… and November holds the rest as a row of its own, dated the 12th, above November\'s own month of the 20th: 6,600 expected');
  // «По дням»: under its day.
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openDay(pg, '2026-11-12');
  same([await dayLine(pg, '2026-11-12'), await dayRows(pg, '2026-11-12'), await pg.$('#cs-stmt tr[data-cs-row="__carry"]')], [['чт 12 ноя', '£32,420', '—', '−£600', '£31,820', '1'], [`${debt.id} | typed | none | ✓ оплачено|false | date | фикс |  | −£600`], null],
    'in «По дням» it stands under 12 Nov, and the day takes its 600 off the balance — a line with its mark, its date to move and «фикс», like any other; there is no group «Долги без даты»');
  await holds(pg, '«По дням» with the rest', 'cash');
  // «частично» pressed in a row of the month opens the same question.
  await goCash(pg);
  same([await pg.$eval(cs('team', 'rB@2026-11') + ' [data-ed-ask="part"]', (e) => e.title), (await text(pg, '#cs-plan')).includes('«Частично» — третий ответ: строка закрывается на том, что оплачено, а остаток встаёт отдельной строкой на день, который вы выберете.')],
    ['Оплачена часть: строка закроется на ней, остаток встанет отдельной строкой на день, который вы выберете', true], 'the button «частично» of a row says in its title what it does, and «Как читать» under the lists says the same: the rest stands on a day the founder chooses — neither speaks of the next month any more');
  await pg.click(cs('team', 'rB@2026-11') + ' [data-ed-ask="part"]');
  same([await pg.inputValue(PART), await text(pg, K('row') + '[data-ed-partnote]'), await pg.inputValue(REST)], ['', 'из £6,000', ''], '«частично» in a row of the month opens the row\'s card on the same question, empty where no payment has come — the sum and the day alike');
  await pg.fill(PART, '6000');
  await pg.click(K('row') + '[data-ed-go="part"]');
  same([await toastText(pg), (await rowIds(pg)).length], ['Если оплачено всё — это «Оплачено», а не «Частично»', 6], '… and all of it is not «частично»: the sum is judged before the day, and nothing is written');
  // November's month is still open, so its card has the row's own fields and its own buttons — «Только ноябрь»,
  // «Ноябрь и дальше» — under the question's «Готово». With the question open and nothing of the row changed, that
  // button is the answer to the question: refused in the same words while the answer is not whole. (It closed the
  // card without a word, and the sum and the day just typed went with it.)
  await pg.fill(PART, '1500');
  await pg.click(K('row') + '[data-ed-save="only"]');
  same([await texts(pg, K('row') + '[data-ed-save]'), await toastText(pg), !!(await pg.$(ASK)), await pg.inputValue(PART), await pg.evaluate(() => document.activeElement.id), (await rowIds(pg)).length], [['Только ноябрь', 'Ноябрь и дальше'], 'Укажите день, когда заплатите остаток', true, '1500', 'ed-partdate', 6],
    '1,500 typed and no day, then the card\'s own «Только ноябрь»: it answers the QUESTION — «Укажите день, когда заплатите остаток» — and the card stays open with the sum as typed and the cursor on the day');
  await pg.click(K('row') + '.ed-foot [data-ed-do="part"]');
  same([await pg.inputValue(PART), await pg.evaluate(() => document.activeElement.id)], ['1500', 'ed-part'], '«Частично…» pressed again in the card\'s foot puts the cursor back into the sum — the question is not drawn afresh, empty');
  // The day is the last one the page takes, two years on — and Enter in the ROW's own «Дата», which presses the
  // card's button, answers the question as that button does. The toast says the year: it is not this year's.
  await pg.fill(REST, '2028-10-22');
  await pg.press(K('row') + '#ed-date', 'Enter');
  S = await holds(pg, '«Частично» on November\'s month: 1,500 of 6,000, the rest on 22 Oct 2028', 'cash');
  const far = S.P.team.find((r) => r.carry && r.id !== debt.id);
  same([await toastText(pg), !!far && [far.name, far.amt, far.date], Object.keys(S.P.team[0].rec.x['2026-11']), S.P.team[0].rec.x['2026-11'].paid.amt, await pg.$(K('row')), far && item(S.M, far.id).state],
    ['Person B: оплачено £1,500 из £6,000, остаток — на вс 22 окт 2028', ['Person B — остаток с ноября', 4500, '2028-10-22'], ['paid'], 1500, null, 'due'],
    'the day typed — 22 Oct 2028, the last one allowed — and Enter in the row\'s own «Дата»: the answer is taken, with November\'s own date and sum untouched; the toast names the day WITH ITS YEAR, «на вс 22 окт 2028» — without it a year typed with a slip read like this year\'s, of a row that is in no day in sight');
  same(await text(pg, '#cs-undo span'), 'Последнее изменение: Person B: оплачено £1,500 из £6,000, остаток — на вс 22 окт 2028', '… and so does the strip that offers to take it back');
  await pg.click('#cs-undo [data-cs-undo]');
  same([(await rowIds(pg)).length, await pg.evaluate(() => Object.keys(window.__cash.state().team[0].rec.x))], [6, ['2026-10']], '… «Отменить» there takes November\'s answer back, and October\'s stands');
  // «Отменить» takes the whole answer back: the mark and the row together.
  await pg.click('#cs-undo [data-cs-undo]');
  S = await holds(pg, '«Отменить»', 'cash');
  same([(await rowIds(pg)).length, 'x' in S.P.team[0].rec, await toastText(pg), S.fig('out')], [5, false, 'Отменено: Person B: оплачено £5,400 из £6,000, остаток — на чт 12 ноя', 18400], '«Отменить» in the strip takes the whole answer back — the mark and the row together');
  await finish(pg);

  // A mark the statements never answer: paid means paid.
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  const mk = await scene('paid is paid', ledA({ tx: [reach('Wise', '2026-10-12', 'GBP', AT4)] }), planW({ team: [g({ paid: paid(T) })] }), { at: '2026-10-13T12:00:00+01:00' });
  S = await holds(mk, 'marked on 6 Oct; the statements uploaded since reach 12 Oct and show no such payment');
  await mk.click('#view-today [data-td-flip="past"]');
  same([item(S.M, 'g').state, item(S.M, 'g').done.by, S.M.cards.length, (await drawn(mk, 'g')).split(' | ').slice(1, 5).join(' | '), S.fig('marks'), (await kpi(mk, 0))[1]], ['done', 'ok', 0, 'line-through | Person G | Wise · отмечено вручную | −£1,000', undefined, '£10,000'],
    'a row marked paid stays closed when the statements go past its day without showing it: struck through, «отмечено вручную», no card, nothing owed again — and no longer inside «сейчас»');
  await mk.click(inDays('g'));
  same([await text(mk, K('row') + '.ed-why'), await texts(mk, K('row') + '.ed-foot button')], ['В плане: вписал Mika 6 окт · такого названия в таблице нет — закрою по сумме. Закрыто по вашему слову: в выписках такого платежа не видно, и снова его не жду.', ['Вернуть в план', 'Повторять каждый месяц', 'Закрыть']], 'its card says so; what is left to do is «Вернуть в план» — or to make the paid row repeat');
  await finish(mk);
});

await run('partly, other days', '«Частично» with the rest in the same month, and a second «Частично» that keeps the name; money coming in; «Повторять каждый месяц» beside a rest', async () => {
  // The rest in the same month.
  const AT = ms('2026-10-22T08:00:00Z');
  const L = ledP({ tx: [filed('b1', '2026-10-20', -5400, 'cogs', 'Person B', { at: AT })] });
  let pg = await scene('partly, the same month', L, await plan2(), { H: 60, at: '2026-10-22T12:00:00+01:00' });
  const oct = 'rB@2026-10';
  await pg.click('#view-today [data-td-flip="past"]');
  await pg.click(inDays(oct));
  await pg.click(K('row') + '[data-ed-do="part"]');
  await answer(pg, undefined, '2026-10-30');
  let S = await holds(pg, 'the rest in the same month, on 30 Oct');
  const debt = S.P.team.find((r) => r.carry);
  await allDays(pg);
  same([await toastText(pg), debt.date, item(S.M, debt.id).day, (await drawn(pg, debt.id)).split(' | ').slice(2).join(' | '), [S.M.month.blocks.team.fact, S.M.month.blocks.team.rest, S.fig('m.team.total')]],
    ['Person B: оплачено £5,400 из £6,000, остаток — на пт 30 окт', '2026-10-30', '2026-10-30', 'Person B — остаток с октября | Wise | −£600 | пт 30 окт', [5400, 600, 6000]],
    'the rest on 30 Oct, in the month it came from: it stands under that day on «Сегодня», and October\'s team is whole again — 5,400 paid, 600 still to go, 6,000');
  shows(S, { now: 26600, out: 19000, end: 32800 }, '… «Уйдёт» and the end of the line are what they are with the rest on any day of the sixty');
  await goCash(pg);
  S = await holds(pg, 'October with both rows', 'cash');
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), S.fig('mon.team.done'), await csRow(pg, 'team', debt.id)], [[oct, debt.id], 6000, 5400, 'typed | none | on | Person B — остаток с октября | 600 | GBP | 2026-10-30 | Wise |  | ✓ оплаченочастично'],
    'in the constructor it is a row of OCTOBER, under the row it came from: the month still expects its 6,000 and has 5,400 of it');
  await toMonth(pg, '2026-11');
  same(await listed(pg, 'team'), ['rB@2026-11'], '… and November holds only its own month');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openDay(pg, '2026-10-30');
  same([await dayLine(pg, '2026-10-30'), await dayRows(pg, '2026-10-30')], [['пт 30 окт', '£37,840', '—', '−£600', '£37,240', '1'], [`${debt.id} | typed | none | ✓ оплачено|false | date | фикс |  | −£600`]], 'in «По дням» it stands under 30 Oct');
  // A second «Частично…», on the rest itself, two months on. Its card is that of an open row — the row's own «Дата»
  // and «Сохранить» stand in it — and Enter in the day of the QUESTION answers the question.
  await pg.click(`#cs-stmt li[data-cs-li="${debt.id}"] [data-ed-ask="part"]`);
  await pg.waitForSelector(ASK);
  same([await text(pg, K('row') + '[data-ed-partnote]'), await pg.inputValue(K('row') + '#ed-date'), await texts(pg, K('row') + '[data-ed-save]'), await pg.$$eval(K('row') + 'input[type=date]', (l) => l.map((e) => e.id))], ['из £600', '2026-10-30', ['Сохранить'], ['ed-date', 'ed-partdate']],
    '«частично» on the rest\'s own line: its card holds two dates — the row\'s own, 30 Oct, with «Сохранить», and the empty day of the question');
  await answer(pg, 200, '2026-12-15', true);
  S = await holds(pg, 'a second «Частично», answered with Enter in the day', 'cash');
  const first = stored(S, debt.id);
  const next = S.P.team.find((r) => r.carry && r.id !== debt.id);
  same([first.paid.amt, first.date, !!next && [next.name, next.amt, next.date, next.carry], S.P.team.map((r) => r.id), await toastText(pg), await pg.$(K('row'))],
    [200, '2026-10-30', ['Person B — остаток с октября', 400, '2026-12-15', { ym: '2026-10' }], ['rB', debt.id, next && next.id], 'Person B — остаток с октября: оплачено £200 из £600, остаток — на вт 15 дек', null],
    'Enter in the day answers the question — it does not press the card\'s «Сохранить»: the rest is marked paid at 200 with its own date untouched, and the 400 is a new row on 15 Dec that keeps the name and the month the debt first came from — «Person B — остаток с октября», not «… — остаток с октября — остаток с октября»');
  shows(S, { now: 26400, marks: -200, out: 18800 }, '… the 200 said to be paid is in «сейчас» as a mark, and «Уйдёт» holds the 400 in place of the 600');
  await goToday(pg);
  await allDays(pg);
  same([(await drawn(pg, next.id)).split(' | ').slice(2).join(' | '), (await drawn(pg, debt.id)).split(' | ').slice(1).join(' | ')], ['Person B — остаток с октября | Wise | −£400 | вт 15 дек', 'line-through | Person B — остаток с октября | Wise · оплачено £200 из £600 | −£200 | пт 30 окт'],
    'on «Сегодня» the 400 stands under 15 Dec, two months on, and the first rest is struck through under its own day — «оплачено £200 из £600»');
  await goCash(pg);
  await toMonth(pg, '2026-12');
  S = await holds(pg, 'December with the second rest', 'cash');
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), await csRow(pg, 'team', next.id)], [[next.id, 'rB@2026-12'], 6400, 'typed | none | on | Person B — остаток с октября | 400 | GBP | 2026-12-15 | Wise |  | ✓ оплаченочастично'], 'in the constructor it is a row of December, above December\'s own month: 6,400 expected');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  same(await dayLine(pg, '2026-12-15'), ['вт 15 дек', '£37,200', '+£2,000', '−£400', '£38,800', '2'], '… and in «По дням» the 15th of December takes its 400 beside Client R\'s 2,000');
  // The editor has its own list of «the later months that already hold a row of this name» — for a row made «каждый
  // месяц» in «Добавить» or by the tick in its card. A rest is not in it either: a row typed by hand under the very
  // name the two rests carry repeats into December, where the second rest stands, with no word of it.
  await goToday(pg);
  const twin = await addRow(pg, 'team', { name: 'Person B — остаток с октября', amt: 50, date: '2026-11-05', monthly: true });
  S = await holds(pg, 'a row added under the name of a rest, «каждый месяц» from November');
  same([await toastText(pg), !!twin && stored(S, twin).rec, states(S.M, [twin + '@2026-11', twin + '@2026-12', next.id])], ['В плане: Person B — остаток с октября', { day: 5, from: '2026-11' }, ['due', 'due', 'due']],
    'a row «Person B — остаток с октября» of £50 added for 5 Nov, «каждый месяц»: the toast speaks of no row standing in December, and the repeat is not switched off there — the rest of 15 Dec is a debt beside it, not «December\'s own row» of that name');
  await finish(pg);

  // Money coming in: the same question in its own words, from the card of «Нужно решить».
  pg = await scene('partly, an inflow', ledA(), planW({ inflows: [row('e', 'Client E', 4000, '2026-09-22', { vat: false })] }));
  S = await holds(pg, 'Client E £4,000 for 22 Sep, thirteen days late');
  shows(S, { now: 10000, in: 12000, late: 4000, end: 15880 }, 'a written invoice of £4,000 for 22 Sep that has not come: late, still expected');
  const need = '#view-today .td-need .op[data-td-card="7"] ';
  await pg.click(need + '[data-ed-ask="part"]');
  same([await pg.evaluate(() => !!document.querySelector('#view-today .td-need [data-ed-card="row"] [data-ed-askbox="part"]')), await text(pg, K('row') + 'label[for="ed-part"] span'), await text(pg, K('row') + 'label[for="ed-partdate"] span'), await text(pg, ASK + ' > .note:last-child'), await pg.evaluate(() => document.activeElement.id)],
    [true, 'Сколько уже получено, £', 'Когда придёт остаток', 'Строка закроется за сентябрь на том, что получено. Остаток встанет отдельной строкой на выбранный день.', 'ed-part'],
    '«Частично…» in card 7 opens the row\'s card there, on the question in an inflow\'s words: «Сколько уже получено», «Когда придёт остаток»');
  await pg.fill(PART, '4000');
  await pg.click(K('row') + '[data-ed-go="part"]');
  same([await toastText(pg), (await rowIds(pg)).length, !!(await pg.$(ASK))], ['Если получено всё — это «Получено», а не «Частично»', 4, true], '… all 4,000 typed: refused in an inflow\'s words too — the button for money that has all come is «Получено» here, not «Оплачено» — and nothing is written');
  await pg.fill(PART, '1000');
  same(await text(pg, K('row') + '[data-ed-partnote]'), 'остаток £3,000', '… 1,000 typed: «остаток £3,000»');
  await pg.click(K('row') + '[data-ed-go="part"]');
  same([await toastText(pg), (await rowIds(pg)).length, await pg.evaluate(() => document.activeElement.id)], ['Укажите день, когда придёт остаток', 4, 'ed-partdate'], '«Готово» without a day: «Укажите день, когда придёт остаток», and nothing is written');
  await answer(pg, undefined, '2026-10-20');
  S = await holds(pg, '1,000 received, the rest on 20 Oct');
  const rest = S.P.inflows.find((r) => r.carry);
  await allDays(pg);
  same([rest.name, rest.amt, rest.date, rest.vat, rest.carry, 'mon' in rest, stored(S, 'e').paid.amt, await toastText(pg), await pg.$(need), (await drawn(pg, rest.id)).split(' | ').slice(2).join(' | '), S.M.undated.n, S.M.months.by['2026-10'].inflows.rows],
    ['Client E — остаток с сентября', 3000, '2026-10-20', false, { ym: '2026-09' }, false, 1000, 'Client E: получено £1,000 из £4,000, остаток — на вт 20 окт', null, 'Client E — остаток с сентября | Wise | +£3,000 | вт 20 окт', 0, [rest.id, 'rA@2026-10']],
    '1,000 received, the rest on 20 Oct: the invoice is closed at what came and its card is gone; the 3,000 is a row of October dated the 20th — expected money, under its day, not a row «без даты»');
  shows(S, { now: 11000, marks: 1000, in: 11000, late: 0, end: 15880, low: 8000, lowday: '2026-10-20' }, '… the 1,000 is in «сейчас» as a mark, the 3,000 in «Придёт»; nothing is late, the end of the line is where it stood');
  await finish(pg);

  // A rest is never «the month's own row»: «Повторять каждый месяц» on the row it came from leaves the next month whole.
  pg = await scene('partly, the tick', ledP(), planP({ team: [row('pb', 'Person B', 6000, '2026-10-20')] }), { H: 60, at: '2026-10-22T12:00:00+01:00' });
  await openRow(pg, 'pb');
  await pg.click(K('row') + '[data-ed-do="part"]');
  await answer(pg, 4000, '2026-11-12');
  S = await holds(pg, 'a one-off Person B, 4,000 of the 6,000 paid, the rest on 12 Nov');
  const r2 = S.P.team.find((r) => r.carry);
  same([states(S.M, ['pb', r2.id]), item(S.M, r2.id).day, item(S.M, 'pb').twins], [['done', 'due'], '2026-11-12', []], 'a one-off row «Person B» of 20 Oct, 4,000 of it paid and the rest on 12 Nov: the model names no later month that already holds a row of his');
  await pg.click('#view-today [data-td-flip="past"]');
  await pg.click(inDays('pb'));
  same(await texts(pg, K('row') + '.ed-foot button'), ['Вернуть в план', 'Повторять каждый месяц', 'Закрыть'], 'the card of the row that was paid in part offers «Повторять каждый месяц»');
  await pg.click(K('row') + '[data-ed-do="tick"]');
  S = await holds(pg, '«Повторять каждый месяц» beside a rest');
  same([await toastText(pg), Object.keys(S.P.team[0].rec.x), S.P.team[0].rec.day, states(S.M, ['pb@2026-10', 'pb@2026-11', r2.id]), item(S.M, 'pb@2026-11').cash, S.M.months.by['2026-11'].team],
    ['Person B: каждый месяц, с октября', ['2026-10'], 20, ['done', 'due', 'due'], -6000, { rows: [r2.id, 'pb@2026-11'], expected: 8000, done: 0 }],
    'pressed: «Person B: каждый месяц, с октября» — with no word of a row in November: the repeat is not switched off there, and November holds the 2,000 still owed for October beside its own 6,000');
  await finish(pg);

  // Two things at once: the question open and answered, AND a field of the row itself changed, then the card's own
  // button. The row is saved, as it always was — and the toast says that the answer was not taken: what was typed
  // into the question is never dropped without a word.
  pg = await scene('partly, two things at once', ledP(), await plan2(), { H: 60, at: '2026-10-22T12:00:00+01:00' });
  await openRow(pg, 'rB@2026-11');
  await pg.click(K('row') + '[data-ed-do="part"]');
  await pg.fill(PART, '1500');
  await pg.fill(REST, '2026-11-27');
  await pg.fill(K('row') + '#ed-date', '2026-11-25');
  await pg.click(K('row') + '[data-ed-save="only"]');
  S = await holds(pg, 'November\'s month moved to the 25th with «Частично» open and answered');
  same([await toastText(pg), S.P.team[0].rec.x, (await rowIds(pg)).length, await pg.$(K('row'))], ['Сохранено: Person B — только ноябрь · «Частично» не записано — ответьте на него заново', { '2026-11': { date: '2026-11-25' } }, 5, null],
    'November\'s month, «Частично…» answered with 1,500 and 27 Nov, and its own date changed to the 25th, then «Только ноябрь»: the date is saved for that month — and the toast says the answer was not: «… · «Частично» не записано — ответьте на него заново»');
  await finish(pg);
});

await run('partly, from before', 'a plan that still holds a rest carried WITHOUT a date reads exactly as it did — its state, its words, its place in the three tabs — until a founder gives it a day', async () => {
  const AT = ms('2026-10-22T08:00:00Z');
  const PT = ms('2026-10-22T09:00:00Z');
  const L = ledP({ tx: [filed('b1', '2026-10-20', -5400, 'cogs', 'Person B', { at: AT })] });
  // What «Частично» wrote before the founder chose the day himself («p6» holds that document): the mark with its
  // sum, and the rest as a row of the NEXT month with no date. Beside it two more rows of that kind: a debt carried
  // to December, past the thirty days in view, and what a client still owed.
  const old = (id, name, amt, mon, ym, more = {}) => ({ id, name, amt, cur: 'GBP', bank: 'Wise', on: true, date: '', mon, c0: PT, m: { t: PT, by: BY }, carry: { ym }, ...more });
  const P = await plan2();
  P.team[0].rec.x = { '2026-10': { paid: { on: '2026-10-22', at: PT, by: BY, amt: 5400 } } };
  P.team.splice(1, 0, old('debt', 'Person B — остаток с октября', 600, '2026-11', '2026-10', { blk: 'cogs', sk: 'cogs|person b', skBy: 'hand' }));
  P.other.push(old('far', 'Printer — остаток с ноября', 300, '2026-12', '2026-11', { blk: 'other' }));
  P.inflows.push(old('owed', 'Client A — остаток с сентября', 1000, '2026-10', '2026-09', { blk: 'rev', bank: 'Barclays', vat: true, sk: 'rev|client a', skBy: 'hand' }));
  const pg = await scene('from before', L, P, { at: '2026-10-22T12:00:00+01:00' });
  let S = await holds(pg, 'a plan from before: three rests without a date');
  same([states(S.M, ['rB@2026-10', 'debt', 'far', 'owed']), item(S.M, 'debt').day, item(S.M, 'debt').cash, item(S.M, 'far').day, item(S.M, 'owed').day, S.M.undated.ids, S.M.cards.map((c) => c.n), item(S.M, 'rB@2026-11').cash],
    [['done', 'carry', 'carry', 'undated'], '2026-11-01', -600, '2026-12-01', '', ['owed'], [9], -6000], 'what the studio owes is counted on the first day of its month though it has no date — 1 Nov, 1 Dec; what a client owes is counted nowhere, and is in the «без даты» card; November\'s own month is untouched');
  shows(S, { now: 26600, out: 12380, end: 27820 }, '… the figures «p6» gives for the debt of November: «Уйдёт» 12,380 with its 600, the end of the thirty days 27,820');
  await allDays(pg);
  same([(await drawn(pg, 'debt')).split(' | ').slice(2).join(' | '), await text(pg, '#view-today .td-need .op[data-td-card="9"] .op-name')], ['Person B — остаток с октября | Wise · без даты · в расчёте с 1 ноября | −£600 | вс 1 ноя', 'Без даты и не в расчёте: 1 строка на £1,200'],
    'on «Сегодня» the debt stands under 1 November — «без даты · в расчёте с 1 ноября» — and the card counts only what is owed TO the studio');
  await pg.click(inDays('debt'));
  same([await text(pg, K('row') + '.ed-why'), await texts(pg, K('row') + '.ed-foot button'), await pg.inputValue(K('row') + '#ed-date')], ['В плане: вписал Mika 22 окт · остаток с октября · в таблице это Person B. Даты нет, но в расчёт идёт: это долг студии. Поставьте дату, когда она станет известна.', ['Оплачено', 'Удалить', 'Закрыть', 'Сохранить'], ''],
    'its card says it has no date and is counted all the same, and offers «Оплачено» and «Удалить»');
  await pg.click(K('row') + '[data-ed-x]');
  await goCash(pg);
  same([await listed(pg, 'inflows'), await csRow(pg, 'inflows', 'owed')], [['rR@2026-10', 'rA@2026-10', 'owed'], 'typed | none | on | Client A — остаток с сентября | 1000 | GBP |  | Barclays | без даты · в расчёт не идёт, пока не поставите дату | ✓ полученочастично'], 'in the constructor what the client owes is a row of October with no date — «без даты · в расчёт не идёт, пока не поставите дату»');
  await toMonth(pg, '2026-11');
  await holds(pg, 'November with the debt', 'cash');
  same([await csRow(pg, 'team', 'debt'), await listed(pg, 'team')], ['typed | none | on | Person B — остаток с октября | 600 | GBP |  | Wise | без даты · в расчёте с 1 ноября | ✓ оплаченочастично', ['rB@2026-11', 'debt']], '… the debt a row of November, its date still to be given, after November\'s own month');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openDay(pg, '2026-11-01');
  same([await dayLine(pg, '2026-11-01'), await dayRows(pg, '2026-11-01'), await dayLine(pg, '__carry'), await dayLine(pg, '__undated'), plain(await text(pg, '#cs-answer .cs-warn'))],
    [['вс 1 ноя', '£37,840', '—', '−£600', '£37,240', '1'], ['debt | typed | none | ✓ оплачено|false | date | фикс | без даты · в расчёте с 1 ноября | −£600'], ['Долги без даты — в расчёте с первого дня своего месяца · 1 строка'], ['Без даты — не в расчёте · 1 строка'], '1 строка без даты в расчёт по дням не идёт: поступления £1,200, платежи £0. Даты можно поставить в выписке внизу.'],
    'in «По дням» it stands under 1 Nov; the debt of December, past the thirty days, is in the group «Долги без даты — в расчёте с первого дня своего месяца»; what the client owes in «Без даты — не в расчёте»');
  await sleep(700);
  same([store.cash.puts, S.P.v, stored(S, 'debt').date, stored(S, 'debt').mon, stored(S, 'debt').carry], [0, 3, '', '2026-11', { ym: '2026-10' }], 'looking at all of it wrote nothing: the plan is version 3 as it was, and no row was given a date by the page');
  // … until a founder gives it a day. «частично» on the debt asks for the day of what is left, as it now does everywhere.
  await goCash(pg);
  await pg.click(cs('team', 'debt') + ' [data-ed-ask="part"]');
  same([await text(pg, K('row') + 'label[for="ed-partdate"] span'), await text(pg, ASK + ' > .note:last-child'), await pg.inputValue(REST)], ['Когда заплатите остаток', 'Строка закроется за ноябрь на том, что оплачено. Остаток встанет отдельной строкой на выбранный день.', ''], '«частично» on the debt: the question asks for the day of the rest');
  await answer(pg, 100, '2026-11-25');
  S = await holds(pg, '100 of the debt paid, the rest on 25 Nov', 'cash');
  const next = S.P.team.find((r) => r.carry && r.id !== 'debt');
  same([stored(S, 'debt').paid.amt, stored(S, 'debt').date, stored(S, 'debt').mon, !!next && [next.name, next.amt, next.date, 'mon' in next, next.carry], states(S.M, ['debt', next && next.id]), item(S.M, next && next.id).day, await toastText(pg), await listed(pg, 'team')],
    [100, '', '2026-11', ['Person B — остаток с октября', 500, '2026-11-25', false, { ym: '2026-10' }], ['done', 'due'], '2026-11-25', 'Person B — остаток с октября: оплачено £100 из £600, остаток — на ср 25 ноя', ['rB@2026-11', next && next.id, 'debt']],
    '100 of it paid, the rest on 25 Nov: the old row is closed at 100 where it stood, and the 500 is a dated row with the same name and the same month of origin — due on the 25th, no longer a debt «без даты»');
  // … or simply types its date.
  await toMonth(pg, '2026-12');
  same(await csRow(pg, 'other', 'far'), 'typed | none | on | Printer — остаток с ноября | 300 | GBP |  | Wise | без даты · в расчёте с 1 декабря | ✓ оплаченочастично', 'December\'s debt, as it was written');
  await pg.fill(box('other', 'far', 'date'), '2026-12-05');
  await leave(pg);
  S = await holds(pg, 'a date typed into the debt of December', 'cash');
  same([stored(S, 'far').date, 'mon' in stored(S, 'far'), stored(S, 'far').carry, item(S.M, 'far').state, item(S.M, 'far').day, S.M.items.filter((it) => it.state === 'carry').length], ['2026-12-05', false, { ym: '2026-11' }, 'due', '2026-12-05', 0], 'a date typed into it: from then on it is a dated row, due on its day — and no row of the plan is «carry» any more');
  await finish(pg);
});

await run('phone', 'a phone, 375 and 390 wide: nothing scrolls sideways, and the new blocks stand in a sensible order', async () => {
  for (const w of [375, 390]) {
    serve(ledP(), await plan2());
    const ph = await open('phone ' + w, undefined, { w, h: 812 });
    await ph.waitForSelector('#view-today [data-live="verdict"]');
    const r = await ph.evaluate(() => {
      const top = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1; };
      return { wide: document.documentElement.scrollWidth, order: ['.td-verdict', '.kpis', '.td-acc', '.td-need', '#td-chart', '.td-free', '[aria-label="Ближайшие дни"]', '.td-tax', '.td-month'].map((s) => top('#view-today ' + s)), bv: getComputedStyle(document.querySelector('#view-today .td-bv')).fontSize, say: getComputedStyle(document.querySelector('#view-today .td-fsay')).fontSize };
    });
    ok(r.wide <= w, `${w}px: «Сегодня» does not scroll sideways`, r);
    ok(r.order.every((t, i) => t > 0 && (!i || t > r.order[i - 1])), `${w}px: the sentence, six figures, the accounts, what needs deciding, the chart, «Можно вывести», the seven days, «Налоги», the month — in that order, one under another`, r.order);
    ok(parseFloat(r.bv) >= 20 && parseFloat(r.say) >= 16, `${w}px: the type is not shrunk to fit — the month's figures are ${r.bv}, the answer of «Можно вывести» ${r.say}`);
    await holds(ph, `${w}px, the plan of test 2`);
    await calm(ph, `${w}px, the plan of test 2`);
    // The widest things of this iteration: a row's card on its question, the helper, the constructor, the settings.
    await allDays(ph);
    await ph.click(inDays('rB@2026-10'));
    await ph.click(K('row') + '[data-ed-do="part"]');
    const a = await ph.evaluate(() => document.documentElement.scrollWidth);
    // … and of that question nothing is off the screen: the sum, the day of the rest, the two buttons.
    const q = await ph.evaluate((w) => [...document.querySelectorAll('[data-ed-askbox="part"] input, [data-ed-askbox="part"] button')].map((e) => { const r = e.getBoundingClientRect(); return (e.id || e.textContent.trim()) + (r.width > 0 && r.left >= 0 && r.right <= w + 0.5 ? '' : ` is off the screen: ${Math.round(r.left)}…${Math.round(r.right)}`); }), w);
    same(q, ['ed-part', 'ed-partdate', 'Готово', 'Отмена'], `${w}px: the question «Частично…» is whole on the screen — how much has been paid, the day of the rest, «Готово» and «Отмена»`);
    await goCash(ph);
    const b = await ph.evaluate(() => [document.documentElement.scrollWidth, getComputedStyle(document.querySelector('#cs-sec-team .cs-recl')).display, document.querySelectorAll('#cs-sec-team [data-cs-f="rec"]').length]);
    // Nothing of a row of the month is off the screen: no list scrolls sideways inside its card, and every box, tick and button of every row ends inside the phone.
    const inPlan = await ph.evaluate((w) => { const out = []; document.querySelectorAll('#cs-plan .cs-rows .tbl').forEach((t) => { if (t.scrollWidth > t.clientWidth + 1) out.push('a list scrolls inside its card: ' + t.scrollWidth + ' > ' + t.clientWidth); });
      document.querySelectorAll('#cs-plan tr.cs-r input, #cs-plan tr.cs-r select, #cs-plan tr.cs-r button, #cs-plan tr.cs-r .cs-nt, #cs-plan tr.cs-r .cs-rm').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push(e.closest('tr').dataset.csId + ': ' + (e.dataset.csF || e.className || e.tagName) + ' ends at ' + Math.round(r.right)); }); return out; }, w);
    ok(!inPlan.length, `${w}px: every row of the month is whole on the screen — its name, sum, date, bank, «каждый месяц», «оплачено», «частично» and «ещё»`, inPlan.slice(0, 5));
    await ph.click('#cs-plan [data-cs-helper]');
    const c = await ph.evaluate(() => document.documentElement.scrollWidth);
    await ph.click('#cs-helper [data-cs-hx]');
    await ph.click('#view-cash [data-cs-view="days"]');
    await openDay(ph, '2026-10-20');
    const d = await ph.evaluate(() => [document.documentElement.scrollWidth, [...document.querySelectorAll('#cs-stmt .cs-lrec')].every((e) => getComputedStyle(e).display === 'none')]);
    // … and each line of an opened day says what it is and how much, in sight.
    const inDays_ = await linesInSight(ph, w);
    ok(inDays_[0] > 0 && !inDays_[1].length, `${w}px: each of the ${inDays_[0]} lines of the opened day says what it is and how much, in sight`, inDays_[1].slice(0, 5));
    await ph.click('.nav [data-tab="settings"]');
    await ph.waitForSelector('#ed-taxes .ed-rule');
    const e = await ph.evaluate(() => document.documentElement.scrollWidth);
    ok(a <= w && b[0] <= w && c <= w && d[0] <= w && e <= w, `${w}px: nor does a row's card on «Частично», the constructor, the helper, the day list or «Настройки → Налоги»`, [a, b, c, d, e]);
    ok(b[1] !== 'none' && b[2] > 0 && d[1], `${w}px: in a row of the month the tick says «каждый месяц» itself — the column has no heading there; in the day list it is in the card the line's name opens`, [b, d]);
    await ph.context().close();
  }
});

await run('advice', '«Касса · По дням»: the advice and «Автоплан» move rows a founder wrote — a one-off row by its date, a month of a row that repeats for that month alone — and never a tax worked out by a rule', async () => {
  // The plan of test 2 and a purchase that takes the line below zero on 22 Oct, six days before Client A pays.
  const P = await plan2();
  P.other.push(row('big', 'Equipment', 30000, '2026-10-22'));
  const pg = await scene('advice', ledP(), P);
  let S = await holds(pg, 'a purchase of 30,000 on 22 Oct');
  same([S.M.verdict.id, S.M.minusDay, S.M.minus, await text(pg, '#view-today .td-verdict button')], ['v4', '2026-10-22', -2000, 'Как закрыть'], 'the line goes below zero on 22 Oct by 2,000: verdict v4, and the sentence carries «Как закрыть»');
  await pg.click('#view-today .td-verdict button');
  await pg.waitForSelector('#cs-answer .cs-sugg');
  const sugg = () => pg.$$eval('#cs-answer .cs-sugg li', (l) => l.map((li) => [li.dataset.csType, li.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()]));
  const list = await sugg();
  const taxes0 = S.M.items.filter((it) => it.src === 'tax').map((it) => [it.id, it.date].join(' '));
  ok(list.some((s) => s[0] === 'shift' && /Equipment/.test(s[1])) && list.some((s) => s[0] === 'shift' && /Person B/.test(s[1])) && !list.some((s) => /УСН по Точке за|UK VAT за/.test(s[1])) && !!(await pg.$('#cs-answer [data-cs-auto]')),
    'the advice offers to move the purchase, or Person B\'s October — rows a founder wrote — and «Автоплан»; it never offers to move the tax worked out by a rule', list);
  // A month of a row that repeats is moved for that month alone.
  const iB = list.findIndex((s) => s[0] === 'shift' && /Person B/.test(s[1]));
  await pg.click(`#cs-answer [data-cs-sugg="${iB}"]`);
  S = await holds(pg, 'Person B\'s October moved by the advice', 'cash');
  const x = S.P.team[0].rec.x || {};
  same([Object.keys(x), /^2026-1[01]-\d\d$/.test((x['2026-10'] || {}).date || ''), S.P.team[0].rec.day, item(S.M, 'rB@2026-11').date, item(S.M, 'rB@2026-10').occ.moved, S.M.minusDay], [['2026-10'], true, 20, '2026-11-20', true, ''],
    '«Применить» on Person B: October\'s month alone gets a new date — the row still repeats on the 20th, November stays — and the minus is closed');
  await pg.click('#cs-undo [data-cs-undo]');
  // A one-off row is moved by its own date.
  const iE = (await sugg()).findIndex((s) => s[0] === 'shift' && /Equipment/.test(s[1]));
  await pg.click(`#cs-answer [data-cs-sugg="${iE}"]`);
  S = await holds(pg, 'the purchase moved by the advice', 'cash');
  same([stored(S, 'big').date > '2026-10-22', 'x' in S.P.team[0].rec, S.M.minusDay], [true, false, ''], '«Применить» on the purchase: the row\'s own date moves, nothing else does, and the minus is closed');
  await pg.click('#cs-undo [data-cs-undo]');
  // «Автоплан».
  const per0 = JSON.stringify((await look(pg, 'cash')).P.tax.per);
  await pg.click('#cs-answer [data-cs-auto]');
  S = await holds(pg, '«Автоплан»', 'cash');
  same([S.M.LOW >= 0, JSON.stringify(S.P.tax.per) === per0, S.M.items.filter((it) => it.src === 'tax').map((it) => [it.id, it.date].join(' ')), LISTS.flatMap((k) => S.P[k]).filter((r) => r.rec).map((r) => r.rec.day), await toastText(pg)], [true, true, taxes0, [28, 15, 20, 3, 5], 'Автоплан применён — можно отменить'],
    '«Применить автоплан»: no day below zero any more; no tax was moved or answered for, and every row that repeats keeps its day — only single months and one-off rows were moved');
  await finish(pg);
});

await run('tax cards', 'the questions about a tax that are answered in one press: a rule nobody confirmed (card 15), a tax row typed before the rules existed (card 13)', async () => {
  // Card 15, the other two answers.
  let pg = await scene('card 15, away', ledP(), planP());
  await pg.click('#view-today .td-need .op[data-td-card="15"] [data-ed-tax="away"]');
  let S = await holds(pg, '[Не со счетов студии]');
  same([S.P.tax.rules[1].away, S.P.tax.rules[1].ask, S.M.cards.length, S.M.items.filter((it) => it.tax && it.tax.rule === 'usn').length, await taxRow(pg, 'usn|2026Q3'), S.fig('reserve')], [true, undefined, 0, 0, ['УСН по Точке за III кв. 2026', 'начислено ₽42,480 (£360) · платим не со счетов студии — в расчёт не входит', '—'], 4800],
    '[Не со счетов студии]: the rule is `away` — its accrual is still shown, it has no line, no reserve and no card');
  await finish(pg);
  pg = await scene('card 15, another rate', ledP(), planP());
  await pg.click('#view-today .td-need .op[data-td-card="15"] [data-ed-tax="rate"]');
  same(await pg.evaluate(() => [document.querySelector('.nav .active').dataset.tab, document.activeElement.dataset.edRv, document.activeElement.closest('[data-ed-rule]').dataset.edRule, !!document.querySelector('#ed-taxes .ed-rule[data-ed-rule="usn"] .ed-ask')]), ['settings', 'rate', 'usn', true], '[Да, другая ставка] opens «Настройки → Налоги» with the cursor on that rule\'s rate; the card there still says nobody has confirmed it');
  await pg.keyboard.type('5');
  await pg.keyboard.press('Enter');
  await goToday(pg);
  S = await holds(pg, 'the rate typed');
  same([S.P.tax.rules[1].rate, S.P.tax.rules[1].ask, item(S.M, 't|usn|2026Q3').cash, card(S.M, 15).length], [5, undefined, -300, 0], 'a rate typed there — 5% — is a rule a founder has confirmed: it counts, at £300 for III кв., and card 15 is gone');
  await finish(pg);
  // Card 13: a row from before version 3 says nothing about what it is.
  const c13 = '#view-today .td-need .op[data-td-card="13"]';
  let P = await plan2();
  P.taxes.push(row('c', 'Corporation tax', 5500, '2026-11-01', { bank: 'Barclays', blk: 'tax' }));
  pg = await scene('card 13, by size', ledP(), P, { H: 60 });
  S = await holds(pg, 'a tax row from before the rules, near the VAT date at about its sum');
  same([S.fig('out'), await texts(pg, c13 + ' .op-name'), await texts(pg, c13 + ' .op-text'), await texts(pg, c13 + ' button')], [23900, ['Corporation tax · £5,500 · 1 ноя'], ['Это тот же счёт, что UK VAT за III кв. 2026, который страница посчитала сама, — £4,800? Пока считаю оба.'], ['Да, это он', 'Это часть', 'Нет, отдельный']],
    '«Corporation tax», a week before the VAT date at about its sum, is NOT read as the VAT: both count — OUT 23,900 — and card 13 asks');
  await pg.click(c13 + ' [data-ed-tax="of"][data-ed-v="own"]');
  S = await holds(pg, '[Нет, отдельный]');
  same([stored(S, 'c').of, S.fig('out'), card(S.M, 13).length], [false, 23900, 0], '[Нет, отдельный]: a bill of its own, said once — the card does not return');
  await finish(pg);
  P = await plan2();
  P.taxes.push(row('v', 'VAT Q3', 4500, '2026-11-07', { bank: 'Barclays', blk: 'tax' }));
  pg = await scene('card 13, by name', ledP(), P, { H: 60 });
  S = await holds(pg, 'a tax row from before the rules, named after one');
  same([S.fig('out'), await texts(pg, c13 + ' .op-text')], [18100, ['Похоже, это тот же счёт, что UK VAT за III кв. 2026, который страница посчитала сама, — £4,800. Пока считаю один раз — вашу строку.']], '«VAT Q3» is read by its name as the quarter\'s bill and counted once — OUT 18,100 — until a founder says');
  await pg.click(c13 + ' [data-ed-tax="of"][data-ed-v="whole"]');
  S = await holds(pg, '[Да, это он]');
  same([stored(S, 'v').of, S.fig('out'), card(S.M, 13).length, per(S.M, 'vat|2026Q3').row], [{ r: 'vat', p: '2026Q3' }, 18100, 0, 'v'], '[Да, это он]: the row IS that quarter\'s tax; the figures stay, and nothing is left to ask');
  await finish(pg);
});

// ---- what the first iteration's checks said of the plan's own save, of a page that can no longer save, of a box
// that must not be emptied and of a ledger that spells odd things — on a plan of written rows. The mechanics are
// that iteration's; where it had a forecast row filled in from history (h|…), a month of a row that repeats stands.

await run('saving', 'the plan\'s own save: one PUT per change with the revision before it, never over somebody else, never the ledger', async () => {
  serve(ledA(), planW({ inflows: [row('c', 'Client C', 2400, '2026-10-08', { vat: false })] }));
  const rev0 = store.cash.rev0;
  const p1 = await open('window 1', undefined, { quiet: /409/ });
  await p1.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(p1);
  const amt = box('inflows', 'c', 'amt');
  await p1.fill(amt, '100');
  await saved(p1);
  same([store.cash.bases, store.cash.rev - rev0, store.cash.doc.inflows[1].amt], [[rev0], 1, 100], 'a change typed into a row: one PUT, with the revision the plan was read at');
  await p1.fill(amt, '200');
  await saved(p1);
  same([store.cash.bases, store.cash.doc.inflows[1].amt], [[rev0, rev0 + 1], 200], 'the next change: one more, with the revision the first save gave back');
  await p1.fill(amt, '210');
  await p1.fill(amt, '220');
  await p1.fill(amt, '230');
  await saved(p1);
  same([store.cash.bases, store.cash.doc.inflows[1].amt], [[rev0, rev0 + 1, rev0 + 2], 230], 'three quick changes wait out the half second and go as one');
  await p1.click(cs('inflows', 'c') + ' [data-ed-do="paid"]');
  await saved(p1);
  const marked = !!store.cash.doc.inflows[1].paid;
  await p1.click(cs('inflows', 'c') + ' [data-ed-do="unpaid"]');
  await saved(p1);
  await p1.setChecked(box('inflows', 'rA@2026-10', 'on'), false);
  await saved(p1);
  same([store.cash.bases, marked, store.cash.doc.inflows.map((r) => [r.id, !!r.paid, r.on, JSON.stringify((r.rec || {}).x || null)].join(' ')), store.cash.doc.v, store.cash.doc.savedBy, store.led.puts], [[rev0, rev0 + 1, rev0 + 2, rev0 + 3, rev0 + 4, rev0 + 5], true, ['rA false true {"2026-10":{"off":true}}', 'c false true null'], 3, 'Mika', 0],
    'a mark, the mark taken back, a month\'s tick taken off: one PUT each, each on the revision before it — version 3, signed — and the ledger was not written once');
  await p1.reload();
  await p1.waitForSelector('#cs-plan');
  same([await p1.evaluate(() => [window.__cash.rev(), location.hash]), await puts('cash', 6)], [[rev0 + 6, '#cash'], 6], 'after a reload the page is on «Касса» again, the plan is there at the revision it was saved at, and reading it wrote nothing');
  // another founder's window saves; this one is then behind
  const p2 = await open('window 2', undefined, { quiet: /409/ });
  await p2.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(p2);
  await p1.fill(amt, '300');
  await saved(p1);
  await p2.fill(amt, '999');
  await p2.waitForSelector('#cs-stale');
  same([await text(p2, '#sync'), await p2.$eval('#sync', (e) => e.className), plain(await text(p2, '#cs-stale')).slice(0, 34), store.cash.bases.slice(-1)[0], store.cash.rev - rev0, store.cash.doc.inflows[1].amt, await p2.evaluate((s) => document.activeElement === document.querySelector(s), amt)], ['касса изменилась в другом окне — обновите страницу', 'sync bad', 'Касса изменилась в другом окне. То', rev0 + 6, 7, 300, true],
    'the second window is refused (409): the pill and the tab itself say so, the first window\'s £300 stands — and the cursor is still in the box that was being typed in');
  const n = store.cash.puts;
  await p2.fill(amt, '998');
  await p2.click(cs('inflows', 'rA@2026-10') + ' .cs-mo [data-ed-open]');
  await sleep(1100);
  same([store.cash.puts, store.cash.doc.inflows[1].amt, store.led.puts], [n, 300, 0], '… and it does not try again: no more PUTs from it, and none to the ledger');
  await p2.click('.nav [data-tab="today"]');
  same(await text(p2, '#view-today .banner b'), 'План изменился в другом окне.', '… «Сегодня» in that window says the same');
  // a save the server turns away for the session
  const p3 = await open('401 on save', undefined, { quiet: /401/ });
  await p3.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(p3);
  await p3.route('**/api/founder/money/cash', (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }) : r.continue()));
  await p3.fill(amt, '777');
  await p3.waitForFunction(() => /вход закончился/.test(document.querySelector('#sync').textContent));
  same(await text(p3, '#sync'), 'вход закончился — войдите заново и обновите страницу', 'a 401 on saving the plan is told the way the ledger tells it');
  for (const x of [p1, p2, p3]) await x.context().close();

  // a plan that does not load, and a stored document that is not a plan
  serve(ledA(), planW());
  store.cash.fail = true;
  const p4 = await browser.newContext({ viewport: { width: 1320, height: 900 } }).then((c) => c.newPage());
  await p4.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p4.goto(BASE + '/money/index.html#cash');
  await p4.waitForFunction(() => /не загрузился/.test(document.querySelector('#view-cash').textContent));
  same([await p4.$eval('#view-cash .empty', (e) => [e.querySelector('b').textContent, !!e.querySelector('a[data-cs-reload]')]), await p4.$$eval('#view-cash input, #view-cash [data-ed-add], #view-cash [data-cs-imp]', (l) => l.length), await text(p4, '#sync')], [['План кассы не загрузился', true], 0, 'сохранено'], 'a 500 on the plan: «Касса» says it did not load and offers nothing that could be typed into and saved over the real plan; the pill is the ledger\'s');
  await p4.click('.nav [data-tab="dashboard"]');
  ok((await p4.$$eval('#view-dashboard .kpi .val', (l) => l.length)) === 6, '… the other tabs carry on');
  await p4.click('.nav [data-tab="today"]');
  same(await text(p4, '#view-today .empty b'), 'План кассы не загрузился', '… and «Сегодня» says why it has nothing to show');
  await p4.click('.nav [data-tab="settings"]');
  same(await text(p4, '#ed-forecast'), 'План кассы не загрузился — обновите страницу.', '… and so does «Настройки → Прогноз», instead of «ещё загружается» for ever');
  store.cash.fail = false;
  await p4.click('.nav [data-tab="cash"]');
  await Promise.all([p4.waitForNavigation(), p4.click('#view-cash [data-cs-reload]')]);
  await p4.waitForSelector('#cs-plan');
  same([await p4.evaluate(() => location.hash), (await look(p4, 'cash')).P.banks[0].amt], ['#cash', 10120], '«Обновить страницу» reloads on the same tab and the plan is there');
  await p4.context().close();
  serve(ledA(), { v: 1, banks: 'oops', inflows: [] });
  const p5 = await browser.newContext({ viewport: { width: 1320, height: 900 } }).then((c) => c.newPage());
  await p5.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p5.goto(BASE + '/money/index.html#cash');
  await p5.waitForFunction(() => /не загрузился/.test(document.querySelector('#view-cash').textContent));
  same([/не читается как план\. Ничего не тронуто\./.test(await text(p5, '#view-cash .empty')), await p5.$$eval('#view-cash input', (l) => l.length), await puts('cash', 0)], [true, 0, 0], 'a stored document that is not a plan is not replaced by an empty one: the tab says it cannot read it, and saves nothing');
  await p5.context().close();
  // the address
  serve(demoLedger(T), demoPlan(T));
  const h1 = await open('#cash', undefined, { hash: '#cash' });
  await h1.waitForSelector('#cs-plan');
  const h2 = await open('#cash-days', undefined, { hash: '#cash-days' });
  await h2.waitForSelector('#cs-stmt');
  same([await h1.evaluate(() => [document.querySelector('.nav .active').dataset.tab, !!document.querySelector('#cs-plan')]), await h2.evaluate(() => [document.querySelector('.nav .active').dataset.tab, document.querySelector('#cs-cal').children.length > 7, location.hash])], [['cash', true], ['cash', true, '#cash-days']], '#cash in the address opens the tab on the month, #cash-days on the days');
  await h1.context().close();
  await h2.context().close();
  // «Загрузка» and «Таблица» left the bar and kept their addresses: each opens under «Настройки».
  const shown = (pg) => pg.evaluate(() => { const v = [...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden), on = v.length === 1 && v[0].querySelector('.set-nav [aria-pressed="true"]'); return [v.map((e) => e.id).join(), document.querySelector('.nav .active').dataset.tab, on ? on.dataset.tabgo : '', location.hash]; });
  const h3 = await open('#ledger', undefined, { hash: '#ledger' });
  const h4 = await open('#upload', undefined, { hash: '#upload' });
  await h3.waitForSelector('#view-ledger .set-nav');
  await h4.waitForSelector('#view-upload .set-nav');
  same([await shown(h3), await shown(h4)], [['view-ledger', 'settings', 'ledger', '#ledger'], ['view-upload', 'settings', 'upload', '#upload']], '#ledger and #upload in the address still open «Таблица» and «Загрузка выписок» — with «Настройки» lit, where they now live');
  await h3.context().close();
  await h4.context().close();
  // An empty studio: «Сегодня» and «Месяцы» send the founder to upload by a button — not by the name of a tab the bar
  // no longer has — and «Таблица», with no row in it yet, still begins with the switch.
  serve(ledger([]), null);
  const e0 = await open('an empty studio');
  await e0.click('#view-today .empty [data-tabgo="upload"]');
  const fromToday = await shown(e0);
  await e0.click('.nav [data-tab="dashboard"]');
  const months = await text(e0, '#view-dashboard .empty');
  await e0.click('#view-dashboard .empty [data-tabgo="upload"]');
  const fromMonths = await shown(e0);
  await e0.click('#view-upload .set-nav [data-tabgo="ledger"]');
  same([fromToday, fromMonths, /вкладк/i.test(months), await shown(e0), await text(e0, '#view-ledger .empty b')], [['view-upload', 'settings', 'upload', '#upload'], ['view-upload', 'settings', 'upload', '#upload'], false, ['view-ledger', 'settings', 'ledger', '#ledger'], 'В таблице пока нет строк'],
    'with nothing loaded «Загрузить выписки» on «Сегодня» and on «Месяцы» both open «Загрузка выписок»; «Месяцы» names no tab; an empty «Таблица» keeps the switch', months);
  await e0.context().close();
  // with no server at all the plan is kept in the browser, as version 3
  const lf = await browser.newContext({ viewport: { width: 1320, height: 900 } }).then((c) => c.newPage());
  lf.on('pageerror', (e) => errs.push(`file: PAGEERROR ${e.message}`));
  await lf.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await lf.goto('file://' + PUB + '/money/index.html#cash');
  await lf.waitForFunction(() => window.__cash && window.__cash.state());
  same([await lf.evaluate(() => window.__cash.home()), await lf.evaluate(() => window.__cash.state().banks.map((b) => b.bank + ' ' + b.cur + ' ' + b.amt)), await lf.$('#cs-accts input')], ['local', ['Wise GBP 0', 'Wise USD 0', 'Barclays GBP 0', 'Tochka RUB 0', 'Mosta USD 0'], null], 'opened as a file the page keeps the plan in the browser; a new plan names five accounts and waits for their balances');
  await lf.click('#cs-accts [data-ed-bal]');
  await lf.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '1234');
  await lf.click(K('bal') + '[data-ed-save]');
  same(await lf.evaluate(() => { const d = JSON.parse(localStorage.getItem('selfstudio-money-cash-v1')); return [d.v, d.banks[0].amt, typeof d.banks[0].asOf, 'fx' in d, 'horizon' in d, d.tax.rules.map((r) => r.id), typeof d.tax.since]; }), [3, 1234, 'string', false, false, ['vat', 'usn'], 'string'], 'a balance typed there is kept under selfstudio-money-cash-v1 as version 3 — with its day, the two tax rules and the day they began, and with no rates or horizon of its own');
  await lf.context().close();
});

await run('refused', 'a page whose save was refused stops answering «Сохранено»: every change says it was not kept', async () => {
  const LOST = 'Не сохранено: план изменился в другом окне — обновите страницу';
  serve(ledA(), planW({ team: [row('g', 'Person G', 1000, '2026-10-08')] }));
  const pg = await open('refused', undefined, { quiet: /409/ });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  await pg.click('#view-today [data-td-h="30"]');
  // Another founder saves the plan while this page is open.
  store.cash.doc = planW({ team: [row('g', 'Person G', 1000, '2026-10-08')], cushion: 9000 });
  store.cash.rev++;
  await editRow(pg, 'g', { amt: 1100 });
  same(await toastText(pg), 'Сохранено: Person G', 'the first change after it is answered «Сохранено» — the page does not know yet');
  await pg.waitForSelector('#view-today .banner');
  same([await toastText(pg), await text(pg, '#sync'), store.cash.doc.team[1].amt], [LOST, 'касса изменилась в другом окне — обновите страницу', 1000], '… and when the refusal comes back, that answer is replaced: «Не сохранено…»');
  const puts0 = store.cash.puts;
  // From here on nothing is changed, and each attempt says so at once.
  await openRow(pg, 'g');
  await fill(pg, 'row', { amt: 1200 });
  await pg.click(K('row') + '[data-ed-save]');
  same([await toastText(pg), (await look(pg)).P.team[1].amt, !!(await pg.$(K('row'))), await pg.inputValue(K('row') + '#ed-amt')], [LOST, 1100, true, '1200'], 'a row\'s card: «Сохранить» is refused in words, the plan on the page is not changed, and what was typed is left in the card');
  await pg.click(K('row') + '[data-ed-do="paid"]');
  same([await toastText(pg), (await look(pg)).P.team[1].paid], [LOST, undefined], '«Оплачено»: refused');
  await pg.click(K('row') + '[data-ed-do="part"]');
  same([await toastText(pg), await pg.$(PART), await pg.$(REST), (await look(pg)).P.team.length], [LOST, null, null, 2], '«Частично…»: refused before it asks anything — neither the sum nor the day — no mark, no row for the rest');
  await pg.click(K('row') + '[data-ed-x]');
  await pg.click('#view-today .td-kpi');
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '7777');
  await pg.click(K('bal') + '[data-ed-save]');
  same([await toastText(pg), (await look(pg)).P.banks[0].amt], [LOST, 10120], '«Вписать остаток»: refused');
  await pg.click(K('bal') + '[data-ed-x]');
  await pg.click('.nav [data-tab="settings"]');
  same(await text(pg, '#ed-forecast .banner b'), 'План изменился в другом окне.', '«Настройки → Прогноз» says it too');
  await pg.fill('#ed-forecast [data-ed-set="cushion"]', '100');
  await pg.press('#ed-forecast [data-ed-set="cushion"]', 'Tab');
  same([await toastText(pg), (await look(pg)).P.cushion, await pg.inputValue('#ed-forecast [data-ed-set="cushion"]')], [LOST, 5000, '5000'], '«Запас»: refused, and the box goes back to what the plan says');
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="vat"]');
  same([await toastText(pg), (await look(pg)).P.tax.cl], [LOST, {}], '«Настройки → Налоги», a client\'s mark: refused');
  await pg.fill('#ed-taxes .ed-rule[data-ed-rule="vat"] [data-ed-rv="rate"]', '25');
  await pg.press('#ed-taxes .ed-rule[data-ed-rule="vat"] [data-ed-rv="rate"]', 'Tab');
  await pg.click('#ed-taxes [data-ed-radd]');
  same([await toastText(pg), (await look(pg)).P.tax.rules.map((r) => r.rate)], [LOST, [20, 6]], '… a rule\'s rate, and «Добавить налог»: refused');
  await goCash(pg);
  await pg.fill(box('team', 'g', 'amt'), '1300');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[1].amt, await pg.inputValue(box('team', 'g', 'amt'))], [LOST, 1100, '1100'], '«Касса», a keystroke in a row: refused, the box shows the plan\'s figure again');
  await pg.click(cs('team', 'g') + ' [data-cs-f="on"]');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[1].on, await pg.isChecked(cs('team', 'g') + ' [data-cs-f="on"]')], [LOST, true, true], '… its tick: refused, and ticked again');
  await pg.click(cs('team', 'g') + ' [data-cs-f="rec"]');
  same([await toastText(pg), 'rec' in (await look(pg, 'cash')).P.team[1], await pg.isChecked(cs('team', 'g') + ' [data-cs-f="rec"]')], [LOST, false, false], '… «каждый месяц»: refused, and unticked again');
  await pg.click('#cs-plan [data-cs-helper]');
  same([await toastText(pg), await pg.$('#cs-helper [data-cs-hadd]:not([disabled])')], [LOST, null], '… the helper opens to be read, and can add nothing');
  await pg.click('#cs-helper [data-cs-hx]');
  await pg.click('#cs-undo [data-cs-undo]');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[1].amt], [LOST, 1100], '… «Отменить»: refused');
  await sleep(700);
  same([store.cash.puts, store.cash.doc.cushion, store.cash.doc.team[1].amt], [puts0, 9000, 1000], 'none of it was sent, and the other founder\'s plan is as they saved it');
  await pg.context().close();

  // The one-time upgrade. Two founders open the old plan at once; this page's line is slow, and its founder unticks
  // a row while the upgrade is on its way. The upgrade is refused — the other page got there first — and this is no
  // longer "nothing was typed": it is said, not swallowed.
  const v1 = { v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }], inflows: [], team: [{ id: 'r2', name: 'Person G', amt: 1000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-08' }], taxes: [], other: [] };
  serve(ledA(), v1);
  store.cash.clash = await up(v1, ledA());
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 900 } });
  const slow = await ctx.newPage();
  slow.on('pageerror', (e) => errs.push(`upgrade race: PAGEERROR ${e.message}`));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('**/api/founder/money/cash', async (r) => { if (r.request().method() === 'PUT') await sleep(2500); await r.continue(); });
  await slow.clock.install({ time: new Date('2026-10-06T12:00:00+01:00') });
  await slow.goto(BASE + '/money/index.html#cash');
  await slow.waitForSelector('#cs-plan tr[data-cs-id] [data-cs-f="on"]');
  const rid = await slow.evaluate(() => window.__cash.state().team[0].id);
  await slow.click(cs('team', rid) + ' [data-cs-f="on"]');
  same(await slow.evaluate(() => window.__cash.state().team[0].on), false, 'the old plan, a slow line: a row is unticked while the upgrade is still on its way');
  await slow.waitForFunction(() => /обновите страницу/.test(document.querySelector('#sync').textContent), null, { timeout: 12000 });
  same([await toastText(slow), await slow.evaluate(() => window.__cash.state().team[0].on), store.cash.doc.team[0].on, !!(await slow.$('#cs-stale'))], [LOST, false, true, true], '… the upgrade is refused, and the page says the change was not kept instead of quietly putting the tick back under «сохранено»');
  await ctx.close();
});

await run('empty amount', 'the amount of a month of a row that repeats can be corrected, never emptied: an empty box stores nothing', async () => {
  const pg = await scene('empty amount', ledA(), planW());
  await goCash(pg);
  const id = 'rB@2026-10';
  let S = await holds(pg, 'the month', 'cash');
  const out = S.fig('out');
  for (const v of ['', '0']) {
    await pg.fill(box('team', id, 'amt'), v);
    S = await look(pg, 'cash');
    same([S.P.team[0].rec, S.M.OUT, item(S.M, id).state], [{ day: 20, from: '2026-10' }, out, 'due'], `the box of Person B's October ${v === '' ? 'emptied' : 'set to 0'}: nothing is written, «Уйдёт» has not moved`);
    await leave(pg);
    same([await pg.inputValue(box('team', id, 'amt')), /Сумму не убрал/.test(await toastText(pg)), 'x' in (await look(pg, 'cash')).P.team[0].rec], ['6000', true, false], '… and when the cursor leaves, the figure is back and the page says how to take a month off instead');
  }
  same(await puts('cash', 0), 0, '… nothing was saved');
  // Emptied on the way to a new figure, it is simply the new figure.
  await pg.fill(box('team', id, 'amt'), '');
  await pg.type(box('team', id, 'amt'), '5500');
  await leave(pg);
  S = await holds(pg, '5,500 typed over it', 'cash');
  same([S.P.team.map((r) => [r.id, r.amt, r.rec.x]), S.fig('out')], [[['rB', 6000, { '2026-10': { amt: 5500 } }]], out - 500], 'select, delete, type 5500: October alone is 5,500 — the row is still 6,000 a month');
  // … and that month cannot be emptied either.
  await pg.fill(box('team', id, 'amt'), '');
  await leave(pg);
  same([(await look(pg, 'cash')).P.team[0].rec.x['2026-10'].amt, await pg.inputValue(box('team', id, 'amt'))], [5500, '5500'], 'emptied again: it stays 5,500');
  // The same on the row's card.
  await pg.click('.nav [data-tab="today"]');
  await openRow(pg, 'rA@2026-10');
  await fill(pg, 'row', { amt: 0 });
  await pg.click(K('row') + '[data-ed-save]');
  same([/Сумму не убрал/.test(await toastText(pg)), 'x' in (await look(pg)).P.inflows[0].rec, !!(await pg.$(K('row')))], [true, false, true], 'the card refuses a month of 0 the same way, and stays open');
  await finish(pg);
});

await run('odd ledger', 'a label «constructor», a bank nobody has, a currency without a rate: the page still draws', async () => {
  const L = ledA({ tx: [filed('c1', '2026-10-02', -49, 'fixed', 'Constructor'), filed('c2', '2026-10-02', 900, 'rev', '__proto__'), filed('c3', '2026-10-02', -5, 'other', 'toString', { b: 'constructor' }), { ...filed('chf', '2026-10-02', -300, 'other', 'Swiss thing'), o: { a: -300, cur: 'CHF', t: 'Swiss thing' } }] });
  L.aliases = { 'old name': 'New Name' };
  let M = await C(L, planW({ other: [row('x', 'Old Name', 10, '2026-10-20')] }));
  same([M.accounts.map((a) => a.key).sort(), M.missing, acct(M, 'Wise|GBP').after, M.items.every((it) => typeof it.name === 'string' && typeof it.label === 'string')], [['Wise|GBP', 'constructor|GBP'], ['constructor|GBP'], -120 - 49 + 900 - 300, true],
    'the model: labels are text whatever they spell, the franc row is read as pounds on the Wise pound account — no «Wise CHF» that nobody can type — and only the bank that really has no balance is asked for');
  const pg = await scene('odd ledger', L, planW());
  same([(await look(pg)).M.verdict.id, await pg.$$eval('#view-today .td-row', (l) => l.some((e) => /native code|\[object/.test(e.textContent)))], ['v0', false], '«Сегодня» draws');
  await goCash(pg);
  same([await pg.$$eval('#cs-plan tr[data-cs-id]', (l) => l.length >= 2), /native code|\[object/.test(await text(pg, '#view-cash'))], [true, false], '«Касса» draws its month');
  await pg.click('.nav [data-tab="dashboard"]');
  await pg.context().close();
});

await run('old plan', 'the one way in for the old planner\'s plan: wrapped or bare, made version 3, never over rows without asking', async () => {
  serve(ledA(), {});
  const pg = await open('old plan in');
  await pg.waitForSelector('#view-today');
  await goCash(pg);
  same([await pg.$$eval('#view-cash [data-cs-data], #view-cash #cs-data, #view-cash [data-cs-export]', (l) => l.length), await pg.$eval('#cs-old', (e) => e.open), await text(pg, '#cs-old summary'), await pg.evaluate(() => /скопировать/i.test(document.body.textContent))], [0, false, 'Загрузить план из старой Кассы', false],
    'the «Данные» panel, its export and its copy buttons are gone; one quiet line at the foot of «План» is left, closed until asked for — and no element on the page says «Скопировать»');
  await pg.click('#cs-old summary');
  const out = () => pg.$eval('#cs-imp-out', (e) => [...e.querySelectorAll('p, span, button')].filter((x) => !x.querySelector('button')).map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' '));
  for (const [junk, why] of [['hello', 'Это не похоже на план старой Кассы — проверьте, что текст взят целиком.'], ['{"foo":1}', 'В этих данных нет счетов и курсов — это не план старой Кассы.'], [JSON.stringify(ledA()), 'В этих данных нет счетов и курсов — это не план старой Кассы.'], ['{"fx":{},"banks":"x"}', 'В этих данных нет счетов и курсов — это не план старой Кассы.'], ['[1,2]', 'В этих данных нет счетов и курсов — это не план старой Кассы.'], ['', 'Сначала вставьте текст в поле.']]) {
    await pg.fill('#cs-imp-text', junk);
    await pg.click('#cs-old [data-cs-imp]');
    same([await out(), await pg.$eval('#cs-imp-text', (e) => e.value)], [why, junk], `refused, and what was pasted is left in the field: ${junk.slice(0, 22) || '(nothing)'} → ${why.slice(0, 40)}…`);
  }
  same([(await look(pg, 'cash')).P.inflows.length, await puts('cash', 0)], [0, 0], 'none of that touched the plan');
  // The old artifact's export: wrapped, with the bank it called «Другой», its own timestamp, an old «оплачено» tag,
  // a paid row with the note of the balance it moved, a broken date and a year typed as 2062.
  const R = (id, name, amt, cur, bank, date, more = {}) => ({ id, name, amt, cur, bank, on: true, tag: '', info: false, date: date || '', ...more });
  const oldPlan = () => ({ cushion: 4000, horizon: '2026-11-10', fx: { USD: 1.25, RUB: 100, EUR: 1.2, AMD: 500 }, _savedAt: 1755000000000, deadline: '2026-09-01',
    banks: [R('r1', 'Wise — GBP', 3000, 'GBP', 'Wise'), R('r2', 'Другой счёт', 700, 'GBP', 'Другой')],
    inflows: [R('r3', 'Client A', 4000, 'GBP', 'Wise', '2026-10-16', { tag: 'нужен PO' })],
    team: [R('r4', 'Person A', 3500, 'GBP', 'Wise', '2026-10-09', { tag: 'оплачено' }), R('r5', 'Person B', 3750, 'USD', 'Другой', '2026-10-02', { paid: true, paidAdj: { bank: 'Wise', cur: 'USD', delta: -3750 } })],
    taxes: [R('r6', 'VAT', 6000, 'GBP', 'Wise', 'not a date')], other: [R('r7', 'Typo in the year', 10, 'GBP', 'Wise', '2062-01-01'), R('r7', 'Subscriptions', 500, 'GBP', 'Wise', '')] });
  const wrapped = JSON.stringify({ app: 'selfstudio-cash', version: 3, exported: '2026-08-14T09:00:00.000Z', data: oldPlan() });
  await pg.fill('#cs-imp-text', wrapped);
  await pg.click('#cs-old [data-cs-imp]');
  let S = await holds(pg, 'the wrapped export, onto an empty plan', 'cash');
  const all = ['banks', ...LISTS].flatMap((k) => S.P[k]);
  same([S.P.v, S.P.cushion, S.P.banks.map((b) => [b.bank, b.amt, b.legacy, 'asOf' in b].join(' ')), all.some((r) => /^r\d+$/.test(r.id)), new Set(all.map((r) => r.id)).size, S.P.team.map((r) => [r.tag, r.bank, JSON.stringify(r.paid || null), 'paidAdj' in r, r.c0, r.sure, r.blk].join(' ')), S.P.taxes[0].date, S.P.other.map((r) => r.date), S.P.inflows[0].tag, 'deadline' in S.P, '_savedAt' in S.P, S.M.verdict.id],
    [3, 4000, ['Wise 3000 true false', 'Barclays 700 true false'], false, 8, [' Wise null false 0  cogs', ' Barclays {"on":"","legacy":true} false 0  cogs'], '', ['', ''], 'нужен PO', false, false, 'v0'],
    'onto an empty plan a wrapped export goes straight in, as version 3: ids that last (two rows shared one), balances waiting to be confirmed, «Другой» → Barclays, the old «оплачено» tag dropped, a paid row as an old mark without its balance note, a broken date and a year 2062 as «без даты» — and the page asks for the balances before it gives a total');
  same([await toastText(pg), await out(), await pg.$eval('#cs-imp-text', (e) => e.value), await text(pg, '#cs-undo span')], ['План загружен — счетов: 2, строк: 6 (поступления 1 · команда 2 · налоги 1 · прочее 2)', '', '', 'Последнее изменение: загрузка плана из старой Кассы'], '… it says what came, clears the field, and can be undone');
  same([await saved(pg), store.cash.puts, store.cash.doc.v, '_savedAt' in store.cash.doc, store.cash.doc.tax.rules.map((r) => r.id), store.cash.doc.inflows[0].vat, store.led.puts], [true, 1, 3, false, ['vat', 'usn'], false, 0], '… one save, without the artifact\'s private fields — and with what version 3 adds: the two tax rules, and on every inflow whether its invoice carries VAT');
  same([await csRow(pg, 'team', S.P.team[1].id), (await listed(pg, 'other')).length, (await listed(pg, 'taxes')).length], ['cs-done | line-through | no tick | Person B | 3,750 | USD | 2 окт | Barclays | отмечено в старой Кассе | оплачено ✓', 2, 1], '… its rows stand in October: dated ones by their date, the ones without a date in the running month');
  // now the plan has rows: a second one must ask — the bare shape, opened as a file
  const bare = { cushion: 5000, horizon: '2026-11-10', fx: { USD: 1.25, RUB: 100, EUR: 1.2, AMD: 500 }, banks: [R('r1', 'Wise — GBP', 1000, 'GBP', 'Wise')], inflows: [R('r2', 'Client Z', 5000, 'GBP', 'Wise', '2026-10-16')], team: [R('r3', 'Person X', 3000, 'GBP', 'Wise', '2026-10-08')], taxes: [], other: [] };
  await pg.setInputFiles('#cs-imp-file', { name: 'kassa-selfstudio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bare)) });
  await pg.waitForSelector('#cs-imp-out .banner');
  same([await out(), (await look(pg, 'cash')).P.banks.length, await puts('cash', 1)], ['В плане из старой Кассы — счетов: 1, строк: 2 (поступления 1 · команда 1 · налоги 0 · прочее 0). Сейчас здесь — счетов: 2, строк: 6 (поступления 1 · команда 2 · налоги 1 · прочее 2). Заменить план этими данными? Не надо Заменить', 2, 1],
    'a bare plan from a file, onto a plan with rows: it shows both, asks, and has replaced nothing yet');
  await pg.click('#cs-imp-out [data-cs-impno]');
  same([await out(), (await look(pg, 'cash')).P.banks.length], ['', 2], '«Не надо» leaves the plan as it was');
  await pg.setInputFiles('#cs-imp-file', { name: 'kassa-selfstudio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bare)) });
  await pg.waitForSelector('#cs-imp-out .banner');
  await pg.click('#cs-imp-out [data-cs-impyes]');
  S = await holds(pg, 'the bare plan in its place', 'cash');
  same([S.P.v, S.P.banks.map((b) => [b.amt, b.legacy].join(' ')), S.P.team.map((r) => r.name), S.P.team.some((r) => /^r\d+$/.test(r.id)), await listed(pg, 'team')], [3, ['1000 true'], ['Person X'], false, [S.P.team[0].id]], '«Заменить» replaces it — again as version 3 — and the month shows its rows and nothing else: the page fills nothing in');
  await pg.click('#cs-undo [data-cs-undo]');
  S = await holds(pg, 'the replacement undone', 'cash');
  same([S.P.banks.length, S.P.team.length, await toastText(pg)], [2, 2, 'Отменено: загрузка плана из старой Кассы'], '«Отменить» brings the previous plan back');
  // a pasted export onto rows asks too, and gives the day it was exported
  await pg.fill('#cs-imp-text', wrapped);
  await pg.click('#cs-old [data-cs-imp]');
  ok(/, сохранён 2026-08-14\. Сейчас здесь/.test(await out()), 'a pasted export onto a plan with rows asks too, and gives the day it was saved', await out());
  await calm(pg, 'with «Загрузить план из старой Кассы» open and asking', 'cash');
  await pg.click('#cs-imp-out [data-cs-impno]');
  await finish(pg);
});

await run('typing', 'a row is typed into where it stands: the box stays under the cursor, the figures follow, the row moves when the cursor leaves', async () => {
  const P0 = planW({ inflows: [row('c', 'Client C', 2400, '2026-10-08', { vat: false }), row('k', 'Client K', 500, '2026-10-09', { vat: false })] });
  const ix = (S, id) => S.P.inflows.find((r) => r.id === id);
  const pg = await scene('typing', ledA(), P0, { H: 60 });
  await goCash(pg);
  let S = await holds(pg, 'before typing', 'cash');
  const in0 = S.fig('in');
  // a digit at a time
  const amt = box('inflows', 'c', 'amt');
  await pg.$eval(amt, (e) => { e.__mark = 1; });
  await pg.click(amt);
  await pg.keyboard.press('End');
  await pg.keyboard.type('0');
  S = await holds(pg, 'one digit typed', 'cash');
  same([await pg.evaluate((s) => { const e = document.querySelector(s); return [e.__mark, document.activeElement === e, e.value]; }, amt), ix(S, 'c').amt, S.fig('in'), S.fig('mon.inflows.exp'), ix(S, 'c').m.by], [[1, true, '24000'], 24000, in0 + 21600, 8000 + 24000 + 500, 'Mika'],
    'a digit typed into an amount leaves the same box under the cursor; the row, the list\'s total and «Придёт» follow the keystroke');
  await pg.keyboard.press('Backspace');
  S = await holds(pg, 'the digit taken back', 'cash');
  same([ix(S, 'c').amt, S.fig('in'), await text(pg, '#cs-undo span')], [2400, in0, 'Последнее изменение: Client C: правка'], '… taken back, so do they; and the strip under the tabs offers «Отменить» for the row\'s edit — one copy of the plan for the whole visit to the row');
  same(await pg.evaluate(() => window.__cash.state().inflows.length), 3, '… (nothing was added by typing)');
  // a name the table knows ties the row to that client — and adds to his row that repeats; nothing is taken out of it
  const name = box('inflows', 'c', 'name');
  await pg.$eval(name, (e) => { e.__mark = 2; });
  await pg.fill(name, 'Client A');
  S = await holds(pg, 'renamed to a client the table knows', 'cash');
  same([ix(S, 'c').sk, ix(S, 'c').skBy, await pg.evaluate((s) => { const e = document.querySelector(s); return [e.__mark, document.activeElement === e]; }, name), (await csRow(pg, 'inflows', 'rA@2026-10')).split(' | ')[4], S.fig('in'), item(S.M, 'c').label],
    ['rev|client a', 'hand', [2, true], '8000', in0, 'Client A'], 'the row renamed «Client A» is tied to that client while the name is still being typed; his row «каждый месяц» stays 8,000 beside it — a one-off row adds, it is taken out of nothing');
  await pg.fill(name, 'Client C');
  S = await holds(pg, 'renamed back', 'cash');
  same(['sk' in ix(S, 'c'), S.fig('in')], [false, in0], '… renamed back, the tie is gone');
  // a date in another month: the row stays put while the cursor is in it, then goes
  const date = box('inflows', 'c', 'date');
  await pg.fill(date, '2026-11-10');
  S = await holds(pg, 'a November date typed, cursor still in the row', 'cash');
  same([await listed(pg, 'inflows'), item(S.M, 'c').ym, S.fig('mon.inflows.exp'), await pg.evaluate((s) => document.activeElement === document.querySelector(s), date)], [['c', 'k', 'rA@2026-10'], '2026-11', 8500, true], 'a date in November typed into an October row: October\'s total lets go of it at once, but the row stays under the cursor');
  await leave(pg);
  same([await listed(pg, 'inflows'), await toastText(pg), await monthAt(pg)], [['k', 'rA@2026-10'], '«Client C» теперь в плане на ноябрь 2026 — по дате', '2026-10'], '… when the cursor leaves, the row goes to November and the page says where it went');
  await toMonth(pg, '2026-11');
  same(await listed(pg, 'inflows'), ['c', 'rA@2026-11'], '… and there it is, on the 10th, before Client A');
  // within a month a new date re-sorts on leaving, and a tab to the next row keeps the cursor there
  await toMonth(pg, '2026-10');
  await pg.fill(box('inflows', 'k', 'date'), '2026-10-30');
  same(await listed(pg, 'inflows'), ['k', 'rA@2026-10'], 'a later date within the month does not pull the row from under the cursor either');
  await pg.focus(box('inflows', 'rA@2026-10', 'amt'));
  await sleep(80);
  same([await listed(pg, 'inflows'), await pg.evaluate(() => { const a = document.activeElement; return [a.dataset.csF, a.closest('tr').dataset.csId]; })], [['rA@2026-10', 'k'], ['amt', 'rA@2026-10']], '… on leaving it is sorted after the 28th, and the cursor is in the box it moved to');
  // a slip of the finger in the year
  await pg.fill(box('inflows', 'k', 'date'), '2062-01-01');
  same([(await look(pg, 'cash')).P.inflows.find((r) => r.id === 'k').date, await toastText(pg)], ['2026-10-30', 'Слишком далёкая дата: касса считает не дальше двух лет вперёд'], 'a year typed as 2062 is turned away in words and the row keeps its date');
  await leave(pg);
  same(await pg.$eval(box('inflows', 'k', 'date'), (e) => e.value), '2026-10-30', '… which its box shows again once the cursor has left');
  // … and a year half typed is waited out: «0002», «0020», «0202» are what the box holds on the way to «2026»
  for (const half of ['0002-10-30', '0020-10-30', '0202-10-30']) await pg.fill(box('inflows', 'k', 'date'), half);
  same([(await look(pg, 'cash')).P.inflows.find((r) => r.id === 'k').date, await monthAt(pg), (await look(pg, 'cash')).M.months.list.some((m) => m < '2026')], ['2026-10-30', '2026-10', false], 'a year half typed changes nothing and says nothing: the row keeps its date, no month of the year 2 appears');
  await leave(pg);
  // an amount cleared is no amount, not a deleted row
  await pg.fill(box('inflows', 'k', 'amt'), '');
  S = await holds(pg, 'an amount cleared', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').amt, item(S.M, 'k').state, (await csRow(pg, 'inflows', 'k')).split(' | ').pop()], [0, 'empty', ''], 'an amount cleared leaves the row with no amount: in no total, and with nothing to mark');
  await pg.fill(box('inflows', 'k', 'amt'), '500');
  // the currency and the bank are typed the same way; the pounds stand beside a sum in another currency
  await pg.selectOption(box('inflows', 'k', 'cur'), 'USD');
  S = await holds(pg, 'dollars', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').cur, await text(pg, cs('inflows', 'k') + ' [data-cs-gbp]'), item(S.M, 'k').cash], ['USD', '£370', 370.37], '$500 is £370 at the table\'s own rate, and says so beside the sum');
  // Enter leaves the box; the row's «ещё» opens its card under it, one at a time, and typing in a row closes it
  await pg.focus(box('inflows', 'k', 'amt'));
  await pg.keyboard.press('Enter');
  same(await pg.evaluate(() => document.activeElement.tagName), 'BODY', 'Enter in a box leaves it');
  await pg.click(cs('inflows', 'k') + ' .cs-mo [data-ed-open]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.$eval(cs('inflows', 'k') + ' + tr', (e) => [e.className, !!e.querySelector('[data-ed-card="row"]')].join(' ')), await texts(pg, K('row') + '.ed-foot button')], [1, 'cs-edrow true', ['Получено', 'Частично…', 'Удалить', 'Закрыть', 'Сохранить']], '«ещё» opens the row\'s card right under it: where it came from, «+ VAT», «каждый месяц», «Частично…», «Удалить»');
  await calm(pg, 'with a row\'s card open', 'cash');
  await pg.setChecked(K('row') + '[data-ed-f="vat"]', true);
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, '«+ VAT 20%» from the card', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').vat, await text(pg, cs('inflows', 'k') + ' [data-cs-gbp]'), await pg.$('[data-ed-card]')], [true, '£444с VAT', null], '«+ VAT 20%» ticked there and saved: $600 is £444 — the cell «в £» says «с VAT» under the figure — and the card is closed');
  await pg.click(cs('inflows', 'k') + ' .cs-mo [data-ed-open]');
  await pg.focus(box('inflows', 'rA@2026-10', 'amt'));
  await sleep(60);
  same([await pg.$('[data-ed-card]'), await pg.evaluate(() => document.activeElement.dataset.csF)], [null, 'amt'], 'a cursor put into a row closes a card left open elsewhere, and stays where it was put');
  // «Отменить» takes back the last visit to a row
  const was = (await look(pg, 'cash')).P.inflows.find((r) => r.id === 'k');
  await pg.fill(box('inflows', 'k', 'amt'), '9');
  await leave(pg);
  await pg.click('#cs-undo [data-cs-undo]');
  S = await holds(pg, '«Отменить»', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k'), await toastText(pg)], [was, 'Отменено: Client K: правка'], '«Отменить» in the strip restores the row as it was before that visit');
  ok((await saved(pg)) && store.led.puts === 0, 'all of it went to the plan\'s own document; the ledger was never written');
  await finish(pg);

});

await run('earlier months', 'a row nobody closed stays in the month of its date; a month of a row that repeats is typed into for that month alone', async () => {
  const pm = await scene('monthly rows', ledA(), planW({ inflows: [row('late', 'Client E', 4000, '2026-09-22', { vat: false })], other: [every('rent', 'Studio rent', 900, 15, '2026-10')] }), { H: 60 });
  await goCash(pm);
  same([plain(await text(pm, '#cs-back')), await listed(pm, 'inflows')], ['В прошлых месяцах не закрыто: 1 строка на £4,000. Сентябрь 2026', ['rA@2026-10']], 'an invoice typed for 22 Sep and never paid is September\'s row; October says that an earlier month still holds one, and how much');
  await pm.click('#cs-back [data-cs-mon]');
  same([await monthAt(pm), await csRow(pm, 'inflows', 'late'), await pm.$('#cs-back'), plain(await text(pm, '#cs-past'))], ['2026-09', 'typed | none | on | Client E | 4000 | GBP | 2026-09-22 | Wise | просрочено 13 дн. | ✓ полученочастично', null, 'Здесь — только строки плана за этот месяц. Всё, что прошло по выпискам, — в «Месяцах».'], '… and its button opens September, where the row says how late it is — and the page says a month gone by is the plan\'s page of it, not the month\'s accounts');
  await toMonth(pm, '2026-11');
  const rentNov = 'rent@2026-11';
  same(await csRow(pm, 'other', rentNov), 'typed | none | on | Studio rent | 900 | GBP | 2026-11-15 | Wise |  | ✓ оплаченочастично', 'November holds the month of a «каждый месяц» row: exact, in full ink, its name not typed over, its tick in the column «каждый месяц»');
  await pm.fill(box('other', rentNov, 'amt'), '950');
  let S = await holds(pm, 'one month of a row that repeats typed over', 'cash');
  same([S.P.other.filter((r) => r.id === 'rent').map((r) => [r.amt, JSON.stringify(r.rec)].join(' ')), item(S.M, 'rent@2026-12').cash, item(S.M, rentNov).cash], [['900 {"day":15,"from":"2026-10","x":{"2026-11":{"amt":950}}}'], -900, -950], '£950 typed into November\'s writes that one month down as the row\'s exception; the row and December keep £900');
  await finish(pm);
});

// ---- how it looks ----
// With SHOTS set to a folder, full-page pictures of the main states are saved there, for looking at: the fabricated
// studio on «Сегодня», in the monthly constructor and day by day, on a desk and on a phone; a row's card on the
// question «Частично…» — the page it stands in, and the card alone, close up, on «Сегодня» and inside the table of
// «Касса»; «Настройки → Налоги»; and day one — a ledger loaded and nothing typed («looks», at the end). The review's
// checks, which come first, save a picture of each thing they changed («rv-…»). Without SHOTS the same pages are
// still opened and held to the model.
const SHOTS = process.env.SHOTS || '';
const shot = async (pg, name, clip) => { if (SHOTS) { await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, ...(clip ? { clip } : {}) }); console.log(`      saved ${name}.png`); } };
// … and of one thing on a page, close up: a card is a small part of a long page. It is cut out of the picture of
// the whole page — taken where it stands on a phone, the bar that sticks to the top lies over a card as tall as the screen.
const shotOf = async (pg, sel, name) => { if (SHOTS) { await pg.evaluate(() => window.scrollTo(0, 0)); await shot(pg, name, await pg.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width) + 1, height: Math.ceil(r.height) + 1 }; })); } };
// =====================================================================================================================
// THE REVIEW OF THE SECOND ITERATION, ON SCREEN. Each of these failed on the build that was reviewed (the model's
// side of the same review is «rv-thin», «rv-inbox», «rv-rows» above, and the cases added to «marks», «p8», «p12»).
// =====================================================================================================================
const reopen = async (name, at) => { const pg = await open(name, at); await pg.waitForSelector('#view-today [data-live="verdict"]'); return pg; };

await run('rv-save', 'what a founder decided is still there when the page is opened again: the rest «Частично» left and the day he named for it, the setting about old balances, every field a row may carry', async () => {
  const at = '2026-10-26T12:00:00+01:00';
  const P0 = planP({ banks: BALS('2026-10-25'), team: [every('rG', 'Person G', 9000, 24, '2026-10')] });
  const pg = await scene('carry', ledP(), P0, { H: 60, at });
  await openRow(pg, 'rG@2026-10');
  await pg.click(K('row') + '[data-ed-do="part"]');
  await answer(pg, 1000, '2026-11-14');
  let S = await holds(pg, '«Частично»: 1,000 of 9,000, the rest on 14 Nov');
  const debt = S.P.team.find((r) => r.carry);
  const fig = (X) => [item(X.M, debt.id).state, item(X.M, debt.id).day, item(X.M, debt.id).cash, X.M.OUT, X.M.END, X.M.free.now, X.M.undated.n];
  const before = fig(S);
  same(before, ['due', '2026-11-14', -8000, 30800, 200, 0, 0], '«Частично» 1,000 of 9,000, the rest on 14 Nov: the 8,000 is planned on the day the founder named — «Уйдёт» 30,800, the end of the sixty days 200, nothing to withdraw');
  await finish(pg);
  const kept = (r) => [r.date, 'mon' in r, r.carry];
  same([kept(store.cash.doc.team.find((r) => r.id === debt.id)), store.cash.doc.v, store.cash.puts], [['2026-11-14', false, { ym: '2026-10' }], 3, 1], 'the saved plan holds the row with its day and its `carry` — in one save, as version 3');
  let again = await reopen('the rest, opened again', at);
  S = await holds(again, 'the page opened again');
  same([fig(S), kept(stored(S, debt.id)), store.cash.puts], [before, ['2026-11-14', false, { ym: '2026-10' }], 1], 'opened again: the rest still stands on 14 Nov — «Уйдёт», the end of the line and «Можно вывести» are what they were, and opening wrote nothing');
  await again.click('.nav [data-tab="settings"]');
  await again.fill('#ed-forecast [data-ed-set="cushion"]', '6000');
  await again.press('#ed-forecast [data-ed-set="cushion"]', 'Enter');
  await saved(again);
  same([store.cash.doc.cushion, kept(store.cash.doc.team.find((r) => r.id === debt.id))], [6000, ['2026-11-14', false, { ym: '2026-10' }]], '… and another change saved from the reopened page keeps both on the server');
  // «Не называть сумму вывода, если остатки старше … дней» is a change like any other: it is sent, and it is read.
  const n0 = store.cash.puts;
  await again.uncheck('#ed-forecast [data-ed-set="fresh"]');
  const n1 = await puts('cash', n0 + 1);
  same([n1 - n0, store.cash.doc.fresh, await toastText(again)], [1, { on: false, days: 8 }, 'Сохранено: сумму вывода называю всегда, с датой остатков'], 'the setting switched off: one PUT, and the stored plan holds fresh {on:false, days:8}');
  await finish(again);
  again = await reopen('the setting, opened again', at);
  await again.click('.nav [data-tab="settings"]');
  same([await again.isChecked('#ed-forecast [data-ed-set="fresh"]'), await again.evaluate(() => window.__money.model().fresh)], [false, { on: false, days: 8 }], 'opened again: the tick is off, and the engine reads it');
  await again.context().close();
  serve(ledP(), { ...P0, fresh: { on: false, days: 20 } });
  again = await reopen('a stored setting', at);
  same(await again.evaluate(() => [window.__money.model().fresh, window.__cash.state().fresh]), [{ on: false, days: 20 }, { on: false, days: 20 }], 'a stored plan that holds fresh {on:false, days:20} is read as that, not as on and 8');
  await again.context().close();
  // Every field the engine documents for a row and for the plan comes through the page's own way in.
  const full = plan3({
    banks: BALS(), fresh: { on: true, days: 12 },
    inflows: [row('i1', 'Client A', 100, '2026-10-20', { vat: true, sk: 'rev|client a', skBy: 'hand', blk: 'rev', tx: ['x1'], notx: ['x2'], closed: true, fixed: true, paid: paid(T), rec: { day: 20, from: '2026-10', to: '2026-12', chain: 'i0', x: { '2026-11': { amt: 90, date: '2026-11-21', off: true, paid: paid(T), tx: ['x3'], notx: ['x4'], closed: true } } } })],
    team: [row('t1', 'Person B — остаток с сентября', 50, '', { mon: '2026-10', carry: { ym: '2026-09' }, blk: 'cogs' }), row('t2', 'Person B — остаток с октября', 60, '2026-11-12', { carry: { ym: '2026-10' }, blk: 'cogs' })],
    taxes: [row('x1', 'VAT Q3', 10, '2026-11-07', { of: { r: 'vat', p: '2026Q3', part: true }, blk: 'tax' }), row('x2', 'Corp', 10, '2026-11-01', { of: false, blk: 'tax' })],
    div: [row('d1', 'HMRC Mika', 10, '2026-10-21', { ptax: true, f: 'mika', blk: 'div' })],
    tax: { since: T, rules: [VAT(), USN()], cl: { 'client a': 'vat' }, per: { 'vat|2026Q3': { amt: 4000, date: '2026-11-08', paid: paid(T), tx: ['p1'], notx: ['p2'], m: { t: TAP, by: BY } } } },
  });
  serve(ledP(), full);
  again = await reopen('every field');
  const got = await again.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state())));
  const lost = [];
  const walk = (a, b, path) => { if (a && typeof a === 'object') { if (!b || typeof b !== 'object') return void lost.push(path); Object.keys(a).forEach((k) => walk(a[k], b[k], path + '.' + k)); } else if (a !== b && !(path.endsWith('.log') || path.endsWith('.info') || path.endsWith('.tag'))) lost.push(path + ' = ' + JSON.stringify(a)); };
  ['banks', 'inflows', 'team', 'taxes', 'other', 'div', 'tax', 'fresh', 'cushion'].forEach((k) => walk(full[k], got[k], k));
  same(lost, [], 'a plan that carries every field the engine reads — carry on a row without a date and on a dated one, rec with its exceptions, of, ptax, f, vat, the links and marks, tax.cl and tax.per, fresh — comes through the page\'s way in whole');
  await again.context().close();
});

await run('rv-day', 'the balance\'s own day, the first screen with nothing written, and what the rows say: VAT, the day a line was expected, whole pounds', async () => {
  // A payout of the day the balance was typed for, in a statement uploaded after it: taken off, and said in «Счета».
  let pg = await scene('same day', ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), planX({ banks: [bal('Wise', 'GBP', 9880, T, { at: ms('2026-10-06T08:00:00Z') })], team: [row('g', 'Person G', 1000, T)], inflows: [row('q', 'Client Q', 3898.31, '2026-10-04', { vat: false })] }), { H: 60 });
  let S = await holds(pg, 'a payout of the balance\'s own day, uploaded after it');
  await pg.click('#view-today .td-acc summary');
  same([S.fig('now'), acct(S.M, 'Wise|GBP').same, /вписан 6 окт, Mika · платежи за 6 окт \(£1,000\) вычтены: считаю, что прошли после остатка/.test(await text(pg, '#view-today .td-accs'))], [8880, -1000, true],
    '«Денег сейчас» £8,880, not £9,880 — and «Счета» says why: «платежи за 6 окт (£1,000) вычтены: считаю, что прошли после остатка»');
  // A line that stands under «сегодня» says when it was expected; a row's sum is whole pounds.
  same([item(S.M, 'q').state, (await drawn(pg, 'q')).split(' | ').slice(2).join(' | ')], ['waiting', 'Client Q | Wise · ждали 4 окт | +£3,898 | сегодня, вт 6 окт'], 'Client Q, expected 4 Oct and counted today: «ждали 4 окт», and +£3,898 — whole pounds, like every other figure');
  await finish(pg);
  // Day one: the ledger is loaded, no plan was ever saved — no balance, nothing written.
  pg = await scene('nothing at all', ledP(), null, { H: 60 });
  S = await holds(pg, 'no plan at all');
  same([S.M.verdict.id, S.M.empty, /План пока пуст\.$/.test(await text(pg, '#view-today .td-say')), await kpi(pg, 1), await kpi(pg, 2), await kpi(pg, 3), S.M.OUT > 0],
    ['v0', true, true, ['Придёт за 60 дней', '—', 'план пуст'], ['Уйдёт за 60 дней', '—', 'план пуст'], ['Нужно на счетах сегодня', '—', 'план пуст'], true],
    'no balance and nothing written: «Нет остатка… План пока пуст.» — and no figure of a forecast: «—» and «план пуст» for what comes, what goes and what the accounts need (the model\'s «уйдёт» is one tax bill, not a plan)');
  same(store.cash.puts, 0, '… and nothing was saved by looking');
  await shot(pg, 'rv-dayone-nothing');
  await pg.context().close();
  // VAT on a row is said where the row is read.
  pg = await scene('vat words', ledP(), await plan2(), { H: 60 });
  await allDays(pg);
  same([(await drawn(pg, 'rA@2026-10')).split(' | ').slice(2, 5).join(' | '), (await drawn(pg, 'rR@2026-10')).split(' | ').slice(2, 5).join(' | ')], ['Client A | Barclays · в т.ч. VAT £1,600 · каждый месяц | +£9,600', 'Client R | Tochka · ₽236,000 · каждый месяц | +£2,000'],
    'Client A\'s row of 8,000 reads +£9,600 and says «в т.ч. VAT £1,600»; a client without VAT says nothing of it');
  await goCash(pg);
  same([await text(pg, cs('inflows', 'rA@2026-10') + ' [data-cs-gbp]'), await text(pg, cs('inflows', 'rR@2026-10') + ' [data-cs-gbp]')], ['£9,600с VAT', '£2,000'], 'in the constructor 8,000 typed stands beside «£9,600 с VAT» in the column «в £»');
  await goCash(pg, 'days');
  await openDay(pg, '2026-10-28');
  ok((await dayRows(pg, '2026-10-28')).map(plain).some((r) => r.startsWith('rA@2026-10') && r.endsWith('+£9,600 (в т.ч. VAT £1,600)')), '… and in «Касса · По дням» the line says it too: «+£9,600 (в т.ч. VAT £1,600)»', await dayRows(pg, '2026-10-28'));
  await finish(pg);
});

await run('rv-ended', 'ending a repeat leaves a trace: the tick stays off, the row says so wherever it is read, and the tick put back carries the repeat on', async () => {
  const pg = await scene('ended', ledP(), await plan2(), { H: 60 });
  await goCash(pg);
  await toMonth(pg, '2026-11');
  const nov = 'rB@2026-11';
  const tick = box('team', nov, 'rec');
  await pg.uncheck(tick);
  let S = await holds(pg, 'the tick taken off November', 'cash');
  same([S.P.team[0].rec.to, await pg.isChecked(tick), (await csRow(pg, 'team', nov)).split(' | ')[8], await toastText(pg), item(S.M, nov).occ.last, item(S.M, 'rB@2026-12')],
    ['2026-11', false, 'повтор закончится после ноября', 'Повтор закончится после ноября', true, null], 'unticked in the constructor: the repeat ends after November — the tick STAYS off, and the row says «повтор закончится после ноября» for as long as that is so');
  await toMonth(pg, '2026-10');
  same([await pg.isChecked(box('team', 'rB@2026-10', 'rec')), (await csRow(pg, 'team', 'rB@2026-10')).split(' | ')[8]], [true, 'по ноябрь'], 'October, a month before the end, keeps its tick and says «по ноябрь»');
  await toMonth(pg, '2026-11');
  await shot(pg, 'rv-ended-november');
  await goToday(pg);
  await allDays(pg);
  same([(await drawn(pg, nov)).split(' | ')[3], (await drawn(pg, 'rB@2026-10')).split(' | ')[3]], ['Wise · каждый месяц · в последний раз', 'Wise · каждый месяц · по ноябрь'], 'on «Сегодня» the two rows read «каждый месяц · в последний раз» and «каждый месяц · по ноябрь»');
  await pg.click(inDays(nov));
  const mon = K('row') + '[data-ed-f="monthly"]';
  same([await pg.isChecked(mon), await text(pg, K('row') + '[data-ed-n="monthly"]'), await texts(pg, K('row') + '[data-ed-saves] button')], [false, 'повтор закончится после ноября', ['Сохранить']], 'its card: the tick is off, with «повтор закончится после ноября» beside it, and one «Сохранить»');
  await shot(pg, 'rv-ended-today');
  await pg.check(mon);
  same([await text(pg, K('row') + '[data-ed-n="monthly"]'), await texts(pg, K('row') + '[data-ed-saves] button')], ['20-го числа, с октября', ['Сохранить']], 'ticked again there: the note is a repeating row\'s again — «20-го числа, с октября»');
  await pg.click(K('row') + '[data-ed-save="only"]');
  S = await holds(pg, 'the repeat carried on from the card');
  same(['to' in S.P.team[0].rec, await toastText(pg), item(S.M, 'rB@2026-12').cash], [false, 'Person B: повтор продолжается', -6000], 'saved: the repeat goes on — «Person B: повтор продолжается» — and December is back');
  await openRow(pg, nov);
  await pg.uncheck(mon);
  same([await text(pg, K('row') + '[data-ed-n="monthly"]'), await texts(pg, K('row') + '[data-ed-saves] button')], ['повтор закончится после ноября', ['Закончить после ноября']], 'the tick taken off in the card: one button, which says what it does — «Закончить после ноября» — not two that do the same');
  await pg.click(K('row') + '[data-ed-save="only"]');
  S = await holds(pg, 'the repeat ended from the card');
  same([S.P.team[0].rec.to, await toastText(pg)], ['2026-11', 'Person B: повтор закончится после ноября'], 'saved: rec.to is November, and the toast says so in the constructor\'s words');
  await goCash(pg);
  await toMonth(pg, '2026-11');
  await pg.check(tick);
  S = await holds(pg, 'the tick put back in the constructor', 'cash');
  same(['to' in S.P.team[0].rec, await pg.isChecked(tick), await toastText(pg)], [false, true, 'Повтор продолжается'], 'the tick put back in the constructor carries the repeat on');
  await finish(pg);
});

await run('rv-helper', 'the helper: drawn as a list, not as headlines; a group ticked in one press; the button on «Сегодня» lands on it on a phone; who does not start this month is said', async () => {
  let P = await usnYes(planP());
  P = await wr(P, 'shut', card(await C(ledP(), P), 14)[0], TAP, BY);
  let pg = await scene('helper on a desk', ledP(), P, { H: 60 });
  await pg.click('#view-today .td-verdict [data-td-helper]');
  await pg.waitForSelector('#cs-helper .cs-hrow');
  const look = await pg.$$eval('#cs-helper .cs-hrow', (l) => l.map((r) => { const cs = getComputedStyle(r), a = r.querySelector('[data-cs-ht]').getBoundingClientRect(), b = r.querySelector('[data-cs-hs]').getBoundingClientRect(); return [cs.fontWeight, parseFloat(cs.fontSize) <= 15, r.getBoundingClientRect().height < 84, Math.abs(a.top - b.top) < 24].join(' '); }));
  same([...new Set(look)], ['400 true true true'], 'at 1320px each of the five lines is one line of ordinary text — 400 weight, not the 17px/600 of the «По дням» headline whose class it used to share — with «с [октября]» on the line of its tick');
  await pg.click('#cs-helper [data-cs-hall="inflows"]');
  same([await pg.$$eval('#cs-helper [data-cs-ht]', (l) => l.map((e) => e.checked)), await text(pg, '#cs-helper [data-cs-hall="inflows"]'), await text(pg, '#cs-helper [data-cs-hadd]')], [[true, true, false, false, false], 'снять все', 'Добавить 2 строки'], '«отметить все» beside «Поступления» ticks the group in one press');
  for (const id of ['cogs|person b', 'fixed|tool s', 'tax|@mika']) await pg.check(`#cs-helper .cs-hrow[data-cs-hl="${id}"] [data-cs-ht]`);
  await pg.selectOption('#cs-helper .cs-hrow[data-cs-hl="fixed|tool s"] [data-cs-hs]', '2026-11');
  await shot(pg, 'rv-helper-desk');
  ok(/Платежи меньше £100 в месяц сюда не попадают — впишите их сами\.$/.test(await text(pg, '#cs-helper .cs-secnote')), 'the sub-title says what the list leaves out: payments under £100 a month');
  await pg.click('#cs-helper [data-cs-hadd]');
  const S = await holds(pg, 'five rows from the helper, one of them from November', 'cash');
  same([await toastText(pg), S.P.other[0].rec.from, S.P.div[0].rec.from, S.M.between.n], ['В плане: 5 строк «каждый месяц». Не с октября, а позже: Tool S', '2026-11', '2026-10', 1], 'the toast names who does not start in October — Tool S, by the founder\'s choice; the personal tax, left as offered, is in October and is named under the sentence as possibly inside the balance');
  await finish(pg);
  // On a phone both day-one buttons land on what they promise.
  pg = await scene('helper on a phone', ledP(), P, { w: 390, h: 844, H: 60 });
  const at = (sel) => pg.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(), b = document.querySelector('.topbar').getBoundingClientRect(); return [r.top >= b.bottom - 1, r.top < innerHeight * 0.5]; }, sel);
  await pg.click('#view-today .td-verdict [data-td-helper]');
  await pg.waitForSelector('#cs-helper');
  same(await at('#cs-helper h2'), [true, true], '390px: «Подставить по прошлым месяцам» on «Сегодня» opens «Касса» ON the helper — its heading under the top bar, in the upper half of the screen');
  if (SHOTS) { await pg.screenshot({ path: `${SHOTS}/rv-helper-phone-landed.png` }); console.log('      saved rv-helper-phone-landed.png'); }
  await pg.click('#cs-helper [data-cs-hx]');
  await goToday(pg);
  await pg.click('#view-today .td-verdict [data-td-fill]');
  await pg.waitForSelector('#cs-month');
  same([await at('#cs-month'), await monthAt(pg)], [[true, true], '2026-10'], '… and «Заполнить октябрь» opens it on the month itself');
  await finish(pg);
});

await run('rv-tax', 'taxes on screen: a founder\'s own tax row is in the block; his VAT mark reaches «Разбор»; a part is said to be a part; a rule is not deleted from under a mark; a rate is a percentage', async () => {
  // The block «Налоги» lists the row its head names.
  const withCT = { ...(await plan2()), taxes: [row('ct', 'Corporation tax — первый взнос', 2400, '2026-10-20', { of: false, bank: 'Barclays' }), row('old', 'VAT рассрочка', 1200, '2026-10-22', { bank: 'Barclays' })] };
  let pg = await scene('a typed tax row', ledP(), withCT, { H: 60 });
  let S = await holds(pg, 'a tax row a founder wrote');
  same([await text(pg, '#view-today .td-tax h2 .note'), (await pg.$eval('#view-today .td-tax [data-td-own="ct"]', (r) => [r.querySelector('.td-nm').textContent, r.querySelector('.td-meta').textContent, r.querySelector('.td-am').textContent])).map(plain)],
    ['ближайший платёж: 20 окт, £2,400', ['Corporation tax — первый взнос · до 20 окт', 'ваша строка · £2,400', '—']], 'the head says «ближайший платёж: 20 окт, £2,400» — and that payment is a row of the block: «Corporation tax — первый взнос · до 20 окт · ваша строка · £2,400», with nothing held for it on the right');
  same(plain(await pg.$eval('#view-today .td-tax [data-td-own="old"]', (r) => r.querySelector('.td-meta').textContent)), 'ваша строка · часть UK VAT за III кв. 2026 · £1,200', 'an instalment is there too, and says of which tax it is a part');
  // Card 13 on a row read as a PART says what is counted.
  const c13 = '#view-today .td-need .op[data-td-card="13"]';
  same([await text(pg, c13 + ' .op-text'), item(S.M, 'old').of, per(S.M, 'vat|2026Q3').left], ['Похоже, это часть UK VAT за III кв. 2026, который страница посчитала сама, — £4,800. Пока считаю её частью: £1,200 из £4,800, остальное — посчитанной строкой.', { r: 'vat', p: '2026Q3', part: true }, 3600],
    'a row from before the rules, named after the tax and well under its bill: the card says «Пока считаю её частью: £1,200 из £4,800» — which is what is counted (3,600 is left on the line the page worked out)');
  await shot(pg, 'rv-tax-own-rows');
  await pg.click('#view-today .td-tax [data-td-own="ct"]');
  same(await pg.$eval(K('row'), (c) => c.dataset.edId), 'ct', 'the row opens its card from the block');
  await pg.click(K('row') + '[data-ed-x]');
  // «Часть…» is not offered for a period a whole-bill row stands for.
  await addRow(pg, 'taxes', { name: 'VAT Q4 whole', amt: 5000, date: '2027-02-07' });
  S = await holds(pg, 'a whole-bill row for IV кв.');
  same(per(S.M, 'vat|2026Q4').state, 'typed', '«VAT Q4 whole», pre-set by its name to «Весь UK VAT за IV кв. 2026»: the quarter is the founder\'s row now');
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="taxes"]');
  const opts = await pg.$$eval(K('add') + '#ed-of option', (l) => l.map((o) => o.textContent));
  same([opts.some((o) => /^Часть UK VAT за IV кв\. 2026/.test(o)), opts.some((o) => /^Весь UK VAT за IV кв\. 2026/.test(o)), opts.some((o) => /^Часть UK VAT за III кв\. 2026/.test(o))], [false, false, true], 'for the next tax row neither «Весь…» nor «Часть UK VAT за IV кв. 2026» is offered — a part would be counted on top of the whole bill; a period the page works out still offers its «Часть…»');
  await pg.click(K('add') + '[data-ed-x]');
  await finish(pg);

  // A founder's mark for a client decides the VAT a receipt is filed with.
  const waiting = (id, amt, b, v) => ({ ...inbox(id, '2026-10-05', amt, 'rev', 'Client A', { b, at: AT1, auto: false }), v });
  pg = await scene('the mark in «Разбор»', ledP({ inb: [waiting('lu', 9000, 'Wise', 0), waiting('lb', 6000, 'Barclays', 1000)] }), await plan2(), { H: 60 });
  await pg.click('.nav [data-tab="settings"]');
  await pg.waitForSelector('#ed-taxes .ed-cl');
  const vats = () => pg.$$eval('#view-inbox input.vat', (l) => Object.fromEntries(l.map((e) => [e.id, e.value])));
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="no"]');
  same([await toastText(pg), await vats()], ['В плане изменено строк: 1 · в разборе: 1', { 'v-lu': '', 'v-lb': '' }], 'Client A marked «международный, без VAT»: his receipt waiting in «Разбор» from Barclays loses the £1,000 the bank\'s habit gave it — «В плане изменено строк: 1 · в разборе: 1»');
  await pg.click('#ed-taxes .ed-cl[data-ed-client="client a"] [data-ed-cl="vat"]');
  same([await toastText(pg), await vats()], ['В плане изменено строк: 1 · в разборе: 2', { 'v-lu': '1500', 'v-lb': '1000' }], 'marked «UK, с VAT»: both receipts carry it — the £9,000 that came through Wise too, £1,500 of it');
  await pg.click('.nav [data-tab="inbox"]');
  await pg.click('#view-inbox .op[data-id="lu"] [data-accept]');
  for (let i = 0; i < 80 && !store.led.doc.tx.some((r) => r.id === 'lu'); i++) await sleep(50);
  same((store.led.doc.tx.find((r) => r.id === 'lu') || {}).v, 1500, 'accepted as it stands: the row is filed with VAT £1,500, and the quarter\'s accrual has it');
  const q4 = () => pg.evaluate(() => window.__money.model().taxes.periods.find((p) => p.key === 'vat|2026Q4').accF);
  const accBefore = await q4();
  same(await feed(pg, wiseCsv([['T-1', '2026-10-06', 6000, 'Invoice 12', 'Client A', '']])), ['Wise', 1], 'a new Wise statement with £6,000 from Client A');
  same((await q4()) - accBefore, 1000, '… is recognised with VAT £1,000 by the founder\'s mark, though it came through Wise: the quarter\'s accrual grows by it');
  await finish(pg);

  // A rule with a period marked paid by hand is not deleted from under the mark; a rate is a percentage.
  const own = { id: 'own', name: 'Сбор', base: 'share', rate: 10, acct: 'Barclays|GBP', per: 'm', day: 15, off: 1, on: true, from: T, at: C0 };
  const marked = planP({ tax: { since: T, rules: [VAT(), USN(), own], cl: {}, per: { 'own|2026-09': { paid: paid(T) } } } });
  pg = await scene('a rule under a mark', ledP({ tx: [sheet('j1', '2025-11-20', 500, 'rev', 'Client J')] }), marked, { H: 60 });
  S = await holds(pg, 'a founder\'s own rule, its September marked paid');
  same([per(S.M, 'own|2026-09').state, per(S.M, 'own|2026-09').by, S.M.marksGbp], ['paid', 'mark', -960], 'September of «Сбор» — £960 — is marked paid, and the mark is inside «Денег сейчас»');
  ok(/Сбор — с сентября 2026/.test(await pg.$eval('#view-today .td-how', (e) => e.textContent)), '«Как посчитано и чего здесь нет» says «Сбор — с сентября 2026» — the month in the genitive', await pg.$eval('#view-today .td-how', (e) => e.textContent.slice(0, 200)));
  await pg.click('.nav [data-tab="settings"]');
  await pg.waitForSelector('#ed-taxes .ed-rule[data-ed-rule="own"]');
  await pg.click('#ed-taxes .ed-rule[data-ed-rule="own"] [data-ed-rdel]');
  same([await toastText(pg), await pg.evaluate(() => window.__cash.state().tax.rules.length), await text(pg, '#ed-taxes .ed-rule[data-ed-rule="own"] [data-ed-rdel]')], ['Сначала снимите отметку «оплачено» с «Сбор за сентябрь 2026»: она ещё учтена в «Денег сейчас»', 3, 'Удалить'], '«Удалить» on the rule is refused in words while the mark is still counted: the payment would have come back into the balance without one');
  const rate = '#ed-taxes .ed-rule[data-ed-rule="own"] [data-ed-rv="rate"]';
  await pg.fill(rate, '1000');
  await pg.press(rate, 'Enter');
  same([await pg.evaluate(() => window.__cash.state().tax.rules[2].rate), await pg.$eval(rate, (e) => e.value)], [100, '100'], 'a rate typed as 1000 is stored, and shown, as 100');
  ok((await texts(pg, '#ed-taxes .ed-cl')).some((x) => /^Client J · последнее поступление 20 ноя 2025/.test(x)), 'a client last seen more than ten months ago says the year: «последнее поступление 20 ноя 2025»', await texts(pg, '#ed-taxes .ed-cl .ed-cn'));
  // The select has room for its longest words. (The block is drawn afresh a moment after a box in it is left, so
  // the width is waited for — two seconds at most — rather than read at one instant.)
  const wide = () => { const e = document.querySelector('#ed-taxes .ed-rule[data-ed-rule="own"] [data-ed-rv="pay"]'); if (!e) return false; const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(e).font; return e.clientWidth >= Math.ceil(c.measureText('как в прошлый раз').width) + 24; };
  ok(await pg.waitForFunction(wide, null, { timeout: 2000 }).then(() => true, () => false), '«Платим со счёта» is wide enough for «как в прошлый раз» — it was cut to «как в прошлый»', await pg.$eval('#ed-taxes .ed-rule[data-ed-rule="own"] [data-ed-rv="pay"]', (e) => [e.clientWidth, e.closest('label').className]));
  await shot(pg, 'rv-settings-own-rule');
  await finish(pg);
});

await run('rv-tochka', 'a Tochka statement prints every sum without a sign: which way the money went stands in a column of its own, and the page reads it', async () => {
  // The bank's own export as it comes: forty-two columns, both sides of every row named, every sum positive, the way
  // in «Направление». Read without that column, every payment out was a receipt and was offered as revenue — found on
  // the first real statement, 8 October 2026. The header is the bank's; the rows are made up.
  const HEAD = ['Дата проводки', 'Дата документа', 'Дата списания', 'Дата зачисления', 'Номер документа', 'Направление', 'Сумма операции', 'Сумма операции в рублях', 'Входящий остаток', 'Исходящий остаток',
    'Назначение платежа', 'Наименование плательщика', 'Счет плательщика', 'ИНН плательщика', 'КПП плательщика', 'Бик банка плательщика', 'Наименование банка плательщика', 'Адрес банка плательщика', 'Корр. счёт банка плательщика',
    'Наименование получателя', 'Счет получателя', 'ИНН получателя', 'КПП получателя', 'Бик банка получателя', 'Наименование банка получателя', 'Адрес банка получателя', 'Корр. счет банка получателя',
    'Курс конвертации', 'Сумма после конвертации', 'Приоритет', 'Тип документа', 'Бюджетный', 'Бюджетный: статус', 'Бюджетный: КБК', 'Бюджетный: ОКАТО', 'Бюджетный: Основание', 'Бюджетный: Период', 'Бюджетный: Номер',
    'Бюджетный: дата', 'Бюджетный: тип', 'Основание списания', 'Код'];
  const cell = (v) => (/[;"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const BANK = 'ООО "Банк Точка"', US = 'Индивидуальный предприниматель Примеров Пётр Петрович', INN = '770000000011';
  const line = (n, way, amt, text, from, to) => {
    const c = new Array(HEAD.length).fill('');
    c[0] = c[1] = c[way === 'Исходящий' ? 2 : 3] = '02.10.2026'; c[4] = String(n); c[5] = way; c[6] = c[7] = amt; c[10] = text;
    [c[11], c[12], c[13]] = from; c[16] = BANK; [c[19], c[20], c[21]] = to; c[24] = BANK;
    return c.map(cell).join(';');
  };
  const csv = [HEAD.join(';'),
    line(11, 'Входящий', '120000,00', 'Оплата по счету №7 за разработку. НДС не облагается', ['ООО "ВЫДУМКА"', '40702810000000000001', '7700000001'], ['ИП Примеров Пётр Петрович', '40802810000000000011', INN]),
    line(12, 'Исходящий', '4200,00', 'Оплата лицензионного вознаграждения за использование базовой лицензии по тариф.пакету. НДС не предусмотрен.', [US, '40802810000000000011', INN], [BANK, '60322810000000000001', '7700000099']),
    line(13, 'Исходящий', '7528,00', 'Перевод средств в счёт накоплений на оплату налогов без НДС', [US, '40802810000000000011', INN], [US, '40802810000000000022', INN]),
    line(14, 'Исходящий', '16,11', 'Покупка товара(Терминал:EXAMPLE*77*CLOUD,16, Some str., Office 1,Moscow,RU,дата операции:01/10/2026 19:12(МСК),на сумму:16.11 RUB,карта 220000******0000)', [US, '40802810000000000011', INN], [BANK, '30232810000000000001', '7700000099']),
  ].join('\n') + '\n';
  serve(ledger([]), null);
  const pg = await open('a Tochka statement');
  const read = await pg.evaluate((c) => { const p = window.__tx.parseGrid(window.__tx.parseCSV(c), 'tochka.csv'); return p.error ? [p.error] : [p.bank, p.defCur, p.rows.map((r) => [r.d, r.a, !!r.own, r.p].join(' | '))]; }, csv);
  same(read, ['Tochka', 'RUB', ['2026-10-02 | 120000 | false | ООО "ВЫДУМКА"', '2026-10-02 | -4200 | false | ', `2026-10-02 | -7528 | true | ${US}`, '2026-10-02 | -16.11 | false | EXAMPLE*77*CLOUD']],
    '«Входящий» is money in, «Исходящий» money out; payer and recipient under one tax number are the holder\'s own accounts; a payment to the bank itself is named by its terminal, or by nobody');
  await pg.evaluate((c) => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'tochka.csv'), 'tochka.csv'); }, csv);
  for (let i = 0; i < 80 && !((store.led.doc.inbox || []).length === 3 && store.led.doc.tx.length === 1); i++) await sleep(50);
  const inb = (store.led.doc.inbox || []).map((r) => [r.o.a, r.dir, r.c === 'rev', r.o.cur].join(' ')).sort(), kept = store.led.doc.tx.map((r) => [r.o.a, r.c, r.s].join(' '));
  same([inb, kept], [['-16.11 -1 false RUB', '-4200 -1 false RUB', '120000 1 true RUB'], ['-7528 skip file']],
    '… so in «Разбор» the one receipt is offered as revenue, the tariff and the card purchase are payments out and are not, and the move to the holder\'s own tax account is taken out as a transfer between own accounts');
  await pg.context().close();
});

await run('rv-small', 'the rest of the review: a save the server did not take, the wordmark, a paid row made to repeat, a name the table knows, a tax row renamed after a founder, an unsorted receipt in «Можно вывести»', async () => {
  // A save the server fails is said out loud and tried again by itself.
  serve(ledP(), await plan2());
  let pg = await open('a failed save', undefined, { quiet: /500|Internal Server Error/ });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same(await pg.$eval('.wordmark', (e) => [e.getAttribute('href'), e.dataset.tab, e.title]), ['#today', 'today', ''], 'under /money/ on a name that is not finance\'s the wordmark is still the «Сегодня» tab: no link leaves Money for the other product');
  store.cash.putFail = true;
  await pg.click('.nav [data-tab="settings"]');
  await pg.fill('#ed-forecast [data-ed-set="cushion"]', '9000');
  await pg.press('#ed-forecast [data-ed-set="cushion"]', 'Enter');
  for (let i = 0; i < 80 && !store.cash.failed; i++) await sleep(50);
  await sleep(200);
  same([await toastText(pg), /касса не сохранена/.test(await text(pg, '#sync')), store.cash.doc.cushion, store.cash.puts], ['Не сохранено: нет связи с сервером. Попробую ещё раз сам', true, 5000, 0], 'the server answers 500: the toast that said «Сохранено» is taken back — «Не сохранено: нет связи с сервером. Попробую ещё раз сам» — and the pill says so too');
  store.cash.putFail = false;
  for (let i = 0; i < 160 && !store.cash.puts; i++) await sleep(50);
  await sleep(200);
  same([store.cash.doc.cushion, store.cash.puts, /сохранено/.test(await text(pg, '#sync'))], [9000, 1, true], '… and within seconds, with no further edit, the change is sent again and kept');
  await finish(pg);

  // A paid one-off row can be made to repeat from its card; a name the table knows brings its bank.
  pg = await scene('a paid row', ledP(), planP({ team: [row('g', 'Person G', 1000, '2026-10-07', { paid: paid(T) })] }), { H: 60 });
  await pg.click(inDays('g'));
  same(await texts(pg, K('row') + '.ed-foot button'), ['Вернуть в план', 'Повторять каждый месяц', 'Закрыть'], 'a row marked paid offers «Повторять каждый месяц» on its card');
  await pg.click(K('row') + '[data-ed-do="tick"]');
  let S = await holds(pg, 'the paid row made to repeat');
  same([S.P.team[0].rec, await toastText(pg), item(S.M, 'g@2026-10').state, item(S.M, 'g@2026-11').cash], [{ day: 7, from: '2026-10', x: { '2026-10': { paid: paid(T) } } }, 'Person G: каждый месяц, с октября', 'done', -1000], 'pressed: the row repeats on the 7th from October, its mark stays with October, November is in the plan');
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="inflows"]');
  await pg.fill(K('add') + '#ed-name', 'Client R');
  same([await pg.$eval(K('add') + '#ed-bank', (e) => e.value), await pg.$eval(K('add') + '#ed-cur', (e) => e.value), await text(pg, K('add') + '[data-ed-n="last"]')], ['Tochka', 'GBP', 'в прошлый раз £2,000, 15 сен'], '«Добавить» → «Client R»: the bank becomes Tochka, where he last paid, and the card says «в прошлый раз £2,000, 15 сен»');
  await pg.selectOption(K('add') + '#ed-bank', 'Wise');
  await pg.fill(K('add') + '#ed-name', 'Client A');
  same(await pg.$eval(K('add') + '#ed-bank', (e) => e.value), 'Wise', '… and a bank the founder chose himself is left alone');
  await pg.click(K('add') + '[data-ed-x]');
  // A tax row renamed after a founder moves to «Дивиденды» — from the constructor, when the cursor leaves the row.
  await addRow(pg, 'taxes', { name: 'Self assessment', amt: 400, date: '2026-11-05' });
  await goCash(pg);
  await toMonth(pg, '2026-11');
  const sa = (await rowIds(pg)).find((id) => id !== 'g');
  await pg.fill(box('taxes', sa, 'name'), 'HMRC Misha');
  await leave(pg);
  await pg.waitForSelector(cs('div', sa));
  S = await holds(pg, 'a tax row renamed after a founder', 'cash');
  same([(await listed(pg, 'taxes')).includes(sa), (await listed(pg, 'div')).includes(sa), S.P.div.map((r) => [r.name, r.ptax, r.f]), await toastText(pg)], [false, true, [['HMRC Misha', true, 'misha']], '«HMRC Misha» — личный налог: перенесён в «Дивиденды»'], 'renamed «HMRC Misha» in the constructor: the row leaves «Налоги» for «Дивиденды» as a personal tax, and the page says so');
  await finish(pg);

  // «Можно вывести» with a receipt nobody has sorted: held back, and said.
  const AT = ms('2026-10-21T08:00:00Z');
  const P = { ...(await plan2()), banks: BALS('2026-10-19'), other: (await plan2()).other.concat([row('big', 'Printer', 15000, '2026-11-25')]) };
  pg = await scene('an unsorted receipt', ledP({ tx: [filed('b1', '2026-10-20', -6000, 'cogs', 'Person B', { at: AT })], inb: [inbox('u1', '2026-10-20', 9600, '', 'SOME PAYER', { b: 'Barclays', at: AT })] }), P, { H: 60, at: '2026-10-21T12:00:00+01:00' });
  S = await holds(pg, '£9,600 unsorted in «Разбор»');
  const says = await freeSays(pg);
  ok(/; £[\d,]+ — налоги, £5,000 — запас, £9,600 — в разборе, остальное можно вывести\.$/.test(says) && (await texts(pg, '#view-today .td-free .note')).includes('В разборе 1 поступление на £9,600: возможно, это деньги, которых план ещё ждёт. Пока не разберёте, £9,600 в сумму не входят.'),
    'the card shows what is held back on the tight day — «…, £9,600 — в разборе, остальное можно вывести.» — and why: «возможно, это деньги, которых план ещё ждёт»', [says, await texts(pg, '#view-today .td-free .note')]);
  await shot(pg, 'rv-inbox-free');
  await finish(pg);
});

await run('looks', 'the pictures: «Сегодня», «Касса» and the tax settings on a desk and on a phone, and day one', async () => {
  for (const [tag, w, h] of [['d', 1320, 900], ['m', 390, 844], ['s', 375, 812]]) {
    serve(demoLedger(T), demoPlan(T));
    const pg = await open('looks ' + tag, undefined, { w, h });
    await pg.waitForSelector('#view-today [data-live="verdict"]');
    await holds(pg, `the fabricated studio, ${w}px`);
    await calm(pg, `the fabricated studio, ${w}px`);
    if (tag !== 's') await shot(pg, `live-${tag}-today`);
    if (tag !== 's') {
      // A row's card on «Частично…», with both of its answers typed: how much has been paid, and the day of the rest.
      await pg.click('#view-today .td-days .td-row[data-ed-open="t-lena@2026-10"]');
      await pg.click(K('row') + '[data-ed-do="part"]');
      await pg.fill(PART, '1500');
      await pg.fill(REST, '2026-10-20');
      same([await text(pg, K('row') + '[data-ed-partnote]'), await pg.inputValue(REST)], ['остаток £1,200', '2026-10-20'], `${w}px: the question on a row of the studio — £1,500 of Lena's £2,700 paid, the rest on 20 Oct`);
      same(await pg.$$eval(K('row') + '#ed-amt, ' + K('row') + '#ed-date, ' + PART + ', ' + REST, (l) => [l.length, [...new Set(l.map((e) => { const cs = getComputedStyle(e); return [cs.fontFamily, cs.fontSize, Math.round(e.getBoundingClientRect().height)].join(' · '); }))].length]), [4, 1], `${w}px: … and its two fields are set as the card's own sum and date above them are — one face, one size, one height`);
      await shot(pg, `live-${tag}-row`);
      await shotOf(pg, K('row'), `live-${tag}-row-card`);
      await pg.click(K('row') + '[data-ed-x]');
    }
    if (tag === 'd') {
      // The other card a founder types into: «Добавить» on a tax.
      await pg.click('#view-today .page-head [data-ed-add]');
      await pg.click(K('add') + '[data-ed-what="taxes"]');
      await fill(pg, 'add', { name: 'VAT за III квартал', amt: 8000, date: '2026-11-07' });
      await shot(pg, 'live-d-add');
      await pg.click(K('add') + '[data-ed-x]');
    }
    await goCash(pg);
    await holds(pg, `«Касса · План», ${w}px`, 'cash');
    await calm(pg, `«Касса · План», ${w}px`, 'cash');
    if (tag !== 's') await shot(pg, tag === 'd' ? 'live-d-plan-oct' : 'live-m-plan');
    if (tag === 'd') {
      // A row's card opened under its row in the table. The table draws its own boxes small and as wide as their cells;
      // none of that may reach into the card: there a tick box is a small square and every field is one height.
      const ids = await pg.$$eval('#cs-sec-inflows tr[data-cs-id]', (l) => l.map((e) => e.dataset.csId));
      let g = null;
      for (const id of ids) {
        await pg.click(cs('inflows', id) + ' .cs-mo [data-ed-open]');
        await pg.waitForSelector('#view-cash tr.cs-edrow [data-ed-card="row"]');
        g = await pg.$eval('#view-cash tr.cs-edrow [data-ed-card="row"]', (card) => {
          const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
          const mv = card.querySelector('.ed-mv');
          return {
            ticks: [...card.querySelectorAll('input[type=checkbox]')].map(box),
            fields: [...card.querySelectorAll('.ed-grid .fld > input, .ed-grid .fld > select')].map((e) => box(e)[1]),
            date: mv ? box(mv.querySelector('input'))[1] : 0,
            arrows: mv ? [...mv.querySelectorAll('button')].map((b) => box(b)[1]) : [],
            words: [...card.querySelectorAll('.ed-chk')].map((l) => box(l)[1]),
          };
        });
        if (g.ticks.length === 2) break; // an income still expected: «+ VAT» and «каждый месяц»
        await pg.click('#view-cash tr.cs-edrow [data-ed-card="row"] [data-ed-x]');
        g = null;
      }
      ok(!!g && g.ticks.every(([bw, bh]) => bw <= 18 && bh <= 18), 'a row\'s card opened inside the table of «Касса»: «+ VAT» and «каждый месяц» are small tick boxes, not boxes as wide as a field', g && g.ticks);
      ok(!!g && g.date > 0 && g.arrows.length === 2 && g.arrows.concat(g.fields).every((fh) => Math.abs(fh - g.date) <= 1), '… every field of that card is one height, the date and the two arrows beside it included', g);
      ok(!!g && g.words.every((wh) => wh <= 48), '… and the words beside a tick box stay on a line or two: nothing squeezes them into a column', g && g.words);
      await shot(pg, 'live-d-plan-row');
      if (g) {
        // … and the question «Частично…» opened in that card, inside the table: its two fields are set as the
        // card's own sum and date there too — none of the table's compact boxes reaches them either.
        const inTable = '#view-cash tr.cs-edrow [data-ed-card="row"] ';
        const asks = !!(await pg.$(inTable + '[data-ed-do="part"]'));
        if (asks) {
          await pg.click(inTable + '[data-ed-do="part"]');
          await pg.fill(PART, '1000');
          await pg.fill(REST, '2026-10-20');
        }
        same(asks && (await pg.$$eval(inTable + '#ed-amt, ' + inTable + '#ed-date, ' + inTable + '[data-ed-part], ' + inTable + '[data-ed-partdate]', (l) => [l.length, [...new Set(l.map((e) => { const cs = getComputedStyle(e); return [cs.fontFamily, cs.fontSize, Math.round(e.getBoundingClientRect().height)].join(' · '); }))].length])), [4, 1],
          '… with «Частично…» open in it, the question\'s sum and day are set as the card\'s own sum and date are — one face, one size, one height, inside the table as on «Сегодня»');
        await shot(pg, 'live-d-plan-row-part');
        await shotOf(pg, inTable, 'live-d-plan-row-part-card');
        await pg.click(inTable + '[data-ed-x]');
      }
    }
    if (tag === 'd') { await toMonth(pg, '2026-11'); await shot(pg, 'live-d-plan-nov'); }
    await pg.click('#view-cash [data-cs-view="days"]');
    await pg.waitForSelector('#cs-stmt');
    await openDay(pg, T);
    await calm(pg, `«Касса · По дням», ${w}px`, 'cash');
    if (tag !== 's') await shot(pg, `live-${tag}-days`);
    if (tag !== 'd') {
      // The longest lists the studio has: today, and everything closed in the last two months.
      await pg.click('#cs-stmt tr[data-cs-row="__paid"]');
      const r = await linesInSight(pg, w);
      ok(r[0] > 20 && !r[1].length, `${w}px: each of the ${r[0]} lines of the opened days — today and the group «Оплачено / получено» — says what it is and how much, in sight`, r[1].slice(0, 5));
    }
    if (tag === 'd') {
      await pg.click('.nav [data-tab="settings"]');
      await pg.waitForSelector('#ed-taxes .ed-rule');
      await shot(pg, 'live-d-settings-taxes');
      // The two screens «Настройки» opens, reached the way a founder reaches them — and back, for the check below.
      for (const t of ['upload', 'ledger']) { await pg.click(`main > [id^="view-"]:not([hidden]) .set-nav [data-tabgo="${t}"]`); await shot(pg, `live-d-settings-${t}`); }
      await pg.click('#view-ledger .set-nav [data-tabgo="settings"]');
    }
    ok((await pg.evaluate(() => document.documentElement.scrollWidth)) <= w, `${w}px: no tab of the three scrolls sideways`);
    await pg.context().close();
  }
  // Day one: the ledger is loaded, the balances are typed, and nobody has written a row.
  const P1 = demoPlan(T);
  LISTS.forEach((k) => { P1[k] = []; });
  P1.tax.per = {};
  serve(demoLedger(T), P1);
  const one = await open('looks day one', undefined, { w: 1320, h: 900 });
  await one.waitForSelector('#view-today [data-live="verdict"]');
  await holds(one, 'day one');
  await shot(one, 'live-d-day-one');
  await one.context().close();
});

console.log('\n' + (errs.length ? 'PAGE ERRORS:\n  ' + errs.join('\n  ') : 'no page errors, no console errors'));
console.log(`${n - failed} of ${n} checks passed` + (failed ? ` — ${failed} FAILED` : ''));
await browser.close();
process.exit(failed || errs.length ? 1 : 0);
