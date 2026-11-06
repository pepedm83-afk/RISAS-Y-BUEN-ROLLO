const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('comunidad/index.html','utf8'),source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
(async()=>{
 const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.com/comunidad/?event=e25',runScripts:'outside-only'}),c=dom.getInternalVMContext();
 Object.assign(c,{fetch:async()=>({ok:true,json:async()=>({projectId:'demo'})}),initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),onAuthStateChanged:()=>{},createPushControls:()=>({load:async()=>{}}),setInterval:()=>0});
 await vm.runInContext('(async()=>{'+source.replace(/^import.*\n/gm,'')+`
 user={uid:'test'}; groups=[{id:'g',name:'Test'}];events=Array.from({length:30},(_,i)=>({id:'e'+i,group:'g',title:'Evento '+i,start:'2027-12-01T10:00:00Z',location:'Valencia',createdBy:'other'}));view='all';agendaLayout='list';agendaVisibleLimit=10;
 participant=()=>true;agendaAccess=()=>true;canManageEvent=()=>false;canManageGroups=()=>false;
 window.calls=0;loadCardCounts=async()=>{throw Error('Automatic counts must not run');};loadMyAttendance=async()=>{throw Error('Automatic personal lookups must not run');};attendance=async(e,host)=>{window.calls++;host.textContent='Asistentes cargados';};
 render();window.openLinked=openLinkedEvent;
 })()`,c);
 const d=dom.window.document;assert.equal(d.querySelectorAll('details[data-event-id]').length,10);assert.equal(d.querySelectorAll('summary button,[data-count-event],[data-attendance-event]').length,0);assert.equal(dom.window.calls,0);
 const inner=[...d.querySelectorAll('button')].find(b=>b.textContent==='Ver asistentes / apuntarme');inner.click();await new Promise(r=>setImmediate(r));assert.equal(dom.window.calls,1);
 [...d.querySelectorAll('button')].find(b=>b.textContent==='Ver más quedadas').click();assert.equal(d.querySelectorAll('details[data-event-id]').length,20);assert.equal(dom.window.calls,1);
 for(const node of d.querySelectorAll('details'))node.scrollIntoView=()=>{};
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};await dom.window.openLinked();assert(d.querySelector('[data-event-id="e25"]').open);assert.equal(dom.window.calls,1);
 console.log('OK: diez tarjetas sin consultas automáticas de asistencia, lista bajo demanda, más tarjetas y enlace fuera del primer bloque.');
})().catch(e=>{console.error(e);process.exitCode=1});
