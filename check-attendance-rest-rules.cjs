// Local emulator only. No production data, tokens, mail or push endpoints.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createMockUserToken}=require('@firebase/util');
const base='http://127.0.0.1:8088/v1/projects/demo-risas/databases/(default)/documents';
execFileSync('curl',['-sS','--fail','-X','DELETE','http://127.0.0.1:8088/emulator/v1/projects/demo-risas/databases/(default)/documents']);
const token=createMockUserToken({sub:'notice-test',email:'peperisasybuenrollo@gmail.com',email_verified:true},'demo-risas');
function http(url,options={}){
 assert(url.startsWith(base),'Test must never contact production');
 const args=['-sS','--max-time','25','-X',(options.method||'GET').toUpperCase(),'-H','Content-Type: application/json'];
 for(const [key,value] of Object.entries(options.headers||{}))args.push('-H',key+': '+value);
 if(options.payload)args.push('--data-binary',options.payload);
 args.push('-w','\n%{http_code}',url);
 const raw=execFileSync('curl',args,{encoding:'utf8'}),cut=raw.lastIndexOf('\n');
 return {getResponseCode:()=>Number(raw.slice(cut+1)),getContentText:()=>raw.slice(0,cut)};
}
function admin(path,method,payload){const r=http(base+path,{method,headers:{Authorization:'Bearer owner'},payload:payload&&JSON.stringify(payload)});assert(r.getResponseCode()<300,r.getContentText());return JSON.parse(r.getContentText()||'{}');}
const props=new Map(),ctx={console,Date,Map,Set,Object,encodeURIComponent,
 UrlFetchApp:{fetch:(url,options)=>http(url.replace('https://firestore.googleapis.com/v1', 'http://127.0.0.1:8088/v1'),options)},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('comunidad/avisos/Code.gs','utf8').replace("const PROJECT_ID = 'risas-y-buen-rollo';","const PROJECT_ID = 'demo-risas';")+'\n'+fs.readFileSync('comunidad/avisos/Seats.gs','utf8'),ctx);
const root='projects/demo-risas/databases/(default)/documents';
const fields=obj=>Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,ctx.encodeValue_(v)]));
function seed(id,revision=0){admin('/events/'+id,'PATCH',{fields:fields({title:'Test',group:'test',createdBy:'creator',capacity:2,start:'2027-01-01T10:00:00Z',endAt:Date.now()+86400000})});admin('/attendanceSummaryQueue/'+id,'PATCH',{fields:fields({revision})});}
seed('rest-test');
// Worker uses real REST, real rules and missing state/cursor docs.
ctx.procesarResumenesAsistencia_(token);
let summary=admin('/attendanceSummaries/rest-test','GET');assert.equal(summary.fields.confirmed.integerValue,'0');assert.equal(summary.fields.waiting.integerValue,'0');assert.equal(http(base+'/attendanceSummaryQueue/rest-test',{headers:{Authorization:'Bearer owner'}}).getResponseCode(),404);assert.equal(props.size,0);
// Promotion + summary + cursor are committed atomically, under actual rules.
seed('promotion-test',3);
admin('/events/promotion-test/attendanceState/current','PATCH',{fields:fields({revision:3})});
const now=Date.now();
for(const [id,value] of Object.entries({one:{seq:1,uid:'a',kind:'join',people:1,legacyPeople:0,limitBefore:1,createdAt:new Date(now-3000).toISOString()},two:{seq:2,uid:'b',kind:'join',people:1,legacyPeople:0,limitBefore:1,createdAt:new Date(now-2000).toISOString()},three:{seq:3,uid:'creator',kind:'capacity',people:0,legacyPeople:0,limitBefore:1,limitAfter:2,createdAt:new Date(now-1000).toISOString()}}))admin('/events/promotion-test/attendanceChanges/'+id,'PATCH',{fields:fields(value)});
ctx.procesarResumenesAsistencia_(token);
summary=admin('/attendanceSummaries/promotion-test','GET');assert.equal(summary.fields.confirmed.integerValue,'2');assert.equal(summary.fields.waiting.integerValue,'0');assert.equal(admin('/events/promotion-test/seatNotificationState/current','GET').fields.revision.integerValue,'3');assert.equal(props.size,0);
const notices=admin('/seatNotificationQueue','GET').documents||[];assert(notices.length>0,'Promotion should generate a queue entry without sending push');
// A concurrent writer is prevented from changing a locked guard. Rollback
// releases the lock, and the next count incorporates the changed capacity.
seed('race-test');const snap=ctx.attendanceSnapshot_('race-test',token);
const conflict=http(base+'/events/race-test',{method:'PATCH',headers:{Authorization:'Bearer owner'},payload:JSON.stringify({fields:fields({capacity:5})})});
assert.equal(conflict.getResponseCode(),409);
ctx.firestore_(':rollback',token,{method:'post',payload:JSON.stringify({transaction:snap.transaction})});
assert(admin('/attendanceSummaryQueue/race-test','GET'));
admin('/events/race-test','PATCH',{fields:fields({capacity:5})});ctx.procesarResumenesAsistencia_(token);
assert.equal(admin('/attendanceSummaries/race-test','GET').fields.capacity.integerValue,'5');
const denied=http(base+'/attendanceSummaries/unauthorized',{method:'PATCH',payload:JSON.stringify({fields:fields({confirmed:0})})});assert.equal(denied.getResponseCode(),403);
console.log('SUCCESS: summaries and promotion queue saved under real rules; transaction guards serialize edits; rollback releases locks; anonymous writes denied.');
