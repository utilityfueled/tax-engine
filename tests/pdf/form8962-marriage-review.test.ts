// Spec: spec/federal/form-8962-marriage-return.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm8962Marriage, FORM_8962_FIELDS as F, buildForm8962ReferenceSummary, fillForm8962Reference } from '@/pdf/fill-form-8962.js';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { marriageSourcesFixture } from '../fixtures/marriage-sources.js';
const blank='forms/blank/2025/f8962.pdf';
function source() { const input=marriageSourcesFixture(); Object.assign(input.w2s[0],{wages:'117000',socialSecurityWages:'117000',medicareWages:'117000',federalWithheld:'0',accountHolder:'primary'}); return input; }
function advances(input:ReturnType<typeof source>,none=false) {
 const facts=input.form8962,packet=facts?.marriageSources;
 if(!packet?.policies||!facts?.monthlyReconciliation) throw new Error('Incomplete source fixture');
 for(const [i,policy] of input.form1095A.entries()) for(const row of policy.monthlyPremiums) row.advancePremiumTaxCredit=none?'0':i===0?'200':i===1?'300':'500';
 for(const row of packet.policies) row.original=structuredClone(input.form1095A[Number(row.sourceId?.split(':')[1])]);
 for(const row of facts.monthlyReconciliation) row.advancePremiumTaxCredit=none?'0':'500';
}
function inspect(path: string): { pages: string[]; fields: Record<string, string>; widgets: { name: string; value: string; appearance: boolean }[] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);widgets=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  w=ref.get_object()
  if w.get('/Subtype')!='/Widget':continue
  node=w;names=[];value=None
  while node:
   if node.get('/T'):names.insert(0,str(node.get('/T')))
   if value is None and '/V' in node:value=str(node.get('/V'))
   parent=node.get('/Parent');node=parent.get_object() if parent else None
  ap=w.get('/AP',{}).get('/N');appearance=bool(ap and (ap.get_object().get_data() if hasattr(ap.get_object(),'get_data') else ap))
  widgets.append({'name':'.'.join(names),'value':value or '', 'appearance':appearance})
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages], 'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'widgets':widgets}))
`, path], { encoding: 'utf8', timeout: 5000 }));
}
it('prints actual PartV and monthly repayment in saved independent-reader fields',async()=>{
 const input=source(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),dir=mkdtempSync(join(tmpdir(),'tax-marriage-review-'));
 try {
  const packet=await fillReturn(input,result,{blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false,premiumTaxCreditReview:prepared});
  const path=packet.filledForms.find(file=>file.endsWith('/f8962-filled.pdf')); if(!path) throw new Error('Missing physical8962');
  const saved=inspect(path); expect(saved.pages).toHaveLength(2);
  for(const [index,value] of ['1','400','01','07','3','148','01','07'].entries()) expect(saved.fields[F.marriage[index]]).toBe(value);
  for(const [index,value] of ['1500','1266','548','718','718','794'].entries()) expect(saved.fields[F.monthly[0][index]]).toBe(value);
  expect(saved.fields[F.line3]).toBe('117000');expect(saved.fields[F.line24]).toBe('7021');expect(saved.fields[F.line25]).toBe('8423');expect(saved.fields[F.line29]).toBe('1402');expect(saved.fields[F.line26]).toBe('0');
  expect(saved.fields[F.line9Yes]).not.toBe('/Off');expect(saved.fields[F.line10No]).not.toBe('/Off');
  for(const name of F.allocations.flat()) expect(saved.fields[name]).toBe('');
  for(const page of saved.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
  expect(saved.widgets.find(row=>row.name===F.marriage[1])).toMatchObject({value:'400',appearance:true});
 } finally {rmSync(dir,{recursive:true,force:true});}
});
it('preserves Step8 blank repayment lines and the ordinary no-election branch',async()=>{
 for(const none of [false,true]) {
  const input=source();advances(input,none);const result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input);
  const doc=await fillForm8962Marriage(input,result,blank,prepared),form=doc.getForm();
  expect(form.getTextField(F.line24).getText()).toBe(none?'5481':'7021');expect(form.getTextField(F.line26).getText()).toBe(none?'5481':'0');
  for(const line of [F.line27,F.line28,F.line29]) expect(form.getTextField(line).getText()??'').toBe('');
  expect(form.getCheckBox(F.line9Yes).isChecked()).toBe(!none);
  for(const name of F.marriage) expect(Boolean(form.getTextField(name).getText())).toBe(!none);
 }
});
it('rejects stale marriage sources transfers and forged contexts while preserving privacy',async()=>{
 const input=source(),before=JSON.stringify(input),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input);
 const redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result),context={input:redacted,prepared};
 expect(redacted.form8962?.marriageSources?.benchmarks?.flatMap(row=>row.coveredIndividualSsns??[]).every(id=>id==='')).toBe(true);
 const summary=buildForm8962ReferenceSummary(redacted.form1095A,hidden,context);
 expect(summary.lines.find(row=>row.line==='35b')?.value).toBe('400');
 await expect(fillForm8962Marriage(redacted,hidden,blank)).rejects.toThrow();
 await expect(fillForm8962Marriage(redacted,hidden,blank,{} as PreparedPremiumTaxCreditReview)).rejects.toThrow(/prepared|original/i);
 const changed=structuredClone(input);changed.form1095A[0].monthlyPremiums[0].enrolleePremium='500.001';
 await expect(fillForm8962Marriage(changed,result,blank,prepared)).rejects.toThrow(/stale|conflicting/i);
 if(!result.form8962?.marriageCalculation) throw new Error('Missing marriage calculation');
 const alteredMarriage={...result,form8962:{...result.form8962,marriageCalculation:{...result.form8962.marriageCalculation,partV:result.form8962.marriageCalculation.partV.map(row=>({...row,monthlyContribution:d(1)}))}}};
 await expect(fillForm8962Marriage(input,alteredMarriage,blank,prepared)).rejects.toThrow(/calculation|reconcil/i);
 const altered={...result,allLines:result.allLines.map(row=>row.form==='Sched 2'&&row.line==='1a'?{...row,value:d(1)}:row)};
 const dir=mkdtempSync(join(tmpdir(),'tax-marriage-private-'));
 try {
  await expect(fillReturn(input,altered,{blankFormsDir:'forms/blank/2025',outputDir:dir,premiumTaxCreditReview:prepared})).rejects.toThrow(/calculation|reconcil/i);
  expect(readdirSync(dir)).toEqual([]);
  const reference=inspect(await fillForm8962Reference(redacted.form1095A,hidden,dir,context));const text=reference.pages.join(' ');
  expect(text).toContain('MARRIAGE');expect(text).toContain('Worksheet I');expect(text).toContain('Worksheet V');
  for(const id of ['111223333','444556666','777881111','777882222']) expect(text).not.toContain(id);
  for(const page of reference.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
 } finally {rmSync(dir,{recursive:true,force:true});}
 expect(JSON.stringify(input)).toBe(before);
});
