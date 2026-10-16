// Preserve the authenticated account's page and unchanged daily plan on this device.
function deviceRead37(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function deviceWrite37(key,value){try{const text=JSON.stringify(value);if(text.length<=1500000&&localStorage.getItem(key)!==text)localStorage.setItem(key,text);}catch{}}
const deviceKey37=()=>cloudUser?'planner-device37:'+cloudUser.uid:null;
const deviceCache37=cacheState;
cacheState=function(){deviceCache37();if(!cloudUser)return;const state=deviceRead37(accountKey());if(!state)return;state.device37={uid:cloudUser.uid,day:todayRouteDate()};deviceWrite37(accountKey(),state);};
const deviceSwitch37=switchView;
switchView=function(view){deviceSwitch37(view);if(cloudUser&&plannerAccessReady()&&activeView===view)deviceWrite37(deviceKey37(),{view,workPeriod});};
let deviceRestored37=null,deviceRestoring37=false;
function restoreDevicePage37(){
 if(!cloudUser||!plannerAccessReady()||deviceRestored37===cloudUser.uid||deviceRestoring37)return;
 deviceRestored37=cloudUser.uid;const state=deviceRead37(deviceKey37());if(!state)return;
 const allowed=['map','list','report','work','data','fuel'];if(isPlannerAdmin())allowed.push('admin');
 if(!allowed.includes(state.view))return;
 deviceRestoring37=true;queueMicrotask(()=>{try{if(!cloudUser||deviceRestored37!==cloudUser.uid||!plannerAccessReady())return;if(/^\d{4}-\d{2}$/.test(state.workPeriod||'')){workPeriod=state.workPeriod;document.getElementById('workMonth').value=workPeriod;connectWorkAccount();}switchView(state.view);}finally{deviceRestoring37=false;}});
}
let resumeDevice37={key:'',at:0,busy:false};
resumePlannerCloud=async function(){
 if(!cloudUser||cloudBusy||localDirty||resumeDevice37.busy)return;
 const uid=cloudUser.uid,date=routeDate,key=uid+':'+date,generation=editGeneration;
 if(resumeDevice37.key===key&&Date.now()-resumeDevice37.at<60000)return;
 resumeDevice37={key,at:Date.now(),busy:true};
 try{const snap=await firebaseApi.getDoc(routeRef());if(cloudUser?.uid!==uid||routeDate!==date||localDirty||cloudBusy||generation!==editGeneration)return;
  const data=snap.exists()?snap.data():null;if(!data||(data.revision||0)===cloudRevision)return;
  restoreRouteDetails28(data);chosen=new Set(data.codes||[]);cloudRevision=data.revision||0;cacheState();render();
 }catch(error){updateCloudUi(cloudMessage(error));}finally{resumeDevice37.busy=false;}
};
const deviceLoad37=loadFromCloud;
loadFromCloud=async function(initial=false){
 const uid=cloudUser?.uid,state=uid?deviceRead37(accountKey()):null;
 if(initial&&state?.device37?.uid===uid&&state.device37.day===todayRouteDate()&&(state.customerDb?.length||state.excel?.length)){
  // Auth/membership and binding checks remain active; cached data never grants access.
  restoreDevicePage37();if(!localDirty)await resumePlannerCloud();else updateCloudUi('此裝置有未儲存變更，已保留原路線');return;
 }
 await deviceLoad37(initial);if(cloudUser?.uid===uid)restoreDevicePage37();
};
function planCacheKey37(){return cloudUser?'planner-plan37:'+cloudUser.uid+':'+routeDate:null;}
function saveDevicePlan37(){
 if(!cloudUser||!plannerAccessReady()||!autoPreferenceReady)return;
 const key=planCacheKey37(),old=deviceRead37(key)||{},signature=autoRouteSignature(),roadKey=roadKey21();
 const value={...old,uid:cloudUser.uid,day:routeDate};
 if(autoRouteDone===signature){value.signature=signature;value.codes=[...chosen];value.hint=routeHint;}
 if(roadState21.key===roadKey&&roadState21.status==='done'&&roadState21.route){value.roadKey=roadKey;value.road=roadState21.route;}
 deviceWrite37(key,value);
}
const deviceSchedule37=scheduleAutomaticRoute;
scheduleAutomaticRoute=function(){
 if(cloudUser&&plannerAccessReady()&&autoPreferenceReady){const state=deviceRead37(planCacheKey37());
  if(state?.uid===cloudUser.uid&&state.day===routeDate&&state.signature===autoRouteSignature()&&JSON.stringify(state.codes)===JSON.stringify([...chosen])){autoRouteDone=state.signature;routeHint=state.hint||routeHint;}
 }
 return deviceSchedule37();
};
function validRoad37(route){return route&&Number.isFinite(route.distance)&&Number.isFinite(route.duration)&&route.geometry?.type==='LineString'&&Array.isArray(route.geometry.coordinates)&&route.geometry.coordinates.length>=2&&route.geometry.coordinates.length<=100000&&route.geometry.coordinates.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);}
const deviceRoad37=scheduleRoad21;
scheduleRoad21=function(){
 if(cloudUser&&plannerAccessReady()){const state=deviceRead37(planCacheKey37()),key=roadKey21();if(state?.uid===cloudUser.uid&&state.day===routeDate&&state.roadKey===key&&validRoad37(state.road)){roadCache21.set(key,state.road);if(roadState21.key!==key||roadState21.status!=='done')roadState21={key,status:'done',route:state.road,error:''};}}
 return deviceRoad37();
};
const fetchDeviceRoad37=fetchRoad21;
fetchRoad21=async function(...args){await fetchDeviceRoad37(...args);saveDevicePlan37();};
let paintedRoad37=null,paintedMap37=null,paintedLayer37=null;
const devicePaint37=paintRoad21;
paintRoad21=function(){const key=roadKey21();if(activeView==='map'&&map===paintedMap37&&routeLine&&routeLine===paintedLayer37&&roadState21.key===key&&roadState21.status==='done'&&paintedRoad37===key)return;devicePaint37();paintedRoad37=key;paintedMap37=map;paintedLayer37=routeLine;};
drawPlannedConnections=paintRoad21;

