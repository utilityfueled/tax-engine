// Spec: spec/federal/marketplace-marriage-coverage-family.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206 } from '@/pdf/fill-form-7206';
import { fillForm8962Marriage, buildForm8962ReferenceSummary, FORM_8962_FIELDS as F } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { marriageCoverageFamilyInput, marriageMixedCoveragePeopleInput } from '../fixtures/marketplace-marriage-coverage-family';

function inspect(path: string): { pages: string[]; fields: Record<string, string>; appearances: boolean[] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);aps=[]
for p in r.pages:
 for ref in p.get('/Annots',[]):
  w=ref.get_object()
  if w.get('/Subtype')=='/Widget':
   ap=w.get('/AP',{}).get('/N');aps.append(bool(ap and (ap.get_object().get_data() if hasattr(ap.get_object(),'get_data') else ap)))
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'appearances':aps}))
`, path], { encoding: 'utf8', timeout: 5000 }));
}

it('prints monthly coverage marriage and signed health from bound originals',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'monthly-marriage-review-'));
 try{
  const cases=[{input:marriageCoverageFamilyInput(false,true),values:['85080','3853','6300','2447'],health:'7855',start:'02',contribution:'187'},
   {input:marriageCoverageFamilyInput(true,true),values:['85080','3853','6300','2447'],health:'7855',start:'02',contribution:'187'},
   {input:marriageMixedCoveragePeopleInput(),values:['52371','11545','12000','455'],health:'3390',start:'01',contribution:'0'}];
  for(const [i,entry] of cases.entries()){
   const original=entry.input,before=structuredClone(original),result=calculateFederalTax(original),prepared=preparePremiumTaxCreditReview(original),input=redactReviewIdentifiers(original),hidden=redactReviewIdentifiers(result);
   const summary=buildForm8962ReferenceSummary(input.form1095A,hidden,{input,prepared});
   expect(summary.policies[0].annualEnrollmentPremium).toBe(i===1?'24000':i===2?'15000':'12000');
   const credit=await fillForm8962Marriage(input,hidden,'forms/blank/2025/f8962.pdf',prepared),path=join(dir,`credit-${i}.pdf`);writeFileSync(path,await credit.save());const saved=inspect(path);
   expect([F.line3,F.line24,F.line25,F.line29].map(key=>saved.fields[key])).toEqual(entry.values);
   expect(F.marriage.slice(0,4).map(key=>saved.fields[key])).toEqual([i===2?'2':'1',entry.contribution,entry.start,'07']);
   if(i===1)expect(F.allocations[0].slice(1).map(key=>saved.fields[key])).toEqual(['','01','12','0.50','0.50','0.50']);
   const health=await fillForm7206(input,hidden,'forms/blank/2025/f7206.pdf','scheduleC','primary',undefined,prepared),healthPath=join(dir,`health-${i}.pdf`);writeFileSync(healthPath,await health.save());const savedHealth=inspect(healthPath),text=savedHealth.pages.join(' ').replace(/\s+/g,' ');
   expect(text).toContain(`Final Form 8962 credit: $${entry.values[1]}`);expect(text).toContain(`Return-level Schedule 1 line 17 transfer: $${entry.health}`);
   for(const page of [...saved.pages,...savedHealth.pages]){expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|222.?33.?4444|234.?56.?7890/);}
   expect([...saved.appearances,...savedHealth.appearances].every(Boolean)).toBe(true);expect(original).toEqual(before);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('retains enrolled ineligible married-month fields in the elected marriage form',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'monthly-marriage-enrolled-review-'));
 try{
  for(const shared of [false,true]){
   const original=marriageCoverageFamilyInput(shared,true),before=structuredClone(original),result=calculateFederalTax(original),prepared=preparePremiumTaxCreditReview(original);
   const pdf=await fillForm8962Marriage(redactReviewIdentifiers(original),redactReviewIdentifiers(result),'forms/blank/2025/f8962.pdf',prepared);
   const path=join(dir,`enrolled-${shared}.pdf`);writeFileSync(path,await pdf.save());const saved=inspect(path);
   expect(F.monthly[11].map(key=>saved.fields[key])).toEqual(['1000','0','603','0','0','0']);
   expect(F.monthly[0].map(key=>saved.fields[key])).toEqual(['1000','0','0','0','0','0']);
   expect([F.line3,F.line24,F.line25,F.line29].map(key=>saved.fields[key])).toEqual(['85080','3853','6300','2447']);
   expect(original).toEqual(before);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('rejects changed monthly marriage sources before output',async()=>{
 const input=marriageCoverageFamilyInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),dir=mkdtempSync(join(tmpdir(),'monthly-marriage-stale-'));
 try{
  for(const mutate of [
   (source:typeof input)=>{source.form7206!.plans![0].coverageFamilySources!.months![0].personFacts![0].sourceReference='Different same-money original evidence';},
   (source:typeof input)=>{source.form7206!.plans![0].coverageFamilySources!.months![0].personFacts![0].fullCoverageMonthConfirmed=false;},
   (source:typeof input)=>{source.form7206!.plans![0].coverageFamilySources!.policies![0].original!.policyNumber='Changed snapshot';},
  ]){const changed=structuredClone(input);mutate(changed);await expect(fillReturn(changed,result,{blankFormsDir:'/missing',outputDir:dir,premiumTaxCreditReview:prepared})).rejects.toThrow(/stale|source|conflict/i);}
  for(const token of [undefined,{} as PreparedPremiumTaxCreditReview])await expect(fillForm8962Marriage(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'/missing',token)).rejects.toThrow(/source|identit|original|prepared|SSN/i);
  const changed=calculateFederalTax(input);changed.form8962!.marriageCalculation!.families[0].months[0].credit=d(1);
  await expect(fillForm8962Marriage(input,changed,'/missing',prepared)).rejects.toThrow(/calculation|reconcile/i);expect(readdirSync(dir)).toEqual([]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
