const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const {allocateAttendance:allocate}=await import('./comunidad/attendance-order.js');
 let seq=0,cap=20;const changes=[];const op=(uid,kind,people=0,extra={})=>changes.push({seq:++seq,uid,kind,people,legacyPeople:0,limitBefore:cap,limitAfter:cap,...extra});
 for(let i=1;i<=20;i++)op('p'+i,'join',1);for(let i=1;i<=10;i++)op('w'+i,'join',1);
 let r=allocate([],changes,20);assert.equal(r.used,20);assert.equal(r.waitingPeople,10);op('p5','leave');r=allocate([],changes,20);assert.equal(r.confirmed.at(-1).uid,'w1');assert.equal(r.waiting[0].uid,'w2');assert.equal(r.confirmed.findIndex(p=>p.uid==='w1'),19);
 const queue=[{seq:1,uid:'a',kind:'join',people:2,limitBefore:3},{seq:2,uid:'b',kind:'join',people:3},{seq:3,uid:'c',kind:'join',people:1}];r=allocate([],queue,3);assert.equal(r.parties.get('b').confirmed,0);assert.equal(r.parties.get('c').confirmed,1);queue.push({seq:4,uid:'a',kind:'leave'},{seq:5,uid:'c',kind:'leave'});r=allocate([],queue,3);assert.equal(r.parties.get('b').confirmed,3);
 const expansion=[{seq:1,uid:'a',kind:'join',people:1,limitBefore:2},{seq:2,uid:'b',kind:'join',people:1},{seq:3,uid:'a',kind:'change',people:3},{seq:4,uid:'c',kind:'join',people:1}];r=allocate([],expansion,2);assert.equal(r.parties.get('a').confirmed,1);assert.equal(r.parties.get('b').confirmed,1);expansion.push({seq:5,uid:'b',kind:'leave'});r=allocate([],expansion,2);assert.equal(r.parties.get('c').confirmed,1);assert.equal(r.parties.get('a').confirmed,1);
 // Increasing capacity cannot displace a previously admitted smaller reservation.
 const growth=[{seq:1,uid:'a',kind:'join',people:3,limitBefore:5},{seq:2,uid:'b',kind:'join',people:3},{seq:3,uid:'c',kind:'join',people:2},{seq:4,uid:'owner',kind:'capacity',limitAfter:6}];r=allocate([],growth,6);assert.equal(r.parties.get('c').confirmed,2);assert.equal(r.parties.get('b').confirmed,0);
 r=allocate([{uid:'old',companions:1}],[],0);assert.equal(r.used,2);assert(r.hasLegacy);
 r=allocate([],[{seq:1,uid:'old',kind:'leave',people:0,legacyPeople:2,limitBefore:0}],0);assert.equal(r.used,0);
 r=allocate([],[{seq:1,uid:'a',kind:'join',people:11,limitBefore:0}],0);assert.equal(r.used,11);
 // Random histories: no duplicate party, no overbooking, and every admissible waiting request is promoted.
 let seed=18237;function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
 for(let trial=0;trial<100;trial++){const ops=[];let result=allocate([],[],10);for(let n=1;n<80;n++){const uid='u'+rand(20),party=result.parties.get(uid),kind=party?(rand(4)?'change':'leave'):'join';ops.push({seq:n,uid,kind,people:kind==='leave'?0:1+rand(5),limitBefore:10});result=allocate([],ops,10);assert(result.used<=10);assert(result.confirmed.every(p=>p.confirmed<=p.requested));const free=10-result.used;assert(result.waiting.every(p=>p.requested-p.confirmed>free));}}
 console.log('OK: 20 plazas, 10 reservas, bajas, primera reserva que cabe, grupos completos, ampliaciones sin perder plaza, aforo ampliado, antiguas y 7.900 movimientos aleatorios.');
})().catch(e=>{console.error(e);process.exit(1)});
