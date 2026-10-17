// Cases written by hand, each a fault a reading found in W1 (the owner's decisions of 17 October 2026) and the figure
// that holds once it is closed - so that a change to the engine which brings one back fails here at once, before the
// random lives of the other scripts happen to meet it. Every figure is made up.
//   1. A record keeps its own memory of a balance's day. Vanya's two rows come with a statement after the balance:
//      352 dated on the balance's day, and 350 a day earlier that another line («Вывод») holds by hand. His record
//      «Vanya» 350, marked after the balance, takes the 352. «Вывод» is deleted - the 350 is loose, and nearer the
//      record's date. The record must keep the 352 (its day memory), or that row falls inside the balance.
//   2. A record's memory holds once its day has moved past today. Vanya's 350 was on the page before «Vanya» 350 was
//      written and marked; the balance is older than both, so the mark could count - but the record holds the row and
//      the mark counts nothing. The card of an earlier month moves the record's day past today («… и дальше»): it is
//      no record now, and the memory the change wrote (`rec`) must still give it that row - else the mark counts 350
//      on top of the row that is already gone from the bank.
//   3. That memory, written again by the next change - to another line, or around no change at all - keeps saying
//      which takings it holds as a record's (`rec`): written anew without that, the row was let go at the change after.
//   4. A row a record took in part, held by such a memory, is still the record's whole: what it has over stays its rest
//      «вне плана» (W2), as W1 left it - not dealt on to the next withdrawal, as the walk deals the rows it gives.
//   5. A memory that names a taking its withdrawal could not be given - news of an earlier day took the room first -
//      keeps no record from that taking; else the seeing and the keeping around no change made it a record (K broke).
// usage: ENGINES=<folder> node checks/withdrawals/cases.cjs        (new.cjs is asked; dev.cjs is not)
const { ms, filed, ledger, bal, wd, plan3, mk, engines, clone, bare } = require('./lib.cjs');
const { NEW } = engines(), { C, wr, page, see, keep } = mk(NEW);
let n = 0, bad = 0;
const same = (got, want, what) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) return; bad++; console.log('FAIL', what, '\n   got ', g, '\n   want', w); };
const item = (M, id) => M.items.find((i) => i.id === id);
const BY = 'Mika';
// (a memory that holds the takings as a record's - `rec`, the list of them)
const asRec = (P, id) => { const r = P.div.find((x) => x.id === id), w = r && r.paid && r.paid.saw; return !!w && Array.isArray(w.rec) && w.rec.length > 0; };

// 1. Wise 50,000 typed at 09:00 on 13 Oct for 12 Oct. «Vanya» 350 (11 Oct) written at 08:00, marked paid for 12 Oct at
// 10:00; Vanya's 352 (12 Oct) and 350 (11 Oct) uploaded at 11:00. The record takes the 352 (the 350 is tied to
// «Вывод»): it was uploaded after the mark, so it stands in the mark's place - after the balance: 50,000 − 352 = 49,648
// (the 350, dated before the balance's day, is inside it). Deleted «Вывод»: still the 352, still 49,648 - not 50,000.
{
  const T = '2026-10-13', U = ms('2026-10-13T11:00:00Z'), C8 = ms('2026-10-13T08:00:00Z');
  const L = ledger([filed('f', '2026-10-12', -352, 'vanya', '', { at: U }), filed('g', '2026-10-11', -350, 'vanya', '', { at: U })]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-12', { at: ms('2026-10-13T09:00:00Z') })],
    div: [wd('a', 350, '2026-10-11', { name: 'Вывод', tx: ['g'], c0: C8 }), wd('b', 350, '2026-10-11', { name: 'Vanya', c0: C8, paid: { on: '2026-10-12', at: ms('2026-10-13T10:00:00Z'), by: BY } })] });
  const M0 = C(L, P, T);
  same([M0.now, item(M0, 'b').rows, !!item(M0, 'b').wd.rec], [49648, ['f'], true], '1: «Vanya» is a record of the 352 of the balance\'s day, after the balance: 49,648');
  const Q = wr(P, 'del', item(M0, 'a')), M1 = C(L, Q, T);
  same([M1.now, item(M1, 'b').rows, !!item(M1, 'b').wd.rec, !!Q.div.find((r) => r.id === 'b').paid.saw], [49648, ['f'], true, true], '1: «Вывод» deleted - the record keeps the 352 by its memory of the balance\'s day, and «Денег сейчас» stays 49,648');
  const M2 = C(L, keep(clone(Q), see(Q)), T);
  same([M2.now, item(M2, 'b').rows], [49648, ['f']], '1: … and the seeing and the keeping around no change leave it so');
}

