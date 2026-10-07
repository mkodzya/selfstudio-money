// A fabricated studio's money, for the stands nobody's real money may touch.
//
// Money (apps/web/public/money/) is only worth looking at with a year of
// history in it: the dashboard is months side by side, and the taxes are
// worked out from what the ledger shows. The studio's own ledger must not
// leave the founders' server, so the test stand and the browser checks get
// this instead — a studio of about the same size and the same habits, in
// which every client, person and figure is made up.
//
// The habits are the point, so they are written down rather than rolled at
// random: a bank that pays the same retainer on the 5th, an agency that pays
// in two or three uneven parts, a team paid by the hour in the last week of
// the month, subscriptions that never move, a client who left four months ago
// and one who has paid exactly once. Three clients are UK and carry VAT, all
// through one bank; one is invoiced both ways — with VAT through that bank,
// without through another, month about; the rest are international; three
// pay in roubles to the Tochka account. VAT is paid to HMRC on the 7th of the
// second month after a quarter, at nine tenths of what the invoices carried —
// except the last quarter due before the plan began, which goes in four
// monthly parts. No payment of the tax on the rouble receipts appears
// anywhere: it is paid some other way.
//
//   node scripts/money-demo.mjs ledger [YYYY-MM-DD] > ledger.json
//   node scripts/money-demo.mjs plan   [YYYY-MM-DD] > plan.json
//
// The date is "today" for the fabricated studio (the default is the real
// one): history runs for fifteen months and stops two days short of it, the
// way a ledger does when statements are filed about once a week. The same
// date always gives the same file.
//
// The plan is what the founders of that studio have written, and nothing else
// is in the forecast: the page fills in nothing from history. So the plan is
// long. Every regular client, every person and every subscription is a row
// marked «каждый месяц», written twelve weeks ago, when the plan began, and
// repeating from last month on; one of them has this month's date moved — the
// largest client has promised to pay at the end of the month instead of its
// beginning. Beside them stand the one-off rows: an invoice to a client who
// is not a regular, one that is more than two weeks overdue, a first payment
// of corporation tax. «Дивиденды» holds one withdrawal a month — which the
// founders then take in a dozen transfers — and the two personal taxes that
// go through the studio. The balance of each account is typed as of the day
// its last statement ends. The taxes are the page's two rules: UK VAT, and
// the tax on the rouble receipts, confirmed. Of the VAT quarter that was
// part-paid when the plan began the founders said «Да, частями как раньше»,
// so its remaining parts are rows of «Налоги». Of the rouble tax they have
// said that the first quarter due after the plan began was paid, though no
// statement shows it — and have not yet answered about the quarter before.
// It is a plan of version 3, written the way the page's own hands write one.
//
// Both documents go into a stand through the API, as a founder:
// PUT /api/founder/money and PUT /api/founder/money/cash, {base, doc: <string>}.
// The module has no imports and runs in a browser as it is.

const MONTHS = 15;
const FILED_LAG_DAYS = 2;
// The plan began twelve weeks before "today": the day the page started to answer for the studio's taxes.
const PLAN_AGE_DAYS = 83;

// One generator, seeded: the file is the same on every run, so a check can say
// "the third month's revenue is this" and keep saying it.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(y, m, 0).getDate();

// `since` and `until` count months back from today: since 5 = first paid five
// months ago, until 4 = last paid four months ago. Absent = always there.
const CLIENTS = [
  { n: 'Kestrel Bank',  b: 'Barclays', vat: true,  base: 4200, sp: 0,    day: 5,  dr: 2,  k: [1, 1] },
  { n: 'Meridian Labs', b: 'Barclays', vat: true,  base: 8600, sp: 0.35, day: 6,  dr: 4,  k: [1, 1] },
  { n: 'Halden & Co',   b: 'Wise',     vat: false, base: 3900, sp: 0.5,  day: 14, dr: 12, k: [2, 3] },
  { n: 'Brightwater',   b: 'Wise',     vat: false, base: 4600, sp: 0.25, day: 22, dr: 8,  k: [1, 1], both: 'Barclays' },
  { n: 'Orchard Lane',  b: 'Tochka',   vat: false, base: 2900, sp: 0.12, day: 7,  dr: 6,  k: [1, 1], cur: 'RUB' },
  { n: 'Fable Foods',   b: 'Tochka',   vat: false, base: 3900, sp: 0.25, day: 26, dr: 4,  k: [1, 1], cur: 'RUB', miss: 0.33 },
  { n: 'Lumen',         b: 'Tochka',   vat: false, base: 480,  sp: 0.4,  day: 15, dr: 13, k: [2, 3], cur: 'RUB' },
  { n: 'Tidewater',     b: 'Barclays', vat: true,  base: 5200, sp: 0.15, day: 4,  dr: 1,  k: [1, 1], since: 5 },
  { n: 'Quarry Works',  b: 'Wise',     vat: false, base: 5600, sp: 0.2,  day: 18, dr: 6,  k: [1, 1], until: 4 },
  { n: 'Pinecrest',     b: 'Wise',     vat: false, base: 2800, sp: 0.2,  day: 12, dr: 5,  k: [1, 1], since: 1 },
];
const ONE_OFFS = ['Saffron Row', 'Juniper', 'Ashgrove', 'Marlowe'];

