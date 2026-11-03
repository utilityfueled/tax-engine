/** New explicitly fictional 2025 originals; no user facts or application defaults.
 * NY final tax1000 is stipulated filed-return evidence, not an NY tax calculation.
 */
import { TaxYearInputSchema } from '@/models/inputs';
import { PAResidencySourcesSchema } from '@/models/pa-residency';
import { PAResidentCreditSourcesSchema } from '@/models/pa-resident-credit-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { confirmGuidedW2StateLocalSources } from '@/lib/guided-w2-state-local-facts';
import { confirmGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { confirmGuidedPAOrdinaryReturnFacts } from '@/lib/guided-pa-ordinary-return-facts';
import { confirmGuidedPAOrdinaryReturnCompletionSources } from '@/lib/guided-pa-ordinary-return-completion';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
import { startCompleteInterview, completePersonalInfo, completeW2Entry } from '../guided-interview/complete-facts';
import { paOrdinaryReturnFixture } from './pa-ordinary-return';

export function guidedPAW2Complete(stateCode: 'NY' | 'PA') {
  const template = paOrdinaryReturnFixture();
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: 'PA' });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo), addressLine1: '42 Fictional PA Road', city: 'Pittsburgh', state: 'PA', zip: '15213' };
  const entry = {
    ...completeW2Entry, sourceTaxYear: '2025', employerName: 'Fictional Complete W2 Employer', employerEin: '12-3456789',
    wages: '30000', federalWithheld: '0', socialSecurityWages: '30000', socialSecurityWithheld: '0',
    socialSecurityTips: '0', allocatedTips: '0', medicareWages: '30000', medicareWithheld: '0',
    box10DependentCareBenefits: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0',
    box12CodeH: '0', box12CodeS: '0', box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0', box12CodeW: '0',
    stateTaxReporting: 'single' as const, state: stateCode, stateWages: '30000', stateWithheld: '123.45',
  };
  state.sectionData['income-w2'] = { entries: [entry] };
  const raw = buildTaxInputFromGuidedData(state);
  if (!raw) throw new Error('Fictional complete federal W2 originals are required');
  const base = TaxYearInputSchema.parse(raw);
  const w2Sources = confirmGuidedW2StateLocalSources(base, 0, {
    sourceTaxYear: 2025, sourceReference: `Fictional complete ${stateCode} W2 all pages`, sourceFactsConfirmed: true,
    owner: { accountHolder: 'primary' }, currentUncorrectedNonvoidOriginalConfirmed: true,
    allOriginalBoxesKnownConfirmed: true, singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
    stateReporting: 'single', localReporting: 'none', legacyScalarProjection: 'first_entered_rows',
    stateRows: [{ printedRow: 1, sourceReference: `Fictional printed ${stateCode} Boxes15-17`, state: stateCode,
      employerStateIDStatus: 'reported', employerStateID: 'Fictional state payroll identifier', wages: '30000', withheld: '123.45' }], localRows: [],
  });
  state.sectionData['income-w2'] = { entries: [{ ...entry, stateLocalSources: w2Sources }] };
  const actual = buildTaxInputFromGuidedData(state);
  if (!actual) throw new Error('Fictional current confirmed W2 originals are required');
  const input = TaxYearInputSchema.parse(actual), w2 = input.w2s[0], t = input.taxpayer.primary;
  if (!w2) throw new Error('Fictional W2 original missing');
  const residencyDraft = PAResidencySourcesSchema.parse({ ...template.input.paResidencySources,
    sourceReference: 'Fictional Jordan complete domicile, payroll and class records',
    owner: { accountHolder: 'primary', originalTaxpayer: { firstName: t.firstName, lastName: t.lastName, ssn: t.ssn } },
    residency: { ...template.input.paResidencySources.residency, sourceReference: 'Fictional Jordan PA full-year domicile and presence' },
    wages: [{ ...template.input.paResidencySources.wages[0], originalIndex: 0, sourceReference: `Fictional ${stateCode} cash wage original`, original: structuredClone(w2),
      payroll: [{ sourceReference: `Fictional actual ${stateCode} physical-work payroll`, paidOn: '2025-12-31', serviceFrom: '2025-01-01', serviceThrough: '2025-12-31', grossCompensation: '30000', paServicesCompensation: stateCode === 'PA' ? '30000' : '0', outsidePAServicesCompensation: stateCode === 'NY' ? '30000' : '0' }] }],
    interest: [],
  });
  const residency = confirmGuidedPAResidencySources(input, residencyDraft), current = { ...input, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(current, { ...template.facts,
    sourceReference: 'Fictional Jordan complete ordinary payment, filing and worldwide SP originals',
    timing: { ...template.facts.timing, asOfDate: '2026-03-01', remainingTaxPayment: stateCode === 'NY'
      ? { status: 'no_remaining_tax', sourceReference: 'Fictional actual resident credit921 pays PA principal921' }
      : { status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: '798', sourceReference: 'Fictional planned PA principal921 less reported withholding123' } },
  });
  const owner = { sourceTaxYear: 2025, accountName: `${t.firstName} ${t.lastName}`, accountSsn: t.ssn, state: 'NY', sourceReference: 'Fictional complete NY return and tax account originals' };
  const payroll = residency.wages[0]?.payroll[0];
  if (!payroll) throw new Error('Fictional payroll original missing');
  const creditSources = PAResidentCreditSourcesSchema.parse({ sourceTaxYear: 2025, sourceReference: 'Fictional Jordan NY same-income tax evidence',
    sourceFactsConfirmed: true, accountName: owner.accountName, accountSsn: owner.accountSsn, completeThroughDate: '2026-03-01', allClaimedReturnsAndSourcePeriodsReviewedConfirmed: true,
    originalFederalSources: snapshotPAOrdinaryReturnOriginals(current), originalPAResidencySources: structuredClone(residency), originalPAReciprocitySources: null, originalPAFacts: structuredClone(facts),
    claims: stateCode === 'PA' ? [] : [{ state: 'NY', sourceReference: 'Fictional actual NY final tax on same wages',
      wages: [{ w2Index: 0, originalW2: structuredClone(w2), payrollIndex: 0, originalPayroll: structuredClone(payroll),
        workOriginal: { ...owner, paidOn: payroll.paidOn, serviceFrom: payroll.serviceFrom, serviceThrough: payroll.serviceThrough, compensation: '30000', ordinaryEmployeeNotShareholderConfirmed: true, allPhysicalServicesInThisStateConfirmed: true } }],
      filedReturn: { ...owner, returnId: 'Fictional-NY-2025-filed-original', returnKind: 'original', filingStatus: 'single', residency: 'nonresident', filedOn: '2026-02-15',
        completeFiledReturnAndSchedulesConfirmed: true, allNonpaymentCreditsReviewedConfirmed: true, ordinaryCompensationNoExpenseOrOtherAdjustmentConfirmed: true,
        allOtherIncomeClassesKnownZeroConfirmed: true, reportedTaxableCompensation: '30000', taxBeforeNonpaymentCredits: '1000', nonpaymentCredits: [], taxAfterNonpaymentCredits: '1000' },
      payments: [{ ...owner, confirmationNumber: 'Fictional-NY-Box17-123.45', kind: 'withholding', date: '2025-12-31', amountAppliedToTax: '123.45', w2Index: 0, originalW2: structuredClone(w2) },
        { ...owner, confirmationNumber: 'Fictional-NY-balance-876.55', kind: 'balance_payment', date: '2026-02-15', amountAppliedToTax: '876.55', w2Index: null, originalW2: null }],
      refunds: [], account: { ...owner, completeThroughDate: '2026-03-01', allPaymentsRefundsTransfersAndOffsetsReviewedConfirmed: true,
        noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed: true, netTaxPaymentsReported: '1000', unpaidTaxReported: '0', overpaymentOutstandingReported: '0' },
    }],
  });
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(current, { ...template.sources,
    sourceReference: 'Fictional Jordan complete other-state, award, care, NRK1, local and relief originals',
    otherStateTaxes: { status: stateCode === 'NY' ? 'actual_payments' : 'none_paid', sourceReference: 'Fictional all-jurisdiction actual payment and refund history', allJurisdictionsAndPaymentsReviewedConfirmed: true,
      jurisdictions: [{ ...owner, completeThroughDate: '2026-03-01', taxPaid: stateCode === 'NY' ? '1000' : '0', incomeTaxWithheld: stateCode === 'NY' ? '123.45' : '0' }],
      ...(stateCode === 'NY' ? { residentCreditSources: creditSources } : {}),
    },
  }, facts);
  state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '', paResidencySources: residency, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: completion };
  return { state, input: current, facts, completion, creditSources };
}
