/**
 * Form 8615 — Tax for Certain Children Who Have Unearned Income (Kiddie Tax).
 * Spec: spec/federal/form-8615.yaml
 *
 * Implements IRC §1(g): children under 19 (or under 24 if full-time students)
 * whose unearned income exceeds the threshold pay tax on the net unearned
 * income at their parent's marginal rate instead of their own.
 *
 * Lines 11/12 use the parent's QDCG rates. Lines 15/17 use the child's rates.
 * The child's qualified dividends are allocated between the parent-rate portion
 * (Line 5) and the child-rate portion (Line 6).
 */

import Decimal from "decimal.js";
import type { Form8615Input } from "@/models/inputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import {
  calculateCapitalGainsTax,
  calculateRegularIncomeTax,
} from "@/utils/tax-math.js";
import { d, zeroFloor, min, roundDollar } from "@/utils/decimal.js";

export interface Form8615Result {
  /** Line 3: Net unearned income (unearned income minus threshold) */
  netUnearnedIncome: Decimal;
  /** Line 5: Net unearned income taxed at parent's rate */
  netUnearnedAtParentRate: Decimal;
  /** Line 6: Child's taxable income taxed at child's rate */
  childRateIncome: Decimal;
  /** Line 13: Allocable parental tax (total for all Form 8615 children) */
  allocableParentalTax: Decimal;
  /** Line 14: This child's share of allocable parental tax */
  childShareOfParentalTax: Decimal;
  /** Line 15: Tax on child's remaining income at child's rate */
  taxOnChildRateIncome: Decimal;
  /** Line 16: Tentative tax (Line 14 + Line 15) */
  tentativeTax: Decimal;
  /** Line 17: Tax on child's full taxable income at child's own rate */
  taxAtChildOwnRate: Decimal;
  /** Line 18: Final Form 8615 tax = max(Line 16, Line 17) */
  tax: Decimal;
  /** Whether Form 8615 applies (net unearned income > 0) */
  applies: boolean;
  /** Audit lines */
  lines: CalculatedLine[];
}

