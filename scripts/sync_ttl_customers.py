"""Export the current company customer roster; retain only planner fields."""
import io
import re
from html import unescape
import openpyxl
from test_ttl_export import company_session

def download_customers(account, password):
    request = company_session(account, password)
    url, body = request('/ubmsys_customer/lists/')
    page = body.decode('utf-8')
    if '/login' in url or 'id="user_pwd"' in page:
        raise ValueError('Company login failed')
    links = re.findall(r'href=["\']([^"\']+)["\']', page)
    path = next((unescape(x) for x in links if '/ubmsys_customer/export/' in x), None)
    if not path:
        raise ValueError('Customer export link unavailable')
    # This is the complete export visible to the signed-in company account,
    # not a name-filtered subset or a paginated customer list.
    _, data = request(path)
    if not data.startswith(b'PK'):
        raise ValueError('Customer export is not an XLSX workbook')
    return data

def parse_customers(data, owner_staff=None):
    if owner_staff is not None and not re.fullmatch(r'[0-9]{4,12}',owner_staff):
        raise ValueError('Invalid owner staff')
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        rows = list(workbook.active.values)
        h = next(i for i, row in enumerate(rows[:10]) if '店家代碼' in row and '執行人員' in row)
        header = [str(v or '').strip() for v in rows[h]]
        fields = {'code': '店家代碼', 'name': '店家名稱', 'type': '店家型態',
                  'channel': '通路別', 'grade': '店家等級', 'status': '營業狀態', 'owner': '執行人員'}
        indices = {k: header.index(label) for k, label in fields.items()}
        lat_index, lng_index = header.index('緯度'), header.index('經度')
        by_code = {}
        for row in rows[h + 1:]:
            item = {k: str(row[i] or '').strip() for k, i in indices.items()}
            # A company-only account can receive a multi-owner roster. Select its
            # exact employee number before deduplication; never pick the last owner.
            if owner_staff is not None and not re.search(r'(?:^|[-－])'+re.escape(owner_staff)+r'$',item['owner']):
                continue
            if len(row) > 11 and '結束營業' in re.sub(r'\s+', '', str(row[11] or '')):
                item['status'] = '結束營業'
            if not item['code']:
                continue
            if not item['name']:
                raise ValueError('Customer name missing')
            item['channel'] = item['channel'].strip(' ,，、')
            item['gps'] = None
            try:
                lat, lng = float(row[lat_index]), float(row[lng_index])
                if -90 <= lat <= 90 and -180 <= lng <= 180 and (lat != 0 or lng != 0):
                    item['gps'] = [lat, lng]
            except (TypeError, ValueError):
                pass
            previous = by_code.get(item['code'])
            # Do not silently assign a multi-owner store to the last row.
            if previous and previous != item:
                raise ValueError('Conflicting duplicate customer code')
            by_code[item['code']] = item
        if not by_code:
            raise ValueError('No customers assigned to company account' if owner_staff is not None else 'Empty customer roster')
        return list(by_code.values())
    finally:
        workbook.close()
