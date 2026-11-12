import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../seats/app.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',attrs:{},focus(){},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}});return elements.get(id)};
 const C=vm.createContext({document:{getElementById:get},window:{addEventListener(){}},URL:{revokeObjectURL(){}},console});
 vm.runInContext(source,C);
 vm.runInContext(`people=[{id:1,name:'가상학생',grade:'1',items:[{id:11,art:'A',point:1}]},{id:2,name:'시험학생',grade:'1학년',items:[{id:21,art:'B',point:2},{id:22,art:'C',point:3}]},{id:3,name:'예시학생',grade:'2',items:[{id:31,art:'D',point:4}]}];`,C);
 return {C,get,run:code=>vm.runInContext(code,C),json:code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',C)),click:grade=>get('gradeButtons').onclick({target:{closest:()=>({dataset:{absGrade:String(grade)}})}})};
}
test('grade selection ignores search filters and moves every charge into the absence sheet',()=>{
 const s=setup();s.run("showModal('abs');absent.add(3);defense.set(1,new Set([11]));");s.get('search').value='가상';
 s.click(1);
 assert.deepEqual(s.json('[...absent]'),[3,1,2]);assert.equal(s.run('defense.has(1)'),false);
 const result=s.json('makeResult()');assert.equal(result.absCount,3);assert.equal(result.abs.length,4);
 assert.equal(result.normals,0);assert.equal(result.finals,0);
 assert(s.get('gradeButtons').innerHTML.includes('1학년 전체 해제 (2명)'));
 assert(s.get('gradeButtons').innerHTML.includes('3학년 전체 선택 (0명)'));
 assert.equal(s.get('download').attrs['aria-disabled'],'true');
});
test('clicking the selected grade again releases only that grade and preserves other selections',()=>{
 const s=setup();s.run("showModal('abs');absent.add(3);defense.set(3,new Set([31]));");s.click(1);s.click(1);
 assert.deepEqual(s.json('[...absent]'),[3]);assert.equal(s.run('defense.has(3)'),true);
 s.run('absent.add(1)');s.click(1);assert.deepEqual(s.json('[...absent]'),[3,1,2]);
});
test('grade controls stay hidden and inactive in the final-defense picker',()=>{
 const s=setup();s.run("showModal('def')");assert.equal(s.get('gradeButtons').hidden,true);s.click(1);assert.deepEqual(s.json('[...absent]'),[]);
 s.run("showModal('abs')");assert.equal(s.get('gradeButtons').hidden,false);
 s.click(3);assert.deepEqual(s.json('[...absent]'),[]);
});
function toggleItem(s,person,item,checked=true){s.get('list').onchange({target:{dataset:{person:String(person),item:String(item)},checked}})}
test('withdrawal removes only the selected charge, recalculates totals, and can be undone',()=>{
 const s=setup();s.run("showModal('wd')");toggleItem(s,2,21);
 let r=s.json('makeResult()'),rows=r.seat.filter(x=>x[5]);
 assert.equal(r.withdrawnCount,1);assert.equal(rows.length,3);
 assert.equal(rows.find(x=>x[2]==='시험학생')[7],3);
 assert.equal(rows.some(x=>x[5]==='B'),false);
 assert.equal(s.get('download').attrs['aria-disabled'],'true');
 assert(s.get('list').innerHTML.includes('· 취하'));
 toggleItem(s,2,21,false);r=s.json('makeResult()');
 assert.equal(r.withdrawnCount,0);assert.equal(r.seat.find(x=>x[2]==='시험학생')[7],5);
 assert.equal(s.run('people[1].items.length'),2);
});
test('withdrawal excludes absent charges and omits students with every charge withdrawn',()=>{
 const s=setup();s.run("absent.add(2);showModal('wd')");toggleItem(s,2,21);
 let r=s.json('makeResult()');assert.equal(r.absCount,1);assert.equal(r.abs.length,1);assert.equal(r.abs[0][5],'C');assert.equal(r.abs[0][7],3);
 toggleItem(s,2,22);r=s.json('makeResult()');assert.equal(r.absCount,0);assert.equal(r.abs.length,0);assert.equal(r.withdrawnCount,2);
 toggleItem(s,2,21,false);r=s.json('makeResult()');assert.equal(r.absCount,1);assert.equal(r.abs[0][5],'B');
});
test('withdrawal overrides final defense without losing its selection when restored',()=>{
 const s=setup();s.run("defense.set(2,new Set([21]));showModal('wd')");toggleItem(s,2,21);
 let r=s.json('makeResult()');assert.equal(r.finals,0);assert.equal(r.normals,3);
 s.run("showModal('def')");assert.match(s.get('list').innerHTML,/data-item="21" checked disabled/);
 toggleItem(s,2,21);assert.equal(s.run('withdrawn.get(2).has(21)'),true);
 s.run("showModal('wd')");toggleItem(s,2,21,false);r=s.json('makeResult()');assert.equal(r.finals,1);
});
test('same-name and repeated identical charges are withdrawn individually and exports exclude them',async()=>{
 const s=setup();s.run("people=[{id:1,name:'동명',grade:'1',items:[{id:11,art:'반복',point:1},{id:12,art:'반복',point:1}]},{id:2,name:'동명',grade:'1',items:[{id:21,art:'반복',point:1}]}];showModal('wd')");
 toggleItem(s,1,11);const r=s.json('makeResult()');
 assert.equal(r.seat.filter(x=>x[5]==='반복').length,2);assert.equal(r.groups,1);
 const template=await fs.readFile(new URL('../seats/template.js',import.meta.url),'utf8');s.run(template);
 s.run("people[0].items[0].art='취하된항목';result=makeResult()");
 const xml=s.run('sheetXml(result.seat)');assert.equal(xml.includes('취하된항목'),false);assert(xml.includes('반복'));
 assert.equal(s.get('gradeButtons').hidden,true);
});
