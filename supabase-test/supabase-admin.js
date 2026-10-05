// Measured database usage is available only through the admin-authorized RPC.
const supabaseUsageCard=document.createElement('article');
supabaseUsageCard.className='card hide';
supabaseUsageCard.innerHTML='<h3>Supabase 用量</h3><div id="supabaseUsageResult">尚未讀取</div><button id="supabaseUsageRefresh">重新整理</button>';
adminPanel.prepend(supabaseUsageCard);
let supabaseUsageBusy=false,supabaseUsageLast=0;
async function refreshSupabaseUsage(){
 if(!isPlannerAdmin()||!plannerAccessReady()||supabaseUsageBusy)return;
 supabaseUsageBusy=true;const user=cloudUser,button=document.getElementById('supabaseUsageRefresh');button.disabled=true;
 try{
  const data=plannerResult(await supabasePlannerClient.rpc('planner_database_usage'));
  if(cloudUser?.uid!==user.uid||!isPlannerAdmin())return;
  const used=Number(data.database_bytes);if(!Number.isFinite(used)||used<0)throw Error('用量格式錯誤');
  const limit=500*1024*1024,remaining=Math.max(0,limit-used);
  const format=bytes=>(bytes/1024/1024).toFixed(1)+' MB';
  document.getElementById('supabaseUsageResult').replaceChildren();
  const lines=['資料庫 '+format(used)+'／500 MB · 剩餘 '+format(remaining),'API 讀寫不限次數','檔案儲存與傳輸用量：尚未接上管理 API'];
  for(const line of lines){const p=document.createElement('p');p.textContent=line;document.getElementById('supabaseUsageResult').append(p);}
  const time=document.createElement('small');time.textContent='更新 '+displayAccessTime(data.measured_at);document.getElementById('supabaseUsageResult').append(time);
  supabaseUsageLast=Date.now();
 }catch(error){document.getElementById('supabaseUsageResult').textContent=error.message||'用量讀取失敗';}
 finally{supabaseUsageBusy=false;button.disabled=false;}
}
document.getElementById('supabaseUsageRefresh').onclick=refreshSupabaseUsage;
const supabaseAdminSwitch=switchView;
switchView=function(view){supabaseAdminSwitch(view);supabaseUsageCard.classList.toggle('hide',!isPlannerAdmin());if(view==='admin'&&Date.now()-supabaseUsageLast>60000)refreshSupabaseUsage();};
supabaseUsageCard.classList.toggle('hide',!isPlannerAdmin());

releaseButton.textContent='v1.18';releaseButton.setAttribute('aria-label','版本 v1.18，查看更新紀錄');const release18=document.createElement('article');release18.className='release-entry';release18.innerHTML='<b>v1.18</b><time>2026-10-05</time><p>改用 Supabase 保存個人資料與即時同步；一鍵更新客戶、訪況及近兩月工作紀錄；保留原版資料移轉、管理者容量與登入紀錄，加入自動資料庫健康檢查。</p>';releaseHistory.querySelector('h2').after(release18);
