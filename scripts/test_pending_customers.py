import io,sys,unittest,importlib.util
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import openpyxl
spec=importlib.util.spec_from_file_location('scoped_customers',Path(__file__).with_name('sync_ttl_customers.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def workbook(rows):
    book=openpyxl.Workbook();sheet=book.active
    sheet.append(['店家代碼','店家名稱','店家型態','通路別','店家等級','營業狀態','執行人員','緯度','經度'])
    for row in rows:sheet.append(row)
    data=io.BytesIO();book.save(data);book.close();return data.getvalue()
def row(owner,name='測試店'):
    return ['TEST-1',name,'測試型態','測試通路','A','營業中',owner,25,121]
class Tests(unittest.TestCase):
    def test_select_exact_owner_before_duplicate_check(self):
        data=workbook([row('其他人-9999999'),row('測試訪員-5555555')])
        result=module.parse_customers(data,owner_staff='5555555');self.assertEqual(len(result),1);self.assertEqual(result[0]['owner'],'測試訪員-5555555')
    def test_default_keeps_conflict_guard(self):
        with self.assertRaisesRegex(ValueError,'Conflicting duplicate'):module.parse_customers(workbook([row('其他人-9999999'),row('測試訪員-5555555')]))
    def test_same_owner_conflict_still_rejected(self):
        with self.assertRaisesRegex(ValueError,'Conflicting duplicate'):module.parse_customers(workbook([row('測試訪員-5555555'),row('測試訪員-5555555','另一間店')]),owner_staff='5555555')
    def test_no_matching_owner_never_falls_back_to_somebody_else(self):
        with self.assertRaisesRegex(ValueError,'No customers assigned'):module.parse_customers(workbook([row('其他人-15555555')]),owner_staff='5555555')
if __name__=='__main__':unittest.main()
