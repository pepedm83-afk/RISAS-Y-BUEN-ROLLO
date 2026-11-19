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

// Start each list from the places held when the organizer enables separate limits.
export function allocateSeparateAttendance(enrollments, capacities) {
 function allocate(concept) {
  const capacity = capacities[concept];
  const places = enrollments
   .filter(enrollment => enrollment[concept]?.requested > 0)
   .map(enrollment => ({uid: enrollment.uid, ...enrollment[concept]}));
  let used = places.reduce((total, place) => total + place.confirmed, 0);

  // Existing confirmations count first. Then offer free places in request order.
  const queue = places.filter(place => place.requested > place.confirmed)
   .sort((a, b) => a.waitOrder - b.waitOrder || a.uid.localeCompare(b.uid));
  for (const place of queue) {
   const needed = place.requested - place.confirmed;
   if (capacity && used + needed > capacity) continue;
   place.confirmed = place.requested;
   used += needed;
  }

  const confirmed = places.filter(place => place.confirmed > 0);
  const waiting = queue.filter(place => place.requested > place.confirmed);
  return {
   capacity, used, confirmed, waiting,
   waitingPeople: waiting.reduce((total, place) => total + place.requested - place.confirmed, 0),
  };
 }
 return {activity: allocate('activity'), meal: allocate('meal')};
}

// The shared list remains authoritative up to the revision at which it is split.
export function seedSeparateAttendance(rows, sharedAttendance) {
 return rows.map(row => {
  const seat = sharedAttendance.parties.get(row.uid);
  if (!seat) throw Error('Falta una inscripción en el reparto actual. Actualiza la lista antes de separar los aforos.');
  function seed(requested) {
   return {
    requested,
    confirmed: Math.min(requested, seat.confirmed),
    waitOrder: seat.waitOrder,
   };
  }
  return {
   uid: row.uid,
   activity: seed(row.activityPeople ?? (1 + row.companions)),
   meal: seed(row.mealPeople ?? 0),
  };
 });
}

// Replay changes after the split, retaining confirmations independently in each list.
export function replaySeparateAttendance(seed, movements, initialCapacities) {
 let capacities = {...initialCapacities};
 const enrollments = new Map(seed.map(row => [row.uid, row]));
 function promote() {
  const result = allocateSeparateAttendance([...enrollments.values()], capacities);
  for (const concept of ['activity', 'meal']) {
   for (const place of result[concept].confirmed) {
    const row = enrollments.get(place.uid);
    enrollments.set(place.uid, {...row, [concept]: {
     ...row[concept],
     confirmed: place.confirmed,
    }});
   }
  }
  return result;
 }
 let result = promote();
 for (const movement of [...movements].sort((a, b) => a.seq - b.seq)) {
  if (movement.kind === 'capacity') {
   capacities = {...capacities, ...movement.capacities};
  } else if (movement.kind === 'leave') {
   enrollments.delete(movement.uid);
  } else {
   const former = enrollments.get(movement.uid);
   const row = {uid: movement.uid};
   for (const concept of ['activity', 'meal']) {
    const requested = movement[concept];
    const previous = former?.[concept];
    row[concept] = {
     requested,
     confirmed: Math.min(requested, previous?.confirmed ?? 0),
     waitOrder: requested > (previous?.requested ?? 0) ? movement.seq : previous?.waitOrder ?? movement.seq,
    };
   }
   enrollments.set(row.uid, row);
  }
  result = promote();
 }
 return result;
}
