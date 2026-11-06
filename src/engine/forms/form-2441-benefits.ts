/** Form 2441 Part III. Spec: spec/federal/form-2441-benefits.yaml. */
import Decimal from "decimal.js";
import type { DependentCareBenefits } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

type Owner = "primary" | "spouse";
type Schedule = "schedule-c" | "schedule-e" | "schedule-f";
export interface Form2441BenefitsInput {
  taxYear: number;
  filingStatus: FilingStatus;
  facts?: DependentCareBenefits;
}
export interface Form2441BenefitsResult {
  taxYear: number;
  sourceFactsVerified: boolean;
  treatedAsUnmarried: boolean;
  requiresForm2441: boolean;
  alreadyIncludedInWages: Decimal;
  deductibleBenefits: Decimal;
  excludedBenefits: Decimal;
  taxableBenefits: Decimal;
  unallowedBusinessBenefits: Decimal;
  totalBenefitsApplied: Decimal;
  qualifyingCreditExpenses: Decimal;
  employeeSources: Array<{ sourceId: string; owner: Owner; benefitsReported: Decimal; alreadyIncludedInWages: Decimal;
    currentBenefitsNotInWages: Decimal; priorYearCarryoverUsed: Decimal; forfeited: Decimal; carriedForward: Decimal }>;
  businessSources: Array<{ sourceId: string; owner: Owner; schedule: Schedule; benefitsReceived: Decimal; priorYearCarryoverUsed: Decimal; alreadyDeducted: Decimal }>;
  deductionAllocations: Array<{ sourceId: string; owner: Owner; schedule: Schedule; amount: Decimal }>;
  lines: CalculatedLine[];
}

