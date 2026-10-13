// A plan that holds no memory (paid.saw) is read as the page read it before the rule, byte for byte - but for the
// fields the page has gained since (lib.cjs, `bare`: what a mark would remember, whose takings a withdrawal holds,
// what was paid outside the plan). The made-up studio on seven days, with hand marks
// on its lines; and random plans. usage: ENGINES=<folder> node checks/withdrawals/same.mjs [path to a money-demo.mjs]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { make, day, T } = require('./gen.cjs');
const { ms, clone, engines, bare } = require('./lib.cjs');
const { NEW, DEV } = engines();
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// the made-up studio: scripts/money-demo.mjs of this checkout, or the file named
const demo = await import(pathToFileURL(path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'money-demo.mjs'))).href);
const strip = (M) => JSON.stringify(bare(M));
let n = 0, bad = 0, withSaw = 0;
const cmp = (L, P, t, o, what) => { n++; const a = NEW.compute(clone(L), clone(P), t, o), b = JSON.stringify(DEV.compute(clone(L), clone(P), t, o)); if (JSON.stringify(a).includes('"saw"')) withSaw++; if (strip(JSON.parse(JSON.stringify(a))) !== b) { bad++; if (bad < 6) console.log('DIFFERS', what); } };
for (const t of ['2026-09-28', '2026-10-06', '2026-10-13', '2026-10-20', '2026-11-03', '2026-11-30', '2027-01-05']) {
  const L = demo.demoLedger(t), P = demo.demoPlan(t);
  for (const o of [{ H: 30 }, { H: 60 }, { H: 60, months: 0 }]) cmp(L, P, t, o, 'demo ' + t);
  // … with «Оплачено» and «Частично» of the old kind on its withdrawals and on a few other lines
  const M = NEW.compute(clone(L), clone(P), t, { H: 60 });
  const Q = clone(P); let k = 0;
  M.items.filter((it) => it.open && it.date && it.date <= day(t, 20)).forEach((it, i) => { if (i % 2) return; const Z = clone(Q); DEV.write.mark(Q, it, day(t, -(i % 5)), ms(day(t, -(i % 5)) + 'T12:00:00Z'), 'Mika'); k++; });
  cmp(L, Q, t, { H: 60 }, 'demo with old marks ' + t);
  cmp(L, Q, day(t, 9), { H: 60 }, 'demo with old marks, nine days on ' + t);
}
console.log('demo:', n, 'models compared,', bad, 'differ;', withSaw, 'carried item.saw');
const n0 = n;
for (let seed = 1; seed <= 600; seed++) { const g = make(seed, { marks: 'old' }); cmp(g.L, g.P, T, { H: 30 }, 'random ' + seed); if (seed % 3 === 0) cmp(g.L, g.P, day(T, 6), { H: 60 }, 'random later ' + seed); }
console.log('random:', n - n0, 'models compared; in all', bad, 'differ;', withSaw, 'carried item.saw');
process.exit(bad ? 1 : 0);
