// GPS policies are separate; completed routes and account authorization stay intact.
function workStaySeconds41(row){const start=workTimestamp(row.gpsCheckInAt||row.checkInAt),end=workTimestamp(row.checkOutAt)??workTimestamp(row.completedAt);return start!==null&&end!==null&&end>=start?(end-start)/1000:null;}
const limitBefore41=workLimit31;
workLimit31=function(id){return id==='offset'?10:id==='tempAway'?5:limitBefore41(id);};
combinedOffsets37=function(data){return (data?.items||[]).filter(r=>String(r.name||'').trim()!=='臨時點'&&Number(r.meters)>400);};
offsetDetails30=function(data){const box=document.createElement('div'),items=combinedOffsets37(data),summary=document.createElement('p');summary.textContent='一般門市離站偏移 '+(data?items.length+' 筆':'尚未同步')+' · 每人每月容錯 10 筆（暫定）';box.append(summary);for(const item of items){const p=document.createElement('p');p.textContent=(item.name||'')+' · '+item.day+' '+item.time+' · '+item.type+' · '+Math.round(item.meters)+' 公尺';box.append(p);}return box;};
drawOffsetCard30=function(){
 const grid=document.getElementById('workCheckCards');if(!grid)return;
 for(const card of [...grid.children])if(card!==offsetCard30&&card.querySelector('span')?.textContent==='離站偏移')card.remove();
 grid.append(offsetCard30);offsetCard30.replaceChildren();
 const a=workSnapshot?workAnalysis():null,c=a?.categories.find(x=>x.id==='offset'),n=c?.count||0;
 const title=document.createElement('span'),count=document.createElement('strong'),note=document.createElement('small');title.textContent='離站偏移';count.textContent=a?String(n):'—';
 note.textContent='每人每月容錯 10 筆（暫定） · '+(n>10?'超過 '+(n-10):'剩 '+(10-n))+(c?.unknown?' · '+c.unknown+' 筆座標不足，無法判定':'');
 offsetCard30.classList.toggle('limit-exceeded',n>10);offsetCard30.append(title,count,note);offsetCard30.onclick=()=>setWorkFilter('offset');
};
const workPanelBefore41=renderWorkPanel;
renderWorkPanel=function(){
 workPanelBefore41();const grid=document.getElementById('workCheckCards');if(!grid)return;
 for(const card of [...grid.children])if(card.querySelector('span')?.textContent==='臨時點異地離站')card.remove();
 const temporary=workSnapshot?workAnalysis().categories.find(c=>c.id==='tempAway'):null;
 let card=Array.from(grid.children).find(c=>c.querySelector('span')?.textContent==='臨時點');
 if(temporary){if(!card){card=makeAction('',()=>setWorkFilter('tempAway'));card.className='work-check-card';grid.append(card);}card.replaceChildren();
  const name=document.createElement('span'),count=document.createElement('strong'),note=document.createElement('small');name.textContent='臨時點';count.textContent=temporary.count;
  note.textContent='每人每月容錯 5 筆（暫定） · '+(temporary.count>5?'超過 '+(temporary.count-5):'剩 '+(5-temporary.count))+(temporary.unknown?' · '+temporary.unknown+' 筆座標不足，無法判定':'');
  card.classList.toggle('limit-exceeded',temporary.count>5);card.append(name,count,note);
 }
 drawOffsetCard30();document.getElementById('tempAwayUnknown32')?.remove();
};
const evidenceBefore41=workEvidence38;
const recordsBefore41=drawWorkRecords;
drawWorkRecords=function(analysis){recordsBefore41(analysis);for(const card of document.querySelectorAll('#workRecordRows .work-record')){const id=[...card.querySelectorAll('.work-detail>div')].find(x=>x.textContent.startsWith('工作 ID'))?.querySelector('b')?.textContent,row=analysis.rows.find(r=>r.id===id);if(row&&String(row.name||'').trim()!=='臨時點'&&!row.offsetKnown){const note=card.querySelector('.work-no-flag');if(note)note.textContent='座標不足，無法判定偏移';}}};
workEvidence38=function(row){const card=evidenceBefore41(row);if(row.flags.includes('offset')){for(const [kind,distance] of [['到點',row.checkInDistance],['離站',row.checkOutDistance]]){const p=document.createElement('p');p.textContent=kind+'距門市 '+(distance===null?'座標不足，無法判定':Math.round(distance)+' 公尺');card.append(p);}}else if(String(row.name||'').trim()==='臨時點'){const p=document.createElement('p');p.textContent='到點至離站 '+(row.tempAwayMeters===null?'座標不足，無法判定':Math.round(row.tempAwayMeters)+' 公尺');card.append(p);}return card;};
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||event.isComposing)return;
 const top=[...document.querySelectorAll('.modal.show')].at(-1);
 if(top){event.preventDefault();closeModal(top.id);return;}
 for(const dialog of document.querySelectorAll('dialog[open]')){event.preventDefault();dialog.close();}
 map?.closePopup();
});
releaseButton.textContent='v1.41';releaseButton.setAttribute('aria-label','版本 v1.41，查看更新紀錄');const entry41=document.createElement('article');entry41.className='release-entry';entry41.innerHTML='<b>v1.41</b><time>2026-10-17</time><p>工作頁移除未讀、未完成、缺時間與刷機標記；每日跑點只顯示已打卡工作，每個框顯示停留時間。一般門市到點或離站距名冊座標超過 400 公尺才偏移，每人每月容錯 10 筆（暫定）；臨時點只比較第一次到點與離站 GPS，超過 400 公尺才異常，每人每月容錯 5 筆（暫定）。兩類分開抽屜顯示；Esc 可關閉彈出視窗。</p>';releaseHistory.querySelector('h2').after(entry41);
if(activeView==='work')renderWorkPanel();
