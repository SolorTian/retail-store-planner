import io,sys,unittest
sys.dont_write_bytecode=True
from pathlib import Path
import openpyxl
from sync_ttl_work import scope_work_export,parse_work
class ScopeTests(unittest.TestCase):
 def test_other_visitor_is_removed_before_detail_gps_queries(self):
  book=openpyxl.Workbook();sheet=book.active;sheet.append(['工作ID','店家代碼','打卡時間','工作完成日期','執行人員','店家名稱']);sheet.append(['a','one','2026-10-17 09:00:00','2026-10-17 10:00:00','測試-5555555','測試店']);sheet.append(['b','two','2026-10-17 09:00:00','2026-10-17 10:00:00','別人-15555555','測試店']);data=io.BytesIO();book.save(data);book.close();scoped=scope_work_export(data.getvalue(),'5555555');self.assertEqual([r['id'] for r in parse_work(scoped)['items']],['a']);self.assertEqual(parse_work(scope_work_export(data.getvalue(),'7777777'))['items'],[])
if __name__=='__main__':unittest.main()
