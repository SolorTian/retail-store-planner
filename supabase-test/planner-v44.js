// Display-only weekday labels; dates used for fuel edits and exports stay ISO.
function fuelDateLabel44(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return value||'';
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value+'('+['日','一','二','三','四','五','六'][date.getUTCDay()]+')':value;
}
function drawFuelDates44(){
 if(!fuelData30||fuelUid30!==cloudUser?.uid)return;
 document.querySelectorAll('#fuelPreview30 .fuel-row32').forEach((row,index)=>{const item=fuelData30.items[index],label=row.querySelector(':scope > b');if(item&&label)label.textContent=fuelDateLabel44(item.date);});
}
const fuelDrawBefore44=drawFuel30;drawFuel30=function(){fuelDrawBefore44();drawFuelDates44();};

// Private map points use the existing owner-isolated daily route persistence.
function mapPoint44(gps,name='私人地點'){
 if(!Array.isArray(gps)||gps.length!==2||gps.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(gps[0])>90||Math.abs(gps[1])>180)return null;
 return {name:String(name||'私人地點').trim().slice(0,180),gps:[...gps],kind:'personal'};
}
let candidate44=null,hold44=null,boundMap44=null;
const pointDrawer44=document.createElement('div');pointDrawer44.id='privateMapDrawer44';pointDrawer44.className='modal credential-drawer';
pointDrawer44.innerHTML='<div class="dialog"><button class="drawer-close" aria-label="關閉新增私人地點" type="button">✕</button><h2>加入當天路線</h2><p id="privatePointDate44"></p><form id="privatePointForm44"><label>私人地點名稱<input id="privatePointName44" maxlength="180" required></label><p id="privatePointGps44" class="notice"></p><p>私人地點只加入你的路線，不會新增到公司客戶名冊。</p><p id="privatePointStatus44" role="status"></p><button class="primary" type="submit">加入我的當天路線</button></form></div>';
document.body.append(pointDrawer44);pointDrawer44.querySelector('.drawer-close').onclick=()=>closeModal(pointDrawer44.id);
async function openMapPoint44(gps,name){
 const point=mapPoint44(gps,name);if(!point||!plannerAccessReady())return;
 const uid=cloudUser.uid;await checkTodayRoute();
 if(!plannerAccessReady()||cloudUser.uid!==uid||routeDate!==todayRouteDate())return toast('請先確認今天的路線後再加入');
 candidate44={point,uid,day:routeDate};document.getElementById('privatePointDate44').textContent=fuelDateLabel44(routeDate);
 document.getElementById('privatePointName44').value=point.name;document.getElementById('privatePointGps44').textContent='座標 '+point.gps.map(x=>x.toFixed(6)).join(', ');document.getElementById('privatePointStatus44').textContent='';
 openModal(pointDrawer44.id);document.getElementById('privatePointName44').focus();
}
document.getElementById('privatePointForm44').onsubmit=event=>{
 event.preventDefault();const c=candidate44,status=document.getElementById('privatePointStatus44');
 if(!c||!plannerAccessReady()||cloudUser.uid!==c.uid||routeDate!==c.day||c.day!==todayRouteDate()){status.textContent='帳號或日期已變更，請關閉後重新選點。';return;}
 const name=document.getElementById('privatePointName44').value.trim();if(!name){status.textContent='請輸入地點名稱。';return;}
 if(chosen.size>=300){status.textContent='行程最多 300 點。';return;}
 addRoutePoint28({...c.point,name});candidate44=null;closeModal(pointDrawer44.id);map?.closePopup();
};
function mapPickPopup44(latlng){
 if(!plannerAccessReady()||!mapPoint44([latlng.lat,latlng.lng]))return;
 const box=document.createElement('div'),label=document.createElement('b'),coords=document.createElement('p');label.textContent='選取的位置';coords.textContent=[latlng.lat,latlng.lng].map(x=>x.toFixed(6)).join(', ');
 box.append(label,coords,makeAction('＋ 私人地點',()=>openMapPoint44([latlng.lat,latlng.lng])));L.DomEvent.disableClickPropagation(box);L.popup().setLatLng(latlng).setContent(box).openOn(map);
}
function cancelHold44(){if(hold44)clearTimeout(hold44.timer);hold44=null;}
function bindMapPicking44(){
 if(!map||boundMap44===map)return;boundMap44=map;
 map.on('click',event=>{if(event.originalEvent?.target?.closest?.('.leaflet-marker-icon,.leaflet-popup,.leaflet-control'))return;mapPickPopup44(event.latlng);});
 map.on('contextmenu',event=>{L.DomEvent.preventDefault(event.originalEvent);cancelHold44();openMapPoint44([event.latlng.lat,event.latlng.lng]);});
 const container=map.getContainer();container.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'||event.button!==0)return;
  if(hold44){cancelHold44();return;}
  if(event.target.closest('.leaflet-marker-icon,.leaflet-popup,.leaflet-control'))return;
  const p={id:event.pointerId,x:event.clientX,y:event.clientY,latlng:map.mouseEventToLatLng(event)};hold44=p;
  p.timer=setTimeout(()=>{if(hold44===p){hold44=null;openMapPoint44([p.latlng.lat,p.latlng.lng]);}},600);
 },{passive:true});
 container.addEventListener('pointermove',event=>{if(hold44&&event.pointerId===hold44.id&&Math.hypot(event.clientX-hold44.x,event.clientY-hold44.y)>12)cancelHold44();},{passive:true});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(event,cancelHold44,{passive:true});
 map.on('movestart zoomstart',cancelHold44);
}
const ensureBefore44=ensureMap;ensureMap=function(){const result=ensureBefore44();if(result)bindMapPicking44();return result;};
const updateBefore44=updateMap;updateMap=function(fit){updateBefore44(fit);bindMapPicking44();for(const x of mapRows){
 const marker=markers.get(x.code),content=marker?.getPopup()?.getContent();if(!content||typeof content==='string'||content.querySelector('.private-point44')||stopKind28(x)==='personal')continue;
 const button=makeAction('＋ 私人地點',()=>openMapPoint44(x.gps,x.name));button.className='private-point44';content.append(button);
}};
const mapHint44=document.createElement('p');mapHint44.className='notice';mapHint44.textContent='點一下地圖選位置，或長按／按右鍵，可加入私人地點；店家點位也可開啟後選「＋ 私人地點」。';document.getElementById('map').before(mapHint44);
const style44=document.createElement('style');style44.textContent='.fuel-row32{grid-template-columns:130px minmax(230px,1.5fr) 105px 125px minmax(180px,1fr)}.fuel-row32>b{white-space:nowrap;font-variant-numeric:tabular-nums}@media(min-width:761px){#panel-fuel .fuel-row32{grid-template-columns:130px minmax(210px,2fr) 90px 105px 105px minmax(160px,1fr)}}@media(min-width:761px) and (max-width:1100px){#panel-fuel .fuel-row32{grid-template-columns:130px minmax(150px,1fr) 85px 100px 90px}}@media(max-width:760px){.fuel-row32{grid-template-columns:130px 1fr 1fr}}#privatePointForm44>button{width:100%;min-height:46px}#privatePointStatus44:empty{display:none}';document.head.append(style44);
releaseButton.textContent='v1.44';releaseButton.setAttribute('aria-label','版本 v1.44，查看更新紀錄');const release44=document.createElement('article');release44.className='release-entry';release44.innerHTML='<b>v1.44</b><time>2026-10-17</time><p>油料申請日期顯示完整日期與星期，例如 2026-10-02(五)，保留假日備註提醒。地圖點選、長按或右鍵選位置，及店家點位新增私人地點，可命名後加入自己的當天路線，沿用路線儲存與帳號隔離。</p>';releaseHistory.querySelector('h2').after(release44);
if(activeView==='fuel')drawFuel30();if(map)bindMapPicking44();if(activeView==='map')updateMap(false);

