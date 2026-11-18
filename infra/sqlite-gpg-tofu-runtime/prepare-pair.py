"""Decode a closed public qualified pair; no native execution or bulk extraction."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import zipfile


def prepare(inspector, archive, digest, source, run, output):
    spec = importlib.util.spec_from_file_location('gpg_pair_inspector', inspector)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = Path(output)
    assert output.is_absolute() and output.parent.resolve() == output.parent
    projection = module.stage(archive, digest, source, str(output)+'-decoded')
    assert projection['originalQualificationPassed'] is True
    assert projection['runId'] == run
    # Reopen with exact identity/digest before reconstructing the fixed allowlist.
    fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1
        h = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024**2), b''):
            h.update(chunk)
        assert h.hexdigest() == digest
        stream.seek(0)
        with zipfile.ZipFile(stream) as z:
            infos = z.infolist()
            assert len(infos) <= 10000 and len({x.filename for x in infos}) == len(infos)

            def read(name, cap):
                i = z.getinfo(name)
                assert not i.is_dir() and not i.flag_bits & 1
                assert stat.S_IFMT(i.external_attr >> 16) in (0, stat.S_IFREG)
                assert 0 < i.file_size <= cap
                with z.open(i) as item:
                    b = item.read(cap+1)
                assert len(b) == i.file_size
                return b

            package = 'candidate/libsqlite3-0_3.40.1-2+deb12u2+vivalatax1_amd64.deb'
            fixed = {
                'result.json': read('result.json', 1024**2),
                'actual-status.json': read('actual-status.json', 1024**2),
                'package-checks.json': read('package-checks.json', 1024**2),
                'artifacts/export-binding.json': read('artifacts/export-binding.json', 1024**2),
                'artifacts/ARTIFACTS.sha256': read('artifacts/ARTIFACTS.sha256', 4*1024**2),
                'artifacts/'+package: read('artifacts/'+package, 16*1024**2),
            }
            status = read('artifacts/status.json', 65536)
            assert json.loads(status) == projection['originalStatus']
            assert json.loads(fixed['actual-status.json']) == json.loads(status)
            # Local receipt uses exact original ledger-bound status bytes. The
            # source controller's display JSON may use different whitespace.
            fixed['actual-status.json'] = status
            for key in ('recipeExit', 'baselinePackageBuildExit', 'candidatePackageBuildExit', 'baselineFullTestExit', 'candidateFullTestExit', 'candidateRegressionExit', 'candidateSanitizerRegressionExit'):
                assert type(projection['originalStatus'][key]) is int and projection['originalStatus'][key] == 0
            for key in ('candidateRegressionCasesPassed', 'candidateSanitizerRegressionCasesPassed'):
                assert type(projection['originalStatus'][key]) is int and projection['originalStatus'][key] == 5
            assert projection['originalStatus']['baselineRegressionReproduced'] is True
            for key in ('genericAbiApproval', 'candidateReleaseQualified', 'riskAccepted'):
                assert projection['originalStatus'][key] is False
            result = json.loads(fixed['result.json'])
            assert result['passed'] is True and result['failure'] is False
            assert result['deadlineExceeded'] is False and result['cleanupErrors'] == []
            assert result['checks'] and all(c['exit'] == 0 for c in result['checks'])
            assert result['source'] == source and result['runId'] == run and result['attempt'] == '1'
            checks = json.loads(fixed['package-checks.json'])
            assert checks['actualChecksPassed'] is True and checks['architecture'] == 'amd64'
            expected = {'source': source, 'runId': run, 'provider': projection['candidate']['librarySha256'],
                        'package': projection['candidate']['libraryPackageSha256']}
            assert hashlib.sha256(fixed['artifacts/'+package]).hexdigest() == expected['package']
            for key, name in (('result', 'result.json'), ('status', 'actual-status.json'),
                              ('packageChecks', 'package-checks.json'), ('exportBinding', 'artifacts/export-binding.json')):
                expected[key] = hashlib.sha256(fixed[name]).hexdigest()
        after = os.fstat(stream.fileno())
        assert (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
        assert os.lstat(archive).st_ino == before.st_ino
    output.mkdir(mode=0o700)
    for name, body in fixed.items():
        p = output/name
        p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(body)
    return {'directory': str(output), 'expected': expected,
            'originalQualificationPassed': True,
            'originalStatus': projection['originalStatus'],
            'artifactLedgerSha256': projection['artifactLedgerSha256']}


if __name__ == '__main__':
    assert len(sys.argv) == 7
    print(json.dumps(prepare(*sys.argv[1:]), separators=(',', ':')))
