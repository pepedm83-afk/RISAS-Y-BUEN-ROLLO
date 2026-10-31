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
  if (typeof v === 'number') return Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v};
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
    const token = firebaseToken_();
    try { procesarResumenesAsistencia_(token); } catch (error) { console.warn('Recuentos pendientes: ' + error.message); }
    try { prepararValoraciones_(token); } catch (error) { console.warn('No se pudieron preparar las valoraciones: ' + error.message); }
    const pending = pendingRequests_(token);
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

// Derive feedback permissions using the exact same ordered allocation as the agenda.
// Replay an append-only, transaction-ordered history. Existing places are never taken by a later change.
function allocateFeedbackSeats_(rows,changes,currentCapacity=0){
 const ops=[...changes].sort((a,b)=>a.seq-b.seq),initial=new Map(),seen=new Set();
 for(const op of ops)if(op.kind!=='capacity'&&!seen.has(op.uid)){seen.add(op.uid);if(op.legacyPeople>0)initial.set(op.uid,op.legacyPeople);}
 for(const row of rows)if(!row.joinedOrder&&!seen.has(row.uid))initial.set(row.uid,1+row.companions);
 let capacity=ops[0]?.limitBefore??currentCapacity,admission=0,movement=null;const parties=new Map();
 for(const [uid,people] of [...initial].sort(([a],[b])=>a.localeCompare(b)))parties.set(uid,{uid,requested:people,confirmed:people,admitted:++admission,waitOrder:0,joinedOrder:0,legacy:true});
 function promote(){let available=capacity?Math.max(0,capacity-[...parties.values()].reduce((n,p)=>n+p.confirmed,0)):Infinity;
  const queue=[...parties.values()].filter(p=>p.requested>p.confirmed).sort((a,b)=>a.waitOrder-b.waitOrder||a.uid.localeCompare(b.uid));
  for(const p of queue){const needed=p.requested-p.confirmed;if(needed<=available){if(!p.confirmed)p.admitted=++admission;p.admittedAt=(typeof movement?.createdAt?.toMillis==='function'?movement.createdAt.toMillis():Date.parse(movement?.createdAt))||0;p.admissionRevision=movement?.seq||0;if(p.waitOrder<(movement?.seq||0)){p.promotionRevision=movement.seq;p.promotionAdded=needed;}p.confirmed=p.requested;p.waitOrder=0;available-=needed;}}
 }
 for(const op of ops){
  movement=op;
  if(op.kind==='capacity')capacity=op.limitAfter;
  else if(op.kind==='leave')parties.delete(op.uid);
  else if(op.kind==='join')parties.set(op.uid,{uid:op.uid,requested:op.people,confirmed:0,admitted:0,waitOrder:op.seq,joinedOrder:op.seq,legacy:false});
  else if(op.kind==='change'){
   const p=parties.get(op.uid);if(!p)throw Error('Falta un movimiento anterior de la lista. Actualiza los eventos.');
   if(op.people>p.requested)p.waitOrder=op.seq;
   p.requested=op.people;p.confirmed=Math.min(p.confirmed,op.people);
   if(p.requested===p.confirmed)p.waitOrder=0;
  }
  promote();
 }
 const confirmed=[...parties.values()].filter(p=>p.confirmed>0).sort((a,b)=>a.admitted-b.admitted||a.uid.localeCompare(b.uid));
 const waiting=[...parties.values()].filter(p=>p.requested>p.confirmed).sort((a,b)=>a.waitOrder-b.waitOrder||a.uid.localeCompare(b.uid));
 return {parties,confirmed,waiting,capacity,used:confirmed.reduce((n,p)=>n+p.confirmed,0),waitingPeople:waiting.reduce((n,p)=>n+p.requested-p.confirmed,0),hasLegacy:confirmed.some(p=>p.legacy)};
}

