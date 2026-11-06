// Spec: spec/federal/form-8959-self-employment-applicability.yaml
import {it,expect} from 'vitest';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {calculateFederalTax} from '@/engine/federal.js';
import {ScheduleCInputSchema} from '@/models/inputs.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {fillForm8959,FORM_8959_FIELDS as F} from '@/pdf/mappings/2025/fill-form-8959.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
function originals(gross:string){const input=structuredClone(simpleW2Fixture);input.w2s=[];input.scheduleC=ScheduleCInputSchema.parse({businessName:'Fictional pure self employment',businessCode:'541990',accountingMethod:'cash',grossReceipts:gross,expenses:{}});return input;}
it.each([['positive tax','238224','220000','20000','180'],['positive excess tax roundszero','216568','200001','1','0']]as const)('leaves inapplicable wage and withholding parts blank in actual pureSE public output: %s',async(_name,gross,se,excess,tax)=>{
 const input=originals(gross),before=JSON.stringify(input),result=calculateFederalTax(input),canonical=JSON.stringify(result);
 expect(result.scheduleSE?.netSEEarnings.toFixed()).toBe(gross);expect(result.form8959?.selfEmploymentEarnings.toFixed()).toBe(se);expect(result.form8959?.additionalMedicareTax.toFixed()).toBe(tax);expect(result.form8959?.withholdingCredit.toFixed()).toBe('0');
 const dir=await mkdtemp(join(tmpdir(),'8959-purese-'));
 try{
  await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
  const form=(await PDFDocument.load(await readFile(join(dir,'f8959-filled.pdf')))).getForm();
  for(const n of[1,2,3,4,5,6,7,19,20,21,22,23,24])expect(form.getTextField(F[`line${n}`as keyof typeof F]).getText()).toBeUndefined();
  expect([F.line8,F.line9,F.line10,F.line11,F.line12,F.line13,F.line18].map(k=>form.getTextField(k).getText())).toEqual([se,'200000',undefined,'200000',excess,tax==='0'?undefined:tax,tax==='0'?undefined:tax]);
  for(const n of[14,15,16,17])expect(form.getTextField(F[`line${n}`as keyof typeof F]).getText()).toBeUndefined();
  expect(JSON.stringify(input)).toBe(before);expect(JSON.stringify(result)).toBe(canonical);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it.each([['below adjusted threshold','216566','199999',false],['exact adjusted threshold','216567','200000',false],['raw cents cross adjusted threshold','216567.99','200001',true]]as const)('keeps pureSE threshold selection based on actual existing ScheduleSE rather than gross receipts: %s',async(_name,gross,se,included)=>{
 const input=originals(gross),result=calculateFederalTax(input);expect(result.form8959?.selfEmploymentEarnings.toFixed()).toBe(se);expect(result.form8959?.additionalMedicareTax.toFixed()).toBe('0');
 const dir=await mkdtemp(join(tmpdir(),'8959-purese-threshold-'));try{
  await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
  if(included)await expect(access(join(dir,'f8959-filled.pdf'))).resolves.toBeUndefined();else await expect(access(join(dir,'f8959-filled.pdf'))).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('preserves wage parts and missingScheduleSE compatibility',async()=>{
 const input=structuredClone(simpleW2Fixture),result=calculateFederalTax(input),before=JSON.stringify(result);
 const form=(await fillForm8959(input,result,'forms/blank/2025/f8959.pdf')).getForm();
 expect([F.line1,F.line5,F.line6,F.line19,F.line20,F.line21,F.line22].map(k=>form.getTextField(k).getText())).toEqual(['85000','200000','0','1233','85000','1233','0']);expect(JSON.stringify(result)).toBe(before);
 const pure=originals('238224'),missing=calculateFederalTax(pure);missing.scheduleSE=undefined;
 const old=(await fillForm8959(pure,missing,'forms/blank/2025/f8959.pdf')).getForm();expect(old.getTextField(F.line5).getText()).toBe('200000');expect(old.getTextField(F.line6).getText()).toBe('0');expect(old.getTextField(F.line22).getText()).toBe('0');
});
it.each([['tiny positive original','0.01',false],['verified original zero','0',true],['missing original amount',undefined,false]]as const)('requires actual original Medicare absence rather than rounded wagezero: %s',async(_name,raw,skip)=>{
 const input=originals('238224'),w2=structuredClone(simpleW2Fixture.w2s[0]);if(!w2)throw new Error('Explicit synthetic original missing');
 Object.assign(w2,{wages:'0',socialSecurityWages:'0',socialSecurityWithheld:'0',federalWithheld:'0',medicareWithheld:'0',stateWages:'0',stateTaxWithheld:'0'});
 if(raw===undefined){const optionalOriginal:Partial<typeof w2>=w2;delete optionalOriginal.medicareWages;}else w2.medicareWages=raw;input.w2s=[w2];
 const before=JSON.stringify(input),result=calculateFederalTax(input);expect(result.form8959?.medicareWages.toFixed()).toBe('0');
 const dir=await mkdtemp(join(tmpdir(),'8959-original-absence-'));try{
  let doc;
  if(raw===undefined){
   await expect(fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir})).rejects.toThrow(/Invalid argument/);
   doc=await fillForm8959(input,result,'forms/blank/2025/f8959.pdf');
  }else{
   await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
   doc=await PDFDocument.load(await readFile(join(dir,'f8959-filled.pdf')));
  }
  const form=doc.getForm();
  expect([F.line5,F.line6,F.line22].map(k=>form.getTextField(k).getText())).toEqual(skip?[undefined,undefined,undefined]:['200000','0','0']);
  expect(JSON.stringify(input)).toBe(before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
