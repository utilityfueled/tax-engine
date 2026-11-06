/** Actual source binding for the Form8839 historical foreign-benefit worksheet. */
import Decimal from "decimal.js";
import type { Form8839Child, TaxYearInput } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d, sum } from "@/utils/decimal.js";

type Identity = Pick<TaxYearInput["taxpayer"]["primary"], "firstName" | "lastName" | "ssn">;
export interface AdoptionSourceTaxpayer { primary: Identity; spouse?: Identity }
interface PriorBenefitsInput {
  taxYear: number; filingStatus: FilingStatus; eligibilityConfirmed?: boolean;
  sourceTaxpayer?: AdoptionSourceTaxpayer; children: Form8839Child[];
  maxExclusionPerChild: Decimal;
}
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Historical adoption ${label} requires an actual nonnegative amount`);
  const parsed = d(value);
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error(`Historical adoption ${label} must be finite and nonnegative`);
  return parsed;
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Historical adoption requires actual ${label}`);
  return value.trim();
}
const name = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const tin = (value: string) => value.replaceAll("-", "");

/** This finite source method deliberately excludes shared credit/history inference. */
function agreedHistoricalLimit(input: PriorBenefitsInput, child: Form8839Child): Decimal {
  const history = child.priorYearForeignBenefitHistory, agreement = history?.otherAdopterAgreement;
  if (!agreement || input.filingStatus !== "single" || input.children.length !== 1 || input.sourceTaxpayer?.spouse
    || agreement.sourceTaxYear !== input.taxYear || agreement.sourceFactsConfirmed !== true || agreement.bothAdoptersAgreed !== true
    || agreement.allAdoptersIncluded !== true || agreement.creditExpenseHistoryConfirmed !== true || agreement.allOtherAdopterBenefitsIncluded !== true) {
    throw new Error("Shared historical adoption requires its complete actual single-filer two-adopter agreement");
  }
  text(agreement.sourceReference, "shared agreement reference");
  const owner = input.sourceTaxpayer?.primary, otherId = tin(text(agreement.otherAdopterIdentifyingNumber, "other adopter identity"));
  const otherName = name(text(agreement.otherAdopterName, "other adopter name"));
  if (!owner || name(text(agreement.taxpayerNameOnAgreement, "agreement taxpayer name")) !== name(`${owner.firstName} ${owner.lastName}`)
    || agreement.taxpayerIdentifyingNumberLast4 !== tin(owner.ssn).slice(-4)
    || tin(owner.ssn) === tin(child.childIdentifyingNumber ?? "")
    || !/^\d{9}$/.test(otherId) || otherId === tin(owner.ssn) || otherId === tin(child.childIdentifyingNumber ?? "")
    || name(text(agreement.childNameOnAgreement, "agreement child name")) !== name(`${child.childFirstName} ${child.childLastName}`)
    || agreement.childIdentifyingNumberLast4 !== tin(child.childIdentifyingNumber ?? "").slice(-4)) {
    throw new Error("Shared historical adoption agreement owner, outside adopter or child identity conflicts");
  }
  // Bounded cents/record census keeps all existing Decimal20 operations exact.
  // This is a finite admission boundary, never normalization of source values.
  const cash = (value: string | undefined, label: string) => {
    if (value === undefined || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error(`Shared historical adoption ${label} requires bounded actual cents`);
    return amount(value, label);
  };
  for (const [value, label] of [
    [agreement.taxpayerQualifiedCreditExpenses, "own credit expenses"], [agreement.otherAdopterQualifiedCreditExpenses, "outside credit expenses"],
    [agreement.taxpayerPriorCreditsClaimed, "own prior credits"], [agreement.otherAdopterPriorCreditsClaimed, "outside prior credits"],
    [agreement.otherAdopterPriorExclusionLimitUsed, "outside prior exclusions"], [agreement.otherAdopterCurrentBenefits, "outside current benefits"],
    [child.qualifiedExpenses, "child credit expenses"], [child.priorYearCreditsClaimed, "child prior credits"],
  ] as const) if (!cash(value, label).isZero()) throw new Error("Shared historical adoption positive credit or outside current-benefit history requires its separate source method");
  if (!Array.isArray(child.expensesByYear) || child.expensesByYear.some(row => !cash(row.amount, "dated own credit expenses").isZero())) {
    throw new Error("Shared historical adoption requires actual complete zero dated credit expenses");
  }
  const ownLimit = cash(agreement.taxpayerExclusionLimit, "agreed own limit"), otherLimit = cash(agreement.otherAdopterExclusionLimit, "agreed outside limit");
  const expectedMaximum = input.taxYear === 2026 ? "17670" : "17280";
  if (!input.maxExclusionPerChild.eq(expectedMaximum) || !ownLimit.isInteger() || !otherLimit.isInteger()
    || !ownLimit.plus(otherLimit).eq(input.maxExclusionPerChild)) throw new Error("Shared historical adoption requires actual whole-dollar shares totaling the current indexed limit");
  cash(child.employerBenefits, "own current benefits");
  if (!cash(child.priorYearForeignBenefits, "own prior benefits").gt(0) || !history?.records?.length || history.records.length > 16) {
    throw new Error("Shared historical adoption requires actual positive own prior benefits and bounded originals");
  }
  for (const record of history.records) { cash(record.originalEmployerBenefits, "own original benefits"); cash(record.benefitsAllocatedToChild, "own allocation"); }
  if (!agreement.records?.length || agreement.records.length > 16) throw new Error("Shared historical adoption requires actual outside prior benefit originals");
  const ids = new Set(history.records.map(record => record.sourceId)), originals = new Set<string>();
  let total = new Decimal(0);
  for (const record of agreement.records) {
    const id = text(record.sourceId, "outside source identity"), employer = text(record.employerName, "outside employer"), ein = tin(text(record.employerEin, "outside employer EIN"));
    const key = `${record.taxYear}:${ein}`;
    if (ids.has(id) || originals.has(key)) throw new Error("Shared historical adoption duplicate outside source or original statement");
    ids.add(id); originals.add(key);
    if (!Number.isInteger(record.taxYear) || (record.taxYear ?? 0) < 1997 || (record.taxYear ?? input.taxYear) >= input.taxYear
      || !/^\d{9}$/.test(ein) || !employer || name(text(record.recipientName, "outside recipient")) !== otherName
      || record.recipientTaxpayerIdLast4 !== otherId.slice(-4) || record.allocatedBenefitsIncludedInPriorIncome !== true || record.employerPlanQualified !== true) {
      throw new Error("Shared historical adoption outside original year, recipient, income or plan facts conflict");
    }
    const original = cash(record.originalEmployerBenefits, "outside original benefits"), allocated = cash(record.benefitsAllocatedToChild, "outside child allocation");
    if (allocated.gt(original)) throw new Error("Shared historical adoption outside allocation exceeds its original");
    total = total.plus(allocated);
  }
  if (!total.gt(0)) throw new Error("Shared historical adoption requires actual positive outside benefits, not an invented recipient");
  return ownLimit;
}
export interface ResolvedPriorAdoptionBenefits { priorBenefits: Decimal; agreedExclusionLimit?: Decimal }

/** No income calculation or invented tax context; each result preserves source cents. */
export function resolveForm8839PriorBenefits(input: PriorBenefitsInput): (ResolvedPriorAdoptionBenefits | undefined)[] {
  const originals = new Map<string, { snapshot: string; total: Decimal; allocated: Decimal }>();
  const originalKeys = new Map<string, string>();
  const children = new Set<string>();
  return input.children.map(child => {
    const history = child.priorYearForeignBenefitHistory;
    const prior = child.priorYearForeignBenefits === undefined ? undefined : amount(child.priorYearForeignBenefits, "prior benefits");
    if (!history && (prior === undefined || prior.isZero())) return undefined;
    if (!history) throw new Error("Prior-year foreign adoption benefits require the actual historical exclusion worksheet sources");
    if (![2025, 2026].includes(input.taxYear) || typeof input.eligibilityConfirmed !== "boolean"
      || child.sourceFactsComplete !== true || child.isForeignAdoption !== true || child.isSpecialNeeds !== false
      || child.adoptionFinalizedYear !== input.taxYear || child.adoptionBecameFinal !== true) {
      throw new Error("Historical adoption requires actual foreign classification, eligibility and current finality year");
    }
    if (history.sourceTaxYear !== input.taxYear || history.sourceFactsConfirmed !== true || history.allPriorBenefitsIncluded !== true
      || history.returnMembershipUnchangedConfirmed !== true || !Array.isArray(history.records)) {
      throw new Error("Historical adoption requires confirmed actual source year, unchanged membership and complete prior benefit records");
    }
    text(history.sourceReference, "history reference");
    if (typeof history.otherAdopterReceivedBenefits !== "boolean" || (history.otherAdopterReceivedBenefits === false && history.otherAdopterAgreement !== undefined)) {
      throw new Error("Historical adoption other-adopter sharing requires consistent actual agreement facts");
    }
    if (history.priorExclusionHistoryConfirmed !== true || !amount(history.priorExclusionLimitUsed, "prior exclusion usage").isZero()
      || !amount(child.priorYearExclusionsClaimed, "child prior exclusion usage").isZero()) {
      throw new Error("Historical foreign adoption requires confirmed actual zero prior exclusion limit usage before current finality");
    }
    if (child.employerPlanQualified !== true) throw new Error("Historical adoption requires actual qualified employer assistance plans");
    const childName = `${text(child.childFirstName, "child first name")} ${text(child.childLastName, "child last name")}`;
    const childId = tin(text(child.childIdentifyingNumber, "child identity"));
    if (!/^\d{9}$/.test(childId) || children.has(childId) || name(text(history.childNameOnSource, "source child name")) !== name(childName)
      || !/^\d{4}$/.test(history.childIdentifyingNumberLast4 ?? "") || childId.slice(-4) !== history.childIdentifyingNumberLast4) {
      throw new Error("Historical adoption child identity must match one unique actual child");
    }
    children.add(childId);
    if (!input.sourceTaxpayer) throw new Error("Historical adoption requires actual taxpayer identity context");
    const seen = new Set<string>();
    const allocated = history.records.map(record => {
      const sourceId = text(record.sourceId, "statement source identity");
      if (seen.has(sourceId)) throw new Error("Duplicate historical adoption child-source allocation");
      seen.add(sourceId);
      if (record.taxYear === undefined || !Number.isInteger(record.taxYear) || record.taxYear < 1997 || record.taxYear >= input.taxYear) {
        throw new Error("Historical adoption requires the actual prior benefit year, after the exclusion took effect");
      }
      const owner = record.accountHolder;
      const person = owner === "primary" ? input.sourceTaxpayer?.primary : owner === "spouse" && input.filingStatus === "married_filing_jointly" ? input.sourceTaxpayer?.spouse : undefined;
      const recipient = text(record.recipientName, "recipient name");
      if (!person || typeof person.ssn !== "string" || !/^\d{9}$/.test(tin(person.ssn)) || name(recipient) !== name(`${person.firstName} ${person.lastName}`)
        || !/^\d{4}$/.test(record.recipientTaxpayerIdLast4 ?? "") || tin(person.ssn).slice(-4) !== record.recipientTaxpayerIdLast4) {
        throw new Error("Historical adoption source recipient identity and owner must match the actual return");
      }
      const employer = text(record.employerName, "employer name"), ein = tin(text(record.employerEin, "employer EIN"));
      if (!/^\d{9}$/.test(ein)) throw new Error("Historical adoption original employer EIN is invalid");
      if (record.allocatedBenefitsIncludedInPriorIncome !== true || record.employerPlanQualified !== true) {
        throw new Error("Historical adoption requires actual prior income inclusion and qualified-plan facts");
      }
      const original = amount(record.originalEmployerBenefits, "original statement benefits");
      const share = amount(record.benefitsAllocatedToChild, "child allocated benefits");
      const key = `${record.taxYear}:${owner}:${ein}`;
      if (originalKeys.has(key) && originalKeys.get(key) !== sourceId) throw new Error("Duplicate original employer-year benefit statement with different source identities");
      originalKeys.set(key, sourceId);
      const snapshot = JSON.stringify([record.taxYear, owner, name(employer), ein, name(recipient), record.recipientTaxpayerIdLast4, original.toFixed()]);
      const priorSource = originals.get(sourceId);
      if (priorSource && priorSource.snapshot !== snapshot) throw new Error("Historical adoption original statement snapshots disagree across children");
      const combined = (priorSource?.allocated ?? new Decimal(0)).plus(share);
      if (combined.gt(original)) throw new Error("Historical adoption child allocations exceed original statement benefits");
      originals.set(sourceId, { snapshot, total: original, allocated: combined });
      return share;
    });
    const total = sum(...allocated);
    if (prior === undefined || !prior.eq(total)) throw new Error("Historical adoption prior benefit amount must reconcile exactly to actual child source allocations");
    const agreedExclusionLimit = history.otherAdopterReceivedBenefits ? agreedHistoricalLimit(input, child) : undefined;
    return { priorBenefits: total, ...(agreedExclusionLimit === undefined ? {} : { agreedExclusionLimit }) };
  });
}
