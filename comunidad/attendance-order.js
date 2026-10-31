// Replay an append-only, transaction-ordered history. Existing places are never taken by a later change.
export function allocateAttendance(rows,changes,currentCapacity=0){
 const ops=[...changes].sort((a,b)=>a.seq-b.seq),initial=new Map(),seen=new Set();
 for(const op of ops)if(op.kind!=='capacity'&&!seen.has(op.uid)){seen.add(op.uid);if(op.legacyPeople>0)initial.set(op.uid,op.legacyPeople);}
 for(const row of rows)if(!row.joinedOrder&&!seen.has(row.uid))initial.set(row.uid,1+row.companions);
 let capacity=ops[0]?.limitBefore??currentCapacity,admission=0,movement=null;const parties=new Map();
 for(const [uid,people] of [...initial].sort(([a],[b])=>a.localeCompare(b)))parties.set(uid,{uid,requested:people,confirmed:people,admitted:++admission,waitOrder:0,joinedOrder:0,legacy:true});
 function promote(){let available=capacity?Math.max(0,capacity-[...parties.values()].reduce((n,p)=>n+p.confirmed,0)):Infinity;
  const queue=[...parties.values()].filter(p=>p.requested>p.confirmed).sort((a,b)=>a.waitOrder-b.waitOrder||a.uid.localeCompare(b.uid));
  for(const p of queue){const needed=p.requested-p.confirmed;if(needed<=available){if(!p.confirmed)p.admitted=++admission;p.admittedAt=(typeof movement?.createdAt?.toMillis==='function'?movement.createdAt.toMillis():Date.parse(movement?.createdAt))||0;p.admissionRevision=movement?.seq||0;if(p.waitOrder<(movement?.seq||0)){p.promotionRevision=movement.seq;p.promotionAdded=needed;}p.confirmed=p.requested;p.waitOrder=0;available-=needed;}}
 }
 for(const op of ops){
  movement=op;
  if(op.kind==='capacity')capacity=op.limitAfter;
  else if(op.kind==='leave')parties.delete(op.uid);
  else if(op.kind==='join')parties.set(op.uid,{uid:op.uid,requested:op.people,confirmed:0,admitted:0,waitOrder:op.seq,joinedOrder:op.seq,legacy:false});
  else if(op.kind==='change'){
   const p=parties.get(op.uid);if(!p)throw Error('Falta un movimiento anterior de la lista. Actualiza los eventos.');
   if(op.people>p.requested)p.waitOrder=op.seq;
   p.requested=op.people;p.confirmed=Math.min(p.confirmed,op.people);
   if(p.requested===p.confirmed)p.waitOrder=0;
  }
  promote();
 }
 const confirmed=[...parties.values()].filter(p=>p.confirmed>0).sort((a,b)=>a.admitted-b.admitted||a.uid.localeCompare(b.uid));
 const waiting=[...parties.values()].filter(p=>p.requested>p.confirmed).sort((a,b)=>a.waitOrder-b.waitOrder||a.uid.localeCompare(b.uid));
 return {parties,confirmed,waiting,capacity,used:confirmed.reduce((n,p)=>n+p.confirmed,0),waitingPeople:waiting.reduce((n,p)=>n+p.requested-p.confirmed,0),hasLegacy:confirmed.some(p=>p.legacy)};
}
