// Registration notifications use the existing dedicated sender and mail quota.
function pendingRegistrations_(token) {
  const result = firestore_(':runQuery', token, {method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{
    from:[{collectionId:'registrationNotices'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'pending'}}},limit:30
  }})});
  return (result || []).filter(row => row.document).map(row => Object.assign({id:row.document.name.split('/').pop()},decodeFields_(row.document.fields)));
}
function updateRegistration_(id, values, token) {
  const mask = Object.keys(values).map(key => 'updateMask.fieldPaths=' + encodeURIComponent(key)).join('&');
  return firestore_('/registrationNotices/'+encodeURIComponent(id)+'?'+mask,token,{method:'patch',contentType:'application/json',payload:JSON.stringify({fields:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,encodeValue_(value)]))})});
}
function registrationMailText_(notice) {
  const stamp = new Date(notice.createdAt);
  const date = isNaN(stamp.getTime()) ? 'Fecha no disponible' : stamp.toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'full',timeStyle:'short'});
  return 'Una persona nueva ha completado su registro y ha confirmado su correo en Risas y Buen Rollo.\n\nNombre: '+notice.name+'\nCorreo: '+notice.email+'\nRegistro confirmado: '+date+'\n\nYa puede apuntarse y crear sus propias quedadas. No se le han concedido permisos de administrador.\n\nRevisar miembros:\n'+COMMUNITY_URL;
}
function processRegistration_(notice, token) {
  const member = firestore_('/members/'+encodeURIComponent(notice.id),token);
  if(!notice.name || !canonicalEmail_(notice.email) || (member && decodeFields_(member.fields).blocked)) {
    updateRegistration_(notice.id,{status:'skipped',completedAt:new Date()},token);return;
  }
  const props=PropertiesService.getScriptProperties(),key=deliveryKey_('registration-'+notice.id,NOTICE_SENDER),previous=props.getProperty(key);
  if(previous==='sending') {
    updateRegistration_(notice.id,{status:'needsReview',lastError:'Un envío quedó sin confirmación. Revisar antes de repetirlo.',lastAttemptAt:new Date()},token);return;
  }
  if(previous!=='sent') {
    if(MailApp.getRemainingDailyQuota()<1){updateRegistration_(notice.id,{status:'pending',lastError:'Cuota diaria alcanzada; se reanudará automáticamente.',lastAttemptAt:new Date()},token);return;}
    props.setProperty(key,'sending');
    try {
      MailApp.sendEmail({to:NOTICE_SENDER,subject:'Nuevo registro · '+String(notice.name).replace(/[\r\n]/g,' ').slice(0,80),body:registrationMailText_(notice),name:'Risas y Buen Rollo',replyTo:NOTICE_SENDER});
      props.setProperty(key,'sent');
    } catch(error) {
      updateRegistration_(notice.id,{status:'needsReview',lastError:'El servicio no confirmó el envío. Revisar antes de repetirlo.',lastAttemptAt:new Date()},token);return;
    }
  }
  updateRegistration_(notice.id,{status:'sent',lastError:'',lastAttemptAt:new Date(),completedAt:new Date()},token);
  props.deleteProperty(key);
}
function procesarRegistros() {
  senderGuard_();const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{const token=firebaseToken_(),rows=pendingRegistrations_(token),until=Date.now()+220000;for(const notice of rows){if(Date.now()>until)break;processRegistration_(notice,token);}}
  finally{lock.releaseLock();}
}
function activarAvisosRegistro() {
  senderGuard_();pendingRegistrations_(firebaseToken_());
  for(const trigger of ScriptApp.getProjectTriggers())if(trigger.getHandlerFunction()==='procesarRegistros')ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('procesarRegistros').timeBased().everyMinutes(5).create();
  console.log('Avisos de nuevos registros activados solo para '+NOTICE_SENDER+'.');
}
function comprobarAvisosRegistro() {
  senderGuard_();const rows=pendingRegistrations_(firebaseToken_());
  console.log('Acceso privado correcto. Registros pendientes: '+rows.length+'. Cuota diaria restante: '+MailApp.getRemainingDailyQuota()+'.');
}
function probarAvisoRegistro() {
  senderGuard_();
  MailApp.sendEmail({to:NOTICE_SENDER,subject:'Prueba · Aviso de nuevo registro',body:'Esta es una prueba del aviso de altas de Risas y Buen Rollo.\n\nLos avisos reales incluirán el nombre, el correo verificado y la fecha del registro, y llegarán únicamente a este buzón.\n\nNo se ha creado ninguna cuenta ni se ha enviado este correo a otras personas.\n\n'+COMMUNITY_URL,name:'Risas y Buen Rollo',replyTo:NOTICE_SENDER});
  console.log('Prueba de aviso de registro enviada únicamente al buzón de avisos.');
}
