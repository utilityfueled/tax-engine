import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { foreignTaxDirectCreditFixture } from './foreign-tax-direct-credit';
import { completeInterestEntry, completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { emptyOtherTaxesData } from '@/lib/guided-interview-flow';

/** Independently specified synthetic originals, not an IRS published example. */
export function guidedForeignTaxK3Fixture(year = 2025) {
  const original = foreignTaxDirectCreditFixture(year);
  const annual = original.foreignTaxElection;
  if (!annual?.creditWithoutForm1116 || !annual.sources?.[0]) throw new Error('Synthetic direct-credit original missing');
  const k3 = { sourceTaxYear: String(year), entityType: 'partnership' as const, partnershipName: 'Fictional Portfolio LP', partnershipEIN: '12-3456789',
    accountHolder: 'primary' as const, recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333',
    originalK1Reference: 'Synthetic original portfolio K1', qualifiedStatementKind: 'schedule_k3_1065' as const,
    qualifiedK3Reference: 'Synthetic original Schedule K3 and country detail', foreignCountry: 'Canada', foreignTaxCategory: 'passive' as const,
    interestIncome: '100.00', ordinaryDividends: '40.00', qualifiedDividends: '20.00', foreignSourceIncome: '140.00', foreignTaxPaid: '50.00', beginningBasis: '100.00',
    beginningBasisSourceReference: 'Synthetic opening outside basis worksheet', domesticContinuingNonPtpConfirmed: true,
    portfolioIncomeOnlyConfirmed: true, allOtherK1AmountsZeroConfirmed: true, noOtherBasisChangesConfirmed: true,
    priorBasisSuspensionsZeroConfirmed: true, priorAtRiskSuspensionsZeroConfirmed: true, priorPassiveSuspensionsZeroConfirmed: true, sourceFactsConfirmed: true };
  const facts = { ...annual, taxYear: String(year), creditWithoutForm1116: { ...annual.creditWithoutForm1116, adjustedThroughTaxYear: String(year - 1), carryovers: [], amtCarryovers: [] },
    qualifiedK3Statements: [k3], sources: [...annual.sources, { ...annual.sources[0], sourceId: 'scheduleK1:0', payerName: k3.partnershipName, payerTin: k3.partnershipEIN,
      accountReference: undefined, reportedTaxAmount: k3.foreignTaxPaid, qualifiedPayeeStatement: 'schedule_k3', payments: undefined, sourceReference: k3.qualifiedK3Reference }] } as unknown as ForeignTaxElectionData;
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null });
  state.taxYear = year;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, sourceTaxYear: String(year), allocatedTips: '0', box12CodeTP: '0', box12CodeTT: '0', treasuryTippedOccupationCodes: [], wages: '60000', socialSecurityWages: '60000', socialSecurityWithheld: '3720', medicareWages: '60000', medicareWithheld: '870', federalWithheld: '10000' }] };
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestEntry, ...original.form1099Int[0], sourceTaxYear: String(year), accountHolder: 'primary' }], dividendEntries: [], brokerageEntries: [], ...(year === 2026 ? { qofDispositionFacts: { sourceTaxYear: '2026', sourceReference: 'Synthetic complete investment history with no QOF', sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: false } } : {}) };
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, foreignTaxElection: facts };
  return { state, facts, k3 };
}
