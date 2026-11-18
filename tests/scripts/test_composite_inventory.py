"""Spec postgres-minimal-composite: strict derived-profile and original inverse controls."""
import ast
import copy
import io
import tarfile
import tempfile
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('composite',ROOT/'infra/postgres-minimal-composite/inspect.py')
fixture=load('seal_fixture',ROOT/'tests/scripts/test_composite_seal.py')
t=load('retained_controls',ROOT/'tests/scripts/test_minimal_runtime_inventory.py')

def pair():
 b,a=t.synthetic_pair()
 for x in [b,a]:x.update(profile='explicit-composite-v1',statusText='synthetic status\n',packagePayloads={'usr/share/libxml2/example':{'type':'file','sha256':'d'*64,'mode':420}})
 b['dpkgStatusSha256']=m.seal.H(b['statusText'].encode())
 d={'derivedOnlyFromQualifiedInputs':True,'statusSha256':b['dpkgStatusSha256'],'installedPackageVersions':copy.deepcopy(b['installedPackageVersions']),'allRegularElfPayloads':copy.deepcopy(b['allRegularElfPayloads']),'protectedHashes':copy.deepcopy(b['payloadHashes']),'packagePayloads':copy.deepcopy(b['packagePayloads'])}
 return b,a,d

class CompositeInventory(unittest.TestCase):
 def test_actual_inventory_reads_status_and_deb_payloads_without_executing(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);args=fixture.fixture(root);archive=root/'rootfs.tar';status=b'Package: keep\nArchitecture: amd64\nVersion: 1\nStatus: install ok installed\n'
   entries=[('var/lib/dpkg/status',status),(fixture.PROVIDER,b'\x7fELFnew-provider'),('var/lib/dpkg/info/libxml2:amd64.list',('/'+fixture.PROVIDER+'\n').encode())]
   with tarfile.open(archive,'w') as tf:
    for name,data in entries:
     info=tarfile.TarInfo(name);info.mode=0o644;info.size=len(data);tf.addfile(info,io.BytesIO(data))
   report=m.inventory(archive,root,'absent',args[2],fixture.dynamic);self.assertEqual(report['statusText'],status.decode());self.assertEqual(report['packagePayloads'],args[1]['packagePayloads']);self.assertFalse(report['runtimeCompatibilityQualified'])
 def test_original_assertions_inverse_exact_except_explicit_status_authority(self):
  original=Path(ROOT/'infra/postgres-minimal-runtime/inspect.py').read_text();candidate=Path(ROOT/'infra/postgres-minimal-composite/inspect.py').read_text()
  tree=ast.parse(candidate);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_pair')
  # Seven new preconditions are followed by the complete original function body.
  old=next(n for n in ast.parse(original).body if isinstance(n,ast.FunctionDef) and n.name=='validate_pair')
  body=ast.unparse(ast.Module(body=fn.body[7:],type_ignores=[])).replace("derived['statusSha256']",'STATUS_SHA').replace('raw.','')
  self.assertEqual(ast.dump(ast.parse(body),include_attributes=False),ast.dump(ast.Module(body=old.body,type_ignores=[]),include_attributes=False))
 def test_valid_derived_vector_passes_but_original_raw_profile_still_rejects(self):
  b,a,d=pair();self.assertTrue(m.validate_pair(b,a,d)['pairedInventoryPassed'])
  with self.assertRaises(AssertionError):m.raw.validate_pair(b,a)
 def test_every_retained_and_authority_gate_remains_mandatory(self):
  edits=[lambda b,a,d:d.update(derivedOnlyFromQualifiedInputs=False),lambda b,a,d:d.update(statusSha256='e'*64),lambda b,a,d:a['installedPackageVersions'].pop('gpgv:amd64'),lambda b,a,d:a['allRegularElfPayloads'][0].update(sha256='e'*64),lambda b,a,d:a['packageControls'].update(passed=False),lambda b,a,d:a['payloadHashes'].pop(m.raw.PROTECTED[0]),lambda b,a,d:a['packagePayloads'].clear(),lambda b,a,d:a['allRegularElfPayloads'][0].update(needed=['missing.so']),lambda b,a,d:a.update(parserCompleted=False),lambda b,a,d:b['allRegularElfPayloads'].pop()]
  for edit in edits:
   b,a,d=pair();edit(b,a,d)
   with self.assertRaises((AssertionError,KeyError)):m.validate_pair(b,a,d)
if __name__=='__main__':unittest.main(verbosity=2)
