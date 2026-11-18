"""Derive only the five authenticated appended cases; never rewrite their SQL."""
import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path

INPUT_SHA = "37aff676d1abd68932e3448f4749ca9cdb6d9e09dbcd7fcc78f51a9dc892e47f"
OUTPUT_SHA = "f8ff98ec333741d0cf00bbcb961c9b888fb3430fda18176b5d7b700c09f631cf"
PREFIX_SHA = "f2657ba69377a9f4b8d0a8b95bef95ba51ad5b075915d33c6b37b10ccc930bdc"
BODY_SHA = "168cdc27b15946177b5711d6f84c86bca6d71276ab45f2743f271b57daf7a637"
CASES = ["distinct-10." + str(n) for n in range(1, 6)]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require(condition):
    if not condition:
        raise ValueError("Fixed regression fixture admission failed")

def derive(raw):
    require(len(raw) == 15475 and digest(raw) == INPUT_SHA)
    prefix = raw[:raw.index(b"proc is_distinct_noop")]
    body = raw[raw.index(b"# 2023-03-16\n"):raw.rindex(b"\nfinish_test\n")]
    require(digest(prefix) == PREFIX_SHA and digest(body) == BODY_SHA)
    require(re.findall(rb"^do_execsql_test (10\.[1-5]) \{", body, re.M)
            == [b"10." + str(n).encode() for n in range(1, 6)])
    out = prefix + body + b"\nfinish_test\n"
    require(len(out) == 5546 and digest(out) == OUTPUT_SHA)
    return out

def read_fixed(path):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == 15475)
    identity = lambda s: (s.st_dev, s.st_ino, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as handle:
        require(identity(before) == identity(os.fstat(handle.fileno())))
        raw = handle.read(15476)
        require(identity(before) == identity(os.fstat(handle.fileno())))
    require(identity(before) == identity(path.lstat()))
    return raw

def write_new(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, "wb") as handle:
        handle.write(raw)

def main():
    require(sys.flags.optimize == 0)
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "output", "record"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    raw = read_fixed(args.source)
    out = derive(raw)
    record = dict(schemaVersion=1, inputSha256=digest(raw), inputBytes=len(raw),
                  outputSha256=digest(out), outputBytes=len(out), cases=CASES,
                  originalCaseBodiesAndOraclesExact=True, runtimeQualified=False)
    write_new(args.output, out)
    write_new(args.record, (json.dumps(record, indent=2) + "\n").encode())

if __name__ == "__main__":
    main()
