import type { FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { Form8839ChildSchema } from "@/models/inputs";
import { resolveForm8839PriorBenefits } from "@/engine/forms/form-8839-prior-benefits";
import { buildGuidedAdoptionHistory, type AdoptionPriorBenefitHistoryData } from "./guided-adoption-prior-benefits";

export interface AdoptionChildData {
  childFirstName?: string; childLastName?: string; childBirthYear?: string; childIdentifyingNumber?: string;
  childPermanentlyDisabled?: boolean | null; isSpecialNeeds?: boolean | null; isForeignAdoption?: boolean | null;
  adoptionFinalized?: boolean | null; adoptionFinalizedYear?: string;
  expensesConfirmed?: boolean | null; expensesByYear?: { year: string; amount: string }[];
  employerBenefits?: string; employerPlanQualified?: boolean | null;
  priorYearCreditsClaimed?: string; priorYearExclusionsClaimed?: string; priorYearForeignBenefits?: string;
  priorYearForeignBenefitHistory?: AdoptionPriorBenefitHistoryData;
}
export interface AdoptionCreditData {
  children: AdoptionChildData[];
  eligibilityConfirmed?: boolean | null;
  foreignEarnedIncomeExclusion?: string; foreignHousingExclusion?: string; possessionIncomeExclusion?: string;
  exclusionMagi?: string;
  carryforwardHistoryConfirmed?: boolean | null; carryforwardReconciled2025?: boolean | null;
  carryforwards?: { originTaxYear: string; amount: string }[];
}
const present = (value: string | undefined) => !!value?.trim();
function actualAmount(value: string | undefined, signed = false): boolean {
  if (!present(value)) return false;
  try { const parsed = parseGuidedCurrency(value); return signed || parsed.gte(0); } catch { return false; }
}
function amount(value: string | undefined): string { parseGuidedCurrency(value); return (value ?? "").trim().replace(/,/g, ""); }
function year(value: string | undefined, latest: number): boolean { return !!value && /^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= latest; }

export function adoptionFactErrors(data: AdoptionCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data?.children.length) return errors;
  const currentYear = taxYear ?? 0;
  if (typeof data.eligibilityConfirmed !== "boolean") errors.adoptionEligibility = "Confirm actual adoption credit and exclusion eligibility";
  if (filingStatus === "mfs" && data.eligibilityConfirmed !== false) errors.adoptionMfs = "Married-filing-separately adoption exceptions need a separately reviewed worksheet";
  for (const field of ["foreignEarnedIncomeExclusion", "foreignHousingExclusion", "possessionIncomeExclusion"] as const) if (!actualAmount(data[field])) errors[`adoption-${field}`] = "Enter each actual adoption MAGI adjustment, including zero";
  if (present(data.exclusionMagi) && !actualAmount(data.exclusionMagi, true)) errors.adoptionExclusionMagi = "Enter the actual Form 8839 employer-benefit exclusion MAGI worksheet amount";
  if (data.carryforwardHistoryConfirmed !== true) errors.adoptionHistory = "Review actual prior adoption-credit carryforwards, including a confirmed empty history";
  const ids = new Set<string>();
  data.children.forEach((child, index) => {
    const key = `adoption-${index}`;
    const id = child.childIdentifyingNumber?.replace(/-/g, "").trim() ?? "";
    if (!child.childFirstName?.trim() || !child.childLastName?.trim() || !/^\d{9}$/.test(id) || ids.has(id)) errors[`${key}-identity`] = "Enter each child's actual first/last name and unique SSN, ATIN or ITIN";
    ids.add(id);
    if (!year(child.childBirthYear, currentYear)) errors[`${key}-birthYear`] = "Enter the child's actual birth year";
    for (const field of ["childPermanentlyDisabled", "isSpecialNeeds", "isForeignAdoption", "adoptionFinalized", "employerPlanQualified"] as const) if (typeof child[field] !== "boolean") errors[`${key}-${field}`] = "Confirm each actual disability, adoption and employer-plan fact";
    if (child.adoptionFinalized && (!year(child.adoptionFinalizedYear, currentYear) || Number(child.adoptionFinalizedYear) < Number(child.childBirthYear))) errors[`${key}-finality`] = "Enter the actual finality year, on or after birth and no later than this return";
    if (child.adoptionFinalized === false && present(child.adoptionFinalizedYear)) errors[`${key}-finality`] = "Clear the finality year or correct the answer that the adoption was not finalized";
    if (child.expensesConfirmed !== true || !child.expensesByYear) errors[`${key}-expenses`] = "Confirm the complete actual unreimbursed expense history, including no expenses if applicable";
    const years = new Set<string>();
    for (const expense of child.expensesByYear ?? []) {
      if (!year(expense.year, currentYear) || years.has(expense.year) || !actualAmount(expense.amount)) errors[`${key}-expenses`] = "Enter one actual nonnegative expense total per calendar year";
      years.add(expense.year);
    }
    for (const field of ["employerBenefits", "priorYearCreditsClaimed", "priorYearExclusionsClaimed"] as const) if (!actualAmount(child[field])) errors[`${key}-${field}`] = "Enter actual benefits and prior credit/exclusion usage, including zero";
    if ((actualAmount(child.employerBenefits) && parseGuidedCurrency(child.employerBenefits).gt(0)) || (child.isSpecialNeeds && child.employerPlanQualified)
      || child.priorYearForeignBenefitHistory || (actualAmount(child.priorYearForeignBenefits) && parseGuidedCurrency(child.priorYearForeignBenefits).gt(0))) {
      if (!actualAmount(data.exclusionMagi, true)) errors.adoptionExclusionMagi = "Enter the actual Form 8839 employer-benefit exclusion MAGI worksheet amount";
    }
    if (child.isForeignAdoption && !actualAmount(child.priorYearForeignBenefits)) errors[`${key}-foreignBenefits`] = "Enter actual prior-year foreign-adoption employer benefits, including zero";
    if (present(child.priorYearForeignBenefits) && !actualAmount(child.priorYearForeignBenefits)) errors[`${key}-foreignBenefits`] = "Enter the actual nonnegative prior-year foreign-adoption benefits";
  });
  const origins = new Set<string>();
  for (const carry of data.carryforwards ?? []) {
    if (!year(carry.originTaxYear, currentYear - 1) || origins.has(carry.originTaxYear) || !actualAmount(carry.amount)) errors.adoptionCarryforward = "Enter one actual unused-credit amount per prior origin year";
    origins.add(carry.originTaxYear);
    if (taxYear === 2026 && actualAmount(carry.amount) && parseGuidedCurrency(carry.amount).gt(0) && data.carryforwardReconciled2025 !== true) errors.adoptionCarryforward = "Confirm carryforwards reconcile to the corrected 2025 refundable-credit worksheet";
  }
  if (!Object.keys(errors).length && data.children.some(child => child.priorYearForeignBenefitHistory || (actualAmount(child.priorYearForeignBenefits) && parseGuidedCurrency(child.priorYearForeignBenefits).gt(0)))) {
    try {
      if (!filingStatus) throw new Error("Confirm the actual filing status for historical adoption sources");
      const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
      const middleInitial = personal?.middleName?.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
      resolveForm8839PriorBenefits({ taxYear: currentYear, filingStatus: statuses[filingStatus], eligibilityConfirmed: data.eligibilityConfirmed ?? undefined,
        sourceTaxpayer: personal ? { primary: { firstName: [personal.firstName.trim(), middleInitial].filter(Boolean).join(" "), lastName: personal.lastName, ssn: personal.ssn },
          ...(filingStatus === "mfj" && personal.spouse ? { spouse: personal.spouse } : {}) } : undefined,
        children: mapAdoptionChildren(data).map(child => Form8839ChildSchema.parse(child)) });
    } catch (error) { errors.adoptionPriorBenefits = error instanceof Error ? error.message : "Reconcile the actual historical adoption sources"; }
  }
  return errors;
}
export function buildAdoptionInput(data: AdoptionCreditData | undefined, taxYear?: number | null, status?: FilingStatus | null, personal?: PersonalInfoData) {
  if (!data?.children.length) return undefined;
  const errors = adoptionFactErrors(data, taxYear, status, personal);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    eligibilityConfirmed: data.eligibilityConfirmed as boolean,
    foreignEarnedIncomeExclusion: amount(data.foreignEarnedIncomeExclusion), foreignHousingExclusion: amount(data.foreignHousingExclusion), possessionIncomeExclusion: amount(data.possessionIncomeExclusion),
    ...(present(data.exclusionMagi) ? { exclusionMagi: amount(data.exclusionMagi) } : {}),
    carryforwards: (data.carryforwards ?? []).map((entry) => ({ originTaxYear: Number(entry.originTaxYear), amount: amount(entry.amount) })),
    carryforwardReconciled2025: data.carryforwardReconciled2025 ?? undefined,
    children: mapAdoptionChildren(data),
  };
}
function mapAdoptionChildren(data: AdoptionCreditData) {
  return data.children.map((child) => ({
      childName: `${child.childFirstName?.trim()} ${child.childLastName?.trim()}`, childFirstName: child.childFirstName?.trim(), childLastName: child.childLastName?.trim(), childBirthYear: Number(child.childBirthYear), childIdentifyingNumber: child.childIdentifyingNumber?.trim(), childPermanentlyDisabled: child.childPermanentlyDisabled as boolean,
      isSpecialNeeds: child.isSpecialNeeds as boolean, isForeignAdoption: child.isForeignAdoption as boolean,
      adoptionBecameFinal: child.adoptionFinalized as boolean, adoptionFinalizedYear: child.adoptionFinalized ? Number(child.adoptionFinalizedYear) : null,
      expensesByYear: (child.expensesByYear ?? []).map((entry) => ({ year: Number(entry.year), amount: amount(entry.amount) })),
      employerBenefits: amount(child.employerBenefits), employerPlanQualified: child.employerPlanQualified as boolean,
      priorYearCreditsClaimed: amount(child.priorYearCreditsClaimed), priorYearExclusionsClaimed: amount(child.priorYearExclusionsClaimed),
      ...(present(child.priorYearForeignBenefits) ? { priorYearForeignBenefits: amount(child.priorYearForeignBenefits) } : {}),
      ...(child.priorYearForeignBenefitHistory ? { priorYearForeignBenefitHistory: buildGuidedAdoptionHistory(child.priorYearForeignBenefitHistory) } : {}),
    }));
}
