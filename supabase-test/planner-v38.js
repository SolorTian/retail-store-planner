// Completed driving routes remain stable until the selected route is changed.
function routeIntent38(){return JSON.stringify([cloudUser?.uid||'',routeDate,[...chosen],DEPOT.gps,autoDepotStart]);}
const originalRoadPoints38=roadPoints21;
let drivingInput38=null;
roadPoints21=function(){
 const intent=routeIntent38();if(drivingInput38?.intent===intent)return drivingInput38.points;
 const saved=cloudUser?deviceRead37('planner-driving38:'+cloudUser.uid):null;
 if(saved?.intent===intent&&Array.isArray(saved.points)&&saved.points.every(workGpsValid)){drivingInput38=saved;return saved.points;}
 const points=originalRoadPoints38();drivingInput38={intent,points};if(cloudUser&&points.length)deviceWrite37('planner-driving38:'+cloudUser.uid,drivingInput38);return points;
};
autoRouteSignature=function(){return JSON.stringify([cloudUser?.uid||'',routeDate,DEPOT.gps,autoDepotStart,autoDepotStart?null:[...chosen][0],[...chosen].sort()]);};
let explicitArrange38=false;
const schedule38=scheduleAutomaticRoute;
scheduleAutomaticRoute=function(){
 if(!explicitArrange38&&cloudUser&&plannerAccessReady()&&autoPreferenceReady){const saved=deviceRead37(planCacheKey37());if(saved?.uid===cloudUser.uid&&saved.day===routeDate&&saved.signature&&JSON.stringify(saved.codes)===JSON.stringify([...chosen]))autoRouteDone=autoRouteSignature();}
 return schedule38();
};
const arrange38=arrangeAutomaticRoute;
arrangeAutomaticRoute=async function(){
 explicitArrange38=true;drivingInput38=null;
 if(cloudUser){try{localStorage.removeItem('planner-driving38:'+cloudUser.uid);}catch{}const state=deviceRead37(planCacheKey37())||{};deviceWrite37(planCacheKey37(),{...state,signature:null,codes:[],road:null,roadKey:null});}
 roadCache21.clear();roadState21={key:'',status:'idle',route:null,error:''};roadRetry21=0;
 try{return await arrange38();}finally{explicitArrange38=false;saveDevicePlan37();}
};
document.querySelectorAll('.suggestBtn').forEach(button=>{button.onclick=async()=>{if(!plannerAccessReady()||routeBusy)return;autoRouteEnabled=true;autoPreferenceReady=true;localStorage.setItem(autoPreferenceStorage(),'true');await arrangeAutomaticRoute();saveAutoPreference().catch(()=>{});};button.setAttribute('aria-label','重新安排路線');});
let manualDeviceView38=null;
const restoreView38=restoreDevicePage37;
restoreDevicePage37=function(){if(cloudUser&&manualDeviceView38===cloudUser.uid)return;return restoreView38();};
document.addEventListener('click',event=>{if(!event.isTrusted||!cloudUser||!plannerAccessReady())return;const button=event.target?.closest?.('[data-view]');if(!button?.closest('.tabs,.bottomnav'))return;manualDeviceView38=cloudUser.uid;deviceRestored37=null;},true);

