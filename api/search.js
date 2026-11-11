const chromium=require('@sparticuz/chromium');
const puppeteer=require('puppeteer-core');

function contentKey(raw){
 try{
  let u=new URL(raw);
  const redirectKeys=['url','u','target','redirect','rurl'];
  for(const k of redirectKeys){const v=u.searchParams.get(k);if(v&&/^https?:/i.test(v)){try{return contentKey(decodeURIComponent(v))}catch(_){}}}
  let host=u.hostname.toLowerCase().replace(/^m\./,'').replace(/^www\./,'');
  if(host==='blog.naver.com'){
   let blogId=u.searchParams.get('blogId'),logNo=u.searchParams.get('logNo');
   if(!blogId||!logNo){const p=u.pathname.split('/').filter(Boolean);if(p.length>=2){blogId=p[0];logNo=p[1]}}
   if(blogId&&logNo)return 'blog:'+blogId+':'+String(logNo).replace(/\D/g,'');
  }
  if(host==='cafe.naver.com'){
   let article=u.searchParams.get('articleid')||u.searchParams.get('articleId');
   let club=u.searchParams.get('clubid')||u.searchParams.get('clubId');
   const p=u.pathname.split('/').filter(Boolean);
   const ai=p.indexOf('articles'),ci=p.indexOf('cafes');
   if(!article&&ai>=0)article=p[ai+1];if(!club&&ci>=0)club=p[ci+1];
   if(article)return 'cafe:'+(club||'')+':'+String(article).replace(/\D/g,'');
  }
  if(host==='instagram.com'){
   const p=u.pathname.split('/').filter(Boolean);if(['p','reel','reels'].includes(p[0])&&p[1])return 'ig:'+p[1];
  }
  return host+u.pathname.replace(/\/$/,'');
 }catch(_){return String(raw||'')}
}
function supported(raw){try{const h=new URL(raw).hostname.toLowerCase();return /(^|\.)(blog\.naver\.com|cafe\.naver\.com|instagram\.com)$/.test(h)}catch(_){return false}}

module.exports=async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const keyword=String(req.body?.keyword||'').trim(),targetUrl=String(req.body?.targetUrl||'').trim();
 const device=req.body?.device==='pc'?'pc':'mobile';
 if(!keyword||!targetUrl)return res.status(400).json({error:'keyword와 targetUrl이 필요합니다.'});
 const targetKey=contentKey(targetUrl);
 let browser;
 try{
  browser=await puppeteer.launch({
   args:chromium.args,
   defaultViewport:device==='mobile'?{width:430,height:1000,deviceScaleFactor:1}:{width:1440,height:1000,deviceScaleFactor:1},
   executablePath:await chromium.executablePath(),
   headless:chromium.headless
  });
  const page=await browser.newPage();
  await page.setUserAgent(device==='mobile'
   ?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1'
   :'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36');
  await page.setExtraHTTPHeaders({'accept-language':'ko-KR,ko;q=0.9,en;q=0.7'});
  const searchUrl=(device==='mobile'?'https://m.search.naver.com/search.naver':'https://search.naver.com/search.naver')+'?query='+encodeURIComponent(keyword);
  await page.goto(searchUrl,{waitUntil:'domcontentloaded',timeout:12000});
  await new Promise(r=>setTimeout(r,1000));

  const links=await page.evaluate(()=>Array.from(document.querySelectorAll('a[href]')).map((a,i)=>({i,href:a.href,text:(a.innerText||'').trim().slice(0,180)})));
  const uniq=[],seen=new Set();
  for(const l of links){if(!supported(l.href))continue;const key=contentKey(l.href);if(seen.has(key))continue;seen.add(key);uniq.push({...l,key})}
  const match=uniq.find(x=>x.key===targetKey);
  let found=!!match,rank=found?uniq.indexOf(match)+1:null,area='통합검색',screenshot;

  if(found){
   await page.evaluate((idx)=>{
    const a=Array.from(document.querySelectorAll('a[href]'))[idx];if(!a)return;
    const box=a.closest('li,article,section')||a.closest('div')||a;
    box.setAttribute('data-infly-target','1');
    box.scrollIntoView({block:'center'});
    box.style.outline='4px solid #00a98f';box.style.outlineOffset='4px';
   },match.i);
   await new Promise(r=>setTimeout(r,350));
   const el=await page.$('[data-infly-target="1"]');
   if(el){const box=await el.boundingBox();if(box&&box.height<1600&&box.width>100)screenshot=await el.screenshot({type:'jpeg',quality:55,encoding:'base64'})}
  }
  if(!screenshot){await page.evaluate(()=>window.scrollTo(0,0));screenshot=await page.screenshot({type:'jpeg',quality:45,encoding:'base64',fullPage:false})}

  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
   keyword,targetUrl,device,checkedAt:new Date().toISOString(),found,rank,area,
   scope:'NAVER 통합검색 자동 확인 · 상위 검색 결과 내 지원 콘텐츠 링크 기준',
   screenshot:{name:'naver-'+Date.now()+'.jpg',type:'image/jpeg',data:'data:image/jpeg;base64,'+screenshot}
  });
 }catch(e){
  return res.status(502).json({error:e.message||'자동 검색 실패',checkedAt:new Date().toISOString()});
 }finally{if(browser)await browser.close().catch(()=>{})}
};