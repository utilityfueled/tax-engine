"""Read-only, bounded binding of installed tools to authenticated APT downloads.

APT update/download authentication is performed by the original supervised build.
This independently decodes each corresponding .deb, never running maintainer code.
"""
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

PACKAGES = {'abigail-tools': '2.2-2', 'binutils': '2.40-2',
            'binutils-x86-64-linux-gnu': '2.40-2', 'libabigail0': '2.2-2', 'dpkg': '1.21.23'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def bounded(path, cap):
    assert path.is_file() and not path.is_symlink()
    assert 0 < path.stat().st_size <= cap
    raw = path.read_bytes()
    assert len(raw) <= cap
    return raw


def verify(module, proof, root=Path('/')):
    installed = bounded(proof/'installed-packages.tsv', 1024**2).decode('ascii').splitlines()
    result = {'passed': False, 'independentDebMemberBinding': False, 'packages': {}, 'binaries': {}}
    data = {}
    debs = list((proof/'debs').iterdir())
    assert len(debs) == len(PACKAGES) and all(p.is_file() and not p.is_symlink() for p in debs)
    for name, version in PACKAGES.items():
        assert installed.count(f'{name}\t{version}\tamd64') == 1
        metadata = bounded(proof/'metadata'/f'{name}.txt', 1024**2)
        rows = []
        for paragraph in metadata.decode('utf-8').strip().split('\n\n'):
            fields = module.fields(paragraph.encode())
            if (fields.get('Package'), fields.get('Version'), fields.get('Architecture')) == (name, version, 'amd64'):
                assert re.fullmatch(r'[a-f0-9]{64}', fields['SHA256'])
                assert fields['Filename'].startswith('pool/main/') and '..' not in fields['Filename']
                rows.append(fields)
        assert rows and len({r['SHA256'] for r in rows}) == 1
        candidates = [p for p in debs if p.name == f'{name}_{version}_amd64.deb']
        assert len(candidates) == 1
        raw = bounded(candidates[0], 32*1024**2)
        assert sha(raw) == rows[0]['SHA256'] and len(raw) == int(rows[0]['Size'])
        control, files = module.deb(raw)
        fields = module.fields(control['control'])
        assert (fields['Package'], fields['Version'], fields['Architecture']) == (name, version, 'amd64')
        data[name] = files
        result['packages'][name] = {'version': version, 'debSha256': sha(raw), 'metadataSha256': sha(metadata)}
    selection = {'abigail-tools': ['usr/bin/abidiff'],
                 'binutils-x86-64-linux-gnu': ['usr/bin/x86_64-linux-gnu-readelf'],
                 'dpkg': ['usr/bin/dpkg-query']}
    libraries = [p for p, raw in data['libabigail0'].items() if p.startswith('usr/lib/x86_64-linux-gnu/libabigail.so.') and isinstance(raw, bytes)]
    assert libraries
    selection['libabigail0'] = libraries
    for package, names in selection.items():
        for name in names:
            expected = data[package][name]
            assert isinstance(expected, bytes) and expected
            actual = bounded(root/name, 32*1024**2)
            assert sha(actual) == sha(expected)
            result['binaries']['/'+name] = sha(actual)
    assert (root/'usr/bin/readelf').resolve() == (root/'usr/bin/x86_64-linux-gnu-readelf').resolve()
    result['binaries']['/usr/bin/readelf'] = result['binaries']['/usr/bin/x86_64-linux-gnu-readelf']
    result['passed'] = result['independentDebMemberBinding'] = True
    return result


if __name__ == '__main__':
    assert len(sys.argv) == 3
    spec = importlib.util.spec_from_file_location('abi_inspector', sys.argv[1])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    proof = Path(sys.argv[2])
    value = verify(module, proof)
    with (proof/'binary-binding.json').open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
