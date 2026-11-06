/**
 * Schedule R — Credit for the Elderly or the Disabled
 * Spec: spec/federal/schedule-r.yaml
 *
 * IRC §22: nonrefundable credit for taxpayers age 65+ or permanently/totally
 * disabled. The credit is 15% of an initial base amount, reduced by nontaxable
 * Social Security/pension benefits and half the excess AGI over a filing-status
 * threshold. Flows to Schedule 3 Line 6d.
 *
 * Base amounts and AGI thresholds are set by statute and are NOT inflation-adjusted.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { ScheduleRInput } from "@/models/inputs.js";
import { d, sum, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface ScheduleRParams {
  filingStatus: FilingStatus;
  /** Actual form year, used for the printed AGI source label. */
  taxYear?: number;
  /** Actual Line21 Credit Limit Worksheet; omission remains unknown. */
  creditLimitWorksheet?: {
    taxBeforeCredits: Decimal;
    foreignTaxCredit: Decimal;
    dependentCareCredit: Decimal;
    schedule3Line6l: Decimal;
  };
  agi: Decimal;
  /** Nontaxable Social Security: Form 1040 Line 6a minus Line 6b */
  nontaxableSocialSecurity: Decimal;
  scheduleRInput: ScheduleRInput;
  /** Whether MFS filer lived with spouse at any time during the year */
  livedWithSpouse?: boolean;
  constants: {
    initialAmountSingle: Decimal;
    initialAmountBoth: Decimal;
    initialAmountMFS: Decimal;
    agiThreshold: Record<FilingStatus, Decimal>;
    creditRate: Decimal;
  };
}

