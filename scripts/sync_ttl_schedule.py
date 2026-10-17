"""Administrator-approved batch scheduling. Never log credentials, forms or tasks."""
import json,os,re,urllib.request,urllib.error,urllib.parse,calendar
from datetime import datetime,date
from zoneinfo import ZoneInfo
from html.parser import HTMLParser
from cryptography.hazmat.primitives import serialization
from sync_global_daily import decrypt_binding
from test_ttl_export import company_session

class Node:
 def __init__(self,tag='',attrs=(),parent=None):self.tag=tag;self.a=dict(attrs);self.children=[];self.parent=parent
 def all(self,tag=None):
  result=[]
  for child in self.children:
   if isinstance(child,Node):
    if tag is None or child.tag==tag:result.append(child)
    result.extend(child.all(tag))
  return result
 def text(self):return ''.join(c.text() if isinstance(c,Node) else c for c in self.children).strip()
class Tree(HTMLParser):
 def __init__(self,html):super().__init__(convert_charrefs=True);self.root=Node();self.current=self.root;self.feed(html)
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs,self.current);self.current.children.append(n)
  if tag not in ('input','br','hr','img','meta','link','area','base','wbr','source'):self.current=n
 def handle_endtag(self,tag):
  n=self.current
  while n.parent and n.tag!=tag:n=n.parent
  if n.parent:self.current=n.parent
 def handle_data(self,data):self.current.children.append(data)

def own_user(html,account):
 staff=account.split('@')[0]
 if not re.fullmatch(r'\d{4,12}',staff):raise ValueError('Invalid company account')
 m=re.search(r'var\s+user_group\s*=\s*',html)
 if not m:raise ValueError('Employee catalogue unavailable')
 groups=json.JSONDecoder().raw_decode(html[m.end():])[0]
 rows=[u for users in groups.values() for u in users if re.search(r'(?:^|[-－])'+re.escape(staff)+r'$',u.get('user_name',''))]
 if len(rows)!=1 or not str(rows[0]['user_id']).isdigit():raise ValueError('Employee identity ambiguous')
 return rows[0]

def parse_batch(html,period,user):
 tree=Tree(html).root
 forms=[f for f in tree.all('form') if f.a.get('id')=='dataForm' and any(s.a.get('name')=='user_ids[]' for s in f.all('select'))]
 if len(forms)!=1:
  print('Batch form count: '+str(len(tree.all('form')))+'; expected settings forms: '+str(len(forms)),flush=True)
  raise ValueError('Batch form unavailable')
 form=forms[0];selects={s.a.get('name'):s for s in form.all('select')}
 required={'user_ids[]','task_str_time','task_matter_id[]','task_proc_id','task_title'}
 if not required.issubset(selects):raise ValueError('Batch form changed')
 def options(name):return [{'id':o.a.get('value',''),'name':o.text()} for o in selects[name].all('option') if o.a.get('value')]
 people=options('user_ids[]')
 tables=[t for t in tree.all('table') if any(td.a.get('data-val') for td in t.all('td'))]
 if len(tables)!=1:raise ValueError('Batch matrix changed')
 matrix=tables[0]
 if not any(user['user_name'] in row.text() for row in matrix.all('tr') if len([n for n in row.children if isinstance(n,Node) and n.tag=='td'])==1):raise ValueError('Batch employee mismatch')
 customers=[];states={}
 for row in matrix.all('tr'):
  cells=[n for n in row.children if isinstance(n,Node) and n.tag=='td'];days=[c for c in cells if c.a.get('data-val')]
  if not days:continue
  identities={c.a['data-val'].split('-')[0] for c in days}
  if len(identities)!=1 or len(cells)<4:raise ValueError('Batch matrix changed')
  store=identities.pop()
  if not store.isdigit():raise ValueError('Invalid company store')
  existing=[];available=[]
  for cell in days:
   day=int(cell.a.get('data-day','0'));stamp=f'{period}-{day:02d}'
   date.fromisoformat(stamp)
   if cell.a['data-val']!=store+'-'+str(day) or cell.a.get('data-status') not in ('0','1'):raise ValueError('Unknown matrix state')
   states[(store,stamp)]=cell.a['data-status']=='1'
   (existing if states[(store,stamp)] else available).append(stamp)
  customers.append({'id':store,'name':cells[1].text(),'channel':cells[0].text(),'grade':cells[2].text(),'existing':existing,'available':available})
 if not customers or len({s['id'] for s in customers})!=len(customers):raise ValueError('Customer catalogue unavailable')
 hidden=[(n.a['name'],n.a.get('value','')) for n in form.all('input') if n.a.get('type')=='hidden' and n.a.get('name')]
 # Only fresh form CSRF/default fields are retained in memory; never published.
 catalog={'period':period,'employee':{'id':str(user['user_id']),'name':user['user_name']},'customers':customers,'packages':options('task_proc_id'),'custom':options('task_matter_id[]')}
 return catalog,states,hidden

