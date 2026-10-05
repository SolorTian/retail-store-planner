// Route connectors stay local; no additional coordinate service is contacted.
function drawPlannedConnections(){
 if(!map)return;removeRouteLine();
 if(activeView!=='map'||!plannerAccessReady())return;
 const rows=selectedRecords().filter(x=>validGps(x.gps));if(!rows.length)return;
 const points=rows.map(x=>x.gps.map(Number));if(autoDepotStart)points.unshift(DEPOT.gps.map(Number));points.push(DEPOT.gps.map(Number));
 if(points.length>1)routeLine=L.polyline(points,{color:'#2563eb',weight:4,opacity:.8,dashArray:'8 5',interactive:false}).addTo(map);
}
const connectedMap=updateMap;updateMap=function(fit){connectedMap(fit);drawPlannedConnections();};
const connectedRender=render;render=function(){connectedRender();drawPlannedConnections();};
// Hide the card while retaining its internal target for older render functions.
document.querySelector('.priority-card')?.classList.add('hide');
const focusedOverviewStyle=document.createElement('style');focusedOverviewStyle.textContent='.overview-grid{grid-template-columns:minmax(0,1fr)!important}.daily-refresh-note{font-size:13px;line-height:1.5;color:#63777b}';document.head.append(focusedOverviewStyle);
const clearRouteButton=makeAction('取消全部行程',()=>clearTrip());clearRouteButton.id='clearAllRoute';document.querySelector('.route-controls').append(clearRouteButton);
document.querySelectorAll('button[onclick="clearTrip()"] ').forEach(b=>b.remove());
const connectedClear=clearTrip;clearTrip=function(){if(!plannerAccessReady())return;abortAutoRoute();autoRouteDone='';autoRouteGeometry=null;connectedClear();drawPlannedConnections();};

