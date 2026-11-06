// Spec: spec/federal/form-8962-marriage-return.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { marriageSourcesFixture } from '../../fixtures/marriage-sources.js';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { initialFlowState } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/guided-interview-bridge',()=>({buildTaxInputFromGuidedData:vi.fn()}));
afterEach(()=>vi.clearAllMocks());

it('exports a marriage review packet through the actual workspace source context',async()=>{
 const input=marriageSourcesFixture();Object.assign(input.w2s[0],{wages:'117000',socialSecurityWages:'117000',medicareWages:'117000',federalWithheld:'0',accountHolder:'primary'});
 input.taxpayer.address.state='TX';
 const workspace=createWorkspaceRecord('actual-marriage-source');workspace.returnSummary.targetTaxYear=2025;
 const guided=structuredClone(initialFlowState);guided.taxYear=2025;guided.segmentation.stateCode='TX';
 vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(input);
 const before=JSON.stringify(input),packet=await buildWorkspaceFilledReturnDownload(workspace,guided);
 expect(packet.includedForms).toContain('f8962-filled.pdf');expect(packet.includedForms).toContain('f8962-reference-filled.pdf');
 const dir=await mkdtemp(join(tmpdir(),'workspace-marriage-'));
 try {
  const file=join(dir,'packet.pdf');await writeFile(file,packet.contents);
  const text=execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport sys\nr=PdfReader(sys.argv[1])\nprint("\\n".join(p.extract_text() or "" for p in r.pages))',file],{encoding:'utf8',timeout:5000});
  expect(text).toContain('Alternative Calculation for Year of Marriage');expect(text).toContain('Pub974 Marriage Worksheet V');expect(text).toContain('1402');
  for(const ssn of ['111-22-3333','111223333','444-55-6666','444556666','777-88-1111','777881111','777-88-2222','777882222'])expect(text).not.toContain(ssn);
 } finally {await rm(dir,{recursive:true,force:true});}
 expect(JSON.stringify(input)).toBe(before);
 input.form1095A[0].monthlyPremiums[0].enrolleePremium='500.001';
 await expect(buildWorkspaceFilledReturnDownload(workspace,guided)).rejects.toThrow(/source|original|reconcile/);
});
