// Holiday reminders never fabricate a reason or change the user's saved note.
function fuelHoliday42(date){
 if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date))return {holiday:null,label:'日期無效'};
 const stamp=new Date(date+'T00:00:00Z');if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==date)return {holiday:null,label:'日期無效'};
 const weekend=[0,6].includes(stamp.getUTCDay()),year=Number(date.slice(0,4)),calendar=holidaysByYear[year];
 return weekend?{holiday:true,label:stamp.getUTCDay()===6?'週六':'週日'}:calendar?.includes(date.slice(5))?{holiday:true,label:'國定假日／補假'}:calendar?{holiday:false,label:'工作日'}:{holiday:null,label:'該年度假日日曆尚未載入'};
}
function drawFuelHolidays42(){
 if(!fuelData30||fuelUid30!==cloudUser?.uid)return;
 const rows=document.querySelectorAll('#fuelPreview30 .fuel-row32');
 rows.forEach((row,index)=>{const item=fuelData30.items[index],field=row.querySelector('textarea');if(!item||!field)return;const day=fuelHoliday42(item.date);let note=row.querySelector('.fuel-holiday42');
  if(day.holiday===false){note?.remove();return;}if(!note){note=document.createElement('p');note.className='fuel-holiday42';note.id='fuelHoliday42-'+item.date;note.setAttribute('role','status');row.append(note);field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));}
  const filled=!!field.value.trim();note.textContent=day.holiday===null?day.label+'，請自行確認是否需填假日出勤備註。':day.label+' · '+(filled?'已填寫備註說明':'假日出勤，請填寫備註說明');note.classList.toggle('needs-note42',day.holiday===true&&!filled);row.classList.toggle('holiday-row42',day.holiday===true);
 });
}
const fuelDrawBefore42=drawFuel30;drawFuel30=function(){fuelDrawBefore42();drawFuelHolidays42();};
document.getElementById('fuelPreview30').addEventListener('input',event=>{if(event.target.matches('textarea'))drawFuelHolidays42();});
const holidayStyle42=document.createElement('style');holidayStyle42.textContent='.fuel-holiday42{grid-column:1/-1;margin:0;padding:8px 12px;background:#eef5f1;border-radius:8px;font-size:13px}.fuel-holiday42.needs-note42{background:#fff1d5;color:#775000;font-weight:600}.holiday-row42{border-left:3px solid #cf9d37;padding-left:10px}';document.head.append(holidayStyle42);
releaseButton.textContent='v1.42';releaseButton.setAttribute('aria-label','版本 v1.42，查看更新紀錄');const release42=document.createElement('article');release42.className='release-entry';release42.innerHTML='<b>v1.42</b><time>2026-10-17</time><p>營業所工作可對應個人設定的固定營業所座標，沿用一般門市到點／離站超過 400 公尺、每人每月容錯 10 筆的暫定規則；其他營業所不會套錯位置。油料申請依辦公日曆與週末標註假日，備註空白時提醒填寫，填好即更新提示；保留原備註內容。</p>';releaseHistory.querySelector('h2').after(release42);
if(activeView==='work')renderWorkPanel();if(activeView==='fuel')drawFuel30();
