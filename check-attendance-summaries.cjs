const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={console,Date,Map,Object,encodeURIComponent};vm.createContext(ctx);vm.runInContext(fs.readFileSync('comunidad/avisos/Code.gs','utf8'),ctx);
const root='projects/demo/databases/(default)/documents',event=root+'/events/e';let writes,reads=[];
ctx.listDocuments_=(path)=>{reads.push(path);if(path.endsWith('/attendees'))return [];return [{seq:1,uid:'a',kind:'join',people:2,limitBefore:3,legacyPeople:0},{seq:2,uid:'b',kind:'join',people:3,limitBefore:3,legacyPeople:0},{seq:3,uid:'c',kind:'join',people:1,limitBefore:3,legacyPeople:0}];};
ctx.firestore_=function(path,token,opt){if(path===':runQuery')return [{document:{name:root+'/attendanceSummaryQueue/e',updateTime:'queue-time'}}];if(path==='/events/e')return {name:event,updateTime:'event-time',fields:{capacity:{integerValue:'3'}}};if(path.endsWith('/attendanceState/current'))return {name:event+'/attendanceState/current',updateTime:'state-time',fields:{revision:{integerValue:'3'}}};if(path===':commit'){writes=JSON.parse(opt.payload).writes;return {};}throw Error(path);};
ctx.procesarResumenesAsistencia_('token');const summary=writes.find(w=>w.update)?.update.fields;assert.equal(summary.confirmed.integerValue,'3');assert.equal(summary.waiting.integerValue,'3');assert.equal(writes.filter(w=>w.verify).length,2);assert.equal(writes.at(-1).currentDocument.updateTime,'queue-time');assert.equal(reads.length,2);
reads=[];writes=null;ctx.firestore_=()=>[];ctx.procesarResumenesAsistencia_('token');assert.equal(reads.length,0);assert.equal(writes,null);
console.log('OK: resumen respeta plazas y espera; confirma revisión, evento y cola antes de escribir; sin tareas no lee asistentes.');

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
