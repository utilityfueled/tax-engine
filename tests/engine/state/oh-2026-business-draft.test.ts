// Spec: spec/state/oh-2026-business-draft.yaml. Independent literal examples, not engine-derived expectations.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { ohio2026BusinessDraftFixture, rebindOhio2026BusinessDraft } from '../../fixtures/oh-2026-business-draft.js';
import { ohioResidentCreditFixture } from '../../fixtures/oh-resident-credit-sources.js';
import { reciprocalOhioWageFixture } from '../../fixtures/oh-reciprocal-wage-sources.js';
const examples = [
  ['100000','7065','92935','92935','0','1900','0','0.0000','0','0'],
  ['400000','16796','383204','250000','133204','1900','3939','1.0000','3939','0'],
  ['1000000','24830','975170','250000','725170','0','21755','0.9138','19880','1875'],
] as const;
describe('source-bound Ohio2026 ordinary business draft dispatch', () => {
  it.each(examples.flatMap(row => (['nonresident','part_year_resident'] as const).map(status => ({row,status}))))('dispatches actual current $row.0 $status originals', ({row,status}) => {
    const p=ohio2026BusinessDraftFixture(row[0],status), before=JSON.stringify(p);
    const v=calculateOhio2026ReturnDraftFromSources({taxInput:p.input,sources:p.sources});
    expect(v.ruleVersion).toBe('oh-2026-canonical-business-draft-v1');
    expect(v.federalAgi.toFixed()).toBe(row[2]); expect(v.ohioAgi.toFixed()).toBe(row[4]);
    expect(v.deductibleHalfSelfEmploymentTax.toFixed()).toBe(row[1]); expect(v.businessIncomeDeduction.toFixed()).toBe(row[3]);
    expect(v.modifiedAdjustedGrossIncome.toFixed()).toBe(row[2]); expect(v.ohioApportionmentRatio.toFixed()).toBe('0.3125');
    expect(v.residentFederalDeductions.toFixed()).toBe('0');
    expect(v.exemptions.toFixed()).toBe(row[5]); expect(v.taxBeforeCredits.toFixed()).toBe(row[6]);
    expect(v.nonresidentRatio.toFixed(4)).toBe(row[7]); expect(v.nonresidentCredit.toFixed()).toBe(row[8]); expect(v.incomeTax.toFixed()).toBe(row[9]);
    expect(v.calculationStatus).toBe('incomplete'); expect(v.filingQualified).toBe(false);
    expect(v.withholding).toBeNull(); expect(v.amountDue).toBeNull(); expect(v.refund).toBeNull();
    expect(JSON.stringify(p)).toBe(before); expect(TAX_CONSTANTS[2026]).toBeUndefined(); expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
    expect(()=>calculateFederalTax(p.input)).toThrow(/incomplete; calculation is unavailable/);
  });
});

it('does not infer an absent expense classification as known zero', () => {
  const p=ohio2026BusinessDraftFixture();
  if (!p.input.scheduleC?.expenses) throw new Error('Fictional expense originals missing');
  delete (p.input.scheduleC.expenses as Partial<typeof p.input.scheduleC.expenses>).advertising;
  rebindOhio2026BusinessDraft(p);
  expect(()=>calculateOhio2026ReturnDraftFromSources({taxInput:p.input,sources:p.sources})).toThrow(/expense/);
});

