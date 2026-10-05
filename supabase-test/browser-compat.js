// Run before app scripts: older Android Chrome must not fail on newer APIs.
(function(){
 if(typeof window.structuredClone!=='function')window.structuredClone=function(value){return JSON.parse(JSON.stringify(value));};
 if(typeof Promise.withResolvers!=='function')Promise.withResolvers=function(){let resolve,reject;const promise=new this((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout!=='function')AbortSignal.timeout=function(ms){const c=new AbortController();setTimeout(()=>c.abort(new DOMException('Request timed out','TimeoutError')),ms);return c.signal;};
 if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.any!=='function')AbortSignal.any=function(signals){const c=new AbortController(),listeners=[];const abort=signal=>{if(!c.signal.aborted)c.abort(signal.reason);for(const [s,fn] of listeners)s.removeEventListener('abort',fn);};for(const signal of signals){if(signal.aborted){abort(signal);break;}const fn=()=>abort(signal);listeners.push([signal,fn]);signal.addEventListener('abort',fn,{once:true});}return c.signal;};
 window.plannerStartupIssue='';
 try{const key='planner-storage-check';localStorage.setItem(key,'1');localStorage.removeItem(key);}catch{window.plannerStartupIssue='瀏覽器封鎖網站儲存，請允許此網站的 Cookie 與網站資料後重新整理。';}
 function showIssue(){if(!window.plannerStartupIssue)return;let box=document.getElementById('browserIssue');if(!box){box=document.createElement('div');box.id='browserIssue';box.setAttribute('role','alert');box.style.cssText='position:fixed;inset:0;z-index:4000;background:#edf2f5;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px system-ui;color:#17323a';const text=document.createElement('p'),button=document.createElement('button');text.id='browserIssueText';button.textContent='重新整理';button.onclick=()=>location.reload();box.append(text,button);document.body.append(box);}document.getElementById('browserIssueText').textContent=window.plannerStartupIssue;}
 window.addEventListener('error',event=>{if(event.error&&/retail-store-planner|route-map-|cloud-adapter|browser-compat|planner-v19/.test(event.filename||'')){window.plannerStartupIssue='網頁載入失敗：'+String(event.error.message||'請更新 Chrome 後重試').slice(0,180);showIssue();}});
 document.addEventListener('DOMContentLoaded',showIssue);
})();
