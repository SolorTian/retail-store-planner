import ast,contextlib,io,re,unittest
from datetime import date
from pathlib import Path

class PendingScopeTests(unittest.TestCase):
    def test_pending_export_publishes_only_its_own_visits_and_work(self):
        source=ast.parse(Path(__file__).with_name('sync_global_daily.py').read_text(encoding='utf-8-sig'))
        wanted={'export_job','export_stage','ExportStageFailure'}
        code=compile(ast.Module(body=[n for n in source.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in wanted],type_ignores=[]),'worker','exec')
        captured={}
        def prepare(day,account,customers,visits,work,fuels,offsets):
            captured.update(visits=visits,work=work);return []
        namespace={'date':date,'re':re,'decrypt_binding':lambda j,k:('5555555@example.invalid','synthetic'),
          'download_customers':lambda *a:b'','parse_customers':lambda b,owner_staff:[{'code':'OWN','owner':'測試-5555555'}],
          'download_report':lambda *a:b'','parse_items':lambda b:[{'code':'OWN'},{'code':'OTHER'}],
          'download_work':lambda *a:b'','parse_work':lambda b:{'items':[{'id':'own','owner':'測試-5555555'},{'id':'other','owner':'其他-9999999'}]},
          'work_range':lambda *a:(date(2026,9,1),date(2026,10,31)),
          'download_fuel':lambda *a:b'','parse_fuel':lambda *a:{},'download_offsets':lambda *a:b'','parse_offsets':lambda *a:{},'prepare_documents':prepare}
        exec(code,namespace)
        with contextlib.redirect_stdout(io.StringIO()):namespace['export_job']({'kind':'pending_google','day':'2026-10-17'},None)
        self.assertEqual(captured['visits'],[{'code':'OWN'}]);self.assertEqual([r['id'] for r in captured['work']['items']],['own'])
if __name__=='__main__':unittest.main()
