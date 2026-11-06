/** Explicitly fictional2025 Ohio originals, separate from all PA/VA refund facts. */
import { initialFlowState, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { confirmGuidedOhioResidencyFacts } from '@/lib/guided-ohio-residency-facts';
import { confirmGuidedOhioPaymentFacts } from '@/lib/guided-ohio-payment-facts';
import { confirmGuidedW2StateLocalSources } from '@/lib/guided-w2-state-local-facts';
import { TaxYearInputSchema } from '@/models/inputs';
import { completePersonalInfo, completeW2Entry } from '../guided-interview/complete-facts';
import { actualGuidedDigitalAsset } from './guided-digital-asset-sources';

/** Retain exactly the old incomplete OH facts, with no added source confirmations. */
export function originalIncompleteOhioDigital(): GuidedFlowState {
  const state: GuidedFlowState = { ...initialFlowState, phase: 'interview', taxYear: 2025,
    segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: 'OH' },
    sectionData: { 'personal-info': { ...structuredClone(completePersonalInfo), state: 'OH' },
      'income-w2': { entries: [{ ...completeW2Entry, wages: '50000', stateTaxReporting: 'single', state: 'OH', stateWages: '50000', stateWithheld: '0.40' }] } } };
  const digitalAssetEntries = ['0.10', '0.20', '0.30'].map((stateWithheld, index) => {
    const entry = actualGuidedDigitalAsset();
    Object.assign(entry, { sourceId: `Actual digital statement ${index}`, accountReference: `Actual account ${index}`, stateTaxReporting: 'single', state: index === 2 ? 'VA' : 'OH', stateWithheld });
    for (const row of entry.transactions ?? []) Object.assign(row, { sourceId: `Actual disposition ${index}`, paCostBasis: '80.24', paBasisSourceReference: 'Actual Pennsylvania acquisition records', paBasisFactsConfirmed: true, paTransactionForProfitConfirmed: true });
    return entry;
  });
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], digitalAssetEntries };
  return state;
}

export function guidedOhioCompleteDigital() {
  const state = originalIncompleteOhioDigital();
  const wages = state.sectionData['income-w2']?.entries[0];
  if (!wages) throw new Error('Fictional Ohio W2 original required');
  // New fictional full original supplement, never an application default.
  Object.assign(wages, { sourceTaxYear: '2025', socialSecurityWages: '50000', medicareWages: '50000', allocatedTips: '0',
    box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0', box12CodeH: '0', box12CodeS: '0',
    box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0' });
  const raw = buildTaxInputFromGuidedData(state);
  if (!raw) throw new Error('Fictional complete federal originals required');
  const before = TaxYearInputSchema.parse(raw);
  wages.stateLocalSources = confirmGuidedW2StateLocalSources(before, 0, {
    sourceTaxYear: 2025, sourceReference: 'Fictional current original Ohio W2 all pages', sourceFactsConfirmed: true,
    owner: { accountHolder: 'primary' }, currentUncorrectedNonvoidOriginalConfirmed: true,
    allOriginalBoxesKnownConfirmed: true, singleOriginalWithoutContinuationConfirmed: true,
    allOriginalPagesAndCopiesCheckedConfirmed: true, stateReporting: 'single', localReporting: 'none', legacyScalarProjection: 'first_entered_rows',
    stateRows: [{ printedRow: 1, sourceReference: 'Fictional actual Ohio W2 Boxes15-17', state: 'OH', employerStateIDStatus: 'reported', employerStateID: 'Fictional actual OH employer identifier', wages: '50000', withheld: '0.40' }], localRows: [],
  });
  const current = buildTaxInputFromGuidedData(state);
  if (!current) throw new Error('Fictional current Ohio W2 and digital originals required');
  const input = TaxYearInputSchema.parse(current);
  const ohioResidency = confirmGuidedOhioResidencyFacts(input, {
    taxYear: '2025', sourceReference: 'Fictional complete2025 Ohio domicile and income originals', sourceFactsConfirmed: true,
    allFederalSourcesIncludedConfirmed: true, noBusinessIncomeConfirmed: true, schoolDistrictStatus: 'no_ohio_taxing_district_residency',
    owners: [{ accountHolder: 'primary', status: 'full_year_resident', sourceReference: 'Fictional actual Jordan domicile and non-taxing district records',
      periods: [{ from: '2025-01-01', to: '2025-12-31', domicileState: 'OH' }], stateAdditions: [], stateDeductions: [] }],
  });
  const ohioPayments = confirmGuidedOhioPaymentFacts(input, {
    taxYear: '2025', sourceReference: 'Fictional complete2025 Ohio tax account and payment instructions', sourceFactsConfirmed: true,
    calendarYearConfirmed: true, allPaymentsIncludedConfirmed: true, paymentRows: [],
    priorReturn: { status: 'no_return', sourceReference: 'Fictional complete Ohio account no prior-year return' },
    priorCreditCarryforward: { status: 'none', sourceReference: 'Fictional complete account no prior Ohio credit' },
    remainingTaxPayment: { status: 'expected_payment', sourceReference: 'Fictional independently planned942 tax less reported withholding1 principal941', sourceFactsConfirmed: true, date: '2026-04-15', amountAppliedToTax: '941' },
    currentTiming: { kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-01' },
    filingExtension: { kind: 'none' }, paymentExtension: { kind: 'none' }, returnKind: 'original',
    specialFacts: { farmingFishingIncome: 'known_none', militaryDisasterRelief: 'known_none' },
    balanceFacts: { sourceReference: 'Fictional complete use-tax and refund election originals', useTax: '0', outgoingCarryforward: '0', donations: '0' },
  });
  state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '', ohioResidency, ohioPayments };
  return { state, input, ohioResidency, ohioPayments };
}
