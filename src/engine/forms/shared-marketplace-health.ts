/** Pub974 policy allocation precedes actual coverage-family/payment attribution.
 * Specs: spec/federal/shared-marketplace-health.yaml and
 * spec/federal/shared-owner-marketplace-health.yaml. No source values are replaced. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { calculateForm8962SharedPolicy, type Form8962AllocationInput } from './form-8962-shared-policy.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { d } from '@/utils/decimal.js';

export type SharedMarketplaceHealthInput = Form8962AllocationInput & Pick<TaxYearInput, 'form7206'>;
export interface SharedMarketplaceHealthPlan {
  months: Map<number, { premium: Decimal; advance: Decimal }>;
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Shared Marketplace health sources require actual ${label}.`);
  return value.trim();
}
function name(value: string | undefined): string { return text(value, 'person name').replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
function ssn(value: string | undefined): string {
  const actual = text(value, 'covered person identity').replaceAll('-', '');
  if (!/^\d{9}$/.test(actual)) throw new Error('Shared Marketplace health person identity must match the complete original source.');
  return actual;
}
function amount(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Shared Marketplace health payment source amount is unknown or invalid.');
  return d(value);
}

/** Facts-only binder, also used by the guide without an assumed income or credit.
 * Returned amounts are independently derived policy allocations, not entered
 * payment percentages. Full gross, other-person cash and advances stay original. */
