/** Actual monthly family evidence, independent of policy allocation and income.
 * Spec: spec/federal/marketplace-coverage-family-health.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { d, sum } from '@/utils/decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import { calculateMarketplaceOutsideCashSources, type MarketplaceOutsideCashPayment } from './marketplace-outside-cash-sources.js';

type Person = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
export type MarketplaceCoverageFamilyInput = Pick<TaxYearInput, 'form7206' | 'form1095A' | 'form8962'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & { primary: Person; spouse?: Person; dependents: Person[] };
};
export interface MarketplaceCoverageFamilyMonth {
  month: number; coverageFamilySlcsp: Decimal; nonCoverageFamilySlcsp: Decimal;
  coveragePersonIds: string[]; nonCoveragePersonIds: string[]; outsidePersonIds: string[]; coverageSsns: string[]; nonCoverageSsns: string[];
  sourcePremium: Decimal; sourceAdvance: Decimal; ownCash: Decimal; ownCoverageCash: Decimal; ownNoncoverageCash: Decimal; ownAdvance: Decimal; ownNoncoverageAdvance: Decimal; outsideCash: Decimal; outsideAdvance: Decimal; outsideNetCash: Decimal; outsideCashPayments: MarketplaceOutsideCashPayment[];
}
export interface MarketplaceCoverageFamilyPlan {
  planId: string; policyIndexes: number[]; months: MarketplaceCoverageFamilyMonth[];
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Coverage-family sources require actual ${label}.`);
  return value.trim().replace(/\s+/g, ' ');
}
const name = (value: string | undefined) => text(value, 'person name').toLowerCase();
function ssn(value: string | undefined): string {
  const normalized = text(value, 'complete person identifier').replaceAll('-', '');
  if (!/^\d{9}$/.test(normalized)) throw new Error('Coverage-family source requires the actual complete person identifier.');
  return normalized;
}
function amount(value: string | undefined | null): Decimal {
  if (value == null || !/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Coverage-family source amount or advance is unknown or invalid.');
  return d(value);
}
function month(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 12) throw new Error('Coverage-family source requires an actual month1 through12.');
  return value;
}
function paymentDate(value: string | undefined, year: number): void {
  const actual = text(value, 'payment date'), parsed = new Date(`${actual}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== actual || !actual.startsWith(`${year}-`)) throw new Error('Coverage-family receipt requires an actual current-year calendar payment date.');
}
type Original = NonNullable<NonNullable<NonNullable<TaxYearInput['form7206']>['plans']>[number]['coverageFamilySources']>['policies'];
function original(value: NonNullable<Original>[number]['original'], year: number) {
  if (!value || value.taxYear !== year || !value.coveredIndividuals?.length || !value.monthlyPremiums?.length) throw new Error('Coverage-family original policy sources are incomplete or have a conflicting year.');
  const people = value.coveredIndividuals.map(row => ({ name: name(row.name), ssn: ssn(row.ssn), firstMonth: month(row.firstMonth), lastMonth: month(row.lastMonth) })).sort((a,b) => a.ssn.localeCompare(b.ssn));
  const months = value.monthlyPremiums.map(row => ({ month: month(row.month), enrolleePremium: amount(row.enrolleePremium).toFixed(),
    slcsp: row.slcsp === null ? null : amount(row.slcsp).toFixed(), advancePremiumTaxCredit: amount(row.advancePremiumTaxCredit).toFixed() })).sort((a,b) => a.month - b.month);
  if (new Set(people.map(row => row.ssn)).size !== people.length || new Set(months.map(row => row.month)).size !== months.length
    || people.some(row => row.firstMonth > row.lastMonth)) throw new Error('Coverage-family original policy has duplicated or contradictory people or months.');
  for (const person of people) for (let m = person.firstMonth; m <= person.lastMonth; m++) if (!months.some(row => row.month === m)) throw new Error('Coverage-family original policy omits a covered month.');
  return { taxYear: year, marketplace: text(value.marketplace, 'Marketplace'), policyNumber: text(value.policyNumber, 'policy number'),
    recipientName: name(value.recipientName), recipientSsn: ssn(value.recipientSsn), coveredIndividuals: people, monthlyPremiums: months };
}
/** A completed other return is source evidence, not a current-return credit override.
 * Zero advances alone cannot establish zero final credit: sections280C(g),36B
 * and Reg1.36B-3(c)(3) also cover premiums paid by another person. */
