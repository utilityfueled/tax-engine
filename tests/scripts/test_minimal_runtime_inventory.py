"""Synthetic read-only tar controls for the separate explicit absence policy."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("minimal", ROOT / "infra/postgres-minimal-runtime/inspect.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def archive(path, entries):
    with tarfile.open(path, "w") as tf:
        for name, data in entries:
            info = tarfile.TarInfo(name); info.size = len(data)
            tf.addfile(info, io.BytesIO(data))


def dynamic(path):
    data = path.read_bytes()
    return {"needed": ["libsqlite3.so.0"] if data.endswith(b"consumer") else [],
            "soname": "libsqlite3.so.0" if data.endswith(b"provider") else None}


def synthetic_pair():
    row = lambda path, owner: {"path": path, "sha256": "a" * 64, "bytes": 128, "needed": [], "soname": None, "owners": [owner]}
    retained = [row("usr/bin/retained-%d" % n, "retained") for n in range(1038)]
    removed = [row("usr/bin/gpg", "gpg"), row("usr/bin/gpg-wks-server", "gpg-wks-server"), row("usr/lib/gnupg/gpg-wks-client", "gpg-wks-client"), row("usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6", "libsqlite3-0:amd64")]
    removed[0].update(sha256=m.GPG_SHA, needed=["libsqlite3.so.0"])
    removed[3].update(sha256=m.SQLITE_SHA, soname="libsqlite3.so.0")
    versions = {"retained%d:amd64" % n: "1" for n in range(149)}
    versions["gpgv:amd64"] = "1"
    before_versions = {**versions, **{n + ":amd64": "1" for n in m.REMOVE}}
    base = {"schema": 1, "status": "BASELINE_INVENTORIED", "parserCompleted": True, "archiveSha256": "b" * 64, "archiveBytes": 4096, "allRegularElfPayloads": retained + removed, "installedPackageVersions": before_versions, "payloadHashes": {n: "c" * 64 for n in m.PROTECTED}, "dpkgStatusSha256": m.STATUS_SHA, "temporaryPayloadsRemoved": True, "allRuntimeUsesDiscovered": False, "runtimeCompatibilityQualified": False}
    base["payloadHashes"]["usr/local/bin/docker-entrypoint.sh"] = m.ENTRYPOINT_SHA
    candidate = copy.deepcopy(base); candidate.update(status="ABSENCE_INVENTORIED", allRegularElfPayloads=retained, installedPackageVersions=versions, packageControls={"passed": True})
    return base, candidate


class Inventory(unittest.TestCase):
    def test_explicit_absence_needs_valid_nonempty_inventory_and_status(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); path = root / "root.tar"
            status = b"Package: retained\nStatus: install ok installed\nArchitecture: amd64\nVersion: 1\n"
            good = [("usr/bin/retained", b"\x7fELFretained"), ("var/lib/dpkg/status", status), ("var/lib/dpkg/info/retained.list", b"/usr/bin/retained\n")]
            archive(path, good)
            report = m.inspect_archive(path, root, "absent", dynamic)
            self.assertEqual(report["status"], "ABSENCE_INVENTORIED")
            self.assertEqual(report["sqliteProviders"], [])
            self.assertFalse(report["allRuntimeUsesDiscovered"])
            for bad in [[], good[1:], good[:1], good + [("../outside", b"x")], good + [good[0]], good + [("usr/lib/sqlite", b"\x7fELFprovider")], good + [("usr/bin/use", b"\x7fELFconsumer")]]:
                archive(path, bad)
                with self.assertRaises((AssertionError, ValueError)): m.inspect_archive(path, root, "absent", dynamic)

    def test_parser_error_is_failure_not_absence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); path = root / "root.tar"
            archive(path, [("usr/bin/broken", b"\x7fELFbad")])
            with self.assertRaises((AssertionError, ValueError)): m.inspect_archive(path, root, "absent")

    def test_required_policy_cannot_be_used_for_absence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); path = root / "root.tar"
            archive(path, [("usr/bin/retained", b"\x7fELFretained"), ("var/lib/dpkg/status", b"Package: retained\nStatus: install ok installed\nArchitecture: amd64\nVersion: 1\n")])
            with self.assertRaises(AssertionError): m.inspect_archive(path, root, "baseline", dynamic)
            with self.assertRaises(AssertionError): m.inspect_archive(path, root, "unknown", dynamic)

    def test_pair_requires_every_retained_elf_package_and_provider(self):
        before, after = synthetic_pair()
        self.assertTrue(m.validate_pair(before, after)["pairedInventoryPassed"])
        changes = [lambda r: r["allRegularElfPayloads"].pop(), lambda r: r["allRegularElfPayloads"][0].update(sha256="f" * 64), lambda r: r["installedPackageVersions"].pop("gpgv:amd64"), lambda r: r["installedPackageVersions"].update({"gpg:amd64": "1"}), lambda r: r["allRegularElfPayloads"][0].update(needed=["missing.so.0"]), lambda r: r.update(status="FAILED"), lambda r: r.update(parserCompleted=False), lambda r: r["payloadHashes"].pop("usr/local/bin/docker-entrypoint.sh")]
        for mutate in changes:
            broken = copy.deepcopy(after); mutate(broken)
            with self.assertRaises((AssertionError, KeyError)): m.validate_pair(before, broken)

    def test_production_counts_reject_incomplete_pair(self):
        before, after = synthetic_pair(); before["allRegularElfPayloads"].pop()
        with self.assertRaises(AssertionError): m.validate_pair(before, after)


if __name__ == "__main__": unittest.main(verbosity=2)
