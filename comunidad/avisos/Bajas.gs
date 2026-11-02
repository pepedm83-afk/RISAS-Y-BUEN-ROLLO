// Privileged worker. Disabled until activarBajas() is authorized by the dedicated sender.
// Requires the custom IAM role described in BAJAS.md. Never stores credentials.
function bajasRoot_(){return 'projects/'+PROJECT_ID+'/databases/(default)/documents';}
function bajasStore_(path,options){return requestJson_('https://firestore.googleapis.com/v1/'+bajasRoot_()+path,Object.assign({headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}},options||{}));}
function bajasAuthHeaders_(){return {Authorization:'Bearer '+ScriptApp.getOAuthToken(),'X-Goog-User-Project':PROJECT_ID};}
function bajasAuth_(method,data){return requestJson_('https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT_ID+'/accounts:'+method,{method:'post',contentType:'application/json',headers:bajasAuthHeaders_(),payload:JSON.stringify(data)});}
function bajasFields_(values){return Object.fromEntries(Object.entries(values).map(([k,v])=>[k,encodeValue_(v)]));}
function bajasPatch_(path,values){return bajasStore_(path+'?'+Object.keys(values).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&'),{method:'patch',contentType:'application/json',payload:JSON.stringify({fields:bajasFields_(values)})});}
function bajasQuery_(collection,field,value){const rows=bajasStore_(':runQuery',{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:encodeValue_(value)}},limit:100}})});return (rows||[]).filter(r=>r.document).map(r=>r.document);}
function bajasDeleteDocuments_(documents){for(const row of documents)bajasStore_('/'+row.name.split('/documents/')[1],{method:'delete'});}
function bajasValidate_(job){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(job.uid)||job.uid===job.requestedBy||!['reject','delete'].includes(job.kind))throw Error('Solicitud de baja inválida.');
 const accounts=bajasAuth_('lookup',{localId:[job.uid,job.requestedBy]}).users||[];
 const target=accounts.find(u=>u.localId===job.uid),actor=accounts.find(u=>u.localId===job.requestedBy);
 if(target&&[EXCLUDED_MAILBOX,NOTICE_SENDER].includes(canonicalEmail_(target.email)))throw Error('Cuenta protegida.');
 const grant=bajasStore_('/grants/'+encodeURIComponent(job.uid));if(grant)throw Error('Retira primero los permisos de administrador.');
 const actorGrant=bajasStore_('/grants/'+encodeURIComponent(job.requestedBy));
 if(!actor||!actor.emailVerified||(canonicalEmail_(actor.email)!==EXCLUDED_MAILBOX&&decodeFields_(actorGrant?.fields).role!=='community'))throw Error('La persona solicitante ya no tiene permiso.');
 return target;
}
function bajasAttendance_(raw,uid,actor){
 const e=decodeFields_(raw.fields),path='/events/'+encodeURIComponent(raw.name.split('/').pop()),a=bajasStore_(path+'/attendees/'+encodeURIComponent(uid));
 if(!a)return;
 // Keep anonymous attendance statistics for finished events. Remove future bookings normally.
 if((e.endAt||finalSinHora_(e.start))<=Date.now()){
  bajasPatch_(path+'/attendees/'+encodeURIComponent(uid),{name:'Miembro eliminado'});return;
 }
 const state=bajasStore_(path+'/attendanceState/current'),revision=state?decodeFields_(state.fields).revision:0,seq=revision+1;
 const change='account-delete-'+uid+'-'+seq,now=new Date();
 const writes=[{verify:raw.name,currentDocument:{updateTime:raw.updateTime}},{delete:a.name,currentDocument:{updateTime:a.updateTime}},
 {update:{name:raw.name+'/attendanceChanges/'+change,fields:bajasFields_({seq,actor,uid,kind:'leave',people:0,legacyPeople:0,limitBefore:e.capacity||0,limitAfter:e.capacity||0})},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]},
 {update:{name:raw.name+'/attendanceState/current',fields:bajasFields_({revision:seq,lastChange:change})},currentDocument:state?{updateTime:state.updateTime}:{exists:false},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]},
 {update:{name:bajasRoot_()+'/attendanceSummaryQueue/'+raw.name.split('/').pop(),fields:bajasFields_({revision:seq})},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}];
 const payment=bajasStore_(path+'/payments/'+encodeURIComponent(uid));
 if(payment){writes.push({update:{name:raw.name+'/paymentHistory/'+change,fields:bajasFields_(Object.assign({uid,actor,removedAt:now},decodeFields_(payment.fields)))}});writes.push({delete:payment.name,currentDocument:{updateTime:payment.updateTime}});}
 for(const col of ['mealSelections','checkins'])writes.push({delete:raw.name+'/'+col+'/'+uid});
 bajasStore_(':commit',{method:'post',contentType:'application/json',payload:JSON.stringify({writes})});
}
function bajasProcess_(raw){
 const job=Object.assign({uid:raw.name.split('/').pop()},decodeFields_(raw.fields)),path='/accountDeletionQueue/'+encodeURIComponent(job.uid);
 const target=bajasValidate_(job);
 if(target&&!target.disabled)bajasAuth_('update',{localId:job.uid,disableUser:true,validSince:String(Math.floor(Date.now()/1000))});
 bajasPatch_('/members/'+encodeURIComponent(job.uid),{blocked:true});
 const page=bajasStore_('/events?pageSize=30'+(job.pageToken?'&pageToken='+encodeURIComponent(job.pageToken):''));
 for(const event of page.documents||[])bajasAttendance_(event,job.uid,job.requestedBy);
 if(page.nextPageToken){bajasPatch_(path,{status:'pending',pageToken:page.nextPageToken,lastError:''});return;}
 // Small bounded batches per cycle: retries resume without deleting a different account.
 for(const col of ['pushDevices','seatNotificationQueue','nameClaims']){
  const rows=bajasQuery_(col,'uid',job.uid);bajasDeleteDocuments_(rows);
  if(rows.length===100){bajasPatch_(path,{status:'pending',pageToken:'',lastError:''});return;}
 }
 for(const col of ['profiles','registrationDrafts','membershipReviews','registrationNotices','phoneNotices','notificationContacts','emailSubscriptions','requests'])bajasStore_('/'+col+'/'+encodeURIComponent(job.uid),{method:'delete'});
 if(target)bajasAuth_('delete',{localId:job.uid});
 bajasPatch_(path,{status:'done',pageToken:'',lastError:'',completedAt:new Date()});
}
function procesarBajas(){
 senderGuard_();if(PropertiesService.getScriptProperties().getProperty('bajas-enabled')!=='yes')return;
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 try{const rows=bajasQuery_('accountDeletionQueue','status','pending'),until=Date.now()+220000;
 for(const raw of rows){if(Date.now()>until)break;try{bajasProcess_(raw);}catch(error){bajasPatch_('/accountDeletionQueue/'+raw.name.split('/').pop(),{status:'needsReview',lastError:'No completada. Revisar permisos o cambios de administrador antes de reintentar.'});console.error('Baja no completada; revisar la cola privada.');}}
 }finally{lock.releaseLock();}
}
function activarBajas(){
 senderGuard_();bajasAuth_('lookup',{localId:['permission-check-no-real-user']});bajasStore_('/settings/accountDeletion');
 bajasPatch_('/settings/accountDeletion',{enabled:true});
 PropertiesService.getScriptProperties().setProperty('bajas-enabled','yes');
 for(const trigger of ScriptApp.getProjectTriggers())if(trigger.getHandlerFunction()==='procesarBajas')ScriptApp.deleteTrigger(trigger);
 ScriptApp.newTrigger('procesarBajas').timeBased().everyMinutes(5).create();
 console.log('Servicio de bajas activado. No se ha borrado ninguna cuenta en esta comprobación.');
}
// Read-only diagnosis: no real account data and no private document contents are logged.
function comprobarPermisosBajas(){
 senderGuard_();
 const checks=[{name:'Authentication',url:'https://identitytoolkit.googleapis.com/v1/projects/'+PROJECT_ID+'/accounts:lookup',options:{method:'post',contentType:'application/json',headers:bajasAuthHeaders_(),payload:JSON.stringify({localId:['permission-check-no-real-user']})}},{name:'Firestore',url:'https://firestore.googleapis.com/v1/'+bajasRoot_()+'/settings/accountDeletion',options:{method:'get'}}];
 for(const check of checks){
  const response=UrlFetchApp.fetch(check.url,Object.assign({muteHttpExceptions:true,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}},check.options));
  let error={};try{error=JSON.parse(response.getContentText()).error||{};}catch(_){}
  console.log(JSON.stringify({service:check.name,http:response.getResponseCode(),status:error.status||'',message:String(error.message||'').slice(0,700),reasons:(error.details||[]).map(d=>d.reason||'').filter(Boolean)}));
 }
}
