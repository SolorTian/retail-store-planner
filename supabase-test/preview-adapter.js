let supabasePlannerClient;const plannerAuthListeners=new Set();let plannerRefreshSubscriptions=()=>{};
function plannerResult(r){if(r.error)throw Error(r.error.message);return r.data;}
function plannerSnapshot(id,data,revision=0){return {id,_revision:revision,exists:()=>data!=null,data:()=>structuredClone(data)};}
function previewRef(base,...parts){return {path:[base?.path||'',...parts].filter(Boolean).join('/'),type:'reference'};}
async function initializeSupabasePlanner(){
 const source=await previewDataPromise,rows=source.documents,uid=source.person.uid;
 const read=async ref=>{const p=ref.path.split('/');if(p[0]==='route_map_test_shared')return plannerSnapshot(p[1],source.rules,source.rules?.revision||0);if(p[0]==='route_map_test_presence'||p[0]==='route_map_test_access')return {docs:[]};if(p[1]!==uid)throw Error('模擬檢視限選定帳戶');if(p[2]==='settings'&&p[3]==='ttlCredential')return plannerSnapshot(p[3],{envelope:'preview-only-not-a-credential',verified:true,accountLabel:'模擬檢視（未載入帳密）'});if(p[2]==='settings'&&p[3]==='accessControl')return plannerSnapshot(p[3],{active:true});const selected=rows.filter(r=>r.bucket===p[2]&&(!p[3]||r.document_id===p[3]));return p[3]?plannerSnapshot(p[3],selected[0]?.data??null,selected[0]?.revision||0):{docs:selected.map(r=>plannerSnapshot(r.document_id,r.data,r.revision))};};
 const blocked=()=>{throw Error('模擬檢視：不能儲存或更新資料');};
 const api={doc:(b,...p)=>({...previewRef(b,...p),type:'document'}),collection:(b,...p)=>({...previewRef(b,...p),type:'collection'}),query:r=>r,orderBy:()=>({}),limit:()=>({}),getDoc:read,getDocs:read,serverTimestamp:()=>new Date().toISOString(),writeBatch:()=>({set:()=>{},delete:()=>{},commit:async()=>blocked()}),runTransaction:async()=>blocked(),onSnapshot(ref,next,error){let active=true;read(ref).then(s=>{if(active)next(s);}).catch(e=>{if(active)error?.(e);});return ()=>{active=false;};}};
 supabasePlannerClient={rpc:async(name)=>name==='planner_daily_refresh'?{data:{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),status:'done'}}:name==='planner_cleanup_own'?{data:{}}:{error:{message:'模擬檢視不執行後端操作'}},auth:{},channel:()=>({on(){return this;},subscribe(){return this;}})};
 const user={uid,email:source.person.email,displayName:source.person.name||source.person.email,emailVerified:true,getIdToken:async()=>blocked()};
 const auth={onAuthStateChanged(_auth,fn){setTimeout(()=>fn(user),0);return ()=>{};},signOut:async()=>blocked(),GoogleAuthProvider:class{setCustomParameters(){}},signInWithPopup:async()=>blocked()};
 return {api,auth,client:supabasePlannerClient};
}
