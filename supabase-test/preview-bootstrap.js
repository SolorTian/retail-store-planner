// No browser storage, authenticated session, Worker access, or persistent writes in this frame.
const previewMemory=new Map();
Object.defineProperty(window,'localStorage',{value:{getItem:k=>previewMemory.get(k)??null,setItem:(k,v)=>previewMemory.set(k,String(v)),removeItem:k=>previewMemory.delete(k),clear:()=>previewMemory.clear()}});
Object.defineProperty(window,'sessionStorage',{value:window.localStorage});
const previewDataPromise=new Promise(resolve=>{window.addEventListener('message',function receive(e){if(e.source!==parent||e.data?.kind!=='planner-preview-data')return;window.removeEventListener('message',receive);resolve(e.data);});});
parent.postMessage({kind:'planner-preview-ready'},'*');