def validate_plan(plan,catalog,states,today):
 if plan.get('time')!='08:00' or plan.get('title')!='常態工作' or plan.get('type') not in ('0','1'):raise ValueError('Invalid task settings')
 if plan['type']=='1' and plan.get('package') not in {p['id'] for p in catalog['packages']}:raise ValueError('Invalid package')
 if plan['type']=='0' and (not isinstance(plan.get('custom'),list) or not plan['custom'] or not set(plan['custom'])<={p['id'] for p in catalog['custom']}):raise ValueError('Invalid custom steps')
 if not isinstance(plan.get('cells'),list) or not 1<=len(plan['cells'])<=300:raise ValueError('Invalid task count')
 selected=[];seen=set();skipped=[]
 for cell in plan['cells']:
  key=(str(cell.get('store','')),cell.get('date',''))
  stamp=date.fromisoformat(key[1])
  if key not in states or key[1][:7]!=catalog['period'] or stamp<today:raise ValueError('Unavailable task date or store')
  if key in seen:continue
  seen.add(key)
  (skipped if states[key] else selected).append(key)
 return selected,skipped

def execute(request,period,user,plan=None,today=None):
 path=f"/ubmsys_task/batch/{user['user_id']}/{period}"
 def read():
  url,body=request(path)
  if '/login' in url:raise ValueError('Company session expired')
  return parse_batch(body.decode('utf-8'),period,user)
 catalog,states,hidden=read()
 if plan is None:return catalog
 selected,skipped=validate_plan(plan,catalog,states,today or datetime.now(ZoneInfo('Asia/Taipei')).date())
 if not selected:return {'verified':True,'created':0,'skipped':len(skipped),'message':'所選日期與店家已有排班，未重複新增。'}
 blocked={'data','user_ids[]','task_str_time','task_type','task_proc_id','task_matter_id[]','task_title'}
 fields=[(k,v) for k,v in hidden if k not in blocked]
 fields.extend([('user_ids[]',str(user['user_id'])),('task_str_time','08:00'),('task_type',plan['type']),('task_title','常態工作'),('data',','.join(store+'-'+str(int(day[-2:])) for store,day in selected)+',')])
 if plan['type']=='1':fields.append(('task_proc_id',plan['package']))
 else:fields.extend(('task_matter_id[]',step) for step in plan['custom'])
 # A write is attempted once. Never repeat POST after a lost/ambiguous response.
 post_error=False
 try:request(path,fields)
 except Exception:post_error=True
 try:
  _,after,_=read();confirmed=[k for k in selected if after.get(k) is True]
 except Exception:confirmed=[]
 verified=len(confirmed)==len(selected)
 return {'verified':verified,'created':len(confirmed),'requested':len(selected),'skipped':len(skipped),'message':'業務王已回讀確認排班。' if verified else '送出結果尚未完整確認，請至業務王核對；系統不會自動重送。','responseInterrupted':post_error}

def rpc(action,job_id,payload=None):
 base=os.environ['SUPABASE_URL'];key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
 if base!='https://kzzyeoehfbvslxfcyayi.supabase.co':raise ValueError('Unexpected database')
 req=urllib.request.Request(base+'/rest/v1/rpc/planner_schedule_worker',data=json.dumps({'action':action,'request_id':job_id,'payload':payload or {}},allow_nan=False).encode(),headers={'apikey':key,**({} if key.startswith('sb_secret_') else {'Authorization':'Bearer '+key}),'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
 except Exception:raise RuntimeError('Schedule database operation failed') from None

def main():
 if os.environ.get('GITHUB_REPOSITORY')!='SolorTian/retail-store-planner' or os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('Trusted workflow required')
 job_id=os.environ['SCHEDULE_REQUEST']
 if not re.fullmatch(r'[0-9a-f-]{36}',job_id):raise ValueError('Invalid request')
 job=rpc('claim',job_id)
 if not job.get('claimed'):print('Request already claimed; no duplicate work.');return
 try:
  key=serialization.load_pem_private_key(os.environ['TTL_CREDENTIAL_PRIVATE_KEY'].encode(),password=None)
  account,password=decrypt_binding(job,key)
  for value in (account,password):print('::add-mask::'+value.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
  request=company_session(account,password);url,body=request('/ubmsys_task/batchlists')
  if '/login' in url:raise ValueError('Company login failed')
  user=own_user(body.decode('utf-8'),account)
  year,month=map(int,job['period'].split('-'))
  query={'page_status':'on','dept_id':str(user['dept_id']),'group_id':str(user['group_id']),'user_id':str(user['user_id']),'start_day':job['period']+'-01','end_day':job['period']+'-'+str(calendar.monthrange(year,month)[1]),'keyword':''}
  request('/ubmsys_task/batchlists?'+urllib.parse.urlencode(query))
  print('Company identity verified; processing approved request.',flush=True)
  result=execute(request,job['period'],user,job['plan'] if job['mode']=='write' else None)
  rpc('finish' if job['mode']=='write' else 'catalog',job_id,result)
  print('Schedule request result stored privately.',flush=True)
 except Exception as error:
  safe={'Batch form unavailable','Batch form changed','Batch employee mismatch','Batch matrix changed','Invalid company store','Unknown matrix state','Customer catalogue unavailable','Company session expired','Company response interrupted','Company temporarily unavailable','Schedule database operation failed'}
  reason=str(error) if str(error) in safe else type(error).__name__
  print('Schedule safe diagnostic: '+reason,flush=True)
  rpc('fail',job_id)
  raise RuntimeError('Schedule request incomplete; inspect private status, never replay an uncertain write.') from None
if __name__=='__main__':main()





