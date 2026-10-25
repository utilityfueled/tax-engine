/** Form 8839 — spec/federal/form-8839.yaml. Decimal, year-aware, per-child limits. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { Form8839Child } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { resolveForm8839PriorBenefits, type AdoptionSourceTaxpayer } from "./form-8839-prior-benefits.js";

const ZERO = new Decimal(0);
export interface AdoptionCarryforward { originTaxYear: number; amount: Decimal }
export interface Form8839Params {
  taxYear?: number;
  eligibilityConfirmed?: boolean;
  /** Original return identities used only for actual historical benefit binding. */
  sourceTaxpayer?: AdoptionSourceTaxpayer;
  filingStatus: FilingStatus;
  agi: Decimal;
  children: (Form8839Child & {
    adoptionFinalizedYear?: number | null;
    expensesByYear?: { year: number; amount: string }[];
    employerPlanQualified?: boolean;
    priorYearForeignBenefits?: string;
  })[];
  foreignEarnedIncomeExclusion: Decimal;
  foreignHousingExclusion: Decimal;
  possessionIncomeExclusion?: Decimal;
  /** Completed Part III MAGI worksheet before adoption-benefit income adjustment. */
  exclusionMagi?: Decimal;
  /** Completed credit-limit worksheet after prior-ranking nonrefundable credits. */
  taxLiabilityLimit?: Decimal;
  carryforwards?: AdoptionCarryforward[];
  /** Actual corrected 2025 worksheet, including any IRS systemic adjustment. */
  carryforwardReconciled2025?: boolean;
  constants: {
    maxCreditPerChild: Decimal;
    phaseOutThreshold: Decimal;
    phaseOutRange: Decimal;
    refundablePerChild?: Decimal;
  };
}
export interface Form8839ChildResult {
  childName: string;
  isSpecialNeeds: boolean;
  tentativeCredit: Decimal;
  priorYearCreditsClaimed: Decimal;
  netCredit: Decimal;
  tentativeExclusion: Decimal;
  priorYearExclusionsClaimed: Decimal;
  netExclusion: Decimal;
  creditAfterPhaseOut: Decimal;
  refundableCredit: Decimal;
  exclusionAfterPhaseOut: Decimal;
}
export interface Form8839Result {
  eligible: boolean;
  ineligibleReason?: string;
  maxCreditPerChild: Decimal;
  childResults: Form8839ChildResult[];
  totalTentativeCredit: Decimal;
  totalPriorYearCredits: Decimal;
  netTentativeCredit: Decimal;
  magi: Decimal;
  phaseOutThreshold: Decimal;
  excessMagi: Decimal;
  phaseOutFraction: Decimal;
  phaseOutReduction: Decimal;
  /** Total current credit after MAGI, before refundable/nonrefundable split. */
  adoptionCredit: Decimal;
  refundableAdoptionCredit: Decimal;
  nonrefundableAdoptionCredit: Decimal;
  nonrefundableCreditAvailable: Decimal;
  carryforwardRemaining: Decimal;
  carryforwardByYear: AdoptionCarryforward[];
  expiredCarryforward: Decimal;
  totalEmployerBenefits: Decimal;
  currentEmployerBenefits: Decimal;
  priorYearEmployerBenefits: Decimal;
  totalTentativeExclusion: Decimal;
  totalPriorYearExclusions: Decimal;
  netTentativeExclusion: Decimal;
  exclusionPhaseOutReduction: Decimal;
  allowableExclusion: Decimal;
  /** Physical line31; the historical worksheet separates its prior-year exclusion. */
  taxableEmployerBenefits: Decimal;
  priorYearExcludedBenefits: Decimal;
  /** Signed current income adjustment; historical worksheet9 is subtracted once. */
  adoptionIncomeAdjustment: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm8839(params: Form8839Params): Form8839Result {
  const { filingStatus, agi, children, constants } = params;
  const taxYear = params.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Unsupported Form 8839 tax year");
  if (taxYear === 2026 && (params.eligibilityConfirmed === undefined || params.taxLiabilityLimit === undefined)) {
    throw new Error("2026 adoption calculation requires eligibility and actual tax-liability limit");
  }
  const nonnegative = (value: Decimal, label: string) => {
    if (!value.isFinite() || value.isNegative()) throw new Error(`Invalid adoption ${label}`);
    return value;
  };
  const eligible = params.eligibilityConfirmed !== false && filingStatus !== "married_filing_separately";
  const audit = new AuditTrail();
  const maxCredit = nonnegative(constants.maxCreditPerChild, "maximum");
  const refundableCap = nonnegative(constants.refundablePerChild ?? new Decimal(taxYear === 2025 ? "5000" : "5120"), "refundable cap");
  if (!agi.isFinite() || !constants.phaseOutRange.isFinite() || !constants.phaseOutRange.greaterThan(0)) throw new Error("Invalid adoption MAGI/range");
  const magi = sum(agi, nonnegative(params.foreignEarnedIncomeExclusion, "foreign exclusion"),
    nonnegative(params.foreignHousingExclusion, "foreign housing"), nonnegative(params.possessionIncomeExclusion ?? ZERO, "possession exclusion"));
  const threshold = constants.phaseOutThreshold;
  const excessMagi = zeroFloor(magi.minus(threshold));
  const fraction = (income: Decimal) => Decimal.min(1, zeroFloor(income.minus(threshold)).div(constants.phaseOutRange)).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const phaseOutFraction = fraction(magi);
  const exclusionMagi = params.exclusionMagi ?? magi;
  if (!exclusionMagi.isFinite()) throw new Error("Invalid adoption exclusion MAGI");
  const exclusionFraction = fraction(exclusionMagi);
  const priorBenefitSources = resolveForm8839PriorBenefits({ taxYear, filingStatus,
    eligibilityConfirmed: params.eligibilityConfirmed, sourceTaxpayer: params.sourceTaxpayer, children });
  const historicalWorksheet = priorBenefitSources.some(value => value !== undefined && value.gt(0));
  if (historicalWorksheet && params.exclusionMagi === undefined) throw new Error("Historical adoption requires the actual exclusion MAGI worksheet");
  const priorYearEmployerBenefits = roundDollar(sum(...priorBenefitSources.map(value => value ?? ZERO)));
  const currentEmployerBenefits = roundDollar(sum(...children.map(child => nonnegative(d(child.employerBenefits), "employer benefits"))));
  let totalEmployerBenefits = ZERO;

  const childResults = children.map((child, index): Form8839ChildResult => {
    const childName = child.childName || `Child ${index + 1}`;
    const priorCredits = roundDollar(nonnegative(d(child.priorYearCreditsClaimed), "prior credit limit usage"));
    const priorExclusions = roundDollar(nonnegative(d(child.priorYearExclusionsClaimed), "prior exclusion limit usage"));
    const priorBenefits = priorBenefitSources[index] ?? ZERO;
    const childHistoryWorksheet = priorBenefits.gt(0);
    const rawBenefits = nonnegative(d(child.employerBenefits), "employer benefits").plus(priorBenefits);
    const benefits = roundDollar(rawBenefits);
    totalEmployerBenefits = totalEmployerBenefits.plus(benefits);
    const finalYear = child.adoptionFinalizedYear;
    if (taxYear === 2026 && (finalYear === undefined || child.expensesByYear === undefined)) {
      throw new Error("2026 adoption requires actual finality year and expenses by year");
    }
    if (finalYear !== undefined && finalYear !== null && (!Number.isInteger(finalYear) || finalYear > taxYear || finalYear < 1900)) throw new Error("Invalid adoption finality year");
    const finalized = finalYear === undefined ? child.adoptionBecameFinal : finalYear !== null;
    const finalizedThisYear = finalYear === undefined ? child.adoptionBecameFinal : finalYear === taxYear;
    const special = child.isSpecialNeeds && !child.isForeignAdoption && finalizedThisYear;
    if (taxYear === 2026 && child.isForeignAdoption && finalizedThisYear && child.priorYearForeignBenefits === undefined) {
      throw new Error("2026 foreign adoption requires prior-year employer-benefit history");
    }
    if (taxYear === 2026 && (benefits.greaterThan(0) || (special && child.employerPlanQualified === true)) &&
        (child.employerPlanQualified === undefined || params.exclusionMagi === undefined)) {
      throw new Error("2026 employer adoption benefits require plan qualification and exclusion MAGI");
    }
    let expenses = nonnegative(d(child.qualifiedExpenses), "expenses");
    if (child.expensesByYear !== undefined) {
      expenses = ZERO;
      for (const entry of child.expensesByYear) {
        if (!Number.isInteger(entry.year) || entry.year > taxYear || entry.year < 1900) throw new Error("Invalid adoption expense year");
        const amount = nonnegative(d(entry.amount), "expense amount");
        const eligibleYear = child.isForeignAdoption
          ? finalized && (finalizedThisYear || entry.year === taxYear)
          : finalizedThisYear ? entry.year >= taxYear - 1
            : finalized ? entry.year === taxYear : entry.year === taxYear - 1;
        if (eligibleYear) expenses = expenses.plus(amount);
      }
    }
    expenses = roundDollar(expenses);
    const remainingCredit = zeroFloor(maxCredit.minus(priorCredits));
    const exclusionLimit = childHistoryWorksheet ? Decimal.min(benefits, maxCredit) : maxCredit;
    const remainingExclusion = zeroFloor(exclusionLimit.minus(priorExclusions));
    const claimAllowed = eligible && !(child.isForeignAdoption && !finalized);
    const tentativeCredit = claimAllowed ? Decimal.min(special ? maxCredit : expenses, maxCredit) : ZERO;
    const netCredit = claimAllowed ? Decimal.min(special ? remainingCredit : expenses, remainingCredit) : ZERO;
    // Credit and exclusion have independent lifetime limits. Expenses are already unreimbursed.
    const planEligible = child.employerPlanQualified !== false;
    const specialExclusion = special && child.employerPlanQualified === true;
    const tentativeExclusion = claimAllowed && planEligible ? Decimal.min(specialExclusion ? maxCredit : benefits, maxCredit) : ZERO;
    const netExclusion = claimAllowed && planEligible ? Decimal.min(specialExclusion ? remainingExclusion : benefits, remainingExclusion) : ZERO;
    const reduction = roundDollar(netCredit.times(phaseOutFraction));
    const creditAfterPhaseOut = roundDollar(zeroFloor(netCredit.minus(reduction)));
    const refundableCredit = Decimal.min(creditAfterPhaseOut, refundableCap);
    const exclusionAfterPhaseOut = roundDollar(zeroFloor(netExclusion.minus(roundDollar(netExclusion.times(exclusionFraction)))));
    // Use ordinal audit identifiers: names are taxpayer data, not log/audit keys.
    for (const [line, description, value] of [
      ["2", "Maximum credit", maxCredit], ["3", "Prior credit limit used", priorCredits],
      ["4", "Remaining credit limit", remainingCredit], ["5", "Eligible expenses", special ? remainingCredit : expenses],
      ["6", "Credit before MAGI", netCredit], ["10", "Credit phaseout reduction", reduction],
      ["11a", "Allowed current credit", creditAfterPhaseOut], ["11b", "Refundable credit", refundableCredit],
      ["19", "Maximum exclusion", exclusionLimit], ["20", "Prior exclusion used", priorExclusions],
      ["21", "Remaining exclusion", remainingExclusion], ["22", "Employer benefits", benefits],
      ["24", "Benefits before phaseout", netExclusion], ["28", "Exclusion phaseout reduction", netExclusion.minus(exclusionAfterPhaseOut)],
      ["29", "Excluded benefits", exclusionAfterPhaseOut],
    ] as const) audit.record("Form 8839", `${line}-child-${index + 1}`, description, value, "Spec: Form 8839 per-child worksheet");
    if (childHistoryWorksheet) {
      audit.record("Form 8839", `prior-benefits-source-child-${index + 1}`, "Original current and prior benefit amounts", rawBenefits,
        "Exact original source amounts before worksheet line rounding", { currentBenefits: d(child.employerBenefits), priorBenefits });
      for (const [line, description, value] of [
        ["1", "All current and prior benefits", benefits], ["2", "Finality-year limit", maxCredit],
        ["3", "History-specific exclusion limit", exclusionLimit],
      ] as const) audit.record("Form 8839", `prior-benefits-${line}-child-${index + 1}`, description, value, "Exclusion of Prior Year Benefits Worksheet");
    }
    return { childName, isSpecialNeeds: child.isSpecialNeeds, tentativeCredit, priorYearCreditsClaimed: priorCredits,
      netCredit, tentativeExclusion, priorYearExclusionsClaimed: priorExclusions, netExclusion,
      creditAfterPhaseOut, refundableCredit, exclusionAfterPhaseOut };
  });
  const totalTentativeCredit = sum(...childResults.map(c => c.tentativeCredit));
  const totalPriorYearCredits = sum(...childResults.map(c => c.priorYearCreditsClaimed));
  const netTentativeCredit = sum(...childResults.map(c => c.netCredit));
  const adoptionCredit = sum(...childResults.map(c => c.creditAfterPhaseOut));
  const phaseOutReduction = netTentativeCredit.minus(adoptionCredit);
  const refundableAdoptionCredit = sum(...childResults.map(c => c.refundableCredit));
  const currentNonrefundable = adoptionCredit.minus(refundableAdoptionCredit);
  const vintages = new Map<number, Decimal>();
  let expiredCarryforward = ZERO;
  for (const carry of params.carryforwards ?? []) {
    const amount = roundDollar(nonnegative(carry.amount, "carryforward"));
    if (!Number.isInteger(carry.originTaxYear) || carry.originTaxYear >= taxYear || carry.originTaxYear < 1900) throw new Error("Invalid adoption carryforward origin year");
    if (taxYear === 2026 && amount.greaterThan(0) && params.carryforwardReconciled2025 !== true) throw new Error("2026 adoption carryforward requires corrected 2025 worksheet confirmation");
    if (taxYear - carry.originTaxYear > 5) expiredCarryforward = expiredCarryforward.plus(amount);
    else vintages.set(carry.originTaxYear, (vintages.get(carry.originTaxYear) ?? ZERO).plus(amount));
  }
  const priorCarryforward = sum(...vintages.values());
  const nonrefundableCreditAvailable = eligible ? currentNonrefundable.plus(priorCarryforward) : ZERO;
  const taxLimit = nonnegative(params.taxLiabilityLimit ?? nonrefundableCreditAvailable, "tax liability limit");
  const nonrefundableAdoptionCredit = Decimal.min(nonrefundableCreditAvailable, roundDollar(taxLimit));
  let unusedCreditToAllocate = nonrefundableAdoptionCredit;
  const carryforwardByYear: AdoptionCarryforward[] = [];
  vintages.set(taxYear, currentNonrefundable);
  for (const [originTaxYear, amount] of [...vintages].sort(([a], [b]) => a - b)) {
    const used = Decimal.min(amount, unusedCreditToAllocate);
    unusedCreditToAllocate = unusedCreditToAllocate.minus(used);
    const left = amount.minus(used);
    if (originTaxYear === taxYear - 5) expiredCarryforward = expiredCarryforward.plus(left);
    else if (left.greaterThan(0)) carryforwardByYear.push({originTaxYear, amount:left});
  }
  const carryforwardRemaining = sum(...carryforwardByYear.map(c => c.amount));
  const totalTentativeExclusion = sum(...childResults.map(c => c.tentativeExclusion));
  const totalPriorYearExclusions = sum(...childResults.map(c => c.priorYearExclusionsClaimed));
  const netTentativeExclusion = sum(...childResults.map(c => c.netExclusion));
  const allowableExclusion = sum(...childResults.map(c => c.exclusionAfterPhaseOut));
  const exclusionPhaseOutReduction = netTentativeExclusion.minus(allowableExclusion);
  const taxableEmployerBenefits = historicalWorksheet
    ? zeroFloor(totalEmployerBenefits.minus(allowableExclusion).minus(priorYearEmployerBenefits))
    : roundDollar(totalEmployerBenefits.minus(allowableExclusion));
  const priorYearExcludedBenefits = historicalWorksheet ? zeroFloor(allowableExclusion.minus(currentEmployerBenefits)) : ZERO;
  const adoptionIncomeAdjustment = taxableEmployerBenefits.minus(priorYearExcludedBenefits);
  if (historicalWorksheet) {
    for (const [line, description, value] of [
      ["4", "Benefits above allowed exclusion", zeroFloor(totalEmployerBenefits.minus(allowableExclusion))],
      ["5", "Prior benefits already included in income", priorYearEmployerBenefits],
      ["6", "Current taxable benefits to physical line31", taxableEmployerBenefits],
      ["7", "Total allowed exclusion", allowableExclusion],
      ["8", "Current-year employer benefits", currentEmployerBenefits],
      ["9", "Prior-year benefits excluded this year", priorYearExcludedBenefits],
    ] as const) audit.record("Form 8839", `prior-benefits-${line}`, description, value, "Exclusion of Prior Year Benefits Worksheet; aggregate all children");
    audit.record("Form 8839", "prior-benefits-income-adjustment", "Signed adoption income adjustment", adoptionIncomeAdjustment,
      "Physical line31 less historical worksheet9; reporting interpretation following final2023 instructions, retained separately from physical2025 line31");
  }
  for (const [line, description, value] of [
    ["7", "Modified AGI", magi], ["8", "MAGI excess", excessMagi], ["9", "Phaseout fraction", phaseOutFraction],
    ["11c", "Total refundable credit", refundableAdoptionCredit], ["12", "Total current credit", adoptionCredit],
    ["13", "Refundable adoption credit to Form 1040 line 30", refundableAdoptionCredit],
    ["14", "Current nonrefundable credit", currentNonrefundable], ["15", "Prior carryforward", priorCarryforward],
    ["16", "Available nonrefundable credit", nonrefundableCreditAvailable], ["17", "Tax liability limit", taxLimit],
    ["18", "Nonrefundable adoption credit to Schedule 3 line 6c", nonrefundableAdoptionCredit],
    ["23", "Total employer benefits", totalEmployerBenefits], ["25", "Exclusion MAGI", exclusionMagi],
    ["26", "Exclusion MAGI excess", zeroFloor(exclusionMagi.minus(threshold))], ["27", "Exclusion fraction", exclusionFraction],
    ["30", "Total excluded benefits", allowableExclusion], ["31", "Taxable employer benefits", taxableEmployerBenefits],
    ["carryforward", "Unexpired credit carried to next year", carryforwardRemaining],
    ["expired-carryforward", "Expired unused credit", expiredCarryforward],
  ] as const) audit.record("Form 8839", line, description, value, "Spec: Form 8839 year-specific worksheet");
  return {eligible, ...(!eligible ? {ineligibleReason:filingStatus === "married_filing_separately" ? "Married filing separately cannot claim ordinary adoption credit or exclusion" : "Adoption eligibility not met"} : {}), maxCreditPerChild:maxCredit,
    childResults, totalTentativeCredit, totalPriorYearCredits, netTentativeCredit, magi, phaseOutThreshold:threshold,
    excessMagi, phaseOutFraction, phaseOutReduction, adoptionCredit, refundableAdoptionCredit,
    nonrefundableAdoptionCredit, nonrefundableCreditAvailable, carryforwardRemaining, carryforwardByYear,
    expiredCarryforward, totalEmployerBenefits, currentEmployerBenefits, priorYearEmployerBenefits,
    totalTentativeExclusion, totalPriorYearExclusions, netTentativeExclusion,
    exclusionPhaseOutReduction, allowableExclusion, taxableEmployerBenefits, priorYearExcludedBenefits, adoptionIncomeAdjustment,
    lines:audit.getLines()};
}
