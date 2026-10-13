// Dense lives: few withdrawals with overlapping windows, many takings inside them, marks first, then changes -
// so that most of a life is lived WITH a memory in force. What is held at every step:
//   B   a change to another line moves no waiting marked withdrawal (what it holds, its rows), nor the figures
//   D   no row counted twice, no withdrawal over its sum
//   K   the seeing and the keeping, called by hand around no change (the page does not call them then: a press
//       that changes nothing writes nothing): the model does not move; K-doc: a plan without a memory is given
//       none; K-fix: a second see+keep changes nothing more
//   U   an upload with a memory in force gives the model the walk of develop would give for rows nobody remembers?  (not held - counted only)
// usage: ENGINES=<folder> node checks/withdrawals/dense.cjs <seeds> [steps]
const E = __dirname;   // (written by the fourth independent reading of the rule)
const { rng, FOUNDERS, day, T } = require(E + '/gen.cjs');
const { ms, ledger, clone, item, mk, filed, wd, row, plan3, bal, reach, engines } = require(E + '/lib.cjs');
const { NEW, DEV } = engines(), Live = process.env.ON === 'dev' ? DEV : NEW;
const { C, wr, raw, page, see, keep } = mk(Live);
const SEEDS = +process.argv[2] || 200, STEPS = +process.argv[3] || 14, BY = 'Mika', T0 = ms('2026-10-01T08:00:00Z');
const stat = {}, bad = {}, up = (k, n = 1) => { stat[k] = (stat[k] || 0) + n; };
const fail = (k, seed, more) => { (bad[k] = bad[k] || []).push(seed); if (bad[k].length <= 2) console.log('FAIL', k, 'seed', seed, more || ''); };
const wdsOf = (M) => M.items.filter((it) => it.wd && it.date);
const hasMem = (P) => JSON.stringify(P).includes('"saw"');
const chainOf = (it) => String(it.occ ? it.occ.chain : it.row || it.id);
const keyOf = (it) => chainOf(it) + '|' + it.date + '|' + (it.mark ? it.mark.at + '|' + it.mark.on : '');
const view = (it) => JSON.stringify([it.done && it.done.by, it.wd.got, it.rows, it.mark && it.mark.counts]);
const figs = (M) => JSON.stringify([M.now, M.marksGbp, M.month.blocks.div.fact]);
const waiting = (M) => wdsOf(M).filter((it) => it.mark && it.saw);
const flat = (X) => { const Z = clone(X); Z.items.forEach((it) => { delete it.saw; delete it.sawDay; if (it.wd) { delete it.wd.from; delete it.wd.to; } }); return JSON.stringify(Z); };
const conserve = (M, L) => { const amt = Object.fromEntries(L.tx.concat(L.inbox).map((r) => [String(r.id), Math.abs(r.a)])), all = wdsOf(M);
  if (all.some((it) => it.wd.got > it.rows.reduce((s, id) => s + (amt[id] || 0), 0) + 0.011)) return 'a withdrawal holds more than its rows';
  if (all.some((it) => it.wd.got > it.amt + 0.011)) return 'a withdrawal holds more than its sum';
  const rows = new Set(); all.forEach((it) => it.rows.forEach((id) => rows.add(id))); const tot = all.reduce((s, it) => s + it.wd.got, 0), cap = [...rows].reduce((s, id) => s + (amt[id] || 0), 0); if (tot > cap + 0.011) return `the withdrawals hold ${tot} of rows worth ${cap}`; return ''; };
