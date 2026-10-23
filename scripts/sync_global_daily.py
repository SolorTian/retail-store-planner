"""Trusted, user-triggered daily exports. No plaintext artifacts or credential logging."""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timezone
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from test_ttl_export import download_report
from sync_ttl_visits import parse_items
from sync_ttl_customers import download_customers, parse_customers
from sync_ttl_work import download_work, parse_work, work_range
from sync_ttl_fuel import download_fuel, parse_fuel
from sync_ttl_offsets import download_offsets, parse_offsets

def rpc(action, day, **params):
    url = os.environ['SUPABASE_URL'].rstrip('/')
    if url != 'https://kzzyeoehfbvslxfcyayi.supabase.co':
        raise ValueError('Unexpected database')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url + '/rest/v1/rpc/planner_daily_worker',
        data=json.dumps({'action': action, 'batch_day': day, **params}, allow_nan=False).encode(),
        headers={'apikey': key, **({} if key.startswith('sb_secret_') else {'Authorization': 'Bearer ' + key}), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except (urllib.error.HTTPError, urllib.error.URLError) as error:
        # The response/request may contain credentials or records; never log it.
        raise RuntimeError('Daily database operation failed') from None

def decrypt_binding(job, private_key):
    blob = json.loads(job['envelope'])
    decode = lambda value: base64.b64decode(value, validate=True)
    secret = private_key.decrypt(decode(blob['wrappedKey']), padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    value = json.loads(AESGCM(secret).decrypt(decode(blob['iv']), decode(blob['ciphertext']),
        ('ttl-credential:' + job['owner']).encode()))
    if value.get('version') != 1 or value.get('uid') != job['owner']:
        raise ValueError('Binding owner mismatch')
    account, password = value['account'], value['password']
    if account != job['accountLabel'] or not password or any(c in account + password for c in '\r\n'):
        raise ValueError('Binding account mismatch')
    return account, password

def seal_binding(owner,account,password,private_key):
    key=AESGCM.generate_key(bit_length=256)
    iv=os.urandom(12)
    encode=lambda value:base64.b64encode(value).decode()
    plain=json.dumps({'version':1,'uid':owner,'account':account,'password':password}).encode()
    return json.dumps({'version':1,'iv':encode(iv),
        'wrappedKey':encode(private_key.public_key().encrypt(key,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))),
        'ciphertext':encode(AESGCM(key).encrypt(iv,plain,('ttl-credential:'+owner).encode()))})

def document(bucket, key, data):
    return {'bucket': bucket, 'id': key, 'data': data}

def code_id(value):
    return urllib.parse.quote(value, safe="~!*'()-._")

def prepare_documents(day, account, customers, visits, work, fuels, offsets, source_at=None, request_id=None):
    """Use the existing cloud document format, preserving private drafts in the SQL merge."""
    anchor = date.fromisoformat(day)
    source_at = source_at or datetime.now(timezone.utc).isoformat()
    request_id = request_id or uuid.uuid4().hex
    if not re.fullmatch(r'[a-f0-9]{32}', request_id):
        raise ValueError('Invalid request ID')
    if not customers or not visits or len(customers)>100000 or len(visits)>100000:
        raise ValueError('Incomplete company export')
    docs, codes = [], set()
    for row in customers:
        if row['code'] in codes:
            raise ValueError('Duplicate customer')
        codes.add(row['code'])
        if '結束營業' in re.sub(r'\s+', '', row.get('status', '')):
            continue
        docs.append(document('customers', code_id(row['code']), {
            **row, 'source': 'company', 'companyCurrent': True,
            'gpsSource': 'company' if row.get('gps') else 'missing', 'updatedAt': source_at}))
    active_codes = [d['data']['code'] for d in docs]
    owners = sorted({d['data'].get('owner', '') for d in docs if d['data'].get('owner')})
    docs.append(document('settings','customerMaster',{'version':1,'codes':active_codes,
        'preferredOwner':owners[0] if len(owners)==1 else '', 'exportedAt':source_at}))
    seen = set()
    for row in visits:
        if row['code'] in seen or len(row['visits'])!=12 or any(type(v) is not int or not 0<=v<=100000 for v in row['visits']):
            raise ValueError('Invalid visits')
        seen.add(row['code'])
        if '結束營業' in re.sub(r'\s+', '', row.get('status', '')):
            continue
        docs.append(document('visits',str(anchor.year)+'_'+code_id(row['code']),{
            **row,'year':anchor.year,'updatedAt':source_at}))
    start, end = work_range(anchor.year, anchor.month)
    periods = [start.strftime('%Y-%m'),anchor.strftime('%Y-%m')]
    groups = {period:[] for period in periods}
    if work.get('policyVersion')!=2 or len(work['items'])>50000:
        raise ValueError('Invalid work export')
    seen = set()
    for row in work['items']:
        if row['id'] in seen:
            raise ValueError('Duplicate work ID')
        seen.add(row['id'])
        stamp = next((row.get(k,'') for k in ('plannedAt','checkInAt','completedAt')
            if re.match(r'^\d{4}-(0[1-9]|1[0-2])-\d{2}', row.get(k,'') or '')), '')
        if stamp[:7] not in groups:
            raise ValueError('Work outside requested range')
        groups[stamp[:7]].append(row)
    for period, rows in groups.items():
        chunks = (len(rows)+249)//250
        for index in range(chunks):
            docs.append(document('workRecords',f'{period}_{request_id}_{index}',{'items':rows[index*250:(index+1)*250]}))
        docs.append(document('workSnapshots',period,{'version':1,'policyVersion':2,'requestId':request_id,
            'chunks':chunks,'count':len(rows),'columns':work['columns'],'timeBasis':work['timeBasis'],
            'updatedAt':source_at,'period':period,'rangeStart':start.strftime('%Y-%m-%d'),'rangeEnd':end.strftime('%Y-%m-%d')}))
    for period in periods:
        report = fuels[period]
        if report.get('period')!=period or not report.get('owner','').endswith('-'+account.split('@')[0]):
            raise ValueError('Fuel owner mismatch')
        docs.append(document('settings','fuel_'+period,{'version':1,'account':account,
            'report':{**report,'sourceAt':source_at},'fetchedDay':day,'finalized':period!=periods[-1]}))
    if offsets.get('version')!=1 or offsets.get('thresholdMeters')!=400:
        raise ValueError('Invalid offsets')
    staff = account.split('@')[0]
    first, last = date.fromisoformat(offsets['start']),date.fromisoformat(offsets['end'])
    index = first.year*12+first.month-1
    while index<=last.year*12+last.month-1:
        year, zero = divmod(index,12)
        period = f'{year:04d}-{zero+1:02d}'
        items = [r for r in offsets['items'] if r['day'][:7]==period and r.get('owner','').endswith('-'+staff)]
        docs.append(document('work','offsets_'+period,{'version':1,'period':period,'sourceAt':source_at,
            'staff':staff,'owner':items[0]['owner'] if items else next((o for o in owners if o.endswith('-'+staff)),account),
            'rangeStart':offsets['start'],'rangeEnd':offsets['end'],'freshStart':offsets['start'],'freshEnd':offsets['end'],
            'thresholdMeters':400,'monthlyLimit':10,'items':items}))
        index += 1
    docs.append(document('settings','syncReceipt',{
        'customers':{'sourceAt':source_at,'count':len(active_codes)},
        'visits':{'sourceAt':source_at,'count':len(visits)},
        'work':{'sourceAt':source_at,'count':len(work['items'])}}))
    json.dumps(docs, allow_nan=False)  # Reject NaN and Infinity before any publication.
    return docs

class ExportStageFailure(Exception):
    def __init__(self, stage, kind):
        self.stage, self.kind = stage, kind

def export_stage(stage, operation):
    print('Daily export stage: '+stage,flush=True)
    try:
        return operation()
    except Exception as error:
        # Never include exception messages, requests, credentials or report data.
        kind = type(error).__name__
        if kind not in ('ValueError','TypeError','KeyError','RuntimeError','HTTPError','URLError','TimeoutError'):
            kind = 'ExportError'
        safe_reason = {'Company login failed':'login_rejected','Customer export link unavailable':'export_link_missing','Customer export is not an XLSX workbook':'not_xlsx','Customer name missing':'customer_name_missing','Conflicting duplicate customer code':'duplicate_customer','Empty customer roster':'empty_roster','Company temporarily unavailable':'company_unavailable','Company response interrupted':'response_interrupted','Company login response interrupted':'login_interrupted'}.get(str(error))
        if safe_reason:
            kind += ':' + safe_reason
        raise ExportStageFailure(stage, kind) from None

def export_job(job, private_key):
    account, password = export_stage('binding',lambda:decrypt_binding(job, private_key))
    # Defence in depth if a downstream library ever includes credentials in an error.
    for value in (account,password):
        print('::add-mask::'+value.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
    anchor = date.fromisoformat(job['day'])
    # Google linking does not change the company's multi-owner export scope.
    # Use the verified company identity for regular and pending profiles alike.
    staff = account.split('@',1)[0] if re.fullmatch(r'[0-9]{4,12}@ttl\.com',account,re.I) else None
    if job.get('kind')=='pending_google' and staff is None:
        raise ValueError('Invalid pending company account')
    customers = export_stage('customers',lambda:parse_customers(download_customers(account,password),owner_staff=staff))
    visits = export_stage('visits',lambda:parse_items(download_report(account,password,anchor.year)))
    if staff is not None:
        owned_codes={row['code'] for row in customers}
        visits=[row for row in visits if row['code'] in owned_codes]
    work = export_stage('work',lambda:parse_work(download_work(account,password,anchor.year,anchor.month,owner_staff=staff)))
    if staff is not None:
        work={**work,'items':[row for row in work['items'] if re.search(r'(?:^|[-－])'+re.escape(staff)+r'$',str(row.get('owner','')).strip())]}
    start, _ = work_range(anchor.year,anchor.month)
    fuels = {}
    for year, month in [(start.year,start.month),(anchor.year,anchor.month)]:
        fuels[f'{year:04d}-{month:02d}'] = export_stage('fuel',lambda:parse_fuel(download_fuel(account,password,year,month),account,year,month))
    offsets = export_stage('offsets',lambda:parse_offsets(download_offsets(account,password,anchor.year,anchor.month),anchor.year,anchor.month))
    docs=export_stage('snapshot',lambda:prepare_documents(job['day'],account,customers,visits,work,fuels,offsets))
    if job.get('kind')=='pending_google' and job.get('linkedTo'):
        return {'documents':docs,'credential':seal_binding(job['linkedTo'],account,password,private_key)}
    return docs

def main():
    if os.environ.get('GITHUB_REPOSITORY')!='SolorTian/retail-store-planner' or os.environ.get('GITHUB_REF')!='refs/heads/main':
        raise ValueError('Trusted main workflow required')
    day = date.fromisoformat(os.environ['BATCH_DAY']).isoformat()
    private_key = serialization.load_pem_private_key(os.environ['TTL_CREDENTIAL_PRIVATE_KEY'].encode(),password=None)
    deadline = time.monotonic()+150*60
    while time.monotonic()<deadline:
        state = rpc('claim',day)
        job = state.get('job')
        if not job:
            if state['status']=='pending':
                time.sleep(60)
                continue
            print('Daily batch status: '+state['status'])
            return 0 if state['status'] in ('done','no_eligible_accounts') else 1
        try:
            docs = export_job(job,private_key)
            export_stage('database_publish',lambda:rpc('publish',day,target=job['owner'],lease=job['lease'],payload=docs))
            print('Daily account snapshot committed.')
        except Exception as error:
            if isinstance(error,ExportStageFailure):
                print('Daily export stage failed: '+error.stage+' ('+error.kind+').',flush=True)
            # Failure remains visible in persistent job status; never claim completion.
            try:
                rpc('fail',day,target=job['owner'],lease=job['lease'])
            except Exception:
                pass  # A committed/expired/reassigned job must not be changed by an old worker.
            print('Daily account update incomplete; retry policy applies.')
    print('Daily batch incomplete: execution time limit reached.')
    return 1

if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Daily batch could not run. Check server configuration and saved job status.')
        raise SystemExit(1)