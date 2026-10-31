// Personal seat confirmations share the existing five-minute push processor.
// Ignore historical promotions from before this release.
const SEAT_PUSH_SINCE = '2026-10-31T20:32:09.834656+00:00';
function seatEventOpen_(event){return !event.cancelled&&(event.endAt||finalSinHora_(event.start))>Date.now();}
function seatDeadline_(event,seat){return event.paymentWindowHours&&seat.admittedAt?seat.admittedAt+event.paymentWindowHours*3600000:0;}
function appendSeatNotifications_(writes,raw,event,rows,result,revision,token){
  const root=raw.name.slice(0,raw.name.indexOf('/events/')),id=raw.name.split('/').pop(),cursor=firestore_('/events/'+encodeURIComponent(id)+'/seatNotificationState/current',token),processed=cursor?decodeFields_(cursor.fields).revision:0;
  if(processed>=revision)return;
  writes.push(cursor?{verify:cursor.name,currentDocument:{updateTime:cursor.updateTime}}:{verify:raw.name+'/seatNotificationState/current',currentDocument:{exists:false}});
  writes.push({update:{name:raw.name+'/seatNotificationState/current',fields:{revision:encodeValue_(revision)}}});
  if(!seatEventOpen_(event))return;
  for(const seat of result.confirmed){
    if(!seat.promotionRevision||seat.promotionRevision!==seat.admissionRevision||seat.promotionRevision<=processed||seat.admittedAt<Date.parse(SEAT_PUSH_SINCE))continue;
    const noticeId=id+'-'+seat.promotionRevision+'-'+seat.uid;
    const value={eventId:id,uid:seat.uid,promotionRevision:seat.promotionRevision,confirmed:seat.confirmed,added:seat.promotionAdded,occurredAt:new Date(seat.admittedAt).toISOString(),status:'pending',deliveredTo:[]};
    writes.push({update:{name:root+'/seatNotificationQueue/'+noticeId,fields:Object.fromEntries(Object.entries(value).map(([key,value])=>[key,encodeValue_(value)]))},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]});
  }
}
function seatPushPending_(token){
  const result=firestore_(':runQuery',token,{method:'post',contentType:'application/json',payload:JSON.stringify({structuredQuery:{from:[{collectionId:'seatNotificationQueue'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'pending'}}},limit:30}})});
  return result.filter(row=>row.document).map(row=>Object.assign({id:row.document.name.split('/').pop()},decodeFields_(row.document.fields)));
}
function updateSeatQueue_(id,values,token){
  const masks=Object.keys(values).map(key=>'updateMask.fieldPaths='+encodeURIComponent(key)).join('&');
  return firestore_('/seatNotificationQueue/'+encodeURIComponent(id)+'?'+masks,token,{method:'patch',contentType:'application/json',payload:JSON.stringify({fields:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,encodeValue_(value)]))})});
}
function seatRecipients_(devices,queue,blockedIds){
  const unique=new Map(),at=Date.parse(queue.occurredAt);
  for(const device of devices)if(device.uid===queue.uid&&device.enabled&&!blockedIds.has(device.uid)&&device.token&&Date.parse(device.subscribedAt)<=at)unique.set(device.token,device);
  return [...unique.values()];
}
function processSeatPush_(queue,devices,blockedIds,token,deadline){
  const path='/events/'+encodeURIComponent(queue.eventId),raw=firestore_(path,token),event=raw&&decodeFields_(raw.fields);
  if(!event||!seatEventOpen_(event)||Date.now()-Date.parse(queue.occurredAt)>86400000){updateSeatQueue_(queue.id,{status:'skipped'},token);return;}
  const state=firestore_(path+'/attendanceState/current',token),revision=state?decodeFields_(state.fields).revision:0;
  const rows=listDocuments_('events/'+encodeURIComponent(queue.eventId)+'/attendees',token).map(row=>Object.assign({uid:row.id},row)),ops=listDocuments_('events/'+encodeURIComponent(queue.eventId)+'/attendanceChanges',token);
  const latestState=firestore_(path+'/attendanceState/current',token);
  if(ops.length!==revision||(latestState?decodeFields_(latestState.fields).revision:0)!==revision)return;
  const seat=allocateFeedbackSeats_(rows,ops,event.capacity||0).parties.get(queue.uid);
  if(!seat||seat.confirmed<queue.confirmed||seat.admissionRevision!==queue.promotionRevision){updateSeatQueue_(queue.id,{status:'skipped'},token);return;}
  const groupRaw=firestore_('/groups/'+encodeURIComponent(event.group),token),group=groupRaw&&decodeFields_(groupRaw.fields);if(!group?.name){updateSeatQueue_(queue.id,{status:'skipped'},token);return;}
  const until=seatDeadline_(event,seat),paid=!!(event.activityDeposit||event.mealDeposit);
  let body=seat.confirmed===1?'Ya tienes plaza confirmada.':'Tu reserva tiene '+seat.confirmed+' plazas confirmadas.';
  if(paid&&until)body+=' Bizum hasta '+Utilities.formatDate(new Date(until),'Europe/Madrid','dd/MM HH:mm')+'.';else if(paid)body+=' Abre el evento para revisar el Bizum.';
  const delivered=new Set(queue.deliveredTo||[]);
  for(const device of seatRecipients_(devices,queue,blockedIds)){
    if(delivered.has(device.id))continue;if(Date.now()>deadline)return;
    const latestRaw=firestore_('/pushDevices/'+encodeURIComponent(device.id),token),latest=latestRaw&&Object.assign({id:device.id},decodeFields_(latestRaw.fields)),member=latest&&firestore_('/members/'+encodeURIComponent(latest.uid),token);
    if(!latest||member&&decodeFields_(member.fields).blocked||!seatRecipients_([latest],queue,new Set()).length)continue;
    try{const outcome=sendPush_(latest,event,group,queue.eventId,false,{type:'seat-confirmed',notificationId:queue.id,title:'¡Ya tienes plaza! · '+String(event.title).replace(/[\r\n]/g,' ').slice(0,130),body});if(outcome==='expired')disableExpiredPush_(latest,token);delivered.add(device.id);updateSeatQueue_(queue.id,{deliveredTo:[...delivered],lastError:''},token);}catch(error){updateSeatQueue_(queue.id,{lastError:'FCM no ha confirmado el envío. Se reintentará.'},token);return;}
  }
  updateSeatQueue_(queue.id,{status:'sent',deliveredTo:[...delivered]},token);
}
