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
  adjustedInitialAmount: Decimal; // Line 12
  nontaxableBenefits: Decimal;   // Line 13c
  netInitialAmount: Decimal;     // Line 14
  agiReduction: Decimal;         // Line 18
  creditBase: Decimal;           // Line 19
  credit: Decimal;               // Line 20 (tentative credit)
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
    if (primaryAge65 && !spouseAge65 && !spouseDisabled) return 6;
    if (!primaryAge65 && spouseAge65 && !primaryDisabled) return 6;
    if (primaryAge65 && !spouseAge65 && spouseDisabled) return 7;
    if (!primaryAge65 && spouseAge65 && primaryDisabled) return 7;
    return undefined;
  }

  // Single, HoH, QSS
  if (primaryAge65) return 1;
  if (primaryDisabled) return 2;
  return undefined;
}

/** Whether the box requires disability income to cap the initial amount */
function isDisabilityBox(box: ScheduleRBox): boolean {
  return box === 2 || box === 4 || box === 5 || box === 7 || box === 9;
}

/** Get the initial amount (Line 10) based on the eligibility box */
function getInitialAmount(
  box: ScheduleRBox,
  constants: ScheduleRParams["constants"]
): Decimal {
  switch (box) {
    case 1: case 2: return constants.initialAmountSingle; // $5,000
    case 3: return constants.initialAmountBoth;            // $7,500
    case 4: case 6: return constants.initialAmountSingle;  // $5,000 (one qualifying)
    case 5: case 7: return constants.initialAmountBoth;    // $7,500 (both qualifying)
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
    case 7: {
      // One 65+, one disabled — the disabled one's income
      const primaryDisabled = input.primaryQualifies && !input.primaryAge65OrOlder;
      return primaryDisabled ? primaryDisability : spouseDisability;
    }
    default: return ZERO; // Non-disability boxes
  }
}

export function calculateScheduleR(params: ScheduleRParams): ScheduleRResult {
  const { filingStatus, agi, nontaxableSocialSecurity, scheduleRInput, livedWithSpouse, constants } = params;
  const audit = new AuditTrail();

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
  let adjustedInitialAmount: Decimal;
  if (isDisabilityBox(box)) {
    const disabilityIncome = getDisabilityIncome(box, scheduleRInput);
    audit.record("Sched R", "11", "Taxable disability income", disabilityIncome, "Disability income for under-65 filer(s)");
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

  // ── Line 14: Net initial amount ──────────────────────────
  const netInitialAmount = Decimal.max(ZERO, adjustedInitialAmount.minus(nontaxableBenefits));
  audit.record("Sched R", "14", "Net initial amount", netInitialAmount, `max(0, Line 12 - Line 13c) = max(0, ${adjustedInitialAmount} - ${nontaxableBenefits})`);

  if (netInitialAmount.isZero()) {
    audit.record("Sched R", "20", "Credit", ZERO, "Net initial amount is zero — no credit");
    return {
      eligible: true,
      box,
      initialAmount,
      adjustedInitialAmount,
      nontaxableBenefits,
      netInitialAmount,
      agiReduction: ZERO,
      creditBase: ZERO,
      credit: ZERO,
      lines: audit.getLines(),
    };
  }

  // ── Lines 15-18: AGI reduction ───────────────────────────
  const agiThreshold = constants.agiThreshold[filingStatus];
  const excessAgi = Decimal.max(ZERO, agi.minus(agiThreshold));
  const agiReduction = roundDollar(excessAgi.times(HALF));

  audit.record("Sched R", "15", "AGI", agi, "Form 1040 Line 11");
  audit.record("Sched R", "16", "AGI threshold", agiThreshold, `Filing status: ${filingStatus}`);
  audit.record("Sched R", "17", "Excess AGI", excessAgi, `max(0, ${agi} - ${agiThreshold})`);
  audit.record("Sched R", "18", "AGI reduction (50% of excess)", agiReduction, `${excessAgi} × 0.5`);

  // ── Line 19: Credit base ─────────────────────────────────
  const creditBase = Decimal.max(ZERO, netInitialAmount.minus(agiReduction));
  audit.record("Sched R", "19", "Credit base", creditBase, `max(0, Line 14 - Line 18) = max(0, ${netInitialAmount} - ${agiReduction})`);

  // ── Line 20: Tentative credit ────────────────────────────
  const credit = roundDollar(creditBase.times(constants.creditRate));
  audit.record("Sched R", "20", "Credit for the elderly or the disabled", credit, `${creditBase} × ${constants.creditRate}`);

  return {
    eligible: true,
    box,
    initialAmount,
    adjustedInitialAmount,
    nontaxableBenefits,
    netInitialAmount,
    agiReduction,
    creditBase,
    credit,
    lines: audit.getLines(),
  };
}
