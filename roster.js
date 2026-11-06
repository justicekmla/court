import * as E from './engine.js?v=20261107';
import {readWorkbook,cell} from './xlsx.js';
const text=v=>String(v??'').trim();
const header=s=>({이름:'name',성명:'name',name:'name',학년:'grade',grade:'grade',기수:'cohort',cohort:'cohort',학번:'no',학반번:'no','studentid':'no'}[text(s).replace(/\s+/g,'').toLowerCase()]||'');
export function parseRosterRows(rows,refDate){
 const nonempty=rows.filter(r=>r.some(v=>text(v)));let heads=null,start=0;
 for(let i=0;i<Math.min(nonempty.length,30);i++){
  const map={};nonempty[i].forEach((v,c)=>{const k=header(v);if(k)map[k]=c;});
  if(map.name!==undefined&&(map.grade!==undefined||map.cohort!==undefined||map.no!==undefined||nonempty[i].filter(v=>text(v)).length===1)){heads=map;start=i+1;break;}
 }
 const out=[],errors=[];
 for(let i=start;i<nonempty.length;i++){
  const r=nonempty[i];let name=text(r[heads?.name??0]).replace(/\s*\((\d{2})기?\)$/,'$1').replace(/\s+(\d{2})기?$/,'$1');
  if(!name)continue;
  let grade=0,no=heads?.no!==undefined?text(r[heads.no]):text(r[2]);
  if(heads?.grade!==undefined)grade=Number(text(r[heads.grade]).replace(/학년$/,''));
  else if(heads?.cohort!==undefined)grade=E.gisuToGrade(Number(text(r[heads.cohort]).replace(/기$/,'')),refDate);
  else if(heads?.no!==undefined)grade=Number(no[0]);
  else {const n=Number(text(r[1]).replace(/학년$|기$/,''));grade=n>=20?E.gisuToGrade(n,refDate):n;}
  if(!grade&&/\d{2}$/.test(name))grade=E.gisuToGrade(Number(name.slice(-2)),refDate);
  if(!name||!Number.isInteger(grade)||grade<1||grade>3){errors.push((i+1)+'행: 이름과 학년(1~3) 또는 기수를 확인해 주세요.');continue;}
  out.push({name,grade,no});
 }
 if(errors.length)throw Error(errors.slice(0,8).join('\n'));
 if(!out.length)throw Error('재학생을 찾지 못했습니다. 이름과 학년 또는 기수를 함께 넣어 주세요.');
 const baseGrades=new Map();for(const r of out){if(!baseGrades.has(r.name))baseGrades.set(r.name,new Set());baseGrades.get(r.name).add(r.grade);}
 for(const r of out)if(baseGrades.get(r.name).size>1&&!/\d{2}$/.test(r.name))r.name+=E.gradeToGisu(r.grade,refDate);
 const unique=new Map();let duplicates=0;
 for(const r of out){const prev=unique.get(r.name);if(prev){if(prev.grade===r.grade&&prev.no===r.no){duplicates++;continue;}throw Error('동명이인 '+r.name+'의 이름을 구분해 주세요. 예: 박민서29 / 박민서31 또는 박민서A / 박민서B');}unique.set(r.name,r);}
 return {roster:[...unique.values()],duplicates};
}
export function parseRosterText(raw,refDate){
 return parseRosterRows(String(raw).replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim()).map(line=>line.includes('\t')?line.split('\t'):line.includes(',')?line.split(','):line.trim().split(/\s+/)),refDate);
}
export async function readRosterFile(buffer,refDate){
 const sheets=await readWorkbook(buffer),preferred=sheets.find(s=>/재학생|명단|roster/i.test(s.name));
 const errors=[];for(const sh of [...(preferred?[preferred]:[]),...sheets.filter(s=>s!==preferred)]){
  const rows=[];for(let r=1;r<=sh.maxRow;r++){const row=[];for(let c=1;c<=Math.min(sh.maxCol,30);c++)row.push(cell(sh,r,c).v);rows.push(row);}
  try{return {...parseRosterRows(rows,refDate),sheet:sh.name};}catch(e){errors.push(sh.name+': '+e.message);}
 }
 throw Error(errors.join('\n')||'엑셀 시트를 읽지 못했습니다.');
}
