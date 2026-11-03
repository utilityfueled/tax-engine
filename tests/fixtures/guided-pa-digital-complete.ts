/** New fictional source evidence only; not actual user facts or defaults.
 * Actual complete VA refund originals are independently supplied and bound only
 * by the explicit confirmation action; no zero tax or refund is inferred.
 */
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
import { TaxYearInputSchema } from '@/models/inputs';
import { PAResidencySourcesSchema } from '@/models/pa-residency';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { confirmGuidedW2StateLocalSources } from '@/lib/guided-w2-state-local-facts';
import { confirmGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { confirmGuidedPAOrdinaryDigitalSources } from '@/lib/guided-pa-ordinary-digital-sources';
import { confirmGuidedPAOrdinaryReturnFacts } from '@/lib/guided-pa-ordinary-return-facts';
import { confirmGuidedPADigitalTaxRefundSources } from '@/lib/guided-pa-digital-tax-refund-sources';
import { confirmGuidedPAOrdinaryReturnCompletionSources } from '@/lib/guided-pa-ordinary-return-completion';
import { startCompleteInterview, completePersonalInfo, completeW2Entry } from '../guided-interview/complete-facts';
import { paOrdinaryReturnFixture } from './pa-ordinary-return';
import { actualGuidedDigitalAsset } from './guided-digital-asset-sources';
export function guidedPACompleteDigital() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: 'PA' });
  state.sectionData['personal-info'] = { ...structuredClone(completePersonalInfo), addressLine1: '42 Fictional PA Road', city: 'Pittsburgh', state: 'PA', zip: '15213' };
  const entry = { ...completeW2Entry, sourceTaxYear: '2025', wages: '50000', federalWithheld: '0',
    socialSecurityWages: '50000', socialSecurityTips: '0', allocatedTips: '0', socialSecurityWithheld: '0', medicareWages: '50000', medicareWithheld: '0',
    box10DependentCareBenefits: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0', box12CodeH: '0', box12CodeS: '0',
    box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0', box12CodeW: '0', stateTaxReporting: 'single' as const, state: 'PA', stateWages: '50000', stateWithheld: '0.40' };
  state.sectionData['income-w2'] = { entries: [entry] };
  const digitalAssetEntries = ['0.10', '0.20', '0.30'].map((stateWithheld, index) => {
    const original = actualGuidedDigitalAsset();
    Object.assign(original, { sourceId: `Actual digital statement ${index}`, accountReference: `Actual account ${index}`, stateTaxReporting: 'single', state: index === 2 ? 'VA' : 'PA', stateWithheld });
    for (const row of original.transactions ?? []) Object.assign(row, { sourceId: `Actual disposition ${index}`, paCostBasis: '80.24', paBasisSourceReference: 'Actual Pennsylvania acquisition records', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
    return original;
  });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries };
  const raw = buildTaxInputFromGuidedData(state); if (!raw) throw new Error('Fictional complete digital federal input required');
  const base = TaxYearInputSchema.parse(raw);
  const packet = confirmGuidedW2StateLocalSources(base, 0, { sourceTaxYear: 2025, sourceReference: 'Fictional current original W2 all pages', sourceFactsConfirmed: true,
    owner: { accountHolder: 'primary' }, currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true, stateReporting: 'single', localReporting: 'none', legacyScalarProjection: 'first_entered_rows',
    stateRows: [{ printedRow: 1, sourceReference: 'Fictional actual PA W2 Boxes15-17', state: 'PA', employerStateIDStatus: 'reported', employerStateID: 'Fictional actual state employer identifier', wages: '50000', withheld: '0.40' }], localRows: [] });
  state.sectionData['income-w2'] = { entries: [{ ...entry, stateLocalSources: packet }] };
  const federal = buildTaxInputFromGuidedData(state); if (!federal) throw new Error('Fictional confirmed W2 source required');
  const input = TaxYearInputSchema.parse(federal), template = paOrdinaryReturnFixture();
  const digital = confirmGuidedPAOrdinaryDigitalSources(input, { sourceTaxYear: 2025, sourceReference: 'Fictional full dated digital capital and PA remittance originals', sourceFactsConfirmed: true,
    allOriginalDigitalStatementsIncludedConfirmed: true, noOtherCapitalAdjustmentsConfirmed: true,
    statements: input.form1099DA.map((_, originalIndex) => ({ originalIndex, sourceReference: `Fictional original DA${originalIndex} plus remittance proof`, sourceFactsConfirmed: true, actualPaymentToPAConfirmed: originalIndex !== 2, notRefundedByPayerConfirmed: true })) }, 'resident');
  const residencyDraft = PAResidencySourcesSchema.parse({ ...template.input.paResidencySources, sourceReference: 'Fictional full-year PA original source records', interest: [], digitalSources: digital,
    wages: [{ ...template.input.paResidencySources.wages[0], original: structuredClone(input.w2s[0]), payroll: [{ sourceReference: 'Fictional actual PA physical-work annual payroll', paidOn: '2025-12-31', serviceFrom: '2025-01-01', serviceThrough: '2025-12-31', grossCompensation: '50000', paServicesCompensation: '50000', outsidePAServicesCompensation: '0' }] }] });
  const residency = confirmGuidedPAResidencySources(input, residencyDraft), current = { ...input, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(current, { ...template.facts, timing: { ...template.facts.timing, asOfDate: '2026-03-01',
    remainingTaxPayment: { status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: '1536', sourceReference: 'Fictional independently planned principal1537 minus reported withholding1' } } });
  const t = input.taxpayer.primary, owner = { sourceTaxYear: 2025, accountName: `${t.firstName} ${t.lastName}`, accountSsn: t.ssn, state: 'VA' };
  const vaRefundOriginals = { ...owner, sourceReference: 'Fictional complete VA current final return, refund and closed tax-account evidence', completeThroughDate: '2026-03-01',
    originalStatementIndex: 2, originalStatement: structuredClone(input.form1099DA[2]),
    filedReturn: { ...owner, sourceReference: 'Fictional actual original filed VA return and all schedules', returnId: 'Fictional-VA-2025-final-original', returnKind: 'original', residency: 'nonresident', filedOn: '2026-02-15',
      allIncomeAndAdjustmentsReviewedConfirmed: true, finalTax: '0', totalPayments: '0', overpayment: '0', refundRequested: '0', noOtherPaymentsCreditsOffsetsOrTransfersConfirmed: true },
    specialWrittenApplication: { ...owner, sourceReference: 'Fictional signed special written refund application with exact statement attached', applicationId: 'Fictional-VA-written-sub-dollar-application', submittedOn: '2026-02-16', amountRequested: '0.30', actuallySubmittedConfirmed: true },
    agencyAward: { ...owner, sourceReference: 'Fictional agency determination awarding actual sub-dollar overpayment', awardId: 'Fictional-VA-accepted-030-application', issuedOn: '2026-02-20', applicationId: 'Fictional-VA-written-sub-dollar-application', finalTaxDetermined: '0', refundAwarded: '0.30', actualAgencyDeterminationConfirmed: true },
    withholding: { ...owner, sourceReference: 'Fictional VA actual digital tax remittance original', date: '2025-06-01', amount: '0.30', confirmationNumber: 'Fictional-VA-DA2-remittance-030' },
    refund: { ...owner, sourceReference: 'Fictional VA agency refund posting and bank receipt', postedOn: '2026-02-20', receivedOn: '2026-02-21', amount: '0.30', confirmationNumber: 'Fictional-VA-actual-received-refund-030', actuallyReceivedConfirmed: true },
    account: { ...owner, sourceReference: 'Fictional complete VA income tax account and agency correspondence', completeThroughDate: '2026-03-01', allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed: true,
      noAmendmentAssessmentOrPendingAdjustmentConfirmed: true, netTaxPaymentsReported: '0', unpaidTaxReported: '0', overpaymentOutstandingReported: '0' },
  };
  const refundSources = {
    sourceTaxYear: 2025, sourceReference: 'Fictional actual VA digital tax full-refund source packet', sourceFactsConfirmed: true,
    completeThroughDate: '2026-03-01', owner: { firstName: t.firstName, lastName: t.lastName, ssn: t.ssn },
    originalFederalSources: snapshotPAOrdinaryReturnOriginals(current), originalPAResidencySources: structuredClone(residency), originalPAFacts: structuredClone(facts),
    allVAIncomeTaxOriginalsReviewedConfirmed: true, noOtherVAIncomeCreditsPaymentsOrAssessmentsConfirmed: true,
    statements: [{ originalIndex: 2, sourceReference: 'Fictional current VA digital original and actual remittance receipt', sourceFactsConfirmed: true,
      originalStatement: structuredClone(input.form1099DA[2]), withholdingOriginal: structuredClone(vaRefundOriginals.withholding) }],
    filedReturn: { ...vaRefundOriginals.filedReturn, filingStatus: 'single', reportedWithholding: '0' },
    specialWrittenApplication: structuredClone(vaRefundOriginals.specialWrittenApplication), agencyAward: structuredClone(vaRefundOriginals.agencyAward),
    refund: structuredClone(vaRefundOriginals.refund), account: structuredClone(vaRefundOriginals.account),
  };
  // Explicit new fictional source confirmation binds the actual independently
  // supplied VA return, application, agency award and received-refund originals.
  const confirmedRefundSources = confirmGuidedPADigitalTaxRefundSources(current, facts, refundSources);
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(current, { ...template.sources, otherStateTaxes: { status: 'actual_payments', sourceReference: 'Fictional complete VA withholding and actual refund history', allJurisdictionsAndPaymentsReviewedConfirmed: true,
    refundedDigitalSources: confirmedRefundSources, jurisdictions: [{ ...owner, sourceReference: 'Fictional VA original gross withholding.30 and netpaid0 after received refund', completeThroughDate: '2026-03-01', taxPaid: '0', incomeTaxWithheld: '0.30' }] } }, facts);
  state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '', paResidencySources: residency, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: completion };
  return { state, input: current, facts, completion, digital, vaRefundOriginals, refundSources };
}
