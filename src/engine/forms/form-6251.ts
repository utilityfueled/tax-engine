/**
 * Form 6251 — Alternative Minimum Tax (AMT)
 * Spec: spec/federal/form-6251.yaml
 *
 * Calculates AMT by adding back certain deductions to taxable income,
 * applying an exemption (with phase-out), and computing tax at 26%/28%.
 * AMT = max(0, tentative minimum tax - regular tax) → Schedule 2 Line 2.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateAMTCapitalGains, type AMTCapitalGainsInput } from "./amt-capital-gains.js";

export interface Form6251Input {
  taxableIncome: Decimal; // AGI less deductions before the 1040 zero floor
  totalDeductions?: Decimal; // Actual Form1040 line14, before subtracting senior deduction
  standardDeductionAmount?: Decimal; // Actual standard deduction selected on Form 1040
  seniorDeduction?: Decimal; // Schedule 1-A line 37; personal exemption for AMT
  specifiedPrivateActivityBondInterest?: Decimal; // Actual line2g preference
  section1202Preference?: Decimal; // Actual pre2010 exclusion preference on2h
  saltDeduction: Decimal; // Legacy name: actual Schedule A line7 taxes, including elected foreign income taxes.
  investmentInterestAdjustment?: Decimal; // Actual signed regular-minus-AMT deduction on2c
  depletionAdjustment?: Decimal; // Line 2d: Depletion (excess over adjusted basis)
  regularNolDeduction?: Decimal; // Line2e: actual regular deduction restored.
  alternativeTaxNolDeduction?: Decimal; // Line2f: separately calculated ATNOLD, supplied as a positive amount.
  dispositionAdjustment?: Decimal; // Line 2k: Adjusted gain/loss on property dispositions
  depreciationAdjustment?: Decimal; // Line 2l: Post-1986 depreciation adjustment
  otherAdjustments?: Decimal; // Line 3: Other AMT adjustments
  regularTax: Decimal; // Regular tax (before credits) for comparison
  directCreditElectionForeignTaxCredit?: Decimal; // Actual section904(j) credit; same regular and AMT credit.
  ordinaryForeignTaxCredits?: { regular: Decimal; amt: Decimal }; // Separate actual ordinary Form1116 results.
  requiresTentativeMinimumTaxForCredits?: boolean; // Actual8801/3800 consumers require net statutory TMT even when no AMT is due.
  filingStatus: FilingStatus;
  isItemizing: boolean; // Only add back Schedule A taxes if itemizing
  qualifiedDividends?: Decimal; // Part III preferential-income path
  netLongTermCapitalGain?: Decimal; // Part III preferential-income path
  section1250Gain?: Decimal; // Special 25% rate portion
  collectiblesGain?: Decimal; // Special 28% rate portion
  capitalGainsSources?: Omit<AMTCapitalGainsInput, "amtBase" | "filingStatus">;
}

export interface Form6251Result {
  taxableIncome: Decimal; // Original signed income before restoring senior deduction
  saltAddBack: Decimal; // Line 2a
  investmentInterestAdjustment: Decimal; // Line2c; signed actual source difference
  depletionAdjustment: Decimal; // Line 2d
  dispositionAdjustment: Decimal; // Line 2k
  depreciationAdjustment: Decimal; // Line 2l
  otherAdjustments: Decimal; // Line 3
  amti: Decimal; // Line 4: Alternative Minimum Taxable Income
  exemption: Decimal; // Line 5
  amtBase: Decimal; // Line 6
  tentativeMinimumTax: Decimal; // Line 9
  amt: Decimal; // Line 11: excess over regular tax
  lines: CalculatedLine[];
}

export type Form6251IncomeInput = Omit<Form6251Input, "regularTax">;
export interface Form6251IncomeResult { amti: Decimal; lines: CalculatedLine[] }

export function calculateForm6251(input: Form6251IncomeInput, constants: Pick<YearConstants, "amt" | "capitalGainsRates">,
  options: { incomeOnly: true }): Form6251IncomeResult;
export function calculateForm6251(input: Form6251Input, constants: Pick<YearConstants, "amt" | "capitalGainsRates">): Form6251Result;

export function calculateForm6251(
  input: Form6251Input | Form6251IncomeInput,
  constants: Pick<YearConstants, "amt" | "capitalGainsRates">,
  options?: { incomeOnly: true },
): Form6251Result | Form6251IncomeResult {
  const audit = new AuditTrail();
  const amtConst = constants.amt;

  const seniorAddBack = input.seniorDeduction ?? new Decimal(0);
  if (!seniorAddBack.isFinite() || seniorAddBack.lt(0)) throw new Error("AMT senior deduction must be finite and nonnegative");
  if (input.totalDeductions !== undefined) {
    if (!input.totalDeductions.isFinite() || input.totalDeductions.lt(seniorAddBack)) {
      throw new Error("AMT total deductions must be finite and at least the senior deduction");
    }
    audit.record("Form 6251", "1a", "Deductions excluding enhanced senior deduction", input.totalDeductions.minus(seniorAddBack),
      "Form1040 line14 minus Schedule1A line37");
  }
  audit.record("Form 6251", "1b", "Taxable income after AMT-allowed deductions", input.taxableIncome.plus(seniorAddBack),
    "Form1040 line11b minus Form6251 line1a; retain signed income before the1040 zero floor");

  const saltAddBack = input.isItemizing ? input.saltDeduction : new Decimal(0);
  const standardAddBack = input.isItemizing ? new Decimal(0) : input.standardDeductionAmount ?? new Decimal(0);
  audit.record("Form 6251", "2a", "Taxes or standard deduction add-back", saltAddBack.plus(standardAddBack),
    "ScheduleA line7 if itemizing; otherwise actual Form1040 standard deduction");

  const investmentInterestAdjustment = input.investmentInterestAdjustment ?? new Decimal(0);
  if (!investmentInterestAdjustment.isFinite()) throw new Error("AMT investment interest adjustment must be finite");
  if (input.investmentInterestAdjustment !== undefined) {
    audit.record("Form 6251", "2c", "Investment interest adjustment", investmentInterestAdjustment,
      "Actual regular allowed investment interest minus actual AMT allowed interest; preserve either sign");
  }

  // Line 2d: Depletion adjustment (excess over adjusted basis)
  const depletionAdjustment = input.depletionAdjustment ?? new Decimal(0);
  if (!depletionAdjustment.isZero()) {
    audit.record("Form 6251", "2d", "Depletion", depletionAdjustment,
      "Excess of percentage depletion over cost depletion (K-1 Box 17 Code C)");
  }

  const regularNolDeduction = input.regularNolDeduction ?? new Decimal(0);
  const alternativeTaxNolDeduction = input.alternativeTaxNolDeduction ?? new Decimal(0);
  if ((input.regularNolDeduction === undefined) !== (input.alternativeTaxNolDeduction === undefined)) {
    throw new Error("AMT requires separate actual regular and alternative NOL deductions, including known zero");
  }
  if (!regularNolDeduction.isFinite() || regularNolDeduction.lt(0) || !alternativeTaxNolDeduction.isFinite() || alternativeTaxNolDeduction.lt(0)) {
    throw new Error("AMT NOL deductions must be finite and nonnegative");
  }
  if (input.regularNolDeduction !== undefined) {
    audit.record("Form 6251", "2e", "Regular net operating loss deduction", regularNolDeduction,
      "Restore actual regular Section172 deduction included in1040income");
    audit.record("Form 6251", "2f", "Alternative tax net operating loss deduction", alternativeTaxNolDeduction.negated(),
      "Subtract the separately calculated actual ATNOLD; regular carry is not an AMT source");
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
    "Actual source-identified private activity interest and child Form8814 preferences after matching adjustments");

  const rawSection1202Preference = input.section1202Preference ?? new Decimal(0);
  if (!rawSection1202Preference.isFinite() || rawSection1202Preference.lt(0)) throw new Error("Section1202 AMT preference must be finite and nonnegative");
  const section1202Preference = roundDollar(rawSection1202Preference);
  if (input.section1202Preference !== undefined) audit.record("Form 6251", "2h", "Qualified small business stock preference", section1202Preference,
    "Seven percent of verified pre2010 exclusions; retain the full exclusion in the AMT capital-gain worksheets");

  // Line 3: Other AMT adjustments
  const otherAdjustments = input.otherAdjustments ?? new Decimal(0);
  if (!otherAdjustments.isZero()) {
    audit.record("Form 6251", "3", "Other adjustments", otherAdjustments,
      "Other AMT preference/adjustment items (K-1 Box 17 Code F and other sources)");
  }

  // Line 4: AMTI
  const amti = input.taxableIncome
    .plus(saltAddBack)
    .plus(standardAddBack)
    .plus(seniorAddBack)
    .plus(investmentInterestAdjustment)
    .plus(depletionAdjustment)
    .plus(regularNolDeduction)
    .minus(alternativeTaxNolDeduction)
    .plus(dispositionAdjustment)
    .plus(depreciationAdjustment)
    .plus(otherAdjustments)
    .plus(specifiedPrivateActivityBondInterest)
    .plus(section1202Preference);
  audit.record("Form 6251", "4", "AMTI", amti,
    "Taxable income + signed investment adjustment and other AMT adjustments (SALT/standard and senior add-backs, depreciation, depletion, dispositions, other)");

  if (options?.incomeOnly) return { amti, lines: audit.getLines() };
  if (!("regularTax" in input)) throw new Error("Complete AMT requires the actual regular tax comparison");

  // Line 5: Exemption (with phase-out)
  const baseExemption = amtConst.exemption[input.filingStatus];
  const phaseOutThreshold = amtConst.phaseOutThreshold[input.filingStatus];
  const excessOverThreshold = zeroFloor(amti.minus(phaseOutThreshold));
  // 25% for 2025; 50% from 2026 under IRC 55(d)(4)(A)(ii)(IV).
  const exemptionReduction = roundDollar(excessOverThreshold.times(amtConst.phaseOutRate));
  const exemption = zeroFloor(baseExemption.minus(exemptionReduction));
  audit.record("Form 6251", "5", "AMT exemption", exemption,
    `Base ${baseExemption} - phase-out reduction ${exemptionReduction}`);

  // Line 6: AMT base
  const amtBase = zeroFloor(amti.minus(exemption));
  audit.record("Form 6251", "6", "AMT base", amtBase,
    "AMTI - exemption");

  const qualifiedDividends = input.qualifiedDividends ?? new Decimal(0);
  const netLongTermCapitalGain = zeroFloor(input.netLongTermCapitalGain ?? new Decimal(0));
  const section1250Gain = input.section1250Gain ?? new Decimal(0);
  const collectiblesGain = input.collectiblesGain ?? new Decimal(0);
  const preferentialIncome = zeroFloor(qualifiedDividends.plus(netLongTermCapitalGain));

  // Line 7: Tax before AMT foreign tax credit (26% / 28% rates or Part III preferential-income path)
  const rate26Limit = amtConst.rate26Limit[input.filingStatus];
  const fullOrdinaryTax = calculateAMTOrdinaryTax(amtBase, rate26Limit);
  let tentativeMinimumTax = fullOrdinaryTax;
  let line7Source = "26% on first rate breakpoint + 28% on remainder";

  if (input.capitalGainsSources) {
    const capitalGains = calculateAMTCapitalGains({
      ...input.capitalGainsSources, amtBase, filingStatus: input.filingStatus,
    }, constants);
    audit.merge(capitalGains.lines);
    tentativeMinimumTax = capitalGains.tax;
    line7Source = "Actual Form6251 PartIII line40 using separate AMT and regular source worksheets";
  } else if (preferentialIncome.greaterThan(0)) {
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
    line7Source = tentativeMinimumTax.equals(preferentialMethodTax)
      ? "Form 6251 Part III maximum capital gains rates path"
      : "26%/28% AMT tax is lower than Part III result";
  }
  audit.record("Form 6251", "7", "Tax before AMT foreign tax credit", tentativeMinimumTax, line7Source);
  const directCredit = input.directCreditElectionForeignTaxCredit;
  const ordinaryCredits = input.ordinaryForeignTaxCredits;
  let regularTaxComparison = input.regularTax;
  if (ordinaryCredits !== undefined) {
    if (directCredit !== undefined || [ordinaryCredits.regular, ordinaryCredits.amt].some(value => !value.isFinite() || value.lt(0) || !value.isInteger())
      || ordinaryCredits.regular.gt(input.regularTax) || ordinaryCredits.amt.gt(tentativeMinimumTax)) {
      throw new Error("AMT ordinary foreign credits must reconcile their separate actual regular and AMT tax limits");
    }
    regularTaxComparison = input.regularTax.minus(ordinaryCredits.regular);
    audit.record("Form 6251", "8", "Actual ordinary AMT foreign tax credit", ordinaryCredits.amt,
      "Separate AMT Form1116 line35; retain actual net TMT and carryover calculations even when physical line8 may be skipped");
    tentativeMinimumTax = tentativeMinimumTax.minus(ordinaryCredits.amt);
  }
  if (directCredit !== undefined) {
    if (!directCredit.isFinite() || directCredit.lt(0) || !directCredit.isInteger() || directCredit.gt(input.regularTax)
      || directCredit.gt(input.filingStatus === "married_filing_jointly" ? "600" : "300")) throw new Error("AMT direct-election credit must reconcile actual regular tax and the election threshold");
    regularTaxComparison = zeroFloor(input.regularTax.minus(directCredit));
    // Final i6251 permits the physical skip8 when10>=7, but listed credit
    // consumers still need actual net TMT under55(b)(1)(A) and8801line23.
    if (regularTaxComparison.lt(tentativeMinimumTax) || input.requiresTentativeMinimumTaxForCredits === true) {
      audit.record("Form 6251", "8", "Elected direct foreign tax credit for AMT", directCredit,
        "Actual Schedule3line1 credit under904(j), per i6251line8");
      tentativeMinimumTax = zeroFloor(tentativeMinimumTax.minus(directCredit));
    }
  }
  audit.record("Form 6251", "9", "Tentative minimum tax", tentativeMinimumTax,
    ordinaryCredits ? "Line7 less actual separate AMT Form1116 credit" : directCredit === undefined ? "Preview line7 with no AMTFTC; source worksheet qualification remains pending" : "Line7 less actual elected AMTFTC when line8 is required");
  audit.record("Form 6251", "10", "Regular tax comparison", regularTaxComparison,
    ordinaryCredits ? "Regular tax without ScheduleJ plus supported PartI1z, less actual regular Form1116 credit" : directCredit === undefined ? "Actual caller-supplied regular-tax comparison; ScheduleJ averaging excluded" : "Regular tax without ScheduleJ plus PartI1z, less actual elected Schedule3line1 credit");

  // Line 11: AMT = excess of tentative minimum over regular tax
  const amt = zeroFloor(tentativeMinimumTax.minus(regularTaxComparison));
  audit.record("Form 6251", "11", "Alternative Minimum Tax", amt,
    "max(0, tentative minimum - regular tax) → Schedule 2 Line 2");

  return {
    taxableIncome: input.taxableIncome,
    saltAddBack,
    investmentInterestAdjustment,
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
