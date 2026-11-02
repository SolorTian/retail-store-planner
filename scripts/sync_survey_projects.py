"""Read-only survey reports. Store metadata/URLs only; never download photo bytes."""
import os,json,re,urllib.request,urllib.parse,hashlib
from datetime import date
from sync_ttl_schedule import Tree,Node,own_user
from sync_global_daily import decrypt_binding
from test_ttl_export import company_session
from cryptography.hazmat.primitives import serialization

def photo_url(value):
 p=urllib.parse.urlsplit(value or '')
 return p.scheme=='https' and bool(re.fullmatch(r'cdn-[0-9]+\.unidyna\.com',p.hostname or '')) and p.path.startswith('/ttl/public/uploads/pic/survey/ttl/') and bool(re.search(r'\.(?:png|jpe?g|webp)$',p.path,re.I)) and not p.username and not p.password

def headers(table):
 head=next(iter(table.all('thead')),None)
 if head is None:raise ValueError('Report headers unavailable')
 matrix=[]
 for y,row in enumerate(head.all('tr')):
  while len(matrix)<=y:matrix.append([])
  x=0
  for cell in [c for c in row.children if isinstance(c,Node) and c.tag in ('th','td')]:
   while x<len(matrix[y]) and matrix[y][x] is not None:x+=1
   rs=int(cell.a.get('rowspan','1'));cs=int(cell.a.get('colspan','1'))
   if not 1<=rs<=5 or not 1<=cs<=100:raise ValueError('Report headers changed')
   for yy in range(y,y+rs):
    while len(matrix)<=yy:matrix.append([])
    while len(matrix[yy])<x+cs:matrix[yy].append(None)
    for xx in range(x,x+cs):matrix[yy][xx]=cell.text().strip()
   x+=cs
 width=max(map(len,matrix));out=[]
 for x in range(width):
  parts=[]
  for row in matrix:
   s=row[x] if x<len(row) else ''
   if s and s not in parts:parts.append(s)
  out.append(' / '.join(parts))
 return out

def parse_report(html,survey,account,start,end,codes):
 root=Tree(html).root;tables=[t for t in root.all('table') if t.a.get('id')=='fixTable']
 if len(tables)!=1:raise ValueError('Report table unavailable')
 table=tables[0];labels=headers(table)
 if not {'店家','店家代碼','業務員','打卡時間','回報時間'}.issubset(labels):raise ValueError('Report identity columns changed')
 first=len(labels)
 for i,label in enumerate(labels):
  if ' / ' in label:first=min(first,i)
 # Single-row questionnaire headers are also supported after the photo-control columns.
 if first==len(labels) and '開啟照片' in labels:first=labels.index('開啟照片')+1
 body=next(iter(table.all('tbody')),None)
 body_rows=body.all('tr') if body is not None else [c for c in table.children if isinstance(c,Node) and c.tag=='tr']
 records=[];staff=account.split('@')[0]
 for row in body_rows:
  cells=[c for c in row.children if isinstance(c,Node) and c.tag=='td']
  if len(cells)==1 and int(cells[0].a.get('colspan','1'))>1:continue
  if len(cells)!=len(labels):raise ValueError('Report row shape changed')
  values={label:cells[i].text().strip() for i,label in enumerate(labels)}
  if not re.search(r'(?:^|[-－])'+re.escape(staff)+r'$',values['業務員']):continue
  code=values['店家代碼'];day=(values['打卡時間'] or values.get('月份') or values['回報時間'])[:10]
  if code not in codes or not start<=day<=end:continue
  answers=[]
  for i in range(first,len(cells)):
   cell=cells[i];photos=[];seen=set()
   for a in cell.all('a'):
    href=a.a.get('href','')
    if photo_url(href) and href not in seen:
     seen.add(href);imgs=a.all('img');thumb=(imgs[0].a.get('data-img') or imgs[0].a.get('src')) if imgs else href
     photos.append({'url':href,'thumb':thumb if photo_url(thumb) else href})
   text=cell.text().strip()
   if text or photos:answers.append({'question':labels[i][:500],'text':text[:5000],'photos':photos[:100]})
  preview=next((a.a.get('href','') for a in cells[0].all('a') if re.match(r'^/ubmsys_report_survey/preview/[0-9]+/'+re.escape(survey['id'])+r'(?:\?|$)',a.a.get('href',''))),'')
  record_id=re.search(r'/preview/([0-9]+)/',preview)
  rid=record_id.group(1) if record_id else hashlib.sha256((code+day+json.dumps(answers,ensure_ascii=False)).encode()).hexdigest()[:24]
  records.append({'id':survey['id']+':'+rid,'surveyId':survey['id'],'surveyName':survey['name'],'code':code,'name':values['店家'],'owner':values['業務員'],'day':day,'visitAt':values['打卡時間'],'reportedAt':values['回報時間'],'editedAt':values.get('最後修改時間',''),'answers':answers,'sourceUrl':'https://ttl.unidyna.com'+preview.split('?')[0] if preview else ''})
 pages={1}
 for a in root.all('a'):
  u=urllib.parse.urlsplit(a.a.get('href',''))
  if u.path=='/ubmsys_report_survey/form/'+survey['id']:
   for p in urllib.parse.parse_qs(u.query).get('page',[]):
    if p.isdigit():pages.add(int(p))
 if max(pages)>20:raise ValueError('Report exceeds page limit; narrow the date range')
 return records,pages

