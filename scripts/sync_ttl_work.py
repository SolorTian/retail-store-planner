"""Read-only monthly work export; data are encrypted by the sync entry point."""
import io
import re
import urllib.parse
from datetime import datetime, timedelta
from html import unescape
import openpyxl
from test_ttl_export import company_session

FIELDS = {
 'id':['工作ID','工作 ID'], 'code':['店家代碼','客戶代碼'], 'name':['店家名稱','客戶名稱'],
 'owner':['業務員','執行人員'], 'channel':['店家型態','通路別'], 'grade':['客戶階級','階級'],
 'plannedAt':['工作可執行期間'], 'createdAt':['建立時間'], 'checkInAt':['打卡時間','到站時間'],
 'completedAt':['工作完成日期'], 'checkOutAt':['離站時間','退卡時間'],
 'status':['任務狀態'], 'readStatus':['APP讀取狀態'], 'subject':['工作主題'], 'note':['備註'],
 'signalAbnormal':['是否衛星訊號異常','衛星訊號異常'], 'deviceFlag':['是否刷機'],
 'offsetAbnormal':['是否打卡偏移','是否偏移','打卡偏移'],
 'checkInLat':['打卡緯度','到站緯度'], 'checkInLng':['打卡經度','到站經度'],
 'checkOutLat':['離站緯度','退卡緯度'], 'checkOutLng':['離站經度','退卡經度'],
 'toleranceMeters':['容許範圍(公尺)','容許範圍（公尺）','容許距離(公尺)']
}
FLAGS={'signalAbnormal','deviceFlag','offsetAbnormal'}
NUMBERS={'checkInLat','checkInLng','checkOutLat','checkOutLng','toleranceMeters'}
def flag(value):
 text=str(value if value is not None else '').strip()
 if text in ('是','異常','1','True','true','Y','YES'): return True
 if text in ('否','正常','0','False','false','N','NO'): return False
 return None

def parse_work(data):
 workbook=openpyxl.load_workbook(io.BytesIO(data),read_only=True,data_only=True)
 try:
  rows=iter(workbook.active.iter_rows(values_only=True)); header=None
  for _ in range(10):
   row=next(rows,None)
   if row is None: break
   if any(str(x or '').strip() in FIELDS['id'] for x in row):header=[str(x or '').strip() for x in row];break
  if header is None:raise ValueError('Invalid work header')
  ix={k:next((header.index(n) for n in names if n in header),None) for k,names in FIELDS.items()}
  if any(ix[k] is None for k in ['id','code','checkInAt','completedAt','owner']):raise ValueError('Missing work columns')
  items={}
  for row in rows:
   if len(row)<=ix['id'] or not row[ix['id']]:continue
   item={}
   for k,i in ix.items():
    value=row[i] if i is not None and i<len(row) else None
    if k in FLAGS:item[k]=flag(value)
    elif k in NUMBERS:
     try:item[k]=float(value) if value not in (None,'') else None
     except (ValueError,TypeError):item[k]=None
    else:item[k]=value.strftime('%Y-%m-%d %H:%M:%S') if isinstance(value,datetime) else str(value or '').strip()[:2000 if k=='note' else 300]
   if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',item['id']):raise ValueError('Invalid work ID')
   items[item['id']]=item
   if len(items)>50000:raise ValueError('Work report too large')
  return {'items':list(items.values()),'columns':[k for k,i in ix.items() if i is not None], 'timeBasis':'checkOutAt' if ix['checkOutAt'] is not None else 'completedAt'}
 finally:workbook.close()

def download_work(account,password,year,month):
 start=datetime(year,month,1);end=(start.replace(day=28)+timedelta(days=4)).replace(day=1)-timedelta(days=1)
 dates=start.strftime('%Y-%m-%d')+' ~ '+end.strftime('%Y-%m-%d')
 request=company_session(account,password)
 path='/ubmsys_task/lists?'+urllib.parse.urlencode({'period':'0','interval_type':'0','task_daterange':dates})
 url,body=request(path);page=body.decode('utf-8')
 if '/login' in url or 'id="user_pwd"' in page:raise ValueError('Company login failed')
 links=[urllib.parse.urljoin(url,unescape(x)) for x in re.findall(r'href=["\']([^"\']+)["\']',page)]
 link=next((x for x in links if urllib.parse.urlsplit(x).path=='/ubmsys_task/lists' and urllib.parse.parse_qs(urllib.parse.urlsplit(x).query).get('taskExport')==['3']),None)
 if not link:raise ValueError('Work export unavailable')
 split=urllib.parse.urlsplit(link);query=urllib.parse.parse_qs(split.query,keep_blank_values=True)
 query['task_daterange']=[dates];query['period']=['0'];query['interval_type']=['0']
 _,data=request(urllib.parse.urlunsplit((split.scheme,split.netloc,split.path,urllib.parse.urlencode(query,doseq=True),'')))
 if not data.startswith(b'PK'):raise ValueError('Work export not XLSX')
 return data
