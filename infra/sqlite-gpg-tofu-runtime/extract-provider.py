#!/usr/bin/env python3
"""Bounded data-only Debian provider extraction; no package execution."""
import hashlib
import importlib.util
import io
import json
import lzma
import os
import pathlib
import stat
import struct
import sys
import tarfile

MAX_PACKAGE = 16 * 1024**2
MAX_DATA = 32 * 1024**2
PROVIDER = "usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6"

def extract(package, output, expected):
    assert len(expected) == 64 and all(c in "0123456789abcdef" for c in expected)
    fd = os.open(package, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as f:
        st = os.fstat(f.fileno())
        assert stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and 0 < st.st_size <= MAX_PACKAGE
        raw = f.read(MAX_PACKAGE + 1)
        assert len(raw) == st.st_size
    assert raw[:8] == b"!<arch>\n"
    at, members, names = 8, [], set()
    while at < len(raw):
        h = raw[at:at+60]
        assert len(h) == 60 and h[58:] == b"`\n"
        name = h[:16].decode("ascii").strip().rstrip("/")
        assert name in ("debian-binary", "control.tar.xz", "control.tar.gz", "data.tar.xz") and name not in names
        names.add(name)
        size = int(h[48:58].strip())
        assert 0 <= size <= MAX_PACKAGE and at+60+size <= len(raw)
        body = raw[at+60:at+60+size]
        if name == "debian-binary":
            assert body == b"2.0\n"
        if size % 2:
            assert raw[at+60+size:at+61+size] == b"\n"
        if name == "data.tar.xz":
            members.append(body)
        at += 60 + size + size % 2
    assert at == len(raw) and len(members) == 1 and "debian-binary" in names
    assert len(names) == 3 and len(names & {"control.tar.xz", "control.tar.gz"}) == 1
    decompressor = lzma.LZMADecompressor(memlimit=128*1024**2)
    data = decompressor.decompress(members[0], max_length=MAX_DATA+1)
    assert decompressor.eof and not decompressor.unused_data and 0 < len(data) <= MAX_DATA
    found, paths = [], set()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as t:
        for index, member in enumerate(t):
            assert index < 2048
            name = member.name
            if name.startswith("./"):
                name = name[2:]
            if name in ("", "."):
                assert member.isdir()
                continue
            assert not name.startswith("/") and all(c not in ("", ".", "..") for c in name.split("/"))
            assert name not in paths and member.size <= 4*1024**2
            paths.add(name)
            assert member.isdir() or member.isreg() or member.issym()
            if member.issym():
                assert "/" not in member.linkname and member.linkname not in ("", ".", "..")
            if name == PROVIDER:
                assert member.isreg() and 0 < member.size <= 4*1024**2
                found.append(t.extractfile(member).read(4*1024**2+1))
    assert len(found) == 1 and found[0][:7] == b"\x7fELF\x02\x01\x01"
    assert len(found[0]) >= 64 and struct.unpack_from("<HH", found[0], 16) == (3, 62)
    actual = hashlib.sha256(found[0]).hexdigest()
    assert actual == expected
    # This is public executable library code, never key material. Parent stays private.
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o444)
    with os.fdopen(fd, "wb") as f:
        f.write(found[0])
    reader_path = pathlib.Path(__file__).resolve().parents[1] / "sqlite-runtime-consumers" / "inspect.py"
    spec = importlib.util.spec_from_file_location("reviewed_elf_reader", reader_path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    dynamic = reader.read_dynamic(pathlib.Path(output))
    assert dynamic == {"needed": ["libm.so.6", "libc.so.6"], "soname": "libsqlite3.so.0"}
    return {"providerSha256": actual, "providerBytes": len(found[0]), "packageSha256": hashlib.sha256(raw).hexdigest(), "dynamic": dynamic}

if __name__ == "__main__":
    assert len(sys.argv) == 4
    print(json.dumps(extract(*sys.argv[1:]), sort_keys=True))