function amount(value: string | undefined, name: string, signed = false): Decimal {
  if (value === undefined) throw new Error(`Form 2441 Part III requires ${name}, including actual zero`);
  let result: Decimal;
  try { result = new Decimal(value); } catch { throw new Error(`Form 2441 ${name} must be finite`); }
  if (!result.isFinite() || (!signed && result.isNegative())) throw new Error(`Form 2441 ${name} must be finite${signed ? "" : " and nonnegative"}`);
  return result;
}
function knownBoolean(value: boolean | undefined, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Form 2441 Part III requires ${name}`);
  return value;
}
function identity(source: { sourceId?: string; owner?: Owner }, joint: boolean): { sourceId: string; owner: Owner } {
  if (typeof source.sourceId !== "string" || !source.sourceId.trim()) throw new Error("Form 2441 benefit sourceId is required");
  if (source.owner !== "primary" && source.owner !== "spouse") throw new Error("Form 2441 benefit source owner is required");
  if (!joint && source.owner === "spouse") throw new Error("Form 2441 spouse-owned benefit sources require a joint return");
  return { sourceId: source.sourceId.trim(), owner: source.owner };
}
function sourceSchedule(value: Schedule | undefined): Schedule {
  if (value !== "schedule-c" && value !== "schedule-e" && value !== "schedule-f") throw new Error("Form 2441 business benefit source schedule is required");
  return value;
}

export function calculateForm2441Benefits(input: Form2441BenefitsInput): Form2441BenefitsResult {
  const { taxYear, filingStatus, facts } = input;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form 2441 Part III tax year is unsupported");
  if (!facts || facts.sourceFactsConfirmed !== true) throw new Error("Form 2441 Part III requires sourceFactsConfirmed");
  if (facts.earnedIncomeWorksheetConfirmed !== true) throw new Error("Form 2441 Part III requires earnedIncomeWorksheetConfirmed");
  if (facts.creditExpenseCoordinationConfirmed !== true) throw new Error("Form 2441 Part III requires creditExpenseCoordinationConfirmed");
  const eligible = knownBoolean(facts.exclusionEligibilityConfirmed, "exclusionEligibilityConfirmed");
  for (const key of ["employeeBenefits", "selfEmployedBenefits", "deductionAllocations"] as const) {
    if (!Array.isArray(facts[key])) throw new Error(`Form 2441 Part III requires ${key}, including an actual empty array`);
  }
  const employees = facts.employeeBenefits;
  const businesses = facts.selfEmployedBenefits;
  const allocations = facts.deductionAllocations;
  // The explicit checks also narrow optional array fields for direct callers.
  if (!employees || !businesses || !allocations) throw new Error("Form 2441 benefit source arrays are required");
  const joint = filingStatus === "married_filing_jointly";
  const separate = filingStatus === "married_filing_separately";
  const sourceIds = new Set<string>();
  const register = (source: { sourceId?: string; owner?: Owner }) => {
    const result = identity(source, joint);
    if (sourceIds.has(result.sourceId)) throw new Error(`Form 2441 duplicate benefit source ${result.sourceId}`);
    sourceIds.add(result.sourceId);
    return result;
  };
  const employeeSources = employees.map((source) => {
    const id = register(source);
    const benefitsReported = amount(source.benefitsReported, `${id.sourceId}.benefitsReported`);
    const alreadyIncludedInWages = amount(source.alreadyIncludedInWages, `${id.sourceId}.alreadyIncludedInWages`);
    if (alreadyIncludedInWages.gt(benefitsReported)) throw new Error("Form 2441 alreadyIncludedInWages exceeds reported benefits");
    const currentBenefitsNotInWages = benefitsReported.minus(alreadyIncludedInWages);
    const priorYearCarryoverUsed = amount(source.priorYearCarryoverUsed, `${id.sourceId}.priorYearCarryoverUsed`);
    const forfeited = amount(source.forfeited, `${id.sourceId}.forfeited`);
    const carriedForward = amount(source.carriedForward, `${id.sourceId}.carriedForward`);
    if (forfeited.plus(carriedForward).gt(currentBenefitsNotInWages)) throw new Error("Form 2441 forfeited and carriedForward benefits exceed this source's line12 amount");
    return { ...id, benefitsReported, alreadyIncludedInWages, currentBenefitsNotInWages, priorYearCarryoverUsed, forfeited, carriedForward };
  });
  const businessSources = businesses.map((source) => {
    const id = register(source);
    return { ...id, schedule: sourceSchedule(source.schedule),
      benefitsReceived: amount(source.benefitsReceived, `${id.sourceId}.benefitsReceived`),
      priorYearCarryoverUsed: amount(source.priorYearCarryoverUsed, `${id.sourceId}.priorYearCarryoverUsed`),
      alreadyDeducted: amount(source.alreadyDeducted, `${id.sourceId}.alreadyDeducted`) };
  });

  const planLimit = roundDollar(amount(facts.planExclusionLimit, "planExclusionLimit"));
  const incurred = roundDollar(amount(facts.qualifiedExpensesIncurred, "qualifiedExpensesIncurred"));
  const primaryIncome = roundDollar(amount(facts.primaryEarnedIncome, "primaryEarnedIncome", true));
  const creditExpenses = roundDollar(amount(facts.qualifiedExpensesPaidForCredit, "qualifiedExpensesPaidForCredit"));
  const count = facts.qualifyingIndividuals;
  if (count === undefined || !Number.isInteger(count) || count < 0) throw new Error("Form 2441 Part III requires a nonnegative integer qualifyingIndividuals count");
  if (count === 0 && eligible && incurred.gt(0)) throw new Error("Form 2441 positive qualified expenses conflict with no qualifyingIndividuals");
  let treatedAsUnmarried = false;
  let useSpouseIncome = joint || separate;
  if (separate) {
    const apart = knownBoolean(facts.spouseLivedApartLast6Months, "spouseLivedApartLast6Months");
    const home = knownBoolean(facts.paidOverHalfHomeCost, "paidOverHalfHomeCost");
    const residence = knownBoolean(facts.qualifyingPersonMainHomeOverHalfYear, "qualifyingPersonMainHomeOverHalfYear");
    treatedAsUnmarried = apart && home && residence;
    useSpouseIncome = !treatedAsUnmarried;
  } else if (joint && knownBoolean(facts.spouseDiedDuringYear, "spouseDiedDuringYear")) {
    // Pub503 permits an actual surviving-spouse election, not an assumed zero.
    useSpouseIncome = knownBoolean(facts.useDeceasedSpouseEarnedIncome, "useDeceasedSpouseEarnedIncome");
  }
  const otherIncome = useSpouseIncome
    ? roundDollar(amount(facts.spouseEarnedIncome, "spouseEarnedIncome", true)) : primaryIncome;
  const cap = new Decimal(taxYear === 2026 ? (separate && useSpouseIncome ? "3750" : "7500") : (separate && useSpouseIncome ? "2500" : "5000"));

  const audit = new AuditTrail();
  const record = (id: string, description: string, value: Decimal, formula: string) => audit.record("Form 2441", id, description, value, formula);
  const line12 = record("12", "Current dependent-care benefits not in wages", roundDollar(sum(
    ...employeeSources.map((source) => source.currentBenefitsNotInWages), ...businessSources.map((source) => source.benefitsReceived))), "Sum actual current benefits after removing amounts already included in W2 Box1; aggregate cents before rounding");
  const line13 = record("13", "Prior-year grace-period benefits used", roundDollar(sum(
    ...employeeSources.map((source) => source.priorYearCarryoverUsed), ...businessSources.map((source) => source.priorYearCarryoverUsed))), "Actual prior-year carryover used during this year's permitted grace period");
  const line14 = record("14", "Benefits forfeited or carried forward", roundDollar(sum(
    ...employeeSources.map((source) => source.forfeited.plus(source.carriedForward)))), "Actual forfeitures and next-year carryforward already included in line12");
  const line15 = record("15", "Net benefits", line12.plus(line13).minus(line14), "Line12+line13-line14");
  record("16", "Qualified expenses incurred", incurred, "Actual incurred expenses regardless of payment date");
  const line17 = record("17", "Expense-limited benefits", Decimal.min(line15, incurred), "min(line15,line16)");
  record("18", "Taxpayer PartIII earned income", primaryIncome, "Signed actual PartIII earned-income worksheet, excluding line12 benefits");
  record("19", "Applicable second earned-income limit", otherIncome, useSpouseIncome ? "Separate spouse PartIII worksheet" : "Repeat taxpayer amount under actual filing-status/surviving-spouse rules");
  const line20 = record("20", "Earned-income-limited benefits", eligible ? zeroFloor(Decimal.min(line17, primaryIncome, otherIncome)) : new Decimal(0), "max(0,min(line17,line18,line19)); zero for known exclusion ineligibility");
  const line21 = record("21", "Actual plan and statutory limit", Decimal.min(planLimit, cap), `min(actual plan limit,${taxYear} statutory cap ${cap})`);
  const line22 = record("22", "Self-employed dependent-care benefits", roundDollar(sum(...businessSources.map((source) => source.benefitsReceived.plus(source.priorYearCarryoverUsed)))), "Actual sole-proprietorship/partnership benefits included in lines12 and13");
  const line23 = record("23", "Employee benefits", line15.minus(line22), "Line15-line22");
  const actualEmployeeBenefits = roundDollar(sum(...employeeSources.map((source) =>
    source.currentBenefitsNotInWages.plus(source.priorYearCarryoverUsed).minus(source.forfeited).minus(source.carriedForward))));
  if (businessSources.length > 0 && !line23.eq(actualEmployeeBenefits)) {
    throw new Error("Form 2441 source rounding does not reconcile employee and business benefits; an actual consistent form-source allocation is required");
  }
  const deductibleBenefits = record("24", "Deductible business benefits", Decimal.min(line20, line21, line22), "min(line20,line21,line22); requires matching source allocations");
  const excludedBenefits = record("25", "Excluded employee benefits", zeroFloor(Decimal.min(line20, line21).minus(deductibleBenefits)), "max(0,min(line20,line21)-line24)");
  const taxableBenefits = record("26", "Additional taxable employee benefits", zeroFloor(line23.minus(excludedBenefits)), "max(0,line23-line25), additional Form1040line1e after Box1 amounts were removed on line12");
  const line27 = record("27", "Credit expense cap", new Decimal(count === 0 ? "0" : count === 1 ? "3000" : "6000"), "Actual qualifying-person count; zero when no qualifying persons");
  const totalBenefitsApplied = record("28", "Deducted and excluded benefits", deductibleBenefits.plus(excludedBenefits), "Line24+line25");
  const line29 = record("29", "Remaining credit expense cap", line27.minus(totalBenefitsApplied), "Line27-line28; a nonpositive result bars current-year expense credit");
  if (creditExpenses.plus(totalBenefitsApplied).gt(incurred)) throw new Error("Form 2441 expense coordination would double-count benefits or exceed incurred expenses");
  record("30", "Paid expenses eligible for current-year credit", creditExpenses, "Actual current-year paid eligible expenses after excluding line28 benefits and expenses claimed elsewhere");
  const qualifyingCreditExpenses = record("31", "Expense base for PartII line3", zeroFloor(Decimal.min(line29, creditExpenses)), "max(0,min(line29,line30)); PartII eligibility and other limits still apply");

  const allocatedIds = new Set<string>();
  const deductionAllocations = allocations.map((allocation) => {
    const id = identity(allocation, joint);
    if (allocatedIds.has(id.sourceId)) throw new Error("Form 2441 duplicate deduction allocation source");
    allocatedIds.add(id.sourceId);
    const schedule = sourceSchedule(allocation.schedule);
    const source = businessSources.find((entry) => entry.sourceId === id.sourceId);
    if (!source || source.owner !== id.owner || source.schedule !== schedule) throw new Error("Form 2441 deduction allocation owner/schedule does not match its business source");
    const allocated = amount(allocation.amount, `${id.sourceId}.deductionAllocation`);
    if (!allocated.isInteger()) throw new Error("Form 2441 deduction allocations require actual whole-dollar amounts");
    if (allocated.gt(roundDollar(source.benefitsReceived.plus(source.priorYearCarryoverUsed)))) throw new Error("Form 2441 deduction allocation exceeds its business source benefits");
    return { ...id, schedule, amount: allocated };
  });
  if (!sum(...deductionAllocations.map((allocation) => allocation.amount)).eq(deductibleBenefits)) throw new Error("Form 2441 deduction allocations must reconcile exactly to line 24");

  const alreadyIncludedInWages = sum(...employeeSources.map((source) => source.alreadyIncludedInWages));
  audit.record("Form 2441 Source Reconciliation", "already_in_wages", "Benefits already in W2 Box1", alreadyIncludedInWages, "Actual source amounts subtracted before line12; never added to line1e again");
  audit.record("Form 2441 Source Reconciliation", "reported_employee_benefits", "Reported employee benefits", sum(...employeeSources.map((source) => source.benefitsReported)), "Exact source totals before form rounding");
  return { taxYear, sourceFactsVerified: true, treatedAsUnmarried,
    requiresForm2441: employeeSources.some((source) => source.benefitsReported.gt(0) || source.priorYearCarryoverUsed.gt(0)) || businessSources.some((source) => source.benefitsReceived.gt(0) || source.priorYearCarryoverUsed.gt(0)),
    alreadyIncludedInWages, deductibleBenefits, excludedBenefits, taxableBenefits,
    unallowedBusinessBenefits: zeroFloor(line22.minus(deductibleBenefits)), totalBenefitsApplied, qualifyingCreditExpenses,
    employeeSources, businessSources, deductionAllocations, lines: audit.getLines() };
}
