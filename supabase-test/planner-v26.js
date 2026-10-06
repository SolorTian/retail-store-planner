// Search every current customer in the visitor's scope, independently of list filters.
const filteredRecords26=visibleRecords;
visibleRecords=function(){const term=document.getElementById('search').value.trim().toLowerCase();if(!term)return filteredRecords26();return scopeRecords().filter(x=>[x.name,x.code,x.channel,x.type,x.owner].join(' ').toLowerCase().includes(term)).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')||String(a.code).localeCompare(String(b.code)));};
const searchRender26=render;
render=function(){searchRender26();if(document.getElementById('search').value.trim())customerHeader.querySelector('h3').textContent='搜尋結果';};
document.getElementById('search').placeholder='搜尋全客戶：店名、代碼或通路';
releaseButton.textContent='v1.26';releaseButton.setAttribute('aria-label','版本 v1.26，查看更新紀錄');const entry26=document.createElement('article');entry26.className='release-entry';entry26.innerHTML='<b>v1.26</b><time>2026-10-06</time><p>修正同店同時歸屬業務與營業所時無法更新；搜尋店家不受通路及訪況篩選限制，清空搜尋後恢復原篩選。</p>';releaseHistory.querySelector('h2').after(entry26);
