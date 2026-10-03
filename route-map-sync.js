// Google-authenticated dispatch through a private-secret Worker. Decryption stays in page memory.
const VISIT_REPO='SolorTian/retail-store-planner',VISIT_WORKFLOW='ttl-visit-sync.yml';
const VISIT_BACKEND='https://retail-store-planner-sync.gaexp8213.workers.dev';
let visitSyncBusy=false,visitSyncAbort=null;
function syncBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function syncBase64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)))}
function setSyncStatus(message){document.getElementById('visitSyncStatus').textContent=message}
async function visitGithubApi(path,options={}) {
  if (!cloudUser) throw Error('請先 Google 登入，再更新公司資料。');
  const uid=cloudUser.uid;
  const idToken=await cloudUser.getIdToken();
  if(cloudUser?.uid!==uid)throw Error('登入帳號已變更，請重新更新。');
  const response=await fetch(VISIT_BACKEND+'/github?path='+encodeURIComponent(path), {
    ...options,cache:'no-store',signal:options.signal||visitSyncAbort?.signal,
    headers:{Authorization:'Bearer '+idToken,...(options.body?{'Content-Type':'application/json'}:{})}
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){const e=Error(data?.error||(response.status===401?'請重新 Google 登入。':'更新服務暫時無法使用，舊資料仍保留。'));e.status=response.status;throw e}
  return data;
}
function cancelVisitSync(){visitSyncAbort?.abort();setSyncStatus('已停止等待；舊資料仍保留，GitHub 工作可能繼續完成。')}
function visitPause(ms,signal){return new Promise((resolve,reject)=>{const stopped=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'))},timer=setTimeout(()=>{signal.removeEventListener('abort',stopped);resolve()},ms);if(signal.aborted)return stopped();signal.addEventListener('abort',stopped,{once:true})})}
async function decryptVisitResult(envelope,key,requestId,year,runId,dataset='visits'){if(envelope.version!==1||envelope.requestId!==requestId||envelope.year!==year||(runId&&String(envelope.runId)!==String(runId)))throw Error('更新結果識別不符，未替換訪況。');const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,syncBytes(envelope.wrappedKey)),aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:syncBytes(envelope.iv),additionalData:new TextEncoder().encode('visit-sync:'+requestId+':'+year)},aes,syncBytes(envelope.ciphertext)),data=JSON.parse(new TextDecoder().decode(plain));if(data.version!==1||data.requestId!==requestId||data.year!==year||!Array.isArray(data.items)||(dataset!=='customers'&&!data.items.length)||data.items.length>100000)throw Error('更新結果格式不符，未替換訪況。');if((data.dataset||'visits')!==dataset)throw Error('更新資料種類不符，未替換資料。');if(dataset!=='visits'){if(data.customerSnapshot!==true)throw Error('不是完整客戶名冊，未替換資料。');validateCompanyCustomers(data.customers)}let seen=new Set;for(const x of data.items){if(typeof x.code!=='string'||!x.code||seen.has(x.code)||!Array.isArray(x.visits)||x.visits.length!==12||x.visits.some(v=>!Number.isSafeInteger(v)||v<0||v>100000))throw Error('報表店家或訪次格式不符，未替換訪況。');seen.add(x.code)}return data}
function applyCompanyVisits(data){const items=data.items.map(x=>({code:x.code,name:String(x.name||''),type:String(x.type||''),channel:String(x.channel||''),grade:String(x.grade||''),status:String(x.status||''),visits:[...x.visits],year:data.year}));let byKey=new Map(excel.map(x=>[(x.year||reportYear)+'_'+x.code,x]));for(const x of items){byKey.set(data.year+'_'+x.code,{...byKey.get(data.year+'_'+x.code),...x});pendingVisits.add(x.code)}excel=[...byKey.values()];dirty();render();return items.length}
async function updateCompanyVisits(dataset='visits') {
  if (!['visits','customers','all'].includes(dataset) || visitSyncBusy || cloudBusy) return;
  if (location.protocol === 'file:') return toast('請使用線上測試版更新公司資料');
  if (!cloudUser) { toast('登入 Google 後即可直接更新，不需要 GitHub 授權碼'); await loginCloud(); return; }
  const year = reportYear, uid = cloudUser?.uid || null;
  const label = dataset === 'visits' ? year+' 年訪況' : dataset === 'customers' ? '客戶名冊與座標' : '客戶名冊、座標與 '+year+' 年訪況';
  let applied = false;
  visitSyncBusy = true;
  visitSyncAbort = new AbortController();
  const signal = visitSyncAbort.signal;
  document.querySelectorAll('.visitSyncBtn').forEach(b => b.disabled = true);
  document.getElementById('visitSyncCancel').classList.remove('hide');
  document.getElementById('reportYear').disabled = true;
  document.getElementById('customerFile').disabled = true;
  try {
    setSyncStatus('建立安全更新連線…');
    const requestId = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2,'0')).join('');
    const keys = await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'}, false, ['encrypt','decrypt']);
    const publicKey = syncBase64(await crypto.subtle.exportKey('spki',keys.publicKey));
    const created = await visitGithubApi('/actions/workflows/'+VISIT_WORKFLOW+'/dispatches', {method:'POST',body:JSON.stringify({ref:'main',inputs:{year:String(year),request_id:requestId,public_key:publicKey,dataset}})});
    let runId = created?.workflow_run_id || null, finished = false;
    setSyncStatus('GitHub 正在登入公司並取得'+label+'，通常需要約 1 分鐘…');
    const deadline = Date.now()+8*60*1000;
    while (Date.now()<deadline) {
      await visitPause(5000,signal);
      if (!runId) {
        const runs = await visitGithubApi('/actions/workflows/'+VISIT_WORKFLOW+'/runs?event=workflow_dispatch&per_page=30');
        runId = runs.workflow_runs?.find(x => x.display_title === 'visit-sync-'+requestId)?.id;
        if (!runId) continue;
      }
      const run = await visitGithubApi('/actions/runs/'+runId);
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw Error('GitHub 更新未完成（'+run.conclusion+'），舊資料仍保留。');
        finished = true; break;
      }
    }
    if (!finished) throw Error('更新等待逾時，舊資料仍保留；稍後可重試。');
    setSyncStatus('正在安全接收並驗證最新資料…');
    const resultResponse = await fetch('https://api.github.com/repos/'+VISIT_REPO+'/contents/visit-sync-results/'+requestId+'.json?ref=visit-sync-results', {signal,cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
    if (!resultResponse.ok) throw Error('無法取得更新結果，舊資料仍保留。');
    const result = await resultResponse.json();
    if (!result.content) throw Error('更新結果不存在，舊資料仍保留。');
    const data = await decryptVisitResult(JSON.parse(new TextDecoder().decode(syncBytes(result.content.replace(/\s/g,'')))), keys.privateKey,requestId,year,runId,dataset);
    if ((cloudUser?.uid||null)!==uid || reportYear!==year || cloudBusy) throw Error('帳號、年度或雲端操作已變更，請在目前畫面重新更新。');
    // Both datasets were validated before either is applied.
    const customers = dataset !== 'visits' ? applyCompanyCustomers(data) : null;
    const count = dataset !== 'customers' ? applyCompanyVisits(data) : 0;
    applied = true;
    const summary = (customers ? customers.count+' 間客戶與座標' : '') + (customers && count ? '、' : '') + (count ? count+' 間拜訪紀錄' : '');
    if (cloudUser) {
      setSyncStatus('已更新'+summary+'，正在儲存到個人雲端…');
      await saveToCloud();
      setSyncStatus('已更新'+summary+(localDirty ? '；雲端尚未完成，資料已保留本機，請查看同步提示。' : '，已自動儲存，手機登入後即可使用。'));
    } else setSyncStatus('已更新'+summary+'，已保留本機草稿；登入 Google 後可複製草稿並自動同步。');
    toast('公司'+label+'已更新');
  } catch (e) {
    if (e.name !== 'AbortError') setSyncStatus(applied ? '資料已更新並保留本機；雲端儲存未完成。' : e.message || '更新失敗，舊資料仍保留。');
  } finally {
    visitSyncBusy = false; visitSyncAbort = null;
    document.querySelectorAll('.visitSyncBtn').forEach(b => b.disabled = false);
    document.getElementById('visitSyncCancel').classList.add('hide');
    document.getElementById('reportYear').disabled = false;
    document.getElementById('customerFile').disabled = false;
  }
}