/** Which Part I eligibility box applies */
export type ScheduleRBox = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ScheduleRResult {
  eligible: boolean;
  box?: ScheduleRBox;
  initialAmount: Decimal;        // Line 10
  line11Amount?: Decimal;         // Actual uncapped line11; absent for age-only boxes
  adjustedInitialAmount: Decimal; // Line 12
  nontaxableBenefits: Decimal;   // Line 13c
  netInitialAmount: Decimal;     // Helper: line12 minus13c, not a printed line
  agiReduction: Decimal;         // Line 17
  creditBase: Decimal;           // Line 19
  credit: Decimal;               // Line 20 (tentative credit)
  creditLimit?: Decimal;         // Line21, only with actual worksheet context
  allowedCredit?: Decimal;       // Line22, only with actual worksheet context
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const HALF = new Decimal("0.5");

/**
 * Determine Part I eligibility box based on filing status, age, and disability.
 * Returns undefined if the taxpayer is not eligible.
 */
function determineBox(
  filingStatus: FilingStatus,
  input: ScheduleRInput,
  livedWithSpouse?: boolean
): ScheduleRBox | undefined {
  const primaryAge65 = input.primaryAge65OrOlder;
  const primaryQualifies = input.primaryQualifies;
  const spouseAge65 = input.spouseAge65OrOlder ?? false;
  const spouseQualifies = input.spouseQualifies ?? false;
  const primaryDisabled = primaryQualifies && !primaryAge65;
  const spouseDisabled = spouseQualifies && !spouseAge65;

  if (filingStatus === "married_filing_separately") {
    // MFS must have lived apart from spouse all year
    if (livedWithSpouse) return undefined;
    if (primaryAge65) return 8;
    if (primaryDisabled) return 9;
    return undefined;
  }

  if (filingStatus === "married_filing_jointly") {
    if (primaryAge65 && spouseAge65) return 3;
    if (!primaryAge65 && !spouseAge65 && primaryDisabled && !spouseDisabled) return 4;
    if (!primaryAge65 && !spouseAge65 && !primaryDisabled && spouseDisabled) return 4;
    if (!primaryAge65 && !spouseAge65 && primaryDisabled && spouseDisabled) return 5;
    if (primaryAge65 && !spouseAge65 && !spouseDisabled) return 7;
    if (!primaryAge65 && spouseAge65 && !primaryDisabled) return 7;
    if (primaryAge65 && !spouseAge65 && spouseDisabled) return 6;
    if (!primaryAge65 && spouseAge65 && primaryDisabled) return 6;
    return undefined;
  }

  // Single, HoH, QSS
  if (primaryAge65) return 1;
  if (primaryDisabled) return 2;
  return undefined;
}

/** Whether the box requires disability income to cap the initial amount */
function isDisabilityBox(box: ScheduleRBox): boolean {
  return box === 2 || box === 4 || box === 5 || box === 6 || box === 9;
}

/** Get the initial amount (Line 10) based on the eligibility box */
function getInitialAmount(
  box: ScheduleRBox,
  constants: ScheduleRParams["constants"]
): Decimal {
  switch (box) {
    case 1: case 2: return constants.initialAmountSingle; // $5,000
    case 3: return constants.initialAmountBoth;            // $7,500
    case 4: case 7: return constants.initialAmountSingle;  // $5,000 (one qualifying)
    case 5: case 6: return constants.initialAmountBoth;    // $7,500 (both qualifying)
    case 8: case 9: return constants.initialAmountMFS;     // $3,750
  }
}

/** Calculate the total disability income for disability-based boxes */
function getDisabilityIncome(
  box: ScheduleRBox,
  input: ScheduleRInput
): Decimal {
  const primaryDisability = d(input.primaryDisabilityIncome);
  const spouseDisability = d(input.spouseDisabilityIncome);

  switch (box) {
    case 2: case 9: return primaryDisability;
    case 4: {
      // One spouse disabled — whichever one is disabled
      const primaryDisabled = input.primaryQualifies && !input.primaryAge65OrOlder;
      return primaryDisabled ? primaryDisability : spouseDisability;
    }
    case 5: return sum(primaryDisability, spouseDisability);
    case 6: {
      // Final2025/2026 line11: age-based $5,000 plus younger spouse income
      const primaryDisabled = input.primaryQualifies && !input.primaryAge65OrOlder;
      return new Decimal(5000).plus(primaryDisabled ? primaryDisability : spouseDisability);
    }
    default: return ZERO; // Non-disability boxes
  }
}

export function calculateScheduleR(params: ScheduleRParams): ScheduleRResult {
  const { filingStatus, agi, nontaxableSocialSecurity, scheduleRInput, livedWithSpouse, constants } = params;
  if (!Decimal.isDecimal(agi) || !agi.isFinite()) {
    throw new Error("Schedule R actual AGI source must be finite");
  }
  const actualBenefitsAndDisability = [nontaxableSocialSecurity,
    d(scheduleRInput.primaryDisabilityIncome), d(scheduleRInput.spouseDisabilityIncome),
    d(scheduleRInput.nontaxablePensionsAnnuities)];
  if (actualBenefitsAndDisability.some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Schedule R actual benefit and disability sources must be finite and nonnegative");
  }
  const audit = new AuditTrail();
  const worksheet = params.creditLimitWorksheet;
  if (worksheet && [worksheet.taxBeforeCredits, worksheet.foreignTaxCredit, worksheet.dependentCareCredit, worksheet.schedule3Line6l].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Schedule R credit limit worksheet requires actual finite nonnegative components");
  }
  const creditLimit = worksheet ? Decimal.max(ZERO, worksheet.taxBeforeCredits.minus(sum(
    worksheet.foreignTaxCredit, worksheet.dependentCareCredit, worksheet.schedule3Line6l))) : undefined;

  // ── Part I: Determine eligibility ────────────────────────
  const box = determineBox(filingStatus, scheduleRInput, livedWithSpouse);

  if (box === undefined) {
    audit.record("Sched R", "Part I", "Eligibility", ZERO, "Not eligible for credit for the elderly or the disabled");
    return {
      eligible: false,
      initialAmount: ZERO,
      adjustedInitialAmount: ZERO,
      nontaxableBenefits: ZERO,
      netInitialAmount: ZERO,
      agiReduction: ZERO,
      creditBase: ZERO,
      credit: ZERO,
      lines: audit.getLines(),
    };
  }

  audit.record("Sched R", "Part I", "Eligibility box", new Decimal(box), `Box ${box} — eligible for credit`);

  // ── Line 10: Initial amount ──────────────────────────────
  const initialAmount = getInitialAmount(box, constants);
  audit.record("Sched R", "10", "Initial amount", initialAmount, `Box ${box} base amount`);

  // ── Line 11-12: Disability income cap ────────────────────
  let line11Amount: Decimal | undefined;
  let adjustedInitialAmount: Decimal;
  if (isDisabilityBox(box)) {
    const disabilityIncome = getDisabilityIncome(box, scheduleRInput);
    line11Amount = disabilityIncome;
    audit.record("Sched R", "11", "Line11 disability amount", disabilityIncome, box === 6 ? "$5,000 + actual younger disabled spouse income" : "Actual qualifying disability income");
    adjustedInitialAmount = min(initialAmount, disabilityIncome);
    audit.record("Sched R", "12", "Adjusted initial amount", adjustedInitialAmount, `min(Line 10 = ${initialAmount}, Line 11 = ${disabilityIncome})`);
  } else {
    adjustedInitialAmount = initialAmount;
    audit.record("Sched R", "12", "Adjusted initial amount", adjustedInitialAmount, "Age 65+ — no disability income cap");
  }

  // ── Lines 13a-13c: Nontaxable benefits ───────────────────
  const nontaxablePensions = d(scheduleRInput.nontaxablePensionsAnnuities);
  const nontaxableBenefits = sum(nontaxableSocialSecurity, nontaxablePensions);
  audit.record("Sched R", "13a", "Nontaxable Social Security", nontaxableSocialSecurity, "1040 Line 6a - Line 6b");
  audit.record("Sched R", "13b", "Nontaxable pensions/annuities/disability", nontaxablePensions, "Tax-exempt pensions, VA disability, etc.");
  audit.record("Sched R", "13c", "Total nontaxable benefits", nontaxableBenefits, "Line 13a + Line 13b");

  // This helper is retained for callers; its value is not printed line14.
  const netInitialAmount = Decimal.max(ZERO, adjustedInitialAmount.minus(nontaxableBenefits));

  // ── Printed lines14–18: actual AGI and total reduction ──
  const agiThreshold = constants.agiThreshold[filingStatus];
  const excessAgi = Decimal.max(ZERO, agi.minus(agiThreshold));
  const agiReduction = roundDollar(excessAgi.times(HALF));
  audit.record("Sched R", "14", "AGI", agi, params.taxYear === 2026 ? "Form1040 line11b" : params.taxYear === 2025 ? "Form1040 line11a" : "Actual Form1040 adjusted gross income");
  audit.record("Sched R", "15", "AGI threshold", agiThreshold, `Filing status: ${filingStatus}`);
  audit.record("Sched R", "16", "Excess AGI", excessAgi, `max(0, ${agi} - ${agiThreshold})`);
  audit.record("Sched R", "17", "Half excess AGI", agiReduction, `${excessAgi} × 0.5`);
  const totalReduction = nontaxableBenefits.plus(agiReduction);
  audit.record("Sched R", "18", "Total reduction", totalReduction, "Line13c + line17");

  const creditBase = Decimal.max(ZERO, adjustedInitialAmount.minus(totalReduction));
  audit.record("Sched R", "19", "Credit base", creditBase, "max(0, line12 - line18)");

  // ── Line 20: Tentative credit ────────────────────────────
  const credit = roundDollar(creditBase.times(constants.creditRate));
  audit.record("Sched R", "20", "Credit for the elderly or the disabled", credit, `${creditBase} × ${constants.creditRate}`);

  const allowedCredit = creditLimit === undefined ? undefined : Decimal.min(credit, creditLimit);
  if (worksheet && creditLimit !== undefined && allowedCredit !== undefined) {
    audit.record("Sched R", "21", "Tax liability limit", creditLimit,
      "max(0, Form1040 line18 - Schedule3 lines1,2,6l)", {
        taxBeforeCredits: worksheet.taxBeforeCredits, foreignTaxCredit: worksheet.foreignTaxCredit,
        dependentCareCredit: worksheet.dependentCareCredit, schedule3Line6l: worksheet.schedule3Line6l,
      });
    audit.record("Sched R", "22", "Allowed credit", allowedCredit, "min(line20, line21)");
  }
  return {
    eligible: true,
    box,
    initialAmount,
    line11Amount,
    adjustedInitialAmount,
    nontaxableBenefits,
    netInitialAmount,
    agiReduction,
    creditBase,
    credit,
    creditLimit,
    allowedCredit,
    lines: audit.getLines(),
  };
}