const TEAM = [
  { n: 'Dario',  b: 'Wise',   base: 3000, sp: 0.15, day: 24, dr: 5, cur: 'USD' },
  { n: 'Lena',   b: 'Wise',   base: 2700, sp: 0.25, day: 6,  dr: 4 },
  { n: 'Marek',  b: 'Wise',   base: 2200, sp: 0.2,  day: 24, dr: 5, cur: 'USD' },
  { n: 'Tessa',  b: 'Tochka', base: 2000, sp: 0.15, day: 21, dr: 4, cur: 'RUB' },
  { n: 'Ines',   b: 'Wise',   base: 1600, sp: 0.2,  day: 27, dr: 3, cur: 'USD' },
  { n: 'Yuri',   b: 'Mosta',  base: 1500, sp: 0.1,  day: 19, dr: 4, cur: 'USD' },
  { n: 'Nadia',  b: 'Mosta',  base: 1500, sp: 0.03, day: 22, dr: 4, cur: 'USD' },
  { n: 'Pavel',  b: 'Tochka', base: 1450, sp: 0.2,  day: 25, dr: 4, cur: 'RUB' },
  { n: 'Greta',  b: 'Wise',   base: 1350, sp: 0.35, day: 13, dr: 8 },
  { n: 'Oskar',  b: 'Mosta',  base: 1100, sp: 0.1,  day: 25, dr: 4, cur: 'USD' },
  { n: 'Mila',   b: 'Tochka', base: 850,  sp: 0.4,  day: 24, dr: 5, cur: 'RUB' },
  { n: 'Felix',  b: 'Tochka', base: 760,  sp: 0.25, day: 25, dr: 4, cur: 'RUB' },
  { n: 'Zoya',   b: 'Wise',   base: 720,  sp: 0.3,  day: 28, dr: 2 },
  { n: 'Emil',   b: 'Mosta',  base: 620,  sp: 0.2,  day: 22, dr: 4, cur: 'USD', since: 3 },
  { n: 'Carla',  b: 'Wise',   base: 390,  sp: 0.4,  day: 28, dr: 2 },
  { n: 'Bruno',  b: 'Wise',   base: 900,  sp: 0.3,  day: 20, dr: 6, until: 5 },
];

// Subscriptions do not drift: the same day, the same sum, give or take a rate.
const FIXED = [
  { n: 'Office',   b: 'Barclays', a: 594, day: 20 },
  { n: 'Claude',   b: 'Wise',     a: 154, day: 15, wob: 0.3 },
  { n: 'Figma',    b: 'Wise',     a: 122, day: 5,  wob: 0.08 },
  { n: 'Google',   b: 'Wise',     a: 96,  day: 2 },
  { n: 'Hetzner',  b: 'Wise',     a: 70,  day: 25, wob: 0.08 },
  { n: 'Slack',    b: 'Wise',     a: 60,  day: 14 },
  { n: 'Adobe',    b: 'Wise',     a: 48,  day: 11 },
  { n: 'Notion',   b: 'Wise',     a: 32,  day: 18 },
  { n: 'Github',   b: 'Wise',     a: 15,  day: 10, wob: 0.4 },
  { n: 'Readymag', b: 'Wise',     a: 12,  day: 18 },
  { n: 'Accountant', b: 'Barclays', a: 250, day: 28 },
];

const RATE = { USD: 1.35, EUR: 1.17, RUB: 118, AMD: 525 };

