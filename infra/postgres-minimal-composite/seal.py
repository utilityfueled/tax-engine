"""Derive a composite admission seal from authenticated inputs; never execute .deb data.

The caller must obtain authority from both original verifyHandoff results and the
exact immutable raw image. This module does not turn arbitrary JSON into authority.
Unknown package/status formats are holds, never learned expectations.
"""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('original_elf', ROOT / 'infra/sqlite-runtime-consumers/inspect.py')
original = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(original)
H = lambda b: hashlib.sha256(b).hexdigest()
PROVIDER = 'usr/lib/x86_64-linux-gnu/libxml2.so.2.9.14'
GOSU = 'usr/local/bin/gosu'


def regular(path, limit):
    path = Path(path); before = path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= limit
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        current = os.fstat(stream.fileno())
        assert (before.st_dev, before.st_ino) == (current.st_dev, current.st_ino)
        raw = stream.read(limit + 1)
        after_read = os.fstat(stream.fileno())
    after = path.lstat()
    sig = lambda s:(s.st_dev,s.st_ino,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    assert sig(before) == sig(current) == sig(after_read) == sig(after) and len(raw) == before.st_size
    return raw


def path_name(name):
    assert isinstance(name,str) and len(name) <= 4096 and '\x00' not in name and '\\' not in name
    p = PurePosixPath(name)
    assert not p.is_absolute() and '..' not in p.parts
    return str(p)


def fields(text):
    assert isinstance(text,str) and '\r' not in text and '\x00' not in text
    out = {}; current = None
    for line in text.splitlines():
        if line.startswith((' ', '\t')):
            assert current is not None
            out[current] += '\n' + line
        else:
            assert ': ' in line
            name,value = line.split(': ',1)
            assert re.fullmatch('[A-Za-z0-9][A-Za-z0-9-]*',name) and name not in out
            out[name]=value;current=name
    return out


def status_records(text):
    assert text.endswith('\n') and len(text.encode()) <= 8*1024**2
    records=[];seen=set()
    for paragraph in text.rstrip('\n').split('\n\n'):
        f=fields(paragraph); key=f['Package']+':'+f['Architecture']
        assert key not in seen;seen.add(key);records.append((key,paragraph,f))
    return records


def read_deb(path):
    raw=regular(path,64*1024**2);assert raw.startswith(b'!<arch>\n')
    offset=8;members=[]
    while offset<len(raw):
        assert offset+60<=len(raw);head=raw[offset:offset+60];offset+=60
        assert head[58:]==b'`\n';name=head[:16].decode('ascii').strip().removesuffix('/')
        assert re.fullmatch('[a-zA-Z0-9.-]+',name);size_text=head[48:58].decode('ascii').strip();assert size_text.isdecimal();size=int(size_text)
        assert 0<size<=64*1024**2 and offset+size<=len(raw);body=raw[offset:offset+size];offset+=size
        if size%2:assert raw[offset:offset+1]==b'\n';offset+=1
        members.append((name,body));assert len(members)<=3
    assert offset==len(raw) and len(members)==3 and members[0]==('debian-binary',b'2.0\n')
    assert members[1][0] in ('control.tar.gz','control.tar.xz') and members[2][0] in ('data.tar.gz','data.tar.xz')
    output=[]
    for kind,compressed in members[1:]:
        entries={};total=0
        with tarfile.open(fileobj=io.BytesIO(compressed),mode='r|*') as tf:
            for m in tf:
                name=path_name(m.name.rstrip('/'))
                if m.isdir() and name=='.':continue
                assert name not in entries and len(entries)<4096 and not m.issparse()
                assert m.uid==0 and m.gid==0 and not(m.mode&0o6000)
                if m.isdir():entries[name]={'type':'directory','mode':m.mode};continue
                if m.issym():
                    target=m.linkname;assert target and not PurePosixPath(target).is_absolute() and '\x00' not in target
                    # Validate resolution without following a filesystem link.
                    parts=list(PurePosixPath(name).parent.parts)
                    for part in PurePosixPath(target).parts:
                        if part=='..':assert parts;parts.pop()
                        elif part!='.':parts.append(part)
                    entries[name]={'type':'symlink','target':target,'mode':m.mode};continue
                assert m.isfile() and 0<=m.size<=64*1024**2;total+=m.size;assert total<=256*1024**2
                with tf.extractfile(m) as f:payload=f.read(m.size+1)
                assert len(payload)==m.size
                entries[name]={'type':'file','mode':m.mode,'sha256':H(payload),'bytes':payload}
        output.append(entries)
    control,data=output;assert 'control' in control and control['control']['type']=='file'
    # No maintainer-script execution or inference from it. Unknown conffiles need
    # a separate exact source model rather than a relaxed status exception.
    assert 'conffiles' not in control
    meta=fields(control['control']['bytes'].decode('utf8').rstrip('\n'))
    assert meta['Package']=='libxml2' and meta['Architecture']=='amd64'
    return {'sha256':H(raw),'control':meta,'data':data}


def derive_seal(raw,composite,deb_path,gosu_path,authority,reader=original.read_dynamic):
    for key in ['source','runId','attempt','packageImage','runtimeImage','rawImage','rawStatusSha256','debSha256','gosuSha256','privateVersion','providerPath']:assert key in authority
    assert re.fullmatch('[a-f0-9]{40}',authority['source']) and re.fullmatch('[0-9]+',authority['runId']) and authority['attempt']=='1'
    for key in ['packageImage','runtimeImage','rawImage','rawStatusSha256','debSha256','gosuSha256']:assert re.fullmatch('[a-f0-9]{64}',authority[key])
    assert authority['providerPath']==PROVIDER
    deb=read_deb(deb_path);gosu=regular(gosu_path,64*1024**2)
    assert deb['sha256']==authority['debSha256'] and H(gosu)==authority['gosuSha256'] and deb['control']['Version']==authority['privateVersion']
    assert raw['dpkgStatusSha256']==authority['rawStatusSha256']==H(raw['statusText'].encode())
    assert composite['dpkgStatusSha256']==H(composite['statusText'].encode())
    old=status_records(raw['statusText']);new=status_records(composite['statusText']);assert [r[0] for r in old]==[r[0] for r in new]
    for b,a in zip(old,new):
        if b[0]=='libxml2:amd64':assert a[2]=={**deb['control'],'Status':'install ok installed'}
        else:assert a[1]==b[1]
    versions=copy.deepcopy(raw['installedPackageVersions']);assert versions['libxml2:amd64']!=authority['privateVersion'];versions['libxml2:amd64']=authority['privateVersion']
    assert composite['installedPackageVersions']==versions
    b={r['path']:r for r in raw['allRegularElfPayloads']};a={r['path']:r for r in composite['allRegularElfPayloads']}
    assert len(b)==len(raw['allRegularElfPayloads']) and len(a)==len(composite['allRegularElfPayloads']) and set(a)==set(b)
    payloads={k:{x:v[x] for x in ['type','sha256','mode']} if v['type']=='file' else v for k,v in deb['data'].items() if v['type']!='directory'}
    assert composite['packagePayloads']==payloads
    elves={k:v['bytes'] for k,v in deb['data'].items() if v['type']=='file' and v['bytes'].startswith(b'\x7fELF')}
    assert set(elves)=={PROVIDER} and gosu.startswith(b'\x7fELF')
    expected=copy.deepcopy(b)
    with tempfile.TemporaryDirectory(prefix='composite-data-only-') as td:
        for name,payload in [(PROVIDER,elves[PROVIDER]),(GOSU,gosu)]:
            path=Path(td)/('provider' if name==PROVIDER else 'gosu');path.write_bytes(payload);dynamic=reader(path)
            assert set(dynamic)=={'needed','soname'} and isinstance(dynamic['needed'],list)
            expected[name]={**expected[name],'sha256':H(payload),'bytes':len(payload),**dynamic}
    assert a==expected
    protected=copy.deepcopy(raw['payloadHashes']);assert GOSU in protected;protected[GOSU]=H(gosu);assert composite['payloadHashes']==protected
    return {'schema':1,'authority':copy.deepcopy(authority),'statusSha256':composite['dpkgStatusSha256'],'statusFieldsDerivedFromDebControl':True,
            'installedPackageVersions':versions,'allRegularElfPayloads':list(expected.values()),'protectedHashes':protected,'packagePayloads':payloads,
            'changedElfPaths':[PROVIDER,GOSU],'derivedOnlyFromQualifiedInputs':True,'candidateReleaseQualified':False,'riskAccepted':False}
