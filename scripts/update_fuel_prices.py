"""Daily public CPC 95 price reference. No user or company credentials required."""
import argparse
import json
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from html.parser import HTMLParser
from pathlib import Path

SOURCE = 'https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx'
TZ = timezone(timedelta(hours=8))

class Table(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.row = None; self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th') and self.row is not None: self.cell = []
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(''.join(self.cell).strip()); self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None

def parse(html):
    parser = Table(); parser.feed(html); points = {}
    for row in parser.rows:
        if len(row) < 4: continue
        try:
            day = datetime.strptime(row[0], '%Y/%m/%d').date()
            value = Decimal(row[2])
            if not value.is_finite() or not Decimal('5') < value < Decimal('200'): continue
        except (ValueError, ArithmeticError): continue
        if day in points and points[day] != value: raise ValueError('Conflicting CPC dates')
        points[day] = value
    if len(points) < 4: raise ValueError('CPC 95 historical table unavailable')
    return sorted(points.items())

def monthly(points, asof):
    months = {}; cursor = points[0][0]; index = 0
    while cursor <= asof:
        while index + 1 < len(points) and points[index+1][0] <= cursor: index += 1
        key = cursor.strftime('%Y-%m'); record = months.setdefault(key, {'sum': Decimal(0), 'days': 0, 'first': cursor.isoformat()})
        record['sum'] += points[index][1]; record['days'] += 1; record['through'] = cursor.isoformat()
        cursor += timedelta(days=1)
    result = {}
    for key, row in months.items():
        # Do not invent the first part of the earliest retained month.
        if row['first'] != key+'-01': continue
        result[key] = {'average': float((row['sum']/row['days']).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)),
                       'days': row['days'], 'through': row['through'], 'complete': key < asof.strftime('%Y-%m')}
    return result

def build(html, now=None):
    now = now or datetime.now(TZ); asof = now.astimezone(TZ).date(); points = [(d,v) for d,v in parse(html) if d<=asof]
    if not points or (asof-points[-1][0]).days > 21: raise ValueError('CPC source appears stale')
    return {'version': 1, 'source': SOURCE, 'sourceName': '台灣中油95無鉛汽油歷史牌價',
            'method': 'daily_weighted', 'asOf': asof.isoformat(), 'fetchedAt': now.isoformat(),
            'latestEffectiveDate': points[-1][0].isoformat(), 'months': monthly(points, asof)}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--output', required=True); args = parser.parse_args()
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'RetailPlanner-OilReference/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response: html = response.read().decode('utf-8-sig')
    data = build(html); target = Path(args.output); target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Updated CPC 95 reference through '+data['asOf'])

if __name__ == '__main__': main()
