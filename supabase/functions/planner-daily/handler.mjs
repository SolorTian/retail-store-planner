const ALLOWED_ORIGIN='https://solortian.github.io';
const PROJECT='https://kzzyeoehfbvslxfcyayi.supabase.co';
const DISPATCH='https://api.github.com/repos/SolorTian/retail-store-planner/actions/workflows/ttl-global-daily.yml/dispatches';
export async function handler(request,env,fetcher=fetch){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store',
  'Access-Control-Allow-Origin':ALLOWED_ORIGIN,'Vary':'Origin',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(request.headers.get('Origin')!==ALLOWED_ORIGIN)return reply(403,{error:'Origin not allowed'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'POST required'});
 const authorization=request.headers.get('Authorization');
 if(!/^Bearer \S+$/.test(authorization||''))return reply(401,{error:'Sign in required'});
 if(env.SUPABASE_URL!==PROJECT||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!env.PLANNER_GITHUB_TOKEN)
  return reply(503,{error:'Daily service not configured'});
 try{
  // Verify with Auth, not by decoding/trusting caller-supplied JWT claims.
  const user=await fetcher(PROJECT+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:authorization},signal:AbortSignal.timeout(15000)});
  if(!user.ok)return reply(401,{error:'Sign in required'});
  const rpc=async(name,body,server=false)=>{
   const key=server?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_ANON_KEY;
   const result=await fetcher(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,
    ...(!server||!key.startsWith('sb_secret_')?{Authorization:server?'Bearer '+key:authorization}:{}),'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   if(!result.ok)throw new Error(result.status===401||result.status===403?'permission':'database');
   return result.json();
  };
  // Empty request: the caller cannot select other users, a date, or a credential.
  let input={};try{input=JSON.parse(await request.text()||'{}');}catch{return reply(400,{error:'Invalid request'});}
  if(input.mode!==undefined&&!['daily','manual'].includes(input.mode))return reply(400,{error:'Invalid mode'});
  const manual=input.mode==='manual';
  if(manual&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||''))return reply(400,{error:'Manual request ID required'});
  const state=await rpc('planner_daily_open',{manual,request_id:manual?input.requestId:null});
  const claim=await rpc('planner_daily_worker',{action:'dispatch',batch_day:state.day},true);
  let dispatch='already_requested';
  if(claim.dispatch){
   const sent=await fetcher(DISPATCH,{method:'POST',headers:{Authorization:'Bearer '+env.PLANNER_GITHUB_TOKEN,
    Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RetailPlannerDaily',
    'X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{batch_day:state.day}}),
    signal:AbortSignal.timeout(20000)});
   if(!sent.ok)return reply(503,{...state,dispatch:'failed',error:'Background dispatch failed; batch remains pending'});
   // A lost response can dispatch twice, but fenced database claims prevent duplicate publication.
   await rpc('planner_daily_worker',{action:'dispatched',batch_day:state.day,lease:claim.lease},true);
   dispatch='requested';
  }
  return reply(200,{...state,dispatch});
 }catch(error){
  return reply(error.message==='permission'?403:503,{error:error.message==='permission'?'Active verified member required':'Daily service unavailable; completion is not confirmed'});
 }
}

