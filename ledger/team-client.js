import {readBook} from './core.js';
import {api} from './firebase-ledger.js';
export {api};
export function mountTeam({cross,onRole}){
 const $=s=>document.querySelector(s);let role=null,work=null,openedId=null,poll=null,loading=false;
 const status=s=>{$('#team-message').textContent=s;};
 function showHome(){document.body.classList.remove('team-head','team-member');$('#role-home').hidden=false;$('#member-home').hidden=true;document.querySelector('main').hidden=true;document.querySelector('aside').hidden=true;$('#cross-screen').hidden=true;document.body.classList.remove('cross-mode');document.querySelector('main').inert=false;document.querySelector('aside').inert=false;}
 function render(){const name=work?.title||'아직 공유된 누계가 없습니다.';$('#shared-title').textContent=name;$('#member-work-title').textContent=name;$('#shared-meta').textContent=work?`공유 ${new Date(work.createdAt).toLocaleString('ko-KR')} · 벌점 ${work.round}회${work.meritRound?' / 상점 '+work.meritRound+'회':''}`:'파일을 올린 뒤 ‘누계 생성 · 부원에게 공유’를 눌러 주세요.';$('#member-work-meta').textContent=work?`벌점 ${work.round}회 · 담당 ${work.counts.members[role==='two'?1:0]}명 · 노란색 제외`:'장이 누계를 생성하면 이곳에 나타납니다.';
 for(const slot of ['one','two'])$('#approval-'+slot).textContent=`법무부원${slot==='one'?'1':'2'} · ${work?.approvals[slot]?'완료':'대기'}`;
 $('#final-download').disabled=!work?.ready;$('#head-final-preview').disabled=!work?.ready;$('#member-open').disabled=!work||loading;
 $('#member-state').textContent=work?.approvals[role]?'크로스체크 완료를 전달했습니다.':work?'담당 명단을 확인한 뒤 완료 버튼을 눌러 주세요.':'';
 $('#member-open').textContent=work?.approvals[role]?'확인한 누계 다시 보기':'크로스체크 시작';
 $('#shared-counts').textContent=work?`벌점 ${work.counts.penaltyStudents}명 · 상점 ${work.counts.meritStudents}명 · 벌점 제외 ${work.counts.skipped}건${work.ready?' · 최종 취합 완료':''}`:'';
 }
 async function refresh(){try{const data=await(await api('/api/current')).json();work=data.work;render();status('');return work;}catch(e){status(e.message);throw e;}}
 async function choose(next){try{await api('/api/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:next})});role=next;onRole(next);$('#role-home').hidden=true;$('#member-home').hidden=next==='head';document.querySelector('main').hidden=next!=='head';document.querySelector('aside').hidden=next!=='head';document.body.classList.toggle('team-head',next==='head');document.body.classList.toggle('team-member',next!=='head');$('#member-heading').textContent=`법무부원${next==='two'?'2':'1'} 크로스체킹`;await refresh();if(poll)clearInterval(poll);poll=setInterval(()=>{if(!document.hidden)refresh().catch(()=>{});},12000);}catch(e){status(e.message);}}
 async function openShared(){if(!work||loading)return;loading=true;render();const id=work.id;status('공유된 누계를 불러오고 있습니다…');try{const [manifestRes,fileRes]=await Promise.all([api('/api/manifest?id='+id),api('/api/workbook?id='+id)]);const manifest=await manifestRes.json(),book=await readBook(await fileRes.arrayBuffer(),'공유누계.xlsx');openedId=id;cross.open({book,reviews:manifest.reviews,round:manifest.round,memberIndex:role==='head'?null:role==='one'?0:1,canComplete:role!=='head',canDownload:role==='head'&&work.ready,completed:!!work.approvals[role],shared:true});status('');}catch(e){status(e.message);}finally{loading=false;render();}}
 async function complete(){if(!openedId)throw Error('공유된 자료를 먼저 열어 주세요.');const data=await(await api('/api/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:openedId})})).json();work=data.work;render();return '크로스체크 완료를 법무부장에게 전달했습니다.';}
 async function download(){if(!work?.ready)throw Error('두 법무부원의 크로스체크를 기다려 주세요.');const res=await api('/api/final?id='+work.id),url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=`${work.round}회_상벌점_최종누계.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function publish(result,manifest){const body=new FormData();body.append('workbook',new Blob([result.bytes]),'누계.xlsx');body.append('manifest',JSON.stringify(manifest));body.append('previous',work?.id||'');const data=await(await api('/api/publish',{method:'POST',body})).json();work=data.work;render();return work;}
 window.addEventListener('pagehide',()=>{if(poll)clearInterval(poll);});
 document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>choose(b.dataset.role));document.querySelectorAll('.role-back').forEach(b=>b.onclick=showHome);document.querySelectorAll('.shared-refresh').forEach(b=>b.onclick=()=>refresh().catch(()=>{}));$('#member-open').onclick=openShared;$('#head-final-preview').onclick=openShared;$('#final-download').onclick=()=>download().catch(e=>status(e.message));showHome();
 return {publish,complete,download,refresh,onCrossBack(){},get role(){return role;}};
}
