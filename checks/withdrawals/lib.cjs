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
// (item.wd.by), that a withdrawal is a record (item.wd.rec, 17 October 2026 - W1), and what was paid outside the
// plan (months.by[ym].off, .wait).
const bare = (M) => { M.items.forEach((it) => { delete it.saw; delete it.sawDay; if (it.wd) { delete it.wd.by; delete it.wd.rec; } });
  Object.values((M.months && M.months.by) || {}).forEach((o) => { delete o.off; delete o.wait; }); return M; };
// The owner's decisions of 17 October 2026, written out here a second time, apart from the page, so that the scripts
// can hold the page to them (docs/handoff.md, the entry of that day):
// N - a withdrawal nobody chose an owner for (no `whose`, and not whose:"", «общий» chosen by hand) whose whole name
//     is one founder's (Mika/Мика, Misha/Миша, Vanya/Ваня; case and spaces aside) is that founder's. `named(P)`
//     writes that owner into a copy of the plan: the page must read P as it reads the copy, byte for byte.
// D - a row dated 2026-10-01 or later whose statement does not call it a payment by card, direct debit or standing
//     order, and that either says it was moved between that account and a founder's Daily or Monthly account - to
//     it or back from it, whichever way the money went - or is money that left the account filed in a founder's
//     block under «daily» or «monthly», is a transfer between own accounts. `toOwn(L)` files every such row so in a
//     copy of the table (c "skip", no label): the page must read L as it reads the copy, byte for byte.
// Each returns the very object it was handed when there is nothing to write, so `!==` says whether it did anything.
const FND = ['mika', 'misha', 'vanya'], NAMES = { mika: ['mika', 'мика'], misha: ['misha', 'миша'], vanya: ['vanya', 'ваня'] };
const nameOf = (name) => { const s = String(name == null ? '' : name).trim().toLowerCase(); return FND.find((k) => NAMES[k].includes(s)) || ''; };
const named = (P) => { let n = 0; const Q = clone(P);
  (Q.div || []).forEach((r) => { if (!r || r.ptax || FND.includes(r.whose) || r.whose === '') return; const k = nameOf(r.name); if (k) { r.whose = k; n++; } });
  return n ? Q : P; };
