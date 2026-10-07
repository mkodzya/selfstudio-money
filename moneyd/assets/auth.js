/* Money's own pages: /login, /set-password and /data.
 *
 * One file, loaded with `defer`; the pages have no inline script and no inline style, so
 * their policy can be script-src 'self' and nothing more. Every text this file puts on a
 * page is set with textContent: nothing that came from a server answer, a file or an
 * address is ever read as markup.
 *
 * The doors it talks to (docs/api.md):
 *   POST /api/auth/login   {login, password}
 *   POST /api/auth/setup   {token, password}     the token comes from the address: /set-password#t=<token>
 *   POST /api/auth/logout  {}
 *   GET, PUT /api/founder/money and /api/founder/money/cash      (the /data page)
 */
(function () {
  'use strict';

  const page = document.body.getAttribute('data-page');
  const stand = document.documentElement.getAttribute('data-stand') || '';
  const $ = (id) => document.getElementById(id);

  // ---- words ----
  const NO_LINK = 'Нет связи с сервером. Проверьте интернет и повторите.';
  const WORDS = {
    missing_credentials: 'Введите логин и пароль.',
    invalid_credentials: 'Логин и пароль не подходят.',
    invalid_link: 'Эта ссылка больше не работает: она одноразовая и действует 48 часов. Попросите новую.',
    weak_password: 'Такой пароль не подойдёт. Нужно от 12 знаков, без вашего логина, имени и слов вроде password или money.',
    busy: 'Сервер занят. Повторите через несколько секунд.',
    too_many_connections: 'Слишком много запросов сразу. Повторите через несколько секунд.',
    auth_damaged: 'Вход сейчас не работает: сервер не может прочитать учётные записи. Это чинят на сервере.',
    storage_failed: 'Серверу не хватило места на диске, или диск отказал. Ничего не изменилось.',
    storage_damaged: 'Документ на сервере повреждён: сервер его не отдаёт и не перезаписывает. Его восстанавливают из копии на сервере.',
    storage_busy: 'Документ сейчас сохраняет кто-то другой. Повторите через несколько секунд.',
    bad_origin: 'Сервер отклонил запрос: страница открыта не по адресу Money.',
    bad_money_doc: 'Сервер не принял файл: в нём не тот документ.',
    money_stale: 'Пока вы выбирали файл, документ на сервере изменился. Выберите файл ещё раз.',
    body_too_large: 'Файл больше, чем принимает сервер.',
    unauthenticated: 'Вход закончился. Войдите заново и повторите.',
  };

  function wait(seconds) {
    return seconds < 90 ? seconds + ' с' : Math.ceil(seconds / 60) + ' мин';
  }

  // What to tell a person about an answer that is not the one hoped for.
  function words(answer) {
    if (!answer.status) return NO_LINK;
    const code = answer.data && typeof answer.data.error === 'string' ? answer.data.error : '';
    if (code === 'too_many_attempts') {
      const seconds = Math.max(1, Number(answer.data.retryAfter) || 60);
      return 'Слишком много попыток. Повторите через ' + wait(seconds) + '.';
    }
    return WORDS[code] || 'Сервер ответил ошибкой ' + answer.status + '. Повторите позже.';
  }

  function say(element, text) {
    if (!element) return;
    element.textContent = text || '';
    element.hidden = !text;
  }

  // ---- the doors ----
  async function call(method, path, payload) {
    const init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (payload !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }
    let response;
    try {
      response = await fetch(path, init);
    } catch (e) {
      return { status: 0, data: null, text: '' };
    }
    let text = '';
    let data = null;
    try {
      text = await response.text();
      data = JSON.parse(text);
    } catch (e) { /* not JSON: the status says enough */ }
    return { status: response.status, data: data, text: text };
  }

  async function signOut(event) {
    const button = event.currentTarget;
    button.disabled = true;
    const answer = await call('POST', '/api/auth/logout', {});
    if (answer.status === 200) {
      location.replace('/login');
      return;
    }
    button.disabled = false;
    say($('logout-error'), words(answer));
  }

  // ---- /login ----
  function loginPage() {
    const out = $('logout');
    if (out) out.addEventListener('click', signOut);
    const form = $('login-form');
    if (!form) return;
    const error = $('login-error');
    const button = $('login-submit');
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      say(error, '');
      const login = $('login').value.trim();
      const password = $('password').value;
      if (!login || !password) {
        say(error, WORDS.missing_credentials);
        return;
      }
      button.disabled = true;
      const answer = await call('POST', '/api/auth/login', { login: login, password: password });
      if (answer.status === 200) {
        // Back to the page, on the tab the address asked for (#cash and the like).
        location.replace('/' + location.hash);
        return;
      }
      button.disabled = false;
      say(error, words(answer));
      $('password').focus();
      $('password').select();
    });
  }

  // ---- /set-password ----
  function setPasswordPage() {
    const found = /^#t=([A-Za-z0-9_-]{20,128})$/.exec(location.hash);
    const token = found ? found[1] : '';
    // The token leaves the address bar at once: it must not stay in the history, and
    // nobody should copy it together with the address.
    if (location.hash) {
      try {
        history.replaceState(null, '', location.pathname);
      } catch (e) {
        location.hash = '';
      }
    }
    const form = $('setup-form');
    const error = $('setup-error');
    const button = $('setup-submit');
    if (!token) {
      form.hidden = true;
      $('setup-missing').hidden = false;
      return;
    }
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      say(error, '');
      const first = $('new-password').value;
      const second = $('new-password-again').value;
      if (first !== second) {
        say(error, 'Пароли не совпадают. Введите один и тот же пароль в оба поля.');
        return;
      }
      if (first.length < 12) {
        say(error, WORDS.weak_password);
        return;
      }
      button.disabled = true;
      const answer = await call('POST', '/api/auth/setup', { token: token, password: first });
      if (answer.status === 200) {
        location.replace('/');
        return;
      }
      button.disabled = false;
      say(error, words(answer));
      if (answer.status === 404) form.hidden = true;   // the link is spent: there is nothing left to fill in
    });
  }

  // ---- /data ----
  const DOCS = {
    ledger: { path: '/api/founder/money', need: 'tx', lists: ['tx'], limit: 16 * 1024 * 1024,
              what: 'выписки', whose: 'выписок', other: 'plan' },
    plan: { path: '/api/founder/money/cash', need: 'banks', lists: ['banks', 'inflows', 'team', 'taxes', 'other'],
            limit: 4 * 1024 * 1024, what: 'план кассы', whose: 'плана кассы', other: 'ledger' },
  };

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const rowsOf = (kind, doc) => DOCS[kind].lists.reduce((sum, list) => sum + (Array.isArray(doc[list]) ? doc[list].length : 0), 0);

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100;
    const k = a % 10;
    return a > 10 && a < 20 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many;
  }
  const rowsWord = (n) => n.toLocaleString('ru-RU') + ' ' + plural(n, 'строка', 'строки', 'строк');

  function sizeWord(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' КБ';
    return (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';
  }

  function whenWord(iso) {
    const moment = new Date(iso);
    if (!iso || isNaN(moment)) return '';
    return moment.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // What the server holds, read through the same door the page uses.
  async function serverState(kind) {
    const answer = await call('GET', DOCS[kind].path);
    if (answer.status !== 200 || !isObject(answer.data) || !isObject(answer.data.doc)) {
      return { ok: false, answer: answer };
    }
    return { ok: true, rev: Number(answer.data.rev) || 0, rows: rowsOf(kind, answer.data.doc),
             updatedAt: answer.data.updatedAt || '', bytes: new Blob([answer.text]).size };
  }

  function stateWord(state) {
    if (!state.ok) return words(state.answer);
    if (!state.rev) return 'На сервере пусто: документ ещё ни разу не сохраняли.';
    return 'На сервере: ревизия ' + state.rev + ' · ' + rowsWord(state.rows) + ' · ' + sizeWord(state.bytes) +
      (state.updatedAt ? ' · сохранено ' + whenWord(state.updatedAt) : '');
  }

  async function showState(kind) {
    const line = document.querySelector('[data-status="' + kind + '"]');
    const state = await serverState(kind);
    if (line) line.textContent = stateWord(state);
    const link = document.querySelector('[data-download="' + kind + '"]');
    if (link && state.ok) {
      // The file says where it came from: the stand, the document, its revision and the day.
      const day = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', 'money-' + (stand || 'stand') + '-' + kind + '-rev' + state.rev + '-' + day + '.json');
    }
    return state;
  }

  // A file is either a bare document or an answer saved from the server: {rev, doc, updatedAt}.
  // The document's text is taken out as it stands wherever that is possible, so that what
  // goes back to the server is what came from it, character for character.
  function readFile(text) {
    const file = { doc: null, text: '', rev: null, updatedAt: '' };
    const head = /^\s*\{"rev":(\d+),"doc":/.exec(text.slice(0, 64));
    const cut = text.length > 96 ? text.length - 96 : 0;
    const tail = /,"updatedAt":(?:"([^"\\]*)"|null)\}\s*$/.exec(text.slice(cut));
    if (head && tail && cut + tail.index >= head[0].length) {
      const inner = text.slice(head[0].length, cut + tail.index);
      try {
        file.doc = JSON.parse(inner);
        file.text = inner;
        file.rev = Number(head[1]);
        file.updatedAt = tail[1] || '';
        return file;
      } catch (e) { /* not the server's own layout after all: read it the plain way */ }
    }
    const whole = JSON.parse(text);
    if (isObject(whole) && 'doc' in whole && 'rev' in whole && !('tx' in whole) && !('banks' in whole)) {
      file.doc = typeof whole.doc === 'string' ? JSON.parse(whole.doc) : whole.doc;
      file.text = typeof whole.doc === 'string' ? whole.doc : JSON.stringify(whole.doc);
      file.rev = typeof whole.rev === 'number' ? whole.rev : null;
      file.updatedAt = typeof whole.updatedAt === 'string' ? whole.updatedAt : '';
    } else {
      file.doc = whole;
      file.text = text.trim();
    }
    return file;
  }

  function dataPage() {
    const out = $('logout');
    if (out) out.addEventListener('click', signOut);
    journal();
    Object.keys(DOCS).forEach(showState);

    const error = $('data-error');
    const done = $('data-done');
    const panel = $('confirm');
    if (!panel) return;         // the test stand: nothing is uploaded here
    let pending = null;

    function reset() {
      pending = null;
      panel.hidden = true;
      document.querySelectorAll('input[data-upload]').forEach((input) => { input.value = ''; });
    }

    document.querySelectorAll('input[data-upload]').forEach(function (input) {
      input.addEventListener('change', async function () {
        const kind = input.getAttribute('data-upload');
        const chosen = input.files && input.files[0];
        say(error, '');
        say(done, '');
        panel.hidden = true;
        pending = null;
        if (!chosen) return;
        const spec = DOCS[kind];
        if (chosen.size > spec.limit) {
          say(error, 'Файл больше ' + sizeWord(spec.limit) + ': столько сервер для ' + spec.whose + ' не принимает.');
          return;
        }
        let file;
        try {
          file = readFile(await chosen.text());
        } catch (e) {
          say(error, 'Файл не читается как JSON. Нужен файл, скачанный с этой страницы или из Money.');
          return;
        }
        if (!isObject(file.doc) || !Array.isArray(file.doc[spec.need])) {
          const other = DOCS[spec.other];
          say(error, isObject(file.doc) && Array.isArray(file.doc[other.need])
            ? 'В этом файле ' + other.what + ', а не ' + spec.what + '. Загрузите его в соседнем блоке.'
            : 'В файле нет ' + spec.whose + ': в нём нет списка «' + spec.need + '».');
          return;
        }
        const state = await showState(kind);
        if (!state.ok) {
          say(error, words(state.answer));
          return;
        }
        pending = { kind: kind, text: file.text, base: state.rev };
        $('confirm-title').textContent = 'Заменить ' + spec.what + ' на сервере?';
        $('confirm-file').textContent = 'В файле «' + chosen.name + '»: ' + rowsWord(rowsOf(kind, file.doc)) +
          ' · ' + sizeWord(chosen.size) +
          (file.rev !== null ? ' · скачан с ревизии ' + file.rev : '') +
          (file.updatedAt ? ' · сохранён ' + whenWord(file.updatedAt) : '');
        $('confirm-server').textContent = stateWord(state);
        panel.hidden = false;
        $('confirm-yes').focus();
      });
    });

    $('confirm-no').addEventListener('click', reset);
    $('confirm-yes').addEventListener('click', async function () {
      if (!pending) return;
      const job = pending;
      const button = $('confirm-yes');
      button.disabled = true;
      say(error, '');
      // The same body the page sends: the revision this copy replaces, and the document as a string.
      const answer = await call('PUT', DOCS[job.kind].path, JSON.stringify({ base: job.base, doc: job.text }));
      button.disabled = false;
      if (answer.status === 200 && answer.data && answer.data.rev) {
        reset();
        say(done, 'Готово: на сервере теперь ' + DOCS[job.kind].what + ' из файла, ревизия ' + answer.data.rev + '. Открытые вкладки Money обновите.');
        showState(job.kind);
        return;
      }
      if (answer.status === 409) {
        reset();
        showState(job.kind);
      }
      say(error, words(answer));
    });
  }

  // ---- the security log on /data ----
  const EVENTS = {
    'boot': 'Сервис запущен',
    'sign-in': 'Вход',
    'sign-in-failed': 'Неудачная попытка входа',
    'sign-in-blocked': 'Вход остановлен: слишком много попыток',
    'login-flood': 'Попыток слишком много: остальные за этот час не записаны',
    'sign-out': 'Выход',
    'link-issued': 'Выдана одноразовая ссылка',
    'link-used': 'Одноразовая ссылка использована',
    'link-refused': 'Попытка с неработающей ссылкой',
    'link-blocked': 'Установка пароля остановлена: слишком много попыток',
    'password-set': 'Задан новый пароль, прежние входы закрыты',
    'session-created': 'Вход создан с сервера',
    'sessions-closed': 'Входы закрыты с сервера',
    'user-disabled': 'Логин отключён',
    'user-enabled': 'Логин включён',
    'sessions-damaged': 'Файл входов повреждён: все входят заново',
    'seed': 'Документ записан командой seed',
    'doc-shrunk': 'Сохранение убрало больше половины строк; прежняя версия отложена в копию',
    'restore': 'Документ восстановлен из копии',
    'snapshots-purged': 'Старые копии удалены',
  };
  const ALARMS = ['sign-in-failed', 'sign-in-blocked', 'login-flood', 'link-refused', 'link-blocked', 'sessions-damaged', 'doc-shrunk'];
  const FIELDS = {
    doc: 'документ', rev: 'ревизия', fromRev: 'из ревизии', rows: 'строк', fromRows: 'было строк',
    snapshot: 'копия', kept: 'прежнее отложено в', count: 'сколько', days: 'старше, дней', n: 'попытка',
    retryAfter: 'ждать, с', reason: 'из-за', expires: 'до', purpose: 'зачем', stand: 'стенд',
    version: 'версия', csp: 'политика', detail: 'что', by: 'кем',
  };
  const VALUES = { ledger: 'выписки', plan: 'план кассы', address: 'адреса', login: 'логина', setup: 'адреса', ctl: 'с сервера', all: 'все' };

  function journal() {
    const table = $('journal');
    if (!table) return;
    let entries = [];
    try {
      entries = JSON.parse(table.getAttribute('data-entries') || '[]');
    } catch (e) { /* an unreadable log is shown as an empty one */ }
    table.removeAttribute('data-entries');
    const body = table.querySelector('tbody');
    const cell = (row, text, title) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (title) td.title = title;
      row.appendChild(td);
    };
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      if (!isObject(entry)) return;
      const row = document.createElement('tr');
      if (ALARMS.indexOf(entry.event) >= 0) row.className = 'alarm';
      const moment = new Date(entry.t);
      cell(row, isNaN(moment) ? String(entry.t || '') : moment.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }), String(entry.t || ''));
      cell(row, EVENTS[entry.event] || String(entry.event || ''));
      cell(row, typeof entry.login !== 'string' ? '' : entry.login === 'all' ? VALUES.all : entry.login);
      cell(row, typeof entry.addr === 'string' ? entry.addr : entry.by === 'ctl' ? VALUES.ctl : '');
      const details = [];
      Object.keys(entry).forEach(function (name) {
        if (name === 't' || name === 'event' || name === 'login' || name === 'addr') return;
        if (name === 'by' && entry.by === 'ctl') return;
        const value = entry[name];
        if (value === null || value === undefined || value === '') return;
        const shown = typeof value === 'string' && Object.prototype.hasOwnProperty.call(VALUES, value) ? VALUES[value] : String(value);
        details.push((FIELDS[name] || name) + ': ' + shown);
      });
      cell(row, details.join(' · '));
      body.appendChild(row);
    });
    if (!body.children.length) {
      table.parentNode.hidden = true;
      $('journal-empty').hidden = false;
    }
  }

  if (page === 'login') loginPage();
  else if (page === 'set-password') setPasswordPage();
  else if (page === 'data') dataPage();
})();