type HealthPlan = NonNullable<NonNullable<TaxYearInput['form7206']>['plans']>[number];
function validateOutsideReturn(input: MarketplaceCoverageFamilyInput, plan: HealthPlan,
  personId: string, identity: string): MarketplaceOutsideCashPayment[] | undefined {
  const packet = plan.coverageFamilySources!;
  const records = packet.outsidePersonReturns?.filter(row => row.personId?.trim() === personId);
  if (records?.length !== 1) throw new Error('Outside child return sources require one actual completed other-return Form8962 record.');
  const row = records[0];
  if (row.sourceTaxYear !== input.taxpayer.taxYear || row.returnStatus !== 'completed' || row.allPoliciesIncludedConfirmed !== true
    || !row.sourceReference?.trim() || !row.claimantName?.trim() || !row.claimantSsn?.trim()) throw new Error('Outside child return requires actual completed year, claimant, reference and complete policy sources.');
  if (row.form8962Line24 === undefined || !/^\d+(?:\.\d+)?$/.test(row.form8962Line24) || !d(row.form8962Line24).isFinite()
    ) throw new Error('Outside child return credit requires the actual completed nonnegative Form8962 line24; unknown credit is not zero.');
  const expected = packet.policies!.filter(policy => policy.original!.coveredIndividuals!.some(person => ssn(person.ssn) === identity)).map(policy => policy.sourceId!).sort();
  const actual = row.policySourceIds?.map(value => value.trim()).sort();
  if (!actual || new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Outside child return policy links must include every actual original policy for that covered person.');
  for (const id of expected) {
    const source = input.form8962?.sharedPolicyAllocations?.policies?.find(policy => policy.sourceId === id);
    if (!source?.otherTaxpayerSsn || !source.otherTaxpayerName || ssn(source.otherTaxpayerSsn) !== ssn(row.claimantSsn)
      || name(source.otherTaxpayerName) !== name(row.claimantName)
      || source.coveredFamilyAssignments?.find(member => ssn(member.ssn) === identity)?.family !== 'other_return') throw new Error('Outside child return claimant and covered person must match the actual original shared-policy sources.');
  }
  return calculateMarketplaceOutsideCashSources(plan, personId, row, input.taxpayer.taxYear);
}
function sameMembers(actual: string[] | undefined, expected: string[], label: string) {
  if (!actual) throw new Error(`Coverage-family ${label} member sources are unknown.`);
  const normalized = actual.map(ssn).sort();
  if (new Set(normalized).size !== normalized.length || JSON.stringify(normalized) !== JSON.stringify([...expected].sort())) throw new Error(`Coverage-family ${label} member source identities contradict actual monthly coverage.`);
}

/** Validate facts before calculating any statutory allocation. The original
 * receipts, identifiers and independent advances are never replaced by a ratio. */
export function calculateMarketplaceCoverageFamilySources(input: MarketplaceCoverageFamilyInput): MarketplaceCoverageFamilyPlan[] | undefined {
  const plans = input.form7206?.plans?.filter(plan => plan.coverageFamilySources !== undefined) ?? [];
  if (!plans.length) return undefined;
  const year = input.taxpayer.taxYear, people = input.form7206?.persons ?? [];
  const household = new Map<string, { role: 'primary' | 'spouse' | 'other'; name: string }>();
  for (const [person, role] of [[input.taxpayer.primary, 'primary'], [input.taxpayer.spouse, 'spouse'], ...input.taxpayer.dependents.map(person => [person, 'other'] as const)] as const) {
    if (!person) continue;
    const id = ssn(person.ssn);
    if (household.has(id)) throw new Error('Coverage-family household source identities are duplicated.');
    household.set(id, { role, name: name(`${person.firstName} ${person.lastName}`) });
  }
  const usedPolicies = new Set<string>(), usedPlans = new Set<string>();
  const result = plans.map(plan => {
    const packet = plan.coverageFamilySources!, planId = text(plan.planId, 'health plan identity');
    if (usedPlans.has(planId) || plan.marketplaceCoverage !== true || plan.premiumTaxCreditInvolved !== true || plan.kind !== 'medical') throw new Error('Coverage-family source requires its unique actual Marketplace medical plan.');
    usedPlans.add(planId);
    if (packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allPolicySourcesIncluded !== true) throw new Error('Confirm the actual coverage-family source year and complete original policies after every edit.');
    text(packet.sourceReference, 'coverage-family worksheet reference');
    if (!plan.marketplacePolicySourceIds?.length || packet.policies?.length !== plan.marketplacePolicySourceIds.length) throw new Error('Coverage-family source needs every actual linked original policy once.');
    const originalPeople = new Map<string, { name: string; months: Set<number> }>(), sourceMonths = new Map<number, { premium: Decimal; advance: Decimal }>();
    const policyIndexes: number[] = [];
    for (const source of packet.policies) {
      const id = text(source.sourceId, 'original policy index');
      if (!/^form1095A:(0|[1-9]\d*)$/.test(id) || usedPolicies.has(id) || !plan.marketplacePolicySourceIds.includes(id)) throw new Error('Coverage-family original policy index is duplicated or does not match its actual source.');
      const index = Number(id.slice('form1095A:'.length)), raw = input.form1095A[index];
      if (!raw || raw.sourceFactsComplete !== true) throw new Error('Coverage-family source requires the actual completed original policy.');
      const actual = original(raw, year), captured = original(source.original, year);
      if (JSON.stringify(actual) !== JSON.stringify(captured)) throw new Error('Coverage-family captured original policy is stale or contradictory.');
      usedPolicies.add(id); policyIndexes.push(index);
      for (const person of actual.coveredIndividuals) {
        const prior = originalPeople.get(person.ssn) ?? { name: person.name, months: new Set<number>() };
        if (prior.name !== person.name || (household.has(person.ssn) && household.get(person.ssn)!.name !== person.name)) throw new Error('Coverage-family original and household person names conflict.');
        for (let m = person.firstMonth; m <= person.lastMonth; m++) prior.months.add(m);
        originalPeople.set(person.ssn, prior);
      }
      for (const row of actual.monthlyPremiums) {
        const total = sourceMonths.get(row.month) ?? { premium: d(0), advance: d(0) };
        total.premium = total.premium.plus(row.enrolleePremium); total.advance = total.advance.plus(row.advancePremiumTaxCredit); sourceMonths.set(row.month, total);
      }
    }
    if (packet.persons?.length !== originalPeople.size || plan.coveredPersons?.length !== originalPeople.size) throw new Error('Coverage-family source must link every original person exactly once.');
    const linked = new Map<string, { ssn: string; own: boolean; eligibleOutsideChild: boolean; months: Set<number> }>(), seenIdentities = new Set<string>();
    for (const link of packet.persons) {
      const id = text(link.personId, 'health person ID'), identity = ssn(link.coveredIndividualSsn), originalPerson = originalPeople.get(identity);
      const persons = people.filter(row => row.personId === id), covered = plan.coveredPersons.filter(row => row.personId === id), actual = household.get(identity);
      if (!originalPerson || linked.has(id) || seenIdentities.has(identity) || persons.length !== 1 || covered.length !== 1 || name(persons[0].name) !== originalPerson.name) throw new Error('Coverage-family person link is absent, duplicated or conflicts with the original source.');
      if (actual) {
        const relationship = actual.role === plan.accountHolder ? 'self' : actual.role === 'other' ? 'dependent' : 'spouse';
        if (persons[0].householdRole !== actual.role || covered[0].relationshipToOwner !== relationship || (relationship === 'dependent' && covered[0].dependencyEligibilityConfirmed !== true)) throw new Error('Coverage-family member must match the actual household, dependency and plan-owner sources.');
      } else if (persons[0].householdRole !== 'other' || !['other', 'child_under_27'].includes(covered[0].relationshipToOwner ?? '')) throw new Error('Coverage-family outside-tax-family dependent eligibility needs its distinct actual method.');
      const outsideChild = !actual && covered[0].relationshipToOwner === 'child_under_27';
      const age = persons[0].attainedAgeAtYearEnd;
      if (outsideChild && (age === undefined || !Number.isInteger(age) || age < 0 || age > 120)) throw new Error('Outside child health sources require actual attained age at year end.');
      linked.set(id, { ssn: identity, own: Boolean(actual), eligibleOutsideChild: outsideChild && age! < 27, months: originalPerson.months }); seenIdentities.add(identity);
    }
    if (packet.months?.length !== sourceMonths.size) throw new Error('Coverage-family source needs actual evidence for every original policy month.');
    const outsideReturnIds = packet.outsidePersonReturns?.map(row => text(row.personId, 'outside return person ID')) ?? [];
    if (new Set(outsideReturnIds).size !== outsideReturnIds.length || outsideReturnIds.some(id => !linked.has(id) || linked.get(id)!.own)) throw new Error('Outside child return person sources are duplicated or not an original outside person.');
    const validatedOutsideReturns = new Map<string, MarketplaceOutsideCashPayment[] | undefined>();
    const seenMonths = new Set<number>();
    const months = packet.months.map(row => {
      const m = month(row.month), originalMonth = sourceMonths.get(m);
      if (!originalMonth || seenMonths.has(m) || row.allCoveredPersonsIncludedConfirmed !== true) throw new Error('Coverage-family actual monthly source is duplicated or incomplete.');
      seenMonths.add(m); text(row.sourceReference, 'monthly eligibility reference');
      const ownPeople = [...linked].filter(([, person]) => person.own && person.months.has(m));
      const outsidePersonIds = [...linked].filter(([, person]) => !person.own && person.months.has(m)).map(([id]) => id);
      if (row.personFacts?.length !== ownPeople.length) throw new Error('Coverage-family month requires every actual tax-family person eligibility source.');
      const coveragePersonIds: string[] = [], nonCoveragePersonIds: string[] = [], seen = new Set<string>();
      for (const fact of row.personFacts) {
        const id = text(fact.personId, 'monthly person ID');
        text(fact.sourceReference, 'person eligibility reference');
        if (seen.has(id) || !ownPeople.some(([actual]) => actual === id) || typeof fact.fullCoverageMonthConfirmed !== 'boolean' || typeof fact.otherMecEligible !== 'boolean') throw new Error('Coverage-family actual person/month source is missing, duplicated or unknown.');
        seen.add(id);
        (fact.fullCoverageMonthConfirmed && !fact.otherMecEligible ? coveragePersonIds : nonCoveragePersonIds).push(id);
      }
      const coverageSsns = coveragePersonIds.map(id => linked.get(id)!.ssn), nonCoverageSsns = nonCoveragePersonIds.map(id => linked.get(id)!.ssn);
      const employer = plan.months?.find(row => row.month === m);
      if (employer?.employerCoverageEnrolled === true && coveragePersonIds.some(id => people.find(person => person.personId === id)?.householdRole === plan.accountHolder)) throw new Error('Coverage-family actual owner employer enrollment contradicts that person\'s monthly MEC source.');
      sameMembers(row.nonCoverageFamilyMemberSsns, nonCoverageSsns, 'noncoverage');
      if (row.allCoverageFamilyMembersIncludedConfirmed !== true || row.allNonCoverageFamilyMembersIncludedConfirmed !== true) throw new Error('Coverage-family benchmarks require complete actual member confirmations.');
      text(row.coverageFamilySourceReference, 'coverage-family benchmark reference'); text(row.nonCoverageFamilySourceReference, 'noncoverage-family benchmark reference');
      const coverageFamilySlcsp = amount(row.coverageFamilySlcsp), nonCoverageFamilySlcsp = amount(row.nonCoverageFamilySlcsp);
      if (nonCoverageSsns.length ? nonCoverageFamilySlcsp.lte(0) : !nonCoverageFamilySlcsp.isZero()) throw new Error('Coverage-family actual benchmark amount conflicts with its empty or nonempty person group.');
      const receipts = plan.payments?.filter(payment => payment.coverageMonth === m);
      if (!receipts?.length) throw new Error('Coverage-family source needs actual monthly premium receipts.');
      let fullPremium = d(0), fullAdvance = d(0), ownCash = d(0), ownCoverageCash = d(0), ownNoncoverageCash = d(0), ownAdvance = d(0), ownNoncoverageAdvance = d(0), outsideCash = d(0), outsideAdvance = d(0), outsideNetCash = d(0);
      const outsideCashPayments: MarketplaceOutsideCashPayment[] = [];
      const paidPeople = new Set<string>();
      for (const receipt of receipts) {
        if (receipt.coverageTaxYear !== year || !receipt.personAmounts) throw new Error('Coverage-family payment source year or person allocations are incomplete.');
        paymentDate(receipt.datePaid, year);
        const gross = amount(receipt.grossPremium), advance = amount(receipt.advancePremiumTaxCredit), cash = amount(receipt.ownerOrBusinessPaid), others = amount(receipt.otherPersonPaid);
        if (!gross.eq(advance.plus(cash).plus(others))) throw new Error('Coverage-family full payment shares do not conserve the actual receipt.');
        fullPremium = fullPremium.plus(gross); fullAdvance = fullAdvance.plus(advance);
        let personCash = d(0), personAdvance = d(0);
        const paymentPeople = new Set<string>();
        for (const allocation of receipt.personAmounts) {
          const id = text(allocation.personId, 'paid person ID'), person = linked.get(id), paid = amount(allocation.amountPaid), credit = amount(allocation.advancePremiumTaxCredit);
          const payer = `${id}:${allocation.payer}`;
          if (!person || paymentPeople.has(payer) || !['owner_after_tax', 'business_paid_or_reimbursed'].includes(allocation.payer ?? '') || (!person.months.has(m) && (!paid.isZero() || !credit.isZero()))) throw new Error('Coverage-family paid person or payer source contradicts actual monthly coverage.');
          paymentPeople.add(payer); paidPeople.add(id);
          if (!amount(allocation.excludedPublicSafetyOfficerAmount).isZero() || !amount(allocation.otherTaxFreeFunding).isZero()) throw new Error('Coverage-family separate tax-free premium funding needs its actual method.');
          if (!person.own) {
            // The other taxpayer's credit is not this owner's credit. The
            // complete source trace admits only actual net insurer cash.
            const suppliedCash = packet.outsidePersonReturns?.find(row => row.personId?.trim() === id)?.cashPaymentSources !== undefined;
            if (person.eligibleOutsideChild && (paid.gt(0) || credit.gt(0) || suppliedCash) && !validatedOutsideReturns.has(id)) {
              validatedOutsideReturns.set(id, validateOutsideReturn(input, plan, id, person.ssn));
            }
            const traced = validatedOutsideReturns.get(id)?.find(row => row.paymentSourceId === receipt.sourceId?.trim() && row.payer === allocation.payer);
            if (traced) outsideCashPayments.push(traced);
            outsideCash = outsideCash.plus(paid); outsideAdvance = outsideAdvance.plus(credit);
            outsideNetCash = sumSourceMoney(outsideNetCash, traced?.netCash ?? paid);
          }
          // Positive advances are actual facts. Their deduction method is checked
          // separately, after preserving exact person and original-policy sources.
          if (person.own && nonCoveragePersonIds.includes(id)) ownNoncoverageAdvance = ownNoncoverageAdvance.plus(credit);
          personCash = personCash.plus(paid); personAdvance = personAdvance.plus(credit);
          if (person.own) {
            ownCash = ownCash.plus(paid); ownAdvance = ownAdvance.plus(credit);
            if (coveragePersonIds.includes(id)) ownCoverageCash = ownCoverageCash.plus(paid);
            else ownNoncoverageCash = ownNoncoverageCash.plus(paid);
          }
        }
        if (!personCash.eq(cash) || !personAdvance.eq(advance)) throw new Error('Coverage-family actual person payments and advances do not reconcile their original receipt.');
      }
      if (!fullPremium.eq(originalMonth.premium) || !fullAdvance.eq(originalMonth.advance) || [...linked].some(([id, person]) => person.months.has(m) && !paidPeople.has(id))) throw new Error('Coverage-family original premium/advance source or complete monthly people do not reconcile.');
      return { month: m, coverageFamilySlcsp, nonCoverageFamilySlcsp, coveragePersonIds, nonCoveragePersonIds, outsidePersonIds, coverageSsns, nonCoverageSsns,
        sourcePremium: fullPremium, sourceAdvance: fullAdvance, ownCash, ownCoverageCash, ownNoncoverageCash, ownAdvance, ownNoncoverageAdvance, outsideCash, outsideAdvance, outsideNetCash, outsideCashPayments };
    }).sort((a,b) => a.month - b.month);
    const allOwnCovered = months.every(row => row.nonCoveragePersonIds.length === 0), outside = [...linked.values()].some(person => !person.own);
    if (plan.allCoveredPersonsInCoverageFamilyConfirmed !== (allOwnCovered && !outside)) throw new Error('Coverage-family plan answer contradicts actual original and monthly member sources.');
    if (plan.sharedMarketplaceSources && plan.sharedMarketplaceSources.allThisReturnPersonsInCoverageFamilyConfirmed !== allOwnCovered) throw new Error('Coverage-family shared health answer contradicts actual this-return monthly membership.');
    if (sum(...months.map(row => row.coverageFamilySlcsp.plus(row.nonCoverageFamilySlcsp))).lte(0)) throw new Error('Coverage-family sources require actual enrolled tax-family premium groups.');
    return { planId, policyIndexes: policyIndexes.sort((a,b) => a-b), months };
  });
  const eligibility = new Map<number, Map<string, boolean>>();
  function retain(m: number, identity: string, eligible: boolean) {
    const members = eligibility.get(m) ?? new Map<string, boolean>();
    if (members.has(identity) && members.get(identity) !== eligible) throw new Error('Coverage-family monthly eligibility contradicts another actual policy for the same person.');
    members.set(identity, eligible); eligibility.set(m, members);
  }
  for (const plan of result) for (const row of plan.months) {
    row.coverageSsns.forEach(identity => retain(row.month, identity, true));
    row.nonCoverageSsns.forEach(identity => retain(row.month, identity, false));
  }
  // A separately linked, fully covered plan already supplies its affirmative
  // coverage-family fact. Other originals cannot silently supply eligibility.
  for (const plan of input.form7206?.plans ?? []) {
    if (plan.coverageFamilySources || plan.marketplaceCoverage !== true || plan.premiumTaxCreditInvolved !== true) continue;
    const complete = plan.allCoveredPersonsInCoverageFamilyConfirmed === true
      || (plan.sharedMarketplaceSources?.sourceFactsConfirmed === true && plan.sharedMarketplaceSources.allThisReturnPersonsInCoverageFamilyConfirmed === true);
    if (!complete) continue;
    for (const id of plan.marketplacePolicySourceIds ?? []) {
      if (!/^form1095A:(0|[1-9]\d*)$/.test(id)) throw new Error('Coverage-family complete benchmark requires canonical original policy links.');
      const raw = input.form1095A[Number(id.slice('form1095A:'.length))];
      if (!raw || raw.sourceFactsComplete !== true) throw new Error('Coverage-family complete benchmark requires actual original policies.');
      for (const person of original(raw, year).coveredIndividuals) if (household.has(person.ssn)) {
        for (let m = person.firstMonth; m <= person.lastMonth; m++) retain(m, person.ssn, true);
      }
    }
  }
  for (const raw of input.form1095A) for (const person of original(raw, year).coveredIndividuals) if (household.has(person.ssn)) {
    for (let m = person.firstMonth; m <= person.lastMonth; m++) if (!eligibility.get(m)?.has(person.ssn)) throw new Error('Coverage-family benchmark is missing actual eligibility evidence for another original policy member.');
  }
  const benchmarks = new Map<number, Decimal>();
  for (const plan of result) for (const row of plan.months) {
    const expected = [...eligibility.get(row.month)!.entries()].filter(([, eligible]) => eligible).map(([identity]) => identity);
    const source = plans.find(actual => actual.planId === plan.planId)!.coverageFamilySources!.months!.find(actual => actual.month === row.month)!;
    sameMembers(source.coverageFamilyMemberSsns, expected, 'complete coverage');
    if (expected.length ? row.coverageFamilySlcsp.lte(0) : !row.coverageFamilySlcsp.isZero()) throw new Error('Coverage-family actual benchmark conflicts with the complete empty or nonempty family.');
    const prior = benchmarks.get(row.month);
    if (prior && !prior.eq(row.coverageFamilySlcsp)) throw new Error('Coverage-family benchmark sources conflict across actual plans for the same complete family.');
    benchmarks.set(row.month, row.coverageFamilySlcsp);
  }
  return result;
}
