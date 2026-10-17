// Company-only profiles are administrator view models, never fabricated auth users.
let pendingManagerCache42=new Map(),pendingManagerContext42='',pendingManagerBusy42=false,pendingManagerRequest42=0,pendingManagerRetry42=0;
function pendingPerson42(id){return 'pending:'+id;}
const pendingCatalogueBefore42=catalogueActive;
catalogueActive=function(uid){return managerAllowed()&&String(uid).startsWith('pending:')&&pendingManagerCache42.has(String(uid).slice(8))?true:pendingCatalogueBefore42(uid);};
function pendingWork42(person,period){const p=pendingManagerCache42.get(person.profileId),docs=p?.documents||[],meta=docs.find(d=>d.bucket==='workSnapshots'&&d.id===period)?.data;return {person,status:meta?'ready':'missing',source:docs.filter(d=>d.bucket==='workRecords'&&d.id.startsWith(period+'_')).flatMap(d=>d.data.items||[]),meta:meta||null};}
function injectPendingManager42(){
 if(!managerAllowed())return;
 for(const p of pendingManagerCache42.values()){
  const uid=pendingPerson42(p.id),docs=p.documents||[],master=docs.find(d=>d.bucket==='settings'&&d.id==='customerMaster')?.data||null,person={uid,profileId:p.id,pendingCompany:true,name:master?.preferredOwner||p.accountLabel,email:p.accountLabel};
  managerPeople.set(uid,person);if(managerStates.get(uid)?.pendingSourceAt!==p.updatedAt){managerStates.set(uid,{customers:docs.filter(d=>d.bucket==='customers').map(d=>d.data),visits:docs.filter(d=>d.bucket==='visits').map(d=>d.data),master,closed:null,route:null,control:null,preference:null,loaded:new Set(['customers','visits','master','closed','route','control','preference']),errors:new Set(p.updatedAt?[]:['not_synced']),pendingSourceAt:p.updatedAt});allWorkStates24.set(uid,pendingWork42(person,managerPeriod));}
 }
}
async function loadPendingManager42(force=false){
 if(!managerAllowed()||pendingManagerBusy42||!force&&Date.now()<pendingManagerRetry42)return;const uid=cloudUser.uid,key=uid+':'+managerPeriod;if(!force&&pendingManagerContext42===key){injectPendingManager42();return;}pendingManagerContext42=key;pendingManagerBusy42=true;const request=++pendingManagerRequest42;
 try{const profiles=plannerResult(await supabasePlannerClient.rpc('planner_pending_visitors')),pending=profiles.filter(p=>p.status==='pending_google');const values=await Promise.all(pending.map(p=>supabasePlannerClient.rpc('planner_pending_snapshot',{profile:p.id,period:managerPeriod}).then(plannerResult)));
  if(!managerAllowed()||cloudUser.uid!==uid||request!==pendingManagerRequest42)return;pendingManagerCache42=new Map(values.map(p=>[p.id,p]));for(const [id,p]of managerPeople)if(p.pendingCompany&&!pendingManagerCache42.has(p.profileId)){managerPeople.delete(id);managerStates.delete(id);allWorkStates24.delete(id);if(managerUid===id)managerUid='';}injectPendingManager42();allWorkKey24='';renderManagerOverview();
 }catch(error){pendingManagerContext42='';pendingManagerRetry42=Date.now()+60000;const status=document.getElementById('pendingManagerStatus42');if(status)status.textContent='待連結訪員資料尚未載入：'+cloudMessage(error);}finally{pendingManagerBusy42=false;}
}
const pendingWatchBefore42=watchManagerPerson;watchManagerPerson=function(person,generation){if(person.pendingCompany)return;return pendingWatchBefore42(person,generation);};
const pendingReadBefore42=readManagerWork24;readManagerWork24=async function(person,period,generation){if(!person.pendingCompany)return pendingReadBefore42(person,period,generation);if(generation!==allWorkGeneration24||!managerAllowed())return;allWorkStates24.set(person.uid,pendingWork42(person,period));drawManagerWork24();};
const pendingOverviewBefore42=renderManagerOverview;renderManagerOverview=function(){injectPendingManager42();pendingOverviewBefore42();if(!managerAllowed())return;for(const row of document.querySelectorAll('#managerVisitors .manager-person-row')){const email=row.querySelector('.manager-visitor small')?.textContent;if([...pendingManagerCache42.values()].some(p=>p.accountLabel===email)){row.querySelector('.remove-planner')?.remove();row.querySelector('.manager-actions23')?.remove();const label=document.createElement('small');label.textContent='業務王訪員 · 尚未連結 Google';row.append(label);}}loadPendingManager42();};
const pendingStopBefore42=stopManager;stopManager=function(){pendingStopBefore42();pendingManagerRequest42++;pendingManagerContext42='';pendingManagerCache42.clear();};
const pendingControls42=document.createElement('article');pendingControls42.className='card';pendingControls42.hidden=true;pendingControls42.innerHTML='<h3>尚未連結 Google 的訪員</h3><p id="pendingManagerStatus42">這些訪員仍可取得業務王資料；Google 登入只用於日後本人查看。</p>';const pendingRefresh42=makeAction('重新讀取待連結訪員資料',()=>loadPendingManager42(true));pendingControls42.append(pendingRefresh42);document.getElementById('managerVisitors').before(pendingControls42);
const pendingSwitchBefore42=switchView;switchView=function(view){pendingSwitchBefore42(view);pendingControls42.hidden=!managerAllowed();if(managerAllowed())loadPendingManager42();};
