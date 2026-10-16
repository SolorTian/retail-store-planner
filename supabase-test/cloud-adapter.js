// UI compatibility layer backed entirely by Supabase. No Firebase SDK is loaded.
let supabasePlannerClient;
let plannerRefreshSubscriptions=()=>{};
const plannerAuthListeners=new Set();
let plannerTokenRefresh=null;
async function plannerAccessToken(uid,force=false){
 let data=plannerResult(await supabasePlannerClient.auth.getSession()),session=data.session;
 if(!session||session.user?.id!==uid)throw Error('登入帳號已變更，請重新登入');
 if(force||!Number.isFinite(session.expires_at)||session.expires_at*1000<=Date.now()+60000){
  if(!plannerTokenRefresh){const pending=supabasePlannerClient.auth.refreshSession();plannerTokenRefresh=pending;pending.finally(()=>{if(plannerTokenRefresh===pending)plannerTokenRefresh=null;}).catch(()=>{});}
  session=plannerResult(await plannerTokenRefresh).session;
 }
 if(!session||session.user?.id!==uid)throw Error('登入帳號已變更，請重新登入');
 return session.access_token;
}
function plannerSnapshotSignature(snapshot){
 const rows=snapshot.docs?snapshot.docs.map(d=>[d.id,d._revision,d.data()]):[snapshot.id,snapshot._revision,snapshot.data()];
 return JSON.stringify(rows,(_key,value)=>value&&typeof value.toMillis==='function'?value.toMillis():value);
}
function plannerEventMatches(ref,event){
 if(!event?.table)return true;
 const a=plannerAddress(ref),row=event.new?.owner_id||event.new?.id?event.new:event.old||{};
 if(a.table==='roster'||a.table==='history')return ['planner_members','planner_presence','planner_sessions'].includes(event.table);
 if(a.table!==event.table)return false;
 if(a.table==='planner_shared_rules')return true;
 if(a.owner&&(row.owner_id||row.id)&&a.owner!==(row.owner_id||row.id))return false;
 if(a.bucket&&row.bucket&&a.bucket!==row.bucket)return false;
 return !a.id||!row.document_id||a.id===row.document_id;
}
function plannerResult(result){if(result.error)throw Object.assign(Error(result.error.message),{code:result.error.code});return result.data;}
function plannerRef(base,...parts){const path=[base?.path||'',...parts].filter(Boolean).join('/');return {path,type:'reference'};}
function plannerAddress(ref){const p=ref.path.split('/');if(p[0]==='route_map_test_users'&&p.length>=3)return {table:p[2]==='settings'&&p[3]==='ttlCredential'?'planner_credentials':p[2]==='settings'&&p[3]==='accessControl'?'planner_members':'planner_documents',owner:p[1],bucket:p[2],id:p[3]};if(p[0]==='route_map_test_shared')return {table:'planner_shared_rules',id:p[1]};if(p[0]==='route_map_test_presence')return {table:'roster'};if(p[0]==='route_map_test_access')return {table:'history'};throw Error('Unsupported cloud path');}
function plannerAccessRow(row){for(const key of ['at','lastSeen','loginAt','joinedAt'])if(row[key]){const value=new Date(row[key]);row[key]={toMillis:()=>value.getTime(),toDate:()=>value};}return row;}
function plannerSnapshot(id,data,revision=0){return {id,_revision:revision,exists:()=>data!=null,data:()=>data};}
async function plannerRead(ref){
 const controller=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Object.assign(Error('雲端讀取超過 30 秒，已停止等待；原資料仍保留，請重試。'),{code:'planner/read-timeout'}));controller.abort();},30000);});
 try{return await Promise.race([plannerReadOnce(ref,controller.signal),timeout]);}
 finally{clearTimeout(timer);}
}
async function plannerReadOnce(ref,signal){const a=plannerAddress(ref);let rows;
 if(a.table==='roster'){rows=plannerResult(await supabasePlannerClient.rpc('planner_roster').abortSignal(signal));return {docs:rows.map(x=>plannerSnapshot(x.uid,plannerAccessRow(x)))};}
 if(a.table==='history'){rows=plannerResult(await supabasePlannerClient.rpc('planner_history').abortSignal(signal));return {docs:rows.map((x,i)=>plannerSnapshot(String(i),plannerAccessRow(x)))};}
 if(a.table==='planner_members'){rows=plannerResult(await supabasePlannerClient.from(a.table).select('*').eq('id',a.owner).abortSignal(signal));const x=rows[0];return plannerSnapshot(a.id,x?{active:x.active,joinedAt:x.joined_at,revokedAt:x.revoked_at}:null);}
 if(a.table==='planner_credentials'){rows=plannerResult(await supabasePlannerClient.from(a.table).select('*').eq('owner_id',a.owner).abortSignal(signal));const x=rows[0];return plannerSnapshot(a.id,x?{...x.data,envelope:x.envelope,accountLabel:x.account_label,updatedAt:x.updated_at}:null);}
 if(a.table==='planner_shared_rules'){rows=plannerResult(await supabasePlannerClient.from(a.table).select('*').abortSignal(signal));const x=rows[0];return plannerSnapshot(a.id,x?x.data:null,x?.revision||0);}
 let query=()=>supabasePlannerClient.from(a.table).select('*').eq('owner_id',a.owner).abortSignal(signal).eq('bucket',a.bucket);
 if(a.id){rows=plannerResult(await query().eq('document_id',a.id));const x=rows[0];return plannerSnapshot(a.id,x?x.data:null,x?.revision||0);}
 rows=[];for(let from=0;;from+=1000){const page=plannerResult(await query().order('document_id').range(from,from+999));rows.push(...page);if(page.length<1000)break;}
 return {docs:rows.map(x=>plannerSnapshot(x.document_id,x.data,x.revision))};
}
function plannerOperation(ref,data,remove=false,expected){const a=plannerAddress(ref);if(a.table==='planner_members')return {table:a.table,owner:a.owner,data};return {table:a.table,owner:a.owner,bucket:a.bucket,id:a.id,data,remove,...(expected===undefined?{}:{expected})};}
async function plannerCommit(operations){const member=operations.filter(x=>x.table==='planner_members');if(member.length){if(operations.length!==1)throw Error('Membership operation must be separate');const op=member[0];plannerResult(await supabasePlannerClient.rpc(op.data.active===false?'planner_remove':'planner_join',op.data.active===false?{target:op.owner}:{}));plannerRefreshSubscriptions();return;}
 plannerResult(await supabasePlannerClient.rpc('planner_write',{operations}));plannerRefreshSubscriptions();}
