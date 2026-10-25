// Specs: federal/schedule-b.yaml, schedule-a.yaml, form-6251.yaml, form-1099-oid.yaml.
import { PDFDocument } from 'pdf-lib';
import { fillForm6251,FORM_6251_FIELDS } from '@/pdf/fill-form-6251.js';
import { fillScheduleA,SCHEDULE_A_FIELDS } from '@/pdf/fill-schedule-a.js';
import { describe,it,expect } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema,Form1099OIDSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleB } from '@/engine/schedules/schedule-b.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { getConstants } from '@/models/constants.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
const source=(overrides:Record<string,unknown>={})=>Form1099OIDSchema.parse({payer:'Synthetic source',sourceId:'source',taxYear:2025,sourceFormRevision:'2024-01',sourceFactsConfirmed:true,recipientAmountsConfirmed:true,obligationType:'taxable',inflationIndexed:false,description:'Actual synthetic obligation',originalIssueDiscount:'0',otherPeriodicInterest:'0',earlyWithdrawalPenalty:'0',federalWithheld:'0',marketDiscount:'0',acquisitionPremium:'0',treasuryOID:'0',investmentExpenses:'0',bondPremium:'0',taxExemptOID:'0',stateWithholding:[],oidReportedNetOfAcquisitionPremium:false,interestReportedNetOfBondPremium:false,marketDiscountElection:false,bondPremiumElection:false,modernBondPremiumRulesApply:true,...overrides});
const fixture=(forms:ReturnType<typeof source>[])=>TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:'50000',federalWithheld:'0',stateTaxWithheld:'0',localTaxWithheld:'0'}],form1099OID:forms});
const audit=(r:ReturnType<typeof calculateFederalTax>,form:string,line:string)=>r.allLines.find(row=>row.form===form&&row.line===line)?.value.toString();
describe('OID actual source return integration',()=>{
 it('routes verified OID amounts to their actual federal lines once',()=>{
  const input=fixture([
   source({originalIssueDiscount:'100.11',earlyWithdrawalPenalty:'10',federalWithheld:'12.70',stateWithholding:[{state:'PA',statePayerId:'actual',stateWithheld:'20'}]}),
   source({sourceId:'treasury',obligationType:'treasury',treasuryOID:'200.22',acquisitionPremium:'20',otherPeriodicInterest:'30'}),
   source({sourceId:'municipal',obligationType:'tax_exempt',taxExemptOID:'300',acquisitionPremium:'30',otherPeriodicInterest:'400',bondPremium:'50',specifiedPrivateActivityBond:true}),
  ]);
  const r=calculateFederalTax(input);
  expect(calculateScheduleB(input).taxableInterest.toString()).toBe('310.33');
  expect(audit(r,'1040','2b')).toBe('310.33');
  expect(audit(r,'1040','2a')).toBe('620');
  expect(audit(r,'1040','25b')).toBe('12.7');
  expect(audit(r,'Sched 1','18')).toBe('10');
  expect(audit(r,'Form 6251','2g')).toBe('620');
  expect(r.agi.toString()).toBe('50300.33');
  expect(r.form1099OID?.treasuryInterest.toString()).toBe('210.22');
  expect(r.scheduleA?.saltDeduction.toString()).toBe('20');
 });
 it('deducts only allowable excess premium and preserves its carry',()=>{
  const input=fixture([source({otherPeriodicInterest:'100',bondPremium:'150',bondPremiumElection:true,bondPremiumWorksheet:{priorInterestInclusions:'20',priorPremiumDeductions:'5',priorCarryforward:'10',disposedDuringYear:false,periods:[{endDate:'2025-12-31',qualifiedStatedInterest:'100',amortization:'150'}]}})]);
  const r=calculateFederalTax(input);
  // Actual excess60: prior inclusions20 minus prior deduction5 allows15; carry45.
  expect(r.form1099OID?.bondPremiumDeduction.toString()).toBe('15');
  expect(r.form1099OID?.bondPremiumCarryforward.toString()).toBe('45');
  expect(r.agi.toString()).toBe('50000');
  const sa=calculateScheduleA(input,new Decimal(50000),'single',getConstants(2025),{gamblingWinnings:new Decimal(40),gamblingLosses:new Decimal(40)});
  expect(sa.otherItemizedDeductions.toString()).toBe('55');
  const otherDeductionsAudit=sa.lines.filter(row=>row.form==='Sched A'&&row.line==='16');
  expect(otherDeductionsAudit).toHaveLength(1);
  expect(otherDeductionsAudit[0]?.value.toString()).toBe('55');
  expect(sa.totalItemized.toString()).toBe('55');
 });
 it('refuses an unintegrated excess TIPS ordinary loss',()=>{
  const input=fixture([source({obligationType:'treasury',inflationIndexed:true,treasuryOID:'-200',tipsDeflationFacts:{allInstrumentInterestReportedHere:true,priorInterestInclusions:'100',priorOrdinaryLosses:'0',priorCarryforward:'0'}})]);
  expect(()=>calculateFederalTax(input)).toThrow(/TIPS.*ordinary loss|ordinary loss.*TIPS/i);
 });
 it('maps the audited excess premium into the review form line16',async()=>{
  const input=fixture([source({otherPeriodicInterest:'100',bondPremium:'150',bondPremiumElection:true,bondPremiumWorksheet:{priorInterestInclusions:'20',priorPremiumDeductions:'5',priorCarryforward:'0',disposedDuringYear:false,periods:[{endDate:'2025-12-31',qualifiedStatedInterest:'100',amortization:'150'}]}})]);
  const result=calculateFederalTax(input);
  const doc=await PDFDocument.load(await (await fillScheduleA(input,result,'forms/blank/2025/f1040sa.pdf')).save());
  expect(doc.getForm().getTextField(SCHEDULE_A_FIELDS.line16).getText()).toBe('15');
  expect(doc.getForm().getTextField(SCHEDULE_A_FIELDS.line16Desc).getText()).toBe('Excess bond premium');
 });

 it('maps actual OID preference to the review Form6251 line2g',async()=>{
  const input=fixture([source({obligationType:'tax_exempt',taxExemptOID:'300',specifiedPrivateActivityBond:true})]);
  const result=calculateFederalTax(input);
  const doc=await PDFDocument.load(await (await fillForm6251(input,result,'forms/blank/2025/f6251.pdf')).save());
  expect(doc.getForm().getTextField(FORM_6251_FIELDS.line2g).getText()).toBe('300');
 });

});
