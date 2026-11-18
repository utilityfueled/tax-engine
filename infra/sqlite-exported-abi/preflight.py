"""Offline pair admission; no image restoration or executable payload execution."""
import hashlib
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path
import zipfile


def preflight(inspector, archive, digest, source, parent):
    spec = importlib.util.spec_from_file_location('abi_inspector', inspector)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='abi-pair-check-', dir=parent) as tmp:
        value = module.stage(archive, digest, source, str(Path(tmp)/'payloads'))
    # stage already verifies the complete archive digest and stable file identity.
    # Rehash the separately opened provenance view; no executable is run.
    path = Path(archive)
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024**2), b''):
            h.update(chunk)
        assert h.hexdigest() == digest
        stream.seek(0)
        with zipfile.ZipFile(stream) as z:
            name = 'command-logs/source-toolchain-native.stdout'
            info = z.getinfo(name)
            assert 0 < info.file_size <= 1024**2
            raw = z.read(name)
            records = json.loads(raw)
            info = z.getinfo('result.json')
            assert info.file_size <= 1024**2
            result = json.loads(z.read('result.json'))
    assert len(records) == 1
    image = records[0]
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', image['Id'])
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    assert image['Config']['Labels']['io.vivalatax.qualification.operation'] == result['operation']
    assert result['source'] == source and result['runId'] == value['runId']
    assert image['RepoTags'] == ['tax-source-'+result['operation']+':toolchain']
    value['originalToolchainImageId'] = image['Id']
    value['originalToolchainImageRestorable'] = False
    value['sourcePairsDecodedBeforeMaterialization'] = True
    return value


if __name__ == '__main__':
    assert len(sys.argv) == 6
    print(json.dumps(preflight(*sys.argv[1:]), separators=(',', ':')))
