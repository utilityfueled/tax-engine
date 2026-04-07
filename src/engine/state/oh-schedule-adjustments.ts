/**
 * Ohio Schedule of Adjustments — Additions and Deductions to Federal AGI.
 * Spec: spec/state/oh-schedule-adjustments.yaml
 *
 * Computes the additions to and deductions from federal AGI that produce Ohio
 * adjusted gross income. The total additions (line 14) flow to IT 1040 line 2a;
 * the total deductions (line 47) flow to IT 1040 line 2b.
 *
 * Key computation: business income deduction (line 15) allows the first $250,000
 * ($125,000 MFS) of qualifying business income to be deducted. Excess is taxed
 * at the flat 3% business rate on IT 1040 line 8b.
 */

import Decimal from "decimal.js";
import {
  OHIO_TAX_CONSTANTS,
  type FilingStatus,
  type OhioScheduleOfAdjustmentsYearConstants,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, sum, zeroFloor } from "@/utils/decimal.js";
export const OH_SCHEDULE_OF_ADJUSTMENTS_CONSTANTS: Record<
  number,
  OhioScheduleOfAdjustmentsYearConstants
> = {
  2024: OHIO_TAX_CONSTANTS[2024].scheduleAdjustments,
  2025: OHIO_TAX_CONSTANTS[2025].scheduleAdjustments,
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface Ohio529Contribution {
  /** Identifier for the beneficiary (for aggregation). */
  beneficiaryId: string;
  /** Amount contributed. */
  amount: Decimal | string | number;
}

export interface Ohio529Carryforward {
  /** Identifier for the beneficiary carrying unused deductions from prior years. */
  beneficiaryId: string;
  /** Unused prior-year deduction amount available this year. */
  amount: Decimal | string | number;
}

export interface OhioStableContribution {
  /** Identifier for the beneficiary (for aggregation). */
  beneficiaryId: string;
  /** Amount contributed. */
  amount: Decimal | string | number;
}

export interface OhioStableCarryforward {
  /** Identifier for the beneficiary carrying unused deductions from prior years. */
  beneficiaryId: string;
  /** Unused prior-year deduction amount available this year. */
  amount: Decimal | string | number;
}

export interface OhioPregnancyResourceCenterContribution {
  /** Identifier for the contributor, e.g. taxpayer or spouse. */
  contributorId: string;
  /** Qualifying contribution amount made during the allowed 2025 window. */
  amount: Decimal | string | number;
  /** Contribution date in YYYY-MM-DD format. Undated entries do not qualify. */
  contributionDate?: string;
}

export interface OhioHomebuyerPlusAccountEntry {
  /** Identifier for the contributor entitled to the deduction. */
  contributorId: string;
  /** Identifier for the Ohio Homebuyer Plus account. */
  accountId: string;
  /** Eligible annual deduction amount for this contributor/account combination. */
  amount: Decimal | string | number;
}

export interface OhioEducatorExpense {
  /** Identifier for the qualifying Ohio educator. */
  educatorId: string;
  /** Eligible unreimbursed educator expenses. */
  amount: Decimal | string | number;
}

export interface OhioCollegeGrantRoomAndBoardEntry {
  /** Identifier for the taxpayer, spouse, or dependent who received the grant. */
  recipientId: string;
  /** Only Pell grants and Ohio College Opportunity Grants qualify. */
  grantType: "federal_pell_grant" | "ohio_college_opportunity_grant";
  /** Portion of the grant included in federal AGI. */
  amountIncludedInFederalAgi: Decimal | string | number;
  /** Qualifying institution-furnished room and board expenses paid with the grant. */
  qualifyingRoomAndBoardExpenses: Decimal | string | number;
}

export interface OhioQualifiedOrganDonorExpense {
  /** Identifier for the taxpayer or spouse claiming the deduction. */
  donorId: string;
  /** Qualified organ donor expenses for that donor. */
  amount: Decimal | string | number;
}

export interface OhioScheduleOfAdjustmentsInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** Federal AGI (Ohio IT 1040 line 1), used by the medical expense worksheet. */
  federalAgi?: Decimal | string | number;

  // --- Additions ---

  /** Line 1: Non-Ohio state/local government interest and dividends. */
  nonOhioStateLocalInterest?: Decimal | string | number;
  /** Line 2: Employee benefit plan distributions with Ohio basis differences. */
  employeeBenefitPlanDistributions?: Decimal | string | number;
  /** Line 3: Lump sum credits from prior year. */
  lumpSumCreditsFromPriorYear?: Decimal | string | number;
  /** Line 4: Section 168(k) depreciation add-back. */
  depreciationAddBack?: Decimal | string | number;
  /** Line 5: Pass-through entity add-back. */
  pteAddBack?: Decimal | string | number;
  /** Line 6 / worksheet line 1: taxpayer medical savings account contributions. */
  medicalSavingsAccountTaxpayerContributions?: Decimal | string | number;
  /** Worksheet line 2: spouse medical savings account contributions (MFJ only). */
  medicalSavingsAccountSpouseContributions?: Decimal | string | number;
  /** Worksheet line 3: medical savings account earnings included in federal AGI. */
  medicalSavingsAccountEarnings?: Decimal | string | number;
  /** Worksheet line 5: medical savings account withdrawals used for nonmedical purposes. */
  medicalSavingsAccountNonmedicalWithdrawals?: Decimal | string | number;
  /** Lines 7-13: Other additions (combined). */
  otherAdditions?: Decimal | string | number;

  // --- Deductions ---

  /** Line 15: Qualifying business income (gross, before deduction cap). */
  qualifyingBusinessIncome?: Decimal | string | number;
  /** Official 2025 line 26 / legacy alias line 16: federal interest exempt from Ohio. */
  federalInterestExemptFromOhio?: Decimal | string | number;
  /** Official 2025 line 27 / legacy alias line 17: taxable Social Security benefits. */
  taxableSocialSecurity?: Decimal | string | number;
  /** Official 2025 line 28 / legacy alias line 18: state/municipal income tax refunds. */
  stateMunicipalTaxRefunds?: Decimal | string | number;
  /** Official 2025 line 32 / legacy alias line 19: military pay for active duty outside Ohio. */
  militaryPayOutsideOhio?: Decimal | string | number;
  /** Official 2025 line 34 / legacy alias line 20: uniformed services retirement income. */
  uniformedServicesRetirement?: Decimal | string | number;
  /** Official 2025 lines 42-43 / legacy alias line 21: disability and survivorship benefits. */
  disabilitySurvivorshipBenefits?: Decimal | string | number;
  /** Official 2025 line 20: STABLE (Ohio ABLE) contributions by beneficiary. */
  stableContributions?: OhioStableContribution[];
  /** Official 2025 line 20: Unused STABLE contribution carryforward by beneficiary from prior years. */
  stableCarryforwards?: OhioStableCarryforward[];
  /** Line 22: Ohio 529 contributions by beneficiary. */
  ohio529Contributions?: Ohio529Contribution[];
  /** Line 22: Unused Ohio 529 contribution carryforward by beneficiary from prior years. */
  ohio529Carryforwards?: Ohio529Carryforward[];
  /** Line 24: eligible Ohio Homebuyer Plus annual amounts by contributor/account. */
  homebuyerPlusAccounts?: OhioHomebuyerPlusAccountEntry[];
  /** Official 2025 line 25: qualifying contributions to pregnancy resource centers. */
  pregnancyResourceCenterContributions?: OhioPregnancyResourceCenterContribution[];
  /** Official 2025 line 38: Pell/OCOG amounts used to pay qualifying room and board. */
  collegeGrantRoomAndBoardEntries?: OhioCollegeGrantRoomAndBoardEntry[];
  /** Official 2025 line 39: qualifying Ohio educator expenses. */
  ohioEducatorExpenses?: OhioEducatorExpense[];
  /** Official 2025 line 40 / 2024 line 39: ODHE rural practice incentive repayments. */
  ruralPracticeIncentiveRepayments?: Decimal | string | number;
  /** Official 2025 line 41 / 2024 line 40: ODHE grant payments for adopted students. */
  adoptedStudentGrantPayments?: Decimal | string | number;
  /** Official 2025 line 46 / 2024 line 45: qualified organ donor expenses. */
  qualifiedOrganDonorExpenses?: OhioQualifiedOrganDonorExpense[];
  /** Medical worksheet line 1: insurance premiums paid while not eligible for Medicare/employer-paid coverage. */
  medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility?:
    | Decimal
    | string
    | number;
  /** Medical worksheet line 2: unreimbursed long-term care insurance premiums. */
  medicalLongTermCareInsurancePremiums?: Decimal | string | number;
  /** Medical worksheet line 3: insurance premiums paid while eligible for Medicare/employer-paid coverage. */
  medicalInsurancePremiumsDuringMedicareOrEmployerEligibility?:
    | Decimal
    | string
    | number;
  /** Medical worksheet line 4: medical care expenses excluding insurance premiums. */
  medicalCareExpenses?: Decimal | string | number;
  /** Lines 23-35: Other deductions (combined). */
  otherDeductions?: Decimal | string | number;
}

