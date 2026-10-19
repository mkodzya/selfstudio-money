// Plans and ledgers made by hand, in the shapes scripts/money-checks.mjs uses; the engines under test; and the page's
// way of changing a plan. Nothing here reads a real document: like the tests, it refuses beside a data/ folder.
const fs = require('fs'), path = require('path');
if (fs.existsSync(path.join(__dirname, '..', '..', 'data'))) { console.error('checks/withdrawals: this checkout holds data/ - not here'); process.exit(2); }
// ENGINES names a folder with new.cjs (the page as it is), dev.cjs (the page before the rule of 13 October 2026) and
// pre.cjs (develop before the bank's fees of 19 October 2026, 008462e) - see README.md
const engines = () => { const dir = process.env.ENGINES; if (!dir || !['new', 'dev', 'pre'].every((k) => fs.existsSync(path.join(dir, k + '.cjs')))) { console.error('ENGINES=<a folder with new.cjs, dev.cjs and pre.cjs>: see checks/withdrawals/README.md'); process.exit(2); }
  return { NEW: require(path.resolve(dir, 'new.cjs')).Live, DEV: require(path.resolve(dir, 'dev.cjs')).Live, PRE: require(path.resolve(dir, 'pre.cjs')).Live }; };
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
// (item.wd.by), that a withdrawal is a record (item.wd.rec, 17 October 2026 - W1), what was paid outside the
// plan (months.by[ym].off, .wait) - and the bank's fees (19 October 2026, `bareFee`).
// `bareFee` takes out only what the model has gained since develop before the fees (008462e): the running month's
// row of fees (month.blocks.fee) and a month's fees by bank (months.by[ym].fees). Nothing else of a model is new.
const bareFee = (M) => { if (M.month && M.month.blocks) delete M.month.blocks.fee; Object.values((M.months && M.months.by) || {}).forEach((o) => { delete o.fees; }); return M; };
const bare = (M) => { M.items.forEach((it) => { delete it.saw; delete it.sawDay; if (it.wd) { delete it.wd.by; delete it.wd.rec; } });
  Object.values((M.months && M.months.by) || {}).forEach((o) => { delete o.off; delete o.wait; }); return bareFee(M); };
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
// The owner's decision of 19 October 2026 (docs/handoff.md, the entry of that day), written out a second time, apart
// from the page:
// F - from 1 October 2026 a bank's fee is a cost of its own, per bank, and no part of the payment it rode on. A row
//     of the statements (not of the sheet), money that LEFT its account, is a fee of its own (`whole`) when its text
//     begins «Комиссия за» and an operation of a bank (`BANK_OPS`), or «Wise Charges for: …», or, on Barclays, is the
//     month's charges - it begins «CHARGES» or «COMMISSION CHARGES» and then names a PERIOD or nothing, and names no
//     payment, transfer, bill or card, no code Barclays gives a payment and no firm (the review of 19 October 2026) -
//     never one the statement calls a payment by card, direct debit or standing order, nor one that names an agent,
//     an intermediary or a reward; else it holds a fee inside when its text says «(fee: X CUR)» in its own
//     currency, or, on Mosta, «Перевод …, комиссия X ·» - less than the row. `feeOf(r)` → null | {whole, n (the
//     row's currency), g (pounds: the row's own pounds in the same share)}.
// `worth(r)` is what a withdrawal may hold of a row in pounds: nothing of a fee row of its own, the row without its
// fee where one is inside. `nat(r)` is the row in its own currency without the fee. `hasFee(L)`: does the table hold
// any fee at all - where it does not, the page reads it as develop before the fees did (pre.cjs), byte for byte.
// `unfee(L)`: the same table with every fee's words taken out of the texts - the same rows, amounts and keys, so the
// same money in and out of every account; a fee row of its own then reads as an ordinary cost («Thing»).
const PAIDW = /card transaction|card payment|direct debit|standing order|транзакция по карте|оплата картой|покупка по карте|прямое списание|прямое дебетование|постоянное поручение/i;
// (what a bank charges for, as the words after «Комиссия за» begin; and what makes a «charges» row on Barclays somebody's
// payment: a word of one, Barclays' code for one - bill payment, standing order, direct debit, faster payment, giro,
// transfer, cheque, debit card - or a firm's name)
const BANK_OPS = ['осуществлени', 'операци', 'перевод', 'пополнени', 'обслуживани', 'ведени', 'выдач', 'сняти', 'исполнени', 'платеж', 'платёж', 'зачислени', 'списани', 'конвертаци',
  'покупку валют', 'покупки валют', 'продажу валют', 'продажи валют', 'валютн', 'смс', 'sms', 'выпуск', 'перевыпуск', 'подключени', 'пакет', 'расчетн', 'расчётн', 'кассов', 'внесени', 'инкассаци',
  'выписк', 'справк', 'эквайринг', 'сопровождени', 'проведени', 'прием', 'приём', 'отправк', 'возврат'];
