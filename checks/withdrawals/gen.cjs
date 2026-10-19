// Random plans and ledgers around the withdrawals: a seeded generator, so a failure can be run again.
const { ms, filed, inbox, reach, ledger, bal, row, wd, plan3 } = require('./lib.cjs');
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const FOUNDERS = ['mika', 'misha', 'vanya'];
const day = (base, k) => new Date(Date.parse(base + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const T = '2026-10-13';
const T0 = ms('2026-10-01T08:00:00Z');   // plan rows are written around here
// opts: { marks: 'old' | 'none' } - 'old' puts marks without a memory on some withdrawals; news: the decisions of
// 17 October 2026 (`news`); fees: the bank's fees of 19 October 2026 (`fees`) - each by a stream of its own
function make(seed, opts = {}) {
  const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance = (p) => R() < p;
  const banks = [bal('Wise', 'GBP', 60000, day(T, -int(3, 12)))];
  if (chance(0.5)) banks.push(bal('Barclays', 'GBP', 20000, day(T, -int(3, 12))));
  if (chance(0.3)) banks.push(bal('Wise', 'USD', 15000, day(T, -int(3, 12))));
  const div = [], nW = int(2, opts.rich ? 8 : 6);
  for (let i = 0; i < nW; i++) {
    const more = { c0: T0 + int(-24, opts.rich ? -6 : 6) * 864e5 + int(0, 8) * 36e5 };
    if (chance(0.45)) more.whose = pick(FOUNDERS);
    if (chance(0.15)) more.bank = pick(banks).bank;
    if (chance(0.1) && banks.some((b) => b.cur === 'USD')) { more.cur = 'USD'; more.bank = 'Wise'; }
    if (chance(0.08)) more.on = false;
    const amt = pick([500, 1000, 1500, 2000, 3000, 4000, 6000]);
    if (chance(0.3)) { const d = int(1, 28), from = pick(['2026-08', '2026-09', '2026-10']); div.push(row('w' + i, 'Вывод ' + i, amt, from + '-' + String(d).padStart(2, '0'), { blk: 'div', rec: { day: d, from }, ...more })); }
    else div.push(wd('w' + i, amt, day(T, int(-25, 12)), more));
  }
  if (chance(0.3)) div.push(row('pt', 'HMRC Mika', 400, day(T, int(-5, 10)), { blk: 'div', ptax: true, f: 'mika' }));
  const team = chance(0.6) ? [row('t1', 'Person Z', 2000, day(T, int(-6, 8)), { blk: 'cogs' })] : [];
  const inflows = chance(0.6) ? [row('i1', 'Client Q', 5000, day(T, int(-6, 12)), { blk: 'rev' })] : [];
  const tx = [], inb = [], nR = int(3, opts.rich ? 24 : 16);
  for (let i = 0; i < nR; i++) {
    const b = pick(banks), amt = -pick([200, 400, 500, 800, 1000, 1200, 1500, 2000, 2500, 3500]) * (b.cur === 'USD' ? 1 : 1), at = T0 + int(opts.rich ? -8 : -25, 14) * 864e5 + int(0, 20) * 36e5 + i;
    const d = day(T, int(-30, 0)), more = { at, b: b.bank, cur: b.cur };
    const k = R();
    if (k < 0.72) tx.push(filed('f' + i, d, amt, pick(FOUNDERS), '', more));
    else if (k < 0.8) tx.push(filed('f' + i, d, amt, 'other', 'Thing ' + i, more));
    else if (k < 0.86) tx.push(filed('f' + i, d, -amt, pick(FOUNDERS), '', more));   // money back into a founder's block
    else if (k < 0.93) inb.push(inbox('f' + i, d, amt, '', 'TRANSFER ' + i, more));
    else tx.push(filed('f' + i, d, -2000, 'rev', 'Client Q', more));
  }
  banks.forEach((b) => { if (chance(0.7)) tx.push(reach(b.bank, day(T, -int(0, 6)), b.cur, T0 + int(0, 12) * 864e5)); });
  const P = plan3({ banks, div, team, inflows });
  if (opts.marks === 'old') {
    const mark = () => { const on = day(T, -int(0, 9)); const p = { on, at: ms(on + 'T12:00:00Z') + int(0, 6) * 36e5, by: 'Mika' }; if (chance(0.2)) p.amt = pick([300, 800, 1200]); if (chance(0.08)) p.ok = true; return p; };
    P.div.forEach((r) => { if (r.ptax) return; if (r.rec) { if (chance(0.5)) { r.rec.x = { [pick(['2026-09', '2026-10'])]: { paid: mark() } }; } } else if (chance(0.4)) r.paid = mark(); });
    if (team[0] && chance(0.5)) team[0].paid = mark();
    if (chance(0.15) && tx.length) { const r = P.div.find((x) => !x.rec && !x.ptax); if (r) r.notx = [pick(tx).id]; }
    if (chance(0.15) && tx.length) { const r = P.div.find((x) => !x.rec && !x.ptax); if (r) r.tx = [pick(tx).id]; }
  }
  if (opts.news) news(seed, P, tx, banks);
  if (opts.fees) fees(seed, P, tx, banks);
  return { L: ledger(tx, inb), P, R, pick, int, chance };
}
// What the owner decided on 17 October 2026, put into a plan and its table by a stream of its own - so that a seed
// makes the same plan as before but for these (docs/handoff.md, the entry of that day):
//  · withdrawals named after a founder and nobody's by choice (N) - now and then with «общий» chosen by hand;
//  · records (W1): a founder's withdrawal written AFTER the statement that holds it was uploaded, marked «Оплачено» -
//    one row of its sum (a fee folded in, or a pound short), or two or three that make it, near its date; now and
//    then a row more of the same founder near it, which can make two sets fit (none is then taken);
//  · moves to a founder's Daily or Monthly account (D): by the statement's words, Russian or English, or by the label
//    alone; before October and after it; a card payment under the label «daily», which is no move; moves back from
//    such an account, and a direct debit or standing order under the label, which is no move either.
const SAY = { mika: ['Mika', 'Мика'], misha: ['Misha', 'Миша'], vanya: ['Vanya', 'Ваня'] };
function news(seed, P, tx, banks) {
  const R = rng(seed * 7 + 1017), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance = (p) => R() < p;
  const BY = 'Mika', at = (d, h) => ms(d + 'T00:00:00Z') + h * 36e5;
  // N
  P.div.forEach((r) => { if (r.ptax || r.whose || !chance(0.35)) return; const k = pick(FOUNDERS), n = pick(SAY[k]); r.name = pick([n, n.toUpperCase(), ' ' + n + ' ', n.toLowerCase()]); if (chance(0.15)) r.whose = ''; });
  // W1
  for (let i = 0, n = int(0, 3); i < n; i++) {
    const k = pick(FOUNDERS), d = day(T, -int(1, 14)), amt = pick([350, 900, 1250, 2400]), c0 = at(T, -int(1, 4) * 24 + 8), b = pick(banks), more = { b: b.bank, cur: b.cur, at: c0 - int(1, 72) * 36e5 };
    const parts = chance(0.55) ? [amt + pick([0, 0, 3.5, -1, 12])] : chance(0.5) ? [Math.round(amt * 0.17 * 100) / 100, Math.round(amt * 0.83 * 100) / 100] : [Math.round(amt * 0.1 * 100) / 100, Math.round(amt * 0.3 * 100) / 100, Math.round(amt * 0.6 * 100) / 100];
    parts.forEach((v, j) => tx.push(filed('rec' + i + '-' + j, day(d, int(-3, 3)), -v * (b.cur === 'USD' ? 1.35 : 1), k, '', more)));
    if (chance(0.25)) tx.push(filed('rec' + i + '-x', day(d, int(-5, 5)), -pick([40, 120, amt * 0.17]) * (b.cur === 'USD' ? 1.35 : 1), k, '', more));
    const name = chance(0.5) ? pick(SAY[k]) : 'Вывод ' + i, own = name.startsWith('Вывод') ? { whose: k } : {};
    P.div.push(wd('rec' + i, amt, d, { name, c0, m: { t: c0, by: BY }, paid: { on: chance(0.7) ? d : T, at: c0 + 600e3, by: BY }, ...own }));
  }
  // D
  for (let i = 0, n = int(0, 3); i < n; i++) {
    const k = pick(FOUNDERS), d = day(T, -int(0, 25)), v = pick([50, 120, 300]), kind = pick(['Daily', 'Monthly']), b = banks[0];
    const r = filed('daily' + i, d, -v * (b.cur === 'USD' ? 1.35 : 1), k, pick([kind.toLowerCase(), '', 'daily']), { b: b.bank, cur: b.cur, at: at(T, -int(0, 20) * 24) });
    r.o.t = pick([`${v},00 GBP перемещено сюда: ${pick(SAY[k])} ${kind}`, `Moved ${v}.00 GBP to ${SAY[k][0]} ${kind}`, r.l || 'daily', `Card transaction of ${v}.00 GBP issued by Lunch Place`]);
    tx.push(r);
  }
  // (drawn last, so that what is drawn above is as it was) A move back from a Daily or Monthly account - internal from
  // October whichever way the money went, filed in the founder's block as money coming back - and a direct debit or
  // standing order under «daily»/«monthly», which is the founder's own payment whatever its label (the review of
  // 17 October 2026).
  for (let i = 0, n = int(0, 2); i < n; i++) {
    const k = pick(FOUNDERS), d = day(T, -int(0, 25)), v = pick([30, 80]), b = banks[0], back = chance(0.6);
    const r = filed('dback' + i, d, (back ? v : -v) * (b.cur === 'USD' ? 1.35 : 1), k, pick(['daily', 'monthly']), { b: b.bank, cur: b.cur, at: at(T, -int(0, 20) * 24) });
    r.o.t = back ? pick([`Moved ${v}.00 GBP from ${SAY[k][0]} Daily`, `${v},00 GBP перемещено отсюда: ${SAY[k][1]} Monthly`]) : pick(['Direct debit to Fitness Club', 'STANDING ORDER TO FLAT 4']);
    tx.push(r);
  }
}
// What the owner decided on 19 October 2026 (F: a bank's fee is a line of its own, and no fee is a founder's money),
// put into a table by a stream of its own - drawn after `news`, so that a seed makes the same plan and the same rows
// as before but for these:
//  · now and then a founder's payment out from October, or another cost, says a fee Wise folded into it -
//    «(fee: 2.95 GBP)» at the end of its text: the amount is as it was, the fee inside it; about half of them, and of
//    the team's transfers below, with a decimal comma, «(fee: 2,95 GBP)», as Wise's statement in Russian writes it
//    (19 October 2026, found on the test stand: the page read that comma as a thousands mark) - chosen by the row's id,
//    with no draw of its own, so a seed makes the same plan and the same rows as before but for the comma;
//  · a record's row that came to a little over the record's sum (`news`: «a fee folded in») says, most of the time,
//    that the over WAS the fee - so that the record and its row meet without it;
//  · moves to a Daily account and card payments say one too (a move's fee is a cost; the move is still no taking);
//  · and now and then a fee row of its own is filed - «Wise Charges for: …», «Комиссия за …» - in a founder's block or
//    as a cost: a fee, and nothing else - no taking, no row outside the plan;
//  · (the review of 19 October 2026; drawn last, and only where the plan itself is handed over) now and then a line of
//    the team and the transfer that pays it with Wise's fee inside - the line written at the amount that left the bank,
//    as the sheet and «как в прошлый раз» say it, or at what the person got: a line is closed by either and paid by
//    the whole, so it stands as it does with the fee's words taken out (G).
// (a fee's figure as the statement writes it: with a dot, or - for about half the ids - with Wise's Russian comma)
const fig = (fee, id) => { const s = fee.toFixed(2); return [...String(id)].reduce((h, c) => h + c.charCodeAt(0), 0) % 2 ? s.replace('.', ',') : s; };
function fees(seed, P, tx, banks) {
  const R = rng(seed * 13 + 2027), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance = (p) => R() < p;
  const recAmt = Object.fromEntries((P.div || []).filter((r) => /^rec\d+$/.test(String(r.id))).map((r) => [String(r.id), +r.amt]));
  tx.forEach((r) => {
    if (!r.o || !(+r.o.a < 0) || r.d < '2026-10-01' || r.c === 'skip' || r.c === 'rev') return;
    const cur = r.o.cur || 'GBP', k = cur === 'USD' ? 1.35 : 1, a = Math.abs(+r.o.a), m = /^(rec\d+)-\d+$/.exec(String(r.id));
    const over = m && recAmt[m[1]] != null ? Math.round((a / k - recAmt[m[1]]) * k * 100) / 100 : 0;
    let fee = 0;
    if (over > 0 && over < a / 3 && chance(0.7)) fee = over;
    else if (chance(0.35)) fee = Math.min(pick([0.35, 0.8, 1.6, 2.95, 3.5, 4.15, 12]), Math.round(a * 0.2 * 100) / 100);
    if (fee > 0) r.o.t = (r.o.t ? r.o.t + ' ' : 'Sent money to somebody ') + `(fee: ${fig(fee, r.id)} ${cur})`;
  });
  for (let i = 0, n = chance(0.4) ? int(1, 2) : 0; i < n; i++) {
    const b = banks[0], r = filed('fee' + i, day(T, -int(0, 12)), -pick([0.4, 2.5, 9]) * (b.cur === 'USD' ? 1.35 : 1), pick(FOUNDERS.concat(['other', 'fixed'])), '', { b: b.bank, cur: b.cur, at: T0 + int(0, 12) * 864e5 + 77 + i });
    r.o.t = pick(['Wise Charges for: TRANSFER-' + (100 + i), 'Комиссия за перевод по документу № ' + (10 + i)]);
    tx.push(r);
  }
  if (!Array.isArray(P.team)) return;
  for (let i = 0, n = chance(0.5) ? int(1, 2) : 0; i < n; i++) {
    const b = banks[0], [v, fee] = pick([[52.5, 2.5], [150, 5], [1000, 30], [300, 0.9]]), d = day(T, -int(0, 12)), name = 'Person F' + i;
    P.team.push(row('fl' + i, name, chance(0.7) ? v : v - fee, d, { blk: 'cogs', bank: b.bank, cur: b.cur, c0: T0 - 864e5 }));
    const r = filed('fr' + i, d, -v, 'cogs', name, { b: b.bank, cur: b.cur, at: T0 + int(1, 12) * 864e5 + 99 + i });
    r.o.t = `Sent money to ${name} (fee: ${fig(fee, r.id)} ${b.cur})`;
    tx.push(r);
  }
}
module.exports = { make, rng, FOUNDERS, day, T, T0, fees };
