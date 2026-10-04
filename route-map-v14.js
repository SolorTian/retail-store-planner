// Replace both calendar-month snapshots atomically; analyze each month separately.
function workWindow(period){const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);if(!m)throw Error('工作月份格式錯誤');const year=+m[1],month=+m[2],previous=(month===1?year-1:year)+'-'+String(month===1?12:month-1).padStart(2,'0'),last=new Date(Date.UTC(year,month,0)).getUTCDate();return {periods:[previous,period],start:previous+'-01',end:period+'-'+last};}
const applySingleMonthWork=applyCompanyWork;
applyCompanyWork=async function(data){
 validateWorkSnapshot(data);
 if(data.workRangeStart===undefined&&data.workRangeEnd===undefined)return applySingleMonthWork(data);
 const uid=cloudUser?.uid,period=data.year+'-'+String(data.workMonth).padStart(2,'0'),window=workWindow(period);
 if(!uid||workPeriod!==period)throw Error('登入帳號或月份已變更');
 if(data.workRangeStart!==window.start||data.workRangeEnd!==window.end||data.work.policyVersion!==2||!/^[a-f0-9]{32}$/.test(data.requestId))throw Error('工作更新範圍或格式不符，未替換資料');
 const groups=new Map(window.periods.map(p=>[p,[]]));
 for(const r of data.work.items){if(typeof r.signalValue!=='string'&&r.signalValue!==null)throw Error('衛星訊號原值格式錯誤');const source=[r.plannedAt,r.checkInAt,r.completedAt].find(v=>/^\d{4}-(0[1-9]|1[0-2])-\d{2}/.test(String(v||''))),month=source?.slice(0,7);if(!groups.has(month))throw Error('工作紀錄超出更新範圍，未替換資料');groups.get(month).push(r);}
 const collection=name=>firebaseApi.collection(firestore,'route_map_test_users',uid,name),meta=p=>firebaseApi.doc(collection('workSnapshots'),p),chunk=(p,id,i)=>firebaseApi.doc(collection('workRecords'),p+'_'+id+'_'+i);
 const previous=await Promise.all(window.periods.map(p=>firebaseApi.getDoc(meta(p))));
 if(cloudUser?.uid!==uid||workPeriod!==period)throw Error('登入帳號或月份已變更');
 const batch=firebaseApi.writeBatch(firestore),metadata=new Map();
 for(const [p,items] of groups){const chunks=Math.ceil(items.length/250);for(let i=0;i<chunks;i++)batch.set(chunk(p,data.requestId,i),{items:items.slice(i*250,(i+1)*250)});const value={version:1,policyVersion:2,requestId:data.requestId,chunks,count:items.length,columns:data.work.columns,timeBasis:data.work.timeBasis,updatedAt:data.updatedAt,period:p,rangeStart:window.start,rangeEnd:window.end};batch.set(meta(p),value);metadata.set(p,value);}
 await batch.commit();
 if(cloudUser?.uid===uid&&workPeriod===period){workSnapshot={...metadata.get(period),items:groups.get(period)};renderWorkPanel();}
 // Old, now unreferenced chunks are removed separately to stay below the 500-write limit.
 if(cloudUser?.uid===uid){const cleanup=firebaseApi.writeBatch(firestore);let deletes=0;previous.forEach((doc,index)=>{const old=doc.exists()?doc.data():null;if(old&&old.requestId!==data.requestId&&/^[a-f0-9]{32}$/.test(old.requestId)&&Number.isInteger(old.chunks)&&old.chunks>=0&&old.chunks<=200)for(let i=0;i<old.chunks;i++){cleanup.delete(chunk(window.periods[index],old.requestId,i));deletes++;}});if(deletes)await cleanup.commit().catch(()=>{});}
};
const rangeNote=document.createElement('p');rangeNote.id='workRangeNote';rangeNote.className='notice';document.querySelector('#panel-work .work-controls').after(rangeNote);
const renderWorkV14=renderWorkPanel;
renderWorkPanel=function(){renderWorkV14();const w=workWindow(workPeriod);rangeNote.textContent='更新範圍：'+w.periods.join('～')+' · 按月檢視';};
renderWorkPanel();