function finalSinHora_(start) {
  const day=Utilities.formatDate(new Date(start),'Europe/Madrid','yyyy-MM-dd');
  const next=new Date(day+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const offset=Utilities.formatDate(next,'Europe/Madrid','Z'),minutes=(Number(offset.slice(1,3))*60+Number(offset.slice(3,5)))*(offset[0]==='-'?-1:1);
  return next.getTime()-minutes*60000;
}
function prepararValoraciones() { senderGuard_(); prepararValoraciones_(firebaseToken_()); }
function prepararValoraciones_(token) {
  const now = Date.now();
  const result = firestore_(':runQuery', token, {method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{
    from:[{collectionId:'events'}],where:{compositeFilter:{op:'AND',filters:[
      {fieldFilter:{field:{fieldPath:'endAt'},op:'GREATER_THAN',value:{integerValue:String(now-172800000)}}},
      {fieldFilter:{field:{fieldPath:'endAt'},op:'LESS_THAN_OR_EQUAL',value:{integerValue:String(now)}}}
    ]}},orderBy:[{field:{fieldPath:'endAt'},direction:'DESCENDING'}],limit:100
  }})});
  const recent=firestore_(':runQuery',token,{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:'events'}],where:{compositeFilter:{op:'AND',filters:[
    {fieldFilter:{field:{fieldPath:'start'},op:'GREATER_THAN',value:{stringValue:new Date(now-3*86400000).toISOString()}}},
    {fieldFilter:{field:{fieldPath:'start'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:new Date(now).toISOString()}}}
  ]}},orderBy:[{field:{fieldPath:'start'},direction:'DESCENDING'}],limit:200}})});
  const unique=new Map([...result,...recent].filter(r=>r.document).map(r=>[r.document.name,r]));
  for (const item of unique.values()) {
    const raw=item.document,e=decodeFields_(raw.fields),id=raw.name.split('/').pop();if(e.cancelled)continue;
    const path='/events/'+encodeURIComponent(id);
    if(!e.endAt){
      const end=finalSinHora_(e.start);if(!Number.isFinite(end)||end>now||end<=now-172800000)continue;
      // Fill only the missing end time; abort if somebody edited the event meanwhile.
      const precondition=raw.updateTime?'&currentDocument.updateTime='+encodeURIComponent(raw.updateTime):'';
      firestore_(path+'?updateMask.fieldPaths=endAt'+precondition,token,{method:'patch',contentType:'application/json',payload:JSON.stringify({fields:{endAt:encodeValue_(end)}})});e.endAt=end;
    }
    if(e.endAt>now||e.endAt<=now-172800000)continue;
    const state=firestore_(path+'/attendanceState/current',token),revision=state?decodeFields_(state.fields).revision:0;
    const markerKey='feedback-marker:'+id,markerCache=CacheService.getScriptCache();
    let data=null;try{data=JSON.parse(markerCache.get(markerKey)||'null');}catch(_){}
    if(!data||data.revision!==revision||data.endAt!==e.endAt){const previous=firestore_(path+'/feedbackEligibilityState/current',token);data=previous&&decodeFields_(previous.fields);if(data)markerCache.put(markerKey,JSON.stringify(data),1800);}
    if(data&&data.revision===revision&&data.endAt===e.endAt)continue;
    const rows=listDocuments_('events/'+encodeURIComponent(id)+'/attendees',token).map(r=>Object.assign({uid:r.id},r));
    const ops=listDocuments_('events/'+encodeURIComponent(id)+'/attendanceChanges',token);
    const latest=firestore_(path+'/attendanceState/current',token),after=latest?decodeFields_(latest.fields).revision:0;
    if(after!==revision||ops.length!==revision)continue;
    const seats=allocateFeedbackSeats_(rows,ops,e.capacity||0).confirmed;
    const fields=Object.fromEntries(Object.entries({admitted:true,revision:revision,endAt:e.endAt}).map(([k,v])=>[k,encodeValue_(v)]));
    const writes=seats.map(seat=>({update:{name:raw.name+'/feedbackEligibility/'+seat.uid,fields:fields}}));
    writes.push({update:{name:raw.name+'/feedbackEligibilityState/current',fields:{revision:encodeValue_(revision),endAt:encodeValue_(e.endAt)}}});
    // Commit access rows before the marker. At most 1000 confirmed attendees, 400 writes per commit.
    for(let offset=0;offset<writes.length;offset+=400)firestore_(':commit',token,{method:'post',contentType:'application/json',payload:JSON.stringify({writes:writes.slice(offset,offset+400)})});
    markerCache.put(markerKey,JSON.stringify({revision:revision,endAt:e.endAt}),1800);
  }
}

