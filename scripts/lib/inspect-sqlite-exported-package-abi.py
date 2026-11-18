"""Bounded read-only package decoding; writes only four verified regular payloads."""
import hashlib
import io
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import tarfile
import zipfile
import zlib


def sha(value):
    return hashlib.sha256(value).hexdigest()


def safe(name):
    assert isinstance(name, str) and name and '\\' not in name
    assert not name.startswith('/') and all(p not in ('', '.', '..') for p in name.split('/'))
    return name


def deb(raw):
    assert len(raw) <= 32 * 1024**2 and raw[:8] == b'!<arch>\n'
    at, parts = 8, {}
    while at < len(raw):
        header = raw[at:at+60]
        assert len(header) == 60 and header[58:] == b'`\n'
        name = header[:16].decode('ascii').strip().rstrip('/')
        size = int(header[48:58]); assert 0 <= size <= 32 * 1024**2
        assert name not in parts
        body = raw[at+60:at+60+size]; assert len(body) == size
        parts[name] = body; at += 60 + size + size % 2
    assert at == len(raw) and parts.pop('debian-binary') == b'2.0\n'
    # Bound complete expanded streams BEFORE tarfile can internally consume PAX
    # or GNU metadata records. Yielded-member accounting alone is insufficient.
    streams = {}
    for prefix in ('control.tar.', 'data.tar.'):
        names = [n for n in parts if n.startswith(prefix)]
        assert len(names) == 1 and names[0].split('.')[-1] in ('xz', 'gz')
        compressed = parts[names[0]]
        if names[0].endswith('.xz'):
            decoder = lzma.LZMADecompressor(format=lzma.FORMAT_XZ, memlimit=128*1024**2)
            expanded = decoder.decompress(compressed, max_length=64*1024**2+1)
            assert decoder.eof and not decoder.unused_data
        else:
            decoder = zlib.decompressobj(16+zlib.MAX_WBITS)
            expanded = decoder.decompress(compressed, 64*1024**2+1)
            assert decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail
        assert len(expanded) <= 64*1024**2
        streams[prefix] = expanded
    out = {}
    for prefix, expanded in streams.items():
        group, total = {}, 0
        with tarfile.open(fileobj=io.BytesIO(expanded), mode='r:') as archive:
            count = 0
            for info in archive:
                count += 1; assert count <= 1000
                name = info.name[2:] if info.name.startswith('./') else info.name
                if name in ('', '.') and info.isdir():
                    continue
                safe(name); assert name not in group
                assert info.size >= 0; total += info.size; assert total <= 64 * 1024**2
                if info.isreg():
                    assert info.size <= 32 * 1024**2
                    with archive.extractfile(info) as stream:
                        value = stream.read(info.size+1)
                    assert len(value) == info.size
                    group[name] = value
                else:
                    # No links/devices are materialized. Fixed payload selection below
                    # requires a regular member; duplicate names of any type fail.
                    assert info.isdir() or info.issym() or info.islnk()
                    group[name] = None
        out[prefix] = group
    return out['control.tar.'], out['data.tar.']


def fields(raw):
    assert isinstance(raw, bytes) and len(raw) < 65536
    result = {}
    for row in raw.decode('utf-8').splitlines():
        if row.startswith((' ', '\t')):
            continue
        key, value = row.split(': ', 1)
        assert key not in result; result[key] = value
    return result


