// Spec: spec/federal/form-1099-g-return.yaml. Source amounts are synthetic actual facts.
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{
 const original=await importOriginal<typeof import('@/models/constants.js')>();
 const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');
 return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {PDFDocument} from 'pdf-lib';
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction.js';
import {calculateForm1099G} from '@/engine/forms/form-1099-g.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {fillSchedule1,SCHEDULE_1_FIELDS} from '@/pdf/fill-schedule-1.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
const source=(year:number,changes:Record<string,unknown>={})=>({payer:'Synthetic state agency',payerTin:'12-3456789',accountHolder:'primary',sourceId:'g1',accountReference:'statement1',taxYear:year,sourceFormRevision:year===2026?'2026-12':'2024-03',sourceFactsConfirmed:true,actualReceiptConfirmed:true,additionalWorksheetRequired:false,programType:'government-unemployment',unemploymentCompensation:'1000',federalWithheld:'100',stateOrLocalTaxRefund:'0',rtaaPayments:'0',taxableGrants:'0',agriculturePayments:'0',marketGain:'0',familyLeaveBenefits:'0',tradeOrBusinessRefund:false,currentYearRepaid:'0',priorYearRepaid:'0',unrecoveredAfterTaxContributions:'0',stateTaxReporting:'none',stateWithheld:'0',...changes});
const input=(year=2026,changes:Record<string,unknown>={},returnChanges:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:year},w2s:[{...simpleW2Fixture.w2s[0],wages:'50000',socialSecurityTips:'0'}],form1099G:[source(year,changes)],...returnChanges});
const row=(r:ReturnType<typeof calculateFederalTax>,form:string,line:string)=>r.allLines.filter(item=>item.form===form&&item.line===line).at(-1)?.value.toString();
const repaid={currentYearRepaid:'200',unemploymentReceivedBeforeRepayment:'1000',box1IncludesCurrentYearRepayment:true,repaymentSourceReference:'actual-repayment-ledger',unrecoveredAfterTaxContributions:'300',contributionProgramId:'actual-program',contributionHistoryReference:'actual-program-history',contributionBalanceReconciled:true,allProgramPaymentsIncluded:true};
describe('Actual government payment return integration',()=>{
 it('routes actual repayment and contribution recovery without reducing withholding',()=>{
  const result=calculateFederalTax(input(2026,repaid));
  expect(result.schedule1?.unemploymentCompensation.toString()).toBe('500');
  expect(result.agi.toString()).toBe('50500');
  expect(row(result,'1040','25b')).toBe('100');
  expect(result.form1099G?.currentYearRepaid.toString()).toBe('200');
  expect(result.form1099G?.programs[0]?.endingContributions.toString()).toBe('0');
  expect(row(result,'Sched 1','7')).toBe('500');
  expect(row(result,'Sched 1','10')).toBe('500');
  expect(calculateFederalTax(input(2026,{...repaid,unemploymentCompensation:'800',box1IncludesCurrentYearRepayment:false})).agi.toString()).toBe('50500');
 });
 it('routes actual other government income separately from unemployment and SE',()=>{
  const result=calculateFederalTax(input(2026,{...repaid,rtaaPayments:'50',taxableGrants:'70',grantIncomeCategory:'nonbusiness',familyLeaveBenefits:'19200',familyLeaveProgramType:'state-pfml-family'}));
  expect(result.schedule1?.unemploymentCompensation.toString()).toBe('500');
  expect(row(result,'Sched 1','8z')).toBe('19320');
  expect(result.otherIncome.toString()).toBe('19820');
  expect(result.agi.toString()).toBe('69820');
  expect(result.selfEmploymentTax.toString()).toBe('0');
  expect(result.form1099G?.taxableFamilyLeave.toString()).toBe('19200');
  const historical=calculateFederalTax(input(2025,{rtaaPayments:'5000'},{w2s:[{...simpleW2Fixture.w2s[0],wages:'89000'}],adjustments:{studentLoanInterest:'2500'}}));
  // 89000wages+1000unemployment+5000RTAA=95000MAGI;2500*(100000-95000)/15000 rounds833.
  expect(historical.schedule1?.studentLoanInterest.toString()).toBe('833');
  expect(historical.agi.toString()).toBe('94167');
 });
 it('requires actual refund history and reconciles the source alias once',()=>{
  const actual=input(2025,{unemploymentCompensation:'0',stateOrLocalTaxRefund:'500',stateLocalIncomeTaxRefund:'500',refundTaxYear:2024,refundExpenseTaxYear:2024});
  expect(()=>calculateFederalTax(actual)).toThrow(/refund.*history|refund.*worksheet/i);
  actual.taxableRefundWorksheet={priorTaxYear:2024,priorYearFilingStatus:'single',priorYearItemized:true,priorYearItemizedTotal:'30000',priorYearStandardDeduction:'14600',priorYearStateLocalTaxesPaid:'6000',priorYearPropertyTaxesPaid:'0'};
  const result=calculateFederalTax(actual);
  expect(result.taxableRefundWorksheet?.totalRefund.toString()).toBe('500');
  expect(row(result,'Sched 1','1')).toBe('500');
  expect(result.agi.toString()).toBe('50500');
  actual.taxableRefundWorksheet.priorYearItemized=false;
  expect(calculateFederalTax(actual).agi.toString()).toBe('50000');
  const currentAliasOnly={...actual,form1099G:actual.form1099G?.map(form=>({...form,stateLocalIncomeTaxRefund:'0'}))};
  expect(calculateFederalTax(currentAliasOnly).taxableRefundWorksheet?.totalRefund.toString()).toBe('500');
 });
 it('reduces current-year income taxes for actual same-year refunds',()=>{
  const actual=input(2025,{unemploymentCompensation:'0',stateOrLocalTaxRefund:'500',refundTaxYear:2025,refundExpenseTaxYear:2025},{scheduleA:{additionalStateLocalIncomeTaxes:'20000'}});
  const result=calculateFederalTax(actual);
  expect(result.agi.toString()).toBe('50000');
  expect(result.scheduleA?.saltDeduction.toString()).toBe('19500');
  expect(result.taxableIncome.toString()).toBe('30500');
  expect(row(result,'Sched 1','1')).toBe('0');
  expect(()=>calculateFederalTax({...actual,scheduleA:{additionalStateLocalIncomeTaxes:'100'}})).toThrow(/refund.*payments|recovery.*payments/i);
 });
 it('distinguishes the actual refunded expense year from the state return year',()=>{
  const sameYear=input(2025,{unemploymentCompensation:'0',stateOrLocalTaxRefund:'500',refundTaxYear:2024,refundExpenseTaxYear:2025},{scheduleA:{additionalStateLocalIncomeTaxes:'20000'}});
  const reduced=calculateFederalTax(sameYear);
  expect(reduced.agi.toString()).toBe('50000');
  expect(reduced.scheduleA?.saltDeduction.toString()).toBe('19500');
  expect(reduced.form1099G?.refundSources[0]).toMatchObject({refundTaxYear:2024,refundExpenseTaxYear:2025});
  const historical=input(2025,{unemploymentCompensation:'0',stateOrLocalTaxRefund:'500',refundTaxYear:2023,refundExpenseTaxYear:2024},{taxableRefundWorksheet:{priorTaxYear:2024,priorYearFilingStatus:'single',priorYearItemized:true,priorYearItemizedTotal:'30000',priorYearStandardDeduction:'14600',priorYearStateLocalTaxesPaid:'6000',priorYearPropertyTaxesPaid:'0'}});
  expect(calculateFederalTax(historical).agi.toString()).toBe('50500');
  const missing=input(2025,{unemploymentCompensation:'0',stateOrLocalTaxRefund:'500',refundTaxYear:2024});
  expect(()=>calculateFederalTax(missing)).toThrow(/refund.*expense.*year/i);
 });
 it('preserves unverified historical government aggregates without broadening return-year gates',()=>{
  const historical=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2024},form1099G:[],scheduleA:{additionalStateLocalIncomeTaxes:'1200'}});
  const empty=calculateForm1099G([],2024);
  expect(empty.taxYear).toBe(2024);
  expect(empty.taxableUnemployment.toString()).toBe('0');
  const legacy=TaxYearInputSchema.parse({...historical,form1099G:[{payer:'Historical agency',unemploymentCompensation:'1000',federalWithheld:'50'}]});
  const old=calculateForm1099G(legacy.form1099G,2024);
  expect(old.taxYear).toBe(2024);
  expect(old.sourceFactsVerified).toBe(false);
  expect(old.taxableUnemployment.toString()).toBe('1000');
  expect(old.federalWithheld.toString()).toBe('50');
  expect(()=>calculateStateLocalIncomeTaxDeduction(historical)).toThrow(/1099-OID.*2024/i);
  expect(calculateStateLocalIncomeTaxDeduction({...historical,taxpayer:{...historical.taxpayer,taxYear:2025}}).total.toString()).toBe('1200');
  expect(()=>calculateForm1099G(input(2025).form1099G,2024)).toThrow(/year/i);
 });
 it('does not bypass actual source facts in the full return',()=>{
  expect(()=>calculateFederalTax(input(2026,{currentYearRepaid:undefined}))).toThrow(/actual|complete/i);
  expect(()=>calculateFederalTax(input(2025,{priorYearRepaid:'100'}))).toThrow(/earlier-return records/i);
  expect(()=>calculateFederalTax(input(2025,{accountHolder:'spouse'}))).toThrow(/spouse.*joint/i);
 });
 it('prints the actual repayment alongside canonical unemployment',async()=>{
  const actual=input(2025,repaid),result=calculateFederalTax(actual);
  const pdf=await PDFDocument.load(await(await fillSchedule1(actual,result,'forms/blank/2025/f1040s1.pdf')).save());
  expect(pdf.getForm().getTextField(SCHEDULE_1_FIELDS.line7).getText()).toBe('500');
  expect(pdf.getForm().getTextField(SCHEDULE_1_FIELDS.line7Repaid).getText()).toBe('200');
  expect(pdf.getForm().getCheckBox(SCHEDULE_1_FIELDS.line7RepaymentCheckbox).isChecked()).toBe(true);
 });
});
