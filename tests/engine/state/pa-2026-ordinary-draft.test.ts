import Decimal from 'decimal.js';
import {Form1099IntSchema} from '@/models/inputs.js';
import {it,expect} from 'vitest';
import {calculatePAOrdinaryReturn,calculatePA2026OrdinaryDraft} from '@/engine/state/pa-ordinary-return.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {getConstants} from '@/models/constants.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {pa2026OrdinaryDraftFixture,rebindPA2026Draft} from '../../fixtures/pa-2026-ordinary-draft.js';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return.js';
import {paOrdinaryLocalW2Fixture} from '../../fixtures/pa-ordinary-local-w2.js';
import {confirmGuidedPAOrdinaryReturnFacts,buildGuidedPAOrdinaryReturnFacts,updateGuidedPAOrdinaryReturnFacts} from '../../../apps/web/src/lib/guided-pa-ordinary-return-facts.js';
import {confirmGuidedPAOrdinaryReturnCompletionSources,buildGuidedPAOrdinaryReturnCompletionSources,updateGuidedPAOrdinaryReturnCompletionSources} from '../../../apps/web/src/lib/guided-pa-ordinary-return-completion.js';
// Spec: spec/state/pa-2026-ordinary-draft.yaml; all literal oracles fixed before implementation.
it('PA2026 draft composes all actual residency sources without full federal admission',()=>{
 for(const [status,taxable,tax] of [['resident','75000','2303'],['part_year','39000','1197'],['nonresident','9000','276']] as const){
  const f=pa2026OrdinaryDraftFixture(status),before=JSON.stringify(f),r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);
  expect(r.kind).toBe('pa-2026-ordinary-source-draft');expect(r.taxYear).toBe(2026);expect(r.pa.residencyStatus).toBe(status);expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe(taxable);expect(r.pa.pa40.taxLiability.toFixed()).toBe(tax);expect(new Decimal(taxable).times('0.0307').toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed()).toBe(tax);expect(r.pa.pa40.netOverpayment.toFixed()).toBe('0');expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75000');expect(r.pa.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');expect(r.pa.workingCredit.credit.toFixed()).toBe('0');expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');expect(r.dependencyProof.maximumCompletedEitcPhaseout.toFixed()).toBe('70244');expect(r).not.toHaveProperty('federal');expect(JSON.stringify(f)).toBe(before);
 }
});

it.each([
  [183, 'part_year'], [184, 'part_year'], [200, 'part_year'], [200, 'resident'],
] as const)('PA2026 one-move draft holds annual PA presence at and above the separate-method boundary (%s days, %s)', (days, status) => {
  const f = pa2026OrdinaryDraftFixture('part_year');
  const residency = f.input.paResidencySources.residency;
  residency.status = status;
  residency.domicilePeriods[0].daysInPA = days - 180;
  residency.domicilePeriods[1].daysInPA = 180;
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/one-move.*183.*separate residency method/i);
});

it('PA2026 one-move draft accepts 182 documented PA days with the matching part-year claim', () => {
  const f = pa2026OrdinaryDraftFixture('part_year');
  const residency = f.input.paResidencySources.residency;
  residency.domicilePeriods[0].daysInPA = 2;
  residency.domicilePeriods[1].daysInPA = 180;
  rebindPA2026Draft(f);
  const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(result.pa.residencyStatus).toBe('part_year');
  expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39000');
  expect(result.pa.pa40.taxLiability.toFixed()).toBe('1197');
  residency.status = 'resident';
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/claimed residency contradicts/i);
});

