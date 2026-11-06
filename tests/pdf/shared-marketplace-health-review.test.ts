// Spec: spec/federal/shared-marketplace-health.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { d } from '@/utils/decimal';
import { fillForm7206, FORM_7206_FIELDS as H } from '@/pdf/fill-form-7206';
import { FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { sharedMarketplaceHealthInput } from '../fixtures/shared-marketplace-health';
const blank='forms/blank/2025/f7206.pdf';
function inspect(path:string):{pages:string[];fields:Record<string,string>;widgets:number}{
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',`
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);widgets=0
for p in r.pages:
 for ref in p.get('/Annots',[]):
  if ref.get_object().get('/Subtype')=='/Widget':widgets+=1
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'widgets':widgets}))
`,path],{encoding:'utf8',timeout:5000}));
}
function privacy(pages:string[]){for(const page of pages){expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');expect(page).not.toMatch(/123.?45.?6789|234.?56.?7890/);}}
it('renders full and allocated health amounts from a private original context',async()=>{
  const input=sharedMarketplaceHealthInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input);
  const redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result),dir=mkdtempSync(join(tmpdir(),'tax-shared-health-pdf-'));
  try{
    expect(redacted.form7206!.plans![0].sharedMarketplaceSources!.persons![0].coveredIndividualSsn).toBe('');
    const doc=await fillForm7206(redacted,hidden,blank,'scheduleC','primary',undefined,prepared),path=join(dir,'health.pdf');
    writeFileSync(path,await doc.save());const saved=inspect(path),text=saved.pages.join(' ');
    expect(saved.widgets).toBe(16);expect(saved.fields[H.line1]).toBe('0');expect(saved.fields[H.line14]).toBe('0');expect(saved.fields[H.ssn]).toBe('');
    for(const value of ['original premium $1000','owner/business paid $200','other persons paid $200','actual advance credit $600','Shared policy family allocation','premium $500; advances $300','Step 2 credit: $3660','Final Form 8962 credit: $3480','Schedule 1 line 17 transfer: $2340'])expect(text).toContain(value);
    privacy(saved.pages);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
it('rejects missing forged and stale shared health review sources before I/O',async()=>{
  const input=sharedMarketplaceHealthInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result);
  await expect(fillForm7206(redacted,hidden,'/missing','scheduleC','primary')).rejects.toThrow(/source|identity|identifier|SSN/i);
  await expect(fillForm7206(redacted,hidden,'/missing','scheduleC','primary',undefined,{} as PreparedPremiumTaxCreditReview)).rejects.toThrow(/prepared|original/);
  for(const mutate of [
    (value:typeof input)=>{value.form7206!.plans![0].sharedMarketplaceSources!.persons![0].coveredIndividualSsn='999-88-7777';},
    (value:typeof input)=>{value.form7206!.plans![0].sharedMarketplaceSources!.sourceTaxYear=2024;},
    (value:typeof input)=>{value.scheduleC!.grossReceipts='50000.01';},
    (value:typeof input)=>{const p=value.form7206!.plans![0].payments![0];p.ownerOrBusinessPaid=p.personAmounts![0].amountPaid='201';p.otherPersonPaid='199';},
  ]){const changed=structuredClone(input);mutate(changed);await expect(fillForm7206(changed,result,'/missing','scheduleC','primary',undefined,prepared)).rejects.toThrow(/stale|conflict/);}
  const altered=redactReviewIdentifiers(result);altered.marketplaceHealthInsurance!.specifiedDeduction=d(2341);
  await expect(fillForm7206(redacted,altered,'/missing','scheduleC','primary',undefined,prepared)).rejects.toThrow(/reconcil|deduction|audit/);
});
it('exports both physical forms with original context and private source statements',async()=>{
  const input=sharedMarketplaceHealthInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),dir=mkdtempSync(join(tmpdir(),'tax-shared-health-return-'));
  try{
    const packet=await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false,premiumTaxCreditReview:prepared});
    const h=packet.filledForms.find(file=>/form-7206-/.test(file)),p=packet.filledForms.find(file=>file.endsWith('/f8962-filled.pdf'));
    expect(h).toBeTruthy();expect(p).toBeTruthy();if(!h||!p)throw new Error('Missing actual forms');
    const health=inspect(h),credit=inspect(p);expect(health.fields[H.line14]).toBe('0');
    expect([credit.fields[P.line24],credit.fields[P.line25],credit.fields[P.line29]]).toEqual(['3480','3600','120']);
    expect(health.pages.join(' ')).toContain('Schedule 1 line 17 transfer: $2340');privacy([...health.pages,...credit.pages]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
