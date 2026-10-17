const accountDaily36=runDailyRefresh;
let globalDaily36={key:'',next:0,busy:false,loaded:false,state:null};
function globalDailyEnabled36(){return SUPABASE_TEST_CONFIG.dailyRefreshMode==='global';}
function drawGlobalDaily36(){
 if(!globalDailyEnabled36())return;
 const root=document.getElementById('syncReceipt23');if(!root)return;
 const old=root.querySelector('.notice');if(old)old.remove();
 let note=document.getElementById('globalDaily36');
 if(!note){note=document.createElement('p');note.id='globalDaily36';note.className='daily-refresh-note';root.append(note);}
 const s=globalDaily36.state;
 note.textContent=!s?'全站更新由田琰澤當天首次登入開啟時觸發，尚未確認完成。':
  s.status==='not_started'?'今天尚未由主使用者啟動全員更新。':s.status==='done'?'今天的全站資料已更新完成。':s.status==='no_eligible_accounts'?'今天沒有已驗證綁定的可更新帳戶。':
  s.status==='partial_failure'?'全站更新部分失敗，已完成 '+s.done+'／'+s.total+' 個帳戶。':
  '今天的全站資料更新中：'+s.done+'／'+s.total+' 個帳戶完成。';
}
async function refreshCompanyCache36(){
 if(localDirty||cloudBusy)return false;
 const uid=cloudUser?.uid,generation=editGeneration;
 const [customers,visits,master,closed]=await Promise.all([
  firebaseApi.getDocs(cloudCollection('customers')),firebaseApi.getDocs(cloudCollection('visits')),
  firebaseApi.getDoc(firebaseApi.doc(cloudCollection('settings'),'customerMaster')),
  firebaseApi.getDoc(firebaseApi.doc(cloudCollection('settings'),'closedStores'))]);
 if(cloudUser?.uid!==uid||localDirty||cloudBusy||generation!==editGeneration)return false;
 customerDb=customers.docs.map(d=>d.data());excel=visits.docs.map(d=>d.data());
 customerMaster=master.exists()?master.data():null;closedStoreCodes=new Set(closed.exists()?closed.data().codes||[]:[]);
 // Do not reload a route, change selection/order, reset filters, or move the map viewport.
 await fuelSave34;
 await fuelLoad34();
 if(cloudUser?.uid!==uid)return false;
 connectWorkAccount(true);pendingListKey40='';
 cacheState();render();return true;
}
runDailyRefresh=async function(manual=false){
 if(!globalDailyEnabled36())return accountDaily36();
 if(manual&&!isPlannerAdmin())return;
 if(!cloudUser||!membershipReady||membershipRevoked||document.hidden||globalDaily36.busy)return;
 const uid=cloudUser.uid,key=uid+':'+todayRouteDate();
 if(globalDaily36.key!==key)globalDaily36={key,next:0,busy:false,loaded:false,state:null};
 if(!manual&&Date.now()<globalDaily36.next)return;
 globalDaily36.busy=true;drawGlobalControls40();
 try{
  const token=await cloudUser.getIdToken();if(cloudUser?.uid!==uid)return;
  const admin=isPlannerAdmin();
  const response=await fetch(SUPABASE_TEST_CONFIG.url+(admin?'/functions/v1/planner-daily':'/rest/v1/rpc/planner_daily_status'),{
   method:'POST',headers:{Authorization:'Bearer '+token,apikey:SUPABASE_TEST_CONFIG.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(admin?(manual?{mode:'manual',requestId:manualRequest40||(manualRequest40=crypto.randomUUID())}:{mode:'daily'}):{}),
   signal:AbortSignal.timeout(30000)});
  const state=await response.json();
  if(cloudUser?.uid!==uid||key!==uid+':'+todayRouteDate())return;
  if(!response.ok)throw Error(state.error||'全站更新尚未確認');
  if(state.day!==todayRouteDate())throw Error('裝置日期與台灣日期不同，尚未確認今天的更新');
  globalDaily36.state=state;
  if(manual){manualRequest40=null;globalDaily36.loaded=false;}
  if(state.status==='done'){
   if(!globalDaily36.loaded)globalDaily36.loaded=await refreshCompanyCache36();
   globalDaily36.next=globalDaily36.loaded?Infinity:Date.now()+30000;
  }else globalDaily36.next=state.status==='no_eligible_accounts'?Infinity:Date.now()+60000;
 }catch(error){
  globalDaily36.next=Date.now()+60000;
  if(cloudUser?.uid===uid)updateCloudUi('全站更新尚未確認：'+cloudMessage(error));
 }finally{globalDaily36.busy=false;drawGlobalDaily36();drawGlobalControls40();}
};
// Fuel is included by the global worker; manual monthly queries remain available.
const accountFuel36=fuelAuto34;
fuelAuto34=async function(){if(!globalDailyEnabled36())return accountFuel36();if(!plannerAccessReady()||fuelLoading34||document.hidden)return;const key=fuelIdentity34()+':'+currentWorkPeriod();if(fuelContext34===key)return;fuelLoading34=true;try{await fuelLoad34();fuelContext34=key;}catch(error){showFuelError30(error);}finally{fuelLoading34=false;}};
const receipt36=drawReceipt23;
drawReceipt23=function(data){receipt36(data);drawGlobalDaily36();};



let manualRequest40=null;
const globalCard40=document.createElement('article');globalCard40.id='globalRefresh40';globalCard40.className='card';globalCard40.hidden=true;
const globalTitle40=document.createElement('h3');globalTitle40.textContent='全員資料更新';
const globalButton40=makeAction('一鍵更新全部訪員資料',()=>runDailyRefresh(true));globalButton40.className='primary';
const globalMessage40=document.createElement('p');globalMessage40.setAttribute('role','status');
const pendingRows40=document.createElement('div');globalCard40.append(globalTitle40,globalButton40,globalMessage40,pendingRows40);document.getElementById('managerOverview').before(globalCard40);
function drawGlobalControls40(){
 const allowed=isPlannerAdmin()&&plannerAccessReady();globalCard40.hidden=!allowed;
 if(!allowed){pendingRows40.replaceChildren();return;}
 globalButton40.disabled=!globalDailyEnabled36()||globalDaily36.busy||globalDaily36.state?.status==='pending';
 const s=globalDaily36.state;globalMessage40.textContent=!globalDailyEnabled36()?'後端尚未啟用，尚不能更新全員資料。':globalDaily36.busy?'正在確認全員更新狀態…':!s?'每天由主使用者首次開站啟動，其他成員使用已更新資料。':s.status==='done'?'全員更新完成：'+s.done+'／'+s.total+' 位':s.status==='partial_failure'?'更新部分失敗：完成 '+s.done+'／'+s.total+' 位，可按按鈕重試。':s.status==='not_started'?'今天尚未啟動全員更新。':s.status==='no_eligible_accounts'?'沒有可更新的綁定帳戶。':'全員更新進行中：'+s.done+'／'+s.total+' 位。';
}
let pendingListKey40='';
async function loadPendingVisitors40(){
 if(!isPlannerAdmin()||!plannerAccessReady()||activeView!=='admin')return;
 const uid=cloudUser.uid,key=uid+':'+todayRouteDate()+':'+JSON.stringify([...managerPeople.keys()].sort());if(pendingListKey40===key)return;pendingListKey40=key;
 try{const rows=plannerResult(await supabasePlannerClient.rpc('planner_pending_visitors'));if(cloudUser?.uid!==uid||!isPlannerAdmin())return;pendingRows40.replaceChildren();for(const row of rows){const p=document.createElement('p');p.textContent=row.accountLabel+' · '+(row.status==='linked'?'Google 已連結':row.status==='disabled'?'已停用':'待連結 Google')+(row.updatedAt?' · 資料 '+displayAccessTime(row.updatedAt):' · 尚未完成資料更新');pendingRows40.append(p);
 if(row.status==='pending_google'){
  const select=document.createElement('select');select.setAttribute('aria-label',row.accountLabel+' 連結 Google 帳號');select.append(new Option('等待同事登入後，選擇他的 Google 帳號',''));
  for(const person of managerPeople.values())select.append(new Option((person.name||'訪員')+' · '+person.email,person.uid));
  const link=makeAction('連結選定的 Google 帳號',async()=>{if(!select.value||!isPlannerAdmin())return;link.disabled=true;try{plannerResult(await supabasePlannerClient.rpc('planner_link_pending_visitor',{profile:row.id,member:select.value}));pendingListKey40='';await loadPendingVisitors40();await runDailyRefresh(true);}catch(error){globalMessage40.textContent='連結未完成：'+cloudMessage(error);link.disabled=false;}});link.disabled=true;select.onchange=()=>link.disabled=!select.value;pendingRows40.append(select,link);
 }
}}catch{pendingListKey40='';}
}
const globalRender40=render;render=function(){globalRender40();drawGlobalControls40();if(activeView==='admin')loadPendingVisitors40();};
const globalSwitch40=switchView;switchView=function(view){globalSwitch40(view);drawGlobalControls40();if(view==='admin')loadPendingVisitors40();};
drawGlobalControls40();

releaseButton.textContent='v1.40';releaseButton.setAttribute('aria-label','版本 v1.40，查看更新紀錄');const release40=document.createElement('article');release40.className='release-entry';release40.innerHTML='<b>v1.40</b><time>2026-10-17</time><p>管理總覽新增一鍵更新全部訪員資料；每天由主使用者首次開站啟動全員背景更新，一般成員使用已更新資料並可自行手動更新。納入尚未連結 Google 的業務王訪員，之後由管理員連結已驗證的 Google 成員。顯示實際完成／失敗狀態，背景更新不重排已安排路線。</p>';releaseHistory.querySelector('h2').after(release40);

