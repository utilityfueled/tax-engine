"""Inert controls: no compiler, container, network, or service calls."""
from pathlib import Path
import copy,hashlib,importlib.util,json,sqlite3,tempfile,unittest

E=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('apply_experiment',E/'apply-experiment.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
ROWS=json.loads((E/'changes.json').read_text())['changes']

class Controls(unittest.TestCase):
    def test_exact_three_paths(self):
        self.assertEqual({r['path']for r in ROWS},adapter.PATHS)
        self.assertEqual(len(ROWS),3)

    def test_exact_source_hashes_required(self):
        for row in ROWS:
            with self.assertRaises(AssertionError):adapter.transform(b'foreign source',row)

    def test_official_null_guard_only(self):
        row=next(r for r in ROWS if r['path'].endswith('sqlite3recover.c'))
        self.assertEqual(len(row['hunks']),1)
        h=row['hunks'][0]
        self.assertEqual(h['after'].replace('if( zTbl ) recoverAddTable','recoverAddTable'),h['before'])

    def test_flag_capability_uses_real_macro(self):
        row=next(r for r in ROWS if r['path'].endswith('test_config.c'))
        self.assertIn('#ifdef SQLITE_ALLOW_ROWID_IN_VIEW',row['hunks'][0]['after'])
        self.assertIn('"allow_rowid_in_view", "1"',row['hunks'][0]['after'])
        self.assertIn('"allow_rowid_in_view", "0"',row['hunks'][0]['after'])

    def test_both_original_upstream_oracles_retained(self):
        row=next(r for r in ROWS if r['path']=='test/join8.test')
        s=''.join(h['after']for h in row['hunks'])
        self.assertIn('set res {1 {no such column: rowid}}',s)
        self.assertIn('set res {0 1}',s)
        self.assertIn('ifcapable allow_rowid_in_view',s)
        self.assertNotIn('recoverfault2.test',adapter.PATHS)

    def test_nonqualifying_original_statuses(self):
        s=(E/'run.sh').read_text()
        for text in ['record fullOriginalSuitesExecuted false','record candidateReleaseQualified false','record riskAccepted false','record historicalOom2330CauseConfirmed false']:
            self.assertIn(text,s)
        self.assertLess(s.index('as_test ./testfixture test/join8.test'),s.index('--source /qualification-work/upstream'))

    def test_all_original_cases_and_faults_remain(self):
        s=(E/'run.sh').read_text()
        self.assertEqual(s.count('as_test ./testfixture test/join8.test'),2)
        self.assertEqual(s.count('as_test ./testfixture ext/recover/recoverfault2.test'),2)
        self.assertNotIn('-start 2330',s)
        self.assertIn('cmp ext/recover/recoverfault2.test /qualification-work/baseline/ext/recover/recoverfault2.test',s)

    def test_capability_grammar_causal_example(self):
        db=sqlite3.connect(':memory:')
        try:
            sql=db.execute("SELECT printf('PRAGMA table_xinfo(%Q)',NULL)").fetchone()[0]
            self.assertEqual(sql,'PRAGMA table_xinfo(NULL)')
            with self.assertRaisesRegex(sqlite3.OperationalError,'near "NULL": syntax error'):db.execute(sql)
            db.execute('CREATE TABLE t1(a)')
            self.assertEqual(db.execute("PRAGMA table_xinfo('t1')").fetchone()[1],'a')
        finally:db.close()

    def test_modified_hunk_output_fails(self):
        row={'beforeSha256':hashlib.sha256(b'a').hexdigest(),'afterSha256':hashlib.sha256(b'b').hexdigest(),'hunks':[{'before':'a','after':'c'}]}
        with self.assertRaisesRegex(AssertionError,'expected-upstream-result'):adapter.transform(b'a',row)

    def test_ambiguous_hunk_fails(self):
        row={'beforeSha256':hashlib.sha256(b'aa').hexdigest(),'afterSha256':'0'*64,'hunks':[{'before':'a','after':'b'}]}
        with self.assertRaisesRegex(AssertionError,'unique-official-hunk'):adapter.transform(b'aa',row)

    def test_fresh_record_and_source_required(self):
        with tempfile.TemporaryDirectory()as t:
            p=Path(t).resolve();record=p/'record';record.write_text('prior')
            with self.assertRaisesRegex(AssertionError,'fresh-record'):adapter.apply(p,record)

    def test_limits_inherited(self):
        s=(E/'run.sh').read_text()
        self.assertIn('make -j2 USE_AMALGAMATION=1 testfixture',s)
        self.assertNotIn('timeout',s)
        self.assertNotIn('unconfined',s)

if __name__=='__main__':unittest.main()