export interface OhioScheduleOfAdjustmentsResult {
  // Additions
  line1_nonOhioStateLocalInterest: Decimal;
  line2_employeeBenefitPlanDistributions: Decimal;
  line3_lumpSumCreditsFromPriorYear: Decimal;
  line4_depreciationAddBack: Decimal;
  line5_pteAddBack: Decimal;
  line6_medicalSavingsAccountAddBack: Decimal;
  line6to13_otherAdditions: Decimal;
  line14_totalAdditions: Decimal;

  // Deductions
  line15_businessIncomeDeduction: Decimal;
  line26_federalInterestExempt: Decimal;
  line16_federalInterestExempt: Decimal;
  line27_socialSecurityDeduction: Decimal;
  line17_socialSecurityDeduction: Decimal;
  line28_stateTaxRefundDeduction: Decimal;
  line18_stateTaxRefundDeduction: Decimal;
  line32_militaryPayDeduction: Decimal;
  line19_militaryPayDeduction: Decimal;
  line20_stableDeduction: Decimal;
  line34_uniformedServicesRetirement: Decimal;
  line20_uniformedServicesRetirement: Decimal;
  line42to43_disabilitySurvivorshipBenefits: Decimal;
  line21_disabilitySurvivorshipBenefits: Decimal;
  line22_ohio529Deduction: Decimal;
  line24_homebuyerPlusDeduction: Decimal;
  line25_pregnancyResourceCenterDeduction: Decimal;
  line37_ohio529Deduction: Decimal;
  line38_collegeGrantRoomAndBoardDeduction: Decimal;
  line39_educatorExpensesDeduction: Decimal;
  line40_ruralPracticeIncentiveRepayments: Decimal;
  line41_adoptedStudentGrantPayments: Decimal;
  line43_medicalHealthCareExpensesDeduction: Decimal;
  line44_medicalHealthCareExpensesDeduction: Decimal;
  line44_medicalSavingsAccountDeduction: Decimal;
  line45_medicalSavingsAccountDeduction: Decimal;
  line45_qualifiedOrganDonorExpenses: Decimal;
  line46_qualifiedOrganDonorExpenses: Decimal;
  line23to35_otherDeductions: Decimal;
  line36_totalDeductions: Decimal;
  line47_totalDeductions: Decimal;

