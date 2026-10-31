const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/comunidad/';
const client=fs.readFileSync(root+'push.js','utf8'),sw=fs.readFileSync(root+'push-sw.js','utf8');
const main=fs.readFileSync(root+'index.html','utf8');
new vm.Script(sw);
new vm.Script(client.replace(/^import.*\n/gm,'').replace(/^export /gm,''));
new vm.Script('(async()=>{'+main.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import.*\n/gm,'')+'})');
const platform={};vm.createContext(platform);vm.runInContext(client.replace(/^import.*\n/gm,'').replace(/^export /gm,''),platform);
assert.equal(platform.platformHelp({userAgent:'iPhone OS 16_3',platform:'iPhone'},true).blocked,true);
assert.equal(platform.platformHelp({userAgent:'iPhone OS 16_4',platform:'iPhone'},false).blocked,true);
assert.equal(platform.platformHelp({userAgent:'iPhone OS 16_4',platform:'iPhone'},true).blocked,false);
assert.equal(platform.platformHelp({userAgent:'Mozilla Mac OS X',platform:'MacIntel',maxTouchPoints:5},false).blocked,true);
assert.equal(platform.platformHelp({userAgent:'Android Chrome',platform:'Linux'},false).blocked,false);
const writes=[],sent=[],expired=[],backend={console,Date,PROJECT_ID:'risas-y-buen-rollo',COMMUNITY_URL:'https://example.com/comunidad/',NOTICE_SENDER:'peperisasybuenrollo@gmail.com',decodeFields_:f=>f,updateQueue_:(id,values)=>writes.push(values)};
vm.createContext(backend);vm.runInContext(fs.readFileSync(root+'avisos/Push.gs','utf8'),backend);
const now=new Date().toISOString(),before=new Date(Date.now()-10000).toISOString(),after=new Date(Date.now()+10000).toISOString();
const devices=[
 {id:'a',uid:'u',enabled:true,token:'token-a',groups:['rutas'],subscribedAt:before},
 {id:'b',uid:'v',enabled:true,token:'token-b',groups:['cine'],subscribedAt:before},
 {id:'c',uid:'w',enabled:false,token:'token-c',groups:['rutas'],subscribedAt:before},
 {id:'d',uid:'x',enabled:true,token:'token-d',groups:['rutas'],subscribedAt:after},
 {id:'e',uid:'blocked',enabled:true,token:'token-e',groups:['rutas'],subscribedAt:before},
 {id:'duplicate',uid:'u',enabled:true,token:'token-a',groups:['rutas'],subscribedAt:before}
];
assert.deepEqual(Array.from(backend.resolvePushRecipients_(devices,'rutas',now,new Set(['blocked'])),d=>d.id),['a']);
assert.equal(backend.resolvePushRecipients_(devices,'rutas','bad',new Set()).length,0);
const event={title:'Ruta',group:'rutas',createdBy:'creator',start:after,location:'Náquera'};
backend.firestore_=path=>path.startsWith('/events/')?{fields:event}:path.startsWith('/groups/')?{fields:{name:'Rutas'}}:path.startsWith('/pushDevices/')?{fields:devices.find(d=>path.endsWith('/'+d.id))}:null;
backend.sendPush_=(device,e,g,id)=>{sent.push(device.id);return device.id==='e'?'expired':'accepted';};
backend.disableExpiredPush_=d=>expired.push(d.id);
const queue={id:'event1',eventId:'event1',createdBy:'creator',createdAt:now,notifyAdmins:false,status:'sent'};
backend.processPushRequest_(queue,devices,new Set(['blocked']),'firebase-token',Date.now()+10000);
assert.deepEqual(sent,['a']);assert.equal(writes.at(-1).pushStatus,'sent');
backend.processPushRequest_({...queue,pushDeliveredTo:['a']},devices,new Set(['blocked']),'firebase-token',Date.now()+10000);assert.equal(sent.length,1);
backend.processPushRequest_({...queue,createdAt:new Date(Date.now()-86400001).toISOString()},devices,new Set(),'firebase-token',Date.now()+10000);assert.equal(writes.at(-1).pushStatus,'skipped');
event.cancelled=true;backend.processPushRequest_(queue,devices,new Set(),'firebase-token',Date.now()+10000);assert.equal(writes.at(-1).pushStatus,'skipped');event.cancelled=false;
backend.sendPush_=()=>{throw Error('Quota or authorization');};backend.processPushRequest_(queue,[devices[0]],new Set(),'firebase-token',Date.now()+10000);assert.equal(writes.at(-1).pushStatus,'pending');
// Foreground/background display, shared-phone isolation, retry deduplication and deep links.
const listeners={},notifications=[],storage=new Map([['account',{uid:'u',enabled:true}]]),opened=[];
const workerContext={URL,console,Set,indexedDB:{},self:{location:{href:'https://example.com/comunidad/push-sw.js'},addEventListener:(type,fn)=>listeners[type]=fn,registration:{showNotification:async(t,o)=>notifications.push({t,o})},clients:{matchAll:async()=>[],openWindow:async u=>opened.push(u)}}};
vm.createContext(workerContext);vm.runInContext(sw,workerContext);
workerContext.stateStore=async(mode,op)=>op({get:k=>({result:storage.get(k)}),put:(v,k)=>{storage.set(k,v);return {result:k};}}).result;
async function push(data){let done;listeners.push({data:{json:()=>({data})},waitUntil:p=>done=p});await done;}
(async()=>{
 await push({type:'new-event',uid:'other',eventId:'e1',title:'Hidden'});assert.equal(notifications.length,0);
 await push({type:'new-event',uid:'u',eventId:'e1',title:'Ruta',body:'Rutas'});assert.equal(notifications.length,1);
 await push({type:'new-event',uid:'u',eventId:'e1',title:'Ruta',body:'Rutas'});assert.equal(notifications.length,1);
 await push({type:'new-event',uid:'u',eventId:'../evil',title:'Bad'});assert.equal(notifications.length,1);
 await push({type:'seat-confirmed',uid:'u',eventId:'e1',notificationId:'e1-51-u',title:'Ya tienes plaza'});assert.equal(notifications.length,2);await push({type:'seat-confirmed',uid:'u',eventId:'e1',notificationId:'e1-51-u'});assert.equal(notifications.length,2);await push({type:'seat-confirmed',uid:'other',eventId:'e1',notificationId:'e1-52-u'});assert.equal(notifications.length,2);
 storage.set('account',{uid:'u',enabled:false});await push({type:'new-event',uid:'u',eventId:'e2'});assert.equal(notifications.length,2);
 let done;listeners.notificationclick({notification:{close:()=>{},data:notifications[0].o.data},waitUntil:p=>done=p});await done;assert.equal(opened[0],'https://example.com/comunidad/?event=e1');
 const rules=fs.readFileSync(root+'firestore.rules','utf8');assert(rules.includes("request.resource.data.uid == request.auth.uid"));assert(rules.includes("request.resource.data.pushStatus == 'pending'"));
 const mail=fs.readFileSync(root+'avisos/Code.gs','utf8');assert(!mail.includes("listDocuments_('emailSubscriptions'"));assert(!mail.includes('for (const subscription'));
 assert(!main.includes('Mis avisos por email'));assert(main.includes("pushStatus:'pending'"));assert(main.includes('createPushControls'));
 const config=JSON.parse(fs.readFileSync(root+'push-config.json'));assert.equal(typeof config.enabled,'boolean');if(config.enabled)assert(/^[A-Za-z0-9_-]{87}$/.test(config.vapidKey));
 // Header settings must open without unsubscribing an already enabled device.
 const {JSDOM}=require('jsdom'),ui=new JSDOM(main.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.com/comunidad/',runScripts:'outside-only'}),front=ui.getInternalVMContext();let removedDevices=0,removedTokens=0,loads=0;
 const activeWorker={postMessage:(value,ports)=>queueMicrotask(()=>ports[0].peer.onmessage({data:{ok:true}}))};Object.defineProperty(front.navigator,'serviceWorker',{value:{register:async()=>({active:activeWorker})}});front.window.matchMedia=()=>({matches:true});front.localStorage.setItem('community-push-device',JSON.stringify({uid:'u',id:'device'}));Object.assign(front,{MessageChannel:class{constructor(){this.port1={close:()=>{}};this.port2={peer:this.port1};}},setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({enabled:true,vapidKey:'A'.repeat(87)})}),isSupported:async()=>true,Notification:{permission:'granted'},doc:(...args)=>args,getDoc:async()=>({data:()=>({enabled:true,groups:['cine']})}),deleteDoc:async()=>removedDevices++,getMessaging:()=>({}),deleteToken:async()=>removedTokens++});
 vm.runInContext(client.replace(/^import.*\n/gm,'').replace(/^export /gm,''),front);const controls=front.createPushControls({}, {},{getUser:()=>({uid:'u'}),verified:()=>true,isAdmin:()=>false,getAssignedGroups:()=>[],getGroups:()=>[{id:'cine',name:'Cine'}]});await controls.load();const headerButton=front.document.getElementById('pushToggle'),indicator=front.document.getElementById('pushIndicator');assert.equal(headerButton.textContent.trim(),'🔔 Avisos');assert.equal(indicator.hidden,false);assert.match(headerButton.getAttribute('aria-label'),/activados/);assert.equal(front.document.getElementById('notificationSettings'),null);assert.equal(front.document.querySelector('header #appVersion'),null);assert(front.document.querySelector('#accountDetails #appVersion'));assert.equal(front.document.getElementById('createGroupDetails').open,false);
 Object.assign(front,{$:id=>front.document.getElementById(id),agendaAccess:()=>true,run:fn=>fn(),pushControls:{load:async()=>loads++}});front.document.getElementById('notificationPanel').scrollIntoView=()=>{};vm.runInContext(main.slice(main.indexOf("$('pushToggle').onclick="),main.indexOf('async function pushAction(')),front);headerButton.click();assert.equal(front.document.getElementById('notificationPanel').hidden,false);assert.equal(removedDevices,0);assert.equal(headerButton.getAttribute('aria-expanded'),'true');front.document.getElementById('closeNotifications').click();assert.equal(front.document.getElementById('notificationPanel').hidden,true);await controls.deactivate();assert.equal(removedDevices,1);assert.equal(removedTokens,1);assert.equal(indicator.hidden,true);assert.equal(headerButton.textContent.trim(),'🔔 Avisos');
 console.log('OK: iPhone 16.4/instalación, grupos, baja, bloqueo, sin avisos anteriores, deduplicación, cuentas compartidas, enlace a quedada, colas independientes y correos solo de administración.');
})().catch(error=>{console.error(error);process.exitCode=1;});
