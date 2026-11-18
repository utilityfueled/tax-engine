"""Apply exact common compatibility inputs before splitting vulnerable/CVE variants."""
from pathlib import Path
import argparse,hashlib,json,os,re,stat

E=Path(__file__).resolve().parent
PATHS=frozenset({'src/test_config.c','test/join8.test','ext/recover/sqlite3recover.c','src/build.c','src/ctime.c','src/global.c','src/main.c','src/resolve.c','src/select.c','src/shell.c.in','src/sqlite.h.in','src/sqliteInt.h','test/join5.test','test/misc2.test','test/misc8.test','test/returning1.test','test/rowid.test','test/trigger9.test','tool/mkctimec.tcl','test/io.test'})
ORIGINAL_PATHS={'src/test_config.c','test/join8.test','ext/recover/sqlite3recover.c'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def digest(value):
    return isinstance(value,str)and re.fullmatch('[0-9a-f]{64}',value) is not None

def provenance(row):
    path=row['path']
    if path in ORIGINAL_PATHS:
        assert re.fullmatch('[0-9a-f]{40}',row.get('upstreamCommit',''))and digest(row.get('authorityResponseSha256')), 'original-upstream-provenance'
        return {k:row[k]for k in ['upstreamCommit','authorityResponseSha256']}
    value=row.get('provenance');assert isinstance(value,dict),'explicit-provenance'
    if path=='test/io.test':
        assert value.get('kind')=='local-source-derived-oracle'and 'upstreamCommit'not in row,'local-oracle-provenance'
        assert value.get('upstreamCommitClaim')is False and value.get('nativePackageQualification')is False,'local-oracle-no-upstream-claim'
        assert value.get('derivation')and value.get('sourceReferences')and digest(value.get('debianPatchSha256')),'local-oracle-source-basis'
        assert all(isinstance(r,dict)and r.get('path')and digest(r.get('sha256'))for r in value['sourceReferences']),'local-oracle-source-hashes'
    else:
        assert value.get('kind')=='adapted-upstream'and value.get('nativePackageQualification')is False,'adapted-upstream-provenance'
        commits=value.get('officialGitMirrorCommits');assert isinstance(commits,list)and commits and len(commits)==len(set(commits)),'official-commits'
        assert all(re.fullmatch('[0-9a-f]{40}',v)for v in commits),'official-commit-hashes'
        assert value.get('officialUrls')==['https://github.com/sqlite/sqlite/commit/'+v for v in commits],'official-urls'
    return {'provenance':value}

def transform(data,row):
    assert digest(row['beforeSha256'])and digest(row['afterSha256']),'source-digest-shape'
    assert sha(data)==row['beforeSha256'],'original-source-hash'
    value=data.decode('utf8');hunks=row['hunks'];assert isinstance(hunks,list)and hunks,'nonempty-hunks'
    for hunk in hunks:
        before=hunk['before'];after=hunk['after']
        assert isinstance(before,str)and before and isinstance(after,str)and before!=after,'nonempty-changing-hunk'
        assert value.count(before)==1,'unique-official-or-derived-hunk'
        value=value.replace(before,after,1)
    result=value.encode('utf8');assert sha(result)==row['afterSha256'],'expected-result'
    return result

def verify_custody(path,fd,identity,expected,expected_sha):
    # The build tree requires exclusive ownership. These boundary checks detect
    # observed custody drift; they are not an atomic concurrent-writer protocol.
    live=path.lstat();opened=os.fstat(fd)
    assert path.resolve()==path and stat.S_ISREG(live.st_mode),'regular-live-source'
    assert stat.S_ISREG(opened.st_mode),'regular-open-source'
    expected_identity=(identity.st_dev,identity.st_ino,1)
    assert (live.st_dev,live.st_ino,live.st_nlink)==expected_identity,'stable-source-path'
    assert (opened.st_dev,opened.st_ino,opened.st_nlink)==expected_identity,'stable-source-descriptor'
    assert live.st_size==opened.st_size==len(expected),'stable-source-size'
    actual=os.pread(fd,len(expected)+1,0)
    assert actual==expected and sha(actual)==expected_sha,'stable-source-bytes'

def apply(source,record):
    source=Path(source);record=Path(record)
    assert source.is_dir()and source.resolve()==source.absolute(),'canonical-source'
    assert record.parent.is_dir()and record.parent.resolve()==record.parent.absolute(),'canonical-record-parent'
    assert not os.path.lexists(record),'fresh-record'
    manifest=json.loads((E/'compatibility-changes.json').read_text());assert manifest['schema']==2,'compatibility-schema'
    rows=manifest['changes'];assert len(rows)==20 and {r['path']for r in rows}==PATHS,'exact-twenty-paths'
    prepared=[];fds=[];record_fd=None;written=[];started=[]
    try:
        for row in rows:
            path=source/row['path'];identity=path.lstat()
            assert path.resolve()==path and stat.S_ISREG(identity.st_mode)and identity.st_nlink==1,'regular-source'
            info=provenance(row);data=path.read_bytes();result=transform(data,row)
            fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW);fds.append(fd);opened=os.fstat(fd)
            assert (opened.st_dev,opened.st_ino,opened.st_size,opened.st_nlink)==(identity.st_dev,identity.st_ino,identity.st_size,1),'stable-source'
            prepared.append((path,fd,opened,data,result,row,info))
        # All twenty transformations, custody checks, and live descriptor bytes
        # are checked before the first source write. Hold all descriptors open.
        for path,fd,identity,data,result,row,info in prepared:
            verify_custody(path,fd,identity,data,row['beforeSha256'])
        # Reserve the fresh receipt before changing source. A collision or bad
        # parent cannot leave modified source with no receipt destination.
        record_fd=os.open(record,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        # Receipt reservation is another observable mutation boundary. Recheck
        # every target before any write, then guard each individual write.
        for path,fd,identity,data,result,row,info in prepared:
            verify_custody(path,fd,identity,data,row['beforeSha256'])
        for path,fd,identity,data,result,row,info in prepared:
            verify_custody(path,fd,identity,data,row['beforeSha256'])
            started.append(row['path'])
            os.ftruncate(fd,0)
            with os.fdopen(fd,'wb',closefd=False)as target:target.write(result);target.flush();os.fsync(fd)
            verify_custody(path,fd,identity,result,row['afterSha256'])
            written.append(row['path'])
        # Earlier targets may drift while later files are written. Success
        # requires all final live paths to retain their held inode and bytes.
        for path,fd,identity,data,result,row,info in prepared:
            verify_custody(path,fd,identity,result,row['afterSha256'])
        receipt={'passed':True,'selectedPaths':sorted(PATHS),'files':[dict(path=row['path'],beforeSha256=row['beforeSha256'],afterSha256=row['afterSha256'],**info)for path,fd,identity,data,result,row,info in prepared],'commonPrerequisitesAppliedBeforeCveSplit':True,'originalBaselineUnmodified':False,'allOriginalFuzzInvariantsPreserved':True,'oomHistoricalCauseProven':False,'packageQualificationClaim':False}
        with os.fdopen(record_fd,'w',closefd=False)as target:json.dump(receipt,target,indent=2);target.write('\n');target.flush();os.fsync(record_fd)
        return receipt
    except Exception:
        if record_fd is not None:
            failure={'passed':False,'filesStarted':started,'filesWritten':written,'sourceWriteMayBePartial':True,'packageQualificationClaim':False}
            os.ftruncate(record_fd,0)
            with os.fdopen(record_fd,'w',closefd=False)as target:json.dump(failure,target,indent=2);target.write('\n');target.flush();os.fsync(record_fd)
        raise
    finally:
        if record_fd is not None:os.close(record_fd)
        for fd in fds:os.close(fd)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--record',required=True);a=p.parse_args();apply(a.source,a.record)
