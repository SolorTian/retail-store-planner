// Explicit, read-only copy of the signed-in user's original Firebase data.
// This module loads Firebase only when the migration button is pressed.
const migrationButton=document.createElement('button');migrationButton.textContent='移轉原版資料';
const migrationStatus=document.createElement('p');migrationStatus.setAttribute('role','status');
settingsContent.append(migrationButton,migrationStatus);
const ORIGINAL_CONFIG={apiKey:'AIzaSyD6bOk90x5C_SMiVXTZih-ei9GR0kMFXr8',authDomain:'my-ttl-system.firebaseapp.com',projectId:'my-ttl-system',appId:'1:1064089344457:web:e17ae0c78af3f492767018'};
function migrationJson(value){if(value?.toDate)return value.toDate().toISOString();if(Array.isArray(value))return value.map(migrationJson);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,migrationJson(v)]));return value;}
let migrationBusy=false;
let migrationConsent=false;
const migrationDialog=document.createElement('div');migrationDialog.id='migrationConfirm';migrationDialog.className='modal';
migrationDialog.innerHTML='<div class="dialog"><h2>移轉原版資料</h2><p>複製你的原版店家、訪況、工作與行程；管理者也會複製全站訪頻規則。原版資料保留，業務王帳密不移轉。</p><footer><button id="migrationCancel">取消</button><button id="migrationProceed" class="primary">開始移轉</button></footer></div>';
document.body.append(migrationDialog);
document.getElementById('migrationCancel').onclick=()=>closeModal('migrationConfirm');
document.getElementById('migrationProceed').onclick=()=>{closeModal('migrationConfirm');migrationConsent=true;migrationButton.onclick();};
migrationButton.onclick=async()=>{
 if(migrationBusy||!cloudUser)return;
 if(!migrationConsent){openModal('migrationConfirm');return;}migrationConsent=false;
 migrationBusy=true;migrationButton.disabled=true;const target=cloudUser;
 let copied=0;
 try{
  migrationStatus.textContent='正在連線原版帳戶…';
  const appApi=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
  const authSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
  const dbSdk=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
  const app=appApi.getApps().find(x=>x.name==='[DEFAULT]')||appApi.initializeApp(ORIGINAL_CONFIG);
  if(app.options.projectId!==ORIGINAL_CONFIG.projectId)throw Error('原版專案不符，未移轉');
  const auth=authSdk.getAuth(app);await auth.authStateReady();
  let original=auth.currentUser;
  if(!original||original.email!==target.email)original=(await authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider())).user;
  if(!original.emailVerified||original.email!==target.email||!original.providerData.some(x=>x.providerId==='google.com'))throw Error('請使用與測試版相同的 Google 帳戶');
  const db=dbSdk.getFirestore(app);
  for(const bucket of ['customers','visits','routes','settings','work']){
   migrationStatus.textContent='正在複製 '+bucket+'…';
   const snapshot=await dbSdk.getDocs(dbSdk.collection(db,'route_map_test_users',original.uid,bucket));
   const docs=snapshot.docs.filter(d=>bucket!=='settings'||!['ttlCredential','accessControl'].includes(d.id));
   for(let offset=0;offset<docs.length;offset+=200){
    if(cloudUser?.uid!==target.uid)throw Error('登入帳戶已變更，移轉已停止');
    const operations=docs.slice(offset,offset+200).map(d=>({table:'planner_documents',owner:target.uid,bucket,id:d.id,data:migrationJson(d.data())}));
    plannerResult(await supabasePlannerClient.rpc('planner_write',{operations}));copied+=operations.length;
   }
  }
  if(target.email==='gaexp8213@gmail.com'){
   const rules=await dbSdk.getDoc(dbSdk.doc(db,'route_map_test_shared','frequencyRules'));
   if(rules.exists()){
    if(cloudUser?.uid!==target.uid)throw Error('登入帳戶已變更，移轉已停止');
    plannerResult(await supabasePlannerClient.rpc('planner_write',{operations:[{table:'planner_shared_rules',id:'frequencyRules',data:migrationJson(rules.data())}]}));
    copied++;
   }
  }
  await loadFromCloud(true);migrationStatus.textContent='已移轉 '+copied+' 筆';
 }catch(error){migrationStatus.textContent='移轉未完成（已複製 '+copied+' 筆）：'+(error.message||'連線失敗');}
 finally{migrationBusy=false;migrationButton.disabled=false;}
};