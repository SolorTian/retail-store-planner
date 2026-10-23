// Compact comparable progress bars; existing required-visit and drill-down rules stay intact.
progressChart59=function(metrics,label,choose){
 const wrap=el58('div','','progress-chart60'),track=el58('div','','progress-track60'),legend=el58('div','','progress-legend60');
 track.setAttribute('role','group');track.setAttribute('aria-label',label+'：應訪 '+metrics.needed+' 家');
 for(const [id,title,color] of [['met','達標','#16866c'],['missing','缺訪','#d7784b'],['unknown','尚未同步','#a4b2b8']]){
  const count=metrics[id];if(id==='unknown'&&!count)continue;
  if(count&&metrics.needed){const segment=makeAction('',()=>choose(id));segment.className='progress-segment60';segment.style.width=(count/metrics.needed*100)+'%';segment.style.background=color;segment.setAttribute('aria-label',label+' · '+title+' '+count+' 家，按下查看');track.append(segment);}
  const b=makeAction(title+' '+count+' 家',()=>choose(id));b.className='progress-key60';b.style.setProperty('--segment',color);legend.append(b);
 }
 wrap.append(track,legend);return wrap;
};
const progressDrawBefore60=drawProgress59;
drawProgress59=function(){progressDrawBefore60();if(!admin58()||activeView!=='progress')return;const hint=q58('progressSummary59').querySelector('.progress-summary-info59 .notice');if(hint)hint.textContent='點選缺訪數或進度條，逐層查看訪員與缺訪店家。';};
paths49.progress='<path d="M4 4v16h16M8 15h9M8 10h6M8 5h3"/>';
for(const b of progressNav59)if(b.closest('.more-grid49'))b.innerHTML=icon49('progress')+'<span>拜訪進度</span>';

// Add actual synchronized questionnaire names inside the personal work detail and evidence drawers.
function questionnaireBlock60(row){
 const box=el58('section','','questionnaires60');box.append(el58('h4','工作／問卷'));
 const names=workflows58(row);if(names.length){const list=el58('ul');for(const name of names)list.append(el58('li',name));box.append(list);}else box.append(el58('p','問卷名稱尚未同步，請更新工作資料。','notice'));
 return box;
}
function fillWorkQuestionnaires60(analysis){
 const byId=new Map((analysis?.rows||[]).map(r=>[String(r.id),r]));
 for(const card of document.querySelectorAll('#workRecordRows .work-record')){
  const detail=card.querySelector('.work-detail');if(!detail||detail.querySelector('.questionnaires60'))continue;
  const id=[...detail.querySelectorAll(':scope>div')].find(x=>x.textContent.startsWith('工作 ID'))?.querySelector('b')?.textContent,row=byId.get(String(id));
  if(row)detail.prepend(questionnaireBlock60(row));
 }
}
const workRecordsBefore60=drawWorkRecords;drawWorkRecords=function(analysis){workRecordsBefore60(analysis);fillWorkQuestionnaires60(analysis);};
const evidenceBefore60=workEvidence38;workEvidence38=function(row){const card=evidenceBefore60(row);card.querySelector('h3')?.after(questionnaireBlock60(row));return card;};

