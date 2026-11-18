"""Spec postgres-minimal-composite: data-only synthetic package/provenance controls."""
import copy
import gzip
import hashlib
import importlib.util
import io
import json
import lzma
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('seal', ROOT / 'infra/postgres-minimal-composite/seal.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
H = lambda b: hashlib.sha256(b).hexdigest()
PROVIDER = 'usr/lib/x86_64-linux-gnu/libxml2.so.2.9.14'
GOSU = 'usr/local/bin/gosu'


def tar_bytes(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as tf:
        for name, raw in entries:
            info = tarfile.TarInfo(name); info.size = len(raw); info.mode = 0o644
            tf.addfile(info, io.BytesIO(raw))
    return stream.getvalue()


def deb_bytes(version='2.private', provider=b'\x7fELFnew-provider', extra=()):
    control = ('Package: libxml2\nVersion: '+version+'\nArchitecture: amd64\nDescription: synthetic\n').encode()
    members = [('debian-binary', b'2.0\n'), ('control.tar.gz', gzip.compress(tar_bytes([('./control', control)]))),
               ('data.tar.xz', lzma.compress(tar_bytes([(PROVIDER, provider), *extra])))]
    out = b'!<arch>\n'
    for name, raw in members:
        header = (name+'/').ljust(16)+'0'.ljust(12)+'0'.ljust(6)+'0'.ljust(6)+'100644'.ljust(8)+str(len(raw)).ljust(10)+'`\n'
        out += header.encode()+raw+(b'\n' if len(raw)%2 else b'')
    return out


def baseline():
    status = 'Package: libxml2\nVersion: 1\nArchitecture: amd64\nDescription: old\nStatus: install ok installed\n\nPackage: keep\nVersion: 1\nArchitecture: amd64\nStatus: install ok installed\n\n'
    row = lambda path, raw: {'path':path,'sha256':H(raw),'bytes':len(raw),'needed':[],'soname':None,'owners':['libxml2:amd64'] if path==PROVIDER else []}
    return {'schema':1,'statusText':status,'dpkgStatusSha256':H(status.encode()),'installedPackageVersions':{'libxml2:amd64':'1','keep:amd64':'1'},
            'allRegularElfPayloads':[row(PROVIDER,b'\x7fELFold-provider'),row(GOSU,b'\x7fELFold-gosu'),row('usr/bin/keep',b'\x7fELFkeep')],
            'payloadHashes':{GOSU:H(b'\x7fELFold-gosu'),'usr/bin/keep':H(b'\x7fELFkeep')},'packagePayloads':{}}


def fixture(directory):
    raw = baseline(); deb = directory/'candidate.deb'; deb.write_bytes(deb_bytes()); gosu = directory/'gosu'; gosu.write_bytes(b'\x7fELFnew-gosu')
    after = copy.deepcopy(raw); after['statusText'] = 'Package: libxml2\nVersion: 2.private\nArchitecture: amd64\nDescription: synthetic\nStatus: install ok installed\n\n'+raw['statusText'].split('\n\n',1)[1]
    after['dpkgStatusSha256']=H(after['statusText'].encode()); after['installedPackageVersions']['libxml2:amd64']='2.private'
    for row in after['allRegularElfPayloads']:
        if row['path'] in (PROVIDER,GOSU):
            payload=b'\x7fELFnew-provider' if row['path']==PROVIDER else gosu.read_bytes();row.update(sha256=H(payload),bytes=len(payload))
    after['payloadHashes'][GOSU]=H(gosu.read_bytes());after['packagePayloads']={PROVIDER:{'type':'file','sha256':H(b'\x7fELFnew-provider'),'mode':0o644}}
    authority={'source':'1'*40,'runId':'7','attempt':'1','packageImage':'a'*64,'runtimeImage':'b'*64,'rawImage':'c'*64,'rawStatusSha256':raw['dpkgStatusSha256'],
               'debSha256':H(deb.read_bytes()),'gosuSha256':H(gosu.read_bytes()),'privateVersion':'2.private','providerPath':PROVIDER}
    return raw,after,deb,gosu,authority


def dynamic(path):
    assert path.read_bytes().startswith(b'\x7fELF')
    return {'needed':[],'soname':None}


class Seal(unittest.TestCase):
    def test_exact_payload_and_status_derived_from_package_not_observed(self):
        with tempfile.TemporaryDirectory() as td:
            args=fixture(Path(td)); result=m.derive_seal(*args,reader=dynamic)
            self.assertTrue(result['derivedOnlyFromQualifiedInputs']); self.assertEqual(result['statusSha256'],args[1]['dpkgStatusSha256'])
            self.assertEqual(result['changedElfPaths'],[PROVIDER,GOSU]);self.assertFalse(result['candidateReleaseQualified'])

    def test_unrelated_status_package_elf_and_protected_drift_fail(self):
        edits=[lambda x:x['installedPackageVersions'].update({'keep:amd64':'9'}),lambda x:x['allRegularElfPayloads'][2].update(sha256='e'*64),
               lambda x:x['payloadHashes'].update({'usr/bin/keep':'e'*64}),lambda x:x.update(statusText=x['statusText'].replace('Package: keep\nVersion: 1','Package: keep\nVersion: 9')),
               lambda x:x.update(statusText=x['statusText'].replace('Description: synthetic','Description: observed-and-blessed')),
               lambda x:x['allRegularElfPayloads'].append(copy.deepcopy(x['allRegularElfPayloads'][0])),lambda x:x['packagePayloads'][PROVIDER].update(sha256='d'*64)]
        with tempfile.TemporaryDirectory() as td:
            for edit in edits:
                args=list(fixture(Path(td)));edit(args[1]);args[1]['dpkgStatusSha256']=H(args[1]['statusText'].encode())
                with self.assertRaises((AssertionError,ValueError,KeyError)):m.derive_seal(*args,reader=dynamic)

    def test_foreign_artifacts_and_extra_package_payload_fail(self):
        with tempfile.TemporaryDirectory() as td:
            for field in ['debSha256','gosuSha256','rawStatusSha256']:
                args=list(fixture(Path(td)));args[4][field]='f'*64
                with self.assertRaises(AssertionError):m.derive_seal(*args,reader=dynamic)
            args=list(fixture(Path(td)));args[2].write_bytes(deb_bytes(extra=[('usr/bin/foreign',b'\x7fELFforeign')]))
            args[4]['debSha256']=H(args[2].read_bytes())
            with self.assertRaises(AssertionError):m.derive_seal(*args,reader=dynamic)

    def test_archive_escape_duplicate_unsupported_or_ambiguous_forms_fail(self):
        with tempfile.TemporaryDirectory() as td:
            for extra in [[('../escape',b'x')],[(PROVIDER,b'duplicate')]]:
                path=Path(td)/'bad.deb';path.write_bytes(deb_bytes(extra=extra))
                with self.assertRaises((AssertionError,ValueError)):m.read_deb(path)
            path=Path(td)/'bad.deb';path.write_bytes(b'!<arch>\nmalformed')
            with self.assertRaises((AssertionError,ValueError)):m.read_deb(path)


if __name__=='__main__':unittest.main(verbosity=2)
