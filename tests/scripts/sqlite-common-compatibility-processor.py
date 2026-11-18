"""Spec: spec/ops/sqlite-combined-common-compatibility.yaml and spec/ops/sqlite-nested-rowid-compatibility.yaml; real processor controls."""
from pathlib import Path
import copy,hashlib,importlib.util,json,os,tempfile,unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('combined_compat',ROOT/'infra/postgres-sqlite-backport/apply-compatibility.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
REAL=json.loads((ROOT/'infra/postgres-sqlite-backport/compatibility-changes.json').read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
def identity_inputs(source):
    rows=copy.deepcopy(REAL['unchangedSourceRequirements'])
    for row in rows:
        value=b'unchanged-join8-original\n';row['sha256']=sha(value);target=source/row['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(value)
    return rows

class ProcessorControls(unittest.TestCase):
    def test_exact_combined_manifest_and_honest_provenance(self):
        self.assertEqual(REAL['schema'],2)
        self.assertEqual(len(REAL['changes']),21)
        self.assertEqual(len(M.PATHS),21)
        self.assertNotIn('test/fuzzinvariants.c',M.PATHS)
        io=next(r for r in REAL['changes']if r['path']=='test/io.test')
        self.assertEqual(io['provenance']['kind'],'local-source-derived-oracle')
        self.assertNotIn('upstreamCommit',io)

    def exercise(self,case):
        with tempfile.TemporaryDirectory(prefix='sqlite-combined-controls-')as tmp:
            root=Path(tmp).resolve();source=root/'source';source.mkdir();inputs=root/'inputs';inputs.mkdir();rows=copy.deepcopy(REAL['changes']);guards=identity_inputs(source)
            for i,row in enumerate(rows):
                a=f'before-{i}\n'.encode();b=f'after-{i}\n'.encode();row.update(beforeSha256=sha(a),afterSha256=sha(b),hunks=[dict(before=a.decode(),after=b.decode())]);f=source/row['path'];f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(a)
            last=source/rows[-1]['path'];record=root/'receipt.json'
            if case=='identity-changed':(source/'test/join8.test').write_text('altered')
            if case=='identity-missing':(source/'test/join8.test').unlink()
            if case=='identity-alias':os.link(source/'test/join8.test',root/'alias')
            if case=='changed':last.write_text('altered')
            if case=='alias':os.link(last,root/'alias')
            if case=='symlink':last.unlink();last.symlink_to(root/'missing')
            if case=='wrong-kind':last.unlink();last.mkdir()
            if case=='result-hash':rows[-1]['afterSha256']='0'*64
            if case=='extra-path':rows.append(dict(rows[0],path='foreign'))
            if case=='missing-path':rows.pop()
            if case=='duplicate-path':rows[-1]['path']=rows[0]['path']
            if case=='duplicate-hunk':rows[-1]['hunks']*=2
            if case=='provenance':rows[-1].pop('provenance',None);rows[-1].pop('upstreamCommit',None)
            if case=='record-exists':record.write_text('existing receipt')
            if case=='record-dangling':record.symlink_to(root/'missing-record')
            if case=='parent-symlink':
                actual=root/'actual-parent';actual.mkdir();alias=root/'parent';alias.symlink_to(actual,target_is_directory=True);record=alias/'receipt.json'
            data=dict(schema=1 if case=='schema'else 2,changes=rows,unchangedSourceRequirements=guards);(inputs/'compatibility-changes.json').write_text(json.dumps(data));prior=M.E;M.E=inputs
            snapshot={p:p.read_bytes()for p in source.rglob('*')if p.is_file()and not p.is_symlink()}
            try:
                if case in('pass','repeat'):
                    result=M.apply(source,record);self.assertTrue(result['commonPrerequisitesAppliedBeforeCveSplit']);self.assertFalse(result['originalBaselineUnmodified']);self.assertFalse(result['packageQualificationClaim']);self.assertEqual(len(result['files']),21)
                    self.assertEqual(next(r for r in result['files']if r['path']=='test/io.test')['provenance']['kind'],'local-source-derived-oracle')
                    if case=='pass':self.assertEqual((source/'test/join8.test').read_bytes(),b'unchanged-join8-original\n')
                    if case=='repeat':
                        with self.assertRaises(AssertionError):M.apply(source,root/'second.json')
                else:
                    with self.assertRaises((AssertionError,FileExistsError,FileNotFoundError,IsADirectoryError,OSError,KeyError)):M.apply(source,record)
                    self.assertTrue(all(p.read_bytes()==v for p,v in snapshot.items()),case)
                    if case not in('record-exists','record-dangling'):self.assertFalse(record.exists(),case)
            finally:M.E=prior

    def custody_boundary(self,case):
        with tempfile.TemporaryDirectory(prefix='sqlite-custody-boundary-')as tmp:
            root=Path(tmp).resolve();source=root/'source';source.mkdir();inputs=root/'inputs';inputs.mkdir();rows=copy.deepcopy(REAL['changes']);guards=identity_inputs(source)
            for i,row in enumerate(rows):
                a=f'before-{i}\n'.encode();b=f'after-{i}\n'.encode();row.update(beforeSha256=sha(a),afterSha256=sha(b),hunks=[dict(before=a.decode(),after=b.decode())]);p=source/row['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(a)
            (inputs/'compatibility-changes.json').write_text(json.dumps(dict(schema=2,changes=rows,unchangedSourceRequirements=guards)))
            record=root/'receipt.json';first=source/rows[0]['path'];last=source/rows[-1]['path'];alias=root/'alias';detached=root/'detached';injected=[];syncs=[]
            target=first if case=='final-earlier-replacement'else last
            original=target.read_bytes();real_open=os.open;real_fsync=os.fsync;prior=M.E;M.E=inputs
            def mutate():
                if 'replacement'in case:target.rename(detached);target.write_bytes(original)
                elif 'hardlink'in case:os.link(target,alias)
                elif 'symlink'in case:target.rename(detached);target.symlink_to(detached)
                else:target.write_bytes(b'concurrent-change\n')
                injected.append(case)
            def injecting_open(path,flags,*args,**kwargs):
                fd=real_open(path,flags,*args,**kwargs)
                if Path(path)==record and case.startswith('reservation-'):mutate()
                return fd
            def injecting_fsync(fd):
                real_fsync(fd)
                syncs.append(fd)
                if case.startswith('before-last-')and len(syncs)==1:mutate()
                if case.startswith('during-last-')and len(syncs)==len(rows):mutate()
                if case=='final-earlier-replacement'and len(syncs)==2:mutate()
            M.os.open=injecting_open;M.os.fsync=injecting_fsync
            try:
                with self.assertRaises((AssertionError,OSError)):M.apply(source,record)
                self.assertEqual(injected,[case]);receipt=json.loads(record.read_text());self.assertIs(receipt['passed'],False);self.assertIs(receipt['sourceWriteMayBePartial'],True);self.assertIs(receipt['packageQualificationClaim'],False)
                if case.startswith('reservation-'):
                    self.assertEqual(receipt['filesStarted'],[]);self.assertEqual(receipt['filesWritten'],[])
                    for row in rows[:-1]:self.assertEqual((source/row['path']).read_bytes(),f"before-{rows.index(row)}\n".encode())
                    if detached.exists():self.assertEqual(detached.read_bytes(),original)
                    if alias.exists():self.assertEqual(alias.read_bytes(),original)
                else:self.assertTrue(receipt['filesStarted'])
                if case.startswith('during-last-'):self.assertNotIn(rows[-1]['path'],receipt['filesWritten'])
            finally:M.os.open=real_open;M.os.fsync=real_fsync;M.E=prior

def control(case):
    def run(self):self.exercise(case)
    return run
for scenario in ['identity-changed','identity-missing','identity-alias','pass','changed','alias','repeat','result-hash','extra-path','missing-path','duplicate-path','symlink','wrong-kind','duplicate-hunk','schema','provenance','record-exists','record-dangling','parent-symlink']:
    setattr(ProcessorControls,'test_'+scenario.replace('-','_'),control(scenario))
def custody_control(case):
    def run(self):self.custody_boundary(case)
    return run
for scenario in ['reservation-replacement','reservation-hardlink','reservation-symlink','reservation-bytes','before-last-replacement','before-last-hardlink','before-last-bytes','during-last-replacement','during-last-hardlink','during-last-bytes','final-earlier-replacement']:
    setattr(ProcessorControls,'test_custody_'+scenario.replace('-','_'),custody_control(scenario))
if __name__=='__main__':unittest.main()
