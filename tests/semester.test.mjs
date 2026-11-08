import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {emptyMetadata,readMetadata,buildNotice,outputMetadata,validateMetadataField,metadataPanel} from '../court-meta.js';
import {parseRosterText,readRosterFile} from '../roster.js';
import {readWorkbook,cell} from '../xlsx.js';
import {writeCourtList,writeRefsFile} from '../io.js';
import {readCourtFile,writeEditedCourt} from '../courtfile.js';
import {verifyChiefPassword,validChiefVerifier,parseChiefSetup} from '../chief-auth.js';
vm.runInThisContext(await fs.readFile(new URL('../seats/jszip.min.js',import.meta.url),'utf8'));
const sunday='2026-11-08';
const meta={...emptyMetadata(),courtDate:'2026-12-04',teacher:'교사 & 가상',chief:'가상부장',chair:'가상위원장',speechRecipient:'가상차장',contactName:'연락담당',contactPhone:'010-1111-2222',secondContactName:'두번째담당',secondContactPhone:'010-3333-4444'};
const state={phase:'review',listNo:37,courtMeta:meta};
const info=outputMetadata({},state,sunday,{requireDate:true});
const rows=[{name:'가상학생',disp:'가상학생',grade:1,date:'2026-11-01',art:'Late for court',accuser:'가상부',finalPts:5}];
test('explicit court date and all notice placeholders are independent of upload Sunday',()=>{
 assert.equal(info.courtDate,'2026-12-04');assert.equal(info.listNo,37);assert.deepEqual(info.header.names,[meta.teacher,meta.chief,meta.chair]);
 for(const k of ['speechRecipient','contactName','contactPhone','secondContactName','secondContactPhone'])assert(info.header.notice.includes(meta[k]));
 assert(info.header.notice.includes('the chair of the Judicial Branch'));
 assert(metadataPanel(meta,{version:'1'}).includes('최후변론서 제출 대상 (사법부위원장)'));
 assert(!info.header.notice.includes('OOO'));assert(info.header.notice.endsWith('<Defendants>'));
});
test('semester fields survive next-week state changes and explicit reset stays empty',()=>{
 assert.deepEqual(readMetadata({}, {...state,listNo:38,sunday:'2026-11-15'},'2026-11-15').teacher,meta.teacher);
 const reset={...state,listNo:1,courtMeta:emptyMetadata()};
 assert.equal(readMetadata({header:{names:['old','old','old']}},reset,sunday).teacher,'');
 assert.throws(()=>outputMetadata({},reset,sunday,{requireDate:true}),/날짜/);
 assert.equal(validateMetadataField('courtDate','2026-12-04'),'2026-12-04');
 assert.throws(()=>validateMetadataField('courtDate','2026-02-30'));
 assert.throws(()=>validateMetadataField('listNo','0'));
});
test('roster replacement control is visible only on version1',()=>{
 assert(metadataPanel({...meta,listNo:37},{version:'1'}).includes('data-act="rosterStart"'));
 assert(!metadataPanel({...meta,listNo:37},{version:'2'}).includes('data-act="rosterStart"'));
});
test('version1 exports metadata into original header cells and leaves charges unchanged',async()=>{
 const blob=await writeCourtList(rows,info),[sheet]=await readWorkbook(await blob.arrayBuffer());
 assert.equal(cell(sheet,1,1).v,'Court List 37 Ver.1');
 assert.equal(cell(sheet,1,8).v,meta.teacher);assert.equal(cell(sheet,2,8).v,meta.chief);assert.equal(cell(sheet,3,8).v,meta.chair);
 assert.equal(cell(sheet,4,1).v,'12/4/2026\n'+buildNotice(meta));
 assert.equal(cell(sheet,6,3).v,'가상학생');assert.equal(cell(sheet,6,7).v,5);
});
test('version2 updates the same cells and preserves original VBA and other package parts',async()=>{
 const original=await writeCourtList(rows,{listNo:3,sunday,header:{labels:['','',''],names:['','',''],notice:'old'}});
 const z=await JSZip.loadAsync(await original.arrayBuffer());z.file('xl/vbaProject.bin',new Uint8Array([9,8,7]));z.file('xl/retained.xml','unchanged');
 const buffer=await z.generateAsync({type:'uint8array'}),source=await readCourtFile(buffer,'test.xlsm',sunday);
 const output=await writeEditedCourt(buffer,source,source.rows,info),out=await output.arrayBuffer(),[sheet]=await readWorkbook(out);
 assert.equal(cell(sheet,1,1).v,'Court List 37 Ver.2');assert.equal(cell(sheet,1,8).v,meta.teacher);
 assert.equal(cell(sheet,2,8).v,meta.chief);assert.equal(cell(sheet,3,8).v,meta.chair);assert.equal(cell(sheet,4,1).v,'12/4/2026\n'+buildNotice(meta));
 const saved=await JSZip.loadAsync(out);assert.deepEqual([...await saved.file('xl/vbaProject.bin').async('uint8array')],[9,8,7]);assert.equal(await saved.file('xl/retained.xml').async('string'),'unchanged');
});
test('text rosters accept grade or cohort headers and distinguish names across cohorts',()=>{
 const a=parseRosterText('이름\t기수\n가상학생\t29\n가상학생\t31',sunday);assert.deepEqual(a.roster.map(r=>[r.name,r.grade]),[['가상학생29',3],['가상학생31',1]]);
 assert.equal(parseRosterText('가상학생29\n가상학생31',sunday).roster.length,2);
 assert.equal(parseRosterText('이름,학년\n가상학생,1\n가상학생,1',sunday).duplicates,1);
 assert.throws(()=>parseRosterText('',sunday));assert.throws(()=>parseRosterText('가상학생 4',sunday));
 assert.throws(()=>parseRosterText('이름 학년 학번\n가상학생 1 10101\n가상학생 1 10102',sunday),/동명이인/);
});
test('xlsx roster replacement imports only roster and validates every student',async()=>{
 const expected=[{name:'가상학생29',grade:3,no:'30101'},{name:'가상학생31',grade:1,no:'10101'}];
 const blob=await writeRefsFile({roster:expected});const result=await readRosterFile(await blob.arrayBuffer(),sunday);
 assert.deepEqual(result.roster,expected);
});
test('public password module rejects unconfigured credentials and validates private setup format',async()=>{
 assert.equal(await verifyChiefPassword('incorrect-password'),false);assert.equal(await verifyChiefPassword(''),false);
 const testConfig={algorithm:'PBKDF2-SHA256',salt:'1'.repeat(48),digest:'2'.repeat(64),iterations:310000};
 assert(validChiefVerifier(testConfig));assert(!validChiefVerifier({...testConfig,iterations:1}));
 assert.deepEqual(parseChiefSetup('#chief-setup='+btoa(JSON.stringify(testConfig))),testConfig);
 assert.equal(parseChiefSetup('#chief-setup=bad'),null);
 const source=await fs.readFile(new URL('../chief-auth.js',import.meta.url),'utf8');assert(!/const (SALT|DIGEST)\s*=/.test(source));
});

test('version2 without new metadata still updates the source title and preserves its notice',async()=>{
 const original=await writeCourtList(rows,{listNo:26,sunday,header:{labels:['a','b','c'],names:['one','two','three'],notice:'Original notice'}});
 const buffer=await original.arrayBuffer(),source=await readCourtFile(buffer,'Court List 26.xlsx',sunday);
 const output=await writeEditedCourt(buffer,source,source.rows),[sheet]=await readWorkbook(await output.arrayBuffer());
 assert.equal(cell(sheet,1,1).v,'Court List 26 Ver.2');
 assert.equal(cell(sheet,1,8).v,'one');
 assert(cell(sheet,4,1).v.includes('Original notice'));
});
