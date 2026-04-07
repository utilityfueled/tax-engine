/**
 * Form 3800 — General Business Credit
 * Spec: spec/federal/form-3800.yaml
 *
 * Aggregates general business credits from K-1 Box 15 pass-through sources
 * and direct credit forms, then limits the total allowable credit based on
 * the taxpayer's net income tax and tentative minimum tax.
 *
 * IRC §38 defines the credit components.
 * IRC §38(c) limits the credit to: net income tax - max(TMT, 25% of net regular tax over $25,000).
 * IRC §39 provides 1-year carryback and 20-year carryforward for unused credits.
 *
 * This initial implementation covers:
 * - K-1 Box 15 credit aggregation (Codes A–F)
 * - Core Part I credit summation
 * - Part II limitation computation
 * - Carryforward tracking
 *
 * Not yet implemented:
 * - Eligible Small Business Credit (ESBC) breakout (IRC §38(c)(5)(A))
 * - Carryback (IRC §39(a)(1))
 * - Per-credit-type FIFO carryforward tracking
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { ScheduleK1 } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, zeroFloor, min } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

// ── Constants ────────────────────────────────────────────────────────

/** IRC §38(c)(3)(B): $25,000 threshold for most filing statuses, $12,500 for MFS */
const NET_REGULAR_TAX_THRESHOLD: Record<FilingStatus, Decimal> = {
  single: new Decimal(25000),
  married_filing_jointly: new Decimal(25000),
  married_filing_separately: new Decimal(12500),
  head_of_household: new Decimal(25000),
  qualifying_surviving_spouse: new Decimal(25000),
};

// ── Input and Result Types ───────────────────────────────────────────

export interface Form3800Input {
  filingStatus: FilingStatus;

  /** K-1 entries with Box 15 credit fields */
  scheduleK1s: ScheduleK1[];

  /** Current-year credits from non-K-1 sources (e.g., directly computed credit forms) */
  currentYearCredits?: Decimal;
  /** Passive activity credits allowed after Form 8582-CR limitation */
  passiveActivityCredits?: Decimal;
  /** Carryforward from prior years (IRC §39, 20-year limit) */
  carryforward?: Decimal;

  // ── Part II limitation inputs ───────────────────────────────
  /** Regular tax before credits (Form 1040 Line 16 — income tax only, excludes AMT) */
  regularTax: Decimal;
  /** Alternative minimum tax from Form 6251 Line 11 */
  amt: Decimal;
  /** Tentative minimum tax from Form 6251 (before the AMT = TMT - regular tax computation) */
  tentativeMinimumTax: Decimal;
  /** Child tax credit (Form 1040 Line 19) */
  childTaxCredit: Decimal;
  /** Other nonrefundable personal credits from Schedule 3 (excluding GBC) */
  otherNonrefundableCredits: Decimal;
}

export interface Form3800Result {
  // ── Part I ──────────────────────────────
  /** Line 1: Current year general business credits (K-1 Box 15 + direct) */
  currentYearCredit: Decimal;
  /** Line 2: Passive activity credits */
  passiveActivityCredits: Decimal;
  /** Line 3: Carryforward from prior years */
  carryforwardApplied: Decimal;
  /** Line 5: Total credit available */
  totalCredit: Decimal;

  // ── K-1 Box 15 detail ──────────────────
  k1LowIncomeHousing42j5: Decimal;
  k1LowIncomeHousingOther: Decimal;
  k1RehabilitationCredit: Decimal;
  k1OtherRentalRealEstateCredits: Decimal;
  k1OtherRentalCredits: Decimal;
  k1OtherCredits: Decimal;
  k1TotalCredits: Decimal;

  // ── Part II ─────────────────────────────
  /** Line 14: Personal nonrefundable credits */
  personalCredits: Decimal;
  /** Line 15: Net regular tax */
  netRegularTax: Decimal;
  /** Line 16: 25% of net regular tax over threshold */
  twentyFivePercentExcess: Decimal;
  /** Line 17: Tentative minimum tax */
  tentativeMinimumTax: Decimal;
  /** Line 18: Greater of Line 16 or Line 17 */
  greaterOfThresholdOrTMT: Decimal;
  /** Line 19: Net income tax */
  netIncomeTax: Decimal;
  /** Line 20: Credit limitation (Line 19 - Line 18) */
  creditLimitation: Decimal;
  /** Line 21: Allowable general business credit */
  allowableCredit: Decimal;

