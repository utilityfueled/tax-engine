/**
 * Form 6251 — Alternative Minimum Tax (AMT)
 * Spec: spec/federal/form-6251.yaml
 *
 * Calculates AMT by adding back certain deductions to taxable income,
 * applying an exemption (with phase-out), and computing tax at 26%/28%.
 * AMT = max(0, tentative minimum tax - regular tax) → Schedule 2 Line 1.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form6251Input {
  taxableIncome: Decimal; // AGI less deductions before the 1040 zero floor
  standardDeductionAmount?: Decimal; // Actual standard deduction selected on Form 1040
  seniorDeduction?: Decimal; // Schedule 1-A line 37; personal exemption for AMT
  specifiedPrivateActivityBondInterest?: Decimal; // Actual line2g preference
  saltDeduction: Decimal; // Line 2a: SALT claimed on Sched A (add back)
  depletionAdjustment?: Decimal; // Line 2c: Depletion (excess over adjusted basis)
  dispositionAdjustment?: Decimal; // Line 2k: Adjusted gain/loss on property dispositions
  depreciationAdjustment?: Decimal; // Line 2l: Post-1986 depreciation adjustment
  otherAdjustments?: Decimal; // Line 3: Other AMT adjustments
  regularTax: Decimal; // Regular tax (before credits) for comparison
  filingStatus: FilingStatus;
  isItemizing: boolean; // Only add back SALT if itemizing
  qualifiedDividends?: Decimal; // Part III preferential-income path
  netLongTermCapitalGain?: Decimal; // Part III preferential-income path
  section1250Gain?: Decimal; // Special 25% rate portion
  collectiblesGain?: Decimal; // Special 28% rate portion
}

export interface Form6251Result {
  taxableIncome: Decimal; // Line 1
  saltAddBack: Decimal; // Line 2a
  depletionAdjustment: Decimal; // Line 2c
  dispositionAdjustment: Decimal; // Line 2k
  depreciationAdjustment: Decimal; // Line 2l
  otherAdjustments: Decimal; // Line 3
  amti: Decimal; // Line 7: Alternative Minimum Taxable Income
  exemption: Decimal; // Line 8
  amtBase: Decimal; // Line 9
  tentativeMinimumTax: Decimal; // Line 10
  amt: Decimal; // Line 11: excess over regular tax
  lines: CalculatedLine[];
}

export function calculateForm6251(
  input: Form6251Input,
  constants: Pick<YearConstants, "amt" | "capitalGainsRates">
): Form6251Result {
  const audit = new AuditTrail();
  const amtConst = constants.amt;

  // Line 1: Taxable income
  audit.record("Form 6251", "1", "Taxable income", input.taxableIncome,
    "AGI less deductions, before the Form 1040 zero floor");

  // Line 2a: SALT add-back (only if itemizing)
  const saltAddBack = input.isItemizing ? input.saltDeduction : new Decimal(0);
  audit.record("Form 6251", "2a", "SALT add-back", saltAddBack,
    "State/local tax deduction added back for AMT");
  const standardAddBack = input.isItemizing ? new Decimal(0) : input.standardDeductionAmount ?? new Decimal(0);
  const seniorAddBack = input.seniorDeduction ?? new Decimal(0);
  if (!standardAddBack.isZero()) audit.record("Form 6251", "2a-standard", "Standard deduction add-back", standardAddBack, "Actual Form 1040 standard deduction is not allowed for AMT");
  if (!seniorAddBack.isZero()) audit.record("Form 6251", "1-senior", "Enhanced senior deduction add-back", seniorAddBack, "Schedule 1-A line 37 is not allowed for AMT");

  // Line 2c: Depletion adjustment (excess over adjusted basis)
  const depletionAdjustment = input.depletionAdjustment ?? new Decimal(0);
  if (!depletionAdjustment.isZero()) {
    audit.record("Form 6251", "2c", "Depletion", depletionAdjustment,
      "Excess of percentage depletion over cost depletion (K-1 Box 17 Code C)");
  }

  // Line 2k: Adjusted gain or loss on dispositions
  const dispositionAdjustment = input.dispositionAdjustment ?? new Decimal(0);
  if (!dispositionAdjustment.isZero()) {
    audit.record("Form 6251", "2k", "Disposition of property", dispositionAdjustment,
      "AMT gain/loss adjustment from assets with different AMT basis (K-1 Box 17 Code B)");
  }

  // Line 2l: Post-1986 depreciation adjustment
  const depreciationAdjustment = input.depreciationAdjustment ?? new Decimal(0);
  if (!depreciationAdjustment.isZero()) {
    audit.record("Form 6251", "2l", "Depreciation on assets placed in service after 1986", depreciationAdjustment,
      "Difference between AMT and regular depreciation (K-1 Box 17 Code A)");
  }

  const specifiedPrivateActivityBondInterest = input.specifiedPrivateActivityBondInterest ?? new Decimal(0);
  if (!specifiedPrivateActivityBondInterest.isFinite() || specifiedPrivateActivityBondInterest.lt(0)) throw new Error("Specified private-activity bond interest must be finite and nonnegative");
  audit.record("Form 6251", "2g", "Specified private activity interest", specifiedPrivateActivityBondInterest,
    "Actual source-identified tax-exempt OID and stated interest after matching adjustments");

  // Line 3: Other AMT adjustments
  const otherAdjustments = input.otherAdjustments ?? new Decimal(0);
  if (!otherAdjustments.isZero()) {
    audit.record("Form 6251", "3", "Other adjustments", otherAdjustments,
      "Other AMT preference/adjustment items (K-1 Box 17 Code F and other sources)");
  }

  // Line 7: AMTI
  const amti = input.taxableIncome
    .plus(saltAddBack)
    .plus(standardAddBack)
    .plus(seniorAddBack)
    .plus(depletionAdjustment)
    .plus(dispositionAdjustment)
    .plus(depreciationAdjustment)
    .plus(otherAdjustments)
    .plus(specifiedPrivateActivityBondInterest);
  audit.record("Form 6251", "7", "AMTI", amti,
    "Taxable income + AMT adjustments (SALT/standard and senior add-backs, depreciation, depletion, dispositions, other)");

  // Line 8: Exemption (with phase-out)
  const baseExemption = amtConst.exemption[input.filingStatus];
  const phaseOutThreshold = amtConst.phaseOutThreshold[input.filingStatus];
  const excessOverThreshold = zeroFloor(amti.minus(phaseOutThreshold));
  // 25% for 2025; 50% from 2026 under IRC 55(d)(4)(A)(ii)(IV).
  const exemptionReduction = roundDollar(excessOverThreshold.times(amtConst.phaseOutRate));
  const exemption = zeroFloor(baseExemption.minus(exemptionReduction));
  audit.record("Form 6251", "8", "AMT exemption", exemption,
    `Base ${baseExemption} - phase-out reduction ${exemptionReduction}`);

  // Line 9: AMT base
  const amtBase = zeroFloor(amti.minus(exemption));
  audit.record("Form 6251", "9", "AMT base", amtBase,
    "AMTI - exemption");

  const qualifiedDividends = input.qualifiedDividends ?? new Decimal(0);
  const netLongTermCapitalGain = zeroFloor(input.netLongTermCapitalGain ?? new Decimal(0));
  const section1250Gain = input.section1250Gain ?? new Decimal(0);
  const collectiblesGain = input.collectiblesGain ?? new Decimal(0);
  const preferentialIncome = zeroFloor(qualifiedDividends.plus(netLongTermCapitalGain));

  // Line 10: Tentative minimum tax (26% / 28% rates or Part III preferential-income path)
  const rate26Limit = amtConst.rate26Limit[input.filingStatus];
  const fullOrdinaryTax = calculateAMTOrdinaryTax(amtBase, rate26Limit);
  let tentativeMinimumTax = fullOrdinaryTax;
  let line10Source = "26% on first rate breakpoint + 28% on remainder";

  if (preferentialIncome.greaterThan(0)) {
    const preferentialMethodTax = calculateAMTPreferentialTax({
      amtBase,
      regularTaxableIncome: input.taxableIncome,
      qualifiedDividends,
      netLongTermCapitalGain,
      section1250Gain,
      collectiblesGain,
      filingStatus: input.filingStatus,
      constants,
    });
    tentativeMinimumTax = min(fullOrdinaryTax, preferentialMethodTax);
    line10Source = tentativeMinimumTax.equals(preferentialMethodTax)
      ? "Form 6251 Part III maximum capital gains rates path"
      : "26%/28% AMT tax is lower than Part III result";
  }
  audit.record("Form 6251", "10", "Tentative minimum tax", tentativeMinimumTax,
    line10Source);

  // Line 11: AMT = excess of tentative minimum over regular tax
  const amt = zeroFloor(tentativeMinimumTax.minus(input.regularTax));
  audit.record("Form 6251", "11", "Alternative Minimum Tax", amt,
    "max(0, tentative minimum - regular tax) → Schedule 2 Line 1");

  return {
    taxableIncome: input.taxableIncome,
    saltAddBack,
    depletionAdjustment,
    dispositionAdjustment,
    depreciationAdjustment,
    otherAdjustments,
    amti,
    exemption,
    amtBase,
    tentativeMinimumTax,
    amt,
    lines: audit.getLines(),
  };
}

function calculateAMTOrdinaryTax(
  amtBase: Decimal,
  rate26Limit: Decimal
): Decimal {
  if (amtBase.lte(rate26Limit)) {
    return roundDollar(amtBase.times(new Decimal(0.26)));
  }

  const at26 = roundDollar(rate26Limit.times(new Decimal(0.26)));
  const at28 = roundDollar(amtBase.minus(rate26Limit).times(new Decimal(0.28)));
  return at26.plus(at28);
}

function calculateAMTPreferentialTax(input: {
  amtBase: Decimal;
  regularTaxableIncome: Decimal;
  qualifiedDividends: Decimal;
  netLongTermCapitalGain: Decimal;
  section1250Gain: Decimal;
  collectiblesGain: Decimal;
  filingStatus: FilingStatus;
  constants: Pick<YearConstants, "amt" | "capitalGainsRates">;
}): Decimal {
  const preferentialIncome = zeroFloor(input.qualifiedDividends.plus(input.netLongTermCapitalGain));
  const preferentialAmtIncome = min(preferentialIncome, input.amtBase);
  if (preferentialAmtIncome.isZero()) {
    return calculateAMTOrdinaryTax(
      input.amtBase,
      input.constants.amt.rate26Limit[input.filingStatus]
    );
  }

  const ordinaryAmtPortion = zeroFloor(input.amtBase.minus(preferentialAmtIncome));
  const ordinaryAmtTax = calculateAMTOrdinaryTax(
    ordinaryAmtPortion,
    input.constants.amt.rate26Limit[input.filingStatus]
  );

  const regularOrdinaryPortion = zeroFloor(input.regularTaxableIncome.minus(preferentialIncome));
  const zeroThreshold = input.constants.capitalGainsRates.zero.threshold[input.filingStatus];
  const fifteenThreshold = input.constants.capitalGainsRates.fifteen.threshold[input.filingStatus];

  let preferentialTax = new Decimal(0);

  const specialRateGain = min(
    input.section1250Gain.plus(input.collectiblesGain),
    preferentialAmtIncome
  );
  const section1250Portion = min(input.section1250Gain, specialRateGain);
  const collectiblesPortion = min(
    input.collectiblesGain,
    specialRateGain.minus(section1250Portion)
  );

  if (collectiblesPortion.greaterThan(0)) {
    preferentialTax = preferentialTax.plus(collectiblesPortion.times(new Decimal(0.28)));
  }
  if (section1250Portion.greaterThan(0)) {
    preferentialTax = preferentialTax.plus(section1250Portion.times(new Decimal(0.25)));
  }

  let remainingPreferential = preferentialAmtIncome.minus(specialRateGain);
  let currentStack = regularOrdinaryPortion;

  if (currentStack.lessThan(zeroThreshold)) {
    const roomAtZero = zeroThreshold.minus(currentStack);
    const taxedAtZero = min(remainingPreferential, roomAtZero);
    remainingPreferential = remainingPreferential.minus(taxedAtZero);
    currentStack = currentStack.plus(taxedAtZero);
  }

  if (remainingPreferential.greaterThan(0) && currentStack.lessThan(fifteenThreshold)) {
    const roomAtFifteen = fifteenThreshold.minus(currentStack);
    const taxedAtFifteen = min(remainingPreferential, roomAtFifteen);
    preferentialTax = preferentialTax.plus(taxedAtFifteen.times(new Decimal(0.15)));
    remainingPreferential = remainingPreferential.minus(taxedAtFifteen);
  }

  if (remainingPreferential.greaterThan(0)) {
    preferentialTax = preferentialTax.plus(remainingPreferential.times(new Decimal(0.20)));
  }

  return ordinaryAmtTax.plus(roundDollar(preferentialTax));
}
