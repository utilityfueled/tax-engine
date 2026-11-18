"""Separate paired removal inventory. Never execute payloads or follow tar links."""
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("strict_original_elf", ROOT / "infra/sqlite-runtime-consumers/inspect.py")
original = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(original)
REMOVE = {"gnupg", "gpg", "gpg-wks-client", "gpg-wks-server", "libsqlite3-0"}
STATUS_SHA = "115f014bc7b114c49ee0321b01f9cd3b3f1bdd608cc97812010c9452970c4806"
ENTRYPOINT_SHA = "9c440299ae04a0a79d55b8bf03307036d890a40979d2fb698073c9050d4b20a5"
GPG_SHA = "f3a8498aa43e3a45f265d14211bba2653cacf2b9631f373db97b30f2cb96c738"
SQLITE_SHA = "2e6eef9a727f081f0d453b4e5e6cbd8b9ef8b6f86cbf7681cbad444d3b0b55c8"
PROTECTED = ["usr/local/bin/docker-entrypoint.sh", "usr/local/bin/gosu", "usr/bin/apt-get", "usr/bin/dpkg", "usr/bin/dpkg-query", "usr/bin/gpgv"] + ["usr/lib/postgresql/16/bin/" + n for n in ["postgres", "initdb", "pg_ctl", "pg_dump", "pg_restore", "psql", "pg_isready"]]
META = "usr/local/share/tax-engine-runtime-inventory/"


def inspect_archive(archive, work, policy, reader=original.read_dynamic):
    assert policy in ("baseline", "absent"), "explicit-policy-required"
    archive = Path(archive); info = archive.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= 2 * 1024 ** 3
    before = original.digest(archive); original.preflight_tar(archive)
    seen, rows, owners, versions, payloads, metadata = set(), [], {}, {}, {}, {}
    links = 0; status_sha = None
    with tempfile.TemporaryDirectory(prefix="minimal-elf-", dir=work) as temporary:
        with tarfile.open(archive, "r:") as source:
            for member in source:
                name = member.name.rstrip("/")
                if member.isdir() and name in (".", ""): continue
                path = PurePosixPath(name)
                assert name and len(name) <= 4096 and not path.is_absolute() and ".." not in path.parts
                name = str(path)
                assert name not in seen and len(seen) < 100000, "duplicate-or-excessive-entry"
                seen.add(name)
                if member.issym() or member.islnk(): links += 1; continue
                if not member.isfile(): continue
                assert not member.issparse() and 0 <= member.size <= 256 * 1024 ** 2
                with source.extractfile(member) as handle:
                    prefix = handle.read(4)
                    selected = name in PROTECTED or name == "var/lib/dpkg/status" or name.startswith(META) or (name.startswith("var/lib/dpkg/info/") and name.endswith(".list"))
                    if prefix != b"\x7fELF" and not selected: continue
                    raw = prefix + handle.read(member.size); assert len(raw) == member.size
                if name in PROTECTED: payloads[name] = hashlib.sha256(raw).hexdigest()
                if prefix == b"\x7fELF":
                    assert len(rows) < 2048
                    local = Path(temporary) / ("payload-%d" % len(rows))
                    with local.open("xb") as output: output.write(raw)
                    dynamic = reader(local); assert set(dynamic) == {"needed", "soname"}
                    assert isinstance(dynamic["needed"], list)
                    rows.append({"path": name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), **dynamic}); local.unlink()
                if name.startswith("var/lib/dpkg/info/") and name.endswith(".list"):
                    assert len(raw) <= 1024 ** 2
                    package = path.name[:-5]; assert re.fullmatch(r"[a-z0-9][a-z0-9+.:\-]*", package)
                    for line in raw.decode("utf8", errors="strict").splitlines():
                        if line.startswith("/"): owners.setdefault(line.lstrip("/"), []).append(package)
                elif name == "var/lib/dpkg/status":
                    assert len(raw) <= 8 * 1024 ** 2; status_sha = hashlib.sha256(raw).hexdigest()
                    for paragraph in raw.decode("utf8", errors="strict").split("\n\n"):
                        fields = dict(line.split(": ", 1) for line in paragraph.splitlines() if line and not line[0].isspace() and ": " in line)
                        if fields.get("Status") == "install ok installed":
                            key = fields["Package"] + ":" + fields["Architecture"]; assert key not in versions
                            versions[key] = fields["Version"]
                elif name.startswith(META):
                    assert len(raw) <= 1024 ** 2 and sum(map(len, metadata.values())) + len(raw) <= 8 * 1024 ** 2
                    metadata[name[len(META):]] = raw.decode("utf8", errors="strict")
    assert original.digest(archive) == before, "archive-changed"
    assert rows and versions and status_sha, "missing-ELF-or-package-status"
    for row in rows: row["owners"] = sorted(set(owners.get(row["path"], [])))
    providers = [r for r in rows if r["soname"] == "libsqlite3.so.0"]
    consumers = [r for r in rows if "libsqlite3.so.0" in r["needed"]]
    if policy == "baseline": assert providers and consumers, "missing-baseline-sqlite-evidence"
    else: assert not providers and not consumers, "sqlite-not-absent"
    controls = {"passed": False}
    if policy == "absent" and metadata:
        assert metadata["PACKAGE-CONTROLS.txt"] == "private-build-package-controls-passed; native qualification still required\n"
        for side in ("before", "after"):
            assert metadata["dpkg-audit-" + side + ".txt"] == ""
            assert "apt-dependency-check-" + side + ".txt" in metadata
        assert metadata["protected-before.sha256"] == metadata["protected-after.sha256"]
        expected = "\n".join(sorted(REMOVE)) + "\n"
        assert metadata["expected-removals.txt"] == metadata["plan-removals.txt"] == metadata["actual-removals.txt"] == expected
        assert metadata["new-package-records.tsv"] == ""
        controls = {"passed": True, "metadata": metadata}
    return {"schema": 1, "status": "BASELINE_INVENTORIED" if policy == "baseline" else "ABSENCE_INVENTORIED", "parserCompleted": True,
            "archiveSha256": before, "archiveBytes": info.st_size, "members": len(seen), "regularElfPayloads": len(rows), "linkEntriesNotFollowed": links,
            "allRegularElfPayloads": rows, "installedPackageVersions": versions, "payloadHashes": payloads, "dpkgStatusSha256": status_sha,
            "sqliteProviders": providers, "sqliteDirectConsumers": consumers, "packageControls": controls,
            "scope": "regular-ELF-DT_NEEDED-paired-removal-only", "allRuntimeUsesDiscovered": False, "runtimeCompatibilityQualified": False, "temporaryPayloadsRemoved": True}


