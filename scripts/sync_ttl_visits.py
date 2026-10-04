"""Export visits in memory; publish only browser-key-encrypted results."""
import base64
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
import openpyxl
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from test_ttl_export import download_report
from sync_ttl_customers import download_customers, parse_customers
from sync_ttl_work import download_work, parse_work

REPO = 'SolorTian/retail-store-planner'
RESULT_BRANCH = 'visit-sync-results'

def parse_items(data):
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        rows = list(workbook.active.iter_rows(values_only=True))
        h = next(i for i, row in enumerate(rows[:10]) if '店家代碼' in row)
        header, sub = rows[h], rows[h + 1]
        actual = [i for i, x in enumerate(sub) if str(x or '').strip() == '實訪'][:12]
        if len(actual) != 12:
            raise ValueError('Invalid monthly columns')
        fields = {'code': ['店家代碼'], 'name': ['店家名稱'], 'type': ['店家型態名稱', '店家型態'],
                  'channel': ['通路別'], 'status': ['營業狀態', '狀態'], 'grade': ['店家階級', '階級']}
        indices = {k: next((header.index(n) for n in names if n in header), None) for k, names in fields.items()}
        if indices['code'] is None or indices['name'] is None:
            raise ValueError('Invalid store columns')
        by_code = {}
        for row in rows[h + 2:]:
            item = {k: str(row[i] or '').strip() if i is not None else '' for k, i in indices.items()}
            if len(row) > 4 and '結束營業' in re.sub(r'\s+', '', str(row[4] or '')):
                item['status'] = '結束營業'
            if not item['code']:
                continue
            item['visits'] = [int(row[i] or 0) for i in actual]
            if any(v < 0 or v > 100000 for v in item['visits']):
                raise ValueError('Invalid visit count')
            by_code[item['code']] = item
        if not by_code:
            raise ValueError('Empty report')
        return list(by_code.values())
    finally:
        workbook.close()

def encrypt_result(items, year, request_id, public_key, run_id, dataset='visits', customers=None, account=None, work=None, month=None):
    if not re.fullmatch(r'[a-f0-9]{32}', request_id):
        raise ValueError('Invalid request ID')
    key = serialization.load_der_public_key(base64.b64decode(public_key, validate=True))
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 2048 or key.key_size > 4096:
        raise ValueError('Invalid public key')
    aad = f'visit-sync:{request_id}:{year}'.encode()
    payload = {'version': 1, 'year': year, 'requestId': request_id, 'dataset': dataset,
               'updatedAt': datetime.now(timezone.utc).isoformat(), 'items': items}
    if customers is not None:
        payload['customers'] = customers
        payload['customerSnapshot'] = True
    if work is not None:
        payload['work'] = work
        payload['workSnapshot'] = True
        payload['workMonth'] = month
    if account is not None:
        payload['accountLabel'] = account
    data = json.dumps(payload, ensure_ascii=False).encode()
    secret = AESGCM.generate_key(bit_length=256)
    iv = os.urandom(12)
    cipher = AESGCM(secret).encrypt(iv, data, aad)
    wrapped = key.encrypt(secret, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    b64 = lambda x: base64.b64encode(x).decode()
    return {'version': 1, 'requestId': request_id, 'year': year, 'runId': str(run_id),
            'iv': b64(iv), 'wrappedKey': b64(wrapped), 'ciphertext': b64(cipher)}

def publish_result(result):
    token = os.environ['GITHUB_TOKEN']
    if os.environ.get('GITHUB_REPOSITORY') != REPO:
        raise ValueError('Unexpected repository')
    def api(path, data=None, method='GET'):
        req = urllib.request.Request('https://api.github.com/repos/' + REPO + path,
            data=json.dumps(data).encode() if data is not None else None, method=method,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'RetailStorePlannerSync/1.0'})
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.load(r)
    try:
        api('/git/ref/heads/' + RESULT_BRANCH)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        sha = api('/git/ref/heads/main')['object']['sha']
        try:
            api('/git/refs', {'ref': 'refs/heads/' + RESULT_BRANCH, 'sha': sha}, 'POST')
        except urllib.error.HTTPError as creation_error:
            if creation_error.code != 422:
                raise
            api('/git/ref/heads/' + RESULT_BRANCH)
    content = base64.b64encode(json.dumps(result, separators=(',', ':')).encode()).decode()
    api('/contents/visit-sync-results/' + result['requestId'] + '.json',
        {'message': 'Store encrypted visit sync result', 'content': content, 'branch': RESULT_BRANCH}, 'PUT')

def main():
    year = int(os.environ['REPORT_YEAR'])
    if not 2020 <= year <= 2100:
        raise ValueError('Invalid report year')
    public = os.environ['SYNC_PUBLIC_KEY']
    request_id = os.environ['SYNC_REQUEST_ID']
    dataset = os.environ.get('SYNC_DATASET', 'visits')
    if dataset not in ('visits', 'customers', 'all', 'work'):
        raise ValueError('Invalid dataset')
    # Validate the supplied key before logging into the company service.
    encrypt_result([], year, request_id, public, os.environ['GITHUB_RUN_ID'])
    blob = json.loads(os.environ['SYNC_CREDENTIAL_BLOB'])
    uid = os.environ['SYNC_USER_ID']
    private_key = serialization.load_pem_private_key(os.environ['TTL_CREDENTIAL_PRIVATE_KEY'].encode(), password=None)
    decode = lambda x: base64.b64decode(x, validate=True)
    secret = private_key.decrypt(decode(blob['wrappedKey']), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    credential = json.loads(AESGCM(secret).decrypt(decode(blob['iv']), decode(blob['ciphertext']), ('ttl-credential:' + uid).encode()))
    if credential.get('version') != 1 or credential.get('uid') != uid:
        raise ValueError('Invalid credential owner')
    account, password = credential['account'], credential['password']
    if not account or not password or any(c in account + password for c in '\r\n'):
        raise ValueError('Invalid credential')
    print('::add-mask::' + account.replace('%', '%25'))
    print('::add-mask::' + password.replace('%', '%25'))
    items = parse_items(download_report(account, password, year)) if dataset in ('visits', 'all') else []
    customers = parse_customers(download_customers(account, password)) if dataset in ('customers', 'all') else None
    month = int(os.environ.get('SYNC_MONTH') or datetime.now(timezone.utc).month)
    if not 1 <= month <= 12: raise ValueError('Invalid month')
    work = parse_work(download_work(account, password, year, month)) if dataset == 'work' else None
    result = encrypt_result(items, year, request_id, public, os.environ['GITHUB_RUN_ID'], dataset, customers, account, work, month)
    publish_result(result)
    print(f'Encrypted planner update delivered: {len(items)} visit records, {len(customers or [])} customer records, {year}.')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Visit sync failed. No unencrypted report was published.', file=sys.stderr)
        sys.exit(1)
