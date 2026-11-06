// Spec: spec/federal/form-8959-review-selection.yaml
import Decimal from 'decimal.js';
import {mkdtemp, readFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {expect, it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {ScheduleCInputSchema} from '@/models/inputs.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillForm8959, FORM_8959_FIELDS as F} from '@/pdf/mappings/2025/fill-form-8959.js';
import {FORM_1040_FIELDS as F1040} from '@/pdf/fill-form-1040.js';
import {simpleW2Fixture, complexMFJFixture} from '../fixtures/simple-w2.js';
import {mixedAnnualLoanInterestFixture} from '../fixtures/education-annual-loan-interest.js';

it('includes the zero-tax component supporting the original withholding credit',async()=>{
 const {input}=mixedAnnualLoanInterestFixture(), original=JSON.stringify(input), result=calculateFederalTax(input);
 expect(result.form8959?.additionalMedicareTax.toFixed()).toBe('0');
 expect(result.form8959?.withholdingCredit.toFixed()).toBe('508');
 const dir=await mkdtemp(join(tmpdir(),'8959-credit-review-'));
 try{
  await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
  const pdf=await PDFDocument.load(await readFile(join(dir,'f8959-filled.pdf'))), fields=pdf.getForm();
  expect([F.line1,F.line4,F.line5,F.line19,F.line20,F.line21,F.line22,F.line24].map(k=>fields.getTextField(k).getText()))
   .toEqual(['50000','50000','200000','1233','50000','725','508','508']);
  const f1040=(await PDFDocument.load(await readFile(join(dir,'f1040-filled.pdf')))).getForm();
  expect(f1040.getTextField(F1040.line25c).getText()).toBe('508');
  expect(JSON.stringify(input)).toBe(original);
 }finally{await rm(dir,{recursive:true,force:true});}
});
const cases=[
 ['single statement joint', 'married_filing_jointly',['200001'],['2900.01'],true],
 ['raw statement cent joint','married_filing_jointly',['200000.01'],['2900'],true],
 ['aggregate single','single',['100001','100000'],['1450.01','1450'],true],
 ['raw aggregate cent','single',['100000.01','100000'],['1450','1450'],true],
 ['aggregate exact equality','single',['100000','100000'],['1450','1450'],false],
 ['statement exact equality joint','married_filing_jointly',['200000'],['2900'],false],
 ['joint aggregate','married_filing_jointly',['150001','100000'],['2175.01','1450'],true],
 ['separate aggregate','married_filing_separately',['125001'],['1812.51'],true],
 ['ordinary below threshold','single',['50000'],['725'],false],
 ['existing positive tax','single',['300000'],['4350'],true],
 ['eighty digit original tail','single',['100000.'+'0'.repeat(79)+'1','100000'],['1450','1450'],true],
 ['wages plus actual SE line6','single',['199601'],['2894.21'],true],
] as const;
it.each(cases)('selects the component at the independently derived original threshold: %s',async(name,status,wages,withheld,included)=>{
 const input=structuredClone(simpleW2Fixture);input.taxpayer.filingStatus=status;
 if(status==='married_filing_jointly'||status==='married_filing_separately')input.taxpayer.spouse=structuredClone(complexMFJFixture.taxpayer.spouse);
 const source=input.w2s[0];if(!source)throw new Error('Missing explicit synthetic W2');
 input.w2s=wages.map((amount,index)=>({...source,employer:{name:'Synthetic employer '+index,ein:'12-345678'+index},wages:amount,medicareWages:amount,medicareWithheld:withheld[index]??'0',socialSecurityWages:'50000',socialSecurityWithheld:'3100',federalWithheld:'20000'}));
 if(name==='wages plus actual SE line6')input.scheduleC=ScheduleCInputSchema.parse({businessName:'Synthetic consulting',businessCode:'541990',accountingMethod:'cash',grossReceipts:'433',expenses:{}});
 const original=JSON.stringify(input),precision=Decimal.precision,result=calculateFederalTax(input);
 if(name==='wages plus actual SE line6')expect(result.form8959?.selfEmploymentEarnings.toFixed()).toBe('400');
 if(name!=='existing positive tax')expect(result.form8959?.additionalMedicareTax.toFixed()).toBe('0');
 expect(result.form8959?.withholdingCredit.toFixed()).toBe('0');
 const dir=await mkdtemp(join(tmpdir(),'8959-threshold-review-'));
 try{
  await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
  if(included)await expect(access(join(dir,'f8959-filled.pdf'))).resolves.toBeUndefined();
  else await expect(access(join(dir,'f8959-filled.pdf'))).rejects.toThrow();
  expect(JSON.stringify(input)).toBe(original);expect(Decimal.precision).toBe(precision);
 }finally{await rm(dir,{recursive:true,force:true});}
});

// Spec: spec/federal/form-8959-review-zero-rendering.yaml
it.each(['ordinary-low','ordinary-high','actual-SE-loss'])('renders only applicable explicitly instructed zeros from actual canonical amounts: %s',async mode=>{
 const input=structuredClone(simpleW2Fixture),w2=input.w2s[0];if(!w2)throw new Error('Missing actual synthetic original');
 Object.assign(w2,{wages:mode==='ordinary-high'?'300000':'50000',medicareWages:mode==='ordinary-high'?'300000':'50000',medicareWithheld:mode==='ordinary-high'?'4350':'725'});
 if(mode==='actual-SE-loss')input.scheduleC=ScheduleCInputSchema.parse({businessName:'Synthetic loss source',businessCode:'541990',accountingMethod:'cash',grossReceipts:'0',expenses:{otherExpenses:'1000'}});
 const result=calculateFederalTax(input),before=JSON.stringify(result);
 if(mode==='actual-SE-loss')expect(result.scheduleSE?.netSEEarnings.toFixed()).toBe('-1000');
 const doc=await fillForm8959(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'forms/blank/2025/f8959.pdf'),form=doc.getForm();
 expect([F.line6,F.line11,F.line12,F.line22].map(k=>form.getTextField(k).getText())).toEqual(mode==='actual-SE-loss'?['0','150000','0','0']:mode==='ordinary-high'?['100000',undefined,undefined,'0']:['0',undefined,undefined,'0']);
 expect(form.getTextField(F.line8).getText()).toBe(mode==='actual-SE-loss'?'0':undefined);
 expect(form.getTextField(F.line16).getText()).toBeUndefined();
 expect(JSON.stringify(result)).toBe(before);
});
it('keeps absent canonical Form8959 data blank rather than inventing zero',async()=>{
 const input=structuredClone(simpleW2Fixture),result=calculateFederalTax(input);result.form8959=undefined;
 const doc=await fillForm8959(input,result,'forms/blank/2025/f8959.pdf');
 for(const key of [F.line6,F.line8,F.line11,F.line12,F.line16,F.line22])expect(doc.getForm().getTextField(key).getText()).toBeUndefined();
});

// Spec: spec/federal/form-8959-review-zero-rendering.yaml known-no-se-skip.
it.each(['public','direct'])('skips PartII for actual known-zero SE originals through the actual %s entry point',async route=>{
 const input=route==='public'?mixedAnnualLoanInterestFixture().input:structuredClone(simpleW2Fixture),result=calculateFederalTax(input);
 expect(result.scheduleSE?.netSEEarnings.isZero()).toBe(true);expect(result.form8959?.selfEmploymentEarnings.isZero()).toBe(true);
 const dir=await mkdtemp(join(tmpdir(),'8959-no-se-review-'));
 try{
  let doc;
  if(route==='public'){
   await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
   doc=await PDFDocument.load(await readFile(join(dir,'f8959-filled.pdf')));
  }else doc=await fillForm8959(input,result,'forms/blank/2025/f8959.pdf');
  for(const key of [F.line8,F.line9,F.line10,F.line11,F.line12,F.line13])expect(doc.getForm().getTextField(key).getText()).toBeUndefined();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('preserves existing direct-mapper behavior when ScheduleSE is absent',async()=>{
 const input=structuredClone(simpleW2Fixture),result=calculateFederalTax(input);result.scheduleSE=undefined;
 const doc=await fillForm8959(input,result,'forms/blank/2025/f8959.pdf'),form=doc.getForm();
 expect([F.line8,F.line9,F.line10,F.line11,F.line12,F.line13].map(k=>form.getTextField(k).getText()))
 .toEqual([undefined,'200000','85000','115000','0',undefined]);
});
