const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const props=new Map(),warnings=[];let clock=Date.now(),locked=false;
class Clock extends Date { static now(){return clock;} }
const ctx={console:{log:console.log,warn:m=>warnings.push(m)},Date:Clock,Map,Set,Object,encodeURIComponent,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
 LockService:{getScriptLock:()=>({tryLock:()=>!locked,releaseLock:()=>{}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('comunidad/avisos/Code.gs','utf8'),ctx);
const root='projects/risas-y-buen-rollo/databases/(default)/documents',event=root+'/events/e';let writes,reads=[],requests=[],failure=null,version='queue-time';
const raw={name:event,updateTime:'event-time',fields:{capacity:{integerValue:'3'}}};
ctx.listDocuments_=(path)=>{reads.push(path);if(path.endsWith('/attendees'))return [];return [{seq:1,uid:'a',kind:'join',people:2,limitBefore:3,legacyPeople:0},{seq:2,uid:'b',kind:'join',people:3,limitBefore:3,legacyPeople:0},{seq:3,uid:'c',kind:'join',people:1,limitBefore:3,legacyPeople:0}];};
ctx.firestore_=function(path,token,opt){requests.push(path);
 if(path===':runQuery')return [{document:{name:root+'/attendanceSummaryQueue/e',updateTime:version}}];
 if(path===':batchGet'){const payload=JSON.parse(opt.payload);assert.equal(payload.documents.length,4);assert.deepEqual(payload.newTransaction,{readWrite:{}});return [{transaction:'TX'},{found:raw},{found:{name:event+'/attendanceState/current',fields:{revision:{integerValue:'3'}}}},{found:{name:root+'/attendanceSummaryQueue/e',updateTime:version}},{missing:event+'/seatNotificationState/current'}];}
 if(path===':commit'){if(failure)throw failure;const payload=JSON.parse(opt.payload);assert.equal(payload.transaction,'TX');writes=payload.writes;assert(writes.every(w=>!w.verify));return {};}
 if(path===':rollback')return {};
 throw Error(path);};
ctx.procesarResumenesAsistencia_('token');const summary=writes[0].update.fields;assert.equal(summary.confirmed.integerValue,'3');assert.equal(summary.waiting.integerValue,'3');assert.equal(writes.at(-1).currentDocument.updateTime,version);assert.equal(reads.length,2);assert(!requests.includes(':rollback'));
// Transient failures roll back; repeated timers do not read rosters until backoff expires.
reads=[];failure=Object.assign(Error('abort'),{httpCode:409,status:'ABORTED'});ctx.procesarResumenesAsistencia_('token');assert(requests.includes(':rollback'));const count=reads.length;ctx.procesarResumenesAsistencia_('token');assert.equal(reads.length,count);
clock+=5*60000;ctx.procesarResumenesAsistencia_('token');assert.equal(reads.length,count+2);
version='new-queue-version';ctx.procesarResumenesAsistencia_('token');assert.equal(reads.length,count+4,'New signup must bypass stale backoff');
failure=null;version='recovered';ctx.procesarResumenesAsistencia_('token');assert.equal(props.has('attendanceRetryV2:e'),false);
// Invalid requests/permissions pause the whole worker, including the pending query.
failure=Object.assign(Error('bad'),{httpCode:400,status:'INVALID_ARGUMENT'});ctx.procesarResumenesAsistencia_('token');const n=requests.length;ctx.procesarResumenesAsistencia_('token');assert.equal(requests.length,n);assert(warnings.some(w=>w.includes('INVALID_ARGUMENT')));props.clear();
locked=true;ctx.procesarResumenesAsistencia_('token');assert.equal(requests.length,n);locked=false;
reads=[];writes=null;ctx.firestore_=()=>[];ctx.procesarResumenesAsistencia_('token');assert.equal(reads.length,0);assert.equal(writes,null);
console.log('OK: REST transaction, correct totals, rollback, revision-aware backoff, shared failure pause and overlap protection.');
// Structured HTTP codes are preserved without logging server messages or credentials.
ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>403,getContentText:()=>JSON.stringify({error:{status:'PERMISSION_DENIED',message:'private details'}})})};
assert.throws(()=>ctx.requestJson_('https://example.test',{}),e=>e.httpCode===403&&e.status==='PERMISSION_DENIED'&&!e.message.includes('private details'));

// The repair covers started-today events and explicit finishes; it skips existing summaries and cancelled events.
const recentDoc=id=>({document:{name:root+'/events/'+id,fields:{}}});let queries=[],queued=[];
ctx.senderGuard_=()=>{};ctx.firebaseToken_=()=> 'token';ctx.procesarResumenesAsistencia_=()=>{};
ctx.firestore_=(path,token,options)=>{
 if(path===':runQuery'){const q=JSON.parse(options.payload).structuredQuery;queries.push(q);return queries.length===1?[recentDoc('started-today'),recentDoc('already-counted'),{document:{name:root+'/events/cancelled',fields:{cancelled:{booleanValue:true}}}}]:[recentDoc('started-today'),recentDoc('long-event')];}
 if(path==='/attendanceSummaries/already-counted')return {fields:{confirmed:{integerValue:'2'}}};
 if(path.startsWith('/attendanceSummaries/')||path.startsWith('/attendanceSummaryQueue/'))return null;
 if(path===':commit'){queued.push(JSON.parse(options.payload).writes[0].update.name.split('/').pop());return {};}
 throw Error(path);
};
ctx.inicializarResumenesAsistencia();assert.equal(queries.length,2);assert.equal(queries[0].where.fieldFilter.field.fieldPath,'start');assert(Date.parse(queries[0].where.fieldFilter.value.stringValue)<Date.now()-2*86400000);assert.equal(queries[1].where.fieldFilter.field.fieldPath,'endAt');assert.deepEqual(queued,['started-today','long-event']);
console.log('OK: reparar incluye eventos ya empezados, deduplica y conserva resúmenes existentes; excluye cancelados.');
