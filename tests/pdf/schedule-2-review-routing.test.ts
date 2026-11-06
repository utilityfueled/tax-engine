// Spec: spec/federal/schedule-2-review-routing.yaml
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateSchedule2} from '@/engine/schedules/schedule-2.js';
import {fillSchedule2,SCHEDULE_2_FIELDS as F} from '@/pdf/mappings/2025/fill-schedule-2.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
import {mixedAnnualLoanInterestFixture} from '../fixtures/education-annual-loan-interest.js';
const D=(s:string)=>new Decimal(s);
it('maps the supported canonical physical lines without conflating line18 and PartII',async()=>{
 const input=structuredClone(simpleW2Fixture),result=calculateFederalTax(input);
 const s2=calculateSchedule2({amt:D('7'),excessAPTCRepayment:D('11'),newVehicleTransferRepayment:D('13'),usedVehicleTransferRepayment:D('17'),selfEmploymentTax:D('19'),unreportedSSTax:D('23'),form8919Tax:D('29'),penaltyTax:D('31'),householdEmploymentTax:D('37'),additionalMedicareTax:D('41'),niitTax:D('43'),uncollectedSSTax:D('47'),hsaAdditionalTax:D('53'),hsaRecaptureTax:D('59')});
 const before=JSON.stringify(s2),doc=await fillSchedule2(input,{...result,schedule2:s2},'forms/blank/2025/f1040s2.pdf'),form=doc.getForm();
 expect([F.line1a,F.line1b,F.line1c,F.line1z,F.line2,F.line3,F.line4,F.line5,F.line6,F.line7,F.line8,F.line9,F.line11,F.line12,F.line13,F.line17c,F.line17d,F.line18,F.line21].map(k=>form.getTextField(k).getText()))
 .toEqual(['11','13','17','41','7','48','19','23','29','52','31','37','41','43','47','53','59','112','382']);
 expect(JSON.stringify(s2)).toBe(before);
});
it('routes actual education penalty to8 and leaves18 at explicit canonical zero',async()=>{
 const {input}=mixedAnnualLoanInterestFixture(),result=calculateFederalTax(input);
 const doc=await fillSchedule2(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'forms/blank/2025/f1040s2.pdf');
 expect(doc.getForm().getTextField(F.line8).getText()).toBe('720');
 expect(doc.getForm().getTextField(F.line18).getText()??'').toBe('');
 expect(doc.getForm().getTextField(F.line21).getText()).toBe('720');
});
it.each(['missing','duplicate','wrong-form','nan','infinity','negative'])('rejects malformed canonical route before template access: %s',async mode=>{
 const input=structuredClone(simpleW2Fixture),result=calculateFederalTax(input),s2=result.schedule2;
 if(!s2)throw new Error('Missing actual canonical Schedule2');
 for(const line of ['1b','1c','1z','8','13','18']){
  const entries=s2.lines.map(x=>({...x})),entry=entries.find(x=>x.form==='Sched 2'&&x.line===line);
  if(!entry)throw new Error('Missing actual canonical line');
  if(mode==='missing')entries.splice(entries.indexOf(entry),1);
  if(mode==='duplicate')entries.push({...entry});
  if(mode==='wrong-form')entry.form='Other form';
  if(mode==='nan')entry.value=D('NaN');
  if(mode==='infinity')entry.value=D('Infinity');
  if(mode==='negative')entry.value=D('-1');
  await expect(fillSchedule2(input,{...result,schedule2:{...s2,lines:entries}},'/deliberately-absent-schedule2-template.pdf')).rejects.toThrow(/Schedule 2.*canonical|canonical.*Schedule 2/i);
 }
});