function wage(f:ReturnType<typeof pa2026OrdinaryDraftFixture>,value:string,tax:string){const w=f.input.w2s[0],row=f.input.paResidencySources.wages[0];w.wages=value;w.stateWages=value;w.stateTaxWithheld=tax;row.payroll[0].grossCompensation=value;row.payroll[0].outsidePAServicesCompensation=value;rebindPA2026Draft(f);}
it('PA2026 draft preserves exact cents known zero and complete withholding',()=>{
 const f=pa2026OrdinaryDraftFixture();wage(f,'70244.01','2156');const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.dependencyProof.ordinaryWages.toFixed()).toBe('70244.01');expect(r.pa.pa40.compensation.toFixed()).toBe('70244');expect(r.pa.pa40.taxLiability.toFixed()).toBe('2156');
 const z=pa2026OrdinaryDraftFixture('nonresident');z.input.w2s[0].stateWages='0';z.input.w2s[0].stateTaxWithheld='0';Object.assign(z.input.paResidencySources.wages[0].payroll[0],{paServicesCompensation:'0',outsidePAServicesCompensation:'75000'});rebindPA2026Draft(z);const zero=calculatePA2026OrdinaryDraft(z.input,z.facts,z.sources);expect(zero.pa.pa40.taxLiability.toFixed()).toBe('0');expect(zero.pa.localBoundary.status).toBe('separate_return_required');
 const under=pa2026OrdinaryDraftFixture();under.input.w2s[0].stateTaxWithheld='2302.49';rebindPA2026Draft(under);expect(()=>calculatePA2026OrdinaryDraft(under.input,under.facts,under.sources)).toThrow(/withholding/i);
 const half=pa2026OrdinaryDraftFixture();half.input.w2s[0].stateTaxWithheld='2302.50';rebindPA2026Draft(half);expect(calculatePA2026OrdinaryDraft(half.input,half.facts,half.sources).pa.pa40.stateWithholding.toFixed()).toBe('2303');
});

function paidNonresident(status: 'nonresident' | 'part_year' = 'nonresident') {
  const f = pa2026OrdinaryDraftFixture(status);
  const owner = f.input.taxpayer.primary;
  f.input.w2s[0].stateTaxWithheld = '0';
  f.sources.otherStateTaxes.jurisdictions[0].completeThroughDate = '2027-04-15';
  const receipt = {
    accountName: owner.firstName + ' ' + owner.lastName,
    accountSsn: owner.ssn,
    taxYear: 2026,
    returnType: 'pa40',
    kind: 'balance',
    date: '2027-04-15',
    amount: '276',
    confirmationNumber: 'FICTIONAL-PA-2026-REMITTANCE',
  };
  f.facts.timing = {
    ...f.facts.timing,
    kind: 'filed',
    date: '2027-04-15',
    asOfDate: '2027-04-15',
    remainingTaxPayment: {
      status: 'actual_payment',
      sourceReference: 'Private original April balance remittance',
      date: '2027-04-15',
      amountAppliedToTax: '276',
      original: receipt,
    },
  };
  rebindPA2026Draft(f);
  const estimatedTaxReview2026 = {
    sourceTaxYear: 2026,
    sourceFactsConfirmed: true,
    allDeterminationPeriodsAndChangesReviewedConfirmed: true,
    owner: {firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn},
    originalPAResidencySources: structuredClone(f.input.paResidencySources),
    periods: ['2026-04-01', '2026-06-01', '2026-09-01', '2026-12-31'].map(throughDate => ({
      throughDate,
      sourceReference: 'Private contemporaneous pay and work schedule ending ' + throughDate,
      maximumExpectedPATaxableWages: '9000',
    })),
  };
  return {...f, receipt, sources: {...f.sources, estimatedTaxReview2026}};
}

function changePAWages(f: ReturnType<typeof paidNonresident>, wages: string, paidAmount: string) {
  f.input.w2s[0].stateWages = wages;
  Object.assign(f.input.paResidencySources.wages[0].payroll[0], {
    paServicesCompensation: wages,
    outsidePAServicesCompensation: new Decimal('75000').minus(wages).toFixed(),
  });
  f.receipt.amount = paidAmount;
  f.facts.timing.remainingTaxPayment.amountAppliedToTax = paidAmount;
  rebindPA2026Draft(f);
  f.sources.estimatedTaxReview2026.originalPAResidencySources = structuredClone(f.input.paResidencySources);
}

