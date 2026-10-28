import {colName,ledgerInfo,norm} from './core.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Remove yellow-excluded verdicts before grouping/counting students.
// Keep remaining verdicts together; never infer an ambiguous ledger match.
export function splitReviewers(reviews){const map=new Map();for(const r of reviews){if(r.block.allYellow||(r.excluded&&(r.block.yellow||r.block.cfRisk)))continue;const key=r.student?'id:'+r.student.id:JSON.stringify([r.name,r.block.grade]);if(!map.has(key))map.set(key,{name:r.name,student:r.student,records:[]});map.get(key).records.push(r);}const all=[...map.values()],half=Math.ceil(all.length/2);return [all.slice(0,half),all.slice(half)];}
function cellAt(sheet,row,col){const c=sheet.cells.get(colName(col)+row);if(c&&c.value!=='')return c;const m=sheet.merges.find(m=>row>=m.r1&&row<=m.r2&&col>=m.c1&&col<=m.c2);return m?sheet.cells.get(colName(m.c1)+m.r1):c;}
export function roundView(sheet,round){
 const header=[...sheet.rows].find(([,cells])=>[...cells.values()].some(c=>norm(c.value)==='이름')&&[...cells.values()].some(c=>norm(c.value)===round+'회'));
 if(!header)throw Error(sheet.name+' 시트에서 '+round+'회 열을 찾지 못했습니다.');
 const [headerRow,cells]=header,find=labels=>[...cells.values()].find(c=>labels.includes(norm(c.value)))?.col;
 const id=find(['학번']),name=find(['이름']),classNo=find(['학반번','반학번']),points=find([round+'회']);
 if(!id||!name||!points)throw Error('학번·이름·이번 회차 열을 확인해 주세요.');
 const columns=[{col:id,label:'학번'},...(classNo?[{col:classNo,label:'학반번'}]:[]),{col:name,label:'이름'},{col:points,label:round+'회 '+(sheet.name==='벌점'?'벌점':'상점')}];
 const rows=[...sheet.rows].filter(([row,cs])=>row>headerRow&&/^\d{5,}$/.test(norm(cs.get(id)?.value))&&norm(cs.get(name)?.value)).map(([row])=>row).sort((a,b)=>a-b);
 return {columns,rows,points};
}
export function roundGrid(sheet,view){return `<table class="sheet-grid round-grid"><thead><tr><th>행</th>${view.columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${view.rows.map(row=>`<tr data-sheet-row="${row}"><th>${row}</th>${view.columns.map(({col})=>{const c=cellAt(sheet,row,col),ref=colName(col)+row;return `<td data-cell="${ref}" ${c?.color&&/^#[0-9A-F]{6}$/i.test(c.color)?`style="background:${c.color}"`:''} title="${esc(sheet.name+'!'+ref)}">${c?.formula?'<span class="formula-value">Excel 재계산</span>':esc(c?.value??'')}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;}
export function targetScroll(container,cell){
 const box=container.getBoundingClientRect(),rect=cell.getBoundingClientRect(),header=container.querySelector('thead')?.getBoundingClientRect().height||0;
 const top=container.scrollTop+rect.top-box.top-header-Math.max(0,(container.clientHeight-header-rect.height)/2);
 const left=container.scrollLeft+rect.left-box.left-Math.max(0,(container.clientWidth-rect.width)/2);
 return {top:Math.max(0,Math.min(top,Math.max(0,container.scrollHeight-container.clientHeight))),left:Math.max(0,Math.min(left,Math.max(0,container.scrollWidth-container.clientWidth)))};
}
export function mountCrossCheck({download,complete}){const $=s=>document.querySelector(s),screen=$('#cross-screen');let data,parts,member=0;
 function renderSheet(index){const sheet=data.book.sheets[index];if(!sheet)return;const round=sheet.name==='벌점'?data.round:data.meritRound;try{const view=roundView(sheet,round);$('#cross-ledger').innerHTML=roundGrid(sheet,view);$('#cross-ledger').scrollTop=0;$('#cross-ledger').scrollLeft=0;}catch(e){$('#cross-ledger').textContent=e.message;}}
 function focusStudent(group){
  document.querySelectorAll('.cross-student.selected').forEach(b=>b.classList.remove('selected'));
  if(!group.student){$('#cross-location').textContent=group.name+' · 명부에서 정확히 매칭되지 않아 이동할 수 없습니다. 제외 사유를 확인하세요.';return;}
  try{
   const i=data.book.sheets.findIndex(s=>s.name==='벌점');if(i<0)throw Error('벌점 시트를 찾지 못했습니다.');
   if(+$('#cross-sheet').value!==i){$('#cross-sheet').value=i;renderSheet(i);}
   const info=ledgerInfo(data.book),student=info.students.find(s=>norm(s.id)===norm(group.student.id)),round=info.rounds.find(r=>r.round===+data.round);
   if(!student||!round)throw Error(group.name+' · 해당 학번 또는 '+data.round+'회 입력칸을 찾지 못했습니다.');
   const ref=colName(round.col)+student.row,container=$('#cross-ledger'),cell=container.querySelector(`[data-cell="${ref}"]`);
   document.querySelectorAll('.cross-target,.cross-target-row').forEach(el=>el.classList.remove('cross-target','cross-target-row'));
   if(!cell)throw Error(group.name+' · 입력칸을 표시하지 못했습니다.');
   cell.classList.add('cross-target');cell.parentElement.classList.add('cross-target-row');
   requestAnimationFrame(()=>{container.scrollTo({...targetScroll(container,cell),behavior:'instant'});});
   const actual=info.sheet.cells.get(ref);$('#cross-location').textContent=`${student.name} · ${student.id} · 벌점!${ref} · ${data.round}회: ${actual?.formula?'수식':actual?.value!==undefined&&actual.value!==''?actual.value+'점':'빈칸 (미반영)'}`;
  }catch(e){$('#cross-location').textContent=e.message;}
 }
 function renderMember(n){member=n;$('#cross-split').hidden=false;document.querySelectorAll('[data-member]').forEach(b=>b.classList.toggle('primary',+b.dataset.member===n));const offset=n?parts[0].length:0;$('#cross-range').textContent=`${n?'나머지':'앞'} ${parts[n].length}명 · 전체 ${parts.flat().length}명${parts[n].length?' 중 '+(offset+1)+'–'+(offset+parts[n].length)+'번째':''}`;$('#cross-source').innerHTML='<div class="cross-simple-head"><span>이름</span><span>Sum · 선고된 총점</span></div>'+ (parts[n].map((g,i)=>`<button class="cross-student cross-simple-row" data-person="${i}"><span class="cross-simple-name">${esc(g.name)}</span><strong>${g.records.map(r=>r.block.sum===null||!Number.isFinite(r.block.sum)?'미기재':esc(r.block.sum)+'점').join(' / ')}</strong></button>`).join('')||'<p class="empty">담당할 학생이 없습니다.</p>');$('#cross-source').scrollTop=0;$('#cross-source').querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>{focusStudent(parts[member][+b.dataset.person]);b.classList.add('selected');}));$('#cross-location').textContent='왼쪽에서 학생을 선택하세요.';document.querySelectorAll('.cross-target,.cross-target-row').forEach(el=>el.classList.remove('cross-target','cross-target-row'));}
 $('#cross-back').onclick=()=>{screen.hidden=true;document.querySelector('main').inert=false;document.querySelector('aside').inert=false;document.body.classList.remove('cross-mode');};$('#cross-download').onclick=async()=>{try{await download();}catch(e){$('#cross-complete-status').textContent=e.message;}};$('#cross-complete').onclick=async()=>{const b=$('#cross-complete');b.disabled=true;try{$('#cross-complete-status').textContent=await complete();b.textContent='크로스체크 완료됨';}catch(e){$('#cross-complete-status').textContent=e.message;b.disabled=false;}};$('#cross-sheet').onchange=()=>{renderSheet(+$('#cross-sheet').value);$('#cross-location').textContent='최종 파일의 '+data.book.sheets[+$('#cross-sheet').value].name+' 시트';};document.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>renderMember(+b.dataset.member));
 return {open(input){data=input;parts=splitReviewers(input.reviews);screen.hidden=false;document.querySelector('main').inert=true;document.querySelector('aside').inert=true;document.body.classList.add('cross-mode');$('#cross-split').hidden=true;$('#cross-range').textContent='담당자를 선택하세요.';document.querySelectorAll('[data-member]').forEach(b=>b.classList.remove('primary'));$('#cross-summary').textContent=`${data.round}회 · 총 ${parts.flat().length}명 · 법무부원1 ${parts[0].length}명 / 법무부원2 ${parts[1].length}명 · 노란색 제외 판결은 명단과 Sum에서 제외했습니다.`;$('#cross-sheet').innerHTML=data.book.sheets.map((s,i)=>({s,i})).filter(({s})=>s.name==='벌점'||(data.meritRound&&['상점','상벌점 누계'].includes(s.name))).map(({s,i})=>`<option value="${i}" ${s.name==='벌점'?'selected':''}>${esc(s.name)} · ${s.name==='벌점'?data.round:data.meritRound}회</option>`).join('');renderSheet(+$('#cross-sheet').value);$('#cross-complete').hidden=!input.canComplete;$('#cross-complete').disabled=!!input.completed;$('#cross-complete').textContent=input.completed?'크로스체크 완료됨':'크로스체크 완료';$('#cross-complete-status').textContent=input.completed?'이미 완료한 자료입니다.':'';$('#cross-download').hidden=!input.canDownload;document.querySelectorAll('[data-member]').forEach(b=>b.hidden=input.memberIndex!==null&&input.memberIndex!==undefined);if(input.memberIndex!==null&&input.memberIndex!==undefined)renderMember(input.memberIndex);$('#cross-back').textContent=input.shared?'← 공유 현황으로':'← 누계 화면으로';screen.scrollTop=0;}};
}