function known<T>(value: T | undefined | null): T { if (value === undefined || value === null) throw new Error('Explicit fictional original missing'); return value; }
type Packet = ReturnType<typeof ohio2026BusinessDraftFixture>;
const run = (p: Packet) => calculateOhio2026ReturnDraftFromSources({taxInput:p.input,sources:p.sources});
function row(p: Packet) {
  const b=p.sources.residencyFacts.businessSources.facts.businesses[0];
  if(!b) throw new Error('Fictional business missing'); return b;
}
function owner(p: Packet) {
  const o=p.sources.residencyFacts.owners[0]; if(!o) throw new Error('Fictional owner missing'); return o;
}
const rejectSources: Array<[string,(p:Packet)=>void]> = [
  ['missing confirmation', p=>{delete (p.sources as Partial<Packet['sources']>).noOtherOhioCreditSourcesConfirmed;}],
  ['false confirmation', p=>{(p.sources as unknown as Record<string,unknown>).noQualifyingCapitalGainsOrPayrollDeductionConfirmed=false;}],
  ['unknown A34', p=>{(p.sources as unknown as Record<string,unknown>).noQualifyingCapitalGainsOrPayrollDeductionConfirmed=null;}],
  ['caller exemption scalar', p=>{Object.assign(p.sources,{eligibleExemptions:1});}],
  ['caller saved tax', p=>{Object.assign(p.sources,{taxBeforeCredits:'21755'});}],
  ['fake full federal result', p=>{Object.assign(p.sources,{federalResult:{taxYear:2026}});}],
  ['stale same-cash source reference', p=>{known(row(p).sales.rows[0]).sourceReference+=' changed';}],
  ['invoice original mismatch', p=>{known(p.sources.residencyFacts.businessSources.receiptOriginals[0]).grossReceipt='999999';}],
  ['invalid original invoice date', p=>{known(p.sources.residencyFacts.businessSources.receiptOriginals[0]).date='2026-02-30';}],
  ['duplicate original receipt', p=>{p.sources.residencyFacts.businessSources.receiptOriginals.push(structuredClone(known(p.sources.residencyFacts.businessSources.receiptOriginals[0])));}],
  ['unknown half-SE deduction', p=>{p.sources.residencyFacts.businessSources.federalDeductionSources=[];}],
  ['inconsistent resident deduction', p=>{owner(p).amounts.federalAdjustments.residentAmount='1';}],
  ['stale private original identity', p=>{p.input.taxpayer.primary.firstName='Changed';}],
  ['wrong current year', p=>{p.input.taxpayer.taxYear=2025;rebindOhio2026BusinessDraft(p);}],
  ['missing actual exemption eligibility', p=>{delete known(p.input.standardDeductionFacts).primaryCanBeClaimedAsDependent;rebindOhio2026BusinessDraft(p);}],
  ['dependent claimable', p=>{known(p.input.standardDeductionFacts).primaryCanBeClaimedAsDependent=true;rebindOhio2026BusinessDraft(p);}],
  ['unknown death date', p=>{delete known(p.input.standardDeductionFacts).primaryDeathDate;rebindOhio2026BusinessDraft(p);}],
  ['invalid actual birth date', p=>{p.input.taxpayer.primary.dateOfBirth='1990-02-30';rebindOhio2026BusinessDraft(p);}],
  ['age credit cohort', p=>{p.input.taxpayer.primary.dateOfBirth='1960-01-01';rebindOhio2026BusinessDraft(p);}],
  ['unhandled retained zero adjustment', p=>{Object.assign(p.input,{adjustments:{otherTaxesPaid:'0'}});rebindOhio2026BusinessDraft(p);}],
  ['unhandled retained election', p=>{Object.assign(p.input,{form4562:{}});rebindOhio2026BusinessDraft(p);}],
  ['noncash accounting', p=>{known(p.input.scheduleC).accountingMethod='accrual';rebindOhio2026BusinessDraft(p);}],
  ['actual positive expense needs successor', p=>{known(known(p.input.scheduleC).expenses).advertising='1';rebindOhio2026BusinessDraft(p);}],
  ['unhandled C facts', p=>{known(p.input.scheduleC).qbiMateriallyParticipated=true;rebindOhio2026BusinessDraft(p);}],
  ['full-year owner', p=>{Object.assign(owner(p),{status:'full_year_resident'});}],
  ['wrong primary factor owner', p=>{Object.assign(row(p),{accountHolder:'spouse'});}],
  ['unapproved alternative allocation', p=>{Object.assign(row(p),{noSpecialIndustryOrAlternativeAllocationConfirmed:false});}],
  ['foreign/missing calendar', p=>{owner(p).periods=[];}],
  ['nonterminating factor', p=>{row(p).property.ownedBeginning={ohio:'1',everywhere:'3'};row(p).property.ownedEnd={ohio:'1',everywhere:'3'};}],
];
it.each(rejectSources)('rejects %s before returning a projected tax', (_label,mutate)=>{
  const p=ohio2026BusinessDraftFixture(); mutate(p); const original=JSON.stringify(p); expect(()=>run(p)).toThrow(); expect(JSON.stringify(p)).toBe(original);
});
it('fresh same-cash source originals are recomputed and produce a new commitment',()=>{
  const p=ohio2026BusinessDraftFixture(), before=run(p); p.sources.sourceReference+=' distinct reviewed record';
  const next=run(p); expect(next.incomeTax.toFixed()).toBe('1875'); expect(next.sourceCommitment).not.toBe(before.sourceCommitment);
  const safe=JSON.stringify(next); expect(safe).not.toContain(p.input.taxpayer.primary.ssn); expect(safe).not.toContain(p.sources.sourceReference);
  expect(safe).not.toContain(p.input.taxpayer.primary.lastName);
});
it('allocates an actual PY personal deduction from its original domicile date',()=>{
  const p=ohio2026BusinessDraftFixture('1000000','part_year_resident');
  known(p.sources.residencyFacts.businessSources.federalDeductionSources[0]).original.date='2026-06-30';
  owner(p).amounts.federalAdjustments.residentAmount='24830';
  const v=run(p); expect(v.residentFederalDeductions.toFixed()).toBe('24830'); expect(v.nonresidentRatio.toFixed(4)).toBe('0.9480');
  expect(v.nonresidentCredit.toFixed()).toBe('20624'); expect(v.incomeTax.toFixed()).toBe('1131');
});
it('never treats a source-complete zero-profit original as a completed EIC method',()=>{
  const p=ohio2026BusinessDraftFixture('100000'); known(p.input.scheduleC).grossReceipts='0';
  known(row(p).sales.rows[0]).grossReceipt='0';known(row(p).sales.rows[0]).ohioBenefitReceipt='0';
  const b=p.sources.residencyFacts.businessSources; known(b.receiptOriginals[0]).grossReceipt='0';known(b.receiptOriginals[0]).ohioBenefitReceipt='0';
  Object.assign(known(b.federalDeductionSources[0]).original,{amount:'0'});owner(p).amounts.federalAdjustments.federalAmount='0';rebindOhio2026BusinessDraft(p);
  expect(()=>run(p)).toThrow(/current complete primary SE ownership/);
});
it('keeps every unimplemented financial field null, never zero',()=>{
  const v=run(ohio2026BusinessDraftFixture());
  for(const key of ['withholding','payments','schoolDistrictTax','underpaymentPenalty','latePaymentInterest','amountDue','refund'] as const) expect(v[key]).toBeNull();
});