def elf(raw):
    assert isinstance(raw, bytes) and 64 <= len(raw) <= 32 * 1024**2
    assert raw[:7] == b'\x7fELF\x02\x01\x01'
    kind, machine = struct.unpack_from('<HH', raw, 16)
    assert kind == 3 and machine == 62
    offset = struct.unpack_from('<Q', raw, 40)[0]
    size, count, string_index = struct.unpack_from('<HHH', raw, 58)
    assert size == 64 and 0 < count < 1000 and string_index < count
    assert offset + size*count <= len(raw)
    rows = [struct.unpack_from('<IIQQQQIIQQ', raw, offset+i*size) for i in range(count)]

    def payload(row):
        assert row[4] + row[5] <= len(raw)
        return raw[row[4]:row[4]+row[5]]

    strings, sections = payload(rows[string_index]), {}
    for row in rows:
        assert row[0] < len(strings)
        end = strings.find(b'\0', row[0]); assert end >= row[0]
        name = strings[row[0]:end].decode('ascii')
        if name:
            assert name not in sections; sections[name] = row
    data = lambda name: payload(sections[name])
    note = data('.note.gnu.build-id')
    names, descs, tag = struct.unpack_from('<III', note)
    assert names == 4 and descs == 20 and tag == 3 and note[12:16] == b'GNU\0'
    assert len(note) == 36
    out = {'buildId': note[16:36].hex(), 'sha256': sha(raw),
           'debugInfoBytes': sections.get('.debug_info', (0,)*6)[5],
           'debugAbbrevBytes': sections.get('.debug_abbrev', (0,)*6)[5],
           'alternateDebugInfoRequired': '.gnu_debugaltlink' in sections,
           'soname': [], 'needed': []}
    if '.gnu_debuglink' in sections:
        link = data('.gnu_debuglink'); end = link.index(0)
        out['debuglink'] = link[:end].decode('ascii')
        pos = (end+4)//4*4; assert pos+4 == len(link)
        out['debuglinkCrc32'] = struct.unpack_from('<I', link, pos)[0]
    if '.dynamic' in sections:
        names = data('.dynstr')

        def string(at):
            assert at < len(names)
            return names[at:names.index(0, at)].decode('ascii')

        entries = list(struct.iter_unpack('<qQ', data('.dynamic')))
        out['soname'] = [string(v) for k, v in entries if k == 14]
        out['needed'] = [string(v) for k, v in entries if k == 1]
    return out


def pair(library_deb, debug_deb, version):
    lc, ld = deb(library_deb); dc, dd = deb(debug_deb)
    library_control, debug_control = fields(lc['control']), fields(dc['control'])
    for control, name in ((library_control, 'libsqlite3-0'), (debug_control, 'libsqlite3-0-dbgsym')):
        assert control['Package'] == name and control['Version'] == version
        assert control['Architecture'] == 'amd64' and control['Source'] == 'sqlite3'
    assert debug_control['Auto-Built-Package'] == 'debug-symbols'
    assert debug_control['Depends'] == 'libsqlite3-0 (= '+version+')'
    library_name = 'usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6'
    library_raw = ld[library_name]; library = elf(library_raw)
    build_id = library['buildId']
    debug_name = 'usr/lib/debug/.build-id/'+build_id[:2]+'/'+build_id[2:]+'.debug'
    debug_raw = dd[debug_name]; debug = elf(debug_raw)
    assert debug_control['Build-Ids'] == build_id == debug['buildId']
    assert library['debuglink'] == PurePosixPath(debug_name).name
    assert library['debuglinkCrc32'] == zlib.crc32(debug_raw)
    assert debug['debugInfoBytes'] > 0 and debug['debugAbbrevBytes'] > 0
    assert not library['alternateDebugInfoRequired'] and not debug['alternateDebugInfoRequired']
    assert library['soname'] == ['libsqlite3.so.0'] and library['needed'] == ['libm.so.6', 'libc.so.6']
    projection = {'version': version, 'architecture': 'amd64', 'libraryPackage': library_control['Package'],
                  'debugPackage': debug_control['Package'], 'library': library_name, 'debug': debug_name,
                  'buildId': build_id, 'debugBuildId': debug['buildId'], 'debuglinkCrcMatches': True,
                  'debugInfoBytes': debug['debugInfoBytes'], 'debugAbbrevBytes': debug['debugAbbrevBytes'],
                  'alternateDebugInfoRequired': False, 'soname': library['soname'], 'needed': library['needed'],
                  'librarySha256': sha(library_raw), 'debugSha256': sha(debug_raw),
                  'libraryPackageSha256': sha(library_deb), 'debugPackageSha256': sha(debug_deb)}
    return projection, {library_name: library_raw, debug_name: debug_raw}


