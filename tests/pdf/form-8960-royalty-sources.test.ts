// Spec: spec/federal/form-8960-royalty-sources.yaml.
import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8960,FORM_8960_FIELDS as F } from '@/pdf/fill-form-8960.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { royaltyNiitFixture } from '../fixtures/niit-royalties.js';

it('reopens the retained royalty source and business adjustment fields',async()=>{
  const input=royaltyNiitFixture([{ordinaryIncome:'5000',royalties:'3000.25'}],'7000.75');
  const result=calculateFederalTax(input),doc=await fillForm8960(input,result,'forms/blank/2025/f8960.pdf');
  const reopened=await PDFDocument.load(await doc.save());
  const expected={[F.line4a]:'15001',[F.line4b]:'(5000)',[F.line4c]:'10001',[F.line12]:'10001',[F.line13]:'215001',[F.line15]:'15001',[F.line16]:'10001',[F.line17]:'380'};
  for(const [field,value] of Object.entries(expected))expect(reopened.getForm().getTextField(field).getText(),field).toBe(value);
  expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
});
