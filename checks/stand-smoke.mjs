#!/usr/bin/env node
// The unchanged page on the real backend, in a real browser.
//
// The page's own checks (scripts/money-checks.mjs) play the server themselves:
// a dozen lines that answer the founder API from memory. So they prove the
// page, and nothing about whether the page and Money's hosted service fit.
// This is the one check that puts the two together: index.html exactly as it
// is in the repository, served by a real `python -m moneyd`, opened in
// Chromium at http://finance.localhost:<port>/ - a name the browser resolves
// to this machine by itself, and one that begins with "finance.", which is
// how the page knows it is at home.
//
// The service runs as a dev stand: its own process, a temporary data
// directory, plain http on loopback. Everything else is the real thing, and
// above all the content security policy is the enforced one. That policy is
// what can break a new page without any other check noticing, so everything
// here happens under it and any violation fails the run.
//
// What is held, in the order it happens:
//   - a stranger lands on /login, and the doors to the money answer 401;
//   - the stand is seeded with the fabricated studio (scripts/money-demo.mjs)
//     through `ctl seed`, the way the test stand is;
//   - a one-time link sets a password, signs its holder in, and works once;
//     the login it was for is named once the link has worked - by the door,
//     in the page's own username field and in words - and to no link that
//     does not work;
//   - /login knows a signed-in founder by name and by login, its «Выйти»
//     signs out, and its form says what a login is;
//   - a wrong password is refused, the right one opens the page;
//   - the page is the file byte for byte, loads both documents and knows the
//     founder's name;
//   - one save raises the ledger's revision by one;
//   - a PDF and an Excel file are read by the page's own readers;
//   - a session closed from `ctl` shuts the page: its save is refused, it says
//     so, and nothing of it is stored;
//   - /data hands a document over as a file - the bare document, named for
//     the day - and takes it back; before it replaces what the server holds
//     it downloads that by itself; and it saves no file when the door does
//     not answer.
// And throughout: no console error, no page error, no policy violation, no
// request to any host but the stand's own.
//
//   npm install && npx playwright install --with-deps chromium
//   node checks/stand-smoke.mjs
//
// It needs node 22, Playwright (package.json pins it) and a python3 that can
// run moneyd; PYTHON names another interpreter. It is run by CI
// (.github/workflows/ci.yml, job stand-smoke) and is not meant for the Mac.
// SMOKE_ARTIFACTS names a folder for the service's log and, when something
// fails, a picture of the screen it failed on.
//
// What it asks of Money's own pages - the only markup it leans on:
//   /login         input[autocomplete="username"], input[autocomplete="current-password"],
//                  a submit control in the same form; signed in: a button «Выйти»
//                  and the login in words
//   /set-password  one or two input[autocomplete="new-password"], a submit control;
//                  once the password is saved: the login in a read-only
//                  input[autocomplete="username"], the words «Пароль сохранён»
//                  and «Логин: …», and a control to go on (#setup-go, or a
//                  link or button that says «Открыть Money»)
//   /data          the ledger's download control ([data-download="ledger"], or a
//                  link or button that says «Скачать выписки»); an input[type="file"]
//                  ([data-upload="ledger"], or the first one); and, if the page
//                  wants a second press, [data-upload-confirm] or a button that
//                  says «Загрузить» or «Заменить»
// and of the CLI: `python -m moneyd.ctl user invite <login> --print`, which on
// a dev stand prints the link although its output is not a terminal, and the
// login on a line of its own.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
const ARTIFACTS = process.env.SMOKE_ARTIFACTS || path.join(os.tmpdir(), 'money-stand-smoke');
const FOUNDERS = 'mika:Mika,misha:Misha,vanya:Vanya';
const LOGIN = 'mika';
const FIRST_NAME = 'Mika';

// ---- saying what happened ----
// Nothing that signs somebody in is ever printed: not a link, not a cookie, not
// the password of this run - whoever's words they come in. Every line that is
// said goes through here, a browser's error and its call log included.
const unsaid = [];
const hush = (text) => {
  let out = String(text || '').replace(/#t=\S+/g, '#t=<hidden>').replace(/(money-dev|__Host-money)=[^;\s]+/g, '$1=<hidden>');
  for (const secret of unsaid) out = out.split(secret).join('<hidden>');
  return out;
};
let checks = 0;
let failed = 0;
const say = (line) => console.log(hush(line));
const section = (name) => say(`\n-- ${name}`);
const show = (got) => (typeof got === 'string' ? got : JSON.stringify(got, null, 1)).split('\n').join('\n        ');
const ok = (cond, msg, got) => {
  checks++;
  say((cond ? 'ok    ' : 'FAIL  ') + msg + (cond || got === undefined ? '' : '\n        got: ' + show(got)));
  if (!cond) failed++;
  return !!cond;
};
// A step the rest stands on. When it fails there is nothing left worth trying.
class Stop extends Error {}
const must = (cond, msg, got) => {
  if (!ok(cond, msg, got)) throw new Stop(msg);
};
// What a helper needs before it can do its work: said only when it is missing.
const need = (cond, msg, got) => {
  if (!cond) must(false, msg, got);
};
const note = (line) => say('note  ' + line);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (probe, ms, every = 250) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > end) return null;
    await sleep(every);
  }
};
const tail = (text, lines = 25) => hush(text).trim().split('\n').slice(-lines).join('\n');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
// Two documents are the same if they say the same, whatever order their keys were written in.
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));

