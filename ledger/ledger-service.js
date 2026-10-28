// Same-browser calculations; shared artifacts use the existing authenticated store.
// No requests to the former GPT-hosted program or /api server are made.
export const CURRENT = 'cfg/ledgerState';
const chunkPath = (id, i) => `cur/ledger_${id}_${i}`;
const conflict = () => Error('새로운 누계가 공유되었습니다. 공유 현황을 새로고침해 주세요.');
const summary = s => s ? {...s.work, ready:!!s.work.approvals.one && !!s.work.approvals.two} : null;
function jobId() {
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createLedgerService(store, {zip=()=>new globalThis.JSZip(), unzip=data=>globalThis.JSZip.loadAsync(data,{base64:true}), uuid=jobId}={}) {
  let role = null;
  async function current() {return store.get(CURRENT);}
  async function requireCurrent(id) {const state=await current();if(!state||state.work.id!==id)throw conflict();return state;}
  function requireRole(...allowed) {if(!allowed.includes(role))throw Error('먼저 해당 업무 역할을 선택하세요.');}
  async function load(id) {
    const state=await requireCurrent(id);
    const parts=[];
    for(let i=0;i<state.chunks;i++) {const part=await store.get(chunkPath(id,i));if(!part||part.id!==id)throw Error('공유 누계의 일부를 읽지 못했습니다. 새로고침 후 다시 확인해 주세요.');parts.push(part.data);}
    const z=await unzip(parts.join(''));
    if(!z.file('workbook.xlsx')||!z.file('manifest.json'))throw Error('공유 누계 파일 형식 오류');
    await requireCurrent(id);
    return z;
  }
  return async function request(path,options={}) {
    const url=new URL(path,'https://local.invalid'), method=options.method||'GET';
    if(url.pathname==='/api/role'&&method==='POST') {
      const next=JSON.parse(options.body).role;
      if(!['head','one','two'].includes(next))throw Error('역할을 선택하세요.');
      await store.get(CURRENT);role=next;return Response.json({role});
    }
    if(url.pathname==='/api/current')return Response.json({work:summary(await current()),role});
    if(url.pathname==='/api/publish'&&method==='POST') {
      requireRole('head');
      const form=options.body,file=form.get('workbook'), raw=form.get('manifest');
      if(!file||file.size>20*1024*1024||typeof raw!=='string'||raw.length>1500000)throw Error('공유 파일은 20MB 이하, 검토 내역은 1.5MB 이하로 준비해 주세요.');
      const manifest=JSON.parse(raw);
      if(!Number.isInteger(manifest.round)||manifest.round<1||manifest.round>100||!Array.isArray(manifest.reviews)||!manifest.counts||manifest.counts.members?.length!==2)throw Error('누계를 다시 생성해 주세요.');
      const previous=form.get('previous')||null;
      const before=await current();if((before?.work.id||null)!==previous)throw conflict();
      const bytes=new Uint8Array(await file.arrayBuffer());if(bytes[0]!==80||bytes[1]!==75)throw Error('XLSX 파일이 아닙니다.');
      const id=uuid(),z=zip();z.file('workbook.xlsx',bytes);z.file('manifest.json',raw);
      const data=await z.generateAsync({type:'base64',compression:'DEFLATE'});
      const chunks=Math.ceil(data.length/400000),entries=[];
      for(let i=0;i<chunks;i++)entries.push([chunkPath(id,i),{id,data:data.slice(i*400000,(i+1)*400000)}]);
      if(chunks>100)throw Error('공유 결과가 너무 큽니다. 20MB 이하 파일을 사용해 주세요.');
      const work={id,createdAt:new Date().toISOString(),round:manifest.round,meritRound:manifest.meritRound||null,title:String(manifest.title||`${manifest.round}회 누계`).slice(0,100),counts:manifest.counts,approvals:{one:null,two:null}};
      await store.setMany(entries);
      try {
        await store.transact(CURRENT,prior=>{if((prior?.work.id||null)!==previous)throw conflict();return {work,chunks};});
      } catch(e) {await store.removeMany(entries.map(([key])=>key)).catch(()=>{});throw e;}
      return Response.json({work:summary({work,chunks})});
    }
    if(url.pathname==='/api/complete'&&method==='POST') {
      requireRole('one','two');const id=JSON.parse(options.body).id;
      const state=await store.transact(CURRENT,prior=>{
        if(!prior||prior.work.id!==id)throw conflict();
        return {...prior,work:{...prior.work,approvals:{...prior.work.approvals,[role]:prior.work.approvals[role]||new Date().toISOString()}}};
      });
      return Response.json({work:summary(state)});
    }
    if(['/api/workbook','/api/manifest','/api/final'].includes(url.pathname)) {
      requireRole('head','one','two');const id=url.searchParams.get('id');
      if(url.pathname==='/api/final') {requireRole('head');if(!summary(await requireCurrent(id)).ready)throw Error('두 법무부원의 크로스체크 완료를 기다려 주세요.');}
      const z=await load(id);
      if(url.pathname==='/api/manifest')return new Response(await z.file('manifest.json').async('string'),{headers:{'Content-Type':'application/json'}});
      return new Response(await z.file('workbook.xlsx').async('uint8array'),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    }
    throw Error('지원하지 않는 누계 작업입니다.');
  };
}
