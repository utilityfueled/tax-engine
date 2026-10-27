import { SavingsBondReissueSourcesSchema, type SavingsBondReissueSources } from "@/models/savings-bond-reissue-sources.js";
import type { SavingsBondRedemption } from "@/models/inputs.js";
import { parseGuidedCurrency } from "./guided-currency";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";
import type { SavingsBondEducationData, SavingsBondField, SavingsBondSourceRecord } from "./guided-savings-bond-facts";

type Draft<T> = T extends boolean ? boolean | null : T extends number ? string : T extends Array<infer V> ? Draft<V>[] : T extends object ? { [K in keyof T]: Draft<T[K]> } : T;
export type SavingsBondReissueData = Draft<SavingsBondReissueSources>;
const amounts = new Set(["originalFaceValue", "taxpayerPurchaseFunds", "spousePurchaseFunds", "taxpayerPreviouslyReportedInterest", "spousePreviouslyReportedInterest", "valueAtReissue", "faceValue", "postReissuePriorInterestReported", "box3", "priorRecognizedInterestIncluded", "otherBox3Interest"]);

export function buildSavingsBondReissueSources(data?: SavingsBondReissueData): SavingsBondReissueSources | undefined {
  if (!data) return undefined;
  const normalize = (value: unknown, key = ""): unknown => {
    if (value == null || (typeof value === "string" && value.trim() === "")) return undefined;
    if (Array.isArray(value)) return value.map(item => normalize(item));
    if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalize(item, name)]));
    if (amounts.has(key)) {
      if (typeof value !== "string") throw new Error("Enter the actual bond history amount.");
      const parsed = parseGuidedCurrency(value);
      if (parsed.lt(0)) throw new Error("Actual bond history amounts cannot be negative.");
      return parsed.toFixed();
    }
    if (key === "sourceTaxYear" || key === "originalIndex") {
      if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Enter the actual bond history year and statement selection.");
      return Number(value);
    }
    return typeof value === "string" ? value.trim() : value;
  };
  return SavingsBondReissueSourcesSchema.parse(normalize(data));
}

/** User selections identify existing originals; this creates no second redemption. */
export function linkSavingsBondReissueRedemptions(redemptions: SavingsBondSourceRecord[], sources?: SavingsBondReissueSources): SavingsBondSourceRecord[] {
  const links = new Map<string, string>();
  for (const group of sources?.groups ?? []) for (const successor of group.successors ?? []) {
    if (successor.redemptionSourceId === undefined) continue;
    if (!successor.sourceId || links.has(successor.redemptionSourceId)) throw new Error("Select each actual redemption for only one original successor.");
    links.set(successor.redemptionSourceId, successor.sourceId);
  }
  return redemptions.map(record => {
    const selected = typeof record.sourceId === "string" ? links.get(record.sourceId) : undefined;
    if (record.reissueSourceId !== undefined && record.reissueSourceId !== selected) throw new Error("The saved bond successor link conflicts with the selected original history.");
    return { ...record, ...(selected === undefined ? {} : { reissueSourceId: selected }) };
  });
}

export function invalidateSavingsBondSources(data?: SavingsBondEducationData): SavingsBondEducationData | undefined {
  return data ? { ...data, sourceFactsConfirmed: null,
    ...(data.reissueSources ? { currentStatementReconciliationConfirmed: null, reissueSources: { ...data.reissueSources, sourceFactsConfirmed: null } } : {}),
  } : undefined;
}
export function savingsBondSourceValuesChanged(previous?: SavingsBondEducationData, next?: SavingsBondEducationData): boolean {
  const facts = (value?: SavingsBondEducationData) => value ? { ...value, currentStatementReconciliationConfirmed: undefined } : value;
  return guidedSourceValuesChanged(facts(previous), facts(next));
}

