"""Read-only connectivity test. Never persist credentials, cookies or report data."""
import argparse
import http.cookiejar
import http.client
import socket
import time
import urllib.error
import io
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from html import unescape
from zoneinfo import ZoneInfo
import openpyxl

BASE = 'https://ttl.unidyna.com'

def company_session(account, password):
    session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(path, data=None):
        target = urllib.parse.urljoin(BASE, path)
        if urllib.parse.urlsplit(target).netloc != urllib.parse.urlsplit(BASE).netloc:
            raise ValueError('Unexpected report destination')
        req = urllib.request.Request(target, data=urllib.parse.urlencode(data).encode() if data is not None else None,
            headers={'User-Agent': 'RetailStorePlannerSync/1.0', 'Referer': BASE + '/ubmsys/login'})
        # Only retry reads. Never replay the credential-submit POST automatically.
        attempts = 3 if data is None else 1
        for attempt in range(attempts):
            try:
                with session.open(req, timeout=60) as response:
                    if urllib.parse.urlsplit(response.url).netloc != 'ttl.unidyna.com':
                        raise ValueError('Unexpected login redirect')
                    return response.url, response.read()
            except urllib.error.HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504):
                    raise
                if attempt + 1 == attempts:
                    raise ValueError('Company temporarily unavailable') from None
            except (http.client.IncompleteRead, http.client.RemoteDisconnected,
                    urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError):
                if attempt + 1 == attempts:
                    raise ValueError('Company response interrupted' if data is None else 'Company login response interrupted') from None
            time.sleep(attempt + 1)
    request('/ubmsys/login')
    request('/ubmsys/login', {'com_name': 'ttl', 'user_account': account, 'user_pwd': password, 'ci_csrf_token': ''})
    return request

def download_report(account, password, year):
    request = company_session(account, password)
    url, body = request('/ubmsys_report_location/lists?str_date=' + str(year))
    page = body.decode('utf-8')
    if '/login' in url or 'id="user_pwd"' in page:
        raise ValueError('Company login failed')
    links = re.findall(r'href=["\']([^"\']+)["\']', page)
    path = next((unescape(x) for x in links if '/lists/channel_store/1?' in x), None)
    if not path:
        raise ValueError('Company export link unavailable')
    split = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qs(split.query, keep_blank_values=True)
    query['str_date'] = [str(year)]
    path = urllib.parse.urlunsplit((split.scheme, split.netloc, split.path, urllib.parse.urlencode(query, doseq=True), ''))
    _, data = request(path)
    if not data.startswith(b'PK'):
        raise ValueError('Export did not return an XLSX workbook')
    return data

def validate_report(data):
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        rows = list(workbook.active.iter_rows(values_only=True))
        header_index = next((i for i, r in enumerate(rows[:10]) if '店家代碼' in r), None)
        if header_index is None:
            raise ValueError('Report column names did not match')
        header = rows[header_index]
        code_index = header.index('店家代碼')
        subheader = rows[header_index + 1]
        actual_columns = [i for i, v in enumerate(subheader) if str(v or '').strip() == '實訪']
        if len(actual_columns) < 12:
            raise ValueError('Report missing monthly visit columns')
        records = {}
        for row in rows[header_index + 2:]:
            code = str(row[code_index] or '').strip()
            if not code:
                continue
            visits = [int(row[i] or 0) for i in actual_columns[:12]]
            if any(v < 0 for v in visits):
                raise ValueError('Invalid visit count')
            records[code] = visits
        if not records:
            raise ValueError('Report returned zero valid stores')
        return len(records)
    finally:
        workbook.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, default=datetime.now(ZoneInfo('Asia/Taipei')).year)
    args = parser.parse_args()
    account, password = os.environ.get('TTL_ACCOUNT'), os.environ.get('TTL_PASSWORD')
    if not account or not password:
        print('Test not started: configure TTL_ACCOUNT and TTL_PASSWORD in GitHub Actions Secrets.', file=sys.stderr)
        return 1
    if not 2020 <= args.year <= 2100:
        raise ValueError('Invalid year')
    count = validate_report(download_report(account, password, args.year))
    print(f'PASS: independent login, XLSX export and 12 monthly actual-visit columns verified; {count} valid stores.')
    print('Read-only test. No report file, customer details, cookie or credential was published; Firebase was not changed.')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # Never expose HTTP bodies, session identifiers or credentials in public logs.
        print('Test failed: company login/export or workbook validation did not complete.', file=sys.stderr)
        sys.exit(1)
