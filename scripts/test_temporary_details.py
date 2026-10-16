import io
import unittest
import openpyxl
from sync_ttl_work import parse_checkin_detail, enrich_temporary_export, parse_work

def event(kind, time, gps='25,121', owner='訪員'):
 return f'<li><div class="title"><span>{owner}</span> {kind}<small>1 hour ( 2026-10-16 {time} )</small></div><div class="content">經緯度：{gps}</div></li>'

class TemporaryDetails(unittest.TestCase):
 def test_first_arrival_and_final_departure_chronological_not_markup_order(self):
  html=event('離站打卡','10:00:00','25.001,121')+event('打卡','09:00:00','25.5,121')+event('打卡','08:00:00')
  r=parse_checkin_detail(html,'訪員')
  self.assertEqual(r['checkInAt'],'2026-10-16 08:00:00');self.assertEqual(r['checkInLat'],25)
  self.assertEqual(r['checkOutLat'],25.001)
 def test_missing_first_gps_never_uses_later_arrival(self):
  r=parse_checkin_detail(event('打卡','08:00:00','缺少')+event('打卡','09:00:00')+event('離站打卡','10:00:00'),'訪員')
  self.assertIsNone(r['checkInLat'])
 def test_other_person_store_address_or_survey_cannot_supply_gps(self):
  self.assertEqual(parse_checkin_detail(event('打卡','08:00:00',owner='別人')+event('問卷調查','09:00:00'),'訪員'),{})
 def test_departure_before_arrival_is_ignored(self):
  r=parse_checkin_detail(event('離站打卡','07:00:00')+event('打卡','08:00:00'),'訪員')
  self.assertNotIn('checkOutLat',r)
 def test_invalid_coordinates_and_ambiguous_same_timestamp_are_unknown(self):
  for gps in ['91,121','0,0','NaN,121','25,181']:
   self.assertIsNone(parse_checkin_detail(event('打卡','08:00:00',gps),'訪員')['checkInLat'])
  r=parse_checkin_detail(event('打卡','08:00:00')+event('打卡','08:00:00','26,121'),'訪員')
  self.assertIsNone(r['checkInLat'])
 def export(self):
  b=openpyxl.Workbook();s=b.active
  s.append(['工作ID','店家代碼','店家名稱','執行人員','打卡時間','工作完成日期'])
  s.append(['temp1','temp','臨時點','訪員','2026-10-16 09:00:00','2026-10-16 10:00:00'])
  s.append(['normal1','C1','一般店','訪員','2026-10-16 09:00:00','2026-10-16 10:00:00'])
  stream=io.BytesIO();b.save(stream);b.close();return stream.getvalue()
 def test_export_enrichment_fetches_only_temporary_and_preserves_ordinary(self):
  calls=[]
  def request(path):
   calls.append(path);return path,('工作討論'+event('打卡','08:00:00')+event('離站打卡','10:00:00','25.01,121')).encode()
  r=parse_work(enrich_temporary_export(self.export(),request))['items']
  self.assertEqual(calls,['/ubmsys_task_message/lists/temp1']);self.assertEqual(r[0]['checkInAt'],'2026-10-16 08:00:00')
  self.assertEqual(r[0]['checkOutLat'],25.01);self.assertEqual(r[1]['checkInAt'],'2026-10-16 09:00:00');self.assertIsNone(r[1]['checkOutLat'])
 def test_missing_detail_clears_unverified_export_coordinates(self):
  r=parse_work(enrich_temporary_export(self.export(),lambda p:(p,'工作討論'.encode())))['items'][0]
  self.assertIsNone(r['checkInLat']);self.assertIsNone(r['checkOutLat'])
 def test_login_failure_does_not_publish_partial_export(self):
  with self.assertRaises(ValueError):enrich_temporary_export(self.export(),lambda p:('/ubmsys/login',b''))

if __name__=='__main__':unittest.main()
