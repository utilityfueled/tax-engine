// Spec: spec/federal/shared-marketplace-health-other-allocations.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { FORM_7206_FIELDS as H,fillForm7206 } from '@/pdf/fill-form-7206';
import { FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { noAdvanceSharedHealthInput } from '../fixtures/shared-marketplace-health-other-allocations';

function inspect(path:string):{pages:string[];fields:Record<string,string>}{
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',`
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))
`,path],{encoding:'utf8',timeout:5000}));
}
it('prints actual allocation methods without changing calculation precision or source privacy',async()=>{
  const input=noAdvanceSharedHealthInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input);
  const redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result),dir=mkdtempSync(join(tmpdir(),'tax-shared-health-no-advance-'));
  try{
    const packet=await fillReturn(redacted,hidden,{blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false,premiumTaxCreditReview:prepared});
    const healthPath=packet.filledForms.find(file=>/form-7206-/.test(file)),creditPath=packet.filledForms.find(file=>file.endsWith('/f8962-filled.pdf'));
    expect(healthPath).toBeTruthy();expect(creditPath).toBeTruthy();if(!healthPath||!creditPath)throw new Error('Missing actual health/credit forms');
    const health=inspect(healthPath),credit=inspect(creditPath),text=health.pages.join(' ');
    expect(health.fields[H.line14]).toBe('0');
    expect([credit.fields[P.line24],credit.fields[P.line25],credit.fields[P.line26],credit.fields[P.line29]]).toEqual(['9264','0','9264','']);
    expect(P.allocations[0].slice(4).map(field=>credit.fields[field])).toEqual(['0.67','','']);
    for(const value of ['original premium $1500','owner/business paid $1000','other persons paid $500','actual advance credit $0','premium $1000; advances $0','Step 2 credit: $10920','Final Form 8962 credit: $9264','Schedule 1 line 17 transfer: $1080'])expect(text).toContain(value);
    for(const page of [...health.pages,...credit.pages]){expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');expect(page).not.toMatch(/123.?45.?6789|234.?56.?7890/);}
    const changed=structuredClone(input);changed.form8962!.sharedPolicyAllocations!.policies![0].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='500.01';
    await expect(fillForm7206(changed,result,'/missing','scheduleC','primary',undefined,prepared)).rejects.toThrow(/stale|conflict/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
