const crypto=require('crypto');
function n(v){if(typeof v==='number')return v;const s=String(v||'').replace(/,/g,'').trim();if(/^<\s*10$/.test(s))return 5;const x=parseInt(s,10);return Number.isFinite(x)?x:0}
function hints(seed){
 const clean=String(seed||'').replace(/[^가-힣A-Za-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 const words=clean.split(' ').filter(x=>x.length>1);
 const out=[];const add=x=>{x=String(x||'').replace(/\s+/g,'').trim();if(x.length>1&&!out.includes(x))out.push(x)};
 for(let i=0;i<words.length;i++){add(words[i]);if(i+1<words.length)add(words[i]+words[i+1])}
 add(clean);return out.slice(0,5);
}
module.exports = async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const apiKey=process.env.NAVER_AD_API_KEY,secret=process.env.NAVER_AD_SECRET_KEY,customer=process.env.NAVER_AD_CUSTOMER_ID;
 if(!apiKey||!secret||!customer)return res.status(503).json({configured:false,error:'NAVER 검색광고 API 연결이 필요합니다.'});
 try{
  const seed=String(req.body?.seed||'').trim();if(!seed)return res.status(400).json({error:'키워드 기준 제목이 필요합니다.'});
  const hs=hints(seed);const uri='/keywordstool',method='GET',timestamp=String(Date.now());
  const signature=crypto.createHmac('sha256',secret).update(timestamp+'.'+method+'.'+uri).digest('base64');
  const q=new URLSearchParams({hintKeywords:hs.join(','),showDetail:'1'});
  const r=await fetch('https://api.searchad.naver.com'+uri+'?'+q.toString(),{headers:{'X-Timestamp':timestamp,'X-API-KEY':apiKey,'X-Customer':String(customer),'X-Signature':signature}});
  const data=await r.json();if(!r.ok)throw new Error(data?.title||data?.detail||('NAVER API '+r.status));
  const list=Array.isArray(data.keywordList)?data.keywordList:[];
  const items=list.map(x=>({keyword:String(x.relKeyword||'').trim(),pc:n(x.monthlyPcQcCnt),mobile:n(x.monthlyMobileQcCnt),competition:x.compIdx||''}))
   .map(x=>({...x,total:x.pc+x.mobile})).filter(x=>x.keyword&&x.total>=200).sort((a,b)=>b.total-a.total).slice(0,15);
  res.setHeader('Cache-Control','no-store');return res.status(200).json({configured:true,items});
 }catch(e){return res.status(502).json({configured:true,error:e.message||'키워드 조회 실패'})}
}