export function demoLedger(todayISO) {
  const now = todayISO ? new Date(todayISO + 'T12:00:00') : new Date();
  const ty = now.getFullYear(), tm = now.getMonth() + 1, td = now.getDate();
  const today = iso(ty, tm, td);
  const filedTo = (() => { const d = new Date(ty, tm - 1, td - FILED_LAG_DAYS); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); })();
  const rnd = mulberry32(20261006);
  const between = (a, b) => a + (b - a) * rnd();
  const whole = (a, b) => Math.floor(between(a, b + 1));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const around = (base, sp) => base * (1 + (rnd() * 2 - 1) * sp);
  const to = (v, step) => Math.round(v / step) * step;

  const tx = [];
  let n = 0;
  const began = (() => { const d = new Date(ty, tm - 1, td - PLAN_AGE_DAYS); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); })();
  // `ago` = how many months back this row's month is; 0 is the month we are in.
  // A statement is uploaded about three days after its newest row, and the
  // last upload was yesterday morning. The forecast reads this stamp: a row
  // can close a line of the plan only if it came after the line was typed.
  const yesterday = Date.parse(today + 'T09:00:00Z') - 864e5;
  const uploaded = (d) => Math.min(Date.parse(d + 'T09:00:00Z') + 3 * 864e5, yesterday);
  const add = (ago, y, m, day, a, c, b, l, extra = {}) => {
    const d = iso(y, m, Math.max(1, Math.min(daysIn(y, m), Math.round(day))));
    if (d > filedTo || !a) return;
    const id = 'demo' + (++n);
    const r = { id, d, a: Math.round(a * 100) / 100, c, b, l, v: extra.v ? Math.round(extra.v * 100) / 100 : 0 };
    // This month and last came from statements — and so did everything since
    // the plan began — so they carry what the bank said: the amount in the
    // account's own currency, a line of text, and when they were uploaded.
    if (ago <= 1 || d >= began) {
      const cur = extra.cur || 'GBP';
      const sign = c === 'rev' ? 1 : -1;
      const orig = cur === 'GBP' ? r.a : to(r.a * RATE[cur], cur === 'RUB' ? 100 : 1);
      r.s = 'file';
      r.o = { a: sign * orig, cur, t: extra.t || l };
      r.key = ['demo', b, d, sign * orig, cur, id].join('|');
      r.at = uploaded(d);
    } else {
      r.s = 'sheet'; r.x = 1; r.key = 'demo|' + id;
    }
    tx.push(r);
  };
  const active = (who, ago) => (who.since == null || ago <= who.since) && (who.until == null || ago >= who.until);

  for (let ago = MONTHS - 1; ago >= 0; ago--) {
    const first = new Date(ty, tm - 1 - ago, 1);
    const y = first.getFullYear(), m = first.getMonth() + 1;
    // A studio that grew by an eighth over the year, quieter in August and
    // over the new year.
    const season = (m === 8 ? 0.85 : m === 12 || m === 1 ? 0.9 : 1) * (0.93 + 0.12 * (1 - ago / (MONTHS - 1)));

    for (const c of CLIENTS) {
      if (!active(c, ago) || (c.miss && rnd() < c.miss)) continue;
      const parts = whole(c.k[0], c.k[1]);
      for (let i = 0; i < parts; i++) {
        const a = c.sp ? to(around(c.base, c.sp) * season, c.base > 1000 ? 10 : 5) : c.base;
        const day = c.day + (rnd() * 2 - 1) * c.dr + (parts > 1 ? i * 6 : 0);
        // A client invoiced both ways: with VAT through one bank in the even months, without through the other.
        const uk = c.both && m % 2 === 0;
        add(ago, y, m, day, a, 'rev', uk ? c.both : c.b, c.n, { v: c.vat || uk ? a / 6 : 0, cur: c.cur, t: 'Payment from ' + c.n.toUpperCase() });
      }
    }
    if (rnd() < 0.5) add(ago, y, m, whole(3, 26), to(between(900, 6000), 50), 'rev', 'Wise', pick(ONE_OFFS), { t: 'Invoice' });

    for (const p of TEAM) {
      if (!active(p, ago)) continue;
      const a = to(around(p.base, p.sp) * (0.92 + 0.08 * season), 1);
      add(ago, y, m, p.day + (rnd() * 2 - 1) * p.dr, a, 'cogs', p.b, p.n, { cur: p.cur, t: 'Sent money to ' + p.n });
      // Now and then a second, smaller payment for work that ran over.
      if (rnd() < 0.12) add(ago, y, m, whole(4, 14), to(a * between(0.15, 0.4), 1), 'cogs', p.b, p.n, { cur: p.cur, t: 'Sent money to ' + p.n });
    }

    for (const f of FIXED) {
      add(ago, y, m, f.day + (f.wob ? whole(-1, 1) : 0), f.wob ? to(around(f.a, f.wob), 1) : f.a, 'fixed', f.b, f.n, { t: f.n });
    }

    // Two founders pay their own tax through the company every month; the
    // page counts it as theirs. Corporation tax is paid once a year. (VAT is
    // worked out below, from what the quarter's invoices carried; the figure
    // drawn here is no longer used, and is drawn so that every other row of
    // the studio stays what it was.)
    add(ago, y, m, 23 + whole(-2, 2), to(around(875, 0.2), 5), 'tax', 'Barclays', 'HMRC Mika', { t: 'HMRC' });
    add(ago, y, m, 23 + whole(-2, 2), to(around(575, 0.15), 5), 'tax', 'Barclays', 'HMRC Vanya', { t: 'HMRC' });
    if ([2, 5, 8, 11].includes(m)) between(6200, 9400);
    if (m === 1) add(ago, y, m, 9, 7420, 'tax', 'Barclays', 'HMRC CT', { t: 'HMRC CORPORATION TAX' });

    // What the founders take out. No label is a dividend; the rest is the
    // small change of running a life through a company card.
    for (let i = whole(1, 2); i > 0; i--) add(ago, y, m, whole(2, 27), to(between(900, 1900), 50), 'mika', 'Wise', '');
    for (let i = whole(2, 4); i > 0; i--) add(ago, y, m, whole(1, 28), to(between(12, 70), 1), 'mika', 'Wise', 'daily');
    for (let i = whole(2, 3); i > 0; i--) add(ago, y, m, whole(2, 27), to(between(1000, 2000), 50), 'misha', 'Barclays', '');
    add(ago, y, m, whole(1, 5), 240, 'misha', 'Barclays', 'monthly');
    for (let i = 2; i > 0; i--) add(ago, y, m, whole(2, 27), to(between(1200, 2200), 50), 'vanya', 'Wise', '');
    for (let i = whole(7, 12); i > 0; i--) add(ago, y, m, whole(1, 28), between(2.8, 9.6), 'vanya', 'Wise', 'tfl');
    for (let i = whole(4, 8); i > 0; i--) add(ago, y, m, whole(1, 28), to(between(8, 60), 1), 'vanya', 'Wise', 'daily');

    for (let i = whole(0, 2); i > 0; i--) add(ago, y, m, whole(1, 28), to(between(50, 300), 1), 'other', 'Wise', pick(['Trainline', 'Booking', 'Ryanair', 'Courier']));
    for (let i = whole(1, 3); i > 0; i--) {
      const c = pick(CLIENTS.filter((q) => active(q, ago)));
      const bank = pick(['Wise', 'Tochka']);
      add(ago, y, m, whole(1, 28), to(between(80, 2400), 10), 'behalf', bank, c.n + ' — ' + pick(['ads', 'print', 'domain', 'stock']), { cur: bank === 'Tochka' ? 'RUB' : 'GBP' });
    }
  }
  // VAT: on the 7th of the second month after each quarter, nine tenths of the VAT its invoices carried (input VAT
  // is real). The last quarter due before the plan began is the exception: it goes in four parts a month apart —
  // three of about a quarter of it, and what is then left.
  const quarters = {};
  tx.forEach((r) => { if (r.c === 'rev' && r.v) { const k = r.d.slice(0, 4) + '-' + Math.ceil(+r.d.slice(5, 7) / 3); quarters[k] = (quarters[k] || 0) + r.v; } });
  const dues = Object.keys(quarters).sort().map((k) => { const y = +k.slice(0, 4), q = +k.slice(5), m = q * 3 + 2; return { v: quarters[k], y: m > 12 ? y + 1 : y, m: m > 12 ? m - 12 : m }; });
  const last = dues.filter((x) => iso(x.y, x.m, 7) < began).pop();
  const monthsAgo = (y, m) => (ty - y) * 12 + (tm - m);
  const hmrc = (y, m, a) => add(monthsAgo(y, m), y, m, 7, a, 'tax', 'Barclays', 'HMRC VAT', { t: 'HMRC VAT' });
  dues.forEach((x) => {
    if (x !== last) return hmrc(x.y, x.m, to(x.v * 0.9, 10));
    const part = to(x.v * 0.24, 10);
    for (let i = 0; i < 4; i++) { const m = ((x.m - 1 + i) % 12) + 1, y = x.y + Math.floor((x.m - 1 + i) / 12); hmrc(y, m, i < 3 ? part : to(x.v - 3 * part, 10)); }
  });

  // A refund, because ledgers have them and a negative row is where sums go wrong.
  const adobe = tx.filter((r) => r.l === 'Adobe')[3];
  if (adobe) tx.push({ ...adobe, id: 'demo' + (++n), a: -adobe.a, key: 'demo|refund', d: adobe.d.slice(0, 8) + pad(Math.min(28, +adobe.d.slice(8) + 9)) });

  tx.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  // Four lines from last week's statements that nobody has filed yet.
  const recent = (back) => { const d = new Date(ty, tm - 1, td - FILED_LAG_DAYS - back); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const ask = (i, back, bank, amt, cur, text, payee) => ({
    id: 'demoask' + i, f: 'demo', d: recent(back), b: bank, ac: '', dir: amt > 0 ? 1 : -1,
    a: Math.round(Math.abs(cur === 'GBP' ? amt : amt / RATE[cur]) * 100) / 100,
    o: { a: amt, cur, t: text, p: payee || '', h: '', fix: true }, key: ['demo', bank, recent(back), amt, cur, 'ask' + i].join('|'),
    s: 'file', c: '', l: '', v: 0, auto: false, twin: null, at: yesterday,
  });
  const inbox = [
    ask(1, 0, 'Wise', -310, 'GBP', 'Card transaction of 310.00 GBP issued by Linden Print', 'Linden Print'),
    ask(2, 1, 'Wise', 1850, 'GBP', 'Received money from ASHGROVE LTD with reference INV-0912', 'ASHGROVE LTD'),
    ask(3, 1, 'Tochka', -41300, 'RUB', 'Оплата по счёту 118 от 28.09', 'ИП Соколов'),
    ask(4, 3, 'Barclays', -129.5, 'GBP', 'DIRECT DEBIT PAYMENT TO HARTWELL INSURANCE', ''),
  ];

  const rules = [
    ...TEAM.map((p) => ({ k: p.n.toLowerCase(), c: 'cogs', l: p.n })),
    ...CLIENTS.map((c) => ({ k: c.n.toLowerCase(), c: 'rev', l: c.n })),
    { k: 'hmrc vat', c: 'tax', l: 'HMRC VAT' },
    { k: 'office', c: 'fixed', l: 'Office' },
  ];

  return {
    v: 1, savedAt: today + 'T09:00:00.000Z', tx, inbox, rules, fx: { ...RATE }, history: {},
    own: ['demo studio'], ownSeen: [], holders: {}, aliases: {}, lastpdf: null,
  };
}

