import {norm,colName,patchCell,formulaTokens,readBook,assertCellPreservation} from './core.js?v=cellfix-20261028-4';
const clean=s=>norm(s).normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g,'');
export function meritDate(value){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
 if(!m)throw Error('상점 반영 날짜를 선택하세요.');
 const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 if(date.getUTCFullYear()!==+m[1]||date.getUTCMonth()+1!==+m[2]||date.getUTCDate()!==+m[3])throw Error('올바른 상점 반영 날짜를 선택하세요.');
 return `${m[1]}.${+m[2]}.${+m[3]}`;
}
export function meritGroup(name,grade){
 const n=clean(name).replace(/[()（）]/g,''),g=clean(grade).replace(/(?:전체|전원|모두|학생)/g,'');
 if(/^(?:전교생|전학년|전체학년|전체학생|학생전체|모든학생)(?:전체|전원|모두)?$/.test(n))return [1,2,3];
 if(/^(?:전체|전원|모두)$/.test(n)){const m=/^([123])(?:학년)?$/.exec(g);return m?[+m[1]]:[1,2,3];}
 const m=/^([123](?:[,·ㆍ/및와과][123])*)학년(?:전체|전원|모두|학생)?$/.exec(n);
 return m?[...new Set(m[1].match(/[123]/g).map(Number))]:null;
}
function patchDate(text,ref,date){
 // Ensure a first row exists before using the same cell-preserving patcher.
 if(!/<(?:[\w.-]+:)?row\b[^>]*\br="1"/.test(text))text=text.replace(/<((?:[\w.-]+:)?sheetData)\b[^>]*>/,open=>{const prefix=/^<([\w.-]+:)/.exec(open)?.[1]||'';return open+`<${prefix}row r="1"></${prefix}row>`;});
 let out=patchCell(text,ref,0);
 const re=new RegExp('<((?:[\\w.-]+:)?c)\\b(?=[^>]*\\br="'+ref+'")[^>]*>[\\s\\S]*?</\\1>');
 return out.replace(re,cell=>{const tag=/^<([^\s>]+)/.exec(cell)[1],prefix=tag.includes(':')?tag.split(':')[0]+':':'';return cell.replace(/^<[^>]+>/,open=>open.replace(/>$/,' t="inlineStr">')).replace(new RegExp('<'+prefix+'v>0</'+prefix+'v>'),`<${prefix}is><${prefix}t>${date}</${prefix}t></${prefix}is>`);});
}
export function meritTarget(book){
 const candidates=book.sheets.filter(s=>s.name==='상점'||s.name==='상벌점 누계');
 for(const sheet of candidates){for(const [row,cs] of sheet.rows){const vals=[...cs.values()],name=vals.find(c=>clean(c.value)==='이름'),id=vals.find(c=>clean(c.value)==='학번'),cl=vals.find(c=>/^(학반번|반학번)$/.test(clean(c.value)));if(!name||!id)continue;
 const rounds=vals.map(c=>({round:+(/^(\d+)회$/.exec(clean(c.value))?.[1]||0),col:c.col})).filter(r=>r.round);if(!rounds.length)continue;
 const students=[];for(const [rn,rs] of sheet.rows){const sid=norm(rs.get(id.col)?.value),n=norm(rs.get(name.col)?.value),classNo=norm(rs.get(cl?.col)?.value);if(rn>row&&/^\d{5,}$/.test(sid)&&n)students.push({id:sid,name:n,row:rn,grade:/^[123]\d{4}$/.test(classNo)?+classNo[0]:null});}
 if(!students.length||new Set(students.map(s=>s.id)).size!==students.length)throw Error('상점 명부의 학번을 확인해 주세요.');
 const used=rounds.filter(r=>students.some(s=>{const c=sheet.cells.get(colName(r.col)+s.row);return c?.formula||norm(c?.value)!=='';}));const last=Math.max(0,...used.map(r=>r.round));return {sheet,students,rounds,suggested:rounds.find(r=>r.round>last)?.round||rounds.at(-1).round};
 }}throw Error('상점 또는 상벌점 누계 시트에서 학번·이름·회차 헤더를 찾지 못했습니다.');
}
export function meritRecords(book){const records=[];let foundHeader=false;for(const sheet of book.sheets){if(sheet.hidden)continue;let header;for(const [row,cs] of sheet.rows){const cells=[...cs.values()],name=cells.find(c=>/^(학생|이름|학생이름|성명)$/.test(clean(c.value))),score=cells.find(c=>/^심사상점(?:\(pts\))?$/i.test(clean(c.value))),grade=cells.find(c=>clean(c.value)==='학년');if(name&&score){header={row,name:name.col,score:score.col,grade:grade?.col};break;}}
 if(!header)continue;foundHeader=true;for(const [row,cs] of sheet.rows){if(row<=header.row)continue;const name=norm(cs.get(header.name)?.value),raw=norm(cs.get(header.score)?.value),grade=clean(cs.get(header.grade)?.value);if(!name&&!raw)continue;const score=raw!==''&&Number.isFinite(+raw)&&+raw>=0?+raw:null;records.push({sheet:sheet.name,row,name,grade,score});}}
 if(!foundHeader)throw Error('학생(이름)과 심사상점 열의 자료를 찾지 못했습니다. 추천상점은 사용하지 않습니다.');return records;}