it('PA2026 draft reconciles a timely actual nonresident small balance separately from return tax', () => {
  const f = paidNonresident();
  const before = JSON.stringify(f);
  const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(r.pa.residencyStatus).toBe('nonresident');
  expect(new Decimal('9000').times('0.0307').toFixed()).toBe('276.3');
  expect(r.pa.pa40.taxLiability.toFixed()).toBe('276');
  expect(r.pa.pa40.stateWithholding.toFixed()).toBe('0');
  expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('276');
  expect(r.pa.rev1630.penaltyRequired).toBe(false);
  expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
  expect(r.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe('276');
  expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
  expect(r.readiness.filingEligible).toBe(false);
  expect(r.readiness.fullFederalCalculated).toBe(false);
  expect(() => calculatePAOrdinaryReturn(f.input, f.facts, f.sources)).toThrow(/incomplete/);
  expect(JSON.stringify(r)).not.toContain(f.receipt.confirmationNumber);
  expect(JSON.stringify(f)).toBe(before);
});

it('PA2026 draft accepts a confirmed $429 balance below both 2026 estimate boundaries', () => {
  const f = paidNonresident();
  changePAWages(f, '13990', '429');
  for (const period of f.sources.estimatedTaxReview2026.periods) period.maximumExpectedPATaxableWages = '13990';
  const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('429');
  expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
  expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
});

it.each([
  ['missing proof', /withholding/],
  ['stale owner', /owner/],
  ['stale year', /completion source shape/],
  ['stale payroll reference', /originals are stale/],
  ['competing retained estimate review', /retained estimate review differs/],
  ['incomplete review', /completion source shape/],
  ['missing period', /completion source shape/],
  ['later projection', /completion source shape/],
  ['missing projection source', /completion source shape/],
  ['expected income at threshold', /expected.*14,000/],
  ['expected rounded tax at threshold', /expected.*430/],
  ['actual income at threshold', /actual.*14,000/],
  ['actual reported balance at threshold', /actual.*430/],
  ['expected receipt', /actual.*receipt/],
  ['expected filing', /actual filed return/],
  ['late receipt', /dated successor/],
  ['wrong receipt owner', /owner/],
  ['wrong receipt year', /identity\/date\/amount/],
  ['receipt not exact tax due', /fresh printed tax due/],
  ['partial withholding', /zero PA withholding/],
  ['part-year resident', /nonresident/],
  ['stale original W-2 year', /current W-2|year/],
] as const)('PA2026 draft rejects unsupported nonresident small balance evidence (%s)', (kind, reason) => {
  const f = paidNonresident(kind === 'part-year resident' ? 'part_year' : 'nonresident');
  const review = f.sources.estimatedTaxReview2026;
  const timing = f.facts.timing;
  if (kind === 'missing proof') {
    const {estimatedTaxReview2026: _review, ...completion} = f.sources;
    expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, completion)).toThrow(reason);
    return;
  }
  if (kind === 'stale owner') review.owner.ssn = '333-22-1111';
  if (kind === 'stale year') review.sourceTaxYear = 2025;
  if (kind === 'stale payroll reference') f.input.paResidencySources.wages[0].payroll[0].sourceReference = 'Replacement original';
  if (kind === 'competing retained estimate review') {
    const retained = structuredClone(f.sources);
    retained.estimatedTaxReview2026.periods[0].maximumExpectedPATaxableWages = '14000';
    Reflect.set(f.input, 'paOrdinaryReturnCompletionSources', retained);
  }
  if (kind === 'incomplete review') review.allDeterminationPeriodsAndChangesReviewedConfirmed = false;
  if (kind === 'missing period') review.periods.pop();
  if (kind === 'later projection') review.periods[0].throughDate = '2026-04-02';
  if (kind === 'missing projection source') review.periods[0].sourceReference = ' ';
  if (kind === 'expected income at threshold') review.periods[0].maximumExpectedPATaxableWages = '14000';
  if (kind === 'expected rounded tax at threshold') review.periods[0].maximumExpectedPATaxableWages = '13999';
  if (kind === 'actual income at threshold' || kind === 'actual reported balance at threshold') {
    changePAWages(f, kind === 'actual income at threshold' ? '14000' : '13999', '430');
  }
  if (kind === 'expected receipt') {
    timing.remainingTaxPayment.status = 'expected_payment';
    delete timing.remainingTaxPayment.original;
  }
  if (kind === 'expected filing') timing.kind = 'expected';
  if (kind === 'late receipt') f.receipt.date = timing.remainingTaxPayment.date = '2027-04-16';
  if (kind === 'wrong receipt owner') f.receipt.accountSsn = '333-22-1111';
  if (kind === 'wrong receipt year') f.receipt.taxYear = 2025;
  if (kind === 'receipt not exact tax due') f.receipt.amount = timing.remainingTaxPayment.amountAppliedToTax = '275.99';
  if (kind === 'partial withholding' || kind === 'stale original W-2 year') {
    if (kind === 'partial withholding') f.input.w2s[0].stateTaxWithheld = '1';
    else f.input.w2s[0].taxYear = 2025;
    rebindPA2026Draft(f);
    review.originalPAResidencySources = structuredClone(f.input.paResidencySources);
  }
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(reason);
});

