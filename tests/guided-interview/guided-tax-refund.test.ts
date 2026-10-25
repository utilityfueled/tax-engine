// Spec: spec/federal/guided-tax-refund.yaml.
import { expect, it } from 'vitest';
import { buildGuidedTaxRefund, captureGuidedRefundSources, updateGuidedTaxRefund } from '@/lib/guided-tax-refund';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { calculateTaxableRefundWorksheet } from '@/engine/forms/taxable-refund-worksheet';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { actualRefundEntry, actualRefundHistory } from '../fixtures/guided-tax-refund';
import { completePersonalInfo, completeW2Entry, startCompleteInterview } from './complete-facts';
const entries = () => [actualRefundEntry()];
const build = (facts = actualRefundHistory(), records = entries()) => buildGuidedTaxRefund(facts, records, 2025, 'single', completePersonalInfo);
function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'unemployment'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000' }] };
  state.sectionData['income-unemployment'] = { compensation: '', federalWithheld: '', entries: entries(), taxRefund: actualRefundHistory() };
  return state;
}
it('preserves and binds actual refund sources without inventing amounts', () => {
  const facts=actualRefundHistory(), before=JSON.stringify(facts), result=build(facts);
  expect(result?.priorYearPropertyTaxesPaid).toBe('0'); expect(JSON.stringify(facts)).toBe(before);
  expect(result).not.toHaveProperty('taxableRefund'); expect(captureGuidedRefundSources(entries())[0].amount).toBe('1000.25');
  expect(buildGuidedTaxRefund(undefined, [], undefined, undefined, undefined)).toBeUndefined();
  for (const patch of [{accountReference:'Replaced account'}, {payerTin:'98-7654321'}, {stateOrLocalTaxRefund:'1000.26'}, {refundExpenseTaxYear:'2023'}])
    expect(()=>build(facts,[{...actualRefundEntry(),...patch}])).toThrow(/source|record|year|match/i);
  expect(()=>build(facts,[actualRefundEntry(),actualRefundEntry()])).toThrow(/duplic|source/i);
  const two=[actualRefundEntry(),{...actualRefundEntry(),accountReference:'Second state',stateOrLocalTaxRefund:'0.10'}];
  const both=actualRefundHistory(two); expect(build(both,[two[1],two[0]])?.priorTaxYear).toBe(2024);
});
it('rejects missing historical facts and unsupported recovery methods', () => {
  for (const patch of [{sourceFactsConfirmed:null},{allRefundSourcesIncluded:null},{sourceReference:''},{primaryName:'Another person'},
    {priorYearItemized:null},{priorYearPropertyTaxesPaid:''},{priorYearAlternativeGeneralSalesTaxDeduction:''},{priorYearTaxableIncome:'0'},
    {priorYearRegularTax:'0'},{priorYearAmt:'1'},{priorYearUnusedTaxCredits:'1'},{otherItemizedRecoveries:'1'},
    {priorYearCapitalRateWorksheetUsed:true},{priorYearCouldBeClaimedAsDependent:true},{priorYearMandatoryItemization:null},
    {returnMembershipUnchanged:false},{allRefundedTaxesPaidInExpenseYear:false},{priorTaxYear:'2025'},{priorYearStateLocalTaxElection:'' as const}]) {
    expect(()=>build({...actualRefundHistory(),...patch})).toThrow();
  }
  expect(()=>buildGuidedTaxRefund(actualRefundHistory(),entries(),2025,'single',completePersonalInfo,
    { mortgageWorksheet: { recoveries:[{originTaxYear:'2024',refundReceived:'1'}] } })).toThrow(/recover/i);
  const required=actualRefundHistory(); required.priorYearFilingStatus='mfs'; required.priorYearMandatoryItemization=true; required.priorYearStandardDeduction='0';
  expect(buildGuidedTaxRefund(required,entries(),2025,'mfs',completePersonalInfo)?.priorYearStandardDeduction).toBe('0');
});
it('rejects freshly captured contradictory original recipients and years', () => {
  for (const patch of [{accountHolder:'spouse' as const}, {recipientTaxIdLast4:'9999'}, {payerTin:'12345678'}, {refundTaxYear:'0000'}]) {
    const original=[{...actualRefundEntry(),...patch}];
    expect(()=>build(actualRefundHistory(original),original)).toThrow();
  }
});
it('requires actual prior recovery and NOL history before ordinary treatment', () => {
  const original=[{...actualRefundEntry(),refundTaxYear:'2023',refundExpenseTaxYear:'2023',stateOrLocalTaxRefund:'1000'}];
  const history={...actualRefundHistory(original),priorTaxYear:'2023',priorYearStandardDeduction:'13850',
    priorRecoveriesBeforeReceiptYear:'5700',priorYearNolCarryover:'0'};
  const before=JSON.stringify(history);
  expect(()=>build(history,original)).toThrow(/prior|earlier|recovery/i);
  expect(JSON.stringify(history)).toBe(before);
  for (const patch of [{priorRecoveriesBeforeReceiptYear:''},{priorYearNolCarryover:''},{priorYearNolCarryover:'1'}]) {
    expect(()=>build({...actualRefundHistory(),priorRecoveriesBeforeReceiptYear:'0',priorYearNolCarryover:'0',...patch})).toThrow();
  }
});
it('calculates ordinary refunds once and retains actual zero-benefit elections', () => {
  const state=fixture(); expect(validateSection(state,'income-unemployment').status).toBe('complete');
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.form1099G?.[0]).toMatchObject({stateOrLocalTaxRefund:'1000.25',refundTaxYear:2024,refundExpenseTaxYear:2024});
  const result=calculateFederalTax(input); expect(result.agi.toFixed()).toBe('51000.25');
  expect(result.form1099G?.federalWithheld.toFixed()).toBe('10.03');
  for (const patch of [{priorYearItemized:false},{priorYearStateLocalTaxElection:'sales' as const},
    {priorYearStateLocalTaxesPaid:'13000',priorYearPropertyTaxesPaid:'0'}]) {
    const government=state.sectionData['income-unemployment'];
    if (!government) throw new Error('Missing synthetic government section');
    government.taxRefund={...actualRefundHistory(),...patch};
    const zero=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)); expect(calculateFederalTax(zero).agi.toFixed()).toBe('50000');
    expect(zero.taxableRefundWorksheet?.priorYearItemized).toBe(patch.priorYearItemized ?? true);
  }
});
it('preserves next-year historical MAGI and distinct expense years', () => {
  const source={...actualRefundEntry(),sourceTaxYear:'2026',sourceFormRevision:'2026-12',familyLeaveBenefits:'0',refundTaxYear:'2024',refundExpenseTaxYear:'2025'};
  const history={...actualRefundHistory(),sourceTaxYear:'2026',priorTaxYear:'2025',priorYearSaltMagi:'100000',originalRefundSources:captureGuidedRefundSources([source])};
  const result=buildGuidedTaxRefund(history,[source],2026,'single',completePersonalInfo);
  if (!result) throw new Error('Missing synthetic historical worksheet');
  expect(result.priorTaxYear).toBe(2025); expect(result.priorYearSaltMagi).toBe('100000');
  expect(calculateTaxableRefundWorksheet([{stateLocalIncomeTaxRefund:'1000.25',refundTaxYear:2024,refundExpenseTaxYear:2025}],result,2026).taxableRefund.toFixed()).toBe('1000.25');
  expect(()=>buildGuidedTaxRefund({...history,priorYearSaltMagi:''},[source],2026,'single',completePersonalInfo)).toThrow(/MAGI/i);
});
it('revokes confirmation after original or household edits', () => {
  expect(updateGuidedTaxRefund(actualRefundHistory(),{sourceReference:'New source'}).sourceFactsConfirmed).toBeNull();
  const state=fixture();
  expect(updateSectionData(state,'personal-info',{...completePersonalInfo,lastName:'Changed'}).sectionData['income-unemployment']?.taxRefund?.sourceFactsConfirmed).toBeNull();
  const data=state.sectionData['income-unemployment'];
  if (!data) throw new Error('Missing synthetic government section');
  expect(updateSectionData(state,'income-unemployment',{...data,entries:[{...actualRefundEntry(),stateOrLocalTaxRefund:'1000.26'}]}).sectionData['income-unemployment']?.taxRefund?.sourceFactsConfirmed).toBeNull();
  expect(updateSectionData(state,'income-unemployment',{...data,taxRefund:{...actualRefundHistory(),sourceFactsConfirmed:true}}).sectionData['income-unemployment']?.taxRefund?.sourceFactsConfirmed).toBe(true);
});
