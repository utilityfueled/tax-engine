/**
 * Illinois Schedule M — Other Additions and Subtractions
 * Spec: spec/state/il-schedule-m.yaml
 *
 * Computes additions (Line 12 → IL-1040 Line 3) and subtractions
 * (Line 42 → IL-1040 Line 7) from federal AGI for Illinois purposes.
 *
 * Key computed items:
 * - 529 plan contributions: max $10,000 ($20,000 MFJ) for IL plans
 * - ABLE account contributions: max $10,000 ($20,000 MFJ)
 * - US government interest subtraction
 * - IL municipal bond interest subtraction
 */

import Decimal from "decimal.js";
import { sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import {
  IL_SCHEDULE_M_CONSTANTS as SHARED_IL_SCHEDULE_M_CONSTANTS,
  type FilingStatus,
  type IllinoisScheduleMConstants,
} from "@/models/constants.js";

export type ILScheduleMConstants = IllinoisScheduleMConstants;
export const IL_SCHEDULE_M_CONSTANTS = SHARED_IL_SCHEDULE_M_CONSTANTS;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ScheduleMInput {
  taxYear: number;
  filingStatus: FilingStatus;

  // Optional detail inputs for computed recapture amounts on Lines 7 and 9
  recapture529OutOfStateDetail?: {
    /** Total Illinois 529/ABLE deductions previously claimed for the transferred plan */
    priorDeductionsClaimed: Decimal;
    /** Prior-year recaptures already taken for that plan */
    priorYearRecaptures: Decimal;
    /** Current-year amount transferred from an IL plan to an out-of-state plan */
    transferAmount: Decimal;
  };
  recapture529NonqualifiedDetail?: {
    /** Total Illinois 529/ABLE deductions previously claimed for the withdrawn plan */
    priorDeductionsClaimed: Decimal;
    /** Prior-year recaptures already taken for that plan */
    priorYearRecaptures: Decimal;
    /** Current-year nonqualified withdrawal or refund */
    withdrawalAmount: Decimal;
  };

  // Step 2 — Additions
  /** Line 1: Child's federally tax-exempt interest/dividends (Form 8814) */
  childTaxExemptInterest: Decimal;
  /** Line 2: Distributive share additions from K-1-P/K-1-T */
  distributiveShareAdditions: Decimal;
  /** Line 3: Lloyd's plan of operation loss */
  lloydsLoss: Decimal;
  /** Line 4: Non-IL 529/530/ABLE plan earnings distributions */
  nonIL529Earnings: Decimal;
  /** Line 5: IL special depreciation addition (Form IL-4562) */
  ilDepreciationAddition: Decimal;
  /** Line 7: Recapture of 529/ABLE contributions transferred out of state */
  recapture529OutOfState: Decimal;
  /** Line 9: Recapture of 529/ABLE contributions for nonqualified withdrawals */
  recapture529Nonqualified: Decimal;
  /** Line 8: Student-Assistance Contribution Credit recapture */
  studentAssistanceCreditRecapture: Decimal;
  /** Line 11: Other additions (includes pass-through entity tax add-back) */
  otherAdditions: Decimal;

  // Step 3 — Subtractions (Lines 13-31)
  /** Line 13a: Total contributions to IL 529 plans (Bright Start, Bright Directions, College Illinois) */
  il529Contributions: Decimal;
  /** Line 14: Distributive share subtractions from K-1-P/K-1-T */
  distributiveShareSubtractions: Decimal;
  /** Line 15: Restoration of amounts under IRC Section 1341 */
  restorationClaimOfRight: Decimal;
  /** Line 16: Contributions to a job training project */
  jobTrainingContributions: Decimal;
  /** Line 17: Expenses related to federal credits or federally tax-exempt income */
  federalCreditRelatedExpenses: Decimal;
  /** Line 18: Medical debt relief (new 2025, PA 103-0647) */
  medicalDebtRelief: Decimal;
  /** Line 19: IL special depreciation subtraction (Form IL-4562) */
  ilDepreciationSubtraction: Decimal;
  /** Line 20a: Total contributions to IL ABLE accounts */
  ableContributions: Decimal;
  /** Line 21: Military pay earned while serving outside IL */
  militaryPay: Decimal;
  /** Line 22: US government interest (T-bills, savings bonds, agency interest) */
  usGovernmentInterest: Decimal;
  /** Line 23: August 1, 1969 valuation limitation from Illinois Schedule F */
  august1969ValuationLimitation?: Decimal;
  /** Line 24: River edge redevelopment zone and high impact business dividend subtraction */
  riverEdgeRedevelopmentZoneDividendSubtraction?: Decimal;
  /** Line 25: Recovery of items previously deducted (other state tax refunds) */
  recoveryOfItemsDeducted: Decimal;
  /** Line 26: Ridesharing money and other benefits */
  ridesharing: Decimal;
  /** Line 27: Life insurance, endowment, or annuity payment */
  lifeInsurancePayment: Decimal;
  /** Line 28: Lloyd's plan of operation income */
  lloydsIncome: Decimal;
  /** Line 29: IL pre-need funeral/burial/cemetery trust income */
  funeralTrustIncome: Decimal;
  /** Line 30: Health care provider loan repayment */
  healthCareProviderLoanRepayment: Decimal;
  /** Line 31: Nazi persecution reparations */
  naziPersecutionReparations: Decimal;

  // Step 3 — Subtractions (Lines 34-41, Page 3)
  /** Line 34: Interest on IL state/local government tax-exempt obligations (total 34a-34z) */
  ilBondInterest: Decimal;
  /** Line 35: Interest on non-US government bonds (Guam, PR, USVI, etc.) */
  nonUSGovernmentBondInterest: Decimal;
  /** Line 36: Child's US government/IL bond interest from Form 8814 */
  childUSGovernmentInterest: Decimal;
  /** Line 37: Railroad sick pay and railroad unemployment income */
  railroadIncome: Decimal;
  /** Line 38: Unjust imprisonment compensation */
  unjustImprisonmentCompensation: Decimal;
  /** Line 39: 529 distributions included in AGI due to claiming federal education credits */
  plan529DistributionsForCredits: Decimal;
  /** Line 40: Disallowed IRC 280E deductions for cannabis establishments */
  cannabisDisallowedDeductions: Decimal;
  /** Line 41: Fertility fraud award */
  fertilityFraudAward: Decimal;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface ScheduleMResult {
  /** Line 12: Total additions → IL-1040 Line 3 */
  totalAdditions: Decimal;
  /** Line 13: 529 contribution subtraction (after cap) */
  il529Subtraction: Decimal;
  /** Line 20: ABLE contribution subtraction (after cap) */
  ableSubtraction: Decimal;
  /** Line 32: Subtotal of Lines 13-31 */
  subtractionSubtotal: Decimal;
  /** Line 42: Total subtractions → IL-1040 Line 7 */
  totalSubtractions: Decimal;
  /** Audit trail */
  lines: CalculatedLine[];
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export function calculateScheduleM(input: ScheduleMInput): ScheduleMResult {
  const c = IL_SCHEDULE_M_CONSTANTS[input.taxYear];
  if (!c) {
    throw new Error(`IL Schedule M constants not available for tax year ${input.taxYear}`);
  }
  const supportsMedicalDebtRelief = input.taxYear >= 2025;

  const audit = new AuditTrail();
  const FORM = "Schedule M";
  const isMFJ = input.filingStatus === "married_filing_jointly";
  const capKey = isMFJ ? "mfj" : "other";

  const assertNonNegative = (line: string, label: string, amount: Decimal): void => {
    if (amount.isNegative()) {
      throw new Error(`Schedule M Line ${line} ${label} must be non-negative`);
    }
  };

  const validateDetailEntry = (line: "7" | "9", label: string, amount: Decimal): void => {
    if (amount.isNegative()) {
      throw new Error(`Schedule M Line ${line} detail ${label} must be non-negative`);
    }
  };

  const validateLine7Detail = (detail: ScheduleMInput["recapture529OutOfStateDetail"] | undefined): void => {
    if (!detail) {
      return;
    }

    validateDetailEntry("7", "priorDeductionsClaimed", detail.priorDeductionsClaimed);
    validateDetailEntry("7", "priorYearRecaptures", detail.priorYearRecaptures);
    validateDetailEntry("7", "transferAmount", detail.transferAmount);
  };

  const validateLine9Detail = (detail: ScheduleMInput["recapture529NonqualifiedDetail"] | undefined): void => {
    if (!detail) {
      return;
    }

    validateDetailEntry("9", "priorDeductionsClaimed", detail.priorDeductionsClaimed);
    validateDetailEntry("9", "priorYearRecaptures", detail.priorYearRecaptures);
    validateDetailEntry("9", "withdrawalAmount", detail.withdrawalAmount);
  };

  const directAmounts = [
    ["1", "childTaxExemptInterest", input.childTaxExemptInterest],
    ["2", "distributiveShareAdditions", input.distributiveShareAdditions],
    ["3", "lloydsLoss", input.lloydsLoss],
    ["4", "nonIL529Earnings", input.nonIL529Earnings],
    ["5", "ilDepreciationAddition", input.ilDepreciationAddition],
    ["7", "recapture529OutOfState", input.recapture529OutOfState],
    ["8", "studentAssistanceCreditRecapture", input.studentAssistanceCreditRecapture],
    ["9", "recapture529Nonqualified", input.recapture529Nonqualified],
    ["11", "otherAdditions", input.otherAdditions],
    ["13", "il529Contributions", input.il529Contributions],
    ["14", "distributiveShareSubtractions", input.distributiveShareSubtractions],
    ["15", "restorationClaimOfRight", input.restorationClaimOfRight],
    ["16", "jobTrainingContributions", input.jobTrainingContributions],
    ["17", "federalCreditRelatedExpenses", input.federalCreditRelatedExpenses],
    ["18", "medicalDebtRelief", input.medicalDebtRelief],
    ["19", "ilDepreciationSubtraction", input.ilDepreciationSubtraction],
    ["20", "ableContributions", input.ableContributions],
    ["21", "militaryPay", input.militaryPay],
    ["22", "usGovernmentInterest", input.usGovernmentInterest],
    ["23", "august1969ValuationLimitation", input.august1969ValuationLimitation ?? new Decimal(0)],
    [
      "24",
      "riverEdgeRedevelopmentZoneDividendSubtraction",
      input.riverEdgeRedevelopmentZoneDividendSubtraction ?? new Decimal(0),
    ],
    ["25", "recoveryOfItemsDeducted", input.recoveryOfItemsDeducted],
    ["26", "ridesharing", input.ridesharing],
    ["27", "lifeInsurancePayment", input.lifeInsurancePayment],
    ["28", "lloydsIncome", input.lloydsIncome],
    ["29", "funeralTrustIncome", input.funeralTrustIncome],
    ["30", "healthCareProviderLoanRepayment", input.healthCareProviderLoanRepayment],
    ["31", "naziPersecutionReparations", input.naziPersecutionReparations],
    ["34", "ilBondInterest", input.ilBondInterest],
    ["35", "nonUSGovernmentBondInterest", input.nonUSGovernmentBondInterest],
    ["36", "childUSGovernmentInterest", input.childUSGovernmentInterest],
    ["37", "railroadIncome", input.railroadIncome],
    ["38", "unjustImprisonmentCompensation", input.unjustImprisonmentCompensation],
    ["39", "plan529DistributionsForCredits", input.plan529DistributionsForCredits],
    ["40", "cannabisDisallowedDeductions", input.cannabisDisallowedDeductions],
    ["41", "fertilityFraudAward", input.fertilityFraudAward],
  ] as const;

  for (const [line, label, amount] of directAmounts) {
    assertNonNegative(line, label, amount);
  }

  if (!supportsMedicalDebtRelief && !input.medicalDebtRelief.isZero()) {
    throw new Error("Schedule M Line 18 medical debt relief is only available for tax year 2025 and later");
  }

  validateLine7Detail(input.recapture529OutOfStateDetail);
  validateLine9Detail(input.recapture529NonqualifiedDetail);

  const computeRecaptureAmount = (
    priorDeductionsClaimed: Decimal,
    priorYearRecaptures: Decimal,
    currentYearReduction: Decimal,
    currentYearTriggerAmount: Decimal,
  ): Decimal =>
    Decimal.min(
      zeroFloor(priorDeductionsClaimed.minus(priorYearRecaptures).minus(currentYearReduction)),
      currentYearTriggerAmount,
    );

  // ---- Step 2: Additions (Lines 1-12) ----
  const line1 = audit.record(FORM, "1", "Child's tax-exempt interest (Form 8814)", input.childTaxExemptInterest, "Input", { childTaxExemptInterest: input.childTaxExemptInterest });

  const line2 = audit.record(FORM, "2", "Distributive share of additions", input.distributiveShareAdditions, "K-1-P or K-1-T, Column A", { distributiveShareAdditions: input.distributiveShareAdditions });

  const line3 = audit.record(FORM, "3", "Lloyd's plan of operation loss", input.lloydsLoss, "Input", { lloydsLoss: input.lloydsLoss });

  const line4 = audit.record(FORM, "4", "Non-IL 529/530/ABLE plan earnings", input.nonIL529Earnings, "Input", { nonIL529Earnings: input.nonIL529Earnings });

  const line5 = audit.record(FORM, "5", "IL special depreciation addition", input.ilDepreciationAddition, "Form IL-4562, Step 2, Line 4", { ilDepreciationAddition: input.ilDepreciationAddition });

  const line7Amount = input.recapture529OutOfStateDetail
    ? computeRecaptureAmount(
        input.recapture529OutOfStateDetail.priorDeductionsClaimed,
        input.recapture529OutOfStateDetail.priorYearRecaptures,
        new Decimal(0),
        input.recapture529OutOfStateDetail.transferAmount,
      )
    : input.recapture529OutOfState;
  const line7 = audit.record(
    FORM,
    "7",
    "Recapture: 529/ABLE out-of-state transfer",
    line7Amount,
    input.recapture529OutOfStateDetail
      ? "min(max(prior deductions - prior-year recaptures, 0), transfer amount)"
      : "Input",
    input.recapture529OutOfStateDetail
      ? {
          priorDeductionsClaimed: input.recapture529OutOfStateDetail.priorDeductionsClaimed,
          priorYearRecaptures: input.recapture529OutOfStateDetail.priorYearRecaptures,
          transferAmount: input.recapture529OutOfStateDetail.transferAmount,
        }
      : { recapture529OutOfState: input.recapture529OutOfState },
  );

  const line8 = audit.record(FORM, "8", "Student-Assistance Contribution Credit recapture", input.studentAssistanceCreditRecapture, "Input", { recapture: input.studentAssistanceCreditRecapture });

  const line9Amount = input.recapture529NonqualifiedDetail
    ? computeRecaptureAmount(
        input.recapture529NonqualifiedDetail.priorDeductionsClaimed,
        input.recapture529NonqualifiedDetail.priorYearRecaptures,
        line7Amount,
        input.recapture529NonqualifiedDetail.withdrawalAmount,
      )
    : input.recapture529Nonqualified;
  const line9 = audit.record(
    FORM,
    "9",
    "Recapture: 529/ABLE nonqualified withdrawal",
    line9Amount,
    input.recapture529NonqualifiedDetail
      ? "min(max(prior deductions - prior-year recaptures - current-year line 7 recapture, 0), withdrawal amount)"
      : "Input",
    input.recapture529NonqualifiedDetail
      ? {
          priorDeductionsClaimed: input.recapture529NonqualifiedDetail.priorDeductionsClaimed,
          priorYearRecaptures: input.recapture529NonqualifiedDetail.priorYearRecaptures,
          currentYearLine7Recapture: line7Amount,
          withdrawalAmount: input.recapture529NonqualifiedDetail.withdrawalAmount,
        }
      : { recapture529Nonqualified: input.recapture529Nonqualified },
  );

  const line11 = audit.record(FORM, "11", "Other additions", input.otherAdditions, "Input", { otherAdditions: input.otherAdditions });

  const totalAdditions = sum(line1, line2, line3, line4, line5, line7, line8, line9, line11);
  audit.record(FORM, "12", "Total additions", totalAdditions, "Sum of Lines 1-11", { line1, line2, line3, line4, line5, line7, line8, line9, line11 });

  // ---- Step 3: Subtractions (Lines 13-31) ----

  // Line 13: 529 contributions with cap
  const max529 = c.max529Subtraction[capKey];
  const il529Subtraction = Decimal.min(input.il529Contributions, max529);
  audit.record(FORM, "13", "IL 529 plan contributions", il529Subtraction, `min(contributions, ${max529})`, { contributions: input.il529Contributions, cap: max529 });

  const line14 = audit.record(FORM, "14", "Distributive share of subtractions", input.distributiveShareSubtractions, "K-1-P or K-1-T, Column A", { distributiveShareSubtractions: input.distributiveShareSubtractions });

  const line15 = audit.record(FORM, "15", "Restoration under IRC Section 1341", input.restorationClaimOfRight, "Input", { amount: input.restorationClaimOfRight });

  const line16 = audit.record(FORM, "16", "Job training project contributions", input.jobTrainingContributions, "Input", { amount: input.jobTrainingContributions });

  const line17 = audit.record(FORM, "17", "Federal credit-related expenses", input.federalCreditRelatedExpenses, "Input", { amount: input.federalCreditRelatedExpenses });

  const line18 = supportsMedicalDebtRelief
    ? audit.record(FORM, "18", "Medical debt relief", input.medicalDebtRelief, "Medical Debt Relief Act (PA 103-0647)", { medicalDebtRelief: input.medicalDebtRelief })
    : new Decimal(0);

  const line19 = audit.record(FORM, "19", "IL special depreciation subtraction", input.ilDepreciationSubtraction, "Form IL-4562, Step 3, Line 19", { ilDepreciationSubtraction: input.ilDepreciationSubtraction });

  // Line 20: ABLE contributions with cap
  const maxABLE = c.maxABLESubtraction[capKey];
  const ableSubtraction = Decimal.min(input.ableContributions, maxABLE);
  audit.record(FORM, "20", "IL ABLE account contributions", ableSubtraction, `min(contributions, ${maxABLE})`, { contributions: input.ableContributions, cap: maxABLE });

  const line21 = audit.record(FORM, "21", "Military pay", input.militaryPay, "Input", { militaryPay: input.militaryPay });

  const line22 = audit.record(FORM, "22", "U.S. government interest", input.usGovernmentInterest, "Input", { usGovernmentInterest: input.usGovernmentInterest });

  const line23 = audit.record(
    FORM,
    "23",
    "August 1, 1969 valuation limitation",
    input.august1969ValuationLimitation ?? new Decimal(0),
    "Schedule F, Line 17",
    { august1969ValuationLimitation: input.august1969ValuationLimitation ?? new Decimal(0) },
  );

  const line24 = audit.record(
    FORM,
    "24",
    "River edge redevelopment zone and high impact business dividend subtraction",
    input.riverEdgeRedevelopmentZoneDividendSubtraction ?? new Decimal(0),
    "Schedule 1299-C, Step 1, Line 7",
    {
      riverEdgeRedevelopmentZoneDividendSubtraction:
        input.riverEdgeRedevelopmentZoneDividendSubtraction ?? new Decimal(0),
    },
  );

  const line25 = audit.record(FORM, "25", "Recovery of items previously deducted", input.recoveryOfItemsDeducted, "Input", { amount: input.recoveryOfItemsDeducted });

  const line26 = audit.record(FORM, "26", "Ridesharing", input.ridesharing, "Input", { amount: input.ridesharing });

  const line27 = audit.record(FORM, "27", "Life insurance payment", input.lifeInsurancePayment, "Input", { amount: input.lifeInsurancePayment });

  const line28 = audit.record(FORM, "28", "Lloyd's plan of operation income", input.lloydsIncome, "Input", { amount: input.lloydsIncome });

  const line29 = audit.record(FORM, "29", "Pre-need funeral trust income", input.funeralTrustIncome, "Input", { amount: input.funeralTrustIncome });

  const line30 = audit.record(FORM, "30", "Health care provider loan repayment", input.healthCareProviderLoanRepayment, "Input", { amount: input.healthCareProviderLoanRepayment });

  const line31 = audit.record(FORM, "31", "Nazi persecution reparations", input.naziPersecutionReparations, "Input", { amount: input.naziPersecutionReparations });

  // Line 32: Subtotal (Lines 13-31)
  const subtractionSubtotal = sum(
    il529Subtraction, line14, line15, line16, line17, line18, line19,
    ableSubtraction, line21, line22, line23, line24, line25, line26,
    line27, line28, line29, line30, line31,
  );
  audit.record(
    FORM,
    "32",
    "Subtraction subtotal (Lines 13-31)",
    subtractionSubtotal,
    supportsMedicalDebtRelief ? "Sum of Lines 13-31" : "Sum of Lines 13-17 and 19-31 (2024 printed Line 18 is unused)",
    {
      il529Subtraction,
      line14,
      line15,
      line16,
      line17,
      line18,
      line19,
      ableSubtraction,
      line21,
      line22,
      line23,
      line24,
      line25,
      line26,
      line27,
      line28,
      line29,
      line30,
      line31,
    },
  );

  // ---- Page 3: Lines 34-42 ----
  const line34 = audit.record(FORM, "34", "IL bond interest", input.ilBondInterest, "Sum of Lines 34a-34z", { ilBondInterest: input.ilBondInterest });

  const line35 = audit.record(FORM, "35", "Non-US government bond interest", input.nonUSGovernmentBondInterest, "Guam/PR/USVI/etc.", { amount: input.nonUSGovernmentBondInterest });

  const line36 = audit.record(FORM, "36", "Child's US government/IL bond interest", input.childUSGovernmentInterest, "Form 8814", { amount: input.childUSGovernmentInterest });

  const line37 = audit.record(FORM, "37", "Railroad sick pay / unemployment", input.railroadIncome, "Input", { amount: input.railroadIncome });

  const line38 = audit.record(FORM, "38", "Unjust imprisonment compensation", input.unjustImprisonmentCompensation, "IL Court of Claims", { amount: input.unjustImprisonmentCompensation });

  const line39 = audit.record(FORM, "39", "529 distributions for federal education credits", input.plan529DistributionsForCredits, "Input", { amount: input.plan529DistributionsForCredits });

  const line40 = audit.record(FORM, "40", "Cannabis IRC 280E disallowed deductions", input.cannabisDisallowedDeductions, "Input", { amount: input.cannabisDisallowedDeductions });

  const line41 = audit.record(FORM, "41", "Fertility fraud award", input.fertilityFraudAward, "IL Fertility Fraud Act", { amount: input.fertilityFraudAward });

  // Line 42: Total subtractions = subtotal + page 3 items
  const page3Total = sum(line34, line35, line36, line37, line38, line39, line40, line41);
  const totalSubtractions = subtractionSubtotal.plus(page3Total);
  audit.record(
    FORM,
    "42",
    "Total subtractions",
    totalSubtractions,
    supportsMedicalDebtRelief ? "Line 32 + Lines 34-41" : "Line 32 + Lines 34-41 (2024 printed Line 33 is unused)",
    { subtractionSubtotal, page3Total },
  );

  return {
    totalAdditions,
    il529Subtraction,
    ableSubtraction,
    subtractionSubtotal,
    totalSubtractions,
    lines: audit.getLines(),
  };
}
