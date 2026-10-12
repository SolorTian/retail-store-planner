"""Official check-in error distances. Retain planning evidence only, no addresses."""
import io,re,urllib.parse,hashlib
from html import unescape
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import openpyxl
from test_ttl_export import company_session
def offset_range(today=None):
 end=today or datetime.now(ZoneInfo('Asia/Taipei')).date()
 index=end.year*12+end.month-1-2;year,zero=divmod(index,12);month=zero+1
 last=((datetime(year,month,28)+timedelta(days=4)).replace(day=1)-timedelta(days=1)).day
 return end.replace(year=year,month=month,day=min(end.day,last)),end

def download_offsets(account,password,year,month):
 start,end=offset_range();dates=start.strftime('%Y-%m-%d')+' ~ '+end.strftime('%Y-%m-%d')
 request=company_session(account,password)
 query={'date_daterange':dates,'str_date':start.strftime('%Y-%m-%d'),'end_date':end.strftime('%Y-%m-%d'),'filter':'2'}
 url,body=request('/ubmsys_checkin_error/lists?'+urllib.parse.urlencode(query))
 if '/login' in url:raise ValueError('Company login failed')
 html=body.decode('utf-8');dept=re.search(r'<select\b[^>]*\bid=["\']dept_id["\'][^>]*>(.*?)</select>',html,re.S)
 if dept:
  allowed=[x for x in re.findall(r'<option[^>]*value=["\'](\d+)["\']',dept[1]) if x!='0']
  if len(set(allowed))==1:query['dept_id']=allowed[0]
 links=[unescape(x) for x in re.findall(r'href=["\']([^"\']+)',html)]
 link=next((x for x in links if urllib.parse.urlsplit(x).path=='/ubmsys_checkin_error/lists/1'),None)
 if not link:raise ValueError('Offset export unavailable')
 split=urllib.parse.urlsplit(link);params=urllib.parse.parse_qs(split.query,keep_blank_values=True)
 for k,v in query.items():params[k]=[v]
 _,data=request(urllib.parse.urlunsplit((split.scheme,split.netloc,split.path,urllib.parse.urlencode(params,doseq=True),'')))
 if not data.startswith(b'PK'):raise ValueError('Offset export not XLSX')
 return data

def parse_offsets(data,year,month):
 start,end=offset_range();start=start.strftime('%Y-%m-%d');end=end.strftime('%Y-%m-%d')
 w=openpyxl.load_workbook(io.BytesIO(data),read_only=True,data_only=True)
 try:
  rows=iter(w.active.iter_rows(values_only=True));header=[str(v or '').strip() for v in next(rows)]
  required=['日期','類型','打卡時間','店家型態','店家','執行人員','錯誤距離']
  if any(x not in header for x in required):raise ValueError('Invalid offset columns')
  ix={x:header.index(x) for x in required};items={}
  for row in rows:
   get=lambda k:row[ix[k]] if ix[k]<len(row) else None
   raw=get('日期');day=raw.strftime('%Y-%m-%d') if isinstance(raw,datetime) else str(raw or '').strip()
   if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day) or not start<=day<=end:continue
   distance=str(get('錯誤距離') or '').strip().replace(',','');m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(公里|公尺|km|m)',distance,re.I)
   if not m:raise ValueError('Invalid offset distance')
   meters=round(float(m[1])*(1000 if m[2].lower() in ('公里','km') else 1),3)
   if meters<=400:continue
   item={'day':day,'type':str(get('類型') or '').strip(),'time':str(get('打卡時間') or '').strip(),'channel':str(get('店家型態') or '').strip(),'name':str(get('店家') or '').strip(),'owner':str(get('執行人員') or '').strip(),'meters':meters}
   if item['type'] not in ('到站打卡','離站打卡') or not re.fullmatch(r'\d{2}:\d{2}:\d{2}',item['time']):raise ValueError('Invalid offset evidence')
   item['id']=hashlib.sha256('|'.join(str(item[k]) for k in ['day','type','time','name','owner']).encode()).hexdigest()[:32]
   if item['id'] in items and items[item['id']]!=item:raise ValueError('Conflicting offset evidence')
   items[item['id']]=item
   if len(items)>100000:raise ValueError('Offset report too large')
  return {'version':1,'start':start,'end':end,'thresholdMeters':400,'monthlyLimit':10,'items':list(items.values())}
 finally:w.close()
