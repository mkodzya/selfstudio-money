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
//   6. (the owner's decision of 19 October 2026, F) The founder's own October, on made-up sums: a record closed by two
//      Wise transfers whose fees Wise folded into them came to a few pounds over its sum, and the over stood «вне
//      плана · часть … из …» as his money. Counted without the fees they make the record exactly: no rest, no fee in
//      «Дивиденды»; the fees are a line of their own, per bank. A fee row of its own in a founder's block is no taking.
//      Fails on develop before the fees (pre.cjs): ENGINE=pre runs the cases there.
//   7.-9. What the review of the fees (19 October 2026) found, each failing without its fix: a record's memory written
//      by the page before the fees (1.13.0, on prod) gave the record less than its sum, and its «часть» stood «вне
//      плана» for good (7); a line written at the amount that left the bank waited for the fee inside it, and the fee
//      was counted twice (8); and Live.fee took a landlord's service charges on Barclays, a firm called «Charges …» and
//      an agent's «Комиссия за привлечение клиента …» for bank fees (9). 7 and 8 fail on pre.cjs too: it reads no fee.
//   10. (found on the test stand on 19 October 2026, before prod) Wise's statement in Russian writes the fee inside a
//      payment with a decimal comma, «(fee: 1,85 GBP)», and Live.fee read the comma as a thousands mark - the fee a
//      hundred times too large. The rows of that statement's shapes, beside a dot and foldFees' own words, and a figure
//      «1 234,56». Fails on 64975ab (the fees as merged) and on pre.cjs. And what the review of that fix found: fee's
//      words that are no figure and code («(fee: -1,00 GBP)») beside a fee that is, and Mosta's «комиссия 1e-7» and
//      «1,5%», were read as a fee of the rest, or of the digits before the «e» or the «%»; now they say no fee.
//   11. (the same review) A text over 120 characters with two «(fee: …)» apart was kept with one of them twice, and the
//      filed row's fee counted twice (text120). Fails on 64975ab and on the fix before the review, and on pre.cjs, which
//      has no text120.
// usage: ENGINES=<folder> [ENGINE=pre] node checks/withdrawals/cases.cjs        (new.cjs is asked; dev.cjs is not)
const { ms, filed, ledger, bal, wd, plan3, mk, engines, clone, bare, feeOf, figOf, unfee, gCheck, wCheck, FX } = require('./lib.cjs');
const { NEW, PRE } = engines(), ASKED = process.env.ENGINE === 'pre' ? PRE : NEW, { C, wr, page, see, keep } = mk(ASKED);
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
// 6. Wise 40,000 typed for 1 Oct. «Vanya» 2,400 (12 Oct) written on 14 Oct at 16:00 and marked paid for the 12th;
// «Вывод» 500, everybody's, for 14 Oct, written on 1 Oct. Uploaded on 15 Oct: Vanya's 1,603.20 and 805.25 of 12 Oct,
// «(fee: 3.20 GBP)» and «(fee: 5.25 GBP)», and a fee row of its own of 9, «Комиссия за перевод …», filed in Misha's
// block on 14 Oct. Without the fees Vanya's transfers are 1,600 + 800 = 2,400: the record holds both whole and is
// done; nothing of his stands outside the plan (before: 2,408.45 - the record took 2,400 and 8.45 of the 805.25 stood
// «вне плана · часть £8.45 из £805.25»). The month's dividends are 2,400, its fees 3.20 + 5.25 + 9 = 17.45, all
// Wise's. The fee row is no taking: «Вывод» holds nothing (before: 9 of it, and 491 to go - so «Можно вывести» is
// lower by those 9 now: a fee is not a founder's money, and the withdrawal still has its 500 to go). «Денег сейчас»
// is the same: 40,000 − 1,603.20 − 805.25 − 9 = 37,582.55.
{
  const T = '2026-10-17', U = ms('2026-10-15T09:00:00Z'), W = ms('2026-10-14T16:00:00Z');
  const fe = (r, t) => { r.o.t = t; return r; };
  const L = ledger([fe(filed('vA', '2026-10-12', -1603.2, 'vanya', '', { at: U }), 'Sent money to Vanya Example (fee: 3.20 GBP)'), fe(filed('vB', '2026-10-12', -805.25, 'vanya', '', { at: U }), 'Sent money to Vanya Example (fee: 5.25 GBP)'),
    fe(filed('mf', '2026-10-14', -9, 'misha', '', { at: U }), 'Комиссия за перевод по документу № 12')]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 40000, '2026-10-01', { at: ms('2026-10-01T17:00:00Z') })],
    team: [{ id: 'tz', name: 'Person Z', amt: 3000, cur: 'GBP', bank: 'Wise', date: '2026-10-28', on: true, blk: 'cogs', c0: ms('2026-10-01T08:00:00Z') }],
    div: [wd('wR', 2400, '2026-10-12', { name: 'Vanya', c0: W, m: { t: W, by: BY }, paid: { on: '2026-10-12', at: W + 300000, by: BY } }), wd('wA', 500, '2026-10-14', { name: 'Вывод', c0: ms('2026-10-01T08:00:00Z') })] });
  const M = C(L, P, T), off = M.months.by['2026-10'].off.by.div.rows, fz = M.months.by['2026-10'].fees || { gbp: 0, banks: [] };
  same([item(M, 'wR').rows, item(M, 'wR').wd.got, !!item(M, 'wR').wd.rec, item(M, 'wR').state, off.map((r) => [r.id, r.gbp])], [['vA', 'vB'], 2400, true, 'done', []],
    '6: «Vanya» is a record of his two transfers, counted without their fees - 2,400 exactly; nothing of his stands «вне плана»');
  same([M.month.blocks.div.fact, (M.month.blocks.fee || {}).fact, fz.gbp, fz.banks.map((b) => [b.bank, b.gbp])], [2400, 17.45, 17.45, [['Wise', 17.45]]],
    '6: October\'s dividends are 2,400; its fees 17.45 - 3.20 + 5.25 inside the transfers and the fee row of 9 - all Wise\'s');
  same([item(M, 'wA').wd.got, item(M, 'wA').rows, M.now], [0, [], 37582.55], '6: the fee row filed in Misha\'s block is no taking - «Вывод» holds nothing; «Денег сейчас» 37,582.55: the fees left the bank');
}
// 7. (the review of the fees, 19 October 2026) A record's memory written by the page before the fees - 1.13.0, on prod
// - holds the record's rows at what they gave WITH the fee inside. «Misha» 1,500 (12 Oct) is a record of his Wise
// transfers A 306.20 «(fee: 1.20 GBP)» and B 1,197.80 «(fee: 2.80 GBP)» of 12 Oct; the page before took A whole and
// 1,193.80 of B, so its memory says [A 306.20, B 1,193.80], and B's 4.00 stood «вне плана · часть». Read with the fees,
// A gives 305 - its fee is no taking - and the 1.20 it gave of its fee must go to B, which the record held in part: B
// gives 1,195, its whole without the fee, and the record is 1,500 again with no rest «вне плана» - exactly what a
// memory written with the fees says ([305, 1195]). Held to the old figure, B gave 1,193.80 and «часть £1.20 из £1,195»
// stood «вне плана» for good: the seeing and the keeping wrote [305, 1193.80] and never healed it. Two ways such a
// memory is written: (a) the card moved the record's day past today (case 2's way); (b) a tie by hand taken off
// another line set a nearer row loose, and the record's mark cannot count - a memory of a balance's day (case 1's).
// Wise 50,000 - typed for 10 Oct in (a), for 12 Oct in (b); the transfers left after it either way: 48,496.00.
{
  const O = mk(engines().PRE), U = ms('2026-10-12T10:00:00Z');
  const fe = (r, t) => { r.o.t = t; return r; };
  const AB = (at) => [fe(filed('A', '2026-10-12', -306.2, 'misha', '', { at }), 'Sent money to Misha Example (fee: 1.20 GBP)'), fe(filed('B', '2026-10-12', -1197.8, 'misha', '', { at }), 'Sent money to Misha Example (fee: 2.80 GBP)')];
  const rests = (M) => ((((M.months.by['2026-10'] || {}).off || { by: {} }).by.div) || { rows: [] }).rows.filter((r) => r.part).map((r) => [r.id, r.amt]);
  const fig = (M) => [M.now, M.marksGbp, item(M, 'r').rows, item(M, 'r').wd.got, rests(M)];
  const memOfR = (P) => P.div.find((x) => x.id === 'r').paid.saw.rows.map((x) => x[1]);
  // (a) - its day moved past today
  {
    const T = '2026-10-17', L = ledger(AB(U));
    const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-10', { at: ms('2026-10-10T17:00:00Z') })],
      div: [wd('r', 1500, '2026-10-12', { name: 'Misha', c0: ms('2026-10-12T10:01:00Z'), paid: { on: '2026-10-12', at: ms('2026-10-12T10:02:00Z'), by: BY } })] });
    const m0 = O.C(L, P, T), Q = O.wr(P, 'set', item(m0, 'r'), { date: '2026-10-20' }, ms('2026-10-17T12:00:00Z'), BY);
    same([asRec(Q, 'r'), memOfR(Q)], [true, [306.2, 1193.8]], '7a: the page before the fees wrote the record\'s memory with the fee inside: [306.20, 1,193.80]');
    const M = C(L, Q, T);
    same(fig(M), [48496, 0, ['A', 'B'], 1500, []], '7a: read with the fees, that memory gives the record 305 + 1,195 = 1,500 - no «часть» stands «вне плана»');
    const K = keep(clone(Q), see(Q));
    same([fig(C(L, K, T)), memOfR(K)], [[48496, 0, ['A', 'B'], 1500, []], [305, 1195]], '7a: … and the seeing and the keeping around no change write it as the fees read it: [305, 1195]');
  }
  // (b) - a memory of a balance's day: «Вывод» held Misha's 1,500 of 11 Oct by hand, and is deleted
  {
    const T = '2026-10-13', U2 = ms('2026-10-13T11:00:00Z'), C8 = ms('2026-10-13T08:00:00Z');
    const L = ledger(AB(U2).concat([filed('g', '2026-10-11', -1500, 'misha', '', { at: U2 })]));
    const P = plan3({ banks: [bal('Wise', 'GBP', 50000, '2026-10-12', { at: ms('2026-10-13T09:00:00Z') })],
      div: [wd('a', 1500, '2026-10-11', { name: 'Вывод', tx: ['g'], c0: C8 }), wd('r', 1500, '2026-10-11', { name: 'Misha', c0: C8, paid: { on: '2026-10-12', at: ms('2026-10-13T10:00:00Z'), by: BY } })] });
    const m0 = O.C(L, P, T), Q = O.wr(P, 'del', item(m0, 'a'));
    same([asRec(Q, 'r'), memOfR(Q)], [true, [306.2, 1193.8]], '7b: the page before the fees wrote the memory of the balance\'s day with the fee inside: [306.20, 1,193.80]');
    same(fig(C(L, Q, T)), [48496, 0, ['A', 'B'], 1500, []], '7b: read with the fees, the record is made of its two takings of that day again, 305 + 1,195 - no «часть»');
  }
}
// 8. (the review of the fees, 19 October 2026) A line other than a withdrawal written at the amount that left the
// bank closes as it did before the fees. A founder writes what he will pay - the sheet and the helper's «как в
// прошлый раз» say amounts with the fee inside - and the bank's fee left with it. Counted only without the fee, a
// line closed no more where the fee was larger than −max(£2, 2%) of it: it waited for the fee, the fee stood twice in
// the month's «Расход» (once a fee, once the line's rest) and «Можно вывести» was lower by it. So a line closes on a
// row whose whole amount or whose amount without the fee fits it, and what it has been paid is the whole amount: the
// month counts each row without its fee in its block and the fee once. Mosta $150 «Перевод 145 USDT, комиссия 5»
// against «Person M» $150; Wise 52.50 «(fee: 2.50 GBP)» against «Courier» 52.50; 1,000 «(fee: 30.00 GBP)» against
// «Person X» 1,000; two of 150 «(fee: 5.00 GBP)» against «Person Y» 300 (150 is paid of it by the first, the second
// closes it); 52.50 «(fee: 2.50 GBP)» tied by hand to «Tools» 52.50; and $110 «Перевод 100 USDT, комиссия 10» against
// «Person N» $100, written at what the person gets. Spending: team 1,441.48 + other 100 + fees 56.11 = 1,597.59 -
// what the rows took from the banks, as the page before the fees counted it (team 1,492.59 + other 105). Before
// this review five of the six waited, and «Можно вывести» was 36,316.67, lower by 48.70.
{
  const T = '2026-10-17', U = ms('2026-10-15T09:00:00Z'), C1 = ms('2026-10-01T08:00:00Z');
  const fe = (r, t) => { r.o.t = t; return r; }, ln = (id, name, amt, date, more) => ({ id, name, amt, cur: 'GBP', bank: 'Wise', date, on: true, c0: C1, m: { t: C1, by: BY }, ...more });
  const L = ledger([
    fe(filed('mp', '2026-10-06', -150, 'cogs', 'Person M', { b: 'Mosta', cur: 'USD', at: U }), 'Перевод 145 USDT, комиссия 5 · OMNIBUS_CRYPTO_TRANSFER'),
    fe(filed('mn', '2026-10-07', -110, 'cogs', 'Person N', { b: 'Mosta', cur: 'USD', at: U }), 'Перевод 100 USDT, комиссия 10 · OMNIBUS_CRYPTO_TRANSFER'),
    fe(filed('co', '2026-10-07', -52.5, 'other', 'Courier', { at: U }), 'Sent money to Courier Co (fee: 2.50 GBP)'),
    fe(filed('pX', '2026-10-08', -1000, 'cogs', 'Person X', { at: U }), 'Sent money to Person X (fee: 30.00 GBP)'),
    fe(filed('hT', '2026-10-09', -52.5, 'other', 'Tool H', { at: U }), 'Sent money to Tool H Ltd (fee: 2.50 GBP)'),
    fe(filed('y1', '2026-10-06', -150, 'cogs', 'Person Y', { at: U }), 'Sent money to Person Y (fee: 5.00 GBP)'),
    fe(filed('y2', '2026-10-08', -150, 'cogs', 'Person Y', { at: U }), 'Sent money to Person Y (fee: 5.00 GBP)')]);
  const P = plan3({ banks: [bal('Wise', 'GBP', 40000, '2026-10-01'), bal('Mosta', 'USD', 4000, '2026-10-01')],
    team: [ln('tM', 'Person M', 150, '2026-10-06', { blk: 'cogs', bank: 'Mosta', cur: 'USD' }), ln('tN', 'Person N', 100, '2026-10-07', { blk: 'cogs', bank: 'Mosta', cur: 'USD' }),
      ln('tX', 'Person X', 1000, '2026-10-08', { blk: 'cogs' }), ln('tY', 'Person Y', 300, '2026-10-06', { blk: 'cogs' })],
    other: [ln('oC', 'Courier', 52.5, '2026-10-07', { blk: 'other' }), ln('oH', 'Tools', 52.5, '2026-10-09', { blk: 'other', tx: ['hT'] })] });
  const M = C(L, P, T), B = M.month.blocks;
  same(['tM', 'tN', 'tX', 'tY', 'oC', 'oH'].map((id) => item(M, id).state), ['done', 'done', 'done', 'done', 'done', 'done'],
    '8: every line written at the amount that left the bank is closed by its row - and so is one written at what the person gets');
  same([B.team.fact, B.team.rest, B.other.fact, B.other.rest, (B.fee || {}).fact, Math.round((B.team.total + B.other.total + B.tax.total + B.div.total + ((B.fee || {}).total || 0)) * 100) / 100],
    [1441.48, 0, 100, 0, 56.11, 1597.59], '8: each block without its fees, no line waits for a fee, and October\'s spending is 1,597.59 - what left the banks, the fees counted once');
  same([M.now, M.free.now], [41365.37, 36365.37], '8: «Денег сейчас» 41,365.37 and «Можно вывести» 36,365.37 - as before the fees');
}
// 9. (the review of the fees, 19 October 2026) What is a bank's fee of its own, and what only looks like one. A
// landlord's service charges paid by bill or standing order on Barclays name «CHARGES» and «PERIOD» but begin with the
// payee, and carry Barclays' code for a payment; a firm called «Charges Consulting» begins with the word; an agent's
// commission begins «Комиссия за …». None is the bank's: filed so, each left its block - Fixed, COGS - for «Банковские
// комиссии» for good, since a fee row of its own counts as a fee whatever block it was filed in. Barclays' own charges
// begin with «CHARGES» (or «COMMISSION CHARGES») and name a PERIOD or nothing more; a bank's «Комиссия за …» names one
// of the bank's operations - an agent, an intermediary or a reward is never the bank's. Live.fee and the rule written
// out apart (feeOf, lib.cjs) agree, row for row.
{
  const r = (b, cur, a, t) => ({ d: '2026-10-09', b, a: Math.abs(a) / ({ GBP: 1, RUB: 118, USD: 1.35 })[cur], s: 'file', c: 'fixed', l: 'Thing', o: { a, cur, t } });
  const rows = [
    r('Barclays', 'GBP', -18.5, 'CHARGES ACCOUNT FEES PERIOD 01SEP 30SEP'), r('Barclays', 'GBP', -18.5, 'COMMISSION CHARGES'), r('Barclays', 'GBP', -21, 'COMMISSION CHARGES PERIOD 01OCT 31OCT'),
    r('Tochka', 'RUB', -590, 'Комиссия за осуществление валютного контроля по документу № 41'), r('Tochka', 'RUB', -1180, 'Комиссия за операцию "Международный перевод" по документу № 42'),
    r('Tochka', 'RUB', -1180, 'Комиссия за перевод собственных средств по документу № 43'), r('Mosta', 'USD', -25, 'Комиссия за пополнение кошелька · BRL_WIRE_ONRAMP'), r('Wise', 'GBP', -0.4, 'Wise Charges for: TRANSFER-77'),
    // the false friends
    r('Barclays', 'GBP', -1250, 'ACME PROPERTY MGMT SERVICE CHARGES PERIOD Q4 BBP'), r('Barclays', 'GBP', -2000, 'LANDLORD LTD SERVICE CHARGES PERIOD OCT STO'),
    r('Barclays', 'GBP', -600, 'CHARGES CONSULTING LTD INV 7 BBP'), r('Barclays', 'GBP', -300, 'CHARGES PERIOD SERVICES FPO'),
    r('Tochka', 'RUB', -50000, 'Комиссия за привлечение клиента по агентскому договору № 3'), r('Tochka', 'RUB', -20000, 'Комиссия за перевод клиента по агентскому договору № 4'),
    r('Tochka', 'RUB', -9000, 'Комиссия за продажу товара комитента по договору № 5')];
  const got = rows.map((x) => !!(ASKED.fee && ASKED.fee(x)));
  same(got, [true, true, true, true, true, true, true, true, false, false, false, false, false, false, false],
    '9: Barclays\' own charges, the banks\' own «Комиссия за …» and Wise\'s are fees of their own; a landlord\'s service charges, a firm called «Charges», an agent\'s and a consignor\'s commission are not');
  same(rows.map((x) => !!feeOf(x)), got, '9: … and the rule written out apart from the page (feeOf) says the same, row for row');
}
// 10. (19 October 2026, found on the test stand before prod) A fee written with a decimal comma. Wise's statement in
// Russian writes the fee inside a payment as «(fee: 1,85 GBP)»; Live.fee took the comma for a thousands mark and read
// 185, a hundred times the fee, and the month's «Банковские комиссии» of Wise came to thousands of pounds. Every check
// had written the fee with a dot. Now one reader, feeNum, reads the figure of Wise's «(fee: X CUR)» and of Mosta's
// «комиссия X»: a dot, a comma, thousands by a comma, a dot or a space (also no-break, U+00A0, and narrow no-break,
// U+202F), the later of a comma and a dot the decimal one; «1,234» - a thousand, or one and a bit? - is read as no fee.
// Wise £100,000 and Mosta $4,000 typed for 1 Oct; uploaded on 15 Oct, every figure made up:
//   wO  own transfer      1,504.15  «Отправлено Self Studio Example Ltd (fee: 4,15 GBP)»        fee 4.15     net 1,500 - in no flow
//   wC  a contractor        702.45  «Отправлено Person C (fee: 2,45 GBP)»                        fee 2.45     net 700    COGS
//   wS  card, in dollars    116.72  «Транзакция по карте на сумму 157,00 USD, списана Example Shop (fee: 0,42 GBP)»
//                                                                                                 fee 0.42     net 116.30 Fixed
//   wV  Vanya's             451.85  «Отправлено Vanya Example (fee: 1,85 GBP)»                   fee 1.85     net 450   «Дивиденды»
//   wD  a dot               250.65  «Sent money to Person D (fee: 0.65 GBP)»                     fee 0.65     net 250    COGS
//   wF  foldFees' words     603.10  «Sent money to Courier F» + « (fee: 3.10 GBP)», toFixed(2)   fee 3.10     net 600    Other
//   wA  «1 234,56»       41,234.56  «Отправлено Acme Ltd (fee: 1 234,56 GBP)», a no-break space fee 1,234.56 net 40,000 COGS
//   mT  Mosta, a dot       $300.00  «Перевод 296.10 USDT, комиссия 3.90 · …» - £222.22           fee $3.90 = £2.89 (222.22 × 3.90 / 300), net £219.33  COGS
//   mU  Mosta, a comma     $120.00  «Перевод 118,80 USDT, комиссия 1,20 · …» - £88.89            fee $1.20 = £0.89 (88.89 × 1.20 / 120), net £88.00    COGS
// «Vanya» 450, written on 14 Oct and marked «Оплачено» for 12 Oct, is a record of his 451.85 without its fee - 450
// exactly, no «часть» «вне плана» (on 64975ab: a fee of 185, his row worth 266.85, no record). October's fees: Wise
// 4.15 + 2.45 + 0.42 + 1.85 + 0.65 + 3.10 + 1,234.56 = £1,247.18; Mosta $5.10 = £2.89 + £0.89 = £3.78; £1,250.96 in all
// (on 64975ab: Wise 415 + 245 + 42 + 185 + 0.65 + 3.10 and no fee in «1 234,56» = £890.75). COGS 700 + 250 + 40,000 +
// 219.33 + 88 = 41,257.33; Other 116.30 + 600 = 716.30; dividends 450; the result −43,674.59 - what left the banks
// (£44,863.48 from Wise, $420 = £311.11 from Mosta) less the own transfer's 1,500. «Денег сейчас» is what the same table
// gives with the fees' words taken out: £100,000 − 44,863.48 + $3,580 at 1.35 (£2,651.85) = 57,788.37.
{
  const T = '2026-10-17', U = ms('2026-10-15T09:00:00Z'), W = ms('2026-10-14T16:00:00Z');
  const fe = (r, t) => { r.o.t = t; return r; };
  // (the reader alone: what each shape reads as, on the page and in the rule written out apart - null is no fee)
  const figs = [['1.47', 1.47], ['1,47', 1.47], ['0,38', 0.38], ['12', 12], ['1,5', 1.5], ['1.234', 1.234], ['1,234.56', 1234.56], ['1.234,56', 1234.56],
    ['1 234,56', 1234.56], ['1\u00a0234,56', 1234.56], ['1\u202f234,56', 1234.56], ['1 234.56', 1234.56], ['1\u00a0234', 1234], ['1,234,567.89', 1234567.89],
    ['1,234', null], ['12,345', null], ['1,2345', null], ['12,34.5', null], ['1 234,567', null], ['1,234,56', null], ['12 34', null], ['1,23 4', null], ['1.5.6', null], ['', null]];
  same(figs.map(([s]) => (ASKED.feeNum ? ASKED.feeNum(s) : 'no reader')), figs.map((x) => x[1]),
    '10: the fee\'s figure - a dot, a decimal comma, thousands by a comma, a dot or a space of any of three kinds - is read; «1,234» and every shape not certain is no figure');
  same(figs.map(([s]) => figOf(s)), figs.map((x) => x[1]), '10: … and the reader written out apart from the page (figOf) says the same, shape for shape');
  const L = ledger([
    fe(filed('wO', '2026-10-03', -1504.15, 'skip', '', { at: U }), 'Отправлено Self Studio Example Ltd (fee: 4,15 GBP)'),
    fe(filed('wC', '2026-10-06', -702.45, 'cogs', 'Person C', { at: U }), 'Отправлено Person C (fee: 2,45 GBP)'),
    fe(filed('wS', '2026-10-07', -116.72, 'fixed', 'Tool S', { at: U }), 'Транзакция по карте на сумму 157,00 USD, списана Example Shop (fee: 0,42 GBP)'),
    fe(filed('wV', '2026-10-12', -451.85, 'vanya', '', { at: U }), 'Отправлено Vanya Example (fee: 1,85 GBP)'),
    fe(filed('wD', '2026-10-08', -250.65, 'cogs', 'Person D', { at: U }), 'Sent money to Person D (fee: 0.65 GBP)'),
    fe(filed('wF', '2026-10-09', -603.1, 'other', 'Courier F', { at: U }), 'Sent money to Courier F' + ' (fee: ' + (3.1).toFixed(2) + ' GBP)'),
    fe(filed('wA', '2026-10-10', -41234.56, 'cogs', 'Acme Ltd', { at: U }), 'Отправлено Acme Ltd (fee: 1\u00a0234,56 GBP)'),
    fe(filed('mT', '2026-10-06', -300, 'cogs', 'Person M', { b: 'Mosta', cur: 'USD', at: U }), 'Перевод 296.10 USDT, комиссия 3.90 · OMNIBUS_CRYPTO_TRANSFER'),
    fe(filed('mU', '2026-10-07', -120, 'cogs', 'Person N', { b: 'Mosta', cur: 'USD', at: U }), 'Перевод 118,80 USDT, комиссия 1,20 · OMNIBUS_CRYPTO_TRANSFER')]);
  // each row's fee and what it is without it - in its own currency and in pounds - to the penny
  const r2 = (v) => Math.round(v * 100) / 100, net = (r, f) => (f ? [r2(-r.o.a - f.n), r2(r.a - f.g)] : null);
  const fees = L.tx.map((r) => { const f = ASKED.fee && ASKED.fee(r); return f ? [r.id, f.whole, f.bank, f.cur, f.n, f.g, ...net(r, f)] : [r.id, null]; });
  same(fees, [['wO', false, 'Wise', 'GBP', 4.15, 4.15, 1500, 1500], ['wC', false, 'Wise', 'GBP', 2.45, 2.45, 700, 700], ['wS', false, 'Wise', 'GBP', 0.42, 0.42, 116.3, 116.3],
    ['wV', false, 'Wise', 'GBP', 1.85, 1.85, 450, 450], ['wD', false, 'Wise', 'GBP', 0.65, 0.65, 250, 250], ['wF', false, 'Wise', 'GBP', 3.1, 3.1, 600, 600],
    ['wA', false, 'Wise', 'GBP', 1234.56, 1234.56, 40000, 40000], ['mT', false, 'Mosta', 'USD', 3.9, 2.89, 296.1, 219.33], ['mU', false, 'Mosta', 'USD', 1.2, 0.89, 118.8, 88]],
    '10: each fee read to the penny - a decimal comma (Wise in Russian, Mosta), a dot, foldFees\' words, «1 234,56» with a no-break space - and each row without it');
  same(L.tx.map((r) => { const f = feeOf(r); return f ? [r.id, f.whole, f.n, f.g] : [r.id, null]; }), fees.map((x) => (x[1] === null ? x : [x[0], x[1], x[4], x[5]])),
    '10: … and the rule written out apart from the page (feeOf) reads the same, row for row');
  // a figure the reader cannot read for certain makes no fee - the row counts whole, as before the fees, never a guess
  const odd = [['Отправлено Person G (fee: 1,234 GBP)', -1301.23], ['Отправлено Person G (fee: 12,34.5 GBP)', -100], ['Sent money to Person G (fee: 1,234 GBP) (fee: 0.50 GBP)', -1301.73]]
    .map(([t, a]) => ({ d: '2026-10-09', b: 'Wise', a: -a, s: 'file', c: 'cogs', l: 'Person G', o: { a, cur: 'GBP', t } }));
  same([odd.map((r) => (ASKED.fee ? ASKED.fee(r) : 'no fee test')), odd.map(feeOf)], [[null, null, null], [null, null, null]],
    '10: «(fee: 1,234 GBP)» - a thousand, or one and a bit? - and a figure of no certain shape say no fee: the row counts whole');
  // (the review of the fix, 19 October 2026) fee's words that are no figure and code - a sign, a pound sign, a space
  // after the comma - say no fee for the row too, never the other fee of its text without them (before: 0.50); and
  // Mosta's figure ends at a space, «·» or the text's end - «комиссия 1e-7», String() of a tiny fee as parseWallet
  // writes it, and «комиссия 1,5%» are no fee (before: 1 and 1.5). What still reads: a fee in another currency passed
  // over whatever its figure, and Mosta's figure before its code, with a thousands space, or at the end of the text.
  const rw = (b, cur, a, t) => ({ d: '2026-10-09', b, a: Math.round(-a / (cur === 'USD' ? 1.35 : 1) * 100) / 100, s: 'file', c: 'cogs', l: 'Person G', o: { a, cur, t } });
  const odd2 = [rw('Wise', 'GBP', -300, 'Sent money to Person G (fee: -1,00 GBP) (fee: 0,50 GBP)'), rw('Wise', 'GBP', -300, 'Sent money to Person G (fee: £1,00) (fee: 0,50 GBP)'),
    rw('Wise', 'GBP', -300, 'Sent money to Person G (fee: 1, 00 GBP) (fee: 0,50 GBP)'), rw('Mosta', 'USD', -1000, 'Перевод 1000 USDT, комиссия 1e-7 · OMNIBUS_CRYPTO_TRANSFER'),
    rw('Mosta', 'USD', -252, 'Перевод 250,50 USDT, комиссия 1,5% · OMNIBUS_CRYPTO_TRANSFER'),
    rw('Wise', 'GBP', -300, 'Sent money to Person G (fee: 1,234 EUR) (fee: 0,50 GBP)'), rw('Mosta', 'USD', -302.75, 'Перевод 300 USDT, комиссия 2,75 USDT · OMNIBUS_CRYPTO_TRANSFER'),
    rw('Mosta', 'USD', -5000, 'Перевод 3 765.5 USDT, комиссия 1 234.5 · OMNIBUS_CRYPTO_TRANSFER'), rw('Mosta', 'USD', -105, 'Перевод 100 USDT, комиссия 5')];
  const fn = (f) => (f ? f.n : null), want2 = [null, null, null, null, null, 0.5, 2.75, 1234.5, 5];
  same([odd2.map((r) => (ASKED.fee ? fn(ASKED.fee(r)) : 'no fee test')), odd2.map((r) => fn(feeOf(r)))], [want2, want2],
    '10: «(fee: -1,00 GBP)», «(fee: £1,00)», «(fee: 1, 00 GBP)» beside «(fee: 0,50 GBP)» say no fee for the row; Mosta\'s «комиссия 1e-7» and «1,5%» no fee; another currency\'s fee passed over, Mosta\'s «2,75 USDT ·», «1 234.5 ·» and «5» at the end read - on the page and in feeOf');
  const P = plan3({ banks: [bal('Wise', 'GBP', 100000, '2026-10-01', { at: ms('2026-10-01T17:00:00Z') }), bal('Mosta', 'USD', 4000, '2026-10-01', { at: ms('2026-10-01T17:00:00Z') })],
    div: [wd('wR', 450, '2026-10-12', { name: 'Vanya', c0: W, m: { t: W, by: BY }, paid: { on: '2026-10-12', at: W + 300000, by: BY } })] });
  const M = C(L, P, T), mo = M.months.by['2026-10'], fz = mo.fees || { gbp: 0, n: 0, banks: [] }, off = (k) => (((mo.off || { by: {} }).by[k]) || { rows: [] }).rows;
  same([item(M, 'wR').state, item(M, 'wR').rows, item(M, 'wR').wd.got, !!item(M, 'wR').wd.rec, off('div').map((r) => [r.id, r.amt, r.part || null])], ['done', ['wV'], 450, true, []],
    '10: «Vanya» 450 is a record of his 451.85 without its fee of 1,85 - 450 exactly; no «часть» stands «вне плана»');
  same([fz.gbp, fz.n, fz.banks.map((b) => [b.bank, b.gbp, b.nat.map((x) => [x.cur, x.n])])], [1250.96, 9, [['Wise', 1247.18, [['GBP', 1247.18]]], ['Mosta', 3.78, [['USD', 5.1]]]]],
    '10: October\'s fees by bank - Wise £1,247.18, Mosta $5.10 (£3.78) - nine fees, £1,250.96');
  same([off('team').map((r) => [r.id, r.gbp]).sort(), off('other').map((r) => [r.id, r.gbp]).sort(), ['rev', 'team', 'other', 'tax', 'div', 'fee', 'result'].map((k) => (M.month.blocks[k] || { fact: null }).fact)],
    [[['mT', 219.33], ['mU', 88], ['wA', 40000], ['wC', 700], ['wD', 250]], [['wF', 600], ['wS', 116.3]], [0, 41257.33, 716.3, 0, 450, 1250.96, -43674.59]],
    '10: every row in its block without its fee - COGS 41,257.33, Other 716.30, dividends 450 - the fees £1,250.96 once, the result −43,674.59');
  const M0 = C(unfee(L), P, T), up = () => {};
  same([M.now, M.now === M0.now, M.free.now === M0.free.now, gCheck(M, L, P, T, ASKED, up), wCheck(M, L, T, FX, up, P, false)], [57788.37, true, true, [], []],
    '10: «Денег сейчас» 57,788.37 and «Можно вывести» as with the fees\' words taken out; G and W hold');
}
// 11. (the review of the fix, 19 October 2026) A statement's text is kept to 120 characters when its row is filed
// (text120, in toTx), its fee's words kept whole at its end. A text with two «(fee: …)» that did not stand side by side
// had one of them, or both, written twice - the two joined were looked for in the first 120 characters, not each - and
// Live.fee counted the copies: one fee in «Разбор», a larger one once the row was filed. Each is kept once now, and a
// text with one fee's words or none is cut exactly as 64975ab cut it (written out below, on 20,000 made-up texts).
{
  const T120 = require(require('path').resolve(process.env.ENGINES, process.env.ENGINE === 'pre' ? 'pre.cjs' : 'new.cjs')).text120;
  const cut = (s) => (T120 ? T120(s) : 'no text120'), words = (s) => (String(s).match(/\(fee:[^)]*\)/gi) || []);
  const row = (t) => ({ d: '2026-10-09', b: 'Wise', a: 300, s: 'file', c: 'cogs', l: 'Person G', o: { a: -300, cur: 'GBP', t } });
  const fn = (f) => (f ? f.n : null);
  const texts = ['(fee: 1,00 GBP) ' + 'x'.repeat(90) + ' (fee: 0,50 GBP)', 'Sent money (fee: 1,00 GBP) to (fee: 0,50 GBP) ' + 'x'.repeat(100),
    'Sent money to Person G ' + 'y'.repeat(60) + ' (fee: 0,25 GBP) ' + 'z'.repeat(30) + ' (fee: 0,50 GBP) (fee: 1,25 GBP)'];
  same(texts.map((s) => { const c = cut(s); return [c.length <= 120, words(c).join(' '), ASKED.fee ? fn(ASKED.fee(row(c))) : 'no fee test', fn(feeOf(row(c)))]; }),
    [[true, '(fee: 1,00 GBP) (fee: 0,50 GBP)', 1.5, 1.5], [true, '(fee: 1,00 GBP) (fee: 0,50 GBP)', 1.5, 1.5], [true, '(fee: 0,25 GBP) (fee: 0,50 GBP) (fee: 1,25 GBP)', 2, 2]],
    '11: a text over 120 characters with two or three «(fee: …)» apart is kept with each of them once - its fee as the whole text says it: 1.50, 1.50, 2.00');
  // (64975ab's text120, written out: the rule for a text with one fee's words or none, which the review left as it was)
  const was = (s) => { s = String(s || ''); if (s.length <= 120) return s; const f = words(s).join(' '); return f && !s.slice(0, 120).includes(f) ? s.slice(0, Math.max(0, 119 - f.length)) + ' ' + f : s.slice(0, 120); };
  let seed = 20261019; const R = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const AB = 'abcdefghij KLMNOP 0123456789 ,.)(-·отправлено ';
  const fill = (k) => { let s = ''; for (let i = 0; i < k; i++) s += AB[Math.floor(R() * AB.length)]; return s; };
  let differ = 0, tried = 0;
  for (let i = 0; i < 20000; i++) {
    let s = fill(Math.floor(R() * 200));
    if (R() < 0.7) { const at = Math.floor(R() * (s.length + 1)), fz = '(fee: ' + (R() < 0.5 ? '1,85' : '12.40') + ' GBP)'; s = s.slice(0, at) + fz + s.slice(at); }
    if (words(s).length > 1) continue;
    tried++; if (cut(s) !== was(s)) differ++;
  }
  same([differ, tried > 19000], [0, true], '11: … and a text with one fee\'s words or none is cut exactly as 64975ab cut it');
}
console.log(bad ? `${bad} of ${n} failed` : `all ${n} held`);
process.exit(bad ? 1 : 0);