// Official store offsets and temporary-stop GPS separation share one card.
function combinedOffsets37(data,analysis){
 const items=(data?.items||[]).filter(x=>String(x.name||'').trim()!=='臨時點');
 for(const row of analysis?.rows||[])if(String(row.name||'').trim()==='臨時點'&&row.tempAwayKnown&&row.tempAwayMeters>400)items.push({id:'temporary:'+row.id,name:'臨時點',owner:row.owner,day:row.day,time:String(row.checkOutAt||'').slice(11,19),type:'到點至離點',meters:row.tempAwayMeters});
 return [...new Map(items.map((x,i)=>[x.id||'official:'+i,x])).values()];
}
function offsetAnalysis37(data){
 if(!data?.owner||data.owner===workSnapshot?.owner||workSnapshot?.items?.some(x=>x.owner===data.owner))return workSnapshot?workAnalysis():null;
 for(const state of allWorkStates24.values())if(state.status==='ready'&&state.meta?.period===managerPeriod&&state.source?.some(x=>x.owner===data.owner))return analyzeWorkRecords(state.source,{owner:data.owner,period:managerPeriod,columns:state.meta.columns});
 return null;
}
offsetDetails30=function(data){
 const box=document.createElement('div'),analysis=offsetAnalysis37(data),items=combinedOffsets37(data,analysis),unknown=analysis?.rows.filter(x=>String(x.name||'').trim()==='臨時點'&&!x.tempAwayKnown).length||0;
 const summary=document.createElement('p');summary.textContent='離站偏移（含臨時點） '+items.length+' 筆';box.append(summary);
 const rule=document.createElement('p');rule.className='notice';rule.textContent='一般店依原偏移規則；臨時點僅比較第一次到點與離點 GPS，超過 400 公尺才異常。'+(unknown?' '+unknown+' 筆臨時點缺少座標，無法判定。':'');box.append(rule);
 for(const item of items.sort((a,b)=>(b.day+b.time).localeCompare(a.day+a.time))){const row=document.createElement('div');row.className='offset-row30';const name=document.createElement('b'),info=document.createElement('small');name.textContent=item.name;info.textContent=item.day+' '+item.time+' · '+item.type+' · '+Math.round(item.meters)+' 公尺';row.append(name,info);box.append(row);}return box;
};
drawOffsetCard30=function(){
 const grid=document.getElementById('workCheckCards');if(!grid)return;
 for(const card of [...grid.children])if(['臨時點異地離站','臨時點缺備註'].includes(card.querySelector('span')?.textContent))card.remove();
 document.getElementById('tempAwayUnknown32')?.remove();grid.append(offsetCard30);offsetCard30.replaceChildren();
 const analysis=workSnapshot?workAnalysis():null,items=combinedOffsets37(offsetData30,analysis),unknown=analysis?.rows.filter(x=>String(x.name||'').trim()==='臨時點'&&!x.tempAwayKnown).length||0;
 const title=document.createElement('span'),count=document.createElement('strong'),note=document.createElement('small'),limit=workLimit31('offset');title.textContent='離站偏移（含臨時點）';count.textContent=offsetData30?String(items.length):'—';
 note.textContent=(offsetData30?(limit===null?'容錯值未定':items.length>limit?'容錯 '+limit+' 筆 · 超過 '+(items.length-limit):'容錯 '+limit+' 筆 · 剩 '+(limit-items.length)):'一般店偏移尚未同步')+(unknown?' · '+unknown+' 筆臨時點無法判定':'');offsetCard30.classList.toggle('limit-exceeded',!!offsetData30&&limit!==null&&items.length>limit);offsetCard30.append(title,count,note);
};
const deviceWork37=renderWorkPanel;
renderWorkPanel=function(){deviceWork37();if(activeView==='work')drawOffsetCard30();};
const deviceDetails37=drawWorkRecords;
drawWorkRecords=function(analysis){deviceDetails37(analysis);for(const row of document.querySelectorAll('#workRecordRows .work-record')){for(const note of row.querySelectorAll('p.red'))if(note.textContent.startsWith('備註：'))note.classList.remove('red');const id=[...row.querySelectorAll('.work-detail>div')].find(x=>x.textContent.startsWith('工作 ID'))?.querySelector('b')?.textContent,source=analysis.rows.find(x=>x.id===id);if(source&&String(source.name||'').trim()==='臨時點'&&!source.tempAwayKnown){const label=row.querySelector('.work-no-flag');if(label)label.textContent='座標不足，無法判定';}}};
const deviceCloudMessage37=cloudMessage;
cloudMessage=function(error){return error?.code==='planner/read-timeout'?'雲端讀取超過 30 秒，原資料已保留，請重試。':deviceCloudMessage37(error);};
const deviceRender37=render;
render=function(){deviceRender37();restoreDevicePage37();saveDevicePlan37();};
releaseButton.textContent='v1.37';releaseButton.setAttribute('aria-label','版本 v1.37，查看更新紀錄');
const release37=document.createElement('article');release37.className='release-entry';release37.innerHTML='<b>v1.37</b><time>2026-10-16</time><p>合併離站偏移與臨時點統計；臨時點只以首次到點及離點距離超過 400 公尺列異常。背景延續裝置登入，保留上次頁面與當日路線；切回分頁不再重載全部資料，未變更的路線不重新計算。雲端讀取逾時可重試。</p>';releaseHistory.querySelector('h2').after(release37);
render();