for (let seed = 1; seed <= SEEDS; seed++) {
  const R = rng(seed * 7919), pick = (a) => a[Math.floor(R() * a.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1)), chance = (p) => R() < p;
  const div = [], nW = int(3, 5);
  for (let i = 0; i < nW; i++) { const more = { c0: T0 - int(1, 5) * 864e5 }; if (chance(0.35)) more.whose = pick(FOUNDERS);
    if (chance(0.25)) { const d = int(3, 20); div.push(row('w' + i, 'Вывод ' + i, pick([1500, 2500, 4000]), '2026-09-' + String(d).padStart(2, '0'), { blk: 'div', rec: { day: d, from: '2026-09' }, ...more })); }
    else div.push(wd('w' + i, pick([1000, 1500, 2500, 4000]), day(T, int(-9, 6)), more)); }
  const allTx = []; const nR = int(8, 18);
  for (let i = 0; i < nR; i++) allTx.push(filed('f' + i, day(T, int(-14, 0)), -pick([200, 400, 500, 800, 1000, 1200]), pick(FOUNDERS), '', { at: T0 + int(0, 11) * 864e5 + i }));
  allTx.sort((a, b) => a.at - b.at);
  let shown = Math.max(2, Math.floor(nR * 0.5)), tx = allTx.slice(0, shown), now = ms(T + 'T09:00:00Z');
  let P = plan3({ banks: [bal('Wise', 'GBP', 60000, day(T, -12))], div }), L = ledger(tx, []), M = C(L, P, T);
  up('lives');
  const check = (tag) => { M = C(L, P, T); const c = conserve(M, L); if (c) fail('D: ' + c + ' (' + tag + ')', seed); if (hasMem(P)) up('steps with a memory'); else up('steps without'); };
  for (let q = 0; q < 2; q++) { const open = wdsOf(M).filter((it) => it.open && it.on); if (!open.length) break; P = wr(P, 'mark', pick(open), T, now + q, BY); check('first marks'); }
  let lastKind = 'start', tableSince = false;
  for (let step = 0; step < STEPS; step++) {
    const k = R(); now += int(1, 50) * 6e4;
    if (k < 0.18) { const n = int(1, 2); if (shown >= allTx.length) { tx = tx.concat([filed('x' + seed + '-' + step, day(T, int(-10, 0)), -pick([300, 700, 900]), pick(FOUNDERS), '', { at: now })]); } else { tx = tx.concat(allTx.slice(shown, shown + n).map((r) => ({ ...r, at: now }))); shown += n; } L = ledger(tx, []); up('uploads'); check('upload'); lastKind = 'upload'; tableSince = true; }
    else if (k < 0.28) { const r = pick(tx), op = int(0, 3); const put = (r2) => { tx = tx.flatMap((x) => (x === r ? (r2 ? [r2] : []) : [x])); };
      if (op === 0) put(null); else if (op === 1) put({ ...r, c: pick(FOUNDERS) }); else if (op === 2) put({ ...r, id: r.id + '-again', at: now }); else put({ ...r, c: 'other', l: 'Thing' });
      L = ledger(tx, []); up('table by hand'); check('table'); lastKind = 'table'; tableSince = true; }
    else if (k < 0.36) { const open = wdsOf(M).filter((it) => it.open && it.on); if (!open.length) continue; const it = pick(open), others = waiting(M).filter((x) => chainOf(x) !== chainOf(it)).map((x) => [keyOf(x), view(x)]);
      P = wr(P, 'mark', it, T, now, BY); up('marks'); check('mark'); lastKind = 'mark';
      others.forEach(([key, v]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); if (!x) return; up('B'); if (view(x) !== v) fail('B: a mark on another line moved a marked withdrawal', seed); }); }
    else { const ws = wdsOf(M).filter((it) => it.date >= day(T, -40) && it.date <= day(T, 40)); if (!ws.length) continue; const it = pick(ws), op = int(0, 8);
      const before = M, others = waiting(M).filter((x) => chainOf(x) !== chainOf(it)).map((x) => [keyOf(x), view(x)]), own = !!it.mark || wdsOf(M).some((x) => x.mark && chainOf(x) === chainOf(it)); let Q = P; lastKind = own ? 'own change' : 'change';
      try {
        if (op === 0 || op === 1) Q = wr(P, 'set', it, { whose: pick(FOUNDERS.concat([''])) }, now, BY);
        else if (op === 2) Q = wr(P, 'del', it);
        else if (op === 3) Q = wr(P, it.on ? 'off' : 'on', it);
        else if (op === 4) Q = wr(P, 'set', it, { date: day(it.date, int(-6, 8)) }, now, BY);
        else if (op === 5) Q = wr(P, 'set', it, { amt: pick([300, 800, 2000, 5000]) }, now, BY);
        else if (op === 6) Q = page(P, (X) => { X.div.push(wd('n' + seed + '-' + step, pick([1000, 2000]), day(T, int(-8, 4)), Object.assign({ c0: now }, chance(0.4) ? { whose: pick(FOUNDERS) } : {}))); return X; });
        else if (op === 7) Q = it.src === 'row' ? wr(P, 'tick', it) : wr(P, 'untick', it);
        else Q = page(P, (X) => { X.cushion = (X.cushion || 0) + 100; return X; });
      } catch (e) { continue; }
      if (JSON.stringify(Q) === JSON.stringify(P)) { up('changes that changed nothing'); continue; }
      P = Q; up('changes'); check('change ' + op);
      others.forEach(([key, v]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); if (!x) return; up('B'); if (view(x) !== v) fail('B: a change to another line moved a marked withdrawal (op ' + op + ')', seed, key + '\n   ' + v + '\n   ' + view(x)); });
      if (!own && op !== 8) { up('B figures'); if (figs(M) !== figs(before)) fail('B: a change to another line moved the figures (op ' + op + ')', seed, figs(before) + ' -> ' + figs(M)); } }
    // K: see and keep around nothing
    { const had = hasMem(P), Q = keep(clone(P), see(P)), M2 = C(L, Q, T); up('K'); if (had) up('K with a memory');
      if (flat(M2) !== flat(M)) fail('K: see and keep alone moved the model', seed);
      if (JSON.stringify(Q) !== JSON.stringify(P)) { up(had ? 'K-doc: the document changed (had a memory)' : 'K-doc: the document changed (no memory)'); up('K-doc after ' + lastKind + (hasMem(Q) ? '' : ' (memory taken out)')); if (!had) fail('K-doc: a press that changes nothing wrote into a plan without a memory', seed);
        const Q2 = keep(clone(Q), see(Q)); C(L, P, T); if (JSON.stringify(Q2) !== JSON.stringify(Q)) fail('K-fix: a second see+keep changed the document again', seed); } }
  }
  if (hasMem(P)) up('lives that end with a memory');
}
console.log(JSON.stringify(stat));
const ks = Object.keys(bad); if (ks.length) { ks.forEach((k) => console.log(bad[k].length, 'x', k, bad[k].slice(0, 12).join(','))); process.exit(1); } else console.log('every property held');