it('PA2026 draft checks retained death facts before income-based EIC proofs', () => {
  for (const status of ['resident', 'part_year', 'nonresident'] as const) {
    const f = pa2026OrdinaryDraftFixture(status);
    for (const primaryDeathDate of ['2026-12-30', '2027-02-01', '']) {
      f.input.standardDeductionFacts = { primaryDeathDate };
      rebindPA2026Draft(f);
      expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/death date/);
    }
    f.input.standardDeductionFacts = { primaryDeathDate: null };
    rebindPA2026Draft(f);
    const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
    expect(result.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
    expect(result.readiness.filingEligible).toBe(false);
  }
});
it.each(['70244','70243.99','0'])('PA2026 draft denies unproven all-child-count EIC zero at %s',value=>{const f=pa2026OrdinaryDraftFixture();wage(f,value,'2303');expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/phaseout|wage/i);});
it.each(['year','owner','unconfirmed','duplicate','payroll','unknownGross','unknownWithholding','unknownCare','positiveCare','benefit','retainedInterest','retainedAdjustment','retainedEIC','retainedForeign','unknownEmptyRoot','unreviewedOther','sourceExtension','spUnknown','sourceUnknown','married','late'])('PA2026 draft rejects unsupported or unknown actual source %s',kind=>{
 const f=pa2026OrdinaryDraftFixture();
 if(kind==='year')f.input.taxpayer.taxYear=2025;if(kind==='owner')f.input.taxpayer.primary.ssn='900-00-9999';if(kind==='unconfirmed')f.facts.sourceFactsConfirmed=false;if(kind==='duplicate')f.input.w2s.push(structuredClone(f.input.w2s[0]));if(kind==='payroll')f.input.paResidencySources.wages[0].payroll[0].grossCompensation='74999';if(kind==='unknownGross')f.input.w2s[0].wages='';if(kind==='unknownWithholding')f.input.w2s[0].stateTaxWithheld='';if(kind==='unknownCare')Reflect.set(f.sources.care,'allCarePaymentSourcesReviewedConfirmed',null);if(kind==='positiveCare')Reflect.set(f.input,'dependentCare',{expenses:'1'});if(kind==='benefit')f.input.w2s[0].box10DependentCareBenefits='1';if(kind==='retainedInterest')f.input.form1099Int.push(Form1099IntSchema.parse({payer:'Actual retained bank',interestIncome:'0',stateWithheld:'0'}));if(kind==='retainedAdjustment')Reflect.set(f.input,'adjustments',{iraDeduction:'1'});if(kind==='retainedEIC')Reflect.set(f.input,'eic',{mfsEicEligible:false});if(kind==='retainedForeign')Reflect.set(f.input,'form2555',{});if(kind==='unknownEmptyRoot')Reflect.set(f.input,'unreviewedFutureSource',[]);if(kind==='unreviewedOther')Reflect.set(f.sources.otherStateTaxes,'allJurisdictionsAndPaymentsReviewedConfirmed',null);if(kind==='sourceExtension')Reflect.set(f.input.paResidencySources,'employeeSources',{});if(kind==='spUnknown')f.facts.sp.allWorldwideSourcesCompleteConfirmed=false;if(kind==='sourceUnknown')Reflect.set(f.input.paResidencySources,'otherPAIncomeClassesConfirmedNone',null);if(kind==='married')f.input.taxpayer.filingStatus='married_filing_jointly';if(kind==='late')f.facts.timing.date='2027-04-16';
 // Where possible refresh lexical snapshots: a current unsupported original must still deny.
 if(!['owner','unconfirmed','duplicate'].includes(kind))rebindPA2026Draft(f);
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
});
it('PA2026 draft preserves actual guided source capture and stale original denial',()=>{
 const f=pa2026OrdinaryDraftFixture('part_year');const facts=confirmGuidedPAOrdinaryReturnFacts(f.input,{...f.facts,sourceFactsConfirmed:null});const completion=confirmGuidedPAOrdinaryReturnCompletionSources(f.input,{...f.sources,sourceFactsConfirmed:null},facts);
 expect(calculatePA2026OrdinaryDraft(f.input,buildGuidedPAOrdinaryReturnFacts(f.input,facts),buildGuidedPAOrdinaryReturnCompletionSources(f.input,completion,facts)).pa.pa40.taxLiability.toFixed()).toBe('1197');
 const saved=JSON.parse(JSON.stringify({facts,completion}));expect(buildGuidedPAOrdinaryReturnFacts(f.input,saved.facts)).toEqual(facts);expect(buildGuidedPAOrdinaryReturnCompletionSources(f.input,saved.completion,saved.facts)).toEqual(completion);
 f.input.w2s[0].employer.ein='98-7654321';expect(()=>buildGuidedPAOrdinaryReturnFacts(f.input,facts)).toThrow();expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,completion,facts)).toThrow();
 const unconfirmed=updateGuidedPAOrdinaryReturnFacts(facts,{sourceReference:'Changed actual document reference'});const c=updateGuidedPAOrdinaryReturnCompletionSources(completion,{sourceReference:'Changed actual complete credit reference'});expect(unconfirmed.sourceFactsConfirmed).toBeNull();expect(c.sourceFactsConfirmed).toBeNull();expect(()=>calculatePA2026OrdinaryDraft(f.input,unconfirmed,c)).toThrow();expect(unconfirmed.originalFederalSources).toEqual(facts.originalFederalSources);
});
it('PA2026 carries mixed reviewed local obligations from guided capture', () => {
 const f = pa2026OrdinaryDraftFixture('part_year');
 const printed = paOrdinaryLocalW2Fixture('part_year', { year: 2026 });
 const w2 = f.input.w2s[0];
 Object.assign(w2, { localWages: '50000', localTaxWithheld: '500.25', localityName: printed.rows.localRows[0].localityName });
 w2.stateLocalSources = {
  ...printed.rows,
  originalW2: structuredClone(w2),
  stateRows: [{ ...printed.rows.stateRows[0], wages: w2.stateWages, withheld: w2.stateTaxWithheld }],
 };
 rebindPA2026Draft(f);
 const [work, residence] = printed.sources.local.jurisdictions;
 f.sources.local.jurisdictions = [{ ...work, returnRequired: false, sourceReference: 'Private documented work collector decision' }, residence];
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const confirm = () => confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const confirmed = confirm();
 const result = calculatePA2026OrdinaryDraft(f.input, facts, buildGuidedPAOrdinaryReturnCompletionSources(f.input, confirmed, facts)).pa;
 expect(result.localBoundary.status).toBe('separate_return_required');
 expect(result.localBoundary.jurisdictions.map(row => row.returnRequired)).toEqual([false, true]);
 expect(result.localBoundary.reportedW2LocalRows?.map(row => [row.jurisdictionIndex, row.withheld.toFixed()])).toEqual([[0, '500.25']]);
 expect(result.pa40.stateWithholding.toFixed()).toBe('1197');
 expect(result.pa40.taxLiability.toFixed()).toBe('1197');
 expect(result.readiness.filingEligible).toBe(false);
 expect(JSON.stringify(result.lines)).not.toContain('Private documented work collector decision');

 for (const answer of [false, null]) {
  const incomplete = structuredClone(confirmed);
  Object.assign(incomplete.local.jurisdictions[1], { returnRequired: answer });
  expect(() => calculatePA2026OrdinaryDraft(f.input, facts, incomplete)).toThrow(/local/i);
 }
});
it('PA2026 draft retains actual public federal ordinary and PDF gates',()=>{
 const f=pa2026OrdinaryDraftFixture();const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.pa.readiness.filingEligible).toBe(false);expect(r.pa.readiness.formStatus).toBe('draft_2026_review_only');expect(r.readiness.filingEligible).toBe(false);expect(r.readiness.fullFederalCalculated).toBe(false);
 expect(()=>getConstants(2026)).toThrow(/incomplete/);expect(()=>calculateFederalTax(f.input)).toThrow(/incomplete/);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/incomplete/);expect(()=>preparePAOrdinaryReturnReview(f.input)).toThrow(/2025|2026/);
 const old=paOrdinaryReturnFixture();expect(calculatePAOrdinaryReturn(old.input,old.facts,old.sources).pa40.taxLiability.toFixed()).toBe('1539');expect(()=>calculatePA2026OrdinaryDraft(old.input,old.facts,old.sources)).toThrow(/2026/);
});
it('PA2026 draft audit omits original identities and preserves whole canonical source currentness',()=>{const f=pa2026OrdinaryDraftFixture();const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources),json=JSON.stringify(r);expect(json).not.toContain(f.input.taxpayer.primary.ssn);expect(json).not.toContain(f.input.w2s[0].employer.ein);const before=r.pa.sourceCommitment;f.facts.sourceReference='Reference-only updated original';expect(calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources).pa.sourceCommitment).not.toBe(before);f.input.w2s[0].wages='75000.00';expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();});
