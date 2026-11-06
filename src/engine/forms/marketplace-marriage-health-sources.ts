/** Actual health people in a marriage year. Spec: marketplace-marriage-health.yaml. */
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { calculateForm8962MarriageSources, type Form8962MarriageSourceInput } from './form-8962-marriage-sources.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { calculateSharedMarketplaceHealthSources } from './shared-marketplace-health.js';

const normalizedName = (value: string | undefined) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
function identity(value: string | undefined): string {
  const result = value?.trim().replaceAll('-', '');
  if (!result || !/^\d{9}$/.test(result)) throw new Error('Marriage health requires the actual complete covered-person identity.');
  return result;
}
function amount(value: string | undefined) {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error('Marriage health requires actual nonnegative person payments and advances; unknown is not zero.');
  return d(value);
}
function actualMonth(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 12) throw new Error('Marriage health requires actual coverage months.');
  return value;
}
function paymentDate(value: string | undefined, year: number): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Marriage health requires an actual current-year payment date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || date.getUTCFullYear() !== year) throw new Error('Marriage health requires an actual current-year payment date.');
  return value;
}

export function calculateMarketplaceMarriageHealthSources(input: Form8962MarriageSourceInput & Pick<TaxYearInput, 'form7206'>) {
  const sources = calculateForm8962MarriageSources(input);
  const packet = input.form8962?.marriageSources, health = input.form7206, year = input.taxpayer.taxYear;
  if (!packet?.marriageDate || !health?.plans || !health.persons || health.sourceTaxYear !== year
    || health.sourceFactsConfirmed !== true || health.allPlansIncluded !== true || !health.sourceReference?.trim()) {
    throw new Error('Marriage health requires actual current-year confirmed plan and person sources.');
  }
  const marriageDate = packet.marriageDate, persons = health.persons;
  // Validate any existing dependent/child identity links against their full
  // original snapshots and monthly evidence before using them here.
  const families = calculateMarketplaceCoverageFamilySources(input);
  const sharedPlans = calculateSharedMarketplaceHealthSources(input);
  const ownPeople = new Set([input.taxpayer.primary.ssn, input.taxpayer.spouse?.ssn, ...input.taxpayer.dependents.map(person => person.ssn)].filter((value): value is string => value !== undefined).map(identity));
  for (const plan of health.plans) {
    if (plan.marketplaceCoverage !== true || plan.premiumTaxCreditInvolved !== true) continue;
    const coveredPersons = plan.coveredPersons, paymentSources = plan.payments;
    const shared = sharedPlans?.get(plan.planId ?? '');
    const monthlyFamily = families?.find(family => family.planId === plan.planId);
    if ((!monthlyFamily && ((!shared && plan.allCoveredPersonsInCoverageFamilyConfirmed !== true) || (shared && plan.sharedMarketplaceSources?.allThisReturnPersonsInCoverageFamilyConfirmed !== true))) || !coveredPersons || !paymentSources
      || !plan.marketplacePolicySourceIds?.length || !plan.accountHolder) {
      throw new Error('Marriage health requires complete actual monthly coverage-family or affirmative full-family and person sources.');
    }
    const originalPeople = plan.marketplacePolicySourceIds.flatMap(sourceId => {
      const index = /^form1095A:(0|[1-9]\d*)$/.exec(sourceId)?.[1];
      const original = index === undefined ? undefined : input.form1095A[Number(index)];
      if (!original?.coveredIndividuals) throw new Error('Marriage health requires canonical original policy identity.');
      return original.coveredIndividuals.map(person => ({id:identity(person.ssn),first:actualMonth(person.firstMonth),last:actualMonth(person.lastMonth)}));
    });
    const originalIds = new Set(originalPeople.map(person => person.id)), linked = new Map<string, string>();
    for (const covered of coveredPersons) {
      const people = persons.filter(person => person.personId === covered.personId), person = people[0];
      if (!covered.personId || people.length !== 1 || !person || linked.has(covered.personId)) throw new Error('Marriage health covered person must be uniquely identified.');
      let actualIdentity: string;
      if (person.householdRole === 'primary' || person.householdRole === 'spouse') {
        const actual = input.taxpayer[person.householdRole];
        if (!actual || normalizedName(person.name) !== normalizedName(`${actual.firstName} ${actual.lastName}`)) throw new Error('Marriage health covered-person identity contradicts the actual filer.');
        actualIdentity = identity(actual.ssn);
      } else if (shared) {
        const links = plan.sharedMarketplaceSources!.persons?.filter(row => row.personId === covered.personId), link = links?.[0];
        if (links?.length !== 1 || !link) throw new Error('Marriage health requires actual shared covered-person identity links.');
        actualIdentity = identity(link.coveredIndividualSsn);
      } else {
        const links = plan.coverageFamilySources?.persons?.filter(row => row.personId === covered.personId), link = links?.[0];
        if (!families?.some(row => row.planId === plan.planId) || links?.length !== 1 || !link) throw new Error('Marriage health needs the actual covered-person identity link for a dependent or child.');
        actualIdentity = identity(link.coveredIndividualSsn);
      }
      if (!originalIds.has(actualIdentity) || [...linked.values()].includes(actualIdentity)) throw new Error('Marriage health covered-person identity does not match the original policy.');
      linked.set(covered.personId, actualIdentity);
    }
    if (linked.size !== originalIds.size) throw new Error('Marriage health must link every actual original covered person.');
    for (const payment of paymentSources) {
      const datePaid = paymentDate(payment.datePaid, year), month = actualMonth(payment.coverageMonth);
      if (payment.coverageTaxYear !== year || !payment.personAmounts) throw new Error('Marriage health requires actual current-year person payment sources.');
      for (const allocation of payment.personAmounts) {
        const id = allocation.personId === undefined ? undefined : linked.get(allocation.personId);
        const covered = coveredPersons.find(row => row.personId === allocation.personId);
        if (!id || !covered) throw new Error('Marriage health payment person contradicts the original coverage.');
        const outside = !ownPeople.has(id);
        const person = persons.find(row => row.personId === allocation.personId)!;
        const outsideChildCash = outside && covered.relationshipToOwner === 'child_under_27'
          && person.attainedAgeAtYearEnd !== undefined && person.attainedAgeAtYearEnd < 27 && amount(allocation.amountPaid).gt(0);
        if (outside && amount(allocation.amountPaid).gt(0) && !monthlyFamily) {
          throw new Error('Marriage health outside-family cash requires complete actual monthly qualification and other-return sources.');
        }
        if (outsideChildCash) {
          // The completed coverage-family reader already binds outside advances,
          // the other return and its original claimant/policies. Separately prove
          // this owner's health relationship; a PartV family assignment cannot
          // supply it for a nondependent child. Spec: marriage-outside-person.
          const relationship = covered.childRelationshipSources;
          if (!relationship || relationship.sourceTaxYear !== year || relationship.sourceFactsConfirmed !== true
            || !relationship.sourceReference?.trim() || relationship.accountHolder !== plan.accountHolder
            || identity(relationship.ownerSsn) !== identity(input.taxpayer[plan.accountHolder]?.ssn)
            || identity(relationship.coveredIndividualSsn) !== id
            || !['son_or_daughter', 'stepchild', 'adopted_child', 'foster_child'].includes(relationship.childRelationship ?? '')) {
            throw new Error('Marriage health requires actual confirmed owner and child relationship source identities.');
          }
          const start = relationship.relationshipStartDate;
          const parsed = new Date(`${start}T00:00:00Z`);
          const coverageStart = `${year}-${String(month).padStart(2, '0')}-01`;
          if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(parsed.getTime())
            || parsed.toISOString().slice(0, 10) !== start || start > datePaid || start > coverageStart) {
            throw new Error('Marriage health child relationship must already cover the actual payment and coverage period; other timing needs its separate qualification method.');
          }
        }
        if (amount(allocation.amountPaid).plus(amount(allocation.advancePremiumTaxCredit)).isZero()) continue;
        if (!originalPeople.some(person => person.id === id && person.first <= month && person.last >= month)) {
          throw new Error('Marriage health payment month contradicts the original coverage.');
        }
        const coverageStart = `${year}-${String(month).padStart(2, '0')}-01`;
        if (datePaid < marriageDate && coverageStart < marriageDate) {
          if (covered.relationshipToOwner === 'spouse') throw new Error('Premarital spouse premiums require actual qualification before marriage; an end-year spouse label is insufficient.');
          if (!outside && (covered.relationshipToOwner === 'dependent' || covered.relationshipToOwner === 'child_under_27')) {
            const dependent = packet.dependents?.find(person => identity(person.ssn) === id);
            if (!dependent || (plan.accountHolder === 'primary' ? dependent.qualifiesForPrimary : dependent.qualifiesForSpouse) !== true) {
              throw new Error('Premarital health dependent or child needs actual separate owner qualification before marriage.');
            }
          }
        }
      }
    }
  }
  return sources;
}
