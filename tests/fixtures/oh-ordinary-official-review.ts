/** Independently supplied FICTIONAL actual originals; not user or agency evidence. */
import type { OhioPaymentFacts } from '@/models/ohio-payments.js';
import type { W2StateLocalSources } from '@/models/w2-state-local.js';
import { ohioPaymentFixture } from './oh-payments.js';

export function ohioOrdinaryOfficialReviewFixture() {
  const base = ohioPaymentFixture('nonresident');
  base.taxpayer.address = { street: '611 FICTIONAL VIRGINIA LANE', city: 'RICHMOND', state: 'VA', zip: '23219' };
  const w2 = base.w2s[0];
  if (!w2) throw new Error('Fictional paper fixture requires actual W2 original');
  Object.assign(w2, { employer: { name: 'FICTIONAL-PAPER-PRIVATE-EMPLOYER', ein: '90-7000612' },
    federalWithheld: '10000', socialSecurityWithheld: '6200', medicareWithheld: '1450',
    state: 'VA', stateWages: '100000', stateTaxWithheld: '0',
    socialSecurityTips: '0', allocatedTips: '0', box10DependentCareBenefits: '0',
    box12CodeW: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0', box12CodeH: '0', box12CodeS: '0',
    box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0', localWages: '0', localTaxWithheld: '0', localityName: '' });
  const person = base.taxpayer.primary;
  const actual: W2StateLocalSources = {
    sourceTaxYear: 2025, sourceReference: 'PRIVATE-FICTIONAL-PAPER-ALL-W2-ORIGINALS', sourceFactsConfirmed: true,
    owner: { accountHolder: 'primary', originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn } },
    originalW2: structuredClone(w2), currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
    stateReporting: 'multiple', localReporting: 'none', legacyScalarProjection: 'first_entered_rows',
    stateRows: [
      { printedRow: 1, sourceReference: 'PRIVATE-FICTIONAL-PAPER-VA-ROW', state: 'VA', employerStateIDStatus: 'reported', employerStateID: 'PRIVATE-VA-ORIGINAL-ID', wages: '100000', withheld: '0' },
      { printedRow: 2, sourceReference: 'PRIVATE-FICTIONAL-PAPER-OH-ROW', state: 'OH', employerStateIDStatus: 'reported', employerStateID: 'PRIVATE-OH-ORIGINAL-ID', wages: '20000', withheld: '1000' },
    ], localRows: [],
  };
  w2.stateLocalSources = actual;
  const payments: OhioPaymentFacts = { ...base.ohioPayments,
    sourceReference: 'PRIVATE-FICTIONAL-COMPLETE-PAPER-ACCOUNT',
    remainingTaxPayment: { status: 'no_remaining_tax', sourceReference: 'PRIVATE-FICTIONAL-ACTUAL-ACCOUNT-NO-BALANCE', sourceFactsConfirmed: true },
  };
  const input = { ...base, ohioPayments: payments };
  const { ohioResidency: _r, ohioPayments: _p, ...original } = input;
  input.ohioResidency.originalFederalSources = structuredClone(original);
  input.ohioPayments.originalFederalSources = structuredClone(original);
  return input;
}