const BARC_PAY = ['payment', 'transfer', 'bill', 'card', 'refund', 'bbp', 'sto', 'dd', 'ddr', 'fpo', 'fpi', 'bgc', 'tfr', 'chq', 'deb', 'ltd', 'limited', 'plc', 'llp', 'inv', 'invoice'];
const ruBankFee = (t) => { const m = /^\s*комиссия\s+за\s+(.*)$/i.exec(t); if (!m) return false; const rest = m[1].toLowerCase().replace(/\s+/g, ' '); return BANK_OPS.some((w) => rest.startsWith(w)); };
const barcFee = (t) => { const s = t.trim().toLowerCase(), words = s.split(/[^a-z0-9]+/).filter(Boolean);
  if (!/^(commission\s+)?charges(\s|$)/.test(s) || words.some((w) => BARC_PAY.includes(w))) return false;
  return /^(commission\s+)?charges$/.test(s) || words.includes('period'); };
const textOf = (r) => { const o = r && r.o && typeof r.o === 'object' ? r.o : {}; return String(typeof o.t === 'string' && o.t.trim() ? o.t : o.p == null ? '' : o.p); };
const feeOf = (r) => {
  if (!r || typeof r.d !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(r.d) || r.d < '2026-10-01' || r.s === 'sheet' || !r.o || typeof r.o !== 'object') return null;
  const a = +r.o.a; if (!(a < 0)) return null;
  const t = textOf(r), bank = String(r.b || ''), cur = String(r.o.cur || 'GBP').toUpperCase(), g0 = Math.abs(+r.a || 0);
  const agent = /агент|посредни|вознагражд|комитент|комиссионер|принципал/i.test(t);
  if (!PAIDW.test(t) && !agent && (ruBankFee(t) || /^\s*wise charges for\b/i.test(t) || (bank === 'Barclays' && barcFee(t)))) return { whole: true, n: round2(-a), g: round2(g0) };
  let n = 0; for (const m of t.matchAll(/\(fee:\s*(\d[\d,]*(?:\.\d+)?)\s*([a-z]{3})\s*\)/gi)) if (m[2].toUpperCase() === cur) n += +m[1].replace(/,/g, '');
  const ms2 = bank === 'Mosta' ? /^\s*перевод\s[^·]*?,\s*комиссия\s+(\d+(?:[.,]\d+)?)/i.exec(t) : null; if (ms2) n += +ms2[1].replace(',', '.');
  n = round2(n); return n > 0 && n < -a ? { whole: false, n, g: round2(g0 * n / -a) } : null; };
