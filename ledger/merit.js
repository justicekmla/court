import {norm,colName,patchCell,formulaTokens,readBook,assertCellPreservation} from './core.js?v=cellfix-20261028-4';
const clean=s=>norm(s).replace(/\s/g,'');
export function meritTarget(book){
 const candidates=book.sheets.filter(s=>s.name==='상점'||s.name==='상벌점 누계');
 for(const sheet of candidates){for(const [row,cs] of sheet.rows){const vals=[...cs.values()],name=vals.find(c=>clean(c.value)==='이름'),id=vals.find(c=>clean(c.value)==='학번'),cl=vals.find(c=>/^(학반번|반학번)$/.test(clean(c.value)));if(!name||!id)continue;
 const rounds=vals.map(c=>({round:+(/^(\d+)회$/.exec(clean(c.value))?.[1]||0),col:c.col})).filter(r=>r.round);if(!rounds.length)continue;
 const students=[];for(const [rn,rs] of sheet.rows){const sid=norm(rs.get(id.col)?.value),n=norm(rs.get(name.col)?.value),classNo=norm(rs.get(cl?.col)?.value);if(rn>row&&/^\d{5,}$/.test(sid)&&n)students.push({id:sid,name:n,row:rn,grade:/^[123]\d{4}$/.test(classNo)?+classNo[0]:null});}
 if(!students.length||new Set(students.map(s=>s.id)).size!==students.length)throw Error('상점 명부의 학번을 확인해 주세요.');
 const used=rounds.filter(r=>students.some(s=>{const c=sheet.cells.get(colName(r.col)+s.row);return c?.formula||norm(c?.value)!=='';}));const last=Math.max(0,...used.map(r=>r.round));return {sheet,students,rounds,suggested:rounds.find(r=>r.round>last)?.round||rounds.at(-1).round};
 }}throw Error('상점 또는 상벌점 누계 시트에서 학번·이름·회차 헤더를 찾지 못했습니다.');
}
export function meritRecords(book){const records=[];for(const sheet of book.sheets){if(sheet.hidden)continue;let header;for(const [row,cs] of sheet.rows){const cells=[...cs.values()],name=cells.find(c=>/^(학생|이름|학생이름|성명)$/.test(clean(c.value))),score=cells.find(c=>/^심사상점(?:\(pts\))?$/i.test(clean(c.value))),grade=cells.find(c=>clean(c.value)==='학년');if(name&&score){header={row,name:name.col,score:score.col,grade:grade?.col};break;}}
 if(!header)continue;for(const [row,cs] of sheet.rows){if(row<=header.row)continue;const name=norm(cs.get(header.name)?.value),raw=norm(cs.get(header.score)?.value),grade=clean(cs.get(header.grade)?.value);if(!name&&!raw)continue;const score=raw!==''&&Number.isFinite(+raw)&&+raw>=0?+raw:null;records.push({sheet:sheet.name,row,name,grade,score});}}
 if(!records.length)throw Error('학생(이름)과 심사상점 열의 자료를 찾지 못했습니다. 추천상점은 사용하지 않습니다.');return records;}
export function meritPlan(records,target,round){const col=target.rounds.find(r=>r.round===+round)?.col;if(!col)throw Error('상점 반영 회차를 선택하세요.');const groups=new Map(),errors=[],unmatched=[];let expanded=0;
 for(const r of records){const label=`${r.sheet} ${r.row}행 · ${r.name||'이름 없음'}`;if(r.score===null||!r.name){errors.push(label+' — 이름 또는 심사상점 확인 필요');continue;}const name=clean(r.name);let students;
 if(r.studentId){students=target.students.filter(s=>s.id===r.studentId);if(!students.length){errors.push(label+' — 선택한 학번이 명부에 없습니다.');continue;}}
 else if(/^(전교생|전교생전원|전교생전체|전체학생|학생전체)$/.test(name))students=target.students;
 else {const g=/^([123])학년(?:전원|전체)$/.exec(name);if(g)students=target.students.filter(s=>s.grade===+g[1]);else{const grade=/^([123])(?:학년)?$/.exec(r.grade)?.[1];students=target.students.filter(s=>norm(s.name)===norm(r.name)&&(!grade||s.grade===+grade));if(students.length!==1){errors.push(label+' — 이름·학년을 명부와 일치시켜 주세요 (동명이인 또는 미등록)');unmatched.push(r);continue;}}}
 if(!students.length){errors.push(label+' — 대상 학생 없음');continue;}expanded+=students.length;
 for(const s of students){const ref=colName(col)+s.row,cell=target.sheet.cells.get(ref);if(cell?.formula||norm(cell?.value)!==''){errors.push(`${label} — ${s.name} ${ref}에 기존 값/수식이 있습니다. 상점 회차를 확인하세요.`);continue;}const old=groups.get(s.id)||{student:s,ref,score:0,sources:[]};old.score=Math.round((old.score+r.score)*1e8)/1e8;old.sources.push({sheet:r.sheet,row:r.row,score:r.score});groups.set(s.id,old);}}
 return {entries:[...groups.values()],errors:[...new Set(errors)],unmatched,sourceCount:records.length,expanded,round:+round,sheet:target.sheet.name,total:[...groups.values()].reduce((s,r)=>s+r.score,0)};
}
export async function applyMerits(bytes,records,round){const book=await readBook(bytes,'누계.xlsx'),target=meritTarget(book),plan=meritPlan(records,target,round);if(plan.errors.length)throw Error(`상점 ${plan.errors.length}건 확인 필요: ${plan.errors.slice(0,3).join(' / ')}`);let text=target.sheet.text;for(const e of plan.entries)text=patchCell(text,e.ref,e.score);assertCellPreservation(target.sheet.text,text,plan.entries.map(e=>e.ref));if(JSON.stringify(formulaTokens(text))!==JSON.stringify(formulaTokens(target.sheet.text)))throw Error('상점 시트 수식 보존 검사 실패');book.zip.file(target.sheet.path,text);const result=await book.zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const checked=await readBook(result,'누계.xlsx'),out=checked.sheets.find(s=>s.name===target.sheet.name);for(const e of plan.entries)if(+out.cells.get(e.ref)?.value!==e.score)throw Error('상점 입력 검증 실패: '+e.ref);
 // Every other ZIP component must remain byte-identical to the penalty result.
 for(const p of Object.keys(book.zip.files)){if(book.zip.files[p].dir||p===target.sheet.path)continue;const a=await book.zip.file(p).async('uint8array'),b=await checked.zip.file(p).async('uint8array');if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('상점 반영 중 원본 구성 변경: '+p);}
 return {bytes:result,plan};}
