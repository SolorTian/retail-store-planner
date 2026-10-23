import io,sys,types,unittest
from unittest.mock import patch
import openpyxl
with patch.dict(sys.modules,{'test_ttl_export':types.SimpleNamespace(company_session=None)}):
 from sync_ttl_work import parse_work
class WorkflowExport(unittest.TestCase):
 def export(self,field='工作流程'):
  b=openpyxl.Workbook();s=b.active;s.append(['工作ID','店家代碼','店家名稱','執行人員','打卡時間','工作完成日期','工作主題',field]);s.append(['w1','s1','測試店','訪員','2026-10-21 09:00:00','2026-10-21 09:10:00','常態工作','到站打卡 → 必填訪店紀錄']);data=io.BytesIO();b.save(data);b.close();return data.getvalue()
 def test_company_workflow_name_is_preserved(self):
  for name in ['工作流程','工作流程名稱','問卷名稱']:
   result=parse_work(self.export(name));self.assertIn('workflow',result['columns']);self.assertEqual(result['items'][0]['workflow'],'到站打卡 → 必填訪店紀錄')
 def test_subject_is_not_used_as_questionnaire(self):
  result=parse_work(self.export('未知欄位'));self.assertEqual(result['items'][0]['workflow'],'');self.assertNotIn('workflow',result['columns'])
if __name__=='__main__':unittest.main()