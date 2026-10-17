const test=require('node:test'),assert=require('node:assert/strict');
const env={SUPABASE_URL:'https://kzzyeoehfbvslxfcyayi.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test',PLANNER_GITHUB_TOKEN:'github-test'};
const request=(options={})=>new Request('https://example.test',{method:'POST',headers:{Origin:'https://solortian.github.io',Authorization:'Bearer user-test'},...options});
async function run(req,fetcher,settings=env){const {handler}=await import('../supabase/functions/planner-daily/handler.mjs');return handler(req,settings,fetcher);}
test('anonymous request cannot enqueue',async()=>{
 const r=await run(request({headers:{Origin:'https://solortian.github.io'}}),()=>{throw Error('network must not run');});assert.equal(r.status,401);
});
test('wrong origin cannot enqueue',async()=>{const r=await run(request({headers:{Origin:'https://evil.test',Authorization:'Bearer test'}}),()=>{throw Error();});assert.equal(r.status,403);});
test('unverified session cannot reach database',async()=>{let calls=0;const r=await run(request(),async()=>{calls++;return new Response('{}',{status:401});});assert.equal(r.status,401);assert.equal(calls,1);});
test('disabled user is rejected by database permission gate',async()=>{const r=await run(request(),async url=>new Response('{}',{status:url.includes('/auth/')?200:403}));assert.equal(r.status,403);});
test('only one claimed dispatch sends a fixed workflow and server date',async()=>{
 const calls=[];const r=await run(request({body:JSON.stringify({owner:'victim',day:'2000-01-01'})}),async(url,options={})=>{
  calls.push({url,options});
  if(url.includes('/auth/'))return Response.json({id:'user'});
  if(url.endsWith('planner_daily_open'))return Response.json({day:'2026-10-16',status:'pending',total:4,done:0});
  if(url.includes('api.github'))return new Response(null,{status:204});
  const body=JSON.parse(options.body);return Response.json(body.action==='dispatch'?{dispatch:true,lease:'test-lease'}:{accepted:true});
 });
 assert.equal(r.status,200);assert.equal((await r.json()).status,'pending');
 const dispatch=calls.find(c=>c.url.includes('api.github'));
 assert.deepEqual(JSON.parse(dispatch.options.body),{ref:'main',inputs:{batch_day:'2026-10-16'}});
 assert.deepEqual(JSON.parse(calls.find(c=>c.url.endsWith('planner_daily_open')).options.body),{manual:false,request_id:null});
 assert.equal(calls.find(c=>c.url.endsWith('planner_daily_open')).options.headers.Authorization,'Bearer user-test');
});
test('busy dispatch never starts duplicate workflow',async()=>{
 let github=0;const r=await run(request(),async url=>{
  if(url.includes('github'))github++;
  return Response.json(url.includes('/auth/')?{}:url.endsWith('planner_daily_open')?{day:'2026-10-16',status:'pending'}:{dispatch:false});
 });assert.equal(r.status,200);assert.equal(github,0);
});
test('failed GitHub dispatch cannot report completion',async()=>{
 const r=await run(request(),async(url,options={})=>{
  if(url.includes('/auth/'))return Response.json({});
  if(url.endsWith('planner_daily_open'))return Response.json({day:'2026-10-16',status:'pending'});
  if(url.includes('github'))return new Response('{}',{status:503});
  return Response.json({dispatch:true,lease:'test'});
 });assert.equal(r.status,503);assert.equal((await r.json()).status,'pending');
});
test('preflight is allowed without authorization',async()=>{const r=await run(request({method:'OPTIONS'}),()=>{throw Error();});assert.equal(r.status,204);});


test('manual requests need an id and cannot choose target accounts or dates',async()=>{const id='11111111-1111-4111-8111-111111111111';let open;const r=await run(request({body:JSON.stringify({mode:'manual',requestId:id,target:'victim',day:'2000-01-01'})}),async(url,options={})=>{if(url.includes('/auth/'))return Response.json({id:'admin'});if(url.endsWith('planner_daily_open')){open=JSON.parse(options.body);return Response.json({day:'2026-10-17',status:'pending'});}return Response.json({dispatch:false});});assert.equal(r.status,200);assert.deepEqual(open,{manual:true,request_id:id});const invalid=await run(request({body:'{"mode":"manual"}'}),async()=>Response.json({id:'admin'}));assert.equal(invalid.status,400);});
test('new secret keys are sent only as apikey and never as JWT bearer',async()=>{const settings={...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fake_test_key'};let saw=false;const r=await run(request(),async(url,options={})=>{if(url.includes('/auth/'))return Response.json({id:'admin'});if(url.endsWith('planner_daily_open'))return Response.json({day:'2026-10-17',status:'pending'});saw=true;assert.equal(options.headers.apikey,'sb_secret_fake_test_key');assert.equal(options.headers.Authorization,undefined);return Response.json({dispatch:false});},settings);assert.equal(r.status,200);assert.equal(saw,true);});

