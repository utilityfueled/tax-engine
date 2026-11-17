"""Extract ONLY the two pinned public synthetic PDFs; never extract a ZIP tree."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import zipfile

os.umask(0o077)


def extract(archive, destination, config):
    with zipfile.ZipFile(archive) as source:
        infos = source.infolist()
        assert len(infos) <= 20000
        for item in config['pdfs']:
            matches = [info for info in infos if info.filename == item['member']]
            assert len(matches) == 1
            info = matches[0]
            assert not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16)
            assert info.file_size == item['expected']['bytes'] == 509346
            assert 0 < info.compress_size <= info.file_size + 65536
            assert not info.flag_bits & 1
            with source.open(info) as handle:
                raw = handle.read(509347)
            assert len(raw) == 509346 and hashlib.sha256(raw).hexdigest() == item['expected']['sha256']
            path = Path(destination) / ('actual-%d.pdf' % item['width'])
            with path.open('xb') as handle:
                handle.write(raw)


if __name__ == '__main__':
    try:
        assert len(sys.argv) == 3
        config = json.loads(sys.stdin.buffer.read(65537))
        extract(sys.argv[1], sys.argv[2], config)
        print('{"extractedExactMembers":2}')
    except Exception:
        sys.stderr.write('Synthetic input extraction held.\n')
        sys.exit(1)
