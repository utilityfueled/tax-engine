import type { DependentCareBenefits } from "@/models/inputs.js";
import type { CareProviderData, FilingStatus, ScheduleCExpenseData, W2EntryData } from "./guided-interview-flow";
import type { BusinessSourceData } from "./guided-business-facts";
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { parseGuidedCurrency } from "./guided-currency";
import { hasEnteredAmount } from "./guided-required-facts";

type EmployeeSource = NonNullable<DependentCareBenefits["employeeBenefits"]>[number];
type BusinessSource = NonNullable<DependentCareBenefits["selfEmployedBenefits"]>[number];
type Allocation = NonNullable<DependentCareBenefits["deductionAllocations"]>[number];
export interface CareBenefitsData {
  sourceFactsConfirmed?: boolean | null;
  exclusionEligibilityConfirmed?: boolean | null;
  providers?: CareProviderData[];
  usesDeemedIncome?: boolean | null;
  employeeBenefits?: Array<Omit<EmployeeSource, "owner"> & { owner?: "primary" | "spouse" | "" }>;
  selfEmployedBenefits?: Array<Omit<BusinessSource, "owner" | "schedule"> & { owner?: "primary" | "spouse" | ""; schedule?: BusinessSource["schedule"] | "" }>;
  deductionAllocations?: Array<Omit<Allocation, "owner" | "schedule"> & { owner?: "primary" | "spouse" | ""; schedule?: Allocation["schedule"] | "" }>;
  planExclusionLimit?: string;
  qualifiedExpensesIncurred?: string;
  primaryEarnedIncome?: string;
  spouseEarnedIncome?: string;
  earnedIncomeWorksheetConfirmed?: boolean | null;
  spouseLivedApartLast6Months?: boolean | null;
  paidOverHalfHomeCost?: boolean | null;
  qualifyingPersonMainHomeOverHalfYear?: boolean | null;
  spouseDiedDuringYear?: boolean | null;
  useDeceasedSpouseEarnedIncome?: boolean | null;
  qualifyingIndividuals?: string;
  qualifiedExpensesPaidForCredit?: string;
  creditExpenseCoordinationConfirmed?: boolean | null;
}
export interface CareBenefitsContext { data?: CareBenefitsData; year?: number | null; sources?: CareBenefitSource[] }
export interface CareBenefitSource {
  sourceId: string;
  label: string;
  kind: "employee" | "business";
  owner?: "primary" | "spouse";
  reportedBenefits?: string;
  reportedEmployeeBenefitPrograms?: string;
  schedule?: "schedule-c" | "schedule-e" | "schedule-f";
}
export function guidedCareBenefitSources(w2s?: W2EntryData[], business?: BusinessSourceData, expenses?: ScheduleCExpenseData): CareBenefitSource[] {
  const sources: CareBenefitSource[] = (w2s ?? [])
    .filter(entry => hasEnteredAmount(entry.wages) || hasEnteredAmount(entry.federalWithheld))
    .map((entry, index) => ({ sourceId: `w2:${index}`, label: `W-2 ${index + 1}: ${entry.employerName}`,
      kind: "employee", reportedBenefits: entry.box10DependentCareBenefits,
      owner: entry.accountHolder === "primary" || entry.accountHolder === "spouse" ? entry.accountHolder : undefined }));
  if (business?.singleBusinessConfirmed === true) sources.push({ sourceId: "scheduleC", label: business.activityDescription || "Schedule C activity",
    kind: "business", schedule: "schedule-c", reportedEmployeeBenefitPrograms: expenses?.employeeBenefitPrograms, owner: business.accountHolder === "primary" || business.accountHolder === "spouse" ? business.accountHolder : undefined });
  return sources;
}

const statusMap = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
const amount = (value?: string) => hasEnteredAmount(value) ? parseGuidedCurrency(value).toFixed() : undefined;
const boolean = (value?: boolean | null) => typeof value === "boolean" ? value : undefined;
const owner = (value?: "primary" | "spouse" | "") => value === "primary" || value === "spouse" ? value : undefined;
const schedule = (value?: BusinessSource["schedule"] | "") => value === "schedule-c" || value === "schedule-e" || value === "schedule-f" ? value : undefined;

