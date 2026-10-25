import Decimal from "decimal.js";
import { z } from "zod";
import { Form8815Schema, SavingsBondRedemptionSchema, type TaxYearInput } from "@/models/inputs.js";
import { validateSavingsBondReturnIdentity } from "@/engine/forms/savings-bond-return-identity.js";
import type { FilingStatus as EngineFilingStatus } from "@/models/constants.js";
import type { FilingStatus, InterestEntryData, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { isStartedInvestment } from "./guided-investment-facts";

export type SavingsBondSourceRecord = Record<string, string | boolean | null | undefined>;
export interface SavingsBondEducationData {
  taxYear?: string;
  sourceFactsConfirmed?: boolean | null;
  currentStatementReconciliationConfirmed?: boolean | null;
  priorYearInterestIncludedInCurrentStatements?: string;
  americanSamoaIncomeExclusion?: string;
  puertoRicoIncomeExclusion?: string;
  royaltyInterestAdjustment?: string;
  redemptions?: SavingsBondSourceRecord[];
  educationExpenses?: SavingsBondSourceRecord[];
}
export interface SavingsBondField {
  key: string; label: string; kind: "text" | "date" | "money" | "year" | "boolean" | "choice";
  choices?: ReadonlyArray<readonly [string, string]>;
  signed?: boolean;
  when?: (record: SavingsBondSourceRecord) => boolean;
}
export const savingsBondFields: SavingsBondField[] = [
  { key: "bondType", label: "Actual bond type", kind: "choice", choices: [["paper_ee", "Paper series EE"], ["electronic_ee", "Electronic series EE"], ["series_i", "Series I"], ["other", "Other bond"]] },
  { key: "issueDate", label: "Assigned issue date (first day of the issue month)", kind: "date" },
  { key: "redemptionDate", label: "Actual redemption date", kind: "date" },
  { key: "registeredOwner", label: "Registered bond owner", kind: "choice", choices: [["taxpayer", "You"], ["spouse", "Spouse"], ["taxpayer_and_spouse", "You and spouse jointly"], ["other", "Someone else"]] },
  { key: "ageTestOwner", label: "Actual registered owner used for the age-at-issue test", kind: "choice", choices: [["taxpayer", "You"], ["spouse", "Spouse"]], when: record => record.registeredOwner === "taxpayer_and_spouse" },
  { key: "ownerDateOfBirth", label: "Registered owner's actual birth date", kind: "date" },
  { key: "ownershipConfirmed", label: "Bond registration satisfies the Form 8815 ownership requirements", kind: "boolean" },
  { key: "proceeds", label: "Total redemption proceeds (principal and interest)", kind: "money" },
  { key: "faceValue", label: "Actual face value", kind: "money" },
  { key: "priorYearInterestReported", label: "This bond's interest reported in earlier years", kind: "money" },
];
export const savingsBondExpenseFields: SavingsBondField[] = [
  { key: "beneficiaryName", label: "Education beneficiary name", kind: "text" },
  { key: "beneficiaryTaxId", label: "Beneficiary tax ID as entered in household information", kind: "text" },
  { key: "relationship", label: "Beneficiary's relationship to this return", kind: "choice", choices: [["taxpayer", "You"], ["spouse", "Spouse"], ["dependent", "Dependent"], ["other", "Someone else"]] },
  { key: "dependentClaimed", label: "This dependent is claimed on this return", kind: "boolean", when: record => record.relationship === "dependent" },
  { key: "institutionName", label: "Eligible institution or plan name", kind: "text" },
  { key: "institutionAddress", label: "Institution or plan address", kind: "text" },
  { key: "expenseType", label: "Actual expense type", kind: "choice", choices: [["tuition_and_required_fees", "Tuition and required fees"], ["coverdell_contribution", "Coverdell ESA contribution"], ["qtp_contribution", "529 plan contribution"]] },
  { key: "paidTaxYear", label: "Expense paid tax year", kind: "year" },
  { key: "amountPaid", label: "Actual expense or contribution paid", kind: "money" },
  { key: "qualificationConfirmed", label: "This expense satisfies the Form 8815 qualification rules", kind: "boolean" },
  { key: "directInstitutionBenefits", label: "Tax-free benefits paid directly to the institution for this expense", kind: "money" },
  { key: "educationCreditExpenses", label: "This expense used for an education credit", kind: "money" },
  { key: "taxFreeDistributionExpenses", label: "This expense used for a tax-free 529 or Coverdell distribution", kind: "money" },
  { key: "beneficiaryBenefits", label: "Other tax-free educational benefits received by the beneficiary for this expense", kind: "money" },
  { key: "coordinationConfirmed", label: "This expense reconciles with all credits, distributions and assistance", kind: "boolean" },
];
export const savingsBondWorksheetFields: SavingsBondField[] = [
  { key: "priorYearInterestIncludedInCurrentStatements", label: "Previously reported bond interest included in current Form 1099-INT Box 3", kind: "money" },
  { key: "americanSamoaIncomeExclusion", label: "Actual American Samoa income exclusion for Form 8815 MAGI", kind: "money" },
  { key: "puertoRicoIncomeExclusion", label: "Actual Puerto Rico income exclusion for Form 8815 MAGI", kind: "money" },
  { key: "royaltyInterestAdjustment", label: "Signed change in AGI from the pre-exclusion royalty interest deduction", kind: "money", signed: true },
];
const fields = [...savingsBondFields, ...savingsBondExpenseFields, ...savingsBondWorksheetFields];
function normalized(record: SavingsBondSourceRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value == null || (typeof value === "string" && !value.trim())) continue;
    const field = fields.find(item => item.key === key);
    if (field?.kind === "money") {
      if (typeof value !== "string") throw new Error("Enter the actual source amount.");
      const amount = parseGuidedCurrency(value);
      if (!field.signed && amount.isNegative()) throw new Error(`${field.label} cannot be negative.`);
      result[key] = amount.toFixed();
    } else if (field?.kind === "year") {
      if (typeof value !== "string" || !/^\d{4}$/.test(value)) throw new Error("Enter the actual four-digit expense year.");
      result[key] = Number(value);
    } else result[key] = typeof value === "string" ? value.trim() : value;
  }
  return result;
}
function actualAmount(value: string | undefined, name: string): Decimal {
  if (value === undefined || value.trim() === "") throw new Error(`Enter the actual ${name}, including 0 only when confirmed.`);
  const amount = parseGuidedCurrency(value);
  if (amount.isNegative()) throw new Error(`The actual ${name} cannot be negative.`);
  return amount;
}
function actualDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Complete the actual bond dates and registered-owner birth date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Enter valid actual bond dates.");
  return value;
}
function sourceId(value: string | undefined, seen: Set<string>) {
  if (!value || seen.has(value)) throw new Error("Each actual bond or expense needs a distinct source record.");
  seen.add(value);
}

