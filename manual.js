import * as E from './engine.js';
export const ARTICLES = [
'Late for school', 'Late for school 7', 'Late for 혼정', 'Late for morning exercise', 'Late for court',
'Absent from school', 'Absent from 혼정', 'Violated outdoor regualtion(심신수련)', 'Absent from court',
'Violated cleaning regulation', 'Violated cleaning regulation(택배)', 'Violated computer regulation in School',
'Violated computer regulation in Dorm', 'Violated self-study regulation', 'Violated curfew regulation',
'Dress code in Dorm', 'Dress code in School', 'Violated outdoor regulation', 'Violated food regulation',
"Did not follow teacher's direction in Dorm", "Did not follow teacher's direction", 'Used electronic device',
'Destroyed school property', 'Auditory disturbance', 'Lied in School', 'Lied in Dorm', 'Insolent attitude',
'Violated EOP regulation', 'Did not return school library books'];
export const H = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const articleKey = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
export function candidates(C, query) {
 const q = query.replace(/\s+/g, '').toLowerCase();
 if (!q) return [];
 return [...C.rosterFull].filter(([n,g]) => (n + E.gradeToGisu(g,C.baseDate)).toLowerCase().includes(q) || n.toLowerCase().includes(q));
}
export function personLabel(C, n, grade) {
 const cohort = /\d{2}$/.test(n) ? n.slice(-2) : E.gradeToGisu(grade,C.baseDate);
 return E.baseName(n) + ' ' + cohort + '기 · ' + grade + '학년' + (/[A-C]$/.test(n) ? ' ('+n+')' : '');
}
export function form(prefix) {
 return `<form id="${prefix}-manual" class="manual-form" data-manual="${prefix}">
 <label>피기소자<input id="${prefix}-query" data-manual-query="${prefix}" autocomplete="off" placeholder="이름 검색 (예: 박민서)" data-keep="${prefix}-query" required></label>
 <label>학생 선택<select id="${prefix}-person" data-keep="${prefix}-person" required><option value="">이름을 검색한 뒤 선택해 주세요</option></select></label>
 <label>날짜<input name="date" placeholder="2022.3.1" data-keep="${prefix}-date" required></label>
 <label>기소자<input name="acc" placeholder="기소자 또는 부서" data-keep="${prefix}-acc" required></label>
 <label>기소항목<select name="art" data-keep="${prefix}-art" required><option value="">기소항목 선택</option>${ARTICLES.map(a=>`<option>${H(a)}</option>`).join('')}</select></label>
 <label>벌점 <span class="muted small">벌점표에 없으면 직접 입력</span><input name="pts" type="number" min="0" step="1" placeholder="벌점표 자동 적용" data-keep="${prefix}-pts"></label>
 <button class="primary" type="submit">기소 추가</button><p class="err" id="${prefix}-error" role="alert"></p></form>`;
}
export function updatePicker(prefix,C, preserve = false) {
 const q = document.getElementById(prefix+'-query'), select=document.getElementById(prefix+'-person');
 if (!q || !select) return;
 const old=preserve ? select.value : '';
 const matches=candidates(C,q.value);
 select.innerHTML='<option value="">학생을 선택해 주세요</option>'+matches.map(([n,g])=>`<option value="${H(n)}">${H(personLabel(C,n,g))}</option>`).join('');
 if (matches.some(([n])=>n===old)) select.value=old;
 else if(matches.length===1) select.value=matches[0][0];
}
export function readForm(prefix,C) {
 const el=document.getElementById(prefix+'-manual'), data=new FormData(el);
 const name=document.getElementById(prefix+'-person').value;
 if(!name || !candidates(C,document.getElementById(prefix+'-query').value).some(([n])=>n===name)) throw Error('피기소자를 검색하고 학생을 선택해 주세요.');
 const raw=String(data.get('date')).trim();
 if(!/^202\d\.\d{1,2}\.\d{1,2}$/.test(raw)) throw Error('날짜를 2022.3.1 형식으로 입력해 주세요.');
 const date=E.toDate(raw,C.baseDate); if(!date) throw Error('실제로 존재하는 날짜를 입력해 주세요.');
 const acc=String(data.get('acc')).trim(), chosen=String(data.get('art'));
 if(!acc || !ARTICLES.includes(chosen)) throw Error('기소자와 기소항목을 입력해 주세요.');
 const art=C.articleList.find(a=>articleKey(a)===articleKey(chosen)) || chosen;
 const rawPts=String(data.get('pts')).trim(); const base=C.artPoints.get(art);
 let pts=rawPts!=='' ? Number(rawPts) : typeof base==='number' ? base : Number(C.artDefault.get(art) || String(base??'').split(',')[0]);
 if(rawPts==='' && (base===undefined || base==='')) throw Error('이 항목은 벌점표에 없습니다. 벌점을 직접 입력해 주세요.');
 if(!Number.isFinite(pts) || pts<0 || !Number.isInteger(pts)) throw Error('벌점을 0 이상의 정수로 입력해 주세요.');
 return {name,grade:C.rosterFull.get(name),date,acc,art,pts,src:'직접 입력',file:'직접 입력'};
}