// (each the signed amount less the fee, rounded to the penny as it stands - a half penny of an amount with more places
// than a statement prints goes the way the signed sum rounds - and then without its sign)
const worth = (r) => { const f = feeOf(r), a = +(r && r.a) || 0; return !f ? Math.abs(a) : f.whole ? 0 : Math.abs(round2(a - Math.sign(a) * f.g)); };
const nat = (r) => { const f = feeOf(r), a = +(r && r.o && r.o.a) || 0; return !f ? Math.abs(a) : f.whole ? 0 : Math.abs(round2(a + f.n)); };
const hasFee = (L) => (L.tx || []).concat(L.inbox || []).some((r) => !!feeOf(r));
const unfee = (L) => { let n = 0; const fix = (r) => { const f = feeOf(r); if (!f) return r; n++; const t = f.whole ? 'Thing' : textOf(r).replace(/\(fee:[^)]*\)/gi, '').replace(/,\s*комиссия\s+\d+(?:[.,]\d+)?/i, ''); return { ...r, o: { ...r.o, t } }; };
  const Q = { ...L, tx: (L.tx || []).map(fix), inbox: (L.inbox || []).map(fix) }; return n ? Q : L; };
// G - what the scripts hold of the fees, on any model of a table that holds one: the fees the model counts in a month
// (months.by[ym].fees, and month.blocks.fee of the running month) are the fees `feeOf` finds in the rows the page
// counts - filed rows (a transfer between own accounts too: its fee is a cost) and rows «Разбор» recognised - in pounds,
// per bank, to the penny; no row outside the plan is a fee of its own, and none stands there at more than its worth (a
// founder's row is his without the fee); and every account stands on the same balance and counts the same money after
// it as it does with every fee's words taken out of the table (`unfee`): the fee left the bank, only its line is new.
// One thing may differ, and is counted: a row dated on the very day a balance was typed for is inside that balance or
// after it by the line that holds it (rule B of 13 October 2026), and a row counted without its fee - or a fee row of
// its own, which is no taking now - may be held by another line than before; the difference must then be made of such
// rows of that account and that day, each counted after the balance in one reading and not in the other. And (the
// review of 19 October 2026) every line other than a withdrawal - a one-off, a month of a repeating one; not a tax the
// rules worked out - stands as it does with the fees' words taken out: closed or not, by the same rows, at the same sum
// paid - a founder writes what he will pay with the fee inside it, and the fee left with it. Returns what failed.
const isProvW = (r) => !!(r.c && r.c !== 'skip' && !isDaily(r) && String(r.l || '').trim() && r.auto && !r.twin && !r.maybe && !r.rep);
const gCheck = (M, L, P, T, Live, up) => {
  const bad = [], by = {}, rows = (L.tx || []).filter((r) => r.c).concat((L.inbox || []).filter(isProvW)), eps = 0.006 * (rows.length + 1);
  rows.forEach((r) => { const f = feeOf(r); if (!f) return; const m = r.d.slice(0, 7), o = by[m] || (by[m] = { g: 0, b: {} }); o.g += f.g; o.b[r.b] = (o.b[r.b] || 0) + f.g; up('G fees'); if (f.whole) up('G fee rows of their own'); });
  const ymT = T.slice(0, 7), mb = (M.month.blocks.fee || {}).fact || 0;
  if (Math.abs(mb - ((by[ymT] || {}).g || 0)) > eps) bad.push(`G: the running month counts ${mb} of fees, the rows hold ${(by[ymT] || {}).g || 0}`);
  Object.entries(M.months.by || {}).forEach(([m, o]) => { const want = m <= ymT ? by[m] : null;
    if (!o.fees) { if (want && want.g >= 0.005) bad.push('G: ' + m + ' shows no fees, the rows hold ' + want.g); return; }
    up('G months that show fees');
    if (!want || Math.abs(o.fees.gbp - want.g) > eps) bad.push(`G: ${m} shows fees of ${o.fees.gbp}, the rows hold ${want ? want.g : 0}`);
    o.fees.banks.forEach((b) => { if (!want || Math.abs(b.gbp - (want.b[b.bank] || 0)) > eps) bad.push(`G: ${m} shows ${b.gbp} of fees for ${b.bank}`); }); });
  const all = Object.fromEntries((L.tx || []).concat(L.inbox || []).map((r) => [String(r.id), r]));
  Object.values(M.months.by || {}).forEach((o) => { if (!o.off) return; Object.values(o.off.by).forEach((z) => z.rows.forEach((x) => { const r = all[x.id], f = r && feeOf(r);
    if (f && f.whole) bad.push('G: the fee row ' + x.id + ' stands outside the plan');
    if (f && !f.whole) { up('G rows outside the plan with a fee inside'); if (Math.abs(x.gbp) > worth(r) + 0.006) bad.push('G: ' + x.id + ' stands outside the plan at more than its worth without the fee'); } })); });
  const L0 = unfee(L);
  if (L0 !== L) { up('G tables read with the fees taken out');
    const M0 = JSON.parse(JSON.stringify(Live.compute(clone(L0), clone(P), T, { H: 30 })));
    const line = (X) => X.items.filter((it) => !it.wd && it.src !== 'tax').map((it) => JSON.stringify([it.id, it.state === 'done', it.done ? it.done.got : null, it.part ? it.part.got : null, it.rows.slice().sort()]));
    const l1 = line(M), l0 = line(M0), lf = new Set((L.tx || []).concat(L.inbox || []).filter((r) => feeOf(r) && !feeOf(r).whole).map((r) => String(r.id)));
    l1.forEach((x, i) => { if (JSON.parse(x)[4].some((id) => lf.has(id))) up('G lines paid by a row with a fee inside'); if (x !== l0[i]) bad.push('G: a line stands otherwise with the fees read than without them: ' + x + ' / ' + l0[i]); });
    if (JSON.stringify(M0.accounts.map((a) => [a.key, a.anchor])) !== JSON.stringify(M.accounts.map((a) => [a.key, a.anchor]))) bad.push('G: an account stands on another balance with the fees read than without them');
    else M.accounts.forEach((a, i) => { const d = round2(a.after - M0.accounts[i].after); if (Math.abs(d) < 0.006) return;
      // (the rows of that account dated on its balance's day: does a choice of them, each after the balance in one
      // reading and not in the other, make the difference?)
      const day = a.anchor ? (L.tx || []).concat(L.inbox || []).filter((r) => r.b === a.bank && String((r.o && r.o.cur) || 'GBP') === a.cur && r.d === a.anchor.asOf && r.o).map((r) => +r.o.a) : [];
      let can = false; const walk = (j, s) => { if (can) return; if (j === day.length) { if (Math.abs(s - d) < 0.006) can = true; return; } walk(j + 1, s); walk(j + 1, s + day[j]); walk(j + 1, s - day[j]); };
      if (day.length <= 9) walk(0, 0);
      if (can) up('G: a row of a balance\'s day is inside it or after it by another line than before'); else bad.push(`G: ${a.key} counts ${a.after} after its balance with the fees read, ${M0.accounts[i].after} without them`); }); }
  return bad;
};
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
//   Since 19 October 2026 (F) every row here is counted at its `worth` - in pounds without the bank's fee inside it -
//   and a rest «вне плана» makes the row without its fee in its own currency (`nat`): no fee is a founder's money, and
//   no fee row of its own is a taking at all.
// Returns the list of what failed (empty: all held), and counts into `up`.
const stored = (P, it) => { const r = (P.div || []).find((x) => String(x.id) === String(it.row || it.id)); if (!r) return null; return it.occ ? ((r.rec && r.rec.x) || {})[it.occ.ym] || {} : r; };
const wCheck = (M, L, T, FX, up, P, memory) => {
  const bad = [], rows = {}; (L.tx || []).concat(L.inbox || []).forEach((r) => { rows[String(r.id)] = r; });
  const held = {}; M.items.forEach((it) => it.rows.forEach((id) => { (held[id] = held[id] || []).push(it); }));
  const days = (a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5;
  M.items.filter((it) => it.wd && it.wd.rec).forEach((it) => {
    up('W1 records');
    const cap = it.cur === 'GBP' ? it.amt : it.amt / FX[it.cur], lo = Math.max(2, 0.02 * cap), hi = Math.max(5, 0.05 * cap);
    // (a row counts at its worth: without the bank's fee inside it - F, 19 October 2026)
    const rs = it.rows.map((id) => rows[id]), x = rs.reduce((s, r) => s + (r ? worth(r) : 0), 0);
    if (!FND.includes(it.whose) || !it.mark || it.mark.amt !== null || !it.on || !(it.date <= T) || it.state !== 'done') bad.push('W1: ' + it.id + ' is a record and no withdrawal that may be one');
    if (!(rs.length >= 1 && rs.length <= 4) || rs.some((r) => !r || r.c !== it.whose || isDaily(r) || days(r.d, it.date) > 5)) bad.push('W1: ' + it.id + ' holds a row it may not');
    if (!(x >= cap - lo - 1e-6 && x <= cap + hi + 1e-6)) bad.push('W1: the rows of ' + it.id + ' do not come within its sum: ' + x + ' of ' + cap);
    if (it.rows.some((id) => held[id].length > 1)) bad.push('W1: a row of the record ' + it.id + ' is held by another line too');
    if (it.wd.got > it.amt + 0.011) bad.push('W1: ' + it.id + ' holds more than its sum');
    if (rs.length > 1) up('W1 records of two to four rows');
  });
  const lone = (it) => { const cap = it.cur === 'GBP' ? it.amt : it.amt / FX[it.cur], lo = Math.max(2, 0.02 * cap), hi = Math.max(5, 0.05 * cap);
    const taking = (r) => r.c === it.whose && !held[String(r.id)] && !isDaily(r) && !(feeOf(r) && feeOf(r).whole) && r.o && +r.o.a < 0 && days(r.d, it.date) <= 5 && worth(r) >= cap - lo - 1e-6 && worth(r) <= cap + hi + 1e-6;
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
      const row = rows[r.id], of = row && row.o ? nat(row) : Math.abs(+(row && row.a) || 0);
      if (!row || !FND.includes(row.c) || !held[r.id] || !held[r.id].every((it) => it.wd)) bad.push('W2: the rest ' + r.id + ' is of no row withdrawals hold');
      if (round2(r.part.took + r.amt) !== r.part.of || Math.abs(r.part.of - of) > 0.0051 || !(r.amt > 0)) bad.push('W2: what was taken and the rest of ' + r.id + ' do not make the row: ' + JSON.stringify(r)); })); });
  // (a row a founder tied to a line by hand is that line's whole, and no taking: such a plan is not summed)
  const hand = new Set(); ['inflows', 'team', 'taxes', 'other', 'div'].forEach((k) => ((P || {})[k] || []).forEach((r) => { (r.tx || []).forEach((id) => hand.add(String(id))); Object.values((r.rec && r.rec.x) || {}).forEach((e) => (e.tx || []).forEach((id) => hand.add(String(id)))); }));
  const wds = M.items.filter((it) => it.wd && it.rows.length);
  if (wds.length && wds.every((it) => it.cur === 'GBP') && wds.every((it) => it.rows.every((id) => rows[id] && !hand.has(id) && offMonths.has(rows[id].d.slice(0, 7)) && held[id].every((x) => x.wd)))) {
    const ids = [...new Set(wds.flatMap((it) => it.rows))], whole = ids.reduce((s, id) => s + worth(rows[id]), 0);
    const took = wds.reduce((s, it) => s + it.wd.got, 0), rests = ids.reduce((s, id) => s + (rest[id] ? rest[id].gbp : 0), 0);
    up('W2 sums');
    if (Math.abs(took + rests - whole) > 0.006 * (ids.length + wds.length)) bad.push(`W2: the withdrawals took ${took} and the rests are ${rests} of rows worth ${whole}`);
  }
  return bad;
};
module.exports = { ms, round2, filed, inbox, reach, ledger, bal, row, wd, plan3, clone, item, bare, bareFee, mk, engines, C0, AT1, FX, named, toOwn, isDaily, nameOf, wCheck, FND, feeOf, worth, nat, hasFee, unfee, gCheck };
