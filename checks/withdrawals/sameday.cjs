// The rule of 13 October 2026 for the takings of a balance's own day: «a change to another line of the plan moves no
// row dated on the day a balance was typed for into that balance or out of it». Lives of a plan made for it: an
// account that stands on a typed balance - for today, or for yesterday - sometimes with a second bank's account or
// a dollar account of the same bank beside it, typed for a day of its own; withdrawals around that day, some ticked in
// «Что из этого уже прошло?» (a mark made a moment before the balance), some marked «Оплачено» after it, founders'
// rows dated on the balance's day and around it; then statements come, the table is changed by hand, lines are
// marked, a balance is typed again - with ticks - and the plan is changed the page's way (see, change, keep). What is
// held at every step:
//   F. A plan that holds no memory is read as the page read it before the rule (dev.cjs), byte for byte but for
//      item.saw and item.sawDay.
//   S. A change made on ANOTHER line - one that is not a marked withdrawal, reaches none and takes no mark off -
//      moves neither «Денег сейчас», nor the marks' sum, nor what any account counts after its balance. Not asked
//      where a marked withdrawal holds a row of another ACCOUNT than its own - another bank's, or another currency's
//      of its own bank (the known limit: such a mark may still wait for a statement to pass its day while the row
//      has come, and whether the row stands for the mark then goes by whether the withdrawal is full); those are
//      counted.
//   D. No row gives the withdrawals more than its sum; none holds more than its own sum or than its rows' worth.
//   K. The seeing and the keeping around no change at all move no figure, and write nothing into a plan without a
//      memory.
// The counters at the end say how often each was looked at, how often a memory of a balance's day was in the plan,
// and how often the page of before (ON=dev) would have moved a figure - there S must fail.
// usage: ENGINES=<folder> [STEPS=n] [ON=dev] node checks/withdrawals/sameday.cjs <lives>
const SEEDS = +process.argv[2] || 400, STEPS = +process.env.STEPS || 8;
const { ms, ledger, clone, mk, filed, reach, bal, wd, row, plan3, engines, bare } = require('./lib.cjs');
const { NEW, DEV } = engines(), Live = process.env.ON === 'dev' ? DEV : NEW;
const { rng, FOUNDERS, day } = require('./gen.cjs');
const { C, wr, page, see, keep } = mk(Live), d = mk(DEV);
const T = '2026-10-13', BY = 'Mika', C0 = ms('2026-10-01T08:00:00Z');
const stat = {}, bad = {}, up = (k, n = 1) => { stat[k] = (stat[k] || 0) + n; };
const fail = (k, seed, more) => { (bad[k] = bad[k] || []).push(seed); if (bad[k].length <= 2) console.log('FAIL', k, 'seed', seed, more || ''); };
const wdsOf = (M) => M.items.filter((it) => it.wd && it.date);
const strip = (M) => { const Q = clone(M); bare(Q); return JSON.stringify(Q); };
const flat = (M) => { const Q = clone(M); bare(Q).items.forEach((it) => { if (it.wd) { delete it.wd.from; delete it.wd.to; } }); return JSON.stringify(Q); };
const hasMem = (P) => JSON.stringify(P).includes('"saw"');
const dayMem = (P) => /"rows":\[[^\]]*\[[^\]]*,[^\]]*,[^\]]*\]/.test(JSON.stringify(P.div));   // a row of a memory written with its balance's moment
const figs = (M) => JSON.stringify([M.now, M.marksGbp].concat(M.accounts.map((a) => [a.key, a.after, a.same])));
const keyOf = (it) => String(it.occ ? it.occ.chain : it.row || it.id) + '|' + (it.occ ? it.occ.ym : String(it.date).slice(0, 7)) + '|' + (it.mark ? it.mark.at + '|' + it.mark.on : '');
const self = (it) => JSON.stringify([it.date, it.amt, it.cur, it.whose, it.on, it.bank]);
const abroad = (M, L) => { const acct = Object.fromEntries(L.tx.map((r) => [String(r.id), r.b + '|' + ((r.o && r.o.cur) || 'GBP')])); return wdsOf(M).some((it) => it.mark && it.rows.some((id) => acct[id] && acct[id] !== it.bank + '|' + it.cur)); };
const conserve = (M, L) => {
  const amt = Object.fromEntries(L.tx.concat(L.inbox).map((r) => [String(r.id), Math.abs(r.a)])), all = wdsOf(M), ws = all.filter((it) => it.cur === 'GBP');
  if (ws.some((it) => it.wd.got > it.rows.reduce((s, id) => s + (amt[id] || 0), 0) + 0.011)) return 'a withdrawal holds more than its rows';
  if (all.some((it) => it.wd.got > it.amt + 0.011)) return 'a withdrawal holds more than its sum';
  if (all.every((it) => it.cur === 'GBP')) { const rows = new Set(); ws.forEach((it) => it.rows.forEach((id) => rows.add(id))); const tot = ws.reduce((s, it) => s + it.wd.got, 0), cap = [...rows].reduce((s, id) => s + (amt[id] || 0), 0); if (tot > cap + 0.011) return `the withdrawals hold ${tot} of rows worth ${cap}`; }
  return '';
};
function make(seed) {
  const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance = (p) => R() < p;
  // the balance: typed this morning - for today («на сейчас»), or for yesterday
  const asOf = chance(0.6) ? T : day(T, -1), AT = ms(T + 'T09:00:00Z'), UP = ms(T + 'T17:00:00Z');
  const banks = [bal('Wise', 'GBP', 60000, asOf, { at: AT })];
  if (chance(0.3)) banks.push(bal('Barclays', 'GBP', 20000, chance(0.5) ? asOf : day(T, -int(2, 6)), { at: AT - 5 }));
  // a dollar account of the same bank, typed in the same save or two days before, for a day of its own
  const usd = chance(0.25); if (usd) banks.push(bal('Wise', 'USD', 13500, chance(0.4) ? asOf : day(T, -int(1, 4)), { at: chance(0.5) ? AT : AT - 2 * 864e5 }));
  const sums = [1000, 1500, 2000, 3000], div = [], nW = int(2, 6);
  for (let i = 0; i < nW; i++) {
    const more = { c0: C0 + int(-10, 5) * 864e5 + i };
    if (chance(0.45)) more.whose = pick(FOUNDERS);
    if (chance(0.12) && banks.some((b) => b.bank === 'Barclays')) more.bank = 'Barclays';
    if (usd && chance(0.08)) more.cur = 'USD';
    const date = day(asOf, int(-9, 9)), amt = pick(sums);
    // a tick in «Что из этого уже прошло?» is a mark made a moment before the balance; «Оплачено» after it is later
    const k = R(), paid = date <= asOf && k < 0.4 ? { on: chance(0.7) ? asOf : date, at: AT - 1, by: BY } : k < 0.6 ? { on: chance(0.5) ? T : asOf, at: AT + int(1, 4) * 36e5, by: BY } : k < 0.66 ? { on: day(asOf, -int(1, 5)), at: AT - int(1, 5) * 864e5, by: BY } : null;
    if (paid && chance(0.12)) paid.amt = Math.round(amt * 0.6);
    if (chance(0.2)) { const dd = +date.slice(8), from = date.slice(0, 7) === '2026-10' ? pick(['2026-09', '2026-10']) : date.slice(0, 7); const r = row('w' + i, 'Вывод ' + i, amt, date, { blk: 'div', rec: { day: dd, from }, ...more }); if (paid) r.rec.x = { [date.slice(0, 7)]: { paid } }; div.push(r); }
    else div.push(wd('w' + i, amt, date, paid ? { ...more, paid } : more));
  }
  const tx = [], nR = int(2, 9);
  for (let i = 0; i < nR; i++) {
    const k = R(), b = banks.some((x) => x.bank === 'Barclays') && chance(0.15) ? 'Barclays' : 'Wise', cur = usd && b === 'Wise' && chance(0.3) ? 'USD' : 'GBP';
    const d0 = k < 0.55 ? (cur === 'USD' ? banks.find((x) => x.cur === 'USD').asOf : asOf) : day(asOf, int(-8, k < 0.9 ? 0 : 1));
    // most rows come with the evening's statement; some were on the page before the balance was typed
    const at = chance(0.75) ? UP + i : AT - int(1, 6) * 864e5 + i, amt = -pick([500, 1000, 1500, 2000, 3000]) * (cur === 'USD' ? 1.35 : 1);
    tx.push(chance(0.9) ? filed('f' + i, d0, amt, pick(FOUNDERS), '', { at, b, cur }) : filed('f' + i, d0, amt, 'other', 'Thing ' + i, { at, b, cur }));
  }
  if (chance(0.6)) tx.push(reach('Wise', chance(0.7) ? T : asOf, 'GBP', UP + 50));
  return { L: ledger(tx, []), P: plan3({ banks, div }), R, pick, int, chance, asOf, UP };
}
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = make(seed), { pick, int, chance } = g;
  // the table as it was uploaded: what was on the page before the balance, then the evening's rows in batches
  const allTx = g.L.tx.slice().sort((a, b) => a.at - b.at);
  let shown = allTx.filter((r) => r.at < g.UP).length + (chance(0.5) ? int(1, 3) : 0), tx = allTx.slice(0, shown), now = g.UP + 1000;
  let P = g.P, L = ledger(tx, []), M = C(L, P, T);
  up('lives');
  const check = (tag) => {
    M = C(L, P, T);
    const c = conserve(M, L); if (c) fail('D: ' + c + ' (' + tag + ')', seed);
    if (!hasMem(P)) { up('F'); if (strip(M) !== JSON.stringify(d.C(L, P, T))) fail('F: not the model of before with no memory (' + tag + ')', seed); } else { up('steps with a memory'); if (dayMem(P)) up('steps with a memory of a balance\'s day'); }
  };
  check('start');
  for (let step = 0; step < STEPS; step++) {
    const k = g.R(); now += int(1, 50) * 6e4;
    if (k < 0.2 && shown < allTx.length) {    // the rest of the statement comes
      const n = int(1, 3); tx = tx.concat(allTx.slice(shown, shown + n)); shown += n; L = ledger(tx, []); up('uploads'); check('upload');
    } else if (k < 0.29) {                     // the table changed by hand: a row deleted, filed under another founder, read in again
      const cand = tx.filter((r) => r.c !== 'skip'); if (!cand.length) continue; const r = pick(cand), op = int(0, 3);
      const put = (r2) => { tx = tx.flatMap((x) => (x === r ? (r2 ? [r2] : []) : [x])); };
      if (op === 0) put(null); else if (op === 1) put({ ...r, c: pick(FOUNDERS), l: '' }); else if (op === 2) put({ ...r, id: r.id + '-again', at: now }); else { put(null); tx = tx.concat([{ ...r, at: now }]); }
      L = ledger(tx, []); up('table by hand'); check('table');
    } else if (k < 0.36) {                     // «Оплачено» on an open withdrawal
      const open = wdsOf(M).filter((it) => it.open && it.on); if (!open.length) continue;
      P = wr(P, 'mark', pick(open), chance(0.5) ? T : g.asOf, now, BY); up('marks'); check('mark');
    } else if (k < 0.42) {                     // a balance typed again, as the sheet does it: the ticked lines are marked a moment before
      const open = wdsOf(M).filter((it) => it.open && it.on && it.date <= T), ticks = open.filter(() => chance(0.4)), asOf = chance(0.7) ? T : g.asOf;
      P = page(P, (X) => { const b = pick(X.banks); b.amt = b.amt - 100; b.asOf = asOf; b.at = now; ticks.forEach((it) => Live.write.mark(X, it, asOf, now - 1, BY)); return X; }); up('balances typed again'); check('balance');
    } else {                                   // a change to a line of the plan
      const ws = wdsOf(M).filter((it) => it.date >= day(T, -40)); if (!ws.length) continue; const it = pick(ws), op = int(0, 10);
      const before = M, marked = wdsOf(M).filter((x) => x.mark && x.id !== it.id).map((x) => [keyOf(x), self(x)]);
      let Q = P, marks = false;
      try {
        if (op <= 1) Q = wr(P, 'set', it, { whose: pick(FOUNDERS.concat([''])) }, now, BY);
        else if (op === 2) Q = wr(P, 'del', it);
        else if (op === 3) Q = wr(P, it.on ? 'off' : 'on', it);
        else if (op === 4) Q = wr(P, 'set', it, { date: day(it.date, int(-9, 9)) }, now, BY);
        else if (op === 5) Q = wr(P, 'set', it, { amt: pick([500, 1500, 3000, 5000]) }, now, BY);
        else if (op === 6) Q = it.src === 'row' ? wr(P, 'tick', it) : it.src === 'occ' ? wr(P, 'untick', it) : P;
        else if (op === 7) Q = page(P, (X) => { X.div.push(wd('n' + seed + '-' + step, pick([1000, 2000, 3000]), day(T, int(-8, 8)), Object.assign({ c0: chance(0.5) ? C0 : now }, chance(0.4) ? { whose: pick(FOUNDERS) } : {}))); return X; });
        else if (op === 8) { if (it.mark) { Q = wr(P, 'unmark', it); marks = true; } }
        else if (op === 9) Q = it.src === 'occ' ? wr(P, 'onward', it, { amt: pick([700, 2500]) }, 'on' + seed + '-' + step, now, BY) : P;
        else Q = wr(P, 'set', it, { name: 'Другое имя' }, now, BY);
      } catch (e) { continue; }
      if (JSON.stringify(Q) === JSON.stringify(P)) { up('changes that changed nothing'); continue; }
      P = Q; up('changes'); check('change ' + op);
      const own = !!it.mark || marked.some(([key, was]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); return !x || self(x) !== was; });
      if (!own && !marks && (abroad(before, L) || abroad(M, L))) up('S, not asked: a marked withdrawal holds a row of another account');
      else if (!own && !marks) { up('S'); if (figs(M) !== figs(before)) fail('S: a change to another line moved the figures (op ' + op + ')', seed, figs(before) + ' -> ' + figs(M)); else if (hasMem(P)) up('S, held by a memory'); }
    }
    // K. see and keep around nothing
    { const had = hasMem(P), Q = keep(clone(P), see(P)), M2 = C(L, Q, T); C(L, P, T); up('K'); if (flat(M2) !== flat(M)) fail('K: see and keep alone moved the model', seed); if (!had && hasMem(Q)) fail('K: see and keep alone wrote a memory', seed); }
  }
  if (dayMem(P)) up('lives that end with a memory of a balance\'s day');
}
console.log(process.env.ON === 'dev' ? 'dev' : 'new', JSON.stringify(stat));
const ks = Object.keys(bad); if (ks.length) { ks.forEach((k) => console.log(bad[k].length, 'x', k, bad[k].slice(0, 12).join(','))); process.exit(1); } else console.log('every property held');