/** Normalize actual entries only. Validation below runs before these facts leave this helper. */
function sourceFacts(data: CareBenefitsData): DependentCareBenefits {
  return {
    sourceFactsConfirmed: boolean(data.sourceFactsConfirmed), exclusionEligibilityConfirmed: boolean(data.exclusionEligibilityConfirmed),
    usesDeemedIncome: boolean(data.usesDeemedIncome),
    providers: data.providers?.map(provider => ({ name: provider.name.trim(), address: provider.address.trim(),
      identifierType: provider.identifierType as NonNullable<DependentCareBenefits["providers"]>[number]["identifierType"],
      taxId: provider.taxId?.trim(), dueDiligenceStatement: provider.dueDiligenceStatement?.trim(),
      householdEmployee: provider.householdEmployee as boolean, amountPaid: amount(provider.amountPaid) as string })),
    employeeBenefits: data.employeeBenefits?.map(entry => ({ sourceId: entry.sourceId?.trim(), owner: owner(entry.owner),
      benefitsReported: amount(entry.benefitsReported), alreadyIncludedInWages: amount(entry.alreadyIncludedInWages),
      priorYearCarryoverUsed: amount(entry.priorYearCarryoverUsed), forfeited: amount(entry.forfeited), carriedForward: amount(entry.carriedForward) })),
    selfEmployedBenefits: data.selfEmployedBenefits?.map(entry => ({ sourceId: entry.sourceId?.trim(), owner: owner(entry.owner), schedule: schedule(entry.schedule),
      benefitsReceived: amount(entry.benefitsReceived), priorYearCarryoverUsed: amount(entry.priorYearCarryoverUsed), alreadyDeducted: amount(entry.alreadyDeducted) })),
    deductionAllocations: data.deductionAllocations?.map(entry => ({ sourceId: entry.sourceId?.trim(), owner: owner(entry.owner), schedule: schedule(entry.schedule), amount: amount(entry.amount) })),
    planExclusionLimit: amount(data.planExclusionLimit), qualifiedExpensesIncurred: amount(data.qualifiedExpensesIncurred),
    primaryEarnedIncome: amount(data.primaryEarnedIncome), spouseEarnedIncome: amount(data.spouseEarnedIncome),
    earnedIncomeWorksheetConfirmed: boolean(data.earnedIncomeWorksheetConfirmed),
    spouseLivedApartLast6Months: boolean(data.spouseLivedApartLast6Months), paidOverHalfHomeCost: boolean(data.paidOverHalfHomeCost),
    qualifyingPersonMainHomeOverHalfYear: boolean(data.qualifyingPersonMainHomeOverHalfYear),
    spouseDiedDuringYear: boolean(data.spouseDiedDuringYear), useDeceasedSpouseEarnedIncome: boolean(data.useDeceasedSpouseEarnedIncome),
    qualifyingIndividuals: data.qualifyingIndividuals && /^\d+$/.test(data.qualifyingIndividuals) ? Number(data.qualifyingIndividuals) : undefined,
    qualifiedExpensesPaidForCredit: amount(data.qualifiedExpensesPaidForCredit), creditExpenseCoordinationConfirmed: boolean(data.creditExpenseCoordinationConfirmed),
  };
}