function collect(data: SavingsBondEducationData, year?: number | null, status?: FilingStatus | null, interestEntries?: InterestEntryData[], personal?: PersonalInfoData): Pick<TaxYearInput, "savingsBondRedemptions" | "form8815"> {
  if ((year !== 2025 && year !== 2026) || !status || data.taxYear !== String(year)) throw new Error("Match the actual bond source year to the return year and filing status.");
  if (data.sourceFactsConfirmed !== true || data.currentStatementReconciliationConfirmed !== true) throw new Error("Confirm the actual bond and education sources and current statement interest reconciliation.");
  if (!Array.isArray(data.redemptions) || !Array.isArray(data.educationExpenses)) throw new Error("Add actual bond and education records or explicitly confirm an empty list.");
  const redemptions = data.redemptions.map(record => SavingsBondRedemptionSchema.parse(normalized(record)));
  const worksheet = normalized(Object.fromEntries(savingsBondWorksheetFields.map(field => [field.key, data[field.key as keyof SavingsBondEducationData]])) as SavingsBondSourceRecord);
  for (const field of savingsBondWorksheetFields) if (worksheet[field.key] === undefined) throw new Error(`Enter the actual ${field.label.toLowerCase()}.`);
  const facts = Form8815Schema.parse({ ...worksheet, sourceFactsConfirmed: data.sourceFactsConfirmed, currentStatementReconciliationConfirmed: data.currentStatementReconciliationConfirmed, educationExpenses: data.educationExpenses.map(normalized) });
  if (!personal) throw new Error("Complete the actual household personal information before reconciling bond sources.");
  const statuses: Record<FilingStatus, EngineFilingStatus> = {
    single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately",
    hoh: "head_of_household", qss: "qualifying_surviving_spouse",
  };
  validateSavingsBondReturnIdentity({
    taxYear: year, filingStatus: statuses[status], primary: personal,
    spouse: personal.spouse, dependents: personal.dependents, redemptions, facts,
  });
  let priorInterest = new Decimal(0), currentInterest = new Decimal(0);
  const bondIds = new Set<string>();
  for (const bond of redemptions) {
    if (!bond.sourceFactsComplete) throw new Error("Complete each actual bond source fact; blank is not zero or ineligible.");
    sourceId(bond.sourceId, bondIds);
    const issued = actualDate(bond.issueDate), redeemed = actualDate(bond.redemptionDate), born = actualDate(bond.ownerDateOfBirth);
    if (!issued.endsWith("-01") || issued > redeemed || born > issued || redeemed.slice(0, 4) !== String(year)) throw new Error("Bond dates must use the assigned issue month and the actual redemption year and owner history.");
    const gross = actualAmount(bond.proceeds, "redemption proceeds"), face = actualAmount(bond.faceValue, "bond face value"), prior = actualAmount(bond.priorYearInterestReported, "previously reported interest");
    if (bond.qualifiedExpenses !== undefined && !actualAmount(bond.qualifiedExpenses, "saved per-bond expenses").isZero()) throw new Error("Reconcile saved per-bond expenses to the actual return-level education records.");
    priorInterest = priorInterest.plus(prior);
    if (bond.bondType === "other") continue;
    const principal = bond.bondType === "paper_ee" ? face.times("0.5") : face;
    if (principal.gt(gross) || prior.gt(gross.minus(principal))) throw new Error("Actual principal and previously reported interest cannot exceed redemption proceeds.");
    if (bond.interest !== undefined && !actualAmount(bond.interest, "saved bond interest").eq(gross.minus(principal).minus(prior))) throw new Error("Saved bond interest does not reconcile to the actual source records.");
    currentInterest = currentInterest.plus(gross.minus(principal).minus(prior));
  }
  const adjustment = actualAmount(facts.priorYearInterestIncludedInCurrentStatements, "prior interest included in current statements");
  if (adjustment.gt(priorInterest)) throw new Error("The statement adjustment exceeds interest actually reported in earlier years.");
  const statementInterest = (interestEntries ?? []).filter(isStartedInvestment).reduce((sum, entry) => sum.plus(actualAmount(entry.usSavingsBondInterest, "Form 1099-INT Box 3 amount")), new Decimal(0));
  if (currentInterest.plus(adjustment).gt(statementInterest)) throw new Error("Reconcile current bond interest and the prior-interest adjustment to actual Form 1099-INT Box 3 records in investment income.");
  const expenseIds = new Set<string>();
  for (const expense of facts.educationExpenses ?? []) {
    sourceId(expense.sourceId, expenseIds);
    if (expense.paidTaxYear !== year || expense.coordinationConfirmed !== true || (expense.relationship === "dependent" && expense.dependentClaimed === undefined)) throw new Error("Complete the actual expense year, dependent eligibility and education benefit coordination.");
    const paid = actualAmount(expense.amountPaid, "education expense paid");
    const direct = actualAmount(expense.directInstitutionBenefits, "direct institution benefits"), credit = actualAmount(expense.educationCreditExpenses, "credit expenses"), distribution = actualAmount(expense.taxFreeDistributionExpenses, "tax-free distribution expenses");
    actualAmount(expense.beneficiaryBenefits, "beneficiary educational benefits");
    if (direct.plus(credit).plus(distribution).gt(paid)) throw new Error("Coordinated education benefits exceed this actual expense.");
  }
  return { savingsBondRedemptions: redemptions, form8815: facts };
}
export function savingsBondFactErrors(data?: SavingsBondEducationData, year?: number | null, status?: FilingStatus | null, interestEntries?: InterestEntryData[], personal?: PersonalInfoData): Record<string, string> {
  if (!data) return {};
  try { collect(data, year, status, interestEntries, personal); return {}; }
  catch (error) { return { savingsBondEducation: error instanceof z.ZodError ? "Complete the actual bond and education source amounts, dates, identities and yes-or-no answers." : error instanceof Error ? error.message : "Complete the actual savings-bond education sources." }; }
}
export function buildSavingsBondInputs(data?: SavingsBondEducationData, year?: number | null, status?: FilingStatus | null, interestEntries?: InterestEntryData[], personal?: PersonalInfoData): Partial<Pick<TaxYearInput, "savingsBondRedemptions" | "form8815">> {
  return data ? collect(data, year, status, interestEntries, personal) : {};
}