// Only queued revisions are counted. Idle events do not load any attendee documents.
function procesarResumenesAsistencia_(token) {
  const pending=firestore_(':runQuery',token,{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:'attendanceSummaryQueue'}],limit:100}})});
  for(const item of pending){
    const queue=item.document;if(!queue)continue;const id=queue.name.split('/').pop(),path='/events/'+encodeURIComponent(id);
    const raw=firestore_(path,token);if(!raw)continue;
    const e=decodeFields_(raw.fields),state=firestore_(path+'/attendanceState/current',token),revision=state?decodeFields_(state.fields).revision:0;
    const rows=listDocuments_('events/'+encodeURIComponent(id)+'/attendees',token).map(r=>Object.assign({uid:r.id},r));
    const ops=listDocuments_('events/'+encodeURIComponent(id)+'/attendanceChanges',token);
    if(ops.length!==revision)continue;
    const result=allocateFeedbackSeats_(rows,ops,e.capacity||0),root=raw.name.slice(0,raw.name.indexOf('/events/'));
    const summary={confirmed:result.used,waiting:result.waitingPeople,capacity:e.capacity||0,revision};
    const fields=Object.fromEntries(Object.entries(summary).map(([key,value])=>[key,encodeValue_(value)]));
    const writes=[{verify:raw.name,currentDocument:{updateTime:raw.updateTime}}];
    writes.push(state?{verify:state.name,currentDocument:{updateTime:state.updateTime}}:{verify:raw.name+'/attendanceState/current',currentDocument:{exists:false}});
    writes.push({update:{name:root+'/attendanceSummaries/'+id,fields},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]});
    if(typeof appendSeatNotifications_==='function')appendSeatNotifications_(writes,raw,e,rows,result,revision,token);
    writes.push({delete:queue.name,currentDocument:{updateTime:queue.updateTime}});
    try{firestore_(':commit',token,{method:'post',contentType:'application/json',payload:JSON.stringify({writes})});}catch(error){console.warn('Recuento pendiente de reintento: '+id);}
  }
}
// One-time bootstrap for existing events and inscriptions. No new timer is installed.
function inicializarResumenesAsistencia() {
  senderGuard_();const token=firebaseToken_(),now=Date.now();
  // Match the agenda's recent/future window, including events that started earlier today.
  const recent=firestore_(':runQuery',token,{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:'events'}],where:{fieldFilter:{field:{fieldPath:'start'},op:'GREATER_THAN_OR_EQUAL',value:{stringValue:new Date(now-3*86400000).toISOString()}}}}})});
  const explicitEnd=firestore_(':runQuery',token,{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:'events'}],where:{fieldFilter:{field:{fieldPath:'endAt'},op:'GREATER_THAN',value:{integerValue:String(now-172800000)}}}}})});
  const result=new Map([...recent,...explicitEnd].filter(item=>item.document).map(item=>[item.document.name,item.document]));let queued=0;
  for(const raw of result.values()){
    if(decodeFields_(raw.fields).cancelled)continue;
    const id=raw.name.split('/').pop(),root=raw.name.slice(0,raw.name.indexOf('/events/'));
    // Repair only missing summaries. Do not recalculate existing summaries every day.
    if(firestore_('/attendanceSummaries/'+encodeURIComponent(id),token))continue;
    const existing=firestore_('/attendanceSummaryQueue/'+encodeURIComponent(id),token);if(existing)continue;
    try{firestore_(':commit',token,{method:'post',contentType:'application/json',payload:JSON.stringify({writes:[{update:{name:root+'/attendanceSummaryQueue/'+id,fields:{revision:encodeValue_(0)}},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}}]})});queued++;}catch(error){console.warn('No se pudo preparar el recuento de '+id+': '+error.message);}
  }
  console.log('Recuentos pendientes preparados: '+queued);
  procesarResumenesAsistencia_(token);
}
