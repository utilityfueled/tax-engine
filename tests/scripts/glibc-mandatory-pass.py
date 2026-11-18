"""Spec: spec/ops/glibc-six-mandatory-pass.yaml. Synthetic boundary controls only."""
import copy,hashlib,importlib.util,json,os,struct,subprocess,sys,tempfile,time,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
AUTH=json.loads((ROOT/'infra/postgres-glibc-mandatory-pass/authority.json').read_text())
BASELINE='--baseline' in sys.argv
if BASELINE:sys.argv.remove('--baseline')
else:
 spec=importlib.util.spec_from_file_location('mandatory',ROOT/'infra/postgres-glibc-mandatory-pass/profile.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
def digest(b):return hashlib.sha256(b).hexdigest()
def elf(kind):
 b=bytearray(64);b[:16]=b'\x7fELF\x02\x01\x01'+bytes(9);struct.pack_into('<HHIQQQIHHHHHH',b,16,kind,62,1,0,0,0,0,64,0,0,0,0,0);return bytes(b)
class Contract(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve();self.work=self.root/'work';self.out=self.root/'out';self.work.mkdir();self.out.mkdir()
  mapping={'nptl/tst-create-detached':'sysdeps/pthread/tst-create-detached.c','nptl/tst-robust8':'sysdeps/pthread/tst-robust8.c','rt/tst-cpuclock2':'rt/tst-cpuclock2.c','rt/tst-cputimer1':'rt/tst-cputimer1.c','rt/tst-timer':'sysdeps/pthread/tst-timer.c','support/tst-support_descriptors':'support/tst-support_descriptors.c'}
  examples=json.loads((ROOT/'tests/fixtures/glibc-mandatory-pass/positive-output.json').read_text())
  for variant in ['baseline','candidate']:
   src=self.work/variant;build=src/'build-tree/amd64-libc';build.mkdir(parents=True);dest=self.out/variant;dest.mkdir()
   for name,row in AUTH['sources'].items():p=src/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(row['text'])
   for name in ['config.h','libc-modules.h']:(build/name).write_text('/* synthetic existing generated header; not native proof */\n')
   commands=[];prefix=f'/qualification-work/{variant}/build-tree/amd64-libc/'
   for case in AUTH['cases']:
    name=case.split('/')[-1];obj=prefix+case+'.o';binary=prefix+case;source=mapping[case]
    for suffix,data in [('',elf(3)),('.o',elf(1)),('.out',examples[case].encode()),('.test-result',f'PASS: {case}\noriginal exit status 0\n'.encode())]:p=build/(case+suffix);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    deps=[source,'build-tree/amd64-libc/config.h','build-tree/amd64-libc/libc-modules.h','include/libc-symbols.h']+(['rt/tst-timer4.c']if case=='rt/tst-cputimer1'else[])
    (build/(case+'.o.d')).write_text(obj+': '+ ' '.join(f'/qualification-work/{variant}/'+x for x in deps)+'\n')
    inp='../'+source if source.startswith('sysdeps/')else name+'.c'
    commands.extend([f'x86_64-linux-gnu-gcc-12 -Wl,--hash-style=both {inp} -c -include {prefix}libc-modules.h -include ../include/libc-symbols.h -o {obj} -MD -MP -MF {obj}.dt -MT {obj}',f'x86_64-linux-gnu-gcc-12 -o {binary} {obj} {prefix}libc.so',f'env LC_ALL=C {prefix}elf/ld-linux-x86-64.so.2 --library-path {prefix} {binary} > {binary}.out 2>&1',f'../scripts/evaluate-test.sh {case} $? false false > {binary}.test-result'])
   (dest/'package-build.log').write_text('\n'.join(commands)+'\n');(dest/'suite-paths.txt').write_text('build-tree/amd64-libc/tests.sum\nbuild-tree/amd64-i386/tests.sum\n');(dest/'amd64-libc-tests.sum').write_text(''.join(f'PASS: {c}\n'for c in AUTH['cases']));(dest/'source-files.sha256').write_text(''.join(f'{r["sha256"]}  ./{n}\n'for n,r in AUTH['sources'].items()))
 def admission(self):
  if BASELINE:
   # Invoke the real old gate, never a rewritten imitation. It has no new held-
   # object/header/command admission and therefore exposes meaningful RED gaps.
   script="import {assertSuiteSummary} from './scripts/build-postgres-glibc-backport.mjs';import{readFileSync}from'node:fs';assertSuiteSummary(readFileSync(process.argv[1],'utf8'),{requireRegression:false});"
   node=Path.cwd()/'.local/upgrade-evidence/nov12-runtime-security-refresh/node-v26.13.1-darwin-arm64/bin/node'
   r=subprocess.run([str(node),'--input-type=module','-e',script,str(self.out/'baseline/amd64-libc-tests.sum')],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   if r.returncode:raise ValueError('old summary gate rejected')
   return True
  return M.verify(self.out,AUTH)
 def capture(self,**kwargs):
  if BASELINE:return None
  return M.capture(self.work,self.out,time.monotonic()+6,{'remaining':16*1024*1024,'reserved':0},AUTH,**kwargs)
 def test_complete_synthetic_held_bytes(self):
  if not BASELINE:self.assertTrue(self.capture()['passed'])
  self.assertTrue(self.admission())
 def test_original_xpass_not_requalified(self):
  if not BASELINE:self.capture()
  (self.out/'baseline/amd64-libc-tests.sum').write_text(''.join(f'XPASS: {c}\n'for c in AUTH['cases']))
  with self.assertRaises((ValueError,AssertionError,OSError)):self.admission()
 def mutate(self,case,kind):
  if not BASELINE:self.assertTrue(self.capture()['passed'])
  folder=self.out/'mandatory-pass/baseline';build=self.work/'baseline/build-tree/amd64-libc'
  if kind=='binary':p=folder/case;p.write_bytes(p.read_bytes()+b'drift')if not BASELINE else None
  elif kind=='object':p=folder/(case+'.o');p.write_bytes(p.read_bytes()+b'drift')if not BASELINE else None
  elif kind=='header':
   if not BASELINE:(folder/'config.h').write_text('drift')
  elif kind=='dependency':
   if not BASELINE:(folder/(case+'.o.d')).write_text('wrong.c: wrong-header\n')
  elif kind=='commands':(self.out/'baseline/package-build.log').write_text('same summary but no commands\n')
  elif kind=='source':(self.out/'baseline/source-files.sha256').write_text('altered source\n')
  elif kind=='status':(self.out/'baseline/amd64-libc-tests.sum').write_text(''.join(f'UNSUPPORTED: {c}\n'for c in AUTH['cases']))
  elif kind=='duplicate':p=self.out/'baseline/amd64-libc-tests.sum';p.write_text(p.read_text()+f'PASS: {case}\n')
  elif kind=='missing-output':
   if not BASELINE:(folder/(case+'.out')).unlink()
  elif kind=='exit':
   if not BASELINE:(folder/(case+'.test-result')).write_text(f'PASS: {case}\noriginal exit status 1\n')
  elif kind=='elf-with-repin':
   if not BASELINE:
    p=folder/case;b=bytearray(p.read_bytes());b[18:20]=b'\x03\x00';p.write_bytes(b);self.repin(p)
  elif kind=='skip-with-repin':
   if not BASELINE:
    p=folder/(case+'.out');p.write_text('unsupported stub missing, skipping test\n');self.repin(p)
  with self.assertRaises((ValueError,AssertionError,OSError)):self.admission()
 def repin(self,path):
  p=self.out/'mandatory-pass/summary.json';r=json.loads(p.read_text());name=str(path.relative_to(self.out/'mandatory-pass'));r['files'][name]={'bytes':path.stat().st_size,'sha256':digest(path.read_bytes())};p.write_text(json.dumps(r))
class CollectorBoundaries(unittest.TestCase):
 setUp=Contract.setUp
 capture=Contract.capture
 admission=Contract.admission
 @unittest.skipIf(BASELINE,'new collector boundary; old behavioral RED retained separately')
 def test_expired_shared_deadline(self):
  r=M.capture(self.work,self.out,time.monotonic()-1,{'remaining':16*1024*1024,'reserved':0},AUTH);self.assertFalse(r['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_prior_exports_consume_shared_budget(self):
  r=M.capture(self.work,self.out,time.monotonic()+6,{'remaining':1,'reserved':16*1024*1024-1},AUTH);self.assertFalse(r['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_oversized_binary(self):
  (self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8').write_bytes(bytes(1024*1024+1));self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_binary_hardlink(self):
  os.link(self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8',self.work/'alias');self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_binary_symlink(self):
  p=self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8';q=self.work/'real';p.rename(q);p.symlink_to(q);self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_actual_body_altered_before_capture(self):
  p=self.work/'baseline/sysdeps/pthread/tst-robust8.c';p.write_text(p.read_text()+'/* altered */');self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_inode_replacement_after_read(self):
  original=M.held;changed=False
  def wrapped(path,*args,**kwargs):
   nonlocal changed
   data=original(path,*args,**kwargs)
   if str(path).endswith('/nptl/tst-robust8.o')and not changed:
    changed=True;p=Path(path);q=p.with_suffix('.replacement');q.write_bytes(p.read_bytes());q.replace(p)
   return data
  M.held=wrapped
  try:self.assertFalse(self.capture()['passed'])
  finally:M.held=original
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_deadline_exhausted_during_copies(self):
  original=M.time;calls=0
  class Clock:
   @staticmethod
   def monotonic():
    nonlocal calls
    calls+=1;return 0 if calls<45 else 7
  M.time=Clock
  try:
   r=M.capture(self.work,self.out,6,{'remaining':16*1024*1024,'reserved':0},AUTH);self.assertFalse(r['passed']);self.assertGreater(len(r['files']),0)
  finally:M.time=original
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_bad_native_elf_before_capture(self):
  (self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8').write_bytes(b'not ELF');self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_xfail_true_evaluator_command(self):
  p=self.out/'baseline/package-build.log';p.write_text(p.read_text().replace('$? false false','$? true false'));self.assertFalse(self.capture()['passed'])
 def pair(self):
  for variant in ['baseline','candidate']:
   for case in AUTH['cases']:
    p=self.work/variant/'build-tree/amd64-libc'/(case+'.o.d');p.with_suffix('.dt').write_bytes(p.read_bytes())
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_dt_only_raw_compiler_form(self):
  for variant in ['baseline','candidate']:
   for case in AUTH['cases']:
    p=self.work/variant/'build-tree/amd64-libc'/(case+'.o.d');p.rename(p.with_suffix('.dt'))
  self.assertTrue(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_both_equivalent_forms_are_held_and_charged(self):
  self.pair()
  for variant in ['baseline','candidate']:
   prefix=f'/qualification-work/{variant}/build-tree/amd64-libc/'
   for case in AUTH['cases']:
    p=self.work/variant/'build-tree/amd64-libc'/(case+'.o.d');p.write_text(p.read_text().replace(prefix,'$(common-objpfx)'))
  r=self.capture();self.assertTrue(r['passed'])
  if not BASELINE:
   for variant in ['baseline','candidate']:
    for case in AUTH['cases']:
     for suffix in ['.o.d','.o.dt']:self.assertIn(variant+'/'+case+suffix,r['files'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_disagreeing_d_is_not_ignored_when_dt_valid(self):
  self.pair();p=self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8.o.d';p.write_text(p.read_text().replace('include/libc-symbols.h','include/wrong-header.h'));self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_malformed_d_is_not_ignored_when_dt_valid(self):
  self.pair();p=self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8.o.d';p.write_text('$(shell arbitrary): nope\n');self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_malformed_dt_never_falls_back_to_valid_d(self):
  self.pair();p=self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8.o.dt';p.write_text('$(shell arbitrary): nope\n');self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_missing_both_dependency_forms(self):
  (self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8.o.d').unlink();self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'fixed dependency pair control')
 def test_aliased_dependency_pair(self):
  p=self.work/'baseline/build-tree/amd64-libc/nptl/tst-robust8.o.d';os.link(p,p.with_suffix('.dt'));self.assertFalse(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'actual retained dependency lifecycle control')
 def test_final_postbuild_dependency_with_literal_common_prefix(self):
  for variant in ['baseline','candidate']:
   prefix=f'/qualification-work/{variant}/build-tree/amd64-libc/'
   for case in AUTH['cases']:
    p=self.work/variant/'build-tree/amd64-libc'/(case+'.o.d');p.write_text(p.read_text().replace(prefix,'$(common-objpfx)'))
  self.assertTrue(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new finite dependency spelling control')
 def test_relative_original_dependency_spelling(self):
  for variant in ['baseline','candidate']:
   prefix=f'/qualification-work/{variant}/'
   for case,source in M.SOURCES.items():
    p=self.work/variant/'build-tree/amd64-libc'/(case+'.o.d');text=p.read_text();local='../'+source if source.startswith('sysdeps/')else case.split('/')[-1]+'.c';text=text.replace(prefix+source,local).replace(prefix+'include/libc-symbols.h','../include/libc-symbols.h').replace(prefix+'rt/tst-timer4.c','tst-timer4.c');p.write_text(text)
  self.assertTrue(self.capture()['passed'])
 @unittest.skipIf(BASELINE,'new collector boundary')
 def test_dependency_missing_included_timer4(self):
  p=self.work/'baseline/build-tree/amd64-libc/rt/tst-cputimer1.o.d';p.write_text(p.read_text().replace('/qualification-work/baseline/rt/tst-timer4.c',''));self.assertFalse(self.capture()['passed'])

class ExportIntegration(unittest.TestCase):
 setUp=Contract.setUp
 @unittest.skipIf(BASELINE,'new optional collector integration')
 def test_optional_profile_uses_existing_exports_and_shared_budget(self):
  module_path=ROOT/'infra/postgres-glibc-ifunc-experiment/export-build-profiles.py';spec=importlib.util.spec_from_file_location('export',module_path);E=importlib.util.module_from_spec(spec);spec.loader.exec_module(E)
  template=ROOT/'tests/scripts/glibc-ifunc-export.py';spec=importlib.util.spec_from_file_location('retained_export_controls',template);T=importlib.util.module_from_spec(spec);spec.loader.exec_module(T)
  authority=(ROOT/'infra/postgres-glibc-mandatory-pass/mandatory-xfail-authority.mk').read_bytes()
  for variant in ['baseline','candidate']:
   source=self.work/variant;build=source/'build-tree/amd64-libc';(source/'debian').mkdir();(source/'debian/testsuite-xfail-debian.mk').write_bytes(authority)
   (build/'config.make').write_text('with-lld = no\nLD = ld\n');(build/'config.log').write_text(T.LOG);(build/'configparms').write_text('include '+str(source/'debian/testsuite-xfail-debian.mk')+'\n')
  seen=[]
  def identity(value,deadline):seen.append(deadline);return {'available':True,'configured':value,'exit':0}
  start=time.monotonic();result=E.collect(self.work,self.out,identity=identity,mandatory_profile=ROOT/'infra/postgres-glibc-mandatory-pass/profile.py');self.assertTrue(result['passed']);self.assertEqual(len(seen),2);self.assertEqual(seen[0],seen[1]);self.assertLessEqual(seen[0],start+6.01)
  r=result['mandatoryPass'];self.assertGreater(r['priorDiagnosticReservedBytes'],0);self.assertEqual(r['reservedAggregateBytes'],result['diagnosticLimits']['reservedBytes']);self.assertLessEqual(r['reservedAggregateBytes'],16*1024*1024)
  for variant in ['baseline','candidate']:
   for case in AUTH['cases']:self.assertEqual((self.out/'build-profiles'/variant/'amd64-libc/test-diagnostics'/(case+'.out')).read_bytes(),(self.out/'mandatory-pass'/variant/(case+'.out')).read_bytes())

KNOWN_SKIPS={
 'nptl/tst-robust8':['mutexattr_init failed\n','cannot support pshared robust mutexes\n','cannot support pshared robust PI mutexes\n'],
 'rt/tst-cpuclock2':['timer_create: unsupported\nNo support for CPU clocks with good semantics, skipping test\n','clock_nanosleep not supported for live thread CPU clock: unsupported\n','clock_nanosleep not supported for self thread CPU clock: unsupported\n','pthread_getcpuclockid does not support other threads\n'],
 'rt/tst-cputimer1':['timer_create: unsupported\nprocess CPU clock timer support missing, skipping test\n','process clocks missing, skipping test\n'],
}
def known_skip(self,case,text):
 if BASELINE:self.skipTest('new exact skip-message admission control')
 (self.work/'baseline/build-tree/amd64-libc'/(case+'.out')).write_text(text);self.assertFalse(self.capture()['passed'])
for case,messages in KNOWN_SKIPS.items():
 for index,message in enumerate(messages):setattr(CollectorBoundaries,'test_skip_'+case.replace('/','_').replace('-','_')+str(index),lambda self,c=case,t=message:known_skip(self,c,t))

for case in AUTH['cases']:
 for kind in ['binary','object','header','dependency','commands','source','status','duplicate','missing-output','exit','elf-with-repin','skip-with-repin']:
  setattr(Contract,'test_'+case.replace('/','_').replace('-','_')+'_'+kind.replace('-','_'),lambda self,c=case,k=kind:self.mutate(c,k))
class ReplayFileCaps(unittest.TestCase):
 setUp=Contract.setUp
 capture=Contract.capture
 admission=Contract.admission
 def repin_and_rebudget(self,path):
  p=self.out/'mandatory-pass/summary.json';r=json.loads(p.read_text());name=str(path.relative_to(self.out/'mandatory-pass'));r['files'][name]={'bytes':path.stat().st_size,'sha256':digest(path.read_bytes())};r['reservedAggregateBytes']=sum(x['bytes']for x in r['files'].values())+r['priorDiagnosticReservedBytes']+r['summaryReservationBytes'];p.write_text(json.dumps(r))
 def test_replay_oversized_legal_dependency(self):
  self.assertTrue(self.capture()['passed']);p=self.out/'mandatory-pass/baseline/nptl/tst-robust8.o.d';p.write_bytes(p.read_bytes().rstrip(b'\n')+b' '*65536+b'\n');self.repin_and_rebudget(p)
  with self.assertRaises(ValueError):self.admission()
 def test_replay_oversized_generated_header(self):
  self.assertTrue(self.capture()['passed']);p=self.out/'mandatory-pass/baseline/config.h';p.write_bytes(b' '*65537);self.repin_and_rebudget(p)
  with self.assertRaises(ValueError):self.admission()
 def pad_commands(self):
  p=self.out/'baseline/package-build.log';lines=p.read_text().splitlines();lines[0]+=' -DLEGAL_PADDING='+('A'*65536);p.write_text('\n'.join(lines)+'\n')
 def test_capture_oversized_bound_commands(self):
  self.pad_commands();self.assertFalse(self.capture()['passed'])
 def test_replay_oversized_bound_commands(self):
  self.assertTrue(self.capture()['passed']);self.pad_commands();record,_=M.commands(self.out/'baseline/package-build.log','baseline');p=self.out/'mandatory-pass/baseline/commands.json';p.write_text(json.dumps(record,sort_keys=True)+'\n');self.repin_and_rebudget(p)
  with self.assertRaises(ValueError):self.admission()

if __name__=='__main__':unittest.main()