// ---- files made here, byte by byte ----
// A statement as a CSV, as an Excel file and as a PDF. They are written out
// by hand so that the readers under test (SheetJS, pdf.js) are not also the
// writers, and so that nothing but Playwright has to be installed.
// --- fixtures (begin) ---
const ascii = (text) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 126 || (code < 32 && code !== 10)) throw new Error('a fixture is plain ASCII, and this is not: ' + JSON.stringify(text.slice(i, i + 12)));
    out[i] = code;
  }
  return out;
};
const joined = (parts) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
// A zip with nothing compressed: for each file a header, its name and its
// bytes; then the directory of them; then the record that says where that is.
function zipOf(files) {
  const record = (size, fields) => {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    for (const [at, width, value] of fields) {
      if (width === 2) view.setUint16(at, value, true);
      else view.setUint32(at, value, true);
    }
    return bytes;
  };
  const DATE = 0x21; // 1 January 1980, the first day a zip can name
  const bodies = [];
  const directory = [];
  let offset = 0;
  for (const [name, text] of files) {
    const title = ascii(name);
    const data = ascii(text);
    const crc = crc32(data);
    bodies.push(record(30, [[0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, DATE], [14, 4, crc], [18, 4, data.length], [22, 4, data.length], [26, 2, title.length], [28, 2, 0]]), title, data);
    directory.push(record(46, [[0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, DATE], [16, 4, crc], [20, 4, data.length], [24, 4, data.length], [28, 2, title.length], [30, 2, 0], [32, 2, 0], [34, 2, 0], [36, 2, 0], [38, 4, 0], [42, 4, offset]]), title);
    offset += 30 + title.length + data.length;
  }
  const listing = joined(directory);
  const end = record(22, [[0, 4, 0x06054b50], [4, 2, 0], [6, 2, 0], [8, 2, files.length], [10, 2, files.length], [12, 4, listing.length], [16, 4, offset], [20, 2, 0]]);
  return joined([...bodies, listing, end]);
}
// One sheet of text and numbers, the least an .xlsx can be: no styles, no
// shared strings. A row is a list of cells; '' leaves a cell out.
function xlsxOf(rows) {
  const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const letter = (c) => String.fromCharCode(65 + c);
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const cell = (value, r, c) => {
    if (value === '') return '';
    const at = letter(c) + (r + 1);
    return typeof value === 'number' ? `<c r="${at}"><v>${value}</v></c>` : `<c r="${at}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  };
  const sheet = head
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${letter(rows[0].length - 1)}${rows.length}"/>`
    + '<sheetData>' + rows.map((row, r) => `<row r="${r + 1}">` + row.map((value, c) => cell(value, r, c)).join('') + '</row>').join('') + '</sheetData>'
    + '</worksheet>';
  return zipOf([
    ['[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}
// One page of text in Helvetica, 10 points: each cell is [x, y, text], placed
// where it says. The offsets in the table at the end are counted, not guessed.
function pdfOf(cells) {
  const escaped = (text) => text.replace(/[\\()]/g, (c) => '\\' + c);
  const stream = 'BT\n/F1 10 Tf\n' + cells.map(([x, y, text]) => `1 0 0 1 ${x} ${y} Tm (${escaped(text)}) Tj\n`).join('') + 'ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const table = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((at) => String(at).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${table}\n%%EOF\n`;
  return ascii(out);
}
const WISE_COLUMNS = ['TransferWise ID', 'Date', 'Amount', 'Currency', 'Description', 'Payment Reference', 'Payer Name', 'Payee Name', 'Merchant', 'Card Holder Full Name'];
// A day as a bank's export writes it, and as its statement prints it.
const dayDMY = (day) => `${day.slice(8)}-${day.slice(5, 7)}-${day.slice(0, 4)}`;
const dayWords = (day) => `${day.slice(8)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+day.slice(5, 7) - 1]} ${day.slice(0, 4)}`;
const wiseRow = (id, day, amount, text, payer) => [id, dayDMY(day), amount, 'GBP', text, '', payer, '', '', ''];
const csvOf = (rows) => rows.map((row) => row.map((value) => (typeof value === 'number' ? value.toFixed(2) : value)).join(',')).join('\n');
// A bank statement of one line: the heads «Money out», «Money in», «Balance»,
// and under them a payment of 12.34 on that day.
const statementCells = (day, mark) => [
  [50, 790, 'Barclays statement'],
  [50, 760, 'Date'], [120, 760, 'Description'], [330, 760, 'Money out'], [420, 760, 'Money in'], [500, 760, 'Balance'],
  [50, 740, dayWords(day)], [120, 740, mark], [330, 740, '12.34'], [500, 740, '987.66'],
];
// --- fixtures (end) ---

// ---- the stand ----
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

for (const [file, why] of [['index.html', 'the page'], ['scripts/money-demo.mjs', 'the fabricated studio'], ['moneyd/__main__.py', 'the service']]) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    console.error(`stand-smoke: ${file} (${why}) is not in this checkout, so there is nothing to check.`);
    process.exit(1);
  }
}
if (fs.existsSync(path.join(ROOT, 'data'))) {
  console.error('stand-smoke: this checkout has a data/ folder. That is where the laptop tool keeps the real ledger; nothing is run beside it.');
  process.exit(1);
}
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  console.error('stand-smoke: Playwright is not installed. At the repository root: npm install && npx playwright install --with-deps chromium');
  console.error(String(e && e.message));
  process.exit(1);
}
const { demoLedger, demoPlan } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'money-demo.mjs')).href);

fs.mkdirSync(ARTIFACTS, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'money-smoke-'));
const DATA = path.join(WORK, 'data');
fs.mkdirSync(DATA, { mode: 0o700 });
const PORT = await freePort();
const HOST = `finance.localhost:${PORT}`;
const BASE = `http://${HOST}`;
// "Today" as the page reckons it: the date in London.
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const YESTERDAY = new Date(Date.parse(TODAY + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
// What this run's own rows are called, so that they can be found again.
const RUN = Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 24]).join('');
// A password for this run only, on a stand that lives for this run only. Never printed.
const PASSWORD = (() => {
  for (;;) {
    const made = 'Sm-' + crypto.randomBytes(18).toString('base64url');
    if (!/mika|misha|vanya|password|qwerty|123456|selfstudio|money|finance/i.test(made)) return made;
  }
})();
unsaid.push(PASSWORD);

// The service gets these settings and no others: whatever MONEY_* the caller's
// environment holds is left behind.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MONEY_')));
Object.assign(ENV, {
  MONEY_STAND: 'dev',
  MONEY_BIND: `127.0.0.1:${PORT}`,
  MONEY_PUBLIC_URL: BASE,
  MONEY_DATA_DIR: DATA,
  MONEY_WEB_DIR: ROOT,
  MONEY_FOUNDERS: FOUNDERS,
  MONEY_CSP: 'enforce',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONUNBUFFERED: '1',
});