def stage(archive_path, archive_sha, source, output):
    assert re.fullmatch('[a-f0-9]{64}', archive_sha) and re.fullmatch('[a-f0-9]{40}', source)
    path = Path(archive_path); assert path.is_absolute() and path.resolve() == path
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == os.getuid()
        assert 0 < before.st_size <= 4*1024**3 and not before.st_mode & 0o022
        hasher = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024**2), b''):
            hasher.update(chunk)
        assert hasher.hexdigest() == archive_sha
        stream.seek(0)
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist(); assert len(infos) <= 10000
            names = [i.filename for i in infos]; assert len(set(names)) == len(names)

            def read(name, cap):
                info = archive.getinfo(name)
                assert not info.is_dir() and not info.flag_bits & 1
                assert stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG)
                assert 0 <= info.file_size <= cap
                with archive.open(info) as item:
                    value = item.read(cap+1)
                assert len(value) == info.file_size
                return value

            ledger_raw = read('artifacts/ARTIFACTS.sha256', 4*1024**2)
            ledger = {}
            for line in ledger_raw.decode('ascii').splitlines():
                match = re.fullmatch(r'([a-f0-9]{64})  \./(.+)', line); assert match
                name = safe(match[2]); assert name not in ledger; ledger[name] = match[1]
            binding = json.loads(read('artifacts/export-binding.json', 8*1024**2))
            assert binding['noAliases'] is True and binding['originalArtifactLedgerVerified'] is True
            assert binding['files']['ARTIFACTS.sha256'] == {'bytes': len(ledger_raw), 'sha256': sha(ledger_raw)}

            def artifact(name, cap):
                value = read('artifacts/'+safe(name), cap)
                assert sha(value) == ledger[name]
                assert binding['files'][name] == {'bytes': len(value), 'sha256': sha(value)}
                return value

            admission = json.loads(read('admission.json', 65536)); result = json.loads(read('result.json', 1024**2))
            for obj in (admission, result):
                assert obj['source'] == source and obj['kind'] == 'package' and obj['attempt'] == '1'
            assert admission['platform'] == 'linux/amd64' and result['sourceCandidate'] == 'sqlite'
            assert admission['operation'] == result['operation'] and admission['runId'] == result['runId']
            assert result['cleanupErrors'] == [] and result['deadlineExceeded'] is False
            assert isinstance(result['passed'], bool)
            for field in ('genericAbiApproval', 'candidateReleaseQualified', 'riskAccepted', 'runtimeIntegrationExecuted'):
                assert result[field] is False
            status = json.loads(artifact('status.json', 65536))
            assert status['baselinePackageBuildExit'] == 0 and status['candidatePackageBuildExit'] == 0
            packages = artifact('toolchain/packages.tsv', 1024**2).decode('ascii').splitlines()
            assert packages.count('abigail-tools\t2.2-2\tamd64') == 1 and packages.count('binutils\t2.40-2\tamd64') == 1
            projection = {'source': source, 'runId': result['runId'], 'archiveSha256': archive_sha,
                          'artifactLedgerSha256': sha(ledger_raw), 'originalQualificationPassed': result['passed'],
                          'originalStatus': status, 'payloads': {}}
            payloads = {}
            for variant, version in (('baseline', '3.40.1-2+deb12u2'), ('candidate', '3.40.1-2+deb12u2+vivalatax1')):
                library = artifact(f'{variant}/libsqlite3-0_{version}_amd64.deb', 32*1024**2)
                debug = artifact(f'{variant}/libsqlite3-0-dbgsym_{version}_amd64.deb', 32*1024**2)
                projection[variant], payloads[variant] = pair(library, debug, version)
            after = os.fstat(stream.fileno())
            assert (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            current = os.lstat(path)
            assert (current.st_dev, current.st_ino) == (before.st_dev, before.st_ino)
    output = Path(output); assert output.is_absolute() and output.parent.resolve() == output.parent
    parent = output.parent.stat(); assert parent.st_uid == os.getuid() and not parent.st_mode & 0o022
    output.mkdir(mode=0o700)  # Exclusive: an old output is never reused.
    for variant, files in payloads.items():
        for name, value in files.items():
            target = output/variant/name; target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(value)
    return projection


if __name__ == '__main__':
    assert len(sys.argv) == 5
    print(json.dumps(stage(*sys.argv[1:]), separators=(',', ':')))
