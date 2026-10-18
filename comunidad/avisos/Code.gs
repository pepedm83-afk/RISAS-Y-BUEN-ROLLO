// Run and authorize this project ONLY as peperisasybuenrollo@gmail.com.
// MailApp sends mail; this project does not request access to the Gmail inbox.
const NOTICE_SENDER = 'peperisasybuenrollo@gmail.com';
const EXCLUDED_MAILBOX = 'pepedm83@gmail.com';
const COMMUNITY_URL = 'https://pepedm83-afk.github.io/RISAS-Y-BUEN-ROLLO/comunidad/';
const PROJECT_ID = 'risas-y-buen-rollo';

function canonicalEmail_(email) {
  let value = String(email || '').trim().toLowerCase();
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || /[\s,;\r\n]/.test(value)) return '';
  if (parts[1] === 'gmail.com' || parts[1] === 'googlemail.com') {
    value = parts[0].split('+')[0].replace(/\./g, '') + '@gmail.com';
  }
  return value;
}

function senderGuard_() {
  if (canonicalEmail_(Session.getEffectiveUser().getEmail()) !== NOTICE_SENDER) {
    throw new Error('Este servicio solo puede funcionar desde ' + NOTICE_SENDER + '.');
  }
}

function requestJson_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions: true}, options));
  const code = response.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) {
    let reason = '';
    try { reason = JSON.parse(response.getContentText()).error.message.match(/^[A-Z][A-Z0-9_]{2,60}\b/)?.[0] || ''; } catch (_) {}
    throw new Error('El servicio no pudo completar la operación (HTTP ' + code + (reason ? ', ' + reason : '') + ').');
  }
  const text = response.getContentText();
  return text ? JSON.parse(text) : {};
}

function firebaseToken_() {
  senderGuard_();
  const config = requestJson_(COMMUNITY_URL + 'config.json', {});
  if (config.projectId !== PROJECT_ID) throw new Error('El proyecto de Firebase no coincide.');
  const result = requestJson_('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=' + encodeURIComponent(config.apiKey), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({postBody: 'access_token=' + encodeURIComponent(ScriptApp.getOAuthToken()) + '&providerId=google.com', requestUri: COMMUNITY_URL, returnSecureToken: true})
  });
  if (!result.idToken || canonicalEmail_(result.email) !== NOTICE_SENDER) throw new Error('No se pudo verificar la cuenta de avisos.');
  return result.idToken;
}

function firestore_(path, token, options) {
  return requestJson_('https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents' + path, Object.assign({headers: {Authorization: 'Bearer ' + token}}, options || {}));
}

function decodeValue_(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue_);
  if (v.mapValue) return decodeFields_(v.mapValue.fields);
  return null;
}
function decodeFields_(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue_(value)]));
}
function encodeValue_(v) {
  if (v instanceof Date) return {timestampValue: v.toISOString()};
  if (Array.isArray(v)) return {arrayValue: {values: v.map(encodeValue_)}};
  if (typeof v === 'boolean') return {booleanValue: v};
  return {stringValue: String(v)};
}
function updateQueue_(id, values, token) {
  const mask = Object.keys(values).map(key => 'updateMask.fieldPaths=' + encodeURIComponent(key)).join('&');
  return firestore_('/notificationQueue/' + encodeURIComponent(id) + '?' + mask, token, {
    method: 'patch', contentType: 'application/json',
    payload: JSON.stringify({fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, encodeValue_(value)]))})
  });
}
function listDocuments_(collectionName, token) {
  const rows = []; let next = '';
  do {
    const page = firestore_('/' + collectionName + '?pageSize=100' + (next ? '&pageToken=' + encodeURIComponent(next) : ''), token);
    for (const d of page.documents || []) rows.push(Object.assign({id: d.name.split('/').pop()}, decodeFields_(d.fields)));
    next = page.nextPageToken || '';
  } while (next);
  return rows;
}
function pendingRequests_(token) {
  const result = firestore_(':runQuery', token, {method: 'post', contentType: 'application/json', payload: JSON.stringify({structuredQuery: {
    from: [{collectionId: 'notificationQueue'}],
    where: {fieldFilter: {field: {fieldPath: 'status'}, op: 'IN', value: {arrayValue: {values: ['pending', 'waitingContacts'].map(s => ({stringValue: s}))}}}},
    limit: 30
  }})});
  return result.filter(row => row.document).map(row => Object.assign({id: row.document.name.split('/').pop()}, decodeFields_(row.document.fields)));
}

function resolveRecipients_(grants, groupId, contacts, blockedIds, includeGroupAdmins = true) {
  const recipients = new Map([[NOTICE_SENDER, NOTICE_SENDER]]), missing = [];
  for (const grant of grants) {
    if (blockedIds.has(grant.id) || !(grant.role === 'community' || (includeGroupAdmins && (grant.groups || []).includes(groupId)))) continue;
    const raw = contacts[grant.id], key = canonicalEmail_(raw);
    if (!key) { missing.push(grant.id); continue; }
    if (key === EXCLUDED_MAILBOX) continue;
    if (!recipients.has(key)) recipients.set(key, raw.trim());
  }
  return {recipients: Array.from(recipients, ([key, email]) => ({key, email})), missing};
}

