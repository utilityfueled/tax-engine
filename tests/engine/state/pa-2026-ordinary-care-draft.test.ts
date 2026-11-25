import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculatePA2026OrdinaryDraft } from '@/engine/state/pa-ordinary-return.js';
import { calculateScheduleDC } from '@/engine/state/pa-schedule-dc.js';
import { rebindPA2026Draft } from '../../fixtures/pa-2026-ordinary-draft.js';
import { paOrdinaryCareFixture } from '../../fixtures/pa-ordinary-care-sources.js';

type DraftCareFixture = ReturnType<typeof careFixture>;

function bind(f: DraftCareFixture) {
  f.sources.care.careSources.originalDependentCare = structuredClone(f.input.dependentCare);
  rebindPA2026Draft(f);
}

function careFixture(expenses = '1800', wages = '74000', refund = '588') {
  const f = paOrdinaryCareFixture(2026);
  delete f.input.eic;
  f.input.form1099Int = [];
  f.input.paResidencySources.interest = [];
  f.input.deductionElection = 'standard';
  const w2 = f.input.w2s[0];
  Object.assign(w2, {
    wages, socialSecurityWages: wages, socialSecurityWithheld: '4588',
    medicareWages: wages, medicareWithheld: '1073', stateWages: wages, stateTaxWithheld: '2500',
  });
  Object.assign(f.input.paResidencySources.wages[0].payroll[0], {
    grossCompensation: wages, paServicesCompensation: wages, outsidePAServicesCompensation: '0',
  });
  const care = f.input.dependentCare;
  Object.assign(care, { primaryEarnedIncome: wages, expenses });
  care.providers![0].amountPaid = expenses;
  care.qualifyingPersons![0].qualifiedExpenses = expenses;
  f.facts.disposition = {
    kind: 'allocation', sourceReference: 'Fictional actual requested refund',
    refundRequested: refund, nextYearCreditRequested: '0', donations: [],
  };
  const source = f.sources.care.careSources;
  const payment = source.payments[0];
  payment.amount = expenses;
  payment.originalReceipt.amount = expenses;
  const withDraftReview = {
    ...f,
    sources: {
      ...f.sources,
      care: {
        ...f.sources.care,
        careSources: {
          ...source,
          ordinaryDraft2026: {
            sourceReference: 'PRIVATE-HOUSEHOLD-AND-FEDERAL-REVIEW',
            singleNotEligibleForHeadOfHouseholdConfirmed: true as boolean | null,
            standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed: true as boolean | null,
            directFederalDependentEligibilityConfirmed: true as boolean | null,
            unrelatedProviderEligibilityConfirmed: true as boolean | null,
            sameExpensesWillBeClaimedOnFederalReturnConfirmed: true as boolean | null,
          },
          payments: [{
            ...payment,
            payerReview2026: {
              sourceReference: 'PRIVATE-CLAIMANT-PAYMENT-EVIDENCE',
              claimantPaidWithOwnFundsConfirmed: true as boolean | null,
              noThirdPartyPaymentOrReimbursementConfirmed: true as boolean | null,
            },
          }],
        },
      },
    },
  };
  bind(withDraftReview);
  return withDraftReview;
}

// Spec: spec/state/pa-2026-ordinary-draft.yaml#resident-actual-dependent-care
it('PA2026 actual resident care applies the frozen state rate without a federal return', () => {
  const { input, facts, sources } = careFixture();
  const result = calculatePA2026OrdinaryDraft(input, facts, sources);

  expect(result.pa.scheduleDC?.federalCredit.toFixed()).toBe('630');
  expect(result.pa.scheduleDC?.credit.toFixed()).toBe('360');
  expect(result.pa.pa40.otherCredits.toFixed()).toBe('360');
  expect(result.pa.pa40.taxLiability.toFixed()).toBe('2272');
  expect(result.pa.pa40.netOverpayment.toFixed()).toBe('588');
  expect(result.pa.refundDisposition.refund.toFixed()).toBe('588');
  expect(result.dependencyProof.careCredit.toFixed()).toBe('360');
  expect(result.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
  expect(result.pa.scheduleDC?.lines.find(line => line.line === '2026_federal_liability_floor')?.value.toFixed()).toBe('3600');
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
  expect(result.pa.readiness).toMatchObject({ filingEligible: false, formStatus: 'draft_2026_review_only' });
  expect(result).not.toHaveProperty('federal');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE-HOUSEHOLD|PRIVATE-CLAIMANT|900-70-0312|98-7654321/);
});

