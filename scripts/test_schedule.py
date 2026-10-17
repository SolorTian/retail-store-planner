import unittest,json,sys,types
from datetime import date
# Parser/write tests never load a credential or contact the company service.
from unittest.mock import patch
with patch.dict(sys.modules,{'sync_global_daily':types.SimpleNamespace(decrypt_binding=None),'test_ttl_export':types.SimpleNamespace(company_session=None)}):
 from sync_ttl_schedule import own_user,parse_batch,validate_plan,execute
USER={'user_id':'9','user_name':'測試-5555555'}
def page(existing=False):
 return '''<form id="dataForm"><input type="hidden" name="op" value="add"><input type="radio" name="task_type" id="task_type0" value="1"><input type="radio" name="task_type" id="task_type1" value="2"><input type="hidden" name="data" value=""><select name="user_ids[]"></select><select name="task_str_time"><option value="08:00">08:00</option></select><select name="task_matter_id[]"><option value="1">到站打卡</option></select><select name="task_proc_id"><option value="42">即飲通路</option></select><select name="task_title"><option value="常態工作">常態工作</option></select><table><tr><td colspan="4">營業處 測試-5555555</td></tr><tr><td colspan="2">即飲通路</td><td>示範餐廳</td><td>A</td><td data-val="123-17" data-day="17" data-status="'''+('1' if existing else '0')+'''" value="0"></td></tr></table></form>'''
def plan():return {'time':'08:00','title':'常態工作','type':'1','package':'42','custom':[],'cells':[{'store':'123','date':'2026-10-17'}]}
class ScheduleTests(unittest.TestCase):
 def test_employee_exact_suffix_only(self):
  data={'x':[USER,{'user_id':'8','user_name':'別人-15555555'}]};self.assertEqual(own_user('var user_group = '+json.dumps(data)+';','5555555@example.invalid')['user_id'],'9')
  with self.assertRaises(ValueError):own_user('var user_group = '+json.dumps(data)+';','9999999@example.invalid')
 def test_form_identity_and_company_catalogue(self):
  catalog,states,hidden=parse_batch(page(),'2026-10',USER);self.assertEqual(catalog['customers'][0]['name'],'示範餐廳');self.assertEqual(hidden[0],('op','add'));self.assertFalse(states[('123','2026-10-17')])
  with self.assertRaises(ValueError):parse_batch(page(),'2026-10',{'user_id':'8','user_name':'別人'})
 def test_duplicate_empty_settings_form_is_ignored(self):
  c,s,h=parse_batch(page()+'<form id="dataForm"></form>','2026-10',USER);self.assertEqual(len(c['customers']),1)
 def test_matrix_outside_settings_form_is_supported(self):
  html=page().replace('<table>','</form><table>').replace('</table></form>','</table>')
  c,s,h=parse_batch(html,'2026-10',USER);self.assertEqual(len(c['customers']),1);self.assertEqual(c['customers'][0]['id'],'123')
 def test_selected_cells_deduplicated_and_existing_skipped(self):
  c,s,_=parse_batch(page(),'2026-10',USER);p=plan();p['cells']*=2;self.assertEqual(len(validate_plan(p,c,s,date(2026,10,17))[0]),1);s[('123','2026-10-17')]=True;self.assertEqual(len(validate_plan(p,c,s,date(2026,10,17))[1]),1)
 def test_invalid_date_store_workflow_never_accepted(self):
  c,s,_=parse_batch(page(),'2026-10',USER)
  for mutate in [lambda p:p.update(package='bad'),lambda p:p.update(time='09:00'),lambda p:p['cells'][0].update(store='other'),lambda p:p['cells'][0].update(date='2026-10-16')]:
   p=plan();mutate(p)
   with self.assertRaises(ValueError):validate_plan(p,c,s,date(2026,10,17))
 def test_write_once_with_correct_self_flow_then_readback(self):
  calls=[]
  def request(path,body=None):calls.append((path,body));return path,page(len(calls)>1).encode()
  r=execute(request,'2026-10',USER,plan(),date(2026,10,17));self.assertTrue(r['verified']);posts=[b for _,b in calls if b];self.assertEqual(len(posts),1);self.assertIn(('user_ids[]','9'),posts[0]);self.assertIn(('data','123-17,'),posts[0]);self.assertIn(('task_proc_id','42'),posts[0]);self.assertIn(('task_type','2'),posts[0])
 def test_no_post_when_fresh_check_finds_existing(self):
  calls=[]
  def request(path,body=None):calls.append(body);return path,page(True).encode()
  r=execute(request,'2026-10',USER,plan(),date(2026,10,17));self.assertEqual(r['created'],0);self.assertEqual(r['skipped'],1);self.assertEqual(calls,[None])
 def test_lost_post_response_is_never_retried_and_can_verify(self):
  calls=[]
  def request(path,body=None):
   calls.append(body)
   if body:raise TimeoutError()
   return path,page(len(calls)>1).encode()
  r=execute(request,'2026-10',USER,plan(),date(2026,10,17));self.assertTrue(r['verified']);self.assertTrue(r['responseInterrupted']);self.assertEqual(sum(b is not None for b in calls),1)
 def test_unconfirmed_write_requires_review(self):
  calls=[]
  def request(path,body=None):calls.append(body);return path,page(False).encode()
  r=execute(request,'2026-10',USER,plan(),date(2026,10,17));self.assertFalse(r['verified']);self.assertEqual(sum(b is not None for b in calls),1)





