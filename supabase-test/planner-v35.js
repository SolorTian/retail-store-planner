// The first mobile work screen is reserved for the complete anomaly overview.
function fitWorkCards35(){if(activeView!=='work'||!matchMedia('(max-width:760px)').matches)return;const grid=document.getElementById('workCheckCards');if(!grid)return;const top=grid.getBoundingClientRect().top+window.scrollY,nav=document.querySelector('.bottomnav'),bottom=nav?.getBoundingClientRect().top||innerHeight;grid.style.setProperty('--work-card-height35',Math.max(300,bottom-top-12)+'px');}
const workRender35=renderWorkPanel;renderWorkPanel=function(){workRender35();const root=document.getElementById('workDashboard'),grid=document.getElementById('workCheckCards');if(!grid)return;const missing=workAnalysis().categories.find(x=>x.id==='tempAway');if(missing?.available===false){const card=document.createElement('button');card.className='work-check-card';card.dataset.check='tempAway';card.innerHTML='<span>臨時點異地離站</span><strong>—</strong><small>報表未提供座標</small>';card.onclick=()=>setWorkFilter('tempAway');grid.insertBefore(card,offsetCard30);}if(matchMedia('(max-width:760px)').matches){const extra=root.querySelector('.work-extra'),stats=root.querySelector('.work-stats');if(extra&&stats)extra.after(stats);document.getElementById('tempAwayUnknown32')?.remove();}requestAnimationFrame(fitWorkCards35);};
const workSwitch35=switchView;switchView=function(view){workSwitch35(view);if(view==='work'){window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(fitWorkCards35);}};
window.addEventListener('resize',fitWorkCards35);window.visualViewport?.addEventListener('resize',fitWorkCards35);
const compact35=document.createElement('style');compact35.textContent=`
@media(max-width:760px){
 .customer-table-header{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:5px;flex-wrap:nowrap!important}
 .customer-table-header h3{font-size:15px;white-space:nowrap;min-width:0}
 .customer-table-header .selection-total{font-size:11px;white-space:nowrap;text-align:center;min-width:0}
 .customer-table-header strong{font-size:17px;margin-left:3px}
 #favoriteRoutesButton,#extraRouteButton28{font-size:12px;min-height:40px;padding:6px 8px;white-space:nowrap;min-width:0;margin:0}
 #panel-work>.intro{margin:0 0 6px}#panel-work>.intro h2{font-size:18px;margin:0}
 #panel-work .work-controls{margin:0;gap:8px;align-items:end}#panel-work .work-controls label{font-size:11px}
 #panel-work .work-controls input,#panel-work .work-controls button{min-height:40px;padding:8px;font-size:14px}
 #workSourceStatus{font-size:11px;margin:6px 0 10px;line-height:1.35}
 #workDashboard>.notice{display:none}
 #workCheckCards{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(92px,1fr));gap:7px;height:var(--work-card-height35,calc(100dvh - 240px));margin:0 0 16px}
 #workCheckCards .work-check-card{min-width:0;padding:8px 7px;gap:4px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;overflow-wrap:anywhere}
 #workCheckCards .work-check-card span{font-size:12px;line-height:1.35;font-weight:600}
 #workCheckCards .work-check-card strong{font-size:28px;line-height:1.1}
 #workCheckCards .work-check-card small{font-size:11px;line-height:1.35}
 #workDashboard .work-extra{margin-top:16px}
}
@media(max-width:350px){.customer-table-header{gap:3px}.customer-table-header h3{font-size:14px}#favoriteRoutesButton,#extraRouteButton28{font-size:11px;padding:6px}.customer-table-header strong{font-size:16px}}
`;document.head.append(compact35);document.getElementById('favoriteRoutesButton').textContent='常用路線';
// Users bring their own selected coordinate; no Google Places API or scraping.
function parsePersonalGps35(value){
 const pair=text=>{const m=String(text).trim().match(/^\(?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[,，\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*\)?$/);if(!m)return null;const gps=[Number(m[1]),Number(m[2])];return validGps(gps)?gps:null;};
 const text=String(value||'').trim();let gps=pair(text);if(gps)return gps;
 let url;try{url=new URL(text);}catch{throw Error('請貼上緯度、經度，例如 24.86, 121.22');}
 if(url.protocol!=='https:'||!/(^|\.)google\.(com|com\.tw)$/.test(url.hostname))throw Error('請貼座標或 Google Maps 完整地點連結；短網址請改貼座標');
 for(const key of ['query','q']){gps=pair(url.searchParams.get(key)||'');if(gps)return gps;}
 let decoded;try{decoded=decodeURIComponent(url.pathname+url.search);}catch{throw Error('連結格式不符，請改貼座標');}
 const pairs=[...decoded.matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/g)].map(m=>[Number(m[1]),Number(m[2])]).filter(validGps),unique=new Map(pairs.map(x=>[JSON.stringify(x),x]));
 if(unique.size===1)return [...unique.values()][0];
 throw Error(unique.size>1?'連結有多個位置，請改貼目標地點的座標':'連結沒有明確地點座標，請在 Google Maps 長按地點後複製座標');
}
const personalTools35=document.createElement('div');personalTools35.id='personalTools35';personalTools35.hidden=true;personalTools35.innerHTML='<div class="personal-actions35"><a id="googleSearch35" class="primary" target="_blank" rel="noopener noreferrer">Google Maps 搜尋 ↗</a><button type="button" id="pastePoint35">貼座標／連結</button></div><form id="pastePointForm35" hidden><label>地點名稱<input id="pastePointName35" maxlength="180" required></label><label>座標或完整地點連結<textarea id="pastePointValue35" rows="2" maxlength="3000" required placeholder="24.86, 121.22" aria-label="貼上地點座標或連結"></textarea></label><p id="pastePointStatus35" role="status"></p><button class="primary">加入行程</button><details><summary>怎麼複製座標？</summary><p>手機：在 Google Maps 長按該地點，再複製顯示的緯度、經度。電腦：在地點按右鍵，再點座標複製。</p></details></form>';document.getElementById('extraSearchForm28').after(personalTools35);
function updateGoogleSearch35(){const term=document.getElementById('extraSearch28').value.trim(),link=document.getElementById('googleSearch35');link.href=term?'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query:term}):'https://www.google.com/maps';}
const extraMode35=setExtraMode28;setExtraMode28=function(mode){extraMode35(mode);personalTools35.hidden=mode!=='personal';document.getElementById('coordinateEntry28').hidden=true;document.getElementById('pastePointForm35').hidden=true;document.getElementById('extraSearchForm28').querySelector('button').textContent=mode==='personal'?'免費搜尋':'搜尋';updateGoogleSearch35();};
document.getElementById('privateTab28').onclick=()=>setExtraMode28('personal');document.getElementById('supportTab28').onclick=()=>setExtraMode28('support');document.getElementById('extraSearch28').addEventListener('input',updateGoogleSearch35);
document.getElementById('pastePoint35').onclick=()=>{const form=document.getElementById('pastePointForm35');form.hidden=!form.hidden;if(!form.hidden){document.getElementById('pastePointName35').value=document.getElementById('extraSearch28').value.trim();document.getElementById('pastePointStatus35').textContent='';document.getElementById('pastePointValue35').focus();}};
document.getElementById('pastePointForm35').onsubmit=event=>{event.preventDefault();if(extraMode28!=='personal'||!plannerAccessReady())return;const status=document.getElementById('pastePointStatus35');try{const gps=parsePersonalGps35(document.getElementById('pastePointValue35').value),name=document.getElementById('pastePointName35').value.trim();if(!name)throw Error('請輸入地點名稱');addRoutePoint28({name,gps,kind:'personal'});status.textContent='已加入 '+name+' · '+gps.join(', ');document.getElementById('pastePointForm35').hidden=true;}catch(error){status.textContent=error.message;}};
const personalStyle35=document.createElement('style');personalStyle35.textContent='#personalTools35[hidden],#pastePointForm35[hidden],#supportMore29[hidden],#supportCount29[hidden],#coordinateEntry28[hidden]{display:none!important}.personal-actions35{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.personal-actions35>a{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:10px;padding:8px;font-size:13px;text-decoration:none;color:white;background:#176b61}.personal-actions35>button{font-size:13px;min-height:44px}#pastePointForm35{display:grid;gap:10px;padding:14px;background:#edf5f4;border-radius:12px}#pastePointForm35 input,#pastePointForm35 textarea{width:100%;margin-top:5px;font-size:16px}#pastePointStatus35{margin:0;font-size:12px}#pastePointForm35 details{font-size:12px}';document.head.append(personalStyle35);
releaseButton.textContent='v1.35';releaseButton.setAttribute('aria-label','版本 v1.35，查看更新紀錄');const release35=document.createElement('article');release35.className='release-entry';release35.innerHTML='<b>v1.35</b><time>2026-10-13</time><p>私人地點可開啟 Google Maps 搜尋並貼座標加入免費地圖；手機清單按鈕同列，工作自檢首屏呈現全部缺失樣態。</p>';releaseHistory.querySelector('h2').after(release35);
