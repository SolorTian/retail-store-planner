const ORIGIN='https://solortian.github.io',PROJECT='https://kzzyeoehfbvslxfcyayi.supabase.co';
export async function reportHandler(request,env,fetcher=fetch){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(request.headers.get('Origin')!==ORIGIN)return reply(403,{error:'不允許的來源'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'僅接受 POST'});
 const authorization=request.headers.get('Authorization');if(!/^Bearer \S+$/.test(authorization||''))return reply(401,{error:'請先登入'});
 if(!env.PLANNER_GITHUB_TOKEN||!env.SUPABASE_SECRET_KEY||!env.SUPABASE_PUBLISHABLE_KEY)return reply(503,{error:'專案查詢服務尚未設定'});
 try{
  const input=await request.json();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id||''))return reply(400,{error:'請求格式不符'});
  const call=async(name,body,server=false)=>{const key=server?env.SUPABASE_SECRET_KEY:env.SUPABASE_PUBLISHABLE_KEY;const r=await fetcher(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,...(!server||!key.startsWith('sb_secret_')?{Authorization:server?'Bearer '+key:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(r.status===401||r.status===403?'permission':'request');return r.json();};
  // The authenticated RPC verifies the primary administrator and its own binding.
  const state=await call('planner_survey_request',{request_id:input.id,project_id:input.projectId||null});
  const claim=await call('planner_survey_worker',{action:'dispatch',request_id:state.id},true);
  if(claim.dispatch){const sent=await fetcher('https://api.github.com/repos/SolorTian/retail-store-planner/actions/workflows/ttl-survey-projects.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+env.PLANNER_GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'RetailPlannerSurvey','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{request_id:state.id}}),signal:AbortSignal.timeout(20000)});if(!sent.ok)return reply(503,{error:'背景讀取啟動尚未確認，請稍後查看狀態。',id:state.id});}
  return reply(200,state);
 }catch(e){return reply(e.message==='permission'?403:503,{error:e.message==='permission'?'此功能僅限管理者田琰澤使用':'報表讀取未啟動，請確認專案日期、業務王綁定，或等待目前的讀取完成。'});}
}
Deno.serve(request=>reportHandler(request,{PLANNER_GITHUB_TOKEN:Deno.env.get('PLANNER_GITHUB_TOKEN'),SUPABASE_PUBLISHABLE_KEY:JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default,SUPABASE_SECRET_KEY:JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default}));