export function calculateSharedMarketplaceHealthSources(input: SharedMarketplaceHealthInput): Map<string, SharedMarketplaceHealthPlan> | undefined {
  const plans = input.form7206?.plans?.filter(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true) ?? [];
  if (input.form8962?.allocationRequired !== true) {
    if (plans.some(plan => plan.sharedMarketplaceSources !== undefined)) throw new Error('Shared Marketplace health sources conflict with the actual policy allocation answer.');
    return undefined;
  }
  if (!plans.length || input.form8962.selfEmployedHealthInsuranceCoordinationRequired !== true || input.form8962.coverageFactsConfirmed !== true) throw new Error('Shared Marketplace health requires actual completed coverage and payment sources.');
  const families = calculateMarketplaceCoverageFamilySources(input);
  const allocated = calculateForm8962SharedPolicy(input);
  const result = new Map<string, SharedMarketplaceHealthPlan>(), usedPolicies = new Set<string>();
  const primary = ssn(input.taxpayer.primary.ssn), spouse = input.taxpayer.spouse ? ssn(input.taxpayer.spouse.ssn) : undefined;
  const dependents = new Set(input.taxpayer.dependents.map(person => ssn(person.ssn)));
  for (const plan of plans) {
    const planId = text(plan.planId, 'plan identity'), evidence = plan.sharedMarketplaceSources;
    const family = families?.find(row => row.planId === planId);
    if (result.has(planId)) throw new Error('Shared Marketplace health plan source identity is duplicated.');
    if (!evidence || evidence.sourceTaxYear !== input.taxpayer.taxYear || evidence.sourceFactsConfirmed !== true
      || evidence.allCoveredPersonsLinkedConfirmed !== true || (evidence.allThisReturnPersonsInCoverageFamilyConfirmed !== true && !family)) throw new Error('Shared Marketplace health requires confirmed actual source year and complete covered-person links.');
    text(evidence.sourceReference, 'policy/payment link reference');
    if (!plan.marketplacePolicySourceIds?.length || !plan.coveredPersons?.length || !evidence.persons?.length) throw new Error('Shared Marketplace health requires complete actual policy and person links.');
    const originals = new Map<string, { name: string; own: boolean; months: Set<number> }>();
    const months = new Map<number, { premium: Decimal; advance: Decimal }>();
    const fullMonths = new Map<number, { premium: Decimal; advance: Decimal }>();
    for (const id of plan.marketplacePolicySourceIds) {
      if (!/^form1095A:(0|[1-9]\d*)$/.test(id) || usedPolicies.has(id)) throw new Error('Shared Marketplace health original policy source link is invalid or duplicated.');
      usedPolicies.add(id);
      const index = Number(id.slice('form1095A:'.length)), policy = input.form8962.sharedPolicyAllocations?.policies?.find(row => row.sourceId === id);
      const original = input.form1095A[index];
      // The source allocator above independently validates either the actual
      // Situation4 agreement/default, Situation3 benchmark or actual unshared source.
      // Its derived amounts never establish the payment facts checked below.
      if (!original || !policy || !['other_two_tax_families', 'no_advance_credit', 'not_shared'].includes(policy.situation ?? '')) throw new Error('Shared Marketplace health requires its actual supported two-family allocation source method.');
      for (const person of original.coveredIndividuals ?? []) {
        // Unshared membership is established by the source allocator's complete
        // original/household validation, never by an entered payment share.
        const identity = ssn(person.ssn), own = policy.situation === 'not_shared'
          || policy.coveredFamilyAssignments?.find(row => ssn(row.ssn) === identity)?.family === 'this_return';
        const current = originals.get(identity) ?? { name: name(person.name), own, months: new Set<number>() };
        if (current.name !== name(person.name) || current.own !== own) throw new Error('Shared Marketplace health original person family or name differs across linked policies.');
        for (let month = person.firstMonth!; month <= person.lastMonth!; month++) current.months.add(month);
        originals.set(identity, current);
      }
      for (const source of allocated.months.filter(row => row.policyIndex === index)) {
        const own = months.get(source.month) ?? { premium: d(0), advance: d(0) };
        own.premium = own.premium.plus(source.premium); own.advance = own.advance.plus(source.advance); months.set(source.month, own);
        const full = fullMonths.get(source.month) ?? { premium: d(0), advance: d(0) };
        full.premium = full.premium.plus(source.originalPremium); full.advance = full.advance.plus(source.originalAdvance); fullMonths.set(source.month, full);
      }
    }
    // A separate plan can cover only this return's family while another plan
    // is shared. Its complete original/person/payment evidence is still required;
    // the family checkbox cannot substitute for those independent sources.
    const includesOutsideFamily = [...originals.values()].some(person => !person.own);
    if (plan.allCoveredPersonsInCoverageFamilyConfirmed !== (!includesOutsideFamily && !(family?.months.some(row => row.nonCoveragePersonIds.length)))) throw new Error('Shared Marketplace health coverage-family answer conflicts with the actual linked policy people.');
    const linked = new Map<string, { own: boolean; months: Set<number> }>(), identities = new Set<string>();
    if (evidence.persons.length !== originals.size || plan.coveredPersons.length !== originals.size) throw new Error('Shared Marketplace health source links must include every original covered person once.');
    for (const link of evidence.persons) {
      const id = text(link.personId, 'health person ID'), identity = ssn(link.coveredIndividualSsn);
      const original = originals.get(identity), persons = input.form7206?.persons?.filter(person => person.personId === id);
      const covered = plan.coveredPersons.filter(person => person.personId === id);
      if (!original || identities.has(identity) || linked.has(id) || persons?.length !== 1 || covered.length !== 1 || name(persons[0].name) !== original.name) throw new Error('Shared Marketplace health person source identity is missing, duplicated or contradictory.');
      identities.add(identity);
      const person = persons[0], relationship = covered[0].relationshipToOwner;
      if (!original.own) {
        if (person.householdRole !== 'other' || relationship !== 'other') throw new Error('Shared Marketplace health outside-family eligible persons require their separate actual coverage method.');
      } else {
        const role = identity === primary ? 'primary' : identity === spouse ? 'spouse' : dependents.has(identity) ? 'other' : undefined;
        const expectedRelationship = role === plan.accountHolder ? 'self' : role === 'primary' || role === 'spouse' ? 'spouse' : 'dependent';
        if (!role || person.householdRole !== role || relationship !== expectedRelationship || (relationship === 'dependent' && covered[0].dependencyEligibilityConfirmed !== true)) throw new Error('Shared Marketplace health person relationship must match its actual return family and business owner.');
      }
      linked.set(id, { own: original.own, months: original.months });
    }
    const paidMonths = new Map<number, { gross: Decimal; advance: Decimal; ownPaid: Decimal; ownAdvance: Decimal; people: Set<string> }>();
    for (const payment of plan.payments ?? []) {
      const month = payment.coverageMonth;
      if (month === undefined || !months.has(month) || payment.coverageTaxYear !== input.taxpayer.taxYear || !payment.datePaid?.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error('Shared Marketplace health payment source year or covered month does not reconcile.');
      const gross = amount(payment.grossPremium), advance = amount(payment.advancePremiumTaxCredit), owner = amount(payment.ownerOrBusinessPaid), other = amount(payment.otherPersonPaid);
      if (!owner.plus(other).plus(advance).eq(gross) || !payment.personAmounts?.length) throw new Error('Shared Marketplace health full paid source does not reconcile.');
      const paid = paidMonths.get(month) ?? { gross: d(0), advance: d(0), ownPaid: d(0), ownAdvance: d(0), people: new Set<string>() };
      let personPaid = d(0), personAdvance = d(0);
      for (const allocation of payment.personAmounts) {
        const id = text(allocation.personId, 'payment person link'), person = linked.get(id), cash = amount(allocation.amountPaid), credit = amount(allocation.advancePremiumTaxCredit);
        if (!person || (!person.months.has(month) && (!cash.isZero() || !credit.isZero()))) throw new Error('Shared Marketplace health paid person does not match original monthly coverage.');
        if (!amount(allocation.otherTaxFreeFunding).isZero() || !amount(allocation.excludedPublicSafetyOfficerAmount).isZero()) throw new Error('Shared Marketplace health separate tax-free payment funding requires its actual coordination method.');
        if (!person.own && !cash.isZero()) throw new Error('Shared Marketplace health owner-paid outside-family premiums require their separate actual source method.');
        paid.people.add(id); personPaid = personPaid.plus(cash); personAdvance = personAdvance.plus(credit);
        if (person.own) { paid.ownPaid = paid.ownPaid.plus(cash); paid.ownAdvance = paid.ownAdvance.plus(credit); }
      }
      if (!personPaid.eq(owner) || !personAdvance.eq(advance)) throw new Error('Shared Marketplace health person payment allocations do not reconcile full owner cash and advances.');
      paid.gross = paid.gross.plus(gross); paid.advance = paid.advance.plus(advance); paidMonths.set(month, paid);
    }
    if (paidMonths.size !== months.size) throw new Error('Shared Marketplace health requires actual paid sources for every original policy month.');
    for (const [month, own] of months) {
      const paid = paidMonths.get(month)!, full = fullMonths.get(month)!;
      if (!paid.gross.eq(full.premium) || !paid.advance.eq(full.advance) || !paid.ownAdvance.eq(own.advance) || !paid.ownPaid.plus(paid.ownAdvance).eq(own.premium)
        || [...linked].some(([id, person]) => person.months.has(month) && !paid.people.has(id))) throw new Error('Shared Marketplace health actual paid family shares must reconcile the source-derived allocation; an agreement cannot supply missing payment facts.');
    }
    result.set(planId, { months });
  }
  return result;
}
