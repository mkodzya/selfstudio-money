// A plan that holds no memory (paid.saw) is read as the page read it before the rule, byte for byte - but for the
// fields the page has gained since (lib.cjs, `bare`: what a mark would remember, whose takings a withdrawal holds,
// that a withdrawal is a record, what was paid outside the plan). The made-up studio on seven days, with hand marks
// on its lines; and random plans - half of them with what the owner decided on 17 October 2026 put in (gen.cjs,
// `news`). Held of every model:
//   N, D  the page reads a plan and a table as it reads them with every withdrawal named after a founder given that
//         owner by hand, and every move to or back from a Daily or Monthly account from October filed as a transfer
//         between own accounts (lib.cjs, `named` and `toOwn`) - byte for byte, the whole model;
//   F     and those two, where no withdrawal is a record (W1), are read as the page of before read them.
//   W     what lib.cjs, `wCheck`, holds of a record and of a rest (W1, W2) - of every model, records or not.
// usage: ENGINES=<folder> node checks/withdrawals/same.mjs [path to a money-demo.mjs]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { make, day, T } = require('./gen.cjs');
const { ms, clone, engines, bare, named, toOwn, wCheck, FX } = require('./lib.cjs');
const { NEW, DEV } = engines();
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// the made-up studio: scripts/money-demo.mjs of this checkout, or the file named
const demo = await import(pathToFileURL(path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'money-demo.mjs'))).href);
const strip = (M) => JSON.stringify(bare(M));
let n = 0, bad = 0, withSaw = 0, nd = 0, ndBad = 0, recs = 0;
const stat = {}, up = (k) => { stat[k] = (stat[k] || 0) + 1; };
const cmp = (L, P, t, o, what) => {
  n++;
  const a = NEW.compute(clone(L), clone(P), t, o), L2 = toOwn(L), P2 = named(P);
  const w = wCheck(JSON.parse(JSON.stringify(a)), L, t, FX, up, P, JSON.stringify(P).includes('"saw"'));
  if (w.length) { bad++; if (bad < 6) console.log('W:', what, w.slice(0, 2).join(' | ')); }
  if (JSON.stringify(a).includes('"saw"')) withSaw++;
  if (L2 !== L || P2 !== P) { nd++; if (JSON.stringify(NEW.compute(clone(L2), clone(P2), t, o)) !== JSON.stringify(a)) { ndBad++; bad++; if (bad < 6) console.log('N/D: NOT AS WRITTEN OUT', what); return; } }
  if (a.items.some((it) => it.wd && it.wd.rec)) { recs++; return; }
  const b = JSON.stringify(DEV.compute(clone(L2), clone(P2), t, o));
  if (strip(JSON.parse(JSON.stringify(a))) !== b) { bad++; if (bad < 6) console.log('DIFFERS', what); }
};
for (const t of ['2026-09-28', '2026-10-06', '2026-10-13', '2026-10-20', '2026-11-03', '2026-11-30', '2027-01-05']) {
  const L = demo.demoLedger(t), P = demo.demoPlan(t);
  for (const o of [{ H: 30 }, { H: 60 }, { H: 60, months: 0 }]) cmp(L, P, t, o, 'demo ' + t);
  // … with «Оплачено» and «Частично» of the old kind on its withdrawals and on a few other lines
  const M = NEW.compute(clone(L), clone(P), t, { H: 60 });
  const Q = clone(P);
  M.items.filter((it) => it.open && it.date && it.date <= day(t, 20)).forEach((it, i) => { if (i % 2) return; DEV.write.mark(Q, it, day(t, -(i % 5)), ms(day(t, -(i % 5)) + 'T12:00:00Z'), 'Mika'); });
  cmp(L, Q, t, { H: 60 }, 'demo with old marks ' + t);
  cmp(L, Q, day(t, 9), { H: 60 }, 'demo with old marks, nine days on ' + t);
}
console.log('demo:', n, 'models compared,', bad, 'differ;', withSaw, 'carried item.saw;', nd, 'read with N or D written out,', recs, 'held a record');
const n0 = n;
// (1,200 seeds: a plan with a record is not asked F, and marked withdrawals of a founder near rows of his are many here)
for (let seed = 1; seed <= 1200; seed++) { const g = make(seed, { marks: 'old', news: seed % 2 === 0 }); cmp(g.L, g.P, T, { H: 30 }, 'random ' + seed); if (seed % 3 === 0) cmp(g.L, g.P, day(T, 6), { H: 60 }, 'random later ' + seed); }
console.log('random:', n - n0, 'models compared; in all', bad, 'differ (' + ndBad + ' of them N or D);', withSaw, 'carried item.saw;', nd, 'read with N or D written out;', recs, 'held a record and were not asked F');
console.log('W:', JSON.stringify(stat));
process.exit(bad ? 1 : 0);
