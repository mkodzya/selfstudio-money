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
// (That was the platform's way. In this repository CI runs the file in four
// parts side by side - SHARD=1/4 … 4/4 - and `scripts/check-one <key>` runs one
// check on the Mac.)
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
//
// THE OWNER'S DECISIONS OF 17 OCTOBER 2026 (docs/handoff.md, the entry of that day) have three checks at the end:
// «records» (N - a withdrawal whose whole name is a founder's is his; W1 - such a withdrawal written after its
// statement and marked takes its founder's rows near its date; W2 - the rest of a row taken in part), «rest» (W2 in
// another currency: what was taken and the rest make the row exactly) and «daily» (D - from October a move to a
// founder's Daily or Monthly account is a transfer between own accounts). What they changed in older checks is
// rewritten where it stood, with the old arithmetic in a comment: «p12» (the draw called «Mika»), «rv-whose» (rows
// that had to stay everybody's are called «Вывод Vanya» now), «rv-offplan» (its daily transfer is October's), and
// rule 23 of `inv` (whose a withdrawal is, by its name too). The review of that work added to them: «records» -
// Vanya's mark live, so that its double count before W1 is seen, and a rename in the card writes no owner; «daily» -
// a move back from a Daily account, a direct debit under «daily», and a move that «Разбор» never pairs with a
// client's payment. What the engine alone holds of it is in checks/withdrawals/cases.cjs.
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { demoLedger, demoPlan } from './money-demo.mjs';

const PUB = process.env.PUB || '/app/pub';
const PORT = 8097;
const BASE = `http://localhost:${PORT}`;
const ONLY = (process.env.ONLY || '').toLowerCase();
// SHARD=2/4 runs every fourth check, beginning with the second: CI runs the four parts side by side, and the wait for
// a change is the longest part and not the sum of them. A check belongs to a part by its place in this file, whatever
// ONLY says.
const SHARD = (() => {
  if (!process.env.SHARD) return null;
  const m = /^(\d+)\/(\d+)$/.exec(process.env.SHARD);
  const k = m ? +m[1] : 0;
  const of = m ? +m[2] : 0;
  if (!(k >= 1 && k <= of)) { console.error(`SHARD is "<part>/<parts>", 1 to <parts>; got "${process.env.SHARD}"`); process.exit(2); }
  return { k, of };
})();
let place = 0;

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
  cash: { rev: 2, doc: demoPlan(T), puts: 0, clash: null, bases: [], fail: false, named: [], behind: 0, got: 0, holdFor: 0 },
};
// Who the stand says is signed in. Without a role - a server of before there were readers, and every check but the
// last few - the page offers everything, as it always did. `people` is the owner's list, `asked` what the page sent
// to the doors of «Люди» (a password is noted as given or not, never as it is), `pass` the password the doors accept.
const ME0 = { id: 'p1', name: 'Mika Example', firstName: 'Mika', isFounderTier: true };
const PASS = 'correct horse battery staple';
const LINK = `http://localhost:8097/set-password#t=${'A'.repeat(43)}`;
Object.assign(store, { me: ME0, people: null, asked: [], pass: PASS });
// The table of exchange rates by day, as the stand hands it over. Empty - a stand that asks nobody, and every check
// but the last - and the page counts by the rates typed into it, as it always did.
const NO_RATES = { base: 'GBP', days: {}, asked: null };
store.rates = NO_RATES;
// A fresh pair of documents for a check that loads the page on them. Each pair starts at revisions nobody has seen:
// a page of the check before, closing with a change half a second old, still sends it — and must be refused.
let gen = 100;
const serve = (led, cash) => {
  gen += 100;
  Object.assign(store.led, { rev: gen + 1, doc: JSON.parse(JSON.stringify(led)), puts: 0 });
  Object.assign(store.cash, { rev: gen, rev0: gen, doc: JSON.parse(JSON.stringify(cash)), puts: 0, clash: null, bases: [], fail: false, putFail: false, failed: 0, deny: false, named: [], behind: 0, got: 0, holdFor: 0 });
  Object.assign(store.led, { deny: false, slow: 0 });
  Object.assign(store, { me: ME0, people: null, asked: [], pass: PASS, rates: NO_RATES });
};
// The doors of «Люди», as docs/api.md has them: the owner's four, one's own password, and the way out.
const peopleDoor = (method, url, b) => {
  const list = () => [200, { people: store.people, max: 20 }];
  const refuse = (status, error, more = {}) => [status, { error, message: error, ...more }];
  if (url === '/api/auth/logout') return [200, { ok: true }];
  if (url === '/api/auth/password') {
    if (b.current !== store.pass) return refuse(403, 'wrong_password');
    if (typeof b.password !== 'string' || b.password.length < 12) return refuse(400, 'weak_password', { min: 12 });
    store.pass = b.password;
    return [200, { ok: true }];
  }
  if (!store.me.canManage || !store.people) return refuse(403, 'not_owner');
  const who = store.people.find((p) => p.login === b.login);
  if (url === '/api/people' && method === 'GET') return list();
  if (url === '/api/people') {
    if (!/^[a-z][a-z0-9._-]{0,31}$/.test(b.login || '')) return refuse(400, 'bad_person', { reason: 'login' });
    if (!b.name) return refuse(400, 'bad_person', { reason: 'name' });
    if (who) return refuse(409, 'login_taken');
    store.people.push({ login: b.login, name: b.name, role: 'reader', me: false, hasPassword: false, passwordSetAt: null, disabled: false, linkExpires: null, added: true, lastSeen: null });
    return list();
  }
  if (!who) return refuse(404, 'unknown_login');
  if (url === '/api/people/update') {
    if (who.role === 'owner' && (b.role !== undefined || b.disabled !== undefined)) return refuse(409, 'owner_fixed');
    if (b.name !== undefined) who.name = b.name;
    if (b.role !== undefined) who.role = b.role;
    if (b.disabled !== undefined) { who.disabled = b.disabled; if (b.disabled) who.linkExpires = null; }
    return list();
  }
  if (url === '/api/people/link') {
    if (b.password !== store.pass) return refuse(403, 'wrong_password');
    if (who.disabled) return refuse(409, 'login_disabled');
    who.linkExpires = '2026-10-08T11:00:00Z';
    return [200, { login: who.login, link: LINK, expires: who.linkExpires }];
  }
  return refuse(404, 'not_found');
};
http
  .createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    const body = () => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
    // The page asks who is signed in, to sign the changes it makes to the plan.
    if (url === '/api/me') return send(200, store.me);
    if (url === '/api/rates') return store.rates ? send(200, store.rates) : send(503, { error: 'storage_busy' });      // null: the door does not answer
    if (url === '/api/people' || url.startsWith('/api/people/') || url === '/api/auth/password' || url === '/api/auth/logout') {
      const b = req.method === 'GET' ? {} : JSON.parse((await body()) || '{}');
      const noted = { ...b };
      for (const k of ['password', 'current']) if (k in noted) noted[k] = noted[k] ? 'given' : 'empty';
      store.asked.push([req.method, url, noted]);
      return send(...peopleDoor(req.method, url, b));
    }
    // Where «Выйти» leads: the stand's own sign-in page, which is not this file's to check.
    if (url === '/login') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<title>login</title>the sign-in page'); }
    const doc = url === '/api/founder/money' ? store.led : url === '/api/founder/money/cash' ? store.cash : null;
    if (doc) {
      // The plan's server can be made to fail, for the check of a plan that does not load.
      if (req.method === 'GET') return doc.fail ? send(500, { error: 'boom' }) : send(200, { rev: doc.rev, doc: doc.doc, updatedAt: null });
      const b = JSON.parse(await body());
      // The plan's save can be kept waiting until the table has reached a revision, for the check of a save of the
      // table that overtakes a save of the plan sent before it. `got` counts the saves that have arrived.
      if (doc === store.cash) { doc.got++; for (let i = 0; i < 200 && doc.holdFor && store.led.rev < doc.holdFor; i++) await new Promise((r) => setTimeout(r, 50)); }
      // The owner has made the person a reader since the page was opened: the server takes no save from them.
      if (doc.deny) { doc.denied = (doc.denied || 0) + 1; return send(403, { error: 'read_only', message: 'This sign-in can look, not change.' }); }
      // A page that has been closed may still be heard from; what it sends is not this check's.
      if (b.base < doc.rev - 50) return send(409, { error: 'money_stale', rev: doc.rev });
      // The server can be made to fail a save, for the check of a change that did not reach it.
      if (doc.putFail) { doc.failed = (doc.failed || 0) + 1; return send(500, { error: 'boom' }); }
      doc.puts++;
      if (doc.bases) doc.bases.push(b.base);
      // Another founder's page saved a moment earlier: what it wrote is the document now.
      if (doc.clash) { doc.doc = doc.clash; doc.clash = null; doc.rev++; }
      if (b.base !== doc.rev) return send(409, { error: 'money_stale', rev: doc.rev });
      // The plan names the table it was worked out against, and the stand takes it only while the table stands there
      // (docs/api.md, "The ledger's revision, on the plan's PUT"). `named` is what each save of the plan named - null
      // from a page of before the rule, which names none and is judged by the plan's own revision alone.
      if (doc === store.cash) {
        doc.named.push('ledger' in b ? b.ledger : null);
        if ('ledger' in b && b.ledger !== store.led.rev) { doc.behind++; return send(409, { error: 'ledger_stale', message: 'The ledger was saved from somewhere else since this page read it.', ledger: store.led.rev }); }
      }
      doc.doc = JSON.parse(b.doc);
      doc.rev++;
      // The table's save can be answered late, for the check of a plan changed while that answer is on its way.
      if (doc === store.led && doc.slow) await new Promise((r) => setTimeout(r, doc.slow));
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
// What unfolds on the page unfolds with a motion a fifth of a second long, and what is shut by its own button is
// drawn away only when that motion ends. A check presses and reads at once, so every page here asks for less
// motion - the page then plays none and waits for none; `motion` is for the one check of the motion itself.
const CALM = { reducedMotion: 'reduce' };
async function open(name, at = '2026-10-06T12:00:00+01:00', { w = 1320, h = 900, hash = '', quiet = null, folded = false, motion = false, who = 'Mika' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, ...(motion ? {} : CALM) });
  // «Аналитика» on «Сегодня» is folded until a founder opens it, and the page remembers that he did. The checks read
  // and press what is under it, so they come as that founder; `folded` is for the check of the fold itself.
  if (!folded) await ctx.addInitScript(() => { try { localStorage.setItem('selfstudio-money-analytics', '1'); } catch (e) { /* no storage: the page copes */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${name}: PAGEERROR ${e.message}`));
  // `quiet` is for the one check that makes the server refuse a save on purpose: the browser reports the refusal itself.
  page.on('console', (m) => { if (m.type() === 'error' && !(quiet && quiet.test(m.text()))) errs.push(`${name}: CONSOLE ${m.text()} ${m.location().url || ''}`); });
  // The page asks Google for its fonts; the checks have no use for them and must not wait on the network.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.clock.install({ time: new Date(at) });
  await page.goto(BASE + '/money/index.html' + hash);
  await page.waitForFunction(() => !document.querySelector('#sync').textContent.includes('загружаю'));
  await page.waitForFunction((who) => window.__cash && window.__cash.state() && window.__money.by === who, who);
  return page;
}
const page = await open('money');


// ---- one compute, and everything that must be true of any model ----
const LISTS = ['inflows', 'team', 'taxes', 'other', 'div'];
// The sections a month is shown in: the lists, and «Подписки» — the rows of «Прочие расходы» that say `sub`.
const SECS = ['inflows', 'team', 'taxes', 'subs', 'other', 'div'];
const held = { runs: 0, bad: [] };
// What §5 asks of every model, whatever went in. The numbers are the design's (live-spec-2 §5, which restates
// live-spec §5): 1 END = NOW + IN − OUT; 3 a ledger row closes one line (or one set of lines it is the sum of) unless a
// founder linked it by hand, and only a withdrawal shares a founders' row with the next withdrawal; 5 every open
// dated line is counted once, on one day, and what is done, doubted, missed, switched off or late-and-out is counted
// nowhere; 7 a hand mark is inside «сейчас» only while no statement uploaded after it has reached its day and only
// if it is later than the typed balance; 16 no total while an account in use has no balance; 18 the forecast holds
// nothing no founder wrote; 19 one occurrence per month of a «каждый месяц» row, none outside its months; 20–21 a
// month its label paid is never late, missed or part, and a chain carries at most one unpaid month; 23 a withdrawal
// is never late or in a card, is whose its row says, and holds no more than its rows are worth nor than its own
// sum - nor do the withdrawals together hold more than the rows they share; 22 «Можно
// вывести» never asks more of a day than that day holds after taxes and the cushion; 24 VAT accrued from facts is
// the ledger's own figure; 25–27 one bill per tax period, a closed period reserves nothing, a rule that is off,
// away or unconfirmed counts nowhere; 31 no key names a founder. And G: the month's columns add up.
const addM = (ym, k) => { const n = +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1 + k; return Math.floor(n / 12) + '-' + String((n % 12) + 1).padStart(2, '0'); };
const addD = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
function inv(M, P, L) {
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
  // (rows that repeat are written out to the month of T+120, or - further - as many months ahead as «Касса» is drawn)
  const far120 = addD(M.T, 120).slice(0, 7), farM = addM(ymT, M.months.more);
  const g1 = far120 > farM ? far120 : farM;
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
  // 23, «Чей вывод» (12 October 2026): the model says of a withdrawal what its row says - a founder, or nobody - and
  // of nothing else; and a withdrawal that is somebody's holds no row of another block, save one a founder named by
  // hand. (The second half needs the ledger, which C() hands in and holds() does not.) Since 17 October 2026 (N) a
  // row says it by its name too: nobody chosen (no `whose`, and not whose:"" - «общий» chosen by hand), and the whole
  // name one founder's own, in Latin or in Russian, case and spaces aside.
  const FND = ['mika', 'misha', 'vanya'], NM = new Map([['mika', 'mika'], ['мика', 'mika'], ['misha', 'misha'], ['миша', 'misha'], ['vanya', 'vanya'], ['ваня', 'vanya']]), byName = (n) => NM.get(String(n == null ? '' : n).trim().toLowerCase()) || '';
  M.items.forEach((it) => { const r = (rows[it.src === 'occ' ? it.row : it.id] || {}).r || {};
    say((it.whose || '') === (it.wd ? (FND.includes(r.whose) ? r.whose : r.whose === '' ? '' : byName(r.name)) : ''), `23: ${it.id} is not whose its row says`); });
  if (L) { const blk = Object.fromEntries((L.tx || []).concat(L.inbox || []).map((r) => [String(r.id), r.c]));
    M.items.forEach((it) => { if (it.wd && it.whose) say(it.rows.every((id) => blk[id] === it.whose || hand.has(String(id))), `23: ${it.id} is ${it.whose}'s and holds a row of another block`); });
    // … and a row of the table is counted once (13 October 2026): a withdrawal holds no more than its rows are
    // worth nor than its own sum, and the withdrawals together no more than the rows they hold between them -
    // however the rows were dealt, and whatever a mark remembers. (The rows in pounds: a withdrawal in another
    // currency is left out of that half, and one a founder gave a row by hand out of all of it.)
    const worth = Object.fromEntries((L.tx || []).concat(L.inbox || []).map((r) => [String(r.id), Math.abs(+r.a || 0)]));
    const wds = M.items.filter((it) => it.wd && it.rows.length && !it.rows.some((id) => hand.has(String(id))));
    const gbp = wds.filter((it) => it.cur === 'GBP'), of = (ids) => sum(ids.map((id) => worth[id] || 0));
    gbp.forEach((it) => say(it.wd.got <= of(it.rows) + 0.011, `23: the withdrawal ${it.id} holds ${it.wd.got}, more than its rows are worth`));
    wds.forEach((it) => say(it.wd.got <= it.amt + 0.011, `23: the withdrawal ${it.id} holds ${it.wd.got}, more than its own sum`));
    if (gbp.length === wds.length) say(sum(gbp.map((it) => it.wd.got)) <= of([...new Set(gbp.flatMap((it) => it.rows))]) + 0.011, '23: the withdrawals hold more than the rows of the table they share are worth'); }
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
  Object.entries(M.months.by).forEach(([m, lists]) => SECS.forEach((k) => {
    lists[k].rows.forEach((id) => { placed[id] = (placed[id] || 0) + 1; say(by[id] && by[id].ym === m && by[id].sec === k && (k === 'subs' ? by[id].list === 'other' && by[id].sub : by[id].list === k && !by[id].sub), `months: ${id} is in the wrong month or section`); });
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
// about history — plan.ser, tails, the cautious switch, plan.vat, and on the rows sure, extra, inv, src, cyc. And
// `f` on a withdrawal: the upgrade from v2 left it on every draw it moved to «Дивиденды», and it is not whose the
// withdrawal is (that is `whose`, which IS read).
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
      (other.div || []).forEach((x) => { if (!x.ptax) x.f = x.f === 'vanya' ? 'misha' : 'vanya'; });
    }
    return { model, deaf: model === JSON.stringify(window.__money.compute(JSON.parse(a), other, t, o)), again: model === JSON.stringify(window.__money.compute(JSON.parse(a), JSON.parse(b), t, o)) };
  }, [led, P, day, opts]);
  const M = JSON.parse(r.model);
  // The invariants read the plan as the engine did: a plan older than v3 is upgraded first.
  const bad = inv(M, P.v >= 3 ? P : await up(P, led, day), led);
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
  if (SHARD && place++ % SHARD.of !== SHARD.k - 1) return;
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
    [true, '2026-10-05', ['rA@2026-10 typed occ due 2026-10-28 8000', 'rA@2026-11 typed occ due 2026-11-28 8000', 'rA@2026-12 typed occ due 2026-12-28 8000', 'rA@2027-01 typed occ due 2027-01-28 8000', 'rA@2027-02 typed occ due 2027-02-28 8000', 'rA@2027-03 typed occ due 2027-03-28 8000', 'rA@2027-04 typed occ due 2027-04-28 8000', 'rB@2026-10 typed occ due 2026-10-20 -6000', 'rB@2026-11 typed occ due 2026-11-20 -6000', 'rB@2026-12 typed occ due 2026-12-20 -6000', 'rB@2027-01 typed occ due 2027-01-20 -6000', 'rB@2027-02 typed occ due 2027-02-20 -6000', 'rB@2027-03 typed occ due 2027-03-20 -6000', 'rB@2027-04 typed occ due 2027-04-20 -6000', 'rS@2026-11 typed occ due 2026-11-03 -120', 'rS@2026-12 typed occ due 2026-12-03 -120', 'rS@2027-01 typed occ due 2027-01-03 -120', 'rS@2027-02 typed occ due 2027-02-03 -120', 'rS@2027-03 typed occ due 2027-03-03 -120', 'rS@2027-04 typed occ due 2027-04-03 -120'], [], 'cushion'],
    '… «Денег сейчас»; every line is a month of a written row, generated to the sixth month after this one (it was the month of T + 120 until «Касса» was drawn six months ahead); no card — and УСН, with no receipt on its account anywhere, asks nothing');
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
  same([M.months.list, M.months.by['2026-10'].inflows, M.months.by['2026-11'].other, M.months.by['2026-10'].other], [['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'], { rows: ['rA@2026-10'], expected: 8000, done: 0 }, { rows: ['rS@2026-11'], expected: 120, done: 0 }, { rows: [], expected: 0, done: 0 }],
    'the constructor walks this month and the six after it (the owner\'s decision of 9 October 2026; it was the two that sixty days reach); a month holds the months of the repeating rows, in date order');
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
  same([M.free.wd, M.outParts.div, item(M, 'wd').wd, M.cards.length], [{ gbp: 10000, n: 1, date: '2026-10-10' }, 10500, { from: '2026-09-30', to: '2026-10-30', got: 0, by: [] }, 0], '… «В плане уже выводы: £10,000 (10 окт). Сверх них сегодня можно вывести ещё £7,700»; it is in «дивиденды» of «Уйдёт»');
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
  // the tick taken off October, the row's first month: one month is all that is left of the repeat, and a repeat of
  // one month is an ordinary row (Mika, 8 October 2026: such a row kept its name locked and said «повтор закончится»)
  Q = await wr(P, 'untick', oct);
  same(['rec' in Q.team[0], Q.team[0].date, Q.team[0].amt], [false, '2026-10-20', 6000], 'the tick taken off the row\'s first month: nothing repeats any more, so the row is an ordinary row of that month again — no rec');
  M = await C(L, Q, T, H60);
  same([M.OUT, M.items.filter((it) => it.row === 'rB').map((it) => [it.id, it.src].join(' '))], [12400, ['rB row']], '… OUT 12,400, and it is one item: the row itself');
  // … and what had been said of that one month is the row's own again
  Q = await wr(await wr(await wr(P, 'set', oct, { amt: 6500, date: '2026-10-22' }, TAP, BY), 'mark', oct, T, TAP, BY), 'untick', oct);
  same(['rec' in Q.team[0], Q.team[0].amt, Q.team[0].date, Q.team[0].paid], [false, 6500, '2026-10-22', { on: T, at: TAP, by: BY }], '… with the sum, the day and the «оплачено» that had been that month\'s alone');
  // taken off a later month, the repeat ends after it and can be brought back
  Q = await wr(P, 'untick', nov);
  same(Q.team[0].rec, { day: 20, from: '2026-10', to: '2026-11' }, 'the tick taken off November\'s month: the repeat ends after it');
  M = await C(L, Q, T, H60);
  same(M.items.filter((it) => it.row === 'rB').map((it) => it.id), ['rB@2026-10', 'rB@2026-11'], '… the row lives in those two months');
  same((await wr(Q, 'resume', nov)).team[0].rec, { day: 20, from: '2026-10' }, '… and «Вернуть» lets it go on');
  // «Ноябрь и дальше» of a delete leaves October alone — the same ordinary row
  Q = await wr(P, 'end', nov);
  same([Q.team.length, 'rec' in Q.team[0], Q.team[0].date], [1, false, '2026-10-20'], '«ноябрь и дальше» of a delete: October is all that is left, and the row is an ordinary row of October');
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
  ok(Object.entries(ids(a)).every(([id, amt]) => !(id in ids(b)) || ids(b)[id] === amt) && Object.keys(ids(b)).filter((id) => !(id in ids(a))).every((id) => id.endsWith('@2027-05')), 'across the end of a month every month both days generate has the same id and amount; the later day only adds the month that came into reach - May, the sixth after November', [Object.keys(ids(a)).length, Object.keys(ids(b)).length]);
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
  same([item(K60, 'debt').state, item(K60, 'debt').day, K60.OUT, K60.END, K60.free.now, K60.months.list, K60.months.by['2027-01'].team], ['due', '2027-01-10', 18400, 33400, 16440, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'], { rows: ['debt', 'rB@2027-01'], expected: 6600, done: 0 }],
    'on 10 Jan, past the sixty days: due on its day and a row of January — a month the constructor walks to — but in no figure of the sixty days, like any row a founder moves that far');
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
  same([A.items.filter((x) => x.src === 'tax' && x.tax.rule === 'usn'), A.taxes.periods.filter((x) => x.rule === 'usn').map((x) => x.state), M.taxes.reserve - A.taxes.reserve, card(A, 11).filter((c) => c.rule === 'usn')], [[], ['away', 'away', 'away', 'away'], 360 + 0, []].map((x) => x),
    '[Платим не со счетов студии] instead: no УСН item or reserve for any period - four of them now that periods are made as far as «Касса» is drawn -, the accrual still shown');
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
  // (17 October 2026: the draw is called «Mika», and a withdrawal whose whole name is a founder's is his by that
  // name - N, the check «records». Until then it was everybody's here. `f`, which the upgrade leaves on it, is read
  // no more than before: the same draw called «Вывод», with the same f, is everybody's.)
  const Xn = JSON.parse(JSON.stringify(X)); Xn.div.find((q) => q.id === 'draw').name = 'Вывод';
  same([item(M, 'draw').wd !== null, item(M, 'draw').whose, 'whose' in r('draw'), item(await C(L, Xn), 'draw').whose, Xn.div.find((q) => q.id === 'draw').f], [true, 'mika', false, '', 'mika'],
    'the draw that came from the old plan carries f: it is Mika\'s by its name «Mika» alone - called «Вывод», with the same f, it is everybody\'s - and the upgrade writes no owner');
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
  // … and paid at another sum than it was planned with, the part has paid what the bank shows: counted at the sum of
  // the row, a part paid over left the difference owed beside it for ever
  M = await C(ledP({ hmrc: two, tx: [filed('p7', '2026-10-07', -1180, 'tax', 'HMRC', { b: 'Barclays', at: AT })] }), Q, '2026-10-08');
  same([item(M, 'pp@2026-10').state, per(M, K).paid, per(M, K).left], ['done', 3480, 0], 'October\'s part of 1,150 paid at 1,180: the quarter has had 3,480 — what the bank shows, not what the row says');
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
  // «30 дней / 60 дней» stands on «Сегодня» and in «Касса · По дням»; in «По месяцам» there is no such switch, and
  // the choice is the one the page keeps in the browser.
  const hb = document.querySelector(`#view-${tab} [data-${p}-h][aria-pressed="true"]`);
  const H = hb ? +hb.dataset[p + 'H'] : (localStorage.getItem('selfstudio-money-days') === '30' ? 30 : 60);
  const live = {};
  const twice = [];
  document.querySelectorAll(`#view-${tab} [data-live]`).forEach((e) => { const k = e.dataset.live; if (k in live) twice.push(k); live[k] = { v: e.dataset.v, t: e.textContent }; });
  const root = document.querySelector(`#view-${tab}`);
  const word = /по истории|в среднем|осторожн/i;
  // Nothing on either tab is a guess, so no «≈» stands anywhere on them — not in a text, not in a label, not in a
  // title: a tax worked out by a rule is muted and says «посчитано по правилу». And no founder is named as a kind of
  // money: a founder's name may stand only where somebody typed it or chose it — a row's own name, who wrote a
  // line, and whose a withdrawal is (in its card's first sentence and in the options of «Чей вывод»).
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
  // (what was paid outside the plan: the month's two sums, and each section's)
  if (k === 'mon.off.out' || k === 'mon.off.in') return ((M.months.by[at.month] || {}).off || {})[k.slice(8)];
  if (k.startsWith('mon.') && k !== 'mon.div.ptax' && k !== 'mon.tax.accrued') { const [, list, f] = k.split('.'), mo = M.months.by[at.month] || {}; return f === 'off' ? (((mo.off || {}).by || {})[list] || {}).gbp : (mo[list] || {})[{ exp: 'expected', done: 'done' }[f]]; }
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
  // «Касса» is the plan by months and by days: the figures of the forecast are on «Сегодня» alone, and none of them
  // has to stand here (until 8 October 2026 the six stood at its head too).
  (tab === 'today' ? MUST.concat(S.M.v0 || S.M.verdict.id === 'vE' ? [] : ['lowday', 'in.n', 'out.team', 'out.other', 'out.taxes', 'out.div'], !S.M.empty ? ['end'] : []) : []).forEach((k) => { if (!(k in S.live)) off.push(`${k}: not on the screen`); });
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
  // A figure by its key: what the screen says of it — or, on «Касса», where the forecast's figures are not drawn any
  // more, what the page's own model holds for it (the model the screen's figures are held against, above).
  S.fig = (k) => (k in S.live ? (isNaN(+S.live[k].v) || S.live[k].v === '' ? S.live[k].v : +S.live[k].v) : tab === 'cash' ? want(S.M, k, S.at) : undefined);
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
  for (const k of ['vat', 'monthly', 'sub']) if (f[k] !== undefined) await pg.setChecked(c + `[data-ed-f="${k}"]`, f[k]);
  if (f.whose !== undefined) await pg.selectOption(c + '[data-ed-f="whose"]', f.whose);
}
const rowIds = (pg) => pg.evaluate(() => { const P = window.__cash.state(); return ['inflows', 'team', 'taxes', 'other', 'div'].flatMap((k) => P[k].map((r) => String(r.id))); });
// «Добавить» → what → the fields → «Добавить». Returns the id the new row was given.
// «Добавить» stood in the head of «Сегодня» and of «Касса» until 8 October 2026. A row is now added where its list
// is — «Касса · По месяцам», «+ новая строка» under the list — so a check that adds one goes there, and comes back
// to «Сегодня» when it is done.
async function openAdd(pg, what) {
  await pg.click('.nav [data-tab="cash"]');
  if ((await pg.getAttribute('#view-cash [data-cs-view="plan"]', 'aria-pressed')) !== 'true') await pg.click('#view-cash [data-cs-view="plan"]');
  await pg.click(`#cs-sec-${what} [data-ed-add]`);
  await pg.waitForSelector(K('add'));
}
const toToday = async (pg) => { await pg.click('.nav [data-tab="today"]'); await pg.waitForSelector('#view-today .page-head'); };
async function addRow(pg, what, f) {
  const before = new Set(await rowIds(pg));
  await openAdd(pg, what);
  await fill(pg, 'add', f);
  await pg.click(K('add') + '[data-ed-save]');
  await toToday(pg);
  return (await rowIds(pg)).find((id) => !before.has(id));
}
// The list of days at its full length, not only the next seven.
// The plan stands by weeks, the one that holds today open: «Раскрыть все недели» opens the rest.
const allDays = async (pg) => { const b = await pg.$('#view-today [data-td-flip="all"]'); if (b && (await b.getAttribute('aria-expanded')) !== 'true') await b.click(); };
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
  ok(/^вт 6 окт · выписки и остатки по 4 окт \(.+\)$/.test(await text(page, '#view-today .page-sub')) && (await text(page, '#view-today .td-at .td-tl')) === 'Денег на 4 окт' && S.M.verdict.id === 'v1' && (await text(page, '#view-today .td-say')).startsWith('По остаткам на 4 октября: денег хватает на 60 дней') && (await texts(page, '#view-today .td-verdict .note')).some((x) => x.startsWith('В разборе ')), 'the head and the first figure say as of which day they speak — 4 Oct, two days back; the sentence answers the question — «денег хватает» — and the one incoming payment nobody has filed, too small to change that answer, is the line under it', [await text(page, '#view-today .page-sub'), await text(page, '#view-today .td-say'), await texts(page, '#view-today .td-verdict .note')]);
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
  ok((await page.$$eval('#view-today .td-days .td-day', (l) => l.length)) <= 8 && /^План на 60 дней/.test(await text(page, '#view-today [aria-label="Ближайшие дни"] h2')) && (await page.$$eval('#view-today .td-wk', (l) => l.map((b) => b.getAttribute('aria-expanded')).join(' '))).startsWith('true false'), '«План на 60 дней» stands by weeks, and only the week that holds today is open: seven day headers at most (and the fold of what was closed in the month)', await texts(page, '#view-today .td-days .td-day b'));
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
        two: k.length === 5 && k[0].top === k[1].top && k[2].top > k[0].top && k[2].top === k[3].top && k[4].top > k[2].top, need: box('#view-today .td-need').top, chart: box('#view-today #td-chart').top, chartH: Math.round(box('#view-today #td-chart').height) };
    });
    ok(r.wide <= w && r.win === w, `${w}px: the page does not scroll sideways`, r);
    ok(r.tab[0] >= 0 && r.tab[1] <= w && r.badge <= w && r.badgeW > 0, `${w}px: «Разбор» and its counter are inside the screen`, r);
    ok(r.two && r.need < r.chart && r.chartH <= 200, `${w}px: the five figures stand two to a row, «Нужно решить» above the chart, the chart no taller than 190`, r);
    await holds(ph, `${w}px`);
    await calm(ph, `${w}px`);
    // The widest things the screen can hold: a row's card, the sheet of balances, «Добавить».
    await ph.click('#view-today .td-days .td-row[data-ed-open]');
    await ph.waitForSelector(K('row'));
    const a = await ph.evaluate(() => document.documentElement.scrollWidth);
    await ph.click('#view-today .td-kpi');
    await ph.waitForSelector(K('bal'));
    const b = await ph.evaluate(() => [document.documentElement.scrollWidth, document.querySelectorAll('[data-ed-card]').length]);
    await openAdd(ph, 'inflows');
    const c = await ph.evaluate(() => document.documentElement.scrollWidth);
    ok(a <= w && b[0] <= w && c <= w && b[1] === 1, `${w}px: nor does it with a row's card open, with the balances open, with «+ новая строка» of «Касса» open — one card at a time`, [a, b, c]);
    await calm(ph, `${w}px with «+ новая строка» open`, 'cash');
    await ph.context().close();
  }
  same([await puts('led', 0), await puts('cash', 0)], [0, 0], '§5.13: loading the page three times, walking its tabs, opening every card and closing none with «Сохранить» wrote nothing');
});


await run('26 on screen', 'day one: an account in use without a balance, and typing it', async () => {
  const L = ledA({ tx: [sheet('bc', '2026-09-15', 40, 'other', 'Bank fee', { b: 'Barclays' })], inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] });
  const pg = await scene('day one', L, planW());
  let S = await holds(pg, 'day one');
  shows(S, { verdict: 'v0', now: '', low: 11000, in: 8000, out: 6120 }, 'the screen');
  same([await text(pg, '#view-today .td-say'), S.live.now.t, (await texts(pg, '#view-today .kpi .lbl'))[2], await text(pg, '#view-today .td-at .td-tw'), await pg.$eval('#view-today .td-need .op', (e) => e.dataset.tdCard)],
    ['Нет остатка: Barclays GBP. Без него итог не посчитать. По плану за 30 дней придёт £8,000 и уйдёт £6,120.', '—', 'Нужно на счетах сегодня', 'не хватает остатка: Barclays GBP', '1'],
    'the sentence names the account and tells the flows; «Денег сейчас» is «—»; the fourth figure is «Нужно на счетах сегодня»; the first card is the balance');
  same([await text(pg, '#view-today [aria-label$="по дням"] h2'), /Barclays GBP\s*—\s*нет остатка/.test(await text(pg, '#view-today .td-accs'))], ['Изменение кассы по днямчерез 30 дней: +£1,880', true], 'the chart is «Изменение кассы по дням», from zero; the line of the account in «Счета» says it has no balance');
  same([await texts(pg, '#view-today .td-verdict button'), (await texts(pg, '#view-today .kpi .hint'))[2], (await texts(pg, '#view-today .td-days .td-dayf')).every((t) => t.includes('от сегодняшнего: ')), await texts(pg, '#view-today .td-acc button')], [['Вписать остатки'], 'чтобы пройти 30 дней без минуса и с запасом £5,000', true, ['Вписать остаток', 'Загрузить выписки']],
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
  same([S.P.banks.length, b.amt, b.asOf, b.by, typeof b.at, 'legacy' in b, S.P.banks[0].asOf, S.P.banks[0].amt, await text(pg, '#view-today .td-at .td-tl')], [2, 15000, T, 'Mika', 'number', false, '2026-09-30', 10120, 'Денег сейчас'], '… one account written into the plan — the amount, today, who — and the other, which nobody touched, left as it was');
  same([await saved(pg), store.cash.puts, store.cash.doc.v, store.cash.doc.savedBy, store.cash.doc.banks.length, store.led.puts], [true, 1, 3, 'Mika', 2, 0], '… saved once, as version 3, signed; the ledger untouched');
  // «Касса» does not repeat the balances: «Счета» on «Сегодня» is where they stand and where they are typed.
  await pg.click('.nav [data-tab="cash"]');
  same([await pg.$('#cs-accts'), await pg.$('#view-cash [data-ed-bal]'), await pg.$('#view-cash .kpis'), await texts(pg, '#view-cash .tabs2 button')], [null, null, null, ['По месяцам', 'По дням']], '«Касса» holds neither the balances, nor a way to type one, nor the six figures — two views of the plan, «По месяцам» and «По дням», and that is all');
  await pg.click('.nav [data-tab="today"]');
  await pg.click('#view-today .td-acc button[data-ed-bal]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => e.dataset.edAcct))], [1, ['Wise|GBP', 'Barclays|GBP']], '«Вписать остаток» under «Счета» opens the sheet with both accounts');
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '9900');
  await pg.click(K('bal') + '[data-ed-save]');
  S = await holds(pg, 'a second balance typed');
  same([S.fig('now'), S.fig('acct.Wise|GBP'), S.P.banks[0].asOf, S.P.banks[0].by, (await text(pg, '#view-today .td-accs')).includes('вписан 6 окт, Mika')], [24900, 9900, T, 'Mika', true], '… Wise typed as 9,900: a balance as of today, signed, and «Денег сейчас» follows');
  await saved(pg);
  await pg.click('#toastUndo');
  await saved(pg);
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
  same([await text(pg, need + '.op-name'), await text(pg, need + '.op-text'), await texts(pg, need + '> .row button'), (await texts(pg, '#view-today .kpi .hint'))[3]],
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
  same([await pg.$(need), (await texts(pg, '#view-today .kpi .hint'))[3]], [null, 'просрочек нет'], '… the card is gone');
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
    ['В плане: вписал Mika 6 окт · каждый месяц, 28-го · в таблице это Client A.', ['Получено', 'Частично…', 'Перенести на…', 'Не придёт', 'Убрать', 'Что если…', 'Закрыть', 'Только октябрь', 'Октябрь и дальше'], true, false], 'the card of October\'s month of Client A: whose row, that it repeats, what can be done with this month — and two ways to save: this month only, or from now on');
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
  S = await holds(pg, 'Tool S no longer repeats');
  same(['rec' in S.P.other[0], S.P.other[0].date, S.M.items.filter((x) => x.row === 'rS').map((x) => x.id)], [false, '2026-11-03', ['rS']], '«каждый месяц» unticked on Tool S\'s November, the month it starts: nothing repeats, so it is an ordinary row of 3 November again');
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
// A row of a month's section, its one box - the sum - and the button at its end that opens its card.
const cs = (k, id) => `#cs-sec-${k} tr[data-cs-id="${id}"]`;
const box = (k, id, f) => `${cs(k, id)} [data-cs-f="${f}"]`;
const more = (k, id) => `${cs(k, id)} .cs-mo [data-ed-open]`;
const listed = (pg, k) => pg.$$eval(`#cs-sec-${k} tr[data-cs-id]`, (l) => l.map((tr) => tr.dataset.csId));
// The row's card, opened under it (left open if it is already).
async function rowCard(pg, k, id) {
  if (!(await pg.$(cs(k, id) + '.cs-open'))) await pg.click(more(k, id));
  await pg.waitForSelector(`#cs-sec-${k} tr.cs-edrow ` + K('row'));
}
// What a row answers to — «Получено», «Не платим», «Удалить» … — is in its card: the card, then the button.
async function rowDo(pg, k, id, verb) { await rowCard(pg, k, id); await pg.click(K('row') + `[data-ed-do="${verb}"]`); }
// What is not the sum is changed in the card too, and saved: for a month of a «каждый месяц» row that month alone,
// unless `onward`.
async function rowSet(pg, k, id, f, onward) {
  await rowCard(pg, k, id);
  await fill(pg, 'row', f);
  await pg.click(K('row') + (onward ? '[data-ed-save="onward"]' : '[data-ed-save]'));
}
// A row as it is drawn: its classes; whether its name is struck through; whether it is counted; name, amount,
// currency, day (a row that is done says it in words), bank; the one remark.
const csRow = (pg, k, id) => pg.$eval(cs(k, id), (tr) => {
  const t = (s) => { const e = tr.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const amt = tr.querySelector('[data-cs-f="amt"]'), done = tr.classList.contains('cs-done');
  return [tr.className.replace(/\bcs-(r|open)\b/g, '').replace(/\s+/g, ' ').trim() || 'typed', getComputedStyle(tr.querySelector('.cs-nt')).textDecorationLine, done ? 'no tick' : tr.classList.contains('cs-off') ? 'off' : 'on',
    t('.cs-nt'), amt ? amt.value : t('.cs-at'), t('.cs-ct'), done ? t('.cs-dd') : tr.querySelector('.cs-dd').dataset.csD, tr.querySelector('.sw').title, t('[data-cs-rm]')].join(' | ');
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

await run('kassa figures', '«Касса» is the plan by months and by days, and repeats nothing «Сегодня» says', async () => {
  // Mika, 8 October 2026: «давай уберем оттуда информацию которая задваивается из Сегодня … просто вся касса расчётов
  // по месяцам и по дням и всё». It stood the six figures at its head, the balances above the month, the sentence
  // and the chart of the days in «По дням», and «30 дней / 60 дней» with «Добавить» beside its name.
  // Three states of one studio: money enough, a balance missing, a minus.
  const none = JSON.parse(JSON.stringify(demoPlan(T)));
  none.banks.forEach((r) => { delete r.asOf; delete r.at; delete r.by; r.legacy = true; });
  const minus = JSON.parse(JSON.stringify(demoPlan(T)));
  minus.banks.forEach((r) => { r.amt = 0; });
  // The studio without the one incoming payment nobody has filed: with it the sentence is «Сначала разберите…».
  const L0 = { ...demoLedger(T), inbox: [] };
  const there = (pg, list) => pg.evaluate((l) => l.filter((q) => document.querySelector('#view-cash ' + q)), list);
  const GONE = ['.kpis', '#cs-accts', '[data-ed-bal]', '.page-head [data-cs-h]', '.page-head [data-ed-add]', '#cs-chart', '[data-live="say"]', '[data-live="now"]'];
  for (const [name, P, verdict] of [['the fabricated studio', demoPlan(T), 'v1'], ['with no balance typed', none, 'v0'], ['with nothing in the bank', minus, 'v4']]) {
    const pg = await scene('kassa figures', L0, P, { H: 60 });
    const A = await holds(pg, `${name}, «Сегодня»`);
    same(A.M.verdict.id, verdict, `${name}: the sentence of «Сегодня» is ${verdict}`);
    await goCash(pg);
    let B = await holds(pg, `${name}, «Касса · По месяцам»`, 'cash');
    same([await there(pg, GONE), await texts(pg, '#view-cash .tabs2 button'), await pg.$$eval('#view-cash .page-head button', (l) => l.length), await text(pg, '#view-cash .page-sub'), await pg.$$eval('#cs-plan section.cs-rows', (l) => l.length), !!(await pg.$('#cs-cov'))],
      [[], ['По месяцам', 'По дням'], 0, await (async () => { await pg.click('.nav [data-tab="today"]'); const t = await text(pg, '#view-today .page-sub'); await goCash(pg); return t; })(), 6, true],
      `${name} (${verdict}): «По месяцам» is the month, its six sections and «Покрытие по банкам» — no figures of the forecast, no balances, nothing in the head but the name and the day it speaks of`);
    await goCash(pg, 'days');
    B = await holds(pg, `${name}, «Касса · По дням»`, 'cash');
    same([await there(pg, GONE), await texts(pg, '#cs-scope [data-cs-h]'), await pg.$eval('#cs-scope [data-cs-h][aria-pressed="true"]', (b) => b.textContent), !!(await pg.$('#cs-cal')), !!(await pg.$('#cs-stmt')), !!(await pg.$('#cs-covd'))],
      [[], ['30 дней', '60 дней'], '60 дней', true, true, true],
      `… «По дням» is the calendar, the statement by days and «Покрытие по банкам», with «30 дней / 60 дней» beside the choice of an account — the one view that choice changes; no sentence of all the accounts, no chart`);
    // Of all the accounts together the sentence is the one «Сегодня» opens with, and is not said here; of one bank it is this view's own.
    const card = async () => ((await pg.$('#cs-answer')) ? plain(await text(pg, '#cs-answer h2')).replace(/на \d+ дней.*/, '') : '');
    const all = await card();
    await pg.click('#cs-scope [data-cs-scope="Mosta"]');
    const one = await card();
    await pg.click('#cs-scope [data-cs-scope="__all"]');
    same([all, one], [{ v1: 'Как подстраховаться', v0: '', v4: 'Как закрыть' }[verdict], 'Итог'],
      `… of all the accounts «По дням» says only what to do — ${all ? '«' + all + '»' : 'nothing, while a balance is missing'} — and of one bank, «Итог» with that bank's own sentence`);
    // Its «30 дней» is the same switch as the one on «Сегодня».
    await pg.click('#cs-scope [data-cs-h="30"]');
    B = await holds(pg, `${name}, 30 days chosen in «Касса»`, 'cash');
    await pg.click('.nav [data-tab="today"]');
    const A30 = await holds(pg, `${name}, back on «Сегодня»`);
    same([A30.H, B.H, A30.fig('in'), A30.fig('out')], [30, 30, B.M.IN, B.M.OUT], '… «30 дней» pressed in «Касса» is 30 days on «Сегодня» too');
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
  same([plain60.M.now, plain60.M.IN, plain60.M.OUT, plain60.M.LOW, await pg.$$eval('#view-cash [data-cs-fx], #view-cash #cs-horizon, #view-cash #cs-cushion, #cs-accts input', (l) => l.length)], [M0.now, M0.IN, M0.OUT, M0.LOW, 0], '§5.14: the page reckons the same figures whatever plan.fx, plan.horizon and banks[].on say — and «Касса» has no box for a rate, a horizon or a balance');
  // … and every word of both halves is what the same plan without those oddities draws.
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
  await rowDo(pg, 'team', g, 'paid');
  S = await holds(pg, '«✓ оплачено»', 'cash');
  shows(S, { now: 9000, out: 6120, marks: -1000 }, '«Оплачено» in the card the row opens');
  const r = stored(S, g);
  same([S.M.END, S.M.now, JSON.stringify(S.P.banks) === banks, r.paid.on, r.paid.by, typeof r.paid.at, 'paidAdj' in r, acct(S.M, 'Wise|GBP').est, S.P.banks[0].amt + ' ' + S.P.banks[0].asOf], [10880, 9000, true, T, 'Mika', 'number', false, 9000, '10120 2026-09-30'],
    '… END unchanged, NOW with the words «в т.ч. отмечено вручную» under it, plan.banks deep-equal (§5.8): the mark is {on: today, at, by} on the row, the typed balance still reads £10,120 as of 30 Sep, and only the reckoning beside it is 1,000 lower');
  same([await csRow(pg, 'team', g), await toastText(pg)], ['cs-done | line-through | no tick | Person G | 1,000 | GBP | 7 окт | Wise | отмечено · ждёт выписку', 'Оплачено: Person G'], '… the row stays in its place in October, struck through, and says the mark waits for a statement');
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
  same([S.M.END, S.M.now, S.M.marksGbp, item(S.M, g).done.by, item(S.M, g).done.day], [10880, 9000, 0, 'row', T], '… NOW 9,000 with nothing of it a mark any more, END where it was; the line is closed by the row');
  await openDay(pg, T);
  same((await dayRows(pg, T)).filter((x) => x.startsWith(g)), [`${g} | cs-ispaid cs-done | line-through | по выписке 6 окт | no date | no фикс |  | −£1,000`], '… and now stands under the day of the statement\'s row, 6 Oct — «по выписке», with nothing left to press');
  await pg.click('#view-cash [data-cs-view="plan"]');
  await rowCard(pg, 'team', g);
  same([(await csRow(pg, 'team', g)).split(' | ').slice(0, 3), /Закрыто.*6 окт/.test(await text(pg, K('row') + '.ed-why'))], [['cs-done', 'line-through', 'no tick'], true], '… the same in its month: struck through, and its card says which day of the statement closed it');
  await pg.click(K('row') + '[data-ed-x]');
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
  same([old.paid, 'paidAdj' in old, await csRow(po, 'team', old.id), S.P.banks[0].amt, S.P.banks[0].legacy], [{ on: '', legacy: true }, false, 'cs-done | line-through | no tick | Person G | 1,000 | GBP | 7 окт | Wise | отмечено в старой Кассе', 9000, true], 'a row the old Касса had as «оплачено» is done on that old word; the note of what it once did to a balance is dropped');
  await rowDo(po, 'team', old.id, 'unpaid');
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
    const r = await pg.evaluate(() => { const a = document.querySelector('#cs-answer').getBoundingClientRect(); const bar = document.querySelector('.topbar').getBoundingClientRect(); const stuck = bar.bottom; return { top: Math.round(a.top - stuck), inView: a.top < window.innerHeight / 2, y: Math.round(window.scrollY), sel: (document.querySelector('#cs-stmt tr.cs-sel') || { dataset: {} }).dataset.csRow, view: window.__cash.at().view }; });
    ok(r.view === 'days' && r.sel === '2026-10-12' && r.top >= 0 && r.inView, `${w}px: «Как закрыть» opens «По дням» on the first day short, with what to do about it in view under the bar`, r);
    same([plain(await text(pg, '#cs-answer h2')).replace(/на \d+ дней.*/, ''), await pg.$('#cs-answer .cs-hl')], ['Как закрыть', null], `${w}px: … and the card there is «Как закрыть» — the stretch itself is said once, by the sentence of «Сегодня»`);
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
// The six figures by their place. On «Сегодня» the first — the money now — is the last line of «Счета», and the
// other five stand under «Аналитика».
const kpi = async (pg, i, tab = 'today') => { const tidy = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); const l = await pg.$$eval(`#view-${tab} .kpi`, (k) => k.map((e) => [e.querySelector('.lbl').textContent, e.querySelector('.val').textContent, e.querySelector('.hint').textContent].map((s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()))); if (tab === 'today') l.unshift((await pg.$eval('#view-today .td-at', (e) => [e.querySelector('.td-tl').textContent, e.querySelector('[data-live="now"]').textContent, e.querySelector('.td-tw').textContent])).map(tidy)); return l[i]; };
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
  same([await freeSays(pg), await texts(pg, '#view-today .td-free button'), await pg.$('#td-chart'), await text(pg, '#view-today [aria-label$="по дням"] .note')], ['Сколько можно вывести, скажу, когда в плане будут расходы: впереди их не вписано — заполните октябрь. На счетах £32,000, из них £4,800 — под налоги.', ['Заполнить октябрь'], null, 'План пуст — линии пока нет.'],
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
  same([await texts(pg, K('add') + '[data-ed-kind]'), await pg.$eval(K('add') + '[data-ed-kind].active', (e) => e.textContent), await pg.$eval('#ed-amt', (e) => e.value), await pg.$eval('#ed-date', (e) => e.value), await texts(pg, K('add') + '[data-ed-what]')], [['Вывод', 'Личный налог'], 'Вывод', '17700', T, ['Поступление', 'Команда', 'Подписка', 'Прочий расход', 'Налог студии', 'Дивиденды']],
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
  await openAdd(pg, 'div');
  await pg.click(K('add') + '[data-ed-kind="ptax"]');
  await fill(pg, 'add', { name: 'HMRC Vanya', amt: 400, date: '2026-10-21' });
  await pg.click(K('add') + '[data-ed-save]');
  await toToday(pg);
  S = await holds(pg, 'a personal tax typed');
  const pt = S.P.div.find((r) => r.name === 'HMRC Vanya');
  same([pt.ptax, pt.f, pt.blk, S.fig('out.ptax'), S.fig('out.taxes'), item(S.M, pt.id).grp], [true, 'vanya', 'div', 900, 360, 'div'], '«Личный налог» HMRC Vanya £400: a row of «Дивиденды» with ptax — «личные налоги» +400, the studio\'s taxes untouched');
  await goCash(pg);
  same([await text(pg, '#cs-sec-div h2'), await pg.$$eval('#cs-sec-div th', (l) => l.length)], ['Дивиденды£20,400 · в т.ч. личные налоги £400', 0], 'in the constructor «Дивиденды» is one list — withdrawals and personal taxes — and its total says what part of it is tax');
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
  // The tick taken off October, the row's first month: the card says the row will not repeat, and it becomes an
  // ordinary row.
  await openRow(pg, 'rB@2026-10');
  await fill(pg, 'row', { monthly: false });
  same([await text(pg, K('row') + '[data-ed-n="monthly"]'), await texts(pg, K('row') + '[data-ed-save]')], ['строка больше не будет повторяться', ['Убрать повтор']], 'the tick taken off in the card of the row\'s first month: «строка больше не будет повторяться», and one button, «Убрать повтор» — there is no «после октября» to end it after');
  await save('only');
  S = await holds(pg, '«каждый месяц» unticked on October');
  same(['rec' in S.P.team[0], S.P.team[0].date, S.fig('out'), await toastText(pg)], [false, '2026-10-20', 12400, 'Person B: больше не повторяется'], '«каждый месяц» unticked on October\'s month: an ordinary row of 20 October, OUT 12,400');
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
  same(['rec' in S.P.team[0], S.P.team[0].date, S.fig('out')], [false, '2026-10-20', 12400], '«Не платим → ноябрь и дальше»: the repeat ends with October — one month is left of it, so Person B is an ordinary row of 20 October');
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
  await rowDo(pg, 'team', h0 + '@2026-11', 'on');
  S = await holds(pg, 'the repeat switched back on in November', 'cash');
  same([nov(S.M), stored(S, h0).rec.x], [12300, undefined], '«Вернуть в план» in its card → November counts both: 12,300');
  await finish(pg);
});

await run('repeat', '«каждый месяц» is a plain control on every kind of row, in every place a row is changed — and a tax worked out by a rule has none', async () => {
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
  // «+ новая строка»: the card that adds a row, of whatever kind.
  await openAdd(pg, 'inflows');
  const inAdd = [];
  for (const k of ['inflows', 'team', 'other', 'taxes', 'div']) { await pg.click(K('add') + `[data-ed-what="${k}"]`); inAdd.push(await pg.$eval(K('add') + '[data-ed-f="monthly"]', (e) => e.closest('label').textContent.replace(/ /g, ' ').trim())); }
  same(inAdd, ['каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата', 'каждый месяц нужна дата'], '«Добавить»: the same tick whatever is being added — and it says a date is needed while there is none');
  await pg.fill(K('add') + '#ed-date', '2026-10-25');
  same(await text(pg, K('add') + '[data-ed-n="monthly"]'), '25-го числа, с октября', '… with a date typed it says «25-го числа, с октября»');
  await pg.click(K('add') + '[data-ed-what="team"]');
  await pg.fill(K('add') + '#ed-name', 'Person B');
  same(await text(pg, K('add') + '[data-ed-n="also"]'), 'В октябре у Person B уже стоит строка «каждый месяц» £6,000 — эта добавится к ней.', 'a one-off row typed for somebody who already has a row «каждый месяц» in that month is told it will ADD to it — nothing is taken out of the other');
  await pg.click(K('add') + '[data-ed-x]');
  // «Касса · По месяцам»: a row is one line with one box, its sum; «каждый месяц» is a tick in the card it opens.
  await goCash(pg);
  const col = [];
  for (const [k, id] of ONES) {
    const boxes = await pg.$$eval(cs(k, id) + ' input, ' + cs(k, id) + ' select', (l) => l.map((e) => e.dataset.csF).join(','));
    await rowCard(pg, k, id);
    col.push(boxes + ' ' + (await pg.$eval(K('row') + '[data-ed-f="monthly"]', (e) => [e.type, e.checked].join(' '))));
    await pg.click(K('row') + '[data-ed-x]');
  }
  same(col, ONES.map(() => 'amt checkbox false'), '«Касса · По месяцам»: a row of every list holds one box, its sum, and «каждый месяц» is a plain tick in its card');
  const taxHere = !!(await pg.$(cs('taxes', TAX)));
  if (taxHere) await rowCard(pg, 'taxes', TAX);
  same([taxHere, taxHere && (await pg.$(K('row') + '[data-ed-f="monthly"]'))], [true, null], '… the computed tax has none there either');
  await rowCard(pg, 'team', 'rB@2026-10');
  same([await pg.isChecked(K('row') + '[data-ed-f="monthly"]'), (await texts(pg, K('row') + '.ed-foot [data-ed-do]')).slice(0, 2), await pg.$$eval('#view-cash [data-ed-card]', (l) => l.length), await csRow(pg, 'team', 'rB@2026-10')], [true, ['Оплачено', 'Частично…'], 1, 'typed | none | on | Person B | 6000 | GBP | 2026-10-20 | Wise | '],
    '… ticked on a row that repeats; beside «Оплачено» every card has the third answer, «Частично…»; and one card is open at a time');
  await pg.click(K('row') + '[data-ed-x]');
  // Ticked in the card: the row repeats from its own month.
  await rowSet(pg, 'other', 'o1', { monthly: true });
  S = await holds(pg, 'the tick in the card of a row of the month', 'cash');
  same([stored(S, 'o1').rec, await toastText(pg), await listed(pg, 'other')], [{ day: 12, from: '2026-10' }, 'Сохранено: Thing N', ['o1@2026-10']], 'ticked on «Thing N»: the row repeats on the 12th from October');
  await rowSet(pg, 'other', 'o1@2026-10', { monthly: false });
  S = await holds(pg, 'the tick taken off', 'cash');
  same(['rec' in stored(S, 'o1'), stored(S, 'o1').date, await pg.$('#cs-sec-other tr.cs-line'), await listed(pg, 'other'), await csRow(pg, 'other', 'o1'), await toastText(pg)], [false, '2026-10-12', null, ['o1'], 'typed | none | on | Thing N | 40 | GBP | 2026-10-12 | Wise | ', 'Thing N: больше не повторяется'],
    'taken off in the month it was put on: nothing repeats, so «Thing N» is the ordinary row it was — no «повтор закончится», and nothing to bring back but the tick itself');
  // Taken off a later month, the repeat ends after that month; the row says so, and the tick put back is the way back.
  await rowSet(pg, 'other', 'o1', { monthly: true });
  await toMonth(pg, '2026-11');
  await rowSet(pg, 'other', 'o1@2026-11', { monthly: false });
  S = await holds(pg, 'the tick taken off November', 'cash');
  same([stored(S, 'o1').rec, await text(pg, cs('other', 'o1@2026-11') + ' [data-cs-rm]'), await toastText(pg)], [{ day: 12, from: '2026-10', to: '2026-11' }, 'повтор закончится после ноября', 'Thing N: повтор закончится после ноября'], 'taken off November: the repeat ends after it, and the row says «повтор закончится после ноября»');
  await rowSet(pg, 'other', 'o1@2026-11', { monthly: true });
  S = await holds(pg, 'the tick put back', 'cash');
  same([stored(S, 'o1').rec, await toastText(pg)], [{ day: 12, from: '2026-10' }, 'Thing N: повтор продолжается'], 'the tick put back in the card: the repeat goes on');
  await toMonth(pg, '2026-10');
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
  const add = async (f, of) => { await openAdd(pg, 'taxes'); await fill(pg, 'add', f); const was = await ofSel(); if (of !== undefined) await pg.selectOption(K('add') + '[data-ed-f="of"]', of); await pg.click(K('add') + '[data-ed-save]'); await toToday(pg); return was; };
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
  await openAdd(pg, 'taxes');
  await fill(pg, 'add', { name: 'Corporation tax', amt: 5500, date: '2026-11-01', bank: 'Barclays' });
  same(await ofSel(), ['', 'Выберите, к чему относится'], '«Corporation tax» 5,500 on 1 Nov: no word of a rule in its name, near the VAT date at about its size — the select stands on «Выберите, к чему относится»');
  await pg.click(K('add') + '[data-ed-save]');
  same([(await rowIds(pg)).length, await toastText(pg), !!(await pg.$(K('add')))], [5, 'Выберите, к чему относится этот налог', true], '… and the row is not saved without a choice');
  await pg.selectOption(K('add') + '[data-ed-f="of"]', 'own');
  await pg.click(K('add') + '[data-ed-save]');
  await toToday(pg);
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
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), S.fig('mon.team.done'), await csRow(pg, 'team', oct)], [[oct], 5400, 5400, 'cs-done | line-through | no tick | Person B | 6,000 | GBP | 20 окт | Wise | оплачено £5,400 из £6,000'],
    'in the constructor October — the month it left — holds its one row, closed at what was paid: 5,400 expected, 5,400 done');
  await toMonth(pg, '2026-11');
  S = await holds(pg, 'November with the rest', 'cash');
  same([await csRow(pg, 'team', debt.id), await listed(pg, 'team'), S.fig('mon.team.exp')], ['typed | none | on | Person B — остаток с октября | 600 | GBP | 2026-11-12 | Wise | ', [debt.id, 'rB@2026-11'], 6600],
    '… and November holds the rest as a row of its own, dated the 12th, above November\'s own month of the 20th: 6,600 expected');
  // «По дням»: under its day.
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openDay(pg, '2026-11-12');
  same([await dayLine(pg, '2026-11-12'), await dayRows(pg, '2026-11-12'), await pg.$('#cs-stmt tr[data-cs-row="__carry"]')], [['чт 12 ноя', '£32,420', '—', '−£600', '£31,820', '1'], [`${debt.id} | typed | none | ✓ оплачено|false | date | фикс |  | −£600`], null],
    'in «По дням» it stands under 12 Nov, and the day takes its 600 off the balance — a line with its mark, its date to move and «фикс», like any other; there is no group «Долги без даты»');
  await holds(pg, '«По дням» with the rest', 'cash');
  // «Частично…» in the card of a row of the month asks the same question.
  await goCash(pg);
  ok((await text(pg, '#cs-plan')).includes('«Частично…» — третий ответ: строка закрывается на том, что оплачено, а остаток встаёт отдельной строкой на день, который вы выберете.'), '«Как читать» under the lists says what «Частично…» does: the rest stands on a day the founder chooses — it does not speak of the next month any more');
  await rowDo(pg, 'team', 'rB@2026-11', 'part');
  same([await pg.inputValue(PART), await text(pg, K('row') + '[data-ed-partnote]'), await pg.inputValue(REST)], ['', 'из £6,000', ''], '«Частично…» in the card of a row of the month asks the same question, empty where no payment has come — the sum and the day alike');
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
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), S.fig('mon.team.done'), await csRow(pg, 'team', debt.id)], [[oct, debt.id], 6000, 5400, 'typed | none | on | Person B — остаток с октября | 600 | GBP | 2026-10-30 | Wise | '],
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
  same([await listed(pg, 'team'), S.fig('mon.team.exp'), await csRow(pg, 'team', next.id)], [[next.id, 'rB@2026-12'], 6400, 'typed | none | on | Person B — остаток с октября | 400 | GBP | 2026-12-15 | Wise | '], 'in the constructor it is a row of December, above December\'s own month: 6,400 expected');
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
  same([await text(pg, K('row') + '.ed-why'), await texts(pg, K('row') + '.ed-foot button'), await pg.inputValue(K('row') + '#ed-date')], ['В плане: вписал Mika 22 окт · остаток с октября · в таблице это Person B. Даты нет, но в расчёт идёт: это долг студии. Поставьте дату, когда она станет известна.', ['Оплачено', 'Частично…', 'Удалить', 'Закрыть', 'Сохранить'], ''],
    'its card says it has no date and is counted all the same, and offers «Оплачено», «Частично…» and «Удалить»');
  await pg.click(K('row') + '[data-ed-x]');
  await goCash(pg);
  same([await listed(pg, 'inflows'), await csRow(pg, 'inflows', 'owed')], [['rR@2026-10', 'rA@2026-10', 'owed'], 'typed | none | on | Client A — остаток с сентября | 1000 | GBP |  | Barclays | без даты · в расчёт не идёт, пока не поставите дату'], 'in the constructor what the client owes is a row of October with no date — «без даты · в расчёт не идёт, пока не поставите дату»');
  await toMonth(pg, '2026-11');
  await holds(pg, 'November with the debt', 'cash');
  same([await csRow(pg, 'team', 'debt'), await listed(pg, 'team')], ['typed | none | on | Person B — остаток с октября | 600 | GBP |  | Wise | без даты · в расчёте с 1 ноября', ['rB@2026-11', 'debt']], '… the debt a row of November, its date still to be given, after November\'s own month');
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
  await rowDo(pg, 'team', 'debt', 'part');
  same([await text(pg, K('row') + 'label[for="ed-partdate"] span'), await text(pg, ASK + ' > .note:last-child'), await pg.inputValue(REST)], ['Когда заплатите остаток', 'Строка закроется за ноябрь на том, что оплачено. Остаток встанет отдельной строкой на выбранный день.', ''], '«частично» on the debt: the question asks for the day of the rest');
  await answer(pg, 100, '2026-11-25');
  S = await holds(pg, '100 of the debt paid, the rest on 25 Nov', 'cash');
  const next = S.P.team.find((r) => r.carry && r.id !== 'debt');
  same([stored(S, 'debt').paid.amt, stored(S, 'debt').date, stored(S, 'debt').mon, !!next && [next.name, next.amt, next.date, 'mon' in next, next.carry], states(S.M, ['debt', next && next.id]), item(S.M, next && next.id).day, await toastText(pg), await listed(pg, 'team')],
    [100, '', '2026-11', ['Person B — остаток с октября', 500, '2026-11-25', false, { ym: '2026-10' }], ['done', 'due'], '2026-11-25', 'Person B — остаток с октября: оплачено £100 из £600, остаток — на ср 25 ноя', ['rB@2026-11', next && next.id, 'debt']],
    '100 of it paid, the rest on 25 Nov: the old row is closed at 100 where it stood, and the 500 is a dated row with the same name and the same month of origin — due on the 25th, no longer a debt «без даты»');
  // … or simply types its date.
  await toMonth(pg, '2026-12');
  same(await csRow(pg, 'other', 'far'), 'typed | none | on | Printer — остаток с ноября | 300 | GBP |  | Wise | без даты · в расчёте с 1 декабря', 'December\'s debt, as it was written');
  await rowSet(pg, 'other', 'far', { date: '2026-12-05' });
  S = await holds(pg, 'a date given to the debt of December in its card', 'cash');
  same([stored(S, 'far').date, 'mon' in stored(S, 'far'), stored(S, 'far').carry, item(S.M, 'far').state, item(S.M, 'far').day, S.M.items.filter((it) => it.state === 'carry').length], ['2026-12-05', false, { ym: '2026-11' }, 'due', '2026-12-05', 0], 'a date given to it: from then on it is a dated row, due on its day — and no row of the plan is «carry» any more');
  await finish(pg);
});

await run('phone', 'a phone, 375 and 390 wide: nothing scrolls sideways, and the new blocks stand in a sensible order', async () => {
  for (const w of [375, 390]) {
    serve(ledP(), await plan2());
    const ph = await open('phone ' + w, undefined, { w, h: 812 });
    await ph.waitForSelector('#view-today [data-live="verdict"]');
    const r = await ph.evaluate(() => {
      const top = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1; };
      return { wide: document.documentElement.scrollWidth, order: ['.td-verdict', '.kpis', '.td-acc', '.td-month', '.td-free', '.td-need', '[aria-label="Ближайшие дни"]', '#td-chart', '.td-tax'].map((s) => top('#view-today ' + s)), bv: getComputedStyle(document.querySelector('#view-today .td-bv')).fontSize, say: getComputedStyle(document.querySelector('#view-today .td-fsay')).fontSize };
    });
    ok(r.wide <= w, `${w}px: «Сегодня» does not scroll sideways`, r);
    ok(r.order.every((t, i) => t > 0 && (!i || t > r.order[i - 1])), `${w}px: the sentence, the five figures, the accounts, the month, «Можно вывести», what needs deciding, the plan by weeks, and under «Аналитика» the chart and «Налоги» — in that order, one under another`, r.order);
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
    const b = await ph.evaluate(() => { const rows = [...document.querySelectorAll('#cs-sec-team tr.cs-r')], top = (e) => Math.round(e.getBoundingClientRect().top);
      return [document.documentElement.scrollWidth, getComputedStyle(document.querySelector('#cs-two')).gridTemplateColumns.trim().split(/\s+/).length, rows.length > 0 && rows.every((tr) => { const n = tr.querySelector('.cs-nt'), a = tr.querySelector('.cs-amt, .cs-at'), m = tr.querySelector('.cs-more'); return Math.abs(top(n) - top(a)) < 12 && m.getBoundingClientRect().width >= 16; })]; });
    // Nothing of a row of the month is off the screen: no list scrolls sideways inside its card, and every box, tick and button of every row ends inside the phone.
    const inPlan = await ph.evaluate((w) => { const out = []; document.querySelectorAll('#cs-plan .cs-rows .tbl').forEach((t) => { if (t.scrollWidth > t.clientWidth + 1) out.push('a list scrolls inside its card: ' + t.scrollWidth + ' > ' + t.clientWidth); });
      document.querySelectorAll('#cs-plan tr.cs-r input, #cs-plan tr.cs-r select, #cs-plan tr.cs-r button, #cs-plan tr.cs-r .cs-nt, #cs-plan tr.cs-r .cs-rm').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > w + 0.5 || r.left < -0.5)) out.push(e.closest('tr').dataset.csId + ': ' + (e.dataset.csF || e.className || e.tagName) + ' ends at ' + Math.round(r.right)); }); return out; }, w);
    ok(!inPlan.length, `${w}px: every row of the month is whole on the screen — its day, its name, its sum and the arrow that opens its card`, inPlan.slice(0, 5));
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
    ok(b[1] === 1 && b[2] && d[1], `${w}px: the month is one column, a row of it is one line — its name and its sum side by side, the arrow at its end — and in the day list «каждый месяц» is in the card the line's name opens`, [b, d]);
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
  await rowDo(p1, 'inflows', 'c', 'paid');
  await saved(p1);
  const marked = !!store.cash.doc.inflows[1].paid;
  await rowDo(p1, 'inflows', 'c', 'unpaid');
  await saved(p1);
  await rowDo(p1, 'inflows', 'rA@2026-10', 'skip');
  await p1.click(K('row') + '[data-ed-go="skip-only"]');
  await saved(p1);
  same([store.cash.bases, marked, store.cash.doc.inflows.map((r) => [r.id, !!r.paid, r.on, JSON.stringify((r.rec || {}).x || null)].join(' ')), store.cash.doc.v, store.cash.doc.savedBy, store.led.puts], [[rev0, rev0 + 1, rev0 + 2, rev0 + 3, rev0 + 4, rev0 + 5], true, ['rA false true {"2026-10":{"off":true}}', 'c false true null'], 3, 'Mika', 0],
    'a mark, the mark taken back, a month switched off («Не придёт» → «только октябрь»): one PUT each, each on the revision before it — version 3, signed — and the ledger was not written once');
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
  const p4 = await browser.newContext({ viewport: { width: 1320, height: 900 }, ...CALM }).then((c) => c.newPage());
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
  const p5 = await browser.newContext({ viewport: { width: 1320, height: 900 }, ...CALM }).then((c) => c.newPage());
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
  const lf = await browser.newContext({ viewport: { width: 1320, height: 900 }, ...CALM }).then((c) => c.newPage());
  lf.on('pageerror', (e) => errs.push(`file: PAGEERROR ${e.message}`));
  await lf.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await lf.goto('file://' + PUB + '/money/index.html#cash');
  await lf.waitForFunction(() => window.__cash && window.__cash.state());
  same([await lf.evaluate(() => window.__cash.home()), await lf.evaluate(() => window.__cash.state().banks.map((b) => b.bank + ' ' + b.cur + ' ' + b.amt)), await lf.$('#cs-accts input')], ['local', ['Wise GBP 0', 'Wise USD 0', 'Barclays GBP 0', 'Tochka RUB 0', 'Mosta USD 0'], null], 'opened as a file the page keeps the plan in the browser; a new plan names five accounts and waits for their balances');
  await lf.click('.nav [data-tab="today"]');
  await lf.click('#view-today [data-ed-bal]');
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
  await rowDo(pg, 'team', 'g', 'paid');
  same([await toastText(pg), 'paid' in (await look(pg, 'cash')).P.team[1], !!(await pg.$(K('row')))], [LOST, false, true], '… «Оплачено» in its card: refused, and the card is still there to be read');
  await pg.setChecked(K('row') + '[data-ed-f="monthly"]', true);
  await pg.click(K('row') + '[data-ed-save]');
  same([await toastText(pg), 'rec' in (await look(pg, 'cash')).P.team[1]], [LOST, false], '… «каждый месяц» ticked there and saved: refused');
  await pg.click(K('row') + '[data-ed-x]');
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
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 900 }, ...CALM });
  const slow = await ctx.newPage();
  slow.on('pageerror', (e) => errs.push(`upgrade race: PAGEERROR ${e.message}`));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('**/api/founder/money/cash', async (r) => { if (r.request().method() === 'PUT') await sleep(2500); await r.continue(); });
  await slow.clock.install({ time: new Date('2026-10-06T12:00:00+01:00') });
  await slow.goto(BASE + '/money/index.html#cash');
  await slow.waitForSelector('#cs-plan tr[data-cs-id] [data-cs-f="amt"]');
  const rid = await slow.evaluate(() => window.__cash.state().team[0].id), amt0 = store.cash.doc.team[0].amt;
  await slow.fill(box('team', rid, 'amt'), String(amt0 + 7));
  same(await slow.evaluate(() => window.__cash.state().team[0].amt), amt0 + 7, 'the old plan, a slow line: a row\'s sum is typed over while the upgrade is still on its way');
  await slow.waitForFunction(() => /обновите страницу/.test(document.querySelector('#sync').textContent), null, { timeout: 12000 });
  same([await toastText(slow), await slow.evaluate(() => window.__cash.state().team[0].amt), store.cash.doc.team[0].amt, !!(await slow.$('#cs-stale'))], [LOST, amt0 + 7, amt0, true], '… the upgrade is refused, and the page says the change was not kept instead of quietly showing the old sum under «сохранено»');
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
  same([await pg.$$eval('#view-cash [data-cs-data], #view-cash #cs-data, #view-cash [data-cs-export]', (l) => l.length), await pg.$eval('#cs-old', (e) => e.open), await text(pg, '#cs-old summary'), await pg.evaluate(() => /скопировать/i.test(document.querySelector('main').textContent))], [0, false, 'Загрузить план из старой Кассы', false],
    'the «Данные» panel, its export and its copy buttons are gone; one quiet line at the foot of «План» is left, closed until asked for — and nothing drawn on any screen says «Скопировать» (the one such button of the page stands beside a one-time link in «Люди», while that link is shown: rv-people)');
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
  same([await csRow(pg, 'team', S.P.team[1].id), (await listed(pg, 'other')).length, (await listed(pg, 'taxes')).length], ['cs-done | line-through | no tick | Person B | 3,750 | USD | 2 окт | Barclays | отмечено в старой Кассе', 2, 1], '… its rows stand in October: dated ones by their date, the ones without a date in the running month');
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

await run('typing', 'a row\'s sum is typed where it stands — the box stays under the cursor and the figures follow; the rest is changed in the card the row opens', async () => {
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
  // To the end of the box: «End» on Linux, where CI runs; on a Mac that key scrolls and the other one moves.
  await pg.keyboard.press('End');
  await pg.keyboard.press('ControlOrMeta+ArrowRight');
  await pg.keyboard.type('0');
  S = await holds(pg, 'one digit typed', 'cash');
  same([await pg.evaluate((s) => { const e = document.querySelector(s); return [e.__mark, document.activeElement === e, e.value]; }, amt), ix(S, 'c').amt, S.fig('in'), S.fig('mon.inflows.exp'), ix(S, 'c').m.by], [[1, true, '24000'], 24000, in0 + 21600, 8000 + 24000 + 500, 'Mika'],
    'a digit typed into an amount leaves the same box under the cursor; the row, the list\'s total and «Придёт» follow the keystroke');
  await pg.keyboard.press('Backspace');
  S = await holds(pg, 'the digit taken back', 'cash');
  same([ix(S, 'c').amt, S.fig('in'), await text(pg, '#cs-undo span')], [2400, in0, 'Последнее изменение: Client C: правка'], '… taken back, so do they; and the strip under the tabs offers «Отменить» for the row\'s edit — one copy of the plan for the whole visit to the row');
  same(await pg.evaluate(() => window.__cash.state().inflows.length), 3, '… (nothing was added by typing)');
  // a name the table knows ties the row to that client — and adds to his row that repeats; nothing is taken out of it.
  // The name, like everything but the sum, is changed in the row's card.
  await rowSet(pg, 'inflows', 'c', { name: 'Client A' });
  S = await holds(pg, 'renamed to a client the table knows', 'cash');
  same([ix(S, 'c').sk, ix(S, 'c').skBy, await pg.$('[data-ed-card]'), (await csRow(pg, 'inflows', 'rA@2026-10')).split(' | ')[4], S.fig('in'), item(S.M, 'c').label],
    ['rev|client a', 'hand', null, '8000', in0, 'Client A'], 'the row renamed «Client A» in its card is tied to that client; his row «каждый месяц» stays 8,000 beside it — a one-off row adds, it is taken out of nothing');
  await rowSet(pg, 'inflows', 'c', { name: 'Client C' });
  S = await holds(pg, 'renamed back', 'cash');
  same(['sk' in ix(S, 'c'), S.fig('in')], [false, in0], '… renamed back, the tie is gone');
  // a date in another month: the row goes there when the card is saved, and the page says where it went
  await rowSet(pg, 'inflows', 'c', { date: '2026-11-10' });
  S = await holds(pg, 'a November date saved in the card', 'cash');
  same([await listed(pg, 'inflows'), item(S.M, 'c').ym, S.fig('mon.inflows.exp'), await toastText(pg), await monthAt(pg)], [['k', 'rA@2026-10'], '2026-11', 8500, 'Сохранено: Client C · теперь в плане на ноябрь 2026', '2026-10'],
    'a date in November given to an October row: October lets go of it, the month in view stays, and the page says where the row went');
  await toMonth(pg, '2026-11');
  same(await listed(pg, 'inflows'), ['c', 'rA@2026-11'], '… and there it is, on the 10th, before Client A');
  // within a month a new date re-sorts the list
  await toMonth(pg, '2026-10');
  await rowSet(pg, 'inflows', 'k', { date: '2026-10-30' });
  same([await listed(pg, 'inflows'), await toastText(pg)], [['rA@2026-10', 'k'], 'Сохранено: Client K'], 'a later date within the month: the row is sorted after the 28th, and nothing is said of a month');
  // a slip of the finger in the year
  await rowCard(pg, 'inflows', 'k');
  await fill(pg, 'row', { date: '2062-01-01' });
  await pg.click(K('row') + '[data-ed-save]');
  same([(await look(pg, 'cash')).P.inflows.find((r) => r.id === 'k').date, await toastText(pg), !!(await pg.$(K('row')))], ['2026-10-30', 'Слишком далёкая дата: прогноз смотрит не дальше двух лет', true], 'a year typed as 2062 is turned away in words, the row keeps its date, and the card stays open to be put right');
  await pg.click(K('row') + '[data-ed-x]');
  // an amount cleared is no amount, not a deleted row
  await pg.fill(box('inflows', 'k', 'amt'), '');
  S = await holds(pg, 'an amount cleared', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').amt, item(S.M, 'k').state, (await csRow(pg, 'inflows', 'k')).split(' | ').pop()], [0, 'empty', ''], 'an amount cleared leaves the row with no amount: in no total, and saying nothing');
  await pg.fill(box('inflows', 'k', 'amt'), '500');
  await leave(pg);
  // the currency and the bank are the card's too; the pounds stand beside a sum in another currency
  await rowSet(pg, 'inflows', 'k', { cur: 'USD' });
  S = await holds(pg, 'dollars', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').cur, await text(pg, cs('inflows', 'k') + ' [data-cs-gbp]'), item(S.M, 'k').cash], ['USD', '£370', 370.37], '$500 is £370 at the table\'s own rate, and says so beside the sum');
  // Enter leaves the box; a press on the row opens its card under it, one at a time, and typing in a row closes it
  await pg.focus(box('inflows', 'k', 'amt'));
  await pg.keyboard.press('Enter');
  same(await pg.evaluate(() => document.activeElement.tagName), 'BODY', 'Enter in a box leaves it');
  await pg.click(cs('inflows', 'k') + ' .cs-nt');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.getAttribute(more('inflows', 'k'), 'aria-expanded'), (await pg.getAttribute(cs('inflows', 'k'), 'class')).includes('cs-open')], [1, 'true', true], 'a press on the row\'s name opens its card, and the arrow at the end of the row says it is open');
  await pg.click(cs('inflows', 'k') + ' .cs-dd');
  same([await pg.$('[data-ed-card]'), await pg.getAttribute(more('inflows', 'k'), 'aria-expanded')], [null, 'false'], '… and a second press on the row shuts it');
  await pg.click(cs('inflows', 'k') + ' .cs-mo [data-ed-open]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.$eval(cs('inflows', 'k') + ' + tr', (e) => [e.className, !!e.querySelector('[data-ed-card="row"]')].join(' ')), await texts(pg, K('row') + '.ed-foot button')], [1, 'cs-edrow true', ['Получено', 'Частично…', 'Удалить', 'Закрыть', 'Сохранить']], 'the arrow at the end of the row opens the same card right under it: where it came from, «+ VAT», «каждый месяц», «Частично…», «Удалить»');
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
  same([await monthAt(pm), await csRow(pm, 'inflows', 'late'), await pm.$('#cs-back'), plain(await text(pm, '#cs-past'))], ['2026-09', 'typed | none | on | Client E | 4000 | GBP | 2026-09-22 | Wise | просрочено 13 дн.', null, 'Здесь — только строки плана за этот месяц. Всё, что прошло по выпискам, — в «Месяцах».'], '… and its button opens September, where the row says how late it is — and the page says a month gone by is the plan\'s page of it, not the month\'s accounts');
  await toMonth(pm, '2026-11');
  const rentNov = 'rent@2026-11';
  same(await csRow(pm, 'other', rentNov), 'typed | none | on | Studio rent | 900 | GBP | 2026-11-15 | Wise | ', 'November holds the month of a «каждый месяц» row: exact, in full ink, one line like any other');
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
    div: [row('d1', 'HMRC Mika', 10, '2026-10-21', { ptax: true, f: 'mika', blk: 'div' }), row('d2', 'Вывод Vanya', 10, '2026-10-22', { blk: 'div', whose: 'vanya' })],
    tax: { since: T, rules: [VAT(), USN()], cl: { 'client a': 'vat' }, per: { 'vat|2026Q3': { amt: 4000, date: '2026-11-08', paid: paid(T), tx: ['p1'], notx: ['p2'], m: { t: TAP, by: BY } } } },
  });
  serve(ledP(), full);
  again = await reopen('every field');
  const got = await again.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state())));
  const lost = [];
  const walk = (a, b, path) => { if (a && typeof a === 'object') { if (!b || typeof b !== 'object') return void lost.push(path); Object.keys(a).forEach((k) => walk(a[k], b[k], path + '.' + k)); } else if (a !== b && !(path.endsWith('.log') || path.endsWith('.info') || path.endsWith('.tag'))) lost.push(path + ' = ' + JSON.stringify(a)); };
  ['banks', 'inflows', 'team', 'taxes', 'other', 'div', 'tax', 'fresh', 'cushion'].forEach((k) => walk(full[k], got[k], k));
  same(lost, [], 'a plan that carries every field the engine reads — carry on a row without a date and on a dated one, rec with its exceptions, of, ptax, f, whose a withdrawal is, vat, the links and marks, tax.cl and tax.per, fresh — comes through the page\'s way in whole');
  await again.context().close();
});

await run('rv-day', 'the balance\'s own day, the first screen with nothing written, and what the rows say: VAT, the day a line was expected, whole pounds', async () => {
  // A payout of the day the balance was typed for, in a statement uploaded after it: taken off, and said in «Счета».
  let pg = await scene('same day', ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), planX({ banks: [bal('Wise', 'GBP', 9880, T, { at: ms('2026-10-06T08:00:00Z') })], team: [row('g', 'Person G', 1000, T)], inflows: [row('q', 'Client Q', 3898.31, '2026-10-04', { vat: false })] }), { H: 60 });
  let S = await holds(pg, 'a payout of the balance\'s own day, uploaded after it');
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
  const tick = K('row') + '[data-ed-f="monthly"]';
  await rowSet(pg, 'team', nov, { monthly: false });
  let S = await holds(pg, 'the tick taken off November', 'cash');
  await rowCard(pg, 'team', nov);
  same([S.P.team[0].rec.to, await pg.isChecked(tick), (await csRow(pg, 'team', nov)).split(' | ')[8], await toastText(pg), item(S.M, nov).occ.last, item(S.M, 'rB@2026-12')],
    ['2026-11', false, 'повтор закончится после ноября', 'Person B: повтор закончится после ноября', true, null], 'unticked in the card of November\'s row: the repeat ends after November — the tick STAYS off, and the row says «повтор закончится после ноября» for as long as that is so');
  await pg.click(K('row') + '[data-ed-x]');
  await toMonth(pg, '2026-10');
  await rowCard(pg, 'team', 'rB@2026-10');
  same([await pg.isChecked(tick), (await csRow(pg, 'team', 'rB@2026-10')).split(' | ')[8]], [true, 'по ноябрь'], 'October, a month before the end, keeps its tick and says «по ноябрь»');
  await pg.click(K('row') + '[data-ed-x]');
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
  await rowSet(pg, 'team', nov, { monthly: true });
  S = await holds(pg, 'the tick put back in the constructor', 'cash');
  same(['to' in S.P.team[0].rec, item(S.M, 'rB@2026-12').cash, await toastText(pg)], [false, -6000, 'Person B: повтор продолжается'], 'the tick put back in the card of November\'s row carries the repeat on');
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
    ['ближайший платёж: 20 окт, £2,400', ['Corporation tax — первый взнос · до 20 окт', 'ваша строка · £2,400', 'в плане']], 'the head says «ближайший платёж: 20 окт, £2,400» — and that payment is a row of the block: «Corporation tax — первый взнос · до 20 окт · ваша строка · £2,400»; nothing is held for it on the right, and the column says why in a word, «в плане» — not a dash, which read as a figure that is missing');
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
  await openAdd(pg, 'taxes');
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
  same(await pg.evaluate((c) => window.__tx.parseGrid(window.__tx.parseCSV(c), 'tochka.csv').acn, csv), '40802810000000000011', '… and the statement is of the account that pays what goes out and receives what comes in: its number is read off the rows');
  await pg.evaluate((c) => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'tochka.csv'), 'tochka.csv'); }, csv);
  for (let i = 0; i < 80 && !((store.led.doc.inbox || []).length === 3 && store.led.doc.tx.length === 1); i++) await sleep(50);
  const inb = (store.led.doc.inbox || []).map((r) => [r.o.a, r.dir, r.c === 'rev', r.o.cur].join(' ')).sort(), kept = store.led.doc.tx.map((r) => [r.o.a, r.c, r.s].join(' '));
  same([inb, kept], [['-16.11 -1 false RUB', '-4200 -1 false RUB', '120000 1 true RUB'], ['-7528 skip file']],
    '… so in «Разбор» the one receipt is offered as revenue, the tariff and the card purchase are payments out and are not, and the move to the holder\'s own tax account is taken out as a transfer between own accounts');
  // The card of the rouble receipt: UK VAT is not asked of it, and the name it needs may be a new one — the field
  // used to say «как в таблице» on every row, the ones that need no name among them (Mika, 8 October 2026).
  await pg.click('.nav [data-tab="inbox"]');
  same(await pg.$$eval('#view-inbox .op', (l) => l.filter((e) => /ВЫДУМКА/.test(e.textContent)).map((e) => [!!e.querySelector('input.vat'), (e.querySelector('input.lab') || {}).placeholder || ''])), [[false, 'новое название или из списка']],
    '… and on its card there is no «VAT, £» — a receipt in roubles carries none — and «Проект» asks for «новое название или из списка»');
  await pg.context().close();
});

await run('rv-mosta', 'a wallet\'s list of orders is not a statement: what an order did to the money its kind says, and the page reads each kind its own way', async () => {
  // Mosta's «wallet-orders» export as it comes: twenty-seven columns, no sign anywhere, currencies as ids with a
  // symbol beside them. Read as an ordinary statement it was taken for Wise in pounds and every order for a receipt —
  // two payments to people among them, offered as revenue (8 October 2026). The header is the wallet's; the rows are made up.
  const HEAD = ['Order ID', 'Order UUID', 'Created At', 'Updated At', 'Order Type', 'Status', 'Amount From', 'From Currency', 'From Currency Symbol', 'Amount To', 'To Currency', 'To Currency Symbol', 'Fee', 'Fee Currency',
    'Exchange Rate', 'Billing Amount', 'Billing Currency', 'Transaction Amount', 'Transaction Currency', 'Network Fee', 'Network Fee Currency', 'Counterparty Account Name', 'Counterparty Account ID', 'Reference', 'Note', 'Workflow Status', 'Request ID'];
  const order = (id, at, type, status, from, fs, to, ts, fee, who = '') => { const c = new Array(HEAD.length).fill(''); [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], c[13], c[21]] = [id, id, at, at, type, status, from, 'aaaa1111-0000-4000-8000-000000000001', fs, to, 'bbbb2222-0000-4000-8000-000000000002', ts, fee, 'aaaa1111-0000-4000-8000-000000000001', who]; return c.join(','); };
  const csv = [HEAD.join(','),
    order('o-pay', '2026-10-06T14:05:40.832+00:00', 'OMNIBUS_CRYPTO_TRANSFER', 'COMPLETE', '500', 'USDM', '495', 'USDT', '5', 'Lena Hartmann'),
    order('o-in', '2026-10-06T13:52:05.171+00:00', 'BRL_WIRE_ONRAMP', 'COMPLETE', '300', 'USD', '275', 'USDM', '25'),
    order('o-swap', '2026-10-01T14:52:58.468+00:00', 'EXCHANGE_OMNI', 'COMPLETE', '39.75', 'USDT', '39.75', 'USDM', '0'),
    order('o-wait', '2026-10-06T15:00:00.000+00:00', 'BRL_WIRE_ONRAMP', 'PENDING', '100', 'USD', '75', 'USDM', '25'),
    order('o-new', '2026-10-06T16:00:00.000+00:00', 'SOME_NEW_KIND', 'COMPLETE', '10', 'USDM', '10', 'USDM', '0'),
  ].join('\n') + '\n';
  // The other side of the on-ramp is already in the table: the transfer out of Wise, filed as one between own accounts.
  serve(ledger([filed('w-out', '2026-10-06', -222.22, 'skip', 'Sent money to Demo Studio Ltd')]), null);
  const pg = await open('a wallet export');
  const read = await pg.evaluate((c) => { const p = window.__tx.parseGrid(window.__tx.parseCSV(c), 'wallet-orders-made-up.csv'); return p.error ? [p.error] : [p.bank, p.defCur, p.left, p.rows.map((r) => [r.d, r.a, r.cur, r.p, r.t.split(' · ')[0]].join(' | '))]; }, csv);
  same(read, ['Mosta', 'USD', 'не завершены — 1, SOME_NEW_KIND — 1', ['2026-10-06 | -500 | USD | Lena Hartmann | Перевод 495 USDT, комиссия 5', '2026-10-06 | 300 | USD |  | Пополнение кошелька с банковского счёта', '2026-10-06 | -25 | USD | Mosta | Комиссия за пополнение кошелька']],
    'the file is Mosta\'s, in dollars: a transfer is a payment out to the person it names, the fee inside the sum; an on-ramp is the money in and its fee out, two rows; a swap of one dollar token for another is no row; an order not complete and a kind never met are left out and named');
  await pg.evaluate((c) => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'wallet-orders-made-up.csv'), 'wallet-orders-made-up.csv'); }, csv);
  for (let i = 0; i < 80 && !((store.led.doc.inbox || []).length === 2 && store.led.doc.tx.length === 2); i++) await sleep(50);
  const inb = (store.led.doc.inbox || []).map((r) => [r.b, r.o.a, r.o.cur, r.dir, r.c === 'rev'].join(' ')).sort(), kept = store.led.doc.tx.map((r) => [r.b, r.o.a, r.o.cur, r.c, !!r.pair].join(' ')).sort(), pairs = new Set(store.led.doc.tx.map((r) => r.pair)).size;
  same([inb, kept, pairs], [['Mosta -25 USD -1 false', 'Mosta -500 USD -1 false'], ['Mosta 300 USD skip true', 'Wise -222.22 GBP skip true'], 1],
    '… so in «Разбор» the payment and the fee wait as payments out, in dollars, and neither is offered as revenue — and the money that came in is paired with the transfer that left Wise and taken out with it, as one move between own accounts');
  await pg.click('.nav [data-tab="settings"]');
  await pg.click('#view-settings .set-nav [data-tabgo="upload"]');
  ok(/не взято: не завершены — 1, SOME_NEW_KIND — 1/.test(await text(pg, '#view-upload .file')), '«Загрузка» says of the file what was left out of it, and of what kind', await text(pg, '#view-upload .file'));
  await pg.context().close();
});

await run('rv-account', 'an account the plan does not hold is added by hand, in «Вписать остаток» — a second one in the same bank and currency too', async () => {
  // Mika, 8 October 2026: a second Barclays account and Tochka's tax account had nowhere to be written — accounts
  // came only with a plan from the old artifact or with a statement.
  const pg = await scene('a second account', ledA(), planX({ banks: [bal('Wise', 'GBP', 9000, '2026-10-05'), bal('Barclays', 'GBP', 1000, '2026-10-05')] }), { H: 60 });
  let S = await holds(pg, 'two accounts');
  const now0 = S.fig('now'), NEW = K('bal') + '[data-ed-newacct] ';
  await pg.click('#view-today .td-acc button[data-ed-bal]');
  // The same bank and currency again, and no name to tell the two apart: said, and nothing saved.
  await pg.selectOption(NEW + '[data-ed-nbank]', 'Barclays');
  await pg.fill(NEW + '[data-ed-namt]', '2500');
  await pg.click(K('bal') + '[data-ed-save]');
  same([await pg.evaluate(() => window.__cash.state().banks.length), /Barclays GBP уже есть в списке — дайте второму счёту название/.test(await toastText(pg)), store.cash.puts], [2, true, 0],
    'a second account in a bank and currency the plan already has must be given a name: without one the page says so and saves nothing');
  await pg.fill(NEW + '[data-ed-nname]', 'Barclays — второй');
  await pg.click(K('bal') + '[data-ed-save]');
  await saved(pg);
  const said = await toastText(pg);
  S = await holds(pg, 'a second Barclays account, added by hand');
  const second = S.P.banks.find((b) => b.name === 'Barclays — второй');
  same([S.P.banks.length, second && [second.bank, second.cur, second.amt, second.asOf, second.by, 'legacy' in second], S.M.accounts.filter((a) => a.bank === 'Barclays').map((a) => [a.key.split('|').length, !!a.anchor, a.est]), round2(S.fig('now') - now0)],
    [3, ['Barclays', 'GBP', 2500, T, 'Mika', false], [[2, true, 1000], [3, true, 2500]], 2500],
    'with a name it is saved as a row of the plan — bank, currency, the balance and the day it is true for, and who typed it — and «Денег сейчас» is larger by exactly that balance');
  ok(/Barclays — второй/.test(await text(pg, '#view-today .td-accs')) && /Счёт добавлен: Barclays — второй/.test(said), '«Счета» lists it under the name it was given, and the page says what it did', await text(pg, '#view-today .td-accs'));
  // A statement of that bank moves the first account of the bank and currency, as the sheet says; the second stands
  // at what was typed until it is typed again.
  await pg.evaluate(() => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV('Date,Amount,Currency,Description\n06-10-2026,-100.00,GBP,Card payment to Example Shop\n'), 'barclays.csv'), 'barclays.csv'); });
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'a Barclays statement after the two balances');
  same(S.M.accounts.filter((a) => a.bank === 'Barclays').map((a) => a.est), [900, 2500], 'a payment in a Barclays statement comes off the first Barclays account; the second keeps its typed balance');
  await finish(pg);
});

await run('rv-acctnum', 'a statement row moves the account whose number it carries: two accounts in one bank and currency are told apart by the last digits of their numbers', async () => {
  // Mika, 8 October 2026: a second Barclays account and Tochka's tax account, each with a statement of its own. The
  // plan told accounts apart by bank and currency alone, so every row of either statement moved the first of them:
  // the total was right and the split between the two was not.
  const MAIN = { ...bal('Barclays', 'GBP', 1000, '2026-10-05'), ac: '0001' }, VAT = { ...bal('Barclays', 'GBP', 2500, '2026-10-05'), id: 'b-vat', name: 'Barclays — VAT', ac: '0002' };
  const rowOf = (id, amt, ac) => ({ ...filed(id, '2026-10-06', amt, 'fixed', 'Example', { b: 'Barclays' }), ...(ac ? { ac } : {}) });
  const pg = await scene('two accounts, two numbers', ledA({ tx: [rowOf('m1', -100, '10000001'), rowOf('v1', -40, '10000002'), rowOf('n1', -7, '')] }), planX({ banks: [bal('Wise', 'GBP', 9000, '2026-10-05'), MAIN, VAT] }), { H: 60 });
  let S = await holds(pg, 'two Barclays accounts, each with its number');
  const ests = () => S.M.accounts.filter((a) => a.bank === 'Barclays').map((a) => [a.ac, a.est]);
  same(ests(), [['0001', 893], ['0002', 2460]], '£100 on a row of account …0001 and £7 on a row that carries no number come off the first account; £40 on a row of …0002 comes off the second');
  // The readers say whose statement a file is — Barclays in a column of its own — and the number goes with every row.
  const BARC = 'Number,Date,Account,Amount,Subcategory,Memo\n ,06/10/2026,20-00-00 10000002,-60.00,PAYMENT,EXAMPLE SHOP\n';
  same(await pg.evaluate((c) => { const p = window.__tx.parseGrid(window.__tx.parseCSV(c), 'barclays.csv'); return [p.bank, p.acn]; }, BARC), ['Barclays', '20000010000002'], 'a Barclays file names its account in the column «Account», and the page reads the number off it');
  await pg.evaluate((c) => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'barclays.csv'), 'barclays.csv'); }, BARC);
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'a statement of the second account');
  same(ests(), [['0001', 893], ['0002', 2400]], 'a payment that arrives in a statement of …0002 moves the second account and leaves the first where it was');
  // A founder writes the number in «Вписать остаток» — with or without a balance typed beside it.
  await pg.click('#view-today .td-acc button[data-ed-bal]');
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bac]', '…5412');
  await pg.click(K('bal') + '[data-ed-save]');
  await saved(pg);
  same([await toastText(pg), await pg.evaluate(() => { const b = window.__cash.state().banks.find((x) => x.bank === 'Wise'); return [b.ac, b.amt, b.asOf]; })], ['Номер счёта записан: Wise GBP', ['5412', 9000, '2026-10-05']],
    'the number alone is saved — its digits, nothing else — and the balance beside it stays as it was typed');
  await finish(pg);
});

await run('rv-dup', 'a list of the month can be written again from the month before: «Продублировать с октября» under each list, for what this month does not hold yet', async () => {
  // Mika, 8 October 2026, looking at an empty «Команда» of November: the rows of October, once more — each list by
  // itself. October here holds two rows marked «каждый месяц» (Client A, Person B), which November has already, and
  // two of its own: Person G on the 31st, marked paid, and Client Q, whose invoice carries VAT.
  const pg = await scene('the month before, once more', ledA(), planW({ team: [row('g', 'Person G', 1000, '2026-10-31', { paid: paid('2026-10-05') })], inflows: [row('q', 'Client Q', 500, '2026-10-20', { vat: true })] }), { H: 60 });
  await pg.click('.nav [data-tab="cash"]');
  same(await pg.$$eval('#view-cash [data-cs-dup]', (l) => l.length), 0, 'October offers nothing: the plan holds no row of September');
  await toMonth(pg, '2026-11');
  same(await pg.$$eval('#view-cash [data-cs-dup]', (l) => l.map((e) => [e.dataset.csDup, e.textContent.replace(/\s+/g, ' ').trim()].join(': '))), ['inflows: Продублировать с октября · 1 строка', 'team: Продублировать с октября · 1 строка'],
    'November: «Поступления» and «Команда» each offer the one row of October they do not hold — what is marked «каждый месяц» is there already — and the lists that held nothing in October offer nothing');
  await pg.click('#cs-sec-team [data-cs-dup]');
  await saved(pg);
  const said = await toastText(pg);
  let S = await holds(pg, 'October\'s team, once more in November', 'cash');
  const g2 = S.P.team.find((r) => r.name === 'Person G' && r.id !== 'g');
  same([S.P.team.length, g2 && [g2.amt, g2.cur, g2.bank, g2.date, 'paid' in g2, 'rec' in g2, g2.on, g2.m.by], S.P.team.find((r) => r.id === 'g').date, await pg.$('#cs-sec-team [data-cs-dup]'), said],
    [3, [0, 'GBP', 'Wise', '2026-11-30', false, false, true, 'Mika'], '2026-10-31', null, 'Продублировано с октября: 1 строка'],
    'the press writes Person G again as a row of November — the name, the currency and the bank, on the last day of the month where October had its 31st, with no sum, not paid and not repeating — leaves October\'s row alone, and the button is gone: there is nothing left to bring');
  // «Пустые суммы и только имена»: the box is empty, not a nought, and the row is in no figure until a sum is typed.
  const out0 = S.fig('out');
  same([await pg.$eval(box('team', g2.id, 'amt'), (e) => [e.value, e.placeholder]), S.M.items.find((it) => it.id === g2.id).state], [['', 'сумма'], 'empty'], 'its sum is an empty box that says «сумма», and the plan counts nothing for it yet');
  await pg.fill(box('team', g2.id, 'amt'), '1100');
  await leave(pg);
  S = await holds(pg, 'the sum typed into the copied row', 'cash');
  same([S.P.team.find((r) => r.id === g2.id).amt, round2(S.fig('out') - out0)], [1100, 1100], '£1,100 typed into it is this month\'s payment, and «Уйдёт» is larger by exactly that');
  await pg.click('#cs-sec-inflows [data-cs-dup]');
  await saved(pg);
  S = await holds(pg, '… and October\'s receipts', 'cash');
  const q2 = S.P.inflows.find((r) => r.name === 'Client Q' && r.id !== 'q');
  same(q2 && [q2.amt, q2.date, q2.vat], [0, '2026-11-20', true], 'a receipt comes on the same day of the month, with the VAT its invoice carries and no sum');
  await pg.click('#toastUndo');
  await saved(pg);
  same(await pg.evaluate(() => window.__cash.state().inflows.map((r) => r.name)), ['Client A', 'Client Q'], '«Отменить» takes the copied rows back');
  await finish(pg);
});

await run('rv-stale', 'a window whose table was saved from elsewhere says so over every tab, and takes no more files', async () => {
  // 8 October 2026: a week of statements was dropped into a window that had gone stale — the table had been saved
  // from another one — and sorted there. The page said so in the pill in the corner and nowhere else, took the
  // files, and none of it reached the server.
  const file = (name, memo) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(`Number,Date,Account,Amount,Subcategory,Memo\n ,06/10/2026,20-00-00 10000002,-60.00,PAYMENT,${memo}\n`) });
  const taken = () => pg.$$eval('#view-upload .file', (l) => l.length);
  const kept = () => (store.led.doc.inbox || []).length;
  serve(ledger([]), null);
  const pg = await open('a stale window', undefined, { hash: '#upload', quiet: /409/ });
  same(await pg.isHidden('#ledLost'), true, 'a window that is up to date carries no band');
  // the table is saved from another window; then a statement is dropped into this one
  store.led.rev++;
  await pg.setInputFiles('#fileIn', file('one.csv', 'EXAMPLE SHOP'));
  await pg.waitForSelector('#ledLost:not([hidden])');
  same([await text(pg, '#ledLostHead'), await text(pg, '#ledLostText'), await text(pg, '#ledReload'), await toastText(pg), await text(pg, '#sync'), kept()],
    ['Таблица изменилась в другом окне.', 'Всё, что вы загружаете, разбираете и правите в этом окне, больше не сохраняется. Обновите страницу — последние файлы придётся загрузить заново.', 'Обновить страницу', 'Не сохранено: таблица изменилась в другом окне — обновите страницу', 'данные изменились в другом окне — обновите страницу', 0],
    'the save is refused, and the page says so where it cannot be missed: a band with [Обновить страницу], and «Не сохранено: …» out loud — not the pill alone');
  await shot(pg, 'rv-stale');
  // the band is over every tab, for as long as the window is stale
  await pg.click('.nav [data-tab="inbox"]');
  const overInbox = await pg.isVisible('#ledLost');
  await pg.click('.nav [data-tab="today"]');
  same([overInbox, await pg.isVisible('#ledLost')], [true, true], 'the band stands over «Разбор» and over «Сегодня» alike');
  // and no file is taken meanwhile
  const had = await taken();
  await pg.setInputFiles('#fileIn', file('two.csv', 'ANOTHER SHOP'));
  await sleep(300);
  same([had, await taken(), await toastText(pg)], [1, 1, 'Файлы не взяты: таблица изменилась в другом окне — сначала обновите страницу'], 'a second statement dropped into that window is not read at all: sorted here, it would be lost');
  // [Обновить страницу] reads the table again, and the same file is taken and kept
  const loaded = pg.waitForEvent('load');
  await pg.click('#ledReload');
  await loaded;
  await pg.waitForFunction(() => !document.querySelector('#sync').textContent.includes('загружаю') && window.__cash && window.__cash.state());
  same(await pg.isHidden('#ledLost'), true, '[Обновить страницу]: the page is read again, and the band is gone');
  await pg.setInputFiles('#fileIn', file('one.csv', 'EXAMPLE SHOP'));
  for (let i = 0; i < 80 && kept() !== 1; i++) await sleep(50);
  same([kept(), await pg.isHidden('#ledLost')], [1, true], '… and the statement, dropped again, is read and reaches the server');
  await pg.context().close();
});

await run('rv-inbal', '«Получено» on a line older than its account\'s balance asks whether the money is inside that balance', async () => {
  // Mika, 8 October 2026: «почему на счёте 1651, хотя я вписал 211». An inflow of 28 September had been marked
  // «получено» that evening; the balance had been typed that afternoon, for that day; and a mark made after a
  // balance is money that came after it — so its £1,440 stood on top of a balance that already held it. The plan
  // here: Wise typed for 30 September, Client L's invoice of 28 September (1,200 and the tax on top), Client N's
  // of 12 October.
  const pg = await scene('a mark and a balance', ledA(), planW({ inflows: [row('old', 'Client L', 1200, '2026-09-28', { vat: true }), row('new', 'Client N', 500, '2026-10-12', { vat: false })] }), { H: 60 });
  await goCash(pg);
  const wise = async () => { const a = (await look(pg, 'cash')).M.accounts.find((a) => a.key === 'Wise|GBP'); return [a.est, a.marks]; };
  const mark = async (id) => { const r = stored(await look(pg, 'cash'), id); return r.paid ? r.paid.on : 'no mark'; };
  const ask = '[data-ed-card="row"] [data-ed-askbox="paid"]';
  const [est0] = await wise();
  await toMonth(pg, '2026-09');
  await rowDo(pg, 'inflows', 'old', 'paid');
  same([await text(pg, ask + ' > span'), await pg.$$eval(ask + ' [data-ed-go]', (l) => l.map((e) => [e.dataset.edGo, e.textContent.trim()].join(': '))), await mark('old')],
    ['Остаток Wise GBP вписан на 30 сен, а строка — от 28 сен. Эти деньги:', ['paid-in: уже в остатке', 'paid-after: пришли позже'], 'no mark'],
    '«Получено» on a line dated before the day of its account\'s balance: the page asks — «уже в остатке» or «пришли позже» — and writes nothing until the answer');
  await shot(pg, 'rv-inbal');
  // «уже в остатке»: closed on its own day, and the balance is what was typed
  await pg.click(ask + ' [data-ed-go="paid-in"]');
  await saved(pg);
  same([await mark('old'), await wise(), item((await look(pg, 'cash')).M, 'old').state, await toastText(pg)], ['2026-09-28', [est0, 0], 'done', 'Получено: Client L — уже в остатке'],
    '«уже в остатке»: the line is closed as paid on its own day, 28 September, and adds nothing to the balance');
  // «пришли позже»: a mark of today, added to the balance — what every mark did before
  await undo(pg);
  await rowDo(pg, 'inflows', 'old', 'paid');
  await pg.click(ask + ' [data-ed-go="paid-after"]');
  await saved(pg);
  same([await mark('old'), await wise(), await toastText(pg)], [T, [est0 + 1440, 1440], 'Получено: Client L'], '«пришли позже»: the mark is today\'s, and the £1,440 is on top of the balance');
  // a line dated after the day of the balance has one answer, and is not asked about
  await undo(pg);
  await toMonth(pg, '2026-10');
  await rowDo(pg, 'inflows', 'new', 'paid');
  await saved(pg);
  same([await pg.$(ask), await mark('new'), (await wise())[1]], [null, T, 500], 'a line dated after the day of the balance is marked at once, as before: its money cannot be inside that balance');
  await finish(pg);
});

await run('rv-taxrow', 'a tax row the bank closed before it was tied to its quarter can still be tied to it, and counts for what was paid', async () => {
  // Mika, 8 October 2026: «должен быть остаток за 2й квартал равный последнему платежу». A quarter paid in four
  // instalments: two were found in the statements and named, the fourth stood in the plan as a part - and the third
  // had come over from the old «Касса» as a row of its own, which the bank's payment then closed. The quarter went
  // on owing it, and the card of a closed row had no field in which to say whose payment it was.
  const Q2 = 'vat|2026Q2';
  const P = planP({ tax: { per: { [Q2]: { tx: ['ph0', 'ph1'] } } }, taxes: [
    row('debt', 'HMRC — долг', 1100, '2026-10-07', { bank: 'Barclays', blk: 'tax' }),
    row('nov', 'UK VAT за II кв. 2026 — часть', 1350, '2026-11-07', { bank: 'Barclays', blk: 'tax', of: { r: 'vat', p: '2026Q2', part: true } })] });
  const led = ledP({ hmrc: [['2026-08-07', 1150], ['2026-09-07', 1150]], tx: [filed('p7', '2026-10-07', -1150, 'tax', 'HMRC', { b: 'Barclays', at: ms('2026-10-08T08:00:00Z') })] });
  const pg = await scene('a closed tax row', led, P, { H: 60, at: '2026-10-08T12:00:00+01:00' });
  let S = await look(pg);
  same([item(S.M, 'debt').state, per(S.M, Q2).paid, per(S.M, Q2).left, !!item(S.M, 't|' + Q2)], ['done', 2300, 1150, true],
    'the bank has closed the row of 7 October; the quarter counts the two payments it was told of, and still expects the third: 1,150 «ещё уйдёт»');
  await goCash(pg);
  await pg.click(cs('taxes', 'debt') + ' [data-ed-open]');
  same([await pg.inputValue(K('row') + '#ed-of'), await texts(pg, K('row') + '[data-ed-save]'), await pg.$(K('row') + '#ed-amt')], ['own', ['Сохранить'], null],
    'the card of the closed row: no sum and no date to change — one field, «К чему относится», and «Сохранить»');
  await pg.selectOption(K('row') + '#ed-of', 'p|' + Q2);
  await pg.click(K('row') + '[data-ed-save]');
  await saved(pg);
  S = await look(pg, 'cash');
  same([stored(S, 'debt').of, item(S.M, 'debt').state, per(S.M, Q2).paid, per(S.M, Q2).left, item(S.M, 't|' + Q2), per(S.M, Q2).state, await toastText(pg)],
    [{ r: 'vat', p: '2026Q2', part: true }, 'done', 3450, 0, null, 'parts', 'HMRC — долг: часть UK VAT за II кв. 2026'],
    'said to be a part of the quarter: the quarter has had 3,450 — the 1,150 the bank shows for it, not the 1,100 the row was written with — and what is left of it is the part of November and nothing more');
  await finish(pg);
});

await run('rv-layout', '«Сегодня» from the top: where the money is, the month and what may be taken out, the plan by weeks — and what is only read, folded', async () => {
  // Mika, 8 October 2026: «счета я бы сделал виднее и наверху, чтобы четко было видно где и сколько», the month and the
  // withdrawals in the upper part, «остальные аналитические штуки внизу» — chosen among lay-outs built in HTML first.
  serve(demoLedger(T), demoPlan(T));
  const pg = await open('the lay-out', undefined, { folded: true });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  await pg.click('#view-today [data-td-h="30"]');
  let S = await holds(pg, 'the made-up studio, as it opens');
  const top = (sel) => pg.$eval('#view-today ' + sel, (e) => Math.round(e.getBoundingClientRect().top + window.scrollY));
  const order = [];
  for (const sel of ['.td-verdict', '.kpis', '.td-acc', '.td-month', '[aria-label="Ближайшие дни"]', '.td-anl']) order.push(await top(sel));
  ok(order.every((t, i) => !i || t > order[i - 1]) && (await top('.td-free')) === (await top('.td-month')) && (await top('.td-need')) === (await top('[aria-label="Ближайшие дни"]')), 'from the top: the sentence, the five figures, «Счета», then the month beside «Можно вывести», then the plan beside «Нужно решить», then «Аналитика»', order);
  // «Счета»: one account to a line — what is on it, in pounds, and what the figure rests on; the last line is the money now
  const rows = await pg.$$eval('#view-today .td-accs .td-ar', (l) => l.map((r) => [...r.children].map((c) => c.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())));
  same([rows[0], rows[1], rows[2], rows[4], rows[rows.length - 1].slice(0, 3), rows.length], [['Счёт', 'На счёте', 'В фунтах', 'На чём стоит цифра'], ['Wise GBP', '£21,480', '£21,480', 'вписан 4 окт, Mika'], ['Wise USD', '$6,620', '£4,904', 'вписан 4 окт, Mika'], ['Tochka RUB', '₽654,000', '£5,542', 'вписан 4 окт, Mika'], ['Денег на 4 окт', '', '£54,230'], 7],
    '«Счета» stands open at the top: each account with what is on it and what that is in pounds — and under a line, «Денег на 4 окт £54,230», the first of the six figures');
  same([await pg.$$eval('#view-today .td-accs .td-an .sw', (l) => l.length), await texts(pg, '#view-today .td-acc > .row button'), /^выписки и остатки по 4 окт · 5 счетов · под налоги £/.test(rows[rows.length - 1][3])], [5, ['Вписать остаток', 'Загрузить выписки'], true],
    '… each with its bank\'s square; the two buttons under the table; and the money now says what it rests on and how much of it is the taxes\'');
  await pg.click('#view-today .td-at');
  same(!!(await pg.$(K('bal'))), true, 'a press on the money now opens «Вписать остаток», as a press on that figure always did');
  await pg.click(K('bal') + '[data-ed-x]');
  // the plan by weeks
  const weeks = () => pg.$$eval('#view-today .td-wk', (l) => l.map((b) => [b.getAttribute('aria-expanded'), b.querySelector('.td-wkn').textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), b.querySelector('.td-wkf').textContent.replace(/\s+/g, ' ').trim()].join(' | ')));
  const days = () => pg.$$eval('#view-today .td-days .td-day b', (l) => l.map((b) => b.textContent.replace(/\u00a0/g, ' ')).filter((t) => !t.startsWith('Закрыто')));
  const W = await weeks();
  const D = S.M.days, sum = (a, b, k) => Math.round(D.filter((x) => x.d >= a && x.d <= b).reduce((n, x) => n + x[k], 0));
  const end = (b) => Math.round(D.find((x) => x.d === b).e).toLocaleString('en-GB');
  same([W.length, W[0], W[1].split(' | ').slice(0, 2).join(' | '), await days()],
    [5, `true | Эта неделя 6–11 окт · 8 строк | придёт +£${sum('2026-10-06', '2026-10-11', 'in').toLocaleString('en-GB')} · уйдёт −£${sum('2026-10-06', '2026-10-11', 'out').toLocaleString('en-GB')} · останется £${end('2026-10-11')}`, 'false | Следующая неделя 12–18 окт · 8 строк', ['сегодня, вт 6 окт', 'ср 7 окт', 'сб 10 окт', 'вс 11 окт']],
    '«План на 30 дней» stands by weeks, Monday to Sunday: each says what comes, what goes and what is left when it ends — the model\'s own sums — and only the week that holds today shows its days');
  await pg.click('#view-today .td-wk[data-td-wk="2026-10-12"]');
  same([(await weeks()).map((w) => w.split(' | ')[0]).join(' '), (await days()).slice(4, 6), !!(await pg.$(inDays('t-greta@2026-10')))], ['true true false false false', ['вт 13 окт', 'ср 14 окт'], true], 'a press on «Следующая неделя» opens it under its own line, and the first stays as it was');
  await pg.click('#view-today .td-wk[data-td-wk="2026-10-05"]');
  same([(await weeks()).map((w) => w.split(' | ')[0]).join(' '), (await days())[0]], ['false true false false false', 'вт 13 окт'], '… and a press on an open week shuts it');
  await pg.click('#view-today [data-td-flip="all"]');
  same([(await weeks()).map((w) => w.split(' | ')[0]).join(' '), await text(pg, '#view-today [data-td-flip="all"]'), (await days()).length], ['true true true true true', 'Свернуть недели', S.M.days.filter((x) => x.items.length || (S.M.doneDays[x.d] || []).length).length], '«Раскрыть все недели» opens every one — every day of the plan that holds a row');
  await pg.click('#view-today [data-td-flip="all"]');
  same((await weeks()).map((w) => w.split(' | ')[0]).join(' '), 'true false false false false', '… and «Свернуть недели» is the page as it opens');
  // «Аналитика»: folded until asked for, and remembered
  same([await pg.$eval('#view-today .td-anl', (e) => e.open), await text(pg, '#view-today .td-anl > summary'), await pg.isVisible('#td-chart'), await pg.$$eval('#view-today .td-anl .kpi', (l) => l.length), await pg.$$eval('#view-today .td-verdict + .kpis .kpi .lbl', (l) => l.map((e) => e.textContent.replace(/\u00a0/g, ' ')))],
    [false, 'Аналитикаостаток по дням · налоги', false, 0, ['Придёт за 30 дней', 'Уйдёт за 30 дней', 'Нижняя точка', 'Ждём и не пришло', 'Можно вывести · на 4 окт']],
    '«Аналитика» is one line at the foot of the page, with the chart and the taxes under it; the five figures stand right under the sentence, in sight (they were under the fold for an evening, and Mika asked for them back)');
  await pg.click('#view-today .td-anl > summary');
  await pg.waitForSelector('#td-chart path, #td-chart polyline');
  await pg.waitForFunction(() => localStorage.getItem('selfstudio-money-analytics') === '1');
  const drawn = await pg.$eval('#td-chart', (e) => [Math.round(e.getBoundingClientRect().width) > 600, e.querySelectorAll('[data-td-i]').length > 20]);
  same([drawn, await pg.isVisible('#view-today .td-tax'), await pg.evaluate(() => localStorage.getItem('selfstudio-money-analytics'))], [[true, true], true, '1'], 'opened, it shows the chart drawn to the width it now has, and «Налоги» — and the page remembers that it was opened');
  await pg.reload();
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same(await pg.$eval('#view-today .td-anl', (e) => e.open), true, '… so after a reload it stands open');
  await shot(pg, 'rv-layout');
  await pg.context().close();
});

await run('rv-drop', 'an account is taken out of the plan in «Вписать остаток»; neither page has «Добавить» in its head', async () => {
  // Mika, 8 October 2026: «Касса» repeats nothing of «Сегодня», and «Добавить» leaves both heads. The cross that took
  // an account out of the plan stood beside «Остатки» in «Касса»; with that block gone the button went to the sheet
  // where a balance is typed.
  const pg = await scene('an account out of the plan', ledA(), planX({ banks: [bal('Wise', 'GBP', 9000, '2026-10-05'), bal('Barclays', 'GBP', 2500, '2026-10-05')] }), { H: 60 });
  same([await pg.$('#view-today .page-head [data-ed-add]'), await texts(pg, '#view-today .page-head button')], [null, ['30 дней', '60 дней']], '«Сегодня»: nothing in the head but «30 дней / 60 дней»');
  await pg.click('#view-today .td-acc button[data-ed-bal]');
  const drop = K('bal') + '[data-ed-acct="Barclays|GBP"] [data-ed-drop]';
  const banks = async () => (await look(pg)).P.banks.map((b) => b.id);
  same([await text(pg, drop), await pg.$$eval(K('bal') + '[data-ed-drop]', (l) => l.length)], ['Убрать счёт из плана', 2], '«Вписать остаток»: under each account of the plan, «Убрать счёт из плана»');
  await pg.click(drop);
  same([await text(pg, drop), await banks()], ['Точно убрать?', ['b-Wise-GBP', 'b-Barclays-GBP']], 'the first press asks — «Точно убрать?» — and writes nothing');
  await pg.click(drop);
  await saved(pg);
  same([await banks(), await toastText(pg), await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => e.dataset.edAcct)), store.cash.doc.banks.length], [['b-Wise-GBP'], 'Счёт убран из плана', ['Wise|GBP'], 1], 'the second takes the account out of the plan, says so, and the sheet stays open on what is left');
  await pg.click('#toastUndo');
  await saved(pg);
  same(await banks(), ['b-Wise-GBP', 'b-Barclays-GBP'], '«Отменить» brings it back');
  // «Касса»: a row is added where its list is, and nowhere else
  await goCash(pg);
  same([await pg.$$eval('#view-cash .page-head button', (l) => l.length), await pg.$$eval('#cs-plan [data-ed-add]', (l) => l.map((b) => b.textContent.trim()))], [0, ['+ новая строка', '+ новая строка', '+ новая строка', '+ новая подписка', '+ новая строка', '+ новая строка']], '«Касса»: no button in the head; «+ новая строка» under each list, and «+ новая подписка» under «Подписки»');
  await finish(pg);
});

await run('rv-x', 'a row of the plan is taken away in two presses — the row, then «Удалить» in its card — with «Отменить» beside what it says', async () => {
  // Mika, 8 October 2026, with eight rows of November he did not want: deleting was «ещё», then «Удалить», then
  // «Точно удалить?». A cross at the end of the row made it one press. Since the row became one line (the same day)
  // the way out is «Удалить» in the card the row opens, and there it does not ask twice. October here holds a row
  // of its own (Person G), a row that repeats on (Person B) and a row whose repeat, begun in September, ends with
  // October (Person L).
  const pg = await scene('the cross', ledA(), planW({ team: [row('g', 'Person G', 1000, '2026-10-08'), every('rL', 'Person L', 500, 15, '2026-09', { rec: { day: 15, from: '2026-09', to: '2026-10' } })] }), { H: 60 });
  await pg.click('.nav [data-tab="cash"]');
  const X = (id) => rowDo(pg, 'team', id, 'del'), team = () => pg.evaluate(() => window.__cash.state().team.map((r) => [r.id, r.rec && r.rec.x ? JSON.stringify(r.rec.x) : ''].join(' ')));
  const dels = [];
  for (const [k, id] of [['team', 'g'], ['team', 'rB@2026-10'], ['team', 'rL@2026-10'], ...(await listed(pg, 'taxes')).map((id) => ['taxes', id])]) { await rowCard(pg, k, id); dels.push(await pg.$$eval(K('row') + '[data-ed-do="del"]', (l) => l.map((e) => e.textContent.trim()).join())); await pg.click(K('row') + '[data-ed-x]'); }
  same([dels.slice(0, 3), dels.slice(3).every((d) => d === '')], [['Удалить', 'Убрать', 'Убрать'], true], 'the card of every row a founder wrote has the way out — «Удалить», or «Убрать» for a month of a repeat; a tax the page works out, where the month holds one, has none — it is not a row to take away');
  // a row of its own: gone at once
  await X('g');
  await saved(pg);
  same([await team(), await toastText(pg), await pg.$('[data-ed-card="row"]')], [['rB ', 'rL '], 'Удалено: Person G', null], 'a row of its own goes with the one press on «Удалить» — no «Точно удалить?» — and the page says «Удалено: Person G», with «Отменить»');
  await pg.click('#toastUndo');
  await saved(pg);
  same((await team()).length, 3, '… which brings it back');
  // the last month of a repeat is just a row of this month
  await X('rL@2026-10');
  await saved(pg);
  same([(await team()).find((r) => r.startsWith('rL')), await pg.$('[data-ed-card="row"]')], ['rL {"2026-10":{"off":true}}', null], 'the last month of a repeating row goes the same way: there is no «и дальше» to ask about');
  // a month of a repeat that goes on has two answers, so the press asks — in the card, under the row
  await X('rB@2026-10');
  same([await pg.$$eval('[data-ed-card="row"] [data-ed-askbox="del"] [data-ed-go]', (l) => l.map((e) => [e.dataset.edGo, e.textContent.trim()].join(': '))), (await team()).find((r) => r.startsWith('rB'))], [['del-only: только октябрь', 'del-onward: октябрь и дальше'], 'rB '], 'a month of a row that repeats on is asked about first — «только октябрь» or «октябрь и дальше» — and nothing is written until the answer');
  await pg.click('[data-ed-card="row"] [data-ed-go="del-only"]');
  await saved(pg);
  same((await team()).find((r) => r.startsWith('rB')), 'rB {"2026-10":{"off":true}}', '«только октябрь» takes October out of the repeat and leaves the months after it');
  await finish(pg);
});

await run('rv-one', 'a repeat left with one month is an ordinary row: its name can be typed, and nothing says a repeat will end', async () => {
  // Mika, 8 October 2026: «почему я у кого-то могу менять имя, а у кого-то нет». The rows whose name was locked had
  // been ticked «каждый месяц» and unticked in the same month: a repeat of October alone, which the page drew as a
  // month of a repeat — the name as text, «повтор закончится после октября» under it. The plan here is stored the
  // way his was: Person L repeats for October alone, with a sum and a day of that month's own; Person K for
  // September alone, a month that has gone by; Person N repeats on.
  const pg = await scene('one month', ledA(), planW({ team: [
    every('rL', 'Person L', 500, 15, '2026-10', { rec: { day: 15, from: '2026-10', to: '2026-10', x: { '2026-10': { amt: 550, date: '2026-10-16' } } } }),
    every('rK', 'Person K', 400, 15, '2026-09', { rec: { day: 15, from: '2026-09', to: '2026-09' } }),
    every('rN', 'Person N', 300, 10, '2026-10')] }), { H: 60 });
  await pg.click('.nav [data-tab="cash"]');
  const at = (id) => pg.evaluate((id) => { const r = window.__cash.state().team.find((r) => r.id === id); return !r ? 'gone' : [r.rec ? JSON.stringify(r.rec) : 'a row', r.date, r.amt].join(' | '); }, id);
  const of = (id) => { const r = store.cash.doc.team.find((r) => r.id === id); return !r ? 'gone' : [r.rec ? JSON.stringify(r.rec) : 'a row', r.name, r.date, r.amt].join(' | '); };
  await sleep(800);
  same([await at('rL'), await at('rK'), store.cash.puts], ['a row | 2026-10-16 | 550', '{"day":15,"from":"2026-09","to":"2026-09"} | 2026-09-15 | 400', 0],
    'a plan stored with a repeat of October alone is read as the ordinary row it is — with the sum and the day that month had; a month that has gone by is left as it was written; and opening the page saves nothing');
  const list = await listed(pg, 'team');
  await rowCard(pg, 'team', 'rL');
  same([list.includes('rL'), list.includes('rL@2026-10'), await pg.isEnabled(K('row') + '#ed-name'), await pg.isChecked(K('row') + '[data-ed-f="monthly"]'), await texts(pg, K('row') + '.ed-foot [data-ed-save]'), (await text(pg, cs('team', 'rL') + ' [data-cs-rm]')).includes('повтор')], [true, false, true, false, ['Сохранить'], false],
    '«Касса»: Person L is a row of October like any other — its card has one «Сохранить», «каждый месяц» is not ticked, and nothing under the row speaks of a repeat that will end');
  // … so the name is changed like any row's, and the row goes to the server as an ordinary row with that change
  await fill(pg, 'row', { name: 'Person M' });
  await pg.click(K('row') + '[data-ed-save]');
  same([await saved(pg), of('rL'), store.cash.puts > 0], [true, 'a row | Person M | 2026-10-16 | 550', true], 'a new name given to it is saved: «Person M», an ordinary row of 16 October');
  // «ноябрь и дальше» of a delete in a repeat's second month leaves its first month alone: the same ordinary row
  await toMonth(pg, '2026-11');
  await rowDo(pg, 'team', 'rN@2026-11', 'del');
  await pg.click('[data-ed-card="row"] [data-ed-go="del-onward"]');
  await saved(pg);
  await toMonth(pg, '2026-10');
  same([of('rN'), !!(await pg.$(cs('team', 'rN'))), await pg.$(cs('team', 'rN@2026-10'))], ['a row | Person N | 2026-10-10 | 300', true, null], 'Person N, taken away from November on: October is all that is left of it, and it is an ordinary row of 10 October');
  await finish(pg);
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
  await openAdd(pg, 'inflows');
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
  await rowSet(pg, 'taxes', sa, { name: 'HMRC Misha' });
  await pg.waitForSelector(cs('div', sa));
  S = await holds(pg, 'a tax row renamed after a founder', 'cash');
  same([(await listed(pg, 'taxes')).includes(sa), (await listed(pg, 'div')).includes(sa), S.P.div.map((r) => [r.name, r.ptax, r.f]), await toastText(pg)], [false, true, [['HMRC Misha', true, 'misha']], 'Сохранено: HMRC Misha · личный налог — перенесён в «Дивиденды»'], 'renamed «HMRC Misha» in its card: the row leaves «Налоги» for «Дивиденды» as a personal tax, and the page says so');
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

await run('rv-kassa2', '«Касса · По месяцам» in two columns: a row is one line that opens its card, and «Подписки» is a section of its own, folded into a line of words', async () => {
  // Mika, 8 October 2026. Of the month's table, where every row held every field and every button: «сейчас очень
  // нагромождено и непонятно» — out of the builds shown he chose two columns, the sum typed in place and the row
  // opening its card. Of the subscriptions the plan did not hold: «я думаю нужна отдельная графа в кассе» — and,
  // of the two ways to show it, folded. A subscription is a row of «Прочие расходы» that says `sub`: the plan keeps
  // its five lists. October here holds two that repeat (10th and 25th), one already charged (2nd) and the office;
  // September holds one more that was never closed.
  const P = planW({ other: [every('s1', 'Tool A', 20, 10, '2026-10', { sub: true }), every('s2', 'Tool B', 30, 25, '2026-10', { sub: true }), row('s3', 'Tool C', 15, '2026-10-02', { sub: true, paid: { on: '2026-10-02', at: C0, by: 'Mika' } }),
    row('s9', 'Tool E', 9, '2026-09-12', { sub: true }), row('o1', 'Office', 600, '2026-10-20')] });
  const M = await C(ledA(), P, T, { H: 60 });
  same([M.months.by['2026-10'].subs, M.months.by['2026-10'].other, [item(M, 's1@2026-10').sec, item(M, 's1@2026-10').list, item(M, 's1@2026-10').sub], [item(M, 'o1').sec, item(M, 'o1').sub], M.months.by['2026-11'].subs.rows, M.months.by['2026-09'].subs.rows],
    [{ rows: ['s3', 's1@2026-10', 's2@2026-10'], expected: 65, done: 15 }, { rows: ['o1'], expected: 600, done: 0 }, ['subs', 'other', true], ['other', false], ['s1@2026-11', 's2@2026-11'], ['s9']],
    'the engine: a row of «Прочие расходы» that says `sub` is of the section «Подписки» in its month — three of them in October, £65 expected and £15 done — and the office is all that is left under «Прочие расходы»');
  const pg = await scene('kassa in two columns', ledA(), P, { H: 60 });
  await goCash(pg);
  let S = await holds(pg, 'the month in two columns', 'cash');
  const lay = () => pg.evaluate(() => { const b = (k) => document.querySelector('#cs-sec-' + k).getBoundingClientRect(), i = b('inflows'), R = ['team', 'taxes', 'subs', 'other', 'div'].map(b);
    return [i.left < R[0].left && Math.abs(i.top - R[0].top) < 2, R.every((r) => Math.abs(r.left - R[0].left) < 1), R.every((r, n) => !n || R[n - 1].bottom <= r.top), document.querySelectorAll('#cs-plan .cs-rows th').length]; });
  same(await lay(), [true, true, true, 0], 'what comes in stands on the left; the team, the taxes, the subscriptions, the other costs and the dividends stand one under another on the right; no list has a heading of columns');
  const anatomy = await pg.$eval(cs('team', 'rB@2026-10'), (tr) => { const top = (e) => e.getBoundingClientRect().top;
    return [[...tr.querySelectorAll('input, select, textarea')].map((e) => e.dataset.csF).join(), [...tr.querySelectorAll('button')].map((b) => [b.className, b.getAttribute('aria-expanded'), b.getAttribute('aria-label')].join('|')).join(), tr.querySelector('.cs-dd').textContent, tr.querySelector('.sw').title, [...tr.children].every((td) => td.classList.contains('cs-rm') || Math.abs(top(td) - top(tr.children[0])) < 3)]; });
  same(anatomy.map((x) => (typeof x === 'string' ? plain(x) : x)), ['amt', 'cs-more|false|Person B: подробнее', '20 окт', 'Wise', true], 'a row is one line: its day in words, its bank\'s square, its name, one box — the sum — its currency, the pounds, and the arrow that opens its card');
  // «Подписки»: folded
  const subs = () => pg.evaluate(() => { const s = document.querySelector('#cs-sec-subs'), vis = (e) => !!e && e.getClientRects().length > 0, say = s.querySelector('#cs-subs-say');
    return [vis(s.querySelector('#cs-subs-fold')), vis(s.querySelector('.tbl')), say ? say.textContent : '', [...s.querySelectorAll('button')].filter((b) => vis(b) && b.textContent.trim()).map((b) => b.textContent.trim())]; });
  same([await subs(), await text(pg, '#cs-sec-subs [data-cs-tot]'), S.fig('mon.subs.exp'), S.fig('mon.subs.done'), S.fig('mon.other.exp'), await listed(pg, 'other')], [[true, false, 'Ещё 2 на £50: Tool A, Tool B. Уже списаны: Tool C. Вне плана: Tool S.', ['Показать 4 строки']], '£65 · из них оплачено £15 · вне плана £120', 65, 15, 600, ['o1']],
    '«Подписки» is a section of its own, between the taxes and the other costs, and opens folded: its total, and one line of words — how many are still to be charged, for how much and which, which are charged already, and which charge was outside the plan');
  await shot(pg, 'rv-kassa2');
  await pg.click('#cs-sec-subs [data-cs-fold]');
  same([await subs(), await listed(pg, 'subs')], [[false, true, 'Ещё 2 на £50: Tool A, Tool B. Уже списаны: Tool C. Вне плана: Tool S.', ['+ новая подписка', 'Продублировать с сентября · 1 строка', 'Свернуть']], ['s3', 's1@2026-10', 's2@2026-10']],
    '«Показать 4 строки» unfolds it into the rows themselves - the three of the plan and the charge of October that the plan did not hold - with «+ новая подписка» and «Свернуть» under them');
  // a subscription is added where its section is
  const n0 = S.P.other.length;
  await pg.click('#cs-sec-subs [data-ed-add]');
  await pg.waitForSelector('#cs-sec-subs ' + K('add'));
  same([await pg.$eval(K('add') + '[data-ed-what][aria-pressed="true"]', (e) => e.textContent.trim()), await pg.isChecked(K('add') + '[data-ed-f="monthly"]'), await text(pg, K('add') + 'label[for="ed-name"] span')], ['Подписка', true, 'Сервис'],
    '«+ новая подписка» opens «Добавить» on a subscription, with «каждый месяц» ticked from the start');
  await fill(pg, 'add', { name: 'Tool D', amt: 12, date: '2026-10-18' });
  await pg.click(K('add') + '[data-ed-save]');
  S = await holds(pg, 'a subscription added', 'cash');
  const d = S.P.other.find((r) => r.name === 'Tool D');
  same([d.sub, d.rec, S.P.other.length - n0, 'subs' in S.P, (await listed(pg, 'subs')).includes(d.id + '@2026-10'), S.fig('mon.subs.exp'), await toastText(pg)], [true, { day: 18, from: '2026-10' }, 1, false, true, 77, 'В плане: Tool D'],
    'it is written as a row of «Прочие расходы» that says `sub` and repeats on the 18th — the plan has no sixth list — and stands in «Подписки»');
  // «Продублировать с сентября» there writes a subscription
  await pg.click('#cs-sec-subs [data-cs-dup="subs"]');
  S = await holds(pg, 'September\'s subscription written again', 'cash');
  const e = S.P.other.find((r) => r.name === 'Tool E' && r.id !== 's9');
  same([e.sub, e.amt, e.date, (await listed(pg, 'subs')).includes(e.id)], [true, 0, '2026-10-12', true], '«Продублировать с сентября» in «Подписки» writes Tool E again as a subscription of October: its name and its day, no sum');
  // a row moves between the two sections by one tick in its card; a row of another list has no such tick
  await rowCard(pg, 'other', 'o1');
  same([await pg.$$eval(K('row') + '[data-ed-f]', (l) => l.map((x) => x.dataset.edF)), await pg.isChecked(K('row') + '[data-ed-f="sub"]')], [['name', 'amt', 'cur', 'bank', 'date', 'monthly', 'sub'], false], 'the card of a row of «Прочие расходы» has every field under its name, and the tick «это подписка», off');
  await shot(pg, 'rv-kassa2-card');
  await rowSet(pg, 'other', 'o1', { sub: true });
  S = await holds(pg, '«это подписка» ticked', 'cash');
  same([stored(S, 'o1').sub, await listed(pg, 'other'), (await listed(pg, 'subs')).includes('o1'), await toastText(pg), await text(pg, '#cs-sec-other [data-cs-tot]'), plain(await text(pg, '#cs-sec-other tr.cs-none'))], [true, [], true, 'Сохранено: Office · теперь в «Подписках»', '—', 'В этом месяце строк нет.'],
    'ticked and saved: the office is a subscription — the toast says where the row went — and «Прочие расходы» is empty');
  await rowSet(pg, 'subs', 'o1', { sub: false });
  S = await holds(pg, '«это подписка» taken off', 'cash');
  same(['sub' in stored(S, 'o1'), await listed(pg, 'other'), await toastText(pg)], [false, ['o1'], 'Сохранено: Office · теперь в «Прочих расходах»'], '… taken off, it is back, and the row does not say `sub` at all');
  await rowCard(pg, 'team', 'rB@2026-10');
  same(await pg.$(K('row') + '[data-ed-f="sub"]'), null, 'a row of the team has no such tick');
  await pg.click(K('row') + '[data-ed-x]');
  // A card that opens in sight leaves the page where it stands; one that opens below the edge of the window is
  // brought up by just enough to be seen. (Until 9 October 2026 every card was thrown to the middle of the window:
  // Mika, of the page with the new rows, «при открытии страница скачет».)
  await pg.evaluate(() => window.scrollTo(0, 0));
  // … nor does anything in the row that opens: its day, name, sum and currency stand where they stood. (The open row
  // was first set in by eight pixels; Mika, 9 October 2026: «дата платежа скачет при раскрытии».)
  const places = () => pg.$eval(cs('inflows', 'rA@2026-10'), (tr) => ['.cs-dd', '.cs-nt', '.cs-amt', '.cs-ct', '.cs-more'].map((q) => { const r = tr.querySelector(q).getBoundingClientRect(); return [Math.round(r.left * 2) / 2, Math.round(r.top * 2) / 2].join(); }));
  const stood = await places();
  await rowCard(pg, 'inflows', 'rA@2026-10');
  same([await places(), await pg.$eval(cs('inflows', 'rA@2026-10'), (tr) => { const g = getComputedStyle(tr, '::before'), c = document.querySelector('[data-ed-card="row"]').getBoundingClientRect(), r = tr.getBoundingClientRect(); return [g.backgroundColor !== 'rgba(0, 0, 0, 0)', Math.round(r.left - c.left), Math.round(c.right - r.right)]; })], [stood, [true, 10, 10]],
    'a row is pressed: nothing in it has moved — and the lighter ground it stands on, like its card, reaches ten pixels past it on either side');
  same(await pg.evaluate(() => { const r = document.querySelector('[data-ed-card="row"]').getBoundingClientRect(); return [window.scrollY, r.top > 0 && r.bottom < innerHeight]; }), [0, true], 'a row near the top is pressed: its card is whole in the window, and the page has not moved');
  await pg.click(K('row') + '[data-ed-x]');
  const low = cs('div', (await listed(pg, 'div'))[0] || 'none'), lowRow = (await pg.$(low)) ? low : cs('other', 'o1');
  const y0 = await pg.evaluate((sel) => { const tr = document.querySelector(sel); window.scrollTo(0, Math.max(0, tr.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 6)); return window.scrollY; }, lowRow);
  await pg.click(lowRow + ' .cs-nt');
  await pg.waitForSelector('#view-cash tr.cs-edrow ' + K('row'));
  const at = await pg.evaluate((sel) => { const c = document.querySelector('#view-cash tr.cs-edrow [data-ed-card="row"]').getBoundingClientRect(), r = document.querySelector(sel).getBoundingClientRect(), bar = document.querySelector('.topbar').getBoundingClientRect();
    return [window.scrollY, Math.round(c.height), Math.round(window.innerHeight - c.bottom), r.top >= bar.bottom - 1]; }, lowRow);
  ok(y0 > 0 && at[0] > y0 && at[0] - y0 <= at[1] + 40 && at[2] >= 0 && at[2] <= 40 && at[3], 'a row at the very foot of the window is pressed: the page comes up by the height of the card and no more — the card ends at the foot of the window, and the row is still above it, in sight', [y0, at]);
  await pg.click(K('row') + '[data-ed-x]');
  // «Свернуть», and a narrow window
  await pg.click('#cs-sec-subs .cs-addrow [data-cs-fold]');
  same((await subs()).slice(0, 2), [true, false], '«Свернуть» folds the section back into its line');
  await pg.setViewportSize({ width: 1000, height: 900 });
  same(await pg.$eval('#cs-two', (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length), 1, 'in a window 1000px wide the two columns are one: the lists stand one under another');
  await finish(pg);
});

await run('rv-motion', 'what unfolds, unfolds with one motion — a row\'s card, «Подписки», a week, a day, «Аналитика» — and a reader who asked for less motion gets none', async () => {
  // Mika, 8 October 2026: «на все раскрывания сделай приятную плавную анимацию». The page is drawn afresh at every
  // change, so the motion is played on what has just been drawn; what is shut by its own button folds first and is
  // drawn away when the fold ends. Every other check asks the page for less motion; this one does not.
  const P = planW({ other: [every('s1', 'Tool A', 20, 10, '2026-10', { sub: true }), every('s2', 'Tool B', 30, 25, '2026-10', { sub: true }), row('o9', 'Office', 600, '2026-10-20')] });
  serve(ledA(), P);
  const pg = await open('motion', undefined, { motion: true, folded: true });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  // what an element is doing right now: how many motions run on it, and how tall it is drawn
  const moving = (sel) => pg.$eval(sel, (e) => [e.getAnimations().length, Math.round(e.getBoundingClientRect().height)]);
  const still = (sel) => pg.waitForFunction((s) => { const e = document.querySelector(s); return !!e && !e.getAnimations().length; }, sel);
  // «Сегодня»: a week, «Аналитика», a row's card
  const wk = await pg.$eval('#view-today .td-wk[aria-expanded="false"]', (b) => b.dataset.tdWk);
  await pg.click(`#view-today .td-wk[data-td-wk="${wk}"]`);
  const body = `#view-today .td-wk[data-td-wk="${wk}"] + .td-wkd`;
  const w0 = await moving(body);
  await still(body);
  const w1 = await moving(body);
  ok(w0[0] === 1 && w1[0] === 0 && w1[1] > w0[1] && w1[1] > 20, 'a week of «Сегодня» pressed open grows to its height: one motion while it does, none after', [w0, w1]);
  await pg.click(`#view-today .td-wk[data-td-wk="${wk}"]`);
  same([await pg.$eval(`#view-today .td-wk[data-td-wk="${wk}"]`, (b) => b.getAttribute('aria-expanded')), (await moving(body))[0]], ['true', 1], '… pressed again, it folds first: it is still drawn, and moving');
  await pg.waitForSelector(body, { state: 'detached' });
  same(await pg.$eval(`#view-today .td-wk[data-td-wk="${wk}"]`, (b) => b.getAttribute('aria-expanded')), 'false', '… and is drawn away when the fold ends');
  await pg.click('#view-today .td-anl > summary');
  const a0 = await pg.$eval('#view-today .td-anl', (d) => [d.open, d.querySelector(':scope > .stack').getAnimations().length, d.querySelectorAll('#td-chart *').length > 5]);
  await still('#view-today .td-anl > .stack');
  same([a0, await pg.evaluate(() => localStorage.getItem('selfstudio-money-analytics'))], [[true, 1, true], '1'], '«Аналитика» opens the same way, with its chart already drawn while it grows — and the page remembers that it is open');
  await pg.click('#view-today .td-anl > summary');
  await pg.waitForFunction(() => !document.querySelector('#view-today .td-anl').open);
  await pg.click('#view-today .td-anl > summary');
  await still('#view-today .td-anl > .stack');
  ok((await pg.$eval('#view-today .td-anl > .stack', (e) => e.getBoundingClientRect().height)) > 100, '… shut and opened again, it is whole: nothing of the fold is left on it');
  // «Касса»: a row's card, and the same card shut three ways
  await goCash(pg);
  await pg.click(cs('team', 'rB@2026-10') + ' .cs-nt');
  const card = '#cs-sec-team tr.cs-edrow ' + K('row').trim();
  const c0 = await moving(card);
  await still(card);
  const c1 = await moving(card);
  ok(c0[0] === 1 && c1[0] === 0 && c1[1] > c0[1] && c1[1] > 150, 'a row of the month pressed: its card grows out from under it', [c0, c1]);
  await pg.click(K('row') + '[data-ed-do="part"]');
  await pg.waitForSelector(K('row') + '[data-ed-askbox="part"]');
  same([(await moving(card))[0], (await moving(K('row') + '[data-ed-askbox="part"]'))[0]], [0, 1], '«Частично…» in it: the question unfolds, the card around it does not start again');
  await still(K('row') + '[data-ed-askbox="part"]');
  await pg.click(K('row') + '[data-ed-x]');
  same([!!(await pg.$(card)), (await moving(card))[0]], [true, 1], '«Закрыть»: the card folds first');
  await pg.waitForSelector(card, { state: 'detached' });
  await pg.click(cs('team', 'rB@2026-10') + ' .cs-nt');
  await still(card);
  await pg.click(cs('team', 'rB@2026-10') + ' .cs-dd');
  await pg.waitForSelector(card, { state: 'detached' });
  ok(!(await pg.$('[data-ed-card]')), '… and so it does when the row is pressed a second time');
  // One card goes while another comes: the first is not simply left out of the page as it is drawn afresh — a copy
  // of it folds away where it stood, so the row that was pressed does not leap up by the height of that card.
  // (Mika, 9 October 2026: «при открытии страница скачет».)
  await pg.click(cs('team', 'rB@2026-10') + ' .cs-nt');
  await still(card);
  // (pressed and measured in one breath: a moment later the copy is already folding and the row is on its way up)
  const leap = await pg.evaluate((sel) => { const top = () => Math.round(document.querySelector(sel).getBoundingClientRect().top), y0 = top(), s0 = window.scrollY; document.querySelector(sel + ' .cs-nt').click(); return [top() - y0, window.scrollY - s0]; }, cs('other', 'o9'));
  const mid = await pg.evaluate(() => { const g = document.querySelector('#cs-sec-team tr.cs-edrow'), c = document.querySelectorAll('[data-ed-card]');
    return [c.length, c[0].closest('section').id, !!g && !g.querySelector('[data-ed-card], [id], [data-ed-f]') && g.querySelector('.ed-card').getAnimations().length, !!g && g.inert]; });
  same([mid, Math.abs(leap[0]) <= 2, leap[1]], [[1, 'cs-sec-other', 1, true], true, 0],
    'a row lower down is pressed while a card is open above it: there is one card, the new one; what is left of the old one is a copy that is folding and that nothing can press or read; and at the press the row has not leapt, nor has the page');
  await pg.waitForSelector('#cs-sec-team tr.cs-edrow', { state: 'detached' });
  await still('#cs-sec-other tr.cs-edrow ' + K('row').trim());
  ok((await pg.$eval('#cs-sec-other tr.cs-edrow ' + K('row').trim(), (e) => { const r = e.getBoundingClientRect(); return r.top > 0 && r.bottom <= innerHeight; })), '… when the copy has folded away the new card is whole in the window');
  await pg.click(K('row') + '[data-ed-do="paid"]');
  same([await pg.$('[data-ed-card]'), await pg.$eval('#cs-sec-other tr.cs-edrow .ed-card', (e) => e.getAnimations().length)], [null, 1], '«Оплачено» in a card: the row is marked at once, and the card folds away under it instead of vanishing');
  await pg.waitForSelector('#cs-sec-other tr.cs-edrow', { state: 'detached' });
  // «Подписки», and a day of «По дням»
  await pg.click('#cs-sec-subs [data-cs-fold]');
  const s0 = await moving('#cs-sec-subs .tbl');
  await still('#cs-sec-subs .tbl');
  ok(s0[0] === 1 && (await moving('#cs-sec-subs .tbl'))[1] > 40, '«Показать 2 строки»: the rows of «Подписки» grow out of the line of words', s0);
  await pg.click('#cs-sec-subs .cs-addrow [data-cs-fold]');
  await pg.waitForFunction(() => { const f = document.querySelector('#cs-subs-fold'); return !!f && !f.hidden; });
  ok(await pg.$eval('#cs-sec-subs .tbl', (e) => e.hidden), '«Свернуть» folds them back into it');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  const day = '2026-10-20'; // Person B's day
  same(await pg.$eval(`#cs-stmt tr[data-cs-row="${day}"]`, (tr) => tr.getAttribute('aria-expanded')), 'false', '(the day of Person B\'s payment stands shut)');
  await pg.click(`#cs-stmt tr[data-cs-row="${day}"] td:first-child`);
  const lines = `#cs-stmt tr[data-cs-row="${day}"] + tr.cs-items ul`;
  const d0 = await moving(lines);
  await still(lines);
  ok(d0[0] === 1 && (await moving(lines))[1] > 10, 'a day of «По дням» pressed open: its lines grow under it', d0);
  await pg.click(`#cs-stmt tr[data-cs-row="${day}"] td:first-child`);
  await pg.waitForSelector(lines, { state: 'detached' });
  same(await pg.$eval(`#cs-stmt tr[data-cs-row="${day}"]`, (tr) => tr.getAttribute('aria-expanded')), 'false', '… and fold away when it is pressed again');
  await pg.context().close();
  // … and for a reader who asked for less motion nothing moves and nothing waits
  const calm = await open('no motion');
  await calm.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(calm);
  await calm.click(cs('team', 'rB@2026-10') + ' .cs-nt');
  const q0 = await calm.$eval('#cs-sec-team tr.cs-edrow ' + K('row').trim(), (e) => [e.getAnimations().length, e.getBoundingClientRect().height > 150]);
  await calm.click(K('row') + '[data-ed-x]');
  same([q0, await calm.$('[data-ed-card]')], [[0, true], null], 'with «меньше движения» asked of the system the card is simply there, whole, and «Закрыть» takes it away at once');
  await calm.context().close();
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
      await openAdd(pg, 'taxes');
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

// =====================================================================================================================
// WHO MAY DO WHAT. A reader's page, and «Настройки → Люди» (the owner's decision of 9 October 2026: Misha and Vanya
// read, Mika alone writes, and Mika makes their sign-ins himself, from the page).
// =====================================================================================================================
const man = (login, name, role, more = {}) => ({ login, name, role, me: false, hasPassword: false, passwordSetAt: null, disabled: false, linkExpires: null, added: false, lastSeen: null, ...more });
const asOwner = () => {
  store.me = { id: 'mika', name: 'Mika', firstName: 'Mika', isFounderTier: true, role: 'owner', canWrite: true, canManage: true };
  store.people = [man('mika', 'Mika', 'owner', { me: true, hasPassword: true, passwordSetAt: '2026-10-01T09:00:00Z', lastSeen: '2026-10-06T10:55:00Z' }), man('misha', 'Misha', 'reader'), man('vanya', 'Vanya', 'reader')];
};
const asReader = () => { store.me = { id: 'misha', name: 'Misha', firstName: 'Misha', isFounderTier: true, role: 'reader', canWrite: false, canManage: false }; };
// Every control of the screen in view whose press, change or typing would change a document, and that can be used.
const offered = (pg) => pg.evaluate(() => [...document.querySelectorAll(window.__money.acts)].filter((e) => {
  const view = e.closest('main > [id^="view-"]');
  if (view && view.hidden) return false;
  return e.matches('button,a,label,details,input,select,textarea') && !e.disabled && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
}).map((e) => `${e.tagName.toLowerCase()} ${(e.textContent || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 30)}`));
const metas = (pg) => texts(pg, '#view-people .ppl-meta');

await run('rv-reader', 'a reader is shown everything and offered nothing that changes it, and the page sends no save', async () => {
  // An older plan is rewritten as version 3 by whoever opens it first - the one save a page makes unasked. A reader
  // is not that somebody: their page reads the plan as version 3 and writes nothing.
  const v1 = {
    v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, horizon: '2026-11-10', fx: { USD: 1.3, RUB: 110, EUR: 1.2, AMD: 500 },
    banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }],
    inflows: [{ id: 'r3', name: 'Client A', amt: 8000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-27' }],
    team: [], taxes: [], other: [],
  };
  serve(ledA(), v1);
  const writer = await open('somebody who may save');
  same(await puts('cash', 1), 1, 'for somebody who may save, opening this plan saves it once (the check is not vacuous)');
  await writer.context().close();
  serve(ledA(), v1);
  asReader();
  const old = await open('a reader, an older plan', undefined, { who: 'Misha' });
  await sleep(1500);
  same([store.cash.puts, store.led.puts, store.cash.doc.v, await old.evaluate(() => window.__cash.state().v)], [0, 0, 1, 3],
    'a reader\'s page sends no save when it opens: the older plan is read as version 3 and left as it lies');
  await old.context().close();

  // The made-up studio, as a reader sees it.
  serve(demoLedger(T), demoPlan(T));
  asReader();
  const pg = await open('a reader', undefined, { who: 'Misha' });
  same([await pg.evaluate(() => window.__money.readOnly), await text(pg, '#roSay'), await pg.isVisible('#roSay'), await pg.isHidden('#sync')],
    [true, 'Misha · только просмотр', true, true], 'the bar says whose page this is and that it only looks; the «сохранено» pill has nothing to say here');
  const fig = (await look(pg)).live;
  ok(Object.keys(fig).length > 5, 'the figures of «Сегодня» are read', Object.keys(fig).length);
  for (const t of ['today', 'cash', 'inbox', 'dashboard', 'reports', 'settings']) {
    await pg.click(`.nav [data-tab="${t}"]`);
    await sleep(120);
    same(await offered(pg), [], `«${t}»: nothing that changes anything can be pressed or typed`);
  }
  await shot(pg, 'rv-reader-settings');
  same(await texts(pg, '#view-settings .set-nav button'), ['Общие', 'Таблица', 'Люди'], '«Настройки» has no «Загрузка выписок» for a reader');
  same(await pg.$$eval('#view-settings input[data-fx]', (l) => [l.length, l.every((e) => e.disabled)]), [4, true], 'the rates are shown, and not to be typed in');
  await pg.click('#view-settings .set-nav [data-tabgo="ledger"]');
  same(await offered(pg), [], '«Таблица»: the same');
  await pg.click('#view-ledger tbody tr[data-row]');
  same(await pg.$('#e-l'), null, 'a row of «Таблица» does not open the form that changes it');
  // «Касса»: the sum is a figure, not a box; a row opens to be read
  await pg.click('.nav [data-tab="cash"]');
  same([await pg.$$eval('#view-cash input.cs-amt', (l) => l.length), (await pg.$$eval('#cs-sec-team .cs-at', (l) => l.length)) > 3, await pg.isVisible('#view-cash [data-cs-fold]')],
    [0, true, true], 'in a month of «Касса» every sum is a figure; «Показать N строк» of «Подписки» is still there to press');
  await pg.click('#cs-sec-team tr.cs-r:not(.cs-done)');
  await pg.waitForSelector('#view-cash [data-ed-card="row"]');
  same([await texts(pg, '#view-cash [data-ed-card="row"] button'), /Счёт: \S+ [A-Z]{3}/.test(await text(pg, '#view-cash [data-ed-card="row"] .ed-why')), await pg.$$eval('#view-cash [data-ed-card="row"] input, #view-cash [data-ed-card="row"] select', (l) => l.length)],
    [['Закрыть'], true, 0], 'its card says what the row is - whose it is, the account, the day - and has «Закрыть» and nothing else');
  await shot(pg, 'rv-reader-cash');
  await pg.click('#view-cash [data-ed-card="row"] [data-ed-x]');
  await pg.click('#view-cash [data-cs-view="days"]');
  await sleep(120);
  same(await offered(pg), [], '«Касса · По дням»: the same');
  // «Сегодня»: «Денег сейчас» opens «Вписать остаток» for somebody who may save - and nothing for a reader
  await pg.click('.nav [data-tab="today"]');
  await pg.click('#view-today [data-ed-bal]');
  same(await pg.$('[data-ed-card]'), null, 'a press on «Денег сейчас» opens nothing');
  same((await look(pg)).live, fig, 'and every figure of «Сегодня» is what it was when the page opened');
  await sleep(900);
  same([store.led.puts, store.cash.puts], [0, 0], 'after all of it: not one save was sent, to either document');
  await pg.context().close();

  // The address of «Загрузка выписок» leads a reader to «Настройки».
  serve(demoLedger(T), demoPlan(T));
  asReader();
  const up = await open('a reader at #upload', undefined, { who: 'Misha', hash: '#upload' });
  same([await up.isHidden('#view-upload'), await up.isVisible('#view-settings')], [true, true], 'the address of «Загрузка выписок» shows a reader «Настройки»');
  await up.context().close();
});

await run('rv-reader-late', 'somebody the owner makes a reader while their page stands open is told so at their next save, and offered nothing after it', async () => {
  serve(demoLedger(T), demoPlan(T));
  asOwner();
  store.me = { ...store.me, id: 'vanya', name: 'Vanya', firstName: 'Vanya', role: 'editor', canManage: false };
  const pg = await open('an editor', undefined, { who: 'Vanya', quiet: /403/ });
  await pg.click('.nav [data-tab="cash"]');
  same([await pg.evaluate(() => window.__money.readOnly), (await pg.$$eval('#view-cash input.cs-amt', (l) => l.length)) > 3], [false, true], 'an editor\'s page is the page of somebody who saves');
  store.cash.deny = true;                              // the owner: «только смотрит»
  const box = '#cs-sec-team tr.cs-r:not(.cs-done) input.cs-amt';
  await pg.fill(box, '4321');
  await pg.press(box, 'Tab');
  await pg.waitForFunction(() => window.__money.readOnly);
  same([await toastText(pg), await text(pg, '#roSay'), await pg.$$eval('#view-cash input.cs-amt', (l) => l.length), store.cash.puts, store.cash.denied],
    ['Теперь у вас только просмотр: сохранить нельзя', 'Vanya · только просмотр', 0, 0, 1],
    'the save is refused once, the page says so out loud and in the bar, and is a reader\'s page from then on');
  await sleep(1200);
  same([store.cash.denied, await offered(pg)], [1, []], '… it does not try again, and offers nothing that changes anything');
  await pg.context().close();
});

await run('rv-people', '«Настройки → Люди»: the owner adds a person, issues a link after saying the password again, says what each may do and shuts a login out', async () => {
  serve(demoLedger(T), demoPlan(T));
  asOwner();
  const pg = await open('the owner at «Люди»', undefined, { hash: '#people', quiet: /40[039]/ });
  await pg.waitForSelector('#view-people .ppl-row >> nth=2');
  same([await texts(pg, '#view-settings .set-nav button'), await text(pg, '#view-people h1'), await text(pg, '#view-people .ppl h2 .note')],
    [['Общие', 'Загрузка выписок', 'Таблица', 'Люди'], 'Люди', '3 человека'], '«Люди» is the fourth screen of «Настройки», and the bar lights «Настройки»');
  same(await pg.$eval('.nav [data-tab="settings"]', (b) => b.classList.contains('active')), true, '… which is the tab lit');
  same(await metas(pg), ['mika · это вы · правит и управляет людьми · последний вход сегодня', 'misha · только смотрит · пароля ещё нет', 'vanya · только смотрит · пароля ещё нет'],
    'a person is one line: the login, what they may do, and how things stand with their sign-in');
  await shot(pg, 'rv-people');
  // a link: only after the owner's own password
  await pg.click('#view-people [data-pp-open="misha"]');
  same([await texts(pg, '#view-people [data-pp-card] button'), await pg.inputValue('#pp-name'), await pg.inputValue('#pp-role')],
    [['Ссылка для входа', 'Отключить', 'Закрыть'], 'Misha', 'reader'], 'a press on a line opens the person\'s card');
  await pg.click('#view-people [data-pp-link]');
  await pg.fill('#pp-own', 'not the password');
  await pg.click('#view-people [data-pp-issue]');
  await pg.waitForFunction(() => !document.querySelector('#toast').hidden);
  same([await toastText(pg), await pg.$('#pp-link'), await pg.inputValue('#pp-own'), store.people[1].linkExpires], ['Пароль не тот', null, '', null],
    'with a wrong password no link is made, and the box is emptied to type it again');
  await pg.fill('#pp-own', PASS);
  await pg.press('#pp-own', 'Enter');
  await pg.waitForSelector('#pp-link');
  // The stand names the moment in UTC; the page says it by the clock of the browser, which is this machine's.
  const end = new Date('2026-10-08T11:00:00Z');
  const ends = `${end.getDate()} окт ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  same([await pg.inputValue('#pp-link'), await pg.$eval('#pp-link', (e) => e.readOnly), (await metas(pg))[1]],
    [LINK, true, `misha · только смотрит · ссылка выдана, действует до ${ends}`], 'with the right one the link is shown, once, and the line says until when it holds - on the clock of whoever reads it');
  same(store.asked.filter((a) => a[1] === '/api/people/link'), [['POST', '/api/people/link', { login: 'misha', password: 'given' }], ['POST', '/api/people/link', { login: 'misha', password: 'given' }]],
    'the door was asked for misha\'s link, with a password each time');
  await shot(pg, 'rv-people-link');
  const held = await pg.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  // The owner goes to another tab without shutting the card: the link does not stay behind in a screen nobody looks at.
  await pg.click('.nav [data-tab="today"]');
  same([held.includes('set-password'), (await pg.content()).includes('set-password#t=')], [false, false], 'the link is kept in no storage, and is gone from the page the moment «Люди» is left');
  await pg.click('.nav [data-tab="settings"]');
  await pg.click('#view-settings .set-nav [data-tabgo="people"]');
  await pg.waitForSelector('#view-people .ppl-row >> nth=2');
  same([await pg.$('#view-people [data-pp-card]'), (await metas(pg))[1]], [null, `misha · только смотрит · ссылка выдана, действует до ${ends}`], 'coming back, every card is shut, and the line still says that a link is out');
  // what a person may do; the switch
  await pg.click('#view-people [data-pp-open="vanya"]');
  await pg.selectOption('#pp-role', 'editor');
  await pg.waitForFunction(() => document.querySelectorAll('#view-people .ppl-meta')[2].textContent.includes('смотрит и правит'));
  await pg.fill('#pp-name', 'Ваня');
  await pg.press('#pp-name', 'Enter');
  await pg.waitForFunction(() => document.querySelectorAll('#view-people .ppl-nm')[2].textContent === 'Ваня');
  await pg.click('#view-people [data-pp-off]');
  await pg.waitForFunction(() => document.querySelectorAll('#view-people .ppl-meta')[2].textContent.includes('вход отключён'));
  same([(await metas(pg))[2], await texts(pg, '#view-people [data-pp-card] button'), store.people[2]].map((x) => (x && x.login ? [x.name, x.role, x.disabled] : x)),
    ['vanya · смотрит и правит · вход отключён', ['Включить', 'Закрыть'], ['Ваня', 'editor', true]],
    'a role, a name and the switch are each sent as they are changed; a login that is shut out is offered no link');
  // a new person
  await pg.click('#view-people [data-pp-new]');
  await pg.fill('#pp-add-name', 'Anna');
  await pg.fill('#pp-add-login', 'Anna M');
  await pg.click('#view-people [data-pp-add]');
  await pg.waitForFunction(() => document.querySelector('#toastText').textContent.includes('латинские'));
  same(store.people.length, 3, 'a login that cannot be one is refused in words, and nobody is added');
  await pg.fill('#pp-add-login', 'anna');
  await pg.press('#pp-add-login', 'Enter');
  await pg.waitForSelector('#view-people [data-pp-open="anna"]');
  same([await text(pg, '#view-people .ppl h2 .note'), (await metas(pg))[3], await pg.$eval('#view-people .ppl-open .ppl-nm', (e) => e.textContent), await pg.$('#pp-add-name')],
    ['4 человека', 'anna · только смотрит · пароля ещё нет', 'Anna', null], 'a new person only looks and has no password yet; their card stands open for the link');
  // one's own card: the password, and the way out
  await pg.click('#view-people [data-pp-open="mika"]');
  same(await texts(pg, '#view-people [data-pp-card] button'), ['Сменить пароль', 'Выйти', 'Закрыть'], 'one\'s own card changes the password and signs out');
  await pg.click('#view-people [data-pp-pw]');
  await pg.fill('#pp-cur', 'not the password');
  await pg.fill('#pp-new', 'another horse battery staple');
  await pg.click('#view-people [data-pp-pwsave]');
  await pg.waitForFunction(() => document.querySelector('#toastText').textContent === 'Пароль не тот');
  await pg.fill('#pp-cur', PASS);
  await pg.fill('#pp-new', 'short');
  await pg.click('#view-people [data-pp-pwsave]');
  await pg.waitForFunction(() => document.querySelector('#toastText').textContent.includes('не короче 12'));
  same(store.asked.filter((a) => a[1] === '/api/auth/password').length, 1, 'a new password that is too short is not sent at all');
  await pg.fill('#pp-new', 'another horse battery staple');
  await pg.press('#pp-new', 'Enter');
  await pg.waitForFunction(() => document.querySelector('#toastText').textContent.startsWith('Пароль сменён'));
  same([store.pass, await pg.$('#pp-cur')], ['another horse battery staple', null], 'the password is changed after the current one is given, and the boxes are gone');
  same([store.led.puts, store.cash.puts], [0, 0], 'nothing of «Люди» touched either document');
  await pg.click('#view-people [data-pp-out]');
  await pg.waitForURL(/\/login$/);
  same(store.asked[store.asked.length - 1].slice(0, 2), ['POST', '/api/auth/logout'], '«Выйти» closes the sign-in on the server and leaves for the sign-in page');
  await pg.context().close();

  // somebody who is not the owner sees their own line and nobody else's
  serve(demoLedger(T), demoPlan(T));
  asReader();
  const me = await open('a reader at «Люди»', undefined, { who: 'Misha', hash: '#people' });
  await me.waitForSelector('#view-people .ppl-row');
  same([await metas(me), await text(me, '#view-people .ppl h2'), await me.$('#view-people [data-pp-new]'), store.asked.filter((a) => a[1] === '/api/people').length],
    [['misha · это вы · только смотрит'], 'Ваш вход', null, 0], 'a reader\'s «Люди» is their own line: nobody is listed, nobody can be added, and the owner\'s list is never asked for');
  await me.click('#view-people [data-pp-open="misha"]');
  same(await texts(me, '#view-people [data-pp-card] button'), ['Сменить пароль', 'Выйти', 'Закрыть'], '… with their own password and the way out');
  same(await offered(me), [], 'and still nothing that changes a document');
  await shot(me, 'rv-people-reader');
  await me.context().close();
});

// =====================================================================================================================
// THE RATE OF A DAY (the owner's decision of 9 October 2026). The stand keeps the exchange rates by day; what has
// already happened is counted at the rate of its own day, and only what is ahead moves with today's.
// =====================================================================================================================
const day4 = (usd, rub) => ({ USD: usd, EUR: 1.17, RUB: rub, AMD: 480 });
const DAYS = { '2026-10-01': day4(1.30, 110), '2026-10-03': day4(1.32, 111), '2026-10-05': day4(1.36, 112), [T]: day4(1.40, 114) };
const withRates = (led, days = DAYS, own = null) => ({ ...led, fxd: JSON.parse(JSON.stringify(days)), ...(own ? { fxo: own } : {}) });

await run('rv-rates', 'what has happened is counted at the rate of its own day; today\'s rate moves only what is still ahead and what the accounts hold', async () => {
  // Client U paid $1,000 on 3 October - marked by hand, no statement yet. Person V is owed $2,000 on the 11th.
  // The dollar account holds $500, typed on the 5th - the $1,000 of the 3rd is inside it. The rate typed into the page long ago is 1.25.
  const P = plan3({
    banks: [bal('Wise', 'GBP', 10000, '2026-10-05'), bal('Wise', 'USD', 500, '2026-10-05')],
    inflows: [row('u', 'Client U', 1000, '2026-10-03', { cur: 'USD', vat: false, paid: { on: '2026-10-03', at: ms('2026-10-03T12:00:00Z'), by: BY } })],
    team: [row('v', 'Person V', 2000, '2026-10-11', { cur: 'USD' }), row('w', 'Person W', 1000, '2026-10-03', { cur: 'USD' })],
  });
  // Person W was owed $1,000 on the 3rd and was paid from the pound account that day: the statement shows −£757.58.
  const led = { ...ledger([reach('Wise', '2026-10-02'), reach('Wise', '2026-10-02', 'USD'), filed('f-w', '2026-10-03', -757.58, 'cogs', 'Person W', { at: AT2 })]), fx: { ...FX, USD: 1.25 } };
  const paidW = (M) => [item(M, 'w').state, item(M, 'w').done && item(M, 'w').done.by, item(M, 'w').exp];
  const of = (M) => [item(M, 'u').state, item(M, 'u').exp, item(M, 'u').done.fx || 0, item(M, 'u').done.fxDay || '', -item(M, 'v').cash, acct(M, 'Wise|USD').gbp, M.fx.USD];
  let M = await C(withRates(led), P);
  same(of(M), ['done', round2(1000 / 1.32), 1.32, '2026-10-03', round2(2000 / 1.40), round2(500 / 1.40), 1.40],
    'the $1,000 that came on the 3rd is worth what a dollar was worth on the 3rd; the $2,000 still owed and the dollars in the account, what it is worth today');
  same(paidW(M), ['done', 'row', 757.58], 'a line in dollars paid in pounds is closed by its row: £757.58 was $1,000 on the 3rd');
  // today's rate moves
  const moved = JSON.parse(JSON.stringify(DAYS));
  moved[T].USD = 1.60;
  M = await C(withRates(led, moved), P);
  same(of(M), ['done', round2(1000 / 1.32), 1.32, '2026-10-03', round2(2000 / 1.60), round2(500 / 1.60), 1.60],
    'today\'s rate moves: what came on the 3rd does not move by a penny; what is ahead and what the account holds do');
  same(paidW(M), ['done', 'row', 757.58], '… and the line that row closed on the 3rd is still closed by it: a row is held against its line by the rate of the row\'s own day');
  // a rate of one's own is for looking ahead, and for nothing that has happened
  M = await C(withRates(led, DAYS, { USD: 2 }), P);
  same(of(M), ['done', round2(1000 / 1.32), 1.32, '2026-10-03', 1000, 250, 2], 'a rate typed over the day\'s counts what is ahead and nothing that has happened');
  // a day the table has no rate for takes the latest day before it; a day before the table began, the typed rate
  const gap = plan3({ ...P, inflows: [row('u', 'Client U', 1000, '2026-10-04', { cur: 'USD', vat: false, paid: { on: '2026-10-04', at: ms('2026-10-04T12:00:00Z'), by: BY } })] });
  same(item(await C(withRates(led), gap), 'u').exp, round2(1000 / 1.32), 'the 4th is not in the table: the 3rd answers for it');
  const early = plan3({ ...P, inflows: [row('u', 'Client U', 1000, '2026-09-28', { cur: 'USD', vat: false, paid: { on: '2026-09-28', at: ms('2026-09-28T12:00:00Z'), by: BY } })] });
  M = await C(withRates(led), early);
  same([item(M, 'u').exp, item(M, 'u').done.fx || 0], [800, 0], 'a payment of before the table began is counted by the rate that was typed then - and its card names no day\'s rate, for there was none');
  // no table at all: every day's rate is the typed one, as it was before there were days
  M = await C(led, P);
  same(of(M), ['done', 800, 0, '', 1600, 400, 1.25], 'without a table - the laptop tool, a stand that asks nobody - the page counts as it always did');
  same((await C({ ...led, fxo: { USD: 2 } }, P)).fx.USD, 1.25, '… and a rate of one\'s own stands over the table\'s only: without a table there is no box to take it back in');
  // a line in pounds is its own sum on any day
  const gbp = plan3({ ...P, inflows: [row('u', 'Client U', 1000, '2026-10-03', { vat: false, paid: { on: '2026-10-03', at: ms('2026-10-03T12:00:00Z'), by: BY } })] });
  M = await C(withRates(led), gbp);
  same([item(M, 'u').exp, item(M, 'u').done.fx || 0], [1000, 0], 'a line in pounds has no rate');

  // A line closed by a row of the statement in its own currency says what the table says of that row - here a row
  // that was read at the typed rate, 1.35, before there were days: «Касса» does not count it over behind the table's back.
  const X = plan3({ ...P, team: [row('x', 'Person X', 1000, '2026-10-03', { cur: 'USD' })] });
  const ledX = { ...ledger([reach('Wise', '2026-10-02'), reach('Wise', '2026-10-02', 'USD'), filed('f-x', '2026-10-03', -1000, 'cogs', 'Person X', { cur: 'USD', at: AT2 })]), fx: { ...FX, USD: 1.25 } };
  const paidX = (M) => [item(M, 'x').state, item(M, 'x').exp, item(M, 'x').done.fxBy, Math.round(item(M, 'x').done.fx * 100) / 100];
  same([paidX(await C(withRates(ledX), X)), paidX(await C(withRates(ledX, moved), X))], [['done', 740.74, 'rows', 1.35], ['done', 740.74, 'rows', 1.35]],
    'a dollar line closed by a dollar row stands at the row\'s own pounds, £740.74, whatever the day\'s rate or today\'s');
  same([paidX(await C(ledX, X)), paidX(await C({ ...ledX, fx: { ...FX, USD: 1.6 } }, X))], [['done', 740.74, 'rows', 1.35], ['done', 740.74, 'rows', 1.35]],
    '… and without a table too, whatever rate is typed into the page afterwards: what is paid does not move with a rate on the laptop tool either (it used to: £800 at the typed 1.25)');

  // The made-up studio, whole: today's rates are moved a long way, and nothing that is done moves.
  const far = JSON.parse(JSON.stringify(DAYS));
  far[T] = { USD: 1.6, EUR: 1.35, RUB: 150, AMD: 640 };
  const pastOf = (M) => ({
    lines: M.items.filter((it) => it.state === 'done').map((it) => [it.id, it.exp, it.expDone, it.done.got, it.done.by]),
    month: SECS.map((k) => M.months.by[T.slice(0, 7)][k].done),
    taxes: M.taxes.periods.filter((p) => p.state === 'paid').map((p) => [p.key, p.paid]),
  });
  const studio = async (days) => pastOf(await C({ ...demoLedger(T), fxd: JSON.parse(JSON.stringify(days)) }, demoPlan(T), T, { H: 60 }));
  const near = await studio(DAYS);
  ok(near.lines.length > 5 && near.lines.some((l) => !String(l[0]).includes('GBP')), 'the made-up studio has lines that are done', near.lines.length);
  const moved2 = await studio(far);
  const differ = [];
  for (const k of ['lines', 'month', 'taxes']) near[k].forEach((v, i) => { if (JSON.stringify(v) !== JSON.stringify(moved2[k][i])) differ.push([k, v, moved2[k][i]]); });
  same([differ, moved2.lines.length, moved2.taxes.length], [[], near.lines.length, near.taxes.length], 'the made-up studio at today\'s rates and at rates a fifth further off: every line that is done, the month\'s «получено» and «оплачено», every tax period that is paid - the same to the penny');

  // On the page. The stand hands the table over; «Настройки» shows the day's rates, one line a currency.
  serve(led, P);
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: '2026-10-06T05:00:00Z' };
  const pg = await open('rates');
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same((await look(pg)).M.fx.USD, 1.40, 'the page counts by the table the stand handed over');
  await pg.click('.nav [data-tab="settings"]');
  same([await text(pg, '#fx-card h2'), await pg.$$eval('#fx-card .fxl-row', (l) => l.map((r) => [r.querySelector('.fxl-v').textContent, r.querySelector('.fxl-u').textContent, r.querySelector('input').value])), await pg.$$eval('#view-settings input[data-fx]', (l) => l.length)],
    ['Курсы валютна 6 окт', [['1.4', 'USD', ''], ['1.17', 'EUR', ''], ['114', 'RUB', ''], ['480', 'AMD', '']], 0],
    '«Курсы валют»: the rate of the day as it came, a line a currency, and a box for a rate of one\'s own - the four boxes of typed rates are gone');
  await shot(pg, 'rv-rates');
  // a rate of one's own: saved, counted ahead, and taken back by emptying the box
  await pg.fill('#fxo-USD', '2');
  await pg.press('#fxo-USD', 'Tab');
  same([await puts('led', 1), store.led.doc.fxo, store.led.doc.fx.USD, await pg.$eval('#fx-card .fxl-row', (r) => [r.classList.contains('fxl-own'), r.querySelector('.fxl-m').textContent]), (await look(pg, 'today')).M.fx.USD],
    [1, { USD: 2 }, 1.25, [true, 'берётся свой курс'], 2], 'a rate of one\'s own is saved beside the typed rates, said on its line, and counted by at once');
  await pg.fill('#fxo-USD', '');
  await pg.press('#fxo-USD', 'Tab');
  same([await puts('led', 2), store.led.doc.fxo, (await look(pg, 'today')).M.fx.USD], [2, {}, 1.40], 'an emptied box is the day\'s rate again');
  // a statement row is counted at the rate of its own day when it is read, and says so
  const wise = ['TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Payer Name,Payee Name,Merchant,Card Holder Full Name',
    'CARD-1,03-10-2026,-660.00,USD,Card transaction of 660.00 USD issued by EXAMPLE SHOP,,,,EXAMPLE SHOP,', 'CARD-2,20-09-2026,-125.00,USD,Card transaction of 125.00 USD issued by OLD SHOP,,,,OLD SHOP,'].join('\n');
  await pg.click('#view-settings .set-nav [data-tabgo="upload"]');
  await pg.setInputFiles('#fileIn', { name: 'statement_USD.csv', mimeType: 'text/csv', buffer: Buffer.from(wise) });
  await puts('led', 3);
  const got = (store.led.doc.inbox || []).concat(store.led.doc.tx).filter((r) => r.o && /SHOP/.test(r.o.t || '')).map((r) => [r.d, Math.abs(r.a), r.o.r || null]).sort();
  same(got, [['2026-09-20', 100, null], ['2026-10-03', 500, 1.32]], 'a row of 3 October is turned into pounds at the rate of 3 October and carries it; a row of before the table began, at the typed rate');
  await pg.context().close();
});

await run('rv-rates-old', 'rows in another currency filed before the day\'s rates: asked once - count them over at the rate of their day, or leave them', async () => {
  // Three rows in dollars and roubles filed since 1 October at the typed rates (1.35 and 118), one of September, one in
  // pounds. The table of rates has come.
  const rows = () => [filed('o1', '2026-10-02', 2700, 'rev', 'Client U', { cur: 'USD', v: 0 }), filed('o2', '2026-10-05', -1350, 'cogs', 'Person V', { cur: 'USD' }),
    filed('o3', '2026-10-03', -11800, 'other', 'Landlord', { cur: 'RUB' }), filed('o4', '2026-09-20', -1350, 'cogs', 'Person V', { cur: 'USD' }), filed('o5', '2026-10-02', -300, 'other', 'Tool', {}),
    (() => { const r = filed('o6', '2026-10-04', -135, 'other', 'By hand', { cur: 'USD' }); r.a = 111; r.o.hand = 1; return r; })(),
    // … and a row whose pounds somebody typed before there was a mark for that: $1,350 that stand at £400
    (() => { const r = filed('o7', T, -1350, 'cogs', 'Person V', { cur: 'USD' }); r.a = 400; return r; })()];
  const open2 = async (name, more = {}) => { serve(ledger(rows()), planW()); store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: null }; if (more.reader) asReader(); const pg = await open(name, undefined, { hash: '#settings', ...(more.reader ? { who: 'Misha' } : {}) }); await pg.waitForSelector('#fx-card'); return pg; };
  const kept = () => Object.fromEntries(store.led.doc.tx.map((r) => [r.id, [r.a, (r.o || {}).r || null]]));
  let pg = await open2('old rows');
  same([await text(pg, '#fx-ask h2'), await pg.$$eval('#fx-ask tbody tr:not(.rc-tot)', (l) => l.map((r) => [...r.cells].map((c) => c.textContent.replace(/ /g, ' '))))],
    ['Строки в валюте — по курсу своего дня?спрашивается один раз',
      [['2 окт', 'Client U', '$2,700', '1.35', '£2,000.00', '1.3', '£2,076.92'], ['3 окт', 'Landlord', '−₽11,800', '118', '£100.00', '111', '£106.31'], ['5 окт', 'Person V', '−$1,350', '1.35', '£1,000.00', '1.36', '£992.65']]],
    'the three rows of October in another currency, each with what it stands at and what it would stand at - not the row of September, not the row in pounds, not the row whose pounds somebody typed by hand in «Таблица»');
  ok(/Ещё 1 строка в валюте не меняется: сумма в фунтах там далека от пересчёта по любому курсу/.test(await text(pg, '#fx-ask')),
    'a row whose pounds are far from its sum at any rate was typed by somebody before rows were marked for that: it is left out, and the card says so');
  same(await pg.$$eval('#fx-ask tr.rc-tot', (l) => l.map((r) => r.cells[r.cells.length - 1].textContent)), ['£2,076.92', '£1,098.96', '+£77.96'], 'and what it does to the month: 76.92 more came in, 1.04 less went out');
  await shot(pg, 'rv-rates-old');
  await pg.click('#fx-ask [data-fxdo="recount"]');
  same([await puts('led', 1), kept(), await pg.$('#fx-ask'), await toastText(pg)],
    [1, { o1: [2076.92, 1.3], o2: [992.65, 1.36], o3: [106.31, 111], o4: [1000, null], o5: [300, null], o6: [111, null], o7: [400, null] }, null, 'Пересчитано: 3 строки по курсу своего дня'],
    '«Пересчитать»: the three are counted over in one save and carry their rate; the rest is as it was; the question is gone');
  await pg.click('#toastUndo');
  same([await puts('led', 2), kept().o1, await pg.isVisible('#fx-ask')], [2, [2000, null], true], '«Отменить» puts them back, and the question with them');
  await pg.context().close();
  pg = await open2('old rows, kept');
  await pg.click('#fx-ask [data-fxdo="keep"]');
  same([await puts('led', 1), store.led.doc.fxk, kept().o1, await pg.$('#fx-ask')], [1, true, [2000, null], null], '«Оставить как есть»: nothing is counted over, the answer is kept with the table, and the question does not come back');
  await pg.context().close();
  const answered = JSON.parse(JSON.stringify(store.led.doc));
  serve(answered, planW());
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: null };
  pg = await open('old rows, asked before', undefined, { hash: '#settings' });
  await pg.waitForSelector('#fx-card');
  same(await pg.$('#fx-ask'), null, '… on another page either');
  await pg.context().close();
  // somebody who only looks is shown the rates and asked nothing
  pg = await open2('old rows, a reader', { reader: true });
  same([await pg.$('#fx-ask'), await pg.$$eval('#fx-card input[data-fxo]', (l) => [l.length, l.every((e) => e.disabled)]), await offered(pg)], [null, [4, true], []], 'a reader sees the day\'s rates, types none of their own, and is not asked the question');
  await pg.context().close();
});

await run('rv-rates-late', 'a row never keeps the rate of a wrong day: the table is asked again before a statement is read, and a row read ahead of its day is counted over once the day is in', async () => {
  // review, 9 October 2026: the page has the table as it was when the page opened. A statement of days that came into
  // the stand's table a second later was read at the rate of the last day the page had, and kept it for good.
  const wise = (rows) => ['TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Payer Name,Payee Name,Merchant,Card Holder Full Name', ...rows].join('\n');
  const shop = (d, t = 'EXAMPLE SHOP') => (store.led.doc.inbox || []).concat(store.led.doc.tx).filter((r) => r.o && (r.o.t || '').includes(t)).map((r) => [r.d, Math.abs(r.a), r.o.r, r.o.rd]);
  const before = { '2026-10-01': DAYS['2026-10-01'], '2026-10-03': DAYS['2026-10-03'] };
  serve(ledger([reach('Wise', '2026-10-02'), reach('Wise', '2026-10-02', 'USD')]), planW());
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(before)), asked: null };
  const pg = await open('rates, a table behind', undefined, { hash: '#upload' });
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: null };          // the stand's table has moved on
  await pg.setInputFiles('#fileIn', { name: 'statement_USD.csv', mimeType: 'text/csv', buffer: Buffer.from(wise(['CARD-1,05-10-2026,-680.00,USD,Card transaction of 680.00 USD issued by EXAMPLE SHOP,,,,EXAMPLE SHOP,'])) });
  await puts('led', 1);
  same(shop(), [['2026-10-05', 500, 1.36, '2026-10-05']], 'the page asked for the table again before it read the statement: the row of the 5th has the rate of the 5th, not of the 3rd');
  await pg.context().close();

  // A row of today, read before today's rate was out, stands at yesterday's - and says which day that was.
  // (So does a row still in «Разбор» - also one that carries the name on the card it was paid with.)
  const stamped = (r, o) => ({ ...r, a: 500, o: { ...r.o, ...o } });
  serve(ledger([reach('Wise', '2026-10-02'), reach('Wise', '2026-10-02', 'USD'), stamped(filed('f-today', T, -680, 'other', 'Shop', { cur: 'USD' }), { r: 1.36, rd: '2026-10-05' }),
    stamped(filed('f-moved', '2026-10-03', -660, 'other', 'Moved shop', { cur: 'USD' }), { r: 1.32, rd: '2026-10-03' })],
  [stamped(inbox('i-held', T, -680, 'other', 'Held shop', { cur: 'USD' }), { h: 'IVAN PETROV', r: 1.36, rd: '2026-10-05' })]), planW());
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: null };          // today's rate, 1.40, has come
  const next = await open('rates, the day has come', undefined, { hash: '#settings' });
  await next.waitForSelector('#fx-card');
  await sleep(900);
  same([store.led.puts, store.led.doc.tx.find((r) => r.id === 'f-today').a], [0, 500], 'opening the page saves nothing');
  await next.fill('#fxo-EUR', '1.2');                                                               // somebody changes something
  await next.press('#fxo-EUR', 'Tab');
  const row = (await puts('led', 1)) && store.led.doc.tx.find((r) => r.id === 'f-today');
  same([row.a, row.o.r, row.o.rd], [485.71, 1.4, T], '… and with the next change the row goes to the server at the rate of its own day: $680 at 1.40');
  const held = store.led.doc.inbox.find((r) => r.id === 'i-held');
  same([held.a, held.o.r, held.o.rd, held.o.h], [485.71, 1.4, T, 'IVAN PETROV'], 'the row waiting in «Разбор» with a name on its card is counted over like any other');

  // A row that stands at the rate of its day and is moved to another day in «Таблица» takes the rate of that day - at
  // once, where the person sees it. Pounds somebody types are theirs: no day's rate is put over them again.
  let saves = store.led.puts;
  const moved = () => { const r = store.led.doc.tx.find((q) => q.id === 'f-moved'); return [r.d, r.a, r.o.r || null, r.o.rd || null, r.o.hand || null]; };
  const edit = async (fields) => {
    await next.click('#view-ledger tbody tr[data-row="f-moved"]');
    for (const [sel, v] of Object.entries(fields)) await next.fill(sel, v);
    await next.click('#view-ledger [data-esave]');
    saves = await puts('led', saves + 1);
    return [moved(), await toastText(next)];
  };
  await next.click('#view-settings .set-nav [data-tabgo="ledger"]');
  same(await edit({ '#e-d': '2026-10-05' }), [['2026-10-05', 485.29, 1.36, '2026-10-05', null], 'Строка сохранена: фунты — по курсу нового дня'], 'moved from the 3rd to the 5th: $660 at 1.36, and the page says the pounds changed');
  same(await edit({ '#e-d': '2026-10-01' }), [['2026-10-01', 507.69, 1.3, '2026-10-01', null], 'Строка сохранена: фунты — по курсу нового дня'], 'moved back to the 1st: at 1.30');
  same(await edit({ '#e-a': '480' }), [['2026-10-01', 480, null, null, 1], 'Строка сохранена'], 'pounds typed by hand: the row carries no day\'s rate and says whose they are');
  same(await edit({ '#e-d': '2026-10-05' }), [['2026-10-05', 480, null, null, 1], 'Строка сохранена'], '… and stays at them wherever it is moved');
  await next.context().close();

  // The door did not answer when the page opened: the page counts by the typed rates. A typed rate is not the rate of
  // a row that stands at a day's; and before a statement is read the door is tried once more.
  serve(ledger([reach('Wise', '2026-10-02'), reach('Wise', '2026-10-02', 'USD')], [stamped(inbox('i-kept', '2026-10-03', -660, 'other', 'Kept shop', { cur: 'USD' }), { r: 1.32, rd: '2026-10-03' })]), planW());
  store.rates = null;
  const down = await open('rates, the door is down', undefined, { hash: '#settings', quiet: /503/ });
  await down.waitForSelector('#view-settings input[data-fx]');
  await down.fill('#fx-USD', '1.5');
  await down.press('#fx-USD', 'Tab');
  saves = await puts('led', 1);
  const kept = store.led.doc.inbox.find((r) => r.id === 'i-kept');
  same([store.led.doc.fx.USD, kept.a, kept.o.r, kept.o.rd], [1.5, 500, 1.32, '2026-10-03'], 'a rate typed while the door is down is saved, and a row that stands at the rate of its day is not counted over by it');
  store.rates = { base: 'GBP', days: JSON.parse(JSON.stringify(DAYS)), asked: null };          // the door answers again
  await down.click('#view-settings .set-nav [data-tabgo="upload"]');
  await down.setInputFiles('#fileIn', { name: 'statement_USD.csv', mimeType: 'text/csv', buffer: Buffer.from(wise(['CARD-1,05-10-2026,-680.00,USD,Card transaction of 680.00 USD issued by EXAMPLE SHOP,,,,EXAMPLE SHOP,'])) });
  await puts('led', saves + 1);
  same(shop(), [['2026-10-05', 500, 1.36, '2026-10-05']], 'the door is asked once more before the statement is read: the row of the 5th has the rate of the 5th and not the typed one');
  await down.context().close();
});

// =====================================================================================================================
// «КАССА» SIX MONTHS AHEAD (the owner's decision of 9 October 2026: «а почему только до декабря план?» - «продли кассу
// на 6 месяцев»). The months are drawn further; the verdict and «Можно вывести» still look sixty days ahead.
// =====================================================================================================================
await run('rv-months6', '«Касса» by months is drawn six months ahead, and nothing of the first sixty days moves for it', async () => {
  // The made-up studio, on 6 October: sixty days reach 5 December. `months: 0` is the engine as it was - the months of
  // those sixty days and no further.
  const led = demoLedger(T), P = demoPlan(T), ymT = T.slice(0, 7), T60 = addD(T, 60);
  const M6 = await C(led, P, T, { H: 60 }), M0 = await C(led, P, T, { H: 60, months: 0 });
  const ahead = (M) => M.months.list.filter((m) => m >= ymT);
  same([ahead(M0), ahead(M6), M6.months.to60], [['2026-10', '2026-11', '2026-12'], ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'], '2026-12'],
    'the switcher of «Касса» walks the running month and six after it; the sixty days end in December, as they did');
  // every row that repeats and has no end is written out in each of those months
  const forever = ['inflows', 'team', 'other', 'div'].flatMap((k) => (P[k] || []).filter((r) => r.rec && !r.rec.to && r.on !== false).map((r) => r.id));
  const lacks = forever.filter((id) => ['2027-01', '2027-02', '2027-03', '2027-04'].some((ym) => !M6.items.some((it) => it.row === id && it.src === 'occ' && it.ym === ym)));
  same([forever.length > 10, lacks, M6.months.by['2027-04'].inflows.rows.length > 3], [true, [], true], 'a row that repeats is written out in every month up to April, and April\'s page has its rows');
  // … and nothing of the first sixty days moves for it: every line dated within them, every tax period due within
  // them, every day and week of the walk, the money now, the lowest point, what may be taken out, every card - the
  // same to the penny as when the months ended in December.
  const diff = (a, b, path, out) => {
    if (out.length > 60) return out;
    if (a && b && typeof a === 'object' && typeof b === 'object') new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => diff(a[k], b[k], path + '.' + k, out));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push([path, JSON.stringify(a), JSON.stringify(b)].map((x) => String(x).slice(0, 50)));
    return out;
  };
  const byId = (l, far) => Object.fromEntries(l.filter((x) => !far(x)).map((x) => [x.id || x.key, x]));
  const near = (M) => ({ ...M, items: byId(M.items, (it) => (it.day || it.date || '') > T60), taxes: { ...M.taxes, periods: byId(M.taxes.periods, (p) => !(p.due <= T60)) },
    months: { ...M.months, more: 0, list: M.months.list.filter((m) => m <= M.months.to60), by: Object.fromEntries(Object.entries(M.months.by).filter(([m]) => m <= M.months.to60)) } });
  const kept = Object.keys(near(M6).items).length;
  same([diff(near(M0), near(M6), 'M', []), kept > 60, M6.items.length - M0.items.length > 20, M6.days.length === M0.days.length && M6.days.length > 50], [[], true, true, true],
    'drawn six months ahead, the made-up studio is to the penny what it was in everything of its first sixty days', kept);

  // On the page: the switcher goes to April and no further, and a month beyond the sixty days says so.
  const pg = await scene('six months', led, P, { H: 60 });
  await goCash(pg);
  const at = async () => [await text(pg, '#cs-mname'), await text(pg, '#cs-month .cs-note'), await pg.$eval('#cs-month [data-cs-mon="1"]', (e) => e.disabled), (await pg.$$('#cs-plan [data-ed-open]')).length > 5];
  const seen = [await at()];
  for (let i = 0; i < 6; i++) { await pg.click('#cs-month [data-cs-mon="1"]'); seen.push(await at()); }
  const farNote = 'впереди · дальше 60 дней: в «хватит ли денег» и «Можно вывести» не входит';
  same(seen.map((x) => [x[0], x[1].replace(/сегодня.*/, 'сегодня'), x[2]]), [['Октябрь 2026', 'идёт · сегодня', false], ['Ноябрь 2026', 'впереди', false], ['Декабрь 2026', 'впереди', false],
    ['Январь 2027', farNote, false], ['Февраль 2027', farNote, false], ['Март 2027', farNote, false], ['Апрель 2027', farNote, true]],
    'October to April, one press a month; from January on the page says the month is beyond the sixty days the verdict looks at; April is the last');
  ok(seen.every((x) => x[3]), 'every one of the seven months has its rows drawn', seen.map((x) => x[3]));
  await shot(pg, 'rv-months6');
  await pg.context().close();
});

// =====================================================================================================================
// THE STATEMENT'S OWN BALANCE (the owner's decision of 9 October 2026: «бери остатки из выписок»). A statement that
// prints what the account stood at after every row says by its last row what the account holds.
// =====================================================================================================================
await run('rv-stmt-bal', 'an account stands on the balance its statement prints after its last row, when that is fresher than the typed one', async () => {
  // Mika, 9 October 2026: «почему на проде ошибочная цифра на wise gbp». A balance typed at midday; the statement
  // loaded the day after brought three payments of that day - one out, two in. The page took the one out to have
  // left after the balance and the two in to be inside it, and the account stood below zero. (Made-up figures.)
  const typedAt = ms('2026-10-05T12:46:00Z'), up = AT2, late = AT3, at9 = ms('2026-10-06T09:00:00Z'), at11 = ms('2026-10-06T11:00:00Z'), at12 = ms('2026-10-06T12:00:00Z');
  const plan = (b, more = {}) => plan3({ banks: [b || bal('Wise', 'GBP', 1240, '2026-10-05', { at: typedAt })], ...more });
  // what a statement says the account stood at after a row: the balance, when the statement was made, when it was read
  const end = (r, v, made = up, read = made) => ({ ...r, o: { ...r.o, bal: v, balAt: made, balIn: read } });
  const day5 = [filed('s1', '2026-10-05', 900, 'skip', '', { at: up }), filed('s2', '2026-10-05', 350, 'skip', '', { at: up }), filed('s3', '2026-10-05', -1500, 'other', 'Office rent', { at: up })];
  const s4 = filed('s4', T, -12, 'fixed', 'Notes app', { at: up });
  const wise = (M, key = 'Wise|GBP') => { const a = acct(M, key); return [a.est, a.same, a.anchor && [a.anchor.amt, a.anchor.asOf, !!a.anchor.file], a.typed && a.typed.amt]; };
  same(wise(await C(ledger([...day5, s4]), plan())), [-272, -1500, [1240, '2026-10-05', false], 1240],
    'a statement that prints no balance: as before - of the three payments of the day the balance was typed for, the one out is taken to have left after it, and the account stands below zero');
  same(wise(await C(ledger([...day5, end(s4, 978)]), plan())), [978, 0, [978, T, true], 1240],
    'the statement says the account stood at 978 after its last row, of the 6th: that is fresher than what was typed for the 5th, and nothing is guessed');
  same(wise(await C(ledger([...day5, end(s4, 978)]), plan(bal('Wise', 'GBP', 1000, T, { at: late })))), [1000, 0, [1000, T, false], 1000],
    'a balance typed for the same day after the statement was made is the fresher one, and the account stands on it');
  same(wise(await C(ledger([...day5, end(s4, 978)]), plan(bal('Wise', 'GBP', 1000, T, { at: ms('2026-10-06T08:00:00Z') })))), [978, 0, [978, T, true], 1000],
    '… typed for that day before the statement was made, it is the older one');
  same(wise(await C(ledger([...day5, end(s4, 978), filed('s5', T, 100, 'skip', '', { at: late }), filed('s6', T, -40, 'fixed', 'Tool', { at: late })]), plan()))[0], 1038,
    'payments of the statement\'s last day that the page reads afterwards are after its balance, whichever way the money went: +100 and −40');
  same(wise(await C(ledger([end(filed('s0', '2026-10-03', -10, 'fixed', 'Tool', { at: late }), 5000, late), ...day5, end(s4, 978)]), plan()))[0], 978,
    'an older statement loaded afterwards does not take the account back to its day');
  const rev = (more) => ledger([...day5, end(s4, 978), more]);
  const M0 = await C(rev(filed('r1', T, -20, 'fixed', 'Tool', { b: 'Revolut', at: up })), plan()), M1 = await C(rev(end(filed('r1', T, -20, 'fixed', 'Tool', { b: 'Revolut', at: up }), 480)), plan());
  same([M0.missing, M0.now, M1.missing, M1.now, acct(M1, 'Revolut|GBP').est], [['Revolut|GBP'], null, [], 1458, 480],
    'an account the plan does not hold, known only by its statement: with the statement\'s balance it has one, and «Денег сейчас» is no longer withheld for it');
  // independent reading, 9 October 2026: the moment a file was read was taken for the moment the statement was made.
  // A statement made at 9, read at 13, is older than a balance typed at 12 and than a payment marked by hand at 11.
  const read13 = { ...s4, at: late };
  same(wise(await C(ledger([...day5, end(read13, 978, at9, late)]), plan(bal('Wise', 'GBP', 1000, T, { at: at12 }))))[2], [1000, T, false],
    'a statement made in the morning and read in the afternoon does not outvote a balance typed at noon');
  const marked40 = { other: [row('m1', 'Courier', 40, T, { paid: { on: T, at: at11, by: BY } })] };
  // (the rows were on the page since 10; the file that says what the account stood at was made at 9 and read at 13)
  same([wise(await C(ledger([...day5, end(s4, 978, at9, late)]), plan(null, marked40)))[0], wise(await C(ledger([...day5, end(s4, 978, at12, late)]), plan(null, marked40)))[0]], [938, 978],
    'a payment marked by hand at 11 is not in a statement made at 9, and is counted on top of its balance; it is inside one made at 12');
  // … and two accounts of one bank and currency: a row without a number may be either's, and its balance is nobody's
  const two = plan3({ banks: [bal('Wise', 'GBP', 1000, '2026-10-01'), bal('Wise', 'GBP', 5000, '2026-10-01', { id: 'b-jar', name: 'Wise — копилка' })] });
  const M2 = await C(ledger([...day5, end(s4, 978)]), two);
  same([acct(M2, 'Wise|GBP').anchor.file || false, acct(M2, 'Wise|GBP').est, M2.now, acct(M2, 'Wise|GBP').unsure], [false, 738, 5738, true],
    'a second account in the same bank and currency: the statement does not say whose it is, and the accounts stand on what was typed, as before - and the model says a balance was there and not taken');
  // (second reading: a leftover second row that nobody typed a balance for is no rival, and switches nothing off)
  const left = plan3({ banks: [bal('Wise', 'GBP', 1240, '2026-10-05', { at: typedAt }), { ...bal('Wise', 'GBP', 5000, '2026-10-01', { id: 'b-old', name: 'Wise — старая Касса' }), legacy: true }] });
  const M3 = await C(ledger([...day5, end(s4, 978)]), left);
  same([!!acct(M3, 'Wise|GBP').anchor.file, acct(M3, 'Wise|GBP').est, acct(M3, 'Wise|GBP').unsure], [true, 978, false], 'a second row of that bank and currency without a typed balance takes nothing away: the statement\'s balance stands');

  // The reader. The column is believed only when it adds up with the rows, in one direction - which is also how the
  // page knows which way the file runs.
  const HEAD = 'TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance,Payer Name,Payee Name,Merchant,Card Holder Full Name';
  const LINES = ['CARD-4,06-10-2026,-12.00,GBP,Card transaction of 12.00 GBP issued by NOTES APP,,978.00,,,NOTES APP,', 'TRANSFER-3,05-10-2026,-1500.00,GBP,Sent money to Office Landlord,,990.00,,Office Landlord,,',
    'BALANCE-2,05-10-2026,350.00,GBP,Converted 415.00 EUR to 350.00 GBP,,2490.00,,,,', 'TRANSFER-1,05-10-2026,900.00,GBP,Received money from STUDIO LTD,,2140.00,STUDIO LTD,,,'];
  const FULL = ['CARD-5,06-10-2026,-50.00,GBP,Card transaction of 50.00 GBP issued by OTHER SHOP,,928.00,,,OTHER SHOP,', ...LINES];
  const csv = (lines, head = HEAD) => [head, ...lines].join('\n');
  serve({ ...ledger([reach('Wise', '2026-10-02')]), rules: [{ k: 'other shop', c: 'fixed', l: 'Other shop' }] }, plan());
  const pg = await open('statement balance', undefined, { hash: '#upload' });
  const read = (text, name = 'statement_GBP.csv') => pg.evaluate(([text, name]) => { const p = window.__tx.parseGrid(window.__tx.parseCSV(text), name); return p.rows.map((r) => [r.tid, r.a, r.eb == null ? null : r.eb, 'rb' in r]); }, [text, name]);
  const ends = async (text, name) => (await read(text, name)).filter((r) => r[2] != null).map((r) => [r[0], r[2]]);
  same([await read(csv(LINES)), await ends(csv(LINES.slice().reverse()))],
    [[['CARD-4', -12, 978, false], ['TRANSFER-3', -1500, null, false], ['BALANCE-2', 350, null, false], ['TRANSFER-1', 900, null, false]], [['CARD-4', 978]]],
    'Wise prints the newest row first; another bank the oldest: either way the row the file ends at carries what the account stood at after it');
  same(await ends(csv(LINES.map((l) => l.replace(',2490.00,', ',2500.00,')))), [], 'a column that does not add up with the rows is not a balance the page believes: nothing is marked');
  same(await ends(csv(LINES.map((l) => l.replace(/,(978|990|2490|2140)\.00,/, ',')), HEAD.replace('Running Balance,', ''))), [], 'a statement without the column marks nothing');
  same(await read(csv(['FEE-TRANSFER-9,06-10-2026,-0.40,GBP,Wise Charges for: TRANSFER-9,,99.60,,,,', 'TRANSFER-9,06-10-2026,-100.00,GBP,Sent money to Person X,,100.00,,Person X,,'])), [['TRANSFER-9', -100.4, 99.6, false]],
    'a fee Wise prints as a row of its own is folded into its payment, and the balance after it goes with the payment');
  same(await ends(csv(['CARD-8,06-10-2026,-50.00,GBP,Card transaction A,,950.00,,,SHOP,', 'CARD-7,06-10-2026,50.00,GBP,Refund A,,1000.00,,,SHOP,'])), [], 'two rows of one day that add up both ways do not say which came last: nothing is marked');
  // independent reading, 9 October 2026: where adding up proves nothing, or the account is not known, nothing is marked
  same([await ends(csv([LINES[0]])),
    await ends(csv(['CARD-2,06-10-2026,-10.00,PLN,Shop,,90.00,,,SHOP,', 'CARD-1,05-10-2026,-100.00,PLN,Shop,,100.00,,,SHOP,'])),
    await ends(['ID,Date,Amount,Currency,Description,Balance', '2,06-10-2026,-12.00,GBP,Shop,978.00', '1,05-10-2026,-10.00,GBP,Shop,990.00'].join('\n'), 'export.csv'),
    await ends(['Номер,Дата,Сумма,Валюта,Описание,Остаток', '2,06.10.2026,-12.00,RUB,Магазин,978.00', '1,05.10.2026,-10.00,RUB,Магазин,990.00'].join('\n'), 'export.csv'),
    await ends(csv(['CARD-6,,-5.00,GBP,Card transaction not yet dated,,973.00,,,SHOP,', ...LINES])),
    await ends(csv(['FEE-TRANSFER-8,07-10-2026,-0.60,GBP,Wise Charges for: TRANSFER-8,,859.40,,,,', 'CARD-9,07-10-2026,-20.00,GBP,Card transaction B,,860.00,,,SHOP,', 'TRANSFER-8,06-10-2026,-100.00,GBP,Sent money to Person Y,,880.00,,Person Y,,']))],
  [[], [], [], [], [], []],
  'nothing is marked by a lone row, by rows in a currency the page does not keep, in a file whose bank was only guessed - from nothing, or from the alphabet of its headers -, in a file with a row the page could not date, or when a fee folded into its payment would take the balance back a day');

  // A PDF prints the balance it opens with and the one it closes with. When its rows add up from the one to the other,
  // the closing one is what the account stood at after the last day in it.
  const cell = (x0, x1, s) => ({ x0, x1, s });
  const HEADPDF = [cell(40, 80, 'Date'), cell(100, 200, 'Description'), cell(320, 380, 'Money out'), cell(400, 460, 'Money in'), cell(480, 540, 'Balance')];
  const lines = (rows) => rows.map((cells, i) => ({ p: 1, y: 700 - 24 * i, h: 10, cells }));
  const pdf = (closing) => lines([HEADPDF, [cell(40, 140, 'Start balance'), cell(490, 540, '1,240.00')],
    [cell(40, 95, '5 Oct 2026'), cell(100, 250, 'Received from STUDIO LTD'), cell(410, 460, '900.00'), cell(490, 540, '2,140.00')],
    [cell(40, 95, '5 Oct 2026'), cell(100, 250, 'Office rent'), cell(325, 380, '1,500.00'), cell(490, 540, '640.00')],
    [cell(40, 95, '6 Oct 2026'), cell(100, 250, 'Notes app'), cell(340, 380, '12.00'), cell(490, 540, '628.00')],
    [cell(40, 140, 'End balance'), cell(490, 540, closing)]]);
  const flat = lines([HEADPDF, [cell(40, 140, 'Start balance'), cell(490, 540, '100.00')],
    [cell(40, 95, '5 Oct 2026'), cell(100, 250, 'Shop'), cell(340, 380, '50.00'), cell(490, 540, '150.00')],
    [cell(40, 95, '6 Oct 2026'), cell(100, 250, 'Refund'), cell(420, 460, '50.00'), cell(490, 540, '100.00')],
    [cell(40, 140, 'End balance'), cell(490, 540, '100.00')]]);
  const readPdf = (lines) => pg.evaluate((lines) => { const p = window.__tx.parsePdfLines(lines, 'barclays.pdf'); return [p.check, (p.rows || []).map((r) => [r.d, r.a, r.eb == null ? null : r.eb])]; }, lines);
  same([await readPdf(pdf('628.00')), (await readPdf(pdf('700.00')))[1].filter((r) => r[2] != null), await readPdf(flat)],
    [['ok', [['2026-10-05', 900, null], ['2026-10-05', -1500, null], ['2026-10-06', -12, 628]]], [], ['ok', [['2026-10-05', -50, null], ['2026-10-06', 50, null]]]],
    'a PDF whose rows add up to its closing balance marks its last day with it; one that does not add up marks nothing - nor one whose rows come to nothing, for the PDF\'s balances are read without their sign');

  // On the page: the file is read, the row it ends at is marked, and the account stands on the statement.
  const drop = (lines) => pg.setInputFiles('#fileIn', { name: 'statement_GBP.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(lines)) });
  const toUpload = async () => { await pg.click('.nav [data-tab="settings"]'); await pg.click('#view-settings .set-nav [data-tabgo="upload"]'); };
  const est = () => pg.evaluate(() => (window.__money.model({ H: 30 }).accounts.find((a) => a.key === 'Wise|GBP') || {}).est);
  const marked = () => (store.led.doc.inbox || []).concat(store.led.doc.tx).filter((r) => r.o && r.o.bal != null).map((r) => [r.key.split('|').pop(), r.o.bal, r.o.balAt > 0 && r.o.balIn >= r.o.balAt, (store.led.doc.tx || []).some((q) => q.id === r.id)]);
  let saves = 0;
  await drop(FULL);
  saves = await puts('led', saves + 1);
  same([marked(), await est()], [[['CARD-5', 928, true, false]], 928], 'the statement is read: the row it ends at says 928, and the account stands on it while the rows still wait in «Разбор»');
  await toUpload();
  ok(/остаток по выписке: £928\.00 на 6 окт/.test(await text(pg, '#view-upload')), 'the list of files says what balance it read, and for which day', (await text(pg, '#view-upload .file')).slice(0, 200));
  await pg.click('.nav [data-tab="today"]');
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  const said = async () => [await text(pg, '[data-live="acct.Wise|GBP"]'), plain(await pg.$eval('[data-live="acct.Wise|GBP"]', (e) => e.closest('.td-ar').querySelector('.td-meta').textContent))];
  same(await said(), ['£928', 'по выписке на 6 окт · остаток после последнего платежа взят из самой выписки'], '«Счета» says where the figure is from');
  await shot(pg, 'rv-stmt-bal');
  // a row filed out of «Разбор» keeps what it says of the account
  await pg.click('.nav [data-tab="inbox"]');
  await pg.click('#view-inbox [data-acceptauto]');
  saves = await puts('led', saves + 1);
  same(marked(), [['CARD-5', 928, true, true]], 'filed into the table, the row still carries the statement\'s balance');
  // independent reading, 9 October 2026: an older export read after a newer one. It ends at an earlier row of the same
  // day, which is here already - and the table holds a later row of that account that the file lacks.
  await pg.clock.fastForward(60000);
  await toUpload();
  await drop(LINES);
  await sleep(700);
  saves = store.led.puts;
  same([marked(), await est(), /остаток из выписки не взят: в таблице есть строки этого счёта за её последний день, которых в ней нет/.test(await text(pg, '#view-upload .file'))], [[['CARD-5', 928, true, true]], 928, true],
    'an older export read after a newer one is not the last word on the account: its balance is not taken, and the list of files says so');
  // … and the same file again after «Очистить разбор»: the rows it brings back are inside its balance, not on top
  await pg.click('.nav [data-tab="inbox"]');
  await pg.click('#view-inbox [data-clearinbox]');
  saves = await puts('led', saves + 1);
  await pg.clock.fastForward(60000);
  await toUpload();
  await drop(FULL);
  saves = await puts('led', saves + 1);
  same([marked(), await est(), (store.led.doc.inbox || []).length > 2], [[['CARD-5', 928, true, true]], 928, true], 'the same file read again brings its rows back inside its own balance');
  // the sheet of balances says which of the two the account stands on
  await pg.click('.nav [data-tab="today"]');
  await pg.click('#view-today .td-kpi');
  const box = K('bal') + '[data-ed-acct="Wise|GBP"] ';
  same(await text(pg, box + '.ed-an .note'), 'по расчёту £928 · по выписке на 6 окт — она свежее остатка, вписанного 5 окт', 'the sheet of balances says which of the two the account stands on');
  await pg.fill(box + '[data-ed-bamt]', '1000');
  await pg.click(K('bal') + '[data-ed-save]');
  await saved(pg);
  same(await said(), ['£1,000', 'вписан 6 окт, Mika'], 'a balance typed now is fresher than the statement, and the account stands on it');
  // independent reading, 9 October 2026: a row moved to another day in «Таблица» does not take the balance with it
  const id = store.led.doc.tx.find((r) => r.key.endsWith('CARD-5')).id;
  saves = store.led.puts;
  await pg.click('.nav [data-tab="settings"]');
  await pg.click('#view-settings .set-nav [data-tabgo="ledger"]');
  await pg.click(`#view-ledger tbody tr[data-row="${id}"]`);
  await pg.fill('#e-d', '2026-10-01');
  await pg.click('#view-ledger [data-esave]');
  await puts('led', saves + 1);
  same(marked(), [], 'the balance was of the row where it stood: moved to another day, the row does not carry it');
  // (second reading: … and the same file read again does not put it back on the row where it stands now)
  await toUpload();
  await drop(FULL);
  await sleep(700);
  same(marked(), [], 'the file read again finds its last row on another day than its own, and marks nothing');
  // … and a statement is as old as its file, not as the moment the page read it
  const made = ms('2026-10-06T07:30:00Z');
  // (second reading: a row of a later day that the file lacks does not stand in its way - it is after the balance by its date)
  const fed = await pg.evaluate(([text, made]) => { const feed = (t, m) => window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(t), 'revolut.csv'), 'revolut.csv', m);
    feed('ID,Date,Amount,Currency,Description\n9,20-10-2026,-5.00,GBP,Tool of a later day', 0); feed(text, made); const a = window.__money.model({ H: 30 }).accounts.find((a) => a.key === 'Revolut|GBP'); return a && a.anchor ? [a.anchor.amt, a.anchor.at, a.anchor.read > a.anchor.at] : null; },
    [['ID,Date,Amount,Currency,Description,Balance', '2,06-10-2026,-12.00,GBP,Shop,478.00', '1,05-10-2026,-10.00,GBP,Shop,490.00'].join('\n'), made]);
  same(fed, [478, made, true], 'a file made at 7:30 and read at noon says what the account stood at at 7:30');
  await pg.context().close();
});

// =====================================================================================================================
// «ЧТО ЕСЛИ» (the owner's decision of 11 October 2026: «давай делать Что если», and of the two places to ask it -
// «оба, делай»). A trial on a copy of the plan: the same engine, nothing saved, nothing else on the page moved.
// =====================================================================================================================
await run('rv-whatif', '«Что если» answers with the engine\'s own figures for a copy of the plan, moves nothing else on the page, and saves nothing - for a reader too', async () => {
  // The made-up studio with less on its accounts, so that a trial has consequences.
  const led = demoLedger(T), P = demoPlan(T);
  P.banks.find((b) => b.bank === 'Wise' && b.cur === 'GBP').amt = 5000;
  P.banks.find((b) => b.bank === 'Barclays').amt = 13000;
  const pg = await scene('what if', led, P, { H: 60 });
  const base = await holds(pg, 'the plan, before any trial');
  const plan0 = canon(base.P), M0 = base.M, mer = 'c-meridian-labs';
  const ask = (list) => pg.evaluate((list) => window.__money.whatIf(list), list);
  const peek = () => pg.evaluate(() => { const t = window.__money.trial; return { changes: t.changes, plan: t.plan, n: t.changes.length }; });
  const quiet = async (msg) => same([store.cash.puts, store.led.puts, canon(await pg.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state()))))], [0, 0, plan0], msg);

  // The engine's side. No change: the second run is the first, to the penny.
  const none = await ask([]);
  same([canon(none.plan) === canon(none.trial), none.plan.low, none.plan.lowDay, none.plan.free], [true, M0.LOW, M0.LOWDAY, Math.floor(M0.free.now / 100) * 100], 'with nothing changed the copy is the plan: every figure of the trial is the plan\'s own');
  // Each kind, held against a copy made by hand here and computed by the harness (which also holds §5 on it).
  const ahead = M0.items.filter((it) => it.row === mer && it.open && it.day && it.state !== 'late').sort((a, b) => (a.day < b.day ? -1 : 1));
  ok(ahead.length >= 3, 'Meridian Labs has payments ahead to try with', ahead.map((it) => it.id + ' ' + it.day));
  const byHand = async (edit) => { const P2 = JSON.parse(JSON.stringify(P)); edit(P2); const M = await C(led, P2, T, { H: 60 }, 'a trial copy made by hand'); return [M.LOW, M.LOWDAY, M.IN, M.OUT, M.minusDay || '']; };
  const of = (r) => [r.trial.low, r.trial.lowDay, r.trial.IN, r.trial.OUT, r.trial.minusDay];
  const row = (P2, k, id) => P2[k].find((r) => r.id === id);
  same(of(await ask([{ k: 'late', row: mer, item: '', days: 30 }])), await byHand((P2) => { const r = row(P2, 'inflows', mer); r.rec.x = r.rec.x || {}; ahead.forEach((it) => { r.rec.x[it.occ.ym] = { ...(r.rec.x[it.occ.ym] || {}), date: addD(it.day, 30) }; }); }),
    '«платёж придёт позже»: every payment of the row that is still ahead, thirty days on - the figures of a plan written so');
  same(of(await ask([{ k: 'stop', row: 'c-halden-co', from: '2026-11' }])), await byHand((P2) => { row(P2, 'inflows', 'c-halden-co').rec.to = '2026-10'; }), '«клиент уйдёт»: the row repeats for the last time in the month before');
  const draw = await ask([{ k: 'draw', row: 'd-draw', amt: 12000, from: '2026-11' }]);
  same([draw.trial.OUT - draw.plan.OUT, draw.trial.IN - draw.plan.IN], [3000, 0], '«выводим другую сумму»: £12,000 instead of £9,000 from November - one withdrawal of the sixty days is £3,000 larger');
  const hire = await ask([{ k: 'cost', amt: 3000, cur: 'GBP', day: 25, from: '2026-11', name: '' }]);
  same([hire.trial.OUT - hire.plan.OUT, hire.trial.IN - hire.plan.IN, hire.trial.low <= hire.plan.low], [3000, 0, true], '«наймём человека»: £3,000 on 25 November is inside the sixty days, 25 December is not');
  await quiet('asking the engine saved nothing and left the plan as it was');

  // From the row. Its card has «Что если…»; pressed, the card is turned over: the trial, and nothing that writes.
  const oct = ahead[0].id;
  await openRow(pg, oct);
  ok((await texts(pg, K('row') + '.ed-foot button')).includes('Что если…'), 'the card of a row offers «Что если…» beside «Закрыть»', await texts(pg, K('row') + '.ed-foot button'));
  await pg.click(K('row') + '[data-wi-open]');
  await pg.waitForSelector(K('row') + '[data-wi-panel]');
  const sel = (f) => pg.$eval(K('row') + `[data-wi-f="${f}"]`, (e) => (e.tagName === 'SELECT' ? e.selectedOptions[0].textContent.replace(/ /g, ' ') : e.value));
  // (third reading: a card is its row's - there is no list of clients in it to choose another from)
  same([await pg.$$eval(K('row') + '[data-ed-save], ' + K('row') + '[data-ed-f], ' + K('row') + '[data-ed-do]', (l) => l.length), await pg.$(K('row') + '[data-wi-f="row"]'), /Что если Meridian Labs заплатит на 30 дней позже/.test(await text(pg, K('row') + '[data-wi-worked]')), /^только /.test(await sel('item')), await sel('days'), await texts(pg, K('row') + '.wi-kinds .chip.active')],
    [0, null, true, true, '30', ['платёж придёт позже']], 'turned over, the card holds no field or button of the row, and no list of other clients; the client and the payment of the row stand ready, thirty days');
  // (second reading: a chip in a row's card could ask about another row - the withdrawal, from a client's card)
  same(await texts(pg, K('row') + '.wi-kinds .chip'), ['платёж придёт позже', 'клиент уйдёт', 'наймём человека'], 'in a client\'s card the questions are about that client, and a hire: «выводим другую сумму» is not offered there');
  await pg.selectOption(K('row') + '[data-wi-f="item"]', '');
  await pg.click(K('row') + '[data-wi-go]');
  await pg.waitForSelector(K('row') + '[data-wi-k="say"]');
  const want1 = await ask([{ k: 'late', row: mer, item: '', days: 30 }]);
  const shown = async (root) => pg.$$eval(root + '[data-wi-k]', (l) => Object.fromEntries(l.map((e) => [e.dataset.wiK, e.textContent.replace(/ /g, ' ')])));
  const money = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
  let seen = await shown(K('row'));
  ok(seen.low.startsWith(money(want1.trial.low) + ' · ') && seen.in === money(want1.trial.IN) && /^В этом случае /.test(seen.say), 'the answer under the row is the engine\'s: the lowest point and what comes in sixty days, «в этом случае»', seen);
  same(await texts(pg, K('row') + '.wi-ch b'), ['Meridian Labs заплатит на 30 дней позже'], 'the change stands as a sentence');
  const mid = await holds(pg, 'with a trial on, every figure of «Сегодня» is still the plan\'s');
  same([mid.M.LOW, mid.M.IN], [M0.LOW, M0.IN], '… the same to the penny as before the trial');
  await calm(pg, 'the turned card');
  await shot(pg, 'rv-whatif-row');
  // a second change, and the answer is for both
  await pg.click(K('row') + '[data-wi-more]');
  same(await texts(pg, K('row') + '.wi-kinds .chip.active'), ['наймём человека'], '«+ и ещё…» offers what has not been asked yet');
  await pg.fill(K('row') + '[data-wi-f="amt"]', '3000');
  await pg.press(K('row') + '[data-wi-f="amt"]', 'Enter');
  await pg.waitForFunction(() => window.__money.trial.changes.length === 2);
  const two = await peek(), want2 = await ask(two.changes);
  seen = await shown(K('row'));
  ok(seen.low.startsWith(money(want2.trial.low) + ' · ') && seen.out === money(want2.trial.OUT), 'Enter in a field counts, and saves no row: the answer is for the two changes together', seen);
  same((await texts(pg, K('row') + '.wi-ch b'))[1].slice(0, 22), 'и мы наймём человека з', 'the second change reads on from the first: «и …»');
  // the copy the page made is a plan the engine takes with every rule it holds a plan to
  const MT = await C(led, two.plan, T, { H: 60 }, 'the page\'s own trial copy');
  same([MT.LOW, MT.IN, MT.OUT], [want2.trial.low, want2.trial.IN, want2.trial.OUT], 'the copy the page made, computed by the harness: the figures the page printed');
  await quiet('two changes asked from a row: nothing saved, the plan as it was');

  // The same trial at the foot of «Сегодня»: one folded line, and inside it the same list and the same answer.
  await pg.click(K('row') + '[data-ed-x]');
  await pg.waitForFunction(() => !document.querySelector('[data-ed-card="row"]'));
  same(plain(await pg.$eval('#view-today .td-wi > summary', (e) => e.textContent)), 'Что еслиидёт проба: 2 изменения · в план ничего не записано', 'the card shut, the trial goes on, and the folded line says so');
  await pg.click('#view-today .td-wi > summary');
  await pg.waitForSelector('#view-today .td-wi[open] [data-wi-more]');
  const F = '#view-today .td-wi ';
  same([(await texts(pg, F + '.wi-ch b')).length, (await shown(F)).low], [2, seen.low], 'unfolded: the two changes and the answer that stood in the card');
  await pg.click(F + '[data-wi-more]');
  await pg.click(F + '[data-wi-kind="stop"]');
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await pg.click(F + '[data-wi-go]');
  await pg.waitForFunction(() => window.__money.trial.changes.length === 3);
  ok(/Клиент уходит, а расходы на его команду остались в расчёте/.test(await text(pg, F + '.wi-notes')), 'a client who leaves: the page says his team\'s costs are still counted', await text(pg, F + '.wi-notes'));
  await holds(pg, 'three changes on, the fold open: «Сегодня» is the plan');
  await calm(pg, 'the unfolded trial');
  await shot(pg, 'rv-whatif-fold');
  // another tab and back: it is still on
  await goCash(pg);
  await pg.click('.nav [data-tab="today"]');
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same((await peek()).n, 3, 'the trial outlives a walk to «Касса» and back');
  // «Закончить пробу»
  await pg.click(F + '[data-wi-end]');
  same([await toastText(pg), (await peek()).n, plain(await pg.$eval('#view-today .td-wi > summary .td-meta', (e) => e.textContent))], ['Проба закончена. В плане ничего не изменилось.', 0, 'платёж придёт позже · клиент уйдёт · наймём человека · выводим другую сумму'], '«Закончить пробу»: it is over, and the page says the plan was never touched');
  await sleep(700);
  await quiet('a whole trial, from a row and from the fold: no save was sent, the plan is what it was');
  await pg.context().close();

  // Somebody who only looks asks too: the trial changes no document, so nothing of it is shut for a reader.
  serve(led, P);
  asReader();
  const rd = await open('what if, a reader', undefined, { who: 'Misha' });
  await rd.waitForSelector('#view-today [data-live="verdict"]');
  await openRow(rd, oct);
  same(await texts(rd, K('row') + 'button'), ['Что если…', 'Закрыть'], 'a reader\'s card of a client\'s payment has «Что если…», which changes nothing, and «Закрыть»');
  await rd.click(K('row') + '[data-ed-x]');
  await rd.click('#view-today .td-wi > summary');
  await rd.waitForSelector('#view-today .td-wi[open] [data-wi-go]');
  same(await rd.$$eval('#view-today .td-wi [data-wi-f], #view-today .td-wi button', (l) => l.filter((e) => e.disabled || getComputedStyle(e).display === 'none').length), 0, 'on a reader\'s page nothing of the trial is shut or hidden');
  await rd.click('#view-today .td-wi [data-wi-go]');
  await rd.waitForSelector('#view-today .td-wi [data-wi-k="say"]');
  await sleep(900);
  same([await rd.evaluate(() => window.__money.trial.changes.length), await offered(rd), store.cash.puts, store.led.puts], [1, [], 0, 0], 'a reader asked and was answered: still nothing offered that changes a document, and no save sent');
  await rd.context().close();
});

// What an independent reading of the first «Что если» found (11 October 2026), each as a case that failed on it.
await run('rv-whatif-rules', '«Что если»: a split row is one payment through time, a part that has come is counted once, the trial names no sum and no «хватает» the page would not, a cost in a currency without an account is not made, and a press in the trial draws only the trial', async () => {
  const ask = (pg, list) => pg.evaluate((list) => window.__money.whatIf(list), list);
  const changes = (pg) => pg.evaluate(() => window.__money.trial.changes);
  const F = '#view-today .td-wi ';
  const unfold = async (pg) => { await pg.click('#view-today .td-wi > summary'); await pg.waitForSelector(F + '[data-wi-panel]'); };
  const kind = (pg, k) => pg.click(F + `[data-wi-kind="${k}"]`);
  const opts = async (pg, f) => (await pg.$$eval(F + `[data-wi-f="${f}"] option`, (l) => l.map((e) => e.textContent))).map(plain);
  const val = (pg, f) => pg.$eval(F + `[data-wi-f="${f}"]`, (e) => e.value);
  const worked = (pg) => text(pg, F + '[data-wi-worked]');
  const say = (pg) => text(pg, F + '[data-wi-k="say"]');
  const money = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const of = (r) => [r.trial.low, r.trial.lowDay, r.trial.IN, r.trial.OUT];
  const row = (P2, k, id) => P2[k].find((r) => r.id === id);
  // «{месяц} и дальше», as the page writes it: the row ends the month before, a copy with a new id goes on from `ym`.
  const split = (P2, k, id, ym, amt, nid) => { const l = P2[k], i = l.findIndex((r) => r.id === id), r = l[i], n = JSON.parse(JSON.stringify(r)); n.id = nid; n.amt = amt; n.rec = { day: r.rec.day, from: ym, chain: id }; r.rec = { ...r.rec, to: addD(ym + '-01', -1).slice(0, 7) }; l.splice(i + 1, 0, n); };

  // ---- 1. A client raised «с декабря», the withdrawal changed «с ноября», and a payment paid in part.
  const led = demoLedger(T), P = demoPlan(T);
  split(P, 'inflows', 'c-kestrel-bank', '2026-12', 4000, 'c-kestrel-2');
  split(P, 'div', 'd-draw', '2026-11', 12000, 'd-draw-2');
  // … and Meridian Labs has paid November ahead: its month of 6 November is marked «Получено» today.
  const now1 = Date.parse(T + 'T09:00:00Z'), mrd = row(P, 'inflows', 'c-meridian-labs');
  mrd.rec = { ...mrd.rec, x: { ...(mrd.rec.x || {}), '2026-11': { ...((mrd.rec.x || {})['2026-11'] || {}), paid: { on: T, at: now1, by: 'Mika' } } } };
  led.tx.push({ id: 'x-halden-part', d: '2026-10-04', a: 3900, c: 'rev', b: 'Wise', l: 'Halden & Co', v: 0, s: 'file', o: { a: 3900, cur: 'GBP', t: 'Payment from HALDEN & CO' }, key: 'demo|Wise|2026-10-04|3900|GBP|x-halden-part', at: 1791190800000 });
  const pg = await scene('what if, the rules', led, P, { H: 60 });
  const base = await holds(pg, 'the plan, with a client and a withdrawal that were split and a payment paid in part');
  const M0 = base.M, plan0 = canon(base.P);
  const byHand = async (edit) => { const P2 = JSON.parse(JSON.stringify(P)); edit(P2); const M = await C(led, P2, T, { H: 60 }, 'a trial copy made by hand'); return [M.LOW, M.LOWDAY, M.IN, M.OUT]; };
  // (first reading: the trial knew a row by its id, so the part that had ended answered for the client - «уйдёт» took November and left December's payment, and «выводим другую сумму» changed a month that was not coming)
  const gone = await byHand((P2) => { row(P2, 'inflows', 'c-kestrel-bank').rec.to = '2026-10'; P2.inflows = P2.inflows.filter((r) => r.id !== 'c-kestrel-2'); });
  same([of(await ask(pg, [{ k: 'stop', row: 'c-kestrel-bank', from: '2026-11' }])), of(await ask(pg, [{ k: 'stop', row: 'c-kestrel-2', from: '2026-11' }]))], [gone, gone],
    '«клиент уйдёт» said of either part of a split row ends the whole of it: November\'s payment and December\'s at the new sum both go');
  const less = await byHand((P2) => { row(P2, 'div', 'd-draw-2').amt = 5000; });
  same([of(await ask(pg, [{ k: 'draw', row: 'd-draw', amt: 5000, from: '2026-11' }])), of(await ask(pg, [{ k: 'draw', row: 'd-draw-2', amt: 5000, from: '2026-11' }]))], [less, less],
    '«выводим другую сумму» from November reaches the part that goes on from November, whichever part it was said of');
  // (first reading: moved more than ten days on, the payment lost the statement row that had paid a part of it and waited for its whole sum again - paying later made the studio £3,900 richer)
  const part = M0.items.find((it) => it.id === 'c-halden-co@2026-10');
  same([part.part && part.part.got, Math.round(Math.abs(part.cash))], [3900, 5850], 'Halden & Co has paid £3,900 of October\'s £9,750: £5,850 is still to come');
  const p7 = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: part.id, days: 7 }]), p30 = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: part.id, days: 30 }]);
  same([p7.trial.IN, p7.trial.low, p30.trial.IN, p30.trial.low < p30.plan.low], [p7.plan.IN, p7.plan.low, p30.plan.IN, true], 'the rest of it a week or a month later: nothing more comes than the plan waits for, and the part that came is not counted again');
  // (second reading: «клиент уйдёт» from a month that had already come took that money back out of the bank - the month went with its mark, and the low point, «Можно вывести» and «Под налоги» fell with it)
  const paidNov = M0.items.find((it) => it.id === 'c-meridian-labs@2026-11');
  const left = await ask(pg, [{ k: 'stop', row: 'c-meridian-labs', from: '2026-11' }]);
  same([paidNov.state, of(left), left.trial.now, left.trial.res], ['done', await byHand((P2) => { row(P2, 'inflows', 'c-meridian-labs').rec.to = '2026-11'; }), left.plan.now, left.plan.res],
    'a client who «уходит с ноября» after November has come: the month that came stays - the figures of a plan whose repeat ends WITH November, and the money in the bank is what it was');
  // (second reading: through the script two changes of one payment were both made, the later winning in silence; and a sum that is no number was counted as nothing)
  const twice = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: '', days: 30 }, { k: 'late', row: 'c-halden-co', item: '', days: 60 }, { k: 'draw', row: 'd-draw', amt: null, from: '2026-11' }]);
  same([of(twice), twice.skipped.map((x) => x.i)], [of(await ask(pg, [{ k: 'late', row: 'c-halden-co', item: '', days: 60 }])), [0, 2]], 'asked through the script: of two changes of one payment the later is made and the earlier is named as replaced; a withdrawal with no sum is not made');
  // (third reading: a «только этот» named as replaced still shielded its payment - «все платежи» then moved everything but it; and one with days out of range shielded too)
  const all30 = of(await ask(pg, [{ k: 'late', row: 'c-halden-co', item: '', days: 30 }]));
  const oneAll = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: 'c-halden-co@2026-11', days: 20 }, { k: 'late', row: 'c-halden-co', item: '', days: 30 }]), allBad = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: '', days: 30 }, { k: 'late', row: 'c-halden-co', item: 'c-halden-co@2026-11', days: 400 }]);
  same([of(oneAll), oneAll.skipped.map((x) => x.i), of(allBad), allBad.skipped.map((x) => x.i)], [all30, [0], all30, [1]], 'through the script «только этот» and then «все платежи» is «все платежи»: a change that is replaced, or not made, shields no payment');
  // (third reading: «позже» and «уйдёт» of one client in one trial - the «позже» line still told of a payment arriving that the same trial had taken away)
  const leaves = await ask(pg, [{ k: 'late', row: 'c-halden-co', item: 'c-halden-co@2026-11', days: 10 }, { k: 'stop', row: 'c-halden-co', from: '2026-11' }]);
  same([of(leaves), leaves.skipped.map((x) => x.i), /клиент уходит раньше/.test(leaves.skipped[0].why)], [of(await ask(pg, [{ k: 'stop', row: 'c-halden-co', from: '2026-11' }])), [0], true], 'a payment moved and its client leaving before it: the move is not made, and is named so');
  // (first reading: a cost in a currency no account keeps was counted as the same number of pounds)
  const eur = await ask(pg, [{ k: 'cost', amt: 3000, cur: 'EUR', day: 25, from: '2026-11', name: '' }, { k: 'late', row: 'no-such-row', item: '', days: 30 }]);
  same([of(eur), eur.skipped.map((x) => x.i), /EUR/.test(eur.skipped[0].why)], [[M0.LOW, M0.LOWDAY, M0.IN, M0.OUT], [0, 1], true], 'a cost in euros, where no account with a balance keeps euros, is not made - and whoever asked is told which changes were not made, and why');

  // On the screen.
  await unfold(pg);
  await kind(pg, 'stop');
  same((await opts(pg, 'row')).filter((n) => /Kestrel/.test(n)), ['Kestrel Bank'], 'a split client stands once among the clients');
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-kestrel-bank');
  ok(/Kestrel Bank уйдёт с ноября · не придут 2 платежа · £9,000 за 60 дней/.test(await worked(pg)), 'the line under the fields counts both of its payments: £4,200 and £4,800', await worked(pg));
  // (first reading: «его платежей и так нет» was said of a client who pays twice in these sixty days)
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-meridian-labs');
  await pg.selectOption(F + '[data-wi-f="from"]', '2027-01');
  ok(/Meridian Labs уйдёт с января · его платежи с января в эти 60 дней не попадают/.test(await worked(pg)), 'a client who leaves after the sixty days: his payments of these days stay, and the line says that', await worked(pg));
  await pg.selectOption(F + '[data-wi-f="from"]', '2026-11');
  ok(/Meridian Labs уйдёт с ноября · .* · ноябрь уже получен — этот месяц остаётся/.test(await worked(pg)), '… and when the month he leaves from has already come, the line says that month stays', await worked(pg));
  await kind(pg, 'draw');
  ok(/10 октября — вместо £9,000 и 10 ноября — вместо £12,000/.test(await worked(pg)), '«выводим другую сумму» says, month by month, what the plan holds now', await worked(pg));
  // (first reading: the payment a change held could lie beyond the days the page looks at, where «Какой платёж» did not offer it - the field showed «все платежи», and the press counted them all)
  await kind(pg, 'late');
  // (second reading: a payment that is awaited is counted today, and was named by today's date - a date the plan holds no payment on)
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-fable-foods');
  ok((await opts(pg, 'item')).some((n) => /^только платёж от 26 сентября \(ждём\) · £/.test(n)) && /ждали 26 сен → /.test(await worked(pg)), 'a payment that is awaited is named by its own date, «ждём»', [await opts(pg, 'item'), await worked(pg)]);
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await pg.selectOption(F + '[data-wi-f="item"]', 'c-halden-co@2026-11');
  await pg.click('#view-today [data-td-h="30"]');
  same([await val(pg, 'item'), /только платёж 14 ноября/.test(await worked(pg))], ['c-halden-co@2026-11', true], 'with thirty days pressed, the payment of 14 November is still the one the field shows');
  await pg.click(F + '[data-wi-go]');
  same(await changes(pg), [{ k: 'late', row: 'c-halden-co', item: 'c-halden-co@2026-11', days: 30 }], '… and the one the press counts');
  await pg.click('#view-today [data-td-h="60"]');
  // (first reading: the grey line under «Можно вывести» left out what is held back for «Разбор», and did not add up to the figure beside it)
  const one = await ask(pg, await changes(pg)), t = one.trial.tight;
  const sub = await text(pg, F + '.wi-t tr:has([data-wi-k="free"]) .wi-meta');
  ok(t.inbox > 0.5 && one.trial.free !== one.plan.free && Math.floor((t.e - t.res - t.inbox - M0.cushion + 1e-6) / 100) * 100 === one.trial.free && sub.includes(`на счетах ${money(t.e)}; ${money(t.res)} — налоги, ${money(M0.cushion)} — запас, ${money(t.inbox)} — в разборе`),
    'the line under «Можно вывести» names every part held back on the tight day - taxes, the cushion, «в разборе» - and they give the figure beside it', [sub, one.trial.free, t]);
  // (first reading: two changes of one payment were both listed, and the later silently won)
  await pg.click(F + '[data-wi-more]');
  await kind(pg, 'late');
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await pg.selectOption(F + '[data-wi-f="item"]', 'c-halden-co@2026-11');
  await pg.fill(F + '[data-wi-f="days"]', '45');
  await pg.click(F + '[data-wi-go]');
  same([await changes(pg), await toastText(pg)], [[{ k: 'late', row: 'c-halden-co', item: 'c-halden-co@2026-11', days: 45 }], 'Прежнее изменение для этой строки заменено новым.'], 'a second change of the same payment takes the first one\'s place, and the page says so');
  // (first reading: leaving «День месяца» drew the whole tab afresh under the press, and the first «Посчитать» was lost; a press in the trial also dropped what was being typed in a card beside it)
  const team = M0.items.find((it) => it.list === 'team' && it.open && it.day && it.day <= M0.end);
  await openRow(pg, team.id);
  ok(!(await texts(pg, K('row') + '.ed-foot button')).includes('Что если…'), 'the card of a cost has no «Что если…»: there is nothing to ask about that row', await texts(pg, K('row') + '.ed-foot button'));
  await pg.fill(K('row') + '[data-ed-f="amt"]', '7777');
  await pg.click(F + '[data-wi-more]');
  await kind(pg, 'cost');
  await pg.selectOption(F + '[data-wi-f="from"]', '2026-10');
  await pg.fill(F + '[data-wi-f="day"]', '3');
  same([await val(pg, 'from'), (await opts(pg, 'from'))[0], /с ноября · платить 3-го числа/.test(await worked(pg))], ['2026-11', 'с ноября 2026', true], 'the 3rd of October has passed: with that day typed, the first month offered is November, and the line says November');
  // (second reading: one keystroke on the way to «26» moved the chosen month on, and it never came back)
  await pg.fill(F + '[data-wi-f="day"]', '26');
  same([await val(pg, 'from'), /с октября · платить 26-го числа/.test(await worked(pg))], ['2026-10', true], 'the month that was chosen comes back as soon as the day typed allows it');
  await pg.fill(F + '[data-wi-f="day"]', '3');
  await pg.click(F + '[data-wi-go]');
  same([(await changes(pg)).length, (await changes(pg))[1], await pg.inputValue(K('row') + '[data-ed-f="amt"]')], [2, { k: 'cost', name: '', amt: 3000, cur: 'GBP', day: 3, from: '2026-11' }, '7777'],
    'one press on «Посчитать» straight from the field counts; and what was typed in the card beside the trial is still there');
  await pg.click(K('row') + '[data-ed-x]');
  await pg.waitForFunction(() => !document.querySelector('[data-ed-card="row"]'));
  await holds(pg, 'after all of that «Сегодня» is the plan');
  same([store.cash.puts, store.led.puts, canon(await pg.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state()))))], [0, 0, plan0], 'nothing was saved and the plan is what it was');
  // (second reading: when the day - or the plan - moved under the fields, «Посчитать» stored another change than the fields and the line showed, and said nothing)
  await pg.click(F + '[data-wi-more]');
  await kind(pg, 'stop');
  await pg.selectOption(F + '[data-wi-f="row"]', 'c-brightwater');
  await pg.evaluate(() => { const S = window.__cash.state(); S.inflows = S.inflows.filter((r) => r.id !== 'c-brightwater'); });
  await pg.click(F + '[data-wi-go]');
  same([(await changes(pg)).length, await toastText(pg)], [2, 'План или день изменились — проверьте поля и нажмите ещё раз'], 'the row the fields name is gone from the plan at the press: nothing is counted, the page is drawn afresh and says so');
  await pg.click(F + '[data-wi-cancel]');
  // (first reading: with a balance missing the trial showed neither its list nor «Закончить пробу», and went on being «идёт проба» until a reload)
  await pg.evaluate(() => { const S = window.__cash.state(); S.banks = S.banks.filter((b) => b.id !== 'b2'); });
  await goCash(pg);
  await pg.click('.nav [data-tab="today"]');
  await pg.waitForSelector(F + '[data-wi-panel]');
  ok(/сравнивать не с чем/.test(await text(pg, F + '[data-wi-panel]')) && /В пробе 2 изменения/.test(await text(pg, F + '[data-wi-panel]')), 'a balance goes missing while a trial is on: the page cannot count it, says how many changes it holds', await text(pg, F + '[data-wi-panel]'));
  await pg.click(F + '[data-wi-end]');
  same([(await changes(pg)).length, plain(await pg.$eval('#view-today .td-wi > summary .td-meta', (e) => e.textContent))], [0, 'платёж придёт позже · клиент уйдёт · наймём человека · выводим другую сумму'], '… and can still be ended');
  await pg.context().close();

  // ---- 2. A plan whose costs are not written out (vT), two monthly withdrawals - one of them in dollars - and two rows of one client.
  const P2 = demoPlan(T), now = Date.parse(T + 'T09:00:00Z');
  P2.team = P2.team.filter((r) => /lena|greta/i.test(r.name));
  Object.assign(row(P2, 'div', 'd-draw'), { cur: 'USD', amt: 12000 });
  P2.div.push({ id: 'd-draw-b', name: 'Вывод второй', amt: 4000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-12', c0: now, m: { t: now, by: 'Mika' }, blk: 'div', rec: { day: 12, from: '2026-10' } });
  P2.inflows.push({ id: 'c-halden-2', name: 'Halden & Co', amt: 3200, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, vat: false, date: '2026-10-20', c0: now, m: { t: now, by: 'Mika' }, blk: 'rev', rec: { day: 20, from: '2026-10' } });
  const led2 = demoLedger(T), thin = await scene('what if, a thin plan', led2, P2, { H: 60 });
  const b2 = await holds(thin, 'a plan with less than half a usual month of costs');
  same([b2.M.verdict.id, b2.M.free.why], ['vT', 'thin'], 'the page will not say «денег хватает» of it, and names no «Можно вывести»');
  // (first reading: the trial named «Можно вывести» - the plan's and its own - on a page that shows a dash there, and said «денег хватает» of a plan the page will not say it of)
  const a2 = await ask(thin, [{ k: 'draw', row: 'd-draw-b', amt: 1000, from: '2026-10' }]);
  same([a2.plan.free, a2.plan.freeWhy, a2.trial.free], [null, 'thin', null], 'the trial names no «Можно вывести» either: asked through the script, it gives the reason and no sum');
  // (second reading: through the script the same trial was «v1» with a sum, while the screen said the plan was not written out)
  const a3 = await ask(thin, [{ k: 'cost', amt: 16000, cur: 'GBP', day: 25, from: '2026-10', name: '' }]);
  same([a3.trial.id, a3.trial.free, a3.trial.freeWhy], ['vT', null, 'thin'], 'a hire tried on a thin plan, asked through the script: still thin, and no sum - what the screen says');
  await unfold(thin);
  await kind(thin, 'draw');
  same([(await opts(thin, 'row')).length, /по \$12,000 в месяц.*вместо \$12,000/.test(await worked(thin))], [2, true], 'two monthly withdrawals: the page asks which; a withdrawal in dollars is said in dollars');
  await thin.selectOption(F + '[data-wi-f="row"]', 'd-draw-b');
  await thin.fill(F + '[data-wi-f="amt"]', '1000');
  await thin.click(F + '[data-wi-go]');
  same([/^План расходов не дописан, поэтому «денег хватает» не скажу и про этот случай/.test(await say(thin)), await thin.$(F + '[data-wi-k="free"]'), /«Можно вывести» проба не называет, как и сама страница сейчас: план расходов не дописан/.test(await text(thin, F + '.wi-notes')), /строка «Вывод второй»/.test(await text(thin, F + '.wi-ch b')), /В плане несколько ежемесячных выводов/.test(await text(thin, F + '.wi-notes'))],
    [true, null, true, true, true], 'the answer: no «хватает», no row «Можно вывести» and the reason why, and the withdrawal that was changed is named - the other stays');
  // (a large cost that is only tried does not write the plan out: the first version called the plan enough once the trial itself had filled it)
  await thin.click(F + '[data-wi-more]');
  await kind(thin, 'cost');
  await thin.fill(F + '[data-wi-f="amt"]', '16000');
  await thin.click(F + '[data-wi-go]');
  ok(/^План расходов не дописан/.test(await say(thin)) && !/хватает на/.test(await say(thin)), 'with £16,000 a month tried on top, the plan is still not one to say «хватает» of', await say(thin));
  await thin.click(F + '[data-wi-more]');
  await kind(thin, 'stop');
  same((await opts(thin, 'row')).filter((n) => /Halden/.test(n)), ['Halden & Co · 14-го, £9,750', 'Halden & Co · 20-го, £3,200'], 'two rows of one name are told apart by their day and their sum');
  // (third reading: at thirty days, with no «Можно вывести» named, the notes still put the edge of what the trial sees at sixty)
  await thin.click('#view-today [data-td-h="30"]');
  await kind(thin, 'cost');
  await thin.fill(F + '[data-wi-f="day"]', '20');
  await thin.selectOption(F + '[data-wi-f="from"]', '2026-11');
  await thin.fill(F + '[data-wi-f="amt"]', '8000');
  const far30 = await worked(thin);
  await thin.click(F + '[data-wi-go]');
  ok(/в 30 дней не попадает ни одной выплаты$/.test(far30) && /Новый расход идёт каждый месяц и дальше 30 дней — этого проба уже не видит/.test(await text(thin, F + '.wi-notes')), 'thirty days and no «Можно вывести» to name: a cost that begins on day 45 is beyond what the trial sees, and the page says thirty, not sixty', [far30, await text(thin, F + '.wi-notes')]);
  await thin.context().close();

  // ---- 3. A plan that is in the minus by itself.
  const P3 = demoPlan(T);
  P3.banks.find((b) => b.bank === 'Wise' && b.cur === 'GBP').amt -= 60000;
  const red = await scene('what if, a plan in the minus', demoLedger(T), P3, { H: 60 });
  same((await holds(red, 'a plan that runs out of money')).M.verdict.id, 'v4', 'the plan itself is in the minus');
  await unfold(red);
  // (first reading: the trial blamed its changes for the plan's own minus - also a change that does nothing, and one that helps)
  await kind(red, 'cost');
  await red.selectOption(F + '[data-wi-f="from"]', '2027-01');
  await red.click(F + '[data-wi-go]');
  same([await say(red), await red.$(F + '.wi-t')], ['В ближайшие 60 дней это ничего не меняет: все цифры те же, что по плану.', null], 'a cost that begins after the sixty days changes nothing, and the answer says so: no table of two equal columns');
  // (second reading: «ничего не меняет» was said while the first minus more than doubled on the same day)
  await red.click(F + '[data-wi-more]');
  await kind(red, 'late');
  await red.selectOption(F + '[data-wi-f="row"]', 'c-orchard-lane');
  await red.selectOption(F + '[data-wi-f="item"]', 'c-orchard-lane@2026-10');
  await red.fill(F + '[data-wi-f="days"]', '4');
  await red.click(F + '[data-wi-go]');
  ok(/^−£[\d,]+ · 10 окт$/.test(await text(red, F + '[data-wi-k="minus"]')) && /не хватит £[\d,]+ — это первый минус.*По плану денег тоже не хватает\./.test(await say(red)), 'a payment four days later deepens the first minus on the same day: the row «Первый минус» carries the sum, and the answer is the minus, «по плану тоже»', [await text(red, F + '.wi-t'), await say(red)]);
  await red.click(F + '[data-wi-more]');
  await kind(red, 'draw');
  await red.fill(F + '[data-wi-f="amt"]', '6000');
  await red.click(F + '[data-wi-go]');
  ok(/По плану денег тоже не хватает\./.test(await say(red)) && !/Уберите изменения по одному/.test(await text(red, F + '.wi-ans')), 'a smaller withdrawal helps and the plan is still short: the answer says the plan is short too, and blames no change', [await say(red), await text(red, F + '.wi-ans')]);
  await red.context().close();

  // ---- 4. Withdrawals: October's is taken in full, and from December the row is in dollars. A large cost on 20 November.
  const led4 = demoLedger(T), P4 = demoPlan(T), taken = led4.tx.find((t) => t.id === 'demo960');
  led4.tx.push({ ...taken, id: 'x-take', d: '2026-10-05', a: 7192.27, o: { ...taken.o, a: -7192.27 }, key: 'demo|Wise|2026-10-05|-7192.27|GBP|x-take' });
  split(P4, 'div', 'd-draw', '2026-12', 12000, 'd-usd');
  row(P4, 'div', 'd-usd').cur = 'USD';
  P4.other.push({ id: 'o-move', name: 'Переезд офиса', amt: 16000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-11-20', c0: now, m: { t: now, by: 'Mika' }, blk: 'other' });
  const wd = await scene('what if, withdrawals', led4, P4, { H: 60 });
  const b4 = await holds(wd, 'a plan whose October withdrawal is taken and whose withdrawal is in dollars from December');
  same(b4.M.items.find((it) => it.id === 'd-draw@2026-10').state, 'done', 'October\'s £9,000 is taken in full');
  await unfold(wd);
  await kind(wd, 'draw');
  // (second reading: «с октября» was offered and said, and October stayed as it was - the sentence promised a month the change did not reach)
  same([(await opts(wd, 'from'))[0], await val(wd, 'amt'), /начиная с ноября · в 60 дней попадает 1 вывод: 10 ноября — вместо £9,000/.test(await worked(wd))], ['с ноября 2026', '9000', true], 'a month taken in full is not offered: another sum begins with the first month still to be taken');
  // (second reading: one number was put into the months in pounds and the months in dollars, and every month was printed in the last part\'s currency)
  await wd.fill(F + '[data-wi-f="amt"]', '');
  await wd.click(F + '[data-wi-go]');
  same([(await changes(wd)).length, await toastText(wd)], [0, 'Впишите сумму в месяц'], 'an emptied sum is not a sum of nothing: the page asks for it');
  await wd.fill(F + '[data-wi-f="amt"]', '5000');
  await wd.click(F + '[data-wi-go]');
  const five = await ask(wd, await changes(wd)), usd = (await wd.evaluate(() => window.__money.trial.plan)).div.find((r) => r.id === 'd-usd');
  same([Math.round((five.trial.OUT - five.plan.OUT) * 100), usd.rec.x || null, /по £5,000 в месяц, начиная с ноября/.test(await text(wd, F + '.wi-ch b')), /С декабря этот вывод в плане в другой валюте \(USD\): те месяцы проба не меняет/.test(await text(wd, F + '.wi-notes'))],
    [-400000, null, true, true], '£5,000 from November: November alone changes - the months in dollars are left as they are, and the page says so');
  // (second reading: «Можно вывести» was set side by side over two different sets of withdrawals, with nothing to say so)
  await wd.click(F + '[data-wi-more]');
  await kind(wd, 'draw');
  await wd.fill(F + '[data-wi-f="amt"]', '20000');
  await wd.click(F + '[data-wi-go]');
  const big = await ask(wd, await changes(wd)), fr = await text(wd, F + '.wi-t tr:has([data-wi-k="free"]) td:first-child');
  ok((await changes(wd)).length === 1 && big.trial.free < big.plan.free && /^Можно вывести сверх выводов в плане/.test(fr) && /выводы в плане за 60 дней: £9,000 → £20,000/.test(fr), '£20,000 instead (it takes the place of the £5,000): «Можно вывести» is what can be taken over the withdrawals written - the row says so, and names both sums of them', [fr, big.plan.free, big.trial.free]);
  await wd.click(F + '[data-wi-more]');
  await kind(wd, 'draw');
  await wd.selectOption(F + '[data-wi-f="from"]', '2026-12');
  same([await val(wd, 'amt'), /Сколько выводить в месяц, USD/.test(await text(wd, F + '.wi-fields')), /по \$12,000 в месяц, начиная с декабря/.test(await worked(wd))], ['12000', true, true], 'from December the sum asked for is in dollars, and the field starts from that month\'s own');
  await wd.click(F + '[data-wi-cancel]');
  await wd.click(F + '[data-wi-end]');
  // (second reading: at thirty days the line of a change denied the row beside it - «на цифры ниже не влияет» over a «Можно вывести» that moved)
  await kind(wd, 'late');
  await wd.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await wd.selectOption(F + '[data-wi-f="item"]', 'c-halden-co@2026-11');
  await wd.click('#view-today [data-td-h="30"]');
  await wd.click(F + '[data-wi-go]');
  const far = await ask(wd, await changes(wd)), lineOf = await text(wd, F + '.wi-ch');
  ok(far.trial.free !== far.plan.free && far.trial.IN === far.plan.IN && !/не влияет/.test(lineOf) && /он дальше 30 дней: изменить может только «Можно вывести» — она смотрит на 60/.test(lineOf) && /считается на 60 дней вперёд/.test(await text(wd, F + '.wi-t')),
    'thirty days pressed, a payment of day 39 moved: «Придёт» is the plan\'s, «Можно вывести» is not - and the line says that figure may change, not that nothing does', [lineOf, far.plan.free, far.trial.free]);
  await wd.context().close();

  // ---- 5. The same studio three weeks on: Halden & Co has not paid October, and the statements have gone past it.
  const led5 = demoLedger(T), P5 = demoPlan(T);
  ['Wise', 'Barclays', 'Tochka', 'Mosta'].forEach((b, i) => led5.tx.push({ id: 'x-cov' + i, d: '2026-10-27', a: 1, c: 'fixed', b, l: 'bank fee', v: 0, s: 'file', o: { a: -1, cur: P5.banks.find((x) => x.bank === b).cur, t: 'fee' }, key: 'demo|cov|' + i, at: Date.parse('2026-10-27T18:00:00Z') }));
  P5.banks.forEach((b) => { b.asOf = '2026-10-28'; b.at = Date.parse('2026-10-28T08:00:00Z'); });
  const lt = await scene('what if, a late client', led5, P5, { H: 60, at: '2026-10-28T12:00:00+00:00' });
  const M5 = (await holds(lt, 'a plan with a client whose payment is overdue')).M;
  same(M5.items.find((it) => it.id === 'c-halden-co@2026-10').state, 'late', 'Halden & Co\'s October is late');
  // (second reading: of the client who is not paying the page said «его платежей и так нет», while his overdue payment was counted today)
  await unfold(lt);
  await kind(lt, 'stop');
  await lt.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  ok(/его просроченный платёж \(£[\d,]+\) остаётся в расчёте — о нём спрашивает «Нужно решить»/.test(await worked(lt)) && !/и так нет/.test(await worked(lt)), 'a client with an overdue payment «уходит»: the line says the overdue payment is still counted, and who asks about it', await worked(lt));
  await lt.context().close();

  // ---- 6. A plan that is «впритык» by itself.
  const P6 = demoPlan(T);
  P6.banks.find((b) => b.bank === 'Wise' && b.cur === 'GBP').amt -= 50000;
  const tight = await scene('what if, a plan under its cushion', demoLedger(T), P6, { H: 60 });
  same((await holds(tight, 'a plan whose low point is under the cushion')).M.verdict.id, 'v3', 'the plan itself is «впритык»');
  await unfold(tight);
  await kind(tight, 'cost');
  await tight.fill(F + '[data-wi-f="day"]', '1');
  await tight.selectOption(F + '[data-wi-f="from"]', '2026-12');
  await tight.click(F + '[data-wi-go]');
  // (second reading: «в этом случае впритык» with no word that the plan is exactly as tight without the change)
  ok(/^В этом случае хватает, но впритык: .* По плану тоже впритык\.$/.test(await say(tight)), 'a cost that begins after the low point: the answer says the plan is «впритык» too', await say(tight));
  // (third reading, on the screen: the line of a payment that comes later, when its client leaves before it)
  await tight.click(F + '[data-wi-more]');
  await kind(tight, 'late');
  await tight.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await tight.selectOption(F + '[data-wi-f="item"]', 'c-halden-co@2026-11');
  await tight.click(F + '[data-wi-go]');
  await tight.click(F + '[data-wi-more]');
  await kind(tight, 'stop');
  await tight.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  await tight.click(F + '[data-wi-go]');
  same([/Halden & Co заплатит на 30 дней позже.*это изменение сейчас не считается: в этой же пробе клиент уходит раньше/.test((await texts(tight, F + '.wi-ch'))[1]), plain(await tight.$eval('#view-today .td-wi > summary .td-meta', (e) => e.textContent))], [true, 'идёт проба: 3 изменения · 1 сейчас не считается · в план ничего не записано'], 'the client leaves from the month of the payment that was moved: the move\'s line says it is not counted, and the folded line counts it so');
  await tight.context().close();

  // ---- 7. The studio at the end of October: Kestrel Bank's November invoice was dated 18 October by a founder and is overdue.
  const T7 = '2026-10-28', led7 = demoLedger(T7), P7 = demoPlan(T7), kb = row(P7, 'inflows', 'c-kestrel-bank');
  kb.rec = { ...kb.rec, x: { ...(kb.rec.x || {}), '2026-11': { ...((kb.rec.x || {})['2026-11'] || {}), date: '2026-10-18' } } };
  const eom = await scene('what if, an overdue month ahead', led7, P7, { H: 60, at: '2026-10-28T12:00:00+00:00' });
  const M7 = (await holds(eom, 'a plan whose next month of a client is already overdue')).M;
  same(M7.items.find((it) => it.id === 'c-kestrel-bank@2026-11').state, 'late', 'Kestrel Bank\'s November is overdue, and counted today');
  await unfold(eom);
  await kind(eom, 'stop');
  await eom.selectOption(F + '[data-wi-f="row"]', 'c-kestrel-bank');
  // (third reading: the line said that overdue payment «остаётся в расчёте» while the copy took it out - and named a smaller sum than «Придёт» lost)
  const k7 = await ask(eom, [{ k: 'stop', row: 'c-kestrel-bank', from: '2026-11' }]);
  ok(/Kestrel Bank уйдёт с ноября · не придут 2 платежа · £8,400 за 60 дней/.test(await worked(eom)) && !/остаётся в расчёте/.test(await worked(eom)) && Math.round((k7.plan.IN - k7.trial.IN) * 100) === 840000, 'he leaves from November: the overdue November and December do not come - the line counts both, the sum «Придёт» loses', [await worked(eom), k7.plan.IN - k7.trial.IN]);
  await eom.selectOption(F + '[data-wi-f="from"]', '2027-01');
  ok(/его платежи с января в эти 60 дней не попадают; его просроченный платёж \(£4,200\) остаётся в расчёте — о нём спрашивает «Нужно решить»/.test(await worked(eom)), 'he leaves from January: the overdue payment of an earlier month is still counted, and the line does not say he has no other payments', await worked(eom));
  // (third reading: «ноябрь уже получен» was said of a month closed by «Частично», whose rest is still awaited)
  await eom.evaluate(() => { const S = window.__cash.state(), it = window.__money.model({ H: 60 }).items.find((x) => x.id === 'c-halden-co@2026-11'); window.__money.write.partial(S, it, 1500, 'x-rest', Date.now(), 'Mika', window.__money.today, '2026-11-20'); });
  await goCash(eom);
  await eom.click('.nav [data-tab="today"]');
  await eom.waitForSelector(F + '[data-wi-panel]');
  await kind(eom, 'stop');
  await eom.selectOption(F + '[data-wi-f="row"]', 'c-halden-co');
  ok(/за ноябрь получено £1,500 из £9,750 — этот месяц и его остаток остаются как в плане/.test(await worked(eom)) && !/ноябрь уже получен/.test(await worked(eom)), 'a month closed by «Частично»: the line says how much came, and that the month and its rest stay as the plan has them', await worked(eom));
  await eom.context().close();
});

// =====================================================================================================================
// «ЧЕЙ ВЫВОД» (the owner's decision of 12 October 2026: «да, делай, А»). A withdrawal may say whose it is. Then only
// that founder's block uses it up: his rows go to his own withdrawals first, oldest first, what they have over to
// the ones that are everybody's, never to another founder's - and a plan that says nothing reads to the penny as
// it did. The rows that exist stay everybody's until somebody says whose they are.
// =====================================================================================================================
await run('rv-whose', 'a withdrawal that says whose it is is used up by that founder alone - his rows first, the rest to the shared ones, nobody else\'s ever; a plan that says nothing reads as it did; the card and «Добавить» ask «Чей вывод»', async () => {
  const D = '2026-10-13', AT = ms('2026-10-13T08:00:00Z'), P = await plan2();
  const three = (own = {}) => ({ ...P, div: P.div.concat([
    row('wdV', 'Вывод Vanya', 3000, '2026-10-08', { blk: 'div', ...(own.V !== undefined ? { whose: own.V } : {}) }),
    row('wdM', 'Вывод Misha', 2000, '2026-10-10', { blk: 'div', ...(own.M !== undefined ? { whose: own.M } : {}) }),
    row('wdS', 'Вывод', 5000, '2026-10-12', { blk: 'div' })]) });
  const L = ledP({ tx: [filed('m1', '2026-10-09', -4500, 'mika', '', { at: AT }), filed('v1', '2026-10-10', -3500, 'vanya', '', { at: AT }), filed('v2', '2026-10-11', -800, 'vanya', '', { at: AT })] });
  const of = (M) => ['wdV', 'wdM', 'wdS'].map((id) => { const it = item(M, id); return [!!it.done, it.wd.got, it.cash, it.rows]; });

  // Nobody's: as the page did until 12 October - the oldest withdrawal first, whoever took.
  const M0 = await C(L, three(), D);
  same(of(M0), [[true, 3000, 0, ['m1']], [true, 2000, 0, ['m1', 'v1']], [false, 3800, -1200, ['v1', 'v2']]], 'no row says whose: Mika\'s 4,500 closes «Вывод Vanya» and most of «Вывод Misha», and Vanya\'s own money goes to the row after them');
  const plain0 = JSON.stringify(M0);
  for (const junk of ['', null, 'studio', 7, ['vanya'], 'Vanya']) ok(JSON.stringify(await C(L, three({ V: junk }), D)) === plain0, `whose: ${JSON.stringify(junk)} is nobody - the same model, byte for byte`);
  { const Q = three(); Q.div.find((r) => r.id === 'wdV').f = 'vanya'; ok(JSON.stringify(await C(L, Q, D)) === plain0, '`f` on a withdrawal - what the upgrade from the old plan left there - is not whose it is'); }

  // Somebody's.
  const M1 = await C(L, three({ V: 'vanya', M: 'misha' }), D);
  same([of(M1), M1.items.some((it) => it.rows.includes('v2')), item(M1, 'wdM').state, M1.cards.some((c) => c.item === 'wdM'), [item(M1, 'wdV').whose, item(M1, 'wdM').whose, item(M1, 'wdS').whose]],
    [[[true, 3000, 0, ['v1']], [false, 0, -2000, []], [true, 5000, 0, ['m1', 'v1']]], false, 'waiting', false, ['vanya', 'misha', '']],
    'Vanya\'s row takes Vanya\'s 3,000 and none of Mika\'s; the 500 he has over and Mika\'s 4,500 fill the shared one; Misha, who took nothing, still has his 2,000 ahead - never late, no card; Vanya\'s 800 finds no row and stays outside the plan');
  same([M1.now, M1.free.wd.n, round2(M1.OUT - M0.OUT), M1.month.blocks.div.fact], [M0.now, 1, 800, M0.month.blocks.div.fact], '«Денег сейчас» and the month\'s fact are what they were - the bank does not know whose a plan row is; what is still to be taken is 2,000 where it was 1,200');
  // a founder with no row of his own, and no shared row left: outside the plan
  const lone = { ...P, div: P.div.concat([row('wdV', 'Вывод Vanya', 3000, '2026-10-08', { blk: 'div', whose: 'vanya' })]) };
  const M2 = await C(ledP({ tx: [filed('m1', '2026-10-09', -4500, 'mika', '', { at: AT })] }), lone, D);
  same([item(M2, 'wdV').wd.got, item(M2, 'wdV').cash, item(M2, 'wdV').rows], [0, -3000, []], 'the only withdrawal is Vanya\'s and Mika takes 4,500: the row is untouched');
  // saying whose a row is deals the rows over - by the founder's own act, through the page's own verb
  const picked = await wr(three(), 'set', item(M0, 'wdV'), { whose: 'vanya' }, TAP, BY);
  same([picked.div.find((r) => r.id === 'wdV').whose, of(await C(L, picked, D))], ['vanya', [[true, 3000, 0, ['v1']], [true, 2000, 0, ['m1']], [false, 3800, -1200, ['m1', 'v1', 'v2']]]], '«Vanya» chosen on the first row: Mika\'s 4,500 leaves it for the two that are everybody\'s, Vanya\'s own 3,000 closes it, and what he has over follows Mika\'s into the last');
  const back = await wr(picked, 'set', item(M0, 'wdV'), { whose: '' }, TAP, BY);
  same(['whose' in back.div.find((r) => r.id === 'wdV'), JSON.stringify(await C(L, back, D)) === plain0], [false, true], '«общий» again: the key is gone from the row, not left empty, and the model is the one it was before anybody chose');
  // what the other verbs do with it: the rest of «Частично», «Продублировать», a month and onward, and a row that is no withdrawal
  const own3 = three({ V: 'vanya' }), MV = await C(ledP(), own3);
  const rest = await wr(own3, 'partial', item(MV, 'wdV'), 1000, 'rest1', TAP, BY, T, '2026-10-20');
  const dup = await wr(own3, 'dup', [item(MV, 'wdV'), item(MV, 'wdS')], '2026-11', ['n1', 'n2'], TAP, BY);
  const odd = await wr(own3, 'add', 'team', row('odd', 'Person X', 10, '2026-10-20', { whose: 'vanya' }));
  same([rest.div.find((r) => r.id === 'rest1').whose, dup.div.find((r) => r.id === 'n1').whose, 'whose' in dup.div.find((r) => r.id === 'n2'), 'whose' in odd.team.find((r) => r.id === 'odd')], ['vanya', 'vanya', false, false],
    'the rest «Частично» leaves of Vanya\'s withdrawal is Vanya\'s; «Продублировать» keeps whose a row is; a row of «Команда» never carries the key');

  // (independent reading: whose a line is reached one stored row only - a monthly withdrawal that «… и дальше» had split kept its other part everybody's, under a card that said «для всех месяцев»)
  const chain = (Q) => Q.div.filter((r) => r.id === 'wR' || (r.rec && r.rec.chain === 'wR')).map((r) => [r.rec.from, r.rec.to || '', r.whose || '', r.amt]);
  let R = { ...P, div: P.div.concat([row('wR', 'Вывод', 1000, '2026-05-20', { blk: 'div', rec: { day: 20, from: '2026-05' } })]) };
  const month = async (Q, id) => item(await C(ledP(), Q), id);
  R = await wr(R, 'onward', await month(R, 'wR@2026-12'), { amt: 1500 }, 'wR2', TAP, BY);
  R = await wr(R, 'set', await month(R, 'wR@2026-10'), { whose: 'misha' }, TAP, BY);
  same(chain(R), [['2026-05', '2026-11', 'misha', 1000], ['2026-12', '', 'misha', 1500]], 'said of October of a monthly withdrawal that was split in December: both stored rows of the line are Misha\'s');
  R = await wr(R, 'onward', await month(R, 'wR@2026-10'), { whose: 'vanya' }, 'wR3', TAP, BY);
  same(chain(R), [['2026-05', '2026-09', 'misha', 1000], ['2026-10', '2026-11', 'vanya', 1000], ['2026-12', '', 'vanya', 1500]], '«Октябрь и дальше» with Vanya: every part from October on is Vanya\'s - the December part too - and the months before stay Misha\'s');
  R = await wr(R, 'onward', await month(R, 'wR3@2026-11'), { amt: 1200 }, 'wR4', TAP, BY);
  same(chain(R).map((x) => x[2]), ['misha', 'vanya', 'vanya', 'vanya'], 'a sum changed «и дальше» moves nobody\'s owner');
  // (independent reading: with a withdrawal marked «Оплачено», saying whose ANOTHER row is deals an old row into the marked one, and «Денег сейчас» moves with nothing new from the bank. Since 13 October 2026 the page sees what a marked withdrawal holds before it changes the plan and keeps it after, and that no longer happens - the check rv-wdmark, and on the screen below. What is held here is the bare writer, as a page from before that day uses it: the row moves in, and a bank row is still counted once.)
  // (17 October 2026: a row whose whole name is a founder's is his by that name - N, the check «records». The row
  // the founder gives away below was called «Vanya» until then, and so everybody's; it is called «Вывод Vanya» now,
  // which no founder's name is, so that it is everybody's still and the arithmetic is the same: Mika's 2,000 closes
  // it while it is everybody's; given to Vanya it lets the 2,000 go into the marked «Вывод».)
  const MARK = ms('2026-10-13T10:00:00Z');
  let Q2 = { ...P, div: P.div.concat([row('wA', 'Вывод Vanya', 2000, '2026-10-08', { blk: 'div' }), row('wB', 'Вывод', 3000, '2026-10-12', { blk: 'div', paid: paid(D, MARK) })]) };
  const L2 = ledP({ tx: [filed('m1', '2026-10-09', -2000, 'mika', '', { at: AT })] });
  let Mq = await C(L2, Q2, D);
  same([item(Mq, 'wA').state, item(Mq, 'wA').rows, item(Mq, 'wB').wd.got, item(Mq, 'wB').done.by], ['done', ['m1'], 0, 'mark'], 'Mika\'s 2,000 closes the row called «Вывод Vanya», which is everybody\'s; «Вывод», marked, holds nothing');
  const marked = [Mq.now, Mq.marksGbp];
  Q2 = await wr(Q2, 'set', item(Mq, 'wA'), { whose: 'vanya' }, MARK + 60000, BY);
  Mq = await C(L2, Q2, D);
  same([Object.keys(Q2.div.find((r) => r.id === 'wB').paid).sort(), item(Mq, 'wA').cash, item(Mq, 'wA').wd.got + item(Mq, 'wB').wd.got, [round2(Mq.now - marked[0]), round2(Mq.marksGbp - marked[1])]], [['at', 'by', 'on'], -2000, 2000, [2000, 2000]],
    '«Вывод Vanya» given to Vanya by a page from before the rule, with «Вывод» marked: his row is open again with its 2,000; Mika\'s 2,000 is counted once - it now stands in the marked «Вывод», whose mark is worth the 1,000 that is left - so «Денег сейчас» is 2,000 higher until a statement passes the mark; the bare writer gives the mark no memory');
  // (independent reading: a founder\'s row that a choice left outside the plan was taken as the payment of a marked salary of the same sum)
  // (the same rename, for the same reason: Mika's 2,000 closes «Вывод Vanya» while it is everybody's, and is left over when it is Vanya's)
  let Q3 = { ...P, div: P.div.concat([row('wA', 'Вывод Vanya', 2000, '2026-10-08', { blk: 'div' })]), team: P.team.concat([row('pz', 'Person Z', 2000, '2026-10-12', { blk: 'cogs', paid: paid(D, MARK) })]) };
  const L3 = ledP({ tx: [filed('m1', '2026-10-10', -2000, 'mika', '', { at: MARK + 3600e3 })] });
  let M3 = await C(L3, Q3, D);
  const was3 = [M3.now, item(M3, 'pz').done.by, item(M3, 'pz').rows];
  Q3 = await wr(Q3, 'set', item(M3, 'wA'), { whose: 'vanya' }, MARK + 7200e3, BY);
  M3 = await C(L3, Q3, D);
  same([was3, [M3.now, item(M3, 'pz').done.by, item(M3, 'pz').rows]], [[was3[0], 'mark', []], [was3[0], 'mark', []]], 'a payout marked «Оплачено» stays closed by its mark when Mika\'s taking of the same sum is left outside the plan: a row of a founder\'s block is never somebody\'s salary');

  // ---- on the screen ----
  // A plan with one withdrawal that Mika's money has already closed, one that is open, and a monthly one.
  // (Until 17 October 2026 the closed one was called «Vanya», and was everybody's by that name too. A row whose
  // whole name is a founder's is his now (N): Mika's 3,000 could not close it - his 4,000 would give September's
  // monthly «Вывод» 1,000 and stand outside the plan with the other 3,000, and «Vanya» would wait for its own
  // 3,000. The row Mika asked about on 12 October - closed by the others' money, given to its founder by hand - is
  // one whose name says more than a founder's: «Вывод Vanya».)
  const PS = { ...P, div: P.div.concat([
    row('wdC', 'Вывод Vanya', 3000, '2026-10-05', { blk: 'div' }),
    row('wdO', 'Вывод ноябрь', 2000, '2026-10-20', { blk: 'div' }),
    row('wdR', 'Вывод', 1000, '2026-09-25', { blk: 'div', rec: { day: 25, from: '2026-09' } }),
    row('wdR2', 'Вывод', 1500, '2026-10-26', { blk: 'div', whose: 'vanya', rec: { day: 26, from: '2026-10' } })]) };
  // (Mika took 4,000: the first 1,000 uses up September of the monthly «Вывод», which is older, the rest closes «Вывод Vanya».)
  const LS = ledP({ tx: [filed('m1', '2026-10-05', -4000, 'mika', '', { at: AT2 })] });
  const pg = await scene('whose', LS, PS);
  const b0 = await holds(pg, 'a plan whose row «Вывод Vanya» was closed by what Mika took');
  same([item(b0.M, 'wdC').state, item(b0.M, 'wdC').rows, item(b0.M, 'wdC').whose], ['done', ['m1'], ''], 'the row called «Вывод Vanya» is closed by 3,000 of what Mika took: a name that is more than a founder\'s says nothing of whose a row is');
  const stored = (id) => pg.evaluate((id) => { const r = window.__cash.state().div.find((x) => String(x.id) === id); return r ? ['whose' in r, r.whose || ''] : null; }, id);
  const whoseOf = (kind) => pg.$eval(K(kind) + '[data-ed-f="whose"]', (e) => [e.value, [...e.options].map((o) => o.textContent)]);
  // «Добавить»: the form proposes what the name says, and a choice made by hand stands
  await openAdd(pg, 'div');
  same([await whoseOf('add'), plain(await pg.$eval(K('add') + '[data-ed-kind] ~ .note', (e) => e.textContent))], [['', ['общий', 'Mika', 'Misha', 'Vanya']], 'сколько и когда решили взять — общий вывод или одного фаундера'], '«Дивиденды» → «Вывод»: the form asks «Чей вывод» - общий, Mika, Misha, Vanya - and starts from «общий»');
  const says = async (name) => { await pg.fill(K('add') + '#ed-name', name); return (await whoseOf('add'))[0]; };
  same([await says('Vanya'), await says('Вывод Миши'), await says('Mika и Vanya'), await says('Вывод'), await says('Иванян')], ['vanya', 'misha', '', '', ''], 'a name with one founder in it proposes him - in Latin or in Russian; two names, or none, propose nobody; a word that only holds a name proposes nobody');
  await pg.fill(K('add') + '#ed-name', 'Вывод Vanya');
  await pg.selectOption(K('add') + '[data-ed-f="whose"]', 'misha');
  await pg.fill(K('add') + '#ed-name', 'Вывод Vanya, декабрь');
  same((await whoseOf('add'))[0], 'misha', 'a founder chosen by hand is not overruled by the name typed after');
  await pg.click(K('add') + '[data-ed-kind="ptax"]');
  same(await pg.$(K('add') + '[data-ed-f="whose"]'), null, '«Личный налог» has no such field: whose a personal tax is, its name says');
  await pg.click(K('add') + '[data-ed-kind="wd"]');
  same((await whoseOf('add'))[0], 'misha', '… and back at «Вывод» the choice is still there');
  await fill(pg, 'add', { amt: 700, date: '2026-10-22' });
  await pg.click(K('add') + '[data-ed-save]');
  await puts('cash', 1);
  const added = await pg.evaluate(() => window.__cash.state().div.find((r) => r.name === 'Вывод Vanya, декабрь'));
  same([added.whose, await toastText(pg)], ['misha', 'В плане: Вывод Vanya, декабрь · вывод Misha'], 'saved: the row says whose it is, and so does the toast');
  const shared = await addRow(pg, 'div', { name: 'Вывод общий', amt: 500, date: '2026-10-23' });
  same(await stored(shared), [false, ''], 'a withdrawal that is everybody\'s is saved without the key');
  // the card of an open withdrawal
  await goCash(pg);
  await rowCard(pg, 'div', 'wdO');
  same([await whoseOf('row'), await text(pg, K('row') + '.ed-why')], [['', ['общий', 'Mika', 'Misha', 'Vanya']], 'В плане: вписал Mika 6 окт · вывод: закроется тем, что возьмут фаундеры.'], 'the card of a withdrawal that exists: «общий», whatever it is called');
  const before = store.cash.puts;
  await rowSet(pg, 'div', 'wdO', { whose: 'vanya' });
  await puts('cash', before + 1);
  same([await stored('wdO'), await toastText(pg)], [[true, 'vanya'], 'Сохранено: Вывод ноябрь · вывод Vanya'], '«Vanya» chosen and saved');
  await rowCard(pg, 'div', 'wdO');
  same([(await whoseOf('row'))[0], await text(pg, K('row') + '.ed-why')], ['vanya', 'В плане: вписал Mika 6 окт · вывод Vanya: закроется тем, что возьмёт Vanya.'], '… the card now says whose it is, and how it will be closed');
  await rowSet(pg, 'div', 'wdO', { whose: '' });
  await puts('cash', before + 2);
  same(await stored('wdO'), [false, ''], '«общий» again: the key is gone');
  // the card of a withdrawal that is closed holds this one field
  await rowCard(pg, 'div', 'wdC');
  same([await pg.$$eval(K('row') + '[data-ed-f]', (l) => l.map((e) => e.dataset.edF)), (await whoseOf('row'))[0], (await texts(pg, K('row') + '.ed-foot button')).includes('Сохранить')], [['whose'], '', true], 'the closed row «Вывод Vanya»: its card holds «Чей вывод» and «Сохранить», and nothing else to type');
  await pg.selectOption(K('row') + '[data-ed-f="whose"]', 'vanya');
  await pg.click(K('row') + '[data-ed-save]');
  await puts('cash', before + 3);
  const b1 = await holds(pg, 'with the closed row given to Vanya', 'cash');
  same([await stored('wdC'), item(b1.M, 'wdC').state, item(b1.M, 'wdC').cash, item(b1.M, 'wdC').rows, b1.M.now], [[true, 'vanya'], 'waiting', -3000, [], b0.M.now], 'given to Vanya, it is open again with its whole 3,000: Mika\'s money no longer closes it, and «Денег сейчас» has not moved');
  // a month of a repeating withdrawal: whose it is belongs to the row, like its name
  await rowCard(pg, 'div', 'wdR@2026-10');
  const notes = (await texts(pg, K('row') + '.note')).join(' | ');
  ok(/название, банк, валюта и «чей вывод» — для всех месяцев/.test(notes), 'a month of «каждый месяц»: the card says «чей вывод» is for every month of the row', notes);
  await pg.selectOption(K('row') + '[data-ed-f="whose"]', 'mika');
  await pg.click(K('row') + '[data-ed-save="only"]');
  await puts('cash', before + 4);
  // (independent reading: the toast said «— только октябрь» before an owner that was written to every month)
  same([await stored('wdR'), (await pg.evaluate(() => window.__money.model({ H: 30 }).items.filter((it) => it.row === 'wdR').map((it) => it.whose))).every((w) => w === 'mika'), await toastText(pg)], [[true, 'mika'], true, 'Сохранено: Вывод · вывод Mika — для всех месяцев'], '«Только октябрь» with «Mika» chosen: the row is Mika\'s, in every month, and the toast says so');
  // «Октябрь и дальше»: from October on, and the month before keeps what it had
  await rowCard(pg, 'div', 'wdR@2026-10');
  await pg.selectOption(K('row') + '[data-ed-f="whose"]', 'misha');
  await pg.click(K('row') + '[data-ed-save="onward"]');
  await puts('cash', before + 5);
  same([await pg.evaluate(() => window.__cash.state().div.filter((r) => r.id === 'wdR' || (r.rec && r.rec.chain === 'wdR')).map((r) => [r.rec.from, r.whose || ''])), await toastText(pg)], [[['2026-09', 'mika'], ['2026-10', 'misha']], 'Сохранено: Вывод — с октября · вывод Misha'], '«Октябрь и дальше» with «Misha»: September stays Mika\'s, October on is Misha\'s');
  // «Что если»: two monthly withdrawals of one name are told apart by whose they are - in the list and in the line
  await toToday(pg);
  await pg.click('#view-today .td-wi > summary');
  await pg.click('#view-today .td-wi [data-wi-kind="draw"]');
  const wOpts = (await pg.$$eval('#view-today .td-wi [data-wi-f="row"] option', (l) => l.map((e) => e.textContent))).map(plain);
  await pg.selectOption('#view-today .td-wi [data-wi-f="row"]', 'wdR2');
  await pg.fill('#view-today .td-wi [data-wi-f="amt"]', '500');
  await pg.click('#view-today .td-wi [data-wi-go]');
  same([wOpts, /— строка «Вывод», вывод Vanya$/.test(await text(pg, '#view-today .td-wi .wi-ch b'))], [['Вывод · Misha, 25-го, £1,000', 'Вывод · Vanya, 26-го, £1,500'], true], '«выводим другую сумму»: the two «Вывод» are listed with their founders, and the change that is listed names the one it was made on');
  await holds(pg, 'with a trial on a founder\'s withdrawal listed on «Сегодня»');
  await pg.click('#view-today .td-wi [data-wi-end]');
  await goCash(pg);
  ok(await saved(pg), 'everything said on the screen is in the stored plan');
  await calm(pg, 'the card of a withdrawal with «Чей вывод»', 'cash');
  await shot(pg, 'rv-whose');
  await pg.context().close();

  // (independent reading: with a withdrawal marked «Оплачено» the same press moved «Денег сейчас», and nothing said so. Since 13 October 2026 it does not move: the page keeps what the marked withdrawal held - rv-wdmark. The mark here is one a plan from before that day holds.)
  // (the row is «Вывод Vanya» since 17 October 2026, for the reason given above: «Vanya» alone would be Vanya's by its name)
  serve(ledP({ tx: [filed('m1', '2026-10-05', -2000, 'mika', '', { at: AT2 })] }), { ...P, div: P.div.concat([row('wA', 'Вывод Vanya', 2000, '2026-10-05', { blk: 'div' }), row('wB', 'Вывод оплачен', 1500, '2026-10-06', { blk: 'div', paid: paid(T) })]) });
  const mk = await reopen('whose, a mark');
  const now0 = await mk.evaluate(() => window.__money.model({ H: 30 }).now);
  await goCash(mk);
  await rowCard(mk, 'div', 'wA');
  await mk.selectOption(K('row') + '[data-ed-f="whose"]', 'vanya');
  await mk.click(K('row') + '[data-ed-save]');
  await puts('cash', 1);
  const now1 = await mk.evaluate(() => window.__money.model({ H: 30 }).now);
  same([round2(now1 - now0), await toastText(mk), await mk.evaluate(() => { const r = window.__cash.state().div.find((x) => x.id === 'wB'), it = window.__money.model({ H: 30 }).items.find((x) => x.id === 'wB'); return [it.wd.got, it.rows, r.paid.saw ? r.paid.saw.rows.map((x) => x[1]) : null]; })], [0, 'Вывод Vanya: вывод Vanya', [0, [], [0]]], 'a closed row given to Vanya while another withdrawal carries «Оплачено»: Mika\'s money leaves the row and is not dealt into the marked withdrawal - the mark, made before the rule, is given its memory by this save - and «Денег сейчас» has not moved, so the toast has no figure to name');
  await mk.context().close();

  // somebody who only looks reads whose a withdrawal is, and is offered nothing
  serve(LS, { ...PS, div: PS.div.map((r) => (r.id === 'wdO' ? { ...r, whose: 'vanya' } : r)) });
  asReader();
  const rd = await open('whose, a reader', undefined, { who: 'Misha' });
  await rd.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(rd);
  await rd.click('#cs-sec-div tr[data-cs-id="wdO"]');
  await rd.waitForSelector('#view-cash [data-ed-card="row"]');
  same([await rd.$$eval('#view-cash [data-ed-card="row"] input, #view-cash [data-ed-card="row"] select', (l) => l.length), /вывод Vanya: закроется тем, что возьмёт Vanya\./.test(await text(rd, '#view-cash [data-ed-card="row"] .ed-why')), store.cash.puts], [0, true, 0], 'a reader\'s card of that withdrawal: whose it is, in words; no field, and no save');
  await rd.context().close();
  asOwner();
});

// A change to the plan deals nothing of a marked withdrawal over (13 October 2026). A marked withdrawal goes on
// taking rows like any other and its mark is worth what they leave - and which rows are its is decided by every
// other withdrawal of the plan. So a change to ANOTHER line - a withdrawal given to a founder, deleted, moved -
// dealt rows the page had long shown into the marked withdrawal or out of it, and «Денег сейчас» moved with nothing
// new from the bank. Now the page sees what each withdrawal whose mark can count holds before it changes the
// plan, and keeps it after: where the change would have dealt those rows over, the marks are given a memory of
// the table as it lay (paid.saw) and hold to it; where it would not, the plan holds no memory and is counted as it
// always was. Each case below is a plan made by hand; the figures are the differences a founder would see.
await run('rv-wdmark', 'a change to another line of the plan moves neither a marked withdrawal nor «Денег сейчас»; a plan the change dealt nothing over in holds no memory and is counted as before; what a statement brings is dealt by the walk; with no other withdrawal waiting, «Оплачено» then «Чей вывод» is «Чей вывод» then «Оплачено»', async () => {
  const D = '2026-10-13', AT = ms('2026-10-13T08:00:00Z'), MARK = ms('2026-10-13T10:00:00Z'), LATER = ms('2026-10-13T12:00:00Z'), P = await plan2();
  const w = (id, amt, date, more = {}) => row(id, 'Вывод ' + id, amt, date, { blk: 'div', ...more });
  const plan = (...rows) => ({ ...P, div: P.div.concat(rows) });
  const st = (M, id) => { const it = item(M, id); return [it.done ? it.done.by : it.state, it.wd.got, it.rows]; };
  // what a founder sees move: «Денег сейчас», the part of it that is hand marks, the month's fact for dividends
  const moved = (M1, M0) => [round2(M1.now - M0.now), round2(M1.marksGbp - M0.marksGbp), round2(M1.month.blocks.div.fact - M0.month.blocks.div.fact)];
  const paidOf = (Q, id, ym) => { const r = Q.div.find((x) => x.id === id); return (ym ? r.rec.x[ym] : r).paid; };
  const mem = (Q, id, ym) => paidOf(Q, id, ym).saw || null, held = (Q, id, ym) => (mem(Q, id, ym) ? mem(Q, id, ym).rows.map((x) => x[1]) : null);
  const none = (Q) => !JSON.stringify(Q).includes('"saw"');
  // (a model without what a mark would remember: the one field the rule adds to it)
  const bare = (M) => JSON.stringify({ ...M, items: M.items.map(({ saw, ...it }) => it) });
  // A change to the plan as the PAGE makes it (Plan.edit): what the marked withdrawals hold is seen, the change is
  // made, and it is kept. `f` is the change itself; `tap` one of the page's verbs on a line of the model the page
  // then shows. A bare `wr` is a page from before the rule.
  const see = (L, Q, day = D) => page.evaluate(([p, l, d]) => window.__money.write.see(p, l, d), [Q, L, day]);
  const keep = (L, Q, seen, day = D) => page.evaluate(([p, l, d, k]) => { window.__money.write.keep(p, l, d, k); return p; }, [Q, L, day, seen]);
  const edit = async (L, Q, f, day = D) => { const seen = await see(L, Q, day); return keep(L, await f(Q), seen, day); };
  const tap = async (L, Q, id, verb, ...a) => { const it = item(await C(L, Q, D), id); return edit(L, Q, (X) => wr(X, verb, it, ...a)); };
  const press = (L, Q, id, at = MARK) => tap(L, Q, id, 'mark', D, at, BY);
  const pick = (L, Q, id, whose, at = LATER) => tap(L, Q, id, 'set', { whose }, at, BY);
  const mika = (id, d, amt, at = AT) => filed(id, d, -amt, 'mika', '', { at }), vanya = (id, d, amt, at = AT) => filed(id, d, -amt, 'vanya', '', { at }), misha = (id, d, amt, at = AT) => filed(id, d, -amt, 'misha', '', { at });

  // ---- (a) another line of the plan changes ----
  const mA = mika('m1', '2026-10-09', 2000), La = ledP({ tx: [mA] });
  let Q = plan(w('wA', 2500, '2026-10-08'), w('wB', 3000, '2026-10-12'));
  const M0 = await C(La, Q, D);
  same([st(M0, 'wA'), st(M0, 'wB'), 'saw' in item(M0, 'wB')], [['waiting', 2000, ['m1']], ['blind', 0, []], false], 'Mika\'s 2,000 stands in the earlier withdrawal, which is still open; the later one holds nothing');
  Q = await press(La, Q, 'wB');
  const Ma = await C(La, Q, D), offer = item(Ma, 'wB').saw;
  same([moved(Ma, M0), st(Ma, 'wB'), st(Ma, 'wA'), Object.keys(paidOf(Q, 'wB')).sort(), [Object.keys(offer).sort(), offer.from, offer.to, offer.rows.map((x) => x[1]), /^[0-9a-z]+$/.test(offer.rows[0][0])]], [[-3000, -3000, 3000], ['mark', 0, []], st(M0, 'wA'), ['at', 'by', 'on'], [['from', 'rows', 'to'], '2026-10-02', '2026-11-01', [0], true]],
    '«Оплачено» on the later one: its 3,000 leaves «Денег сейчас» and is the month\'s fact; the mark is the three words it always was - no memory is written by the press; the model says what a memory would hold: the window, and the one taking of its days - by a hash - as not its own');
  for (const [how, kept, f] of [
    ['is given to Vanya', true, (X) => pick(La, X, 'wA', 'vanya')],
    ['is deleted', true, (X) => tap(La, X, 'wA', 'del')],
    ['is switched off', true, (X) => tap(La, X, 'wA', 'off')],
    ['is moved to December', true, (X) => tap(La, X, 'wA', 'set', { date: '2026-12-08' }, LATER, BY)],
    ['is made 500', true, (X) => tap(La, X, 'wA', 'set', { amt: 500 }, LATER, BY)],
    ['is made «каждый месяц»', false, (X) => tap(La, X, 'wA', 'tick')],
    ['is renamed', false, (X) => tap(La, X, 'wA', 'set', { name: 'Другое имя' }, LATER, BY)],
  ]) { const X = await f(Q), M1 = await C(La, X, D); same([moved(M1, Ma), st(M1, 'wB'), !none(X), held(X, 'wB')], [[0, 0, 0], ['mark', 0, []], kept, kept ? [0] : null], `the other withdrawal ${how}: «Денег сейчас», the month's fact and the mark are what they were` + (kept ? ' - Mika\'s row, which the walk would now put into the marked withdrawal, is not what «Оплачено» was said of, and the mark is given the memory that says so' : '; no row of the marked withdrawal would have been dealt over, and the plan holds no memory')); }
  { const X = await tap(La, Q, 'wA', 'partial', 2200, 'restA', LATER, BY, D, '2026-10-20'), M1 = await C(La, X, D); same([round2(M1.marksGbp - Ma.marksGbp), st(M1, 'wB'), none(X)], [-200, ['mark', 0, []], true], 'the other withdrawal marked «Частично», 2,200 of which rows show 2,000: its own mark is worth 200, and the first mark is as it was'); }
  { const X = await edit(La, Q, (Y) => ({ ...Y, div: Y.div.concat([w('wN', 5000, '2026-10-05')]) })), M1 = await C(La, X, D);
    same([moved(M1, Ma), st(M1, 'wB'), st(M1, 'wN'), st(M1, 'wA'), none(X)], [[0, 0, 0], ['mark', 0, []], ['waiting', 2000, ['m1']], ['waiting', 0, []], true], 'a withdrawal added to the plan, dated before both and stamped as written before the statement was read: Mika\'s row is its now, by the walk - the marked one held none of it, and the plan needs no memory'); }
  { const X = await wr(Q, 'del', item(Ma, 'wA')), M1 = await C(La, X, D); same([moved(M1, Ma), st(M1, 'wB')], [[2000, 2000, -2000], ['mark', 2000, ['m1']]], '(the same delete by a page from before the rule, which neither sees nor keeps: Mika\'s row is dealt into the marked withdrawal, and «Денег сейчас» is 2,000 higher with nothing new from the bank - the fault itself)'); }
  // … and a row must not LEAVE a marked withdrawal either, when an earlier one opens up for it
  const Qb = await press(La, plan(w('w0', 2000, '2026-10-08', { whose: 'vanya' }), w('wB', 3000, '2026-10-12')), 'wB');
  const Mb = await C(La, Qb, D);
  same([st(Mb, 'w0'), st(Mb, 'wB'), Mb.marksGbp, none(Qb)], [['waiting', 0, []], ['mark', 2000, ['m1']], -1000, true], 'the earlier withdrawal is Vanya\'s, so Mika\'s 2,000 stands in the shared one; marked, its mark is worth the 1,000 that is left');
  const Qb1 = await pick(La, Qb, 'w0', ''), Mb1 = await C(La, Qb1, D);
  same([moved(Mb1, Mb), st(Mb1, 'w0'), st(Mb1, 'wB'), Object.keys(mem(Qb1, 'wB')).sort(), held(Qb1, 'wB')], [[0, 0, 0], ['waiting', 0, []], ['mark', 2000, ['m1']], ['from', 'rows', 'to'], [2000]], 'the earlier one made everybody\'s: it comes before the marked one in the walk now, and Mika\'s row stays where it lay - the mark remembers the 2,000');
  const Qb2 = await pick(La, Qb1, 'w0', 'vanya');
  same([none(Qb2), bare(await C(La, Qb2, D)) === bare(Mb)], [true, true], '… and made Vanya\'s again: the walk gives the marked withdrawal what it holds, so the memory is taken away - the plan is counted as it always was');
  // a marked row made «каждый месяц», and back: the mark moves into the month and out of it, and its memory with it
  const Qt1 = await tap(La, Qb1, 'wB', 'tick'), Qt2 = await tap(La, Qt1, 'wB@2026-10', 'untick');
  same([held(Qt1, 'wB', '2026-10'), st(await C(La, Qt1, D), 'wB@2026-10'), held(Qt2, 'wB'), st(await C(La, Qt2, D), 'wB')], [[2000], ['mark', 2000, ['m1']], [2000], ['mark', 2000, ['m1']]], 'the marked withdrawal ticked «каждый месяц» and the tick taken off again: it is the same mark, and it holds what it held');
  // what is said of the marked withdrawal itself. Its sum made another (no control of the page says that of a marked
  // row; «… и дальше» in an earlier month's card does - below): that is its founder's word about it, and it is dealt afresh
  const Qs = await tap(La, Qb1, 'wB', 'set', { amt: 1500 }, LATER, BY), Ms = await C(La, Qs, D);
  same([st(Ms, 'wB'), st(Ms, 'w0'), none(Qs)], [['mark', 0, []], ['row', 2000, ['m1']], true], 'the marked withdrawal\'s own sum made 1,500: no memory holds a withdrawal against what is said of it - the walk deals it again by the plan as it is, and Mika\'s row closes the earlier withdrawal, which is everybody\'s now');
  // … and the same sum set by a page from before the rule, which neither sees nor keeps: the memory stays in the plan, and gives the withdrawal no more than its sum
  const Mraw = await C(La, await wr(Qb1, 'set', item(Mb1, 'wB'), { amt: 1500 }, LATER, BY), D);
  same([st(Mraw, 'wB'), st(Mraw, 'w0')], [['row', 1500, ['m1']], ['waiting', 500, ['m1']]], 'the marked withdrawal\'s sum made 1,500 by a bare writer: the row it remembers gives it 1,500 and no more - no withdrawal holds more than its sum - and the 500 over goes on by the walk');
  // … its day moved (a bare hand here; on the page «… и дальше» in an earlier month's card can do it - below): it holds what it held
  const Qday = await tap(La, Qb1, 'wB', 'set', { date: '2026-11-20' }, LATER, BY), Mday = await C(La, Qday, D);
  same([st(Mday, 'wB'), st(Mday, 'w0'), item(Mday, 'wB').wd.from, [mem(Qday, 'wB').from, mem(Qday, 'wB').to]], [['mark', 2000, ['m1']], ['waiting', 0, []], '2026-11-10', ['2026-10-02', '2026-11-01']], 'the marked withdrawal\'s own day moved to 20 November: Mika\'s row of 9 October is outside the window that day gives - it is the same mark, and the withdrawal holds the row all the same');
  // … and given to a founder by a page from before the rule: the memory is of a withdrawal that was everybody's, and is not in force
  const v9 = vanya('v9', '2026-10-10', 1000), L9 = ledP({ tx: [mA, v9] });
  const Q9 = await pick(L9, await press(L9, plan(w('w0', 2000, '2026-10-08', { whose: 'vanya' }), w('wB', 3000, '2026-10-12')), 'wB'), 'w0', ''), M9 = await C(L9, Q9, D);
  const Q9v = await wr(Q9, 'set', item(M9, 'wB'), { whose: 'vanya' }, LATER, BY), M9v = await C(L9, Q9v, D);
  same([st(M9, 'w0'), st(M9, 'wB'), held(Q9, 'wB'), st(M9v, 'w0'), st(M9v, 'wB'), 'w' in mem(Q9v, 'wB')], [['waiting', 1000, ['v9']], ['mark', 2000, ['m1']], [2000, 0], ['row', 2000, ['m1']], ['mark', 1000, ['v9']], false],
    'the marked shared withdrawal remembers Mika\'s 2,000 as its own and Vanya\'s 1,000 as not; a page from before the rule then says it is Vanya\'s: the memory is of another withdrawal - everybody\'s - and is not in force; Vanya\'s row is its now, Mika\'s is not');
  // two rows of one statement key - the upload makes none: the first is the taking the memory knows, the second is news
  const Mdup = await C(ledP({ tx: [mA, { ...mA, id: 'm1-dup' }] }), Qb1, D);
  same([st(Mdup, 'wB'), st(Mdup, 'w0')], [['mark', 2000, ['m1']], ['row', 2000, ['m1-dup']]], 'the remembered row twice in the table under one key: the first gives the marked withdrawal the 2,000 it gave, the second is dealt by the walk');
  // a memory written by hand that names another founder\'s taking for a withdrawal that is somebody\'s
  const Qhand = plan(w('wV', 3000, '2026-10-12', { whose: 'vanya', paid: { ...paid(D, MARK), saw: { w: 'vanya', from: '2026-10-02', to: '2026-11-01', rows: [[mem(Qb1, 'wB').rows[0][0], 2000]] } } }));
  same(st(await C(La, Qhand, D), 'wV'), ['mark', 0, []], 'a memory that names Mika\'s row for Vanya\'s withdrawal gives it nothing: a withdrawal that is somebody\'s holds no other founder\'s row, whatever a document says');
  // a month of a «каждый месяц» withdrawal - the usual form: the mark lives in the month, and the month after is another line
  const every = (id, amt, day, from, more = {}) => row(id, 'Вывод', amt, `${from}-${String(day).padStart(2, '0')}`, { blk: 'div', rec: { day, from }, ...more });
  const Lr0 = ledP({ tx: [mika('m1', '2026-10-09', 1000)] }), Lr = ledP({ tx: [mika('m1', '2026-10-09', 1000), mika('m2', '2026-10-11', 1500, LATER)] });
  const Qr = await press(Lr0, plan(every('wR', 3000, 5, '2026-09'), w('wX', 2000, '2026-10-08')), 'wR@2026-10');
  const Mr = await C(Lr, Qr, D);
  same([Object.keys(paidOf(Qr, 'wR', '2026-10')).sort(), st(Mr, 'wR@2026-10'), item(Mr, 'wR@2026-10').wd, Mr.marksGbp], [['at', 'by', 'on'], ['mark', 2500, ['m1', 'm2']], { from: '2026-09-25', to: '2026-10-25', got: 2500, by: [{ c: 'mika', l: '', gbp: 2500 }] }, -500],
    'October of a monthly withdrawal marked: the mark is stored in the month; a row of the 11th uploaded since has taken the mark\'s place, as it always would');
  for (const [how, kept, to, f] of [['moved to 20 October', true, '2026-10-09', (X) => tap(Lr, X, 'wR@2026-11', 'set', { date: '2026-10-20' }, LATER, BY)], ['moved to December', true, '2026-11-24', (X) => tap(Lr, X, 'wR@2026-11', 'set', { date: '2026-12-20' }, LATER, BY)], ['switched off', true, '', (X) => tap(Lr, X, 'wR@2026-11', 'off')], ['ended («с ноября больше не повторяю»)', false, '2026-10-25', (X) => tap(Lr, X, 'wR@2026-11', 'end')]]) {
    const X = await f(Qr), M1 = await C(Lr, X, D), id = item(M1, 'wR@2026-10') ? 'wR@2026-10' : 'wR', m = kept ? mem(X, 'wR', '2026-10') : null;
    same([moved(M1, Mr), st(M1, id), !none(X), m && [m.from, m.to, m.rows.map((x) => x[1])]].concat(to ? [item(M1, id).wd.to] : []), [[0, 0, 0], ['mark', 2500, ['m1', 'm2']], kept, kept ? ['2026-09-25', '2026-10-25', [1000, 1500]] : null].concat(to ? [to] : []), `November ${how}: nothing of October moves` + (kept ? ' - its window ended ten days before November\'s day and is another now; the mark is given a memory: the rows it holds, and the window it had - by whose end the statements would close it' : '; its window is what it was, and it needs no memory')); }
  const Qr2 = await pick(Lr, Qr, 'wR@2026-11', 'vanya'), Mr2 = await C(Lr, Qr2, D);
  same([st(Mr2, 'wR@2026-10'), round2(Mr2.marksGbp - Mr.marksGbp), none(Qr2)], [['mark', 0, []], -2500, true], '«Vanya» said in November\'s card is said of every month, October too: it is Vanya\'s withdrawal now, Mika\'s rows are not its, and the mark covers them - the founder\'s own word about this line, which no memory holds against');

  // ---- two marked withdrawals: what is done to the one does not move the other ----
  const Lx0 = ledP({ tx: [mika('m1', '2026-10-06', 1200)] }), Lx = ledP({ tx: [mika('m1', '2026-10-06', 1200), mika('m2', '2026-10-09', 1500, LATER)] });
  let Qx = await press(Lx0, plan(w('wX', 2000, '2026-10-05'), w('wY', 3000, '2026-10-12')), 'wX');
  Qx = await press(Lx0, Qx, 'wY', MARK + 1000);
  const Mx = await C(Lx, Qx, D);
  same([st(Mx, 'wX'), st(Mx, 'wY'), Mx.marksGbp, none(Qx)], [['row', 2000, ['m1', 'm2']], ['mark', 700, ['m2']], -2300, true], 'X and Y both marked, X holding Mika\'s 1,200; his 1,500 comes in a statement: 800 fills X, which rows now carry whole, and 700 takes Y\'s place');
  for (const [how, kept, f] of [['put back into the plan', false, (X) => tap(Lx, X, 'wX', 'unmark')], ['deleted', true, (X) => tap(Lx, X, 'wX', 'del')], ['switched off', true, (X) => tap(Lx, X, 'wX', 'off')], ['given to Vanya', true, (X) => pick(Lx, X, 'wX', 'vanya')], ['made «каждый месяц»', false, (X) => tap(Lx, X, 'wX', 'tick')]]) {
    const X = await f(Qx), M1 = await C(Lx, X, D); same([st(M1, 'wY'), item(M1, 'wY').mark.counts, !none(X), held(X, 'wY')], [['mark', 700, ['m2']], true, kept, kept ? [0, 700] : null], `X ${how}: Y holds the 700 it held` + (kept ? ', by the memory its mark is given' : '')); }
  // the choice made on a marked row frees rows; another marked withdrawal does not take them
  const Lz = ledP({ tx: [mika('f', '2026-10-12', 2000, LATER)] });
  let Qz = await press(ledP(), plan(w('wX', 1500, '2026-10-10', { whose: 'mika' }), w('wY', 3000, '2026-10-14', { whose: 'mika' })), 'wX');
  Qz = await press(ledP(), Qz, 'wY', MARK + 1000);
  const Mz = await C(Lz, Qz, D), Qz1 = await pick(Lz, Qz, 'wX', 'vanya'), Mz1 = await C(Lz, Qz1, D);
  same([st(Mz, 'wX'), st(Mz, 'wY'), st(Mz1, 'wX'), st(Mz1, 'wY'), moved(Mz1, Mz), held(Qz1, 'wY'), mem(Qz1, 'wX')], [['row', 1500, ['f']], ['mark', 500, ['f']], ['mark', 0, []], ['mark', 500, ['f']], [-1500, -1500, 1500], [500], null],
    'X and Y, both Mika\'s and both marked; his 2,000 fills X and gives Y 500. X is then said to be Vanya\'s: Mika\'s row leaves it and its mark covers the 1,500 - the founder\'s word about X - while Y, which is another line, holds the 500 it held; the 1,500 is no line\'s until a statement passes the marks');

  // ---- the rows that have come since the mark, and then a change to another line ----
  const Ln0 = ledP({ tx: [mika('m1', '2026-10-09', 1000)] }), Ln = ledP({ tx: [mika('m1', '2026-10-09', 1000), mika('n1', '2026-10-11', 2500, LATER)] });
  const Qn = await press(Ln0, plan(w('wA', 2500, '2026-10-08'), w('wB', 3000, '2026-10-12')), 'wB');
  const Mn = await C(Ln, Qn, D);
  same([st(Mn, 'wA'), st(Mn, 'wB'), Mn.marksGbp, none(Qn)], [['row', 2500, ['m1', 'n1']], ['mark', 1000, ['n1']], -2000, true], 'a statement after the mark: 1,500 of the new row closes the earlier withdrawal, which was open, and the 1,000 it has over takes the mark\'s place');
  const Qn1 = await tap(Ln, Qn, 'wA', 'del'), Mn1 = await C(Ln, Qn1, D);
  same([moved(Mn1, Mn), st(Mn1, 'wB'), held(Qn1, 'wB')], [[0, 0, 0], ['mark', 1000, ['n1']], [0, 1000]], 'the earlier withdrawal deleted on the page: the rows lie where they lay - 1,000 of the new one in the marked withdrawal, the rest in no line - and «Денег сейчас» does not move');
  const Mn2 = await C(ledP({ tx: Ln.tx.concat([mika('n2', '2026-10-12', 700, LATER + 5)]) }), Qn1, D);
  same([st(Mn2, 'wB'), round2(Mn2.marksGbp - Mn1.marksGbp)], [['mark', 1700, ['n1', 'n2']], 700], '… and a row that comes after that is news to the mark: the walk deals it, and it takes the mark\'s place');
  // a line deleted BEFORE the statement comes: the row is dealt against the plan as it is
  const Qd = await tap(ledP(), await press(ledP(), plan(w('wA', 2000, '2026-10-05'), w('wY', 3000, '2026-10-12')), 'wY'), 'wA', 'del');
  const Md = await C(ledP({ tx: [mika('m1', '2026-10-12', 3000, LATER), reach('Wise', '2026-10-12', 'GBP', LATER)] }), Qd, D);
  same([none(Qd), st(Md, 'wY'), Md.marksGbp], [true, ['row', 3000, ['m1']], 0], 'an open earlier withdrawal deleted after the mark, and then the 3,000 comes: all of it is the marked withdrawal\'s - no line that is gone takes a row');
  // a founder's own withdrawal written after the mark takes its own row
  const Qo = await edit(ledP(), await press(ledP(), plan(w('wY', 3000, '2026-10-12')), 'wY'), (X) => ({ ...X, div: X.div.concat([w('wV', 2000, '2026-10-12', { whose: 'vanya', c0: LATER })]) }));
  const Mo2 = await C(ledP({ tx: [vanya('v1', '2026-10-12', 2000, LATER + 5), mika('m1', '2026-10-13', 3000, LATER + 5), reach('Wise', '2026-10-13', 'GBP', LATER + 5)] }), Qo, '2026-10-14');
  same([st(Mo2, 'wY'), st(Mo2, 'wV')], [['row', 3000, ['m1']], ['row', 2000, ['v1']]], 'Vanya writes his own withdrawal the day after the shared one was marked; the statement shows his 2,000 and Mika\'s 3,000: each closes its own');
  // a statement that comes later with a taking of an earlier day does not eat the newest mark
  const w5 = w('w5', 2000, '2026-10-05'), Lh0 = ledP({ tx: [mika('a', '2026-10-10', 2000)] }), Lh = ledP({ tx: [mika('a', '2026-10-10', 2000), vanya('b', '2026-10-08', 2000, LATER)] });
  const Qh0 = await press(Lh0, plan(w5, w('w13', 3000, '2026-10-13', { c0: MARK - 60000 })), 'w13');
  const Mh0 = await C(Lh, Qh0, D);
  same([st(await C(Lh0, Qh0, D), 'w5'), st(Mh0, 'w5'), st(Mh0, 'w13'), Mh0.marksGbp], [['row', 2000, ['a']], ['row', 2000, ['b']], ['mark', 0, []], -3000], 'a withdrawal written and marked on the 13th, after Mika\'s 2,000 had closed the line of the 5th; then a statement that comes later shows Vanya\'s 2,000 of the 8th: it takes the line of the 5th, Mika\'s row - on the page before the new line was written - is no line\'s, and the 3,000 sent on the 13th is still not seen: the mark stands whole');

  // ---- (b) the same row: the two orders of «Оплачено» and «Чей вывод» ----
  const txC = [mika('m1', '2026-10-09', 2000), vanya('v1', '2026-10-10', 1500), vanya('v2', '2026-10-11', 700)];
  const Lc = ledP({ tx: txC }), Ld = ledP({ tx: txC.concat([vanya('v3', '2026-10-13', 900, LATER + 1), mika('m2', '2026-10-13', 400, LATER + 1), reach('Wise', '2026-10-14', 'GBP', LATER + 1)]) });
  const Qc = plan(w('w0', 1000, '2026-10-07'), w('wB', 6000, '2026-10-12'), w('wC', 4000, '2026-10-14'));
  const marked = await press(Lc, Qc, 'wB'), Mc1 = await C(Lc, marked, D);
  same([st(Mc1, 'w0'), st(Mc1, 'wB'), st(Mc1, 'wC'), Mc1.marksGbp], [['row', 1000, ['m1']], ['mark', 3200, ['m1', 'v1', 'v2']], ['due', 0, []], -2800], 'three withdrawals, everybody\'s: the middle one holds 1,000 of Mika\'s and Vanya\'s 2,200, and marked it is worth 2,800');
  const P1 = await pick(Lc, marked, 'wB', 'vanya', MARK), P2 = await press(Lc, await pick(Lc, Qc, 'wB', 'vanya', MARK), 'wB');
  const A1 = await C(Lc, P1, D);
  same([P1, none(P1), JSON.stringify(A1) === JSON.stringify(await C(Lc, P2, D))], [P2, true, true], '«Оплачено» and then «Чей вывод» is the plan that «Чей вывод» and then «Оплачено» writes - with no memory in either - and the model is the same');
  same([moved(A1, Mc1), st(A1, 'wB'), st(A1, 'wC')], [[-1000, -1000, 1000], ['mark', 2200, ['v1', 'v2']], ['due', 1000, ['m1']]], '… Mika\'s 1,000 leaves the marked row for the next one and the mark covers it: «Денег сейчас» is 1,000 lower, by the founder\'s own word about this row');
  // … with a statement between the two presses
  const P3 = await tap(Ld, marked, 'wB', 'set', { whose: 'vanya' }, MARK, BY), B1 = await C(Ld, P3, '2026-10-14');
  same([P3, st(B1, 'w0'), st(B1, 'wB'), st(B1, 'wC'), round2(item(B1, 'w0').wd.got + item(B1, 'wB').wd.got + item(B1, 'wC').wd.got)], [P2, ['row', 1000, ['m1']], ['row', 3100, ['v1', 'v2', 'v3']], ['due', 1400, ['m1', 'm2']], 5500],
    '«Оплачено», a statement, «Чей вывод»: the same plan again; Vanya\'s new 900 has taken the mark\'s place, Mika\'s 400 has gone to the next withdrawal, and the five rows, 5,500, are counted once');
  const back = await tap(Ld, P3, 'wB', 'set', { whose: '' }, MARK, BY);
  same([paidOf(back, 'wB'), 'whose' in back.div.find((r) => r.id === 'wB'), bare(await C(Ld, back, '2026-10-14')) === bare(await C(Ld, marked, '2026-10-14'))], [paidOf(marked, 'wB'), false, true], 'the choice taken back: the plan and the model are the ones they were');
  // … and said of a marked row that holds to a memory, the choice deals its rows afresh, against the plan as it is
  const Lk = ledP({ tx: [mika('a', '2026-10-10', 2000, LATER)] });
  let Qk0 = await press(ledP(), plan(w('w1', 2000, '2026-10-05'), w('wX', 3000, '2026-10-12')), 'wX');
  Qk0 = await tap(Lk, Qk0, 'w1', 'del');
  const Mk0 = await C(Lk, Qk0, D), Qk1 = await pick(Lk, await pick(Lk, Qk0, 'wX', 'vanya'), 'wX', ''), Mk1 = await C(Lk, Qk1, D);
  same([st(Mk0, 'wX'), held(Qk0, 'wX'), st(Mk1, 'wX'), moved(Mk1, Mk0), none(Qk1)], [['mark', 0, []], [0], ['mark', 2000, ['a']], [2000, 2000, -2000], true],
    'Mika\'s 2,000 stood in an earlier withdrawal that was then deleted, and the marked one holds to its memory: none of the row. «Чей вывод» said of the marked row and taken back is the founder\'s word about that row: it is dealt afresh, by the plan as it now is, and takes the 2,000 (on the screen, below, the card says the new figure; «Отменить» is the way back)');

  // ---- (c) a payment that sat unsorted in «Разбор» when the mark was made ----
  const txE = [mika('m1', '2026-10-09', 1000)];
  const Le = ledP({ tx: txE, inb: [inbox('u1', '2026-10-12', -1500, '', 'TRANSFER 123', { at: AT })] });
  const Qe = await press(Le, plan(w('wB', 3000, '2026-10-12'), w('wC', 2000, '2026-10-20')), 'wB');
  const Me = await C(Le, Qe, D);
  same([st(Me, 'wB'), Me.marksGbp], [['mark', 1000, ['m1']], -2000], 'marked with 1,000 seen and a transfer of 1,500 still unsorted in «Разбор»: the mark is worth 2,000');
  const Me1 = await C(ledP({ tx: txE.concat([filed('u1', '2026-10-12', -1500, 'vanya', '', { at: AT })]) }), Qe, D);
  same([moved(Me1, Me), st(Me1, 'wB'), st(Me1, 'wC')], [[1500, 1500, 0], ['mark', 2500, ['m1', 'u1']], ['due', 0, []]], 'sorted into Vanya\'s block: it takes the mark\'s place; the later withdrawal gets none of it');
  // … an earlier withdrawal that is still open takes it first, as the walk has it
  const Lg0 = ledP({ inb: [inbox('u2', '2026-10-08', -1500, '', 'TRANSFER 77', { at: AT })] }), Lg1 = ledP({ tx: [filed('u2', '2026-10-08', -1500, 'misha', '', { at: AT })] });
  const Qg = await press(Lg0, plan(w('wM', 1500, '2026-10-06'), w('wB', 3000, '2026-10-12')), 'wB');
  same([st(await C(Lg1, Qg, D), 'wM'), st(await C(Lg1, Qg, D), 'wB'), moved(await C(Lg1, Qg, D), await C(Lg0, Qg, D))], [['row', 1500, ['u2']], ['mark', 0, []], [0, 0, 1500]], 'an earlier withdrawal stood open when the mark was made: the transfer, sorted, is that one\'s - a marked withdrawal has no first claim, and «Денег сейчас» does not move');
  // … and a transfer uploaded before the withdrawal was written is no line's, marked or not - as for every line of the plan
  const Lf0 = ledP({ inb: [inbox('u0', '2026-10-05', -1500, '', 'TRANSFER 9', { at: AT1 })] }), Lf1 = ledP({ tx: [filed('u0', '2026-10-05', -1500, 'vanya', '', { at: AT1 })] });
  const Qf0 = plan(w('wB', 3000, '2026-10-12')), Qf = await press(Lf0, Qf0, 'wB');
  same([st(await C(Lf1, Qf0, D), 'wB'), st(await C(Lf1, Qf, D), 'wB'), round2((await C(Lf1, Qf, D)).marksGbp - (await C(Lf0, Qf, D)).marksGbp)], [['blind', 0, []], ['mark', 0, []], 0], 'a statement that was on the page before the withdrawal was written: its transfer, sorted, is not this withdrawal\'s - unmarked or marked alike; the rule changes nothing here');
  // … to a mark that holds to a memory a sorted transfer is news: the walk deals it
  const Lq = ledP({ tx: La.tx, inb: [inbox('u3', '2026-10-10', -900, '', 'TRANSFER 5', { at: AT })] }), Lq1 = ledP({ tx: La.tx.concat([filed('u3', '2026-10-10', -900, 'mika', '', { at: AT })]) });
  const Mq1 = await C(Lq1, Qb1, D);
  same([st(Mq1, 'w0'), st(Mq1, 'wB'), moved(Mq1, await C(Lq, Qb1, D))], [['waiting', 900, ['u3']], ['mark', 2000, ['m1']], [0, 0, 900]], 'the marked withdrawal holds to its memory, and a transfer is sorted out of «Разбор»: it is news, and the open earlier withdrawal takes it - «Денег сейчас» does not move, and the month\'s fact has a taking more');

  // ---- (d) a row of the marked withdrawal goes, comes back, is filed elsewhere ----
  const m1 = mika('m1', '2026-10-09', 1000), v1 = vanya('v1', '2026-10-10', 1200);
  const Lf = ledP({ tx: [m1, v1] });
  const Qf2 = await press(Lf, plan(w('wB', 3000, '2026-10-12'), w('wC', 2000, '2026-10-20')), 'wB');
  const Mf = await C(Lf, Qf2, D);
  same([st(Mf, 'wB'), Mf.marksGbp], [['mark', 2200, ['m1', 'v1']], -800], 'marked with 2,200 seen: the mark is worth 800');
  const Mgone = await C(ledP({ tx: [m1] }), Qf2, D);
  same([moved(Mgone, Mf), st(Mgone, 'wB'), item(Mgone, 'wB').part], [[0, -1200, 0], ['mark', 1000, ['m1']], null], 'Vanya\'s row deleted from the table: the mark covers what no row holds - «Денег сейчас» and the month\'s fact are what they were, and the line holds 1,000, not a sum no row carries');
  const Magain = await C(ledP({ tx: [m1, { ...v1, id: 'v1-again', at: LATER + 5 }] }), Qf2, D);
  same([moved(Magain, Mf), st(Magain, 'wB'), st(Magain, 'wC')], [[0, 0, 0], ['mark', 2200, ['m1', 'v1-again']], ['due', 0, []]], 'the statement read in again - another id, another moment, the same key: every figure as before the delete');
  const Mfiled = await C(ledP({ tx: [m1, { ...v1, c: 'other', l: 'Something' }] }), Qf2, D);
  same([[round2(Mfiled.now - Mf.now), round2(Mfiled.marksGbp - Mf.marksGbp)], st(Mfiled, 'wB')], [[-1200, -1200], ['mark', 1000, ['m1']]], 're-filed to «Прочие расходы»: the money left the bank all the same and is no longer a taking, so the mark covers its 1,200 - «Денег сейчас» is 1,200 lower');
  // a withdrawal that is somebody's holds no other founder's row: a held row put under another founder leaves it
  const Lv = ledP({ tx: [v1] }), Qv = await press(Lv, plan(w('wV', 3000, '2026-10-12', { whose: 'vanya' })), 'wV');
  const Mv = await C(Lv, Qv, D), Mv1 = await C(ledP({ tx: [{ ...v1, c: 'mika' }] }), Qv, D);
  same([st(Mv, 'wV'), st(Mv1, 'wV'), round2(Mv1.marksGbp - Mv.marksGbp)], [['mark', 1200, ['v1']], ['mark', 0, []], -1200], 'Vanya\'s marked withdrawal held his 1,200; the row filed under Mika instead is not Vanya\'s taking, and the mark covers it');
  // … the same things done to a row that a memory holds (Qb1: the shared marked withdrawal remembers Mika's 2,000; the earlier one is everybody's and open)
  const Mp = await C(La, Qb1, D);
  const Mp1 = await C(ledP(), Qb1, D), Mp2 = await C(ledP({ tx: [{ ...mA, id: 'm1-again', at: LATER + 5 }] }), Qb1, D);
  same([moved(Mp1, Mp), st(Mp1, 'wB'), moved(Mp2, Mp), st(Mp2, 'wB'), st(Mp2, 'w0')], [[0, -2000, 0], ['mark', 0, []], [0, 0, 0], ['mark', 2000, ['m1-again']], ['waiting', 0, []]], 'the remembered row deleted: the mark covers its 2,000 and «Денег сейчас» is what it was; read in again under another id: it gives the marked withdrawal the 2,000 it gave, and the earlier one - which the walk would give it to - gets none');
  const Qp1 = await edit(ledP(), Qb1, (X) => ({ ...X, cushion: 6000 }));
  same([held(Qp1, 'wB'), st(await C(ledP({ tx: [{ ...mA, id: 'm1-again', at: LATER + 5 }] }), Qp1, D), 'wB')], [[2000], ['mark', 2000, ['m1-again']]], '… and when the plan was changed while the row was out of the table: the memory keeps the taking it cannot see, and gives it its place when it is read in again');
  const Mp3 = await C(ledP({ tx: [{ ...mA, c: 'vanya' }] }), Qb1, D);
  same([st(Mp3, 'w0'), st(Mp3, 'wB'), round2(Mp3.marksGbp - Mp.marksGbp)], [['row', 2000, ['m1']], ['mark', 0, []], -2000], 'the remembered row filed under Vanya instead: it is another taking - news - and the walk gives it to the earlier withdrawal; the mark covers what it no longer holds');

  // ---- (e) the rows that come after the mark ----
  const Qh = await press(ledP({ tx: [m1] }), plan(w('wB', 3000, '2026-10-12')), 'wB');
  const Mh = await C(ledP({ tx: [m1] }), Qh, D);
  const Mh1 = await C(ledP({ tx: [m1, mika('m2', '2026-10-12', 1500, LATER)] }), Qh, D);
  same([moved(Mh1, Mh), st(Mh1, 'wB')], [[0, 1500, 0], ['mark', 2500, ['m1', 'm2']]], 'a statement uploaded after the mark shows 1,500 of it: the row takes the mark\'s place - the money is in the table now, the mark is worth 500, «Денег сейчас» does not move');
  const Mh2 = await C(ledP({ tx: [m1, mika('m2', '2026-10-12', 1500, LATER), mika('m3', '2026-10-14', 700, LATER + 9)] }), Qh, '2026-10-15');
  same([st(Mh2, 'wB'), item(Mh2, 'wB').mark.counts, Mh2.marksGbp, 'saw' in item(Mh2, 'wB')], [['row', 3000, ['m1', 'm2', 'm3']], false, 0, false], '… and once the statements pass the mark\'s day the rows carry all of it, and the mark waits for nothing');
  // an earlier withdrawal that is open takes a new row before the marked one
  const Qm = await press(ledP(), plan(w('wM', 2000, '2026-10-05', { whose: 'misha' }), w('wB', 3000, '2026-10-12')), 'wB');
  const Mm = await C(ledP(), Qm, D), Mm1 = await C(ledP({ tx: [misha('mi1', '2026-10-06', 2000, LATER), reach('Wise', '2026-10-12', 'GBP', LATER)] }), Qm, D);
  same([moved(Mm1, Mm), st(Mm1, 'wM'), st(Mm1, 'wB')], [[-2000, 0, 2000], ['row', 2000, ['mi1']], ['mark', 0, []]], 'Misha\'s 2,000 comes in a statement that stops the evening before the mark\'s day: it is his own open withdrawal\'s - the 3,000 somebody said was taken has still not been seen, and «Денег сейчас» is 2,000 lower');
  // the statement passes the day of a mark that holds to a memory: the memory is in force no longer
  const Lpass = ledP({ tx: [mA, reach('Wise', '2026-10-13', 'GBP', LATER)] }), Mpass = await C(Lpass, Qb1, '2026-10-14');
  same([st(Mpass, 'w0'), st(Mpass, 'wB'), Mpass.marksGbp, 'saw' in item(Mpass, 'wB'), none(await edit(Lpass, Qb1, (X) => ({ ...X, cushion: 6000 }), '2026-10-14'))], [['row', 2000, ['m1']], ['ok', 0, []], 0, false, true],
    'a statement uploaded after the mark reaches the mark\'s day: the mark counts for nothing, its memory is in force no longer, and the rows are dealt by the walk again - Mika\'s 2,000 closes the earlier withdrawal; the next change to the plan takes the memory out of it');

  // ---- «Частично», a memory that is not one, a mark on the founder's word, a line switched off ----
  const Lj = ledP({ tx: [m1] });
  const Qj = await tap(Lj, plan(w('wA', 1500, '2026-10-08', { whose: 'vanya' }), w('wB', 3000, '2026-10-12')), 'wB', 'partial', 1800, 'rest1', MARK, BY, D, '2026-10-20');
  const Mj = await C(Lj, Qj, D), Qj1 = await pick(Lj, Qj, 'wA', ''), Mj1 = await C(Lj, Qj1, D);
  same([st(Mj, 'wB'), Mj.marksGbp, Object.keys(paidOf(Qj, 'wB')).sort(), moved(Mj1, Mj), held(Qj1, 'wB')], [['mark', 1000, ['m1']], -800, ['amt', 'at', 'by', 'on'], [0, 0, 0], [1000]], '«Частично», 1,800 of 3,000, with 1,000 seen: the mark is worth 800; another withdrawal made everybody\'s moves nothing - the mark is given its memory');
  const bad = plan(w('wA', 2000, '2026-10-08'), w('wB', 3000, '2026-10-12', { paid: { ...paid(D, MARK), saw: null } }), row('wR', 'Вывод', 1000, '2023-01-20', { blk: 'div', rec: { day: 20, from: '2023-01', to: '2023-02', x: { '2023-01': { paid: { ...paid('2023-01-20', ms('2023-01-20T10:00:00Z')), saw: { from: 'x', rows: 7 } } } } } }));
  const good = { ...bad, div: bad.div.map((r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'saw' ? undefined : v)))) };
  same([bare(await C(La, bad, D)) === bare(await C(La, good, D)), none(await edit(La, bad, (X) => ({ ...X, cushion: 6000 })))], [true, true], 'a memory that is not one - null, or of another shape - is no memory: the plan is read as without it, and the next change takes it out, also from a month further back than the page writes months out');
  const word = plan(w('wA', 2000, '2026-10-08', { paid: { ...paid(D, MARK), ok: true } }), w('wB', 3000, '2026-10-12'));
  same([st(await C(La, word, D), 'wA'), st(await C(La, word, D), 'wB')], [['ok', 0, []], ['blind', 2000, ['m1']]], 'a withdrawal closed on the founder\'s word alone takes no row, as before: Mika\'s 2,000 goes to the next');
  const Qoff = await tap(La, Qb1, 'wB', 'off'), Moff = await C(La, Qoff, D);
  same([item(Moff, 'wB').state, item(Moff, 'wB').wd.got, Moff.marksGbp, st(Moff, 'w0'), none(Qoff)], ['off', 0, 0, ['row', 2000, ['m1']], true], 'a marked withdrawal that holds to a memory, switched off: it holds no row and counts no mark, the row goes where the walk has it, and the memory goes with the change');

  // ---- what the fourth independent reading asked for ----
  // each of the withdrawals that wait is given its memory, not only the one whose rows would move
  const Lw = ledP({ tx: [mika('r1', '2026-10-06', 1000)] });
  let Qw = await press(Lw, plan(w('wA', 1000, '2026-10-05'), w('wX', 1000, '2026-10-08'), w('wY', 3000, '2026-10-12')), 'wX');
  Qw = await press(Lw, Qw, 'wY', MARK + 1);
  const Mw = await C(Lw, Qw, D), Qw1 = await tap(Lw, Qw, 'wA', 'del'), Mw1 = await C(Lw, Qw1, D);
  same([st(Mw, 'wA'), moved(Mw1, Mw), st(Mw1, 'wX'), st(Mw1, 'wY'), held(Qw1, 'wX'), held(Qw1, 'wY')], [['row', 1000, ['r1']], [0, 0, 0], ['mark', 0, []], ['mark', 0, []], [0], [0]], 'two marked withdrawals and a third line that holds Mika\'s 1,000, deleted: the walk would give the row to the first marked one - and, were only that one held, to the second; each is given its memory, and neither takes it');
  // a window that grows over a row: the month after is switched off, and a row of the 28th would be October's
  const T2 = '2026-10-29', AT9 = ms('2026-10-29T08:00:00Z'), Lgr = ledP({ tx: [mika('m1', '2026-10-09', 1000, AT9), mika('r2', '2026-10-28', 800, AT9)] });
  const Qgr = await edit(Lgr, plan(every('wR', 3000, 5, '2026-09')), async (X) => wr(X, 'mark', item(await C(Lgr, X, T2), 'wR@2026-10'), T2, ms('2026-10-29T10:00:00Z'), BY), T2), Mgr = await C(Lgr, Qgr, T2);
  const Qgr1 = await edit(Lgr, Qgr, (X) => wr(X, 'off', item(Mgr, 'wR@2026-11')), T2), Mgr1 = await C(Lgr, Qgr1, T2);
  same([[item(Mgr, 'wR@2026-10').wd.got, item(Mgr, 'wR@2026-10').done.note, item(Mgr, 'wR@2026-10').wd.to, item(Mgr, 'wR@2026-11').wd.got], [item(Mgr1, 'wR@2026-10').wd.got, item(Mgr1, 'wR@2026-10').done.note, item(Mgr1, 'wR@2026-10').wd.to], round2(Mgr1.now - Mgr.now), mem(Qgr1, 'wR', '2026-10').to], [[1000, 'taken', '2026-10-25', 800], [1800, 'taken', '2026-11-24'], 0, '2026-10-25'],
    'October marked on the 29th, when the statements had passed the end of its window: «взято 1,000 из 3,000», and the mark counts for nothing. November switched off: October\'s window would now reach 24 November, it would be open again and its mark worth 1,200 - the memory keeps the end the window had, and it stays closed; the row of the 28th is the walk\'s, and «Денег сейчас» does not move');
  // … and a month that is open takes no row it did not hold when its window grows over one (the row is another bank\'s: this bank\'s statements stop on the 9th)
  const Lgo = ledP({ tx: [mika('m1', '2026-10-09', 1000, AT9), filed('r2', '2026-10-28', -800, 'mika', '', { at: AT9, b: 'Barclays' })] });
  const Qgo = await edit(Lgo, plan(every('wR', 3000, 5, '2026-09')), async (X) => wr(X, 'mark', item(await C(Lgo, X, T2), 'wR@2026-10'), T2, ms('2026-10-29T10:00:00Z'), BY), T2), Mgo = await C(Lgo, Qgo, T2);
  const Qgo1 = await edit(Lgo, Qgo, (X) => wr(X, 'off', item(Mgo, 'wR@2026-11')), T2), Mgo1 = await C(Lgo, Qgo1, T2);
  same([st(Mgo, 'wR@2026-10'), item(Mgo, 'wR@2026-11').wd.got, st(Mgo1, 'wR@2026-10'), moved(Mgo1, Mgo), held(Qgo1, 'wR', '2026-10')], [['mark', 1000, ['m1']], 800, ['mark', 1000, ['m1']], [0, 0, 0], [1000, 0]],
    'October marked and open, holding 1,000; a row of the 28th stands in November. November switched off: October\'s window would reach the 28th and take the 800 - a row the page has long shown; the memory says it held 1,000 of the one and none of the other, and «Денег сейчас» does not move');
  // a remembered row made smaller in «Таблица» gives no more than it now has
  const Mless = await C(ledP({ tx: [{ ...mA, a: 1500, o: { ...mA.o, a: -1500 } }] }), Qb1, D);
  same([st(Mless, 'wB'), st(Mless, 'w0')], [['mark', 1500, ['m1']], ['waiting', 0, []]], 'the remembered row of 2,000 made 1,500 by hand: it gives the marked withdrawal the 1,500 it has, and no line gets a pound that no row carries');
  // a memory lists the takings of the withdrawal's days - not every taking of the table - and to the last digit
  const olds = Array.from({ length: 10 }, (_, i) => mika('o' + i, '2026-07-' + (10 + i), 300 + i)), Lold = ledP({ tx: [mA].concat(olds) });
  const Qold = await pick(Lold, await press(Lold, plan(w('w0', 2000, '2026-10-08', { whose: 'vanya' }), w('wB', 3000, '2026-10-12')), 'wB'), 'w0', '');
  const Lpn = ledP({ tx: [mika('m1', '2026-10-09', 2000.4)] }), Qpn0 = await press(Lpn, plan(w('w0', 2000, '2026-10-08', { whose: 'vanya' }), w('wB', 3000, '2026-10-12')), 'wB'), Qpn = await pick(Lpn, Qpn0, 'w0', '');
  same([held(Qold, 'wB'), held(Qpn, 'wB'), moved(await C(Lpn, Qpn, D), await C(Lpn, Qpn0, D)), st(await C(Lpn, Qpn, D), 'wB')], [[2000], [2000.4], [0, 0, 0], ['mark', 2000.4, ['m1']]], 'ten takings of July in the table are no part of a memory of October; a taking of 2,000.40 is remembered with its pence, and held with them');
  // … and sixty pence dealt over are dealt over: the memory is written
  const Lsx = ledP({ tx: [mika('r1', '2026-10-06', 1000.6)] }), Qsx0 = await press(Lsx, plan(w('wA', 1000.6, '2026-10-05'), w('wB', 3000, '2026-10-12')), 'wB');
  const Qsx = await tap(Lsx, Qsx0, 'wA', 'set', { amt: 1000 }, LATER, BY);
  same([moved(await C(Lsx, Qsx, D), await C(Lsx, Qsx0, D)), held(Qsx, 'wB')], [[0, 0, 0], [0]], 'the other withdrawal made sixty pence smaller than the row it holds: the sixty pence are not dealt into the marked withdrawal');
  // the name a marked month goes by is its chain's: «Сентябрь и дальше» puts it into another stored row, and it holds to its memory
  const Lch = ledP({ tx: [mika('r1', '2026-09-27', 2000)] }), wRx = every('wR', 2500, 5, '2026-08');
  wRx.rec.x = { '2026-10': { amt: 3000 } };
  let Qch = await press(Lch, plan(wRx, w('wE', 2500, '2026-10-01', { whose: 'vanya' })), 'wR@2026-10');
  Qch = await pick(Lch, Qch, 'wE', '');
  const Mch = await C(Lch, Qch, D), Qch1 = await tap(Lch, Qch, 'wR@2026-09', 'onward', { amt: 1000 }, 'wR2', LATER + 1, BY), Mch1 = await C(Lch, Qch1, D), oct = Mch1.items.find((it) => it.wd && it.date === '2026-10-05');
  same([st(Mch, 'wR@2026-10'), st(Mch, 'wE'), [oct.id, oct.wd.got, oct.rows], moved(Mch1, Mch), !none(Qch1)], [['mark', 2000, ['r1']], ['blind', 0, []], ['wR2@2026-10', 2000, ['r1']], [0, 0, 0], true], 'October of a monthly withdrawal holds Mika\'s 2,000 by its memory; «Сентябрь и дальше» with another sum splits the stored row, and October is a month of the new one: the same mark, the same 2,000');
  // … and with another DAY: the marked month's own day moves with it, and it holds what it held
  const Ldy = ledP({ tx: [mika('r1', '2026-09-27', 1000)] }), Qdy = await press(Ldy, plan(every('wR', 3000, 5, '2026-08')), 'wR@2026-10'), Mdy = await C(Ldy, Qdy, D);
  const Qdy1 = await tap(Ldy, Qdy, 'wR@2026-09', 'onward', { date: '2026-09-20' }, 'wR2', LATER, BY), Mdy1 = await C(Ldy, Qdy1, D), oct2 = Mdy1.items.find((it) => it.wd && it.occ && it.occ.ym === '2026-10');
  const mdy = Qdy1.div.map((r) => r.rec && r.rec.x && r.rec.x['2026-10'] && r.rec.x['2026-10'].paid).find(Boolean).saw;
  same([st(Mdy, 'wR@2026-10'), [oct2.date, oct2.wd.got, oct2.rows, oct2.wd.from, oct2.wd.to], [mdy.from, mdy.to], moved(Mdy1, Mdy)], [['mark', 1000, ['r1']], ['2026-10-20', 1000, ['r1'], '2026-10-10', '2026-11-09'], ['2026-09-25', '2026-10-25'], [0, 0, 0]], '«Сентябрь и дальше» with the 20th for a day: marked October moves to the 20th with it, and Mika\'s row of 27 September is outside the window that day gives - it holds the row all the same, and «Денег сейчас» does not move');
  // a withdrawal closed on the founder\'s word waits for nothing and is given no memory
  const Qwd = await press(La, plan(w('wW', 500, '2026-10-06', { paid: { ...paid(D, MARK - 5), ok: true } }), w('wA', 2500, '2026-10-08'), w('wB', 3000, '2026-10-12')), 'wB'), Qwd1 = await tap(La, Qwd, 'wA', 'del');
  same(['saw' in paidOf(Qwd1, 'wW'), held(Qwd1, 'wB'), moved(await C(La, Qwd1, D), await C(La, Qwd, D))], [false, [0], [0, 0, 0]], 'a withdrawal closed on the founder\'s word beside the marked one: the memory is written for the mark that waits and for no other');
  // A mark that cannot count in «Денег сейчас» holds to no memory. A balance typed after the mark has the mark inside it …
  const Qbal = { ...Qb1, banks: Qb1.banks.map((b) => (b.bank === 'Wise' && b.cur === 'GBP' ? { ...b, asOf: D, at: LATER } : b)) }, Mbal = await C(La, Qbal, D);
  same([st(Mbal, 'w0'), st(Mbal, 'wB'), Mbal.marksGbp, 'saw' in item(Mbal, 'wB'), !none(Qbal), none(await edit(La, Qbal, (X) => ({ ...X, cushion: 6000 })))], [['row', 2000, ['m1']], ['mark', 0, []], 0, false, true, true],
    'the marked withdrawal holds Mika\'s 2,000 by its memory; then the account\'s balance is typed: the mark is inside it and counts for nothing, the memory is in force no longer, and the row is dealt by the walk - it closes the earlier withdrawal, as it would have before the rule; the next change takes the memory out of the plan');
  // … and a line ticked in «Что из этого уже прошло?» never was outside one: a change to another line gives it no memory
  const Qtk0 = plan(w('wA', 2500, '2026-10-08'), w('wT', 3000, '2026-10-12', { paid: { on: D, at: LATER - 1, by: BY } })), Qtk = { ...Qtk0, banks: Qtk0.banks.map((b) => (b.bank === 'Wise' && b.cur === 'GBP' ? { ...b, asOf: D, at: LATER } : b)) };
  const Mtk = await C(La, Qtk, D), Qtk1 = await tap(La, Qtk, 'wA', 'del'), Mtk1 = await C(La, Qtk1, D);
  same([st(Mtk, 'wT'), item(Mtk, 'wT').mark.counts, 'saw' in item(Mtk, 'wT'), st(Mtk1, 'wT'), none(Qtk1), bare(Mtk1) === bare(await C(La, await wr(Qtk, 'del', item(Mtk, 'wA')), D))], [['mark', 0, []], false, false, ['mark', 2000, ['m1']], true, true],
    'a withdrawal ticked as already inside the balance - no statement has come since, so its mark still waits, and counts for nothing - and the other one deleted: Mika\'s row is dealt into the ticked one, as before the rule; no figure of «Денег сейчас» is its, and it is given no memory');
  // A change to another month of the same row that would CLOSE the marked month: its window would end where the statements have already reached
  const T4 = '2026-10-14', AT4 = ms('2026-10-13T18:00:00Z'), Lcl = ledP({ tx: [vanya('r1', '2026-10-02', 1000, AT4), reach('Wise', '2026-10-13', 'GBP', AT4)] });
  const Qcl = await edit(Lcl, plan(every('wV', 3000, 25, '2026-08', { whose: 'vanya' })), async (X) => wr(X, 'mark', item(await C(Lcl, X, T4), 'wV@2026-09'), T4, ms('2026-10-14T10:00:00Z'), BY), T4), Mcl = await C(Lcl, Qcl, T4);
  const Qcl1 = await edit(Lcl, Qcl, (X) => wr(X, 'set', item(Mcl, 'wV@2026-10'), { date: '2026-10-20' }, ms('2026-10-14T11:00:00Z'), BY), T4), Mcl1 = await C(Lcl, Qcl1, T4);
  const Mcl0 = await C(Lcl, await wr(Qcl, 'set', item(Mcl, 'wV@2026-10'), { date: '2026-10-20' }, ms('2026-10-14T11:00:00Z'), BY), T4);
  same([st(Mcl, 'wV@2026-09'), item(Mcl, 'wV@2026-09').wd.to, st(Mcl1, 'wV@2026-09'), item(Mcl1, 'wV@2026-09').wd.to, moved(Mcl1, Mcl), mem(Qcl1, 'wV', '2026-09').to, [st(Mcl0, 'wV@2026-09')[0], round2(Mcl0.now - Mcl.now)]], [['mark', 1000, ['r1']], '2026-10-14', ['mark', 1000, ['r1']], '2026-10-09', [0, 0, 0], '2026-10-14', ['row', 2000]],
    'September of Vanya\'s monthly withdrawal marked, 1,000 of it seen, the statements at the 13th. October\'s day moved from the 25th to the 20th: September\'s window would end on the 9th, which the statements have passed - it would be closed as «взято 1,000 из 3,000» and «Денег сейчас» 2,000 higher (the bare writer shows it); the memory keeps the end the window had, the mark goes on waiting, and nothing moves');
  // With a memory in force what the bank brings next is dealt by the plan as it now is - also where the next month's window has moved
  const C8 = ms('2026-08-01T08:00:00Z'), r1b = filed('r1', '2026-10-06', -1000, 'mika', '', { b: 'Barclays', at: ms('2026-10-07T18:00:00Z') });
  const Lnw = ledP({ tx: [r1b, reach('Wise', '2026-10-01', 'GBP', ms('2026-10-02T18:00:00Z')), reach('Barclays', '2026-10-06', 'GBP', ms('2026-10-07T18:00:00Z'))] });
  const Lnw1 = ledP({ tx: Lnw.tx.slice(-3).concat([filed('r2', '2026-10-12', -1500, 'mika', '', { b: 'Barclays', at: ms('2026-10-13T18:00:00Z') }), reach('Barclays', '2026-10-12', 'GBP', ms('2026-10-13T18:00:00Z'))]) });
  let Qnw = await press(Lnw, plan(every('wS', 3000, 28, '2026-08', { c0: C8 })), 'wS@2026-09');
  const Mnw = await C(Lnw, Qnw, D);
  Qnw = await tap(Lnw, Qnw, 'wS@2026-10', 'set', { date: '2026-10-14' }, LATER, BY);
  const Mnw1 = await C(Lnw, Qnw, D), Mnw2 = await C(Lnw1, Qnw, D);
  same([st(Mnw, 'wS@2026-09'), moved(Mnw1, Mnw), st(Mnw1, 'wS@2026-09'), st(Mnw2, 'wS@2026-09'), st(Mnw2, 'wS@2026-10'), round2(Mnw2.marksGbp - Mnw1.marksGbp)], [['mark', 1000, ['r1']], [0, 0, 0], ['mark', 1000, ['r1']], ['mark', 1000, ['r1']], ['due', 1500, ['r2']], 0],
    'September of a monthly withdrawal marked, holding a row of 6 October; October\'s day moved from the 28th to the 14th, so that the row would be October\'s: September holds it. A statement then brings a taking of the 12th: by the plan as it now is that is October\'s early taking, and October takes it - the marked month\'s memory holds what it held, and claims nothing new');
  // ---- the fifth independent reading ----
  // A repeat left with one month is a row again, and the month of a mark that was moved into the next calendar month
  // is another: it is still that mark. October's month, moved to 2 November and marked, holds a row of the 5th; a row
  // of the 19th stands in November's. «Удалить … и дальше» said of November leaves a plain row with a wider window.
  const T5 = '2026-11-20', Lfl = ledP({ tx: [filed('r1', '2026-11-05', -1000, 'mika', '', { b: 'Barclays', at: ms('2026-11-06T18:00:00Z') }), filed('r2', '2026-11-19', -2500, 'mika', '', { b: 'Barclays', at: ms('2026-11-19T18:00:00Z') }), reach('Wise', '2026-11-01', 'GBP', ms('2026-11-02T18:00:00Z'))] });
  const wFl = every('wF', 5000, 28, '2026-10', { c0: C8 });
  wFl.rec.x = { '2026-10': { date: '2026-11-02' } };
  const Qfl = await edit(Lfl, plan(wFl), async (X) => wr(X, 'mark', item(await C(Lfl, X, T5), 'wF@2026-10'), T5, ms('2026-11-20T10:00:00Z'), BY), T5), Mfl = await C(Lfl, Qfl, T5);
  for (const [how, f] of [['«Удалить … и дальше» said of November', (X) => wr(X, 'end', item(Mfl, 'wF@2026-11'))], ['«каждый месяц» taken off October', (X) => wr(X, 'untick', item(Mfl, 'wF@2026-10'))]]) {
    const X = await edit(Lfl, Qfl, f, T5), M1 = await C(Lfl, X, T5), one = M1.items.find((it) => it.wd && it.date === '2026-11-02');
    same([st(Mfl, 'wF@2026-10'), st(Mfl, 'wF@2026-11'), [one.id, one.done.by, one.wd.got, one.rows, one.wd.to], moved(M1, Mfl), !none(X)], [['mark', 1000, ['r1']], ['due', 2500, ['r2']], ['wF', 'mark', 1000, ['r1'], '2026-11-22'], [0, 0, 0], true],
      `a marked month of a repeat, moved into November; ${how}: the repeat is a row again, with a window that reaches the row of the 19th - it is the same mark, it holds the 1,000 it held, and «Денег сейчас» does not move`); }
  // The marked month's own sum made smaller from an earlier month's card, and put back: that is said of the marked
  // month too, so it is dealt by the walk both times - it holds less while the sum is smaller, and what it held
  // when the sum is back.
  const T6 = '2026-10-20', Lsm = ledP({ tx: [filed('r1', '2026-10-19', -3000, 'mika', '', { b: 'Barclays', at: ms('2026-10-19T18:00:00Z') }), reach('Wise', '2026-10-10', 'GBP', ms('2026-10-10T18:00:00Z'))] });
  const Qsm = await edit(Lsm, plan(every('wQ', 5000, 28, '2026-09', { c0: C8 })), async (X) => wr(X, 'mark', item(await C(Lsm, X, T6), 'wQ@2026-10'), T6, ms('2026-10-20T10:00:00Z'), BY), T6), Msm = await C(Lsm, Qsm, T6);
  const octOf = (M) => { const it = M.items.find((x) => x.wd && x.occ && x.occ.ym === '2026-10'); return [it.done.by, it.wd.got, it.rows, it.amt]; }, sepOf = (M) => M.items.find((x) => x.wd && x.occ && x.occ.ym === '2026-09');
  const Qsm1 = await edit(Lsm, Qsm, (X) => wr(X, 'onward', sepOf(Msm), { amt: 2000 }, 'wQ2', ms('2026-10-20T11:00:00Z'), BY), T6), Msm1 = await C(Lsm, Qsm1, T6);
  const Qsm2 = await edit(Lsm, Qsm1, (X) => wr(X, 'onward', sepOf(Msm1), { amt: 5000 }, 'wQ3', ms('2026-10-20T11:05:00Z'), BY), T6), Msm2 = await C(Lsm, Qsm2, T6);
  same([octOf(Msm), octOf(Msm1), round2(Msm1.now - Msm.now), octOf(Msm2), moved(Msm2, Msm), none(Qsm2)], [['mark', 3000, ['r1'], 5000], ['row', 2000, ['r1'], 2000], 2000, ['mark', 3000, ['r1'], 5000], [0, 0, 0], true],
    'October of a monthly 5,000 marked, holding a row of 3,000. «Сентябрь и дальше: 2,000» makes October 2,000 too: rows carry it whole, and the mark is worth nothing. «Сентябрь и дальше: 5,000»: October holds the 3,000 again and its mark is worth 2,000 - every figure as before the two changes, and no memory left');
  // A change that puts one mark inside its account's balance deals nothing over: it asks no memory of the others
  let Qtw = await press(La, plan(w('wB', 3000, '2026-10-12'), w('wK', 2000, '2026-10-14', { bank: 'Barclays' })), 'wB');
  Qtw = await press(La, Qtw, 'wK', MARK + 1);
  const Mtw = await C(La, Qtw, D), Qtw1 = await edit(La, Qtw, (X) => ({ ...X, banks: X.banks.map((b) => (b.bank === 'Barclays' && b.cur === 'GBP' ? { ...b, asOf: D, at: LATER } : b)) })), Mtw1 = await C(La, Qtw1, D);
  same([st(Mtw, 'wB'), [item(Mtw, 'wK').mark.counts, 'saw' in item(Mtw, 'wK')], st(Mtw1, 'wB'), [item(Mtw1, 'wK').mark.counts, 'saw' in item(Mtw1, 'wK')], none(Qtw1)], [['mark', 2000, ['m1']], [true, true], ['mark', 2000, ['m1']], [false, false], true],
    'two marked withdrawals on two banks; the balance of the second one\'s account is typed: its mark is inside the balance now and counts for nothing - no row was dealt over, no window moved, and the plan is left without a memory: the first mark is counted as it always was');
  // seeing that failed (no list) keeps nothing and takes nothing out; a list that is empty takes the memories out
  same([await keep(La, Qb1, null), none(await keep(La, Qb1, []))], [Qb1, true], 'a seeing that failed leaves the plan\'s memories as they are; one that saw no withdrawal waiting takes them out');

  // ---- on the screen ----
  // Mika took 2,000 and 500 today. The first closes the row called «Вывод Vanya», the 500 stands in October of «Вывод».
  const LS = ledP({ tx: [filed('m1', '2026-10-06', -2000, 'mika', '', { at: AT2 }), filed('m2', '2026-10-06', -500, 'mika', '', { at: AT2 })] });
  const PS = { ...P, div: P.div.concat([row('wA', 'Вывод Vanya', 2000, '2026-10-06', { blk: 'div' }), row('wB', 'Вывод', 3000, '2026-10-07', { blk: 'div', rec: { day: 7, from: '2026-10' } })]) };
  let pg = await scene('wdmark', LS, PS);
  const now = () => pg.evaluate(() => window.__money.model({ H: 30 }).now);
  const kept = () => pg.evaluate(() => { const r = window.__cash.state().div.find((x) => x.id === 'wB'), p = r.rec.x && r.rec.x['2026-10'] && r.rec.x['2026-10'].paid; return [r.whose || '', p ? Object.keys(p).sort() : null, p && p.saw ? [p.saw.w || '', p.saw.from, p.saw.to, p.saw.rows.map((x) => x[1])] : null]; });
  const rowsOf = (id) => pg.evaluate((id) => { const it = window.__money.model({ H: 30 }).items.find((x) => x.id === id); return it ? [it.done ? it.done.by : it.state, it.wd.got, it.rows] : null; }, id);
  const choose = async (kind, id, v, k) => { await rowCard(pg, kind, id); await pg.selectOption(K('row') + '[data-ed-f="whose"]', v); await pg.click(K('row') + '[data-ed-save]'); await puts('cash', k); };
  const n0 = await now();
  await goCash(pg);
  await rowDo(pg, 'div', 'wB@2026-10', 'paid');
  await puts('cash', 1);
  const n1 = await now();
  same([round2(n1 - n0), await kept(), await rowsOf('wB@2026-10'), await toastText(pg)], [-2500, ['', ['at', 'by', 'on'], null], ['mark', 500, ['m2']], 'Оплачено: Вывод'], '«Оплачено» pressed on October of «Вывод»: the 2,500 nobody has seen leaves «Денег сейчас»; the mark stored in the month is the three words it always was');
  await choose('div', 'wA', 'vanya', 2);
  same([round2((await now()) - n1), await toastText(pg), await rowsOf('wA'), await rowsOf('wB@2026-10'), await kept()], [0, 'Вывод Vanya: вывод Vanya', ['due', 0, []], ['mark', 500, ['m2']], ['', ['at', 'by', 'on', 'saw'], ['', '2026-09-27', '2026-10-27', [0, 500]]]], 'the closed row «Вывод Vanya» given to Vanya: Mika\'s 2,000 leaves it and goes nowhere near the marked month - the save gave the mark its memory: 0 of the first taking, 500 of the second; «Денег сейчас» has not moved, and the toast has nothing to say of it');
  await holds(pg, 'with a marked withdrawal beside one that changed hands', 'cash');
  // a reload reads the memory back as it was stored - in a month of a repeating row - and saves nothing
  await pg.context().close();
  pg = await reopen('wdmark, again');
  same([await now(), (await kept())[2], await rowsOf('wB@2026-10'), store.cash.puts], [n1, ['', '2026-09-27', '2026-10-27', [0, 500]], ['mark', 500, ['m2']], 2], 'the page opened again: the same «Денег сейчас», the same memory, and no save of its own');
  await goCash(pg);
  await choose('div', 'wA', '', 3);
  same([round2((await now()) - n1), await rowsOf('wA'), await kept()], [0, ['row', 2000, ['m1']], ['', ['at', 'by', 'on'], null]], 'the row made everybody\'s again: Mika\'s 2,000 closes it as before, the walk gives the marked month what it holds, and the save takes the memory out of the plan');
  await pg.click('#cs-undo [data-cs-undo]');
  await puts('cash', 4);
  same([round2((await now()) - n1), await rowsOf('wA'), await rowsOf('wB@2026-10'), (await kept())[2]], [0, ['due', 0, []], ['mark', 500, ['m2']], ['', '2026-09-27', '2026-10-27', [0, 500]]], '«Отменить»: the plan is the one it was before that save - the row is Vanya\'s, and the mark has its memory back');
  await choose('div', 'wB@2026-10', 'misha', 5);
  const n3 = await now();
  same([round2(n3 - n1), await toastText(pg), await kept(), await rowsOf('wB@2026-10')], [-500, `Вывод: вывод Misha — для всех месяцев · «Денег сейчас» теперь £${Math.round(n3).toLocaleString('en-GB')}: пересчитана отметка «Оплачено» на выводе`, ['misha', ['at', 'by', 'on'], null], ['mark', 0, []]],
    'the marked month itself given to Misha: that is the founder\'s word about this line - Mika\'s 500 is not Misha\'s, the mark covers it, «Денег сейчас» is 500 lower, and the toast names the figure and says why; no memory holds against it');
  ok(await saved(pg), 'what the page holds is what was saved');
  await pg.context().close();
  pg = await scene('wdmark, next month', LS, PS);
  await goCash(pg);
  await rowDo(pg, 'div', 'wB@2026-10', 'paid');
  await puts('cash', 1);
  const o1 = await now();
  await pg.click('#cs-month [data-cs-mon="1"]');
  await rowCard(pg, 'div', 'wB@2026-11');
  await pg.selectOption(K('row') + '[data-ed-f="whose"]', 'misha');
  await pg.click(K('row') + '[data-ed-save="only"]');
  await puts('cash', 2);
  const o2 = await now();
  same([round2(o2 - o1), (await toastText(pg)).includes(`«Денег сейчас» теперь £${Math.round(o2).toLocaleString('en-GB')}: пересчитана отметка «Оплачено» на выводе`)], [-500, true], '«Чей вывод» said in November\'s card gives every month to Misha, the marked October too: «Денег сейчас» is 500 lower, and the toast of that card names the figure');
  await pg.context().close();

  // The page's own hand (Plan.edit, and a keystroke in a row of «Касса»), with news in the table: «Вывод A» 4,000
  // on the 5th holds Mika's 1,000 and - uploaded an hour after «Вывод B» was marked - his 2,500.
  const NEWS = AT2 + 3600e3, a1 = filed('m1', '2026-10-05', -1000, 'mika', '', { at: AT2 }), a2 = filed('n1', '2026-10-06', -2500, 'mika', '', { at: NEWS });
  const L0 = ledP({ tx: [a1] }), L1 = ledP({ tx: [a1, a2] });
  let QN = { ...P, div: P.div.concat([row('wA', 'Вывод A', 4000, '2026-10-05', { blk: 'div' }), row('wB', 'Вывод B', 3000, '2026-10-06', { blk: 'div' })]) };
  QN = await wr(QN, 'mark', item(await C(L0, QN, T), 'wB'), T, TAP, BY);
  const memB = () => pg.evaluate(() => { const r = window.__cash.state().div.find((x) => x.id === 'wB'); return r && r.paid && r.paid.saw ? r.paid.saw.rows.map((x) => x[1]) : null; });
  pg = await scene('wdmark, news', L1, QN);
  const e0 = await now();
  same([store.cash.puts, await rowsOf('wA'), await rowsOf('wB'), await memB()], [0, ['waiting', 3500, ['m1', 'n1']], ['mark', 0, []], null], 'opened with news in the table: nothing is saved by the opening, the news stands in the open earlier withdrawal, and the plan holds no memory');
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  await puts('cash', 1);
  same([round2((await now()) - e0), await rowsOf('wB'), await memB(), store.cash.puts], [0, ['mark', 0, []], [0, 0], 1], '«Вывод A» deleted on the page: the rows lie where they lay - not in the marked withdrawal - and «Денег сейчас» has not moved; the one save carries the memory');
  await pg.click('#cs-undo [data-cs-undo]');
  await puts('cash', 2);
  same([round2((await now()) - e0), await rowsOf('wA'), await rowsOf('wB'), await memB()], [0, ['waiting', 3500, ['m1', 'n1']], ['mark', 0, []], null], '«Отменить»: the withdrawal is back with its rows, and the plan holds no memory again');
  await rowDo(pg, 'div', 'wA', 'del');
  await puts('cash', 3);
  await pg.context().close();
  pg = await reopen('wdmark, news, again');
  same([await memB(), round2((await now()) - e0), await rowsOf('wB'), store.cash.puts], [[0, 0], 0, ['mark', 0, []], 3], 'deleted again, and the page opened again: the memory on a row of its own is read back as it was stored, and nothing is saved by the opening');
  await pg.context().close();
  // The table changes under a memory - a transfer of 2,500 sorted out of «Разбор» - between two things done to the plan.
  const Lu = ledP({ tx: [a1], inb: [inbox('u1', '2026-10-06', -2500, 'mika', '', { at: NEWS, auto: false })] });
  const sortU = async () => { await pg.click('.nav [data-tab="inbox"]'); await pg.click('#view-inbox .op[data-id="u1"] [data-accept]'); for (let i = 0; i < 80 && !store.led.doc.tx.some((r) => r.id === 'u1'); i++) await sleep(50); };
  const cushion = async (v) => { await pg.click('.nav [data-tab="settings"]'); await pg.waitForSelector('#ed-forecast [data-ed-set="cushion"]'); await pg.fill('#ed-forecast [data-ed-set="cushion"]', v); await pg.press('#ed-forecast [data-ed-set="cushion"]', 'Tab'); await sleep(1300); return store.cash.puts; };
  pg = await scene('wdmark, a transfer', Lu, QN);
  const u0 = await now(), c0 = await cushion('5000.0');
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  await puts('cash', 1);
  const c1 = await cushion('5000.00'), uA = await now();
  await sortU();
  const uB = await now(), heldB = await rowsOf('wB'), c2 = await cushion('5000.000'), m2 = await memB();
  same([c0, c1, c2, m2, round2(uA - u0), round2(uB - uA), heldB], [0, 1, 1, [0], 0, 2500, ['mark', 2500, ['u1']]], 'the cushion typed again as the same number saves nothing - with no memory in the plan, with one, and with one after the table has changed (the memory is left as it was written); the transfer, sorted, is news and takes the mark\'s place');
  await pg.context().close();
  pg = await scene('wdmark, undone', Lu, QN);
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  await puts('cash', 1);
  await sortU();
  const uC = await now();
  await goCash(pg);
  await pg.click('#cs-undo [data-cs-undo]');
  await puts('cash', 2);
  same([round2((await now()) - uC), await rowsOf('wA'), await rowsOf('wB'), await memB()], [-2500, ['waiting', 3500, ['m1', 'u1']], ['mark', 0, []], null], '«Отменить» of the delete, after the transfer was sorted: the plan is put back as it was - the withdrawal, and no memory - and what the table has brought since is dealt against that plan: the transfer is the open withdrawal\'s, and «Денег сейчас» is 2,500 lower («Отменить» neither sees nor keeps)');
  await pg.context().close();
  // a second typing, after the table has changed, sees the table as it then lies
  pg = await scene('wdmark, two typings', Lu, QN);
  await goCash(pg);
  await pg.fill(box('div', 'wA', 'amt'), '3600');
  await puts('cash', 1);
  await leave(pg);
  await sortU();
  const y1 = await now(), ya = await rowsOf('wA');
  await goCash(pg);
  await pg.fill(box('div', 'wA', 'amt'), '2000');
  await puts('cash', 2);
  await leave(pg);
  same([ya, round2((await now()) - y1), await rowsOf('wA'), await rowsOf('wB'), await memB()], [['waiting', 3500, ['m1', 'u1']], 0, ['row', 2000, ['m1', 'u1']], ['mark', 0, []], [0, 0]], '«Вывод A» typed to 3,600; a transfer of 2,500 sorted out of «Разбор» goes into it; typed down to 2,000: the 1,500 it no longer holds is not dealt into the marked withdrawal - the second typing saw the table as it lay then');
  await pg.context().close();
  pg = await scene('wdmark, a keystroke', L1, QN);
  const t0 = await now();
  await goCash(pg);
  await pg.fill(box('div', 'wA', 'amt'), '2000');
  await puts('cash', 1);
  same([round2((await now()) - t0), await rowsOf('wA'), await rowsOf('wB'), await memB()], [0, ['row', 2000, ['m1', 'n1']], ['mark', 0, []], [0, 0]], '«Вывод A» typed down to 2,000 in its row: the 1,500 of the news it no longer holds is not dealt into the marked withdrawal, and «Денег сейчас» has not moved');
  const shown = () => pg.evaluate((sel) => [document.querySelector('#cs-sec-div [data-cs-tot]'), document.querySelector(sel), document.querySelector('#cs-cov')].map((e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '')), cs('div', 'wB'));
  const typed = await shown();
  await leave(pg);
  same(typed, await shown(), 'what «Касса» shows straight after the keystroke - the total of «Дивиденды», the marked row, the cover - is what it shows once the cursor has left: the screen was drawn from the plan as kept');
  await pg.click('#cs-undo [data-cs-undo]');
  await puts('cash', 2);
  same([round2((await now()) - t0), await rowsOf('wA'), await memB()], [0, ['waiting', 3500, ['m1', 'n1']], null], '… and «Отменить»: the sum is 4,000 again, the rows are where the walk has them, and the memory is gone from the plan');
  await pg.context().close();
  // «Что если» asks of a copy of the plan, changed as the page changes the plan: a trial says what the page would
  // say of the plan written so. Mika's 1,200 came after the mark and stands in October of the monthly withdrawal;
  // tried at 1,500, that month has 700 of it over.
  const LW0 = ledP({ tx: [mika('m1', '2026-10-09', 1000)] }), LW = ledP({ tx: [mika('m1', '2026-10-09', 1000), mika('n1', '2026-10-11', 1200, LATER)] });
  const QW = await press(LW0, plan(every('wA', 2500, 8, '2026-10'), w('wB', 3000, '2026-10-12')), 'wB'), MW = await C(LW, QW, D);
  const tried = await C(LW, await tap(LW, QW, 'wA@2026-10', 'set', { amt: 1500 }, LATER, BY), D);
  pg = await scene('wdmark, a trial', LW, QW);
  const t = await pg.evaluate(() => window.__money.whatIf([{ k: 'draw', row: 'wA', amt: 1500, from: '2026-10' }]));
  same([st(MW, 'wA@2026-10'), st(MW, 'wB'), t && t.skipped.length, t && round2(t.trial.now - t.plan.now), round2(tried.now - MW.now), store.cash.puts, await memB()], [['waiting', 2200, ['m1', 'n1']], ['mark', 0, []], 0, 0, 0, 0, null],
    'a trial of «выводим другую сумму» on the withdrawal beside a marked one: «Денег сейчас» of the trial is the plan\'s, as it is when a founder writes that sum - the 700 the smaller month no longer holds is not dealt into the marked withdrawal; nothing is saved, and the plan itself is given no memory');
  await pg.context().close();
});

await run('rv-oldtable', 'a window whose table is older than the stand\'s does not change the plan: the stand refuses the save, the window says so, and neither a marked withdrawal nor «Денег сейчас» moves', async () => {
  // 13 October 2026, the limit the rule of that day left («Страница с устаревшей таблицей»): the plan is changed by
  // the table - what a marked withdrawal holds is seen before a change and kept after it - and the table and the
  // plan are two documents with two revisions. A window opened before another founder sorted a transfer saw and kept
  // by the table it had: the transfer, which it did not know, was dealt over by its change, and «Денег сейчас» moved
  // for everybody with nothing new from the bank. Here: «Вывод A» 4,000 on the 5th holds Mika's 1,000; «Вывод B»
  // 3,000 on the 6th is marked «Оплачено»; a transfer of Mika's 2,500 waits in «Разбор».
  const P = await plan2(), NEWS = AT2 + 3600e3, a1 = filed('m1', '2026-10-05', -1000, 'mika', '', { at: AT2 });
  const Lu = ledP({ tx: [a1], inb: [inbox('u1', '2026-10-06', -2500, 'mika', '', { at: NEWS, auto: false })] });
  let QN = { ...P, div: P.div.concat([row('wA', 'Вывод A', 4000, '2026-10-05', { blk: 'div' }), row('wB', 'Вывод B', 3000, '2026-10-06', { blk: 'div' })]) };
  QN = await wr(QN, 'mark', item(await C(ledP({ tx: [a1] }), QN, T), 'wB'), T, TAP, BY);
  const now = (pg) => pg.evaluate(() => window.__money.model({ H: 30 }).now);
  const rowsOf = (pg, id) => pg.evaluate((id) => { const it = window.__money.model({ H: 30 }).items.find((x) => x.id === id); return it ? [it.done ? it.done.by : it.state, it.wd.got, it.rows] : null; }, id);
  const mem = (D) => { const r = D.div.find((x) => x.id === 'wB'); return r && r.paid && r.paid.saw ? r.paid.saw.rows.map((x) => x[1]) : null; };
  const divs = (D) => D.div.filter((r) => /^w[AB]$/.test(r.id)).map((r) => r.id);
  const said = async (pg) => [await pg.isVisible('#ledLost'), (await pg.isVisible('#ledLost')) ? await text(pg, '#ledLostHead') : '', await toastText(pg), await text(pg, '#sync')];
  const BEHIND = 'Не сохранено: таблица изменилась в другом окне — обновите страницу';
  const sort = async (pg) => { await pg.click('.nav [data-tab="inbox"]'); await pg.click('#view-inbox .op[data-id="u1"] [data-accept]'); };
  // The page read again, whichever tab its address names.
  const read = (pg) => pg.waitForFunction(() => !document.querySelector('#sync').textContent.includes('загружаю') && window.__cash && window.__cash.state() && window.__money.by === 'Mika');

  // two founders open the page on the same pair of documents (the browser itself reports the refusal to come)
  serve(Lu, QN);
  const mine = await open('an older table', undefined, { quiet: /409/ });
  await mine.waitForSelector('#view-today [data-live="verdict"]');
  const theirs = await reopen('the other founder');
  const led0 = store.led.rev, plan0 = store.cash.rev;
  // … and the other one sorts the transfer out of «Разбор»: the table on the stand moves on (the row filed, then
  // «Разбор» without it - two saves of the table)
  await sort(theirs);
  const ledPuts = await puts('led', 2), led1 = store.led.rev;
  const Lnew = JSON.parse(JSON.stringify(store.led.doc)), n0 = await now(theirs);
  same([ledPuts, led1 - led0, Lnew.tx.some((r) => r.id === 'u1'), await rowsOf(theirs, 'wA'), await rowsOf(theirs, 'wB'), await rowsOf(mine, 'wA'), await mine.isHidden('#ledLost')], [2, 2, true, ['waiting', 3500, ['m1', 'u1']], ['mark', 0, []], ['waiting', 1000, ['m1']], true],
    'the other founder sorts the transfer: in their window it stands in the open withdrawal; the first window still holds the table as it was, and nothing has told it so');
  // the first window deletes «Вывод A» - by the table it holds, which knows nothing of the transfer
  await goCash(mine);
  await rowDo(mine, 'div', 'wA', 'del');
  await puts('cash', 1);
  await mine.waitForSelector('#ledLost:not([hidden])');
  const refused = await mine.evaluate(() => JSON.parse(JSON.stringify(window.__cash.state())));
  same([store.cash.puts, store.cash.behind, store.cash.named, store.cash.rev - plan0, divs(store.cash.doc), mem(store.cash.doc)], [1, 1, [led0], 0, ['wA', 'wB'], null],
    'its save of the plan names the table it was worked out against - the older revision - and the stand does not take it: the plan there is what it was, «Вывод A» and all, at the revision it had');
  same(await said(mine), [true, 'Таблица изменилась в другом окне.', BEHIND, 'таблица изменилась в другом окне — обновите страницу'],
    'the window says so where it cannot be missed: the band over every tab, «Не сохранено: …» in place of the «Удалено» it had just answered, and the pill');
  await shot(mine, 'rv-oldtable');
  // what that save would have done, had the stand taken it (a page from before the rule names no table, and is taken)
  const kept = await C(Lnew, QN, T), dealt = await C(Lnew, refused, T);
  same([divs(refused), mem(refused), round2(dealt.now - kept.now), [(item(dealt, 'wB').done || {}).by, item(dealt, 'wB').wd.got, item(dealt, 'wB').rows]], [['wB'], [0], 2500, ['mark', 2500, ['u1']]],
    '(the plan it would have saved keeps by the one row that window knew; against the table as the stand has it the transfer is dealt into the marked withdrawal, and «Денег сейчас» is 2,500 higher with nothing new from the bank - the fault this refusal stops)');
  // nothing more is changed in that window: a press is refused where it is made, and sends nothing
  const typedInto = (await listed(mine, 'team'))[0];
  await mine.fill(box('team', typedInto, 'amt'), '6100');
  await sleep(900);
  same([await toastText(mine), store.cash.puts, store.led.puts], [BEHIND, 1, 2], 'a sum typed into a row of that window afterwards is refused in the same words, and no save is sent - of the plan or of the table');
  // the other founder's window, read again, is what it was
  await theirs.reload();
  await read(theirs);
  same([round2((await now(theirs)) - n0), await rowsOf(theirs, 'wA'), await rowsOf(theirs, 'wB'), await theirs.isHidden('#ledLost')], [0, ['waiting', 3500, ['m1', 'u1']], ['mark', 0, []], true],
    'the other founder\'s window, opened again: «Денег сейчас», the open withdrawal with the transfer in it and the marked one are what they were');
  // [Обновить страницу] reads the table again; the same delete is then worked out against it, and is taken
  const loaded = mine.waitForEvent('load');
  await mine.click('#ledReload');
  await loaded;
  await read(mine);
  const m0 = await now(mine);
  same([await mine.isHidden('#ledLost'), round2(m0 - n0), await rowsOf(mine, 'wA')], [true, 0, ['waiting', 3500, ['m1', 'u1']]], '[Обновить страницу]: the band is gone, and the first window holds the table and the plan as the stand has them');
  await goCash(mine);
  await rowDo(mine, 'div', 'wA', 'del');
  await puts('cash', 2);
  same([store.cash.behind, store.cash.named, store.cash.rev - plan0, divs(store.cash.doc), mem(store.cash.doc), round2((await now(mine)) - m0), await rowsOf(mine, 'wB'), await toastText(mine)], [1, [led0, led1], 1, ['wB'], [0, 0], 0, ['mark', 0, []], 'Удалено: Вывод A'],
    '«Вывод A» deleted again: the save names the table of today and is taken; the mark remembers that neither row was its own, and «Денег сейчас» has not moved');
  await theirs.reload();
  await read(theirs);
  same([round2((await now(theirs)) - n0), await rowsOf(theirs, 'wB')], [0, ['mark', 0, []]], '… nor has it for the other founder, who reads the plan again: the marked withdrawal holds what it held');
  await theirs.context().close();
  await finish(mine);

  // A window that saves the table itself is not behind: the plan waits for the answer to that save, and names the
  // revision the answer brings. The stand answers the table's save late here, so the plan's half second runs out first.
  let pg = await scene('the table and the plan in one breath', Lu, QN, { H: 30 });
  const led2 = store.led.rev;
  store.led.slow = 900;
  await sort(pg);
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  await puts('led', 2);
  await puts('cash', 1);
  same([store.led.puts, store.led.rev - led2, store.cash.puts, store.cash.named, store.cash.behind, await pg.isHidden('#ledLost'), divs(store.cash.doc), await toastText(pg)], [2, 2, 1, [led2 + 2], 0, true, ['wB'], 'Удалено: Вывод A'],
    'a transfer sorted and a withdrawal deleted in one breath, the table\'s saves answered late: the plan is sent once, after those answers, names the revision they brought, and is taken');
  store.led.slow = 0;
  await finish(pg);
  // … and the other way about: the plan's save is on its way when the window saves its table, and the table's save
  // reaches the stand first. The stand refuses the plan - the number it names is old - and the window, which knows
  // the save that moved the table for its own, sends the plan again and says nothing.
  serve(Lu, QN);
  pg = await open('the table overtakes the plan', undefined, { quiet: /409/ });
  await read(pg);
  const led3 = store.led.rev;
  store.cash.holdFor = led3 + 2;
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  for (let i = 0; i < 80 && !store.cash.got; i++) await sleep(50);
  await sort(pg);
  await puts('cash', 2);
  same([store.cash.got, store.cash.named, store.cash.behind, store.led.rev - led3, await pg.isHidden('#ledLost'), divs(store.cash.doc), await text(pg, '#sync')], [2, [led3, led3 + 2], 1, 2, true, ['wB'], 'сохранено'],
    'a withdrawal deleted, and a transfer sorted while that save is on its way: the stand refuses the plan once, the window sends it again with the table\'s new revision, and no band says that anybody else changed anything');
  store.cash.holdFor = 0;
  await finish(pg);

  // A window that has learnt it from its own save of the table - the save was refused - changes no plan either: the
  // band it shows says «больше не сохраняется», and until 13 October 2026 that was not true of the plan.
  serve(Lu, QN);
  pg = await open('a window told by its table', undefined, { quiet: /409/ });
  await read(pg);
  store.led.rev++;
  await sort(pg);
  await pg.waitForSelector('#ledLost:not([hidden])');
  await goCash(pg);
  await rowDo(pg, 'div', 'wA', 'del');
  await sleep(900);
  same([await toastText(pg), store.cash.puts, divs(store.cash.doc), await pg.evaluate(() => window.__cash.state().div.some((r) => r.id === 'wA'))], [BEHIND, 0, ['wA', 'wB'], true],
    'a window whose own save of the table was refused: «Удалить» on a withdrawal is refused where it is pressed, in the band\'s own words - the plan in the window is not changed, and no save of it is sent');
  await pg.context().close();

  // A reader's window sends no save at all, so it names nothing; and the laptop's little server is sent no such member
  // (that page is not on a `finance.` host, and this file has no stand-in for it: the body is read off the page).
  const src = fs.readFileSync(PUB + '/money/index.html', 'utf8');
  const disk = /fetch\("\/api\/cash",\{method:"PUT"[^\n]*?body:JSON\.stringify\(Object\.assign\(docOf\(\),\{base:rev\}\)\)\}\)/.test(src), beacon = /sendBeacon\("\/api\/cash",new Blob\(\[JSON\.stringify\(Object\.assign\(docOf\(\),\{base:rev\}\)\)\]/.test(src);
  same([disk, beacon, (src.match(/ledger:S\.rev/g) || []).length], [true, true, 1], 'the plan as the laptop tool is sent it - the document with `base` in it, and nothing else - is what it was: the table\'s revision is named in one place, the body for the stand');
});

// The rule of 13 October 2026 for the takings of a balance's own day. A statement row dated on the very day a
// balance was typed for is inside that balance or after it by the mark whose place it took - for a founder's
// taking, by the marked withdrawal that holds it; and which withdrawal holds a taking is the walk's to say, so a
// change to ANOTHER line could move such a row to another line, and «Денег сейчас» by the whole row, with nothing
// new from the bank. The marks that hold a memory by the rule above (rv-wdmark) are the ones that can count; these
// rows belong to marks that cannot - a line ticked in «Что из этого уже прошло?», a mark whose day the statements
// have passed. Now the page sees what every marked withdrawal holds of the takings of a balance's day, and keeps
// it: a memory that is not in force holds for those takings, and for nothing else.
await run('rv-wdday', 'a founder\'s row dated on the very day a balance was typed for stays inside that balance, or after it, through a change to another line of the plan - both ways; the founder\'s own word about the marked line, and a balance typed anew, are read by the walk; a plan with no such row holds no memory and is counted as before', async () => {
  const D = '2026-10-13', YD = '2026-10-12', AT = ms(D + 'T08:00:00Z'), UP = ms(D + 'T16:00:00Z'), LATER = ms(D + 'T17:00:00Z');
  const w = (id, amt, date, more = {}) => row(id, 'Вывод ' + id, amt, date, { blk: 'div', c0: AT1, ...more });
  const plan = (amt, asOf, ...rows) => plan3({ banks: [bal('Wise', 'GBP', amt, asOf, { at: AT })], div: rows });
  const tick = { on: D, at: AT - 1, by: BY };   // what «Что из этого уже прошло?» writes: a mark a moment before the balance
  const vanya = (id, d, amt, at = UP) => filed(id, d, -amt, 'vanya', '', { at }), misha = (id, d, amt, at = UP) => filed(id, d, -amt, 'misha', '', { at });
  const st = (M, id) => { const it = item(M, id); return it ? [it.done ? it.done.by : it.state, it.wd.got, it.rows] : null; };
  const end = (M) => M.days[M.days.length - 1].e;
  const see = (L, Q, day = D) => page.evaluate(([p, l, d]) => window.__money.write.see(p, l, d), [Q, L, day]);
  const keep = (L, Q, seen, day = D) => page.evaluate(([p, l, d, k]) => { window.__money.write.keep(p, l, d, k); return p; }, [Q, L, day, seen]);
  // a change as the PAGE makes it (Plan.edit: see, change, keep); a bare `wr` is a page from before the rule
  const edit = async (L, Q, f, day = D) => { const seen = await see(L, Q, day); return keep(L, await f(Q), seen, day); };
  const tap = async (L, Q, id, verb, ...a) => { const it = item(await C(L, Q, D), id); return edit(L, Q, (X) => wr(X, verb, it, ...a)); };
  const memOf = (Q, id) => { const r = Q.div.find((x) => x.id === id); return r && r.paid && r.paid.saw ? r.paid.saw.rows.map((x) => [x[1], x.length > 2 ? x[2] : '']) : null; };
  const none = (Q) => !JSON.stringify(Q).includes('"saw"');
  const bare = (M) => JSON.stringify({ ...M, items: M.items.map(({ saw, sawDay, ...it }) => it) });
  const STAMP = `Wise|GBP|${D}|${AT}`;

  // ---- (a) too low: the ticked withdrawal holds Vanya's row, inside the balance; another line is given to Vanya ----
  const La = ledger([vanya('r1', D, 3000)]), Qa = plan(47000, D, w('wV', 3000, D, { paid: tick }), w('wM', 3000, '2026-10-15'));
  const Ma0 = await C(ledger([]), Qa, D), Ma = await C(La, Qa, D);
  same([Ma0.now, st(Ma0, 'wV'), item(Ma0, 'wV').mark.counts, Ma.now, st(Ma, 'wV'), st(Ma, 'wM'), acct(Ma, 'Wise|GBP').after, 'saw' in item(Ma, 'wV'), item(Ma, 'wV').sawDay.rows.map((x) => x.slice(1))], [47000, ['mark', 0, []], false, 47000, ['row', 3000, ['r1']], ['due', 0, []], 0, false, [[3000, STAMP]]],
    'the balance typed at 09:00 for today, Vanya\'s withdrawal ticked as already inside it; the evening\'s statement shows Vanya -3,000 dated today: the ticked line holds it, inside the balance - 47,000');
  const Qa1 = await tap(La, Qa, 'wM', 'set', { whose: 'vanya' }, LATER, BY), Ma1 = await C(La, Qa1, D), Mold = await C(La, await wr(Qa, 'set', item(Ma, 'wM'), { whose: 'vanya' }, LATER, BY), D);
  same([Ma1.now, end(Ma1) - end(Ma), st(Ma1, 'wV'), st(Ma1, 'wM'), memOf(Qa1, 'wV'), Mold.now, st(Mold, 'wM')], [47000, 0, ['row', 3000, ['r1']], ['due', 0, []], [[3000, STAMP]], 44000, ['row', 3000, ['r1']]],
    'the other line is given to Vanya: the row stays in the ticked withdrawal, inside the balance - 47,000, and the line that is now Vanya\'s still waits for its 3,000; the mark remembers the row of the day and the balance it was read against. (A page from before the rule took the row off again: 44,000)');
  const Qa2 = await tap(La, Qa1, 'wM', 'set', { whose: '' }, LATER + 1, BY), Ma2 = await C(La, Qa2, D);
  same([none(Qa2), bare(Ma2) === bare(Ma)], [true, true], '… and made everybody\'s again: the walk gives the ticked withdrawal what it holds, the plan holds no memory, and the model is the one it was');
  const Qa3 = await tap(La, Qa1, 'wV', 'unmark'), Ma3 = await C(La, Qa3, D), Qa4 = await tap(La, Qa1, 'wV', 'set', { whose: 'misha' }, LATER + 1, BY), Ma4 = await C(La, Qa4, D);
  same([Ma3.now, st(Ma3, 'wV'), none(Qa3), Ma4.now, st(Ma4, 'wV'), st(Ma4, 'wM'), none(Qa4)], [44000, ['due', 0, []], true, 44000, ['ok', 0, []], ['row', 3000, ['r1']], true],
    'the founder\'s own word about the ticked line is read by the walk: the tick taken off, or the line given to Misha - Vanya\'s row is that line\'s no longer, it is after the balance, and no memory holds against it');
  const Qa5 = await edit(La, Qa1, (X) => ({ ...X, banks: X.banks.map((b) => ({ ...b, amt: 44000, at: LATER })) })), Ma5 = await C(La, Qa5, D);
  same([none(Qa5), Ma5.now, acct(Ma5, 'Wise|GBP').after], [true, 44000, 0], 'the balance typed again in the evening: every row of the day is inside the new figure, and the memory of the old one goes out of the plan');
  same([canon(await keep(La, Qa1, await see(La, Qa1))) === canon(Qa1), none(await keep(La, Qa, await see(La, Qa)))], [true, true], 'seeing and keeping around no change at all: a memory is written again as it was, and a plan without one gets none');

  // ---- the mirror of (a): the row lies in Vanya's own line, after the balance; that line becomes everybody's ----
  const Qm = plan(47000, D, w('wV', 3000, D, { paid: tick }), w('wM', 3000, '2026-10-15', { whose: 'vanya' })), Mm = await C(La, Qm, D);
  const Qm1 = await tap(La, Qm, 'wM', 'set', { whose: '' }, LATER, BY), Mm1 = await C(La, Qm1, D), Mmold = await C(La, await wr(Qm, 'set', item(Mm, 'wM'), { whose: '' }, LATER, BY), D);
  same([Mm.now, st(Mm, 'wV'), st(Mm, 'wM'), Mm1.now, end(Mm1) - end(Mm), st(Mm1, 'wV'), st(Mm1, 'wM'), memOf(Qm1, 'wV'), Mmold.now], [44000, ['ok', 0, []], ['row', 3000, ['r1']], 44000, 0, ['ok', 0, []], ['row', 3000, ['r1']], [[0, STAMP]], 47000],
    'Vanya\'s row paid Vanya\'s own line and was counted after the balance - 44,000; that line made everybody\'s: the row does not go into the ticked withdrawal - the mark remembers it held none of it - and «Денег сейчас» stays. (Before the rule: 47,000)');

  // ---- (b) too high, silently: Misha's afternoon taking lies in his own line; that line is deleted ----
  const Lb = ledger([misha('r1', D, 2000)]), Qb = plan(50000, D, w('wS', 3000, D, { paid: tick }), w('wM', 2000, '2026-10-15', { whose: 'misha' })), Mb = await C(Lb, Qb, D);
  const Qb1 = await tap(Lb, Qb, 'wM', 'del'), Mb1 = await C(Lb, Qb1, D), Mbold = await C(Lb, await wr(Qb, 'del', item(Mb, 'wM')), D);
  same([Mb.now, st(Mb, 'wS'), st(Mb, 'wM'), acct(Mb, 'Wise|GBP').same, Mb1.now, end(Mb1) - end(Mb), st(Mb1, 'wS'), memOf(Qb1, 'wS'), Mbold.now, st(Mbold, 'wS')], [48000, ['ok', 0, []], ['row', 2000, ['r1']], -2000, 48000, 0, ['ok', 0, []], [[0, STAMP]], 50000, ['row', 2000, ['r1']]],
    'a shared line ticked, Misha\'s own line beside it; Misha takes 2,000 in the afternoon: his line holds it, after the balance - 48,000. His line is deleted: the row is not dealt into the ticked one, and 48,000 stays. (Before the rule the row went inside the balance: 50,000, with nothing new from the bank)');
  const Qb2 = await tap(Lb, Qb, 'wM', 'off'), Qb3 = await tap(Lb, Qb2, 'wM', 'on');
  same([(await C(Lb, Qb2, D)).now, memOf(Qb2, 'wS'), (await C(Lb, Qb3, D)).now, none(Qb3)], [48000, [[0, STAMP]], 48000, true], '… the same with that line switched off; switched on again, the walk gives each what it held and the memory goes');

  // ---- the mirror of (b): the ticked line holds Misha's row; another line becomes Misha's own ----
  const Qn = plan(50000, D, w('wS', 3000, D, { paid: tick }), w('wM', 2000, '2026-10-20', { whose: 'vanya' })), Mn = await C(Lb, Qn, D);
  const Qn1 = await tap(Lb, Qn, 'wM', 'set', { whose: 'misha' }, LATER, BY), Mn1 = await C(Lb, Qn1, D), Mnold = await C(Lb, await wr(Qn, 'set', item(Mn, 'wM'), { whose: 'misha' }, LATER, BY), D);
  same([Mn.now, st(Mn, 'wS'), Mn1.now, end(Mn1) - end(Mn), st(Mn1, 'wS'), st(Mn1, 'wM'), memOf(Qn1, 'wS'), Mnold.now], [50000, ['row', 2000, ['r1']], 50000, 0, ['row', 2000, ['r1']], ['due', 0, []], [[2000, STAMP]], 48000],
    'the ticked line holds Misha\'s 2,000, inside the balance - 50,000; another line is given to Misha: the row stays where it lay, and so does «Денег сейчас». (Before the rule: 48,000)');

  // ---- room is kept for the row of the day: an older row a change sets loose does not take its place ----
  const Lc = ledger([vanya('r0', '2026-10-08', 3000), vanya('r1', D, 3000)]), Qc = plan(47000, D, w('w0', 3000, '2026-10-06'), w('wV', 3000, D, { paid: tick })), Mc = await C(Lc, Qc, D);
  const Qc1 = await tap(Lc, Qc, 'w0', 'del'), Mc1 = await C(Lc, Qc1, D), Mcold = await C(Lc, await wr(Qc, 'del', item(Mc, 'w0')), D);
  same([Mc.now, st(Mc, 'wV'), Mc1.now, st(Mc1, 'wV'), Mcold.now, st(Mcold, 'wV')], [47000, ['row', 3000, ['r1']], 47000, ['row', 3000, ['r1']], 44000, ['row', 3000, ['r0']]],
    'an earlier withdrawal that held an earlier row is deleted: that row would fill the ticked withdrawal before the row of the day reached it - the mark keeps room for the row it held. (Before the rule the row of the day was pushed out and taken off again: 44,000)');

  // ---- a balance typed for yesterday, «Оплачено» after it: the row that takes the mark's place is after the balance ----
  const mark = { on: D, at: AT + 3600e3, by: BY }, Qd = plan(47000, YD, w('wX', 3000, D, { paid: mark }), w('wM', 3000, '2026-10-15'));
  const Ld = ledger([vanya('r1', YD, 3000), reach('Wise', D, 'GBP', UP)]), Md0 = await C(ledger([]), Qd, D), Md = await C(Ld, Qd, D);
  const Qd1 = await tap(Ld, Qd, 'wM', 'set', { whose: 'vanya' }, LATER, BY), Md1 = await C(Ld, Qd1, D), Mdold = await C(Ld, await wr(Qd, 'set', item(Md, 'wM'), { whose: 'vanya' }, LATER, BY), D);
  same([Md0.now, Md.now, st(Md, 'wX'), item(Md, 'wX').mark.counts, Md1.now, st(Md1, 'wX'), memOf(Qd1, 'wX'), Mdold.now], [44000, 44000, ['row', 3000, ['r1']], false, 44000, ['row', 3000, ['r1']], [[3000, `Wise|GBP|${YD}|${AT}`]], 47000],
    'the balance is yesterday\'s, the withdrawal was marked after it was typed, and the statement has passed the mark\'s day: Vanya\'s row of yesterday stands in the mark\'s place, after the balance - 44,000 before it came and with it. Another line given to Vanya: it stays. (Before the rule the row went to that line and into the balance: 47,000)');
  // … and a memory written while the mark still waited holds for the row of the day when the next statement ends the wait
  const Le1 = ledger([vanya('r1', YD, 3000)]), Le2 = ledger([vanya('r1', YD, 3000), reach('Wise', D, 'GBP', LATER + 3600e3)]), Me = await C(Le1, Qd, D);
  const Qe1 = await tap(Le1, Qd, 'wM', 'set', { whose: 'vanya' }, LATER, BY), Me1 = await C(Le1, Qe1, D), Me2 = await C(Le2, Qe1, D);
  same(['saw' in item(Me, 'wX'), Me.now, Me1.now, Me2.now, st(Me2, 'wX'), 'saw' in item(Me2, 'wX')], [true, 44000, 44000, 44000, ['row', 3000, ['r1']], false],
    'the same while the mark still waits for its statement - the memory of rv-wdmark - and then the statement that ends the wait: the row of the balance\'s day is held still');

  // ---- two accounts typed in one save; one of them typed again for the next day ----
  const Qf = plan3({ banks: [bal('Wise', 'GBP', 47000, D, { at: AT }), bal('Barclays', 'GBP', 9000, D, { at: AT })], div: [w('wV', 3000, D, { paid: tick }), w('wM', 3000, '2026-10-15')] });
  const Qf1 = await tap(La, Qf, 'wM', 'set', { whose: 'vanya' }, LATER, BY), D2 = '2026-10-14';
  const Qf2 = await edit(La, Qf1, (X) => ({ ...X, banks: X.banks.map((b) => (b.bank === 'Wise' ? { ...b, amt: 44000, asOf: D2, at: ms(D2 + 'T08:00:00Z') } : b)) }), D2);
  same([(await C(La, Qf1, D)).now, memOf(Qf1, 'wV'), none(Qf2), (await C(La, Qf2, D2)).now], [56000, [[3000, STAMP]], true, 53000], 'two balances typed in one save share their moment; the one whose day the row is of is typed again for the next day: that is its founder\'s word about the account, and nothing of the old day is held');

  // ---- a plan with no row of a balance's day is counted as before, and is given no memory ----
  const Lz = ledger([vanya('r1', YD, 3000)]), Mz = await C(Lz, Qa, D), Qz1 = await tap(Lz, Qa, 'wM', 'set', { whose: 'vanya' }, LATER, BY);
  same(['sawDay' in item(Mz, 'wV'), Mz.now, none(Qz1), bare(await C(Lz, Qz1, D)) === bare(await C(Lz, await wr(Qa, 'set', item(Mz, 'wM'), { whose: 'vanya' }, LATER, BY), D))], [false, 47000, true, true],
    'Vanya\'s row is dated the day before the balance: it is inside it by its date, whichever line holds it; the model says nothing of a balance\'s day, the change writes no memory, and the plan is read as a page from before the rule reads it');

  // ---- on the screen ----
  const SAT = ms(T + 'T07:00:00Z'), LS = ledger([filed('r1', T, -3000, 'vanya', '', { at: AT2 })]);
  const PS = plan3({ banks: [bal('Wise', 'GBP', 47000, T, { at: SAT })], div: [w('wV', 3000, T, { paid: { on: T, at: SAT - 1, by: BY } }), w('wM', 3000, '2026-10-08')] });
  const pg = await scene('wdday', LS, PS);
  const now = () => pg.evaluate(() => window.__money.model({ H: 30 }).now);
  const rowsOf = (id) => pg.evaluate((id) => { const it = window.__money.model({ H: 30 }).items.find((x) => x.id === id); return it ? [it.done ? it.done.by : it.state, it.wd.got, it.rows] : null; }, id);
  const kept = () => pg.evaluate(() => { const p = window.__cash.state().div.find((x) => x.id === 'wV').paid; return p && p.saw ? p.saw.rows.map((x) => x[1]) : null; });
  const choose = async (id, v, k) => { await rowCard(pg, 'div', id); await pg.selectOption(K('row') + '[data-ed-f="whose"]', v); await pg.click(K('row') + '[data-ed-save]'); await puts('cash', k); };
  const n0 = await now();
  await goCash(pg);
  await choose('wM', 'vanya', 1);
  same([n0, round2((await now()) - n0), await toastText(pg), await rowsOf('wV'), await rowsOf('wM'), await kept()], [47000, 0, 'Сохранено: Вывод wM · вывод Vanya', ['row', 3000, ['r1']], ['due', 0, []], [3000]],
    'on the page: «Чей вывод» of the other line set to Vanya - «Денег сейчас» stays 47,000, the toast has nothing to say of it, the row is the ticked withdrawal\'s still, and the one save carries the memory');
  await holds(pg, 'with a row of the balance\'s day held in a ticked withdrawal', 'cash');
  await choose('wV', 'misha', 2);
  const n2 = await now();
  same([round2(n2 - n0), await toastText(pg), await rowsOf('wV'), await rowsOf('wM'), await kept()], [-3000, 'Вывод wV: вывод Misha · «Денег сейчас» теперь £44,000: пересчитана отметка «Оплачено» на выводе', ['ok', 0, []], ['row', 3000, ['r1']], null],
    'the ticked line itself given to Misha: its founder\'s word - Vanya\'s row is not Misha\'s, it pays Vanya\'s line and is after the balance, and the toast names the figure');
  await pg.context().close();
  // A sum typed in a row of «Касса» is seen before its first letter and kept after each: Misha's withdrawal of
  // 7,000 holds his earlier row of 6,000; typed down to 3,000, the half of the row it lets go would fill the ticked
  // withdrawal, which is everybody's, before Vanya's row of the day reached it.
  const LK = ledger([filed('r0', '2026-10-02', -6000, 'misha', '', { at: AT2 }), filed('r1', T, -3000, 'vanya', '', { at: AT2 })]);
  const PK = plan3({ banks: [bal('Wise', 'GBP', 47000, T, { at: SAT })], div: [w('w0', 7000, '2026-10-01', { whose: 'misha' }), w('wV', 3000, T, { paid: { on: T, at: SAT - 1, by: BY } })] });
  const Mk = await C(LK, PK, T), Mkold = await C(LK, await wr(PK, 'set', item(Mk, 'w0'), { amt: 3000 }, TAP, BY), T);
  const pk = await scene('wdday, a keystroke', LK, PK);
  const seen = (id) => pk.evaluate((id) => { const m = window.__money.model({ H: 30 }), it = m.items.find((x) => x.id === id); return [m.now, it.done ? it.done.by : it.state, it.rows]; }, id);
  const k0 = await seen('wV');
  await goCash(pk);
  await pk.fill(box('div', 'w0', 'amt'), '3000');
  await puts('cash', 1);
  same([k0, await seen('wV'), await pk.evaluate(() => { const p = window.__cash.state().div.find((x) => x.id === 'wV').paid; return p.saw ? p.saw.rows.map((x) => x[1]) : null; }), Mkold.now, st(Mkold, 'wV')], [[47000, 'row', ['r1']], [47000, 'row', ['r1']], [3000], 44000, ['row', 3000, ['r0']]],
    'Misha\'s withdrawal typed down to 3,000 in its row of «Касса»: the 3,000 of his row it lets go are not dealt into the ticked withdrawal - the mark keeps its room for the row of the day it held; «Денег сейчас» stays 47,000. (Before the rule: 44,000)');
  await pk.context().close();
  // «Что если» asks of a copy of the plan, changed as the page changes the plan: the same trial on a monthly withdrawal.
  const PW = { ...PK, div: [row('w0', 'Вывод', 7000, '2026-10-01', { blk: 'div', c0: AT1, whose: 'misha', rec: { day: 1, from: '2026-10' } }), PK.div[1]] };
  const pw = await scene('wdday, a trial', LK, PW);
  const tr = await pw.evaluate(() => window.__money.whatIf([{ k: 'draw', row: 'w0', amt: 3000, from: '2026-10' }]));
  same([tr && tr.skipped.length, tr && tr.plan.now, tr && round2(tr.trial.now - tr.plan.now), store.cash.puts, await pw.evaluate(() => 'saw' in window.__cash.state().div.find((x) => x.id === 'wV').paid)], [0, 47000, 0, 0, false],
    'a trial of «выводим другую сумму» on the monthly withdrawal beside the ticked one: «Денег сейчас» of the trial is the plan\'s - the row of the day is held in the trial\'s copy too; nothing is saved, and the plan itself is given no memory');
  await pw.context().close();
});

// What was paid outside the plan (the owner's decision of 13 October 2026). The plan holds only what a founder wrote,
// and «Касса» showed a month as its lines alone: a payment that came with a statement and closed no line was in the
// month's fact, in «Месяцы» and «Отчёты», and nowhere on the plan's page. Now each month says it too: the rows of the
// table that closed no line stand in the list of their block, by their date, as paid rows with the words «вне
// плана» - shown, and counted in no figure of the plan. A founder's row is one of them only where no withdrawal had
// room for it. A transfer to a founder's daily account was his taking, seen inside the withdrawal that held it; since
// the owner's decision of 17 October 2026 one made from October on is a transfer between own accounts - in no
// withdrawal and in no list of the month (the check «daily»; a September one is still a taking there).
await run('rv-offplan', 'what the statements show that the plan did not hold stands in its month of «Касса», by its block and its date, and in no figure of the plan; a founder\'s October transfer to his daily account is no taking and stands nowhere in the month; a month before the plan was written, and one that has not come, show none', async () => {
  const OCT = '2026-10', sub = row('s1', 'Tool A', 15, '2026-10-10', { blk: 'fixed', sub: true, rec: { day: 10, from: OCT } });
  const lines = { banks: [bal('Wise', 'GBP', 50000, '2026-10-05'), bal('Barclays', 'GBP', 10000, '2026-10-05')], inflows: [row('i1', 'Client Q', 5000, '2026-10-09', { blk: 'rev' })], team: [row('t1', 'Person Z', 2000, '2026-10-07', { blk: 'cogs' }), row('t0', 'Person Y', 800, '2026-09-28', { blk: 'cogs' })],
    other: [row('o1', 'Office', 640, '2026-10-20', { blk: 'fixed' }), sub] };
  const P = plan3({ ...lines, div: [row('w1', 'Вывод', 3000, '2026-10-08', { blk: 'div' })] }), Pnone = plan3({ ...lines });
  // On the page before the plan was written (AT1) and so no line's: a flight, a one-off job, a receipt, a charge of
  // the tool that is a subscription in the plan, and a refund. After it (AT2): the salary the plan waits for, two
  // takings, and two rows still in «Разбор» - one the page recognised, one with no block at all.
  const out = [filed('x1', '2026-10-03', -252, 'other', 'Ryanair'), filed('x2', '2026-10-02', -420, 'cogs', 'Person K'), filed('x3', '2026-10-04', 450, 'rev', 'Harbour Co', { b: 'Barclays' }),
    filed('x4', '2026-10-04', -9.99, 'fixed', 'Tool A'), filed('x5', '2026-10-04', 23.4, 'other', 'Uber')];
  const tx = out.concat([filed('p1', T, -2000, 'cogs', 'Person Z', { at: AT2 }), filed('d1', T, -500, 'misha', 'daily', { at: AT2 }), filed('d2', T, -400, 'vanya', '', { at: AT2 })]);
  const inb = [inbox('q1', '2026-10-04', -70, '', 'CARD PAYMENT 4471', { at: AT2 }), inbox('q2', '2026-10-04', -33, 'other', 'Uber', { at: AT2 })];
  const L = ledger(tx, inb), M = await C(L, P, T), by = M.months.by[OCT];
  const ids = (o, k) => o.off.by[k].rows.map((r) => r.id), sums = ({ in: i, out: o, nIn, nOut }) => ({ in: i, out: o, nIn, nOut });
  same([sums(by.off), by.wait, SECS.map((k) => [k, ids(by, k), by.off.by[k].gbp])], [{ in: 450, out: 691.59, nIn: 1, nOut: 5 }, { n: 1, gbp: 70 }, [['inflows', ['x3'], 450], ['team', ['x2'], 420], ['taxes', [], 0], ['subs', ['x4'], 9.99], ['other', ['x1', 'q2', 'x5'], 261.6], ['div', [], 0]]],
    'October: six rows of the table closed no line - each in the section of its block, the charge of a tool the plan holds as a subscription in «Подписки»; the row with no block waits in «Разбор» and is in no section');
  same([by.off.by.other.rows.map((r) => [r.id, r.d, r.name, r.amt, r.cur, r.gbp, r.bank, r.prov, r.back]), by.off.by.inflows.rows[0].bank, Object.keys(by.team).sort()], [[['x1', '2026-10-03', 'Ryanair', 252, 'GBP', 252, 'Wise', false, false], ['q2', '2026-10-04', 'Uber', 33, 'GBP', 33, 'Wise', true, false], ['x5', '2026-10-04', 'Uber', 23.4, 'GBP', -23.4, 'Wise', false, true]], 'Barclays', ['done', 'expected', 'rows']],
    'a row says its day, its name, its sum and its bank; one the page recognised and nobody has accepted is marked so, and a refund is a sum the other way; a section of the plan is what it was - its lines, expected and paid');
  // (Until 17 October 2026 the withdrawal took both: 900 - Misha's 500 to his daily account and Vanya's 400. Misha's
  // move of 6 October is a transfer between own accounts now (D): the withdrawal holds Vanya's 400 alone, and the
  // move is in no list of the month either - 400 + nothing, of the 900 the two rows came to.)
  same([item(M, 't1').done.rows, item(M, 'w1').wd.got, item(M, 'w1').wd.by, item(M, 'w1').rows, SECS.some((k) => ids(by, k).includes('d1'))], [['p1'], 400, [{ c: 'vanya', l: '', gbp: 400 }], ['d2'], false],
    'the salary closed its line and Vanya\'s taking went into the withdrawal - neither is outside the plan; Misha\'s October move to his daily account is no taking: not in the withdrawal, not outside the plan');
  // … and in no figure of the plan: the same plan on a table without those rows (they are inside the balance by their dates)
  const M0 = await C(ledger(tx.filter((r) => !out.includes(r)), []), P, T);
  const figs = (X) => [X.now, X.IN, X.OUT, X.END, X.LOW, X.free, X.verdict.id, SECS.map((k) => [X.months.by[OCT][k].expected, X.months.by[OCT][k].done])];
  same([figs(M), sums(M0.months.by[OCT].off), round2(M.month.blocks.other.fact - M0.month.blocks.other.fact)], [figs(M0), { in: 0, out: 0, nIn: 0, nOut: 0 }, 271.59],
    '«Денег сейчас», what comes and goes, the end of the line, the lowest point, «Можно вывести» and every section\'s plan and paid are what they are without those rows; the month\'s FACT counted them before and counts them still');
  same([M.months.list.includes('2026-09'), 'off' in M.months.by['2026-09'], 'wait' in M.months.by['2026-09'], 'off' in M.months.by['2026-11'], 'wait' in M.months.by['2026-11']], [true, false, false, false, false],
    'September holds a line and was over before the plan was first written: it says nothing of what was paid outside it - every row would be; November has not come');
  // A founder took what no withdrawal was written for: his row is outside the plan, in «Дивиденды»
  const Mn = await C(L, Pnone, T), dn = Mn.months.by[OCT].off.by.div;
  // (Until 17 October 2026: Vanya's 400 and Misha's daily 500 here - 900, seven payments. The October move is no
  // taking now: 400, six; and it left the bank all the same - «Денег сейчас» is 57,100 either way.)
  same([dn.rows.map((r) => [r.id, r.name, r.amt]), dn.gbp, Mn.months.by[OCT].off.nOut, [M.now, Mn.now], SECS.map((k) => Mn.months.by[OCT].off.by[k].rows.some((r) => r.id === 'd1'))], [[['d2', 'Vanya', 400]], 400, 6, [57100, 57100], SECS.map(() => false)],
    'the same table and a plan with no withdrawal: Vanya\'s 400 is outside the plan, under «Дивиденды»; Misha\'s October move to his daily account is in no list - not his taking, not a cost of the studio - and «Денег сейчас» is the same');

  // ---- on the screen ----
  const pg = await scene('offplan', L, P);
  await goCash(pg);
  const outs = (k) => pg.$$eval(`#cs-sec-${k} tbody tr`, (l) => l.filter((tr) => tr.matches('.cs-r')).map((tr) => (tr.dataset.csOut ? [tr.dataset.csOut, tr.querySelector('.cs-at').textContent, tr.querySelector('.cs-rm').textContent, !!tr.querySelector('input,button')].join(' | ') : tr.dataset.csId)));
  same([await text(pg, '#cs-off'), await text(pg, '#cs-wait'), await pg.$('#cs-past')], ['Оплачено вне плана в октябре: ушло £692 (5 платежей), пришло £450 (1 платёж). Эти строки стоят в списках ниже, серым; в расчёт плана они не входят.', 'Ещё 1 платёж на £70 за октябрь ждёт в «Разборе»: статьи пока нет, поэтому в списках его нет. Открыть «Разбор»', null],
    'the month says in one sentence what was paid outside the plan, and in another what still waits in «Разбор»');
  same([await outs('inflows'), await outs('team'), await outs('other'), await text(pg, '#cs-sec-other [data-cs-tot]'), await text(pg, '#cs-sec-team [data-cs-tot]')],
    [['x3 | 450 | вне плана | false', 'i1'], ['x2 | 420 | вне плана | false', 't1'], ['x1 | 252 | вне плана | false', 'q2 | 33 | вне плана · ждёт в «Разборе» | false', 'x5 | −23.4 | вне плана · возврат | false', 'o1'], '£640 · вне плана £262', '£2,000 · из них оплачено £2,000 · вне плана £420'],
    'each row stands in its list before the first line dated after it, with the words «вне плана» and nothing to type or press; the head of the list says the sum beside the plan\'s own');
  // (until 17 October 2026 the withdrawal read «взято £900 из £3,000: Misha daily £500 · Vanya £400»; Vanya's 400 is
  // all it holds now, one founder's and with no label, so it says what it took and of what)
  same([await text(pg, '#cs-subs-say'), await text(pg, '#cs-subs-fold [data-cs-fold]'), await pg.$eval(cs('div', 'w1') + ' [data-cs-rm]', (e) => e.textContent)], ['Ещё 1 на £15: Tool A. Вне плана: Tool A.', 'Показать 2 строки', 'взято £400 из £3,000'],
    '«Подписки», folded, names the charge that was outside the plan; the withdrawal says what it took - Misha\'s October move to his daily account is not there');
  await holds(pg, 'with rows from outside the plan', 'cash');
  await pg.click('#cs-sec-other tr[data-cs-out="x1"] .cs-nt');
  same([await pg.$$eval('#cs-plan tr.cs-edrow', (l) => l.length), store.cash.puts], [0, 0], 'a press on such a row opens no card and saves nothing: it is no line of the plan');
  await pg.fill(box('div', 'w1', 'amt'), '3500');
  await puts('cash', 1);
  same([await outs('other'), (await outs('team')).length, await text(pg, '#cs-sec-other [data-cs-tot]')], [['x1 | 252 | вне плана | false', 'q2 | 33 | вне плана · ждёт в «Разборе» | false', 'x5 | −23.4 | вне плана · возврат | false', 'o1'], 2, '£640 · вне плана £262'],
    'a sum typed in a line of the month: the rows from outside the plan are drawn once, where they were');
  await leave(pg);
  await pg.click('#cs-month [data-cs-mon="-1"]');
  same([await text(pg, '#cs-mname'), await text(pg, '#cs-past'), await pg.$('#cs-off'), await pg.$$eval('#cs-plan tr[data-cs-out]', (l) => l.length)], ['Сентябрь 2026', 'Здесь — только строки плана за этот месяц. Всё, что прошло по выпискам, — в «Месяцах».', null, 0],
    'September, a month from before the plan: its page holds the plan\'s rows alone and says so, as it always did');
  await pg.click('#cs-month [data-cs-mon="now"]');
  await pg.click('#cs-wait [data-tab="inbox"]');
  same([await pg.$eval('.nav [data-tab="inbox"]', (e) => e.getAttribute('aria-current')), store.cash.puts], ['page', 1], '«Открыть „Разбор“» goes to «Разбор», where the row that waits gets its block; nothing else was saved');
  await pg.context().close();
});

// =====================================================================================================================
// THE OWNER'S DECISIONS OF 17 OCTOBER 2026 (docs/handoff.md, the entry of that day). A founder wrote two withdrawals
// in «Дивиденды» after the statements that held them were uploaded, named «Vanya» and «Misha», and marked both
// «Оплачено»; the page dealt them neither statement (a row counts for a line only if it came after the line), left
// Vanya's own transfer «вне плана» beside his row, and filled both rows days later with Misha's next transfers. «Это
// разные выводы». Decided: N - a withdrawal whose whole name is a founder's is his («А»); W1 - such a withdrawal,
// marked for a day that has come, takes its founder's rows near its date whatever their upload time; W2 - a row the
// withdrawals took in part shows its rest «вне плана»; D - from 1 October 2026 a move to a founder's Daily or
// Monthly account is a transfer between own accounts («А», «только с октября»). Every figure below is made up.
// =====================================================================================================================
const D17 = '2026-10-17', AT17 = '2026-10-17T19:00:00+01:00';
const cardText = (r, t) => { r.o.t = t; return r; };
// The October of the founder's question: the rows, and two withdrawals written on 12 October at 16:00 and marked.
const UP7 = ms('2026-10-07T09:00:00Z'), W12 = ms('2026-10-12T16:00:00Z'), MK12 = ms('2026-10-12T16:05:00Z'), UP17 = ms('2026-10-17T10:00:00Z'), TY17 = ms('2026-10-17T18:00:00Z');
const octTx = () => [
  filed('v350', '2026-10-12', -350, 'vanya', '', { b: 'Barclays', at: W12 - 60000 }),     // Vanya's own, uploaded a minute before his row was written
  filed('m80', '2026-10-04', -80, 'misha', '', { at: UP7 }),
  filed('m154', '2026-10-05', -154.2, 'misha', '', { at: UP7 }),                            // with the fee in it
  filed('m750', '2026-10-05', -750, 'misha', '', { at: UP7 }),
  filed('mRub', '2026-10-15', -153400, 'misha', '', { b: 'Tochka', cur: 'RUB', at: UP17 }),  // £1,300 at 118
  filed('mEur', '2026-10-12', -70.2, 'misha', '', { cur: 'EUR', at: UP17 }),                 // £60 at 1.17
  cardText(filed('vc1', '2026-10-13', -12.4, 'vanya', 'tfl', { at: UP17 }), 'Card transaction of 12.40 GBP issued by Travel Charge'),
  cardText(filed('vc2', '2026-10-14', -8.6, 'vanya', 'tfl', { at: UP17 }), 'Card transaction of 8.60 GBP issued by Travel Charge'),
  cardText(filed('vc3', '2026-10-16', -25.3, 'vanya', '', { at: UP17 }), 'Card transaction of 25.30 GBP issued by Lunch Place'),
  cardText(filed('dM', '2026-10-03', -200, 'mika', 'daily', { at: UP7 }), '200,00 GBP перемещено сюда: Mika Daily'),
];
const octBanks = () => [bal('Wise', 'GBP', 40000, D17, { at: TY17 }), bal('Barclays', 'GBP', 9000, D17, { at: TY17 }), bal('Tochka', 'RUB', 500000, D17, { at: TY17 }), bal('Wise', 'EUR', 3000, D17, { at: TY17 })];
const wrote = (id, name, amt, date, more = {}) => row(id, name, amt, date, { blk: 'div', c0: W12, m: { t: W12, by: 'Mika' }, paid: { on: '2026-10-12', at: MK12, by: 'Mika' }, ...more });
const octPlan = (more = {}) => plan3({ banks: octBanks(), team: [row('t1', 'Person Z', 3000, '2026-10-28', { blk: 'cogs' })],
  div: [wrote('wV', 'Vanya', 350, '2026-10-12', { bank: 'Barclays', ...(more.V || {}) }), wrote('wM', 'Misha', 900, '2026-10-05', more.M || {})].concat(more.div || []) });
// The page with N's switch turned off: the page as it was until 17 October 2026, but for W1, W2 and D - and W1 has no
// withdrawal to take, for no row is anybody's.
async function noName() {
  const src = fs.readFileSync(PUB + '/money/index.html', 'utf8'), on = ' const BYNAME=true;';
  ok(src.includes(on), 'N has its one-line switch in the page');
  const ctx = await browser.newContext(CALM);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('**/money/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: src.replace(on, ' const BYNAME=false;') }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(`no name: PAGEERROR ${e.message}`));
  await pg.goto(BASE + '/money/index.html');
  await pg.waitForFunction(() => window.__money && window.__cash && window.__cash.state());
  return { pg, C: async (L, P, day = D17, o = { H: 30 }) => JSON.parse(await pg.evaluate(([l, p, t, o]) => JSON.stringify(window.__money.compute(l, p, t, o)), [L, P, day, o])) };
}
const offOf = (M, ym = '2026-10') => ((M.months.by[ym] || {}).off || { by: {} });
const offIds = (M, k = 'div') => (offOf(M).by[k] || { rows: [] }).rows.map((r) => r.id);

await run('records', 'a withdrawal named after a founder is his (N); written as a record and marked, it takes his rows near its date whatever their upload time, before the walk (W1); the rest of a row taken in part stands «вне плана» (W2); «Денег сейчас» and «Можно вывести» are what they were', async () => {
  const L = ledger(octTx()), P = octPlan(), M = await C(L, P, D17);
  const st = (id) => { const it = item(M, id); return [it.whose, it.state, it.done && it.done.by, it.wd.got, it.rows, !!it.wd.rec]; };
  // N: the whole name, case and spaces aside, in Latin or in Russian; nothing less; «общий» chosen by hand; never f
  const names = [];
  for (const [name, more] of [['Vanya', {}], [' ваня ', {}], ['VANYA', {}], ['Вывод Vanya', {}], ['Vanya', { whose: '' }], ['Vanya', { f: 'mika' }], ['Vanya', { whose: 'misha' }]]) names.push(item(await C(L, octPlan({ V: { name, ...more } }), D17), 'wV').whose);
  same(names, ['vanya', 'vanya', 'vanya', '', '', 'vanya', 'misha'], 'N: «Vanya», « ваня », «VANYA» are Vanya\'s; «Вывод Vanya» and «Vanya» with «общий» chosen by hand are everybody\'s; `f` is not read; a founder chosen by hand stands over the name');
  // W1, the two rows of the question. «Vanya» 350: his own 350 of 12 Oct is one row within the tolerance (343 … 367.50).
  // «Misha» 900: of his rows within five days of 5 Oct (80, 154.20, 750) none alone is within 882 … 945; of the sets of
  // two to four, 154.20 + 750 = 904.20 is, and is the only one (80 + 750 = 830, 80 + 154.20 + 750 = 984.20) - it takes
  // 154.20 and 745.80 of the 750, up to its sum; the 4.20 the 750 has over is its rest.
  same([st('wV'), st('wM')], [['vanya', 'done', 'row', 350, ['v350'], true], ['misha', 'done', 'row', 900, ['m154', 'm750'], true]],
    'W1: «Vanya» is closed by his own 350, uploaded a minute before the row was written; «Misha» by his two transfers of 5 Oct - no single row fits, the set of two does');
  // W2 and what stands «вне плана»: Misha's 80 of 4 Oct (in no set that fits), the rest 4.20 of his 750, his later
  // transfers in full (the euro 60, the rouble 1,300), and Vanya's three card payments (12.40, 8.60, 25.30).
  const div = offOf(M).by.div, rest = div.rows.find((r) => r.id === 'm750');
  same([div.rows.map((r) => [r.id, r.amt, r.cur, r.gbp]), rest && rest.part, div.gbp], [[['m80', 80, 'GBP', 80], ['m750', 4.2, 'GBP', 4.2], ['mEur', 70.2, 'EUR', 60], ['vc1', 12.4, 'GBP', 12.4], ['vc2', 8.6, 'GBP', 8.6], ['mRub', 153400, 'RUB', 1300], ['vc3', 25.3, 'GBP', 25.3]], { of: 750, took: 745.8 }, 1490.5],
    '«вне плана»: Vanya\'s 350 is not there (one line, its withdrawal\'s); Misha\'s later transfers are, in full, and so are Vanya\'s card payments; the 750 stands with its rest - 4.20 of 750');
  // Written and «вне плана» are every founders' row of October but the move to Mika's Daily account (D):
  // 350 + 900 + 1,490.50 = 2,740.50 = 350 + 80 + 154.20 + 750 + 1,300 + 60 + 12.40 + 8.60 + 25.30.
  const founders = round2(sum(octTx().filter((r) => r.id !== 'dM').map((r) => r.a))), written = round2(item(M, 'wV').wd.got + item(M, 'wM').wd.got);
  same([written, round2(written + div.gbp), founders, M.month.blocks.div.fact, M.items.some((it) => it.rows.includes('dM')), SECS.some((k) => (offOf(M).by[k] || { rows: [] }).rows.some((r) => r.id === 'dM'))], [1250, 2740.5, 2740.5, 2740.5, false, false],
    'written (1,250) and «вне плана» (1,490.50) make every founders\' row of October, 2,740.50 - the move of 200 to Mika\'s Daily account is in neither, nor in the month\'s dividends');
  // Before N and W1: the page with N's switch off - neither row is anybody's, so the walk deals them, oldest first,
  // the rows uploaded after 12 Oct 16:00: «Misha» takes the euro 60, the card payments 12.40 and 8.60, and 819 of the
  // rouble 1,300; «Vanya» the next 350 of it; the 131 left (its rest, W2) and Vanya's 25.30 find no room. Vanya's 350,
  // Misha's 80, 154.20 and 750 were on the page before the rows were written: «вне плана».
  const nn = await noName(), M0 = await nn.C(L, P);
  const st0 = (id) => { const it = item(M0, id); return [it.whose, it.state, it.wd.got, it.rows, !!it.wd.rec]; };
  same([st0('wV'), st0('wM'), offIds(M0)], [['', 'done', 350, ['mRub'], false], ['', 'done', 900, ['mEur', 'vc1', 'vc2', 'mRub'], false], ['m80', 'm154', 'm750', 'v350', 'mRub', 'vc3']],
    'with N\'s switch off the two rows behave as before: everybody\'s, filled by the transfers that came after them, and Vanya\'s own 350 «вне плана» beside his row');
  same([M.now, M.free && M.free.now, M.marksGbp], [M0.now, M0.free && M0.free.now, M0.marksGbp], '«Денег сейчас», «Можно вывести» and the marks are what the same documents gave before N and W1');
  // (the review of 17 October 2026) The figures above could not differ: every balance is typed on the 17th at 18:00,
  // after every row and every mark, so no mark counts in either page. Here Vanya's mark is live: Barclays 9,000 is
  // typed for 11 Oct, and no Barclays statement came after the mark (12 Oct, 16:05); the rouble transfer has not come
  // either, so nothing fills «Vanya» before N and W1. Then the mark «Оплачено» counted 350 on Barclays on top of his
  // own 350 dated 12 Oct - after the balance by its date: 9,000 − 350 − 350 = 8,300, the 350 taken off twice. With N
  // and W1 «Vanya» is a record of that row and its mark counts nothing: 9,000 − 350 = 8,650 - and «Денег сейчас» and
  // «Можно вывести» are what the page gave before plus exactly those 350.
  const Llive = ledger(octTx().filter((r) => r.id !== 'mRub')), Plive = octPlan();
  Plive.banks = Plive.banks.map((b) => (b.bank === 'Barclays' ? bal('Barclays', 'GBP', 9000, '2026-10-11', { at: ms('2026-10-11T18:00:00Z') }) : b));
  const Ml = await C(Llive, Plive, D17), Ml0 = await nn.C(Llive, Plive), barc = (X) => X.accounts.find((a) => a.key === 'Barclays|GBP');
  same([[item(Ml0, 'wV').done.by, item(Ml0, 'wV').mark.counts, Ml0.marksGbp, barc(Ml0).est], [item(Ml, 'wV').done.by, item(Ml, 'wV').rows, Ml.marksGbp, barc(Ml).est], round2(Ml.now - Ml0.now), round2(Ml.free.now - Ml0.free.now)],
    [['mark', true, -350, 8300], ['row', ['v350'], 0, 8650], 350, 350], 'Vanya\'s mark live: before N and W1 it counted 350 on top of his own 350 (Barclays 8,300); now the record holds the row and the mark counts nothing (8,650) - «Денег сейчас» and «Можно вывести» are higher by exactly that 350');
  // a row named «Вывод» behaves as before; and so does «Vanya» with «общий» chosen by hand
  const P3 = plan3({ banks: octBanks(), div: [wrote('wS', 'Вывод', 350, '2026-10-12', { bank: 'Barclays' })] });
  const M3 = await C(L, P3, D17);
  same([JSON.stringify(M3) === JSON.stringify(await nn.C(L, P3)), item(M3, 'wS').rows, !!item(M3, 'wS').wd.rec, offIds(M3).includes('v350')], [true, ['mEur', 'vc1', 'vc2', 'mRub'], false, true],
    'a row named «Вывод», written and marked the same way: no record - the same model, byte for byte, as with N\'s switch off; Vanya\'s 350 stays «вне плана»');
  await nn.pg.context().close();
  const Pc = await wr(P, 'set', item(M, 'wV'), { whose: '' }, MK12 + 3600e3, BY), Mc = await C(L, Pc, D17);
  same([Pc.div.find((r) => r.id === 'wV').whose, 'whose' in Pc.div.find((r) => r.id === 'wV'), item(Mc, 'wV').whose, !!item(Mc, 'wV').wd.rec, item(Mc, 'wV').rows, item(Mc, 'wM').rows],
    ['', true, '', false, ['mEur', 'vc1', 'vc2', 'mRub'], ['m154', 'm750']],
    '«общий» chosen on «Vanya»: the row says so (whose:"", the one thing that keeps a founder\'s name everybody\'s), it is no record and the walk fills it - Misha\'s record is as it was');

  // ---- on the screen: «Касса» of October ----
  const pg = await scene('records', L, P, { at: AT17 });
  await goCash(pg);
  await holds(pg, 'October of the founder\'s question, with N, W1 and W2', 'cash');
  const outRow = (id) => pg.$eval(`#cs-sec-div tr[data-cs-out="${id}"]`, (tr) => [tr.querySelector('.cs-at').textContent, tr.querySelector('.cs-rm').textContent, !!tr.querySelector('input,button')].join(' | '));
  same([await outRow('m750'), await outRow('m80'), await pg.$('#cs-sec-div tr[data-cs-out="v350"]'), await pg.$('#cs-sec-div tr[data-cs-out="dM"]')], ['4.2 | вне плана · часть £4.20 из £750 | false', '80 | вне плана | false', null, null],
    'the rest of the 750 is a line of its own, «вне плана · часть £4.20 из £750»; Vanya\'s 350 is no line «вне плана», and the move to Mika\'s Daily account is in no list');
  await rowCard(pg, 'div', 'wV');
  same((await pg.$eval(K('row') + '[data-ed-f="whose"]', (e) => e.value)), 'vanya', 'the card of «Vanya» says whose it is by its name: Vanya');
  await pg.selectOption(K('row') + '[data-ed-f="whose"]', '');
  await pg.click(K('row') + '[data-ed-save]');
  await puts('cash', 1);
  same([await pg.evaluate(() => { const r = window.__cash.state().div.find((x) => x.id === 'wV'); return ['whose' in r, r.whose]; }), await toastText(pg), await pg.evaluate(() => window.__money.model({ H: 30 }).items.find((x) => x.id === 'wV').whose)], [[true, ''], 'Vanya: вывод общий', ''],
    '«общий» chosen in the card: stored as whose:"", the toast says so, and the row is everybody\'s');
  await pg.context().close();
  // ---- renamed in the card (the review of 17 October 2026) ----
  // «Чей вывод» follows the name as it is typed, and only a choice made in it is written. Before, a rename in the card
  // wrote what the select showed when it opened: «Вывод» renamed «Vanya» was stored as whose:"" - «общий» nobody chose -
  // and stayed everybody's, to be filled by the other founders' rows (the founder's question of that day); «Vanya»
  // renamed «Вывод» stayed Vanya's. Now the first is Vanya's by its name, the second everybody's - each as a row
  // written so would be - and whose:"" is stored only where «общий» was chosen.
  const Pn = plan3({ banks: octBanks(), div: [row('wA', 'Вывод', 500, '2026-10-28', { blk: 'div', c0: W12 }), row('wB', 'Vanya', 500, '2026-10-29', { blk: 'div', c0: W12 }), row('wC', 'Вывод', 500, '2026-10-30', { blk: 'div', c0: W12 })] });
  const pn = await scene('records-rename', ledger([]), Pn, { at: AT17 });
  await goCash(pn);
  const rename = async (id, name, whose) => { await rowCard(pn, 'div', id); await pn.fill(K('row') + '#ed-name', name); const shown = await pn.$eval(K('row') + '[data-ed-f="whose"]', (e) => e.value);
    if (whose !== undefined) await pn.selectOption(K('row') + '[data-ed-f="whose"]', whose); await pn.click(K('row') + '[data-ed-save]'); return shown; };
  const after = (id) => pn.evaluate((id) => { const r = window.__cash.state().div.find((x) => x.id === id); return [r.name, 'whose' in r ? r.whose : null, window.__money.model({ H: 30 }).items.find((x) => x.id === id).whose]; }, id);
  const sA = await rename('wA', 'Vanya'); await puts('cash', 1); const tA = await toastText(pn);
  const sB = await rename('wB', 'Вывод'); await puts('cash', 2); const tB = await toastText(pn);
  const sC = await rename('wC', 'Misha', ''); await puts('cash', 3);
  same([[sA, await after('wA'), tA], [sB, await after('wB'), tB], [sC, await after('wC')]],
    [['vanya', ['Vanya', null, 'vanya'], 'Сохранено: Vanya · вывод Vanya'], ['', ['Вывод', null, ''], 'Сохранено: Вывод · вывод общий'], ['misha', ['Misha', '', '']]],
    'renamed in the card: «Вывод» → «Vanya» - the select follows the name, nothing is stored of the owner, and the row is Vanya\'s by its name; «Vanya» → «Вывод» - everybody\'s; «Вывод» → «Misha» with «общий» chosen in the select - whose:"", everybody\'s');
  await pn.context().close();
});

await run('rest', 'a row the walk takes in part shows its rest «вне плана», in the row\'s own currency, and what was taken and the rest make the row exactly; «вне плана» is in no figure of the plan', async () => {
  // «Вывод» 1,000 written on 1 Oct; Misha's rouble transfer of 150,000 on 12 Oct (£1,271.19 at 118) uploaded after it.
  // The withdrawal takes £1,000 of it; the rest is £271.19, and in roubles 150,000 × 271.19 / 1,271.19 = 32,000.33 -
  // so what was taken is 150,000 − 32,000.33 = 117,999.67, never a second reckoning at the day's rate (271.19 × 118
  // would be 32,000.42, and the two would not make the row).
  const L = ledger([filed('r1', '2026-10-12', -150000, 'misha', '', { b: 'Tochka', cur: 'RUB', at: ms('2026-10-13T09:00:00Z') })]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 40000, D17, { at: TY17 }), bal('Tochka', 'RUB', 500000, D17, { at: TY17 })], team: [row('t1', 'Person Z', 3000, '2026-10-28', { blk: 'cogs' })], div: [row('w1', 'Вывод', 1000, '2026-10-10', { blk: 'div', c0: ms('2026-10-01T08:00:00Z') })] });
  const M = await C(L, P, D17), z = offOf(M), r = z.by.div.rows[0] || {};
  same([item(M, 'w1').state, item(M, 'w1').wd.got, item(M, 'w1').rows, z.by.div.rows.map((x) => [x.id, x.name, x.amt, x.cur, x.gbp, x.part]), z.by.div.gbp, [z.out, z.nOut]],
    ['done', 1000, ['r1'], [['r1', 'Misha', 32000.33, 'RUB', 271.19, { of: 150000, took: 117999.67 }]], 271.19, [271.19, 1]],
    'the withdrawal takes £1,000 of Misha\'s 150,000 roubles and is done; the rest stands «вне плана» as its own line - ₽32,000.33 of ₽150,000, £271.19 - and the list\'s total and the month\'s say so');
  same([round2(r.part.took + r.amt) === r.part.of && r.part.of === 150000, round2(item(M, 'w1').wd.got + r.gbp) === L.tx[0].a], [true, true], 'what was taken and the rest make the row exactly: 117,999.67 + 32,000.33 = 150,000 roubles; £1,000 + £271.19 = £1,271.19');
  // in no figure of the plan: the same plan on the same table, read with the rest left out of the list, counts the same
  const M0 = await C(ledger([]), P, D17);
  same([M.months.by['2026-10'].div.expected, M.months.by['2026-10'].div.done, M.OUT, M.free && M.free.wd], [1000, 1000, M0.OUT - 1000, M0.free && { ...M0.free.wd, gbp: 0, n: 0, date: '' }],
    '«вне плана» is shown and counted nowhere: «Дивиденды» of October expect and have 1,000, the plan\'s own; what is still to go out is the plan\'s less the withdrawal the row closed');
  const pg = await scene('rest', L, P, { at: AT17 });
  await goCash(pg);
  await holds(pg, 'a month with a rest «вне плана»', 'cash');
  same([await pg.$eval('#cs-sec-div tr[data-cs-out="r1"]', (tr) => [tr.querySelector('.cs-at').textContent, tr.querySelector('.cs-ct').textContent, tr.querySelector('.cs-rm').textContent, !!tr.querySelector('input,button')].join(' | ')), await text(pg, '#cs-sec-div [data-cs-tot]'), await text(pg, '#cs-off')],
    ['32,000.33 | RUB | вне плана · часть ₽32,000.33 из ₽150,000 | false', '£1,000 · из них взято £1,000 · вне плана £271', 'Оплачено вне плана в октябре: ушло £271 (1 платёж). Эти строки стоят в списках ниже, серым; в расчёт плана они не входят.'],
    'on «Касса»: the rest is a grey line with its remark «часть ₽32,000.33 из ₽150,000», nothing to type or press; the list\'s head and the month\'s sentence count it');
  await pg.context().close();
});

await run('daily', 'from 1 October 2026 a move to a founder\'s Daily or Monthly account is a transfer between own accounts: in no founders\' figure, no «Дивиденды», no month\'s «Расход», no report; a September one is his taking; a card payment is his whatever its label', async () => {
  // «Вывод» 2,000, everybody's, written on 20 Sep. Mika moves 100 to his Daily account on 30 Sep, and 150 on 3 Oct;
  // Misha 240 to his Monthly on 4 Oct; Mika pays 25 by card under the label «daily» on 3 Oct, and 12.50 by card on
  // 4 Oct. The withdrawal takes 100 (September: his taking, as the sheet had it) + 25 + 12.50 = 137.50. The October
  // moves, 150 and 240, are no founder's: they leave the Wise balance (typed for 1 Oct: 20,000 − 150 − 240 − 25 −
  // 12.50 = 19,572.50) and nothing else. Before the decision the withdrawal took them too: 527.50.
  const C20 = ms('2026-09-20T08:00:00Z'), U = ms('2026-10-05T09:00:00Z');
  const tx = [cardText(filed('s30', '2026-09-30', -100, 'mika', 'daily', { at: U }), '100,00 GBP перемещено сюда: Mika Daily'),
    cardText(filed('o03', '2026-10-03', -150, 'mika', 'daily', { at: U }), 'Moved 150.00 GBP to Mika Daily'),
    cardText(filed('m04', '2026-10-04', -240, 'misha', 'monthly', { at: U }), '240,00 GBP перемещено сюда: Misha Monthly'),
    cardText(filed('c03', '2026-10-03', -25, 'mika', 'daily', { at: U }), 'Card transaction of 25.00 GBP issued by Lunch Place'),
    cardText(filed('c04', '2026-10-04', -12.5, 'mika', '', { at: U }), 'Card transaction of 12.50 GBP issued by Lunch Place')];
  const L = ledger(tx), P = plan3({ banks: [bal('Wise', 'GBP', 20000, '2026-10-01', { at: ms('2026-10-01T17:00:00Z') })], team: [row('t1', 'Person Z', 3000, '2026-10-28', { blk: 'cogs', c0: C20 })], div: [row('w1', 'Вывод', 2000, '2026-10-01', { blk: 'div', c0: C20 })] });
  const M = await C(L, P, D17), w = item(M, 'w1'), b = M.month.blocks;
  same([w.rows, w.wd.got, w.wd.by, M.items.some((it) => it.rows.includes('o03') || it.rows.includes('m04'))], [['s30', 'c03', 'c04'], 137.5, [{ c: 'mika', l: 'daily', gbp: 125 }, { c: 'mika', l: '', gbp: 12.5 }], false],
    'the withdrawal holds Mika\'s September move (100) and his two card payments (25 under «daily», 12.50): 137.50 - the October moves are no taking');
  same([b.div.fact, b.other.fact, b.team.fact, b.tax.fact, SECS.some((k) => (offOf(M).by[k] || { rows: [] }).rows.some((r) => ['o03', 'm04'].includes(r.id))), M.now, M.free && M.free.wd.gbp],
    [37.5, 0, 0, 0, false, 19572.5, 1862.5], 'October: the founders\' block holds the card payments alone (37.50); no cost of the studio grew by the moves; they are in no list of the month - and they left the bank: «Денег сейчас» 19,572.50; the withdrawal still has 1,862.50 to go');
  // (the review of 17 October 2026) A move BACK from a Daily account is the same transfer the other way, and a direct
  // debit under the label «daily» is the founder's own payment. Mika moves 50 back from his Daily on 5 Oct (filed in
  // his block under «daily», as money coming back), and pays 30 by direct debit under «daily». The 50 is in no
  // founders' figure (before: a refund of 50 that took October's dividends to 37.50 − 50 = −12.50, and stood «вне
  // плана»); the 30 is his taking (before: read as a move by its label alone, and in nothing): the withdrawal holds
  // 137.50 + 30 = 167.50, October's dividends 37.50 + 30 = 67.50; the Wise balance 19,572.50 + 50 − 30 = 19,592.50.
  const Lb = ledger(tx.concat([cardText(filed('b05', '2026-10-05', 50, 'mika', 'daily', { at: U }), 'Moved 50.00 GBP from Mika Daily'), cardText(filed('dd05', '2026-10-05', -30, 'mika', 'daily', { at: U }), 'Direct debit to Fitness Club')]));
  const Mb = await C(Lb, P, D17), wb = item(Mb, 'w1');
  same([wb.rows, wb.wd.got, Mb.month.blocks.div.fact, SECS.some((k) => (offOf(Mb).by[k] || { rows: [] }).rows.some((r) => r.id === 'b05')), Mb.now, Mb.free && Mb.free.wd.gbp],
    [['s30', 'c03', 'c04', 'dd05'], 167.5, 67.5, false, 19592.5, 1832.5], 'a move back from Mika\'s Daily account is in no founders\' figure and in no list; a direct debit under «daily» is his - the withdrawal holds it, and October\'s dividends count it');
  // the one test the whole page asks (Live.daily)
  const asks = await page.evaluate((rows) => rows.map((r) => window.__money.daily(r)), [
    { d: '2026-10-03', c: '', l: '', dir: -1, o: { a: -50, p: 'Mika Daily', t: '50,00 GBP перемещено сюда: Mika Daily' } },
    { d: '2026-10-03', c: '', l: '', dir: -1, o: { a: -50, p: '', t: 'Moved 50.00 GBP to Vanya Monthly' } },
    { d: '2026-10-03', c: 'misha', l: 'Misha Daily', a: 50, o: { a: -50, t: 'Sent money' } },
    { d: '2026-09-30', c: 'mika', l: 'daily', a: 50, o: { a: -50, t: 'Moved 50.00 GBP to Mika Daily' } },
    { d: '2026-10-03', c: 'mika', l: 'daily', a: 50, o: { a: -50, t: 'Card transaction of 50.00 GBP issued by Lunch Place' } },
    { d: '2026-10-03', c: 'mika', l: 'daily', a: -50, o: { a: 50, t: 'Moved 50.00 GBP from Mika Daily' } },
    { d: '2026-10-03', c: 'other', l: 'daily', a: 50, o: { a: -50, t: 'daily' } },
    { d: '2026-10-03', c: 'mika', l: 'tfl', a: 5, o: { a: -5, t: 'Card transaction of 5.00 GBP issued by Travel' } },
    { d: '2026-10-03', c: '', l: '', dir: 1, o: { a: 50, p: '', t: '50,00 GBP перемещено отсюда: Mika Daily' } },
    { d: '2026-10-03', c: 'mika', l: 'daily', a: 30, o: { a: -30, t: 'Direct debit to Fitness Club' } },
    { d: '2026-10-03', c: 'vanya', l: 'monthly', a: 30, o: { a: -30, t: 'STANDING ORDER TO FLAT' } },
    { d: '2026-10-03', c: 'mika', l: 'daily', a: -20, o: { a: 20, t: 'Card refund from Lunch Place' } }]);
  // (the review of 17 October 2026: a move back from a Daily account is internal too - it was a refund of a move that
  // no longer counts; and the label alone marks a move only on a row whose statement names no payment - by card, by
  // direct debit or by standing order)
  same(asks, [true, true, true, false, false, true, false, false, true, false, false, false], 'a move is known by the statement (Russian or English) - to a Daily or Monthly account or back from one - or by a founder\'s label «daily»/«monthly» on money that left; not before October, not a payment by card, direct debit or standing order whatever its label, not a label of another block, not a founder\'s ordinary card payment or its refund');
  // On the page: a statement read now files the October move as a transfer between own accounts, and the September
  // one and the card payment wait in «Разбор» as they always did.
  const pg = await scene('daily', L, P, { at: AT17 });
  await feed(pg, wiseCsv([['TRANSFER-91', '2026-10-09', -60, 'Moved 60.00 GBP to Vanya Daily', '', 'Vanya Daily'], ['TRANSFER-92', '2026-09-29', -70, 'Moved 70.00 GBP to Vanya Daily', '', 'Vanya Daily'], ['CARD-93', '2026-10-09', -9.5, 'Card transaction of 9.50 GBP issued by Lunch Place', '', '']]));
  await puts('led', 1);
  const where = (id) => { const t = (store.led.doc.tx || []).find((r) => r.key && r.key.includes(id)), i = (store.led.doc.inbox || []).find((r) => r.key && r.key.includes(id)); return t ? 'table:' + t.c : i ? 'inbox:' + (i.c || '') : 'nowhere'; };
  same([where('TRANSFER-91'), where('TRANSFER-92'), where('CARD-93')], ['table:skip', 'inbox:', 'inbox:'], '«Разбор» files the move of 9 Oct as a transfer between own accounts at once; the move of 29 Sep and the card payment wait to be sorted, as before');
  // (the review of 17 October 2026) The move is never paired: its other side, Vanya's Daily account, sends no
  // statement. A client's 60 that reaches Revolut the next day - the same sum, another account, within four days -
  // waits in «Разбор» to be sorted. Before, the move was the sure leg of a pair, and took the client's payment into
  // the table as a transfer between own accounts, without a question: gone from revenue, VAT and «Отчёты».
  await pg.evaluate((c) => { window.__tx.feed(window.__tx.parseGrid(window.__tx.parseCSV(c), 'revolut.csv'), 'revolut.csv'); }, 'ID,Date,Amount,Currency,Description\n77,10-10-2026,60.00,GBP,NEW CLIENT LTD INV 12');
  await sleep(700);
  await pg.click('.nav [data-tab="inbox"]');
  const moved = (store.led.doc.tx || []).find((r) => r.key && r.key.includes('TRANSFER-91')) || {};
  same([await pg.$$eval('#view-inbox .op', (l) => l.filter((e) => /NEW CLIENT/.test(e.textContent)).length), (store.led.doc.tx || []).some((r) => r.o && /NEW CLIENT/.test(r.o.t || '')), !!moved.pair, moved.c],
    [1, false, false, 'skip'], 'a client\'s 60 on Revolut the next day waits in «Разбор»: the move to Vanya\'s Daily account pairs with nothing and takes nobody\'s payment with it');
  // «Таблица»: the October moves stand among the transfers, saying where they went; the founders' blocks do not hold them
  await pg.click('.nav [data-tab="settings"]');
  await pg.click('#view-settings .set-nav [data-tabgo="ledger"]');
  await pg.click('#view-ledger details.card summary');
  const trs = await pg.$$eval('#view-ledger details.card tbody tr', (l) => l.map((tr) => [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  const blk = (k) => pg.$$eval(`#view-ledger .blk.${k} tbody tr[data-row]`, (l) => l.map((tr) => tr.dataset.row));
  same([trs.filter((c) => /Daily|Monthly/.test(c[1])).map((c) => [c[1], c[4]]).sort(), (await blk('mika')).sort(), (await blk('misha')).sort()],
    [[['Wise → Mika Daily', 'на Daily с октября — внутренний'], ['Wise → Misha Monthly', 'на Daily с октября — внутренний'], ['Wise → Vanya Daily', 'на Daily с октября — внутренний']], ['c03', 'c04'], []],
    '«Таблица»: the three October moves are among the transfers between own accounts, each saying where it went, in plain words; Mika\'s block holds his two card payments, Misha\'s nothing (the September move is in the third quarter)');
  // «Месяцы» for Mika, October: his card payments, and the words that say where the moves are
  await pg.click('.nav [data-tab="dashboard"]');
  await pg.click('#view-dashboard [data-scope="month"]');
  await pg.selectOption('#periodSel', '2026-10');
  await pg.click('#view-dashboard [data-focus="f:mika"]');
  same([(await pg.$$eval('#view-dashboard tr[data-reprow]', (l) => l.map((tr) => tr.dataset.reprow))).sort(), plain(await pg.$eval('#fnd-daily', (e) => e.textContent))],
    [['c03', 'c04'], 'С октября 2026 переводы на Daily и Monthly фаундеров — внутренние: это не вывод и не расход, их нет ни в выводах, ни в расходах. Они в «Таблице», среди переводов между своими счетами.'],
    '«Месяцы», Mika in October: his two card payments and nothing else; the report says in plain words that the October moves are internal');
  // «Отчёты», Mika's block in this month
  await pg.click('.nav [data-tab="reports"]');
  await pg.selectOption('#rep-preset', 'month');
  await pg.click('#view-reports [data-repcat="mika"]');
  same([(await pg.$$eval('#repOut tr[data-reprow]', (l) => l.map((tr) => tr.dataset.reprow))).sort(), !!(await pg.$('#rep-daily'))], [['c03', 'c04'], true], '«Отчёты», Mika\'s block, October: the same two rows, and the same words');
  await pg.context().close();
});

console.log('\n' + (errs.length ? 'PAGE ERRORS:\n  ' + errs.join('\n  ') : 'no page errors, no console errors'));
console.log(`${n - failed} of ${n} checks passed` + (failed ? ` — ${failed} FAILED` : '') + (SHARD ? ` (part ${SHARD.k} of ${SHARD.of})` : ''));
await browser.close();
// A run that checked nothing has proved nothing: a key that names no check, or a part that holds none, is not a pass.
if (!n) console.log('NOTHING WAS CHECKED' + (ONLY ? `: no check is named «${ONLY}»` : ''));
process.exit(failed || errs.length || !n ? 1 : 0);