it('retains low positive income EIC as unsupported even with complete business originals',()=>{
  const p=ohio2026BusinessDraftFixture('100000'); known(p.input.scheduleC).grossReceipts='10000';
  known(row(p).sales.rows[0]).grossReceipt='10000';known(row(p).sales.rows[0]).ohioBenefitReceipt='2500';
  const b=p.sources.residencyFacts.businessSources; known(b.receiptOriginals[0]).grossReceipt='10000';known(b.receiptOriginals[0]).ohioBenefitReceipt='2500';
  // Independently rounded: .9235*10000*.124=1145; *.029=268; SE1413/2 rounds707.
  Object.assign(known(b.federalDeductionSources[0]).original,{amount:'707'});owner(p).amounts.federalAdjustments.federalAmount='707';rebindOhio2026BusinessDraft(p);
  expect(()=>run(p)).toThrow(/EIC/);
});

it('rejects opposing nonexistent federal source categories even when their total cancels',()=>{
  const p=ohio2026BusinessDraftFixture();
  Object.assign(owner(p).amounts.wages,{federalAmount:'10000',nonresidentOhioAmount:'10000'});
  Object.assign(owner(p).amounts.capitalGains,{federalAmount:'-10000'});
  expect(()=>run(p)).toThrow(/original/);
});
it('rejects offsetting cents and unsupported resident categories before NRC dollar rounding',()=>{
  const p=ohio2026BusinessDraftFixture('1000000','part_year_resident');
  Object.assign(owner(p).amounts.wages,{federalAmount:'0.01',residentAmount:'0.01'});
  Object.assign(owner(p).amounts.capitalGains,{federalAmount:'-0.01'});
  expect(()=>run(p)).toThrow(/original/);
});

