(()=>{
'use strict';
if(window.__inflyAutoMonitorLoaded)return;window.__inflyAutoMonitorLoaded=true;
let running=false,lastSummary='';

function recordExists(c,k,slot){
 return state.records.some(r=>r.contentId===c.id&&r.keywordId===k.id&&r.device===c.device&&r.slot===slot&&r.status!=='error');
}
function dueTolerance(h){return (h<=6?90:480)*60*1000}
function eligibleSlot(c){
 const now=Date.now();
 const slots=schedule(c).filter(s=>s.status==='due'&&now-new Date(s.dueAt).getTime()<=dueTolerance(s.h));
 if(!slots.length)return null;
 return slots.sort((a,b)=>new Date(b.dueAt)-new Date(a.dueAt))[0];
}
async function searchOne(c,k,slot){
 const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:k.name,targetUrl:c.url,device:c.device})});
 let d={};try{d=await r.json()}catch(_){}
 if(!r.ok)throw Error(d.error||('자동 검색 실패 '+r.status));
 const rec={
  id:uid(),contentId:c.id,keywordId:k.id,keyword:k.name,
  checkedAt:d.checkedAt||new Date().toISOString(),device:c.device,
  area:d.area||'통합검색',status:d.found?'found':'notfound',
  rank:d.found?Number(d.rank)||1:null,
  scope:d.scope||'NAVER 통합검색 자동 확인',
  note:'자동 검색 · 자동 캡처',slot:slot,source:'auto',
  image:d.screenshot||null
 };
 await commit(s=>s.records.push(rec));
 return rec;
}
async function runContent(c,slot){
 if(!c.url||c.demo)return {checked:0,found:0,failed:0};
 let checked=0,found=0,failed=0;
 for(const k of c.keywords){
  if(slot!==null&&recordExists(c,k,slot))continue;
  try{const rec=await searchOne(c,k,slot);checked++;if(rec.status==='found')found++}
  catch(e){
   failed++;
   const er={id:uid(),contentId:c.id,keywordId:k.id,keyword:k.name,checkedAt:new Date().toISOString(),device:c.device,area:'통합검색',status:'error',rank:null,scope:'NAVER 통합검색 자동 확인',note:e.message||'자동 검색 실패',slot:slot,source:'auto',image:null};
   await commit(s=>s.records.push(er));
  }
 }
 return {checked,found,failed};
}
async function runDue(){
 if(running||!state)return;
 running=true;
 let checked=0,found=0,failed=0,contentsDone=0;
 try{
  const targets=state.contents.filter(c=>c.mode==='auto'&&c.url&&!c.demo).map(c=>({c,slot:eligibleSlot(c)})).filter(x=>x.slot);
  for(const x of targets){
   const r=await runContent(x.c,x.slot.h);
   if(r.checked||r.failed){contentsDone++;checked+=r.checked;found+=r.found;failed+=r.failed}
  }
  if(contentsDone){
   render();
   lastSummary='자동 확인 '+checked+'건 · 노출 '+found+'건'+(failed?' · 실패 '+failed+'건':'');
   toast(lastSummary);
  }
 }finally{running=false}
}
async function runNow(id){
 if(running){toast('자동 검색이 이미 실행 중입니다.');return}
 const c=state.contents.find(x=>x.id===id);if(!c||!c.url){toast('콘텐츠 URL이 필요합니다.');return}
 running=true;toast('자동 검색 · 캡처를 시작했습니다.');
 try{
  const r=await runContent(c,null);render();
  toast('자동 검색 완료 · '+r.checked+'개 키워드 / 노출 '+r.found+'개'+(r.failed?' / 실패 '+r.failed+'개':''));
 }finally{running=false}
}

const prevAction=action;
action=async function(button){
 if(button.dataset.action==='auto-search-now'){await runNow(button.dataset.id);return}
 return prevAction(button);
};

window.INFLY_AUTO={runNow};
})();