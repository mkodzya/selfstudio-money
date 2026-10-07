#!/usr/bin/env node
// Money's forecast, checked in a real browser.
//
// Money (apps/web/public/money/index.html) is one static page; everything it
// knows about the weeks ahead comes out of one pure function inside it,
// Live.compute(ledger, plan, T, opts). This file is that function's acceptance
// test: the fixtures of the design's §7 that the first deliverable can answer,
// run through window.__money.compute, and after every one of them the
// invariants of §5 — the rules that keep a pound from being counted twice.
//
// And it is the test of the first screen, «Сегодня», which draws that model
// and edits the plan: the checks named «… on screen» load the page on a
// fixture, press what a founder would press, and hold every figure the screen
// shows (each carries data-live and data-v) against the model — and the model
// against §5 — after every press.
//
// And of «Касса», where the plan is typed: the monthly constructor
// («constructor», «typing»), the hand mark («mark»), the plan day by day with
// its advice («days»), the one way in for the old planner's plan («old
// plan»), the plan's own save («saving»), and how the tab looks on a phone
// and on a desk («kassa looks»). «kassa figures» holds its six figures
// against those of «Сегодня» for the same two documents.
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
// `-e ONLY=8` or `-e ONLY=late` narrows a run to the checks whose number or
// name matches. `-e SHOTS=/app/shots` (with a folder mounted there) also saves
// full-page pictures of «Сегодня» and «Касса» in their main states, for
// looking at.
//
// HOW THE DESIGN'S FIXTURES WERE ADAPTED. The design reads a balance off a
// statement; this deliverable has only the balance a founder types, and a
// bank's statements "reach" the date of its newest row. So:
//  · «statement, balance 10,000, thru 5 Oct» is here a typed balance as of
//    30 Sep, the statement's rows after it, and one row of nothing dated
//    5 Oct on that bank (`reach`), which is what "reaches 5 Oct" means now.
//    Every figure of the design then follows unchanged.
//  · The design's names are kept — Client A, Person B — and the ledger of
//    fixture A also knows a Client Z and a Person Z from 2025. Without them
//    the rule that links a typed name to "the only label with the same first
//    word" takes every «Client …» for Client A, which no real ledger with
//    more than one client would do, and the design's own figures assume not.
//  · «tap, then upload the statement» is a mark whose `at` is earlier than
//    the `at` of the statement's rows: the engine lets a row take a mark's
//    place only if it was uploaded after the mark was made.
// In the checks of the model, where a step of §7 is a tap, the plan document
// is given as that tap would leave it; the checks «on screen» make the taps.
//
// WHAT OF §7 IS HERE: 1–4, 6–21 and 26 on the model, under their own numbers;
// 8, 9, 13, 20, 26 and 27 again through the screen, and 4 through «Касса»
// («mark»); 30, the shell. Not here,
// because they need what the first deliverable does not build: 5 (the
// same-day question), 22–25 (balances read off statements, drift, repeats
// between files, staleness pills), the part of 27 about the old plan's rows
// (card 6), 28–29 (two browsers live, undo as an inverse).
// Of §5: 1, 3, 4, 5, 7, 11, 14 and 16 are asserted after every compute, 12 on
// every compute and across browsers, 2 and 11 by tapping every counted line
// («taps»), 10 and 15 in «transfer», 13 in «30», «27 on screen» and wherever
// «Касса» is only looked at, 8 by handing the documents in frozen and in
// «mark», 14 again on the page in «kassa figures». 6 is in «9 on screen»;
// 9 and 17 are the uploader's, which is the next deliverable's.
//
// AFTER THE REVIEW. Four reviewers went through the first deliverable; what they found and was fixed is held by the
// checks from «marks» to «small words», near the end, each of which failed on the build it was written against.
// Two things every model must now keep as well: the running month's columns add up, and a hand mark is measured
// against the statements uploaded after it. «taps» also holds the month's result under every mark.
//
// AFTER THE FIRST LOOK. The finished screens were looked at on the fabricated studio, and two things changed before
// the founders saw them. «cautious»: the cautious scenario is shown only where a founder switched it on — every
// check that looks at a screen now also holds that a plan with the switch off says and draws nothing of it, and the
// checks of the cautious line's own words run on plans with it on. «one press»: «оплачено» is one press on every
// row, the ones the page filled in from history included. «one press, reviewed»: what a reviewer then found a marked
// forecast doing when its statement came — each part of it failed on the build it was written against.
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
// Figures of the model against the design's, to the penny.
const figs = (M, want, msg) => {
  const got = {};
  let good = true;
  for (const [k, v] of Object.entries(want)) {
    const g = k === 'verdict' ? M.verdict.id : M[k];
    got[k] = g;
    if (typeof v === 'number' ? !close(g, v) : g !== v) good = false;
  }
  return ok(good, msg + ' — ' + Object.entries(want).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toLocaleString('en-GB') : v}`).join(' · '), got);
};
const sum = (list) => list.reduce((a, v) => a + v, 0);
const round2 = (v) => Math.round(v * 100) / 100;

// ---- dates and moments the fixtures name ----
const T = '2026-10-06';
const FX = { USD: 1.35, EUR: 1.17, RUB: 118, AMD: 525 };
const ms = (iso) => Date.parse(iso);
const AT1 = ms('2026-10-05T09:00:00Z'); // statement f1 was uploaded on Monday morning
const C0 = ms('2026-10-06T08:00:00Z'); // the founders typed their rows on Tuesday morning
const AT2 = ms('2026-10-06T10:00:00Z'); // statement f2 came two hours after that
const TAP = ms('2026-10-06T11:00:00Z'); // noon in London: the moment of a tap
const AT3 = ms('2026-10-06T13:00:00Z'); // a statement uploaded after that tap
const pad = (v) => String(v).padStart(2, '0');
const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

// ---- made-up rows ----
// A row of the old sheet: a block, a name, an amount in pounds, no bank text.
const sheet = (id, d, a, c, l, more = {}) => ({ id, d, a, c, b: 'Wise', l, v: 0, s: 'sheet', key: 'k|' + id, ...more });
// A statement row that has been filed: `amt` is what the bank said, signed, in `cur`.
const filed = (id, d, amt, c, l, more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, v = 0 } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  const forward = c === 'skip' || Math.sign(amt) === (c === 'rev' ? 1 : -1);
  return { id, d, a: forward ? g : -g, c, b, l, v, s: 'file', o: { a: amt, cur, t: l }, key: 'k|' + id, at };
};
// The same row still in «Разбор»: recognised (a block, a name, `auto`) or not.
const inbox = (id, d, amt, c, l, more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, auto = !!c } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  return { id, f: 'file', d, b, ac: '', dir: amt > 0 ? 1 : -1, a: g, o: { a: amt, cur, t: l || 'unknown', p: '', h: '', fix: true }, key: 'k|' + id, s: 'file', c, l, v: 0, auto, twin: null, at };
};
// «the statements of this bank reach this day»: a row of nothing, which moves no balance and is in no flow.
const reach = (b, d, cur = 'GBP') => filed(`reach-${b}-${d}`, d, 0, 'skip', '', { b, cur });
const ledger = (tx, inb = []) => ({ v: 1, tx, inbox: inb, rules: [], fx: { ...FX }, history: {}, aliases: {}, own: [], ownSeen: [], holders: {} });

const bal = (bank, cur, amt, asOf, more = {}) => ({ id: `b-${bank}-${cur}`, name: `${bank} — ${cur}`, bank, cur, amt, asOf, at: ms(asOf + 'T17:00:00Z'), by: 'Mika', ...more });
const row = (id, name, amt, date, more = {}) => ({ id, name, amt, cur: 'GBP', bank: 'Wise', date, on: true, c0: C0, m: { t: C0, by: 'Mika' }, sure: true, ...more });
const plan = (parts = {}) => ({ v: 2, cushion: 5000, banks: [], inflows: [], team: [], taxes: [], other: [], ser: {}, vat: { on: true }, log: [], ...parts });
const paid = (on, at = TAP, more = {}) => ({ on, at, by: 'Mika', ...more });
// The cautious scenario is shown only where a founder switched it on («Настройки → Прогноз»). A fixture is a plan
// nobody has switched anything in, so it is off; the checks that are about the cautious line's own words and figures
// hand this in.
const CAUTIOUS = { cautious: { on: true } };

// Fixture A. Sheet rows, April–September: Client A £8,000 on the 28th, Person B £6,000 on the 20th, Tool S £120 on
// the 3rd. Wise GBP was 10,120 at the end of 30 Sep; statement f1 brought Tool S on 3 Oct and reaches 5 Oct.
const HALF = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
function ledA({ skip = () => false, tx = [], inb = [], f1 = 'filed', vat = false } = {}) {
  const rows = [sheet('z-client', '2025-06-10', 900, 'rev', 'Client Z'), sheet('z-person', '2025-06-12', 700, 'cogs', 'Person Z')];
  HALF.forEach((m, i) => {
    rows.push(sheet('a' + i, m + '-28', 8000, 'rev', 'Client A', vat && i >= 3 ? { v: [1333.33, 1333.33, 1333.34][i - 3] } : {}));
    rows.push(sheet('b' + i, m + '-20', 6000, 'cogs', 'Person B'));
    rows.push(sheet('s' + i, m + '-03', 120, 'fixed', 'Tool S'));
  });
  const waiting = [...inb];
  if (f1 === 'filed') rows.push(filed('f1', '2026-10-03', -120, 'fixed', 'Tool S'));
  else waiting.push(inbox('f1', '2026-10-03', -120, 'fixed', 'Tool S'));
  rows.push(reach('Wise', '2026-10-05'));
  return ledger(rows.filter((r) => !skip(r)).concat(tx), waiting);
}
const planA = (parts = {}) => plan({ ...parts, banks: [bal('Wise', 'GBP', 10120, '2026-09-30'), ...(parts.banks || [])] });
// Fixture D. Block `mika`, one row a month April–September: 3,000 · 3,200 · 2,800 · 3,100 · 2,900 · 3,000; the
// statement brought −600 on 2 Oct and reaches 5 Oct.
const ledD = () => ledger([
  ...[3000, 3200, 2800, 3100, 2900, 3000].map((a, i) => sheet('m' + i, HALF[i] + '-12', a, 'mika', '')),
  filed('m6', '2026-10-02', -600, 'mika', ''), reach('Wise', '2026-10-05'),
]);
// Fixture E. Six different one-off clients, one a month: 9,000 · 11,000 · 8,000 · 10,000 · 12,000 · 10,000; a
// statement with no rows that reaches 5 Oct.
const ledE = () => ledger([
  ...[9000, 11000, 8000, 10000, 12000, 10000].map((a, i) => sheet('o' + i, HALF[i] + '-10', a, 'rev', 'Client ' + 'PQRSTU'[i])),
  reach('Wise', '2026-10-05'),
]);

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
  Object.assign(store.cash, { rev: gen, rev0: gen, doc: JSON.parse(JSON.stringify(cash)), puts: 0, clash: null, bases: [], fail: false });
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
const LISTS = ['inflows', 'team', 'taxes', 'other'];
const held = { runs: 0, bad: [] };
// What §5 asks of every model, whatever went in. Numbers are the spec's: 1 END = NOW + IN − OUT; 3 a ledger row
// closes one line (or one set of lines it is the sum of) unless a founder linked it by hand; 4 one item per series
// and month, worth what is left of the usual amount; 5 every open dated line is counted once, on one day, and what
// is done, doubted or dropped is counted nowhere; 7 a hand mark is inside «сейчас» only while no statement uploaded
// after it has reached its day and only if it is later than the typed balance; 11 an average's remainder is between nothing and
// the average; 16 no total while an account in use has no balance.
function inv(M, P) {
  const bad = [];
  const say = (cond, msg) => { if (!cond) bad.push(msg); };
  const by = Object.fromEntries(M.items.map((it) => [it.id, it]));
  const acc = Object.fromEntries(M.accounts.map((a) => [a.key, a]));
  say(Object.keys(by).length === M.items.length, '4: two items share an id');
  // 16
  const open = M.accounts.filter((a) => a.active && !a.anchor).map((a) => a.key);
  say(M.v0 === open.length > 0 && JSON.stringify(M.missing) === JSON.stringify(open), '16: v0 is not "an active account has no balance"');
  say((M.now === null) === M.v0 && (M.verdict.id === 'v0') === M.v0 && (M.need === null) === !M.v0, '16: v0 and «—» do not go together');
  M.accounts.forEach((a) => {
    if (a.anchor) say(close(a.est, a.anchor.amt + a.after + a.marks, 0.011), `balance of ${a.key} is not anchor + after + marks`);
    else say(a.est === null && a.gbp === null, `${a.key} has a figure without a balance`);
  });
  if (!M.v0) say(close(M.now, sum(M.accounts.map((a) => a.gbp || 0)), 0.005 * (M.accounts.length + 1)), 'NOW is not the sum of the accounts');
  // 1
  const base = M.v0 ? 0 : M.now;
  say(Math.abs(M.END - (base + M.IN - M.OUT)) <= 0.0100001, `1: END ${M.END} ≠ NOW ${base} + IN ${M.IN} − OUT ${M.OUT}`);
  say(Math.abs(M.END_C - (base + M.IN_C - M.OUT_C)) <= 0.0100001, '1: the cautious line does not add up');
  say(M.days.length === M.H + 1 && M.days[0].d === M.T && M.days[M.H].d === M.end, 'the days are not T … T+H');
  say(M.days[M.H].e === M.END && M.days[M.H].c === M.END_C, 'END is not the last day');
  const lowOf = (k) => { const v = Math.min(...M.days.map((D) => D[k])); return [v, M.days.find((D) => D[k] === v).d]; };
  say(JSON.stringify(lowOf('e')) === JSON.stringify([M.LOW, M.LOWDAY]) && JSON.stringify(lowOf('c')) === JSON.stringify([M.LOW_C, M.LOWDAY_C]), 'LOW is not the lowest day, or LOWDAY not its first');
  // 5
  const inW = (d) => !!d && d >= M.T && d <= M.end;
  const seen = {};
  M.days.forEach((D) => D.items.forEach((id) => { seen[id] = (seen[id] || 0) + 1; say(by[id] && by[id].day === D.d, `5: ${id} is listed under a day that is not its own`); }));
  let inSum = 0;
  let outSum = 0;
  let counted = 0;
  M.items.forEach((it) => {
    const may = ['due', 'blind', 'waiting', 'unseen'].includes(it.state) || (it.state === 'late' && it.kind !== 'hist' && !(it.dir > 0 && it.step === 2));
    say(!!it.day === may, `5: ${it.id} is ${it.state} and is ${it.day ? '' : 'not '}counted`);
    say((seen[it.id] || 0) === (inW(it.day) ? 1 : 0), `5: ${it.id} is counted ${seen[it.id] || 0} times`);
    if (['done', 'doubt', 'gone', 'off', 'empty'].includes(it.state)) say(it.cash === 0 && it.cashC === 0 && !it.day && !it.dayC, `5: ${it.id} is ${it.state} and still carries money`);
    if (inW(it.day)) { counted++; if (it.cash > 0) inSum += it.cash; else outSum -= it.cash; }
  });
  for (const D of M.days) {
    for (const [b, x] of Object.entries(M.avg)) {
      const m = x.months[D.d.slice(0, 7)];
      const v = (m && D.d >= m.from ? m.perDay : 0) + (D.d === M.T && x.lump ? x.lump.left : 0);
      if (b === 'rev') inSum += v; else outSum += v;
    }
  }
  say(close(inSum, M.IN, 0.005 * (counted + 12)) && close(outSum, M.OUT, 0.005 * (counted + 12)), `5: IN/OUT are not the items and the averages (${round2(inSum)} / ${round2(outSum)} against ${M.IN} / ${M.OUT})`);
  say(close(M.inParts.typed + M.inParts.hist + M.inParts.avg, M.IN, 0.02) && close(sum(Object.values(M.outParts)), M.OUT, 0.03), 'the parts of IN or OUT do not add up');
  // 3
  const hand = new Set();
  LISTS.forEach((k) => (P[k] || []).forEach((r) => (r.tx || []).forEach((id) => hand.add(String(id)))));
  const claim = {};
  M.items.forEach((it) => it.rows.forEach((id) => (claim[id] = claim[id] || []).push(it)));
  Object.entries(claim).forEach(([id, its]) => {
    if (its.length > 1 && !hand.has(id)) say(its.every((it) => it.done && it.done.note === 'sum'), `3: ledger row ${id} closes ${its.length} lines by rule`);
  });
  // 4
  M.items.forEach((it) => {
    if (it.src !== 'occ') return;
    say(it.id === `h|${it.sk}|${it.cyc}`, `4: ${it.id} is not named after its series and month`);
    if (it.state === 'done') say(it.done.rows.length > 0, `4: ${it.id} is closed by nothing`);
    else say(close(Math.abs(it.full), Math.max(0, it.occ.E - it.occ.typ - it.occ.got), 0.011), `4: ${it.id} is ${it.full}, usual ${it.occ.E} − typed ${it.occ.typ} − paid ${it.occ.got}`);
  });
  // 7
  M.items.forEach((it) => {
    const m = it.mark;
    if (!m) return;
    const a = acc[it.acct];
    const alive = !!it.done && it.done.by === 'mark';
    if (alive) say(!m.cov || m.cov < m.on, `7: the mark on ${it.id} outlived the statements uploaded after it`);
    if (m.unseen) say(it.state === 'unseen' && m.cov >= m.on, `7: ${it.id} is unseen without reason`);
    const want = alive && !!a && !!a.anchor && (m.on > a.anchor.asOf || (m.on === a.anchor.asOf && m.at > a.anchor.at));
    say(m.counts === want, `7: the mark on ${it.id} ${m.counts ? 'is' : 'is not'} in the balance`);
  });
  M.accounts.forEach((a) => {
    const mine = M.items.filter((it) => it.mark && it.mark.counts && it.acct === a.key);
    if (mine.every((it) => it.cur === a.cur)) say(close(a.marks, sum(mine.map((it) => it.dir * it.amt * (it.vat ? 1.2 : 1))), 0.011 * (mine.length + 1)), `7: marks of ${a.key}`);
  });
  // G: the running month. Its result is the blocks' own arithmetic in every column, and M_EXP is the total's.
  const mb = M.month.blocks;
  ['fact', 'typed', 'hist', 'rest', 'total'].forEach((f) => {
    const fnd = mb.mika[f] + mb.misha[f] + mb.vanya[f];
    say(close(mb.founders[f], fnd, 0.021) && close(mb.result[f], mb.rev[f] - mb.cogs[f] - mb.fixed[f] - mb.other[f] - mb.behalf[f] - mb.tax[f] - fnd, 0.05), `G: the month's ${f} column does not add up`);
  });
  say(Object.values(mb).every((x) => close(x.total, x.fact + x.rest, 0.011) && close(x.rest, x.typed + x.hist, 0.011)) && M.month.M_EXP === mb.result.total, 'G: total is not fact + rest, or M_EXP not the result');
  say(M.month.byWord >= 0 && M.month.before.in >= 0 && M.month.before.out >= 0, 'G: what is paid on a word, or what is last month\'s, is negative');
  // 11
  Object.entries(M.avg).forEach(([b, x]) => {
    Object.entries(x.months).forEach(([m, y]) => say(y.left >= 0 && y.left <= x.E + 1e-9 && y.perDay >= 0, `11: ${b} ${m} left ${y.left} of ${x.E}`));
    if (x.lump) say(x.lump.left > 0 && x.lump.left <= x.E + 1e-9, `11: ${b} lump`);
    if (!x.on) say(x.E === 0, `11: ${b} is off and still forecast`);
  });
  // the constructor's months hold every item once
  const placed = {};
  Object.entries(M.months.by).forEach(([m, lists]) => LISTS.forEach((k) => {
    lists[k].rows.forEach((id) => { placed[id] = (placed[id] || 0) + 1; say(by[id] && by[id].ym === m && by[id].list === k, `months: ${id} is in the wrong month or list`); });
    say(lists[k].done <= lists[k].expected + 0.011 && lists[k].done >= 0, `months: ${m} ${k} done ${lists[k].done} of ${lists[k].expected}`);
    const mine = lists[k].rows.map((id) => by[id]).filter(Boolean);
    say(close(sum(mine.map((it) => it.exp)), lists[k].expected, 0.006 * (mine.length + 1)) && close(sum(mine.map((it) => it.expDone)), lists[k].done, 0.006 * (mine.length + 1)), `months: ${m} ${k} is not the sum of its rows`);
  }));
  say(M.items.every((it) => placed[it.id] === 1), 'months: an item is missing from its month, or there twice');
  say(M.items.every((it) => it.exp >= 0 && it.expDone >= 0 && it.expDone <= it.exp + 0.011 && (it.exp > 0) === (!['off', 'empty', 'gone', 'doubt'].includes(it.state) && Math.abs(it.kind === 'typed' && it.src === 'row' ? it.full : it.state === 'done' ? it.amt : it.cash) > 0.004)), 'months: a row expects something it should not, or nothing where it should');
  return bad;
}
// Runs the engine where it lives. The documents go in frozen — a function that changed what it was handed would
// throw — and the plan goes in a second time with everything the engine must not read turned upside down (§5.14):
// the plan's own rates, its horizon, the old on/off tick of the balances.
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
    return { model, deaf: model === JSON.stringify(window.__money.compute(JSON.parse(a), other, t, o)), again: model === JSON.stringify(window.__money.compute(JSON.parse(a), JSON.parse(b), t, o)) };
  }, [led, P, day, opts]);
  const M = JSON.parse(r.model);
  const bad = inv(M, P);
  if (!r.deaf) bad.push('14: the model changed with plan.fx, plan.horizon or banks[].on');
  if (!r.again) bad.push('12: the same documents gave another model');
  held.runs++;
  bad.forEach((b) => held.bad.push((note ? note + ' — ' : '') + b));
  return M;
}
const item = (M, id) => M.items.find((it) => it.id === id) || null;
const card = (M, k) => M.cards.filter((c) => c.n === k);
const acct = (M, key) => M.accounts.find((a) => a.key === key) || null;
const run = async (key, title, fn) => {
  // A number picks the check of that number; a word, every check with it in its name.
  if (ONLY && !ONLY.split(',').some((k) => (/^\d+$/.test(k) ? k === String(key).split(' ')[0] : String(key).includes(k) || title.toLowerCase().includes(k)))) return;
  console.log(`\n— ${key}. ${title}`);
  held.runs = 0;
  held.bad = [];
  try {
    await fn();
  } catch (e) {
    ok(false, `check ${key} threw: ${String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')}`);
  }
  if (held.runs) ok(!held.bad.length, `§5 held after each of its ${held.runs} computes (1, 3, 4, 5, 7, 11, 12, 14, 16; nothing handed in was changed)`, held.bad.slice(0, 8));
};

// =====================================================================================================================
// THE SCREEN. From here on a check loads the page on a pair of documents and presses what a founder would press.
// =====================================================================================================================
const sleep = (t) => new Promise((r) => setTimeout(r, t));
// The plan is saved half a second after a change, the ledger a little sooner; the fake counts every PUT it is sent.
const puts = async (doc, atLeast) => { for (let i = 0; i < 80 && store[doc].puts < atLeast; i++) await sleep(50); await sleep(150); return store[doc].puts; };
const plain = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const text = async (pg, sel) => plain(await pg.$eval(sel, (e) => e.textContent));
const texts = async (pg, sel) => (await pg.$$eval(sel, (l) => l.map((e) => e.textContent))).map(plain);

// The page on a fixture: its two documents put on the fake, the page opened on them, «Сегодня» drawn.
async function scene(name, led, P, { w = 1320, h = 900, H = 30, at } = {}) {
  serve(led, P);
  const pg = await open(name, at, { w, h });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  if (H === 30) await pg.click('#view-today [data-td-h="30"]');
  return pg;
}
// What «Сегодня» — or «Касса» — shows, as it says it: every element that carries a figure, by its key.
const look = (pg, tab = 'today') => pg.evaluate((tab) => {
  const p = tab === 'today' ? 'td' : 'cs';
  const H = +document.querySelector(`#view-${tab} [data-${p}-h][aria-pressed="true"]`).dataset[p + 'H'];
  const live = {};
  const twice = [];
  document.querySelectorAll(`#view-${tab} [data-live]`).forEach((e) => { const k = e.dataset.live; if (k in live) twice.push(k); live[k] = { v: e.dataset.v, t: e.textContent }; });
  // Whatever the tab says or draws of the cautious scenario: words in the text, in a label or a title, and the
  // dashed line of a chart (the cushion is a <line>, the scenario the only dashed <path>).
  const root = document.querySelector(`#view-${tab}`);
  const word = /осторожн/i;
  const said = [...root.querySelectorAll('*')].filter((e) => !e.closest('svg') && ([...e.childNodes].some((x) => x.nodeType === 3 && word.test(x.textContent)) || word.test((e.getAttribute('aria-label') || '') + (e.getAttribute('title') || ''))))
    .map((e) => `<${e.tagName.toLowerCase()} class="${e.getAttribute('class') || ''}"> ${e.textContent.trim().slice(0, 60)}`);
  if (word.test(root.querySelector('svg[aria-label]')?.getAttribute('aria-label') || '')) said.push('the chart\'s label');
  return { H, live, twice, said, dashed: root.querySelectorAll('svg path[stroke-dasharray]').length, M: window.__money.model({ H }), P: JSON.parse(JSON.stringify(window.__cash.state())), at: window.__cash.at() };
}, tab);
// The model's value for a key of the screen. `at` is where «Касса» stands: its month, for the keys of a month.
function want(M, k, at) {
  if (k.startsWith('mon.')) { const [, list, f] = k.split('.'); return ((M.months.by[at.month] || {})[list] || {})[{ exp: 'expected', done: 'done', avg: 'avg' }[f]]; }
  if (k === 'say') return M.v0 ? 'v0' : M.LOW < 0 ? 'minus' : M.LOW < M.cushion ? 'low' : 'fine';
  const one = { verdict: M.verdict.id, now: M.now, marks: M.marksGbp, in: M.IN, out: M.OUT, end: M.END, endc: M.END_C, late: M.LATE, mexp: M.month.M_EXP, low: M.v0 ? M.need : M.LOW, lowc: M.LOW_C, lowday: M.LOWDAY, lowcday: M.LOWDAY_C, minusday: M.minusDay };
  if (k in one) return one[k];
  if (k.startsWith('in.')) return M.inParts[k.slice(3)];
  if (k.startsWith('out.')) return M.outParts[k.slice(4)];
  if (k.startsWith('m.')) { const [, b, f] = k.split('.'); return M.month.blocks[b][f]; }
  if (k.startsWith('acct.')) return acct(M, k.slice(5)).est;
  if (k.startsWith('it.')) return item(M, k.slice(3)).cash;
  if (k.startsWith('day.')) { const [, d, f] = k.split('.'); const D = M.days.find((x) => x.d === d); return f === 'e' ? D.e : f === 'in' ? round2(D.in - D.dripIn) : round2(D.out - D.dripOut); }
  if (k.startsWith('drip.')) { const per = (b) => (M.avg[b].months[M.T.slice(0, 7)] || {}).perDay || 0; return k === 'drip.in' ? per('rev') : sum(Object.keys(M.avg).filter((b) => b !== 'rev').map(per)); }
  return undefined;
}
const PRINTED = ['now', 'in', 'out', 'low', 'late', 'mexp', 'end', 'endc', 'lowc'];
const MUST = ['verdict', 'now', 'in', 'out', 'low', 'late', 'mexp', 'end', 'in.typed', 'in.hist', 'in.avg', 'out.team', 'out.founders', 'out.taxes', 'out.other']
  .concat(['rev', 'cogs', 'fixed', 'other', 'behalf', 'tax', 'founders', 'result'].flatMap((b) => ['fact', 'rest', 'total', 'usual'].map((f) => `m.${b}.${f}`)));
const SIX = ['now', 'in', 'out', 'low', 'late', 'mexp', 'in.typed', 'in.hist', 'in.avg', 'out.team', 'out.founders', 'out.taxes', 'out.other'];
// Every figure on «Сегодня» (or, with tab 'cash', on «Касса») is the model's, and the model keeps §5. Returns what
// was seen, for the check's own figures.
async function holds(pg, msg, tab = 'today') {
  const S = await look(pg, tab);
  const off = [];
  for (const [k, e] of Object.entries(S.live)) {
    const w = want(S.M, k, S.at);
    const good = w === undefined ? false : w === null ? e.v === '' : typeof w === 'number' ? close(parseFloat(e.v), w, 0.006) : e.v === w;
    if (!good) off.push(`${k}: the screen says ${e.v}, the model ${w}`);
    if (!plain(e.t) && k !== 'lowcday') off.push(`${k}: nothing is drawn`);
    // … and what is printed is that number: the large figures and the month's table are whole pounds.
    if (typeof w === 'number' && (PRINTED.includes(k) || k.startsWith('m.'))) {
      const shown = parseFloat(e.t.replace(/[^\d.]/g, '')) * (/[−-]/.test(e.t) ? -1 : 1);
      if (!(Math.abs(shown - w) <= 0.51)) off.push(`${k}: «${plain(e.t)}» is printed for ${w}`);
    }
  }
  // The cautious figures are on the screen exactly when the plan asks for the scenario — and when it does not,
  // nothing of it is: not a figure, not a word, not a line.
  const two = S.M.cautious && !S.M.v0;
  (tab === 'today' ? MUST.concat(two ? ['endc'] : []) : SIX).concat(S.M.v0 ? [] : ['lowday']).concat(two ? ['lowc', 'lowcday'] : []).forEach((k) => { if (!(k in S.live)) off.push(`${k}: not on the screen`); });
  if (S.M.cautious !== (S.P.cautious && S.P.cautious.on === true)) off.push(`the model says cautious ${S.M.cautious}, the plan ${JSON.stringify(S.P.cautious)}`);
  if (!S.M.cautious) {
    ['endc', 'lowc', 'lowcday'].forEach((k) => { if (k in S.live) off.push(`${k}: on the screen with the cautious scenario off`); });
    S.said.forEach((e) => off.push(`the cautious scenario is off and is spoken of: ${e}`));
    if (S.dashed) off.push('the cautious scenario is off and its dashed line is drawn');
  }
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
  for (const k of ['vat', 'monthly', 'extra']) if (f[k] !== undefined) await pg.setChecked(c + `[data-ed-f="${k}"]`, f[k]);
}
// «Добавить» → what → the fields → «Добавить». Returns the id the new row was given.
async function addRow(pg, what, f, who) {
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + `[data-ed-what="${what}"]`);
  if (who) await pg.click(K('add') + `[data-ed-who="${who}"]`);
  await fill(pg, 'add', f);
  await pg.click(K('add') + '[data-ed-save]');
  const list = what === 'founder' ? 'other' : what;
  return pg.evaluate((k) => { const l = window.__cash.state()[k]; return l[l.length - 1].id; }, list);
}
// The list of days at its full length, not only the next fortnight.
const allDays = async (pg) => { if ((await text(pg, '#view-today [data-td-flip="all"]')).startsWith('Показать')) await pg.click('#view-today [data-td-flip="all"]'); };
const inDays = (id) => `#view-today .td-days .td-row[data-ed-open="${id}"]`;
// Tap a row of the days; the list is opened to its full length if the row is further than a fortnight.
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
  const mine = async () => canon(await pg.evaluate(() => { const P = window.__cash.state(); return [P.banks, P.inflows, P.team, P.taxes, P.other, P.ser, P.tails, P.vat, P.cautious, P.cushion]; }));
  const theirs = () => { const P = store.cash.doc; return canon([P.banks, P.inflows, P.team, P.taxes, P.other, P.ser, P.tails, P.vat, P.cautious, P.cushion]); };
  for (let i = 0; i < 80; i++) { if ((await mine()) === theirs()) return true; await sleep(50); }
  return false;
}
const editRow = async (pg, id, f) => { await openRow(pg, id); await fill(pg, 'row', f); await pg.click(K('row') + '[data-ed-save]'); };
const tapRow = async (pg, id, verb) => { await openRow(pg, id); await pg.click(K('row') + `[data-ed-do="${verb}"]`); };
const stored = (S, id) => LISTS.flatMap((k) => S.P[k]).find((r) => String(r.id) === id) || null;

await run('30 the shell', 'where the page opens, its tabs, a phone, midnight — and that opening it writes nothing', async () => {
  // `page` was opened at the top on the fabricated studio, whose «Разбор» holds four rows.
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, [...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden).map((e) => e.id), location.hash, document.querySelector('#inboxBadge').textContent]), ['today', ['view-today'], '', '4'], 'with four rows waiting in «Разбор» the page opens on «Сегодня», and puts nothing in the address');
  same(await page.$$eval('.nav [data-tab]', (e) => e.map((x) => [x.firstChild.textContent.trim(), x.dataset.tab].join(' '))), ['Сегодня today', 'Касса cash', 'Разбор inbox', 'Загрузка upload', 'Месяцы dashboard', 'Отчёты reports', 'Таблица ledger', 'Настройки settings'], 'the tabs read Сегодня · Касса · Разбор · Загрузка · Месяцы · Отчёты · Таблица · Настройки, each under the id it had');
  ok(/<a class="wordmark" href="#today" data-tab="today">/.test(fs.readFileSync(PUB + '/money/index.html', 'utf8')), 'the wordmark leads to «Сегодня» (under /money/ on the platform\'s own names the page still points it at the platform, as before)');
  for (const t of ['cash', 'inbox', 'upload', 'dashboard', 'reports', 'ledger', 'settings', 'today']) {
    await page.click(`.nav [data-tab="${t}"]`);
    const vis = await page.evaluate(() => [[...document.querySelectorAll('main > [id^="view-"]')].filter((e) => !e.hidden).map((e) => e.id).join(), location.hash].join(' '));
    ok(vis === `view-${t} #${t}` && (await page.$eval('#view-' + t, (e) => e.innerText.trim().length)) > 20, `tab ${t} opens, alone, under #${t}, with something in it`, vis);
  }
  await page.click('.nav [data-tab="dashboard"]');
  same([await text(page, '#view-dashboard h1'), await page.$eval('#periodSel', (e) => e.value), await text(page, '#view-dashboard .page-sub'), (await texts(page, '#view-dashboard .dash th')).find((x) => x.includes('идёт')), await page.$eval('#view-dashboard .dash a[data-tab]', (e) => e.dataset.tab)],
    ['Месяцы', '2026-09', 'Сентябрь 2026 · вся студия', 'окт 26 · идёт', 'today'], '«Месяцы» opens on September 2026, the last month that is whole; October\'s column is headed «идёт» and links to «Сегодня»');
  await page.click('#view-dashboard .dash a[data-tab]');
  same(await page.evaluate(() => document.querySelector('.nav .active').dataset.tab), 'today', '… and the link goes there');
  same(await page.evaluate(() => [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => /скопировать/i.test(e.textContent)).length), 0, 'no button anywhere says «Скопировать» ');
  same(await page.evaluate(() => [typeof window.__money.compute, typeof window.__money.model, typeof window.__money.upgrade, typeof window.__money.passed, window.__money.today, window.__money.by]), ['function', 'function', 'function', 'function', T, 'Mika'], 'window.__money: compute, model, upgrade, passed, today — the date in London — and who is signed in');
  const S = await holds(page, 'the fabricated studio, 60 days');
  same([S.M.v0, S.P.v, S.P.banks.every((b) => b.asOf === '2026-10-04' && !b.legacy)], [false, 2, true], '… whose plan is already version 2, with every balance typed as of 4 Oct');
  ok(/^вт 6 окт · выписки и остатки по 4 окт \(.+\)$/.test(await text(page, '#view-today .page-sub')) && (await text(page, '#view-today .kpi .lbl')) === 'Денег на 4 окт' && (await text(page, '#view-today .td-say')).startsWith('По остаткам на 4 октября'), 'the head, the first figure and the sentence all say as of which day they speak: 4 Oct, two days back', [await text(page, '#view-today .page-sub'), await text(page, '#view-today .td-say')]);
  await calm(page, 'the fabricated studio');
  const viaDocs = await page.evaluate(async () => {
    const led = (await (await fetch('/api/founder/money')).json()).doc;
    return JSON.stringify(window.__money.compute(led, window.__cash.state(), window.__money.today, { H: 60 }));
  });
  ok(JSON.stringify(S.M) === viaDocs && S.M.T === T && S.M.items.length > 20, `model() is compute() on what the page holds: ${S.M.items.length} items, ${S.M.series.length} series`);
  // The chart answers a tap with that day's lines; «Открыть день» and the sentence's own button lead to «Касса · По дням».
  await page.click('#view-today #td-chart .hit[data-td-i="23"]');
  ok((await text(page, '#view-today #td-dayinfo .td-day b')) === 'чт 29 окт' && (await texts(page, '#view-today #td-dayinfo .td-row .td-nm')).includes('Meridian Labs'), 'a tap on a day of the chart lists that day: on 29 Oct, the payment the largest client promised', await texts(page, '#view-today #td-dayinfo .td-row .td-nm'));
  await calm(page, 'with a day of the chart open');
  await page.click('#view-today #td-dayinfo [data-td-days]');
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, location.hash, document.querySelector('#cs-days').hidden]), ['cash', '#cash-days', false], '«Открыть день» goes to «Касса · По дням»');
  await page.click('.nav [data-tab="today"]');
  same(await text(page, '#view-today .td-verdict button'), 'Как подстраховаться', 'the sentence «впритык» carries «Как подстраховаться»');
  await page.click('#view-today .td-verdict [data-td-days]');
  same(await page.evaluate(() => [document.querySelector('.nav .active').dataset.tab, location.hash]), ['cash', '#cash-days'], '… which goes there too');
  await page.click('#view-cash [data-cs-view="plan"]');
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


