"""Apply pinned common prerequisites before splitting vulnerable/CVE source variants."""
from pathlib import Path
import argparse,hashlib,json,os,stat

E=Path(__file__).resolve().parent
PATHS={'src/test_config.c','test/join8.test','ext/recover/sqlite3recover.c'}
sha=lambda b:hashlib.sha256(b).hexdigest()

def transform(data, row):
    assert sha(data)==row['beforeSha256'], 'original-source-hash'
    value=data.decode('utf8')
    for hunk in row['hunks']:
        assert value.count(hunk['before'])==1, 'unique-official-hunk'
        value=value.replace(hunk['before'],hunk['after'],1)
    result=value.encode('utf8')
    assert sha(result)==row['afterSha256'], 'expected-upstream-result'
    return result

def apply(source,record):
    source=Path(source)
    assert source.is_dir() and source.resolve()==source.absolute(), 'canonical-source'
    assert not Path(record).exists(), 'fresh-record'
    manifest=json.loads((E/'compatibility-changes.json').read_text())
    assert manifest['schema']==1, 'compatibility-schema'
    rows=manifest['changes']
    assert len(rows)==3 and {r['path']for r in rows}==PATHS, 'exact-three-paths'
    prepared=[]
    for row in rows:
        p=source/row['path'];s=p.lstat()
        assert p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_nlink==1, 'regular-source'
        prepared.append((p,s,transform(p.read_bytes(),row),row))
    # All input identities/hashes are checked before the first write. Failures
    # retain this common prerequisite tree; no candidate split has occurred.
    for p,s,value,row in prepared:
        fd=os.open(p,os.O_WRONLY|os.O_NOFOLLOW)
        try:
            q=os.fstat(fd)
            assert (q.st_dev,q.st_ino,q.st_size)==(s.st_dev,s.st_ino,s.st_size), 'stable-source'
            os.ftruncate(fd,0)
            with os.fdopen(fd,'wb',closefd=False) as f:f.write(value);f.flush();os.fsync(fd)
        finally:os.close(fd)
        assert sha(p.read_bytes())==row['afterSha256'], 'written-source'
    receipt={'passed':True,'selectedPaths':sorted(PATHS),'files':[{k:r[k]for k in ['path','beforeSha256','afterSha256','upstreamCommit']}for r in rows], 'commonPrerequisitesAppliedBeforeCveSplit':True,'originalBaselineUnmodified':False,'oomHistoricalCauseProven':False,'packageQualificationClaim':False}
    with open(record,'x')as f:json.dump(receipt,f,indent=2);f.write('\n')
    return receipt

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--record',required=True);a=p.parse_args()
    apply(a.source,a.record)
