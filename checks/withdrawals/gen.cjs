// Random plans and ledgers around the withdrawals: a seeded generator, so a failure can be run again.
const { ms, filed, inbox, reach, ledger, bal, row, wd, plan3 } = require('./lib.cjs');
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const FOUNDERS = ['mika', 'misha', 'vanya'];
const day = (base, k) => new Date(Date.parse(base + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const T = '2026-10-13';
const T0 = ms('2026-10-01T08:00:00Z');   // plan rows are written around here
// opts: { marks: 'old' | 'none' } - 'old' puts marks without a memory on some withdrawals
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
  return { L: ledger(tx, inb), P, R, pick, int, chance };
}
module.exports = { make, rng, FOUNDERS, day, T, T0 };
