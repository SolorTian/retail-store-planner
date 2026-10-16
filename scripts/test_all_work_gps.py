import sys,io,unittest,threading,time
# Uses the adjacent production report parser.
import sync_ttl_work as sync
import openpyxl

def export(count=2):
 b=openpyxl.Workbook();s=b.active;s.append(['工作ID','店家代碼','店家名稱','執行人員','打卡時間','工作完成日期'])
 for n in range(count):s.append([f'w{n}',f'C{n}','臨時點' if n==0 else '一般店','訪員','2026-10-16 09:00:00','2026-10-16 10:00:00'])
 out=io.BytesIO();b.save(out);b.close();return out.getvalue()
def body():
 return ('工作討論<li><div class="title">訪員 打卡 <small>( 2026-10-16 08:00:00 )</small></div><div class="content">經緯度：25,121</div></li><li><div class="title">訪員 離站打卡 <small>( 2026-10-16 10:00:00 )</small></div><div class="content">經緯度：25.001,121</div></li>').encode()
class AllGps(unittest.TestCase):
 def test_all_stores_receive_gps_and_normal_checkin_time_stays_unchanged(self):
  calls=[]
  def request(p):calls.append(p);return p,body()
  rows=sync.parse_work(sync.enrich_work_export(export(),request))['items']
  self.assertEqual(len(calls),2)
  self.assertEqual(rows[0]['checkInAt'],'2026-10-16 08:00:00')
  self.assertEqual(rows[1]['checkInAt'],'2026-10-16 09:00:00')
  for row in rows:self.assertEqual(row['checkInLat'],25);self.assertEqual(row['checkOutLat'],25.001)
 def test_detail_outage_retains_report_times_and_marks_gps_unknown(self):
  def request(p):raise TimeoutError()
  rows=sync.parse_work(sync.enrich_work_export(export(),request))['items']
  for r in rows:self.assertEqual(r['checkInAt'],'2026-10-16 09:00:00');self.assertIsNone(r['checkInLat']);self.assertIsNone(r['checkOutLat'])
 def test_deadline_skips_pending_detail_requests(self):
  def request(p):raise AssertionError('must not fetch after deadline')
  rows=sync.parse_work(sync.enrich_work_export(export(),request,deadline_seconds=0))['items']
  self.assertEqual(len(rows),2);self.assertIsNone(rows[1]['checkInLat'])
 def test_detail_fetches_are_bounded_to_four(self):
  lock=threading.Lock();running=0;maximum=0
  def request(p):
   nonlocal running,maximum
   with lock:running+=1;maximum=max(maximum,running)
   time.sleep(.01)
   with lock:running-=1
   return p,body()
  sync.enrich_work_export(export(12),request)
  self.assertLessEqual(maximum,4);self.assertGreater(maximum,1)
 def test_expired_company_login_never_publishes_partial_data(self):
  with self.assertRaisesRegex(ValueError,'Company login failed'):sync.enrich_work_export(export(),lambda p:('/ubmsys/login',b''))
if __name__=='__main__':unittest.main()