export function meritPlan(records,target,round,{date}={}){const col=target.rounds.find(r=>r.round===+round)?.col;if(!col)throw Error('상점 반영 회차를 선택하세요.');const groups=new Map(),errors=[],unmatched=[];let expanded=0;const dateLabel=date===undefined?null:meritDate(date);const dateRef=colName(col)+'1';if(target.sheet.cells.get(dateRef)?.formula)errors.push(dateRef+'에 날짜 대신 수식이 있습니다.');
 for(const r of records){const label=`${r.sheet} ${r.row}행 · ${r.name||'이름 없음'}`;if(!Number.isFinite(r.score)||r.score<0||!r.name){errors.push(label+' — 이름 또는 심사상점 확인 필요');continue;}const name=clean(r.name);let students;
 if(r.studentId){students=target.students.filter(s=>s.id===r.studentId);if(!students.length){errors.push(label+' — 선택한 학번이 명부에 없습니다.');continue;}}
 else {const grades=meritGroup(name,r.grade);if(grades)students=target.students.filter(s=>grades.includes(s.grade)||grades.length===3);else{const grade=/^([123])(?:학년)?$/.exec(clean(r.grade))?.[1];students=target.students.filter(s=>norm(s.name)===norm(r.name)&&(!grade||s.grade===+grade));if(students.length!==1){errors.push(label+' — 이름·학년을 명부와 일치시켜 주세요 (동명이인 또는 미등록)');unmatched.push(r);continue;}}}
 if(!students.length){errors.push(label+' — 대상 학생 없음');continue;}expanded+=students.length;
 for(const s of students){const ref=colName(col)+s.row,cell=target.sheet.cells.get(ref);if(cell?.formula||norm(cell?.value)!==''){errors.push(`${label} — ${s.name} ${ref}에 기존 값/수식이 있습니다. 상점 회차를 확인하세요.`);continue;}const old=groups.get(s.id)||{student:s,ref,score:0,sources:[]};old.score=Math.round((old.score+r.score)*1e8)/1e8;old.sources.push({sheet:r.sheet,row:r.row,score:r.score});groups.set(s.id,old);}}
 // Complete the selected merit round for every student, including zero awards.
 for(const student of target.students){if(groups.has(student.id))continue;const ref=colName(col)+student.row,cell=target.sheet.cells.get(ref);if(cell?.formula||norm(cell?.value)!==''){errors.push(`${student.name} ${ref}에 기존 값/수식이 있습니다. 상점 회차를 확인하세요.`);continue;}groups.set(student.id,{student,ref,score:0,sources:[]});}
 return {date:dateLabel,dateRef,awarded:[...groups.values()].filter(e=>e.score>0).length,zeroFilled:[...groups.values()].filter(e=>e.score===0).length,entries:[...groups.values()],errors:[...new Set(errors)],unmatched,sourceCount:records.length,expanded,round:+round,sheet:target.sheet.name,total:[...groups.values()].reduce((s,r)=>s+r.score,0)};
}
export async function applyMerits(bytes,records,round,options={}){const book=await readBook(bytes,'누계.xlsx'),target=meritTarget(book),plan=meritPlan(records,target,round,options);if(plan.errors.length)throw Error(`상점 ${plan.errors.length}건 확인 필요: ${plan.errors.slice(0,3).join(' / ')}`);let text=target.sheet.text;for(const e of plan.entries)text=patchCell(text,e.ref,e.score);if(plan.date)text=patchDate(text,plan.dateRef,plan.date);assertCellPreservation(target.sheet.text,text,[...plan.entries.map(e=>e.ref),...(plan.date?[plan.dateRef]:[])]);if(JSON.stringify(formulaTokens(text))!==JSON.stringify(formulaTokens(target.sheet.text)))throw Error('상점 시트 수식 보존 검사 실패');book.zip.file(target.sheet.path,text);const result=await book.zip.generateAsync({type:'uint8array',compression:'DEFLATE'});const checked=await readBook(result,'누계.xlsx'),out=checked.sheets.find(s=>s.name===target.sheet.name);for(const e of plan.entries)if(+out.cells.get(e.ref)?.value!==e.score)throw Error('상점 입력 검증 실패: '+e.ref);
 if(plan.date&&out.cells.get(plan.dateRef)?.value!==plan.date)throw Error('상점 날짜 입력 검증 실패: '+plan.dateRef);
 // Every other ZIP component must remain byte-identical to the penalty result.
 for(const p of Object.keys(book.zip.files)){if(book.zip.files[p].dir||p===target.sheet.path)continue;const a=await book.zip.file(p).async('uint8array'),b=await checked.zip.file(p).async('uint8array');if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('상점 반영 중 원본 구성 변경: '+p);}
 return {bytes:result,plan};}
