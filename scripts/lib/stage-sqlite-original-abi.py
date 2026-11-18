"""Adds only a source-pinned original distribution pair to existing strict archive staging."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys


def read_owned(path, cap):
    path = Path(path)
    assert path.is_absolute() and path.resolve() == path
    parent = path.parent.stat()
    assert parent.st_uid == os.getuid() and not parent.st_mode & 0o022
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        before = os.fstat(stream.fileno())
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == os.getuid()
        assert not before.st_mode & 0o022 and 0 < before.st_size <= cap
        body = stream.read(cap+1)
        assert len(body) == before.st_size
        after = os.fstat(stream.fileno()); current = os.lstat(path)
        assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns) == (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
        assert (current.st_dev,current.st_ino) == (before.st_dev,before.st_ino)
    return body


def original_pair(module, authority, input_dir):
    assert authority['schema'] == 1 and authority['version'] == '3.40.1-2+deb12u2'
    assert len(authority['packages']) == 2
    blobs = []
    for row, name in zip(authority['packages'], ('library.deb','debug.deb')):
        assert row['name'] == name and 0 < row['bytes'] <= 32*1024**2
        body = read_owned(Path(input_dir)/name, 32*1024**2)
        assert len(body) == row['bytes'] and hashlib.sha256(body).hexdigest() == row['sha256']
        blobs.append(body)
    projection, payloads = module.pair(*blobs, authority['version'])
    assert projection == authority['projection']
    return projection, payloads


def stage(inspector, authority_path, input_dir, archive, digest, source, output):
    spec = importlib.util.spec_from_file_location('original_abi_inspector', inspector)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    authority = json.loads(read_owned(authority_path, 65536))
    projection, payloads = original_pair(module, authority, input_dir)
    value = module.stage(archive,digest,source,output)
    value['originalDistribution'] = projection
    for name, body in payloads.items():
        target = Path(output)/'original-distribution'/name
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with os.fdopen(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as stream:
            stream.write(body)
    return value


if __name__ == '__main__':
    assert len(sys.argv) == 8
    print(json.dumps(stage(*sys.argv[1:]),separators=(',',':')))
