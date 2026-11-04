const PROJECT='https://kzzyeoehfbvslxfcyayi.supabase.co',ORIGIN='https://solortian.github.io';
export async function visitHandler(request,env,fetcher=fetch){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-planner-account','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(request.headers.get('Origin')!==ORIGIN)return reply(403,{error:'不允許的來源'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const authorization=request.headers.get('Authorization');if(!/^Bearer \S+$/.test(authorization||''))return reply(401,{error:'請先登入'});
 if(!env.PLANNER_GITHUB_TOKEN||!env.SUPABASE_PUBLISHABLE_KEY)return reply(503,{error:'更新服務尚未設定'});
 try{
  const user=await fetcher(PROJECT+'/auth/v1/user',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization},signal:AbortSignal.timeout(15000)});if(!user.ok)return reply(401,{error:'請重新確認登入'});
  const scope=request.headers.get('x-planner-account');if(scope&&scope!=='1502')return reply(400,{error:'無效的帳號範圍'});
  const context=await fetcher(PROJECT+'/rest/v1/rpc/planner_visit_context',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({shared:scope==='1502'}),signal:AbortSignal.timeout(15000)});
  if(!context.ok)return reply(context.status===401?401:403,{error:'沒有更新此帳號的權限，或尚未設定業務王帳號'});
  const binding=await context.json(),path=new URL(request.url).searchParams.get('path')||'';
  let body;
  if(request.method==='POST'&&path==='/actions/workflows/ttl-visit-sync.yml/dispatches'){
   const input=await request.json(),i=input.inputs||{};
   if(input.ref!=='main'||!['visits','customers','all','work','fuel'].includes(i.dataset)||!/^20\d{2}$/.test(String(i.year))||!/^([1-9]|1[0-2])$/.test(String(i.month||1))||!/^[a-f0-9]{32}$/.test(i.request_id||'')||!/^[A-Za-z0-9+/=]{300,1200}$/.test(i.public_key||'')||i.credential_blob&&i.credential_blob!==binding.envelope)return reply(400,{error:'更新參數或帳號已變更，請重新載入帳號設定'});
   body=JSON.stringify({ref:'main',inputs:{year:String(i.year),month:String(i.month||1),dataset:i.dataset,request_id:i.request_id,public_key:i.public_key,credential_blob:binding.envelope,user_id:binding.uid}});
  }else if(request.method!=='GET'||!(/^\/actions\/workflows\/ttl-visit-sync\.yml\/runs\?event=workflow_dispatch&per_page=30$/.test(path)||/^\/actions\/runs\/\d{6,20}$/.test(path)))return reply(400,{error:'不允許的更新操作'});
  const result=await fetcher('https://api.github.com/repos/SolorTian/retail-store-planner'+path,{method:request.method,headers:{Authorization:'Bearer '+env.PLANNER_GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RetailPlannerVisit','X-GitHub-Api-Version':'2022-11-28'},...(body?{body}:{}),signal:AbortSignal.timeout(20000)});
  if(!result.ok)return reply(result.status===401||result.status===403?503:502,{error:result.status===401||result.status===403?'更新服務授權異常，請管理者檢查後台 GitHub 權限':'GitHub 更新服務暫時無法回應，原資料保留'});
  return reply(200,result.status===204?{}:await result.json());
 }catch{return reply(503,{error:'更新服務暫時無法回應，原資料保留，請稍後重試'});}
}
Deno.serve(request=>visitHandler(request,{PLANNER_GITHUB_TOKEN:Deno.env.get('PLANNER_GITHUB_TOKEN'),SUPABASE_PUBLISHABLE_KEY:JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default}));

