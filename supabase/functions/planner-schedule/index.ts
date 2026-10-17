const ORIGIN='https://solortian.github.io',PROJECT='https://kzzyeoehfbvslxfcyayi.supabase.co';
export async function scheduleHandler(request,env,fetcher=fetch){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(request.headers.get('Origin')!==ORIGIN)return reply(403,{error:'不允許的來源'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'僅接受 POST'});
 const authorization=request.headers.get('Authorization');if(!/^Bearer \S+$/.test(authorization||''))return reply(401,{error:'請先登入'});
 if(!env.PLANNER_GITHUB_TOKEN||!env.SUPABASE_SECRET_KEY||!env.SUPABASE_PUBLISHABLE_KEY)return reply(503,{error:'排班服務尚未設定'});
 try{
  const user=await fetcher(PROJECT+'/auth/v1/user',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization},signal:AbortSignal.timeout(15000)});if(!user.ok)return reply(401,{error:'請重新確認登入'});
  const input=await request.json();if(!['prepare','commit','dispatch'].includes(input.action)||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id||''))return reply(400,{error:'排班請求格式錯誤'});
  const call=async(name,body,server=false)=>{const r=await fetcher(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:server?env.SUPABASE_SECRET_KEY:env.SUPABASE_PUBLISHABLE_KEY,...(!server?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok){if(r.status===401||r.status===403)throw Error('permission');throw Error('request');}return r.json();};
  // Owner and administrator checks always run with the authenticated user first.
  const state=await call('planner_schedule',{action:input.action==='dispatch'?'status':input.action,request_id:input.id,period:input.period||null,payload:input.action==='commit'?input.plan:{}});
  const claim=await call('planner_schedule_worker',{action:'dispatch',request_id:input.id},true);
  if(claim.dispatch){
   const r=await fetcher('https://api.github.com/repos/SolorTian/retail-store-planner/actions/workflows/ttl-admin-schedule.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+env.PLANNER_GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RetailPlannerSchedule','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{request_id:input.id}}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)return reply(503,{error:'排班工作啟動未確認，請稍後重新確認狀態。',id:input.id});
  }
  return reply(200,state);
 }catch(error){return reply(error.message==='permission'?403:503,{error:error.message==='permission'?'僅限已授權管理者使用':'排班服務未完成；請確認月份、店家、流程與進行中的請求。'});}
}
Deno.serve(request=>scheduleHandler(request,{
 PLANNER_GITHUB_TOKEN:Deno.env.get('PLANNER_GITHUB_TOKEN'),
 SUPABASE_PUBLISHABLE_KEY:JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default,
 SUPABASE_SECRET_KEY:JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default
}));

