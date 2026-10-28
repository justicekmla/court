/* XLSX input-cell patcher. No workbook recreation or formula evaluation. */
export const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const els=(n,t)=>Array.from(n.getElementsByTagNameNS('*',t));
const child=(n,t)=>Array.from(n.children||[]).find(x=>x.localName===t);
export function xml(s){const d=new DOMParser().parseFromString(s,'application/xml');if(els(d,'parsererror').length)throw Error('엑셀 내부 XML을 읽을 수 없습니다.');return d;}
export const norm=s=>String(s??'').normalize('NFC').trim();
export function colNum(s){return [...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
export function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
const coord=s=>{const m=/^([A-Z]+)(\d+)$/.exec(s);return m?{col:colNum(m[1]),row:+m[2]}:null;};
function bounds(s){const [a,b=a]=s.split(':').map(coord);return a&&b?{r1:a.row,r2:b.row,c1:a.col,c2:b.col}:null;}
const rgbHex=s=>s?.length===8?'#'+s.slice(2).toUpperCase():s?.length===6?'#'+s.toUpperCase():null;
const indexed=['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080'];
function resolveColor(c,theme,index){if(!c)return null;let h=rgbHex(c.getAttribute('rgb'));if(!h&&c.hasAttribute('theme'))h=theme[+c.getAttribute('theme')];if(!h&&c.hasAttribute('indexed'))h=rgbHex(index[+c.getAttribute('indexed')]);if(h&&c.hasAttribute('tint')){const t=+c.getAttribute('tint');h='#'+[1,3,5].map(i=>{const v=parseInt(h.slice(i,i+2),16);return Math.round(t<0?v*(1+t):v*(1-t)+255*t).toString(16).padStart(2,'0');}).join('').toUpperCase();}return h;}
export async function readBook(data,name='파일.xlsx'){
 if(!/\.xlsx$/i.test(name))throw Error('현재 .xlsx 파일만 지원합니다. 엑셀 통합문서(.xlsx)로 저장해 주세요.');
 if(data.byteLength>20*1024*1024)throw Error('파일은 20MB 이하로 올려 주세요.');
 const zip=await JSZip.loadAsync(data);let total=0;
 const read=async p=>{const f=zip.file(p);if(!f)return '';const s=await f.async('string');total+=s.length;if(s.length>18000000||total>65000000)throw Error('파일 내부 데이터가 너무 큽니다.');return s;};
 const wbText=await read('xl/workbook.xml');if(!wbText)throw Error('올바른 XLSX 파일이 아닙니다.');
 const wb=xml(wbText),rel=xml(await read('xl/_rels/workbook.xml.rels'));const relationships=new Map(els(rel,'Relationship').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')]));
 const sharedText=await read('xl/sharedStrings.xml');const shared=sharedText?els(xml(sharedText),'si').map(si=>els(si,'t').map(t=>t.textContent).join('')):[];
 const themeText=await read('xl/theme/theme1.xml');let theme=[];if(themeText){const scheme=els(xml(themeText),'clrScheme')[0];if(scheme){const colors=Array.from(scheme.children).map(x=>{const c=x.firstElementChild;return rgbHex(c?.getAttribute('lastClr')||c?.getAttribute('val'));});theme=[colors[1],colors[0],colors[3],colors[2],...colors.slice(4)];}}
 const styleText=await read('xl/styles.xml');let fills=[],styles=[],dxfColors=[],index=[...indexed];if(styleText){const st=xml(styleText);const ix=els(st,'indexedColors')[0];if(ix)index=Array.from(ix.children).map(c=>c.getAttribute('rgb'));const fillRoot=els(st,'fills')[0];fills=Array.from(fillRoot?.children||[]).map(f=>{const pf=els(f,'patternFill')[0];return pf?.getAttribute('patternType')==='solid'?resolveColor(child(pf,'fgColor'),theme,index):null;});const xf=els(st,'cellXfs')[0];styles=Array.from(xf?.children||[]).map(x=>fills[+x.getAttribute('fillId')]||null);const dx=els(st,'dxfs')[0];dxfColors=Array.from(dx?.children||[]).map(x=>resolveColor(els(x,'fgColor')[0],theme,index));}
 const sheets=[];
 for(const e of els(wb,'sheet')){let target=relationships.get(e.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||e.getAttribute('r:id'));if(!target)continue;let path=target.startsWith('/')?target.slice(1):'xl/'+target;path=path.split('/').reduce((a,v)=>{if(v==='..')a.pop();else if(v!=='.')a.push(v);return a;},[]).join('/');const text=await read(path);const doc=xml(text);const rows=new Map(),cells=new Map();const cols=els(doc,'col').map(c=>({min:+c.getAttribute('min'),max:+c.getAttribute('max'),style:+c.getAttribute('style')}));
  for(const row of els(doc,'row')){const rn=+row.getAttribute('r');const map=new Map();for(const c of Array.from(row.children).filter(c=>c.localName==='c')){const a=coord(c.getAttribute('r'));if(!a)continue;const t=c.getAttribute('t'),v=child(c,'v')?.textContent??'';let value=t==='s'?(shared[+v]??''):t==='inlineStr'?els(c,'t').map(x=>x.textContent).join(''):v;const sn=c.hasAttribute('s')?+c.getAttribute('s'):row.getAttribute('customFormat')==='1'?+row.getAttribute('s'):(cols.find(x=>a.col>=x.min&&a.col<=x.max)?.style||0);const cell={ref:c.getAttribute('r'),row:rn,col:a.col,value,formula:!!child(c,'f'),color:styles[sn]||null,element:c};map.set(a.col,cell);cells.set(cell.ref,cell);}rows.set(rn,map);}
  const merges=els(doc,'mergeCell').map(m=>bounds(m.getAttribute('ref'))).filter(Boolean);const conditional=els(doc,'conditionalFormatting').map(cf=>({ranges:(cf.getAttribute('sqref')||'').split(/\s+/).map(bounds).filter(Boolean),colors:els(cf,'cfRule').map(rule=>dxfColors[+rule.getAttribute('dxfId')]).filter(Boolean)}));
  sheets.push({name:e.getAttribute('name'),hidden:e.getAttribute('state')==='hidden'||e.getAttribute('state')==='veryHidden',path,text,doc,rows,cells,merges,conditional});
 }
 return {zip,wbText,sheets,name,data};
}
export function ledgerInfo(book){const s=book.sheets.find(s=>s.name==='벌점');if(!s)throw Error('누계 파일에서 ‘벌점’ 시트를 찾지 못했습니다.');let header;for(const [r,cs]of s.rows){if([...cs.values()].some(c=>norm(c.value)==='이름')&&[...cs.values()].some(c=>norm(c.value)==='벌점 누계')){header={row:r,cells:cs};break;}}if(!header)throw Error('벌점 시트의 이름·회차 헤더를 확인해 주세요.');const find=t=>[...header.cells.values()].find(c=>norm(c.value)===t)?.col;const nameCol=find('이름'),idCol=find('학번'),classCol=find('학반번')||find('반학번');const rounds=[...header.cells.values()].map(c=>({round:/^(\d+)회$/.exec(norm(c.value))?.[1],col:c.col})).filter(x=>x.round).map(x=>({...x,round:+x.round}));if(!rounds.length||!idCol)throw Error('학번 또는 회차 헤더가 없습니다.');const students=[];for(const [r,cs]of s.rows){if(r<=header.row)continue;const name=norm(cs.get(nameCol)?.value),id=norm(cs.get(idCol)?.value),cl=norm(cs.get(classCol)?.value);if(!name||!/^\d{5,}$/.test(id))continue;students.push({name,id,classNo:cl,grade:/^[123]\d{4}$/.test(cl)?+cl[0]:null,row:r});}if(!students.length)throw Error('누계 파일에 학생 명부가 없습니다.');if(new Set(students.map(s=>s.id)).size!==students.length)throw Error('명부에 중복 학번이 있어 확인이 필요합니다.');const used=rounds.filter(x=>students.some(st=>norm(s.cells.get(colName(x.col)+st.row)?.value)!==''));const last=Math.max(0,...used.map(x=>x.round));return {sheet:s,students,rounds,suggested:rounds.find(x=>x.round>last)?.round||rounds.at(-1).round};}
export function sourceSheets(book){return book.sheets.map(s=>{let header;for(const[r,cs]of s.rows){const vals=[...cs.values()];if(vals.some(c=>/^Name$|^이름$/i.test(norm(c.value)))&&vals.some(c=>/^Points$|^벌점$/i.test(norm(c.value)))){header={row:r,cells:cs};break;}}const absent=/궐석/.test(s.name)||[...s.rows].some(([r,cs])=>r<=6&&[...cs.values()].some(c=>norm(c.value).includes('궐석')));return header?{sheet:s,header,category:absent?'궐석재판':'판결'}:null;}).filter(Boolean);}
// Every detected visible verdict sheet is included, regardless of its tab name.
export function defaultSourceSheets(sources){return sources.filter(s=>!s.sheet.hidden);}
export function palette(sources){const counts=new Map();for(const {sheet,header}of sources)for(const[r,cs]of sheet.rows){if(r<=header.row)continue;for(const c of cs.values())if(c.col<=8&&c.color&&c.color!=='#FFFFFF'&&c.color!=='#000000')counts.set(c.color,(counts.get(c.color)||0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]);}
export const defaultYellows=['#FFFF00','#FFF2CC','#FFEB9C'];
export function extract(sources,excludedColors){const colors=new Set(excludedColors);const blocks=[];for(const {sheet,header}of sources){const find=re=>[...header.cells.values()].find(c=>re.test(norm(c.value)))?.col;const nc=find(/^Name$|^이름$/i),gc=find(/^Grade$|^학년$/i),pc=find(/^Points$|^벌점$/i),sc=find(/^Sum$|^합계$|^선고점수$/i),ac=find(/^Violated Article$|^위반.*|^기소.*$/i),dc=find(/^Date$|^날짜$/i);let block=null;const finish=()=>{if(block){const relevant=block.rows.flatMap(r=>[...r.cells.values()].filter(c=>[nc,gc,pc,sc,ac,dc].includes(c.col)));const flagged=block.rows.map(r=>[...r.cells.values()].filter(c=>c.col<=Math.max(pc,sc||0,ac||0)).some(c=>colors.has(c.color)));block.yellow=flagged.some(Boolean);block.allYellow=flagged.every(Boolean)&&block.rows.every(r=>colors.has(r.cells.get(nc)?.color)||colors.has(r.cells.get(pc)?.color))&&(!block.sumCell||colors.has(block.sumCell.color));block.colors=[...new Set(relevant.map(c=>c.color).filter(Boolean))];block.cfRisk=sheet.conditional.some(cf=>cf.colors.some(c=>colors.has(c))&&cf.ranges.some(b=>block.rows.some(r=>r.row>=b.r1&&r.row<=b.r2)));block.points=block.rows.reduce((n,r)=>{const v=norm(r.cells.get(pc)?.value);return v!==''&&Number.isFinite(+v)?n+(+v):NaN;},0);const sv=norm(block.sumCell?.value);block.sum=sv!==''&&Number.isFinite(+sv)?+sv:null;blocks.push(block);block=null;}};
 for(const[r,cs]of sheet.rows){if(r<=header.row)continue;const name=norm(cs.get(nc)?.value),pt=norm(cs.get(pc)?.value),article=norm(cs.get(ac)?.value);const hasDetails=pt!==''||article!=='';if(name&&hasDetails){finish();block={sheet:sheet.name,start:r,name,grade:norm(cs.get(gc)?.value),rows:[],sumCell:cs.get(sc)};}else if(!hasDetails){finish();continue;}else if(name){finish();continue;}if(!block&&hasDetails)block={sheet:sheet.name,start:r,name:'(이름 없음)',grade:norm(cs.get(gc)?.value),rows:[],sumCell:cs.get(sc)};if(block)block.rows.push({row:r,cells:cs,points:pt,date:norm(cs.get(dc)?.value),article});}
 finish();}
 return blocks;}
export function makeReview(blocks,info,round,policy='sum'){
 const target=info.rounds.find(x=>x.round===+round);if(!target)throw Error('선택한 회차가 누계 파일에 없습니다.');const out=[];
 for(const b of blocks){const names=b.name.split(/[,，\n]+/).map(norm).filter(Boolean);for(const name of names){const candidates=info.students.filter(s=>s.name===name&&(!/^[123]$/.test(b.grade)||s.grade===+b.grade));const student=candidates.length===1?candidates[0]:null;const issues=[];if(b.cfRisk)issues.push('노란색 조건부 서식 확인 필요');if(b.yellow&&!b.allYellow)issues.push('부분 노란색: 제외 범위·최종점수 확인');if(!/^[123]$/.test(b.grade))issues.push('학년 정보 확인');if(!student)issues.push(candidates.length?'동명이인 확인':'학생 매칭 필요');if(!Number.isFinite(b.points))issues.push('항목 점수 형식 확인');if(b.sum===null)issues.push('최종 Sum 없음');if(b.sum!==null&&b.points!==b.sum)issues.push('Points 합과 Sum 다름');const score=policy==='points'?b.points:b.sum;if(!Number.isFinite(score))issues.push('적용 점수 입력 필요');if(score===0)issues.push('0점 입력 시 횟수 증가 확인');const ref=student?colName(target.col)+student.row:'';const old=ref?norm(info.sheet.cells.get(ref)?.value):'';const formula=ref&&info.sheet.cells.get(ref)?.formula;if(formula)issues.push('대상 셀에 수식 있음: 입력 불가');else if(old!=='')issues.push('기존 값 있음: 덮어쓰기 불가');out.push({key:out.length,block:b,name,candidates,student,score:Number.isFinite(score)?score:null,ref,old,issues,excluded:b.allYellow,confirmed:false,note:'',formula});}}
 const signatures=new Map();for(const r of out){const sig=JSON.stringify([r.name,r.block.grade,r.block.rows.map(x=>[x.date,x.article,x.points]),r.block.sum]);if(!signatures.has(sig))signatures.set(sig,[]);signatures.get(sig).push(r);}for(const group of signatures.values())if(group.length>1)for(const r of group)r.issues.push('같은 사건 중복 가능: 원본 비교 필요');
 const byStudent=new Map();for(const r of out)if(r.student&&!r.excluded){const key=r.student.id;if(!byStudent.has(key))byStudent.set(key,[]);byStudent.get(key).push(r);}for(const g of byStudent.values())if(g.length>1)for(const r of g)r.issues.push('한 학생 여러 블록: 합산 여부 확인');return out;
}
export function ready(r){return !r.excluded&&r.student&&r.score!==null&&Number.isFinite(r.score)&&r.score>=0&&(r.score!==0||r.confirmed)&&!r.formula&&r.old===''&&(!r.issues.length||r.confirmed);}
export function directExportPlan(reviews){
 return reviews.map(r=>{
  let reason='';
  if(r.excluded)reason=r.block?.allYellow?'노란색 제외':r.note||'직접 제외';
  else if(!r.student)reason='학생 매칭 불가';
  else if(r.score===null||!Number.isFinite(r.score)||r.score<0)reason='선택한 기준의 유효한 점수 없음';
  else if(r.formula)reason='대상 셀에 수식 있음';
  else if(r.old!=='')reason='해당 회차에 기존 값 있음';
  else if(!r.confirmed&&r.issues.some(i=>/부분 노란색|조건부 서식|같은 사건 중복/.test(i)))reason=r.issues.find(i=>/부분 노란색|조건부 서식|같은 사건 중복/.test(i));
  return {...r,excluded:!!reason,confirmed:true,manualConfirmed:!!r.confirmed,autoApplied:!reason&&!r.confirmed,skipReason:reason};
 });
}
export function patchCell(text,ref,value){if(!Number.isFinite(value)||value<0)throw Error('유효하지 않은 점수입니다.');const tag='(?:[A-Za-z_][\\w.-]*:)?';const re=new RegExp('<('+tag+'c)\\b(?=[^>]*\\br="'+ref+'")[^>]*?(?:/>|>[\\s\\S]*?</\\1>)');const m=re.exec(text);if(m){if(new RegExp('<'+tag+'f\\b').test(m[0]))throw Error(ref+' 셀에 수식이 있어 수정할 수 없습니다.');let open=m[0].match(/^<[^>]+>/)[0].replace(/\s+t="[^"]*"/,'').replace(/\/>$/,'>');const prefix=m[1].includes(':')?m[1].split(':')[0]+':':'';return text.slice(0,m.index)+open+'<'+prefix+'v>'+value+'</'+prefix+'v></'+m[1]+'>'+text.slice(m.index+m[0].length);}
 const rn=coord(ref).row;const rowRe=new RegExp('<('+tag+'row)\\b(?=[^>]*\\br="'+rn+'")[^>]*>[\\s\\S]*?</\\1>');const row=rowRe.exec(text);if(!row)throw Error('학생 행 '+rn+'을 찾을 수 없습니다.');const prefix=row[1].includes(':')?row[1].split(':')[0]+':':'';const cell='<'+prefix+'c r="'+ref+'"><'+prefix+'v>'+value+'</'+prefix+'v></'+prefix+'c>';const cr=new RegExp('<'+tag+'c\\b[^>]*\\br="([A-Z]+)'+rn+'"[^>]*?(?:/>|>[\\s\\S]*?</'+tag+'c>)','g');let insert=row[0].lastIndexOf('</');for(const match of row[0].matchAll(cr))if(colNum(match[1])>coord(ref).col){insert=match.index;break;}return text.slice(0,row.index)+row[0].slice(0,insert)+cell+row[0].slice(insert)+text.slice(row.index+row[0].length);
}
export function formulaTokens(text){return text.match(/<(?:\w+:)?f\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?f>)/g)||[];}
// Compare exact cell XML, not just formulas: headers and adjacent values also
// must survive numeric, text, and newly inserted formula patches unchanged.
export function assertCellPreservation(before,after,allowedRefs){
 const allowed=new Set(allowedRefs),cells=text=>new Map([...text.matchAll(/<((?:[\w.-]+:)?c)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g)].map(m=>[/\br="([A-Z]+\d+)"/.exec(m[0])?.[1],m[0]]).filter(([ref])=>ref));
 const a=cells(before),b=cells(after);
 for(const [ref,xml] of a)if(!allowed.has(ref)&&b.get(ref)!==xml)throw Error('허용하지 않은 셀이 변경되었습니다: '+ref+' (생성·공유 중단)');
 for(const ref of b.keys())if(!a.has(ref)&&!allowed.has(ref))throw Error('허용하지 않은 셀이 추가되었습니다: '+ref);
}
function addFormula(text,ref,formula){
 const patched=patchCell(text,ref,0);
 const pattern=new RegExp('<((?:[\\w.-]+:)?c)\\b(?=[^>]*\\br="'+ref+'")[^>]*>[\\s\\S]*?</\\1>');
 const m=pattern.exec(patched);if(!m)throw Error('상점 입력칸을 찾지 못했습니다: '+ref);
 const prefix=m[1].includes(':')?m[1].split(':')[0]+':':'';
 const encoded=formula.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const cell=m[0].replace(new RegExp('<'+prefix+'v>0</'+prefix+'v>'),()=>'<'+prefix+'f>'+encoded+'</'+prefix+'f>');
 return patched.slice(0,m.index)+cell+patched.slice(m.index+m[0].length);
}
export function extendNonIndictment(book,info,completedRound){
 const sheet=book.sheets.find(s=>s.name==='3회 미기소 상점');
 if(!sheet)return {sheet:null,added:[],text:null};
 const headers=sheet.rows.get(2),columns=new Map();
 for(const c of headers?.values()||[]){const m=/^(\d+)회$/.exec(norm(c.value));if(m)columns.set(+m[1],c.col);}
 if(!columns.has(20)||!columns.has(21)||!columns.has(22))throw Error('3회 미기소 상점의 회차 헤더가 달라 수식 연장을 중단했습니다.');
 const studentById=new Map(info.students.map(s=>[s.id,s]));
 const penaltyColumns=new Map(info.rounds.map(r=>[r.round,r.col]));
 let text=sheet.text;const added=[];
 for(const [row,cells] of sheet.rows){
  const id=norm(cells.get(1)?.value),student=studentById.get(id);if(!student)continue;
  for(let round=22;round<=Math.min(+completedRound,30);round++){
   const column=columns.get(round);if(!column||!columns.has(round-1)||!columns.has(round-2)||!penaltyColumns.has(round)||!penaltyColumns.has(round-2))continue;
   const ref=colName(column)+row,existing=sheet.cells.get(ref);
   if(existing?.formula||norm(existing?.value)!=='')continue;
   // Do not award future blank weeks. Only fill through the completed court round.
   const pr=student.row,start=colName(penaltyColumns.get(round-2))+pr,end=colName(penaltyColumns.get(round))+pr;
   const prev=colName(columns.get(round-1))+row,prev2=colName(columns.get(round-2))+row;
   const formula=`IF(AND(SUM(벌점!${start}:${end})=0,'3회 미기소 상점'!${prev}=0,${prev2}=0),1,0)`;
   added.push({ref,formula,round,row});
  }
 }
 const byRow=new Map();for(const a of added){if(!byRow.has(a.row))byRow.set(a.row,[]);byRow.get(a.row).push(a);}
 text=text.replace(/<((?:[\w.-]+:)?row)\b[^>]*>[\s\S]*?<\/\1>/g,chunk=>{const r=/\br="(\d+)"/.exec(chunk)?.[1];for(const a of byRow.get(+r)||[])chunk=addFormula(chunk,a.ref,a.formula);return chunk;});
 // Every original formula, including shared-formula tokens, must survive in order.
 const original=formulaTokens(sheet.text),after=formulaTokens(text);let cursor=0;
 for(const token of after)if(token===original[cursor])cursor++;
 if(cursor!==original.length||after.length!==original.length+added.length)throw Error('미기소 상점 원본 수식 보존 검증 실패');
 assertCellPreservation(sheet.text,text,added.map(a=>a.ref));xml(text);return {sheet,text,added};
}
export async function exportBook(book,info,reviews,round,{allowEmpty=false}={}){const active=reviews.filter(r=>!r.excluded);if(!active.length&&!allowEmpty)throw Error('반영할 학생이 없습니다.');if(active.some(r=>!ready(r)))throw Error('보류 항목을 확인하거나 제외한 뒤 다시 시도해 주세요.');const groups=new Map();for(const r of active){const ref=colName(info.rounds.find(x=>x.round===+round).col)+r.student.row;if(info.sheet.cells.get(ref)?.formula||norm(info.sheet.cells.get(ref)?.value)!=='')throw Error(ref+'에 기존 값 또는 수식이 있습니다.');const old=groups.get(ref)||0;groups.set(ref,old+r.score);}let text=info.sheet.text;for(const[ref,val]of groups)text=patchCell(text,ref,val);assertCellPreservation(info.sheet.text,text,groups.keys());xml(text);if(JSON.stringify(formulaTokens(text))!==JSON.stringify(formulaTokens(info.sheet.text)))throw Error('수식 보존 검증에 실패했습니다.');const zip=await JSZip.loadAsync(book.data);zip.file(info.sheet.path,text);const bonus=extendNonIndictment(book,info,round);if(bonus.added.length)zip.file(bonus.sheet.path,bonus.text);let wb=book.wbText;if(/<(?:\w+:)?calcPr\b/.test(wb))wb=wb.replace(/<(?:\w+:)?calcPr\b[^>]*\/?\s*>/,tag=>{let t=tag.replace(/\s+(?:fullCalcOnLoad|calcMode)="[^"]*"/g,'');return t.replace(/\/?\s*>$/,end=>' fullCalcOnLoad="1" calcMode="auto"'+end);});else wb=wb.replace(/<\/(?:\w+:)?workbook>/,'<calcPr calcMode="auto" fullCalcOnLoad="1"/>$&');xml(wb);zip.file('xl/workbook.xml',wb);const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const check=await JSZip.loadAsync(bytes);let unchanged=0;for(const p of Object.keys(book.zip.files)){if(book.zip.files[p].dir||p===info.sheet.path||p==='xl/workbook.xml'||(bonus.added.length&&p===bonus.sheet.path))continue;const[a,b]=await Promise.all([book.zip.file(p).async('uint8array'),check.file(p)?.async('uint8array')]);if(!b||a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('원본 구성 보존 실패: '+p);unchanged++;}const outSheet=xml(await check.file(info.sheet.path).async('string'));for(const[ref,v]of groups){const c=els(outSheet,'c').find(c=>c.getAttribute('r')===ref);if(+child(c,'v')?.textContent!==v)throw Error('입력값 검증 실패: '+ref);}if(bonus.added.length){const bonusDoc=xml(await check.file(bonus.sheet.path).async('string'));const byRef=new Map(els(bonusDoc,'c').map(c=>[c.getAttribute('r'),c]));for(const a of bonus.added)if(child(byRef.get(a.ref),'f')?.textContent!==a.formula)throw Error('미기소 수식 결과 검증 실패: '+a.ref);}return {bytes,unchanged,bonusAdded:bonus.added.length,bonusThrough:+round,formulaCount:formulaTokens(text).length,cells:groups.size,total:[...groups.values()].reduce((a,b)=>a+b,0)};}
