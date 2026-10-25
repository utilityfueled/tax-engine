/** Isolated statutory candidate. Spec: spec/state/oh-2026-baseline.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { OHIO_2026_BASELINE as rules } from "@/models/ohio-2026-baseline.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface Ohio2026BaselineInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** Actual completed Ohio AGI after conformity adjustments and business deduction. */
  ohioAdjustedGrossIncome: Decimal | string;
  businessIncomeDeduction: Decimal | string;
  taxableBusinessIncome: Decimal | string;
  /** Completed eligible-person count, after each person's actual dependency tests. */
  eligibleExemptions: number;
  /** Actual allowed credits preceding the joint credit; not an inferred zero. */
  precedingCredits: Decimal | string;
  /** Actual income after statutory excluded investment/rental categories. */
  primaryQualifyingIncome: Decimal | string;
  spouseQualifyingIncome?: Decimal | string;
}
export interface Ohio2026BaselineResult {
  taxYear: 2026;
  ruleVersion: string;
  calculationStatus: "incomplete";
  filingQualified: false;
  modifiedAdjustedGrossIncome: Decimal;
  exemptionPerPerson: Decimal;
  exemptions: Decimal;
  taxableNonbusinessIncome: Decimal;
  taxableBusinessIncomeAfterExemptions: Decimal;
  nonbusinessTax: Decimal;
  businessTax: Decimal;
  totalTax: Decimal;
  jointCreditRate: Decimal;
  jointFilingCredit: Decimal;
  taxAfterJointCredit: Decimal;
  lines: CalculatedLine[];
}
function actual(value: Decimal | string | undefined, label: string, nonnegative = false): Decimal {
  if (!(value instanceof Decimal) && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) throw new Error(`Ohio baseline requires actual exact ${label}.`);
  const amount = new Decimal(value);
  if (!amount.isFinite() || (nonnegative && amount.lt(0))) throw new Error(`Ohio baseline ${label} must be finite${nonnegative ? " and nonnegative" : ""}.`);
  return amount;
}

export function calculateOhio2026Baseline(input: Ohio2026BaselineInput): Ohio2026BaselineResult {
  if (input.taxYear !== 2026) throw new Error("Ohio enacted baseline is available only for actual tax year2026.");
  if (!["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"].includes(input.filingStatus)) throw new Error("Ohio baseline requires an actual filing status.");
  if (!Number.isSafeInteger(input.eligibleExemptions) || input.eligibleExemptions < 0) throw new Error("Ohio baseline requires the actual completed eligible exemption count.");
  const agi = actual(input.ohioAdjustedGrossIncome, "Ohio AGI");
  const deduction = actual(input.businessIncomeDeduction, "business-income deduction", true);
  const businessIncome = actual(input.taxableBusinessIncome, "taxable business income", true);
  const precedingCredits = actual(input.precedingCredits, "preceding credits", true);
  const primaryIncome = actual(input.primaryQualifyingIncome, "primary qualifying income");
  const spouseIncome = input.filingStatus === "married_filing_jointly" || input.spouseQualifyingIncome !== undefined
    ? actual(input.spouseQualifyingIncome, "spouse qualifying income") : undefined;
  const magi = agi.plus(deduction);
  const exemptionTier = rules.exemptionTiers.find(row => row.maximumMagi === null || magi.lte(row.maximumMagi));
  if (!exemptionTier) throw new Error("Ohio baseline exemption rule data is incomplete.");
  const exemptionPerPerson = magi.lt(rules.exemptionMagiLimit) ? exemptionTier.amount : d("0");
  const exemptions = exemptionPerPerson.times(input.eligibleExemptions);
  const taxableNonbusinessIncome = zeroFloor(agi.minus(exemptions).minus(businessIncome));
  const nonbusinessTax = taxableNonbusinessIncome.lte(rules.nonbusinessThreshold) ? d("0")
    : roundDollar(rules.nonbusinessBaseTax.plus(taxableNonbusinessIncome.minus(rules.nonbusinessThreshold).times(rules.nonbusinessRate)));
  // R.C.5747.02(A)(4)(b) moves only unused exemptions to the business base.
  const unusedExemptions = zeroFloor(exemptions.minus(agi.minus(businessIncome)));
  const taxableBusinessIncomeAfterExemptions = zeroFloor(businessIncome.minus(unusedExemptions));
  const businessTax = roundDollar(taxableBusinessIncomeAfterExemptions.times(rules.businessRate));
  const totalTax = nonbusinessTax.plus(businessTax);
  const taxAfterPrecedingCredits = zeroFloor(totalTax.minus(precedingCredits));
  const magiLessExemptions = magi.minus(exemptions);
  const jointEligible = input.filingStatus === "married_filing_jointly" && magi.lt(rules.jointMagiLimit)
    && primaryIncome.gte(rules.jointMinimumQualifyingIncome) && spouseIncome !== undefined && spouseIncome.gte(rules.jointMinimumQualifyingIncome);
  let jointCreditRate = d("0");
  if (jointEligible) {
    const tier = rules.jointCreditTiers.find(row => row.maximumMagiLessExemptions === null || magiLessExemptions.lte(row.maximumMagiLessExemptions));
    if (!tier) throw new Error("Ohio baseline joint-credit rule data is incomplete.");
    jointCreditRate = tier.rate;
  }
  const jointFilingCredit = min(roundDollar(taxAfterPrecedingCredits.times(jointCreditRate)), rules.jointCreditMaximum);
  const taxAfterJointCredit = taxAfterPrecedingCredits.minus(jointFilingCredit);
  const audit = new AuditTrail();
  for (const [line, description, amount, formula] of [
    ["MAGI", "Actual modified Ohio AGI", magi, "Actual Ohio AGI plus actual business-income deduction"],
    ["4", "Eligible Ohio exemptions", exemptions, "2026 actual-MAGI ceiling and suspended indexed tiers times actual eligible count"],
    ["6", "Business income after unused exemptions", taxableBusinessIncomeAfterExemptions, "max(0,business income-max(0,exemptions-(Ohio AGI-business income))); RC5747.02(A)(4)(b)"],
    ["7", "Taxable nonbusiness income", taxableNonbusinessIncome, "max(0, Ohio AGI - exemptions - taxable business income)"],
    ["8a", "Nonbusiness tax", nonbusinessTax, "Zero through26050; above: round(332 + .0275*(income-26050))"],
    ["8b", "Separate business tax", businessTax, "round(line6*.03), after unused exemptions"],
    ["8c", "Total income tax before credits", totalTax, "8a+8b"],
    ["joint12", "Joint-filing credit", jointFilingCredit, "Actual MAGI<500000 and each qualifying income>=500; tier after exemptions, cap650"],
    ["afterJoint", "Tax after actual preceding and joint credits", taxAfterJointCredit, "max(0,8c-actual preceding credits)-joint12"],
  ] as const) audit.record("OH 2026 baseline candidate", line, description, amount, formula, { "Rule version": rules.metadata.ruleVersion });
  return { taxYear: 2026, ruleVersion: rules.metadata.ruleVersion, calculationStatus: "incomplete", filingQualified: false,
    modifiedAdjustedGrossIncome: magi, exemptionPerPerson, exemptions, taxableNonbusinessIncome, nonbusinessTax,
    taxableBusinessIncomeAfterExemptions, businessTax, totalTax, jointCreditRate, jointFilingCredit, taxAfterJointCredit, lines: audit.getLines() };
}
