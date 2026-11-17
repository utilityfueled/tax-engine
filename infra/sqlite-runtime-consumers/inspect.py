"""Read public regular ELF payloads from a stopped-container export; execute none."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import tarfile
import tempfile


def digest(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def preflight_tar(path):
    # tarfile consumes extension bodies before yielding a logical member.
    # Check physical bounds first, reading headers and seeking over bodies.
    length = Path(path).stat().st_size
    assert 0 < length <= 2 * 1024 ** 3
    count, extensions, metadata = 0, 0, 0
    with Path(path).open('rb') as source:
        while True:
            header = source.read(512)
            assert len(header) == 512, 'incomplete-physical-header'
            if not any(header):
                second = source.read(512)
                assert len(second) == 512 and not any(second), 'incomplete-tar-end'
                while True:
                    padding = source.read(65536)
                    if not padding:
                        return
                    assert not any(padding), 'nonzero-tar-tail'
            count += 1
            assert count <= 100000, 'excessive-physical-headers'
            size, kind = tarfile.nti(header[124:136]), header[156:157]
            assert 0 <= size <= 256 * 1024 ** 2 and kind != b'S'
            if kind in (b'x', b'g', b'L', b'K'):
                extensions += 1
                metadata += size
                assert metadata <= 16 * 1024 ** 2, 'excessive-aggregate-metadata'
                assert extensions <= 16, 'excessive-consecutive-extensions'
                assert size <= (65536 if kind in (b'x', b'g') else 4096), 'excessive-extension-body'
            else:
                extensions = 0
            end = source.tell() + ((size + 511) // 512) * 512
            assert end <= length, 'incomplete-physical-body'
            source.seek(end)


def read_dynamic(path):
    # System V ABI program-header and dynamic-table layouts. No payload executes.
    info = Path(path).stat()
    assert 16 <= info.st_size <= 256 * 1024 ** 2
    raw = Path(path).read_bytes()
    assert len(raw) == info.st_size and raw[:4] == b'\x7fELF'
    assert raw[4] in (1, 2) and raw[5] in (1, 2) and raw[6] == 1
    wide, endian = raw[4] == 2, '<' if raw[5] == 1 else '>'
    header_fmt = endian + ('16sHHIQQQIHHHHHH' if wide else '16sHHIIIIIHHHHHH')
    header_size, program_size = (64, 56) if wide else (52, 32)
    assert len(raw) >= header_size
    header = struct.unpack_from(header_fmt, raw)
    assert header[1] in (1, 2, 3, 4) and header[3] == 1 and header[8] == header_size
    offset, count = header[5], header[10]
    assert 0 <= count <= 256 and (count == 0 or header[9] == program_size)
    assert count == 0 or offset >= header_size
    assert offset + count * program_size <= len(raw)
    loads, dynamics = [], []
    for index in range(count):
        values = struct.unpack_from(endian + ('IIQQQQQQ' if wide else 'IIIIIIII'),
                                    raw, offset + index * program_size)
        kind = values[0]
        start, address, size, memory = (values[2], values[3], values[5], values[6]) if wide else (values[1], values[2], values[4], values[5])
        assert start + size <= len(raw)
        if kind == 1:
            assert size <= memory
            loads.append((start, address, size))
        elif kind == 2:
            dynamics.append((start, size))
    assert len(dynamics) <= 1
    if not dynamics:
        return {'needed': [], 'soname': None}
    start, size = dynamics[0]
    entry_size = 16 if wide else 8
    assert 0 < size <= 1024 ** 2 and size % entry_size == 0
    needed, fields, terminated = [], {}, False
    for at in range(start, start + size, entry_size):
        tag, value = struct.unpack_from(endian + ('qQ' if wide else 'iI'), raw, at)
        if tag == 0:
            terminated = True
            break
        if tag == 1:
            assert len(needed) < 128
            needed.append(value)
        elif tag in (5, 10, 14):
            assert tag not in fields, 'duplicate-dynamic-field'
            fields[tag] = value
    assert terminated, 'unterminated-dynamic-table'
    if not needed and 14 not in fields:
        return {'needed': [], 'soname': None}
    assert 5 in fields and 10 in fields and 0 < fields[10] <= 16 * 1024 ** 2
    address, length = fields[5], fields[10]
    mappings = {file_at + address - virtual for file_at, virtual, extent in loads
                if virtual <= address and address + length <= virtual + extent}
    assert len(mappings) == 1, 'unmapped-or-ambiguous-string-table'
    table = mappings.pop()
    assert table + length <= len(raw)
    def name(index):
        assert index < length
        end = raw.find(b'\0', table + index, min(table + length, table + index + 256))
        assert end > table + index, 'missing-or-excessive-library-name'
        value = raw[table + index:end].decode('ascii', errors='strict')
        assert re.fullmatch(r'[A-Za-z0-9_.+\-]+', value), 'unknown-dynamic-record'
        return value
    return {'needed': [name(value) for value in needed],
            'soname': name(fields[14]) if 14 in fields else None}


def inspect_archive(archive, work, reader=read_dynamic):
    archive = Path(archive)
    info = archive.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1
    assert 0 < info.st_size <= 2 * 1024 ** 3
    before = digest(archive)
    preflight_tar(archive)
    seen, rows, owners, versions = set(), [], {}, {}
    links = 0
    with tempfile.TemporaryDirectory(prefix='elf-readonly-', dir=work) as temporary:
        with tarfile.open(archive, 'r:') as source:
            for member in source:
                name = member.name.rstrip('/')
                if member.isdir() and name in ('.', ''):
                    continue
                path = PurePosixPath(name)
                assert name and len(name) <= 4096 and not path.is_absolute() and '..' not in path.parts
                name = str(path)
                assert name not in seen and len(seen) < 100000, 'duplicate-or-excessive-entry'
                seen.add(name)
                if member.issym() or member.islnk():
                    links += 1
                    continue  # Never follow archive links or extract a filesystem tree.
                if not member.isfile():
                    continue
                assert not member.issparse() and 0 <= member.size <= 256 * 1024 ** 2
                with source.extractfile(member) as handle:
                    prefix = handle.read(4)
                    if prefix == b'\x7fELF':
                        assert len(rows) < 2048
                        raw = prefix + handle.read(member.size)
                        assert len(raw) == member.size
                        local = Path(temporary) / ('payload-%d' % len(rows))
                        with local.open('xb') as output:
                            output.write(raw)
                        dynamic = reader(local)
                        assert set(dynamic) == {'needed', 'soname'}
                        rows.append({'path': name, 'sha256': hashlib.sha256(raw).hexdigest(),
                                     'bytes': len(raw), **dynamic})
                        local.unlink()
                    elif name.startswith('var/lib/dpkg/info/') and name.endswith('.list'):
                        assert member.size <= 1024 ** 2
                        package = path.name[:-5]
                        assert re.fullmatch(r'[a-z0-9][a-z0-9+.:\-]*', package)
                        raw = prefix + handle.read(member.size)
                        assert len(raw) == member.size
                        for line in raw.decode('utf8', errors='strict').splitlines():
                            if line.startswith('/'):
                                owners.setdefault(line.lstrip('/'), []).append(package)
                    elif name == 'var/lib/dpkg/status':
                        assert member.size <= 8 * 1024 ** 2
                        raw = prefix + handle.read(member.size)
                        assert len(raw) == member.size
                        for paragraph in raw.decode('utf8', errors='strict').split('\n\n'):
                            fields = dict(line.split(': ', 1) for line in paragraph.splitlines()
                                          if line and not line[0].isspace() and ': ' in line)
                            if fields.get('Status') == 'install ok installed':
                                key = fields['Package'] + ':' + fields['Architecture']
                                assert key not in versions
                                versions[key] = fields['Version']
    assert digest(archive) == before, 'archive-changed'
    for row in rows:
        row['owners'] = sorted(set(owners.get(row['path'], [])))
    providers = [r for r in rows if r['soname'] == 'libsqlite3.so.0']
    assert providers, 'missing-sqlite-provider'
    consumers = [r for r in rows if 'libsqlite3.so.0' in r['needed']]
    return {'schema': 1, 'status': 'DISCOVERED', 'archiveSha256': before,
            'archiveBytes': info.st_size, 'members': len(seen), 'regularElfPayloads': len(rows),
            'linkEntriesNotFollowed': links, 'providers': providers, 'directConsumers': consumers,
            'allRegularElfPayloads': rows, 'installedPackageVersions': versions,
            'scope': 'regular-ELF-DT_NEEDED-only', 'allRuntimeUsesDiscovered': False,
            'runtimeCompatibilityQualified': False, 'temporaryPayloadsRemoved': True}


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 4
        result = inspect_archive(sys.argv[1], sys.argv[2])
        result['readerVersion'] = 'bounded-system-v-elf-parser-v1'
        raw = json.dumps(result, indent=2) + '\n'
        assert len(raw.encode()) <= 4 * 1024 ** 2
        with open(sys.argv[3], 'x') as output:
            output.write(raw)
        print(json.dumps({'status': 'DISCOVERED', 'elfPayloads': result['regularElfPayloads'],
                          'directConsumerCount': len(result['directConsumers'])}))
    except Exception:
        sys.stderr.write('Immutable ELF discovery held.\n')
        sys.exit(1)