  // ── Carryforward ────────────────────────
  /** Unused credit carried forward to next year */
  carryforwardToNextYear: Decimal;

  lines: CalculatedLine[];
}

// ── Calculation ──────────────────────────────────────────────────────

export function calculateForm3800(input: Form3800Input): Form3800Result {
  const audit = new AuditTrail();

  // ── Part I: Current Year Credit ──────────────────────────

  // Aggregate K-1 Box 15 credits
  const k1LowIncomeHousing42j5 = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.lowIncomeHousingCredit42j5)),
    new Decimal(0),
  );
  const k1LowIncomeHousingOther = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.lowIncomeHousingCreditOther)),
    new Decimal(0),
  );
  const k1RehabilitationCredit = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.qualifiedRehabilitationExpenditures)),
    new Decimal(0),
  );
  const k1OtherRentalRealEstateCredits = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.otherRentalRealEstateCredits)),
    new Decimal(0),
  );
  const k1OtherRentalCredits = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.otherRentalCredits)),
    new Decimal(0),
  );
  const k1OtherCredits = input.scheduleK1s.reduce(
    (acc, k1) => acc.plus(d(k1.otherCredits)),
    new Decimal(0),
  );
  const k1TotalCredits = sum(
    k1LowIncomeHousing42j5,
    k1LowIncomeHousingOther,
    k1RehabilitationCredit,
    k1OtherRentalRealEstateCredits,
    k1OtherRentalCredits,
    k1OtherCredits,
  );

  audit.record("Form 3800", "K-1 Box 15", "K-1 pass-through credits", k1TotalCredits,
    "Sum of K-1 Box 15 Codes A through F", {
      "Code A (LIHC §42(j)(5))": k1LowIncomeHousing42j5,
      "Code B (LIHC other)": k1LowIncomeHousingOther,
      "Code C (rehabilitation)": k1RehabilitationCredit,
      "Code D (other rental RE)": k1OtherRentalRealEstateCredits,
      "Code E (other rental)": k1OtherRentalCredits,
      "Code F (other)": k1OtherCredits,
    });

  // Line 1: Current year credits = K-1 credits + direct credits
  const directCredits = input.currentYearCredits ?? new Decimal(0);
  const currentYearCredit = k1TotalCredits.plus(directCredits);
  audit.record("Form 3800", "Part I Line 1", "General business credit — current year",
    currentYearCredit, "K-1 Box 15 total + direct credit sources", {
      "K-1 total": k1TotalCredits,
      "Direct credits": directCredits,
    });

  // Line 2: Passive activity credits
  const passiveActivityCredits = input.passiveActivityCredits ?? new Decimal(0);
  audit.record("Form 3800", "Part I Line 2", "Passive activity credits allowed",
    passiveActivityCredits, "From Form 8582-CR");

  // Line 3: Carryforward
  const carryforwardApplied = input.carryforward ?? new Decimal(0);
  audit.record("Form 3800", "Part I Line 3", "Carryforward from prior years",
    carryforwardApplied, "IRC §39 — unused GBC carried forward (20-year limit)");

  // Line 5: Total credit
  const totalCredit = sum(currentYearCredit, passiveActivityCredits, carryforwardApplied);
  audit.record("Form 3800", "Part I Line 5", "Total general business credit",
    totalCredit, "Line 1 + Line 2 + Line 3", {
      "Line 1": currentYearCredit,
      "Line 2": passiveActivityCredits,
      "Line 3": carryforwardApplied,
    });

  // ── Part II: Allowable Credit ────────────────────────────

  // Line 14: Personal nonrefundable credits
  const personalCredits = input.childTaxCredit.plus(input.otherNonrefundableCredits);
  audit.record("Form 3800", "Part II Line 14", "Personal nonrefundable credits",
    personalCredits, "Child tax credit + other Schedule 3 nonrefundable credits", {
      "Child tax credit": input.childTaxCredit,
      "Other nonrefundable": input.otherNonrefundableCredits,
    });

  // Line 15: Net regular tax = max(0, regular tax - personal credits)
  const netRegularTax = zeroFloor(input.regularTax.minus(personalCredits));
  audit.record("Form 3800", "Part II Line 15", "Net regular tax",
    netRegularTax, "max(0, regular tax - personal credits)", {
      "Regular tax": input.regularTax,
      "Personal credits": personalCredits,
    });

  // Line 16: 25% of net regular tax over threshold
  const threshold = NET_REGULAR_TAX_THRESHOLD[input.filingStatus];
  const twentyFivePercentExcess = zeroFloor(netRegularTax.minus(threshold)).times(new Decimal("0.25"));
  audit.record("Form 3800", "Part II Line 16", "25% of net regular tax over threshold",
    twentyFivePercentExcess, `0.25 × max(0, $${netRegularTax} - $${threshold})`, {
      "Net regular tax": netRegularTax,
      "Threshold": threshold,
    });

  // Line 17: Tentative minimum tax
  const tentativeMinimumTax = input.tentativeMinimumTax;
  audit.record("Form 3800", "Part II Line 17", "Tentative minimum tax",
    tentativeMinimumTax, "From Form 6251");

  // Line 18: Greater of Line 16 or Line 17
  const greaterOfThresholdOrTMT = Decimal.max(twentyFivePercentExcess, tentativeMinimumTax);
  audit.record("Form 3800", "Part II Line 18", "Greater of 25% threshold or TMT",
    greaterOfThresholdOrTMT, "max(Line 16, Line 17)", {
      "Line 16": twentyFivePercentExcess,
      "Line 17": tentativeMinimumTax,
    });

  // Line 19: Net income tax = regular tax + AMT - personal credits
  const netIncomeTax = zeroFloor(
    input.regularTax.plus(input.amt).minus(personalCredits),
  );
  audit.record("Form 3800", "Part II Line 19", "Net income tax",
    netIncomeTax, "max(0, regular tax + AMT - personal credits)", {
      "Regular tax": input.regularTax,
      "AMT": input.amt,
      "Personal credits": personalCredits,
    });

  // Line 20: Credit limitation = max(0, Line 19 - Line 18)
  const creditLimitation = zeroFloor(netIncomeTax.minus(greaterOfThresholdOrTMT));
  audit.record("Form 3800", "Part II Line 20", "Credit limitation",
    creditLimitation, "max(0, net income tax - greater of threshold/TMT)", {
      "Net income tax": netIncomeTax,
      "Greater of threshold/TMT": greaterOfThresholdOrTMT,
    });

  // Line 21: Allowable credit = min(total credit, limitation)
  const allowableCredit = min(totalCredit, creditLimitation);
  audit.record("Form 3800", "Part II Line 21", "Allowable general business credit",
    allowableCredit, "min(total credit, credit limitation)", {
      "Total credit": totalCredit,
      "Credit limitation": creditLimitation,
    });

  // ── Carryforward ─────────────────────────────────────────

  const carryforwardToNextYear = totalCredit.minus(allowableCredit);
  audit.record("Form 3800", "Carryforward", "Unused GBC carried forward",
    carryforwardToNextYear, "Total credit - allowable credit (IRC §39, 20-year limit)", {
      "Total credit": totalCredit,
      "Allowable credit": allowableCredit,
    });

  return {
    currentYearCredit,
    passiveActivityCredits,
    carryforwardApplied,
    totalCredit,
    k1LowIncomeHousing42j5,
    k1LowIncomeHousingOther,
    k1RehabilitationCredit,
    k1OtherRentalRealEstateCredits,
    k1OtherRentalCredits,
    k1OtherCredits,
    k1TotalCredits,
    personalCredits,
    netRegularTax,
    twentyFivePercentExcess,
    tentativeMinimumTax,
    netIncomeTax,
    greaterOfThresholdOrTMT,
    creditLimitation,
    allowableCredit,
    carryforwardToNextYear,
    lines: audit.getLines(),
  };
}
