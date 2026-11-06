const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('comunidad/index.html','utf8'),source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const row=(id,data)=>({id,ref:{path:'events/'+id},data:()=>data,exists:()=>true});
async function harness(){
 const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.com/comunidad/',runScripts:'outside-only'}),c=dom.getInternalVMContext(),calls=[],owns=new Set();
 let dataset=[],gate=null;const observers=[];
 class Observer{constructor(callback){this.callback=callback;this.stopped=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.stopped=true;}fire(){this.callback([{target:this.target,isIntersecting:true}]);}}
 const ref=(base,...parts)=>({path:[base?.path,...parts].filter(Boolean).join('/')});
 Object.assign(c,{fetch:async()=>({ok:true,json:async()=>({projectId:'demo'})}),initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),onAuthStateChanged:()=>{},IntersectionObserver:Observer,createPushControls:()=>({load:async()=>{}}),setInterval:()=>0,
 collection:ref,doc:ref,collectionGroup:(_,path)=>({path,group:true}),documentId:()=>'__name__',where:(field,op,value)=>({type:'where',field,op,value}),orderBy:(field,direction='asc')=>({type:'order',field,direction}),limit:n=>({type:'limit',n}),startAfter:cursor=>({type:'cursor',cursor}),query:(base,...parts)=>({...base,parts}),
 getDocs:async q=>{
  let docs=[];
  if(q.group){const paths=q.parts.find(p=>p.type==='where').value.map(r=>r.path);docs=[...owns].filter(id=>paths.includes('events/'+id+'/attendees/member')).map(id=>({id:'member',ref:{path:'events/'+id+'/attendees/member'},data:()=>({})}));}
  else {
   assert.equal(q.path,'events');assert.equal(q.parts.find(p=>p.type==='limit').n,10,'Every event page must have a database limit of ten');
   let selected=dataset.filter(e=>q.parts.filter(p=>p.type==='where').every(p=>p.op==='>='?e[p.field]>=p.value:p.op==='<'?e[p.field]<p.value:p.op==='>'?e[p.field]>p.value:e[p.field]===p.value));
   const order=q.parts.find(p=>p.type==='order');selected.sort((a,b)=>(String(a[order.field]).localeCompare(String(b[order.field]))*(order.direction==='desc'?-1:1))||a.id.localeCompare(b.id)*(order.direction==='desc'?-1:1));
   const cursor=q.parts.find(p=>p.type==='cursor');if(cursor){const index=selected.findIndex(e=>e.id===cursor.cursor.id);assert(index>=0);selected=selected.slice(index+1);}
   docs=selected.slice(0,10).map(e=>row(e.id,e));
  }
  calls.push({kind:'query',path:q.path,returned:docs.length,cursor:q.parts.find(p=>p.type==='cursor')?.cursor.id});
  if(gate){const wait=gate;gate=null;await wait;}
  return {docs,size:docs.length};
 },getDoc:async ref=>{calls.push({kind:'document',path:ref.path});const e=dataset.find(e=>ref.path==='events/'+e.id);return e?row(e.id,e):{exists:()=>false,data:()=>undefined};}});
 await vm.runInContext('(async()=>{'+source.replace(/^import.*\n/gm,'')+`\nuser={uid:'member'};groups=[{id:'g',name:'Grupo'},{id:'b',name:'Otro'}];view='all';agendaLayout='list';participant=()=>true;agendaAccess=()=>true;canManageEvent=()=>false;canManageGroups=()=>false;window.api={loadEvents,moreAgenda,selectView,setAgendaLayout,setAgendaListMonth,shiftAgendaMonth,openLinkedEvent,clearAgenda,state:()=>({ids:events.map(e=>e.id),more:agendaHasMore(),mine:[...myEventIds]}),filter:id=>{$('filter').value=id;render();},month:value=>{agendaMonth=value;},account:uid=>{user={uid};generation++;}};})()`,c);
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 return {dom,c,calls,owns,observers,api:dom.window.api,setData:data=>{dataset=data;},blockNext:promise=>{gate=promise;}};
}
const future=(id,group='g',start='2027-12-01T10:00:00Z')=>({id,group,title:id,start,createdBy:'other'});
(async()=>{
 const h=await harness(),{api,calls,dom}=h;h.setData(Array.from({length:25},(_,i)=>future('e'+String(i).padStart(2,'0'),i>=20?'b':'g')));
 await api.loadEvents();assert.equal(calls.length,3);assert.equal(calls.reduce((n,q)=>n+q.returned,0),10);assert.equal(api.state().ids.length,10);assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,10);
 await api.moreAgenda();assert.equal(calls.length,4);assert.equal(calls.at(-1).cursor,'e09');assert.equal(api.state().ids.length,20);
 await api.moreAgenda();assert.equal(calls.length,5);assert.equal(calls.at(-1).cursor,'e19');assert.equal(api.state().ids.length,25);assert.equal(new Set(api.state().ids).size,25);assert(!api.state().more);
 await api.moreAgenda();assert.equal(calls.length,5,'An exhausted stream is never queried again');
 // A filter with matches beyond the first page stays reachable without claiming it is empty.
 await api.loadEvents();api.filter('b');assert.match(dom.window.document.getElementById('events').textContent,/siguiente bloque/);assert(!dom.window.document.getElementById('events').textContent.includes('No hay próximas'));
 await api.moreAgenda();await api.moreAgenda();assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,5);
 // December must be discoverable and directly queryable even when November fills many pages.
 h.setData([...Array.from({length:35},(_,i)=>future('nov'+String(i).padStart(2,'0'),'g','2027-11-10T10:00:00Z')),...Array.from({length:12},(_,i)=>future('dec'+String(i).padStart(2,'0'),'g','2027-12-12T14:00:00Z'))]);
 api.filter('');await api.loadEvents();assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,10);assert(!dom.window.document.querySelector('[data-event-id^="dec"]'));
 // The picker offers December of the current year even if no December event has been loaded.
 assert([...dom.window.document.getElementById('agendaMonthFilter').options].some(o=>o.value===new Date().getUTCFullYear()+'-12'));
 const beforeDecember=calls.length;await api.setAgendaListMonth('2027-12');assert.equal(calls.length,beforeDecember+1);assert.equal(calls.at(-1).returned,10);assert.equal(dom.window.document.querySelectorAll('[data-event-id^="dec"]').length,10);assert(!dom.window.document.querySelector('[data-event-id^="nov"]'));
 await api.moreAgenda();assert.equal(dom.window.document.querySelectorAll('[data-event-id^="dec"]').length,12);const cachedDecember=calls.length;await api.setAgendaListMonth('');await api.setAgendaListMonth('2027-12');assert.equal(calls.length,cachedDecember);await api.setAgendaListMonth('');
 h.setData(Array.from({length:25},(_,i)=>future('e'+String(i).padStart(2,'0'),i>=20?'b':'g')));
 // Own signups are looked up only when explicitly selecting this view, and for new pages.
 await api.loadEvents();h.owns.add('e22');const beforeMine=calls.filter(q=>q.path==='attendees').length;assert.equal(beforeMine,0);
 await api.selectView('mine');assert.equal(calls.filter(q=>q.path==='attendees').length,1);await api.moreAgenda();await api.moreAgenda();assert(api.state().mine.includes('e22'));assert(dom.window.document.querySelector('[data-event-id="e22"]'));
 // A shared link loads one missing event directly, without traversing every page.
 await api.selectView('all');await api.loadEvents();dom.reconfigure({url:'https://example.com/comunidad/?event=e24'});const beforeLink=calls.length;await api.openLinkedEvent();assert.equal(calls.length,beforeLink+1);assert.equal(calls.at(-1).path,'events/e24');assert(dom.window.document.querySelector('[data-event-id="e24"]').open);
 // Month navigation has its own date query and cursor, reused when returning to the month.
 h.setData([...Array.from({length:25},(_,i)=>future('d'+String(i).padStart(2,'0'))),future('jan','g','2028-01-04T10:00:00Z')]);await api.loadEvents();api.month('2027-12');await api.setAgendaLayout('month');await api.moreAgenda();await api.moreAgenda();assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,25);
 await api.shiftAgendaMonth(1);assert(dom.window.document.querySelector('[data-event-id="jan"]'));const beforeReturn=calls.length;await api.shiftAgendaMonth(-1);assert.equal(calls.length,beforeReturn);assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,25);
 // Switching from the December calendar to List must keep December, not fall back to November.
 await api.setAgendaLayout('list');assert.equal(dom.window.document.getElementById('agendaMonthFilter').value,'2027-12');assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,10);assert(!dom.window.document.querySelector('[data-event-id="jan"]'));
 // Scroll loading requests no extra pages before the end is visible, and continues into December.
 await api.setAgendaListMonth('');h.setData([...Array.from({length:25},(_,i)=>future('nov'+String(i).padStart(2,'0'),'g','2027-11-12T10:00:00Z')),future('december','g','2027-12-12T10:00:00Z')]);await api.loadEvents();dom.window.document.getElementById('events').hidden=false;
 const beforeScroll=calls.length,firstObserver=h.observers.at(-1);assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,10);assert(!dom.window.document.querySelector('[data-event-id="december"]'));
 firstObserver.fire();firstObserver.fire();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(calls.length,beforeScroll+1,'Repeated intersection callbacks share a single request');assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,20);
 h.observers.at(-1).fire();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert(dom.window.document.querySelector('[data-event-id="december"]'));assert.equal(dom.window.document.querySelectorAll('[data-event-id]').length,26);
 const afterScroll=calls.length;firstObserver.fire();await new Promise(r=>setImmediate(r));assert.equal(calls.length,afterScroll,'Disconnected markers must never trigger old requests');
 // Recent feedback and long ongoing events have separate cursors; both remain in the data set.
 const now=Date.now(),recent=future('recent','g',new Date(now-36*3600000).toISOString()),ongoing={...future('long','g',new Date(now-20*86400000).toISOString()),endAt:now+86400000};h.setData([future('next'),recent,ongoing]);await api.setAgendaLayout('list');await api.setAgendaListMonth('');await api.loadEvents();assert(api.state().ids.includes('long'));assert(api.state().ids.includes('recent'));
 // A late response from the previous account cannot repopulate the new account's agenda.
 h.setData([future('old')]);let release;h.blockNext(new Promise(resolve=>release=resolve));const oldLoad=api.loadEvents();api.account('new-member');h.setData([future('new')]);await api.loadEvents();release();await oldLoad;assert.deepEqual(Array.from(api.state().ids),['new']);api.clearAgenda();assert.equal(api.state().ids.length,0);
 console.log('OK: real 10-document queries, stable same-date cursors, no repeated pages, group filters, own signups beyond page one, direct links, month cache, recent/ongoing events and stale-account isolation.');
 console.log('MEASUREMENT: 25 future events: initial 3 queries / 10 returned event documents; next page 1 query / 10; final page 1 query / 5. Synthetic data, zero production traffic.');
})().catch(e=>{console.error(e);process.exitCode=1});
