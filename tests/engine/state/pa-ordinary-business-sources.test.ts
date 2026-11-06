/** Literal source/line oracles precede business product. Spec: state/pa-ordinary-business-sources.yaml. */
import {describe,it,expect} from 'vitest';
import Decimal from 'decimal.js';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAScheduleC} from '@/engine/state/pa-schedule-c';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {calculateFederalTax} from '@/engine/federal';
import {confirmGuidedPAResidencySources,buildGuidedPAResidencySources,updateGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {paOrdinaryBusinessFixture,rebindBusinessFixture} from '../../fixtures/pa-ordinary-business-sources';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return';
import {paCreditCompositionFixture} from '../../fixtures/pa-resident-credit-composition';
import {rebindPAResidentCreditFixture} from '../../fixtures/pa-resident-credit-sources';
import {fictionalBusinessSources} from '../../fixtures/pa-ordinary-business-sources';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
function required<T>(value:T|null|undefined):T{if(value===undefined||value===null)throw Error('Explicit complete fictional source fixture required');return value;}
const replay=(f:ReturnType<typeof paOrdinaryBusinessFixture>)=>calculatePAResidencySources(f.input,f.input.paResidencySources);
function syncOriginal(f:ReturnType<typeof paOrdinaryBusinessFixture>){f.business.originalScheduleC=structuredClone(required(f.input.scheduleC));f.business.necOriginals.forEach(row=>{row.original=structuredClone(f.input.form1099Nec[row.originalIndex]);});rebindBusinessFixture(f);}
describe('Actual ordinary PA business source method',()=>{
 it.each([
  ['resident','15200','0','65320','2005'],['part_year','6200','9000','32240','990'],['nonresident','6200','9000','12200','375'],
 ]as const)('business sources allocate actual independent centers for all three residencies: %s',(status,net,outside,total,tax)=>{
  const f=paOrdinaryBusinessFixture(status),before=structuredClone(f.input),r=replay(f);
  expect(r.netBusinessIncome.toFixed()).toBe(net);expect(r.excludedNonPABusinessIncome.toFixed()).toBe(outside);
  expect(r.scheduleC?.line39.toFixed()).toBe(net);expect(r.worldwideScheduleC?.line39.toFixed()).toBe('15200');
  expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe(total);expect(r.taxBeforeCredits.toFixed()).toBe(tax);expect(f.input).toEqual(before);
 });
 it('business printed Schedule C retains original meals and expense dollars',()=>{
  const f=paOrdinaryBusinessFixture(),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
  expect(r.scheduleC).toMatchObject({});expect(r.scheduleC?.line1a.toFixed()).toBe('18000');expect(r.scheduleC?.line6.toFixed()).toBe('250');expect(r.scheduleC?.line22.toFixed()).toBe('600');expect(r.scheduleC?.line28.toFixed()).toBe('500');expect(r.scheduleC?.line31.toFixed()).toBe('500');expect(r.scheduleC?.line32.toFixed()).toBe('150');expect(r.scheduleC?.line37.toFixed()).toBe('800');expect(r.scheduleC?.line38.toFixed()).toBe('2800');expect(r.scheduleC?.line39.toFixed()).toBe('15200');
  expect(r.pa40.netBusinessIncome.toFixed()).toBe('15200');expect(r.pa40.taxLiability.toFixed()).toBe('2005');expect(r.readiness.filingEligible).toBe(false);
 });
 it.each(['missing','unconfirmed','year','owner','staleSchedule','staleNEC','duplicateNEC','missingNEC','unknownZero']as const)('business source originals require complete current owner year and original coverage: %s',kind=>{
  const f=paOrdinaryBusinessFixture();
  if(kind==='missing')Object.assign(f.input.paResidencySources,{businesses:[]});if(kind==='unconfirmed')f.business.sourceFactsConfirmed=false;if(kind==='year')f.business.sourceTaxYear=2026;if(kind==='owner')f.business.owner.originalTaxpayer.ssn='900-00-0001';if(kind==='staleSchedule')required(f.input.scheduleC).otherExpenseDescription='Edited same-dollar original';if(kind==='staleNEC')f.input.form1099Nec[0].payer='Edited same-dollar payer';if(kind==='duplicateNEC')f.input.form1099Nec.push(structuredClone(f.input.form1099Nec[0]));if(kind==='missingNEC')f.business.necOriginals=[];if(kind==='unknownZero')Object.assign(f.business.expenseCategories.insurance,{status:'unknown'});
  expect(()=>replay(f)).toThrow(/business|original|source|incomplete/i);
 });
 it('business cash receipts and refunds reconcile actual original dollars',()=>{
  const f=paOrdinaryBusinessFixture('part_year');required(f.input.scheduleC).returnsAndAllowances='500';f.business.customerRefunds=[{refundId:'customer-refund-1',receiptId:'client-after',paidOn:'2025-10-15',amount:'500',sourceReference:'Fictional actual same-period original customer refund',transactionReference:'Refund-1'}];syncOriginal(f);
  const r=replay(f);expect(r.scheduleC?.line1a.toFixed()).toBe('9000');expect(r.scheduleC?.line1b.toFixed()).toBe('500');expect(r.scheduleC?.line39.toFixed()).toBe('5700');expect(r.worldwideScheduleC?.line39.toFixed()).toBe('14700');expect(r.excludedNonPABusinessIncome.toFixed()).toBe('9000');
 });
 it.each(['missingAmount','ledgerMismatch','duplicateReceipt','duplicateInvoice','badCalendar','futureDate','crossResidency','refundTooLarge','refundBeforeReceipt','refundDuplicate']as const)('business receipt ledger rejects incomplete or duplicated actual sources: %s',kind=>{
  const f=paOrdinaryBusinessFixture('part_year'),row=f.business.incomeReceipts[0];
  if(kind==='missingAmount')row.amount='';if(kind==='ledgerMismatch')row.amount='8999.99';if(kind==='duplicateReceipt')f.business.incomeReceipts.push(structuredClone(row));if(kind==='duplicateInvoice'){const dupe=structuredClone(row);dupe.receiptId='new-id';dupe.transactionReference='new-transaction';f.business.incomeReceipts.push(dupe);}if(kind==='badCalendar')row.receivedOn='2025-02-30';if(kind==='futureDate')row.receivedOn='2026-03-31';if(kind==='crossResidency')row.serviceThrough='2025-07-01';
  if(kind.startsWith('refund')){f.business.customerRefunds=[{refundId:'refund',receiptId:'client-before',paidOn:kind==='refundBeforeReceipt'?'2025-03-01':'2025-04-01',amount:kind==='refundTooLarge'?'9000.01':'1',sourceReference:'Fictional actual refund',transactionReference:'refund-transaction'}];required(f.input.scheduleC).returnsAndAllowances=kind==='refundTooLarge'?'9000.01':'1';if(kind==='refundDuplicate')f.business.customerRefunds.push(structuredClone(f.business.customerRefunds[0]));syncOriginal(f);}
  expect(()=>replay(f)).toThrow(/business|source|receipt|refund|date|period/i);
 });
 it('business actual expense classifications preserve personal costs and refunds',()=>{
  const f=paOrdinaryBusinessFixture(),advertising=f.business.expenseReceipts[0];advertising.amountPaid='350';advertising.personalAmount='100';
  f.business.expenseRefunds=[{refundId:'actual-cost-refund',receiptId:'expense-1',paidOn:'2025-11-15',businessAmount:'200',personalAmount:'0',sourceReference:'Fictional actual office vendor refund',transactionReference:'cost-refund-1'}];required(required(f.input.scheduleC).expenses).officeExpense='400';syncOriginal(f);
  const r=replay(f);expect(r.scheduleC?.line6.toFixed()).toBe('250');expect(r.scheduleC?.line22.toFixed()).toBe('400');expect(r.scheduleC?.line38.toFixed()).toBe('2600');expect(r.scheduleC?.line39.toFixed()).toBe('15400');expect(advertising.personalAmount).toBe('100');
 });
 it.each(['ordinaryActualReasonableNecessaryConfirmed','noncapitalCurrentCostConfirmed','notOwnerBenefitOrIncomeTaxConfirmed','actualCostNotPerDiemConfirmed','noResidentialUtilityUseConfirmed']as const)('business expense eligibility remains unknown or unsupported without actual %s',key=>{
  const f=paOrdinaryBusinessFixture();f.business.expenseReceipts[4][key]=false;expect(()=>replay(f)).toThrow(/business|expense|cost|source/i);
 });
 it.each(['personalMismatch','duplicateCost','missingCategory','categoryReconciliation','refundExceedsCost','unknownOtherIncome','positiveHomeoffice','positiveDepreciation']as const)('business expense and adjustment originals remain fail closed: %s',kind=>{
  const f=paOrdinaryBusinessFixture();if(kind==='personalMismatch')f.business.expenseReceipts[0].personalAmount='1';if(kind==='duplicateCost')f.business.expenseReceipts.push(structuredClone(f.business.expenseReceipts[0]));if(kind==='missingCategory')delete f.business.expenseCategories.utilities;if(kind==='categoryReconciliation')required(required(f.input.scheduleC).expenses).meals='100';if(kind==='refundExceedsCost')f.business.expenseRefunds=[{refundId:'badrefund',receiptId:'expense-0',paidOn:'2025-11-15',businessAmount:'251',personalAmount:'0',sourceReference:'Fictional mismatched refund',transactionReference:'badrefund'}];if(kind==='unknownOtherIncome')f.business.noOtherBusinessIncomeConfirmed=false;if(kind==='positiveHomeoffice')required(f.input.scheduleC).homeOffice={method:'simplified',squareFeet:100};if(kind==='positiveDepreciation')required(required(f.input.scheduleC).expenses).depreciation='1';
  expect(()=>replay(f)).toThrow(/business|source|expense|original|method/i);
 });
 it.each(['separateBooksCompleteConfirmed','independentProfitCentersConfirmed','noIntercenterTransfersConfirmed','freeOutsidePurchasingConfirmed','noGeographicCompetitionConfirmed','liabilitiesCompleteConfirmed']as const)('business separate accounting requires actual %s',key=>{
  const f=paOrdinaryBusinessFixture('nonresident');f.business.allocation[key]=false;expect(()=>replay(f)).toThrow(/business|source|separate|center|NRH/i);
 });
 it('business class losses preserve wages and require actual profitable history',()=>{
  const f=paOrdinaryBusinessFixture(),t=f.input.taxpayer.primary;required(required(f.input.scheduleC).expenses).otherExpenses='20000';required(f.business.expenseReceipts.at(-1)).amountPaid='20000';required(f.business.expenseReceipts.at(-1)).businessAmount='20000';f.business.lossHistory={status:'two_profitable_years',sourceReference:'Fictional actual prior PA profit records',priorProfits:[2023,2024].map(taxYear=>({taxYear,netProfit:'100',accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,businessActivity:'Independent design services',sourceReference:'Fictional actual prior PA ScheduleC profit '+taxYear}))};syncOriginal(f);
  const r=replay(f);expect(r.netBusinessIncome.toFixed()).toBe('-4000');expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe('50120');expect(r.taxBeforeCredits.toFixed()).toBe('1539');expect(r.scheduleC?.line39.toFixed()).toBe('-4000');
  f.business.lossHistory.priorProfits.pop();expect(()=>replay(f)).toThrow(/loss|profit|history|business/i);
 });
 it('business Schedule C preserves exact large amounts and one rounding per printed line',()=>{
  const precision=Decimal.precision,r=calculatePAScheduleC({taxYear:2025,grossReceipts:new Decimal('123456789012345678901234567890.50'),expenses:{advertising:new Decimal('123456789012345678901234567880.49')}});
  expect(r.line39.toFixed()).toBe('11');expect(Decimal.precision).toBe(precision);
 });
 it('business Schedule C preserves accepted amounts beyond one hundred digits',()=>{
  const precision=Decimal.precision,r=calculatePAScheduleC({taxYear:2025,grossReceipts:new Decimal('100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.50'),expenses:{advertising:new Decimal('99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999.49')}});
  expect(r.line39.toFixed()).toBe('2');expect(Decimal.precision).toBe(precision);
 });
 it('business Schedule C aggregates actual travel and meals cents before printed line rounding',()=>{
  const r=calculatePAScheduleC({taxYear:2025,grossReceipts:new Decimal('10'),expenses:{travel:new Decimal('0.49'),meals:new Decimal('0.49')}});expect(r.line31.toFixed()).toBe('1');expect(r.line38.toFixed()).toBe('1');expect(r.line39.toFixed()).toBe('9');
 });
 it('business composition preserves worldwide and compensation only credit boundaries',()=>{
  const f=paOrdinaryBusinessFixture('part_year'),p=calculatePAOrdinaryReturnFacts(f.input,f.facts),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
  expect(p.spOutsidePAIncome.toFixed()).toBe('33080');expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('65320');expect(r.pa40.netBusinessIncome.toFixed()).toBe('6200');expect(r.pa40.taxLiability.toFixed()).toBe('990');
 });
 it('business new income cannot expand the compensation only same income resident credit',()=>{
  const f=paCreditCompositionFixture('part_year'),b=paOrdinaryBusinessFixture('part_year');f.input.form1099Nec=structuredClone(b.input.form1099Nec);f.input.scheduleC=structuredClone(b.input.scheduleC);Object.assign(f.input.paResidencySources,{businesses:[fictionalBusinessSources(f.input)]});f.facts.disposition.refundRequested='423';rebindPAResidentCreditFixture(f);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
  const r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(r.residentCreditSources?.totalCredit.toFixed()).toBe('614');expect(r.pa40.taxLiability.toFixed()).toBe('990');expect(r.pa40.overpayment.toFixed()).toBe('423');
  f.packet.claims[0].filedReturn.reportedTaxableCompensation='20001';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/same|compensation|income|source|return/i);
 });
 it('business actual NEC PA withholding is retained once without free scalar overrides',()=>{
  const f=paOrdinaryBusinessFixture();f.input.form1099Nec[0].stateWithheld='0.50';syncOriginal(f);const p=calculatePAOrdinaryReturnFacts(f.input,f.facts);expect(p.paWithholding.toFixed()).toBe('1539.5');
  f.input.form1099Nec[0].state='';syncOriginal(f);expect(()=>replay(f)).toThrow(/withhold|jurisdiction|business|state/i);
 });
 it('business self employment eligibility uses actual PA net and fresh federal EIC',()=>{
  const f=paOrdinaryBusinessFixture();f.input.w2s=[];f.input.paResidencySources.wages=[];f.input.form1099Int=[];f.input.paResidencySources.interest=[];f.input.form1099Nec[0].nonemployeeCompensation='6000';f.input.form1099Nec[0].stateIncome='3000';required(f.input.scheduleC).grossReceipts='6000';const expenses=required(required(f.input.scheduleC).expenses);for(const k of Object.keys(expenses))expenses[k as keyof typeof expenses]='0';for(const r of f.business.incomeReceipts)r.amount='3000';f.business.expenseReceipts=[];for(const c of Object.values(f.business.expenseCategories))c.status='known_none';f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional actual full SP principal forgiveness'};syncOriginal(f);
  const federal=calculateFederalTax(f.input),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(federal.earnedIncomeCredit.gt(0)).toBe(true);expect(r.workingCredit.isEligible).toBe(true);expect(r.workingCredit.paEarnedIncome.toFixed()).toBe('3000');expect(r.workingCredit.federalEarnedIncomeCredit.eq(federal.earnedIncomeCredit)).toBe(true);expect(r.readiness.filingEligible).toBe(false);
 });
 it('business guide confirmation alone binds current original business facts',()=>{
  const f=paOrdinaryBusinessFixture(),draft=structuredClone(f.input.paResidencySources);Object.assign(draft,{sourceFactsConfirmed:null});const business=(draft as typeof draft&{businesses:Array<{originalScheduleC?:unknown;necOriginals:Array<{original?:unknown}>}>}).businesses[0];delete business.originalScheduleC;delete business.necOriginals[0].original;
  expect(()=>buildGuidedPAResidencySources(f.input,draft)).toThrow();const confirmed=confirmGuidedPAResidencySources(f.input,draft);expect(buildGuidedPAResidencySources(f.input,confirmed)).toEqual(confirmed);
  f.input.form1099Nec[0].payer='Actual edited same dollar employer';expect(()=>buildGuidedPAResidencySources(f.input,confirmed)).toThrow(/stale|original|business|source/i);expect(confirmed).not.toEqual(confirmGuidedPAResidencySources(f.input,confirmed));expect(updateGuidedPAResidencySources(confirmed,{sourceReference:'Actual explicit edit'}).sourceFactsConfirmed).not.toBe(true);
 });
 it('business source commitment binds actual same-money location and source records',()=>{
  const f=paOrdinaryBusinessFixture('part_year'),first=replay(f);f.business.incomeReceipts[0].locationId='PA-center';const changed=replay(f);expect(changed.netBusinessIncome.toFixed()).toBe('15200');expect(changed.sourceCommitment).not.toBe(first.sourceCommitment);
 });
 it('business absence remains compatible with no actual business originals',()=>{const f=paOrdinaryReturnFixture();expect(calculatePAResidencySources(f.input,f.input.paResidencySources).totalOrdinaryPATaxableIncome.toFixed()).toBe('50120');});
});
