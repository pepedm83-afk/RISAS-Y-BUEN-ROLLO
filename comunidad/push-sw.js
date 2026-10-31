// This worker is scoped only to /comunidad/. It never caches or redirects agendas.
const STORE='community-push-state',ROOT=new URL('./',self.location.href);
function stateStore(mode,operation){return new Promise((resolve,reject)=>{
  const open=indexedDB.open(STORE,1);
  open.onupgradeneeded=()=>open.result.createObjectStore('state');
  open.onerror=()=>reject(Error('Storage unavailable'));
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('state',mode),request=operation(tx.objectStore('state'));
    tx.oncomplete=()=>{const value=request.result;db.close();resolve(value);};tx.onerror=()=>{db.close();reject(Error('Storage unavailable'));};};
});}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='PUSH_ACCOUNT')return;
  const uid=typeof event.data.uid==='string'?event.data.uid:'',enabled=event.data.enabled===true;
  event.waitUntil(stateStore('readwrite',store=>store.put({uid,enabled},'account')).then(()=>event.ports[0]?.postMessage({ok:true})).catch(()=>event.ports[0]?.postMessage({ok:false})));
});
function safeEventURL(eventId){if(!/^[A-Za-z0-9_-]{1,128}$/.test(eventId||''))return null;const url=new URL(ROOT);url.searchParams.set('event',eventId);return url.href;}
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let data;try{data=event.data.json().data;}catch{return;}
  if(!data||!['new-event','seat-confirmed'].includes(data.type))return;if(data.type==='seat-confirmed'&&!/^[A-Za-z0-9_-]{1,300}$/.test(data.notificationId||''))return;
  const account=await stateStore('readonly',store=>store.get('account'));
  if(!account?.enabled||account.uid!==data.uid)return;
  const url=safeEventURL(data.eventId);if(!url)return;
  const key=data.type==='seat-confirmed'?data.uid+'|seat|'+data.notificationId:data.uid+'|'+data.eventId,receipts=await stateStore('readonly',store=>store.get('receipts'))||[];
  if(receipts.includes(key))return;
  await self.registration.showNotification(String(data.title||'Nueva quedada').slice(0,180),{
    body:String(data.body||'Hay una nueva quedada en uno de tus grupos.').slice(0,240),
    icon:new URL('icon-gold-192.png',ROOT).href,tag:data.type==='seat-confirmed'?'plaza-'+data.notificationId:'quedada-'+data.eventId,data:{url},renotify:false
  });
  await stateStore('readwrite',store=>store.put([...receipts,key].slice(-500),'receipts'));
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const candidate=new URL(event.notification.data?.url||ROOT.href);
    if(candidate.origin!==ROOT.origin||candidate.pathname!==ROOT.pathname)return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){const current=new URL(client.url);if(current.origin===ROOT.origin&&current.pathname===ROOT.pathname){await client.navigate(candidate.href);await client.focus();return;}}
    await self.clients.openWindow(candidate.href);
  })());
});
