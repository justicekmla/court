import {FIREBASE_CONFIG} from '../store.js';
import {createLedgerService} from './ledger-service.js?v=cellfix-20261028-4';
const FB='https://www.gstatic.com/firebasejs/10.12.2/';
let servicePromise;
if(new URLSearchParams(location.search).has('test')) {
  const note=document.querySelector('.role-note');
  if(note)note.textContent='시험 모드: 이 브라우저의 여러 탭에서만 공유합니다. 실제 Firebase에는 저장하지 않습니다.';
}
async function firebaseTransport() {
  const [A,F,U]=await Promise.all([import(FB+'firebase-app.js'),import(FB+'firebase-firestore.js'),import(FB+'firebase-auth.js')]);
  const app=A.getApps()[0]||A.initializeApp(FIREBASE_CONFIG),db=F.getFirestore(app),auth=U.getAuth(app);
  await auth.authStateReady();
  if(!auth.currentUser)throw Error('먼저 법정리스트 처음 화면에서 공용 계정으로 로그인한 뒤 누계 버튼을 눌러 주세요.');
  const ref=key=>F.doc(db,...key.split('/'));
  const copy=value=>JSON.parse(JSON.stringify(value));
  return {
    async get(key) {if(!auth.currentUser)throw Error('로그인이 만료되었습니다. 처음 화면에서 로그인해 주세요.');const doc=await F.getDoc(ref(key));return doc.exists()?doc.data():null;},
    async setMany(entries) {const b=F.writeBatch(db);for(const [key,value] of entries)b.set(ref(key),copy(value));await b.commit();},
    async removeMany(keys) {const b=F.writeBatch(db);for(const key of keys)b.delete(ref(key));await b.commit();},
    async transact(key,update) {return F.runTransaction(db,async tx=>{const doc=await tx.get(ref(key)),value=update(doc.exists()?doc.data():null);tx.set(ref(key),copy(value));return value;});},
  };
}
// Explicit test mode: only this browser's IndexedDB, never production Firebase.
async function testTransport() {
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('court-ledger-test',1);req.onupgradeneeded=()=>req.result.createObjectStore('docs');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  function transact(key,update) {return new Promise((resolve,reject)=>{const tx=db.transaction('docs','readwrite'),s=tx.objectStore('docs'),req=s.get(key);let value;req.onsuccess=()=>{try{value=update(req.result||null);s.put(value,key);}catch(e){reject(e);tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장 작업이 취소되었습니다.'));});}
  function many(entries,remove=false) {return new Promise((resolve,reject)=>{const tx=db.transaction('docs','readwrite'),s=tx.objectStore('docs');for(const [key,value] of entries)remove?s.delete(key):s.put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  return {get:key=>new Promise((resolve,reject)=>{const req=db.transaction('docs').objectStore('docs').get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);}),setMany:many,removeMany:keys=>many(keys.map(k=>[k]),true),transact};
}
export async function api(path,options) {
  try {
    if(!servicePromise)servicePromise=(new URLSearchParams(location.search).has('test')?testTransport():firebaseTransport()).then(store=>createLedgerService(store));
    return await (await servicePromise)(path,options);
  }catch(e) {
    if(e?.code==='permission-denied')throw Error('기존 Firebase 보안 규칙에서 누계 공유 경로 접근이 거부되었습니다. 관리자에게 누계용 규칙 적용을 요청하세요.');
    throw e;
  }
}