function issueRows38(analysis,type,day=''){
 return analysis.rows.filter(row=>(!day||row.day===day)&&(type==='noTime'?row.flags.includes('noStart')||row.flags.includes('noEnd'):type==='flagged'?row.flags.some(f=>WORK_CHECK_TYPES.some(t=>t.id===f)):row.flags.includes(type))).sort((a,b)=>(b.start??workTimestamp(b.plannedAt)??0)-(a.start??workTimestamp(a.plannedAt)??0));
}
function gpsText38(lat,lng){return workGpsValid([lat,lng])?lat.toFixed(6)+', '+lng.toFixed(6):'未提供 GPS';}
function workEvidence38(row){
 const card=document.createElement('article');card.className='evidence38';const title=document.createElement('h3');title.textContent=(row.name||row.code||'未指定店家')+' · '+(row.day||'日期未提供');card.append(title);
 const facts=[['到點打卡',workTimeLabel(row.checkInAt)],['離點打卡',workTimeLabel(row.checkOutAt)],['完成時間',workTimeLabel(row.completedAt)],['停留時間',formatWorkSeconds(row.seconds)],['到點 GPS',gpsText38(row.checkInLat,row.checkInLng)],['離點 GPS',gpsText38(row.checkOutLat,row.checkOutLng)]];
 const grid=document.createElement('dl');for(const [label,value]of facts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;grid.append(dt,dd);}card.append(grid);
 const notes=[row.previous?'上一點：'+row.previous.name+' · 離點 '+workTimeLabel(row.previous.endAt):'',row.gapSeconds!==undefined?'跨店間隔：'+formatWorkSeconds(row.gapSeconds):'',row.overlapWith?'重疊店點：'+row.overlapWith.name+' · '+formatWorkSeconds(row.overlapSeconds):'',row.flags.includes('signal')?'衛星訊號原值：'+(row.signalValue||'（空白）'):'',row.note?'備註：'+row.note:''];for(const text of notes.filter(Boolean)){const p=document.createElement('p');p.textContent=text;card.append(p);}const link=document.createElement('a');link.textContent='到業務王核對';link.href='https://ttl.unidyna.com/ubmsys_task_message/lists/'+encodeURIComponent(row.id);link.target='_blank';link.rel='noopener noreferrer';card.append(link);return card;
}
const issueDrawer38=document.createElement('div');issueDrawer38.id='issueDrawer38';issueDrawer38.className='modal credential-drawer';issueDrawer38.innerHTML='<div class="dialog"><button class="drawer-close" aria-label="關閉工作異常明細" onclick="closeModal(\'issueDrawer38\')">✕</button><h2 id="issueTitle38"></h2><p id="issueSummary38" role="status"></p><label>日期<select id="issueDay38" aria-label="異常明細日期"></select></label><div id="issueRows38"></div><button id="issueMore38" hidden>顯示更多</button></div>';document.body.append(issueDrawer38);
let issueState38=null;
function drawIssue38(){
 if(!issueState38||!plannerAccessReady()||cloudUser?.uid!==issueState38.uid){issueDrawer38.classList.remove('show');document.getElementById('issueRows38').replaceChildren();return;}
 const analysis=workAnalysis(),rows=issueRows38(analysis,issueState38.type,document.getElementById('issueDay38').value),root=document.getElementById('issueRows38');root.replaceChildren();document.getElementById('issueSummary38').textContent=workPeriod+' · '+rows.length+' 筆';
 if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent='沒有這類異常紀錄';root.append(p);}else for(const row of rows.slice(0,issueState38.limit))root.append(workEvidence38(row));document.getElementById('issueMore38').hidden=rows.length<=issueState38.limit;
}
const filter38=setWorkFilter;
setWorkFilter=function(type){
 if(!plannerAccessReady()||!workSnapshot)return;
 const category=[...WORK_CHECK_TYPES,...WORK_EXTRA_TYPES,{id:'noTime',name:'缺時間'},{id:'flagged',name:'全部待核對'}].find(x=>x.id===type);if(!category)return filter38(type);
 issueState38={uid:cloudUser.uid,type,limit:60};document.getElementById('issueTitle38').textContent=category.name+' · 工作明細';const select=document.getElementById('issueDay38');select.replaceChildren(new Option('全部日期',''));for(const day of workAnalysis().days)select.append(new Option(day.date,day.date));select.value=workDayFilter||'';drawIssue38();openModal('issueDrawer38');
};
document.getElementById('issueDay38').onchange=()=>{if(issueState38)issueState38.limit=60;drawIssue38();};document.getElementById('issueMore38').onclick=()=>{if(issueState38)issueState38.limit+=60;drawIssue38();};
const syncStatus38=setSyncStatus;setSyncStatus=function(message){if(lastUpdateDataset==='work')message=String(message).replace(/通常需要約\s*1\s*分鐘/,'首次補齊所有打卡 GPS 可能需要數分鐘，完成後直接使用已保存資料');return syncStatus38(message);};

