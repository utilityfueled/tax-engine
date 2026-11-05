/** Explicit fictional originals, reusing the existing canonical source factory. */
import { canonicalOhioBusinessFixture, type OhioBusinessStatus } from './oh-canonical-business-sources.js';
export function ohio2026BusinessDraftFixture(profit = '1000000', status: OhioBusinessStatus = 'nonresident') {
  const p = canonicalOhioBusinessFixture(2026, profit, status);
  // Explicit fictional completed ledger, not a schema default or production inference.
  if (!p.input.scheduleC) throw new Error('Fictional C missing');
  p.input.scheduleC.expenses = {
    advertising: '0', amortization: '0', badDebts: '0', bankCharges: '0', carAndTruck: '0', commissionsAndFees: '0',
    contractLabor: '0', depletion: '0', depreciation: '0', duesAndPublications: '0', employeeBenefitPrograms: '0',
    businessInterest: '0', freight: '0', idcsAmortization: '0', idcsCurrentExpensing: '0', section179Expense: '0',
    insurance: '0', laundryAndCleaning: '0', legalAndProfessional: '0', managementFees: '0', officeExpense: '0',
    pensionAndProfitSharing: '0', postage: '0', rentOnBusinessProperty: '0', repairsAndMaintenance: '0',
    startupCostsDirectExpense: '0', supplies: '0', taxes: '0', telephone: '0', travel: '0', meals: '0', utilities: '0', wages: '0', otherExpenses: '0',
  };
  p.facts.originalFederalSources = structuredClone(p.input);
  const business = p.facts.businessSources.facts.businesses[0];
  if (!business) throw new Error('Fictional original business missing');
  business.originalBusiness = structuredClone(p.input.scheduleC) as typeof business.originalBusiness;
  return { input: p.input, sources: {
    methodId: 'oh-2026-canonical-business-draft-v1' as const, taxYear: 2026 as const,
    sourceReference: 'Fictional completed current Ohio adjustment and credit source review', sourceFactsConfirmed: true as const,
    originalFederalSources: structuredClone(p.input), residencyFacts: p.facts,
    noOtherOhioIncomeAdjustmentsConfirmed: true as const, noQualifyingCapitalGainsOrPayrollDeductionConfirmed: true as const,
    noOtherOhioCreditSourcesConfirmed: true as const, noQualifyingEitcChildrenConfirmed: true as const,
  } };
}

/** Refresh fictional originals after deliberate source edits; never used by production. */
export function rebindOhio2026BusinessDraft(p: ReturnType<typeof ohio2026BusinessDraftFixture>) {
  const { ohioResidency: _residency, ...originals } = p.input;
  p.sources.originalFederalSources = structuredClone(originals);
  p.sources.residencyFacts.originalFederalSources = structuredClone(originals);
  const b = p.sources.residencyFacts.businessSources.facts.businesses[0];
  if (b && p.input.scheduleC) b.originalBusiness = structuredClone(p.input.scheduleC) as typeof b.originalBusiness;
}
