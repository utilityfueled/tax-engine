// Spec: spec/federal/marketplace-marriage-health.yaml.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {fillForm7206,FORM_7206_FIELDS as H} from '@/pdf/fill-form-7206';
import {fillForm8962Marriage,buildForm8962ReferenceSummary,FORM_8962_FIELDS as F} from '@/pdf/fill-form-8962';
import {fillReturn} from '@/pdf/fill-return';
import {preparePremiumTaxCreditReview,type PreparedPremiumTaxCreditReview} from '@/pdf/premium-tax-credit-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {d} from '@/utils/decimal';
import {marketplaceMarriageHealthInput,zeroMonthMarketplaceMarriageHealthInput} from '../fixtures/marketplace-marriage-health';

function inspect(path:string):{pages:string[];fields:Record<string,string>;appearances:boolean[]}{
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',`
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);aps=[]
for p in r.pages:
 for ref in p.get('/Annots',[]):
  w=ref.get_object()
  if w.get('/Subtype')=='/Widget':
   ap=w.get('/AP',{}).get('/N');aps.append(bool(ap and (ap.get_object().get_data() if hasattr(ap.get_object(),'get_data') else ap)))
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'appearances':aps}))
`,path],{encoding:'utf8',timeout:5000}));
}
it('prints the source-bound marriage and health worksheets with the computed cap',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'marriage-health-'));
  try{
    for(const historical of [false,true]){
      const original=marketplaceMarriageHealthInput(2025,historical),result=calculateFederalTax(original),prepared=preparePremiumTaxCreditReview(original);
      const input=redactReviewIdentifiers(original),hidden=redactReviewIdentifiers(result);
      const doc=await fillForm8962Marriage(input,hidden,'forms/blank/2025/f8962.pdf',prepared),path=join(dir,`credit-${historical}.pdf`);
      writeFileSync(path,await doc.save());const credit=inspect(path);
      expect([credit.fields[F.line3],credit.fields[F.line24],credit.fields[F.line25],credit.fields[F.line29]]).toEqual(historical?['61427','10087','10800','713']:['86597','5149','8400','3251']);
      if(historical)expect(credit.fields[F.line28]).toBe('1950');
      expect(F.marriage.slice(0,4).map(key=>credit.fields[key])).toEqual(historical?['1','54','01','07']:['1','198','01','07']);
      const health=await fillForm7206(input,hidden,'forms/blank/2025/f7206.pdf','scheduleC','primary',undefined,prepared),healthPath=join(dir,`health-${historical}.pdf`);
      writeFileSync(healthPath,await health.save());const saved=inspect(healthPath),text=saved.pages.join(' ').replace(/\s+/g,' ');
      expect([saved.fields[H.line1],saved.fields[H.line14],saved.fields[H.ssn]]).toEqual(['0','0','']);
      for(const value of historical?['Step 2 credit: $10227','Final Form 8962 credit: $10087','Return-level Schedule 1 line 17 transfer: $1773']:['Step 2 credit: $5662','Final Form 8962 credit: $5149','Return-level Schedule 1 line 17 transfer: $6338'])expect(text).toContain(value);
      for(const page of [...credit.pages,...saved.pages]){expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666/);}
      expect([...credit.appearances,...saved.appearances].every(Boolean)).toBe(true);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
it('rejects stale marriage health contexts before output',async()=>{
  const input=marketplaceMarriageHealthInput(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),dir=mkdtempSync(join(tmpdir(),'marriage-health-stale-'));
  try{
    const changed=structuredClone(input);changed.form7206!.plans![0].payments![0].sourceId='equal-money different original';
    await expect(fillReturn(changed,result,{blankFormsDir:'/missing',outputDir:dir,premiumTaxCreditReview:prepared})).rejects.toThrow(/stale|source|conflict/i);
    for(const token of [undefined,{} as PreparedPremiumTaxCreditReview])await expect(fillForm7206(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'/missing','scheduleC','primary',undefined,token)).rejects.toThrow(/source|identit|original|prepared/i);
    const altered=calculateFederalTax(input);altered.form8962!.marriageCalculation!.families[0].months[0].credit=d(1);
    await expect(fillForm8962Marriage(input,altered,'/missing',prepared)).rejects.toThrow(/calculation|reconcile/i);
    expect(readdirSync(dir)).toEqual([]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

it('exports an original zero uncovered month without fabricating a credit row', async () => {
  const original = zeroMonthMarketplaceMarriageHealthInput(), before = structuredClone(original);
  const result = calculateFederalTax(original), prepared = preparePremiumTaxCreditReview(original);
  const input = redactReviewIdentifiers(original), hidden = redactReviewIdentifiers(result);
  const summary = buildForm8962ReferenceSummary(input.form1095A, hidden, { input, prepared });
  expect(summary.policies[0].coveredMonths).toBe('1-12');
  expect(summary.policies[0].annualEnrollmentPremium).toBe('11000');
  expect(summary.policies[0].annualAdvancePTC).toBe('7700');
  expect(summary.lines.some(row => row.line === '12e')).toBe(false);
  const doc = await fillForm8962Marriage(input, hidden, 'forms/blank/2025/f8962.pdf', prepared);
  const dir = mkdtempSync(join(tmpdir(), 'marriage-health-zero-'));
  try {
    const path = join(dir, 'credit.pdf'); writeFileSync(path, await doc.save());
    const saved = inspect(path);
    expect(saved.fields[F.line25]).toBe('7700');
    for (const page of saved.pages) {
      expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666/);
    }
    expect(original).toEqual(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
