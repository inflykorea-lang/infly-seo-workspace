const ALLOWED = new Set(['blog.naver.com','m.blog.naver.com','cafe.naver.com','m.cafe.naver.com','instagram.com','www.instagram.com']);
function decode(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()}
function pick(html,patterns){for(const p of patterns){const m=html.match(p);if(m&&m[1])return decode(m[1])}return ''}
function abs(base,src){try{return new URL(src,base).href}catch(_){return ''}}
function channel(host){if(host.includes('blog.naver.com'))return 'blog';if(host.includes('cafe.naver.com'))return 'cafe';return 'instagram'}
async function load(url){
 const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; InflySEO/1.0)','accept-language':'ko-KR,ko;q=0.9,en;q=0.8'}});
 if(!r.ok)throw new Error('페이지를 불러오지 못했습니다. HTTP '+r.status);
 return {html:await r.text(),url:r.url||url};
}
module.exports = async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 try{
  const raw=String(req.body?.url||'').trim();const u=new URL(raw);
  if(!ALLOWED.has(u.hostname.toLowerCase()))return res.status(400).json({error:'지원하지 않는 URL입니다.'});
  let page=await load(raw),html=page.html,base=page.url;
  if(u.hostname.includes('blog.naver.com')){
   const frame=html.match(/<iframe[^>]+(?:id=["']mainFrame["'][^>]+src|src)=["']([^"']+)["']/i);
   if(frame&&frame[1]){try{page=await load(abs(base,frame[1]));html=page.html;base=page.url}catch(_){}}
  }
  const title=pick(html,[
   /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
   /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
   /<title[^>]*>([^<]+)<\/title>/i,
   /"title"\s*:\s*"([^"]+)"/i
  ]).replace(/\s*[:|\-]\s*네이버\s*블로그\s*$/,'').trim();
  let author=pick(html,[
   /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
   /"nickName"\s*:\s*"([^"]+)"/i,
   /"nickname"\s*:\s*"([^"]+)"/i,
   /"blogName"\s*:\s*"([^"]+)"/i,
   /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i
  ]);
  if(!author&&u.hostname.includes('instagram.com')){
   const og=pick(html,[/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i]);
   const m=og.match(/^(.+?)\s+on Instagram/i);if(m)author=m[1];
  }
  const publishedRaw=pick(html,[
   /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
   /"datePublished"\s*:\s*"([^"]+)"/i,
   /"publishDate"\s*:\s*"([^"]+)"/i,
   /"addDate"\s*:\s*"([^"]+)"/i
  ]);
  let publishedAt=null;if(publishedRaw){const d=new Date(publishedRaw);if(Number.isFinite(d.getTime()))publishedAt=d.toISOString()}
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({url:raw,channel:channel(u.hostname.toLowerCase()),title:title||'',author:author||'',publishedAt});
 }catch(e){return res.status(400).json({error:e.message||'분석하지 못했습니다.'})}
}