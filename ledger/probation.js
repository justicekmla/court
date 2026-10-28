import {norm,colName,readBook,patchCell,formulaTokens} from './core.js';
const pValue=value=>{const m=/^p\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(norm(value));return m?+m[1]:null;};
export function chargeMonth(value){const t=norm(value);if(!t)return null;if(/^\d+(\.\d+)?$/.test(t)&&+t>30000&&+t<80000)return new Date(Date.UTC(1899,11,30)+Math.floor(+t)*86400000).getUTCMonth()+1;const date=/^(?:\d{4}[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})/.exec(t);return date&&+date[1]>=1&&+date[1]<=12&&+date[2]>=1&&+date[2]<=31?+date[1]:null;}
export function probationPlan(info,reviews,round,{courtDate=new Date().toISOString().slice(0,10)}={}){const numeric=reviews.map(r=>({...r})),patches=[],events=[],errors=[];const roundCol=info.rounds.find(r=>r.round===+round)?.col;if(!roundCol)throw Error('프로베이션 회차 오류');const courtMonth=chargeMonth(courtDate);if(!courtMonth)throw Error('법정 날짜를 입력하세요.');const afterMarch=courtMonth>=3;if(info.sheet.rows.has(1)&&norm(info.sheet.cells.get(colName(roundCol)+'1')?.value)==='')patches.push({ref:colName(roundCol)+'1',from:'',value:courtDate,kind:'court-date'});
 const groups=new Map();for(const r of numeric){if(r.excluded||!r.student)continue;if(!groups.has(r.student.id))groups.set(r.student.id,[]);groups.get(r.student.id).push(r);}
 const pHeader=[...info.sheet.rows.values()].flatMap(cs=>[...cs.values()]).find(c=>norm(c.value).replace(/\s/g,'')==='P여부')?.col;
 for(const student of info.students){const history=info.rounds.filter(r=>r.round<round).map(r=>({round:r.round,ref:colName(r.col)+student.row,cell:info.sheet.cells.get(colName(r.col)+student.row)})).filter(r=>norm(r.cell?.value)!=='');const febHistory=student.grade===1&&afterMarch?history.filter(h=>{const col=info.rounds.find(r=>r.round===h.round).col;return chargeMonth(info.sheet.cells.get(colName(col)+'1')?.value)===2;}):[];for(const h of febHistory){if(!h.cell.formula&&(pValue(h.cell.value)!==null||Number.isFinite(+norm(h.cell.value)))){patches.push({ref:h.ref,from:norm(h.cell.value),value:`2월면제(${pValue(h.cell.value)??+norm(h.cell.value)})`,kind:'feb-history'});events.push({id:student.id,name:student.name,type:'과거 2월 벌점 면제 · P 사용 이력 유지',score:pValue(h.cell.value)??+norm(h.cell.value),round,ref:h.ref});}}const holds=history.filter(r=>pValue(r.cell.value)!==null&&!febHistory.includes(r));const current=groups.get(student.id)||[];const pending=holds.filter(h=>round-h.round<=2);const unresolved=reviews.some(r=>r.student?.id===student.id&&r.excluded&&!r.block.allYellow&&!r.block.yellow&&!r.block.cfRisk);
  if(pending.length>1){errors.push(student.name+' · 유예 기간이 겹치는 p 기록 확인 필요');continue;}
  if(pending.length){const h=pending[0],later=history.filter(r=>r.round>h.round&&r.round<=h.round+2);if(later.length){errors.push(student.name+' · 유예 기간 내 과거 벌점이 있지만 p가 남아 있습니다. 이미 복원했는지 확인해 주세요.');continue;}if(unresolved){errors.push(student.name+' · 유예 기간 중 이번 판결의 제외 사유를 해결해야 합니다.');continue;}
   if(current.length){patches.push({ref:h.ref,from:norm(h.cell.value),value:pValue(h.cell.value),kind:'restore'});events.push({id:student.id,name:student.name,type:'복원',score:pValue(h.cell.value),start:h.round,round,ref:h.ref});}
   else events.push({id:student.id,name:student.name,type:round===h.round+2?'유예 소멸':'유예 유지',score:pValue(h.cell.value),start:h.round,round,ref:h.ref});
  }
  if(!current.length)continue;
  const items=current.flatMap(r=>r.block.rows||[]);const first=history.length===0;
  if(student.grade===1&&afterMarch){const months=items.map(r=>chargeMonth(r.date));if(months.some(m=>m===null)){errors.push(student.name+' · 기소 날짜를 확인할 수 없어 신입생 2월 면제 여부를 판정할 수 없습니다.');continue;}
   const feb=items.filter((r,i)=>months[i]===2);if(feb.length){const remaining=items.filter((r,i)=>months[i]!==2);if(remaining.length){const points=items.map(r=>+r.points);const total=current.reduce((n,r)=>n+r.score,0);if(points.some(n=>!Number.isFinite(n))||Math.abs(points.reduce((a,b)=>a+b,0)-total)>1e-8){errors.push(student.name+' · 2월/3월 이후 항목이 섞여 최종 Sum을 자동 배분할 수 없습니다.');continue;}current[0].score=remaining.reduce((n,r)=>n+(+r.points),0);for(const r of current.slice(1)){r.excluded=true;r.skipReason='신입생 날짜별 합산';}}
    else{for(const r of current){r.excluded=true;r.skipReason='신입생 2월 벌점 면제';}patches.push({ref:colName(roundCol)+student.row,from:'',value:'2월면제',kind:'february'});}
    events.push({id:student.id,name:student.name,type:'2월 항목 면제 · P 사용 처리',round,ref:colName(roundCol)+student.row});continue;
   }
  }
  if(!first)continue;
  const eligible=student.grade===1||/^[pP]$/.test(norm(info.sheet.cells.get(colName(pHeader||4)+student.row)?.value));
  if(!eligible)continue;
  if(unresolved){errors.push(student.name+' · 첫 기소의 항목 수를 확정하려면 제외된 판결을 확인해 주세요.');continue;}
  if(items.length!==1){events.push({id:student.id,name:student.name,type:'복수 항목 · P 소멸',round});continue;}
  const score=current.reduce((n,r)=>n+r.score,0);patches.push({ref:colName(roundCol)+student.row,from:'',value:`p(${score})`,kind:'defer'});for(const r of current){r.excluded=true;r.skipReason='프로베이션 기소유예';}events.push({id:student.id,name:student.name,type:'새 기소유예',score,start:round,round,ref:colName(roundCol)+student.row});
 }
 return {reviews:numeric,patches,events,errors};
}
function textCell(text,ref,value){const safe=String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;');const patched=patchCell(text,ref,0);const re=new RegExp('<((?:[\\w.-]+:)?c)\\b(?=[^>]*\\br="'+ref+'")[^>]*>[\\s\\S]*?</\\1>');return patched.replace(re,chunk=>{const tag=/^<([^\s>]+)/.exec(chunk)[1],prefix=tag.includes(':')?tag.split(':')[0]+':':'';return chunk.replace(/^<[^>]+>/,open=>open.replace(/\s+t="[^"]*"/,'').replace(/>$/,' t="inlineStr">')).replace(new RegExp('<'+prefix+'v>[^<]*</'+prefix+'v>'),`<${prefix}is><${prefix}t>${safe}</${prefix}t></${prefix}is>`);});}
export async function applyProbation(bytes,plan){if(plan.errors.length)throw Error(plan.errors.join(' / '));if(!plan.patches.length)return bytes;const book=await readBook(bytes,'누계.xlsx'),sheet=book.sheets.find(s=>s.name==='벌점');let text=sheet.text;
 for(const p of plan.patches){const old=sheet.cells.get(p.ref);if(old?.formula||norm(old?.value)!==p.from)throw Error('프로베이션 대상 원본이 다릅니다: '+p.ref);text=typeof p.value==='number'?patchCell(text,p.ref,p.value):textCell(text,p.ref,p.value);}
 if(JSON.stringify(formulaTokens(text))!==JSON.stringify(formulaTokens(sheet.text)))throw Error('프로베이션 처리 중 수식 보존 검사 실패');book.zip.file(sheet.path,text);const output=await book.zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),checked=await readBook(output,'누계.xlsx');for(const p of plan.patches)if(norm(checked.sheets.find(s=>s.name==='벌점').cells.get(p.ref)?.value)!==String(p.value))throw Error('프로베이션 입력 검증 실패: '+p.ref);return output;
}