function createPlannerApi(){const subscriptions=new Map();let refreshTimer;
 const pendingRefresh=new Set();const refresh=event=>{for(const entry of subscriptions.values())if(plannerEventMatches(entry.ref,event))pendingRefresh.add(entry);clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const entry of pendingRefresh)entry.read();pendingRefresh.clear();},150);};
 plannerRefreshSubscriptions=refresh;
 supabasePlannerClient.channel('planner-test-changes').on('postgres_changes',{event:'*',schema:'public'},refresh).subscribe();
 return {
  doc:(base,...parts)=>({...plannerRef(base,...parts),type:'document'}),collection:(base,...parts)=>({...plannerRef(base,...parts),type:'collection'}),
  query:(ref,...options)=>({...ref,options}),orderBy:(field,direction)=>({field,direction}),limit:count=>({count}),
  getDoc:plannerRead,getDocs:plannerRead,serverTimestamp:()=>new Date().toISOString(),
  writeBatch(){const operations=[];return {set:(ref,data)=>operations.push(plannerOperation(ref,data)),delete:ref=>operations.push(plannerOperation(ref,null,true)),commit:()=>plannerCommit(operations)};},
  async runTransaction(db,fn){const revisions=new Map(),operations=[];await fn({get:async ref=>{const snapshot=await plannerRead(ref);revisions.set(ref.path,snapshot._revision);return snapshot;},set:(ref,data)=>operations.push(plannerOperation(ref,data,false,revisions.get(ref.path)))});await plannerCommit(operations);},
  onSnapshot(ref,next,error){let entry=subscriptions.get(ref.path);const listener={next,error};if(!entry){entry={ref,listeners:new Set(),busy:false,snapshot:null,signature:null,queued:false,async read(){if(this.busy){this.queued=true;return;}this.busy=true;try{const snapshot=await plannerRead(ref),signature=plannerSnapshotSignature(snapshot);if(signature!==this.signature){this.snapshot=snapshot;this.signature=signature;for(const l of this.listeners)l.next(snapshot);}}catch(e){for(const l of this.listeners)l.error?.(e);}finally{this.busy=false;if(this.queued){this.queued=false;this.read();}}}};subscriptions.set(ref.path,entry);}
   entry.listeners.add(listener);if(entry.snapshot)queueMicrotask(()=>next(entry.snapshot));else entry.read();return ()=>{entry.listeners.delete(listener);if(!entry.listeners.size)subscriptions.delete(ref.path);};}
 };
}
function plannerUser(user){if(!user)return null;return {uid:user.id,email:user.email,emailVerified:!!user.email_confirmed_at,displayName:user.user_metadata?.full_name||user.email,
 async getIdToken(force=false){return plannerAccessToken(user.id,force);}};}

async function initializeSupabasePlanner(){
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
 supabasePlannerClient=createClient(SUPABASE_TEST_CONFIG.url,SUPABASE_TEST_CONFIG.publishableKey,{auth:{storageKey:SUPABASE_TEST_CONFIG.storageKey,flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
 const api=createPlannerApi();let currentUser=null;
 async function receive(session){const user=plannerUser(session?.user);if(currentUser?.uid===user?.uid)return;if(user){const membership=plannerResult(await supabasePlannerClient.from('planner_members').select('id,active').eq('id',user.uid));if(!membership.length)plannerResult(await supabasePlannerClient.rpc('planner_join'));}currentUser=user;for(const fn of plannerAuthListeners)Promise.resolve(fn(user)).catch(e=>{updateCloudUi(e.message||'帳號資料載入失敗，請重新整理');console.error('Planner authentication callback failed',e.code||'unknown');});}
 supabasePlannerClient.auth.onAuthStateChange((event,session)=>{setTimeout(()=>receive(session).catch(e=>updateCloudUi(e.message)),0);});
 const auth={onAuthStateChanged(_auth,fn){plannerAuthListeners.add(fn);setTimeout(()=>fn(currentUser),0);return ()=>plannerAuthListeners.delete(fn);},signOut:async()=>plannerResult(await supabasePlannerClient.auth.signOut()),GoogleAuthProvider:class{parameters={};setCustomParameters(value){this.parameters=value;}},signInWithPopup:async(_auth,provider)=>plannerResult(await supabasePlannerClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:SUPABASE_TEST_CONFIG.redirectUrl,...(Object.keys(provider?.parameters||{}).length?{queryParams:provider.parameters}:{})}}))};
 await receive(plannerResult(await supabasePlannerClient.auth.getSession()).session);return {api,auth,client:supabasePlannerClient};
}
