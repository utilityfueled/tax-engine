import hashlib,importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HELPER=ROOT/'infra/postgres-sqlite-backport/extract-distinct-paired.py'
FIXTURE=ROOT/'infra/sqlite-distinct-paired/upstream-distinct.test'
class ExactFixture(unittest.TestCase):
 def load(self):
  s=importlib.util.spec_from_file_location('paired_fixture',HELPER);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
 def test_authenticated_case_block_and_bootstrap_are_exact(self):
  m=self.load();raw=FIXTURE.read_bytes();out=m.derive(raw);h=lambda b:hashlib.sha256(b).hexdigest()
  self.assertEqual(h(raw),'37aff676d1abd68932e3448f4749ca9cdb6d9e09dbcd7fcc78f51a9dc892e47f');self.assertEqual(len(out),5546);self.assertEqual(h(out),'f8ff98ec333741d0cf00bbcb961c9b888fb3430fda18176b5d7b700c09f631cf')
  self.assertEqual(out[:609],raw[:609]);self.assertEqual(out[609:-13],raw[raw.index(b'# 2023-03-16\n'):raw.rindex(b'\nfinish_test\n')]);self.assertEqual(out.count(b'do_execsql_test '),5);self.assertNotIn(b'foreach {tn idx}',out)
  for n in range(1,6):self.assertEqual(out.count(('do_execsql_test 10.%s {'%n).encode()),1)
 def test_any_source_mutation_is_rejected(self):
  m=self.load();raw=FIXTURE.read_bytes()
  for b in [raw+b' ',raw[:-1],raw.replace(b'set testprefix distinct',b'set testprefix other'),raw.replace(b'do_execsql_test 10.1',b'do_execsql_test 10.9')]:
   with self.assertRaises((ValueError,AssertionError)):m.derive(b)
 def test_cli_rejects_mutation_links_and_existing_output(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t);inp=d/'upstream.test';inp.write_bytes(FIXTURE.read_bytes());out=d/'paired.test';record=d/'receipt.json'
   def run(path=inp):return subprocess.run([sys.executable,'-I','-B',str(HELPER),'--source',str(path),'--output',str(out),'--record',str(record)],capture_output=True,timeout=3)
   self.assertEqual(run().returncode,0);self.assertEqual(json.loads(record.read_text())['cases'],['distinct-10.'+str(n) for n in range(1,6)]);original=out.read_bytes();self.assertNotEqual(run().returncode,0);self.assertEqual(out.read_bytes(),original)
   out.unlink();record.unlink();inp.write_bytes(b'mutated');self.assertNotEqual(run().returncode,0);self.assertFalse(out.exists())
   inp.write_bytes(FIXTURE.read_bytes());link=d/'link';link.symlink_to(inp);self.assertNotEqual(run(link).returncode,0);self.assertFalse(out.exists());link.unlink();os.link(inp,link);self.assertNotEqual(run().returncode,0);self.assertFalse(out.exists())
if __name__=='__main__':unittest.main()
