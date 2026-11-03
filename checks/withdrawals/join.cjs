// Question 18, «А» (3 November 2026): a sum or a day «{Декабрь} и дальше» is dated on the one stored row
// (rec.since[month].amt / .day - and whose a withdrawal is, and «к чему относится», when they change with it) and
// no longer splits the row into a chain; a chain a plan already holds is made one row as the plan is opened
// (Live.join). What is held, on random lives of plans with a repeat in every list:
//   R. A plan the page writes now, with rec.since in it, is counted as develop counts the same plan stored the way
//      develop stores it - a chain of rows, one from each month an entry names (lib.cjs, `unsince`): the whole model,
//      byte for byte, with the parts' ids read as the row's.
//   O. A plan develop wrote - its chains among it - is counted by the page now exactly as develop counts it, byte
//      for byte: the page still reads a chain as before.
//   J. That plan made one (Live.join) is counted as develop counts the chain: the whole model, byte for byte, but
//      for the stored row a part's months name (the head's now: `row`; their own names stay - the part's id is kept
//      as rec.since[month].iid, since a month's name breaks a tie between two lines of a day) and the first and last month a month's
//      card names (occ.from, occ.to - the line's now, not the part's), and the order of what goes by those names
//      (the cards of «Нужно решить» that ask about one sum, the lines of one day in a month's block, the months
//      among the items, the accounts a line names before a balance is typed). Every figure, every card and every
//      line's state is asked.
//   Z. Live.join leaves no chain it could make one; one it leaves is counted (`left`), never changed.
//   V. «Вернуть» (the repeat goes on again) on a line whose last part was ended does on the plan made one what it
//      does on develop's chain: what the part said of months after its end comes back with it (the review of
//      3 November 2026: join had dropped it, and February's own sum and March switched off came back as the line's).
// The lives of R are written by the page's writers now; those of O and J by develop's (99d7a46 - which splits).
// usage: ENGINES=<folder with new.cjs, dev.cjs, pre.cjs and devnow.cjs (develop at 99d7a46)> node checks/withdrawals/join.cjs <lives> [steps]
const fs = require('fs'), path = require('path');
const { ledger, row, wd, clone, mk, filed, unsince, ms } = require('./lib.cjs');
const { make, rng, FOUNDERS, day, T } = require('./gen.cjs');
const dir = process.env.ENGINES;
if (!dir || !fs.existsSync(path.join(dir, 'devnow.cjs'))) { console.error('ENGINES=<folder> with devnow.cjs: develop before question 18 - see README.md'); process.exit(2); }
const NEW = require(path.resolve(dir, 'new.cjs')).Live, DN = require(path.resolve(dir, 'devnow.cjs')).Live;
const SEEDS = +process.argv[2] || 200, STEPS = +process.argv[3] || 14, BY = 'Mika';
const stat = {}, bad = {}, up = (k, n = 1) => { stat[k] = (stat[k] || 0) + n; };
const fail = (k, seed, more) => { (bad[k] = bad[k] || []).push(seed); if (bad[k].length <= 2) console.log('FAIL', k, 'seed', seed, more || ''); };
const C = (Live, L, P) => JSON.parse(JSON.stringify(Live.compute(clone(L), clone(P), T, { H: 60 })));
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v));
// (a model read as the line's: each part's row the chain's, no first and last month on a month's card, a client's rows once)
const asLine = (M, P) => {
  let s = JSON.stringify(M);
  ['inflows', 'team', 'taxes', 'other', 'div'].forEach((k) => (P[k] || []).forEach((r) => { if (r && r.rec && r.rec.chain != null && String(r.rec.chain) !== String(r.id)) {
    const a = String(r.id), b = String(r.rec.chain); s = s.split('"' + a + '"').join('"' + b + '"'); } }));
  const R = JSON.parse(s);
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.occ && typeof o.occ === 'object' && o.occ.chain != null) { delete o.occ.from; delete o.occ.to; } Object.values(o).forEach(walk); } };
  walk(R); (R.clients || []).forEach((c) => { if (Array.isArray(c.rows)) c.rows = [...new Set(c.rows)]; });
  // (what is put in order by the names of the months - the cards of one sum, the lines of one day in a month's
  // block - and the months themselves, in the order of their stored rows: the head's months are its own now)
  const by = (a, b) => (canon(a) < canon(b) ? -1 : canon(a) > canon(b) ? 1 : 0);
  const of = (f) => (a, b) => (String(a[f]) < String(b[f]) ? -1 : String(a[f]) > String(b[f]) ? 1 : 0), all = (o, f) => o.every((x) => x && typeof x === 'object' && typeof x[f] === 'string');
  const sorts = (o) => { if (Array.isArray(o)) { o.forEach(sorts); if (!o.length) return; if (o.every((x) => typeof x === 'string')) o.sort(); else if (all(o, 'id')) o.sort(of('id')); else if (all(o, 'key')) o.sort(of('key')); }
    else if (o && typeof o === 'object') Object.values(o).forEach(sorts); };
  sorts(R); if (Array.isArray(R.cards)) R.cards.sort(by);
  return R;
};
// (develop, handed a plan with rec.since as develop stores it - the model read back as the row's)
const devOf = (L, P) => { const u = unsince(P); if (!u) return C(DN, L, P); const M = C(DN, L, u.Q);
  const R = JSON.parse(JSON.stringify(M).replace(/~since~\d{4}-(0[1-9]|1[0-2])/g, ''));
  (R.items || []).forEach((it) => { const o = u.rows[String(it.row)]; if (o && it.occ) { it.occ.from = o.from; it.occ.to = o.to; } });
  (R.clients || []).forEach((c) => { if (Array.isArray(c.rows)) c.rows = [...new Set(c.rows)]; }); return R; };
