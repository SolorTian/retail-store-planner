// All edits below are ephemeral and cannot reach either account's storage.
scheduleCloudSave=()=>{};saveToCloud=async()=>toast('模擬檢視：操作不會儲存');
cacheState=()=>{};dirty=function(){editGeneration++;localDirty=false;};
runDailyRefresh=async()=>{};updateCompanyVisits=async()=>({success:false,error:'模擬檢視不能更新公司資料'});
verifyCompanyBinding=async()=>toast('模擬檢視不能操作帳密');
showCredentialDrawer=()=>toast('模擬檢視不提供業務王帳密');
commitSharedRules=async()=>toast('模擬檢視不能修改共用規則');
saveAutoPreference=async()=>{};saveDepot=async()=>{};
mutateFavorites22=async()=>{document.getElementById('favoritesStatus22').textContent='模擬檢視不能儲存常用路線';};
isPlannerAdmin=()=>false;loginCloud=()=>toast('請關閉模擬檢視返回管理總覽');
const previewNote=document.createElement('div');previewNote.className='preview-note';previewNote.textContent='模擬檢視 · 操作不會儲存';document.querySelector('header').after(previewNote);
const previewStyle=document.createElement('style');previewStyle.textContent='.preview-note{background:#fff4db;padding:7px 12px;font-size:12px;text-align:center}';document.head.append(previewStyle);
render();