const plannedRoadCache38=new Map(),plannedRoadPending38=new Map();
function drawPlannedManagerRoad38(points,color,expectedKey,layer){
 if(!managerAllowed()||points.length<2||points.length>100||!points.every(workGpsValid))return;
 const uid=cloudUser.uid,key=uid+':'+JSON.stringify(points),current=()=>managerAllowed()&&cloudUser?.uid===uid&&managerMapKey===expectedKey&&managerLayer===layer;
 const paint=geometry=>{if(current())L.geoJSON(geometry,{style:{color,weight:4,opacity:.75}}).addTo(layer);};
 if(plannedRoadCache38.has(key)){paint(plannedRoadCache38.get(key));return;}
 if(!plannedRoadPending38.has(key)){const request=fetch(ROAD_ROUTE_SERVICE21+'/route/v1/driving/'+points.map(([lat,lng])=>lng+','+lat).join(';')+'?overview=full&geometries=geojson&steps=false',{signal:AbortSignal.timeout(20000),referrerPolicy:'no-referrer'}).then(async response=>{if(!response.ok)throw Error('道路服務暫時無法回應');const data=await response.json(),route=data.routes?.[0];if(data.code!=='Ok'||!validRoad37(route))throw Error('行車路線資料不完整');if(cloudUser?.uid===uid&&isPlannerAdmin()){plannedRoadCache38.set(key,route.geometry);if(plannedRoadCache38.size>20)plannedRoadCache38.delete(plannedRoadCache38.keys().next().value);}return route.geometry;}).finally(()=>plannedRoadPending38.delete(key));plannedRoadPending38.set(key,request);}
 plannedRoadPending38.get(key).then(paint).catch(()=>{if(current()){const note=document.querySelector('.manager-map-card>.notice');if(note)note.textContent='部分行車路線暫時無法取得；已保留店點，沒有改用直線代替。';}});
}