function mailText_(event, group, creatorName) {
  let date = 'Fecha por revisar';
  if (!isNaN(new Date(event.start).getTime())) date = new Date(event.start).toLocaleString('es-ES', {timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short'});
  return 'Se ha creado una nueva quedada.\n\n' + 'Organiza: ' + creatorName + '\nGrupo: ' + group.name + '\nTítulo: ' + event.title + '\nFecha: ' + date + '\nLugar: ' + event.location + '\n\n' + (event.description || '') + '\n\nRevisar la quedada:\n' + COMMUNITY_URL;
}

function deliveryKey_(eventId, email) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, eventId + '|' + email, Utilities.Charset.UTF_8);
  return 'delivery-' + bytes.map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function processRequest_(queue, grants, token, subscriptions) {
  const eventDoc = firestore_('/events/' + encodeURIComponent(queue.eventId), token);
  const event = eventDoc && decodeFields_(eventDoc.fields);
  const groupDoc = event && firestore_('/groups/' + encodeURIComponent(event.group), token);
  const group = groupDoc && decodeFields_(groupDoc.fields);
  if (!event || event.cancelled || event.createdBy !== queue.createdBy || !group || !String(group.name || '').trim()) {
    updateQueue_(queue.id, {status: 'skipped', completedAt: new Date()}, token); return;
  }
  const contacts = {}, blocked = new Set();
  for (const grant of grants.filter(g => g.role === 'community' || (g.groups || []).includes(event.group))) {
    const member = firestore_('/members/' + encodeURIComponent(grant.id), token);
    if (member && decodeFields_(member.fields).blocked) { blocked.add(grant.id); continue; }
    const contact = firestore_('/notificationContacts/' + encodeURIComponent(grant.id), token);
    if (contact) contacts[grant.id] = decodeFields_(contact.fields).email;
  }
  // Community admins and the dedicated owner mailbox are always notified.
  // Group admins additionally receive events created by ordinary participants.
  const adminCreated = queue.creatorIsAdmin === true || grants.some(g => g.id === event.createdBy && (g.role === 'community' || (g.groups || []).length > 0));
  const routing = resolveRecipients_(grants, event.group, contacts, blocked, !adminCreated);
  // User notices now use push. Email is reserved for administrative routing.
  const delivered = new Set(queue.deliveredTo || []), props = PropertiesService.getScriptProperties();
  for (const recipient of routing.recipients) {
    if (delivered.has(recipient.key)) continue;
    const key = deliveryKey_(queue.eventId, recipient.key), previous = props.getProperty(key);
    if (previous === 'sending') {
      updateQueue_(queue.id, {status: 'needsReview', lastError: 'Un envío quedó sin confirmación. Revisar antes de repetirlo.', lastAttemptAt: new Date()}, token); return;
    }
    if (previous !== 'sent') {
      if (MailApp.getRemainingDailyQuota() < 1) {
        updateQueue_(queue.id, {status: 'pending', lastError: 'Cuota diaria alcanzada; se reanudará automáticamente.', lastAttemptAt: new Date()}, token); return;
      }
      props.setProperty(key, 'sending');
      try {
        MailApp.sendEmail({to: recipient.email, subject: 'Nueva quedada · ' + String(event.title).replace(/[\r\n]/g, ' ').slice(0, 150), body: mailText_(event, group, queue.creatorName), name: 'Risas y Buen Rollo', replyTo: NOTICE_SENDER});
        props.setProperty(key, 'sent');
      } catch (error) {
        updateQueue_(queue.id, {status: 'needsReview', lastError: 'El servicio no confirmó el envío. Revisar antes de repetirlo.', lastAttemptAt: new Date()}, token); return;
      }
    }
    delivered.add(recipient.key);
    updateQueue_(queue.id, {status: 'pending', deliveredTo: Array.from(delivered), lastAttemptAt: new Date()}, token);
    props.deleteProperty(key);
  }
  updateQueue_(queue.id, {status: routing.missing.length ? 'waitingContacts' : 'sent', deliveredTo: Array.from(delivered), lastError: routing.missing.length ? 'Falta el correo de ' + routing.missing.length + ' administrador(es).' : '', lastAttemptAt: new Date(), completedAt: new Date()}, token);
}

function procesarAvisos() {
  senderGuard_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const token = firebaseToken_(), pending = pendingRequests_(token);
    if (!pending.length) return;
    const grants = listDocuments_('grants', token);
    for (const queue of pending) processRequest_(queue, grants, token);
  } finally { lock.releaseLock(); }
}

function activarAvisos() {
  senderGuard_();
  const token = firebaseToken_();
  pendingRequests_(token); // Validate account and private access before scheduling.
  for (const trigger of ScriptApp.getProjectTriggers()) if (trigger.getHandlerFunction() === 'procesarAvisos') ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('procesarAvisos').timeBased().everyMinutes(5).create();
  console.log('Avisos activados para ' + NOTICE_SENDER + '.');
}

function comprobarConfiguracion() {
  senderGuard_();
  const token = firebaseToken_();
  const grants = listDocuments_('grants', token);
  let found = 0;
  for (const grant of grants) if (firestore_('/notificationContacts/' + encodeURIComponent(grant.id), token)) found++;
  console.log('Cuenta correcta. Administradores: ' + grants.length + '. Correos disponibles: ' + found + '. Cuota diaria restante: ' + MailApp.getRemainingDailyQuota() + '.');
}

function probarEnvio() {
  senderGuard_();
  MailApp.sendEmail({to: NOTICE_SENDER, subject: 'Prueba de avisos · Risas y Buen Rollo', body: 'Esta es una prueba del servicio de avisos. El envío se realiza desde el correo dedicado de la comunidad. No se ha enviado esta prueba a ningún administrador ni usuario.', name: 'Risas y Buen Rollo', replyTo: NOTICE_SENDER});
  console.log('Correo de prueba enviado exclusivamente al buzón de avisos.');
}