  /** Business income exceeding the deduction cap → flows to IT 1040 line 6. */
  taxableBusinessIncome: Decimal;

  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBusinessIncomeDeduction(
  qualifyingIncome: Decimal,
  filingStatus: FilingStatus,
  constants: OhioScheduleOfAdjustmentsYearConstants
): { deduction: Decimal; taxableExcess: Decimal } {
  if (qualifyingIncome.lessThanOrEqualTo(0)) {
    return { deduction: new Decimal(0), taxableExcess: new Decimal(0) };
  }

  const cap =
    filingStatus === "married_filing_separately"
      ? constants.businessIncomeDeductionCap.married_filing_separately
      : constants.businessIncomeDeductionCap.default;

  const deduction = min(qualifyingIncome, cap);
  const taxableExcess = zeroFloor(qualifyingIncome.minus(cap));

  return { deduction, taxableExcess };
}

function computePerBeneficiaryDeduction(
  contributions:
    | Ohio529Contribution[]
    | OhioStableContribution[]
    | undefined,
  carryforwards:
    | Ohio529Carryforward[]
    | OhioStableCarryforward[]
    | undefined,
  maxPerBeneficiary: Decimal
): Decimal {
  if (
    (!contributions || contributions.length === 0) &&
    (!carryforwards || carryforwards.length === 0)
  ) {
    return new Decimal(0);
  }

  // Aggregate current-year contributions and prior-year carryforwards by beneficiary,
  // then apply the annual per-beneficiary cap.
  const byBeneficiary = new Map<string, Decimal>();
  for (const entry of contributions ?? []) {
    const current = byBeneficiary.get(entry.beneficiaryId) ?? new Decimal(0);
    byBeneficiary.set(entry.beneficiaryId, current.plus(d(entry.amount)));
  }
  for (const entry of carryforwards ?? []) {
    const current = byBeneficiary.get(entry.beneficiaryId) ?? new Decimal(0);
    byBeneficiary.set(entry.beneficiaryId, current.plus(d(entry.amount)));
  }

  // Cap each beneficiary at the max and sum
  let total = new Decimal(0);
  for (const amount of byBeneficiary.values()) {
    total = total.plus(min(amount, maxPerBeneficiary));
  }

  return total;
}

function computeMedicalSavingsAccountWorksheet(
  input: OhioScheduleOfAdjustmentsInput,
  constants: OhioScheduleOfAdjustmentsYearConstants,
): {
  taxpayerContribution: Decimal;
  spouseContribution: Decimal;
  earnings: Decimal;
  totalAvailable: Decimal;
  nonmedicalWithdrawals: Decimal;
  deduction: Decimal;
  addBack: Decimal;
} {
  const taxpayerContribution = min(
    d(input.medicalSavingsAccountTaxpayerContributions),
    constants.medicalSavingsAccountContributionCap,
  );
  const spouseContribution =
    input.filingStatus === "married_filing_jointly"
      ? min(
          d(input.medicalSavingsAccountSpouseContributions),
          constants.medicalSavingsAccountContributionCap,
        )
      : new Decimal(0);
  const earnings = d(input.medicalSavingsAccountEarnings);
  const nonmedicalWithdrawals = d(input.medicalSavingsAccountNonmedicalWithdrawals);
  const totalAvailable = taxpayerContribution.plus(spouseContribution).plus(earnings);

  return {
    taxpayerContribution,
    spouseContribution,
    earnings,
    totalAvailable,
    nonmedicalWithdrawals,
    deduction: zeroFloor(totalAvailable.minus(nonmedicalWithdrawals)),
    addBack: zeroFloor(nonmedicalWithdrawals.minus(totalAvailable)),
  };
}

function computeMedicalHealthCareExpensesWorksheet(
  input: OhioScheduleOfAdjustmentsInput,
): {
  premiumsBeforeEligibility: Decimal;
  longTermCarePremiums: Decimal;
  premiumsDuringEligibility: Decimal;
  medicalCareExpenses: Decimal;
  thresholdBaseAgi: Decimal;
  threshold: Decimal;
  thresholdedExpenses: Decimal;
  deduction: Decimal;
} {
  const premiumsBeforeEligibility = d(
    input.medicalInsurancePremiumsBeforeMedicareOrEmployerEligibility,
  );
  const longTermCarePremiums = d(input.medicalLongTermCareInsurancePremiums);
  const premiumsDuringEligibility = d(
    input.medicalInsurancePremiumsDuringMedicareOrEmployerEligibility,
  );
  const medicalCareExpenses = d(input.medicalCareExpenses);
  const thresholdBaseAgi = Decimal.max(d(input.federalAgi), new Decimal(0));
  const threshold = thresholdBaseAgi.mul("0.075");
  const thresholdedExpenses = zeroFloor(
    premiumsDuringEligibility.plus(medicalCareExpenses).minus(threshold),
  );

  return {
    premiumsBeforeEligibility,
    longTermCarePremiums,
    premiumsDuringEligibility,
    medicalCareExpenses,
    thresholdBaseAgi,
    threshold,
    thresholdedExpenses,
    deduction: premiumsBeforeEligibility.plus(longTermCarePremiums).plus(thresholdedExpenses),
  };
}

function computeCappedAggregateByKey<T extends { amount: Decimal | string | number }>(
  entries: T[] | undefined,
  getKey: (entry: T) => string,
  cap: Decimal,
): Decimal {
  if (!entries || entries.length === 0) {
    return new Decimal(0);
  }

  const byKey = new Map<string, Decimal>();
  for (const entry of entries) {
    const key = getKey(entry);
    const current = byKey.get(key) ?? new Decimal(0);
    byKey.set(key, current.plus(d(entry.amount)));
  }

  let total = new Decimal(0);
  for (const amount of byKey.values()) {
    total = total.plus(min(amount, cap));
  }

  return total;
}

function computeCollegeGrantRoomAndBoardDeduction(
  entries: OhioCollegeGrantRoomAndBoardEntry[] | undefined,
): Decimal {
  if (!entries || entries.length === 0) {
    return new Decimal(0);
  }

  return entries.reduce((total, entry) => {
    const includedInFederalAgi = Decimal.max(
      d(entry.amountIncludedInFederalAgi),
      new Decimal(0),
    );
    const qualifyingRoomAndBoardExpenses = Decimal.max(
      d(entry.qualifyingRoomAndBoardExpenses),
      new Decimal(0),
    );

    return total.plus(min(includedInFederalAgi, qualifyingRoomAndBoardExpenses));
  }, new Decimal(0));
}

function isIsoDateInWindow(
  value: string,
  window: { startInclusive: string; endExclusive: string },
): boolean {
  return value >= window.startInclusive && value < window.endExclusive;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function calculateOhioScheduleOfAdjustments(
  input: OhioScheduleOfAdjustmentsInput
): OhioScheduleOfAdjustmentsResult {
  const constants = OH_SCHEDULE_OF_ADJUSTMENTS_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(
      `Ohio Schedule of Adjustments constants not available for tax year ${input.taxYear}`
    );
  }

  const audit = new AuditTrail();

  // =========================================================================
  // ADDITIONS (lines 1–14)
  // =========================================================================

  const line1 = d(input.nonOhioStateLocalInterest);
  audit.record(
    "OH-SCHEDULE-ADJ", "1",
    "Non-Ohio state/local government interest and dividends",
    line1,
    "Interest from other states' municipal bonds included in federal AGI"
  );

  const line2 = d(input.employeeBenefitPlanDistributions);
  audit.record(
    "OH-SCHEDULE-ADJ", "2",
    "Employee benefit plan distributions",
    line2,
    "Pass-through input"
  );

  const line3 = d(input.lumpSumCreditsFromPriorYear);
  audit.record(
    "OH-SCHEDULE-ADJ", "3",
    "Lump sum credits from prior year",
    line3,
    "Pass-through input"
  );

  const line4 = d(input.depreciationAddBack);
  audit.record(
    "OH-SCHEDULE-ADJ", "4",
    "Section 168(k) depreciation add-back",
    line4,
    "5/6 of federal bonus depreciation in year 1"
  );

  const line5 = d(input.pteAddBack);
  audit.record(
    "OH-SCHEDULE-ADJ", "5",
    "Pass-through entity add-back",
    line5,
    "PTE tax deducted at entity level"
  );

  const medicalSavingsAccountWorksheet = computeMedicalSavingsAccountWorksheet(input, constants);
  const line6MedicalSavingsAccountAddBack = medicalSavingsAccountWorksheet.addBack;
  audit.record(
    "OH-SCHEDULE-ADJ", "6",
    "Medical savings account nonmedical withdrawals",
    line6MedicalSavingsAccountAddBack,
    "max(0, worksheet line 5 - worksheet line 4)",
    {
      "Worksheet line 1": medicalSavingsAccountWorksheet.taxpayerContribution,
      "Worksheet line 2": medicalSavingsAccountWorksheet.spouseContribution,
      "Worksheet line 3": medicalSavingsAccountWorksheet.earnings,
      "Worksheet line 4": medicalSavingsAccountWorksheet.totalAvailable,
      "Worksheet line 5": medicalSavingsAccountWorksheet.nonmedicalWithdrawals,
    }
  );

  const line6to13 = d(input.otherAdditions);
  audit.record(
    "OH-SCHEDULE-ADJ", "7-13",
    "Other additions",
    line6to13,
    "Sum of other uncommon additions"
  );

  const line14 = sum(line1, line2, line3, line4, line5, line6MedicalSavingsAccountAddBack, line6to13);
  audit.record(
    "OH-SCHEDULE-ADJ", "14",
    "Total additions",
    line14,
    "Sum of lines 1-13",
    {
      "Line 1": line1,
      "Line 4": line4,
      "Line 5": line5,
      "Line 6": line6MedicalSavingsAccountAddBack,
    }
  );

  // =========================================================================
  // DEDUCTIONS (lines 15–36)
  // =========================================================================

  // Line 15 — Business income deduction
  const qualifyingBusinessIncome = d(input.qualifyingBusinessIncome);
  const { deduction: bizDeduction, taxableExcess: taxableBizIncome } =
    computeBusinessIncomeDeduction(qualifyingBusinessIncome, input.filingStatus, constants);
  const line15 = bizDeduction;
  audit.record(
    "OH-SCHEDULE-ADJ", "15",
    "Business income deduction",
    line15,
    `min(qualifying business income, $${input.filingStatus === "married_filing_separately" ? "125,000" : "250,000"})`,
    {
      "Qualifying business income": qualifyingBusinessIncome,
      "Cap": input.filingStatus === "married_filing_separately"
        ? constants.businessIncomeDeductionCap.married_filing_separately
        : constants.businessIncomeDeductionCap.default,
      "Taxable excess": taxableBizIncome,
    }
  );

  // Official 2025 Line 25 — Pregnancy resource center contributions
  const pregnancyContributionWindow = constants.pregnancyResourceCenterContributionWindow;
  const qualifyingPregnancyContributions = input.pregnancyResourceCenterContributions?.filter(
    (entry) =>
      pregnancyContributionWindow !== null &&
      entry.contributionDate !== undefined &&
      isIsoDateInWindow(entry.contributionDate, pregnancyContributionWindow),
  );
  const line25 = computeCappedAggregateByKey(
    qualifyingPregnancyContributions,
    (entry) => entry.contributorId,
    new Decimal(750),
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "25",
    "Contributions to a pregnancy resource center",
    line25,
    pregnancyContributionWindow === null
      ? "$0 (no supported pregnancy resource center deduction window for this tax year)"
      : "Up to $750 per contributor for contributions dated from 2025-09-30 through 2025-12-31; undated entries are excluded",
    {
      "Contribution entries": (input.pregnancyResourceCenterContributions?.length ?? 0).toString(),
      "Qualifying dated entries": (qualifyingPregnancyContributions?.length ?? 0).toString(),
      "Cap per contributor": "750",
    }
  );

  // Official 2025 Line 26 — Federal interest exempt from Ohio
  const line16 = d(input.federalInterestExemptFromOhio);
  audit.record(
    "OH-SCHEDULE-ADJ", "26",
    "Federal interest and dividends exempt from Ohio",
    line16,
    "U.S. government obligations (Treasury, savings bonds)"
  );

  // Official 2025 Line 27 — Social Security deduction
  const line17 = d(input.taxableSocialSecurity);
  audit.record(
    "OH-SCHEDULE-ADJ", "27",
    "Taxable Social Security benefits deduction",
    line17,
    "Federal 1040 line 6b — Ohio does not tax Social Security"
  );

  // Official 2025 Line 28 — State/municipal tax refund deduction
  const line18 = d(input.stateMunicipalTaxRefunds);
  audit.record(
    "OH-SCHEDULE-ADJ", "28",
    "State/municipal income tax refund deduction",
    line18,
    "State/local tax refunds included in federal AGI (1099-G)"
  );

  // Official 2025 Line 32 — Military pay
  const line19 = d(input.militaryPayOutsideOhio);
  audit.record(
    "OH-SCHEDULE-ADJ", "32",
    "Military pay for active duty outside Ohio",
    line19,
    "R.C. 5747.01(A)(26)"
  );

  // Official 2025 Line 20 — STABLE contributions
  const line20Stable = computePerBeneficiaryDeduction(
    input.stableContributions,
    input.stableCarryforwards,
    constants.stableMaxPerBeneficiary,
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "20",
    "STABLE contributions deduction",
    line20Stable,
    "Up to $4,000 per beneficiary for STABLE contributions plus prior-year carryforward",
    {
      "Contribution entries": (input.stableContributions?.length ?? 0).toString(),
      "Carryforward entries": (input.stableCarryforwards?.length ?? 0).toString(),
      "Max per beneficiary": constants.stableMaxPerBeneficiary,
    }
  );

  // Official 2025 Line 34 — Uniformed services retirement
  const line20 = d(input.uniformedServicesRetirement);
  audit.record(
    "OH-SCHEDULE-ADJ", "34",
    "Uniformed services retirement income",
    line20,
    "R.C. 5747.01(A)(29)"
  );

  // Official 2025 Lines 42-43 — Disability and survivorship
  const line21 = d(input.disabilitySurvivorshipBenefits);
  audit.record(
    "OH-SCHEDULE-ADJ", "42-43",
    "Disability and survivorship benefits",
    line21,
    "R.C. 5747.01(A)(6)"
  );

  // Official 2025 Line 37 — Ohio 529 contributions
  const line22 = computePerBeneficiaryDeduction(
    input.ohio529Contributions,
    input.ohio529Carryforwards,
    constants.ohio529MaxPerBeneficiary,
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "37",
    "Ohio 529 plan contributions deduction",
    line22,
    "Up to $4,000 per beneficiary for Ohio CollegeAdvantage contributions plus prior-year carryforward",
    {
      "Contribution entries": (input.ohio529Contributions?.length ?? 0).toString(),
      "Carryforward entries": (input.ohio529Carryforwards?.length ?? 0).toString(),
      "Max per beneficiary": constants.ohio529MaxPerBeneficiary,
    }
  );

  const line24 = computeCappedAggregateByKey(
    input.homebuyerPlusAccounts,
    (entry) => `${entry.contributorId}::${entry.accountId}`,
    constants.homebuyerPlusMaxPerAccount,
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "24",
    "Ohio Homebuyer Plus accounts",
    line24,
    "Up to $5,000 per contributor per account",
    {
      "Account entries": (input.homebuyerPlusAccounts?.length ?? 0).toString(),
      "Cap per contributor/account": constants.homebuyerPlusMaxPerAccount,
    }
  );

  const line38 = computeCollegeGrantRoomAndBoardDeduction(
    input.collegeGrantRoomAndBoardEntries,
  );
  audit.record(
    "OH-SCHEDULE-ADJ",
    input.taxYear === 2024 ? "37" : "38",
    "Portion of certain college grants used to pay room and board",
    line38,
    "Sum of min(grant amount included in federal AGI, qualifying institution-furnished room and board expenses) across Pell and Ohio College Opportunity Grant entries",
    {
      "Grant entries": (input.collegeGrantRoomAndBoardEntries?.length ?? 0).toString(),
    },
  );

  // Official 2025 Line 39 — Ohio educator expenses
  const line39 = computeCappedAggregateByKey(
    input.ohioEducatorExpenses,
    (entry) => entry.educatorId,
    new Decimal(300),
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "39",
    "Ohio educator expenses",
    line39,
    "Up to $300 per qualifying Ohio educator",
    {
      "Expense entries": (input.ohioEducatorExpenses?.length ?? 0).toString(),
      "Cap per educator": "300",
    }
  );

  const line40 = d(input.ruralPracticeIncentiveRepayments);
  audit.record(
    "OH-SCHEDULE-ADJ",
    input.taxYear === 2024 ? "39" : "40",
    "Rural Practice Incentive Program repayments",
    line40,
    "ODHE rural practice incentive loan repayments included in federal AGI",
  );

  const line41 = d(input.adoptedStudentGrantPayments);
  audit.record(
    "OH-SCHEDULE-ADJ",
    input.taxYear === 2024 ? "40" : "41",
    "Grant payments for students who are adopted",
    line41,
    "ODHE grant payments for adopted students included in federal AGI",
  );

  const line45or46 = computeCappedAggregateByKey(
    input.qualifiedOrganDonorExpenses,
    (entry) => entry.donorId,
    new Decimal(10000),
  );
  const qualifiedOrganDonorLine = input.taxYear === 2024 ? "45" : "46";
  audit.record(
    "OH-SCHEDULE-ADJ",
    qualifiedOrganDonorLine,
    "Qualified organ donor expenses",
    line45or46,
    "Up to $10,000 per donor/taxpayer for qualified organ donation expenses",
    {
      "Expense entries": (input.qualifiedOrganDonorExpenses?.length ?? 0).toString(),
      "Cap per donor": "10000",
    }
  );

  const medicalHealthCareWorksheet = computeMedicalHealthCareExpensesWorksheet(
    input,
  );
  const line43or44 = medicalHealthCareWorksheet.deduction;
  const medicalHealthCareDeductionLine = input.taxYear === 2024 ? "43" : "44";
  audit.record(
    "OH-SCHEDULE-ADJ",
    medicalHealthCareDeductionLine,
    "Medical and health care expenses",
    line43or44,
    "Worksheet line 1 + line 2 + max(0, (line 3 + line 4) - 7.5% of max(0, federal AGI))",
    {
      "Worksheet line 1": medicalHealthCareWorksheet.premiumsBeforeEligibility,
      "Worksheet line 2": medicalHealthCareWorksheet.longTermCarePremiums,
      "Worksheet line 3": medicalHealthCareWorksheet.premiumsDuringEligibility,
      "Worksheet line 4": medicalHealthCareWorksheet.medicalCareExpenses,
      "Worksheet line 6": medicalHealthCareWorksheet.thresholdBaseAgi,
      "Worksheet line 7": medicalHealthCareWorksheet.threshold,
      "Worksheet line 8": medicalHealthCareWorksheet.thresholdedExpenses,
    },
  );

  const line45 = medicalSavingsAccountWorksheet.deduction;
  const medicalSavingsAccountDeductionLine = input.taxYear === 2024 ? "44" : "45";
  audit.record(
    "OH-SCHEDULE-ADJ", medicalSavingsAccountDeductionLine,
    "Medical savings account deduction",
    line45,
    "max(0, worksheet line 4 - worksheet line 5)",
    {
      "Worksheet line 1": medicalSavingsAccountWorksheet.taxpayerContribution,
      "Worksheet line 2": medicalSavingsAccountWorksheet.spouseContribution,
      "Worksheet line 3": medicalSavingsAccountWorksheet.earnings,
      "Worksheet line 4": medicalSavingsAccountWorksheet.totalAvailable,
      "Worksheet line 5": medicalSavingsAccountWorksheet.nonmedicalWithdrawals,
      "Contribution cap": constants.medicalSavingsAccountContributionCap,
    }
  );

  // Remaining uncommon deductions — aggregated pass-through
  const line23to35 = d(input.otherDeductions);
  audit.record(
    "OH-SCHEDULE-ADJ", "23,29-31,33,35-36",
    "Other deductions",
    line23to35,
    "Sum of other uncommon deductions"
  );

  // Official 2025 Line 47 — Total deductions
  const line47 = sum(
    line15,
    line25,
    line16,
    line17,
    line18,
    line19,
    line20Stable,
    line20,
    line21,
    line22,
    line24,
    line38,
    line39,
    line40,
    line41,
    line43or44,
    line45,
    line45or46,
    line23to35,
  );
  audit.record(
    "OH-SCHEDULE-ADJ", "47",
    "Total deductions",
    line47,
    "Sum of modeled deduction lines and aggregated uncommon deductions",
    {
      "Line 15 (biz)": line15,
      "Line 20 (STABLE)": line20Stable,
      "Line 24 (homebuyer plus)": line24,
      "Line 25 (pregnancy resource center)": line25,
      "Line 27 (SS)": line17,
      "Line 37 (529)": line22,
      [`Line ${input.taxYear === 2024 ? "37" : "38"} (college grants)`]: line38,
      "Line 39 (educator)": line39,
      [`Line ${input.taxYear === 2024 ? "39" : "40"} (rural practice)`]: line40,
      [`Line ${input.taxYear === 2024 ? "40" : "41"} (adopted student grant)`]: line41,
      [`Line ${qualifiedOrganDonorLine} (organ donor)`]: line45or46,
      [`Line ${medicalHealthCareDeductionLine} (medical)`]: line43or44,
    }
  );

  return {
    line1_nonOhioStateLocalInterest: line1,
    line2_employeeBenefitPlanDistributions: line2,
    line3_lumpSumCreditsFromPriorYear: line3,
    line4_depreciationAddBack: line4,
    line5_pteAddBack: line5,
    line6_medicalSavingsAccountAddBack: line6MedicalSavingsAccountAddBack,
    line6to13_otherAdditions: line6to13,
    line14_totalAdditions: line14,
    line15_businessIncomeDeduction: line15,
    line26_federalInterestExempt: line16,
    line16_federalInterestExempt: line16,
    line27_socialSecurityDeduction: line17,
    line17_socialSecurityDeduction: line17,
    line28_stateTaxRefundDeduction: line18,
    line18_stateTaxRefundDeduction: line18,
    line32_militaryPayDeduction: line19,
    line19_militaryPayDeduction: line19,
    line20_stableDeduction: line20Stable,
    line34_uniformedServicesRetirement: line20,
    line20_uniformedServicesRetirement: line20,
    line42to43_disabilitySurvivorshipBenefits: line21,
    line21_disabilitySurvivorshipBenefits: line21,
    line22_ohio529Deduction: line22,
    line24_homebuyerPlusDeduction: line24,
    line25_pregnancyResourceCenterDeduction: line25,
    line37_ohio529Deduction: line22,
    line38_collegeGrantRoomAndBoardDeduction: line38,
    line39_educatorExpensesDeduction: line39,
    line40_ruralPracticeIncentiveRepayments: line40,
    line41_adoptedStudentGrantPayments: line41,
    line43_medicalHealthCareExpensesDeduction:
      input.taxYear === 2024 ? line43or44 : new Decimal(0),
    line44_medicalHealthCareExpensesDeduction:
      input.taxYear === 2025 ? line43or44 : new Decimal(0),
    line44_medicalSavingsAccountDeduction: line45,
    line45_medicalSavingsAccountDeduction: line45,
    line45_qualifiedOrganDonorExpenses:
      input.taxYear === 2024 ? line45or46 : new Decimal(0),
    line46_qualifiedOrganDonorExpenses:
      input.taxYear === 2025 ? line45or46 : new Decimal(0),
    line23to35_otherDeductions: line23to35,
    line36_totalDeductions: line47,
    line47_totalDeductions: line47,
    taxableBusinessIncome: taxableBizIncome,
    lines: audit.getLines(),
  };
}
