// Uses the same dedicated account as Code.gs; no private service-account keys.
// Requires the firebase.messaging OAuth scope and permission
// cloudmessaging.messages.create on PROJECT_ID for NOTICE_SENDER.
function pushPending_(token) {
  const result = firestore_(':runQuery', token, {method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{
    from:[{collectionId:'notificationQueue'}],
    where:{fieldFilter:{field:{fieldPath:'pushStatus'},op:'EQUAL',value:{stringValue:'pending'}}},limit:30
  }})});
  return result.filter(row=>row.document).map(row=>Object.assign({id:row.document.name.split('/').pop()},decodeFields_(row.document.fields)));
}
function resolvePushRecipients_(devices,groupId,createdAt,blockedIds) {
  const unique=new Map(),at=new Date(createdAt).getTime();
  if(!Number.isFinite(at))return [];
  for(const device of devices){
    const subscribed=new Date(device.subscribedAt).getTime();
    if(!device.enabled||blockedIds.has(device.uid)||!(device.groups||[]).includes(groupId)||!Number.isFinite(subscribed)||subscribed>at||!device.token)continue;
    // Same browser token appears at most once, even if a malformed duplicate row exists.
    if(!unique.has(device.token))unique.set(device.token,device);
  }
  return Array.from(unique.values());
}
function sendPush_(device,event,group,eventId,validateOnly,notice=null) {
  const message={token:device.token,data:{
    type:'new-event',uid:device.uid,eventId,
    title:'Nueva quedada · '+String(event.title).replace(/[\r\n]/g,' ').slice(0,150),
    body:String(group.name).slice(0,80)+' · '+String(event.location||'Abre la quedada para ver los detalles.').slice(0,140)
  },webpush:{headers:{TTL:'86400',Urgency:'normal'}}};
  if(notice)Object.assign(message.data,notice);
  const response=UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/'+PROJECT_ID+'/messages:send',{
    method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:JSON.stringify({message,validate_only:validateOnly===true}),muteHttpExceptions:true
  });
  const code=response.getResponseCode();let body={};try{body=JSON.parse(response.getContentText());}catch{}
  if(code>=200&&code<300&&body.name)return 'accepted';
  const details=body.error?.details||[];
  if(details.some(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError'&&d.errorCode==='UNREGISTERED'))return 'expired';
  // Never log response bodies, device tokens, or OAuth credentials.
  throw Error('FCM no confirmó el envío (HTTP '+code+').');
}
function disableExpiredPush_(device,token){
  return firestore_('/pushDevices/'+encodeURIComponent(device.id)+'?updateMask.fieldPaths=enabled&updateMask.fieldPaths=updatedAt',token,{
    method:'patch',contentType:'application/json',payload:JSON.stringify({fields:{enabled:{booleanValue:false},updatedAt:{timestampValue:new Date().toISOString()}}})
  });
}
function processPushRequest_(queue,devices,blockedIds,token,deadline){
  const eventDoc=firestore_('/events/'+encodeURIComponent(queue.eventId),token),event=eventDoc&&decodeFields_(eventDoc.fields);
  const groupDoc=event&&firestore_('/groups/'+encodeURIComponent(event.group),token),group=groupDoc&&decodeFields_(groupDoc.fields);
  // Do not alert for cancelled, deleted, retired, past, or more than one-day-old events.
  const created=new Date(queue.createdAt).getTime(),starts=new Date(event?.start).getTime();
  if(!event||event.cancelled||event.createdBy!==queue.createdBy||!group?.name?.trim()||!Number.isFinite(created)||Date.now()-created>86400000||!Number.isFinite(starts)||starts<=Date.now()){
    updateQueue_(queue.id,{pushStatus:'skipped',pushCompletedAt:new Date()},token);return;
  }
  const delivered=new Set(queue.pushDeliveredTo||[]),recipients=resolvePushRecipients_(devices,event.group,queue.createdAt,blockedIds);
  for(const device of recipients){
    if(delivered.has(device.id))continue;
    if(Date.now()>deadline)return;
    // Reload preferences and blocked state immediately before each delivery.
    const latestDoc=firestore_('/pushDevices/'+encodeURIComponent(device.id),token);
    if(!latestDoc)continue;
    const latest=Object.assign({id:device.id},decodeFields_(latestDoc.fields));
    const member=firestore_('/members/'+encodeURIComponent(latest.uid),token);
    if(member&&decodeFields_(member.fields).blocked)continue;
    if(!resolvePushRecipients_([latest],event.group,queue.createdAt,new Set()).length)continue;
    try{
      const outcome=sendPush_(latest,event,group,queue.eventId,false);
      if(outcome==='expired')disableExpiredPush_(latest,token);
      delivered.add(device.id);
      updateQueue_(queue.id,{pushDeliveredTo:Array.from(delivered),pushLastAttemptAt:new Date(),pushLastError:''},token);
    }catch(error){
      updateQueue_(queue.id,{pushStatus:'pending',pushLastAttemptAt:new Date(),pushLastError:'El servicio push no confirmó el envío. Se reintentará; los correos siguen funcionando por separado.'},token);
      return;
    }
  }
  updateQueue_(queue.id,{pushStatus:'sent',pushDeliveredTo:Array.from(delivered),pushLastError:'',pushCompletedAt:new Date()},token);
}
function procesarPush(){
  senderGuard_();
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const token=firebaseToken_(),pending=pushPending_(token),seats=typeof seatPushPending_==='function'?seatPushPending_(token):[];if(!pending.length&&!seats.length)return;
    const devices=listDocuments_('pushDevices',token),blockedIds=new Set();
    for(const uid of new Set(devices.map(d=>d.uid))){const m=firestore_('/members/'+encodeURIComponent(uid),token);if(m&&decodeFields_(m.fields).blocked)blockedIds.add(uid);}
    const deadline=Date.now()+220000;
    for(const queue of seats){if(Date.now()>deadline)break;processSeatPush_(queue,devices,blockedIds,token,deadline);}
    for(const queue of pending){if(Date.now()>deadline)break;processPushRequest_(queue,devices,blockedIds,token,deadline);}
  }finally{lock.releaseLock();}
}
function activarPush(){
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/firebase.messaging']);
  senderGuard_();const token=firebaseToken_();pushPending_(token);listDocuments_('pushDevices',token);
  for(const trigger of ScriptApp.getProjectTriggers())if(trigger.getHandlerFunction()==='procesarPush')ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('procesarPush').timeBased().everyMinutes(5).create();
  console.log('Procesador push activado. Requiere prueba real en un dispositivo antes de habilitar el botón público.');
}

// Validate authorization without delivering a message or changing subscriptions.
function comprobarPermisoPush(){
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/firebase.messaging']);
  senderGuard_();
  const response=UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/'+PROJECT_ID+'/messages:send',{
    method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:JSON.stringify({validate_only:true,message:{topic:'comprobacion-configuracion',data:{type:'config-check'}}}),muteHttpExceptions:true
  });
  const code=response.getResponseCode();let result={};try{result=JSON.parse(response.getContentText());}catch{}
  if(code>=200&&code<300&&result.name)console.log('Permiso push confirmado. Validación correcta; no se ha enviado ninguna notificación.');
  else {
    const reason=(result.error?.details||[]).map(d=>d.reason||'').filter(s=>/^[A-Z_]{3,80}$/.test(s)).join(', ');
    throw Error('No se pudo validar el permiso de envío push (HTTP '+code+(reason?', '+reason:'')+'). Revisar IAM y la autorización de mensajería.');
  }
}
