const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-risas',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync('comunidad/firestore.rules','utf8')}});
 try {
 const now=Date.now(),db=env.authenticatedContext('reviewer',{email:'review@example.com',email_verified:true}).firestore();
 await env.withSecurityRulesDisabled(async c=>{
 const d=c.firestore();await setDoc(doc(d,'profiles/reviewer'),{name:'Persona',phone:'+34600000111'});await setDoc(doc(d,'membershipReviews/reviewer'),{active:true,phone:'+34600000111'});
 for(const [id,endAt] of Object.entries({inside:now-23*3600000,expired:now-25*3600000,future:now+3600000,absent:now-3600000,outsider:now-3600000,restored:now-3600000,waitlisted:now-3600000})){
 await setDoc(doc(d,'events',id),{title:id,group:'g',createdBy:'creator',start:new Date(now-48*3600000).toISOString(),endAt,capacity:1});
 if(id!=='outsider')await setDoc(doc(d,'events',id,'attendees/reviewer'),{name:'Persona',joinedOrder:99});
 }
 await setDoc(doc(d,'events/absent/checkins/reviewer'),{present:false});await setDoc(doc(d,'events/restored/checkins/reviewer'),{present:true});
 await setDoc(doc(d,'settings/accountDeletion'),{enabled:true});await setDoc(doc(d,'profiles/deleteTarget'),{name:'Baja'});await setDoc(doc(d,'profiles/creator'),{name:'Creador',phone:'+34600000222'});await setDoc(doc(d,'membershipReviews/creator'),{active:true,phone:'+34600000222'});
 });
 function review(id){const b=writeBatch(db),feedbackId='test-'+id;b.set(doc(db,'eventFeedback',feedbackId),{eventId:id,uid:'reviewer',overall:'Bien',organization:'Bien',venue:'',price:'Adecuado',incident:false,comment:'Prueba',createdAt:serverTimestamp()});b.set(doc(db,'events',id,'feedbackReceipts/reviewer'),{feedbackId,createdAt:serverTimestamp()});return b.commit();}
 await assertSucceeds(review('inside'));await assertFails(review('inside'));await assertFails(review('expired'));await assertFails(review('future'));await assertFails(review('outsider'));await assertFails(review('absent'));await assertSucceeds(review('restored'));await assertSucceeds(review('waitlisted'));
 const creator=env.authenticatedContext('creator',{email:'creator@example.com',email_verified:true}).firestore();await assertSucceeds(setDoc(doc(creator,'events/inside/checkins/reviewer'),{present:false}));await assertFails(setDoc(doc(db,'events/inside/checkins/reviewer'),{present:true}));
 const owner=env.authenticatedContext('owner',{email:'pepedm83@gmail.com',email_verified:true}).firestore();
 const job={uid:'deleteTarget',requestedBy:'owner',kind:'reject',status:'pending',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db,'accountDeletionQueue/deleteTarget'),{...job,requestedBy:'reviewer'}));
 await assertSucceeds(setDoc(doc(owner,'accountDeletionQueue/deleteTarget'),job));
 await assertFails(setDoc(doc(owner,'accountDeletionQueue/deleteTarget'),{...job,status:'done'}));
 await assertFails(setDoc(doc(owner,'accountDeletionQueue/owner'),{...job,uid:'owner'}));
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'grants/creator'),{role:'group',groups:[]});});
 await assertFails(setDoc(doc(owner,'accountDeletionQueue/creator'),{...job,uid:'creator'}));
 console.log('OK: valoración sin confirmación ni elegibilidad; 23h aceptada, 25h y futura rechazadas; ausente bloqueado, desmarcado permitido, creador sin rol administra ausencia, una respuesta por persona.');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exit(1)});
