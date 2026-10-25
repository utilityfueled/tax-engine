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

/** No income calculation or invented tax context; each result preserves source cents. */
export function resolveForm8839PriorBenefits(input: PriorBenefitsInput): (Decimal | undefined)[] {
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
    if (history.otherAdopterReceivedBenefits !== false) throw new Error("Historical adoption other-adopter sharing requires its actual agreed exclusion limit");
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
    return total;
  });
}
