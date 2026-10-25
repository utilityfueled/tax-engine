import Decimal from "decimal.js";
import { officialSampleDocumentFixtures } from "@tax-engine/contracts";
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactMachineValue, WorkspaceStructuredFactRecord } from "@tax-engine/contracts";
import { TaxYearInputSchema, type TaxYearInput } from "../../../src/models/inputs";

export type WorkspaceSourceCollection = "w2s" | "form1099Int" | "form1099Div" | "form1099B" | "form1099Nec" | "form1099G" | "form1099OID" | "form1099R" | "form1099SA" | "formSSA1099" | "form1098E" | "form1095A";
export interface WorkspaceSourceBinding {
  sourceFactId: string;
  sourceFactsConfirmed: boolean;
  inputCollection: WorkspaceSourceCollection;
  inputIndex: number;
  transactionIndex?: number;
  excludedFromCurrentReturn?: boolean;
}
/** A reviewed complete return is distinct from an abbreviated document summary. */
export interface WorkspaceEngineCalculationContext {
  taxInput: TaxYearInput;
  allReturnFactsConfirmed: boolean;
  sourceBindings: WorkspaceSourceBinding[];
}
export interface WorkspaceEngineInputFixture {
  taxInput: TaxYearInput;
  assumptions: string[];
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  sourceFactIdsByItemId: Record<string, string[]>;
}
const sourceCollections: Record<WorkspaceStructuredFactMachineValue["entryKind"], WorkspaceSourceCollection> = {
  "w2-summary": "w2s", "1099-int-summary": "form1099Int", "1099-div-summary": "form1099Div", "1099-b-transaction": "form1099B",
  "1099-nec-summary": "form1099Nec", "1099-g-summary": "form1099G", "1099-oid-summary": "form1099OID", "1099-r-summary": "form1099R",
  "1099-sa-summary": "form1099SA", "ssa-1099-summary": "formSSA1099", "1098-e-summary": "form1098E", "1095-a-summary": "form1095A",
};
const itemKinds: Record<string, WorkspaceStructuredFactMachineValue["entryKind"][]> = {
  "wages-and-withholding": ["w2-summary"], "interest-income": ["1099-int-summary", "1099-oid-summary"], "dividend-income": ["1099-div-summary"],
  "capital-gains": ["1099-b-transaction"], "schedule-c-income": ["1099-nec-summary"], "government-payments": ["1099-g-summary"],
  "retirement-distributions": ["1099-r-summary"], "social-security-benefits": ["ssa-1099-summary"], "hsa-distributions": ["1099-sa-summary"],
  "student-loan-interest": ["1098-e-summary"], "premium-tax-credit": ["1095-a-summary"],
};
const moneyFields = new Set([
  "wages", "federalWithheld", "socialSecurityWages", "socialSecurityTips", "socialSecurityWithheld", "medicareWages", "medicareWithheld", "stateWages", "stateWithheld", "stateIncome", "box10DependentCareBenefits", "box12CodeW",
  "interestIncome", "earlyWithdrawalPenalty", "taxExemptInterest", "usSavingsBondInterest", "ordinaryDividends", "qualifiedDividends", "capitalGainDistributions", "section199ADividends", "foreignTaxPaid",
  "proceeds", "costBasis", "adjustments", "washSaleDisallowed", "nonemployeeCompensation", "unemploymentCompensation", "stateLocalIncomeTaxRefund",
  "originalIssueDiscount", "otherPeriodicInterest", "acquisitionPremium", "treasuryOID", "bondPremium", "taxExemptBondPremium", "taxExemptOID",
  "localWages", "localTaxWithheld", "stateTaxWithheld", "stateDistribution", "grossDistribution", "taxableAmount", "employeeContributions", "simplifiedMethodCostInPlan", "simplifiedMethodPriorYearRecovered", "retiredPublicSafetyOfficerInsurancePremiums", "rothConversionAmount", "rothIraRolledOverAmount", "qualifiedCharitableDistribution", "eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount",
  "earningsOnExcessContributions", "fmvOnDateOfDeath", "rolloverDistributions", "qualifiedMedicalExpenses", "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath", "netBenefits", "studentLoanInterestReceived", "enrolleePremium", "slcsp", "advancePremiumTaxCredit",
]);
const hsaOffsets = ["rolloverDistributions", "qualifiedMedicalExpenses", "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath"] as const;
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function moneyEqual(original: unknown, actual: unknown): boolean {
  if (typeof original !== "string" || typeof actual !== "string" || !/^-?\d+(?:\.\d+)?$/.test(original) || !/^-?\d+(?:\.\d+)?$/.test(actual)) return false;
  const left = new Decimal(original); const right = new Decimal(actual);
  return left.isFinite() && right.isFinite() && left.eq(right);
}
function sameFact(original: unknown, actual: unknown, key: string): boolean {
  if (moneyFields.has(key)) return moneyEqual(original, actual) && (["adjustments", "netBenefits"].includes(key) || new Decimal(original as string).gte(0));
  if (Array.isArray(original)) return Array.isArray(actual) && original.length === actual.length && original.every((entry, index) => sameFact(entry, actual[index], key));
  const object = record(original);
  if (object) { const target = record(actual); return !!target && Object.entries(object).every(([name, value]) => value === undefined || sameFact(value, target[name], name)); }
  if (typeof original === "string" && typeof actual === "string") {
    if (["employerEin", "payerTin"].includes(key)) return original.replace(/-/g, "") === actual.replace(/-/g, "");
    return original.trim() === actual.trim();
  }
  return original === actual;
}
function completeHousehold(input: TaxYearInput): boolean {
  const taxpayer = input.taxpayer; const facts = input.standardDeductionFacts;
  if (!facts || !Array.isArray(taxpayer.dependents)) return false;
  const joint = taxpayer.filingStatus === "married_filing_jointly"; const separate = taxpayer.filingStatus === "married_filing_separately";
  const booleans: (keyof typeof facts)[] = ["primaryBlind", "primaryCanBeClaimedAsDependent", "dualStatusAlien", "nonresidentAlien", "shortTaxYear"];
  const dates: (keyof typeof facts)[] = ["primaryDeathDate"];
  if (joint) { booleans.push("spouseBlind", "spouseCanBeClaimedAsDependent"); dates.push("spouseDeathDate"); }
  if (separate) booleans.push("spouseItemizes", "claimSpouseAdditionalDeduction");
  if (joint && (facts.dualStatusAlien || facts.nonresidentAlien)) booleans.push("residentJointElection");
  if (separate && facts.claimSpouseAdditionalDeduction) { booleans.push("spouseBlind", "spouseCanBeClaimedAsDependent", "spouseHasGrossIncome", "spouseFilesReturn"); dates.push("spouseDeathDate"); }
  if (booleans.some(key => typeof facts[key] !== "boolean") || dates.some(key => facts[key] === undefined)) return false;
  if ((facts.primaryCanBeClaimedAsDependent || (joint && facts.spouseCanBeClaimedAsDependent)) && facts.dependentEarnedIncome === undefined) return false;
  if ((joint || separate) && !taxpayer.spouse) return false;
  const people = [taxpayer.primary, ...taxpayer.dependents, ...(taxpayer.spouse ? [taxpayer.spouse] : [])];
  const ids = people.map(person => person.ssn.replace(/-/g, ""));
  if (new Set(ids).size !== ids.length || people.some(person => {
    if (!person.firstName.trim() || !person.lastName.trim() || !/^\d{3}-?\d{2}-?\d{4}$/.test(person.ssn) || person.ssn.replace(/-/g, "") === "000000000" || !/^\d{4}-\d{2}-\d{2}$/.test(person.dateOfBirth)) return true;
    const date = new Date(`${person.dateOfBirth}T00:00:00Z`);
    return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== person.dateOfBirth || person.dateOfBirth > `${taxpayer.taxYear}-12-31` || person.dateOfBirth < "1850-01-01";
  })) return false;
  return [taxpayer.address.street, taxpayer.address.city, taxpayer.address.state, taxpayer.address.zip].every(value => !!value.trim())
    && taxpayer.dependents.every(person => [person.qualifiesForCTC, person.qualifiesForODC, person.qualifiesForEIC].every(value => typeof value === "boolean"));
}
function originalHouseholdAnswersKnown(input: TaxYearInput): boolean {
  const dependents = input.taxpayer.dependents;
  return Array.isArray(dependents) && dependents.every(person =>
    [person.qualifiesForCTC, person.qualifiesForODC, person.qualifiesForEIC].every(value => typeof value === "boolean"));
}
function sourceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function contextSourceComplete(kind: WorkspaceStructuredFactMachineValue["entryKind"], target: Record<string, unknown>, input: TaxYearInput): boolean {
  const requiredMoney: Partial<Record<typeof kind, string[]>> = {
    "w2-summary": ["wages", "federalWithheld", "socialSecurityWages", "socialSecurityTips", "socialSecurityWithheld", "medicareWages", "medicareWithheld", "box10DependentCareBenefits", "box12CodeW", "box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE", "box12CodeT", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld"],
    "1099-int-summary": ["interestIncome", "earlyWithdrawalPenalty", "federalWithheld", "taxExemptInterest", "usSavingsBondInterest", "foreignTaxPaid", "stateWithheld"],
    "1099-div-summary": ["ordinaryDividends", "qualifiedDividends", "totalCapitalGainDistributions", "federalWithheld", "section199ADividends", "foreignTaxPaid", "section1250Gain", "section1202Gain", "collectiblesGain", "nondividendDistributions", "exemptInterestDividends", "stateWithheld"],
    "1099-b-transaction": ["proceeds", "costBasis", "adjustments", "washSaleDisallowed"],
    "1099-r-summary": ["grossDistribution", "federalWithheld", "stateWithheld", "stateTaxWithheld", "stateDistribution", "localTaxWithheld", "employeeContributions", "eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount", "rothConversionAmount", "rothIraRolledOverAmount", "qualifiedCharitableDistribution", "retiredPublicSafetyOfficerInsurancePremiums"],
    "1099-sa-summary": ["grossDistribution"],
    "ssa-1099-summary": ["netBenefits", "federalWithheld"],
    "1098-e-summary": ["studentLoanInterestReceived"],
    "1099-nec-summary": ["nonemployeeCompensation", "federalWithheld", "stateWithheld"],
  };
  if ((requiredMoney[kind] ?? []).some(key => !moneyEqual(target[key], target[key]) || (!["adjustments", "netBenefits"].includes(key) && new Decimal(target[key] as string).lt(0)))) return false;
  const identityKey = kind === "w2-summary" ? undefined : kind === "1099-b-transaction" ? "description" : kind === "ssa-1099-summary" ? "recipient" : kind === "1098-e-summary" ? "lender" : kind === "1095-a-summary" ? "marketplace" : "payer";
  if (identityKey && (typeof target[identityKey] !== "string" || !(target[identityKey] as string).trim())) return false;
  if (kind === "w2-summary") {
    const employer = record(target.employer);
    if (typeof employer?.name !== "string" || !employer.name.trim() || typeof employer.ein !== "string" || !/^\d{2}-?\d{7}$/.test(employer.ein)) return false;
    if ((new Decimal(String(target.stateWages)).gt(0) || new Decimal(String(target.stateTaxWithheld)).gt(0)) && (typeof target.state !== "string" || !/^[A-Z]{2}$/.test(target.state))) return false;
    if (new Decimal(String(target.box10DependentCareBenefits)).gt(0) && !input.dependentCareBenefits && !input.dependentCare) return false;
    if (new Decimal(String(target.box12CodeW)).gt(0)) {
      const owner = target.accountHolder;
      if (owner !== "primary" && owner !== "spouse") return false;
      const hsa = input.form8889ByOwner?.[owner] ?? (owner === "primary" ? input.form8889 : undefined);
      if (!hsa || hsa.accountOwner !== owner || !Array.isArray(hsa.coverageByMonth) || hsa.coverageByMonth.length !== 12 || typeof hsa.isDependent !== "boolean" || !Array.isArray(hsa.medicareMonths)) return false;
    }
  }
  if (kind === "1099-b-transaction") {
    if (!sourceDate(target.dateSold) || !target.dateSold.startsWith(`${input.taxpayer.taxYear}-`) || (target.dateAcquired !== "VARIOUS" && (!sourceDate(target.dateAcquired) || target.dateAcquired > target.dateSold))) return false;
    if (!["short", "long"].includes(String(target.holdingPeriod)) || typeof target.basisReportedToIRS !== "boolean" || typeof target.washSale !== "boolean") return false;
  }
  if (kind === "1099-r-summary") {
    if (["iraSepSimple", "taxableAmountNotDetermined", "eligibleGovernmental457bPlan", "rothContributionOrConversionMadeBefore2021", "qualifiedRothDistribution", "qualifiedJointSurvivorAnnuity", "returnedContributionByDueDate", "excessContributionReturnedWithoutEarnings", "separationFromServiceAfterAge55ExceptionApplies", "qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies", "qualifiedDomesticRelationsOrderExceptionApplies", "terminalIllnessExceptionApplies", "disabilityPensionBeforeMinimumRetirementAge", "militaryPensionOrSurvivorBenefit"].some(key => typeof target[key] !== "boolean") || typeof target.distributionCode !== "string" || !/^[0-9A-Z]+$/.test(target.distributionCode)) return false;
    if (target.taxableAmount === undefined) {
      const basisKnown = target.taxableAmountNotDetermined === true && moneyEqual(target.simplifiedMethodCostInPlan, target.simplifiedMethodCostInPlan)
        && sourceDate(target.simplifiedMethodAnnuityStartingDate) && typeof target.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate === "number"
        && typeof target.simplifiedMethodPaymentsReceivedThisYear === "number" && moneyEqual(target.simplifiedMethodPriorYearRecovered, target.simplifiedMethodPriorYearRecovered);
      if (!basisKnown && !["G", "H", "Q"].includes(target.distributionCode)) return false;
    }
  }
  if (kind === "1099-sa-summary" && (target.accountType !== "hsa" || (target.distributionCode === "2" && !moneyEqual(target.earningsOnExcessContributions, target.earningsOnExcessContributions)))) return false;
  if (kind === "1098-e-summary" && new Decimal(String(target.studentLoanInterestReceived)).gt(0) && input.studentLoanInterestFacts?.sourceFactsConfirmed !== true) return false;
  if (kind === "ssa-1099-summary" && new Decimal(String(target.netBenefits)).gt(0)) {
    const exclusions = input.socialSecurityFacts;
    if (exclusions?.sourceFactsConfirmed !== true || !moneyEqual(exclusions.puertoRicoIncomeExclusion, exclusions.puertoRicoIncomeExclusion) || !moneyEqual(exclusions.americanSamoaIncomeExclusion, exclusions.americanSamoaIncomeExclusion)) return false;
  }
  return true;
}
function sourceTargetConsistent(kind: WorkspaceStructuredFactMachineValue["entryKind"], target: Record<string, unknown>, input: TaxYearInput): boolean {
  if (target.sourceFactsComplete === false) return false;
  if (["w2-summary", "1099-r-summary", "1099-sa-summary", "1099-nec-summary"].includes(kind) && !["primary", "spouse"].includes(String(target.accountHolder))) return false;
  if (kind === "1099-nec-summary" && !input.scheduleC) return false;
  if (target.accountHolder === "spouse" && (!input.taxpayer.spouse || input.taxpayer.filingStatus !== "married_filing_jointly")) return false;
  if (target.taxYear !== undefined && target.taxYear !== input.taxpayer.taxYear) return false;
  return true;
}
function sourceMatches(source: WorkspaceStructuredFactMachineValue, target: Record<string, unknown>, input: TaxYearInput): boolean {
  if (!sourceTargetConsistent(source.entryKind, target, input)) return false;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || key === "entryKind" || key === "sourceFactsVersion") continue;
    if (source.entryKind === "1099-sa-summary" && hsaOffsets.includes(key as typeof hsaOffsets[number])) continue;
    // This historical OID label never established the original reported box.
    if (source.entryKind === "1099-oid-summary" && key === "taxExemptBondPremium") return false;
    if (key === "belongsOnCurrentYearReturn") { if (value !== true) return false; continue; }
    if (key === "stateTaxReporting") {
      if (value === "multiple") return false;
      if (value === "none" && ((typeof target.state === "string" && target.state.trim()) || !moneyEqual(target.stateTaxWithheld ?? target.stateWithheld, "0") || (target.stateWages !== undefined && !moneyEqual(target.stateWages, "0")))) return false;
      if (value === "single" && (typeof target.state !== "string" || !/^[A-Z]{2}$/.test(target.state))) return false;
      continue;
    }
    let actual = target[key];
    if (source.entryKind === "w2-summary") {
      if (key === "employerName") actual = record(target.employer)?.name;
      if (key === "employerEin") actual = record(target.employer)?.ein;
      if (key === "stateWithheld") actual = target.stateTaxWithheld;
    }
    if (source.entryKind === "1099-div-summary" && key === "capitalGainDistributions") actual = target.totalCapitalGainDistributions;
    if (!sameFact(value, actual, key)) return false;
  }
  return true;
}
function allContextSourcesComplete(original: TaxYearInput, parsed: TaxYearInput): boolean {
  // These additional source forms have their own canonical/guided routes. This
  // bounded document adapter has no pre-default source contract for them yet.
  const otherSourceCollections = ["form1099DA", "form1099Misc", "formW2G", "form1099K", "form1099C", "form1099Q", "formRRB1099", "scheduleK1", "scheduleK1Form1041"] as const;
  if (otherSourceCollections.some(key => (original[key]?.length ?? 0) > 0)) return false;
  for (const [kind, collection] of Object.entries(sourceCollections) as [WorkspaceStructuredFactMachineValue["entryKind"], WorkspaceSourceCollection][]) {
    const actual = original[collection]; const validated = parsed[collection];
    if (!actual) continue;
    if (!Array.isArray(actual) || !Array.isArray(validated)) return false;
    for (let index = 0; index < actual.length; index++) {
      const raw = record(actual[index]); const target = record(validated[index]);
      if (!raw || !target || !sourceTargetConsistent(kind, target, parsed)) return false;
      if (kind === "1099-b-transaction") {
        if (typeof raw.broker !== "string" || !raw.broker.trim() || !moneyEqual(raw.stateWithheld, raw.stateWithheld) || new Decimal(raw.stateWithheld as string).lt(0) || !Array.isArray(raw.transactions) || raw.transactions.some(transaction => {
          const source = record(transaction); return !source || !contextSourceComplete(kind, source, original);
        })) return false;
      } else if (!contextSourceComplete(kind, raw, original)) return false;
    }
  }
  return true;
}
/** Never rebuild a financial return from reduced document summaries or prose answers. */
export function buildWorkspaceEngineInput(
  documents: WorkspaceDocumentRecord[], returnSummary: WorkspaceReturnSummary, structuredFacts: WorkspaceStructuredFactRecord[],
  taxpayer?: TaxYearInput["taxpayer"], context?: WorkspaceEngineCalculationContext,
): WorkspaceEngineInputFixture | null {
  const year = returnSummary.targetTaxYear;
  if (!context || context.allReturnFactsConfirmed !== true || returnSummary.status !== "ready-to-recompute" || year === null || returnSummary.taxYearState !== "single" || !returnSummary.items.length || returnSummary.blockers.length) return null;
  const parsed = TaxYearInputSchema.safeParse(context.taxInput);
  if (!parsed.success || parsed.data.taxpayer.taxYear !== year || !originalHouseholdAnswersKnown(context.taxInput) || !completeHousehold(parsed.data)) return null;
  const input = parsed.data;
  if (!allContextSourcesComplete(context.taxInput, input)) return null;
  if (taxpayer && (!sameFact(taxpayer, input.taxpayer, "taxpayer") || !sameFact(input.taxpayer, taxpayer, "taxpayer"))) return null;
  if (new Set(documents.map(document => document.id)).size !== documents.length || new Set(structuredFacts.map(fact => fact.id)).size !== structuredFacts.length || new Set(returnSummary.items.map(item => item.id)).size !== returnSummary.items.length) return null;
  const selectedIds = new Set(returnSummary.items.flatMap(item => item.sourceDocumentIds));
  const byDocument = new Map(documents.map(document => [document.id, document]));
  for (const id of selectedIds) {
    const document = byDocument.get(id); if (!document || document.coverage !== "supported") return null;
    const fixtureYear = officialSampleDocumentFixtures.find(fixture => fixture.id === document.matchedFixtureId)?.taxYearHint;
    if ((document.taxYear === undefined ? fixtureYear : document.taxYear) !== year || (fixtureYear != null && fixtureYear !== year)) return null;
  }
  const selected = structuredFacts.filter(fact => fact.machineValue && fact.sourceDocumentIds.some(id => selectedIds.has(id)));
  if ([...selectedIds].some(id => !selected.some(fact => fact.sourceDocumentIds.includes(id))) || selected.some(fact => !returnSummary.items.some(item => item.relatedFactIds.includes(fact.factId) && item.sourceDocumentIds.some(id => fact.sourceDocumentIds.includes(id))))) return null;
  if (!selected.length || !Array.isArray(context.sourceBindings) || context.sourceBindings.length !== selected.length) return null;
  if (new Set(context.sourceBindings.map(binding => binding.sourceFactId)).size !== selected.length) return null;
  const usedTargets = new Set<string>();
  for (const fact of selected) {
    const source = fact.machineValue;
    if (source && fact.sourceType === "upload" && fact.id.includes(":parsed-") && ["w2-summary", "1099-int-summary", "1099-div-summary", "1099-b-transaction"].includes(source.entryKind) && (!("sourceFactsVersion" in source) || source.sourceFactsVersion !== 2)) return null;
    const binding = context.sourceBindings.find(entry => entry.sourceFactId === fact.id);
    if (!source || !binding || binding.sourceFactsConfirmed !== true || fact.sourceDocumentIds.length !== 1 || binding.inputCollection !== sourceCollections[source.entryKind] || !Number.isSafeInteger(binding.inputIndex) ) return null;
    if (binding.excludedFromCurrentReturn) {
      if (source.entryKind !== "1099-r-summary" || source.belongsOnCurrentYearReturn !== false || binding.inputIndex !== -1 || binding.transactionIndex !== undefined) return null;
      if (input.form1099R?.some(entry => entry.payer === source.payer && moneyEqual(source.grossDistribution, entry.grossDistribution) && entry.distributionCode === source.distributionCode)) return null;
      continue;
    }
    if (binding.inputIndex < 0) return null;
    const collection = input[binding.inputCollection]; const item = Array.isArray(collection) ? record(collection[binding.inputIndex]) : undefined;
    if (!item) return null;
    const key = `${binding.inputCollection}:${binding.inputIndex}:${binding.transactionIndex ?? "record"}`;
    if (usedTargets.has(key)) return null; usedTargets.add(key);
    let target = item;
    if (source.entryKind === "1099-b-transaction") {
      if (!Number.isSafeInteger(binding.transactionIndex) || (binding.transactionIndex ?? -1) < 0 || !Array.isArray(item.transactions)) return null;
      const transaction = record(item.transactions[binding.transactionIndex as number]); if (!transaction) return null; target = transaction;
    } else if (binding.transactionIndex !== undefined) return null;
    const originalCollection = context.taxInput[binding.inputCollection];
    const originalRecord = Array.isArray(originalCollection) ? record(originalCollection[binding.inputIndex]) : undefined;
    const originalTarget = source.entryKind === "1099-b-transaction" && Array.isArray(originalRecord?.transactions) ? record(originalRecord.transactions[binding.transactionIndex as number]) : originalRecord;
    if (!originalTarget || !contextSourceComplete(source.entryKind, originalTarget, context.taxInput) || !sourceMatches(source, target, input)) return null;
  }
  for (const owner of ["primary", "spouse"] as const) {
    const owned = selected.filter(fact => fact.machineValue?.entryKind === "1099-sa-summary" && fact.machineValue.accountHolder === owner);
    for (const field of hsaOffsets) {
      const values = owned.map(fact => record(fact.machineValue)?.[field]);
      if (!values.some(value => value !== undefined)) continue;
      if (values.some(value => typeof value !== "string" || !moneyEqual(value, value))) return null;
      const total = values.reduce<Decimal>((sum, value) => sum.plus(value as string), new Decimal(0));
      const hsa = input.form8889ByOwner?.[owner] ?? (owner === "primary" ? input.form8889 : undefined);
      if (!hsa || !moneyEqual(total.toFixed(), hsa[field])) return null;
    }
  }
  const sourceFactIdsByItemId: Record<string, string[]> = {};
  for (const item of returnSummary.items) {
    if (item.status !== "ready" || !item.sourceDocumentIds.length || new Set(item.sourceDocumentIds).size !== item.sourceDocumentIds.length) return null;
    const facts = structuredFacts.filter(fact => item.relatedFactIds.includes(fact.factId) && fact.sourceDocumentIds.some(id => item.sourceDocumentIds.includes(id)));
    if (!facts.some(fact => fact.machineValue && itemKinds[item.id]?.includes(fact.machineValue.entryKind)) || facts.some(fact => fact.machineValue && !itemKinds[item.id]?.includes(fact.machineValue.entryKind))) return null;
    sourceFactIdsByItemId[item.id] = facts.map(fact => fact.id);
  }
  return { taxInput: input, sourceDocumentIds: [...selectedIds], sourceFixtureIds: [...new Set(documents.filter(document => selectedIds.has(document.id)).flatMap(document => document.matchedFixtureId ? [document.matchedFixtureId] : []))], sourceFactIdsByItemId,
    assumptions: ["This preview uses the supplied complete, reviewed return facts. Each selected original document record is reconciled to its actual calculation source; abbreviated summaries do not supply missing eligibility, identity, dates or amounts."] };
}
