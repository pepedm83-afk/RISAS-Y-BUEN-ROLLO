const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('comunidad/index.html','utf8');
const ctx={Date,Intl,Number,user:{uid:'admin'},canManageGroups:()=>true,db:{},doc:(_,c,id)=>id};vm.createContext(ctx);
for(const name of ['localStart','madridISO'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],ctx);
vm.runInContext(html.slice(html.indexOf('function defaultEventEnd('),html.indexOf('function eventFinished(')),ctx);
(async()=>{
for(const [start,end] of [
 ['2026-11-07T20:00:00Z','2026-11-07T23:00:00Z'],
 ['2026-03-29T00:30:00Z','2026-03-29T22:00:00Z'],
 ['2026-10-25T00:30:00Z','2026-10-25T23:00:00Z'],
 ['2026-12-31T21:00:00Z','2026-12-31T23:00:00Z'],
 ['2026-11-07T23:30:00Z','2026-11-08T23:00:00Z']])assert.equal(ctx.savedEventEnd(start,''),Date.parse(end));
assert.equal(ctx.savedEventEnd('2026-11-07T20:00:00Z','2026-11-08T02:30'),Date.parse('2026-11-08T01:30:00Z'));
const rows=[{id:'missing',start:'2026-11-07T20:00:00Z'},{id:'zero',start:'2026-11-07T20:00:00Z',endAt:0},{id:'explicit',endAt:123},{id:'cancelled',cancelled:true},{id:'changed',start:'2026-11-07T20:00:00Z'},{id:'deleted'}],calls=[],writes=[];
ctx.runTransaction=async(_,fn)=>fn({get:async id=>{calls.push(id);return {exists:()=>id!=='deleted',data:()=>id==='changed'?{start:'2026-11-07T20:00:00Z',endAt:456}:{start:'2026-11-07T20:00:00Z'}}},update:(id,d)=>writes.push({id,...d})});
ctx.canManageGroups=()=>false;await ctx.completeMissingEventEnds(rows);assert.equal(calls.length,0);
ctx.canManageGroups=()=>true;await ctx.completeMissingEventEnds(rows);assert.equal(writes.length,2);assert.equal(rows[0].endAt,Date.parse('2026-11-07T23:00:00Z'));assert.equal(rows[1].endAt,rows[0].endAt);assert.equal(rows[4].endAt,456);assert.equal(rows[2].endAt,123);
await ctx.completeMissingEventEnds(rows.slice(0,5));assert.equal(writes.length,2);
assert(html.includes('values.endAt=savedEventEnd(values.start,values.end)'));assert(!html.includes('values.endAt=values.end?Date.parse(madridISO(values.end)):0;'));
console.log('OK: cierre Madrid, cambios de hora, año nuevo, inicio tras medianoche, cierre explícito y reparación idempotente con lectura transaccional, sin permisos ni documentos borrados recreados.');
})().catch(e=>{console.error(e);process.exit(1)});
