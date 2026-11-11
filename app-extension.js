(function(){
'use strict';
if(window.__inflyAutoToolsLoaded)return;window.__inflyAutoToolsLoaded=true;

async function apiPost(path,payload){
 const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 let data={};try{data=await r.json()}catch(_){}
 if(!r.ok){const e=Error(data.error||data.message||('요청 실패 ('+r.status+')'));e.data=data;throw e}
 return data;
}
function clean(v){return String(v||'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()}
function localCandidates(title){
 const words=clean(title).split(' ').filter(function(x){return x.length>1});
 const stop=new Set(['후기','추천','총정리','리뷰','정보','방법','소개','정리','여행기','방문기']);
 const useful=words.filter(function(x){return !stop.has(x)}),out=[];
 function add(x){x=String(x||'').replace(/\s+/g,'').trim();if(x.length>1&&!out.includes(x))out.push(x)}
 useful.forEach(function(x,i){add(x);if(i+1<useful.length)add(x+useful[i+1])});add(clean(title));
 return out.slice(0,8);
}
async function getKeywords(seed){
 const fallback=localCandidates(seed).map(function(name){return{name:name,pc:null,mobile:null,total:null,source:'자동 후보 · 검색량 미확인'}});
 try{
  const d=await apiPost('/api/keywords',{seed:seed});
  const items=(d.items||[]).map(function(x){return{name:x.keyword,pc:x.pc,mobile:x.mobile,total:x.total,source:'NAVER SearchAd · 월간 '+num(x.total)}});
  return{configured:true,items:items.length?items:fallback};
 }catch(e){return{configured:false,items:fallback,error:e.data&&e.data.configured===false?'네이버 검색광고 API 연결 필요':e.message}}
}
async function analyze(url){return apiPost('/api/meta',{url:url})}

const baseContentForm=contentForm;
contentForm=function(id){
 baseContentForm(id);
 const c=id?state.contents.find(function(x){return x.id===id}):null;
 const url=$('f-url'),kw=$('f-keywords'),form=$('modalForm');
 if(!url||!kw||!form)return;
 let suggested=new Map();

 const urlWrap=url.parentElement;
 const a=document.createElement('div');a.className='flex wrap';a.style.marginTop='7px';
 a.innerHTML='<button type="button" class="btn tiny" id="autoAnalyzeBtn">URL 분석 · 자동 입력</button><small id="autoAnalyzeStatus">제목 · 작성자 · 게시일을 자동으로 확인합니다.</small>';
 urlWrap.appendChild(a);

 const kwWrap=kw.parentElement;
 const b=document.createElement('div');b.className='flex wrap';b.style.marginTop='7px';
 b.innerHTML='<button type="button" class="btn tiny" id="autoKeywordBtn">월검색량 200+ 키워드 찾기</button><small id="autoKeywordStatus">네이버 검색광고 API 연결 시 검색량 기준으로 추천합니다.</small>';
 kwWrap.appendChild(b);

 async function runKeywords(){
  const s=$('autoKeywordStatus'),title=$('f-titleKo').value.trim();s.textContent='키워드 확인 중…';
  const r=await getKeywords(title);suggested=new Map((r.items||[]).map(function(x){return[x.name,x]}));
  if(r.items&&r.items.length)kw.value=r.items.map(function(x){return x.name}).join('\n');
  s.textContent=r.configured?'월검색량 200+ 키워드 '+(r.items||[]).length+'개 추천':(r.error||'검색량 API 미연결 · 제목 기반 후보 제안');
 }
 async function runAnalyze(){
  const s=$('autoAnalyzeStatus');if(!url.value.trim())return;s.textContent='URL 분석 중…';
  try{
   const d=await analyze(url.value.trim());
   if(d.channel)$('f-channel').value=d.channel;
   if(d.author)$('f-author').value=d.author;
   if(d.title)$('f-titleKo').value=d.title;
   if(d.publishedAt){try{$('f-publishedAt').value=kstInput(new Date(d.publishedAt))}catch(_){}}
   s.textContent='자동 입력 완료';await runKeywords();
  }catch(e){s.textContent='자동 분석 실패 · 직접 입력 가능 ('+e.message+')'}
 }
 $('autoAnalyzeBtn').onclick=runAnalyze;$('autoKeywordBtn').onclick=runKeywords;
 if(!c)url.addEventListener('change',runAnalyze);

 form.addEventListener('submit',function(){
  const savedUrl=url.value.trim(),cache=new Map(suggested),stamp=kstInput().slice(0,10);
  if(!cache.size)return;
  setTimeout(function(){
   const target=state.contents.find(function(x){return canonicalUrl(x.url)===canonicalUrl(savedUrl)&&x.projectId===projectId});
   if(!target)return;
   commit(function(s){
    const t=s.contents.find(function(x){return x.id===target.id});if(!t)return;
    t.keywords.forEach(function(k){const v=cache.get(k.name);if(v){k.pc=v.pc;k.mobile=v.mobile;k.source=v.source;k.volumeDate=v.total!=null?stamp:''}})
   }).then(render).catch(function(){});
  },250);
 },{once:true});
};

let bulkDraft=[];
function bulkModal(){
 if(!proj()){newProject();return}
 bulkDraft=[];
 modal('여러 콘텐츠 등록','URL을 최대 20개까지 붙여넣고 한 번에 분석·등록합니다.',
 '<form id="bulkForm"><div class="modal-body">'+
 '<div class="field"><label>콘텐츠 URL · 한 줄에 하나씩</label><textarea id="bulkUrls" style="min-height:150px" placeholder="https://blog.naver.com/...&#10;https://cafe.naver.com/...&#10;https://www.instagram.com/p/..."></textarea><small>중복 URL은 자동 제외합니다.</small></div>'+
 '<div class="form-grid" style="margin-top:15px"><div class="field"><label>기본 확인 기기</label><select id="bulkDevice"><option value="mobile">모바일 통합검색</option><option value="pc">PC 통합검색</option></select></div><div class="field"><label>모니터링 모드</label><select id="bulkMode"><option value="auto">자동 · 11회 일정</option><option value="manual">수동</option></select></div></div>'+
 '<div class="flex wrap" style="margin-top:15px"><button type="button" class="btn primary" data-action="bulk-analyze">URL 전체 분석</button><span class="small muted" id="bulkStatus">제목 · 작성자 · 게시일 · 키워드를 자동으로 불러옵니다.</span></div>'+
 '<div id="bulkPreview" style="margin-top:18px"></div></div>'+
 '<div class="modal-foot"><button type="button" class="btn" data-action="close">취소</button><button type="button" class="btn primary" id="bulkSave" data-action="bulk-save" disabled>분석 결과 등록</button></div></form>');
}
function drawBulk(){
 const el=$('bulkPreview');if(!el)return;
 el.innerHTML=bulkDraft.map(function(d,i){
  return '<div class="panel" style="margin-bottom:12px"><div class="panel-content">'+
   '<div class="flex between wrap"><span class="channel '+d.channel+'">'+channelName(d.channel)+'</span><span class="badge '+(d.keywordConfigured?'green':'amber')+'">'+(d.keywordConfigured?'검색량 200+ 확인':'검색량 미확인 후보')+'</span></div>'+
   '<div class="field" style="margin-top:10px"><label>URL</label><input value="'+esc(d.url)+'" readonly></div>'+
   '<div class="form-grid" style="margin-top:10px"><div class="field"><label>제목 *</label><input id="bulk-title-'+i+'" value="'+esc(d.title)+'"></div><div class="field"><label>작성자</label><input id="bulk-author-'+i+'" value="'+esc(d.author||'')+'"></div></div>'+
   '<div class="form-grid" style="margin-top:10px"><div class="field"><label>게시 일시</label><input id="bulk-date-'+i+'" type="datetime-local" value="'+esc(d.localDate)+'"></div><div class="field"><label>키워드</label><textarea id="bulk-keywords-'+i+'" style="min-height:78px">'+esc(d.keywords.map(function(k){return k.name}).join('\n'))+'</textarea></div></div>'+
   '</div></div>';
 }).join('');
}
async function bulkAnalyze(){
 const status=$('bulkStatus');let urls=[...new Set($('bulkUrls').value.split(/\n/).map(function(x){return x.trim()}).filter(Boolean))];
 if(!urls.length)throw Error('URL을 한 개 이상 입력하세요.');if(urls.length>20)throw Error('한 번에 최대 20개까지 등록할 수 있습니다.');
 urls=urls.filter(function(url){return !state.contents.some(function(x){return x.projectId===projectId&&canonicalUrl(x.url)===canonicalUrl(url)})});
 if(!urls.length)throw Error('모두 이미 등록된 URL입니다.');
 bulkDraft=[];$('bulkSave').disabled=true;
 for(let i=0;i<urls.length;i++){
  const url=validUrl(urls[i]);status.textContent=(i+1)+'/'+urls.length+' 분석 중…';
  let meta={};try{meta=await analyze(url)}catch(_){}
  const title=meta.title||'제목 확인 필요',k=await getKeywords(title);
  bulkDraft.push({url:url,channel:meta.channel||detectChannel(url)||'blog',title:title,author:meta.author||'',localDate:meta.publishedAt?kstInput(new Date(meta.publishedAt)):kstInput(new Date()),keywords:(k.items&&k.items.length)?k.items:localCandidates(title).map(function(name){return{name:name,pc:null,mobile:null,total:null,source:'자동 후보 · 검색량 미확인'}}),keywordConfigured:k.configured});
  drawBulk();
 }
 status.textContent=bulkDraft.length+'개 분석 완료 · 확인 후 등록하세요.';$('bulkSave').disabled=false;
}
async function bulkSave(){
 if(!bulkDraft.length)return;
 const device=$('bulkDevice').value,mode=$('bulkMode').value,items=[];
 bulkDraft.forEach(function(d,i){
  const title=$('bulk-title-'+i).value.trim();if(!title)throw Error((i+1)+'번째 콘텐츠 제목을 입력하세요.');
  let names=[...new Set($('bulk-keywords-'+i).value.split(/[,\n]/).map(function(x){return x.trim()}).filter(Boolean))];if(!names.length)names=localCandidates(title).slice(0,3);
  const details=new Map(d.keywords.map(function(k){return[k.name,k]})),stamp=kstInput().slice(0,10);
  items.push({id:uid(),projectId:projectId,channel:d.channel,titleKo:title,titleEn:'',author:$('bulk-author-'+i).value.trim(),url:d.url,publishedAt:isoKst($('bulk-date-'+i).value),registeredAt:new Date().toISOString(),mode:mode,device:device,keywords:names.slice(0,30).map(function(name){const v=details.get(name)||{};return{id:uid(),name:name,pc:v.pc??null,mobile:v.mobile??null,source:v.source||'',volumeDate:v.total!=null?stamp:''}}),internalNote:'',demo:false});
 });
 await commit(function(s){s.contents.push(...items)});$('modal').close();render();toast(items.length+'개 콘텐츠를 한 번에 등록했습니다.');
}

const baseActionAuto=action;
action=async function(button){
 const a=button.dataset.action;
 if(a==='add-content-bulk'){bulkModal();return}
 if(a==='bulk-analyze'){await bulkAnalyze();return}
 if(a==='bulk-save'){await bulkSave();return}
 return baseActionAuto(button);
};

if(typeof render==='function')render();
})();