// Spec: spec/state/guided-pa-royalty-sources.yaml.
import {expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {startCompleteInterview,completeW2Entry} from '../../guided-interview/complete-facts';
import {actualGuidedPARoyaltySources} from '../../fixtures/guided-pa-royalty-sources';
import {REVIEW_PDF_NOTICE} from '@/pdf/export-policy';
vi.mock('server-only',()=>({}));
it('exports actual guided PA royalty records with private source binding',async()=>{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','royalties'],lifeEvents:[],stateCode:'PA'});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'200000'}]};
 state.sectionData['income-royalties']=actualGuidedPARoyaltySources();
 const workspace=createWorkspaceRecord('synthetic-pa-royalty-export',{now:'2026-10-26T00:00:00.000Z'});
 workspace.returnSummary.targetTaxYear=2025;
 const before=JSON.stringify(state),dir=await mkdtemp(join(tmpdir(),'pa-royalty-workspace-'));
 try {
  const download=await buildWorkspaceFilledReturnDownload(workspace,state);
  expect(download.includedForms).toContain('f1040se-filled.pdf');expect(download.includedForms).toContain('pa-schedule-e-reference.pdf');
  const path=join(dir,'review.pdf');await writeFile(path,download.contents);
  const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:10000}));
  const royalty=pages.filter(page=>page.includes('Actual PA royalty net income or loss'));expect(royalty).toHaveLength(1);
  expect(royalty[0]).toMatch(/Actual PA royalty net income or loss:\s+11000/);expect(royalty[0]).toContain('Royalty property 1 - Primary taxpayer');
  for(const page of pages){expect(page).toContain(REVIEW_PDF_NOTICE);for(const secret of ['111223333','royalty-original-1','royalty-account-1','Fictional private legal receipt','Fictional PA property classification record'])expect(page).not.toContain(secret);}
  expect(JSON.stringify(state)).toBe(before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
