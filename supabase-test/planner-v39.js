// Explicit month refresh bypasses the daily cache; account-protected drafts survive.
fuelForm34.onsubmit=async function(event){
 event.preventDefault();if(fuelBusy30||!plannerAccessReady())return;
 const uid=cloudUser.uid,period=document.getElementById('fuelMonth30').value;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return showFuelError30(Error('請選擇有效月份'));
 if(visitSyncBusy||cloudBusy||dailyRefreshActive)return showFuelError30(Error('資料正在更新，請完成後再取得月份資料'));
 fuelRetry34=0;fuelBusy30=true;const button=document.getElementById('fuelFetch30');button.disabled=true;
 document.getElementById('fuelStatus30').textContent='正在重新取得 '+period+' 油料資料，原有編輯會保留…';
 try{await fuelSave34;const report=await fetchFuel30(period);if(cloudUser?.uid!==uid)throw Error('登入帳號已變更');await fuelStore34(report);}
 catch(error){if(cloudUser?.uid===uid)showFuelError30(error);}
 finally{fuelBusy30=false;button.disabled=false;}
};

function showRouteNote39(marker,code){
 const content=marker.getPopup()?.getContent();if(!content||typeof content==='string')return;
 content.querySelector('.route-popup-note39')?.remove();
 const note=document.createElement('p');note.className='route-popup-note39';
 note.textContent=chosen.has(code)?'當次路線備註：'+(routeNotes28[code]||'尚未填寫'):'尚未加入當日路線';
 content.querySelector('b')?.after(note);marker.getPopup().update();
}
const noteMarkers39=new WeakSet(),mapBefore39=updateMap;
updateMap=function(fit){mapBefore39(fit);for(const [code,marker]of markers){if(!noteMarkers39.has(marker)){marker.on('popupopen',()=>showRouteNote39(marker,code));noteMarkers39.add(marker);}if(marker.isPopupOpen())showRouteNote39(marker,code);}};
document.getElementById('tripList').addEventListener('input',event=>{if(!event.target.matches('.route-note28'))return;const code=event.target.closest('[data-code]')?.dataset.code,marker=markers.get(code);if(marker?.isPopupOpen())showRouteNote39(marker,code);});

const style39=document.createElement('style');style39.textContent=`
.route-popup-note39{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;max-height:220px;overflow:auto;border-left:3px solid #1d786c;padding:8px;margin:10px 0!important;background:#f1f7f5}
.leaflet-popup-content{min-width:210px}.leaflet-popup-content>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.leaflet-popup-content>div>b,.leaflet-popup-content .route-popup-note39{grid-column:1/-1}
.leaflet-popup-content .navlink,.leaflet-popup-content button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:44px;padding:10px 12px;margin:0;width:100%;font-size:14px;line-height:1.4}
@media(max-width:600px){nav[aria-label="主要導覽"]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}nav[aria-label="主要導覽"] button{width:100%;min-height:44px;box-sizing:border-box;padding:8px 4px;font-size:14px;white-space:normal}.tripactions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tripactions .navlink,.tripactions button{box-sizing:border-box;min-width:68px;min-height:44px;display:flex;align-items:center;justify-content:center;padding:10px 12px;font-size:14px;line-height:1.4}.fuel-fields30{grid-template-columns:repeat(2,minmax(0,1fr))!important}.fuel-fields30 input,.fuel-fields30 select{box-sizing:border-box;width:100%;min-width:0;min-height:44px}#fuelFetch30{width:100%;min-height:44px}}
`;document.head.append(style39);
releaseButton.textContent='v1.39';releaseButton.setAttribute('aria-label','版本 v1.39，查看更新紀錄');const release39=document.createElement('article');release39.className='release-entry';release39.innerHTML='<b>v1.39</b><time>2026-10-16</time><p>修正油料「取得月份資料」同日只讀快取的問題，手動取得會重新抓取並保留編輯。地圖客戶彈窗顯示當次路線備註，手機導覽與地圖操作按鈕統一尺寸。主使用者觸發全員每日更新需後端完成設定與驗收後才啟用。</p>';releaseHistory.querySelector('h2').after(release39);