// Read-only administrator view: no new member permissions or cross-account APIs.
const gpsPanel38=document.createElement('article');gpsPanel38.id='gpsPanel38';gpsPanel38.className='card';gpsPanel38.hidden=true;gpsPanel38.innerHTML='<h3>訪員每日打卡跑點</h3><div class="gps-controls38"><label>訪員<select id="gpsPerson38" aria-label="打卡跑點訪員"></select></label><label>日期<select id="gpsDay38" aria-label="打卡跑點日期"></select></label><label class="gps-toggle38"><input type="checkbox" id="gpsOut38">顯示離點 GPS</label></div><p id="gpsStatus38" role="status"></p><div id="gpsMap38" aria-label="訪員當日行車跑點地圖"></div><p class="notice">綠色為到點 GPS，橘色為離點 GPS；灰色為客戶名冊店點位置參考。行車路線依打卡順序顯示，店點參考不作為實際打卡 GPS。</p><button id="gpsRetry38" hidden>重試行車路線</button><div id="gpsTimeline38"></div>';allWorkCard24.before(gpsPanel38);
let gpsMap38=null,gpsLayer38=null,gpsRoad38=null,gpsController38=null,gpsGeneration38=0,gpsDrawKey38='',gpsOptionsKey38='';const gpsRoadCache38=new Map();
function dailyPunches38(source,day,owner=''){
 return source.filter(r=>(r.status==='完成'||(!r.status&&workTimestamp(r.completedAt)!==null))&&workTimestamp(r.gpsCheckInAt||r.checkInAt)!==null&&(!owner||r.owner===owner)&&(workLocalDay(workTimestamp(r.gpsCheckInAt||r.checkInAt))||String(r.plannedAt||'').slice(0,10))===day).sort((a,b)=>(workTimestamp(a.gpsCheckInAt||a.checkInAt)??Infinity)-(workTimestamp(b.gpsCheckInAt||b.checkInAt)??Infinity)||String(a.id).localeCompare(String(b.id)));
}
function punchMarkers38(row,showOut){return [['到點',row.checkInLat,row.checkInLng,'#087f68'],...(showOut?[['離點',row.checkOutLat,row.checkOutLng,'#cf6b16']]:[])].filter(([,lat,lng])=>workGpsValid([lat,lng]));}
function dayRoutePoints38(rows,customers=[]){const stores=new Map(customers.map(x=>[String(x.code),x.gps]));return rows.map(row=>{const arrival=[row.checkInLat,row.checkInLng],store=stores.get(String(row.code));return {row,gps:workGpsValid(arrival)?arrival:workGpsValid(store)?store:null,source:workGpsValid(arrival)?'arrival':workGpsValid(store)?'store':'missing',store:workGpsValid(store)?store:null};});}
function managerGpsCurrent38(generation,uid){return generation===gpsGeneration38&&cloudUser?.uid===uid&&managerAllowed();}
function clearManagerGps38(){gpsGeneration38++;gpsController38?.abort();gpsController38=null;gpsLayer38?.clearLayers();if(gpsRoad38&&gpsMap38)gpsMap38.removeLayer(gpsRoad38);gpsRoad38=null;gpsDrawKey38='';gpsOptionsKey38='';gpsRoadCache38.clear();plannedRoadCache38.clear();gpsPanel38.hidden=true;document.getElementById('gpsTimeline38').replaceChildren();document.getElementById('gpsPerson38').replaceChildren();document.getElementById('gpsDay38').replaceChildren();}
function managerSource38(){const uid=document.getElementById('gpsPerson38').value,state=allWorkStates24.get(uid);return state&&managerPeople.has(uid)&&state.status==='ready'?state:null;}
function gpsDays38(state){return [...new Set((state?.source||[]).map(r=>workLocalDay(workTimestamp(r.gpsCheckInAt||r.checkInAt))||String(r.plannedAt||'').slice(0,10)).filter(d=>d.startsWith(managerPeriod)&&/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().reverse();}
function refreshGpsDays38(preferred=''){const select=document.getElementById('gpsDay38'),days=gpsDays38(managerSource38());select.replaceChildren();for(const day of days)select.append(new Option(day,day));select.value=days.includes(preferred)?preferred:days[0]||'';}
function drawManagerGps38(){
 if(!managerAllowed()){if(!isPlannerAdmin()||!plannerAccessReady())clearManagerGps38();return;}gpsPanel38.hidden=false;
 const states=[...allWorkStates24.values()].filter(s=>managerPeople.has(s.person.uid)&&(!managerUid||s.person.uid===managerUid));
 const optionsKey=JSON.stringify([cloudUser.uid,managerPeriod,managerUid,states.map(s=>[s.person.uid,s.status,s.meta?.requestId])]);
 if(optionsKey!==gpsOptionsKey38){gpsOptionsKey38=optionsKey;const person=document.getElementById('gpsPerson38'),previous=person.value,day=document.getElementById('gpsDay38').value;person.replaceChildren();for(const state of states){const label=state.source?.find(r=>r.owner)?.owner||state.person.name||state.person.email;person.append(new Option(label+(state.status==='ready'?'':state.status==='loading'?'（載入中）':'（尚無資料）'),state.person.uid));}if(states.some(s=>s.person.uid===previous))person.value=previous;refreshGpsDays38(day);}
 const state=managerSource38(),day=document.getElementById('gpsDay38').value,showOut=document.getElementById('gpsOut38').checked,key=JSON.stringify([cloudUser.uid,managerPeriod,state?.person.uid,state?.meta?.requestId,day,showOut,optionsKey]);if(key===gpsDrawKey38)return;gpsDrawKey38=key;
 const generation=++gpsGeneration38,uid=cloudUser.uid;gpsController38?.abort();gpsController38=null;document.getElementById('gpsRetry38').hidden=true;
 const timeline=document.getElementById('gpsTimeline38');timeline.replaceChildren();gpsLayer38?.clearLayers();if(gpsRoad38&&gpsMap38)gpsMap38.removeLayer(gpsRoad38);gpsRoad38=null;
 if(!state||!day){document.getElementById('gpsStatus38').textContent=states.some(s=>s.status==='loading')?'正在載入訪員打卡資料…':'這個月份尚無可顯示的工作紀錄';return;}
 const owner=managerStates.get(state.person.uid)?.master?.preferredOwner||managerStates.get(state.person.uid)?.route?.owner||'',rows=dailyPunches38(state.source,day,owner),models=dayRoutePoints38(rows,managerStates.get(state.person.uid)?.customers||[]),modelById=new Map(models.map(x=>[x.row.id,x])),points=models.filter(x=>x.gps).map(x=>x.gps),arrivalCount=models.filter(x=>x.source==='arrival').length,referenceCount=models.filter(x=>x.source==='store').length;
 document.getElementById('gpsStatus38').textContent=day+' · '+rows.length+' 筆工作 · '+arrivalCount+' 筆到點 GPS'+(referenceCount?' · '+referenceCount+' 個店點位置參考':'')+(showOut?' · '+rows.filter(r=>workGpsValid([r.checkOutLat,r.checkOutLng])).length+' 筆離點 GPS':'');
 if(!gpsMap38){gpsMap38=L.map('gpsMap38',{scrollWheelZoom:false}).setView([23.8,121],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(gpsMap38);gpsLayer38=L.layerGroup().addTo(gpsMap38);}requestAnimationFrame(()=>gpsMap38?.invalidateSize({pan:false}));
 const bounds=[];rows.forEach((row,index)=>{const entry=document.createElement('article');entry.className='evidence38';const title=document.createElement('h4');title.textContent=(index+1)+'. '+(row.name||row.code||'未指定店家')+' · '+(row.status||'狀態未提供');entry.append(title);for(const text of ['停留 '+formatWorkSeconds(workStaySeconds41(row)),'到點 '+workTimeLabel(row.gpsCheckInAt||row.checkInAt)+' · '+gpsText38(row.checkInLat,row.checkInLng),'離點 '+workTimeLabel(row.checkOutAt)+(showOut?' · '+gpsText38(row.checkOutLat,row.checkOutLng):''),'店家固定座標（客戶名冊） '+(modelById.get(row.id)?.store?gpsText38(...modelById.get(row.id).store):'未提供')]){const p=document.createElement('p');p.textContent=text;entry.append(p);}timeline.append(entry);
  for(const [kind,lat,lng,color]of [...punchMarkers38(row,showOut),...(modelById.get(row.id)?.source==='store'?[['店點位置參考',...modelById.get(row.id).gps,'#78858b']]:[])]){bounds.push([lat,lng]);L.circleMarker([lat,lng],{radius:8,color,fillColor:color,fillOpacity:.85}).bindTooltip((index+1)+(kind==='到點'?' 到':kind==='離點'?' 離':' 店'),{direction:kind==='離點'?'bottom':'top',permanent:true}).bindPopup(esc((index+1)+'. '+(row.name||'')+' · '+kind)+'<br>'+esc(gpsText38(lat,lng))).addTo(gpsLayer38);}
 });if(bounds.length)gpsMap38.fitBounds(bounds,{padding:[28,28],maxZoom:16});if(points.length<2){if(rows.length&&!points.length)document.getElementById('gpsStatus38').textContent+=' · 請更新近兩月以補抓打卡 GPS';return;}
 const roadKey=JSON.stringify([state.person.uid,day,points]);if(gpsRoadCache38.has(roadKey)){gpsRoad38=L.geoJSON(gpsRoadCache38.get(roadKey),{style:{color:'#2563eb',weight:5,opacity:.8}}).addTo(gpsMap38);return;}
 if(points.length>100){document.getElementById('gpsStatus38').textContent+=' · 超過 100 個打卡點，請分段查看行車路線';return;}
 const controller=new AbortController();gpsController38=controller;const timeout=setTimeout(()=>controller.abort(),20000);document.getElementById('gpsStatus38').textContent+=' · 取得行車路線中…';
 fetch(ROAD_ROUTE_SERVICE21+'/route/v1/driving/'+points.map(([lat,lng])=>lng+','+lat).join(';')+'?overview=full&geometries=geojson&steps=false',{signal:controller.signal,referrerPolicy:'no-referrer'}).then(async response=>{if(!response.ok)throw Error('行車路線暫時無法取得');const data=await response.json(),route=data.routes?.[0];if(data.code!=='Ok'||!validRoad37(route))throw Error('行車路線資料不完整');if(!managerGpsCurrent38(generation,uid))return;gpsRoadCache38.set(roadKey,route.geometry);if(gpsRoadCache38.size>12)gpsRoadCache38.delete(gpsRoadCache38.keys().next().value);gpsRoad38=L.geoJSON(route.geometry,{style:{color:'#2563eb',weight:5,opacity:.8}}).addTo(gpsMap38);document.getElementById('gpsStatus38').textContent=day+' · '+rows.length+' 筆工作 · 行車約 '+(route.distance/1000).toFixed(1)+' 公里'+(referenceCount?'（含 '+referenceCount+' 個店點位置參考）':'');}).catch(error=>{if(!managerGpsCurrent38(generation,uid))return;document.getElementById('gpsStatus38').textContent=day+' · '+rows.length+' 筆工作 · 行車路線暫時無法取得，打卡點仍保留';document.getElementById('gpsRetry38').hidden=false;}).finally(()=>{clearTimeout(timeout);if(gpsController38===controller)gpsController38=null;});
}
document.getElementById('gpsPerson38').onchange=()=>{refreshGpsDays38();gpsDrawKey38='';drawManagerGps38();};document.getElementById('gpsDay38').onchange=()=>{gpsDrawKey38='';drawManagerGps38();};document.getElementById('gpsOut38').onchange=()=>{gpsDrawKey38='';drawManagerGps38();};document.getElementById('gpsRetry38').onclick=()=>{gpsDrawKey38='';drawManagerGps38();};
const managerDraw38=drawManagerWork24;drawManagerWork24=function(){managerDraw38();drawManagerGps38();};
const connectWork38=connectManagerWork24;connectManagerWork24=function(force=false){if(isPlannerAdmin()&&plannerAccessReady()&&activeView!=='admin')return;return connectWork38(force);};
const switch38=switchView;switchView=function(view){switch38(view);if(view==='admin')drawManagerGps38();else if(!isPlannerAdmin())clearManagerGps38();};
const render38=render;render=function(){render38();if(!cloudUser||!plannerAccessReady()||issueState38&&issueState38.uid!==cloudUser.uid){issueDrawer38.classList.remove('show');document.getElementById('issueRows38').replaceChildren();issueState38=null;}if(!isPlannerAdmin()||!plannerAccessReady())clearManagerGps38();};
const style38=document.createElement('style');style38.textContent='#gpsPanel38[hidden],#issueMore38[hidden],#gpsRetry38[hidden]{display:none!important}.gps-controls38{display:flex;align-items:end;gap:14px;flex-wrap:wrap}.gps-controls38 label{font-size:13px;min-width:150px;flex:1}.gps-controls38 select{display:block;width:100%;margin-top:6px}.gps-toggle38{display:flex;align-items:center;gap:8px;min-height:44px}.gps-toggle38 input{width:22px;height:22px}#gpsMap38{height:380px;border-radius:12px;background:#edf3f1;margin-top:12px}#gpsTimeline38{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:16px}.evidence38{border:1px solid var(--line);background:#f8faf9;border-radius:12px;padding:14px;margin:12px 0;font-size:13px;overflow-wrap:anywhere}.evidence38 h3,.evidence38 h4{font-size:15px;margin:0 0 12px}.evidence38 dl{display:grid;grid-template-columns:90px 1fr;gap:8px;margin:0}.evidence38 dt{color:var(--muted)}.evidence38 dd{margin:0}.evidence38 p{line-height:1.7;margin:8px 0}#issueDrawer38 .dialog{width:min(540px,100%)}#issueDay38{width:100%;margin:6px 0 12px}#issueMore38{width:100%}@media(max-width:600px){#gpsMap38{height:320px}.gps-controls38 label{min-width:130px}.evidence38 dl{grid-template-columns:76px 1fr}}';document.head.append(style38);
releaseButton.textContent='v1.38.2';releaseButton.setAttribute('aria-label','版本 v1.38.2，查看更新紀錄');const release38=document.createElement('article');release38.className='release-entry';release38.innerHTML='<b>v1.38.2</b><time>2026-10-16</time><p>工作自檢各項異常改為側邊抽屜明細；管理總覽新增訪員／日期打卡跑點、到點 GPS 與離點 GPS 顯示開關，使用實際行車道路線。固定已安排路線的道路結果，重新安排或變更店點才重算；一般成員仍只可讀取自己的資料。缺實際打卡 GPS 時，明確標示客戶名冊的店點位置參考；啟動完成不覆蓋使用者已手動切換的頁面。</p>';releaseHistory.querySelector('h2').after(release38);render();

