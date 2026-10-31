import {doc,getDoc,setDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import {getMessaging,getToken,deleteToken,isSupported} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging.js';

export function platformHelp(navigatorValue,standalone){
  const ios=/iPad|iPhone|iPod/.test(navigatorValue.userAgent)||(navigatorValue.platform==='MacIntel'&&navigatorValue.maxTouchPoints>1);
  const version=/OS (\d+)_(\d+)/.exec(navigatorValue.userAgent);
  const old=ios&&version&&(Number(version[1])<16||(Number(version[1])===16&&Number(version[2])<4));
  if(old)return {blocked:true,text:'Tu iPhone o iPad necesita iOS/iPadOS 16.4 o posterior. Actualízalo para recibir avisos.'};
  if(ios&&!standalone)return {blocked:true,text:'En iPhone necesitas iOS 16.4 o posterior. En Safari, pulsa Compartir → Añadir a la pantalla de inicio. Abre la app desde su icono y vuelve a Activar avisos.'};
  return {blocked:false,text:ios?'iPhone: iOS 16.4 o posterior, app añadida a la pantalla de inicio y permiso de notificaciones.':'Android y ordenador: usa un navegador compatible y acepta el permiso de notificaciones. En Android puedes instalar la app desde el menú de Chrome.'};
}

export function createPushControls(app,db,context){
  const $=id=>document.getElementById(id),recordKey='community-push-device';
  let config=null,supported=false,registration=null,messaging=null,currentRecord=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const selection=()=>[...$('pushGroupChoices').querySelectorAll('input:checked')].map(i=>i.value);
  const toggle=enabled=>{$('pushToggle').dataset.enabled=String(enabled);$('pushIndicator').hidden=!enabled;$('pushToggle').setAttribute('aria-label',enabled?'Avisos: activados en este dispositivo':'Avisos: desactivados en este dispositivo');$('pushToggle').title=enabled?'Avisos activados. Pulsa para configurar o desactivar.':'Pulsa para activar o configurar los avisos.';};
  const status=text=>{$('pushStatus').textContent=text;};
  const readRecord=()=>{try{return JSON.parse(localStorage.getItem(recordKey)||'null');}catch{return null;}};
  const remember=record=>{localStorage.setItem(recordKey,JSON.stringify(record));currentRecord=record;};
  async function worker(){
    if(!registration)registration=await navigator.serviceWorker.register('./push-sw.js',{scope:'./'});
    if(!registration.active)await new Promise((resolve,reject)=>{
      const sw=registration.installing||registration.waiting;
      if(!sw)return reject(Error('Vuelve a abrir la app para activar los avisos.'));
      const timeout=setTimeout(()=>reject(Error('No se pudo preparar el aviso. Inténtalo de nuevo.')),15000);
      sw.addEventListener('statechange',()=>{if(sw.state==='activated'){clearTimeout(timeout);resolve();}else if(sw.state==='redundant'){clearTimeout(timeout);reject(Error('No se pudo preparar el aviso.'));}});
    });
    return registration;
  }
  async function setWorkerState(uid,enabled){
    const reg=await worker();
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timeout=setTimeout(()=>reject(Error('No se pudo guardar el estado de los avisos.')),5000);
      channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();e.data?.ok?resolve():reject(Error('No se pudo guardar el estado de los avisos.'));};
      reg.active.postMessage({type:'PUSH_ACCOUNT',uid,enabled},[channel.port2]);
    });
  }
  async function load(){
    const user=context.getUser();if(!context.verified())return;
    const help=platformHelp(navigator,standalone());$('pushHelp').textContent=help.text;
    const admin=context.isAdmin();$('adminEmailInfo').hidden=!admin;
    const assigned=context.getAssignedGroups();
    let preferences=null;
    try{
      if(!config){const response=await fetch('./push-config.json',{cache:'no-store'});if(!response.ok)throw Error();config=await response.json();}
      supported=await isSupported();
      const record=readRecord();
      if(record&&record.uid===user.uid){preferences=(await getDoc(doc(db,'pushDevices',record.id))).data()||null;currentRecord=record;}
      // On shared devices, messages for a previous account must never display.
      if(record&&supported)await setWorkerState(user.uid,!!preferences?.enabled&&Notification.permission==='granted');
    }catch{status('No se han podido cargar los avisos. Abre los avisos de la parte superior para intentarlo de nuevo.');}
    if(context.getUser()?.uid!==user.uid)return;
    $('pushGroupChoices').replaceChildren(...context.getGroups().map(group=>{
      const label=document.createElement('label');label.className='email-choice';
      const input=document.createElement('input');input.type='checkbox';input.value=group.id;
      input.checked=preferences?(preferences.groups||[]).includes(group.id):assigned.includes(group.id);
      label.append(input,document.createTextNode(group.name));return label;
    }));
    toggle(!!preferences?.enabled&&supported&&Notification.permission==='granted');
    const ready=config?.enabled===true&&/^[A-Za-z0-9_-]{87}$/.test(config.vapidKey||'');
    $('enablePush').disabled=!ready||help.blocked||!supported;
    $('enablePush').textContent=preferences?.enabled?'Guardar grupos de este dispositivo':'Activar avisos en este dispositivo';
    $('disablePush').hidden=!preferences?.enabled;
    if(!ready)status('Los avisos al móvil todavía no están disponibles. Aquí podrás activarlos cuando estén preparados.');
    else if(help.blocked)status(help.text);
    else if(!supported)status('Este navegador no permite estos avisos. Prueba con Safari en la app instalada en iPhone, o Chrome en Android.');
    else if(Notification.permission==='denied')status('Las notificaciones están bloqueadas. Permítelas en los ajustes del navegador o del teléfono y vuelve aquí.');
    else status(preferences?.enabled?'Avisos activados en este dispositivo para los grupos seleccionados.':'Elige tus grupos y pulsa Activar avisos. Recibirás nuevas quedadas de esos grupos y avisos cuando tus reservas consigan plaza.');
  }
  async function activate(){
    const user=context.getUser(),groups=selection();
    if(!context.verified())throw Error('Entra y verifica tu correo antes de activar los avisos.');
    if(!config?.enabled||!config.vapidKey)throw Error('Los avisos al móvil todavía no están disponibles.');
    if(platformHelp(navigator,standalone()).blocked||!supported)throw Error($('pushHelp').textContent);
    if(!groups.length)throw Error('Elige al menos un grupo.');
    // Called directly from the button gesture: required for iPhone permission.
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw Error('No has permitido las notificaciones. Puedes activarlas más adelante en los ajustes.');
    const reg=await worker();messaging=messaging||getMessaging(app);
    const token=await getToken(messaging,{vapidKey:config.vapidKey,serviceWorkerRegistration:reg});
    if(!token)throw Error('No se ha podido registrar este dispositivo. Inténtalo de nuevo.');
    if(context.getUser()?.uid!==user.uid)throw Error('Tu cuenta ha cambiado. Abre los avisos de la parte superior.');
    const bytes=new TextEncoder().encode(token),digest=await crypto.subtle.digest('SHA-256',bytes);
    const id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const ref=doc(db,'pushDevices',id),previous=(await getDoc(ref)).data();
    const same=previous?.uid===user.uid&&previous.enabled===true&&JSON.stringify(previous.groups)===JSON.stringify(groups);
    await setDoc(ref,{uid:user.uid,token,enabled:true,groups,subscribedAt:same?previous.subscribedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    remember({uid:user.uid,id});await setWorkerState(user.uid,true);
    toggle(true);$('disablePush').hidden=false;$('enablePush').textContent='Guardar grupos de este dispositivo';
    status('Avisos activados en este dispositivo. Al tocar una notificación se abrirá la quedada.');
  }
  async function deactivate(){
    const record=currentRecord||readRecord(),user=context.getUser();
    // Stop display first, including if a later server write fails.
    if('serviceWorker' in navigator&&supported)await setWorkerState(user?.uid||'',false);
    if(record?.uid===user?.uid)await deleteDoc(doc(db,'pushDevices',record.id));
    if(supported){messaging=messaging||getMessaging(app);await deleteToken(messaging);}
    localStorage.removeItem(recordKey);currentRecord=null;
    toggle(false);$('disablePush').hidden=true;$('enablePush').textContent='Activar avisos en este dispositivo';
    status('Avisos desactivados en este dispositivo.');
  }
  async function beforeLogout(){if(currentRecord||readRecord())await deactivate();}
  return {load,activate,deactivate,beforeLogout};
}