let dailyRefreshActive=false,dailyRefreshUid=null,dailyRefreshDay=null,dailyRefreshChecked='',dailyRefreshRetryAt=0,dailyRefreshStopped=false,lastCompanyDispatchAt=0;
let dailyLease=null,dailyLeaseRenewTimer=null;
async function dailyRpc(action,lease=null){return plannerResult(await supabasePlannerClient.rpc('planner_daily_refresh',{action,lease}));}
function dailyAccountCurrent(uid,day){return cloudUser?.uid===uid&&todayRouteDate()===day;}
const dailyStatus=setSyncStatus;setSyncStatus=function(message){dailyStatus(message);if(dailyRefreshActive){companyWait.querySelector('h3').textContent="Refreshing today's company data…";document.getElementById('companyWaitMessage').textContent='First visit today takes longer. Later visits use saved data.\n'+message;}};
const manualCompanyUpdate=updateCompanyVisits;
updateCompanyVisits=async function(dataset='visits'){
 lastCompanyDispatchAt=Date.now();const uid=cloudUser?.uid;const result=await manualCompanyUpdate(dataset);
 if(result?.success&&cloudUser?.uid===uid){
  if(dataset==='work'){try{plannerResult(await supabasePlannerClient.rpc('planner_cleanup_own'));}catch(error){showUpdateIssue('工作已更新，但舊資料清理失敗：'+error.message);return {success:false,error:'舊工作資料清理失敗：'+error.message};}}
  if(!dailyRefreshActive&&['all','work'].includes(dataset))await dailyRpc(dataset==='all'?'record_all':'record_work').catch(()=>{});
 }
 return result;
};
const dailyCancel=cancelVisitSync;cancelVisitSync=function(){dailyRefreshStopped=true;dailyRefreshRetryAt=Infinity;dailyCancel();};
async function runDailyRefresh(){
 if(dailyRefreshActive||!plannerAccessReady()||cloudBusy||localDirty||visitSyncBusy||bindingTesting||document.hidden||Date.now()<dailyRefreshRetryAt)return;
 const uid=cloudUser.uid,day=todayRouteDate(),key=uid+':'+day;if(dailyRefreshChecked===key)return;
 dailyRefreshActive=true;dailyRefreshUid=uid;dailyRefreshDay=day;dailyRefreshStopped=false;
 let ownLease=null,waiting=false;
 try{
  await supabasePlannerClient.rpc('planner_cleanup_own').then(plannerResult);
  const state=await dailyRpc('claim');if(!dailyAccountCurrent(uid,day))return;if(state.day!==day)throw Error('手機日期與台灣日期不同，請校正裝置時間後重試');
  if(state.status==='done'){dailyRefreshChecked=key;return;}
  if(state.status==='busy'){dailyRefreshRetryAt=Date.now()+15000;return;}
  if(state.status!=='claimed'||!state.lease)throw Error('每日更新狀態無法讀取，請重新整理');
  ownLease=state.lease;dailyLease=ownLease;beginCompanyWait();waiting=true;setSyncStatus('正在準備每天首次更新…');
  dailyLeaseRenewTimer=setInterval(()=>{if(dailyAccountCurrent(uid,day))dailyRpc('renew',ownLease).catch(()=>{});},60000);
  for(const [dataset,done,action] of [['all',state.allDone,'complete_all'],['work',state.workDone,'complete_work']]){
   if(done)continue;
   if(dailyRefreshStopped||!dailyAccountCurrent(uid,day))throw Error('每日更新已停止，下次開啟會接續更新');
   // The existing Worker permits one dispatch per minute per account.
   const delay=Math.max(0,65000-(Date.now()-lastCompanyDispatchAt));if(delay){setSyncStatus('正在準備下一份資料…');await visitPause(delay,new AbortController().signal);}
   if(dailyRefreshStopped||!dailyAccountCurrent(uid,day))throw Error('每日更新已停止，下次開啟會接續更新');
   const result=await updateCompanyVisits(dataset);if(!result?.success)throw Error(result?.error||'每日更新未完成');
   if(!dailyAccountCurrent(uid,day))throw Error('帳戶或日期已變更，今天的資料會重新更新');
   await dailyRpc(action,ownLease);
  }
  await dailyRpc('finish',ownLease);dailyRefreshChecked=key;setSyncStatus('今天的資料已更新');
 }catch(error){dailyRefreshRetryAt=Infinity;if(ownLease&&cloudUser?.uid===uid)await dailyRpc('fail',ownLease).catch(()=>{});if(cloudUser?.uid===uid&&!document.getElementById('updateIssue').classList.contains('show'))showUpdateIssue(error);}
 finally{clearInterval(dailyLeaseRenewTimer);dailyLeaseRenewTimer=null;dailyLease=null;dailyRefreshActive=false;if(waiting)endCompanyWait();companyWait.querySelector('h3').textContent='正在載入業務王';}
}
const ordinaryUpdateRetry=document.getElementById('updateIssueRetry').onclick;document.getElementById('updateIssueRetry').onclick=()=>{if(dailyRefreshRetryAt===Infinity){closeModal('updateIssue');dailyRefreshRetryAt=0;dailyRefreshChecked='';runDailyRefresh();}else ordinaryUpdateRetry();};
// Clear at Taiwan midnight, including an open/sleeping tab resuming the next day.
const previousTodayCheck=checkTodayRoute;
checkTodayRoute=async function(){
 if(routeDate===todayRouteDate())return;
 const next=todayRouteDate();clearTimeout(autoSaveTimer);abortAutoRoute();autoRouteDone='';autoRouteGeometry=null;removeRouteLine();chosen.clear();cloudRevision=0;
 routeDate=next;const now=taipeiToday();month=now.month;reportYear=now.year;routeHint='';dailyRefreshChecked='';dailyRefreshRetryAt=0;
 document.getElementById('routeDate').value=next;document.getElementById('monthSelect').value=String(month);document.getElementById('reportMonth').value=String(month);document.getElementById('reportYear').value=String(reportYear);cacheState();render();
 if(cloudUser){await supabasePlannerClient.rpc('planner_cleanup_own').then(plannerResult).catch(e=>updateCloudUi(e.message));if(!cloudBusy&&!localDirty)await loadFromCloud(true);else scheduleCloudSave();}
};
setInterval(()=>{checkTodayRoute().then(runDailyRefresh).catch(error=>updateCloudUi(error.message));},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkTodayRoute().then(runDailyRefresh).catch(error=>updateCloudUi(error.message));});
const compatibleCloudUi=updateCloudUi;updateCloudUi=function(message){compatibleCloudUi(message);if(message&&!plannerAccessReady())document.getElementById('gateStatus').textContent=message;};
releaseButton.textContent='v1.19';releaseButton.setAttribute('aria-label','版本 v1.19，查看更新紀錄');const release19=document.createElement('article');release19.className='release-entry';release19.innerHTML='<b>v1.19</b><time>2026-10-05</time><p>恢復點對點連線、補強 Android 相容與桌面圖示；各帳戶每天首次自動更新，成功後當日直接載入；覆蓋同代碼資料並清除過期工作分塊與昨日行程；取消全部行程，簡化訪況總覽。</p>';releaseHistory.querySelector('h2').after(release19);
render();
