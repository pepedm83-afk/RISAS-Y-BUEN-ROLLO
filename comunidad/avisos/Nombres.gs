// One-time maintenance of normalized display-name reservations. No accounts or reservations are renamed or removed.
function canonicalNameKey_(name){return encodeURIComponent(String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es')).replace(/\./g,'%2E');}
function existingNameBuckets_(profiles){
  const buckets=new Map();for(const raw of profiles){const p=decodeFields_(raw.fields||{});if(!p.name)continue;const uid=raw.name.split('/').pop(),key=canonicalNameKey_(p.name);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({uid,name:p.name,raw});}return buckets;
}
function rawNameProfiles_(token){
  const rows=[];let page='';do{const result=firestore_('/profiles?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),token);rows.push(...(result.documents||[]));page=result.nextPageToken||'';}while(page);return rows;
}
function comprobarNombresExistentes(){senderGuard_();const buckets=existingNameBuckets_(rawNameProfiles_(firebaseToken_()));console.log('Nombres revisados: '+[...buckets.values()].reduce((n,b)=>n+b.length,0)+'. Grupos de nombres equivalentes: '+[...buckets.values()].filter(b=>b.length>1).length+'. No se han modificado datos.');}
function protegerNombresExistentes(){
  senderGuard_();const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('Hay otro proceso activo. Vuelve a intentarlo.');
  try{
    const token=firebaseToken_(),buckets=existingNameBuckets_(rawNameProfiles_(token));let protectedCount=0,conflicts=0;
    for(const [key,people] of buckets){
      const path='/nameClaims/'+encodeURIComponent(key),claim=firestore_(path,token),owner=claim&&decodeFields_(claim.fields).uid;
      if(people.length>1)conflicts+=people.length-1;
      // Existing unaccented reservations keep their owner. Never choose an arbitrary replacement name.
      if(people.some(p=>p.uid===owner)){protectedCount++;continue;}
      const winner=[...people].sort((a,b)=>a.uid.localeCompare(b.uid))[0],root=winner.raw.name.slice(0,winner.raw.name.indexOf('/profiles/'));
      const writes=people.map(p=>({verify:p.raw.name,currentDocument:{updateTime:p.raw.updateTime}}));
      writes.push({update:{name:root+'/nameClaims/'+key,fields:{uid:encodeValue_(winner.uid)}},currentDocument:claim?{updateTime:claim.updateTime}:{exists:false}});
      firestore_(':commit',token,{method:'post',contentType:'application/json',payload:JSON.stringify({writes})});protectedCount++;
    }
    console.log('Protección completada: '+protectedCount+' nombres normalizados. '+conflicts+' cuentas deberán diferenciar su nombre al entrar. No se han borrado cuentas ni reservas.');
  }finally{lock.releaseLock();}
}