def catalogue(html):
 root=Tree(html).root;select=next((s for s in root.all('select') if s.a.get('id')=='survey_name'),None)
 if select is None:raise ValueError('Survey catalogue unavailable')
 rows=[{'id':o.a['value'],'name':o.text()} for o in select.all('option') if re.fullmatch(r'[0-9]{1,10}',o.a.get('value','')) and o.text()]
 if not rows:raise ValueError('Survey catalogue empty')
 return {'surveys':rows}

def rpc(action,job_id,lease=None,payload=None):
 base=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
 if base!='https://kzzyeoehfbvslxfcyayi.supabase.co':raise ValueError('Unexpected database')
 req=urllib.request.Request(base+'/rest/v1/rpc/planner_survey_worker',data=json.dumps({'action':action,'request_id':job_id,'lease':lease,'payload':payload or {}},allow_nan=False).encode(),headers={'apikey':key,**({} if key.startswith('sb_secret_') else {'Authorization':'Bearer '+key}),'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
 except Exception:raise RuntimeError('Private report operation failed') from None

def main():
 if os.environ.get('GITHUB_REPOSITORY')!='SolorTian/retail-store-planner' or os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('Trusted workflow required')
 job_id=os.environ['SURVEY_REQUEST'];job=rpc('claim',job_id)
 if not job.get('claimed'):print('No report work claimed.');return
 try:
  key=serialization.load_pem_private_key(os.environ['TTL_CREDENTIAL_PRIVATE_KEY'].encode(),password=None);account,password=decrypt_binding(job,key)
  for value in (account,password):print('::add-mask::'+value.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
  request=company_session(account,password)
  if job.get('config') is None:
   url,body=request('/ubmsys_report_survey/form/224')
   if '/login' in url:raise ValueError('Company session expired')
   result=catalogue(body.decode('utf-8'))
  else:
   cfg=job['config'];records={};failed=[]
   raw=json.dumps({'request_id':job_id,'lease':job['lease']}).encode();service=os.environ['SUPABASE_SERVICE_ROLE_KEY']
   req=urllib.request.Request(os.environ['SUPABASE_URL']+'/rest/v1/rpc/planner_survey_targets',data=raw,headers={'apikey':service,**({} if service.startswith('sb_secret_') else {'Authorization':'Bearer '+service}),'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=60) as response:bindings=json.load(response)
   selected={s.get('uid') or job['owner'] for s in cfg['stores']}
   available={b['owner'] for b in bindings};failed.extend(sorted(selected-available))
   for binding in bindings:
    try:
     person_account,person_password=decrypt_binding(binding,key)
     for value in (person_account,person_password):print('::add-mask::'+value.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
     session=company_session(person_account,person_password);url,body=session('/ubmsys_task/batchlists');user=own_user(body.decode('utf-8'),person_account)
     codes={s['code'] for s in cfg['stores'] if (s.get('uid') or job['owner'])==binding['owner']}
     person_rows={}
     for survey in cfg['surveys']:
      todo={1};done=set()
      while todo-done:
       page=min(todo-done);query={'page':page,'dept_id':user['dept_id'],'user_id[]':user['user_id'],'filter':'1','sort_mode':'1','daterange':job['start']+' ~ '+job['end'],'survey_name':survey['id']}
       url,body=session('/ubmsys_report_survey/form/'+survey['id']+'?'+urllib.parse.urlencode(query))
       if '/login' in url:raise ValueError('Company session expired')
       rows,pages=parse_report(body.decode('utf-8'),survey,person_account,job['start'],job['end'],codes)
       for row in rows:row['ownerUid']=binding['owner'];person_rows[binding['owner']+':'+row['id']]=row
       if len(person_rows)+len(records)>10000:raise ValueError('Too many survey records')
       done.add(page);todo|=pages
     records.update(person_rows)
    except Exception as error:
     failed.append(binding['owner']);print('One selected visitor report incomplete: '+type(error).__name__,flush=True)
   result={'records':list(records.values()),'complete':not failed,'failedOwners':sorted(set(failed)),'photoStorage':'external_urls_only'}
  rpc('finish',job_id,job['lease'],result);print('Survey report metadata stored privately; no photos copied.')
 except Exception as error:
  safe={'Report table unavailable','Report identity columns changed','Report body unavailable','Report row shape changed','Survey catalogue unavailable','Survey catalogue empty','Company session expired','Report exceeds page limit; narrow the date range'}
  print('Report read incomplete: '+(str(error) if str(error) in safe else type(error).__name__),flush=True)
  rpc('fail',job_id,job['lease']);raise RuntimeError('Report read incomplete; previous result retained') from None
if __name__=='__main__':main()
