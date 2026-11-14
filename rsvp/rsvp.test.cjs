const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const serverSource = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const clientSource = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8');
const headers = ['Updated (Sydney)', 'Reply ID', 'Your name', 'Your events', 'Your meal', 'Your notes', 'Plus-one', 'Guest name', 'Guest events', 'Guest meal', 'Guest notes', 'Ceremony guests', 'Reception guests', 'Standard meals', 'Vegetarian meals', 'First received'];
function server(options = {}) {
  const rows = [headers];
  let releases = 0;
  const sheet = {
    getLastRow: () => rows.length, getMaxRows: () => 1000,
    getRange(row, col) {
      return {
        getValues: () => [rows[row - 1]], getValue: () => rows[row - 1][col - 1],
        setValues(values) { if (options.failWrite) throw Error('storage unavailable'); rows[row - 1] = values[0]; },
        createTextFinder(id) { return { matchEntireCell() { return this; }, findNext() { const i = rows.findIndex(r => r[1] === id); return i > 0 ? { getRow: () => i + 1 } : null; } }; }
      };
    }
  };
  const context = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => !options.busy, releaseLock() { releases++; } }) },
    Utilities: { formatDate: () => '2026-11-14 12:00:00' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
    console: { error() {}, log() {} }
  };
  vm.createContext(context); vm.runInContext(serverSource, context);
  return { rows, validate: context.validateReply_, save: context.saveReply_, post: p => context.doPost({ parameter: p }), get: context.doGet, releases: () => releases };
}
const fixture = overrides => ({ replyId: 'a'.repeat(32), names: 'Sam Lee', events: 'both', plusOne: 'Yes', guestName: 'Alex Lee', guestEvents: 'both', dietary: 'None', guestDietary: 'Vegetarian', ...overrides });

test('attendance and meals: all primary / plus-one / guest-event / meal combinations', () => {
  const s = server();
  for (const events of ['both', 'ceremony', 'reception', 'none'])
    for (const plusOne of ['Yes', 'No'])
      for (const guestEvents of ['both', 'ceremony', 'reception'])
        for (const dietary of ['None', 'Vegetarian'])
          for (const guestDietary of ['None', 'Vegetarian']) {
            const r = s.validate(fixture({ events, plusOne, guestEvents, dietary, guestDietary, receptionCount: '999' }));
            const active = events !== 'none' && plusOne === 'Yes';
            const attends = (e, part) => e === 'both' || e === part;
            assert.equal(r.ceremonyCount, Number(attends(events, 'ceremony')) + Number(active && attends(guestEvents, 'ceremony')));
            assert.equal(r.receptionCount, Number(attends(events, 'reception')) + Number(active && attends(guestEvents, 'reception')));
            assert.equal(r.standardMeals + r.vegetarianMeals, r.receptionCount);
            if (!active) { assert.equal(r.guestName, ''); assert.equal(r.guestMeal, ''); }
          }
});

test('missing names, invalid choices, oversized notes and bot fields are rejected', () => {
  const s = server();
  for (const bad of [{ names: ' ' }, { events: 'unknown' }, { plusOne: '' }, { guestName: '' }, { guestEvents: 'none' }, { dietary: 'Vegan' }, { guestDietary: 'Gluten free' }, { notes: 'x'.repeat(1501) }, { replyId: '=formula' }, { website: 'spam' }]) {
    assert.equal(s.post(fixture(bad)).ok, false);
  }
  assert.equal(s.rows.length, 1);
});

test('retry updates a saved row; removing a plus-one or declining removes their counts', () => {
  const s = server();
  assert.equal(s.post(fixture()).ok, true);
  assert.equal(s.rows.length, 2);
  assert.equal(s.post(fixture()).updated, true);
  assert.equal(s.rows.length, 2);
  s.post(fixture({ plusOne: 'No' }));
  assert.equal(s.rows[1][12], 1); assert.equal(s.rows[1][7], '');
  s.post(fixture({ events: 'none' }));
  assert.equal(s.rows[1][12], 0); assert.equal(s.rows[1][13], 0); assert.equal(s.rows[1][14], 0);
  assert.equal(s.releases(), 4);
});

test('guest text cannot become a formula; public GET never exposes replies', () => {
  const s = server();
  s.post(fixture({ names: '=IMPORTXML("url")', guestNotes: '@danger' }));
  assert(s.rows[1][2].startsWith("'=")); assert.equal(s.rows[1][10], "'@danger");
  assert.deepEqual(Object.keys(s.get()).sort(), ['ready', 'service']);
});

test('write errors and busy locks cannot produce a success receipt', () => {
  const write = server({ failWrite: true });
  assert.equal(write.post(fixture()).ok, false); assert.equal(write.releases(), 1);
  const busy = server({ busy: true });
  assert.equal(busy.post(fixture()).ok, false); assert.equal(busy.rows.length, 1);
});

function client(fetch) {
  const memory = new Map();
  const window = { crypto: webcrypto, fetch, sessionStorage: { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) } };
  const context = { window, URLSearchParams, Uint8Array, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(clientSource, context);
  return { api: window.RSVPClient, memory };
}
const url = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
test('client preserves the reply reference after an unconfirmed save and checks the receipt', async () => {
  const ids = []; let attempts = 0;
  const c = client(async (_, options) => {
    const id = options.body.get('replyId'); ids.push(id);
    assert.equal(options.mode, undefined);
    if (++attempts === 1) throw new TypeError('Network failure after save');
    return { ok: true, json: async () => ({ ok: true, replyId: id }) };
  });
  await assert.rejects(c.api.submit(url, new URLSearchParams()), /Network failure/);
  assert.equal(c.memory.size, 1);
  await c.api.submit(url, new URLSearchParams());
  assert.equal(ids[0], ids[1]); assert.equal(c.memory.size, 0);
});

test('client rejects HTTP errors, invalid JSON, rejected and mismatched receipts', async () => {
  for (const result of [{ ok: false }, { ok: true, json: async () => { throw Error('Invalid JSON'); } }, { ok: true, json: async () => ({ ok: false, error: 'Save failed' }) }, { ok: true, json: async () => ({ ok: true, replyId: 'wrong' }) }]) {
    const c = client(async () => result);
    await assert.rejects(c.api.submit(url, new URLSearchParams()));
    assert.equal(c.memory.size, 1);
  }
  await assert.rejects(client(() => {}).api.submit('https://example.com', new URLSearchParams()), /not configured/);
});

test('invitation scripts parse and use the confirmed submission path', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert(html.includes('RSVPClient.submit(RSVP.sheetUrl, data)'));
  assert(!html.includes("mode: 'no-cors'"));
});
