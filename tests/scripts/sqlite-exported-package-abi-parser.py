"""Synthetic package parser tests. No ELF/tool execution or real candidate claim."""
import hashlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
import zipfile
import zlib

spec = importlib.util.spec_from_file_location('inspector', Path(__file__).resolve().parents[2]/'scripts/lib/inspect-sqlite-exported-package-abi.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
SOURCE = 'b'*40
BUILD_ID = bytes.fromhex('12'*20)


def elf(debug=False, *, no_debug=False, alternate=False, crc=0):
    note = struct.pack('<III', 4, 20, 3)+b'GNU\0'+BUILD_ID
    parts = [('.note.gnu.build-id', note)]
    if debug:
        if not no_debug:
            parts += [('.debug_info', b'synthetic-not-native-DWARF'), ('.debug_abbrev', b'fixture')]
        if alternate:
            parts += [('.gnu_debugaltlink', b'absent.debug\0')]
    else:
        link = BUILD_ID.hex()[2:]+'.debug'
        raw = link.encode()+b'\0'; raw += b'\0'*(-len(raw)%4)+struct.pack('<I', crc)
        names = b'\0libsqlite3.so.0\0libm.so.6\0libc.so.6\0'
        parts += [('.gnu_debuglink', raw), ('.dynstr', names), ('.dynamic', b''.join(struct.pack('<qQ', k, names.index(v)) for k,v in [(14,b'libsqlite3.so.0'),(1,b'libm.so.6'),(1,b'libc.so.6')]))]
    names = b'\0.shstrtab\0'+b''.join(name.encode()+b'\0' for name,_ in parts)
    parts.insert(0, ('.shstrtab', names))
    raw = bytearray(64); raw[:7] = b'\x7fELF\x02\x01\x01'; struct.pack_into('<HH', raw, 16, 3, 62)
    rows = [(0,)*10]
    for name, value in parts:
        at = len(raw); raw += value
        rows.append((names.index(name.encode()+b'\0'), 1, 0, 0, at, len(value), 0, 0, 1, 0))
    at = len(raw); raw += b''.join(struct.pack('<IIQQQQIIQQ', *r) for r in rows)
    struct.pack_into('<Q', raw, 40, at); struct.pack_into('<HHH', raw, 58, 64, len(rows), 1)
    return bytes(raw)


def tar(members):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as archive:
        for name, value in members:
            info = tarfile.TarInfo(name); info.size = len(value)
            archive.addfile(info, io.BytesIO(value))
    return out.getvalue()


def deb(version, debug=False, *, no_debug=False, alternate=False, wrong_arch=False):
    debug_raw = elf(True, no_debug=no_debug, alternate=alternate)
    library = elf(crc=zlib.crc32(debug_raw))
    package = 'libsqlite3-0'+('-dbgsym' if debug else '')
    control = f'Package: {package}\nSource: sqlite3\nVersion: {version}\nArchitecture: '+('arm64' if wrong_arch else 'amd64')+'\n'
    if debug:
        control += f'Auto-Built-Package: debug-symbols\nDepends: libsqlite3-0 (= {version})\nBuild-Ids: {BUILD_ID.hex()}\n'
    name = ('usr/lib/debug/.build-id/'+BUILD_ID.hex()[:2]+'/'+BUILD_ID.hex()[2:]+'.debug') if debug else 'usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6'
    parts = [('debian-binary', b'2.0\n'), ('control.tar.gz', tar([('control', control.encode())])), ('data.tar.gz', tar([(name, debug_raw if debug else library)]))]
    raw = b'!<arch>\n'
    for name, value in parts:
        header = f'{name+"/":<16}{0:<12}{0:<6}{0:<6}{100644:<8}{len(value):<10}`\n'.encode()
        assert len(header) == 60
        raw += header+value+(b'\n' if len(value)%2 else b'')
    return raw


def source_zip(path, *, missing=False, bad_ledger=False, source=SOURCE):
    files = {'status.json': b'{"baselinePackageBuildExit":0,"candidatePackageBuildExit":0,"recipeExit":1}\n', 'toolchain/packages.tsv': b'abigail-tools\t2.2-2\tamd64\nbinutils\t2.40-2\tamd64\n'}
    for variant, version in [('baseline','3.40.1-2+deb12u2'),('candidate','3.40.1-2+deb12u2+vivalatax1')]:
        for debug in (False, True):
            name = f'{variant}/libsqlite3-0'+('-dbgsym' if debug else '')+f'_{version}_amd64.deb'
            files[name] = deb(version, debug)
    ledger = ''.join(module.sha(v)+'  ./'+n+'\n' for n,v in files.items()).encode()
    binding = {'noAliases': True, 'originalArtifactLedgerVerified': True, 'files': {n:{'bytes':len(v),'sha256':module.sha(v)} for n,v in files.items()}}
    binding['files']['ARTIFACTS.sha256'] = {'bytes':len(ledger),'sha256':module.sha(ledger)}
    if bad_ledger:
        ledger = b'0'+ledger[1:]
        binding['files']['ARTIFACTS.sha256']['sha256'] = module.sha(ledger)
    common = {'source': source, 'kind':'package','attempt':'1','operation':'owned','runId':'123'}
    result = {**common,'sourceCandidate':'sqlite','cleanupErrors':[],'deadlineExceeded':False,'passed':False, **{k:False for k in ['genericAbiApproval','candidateReleaseQualified','riskAccepted','runtimeIntegrationExecuted']}}
    with zipfile.ZipFile(path, 'x') as archive:
        archive.writestr('admission.json', json.dumps({**common,'platform':'linux/amd64'}))
        archive.writestr('result.json', json.dumps(result))
        archive.writestr('artifacts/ARTIFACTS.sha256', ledger)
        archive.writestr('artifacts/export-binding.json', json.dumps(binding))
        for n,v in files.items():
            if not (missing and n.startswith('candidate/libsqlite3-0-dbgsym')):
                archive.writestr('artifacts/'+n,v)
    os.chmod(path,0o600)
    return module.sha(path.read_bytes())


class Controls(unittest.TestCase):
    def test_oversized_internal_pax_record_rejected_before_parsing(self):
        # A real gzip/PAX fixture, not a mocked size: the old yielded-member
        # accounting admits this65MiB metadata record before seeing control.
        normal = deb('3.40.1-2+deb12u2')
        size = 65*1024**2
        value = b'x'*size
        length = len(value)+16
        while True:
            record = str(length).encode()+b' comment='+value+b'\n'
            if len(record) == length:
                break
            length = len(record)
        header = tarfile.TarInfo('pax-extension'); header.type = tarfile.XHDTYPE; header.size = length
        expanded = header.tobuf()+record+b'\0'*(-length%512)
        for selected in ('control.tar.gz', 'data.tar.gz'):
            with self.subTest(selected=selected):
                at, parts = 8, []
                while at < len(normal):
                    h=normal[at:at+60]; n=h[:16].decode().strip().rstrip('/'); count=int(h[48:58]); body=normal[at+60:at+60+count]
                    if n == selected:
                        body = gzip.compress(expanded+gzip.decompress(body))
                        self.assertLess(len(body),100000)
                    parts.append((n,body)); at+=60+count+count%2
                raw=b'!<arch>\n'
                for n,body in parts:
                    h=f'{n+"/":<16}{0:<12}{0:<6}{0:<6}{100644:<8}{len(body):<10}`\n'.encode()
                    raw+=h+body+(b'\n' if len(body)%2 else b'')
                opened = []
                original = module.tarfile.open
                def observed(*args, **kwargs):
                    opened.append(True)
                    return original(*args, **kwargs)
                module.tarfile.open = observed
                try:
                    with self.assertRaises(AssertionError):
                        module.deb(raw)
                    self.assertEqual(opened, [], 'Complete expansion bounds must precede all tar parsing.')
                finally:
                    module.tarfile.open = original

    def test_pair_and_corresponding_debug_required(self):
        version = '3.40.1-2+deb12u2'
        record, files = module.pair(deb(version),deb(version,True),version)
        self.assertEqual(record['debugInfoBytes'],26)
        self.assertEqual(len(files),2)
        for bad in [deb(version,True,no_debug=True),deb(version,True,alternate=True),deb(version,True,wrong_arch=True),deb(version+'foreign',True)]:
            with self.assertRaises((AssertionError,KeyError)):
                module.pair(deb(version),bad,version)

    def test_complete_source_bound_stage_without_native_execution(self):
        with tempfile.TemporaryDirectory(prefix='sqlite-abi-parser-') as directory:
            root = Path(directory).resolve(); archive = root/'actual.zip'; digest = source_zip(archive)
            record = module.stage(str(archive),digest,SOURCE,str(root/'new'))
            self.assertFalse(record['originalQualificationPassed'])
            self.assertEqual(len(list((root/'new').rglob('*.debug'))),2)
            self.assertEqual(len(list((root/'new').rglob('libsqlite3.so.0.8.6'))),2)
            with self.assertRaises(FileExistsError):
                module.stage(str(archive),digest,SOURCE,str(root/'new'))

    def test_missing_mismatched_or_foreign_input_fails_before_output(self):
        for options, requested, bad_hash in [({'missing':True},SOURCE,False),({'bad_ledger':True},SOURCE,False),({},'c'*40,False),({},SOURCE,True)]:
            with self.subTest(options=options,source=requested,bad_hash=bad_hash):
                with tempfile.TemporaryDirectory(prefix='sqlite-abi-parser-') as directory:
                    root=Path(directory).resolve(); archive=root/'actual.zip'; digest=source_zip(archive,**options)
                    with self.assertRaises((AssertionError,KeyError)):
                        module.stage(str(archive),'0'*64 if bad_hash else digest,requested,str(root/'new'))
                    self.assertFalse((root/'new').exists())

    def test_malformed_paths_elf_and_duplicate_members_fail(self):
        for name in ['../escape','/absolute','a//b','a/./b','a\\b']:
            with self.assertRaises(AssertionError): module.safe(name)
        for value in [b'',b'not ELF',elf()[:80]]:
            with self.assertRaises((AssertionError,KeyError)): module.elf(value)
        version='3.40.1-2+deb12u2'; raw=deb(version)
        with self.assertRaises(AssertionError): module.deb(raw+raw[8:])


if __name__ == '__main__':
    unittest.main()
