import * as E from './engine.js?v=20261107';
import * as M from './manual.js?v=20261107';
import {readCourtFile,writeEditedCourt} from './courtfile.js?v=semester-20261107-1';
const H=M.H;
// Keep the uploaded workbook and edits together across refreshes in this browser.
const openDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('court-chief-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('work');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function draftDB(value,write=false){const db=await openDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('work',write?'readwrite':'readonly'),s=tx.objectStore('work');let result;const r=write?(value?s.put(value,'current'):s.delete('current')):s.get('current');r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장 취소'));});}finally{db.close();}}
export function createVersion2(api){
 let source=null,buffer=null,rows=[],query='',busy=false,preview=false,loading=true;
 let serial=Promise.resolve();
 const live=()=>E.sortRows(rows.filter(r=>!r.deleted));
 function context(){const refs=api.refs(),map=new Map((refs.roster||[]).map(r=>[r.name,r]));for(const r of source?.rows||[])if(!map.has(r.name))map.set(r.name,{name:r.name,grade:r.grade});return E.makeCtx({...refs,roster:[...map.values()]},api.sunday());}
 function persist(){const value=source?{buffer,source,rows}:null;serial=serial.catch(()=>{}).then(()=>draftDB(value,true));return serial;}
 async function commit(next){busy=true;try{const old=rows;rows=next;try{await persist();}catch(e){rows=old;throw e;}preview=false;api.render();}finally{busy=false;}}
 function deleteResults(){
  if(!source)return '';const C=context();
  const matches=rows.filter(r=>!query||M.personLabel(C,r.name,r.grade).replace(/\s+/g,'').includes(query.replace(/\s+/g,'')));
  const groups=new Map();for(const r of matches){const key=r.name+'|'+r.grade;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  return groups.size?[...groups.values()].map(items=>`<section class="v2-person"><b>${H(M.personLabel(C,items[0].name,items[0].grade))}</b>${items.map(r=>`<div class="v2-charge ${r.deleted?'st-del':''}"><span>${H(E.fmtDate(r.date))} · ${H(r.art)}<br><small>${H(r.accuser)} · ${r.finalPts}점${r.added?' · 직접 추가':''}${r.deleted?' · 삭제됨':''}</small></span><button class="${r.deleted?'ghost':'danger ghost'} small" data-act="${r.deleted?'v2restore':'v2delete'}" data-id="${H(r.id)}">${r.deleted?'되살리기':'삭제'}</button></div>`).join('')}</section>`).join(''):'<p class="muted">검색 결과가 없습니다.</p>';
 }
 function previewHTML(){const info=api.outputInfo?.();return (info?`<h3>Court List ${H(info.listNo)}</h3><p>${H(info.courtDate)} · 담당교사 ${H(info.header.names[0])} · 법무부장 ${H(info.header.names[1])} · 사법위원장 ${H(info.header.names[2])}</p><pre class="fulltext">${H(info.header.notice)}</pre>`:'')+`<div class="tablewrap"><table class="grid"><thead><tr>${['학년','피기소자','날짜','기소자','기소항목','벌점'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${live().map(r=>`<tr><td>${r.grade}</td><td>${H(r.disp)}</td><td>${H(E.fmtDate(r.date))}</td><td>${H(r.accuser)}</td><td>${H(r.art)}</td><td>${r.finalPts}</td></tr>`).join('')}</tbody></table></div>`;}
 function view(){
  if(loading)return '<div class="panel">버전2 작업을 불러오는 중…</div>';
  if(!source)return `<div class="panel narrow"><h2>버전2 · 법정리스트 파일</h2><p class="muted">기존 법정리스트 엑셀을 올려 주세요. 파일을 읽은 뒤 추가·삭제 화면으로 이동합니다.</p>${api.dropZone('v2','법정리스트.xlsx 또는 .xlsm 파일 선택')}<p class="muted small">${busy?'파일을 읽는 중…':''}</p></div>`;
  return `<div class="panel"><div class="head-row"><h2>버전2 · 추가·삭제</h2><span class="grow"></span><button class="danger ghost" data-act="v2remove">파일 삭제</button></div><p><b>${H(source.fileName)}</b> · 원본 ${source.rows.length}건 · 추가 ${rows.filter(r=>r.added&&!r.deleted).length}건 · 삭제 ${rows.filter(r=>r.deleted).length}건 · 최종 ${live().length}건</p><details><summary>파일 다시 첨부</summary><p class="muted">새 파일로 바꾸면 현재 추가·삭제 내역이 초기화됩니다.</p>${api.dropZone('v2','다른 법정리스트 파일 선택')}</details><p class="muted small">파일과 수정 내역은 현재 브라우저에 저장됩니다.</p></div>
  <div class="two v2-split"><section class="panel"><h2>추가하기</h2><p class="muted">피기소자를 검색하고 기수를 선택해 주세요.</p>${M.form('v2')}</section><section class="panel"><h2>삭제하기</h2><label>이름 검색<input id="v2-search" value="${H(query)}" data-keep="v2-search" placeholder="이름 또는 이름+기수"></label><p class="muted small">날짜·기소자·기소항목을 확인해 해당 건만 삭제하세요.</p><div id="v2-results" class="v2-results">${deleteResults()}</div></section></div>
  <div class="panel"><div class="head-row"><h2>최종 취합본</h2><span class="grow"></span><button class="outline" data-act="v2preview">최종 내용 확인</button><button class="primary" data-act="v2download" ${busy||!preview?'disabled':''}>버전2 엑셀 다운로드</button></div><p class="muted">기존 인원 정렬·양식을 적용하고, 기소 3건 이상은 같은 기소항목끼리 모아 나열합니다.</p>${preview?previewHTML():'<p class="muted">추가·삭제를 마친 뒤 최종 내용을 확인해 주세요.</p>'}</div>`;
 }
 async function loadFile(file){if(busy)return;busy=true;try{const next=await file.arrayBuffer(),parsed=await readCourtFile(next,file.name,api.sunday());const baseCtx=E.makeCtx(api.refs(),api.sunday());
 const ambiguous=new Set(parsed.rows.filter(r=>parsed.rows.some(other=>other.name===r.name && other.grade!==r.grade)).map(r=>r.name));
 for(const r of parsed.rows){const found=E.lookup(baseCtx,r.name.replace(/\s+(?=\d{2}$)/,''),r.grade).filter(n=>baseCtx.rosterFull.get(n)===r.grade);if(found.length===1){r.name=found[0];r.disp=E.displayName(baseCtx,r.name);}else if(ambiguous.has(r.name)){r.name=E.baseName(r.name)+E.gradeToGisu(r.grade,api.sunday());r.disp=r.name;}}
 const old={source,buffer,rows};source=parsed;buffer=next;rows=parsed.rows;try{await persist();}catch(e){({source,buffer,rows}=old);throw e;}preview=false;query='';api.toast('법정리스트 '+rows.length+'건을 불러왔습니다.');}catch(e){api.toast('파일을 읽지 못했습니다: '+e.message,7000);}finally{busy=false;api.render();}}
 async function upload(file){if(source)api.confirmBox('파일을 바꿀까요?','현재 추가·삭제 내역이 초기화됩니다.','파일 바꾸기',()=>loadFile(file));else await loadFile(file);}
 async function add(item){if(busy)return;const C=context(),rep=C.reps.has(E.baseName(item.name));await commit(rows.concat({...item,id:api.uid(),disp:item.name,accuser:E.accuser(item.acc),finalPts:item.pts+(rep?1:0),added:true}));api.toast('기소를 추가했습니다.');}
 async function action(act,button){if(busy)return;try{
  if(act==='v2delete'||act==='v2restore')await commit(rows.map(r=>r.id===button.dataset.id?{...r,deleted:act==='v2delete'}:r));
  if(act==='v2preview'){if(api.isSaving?.())throw Error('입력 정보 저장이 끝난 뒤 다시 확인해 주세요.');api.outputInfo?.();preview=true;api.render();}
  if(act==='v2remove')api.confirmBox('파일을 삭제할까요?','버전2 파일과 추가·삭제 내역을 지웁니다.','삭제',async()=>{await serial.catch(()=>{});await draftDB(null,true);source=null;buffer=null;rows=[];query='';preview=false;api.render();});
  if(act==='v2download'&&preview){if(api.isSaving?.())throw Error('입력 정보 저장이 끝난 뒤 다시 눌러 주세요.');busy=true;const blob=await writeEditedCourt(buffer,source,live(),api.outputInfo?.()||null);api.downloadBlob(blob,source.fileName.replace(/\.(xlsx|xlsm)$/i,'')+' 버전2.'+(source.macro?'xlsm':'xlsx'));}
 }catch(e){api.toast('처리하지 못했습니다: '+e.message,7000);}finally{busy=false;}}
 draftDB().then(d=>{if(d){source=d.source;buffer=d.buffer;rows=d.rows;}},e=>api.toast('이 브라우저에서 임시 저장을 사용할 수 없습니다: '+e.message,7000)).finally(()=>{loading=false;api.render();});
 return {view,context,upload,add,action,metadataChanged(){preview=false;},search(value){query=value;const el=document.getElementById('v2-results');if(el)el.innerHTML=deleteResults();}};
}
