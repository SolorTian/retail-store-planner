(function(root){
function parse(text,period){
 if(typeof text!=='string'||text.length>200000)throw Error('請貼上遠通「通行費紀錄」表格，內容上限 20 萬字。');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('請先選擇油料月份。');
 const lines=text.replace(/\r/g,'').split('\n'),blocks=[];let current=null;
 for(const line of lines){if(/^\s*\d{4}[\/-]\d{1,2}[\/-]\d{1,2}(?:\s|$)/.test(line)){current=line;blocks.push(current);}else if(blocks.length){blocks[blocks.length-1]+=' '+line;}}
 const rows=[],seen=new Set();for(const block of blocks){const m=block.match(/^\s*(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s+([\d,]+(?:\.\d+)?)\s*(?:公里)?\s+([\d,]+(?:\.\d+)?)\s*元?\s+([\s\S]*)$/);if(!m)continue;
 const day=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),d=new Date(day+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)throw Error('遠通日期格式不正確。');
 const amount=Number(m[5].replace(/,/g,''));if(!Number.isFinite(amount)||amount<0||amount>100000||Math.round(amount*100)!==amount*100)throw Error(day+' 通行費格式不正確。');
 if(seen.has(day))throw Error(day+' 出現重複日期，請只複製每日合計表格，不要包含展開的門架明細。');seen.add(day);
 const status=m[6].replace(/\s+/g,' '),paid=/已扣款/.test(status)&&!/未出帳|未扣款/.test(status),free=/本日無通行費產生/.test(status);
 if(!paid&&!free&&!/未出帳通行費/.test(status))throw Error(day+' 無法辨識付款狀態，請連同「狀態」欄一起複製。');
 rows.push({day,amount,paid,status,periodMatch:day.slice(0,7)===period});}
 if(!rows.length)throw Error('未辨識到紀錄。請從遠通的「通行日期、里程、通行費、狀態」整張表格複製貼上。');return rows;
}
function match(rows,items,vehicles,edits){const byDay=new Map(items.map(x=>[x.date,x]));return rows.map(r=>{const item=byDay.get(r.day),old=Number(edits[r.day]?.etag||0);let reason='';if(!r.periodMatch)reason='不屬於目前油料月份';else if(!item)reason='當日沒有工作油料紀錄';else if(vehicles[r.day]!=='car')reason='當日不是自用汽車';else if(r.amount===0)reason='本日費用為 0';else if(old===r.amount)reason='已填入相同金額';else if(old!==0)reason='已有手填金額 '+old+' 元，保留原值';return {...r,old,eligible:!reason,reason};});}
root.Fetc66={parse,match};if(typeof module!=='undefined')module.exports=root.Fetc66;
})(typeof window!=='undefined'?window:globalThis);