// Spec: actual-payment-* rows in spec/state/oh-2026-business-draft.yaml.
// Independent example: equal .26 property/sales factors => Ohio business260000,
// less BID250000 =>10000; NRC trunc4((725170-10000)/725170)=.9862;
// round(21755*.9862)=21455; unchanged return tax300, separately settled300.
function paidBusiness(status: 'nonresident' | 'part_year_resident' = 'nonresident', factor: 'small' | 'limit' | 'large' | 'zero' = 'small') {
  const p = ohio2026BusinessDraftFixture('1000000', status);
  const property = factor === 'small' ? '5200' : factor === 'limit' ? '5332.96' : factor === 'large' ? '5400' : '5000';
  const sales = factor === 'small' ? '260000' : factor === 'limit' ? '266648' : factor === 'large' ? '270000' : '250000';
  row(p).property.ownedBeginning.ohio = property; row(p).property.ownedEnd.ohio = property;
  known(row(p).sales.rows[0]).ohioBenefitReceipt = sales;
  known(p.sources.residencyFacts.businessSources.receiptOriginals[0]).ohioBenefitReceipt = sales;
  const person = p.input.taxpayer.primary;
  p.input.ohioPayments = {
    taxYear: 2026, sourceReference: 'PRIVATE-BUSINESS-PAYMENT-REVIEW', sourceFactsConfirmed: true,
    originalFederalSources: structuredClone(p.input), calendarYearConfirmed: true,
    allPaymentsIncludedConfirmed: true, withholdingTreatment: 'equal_quarters', paymentRows: [],
    priorReturn: {status: 'no_return', sourceReference: 'PRIVATE-NO-PRIOR-RETURN'},
    priorCreditCarryforward: {status: 'none', sourceReference: 'PRIVATE-NO-PRIOR-CARRY'},
    remainingTaxPayment: {status: 'actual_payment', sourceReference: 'PRIVATE-BUSINESS-BALANCE', sourceFactsConfirmed: true,
      date: '2027-04-15', amountAppliedToTax: '300', accountHolder: 'primary', original: {
        accountName: person.firstName + ' ' + person.lastName, accountSsn: person.ssn, taxYear: 2026,
        returnType: 'it1040', kind: 'balance', date: '2027-04-15', amount: '300', confirmationNumber: 'PRIVATE-BUSINESS-RECEIPT-001',
      }},
    currentTiming: {kind: 'filed', filedDate: '2027-04-15', asOfDate: '2027-04-15'},
    filingExtension: {kind: 'none'}, paymentExtension: {kind: 'none'}, returnKind: 'original', specialMethod: 'regular',
    balanceFacts: {sourceReference: 'PRIVATE-COMPLETE-BALANCE-REVIEW', useTax: '0', outgoingCarryforward: '0', donations: '0'},
  };
  return p;
}
const paymentFacts = (p: Packet) => known(p.input.ohioPayments);
function balanceReceipt(p: Packet) {
  const pay = paymentFacts(p).remainingTaxPayment;
  if (pay.status !== 'actual_payment') throw new Error('Fictional actual receipt required');
  return pay;
}
it.each((['nonresident', 'part_year_resident'] as const).map(status => ({status})))('settles a source-confirmed business balance for $status without changing return due', ({status}) => {
  const p = paidBusiness(status), original = JSON.stringify(p), v = run(p);
  expect(v.ohioApportionmentRatio.toFixed()).toBe('0.26');
  expect(v.ohioBusinessIncomeAfterDeduction.toFixed()).toBe('10000');
  expect(v.nonresidentRatio.toFixed(4)).toBe('0.9862'); expect(v.nonresidentCredit.toFixed()).toBe('21455');
  expect(v.incomeTax.toFixed()).toBe('300'); expect(v.amountDue?.toFixed()).toBe('300');
  expect(v.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe('300');
  expect(v.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
  expect(v.actualBalancePayment?.actualPaymentDate).toBe('2027-04-15');
  for (const key of ['withholding', 'payments', 'underpaymentPenalty', 'latePaymentInterest', 'refund'] as const) expect(v[key]?.toFixed()).toBe('0');
  expect(v.schoolDistrictTax).toBeNull(); expect(v.calculationStatus).toBe('incomplete');
  expect(v.reviewStatus).toBe('independent-review-pending'); expect(v.filingQualified).toBe(false);
  expect(v.lines.find(line => line.line === 'amount-due')?.value.toFixed()).toBe('300');
  expect(v.lines.find(line => line.line === 'actual-balance-payment')?.value.toFixed()).toBe('300');
  expect(v.lines.find(line => line.line === 'outstanding-tax-balance')?.value.toFixed()).toBe('0');
  const safe = JSON.stringify(v);
  for (const secret of [p.input.taxpayer.primary.ssn, p.input.taxpayer.primary.lastName, paymentFacts(p).sourceReference, balanceReceipt(p).original.confirmationNumber]) expect(safe).not.toContain(secret);
  expect(JSON.stringify(p)).toBe(original);
  const other = structuredClone(p); balanceReceipt(other).original.confirmationNumber += '-same-cash';
  expect(run(other).sourceCommitment).not.toBe(v.sourceCommitment);
  expect(() => calculateFederalTax(p.input)).toThrow(/incomplete; calculation is unavailable/);
});
const rejectedBusinessPayments: Array<{label: string; mutate: (p: Packet) => void}> = [
  {label: 'unknown school residency', mutate: p => {delete (p.sources.residencyFacts as Partial<typeof p.sources.residencyFacts>).schoolDistrictStatus;}},
  {label: 'taxing school residency', mutate: p => {p.sources.residencyFacts.schoolDistrictStatus = 'actual_district_sources_required';}},
  {label: 'wrong owner name', mutate: p => {balanceReceipt(p).original.accountName = 'OTHER PRIVATE OWNER';}},
  {label: 'wrong owner SSN', mutate: p => {balanceReceipt(p).original.accountSsn = '000-00-0001';}},
  {label: 'wrong payment owner', mutate: p => {balanceReceipt(p).accountHolder = 'spouse';}},
  {label: 'wrong receipt year', mutate: p => {balanceReceipt(p).original.taxYear = 2025;}},
  {label: 'wrong inventory year', mutate: p => {paymentFacts(p).taxYear = 2025;}},
  {label: 'wrong return', mutate: p => {Object.assign(balanceReceipt(p).original, {returnType: 'sd100'});}},
  {label: 'estimated receipt', mutate: p => {Object.assign(balanceReceipt(p).original, {kind: 'estimated'});}},
  {label: 'late payment', mutate: p => {balanceReceipt(p).date = '2027-04-16'; balanceReceipt(p).original.date = '2027-04-16';}},
  {label: 'receipt after observation', mutate: p => {paymentFacts(p).currentTiming.asOfDate = '2027-04-14';}},
  {label: 'late filed return', mutate: p => {paymentFacts(p).currentTiming = {kind: 'filed', filedDate: '2027-04-16', asOfDate: '2027-04-16'};}},
  {label: 'expected payment', mutate: p => {paymentFacts(p).remainingTaxPayment = {status: 'expected_payment', sourceReference: 'PRIVATE-EXPECTED', sourceFactsConfirmed: true, date: '2027-04-15', amountAppliedToTax: '300'};}},
  {label: 'no actual payment', mutate: p => {paymentFacts(p).remainingTaxPayment = {status: 'no_remaining_tax', sourceReference: 'PRIVATE-NONE', sourceFactsConfirmed: true};}},
  {label: 'partial receipt', mutate: p => {balanceReceipt(p).amountAppliedToTax = '299'; balanceReceipt(p).original.amount = '299';}},
  {label: 'overpayment receipt', mutate: p => {balanceReceipt(p).amountAppliedToTax = '301'; balanceReceipt(p).original.amount = '301';}},
  {label: 'receipt cash rounds to balance', mutate: p => {balanceReceipt(p).amountAppliedToTax = '300.01'; balanceReceipt(p).original.amount = '300.01';}},
  {label: 'receipt differs from applied', mutate: p => {balanceReceipt(p).original.amount = '299';}},
  {label: 'balance above500', mutate: p => {Object.assign(p, paidBusiness('nonresident', 'large')); balanceReceipt(p).amountAppliedToTax = '600'; balanceReceipt(p).original.amount = '600';}},
  {label: 'zero balance', mutate: p => {Object.assign(p, paidBusiness('nonresident', 'zero'));}},
  {label: 'estimated payment inventory', mutate: p => {const original = balanceReceipt(p).original; paymentFacts(p).paymentRows.push({sourceId: 'PRIVATE-ESTIMATE', sourceReference: 'PRIVATE-ESTIMATE', accountHolder: 'primary', taxYear: 2026, returnType: 'it1040', kind: 'estimated', date: '2026-04-15', amount: '1', appliedToThisReturnConfirmed: true, original: {...original, kind: 'estimated', date: '2026-04-15', amount: '1'}});}},
  {label: 'prior credit', mutate: p => {paymentFacts(p).priorCreditCarryforward = {status: 'actual_credit', sourceReference: 'PRIVATE-PRIOR', electedAmount: '1', availableForThisReturn: '1', accountHolder: 'primary', accountSsn: p.input.taxpayer.primary.ssn, appliedToThisReturnConfirmed: true};}},
  {label: 'balance election', mutate: p => {paymentFacts(p).balanceFacts.donations = '1';}},
  {label: 'unconfirmed payment inventory', mutate: p => {Object.assign(paymentFacts(p), {allPaymentsIncludedConfirmed: false});}},
  {label: 'unconfirmed income inventory', mutate: p => {p.sources.residencyFacts.allFederalSourcesIncludedConfirmed = false;}},
  {label: 'stale payment federal snapshot', mutate: p => {paymentFacts(p).originalFederalSources = {...paymentFacts(p).originalFederalSources, wages: '0'};}},
  {label: 'additional retained withholding', mutate: p => {Object.assign(p.input, {stateTaxWithheld: '0'});}},
];
it.each(rejectedBusinessPayments)('rejects actual business payment $label', ({mutate}) => {
  const p = paidBusiness(); mutate(p); const before = JSON.stringify(p);
  expect(() => run(p)).toThrow(); expect(JSON.stringify(p)).toBe(before);
});

const competingCredit = { residentCreditSources: ohioResidentCreditFixture().facts.residentCreditSources };
const competingWages = { reciprocalWageSources: reciprocalOhioWageFixture().facts.reciprocalWageSources };
it.each([
  { label: 'resident credit', sources: competingCredit },
  { label: 'reciprocal wages', sources: competingWages },
  { label: 'both packets', sources: { ...competingCredit, ...competingWages } },
])('rejects competing residency facts for a settled business draft: $label', ({sources}) => {
  const p = paidBusiness('part_year_resident');
  Object.assign(p.sources.residencyFacts, sources);
  expect(() => run(p)).toThrow(/separate resident credit or reciprocal wage packet/);
});

it.each(['nonresident', 'part_year_resident'] as const)('admits exact500 but retains zero and above500 balances outside the payment method for %s', status => {
  // Equal .266648 factors =>Ohio16648 after BID; trunc4(708522/725170)=.9770;
  // round(21755*.9770)=21255, tax500. Equal .27 factors =>tax600.
  const p = paidBusiness(status, 'limit');
  balanceReceipt(p).amountAppliedToTax = '500'; balanceReceipt(p).original.amount = '500';
  const v = run(p);
  expect(v.incomeTax.toFixed()).toBe('500'); expect(v.amountDue?.toFixed()).toBe('500');
  expect(v.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe('500');
  expect(v.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
  for (const [factor, tax] of [['large', '600'], ['zero', '0']] as const) {
    const other = paidBusiness(status, factor);
    delete other.input.ohioPayments;
    expect(run(other).incomeTax.toFixed()).toBe(tax);
    const paid = paidBusiness(status, factor);
    balanceReceipt(paid).amountAppliedToTax = tax; balanceReceipt(paid).original.amount = tax;
    expect(() => run(paid)).toThrow(/positive|500/);
  }
});
