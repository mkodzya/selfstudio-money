// A fabricated studio's money, for the stands nobody's real money may touch.
//
// Money (apps/web/public/money/) is only worth looking at with a year of
// history in it: the dashboard is months side by side, and the forecast reads
// what is regular out of what has already happened. The studio's own ledger
// must not leave the founders' server, so the test stand and the browser
// checks get this instead — a studio of about the same size and the same
// habits, in which every client, person and figure is made up.
//
// The habits are the point, so they are written down rather than rolled at
// random: a bank that pays the same retainer on the 5th, an agency that pays
// in two or three uneven parts, a team paid by the hour in the last week of
// the month, subscriptions that never move, VAT that lands once a quarter,
// a client who left four months ago and one who has paid exactly once.
//
//   node scripts/money-demo.mjs ledger [YYYY-MM-DD] > ledger.json
//   node scripts/money-demo.mjs plan   [YYYY-MM-DD] > plan.json
//
// The date is "today" for the fabricated studio (the default is the real
// one): history runs for fifteen months and stops two days short of it, the
// way a ledger does when statements are filed about once a week. The same
// date always gives the same file.
//
// The plan is what the founders of that studio have typed, and only that: the
// balance of each account as of the day its last statement ends — typed
// yesterday, off the statement's own last line — and the handful of things
// history cannot know — the largest client has promised to pay at the end of
// the month instead of its beginning, one invoice to a client who is not a
// regular, one that is two weeks overdue, an instalment of tax, a founder's
// draw. The regular clients, the team and the subscriptions are NOT in it:
// the forecast reads those out of the ledger by itself. The balances are
// such that the last week of the month is tight — the team is paid before the
// late invoice arrives — because that week is what the first screen is for.
// It is a plan of version 2, written the way the page's own cards write one.
//
// Both documents go into a stand through the API, as a founder:
// PUT /api/founder/money and PUT /api/founder/money/cash, {base, doc: <string>}.
// The module has no imports and runs in a browser as it is.

const MONTHS = 15;
const FILED_LAG_DAYS = 2;

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
  { n: 'Brightwater',   b: 'Wise',     vat: true,  base: 4600, sp: 0.25, day: 22, dr: 8,  k: [1, 1] },
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
    // This month and last came from statements, so they carry what the bank
    // said: the amount in the account's own currency and a line of text.
    if (ago <= 1) {
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
        add(ago, y, m, day, a, 'rev', c.b, c.n, { v: c.vat ? a / 6 : 0, cur: c.cur, t: 'Payment from ' + c.n.toUpperCase() });
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
    // page counts it as theirs. VAT lands in the month after a quarter ends,
    // corporation tax once a year.
    add(ago, y, m, 23 + whole(-2, 2), to(around(875, 0.2), 5), 'tax', 'Barclays', 'HMRC Mika', { t: 'HMRC' });
    add(ago, y, m, 23 + whole(-2, 2), to(around(575, 0.15), 5), 'tax', 'Barclays', 'HMRC Vanya', { t: 'HMRC' });
    if ([2, 5, 8, 11].includes(m)) add(ago, y, m, 7, to(between(6200, 9400), 10), 'tax', 'Barclays', 'HMRC VAT', { t: 'HMRC VAT' });
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
  const today = iso(ty, tm, td);
  const ledger = demoLedger(todayISO);
  const plus = (days) => { const d = new Date(ty, tm - 1, td + days); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const moment = (days, hhmm) => Date.parse(plus(days) + 'T' + hhmm + ':00Z');
  const month = (ago) => { const d = new Date(ty, tm - 1 - ago, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

  // Each balance was typed yesterday evening, as of the day the statements
  // reach: the page then says «Денег на …» with that date, not «сейчас».
  const asOf = plus(-FILED_LAG_DAYS), typedAt = moment(-1, '17:40');
  const bank = (id, name, amt, cur, b) => ({ id, name, amt, cur, bank: b, on: true, tag: '', info: false, date: '', asOf, at: typedAt, by: 'Mika' });
  const banks = [
    bank('b1', 'Wise — GBP', 3480, 'GBP', 'Wise'),
    bank('b2', 'Wise — USD', 1620, 'USD', 'Wise'),
    bank('b3', 'Barclays — GBP', 2230, 'GBP', 'Barclays'),
    bank('b4', 'Tochka — RUB', 154000, 'RUB', 'Tochka'),
    bank('b5', 'Mosta — USD', 1150, 'USD', 'Mosta'),
  ];

  // The rows were typed two mornings ago — before yesterday's statements were
  // uploaded, so a statement row can close one of them.
  const c0 = moment(-2, '08:10');
  const row = (id, name, amt, b, date, by, more = {}) => ({ id, name, amt, cur: 'GBP', bank: b, on: true, tag: '', info: false, date, c0, m: { t: c0, by }, sure: true, ...more });

  // The largest client usually pays about the 6th. This month it has said "the
  // end of the month", and a founder has moved the forecast there: the row is
  // that month's own forecast, written down, with the amount confirmed. (If
  // the client has in fact paid already, the row stands for next month.)
  const big = CLIENTS[1];
  const paid = ledger.tx.some((r) => r.c === 'rev' && r.l === big.n && r.d.slice(0, 7) === month(0));
  const cyc = month(paid ? -1 : 0);
  const sk = 'rev|' + big.n.toLowerCase();
  const promised = paid ? iso(+cyc.slice(0, 4), +cyc.slice(5), big.day) : plus(23);

  return {
    v: 2, savedAt: new Date(typedAt).toISOString(), savedBy: 'Mika', cushion: 5000, horizon: plus(45),
    fx: { USD: RATE.USD, RUB: RATE.RUB, EUR: RATE.EUR, AMD: RATE.AMD },
    banks,
    inflows: [
      row('h|' + sk + '|' + cyc, big.n, big.base, big.b, promised, 'Mika', { blk: 'rev', sk, cyc, src: 'hist', tag: 'обещали к концу месяца' }),
      // An invoice to a client who is not a regular, due next week.
      row('p2', 'Ashgrove — second half', 2600, 'Wise', plus(9), 'Misha', { blk: 'rev' }),
      // And one that should have arrived more than two weeks ago.
      row('p3', 'Saffron Row', 1900, 'Wise', plus(-18), 'Mika', { blk: 'rev' }),
    ],
    team: [],
    taxes: [
      // VAT for the quarter the page works out by itself; an instalment agreed with HMRC it cannot know.
      row('p4', 'HMRC VAT — рассрочка', 2400, 'Barclays', plus(13), 'Vanya', { blk: 'tax' }),
    ],
    other: [
      row('p5', 'Misha', 3000, 'Barclays', plus(9), 'Misha', { blk: 'misha' }),
    ],
    ser: {},
    tails: Object.fromEntries(['rev', 'cogs', 'small', 'behalf', 'mika', 'misha', 'vanya'].map((k) => [k, { on: true }])),
    vat: { on: true },
    // As a plan nobody has switched anything in: the cautious scenario is shown only where a founder asks for it.
    cautious: { on: false },
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
