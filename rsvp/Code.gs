/* Paste into Extensions > Apps Script in the RSVP spreadsheet. */
const SPREADSHEET_ID = '1zjeJZ3WbYrZJaXNs7_-0CkBxA_0Y2JoMYnC67NME684';
const RESPONSE_HEADERS = ['Updated (Sydney)', 'Reply ID', 'Your name', 'Your events', 'Your meal', 'Your notes', 'Plus-one', 'Guest name', 'Guest events', 'Guest meal', 'Guest notes', 'Ceremony guests', 'Reception guests', 'Standard meals', 'Vegetarian meals', 'First received'];

function checkSetup() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Responses');
  if (!sheet || sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).getValues()[0].join('|') !== RESPONSE_HEADERS.join('|')) {
    throw new Error('The RSVP spreadsheet or Responses headers do not match.');
  }
  console.log('RSVP spreadsheet connected. Ready to deploy.');
}

function doGet() {
  // Public endpoint deliberately provides no guest data or spreadsheet link.
  return json_({ service: 'Jacob & Sejin RSVP', ready: true });
}

function doPost(e) {
  try {
    const reply = validateReply_((e && e.parameter) || {});
    const result = saveReply_(reply);
    return json_({ ok: true, replyId: reply.replyId, ceremonyCount: reply.ceremonyCount, receptionCount: reply.receptionCount, updated: result.updated });
  } catch (error) {
    const message = error && error.publicMessage;
    console.error(message || 'RSVP save failed.');
    return json_({ ok: false, error: message || 'We could not save your reply. Please try again.' });
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function invalid_(message) {
  const error = new Error(message);
  error.publicMessage = message;
  throw error;
}

function text_(value, label, max, required) {
  const text = String(value || '').trim();
  if (required && !text) invalid_('Please enter ' + label + '.');
  if (text.length > max) invalid_('Please shorten ' + label + ' to ' + max + ' characters.');
  return text;
}

function event_(value, guest) {
  const allowed = guest ? ['both', 'ceremony', 'reception'] : ['both', 'ceremony', 'reception', 'none'];
  if (allowed.indexOf(value) === -1) invalid_('Please select which events ' + (guest ? 'your guest will' : 'you will') + ' attend.');
  return value;
}

function meal_(value) {
  if (value !== 'None' && value !== 'Vegetarian') invalid_('Please choose None or Vegetarian for each reception guest.');
  return value;
}

function attends_(events, part) { return events === 'both' || events === part; }

function validateReply_(p) {
  if (String(p.website || '').trim()) invalid_('We could not accept this reply.');
  const replyId = text_(p.replyId, 'the reply reference', 80, true);
  if (!/^[a-f0-9-]{32,80}$/i.test(replyId)) invalid_('Please reload the invitation and try again.');
  const name = text_(p.names, 'your name', 120, true);
  const events = event_(p.events, false);
  if (events !== 'none' && p.plusOne !== 'Yes' && p.plusOne !== 'No') invalid_('Please tell us whether you are bringing a plus-one.');
  const plusOne = events !== 'none' && p.plusOne === 'Yes';
  const guestName = plusOne ? text_(p.guestName, 'your guest’s name', 120, true) : '';
  const guestEvents = plusOne ? event_(p.guestEvents, true) : '';
  const dinner = attends_(events, 'reception');
  const guestDinner = attends_(guestEvents, 'reception');
  const meal = dinner ? meal_(p.dietary) : '';
  const guestMeal = guestDinner ? meal_(p.guestDietary) : '';
  return {
    replyId: replyId, name: name, events: events, meal: meal,
    notes: dinner ? text_(p.notes, 'your notes', 1500, false) : '',
    plusOne: plusOne, guestName: guestName, guestEvents: guestEvents, guestMeal: guestMeal,
    guestNotes: guestDinner ? text_(p.guestNotes, 'your guest’s notes', 1500, false) : '',
    ceremonyCount: Number(attends_(events, 'ceremony')) + Number(attends_(guestEvents, 'ceremony')),
    receptionCount: Number(dinner) + Number(guestDinner),
    standardMeals: Number(meal === 'None') + Number(guestMeal === 'None'),
    vegetarianMeals: Number(meal === 'Vegetarian') + Number(guestMeal === 'Vegetarian')
  };
}

function cellText_(value) {
  // Prevent names and allergy notes from being interpreted as formulas.
  return /^[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
}

function saveReply_(reply) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) invalid_('Another reply is being saved. Please try again.');
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Responses');
    if (!sheet) throw new Error('Missing Responses tab');
    const headers = sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).getValues()[0];
    if (headers.join('|') !== RESPONSE_HEADERS.join('|')) throw new Error('Unexpected Responses columns');
    const existing = sheet.getLastRow() > 1
      ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).createTextFinder(reply.replyId).matchEntireCell(true).findNext() : null;
    const row = existing ? existing.getRow() : sheet.getLastRow() + 1;
    const now = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss');
    const created = existing ? sheet.getRange(row, 16).getValue() : now;
    const values = [now, reply.replyId, cellText_(reply.name), reply.events, reply.meal, cellText_(reply.notes), reply.plusOne ? 'Yes' : 'No', cellText_(reply.guestName), reply.guestEvents, reply.guestMeal, cellText_(reply.guestNotes), reply.ceremonyCount, reply.receptionCount, reply.standardMeals, reply.vegetarianMeals, created];
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
    return { updated: !!existing };
  } finally {
    lock.releaseLock();
  }
}