def validate_pair(before, after):
    for value, status, elf_count, package_count in [(before, "BASELINE_INVENTORIED", 1042, 155), (after, "ABSENCE_INVENTORIED", 1038, 150)]:
        assert value["schema"] == 1 and value["status"] == status and value["parserCompleted"] is True
        assert value["temporaryPayloadsRemoved"] is True and value["allRuntimeUsesDiscovered"] is False and value["runtimeCompatibilityQualified"] is False
        assert re.fullmatch(r"[0-9a-f]{64}", value["archiveSha256"]) and 0 < value["archiveBytes"] <= 2 * 1024 ** 3
        assert len(value["allRegularElfPayloads"]) == elf_count and len(value["installedPackageVersions"]) == package_count
        assert all(p in value["payloadHashes"] for p in PROTECTED), "missing-required-payload"
    assert before["dpkgStatusSha256"] == STATUS_SHA
    assert before["payloadHashes"][PROTECTED[0]] == ENTRYPOINT_SHA
    assert before["payloadHashes"] == after["payloadHashes"], "protected-payload-changed"
    assert after["packageControls"]["passed"] is True
    bv, av = before["installedPackageVersions"], after["installedPackageVersions"]
    removed = {k for k in bv if k.split(":")[0] in REMOVE}
    assert len(removed) == 5 and {k.split(":")[0] for k in removed} == REMOVE
    assert av == {k: v for k, v in bv.items() if k not in removed}, "retained-package-drift"
    b = {r["path"]: r for r in before["allRegularElfPayloads"]}; a = {r["path"]: r for r in after["allRegularElfPayloads"]}
    assert len(b) == 1042 and len(a) == 1038, "duplicate-ELF-row"
    assert b["usr/bin/gpg"]["sha256"] == GPG_SHA
    assert b["usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6"]["sha256"] == SQLITE_SHA
    assert [r["path"] for r in b.values() if "libsqlite3.so.0" in r["needed"]] == ["usr/bin/gpg"]
    assert [r["path"] for r in b.values() if r["soname"] == "libsqlite3.so.0"] == ["usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6"]
    retained = {}
    for path, row in b.items():
        removed_owners = [o for o in row["owners"] if o.split(":")[0] in REMOVE]
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
    return {"pairedInventoryPassed": True, "baselineRegularElfPayloads": 1042, "candidateRegularElfPayloads": 1038, "baselineSqliteProviders": 1, "candidateSqliteProviders": 0, "baselineDirectConsumers": ["usr/bin/gpg"], "candidateDirectConsumers": [], "removedPackages": sorted(REMOVE), "remainingProviders": providers, "allRetainedElfRowsUnchanged": True, "allRetainedPackageRecordsUnchanged": True, "runtimeCompatibilityQualified": False, "candidateReleaseQualified": False, "riskAccepted": False}


if __name__ == "__main__":
    try:
        if len(sys.argv) == 5 and sys.argv[1] == "--pair":
            result = validate_pair(json.loads(Path(sys.argv[2]).read_text()), json.loads(Path(sys.argv[3]).read_text())); destination = sys.argv[4]
        else:
            assert len(sys.argv) == 5
            result = inspect_archive(sys.argv[1], sys.argv[2], sys.argv[3]); destination = sys.argv[4]
        raw = json.dumps(result, indent=2) + "\n"; assert len(raw.encode()) <= 16 * 1024 ** 2
        with open(destination, "x") as output: output.write(raw)
        print(json.dumps({"status": result.get("status", "PAIRED_INVENTORY_PASSED"), "candidateReleaseQualified": False}))
    except Exception:
        sys.stderr.write("Minimal runtime inventory held.\n"); sys.exit(1)