let server = null;
let serverExit = null;
const serverLog = [];
function startStand() {
  server = spawn(PYTHON, ['-m', 'moneyd'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (chunk) => serverLog.push(chunk.toString('utf8')));
  server.stderr.on('data', (chunk) => serverLog.push(chunk.toString('utf8')));
  server.on('error', (e) => { serverExit = { error: String(e.message) }; });
  server.on('exit', (code, signal) => { serverExit = { code, signal }; });
}
async function stopStand() {
  if (!server || serverExit) return;
  server.kill('SIGTERM');
  if (!(await until(() => serverExit, 8000, 100))) {
    server.kill('SIGKILL');
    await until(() => serverExit, 3000, 100);
  }
}
// The CLI, as a person on the server runs it. What it prints is handed back
// and never shown as it is: `invite` prints a link.
function ctl(args, input) {
  const done = spawnSync(PYTHON, ['-m', 'moneyd.ctl', ...args], { cwd: ROOT, env: ENV, input, encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
  return { status: done.status, out: done.stdout || '', err: (done.stderr || '') + (done.error ? String(done.error.message) : '') };
}
// One request to the stand from here, not from the browser: to the loopback
// address, under the stand's public name. No name is looked up anywhere.
function door(method, pathname, { cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: PORT, method, path: pathname, agent: false, headers: { Host: HOST, Connection: 'close', ...(cookie ? { Cookie: cookie } : {}), ...(headers || {}) } }, (answer) => {
      const chunks = [];
      answer.on('data', (chunk) => chunks.push(chunk));
      answer.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(bytes.toString('utf8')); } catch (e) { /* not JSON, and that is an answer too */ }
        resolve({ status: answer.statusCode, headers: answer.headers, bytes, json });
      });
    });
    request.setTimeout(20000, () => request.destroy(new Error(`${method} ${pathname}: no answer within 20 s`)));
    request.on('error', reject);
    request.end();
  });
}

// ---- the browser ----
// Everything a page complains about is kept, and any of it fails the run -
// except what a step has said it expects (a refused save says so in the console).
const problems = [];
const tolerated = [];
const responses = [];
let expected = [];
async function expecting(patterns, work) {
  const before = expected;
  expected = before.concat(patterns);
  try {
    return await work();
  } finally {
    await sleep(500); // what the browser has to say about a refusal comes a moment after it
    expected = before;
  }
}
const complain = (line) => {
  if (expected.some((pattern) => pattern.test(line))) tolerated.push(line);
  else problems.push(line);
};
function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') complain(`console error: ${hush(message.text())} ${hush(message.location().url || '')}`.trim());
  });
  page.on('pageerror', (error) => complain(`page error: ${hush(error.message)}`));
  page.on('requestfailed', (request) => {
    const why = request.failure() ? request.failure().errorText : '';
    // A navigation that turns into a download, and a page that is left while it still loads, end like this.
    if (/ERR_ABORTED/.test(why)) return;
    complain(`request failed: ${request.method()} ${hush(request.url())} ${why}`);
  });
  page.on('response', (answer) => {
    let pathname = '';
    try { pathname = new URL(answer.url()).pathname; } catch (e) { /* not a URL the stand serves */ }
    responses.push({ method: answer.request().method(), path: pathname, status: answer.status(), origin: answer.url().startsWith(BASE + '/') });
  });
  page.on('dialog', (dialog) => {
    note(`the page asked: ${dialog.message().slice(0, 120)} - answered yes`);
    dialog.accept().catch(() => {});
  });
}
async function openContext(browser) {
  // (Less motion: the page then plays none of its unfolding and waits for none - a smoke presses and reads at once.)
  const context = await browser.newContext({ viewport: { width: 1320, height: 900 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  context.setDefaultTimeout(20000);
  context.setDefaultNavigationTimeout(30000);
  // A violation of the policy is reported by the browser as an event. This
  // listens to it; it changes nothing the page does or is served.
  await context.exposeBinding('__smokePolicyViolation', (source, v) => {
    problems.push(`policy violation on ${v.document}: ${v.directive} would not allow ${v.blocked || 'an inline or evaluated script'} (${v.disposition})${v.sample ? ' - ' + v.sample : ''}`);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      if (typeof window.__smokePolicyViolation !== 'function') return;
      let where = '';
      try { where = new URL(e.documentURI).pathname; } catch (err) { where = '?'; }
      window.__smokePolicyViolation({ document: where, directive: e.effectiveDirective || e.violatedDirective, blocked: e.blockedURI, disposition: e.disposition, sample: (e.sample || '').slice(0, 80) });
    });
  });
  // Nothing may be asked of any host but the stand's own. The page's fonts are
  // the one exception its policy allows; the check has no use for them and
  // must not wait on the network, so they are answered here, empty.
  await context.route((url) => (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== HOST, (route) => {
    const url = new URL(route.request().url());
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {});
    problems.push(`the page asked another host for ${url.origin}${url.pathname}`);
    return route.abort().catch(() => {});
  });
  context.on('page', watch);
  return context;
}
const cookieOf = async (context) => (await context.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
const pathOf = (page) => {
  try { return new URL(page.url()).pathname; } catch (e) { return page.url(); }
};
// What is on the screen, for a line that says something is missing from it.
// Attributes and words only: never a value somebody typed.
async function screen(page) {
  try {
    return await page.evaluate(() => {
      const one = (e) => {
        const seen = {};
        for (const name of ['id', 'name', 'type', 'autocomplete', 'role', 'download']) if (e.hasAttribute(name)) seen[name] = e.getAttribute(name);
        for (const key of Object.keys(e.dataset)) seen['data-' + key] = e.dataset[key];
        return `<${e.tagName.toLowerCase()}> ${JSON.stringify(seen)} ${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}`;
      };
      return {
        path: location.pathname,
        title: document.title,
        controls: [...document.querySelectorAll('form, input, button, a, select, textarea')].slice(0, 40).map(one),
        words: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 300),
      };
    });
  } catch (e) {
    return { unreadable: String(e && e.message) };
  }
}
let pictures = 0;
async function picture(page, name) {
  try {
    await page.screenshot({ path: path.join(ARTIFACTS, `${String(++pictures).padStart(2, '0')}-${name}.png`), fullPage: true });
  } catch (e) { /* a picture is a courtesy */ }
}
// The first of several ways to find a thing that finds it.
async function found(page, selectors) {
  for (const selector of selectors) {
    const all = page.locator(selector);
    if (await all.count()) return all.first();
  }
  return null;
}
// A page that is on its way somewhere by its own script (after signing in, after signing out) can
// interrupt a navigation that is asked of it at the same moment. That is no fault of anybody's: ask again.
async function go(page, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(url);
    } catch (e) {
      if (attempt >= 3 || !/interrupted by another navigation|ERR_ABORTED/.test(String(e && e.message))) throw e;
      await sleep(500);
    }
  }
}
const SUBMIT = ['form button[type="submit"]', 'form input[type="submit"]', 'form button:not([type])', 'button[type="submit"]'];
// A form may be drawn by the page's own script a moment after the page has loaded.
const passwordField = (page) => page.waitForSelector('input[type="password"], input[autocomplete="new-password"], input[autocomplete="current-password"]', { timeout: 10000 }).catch(() => null);
async function submit(page, field) {
  const button = await found(page, SUBMIT);
  if (button) await button.click();
  else await field.press('Enter');
}
const meOf = async (context) => {
  const cookie = await cookieOf(context);
  return cookie ? door('GET', '/api/me', { cookie }) : { status: 401, json: null };
};
// Which of the founder's two names a page shows - in its words or in a field that is not a
// password's. A page that has not been given a working link must show neither.
const namesShown = (page) => page.evaluate((names) => {
  const shown = (document.body ? document.body.innerText : '') + '\n' + [...document.querySelectorAll('input:not([type="password"])')].map((field) => field.value).join('\n');
  return names.filter((name) => shown.includes(name));
}, [LOGIN, FIRST_NAME]);