const isDaily = (r) => {
  if (!r || typeof r.d !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(r.d) || r.d < '2026-10-01') return false;
  const o = r.o && typeof r.o === 'object' ? r.o : {}, a = +o.a;
  const text = [o.p, o.t].filter((x) => typeof x === 'string').join(' ').toLowerCase();
  if (/card transaction|card payment|direct debit|standing order|транзакция по карте|оплата картой|покупка по карте|прямое списание|прямое дебетование|постоянное поручение/.test(text)) return false;
  const who = '(mika|misha|vanya|мика|миша|ваня)', moved = /перемещен|(^|[^a-z])moved([^a-z]|$)/.test(text) && new RegExp('(^|[^a-zа-яё])' + who + '\\s+(daily|monthly)([^a-zа-яё]|$)').test(text);
  if (moved) return true;
  const out = Number.isFinite(a) && a !== 0 ? a < 0 : r.dir ? r.dir < 0 : FND.includes(r.c) && +r.a > 0;
  return out && FND.includes(r.c) && new RegExp('^(' + who + '\\s+)?(daily|monthly)$').test(String(r.l == null ? '' : r.l).trim().toLowerCase());
};
const toOwn = (L) => { let n = 0; const fix = (r) => (isDaily(r) ? (n++, { ...r, c: 'skip', l: '' }) : r);
  const Q = { ...L, tx: (L.tx || []).map(fix), inbox: (L.inbox || []).map(fix) }; return n ? Q : L; };
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
// W - what the scripts hold of a record and of a rest (W1, W2), on any model of a plan and its table:
//   a record is a withdrawal that is somebody's, marked plainly «Оплачено» (no «Частично»), switched on, dated on or
//   before the day, and done; it holds one to four rows, all of its founder's block, none a Daily move, each dated
//   within five days of its date, and they come within the tolerance of its sum (one row: that row; more: their sum)
//   - −max(2, 2%) … +max(5, 5%) of its sum in pounds; no other line holds a row it holds; and it holds no more than
//   its sum. A rest line «вне плана» is a row that withdrawals hold, of a founder's block; what they took and the
//   rest make the row to the penny in its own currency; and over the rows withdrawals hold whose months show what
//   was paid outside the plan, the withdrawals' takings and the rests make those rows, to the penny in pounds.
//   A record that took a set took it because no single row fits - asked only of a plan that holds no memory (a
//   record's memory of a balance's day makes it of the takings it held). And a record is there wherever one should
//   be: a withdrawal that may be one (as above, and tied to no row by hand, its mark no word from the old «Касса»)
//   takes a single row that fits whenever its founder has one within five days that no line holds - asked only of a
//   plan that holds no memory (a memory may keep a row from a record).
// Returns the list of what failed (empty: all held), and counts into `up`.
const stored = (P, it) => { const r = (P.div || []).find((x) => String(x.id) === String(it.row || it.id)); if (!r) return null; return it.occ ? ((r.rec && r.rec.x) || {})[it.occ.ym] || {} : r; };
const wCheck = (M, L, T, FX, up, P, memory) => {
  const bad = [], rows = {}; (L.tx || []).concat(L.inbox || []).forEach((r) => { rows[String(r.id)] = r; });
  const held = {}; M.items.forEach((it) => it.rows.forEach((id) => { (held[id] = held[id] || []).push(it); }));
  const days = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5;
  M.items.filter((it) => it.wd && it.wd.rec).forEach((it) => {
    up('W1 records');
    const cap = it.cur === 'GBP' ? it.amt : it.amt / FX[it.cur], lo = Math.max(2, 0.02 * cap), hi = Math.max(5, 0.05 * cap);
    const rs = it.rows.map((id) => rows[id]), x = rs.reduce((s, r) => s + Math.abs(+(r && r.a) || 0), 0);
    if (!FND.includes(it.whose) || !it.mark || it.mark.amt !== null || !it.on || !(it.date <= T) || it.state !== 'done') bad.push('W1: ' + it.id + ' is a record and no withdrawal that may be one');
    if (!(rs.length >= 1 && rs.length <= 4) || rs.some((r) => !r || r.c !== it.whose || isDaily(r) || days(r.d, it.date) > 5)) bad.push('W1: ' + it.id + ' holds a row it may not');
    if (!(x >= cap - lo - 1e-6 && x <= cap + hi + 1e-6)) bad.push('W1: the rows of ' + it.id + ' do not come within its sum: ' + x + ' of ' + cap);
    if (it.rows.some((id) => held[id].length > 1)) bad.push('W1: a row of the record ' + it.id + ' is held by another line too');
    if (it.wd.got > it.amt + 0.011) bad.push('W1: ' + it.id + ' holds more than its sum');
    if (rs.length > 1) up('W1 records of two to four rows');
  });
  const lone = (it) => { const cap = it.cur === 'GBP' ? it.amt : it.amt / FX[it.cur], lo = Math.max(2, 0.02 * cap), hi = Math.max(5, 0.05 * cap);
    const taking = (r) => r.c === it.whose && !held[String(r.id)] && !isDaily(r) && r.o && +r.o.a < 0 && days(r.d, it.date) <= 5 && Math.abs(+r.a) >= cap - lo - 1e-6 && Math.abs(+r.a) <= cap + hi + 1e-6;
    return (L.tx || []).find(taking) || (L.inbox || []).find((r) => taking(r) && r.auto && String(r.l || '').trim() && !r.twin && !r.maybe && !r.rep); };
  // (asked where the plan holds no memory: a record's memory of a balance's day makes it of the takings it held, and
  // a row set loose since - a tie by hand taken off another line - may fit it alone)
  if (!memory) M.items.filter((it) => it.wd && it.wd.rec && it.rows.length > 1).forEach((it) => { if (lone(it)) bad.push('W1: ' + it.id + ' took a set where one row fits'); });
  if (!memory && P) M.items.filter((it) => it.wd && !it.wd.rec && FND.includes(it.whose) && it.on && it.amt > 0 && it.date && it.date <= T && it.mark && it.mark.amt === null && /^\d{4}-/.test(it.mark.on)).forEach((it) => {
    const s = stored(P, it); if (!s || !s.paid || s.paid.ok || s.paid.legacy || (s.tx || []).length || (it.done && it.done.by !== 'row' && it.done.by !== 'mark')) return;
    up('W1 asked where no record is');
    const g = lone(it); if (g) bad.push('W1: ' + it.id + ' is no record though ' + g.id + ' of its founder fits it'); });
  // (rests: a row held by withdrawals alone, so that what they took of it is what they hold)
  const offMonths = new Set(), rest = {};
  Object.entries((M.months && M.months.by) || {}).forEach(([m, o]) => { if (!o.off) return; offMonths.add(m);
    Object.values(o.off.by).forEach((z) => z.rows.forEach((r) => { if (!r.part) return; up('W2 rests'); rest[r.id] = r;
      const row = rows[r.id], of = row && row.o ? Math.abs(+row.o.a) : Math.abs(+(row && row.a) || 0);
      if (!row || !FND.includes(row.c) || !held[r.id] || !held[r.id].every((it) => it.wd)) bad.push('W2: the rest ' + r.id + ' is of no row withdrawals hold');
      if (round2(r.part.took + r.amt) !== r.part.of || Math.abs(r.part.of - of) > 0.0051 || !(r.amt > 0)) bad.push('W2: what was taken and the rest of ' + r.id + ' do not make the row: ' + JSON.stringify(r)); })); });
  // (a row a founder tied to a line by hand is that line's whole, and no taking: such a plan is not summed)
  const hand = new Set(); ['inflows', 'team', 'taxes', 'other', 'div'].forEach((k) => ((P || {})[k] || []).forEach((r) => { (r.tx || []).forEach((id) => hand.add(String(id))); Object.values((r.rec && r.rec.x) || {}).forEach((e) => (e.tx || []).forEach((id) => hand.add(String(id)))); }));
  const wds = M.items.filter((it) => it.wd && it.rows.length);
  if (wds.length && wds.every((it) => it.cur === 'GBP') && wds.every((it) => it.rows.every((id) => rows[id] && !hand.has(id) && offMonths.has(rows[id].d.slice(0, 7)) && held[id].every((x) => x.wd)))) {
    const ids = [...new Set(wds.flatMap((it) => it.rows))], whole = ids.reduce((s, id) => s + Math.abs(+rows[id].a), 0);
    const took = wds.reduce((s, it) => s + it.wd.got, 0), rests = ids.reduce((s, id) => s + (rest[id] ? rest[id].gbp : 0), 0);
    up('W2 sums');
    if (Math.abs(took + rests - whole) > 0.006 * (ids.length + wds.length)) bad.push(`W2: the withdrawals took ${took} and the rests are ${rests} of rows worth ${whole}`);
  }
  return bad;
};
module.exports = { ms, round2, filed, inbox, reach, ledger, bal, row, wd, plan3, clone, item, bare, mk, engines, C0, AT1, FX, named, toOwn, isDaily, nameOf, wCheck, FND };