it('PA2026 actual resident care retains the one-child cap and separate federal phase-down', () => {
  const { input, facts, sources } = careFixture('4000', '75001', '797');
  const result = calculatePA2026OrdinaryDraft(input, facts, sources);
  expect(result.pa.scheduleDC?.federalCredit.toFixed()).toBe('1020');
  expect(result.pa.scheduleDC?.credit.toFixed()).toBe('600');
  expect(result.pa.pa40.netOverpayment.toFixed()).toBe('797');
});

it('PA2026 ordinary care cannot bypass the public Schedule DC federal-limit requirement', () => {
  const input = {
    taxYear: 2026,
    qualifyingPersons: 1,
    paTaxableIncome: new Decimal(74000),
    federalCredit: new Decimal(630),
    source2022Conformity: {
      sourceTaxYear: 2026,
      sourceReference: 'Fictional stand-alone source review',
      sourceFactsConfirmed: true,
      residentIndividualEligibilityConfirmed: true,
      eligibilityUnder2022Section21Confirmed: true,
      currentYearExpensesOnlyConfirmed: true,
      actualEarnedIncomeOnlyConfirmed: true,
      expensesNotClaimedOnAnotherReturnConfirmed: true,
      liabilityEvidence: 'ordinary_single_wage_floor' as const,
      federal: {
        taxYear: 2026, filingStatus: 'single' as const, eligibilityConfirmed: true, earnedIncomeFactsVerified: true,
        careExpenses: new Decimal(1800), qualifyingIndividuals: 1, earnedIncome: new Decimal(74000),
        agi: new Decimal(74000), excludedDependentCareBenefits: new Decimal(0), priorYearExpenseCredit: new Decimal(0),
      },
    },
  };
  expect(() => calculateScheduleDC(input)).toThrow(/liability worksheet/);
});

it('PA2026 actual resident care rejects a record missing the separate provider attestation', () => {
  const f = careFixture();
  Reflect.deleteProperty(f.sources.care.careSources.ordinaryDraft2026, 'unrelatedProviderEligibilityConfirmed');
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/complete actual completion source shape/);
});

it.each([
  ['absent household and federal review', (f: DraftCareFixture) => { Reflect.deleteProperty(f.sources.care.careSources, 'ordinaryDraft2026'); }],
  ['head-of-household source review', (f: DraftCareFixture) => { f.sources.care.careSources.ordinaryDraft2026.singleNotEligibleForHeadOfHouseholdConfirmed = null; }],
  ['other federal tax reductions', (f: DraftCareFixture) => { f.sources.care.careSources.ordinaryDraft2026.standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed = false; }],
  ['child eligibility', (f: DraftCareFixture) => { f.sources.care.careSources.ordinaryDraft2026.directFederalDependentEligibilityConfirmed = null; }],
  ['ineligible provider relationship', (f: DraftCareFixture) => { f.sources.care.careSources.ordinaryDraft2026.unrelatedProviderEligibilityConfirmed = false; }],
  ['same expense federal claim', (f: DraftCareFixture) => { f.sources.care.careSources.ordinaryDraft2026.sameExpensesWillBeClaimedOnFederalReturnConfirmed = false; }],
  ['unverified payer', (f: DraftCareFixture) => { f.sources.care.careSources.payments[0].payerReview2026.claimantPaidWithOwnFundsConfirmed = null; }],
  ['third-party reimbursement', (f: DraftCareFixture) => { f.sources.care.careSources.payments[0].payerReview2026.noThirdPartyPaymentOrReimbursementConfirmed = false; }],
  ['missing payer evidence', (f: DraftCareFixture) => { f.sources.care.careSources.payments[0].payerReview2026.sourceReference = ''; }],
  ['positive prior-year care', (f: DraftCareFixture) => { f.input.dependentCare.priorYearExpenseCredit = '1'; bind(f); }],
  ['invalid claimant birth date', (f: DraftCareFixture) => { f.input.taxpayer.primary.dateOfBirth = '1988-02-31'; bind(f); }],
])('PA2026 actual resident care holds %s', (_, contradict) => {
  const f = careFixture();
  contradict(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/PA actual care sources/);
});