// The directory is a primary-administrator RPC containing labels only, not credential documents.
const directory60=el58('section','','account-directory60');directory60.id='accountDirectory60';
const directoryHeader60=el58('div','','section-head58'),directoryStatus60=el58('p','','notice'),directoryRows60=el58('div');
directoryStatus60.setAttribute('role','status');directoryHeader60.append(el58('h3','全業務帳號對照'),makeAction('重新讀取',()=>loadDirectory60(true)));directory60.append(directoryHeader60,directoryStatus60,directoryRows60);globalCard40.append(directory60);
let directoryOwner60='',directoryLoading60=false,directoryGeneration60=0;
async function loadDirectory60(force=false){
 if(!admin58())return;const uid=cloudUser.uid;if(directoryLoading60||!force&&directoryOwner60===uid)return;
 directoryLoading60=true;const generation=++directoryGeneration60;directoryStatus60.textContent='正在讀取帳號對照…';
 try{const rows=plannerResult(await supabasePlannerClient.rpc('planner_account_directory'));if(!admin58()||cloudUser.uid!==uid||generation!==directoryGeneration60)return;
  directoryRows60.replaceChildren();const table=el58('table','','account-table60'),head=el58('thead'),heading=el58('tr');for(const name of ['訪員','業務王帳號','Google 帳號','狀態'])heading.append(el58('th',name));head.append(heading);table.append(head);const body=el58('tbody');
  for(const row of rows){const tr=el58('tr');for(const text of [row.name||'待連結訪員',row.accountLabel||'尚未綁定',row.email||'尚未連結 Google',!row.active?'已停用':row.kind!=='member'?'等待連結':row.verified?'已連結':'尚未完成驗證'])tr.append(el58('td',text));body.append(tr);}table.append(body);directoryRows60.append(table);directoryOwner60=uid;directoryStatus60.textContent=rows.length+' 個帳戶';
 }catch(error){if(generation===directoryGeneration60&&admin58())directoryStatus60.textContent='帳號對照讀取失敗：'+linkError58(error);}
 finally{if(generation===directoryGeneration60)directoryLoading60=false;}
}
const globalOpenButton60=[...settingsActions58.querySelectorAll('button')].find(b=>b.textContent.startsWith('全員資料更新'));
const globalOpenBefore60=globalOpenButton60.onclick;globalOpenButton60.onclick=function(event){if(!admin58())return;globalOpenBefore60?.call(this,event);loadDirectory60(true);};
function guardSettings60(){
 const allowed=admin58();settingsActions58.hidden=!allowed;settingsActions58.classList.toggle('hide',!allowed);
 if(!allowed){for(const modal of [globalSettings58,historySettings58,usageSettings58])closeModal(modal.id);directoryGeneration60++;directoryOwner60='';directoryLoading60=false;directoryRows60.replaceChildren();directoryStatus60.textContent='';pendingRows40.replaceChildren();}
}
const gateBefore60=refreshAccountGate;refreshAccountGate=function(){gateBefore60();guardSettings60();};
const modalBefore60=openModal;openModal=function(id){if([globalSettings58.id,historySettings58.id,usageSettings58.id].includes(id)&&!admin58())return;return modalBefore60(id);};

