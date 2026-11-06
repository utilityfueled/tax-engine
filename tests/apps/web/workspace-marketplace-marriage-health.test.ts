// Spec: spec/federal/marketplace-marriage-health.yaml.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {guidedMarketplaceMarriageHealthState} from '../../fixtures/guided-marketplace-marriage-health';
vi.mock('server-only',()=>({}));
it('exports actual guided marriage and health sources together',async()=>{
  const state=guidedMarketplaceMarriageHealthState(),before=JSON.stringify(state),workspace=createWorkspaceRecord('actual-marriage-health');workspace.returnSummary.targetTaxYear=2025;
  const download=await buildWorkspaceFilledReturnDownload(workspace,state),dir=mkdtempSync(join(tmpdir(),'workspace-marriage-health-'));
  try{
    expect(download.includedForms).toContain('f8962-filled.pdf');expect(download.includedForms).toContain('f8962-reference-filled.pdf');
    expect(download.includedForms.filter(path=>path.includes('form-7206-'))).toHaveLength(1);
    const path=join(dir,'review.pdf');writeFileSync(path,download.contents);
    const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))",path],{encoding:'utf8',timeout:5000}));
    const text=pages.join(' ').replace(/\s+/g,' ');
    for(const literal of ['Return-level Schedule 1 line 17 transfer: $6338','Final Form 8962 credit: $5149','Step 2 credit: $5662','Alternative Calculation for Year of Marriage','Pub974 Marriage Worksheet V'])expect(text).toContain(literal);
    for(const page of pages){expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666/);}
    expect(JSON.stringify(state)).toBe(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
