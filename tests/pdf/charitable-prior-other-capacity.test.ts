// Spec: spec/federal/charitable-prior-other-capacity.yaml.
import {expect,it} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {calculateFederalTax} from '@/engine/federal.js';
import {prepareCharitableReview} from '@/pdf/charitable-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillScheduleA,SCHEDULE_A_FIELDS as F} from '@/pdf/fill-schedule-a.js';
import {priorOtherCapacityFixture} from '../fixtures/charitable-prior-other-capacity.js';
it('prints corrected current property and prior other use with original source binding',async()=>{
 const input=priorOtherCapacityFixture(),result=calculateFederalTax(input),token=prepareCharitableReview(input),before=JSON.stringify(input);
 const doc=await fillScheduleA(redactReviewIdentifiers(input),result,'forms/blank/2025/f1040sa.pdf',token);
 const reopened=await PDFDocument.load(await doc.save());
 for(const [field,value] of [[F.line12,'30000'],[F.line13,'10000'],[F.line14,'40000'],[F.ssn,undefined]] as const)expect(reopened.getForm().getTextField(field).getText()).toBe(value);
 const changed=structuredClone(input);changed.donations[0].amount='40000.01';
 await expect(fillScheduleA(redactReviewIdentifiers(changed),result,'missing.pdf',token)).rejects.toThrow(/source|identity/i);
 const prior=changed.charitableCarryoverSources?.vintages?.[0];if(!prior)throw Error('Missing synthetic history');
 changed.donations[0].amount='40000';prior.openingCarryforward='30000.01';
 await expect(fillScheduleA(redactReviewIdentifiers(changed),result,'missing.pdf',token)).rejects.toThrow(/source|identity/i);
 expect(JSON.stringify(input)).toBe(before);
});