const chains = (P) => ['inflows', 'team', 'taxes', 'other', 'div'].reduce((n, k) => n + (P[k] || []).filter((r) => r && r.rec && r.rec.chain != null).length, 0);
// A plan with a repeat in every list, on top of the made-up withdrawals of gen.cjs; and statements for some of them.
const planOf = (g, R) => {
  const P = clone(g.P), int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), m0 = ['2026-08', '2026-09', '2026-10'][int(0, 2)];
  const rep = (id, name, amt, d, more) => row(id, name, amt, m0 + '-' + String(d).padStart(2, '0'), Object.assign({ rec: { day: d, from: m0 } }, more));
  P.inflows.push(rep('i1', 'Client A', 3000 + 100 * int(0, 9), int(1, 28), { vat: R() < 0.5, blk: 'rev' }));
  P.team.push(rep('t1', 'Person B', 6000, 20, { blk: 'cogs' }), rep('t2', 'Person C', 2500, int(1, 28), { blk: 'cogs', bank: 'Barclays' }));
  P.taxes.push(rep('x1', 'PAYE', 700, 19, { blk: 'tax', of: false }));
  P.other.push(rep('o1', 'Figma', 40, 3, { blk: 'fixed', sub: true }), row('o2', 'Lamp', 90, day(T, int(-30, 20)), { blk: 'other' }));
  return P;
};
const payments = (g, R, L) => { const tx = L.tx.slice(), int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  ['2026-08', '2026-09', '2026-10'].forEach((m, i) => { if (R() < 0.7) tx.push(filed('pB' + i, m + '-' + String(int(18, 23)), -6000, 'cogs', R() < 0.3 ? 'Person BB' : 'Person B', { at: ms(m + '-25T09:00:00Z') }));
    if (R() < 0.6) tx.push(filed('pA' + i, m + '-' + String(int(3, 9)).padStart(2, '0'), 3600, 'rev', 'Client A', { at: ms(m + '-25T09:00:00Z') })); });
  return ledger(tx, L.inbox); };