// 2 and 3. Wise 50,000 typed for 10 Oct. Vanya's 350 (12 Oct) uploaded at 10:00 on the 12th; «Vanya» 350 (12 Oct)
// written at 10:01 and marked paid for the 12th at 10:02; no statement since. The record holds the row; the row is
// after the balance by its date: 50,000 − 350 = 49,650, and the mark counts nothing.
{
  const T = '2026-10-17';
  const L = ledger([filed('f', '2026-10-12', -350, 'vanya', '', { at: ms('2026-10-12T10:00:00Z') })]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-10', { at: ms('2026-10-10T17:00:00Z') })],
    div: [wd('b', 350, '2026-10-12', { name: 'Vanya', c0: ms('2026-10-12T10:01:00Z'), paid: { on: '2026-10-12', at: ms('2026-10-12T10:02:00Z'), by: BY } })] });
  const M0 = C(L, P, T), fig = (M) => [M.now, M.marksGbp, item(M, 'b').rows, item(M, 'b').done && item(M, 'b').done.by];
  same(fig(M0), [49650, 0, ['f'], 'row'], '2: the record holds the 350; the mark counts nothing: 49,650');
  // the day moved past today, and back into the past
  for (const to of ['2026-10-20', '2026-10-01']) {
    const Q = wr(P, 'set', item(M0, 'b'), { date: to }, ms('2026-10-17T12:00:00Z'), BY), M1 = C(L, Q, T);
    same([fig(M1), asRec(Q, 'b')], [[49650, 0, ['f'], 'row'], true], `2: its day moved to ${to} - it holds what it held (its memory is a record's), and the mark still counts nothing: 49,650`);
    // 3. the next change, to another line: a withdrawal of Misha's added - and the seeing and the keeping alone
    const R = page(Q, (X) => { X.div.push(wd('m', 500, '2026-10-25', { name: 'Misha', c0: ms('2026-10-17T13:00:00Z') })); return X; }), M2 = C(L, R, T);
    same([fig(M2), asRec(R, 'b')], [[49650, 0, ['f'], 'row'], true], `3: (${to}) a change to another line after it: the memory written again is still a record's, and holds`);
    const S = keep(clone(R), see(R)), M3 = C(L, S, T);
    same([fig(M3), asRec(S, 'b')], [[49650, 0, ['f'], 'row'], true], `3: (${to}) … and so does one written by the seeing and the keeping around no change`);
  }
}
// 4. A record's row taken in part stays the record's whole once a memory holds it. Vanya's 360 (12 Oct) uploaded at
// 10:00; «Vanya» 350 written at 10:01 and marked at 10:02; «Вывод» 1,000 (13 Oct), everybody's, written on 1 Oct.
// The record takes 350 of the 360, and the 10 over is the row's rest «вне плана» (W2) - «Вывод» takes nothing of it.
// Its day moved past today, the record is held by its memory: still 350, still the rest of 10 «вне плана», and
// «Вывод» still nothing - not the 10, which the walk would pass on to the next withdrawal of a row it dealt.
{
  const T = '2026-10-17';
  const L = ledger([filed('f', '2026-10-12', -360, 'vanya', '', { at: ms('2026-10-12T10:00:00Z') })]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-10', { at: ms('2026-10-10T17:00:00Z') })],
    div: [wd('w', 1000, '2026-10-13', { name: 'Вывод', c0: ms('2026-10-01T08:00:00Z') }),
      wd('b', 350, '2026-10-12', { name: 'Vanya', c0: ms('2026-10-12T10:01:00Z'), paid: { on: '2026-10-12', at: ms('2026-10-12T10:02:00Z'), by: BY } })] });
  const rest = (M) => { const z = ((M.months.by['2026-10'] || {}).off || { by: {} }).by.div || { rows: [] }, r = z.rows.find((x) => x.id === 'f'); return r ? [r.amt, r.part] : null; };
  const fig = (M) => [M.now, item(M, 'b').rows, item(M, 'b').wd.got, item(M, 'w').wd.got, rest(M)];
  const M0 = C(L, P, T);
  same(fig(M0), [49640, ['f'], 350, 0, [10, { of: 360, took: 350 }]], '4: the record takes 350 of the 360; the 10 over stands «вне плана»; «Вывод» takes none of it');
  const Q = wr(P, 'set', item(M0, 'b'), { date: '2026-10-20' }, ms('2026-10-17T12:00:00Z'), BY), M1 = C(L, Q, T);
  same([fig(M1), asRec(Q, 'b')], [[49640, ['f'], 350, 0, [10, { of: 360, took: 350 }]], true], '4: its day moved past today, held by its memory - the 10 is still the row\'s rest «вне плана», not «Вывод»\'s');
}
// 5. A memory's claim on a taking it could not be given keeps no record from it. «Вывод» 2,400 of Misha's (29 Sep),
// marked for 13 Oct, holds a memory written when it held 60 of his 60 of 12 Oct. Since then a statement brought his
// 2,400 of 30 Sep: news, dealt first by its earlier day - it fills «Вывод», and the 60 is not given (the walk deals
// news so). «Миша» 350 (11 Oct), marked, is a record of his 290 (11 Oct) and that 60 (12 Oct): 290 + 60 = 350.
// Read with the stale claim, the 60 was refused to it - no record; the seeing and the keeping around no change took
// the memory out, and made it one. «Денег сейчас»: Wise 50,000 typed for 6 Oct; the 2,400 of 30 Sep is inside it,
// the 290 and the 60 after it: 49,650 - and no mark counts.
{
  const T = '2026-10-13', hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const ref = (id, c) => hash('k|' + id + '|' + c);   // the page's name for a taking (refOf in D2): the statement's key and the founder
  const L = ledger([filed('a', '2026-10-12', -60, 'misha', '', { at: ms('2026-10-10T09:00:00Z') }), filed('b', '2026-10-11', -290, 'misha', '', { at: ms('2026-10-10T09:00:00Z') }), filed('n', '2026-09-30', -2400, 'misha', '', { at: ms('2026-10-13T09:00:00Z') })]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-06', { at: ms('2026-10-06T17:00:00Z') })], div: [
    wd('x', 2400, '2026-09-29', { name: 'Вывод', whose: 'misha', c0: ms('2026-10-09T08:00:00Z'), paid: { on: '2026-10-13', at: ms('2026-10-12T19:00:00Z'), by: BY, saw: { w: 'misha', from: '2026-09-19', to: '2026-10-19', rows: [[ref('a', 'misha'), 60], [ref('b', 'misha'), 0]] } } }),
    wd('r', 350, '2026-10-11', { name: 'Миша', c0: ms('2026-10-09T08:00:00Z'), paid: { on: '2026-10-11', at: ms('2026-10-11T10:00:00Z'), by: BY } })] });
  const M0 = C(L, P, T), flat = (M) => { const Q = clone(M); bare(Q).items.forEach((it) => { if (it.wd) { delete it.wd.from; delete it.wd.to; } }); return JSON.stringify(Q); };
  same([item(M0, 'x').rows, item(M0, 'r').rows, !!item(M0, 'r').wd.rec, M0.now, M0.marksGbp], [['n'], ['b', 'a'], true, 49650, 0], '5: news of 30 Sep fills «Вывод»; «Миша» is a record of the 290 and the 60 its memory could not give: 49,650');
  const M1 = C(L, keep(clone(P), see(P)), T);
  same(flat(M1) === flat(M0), true, '5: … and the seeing and the keeping around no change leave the model as it is');
}
console.log(bad ? `${bad} of ${n} failed` : `all ${n} held`);
process.exit(bad ? 1 : 0);