// =====================================================================================================================
// THE MODEL. The fixtures of the design, through window.__money.compute.
// =====================================================================================================================
await run('upgrade', 'the plan document: v1 becomes v2 once, the same way in any browser', async () => {
  const v1 = {
    v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 4000, horizon: '2026-11-10', fx: { USD: 1.3, RUB: 110, EUR: 1.2, AMD: 500 },
    banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }, { id: 'r2', name: 'Tochka — RUB', amt: 0, cur: 'RUB', bank: 'Tochka', on: true, tag: '', info: false, date: '' }],
    inflows: [{ id: 'r3', name: 'Client A', amt: 8000, cur: 'GBP', bank: 'Wise', on: true, tag: 'нужен PO', info: false, date: '2026-10-27' }],
    team: [{ id: 'r4', name: 'Person B', amt: 6000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-09-20', paid: true, paidAdj: { bank: 'Wise', cur: 'GBP', delta: -6000 } },
      { id: 'r4', name: 'Person Q', amt: 500, cur: 'GBP', bank: 'Wise', on: false, tag: '', info: false, date: '', fixed: true }],
    taxes: [], other: [{ id: 'keep-me', name: 'Подписки', amt: 400, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-15' }],
  };
  const before = JSON.stringify(v1);
  const [a, b, twice] = await page.evaluate((p) => { const x = window.__money.upgrade(p); return [x, window.__money.upgrade(JSON.parse(JSON.stringify(p))), window.__money.upgrade(x)]; }, v1);
  same(a, b, 'the same v1 document gives the same v2 document: two browsers upgrading at once write the same thing');
  same(twice, a, 'a v2 document goes through unchanged');
  const ids = ['banks', ...LISTS].flatMap((k) => a[k].map((r) => r.id));
  ok(new Set(ids).size === ids.length && !ids.some((id) => /^r\d+$/.test(id)) && ids.includes('keep-me'), 'step 1: every r1, r2… and every repeated id is replaced; an id that was already its own is kept', ids);
  same(a.banks.map((r) => [r.amt, r.legacy, 'asOf' in r, 'at' in r]), [[18000, true, false, false], [0, true, false, false]], 'step 2: an old balance keeps its figure and is marked legacy — it has no date, so it is no anchor');
  const t = ms(v1.savedAt);
  same(LISTS.flatMap((k) => a[k].map((r) => [r.c0, r.m.t, r.blk, r.sure])), [[0, t, 'rev', true], [0, t, 'cogs', true], [0, t, 'cogs', true], [0, t, 'other', true]], 'step 3: rows get c0 0, the document\'s own save time, their list\'s block, sure');
  same([a.team[0].paid, 'paidAdj' in a.team[0], 'paid' in a.team[1], a.team[1].fixed, a.inflows[0].tag], [{ on: '', legacy: true }, false, false, true, 'нужен PO'], '… «оплачено» becomes a legacy mark without the balance note; «фикс» and the tag stay');
  same([a.v, a.ser, a.vat, a.cautious, a.log, a.tails, a.cushion, a.horizon, a.fx.USD], [2, {}, { on: true }, { on: false }, [], Object.fromEntries(['rev', 'cogs', 'small', 'behalf', 'mika', 'misha', 'vanya'].map((k) => [k, { on: true }])), 4000, '2026-11-10', 1.3], 'step 4: ser, tails, vat, the cautious scenario switched off, log, v 2 — and every v1 field is still there');
  same(JSON.stringify(v1), before, 'the document handed in is not touched');
  // what the engine makes of it: the first lines of the design's test 27 that need no screen
  const M = await C(ledA(), v1);
  same([M.verdict.id, M.now, M.cards[0].n, M.cards[0].accounts], ['v0', null, 1, [{ key: 'Wise|GBP', name: 'Wise GBP', old: 18000 }]], 'after the upgrade: v0 naming Wise GBP, with the old 18,000 to offer; Tochka, which nothing uses, is not asked for');
  same([item(M, a.team[0].id).state, item(M, a.team[0].id).done.by, item(M, a.team[1].id).state], ['done', 'legacy', 'off'], 'a row paid in the old Касса is done and moves no balance; a row switched off there is off');
  same((await C(ledA(), a)).IN, M.IN, 'compute takes a v1 document and a v2 one alike');
  // Person B's row was paid in the old Касса for 20 Sep, and the sheet holds that payment. It must not move on to
  // October and stand in for the payout that is still to come — or the first screen is a month of payroll too rosy.
  same([M.OUT, (item(M, 'h|cogs|person b|2026-10') || {}).state], [6520, 'due'], 'a row the old Касса had as paid does not take the place of next month\'s forecast: October\'s Person B is still expected (6,000 + Tool S 120 + «Подписки» 400)');
  const okd = await C(ledA(), planA({ team: [row('b', 'Person B', 6000, '2026-09-20', { c0: 0, paid: paid('2026-10-01', ms('2026-10-01T10:00:00Z'), { ok: true }) })] }));
  same([okd.OUT, item(okd, 'b').state, (item(okd, 'h|cogs|person b|2026-10') || {}).state], [6120, 'done', 'due'], '… nor does a row marked by hand and confirmed («Всё верно») for a month the statements show as paid');
  const early = await C(ledA({ skip: (r) => r.id === 'b5' }), planA({ team: [row('b', 'Person B', 6000, '2026-09-20', { c0: 0, paid: { on: '', legacy: true } })] }));
  same([early.OUT, (item(early, 'h|cogs|person b|2026-09') || {}).state, early.cards.length], [6120, undefined, 0], '… while the same old mark for a month the statements do NOT show paid is that month\'s payment: September is not waited for, and nothing asks about it');
});

await run(1, 'fixture A, base', async () => {
  const M = await C(ledA(), planA());
  const w = acct(M, 'Wise|GBP');
  same([w.anchor.amt, w.anchor.asOf, w.after, w.est, w.cov, w.through, w.active, w.material], [10120, '2026-09-30', -120, 10000, '2026-10-05', '2026-10-05', true, true], 'the balance: 10,120 typed as of 30 Sep, less the statement row of 3 Oct (the design\'s «anchor = f1»: the statement\'s own balance is deliverable B)');
  same([M.nowIsToday, M.nowApprox, M.nowDate], [true, false, '2026-10-05'], '«Денег сейчас», not «на …» and not «≈»: statements reach yesterday');
  same(M.series.map((s) => [s.sk, s.E, s.day, s.g, s.bank, s.regular, s.paid]), [['cogs|person b', 6000, 20, 5, 'Wise', true, 6], ['fixed|tool s', 120, 3, 5, 'Wise', true, 6], ['rev|client a', 8000, 28, 5, 'Wise', true, 6]], 'three regular series: who, how much, which day, how exact');
  same(M.days.flatMap((D) => D.items.map((id) => [id, D.d, item(M, id).cash, item(M, id).kind])), [['h|cogs|person b|2026-10', '2026-10-20', -6000, 'hist'], ['h|rev|client a|2026-10', '2026-10-28', 8000, 'hist'], ['h|fixed|tool s|2026-11', '2026-11-03', -120, 'hist']], 'open items in the window: B −6,000 on 20 Oct, A +8,000 on 28 Oct, S −120 on 3 Nov');
  same([item(M, 'h|fixed|tool s|2026-10').state, item(M, 'h|fixed|tool s|2026-10').done.on], ['done', '2026-10-03'], 'October\'s Tool S is closed by the row of 3 Oct');
  figs(M, { now: 10000, IN: 8000, OUT: 6120, END: 11880, LOW: 4000, LOWDAY: '2026-10-20', LOW_C: 2350, LOWDAY_C: '2026-11-03', LATE: 0, verdict: 'v3' }, 'the figures');
  same(M.cards, [], 'nothing to decide');
  const own = await C(ledA(), plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-03')] }));
  same([acct(own, 'Wise|GBP').after, own.now], [0, 10000], 'a balance typed as of 3 Oct already holds the row of 3 Oct: rows of the balance\'s own day are inside it');
});

await run(2, 'fixture A, 60 days', async () => {
  const M = await C(ledA(), planA(), T, { H: 60 });
  figs(M, { IN: 16000, OUT: 12240, END: 13760, LOW: 4000, LOWDAY: '2026-10-20', LOW_C: 700, LOWDAY_C: '2026-12-03' }, 'the figures');
  same((await C(ledA(), planA(), T, {})).END, 13760, '60 days is what the engine takes when it is not told');
});

await run(3, 'fixture A, the running month', async () => {
  const want = (M, msg) => {
    const b = M.month.blocks;
    same([b.fixed.fact, b.result.fact, b.rev.rest, b.rev.hist, b.cogs.rest, b.result.rest, M.month.M_EXP, b.result.usual, b.result.total], [120, -120, 8000, 8000, 6000, 2000, 1880, 1880, 1880], msg);
  };
  const M = await C(ledA(), planA());
  want(M, 'fact: fixed 120, result −120 · rest: rev 8,000, cogs 6,000, result +2,000 · M_EXP 1,880 · usual 1,880');
  same([M.month.ym, M.month.inInbox], ['2026-10', 0], '… nothing of it is in «Разбор»');
  const W = await C(ledA({ f1: 'inbox' }), planA());
  want(W, 'the row of 3 Oct recognised but not yet accepted: the same figures');
  same([W.month.inInbox, W.now, W.IN, W.OUT, W.inbox.prov], [120, 10000, 8000, 6120, 1], '… with £120 of the fact still in «Разбор», and NOW, IN and OUT where they were');
});

await run(4, 'a hand mark, and the statement row that takes its place', async () => {
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  let P = planA({ team: [g()] });
  let M = await C(ledA(), P);
  figs(M, { now: 10000, OUT: 7120, END: 10880 }, 'typed outflow Person G £1,000 on 7 Oct');
  same([item(M, 'g').how, item(M, 'g').kind, item(M, 'g').state], ['', 'typed', 'due'], '… a name the table does not know: unlinked, typed, due');
  P = planA({ team: [g({ paid: paid(T) })] });
  M = await C(ledA(), P);
  figs(M, { now: 9000, OUT: 6120, END: 10880 }, '«Оплачено», one tap, 6 Oct');
  same([M.nowApprox, M.marksGbp, item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').done.day, item(M, 'g').mark.counts, acct(M, 'Wise|GBP').anchor.amt], [true, -1000, 'done', 'mark', '2026-10-07', true, 10120], '… NOW is «≈»: the mark is counted in it; the row is done and stays under its own date; the typed balance is as it was');
  // f2: one row, 6 Oct −1,000, left unrecognised in «Разбор».
  M = await C(ledA({ inb: [inbox('f2', T, -1000, '', '', { at: AT3 })] }), P);
  figs(M, { now: 9000, OUT: 6120, END: 10880 }, 'then the statement brings 6 Oct −1,000 and nobody files it: the same three figures');
  same([M.nowApprox, M.marksGbp, item(M, 'g').done.by, item(M, 'g').done.note, item(M, 'g').done.rows, item(M, 'g').mark.counts, acct(M, 'Wise|GBP').after], [false, 0, 'row', 'mark', ['f2'], false, -1120], '… without «≈»: the row has replaced the mark, the money is in the statement rows now');
  same([card(M, 4).length, M.inbox.n, M.verdict.subs.includes('inbox')], [1, 1, true], '… and «Разбор» is one card and one line under the verdict');
  // The same row uploaded BEFORE the tap and still unfiled in «Разбор» had been counted in nothing but the balance:
  // it is the payment all the same, or the payout would stand twice — once as the bank's row, once as the mark.
  M = await C(ledA({ inb: [inbox('f2', T, -1000, '', '', { at: AT2 })] }), P);
  same([item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').rows, M.now, M.OUT, M.END, M.marksGbp], ['done', 'row', ['f2'], 9000, 6120, 10880, 0], 'had that row been uploaded before the tap and left unfiled, it replaces the mark just the same: the payout is in the balance once');
  // A row that was FILED when the mark was made is somebody's payment already — it was on the page before the line
  // was typed, under another name — and is never taken silently: the mark stands, on top of it.
  M = await C(ledA({ tx: [filed('q', T, -1000, 'cogs', 'Person Q', { at: AT1 })] }), P);
  same([item(M, 'g').done.by, item(M, 'g').rows, item(M, 'g').mark.counts, item(M, 'g').mark.cov, M.now, M.OUT], ['mark', [], true, '2026-09-28', 8000, 6120], 'a row filed before the line was typed is not the line\'s: the mark does not take it and still stands for its own payment');
});

await run(6, 'a mark the statement does not show', async () => {
  const g = (more = {}) => row('g', 'Person G', 1000, '2026-10-07', more);
  let M = await C(ledA(), planA({ team: [g({ paid: paid('2026-10-02', ms('2026-10-02T15:00:00Z')) })] }));
  figs(M, { now: 10000, OUT: 7120 }, 'marked on 2 Oct, statements reach 5 Oct and hold no such row: counted as unpaid again');
  same([item(M, 'g').state, item(M, 'g').day, item(M, 'g').mark.unseen, item(M, 'g').mark.counts, M.nowApprox], ['unseen', T, true, false, false], '… state "unseen", counted today, out of the balance');
  same(M.cards.map((c) => c.n), [], '… card 5 is deliverable B: the row says it in its own line and its toggle takes the mark off');
  M = await C(ledA(), planA({ team: [g({ paid: paid('2026-10-02', ms('2026-10-02T15:00:00Z'), { ok: true }) })] }));
  figs(M, { now: 10000, OUT: 6120, END: 11880 }, '«Всё верно»: done, and no balance moves');
  same(item(M, 'g').done.by, 'ok', '… done by the founder\'s word');
  M = await C(ledA(), planA({ team: [g()] }));
  figs(M, { OUT: 7120 }, '«Вернуть в план» instead: an ordinary open row');
  same([item(M, 'g').state, item(M, 'g').mark], ['due', null], '… due on its date, no mark');
});

await run(7, 'a typed balance, and «Что из этого уже прошло?»', async () => {
  const rent = (more = {}) => row('rent', 'Rent', 900, '2026-10-02', { bank: 'Barclays', ...more });
  let P = planA({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], other: [rent()] });
  let M = await C(ledA(), P);
  figs(M, { now: 13000, OUT: 7020 }, 'Barclays 3,000 as of 30 Sep and Rent £900 on 2 Oct');
  same([item(M, 'rent').state, item(M, 'rent').cov, item(M, 'rent').day, acct(M, 'Barclays|GBP').est, M.between.n], ['blind', '2026-09-28', T, 3000, 0], '… «не видно: выписки по 28 сен» — no Barclays statement reaches 2 Oct; it is counted today, and it is after the typed balance');
  const passed = (m, key, asOf) => page.evaluate(([x, k, d]) => window.__money.passed(x, k, d), [m, key, asOf]);
  same(await passed(M, 'Barclays|GBP', T), [{ id: 'rent', tick: false, on: '2026-10-02' }], '«Вписать остаток» Barclays lists Rent, unticked: what a founder typed is theirs to say');
  // Ticked and saved: the balance as of today, and the row marked on its own date a moment before the balance.
  const now = bal('Barclays', 'GBP', 2100, T, { at: TAP });
  M = await C(ledA(), planA({ banks: [now], other: [rent({ paid: paid('2026-10-02', TAP - 1) })] }));
  figs(M, { now: 12100, OUT: 6120, END: 13980 }, 'Barclays 2,100 with Rent ticked');
  same([item(M, 'rent').state, item(M, 'rent').mark.counts, M.between.n], ['done', false, 0], '… Rent is done and adds nothing to the balance it is already inside');
  M = await C(ledA(), planA({ banks: [now], other: [rent()] }));
  figs(M, { now: 12100, OUT: 7020, END: 13080 }, 'Barclays 2,100 saved without the tick');
  same([M.between, M.verdict.subs[0], item(M, 'rent').state], [{ n: 1, gbp: 900, ids: ['rent'] }, 'between', 'blind'], '… «1 строка на £900 между выписками и вписанным остатком» is the first line under the verdict');
  // «расходится с расчётом на £900» is the sheet's own sentence: the typed 2,100 against the estimate 3,000 above.

  // The rule that ticks beforehand: a regular payout no statement has reached, once its usual time has passed.
  // Three weeks on with no new statement: Person B's 20 Oct is such a payout; Client A's 28 Oct is still ahead.
  const later = '2026-10-27';
  M = await C(ledA(), planA(), later);
  same(await passed(M, 'Wise|GBP', later), [{ id: 'h|cogs|person b|2026-10', tick: true, on: '2026-10-20' }], 'three weeks on, typing Wise: Person B\'s 20 Oct is listed and ticked beforehand');
  same([M.nowIsToday, M.nowDate, M.nowApprox, acct(M, 'Wise|GBP').stale, M.verdict.asOf, M.verdict.subs.includes('stale')], [false, '2026-10-05', true, 'old', '2026-10-05', true], '… and until it is typed the page says «Денег на 5 окт», «≈», «По остаткам на 5 окт»: 22 days without a statement');
  // Saved with the tick: the forecast is stored as a row — its month's usual amount, not confirmed — with the mark.
  const tick = (id, sk, cyc, name, amt, on, date) => row(id, name, amt, date, { sk, cyc, src: 'hist', sure: false, paid: paid(on, TAP - 1) });
  let M2 = await C(ledA(), plan({ banks: [bal('Wise', 'GBP', 4000, later, { at: TAP })], team: [tick('h|cogs|person b|2026-10', 'cogs|person b', '2026-10', 'Person B', 6000, '2026-10-20', '2026-10-20')] }), later);
  same([item(M2, 'h|cogs|person b|2026-10').kind, item(M2, 'h|cogs|person b|2026-10').state, item(M2, 'h|cogs|person b|2026-10').mark.counts, M2.now, M2.nowApprox, M2.OUT], ['hist', 'done', false, 4000, false, 6120], '… the October payout is done and adds nothing to the 4,000 typed with it; what is left to go out is November\'s 6,000 and Tool S');
  // A line the statements DO reach is never ticked beforehand, and its mark is dated after they end.
  const L = ledA({ skip: (r) => r.id === 'b5' });
  M = await C(L, planA());
  same(await passed(M, 'Wise|GBP', T), [{ id: 'h|cogs|person b|2026-09', tick: false, on: T }], 'Person B\'s September, which statements through 5 Oct do not show: listed, not ticked; if the founder ticks it, the mark is dated 6 Oct');
  M2 = await C(L, plan({ banks: [bal('Wise', 'GBP', 4000, T, { at: TAP })], team: [tick('h|cogs|person b|2026-09', 'cogs|person b', '2026-09', 'Person B', 6000, T, '2026-09-20')] }));
  same([item(M2, 'h|cogs|person b|2026-09').state, item(M2, 'h|cogs|person b|2026-09').dayC, M2.now, card(M2, 10).length], ['done', '', 4000, 0], '… ticked: done, off the cautious line too, inside the typed balance, and no longer asked about');
  same(await passed(await C(ledA({ tx: [reach('Wise', T)] }), planA()), 'Wise|GBP', T), [], 'when the statements reach the day the balance is typed for, there is nothing to ask');
});

await run(8, 'a typed row and the forecast of its client', async () => {
  const a = (amt, date, more = {}) => row('inv', 'Client A', amt, date, more);
  let M = await C(ledA(), planA({ inflows: [a(8500, '2026-10-27')] }));
  figs(M, { IN: 8500, LOW_C: 2500, LOWDAY_C: '2026-10-20' }, 'Client A £8,500 typed for 27 Oct');
  same([item(M, 'inv').kind, item(M, 'inv').how, item(M, 'inv').sk, item(M, 'inv').cyc, item(M, 'h|rev|client a|2026-10'), M.inParts], ['typed', 'name', 'rev|client a', '2026-10', null, { typed: 8500, hist: 0, avg: 0 }], '… «в плане»: linked by name, standing in October\'s cycle, and October\'s forecast is gone, not added');
  same([item(M, 'inv').day, item(M, 'inv').dayC, item(M, 'inv').cashC, item(await C(ledA(), planA({ inflows: [a(8500, '2026-10-27', { inv: true })] })), 'inv').dayC], ['2026-10-27', '2026-11-03', 8500, '2026-10-27'], '… the cautious line takes it a week later, in full — on its own day if the row carries `inv`');
  M = await C(ledA(), planA({ inflows: [a(8500, '2026-10-05')] }));
  figs(M, { IN: 8500 }, 'dated 5 Oct, 23 days before the habit: still October\'s');
  same([item(M, 'inv').cyc, item(M, 'inv').state], ['2026-10', 'waiting'], '… September is paid, so it cannot be September\'s');
  M = await C(ledA(), planA({ inflows: [a(8500, '2026-10-27', { extra: true })] }));
  figs(M, { IN: 16500 }, '«это сверх обычного»: on top of the forecast');
  M = await C(ledA(), planA({ inflows: [a(850, '2026-10-27')] }));
  figs(M, { IN: 8000 }, '£850 instead');
  same([M.inParts.typed, M.inParts.hist, item(M, 'h|rev|client a|2026-10').amt, item(M, 'h|rev|client a|2026-10').occ], [850, 7150, 7150, { E: 8000, typ: 850, got: 0 }], '… 850 «в плане» + 7,150 «по истории»: taken out of the forecast, not put in its place');
  M = await C(ledA(), planA({ inflows: [a(850, '2026-10-27', { on: false, offAt: TAP })] }));
  figs(M, { IN: 7150 }, 'unticked in «Касса»: «а если не придёт» — it keeps its place and is not counted');
  M = await C(ledA(), planA({ inflows: [a(850, '2026-10-27', { on: false })] }));
  figs(M, { IN: 8000 }, 'a row that came switched off from the old Касса holds nothing');
});

await run(9, 'a typed row closed by a statement', async () => {
  const P = planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] });
  let M = await C(ledA(), P);
  figs(M, { now: 10000, IN: 10400, END: 14280 }, 'Client C £2,400 typed for 8 Oct');
  M = await C(ledA({ tx: [filed('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] }), P);
  figs(M, { now: 12400, IN: 8000, END: 14280 }, 'f2 brings 6 Oct +2,400, filed under Client C and accepted');
  same([item(M, 'c').state, item(M, 'c').done.by, item(M, 'c').done.on, item(M, 'c').done.day, item(M, 'c').done.rows, item(M, 'c').how], ['done', 'row', T, T, ['f2'], 'name'], '… the line is closed by that row and stays listed under the row\'s date');
  same(M.doneDays[T], ['c'], '… under 6 Oct in the days');
  M = await C(ledA({ inb: [inbox('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] }), P);
  figs(M, { now: 12400, IN: 8000, END: 14280 }, 'recognised in «Разбор» and not yet accepted: the same — a payment does not open its line again between upload and accept');
  // «Upload f2 again: nothing changes» is the uploader refusing a repeat — the page's, not the engine's (§5.9, deliverable B).
});

await run(10, 'a part payment', async () => {
  const M = await C(ledA({ tx: [filed('f2', T, 1000, 'rev', 'Client C', { at: AT2 })] }), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] }));
  figs(M, { now: 11000, IN: 9400, END: 14280 }, '+1,000 of the 2,400');
  same([item(M, 'c').part, item(M, 'c').cash, item(M, 'c').full, item(M, 'c').state], [{ got: 1000, of: 2400 }, 1400, 2400, 'due'], '… «частично £1,000 из £2,400», 1,400 still expected');
  const X = await C(ledA({ tx: [filed('f2', T, 1000, 'rev', 'Client C', { at: AT2 })] }), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08', { closed: true })] }));
  same([X.IN, item(X, 'c').state, item(X, 'c').done.by], [8000, 'done', 'closed'], '«Это всё» closes it at what came');
});

await run(11, 'a fee, VAT, and a row closed by amount', async () => {
  const P = planA({
    banks: [bal('Wise', 'USD', 1350, '2026-10-05')],
    team: [row('h', 'Person H', 540, '2026-10-07', { cur: 'USD' })],
    inflows: [row('d', 'Client D', 1000, '2026-10-09', { vat: true })],
    other: [row('ar', 'Аренда', 900, '2026-10-08')],
  });
  let M = await C(ledA(), P);
  figs(M, { now: 11000, IN: 9200, OUT: 7420 }, 'before the statement: $1,350 is £1,000; the VAT invoice counts 1,200; $540 is £400');
  same([item(M, 'd').cash, item(M, 'd').amt, item(M, 'h').cash, item(M, 'h').acct], [1200, 1000, -400, 'Wise|USD'], '… the line of Client D shows +1,200 for a typed 1,000');
  M = await C(ledA({ tx: [
    filed('f-h', T, -552.66, 'cogs', 'Person H', { cur: 'USD', at: AT2 }),
    filed('f-d', T, 1200, 'rev', 'Client D', { at: AT2 }),
    filed('f-l', T, -900, 'other', 'Landlord Ltd', { at: AT2 }),
  ] }), P);
  same([item(M, 'h').state, item(M, 'h').done.note, item(M, 'h').done.rows], ['done', '', ['f-h']], '$540 typed, −$552.66 in the statement: done — Wise folds its fee into the payment');
  same([item(M, 'd').state, item(M, 'd').done.rows], ['done', ['f-d']], '£1,000 + VAT 20%, +1,200 in the statement: done');
  same([item(M, 'ar').state, item(M, 'ar').how, item(M, 'ar').done.note, item(M, 'ar').done.label, item(M, 'ar').done.on], ['done', '', 'amount', 'Landlord Ltd', T], '«Аренда» £900, −900 filed as Other «Landlord Ltd»: «закрыто по сумме: Landlord Ltd, 6 окт»');
  figs(M, { IN: 8000, OUT: 6120, now: round2(10000 + (1350 - 552.66) / 1.35 + 1200 - 900) }, 'and the three are out of the forecast and in the balances');
  // Rules 2 and 4 of E3, for a name the table knows: the invoice typed without its VAT, and a payment a little over.
  const known = [sheet('old-d', '2025-02-02', 100, 'rev', 'Client D'), sheet('old-v', '2025-02-03', 100, 'rev', 'Client V')];
  M = await C(ledA({ tx: [...known, filed('f-d', T, 1200, 'rev', 'Client D', { at: AT2 }), filed('f-v', T, 1300, 'rev', 'Client V', { at: AT2 })] }), planA({ inflows: [row('d', 'Client D', 1000, '2026-10-09'), row('v', 'Client V', 1000, '2026-10-09')] }));
  same([item(M, 'd').done.note, item(M, 'v').done.note, item(M, 'v').done.over, M.IN], ['vat', 'over', 300, 8000], '£1,000 typed without the tick and +1,200 came: done, «с VAT»; £1,000 typed and +1,300 came: done, «пришло больше на £300»');
  M = await C(ledA({ tx: [...known, filed('f-v', T, 1600, 'rev', 'Client V', { at: AT2 })] }), planA({ inflows: [row('v', 'Client V', 1000, '2026-10-09')] }));
  same([item(M, 'v').state, M.IN], ['due', 9000], '+1,600 against a typed 1,000 is more than half as much again: not this invoice');
});

await run(12, 'money that was already on the screen', async () => {
  const L = ledA({ tx: [filed('f2', T, 2400, 'rev', 'Client C', { at: AT2 })] });
  const c = (more = {}) => row('c', 'Client C', 2400, '2026-10-12', { c0: AT2 + 3600e3, ...more });
  let M = await C(L, planA({ inflows: [c()] }));
  figs(M, { now: 12400, IN: 10400 }, 'f2 accepted first, then Client C £2,400 typed for 12 Oct: the row stays open');
  same([item(M, 'c').state, item(M, 'c').hint], ['due', { id: 'f2', d: T, amt: 2400, cur: 'GBP', label: 'Client C' }], '… with «Похоже, уже пришло: +£2,400 · 6 окт» to ask about');
  M = await C(L, planA({ inflows: [c({ tx: ['f2'] })] }));
  figs(M, { IN: 8000, END: 14280 }, '«Это оно»');
  same([item(M, 'c').state, item(M, 'c').done.note], ['done', 'hand'], '… closed by the founder\'s word');
  M = await C(L, planA({ inflows: [c({ notx: ['f2'] })] }));
  figs(M, { IN: 10400 }, '«Нет, это новый счёт»');
  same(item(M, 'c').hint, null, '… and it is not asked again');
  // The other way to be asked: the row came after the line was typed, but more than ten days before its date.
  const early = (date) => C(L, planA({ inflows: [row('c', 'Client C', 2400, date)] }));
  same([item(await early('2026-10-16'), 'c').state, item(await early('2026-10-17'), 'c').state, item(await early('2026-10-17'), 'c').hint.id, item(await early('2026-11-07'), 'c').hint], ['done', 'due', 'f2', null], 'typed before the statement came: a row ten days early closes the line; eleven days early it only asks; more than 31 days early it is another matter');
});

await run(13, 'a late inflow leaves in two steps', async () => {
  const e = (date, more = {}) => row('e', 'Client E', 4000, date, more);
  const base = await C(ledA(), planA());
  let M = await C(ledA(), planA({ inflows: [e('2026-09-22')] }));
  figs(M, { IN: 12000, LATE: 4000, END_C: base.END_C }, 'Client E £4,000 for 22 Sep — 13 days at the coverage date, tolerance 10: still expected, no longer in the cautious line');
  same([item(M, 'e').state, item(M, 'e').step, item(M, 'e').lateDays, item(M, 'e').g, item(M, 'e').day, item(M, 'e').dayC, M.late], ['late', 1, 13, 10, T, '', { n: 1, name: 'Client E', days: 13 }], '… late, step 1');
  same(M.cards, [{ n: 7, item: 'e', name: 'Client E', gbp: 4000, date: '2026-09-22', account: 'Wise GBP', cov: '2026-10-05', days: 13, hint: null, step: 1, left: 8 }], '… card 7: «ждали 22 сен … 13 дн.», out of the forecast in 8 days');
  M = await C(ledA(), planA({ inflows: [e('2026-09-10')] }));
  figs(M, { IN: 8000, LATE: 4000, END: 11880 }, 'dated 10 Sep, 25 days: out of both lines');
  same([card(M, 7)[0].step, card(M, 7)[0].days, item(M, 'e').day], [2, 25, ''], '… card 7: «Из расчёта убран, пока не перенесёте.»');
  M = await C(ledA(), planA({ inflows: [e('2026-10-20')] }));
  figs(M, { IN: 12000, LATE: 0, LOW: 8000, LOWDAY: '2026-10-20' }, '«Перенести на…» 20 Oct');
  same(M.cards, [], '… and the card is gone');
  // Client E is a name the table knows, and f1 also held +4,000 on 2 Oct under another name: the founder picks it.
  const L = ledA({ tx: [sheet('old-e', '2025-03-03', 500, 'rev', 'Client E'), filed('f1-x', '2026-10-02', 4000, 'rev', 'Somebody Else')] });
  const open = await C(L, planA({ inflows: [e('2026-09-22')] }));
  M = await C(L, planA({ inflows: [e('2026-09-22', { tx: ['f1-x'] })] }));
  same([open.LATE, open.now, item(open, 'e').hint, M.LATE, M.now, item(M, 'e').state], [4000, 14000, null, 0, 14000, 'done'], '«Выбрать операцию», the row of 2 Oct: LATE 0, NOW unchanged');
  M = await C(ledA(), planA({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], inflows: [e('2026-09-30', { bank: 'Barclays' })] }));
  same([M.LATE, item(M, 'e').state, item(M, 'e').cov, M.cards.length], [0, 'blind', '2026-09-28', 0], 'the same row on Barclays, dated 30 Sep: not late — «не видно: выписки по 28 сен»');
});

await run(14, 'a late outflow stays', async () => {
  const M = await C(ledA(), planA({ team: [row('f', 'Person F', 700, '2026-09-20')] }));
  figs(M, { OUT: 6820, LOW: 3300, LOWDAY: '2026-10-20', LATE: 0 }, 'Person F £700 for 20 Sep');
  same([item(M, 'f').state, item(M, 'f').day, item(M, 'f').dayC, M.cards.map((c) => [c.n, c.item, c.days])], ['late', T, T, [[8, 'f', 15]]], '… late, counted today in both lines — it is still owed — and card 8');
});

await run(15, 'history that did not come true', async () => {
  const M = await C(ledA({ skip: (r) => r.id === 'b5' }), planA());
  figs(M, { IN: 8000, OUT: 6120, END: 11880, LOW_C: -5150, LOWDAY_C: '2026-11-03' }, 'fixture A without Person B\'s September row');
  const it = item(M, 'h|cogs|person b|2026-09');
  same([it.state, it.day, it.dayC, it.cashC, it.lateDays], ['late', '', T, -7500, 15], '… September\'s payout: out of the expected line, in the cautious one today at a quarter more');
  same(M.cards, [{ n: 10, count: 1, gbp: 6000, rows: [{ type: 'late', item: 'h|cogs|person b|2026-09', sk: 'cogs|person b', ym: '2026-09', label: 'Person B', dir: -1, usual: 6000, day: 20, days: 15, gbp: 6000 }] }], '… card 10 «По истории не сошлось: 1 строка на ≈£6,000», and no card 8');
});

await run(16, 'VAT by the rule', async () => {
  const L = ledA({ vat: true });
  let M = await C(L, planA(), T, { H: 60 });
  const v = item(M, 'v|2026Q3');
  same([v.kind, v.name, v.cash, v.date, v.list, v.state, v.sk], ['rule', 'VAT за Q3 2026', -4000, '2026-11-07', 'taxes', 'due', 'tax|vat|2026Q3'], 'July–September carry £4,000 of VAT: «VAT за Q3 2026», −4,000 on 7 Nov, «по выручке»');
  figs(M, { OUT: 16240, END: 9760, LOW: 1880, LOWDAY: '2026-11-20' }, 'the figures at 60 days');
  const q3 = row('vat-q3', 'VAT за Q3 2026', 3800, '2026-11-05', { sk: 'tax|vat|2026Q3' });
  M = await C(L, planA({ taxes: [q3] }), T, { H: 60 });
  figs(M, { OUT: 16040, END: 9960 }, 'the item edited to £3,800 on 5 Nov');
  same([item(M, 'v|2026Q3'), M.items.filter((it) => it.sk === 'tax|vat|2026Q3').map((it) => [it.id, it.src, it.kind])], [null, [['vat-q3', 'row', 'typed']]], '… one stored row with sk tax|vat|2026Q3 in the computed item\'s place');
  const inst = row('inst', 'VAT — рассрочка', 500, '2026-10-07');
  M = await C(L, planA({ taxes: [q3, inst] }), T, { H: 60 });
  figs(M, { OUT: 16540 }, 'a taxes row «VAT — рассрочка» £500 on 7 Oct: it adds, whatever its name');
  M = await C(ledA({ vat: true, tx: [filed('hmrc', T, -500, 'tax', 'HMRC', { at: AT2 })] }), planA({ taxes: [q3, inst] }), T, { H: 60 });
  figs(M, { OUT: 16040, END: 9460 }, '6 Oct −500 HMRC, filed as studio tax');
  same([item(M, 'inst').state, item(M, 'inst').done.rows, item(M, 'vat-q3').state], ['done', ['hmrc'], 'due'], '… closes «рассрочка» only');
  M = await C(L, planA({ vat: { on: false } }), T, { H: 60 });
  same([item(M, 'v|2026Q3'), M.OUT], [null, 12240], '«Считать VAT по выручке» off: no item');
  const q2 = ledA({ vat: true });
  q2.tx.find((r) => r.id === 'a1').v = 900;
  M = await C(q2, planA(), T, { H: 60 });
  same(M.items.filter((it) => it.kind === 'rule').map((it) => it.id), ['v|2026Q3'], 'May\'s VAT was due on 7 Aug, before the sheet ends: that quarter is the sheet\'s, not the rule\'s');
  // A payment of about the quarter's size closes the computed item; an instalment does not.
  M = await C(ledA({ vat: true, tx: [filed('hmrc', '2026-11-06', -4100, 'tax', 'HMRC VAT', { at: ms('2026-11-07T09:00:00Z') })] }), planA(), '2026-11-08', { H: 60 });
  same([item(M, 'v|2026Q3').state, item(M, 'v|2026Q3').done.rows], ['done', ['hmrc']], 'a studio-tax row of −4,100 within a month of the due date: the quarter is paid');
  M = await C(ledA({ vat: true, tx: [filed('hmrc', '2026-11-06', -1000, 'tax', 'HMRC VAT', { at: ms('2026-11-07T09:00:00Z') }), reach('Wise', '2026-11-20')] }), planA(), '2026-11-21', { H: 60 });
  same([item(M, 'v|2026Q3').state, item(M, 'v|2026Q3').day, card(M, 8).map((c) => c.item)], ['late', '2026-11-21', ['v|2026Q3']], 'an instalment of −1,000 counts toward no quarter: past its date the item is a late outflow, counted today, card 8');
});

await run(17, 'two invoices, one payment', async () => {
  const P = planA({ inflows: [row('i1', 'Client A', 1000, '2026-10-08'), row('i2', 'Client A', 1500, '2026-10-09')] });
  let M = await C(ledA(), P);
  figs(M, { IN: 8000 }, 'Client A £1,000 (8 Oct) and £1,500 (9 Oct)');
  same(M.inParts, { typed: 2500, hist: 5500, avg: 0 }, '… 2,500 «в плане» + 5,500 «по истории»');
  M = await C(ledA({ tx: [filed('f2', T, 2500, 'rev', 'Client A', { at: AT2 })] }), P);
  figs(M, { now: 12500, IN: 5500, END: 11880 }, '+2,500 from Client A on 6 Oct');
  same([item(M, 'i1').done.note, item(M, 'i2').done.note, item(M, 'i1').done.rows, item(M, 'h|rev|client a|2026-10').occ], ['sum', 'sum', ['f2'], { E: 8000, typ: 2500, got: 0 }], '… both done by the one row; it is theirs, so it is not also October\'s payment');
  M = await C(ledA({ tx: [filed('f2', T, 1500, 'rev', 'Client A', { at: AT2 })] }), P);
  figs(M, { IN: 6500 }, '+1,500 instead');
  same([item(M, 'i1').state, item(M, 'i2').state], ['due', 'done'], '… the £1,500 row done, the £1,000 one open');
});

await run(18, 'fixture B: cycles, not calendar months', async () => {
  const L = ledger([
    ...[['2026-04-28'], ['2026-05-29'], ['2026-07-01'], ['2026-07-28'], ['2026-08-27']].map(([d], i) => sheet('p' + i, d, 3000, 'cogs', 'Person B')),
    filed('p5', '2026-10-01', -3000, 'cogs', 'Person B'), reach('Wise', '2026-10-05'),
  ]);
  const M = await C(L, plan({ banks: [bal('Wise', 'GBP', 20000, '2026-10-05')] }));
  const s = M.series[0];
  same([s.sk, s.paid, s.due, s.multi, s.E], ['cogs|person b', 6, ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04'], false, 3000], 'paid cycles are exactly 2026-04 … 2026-09, one row each: 1 July is June\'s, 1 October is September\'s');
  const openNow = M.days.flatMap((D) => D.items.map((id) => item(M, id)));
  same(openNow.map((it) => [it.id, it.cash]), [['h|cogs|person b|2026-10', -3000]], 'one open occurrence in 30 days: October\'s, −3,000');
  ok(openNow[0].date >= '2026-10-28' && openNow[0].date <= '2026-10-30', `… dated 28–30 Oct (${openNow[0].date})`);
  same(M.items.filter((it) => it.sk === s.sk && it.state === 'done').map((it) => [it.cyc, it.done.on]), [['2026-08', '2026-08-27'], ['2026-09', '2026-10-01']], '… and August and September are done rows, September\'s under 1 Oct');
});

await run(19, 'fixture C: a client goes quiet', async () => {
  const rows = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((m, i) => sheet('k' + i, m + '-20', 5000, 'rev', 'Client K'));
  const L = ledger([...rows, reach('Wise', '2026-10-05')]);
  const P = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')], ...parts });
  let M = await C(L, P());
  figs(M, { now: 10000, IN: 0, LATE: 5000 }, 'Client K paid on the 20th, April–August, and not in September');
  same([item(M, 'h|rev|client k|2026-09').state, item(M, 'h|rev|client k|2026-10').state, card(M, 10)[0].rows.map((r) => [r.type, r.ym, r.days])], ['late', 'doubt', [['late', '2026-09', 15]]], '… card 10 with one row; October\'s occurrence is «под вопросом»');
  const sep = (more) => row('h|rev|client k|2026-09', 'Client K', 5000, '2026-09-20', { sk: 'rev|client k', cyc: '2026-09', src: 'hist', sure: false, ...more });
  M = await C(L, P({ inflows: [sep({ date: '2026-10-25' })] }));
  figs(M, { IN: 10000, LATE: 0 }, '«Жду до…» 25 Oct');
  same([item(M, 'h|rev|client k|2026-09').kind, item(M, 'h|rev|client k|2026-09').day, item(M, 'h|rev|client k|2026-10').state], ['hist', '2026-10-25', 'due'], '… September waits for the 25th, still history, and October is counted on again');
  M = await C(L, P({ inflows: [sep({ on: false })] }));
  figs(M, { IN: 5000, LATE: 0 }, '«В этом месяце не будет»: a stored row h|rev|client k|2026-09 with on:false');
  same([item(M, 'h|rev|client k|2026-09').state, M.cards], ['off', []], '… and nothing left to decide');
  // He pays October after all: September is still late, but the months after a payment are counted on again.
  M = await C(ledger([...rows, filed('k-oct', '2026-10-21', 5000, 'rev', 'Client K', { at: ms('2026-10-23T09:00:00Z') }), reach('Wise', '2026-10-23')]), P(), '2026-10-24');
  same([item(M, 'h|rev|client k|2026-09').state, item(M, 'h|rev|client k|2026-10').state, item(M, 'h|rev|client k|2026-11').state, M.IN, M.LATE], ['late', 'done', 'due', 5000, 5000], 'October is paid on the 21st: November is expected again, September stays in «Ждём и не пришло»');
  // A month on, with statements that reach 5 Nov and still nothing from Client K.
  const L2 = ledger([...rows, reach('Wise', '2026-11-05')]);
  M = await C(L2, P(), '2026-11-06');
  same([M.IN, M.items.length, M.series.map((s) => [s.sk, s.was, s.regular, s.stopped]), M.avg.rev.E], [0, 0, [['rev|client k', true, false, true]], 0], 'on 6 Nov: no Client K items, IN 0 — a client who was regular is in no average');
  same(M.cards, [{ n: 10, count: 1, gbp: 5000, rows: [{ type: 'stopped', sk: 'rev|client k', label: 'Client K', dir: 1, usual: 5000, ym: '2026-10', gbp: 5000 }] }], '… card 10 «Client K: два платежа подряд не пришли»');
  M = await C(L2, P({ ser: { 'rev|client k': { seen: '2026-10', by: 'Mika', at: TAP } } }), '2026-11-06');
  same([M.cards, M.series[0].off, M.series[0].stopped], [[], false, true], '«Понятно» stores seen, not off: the card goes, the series is only stopped');
});

await run(20, 'fixture D: a founder\'s draws', async () => {
  const L = ledD();
  const P = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 10000, '2026-09-30')], ...parts });
  const draw = (amt, more = {}) => row('draw', 'Mika', amt, '2026-10-15', { blk: 'mika', ...more });
  let M = await C(L, P());
  figs(M, { now: 9400, OUT: 2900, END: 6500, END_C: 5775 }, 'usual 3,000 a month, 600 already drawn: 2,400 over 6–31 Oct + 500 over 1–5 Nov');
  same([M.avg.mika.E, M.avg.mika.months['2026-10'], M.avg.mika.months['2026-11'].left, M.items.length, M.outParts.founders], [3000, { used: 600, left: 2400, perDay: 2400 / 26, from: T, to: '2026-10-31' }, 3000, 0, 2900], '… all of it «в среднем»: no rows, one line');
  M = await C(L, P({ other: [draw(1000)] }));
  figs(M, { OUT: 2900 }, 'a typed draw of £1,000 on 15 Oct is taken out of the average');
  same([item(M, 'draw').grp, item(M, 'draw').how, M.avg.mika.months['2026-10'].left], ['mika', 'block', 1400], '… it is Mika\'s, by its block');
  M = await C(L, P({ other: [draw(1000, { paid: paid(T) })] }));
  figs(M, { now: 8400, OUT: 1900, END: 6500 }, '«Оплачено» on it');
  M = await C(L, P({ other: [draw(3000)] }));
  figs(M, { OUT: 3500 }, '£3,000 instead, unmarked: more than the average had left');
  M = await C(L, P({ tails: { mika: { on: false } } }));
  figs(M, { OUT: 0, END: 9400 }, '«Считать выводы фаундеров как обычно» off');
});

await run(21, 'fixture E: one-off clients', async () => {
  const L = ledE();
  const P = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')], ...parts });
  const nn = (more = {}) => row('n', 'Client N', 4000, '2026-10-12', more);
  let M = await C(L, P());
  figs(M, { IN: 11666.67, END: 21666.67, END_C: 10000 }, 'six one-off clients, median 10,000 a month: in the expected line, out of the cautious one');
  same([M.series.length, M.inParts], [0, { typed: 0, hist: 0, avg: 11666.67 }], '… no series, all «в среднем»');
  M = await C(L, P({ inflows: [nn()] }));
  figs(M, { IN: 11666.67 }, 'Client N £4,000 typed for 12 Oct is taken out of the average');
  same([item(M, 'n').how, M.inParts.typed], ['', 4000], '… six labels begin with «Client», so it is nobody\'s by name');
  M = await C(L, P({ inflows: [nn({ paid: paid(T) })] }));
  figs(M, { now: 14000, IN: 7666.67, END: 21666.67 }, '«Получено»');
  M = await C(L, P({ inflows: [nn()], tails: { rev: { on: false } } }));
  figs(M, { IN: 4000 }, 'un-marked, then «Считать разовых клиентов в среднем» off');
  // An invoice dated next month and received today is still next month's: the tap must not hand November its
  // average back (§5.2).
  const nov = (more = {}) => row('n', 'Client N', 4000, '2026-11-12', more);
  const open = await C(L, P({ inflows: [nov()] }), T, { H: 60 });
  const got = await C(L, P({ inflows: [nov({ paid: paid(T) })] }), T, { H: 60 });
  same([got.END, got.now, got.avg.rev.months['2026-11'].left, got.avg.rev.months['2026-10'].left], [open.END, 14000, open.avg.rev.months['2026-11'].left, open.avg.rev.months['2026-10'].left], 'Client N dated 12 Nov and marked «Получено» on 6 Oct: END where it was, the money in «сейчас», and neither month\'s average moved');
});

await run(26, 'day one: an account in use without a balance', async () => {
  const L = ledA({ tx: [sheet('bc', '2026-09-15', 40, 'other', 'Bank fee', { b: 'Barclays' })], inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] });
  let M = await C(L, planA());
  same([M.verdict.id, M.now, M.missing, M.need, M.cards.map((c) => c.n), M.cards[0].accounts], ['v0', null, ['Barclays|GBP'], 11000, [1, 4], [{ key: 'Barclays|GBP', name: 'Barclays GBP', old: null }]], 'verdict v0 «Нет остатка: Barclays GBP», `now` «—», «Нужно на счетах сегодня» 11,000, card 1 first');
  same([M.IN, M.OUT, M.days[0].e, M.END, acct(M, 'Wise|GBP').est, acct(M, 'Barclays|GBP').inPlan], [8000, 6120, 0, 1880, 10000, false], '… the flows are still told, from zero; Wise\'s own balance is known and is not passed off as the total');
  M = await C(L, planA({ banks: [bal('Barclays', 'GBP', 15000, T, { at: TAP })] }));
  figs(M, { now: 25000, verdict: 'v1' }, '«Вписать остаток» Barclays 15,000');
  same([acct(M, 'Barclays|GBP').after, M.cards.map((c) => c.n)], [0, [4]], '… the row of 2 Oct is inside the figure typed today');
});

await run('links', 'whose money a typed row is (D2)', async () => {
  const L = ledA({ tx: [sheet('g1', '2026-08-15', 96, 'fixed', 'Google'), sheet('n1', '2026-08-11', 300, 'behalf', 'Northlight print')] });
  L.rules = [{ k: 'kestrel bank', c: 'rev', l: 'Client A' }];
  L.aliases = { 'pb': 'Person B' };
  const M = await C(L, planA({
    inflows: [row('1', 'client a', 10, '2026-10-20'), row('2', 'KESTREL BANK LTD inv 7', 10, '2026-10-20'), row('3', 'Client A — second half', 10, '2026-10-20'), row('4', 'Client Q', 10, '2026-10-20'), row('5', 'Somebody', 10, '2026-10-20')],
    team: [row('6', 'PB', 10, '2026-10-20'), row('7', 'Person', 10, '2026-10-20')],
    other: [row('8', 'Google Workspace', 10, '2026-10-20'), row('9', 'Northlight print', 10, '2026-10-20'), row('10', 'Tool', 10, '2026-10-20'), row('11', 'Mika', 10, '2026-10-20', { blk: 'mika' }), row('12', 'Client A', 10, '2026-10-20', { sk: 'rev|client z', skBy: 'hand' })],
    taxes: [row('13', 'HMRC Vanya', 10, '2026-10-20'), row('14', 'Corporation tax', 10, '2026-10-20')],
  }));
  same(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map((id) => { const it = item(M, id); return [it.how, it.sk, it.blk, it.grp].join(' · '); }), [
    'name · rev|client a · rev · rev', 'rule · rev|client a · rev · rev', 'prefix · rev|client a · rev · rev', ' ·  · rev · rev', ' ·  · rev · rev',
    'name · cogs|person b · cogs · cogs', ' ·  · cogs · cogs',
    'rule · fixed|google · fixed · fixed', 'name · behalf|northlight print · behalf · behalf', 'word · fixed|tool s · fixed · fixed', 'block ·  · mika · mika', 'hand · rev|client z · rev · rev',
    'name · tax|@vanya · tax · vanya', 'block ·  · tax · tax',
  ], 'the name as the table spells it (any case, any alias) · a rule key inside it · a label it begins with · the only label with its first word · two such labels: nobody\'s · the block for a founder and for studio tax · a founder\'s own choice over all of it');
});

await run('monthly', '«каждый месяц» (C6), and the months of the constructor', async () => {
  const ser = { 'm|studio rent': { made: true, amt: 900, cur: 'GBP', day: 15, bank: 'Wise', blk: 'other', name: 'Studio rent', by: 'Mika', at: C0 } };
  // The row it was made from carries no link of its own: it is the series' by its name.
  const P = planA({ other: [row('rent', 'Studio rent', 900, '2026-10-15'), row('und', 'Something', 300, '', { mon: '2026-11' }), row('und2', 'Old thing', 50, '')], ser });
  let M = await C(ledA(), P, T, { H: 60 });
  same(M.items.filter((it) => it.sk === 'm|studio rent').map((it) => [it.id, it.src, it.kind, it.date, it.cash, it.state]), [['rent', 'row', 'typed', '2026-10-15', -900, 'due'], ['h|m|studio rent|2026-11', 'occ', 'typed', '2026-11-15', -900, 'due'], ['h|m|studio rent|2026-12', 'occ', 'typed', '2026-12-15', -900, 'due']], 'a row made monthly on 6 Oct: itself in October, an exact occurrence in each month after, none before it was made');
  same([item(M, 'rent').how, item(M, 'rent').cyc, item(await C(ledA(), planA({ other: [row('rent', 'Studio rent', 900, '2026-10-15', { sk: 'm|studio rent' })], ser }), T, { H: 60 }), 'rent').cyc], ['series', '2026-10', '2026-10'], '… the row stands in October\'s cycle of its own series, whether or not the link was stored on it');
  figs(M, { OUT: 12240 + 1800 }, '… two of them inside 60 days');
  same([M.series.find((s) => s.sk === 'm|studio rent').made, M.undated, M.cards.map((c) => c.n)], [true, { n: 2, gbp: 350, ids: ['und', 'und2'] }, [9]], 'two rows without a date: in neither line, one card 9');
  same([M.months.list, M.months.by['2026-10'].other.rows, M.months.by['2026-11'].other.rows, M.months.by['2026-12'].other.rows], [['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'], ['h|fixed|tool s|2026-10', 'rent', 'und2'], ['h|fixed|tool s|2026-11', 'h|m|studio rent|2026-11', 'und'], ['h|fixed|tool s|2026-12', 'h|m|studio rent|2026-12']], 'the months: each list in date order; an undated row is in the month it was added to, or the running one');
  same([M.months.by['2026-10'].other, M.months.by['2026-10'].inflows, M.months.by['2026-09'].team], [{ rows: ['h|fixed|tool s|2026-10', 'rent', 'und2'], expected: 1070, done: 120, avg: 0 }, { rows: ['h|rev|client a|2026-10'], expected: 8000, done: 0, avg: 0 }, { rows: ['h|cogs|person b|2026-09'], expected: 6000, done: 6000, avg: 0 }], '… with what the month expects and how much of it is done: October\'s Tool S is paid, September\'s Person B is paid');
  // The statement brings the November rent: the occurrence closes by amount, like any row the table has no name for.
  M = await C(ledA({ tx: [filed('r-oct', '2026-10-15', -900, 'other', 'Landlord Ltd', { at: ms('2026-10-19T09:00:00Z') }), filed('r-nov', '2026-11-14', -900, 'other', 'Landlord Ltd', { at: ms('2026-11-16T09:00:00Z') }), reach('Wise', '2026-11-16')] }), P, '2026-11-17', { H: 30 });
  same([item(M, 'rent').done.rows, item(M, 'h|m|studio rent|2026-11').state, item(M, 'h|m|studio rent|2026-11').done.note, item(M, 'h|m|studio rent|2026-11').done.rows, item(M, 'h|m|studio rent|2026-11').done.day], [['r-oct'], 'done', 'amount', ['r-nov'], '2026-11-14'], 'a month on: −900 on 15 Oct closed October\'s row, −900 on 14 Nov closes November\'s occurrence — by amount, the table has no «Studio rent»');
});

await run('regular', 'what counts as regular (C2–C5)', async () => {
  const on = (label, c, months, amt, day = 15, b = 'Wise') => months.map((m, i) => sheet(`${label}-${m}`, `${m}-${pad(day)}`, Array.isArray(amt) ? amt[i] : amt, c, label, { b }));
  const L = ledger([
    ...on('Client Four', 'rev', ['2026-04', '2026-06', '2026-08', '2026-09'], 5000),
    ...on('Client Three', 'rev', ['2026-06', '2026-08', '2026-09'], 5000),
    ...on('Client Rising', 'rev', HALF, [1000, 2000, 3000, 4000, 5000, 9000], 10),
    ...on('Tool Dear', 'fixed', HALF, [200, 200, 200, 200, 200, 260], 7),
    ...on('Tool Cheap', 'fixed', HALF, 60, 9),
    ...on('Person Moved', 'cogs', HALF, 1500, 12).map((r, i) => ({ ...r, b: i < 4 ? 'Wise' : 'Barclays' })),
    reach('Wise', '2026-10-05'), reach('Barclays', '2026-10-05'),
  ]);
  const M = await C(L, plan({ banks: [bal('Wise', 'GBP', 50000, '2026-10-05'), bal('Barclays', 'GBP', 5000, '2026-10-05')] }));
  same(M.series.map((x) => [x.sk, x.paid, x.E, x.day, x.bank]), [['cogs|person moved', 6, 1500, 12, 'Barclays'], ['fixed|tool dear', 6, 260, 7, 'Wise'], ['rev|client four', 4, 5000, 15, 'Wise'], ['rev|client rising', 6, 5000, 10, 'Wise']],
    'paid in 4 of the 6 due months is regular, 3 of 6 is not; a £60 subscription is too small to be a series; the usual amount is the median of the last three months (5,000 of 4,000 · 5,000 · 9,000) — for a subscription the last charge (260); the bank is where the last payments went');
  same([M.avg.rev.E, M.avg.small.E, item(M, 'h|rev|client three|2026-10'), item(M, 'h|fixed|tool cheap|2026-10')], [2500, 60, null, null], '… and what is not a series is in the averages: Client Three in revenue (median of 0 · 0 · 5,000 · 0 · 5,000 · 5,000), the small subscription in «small»');
});

await run('parts', 'a client who pays in parts (E4)', async () => {
  // Client M pays 4,000 on the 10th and 2,000 on the 20th, every month.
  const rows = HALF.flatMap((m, i) => [sheet('m1-' + i, m + '-10', 4000, 'rev', 'Client M'), sheet('m2-' + i, m + '-20', 2000, 'rev', 'Client M')]);
  const P = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')], ...parts });
  let M = await C(ledger([...rows, reach('Wise', '2026-10-05')]), P());
  const s = M.series[0];
  const oct = (m) => item(m, 'h|rev|client m|2026-10');
  same([s.sk, s.E, s.multi, s.paid, s.g, oct(M).cash, oct(M).state, oct(M).date === '2026-10-' + pad(s.day)], ['rev|client m', 6000, true, 6, 7, 6000, 'due', true], 'two payments a cycle: one series, usual 6,000 a month, tolerance a week');
  M = await C(ledger([...rows, reach('Wise', '2026-10-05')]), P({ inflows: [row('t', 'Client M', 2000, '2026-10-20')] }));
  same([M.IN, oct(M).cash, oct(M).occ], [6000, 4000, { E: 6000, typ: 2000, got: 0 }], 'a typed 2,000 for the second part leaves the month at 6,000: 2,000 typed + 4,000 by history');
  // The first part arrives. 4,000 of 6,000 is under 0.7 of the usual month, so the rest is still expected.
  const first = (amt) => ledger([...rows, filed('oct-1', '2026-10-10', amt, 'rev', 'Client M', { at: ms('2026-10-13T09:00:00Z') }), reach('Wise', '2026-10-13')]);
  M = await C(first(4000), P(), '2026-10-14');
  same([oct(M).state, oct(M).cash, oct(M).occ, M.now], ['waiting', 2000, { E: 6000, typ: 0, got: 4000 }, 14000], 'the first 4,000 arrives: the month is not closed, 2,000 is still expected');
  M = await C(first(4300), P(), '2026-10-14');
  same([oct(M).state, oct(M).done.note, oct(M).amt, oct(M).cash], ['done', 'cycle', 4300, 0], '4,300 instead — 0.7 of the usual month or more: the month is closed, no phantom remainder');
  // Nothing more by the 24th: what is left of a month paid in parts is dropped, not carried as late.
  M = await C(ledger([...rows, filed('oct-1', '2026-10-10', 4000, 'rev', 'Client M', { at: ms('2026-10-13T09:00:00Z') }), reach('Wise', '2026-10-24')]), P(), '2026-10-25');
  same([oct(M).state, oct(M).done.note, oct(M).amt, M.LATE, card(M, 10).length, item(M, 'h|rev|client m|2026-11').state], ['done', 'part', 4000, 0, 0, 'due'], 'the second part never comes: eleven days past the habit the rest is dropped — not late, no card, November as usual');
});

await run('verdicts', 'the verdict, top down, and the order of «Нужно решить»', async () => {
  const at = (amt, more = {}) => plan({ banks: [bal('Wise', 'GBP', amt + 120, '2026-09-30')], ...more });
  let M = await C(ledA(), at(4880));
  same([M.verdict.id, M.LOW, M.LOWDAY, M.plusDay], ['v4', -1120, '2026-10-20', '2026-10-28'], 'NOW 4,880 — v4: «20 окт не хватит 1,120. В плюс выходим 28 окт»');
  M = await C(ledA({ skip: (r) => /^a\d$/.test(r.id) }), at(4880));
  same([M.verdict.id, M.plusDay, M.IN], ['v4', '', 0], '… and with nothing coming in: «До конца периода в плюс не выходим»');
  M = await C(ledA(), at(10000));
  same([M.verdict.id, M.LOW, M.cushion], ['v3', 4000, 5000], 'NOW 10,000 — v3: enough, but 4,000 is under the cushion of 5,000');
  M = await C(ledA(), at(12000));
  same([M.verdict.id, M.LOW, M.LOW_C, M.verdict.subs], ['v2', 6000, 4350, ['cautious', 'typed']], 'NOW 12,000 — v2: enough if clients pay as usual; cautiously 4,350');
  M = await C(ledA(), at(13000));
  same([M.verdict.id, M.LOW, M.LOW_C], ['v1', 7000, 5350], 'NOW 13,000 — v1: enough even cautiously');
  M = await C(ledA({ inb: [inbox('in1', T, 500, '', 'UNKNOWN PAYER', { at: AT2 })] }), at(13000));
  same([M.verdict.id, M.inbox, M.now], ['vi', { n: 1, gbp: 500, inN: 1, inGbp: 500, prov: 0, provGbp: 0 }, 13500], 'the same with an incoming £500 nobody has filed — vi: «Сначала разберите 1 поступление на £500»');
  M = await C(ledA(), at(10000, { cushion: 3000 }));
  same([M.verdict.id, M.cushion], ['v2', 3000], 'the cushion is the plan\'s: at 3,000 the base fixture is v2');
  // Everything at once: the balance first, then typed money by size, then what has no date, then history.
  M = await C(ledA({ skip: (r) => r.id === 'b5', inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] }), planA({
    inflows: [row('e', 'Client E', 4000, '2026-09-22'), row('u', 'Client U', 900, '')],
    team: [row('f', 'Person F', 700, '2026-09-20'), row('big', 'Person Y', 5000, '2026-09-18')],
  }));
  same(M.cards.map((c) => [c.n, c.item || c.count || c.accounts.length]), [[1, 1], [4, 1], [8, 'big'], [7, 'e'], [8, 'f'], [9, 1], [10, 1]], 'cards: 1 no balance · 4 «Разбор» · the late typed rows by size, 5,000 then 4,000 then 700 · 9 without a date · 10 history');
});

await run('stale', 'how old the balances are (H1, H2)', async () => {
  let M = await C(ledA(), planA(), '2026-10-13');
  same([M.nowIsToday, M.nowDate, M.nowAcct, M.nowApprox, acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, M.verdict.asOf], [false, '2026-10-05', 'Wise|GBP', false, 8, '', '2026-10-05'], '13 Oct, statements through 5 Oct: «Денег на 5 окт», «По остаткам на 5 окт: …», eight days is not yet stale');
  M = await C(ledA(), planA(), '2026-10-15');
  same([acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, M.nowApprox, M.verdict.subs.includes('stale')], [10, 'ask', true, true], '15 Oct: ten days without a statement — «≈» on NOW and a line under the verdict');
  M = await C(ledA({ tx: [reach('Wise', '2026-11-04')] }), planA(), '2026-11-05');
  same([acct(M, 'Wise|GBP').age, acct(M, 'Wise|GBP').stale, acct(M, 'Wise|GBP').handDays, acct(M, 'Wise|GBP').handOld, M.nowApprox, M.nowIsToday], [1, '', 36, true, true, true], '5 Nov with fresh statements: the balance itself was typed 36 days ago — «≈», «сверьте с банком»');
  // An account in use that holds next to nothing does not date the total either: «material» is a tenth of the
  // money, or a line due within a fortnight.
  M = await C(ledA({ tx: [filed('mosta-fee', '2026-08-20', -50, 'other', 'Bank fee', { b: 'Mosta', cur: 'USD', at: 1 })] }), planA({ banks: [bal('Mosta', 'USD', 100, '2026-08-20')] }));
  same([acct(M, 'Mosta|USD').active, acct(M, 'Mosta|USD').material, acct(M, 'Mosta|USD').through, M.nowIsToday, M.nowDate, M.now], [true, false, '2026-09-28', true, '2026-10-05', 10074.07], 'Mosta holds $100 and is known only through 28 Sep, where the sheet ends: in use, not material — the total is still «Денег сейчас», dated by Wise');
  // An account nobody uses and nothing is planned on is neither asked for nor allowed to age the total.
  M = await C(ledA(), planA({ banks: [bal('Mosta', 'USD', 0, '2026-06-01'), { id: 'old', name: 'Tochka — RUB', bank: 'Tochka', cur: 'RUB', amt: 5000, legacy: true }] }));
  same([M.v0, M.nowIsToday, M.nowApprox, acct(M, 'Mosta|USD').active, acct(M, 'Tochka|RUB').active, acct(M, 'Tochka|RUB').old], [false, true, false, false, false, 5000], 'a Mosta balance from June and an old Tochka one, neither in use: no v0, no «≈»');
});

await run('average', 'last month\'s remainder while an account is known only short of its end (D6)', async () => {
  // Fixture E with a thin September (4,000): the usual month is 9,500, and 5,500 of September never showed.
  const L = (reachB) => { const l = ledE(); l.tx.find((r) => r.id === 'o5').a = 4000; l.tx.push(filed('fee', '2026-09-25', -10, 'other', 'Bank fee', { b: 'Barclays' }), ...(reachB ? [reach('Barclays', reachB)] : [])); return l; };
  const P = (asOf) => plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05'), bal('Barclays', 'GBP', 500, asOf)] });
  let M = await C(L('2026-09-30'), P('2026-09-25'));
  figs(M, { IN: round2(9500 + 9500 * 5 / 30) }, 'the statements of every bank in use reach 30 Sep: September is what it was');
  same([M.avg.rev.E, M.avg.rev.lump], [9500, null], '… the usual month is 9,500 and nothing is carried over');
  M = await C(L(''), P('2026-09-25'));
  figs(M, { IN: round2(5500 + 9500 + 9500 * 5 / 30) }, 'Barclays is known only up to 25 Sep: the 5,500 September did not show is expected as well, today');
  same([M.avg.rev.lump, M.days[0].dripIn, M.inParts.avg, acct(M, 'Barclays|GBP').through], [{ ym: '2026-09', left: 5500, through: '2026-09-25' }, round2(5500 + 9500 / 26), round2(5500 + 9500 + 9500 * 5 / 30), '2026-09-25'], '… «в среднем · известно по 25 сен», all of it on the first day');
  same([M.month.blocks.rev.rest, M.month.before, M.months.by['2026-09'].inflows.avg, M.months.by['2026-10'].inflows.avg], [9500, { ym: '2026-09', in: 5500, out: 0 }, 5500, 9500], '… and it is September\'s: October\'s month view expects only October\'s 9,500, and the constructor shows the 5,500 on September\'s page');
  M = await C(L(''), P('2026-10-02'));
  figs(M, { IN: round2(9500 + 9500 * 5 / 30) }, 'its balance typed as of 2 Oct, still no newer statement: whatever September moved there is inside the figure typed, and is not expected a second time');
  same([M.avg.rev.lump, acct(M, 'Barclays|GBP').cov, acct(M, 'Barclays|GBP').through], [null, '2026-09-25', '2026-10-02'], '… the statements still stop on 25 Sep; the account is known through 2 Oct');
});

await run('edges', 'what must not be counted, and what must not break', async () => {
  // A regular payout on a bank whose statements stopped in July. August's is more than 45 days old: history is not
  // waited for that long. September's nobody could have seen: it is counted today. October's is due.
  const L = ledger([...['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((m, i) => filed('q' + i, m + '-10', -1000, 'cogs', 'Person Q', { b: 'Barclays', at: 1 })), reach('Wise', '2026-10-05')]);
  let M = await C(L, plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05'), bal('Barclays', 'GBP', 5000, '2026-07-10')] }));
  same(M.items.map((it) => [it.cyc, it.state, it.day, it.cash]), [['2026-08', 'gone', '', 0], ['2026-09', 'blind', T, -1000], ['2026-10', 'due', '2026-10-10', -1000], ['2026-11', 'due', '2026-11-10', -1000], ['2026-12', 'due', '2026-12-10', -1000]], 'statements of the bank stop on 10 Jul: August gone, September counted today, October on its day');
  same([M.OUT, M.now, acct(M, 'Barclays|GBP').active, acct(M, 'Barclays|GBP').through, M.nowDate, M.sheetEnd], [2000, 15000, false, '2026-07-10', '2026-10-05', ''], '… the account itself, silent for more than 60 days, is not «in use»: its July balance is in the total and does not date it (B1, H1 as written)');
  // A forecast counts in pounds and knows only its bank. Confirmed («Сумма верная») it is a stored typed row in GBP
  // on Tochka — and must not call for a «Tochka GBP» balance nobody has.
  const R = ledger([...HALF.map((m, i) => filed('r' + i, m + '-08', 354000, 'rev', 'Client R', { cur: 'RUB', b: 'Tochka', at: 1 })), reach('Tochka', '2026-10-05', 'RUB')]);
  const PR = (inflows = []) => plan({ banks: [bal('Tochka', 'RUB', 118000, '2026-10-05')], inflows });
  const r0 = await C(R, PR());
  const occ = item(r0, 'h|rev|client r|2026-10');
  same([occ.cash, occ.cur, occ.bank, occ.acct, r0.now, r0.series[0].cur], [3000, 'GBP', 'Tochka', 'Tochka|RUB', 1000, 'RUB'], 'a client paid in roubles: the forecast is ≈£3,000 on Tochka, on the rouble account');
  M = await C(R, PR([row(occ.id, occ.name, occ.amt, occ.date, { bank: 'Tochka', sk: occ.sk, cyc: occ.cyc, src: 'hist', c0: TAP })]));
  same([M.v0, M.missing, item(M, occ.id).kind, item(M, occ.id).acct, M.IN, M.accounts.length], [false, [], 'typed', 'Tochka|RUB', r0.IN, 1], '«Сумма верная» on it: a typed row now, still on the rouble account — no «Нет остатка: Tochka GBP»');
  M = await C(R, PR([row(occ.id, occ.name, occ.occ.E, occ.date, { bank: 'Tochka', sk: occ.sk, cyc: occ.cyc, src: 'hist', sure: false, c0: TAP, paid: paid(T) })]));
  same([M.now, acct(M, 'Tochka|RUB').marks, M.END, M.nowApprox], [4000, 354000, r0.END, true], '«Получено» on it instead: the mark is in the rouble balance at today\'s rate, END where it was');
  // Last month's salary is not «возможно, уже оплачено» for this month's.
  const A = ledA({ skip: (r) => r.id === 'b5', tx: [filed('b-sep', '2026-09-20', -6000, 'cogs', 'Person B')] });
  M = await C(A, planA({ team: [row('b', 'Person B', 6000, '2026-10-20')] }));
  same([item(M, 'b').cyc, item(M, 'b').hint, item(M, 'b').state, M.OUT, item(M, 'h|cogs|person b|2026-10')], ['2026-10', null, 'due', 6120, null], 'Person B typed for 20 Oct, September\'s payment of the same sum in the statements: no hint — it is September\'s');
  // A refund is not a payment: it lowers what the month has paid and closes nothing.
  M = await C(ledA({ tx: [filed('refund', '2026-10-04', 120, 'fixed', 'Tool S')] }), planA());
  same([M.now, item(M, 'h|fixed|tool s|2026-10').state, item(M, 'h|fixed|tool s|2026-10').cash, M.month.blocks.fixed.fact], [10120, 'waiting', -120, 0], 'Tool S refunds its 120 on 4 Oct: the balance has it back, October\'s charge is expected again, the month\'s fact is nil');
  M = await C(ledA({ tx: [filed('refund', '2026-10-04', 2400, 'cogs', 'Client C')] }), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] }));
  same([item(M, 'c').state, M.IN], ['due', 10400], 'money coming back into a cost block does not close an invoice of the same sum');
  // Nothing at all, and nonsense: a model, not an exception.
  const odd = await page.evaluate((t) => {
    const out = [];
    for (const [l, p] of [[undefined, undefined], [{}, {}], [{ tx: 'x', inbox: null, fx: null, rules: 7 }, { banks: 'no', inflows: [null, 5, { amt: 'abc', date: '2026-13-45' }], ser: [], tails: 3 }], [{ tx: [{ id: 1, d: 'nope', a: 5, c: 'rev' }, { id: 2, d: '2026-10-01', a: NaN, c: 'rev', l: 'X', o: { a: 'q' } }, null] }, { v: 2, banks: [{ bank: 'Wise', cur: 'XXX', amt: 'a lot', asOf: '2026-02-31' }] }]]) {
      try { const M = window.__money.compute(l, p, t, { H: 30 }); out.push([M.verdict.id, M.now, M.IN, M.OUT, M.items.length, M.days.length]); } catch (e) { out.push('threw: ' + e.message); }
    }
    try { window.__money.compute({}, {}, 'today'); out.push('took a date that is not one'); } catch (e) { out.push('T refused'); }
    return out;
  }, T);
  same(odd, [['v3', 0, 0, 0, 0, 31], ['v3', 0, 0, 0, 0, 31], ['v3', 0, 0, 0, 1, 31], ['v3', 0, 0, 0, 0, 31], 'T refused'], 'no documents, empty ones, and ones full of nonsense give an empty model; only a T that is not a date is refused');
});

await run('transfer', 'own transfers, and a founder\'s own tax (§5.10, §5.15)', async () => {
  const P = planA({ banks: [bal('Barclays', 'GBP', 4618, '2026-10-05')] });
  const one = await C(ledA(), P);
  const two = await C(ledA({ tx: [filed('t-out', T, -1000, 'skip', '', { b: 'Barclays', at: AT2 }), filed('t-in', T, 1000, 'skip', '', { at: AT2 })] }), P);
  same([acct(two, 'Wise|GBP').est, acct(two, 'Barclays|GBP').est, two.now, two.IN, two.OUT, two.month.M_EXP], [11000, 3618, one.now, one.IN, one.OUT, one.month.M_EXP], 'Wise +1,000 and Barclays −1,000 paired as a transfer: 11,000 and 3,618, NOW unchanged, in no flow figure');
  // HMRC Mika, monthly: a series of its own, Mika's in every total, in no average and not studio tax.
  const L = ledA({ tx: HALF.flatMap((m, i) => [sheet('hm' + i, m + '-23', 800 + 10 * i, 'tax', 'HMRC Mika', { b: 'Barclays' }), sheet('paye' + i, m + '-19', 300, 'tax', 'PAYE', { b: 'Barclays' })]).concat([sheet('ct', '2026-07-09', 5000, 'tax', 'HMRC CT', { b: 'Barclays' })]) });
  const M = await C(L, P);
  const s = M.series.find((x) => x.sk === 'tax|@mika');
  same([s.blk, s.grp, s.list, s.E, s.regular, item(M, 'h|tax|@mika|2026-10').grp, item(M, 'h|tax|@mika|2026-10').cash], ['tax', 'mika', 'taxes', 850, true, 'mika', -850], 'HMRC Mika: series tax|@mika, last month\'s amount, counted as Mika\'s');
  same([M.month.blocks.mika.rest, M.month.blocks.founders.rest, M.month.blocks.tax.rest, M.month.blocks.tax.usual, M.month.blocks.mika.usual, M.outParts.founders, M.outParts.taxes, Object.values(M.avg).map((x) => x.E)], [850, 850, 0, 300, 825, 850, 0, [0, 0, 0, 0, 0, 0, 0]], '… under «Фаундеры» and nowhere else: not studio tax, and in no average — nor is the studio\'s own PAYE, 300 every month: tax is typed or computed, never averaged');
  same(M.series.some((x) => x.blk === 'tax' && x.grp === 'tax'), false, '… and studio tax is no series either');
});

await run('taps', 'what a tap must not change (§5.2, §5.11)', async () => {
  const fixtures = [
    ['fixture A with typed rows', ledA({ vat: true }), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08'), row('a', 'Client A', 850, '2026-10-27')], team: [row('g', 'Person G', 1000, '2026-10-07'), row('f', 'Person F', 700, '2026-09-20')], taxes: [row('ct', 'Corporation tax', 2000, '2026-10-30')] }), T],
    ['fixture D with a typed draw', ledD(), plan({ banks: [bal('Wise', 'GBP', 10000, '2026-09-30')], other: [row('draw', 'Mika', 1000, '2026-10-15', { blk: 'mika' })] }), T],
    ['fixture E with a typed one-off', ledE(), plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')], inflows: [row('n', 'Client N', 4000, '2026-10-12')] }), T],
  ];
  for (const [name, L, P, day] of fixtures) await taps(name, L, P, day);
});

// For every line the forecast counts: mark it paid, and END must not move (the money goes from the line into
// «сейчас») — nor may the running month: its result and every block's «Итог месяца» stand where they stood, the
// payment only passes from «ещё по плану» to «факт». Confirm a forecast («Сумма верная»), and neither IN nor OUT
// nor END may move. Then §5.11: a typed
// one-off no larger than what the block's average has left, or a typed row of a regular client well inside what is
// left of the month's forecast, changes neither IN nor OUT; marking the one-off then takes it out of the line and
// leaves END alone — the average does not grow back.
async function taps(name, L, P, day, limit = 40) {
  const TAP = ms(day + 'T11:00:00Z');
  const M = await C(L, P, day);
  if (M.v0) return ok(false, `${name}: no total to compare`, M.missing);
  const inW = (it) => it.day && it.day <= M.end && it.acct && acct(M, it.acct).anchor;
  const stored = (it, more) => {
    const P2 = JSON.parse(JSON.stringify(P));
    if (it.src === 'row') { const r = P2[it.list].find((x) => String(x.id) === it.id); Object.assign(r, more); return P2; }
    const sure = more.sure !== undefined ? more.sure : it.kind === 'typed';
    // A forecast row is stored with its month's usual amount (occ.E) while it is still a forecast, and with what is
    // left of it once it is confirmed: a confirmed row is a typed row.
    P2[it.list].push(row(it.src === 'vat' ? 'vat-row' : it.id, it.name, it.src === 'occ' && !sure ? it.occ.E : it.amt, it.date, { cur: it.cur, bank: it.bank, sk: it.sk, c0: TAP, ...(it.src === 'occ' ? { cyc: it.cyc, src: 'hist' } : {}), ...more, sure }));
    return P2;
  };
  const all = M.items.filter(inW);
  const lines = all.filter((it) => it.kind === 'typed').slice(0, limit / 2).concat(all.filter((it) => it.kind !== 'typed').slice(0, limit / 2));
  const off = [];
  const month = (A) => [A.month.M_EXP, ...Object.keys(A.month.blocks).sort().map((k) => A.month.blocks[k].total)];
  const sameMonth = (A, B) => month(A).every((v, i) => close(v, month(B)[i], 0.011));
  for (const it of lines) {
    const X = await C(L, stored(it, { paid: paid(day, TAP) }), day, { H: 30 }, `${name}, ${it.id} marked`);
    if (!close(X.END, M.END, 0.011)) off.push(`${it.id} marked: END ${M.END} → ${X.END}`);
    if (!sameMonth(X, M)) off.push(`${it.id} marked: the month's result ${M.month.M_EXP} → ${X.month.M_EXP}`);
    if (item(X, it.src === 'vat' ? 'vat-row' : it.id).done.by !== 'mark') off.push(`${it.id} marked: the mark does not stand (${item(X, it.src === 'vat' ? 'vat-row' : it.id).state})`);
    if (it.kind === 'hist') {
      const Y = await C(L, stored(it, { sure: true }), day, { H: 30 }, `${name}, ${it.id} confirmed`);
      if (!close(Y.END, M.END, 0.011) || !close(Y.IN, M.IN, 0.011) || !close(Y.OUT, M.OUT, 0.011)) off.push(`${it.id} confirmed: IN ${M.IN} → ${Y.IN}, OUT ${M.OUT} → ${Y.OUT}, END ${M.END} → ${Y.END} (${Y.verdict.id})`);
    }
  }
  ok(!off.length, `${name}: marking any of ${lines.length} counted lines paid leaves END at ${M.END} and the month's result at ${M.month.M_EXP}, block by block; «Сумма верная» on the ${lines.filter((it) => it.kind === 'hist').length} forecast ones leaves IN, OUT and END`, off.slice(0, 6));
  const off2 = [];
  let tried = 0;
  const main = M.accounts.find((a) => a.anchor && a.cur === 'GBP');
  for (const [b, x] of Object.entries(M.avg)) {
    const left = x.months[day.slice(0, 7)].left;
    if (!(left > 2) || !main) continue;
    tried++;
    const list = b === 'rev' ? 'inflows' : b === 'cogs' ? 'team' : 'other';
    // … of an amount no row waiting in «Разбор» could be taken for: an unfiled row of the same sum on the same bank
    // is, rightly, read as the marked line's own payment, and that is another check's business («4», «marks»).
    const taken = (v) => (L.inbox || []).some((r) => !r.c && r.b === main.bank && r.o && Math.abs(Math.abs(r.o.a) - v) <= 0.06 * v);
    const amount = [2, 3, 5, 7].map((k) => round2(left / k)).find((v) => !taken(v));
    const one = row('zz-one-off', 'Zzyzx one-off', amount, day, { bank: main.bank, blk: b === 'small' ? 'other' : b, c0: TAP });
    const P2 = JSON.parse(JSON.stringify(P));
    P2[list].push(one);
    const X = await C(L, P2, day, { H: 30 }, `${name}, a one-off in ${b}`);
    if (!close(X.IN, M.IN, 0.011) || !close(X.OUT, M.OUT, 0.011)) off2.push(`one-off of ${one.amt} in ${b}: IN ${M.IN} → ${X.IN}, OUT ${M.OUT} → ${X.OUT}`);
    P2[list][P2[list].length - 1] = { ...one, paid: paid(day, TAP) };
    const Y = await C(L, P2, day, { H: 30 }, `${name}, the one-off in ${b} marked`);
    const moved = b === 'rev' ? [M.IN - one.amt, M.OUT] : [M.IN, M.OUT - one.amt];
    if (!close(Y.END, M.END, 0.011) || !close(Y.IN, moved[0], 0.011) || !close(Y.OUT, moved[1], 0.011)) off2.push(`one-off in ${b} marked: END ${M.END} → ${Y.END}, IN ${Y.IN}, OUT ${Y.OUT}`);
    if (!sameMonth(X, M) || !sameMonth(Y, M)) off2.push(`one-off in ${b}: the month's result ${M.month.M_EXP} → ${X.month.M_EXP} typed → ${Y.month.M_EXP} marked`);
  }
  for (const it of M.items.filter((x) => x.src === 'occ' && x.kind === 'hist' && x.state === 'due' && x.day <= M.end).slice(0, limit)) {
    // E4 drops what is left of a month once typed rows reach 0.7 of the usual amount, so «a typed row ≤ the
    // remaining occurrence» keeps IN and OUT only below that line (and exactly at the usual amount).
    const amt = round2(Math.min(0.5 * Math.abs(it.full), 0.69 * it.occ.E - it.occ.typ - it.occ.got));
    if (!(amt > 1)) continue;
    tried++;
    const P2 = JSON.parse(JSON.stringify(P));
    // … typed in the currency of the account the forecast stands on: a row in pounds on a bank that has only a
    // dollar account would call for an account nobody has, and the page would rightly withhold its total.
    const cur = it.acct.split('|')[1] || 'GBP';
    P2[it.list].push(row('zz-typed', it.sk.startsWith('tax|@') ? 'HMRC ' + it.grp : it.label, cur === 'GBP' ? amt : round2(amt * M.fx[cur]), it.date, { bank: it.bank, cur, sk: it.sk, skBy: 'hand', c0: TAP }));
    const X = await C(L, P2, day, { H: 30 }, `${name}, a typed row for ${it.id}`);
    if (!close(X.IN, M.IN, 0.011) || !close(X.OUT, M.OUT, 0.011)) off2.push(`typed ${amt} against ${it.id}: IN ${M.IN} → ${X.IN}, OUT ${M.OUT} → ${X.OUT}`);
  }
  ok(!off2.length, `${name}: ${tried} typed rows inside an average or a month's forecast leave IN ${M.IN} and OUT ${M.OUT}; a marked one-off leaves END`, off2.slice(0, 6));
}

await run('browsers', 'two browsers, one answer (§5.12)', async () => {
  const other = await open('second', '2026-12-31T23:59:00+13:00');
  const args = [ledA({ vat: true }), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')], team: [row('f', 'Person F', 700, '2026-09-20')] }), T, { H: 60 }];
  const run1 = await page.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args);
  const run2 = await other.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args);
  ok(run1 === run2 && run1.length > 5000, `the same two documents and T give byte-equal models in two browsers with different clocks (${run1.length} bytes)`);
  await other.context().close();
  const tz = await browser.newContext({ timezoneId: 'Pacific/Auckland' });
  const far = await tz.newPage();
  await tz.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  far.on('pageerror', (e) => errs.push(`auckland: PAGEERROR ${e.message}`));
  await far.goto(BASE + '/money/index.html');
  await far.waitForFunction(() => window.__money && window.__cash && window.__cash.state());
  ok((await far.evaluate((a) => JSON.stringify(window.__money.compute(...a)), args)) === run1, '… and in a browser whose own zone is Auckland');
  await tz.close();
});

await run('26 on screen', 'day one: an account in use without a balance, and typing it', async () => {
  const L = ledA({ tx: [sheet('bc', '2026-09-15', 40, 'other', 'Bank fee', { b: 'Barclays' })], inb: [inbox('csv', '2026-10-02', -50, '', '', { b: 'Barclays' })] });
  const pg = await scene('day one', L, planA());
  let S = await holds(pg, 'day one');
  shows(S, { verdict: 'v0', now: '', low: 11000, in: 8000, out: 6120 }, 'the screen');
  same([await text(pg, '#view-today .td-say'), S.live.now.t, (await texts(pg, '#view-today .kpi .lbl'))[3], (await texts(pg, '#view-today .kpi .hint'))[0], await pg.$eval('#view-today .td-need .op', (e) => e.dataset.tdCard)],
    ['Нет остатка: Barclays GBP. Без него итог не посчитать. По истории за 30 дней придёт ≈£8,000 и уйдёт ≈£6,100.', '—', 'Нужно на счетах сегодня', 'не хватает остатка: Barclays GBP', '1'],
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
  same([await saved(pg), store.cash.puts, store.cash.doc.v, store.cash.doc.savedBy, store.cash.doc.banks.length, store.led.puts], [true, 1, 2, 'Mika', 2, 0], '… saved once, as version 2, signed; the ledger untouched');
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

await run('27 on screen', 'the old plan: rewritten as version 2 once, by whoever opens it first', async () => {
  const v1 = {
    v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, horizon: '2026-11-10', fx: { USD: 1.3, RUB: 110, EUR: 1.2, AMD: 500 },
    banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }, { id: 'r2', name: 'Tochka — RUB', amt: 0, cur: 'RUB', bank: 'Tochka', on: true, tag: '', info: false, date: '' }],
    inflows: [{ id: 'r3', name: 'Client A', amt: 8000, cur: 'GBP', bank: 'Wise', on: true, tag: 'нужен PO', info: false, date: '2026-10-27' }],
    team: [{ id: 'r4', name: 'Person B', amt: 6000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-09-20', paid: true, paidAdj: { bank: 'Wise', cur: 'GBP', delta: -6000 } }],
    taxes: [], other: [{ id: 'r5', name: 'Подписки', amt: 400, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-15' }],
  };
  const pg = await scene('old plan', ledA(), v1);
  same([await puts('cash', 1), store.cash.rev - store.cash.rev0, store.cash.doc.v], [1, 1, 2], 'the first page to load the old plan saves it once, as version 2');
  const expect = await page.evaluate((p) => window.__money.upgrade(p), v1);
  const sent = store.cash.doc;
  same([['banks', ...LISTS].map((k) => sent[k]), sent.ser, sent.tails, sent.vat], [['banks', ...LISTS].map((k) => expect[k]), expect.ser, expect.tails, expect.vat], '… and what it saved is exactly Live.upgrade of what was stored: no r1, r2…, old balances marked as not confirmed, rows with their block, «оплачено» as an old mark');
  let S = await holds(pg, 'the old plan');
  shows(S, { verdict: 'v0', now: '' }, 'the screen');
  same([await text(pg, '#view-today .td-say'), await text(pg, '#view-today .td-need .op .op-text')], ['Нет остатка: Wise GBP. Без него итог не посчитать. По истории за 30 дней придёт ≈£8,000 и уйдёт ≈£6,500.', 'В старой Кассе было Wise GBP £18,000 — подтвердите сумму и дату.'], 'v0 naming Wise GBP — Tochka, which nothing uses, is not asked for — and the card offers the old 18,000');
  await pg.click('#view-today .td-need [data-ed-bal]');
  same(await pg.$$eval(K('bal') + '[data-ed-acct]', (l) => l.map((e) => [e.dataset.edAcct, e.querySelector('[data-ed-bamt]').value, e.querySelector('[data-ed-bdate]').value].join(' '))), ['Wise|GBP 18000 ', 'Tochka|RUB  2026-10-06'], 'the sheet pre-fills 18,000 with an empty date: when it was true is the founder\'s to say');
  // Confirmed as of the end of September: the date is all a founder has to add.
  await pg.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bdate]', '2026-09-30');
  await pg.click(K('bal') + '[data-ed-save]');
  S = await holds(pg, 'the old balance confirmed as of 30 Sep');
  shows(S, { verdict: 'v1', now: 17880, 'acct.Wise|GBP': 17880 }, '18,000 as of 30 Sep, less the statement row of 3 Oct');
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
  same([store.cash.puts, store.cash.rev - store.cash.rev0, await two.evaluate(() => window.__cash.state().v), await text(two, '#sync'), (await look(two)).M.verdict.id], [1, 1, 2, 'сохранено', 'v0'], 'two founders at once: the later upgrade is refused, that page reads the plan again, and stays in step — nothing says «обновите страницу»');
  await two.reload();
  await two.waitForSelector('#view-today [data-live="verdict"]');
  same(await puts('cash', 1), 1, '… and from then on opening the page writes nothing');
  await two.context().close();
});

await run('8 on screen', 'a typed row and the forecast of its client, through «Добавить» and the row\'s card', async () => {
  const pg = await scene('test 8', ledA(), planA(CAUTIOUS));
  const base = await holds(pg, 'fixture A');
  shows(base, { verdict: 'v3', now: 10000, in: 8000, out: 6120, end: 11880, low: 4000, lowday: '2026-10-20', lowc: 2350, lowcday: '2026-11-03', late: 0, mexp: 1880 }, 'fixture A on the screen is test 1');
  same([await text(pg, '#view-today .td-say'), await text(pg, '#view-today .td-need .note')], ['Хватает, но впритык: 20 октября останется £4,000 — меньше запаса £5,000.', 'Решать нечего. Выписки свежие, просрочек нет.'], '… said in words');
  const id = await addRow(pg, 'inflows', { name: 'Client A', amt: 8500, date: '2026-10-27' });
  let S = await holds(pg, 'Client A £8,500 for 27 Oct');
  shows(S, { in: 8500, 'in.typed': 8500, 'in.hist': 0, lowc: 2500, lowcday: '2026-10-20' }, 'typed inflow Client A £8,500, 27 Oct: it stands in the forecast\'s place');
  let r = stored(S, id);
  same([r.name, r.amt, r.cur, r.bank, r.date, r.on, r.sure, r.blk, r.sk, r.skBy, r.m.by, r.c0 === r.m.t, r.c0 > AT1, 'mon' in r, S.P.inflows.length], ['Client A', 8500, 'GBP', 'Wise', '2026-10-27', true, true, 'rev', 'rev|client a', 'hand', 'Mika', true, true, false, 1], '… one row written: its fields, when and by whom, and — the name being the table\'s own — tied to that client');
  await allDays(pg);
  same(await drawn(pg, id), 'td-row | none | Client A | Wise | +£8,500 | вт 27 окт', '… and drawn under 27 Oct in full ink, exact, with no «≈» and nothing else to say');
  await editRow(pg, id, { date: '2026-10-05' });
  S = await holds(pg, 'dated 5 Oct');
  shows(S, { in: 8500, 'in.hist': 0 }, 'dated 5 Oct instead, 23 days before the habit: still October\'s');
  same([item(S.M, id).state, item(S.M, id).day], ['waiting', T], '… a day past its date with statements through the 5th: waited for today');
  await openRow(pg, id);
  same(plain(await pg.$eval(K('row') + '.ed-chks', (e) => e.textContent)), '+ VAT 20%каждый месяцэто сверх обычногов прогнозе на октябрь остаётся £0 по истории', 'the row\'s card says what is left of October\'s forecast, and offers «это сверх обычного»');
  await fill(pg, 'row', { date: '2026-10-27', extra: true });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, '«это сверх обычного»');
  shows(S, { in: 16500, 'in.typed': 8500, 'in.hist': 8000 }, 'with «это сверх обычного»: on top of the forecast');
  await editRow(pg, id, { extra: false, amt: 850 });
  S = await holds(pg, '£850');
  shows(S, { in: 8000, 'in.typed': 850, 'in.hist': 7150 }, 'amount £850 instead: 850 «в плане» + 7,150 «по истории»');
  await allDays(pg);
  same(await drawn(pg, 'h|rev|client a|2026-10'), 'td-row td-hist | none | Client A | Wise | ≈+£7,200 | ср 28 окт', '… the rest of October drawn as history: muted, «≈», two figures');
  // Unticked in «Касса»: the row keeps its place in October and is not counted.
  await pg.click('.nav [data-tab="cash"]');
  await pg.setChecked(`#cs-sec-inflows tr[data-cs-id="${id}"] [data-cs-f="on"]`, false);
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'unticked in «Касса»');
  shows(S, { in: 7150, 'in.typed': 0, 'in.hist': 7150 }, 'unticked in «Касса»: «а если не придёт»');
  r = stored(S, id);
  same([r.on, typeof r.offAt, r.sk, r.amt], [false, 'number', 'rev|client a', 850], '… the tick wrote when it was taken off, so the row still holds its place in October');
  ok((await saved(pg)) && store.cash.puts >= 1 && store.cash.doc.inflows[0].offAt === r.offAt && store.led.puts === 0, `all of it was saved through the plan's own save (${store.cash.puts} PUTs), and the ledger never touched`);
  await finish(pg);
});

await run('13 on screen', 'a late inflow leaves in two steps, and the card that asks about it', async () => {
  const pg = await scene('test 13', ledA(), planA(CAUTIOUS));
  const base = await holds(pg, 'fixture A');
  const id = await addRow(pg, 'inflows', { name: 'Client E', amt: 4000, date: '2026-09-22' });
  let S = await holds(pg, 'Client E £4,000 for 22 Sep');
  shows(S, { in: 12000, late: 4000, endc: base.fig('endc') }, 'typed inflow Client E £4,000, 22 Sep — 13 days late: still expected, no longer in the cautious line');
  const need = '#view-today .td-need .op[data-td-card="7"] ';
  same([await text(pg, need + '.op-name'), await text(pg, need + '.op-text'), await texts(pg, need + '> .row button'), (await texts(pg, '#view-today .kpi .hint'))[4]],
    ['Client E · £4,000', 'Ждали 22 сен, в выписках Wise GBP по 5 окт его нет · 13 дн. В осторожной линии уже не считаю; из расчёта уберу через 8 дн.', ['Получено', 'Перенести на…', 'Не придёт'], '1 клиент · дольше всех Client E, 13 дн.'], 'card 7 and the fifth figure say who, how long, and what happens next');
  same(await drawn(pg, id), 'td-row | none | Client E | Wise · просрочено 13 дн. | +£4,000 | сегодня, вт 6 окт', '… and the row, under today, says it in plain small words');
  await calm(pg, 'with a card of «Нужно решить»');
  // «Перенести на…» opens the row's card inside the card of «Нужно решить», the cursor on the date.
  await pg.click(need + '[data-ed-focus="date"]');
  same(await pg.evaluate(() => [document.querySelectorAll('[data-ed-card]').length, !!document.querySelector('#view-today .td-need [data-ed-card="row"]'), document.activeElement.id]), [1, true, 'ed-date'], '«Перенести на…»: the row\'s card opens in place, on the date');
  await calm(pg, 'with a row\'s card open');
  await fill(pg, 'row', { date: '2026-09-10' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'dated 10 Sep');
  shows(S, { in: 8000, late: 4000, end: 11880 }, 'dated 10 Sep, 25 days: out of both lines');
  same([(await text(pg, need + '.op-text')).endsWith('25 дн. Из расчёта убран, пока не перенесёте.'), await pg.$(inDays(id))], [true, null], '… card 7: «Из расчёта убран, пока не перенесёте», and the row is in no day');
  await pg.click(need + '[data-ed-focus="date"]');
  await fill(pg, 'row', { date: '2026-10-20' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'moved to 20 Oct');
  shows(S, { in: 12000, late: 0, low: 8000, lowday: '2026-10-20' }, '«Перенести на…» 20 Oct');
  same([await pg.$(need), (await texts(pg, '#view-today .kpi .hint'))[4]], [null, 'все платят как обычно'], '… the card is gone');
  // «Получено», one tap: the money moves from the line into «сейчас», and END stays.
  const before = S.fig('end');
  await tapRow(pg, id, 'paid');
  S = await holds(pg, '«Получено»');
  shows(S, { now: 14000, in: 8000, end: before, marks: 4000 }, '«Получено» on it');
  const r = stored(S, id);
  same([r.paid.on, r.paid.by, typeof r.paid.at, S.live.now.t, S.P.banks[0].amt, S.P.banks[0].asOf], [T, 'Mika', 'number', '≈£14,000', 10120, '2026-09-30'], '… a mark dated today; «≈» on the money now; the typed balance exactly as it was (§5.8)');
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

await run('20 on screen', 'a founder\'s draw against the average of his draws', async () => {
  const pg = await scene('test 20', ledD(), plan({ ...CAUTIOUS, banks: [bal('Wise', 'GBP', 10000, '2026-09-30')] }));
  let S = await holds(pg, 'fixture D');
  shows(S, { now: 9400, out: 2900, end: 6500, endc: 5775, 'out.founders': 2900 }, 'usual 3,000 a month, 600 already drawn');
  same([await text(pg, '#view-today .td-days .note'), await text(pg, '#view-today .td-foot .note')], ['В эти дни строк нет.', 'Плюс ровным слоем, в среднем: −£92 в день.'], '… all of it «в среднем»: no rows, one line under the days');
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="founder"]');
  same(await pg.evaluate(() => [[...document.querySelectorAll('[data-ed-card="add"] [data-ed-who]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' '), document.querySelector('#ed-name').value, !!document.querySelector('[data-ed-card="add"] [data-ed-f="vat"]')]), ['Mika* Misha Vanya', 'Mika', false], '«Добавить» → Фаундер: Mika · Misha · Vanya, starting on whoever is signed in');
  await pg.click(K('add') + '[data-ed-x]');
  const id = await addRow(pg, 'founder', { amt: 1000, date: '2026-10-15' });
  S = await holds(pg, 'a draw of £1,000');
  shows(S, { out: 2900 }, 'a typed draw of £1,000 on 15 Oct is taken out of the average');
  same([stored(S, id).blk, stored(S, id).name, 'sk' in stored(S, id), S.P.other.length, item(S.M, id).grp], ['mika', 'Mika', false, 1, 'mika'], '… a row of «Прочие расходы» whose block is the founder');
  await tapRow(pg, id, 'paid');
  S = await holds(pg, '«Оплачено»');
  shows(S, { now: 8400, out: 1900, end: 6500 }, '«Оплачено» on it');
  await tapRow(pg, id, 'unpaid');
  await editRow(pg, id, { amt: 3000 });
  S = await holds(pg, '£3,000, unmarked');
  shows(S, { now: 9400, out: 3500 }, '£3,000 instead, unmarked: more than the average had left');
  // «Настройки → Прогноз»: the switch for founders' draws, and the cushion.
  await pg.click('.nav [data-tab="settings"]');
  same(await pg.$$eval('#ed-forecast [data-ed-set]', (l) => l.map((e) => e.dataset.edSet + '=' + (e.type === 'checkbox' ? e.checked : e.value))), ['cushion=5000', 'rev=true', 'founders=true', 'vat=true', 'cautious=true'], '«Настройки → Прогноз»: «Запас» and four switches, as the plan has them — this plan shows the cautious scenario');
  await pg.setChecked('#ed-forecast [data-ed-set="founders"]', false);
  await pg.fill('#ed-forecast [data-ed-set="cushion"]', '7000');
  await pg.press('#ed-forecast [data-ed-set="cushion"]', 'Tab');
  await pg.click('.nav [data-tab="today"]');
  S = await holds(pg, 'draws no longer forecast');
  shows(S, { out: 3000, 'out.founders': 3000, verdict: 'v3' }, '«Считать выводы фаундеров как обычно» off, «Запас» 7,000: only the typed draw is left, and 6,400 is under the cushion');
  same([S.P.tails.mika, S.P.tails.misha, S.P.tails.vanya, S.P.tails.rev, S.P.cushion, S.M.cushion], [{ on: false }, { on: false }, { on: false }, { on: true }, 7000, 7000], '… stored in the plan: tails for the three founders, and the cushion');
  same([await saved(pg), store.cash.doc.tails.mika.on, store.cash.doc.cushion, store.cash.doc.other[0].amt], [true, false, 7000, 3000], '… and saved');
  await finish(pg);
});

await run('9 on screen', 'a typed row closed by a statement that is uploaded and filed after it', async () => {
  const pg = await scene('test 9', ledA(), planA());
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
  serve(ledA(), planA());
  const pg = await open('clash', undefined, { quiet: /409/ });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  // Another founder saves the plan while this page is open.
  store.cash.doc = planA({ cushion: 9000 });
  store.cash.rev++;
  await addRow(pg, 'inflows', { name: 'Client C', amt: 2400, date: '2026-10-08' });
  await pg.waitForSelector('#view-today .banner');
  same([await text(pg, '#view-today .banner b'), await text(pg, '#sync'), store.cash.doc.inflows.length, store.cash.doc.cushion, store.cash.puts], ['План изменился в другом окне.', 'касса изменилась в другом окне — обновите страницу', 0, 9000, 1],
    'the save is refused (409), the other founder\'s plan is left as it is, and both the first screen and the pill say «обновите страницу»');
  await pg.click('#view-today .banner [data-td-reload]');
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  same([(await look(pg)).P.cushion, await pg.$('#view-today .banner')], [9000, null], '«Обновить» reads the plan as it now is');
  await pg.context().close();
});

await run('cards', 'the rest of what the row\'s card and «Нужно решить» can do', async () => {
  // Fixture A without Person B's September payout, with a row that has no date and Client A's VAT.
  const P0 = planA({ ...CAUTIOUS, inflows: [row('u', 'Client U', 900, '', { mon: '2026-10' })] });
  const pg = await scene('cards', ledA({ vat: true, skip: (r) => r.id === 'b5' }), P0, { H: 60 });
  let S = await holds(pg, 'history that did not come, a row without a date, VAT by the rule');
  same(S.M.cards.map((c) => c.n), [9, 10], 'cards: 9 — without a date, 10 — history that did not come true');
  same(await texts(pg, '#view-today .td-need .op .op-name'), ['Без даты и не в расчёте: 1 строка на £900', 'По истории не сошлось: 1 строка на ≈£6,000'], '… in words');
  // Card 10: «В этом месяце не будет» writes the month down as switched off.
  await pg.click('#view-today .td-need [data-td-flip="hist"]');
  same(plain(await pg.$eval('#view-today .td-need .op[data-td-card="10"] .td-sub', (e) => e.firstElementChild.textContent)), 'Person B · обычно ≈£6,000 около 20-го · на 15 дн. позже обычного, в осторожной линии ещё считаю.', 'its one line: who, the habit, how late, and where it is still counted');
  const lowc = S.fig('lowc');
  await pg.click('#view-today .td-need [data-ed-do="skip"]');
  S = await holds(pg, '«В этом месяце не будет»');
  const sep = stored(S, 'h|cogs|person b|2026-09');
  same([S.M.cards.map((c) => c.n), sep.on, sep.amt, sep.sure, sep.src, sep.sk, sep.cyc, typeof sep.offAt, close(S.fig('lowc'), lowc + 7500)], [[9], false, 6000, false, 'hist', 'cogs|person b', '2026-09', 'number', true], '«В этом месяце не будет»: the forecast is written down under its own id, switched off; the cautious line gets its 7,500 back');
  // Card 9: a date for the row that has none.
  await pg.click('#view-today .td-need [data-td-flip="undated"]');
  await pg.click('#view-today .td-need .td-row[data-ed-open="u"]');
  await fill(pg, 'row', { date: '2026-10-12' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'a date for the row without one');
  same([S.M.cards.length, stored(S, 'u').date, 'mon' in stored(S, 'u'), item(S.M, 'u').day], [0, '2026-10-12', false, '2026-10-12'], 'card 9 → «Поставить даты»: dated, counted, and nothing is left to decide');
  // A forecast: «Сумма верная», then «Вернуть по истории».
  const occ = 'h|rev|client a|2026-10';
  const was = [S.fig('in'), S.fig('end')];
  await tapRow(pg, occ, 'sure');
  S = await holds(pg, '«Сумма верная»');
  same([S.fig('in'), S.fig('end'), S.fig('in.typed'), stored(S, occ).sure, stored(S, occ).amt, item(S.M, occ).kind], [was[0], was[1], 8900, true, 8000, 'typed'], '«Сумма верная» on October\'s Client A: a typed row now, and neither IN nor END moved (§5.2)');
  await openRow(pg, occ);
  same(await texts(pg, K('row') + '.ed-foot button'), ['Получено', 'Удалить', 'Вернуть по истории', 'Закрыть', 'Сохранить'], 'a written-down forecast offers «Вернуть по истории»');
  await pg.click(K('row') + '[data-ed-do="back"]');
  S = await holds(pg, '«Вернуть по истории»');
  same([stored(S, occ), item(S.M, occ).kind, S.fig('in')], [null, 'hist', was[0]], '… which deletes the row: the month is history again');
  // «Жду до…» = a new date on a forecast: the month's usual amount, not confirmed.
  await editRow(pg, occ, { date: '2026-11-02' });
  S = await holds(pg, 'a forecast moved');
  same([stored(S, occ).date, stored(S, occ).sure, stored(S, occ).amt, item(S.M, occ).kind, item(S.M, occ).day], ['2026-11-02', false, 8000, 'hist', '2026-11-02'], 'a forecast moved to 2 Nov is written down with its usual amount and stays history');
  // The VAT item: edited, it becomes one stored taxes row with the quarter's key.
  await openRow(pg, 'v|2026Q3');
  same([await text(pg, K('row') + '.ed-why'), await pg.$eval('#ed-name', (e) => e.disabled), await texts(pg, K('row') + '.ed-foot button')], ['По выручке: VAT, который был в счетах клиентов за этот квартал.', true, ['Оплачено', 'Перенести на…', 'В этом месяце не платим', 'Закрыть', 'Сохранить']], 'the VAT item\'s card: where the figure comes from, and what can be done with it');
  await fill(pg, 'row', { amt: 3800, date: '2026-11-05' });
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, 'VAT edited');
  const vat = S.P.taxes.find((r) => r.sk === 'tax|vat|2026Q3');
  same([S.P.taxes.length, vat.amt, vat.date, item(S.M, 'v|2026Q3'), item(S.M, vat.id).cash], [1, 3800, '2026-11-05', null, -3800], 'edited to £3,800 on 5 Nov: one stored row with sk tax|vat|2026Q3 in the computed item\'s place');
  // «каждый месяц» on a tax instalment: the row is the series' own, so October is not expected twice.
  const out = S.fig('out');
  const inst = await addRow(pg, 'taxes', { name: 'VAT — рассрочка', amt: 500, date: '2026-10-19', monthly: true });
  S = await holds(pg, 'an instalment every month');
  same([stored(S, inst).sk, S.P.ser['m|vat рассрочка'].made, S.P.ser['m|vat рассрочка'].day, S.M.items.filter((x) => x.sk === 'm|vat рассрочка').map((x) => [x.src, x.date, x.cash].join(' ')), close(S.fig('out'), out + 1000)], ['m|vat рассрочка', true, 19, ['row 2026-10-19 -500', 'occ 2026-11-19 -500', 'occ 2026-12-19 -500'], true], '«каждый месяц» on a tax instalment of £500 on the 19th: itself in October, one more in each month after — two inside 60 days, not three');
  // «Больше не ждём» on a subscription; «Удалить» asks twice.
  const tool = 'h|fixed|tool s|2026-11';
  await tapRow(pg, tool, 'stop');
  S = await holds(pg, '«Больше не ждём»');
  same([S.P.ser['fixed|tool s'].off, S.M.items.filter((x) => x.sk === 'fixed|tool s' && x.open).length, S.M.series.find((x) => x.sk === 'fixed|tool s').regular], [true, 0, false], '«Больше не ждём» on Tool S: the series is off, no month of it is expected');
  await openRow(pg, inst);
  await pg.click(K('row') + '[data-ed-do="del"]');
  same([await text(pg, K('row') + '[data-ed-do="del"]'), !!stored(await look(pg), inst)], ['Точно удалить?', true], '«Удалить» asks once more before it deletes');
  await pg.click(K('row') + '[data-ed-do="del"]');
  S = await holds(pg, '«Удалить»');
  same(stored(S, inst), null, '… and then does');
  await calm(pg, 'after all of it');
  await finish(pg);

  // The sheet of balances: «Что из этого уже прошло?» and «расходится с расчётом» (test 7 on the screen).
  const P7 = planA({ banks: [bal('Barclays', 'GBP', 3000, '2026-09-30')], other: [row('rent', 'Rent', 900, '2026-10-02', { bank: 'Barclays' })] });
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
// A row as it is drawn: its classes; whether its name is struck through; name, «≈», amount, currency, day, bank;
// the one remark; what its last cell offers.
const csRow = (pg, k, id) => pg.$eval(cs(k, id), (tr) => {
  const v = (f) => { const e = tr.querySelector(`[data-cs-f="${f}"]`); return e ? e.value : null; };
  const t = (s) => { const e = tr.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  const name = tr.querySelector('[data-cs-f="name"]') || tr.querySelector('.cs-nt');
  const tick = tr.querySelector('[data-cs-f="on"]');
  return [tr.className.replace('cs-r', '').trim() || 'typed', getComputedStyle(name).textDecorationLine, tick ? (tick.checked ? 'on' : 'off') : 'no tick', v('name') ?? t('.cs-nt'), t('[data-cs-ap]') + (v('amt') ?? t('.cs-at')), v('cur') ?? t('.cs-ct'), v('date') ?? t('.cs-dd'), v('bank') ?? t('.cs-bkn'), t('[data-cs-rm]'), t('[data-cs-st]')].join(' | ');
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
  minus.banks[0].amt = 480;
  minus.banks[2].amt = 230;
  for (const [name, P, verdict] of [['the fabricated studio', demoPlan(T), 'v3'], ['with no balance typed', none, 'v0'], ['five thousand short', minus, 'v4']]) {
    const pg = await scene('kassa figures', demoLedger(T), P, { H: 60 });
    const A = await holds(pg, `${name}, «Сегодня»`);
    const six = (S) => SIX.concat(S.M.v0 ? [] : ['lowc', 'lowday', 'lowcday', 'marks'].filter((k) => k in S.live)).map((k) => [k, S.live[k].v, plain(S.live[k].t)].join(' '));
    const heads = (tab) => pg.$$eval(`#view-${tab} .kpis .kpi`, (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    const today = [six(A), await heads('today'), await text(pg, '#view-today .page-sub')];
    await goCash(pg);
    let B = await holds(pg, `${name}, «Касса · План»`, 'cash');
    same([B.M.verdict.id, six(B), await heads('cash'), await text(pg, '#view-cash .page-sub')], [verdict, ...today], `${name} (${verdict}): the six figures of «Касса», their labels, the words under them and the line under the heading are those of «Сегодня», to the letter`);
    await goCash(pg, 'days');
    B = await holds(pg, `${name}, «Касса · По дням»`, 'cash');
    same([six(B), await heads('cash')], today.slice(0, 2), '… the same on «По дням»');
    same([B.fig('say'), plain(await text(pg, '#cs-answer .cs-hl')).slice(0, verdict === 'v0' ? 12 : verdict === 'v4' ? 0 : 20)], [{ v3: 'low', v0: 'v0', v4: 'minus' }[verdict], { v3: 'Хватает, но впритык:', v0: 'Нет остатка:', v4: '' }[verdict]], `… and «Итог» says what the sentence on «Сегодня» says: ${plain(await text(pg, '#cs-answer .cs-hl')).slice(0, 70)}…`);
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
  ok(wild[0] === tame[0] && wild[1] === tame[1] && wild[0].length > 2000 && wild[1].length > 2000 && /Ещё платить\s*\$1,350/.test(tame[0]), `… every word of «План» (${wild[0].length} characters) and of «По дням» (${wild[1].length}) is the same with them and without`, [wild[0].length, tame[0].length, wild[1].length, tame[1].length]);
  await sane.clock.setFixedTime(new Date('2026-10-06T23:30:00Z'));
  await sane.click('#view-cash [data-cs-view="days"]');
  const late = await holds(sane, 'half an hour after London midnight', 'cash');
  same([late.M.T, await sane.$eval('#cs-cal .cs-today', (e) => e.dataset.csCal), (await text(sane, '#view-cash .page-sub')).slice(0, 8), late.at.month], ['2026-10-07', '2026-10-07', 'ср 7 окт', '2026-10'], '… nor a date kept from when the page was loaded: past London midnight its today, its calendar and its heading are the 7th');
  await sane.context().close();
});

await run('constructor', 'the monthly constructor: one month at a time, filled from history, typed into where it stands', async () => {
  const P0 = planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')], team: [row('g', 'Person G', 1000, '2026-10-07', { paid: paid(T) })], other: [row('u', 'Something', 300, '', { mon: '2026-10' })] });
  const pg = await scene('constructor', ledA(), P0, { H: 60 });
  await goCash(pg);
  let S = await holds(pg, 'October', 'cash');
  // ---- October: what was typed, what history expects, what is done — each list in date order
  same([await monthAt(pg), await text(pg, '#cs-mname'), await pg.$$eval('#cs-month [data-cs-mon]', (l) => l.map((b) => b.dataset.csMon + (b.disabled ? ' off' : ''))), S.M.months.list], ['2026-10', 'Октябрь 2026', ['-1', '1'], ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']], 'it opens on the running month, October 2026, with a step back and a step forward');
  same([await listed(pg, 'inflows'), await listed(pg, 'team'), await listed(pg, 'taxes'), await listed(pg, 'other')], [['c', 'h|rev|client a|2026-10'], ['g', 'h|cogs|person b|2026-10'], [], ['h|fixed|tool s|2026-10', 'u']], 'October: each list holds that month\'s rows in date order — typed, expected by history and done — and a row without a date last');
  same([await csRow(pg, 'inflows', 'c'), await csRow(pg, 'inflows', 'h|rev|client a|2026-10')], ['typed | none | on | Client C | 2400 | GBP | 2026-10-08 | Wise |  | ✓ получено', 'cs-hist | none | on | Client A | ≈8000 | GBP | 2026-10-28 | Wise |  | ✓ получено'], 'a typed row reads who, how much, when, in boxes; a row from history the same, behind «≈» — and both end in the same «✓ получено»');
  same([await csRow(pg, 'team', 'g'), await csRow(pg, 'other', 'h|fixed|tool s|2026-10'), await csRow(pg, 'other', 'u')],
    ['cs-done | line-through | no tick | Person G | 1,000 | GBP | 7 окт | Wise | отмечено · ждёт выписку | оплачено ✓', 'cs-hist cs-done | line-through | no tick | Tool S | 120 | GBP | 3 окт | Wise |  | по выписке 3 окт', 'typed | none | on | Something | 300 | GBP |  | Wise | без даты — в расчёт по дням не идёт | ✓ оплачено'],
    'what is done is struck through, in its place, and not typed into: a hand mark keeps its toggle, a row a statement closed says so; a row without a date says it is in no day');
  const look2 = await pg.evaluate(() => { const ink = (s) => getComputedStyle(document.querySelector(s)).color; const b = (s) => { const c = getComputedStyle(document.querySelector(s)); return c.borderTopColor + ' ' + c.backgroundColor; };
    return { typed: ink('#cs-sec-inflows tr[data-cs-id="c"] [data-cs-f="amt"]'), hist: ink('#cs-sec-inflows tr.cs-hist [data-cs-f="amt"]'), muted: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(), boxT: b('#cs-sec-inflows tr[data-cs-id="c"] [data-cs-f="amt"]'), boxH: b('#cs-sec-inflows tr.cs-hist [data-cs-f="amt"]') }; });
  ok(look2.typed === 'rgb(22, 22, 19)' && look2.hist === 'rgb(107, 103, 92)' && look2.muted === '#6b675c' && /rgba\(0, 0, 0, 0\) rgba\(0, 0, 0, 0\)/.test(look2.boxH) && !/rgba\(0, 0, 0, 0\)/.test(look2.boxT), 'what the page filled in by itself is lighter than what a person typed: muted ink and no box, against full ink in a white box', look2);
  same([S.fig('mon.inflows.exp'), 'mon.inflows.done' in S.live, S.fig('mon.team.exp'), S.fig('mon.team.done'), S.fig('mon.other.exp'), S.fig('mon.other.done'), await text(pg, '#cs-sec-inflows [data-cs-tot]'), await text(pg, '#cs-sec-team [data-cs-tot]'), await text(pg, '#cs-sec-taxes [data-cs-tot]')], [10400, false, 7000, 1000, 420, 120, '£10,400', '£7,000 · из них оплачено £1,000', '—'], 'each list\'s heading carries the month\'s total and how much of it is done');
  const wise = S.M.items.filter((it) => it.ym === '2026-10' && it.bank === 'Wise');
  same(await pg.$$eval('#cs-cov .cs-bank', (l) => l.map((c) => [c.dataset.csBank, ...[...c.querySelectorAll('.cs-ln, .cs-gap')].map((x) => x.textContent.replace(/\s+/g, ' ').trim())].join(' / '))),
    [`Wise / Поступления${fmtP(sum(wise.filter((it) => it.dir > 0).map((it) => it.exp)))} / Платежи${fmtP(sum(wise.filter((it) => it.dir < 0).map((it) => it.exp)))} · оплачено £1,120 / Ещё платить≈£6,000 / Сейчас£9,000 / К концу месяца£13,400`],
    '«Покрытие по банкам» is the month\'s: through Wise £10,400 expected in and £7,420 out, £1,120 of it done; ≈£6,000 by history still to pay on a day (the row without a date is in no day); £9,000 now, £13,400 at the month\'s end');
  same([await puts('cash', 0), await puts('led', 0)], [0, 0], 'opening the month wrote nothing');
  await calm(pg, 'October', 'cash');

  // ---- a past month: its own page, read only where it is done
  same([await toMonth(pg, '2026-09'), await listed(pg, 'team'), await csRow(pg, 'team', 'h|cogs|person b|2026-09'), await text(pg, '#cs-month .cs-note')], [true, ['h|cogs|person b|2026-09'], 'cs-hist cs-done | line-through | no tick | Person B | 6,000 | GBP | 20 сен | Wise |  | по выписке 20 сен', 'месяц прошёл'], 'a step back is September, a page of its own: what was paid in it, struck through');
  await pg.click('#cs-month [data-cs-mon="now"]');
  same(await monthAt(pg), '2026-10', '«К текущему месяцу» comes back');

  // ---- November is already filled when it is first opened
  await toMonth(pg, '2026-11');
  S = await holds(pg, 'November, first opened', 'cash');
  same([await listed(pg, 'inflows'), await listed(pg, 'team'), await listed(pg, 'other'), await pg.$$eval('#cs-plan tr[data-cs-id]', (l) => l.every((tr) => tr.classList.contains('cs-hist') && tr.querySelector('[data-cs-ap]').textContent === '≈')), LISTS.flatMap((k) => S.P[k]).length, await puts('cash', 0)],
    [['h|rev|client a|2026-11'], ['h|cogs|person b|2026-11'], ['h|fixed|tool s|2026-11'], true, 3, 0], 'November is filled from history the first time it is opened — Client A, Person B, Tool S, all three behind «≈» — and nothing was written to put them there');
  same([await csRow(pg, 'inflows', 'h|rev|client a|2026-11'), S.fig('mon.inflows.exp'), S.fig('mon.team.exp'), S.fig('mon.other.exp'), await text(pg, '#cs-month .cs-note')], ['cs-hist | none | on | Client A | ≈8000 | GBP | 2026-11-28 | Wise |  | ✓ получено', 8000, 6000, 120, 'впереди'], '… with the usual sums on the usual days');
  await calm(pg, 'November', 'cash');

  // ---- a history row is edited in place: its amount typed makes it the founder's own
  const occ = 'h|rev|client a|2026-11';
  const in0 = S.fig('in');
  await pg.fill(box('inflows', occ, 'amt'), '7500');
  S = await holds(pg, 'November\'s Client A typed as £7,500', 'cash');
  let made = S.P.inflows.filter((r) => r.sk === 'rev|client a');
  same([made.length, made[0].id, made[0].cyc, made[0].src, made[0].sure, made[0].amt, made[0].cur, made[0].bank, made[0].date, made[0].name, made[0].on, made[0].m.by, typeof made[0].c0], [1, occ, '2026-11', 'hist', true, 7500, 'GBP', 'Wise', '2026-11-28', 'Client A', true, 'Mika', 'number'],
    'an amount typed over November\'s Client A writes exactly one row, under the id the month already had — h|rev|client a|2026-11 — confirmed, with the typed amount');
  same([S.M.items.filter((it) => it.sk === 'rev|client a' && it.ym === '2026-11').map((it) => [it.id, it.src, it.kind, it.cash].join(' ')), S.fig('mon.inflows.exp'), S.fig('in'), await csRow(pg, 'inflows', occ)], [[occ + ' row typed 7500'], 7500, in0 - 500, 'typed | none | on | Client A | 7500 | GBP | 2026-11-28 | Wise |  | ✓ получено'],
    '… the month still has one Client A, now typed: full ink, no «≈», «✓ получено»; the total and the six figures followed the keystroke');
  await leave(pg);
  // … its date alone moves it and leaves it a forecast
  const pb = 'h|cogs|person b|2026-11';
  await pg.fill(box('team', pb, 'date'), '2026-11-25');
  await leave(pg);
  S = await holds(pg, 'November\'s Person B moved to the 25th', 'cash');
  made = stored(S, pb);
  same([made.id, made.sure, made.amt, made.date, made.src, made.cyc, item(S.M, pb).kind, item(S.M, pb).day, await csRow(pg, 'team', pb)], [pb, false, 6000, '2026-11-25', 'hist', '2026-11', 'hist', '2026-11-25', 'cs-hist | none | on | Person B | ≈6000 | GBP | 2026-11-25 | Wise |  | ✓ оплачено'],
    'a new date on November\'s Person B writes the month down with its usual £6,000, not confirmed: it is still history, on the 25th');
  // … unticking it stores «not this month», for that month only
  const tool = 'h|fixed|tool s|2026-11';
  const out0 = S.fig('out');
  await pg.setChecked(box('other', tool, 'on'), false);
  S = await holds(pg, 'November\'s Tool S unticked', 'cash');
  made = stored(S, tool);
  same([made.on, typeof made.offAt, made.sure, made.amt, made.cyc, LISTS.flatMap((k) => S.P[k]).filter((r) => r.sk === 'fixed|tool s').length, 'mon.other.exp' in S.live, await text(pg, '#cs-sec-other [data-cs-tot]'), close(S.fig('out'), out0 - 120), await csRow(pg, 'other', tool), await toastText(pg)],
    [false, 'number', false, 120, '2026-11', 1, false, '—', true, 'cs-hist cs-off | none | off | Tool S | ≈120 | GBP | 2026-11-03 | Wise |  | ', 'Tool S: в этом месяце не жду'],
    'the tick taken off November\'s Tool S stores that one month switched off: the list\'s total and «Уйдёт» lose its £120');
  await toMonth(pg, '2026-12');
  S = await holds(pg, 'December', 'cash');
  same([await csRow(pg, 'other', 'h|fixed|tool s|2026-12'), S.fig('mon.other.exp'), item(S.M, 'h|fixed|tool s|2026-12').state], ['cs-hist | none | on | Tool S | ≈120 | GBP | 2026-12-03 | Wise |  | ✓ оплачено', 120, 'due'], '… and December\'s Tool S is expected as before');
  await toMonth(pg, '2026-11');
  await pg.setChecked(box('other', tool, 'on'), true);
  S = await holds(pg, 'ticked again', 'cash');
  same([stored(S, tool).on, 'offAt' in stored(S, tool), S.fig('mon.other.exp'), close(S.fig('out'), out0)], [true, false, 120, true], 'ticked again, it is back in the month and in the total');
  // … «Сумма верная», under the row's «ещё», confirms it as it stands
  await toMonth(pg, '2026-10');
  const before = [S.fig('in'), S.M.END];
  same(await pg.$$eval(cs('inflows', 'h|rev|client a|2026-10') + ' button', (l) => l.map((b) => b.textContent.trim())), ['✓ получено', 'ещё'], 'a row from history offers two things to press, as a typed row does: its mark and «ещё»');
  await pg.click(cs('inflows', 'h|rev|client a|2026-10') + ' [data-ed-open]');
  same(await texts(pg, '#cs-sec-inflows ' + K('row') + '.ed-foot button'), ['Получено', 'Сумма верная', 'В этом месяце не будет', 'Больше не ждём', 'Закрыть', 'Сохранить'], '«ещё» opens the row\'s card under it: the mark again, then what only a forecast can be told — «Сумма верная», «В этом месяце не будет», «Больше не ждём»');
  await pg.click('#cs-sec-inflows ' + K('row') + '[data-ed-do="sure"]');
  S = await holds(pg, '«Сумма верная» on October\'s Client A', 'cash');
  same([stored(S, 'h|rev|client a|2026-10').sure, stored(S, 'h|rev|client a|2026-10').amt, item(S.M, 'h|rev|client a|2026-10').kind, S.fig('in'), S.M.END, (await csRow(pg, 'inflows', 'h|rev|client a|2026-10')).split(' | ')[0]], [true, 8000, 'typed', ...before, 'typed'], '«Сумма верная» on October\'s Client A: a typed row from then on, and neither «Придёт» nor the balance in 60 days moved (§5.2)');

  // ---- «+ новая строка» adds to the month in view
  await toMonth(pg, '2026-11');
  const n1 = await addInList(pg, 'inflows', { name: 'Client N', amt: 1500, date: '2026-11-12' });
  S = await holds(pg, 'a row added in November', 'cash');
  same([await monthAt(pg), await listed(pg, 'inflows'), stored(S, n1).date, 'mon' in stored(S, n1), stored(S, n1).blk, stored(S, n1).sure, item(S.M, n1).ym], ['2026-11', [n1, occ], '2026-11-12', false, 'rev', true, '2026-11'], 'a row added from November\'s «+ новая строка», dated 12 Nov, lands in November, before the 28th');
  await pg.click('#cs-sec-inflows [data-ed-add]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), !!(await pg.$('#cs-sec-inflows ' + K('add'))), await pg.$eval(K('add') + '[data-ed-what][aria-pressed="true"]', (e) => e.dataset.edWhat)], [1, true, 'inflows'], '… its card opens under the list it was asked from, already set to «Поступление»');
  await fill(pg, 'add', { name: 'Client U', amt: 700 });
  await pg.click(K('add') + '[data-ed-save]');
  S = await holds(pg, 'a row without a date added in November', 'cash');
  const n2 = S.P.inflows[S.P.inflows.length - 1].id;
  same([stored(S, n2).mon, stored(S, n2).date, await listed(pg, 'inflows'), (await csRow(pg, 'inflows', n2)).split(' | ').slice(6).join(' | '), S.M.undated.ids.includes(n2), await pg.$eval(box('inflows', n2, 'date'), (e) => e.classList.contains('cs-nodate'))], ['2026-11', '', [n1, occ, n2], ' | Wise | без даты — в расчёт по дням не идёт | ✓ получено', true, true],
    'a row added there without a date is written with November as its month, stands last in November\'s list, and says it is in no day');
  await toMonth(pg, '2026-10');
  same([(await listed(pg, 'inflows')).includes(n2), (await listed(pg, 'other')).includes('u')], [false, true], '… it is not in October\'s list — October has its own undated row');
  await finish(pg);
  const again = await open('constructor, reloaded');
  await again.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(again);
  await toMonth(again, '2026-11');
  same([await listed(again, 'inflows'), (await look(again, 'cash')).P.inflows.find((r) => r.id === n2).mon], [[n1, occ, n2], '2026-11'], '… and after a reload it is still November\'s: a row without a date stays in the month it was added in');
  // A row added from one month's page with a date in another goes where its date puts it, and the page follows.
  await toMonth(again, '2026-10');
  const n3 = await addInList(again, 'team', { name: 'Person D', amt: 400, date: '2026-12-10' });
  same([await monthAt(again), (await listed(again, 'team')).includes(n3)], ['2026-12', true], 'added from October\'s page with a date in December, a row goes to December — and the page goes with it');
  // The head's own «Добавить» asks what it is first, and gives an undated row the month in view.
  await again.click('#view-cash .page-head [data-ed-add]');
  same([await again.$$eval(K('add') + '[data-ed-what][aria-pressed="true"]', (l) => l.length), !!(await again.$('#cs-plan ' + K('add')))], [0, false], '«Добавить» in the head opens the same card above the month, asking what is being added');
  await again.click(K('add') + '[data-ed-what="founder"]');
  await again.click(K('add') + '[data-ed-who="vanya"]');
  await fill(again, 'add', { amt: 900 });
  await again.click(K('add') + '[data-ed-save]');
  S = await holds(again, 'a founder\'s draw without a date', 'cash');
  const dr = S.P.other[S.P.other.length - 1];
  same([dr.name, dr.blk, dr.mon, dr.date, (await listed(again, 'other')).includes(dr.id)], ['Vanya', 'vanya', '2026-12', '', true], '… a founder\'s draw added that way without a date belongs to December, the month in view, in «Прочие расходы»');
  await finish(again);
});

await run('typing', 'a row is typed into where it stands: the box stays under the cursor, the figures follow, the row moves when the cursor leaves', async () => {
  const P0 = planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08'), row('k', 'Client K', 500, '2026-10-09')] });
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
  same([await pg.evaluate((s) => { const e = document.querySelector(s); return [e.__mark, document.activeElement === e, e.value]; }, amt), S.P.inflows[0].amt, S.fig('in'), S.fig('mon.inflows.exp'), S.P.inflows[0].m.by], [[1, true, '24000'], 24000, in0 + 21600, 8000 + 24000 + 500, 'Mika'],
    'a digit typed into an amount leaves the same box under the cursor; the row, the list\'s total and «Придёт» follow the keystroke');
  await pg.keyboard.press('Backspace');
  S = await holds(pg, 'the digit taken back', 'cash');
  same([S.P.inflows[0].amt, S.fig('in'), await text(pg, '#cs-undo span')], [2400, in0, 'Последнее изменение: Client C: правка'], '… taken back, so do they; and the strip under the tabs offers «Отменить» for the row\'s edit — one copy of the plan for the whole visit to the row');
  same(await pg.evaluate(() => window.__cash.state().inflows.length), 2, '… (nothing was added by typing)');
  // a name the table knows ties the row to that client, and the client's own forecast gives way at once
  const name = box('inflows', 'c', 'name');
  await pg.$eval(name, (e) => { e.__mark = 2; });
  await pg.fill(name, 'Client A');
  S = await holds(pg, 'renamed to a client the table knows', 'cash');
  same([S.P.inflows[0].sk, S.P.inflows[0].skBy, await pg.evaluate((s) => { const e = document.querySelector(s); return [e.__mark, document.activeElement === e]; }, name), (await csRow(pg, 'inflows', 'h|rev|client a|2026-10')).split(' | ')[4], S.fig('in'), S.fig('in.hist')], ['rev|client a', 'hand', [2, true], '≈5600', in0 - 2400, 16000 - 2400],
    'the row renamed «Client A» is tied to that client, and October\'s forecast for it shrinks to ≈5,600 in the row below while the name is still being typed');
  await pg.fill(name, 'Client C');
  S = await holds(pg, 'renamed back', 'cash');
  same(['sk' in S.P.inflows[0], (await csRow(pg, 'inflows', 'h|rev|client a|2026-10')).split(' | ')[4], S.fig('in')], [false, '≈8000', in0], '… renamed back, the tie is gone and the forecast is whole again');
  // a date in another month: the row stays put while the cursor is in it, then goes
  const date = box('inflows', 'c', 'date');
  await pg.fill(date, '2026-11-10');
  S = await holds(pg, 'a November date typed, cursor still in the row', 'cash');
  same([await listed(pg, 'inflows'), item(S.M, 'c').ym, S.fig('mon.inflows.exp'), await pg.evaluate((s) => document.activeElement === document.querySelector(s), date)], [['c', 'k', 'h|rev|client a|2026-10'], '2026-11', 8500, true], 'a date in November typed into an October row: October\'s total lets go of it at once, but the row stays under the cursor');
  await leave(pg);
  same([await listed(pg, 'inflows'), await toastText(pg), await monthAt(pg)], [['k', 'h|rev|client a|2026-10'], '«Client C» теперь в плане на ноябрь 2026 — по дате', '2026-10'], '… when the cursor leaves, the row goes to November and the page says where it went');
  await toMonth(pg, '2026-11');
  same(await listed(pg, 'inflows'), ['c', 'h|rev|client a|2026-11'], '… and there it is, on the 10th, before Client A');
  // within a month a new date re-sorts on leaving, and a tab to the next row keeps the cursor there
  await toMonth(pg, '2026-10');
  await pg.fill(box('inflows', 'k', 'date'), '2026-10-30');
  same(await listed(pg, 'inflows'), ['k', 'h|rev|client a|2026-10'], 'a later date within the month does not pull the row from under the cursor either');
  await pg.focus(box('inflows', 'h|rev|client a|2026-10', 'amt'));
  await sleep(80);
  same([await listed(pg, 'inflows'), await pg.evaluate(() => { const a = document.activeElement; return [a.dataset.csF, a.closest('tr').dataset.csId]; })], [['h|rev|client a|2026-10', 'k'], ['amt', 'h|rev|client a|2026-10']], '… on leaving it is sorted after the 28th, and the cursor is in the box it moved to');
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
  await pg.click(cs('inflows', 'k') + ' [data-ed-open]');
  same([await pg.$$eval('[data-ed-card]', (l) => l.length), await pg.$eval(cs('inflows', 'k') + ' + tr', (e) => [e.className, !!e.querySelector('[data-ed-card="row"]')].join(' ')), await texts(pg, K('row') + '.ed-foot button')], [1, 'cs-edrow true', ['Получено', 'Удалить', 'Закрыть', 'Сохранить']], '«ещё» opens the row\'s card right under it: where it came from, «+ VAT», «каждый месяц», «Удалить»');
  await calm(pg, 'with a row\'s card open', 'cash');
  await pg.setChecked(K('row') + '[data-ed-f="vat"]', true);
  await pg.click(K('row') + '[data-ed-save]');
  S = await holds(pg, '«+ VAT 20%» from the card', 'cash');
  same([S.P.inflows.find((r) => r.id === 'k').vat, await text(pg, cs('inflows', 'k') + ' [data-cs-gbp]'), await pg.$('[data-ed-card]')], [true, '£444', null], '«+ VAT 20%» ticked there and saved: $600 is £444, and the card is closed');
  await pg.click(cs('inflows', 'k') + ' [data-ed-open]');
  await pg.focus(box('inflows', 'h|rev|client a|2026-10', 'amt'));
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

  // The VAT the page works out has no row until it is typed over; then it has one, with the quarter's key.
  const pv = await scene('typing over VAT', ledA({ vat: true }), planA(), { H: 60 });
  await goCash(pv);
  await toMonth(pv, '2026-11');
  same(await csRow(pv, 'taxes', 'v|2026Q3'), 'cs-hist | none | on | VAT за Q3 2026 | ≈4000 | GBP | 2026-11-07 | Wise | по выручке | ✓ оплачено', 'November\'s «Налоги» holds VAT for Q3 by the rule: ≈4,000 on the 7th, «по выручке»');
  await pv.click(box('taxes', 'v|2026Q3', 'amt'));
  await pv.keyboard.press('End');
  await pv.keyboard.press('Backspace');
  await pv.keyboard.type('5');
  S = await holds(pv, 'the VAT item typed over', 'cash');
  const vat = S.P.taxes.filter((r) => r.sk === 'tax|vat|2026Q3');
  same([S.P.taxes.length, vat.length, vat[0].amt, vat[0].date, item(S.M, 'v|2026Q3'), await listed(pv, 'taxes'), await pv.evaluate(() => { const a = document.activeElement; return [a.dataset.csF, a.value, a.closest('tr').dataset.csId]; })], [1, 1, 4005, '2026-11-07', null, [vat[0].id], ['amt', '4005', vat[0].id]],
    'two keystrokes in its amount write one taxes row with sk tax|vat|2026Q3 in the computed item\'s place, and the cursor is still in the box');
  await finish(pv);

  // A row made «каждый месяц» stands in every month after its own, exact and in full ink; and a typed row nobody
  // closed stays in the month of its date, which the running month points back to.
  const ser = { 'm|studio rent': { made: true, amt: 900, cur: 'GBP', day: 15, bank: 'Wise', blk: 'other', name: 'Studio rent', by: 'Mika', at: C0 } };
  const pm = await scene('monthly rows', ledA(), planA({ inflows: [row('late', 'Client E', 4000, '2026-09-22')], other: [row('rent', 'Studio rent', 900, '2026-10-15', { sk: 'm|studio rent' })], ser }), { H: 60 });
  await goCash(pm);
  same([plain(await text(pm, '#cs-back')), await listed(pm, 'inflows')], ['В прошлых месяцах не закрыто: 1 строка на £4,000. Сентябрь 2026', ['h|rev|client a|2026-10']], 'an invoice typed for 22 Sep and never paid is September\'s row; October says that an earlier month still holds one, and how much');
  await pm.click('#cs-back [data-cs-mon]');
  same([await monthAt(pm), await csRow(pm, 'inflows', 'late'), await pm.$('#cs-back')], ['2026-09', 'typed | none | on | Client E | 4000 | GBP | 2026-09-22 | Wise | просрочено 13 дн. | ✓ получено', null], '… and its button opens September, where the row says how late it is');
  await toMonth(pm, '2026-11');
  const rentNov = 'h|m|studio rent|2026-11';
  same(await csRow(pm, 'other', rentNov), 'typed | none | on | Studio rent | 900 | GBP | 2026-11-15 | Wise |  | ✓ оплачено', 'November holds the month of a «каждый месяц» row: exact, in full ink, its name not typed over');
  await pm.fill(box('other', rentNov, 'amt'), '950');
  S = await holds(pm, 'one month of a monthly row typed over', 'cash');
  same([S.P.other.filter((r) => r.sk === 'm|studio rent').map((r) => [r.id, r.amt, r.sure, r.date].join(' ')), S.P.ser['m|studio rent'].amt, item(S.M, 'h|m|studio rent|2026-12').cash], [['rent 900 true 2026-10-15', rentNov + ' 950 true 2026-11-15'], 900, -900], '£950 typed into November\'s writes that one month down under its own id; the series and December keep £900');
  await finish(pm);

  // The average of what is not regular is one muted line under its list.
  const pe = await scene('average line', ledE(), plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')] }), { H: 60 });
  await goCash(pe);
  S = await holds(pe, 'one-off clients', 'cash');
  same([await text(pe, '#cs-sec-inflows [data-cs-avg]'), S.fig('mon.inflows.avg'), await text(pe, '#cs-sec-team [data-cs-avg]'), await listed(pe, 'inflows')], ['в среднем ещё ≈£10,000 — разовые клиенты', 10000, '', []], 'under «Поступления»: «в среднем ещё ≈£10,000 — разовые клиенты» — the month\'s average of clients who are nobody\'s habit; no line where there is no average');
  await toMonth(pe, '2026-11');
  const nid = await addInList(pe, 'inflows', { name: 'Client N', amt: 4000, date: '2026-11-12' });
  S = await holds(pe, 'a typed one-off in November', 'cash');
  same([await text(pe, '#cs-sec-inflows [data-cs-avg]'), S.fig('mon.inflows.exp'), !!nid], ['в среднем ещё ≈£6,000 — разовые клиенты', 4000, true], 'a typed one-off of £4,000 in November is taken out of November\'s average, not added to it: ≈£6,000 left');
  await finish(pe);
});

await run('mark', '«Оплачено» in «Касса» is a founder\'s word: it moves the money from the plan into «сейчас» and changes no balance (test 4)', async () => {
  const pg = await scene('mark', ledA(), planA());
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
  same([S.M.END, plain(S.live.now.t), JSON.stringify(S.P.banks) === banks, r.paid.on, r.paid.by, typeof r.paid.at, 'paidAdj' in r, S.fig('acct.Wise|GBP'), await text(pg, '#cs-accts [data-cs-acct="Wise|GBP"] .cs-act')], [10880, '≈£9,000', true, T, 'Mika', 'number', false, 9000, '£10,120 на 30 сен · вручную · Mika'],
    '… END unchanged, «≈» on NOW, plan.banks deep-equal (§5.8): the mark is {on: today, at, by} on the row, the typed balance still reads £10,120 as of 30 Sep, and only the reckoning beside it is 1,000 lower');
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

await run('days', '«По дням»: the engine\'s days — calendar, «Итог», advice, the statement — with done rows under their days', async () => {
  // Fixture A with a payment the founders typed for the 12th and an invoice for the 30th: after Person B's payout on
  // the 20th — history — the balance is 5,000 short until Client A pays on the 28th.
  const P0 = planA({ ...CAUTIOUS, inflows: [row('ci', 'Client I', 3000, '2026-10-30')], team: [row('t1', 'Person T', 9000, '2026-10-12')], other: [row('u', 'Something', 300, '', { mon: '2026-10' })] });
  const pg = await scene('days', ledA(), P0);
  await goCash(pg, 'days');
  let S = await holds(pg, 'a minus on the 20th', 'cash');
  shows(S, { now: 10000, low: -5000, lowday: '2026-10-20', say: 'minus' }, 'the fixture');
  same([plain(await text(pg, '#cs-answer .cs-hl')), plain(await pg.$eval('#cs-answer .cs-sub', (e) => e.textContent)), plain(await pg.$eval('#cs-answer .cs-sub.cs-warn', (e) => e.textContent))], ['С вт 20 окт по вт 27 окт не хватает до £5,000.', 'В плюс выходим ср 28 окт.', '1 строка без даты в расчёт по дням не идёт: поступления £0, платежи £300. Даты можно поставить в выписке внизу.'],
    '«Итог»: from when to when the money is short and by how much, when it comes back, and what has no date');
  // the calendar
  const calOf = () => pg.$$eval('#cs-cal [data-cs-cal]', (l) => Object.fromEntries(l.map((b) => [b.dataset.csCal, [b.className.replace(/cs-d |cs-/g, '').trim(), b.querySelector('.cs-st').textContent, b.querySelector('.cs-mvs') ? b.querySelector('.cs-mvs').textContent.replace(/\s+/g, ' ').trim() : '', b.querySelector('.cs-bal').textContent].join(' | ')])));
  let cal = await calOf();
  same([Object.keys(cal).length, Object.keys(cal)[0], Object.keys(cal).pop(), cal[T], cal['2026-10-12'], cal['2026-10-20'], cal['2026-10-28'], cal['2026-10-30']], [31, T, '2026-11-05', 'ok today |  |  | £10,000', 'low | мало | −£9k | £1,000', 'neg | минус | ≈−£6k | −£5,000', 'low | мало | ≈+£8k | £3,000', 'ok |  | +£3k | £6,000'],
    'the calendar is the 31 days from today: each day its balance at the day\'s end; a word only where something is wrong — «мало» under the cushion, «минус» under zero; a day whose money is all history says so behind «≈»');
  ok(Object.entries(cal).every(([d, t]) => { const D = S.M.days.find((x) => x.d === d); return t.endsWith('| ' + (D.e < 0 ? '−' : '') + '£' + Math.abs(Math.round(D.e)).toLocaleString('en-GB')); }), '… every day\'s balance is the model\'s');
  // the statement by day
  same([await dayLine(pg, '2026-10-12'), await dayLine(pg, '2026-10-20'), await dayLine(pg, '2026-10-28'), await pg.$$eval('#cs-stmt tr.cs-open', (l) => l.map((e) => e.dataset.csRow))], [['пн 12 окт', '£10,000', '—', '−£9,000', '£1,000мало', '1'], ['вт 20 окт', '£1,000', '—', '−£6,000', '−£5,000не хватает £5,000', '1'], ['ср 28 окт', '−£5,000', '+£8,000', '—', '£3,000мало', '1'], ['2026-10-20']],
    '«Выписка по дням»: было, пришло, ушло, стало, строк — and the day in minus that has rows is open');
  same(await dayRows(pg, '2026-10-20'), ['h|cogs|person b|2026-10 | cs-hist | none | ✓ оплачено|false | date | no фикс |  | ≈−£6,000'], 'a row from history under its day is muted, behind «≈», carries the same «✓ оплачено» as a typed row and a date, and has no «фикс»: the advice does not move it anyway');
  await openDay(pg, '2026-10-12');
  same(await dayRows(pg, '2026-10-12'), ['t1 | typed | none | ✓ оплачено|false | date | фикс |  | −£9,000'], 'a typed row: «✓ оплачено», its date to move, «фикс»');
  // the chart is the one «Сегодня» draws: hollow where history is
  same(await pg.$eval('#cs-chart', (e) => [e.querySelectorAll('rect.hit').length, e.querySelectorAll('rect[fill="var(--panel)"]').length, e.querySelectorAll('rect[fill="var(--s2)"]').length, e.querySelectorAll('path').length]), [31, 2, 1, 2], 'the chart: 31 days; hollow bars for Person B and Client A, which are history (Tool S\'s £120 is too thin to draw), a filled one for the typed payment; the expected and the cautious line');
  // done rows under their days: the subscription the statement of 3 Oct closed stands under 3 Oct, a day gone by
  same([plain(await text(pg, '#cs-stmt tr[data-cs-row="__past"]')), await pg.$('#cs-row-2026-10-03')], ['Уже прошло, за 31 день — закрыто · 3 строки', null], 'days gone by that hold rows already closed are one folded line above today, a month back');
  await pg.click('#cs-stmt tr[data-cs-row="__past"] td');
  await openDay(pg, '2026-10-03');
  same([await pg.$$eval('#cs-stmt tr.cs-out', (l) => l.map((e) => e.dataset.csRow)), await dayLine(pg, '2026-10-03'), await dayRows(pg, '2026-10-03')], [['2026-09-20', '2026-09-28', '2026-10-03'], ['сб 3 окт', '—', '—', '—', '—', 'оплачено 1'], ['h|fixed|tool s|2026-10 | cs-ispaid cs-done | line-through | по выписке 3 окт | no date | no фикс |  | −£120']],
    '… unfolded: 20 Sep, 28 Sep, 3 Oct — each row under the date of the ledger row that closed it, struck through, with no figures for a day nobody kept the balance of');
  // a late row marked paid lands under its own date, and the line it lands on is opened
  await pg.click('#cs-stmt tr[data-cs-row="__past"] td');
  await pg.click('#view-cash [data-cs-view="plan"]');
  const lateId = await addInList(pg, 'other', { name: 'Courier', amt: 240, date: '2026-10-04' });
  await pg.click('#view-cash [data-cs-view="days"]');
  await openDay(pg, T);
  same((await dayRows(pg, T)).filter((x) => x.startsWith(lateId)), [`${lateId} | typed | none | ✓ оплачено|false | date | фикс |  | −£240`], 'a payment dated two days back, with statements through the 5th, is read under today');
  await pg.click(`#cs-stmt li[data-cs-li="${lateId}"] [data-ed-do="paid"]`);
  // Statements already reach the 6th? No — Wise reaches the 5th, so today's mark stands; the row goes under its own date, the 4th.
  S = await holds(pg, 'the late payment marked', 'cash');
  same([item(S.M, lateId).done.by, item(S.M, lateId).done.day, await pg.$eval('#cs-stmt tr[data-cs-row="__past"]', (e) => e.getAttribute('aria-expanded')), await dayRows(pg, '2026-10-04')], ['mark', '2026-10-04', 'true', [`${lateId} | cs-ispaid cs-done | line-through | оплачено ✓|true | no date | no фикс | отмечено · ждёт выписку | −£240`]],
    '«✓ оплачено» on it: it stands under its own date, 4 Oct — and the days gone by unfold and that day opens, so the row stays in front of whoever pressed');
  await pg.click(`#cs-stmt li[data-cs-li="${lateId}"] [data-ed-do="unpaid"]`);
  same((await dayRows(pg, T)).filter((x) => x.startsWith(lateId)).length, 1, '… pressed again, it is back under today');
  await pg.click(`#cs-stmt li[data-cs-li="${lateId}"] [data-ed-do="paid"]`);
  // the groups at the foot
  same(await pg.$$eval('#cs-stmt tr.cs-und, #cs-stmt tr.cs-pgrp', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ').trim())), ['Без даты — не в расчёте · 1 строка', 'Оплачено / получено · 1 строка'], 'at the foot: the row without a date, and «Оплачено / получено» — every row of the plan that is done');
  await pg.click('#cs-stmt tr[data-cs-row="__undated"] td');
  await pg.fill('#cs-stmt li[data-cs-li="u"] [data-cs-ldate]', '2026-10-14');
  S = await holds(pg, 'a date for the undated row, from the statement', 'cash');
  same([stored(S, 'u').date, 'mon' in stored(S, 'u'), (await dayLine(pg, '2026-10-14')).slice(3), await pg.$('#cs-stmt tr.cs-und'), await toastText(pg)], ['2026-10-14', false, ['−£300', '£460мало', '1'], null, 'Перенесено на ср 14 окт'], 'a date typed there puts the row into its day (£10,000 less the courier already marked, Person T and its own £300); the group is gone');
  await pg.click('#cs-stmt tr[data-cs-row="2026-10-14"] + tr.cs-items [data-cs-shift="1"]');
  same([(await look(pg, 'cash')).P.other.find((r) => r.id === 'u').date, await text(pg, '#cs-undo span')], ['2026-10-15', 'Последнее изменение: Something: ср 14 окт → чт 15 окт'], '› moves it a day later, and the strip says what changed last');
  await pg.click('#cs-undo [data-cs-undo]');
  await pg.click('#cs-undo [data-cs-undo]');
  same([(await look(pg, 'cash')).P.other.find((r) => r.id === 'u').date, (await look(pg, 'cash')).P.other.find((r) => r.id === 'u').mon], ['', '2026-10'], '«Отменить», twice: the row has no date again and is October\'s');

  // ---- advice and автоплан move what was typed, never what history expects
  const P1 = (await look(pg, 'cash')).P;
  const histDates = (M) => M.items.filter((it) => it.kind === 'hist').map((it) => [it.id, it.date, it.day].join(' '));
  S = await holds(pg, 'before the advice', 'cash');
  const before = { P: canon(P1), hist: histDates(S.M), low: S.fig('low') };
  const advice = await pg.$$eval('#cs-answer .cs-sugg li', (l) => l.map((e) => [e.dataset.csType, e.querySelector('b').textContent, e.querySelector('button') ? e.querySelector('button').textContent : ''].join(' | ')));
  same([await text(pg, '#cs-answer .cs-h3'), advice], ['Как закрыть', ['shift | Person T | Применить', 'pull | Client I | Поставить дату']], 'the advice: move Person T, the typed payment; bring Client I\'s typed invoice forward. Person B\'s payout of the 20th, which is what opens the minus, is history and is not offered');
  same(await texts(pg, '#cs-answer .cs-auto ol li'), ['Person T £9,000: пн 12 окт → ср 28 окт'], 'автоплан: Person T to the 28th, the day Client A pays');
  await pg.click('#cs-answer [data-cs-auto]');
  S = await holds(pg, 'автоплан applied', 'cash');
  shows(S, { low: 2760, say: 'low' }, 'applied: the minus is closed');
  same([S.P.team[0].date, LISTS.flatMap((k) => S.P[k]).filter((r) => String(r.id).startsWith('h|') || r.src === 'hist').length, histDates(S.M), LISTS.flatMap((k) => S.P[k]).length, await toastText(pg)], ['2026-10-28', 0, before.hist, LISTS.flatMap((k) => P1[k]).length, 'Автоплан применён — можно отменить'],
    '… one typed row moved; no history row was moved or written down, and every forecast stands on the day it stood on');
  // undo restores — the page's plan, and the one the server holds
  same([await saved(pg), store.cash.doc.team[0].date], [true, '2026-10-28'], '… and it is saved');
  await pg.click('#toastUndo');
  S = await holds(pg, 'автоплан undone', 'cash');
  same([canon(S.P) === before.P, S.fig('low'), await toastText(pg)], [true, before.low, 'Отменено: автоплан: сдвинуто 1 платёж'], '«Отменить» restores the plan to the letter, and the figures with it');
  same([await saved(pg), store.cash.doc.team[0].date, store.led.puts], [true, '2026-10-12', 0], '… and the plan as it was is what the server holds again');
  // one piece of advice, and «фикс»
  await pg.click('#cs-answer .cs-sugg li[data-cs-type="pull"] button');
  S = await holds(pg, 'Client I brought forward', 'cash');
  same([S.P.inflows[0].date, S.fig('low'), histDates(S.M)], ['2026-10-20', -2240, before.hist], '«Поставить дату» on Client I: its date is the first day short, the minus is 2,240 instead of 5,240 — and still no forecast moved');
  await pg.click('#cs-undo [data-cs-undo]');
  await openDay(pg, '2026-10-12');
  await pg.click('#cs-stmt li[data-cs-li="t1"] [data-cs-fix]');
  S = await holds(pg, '«фикс» on Person T', 'cash');
  same([S.P.team[0].fixed, await pg.$$eval('#cs-answer .cs-sugg li', (l) => l.map((e) => e.dataset.csType)), await pg.$$eval('#cs-answer [data-cs-auto]', (l) => l.length), /Сдвигом платежей это не закрыть/.test(await text(pg, '#cs-answer .cs-auto')), await pg.$eval('#cs-stmt li[data-cs-li="t1"] [data-cs-fix]', (e) => e.getAttribute('aria-pressed'))], [true, ['pull'], 0, true, 'true'],
    '«фикс» on Person T: nothing offers to move it any more, and автоплан says it cannot close the minus by moving payments');
  await pg.click('#cs-stmt li[data-cs-li="t1"] [data-cs-fix]');
  same('fixed' in (await look(pg, 'cash')).P.team[0], false, '… taken off again');
  // a day picked in the calendar opens in the statement; the keyboard opens a line too
  await pg.click('#cs-cal [data-cs-cal="2026-10-28"]');
  same(await pg.evaluate(() => [document.querySelector('#cs-cal [data-cs-cal="2026-10-28"]').classList.contains('cs-sel'), document.querySelector('#cs-row-2026-10-28').className.replace(/\s+/g, ' ').trim()]), [true, 'cs-day cs-low cs-open cs-sel'], 'a day pressed in the calendar is picked, and opened in the statement');
  await pg.focus('#cs-row-2026-10-30');
  await pg.keyboard.press('Enter');
  same(await pg.$eval('#cs-row-2026-10-30', (e) => e.getAttribute('aria-expanded')), 'true', 'Enter on a line of the statement opens it');
  await pg.focus('#cs-row-2026-10-30');
  await pg.keyboard.press(' ');
  same(await pg.$eval('#cs-row-2026-10-30', (e) => e.getAttribute('aria-expanded')), 'false', 'Space closes it');
  await calm(pg, '«По дням», with a minus, advice and days open', 'cash');
  await finish(pg);

  // ---- «Как подстраховаться», one bank alone, and a transfer between accounts
  const P2 = planA({ banks: [bal('Barclays', 'GBP', 500, '2026-09-30')], team: [row('p', 'Person P', 800, '2026-10-10')], other: [row('rent', 'Rent', 900, '2026-10-15', { bank: 'Barclays' })] });
  const p2 = await scene('days, close to the cushion', ledA(), P2);
  await goCash(p2, 'days');
  S = await holds(p2, 'under the cushion, not under zero', 'cash');
  shows(S, { low: 2800, lowday: '2026-10-20', say: 'low' }, 'the lowest point is 2,800: over zero, under the cushion');
  same([await text(p2, '#cs-answer .cs-h3'), plain(await text(p2, '#cs-answer .cs-hl')), plain(await p2.$eval('#cs-answer .cs-sub', (e) => e.textContent)), await p2.$$eval('#cs-answer .cs-sugg li', (l) => l.map((e) => [e.dataset.csType, e.querySelector('b').textContent, e.querySelector('.cs-eff').textContent].join(' | ')))],
    ['Как подстраховаться', 'Хватает, но впритык: вт 20 окт останется £2,800 — меньше запаса £5,000.', 'Но в минус уходят отдельные счета (Barclays) — нужен перевод между счетами, см. ниже.', ['shift | Rent | до запаса не хватит £1,300 вместо £2,200', 'shift | Person P | до запаса не хватит £1,400 вместо £2,200', 'transfer | £400 | минус на Barclays закрыт · общий остаток не меняется']],
    'the same sentence as on «Сегодня», and the advice is measured against the cushion: «Как подстраховаться»; a bank that goes short by itself gets a transfer');
  same(plain(await p2.$eval('#cs-answer .cs-sugg li[data-cs-type="transfer"]', (e) => e.firstElementChild.nextElementSibling.firstElementChild.textContent)), 'Перевести £400 с Wise на Barclays до чт 15 окт', '… £400 from Wise to Barclays by the 15th');
  same(await p2.$$eval('#cs-covd .cs-bank', (l) => l.map((c) => [c.dataset.csBank, ...[...c.querySelectorAll('.cs-ln, .cs-gap')].map((x) => x.textContent.replace(/\s+/g, ' ').trim())].join(' / '))),
    ['Wise / Сейчас£10,000 / Придёт£8,000 / Уйдёт£6,920 / Ещё платить£800 + ≈£6,100 / Через 30 дней£11,080', 'Barclays / Сейчас£500 / Придёт— / Уйдёт£900 / Ещё платить£900 / Через 30 дней−£400 / Докинуть£400 к 15 окт'],
    '«Покрытие по банкам» on «По дням» is the same thirty days by bank: what each holds now, what passes through it — typed sums in their own currency, history as ≈£ — what it ends with, and that Barclays must be topped up by £400 by the 15th');
  await p2.click('#cs-scope [data-cs-scope="Barclays"]');
  S = await holds(p2, 'Barclays alone', 'cash');
  same([plain(await text(p2, '#cs-answer .cs-hl')), (await p2.$$eval('#cs-answer .cs-sub', (l) => l.map((e) => e.textContent))).slice(0, 2), await dayLine(p2, '2026-10-15'), await p2.$eval('#cs-cal [data-cs-cal="2026-10-15"]', (b) => b.className.replace(/cs-d |cs-/g, '').trim() + ' ' + b.querySelector('.cs-bal').textContent), await p2.$eval('#cs-chart', (e) => e.querySelectorAll('path').length)],
    ['Barclays: С чт 15 окт до конца периода не хватает до £400.', ['До конца периода из минуса не выходим — нужны новые поступления. Советы ниже считаются по всем счетам вместе.', 'Среднее по истории сюда не входит: у него нет банка.'], ['чт 15 окт', '£500', '—', '−£900', '−£400не хватает £400', '1'], 'neg −£400', 1],
    'one bank alone: its typed balance and the rows that name it, day by day — Barclays is £400 short from the 15th; one line on its chart, no cautious one');
  await p2.click('#cs-scope [data-cs-scope="__all"]');
  await finish(p2);

  // What is later than its habit is in no day: it has a group of its own at the foot, so it is not simply gone.
  const p3 = await scene('days, late', ledA({ skip: (r) => r.id === 'b5' }), planA({ inflows: [row('e', 'Client E', 4000, '2026-09-10')] }));
  await goCash(p3, 'days');
  S = await holds(p3, 'an invoice 25 days late and a payout history expected in September', 'cash');
  same([item(S.M, 'e').state + ' ' + item(S.M, 'e').step + ' «' + item(S.M, 'e').day + '»', S.M.days.some((D) => D.items.includes('e') || D.items.includes('h|cogs|person b|2026-09')), plain(await text(p3, '#cs-stmt tr[data-cs-row="__late"]'))], ['late 2 «»', false, 'Позже обычного и под вопросом — не в расчёте · 2 строки'], 'an invoice typed for 10 Sep and a payout history expected on 20 Sep are counted on no day; the statement keeps them in a group of their own');
  await p3.click('#cs-stmt tr[data-cs-row="__late"] td');
  same(await p3.$$eval('#cs-stmt tr[data-cs-row="__late"] + tr.cs-items li', (l) => l.map((li) => [li.dataset.csLi, li.className.trim() || 'typed', li.querySelector('.cs-rm').textContent, li.querySelector('.cs-am').textContent].join(' | ').replace(/ /g, ' '))), ['e | typed | просрочено 25 дн. | +£4,000', 'h|cogs|person b|2026-09 | cs-hist | ждём 15 дн. | ≈−£6,000'], '… each saying how late it is, with its date there to move');
  await p3.fill('#cs-stmt li[data-cs-li="e"] [data-cs-ldate]', '2026-10-20');
  S = await holds(p3, 'the late invoice moved to the 20th', 'cash');
  same([item(S.M, 'e').day, plain(await text(p3, '#cs-stmt tr[data-cs-row="__late"]')), (await dayLine(p3, '2026-10-20'))[2]], ['2026-10-20', 'Позже обычного и под вопросом — не в расчёте · 1 строка', '+£4,000'], 'a new date typed there brings the invoice back into its day');
  await finish(p3);
});

await run('old plan', 'the one way in for the old planner\'s plan: wrapped or bare, made version 2, never over rows without asking', async () => {
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
    [2, 4000, ['Wise 3000 true false', 'Barclays 700 true false'], false, 8, [' Wise null false 0 true cogs', ' Barclays {"on":"","legacy":true} false 0 true cogs'], '', ['', ''], 'нужен PO', false, false, 'v0'],
    'onto an empty plan a wrapped export goes straight in, as version 2: ids that last (two rows shared one), balances waiting to be confirmed, «Другой» → Barclays, the old «оплачено» tag dropped, a paid row as an old mark without its balance note, a broken date and a year 2062 as «без даты» — and the page asks for the balances before it gives a total');
  same([await toastText(pg), await out(), await pg.$eval('#cs-imp-text', (e) => e.value), await text(pg, '#cs-undo span')], ['План загружен — счетов: 2, строк: 6 (поступления 1 · команда 2 · налоги 1 · прочее 2)', '', '', 'Последнее изменение: загрузка плана из старой Кассы'], '… it says what came, clears the field, and can be undone');
  same([await saved(pg), store.cash.puts, store.cash.doc.v, '_savedAt' in store.cash.doc, store.led.puts], [true, 1, 2, false, 0], '… one save, without the artifact\'s private fields');
  same([await csRow(pg, 'team', S.P.team[1].id), (await listed(pg, 'other')).length, (await listed(pg, 'taxes')).length], ['cs-done | line-through | no tick | Person B | 3,750 | USD | 2 окт | Barclays | отмечено в старой Кассе | оплачено ✓', 3, 1], '… its rows stand in October: dated ones by their date, the ones without a date in the running month');
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
  same([S.P.v, S.P.banks.map((b) => [b.amt, b.legacy].join(' ')), S.P.team.map((r) => r.name), S.P.team.some((r) => /^r\d+$/.test(r.id)), await listed(pg, 'team')], [2, ['1000 true'], ['Person X'], false, [S.P.team[0].id, 'h|cogs|person b|2026-10']], '«Заменить» replaces it — again as version 2 — and the month shows the new rows beside what history expects');
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

await run('saving', 'the plan\'s own save: one PUT per change with the revision before it, never over somebody else, never the ledger', async () => {
  serve(ledA(), planA({ inflows: [row('c', 'Client C', 2400, '2026-10-08')] }));
  const rev0 = store.cash.rev0;
  const p1 = await open('window 1', undefined, { quiet: /409/ });
  await p1.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(p1);
  const amt = box('inflows', 'c', 'amt');
  await p1.fill(amt, '100');
  await saved(p1);
  same([store.cash.bases, store.cash.rev - rev0, store.cash.doc.inflows[0].amt], [[rev0], 1, 100], 'a change typed into a row: one PUT, with the revision the plan was read at');
  await p1.fill(amt, '200');
  await saved(p1);
  same([store.cash.bases, store.cash.doc.inflows[0].amt], [[rev0, rev0 + 1], 200], 'the next change: one more, with the revision the first save gave back');
  await p1.fill(amt, '210');
  await p1.fill(amt, '220');
  await p1.fill(amt, '230');
  await saved(p1);
  same([store.cash.bases, store.cash.doc.inflows[0].amt], [[rev0, rev0 + 1, rev0 + 2], 230], 'three quick changes wait out the half second and go as one');
  await p1.click(cs('inflows', 'c') + ' [data-ed-do="paid"]');
  await saved(p1);
  const marked = !!store.cash.doc.inflows[0].paid;
  await p1.click(cs('inflows', 'c') + ' [data-ed-do="unpaid"]');
  await saved(p1);
  await p1.setChecked(box('inflows', 'h|rev|client a|2026-10', 'on'), false);
  await saved(p1);
  same([store.cash.bases, marked, store.cash.doc.inflows.map((r) => [r.id, !!r.paid, r.on].join(' ')), store.cash.doc.v, store.cash.doc.savedBy, store.led.puts], [[rev0, rev0 + 1, rev0 + 2, rev0 + 3, rev0 + 4, rev0 + 5], true, ['c false true', 'h|rev|client a|2026-10 false false'], 2, 'Mika', 0],
    'a mark, the mark taken back, a tick: one PUT each, each on the revision before it — version 2, signed — and the ledger was not written once');
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
  same([await text(p2, '#sync'), await p2.$eval('#sync', (e) => e.className), plain(await text(p2, '#cs-stale')).slice(0, 34), store.cash.bases.slice(-1)[0], store.cash.rev - rev0, store.cash.doc.inflows[0].amt, await p2.evaluate((s) => document.activeElement === document.querySelector(s), amt)], ['касса изменилась в другом окне — обновите страницу', 'sync bad', 'Касса изменилась в другом окне. То', rev0 + 6, 7, 300, true],
    'the second window is refused (409): the pill and the tab itself say so, the first window\'s £300 stands — and the cursor is still in the box that was being typed in');
  const n = store.cash.puts;
  await p2.fill(amt, '998');
  await p2.click(cs('inflows', 'h|rev|client a|2026-10') + ' [data-ed-open]');
  await sleep(1100);
  same([store.cash.puts, store.cash.doc.inflows[0].amt, store.led.puts], [n, 300, 0], '… and it does not try again: no more PUTs from it, and none to the ledger');
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
  serve(ledA(), planA());
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
  // with no server at all the plan is kept in the browser, as version 2
  const lf = await browser.newContext({ viewport: { width: 1320, height: 900 } }).then((c) => c.newPage());
  lf.on('pageerror', (e) => errs.push(`file: PAGEERROR ${e.message}`));
  await lf.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await lf.goto('file://' + PUB + '/money/index.html#cash');
  await lf.waitForFunction(() => window.__cash && window.__cash.state());
  same([await lf.evaluate(() => window.__cash.home()), await lf.evaluate(() => window.__cash.state().banks.map((b) => b.bank + ' ' + b.cur + ' ' + b.amt)), await lf.$('#cs-accts input')], ['local', ['Wise GBP 0', 'Wise USD 0', 'Barclays GBP 0', 'Tochka RUB 0', 'Mosta USD 0'], null], 'opened as a file the page keeps the plan in the browser; a new plan names five accounts and waits for their balances');
  await lf.click('#cs-accts [data-ed-bal]');
  await lf.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '1234');
  await lf.click(K('bal') + '[data-ed-save]');
  same(await lf.evaluate(() => { const d = JSON.parse(localStorage.getItem('selfstudio-money-cash-v1')); return [d.v, d.banks[0].amt, typeof d.banks[0].asOf, 'fx' in d, 'horizon' in d]; }), [2, 1234, 'string', false, false], 'a balance typed there is kept under selfstudio-money-cash-v1 as version 2 — with its day, and with no rates or horizon of its own');
  await lf.context().close();
});

await run('kassa looks', '«Касса» on a phone and on a desk: nothing sideways, nothing shaped like a sticker', async () => {
  const led = demoLedger(T);
  // The studio's plan with a little of everything a row can be: a mark, an undated row, a dollar invoice with VAT.
  const P = demoPlan(T);
  P.inflows.push({ id: 'usd', name: 'Juniper', amt: 3000, cur: 'USD', bank: 'Wise', on: true, tag: 'нужен PO', info: false, date: '2026-10-22', c0: P.inflows[0].c0, m: { t: P.inflows[0].c0, by: 'Mika' }, sure: true, blk: 'rev', vat: true });
  P.other.push({ id: 'und', name: 'Laptop', amt: 1100, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '', mon: '2026-10', c0: P.inflows[0].c0, m: { t: P.inflows[0].c0, by: 'Mika' }, sure: true, blk: 'other' });
  P.taxes[0].paid = { on: T, at: Date.parse('2026-10-06T08:00:00Z'), by: 'Vanya' };
  for (const w of [375, 390]) {
    serve(led, P);
    const ph = await open('kassa phone ' + w, undefined, { w, h: 812 });
    await ph.waitForSelector('#view-today [data-live="verdict"]');
    await goCash(ph);
    await holds(ph, `${w}px, «План»`, 'cash');
    const wide = () => ph.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth]);
    let r = await ph.evaluate(() => {
      const rect = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const k = [...document.querySelectorAll('#view-cash .kpi')].map((e) => e.getBoundingClientRect());
      const rows = [...document.querySelectorAll('#cs-plan tr[data-cs-id]')].map((tr) => { const n = (tr.querySelector('[data-cs-f="name"]') || tr.querySelector('.cs-nt')).getBoundingClientRect(); const a = (tr.querySelector('[data-cs-f="amt"]') || tr.querySelector('.cs-at')).getBoundingClientRect(); return [Math.round(n.left), Math.round(n.width), Math.round(a.right)]; });
      const sw = [...document.querySelectorAll('#cs-month button, #cs-mname')].map((e) => e.getBoundingClientRect());
      // Everything a row holds — its tick, name, amount, currency, date, bank, its mark and «ещё» — and where it ends.
      const parts = [...document.querySelectorAll('#cs-plan tr[data-cs-id]')].map((tr) => { const q = [...tr.querySelectorAll('input, select, button, .cs-nt, .cs-at, .cs-ct, .cs-dd, .cs-bkn, .cs-note')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()); return [tr.dataset.csId, q.length, Math.round(Math.min(...q.map((b) => b.left))), Math.round(Math.max(...q.map((b) => b.right)))]; });
      const dated = [...document.querySelectorAll('#cs-plan tr[data-cs-id]')].filter((tr) => { const e = tr.querySelector('[data-cs-f="date"]') || tr.querySelector('.cs-dd'); const q = e && e.getBoundingClientRect(); return q && q.width > 40 && q.left >= 0 && q.right <= window.innerWidth; }).length;
      return { two: k.length === 6 && k[0].top === k[1].top && k[2].top > k[0].top, sticky: getComputedStyle(document.querySelector('#view-cash .cs-sum')).position, rows, parts, dated, sw: [Math.round(Math.min(...sw.map((b) => b.left))), Math.round(Math.max(...sw.map((b) => b.right)))], boxes: [...document.querySelectorAll('#cs-plan .tbl')].every((t) => t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= window.innerWidth), n: rows.length };
    });
    let x = await wide();
    ok(x[0] <= w && x[1] <= w && x[2] === w, `${w}px, «План»: the page does not scroll sideways`, x);
    ok(r.two && r.sticky === 'static', `${w}px: the six figures stand two to a row and do not stick`, r);
    ok(r.sw[0] >= 0 && r.sw[1] <= w, `${w}px: the month switcher — ‹, the month, › — is inside the screen`, r.sw);
    ok(r.n > 20 && r.boxes && r.rows.every(([left, width, right]) => left >= 0 && width >= 60 && right <= w - 14), `${w}px: each of the ${r.n} rows shows its name and its amount, and no list scrolls sideways`, r.rows.filter(([left, width, right]) => !(left >= 0 && width >= 60 && right <= w - 14)).slice(0, 4));
    ok(r.parts.every(([, count, left, right]) => count >= 5 && left >= 0 && right <= w - 14) && r.dated === r.n, `${w}px: … and nothing of a row is off the screen — its date, its bank, its mark and «ещё» stand under its name (${r.dated} dates in sight)`, r.parts.filter(([, count, left, right]) => !(count >= 5 && left >= 0 && right <= w - 14)).slice(0, 4));
    await calm(ph, `${w}px, «План»`, 'cash');
    // the widest things the tab can hold
    await ph.click('#cs-plan tr.cs-hist [data-ed-open]');
    await ph.waitForSelector(K('row'));
    const a = await wide();
    const cardBox = await ph.$eval(K('row').trim(), (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right), Math.round(q.width)]; });
    ok(cardBox[0] >= 0 && cardBox[1] <= w && cardBox[2] > 250, `${w}px: a row's card, opened under its row, is as wide as what is in sight`, cardBox);
    await ph.click('#cs-accts [data-ed-bal]');
    await ph.waitForSelector(K('bal'));
    const b = await wide();
    await ph.click('#cs-sec-team [data-ed-add]');
    await ph.waitForSelector('#cs-sec-team ' + K('add'));
    const c = await wide();
    await ph.click(K('add') + '[data-ed-x]');
    await ph.click('#cs-old summary');
    const d = await wide();
    ok([a, b, c, d].every((v) => v[0] <= w && v[1] <= w), `${w}px: nor with a row's card open, with the balances open, with «+ новая строка» open, with the old plan's loader open`, [a, b, c, d]);
    await ph.click('#view-cash [data-cs-view="days"]');
    await ph.waitForSelector('#cs-stmt');
    await holds(ph, `${w}px, «По дням»`, 'cash');
    await ph.click('#cs-stmt tr[data-cs-row="__past"] td');
    for (const dd of [T, '__paid', ...(await ph.$$eval('#cs-stmt tr.cs-out', (l) => l.slice(-3).map((e) => e.dataset.csRow)))]) await openDay(ph, dd);
    x = await wide();
    r = await ph.evaluate(() => {
      const t = document.querySelector('#cs-stmt').closest('.tbl').getBoundingClientRect();
      const v = window.innerWidth;
      const tap = [...document.querySelectorAll('#view-cash button, #view-cash input:not([type=file]), #view-cash select')].filter((e) => e.offsetParent).map((e) => { const h = e.closest('label.cs-tap') || e; const q = h.getBoundingClientRect(); return Math.min(q.width, q.height); }).filter((s) => s < 24).length;
      const svg = document.querySelector('#cs-chart');
      return { box: t.left >= 0 && t.right <= v, cal: (() => { const c = document.querySelector('#cs-cal').closest('.tbl'); return c.scrollWidth > c.clientWidth && c.getBoundingClientRect().right <= v; })(), tap, chart: Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 2, chartH: Math.round(svg.getBoundingClientRect().height),
        stmt: (() => { const c = document.querySelector('#cs-stmt').closest('.tbl'); return c.scrollWidth <= c.clientWidth + 1; })(),
        heads: [...document.querySelectorAll('#cs-stmt thead th')].filter((e) => e.getClientRects().length).map((e) => e.textContent),
        // every line of an opened day: its name and its amount first, inside the box, and what can be pressed under them
        lines: [...document.querySelectorAll('#cs-stmt li')].map((l) => { const n = l.querySelector('.cs-nmt').getBoundingClientRect(); const a = l.querySelector('.cs-am').getBoundingClientRect(); const press = [...l.querySelectorAll('button, input')].map((e) => e.getBoundingClientRect()); return n.width > 20 && n.left >= t.left && a.right <= t.right + 0.5 && a.left >= n.left && press.every((q) => q.top >= n.bottom - 2 && q.left >= t.left && q.right <= t.right + 0.5); }),
        done: document.querySelectorAll('#cs-stmt li.cs-done').length };
    });
    ok(x[0] <= w && x[1] <= w, `${w}px, «По дням» with days and groups open: the page does not scroll sideways`, x);
    ok(r.box && r.cal && r.chart && r.chartH <= 200, `${w}px: the calendar scrolls inside its own box; the chart is drawn to the phone's width, no taller than 190`, r);
    ok(r.stmt && r.heads.join(' ') === 'День Стало', `${w}px: the statement does not scroll sideways: a day is its date and what is left after it`, [r.stmt, r.heads]);
    ok(r.done >= 3 && r.lines.length > r.done && r.lines.every(Boolean), `${w}px: each of the ${r.lines.length} lines of the opened days (${r.done} of them done) says what it is and how much, in sight, with what can be pressed beneath`, r.lines);
    same(r.tap, 0, `${w}px: nothing to press is smaller than 24px`);
    await calm(ph, `${w}px, «По дням»`, 'cash');
    same([await puts('cash', 0), await puts('led', 0)], [0, 0], `${w}px: looking at all of it wrote nothing`);
    await ph.context().close();
  }
  // the desk
  serve(led, P);
  const d = await open('kassa desk');
  await d.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(d);
  await d.evaluate(() => document.fonts.ready);
  same([await d.$eval('#view-cash .cs-sum', (e) => getComputedStyle(e).position), await d.evaluate(() => Math.abs(parseFloat(document.querySelector('#view-cash').style.getPropertyValue('--cs-top')) - document.querySelector('.topbar').getBoundingClientRect().height) < 0.01)], ['sticky', true], '1320 wide: the six figures stick, at the height the top bar really has');
  await d.evaluate(() => window.scrollTo(0, 900));
  await sleep(120);
  const pos = await d.evaluate(() => [document.querySelector('.topbar').getBoundingClientRect().bottom, document.querySelector('#view-cash .cs-sum').getBoundingClientRect().top, document.querySelector('#view-cash .cs-sum').classList.contains('cs-stuck')]);
  ok(Math.abs(pos[0] - pos[1]) < 0.6 && pos[2], '… scrolled 900px down they sit flush under the bar, and only then wear a shadow', pos);
  // a keystroke redraws the figures; they must still be stuck after it
  await d.fill(box('inflows', 'usd', 'amt'), '3100');
  same(await d.$eval('#view-cash .cs-sum', (e) => e.classList.contains('cs-stuck')), true, '… and still do after a keystroke has redrawn them');
  await saved(d);
  await d.click('#cs-undo [data-cs-undo]');
  await d.evaluate(() => window.scrollTo(0, 0));
  await sleep(120);
  same(await d.$eval('#view-cash .cs-sum', (e) => e.classList.contains('cs-stuck')), false, '… back at the top they lie flat');
  same(await csRow(d, 'inflows', 'usd'), 'typed | none | on | Juniper | 3000 | USD | 2026-10-22 | Wise |  | ✓ получено', 'a row with a tag from the old plan draws no tag');
  ok(!/нужен PO|обещали к концу месяца/.test(await d.$eval('#view-cash', (e) => e.textContent)) && (await look(d, 'cash')).P.inflows.find((r) => r.id === 'usd').tag === 'нужен PO', '… the words of the tags are nowhere on the tab, and still in the plan');
  same(await text(d, cs('inflows', 'usd') + ' [data-cs-gbp]'), '£2,667', '$3,000 with VAT reads £2,667 beside the sum');
  const fonts = await d.evaluate(() => [...new Set([...document.querySelectorAll('#view-cash *')].map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()))]);
  ok(fonts.every((f) => ['Helvetica Neue', 'IBM Plex Mono'].includes(f)), 'only Money\'s two typefaces on the tab: ' + fonts.join(', '), fonts);
  const stray = () => d.evaluate(() => [[...document.querySelectorAll('#view-cash *')].filter((e) => e.getClientRects().length && !e.closest('button, a.btnlink, svg') && parseFloat(getComputedStyle(e).borderTopLeftRadius) > 0).map((e) => e.tagName + '.' + e.className), document.querySelectorAll('#view-cash .pill, #view-cash .chip:not(button), #view-cash .rule').length]);
  same(await stray(), [[], 0], 'nothing on «План» that is not a button has a rounded outline, and nothing is a .pill');
  await calm(d, 'the desk, «План»', 'cash');
  for (const m of ['2026-11', '2026-09']) { await toMonth(d, m); await calm(d, 'the desk, ' + m, 'cash'); }
  await d.click('#view-cash [data-cs-view="days"]');
  await d.click('#cs-stmt tr[data-cs-row="__past"] td');
  for (const dd of [T, '__paid', '__undated']) await openDay(d, dd);
  same(await stray(), [[], 0], '… nor on «По дням»');
  await calm(d, 'the desk, «По дням»', 'cash');
  const words = await d.evaluate(() => { const cs2 = (s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return [e.textContent, c.borderTopWidth, c.borderTopLeftRadius, c.backgroundColor, c.textTransform].join(' '); }; return [cs2(`#cs-stmt .cs-now`), cs2('#cs-stmt li .cs-rm')].map((x) => x && x.replace(/ /g, ' ')); });
  same(words, ['сегодня 0px 0px rgba(0, 0, 0, 0) none', 'не видно: выписки по 4 окт 0px 0px rgba(0, 0, 0, 0) none'], '«сегодня» beside today\'s date and a row\'s remark are small plain words: no border, no ground, no capsule');
  same([(await d.$$eval('#cs-scope [data-cs-scope]', (l) => l.map((b) => b.textContent))).join(' · '), (await d.$$eval('#view-cash [data-cs-view]', (l) => l.map((b) => b.textContent))).join(' · '), await d.$$eval('#cs-cal .cs-st', (l) => [...new Set(l.map((e) => e.textContent).filter(Boolean))].sort().join(' '))], ['Все счета · Wise · Barclays · Tochka · Mosta', 'План · По дням', 'мало'], 'what is pressed is still a button — the accounts, the two halves — and the calendar puts a word, in plain text, only on a day that is short: «мало»; a day that is fine says nothing');
  same([await puts('cash', 2), await puts('led', 0)], [2, 0], 'of all that only the keystroke and its «Отменить» were saved');
  await finish(d);
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
  let M = await C(ledA({ tx: [today] }), planA({ team: [g({ paid: paid(T) })] }));
  same([acct(M, 'Wise|GBP').cov, item(M, 'g').state, item(M, 'g').done.by, item(M, 'g').mark.counts, item(M, 'g').mark.cov, M.now, M.OUT], [T, 'done', 'mark', true, '2026-09-28', 8950, 6120],
    '«Оплачено» tapped on a day the morning\'s statement already reaches: the mark stands and is in «сейчас» — a statement uploaded before the tap cannot contradict it');
  // A week on the next statement reaches 12 Oct and holds no such row: only now is the line open again.
  M = await C(ledA({ tx: [today, reach('Wise', '2026-10-12', 'GBP')].map((r) => (r.id.startsWith('reach') ? { ...r, at: AT4 } : r)) }), planA({ team: [g({ paid: paid(T) })] }), T2);
  same([item(M, 'g').state, item(M, 'g').mark.unseen, item(M, 'g').mark.cov, item(M, 'g').day], ['unseen', true, '2026-10-12', T2], '… a statement uploaded AFTER the tap that reaches past its day and shows no such row reopens the line: «в выписке нет»');

  // Paid a little over. A line the table knows by name, marked, and the bank shows 8% more: the row closes it as it
  // would have closed it unmarked — not "unseen" beside its own payment.
  const z = (more = {}) => row('z', 'Person Z', 1000, '2026-10-07', more);
  const over = ledA({ tx: [filed('z1', '2026-10-07', -1080, 'cogs', 'Person Z', { at: AT4 }), { ...reach('Wise', '2026-10-12'), at: AT4 }] });
  const marked = await C(over, planA({ team: [z({ paid: paid(T) })] }), T2);
  const plainRow = await C(over, planA({ team: [z()] }), T2);
  same([item(marked, 'z').state, item(marked, 'z').done.by, item(marked, 'z').done.note, item(marked, 'z').done.over, item(marked, 'z').mark.counts], ['done', 'row', 'over', 80, false], 'marked £1,000, the bank shows −£1,080 from the same name: closed by that row, «пришло больше на £80»');
  same([marked.now, marked.OUT, marked.END, marked.month.M_EXP], [plainRow.now, plainRow.OUT, plainRow.END, plainRow.month.M_EXP], '… and every figure is what it would be had the line never been marked: the payout is counted once');
  // … and in part: the statement that brought the part has shown the mark's day, so the rest is owed again — once.
  const partL = ledA({ tx: [filed('z1', T, -400, 'cogs', 'Person Z', { at: AT3 })] });
  const part = await C(partL, planA({ team: [z({ paid: paid(T) })] }));
  const partPlain = await C(partL, planA({ team: [z()] }));
  same([item(part, 'z').state, item(part, 'z').part, part.marksGbp, part.now, part.OUT, part.END], ['unseen', { got: 400, of: 1000 }, 0, 9600, 6720, partPlain.END], 'marked £1,000, a row of −£400 arrives: the row is its part, the £600 it did not bring is owed again, and END is what it is unmarked');

  // The balance's own day. Typed at 09:00 for today; a payout dated today marked at noon; the statement then shows
  // the payout — on the day of the balance. It was on top of the balance as a mark and must stay there as a row.
  const typedToday = (team) => plan({ banks: [bal('Wise', 'GBP', 9880, T, { at: ms('2026-10-06T08:00:00Z') })], team });
  const g6 = (more = {}) => row('g', 'Person G', 1000, T, more);
  const open0 = await C(ledA(), typedToday([g6()]));
  const tapped = await C(ledA(), typedToday([g6({ paid: paid(T) })]));
  figs(open0, { now: 9880, OUT: 7120 }, 'a balance typed this morning for today, and a payout planned for today');
  figs(tapped, { now: 8880, OUT: 6120, END: open0.END }, '«Оплачено» at noon: it is on top of the morning\'s balance');
  for (const [how, L] of [['left unfiled in «Разбор»', ledA({ inb: [inbox('s', T, -1000, '', '', { at: AT3 })] })], ['filed under its name', ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] })]]) {
    M = await C(L, typedToday([g6({ paid: paid(T) })]));
    same([item(M, 'g').done.by, item(M, 'g').rows, acct(M, 'Wise|GBP').after, M.marksGbp, M.now, M.OUT, M.END], ['row', ['s'], -1000, 0, 8880, 6120, open0.END], `the statement then shows −£1,000 on that same day, ${how}: the row takes the mark's place and «сейчас» does not move`);
  }
  // A row of that day nobody marked is inside the balance, as before: this deliverable does not ask.
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), typedToday([g6()]));
  same([item(M, 'g').done.by, acct(M, 'Wise|GBP').after, M.now], ['row', 0, 9880], '… while a row of the balance\'s own day that closes an unmarked line is taken to be inside the balance, as the brief has it');

  // Upload, then the tap, then the filing. The payout is in «Разбор», unrecognised; the founder marks the line; then
  // files the row. At no step is it taken off twice.
  const up = ledA({ inb: [inbox('s', T, -1000, '', '', { at: AT2 })] });
  const steps = [await C(up, planA({ team: [g()] })), await C(up, planA({ team: [g({ paid: paid(T) })] })), await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT2 })] }), planA({ team: [g({ paid: paid(T) })] }))];
  same(steps.map((X) => [X.now, X.OUT, X.END]), [[9000, 7120, 9880], [9000, 6120, 10880], [9000, 6120, 10880]], 'uploaded and unfiled (the line still open beside its payment, as «Разбор» warns) → «Оплачено» (the unfiled row is the payment) → filed: «сейчас» is 9,000 at every step');
  same([steps[1].marksGbp, item(steps[1], 'g').done.by, item(steps[2], 'g').done.by, item(steps[2], 'g').state], [0, 'row', 'row', 'done'], '… the mark never stands beside the row it was made for');
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT2 }), { ...reach('Wise', '2026-10-12'), at: AT4 }] }), planA({ team: [g({ paid: paid(T) })] }), T2);
  same([item(M, 'g').state, M.OUT, M.cards.filter((c) => c.item === 'g').length], ['done', 6120, 0], '… and a week on it is closed, not reopened');
});

await run('word', 'a line paid on a founder\'s word is the month\'s fact: the month does not get better when a payout is marked', async () => {
  const P = (more = {}) => planA({ inflows: [row('n', 'Client N', 5000, '2026-10-12', more.n)], team: [row('g', 'Person G', 1000, '2026-10-08', more.g)] });
  const base = await C(ledA(), P());
  let M = await C(ledA(), P({ g: { paid: paid(T) } }));
  same([M.month.M_EXP, M.month.blocks.cogs.fact, M.month.blocks.cogs.rest, M.month.blocks.cogs.total, M.month.byWord, M.END], [base.month.M_EXP, 1000, 6000, base.month.blocks.cogs.total, 1000, base.END],
    '«Оплачено» on a £1,000 payout: it passes from «ещё по плану» to «факт»; COGS «итог», the month\'s result and END stand where they stood');
  M = await C(ledA(), P({ n: { paid: paid(T) } }));
  same([M.month.M_EXP, M.month.blocks.rev.fact, M.month.blocks.rev.total, M.month.byWord], [base.month.M_EXP, 5000, base.month.blocks.rev.total, 5000], '«Получено» on a £5,000 invoice: revenue is not short of it until the statement comes');
  // The statement brings the payout and nobody files it: the row has replaced the mark and is in no block yet.
  M = await C(ledA({ inb: [inbox('s', T, -1000, '', '', { at: AT3 })] }), P({ g: { paid: paid(T) } }));
  same([item(M, 'g').done.by, M.month.M_EXP, M.month.byWord, blocksOf(M)], ['row', base.month.M_EXP, 1000, blocksOf(base)], 'the payout arrives and waits in «Разбор»: still the month\'s fact');
  // Filed: the table carries it now, once.
  M = await C(ledA({ tx: [filed('s', T, -1000, 'cogs', 'Person G', { at: AT3 })] }), P({ g: { paid: paid(T) } }));
  same([M.month.M_EXP, M.month.byWord, M.month.blocks.cogs.fact, blocksOf(M)], [base.month.M_EXP, 0, 1000, blocksOf(base)], 'filed: it is the table\'s fact, counted once, and the month has not moved at any step');
  // A forecast ticked «уже прошло» under a typed balance is a mark too.
  const late = '2026-10-27';
  const before = await C(ledA(), planA(), late);
  M = await C(ledA(), plan({ banks: [bal('Wise', 'GBP', 4000, late, { at: ms(late + 'T11:00:00Z') })], team: [row('h|cogs|person b|2026-10', 'Person B', 6000, '2026-10-20', { sk: 'cogs|person b', cyc: '2026-10', src: 'hist', sure: false, paid: paid('2026-10-20', ms(late + 'T11:00:00Z') - 1) })] }), late);
  same([before.month.M_EXP, M.month.M_EXP, M.month.blocks.cogs.fact, M.month.blocks.cogs.total, item(M, 'h|cogs|person b|2026-10').mark.counts], [1880, 1880, 6000, 6000, false], 'a balance typed on the 27th with «Person B · 20 окт» ticked as already inside it: the payout is the month\'s fact, not a month £6,000 better');
  // «Всё верно» on a mark the statements have gone past is the founder saying nothing more is owed: it is in no column.
  M = await C(ledA(), P({ g: { paid: paid('2026-10-02', ms('2026-10-02T15:00:00Z'), { ok: true }) } }));
  same([item(M, 'g').done.by, M.month.byWord, M.month.blocks.cogs.total], ['ok', 0, 6000], '«Всё верно» is not a payment waiting for its statement: it adds nothing');
});

await run('early', 'a payment well before the date typed for it is asked about, not silently made next month\'s (E3 hint, D4)', async () => {
  const T3 = '2026-10-16';
  const L = (rows) => ledA({ tx: [...rows, { ...reach('Wise', '2026-10-15'), at: AT4 }] });
  const pay = (amt, at = AT4, d = '2026-10-14') => filed('p', d, amt, 'rev', 'Client A', { at });
  const a = (more = {}) => row('a', 'Client A', 8000, '2026-10-30', more);
  let M = await C(L([pay(8000)]), planA({ inflows: [a()] }), T3, { H: 60 });
  same([item(M, 'a').state, item(M, 'a').cyc, item(M, 'a').hint && [item(M, 'a').hint.id, item(M, 'a').hint.d, item(M, 'a').hint.amt], item(M, 'h|rev|client a|2026-10').state], ['due', '2026-11', ['p', '2026-10-14', 8000], 'done'],
    'Client A, typed for 30 Oct, pays on the 14th — sixteen days early. The payment closes his October and the typed line moves on to stand for November; it now asks «возможно, уже пришло»');
  const yes = await C(L([pay(8000)]), planA({ inflows: [a({ tx: ['p'] })] }), T3, { H: 60 });
  same([item(yes, 'a').state, item(yes, 'a').done.note, (item(yes, 'h|rev|client a|2026-11') || {}).state, yes.IN, yes.now], ['done', 'hand', 'due', 8000, M.now], '«Это оно»: the line is closed by that payment and November is forecast again');
  const no = await C(L([pay(8000)]), planA({ inflows: [a({ notx: ['p'] })] }), T3, { H: 60 });
  same([item(no, 'a').hint, item(no, 'a').state, no.IN], [null, 'due', 8000], '«Нет, это новый счёт»: no more asking; the typed line is November\'s money');
  // Not to the penny. The payment came after the line was typed, from the client it names: asked about as a part.
  M = await C(L([pay(7000)]), planA({ inflows: [a()] }), T3, { H: 60 });
  same(item(M, 'a').hint && item(M, 'a').hint.amt, 7000, 'he pays 7,000 against the 8,000 typed, early: still asked about');
  const part = await C(L([pay(7000)]), planA({ inflows: [a({ tx: ['p'] })] }), T3, { H: 60 });
  same([item(part, 'a').part, item(part, 'a').cash], [{ got: 7000, of: 8000 }, 1000], '… «Это оно» makes it «частично £7,000 из £8,000»: a thousand is still expected');
  // A row that was on the page BEFORE the line was typed has to be the line's sum to be asked about.
  M = await C(L([pay(7000, AT1, '2026-10-03')]), planA({ inflows: [a({ date: '2026-10-20' })] }), T3, { H: 60 });
  same(item(M, 'a').hint, null, 'a different sum that was already on the page when the line was typed is not asked about');
  // Last month's payout is always "about the same sum, a month early": never asked about.
  M = await C(ledA(), planA({ team: [row('b', 'Person B', 6000, '2026-10-20')] }));
  same([item(M, 'b').hint, item(M, 'b').cyc], [null, '2026-10'], 'Person B typed for 20 Oct: his September payout, thirty days before, is September\'s');
  // A month's forecast the founders confirmed and moved — «обещали к середине ноября» — is still October's money,
  // whatever its new date is nearest to. October's payment arriving on its usual day is asked about.
  const T4 = '2026-10-30';
  const promise = row('h|rev|client a|2026-10', 'Client A', 8000, '2026-11-15', { sk: 'rev|client a', cyc: '2026-10', src: 'hist' });
  M = await C(ledA({ tx: [filed('p', '2026-10-28', 7000, 'rev', 'Client A', { at: ms('2026-10-29T08:00:00Z') }), reach('Wise', '2026-10-29')] }), planA({ inflows: [promise] }), T4, { H: 60 });
  same([item(M, promise.id).kind, item(M, promise.id).state, item(M, promise.id).hint && [item(M, promise.id).hint.d, item(M, promise.id).hint.amt]], ['typed', 'due', ['2026-10-28', 7000]], 'October\'s forecast, confirmed and promised for 15 Nov: 7,000 from the client on 28 Oct is asked about as that promise');
  // An outflow, the same way.
  const pb = filed('p', '2026-10-07', -6000, 'cogs', 'Person B', { at: AT4 });
  M = await C(L([pb]), planA({ team: [row('b', 'Person B', 6000, '2026-10-28')] }), T3, { H: 60 });
  same([item(M, 'b').hint && item(M, 'b').hint.id, item(M, 'b').cyc], ['p', '2026-11'], 'a payout typed for the 28th and paid on the 7th asks «возможно, уже оплачено»');
});

await run('typed ahead', 'the month\'s average and a balance typed ahead of the statements (D6)', async () => {
  const day = '2026-10-21';
  const L = (to) => { const l = ledE(); l.tx = l.tx.filter((r) => !r.id.startsWith('reach')).concat([reach('Wise', to)]); return l; };
  const P = (asOf, more = {}) => plan({ banks: [bal('Wise', 'GBP', 10000, asOf)], ...more });
  let M = await C(L('2026-10-20'), P('2026-10-05'), day);
  same([M.avg.rev.E, M.avg.rev.months['2026-10'].left, M.IN], [10000, 10000, round2(10000 + 10000 * 20 / 30)], 'statements to 20 Oct with no one-off client in them: the whole usual month is still expected, over the eleven days left');
  M = await C(L('2026-10-05'), P('2026-10-05'), day);
  same([M.avg.rev.months['2026-10'].left, M.avg.rev.months['2026-10'].inside], [10000, undefined], 'statements and balance both of 5 Oct: nothing is inside any balance, the same');
  // The balance is typed as of the 20th; the statements still stop on the 5th. Fifteen of the twenty-six days the
  // statements have not shown are inside the figure typed.
  M = await C(L('2026-10-05'), P('2026-10-20'), day);
  const left = round2(10000 * 11 / 26);
  same([acct(M, 'Wise|GBP').cov, acct(M, 'Wise|GBP').through, M.avg.rev.months['2026-10'].left, M.avg.rev.months['2026-10'].inside, M.avg.rev.months['2026-10'].used, M.IN],
    ['2026-10-05', '2026-10-20', left, round2(10000 * 15 / 26), round2(10000 * 15 / 26), round2(left + 10000 * 20 / 30)],
    'the balance typed as of 20 Oct over statements of 5 Oct: what the average held for 6–20 Oct came and went inside that balance — 11/26 of the month is left');
  // §5.11 still holds under it: a typed one-off no larger than what is left is taken out of the average.
  const one = await C(L('2026-10-05'), P('2026-10-20', { inflows: [row('n', 'Client N', 2000, '2026-10-25')] }), day);
  same([one.IN, one.avg.rev.months['2026-10'].left], [M.IN, round2(left - 2000)], '… and a typed one-off of 2,000 is taken out of what is left, not added to it');
  // Another bank in use whose balance is old takes nothing off: none of this block's money moves through it.
  const two = (asOfW) => plan({ banks: [bal('Wise', 'GBP', 10000, asOfW), bal('Barclays', 'GBP', 500, '2026-10-05')] });
  const L2 = L('2026-10-05'); L2.tx.push(filed('fee', '2026-10-02', -10, 'other', 'Bank fee', { b: 'Barclays' }));
  M = await C(L2, two('2026-10-20'), day);
  same([acct(M, 'Barclays|GBP').active, M.avg.rev.months['2026-10'].left], [true, left], 'with a second bank in use, known only to 5 Oct, through which no client ever paid: the same — a bank\'s share is the share of the block\'s money that moved through it');
});

await run('midnight', 'nothing moves at midnight on the 1st: an average changes when a statement arrives (D6)', async () => {
  // One-off clients, a thin September (4,000) and 3,000 so far in October; the statements reach 29 Oct.
  const L = (more = []) => { const l = ledE(); l.tx.find((r) => r.id === 'o5').a = 4000; l.tx = l.tx.filter((r) => !r.id.startsWith('reach')).concat([filed('oct', '2026-10-15', 3000, 'rev', 'Client V'), reach('Wise', '2026-10-29'), ...more]); return l; };
  const P = plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-29')] });
  const fixed = '2026-12-20';
  const on = (M) => M.days.find((D) => D.d === fixed).e;
  const a = await C(L(), P, '2026-10-31', { H: 60 });
  const b = await C(L(), P, '2026-11-01', { H: 60 });
  same([a.reach, a.avg.rev.E, b.avg.rev.E, a.avg.rev.months['2026-10'].left, b.avg.rev.lump, b.month.blocks.rev.usual, a.month.blocks.rev.usual], ['2026-10-29', 9500, 9500, 6500, { ym: '2026-10', left: 6500, through: '2026-10-29' }, 9500, 9500],
    '31 Oct → 1 Nov, nothing uploaded and nothing typed: the usual month is still the median of April–September, and what October had left is carried over at the figure it was forecast with');
  ok(close(on(a), on(b), 0.011) && a.verdict.id === b.verdict.id, `… the balance expected on 20 Dec is the same on both mornings (${on(a)})`, [on(a), on(b), a.verdict.id, b.verdict.id]);
  same([b.month.ym, b.month.blocks.rev.rest, b.month.before, b.months.by['2026-10'].inflows.avg, b.months.by['2026-11'].inflows.avg, b.months.list.includes('2026-10')], ['2026-11', 9500, { ym: '2026-10', in: 6500, out: 0 }, 6500, 9500, true],
    '… October\'s tail is October\'s: it is in no figure of November\'s month view, and stands on October\'s page of the constructor, not inside November\'s «в среднем ещё»');
  // A statement that reaches November makes October whole, and only then does October enter the six.
  const c = await C(L([reach('Wise', '2026-11-02')]), plan({ banks: [bal('Wise', 'GBP', 10000, '2026-11-02')] }), '2026-11-03', { H: 60 });
  same([c.reach, c.avg.rev.E, c.avg.rev.lump], ['2026-11-02', 9000, null], 'a statement reaching 2 Nov: now the six months are May–October, the usual month is 9,000, and nothing is carried');
  // A ledger five weeks behind: the month it stops in is not a full month either, on any day.
  const old = ledE(); old.tx.find((r) => r.id === 'o5').a = 4000;
  const d = await C(old, plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')] }), '2026-11-10', { H: 60 });
  same([d.reach, d.avg.rev.E], ['2026-10-05', 9500], 'statements five weeks old on 10 Nov: an October the ledger has barely begun is not taken for a usual month');
  // The same for rows: on 2 Nov, with statements of 5 Oct, October's payout and October's client are counted today —
  // and are October's. November's result is November's own.
  const e = await C(ledA(), planA(), '2026-11-02');
  same([item(e, 'h|cogs|person b|2026-10').state, item(e, 'h|cogs|person b|2026-10').day, e.month.blocks.cogs.rest, e.month.blocks.rev.rest, e.month.before, e.month.M_EXP, e.month.blocks.result.usual], ['blind', '2026-11-02', 6000, 8000, { ym: '2026-10', in: 8000, out: 6000 }, 1880, 1880],
    'fixture A on 2 Nov, statements five weeks old: «Ноябрь: результат» is one month\'s clients less one month\'s payouts, not two of each');
  // And it is said where it is counted.
  const pg = await scene('tail', L(), P, { at: '2026-11-01T12:00:00+00:00', H: 60 });
  const S = await holds(pg, '1 Nov');
  const said = 'Сегодня посчитан и хвост октября, в среднем: +£6,500 — выписки и остатки только по 29 окт.';
  same([plain(await text(pg, '#view-today .td-days ~ .td-foot .note')).endsWith(said), /Хвост октября, которого выписки ещё не показали \(\+£6,500\), в этот месяц не входит\./.test(plain(await pg.$eval('#view-today .td-month', (t) => t.closest('section').querySelector('p.note').textContent))), S.fig('m.rev.rest')], [true, true, 9500],
    '«Сегодня» on 1 Nov says in words that today carries October\'s tail, +£6,500, and that November\'s result does not');
  await goCash(pg);
  same([plain(await text(pg, '#cs-sec-inflows [data-cs-avg]')), await toMonth(pg, '2026-10'), plain(await text(pg, '#cs-sec-inflows [data-cs-avg]'))], ['в среднем ещё ≈£9,500 — разовые клиенты', true, 'в среднем ещё ≈£6,500 — разовые клиенты'], '«Касса · План»: November\'s «в среднем ещё» is November\'s; October\'s tail stands on October\'s page');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  ok(plain(await pg.$eval('#cs-stmt', (t) => t.closest('section').querySelector('p.note').textContent)).endsWith(said), '«По дням» says the same under the statement, where «было» and «стало» would otherwise not add up');
  await pg.context().close();
});

await run('made', 'a row that closes a «каждый месяц» line by its amount is not a small cost as well (§5.2)', async () => {
  const small = [200, 300, 100, 250, 350, 250].map((v, i) => sheet('sm' + i, HALF[i] + '-17', v, 'other', 'Misc ' + 'abcdef'[i]));
  const rent = row('rent', 'Rent Loft', 900, '2026-10-08', { sk: 'm|rent loft' });
  const P = planA({ other: [rent], ser: { 'm|rent loft': { made: true, amt: 900, cur: 'GBP', day: 8, bank: 'Wise', blk: 'other', name: 'Rent Loft', by: 'Mika', at: C0 } } });
  const before = await C(ledA({ tx: small }), P);
  const after = await C(ledA({ tx: [...small, filed('ll', '2026-10-07', -900, 'other', 'Landlord', { at: AT3 })] }), P);
  same([before.avg.small.E, before.avg.small.months['2026-10'].left, item(after, 'rent').done.note, item(after, 'rent').done.label, after.avg.small.months['2026-10'].left, after.END, after.now], [250, 250, 'amount', 'Landlord', 250, before.END, before.now - 900],
    'Rent Loft £900 «каждый месяц», paid by a row filed as «Landlord»: the line is closed by amount, the small-costs average is left as it was, and END does not move');
});

await run('odd ledger', 'a label «constructor», a bank nobody has, a currency without a rate: the page still draws', async () => {
  const L = ledA({ tx: [filed('c1', '2026-10-02', -49, 'fixed', 'Constructor'), filed('c2', '2026-10-02', 900, 'rev', '__proto__'), filed('c3', '2026-10-02', -5, 'other', 'toString', { b: 'constructor' }), { ...filed('chf', '2026-10-02', -300, 'other', 'Swiss thing'), o: { a: -300, cur: 'CHF', t: 'Swiss thing' } }] });
  L.aliases = { 'old name': 'New Name' };
  let M = await C(L, planA({ other: [row('x', 'Old Name', 10, '2026-10-20')] }));
  same([M.accounts.map((a) => a.key).sort(), M.missing, acct(M, 'Wise|GBP').after, M.items.every((it) => typeof it.name === 'string' && typeof it.label === 'string')], [['Wise|GBP', 'constructor|GBP'], ['constructor|GBP'], -120 - 49 + 900 - 300, true],
    'the model: labels are text whatever they spell, the franc row is read as pounds on the Wise pound account — no «Wise CHF» that nobody can type — and only the bank that really has no balance is asked for');
  const pg = await scene('odd ledger', L, planA());
  same([(await look(pg)).M.verdict.id, await pg.$$eval('#view-today .td-row', (l) => l.some((e) => /native code|\[object/.test(e.textContent)))], ['v0', false], '«Сегодня» draws');
  await goCash(pg);
  same([await pg.$$eval('#cs-plan tr[data-cs-id]', (l) => l.length >= 3), /native code|\[object/.test(await text(pg, '#view-cash'))], [true, false], '«Касса» draws its month');
  await pg.click('.nav [data-tab="dashboard"]');
  await pg.context().close();
});

await run('first minus', 'a minus ahead: the sentence names the day the money runs out, and «Как закрыть» lands on the advice', async () => {
  // Person T is paid 10,500 on the 12th: 500 short that day; Person B's 6,000 on the 20th makes it 6,500; Client A
  // pays on the 28th.
  const P = planA({ team: [row('t1', 'Person T', 10500, '2026-10-12')] });
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
  const pg = await scene('one minus', ledA(), planA({ team: [row('t1', 'Person T', 9000, '2026-10-12')] }));
  same([await text(pg, '#view-today .td-say'), await pg.$('#view-today [data-live="minusday"]')], ['20 октября не хватит £5,000. В плюс выходим 28 октября.', null], 'when the first day short is the deepest, one sentence says both');
  await pg.context().close();
});

await run('today marks', 'marking on «Сегодня»: the month holds, a row marked from under «сегодня» stays in sight, a live mark offers no «Всё верно»', async () => {
  const P = planA({ team: [row('g', 'Person G', 1000, '2026-10-08'), row('f', 'Person F', 700, '2026-09-20')] });
  const pg = await scene('today marks', ledA(), P);
  let S = await holds(pg, 'before');
  const m0 = [S.fig('mexp'), S.fig('m.cogs.total'), S.fig('m.result.total'), S.fig('end')];
  await tapRow(pg, 'g', 'paid');
  S = await holds(pg, 'Person G «Оплачено»');
  same([[S.fig('mexp'), S.fig('m.cogs.total'), S.fig('m.result.total'), S.fig('end')], S.fig('m.cogs.fact'), S.fig('now'), /в т\.ч\. отмечено вручную £1,000/.test(plain(await pg.$eval('#view-today .td-month', (e) => e.closest('section').querySelector('p.note').textContent)))], [m0, 1000, 9000, true],
    '«Оплачено»: «Октябрь: результат», COGS «Итог месяца» and END do not move; the payout is in «Факт», and the note says «в т.ч. отмечено вручную £1,000»');
  await openRow(pg, 'g');
  same(await pg.$$eval(K('row') + '[data-ed-do]', (l) => l.map((b) => b.textContent)), ['Вернуть в план'], 'the card of a mark that still stands in for its payment offers «Вернуть в план» and nothing that would drop the payment from every figure');
  await pg.click(K('row') + '[data-ed-x]');
  // Person F was due on 20 Sep and is listed under «сегодня». Marked from its card in «Нужно решить», it goes under
  // its own day — among the days folded above today, which open for it.
  same([(await drawn(pg, 'f')).split(' | ').pop(), await pg.$eval('#view-today [data-td-flip="past"]', (b) => b.getAttribute('aria-expanded')).catch(() => 'no fold')], ['сегодня, вт 6 окт', 'false'], 'a payout a fortnight late stands under «сегодня»; the days gone by are folded');
  await pg.click('#view-today .td-need [data-td-card="8"] [data-ed-do="paid"]');
  S = await holds(pg, 'Person F «Оплачено» from its card');
  const d = (await drawn(pg, 'f')).split(' | ');
  same([d[1], d.pop(), await pg.$eval('#view-today [data-td-flip="past"]', (b) => b.getAttribute('aria-expanded')), [S.fig('mexp'), S.fig('end')]], ['line-through', 'вс 20 сен', 'true', [m0[0], m0[3]]], '«Оплачено» on its card: the row is still in sight, struck through under 20 Sep — the fold has opened — and the month and END have not moved');
  await finish(pg);

  // A balance typed late in the month with a forecast left ticked as «уже прошло».
  const p2 = await scene('ticked', ledA(), planA(), { at: '2026-10-27T12:00:00+00:00' });
  S = await holds(p2, '27 Oct');
  const mexp = S.fig('mexp');
  await p2.evaluate(() => window.scrollTo(0, 600));
  await p2.click('#view-today .td-acc summary');
  await p2.click('#view-today .td-acc [data-ed-bal]');
  await p2.fill(K('bal') + '[data-ed-acct="Wise|GBP"] [data-ed-bamt]', '4000');
  same(await p2.$$eval(K('bal') + '[data-ed-pass]', (l) => l.map((i) => i.dataset.edPass + ' ' + i.checked)), ['h|cogs|person b|2026-10 true'], 'the sheet lists what the statements have not shown up to that day; the regular payout is ticked beforehand');
  await p2.click(K('bal') + '[data-ed-save]');
  S = await holds(p2, 'Wise typed as 4,000 with Person B ticked');
  same([S.fig('mexp'), S.fig('m.cogs.fact'), S.fig('now'), await p2.evaluate(() => window.scrollY)], [mexp, 6000, 4000, 0], '«Октябрь: результат» is what it was: the ticked payout is the month\'s fact. And the page is back at its top, where the sentence and «Денег сейчас» are');
  await finish(p2);
});

await run('empty amount', 'a forecast\'s amount can be corrected, never emptied: an empty box stores nothing', async () => {
  const pg = await scene('empty amount', ledA(), planA());
  await goCash(pg);
  const id = 'h|cogs|person b|2026-10';
  let S = await holds(pg, 'the month', 'cash');
  const out = S.fig('out');
  for (const v of ['', '0']) {
    await pg.fill(box('team', id, 'amt'), v);
    S = await look(pg, 'cash');
    same([S.P.team.length, S.M.OUT, item(S.M, id).state], [0, out, 'due'], `the box of Person B's forecast ${v === '' ? 'emptied' : 'set to 0'}: nothing is written, «Уйдёт» has not moved`);
    await leave(pg);
    same([await pg.inputValue(box('team', id, 'amt')), /Сумму не убрал/.test(await toastText(pg)), (await look(pg, 'cash')).P.team.length], ['6000', true, 0], '… and when the cursor leaves, the figure is back and the page says how to take a month off instead');
  }
  same(await puts('cash', 0), 0, '… nothing was saved');
  // Emptied on the way to a new figure, it is simply the new figure.
  await pg.fill(box('team', id, 'amt'), '');
  await pg.type(box('team', id, 'amt'), '5500');
  await leave(pg);
  S = await holds(pg, '5,500 typed over it', 'cash');
  same([S.P.team.map((r) => [r.id, r.amt, r.sure]), S.fig('out')], [[[id, 5500, true]], out - 500], 'select, delete, type 5500: one row, the founder\'s own now');
  // … and that row cannot be emptied either: it is still the month's forecast, written down.
  await pg.fill(box('team', id, 'amt'), '');
  await leave(pg);
  same([(await look(pg, 'cash')).P.team[0].amt, await pg.inputValue(box('team', id, 'amt'))], [5500, '5500'], 'emptied again: it stays 5,500');
  // The same on the row's card.
  await pg.click('.nav [data-tab="today"]');
  await openRow(pg, 'h|rev|client a|2026-10');
  await fill(pg, 'row', { amt: 0 });
  await pg.click(K('row') + '[data-ed-save]');
  same([/Сумму не убрал/.test(await toastText(pg)), (await look(pg)).P.inflows.length, !!(await pg.$(K('row')))], [true, 0, true], 'the card refuses a forecast of 0 the same way, and stays open');
  await finish(pg);
});

await run('refused', 'a page whose save was refused stops answering «Сохранено»: every change says it was not kept', async () => {
  const LOST = 'Не сохранено: план изменился в другом окне — обновите страницу';
  serve(ledA(), planA({ team: [row('g', 'Person G', 1000, '2026-10-08')] }));
  const pg = await open('refused', undefined, { quiet: /409/ });
  await pg.waitForSelector('#view-today [data-live="verdict"]');
  await pg.click('#view-today [data-td-h="30"]');
  // Another founder saves the plan while this page is open.
  store.cash.doc = planA({ team: [row('g', 'Person G', 1000, '2026-10-08')], cushion: 9000 });
  store.cash.rev++;
  await editRow(pg, 'g', { amt: 1100 });
  same(await toastText(pg), 'Сохранено: Person G', 'the first change after it is answered «Сохранено» — the page does not know yet');
  await pg.waitForSelector('#view-today .banner');
  same([await toastText(pg), await text(pg, '#sync'), store.cash.doc.team[0].amt], [LOST, 'касса изменилась в другом окне — обновите страницу', 1000], '… and when the refusal comes back, that answer is replaced: «Не сохранено…»');
  const puts0 = store.cash.puts;
  // From here on nothing is changed, and each attempt says so at once.
  await openRow(pg, 'g');
  await fill(pg, 'row', { amt: 1200 });
  await pg.click(K('row') + '[data-ed-save]');
  same([await toastText(pg), (await look(pg)).P.team[0].amt, !!(await pg.$(K('row'))), await pg.inputValue(K('row') + '#ed-amt')], [LOST, 1100, true, '1200'], 'a row\'s card: «Сохранить» is refused in words, the plan on the page is not changed, and what was typed is left in the card');
  await pg.click(K('row') + '[data-ed-do="paid"]');
  same([await toastText(pg), (await look(pg)).P.team[0].paid], [LOST, undefined], '«Оплачено»: refused');
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
  await goCash(pg);
  await pg.fill(box('team', 'g', 'amt'), '1300');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[0].amt, await pg.inputValue(box('team', 'g', 'amt'))], [LOST, 1100, '1100'], '«Касса», a keystroke in a row: refused, the box shows the plan\'s figure again');
  await pg.click(cs('team', 'g') + ' [data-cs-f="on"]');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[0].on, await pg.isChecked(cs('team', 'g') + ' [data-cs-f="on"]')], [LOST, true, true], '… its tick: refused, and ticked again');
  await pg.click('#cs-undo [data-cs-undo]');
  same([await toastText(pg), (await look(pg, 'cash')).P.team[0].amt], [LOST, 1100], '… «Отменить»: refused');
  await sleep(700);
  same([store.cash.puts, store.cash.doc.cushion, store.cash.doc.team[0].amt], [puts0, 9000, 1000], 'none of it was sent, and the other founder\'s plan is as they saved it');
  await pg.context().close();

  // The one-time upgrade. Two founders open the old plan at once; this page's line is slow, and its founder unticks
  // a row while the upgrade is on its way. The upgrade is refused — the other page got there first — and this is no
  // longer "nothing was typed": it is said, not swallowed.
  const v1 = { v: 1, savedAt: '2026-10-01T09:30:00.000Z', cushion: 5000, banks: [{ id: 'r1', name: 'Wise — GBP', amt: 18000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '' }], inflows: [], team: [{ id: 'r2', name: 'Person G', amt: 1000, cur: 'GBP', bank: 'Wise', on: true, tag: '', info: false, date: '2026-10-08' }], taxes: [], other: [] };
  serve(ledA(), v1);
  store.cash.clash = await page.evaluate((p) => window.__money.upgrade(p), v1);
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

await run('small words', 'what a page says in passing: whose row it is, by when a bank must be topped up, what a past month\'s page is', async () => {
  // Barclays holds 500; 900 leaves it on the 15th and 300 more on the 22nd: short from the 15th, shortest on the 22nd.
  const P = planA({ banks: [bal('Barclays', 'GBP', 500, '2026-09-30')], inflows: [row('a', 'Client A', 850, '2026-10-27'), row('old', 'Client Q', 500, '2026-06-15', { paid: { on: '', legacy: true } })], other: [row('r1', 'Rent', 900, '2026-10-15', { bank: 'Barclays' }), row('r2', 'Hall', 300, '2026-10-22', { bank: 'Barclays' })] });
  const pg = await scene('small words', ledA(), P);
  await openRow(pg, 'a');
  ok(/В плане: вписал Mika 6 окт · в таблице это Client A\./.test(plain(await text(pg, K('row') + '.ed-why'))), 'a typed row\'s card says in words whose money it is: «в таблице это Client A»', plain(await text(pg, K('row') + '.ed-why')));
  await pg.click(K('row') + '[data-ed-x]');
  await goCash(pg);
  const bank = (root) => pg.$eval(`${root} [data-cs-bank="Barclays"] .cs-need`, (e) => e.textContent.replace(/\s+/g, ' '));
  same(plain(await bank('#cs-cov')), 'Докинуть£700 к 15 окт', '«Покрытие по банкам» of the month: Barclays needs £700 by the 15th — the first day it is short, not the 22nd, when it is shortest');
  await toMonth(pg, '2026-09');
  same([await text(pg, '#cs-past'), await pg.$('#cs-month [data-cs-mon="now"]') !== null], ['Здесь — строки плана и то, чего прогноз ждал по истории. Всё, что прошло по выпискам, — в «Месяцах».', true], 'September\'s page says what it is — the plan\'s rows and what history expected — and where the whole month is');
  await toMonth(pg, '2026-06');
  same([await text(pg, '#cs-past'), await listed(pg, 'inflows')], ['Так далеко назад прогноз по истории не показывает: здесь только строки, которые вписали вы. Всё, что прошло по выпискам, — в «Месяцах».', ['old']], 'June, further back than the forecast looks, says its one typed row is all it shows');
  await pg.click('#cs-month [data-cs-mon="now"]');
  same(await pg.$('#cs-past'), null, 'the running month says nothing of the kind');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  same([plain(await bank('#cs-covd')), plain(await pg.$eval('#cs-answer .cs-sugg li[data-cs-type="transfer"]', (e) => e.firstElementChild.nextElementSibling.firstElementChild.textContent))], ['Докинуть£700 к 15 окт', 'Перевести £700 с Wise на Barclays до чт 15 окт'], '«По дням»: the bank\'s card and the advice to move money name the same day');
  await finish(pg);
});

// =====================================================================================================================
// AFTER THE FIRST LOOK. The finished screens were looked at on the fabricated studio before the founders saw them,
// and two things were changed: the cautious scenario is shown only where somebody asked for it, and «оплачено» is one
// press on every row, the ones the page filled in from history included.
// =====================================================================================================================
// Fixture P, a studio that breaks even — as the fabricated one does, and the real one. Client W pays £26,000 on the
// 28th; five people are paid £5,000 each on the 8th, 11th, 14th, 17th and 20th. Month after month the expected
// balance comes back to where it was. On the cautious line — every payout a quarter up, the client a quarter short
// and a week late, all at once — the same studio is under zero within a fortnight and £12,000 under within seven weeks.
const PAYDAYS = ['08', '11', '14', '17', '20'];
const ledP = ({ skip = () => false } = {}) => ledger([
  sheet('z-client', '2025-06-10', 900, 'rev', 'Client Z'), sheet('z-person', '2025-06-12', 700, 'cogs', 'Person Z'),
  ...HALF.flatMap((m, i) => [sheet('w' + i, m + '-28', 26000, 'rev', 'Client W'), ...PAYDAYS.map((d, k) => sheet(`v${k + 1}-${i}`, `${m}-${d}`, 5000, 'cogs', 'Person V' + (k + 1)))]),
  reach('Wise', '2026-10-05'),
].filter((r) => !skip(r)));
// A chart as it is drawn: the labels of its axis from the bottom up, its lines, and what it calls itself; the legend
// beside it; and a label of the axis as a number.
const chartOf = (pg, id) => pg.$eval('#' + id, (e) => ({ axis: [...e.querySelectorAll('text[x="38"]')].map((t) => t.textContent), paths: e.querySelectorAll('path').length, dashed: e.querySelectorAll('path[stroke-dasharray]').length, label: e.getAttribute('aria-label'), legend: [...e.closest('section').querySelectorAll('.legend span')].map((x) => x.textContent.trim()), head: e.closest('section').querySelector('h2').textContent.replace(/\s+/g, ' ').trim() }));
const pounds = (t) => (/^[−-]/.test(t) ? -1 : 1) * parseFloat(t.replace(/[^\d.]/g, '')) * (/k$/.test(t) ? 1000 : 1);
// The switches of «Настройки → Прогноз», as they stand.
const switches = (pg) => pg.$$eval('#ed-forecast [data-ed-set]', (l) => l.map((e) => e.dataset.edSet + '=' + (e.type === 'checkbox' ? e.checked : e.value)));
const setCautious = async (pg, on) => { await pg.click('.nav [data-tab="settings"]'); await pg.setChecked('#ed-forecast [data-ed-set="cautious"]', on); };

await run('cautious', 'the cautious scenario is off unless a founder turns it on: no line, no figure and no word of it on «Сегодня» or in «Касса»', async () => {
  // Fixture P with an invoice 13 days late (card 7) and without one person's September payout (card 10): the two
  // cards whose words leaned on the cautious line.
  const L = ledP({ skip: (r) => r.id === 'v5-5' });
  const planP = (amt, more = {}) => plan({ banks: [bal('Wise', 'GBP', amt, '2026-09-30')], inflows: [row('e', 'Client E', 4000, '2026-09-22')], ...more });
  const H60 = { H: 60 };

  // ---- the model: the switch is handed on, and decides nothing
  const off = await C(L, planP(31000), T, H60);
  const on = await C(L, planP(31000, CAUTIOUS), T, H60);
  figs(off, { verdict: 'v2', now: 31000, IN: 56000, OUT: 50000, END: 37000, LOW: 10000, LOWDAY: '2026-10-20', LOW_C: -18250, LOWDAY_C: '2026-11-20', END_C: 1250, LATE: 4000 }, 'a studio that breaks even, 60 days: the expected line never goes under 10,000, the cautious one is 18,250 under zero by 20 Nov');
  same([off.cautious, on.cautious, off.verdict.subs, canon({ ...on, cautious: false }) === canon(off)], [false, true, ['cautious', 'typed'], true],
    'the plan\'s switch reaches the model as one field, `cautious`, and changes nothing else in it: the cautious line, its lowest point and the verdict are worked out either way');
  const v1 = await C(L, planP(55000), T, H60);
  same([v1.verdict.id, v1.LOW, v1.LOW_C, v1.cautious], ['v1', 34000, 5750, false], 'with 55,000 in the bank the verdict is v1 — fine even cautiously — and stays v1 in the model whether or not the scenario is shown');
  same(await page.evaluate(() => [{ v: 2 }, { v: 2, cautious: { on: true } }, { v: 1, banks: [] }, { v: 2, cautious: true }, { v: 2, cautious: { on: 'yes' } }].map((d) => window.__money.upgrade(d).cautious)), [{ on: false }, { on: true }, { on: false }, { on: false }, { on: false }],
    'in the plan document it is cautious:{on}: off in a plan that has never heard of it, old or new, and on only where the plan says so in so many words');

  // ---- «Сегодня» as a plan nobody has switched anything in shows it: v2
  const pg = await scene('cautious off, v2', L, planP(31000), H60);
  const say = (p) => text(p, '#view-today .td-say');
  const subs = (p) => texts(p, '#view-today .td-verdict .note');
  const lowHint = async (p) => (await texts(p, '#view-today .kpi .hint'))[3];
  const cards = async (p) => [await text(p, '#view-today .td-need .op[data-td-card="7"] .op-text'), plain(await p.$eval('#view-today .td-need .op[data-td-card="10"] .td-sub', (e) => e.firstElementChild.textContent))];
  // Everything that can speak of the scenario is opened first: the list of card 10, a day under the chart, the tip.
  const openAll = async (p, root, attr) => { await p.hover(`${root} rect.hit[${attr}="14"]`); await p.click(`${root} rect.hit[${attr}="14"]`); await p.mouse.move(2, 2); };
  await pg.click('#view-today .td-need [data-td-flip="hist"]');
  await openAll(pg, '#td-chart', 'data-td-i');
  let S = await holds(pg, 'off, v2');
  same([S.fig('verdict'), await say(pg), await subs(pg), await lowHint(pg)], ['v2', 'Денег хватает на 60 дней, если клиенты заплатят как обычно. Нижняя точка — £10,000, 20 октября.', ['Из £56,000 ожидаемых поступлений в плане £4,000, остальное — по истории и в среднем.'], '20 окт'],
    'v2, the scenario off: the one sentence; under it only what is typed and what is history — no «При осторожном сценарии…»; «Нижняя точка» names its day and nothing else');
  same(await cards(pg), ['Ждали 22 сен, в выписках Wise GBP по 5 окт его нет · 13 дн. Из расчёта уберу через 8 дн.', 'Person V5 · обычно ≈£5,000 около 20-го · на 15 дн. позже обычного, из расчёта убран.'],
    'the late invoice\'s card says only when the money leaves the calculation; a payout history expected and nobody made is simply out of it');
  let ch = await chartOf(pg, 'td-chart');
  same([ch.head, ch.legend, ch.paths, ch.dashed, ch.label, await text(pg, '#view-today .td-leg'), await text(pg, '#td-dayinfo .td-dayf'), plain(await pg.$eval('#view-today .chartbox .tip', (e) => e.textContent))],
    ['Остаток по днямчерез 60 дней: £37,000', ['остаток', 'запас £5k', 'придёт', 'уйдёт', 'по истории'], 1, 0, 'Остаток по дням', 'Линия — остаток на конец дня. Полые столбики — по истории. Нажмите на день, чтобы увидеть его строки.', 'остаток £10,000', 'вт 20 октПридёт+£0Уйдёт−£5,000Остаток£10,000'],
    'the chart: one line, «остаток», and the cushion; no dashed line, no entry for one in the legend, the note or the heading; a day under the chart and the tip over it give the one balance');
  same([ch.axis, Math.min(...ch.axis.map(pounds)) > S.M.LOW_C], [['−£10k', '£0', '£10k', '£20k', '£30k', '£40k'], true],
    'the chart\'s scale is the expected line\'s: −£10k … £40k, six steps for a line that runs between 10,000 and 37,000 — the cautious low of −18,250 is below the axis, and ignored');
  // ---- «Касса»: both halves
  await goCash(pg);
  await holds(pg, 'off, «План»', 'cash');
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openAll(pg, '#cs-chart', 'data-cs-i');
  S = await holds(pg, 'off, «По дням»', 'cash');
  const cs0 = await chartOf(pg, 'cs-chart');
  same([plain(await text(pg, '#cs-answer .cs-hl')), await pg.$$eval('#cs-answer .cs-sub', (l) => l.length), cs0.legend, cs0.paths, cs0.dashed, cs0.axis], ['Денег хватает на 60 дней. Нижняя точка — £10,000, вт 20 окт.', 0, ['остаток', 'запас £5k', 'придёт', 'уйдёт', 'по истории'], 1, 0, ch.axis],
    '«Касса · По дням»: «Итог» is the sentence alone, with no cautious one under it; the chart is the same one line on the same scale');
  same([await puts('cash', 0), await puts('led', 0)], [0, 0], 'looking at all of it wrote nothing');

  // ---- the fourth switch of «Настройки → Прогноз»
  await pg.click('.nav [data-tab="settings"]');
  same([await switches(pg), plain(await pg.$eval('#ed-forecast [data-ed-set="cautious"]', (e) => e.closest('label').textContent))],
    [['cushion=5000', 'rev=true', 'founders=true', 'vat=true', 'cautious=false'], 'Показывать осторожный сценарий — вторая линия на графике: что будет, если сразу и постоянные клиенты заплатят на четверть меньше и на неделю позже, и разовых не будет, и все расходы вырастут на четверть'],
    '«Настройки → Прогноз» has a fourth switch, «Показывать осторожный сценарий», off, with one sentence saying what the scenario assumes');
  await pg.setChecked('#ed-forecast [data-ed-set="cautious"]', true);
  same([await toastText(pg), (await look(pg)).P.cautious, await saved(pg), store.cash.doc.cautious, store.cash.puts, store.led.puts], ['Сохранено', { on: true }, true, { on: true }, 1, 0], 'switched on: stored in the plan beside the other three, and saved by the plan\'s own save, once');

  // ---- on: everything is as it was before the switch existed
  await pg.click('.nav [data-tab="today"]');
  await openAll(pg, '#td-chart', 'data-td-i');
  S = await holds(pg, 'on, v2');
  same([S.M.cautious, S.said.length > 5, S.dashed, await say(pg), await subs(pg), await lowHint(pg)], [true, true, 1, 'Денег хватает на 60 дней, если клиенты заплатят как обычно. Нижняя точка — £10,000, 20 октября.', ['При осторожном сценарии 20 ноября не хватит £18,250.', 'Из £56,000 ожидаемых поступлений в плане £4,000, остальное — по истории и в среднем.'], '20 окт · осторожно −£18,250 20 ноя'],
    'on: the same sentence for v2, with «При осторожном сценарии 20 ноября не хватит £18,250» under it and «осторожно −£18,250 20 ноя» beside the lowest point');
  same(await cards(pg), ['Ждали 22 сен, в выписках Wise GBP по 5 окт его нет · 13 дн. В осторожной линии уже не считаю; из расчёта уберу через 8 дн.', 'Person V5 · обычно ≈£5,000 около 20-го · на 15 дн. позже обычного, в осторожной линии ещё считаю.'], '… the two cards say where the cautious line stands on them');
  ch = await chartOf(pg, 'td-chart');
  same([ch.head, ch.legend, ch.paths, ch.dashed, ch.label, /Пунктир — осторожно: клиенты платят на четверть меньше и на неделю позже, расходы на четверть больше\./.test(await text(pg, '#view-today .td-leg')), await text(pg, '#td-dayinfo .td-dayf')],
    ['Остаток по днямчерез 60 дней: £37,000 · осторожно £1,250', ['ожидаем', 'осторожно', 'запас £5k', 'придёт', 'уйдёт', 'по истории'], 2, 1, 'Остаток по дням: ожидаемый и осторожный', true, 'остаток £10,000 · осторожно −£6,500'],
    '… the chart has its second, dashed line, named in the legend and explained under it');
  same([ch.axis, Math.min(...ch.axis.map(pounds)) <= S.M.LOW_C], [['−£20k', '£0', '£20k', '£40k'], true], '… and its scale now reaches down to the cautious low: −£20k … £40k in steps of twenty thousand');
  await goCash(pg, 'days');
  S = await holds(pg, 'on, «По дням»', 'cash');
  const cs1 = await chartOf(pg, 'cs-chart');
  same([await texts(pg, '#cs-answer .cs-sub'), cs1.legend.slice(0, 2), cs1.paths, cs1.dashed, cs1.axis], [['При осторожном сценарии 20 ноября не хватит £18,250.'], ['ожидаем', 'осторожно'], 2, 1, ch.axis], '… «Касса · По дням» the same: the sentence under «Итог», and both lines');
  await finish(pg);

  // ---- it is the plan's, so it is there after a reload — and off again when it is switched off
  const again = await open('cautious, reloaded');
  await again.waitForSelector('#view-today [data-live="verdict"]');
  S = await holds(again, 'on, after a reload');
  same([S.M.cautious, S.dashed, await puts('cash', 0)], [true, 1, 1], 'after a reload the scenario is still shown — it is in the plan, not in the browser — and the reload itself saved nothing: the one PUT is still the switch');
  await setCautious(again, false);
  await again.click('.nav [data-tab="today"]');
  S = await holds(again, 'switched off again');
  same([S.P.cautious, S.dashed, await subs(again), await saved(again), store.cash.doc.cautious], [{ on: false }, 0, ['Из £56,000 ожидаемых поступлений в плане £4,000, остальное — по истории и в среднем.'], true, { on: false }], 'switched off again: the line and its words are gone from the screen, and the plan says off');
  await finish(again);

  // ---- v1 reads as v2 does while the scenario is off
  const p1 = await scene('cautious off, v1', L, planP(55000), H60);
  S = await holds(p1, 'off, v1');
  same([S.fig('verdict'), await say(p1), await subs(p1)], ['v1', 'Денег хватает на 60 дней, если клиенты заплатят как обычно. Нижняя точка — £34,000, 20 октября.', ['Из £56,000 ожидаемых поступлений в плане £4,000, остальное — по истории и в среднем.']],
    'v1, the scenario off: the element still carries v1 and the sentence is the same one — «…если клиенты заплатят как обычно» — because it cannot lean on a line nobody is shown');
  await setCautious(p1, true);
  await p1.click('.nav [data-tab="today"]');
  S = await holds(p1, 'on, v1');
  same([S.fig('verdict'), await say(p1), (await subs(p1))[0]], ['v1', 'Денег хватает на 60 дней даже при осторожном сценарии. Нижняя точка — £34,000, 20 октября.', 'При осторожном сценарии нижняя точка — £5,750, 20 ноября.'], 'on: v1 says «даже при осторожном сценарии», as it did');
  await finish(p1);

  // ---- a phone, and the studio the change was asked for on
  const ph = await scene('cautious off, phone', L, planP(31000), { H: 60, w: 375, h: 812 });
  S = await holds(ph, 'off, 375px');
  same([await say(ph), (await chartOf(ph, 'td-chart')).legend], ['Денег хватает на 60 дней, если клиенты заплатят как обычно. Нижняя точка — £10,000, 20 октября.', ['остаток', 'запас £5k', 'придёт', 'уйдёт', 'по истории']], '375px: the same sentence and the same one line');
  await ph.context().close();
  serve(demoLedger(T), demoPlan(T));
  const demo = await open('cautious, the studio');
  await demo.waitForSelector('#view-today [data-live="verdict"]');
  S = await holds(demo, 'the fabricated studio, as it opens');
  ch = await chartOf(demo, 'td-chart');
  ok(S.M.LOW_C < -30000 && S.M.LOW > 0 && Math.min(...ch.axis.map(pounds)) > S.M.LOW_C / 2 && ch.dashed === 0 && (await subs(demo)).length === 2,
    `the fabricated studio opens without the alarm: its cautious line would fall to ${fmtP(S.M.LOW_C)}, and the chart's axis stops at ${ch.axis[0]} — the expected line, ${fmtP(S.M.LOW)} at its lowest, has the plot to itself`, [S.M.LOW_C, S.M.LOW, ch.axis, await subs(demo)]);
  await demo.context().close();
});

await run('one press', '«Оплачено / Получено» is one press on every row — the ones the page filled in from history, and VAT by the rule, as much as a typed one', async () => {
  const hist = 'h|cogs|person b|2026-10';
  const rowsOf = (P) => canon(LISTS.map((k) => P[k]));
  // ---- the model: a forecast marked this way is the design's ticked history item (B9) — written down, not confirmed, marked
  const M0 = await C(ledA(), planA());
  const occ = item(M0, hist);
  // What one press leaves in the plan: the row the month already had an id for, with the month's usual amount and
  // the forecast's date, not confirmed — and the mark, which remembers that it wrote the row.
  const pressed = (it, at = TAP) => row(it.id, it.name, it.occ.E, it.date, { bank: it.bank, sk: it.sk, cyc: it.cyc, src: 'hist', blk: it.blk, sure: false, c0: at, m: { t: at, by: 'Mika' }, paid: paid(T, at, { made: true }) });
  const MH = await C(ledA(), planA({ team: [pressed(occ)] }));
  const twin = row('g', 'Person G', 6000, '2026-10-20');
  const T0 = await C(ledA(), planA({ team: [twin] }));
  const T1 = await C(ledA(), planA({ team: [{ ...twin, paid: paid(T) }] }));
  const delta = (A, B) => ({ now: B.now - A.now, marks: B.marksGbp - A.marksGbp, IN: B.IN - A.IN, OUT: B.OUT - A.OUT, END: B.END - A.END, fact: B.month.blocks.cogs.fact - A.month.blocks.cogs.fact, rest: B.month.blocks.cogs.rest - A.month.blocks.cogs.rest, month: B.month.M_EXP - A.month.M_EXP, byWord: B.month.byWord - A.month.byWord });
  same([delta(M0, MH), delta(T0, T1)], [{ now: -6000, marks: -6000, IN: 0, OUT: -6000, END: 0, fact: 6000, rest: -6000, month: 0, byWord: 6000 }, { now: -6000, marks: -6000, IN: 0, OUT: -6000, END: 0, fact: 6000, rest: -6000, month: 0, byWord: 6000 }],
    'Person B\'s October, ≈£6,000 by history, marked paid moves exactly what a typed £6,000 for the same day moves when it is marked: 6,000 from «Уйдёт» into «Денег сейчас» and from «ещё по плану» into «факт» — END and the month\'s result stay');
  const h = item(MH, hist);
  same([h.src, h.kind, h.state, h.done.by, h.done.day, h.mark.counts, h.amt, MH.items.filter((it) => it.sk === 'cogs|person b' && it.cyc === '2026-10').length, MH.nowApprox], ['row', 'hist', 'done', 'mark', '2026-10-20', true, 6000, 1, true],
    '… in the model it is one item under the month\'s own id — still history, done on a founder\'s word, inside «сейчас» with its «≈», listed under its own day');
  // … and a statement closes it the way it closes any mark
  const byName = await C(ledA({ tx: [filed('pb', T, -6000, 'cogs', 'Person B', { at: AT3 })] }), planA({ team: [pressed(occ)] }));
  const byAmount = await C(ledA({ inb: [inbox('x', T, -6000, '', '', { at: AT3 })] }), planA({ team: [pressed(occ)] }));
  const silent = await C(ledA({ tx: [filed('later', T, 0, 'skip', '', { at: AT3 })] }), planA({ team: [pressed(occ)] }));
  same([[item(byName, hist).done.by, item(byName, hist).done.note, byName.now, byName.marksGbp, byName.END, byName.nowApprox], [item(byAmount, hist).done.by, item(byAmount, hist).done.note, byAmount.now, byAmount.marksGbp, byAmount.END, byAmount.nowApprox], [item(silent, hist).state, silent.now, silent.OUT, silent.END]],
    [['row', 'cycle', 4000, 0, M0.END, false], ['row', 'mark', 4000, 0, M0.END, false], ['unseen', 10000, M0.OUT, M0.END]],
    'a statement uploaded after the press takes the mark\'s place — Person B\'s own row filed under his name, or a row of that sum still unrecognised in «Разбор»: NOW 4,000 without «≈», END where it was. A statement that reaches the day and shows nothing opens the line again');

  // ---- the screen. Fixture A with Client A's VAT and one typed row beside the forecast ones.
  const pg = await scene('one press', ledA({ vat: true }), planA({ team: [row('g', 'Person G', 1000, '2026-10-07')] }), { H: 60 });
  let S = await holds(pg, 'before any press');
  const plan0 = rowsOf(S.P);
  const banks0 = canon(S.P.banks);
  const fig0 = { now: S.fig('now'), in: S.fig('in'), out: S.fig('out'), end: S.fig('end'), mexp: S.fig('mexp') };
  shows(S, { now: 10000, out: 17240, end: 8760, 'm.cogs.fact': 0 }, 'fixture A with VAT and a typed £1,000, 60 days');
  // A press, and how many times the plan had been saved before it: every press here must cost exactly one save.
  let saves = 0;
  const press = async (sel) => { await saved(pg); saves = store.cash.puts + 1; await pg.click(sel); };
  // What must be true after a press on Person B's October, wherever it was made.
  const marked = async (where, tab) => {
    const X = await holds(pg, `${where}: pressed`, tab);
    const r = stored(X, hist);
    const mine = LISTS.flatMap((k) => X.P[k]).filter((x) => x.sk === 'cogs|person b');
    same([mine.length, r && [r.id, r.name, r.amt, r.cur, r.bank, r.date, r.sk, r.cyc, r.src, r.blk, r.sure, r.on, r.paid.on, r.paid.by, r.paid.made, r.paid.at === r.c0], rowsOf({ ...X.P, team: X.P.team.filter((x) => x !== r) }) === plan0, canon(X.P.banks) === banks0],
      [1, [hist, 'Person B', 6000, 'GBP', 'Wise', '2026-10-20', 'cogs|person b', '2026-10', 'hist', 'cogs', false, true, T, 'Mika', true, true], true, true],
      `${where}: one press stores exactly one row, under the id the month already had — the forecast's £6,000 and its 20 Oct as they stood, not confirmed — and marks it; no other row and no balance of the plan is touched`);
    same([X.fig('now'), X.fig('marks'), X.fig('in'), X.fig('out'), X.M.END, X.M.month.blocks.cogs.fact, X.M.month.M_EXP, item(X.M, hist).done.by, await saved(pg), store.cash.puts, store.led.puts], [fig0.now - 6000, -6000, fig0.in, fig0.out - 6000, fig0.end, 6000, fig0.mexp, 'mark', true, saves, 0],
      `${where}: … NOW, «Уйдёт» and the month's fact move as the model says a marked typed row moves them, END and the month's result do not — in one save`);
    return X;
  };
  // … and after the second press: the plan is, to the letter, the plan before the first.
  const restored = async (where, tab) => {
    const X = await holds(pg, `${where}: pressed again`, tab);
    same([rowsOf(X.P) === plan0, canon(X.P.banks) === banks0, item(X.M, hist).src, item(X.M, hist).kind, item(X.M, hist).state, X.fig('now'), X.fig('out'), X.M.END, 'marks' in X.live, await saved(pg), store.cash.puts], [true, true, 'occ', 'hist', 'due', fig0.now, fig0.out, fig0.end, false, true, saves],
      `${where}: pressed again, the mark is gone and the row with it — the month is the forecast it was, and every figure is back; that, too, is one save`);
    return X;
  };

  // «Сегодня»: the row's card
  await openRow(pg, hist);
  same(await texts(pg, K('row') + '.ed-foot button'), ['Оплачено', 'Сумма верная', 'В этом месяце не будет', 'Больше не ждём', 'Закрыть', 'Сохранить'], '«Сегодня»: the card of a row from history starts with «Оплачено», where a typed row\'s does; «Сумма верная», «В этом месяце не будет» and «Больше не ждём» follow');
  await press(K('row') + '[data-ed-do="paid"]');
  S = await marked('«Сегодня»');
  same([await drawn(pg, hist), S.fig('m.cogs.fact'), await toastText(pg)], ['td-row td-done | line-through | Person B | Wise · отмечено · ждёт выписку | −£6,000 | вт 20 окт', 6000, 'Оплачено: Person B'], '… the row stays under 20 Oct, struck through, with its exact sum; «Факт» of COGS has the 6,000');
  await openRow(pg, hist);
  same(await texts(pg, K('row') + '.ed-foot button'), ['Вернуть в план', 'Закрыть'], '… and its card now offers «Вернуть в план», as a marked typed row\'s does');
  await press(K('row') + '[data-ed-do="unpaid"]');
  await restored('«Сегодня»');

  // «Касса · План»: the last cell of the row
  await goCash(pg);
  const spot = (id) => pg.$eval(cs('team', id) + ' [data-cs-st] button', (b) => { const q = b.getBoundingClientRect(); return [b.dataset.edDo, b.className, b.getAttribute('aria-pressed'), b.textContent.trim(), Math.round(q.left), Math.round(q.width), Math.round(q.height)].join(' | '); });
  same([await spot(hist), (await spot('g')), (await csRow(pg, 'team', hist)).split(' | ').pop(), await pg.$$eval('#cs-plan tr[data-cs-id] [data-cs-st] [data-ed-do="sure"], #cs-plan .cs-sure', (l) => l.length)], [await spot('g'), await spot('g'), '✓ оплачено', 0],
    '«Касса · План»: the row from history ends in the very control the typed row above it ends in — the same button, the same place, the same size — and no row offers «верно» there any more');
  await press(cs('team', hist) + ' [data-ed-do="paid"]');
  S = await marked('«Касса · План»', 'cash');
  same(await csRow(pg, 'team', hist), 'cs-hist cs-done | line-through | no tick | Person B | 6,000 | GBP | 20 окт | Wise | отмечено · ждёт выписку | оплачено ✓', '… the row stays in its place in October, struck through, its toggle pressed');
  await press(cs('team', hist) + ' [data-ed-do="unpaid"]');
  S = await restored('«Касса · План»', 'cash');
  same(await csRow(pg, 'team', hist), 'cs-hist | none | on | Person B | ≈6000 | GBP | 2026-10-20 | Wise |  | ✓ оплачено', '… and is drawn as the forecast it was: muted, behind «≈», to be typed into');

  // The VAT item, «по выручке», in November
  await toMonth(pg, '2026-11');
  same(await csRow(pg, 'taxes', 'v|2026Q3'), 'cs-hist | none | on | VAT за Q3 2026 | ≈4000 | GBP | 2026-11-07 | Wise | по выручке | ✓ оплачено', 'the VAT the page worked out from revenue carries the same toggle');
  await press(cs('taxes', 'v|2026Q3') + ' [data-ed-do="paid"]');
  S = await holds(pg, 'VAT marked', 'cash');
  const vat = S.P.taxes[0];
  same([S.P.taxes.length, vat.sk, vat.amt, vat.date, vat.paid.on, vat.paid.made, item(S.M, 'v|2026Q3'), item(S.M, vat.id).done.by, S.fig('now'), S.fig('out'), S.M.END, await csRow(pg, 'taxes', vat.id)],
    [1, 'tax|vat|2026Q3', 4000, '2026-11-07', T, true, null, 'mark', fig0.now - 4000, fig0.out - 4000, fig0.end, 'cs-done | line-through | no tick | VAT за Q3 2026 | 4,000 | GBP | 7 ноя | Wise | отмечено · ждёт выписку | оплачено ✓'],
    '… one press: one taxes row with the quarter\'s key in the computed item\'s place, marked; 4,000 from «Уйдёт» into «Денег сейчас», END where it was');
  await press(cs('taxes', vat.id) + ' [data-ed-do="unpaid"]');
  S = await restored('the VAT item', 'cash');
  same([item(S.M, 'v|2026Q3').kind, (await csRow(pg, 'taxes', 'v|2026Q3')).split(' | ').slice(-2)], ['rule', ['по выручке', '✓ оплачено']], '… pressed again: the row is gone and VAT is «по выручке» again, following the quarter\'s invoices');
  await toMonth(pg, '2026-10');

  // «Касса · По дням»: the first thing in a line of a day
  await pg.click('#view-cash [data-cs-view="days"]');
  await pg.waitForSelector('#cs-stmt');
  await openDay(pg, '2026-10-20');
  await openDay(pg, '2026-10-07');
  const ctl = (id) => pg.$eval(`#cs-stmt li[data-cs-li="${id}"] .cs-ctl button`, (b) => { const q = b.getBoundingClientRect(); return [b.dataset.edDo, b.className, b.textContent.trim(), Math.round(q.left), Math.round(q.width)].join(' | '); });
  same([await dayRows(pg, '2026-10-20'), await ctl(hist)], [[`${hist} | cs-hist | none | ✓ оплачено|false | date | no фикс |  | ≈−£6,000`], await ctl('g')], '«Касса · По дням»: the line of a row from history starts with the same «✓ оплачено» as the typed line of the 7th');
  await press(`#cs-stmt li[data-cs-li="${hist}"] [data-ed-do="paid"]`);
  S = await marked('«Касса · По дням»', 'cash');
  same([await dayRows(pg, '2026-10-20'), await dayLine(pg, '2026-10-20')], [[`${hist} | cs-ispaid cs-done | line-through | оплачено ✓|true | no date | no фикс | отмечено · ждёт выписку | −£6,000`], ['вт 20 окт', '£3,000', '—', '—', '£3,000мало', 'оплачено 1']],
    '… the line stays under its day, struck through, counted in nothing: the day begins and ends at 3,000 — the 6,000 is already out of «Денег сейчас» — and says «оплачено 1»');
  await press(`#cs-stmt li[data-cs-li="${hist}"] [data-ed-do="unpaid"]`);
  await restored('«Касса · По дням»', 'cash');
  // … and the statement that then shows the payment replaces the mark, as it replaces a typed row's
  await press(`#cs-stmt li[data-cs-li="${hist}"] [data-ed-do="paid"]`);
  await marked('«Касса · По дням», once more', 'cash');
  await pg.clock.fastForward(60000);
  same(await feed(pg, wiseCsv([['TRANSFER-7', T, -6000, 'Sent money to somebody', '', 'Somebody']])), ['Wise', 1], 'a statement uploaded after the press brings 6 Oct −6,000');
  await goCash(pg, 'days');
  S = await holds(pg, 'the statement row in the mark\'s place', 'cash');
  await openDay(pg, T);
  same([item(S.M, hist).done.by, item(S.M, hist).done.day, S.fig('now'), plain(S.live.now.t), 'marks' in S.live, S.M.END, (await dayRows(pg, T)).filter((x) => x.startsWith(hist))], ['row', T, fig0.now - 6000, '£4,000', false, fig0.end, [`${hist} | cs-ispaid cs-done | line-through | по выписке 6 окт | no date | no фикс |  | −£6,000`]],
    '… the bank\'s row takes the mark\'s place: NOW 4,000 without «≈», END where it was, and the line stands under the day of the bank\'s row — «по выписке 6 окт», with nothing left to press');
  await finish(pg);

  // ---- a month the page has stopped counting on: marked and un-marked, it is not counted on again
  const quiet = ledger([...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((m, i) => sheet('k' + i, m + '-20', 5000, 'rev', 'Client K')), reach('Wise', '2026-10-05')]);
  const pq = await scene('one press, a client gone quiet', quiet, plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')] }));
  await goCash(pq);
  const oct = 'h|rev|client k|2026-10';
  S = await holds(pq, 'September did not come', 'cash');
  const q0 = rowsOf(S.P);
  same([item(S.M, oct).state, S.fig('in'), (await csRow(pq, 'inflows', oct)).split(' | ').slice(-2)], ['doubt', 0, ['под вопросом', '✓ получено']], 'Client K\'s September did not come, so October is «под вопросом» and in no line — and still has its «✓ получено»');
  await pq.click(cs('inflows', oct) + ' [data-ed-do="paid"]');
  S = await holds(pq, 'the doubted month marked received', 'cash');
  same([item(S.M, oct).done.by, S.fig('now'), stored(S, oct).paid.made], ['mark', 15000, true], 'pressed: received on a founder\'s word, 5,000 more in «Денег сейчас»');
  await pq.click(cs('inflows', oct) + ' [data-ed-do="unpaid"]');
  S = await holds(pq, 'and un-marked', 'cash');
  same([rowsOf(S.P) === q0, item(S.M, oct).state, item(S.M, oct).src, S.fig('in'), S.fig('now')], [true, 'doubt', 'occ', 0, 10000], 'pressed again: nothing of the press is left in the plan, and October is «под вопросом» as before — a row left behind would have put its 5,000 back into «Придёт»');
  // A forecast a founder had already moved keeps its row when the mark comes off: the date is theirs.
  await pq.fill(box('inflows', oct, 'date'), '2026-10-27');
  await leave(pq);
  await pq.click(cs('inflows', oct) + ' [data-ed-do="paid"]');
  S = await holds(pq, 'a moved forecast marked', 'cash');
  same(['made' in stored(S, oct).paid, stored(S, oct).date], [false, '2026-10-27'], 'a forecast a founder had moved to the 27th, then marked: the mark did not write the row, and does not claim to');
  await pq.click(cs('inflows', oct) + ' [data-ed-do="unpaid"]');
  S = await holds(pq, 'the moved forecast un-marked', 'cash');
  same([stored(S, oct) && [stored(S, oct).date, stored(S, oct).sure, 'paid' in stored(S, oct)], item(S.M, oct).day], [['2026-10-27', false, false], '2026-10-27'], '… un-marked, it is still the founder\'s moved forecast, waited for on the 27th');
  await finish(pq);

  // ---- the studio: every open row of a month ends in the one control
  serve(demoLedger(T), demoPlan(T));
  const demo = await open('one press, the studio');
  await demo.waitForSelector('#view-today [data-live="verdict"]');
  await goCash(demo);
  const ends = await demo.$$eval('#cs-plan tr[data-cs-id]', (l) => l.map((tr) => { const st = tr.querySelector('[data-cs-st]'); const b = [...st.querySelectorAll('button')]; return { id: tr.dataset.csId, cls: tr.className, st: b.map((x) => x.dataset.edDo + ':' + x.className).join(',') || st.textContent.trim().replace(/\s+/g, ' ').slice(0, 12), more: tr.querySelector('.cs-mo button').textContent }; }));
  const open2 = ends.filter((r) => !/cs-done|cs-gone|cs-off/.test(r.cls));
  ok(open2.length > 25 && open2.filter((r) => /cs-hist/.test(r.cls)).length > 20 && open2.every((r) => r.st === 'paid:chip cs-paid' && r.more === 'ещё') && ends.filter((r) => /cs-done/.test(r.cls)).every((r) => /^по выписке|^unpaid:chip cs-paid$/.test(r.st)),
    `the fabricated studio's October: each of its ${open2.length} open rows — ${open2.filter((r) => /cs-hist/.test(r.cls)).length} of them filled in from history — ends in the one «✓ получено / оплачено» and «ещё»; a row that is done says «по выписке» or keeps its pressed toggle`, ends.filter((r) => !/cs-done/.test(r.cls) && r.st !== 'paid:chip cs-paid').slice(0, 5));
  await demo.context().close();
});

// What the review of «one press» found. Until that press a marked forecast came only from the sheet of balances
// («Что из этого уже прошло?»), a few rows a month and each of them a payout already overdue. On every row of the
// month it meets the statement in ways that sheet never showed the engine: weeks from the usual day, in parts,
// after «Больше не ждём», and long after its month has left the months occurrences are made for.
await run('one press, reviewed', 'a forecast marked with one press and the statement that then comes — weeks from the usual day, in parts, after «Больше не ждём», months later; and what a late forecast\'s card offers', async () => {
  // What one press leaves in the plan; «one press» holds that the screen writes exactly this.
  const pressed = (it, on = T, at = TAP) => row(it.id, it.name, it.occ.E, it.date, { bank: it.bank, sk: it.sk, cyc: it.cyc, src: 'hist', blk: it.blk, sure: false, c0: at, m: { t: at, by: 'Mika' }, paid: paid(on, at, { made: true }) });
  const head = (M) => ({ now: M.now, marks: M.marksGbp, IN: M.IN, OUT: M.OUT, END: M.END, month: M.month.M_EXP });
  const brief = (M, id) => { const it = item(M, id); return it ? [it.state, it.done ? it.done.by + '/' + it.done.note : '', it.rows.join('+'), it.cash] : null; };
  const H60 = { H: 60 };

  // ---- 1. Paid more than half a month before the usual day. Client A pays on the 28th; this October it paid on
  // the 6th, a founder pressed «получено» that day, and the statement uploaded afterwards shows the +8,000 of the 6th.
  const A0 = await C(ledA(), planA(), T, H60);
  const oct = 'h|rev|client a|2026-10';
  const PA = planA({ inflows: [pressed(item(A0, oct))] });
  const twinA = planA({ inflows: [row('tw', 'Client A', 8000, '2026-10-28', { paid: paid(T) })] });
  const early = [filed('pa', T, 8000, 'rev', 'Client A', { at: AT3 })];
  const A1 = await C(ledA(), PA, T, H60);
  const A2 = await C(ledA({ tx: early }), PA, T, H60);
  same([head(A1), head(A2)], [head(await C(ledA(), twinA, T, H60)), head(await C(ledA({ tx: early }), twinA, T, H60))],
    'Client A, ≈£8,000 on the 28th, marked received on the 6th: the mark, and then the statement\'s +8,000 of the 6th, move what they move for a typed £8,000 of the same client');
  same([brief(A2, oct), (item(A2, oct).done || {}).day, brief(A2, 'h|rev|client a|2026-09'), item(A2, 'h|rev|client a|2026-09').amt, A2.now, A2.END === A1.END && A1.END === A0.END, card(A2, 10).length],
    [['done', 'row/cycle', 'pa', 0], T, ['done', 'row/cycle', 'a5', 0], 8000, 18000, true, 0],
    '… the row of the 6th takes the mark\'s place in OCTOBER, though the 28th of September is the nearer usual day: September stays at its own 8,000, NOW is 18,000 without the mark and the balance in 60 days is where it was before the press');

  // ---- 2. … and paid as late. Person X is paid on the 3rd from Barclays, whose statements stop at 30 Sep; this
  // October he was paid on the 20th, «оплачено» pressed that day, and the statement of the 21st shows it.
  const D20 = '2026-10-20';
  const tap20 = ms('2026-10-20T11:00:00Z');
  const ledX = (tx = []) => ledger([...HALF.map((m, i) => filed('x' + i, m + '-03', -2500, 'cogs', 'Person X', { b: 'Barclays' })), reach('Barclays', '2026-09-30'), reach('Wise', '2026-10-19'), ...tx]);
  const planX = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 30000, '2026-10-19'), bal('Barclays', 'GBP', 9000, '2026-09-30')], ...parts });
  const X0 = await C(ledX(), planX(), D20, H60);
  const xo = 'h|cogs|person x|2026-10';
  const xn = 'h|cogs|person x|2026-11';
  const PX = planX({ team: [pressed(item(X0, xo), D20, tap20)] });
  const twinX = planX({ team: [row('tw', 'Person X', 2500, '2026-10-03', { bank: 'Barclays', c0: ms('2026-10-20T08:00:00Z'), paid: paid(D20, tap20) })] });
  const late = [filed('px', D20, -2500, 'cogs', 'Person X', { b: 'Barclays', at: ms('2026-10-21T09:00:00Z') })];
  const X1 = await C(ledX(), PX, D20, H60);
  const X2 = await C(ledX(late), PX, D20, H60);
  same([head(X1), head(X2)], [head(await C(ledX(), twinX, D20, H60)), head(await C(ledX(late), twinX, D20, H60))],
    'Person X, ≈£2,500 on the 3rd, marked paid on the 20th: the mark and then the statement\'s −2,500 of the 20th move what they move for a typed £2,500');
  same([brief(X0, xo), brief(X2, xo), brief(X2, xn), item(X2, xn).day, X2.now, X2.END === X0.END],
    [['blind', '', '', -2500], ['done', 'row/cycle', 'px', 0], ['due', '', '', -2500], '2026-11-03', 36500, true],
    '… the payment of the 20th is October\'s, though the 3rd of November is the nearer usual day: November is still to be paid, and nothing is counted twice');

  // ---- 3. A client who pays in two parts. The first +3,000 is dated the very day the balance was typed for and was
  // on the page when it was typed, so it is inside that balance. The remainder is marked received; the statement
  // then brings the second part.
  const ledM = (tx = []) => ledger([...HALF.flatMap((m, i) => [filed('mx' + i, m + '-09', 3000, 'rev', 'Client M'), filed('my' + i, m + '-13', 3000, 'rev', 'Client M')]), ...tx]);
  const mo = 'h|rev|client m|2026-10';
  const first = filed('m1', T, 3000, 'rev', 'Client M', { at: ms('2026-10-06T08:00:00Z') });
  const planM = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 30000, T, { at: ms('2026-10-06T09:00:00Z') })], ...parts });
  const M0 = await C(ledM([first]), planM(), T, H60);
  const rest = item(M0, mo);
  same([M0.now, rest.amt, rest.occ], [30000, 3000, { E: 6000, typ: 0, got: 3000 }], 'Client M pays 2 × £3,000 a month: with the first part inside the balance typed for 6 Oct, NOW is 30,000 and ≈£3,000 of October is still expected');
  const twoParts = async (on, at, second, day) => {
    const P = planM({ inflows: [pressed(rest, on, at)] });
    const before = await C(ledM([first]), P, on, H60);
    const after = await C(ledM([first, second]), P, day, H60);
    return [before.now, before.marksGbp, brief(after, mo), after.now, after.marksGbp, acct(after, 'Wise|GBP').after];
  };
  same([await twoParts(T, TAP, filed('m2', '2026-10-07', 3000, 'rev', 'Client M', { at: ms('2026-10-08T09:00:00Z') }), '2026-10-08'), await twoParts('2026-10-08', ms('2026-10-08T11:00:00Z'), filed('m2', '2026-10-09', 3000, 'rev', 'Client M', { at: ms('2026-10-10T09:00:00Z') }), '2026-10-10')],
    [[33000, 3000, ['done', 'row/cycle', 'm1+m2', 0], 33000, 0, 3000], [33000, 3000, ['done', 'row/cycle', 'm1+m2', 0], 33000, 0, 3000]],
    'the remainder marked — the same day after the balance, or two days on — and then the second part in the statement: both parts close the month, and only the second is on top of the balance. NOW stays 33,000; the part that was inside the balance is not taken out of it and counted again');

  // ---- 4. «Больше не ждём» on a later month, after this month's remainder was marked. The stored row holds the
  // whole usual month (B9) and is worth what is left of it — also once its series is no longer forecast.
  const ledM3 = ledM([filed('m1', '2026-10-03', 3000, 'rev', 'Client M'), reach('Wise', '2026-10-05')]);
  const planM3 = (parts = {}) => plan({ banks: [bal('Wise', 'GBP', 30000, '2026-10-05')], ...parts });
  const rest3 = item(await C(ledM3, planM3(), T, H60), mo);
  const stop = (sk) => ({ [sk]: { off: true, by: 'Mika', at: TAP + 60000 } });
  const S1 = await C(ledM3, planM3({ inflows: [pressed(rest3)] }), T, H60);
  const S2 = await C(ledM3, planM3({ inflows: [pressed(rest3)], ser: stop('rev|client m') }), T, H60);
  // … and where the month was partly typed rather than partly paid: £3,000 of Client A's October typed, the other
  // ≈£5,000 marked.
  const typedA = row('n', 'Client A', 3000, '2026-10-15');
  const restA = item(await C(ledA(), planA({ inflows: [typedA] }), T, H60), oct);
  const S3 = await C(ledA(), planA({ inflows: [typedA, pressed(restA)] }), T, H60);
  const S4 = await C(ledA(), planA({ inflows: [typedA, pressed(restA)], ser: stop('rev|client a') }), T, H60);
  same([[rest3.amt, S1.now, S1.marksGbp, S2.now, S2.marksGbp, item(S2, mo).amt, brief(S2, mo), item(S2, 'h|rev|client m|2026-11')], [restA.amt, restA.occ, S3.now, S4.now, S4.marksGbp, item(S4, oct).amt, item(S4, 'n').cash, item(S4, 'h|rev|client a|2026-11')]],
    [[3000, 33000, 3000, 33000, 3000, 3000, ['done', 'mark/', '', 0], null], [5000, { E: 8000, typ: 3000, got: 0 }, 15000, 15000, 5000, 5000, 3000, null]],
    '«Больше не ждём» pressed on November after October\'s remainder was marked received: November is no longer expected, and October\'s mark is worth what it was — the ≈£3,000 left after the part already paid, the ≈£5,000 left after the £3,000 typed — not the whole month. NOW does not move');

  // ---- 5. Months later. Person B's October is marked on the 6th and paid on the 20th, as usual; the statement of
  // the 21st closes it. It must stay closed when October is older than the months occurrences are made for.
  // Each row is uploaded the morning after its date; a ledger for a day holds only what had happened by then.
  const year = (months, day) => months.flatMap((m) => [filed('qa' + m, m + '-28', 8000, 'rev', 'Client A'), filed('qb' + m, m + '-20', -6000, 'cogs', 'Person B')]).filter((r) => r.d < day).map((r) => ({ ...r, at: ms(addDays(r.d, 1) + 'T09:00:00Z') }));
  const upTo = (day) => filed('upto', addDays(day, -1), 0, 'skip', '', { at: ms(day + 'T08:00:00Z') });
  const Q0 = await C(ledger([...year(HALF, T), upTo(T)]), plan({ banks: [bal('Wise', 'GBP', 30000, addDays(T, -1))] }), T, H60);
  const qb = 'h|cogs|person b|2026-10';
  const markB = pressed(item(Q0, qb));
  const months = { '2026-10-22': ['2026-10'], '2026-12-20': ['2026-10', '2026-11'], '2027-03-10': ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'] };
  const seen = [];
  for (const [day, more] of Object.entries(months)) {
    const L = ledger([...year([...HALF, ...more], day), upTo(day)]);
    const banks = [bal('Wise', 'GBP', 30000, addDays(day, -1))];
    const bare = await C(L, plan({ banks }), day, H60);
    const M = await C(L, plan({ banks, team: [markB] }), day, H60);
    seen.push([day, brief(M, qb), M.OUT === bare.OUT, M.END === bare.END, M.now === bare.now]);
  }
  same(seen, Object.keys(months).map((day) => [day, ['done', 'row/cycle', 'qb2026-10', 0], true, true, true]),
    'Person B\'s October, marked on the 6th and closed by the statement of the 21st, is closed on 22 Oct, on 20 Dec and on 10 March alike — closed by its own row, and the plan with the row in it counts what the plan without it counts. It does not open again, «отмечено…, в выписке нет», the day October leaves the months the forecast walks');
  // … and a mark the bank never answered: open for forty-five days, as the design has it, and then a forecast
  // that did not come true — while a typed row marked the same day is owed for as long as it is not answered.
  const silent = (day) => ledger([...year(HALF, day), upTo(day)]);
  const planS = (day) => plan({ banks: [bal('Wise', 'GBP', 30000, addDays(day, -1))], team: [markB], other: [row('rent', 'Studio rent', 700, '2026-10-20', { paid: paid(T) })] });
  const N1 = await C(silent('2026-11-30'), planS('2026-11-30'), '2026-11-30', H60);
  const N2 = await C(silent('2026-12-10'), planS('2026-12-10'), '2026-12-10', H60);
  same([[brief(N1, qb), item(N1, qb).day, brief(N1, 'rent')], [brief(N2, qb), item(N2, qb).day, item(N2, qb).mark.unseen, item(N2, qb).exp, brief(N2, 'rent'), N2.OUT]],
    [[['unseen', '', '', -6000], '2026-11-30', ['unseen', '', '', -700]], [['gone', '', '', 0], '', false, 0, ['unseen', '', '', -700], 700]],
    'marked on 6 Oct for the 20th and never seen in a statement: on 30 Nov, 41 days on, it is open again and counted today; on 10 Dec, 51 days on, it is a forecast that did not come true and is counted nowhere. The typed £700 marked the same day is still asked about');

  // ---- 6. The card of a forecast that is late. Its row ends in the mark now, so the card is the one place left
  // where its amount can be agreed with.
  const quiet = ledger([...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((m, i) => sheet('k' + i, m + '-20', 5000, 'rev', 'Client K')), reach('Wise', '2026-10-05')]);
  const pg = await scene('one press, reviewed', quiet, plan({ banks: [bal('Wise', 'GBP', 10000, '2026-10-05')] }));
  const sep = 'h|rev|client k|2026-09';
  let S = await holds(pg, 'September did not come');
  const lateCard = ['Получено', 'Жду до…', 'Сумма верная', 'В этом месяце не будет', 'Больше не ждём', 'Закрыть', 'Сохранить'];
  await pg.click('#view-today .td-need [data-td-flip="hist"]');
  await pg.click(`#view-today .td-need [data-ed-open="${sep}"]`);
  await pg.waitForSelector(K('row'));
  same([item(S.M, sep).state, await texts(pg, K('row') + '.ed-foot button')], ['late', lateCard], '«Сегодня», «По истории не сошлось» → «Жду до…»: the card of a forecast that is late offers «Получено», «Жду до…» and, still, «Сумма верная»');
  await pg.click(K('row') + '[data-ed-x]');
  await goCash(pg);
  await toMonth(pg, '2026-09');
  same(await pg.$$eval(cs('inflows', sep) + ' button', (l) => l.map((b) => b.textContent.trim())), ['✓ получено', 'ещё'], '«Касса · План», September: the late row ends in its mark and «ещё»');
  await pg.click(cs('inflows', sep) + ' [data-ed-open]');
  same(await texts(pg, '#cs-sec-inflows ' + K('row') + '.ed-foot button'), lateCard, '… and «ещё» opens the same card');
  await pg.click('#cs-sec-inflows ' + K('row') + '[data-ed-do="sure"]');
  S = await holds(pg, '«Сумма верная» on a late forecast', 'cash');
  same([stored(S, sep).sure, stored(S, sep).amt, 'paid' in stored(S, sep), item(S.M, sep).kind, card(S.M, 7).map((c) => c.item)], [true, 5000, false, 'typed', [sep]], '«Сумма верная» on it: the row is the founders\' own £5,000 from then on — a late invoice, asked about in «Нужно решить»');
  await finish(pg);
});

// Pictures, for looking at: asked for with SHOTS=<folder>. They prove nothing; they are how the screen is judged.
if (process.env.SHOTS) await run('looks', 'pictures of «Сегодня» and «Касса»', async () => {
  const dir = process.env.SHOTS;
  const shot = async (pg, name) => { await pg.screenshot({ path: `${dir}/${name}.png`, fullPage: true }); console.log(`      ${dir}/${name}.png`); };
  const led = demoLedger(T);
  const P = demoPlan(T);
  const at = (pl, w, h) => { serve(led, pl); return open('looks', undefined, { w, h }).then(async (pg) => { await pg.waitForSelector('#view-today [data-live="verdict"]'); return pg; }); };
  let pg = await at(P, 1320, 900);
  await shot(pg, 'live-d-today');
  await pg.click('.nav [data-tab="dashboard"]');
  await shot(pg, 'live-d-months');
  await pg.click('.nav [data-tab="today"]');
  await pg.click('#view-today .td-acc summary');
  await pg.click('#view-today .td-days .td-row.td-hist[data-ed-open]');
  await shot(pg, 'live-d-row');
  await pg.click('#view-today .td-kpi');
  await shot(pg, 'live-d-balances');
  await pg.click('#view-today .page-head [data-ed-add]');
  await pg.click(K('add') + '[data-ed-what="inflows"]');
  await shot(pg, 'live-d-add');
  // «Настройки → Прогноз», where the cautious scenario is switched on — and «Сегодня» with it on, to compare.
  await pg.click('.nav [data-tab="settings"]');
  await pg.$eval('#ed-forecast', (e) => e.scrollIntoView({ block: 'center' }));
  await pg.screenshot({ path: `${dir}/live-d-forecast.png` });
  console.log(`      ${dir}/live-d-forecast.png`);
  await pg.setChecked('#ed-forecast [data-ed-set="cautious"]', true);
  await pg.click('.nav [data-tab="today"]');
  await pg.$eval('#toast', (e) => { e.hidden = true; });
  await shot(pg, 'live-d-today-cautious');
  await pg.context().close();
  pg = await at(P, 390, 844);
  await shot(pg, 'live-m-today');
  await pg.click('#view-today .td-need [data-ed-focus="date"]');
  await shot(pg, 'live-m-row');
  await pg.context().close();
  // No balances: the plan as it would arrive from the old Касса.
  const none = JSON.parse(JSON.stringify(P));
  none.banks.forEach((r) => { delete r.asOf; delete r.at; delete r.by; r.legacy = true; });
  for (const [w, h, n] of [[1320, 900, 'd'], [390, 844, 'm']]) { pg = await at(none, w, h); await shot(pg, `live-${n}-v0`); await pg.context().close(); }
  // A minus: the same studio with five thousand less in the bank.
  const minus = JSON.parse(JSON.stringify(P));
  minus.banks[0].amt = 480;
  minus.banks[2].amt = 230;
  for (const [w, h, n] of [[1320, 900, 'd'], [390, 844, 'm']]) { pg = await at(minus, w, h); await shot(pg, `live-${n}-v4`); await pg.context().close(); }
  // «Касса»: the running month, the next one — already filled from history when it is first opened — and the days.
  for (const [w, h, n] of [[1320, 900, 'd'], [390, 844, 'm']]) {
    pg = await at(P, w, h);
    await pg.click('.nav [data-tab="cash"]');
    await pg.waitForSelector('#cs-plan');
    await shot(pg, n === 'd' ? 'live-d-plan-oct' : 'live-m-plan');
    if (n === 'd') { await pg.click('#cs-month [data-cs-mon="1"]'); await shot(pg, 'live-d-plan-nov'); }
    await pg.click('#view-cash [data-cs-view="days"]');
    await pg.waitForSelector('#cs-stmt');
    await pg.click(`#cs-stmt [data-cs-row="${T}"] td:first-child`);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await shot(pg, `live-${n}-days`);
    await pg.context().close();
  }
});

await run('demo', 'the fabricated studio on three different days', async () => {
  for (const day of ['2026-10-06', '2026-10-24', '2026-11-12']) {
    // The studio's ledger carries the moment each statement row was uploaded; its plan is version 2 — every balance
    // typed as of the day the statements reach, and five rows typed two mornings back.
    const L = demoLedger(day);
    const P = demoPlan(day);
    // The same studio as it would arrive from the old Касса: the balances are there, and none of them has a date.
    const before = JSON.parse(JSON.stringify(P));
    before.banks.forEach((r) => { delete r.asOf; delete r.at; delete r.by; r.legacy = true; });
    const old = await C(L, before, day, { H: 60 }, `demo ${day}, balances not confirmed`);
    const M = await C(L, P, day, { H: 60 }, `demo ${day}`);
    const count = (list, f) => Object.entries(list.reduce((o, x) => { o[f(x)] = (o[f(x)] || 0) + 1; return o; }, {})).sort().map(([k, v]) => `${k} ${v}`).join(' · ');
    const money = (v) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
    console.log(`      ${day}: old balances → ${old.verdict.id} (${old.missing.length} without a balance); typed → ${M.verdict.id}`);
    console.log(`        NOW ${money(M.now)}${M.nowApprox ? ' ≈' : ''} as of ${M.nowDate} · IN ${money(M.IN)} (typed ${money(M.inParts.typed)}, history ${money(M.inParts.hist)}, average ${money(M.inParts.avg)}) · OUT ${money(M.OUT)} · END ${money(M.END)}`);
    console.log(`        LOW ${money(M.LOW)} on ${M.LOWDAY} · cautious ${money(M.LOW_C)} on ${M.LOWDAY_C} · LATE ${money(M.LATE)} · month ${money(M.month.M_EXP)} (usual ${money(M.month.blocks.result.usual)})`);
    console.log(`        series ${M.series.length}: ${count(M.series, (s) => (s.regular ? 'regular' : s.stopped ? 'stopped' : 'quiet'))} · averages ${Object.entries(M.avg).map(([b, x]) => `${b} ${money(x.E)}`).join(' · ')}`);
    console.log(`        items ${M.items.length}: ${count(M.items, (it) => it.kind)} — ${count(M.items, (it) => it.state)} · cards ${M.cards.map((c) => c.n).join(' ') || 'none'}`);
    ok(old.v0 && old.missing.length === 5 && !M.v0 && M.now !== null && M.accounts.every((a) => !a.active || a.anchor), `${day}: with the old balances there is no total and five accounts to type; the plan as it stands has every account in use typed`, [old.verdict.id, M.verdict.id, old.missing, M.missing]);
    const reg = M.series.filter((s) => s.regular);
    ok(reg.some((s) => s.sk === 'rev|kestrel bank') && reg.some((s) => s.sk === 'tax|@mika') && reg.some((s) => s.blk === 'cogs') && reg.some((s) => s.blk === 'fixed') && !M.series.some((s) => s.sk === 'rev|quarry works' && s.regular), `${day}: the retainer, the team, the subscriptions and a founder's tax are regular; the client who left four months ago is not`, M.series.map((s) => s.sk + (s.regular ? '' : '!')));
    ok(M.IN > 10000 && M.OUT > 10000 && Math.abs(M.END) < 400000 && M.items.filter((it) => it.kind === 'hist').length > 30 && M.avg.vanya.E > 500, `${day}: the figures are a studio's — IN and OUT in the tens of thousands, history rows by the dozen, founders' draws in the averages`);
    const typed = M.items.filter((it) => it.src === 'row');
    ok(typed.length === 5 && typed.every((it) => it.kind === 'typed') && P.team.length === 0, `${day}: the plan holds five typed rows and none of the regulars — the team, the clients and the subscriptions come from history`, typed.map((it) => [it.id, it.kind]));
    if (day === T) {
      const big = item(M, 'h|rev|meridian labs|2026-10');
      same([M.verdict.id, M.LOWDAY >= '2026-10-24' && M.LOWDAY <= '2026-10-31', M.LOW > 0 && M.LOW < M.cushion, M.nowIsToday, M.nowDate, M.cards.map((c) => c.n), big.kind, big.day, big.cyc, M.LATE], ['v3', true, true, false, '2026-10-04', [4, 7], 'typed', '2026-10-29', '2026-10', 1900],
        '6 Oct: «впритык» — the lowest point is in the last week of October, before the largest client\'s promised payment on the 29th; the money is «на 4 окт»; «Разбор» and one late invoice wait to be decided');
    }
    await taps(`demo ${day}`, L, P, day, 12);
  }
});

console.log('\n' + (errs.length ? 'PAGE ERRORS:\n  ' + errs.join('\n  ') : 'no page errors, no console errors'));
console.log(`${n - failed} of ${n} checks passed` + (failed ? ` — ${failed} FAILED` : ''));
await browser.close();
process.exit(failed || errs.length ? 1 : 0);
