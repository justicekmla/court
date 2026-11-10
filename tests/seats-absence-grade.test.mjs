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