// The sign-in form, filled and sent.
async function signIn(page, login, password) {
  if (pathOf(page) !== '/login') await go(page, BASE + '/login');
  await passwordField(page);
  const name = await found(page, ['input[autocomplete="username"]', 'input[name="login"]', 'input[type="text"]']);
  const secret = await found(page, ['input[autocomplete="current-password"]', 'input[type="password"]']);
  need(name && secret, '/login shows a form: a field for the login and one for the password', await screen(page));
  await name.fill(login);
  await secret.fill(password);
  await submit(page, secret);
}
// The page has read both documents and knows who is signed in.
async function pageIsUp(page, when) {
  try {
    await page.waitForFunction(() => {
      const pill = document.querySelector('#sync');
      return pill && !pill.textContent.includes('загружаю');
    }, null, { timeout: 30000 });
    await page.waitForFunction((who) => window.__cash && window.__cash.state() && window.__money && window.__money.by === who, FIRST_NAME, { timeout: 30000 });
  } catch (e) {
    await picture(page, 'page-not-up');
    const state = await page.evaluate(() => ({
      pill: document.querySelector('#sync') ? document.querySelector('#sync').textContent : null,
      plan: !!(window.__cash && window.__cash.state()),
      by: window.__money ? window.__money.by : null,
    })).catch((err) => ({ unreadable: String(err && err.message) }));
    must(false, `${when}: the page loads both documents and knows the founder's name`, { state, screen: await screen(page) });
  }
}
const pill = (page) => page.evaluate(() => {
  const e = document.querySelector('#sync');
  return e ? { text: e.textContent, kind: e.className } : null;
});
// The page's own way in for statements: the file box of «Загрузка», which is opened from «Настройки» (until
// 8 October 2026 it had a button of its own in the bar).
async function statementBox(page) {
  const tab = page.locator('.nav [data-tab="upload"]');
  const settings = page.locator('.nav [data-tab="settings"]');
  if (await tab.count()) await tab.first().click();
  else if (await settings.count()) {
    await settings.first().click();
    const door = page.locator('main > [id^="view-"]:not([hidden]) [data-tabgo="upload"]');
    if (await door.count()) await door.first().click();
  }
  const box = await found(page, ['input[type="file"][accept*=".pdf"]', '#fileIn']);
  need(box, 'the page has a file box that takes statements (CSV, Excel, PDF)', await screen(page));
  return box;
}
// How the page lists a file it was given, by the file's own name.
const listed = (page, name) => page.evaluate((wanted) => {
  const rows = [...document.querySelectorAll('.file')].filter((e) => e.textContent.includes(wanted));
  if (rows.length) return { refused: rows[0].classList.contains('err'), words: rows[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 240) };
  return document.body.textContent.includes(wanted) ? { refused: null, words: '(named somewhere on the page)' } : null;
}, name);
async function give(page, box, name, type, bytes) {
  await box.setInputFiles({ name, mimeType: type, buffer: Buffer.from(bytes) });
  const row = await until(() => listed(page, name), 30000);
  if (!row) await picture(page, 'file-not-listed');
  return row;
}
const ledgerAt = async (context) => {
  const answer = await door('GET', '/api/founder/money', { cookie: await cookieOf(context) });
  return answer.status === 200 && answer.json ? answer.json : { rev: null, doc: null, status: answer.status };
};
const putsSince = (mark) => responses.slice(mark).filter((r) => r.method === 'PUT' && r.path === '/api/founder/money');
// Nothing is being saved and nothing is waiting to be.
async function quiet(page) {
  let last = responses.length;
  let since = Date.now();
  return until(async () => {
    if (responses.length !== last) {
      last = responses.length;
      since = Date.now();
    }
    const now = await pill(page);
    return now && /ok/.test(now.kind) && Date.now() - since > 1800;
  }, 25000, 200);
}

// ---- the run ----
// However it ends, the service does not outlive it.
process.on('exit', () => {
  if (server && !serverExit) server.kill('SIGKILL');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));
// A promise nobody waited for must be told about, not allowed to end the run in the middle.
process.on('unhandledRejection', (reason) => {
  problems.push('the smoke left a promise unanswered: ' + hush(reason && reason.message ? reason.message : String(reason)).split('\n')[0]);
});
const watchdog = setTimeout(() => {
  console.error('\nFAIL  the smoke ran for more than eight minutes and was stopped');
  if (server && !serverExit) server.kill('SIGKILL');
  process.exit(1);
}, 8 * 60 * 1000);
watchdog.unref();

