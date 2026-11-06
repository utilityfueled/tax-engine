// Spec: spec/federal/form-1099-q-distinct-in-kind-assistance.yaml.
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedDistinctInKind } from '../../fixtures/guided-distinct-in-kind';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
vi.mock('server-only',()=>({}));
it('reopens the actual distinct tuition guided workspace packet',async()=>{
  const { state, original } = actualGuidedDistinctInKind(), before=JSON.stringify(state);
  const workspace=createWorkspaceRecord('synthetic-distinct-tuition',{now:'2026-10-26T00:00:00.000Z'});
  workspace.returnSummary.targetTaxYear=2025;
  const dir=await mkdtemp(join(tmpdir(),'distinct-tuition-workspace-'));
  try {
    const download=await buildWorkspaceFilledReturnDownload(workspace,state), path=join(dir,'review.pdf');await writeFile(path,download.contents);
    expect(download.includedForms).toContain('f5329-primary-filled.pdf');expect(download.includedForms).toContain('f1099q-reference-filled.pdf');
    const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:10000}));
    const text=pages.join(' ').replace(/\s+/g,' ');
    expect(text).toContain('Tax-free assistance: $1000');expect(text).toContain('Tax-free assistance: $1500');
    expect(text).toContain('Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $425');
    expect(text).toContain('Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $43');
    for(const page of pages) { expect(page).toContain(REVIEW_PDF_NOTICE);for(const secret of [original.taxpayer.primary.ssn,'prepaid-account','second-actual-account'])expect(page).not.toContain(secret); }
    expect(JSON.stringify(state)).toBe(before);
  }finally{await rm(dir,{recursive:true,force:true});}
});
