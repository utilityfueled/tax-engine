/**
 * Form 8615 — Tax for Certain Children Who Have Unearned Income (Kiddie Tax).
 * Spec: spec/federal/form-8615.yaml
 *
 * Implements IRC §1(g): children under 19 (or under 24 if full-time students)
 * whose unearned income exceeds the threshold pay tax on the net unearned
 * income at their parent's marginal rate instead of their own.
 *
 * Lines 9 and 10 use the parent's rates. Lines 15 and 17 use the child's rates.
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
  /** Line 14: Child's taxable income taxed at child's rate */
  childRateIncome: Decimal;
  /** Line 11: Allocable parental tax (total for all Form 8615 children) */
  allocableParentalTax: Decimal;
  /** Line 13: This child's share of allocable parental tax */
  childShareOfParentalTax: Decimal;
  /** Line 15: Tax on child's remaining income at child's rate */
  taxOnChildRateIncome: Decimal;
  /** Line 16: Tentative tax (Line 13 + Line 15) */
  tentativeTax: Decimal;
  /** Line 17: Tax on child's full taxable income at child's own rate */
  taxAtChildOwnRate: Decimal;
  /** Line 18: Final Form 8615 tax = max(Line 16, Line 17) */
  tax: Decimal;
  /** Whether Line 5 requires the Form 8615 tax calculation */
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
  const { unearnedIncomeThreshold, itemizingThreshold } = constants.kiddieTax;
  let line2 = unearnedIncomeThreshold;
  if (input.childItemizesDeductions) {
    const reportedDeductions = input.childDirectlyConnectedItemizedDeductions?.trim();
    const directlyConnectedDeductions = reportedDeductions ? d(reportedDeductions) : undefined;
    if (!directlyConnectedDeductions?.isFinite() || directlyConnectedDeductions.lt(0)) {
      throw new Error("Form 8615 requires a nonnegative directly connected itemized deduction amount, including zero if none");
    }
    line2 = Decimal.max(unearnedIncomeThreshold, itemizingThreshold.plus(directlyConnectedDeductions));
    audit.record("8615", "2", "Threshold deduction", line2,
      "Greater of the unearned-income threshold or the minimum dependent standard deduction plus directly connected itemized deductions",
      { unearnedIncomeThreshold, minimumDependentStandardDeduction: itemizingThreshold, directlyConnectedDeductions });
  } else {
    audit.record("8615", "2", "Threshold deduction", line2,
      "Non-itemizing child: 2x minimum dependent standard deduction");
  }

  // ── Line 3: Net unearned income ──
  const line3 = line1.minus(line2);
  audit.record("8615", "3", "Net unearned income", line3, "Line 1 - Line 2");

  const line4 = childTaxableIncome;
  let line5 = zero;
  if (line3.gt(0)) {
    audit.record("8615", "4", "Child's taxable income", line4, "From Form 1040 Line 15");
    line5 = min(line3, line4);
    audit.record("8615", "5", "Net unearned income taxed at parent's rate", line5, "min(Line 3, Line 4)");
  }
  if (line5.lte(0)) {
    return {
      netUnearnedIncome: zeroFloor(line3),
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

  const childQD = d(input.childQualifiedDividends);
  const childLTCG = d(input.childNetLTCG);
  const hasChildPreferences = childQD.gt(0) || childLTCG.gt(0);
  if (input.childItemizesDeductions && hasChildPreferences) {
    throw new Error("Form 8615 for an itemizing child with preferential income requires a separate worksheet");
  }

  // ── Lines 6–8: Income for the parental tax calculation ──
  const line6 = zeroFloor(d(input.parentTaxableIncome));
  audit.record("8615", "6", "Parent's taxable income", line6, "max(0, parent's Form 1040 Line 15)");

  const line7 = d(input.otherChildrenNetUnearnedIncome);
  const hasOtherChildren = !line7.isZero();
  if (hasOtherChildren) {
    audit.record("8615", "7", "Other children's net unearned income", line7, "Sum of Line 5 from other children's Forms 8615");
  }

  const childUnearnedTotal = line5.plus(line7);
  const line8 = line6.plus(childUnearnedTotal);
  audit.record("8615", "8", "Combined income for parental tax calculation", line8, "Line 5 + Line 6 + Line 7");

  // ── Lines 9 and 10: Tax at parent's rates ──
  const parentFilingStatus = input.parentFilingStatus as FilingStatus;
  const parentQD = d(input.parentQualifiedDividends);
  const parentLTCG = d(input.parentNetLTCG);
  const parentSection1250 = d(input.parentSection1250Gain);
  const parentCollectibles = d(input.parentCollectiblesGain);

  const hasParentQDCG = parentQD.greaterThan(0) || parentLTCG.greaterThan(0);
  const facts = hasChildPreferences ? input.preferentialWorksheetFacts : undefined;
  let qdOnLine5 = zero;
  let gainOnLine5 = zero;
  if (hasChildPreferences) {
    if (constants.taxYear !== 2025 || !facts || facts.noOtherChildUsesParentReturn !== true
      || facts.childUsesOrdinaryQdcgWorksheet !== true || hasOtherChildren || !line5.eq(line3)
      || !parentSection1250.isZero() || !parentCollectibles.isZero()
      || facts.parentTaxMethod !== (hasParentQDCG ? "qualified-dividends-and-capital-gain" : "ordinary")) {
      throw new Error("Form 8615 child preferential income requires confirmed 2025 Worksheet 1 facts and a supported tax composition");
    }
    if (childQD.lt(0) || childLTCG.lt(0) || childQD.plus(childLTCG).gt(line1)
      || parentQD.lt(0) || parentLTCG.lt(0) || parentQD.plus(parentLTCG).gt(line6)) {
      throw new Error("Form 8615 reported preferential amounts must fit within the verified income");
    }
    qdOnLine5 = min(line5, zeroFloor(childQD.minus(line2.times(childQD.dividedBy(line1)))));
    gainOnLine5 = min(line5.minus(qdOnLine5), zeroFloor(childLTCG.minus(line2.times(childLTCG.dividedBy(line1)))));
  }

  const parentPreferences = { section1250Gain: parentSection1250, collectiblesGain: parentCollectibles };
  const line10 = hasParentQDCG
    ? calculateCapitalGainsTax(line6, parentQD, parentLTCG, parentFilingStatus, constants, parentPreferences).tax
    : calculateRegularIncomeTax(line6, parentFilingStatus, constants);
  if (facts && !d(facts.parentAdjustedLine16Tax).eq(line10)) {
    throw new Error("Form 8615 parent's reported adjusted Form 1040 Line 16 tax does not reconcile");
  }
  const combinedQD = parentQD.plus(qdOnLine5);
  const combinedGain = parentLTCG.plus(gainOnLine5);
  const hasCombinedPreferences = combinedQD.gt(0) || combinedGain.gt(0);
  const line9 = hasCombinedPreferences
    ? calculateCapitalGainsTax(line8, combinedQD, combinedGain, parentFilingStatus, constants, parentPreferences).tax
    : calculateRegularIncomeTax(line8, parentFilingStatus, constants);

  audit.record("8615", "9", "Tax on combined income at parent's rates", line9,
    hasCombinedPreferences ? "Tax on Line 8 using the applicable preferential tax worksheet and parent's filing status"
      : "Tax on Line 8 using the Tax Table or Tax Computation Worksheet and parent's filing status",
    facts ? { childQualifiedDividendsOnLine5: qdOnLine5, childNetCapitalGainOnLine5: gainOnLine5 } : undefined);
  audit.record("8615", "10", "Tax on parent's taxable income", line10,
    facts ? "Adjusted tax from parent's Form 1040 Line 16, reconciled to stated tax sources"
      : "Tax recomputed on Line 6 using parent's applicable worksheet, table or filing status");

  // ── Lines 11–13: Allocable parental tax and this child's share ──
  const line11 = zeroFloor(line9.minus(line10));
  audit.record("8615", "11", "Allocable parental tax", line11, "max(0, Line 9 - Line 10)");

  let line13 = line11;
  if (hasOtherChildren) {
    const line12b = childUnearnedTotal.gt(0) ? line5.dividedBy(childUnearnedTotal) : zero;
    audit.record("8615", "12a", "Total net unearned income of all children", childUnearnedTotal, "Line 5 + Line 7");
    audit.record("8615", "12b", "Child's share of total net unearned income", line12b, "Line 5 / Line 12a");

    // Multiply before dividing so a finite representation of the ratio cannot change a half-dollar tie.
    line13 = childUnearnedTotal.gt(0)
      ? roundDollar(line11.times(line5).dividedBy(childUnearnedTotal))
      : zero;
  }
  audit.record("8615", "13", "Child's share of allocable parental tax", line13,
    hasOtherChildren ? "Round Line 11 × (Line 5 / Line 12a) to whole dollars" : "Copy Line 11 when Line 7 is blank");

  // ── Line 14: Child's taxable income taxed at child's own rate ──
  const line14 = line4.minus(line5);
  audit.record("8615", "14", "Child's taxable income at child's own rate", line14, "Line 4 - Line 5");

  // ── Line 15: Tax on child's remaining income at child's rate ──
  const qdOnLine14 = zeroFloor(childQD.minus(qdOnLine5));
  const ltcgOnLine14 = zeroFloor(childLTCG.minus(gainOnLine5));

  let line15: Decimal;
  const hasChildQDCGOnLine14 = qdOnLine14.greaterThan(0) || ltcgOnLine14.greaterThan(0);

  if (line14.isZero()) {
    line15 = zero;
  } else if (hasChildQDCGOnLine14) {
    const taxOnLine14 = calculateCapitalGainsTax(
      line14, qdOnLine14, ltcgOnLine14, childFilingStatus, constants
    );
    line15 = taxOnLine14.tax;
  } else {
    line15 = calculateRegularIncomeTax(line14, childFilingStatus, constants);
  }
  audit.record("8615", "15", "Tax on child's remaining income at child's rate", line15,
    hasChildQDCGOnLine14
      ? `Tax on Line 14, using QD $${qdOnLine14} and LTCG $${ltcgOnLine14}`
      : "Actual-year TaxTable/TaxComputationWorksheet using child's filing status");

  // ── Line 16: Tentative tax ──
  const line16 = line13.plus(line15);
  audit.record("8615", "16", "Tentative tax", line16, "Line 13 + Line 15");

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
    childRateIncome: line14,
    allocableParentalTax: line11,
    childShareOfParentalTax: line13,
    taxOnChildRateIncome: line15,
    tentativeTax: line16,
    taxAtChildOwnRate: line17,
    tax: line18,
    applies: true,
    lines: audit.getLines(),
  };
}
