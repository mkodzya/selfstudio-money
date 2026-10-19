// The rule on random lives of a plan: «a change to the plan deals nothing of a marked withdrawal over».
// A life: a plan and a table; then, step by step, statements come (rows are shown in the order they were
// uploaded), the table is changed by hand, lines are marked, and the plan is changed the page's way (see, change,
// keep). Every other life is given what the owner decided on 17 October 2026 (gen.cjs, `news`): withdrawals named
// after a founder (N), records written after their rows (W1), moves to a Daily account (D). What is held at every step:
//   N, D. The plan and the table are read as they are read with every withdrawal named after a founder given that
//      owner by hand and every move to or back from a Daily or Monthly account from October filed as a transfer
//      between own accounts (lib.cjs, `named`, `toOwn`) - the whole model, byte for byte, memory or not.
//   W. What lib.cjs, `wCheck`, holds of every record and every rest (W1, W2) - and, where the plan holds no memory,
//      that a withdrawal that may be a record and has a row of its founder that fits it is one.
//   F. A plan that holds no memory, read with N and D written out, is read as the page read it before the rule, byte
//      for byte but for the fields `bare` names - where no withdrawal is a record (W1): those are counted.
//   B. A change made on ANOTHER line - another month of the same row too, as long as it leaves this one's day, sum,
//      owner and bank as they were - moves nothing of a withdrawal whose mark can count: what it holds, its rows,
//      whether its mark counts (one that rows or its window have closed: that it stays closed). And, unless the
//      change was made on a marked withdrawal, reached one, or took a mark off: neither «Денег сейчас» nor the
//      marks' sum - and where every mark that waits can count, nor the month's fact for dividends.
//   Y. A change that moves only the day of a withdrawal whose mark can count - the card of an earlier month,
//      «… и дальше» - leaves it holding what it held, and its mark counting or not as it did («Новый день — нет:
//      вывод держит что держал», 13 October 2026, rule 5). Asked of records too (W1): one whose day the change moves
//      past today is no record any more, and its memory (`rec`) holds the rows it took whenever they were uploaded.
//   D. No row gives the withdrawals more than its sum; none holds more than its own sum or than its rows' worth.
//   K. The seeing and the keeping, called by hand around no change at all (the page does not call them then),
//      move no figure, and write nothing into a plan without a memory.
//   C. «Оплачено», a statement, «Чей вывод» on one row is «Чей вывод», «Оплачено», the statement: the same plan and
//      the same model - where no other withdrawal waits with a mark, and where one does but neither order left a
//      memory. Where one did, the pair is counted and nothing is asked of it.
//   P. (19 October 2026) A table that holds no fee is read as develop before the fees read it (pre.cjs, 008462e),
//      byte for byte but for the fields the fees add (lib.cjs, `bareFee`) - at every step, memory or not.
//   G. What lib.cjs, `gCheck`, holds of the fees, at every step whose table holds one: each fee counted once, in its
//      month and its bank; none outside the plan; every account the same money, and every line other than a withdrawal
//      closed and paid the same, as with the fees' words taken out.
//      And D, W and the rest count a row at its worth - without the fee inside it. F is not asked of such a table.
// A third of the lives are given the fees by a stream of their own (gen.cjs, `fees`).
// The counters printed at the end say how often each was looked at - and how often there was anything to move.
// usage: ENGINES=<folder> [BIAS=1] [STEPS=n] [ON=dev] node checks/withdrawals/lives.cjs <lives> [rich]
const SEEDS = +process.argv[2] || 300, RICH = process.argv[3] === 'rich', STEPS = +process.env.STEPS || 9;
const { ms, ledger, clone, item, mk, round2, filed, wd, engines, bare, bareFee, named, toOwn, wCheck, FX, worth, hasFee, gCheck } = require('./lib.cjs');
const { NEW, DEV, PRE } = engines(), Live = process.env.ON === 'dev' ? DEV : NEW;   // ON=dev: the same lives on the page before the rule - B must fail there
const { make, FOUNDERS, day, T, rng } = require('./gen.cjs');
const { C, wr, raw, page, see, keep } = mk(Live), d = mk(DEV);
const BY = 'Mika', T0 = ms('2026-10-01T08:00:00Z');
const stat = {}, bad = {}, up = (k, n = 1) => { stat[k] = (stat[k] || 0) + n; };
const fail = (k, seed, more) => { (bad[k] = bad[k] || []).push(seed); if (bad[k].length <= 2) console.log('FAIL', k, 'seed', seed, more || ''); };
const wdsOf = (M) => M.items.filter((it) => it.wd && it.date);
const strip = (M) => { const Q = clone(M); bare(Q); return JSON.stringify(Q); };
const hasMem = (P) => JSON.stringify(P).includes('"saw"');
const waiting = (M) => wdsOf(M).filter((it) => it.mark && it.saw);
const TAKEN = JSON.stringify(['closed', false]);
const view = (it) => JSON.stringify(it.done && it.done.by === 'row' && !(it.mark && it.mark.counts) ? ['closed', false] : [it.done && it.done.by, it.wd.got, it.rows, it.mark && it.mark.counts]);
const allCount = (M) => wdsOf(M).every((x) => !(x.done && x.done.by === 'mark') || !!x.saw);
const figs = (M, fact = true) => JSON.stringify([M.now, M.marksGbp].concat(fact ? [M.month.blocks.div.fact] : []));
const chainOf = (it) => String(it.occ ? it.occ.chain : it.row || it.id);
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v));
const keyOf = (it) => String(it.occ ? it.occ.chain : it.row || it.id) + '|' + (it.occ ? it.occ.ym : String(it.date).slice(0, 7)) + '|' + (it.mark ? it.mark.at + '|' + it.mark.on : '');
// what a withdrawal IS, as its founder wrote it: a change that leaves this alone is a change to another line - also when
// it is made in the card of another month of the same row
const self = (it) => JSON.stringify([it.date, it.amt, it.cur, it.whose, it.on, it.bank]);
const conserve = (M, L) => {
  const amt = Object.fromEntries(L.tx.concat(L.inbox).map((r) => [String(r.id), worth(r)])), all = wdsOf(M), ws = all.filter((it) => it.cur === 'GBP');
  if (ws.some((it) => it.wd.got > it.rows.reduce((s, id) => s + (amt[id] || 0), 0) + 0.011)) return 'a withdrawal holds more than its rows';
  if (all.some((it) => it.wd.got > it.amt + 0.011)) return 'a withdrawal holds more than its sum';
  if (all.every((it) => it.cur === 'GBP')) { const rows = new Set(); ws.forEach((it) => it.rows.forEach((id) => rows.add(id))); const tot = ws.reduce((s, it) => s + it.wd.got, 0), cap = [...rows].reduce((s, id) => s + (amt[id] || 0), 0); if (tot > cap + 0.011) return `the withdrawals hold ${tot} of rows worth ${cap}`; }
  return '';
};
const ON_DEV = process.env.ON === 'dev', raw2 = (L, P) => JSON.parse(JSON.stringify(Live.compute(clone(L), clone(P), T, { H: 30 })));
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = make(seed, { marks: seed % 3 === 0 ? 'old' : 'none', rich: RICH, news: seed % 2 === 0, fees: !ON_DEV && seed % 3 === 1 }), { pick, int, chance } = g, YR = rng(seed * 31 + 7);
  // the table, shown as it was uploaded: rows come in batches by their moment
  const allTx = g.L.tx.slice().sort((a, b) => a.at - b.at), allInb = g.L.inbox.slice();
  let shown = Math.max(1, Math.floor(allTx.length * (0.3 + 0.4 * g.R()))), tx = allTx.slice(0, shown), inb = allInb.slice(), now = ms(T + 'T09:00:00Z');
  let P = g.P, L = ledger(tx, inb), M = C(L, P, T);
  up('lives');
  const check = (tag) => {
    M = C(L, P, T);
    const c = conserve(M, L); if (c) fail('D: ' + c + ' (' + tag + ')', seed);
    if (ON_DEV) { if (!hasMem(P)) { up('F'); const b = JSON.stringify(d.C(L, P, T)); if (strip(M) !== b) fail('F: not develop\'s model with no memory (' + tag + ')', seed); } else up('steps with a memory'); return; }
    const L2 = toOwn(L), P2 = named(P);
    if (L2 !== L || P2 !== P) { up('N/D written out'); if (JSON.stringify(raw2(L2, P2)) !== JSON.stringify(M)) fail('N/D: not the model of the plan and table with them written out (' + tag + ')', seed); }
    const w = wCheck(clone(M), L, T, FX, up, P, hasMem(P)); if (w.length) fail(w[0] + ' (' + tag + ')', seed);
    if (hasFee(L)) { up('G'); const gb = gCheck(clone(M), L, P, T, Live, up); if (gb.length) fail(gb[0] + ' (' + tag + ')', seed); if (!hasMem(P)) up('F not asked: a fee'); else up('steps with a memory'); return; }
    up('P'); if (JSON.stringify(bareFee(clone(M))) !== JSON.stringify(JSON.parse(JSON.stringify(PRE.compute(clone(L), clone(P), T, { H: 30 }))))) fail('P: not the model of develop before the fees, with no fee in the table (' + tag + ')', seed);
    if (!hasMem(P)) { if (M.items.some((it) => it.wd && it.wd.rec)) up('F not asked: a record'); else { up('F'); const b = JSON.stringify(d.C(L2, P2, T)); if (strip(M) !== b) fail('F: not develop\'s model with no memory (' + tag + ')', seed); } } else up('steps with a memory');
  };
  check('start');
  // BIAS: marks first, and mostly changes to lines - so that withdrawals hold to a memory through most of the life
  if (process.env.BIAS) { for (let q = 0; q < 2; q++) { const open = wdsOf(M).filter((it) => it.open && it.on); if (!open.length) break; P = wr(P, 'mark', pick(open), day(T, -int(0, 3)), now + q, BY); check('first marks'); } }
  for (let step = 0; step < STEPS; step++) {
    const k0 = g.R(), k = process.env.BIAS ? (k0 < 0.15 ? 0.1 : k0 < 0.25 ? 0.3 : k0 < 0.3 ? 0.4 : 0.9) : k0; now += int(1, 50) * 6e4;
    if (k < 0.22) {          // a statement comes
      const n = int(1, 4); tx = tx.concat(allTx.slice(shown, shown + n).map((r) => ({ ...r, at: now }))); shown += n; L = ledger(tx, inb); up('uploads'); check('upload');
    } else if (k < 0.34) {   // the table changed by hand
      const cand = tx.filter((r) => r.c !== 'skip' && r.c !== 'rev'); if (!cand.length) continue; const r = pick(cand), op = int(0, 5);
      const put = (r2) => { tx = tx.flatMap((x) => (x === r ? (r2 ? [r2] : []) : [x])); };
      if (op === 0) put(null); else if (op === 1) put({ ...r, c: pick(FOUNDERS), l: '' }); else if (op === 2) put({ ...r, c: 'other', l: 'Thing' });
      else if (op === 3) put({ ...r, id: r.id + '-again', at: now }); else if (op === 4) { put(null); tx = tx.concat([{ ...r, at: now }]); }
      else { const u0 = inb.filter((x) => !x.c); if (u0.length) { const u = pick(u0); inb = inb.filter((x) => x !== u); tx = tx.concat([filed(u.id, u.d, u.o.a, pick(FOUNDERS), '', { at: u.at, b: u.b, cur: u.o.cur, key: u.key })]); } }
      L = ledger(tx, inb); up('table by hand'); check('table');
    } else if (k < 0.5) {    // «Оплачено» or «Частично» on an open withdrawal
      const open = wdsOf(M).filter((it) => it.open && it.on); if (!open.length) continue; const it = pick(open), before = M, others = waiting(M).filter((x) => x.id !== it.id).map((x) => [keyOf(x), view(x), self(x)]);
      if (chance(0.2)) P = wr(P, 'partial', it, Math.round(it.amt * 0.6), 'rest' + seed + '-' + step, now, BY, day(T, -int(0, 3)), day(T, 9)); else P = wr(P, 'mark', it, day(T, -int(0, 3)), now, BY);
      up('marks'); check('mark');
      others.forEach(([key, v, was]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); if (!x || self(x) !== was) return; up('B'); if (view(x) !== v) fail('B: a mark on another line moved a marked withdrawal', seed, key + '\n   ' + v + '\n   ' + view(x)); });
    } else {                 // a change to a line of the plan
      const ws = wdsOf(M).filter((it) => it.date >= day(T, -40)); if (!ws.length) continue; const it = pick(ws), op = int(0, 11);
      // every marked withdrawal but the one the change is made on is watched - the other months of its row too
      const before = M, others = waiting(M).filter((x) => x.id !== it.id).map((x) => [keyOf(x), view(x), self(x)]), marked = wdsOf(M).filter((x) => x.mark && x.id !== it.id).map((x) => [keyOf(x), self(x)]);
      let own = false, marks = false, Q = P;
      try {
        if (op === 0) Q = wr(P, 'set', it, { whose: pick(FOUNDERS.concat([''])) }, now, BY);
        else if (op === 1) Q = wr(P, 'del', it);
        else if (op === 2) Q = wr(P, it.on ? 'off' : 'on', it);
        else if (op === 3) Q = wr(P, 'set', it, { date: day(it.date, int(-12, 25)) }, now, BY);
        else if (op === 4) Q = wr(P, 'set', it, { amt: pick([200, 500, 1500, 5000]) }, now, BY);
        else if (op === 5) Q = it.src === 'row' ? wr(P, 'tick', it) : it.src === 'occ' ? wr(P, 'untick', it) : P;
        else if (op === 6) Q = it.src === 'occ' ? wr(P, 'end', it) : P;
        else if (op === 7) { Q = page(P, (X) => { X.div.push(wd('n' + seed + '-' + step, pick([1000, 2000, 4000]), day(T, int(-20, 10)), Object.assign({ c0: now }, chance(0.4) ? { whose: pick(FOUNDERS) } : {}))); return X; }); }
        else if (op === 8) { if (it.mark) { Q = wr(P, 'unmark', it); marks = true; } }
        else if (op === 9) Q = it.src === 'occ' ? wr(P, 'onward', it, { amt: pick([700, 2500]) }, 'on' + seed + '-' + step, now, BY) : P;
        else if (op === 10) Q = page(P, (X) => { X.cushion = (X.cushion || 0) + 100; return X; });
        else Q = wr(P, 'set', it, { name: 'Другое имя' }, now, BY);
      } catch (e) { continue; }
      if (JSON.stringify(Q) === JSON.stringify(P)) { up('changes that changed nothing'); continue; }
      P = Q; up('changes'); check('change ' + op);
      // (a withdrawal the change left as its founder wrote it - its day, sum, owner, bank, on or off - is another line to it)
      others.forEach(([key, v, was]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); if (!x || self(x) !== was) return; up('B'); if (view(x) !== v) fail('B: a change to another line moved a marked withdrawal (op ' + op + ')', seed, key + '\n   ' + v + '\n   ' + view(x)); });
      // Y. (the day of a withdrawal whose mark can count, moved by the change, and nothing else of it)
      if (op === 3 && it.mark && it.saw) { const x = M.items.find((q) => q.id === it.id), was = JSON.parse(self(it)), is = x && JSON.parse(self(x));
        if (x && is[0] !== was[0] && JSON.stringify(is.slice(1)) === JSON.stringify(was.slice(1))) { up('Y'); if (it.wd.rec) up('Y, a record'); if (it.wd.rec && !(x.date <= T)) up('Y, a record moved past today');
          if (view(x) !== view(it)) fail('Y: a marked withdrawal whose day moved holds another thing (rec ' + !!it.wd.rec + ')', seed, view(it) + '\n   ' + view(x)); } }
      // (the figures: unless the change was made on a marked withdrawal, reached one - another month of its row - or took a mark off)
      own = !!it.mark || marked.some(([key, was]) => { const x = wdsOf(M).find((q) => keyOf(q) === key); return !x || self(x) !== was; });
      if (!own && !marks && op !== 10) { up('B figures'); if (waiting(before).length) up('B figures, a mark that counts was there'); const fact = allCount(before) && allCount(M); if (fact) up('B figures, the fact too'); if (figs(M, fact) !== figs(before, fact)) fail('B: a change to another line moved the figures (op ' + op + ')', seed, figs(before) + ' -> ' + figs(M)); }
    }
    // Y, made to happen (a stream of its own, so the steps above are drawn as before): now and then the day of a
    // withdrawal whose mark can count is moved, the way the card of an earlier month moves it («… и дальше»)
    if (!ON_DEV && YR() < 0.12) { const ys = wdsOf(M).filter((x) => x.mark && x.saw);
      if (ys.length) { const it = ys[Math.floor(YR() * ys.length)], to = day(it.date, (YR() < 0.5 ? -1 : 1) * (1 + Math.floor(YR() * 20))), others = waiting(M).filter((x) => x.id !== it.id).map((x) => [keyOf(x), view(x), self(x)]);
        let Q = P; try { Q = wr(P, 'set', it, { date: to }, now + 1, BY); } catch (e) { Q = P; }
        if (JSON.stringify(Q) !== JSON.stringify(P)) { P = Q; up('changes'); up('days moved'); check('day moved');
          const x = M.items.find((q) => q.id === it.id);
          if (x && x.date === to) { up('Y'); if (it.wd.rec) up('Y, a record'); if (it.wd.rec && !(to <= T)) up('Y, a record moved past today');
            if (view(x) !== view(it)) fail('Y: a marked withdrawal whose day moved holds another thing (rec ' + !!it.wd.rec + ')', seed, view(it) + '\n   ' + view(x)); }
          others.forEach(([key, v, was]) => { const z = wdsOf(M).find((q) => keyOf(q) === key); if (!z || self(z) !== was) return; up('B'); if (view(z) !== v) fail('B: moving the day of another line moved a marked withdrawal', seed, key + '\n   ' + v + '\n   ' + view(z)); }); } } }
    // K. see and keep around nothing
    { const had = hasMem(P), Q = keep(clone(P), see(P)), M2 = C(L, Q, T); C(L, P, T); up('K'); if (had) up('K, with a memory'); if (JSON.stringify(Q) !== JSON.stringify(P)) up(hasMem(Q) ? 'K, the memory written anew' : 'K, the memory taken out'); const flat = (X) => { const Z = clone(X); bare(Z).items.forEach((it) => { if (it.wd) { delete it.wd.from; delete it.wd.to; } }); return JSON.stringify(Z); }; if (flat(M2) !== flat(M)) fail('K: see and keep alone moved the model', seed); if (strip(M2) !== strip(M)) up('K, only a window differs'); if (!had && hasMem(Q)) fail('K: see and keep alone wrote a memory', seed); if (had && hasMem(Q)) up('K, memory kept'); }
  }
  if (hasMem(P)) up('lives that end with a memory');
  // C. the two orders on one row, with statements between
  { const g2 = make(seed + 100000, { marks: 'none', rich: RICH }), all2 = g2.L.tx.slice().sort((a, b) => a.at - b.at), cut = Math.floor(all2.length * 0.6);
    const L0 = ledger(all2.slice(0, cut), g2.L.inbox), L1 = ledger(all2, g2.L.inbox), t1 = ms(T + 'T10:00:00Z'), t2 = ms(T + 'T11:00:00Z');
    let base = g2.P, M0 = C(L0, base, T), open = wdsOf(M0).filter((it) => it.open && it.on), other = false;
    // (every other pair: another withdrawal already waits with a mark of its own)
    if (seed % 2 && open.length > 1) { const y = g2.pick(open); base = wr(base, 'mark', y, T, ms(T + 'T09:30:00Z'), BY); M0 = C(L0, base, T); open = wdsOf(M0).filter((it) => it.open && it.on); other = true; }
    if (open.length) { const it = g2.pick(open), who = g2.pick(FOUNDERS.filter((f) => f !== it.whose).concat(it.whose ? [''] : []));
      // «Оплачено», the statement, «Чей вывод»
      let A = wr(base, 'mark', it, T, t1, BY); C(L1, A, T); A = wr(A, 'set', item(C(L1, A, T), it.id), { whose: who }, t2, BY);
      // «Чей вывод», «Оплачено», the statement
      C(L0, base, T); let B = wr(base, 'set', it, { whose: who }, t2, BY); B = wr(B, 'mark', item(C(L0, B, T), it.id), T, t1, BY);
      // (the same plan and the same model whenever neither order left a memory - which, with no other withdrawal waiting, is always)
      if (!other || (!hasMem(A) && !hasMem(B))) { up(other ? 'C, another waits, no memory' : 'C'); if (canon(A) !== canon(B)) fail('C: the two orders wrote two plans', seed, hasMem(A) + ' ' + hasMem(B)); else if (strip(C(L1, A, T)) !== strip(C(L1, B, T))) fail('C: two models', seed); }
      else { up('C, another waits and is held'); if (figs(C(L1, A, T)) !== figs(C(L1, B, T))) up('C, another waits and is held: the figures differ'); } } }
}
console.log(process.env.ON === 'dev' ? 'dev' : 'new', JSON.stringify(stat));
const ks = Object.keys(bad); if (ks.length) { ks.forEach((k) => console.log(bad[k].length, 'x', k, bad[k].slice(0, 12).join(','))); process.exit(1); } else console.log('every property held');
