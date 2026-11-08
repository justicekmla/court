import * as E from './engine.js?v=20261107';
import {H} from './manual.js?v=20261107';
export const META_FIELDS=['courtDate','teacher','chief','chair','speechRecipient','contactName','contactPhone','secondContactName','secondContactPhone'];
export function emptyMetadata(){return Object.fromEntries(META_FIELDS.map(key=>[key,'']));}
export function readMetadata(refs,state,sunday){
 const h=refs?.header||{}, oldNames=h.names||[],labels=h.labels||[];
 const nameFor=(label,index)=>oldNames[labels.findIndex(x=>String(x).replace(/\s+/g,'')===label)]??oldNames[index]??'';
 const defaults={...emptyMetadata(),courtDate:E.addDays(sunday,3),teacher:nameFor('담당교사',0),chief:nameFor('법무부장',1),chair:nameFor('사법위원장',2),secondContactName:'선샤인'};
 return {...defaults,...state?.courtMeta,listNo:state?.listNo||1};
}
export function buildNotice(meta){
 const person=meta.speechRecipient||'OOO', name=meta.contactName||'OOO',phone=meta.contactPhone||'010-OOOO-OOOO';
 const second=meta.secondContactName||'선샤인',secondPhone=meta.secondContactPhone||'010-OOOO-OOOO';
 return `▷ Please submit the Final Defending Speech(최후변론) to ${person}, the chair of the Judicial Branch before Tuesday\n9:00 pm. The format is uploaded on the Judicial council's facebook group. Please follow the format.\n▷ If you have any changes to make, please contact ${name}/(${phone}) or ${second}/(${secondPhone})\n▷ All student representatives (Executive, Legislative, Judicial) receive extra penalty points for every violated article.\n▷ Before checking the court list, please check the number table which can help you find where your name is. All\nstudents going to court for two or more violated articles are in the front part of the list.\n<Defendants>`;
}
export function dateLabel(date){const {y,m,d}=E.parts(date);return m+'/'+d+'/'+y;}
export function outputMetadata(refs,state,sunday,{requireDate=false}={}){
 const m=readMetadata(refs,state,sunday);
 if(requireDate&&state?.courtMeta&&!m.courtDate)throw Error('법정 날짜를 입력해 주세요.');
 const legacy=refs?.header||{labels:['담당교사','법무부장','사법위원장'],names:['','',''],notice:''};
 return {listNo:m.listNo,sunday,courtDate:m.courtDate||E.addDays(sunday,3),header:state?.courtMeta?{labels:['담당교사','법무부장','사법위원장'],names:[m.teacher,m.chief,m.chair],notice:buildNotice(m)}:legacy};
}
export function validateMetadataField(name,value){
 value=String(value??'').trim();
 if(name==='listNo'){const n=Number(value);if(!Number.isInteger(n)||n<1)throw Error('법정 회차는 1 이상의 정수로 입력해 주세요.');return n;}
 if(!META_FIELDS.includes(name))throw Error('입력 항목을 확인해 주세요.');
 if(name==='courtDate'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('법정 날짜를 확인해 주세요.');
 if(name==='courtDate'&&value&&!E.toDate(value,value))throw Error('실제로 존재하는 법정 날짜를 입력해 주세요.');
 if(value.length>150)throw Error('입력 내용은 150자 이내로 적어 주세요.');
 return value;
}
export function metadataPanel(meta,{version,rosterCount=0,saving=false}={}){
 const input=(name,label,type='text',placeholder='')=>`<label>${label}<input name="${name}" type="${type}" value="${H(meta[name])}" data-keep="meta-${name}" ${name==='listNo'?'min="1" step="1"':''} placeholder="${H(placeholder)}"></label>`;
 return `<section class="panel court-meta"><div class="head-row"><h2>법정 정보 · 학기 담당자</h2><span class="grow"></span>${version==='1'?`<button class="outline" data-act="rosterStart">재학생 리스트 초기화(추가)하기</button><span class="muted small">현재 ${rosterCount}명</span>`:''}<button class="danger ghost" data-act="resetCourtMeta">입력 정보 초기화</button></div><p class="muted small">변경한 칸에서 이동하면 자동 저장됩니다. 두 버전이 같은 정보를 사용하며 다음 주에도 유지됩니다.</p><form id="court-meta-form"><div class="meta-grid">${input('listNo','제 n회 법정','number')}${input('courtDate','법정 날짜 (엑셀 안내문 맨 위)','date')}${input('teacher','담당교사 이름')}${input('chief','법무부장 이름')}${input('chair','사법위원장 이름')}</div><h3>안내문에 들어갈 이름·연락처</h3><div class="meta-grid">${input('speechRecipient','최후변론서 제출 대상 (사법부위원장)','text','OOO')}${input('contactName','첫 번째 연락 대상 이름','text','OOO')}${input('contactPhone','첫 번째 연락처','tel','010-0000-0000')}${input('secondContactName','두 번째 연락 대상 이름','text','선샤인')}${input('secondContactPhone','두 번째 연락처','tel','010-0000-0000')}</div><button class="primary" type="submit" ${saving?'disabled':''}>입력 내용 저장</button><p class="err" id="meta-error" role="alert"></p><details><summary>엑셀 안내문 미리보기</summary><pre class="fulltext" id="meta-notice">${H((meta.courtDate?dateLabel(meta.courtDate)+'\n':'')+buildNotice(meta))}</pre></details></form></section>`;
}
