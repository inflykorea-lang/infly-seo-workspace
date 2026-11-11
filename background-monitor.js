(()=>{
'use strict';
if(window.__inflyBackgroundLoaded)return;window.__inflyBackgroundLoaded=true;
const BASE='https://rubygdwkrvgfbwdoxaul.supabase.co/functions/v1';
let syncing=false,pulling=false,timer=null;

function ensureToken(){
 if(!state.backgroundToken){
  state.backgroundToken=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))+Math.random().toString(36).slice(2);
 }
 if(!state.backgroundLastPulledAt)state.backgroundLastPulledAt='';
}
async function post(path,body){
 const r=await fetch(BASE+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 let d={};try{d=await r.json()}catch(_){}
 if(!r.ok)throw Error(d.error||('서버 요청 실패 '+r.status));
 return d;
}
function serializableContents(){
 return state.contents.filter(c=>c.url&&!c.demo).map(c=>({
  id:c.id,url:c.url,titleKo:c.titleKo,device:c.device,mode:c.mode,
  registeredAt:c.registeredAt||new Date().toISOString(),
  keywords:(c.keywords||[]).map(k=>({id:k.id,name:k.name}))
 }));
}
async function syncAll(){
 if(syncing||!state)return;syncing=true;
 try{
  ensureToken();
  let changed=false;
  state.contents.forEach(c=>{if(c.url&&!c.demo&&!c.registeredAt){c.registeredAt=new Date().toISOString();changed=true}});
  if(changed){try{await persist(state)}catch(_){}}
  await post('infly-monitor-sync',{workspaceToken:state.backgroundToken,contents:serializableContents()});
 }catch(e){console.error('background sync',e)}
 finally{syncing=false}
}
async function urlToImage(url,name){
 try{
  const r=await fetch(url);if(!r.ok)return null;
  const b=await r.blob();if(!['image/jpeg','image/png','image/webp'].includes(b.type))return null;
  const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(b)});
  return {name:name||('auto-'+Date.now()+'.jpg'),type:b.type,size:b.size,data};
 }catch(_){return null}
}
async function pullResults(){
 if(pulling||!state)return;pulling=true;
 try{
  ensureToken();
  const d=await post('infly-monitor-results',{workspaceToken:state.backgroundToken,since:state.backgroundLastPulledAt||null});
  let max=state.backgroundLastPulledAt||'',added=0;
  for(const r of d.results||[]){
   const localId='auto_'+String(r.id).replace(/-/g,'');
   if(state.records.some(x=>x.id===localId)){if(r.checked_at>max)max=r.checked_at;continue}
   const c=state.contents.find(x=>x.id===r.client_content_id);if(!c)continue;
   const k=c.keywords.find(x=>x.id===r.client_keyword_id);if(!k)continue;
   const image=r.screenshotUrl?await urlToImage(r.screenshotUrl,'naver-auto-'+r.id+'.jpg'):null;
   state.records.push({
    id:localId,contentId:c.id,keywordId:k.id,keyword:k.name,checkedAt:r.checked_at,
    device:c.device,area:r.area||'통합검색',status:r.status,rank:r.rank||null,
    scope:r.scope||'NAVER 통합검색 자동 확인',note:r.error||'백그라운드 자동 확인',
    slot:r.slot_hours||null,source:'auto',image
   });
   added++;if(r.checked_at>max)max=r.checked_at;
  }
  if(max!==state.backgroundLastPulledAt){state.backgroundLastPulledAt=max}
  if(added){
   try{await persist(state)}catch(_){}
   diskDirty=true;render();updateFileStatus();toast('백그라운드 자동 확인 결과 '+added+'건을 불러왔습니다.');
  }
 }catch(e){console.error('background results',e)}
 finally{pulling=false}
}
function schedule(){
 clearTimeout(timer);
 timer=setTimeout(async()=>{await syncAll();await pullResults();schedule()},60000);
}

const oldCommit=commit;
commit=function(mutator){
 return oldCommit(mutator).then(async r=>{setTimeout(syncAll,250);return r});
};

async function init(){
 for(let i=0;i<80;i++){if(window.__inflyReady&&window.state)break;await new Promise(r=>setTimeout(r,100))}
 if(!window.state)return;
 ensureToken();
 try{await persist(state)}catch(_){}
 await syncAll();await pullResults();schedule();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){syncAll();pullResults()}});
window.INFLY_BACKGROUND={syncAll,pullResults};
init();
})();