export function calculateForm8615(
  input: Form8615Input,
  childTaxableIncome: Decimal,
  childFilingStatus: FilingStatus,
  constants: YearConstants
): Form8615Result {
  const audit = new AuditTrail();
  const zero = new Decimal(0);

  // ── Line 1: Child's unearned income ──
  const line1 = d(input.childUnearnedIncome);
  audit.record("8615", "1", "Child's unearned income", line1, "Input: child's unearned income");

  // ── Line 2: Threshold deduction ──
  const line2 = input.childItemizesDeductions
    ? constants.kiddieTax.itemizingThreshold
    : constants.kiddieTax.unearnedIncomeThreshold;
  audit.record("8615", "2", "Threshold deduction", line2,
    input.childItemizesDeductions
      ? "Itemizing child: minimum dependent standard deduction"
      : "Non-itemizing child: 2x minimum dependent standard deduction");

  // ── Line 3: Net unearned income ──
  const line3 = zeroFloor(line1.minus(line2));
  audit.record("8615", "3", "Net unearned income", line3, "Line 1 - Line 2 (floored at 0)");

  if (line3.isZero()) {
    return {
      netUnearnedIncome: zero,
      netUnearnedAtParentRate: zero,
      childRateIncome: childTaxableIncome,
      allocableParentalTax: zero,
      childShareOfParentalTax: zero,
      taxOnChildRateIncome: zero,
      tentativeTax: zero,
      taxAtChildOwnRate: zero,
      tax: zero,
      applies: false,
      lines: audit.getLines(),
    };
  }

  // ── Line 4: Child's taxable income ──
  const line4 = childTaxableIncome;
  audit.record("8615", "4", "Child's taxable income", line4, "From Form 1040 Line 15");

  // ── Line 5: Net unearned income taxed at parent's rate ──
  const line5 = min(line3, line4);
  audit.record("8615", "5", "Net unearned income taxed at parent's rate", line5,
    "min(Line 3, Line 4)");

  // ── Line 6: Child's taxable income taxed at child's rate ──
  const line6 = line4.minus(line5);
  audit.record("8615", "6", "Child's taxable income at child's rate", line6,
    "Line 4 - Line 5");

  // ── Line 7: Parent's taxable income ──
  const line7 = d(input.parentTaxableIncome);
  audit.record("8615", "7", "Parent's taxable income", line7, "From parent's Form 1040 Line 15");

  // ── Line 8: Other children's net unearned income ──
  const line8 = d(input.otherChildrenNetUnearnedIncome);
  audit.record("8615", "8", "Other children's net unearned income", line8, "Input: other Form 8615 siblings");

  // ── Line 9: Total children's net unearned income ──
  const line9 = line5.plus(line8);
  audit.record("8615", "9", "Total children's net unearned income", line9,
    "Line 5 + Line 8");

  // ── Line 10: Combined income for rate lookup ──
  const line10 = line7.plus(line9);
  audit.record("8615", "10", "Combined income for rate lookup", line10,
    "Line 7 + Line 9");

  // ── Lines 11-12: Tax at parent's rates ──
  // Use parent's QDCG rates. The children's net unearned income is treated
  // as ordinary income stacked above the parent's income.
  const parentFilingStatus = input.parentFilingStatus as FilingStatus;
  const parentQD = d(input.parentQualifiedDividends);
  const parentLTCG = d(input.parentNetLTCG);
  const parentSection1250 = d(input.parentSection1250Gain);
  const parentCollectibles = d(input.parentCollectiblesGain);

  const hasParentQDCG = parentQD.greaterThan(0) || parentLTCG.greaterThan(0);

  let line11: Decimal;
  let line12: Decimal;

  if (hasParentQDCG) {
    // Tax on combined income using parent's QDCG rates
    const taxOnCombined = calculateCapitalGainsTax(
      line10, parentQD, parentLTCG, parentFilingStatus, constants,
      { section1250Gain: parentSection1250, collectiblesGain: parentCollectibles }
    );
    line11 = taxOnCombined.tax;

    // Tax on parent's income alone using parent's QDCG rates
    const taxOnParent = calculateCapitalGainsTax(
      line7, parentQD, parentLTCG, parentFilingStatus, constants,
      { section1250Gain: parentSection1250, collectiblesGain: parentCollectibles }
    );
    line12 = taxOnParent.tax;
  } else {
    // No QDCG: use ordinary brackets
    line11 = calculateRegularIncomeTax(line10, parentFilingStatus, constants);
    line12 = calculateRegularIncomeTax(line7, parentFilingStatus, constants);
  }

  audit.record("8615", "11", "Tax on combined income at parent's rates", line11,
    hasParentQDCG ? "QDCG worksheet using parent's filing status" : "Actual-year TaxTable/TaxComputationWorksheet using parent's filing status");
  audit.record("8615", "12", "Tax on parent's income at parent's rates", line12,
    hasParentQDCG ? "QDCG worksheet using parent's filing status" : "Actual-year TaxTable/TaxComputationWorksheet using parent's filing status");

  // ── Line 13: Allocable parental tax ──
  const line13 = zeroFloor(line11.minus(line12));
  audit.record("8615", "13", "Allocable parental tax", line13, "Line 11 - Line 12");

  // ── Line 14: This child's share ──
  let line14: Decimal;
  if (line8.isZero()) {
    // Only child filing Form 8615 — gets 100%
    line14 = line13;
    audit.record("8615", "14", "Child's share of allocable parental tax", line14,
      "Only child filing Form 8615: full Line 13");
  } else {
    // Multiple children: proportional allocation
    line14 = line9.greaterThan(0)
      ? roundDollar(line13.times(line5).dividedBy(line9))
      : zero;
    audit.record("8615", "14", "Child's share of allocable parental tax", line14,
      `Line 13 x (Line 5 / Line 9) = ${line13} x (${line5} / ${line9})`);
  }

  // ── Line 15: Tax on child's remaining income at child's rate ──
  // Allocate child's qualified dividends and LTCG between Lines 5 and 6.
  // Per Form 8615 instructions: qualified dividends and LTCG within the
  // net unearned income (Line 5) are absorbed first; any excess flows to Line 6.
  const childQD = d(input.childQualifiedDividends);
  const childLTCG = d(input.childNetLTCG);

  // Absorption: QD first, then LTCG
  const qdAbsorbedByLine5 = min(childQD, line5);
  const qdOnLine6 = zeroFloor(childQD.minus(qdAbsorbedByLine5));
  const remainingLine5AfterQD = zeroFloor(line5.minus(qdAbsorbedByLine5));
  const ltcgAbsorbedByLine5 = min(childLTCG, remainingLine5AfterQD);
  const ltcgOnLine6 = zeroFloor(childLTCG.minus(ltcgAbsorbedByLine5));

  let line15: Decimal;
  const hasChildQDCGOnLine6 = qdOnLine6.greaterThan(0) || ltcgOnLine6.greaterThan(0);

  if (line6.isZero()) {
    line15 = zero;
  } else if (hasChildQDCGOnLine6) {
    const taxOnLine6 = calculateCapitalGainsTax(
      line6, qdOnLine6, ltcgOnLine6, childFilingStatus, constants
    );
    line15 = taxOnLine6.tax;
  } else {
    line15 = calculateRegularIncomeTax(line6, childFilingStatus, constants);
  }
  audit.record("8615", "15", "Tax on child's remaining income at child's rate", line15,
    hasChildQDCGOnLine6
      ? `QDCG worksheet: QD $${qdOnLine6} + LTCG $${ltcgOnLine6} on Line 6`
      : "Actual-year TaxTable/TaxComputationWorksheet using child's filing status");

  // ── Line 16: Tentative tax ──
  const line16 = line14.plus(line15);
  audit.record("8615", "16", "Tentative tax", line16, "Line 14 + Line 15");

  // ── Line 17: Tax on child's full taxable income at child's own rate ──
  let line17: Decimal;
  const hasChildQDCG = childQD.greaterThan(0) || childLTCG.greaterThan(0);

  if (hasChildQDCG) {
    const taxAtChildRate = calculateCapitalGainsTax(
      line4, childQD, childLTCG, childFilingStatus, constants
    );
    line17 = taxAtChildRate.tax;
  } else {
    line17 = calculateRegularIncomeTax(line4, childFilingStatus, constants);
  }
  audit.record("8615", "17", "Tax at child's own rate on full taxable income", line17,
    hasChildQDCG ? "QDCG worksheet using child's filing status" : "Actual-year TaxTable/TaxComputationWorksheet using child's filing status");

  // ── Line 18: Final tax = max(Line 16, Line 17) ──
  const line18 = Decimal.max(line16, line17);
  audit.record("8615", "18", "Form 8615 tax", line18,
    line16.greaterThanOrEqualTo(line17)
      ? "Tentative tax (Line 16) >= child's own rate tax (Line 17)"
      : "Child's own rate tax (Line 17) > tentative tax (Line 16)");

  return {
    netUnearnedIncome: line3,
    netUnearnedAtParentRate: line5,
    childRateIncome: line6,
    allocableParentalTax: line13,
    childShareOfParentalTax: line14,
    taxOnChildRateIncome: line15,
    tentativeTax: line16,
    taxAtChildOwnRate: line17,
    tax: line18,
    applies: true,
    lines: audit.getLines(),
  };
}