const NAMES = ['Person BB', 'Другое имя', 'Vanya', 'Client AA', 'HMRC Mika'], BANKS = ['Wise', 'Barclays', 'Revolut'];
// One step of a life, by the writers of `Live`: a change to a line the page's way (see, change, keep), on a month
// of a repeat or a row of its own.
const step = (Live, w, P, L, R, seed, i, now) => {
  const M = C(Live, L, P), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const its = M.items.filter((it) => it.src === 'occ' || it.src === 'row').filter((it) => (it.occ ? it.occ.ym : String(it.date).slice(0, 7)) <= '2027-02');
  if (!its.length) return P; const it = pick(its), occ = it.src === 'occ', op = int(0, 17), id = 's' + seed + '-' + i;
  const later = () => { const v = {}; const n = int(1, 3); for (let q = 0; q < n; q++) { const f = pick(['amt', 'date', 'name', 'bank', 'cur', 'vat', 'whose', 'of']);
    if (f === 'amt') v.amt = pick([500, 2500, 6500, 0]); else if (f === 'date') v.date = (it.occ ? it.occ.ym : String(it.date).slice(0, 7)) + '-' + String(int(1, 28)).padStart(2, '0');
    else if (f === 'name') v.name = pick(NAMES); else if (f === 'bank') v.bank = pick(BANKS); else if (f === 'cur') v.cur = pick(['GBP', 'USD']);
    else if (f === 'vat') v.vat = R() < 0.5; else if (f === 'whose') v.whose = pick(FOUNDERS.concat(['']));
    else v.of = R() < 0.5 ? false : { r: 'vat', p: '2026-Q4', part: R() < 0.3 }; } return v; };
  try {
    if (op <= 4) return occ ? w.wr(P, 'onward', it, later(), id, now, BY) : P;
    if (op === 5) return w.wr(P, 'set', it, { name: pick(NAMES) }, now, BY);
    if (op === 6) return w.wr(P, 'set', it, { amt: pick([100, 900, 6200]) }, now, BY);
    if (op === 7) return w.wr(P, 'set', it, { date: day(it.date || T, int(-9, 9)) }, now, BY);
    if (op === 8) return w.wr(P, 'set', it, { bank: pick(BANKS) }, now, BY);
    if (op === 9) return occ ? w.wr(P, 'untick', it) : w.wr(P, 'tick', it);
    if (op === 10) return occ ? w.wr(P, 'end', it) : P;
    if (op === 11) return w.wr(P, it.on ? 'off' : 'on', it);
    if (op === 12) return it.mark ? w.wr(P, 'unmark', it) : w.wr(P, 'mark', it, day(T, -int(0, 3)), now, BY);
    if (op === 13) return occ ? w.wr(P, 'resume', it) : P;
    if (op === 14) return occ && R() < 0.5 ? w.wr(P, 'stop', it) : w.wr(P, 'partial', it, Math.round(it.amt * 0.6), id, now, BY, day(T, -int(0, 3)), day(T, int(1, 40)));
    if (op === 15) return w.wr(P, 'set', it, { whose: pick(FOUNDERS.concat([''])) }, now, BY);
    if (op === 16) return it.list === 'taxes' ? w.wr(P, 'set', it, { of: R() < 0.5 ? false : { r: 'vat', p: '2026-Q4' } }, now, BY) : P;
    return occ && it.done && it.done.got ? w.wr(P, 'same', it, id, now, BY) : P;
  } catch (e) { up('steps that threw'); return P; }
};
const wNew = mk(NEW), wDev = mk(DN);
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = make(seed, { marks: seed % 3 === 0 ? 'old' : 'none', rich: true, news: seed % 2 === 0 }), R = rng(seed * 7 + 3), now0 = ms(T + 'T09:00:00Z');
  const P0 = planOf(g, R), L = payments(g, R, g.L);
  up('lives');
  // R: the page's writers now; develop handed the plan as it would store it
  let P = clone(P0);
  for (let i = 0; i < STEPS; i++) { P = step(NEW, wNew, P, L, R, seed, i, now0 + i * 6e4); up('R steps');
    if (chains(P)) fail('R: the page now wrote a chain', seed, 'step ' + i);
    if (P.team.concat(P.inflows, P.taxes, P.other, P.div).some((r) => r && r.rec && r.rec.since && Object.values(r.rec.since).some((e) => e && (e.amt !== undefined || e.day !== undefined)))) up('R steps with a sum or a day dated');
    const a = canon(C(NEW, L, P)), b = canon(devOf(L, P)); if (a !== b) { fail('R: not develop\'s model of the plan as develop stores it', seed, 'step ' + i); break; } }
  // O, J, Z: develop's writers - its chains - read by the page now, as they are and made one
  P = clone(P0);
  for (let i = 0; i < STEPS; i++) { P = step(DN, wDev, P, L, R, seed, 1000 + i, now0 + i * 6e4); up('O steps');
    const D = C(DN, L, P), n = chains(P);
    if (canon(C(NEW, L, P)) !== canon(D)) { fail('O: a plan develop wrote is not counted as develop counts it', seed, 'step ' + i); break; }
    if (!n) continue; up('J steps with a chain'); up('J chain parts', n);
    const Q = clone(P), joined = NEW.join(Q), left = chains(Q); up('J lines made one', joined); if (left) up('J parts left as they were', left);
    if (canon(asLine(C(NEW, L, Q), Q)) !== canon(asLine(D, P))) { fail('J: the plan made one is not counted as develop counts the chain', seed, 'step ' + i); break; }
    // Z: what is left is left as it was - and a second join makes nothing more
    if (NEW.join(clone(Q)) !== 0) fail('Z: a second join made more', seed, 'step ' + i);
    // V: every line made one whose last part has an end - «Вернуть» on develop's chain and on the one row
    ['inflows', 'team', 'taxes', 'other', 'div'].forEach((k) => (Q[k] || []).forEach((h) => { if (!h || !h.rec || !h.rec.since || !Object.values(h.rec.since).some((e) => e && e.iid)) return;
      const c = String(h.id), parts = P[k].filter((r) => r && r.rec && (String(r.id) === c || String(r.rec.chain) === c)).sort((a, b) => (a.rec.from < b.rec.from ? -1 : 1)), last = parts[parts.length - 1];
      if (!last.rec.to) return; up('V lines ended');
      const Pd = clone(P), Qd = clone(Q); delete Pd[k].find((r) => String(r.id) === String(last.id)).rec.to; delete Qd[k].find((r) => String(r.id) === c).rec.to;
      if (canon(asLine(C(NEW, L, Qd), Qd)) !== canon(asLine(C(DN, L, Pd), Pd))) fail('V: «Вернуть» on the line made one is not «Вернуть» on develop\'s chain', seed, 'step ' + i + ' ' + c); }));
  }
}
console.log(JSON.stringify(stat));
const ks = Object.keys(bad); if (ks.length) { ks.forEach((k) => console.log(bad[k].length, 'x', k, bad[k].slice(0, 12).join(','))); process.exit(1); } else console.log('every property held');
