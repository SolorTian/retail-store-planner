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

def merge_customer_rows(previous, item, account=''):
    """Merge shared-office/person assignments only when store fields agree."""
    if previous == item:
        return previous
    staff_id = str(account).split('@', 1)[0].strip()
    def belongs(owner):
        return bool(staff_id) and (owner == staff_id or owner.endswith('-' + staff_id))
    old_owner, new_owner = previous['owner'], item['owner']
    # A staff assignment is authoritative over an office's shared copy for
    # that same code, including its grade/GPS; never use export row order.
    personal = previous if belongs(old_owner) else item if belongs(new_owner) else None
    other = item if personal is previous else previous
    if personal and (not other['owner'] or other['owner'].isdigit()) and not belongs(other['owner']):
        selected = dict(personal)
        if any('結束營業' in re.sub(r'\s+', '', x['status']) for x in (previous, item)):
            selected['status'] = '結束營業'
        return selected
    if {k: v for k, v in previous.items() if k != 'owner'} != {k: v for k, v in item.items() if k != 'owner'}:
        raise ValueError('Conflicting duplicate customer code')
    if belongs(old_owner) != belongs(new_owner):
        return previous if belongs(old_owner) else item
    old_named = bool(old_owner) and not old_owner.isdigit()
    new_named = bool(new_owner) and not new_owner.isdigit()
    if old_named != new_named:
        return previous if old_named else item
    if not old_owner or not new_owner:
        return previous if old_owner else item
    # Two different named staff (or offices) remain ambiguous.
    raise ValueError('Conflicting duplicate customer code')

def parse_customers(data, account=''):
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
            by_code[item['code']] = merge_customer_rows(previous, item, account) if previous else item
        if not by_code:
            raise ValueError('Empty customer roster')
        return list(by_code.values())
    finally:
        workbook.close()