export const bondReissueIdentityFields: SavingsBondField[] = [
  { key: "firstName", label: "Original owner's first name", kind: "text" },
  { key: "lastName", label: "Original owner's last name", kind: "text" },
  { key: "ssnLast4", label: "Original owner's tax ID last four digits", kind: "text" },
  { key: "dateOfBirth", label: "Original owner's birth date", kind: "date" },
];
export const bondReissueGroupFields: SavingsBondField[] = [
  { key: "originalBondIdentifier", label: "Original bond serial or security identifier", kind: "text" },
  { key: "sourceReference", label: "Purchase and reissue record reference", kind: "text" },
  { key: "originalBondType", label: "Original bond type", kind: "choice", choices: [["paper_ee", "Paper series EE"], ["electronic_ee", "Electronic series EE"], ["series_i", "Series I"], ["other", "Other"]] },
  { key: "originalIssueDate", label: "Original assigned issue date", kind: "date" },
  { key: "originalFaceValue", label: "Original face value before reissue", kind: "money" },
  { key: "originalRegisteredOwner", label: "Original registered owners before reissue", kind: "choice", choices: [["taxpayer", "You"], ["spouse", "Spouse"], ["taxpayer_and_spouse", "You and spouse jointly"], ["other", "Other"]] },
  { key: "taxpayerPurchaseFunds", label: "Your original purchase funds", kind: "money" },
  { key: "spousePurchaseFunds", label: "Spouse's original purchase funds", kind: "money" },
  { key: "communityProperty", label: "Original bond was community property", kind: "boolean" },
  { key: "bothOriginalOwnersLivingConfirmed", label: "Both original owners are living joint filers", kind: "boolean" },
  { key: "allPriorReportingCompleteConfirmed", label: "All interest reporting before reissue is accounted for", kind: "boolean" },
  { key: "taxpayerPreviouslyReportedInterest", label: "Interest you reported before reissue", kind: "money" },
  { key: "spousePreviouslyReportedInterest", label: "Interest spouse reported before reissue", kind: "money" },
  { key: "reissueDate", label: "Actual reissue date", kind: "date" },
  { key: "valueAtReissue", label: "Actual total bond value on the reissue record", kind: "money" },
  { key: "allSuccessorsCompleteConfirmed", label: "Every successor bond is included below", kind: "boolean" },
];
export const bondReissueSuccessorFields: SavingsBondField[] = [
  { key: "bondIdentifier", label: "Successor bond serial or security identifier", kind: "text" },
  { key: "sourceReference", label: "Successor record reference", kind: "text" },
  { key: "faceValue", label: "Successor face value", kind: "money" },
  { key: "registeredOwner", label: "Successor registered owner", kind: "choice", choices: [["taxpayer", "You"], ["spouse", "Spouse"]] },
  { key: "furtherOwnershipChanges", label: "Successor had another ownership change", kind: "boolean" },
  { key: "status", label: "Successor's current-year status", kind: "choice", choices: [["redeemed", "Redeemed this year"], ["held", "Still held"]] },
  { key: "postReissuePriorInterestReported", label: "Successor interest reported after reissue in earlier tax years", kind: "money" },
];
export const bondReissueStatementFields: SavingsBondField[] = [
  { key: "sourceReference", label: "Original statement and transaction-detail reference", kind: "text" },
  { key: "payer", label: "Payer name copied from this original", kind: "text" },
  { key: "accountReference", label: "Account reference copied from this original", kind: "text" },
  { key: "accountHolder", label: "Reported owner copied from this original", kind: "choice", choices: [["primary", "You"], ["spouse", "Spouse"]] },
  { key: "box3", label: "Box 3 copied from this original", kind: "money" },
  { key: "priorRecognizedInterestIncluded", label: "Earlier-year interest actually included in this Box 3", kind: "money" },
  { key: "otherBox3Interest", label: "Other interest in this Box 3 outside the selected transactions", kind: "money" },
];

// The canonical linked source type is checked here without widening it to an
// invented TaxYearInput or adding income/allowance fields.
export type LinkedBondRedemption = Pick<SavingsBondRedemption, "sourceId" | "reissueSourceId" | "bondIdentifier">;