export function careBenefitsFactErrors(data: CareBenefitsData | undefined, year?: number | null, status?: FilingStatus | null, sources: CareBenefitSource[] = []): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const source of sources.filter(source => source.kind === "employee")) {
    try {
      if (!hasEnteredAmount(source.reportedBenefits)) throw new Error("unknown");
      const value = parseGuidedCurrency(source.reportedBenefits);
      if (value.isNegative()) throw new Error("negative");
      if (value.gt(0) && !data?.employeeBenefits?.some(entry => entry.sourceId === source.sourceId)) errors[`care-benefits-${source.sourceId}`] = "Complete the actual benefit details for each W-2 with positive Box 10 benefits.";
    } catch { errors[`care-benefits-${source.sourceId}`] = "Enter the actual W-2 Box 10 amount, including a confirmed zero, before reconciling care benefits."; }
  }
  if (!data) return errors;
  if ((year !== 2025 && year !== 2026) || !status) errors.careBenefitsYearStatus = "Choose the actual tax year and filing status before calculating care benefits.";
  if (!Array.isArray(data.providers)) errors.careBenefitProviders = "Enter actual care provider records, or explicitly confirm no providers when no care expenses were incurred.";
  if (typeof data.usesDeemedIncome !== "boolean") errors.careBenefitsDeemedIncome = "Confirm whether the Part III income worksheets use substantiated student or incapacity deemed income.";
  for (const [index, provider] of (data.providers ?? []).entries()) {
    const key = `care-benefit-provider-${index}`;
    if (!provider.name?.trim() || !provider.address?.trim() || typeof provider.householdEmployee !== "boolean") errors[key] = "Enter the actual provider name, address and household employee status.";
    if (!["tin", "tax_exempt", "foreign_no_us_tin", "employer_furnished", "withheld"].includes(provider.identifierType)) errors[key] = "Choose the provider's actual identification status.";
    if (provider.identifierType === "tin" && !/^\d{9}$/.test(provider.taxId?.replace(/-/g, "") ?? "")) errors[key] = "Enter the provider's actual nine-digit tax ID.";
    if (provider.identifierType === "withheld" && !provider.dueDiligenceStatement?.trim()) errors[key] = "Record the actual efforts to obtain the withheld provider information.";
    try {
      if (!hasEnteredAmount(provider.amountPaid)) throw new Error("unknown");
      const value = parseGuidedCurrency(provider.amountPaid);
      if (value.isNegative() || (provider.identifierType === "employer_furnished" && (!value.isZero() || provider.householdEmployee !== false))) throw new Error("contradictory");
    } catch { errors[key] = "Enter the actual nonnegative provider payment; employer-furnished care uses the required zero entry and is not household employment."; }
  }
  const match = (entry: { sourceId?: string; owner?: string; schedule?: string; benefitsReported?: string }, kind: CareBenefitSource["kind"]) => {
    const matches = sources.filter(source => source.sourceId === entry.sourceId && source.kind === kind);
    const source = matches[0];
    if (matches.length !== 1 || !source || !source.owner || source.owner !== entry.owner || (kind === "business" && source.schedule !== entry.schedule)) {
      errors[`care-benefits-source-${entry.sourceId ?? "missing"}`] = "Select the actual benefit statement or business activity and match its recorded owner and schedule.";
    } else if (kind === "employee") {
      try {
        if (!hasEnteredAmount(source.reportedBenefits) || !hasEnteredAmount(entry.benefitsReported) || !parseGuidedCurrency(source.reportedBenefits).eq(parseGuidedCurrency(entry.benefitsReported))) throw new Error("mismatch");
      } catch { errors[`care-benefits-source-${entry.sourceId}`] = "Benefit amounts must reconcile exactly to the selected W-2 Box 10 source."; }
    }
  };
  for (const entry of data.employeeBenefits ?? []) match(entry, "employee");
  for (const entry of data.selfEmployedBenefits ?? []) {
    match(entry, "business");
    const source = sources.find(source => source.sourceId === entry.sourceId && source.kind === "business");
    try {
      if (!hasEnteredAmount(source?.reportedEmployeeBenefitPrograms) || !hasEnteredAmount(entry.alreadyDeducted)
        || parseGuidedCurrency(source?.reportedEmployeeBenefitPrograms).isNegative()
        || parseGuidedCurrency(entry.alreadyDeducted).gt(parseGuidedCurrency(source?.reportedEmployeeBenefitPrograms))) throw new Error("unreconciled");
    } catch { errors.careBenefitsBusinessExpense = "Enter the actual employee-benefit program expense in the business section and reconcile the care benefit deduction already included in it."; }
    if (entry.schedule === "schedule-e") errors.careBenefitsScheduleE = "Schedule E benefit deductions require additional actual self-employment, passive-activity and QBI source coordination before this branch can calculate.";
  }
  for (const entry of data.deductionAllocations ?? []) {
    match(entry, "business");
    if (entry.schedule === "schedule-e") errors.careBenefitsScheduleE = "Schedule E benefit deductions require additional actual self-employment, passive-activity and QBI source coordination before this branch can calculate.";
  }
  if (!Object.keys(errors).length) {
    try {
      const facts = sourceFacts(data);
      if (!facts.providers?.length && facts.qualifiedExpensesIncurred !== undefined && parseGuidedCurrency(facts.qualifiedExpensesIncurred).gt(0)) throw new Error("Record the actual providers for the care expenses incurred.");
      calculateForm2441Benefits({ taxYear: year as number, filingStatus: statusMap[status as FilingStatus], facts });
    } catch (error) { errors.careBenefitsFacts = error instanceof Error ? error.message : "Complete the actual dependent-care benefit facts."; }
  }
  return errors;
}

export function buildCareBenefitsInput(data: CareBenefitsData | undefined, year?: number | null, status?: FilingStatus | null, sources: CareBenefitSource[] = []): DependentCareBenefits | undefined {
  const errors = careBenefitsFactErrors(data, year, status, sources);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return data === undefined ? undefined : sourceFacts(data);
}

export function calculateGuidedCareBenefits(context: CareBenefitsContext, status?: FilingStatus | null) {
  const facts = buildCareBenefitsInput(context.data, context.year, status, context.sources);
  return facts ? calculateForm2441Benefits({ taxYear: context.year as number, filingStatus: statusMap[status as FilingStatus], facts }) : undefined;
}
