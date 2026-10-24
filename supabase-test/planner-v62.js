// The administrator customer directory lives directly at the bottom of Settings.
customerOpen61.remove();
const customerSection62=el58('section','','card customer-section62');customerSection62.id='allCustomers62';
customerSection62.append(el58('h2','全業務客戶名單'),customerDirectoryBody61);q58('panel-data').append(customerSection62);
const typeLabel62=el58('label','店家型態／品牌'),typeSelect62=el58('select');typeSelect62.id='customerType62';typeSelect62.setAttribute('aria-label','名單店家型態');typeLabel62.append(typeSelect62);q58('customerIssue61').parentElement.before(typeLabel62);
q58('customerIssue61').replaceChildren(...[['all','全部資料'],['review','重複或異常待核對'],['crossBrand','跨品牌同名店（非異常）'],['sameBrand','同品牌同名、不同代碼'],['unknownName','品牌未明的同名店'],['sameCode','同代碼多筆來源'],['gps','缺少有效座標']].map(([value,label])=>new Option(label,value)));

// A brand is explicit business identity, not the Chinese branch name or broad channel.
function customerBrand62(row){
 const text=String(row.type||'').normalize('NFKC').trim().replace(/\s+/g,'').toLowerCase();
 const groups=[['統一',['統一','統一超商','統一超商股份有限公司','7-11','7-eleven','7eleven']],['全聯',['全聯','全聯社','全聯福利中心']],['全家',['全家','全家便利商店']],['萊爾富',['萊爾富','萊爾富便利商店']],['OK',['ok','ok超商','ok便利商店','來來超商']],['美廉社',['美廉社']],['家樂福',['家樂福','家樂福超市','家樂福量販']],['大潤發',['大潤發']],['愛買',['愛買']]];
 for(const [brand,aliases]of groups)if(aliases.includes(text))return brand;
 // These explicit chain prefixes are also retained in the company customer codes.
 const prefix=String(row.code||'').split('-')[0].toUpperCase();return ({'7E':'統一',PX:'全聯',FM:'全家',HL:'萊爾富',OK:'OK',SM:'美廉社'})[prefix]||'';
}
const auditBefore62=customerAudit61;
customerAudit61=function(entries){
 const rows=auditBefore62(entries);for(const row of rows){row.issues61=row.issues61.filter(id=>id!=='sameName');row.info62=[];row.brand62=customerBrand62(row);}
 const names=new Map();for(const r of rows){const name=String(r.name||'').normalize('NFKC').trim().replace(/\s+/g,'');if(!name)continue;const key=r.visitor+'|'+name,list=names.get(key)||[];list.push(r);names.set(key,list);}
 for(const list of names.values())for(const row of list){const others=list.filter(r=>String(r.code)!==String(row.code));if(!others.length)continue;
  if(row.brand62&&others.some(r=>r.brand62&&r.brand62!==row.brand62))row.info62.push('crossBrand');
  if(row.brand62&&others.some(r=>r.brand62===row.brand62))row.issues61.push('sameBrand');
  if(!row.brand62||others.some(r=>!r.brand62))row.issues61.push('unknownName');
 }
 return rows;
};
function matchesCustomerStatus62(row,status){return status==='all'||status==='review'&&row.issues61.length>0||status==='crossBrand'&&row.info62.includes('crossBrand')||row.issues61.includes(status);}
drawCustomerDirectory61=function(){
 if(!admin58())return;const entries=entries58(),rows=customerAudit61(entries),person=q58('customerPerson61'),channel=q58('customerChannel61'),grade=q58('customerGrade61');
 options58(person,[['','全部訪員'],...[...new Set(rows.map(r=>r.visitor))].sort().map(v=>[v,v])],person.value);
 const owned=rows.filter(r=>!person.value||r.visitor===person.value);options58(channel,[['','全部通路'],...[...new Set(owned.map(r=>r.channel||'未分類'))].sort().map(v=>[v,v])],channel.value);
 const channels=owned.filter(r=>!channel.value||r.channel===channel.value);options58(grade,[['','全部等級'],...[...new Set(channels.map(r=>r.grade||'未設定'))].sort().map(v=>[v,v])],grade.value);
 const grades=channels.filter(r=>!grade.value||(r.grade||'未設定')===grade.value);options58(typeSelect62,[['','全部型態／品牌'],...[...new Set(grades.map(r=>r.type||'未設定'))].sort().map(v=>[v,v])],typeSelect62.value);
 const issue=q58('customerIssue61').value,term=q58('customerSearch61').value.trim().toLowerCase(),shown=grades.filter(r=>(!typeSelect62.value||(r.type||'未設定')===typeSelect62.value)&&(!term||[r.name,r.code,r.address,r.type,r.brand62].join(' ').toLowerCase().includes(term))&&matchesCustomerStatus62(r,issue)).sort((a,b)=>b.issues61.length-a.issues61.length||a.visitor.localeCompare(b.visitor,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant')||a.code.localeCompare(b.code));
 q58('customerLoad61').textContent=entries.filter(e=>e.ready).length+'/'+entries.length+' 位資料已載入 · 不同品牌的同名店不計入重複異常。';q58('customerCount61').textContent=shown.length+' 家符合 · '+shown.filter(r=>r.issues61.length).length+' 家待核對 · '+shown.filter(r=>r.info62.includes('crossBrand')).length+' 家跨品牌同名店';
 const root=q58('customerList61'),signature=JSON.stringify([person.value,channel.value,grade.value,typeSelect62.value,issue,term,customerLimit61,shown]);if(root.dataset.signature62===signature)return;root.dataset.signature62=signature;root.replaceChildren();
 for(const r of shown.slice(0,customerLimit61)){const card=el58('article','','customer-row58');card.append(el58('b',r.name),el58('small',r.visitor+' · '+r.code+' · '+r.channel+' · '+r.grade+' · '+(r.type||'型態未設定')),el58('p',r.address||(validGps(r.gps)?'座標 '+r.gps.map(n=>Number(n).toFixed(6)).join(', '):'座標未提供')));
  if(r.info62.includes('crossBrand'))card.append(el58('p','跨品牌同名店 · '+r.brand62+' · 不列為重複異常','audit-info62'));
  if(r.issues61.length)card.append(el58('p',r.issues61.map(id=>({sameCode:'同一訪員同代碼有多筆來源，請核對',sameBrand:'同品牌同名但代碼不同，請核對',unknownName:'同名店的品牌資料未明，請核對',gps:'缺少有效座標'})[id]).join('；'),'audit-warning61'));root.append(card);
 }
 if(shown.length>customerLimit61)root.append(makeAction('顯示更多客戶',()=>{customerLimit61+=80;drawCustomerDirectory61();}));if(!shown.length)root.append(el58('p','沒有符合的客戶，或名冊仍在載入。'));
};
typeSelect62.onchange=()=>{customerLimit61=80;drawCustomerDirectory61();};
const managerAllowedBefore62=managerAllowed;managerAllowed=function(){return managerAllowedBefore62()||admin58()&&activeView==='data';};
const managerRenderBefore62=renderManagerOverview;renderManagerOverview=function(){if(activeView==='data'){if(admin58())drawCustomerDirectory61();return;}return managerRenderBefore62();};
function guardDirectory62(){const allowed=admin58();customerSection62.hidden=!allowed;if(!allowed){q58('customerList61').replaceChildren();delete q58('customerList61').dataset.signature62;typeSelect62.replaceChildren();q58('customerLoad61').textContent='';q58('customerCount61').textContent='';}else if(activeView==='data')connectManager();}
const gateBefore62=refreshAccountGate;refreshAccountGate=function(){gateBefore62();guardDirectory62();};
const switchBefore62=switchView;switchView=function(view){switchBefore62(view);guardDirectory62();if(view==='data'&&admin58()){connectManager();loadPendingManager42();drawCustomerDirectory61();}};
const style62=el58('style');style62.textContent='.customer-section62{margin-top:26px;padding:24px}.customer-section62[hidden]{display:none!important}.customer-section62 h2{margin:0 0 16px;font-size:22px}.customer-section62 .customer-filters61{grid-template-columns:repeat(5,minmax(0,1fr))}.customer-section62 #customerSearch61{max-width:600px}.customer-section62 #customerList61{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.audit-info62{padding:8px 12px;background:#edf5f2;color:#3b6a59;border-radius:8px;font-size:13px}.customer-section62 .customer-row58{min-width:0;overflow-wrap:anywhere}@media(max-width:1000px){.customer-section62 .customer-filters61{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.customer-section62{padding:16px}.customer-section62 .customer-filters61{grid-template-columns:1fr 1fr}.customer-section62 #customerList61{grid-template-columns:1fr}}';document.head.append(style62);
releaseButton.textContent='v1.62';releaseButton.setAttribute('aria-label','版本 v1.62，查看更新紀錄');const release62=el58('article','','release-entry');release62.innerHTML='<b>v1.62</b><time>2026-10-24</time><p>全業務客戶名單直接移至資料與設定頁面下方，保留管理者限定。依店家型態／品牌區分同名店：跨品牌同名不計入異常，可用下拉選單單獨查看；另可篩選同品牌同名異碼、品牌未明、同碼重複來源與缺座標，並新增型態／品牌下拉篩選。</p>';releaseHistory.querySelector('h2').after(release62);guardDirectory62();if(admin58()&&activeView==='data')drawCustomerDirectory61();
