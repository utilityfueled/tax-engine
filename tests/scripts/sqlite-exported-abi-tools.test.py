"""Synthetic .deb/installed-file tests: no tools, package code, or daemon run."""
import gzip
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


verifier = load('verify', ROOT/'infra/sqlite-exported-abi/verify-tools.py')
decoder = load('decoder', ROOT/'scripts/lib/inspect-sqlite-exported-package-abi.py')


def tar(files):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as archive:
        for name, raw in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(raw)
            archive.addfile(member, io.BytesIO(raw))
    return gzip.compress(stream.getvalue())


def deb(control, data):
    raw = bytearray(b'!<arch>\n')
    for name, body in [('debian-binary', b'2.0\n'), ('control.tar.gz', tar({'control': control})), ('data.tar.gz', tar(data))]:
        raw.extend(f'{name+"/":<16}{0:<12}{0:<6}{0:<6}{100644:<8}{len(body):<10}`\n'.encode())
        raw.extend(body)
        if len(body) % 2:
            raw.extend(b'\n')
    return bytes(raw)


class Tools(unittest.TestCase):
    def fixture(self, directory):
        proof, root = directory/'proof', directory/'root'
        (proof/'debs').mkdir(parents=True)
        (proof/'metadata').mkdir()
        payloads = {'abigail-tools': {'usr/bin/abidiff': b'ABI-TOOL'},
                    'binutils-x86-64-linux-gnu': {'usr/bin/x86_64-linux-gnu-readelf': b'ELF-TOOL'},
                    'dpkg': {'usr/bin/dpkg-query': b'QUERY-TOOL'},
                    'libabigail0': {'usr/lib/x86_64-linux-gnu/libabigail.so.0.0.0': b'ABI-LIB'}}
        for name, version in verifier.PACKAGES.items():
            data = payloads.get(name, {})
            control = f'Package: {name}\nVersion: {version}\nArchitecture: amd64\n'.encode()
            raw = deb(control, data)
            (proof/'debs'/f'{name}_{version}_amd64.deb').write_bytes(raw)
            fields = control + f'SHA256: {hashlib.sha256(raw).hexdigest()}\nSize: {len(raw)}\nFilename: pool/main/x/example.deb\n'.encode()
            (proof/'metadata'/f'{name}.txt').write_bytes(fields)
            for path, body in data.items():
                target = root/path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
        (root/'usr/bin/readelf').symlink_to('x86_64-linux-gnu-readelf')
        (proof/'installed-packages.tsv').write_text(''.join(f'{n}\t{v}\tamd64\n' for n,v in verifier.PACKAGES.items()))
        return proof, root

    def test_corresponding_authenticated_package_members(self):
        with tempfile.TemporaryDirectory() as tmp:
            proof, root = self.fixture(Path(tmp))
            value = verifier.verify(decoder, proof, root)
            self.assertTrue(value['passed'])
            self.assertEqual(len(value['packages']), 5)
            self.assertEqual(len(value['binaries']), 5)

    def test_installed_binary_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            proof, root = self.fixture(Path(tmp))
            (root/'usr/bin/abidiff').write_bytes(b'FOREIGN')
            with self.assertRaises(AssertionError):
                verifier.verify(decoder, proof, root)

    def test_wrong_metadata_hash_and_version(self):
        for field in ('hash', 'version'):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                proof, root = self.fixture(Path(tmp))
                if field == 'hash':
                    path = proof/'metadata/abigail-tools.txt'
                    text = path.read_text().replace('SHA256: ', 'SHA256: ' + '0'*64 + '\nOldHash: ')
                else:
                    path = proof/'installed-packages.tsv'
                    text = path.read_text().replace('abigail-tools\t2.2-2', 'abigail-tools\t2.2-3')
                path.write_text(text)
                with self.assertRaises(AssertionError):
                    verifier.verify(decoder, proof, root)

    def test_foreign_readelf_resolution(self):
        with tempfile.TemporaryDirectory() as tmp:
            proof, root = self.fixture(Path(tmp))
            path = root/'usr/bin/readelf'
            path.unlink()
            path.symlink_to('dpkg-query')
            with self.assertRaises(AssertionError):
                verifier.verify(decoder, proof, root)


if __name__ == '__main__':
    unittest.main()