class GroupTests(unittest.TestCase):
 def fixture(self,state):
  h=page(False).replace('</table>','<tr><td>即飲</td><td>第二店</td><td>A</td><td data-val="456-17" data-day="17" data-status="'+('1' if '456' in state else '0')+'"></td></tr></table>')
  return h.replace('data-val="123-17" data-day="17" data-status="0"','data-val="123-17" data-day="17" data-status="'+('1' if '123' in state else '0')+'"')
 def groups(self):
  a=plan();b=plan();b.update(type='0',custom=['1']);b['cells']=[{'store':'456','date':'2026-10-17'}];return {'groups':[a,b]}
 def test_different_flows_post_once_per_group_and_report_progress(self):
  state=set();posts=[];progress=[]
  def request(path,body=None):
   if body:posts.append(body);state.update(dict(body)['data'].split('-')[0].split(','))
   return path,self.fixture(state).encode()
  r=execute(request,'2026-10',USER,self.groups(),date(2026,10,17),progress.append)
  self.assertTrue(r['verified']);self.assertEqual(r['created'],2);self.assertEqual(len(posts),2);self.assertIn(('task_type','2'),posts[0]);self.assertIn(('task_type','1'),posts[1]);self.assertEqual(progress[-1]['completedGroups'],1)
 def test_invalid_later_group_does_not_write_first_group(self):
  posts=[]
  def request(path,body=None):
   if body:posts.append(body)
   return path,self.fixture(set()).encode()
  p=self.groups();p['groups'][1]['custom']=['bad']
  with self.assertRaises(ValueError):execute(request,'2026-10',USER,p,date(2026,10,17))
  self.assertFalse(posts)
 def test_uncertain_group_stops_later_groups_without_replay(self):
  posts=[]
  def request(path,body=None):
   if body:posts.append(body);raise TimeoutError()
   return path,self.fixture(set()).encode()
  r=execute(request,'2026-10',USER,self.groups(),date(2026,10,17));self.assertFalse(r['verified']);self.assertEqual(len(posts),1)
 def test_duplicate_store_day_across_groups_rejected_before_post(self):
  p=self.groups();p['groups'][1]['cells']=p['groups'][0]['cells'];posts=[]
  def request(path,body=None):
   if body:posts.append(body)
   return path,self.fixture(set()).encode()
  with self.assertRaises(ValueError):execute(request,'2026-10',USER,p,date(2026,10,17))
  self.assertFalse(posts)

if __name__=='__main__':unittest.main()