let browser = null;
let lastPage = null;
try {
  section(`a dev stand at ${BASE}`);
  startStand();
  const up = await until(async () => {
    if (serverExit) return 'gone';
    try { return (await door('GET', '/login')).status === 200 ? 'up' : null; } catch (e) { return null; }
  }, 30000, 200);
  must(up === 'up', '`python -m moneyd` starts as a dev stand and answers /login', { exit: serverExit, said: tail(serverLog.join('')) });

  // -- a stranger --
  const stranger = await door('GET', '/api/founder/money');
  ok(stranger.status === 401 && stranger.json && stranger.json.error === 'unauthenticated' && !stranger.headers.location, 'the ledger door answers a stranger 401, as JSON', { status: stranger.status, type: stranger.headers['content-type'] });
  const reader = await door('GET', '/money/vendor/pdf.min.js');
  ok(reader.status === 401, 'a vendor file is not handed to a stranger', reader.status);
  const front = await door('GET', '/');
  ok(front.status === 302 && /\/login$/.test(front.headers.location || ''), 'the front door sends a stranger to /login', { status: front.status, location: front.headers.location });

  // -- the fabricated studio --
  section('the fabricated studio goes in through `ctl seed`');
  const before = ctl(['empty']);
  must(before.status === 0, '`ctl empty` says a new stand is empty (exit 0)', { status: before.status, said: tail(before.out + before.err) });
  for (const [what, doc] of [['ledger', demoLedger(TODAY)], ['plan', demoPlan(TODAY)]]) {
    const seeded = ctl(['seed', what, '--fresh'], JSON.stringify(doc));
    must(seeded.status === 0, `\`ctl seed ${what} --fresh\` takes the generator's ${what}`, { status: seeded.status, said: tail(seeded.out + seeded.err) });
  }
  const after = ctl(['empty']);
  ok(after.status === 1, '`ctl empty` says a seeded stand is not empty (exit 1)', { status: after.status, said: tail(after.out + after.err) });

  // -- the browser --
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await openContext(browser);
  const page = await context.newPage();
  lastPage = page;

  section('a stranger in the browser');
  await go(page, BASE + '/');
  must(pathOf(page) === '/login', 'opening the page signed out lands on /login', pathOf(page));
  ok(!!(await passwordField(page)), '/login shows the sign-in form', await screen(page));

  // -- a one-time link --
  section('a one-time link sets a password');
  const invited = ctl(['user', 'invite', LOGIN, '--print']);
  must(invited.status === 0, '`ctl user invite mika --print` issues a link on a dev stand', { status: invited.status, said: tail(invited.out + invited.err) });
  const link = (invited.out.match(/https?:\/\/\S+\/set-password#\S+/) || [])[0];
  must(link, 'it prints the link', tail(invited.out));
  must(link.startsWith(BASE + '/set-password#'), 'the link is built from the public URL, with the token after the #', hush(link));
  // The sign-in page asks for a login and nothing else says what it is, so it travels with the link.
  ok(invited.out.split('\n').some((line) => !line.includes('://') && new RegExp(`(^|[\\s:])${LOGIN}$`).test(line.trim())), '`invite` prints the login on a line of its own, to be passed on with the link');
  await go(page, link);
  await passwordField(page);
  const fresh = page.locator('input[autocomplete="new-password"]');
  const fields = (await fresh.count()) ? fresh : page.locator('input[type="password"]');
  must((await fields.count()) >= 1, '/set-password shows a field for the new password', await screen(page));
  ok(!page.url().includes('#t='), 'the token is gone from the address bar', hush(page.url()));
  ok((await namesShown(page)).length === 0, 'before the link has worked the page names nobody', await namesShown(page));
  for (let i = 0; i < (await fields.count()); i++) await fields.nth(i).fill(PASSWORD);
  // What the door answers the link with. Only its members' names are ever shown.
  const answered = page.waitForResponse((answer) => answer.request().method() === 'POST' && new URL(answer.url()).pathname === '/api/auth/setup', { timeout: 20000 })
    .then((answer) => answer.json())
    .catch(() => null);
  await submit(page, fields.first());
  const me = await until(async () => {
    const answer = await meOf(context);
    return answer.status === 200 ? answer : null;
  }, 20000);
  if (!me) await picture(page, 'set-password');
  must(me, 'choosing a password signs the founder in', { me: (await meOf(context)).status, screen: await screen(page) });
  ok(me.json && me.json.firstName === FIRST_NAME && me.json.stand === 'dev', `/api/me says who: ${FIRST_NAME}, on the dev stand`, me.json);
  const jar = await context.cookies(BASE);
  ok(jar.length === 1 && jar[0].name === 'money-dev' && jar[0].httpOnly && jar[0].sameSite === 'Lax', 'the session is one cookie, money-dev: HttpOnly, SameSite=Lax', jar.map((c) => ({ name: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite, secure: c.secure })));

  // The login, said now that the link has worked: by the door, and by the page before it lets go.
  const setup = await answered;
  ok(setup && setup.ok === true && setup.login === LOGIN && setup.firstName === FIRST_NAME, `the door answers the link with the login it was for: ${LOGIN}`, setup && typeof setup === 'object' ? Object.keys(setup) : setup);
  const whose = page.locator('input[autocomplete="username"]');
  const named = await until(async () => ((await whose.count()) && (await whose.first().inputValue()) === LOGIN ? true : null), 10000);
  if (!named) await picture(page, 'set-password-login');
  ok(named && (await whose.first().isVisible()) && !(await whose.first().isEditable()), 'the page shows the login in a username field of its own, which cannot be typed in', await screen(page));
  const afterwards = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  ok(/Пароль сохранён/.test(afterwards) && afterwards.includes(`Логин: ${LOGIN}`), `and says so in words: «Пароль сохранён. Логин: ${LOGIN}»`, afterwards.slice(0, 240));
  const onward = (await found(page, ['#setup-go']))
    || (await found(page, ['a:visible:has-text("Открыть Money")', 'button:visible:has-text("Открыть Money")']));
  must(onward, 'with a control to go on to the page', await screen(page));
  await onward.click();
  try {
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
  } catch (e) {
    await picture(page, 'set-password-onward');
    must(false, 'which opens the page', { path: pathOf(page), screen: await screen(page) });
  }
  await pageIsUp(page, 'after choosing a password');
  ok(true, 'which opens the page, signed in');

  // The same link again, by somebody who is not signed in.
  const second = await openContext(browser);
  const again = await second.newPage();
  await expecting([/404/, /invalid_link/], async () => {
    await go(again, link);
    await passwordField(again);
    const retry = again.locator('input[autocomplete="new-password"]');
    const boxes = (await retry.count()) ? retry : again.locator('input[type="password"]');
    if (await boxes.count()) {
      for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).fill(PASSWORD + '-again');
      await submit(again, boxes.first());
      await sleep(1500);
    }
    ok((await namesShown(again)).length === 0, 'a link that does not work is told no login and no name', await namesShown(again));
  });
  ok((await second.cookies(BASE)).length === 0 && (await meOf(second)).status === 401, 'the link works once: a second use signs nobody in', { cookies: (await second.cookies(BASE)).length });
  await second.close();

  // -- /login for somebody who is signed in, and the way out --
  section('signing out, and signing in through the form');
  await go(page, BASE + '/logout');
  must(pathOf(page) === '/login', '/logout leads to /login', pathOf(page));
  const out = page.getByRole('button', { name: 'Выйти' });
  await out.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const greeting = await page.locator('body').innerText();
  ok(greeting.includes(FIRST_NAME), `/login knows a signed-in founder by name (${FIRST_NAME})`, await screen(page));
  ok(greeting.includes(LOGIN), `and says the login beside the name (${LOGIN}): it is what the form asks for`, greeting.replace(/\s+/g, ' ').slice(0, 240));
  must((await out.count()) >= 1, '/login has a button «Выйти» for a signed-in founder', await screen(page));
  await out.first().click();
  const gone = await until(async () => (await meOf(context)).status === 401, 15000);
  must(gone, '«Выйти» ends the session', { me: (await meOf(context)).status });

  await go(page, BASE + '/login');
  await passwordField(page);
  const asked = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  ok(/имя из ссылки.приглашения, не e.mail/.test(asked), 'the sign-in form says what a login is: the name from the invitation, not an e-mail', asked.slice(0, 240));
  await expecting([/401/], async () => {
    await signIn(page, LOGIN, PASSWORD + 'x');
    await sleep(2500);
  });
  ok(pathOf(page) === '/login' && (await meOf(context)).status === 401, 'a wrong password is refused, and the browser stays on /login', { path: pathOf(page), me: (await meOf(context)).status });

  await go(page, BASE + '/login');
  await signIn(page, LOGIN, PASSWORD);
  try {
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
  } catch (e) {
    await picture(page, 'sign-in');
    must(false, 'the right password opens the page', { path: pathOf(page), me: (await meOf(context)).status, screen: await screen(page) });
  }
  ok(true, 'the right password opens the page');

  // -- the page --
  section('the page, as it is in the repository');
  await pageIsUp(page, 'after signing in');
  ok(true, `the page has loaded and knows the founder: ${FIRST_NAME}`);
  const reads = (suffix) => responses.some((r) => r.method === 'GET' && r.path === suffix && r.status === 200);
  ok(reads('/api/founder/money') && reads('/api/founder/money/cash') && reads('/api/me'), 'it read the ledger, the plan and who is signed in', responses.filter((r) => r.path.startsWith('/api/')).map((r) => `${r.method} ${r.path} ${r.status}`));
  const planOnPage = await page.evaluate(() => {
    const plan = window.__cash.state();
    return { banks: Array.isArray(plan.banks) ? plan.banks.length : null };
  });
  ok(planOnPage.banks === demoPlan(TODAY).banks.length, 'the plan on the page is the seeded one, bank for bank', planOnPage);
  const served = await door('GET', '/', { cookie: await cookieOf(context) });
  ok(served.status === 200 && sha256(served.bytes) === sha256(fs.readFileSync(path.join(ROOT, 'index.html'))), 'what is served at / is index.html, byte for byte', { status: served.status, bytes: served.bytes.length });
  const policy = served.headers['content-security-policy'] || '';
  must(policy.includes("default-src 'none'") && !policy.includes("'unsafe-eval'") && !/script-src[^;]*'unsafe-inline'/.test(policy) && !served.headers['content-security-policy-report-only'], 'the page is served under an enforced policy, with no unsafe-inline or unsafe-eval for scripts', { policy, reportOnly: served.headers['content-security-policy-report-only'] || null });

  // -- one save --
  section('one save raises the revision');
  must(await quiet(page), 'the page comes to rest: «сохранено»', await pill(page));
  const csvMark = `SMOKE-CSV-${RUN}`;
  const start = await ledgerAt(context);
  must(Number.isInteger(start.rev) && start.rev >= 1, 'the ledger door answers a founder with the seeded ledger', { rev: start.rev, status: start.status });
  let mark = responses.length;
  let box = await statementBox(page);
  const csvRow = await give(page, box, `smoke-wise-${RUN}.csv`, 'text/csv', ascii(csvOf([WISE_COLUMNS, wiseRow(`${csvMark}-1`, YESTERDAY, 777.77, `Received money from SMOKE CLIENT with reference ${csvMark}`, 'Smoke Client')])));
  ok(csvRow && csvRow.refused !== true, 'the page takes a CSV statement of one row', csvRow);
  const saved = await until(async () => ((await ledgerAt(context)).rev > start.rev ? true : null), 25000);
  await quiet(page);
  const puts = putsSince(mark);
  const now = await ledgerAt(context);
  must(saved && puts.length >= 1 && puts.every((r) => r.status === 200), 'the page saves by itself, and the save is accepted', { saves: puts.map((r) => r.status), rev: now.rev, pill: await pill(page) });
  ok(now.rev === start.rev + puts.length, `each save raised the revision by one: ${start.rev} -> ${now.rev} in ${puts.length} save(s)`, { before: start.rev, after: now.rev, saves: puts.length });
  ok(JSON.stringify(now.doc).includes(csvMark), 'what is stored is what the page sent: the new row is in the ledger at the door');
  const resting = await pill(page);
  ok(resting && /сохранено/.test(resting.text), 'and the page says «сохранено»', resting);

  // -- the readers, under the policy --
  section('a PDF is read under the enforced policy');
  const pdfName = `smoke-barclays-${RUN}.pdf`;
  const pdfMark = `SMOKE PDF ${RUN}`;
  const pdfBytes = pdfOf(statementCells(YESTERDAY, pdfMark));
  mark = responses.length;
  box = await statementBox(page);
  const pdfRow = await give(page, box, pdfName, 'application/pdf', pdfBytes);
  const loaded = (file) => responses.slice(mark).some((r) => r.path === '/money/vendor/' + file && r.status === 200);
  ok(loaded('pdf.min.js') && loaded('pdf.worker.min.js'), 'the page fetched its PDF reader from /money/vendor/', responses.slice(mark).filter((r) => r.path.startsWith('/money/vendor/')).map((r) => `${r.path} ${r.status}`));
  ok(pdfRow && !/Не получилось открыть PDF|нет текста/.test(pdfRow.words), 'the page opened the PDF and found text in it', pdfRow);
  const pdfText = await page.evaluate(async (bytes) => {
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (!lib) return { error: 'pdf.js is not on the page' };
    try {
      const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
      const first = await doc.getPage(1);
      const content = await first.getTextContent();
      return { pages: doc.numPages, text: content.items.map((item) => item.str).join(' ') };
    } catch (e) {
      return { error: String(e && e.message) };
    }
  }, Array.from(pdfBytes));
  ok(pdfText.pages === 1 && String(pdfText.text).includes(pdfMark), 'pdf.js, as the page loaded it, reads the text of that PDF', pdfText);
  await quiet(page);
  const afterPdf = await ledgerAt(context);
  ok(JSON.stringify(afterPdf.doc).includes(pdfMark), 'what the page read out of the PDF reached the ledger at the door', { rev: afterPdf.rev, page: pdfRow });
  if (pdfRow && pdfRow.refused === false) note(`the page's own statement reader took the PDF: ${pdfRow.words}`);
  else note(`the page's own statement reader did not take the made-up PDF as a statement (the reading of it is what is checked here): ${pdfRow ? pdfRow.words : 'not listed'}`);

  section('an Excel file is read under the enforced policy');
  const sheetName = `smoke-wise-${RUN}.xlsx`;
  const sheetMark = `SMOKE-XLSX-${RUN}`;
  const sheetBytes = xlsxOf([WISE_COLUMNS, wiseRow(`${sheetMark}-1`, YESTERDAY, 432.1, `Received money from SMOKE SHEET with reference ${sheetMark}`, 'Smoke Sheet')]);
  mark = responses.length;
  box = await statementBox(page);
  const sheetRow = await give(page, box, sheetName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sheetBytes);
  ok(responses.slice(mark).some((r) => r.path === '/money/vendor/xlsx.full.min.js' && r.status === 200), 'the page fetched its Excel reader from /money/vendor/', responses.slice(mark).filter((r) => r.path.startsWith('/money/vendor/')).map((r) => `${r.path} ${r.status}`));
  ok(sheetRow && sheetRow.refused !== true && !/Не загрузился модуль чтения Excel/.test(sheetRow.words), 'the page took the Excel statement', sheetRow);
  const sheetText = await page.evaluate((bytes) => {
    if (!window.XLSX) return { error: 'SheetJS is not on the page' };
    try {
      const book = window.XLSX.read(new Uint8Array(bytes), { type: 'array' });
      const grid = window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: '' });
      return { sheets: book.SheetNames, rows: grid.length, text: JSON.stringify(grid) };
    } catch (e) {
      return { error: String(e && e.message) };
    }
  }, Array.from(sheetBytes));
  ok(sheetText.rows === 2 && String(sheetText.text).includes(sheetMark) && String(sheetText.text).includes('432.1'), 'SheetJS, as the page loaded it, reads the cells of that file', sheetText);
  await quiet(page);
  const afterSheet = await ledgerAt(context);
  ok(JSON.stringify(afterSheet.doc).includes(sheetMark), 'the row of the Excel file reached the ledger at the door', { rev: afterSheet.rev, page: sheetRow });

  // -- a session closed on the server --
  section('a session closed from `ctl` shuts the page');
  must(await quiet(page), 'the page comes to rest before its session is closed', await pill(page));
  const held = await ledgerAt(context);
  const dead = await cookieOf(context);
  const closed = ctl(['sessions', 'logout', LOGIN]);
  must(closed.status === 0, '`ctl sessions logout mika` closes the sessions', { status: closed.status, said: tail(closed.out + closed.err) });
  ok((await door('GET', '/api/founder/money', { cookie: dead })).status === 401, 'the cookie the browser still holds opens nothing at the next request');
  const lateMark = `SMOKE-LATE-${RUN}`;
  await expecting([/401/], async () => {
    box = await statementBox(page);
    await give(page, box, `smoke-late-${RUN}.csv`, 'text/csv', ascii(csvOf([WISE_COLUMNS, wiseRow(`${lateMark}-1`, YESTERDAY, 55.55, `Received money from SMOKE LATE with reference ${lateMark}`, 'Smoke Late')])));
    const told = await until(async () => {
      const said = await pill(page);
      return said && /вход закончился/.test(said.text) ? said : null;
    }, 25000);
    if (!told) await picture(page, 'closed-session');
    ok(!!told, 'the open page is refused its next save and says «вход закончился»', await pill(page));
  });
  await go(page, BASE + '/');
  ok(pathOf(page) === '/login', 'and the page does not open again: / leads to /login', pathOf(page));

  section('signing in again');
  await signIn(page, LOGIN, PASSWORD);
  try {
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20000 });
  } catch (e) {
    await picture(page, 'sign-in-again');
    must(false, 'the same password signs in again', { path: pathOf(page), screen: await screen(page) });
  }
  await pageIsUp(page, 'after signing in again');
  const kept = await ledgerAt(context);
  ok(kept.rev === held.rev && !JSON.stringify(kept.doc).includes(lateMark), 'the closed session stored nothing: the ledger is at the revision it was', { before: held.rev, after: kept.rev });

  // -- a document as a file --
  section('/data hands a document over as a file and takes it back');
  await quiet(page);
  await go(page, BASE + '/data');
  must(pathOf(page) === '/data', '/data opens for a signed-in founder', pathOf(page));
  await page.waitForSelector('[data-download], a[download], a:has-text("Скачать"), button:has-text("Скачать")', { timeout: 10000 }).catch(() => null);
  await sleep(300);
  const control = (await found(page, ['[data-download="ledger"]']))
    || (await found(page, ['a[download]:has-text("выписк")', 'button:has-text("Скачать выписк")', 'a:has-text("Скачать выписк")']))
    || (await found(page, ['a[download]', 'a:has-text("Скачать")', 'button:has-text("Скачать")']));
  must(control, '/data has a control to download the ledger', await screen(page));
  let download = null;
  try {
    [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), control.click()]);
  } catch (e) {
    await picture(page, 'data-download');
    must(false, 'pressing it downloads a file', { why: String(e && e.message).split('\n')[0], screen: await screen(page) });
  }
  const file = path.join(WORK, 'downloaded.json');
  await download.saveAs(file);
  const fileText = fs.readFileSync(file, 'utf8');
  let taken = null;
  try { taken = JSON.parse(fileText); } catch (e) { /* said below */ }
  must(taken && typeof taken === 'object', `the file (${download.suggestedFilename()}) is JSON`, fs.readFileSync(file).subarray(0, 80).toString('utf8'));
  // The file is the document and nothing around it: the page's own import, the laptop tool and
  // the way back to the platform all read a bare document, and none of them reads the door's answer.
  const wrapped = 'doc' in taken && 'rev' in taken && !('tx' in taken) && !('banks' in taken);
  ok(!wrapped, 'it is the bare document, without the rev and updatedAt of the door around it', Object.keys(taken).slice(0, 8));
  const inside = wrapped ? taken.doc : taken;
  const kind = Array.isArray(inside.tx) ? 'ledger' : Array.isArray(inside.banks) ? 'plan' : null;
  must(kind, 'and it is one of the two documents: a ledger or a plan', Object.keys(inside).slice(0, 12));
  ok(new RegExp(`^money-${kind}-\\d{4}-\\d{2}-\\d{2}\\.json$`).test(download.suggestedFilename()), `it is named for the document and the day: money-${kind}-YYYY-MM-DD.json`, download.suggestedFilename());
  const at = kind === 'ledger' ? '/api/founder/money' : '/api/founder/money/cash';
  const atDoor = await door('GET', at, { cookie: await cookieOf(context) });
  const stored = atDoor.json;
  ok(stored && canon(stored.doc) === canon(inside), `the downloaded ${kind} is the one at the door`, { rev: stored && stored.rev });
  ok(!wrapped && atDoor.bytes.toString('utf8').includes(fileText.trim()), 'character for character: the file is the document as the door sends it');
  if (kind === 'ledger') ok(JSON.stringify(inside).includes(csvMark), 'with the rows this run added in it');

  const chooser = await found(page, [`input[type="file"][data-upload="${kind}"]`, 'input[type="file"]']);
  must(chooser, 'on a dev stand /data draws an upload control', await screen(page));
  const raised = async () => {
    const answer = (await door('GET', at, { cookie: await cookieOf(context) })).json;
    return answer && answer.rev === stored.rev + 1 ? answer : null;
  };
  // Whatever the page hands over as a file while it replaces the document is collected: before a
  // replace it is to download what the server holds, by itself.
  const copies = [];
  const collect = (handed) => copies.push(handed);
  page.on('download', collect);
  mark = responses.length;
  await chooser.setInputFiles(file);
  // The page may want a second press before it replaces a document.
  const press = await until(async () => (await found(page, ['[data-upload-confirm]:visible']))
    || (await found(page, ['button:visible:has-text("Заменить")', 'button:visible:has-text("Загрузить")', 'button:visible:has-text("Подтвердить")'])), 5000);
  if (press) {
    note(`/data wanted a second press: «${(await press.innerText()).trim().slice(0, 40)}»`);
    await press.click();
  }
  const back = await until(raised, 20000);
  if (!back) await picture(page, 'data-upload');
  must(back, `the file goes back in through /data: the ${kind} is one revision on`, { before: stored.rev, now: ((await door('GET', at, { cookie: await cookieOf(context) })).json || {}).rev, requests: responses.slice(mark).map((r) => `${r.method} ${r.path} ${r.status}`), screen: await screen(page) });
  ok(canon(back.doc) === canon(inside), 'and it is the same document that came out');
  const copy = await until(() => copies[0] || null, 5000);
  page.off('download', collect);
  let replaced = null;
  if (copy) {
    const keptFile = path.join(WORK, 'kept.json');
    await copy.saveAs(keptFile);
    try { replaced = JSON.parse(fs.readFileSync(keptFile, 'utf8')); } catch (e) { /* said below */ }
  }
  ok(copy && replaced && canon(replaced) === canon(stored.doc), 'before it replaced the document, the page downloaded what the server held, by itself', copy ? copy.suggestedFilename() : 'no file was handed over');
  if (copy) note(`the copy of what was replaced is named ${copy.suggestedFilename()}`);

  // -- no file without an answer --
  const shut = ctl(['sessions', 'logout', LOGIN]);
  must(shut.status === 0, 'the session is closed from the server once more', { status: shut.status, said: tail(shut.out + shut.err) });
  await expecting([/401/], async () => {
    let stray = null;
    try {
      [stray] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }), control.click()]);
    } catch (e) { /* nothing was handed over, which is what is wanted */ }
    ok(!stray, 'when the door does not answer, «Скачать» saves no file', stray ? stray.suggestedFilename() : undefined);
    const refusal = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    ok(/не скачан|Вход закончился/.test(refusal), 'and the page says that nothing was downloaded', refusal.slice(-240));
  });

  await context.close();
} catch (e) {
  if (!(e instanceof Stop)) {
    checks++;
    failed++;
    const what = e && e.message ? String(e.message) : String(e);
    const where = e && e.stack ? String(e.stack) : '';
    say('FAIL  the smoke itself broke: ' + hush(where.includes(what) ? where : what + '\n' + where));
  }
  if (lastPage) {
    await picture(lastPage, 'where-it-stopped');
    say('        the screen it stopped on: ' + show(await screen(lastPage)));
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopStand();
  clearTimeout(watchdog);
}

// ---- what the browser had to say, and the verdict ----
section('nothing went wrong on the way');
ok(problems.length === 0, 'no console error, no page error, no policy violation, no other host', problems);
if (tolerated.length) note(`${tolerated.length} refusal(s) the run asked for were said in the console, as expected`);
ok(serverExit && !serverExit.error && (serverExit.code === 0 || serverExit.signal === 'SIGTERM'), 'the service stopped when asked to', serverExit);
const said = serverLog.join('');
ok(!said.includes(PASSWORD), "the service's own output does not hold the password that was typed");

try {
  fs.writeFileSync(path.join(ARTIFACTS, 'server.log'), hush(said));
} catch (e) { /* the log is a courtesy */ }
if (failed) say('\n--- the last lines of the service ---\n' + tail(said, 40));
fs.rmSync(WORK, { recursive: true, force: true });

say(`\nstand-smoke: ${failed ? `${failed} of ${checks} checks FAILED` : `all ${checks} checks passed`}`);
process.exit(failed ? 1 : 0);