// Stretch the map column without rebuilding markers or requesting a new road route.
const routeColumn60=document.querySelector('#panel-map .maplayout>div');routeColumn60.classList.add('route-map-column60');
const style60=el58('style');style60.textContent=`
.settings-shortcuts59{grid-column:1/-1;gap:12px}.settings-shortcuts59>.settings-entry58{width:100%;box-sizing:border-box}
.settings-actions58[hidden],.settings-actions58.hide{display:none!important}
.progress-summary59{grid-template-columns:minmax(230px,.8fr) minmax(280px,1.2fr);gap:32px}.progress-summary-info59 h3{margin:6px 0 10px}.progress-summary-info59 .progress-gap59{margin:8px 0}
.progress-cards59{display:flex;flex-direction:column;gap:10px}.progress-group59{display:grid;grid-template-columns:minmax(130px,.85fr) minmax(200px,1.5fr) minmax(155px,.8fr) 115px;text-align:left;align-items:center;gap:22px;padding:18px 22px}.progress-group59 h3{font-size:16px}.progress-group59>.primary{margin:0;font-size:13px;min-height:40px}.progress-group59>.progress-gap59{font-size:13px;margin:0;text-align:right}
.progress-chart60{width:100%;min-width:0}.progress-track60{height:14px;background:#e6ece9;border-radius:5px;display:flex;overflow:hidden;width:100%}.progress-segment60{padding:0;border:0;border-radius:0;min-height:14px;height:14px;flex:none;cursor:pointer}.progress-segment60:hover{filter:brightness(.85)}.progress-segment60:focus-visible{outline:3px solid #17323a;outline-offset:-3px}.progress-legend60{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:7px}.progress-key60{background:transparent;border:0;padding:4px 0;min-height:30px;font-size:12px;white-space:nowrap}.progress-key60:before{content:'';display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--segment);margin-right:5px}
.questionnaires60{grid-column:1/-1;border:1px solid #dce8e2;background:#f1f7f4;border-radius:10px;padding:14px 18px}.questionnaires60 h4{margin:0 0 8px;font-size:14px}.questionnaires60 ul{margin:0;padding-left:20px;line-height:1.9;font-size:14px}.account-directory60{margin-top:24px;border-top:1px solid var(--line);padding-top:20px}.account-table60{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}.account-table60 th{text-align:left;color:var(--muted);font-weight:500}.account-table60 td,.account-table60 th{padding:12px 7px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.account-table60 th:nth-child(3){width:35%}
@media(min-width:901px){#panel-map .maplayout{align-items:stretch}#panel-map .route-map-column60{display:flex;flex-direction:column;min-height:0}#panel-map .route-map-column60>.mapframe{flex:1;display:flex;flex-direction:column;min-height:0}#panel-map .route-map-column60>.notice{display:none}#panel-map .route-map-column60>.legend{display:none}#panel-map #map{flex:1;height:auto!important;min-height:430px}#panel-map .route-aside{box-sizing:border-box;min-height:520px}}
@media(max-width:1000px){.progress-group59{grid-template-columns:minmax(120px,.8fr) minmax(180px,1.3fr) 115px}.progress-group59>.progress-gap59{grid-column:2;grid-row:2;text-align:left}.progress-group59>.primary{grid-column:3;grid-row:1/3}}
@media(max-width:600px){.progress-summary59{grid-template-columns:1fr;text-align:left;gap:18px}.progress-summary-info59{grid-row:1}.progress-group59{grid-template-columns:1fr auto;gap:10px 12px;padding:16px}.progress-group59>.progress-chart60{grid-column:1/-1;grid-row:2}.progress-group59>.progress-gap59{grid-column:1/-1;grid-row:3}.progress-group59>.primary{grid-column:2;grid-row:1;width:auto}.progress-group59 h3{font-size:16px}.account-table60{font-size:12px}.account-table60 td,.account-table60 th{padding:10px 4px}.account-table60 th:first-child{width:20%}.account-table60 th:nth-child(4){width:16%}}
`;document.head.append(style60);
if(typeof ResizeObserver!=='undefined'){const observer60=new ResizeObserver(()=>{if(activeView==='map'&&q58('map').getBoundingClientRect().width)map?.invalidateSize({pan:false});});observer60.observe(q58('map'));}
const switchBefore60=switchView;switchView=function(view){switchBefore60(view);guardSettings60();if(view==='map')requestAnimationFrame(()=>map?.invalidateSize({pan:false}));};
releaseButton.textContent='v1.60';releaseButton.setAttribute('aria-label','版本 v1.60，查看更新紀錄');const release60=el58('article','','release-entry');release60.innerHTML='<b>v1.60</b><time>2026-10-23</time><p>拜訪進度改為可比較的橫向進度列，保留通路、訪員與缺訪店家逐層查看。路線地圖與右欄對齊；店點與異常設定按鈕對齊更新按鈕。工作明細補上已同步問卷。新增全業務的業務王與 Google 帳號對照，管理設定僅限田琰澤查看，後端只提供帳號標籤。</p>';releaseHistory.querySelector('h2').after(release60);
guardSettings60();if(activeView==='progress')drawProgress59();if(activeView==='work')fillWorkQuestionnaires60(workAnalysis());
