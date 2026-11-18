"""Private shell-path controls. Commands are fake; no image or package tools run."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parents[2] / "infra/postgres-minimal-runtime"
SPEC = json.loads((HERE / "policy.json").read_text())
PACKAGES = {n: ["2.2.40-1.1+deb12u2", "amd64"] for n in SPEC["removeExactly"]}
PACKAGES["libsqlite3-0"] = ["3.40.1-2+deb12u2", "amd64"]
PACKAGES["gnupg"][1] = "all"
PACKAGES.update({n: ["retained-version", "amd64"] for n in SPEC["retain"]})

FAKE = r'''#!/usr/bin/env python3
import os,sys,json,pathlib,hashlib
name=pathlib.Path(sys.argv[0]).name; args=sys.argv[1:]
state=pathlib.Path(os.environ['CONTROL_STATE']); scenario=os.environ['CONTROL_SCENARIO']
spec=json.loads(pathlib.Path(os.environ['CONTROL_SPEC']).read_text())
packages=json.loads(os.environ['CONTROL_PACKAGES']); removed=(state/'purged').exists()
with (state/'calls').open('a') as f:f.write(json.dumps([name,args])+'\n')
if name=='dpkg':
 if args==['--print-architecture']: print('arm64' if scenario=='wrong-arch' else 'amd64')
 elif args==['--audit']:
  if scenario=='initial-audit' or (removed and scenario=='final-audit'):print('broken package')
 else:sys.exit(91)
elif name=='dpkg-query':
 for package,(version,arch) in sorted(packages.items()):
  if removed and package in spec['removeExactly'] and not(scenario=='missing-removal' and package=='gpg'):continue
  if removed and scenario=='changed-version' and package=='gpgv':version='unexpected-version'
  print('\t'.join([package,version,arch,'install ok installed']))
 if removed and scenario=='added-package':print('unexpected\t1\tamd64\tinstall ok installed')
elif name=='apt-get':
 if args==['check']:
  if scenario=='initial-dependencies' or (removed and scenario=='final-dependencies'):sys.exit(100)
 elif '--simulate' in args:
  targets=list(spec['removeExactly'])
  if scenario=='extra-plan':targets.append('postgresql-16')
  if scenario=='incomplete-plan':targets.remove('gpg')
  if scenario=='duplicate-plan':targets.append('gpg')
  if scenario=='install-plan':print('Inst surprise [1] (2 Debian:bookworm [amd64])')
  if scenario=='configure-plan':print('Conf surprise (2 Debian:bookworm [amd64])')
  for p in targets:print('Purg '+p+' [1]')
  if scenario=='simulate-failure':sys.exit(100)
 else:
  if '-y' not in args or 'APT::Get::AutomaticRemove=false' not in args:sys.exit(92)
  if sorted(args[args.index('purge')+1:])!=sorted(spec['removeExactly']):sys.exit(93)
  (state/'purged').write_text('only simulated by fake command')
  if scenario=='purge-failure':sys.exit(100)
elif name=='sha256sum':
 for arg in args:
  if arg=='/var/lib/dpkg/status':
   digest='0'*64 if scenario=='wrong-status' else spec['initialDpkgStatusSha256']
  else:digest=hashlib.sha256(arg.encode()).hexdigest()
  if removed and scenario=='changed-executable' and arg.endswith('/gpgv'):digest='f'*64
  print(digest+'  '+arg)
else:sys.exit(94)
'''


class Controls(unittest.TestCase):
    def exercise(self, scenario):
        with tempfile.TemporaryDirectory(prefix="private-pg-removal-control-") as td:
            root = Path(td); fakebin = root / "bin"; fakebin.mkdir()
            commands = ["apt-get", "dpkg", "dpkg-query", "sha256sum", "gpgv", "initdb", "postgres", "pg_ctl", "pg_dump", "pg_restore", "psql", "pg_isready", "gosu", "gunzip", "xzcat", "zstd", "docker-entrypoint.sh"]
            for name in commands:
                p = fakebin / name; p.write_text(FAKE); p.chmod(0o755)
            env = {**os.environ, "PATH": str(fakebin) + os.pathsep + os.environ["PATH"], "CONTROL_STATE": str(root), "CONTROL_SCENARIO": scenario, "CONTROL_SPEC": str(HERE / "policy.json"), "CONTROL_PACKAGES": json.dumps(PACKAGES)}
            result = subprocess.run(["/bin/sh", os.environ.get("CONTROL_SCRIPT", str(HERE / "remove-runtime-packages.sh")), str(root / "evidence")], env=env, capture_output=True, text=True, timeout=15)
            calls = [json.loads(x) for x in (root / "calls").read_text().splitlines()] if (root / "calls").exists() else []
            mutation = [x for x in calls if x[0] == "apt-get" and "purge" in x[1] and "--simulate" not in x[1]]
            return result, mutation

    def test_exact_plan_reaches_explicit_purge_and_passes(self):
        r, mutation = self.exercise("pass")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(mutation), 1)

    def test_bad_admission_cannot_reach_package_mutation(self):
        for scenario in ["wrong-arch", "wrong-status", "initial-audit", "initial-dependencies", "extra-plan", "incomplete-plan", "duplicate-plan", "install-plan", "configure-plan", "simulate-failure"]:
            with self.subTest(scenario=scenario):
                r, mutation = self.exercise(scenario)
                self.assertNotEqual(r.returncode, 0)
                self.assertEqual(mutation, [])

    def test_post_mutation_drift_prevents_acceptance(self):
        for scenario in ["final-audit", "final-dependencies", "missing-removal", "changed-version", "added-package", "changed-executable", "purge-failure"]:
            with self.subTest(scenario=scenario):
                r, mutation = self.exercise(scenario)
                self.assertNotEqual(r.returncode, 0)
                self.assertEqual(len(mutation), 1)


if __name__ == "__main__": unittest.main(verbosity=2)
