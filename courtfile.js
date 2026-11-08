// 법정리스트 전용 입출력. 부서 파일의 노란 줄 필터를 적용하지 않는다.
import * as E from './engine.js?v=20261107';
import {readWorkbook,cell,inMerge,esc} from './xlsx.js';
const key=s=>String(s??'').replace(/\s+/g,' ').trim().toLowerCase();
const xmlAttrs=s=>Object.fromEntries([...s.split('>')[0].matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
export async function readCourtFile(buffer, fileName, refDate) {
 const sheets=await readWorkbook(buffer), sh=sheets[0];
 if(!sh) throw Error('첫 번째 시트를 찾지 못했습니다.');
 let hdr=0, cols={};
 const labels={grade:['grade','학년'],name:['name','이름','성명'],date:['date','날짜'],acc:['accused by','기소자'],art:['violated article','기소항목','기소 항목'],pts:['points','벌점','점수']};
 for(let r=1;r<=Math.min(30,sh.maxRow);r++) {
  const found={}; for(let c=1;c<=sh.maxCol;c++) for(const [k,aliases] of Object.entries(labels)) if(aliases.includes(key(cell(sh,r,c).v))) found[k]=c;
  if(Object.keys(labels).every(k=>found[k])) {hdr=r;cols=found;break;}
 }
 if(!hdr) throw Error('첫 시트에서 Grade / Name / Date / Accused by / Violated Article / Points 머리글을 찾지 못했습니다.');
 // Keep the established eight-column court-list template; do not guess a different layout.
 if(cols.grade!==2||cols.name!==3||cols.date!==4||cols.acc!==5||cols.art!==6||cols.pts!==7) throw Error('법정리스트의 A:H 열 양식을 확인해 주세요.');
 const rows=[];let name='',grade=0;
 for(let r=hdr+1;r<=sh.maxRow;r++) {
  const n=E.cellText(cell(sh,r,cols.name).v), art=E.cellText(cell(sh,r,cols.art).v);
  if(n) {name=n;grade=Number(cell(sh,r,cols.grade).v);}
  else if(!inMerge(sh,r,cols.name)) {name='';grade=0;}
  if(!art) continue;
  if(!name||!Number.isInteger(grade)||grade<1||grade>3) throw Error(r+'행의 이름·학년을 확인해 주세요.');
  const raw=cell(sh,r,cols.pts).v, pts=Number(raw);
  if(raw===null||raw===''||!Number.isFinite(pts)) throw Error(r+'행의 벌점을 확인해 주세요.');
  const rawDate=cell(sh,r,cols.date).v, date=E.toDate(rawDate,refDate);
  if(rawDate!==null&&rawDate!==''&&!date) throw Error(r+'행의 날짜를 확인해 주세요.');
  rows.push({id:'source-'+r,name,disp:name,grade,date,art,accuser:E.cellText(cell(sh,r,cols.acc).v),finalPts:pts,sourceRow:r});
 }
 if(!rows.length) throw Error('기소항목이 없는 파일입니다.');
 const z=await globalThis.JSZip.loadAsync(buffer);
 const wb=await z.file('xl/workbook.xml').async('string'),rels=await z.file('xl/_rels/workbook.xml.rels').async('string');
 const sheetTag=/<sheet\s[^>]*\/?\s*>/.exec(wb)?.[0], rid=xmlAttrs(sheetTag||'')['r:id'];
 const rel=[...rels.matchAll(/<Relationship\s[^>]*\/?\s*>/g)].map(m=>xmlAttrs(m[0])).find(a=>a.Id===rid);
 if(!rel) throw Error('첫 번째 시트 연결 정보를 읽지 못했습니다.');
 const path=rel.Target.startsWith('/')?rel.Target.slice(1):'xl/'+rel.Target.replace(/^\.\//,'');
 const sheetXml=await z.file(path)?.async('string');if(!sheetXml)throw Error('시트 원본을 찾지 못했습니다.');
 return {fileName,rows,hdr,path,sheetName:sh.name,sheetXml,listNo:/Court\s+List\s+(\d+)/i.exec(String(cell(sh,1,1).v))?.[1]||'',macro:z.file('xl/vbaProject.bin')!==null};
}
// Move relative formula references with their source row; absolute references stay fixed.
export function shiftFormula(formula, delta) {
 return formula.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(/(?<![A-Za-z0-9_])((?:\$?[A-Z]{1,3}))(\$?)(\d+)(?![A-Za-z0-9_(])/g,(all,col,abs,row)=>abs?all:col+Math.max(1,Number(row)+delta))).join('');
}
export function applyCourtHeaderXml(xml,info) {
 const setCell=(ref,value)=>{
  const re=new RegExp('<c\\s([^>]*?\\br="'+ref+'"[^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)');
  const match=re.exec(xml);
  const attrs=match?match[1].replace(/\s+t="[^"]*"/g,''):'r="'+ref+'"';
  const cellXml='<c '+attrs+' t="inlineStr"><is><t xml:space="preserve">'+esc(value??'')+'</t></is></c>';
  if(match)xml=xml.replace(re,()=>cellXml);
  else {const row=ref.match(/\d+$/)[0],rowRe=new RegExp('(<row\\b[^>]*\\br="'+row+'"[^>]*>)([\\s\\S]*?)(<\\/row>)');if(!rowRe.test(xml))throw Error('엑셀 머리말 '+ref+' 셀을 찾지 못했습니다.');xml=xml.replace(rowRe,(m,a,b,c)=>a+b+cellXml+c);}
 };
 setCell('A1','Court List '+info.listNo+' Ver.2');
 if(!info.header)return xml;
 for(let i=0;i<3;i++){setCell('G'+(i+1),info.header.labels[i]);setCell('H'+(i+1),info.header.names[i]);}
 const date=E.parts(info.courtDate);setCell('A4',date.m+'/'+date.d+'/'+date.y+'\n'+info.header.notice);
 return xml;
}
export async function writeEditedCourt(buffer,source,list,info=null) {
 const z=await globalThis.JSZip.loadAsync(buffer);
 if(info&&source.hdr<5)throw Error('담당자·안내문 머리말이 포함된 법정리스트 양식 파일을 올려 주세요.');
 const sourceNo = source.listNo || /Court\s+List\s+(\d+)/i.exec(source.sheetXml)?.[1];
 const x=info?applyCourtHeaderXml(source.sheetXml,info):sourceNo?applyCourtHeaderXml(source.sheetXml,{listNo:sourceNo}):source.sheetXml;
 const data=/<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>/.exec(x);if(!data)throw Error('원본 행 정보를 찾지 못했습니다.');
 const original=[...data[1].matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)].map(m=>({xml:m[0],r:Number(xmlAttrs(m[0]).r)}));
 const byRow=new Map(original.map(r=>[r.r,r.xml]));
 const template=original.find(r=>r.r>source.hdr)?.xml||'';
 const styleOf=(row,col)=>new RegExp('<c\\b[^>]*\\br="'+col+'\\d+"[^>]*').exec(row)?.[0].match(/\bs="(\d+)"/)?.[1]||'0';
 const formulasOf=row=>[...row.matchAll(/<c\s([^>]*?)>([\s\S]*?)<\/c>/g)].flatMap(m=>{
  const a=xmlAttrs(m[1]),f=/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(m[2]);
  return f?[{col:a.r.replace(/\d+$/,''),f:f[1],attrs:a}]:[];
 });
 const groupFormula=new Map(); const fallbackFormula=new Map();
 for(const item of source.rows){const row=byRow.get(item.sourceRow)||'',key=item.name+'|'+item.grade;if(!groupFormula.has(key))groupFormula.set(key,new Map());for(const f of formulasOf(row)){if(f.col==='A'||f.col==='H'){if(!groupFormula.get(key).has(f.col))groupFormula.get(key).set(f.col,f);if(!fallbackFormula.has(f.col))fallbackFormula.set(f.col,f);}}}
 const groupEnds=new Map();let index=0;
 while(index<list.length){let end=index;while(end+1<list.length&&list[end+1].disp===list[index].disp)end++;groupEnds.set(index,end);index=end+1;}
 const makeCell=(col,r,value,style)=>typeof value==='number'?`<c r="${col}${r}" s="${style}"><v>${value}</v></c>`:`<c r="${col}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value??'')}</t></is></c>`;
 const bodies=list.map((item,i)=>{
  const r=source.hdr+1+i, row=byRow.get(item.sourceRow)||template;
  const attrs=xmlAttrs(row), height=attrs.ht?` ht="${attrs.ht}" customHeight="1"`:'';
  const first=groupEnds.has(i), end=groupEnds.get(i)??i;
  const values=['',item.grade,first?item.disp:'',E.fmtDate(item.date),item.accuser,item.art,item.finalPts,''];
  const formulas=first?new Map(groupFormula.get(item.name+'|'+item.grade)||fallbackFormula):new Map();
  if(first) for(const [col,f] of fallbackFormula)if(!formulas.has(col))formulas.set(col,f);
  return `<row r="${r}"${height}>`+values.map((v,c)=>{
   const col=String.fromCharCode(65+c),style=styleOf(row,col),formula=formulas.get(col);
   if(formula) {
    const originalRow=Number(formula.attrs.r.match(/\d+$/)[0]);
    const f=col==='H'&&/^SUM\(\$?G\$?\d+:\$?G\$?\d+\)$/i.test(formula.f)?`SUM(G${r}:G${source.hdr+1+end})`:shiftFormula(formula.f,r-originalRow);
    return `<c r="${col}${r}" s="${style}"><f>${f}</f></c>`;
   }
   return makeCell(col,r,v,style);
  }).join('')+'</row>';
 }).join('');
 const head=original.filter(r=>r.r<=source.hdr).map(r=>r.xml).join('');
 let out=x.replace(data[0],'<sheetData>'+head+bodies+'</sheetData>');
 const merges=[...x.matchAll(/<mergeCell\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/g)].filter(m=>Number(m[4])<=source.hdr).map(m=>m[0]);
 for(const [start,end] of groupEnds) if(end>start) merges.push(`<mergeCell ref="C${source.hdr+1+start}:C${source.hdr+1+end}"/>`);
 const mergeXml=merges.length?`<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`:'';
 if(/<mergeCells\b/.test(out))out=out.replace(/<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>/,mergeXml);
 else out=out.replace('</sheetData>','</sheetData>'+mergeXml);
 const last=Math.max(source.hdr,source.hdr+list.length);
 out=out.replace(/<dimension\s+[^>]*\/>/,`<dimension ref="A1:H${last}"/>`);
 z.file(source.path,out);
 let wb=await z.file('xl/workbook.xml').async('string');
 wb=wb.replace(/(<definedName\b[^>]*name="_xlnm.Print_Area"[^>]*localSheetId="0"[^>]*>)([^<]*)(<\/definedName>)/,(m,a,b,c)=>a+b.replace(/\$H\$\d+/g,'$H$'+last)+c);
 wb=wb.replace(/<calcPr\b[^>]*\/?\s*>/,'');wb=wb.replace('</workbook>','<calcPr fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');z.file('xl/workbook.xml',wb);
 // Stale calculation chains refer to old row positions. Excel rebuilds them on open.
 z.remove('xl/calcChain.xml');
 let rel=await z.file('xl/_rels/workbook.xml.rels').async('string');rel=rel.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g,'');z.file('xl/_rels/workbook.xml.rels',rel);
 let ct=await z.file('[Content_Types].xml').async('string');ct=ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g,'');z.file('[Content_Types].xml',ct);
 return z.generateAsync({type:'blob',mimeType:source.macro?'application/vnd.ms-excel.sheet.macroEnabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
