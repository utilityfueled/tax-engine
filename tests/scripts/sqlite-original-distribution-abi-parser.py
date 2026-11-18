"""Spec: spec/ops/sqlite-original-distribution-abi.yaml. Synthetic custody tests only."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('original_stager', ROOT/'scripts/lib/stage-sqlite-original-abi.py')
stager = importlib.util.module_from_spec(spec); spec.loader.exec_module(stager)


class Controls(unittest.TestCase):
    def fixture(self, p):
        expected = {'verified': True}
        bodies = [b'library fixture', b'debug fixture']
        a = {'schema':1,'version':'3.40.1-2+deb12u2','projection':expected,'packages':[]}
        for name, body in zip(('library.deb','debug.deb'), bodies):
            path = p/name; path.write_bytes(body); path.chmod(0o600)
            a['packages'].append({'name':name,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
        calls = []
        module = types.SimpleNamespace(pair=lambda *args: (calls.append(args) or expected, {'fixed/library': b'not executed'}))
        return a, module, calls

    def test_exact_pair_and_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp).resolve();a,module,calls=self.fixture(p)
            projection,payloads=stager.original_pair(module,a,p)
            self.assertEqual(projection,a['projection']);self.assertEqual(len(calls),1)
            self.assertEqual(calls[0][-1],'3.40.1-2+deb12u2')

    def test_size_hash_and_projection_fail_before_materialization(self):
        for field in ('bytes','sha256','projection'):
            with self.subTest(field=field),tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp).resolve();a,module,calls=self.fixture(p)
                if field=='bytes':a['packages'][0]['bytes']+=1
                elif field=='sha256':a['packages'][0]['sha256']='0'*64
                else:a['projection']={'foreign':True}
                with self.assertRaises(AssertionError):stager.original_pair(module,a,p)
                if field!='projection':self.assertEqual(calls,[])

    def test_aliases_hardlinks_and_group_write_rejected(self):
        for mode in ('symlink','hardlink','writable-file','writable-parent'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp).resolve();a,module,calls=self.fixture(p);file=p/'library.deb'
                if mode in ('symlink','hardlink'):
                    moved=p/'saved';file.rename(moved)
                    if mode=='symlink':file.symlink_to(moved)
                    else:os.link(moved,file)
                elif mode=='writable-file':file.chmod(0o620)
                else:p.chmod(0o720)
                try:
                    with self.assertRaises((AssertionError,OSError)):stager.original_pair(module,a,p)
                    self.assertEqual(calls,[])
                finally:p.chmod(0o700)

    def test_bounded_regular_input_and_fixed_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp).resolve();a,module,calls=self.fixture(p)
            with self.assertRaises(AssertionError):stager.read_owned(p/'library.deb',2)
            a['packages'][0]['name']='../library.deb'
            with self.assertRaises(AssertionError):stager.original_pair(module,a,p)
            self.assertEqual(calls,[])


if __name__=='__main__':unittest.main()
