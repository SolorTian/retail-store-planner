import unittest,uuid
from cryptography.hazmat.primitives.asymmetric import rsa
from sync_global_daily import seal_binding,decrypt_binding
class LinkedBindingTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
 def test_rewrapped_binding_works_for_linked_google_owner(self):
  owner=str(uuid.uuid4());envelope=seal_binding(owner,'fixture@example.test','fixture-password',self.key)
  self.assertEqual(decrypt_binding({'owner':owner,'envelope':envelope,'accountLabel':'fixture@example.test'},self.key),('fixture@example.test','fixture-password'))
 def test_same_ciphertext_cannot_be_claimed_by_another_google_owner(self):
  envelope=seal_binding(str(uuid.uuid4()),'fixture@example.test','fixture-password',self.key)
  with self.assertRaises(Exception):decrypt_binding({'owner':str(uuid.uuid4()),'envelope':envelope,'accountLabel':'fixture@example.test'},self.key)
if __name__=='__main__':unittest.main()

