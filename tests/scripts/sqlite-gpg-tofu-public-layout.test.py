"""Inert synthetic ZIP/ELF controls; no native GPG/provider execution."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
ROOT = Path(__file__).resolve().parents[2]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m
fixtures = load('abi_fixtures', ROOT/'tests/scripts/sqlite-exported-package-abi-parser.py')
prep = load('gpg_prep', ROOT/'infra/sqlite-gpg-tofu-runtime/prepare-pair.py')
INSPECTOR = str(ROOT/'scripts/lib/inspect-sqlite-exported-package-abi.py')


def archive(root, *, passed=True, failed_full=False):
    original = root/'seed.zip'; fixtures.source_zip(original)
    with zipfile.ZipFile(original) as z:
        files = {i.filename:z.read(i) for i in z.infolist()}
    status = {k:0 for k in ['recipeExit','baselinePackageBuildExit','candidatePackageBuildExit','baselineFullTestExit','candidateFullTestExit','candidateRegressionExit','candidateSanitizerRegressionExit']}
    status.update(candidateRegressionCasesPassed=5,candidateSanitizerRegressionCasesPassed=5,baselineRegressionReproduced=True,genericAbiApproval=False,candidateReleaseQualified=False,riskAccepted=False)
    if failed_full: status['candidateFullTestExit'] = 2
    files['artifacts/status.json'] = json.dumps(status, separators=(',',':')).encode()
    files['actual-status.json'] = (json.dumps(status,indent=2)+'\n').encode()
    result = json.loads(files['result.json']);result.update(passed=passed,failure=not passed,checks=[{'step':'source-package-build','exit':0}])
    files['result.json'] = json.dumps(result).encode()
    files['package-checks.json'] = json.dumps(dict(actualChecksPassed=True,architecture='amd64',genericAbiApproval=False,candidateReleaseQualified=False,riskAccepted=False)).encode()
    artifacts = {n[10:]:b for n,b in files.items() if n.startswith('artifacts/') and n not in ['artifacts/export-binding.json','artifacts/ARTIFACTS.sha256']}
    ledger = ''.join(fixtures.module.sha(b)+'  ./'+n+'\n' for n,b in artifacts.items()).encode()
    binding = dict(noAliases=True,originalArtifactLedgerVerified=True,files={n:dict(bytes=len(b),sha256=fixtures.module.sha(b)) for n,b in artifacts.items()})
    binding['files']['ARTIFACTS.sha256'] = dict(bytes=len(ledger),sha256=fixtures.module.sha(ledger))
    files['artifacts/ARTIFACTS.sha256'] = ledger
    files['artifacts/export-binding.json'] = json.dumps(binding).encode()
    out=root/'public.zip'
    with zipfile.ZipFile(out,'x') as z:
        for n,b in files.items():z.writestr(n,b)
    os.chmod(out,0o600)
    return out,fixtures.module.sha(out.read_bytes())


class Controls(unittest.TestCase):
    def test_differently_serialized_original_status_preserves_exact_ledger_bytes(self):
        with tempfile.TemporaryDirectory(prefix='gpg-public-pair-') as d:
            root=Path(d).resolve();z,h=archive(root)
            value=prep.prepare(INSPECTOR,str(z),h,fixtures.SOURCE,'123',str(root/'pair'))
            self.assertTrue(value['originalQualificationPassed'])
            with zipfile.ZipFile(z) as a:
                self.assertEqual((root/'pair/actual-status.json').read_bytes(),a.read('artifacts/status.json'))
            self.assertEqual(len(list((root/'pair').rglob('*.*'))),6)
            self.assertFalse(any('private-keys' in str(p) for p in (root/'pair').rglob('*')))

    def test_cli_accepts_exact_six_arguments_and_emits_only_fixed_receipt_projection(self):
        with tempfile.TemporaryDirectory(prefix='gpg-public-cli-') as d:
            root=Path(d).resolve();z,h=archive(root)
            p=subprocess.run([sys.executable,'-I','-B',str(ROOT/'infra/sqlite-gpg-tofu-runtime/prepare-pair.py'),INSPECTOR,str(z),h,fixtures.SOURCE,'123',str(root/'pair')],capture_output=True,timeout=10)
            self.assertEqual(p.returncode,0,p.stderr.decode())
            value=json.loads(p.stdout);self.assertEqual(set(value),{'directory','expected','originalQualificationPassed','originalStatus','artifactLedgerSha256'})

    def test_failed_original_full_qualification_never_admitted(self):
        for options in [dict(passed=False),dict(failed_full=True)]:
            with self.subTest(options=options),tempfile.TemporaryDirectory(prefix='gpg-public-refusal-') as d:
                root=Path(d).resolve();z,h=archive(root,**options)
                with self.assertRaises(AssertionError):prep.prepare(INSPECTOR,str(z),h,fixtures.SOURCE,'123',str(root/'pair'))
                self.assertFalse((root/'pair').exists())


if __name__ == '__main__':unittest.main()
