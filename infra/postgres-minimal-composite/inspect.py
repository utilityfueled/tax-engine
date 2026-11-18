"""Explicit composite profile. Original raw/required/absence readers stay unchanged."""
import importlib.util
import json
import re
from pathlib import Path, PurePosixPath
import sys
import tarfile

ROOT=Path(__file__).resolve().parents[2]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);out=importlib.util.module_from_spec(spec);spec.loader.exec_module(out);return out
seal=module('composite_seal',Path(__file__).with_name('seal.py'))
raw=module('original_minimal',ROOT/'infra/postgres-minimal-runtime/inspect.py')


def inventory(archive,work,policy,deb,reader=raw.original.read_dynamic):
    assert policy in ('raw','composite','absent')
    report=raw.inspect_archive(archive,work,'absent' if policy=='absent' else 'baseline',reader)
    package=seal.read_deb(deb);wanted={p for p,r in package['data'].items() if r['type']!='directory'};found={};status=None
    with tarfile.open(archive,'r:') as tf:
        for member in tf:
            name=str(PurePosixPath(member.name.rstrip('/')))
            if name=='var/lib/dpkg/status':
                assert member.isfile() and member.size<=8*1024**2
                with tf.extractfile(member) as f:status=f.read().decode('utf8')
            if name not in wanted:continue
            assert name not in found
            if member.issym():found[name]={'type':'symlink','target':member.linkname,'mode':member.mode}
            else:
                assert member.isfile() and member.size<=64*1024**2
                with tf.extractfile(member) as f:payload=f.read()
                found[name]={'type':'file','sha256':seal.H(payload),'mode':member.mode}
    assert status is not None and report['dpkgStatusSha256']==seal.H(status.encode())
    assert raw.original.digest(archive)==report['archiveSha256']
    report.update(profile='explicit-composite-v1',statusText=status,packagePayloads=found)
    return report


def validate_pair(before, after, derived):
    assert derived['derivedOnlyFromQualifiedInputs'] is True
    assert before['profile']==after['profile']=='explicit-composite-v1'
    assert before['dpkgStatusSha256']==derived['statusSha256']==seal.H(before['statusText'].encode())
    assert before['installedPackageVersions']==derived['installedPackageVersions']
    assert {r['path']:r for r in before['allRegularElfPayloads']}=={r['path']:r for r in derived['allRegularElfPayloads']}
    assert before['payloadHashes']==derived['protectedHashes'] and before['packagePayloads']==derived['packagePayloads']
    assert after['packagePayloads']==derived['packagePayloads']
    for value, status, elf_count, package_count in [(before, "BASELINE_INVENTORIED", 1042, 155), (after, "ABSENCE_INVENTORIED", 1038, 150)]:
        assert value["schema"] == 1 and value["status"] == status and value["parserCompleted"] is True
        assert value["temporaryPayloadsRemoved"] is True and value["allRuntimeUsesDiscovered"] is False and value["runtimeCompatibilityQualified"] is False
        assert re.fullmatch(r"[0-9a-f]{64}", value["archiveSha256"]) and 0 < value["archiveBytes"] <= 2 * 1024 ** 3
        assert len(value["allRegularElfPayloads"]) == elf_count and len(value["installedPackageVersions"]) == package_count
        assert all(p in value["payloadHashes"] for p in raw.PROTECTED), "missing-required-payload"
    assert before["dpkgStatusSha256"] == derived["statusSha256"]
    assert before["payloadHashes"][raw.PROTECTED[0]] == raw.ENTRYPOINT_SHA
    assert before["payloadHashes"] == after["payloadHashes"], "protected-payload-changed"
    assert after["packageControls"]["passed"] is True
    bv, av = before["installedPackageVersions"], after["installedPackageVersions"]
    removed = {k for k in bv if k.split(":")[0] in raw.REMOVE}
    assert len(removed) == 5 and {k.split(":")[0] for k in removed} == raw.REMOVE
    assert av == {k: v for k, v in bv.items() if k not in removed}, "retained-package-drift"
    b = {r["path"]: r for r in before["allRegularElfPayloads"]}; a = {r["path"]: r for r in after["allRegularElfPayloads"]}
    assert len(b) == 1042 and len(a) == 1038, "duplicate-ELF-row"
    assert b["usr/bin/gpg"]["sha256"] == raw.GPG_SHA
    assert b["usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6"]["sha256"] == raw.SQLITE_SHA
    assert [r["path"] for r in b.values() if "libsqlite3.so.0" in r["needed"]] == ["usr/bin/gpg"]
    assert [r["path"] for r in b.values() if r["soname"] == "libsqlite3.so.0"] == ["usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6"]
    retained = {}
    for path, row in b.items():
        removed_owners = [o for o in row["owners"] if o.split(":")[0] in raw.REMOVE]
        if removed_owners: assert len(removed_owners) == len(row["owners"]), "mixed-ownership"
        else: retained[path] = row
    assert a == retained and len(b) - len(retained) == 4, "missing-or-changed-retained-ELF"
    providers = {}
    for row in a.values():
        assert "libsqlite3.so.0" not in row["needed"] and row["soname"] != "libsqlite3.so.0"
        if row["soname"]:
            assert row["soname"] not in providers, "ambiguous-provider"
            providers[row["soname"]] = row["path"]
    for row in a.values():
        assert all(n in providers for n in row["needed"]), "missing-retained-provider"
    return {"pairedInventoryPassed": True, "baselineRegularElfPayloads": 1042, "candidateRegularElfPayloads": 1038, "baselineSqliteProviders": 1, "candidateSqliteProviders": 0, "baselineDirectConsumers": ["usr/bin/gpg"], "candidateDirectConsumers": [], "removedPackages": sorted(raw.REMOVE), "remainingProviders": providers, "allRetainedElfRowsUnchanged": True, "allRetainedPackageRecordsUnchanged": True, "runtimeCompatibilityQualified": False, "candidateReleaseQualified": False, "riskAccepted": False}


if __name__=='__main__':
    try:
        args=sys.argv[1:]
        if args[0]=='inventory':
            assert len(args)==7;result=inventory(args[1],args[2],args[3],args[4]);destination=args[5];assert args[6]=='strict'
        elif args[0]=='derive':
            assert len(args)==7;result=seal.derive_seal(json.loads(Path(args[1]).read_text()),json.loads(Path(args[2]).read_text()),args[3],args[4],json.loads(Path(args[5]).read_text()));destination=args[6]
        else:
            assert args[0]=='pair' and len(args)==5;result=validate_pair(*(json.loads(Path(p).read_text()) for p in args[1:4]));destination=args[4]
        text=json.dumps(result,indent=2)+'\n';assert len(text.encode())<=24*1024**2
        with open(destination,'x') as f:f.write(text)
        print(json.dumps({'profile':'explicit-composite-v1','completed':True,'candidateReleaseQualified':False}))
    except Exception:
        sys.stderr.write('Composite provenance/inventory held; no oracle learned.\n');sys.exit(1)