export function demoPlan(todayISO) {
  const now = todayISO ? new Date(todayISO + 'T12:00:00') : new Date();
  const ty = now.getFullYear(), tm = now.getMonth() + 1, td = now.getDate();
  const plus = (days) => { const d = new Date(ty, tm - 1, td + days); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const moment = (days, hhmm) => Date.parse(plus(days) + 'T' + hhmm + ':00Z');
  const month = (ago) => { const d = new Date(ty, tm - 1 - ago, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

  // Each balance was typed yesterday evening, as of the day the statements
  // reach: the page then says «Денег на …» with that date, not «сейчас».
  const asOf = plus(-FILED_LAG_DAYS), typedAt = moment(-1, '17:40');
  const bank = (id, name, amt, cur, b) => ({ id, name, amt, cur, bank: b, on: true, tag: '', info: false, date: '', asOf, at: typedAt, by: 'Mika' });
  const banks = [
    bank('b1', 'Wise — GBP', 21480, 'GBP', 'Wise'),
    bank('b2', 'Wise — USD', 6620, 'USD', 'Wise'),
    bank('b3', 'Barclays — GBP', 19230, 'GBP', 'Barclays'),
    bank('b4', 'Tochka — RUB', 654000, 'RUB', 'Tochka'),
    bank('b5', 'Mosta — USD', 4150, 'USD', 'Mosta'),
  ];

  // The plan began twelve weeks ago; its repeating rows were written that morning, and repeat from last month on —
  // the months the ledger holds as statements, so each has a payment that can close it.
  const since = plus(-PLAN_AGE_DAYS), c0 = moment(-PLAN_AGE_DAYS, '08:10'), from = month(1), here = month(0);
  const row = (id, name, amt, b, date, by, more = {}) => ({ id, name, amt, cur: 'GBP', bank: b, on: true, tag: '', info: false, date, c0, m: { t: c0, by }, ...more });
  const every = (id, name, amt, b, day, by, more = {}) => row(id, name, amt, b, from + '-' + pad(day), by, { rec: { day, from }, ...more });
  const active = (who, ago) => (who.since == null || ago <= who.since) && (who.until == null || ago >= who.until);
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const native = (gbp, cur) => (cur === 'RUB' ? Math.round((gbp * RATE.RUB) / 1000) * 1000 : cur && cur !== 'GBP' ? Math.round((gbp * RATE[cur]) / 10) * 10 : gbp);

  // The clients who pay every month, each as the founders invoice them: without VAT, and saying whether VAT goes on
  // top. The one who pays in two or three uneven parts is one row of about what a month comes to.
  const inflows = CLIENTS.filter((c) => active(c, 1) && active(c, 0) && c.since !== 1).map((c) => {
    const parts = (c.k[0] + c.k[1]) / 2, gross = c.base * parts, amt = c.vat ? Math.round((gross * 5) / 6 / 10) * 10 : native(gross, c.cur);
    return every('c-' + slug(c.n), c.n, amt, c.b, c.day, 'Mika', { blk: 'rev', vat: !!c.vat, cur: c.cur || 'GBP', sk: 'rev|' + c.n.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(), skBy: 'hand' });
  });
  // The largest client usually pays about the 6th. This month it has said "the end of the month", and a founder has
  // moved this month's date — this month's alone.
  const big = inflows.find((r) => r.name === CLIENTS[1].n);
  big.rec.x = { [here]: { date: plus(23) } };
  big.tag = 'обещали к концу месяца';
  inflows.push(
    // An invoice to a client who is not a regular, due next week.
    row('p2', 'Ashgrove — second half', 2600, 'Wise', plus(9), 'Misha', { blk: 'rev', vat: false, c0: moment(-2, '08:10') }),
    // And one that should have arrived more than two weeks ago.
    row('p3', 'Saffron Row', 1900, 'Wise', plus(-18), 'Mika', { blk: 'rev', vat: false, c0: moment(-30, '08:10') }),
  );
  const team = TEAM.filter((p) => active(p, 1) && active(p, 0)).map((p) => every('t-' + slug(p.n), p.n, native(p.base, p.cur), p.b, p.day, 'Misha', { blk: 'cogs', cur: p.cur || 'GBP', sk: 'cogs|' + p.n.toLowerCase(), skBy: 'hand' }));
  const other = FIXED.map((f) => every('f-' + slug(f.n), f.n, f.a, f.b, f.day, 'Vanya', { blk: 'fixed', sk: 'fixed|' + f.n.toLowerCase(), skBy: 'hand' }));
  // A first payment of corporation tax, which no rule works out: a bill of its own.
  const taxes = [row('p4', 'Corporation tax — первый взнос', 2400, 'Barclays', plus(13), 'Vanya', { blk: 'tax', of: false, c0: moment(-2, '08:10') })];
  // One withdrawal a month, which the founders take in many transfers; and the two personal taxes.
  const div = [
    every('d-draw', 'Вывод', 9000, 'Wise', 10, 'Mika', { blk: 'div' }),
    every('d-mika', 'HMRC Mika', 875, 'Barclays', 23, 'Mika', { blk: 'div', ptax: true, f: 'mika' }),
    every('d-vanya', 'HMRC Vanya', 575, 'Barclays', 23, 'Vanya', { blk: 'div', ptax: true, f: 'vanya' }),
  ];

  // VAT. When the plan began, the last quarter that had been due was part-paid: the page asked, and the founders
  // answered «Да, частями как раньше». That names the parts already paid and writes the rest as a row on the rhythm
  // seen — the latest part, on its day, for as many months as the rest takes, the last month what is then left.
  const ledger = demoLedger(todayISO);
  const vatOf = (d) => { const y = +d.slice(0, 4), q = Math.ceil(+d.slice(5, 7) / 3), m = q * 3 + 2; return { key: y + 'Q' + q, from: iso(y, q * 3 - 2, 1), to: iso(y, q * 3, 31), due: iso(m > 12 ? y + 1 : y, m > 12 ? m - 12 : m, 7), prev: () => vatOf(iso(q === 1 ? y - 1 : y, q === 1 ? 10 : q * 3 - 5, 1)) }; };
  let vq = vatOf(plus(0));
  while (vq.due >= since) vq = vq.prev();
  const per = {};
  const owed = ledger.tx.reduce((a, r) => a + (r.c === 'rev' && r.d >= vq.from && r.d <= vq.to ? r.v || 0 : 0), 0);
  const found = ledger.tx.filter((r) => r.c === 'tax' && r.l === 'HMRC VAT' && r.d >= vq.due && r.d < since);
  if (found.length) {
    const part = found[found.length - 1].a, rest = owed - found.reduce((a, r) => a + r.a, 0), months = Math.max(1, Math.round(rest / part));
    const first = plus(0).slice(0, 8) && (since.slice(8) <= '07' ? since.slice(0, 7) : (() => { const y = +since.slice(0, 4), m = +since.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1); })());
    const end = (() => { const n = +first.slice(0, 4) * 12 + +first.slice(5) - 1 + months - 1; return Math.floor(n / 12) + '-' + pad((n % 12) + 1); })();
    const lastAmt = Math.round((rest - (months - 1) * part) * 100) / 100;
    per['vat|' + vq.key] = { tx: found.map((r) => r.id), m: { t: c0, by: 'Vanya' } };
    taxes.push(row('p-vat', 'UK VAT за ' + ['I', 'II', 'III', 'IV'][+vq.key.slice(5) - 1] + ' кв. ' + vq.key.slice(0, 4) + ' — часть', part, 'Barclays', first + '-07', 'Vanya',
      { blk: 'tax', of: { r: 'vat', p: vq.key, part: true }, rec: Object.assign({ day: 7, from: first, to: end }, lastAmt !== part ? { x: { [end]: { amt: lastAmt } } } : {}) }));
  }
  // The tax on the rouble receipts. The first quarter due after the plan began was paid, the founders say, and no
  // statement of that account shows it. About the quarter before it they have not answered yet: the page asks.
  const usnOf = (d) => { const y = +d.slice(0, 4), q = Math.ceil(+d.slice(5, 7) / 3); return { key: y + 'Q' + q, due: iso(q === 4 ? y + 1 : y, q === 4 ? 1 : q * 3 + 1, 28), prev: () => usnOf(iso(q === 1 ? y - 1 : y, q === 1 ? 10 : q * 3 - 5, 1)) }; };
  let uq = usnOf(plus(0));
  while (uq.prev().due >= since) uq = uq.prev();
  if (uq.due < plus(-12)) per['usn|' + uq.key] = { paid: { on: uq.due, at: Date.parse(uq.due + 'T10:00:00Z'), by: 'Mika', ok: true }, m: { t: Date.parse(uq.due + 'T10:00:00Z'), by: 'Mika' } };

  return {
    v: 3, savedAt: new Date(typedAt).toISOString(), savedBy: 'Mika', cushion: 5000,
    banks, inflows, team, taxes, other, div,
    tax: {
      since,
      rules: [
        { id: 'vat', name: 'UK VAT', base: 'ontop', rate: 20, per: 'q', day: 7, off: 2, on: true, builtin: true, from: since },
        { id: 'usn', name: 'УСН по Точке', base: 'share', rate: 6, acct: 'Tochka|RUB', per: 'q', day: 28, off: 1, on: true, builtin: true, from: since },
      ],
      cl: {}, per,
    },
    log: [],
  };
}

// Run as a script only under Node; a browser that imports the module gets the
// two functions and nothing else.
if (typeof process !== 'undefined' && process.argv && import.meta.url === `file://${process.argv[1]}`) {
  const [what, day] = process.argv.slice(2);
  if (what !== 'ledger' && what !== 'plan') {
    console.error('usage: node scripts/money-demo.mjs ledger|plan [YYYY-MM-DD]');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(what === 'plan' ? demoPlan(day) : demoLedger(day)));
}
