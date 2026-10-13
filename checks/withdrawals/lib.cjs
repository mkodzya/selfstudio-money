// Plans and ledgers made by hand, in the shapes scripts/money-checks.mjs uses; the engines under test; and the page's
// way of changing a plan. Nothing here reads a real document: like the tests, it refuses beside a data/ folder.
const fs = require('fs'), path = require('path');
if (fs.existsSync(path.join(__dirname, '..', '..', 'data'))) { console.error('checks/withdrawals: this checkout holds data/ - not here'); process.exit(2); }
// ENGINES names a folder with new.cjs (the page as it is) and dev.cjs (the page before the rule) - see README.md
const engines = () => { const dir = process.env.ENGINES; if (!dir || !fs.existsSync(path.join(dir, 'new.cjs')) || !fs.existsSync(path.join(dir, 'dev.cjs'))) { console.error('ENGINES=<a folder with new.cjs and dev.cjs>: see checks/withdrawals/README.md'); process.exit(2); }
  return { NEW: require(path.resolve(dir, 'new.cjs')).Live, DEV: require(path.resolve(dir, 'dev.cjs')).Live }; };
const ms = (iso) => Date.parse(iso);
const round2 = (v) => Math.round(v * 100) / 100;
const FX = { USD: 1.35, EUR: 1.17, RUB: 118, AMD: 525 };
const C0 = ms('2026-10-06T08:00:00Z'), AT1 = ms('2026-10-05T09:00:00Z');
const filed = (id, d, amt, c, l = '', more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, v = 0, key = 'k|' + id } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  const forward = c === 'skip' || Math.sign(amt) === (c === 'rev' ? 1 : -1);
  return { id, d, a: forward ? g : -g, c, b, l, v, s: 'file', o: { a: amt, cur, t: l }, key, at };
};
const inbox = (id, d, amt, c, l, more = {}) => {
  const { cur = 'GBP', b = 'Wise', at = AT1, auto = !!c, key = 'k|' + id } = more;
  const g = round2(Math.abs(amt) / (cur === 'GBP' ? 1 : FX[cur]));
  return { id, f: 'file', d, b, ac: '', dir: amt > 0 ? 1 : -1, a: g, o: { a: amt, cur, t: l || 'unknown', p: '', h: '', fix: true }, key, s: 'file', c, l, v: 0, auto, twin: null, at };
};
const reach = (b, d, cur = 'GBP', at = AT1) => filed(`reach-${b}-${d}`, d, 0, 'skip', '', { b, cur, at });
const ledger = (tx = [], inb = []) => ({ v: 1, tx, inbox: inb, rules: [], fx: { ...FX }, history: {}, aliases: {}, own: [], ownSeen: [], holders: {} });
const bal = (bank, cur, amt, asOf, more = {}) => ({ id: `b-${bank}-${cur}`, name: `${bank} — ${cur}`, bank, cur, amt, asOf, at: ms(asOf + 'T17:00:00Z'), by: 'Mika', ...more });
const row = (id, name, amt, date, more = {}) => ({ id, name, amt, cur: 'GBP', bank: 'Wise', date, on: true, c0: C0, m: { t: C0, by: 'Mika' }, ...more });
const wd = (id, amt, date, more = {}) => row(id, more.name || 'Вывод ' + id, amt, date, { blk: 'div', ...more });
const plan3 = (parts = {}) => ({ v: 3, cushion: 5000, banks: [bal('Wise', 'GBP', 50000, '2026-10-05')], inflows: [], team: [], taxes: [], other: [], div: [], log: [], ...parts, tax: { since: '2026-10-06', rules: [], cl: {}, per: {}, ...(parts.tax || {}) } });
const clone = (x) => JSON.parse(JSON.stringify(x));
const item = (M, id) => M.items.find((it) => it.id === id) || null;
// What the model has gained since the page of before (a943def), taken out of it in place, so that the rest can be
// compared byte for byte: what a mark would remember (item.saw, item.sawDay), whose takings a withdrawal holds
// (item.wd.by), and what was paid outside the plan (months.by[ym].off, .wait).
const bare = (M) => { M.items.forEach((it) => { delete it.saw; delete it.sawDay; if (it.wd) delete it.wd.by; });
  Object.values((M.months && M.months.by) || {}).forEach((o) => { delete o.off; delete o.wait; }); return M; };
// the page's own verbs, on a copy; the model item goes through JSON as it does in the checks
const mk = (Live) => {
  // `wr` changes the plan as the PAGE does (Plan.edit): what the marked withdrawals hold is seen, the change is
  // made, and it is kept - with the ledger and the day of the model computed last, which is what the page has in
  // hand. `raw` is the bare writer: a page from before the rule. On an engine without see/keep the two are the same.
  const cur = { L: null, T: null };
  const C = (L, P, T, o) => { cur.L = L; cur.T = T; return JSON.parse(JSON.stringify(Live.compute(clone(L), clone(P), T, o || { H: 30 }))); };
  const raw = (P, verb, ...a) => { const Q = clone(P); Live.write[verb](Q, ...clone(a)); return Q; };
  const see = (P) => (Live.write.see && cur.L ? Live.write.see(clone(P), clone(cur.L), cur.T) : []);
  const keep = (Q, seen) => { if (Live.write.keep && cur.L) Live.write.keep(Q, clone(cur.L), cur.T, clone(seen)); return Q; };
  // (a press that changes nothing in the document keeps nothing either - Plan.edit)
  const same = (A, B) => JSON.stringify(A) === JSON.stringify(B);
  const wr = (P, verb, ...a) => { const seen = see(P), Q = raw(P, verb, ...a); return same(Q, P) ? Q : keep(Q, seen); };
  const page = (P, f) => { const seen = see(P), Q = f(clone(P)); return same(Q, P) ? Q : keep(Q, seen); };   // a change made to the document by hand, the page's way
  return { C, wr, raw, page, see, keep };
};
module.exports = { ms, round2, filed, inbox, reach, ledger, bal, row, wd, plan3, clone, item, bare, mk, engines, C0, AT1 };
