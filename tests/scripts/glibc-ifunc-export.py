"""Spec: spec/ops/glibc-ifunc-conditional-profile.yaml; inert source export controls."""
from pathlib import Path
import importlib.util,json,tempfile,unittest,os,hashlib
ROOT=Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('profiles',ROOT/'infra/postgres-glibc-ifunc-experiment/export-build-profiles.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
class ExportControls(unittest.TestCase):
 def exercise(self,case):
  with tempfile.TemporaryDirectory(prefix='glibc-profile-export-')as t:
   root=Path(t).resolve();work=root/'work';work.mkdir();out=root/'out';out.mkdir();f=work/'baseline/build-tree/amd64-libc';f.mkdir(parents=True)
   (f/'config.make').write_text('with-lld = no\nLD = ld\n');(f/'configparms').write_text('CFLAGS = -O2\n');(f/'config.log').write_text('checking version of ld...2.40, ok\n')
   if case=='positive':
    for rel in ['baseline/build-tree/amd64-x32','candidate/build-tree/amd64-libc']:
     d=work/rel;d.mkdir(parents=True)
     for name in ['config.make','configparms','config.log']:(d/name).write_bytes((f/name).read_bytes())
   if case=='unsupported-profile':
    d=work/'baseline/build-tree/amd64-other';d.mkdir();(d/'config.make').write_text('with-lld = no\nLD = ld\n')
   malformed={
    'append-ld-tight':'LD+=ld.lld\n',
    'append-with-lld-tight':'with-lld+=yes\n',
    'crlf-comment-continuation':'# ignored comment\\\r\nLD = ld.lld\n',
    'export-ld':'export LD = ld.lld\n',
    'export-with-lld':'export with-lld = yes\n',
    'unicode-separator':'LD\u00a0= ld.lld\n',
    'private-ld':'private LD = ld.lld\n',
    'unexport-ld':'unexport LD\n',
    'define-ld':'define LD\nld.lld\nendef\n',
    'conditional':'ifeq (yes,no)\nLD = ld.lld\nendif\n',
    'include':'include /arbitrary/not-read.mk\n',
    'eval':'other = $(eval LD = ld.lld)\n',
    'comment-continuation':'# ignored comment\\\nLD = ld.lld\n',
    'continuation':'other = ignored\\\nexport LD = ld.lld\n',
    'indirect-lhs':'name = LD\n$(name) = ld.lld\n',
    'target-specific':'target: LD = ld.lld\n',
    'indirect-with-lld':'with-lld = $(mode)\n',
    'with-lld-comment':'with-lld = no # ambiguous trailing whitespace\n',
   }
   if case in malformed:(f/'configparms').write_text(malformed[case])
   if case in ['admitted-include','admitted-include-replacement','cross-variant-include','admitted-include-symlink']:
    d=work/'baseline/debian';d.mkdir();(d/'testsuite-xfail-debian.mk').write_bytes((ROOT/'infra/postgres-glibc-ifunc-experiment/debian-xfail-authority.mk').read_bytes());(f/'configparms').write_text('include '+str(d/'testsuite-xfail-debian.mk')+'\n')
   if case=='cross-variant-include':
    (f/'configparms').write_text('include '+str(work/'candidate/debian/testsuite-xfail-debian.mk')+'\n')
   if case=='admitted-include-symlink':
    q=work/'baseline/debian/testsuite-xfail-debian.mk';q.rename(root/'include-alias');q.symlink_to(root/'include-alias')
   if case=='admitted-include-drift':
    d=work/'baseline/debian';d.mkdir();(d/'testsuite-xfail-debian.mk').write_text('LD = ld.lld\n');(f/'configparms').write_text('include '+str(d/'testsuite-xfail-debian.mk')+'\n')
   if case=='missing':(f/'configparms').unlink()
   if case=='symlink':(f/'config.log').unlink();(f/'config.log').symlink_to(root/'foreign');(root/'foreign').write_text('must-not-copy')
   if case=='hardlink':os.link(f/'config.make',root/'alias')
   if case=='wrong-kind':(f/'config.make').unlink();(f/'config.make').mkdir()
   if case=='unsafe-ld':(f/'config.make').write_text('with-lld = no\nLD = $(touch '+str(root/'marker')+')\n')
   if case=='override':(f/'configparms').write_text('with-lld = yes\nLD = x86_64-linux-gnu-ld\n')
   if case=='duplicate':(f/'config.make').write_text('with-lld = no\nwith-lld = yes\nLD = ld\n')
   snapshot={str(p):p.read_bytes()for p in work.rglob('*')if p.is_file()and not p.is_symlink()};calls=[]
   def identity(value,deadline):
    calls.append(value)
    if case=='admitted-include-replacement':
     q=work/'baseline/debian/testsuite-xfail-debian.mk';data=q.read_bytes();q.rename(root/'include-detached');q.write_bytes(data)
    if case=='replacement-during-probe':
     data=(f/'config.make').read_bytes();(f/'config.make').rename(root/'detached');(f/'config.make').write_bytes(data)
    if case=='probe-error':raise OSError('private diagnostic text must not escape')
    return dict(available=True,configured=value,resolved='/usr/bin/x86_64-linux-gnu-ld.bfd',bytes=100,sha256='1'*64,version='GNU ld 2.40',exit=0,observedAt='export-time-mock')
   if case=='unsafe-ld':identity=None
   result=M.collect(work,out,identity=identity)
   self.assertEqual(snapshot,{str(p):p.read_bytes()for p in work.rglob('*')if p.is_file()and not p.is_symlink()});self.assertFalse((root/'marker').exists());self.assertFalse(result['packageQualificationClaim']);self.assertEqual(json.loads((out/'build-profiles/summary.json').read_text()),result)
   if case in ['positive','override','admitted-include']:
    self.assertTrue(result['passed']);self.assertEqual(len(result['profiles']),3 if case=='positive'else 1)
    row=result['profiles'][0];self.assertEqual(row['configuredWithLld'],'no');self.assertEqual(row['configuredLd'],'ld');self.assertTrue(row['linker']['available']);self.assertFalse(row['makeEvaluationPerformed']);self.assertEqual(row['configurationWithOverrides'],{'with-lld':'yes' if case=='override' else 'no','LD':'x86_64-linux-gnu-ld' if case=='override' else 'ld'})
    if case=='override':self.assertEqual(row['configparmsOverrides'],{'with-lld':'yes','LD':'x86_64-linux-gnu-ld'});self.assertEqual(calls,['x86_64-linux-gnu-ld'])
    for row in result['profiles']:
     for name,pin in row['files'].items():
      data=(out/'build-profiles'/row['variant']/row['flavour']/name).read_bytes();self.assertEqual(hashlib.sha256(data).hexdigest(),pin['sha256']);self.assertEqual(len(data),pin['bytes'])
   else:self.assertFalse(result['passed'])
   if case=='probe-error':self.assertNotIn('private diagnostic',json.dumps(result))
 def test_relevant_assignment_lexical_matrix(self):
  for name in ['LD','with-lld']:
   value='ld.lld' if name=='LD' else 'yes'
   for operator in ['+=',':=','?=','!=','::=',':::=']:
    for separator in ['', ' ']:
     line=name+separator+operator+separator+value+'\n'
     with self.subTest(line=line):
      with self.assertRaises(ValueError):M.assignments(line.encode(),[])
   for prefix in ['export','override','private','unexport']:
    line=prefix+' '+name+' = '+value+'\n'
    with self.subTest(line=line):
     with self.assertRaises(ValueError):M.assignments(line.encode(),[])
   line='# ignored comment\\\r\n'+name+' = '+value+'\n'
   with self.subTest(line=line):
    with self.assertRaises(ValueError):M.assignments(line.encode(),[])
 def test_no_configurations_is_explicit_unavailable(self):
  with tempfile.TemporaryDirectory()as t:
   root=Path(t).resolve();(root/'work').mkdir();(root/'out').mkdir();r=M.collect(root/'work',root/'out',identity=lambda *a:None);self.assertFalse(r['passed']);self.assertEqual(r['profiles'],[])
for case in ['positive','missing','symlink','hardlink','wrong-kind','unsafe-ld','override','duplicate','probe-error','replacement-during-probe','unsupported-profile','export-ld','export-with-lld','private-ld','unexport-ld','define-ld','conditional','include','eval','continuation','indirect-lhs','target-specific','indirect-with-lld','with-lld-comment','admitted-include','admitted-include-drift','comment-continuation','unicode-separator','admitted-include-replacement','cross-variant-include','admitted-include-symlink','append-ld-tight','append-with-lld-tight','crlf-comment-continuation']:
 def run(self,case=case):self.exercise(case)
 setattr(ExportControls,'test_'+case.replace('-','_'),run)
if __name__=='__main__':unittest.main()
