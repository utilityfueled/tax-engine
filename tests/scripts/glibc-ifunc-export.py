"""Spec: spec/ops/glibc-ifunc-conditional-profile.yaml; inert source export controls."""
from pathlib import Path
import importlib.util,json,tempfile,unittest,os,hashlib
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('profiles',ROOT/'infra/postgres-glibc-ifunc-experiment/export-build-profiles.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
LOG="\n## ---------------- ##\n## Cache variables. ##\n## ---------------- ##\n\nlibc_cv_with_lld=no\n\n## ----------------- ##\n## Output variables. ##\n## ----------------- ##\n\nLD='ld'\n\n## ----------- ##\n## confdefs.h. ##\n## ----------- ##\n"
class ExportControls(unittest.TestCase):
 def exercise(self,case):
  with tempfile.TemporaryDirectory(prefix='glibc-profile-export-')as t:
   root=Path(t).resolve();work=root/'work';work.mkdir();out=root/'out';out.mkdir();f=work/'baseline/build-tree/amd64-libc';f.mkdir(parents=True)
   (f/'config.make').write_text('with-lld = no\nLD = ld\n');(f/'configparms').write_text('CFLAGS = -O2\n');(f/'config.log').write_text(LOG)
   if case=='no-ld-in-configmake':(f/'config.make').write_text('with-lld = no\n')
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
    'with-lld-unknown':'with-lld = maybe\n',
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
   if case in ['positive','no-ld-in-configmake','override','admitted-include']:
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
for case in ['no-ld-in-configmake','positive','missing','symlink','hardlink','wrong-kind','unsafe-ld','override','duplicate','probe-error','replacement-during-probe','unsupported-profile','export-ld','export-with-lld','private-ld','unexport-ld','define-ld','conditional','include','eval','continuation','indirect-lhs','target-specific','indirect-with-lld','with-lld-comment','with-lld-unknown','admitted-include','admitted-include-drift','comment-continuation','unicode-separator','admitted-include-replacement','cross-variant-include','admitted-include-symlink','append-ld-tight','append-with-lld-tight','crlf-comment-continuation']:
 def run(self,case=case):self.exercise(case)
 setattr(ExportControls,'test_'+case.replace('-','_'),run)
class DiagnosticControls(unittest.TestCase):
 def exercise(self,case):
  with tempfile.TemporaryDirectory(prefix='glibc-six-diagnostics-')as t:
   root=Path(t).resolve();work=root/'work';work.mkdir();out=root/'out';out.mkdir();source=work/'baseline/build-tree/amd64-libc';source.mkdir(parents=True)
   for name,data in {'config.make':'with-lld = no\nLD = ld\n','configparms':'CFLAGS = -O2\n','config.log':LOG}.items():(source/name).write_text(data)
   cases=['nptl/tst-create-detached','nptl/tst-robust8','rt/tst-cpuclock2','rt/tst-cputimer1','rt/tst-timer','support/tst-support_descriptors']
   fixed=[name+suffix for name in cases for suffix in ['.out','.test-result']]
   for name in fixed:
    f=source/name;f.parent.mkdir(exist_ok=True);f.write_text('original '+name+'\n')
   victim=source/fixed[0]
   if case=='missing':victim.unlink()
   if case=='symlink':victim.rename(root/'foreign');victim.symlink_to(root/'foreign')
   if case=='hardlink':os.link(victim,root/'alias')
   if case=='wrong-kind':victim.unlink();victim.mkdir()
   if case=='oversize-out':victim.write_bytes(b'x'*(1024*1024+1))
   if case=='oversize-result':(source/fixed[1]).write_bytes(b'x'*(64*1024+1))
   if case=='unavailable-config':(source/'config.make').unlink()
   (source/'nptl/not-selected.out').write_text('not selected')
   if case=='aggregate':
    second=work/'candidate/build-tree/amd64-libc';second.mkdir(parents=True)
    for f in source.rglob('*'):
     if f.is_file():d=second/f.relative_to(source);d.parent.mkdir(exist_ok=True);d.write_bytes(f.read_bytes())
   before={str(f):f.read_bytes()for f in work.rglob('*')if f.is_file()and not f.is_symlink()}
   oldcap=getattr(M,'DIAGNOSTIC_TOTAL_MAX',None)
   if case=='aggregate':M.DIAGNOSTIC_TOTAL_MAX=80
   def identity(value,deadline):
    if case=='replacement-during-probe':
     data=victim.read_bytes();victim.rename(root/'held');victim.write_bytes(data)
    if case=='bytes-during-probe':victim.write_text('externally changed')
    return dict(available=True,configured=value,resolved='/usr/bin/ld.bfd',bytes=100,sha256='1'*64,version='GNU ld2.40',exit=0,observedAt='export-time-mock')
   old_open=Path.open
   target_victim=out/'build-profiles/baseline/amd64-libc/test-diagnostics'/fixed[0]
   def wrapped_open(path,*args,**kwargs):
    stream=old_open(path,*args,**kwargs)
    if path==target_victim and args and args[0]=='xb':
     if case=='replacement-after-output-open':
      data=victim.read_bytes();victim.rename(root/'held-output-open');victim.write_bytes(data)
     if case=='hardlink-after-output-open':os.link(victim,root/'alias-output-open')
     if case=='partial-output':
      class Partial:
       def __enter__(self):return self
       def __exit__(self,*a):stream.close()
       def write(self,data):return stream.write(data[:len(data)//2])
      return Partial()
    return stream
   try:
    with patch.object(Path,'open',wrapped_open):r=M.collect(work,out,identity=identity)
   finally:
    if oldcap is not None:M.DIAGNOSTIC_TOTAL_MAX=oldcap
    elif hasattr(M,'DIAGNOSTIC_TOTAL_MAX'):del M.DIAGNOSTIC_TOTAL_MAX
   if case!='bytes-during-probe':self.assertEqual(before,{str(f):f.read_bytes()for f in work.rglob('*')if f.is_file()and not f.is_symlink()})
   self.assertEqual(r['passed'],case!='unavailable-config')
   self.assertIn('testDiagnostics',r['profiles'][0]);records=[]
   for row in r['profiles']:
    diag=row['testDiagnostics'];self.assertFalse(diag['testExecutionInferred']);self.assertFalse(diag['qualificationGate']);self.assertEqual(set(diag['files']),set(fixed));records.extend(diag['files'].values())
    self.assertNotIn('not-selected',json.dumps(diag))
    for name,item in diag['files'].items():
     target=out/'build-profiles'/row['variant']/row['flavour']/'test-diagnostics'/name
     if item.get('captured'):
      data=target.read_bytes();self.assertEqual(item['sha256'],hashlib.sha256(data).hexdigest());self.assertEqual(item['bytes'],len(data))
     else:self.assertFalse(target.exists())
   unavailable=[x for x in records if x['status']!='available']
   if case in ['positive','unavailable-config','replacement-during-probe','bytes-during-probe']:self.assertEqual(unavailable,[])
   else:self.assertGreater(len(unavailable),0)
   self.assertLessEqual(sum(x.get('bytes',0)for x in records),80 if case=='aggregate'else 16*1024*1024)
   if case=='bytes-during-probe':self.assertEqual((out/'build-profiles/baseline/amd64-libc/test-diagnostics'/fixed[0]).read_text(),'externally changed')
   if case=='partial-output':
    row=r['profiles'][0]['testDiagnostics']['files'][fixed[0]];self.assertTrue(row['captured']);self.assertFalse(row['captureComplete']);self.assertEqual(row['status'],'unavailable-output')
   self.assertEqual(r,json.loads((out/'build-profiles/summary.json').read_text()))
for case in ['positive','missing','symlink','hardlink','wrong-kind','oversize-out','oversize-result','aggregate','unavailable-config','replacement-during-probe','bytes-during-probe','replacement-after-output-open','hardlink-after-output-open','partial-output']:
 def run(self,case=case):self.exercise(case)
 setattr(DiagnosticControls,'test_diagnostic_'+case.replace('-','_'),run)

class ConfigLogControls(unittest.TestCase):
 def test_literal_config_log_with_target_no_ld_make(self):
  self.assertEqual(M.configuration_literals(b'with-lld = no\n',LOG.encode()),{'with-lld':'no','LD':'ld'})
  self.assertEqual(M.configuration_literals(b'with-lld = no\nLD = ld\n',LOG.encode()),{'with-lld':'no','LD':'ld'})
  self.assertEqual(M.configuration_literals(b'with-lld = no\n',LOG.replace('libc_cv_with_lld=no',"libc_cv_with_lld='no'").encode()),{'with-lld':'no','LD':'ld'})
  self.assertEqual(M.configuration_literals(b'with-lld = yes\n',LOG.replace('libc_cv_with_lld=no','libc_cv_with_lld=yes').encode()),{'with-lld':'yes','LD':'ld'})
 def test_reject_ambiguous_or_nonliteral_config_logs(self):
  rows={
   'missing-ld':LOG.replace("LD='ld'\n",''),
   'duplicate-ld':LOG.replace("LD='ld'","LD='ld'\nLD='ld'"),
   'export-ld':LOG.replace("LD='ld'","export LD='ld'"),
   'operator-ld':LOG.replace("LD='ld'","LD+='ld'"),
   'unquoted-ld':LOG.replace("LD='ld'","LD=ld"),
   'double-quoted-ld':LOG.replace("LD='ld'",'LD="ld"'),
   'command-substitution':LOG.replace("LD='ld'","LD='$(touch marker)'"),
   'backtick':LOG.replace("LD='ld'","LD='`touch marker`'"),
   'shell-tail':LOG.replace("LD='ld'","LD='ld'; touch marker"),
   'cache-in-output':LOG.replace("LD='ld'","LD='ld'\nlibc_cv_with_lld='no'"),
   'ld-in-cache':LOG.replace('libc_cv_with_lld=no',"libc_cv_with_lld=no\nLD='ld'"),
   'arguments':LOG.replace("LD='ld'","LD='ld --version'"),
   'multiline':LOG.replace("LD='ld'","LD='ld\nother'"),
   'continuation':LOG.replace("LD='ld'","LD='l\\\nd'"),
   'crlf':LOG.replace('\n','\r\n'),
   'unicode-separator':LOG.replace("LD='ld'","LD\u00a0='ld'"),
   'missing-cache':LOG.replace('libc_cv_with_lld=no\n',''),
   'unknown-cache':LOG.replace('libc_cv_with_lld=no','libc_cv_with_lld=maybe'),
   'duplicate-cache':LOG.replace('libc_cv_with_lld=no','libc_cv_with_lld=no\nlibc_cv_with_lld=no'),
   'prefixed-cache':LOG.replace('libc_cv_with_lld=no','export libc_cv_with_lld=no'),
   'multiline-cache':LOG.replace('libc_cv_with_lld=no',"libc_cv_with_lld='n\no'"),
   'missing-output-section':LOG.replace('## Output variables. ##','## Other variables. ##'),
   'duplicate-output-section':LOG+LOG,
   'unknown-output-statement':LOG.replace("LD='ld'","LD='ld'\n$(touch marker)"),
   'unknown-cache-statement':LOG.replace('libc_cv_with_lld=no','libc_cv_with_lld=no\neval bad'),
  }
  for label,value in rows.items():
   with self.subTest(label=label):
    with self.assertRaises(ValueError):M.configuration_literals(b'with-lld = no\n',value.encode())
  for data in [b'with-lld = yes\n',b'with-lld = no\nLD = ld.lld\n',b'with-lld = maybe\n',b'LD = ld\n']:
   with self.subTest(make=data):
    with self.assertRaises(ValueError):M.configuration_literals(data,LOG.encode())

if __name__=='__main__':unittest.main()
