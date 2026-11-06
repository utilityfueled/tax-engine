/**
 * Form 8606 traditional IRA basis allocation.
 * Spec: spec/federal/form-8606.yaml
 *
 * This slice covers the Part I, Part II, and core Part III lines needed to
 * allocate nondeductible traditional IRA basis across current-year
 * distributions, Roth conversions, and Roth IRA distributions.
 */

import Decimal from "decimal.js";
import type { Form8606Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface RothContributionBasisYearEntry {
  year: number;
  contributionAmount: Decimal;
  previouslyWithdrawnTaxFree: Decimal;
  basisRemaining: Decimal;
}

export interface RothConversionBasisYearEntry {
  year: number;
  conversionAmount: Decimal;
  previouslyRecoveredTaxFree: Decimal;
  basisRemaining: Decimal;
}

export interface Form8606Result {
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  outstandingRollovers: Decimal;
  currentYearRepaymentsTreatedAsRollovers: Decimal;
  qualifiedCharitableDistributions: Decimal;
  rolledOverDistributions: Decimal;
  returnedContributionsByDueDate: Decimal;
  returnedExcessContributions: Decimal;
  qualifiedHsaFundingDistributions: Decimal;
  qualifiedDisasterDistributions: Decimal;
  repaymentEligibleDistributions: Decimal;
  line15cExceptionNumber?: string;
  repaymentWithin3YearWindow: Decimal;
  priorYearLine15cBasisAdjustment: Decimal;
  line7Exclusions: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15a: Decimal;
  line15b: Decimal;
  line15c: Decimal;
  line15cRepaymentEligibleTaxableShare: Decimal;
  line15cRepaymentEligibleRemainingTaxableShare: Decimal;
  line15cRepaymentReduction: Decimal;
  line15cBasisAdjustment: Decimal;
  line16: Decimal;
  line17: Decimal;
  line18: Decimal;
  qualifiedRothDistributionsExcludedFromLine19: Decimal;
  rothRolledOverDistributions: Decimal;
  rothReturnedContributionsByDueDate: Decimal;
  rothReturnedExcessContributions: Decimal;
  rothQualifiedHsaFundingDistributions: Decimal;
  line19Exclusions: Decimal;
  priorQualifiedFirstTimeHomebuyerDistributions: Decimal;
  priorYearLine25cBasisAdjustment: Decimal;
  rothContributionBasis: Decimal;
  rothConversionBasis: Decimal;
  rothQualifiedDisasterDistributions: Decimal;
  rothRepaymentEligibleDistributions: Decimal;
  line25cExceptionNumber?: string;
  rothRepaymentsWithin3YearWindow: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line23: Decimal;
  line24: Decimal;
  line25a: Decimal;
  line25b: Decimal;
  line25c: Decimal;
  line25cRepaymentEligibleTaxableShare: Decimal;
  line25cRepaymentEligibleRemainingTaxableShare: Decimal;
  line25cRepaymentReduction: Decimal;
  line25cBasisAdjustment: Decimal;
  taxableTraditionalDistributions: Decimal;
  taxableRothConversions: Decimal;
  taxableRothDistributions: Decimal;
  /** Per-year Roth contribution basis chart after FIFO depletion, for next-year carryforward */
  rothContributionBasisByYearCarryforward?: RothContributionBasisYearEntry[];
  /** Per-year Roth conversion basis chart after FIFO depletion, for next-year carryforward */
  rothConversionBasisByYearCarryforward?: RothConversionBasisYearEntry[];
  lines: CalculatedLine[];
}

export function calculateForm8606(input: Form8606Input): Form8606Result {
  const audit = new AuditTrail();

  const qualifiedReservistDistributionRepayments = d(input.qualifiedReservistDistributionRepayments);
  // Preserve source cents until a complete form line has been assembled. The
  // return uses whole-dollar monetary lines; line10 is the separate ratio rule.
  const line1 = roundDollar(d(input.nondeductibleContributions).plus(qualifiedReservistDistributionRepayments));
  const line2 = roundDollar(d(input.priorYearBasis));
  const line3 = line1.plus(line2);
  const line4 = roundDollar(d(input.contributionsMadeNextYear));
  const line5 = Decimal.max(new Decimal(0), line3.minus(line4));
  const outstandingRollovers = Decimal.max(new Decimal(0), d(input.outstandingRollovers));
  const currentYearRepaymentsTreatedAsRollovers = clampExclusion(
    d(input.currentYearRepaymentsTreatedAsRollovers),
    d(input.yearEndValue).plus(outstandingRollovers)
  );
  const line6 = roundDollar(Decimal.max(
    new Decimal(0),
    d(input.yearEndValue)
      .plus(outstandingRollovers)
      .minus(currentYearRepaymentsTreatedAsRollovers)
  ));
  const traditionalDistributions = Decimal.max(new Decimal(0), d(input.traditionalDistributions));
  const qualifiedCharitableDistributions = clampExclusion(
    d(input.qualifiedCharitableDistributions),
    traditionalDistributions
  );
  const remainingAfterQcd = Decimal.max(new Decimal(0), traditionalDistributions.minus(qualifiedCharitableDistributions));
  const rolledOverDistributions = clampExclusion(
    d(input.rolledOverDistributions),
    remainingAfterQcd
  );
  const remainingAfterRollovers = Decimal.max(new Decimal(0), remainingAfterQcd.minus(rolledOverDistributions));
  const returnedContributionsByDueDate = clampExclusion(
    d(input.returnedContributionsByDueDate),
    remainingAfterRollovers
  );
  const remainingAfterReturnedContributionsByDueDate = Decimal.max(
    new Decimal(0),
    remainingAfterRollovers.minus(returnedContributionsByDueDate)
  );
  const returnedExcessContributions = clampExclusion(
    d(input.returnedExcessContributions),
    remainingAfterReturnedContributionsByDueDate
  );
  const remainingAfterReturnedExcess = Decimal.max(
    new Decimal(0),
    remainingAfterReturnedContributionsByDueDate.minus(returnedExcessContributions)
  );
  const qualifiedHsaFundingDistributions = clampExclusion(
    d(input.qualifiedHsaFundingDistributions),
    remainingAfterReturnedExcess
  );
  const line7Exclusions = qualifiedCharitableDistributions
    .plus(rolledOverDistributions)
    .plus(returnedContributionsByDueDate)
    .plus(returnedExcessContributions)
    .plus(qualifiedHsaFundingDistributions);
  const line7 = roundDollar(Decimal.max(new Decimal(0), traditionalDistributions.minus(line7Exclusions)));
  const line8 = roundDollar(d(input.rothConversions));
  const line9 = line6.plus(line7).plus(line8);
  const line10 = line9.isZero()
    ? new Decimal(0)
    : Decimal.min(new Decimal(1), line5.dividedBy(line9)).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const line11 = roundDollar(line8.times(line10));
  const line12 = roundDollar(line7.times(line10));
  const line13 = line11.plus(line12);
  const priorYearLine15cBasisAdjustment = roundDollar(Decimal.max(new Decimal(0), d(input.priorYearLine15cBasisAdjustment)));
  const line14 = Decimal.max(new Decimal(0), line3.minus(line13)).plus(priorYearLine15cBasisAdjustment);
  const line15a = Decimal.max(new Decimal(0), line7.minus(line12));
  const qualifiedDisasterDistributions = roundDollar(clampExclusion(
    d(input.qualifiedDisasterDistributions),
    line7
  ));
  const line15b = line7.isZero()
    ? new Decimal(0)
    : roundDollar(line15a.times(qualifiedDisasterDistributions.dividedBy(line7)));
  const line15cBase = Decimal.max(new Decimal(0), line15a.minus(line15b));
  const repaymentEligibleDistributions = roundDollar(clampExclusion(
    d(input.repaymentEligibleDistributions),
    line7
  ));
  const line15cExceptionNumber = repaymentEligibleDistributions.greaterThan(0)
    ? input.repaymentDistributionExceptionNumber
    : undefined;
  const repaymentWithin3YearWindow = roundDollar(clampExclusion(
    d(input.repaymentWithin3YearWindow),
    repaymentEligibleDistributions
  ));
  const line15cRepaymentEligibleTaxableShare = line7.isZero()
    ? new Decimal(0)
    : roundDollar(line15a.times(repaymentEligibleDistributions.dividedBy(line7)));
  const line15cRepaymentReduction = Decimal.min(
    line15cRepaymentEligibleTaxableShare,
    repaymentWithin3YearWindow
  );
  const line15cRepaymentEligibleRemainingTaxableShare = Decimal.max(
    new Decimal(0),
    line15cRepaymentEligibleTaxableShare.minus(line15cRepaymentReduction)
  );
  const line15cBasisAdjustment = Decimal.max(
    new Decimal(0),
    repaymentWithin3YearWindow.minus(line15cRepaymentReduction)
  );
  const line15c = Decimal.max(new Decimal(0), line15cBase.minus(line15cRepaymentReduction));
  const line16 = line8;
  const line17 = line11;
  const line18 = Decimal.max(new Decimal(0), line16.minus(line17));
  const rothDistributions = Decimal.max(new Decimal(0), d(input.rothDistributions));
  const qualifiedRothDistributionsExcludedFromLine19 = clampExclusion(
    d(input.qualifiedRothDistributionsExcludedFromLine19),
    rothDistributions
  );
  const remainingAfterQualifiedRothDistributions = Decimal.max(
    new Decimal(0),
    rothDistributions.minus(qualifiedRothDistributionsExcludedFromLine19)
  );
  const rothRolledOverDistributions = clampExclusion(
    d(input.rothRolledOverDistributions),
    remainingAfterQualifiedRothDistributions
  );
  const remainingAfterRothRollovers = Decimal.max(
    new Decimal(0),
    remainingAfterQualifiedRothDistributions.minus(rothRolledOverDistributions)
  );
  const rothReturnedContributionsByDueDate = clampExclusion(
    d(input.rothReturnedContributionsByDueDate),
    remainingAfterRothRollovers
  );
  const remainingAfterRothReturnedContributionsByDueDate = Decimal.max(
    new Decimal(0),
    remainingAfterRothRollovers.minus(rothReturnedContributionsByDueDate)
  );
  const rothReturnedExcessContributions = clampExclusion(
    d(input.rothReturnedExcessContributions),
    remainingAfterRothReturnedContributionsByDueDate
  );
  const remainingAfterRothReturnedExcessContributions = Decimal.max(
    new Decimal(0),
    remainingAfterRothReturnedContributionsByDueDate.minus(rothReturnedExcessContributions)
  );
  const rothQualifiedHsaFundingDistributions = clampExclusion(
    d(input.rothQualifiedHsaFundingDistributions),
    remainingAfterRothReturnedExcessContributions
  );
  const line19Exclusions = qualifiedRothDistributionsExcludedFromLine19
    .plus(rothRolledOverDistributions)
    .plus(rothReturnedContributionsByDueDate)
    .plus(rothReturnedExcessContributions)
    .plus(rothQualifiedHsaFundingDistributions);
  const line19 = roundDollar(Decimal.max(new Decimal(0), rothDistributions.minus(line19Exclusions)));
  const priorQualifiedFirstTimeHomebuyerDistributions = clampExclusion(
    d(input.priorQualifiedFirstTimeHomebuyerDistributions),
    new Decimal(10000)
  );
  const remainingFirstTimeHomebuyerLimit = Decimal.max(
    new Decimal(0),
    new Decimal(10000).minus(priorQualifiedFirstTimeHomebuyerDistributions)
  );
  const line20 = roundDollar(clampExclusion(
    d(input.qualifiedFirstTimeHomebuyerExpenses),
    Decimal.min(line19, remainingFirstTimeHomebuyerLimit)
  ));
  const line21 = Decimal.max(new Decimal(0), line19.minus(line20));
  const priorYearLine25cBasisAdjustment = Decimal.max(new Decimal(0), d(input.priorYearLine25cBasisAdjustment));
  // Line 22: Per-year contribution basis chart takes precedence over single value when provided
  const contribPerYearChart = input.rothContributionBasisByYear;
  const hasContribPerYearChart = contribPerYearChart !== undefined && contribPerYearChart.length > 0;
  const sortedContribChart = hasContribPerYearChart
    ? [...contribPerYearChart]
        .sort((a, b) => a.year - b.year)
        .map((entry) => ({
          year: entry.year,
          contributionAmount: Decimal.max(new Decimal(0), d(entry.contributionAmount)),
          previouslyWithdrawnTaxFree: Decimal.max(new Decimal(0), d(entry.previouslyWithdrawnTaxFree)),
        }))
        .map((entry) => ({
          ...entry,
          basisRemaining: Decimal.max(new Decimal(0), entry.contributionAmount.minus(entry.previouslyWithdrawnTaxFree)),
        }))
    : undefined;
  const rothContributionBasis = hasContribPerYearChart
    ? sortedContribChart!.reduce((sum, entry) => sum.plus(entry.basisRemaining), new Decimal(0))
    : Decimal.max(new Decimal(0), d(input.rothContributionBasis));
  const line22 = roundDollar(rothContributionBasis.plus(priorYearLine25cBasisAdjustment));
  const line23 = Decimal.max(new Decimal(0), line21.minus(line22));
  // Line 24: Per-year chart takes precedence over single value when provided
  const perYearChart = input.rothConversionBasisByYear;
  const hasPerYearChart = perYearChart !== undefined && perYearChart.length > 0;
  const sortedChart = hasPerYearChart
    ? [...perYearChart]
        .sort((a, b) => a.year - b.year)
        .map((entry) => ({
          year: entry.year,
          conversionAmount: Decimal.max(new Decimal(0), d(entry.conversionAmount)),
          previouslyRecoveredTaxFree: Decimal.max(new Decimal(0), d(entry.previouslyRecoveredTaxFree)),
        }))
        .map((entry) => ({
          ...entry,
          basisRemaining: Decimal.max(new Decimal(0), entry.conversionAmount.minus(entry.previouslyRecoveredTaxFree)),
        }))
    : undefined;
  const rothConversionBasis = hasPerYearChart
    ? sortedChart!.reduce((sum, entry) => sum.plus(entry.basisRemaining), new Decimal(0))
    : Decimal.max(new Decimal(0), d(input.rothConversionBasis));
  const line24 = roundDollar(rothConversionBasis);
  const line25a = Decimal.max(new Decimal(0), line23.minus(line24));
  const rothQualifiedDisasterDistributions = roundDollar(clampExclusion(
    d(input.rothQualifiedDisasterDistributions),
    line21
  ));
  const line25b = line21.isZero()
    ? new Decimal(0)
    : roundDollar(line25a.times(rothQualifiedDisasterDistributions.dividedBy(line21)));
  const line25cBase = Decimal.max(new Decimal(0), line25a.minus(line25b));
  const rothRepaymentEligibleDistributions = roundDollar(clampExclusion(
    d(input.rothRepaymentEligibleDistributions),
    line21
  ));
  const line25cExceptionNumber = rothRepaymentEligibleDistributions.greaterThan(0)
    ? input.rothRepaymentDistributionExceptionNumber
    : undefined;
  const line25cRepaymentEligibleTaxableShare = line21.isZero()
    ? new Decimal(0)
    : roundDollar(line25a.times(rothRepaymentEligibleDistributions.dividedBy(line21)));
  const rothRepaymentEligibleRepaymentCap = rothRepaymentEligibleDistributions;
  const rothRepaymentsWithin3YearWindow = roundDollar(clampExclusion(
    d(input.rothRepaymentsWithin3YearWindow),
    rothRepaymentEligibleRepaymentCap
  ));
  const line25cRepaymentEligibleRemainingTaxableShare = Decimal.max(
    new Decimal(0),
    line25cRepaymentEligibleTaxableShare.minus(
      Decimal.min(line25cRepaymentEligibleTaxableShare, rothRepaymentsWithin3YearWindow)
    )
  );
  // Unlike the traditional line15c worksheet, Roth worksheet line3 subtracts
  // actual qualifying repayments from all of worksheet line2. The separate
  // eligible-category share remains a Form5329 trace, not a repayment tax cap.
  const line25cRepaymentReduction = Decimal.min(
    line25cBase,
    rothRepaymentsWithin3YearWindow
  );
  const line25cBasisAdjustment = Decimal.max(
    new Decimal(0),
    rothRepaymentsWithin3YearWindow.minus(line25cRepaymentReduction)
  );
  const line25c = Decimal.max(new Decimal(0), line25cBase.minus(line25cRepaymentReduction));

  // FIFO depletion of per-year contribution basis chart
  // The next year's line22 worksheet subtracts this year's line19. Homebuyer
  // relief affects current tax but does not restore withdrawn contribution basis.
  const contributionBasisConsumed = Decimal.min(line19, line22);
  const rothContributionBasisByYearCarryforward: RothContributionBasisYearEntry[] | undefined =
    sortedContribChart !== undefined
      ? (() => {
          let remaining = contributionBasisConsumed;
          return sortedContribChart.map((entry) => {
            const consume = Decimal.min(remaining, entry.basisRemaining);
            remaining = remaining.minus(consume);
            const newWithdrawn = entry.previouslyWithdrawnTaxFree.plus(consume);
            return {
              year: entry.year,
              contributionAmount: entry.contributionAmount,
              previouslyWithdrawnTaxFree: newWithdrawn,
              basisRemaining: Decimal.max(new Decimal(0), entry.contributionAmount.minus(newWithdrawn)),
            };
          });
        })()
      : undefined;

  // FIFO depletion of per-year conversion basis chart
  // The conversions basis chart refigures prior line23 without line20.
  const conversionBasisConsumed = Decimal.min(Decimal.max(new Decimal(0), line19.minus(line22)), line24);
  const rothConversionBasisByYearCarryforward: RothConversionBasisYearEntry[] | undefined =
    sortedChart !== undefined
      ? (() => {
          let remaining = conversionBasisConsumed;
          return sortedChart.map((entry) => {
            const consume = Decimal.min(remaining, entry.basisRemaining);
            remaining = remaining.minus(consume);
            const newRecovered = entry.previouslyRecoveredTaxFree.plus(consume);
            return {
              year: entry.year,
              conversionAmount: entry.conversionAmount,
              previouslyRecoveredTaxFree: newRecovered,
              basisRemaining: Decimal.max(new Decimal(0), entry.conversionAmount.minus(newRecovered)),
            };
          });
        })()
      : undefined;

  audit.record(
    "Form 8606",
    "1",
    "Nondeductible traditional IRA contributions for the tax year",
    line1,
    qualifiedReservistDistributionRepayments.isZero()
      ? "Current-year nondeductible traditional IRA contributions"
      : "Current-year nondeductible traditional IRA contributions plus repayments of qualified reservist distributions made in the tax year",
    {
      "Current-year nondeductible traditional IRA contributions": d(input.nondeductibleContributions),
      "Qualified reservist distribution repayments": qualifiedReservistDistributionRepayments,
    }
  );
  audit.record("Form 8606", "2", "Basis in traditional IRAs from prior year", line2, "Prior-year Form 8606 basis carryforward");
  audit.record("Form 8606", "3", "Total basis before current-year reductions", line3, "Line 1 + Line 2", {
    "Line 1": line1,
    "Line 2": line2,
  });
  audit.record("Form 8606", "4", "Contributions made in the following year and designated for the tax year", line4, "Traditional IRA contributions made after year end and designated for the current tax year");
  audit.record("Form 8606", "5", "Basis available for pro-rata allocation", line5, "Line 3 - Line 4", {
    "Line 3": line3,
    "Line 4": line4,
  });
  audit.record("Form 8606", "6", "Value of all traditional, SEP, and SIMPLE IRAs at year end", line6,
    currentYearRepaymentsTreatedAsRollovers.isZero()
      ? "December 31 fair market value of all traditional, SEP, and SIMPLE IRAs plus outstanding rollovers"
      : "December 31 fair market value of all traditional, SEP, and SIMPLE IRAs plus outstanding rollovers, reduced by same-year qualifying repayments treated as rollovers, limited so the result is not below zero",
    {
      "Year-end IRA value": d(input.yearEndValue),
      "Outstanding rollovers": outstandingRollovers,
      "Same-year qualifying repayments": currentYearRepaymentsTreatedAsRollovers,
    });
  audit.record(
    "Form 8606",
    "7",
    "Traditional IRA distributions not converted to Roth",
    line7,
    "Traditional IRA distributions excluding QCDs, rollover distributions, current-year contributions returned by the due date, returned excess contributions, and qualified HSA funding distributions because those amounts are not included on Line 7",
    {
      "Traditional IRA distributions": traditionalDistributions,
      "Qualified charitable distributions": qualifiedCharitableDistributions,
      "Rolled over distributions": rolledOverDistributions,
      "Returned contributions by due date": returnedContributionsByDueDate,
      "Returned excess contributions": returnedExcessContributions,
      "Qualified HSA funding distributions": qualifiedHsaFundingDistributions,
    }
  );
  audit.record("Form 8606", "8", "Traditional IRA amounts converted to Roth IRAs", line8, "Net amount converted from traditional, SEP, and SIMPLE IRAs to Roth IRAs");
  audit.record("Form 8606", "9", "Total denominator for the pro-rata ratio", line9, "Line 6 + Line 7 + Line 8", {
    "Line 6": line6,
    "Line 7": line7,
    "Line 8": line8,
  });
  audit.record("Form 8606", "10", "Nontaxable percentage", line10, "Round Line 5 / Line 9 to three decimals, limited to 1.000", {
    "Line 5": line5,
    "Line 9": line9,
  });
  audit.record("Form 8606", "11", "Nontaxable portion of Roth conversions", line11, "Line 8 × Line 10", {
    "Line 8": line8,
    "Line 10": line10,
  });
  audit.record("Form 8606", "12", "Nontaxable portion of traditional IRA distributions", line12, "Line 7 × Line 10", {
    "Line 7": line7,
    "Line 10": line10,
  });
  audit.record("Form 8606", "13", "Total nontaxable amount used this year", line13, "Line 11 + Line 12", {
    "Line 11": line11,
    "Line 12": line12,
  });
  audit.record("Form 8606", "14", "Basis to carry forward to next year", line14,
    priorYearLine15cBasisAdjustment.isZero()
      ? "Line 3 - Line 13"
      : "Line 3 - Line 13 + prior-year Line 15c worksheet Line 6 basis adjustment",
    {
      "Line 3": line3,
      "Line 13": line13,
      "Prior-year Line 15c worksheet Line 6": priorYearLine15cBasisAdjustment,
    });
  audit.record("Form 8606", "15a", "Traditional IRA distributions subject to tax test", line15a, "Line 7 - Line 12", {
    "Line 7": line7,
    "Line 12": line12,
  });
  audit.record("Form 8606", "15b", "Qualified disaster distribution exclusion", line15b,
    qualifiedDisasterDistributions.isZero()
      ? "$0 because there are no qualified disaster distributions to allocate"
      : qualifiedDisasterDistributions.eq(line7)
        ? "Line 15a because all Line 7 distributions are qualified disaster distributions"
        : "Line 15a × (qualified disaster distributions / Line 7)",
    {
      "Line 7": line7,
      "Line 15a": line15a,
      "Qualified disaster distributions": qualifiedDisasterDistributions,
    });
  audit.record("Form 8606", "15c", "Taxable traditional IRA distributions reported on Form 1040 Line 4b", line15c,
    line15cRepaymentReduction.isZero()
      ? "Line 15a - Line 15b"
      : "Line 15a - Line 15b - Line 15c worksheet repayment reduction, limited to the eligible taxable share",
    {
      "Line 15a": line15a,
      "Line 15b": line15b,
      "Line 15c worksheet eligible distributions": repaymentEligibleDistributions,
      ...(line15cExceptionNumber === undefined ? {} : { "Line 15c worksheet exception number": line15cExceptionNumber }),
      "Line 15c worksheet eligible taxable share": line15cRepaymentEligibleTaxableShare,
      "Line 15c worksheet repayments": repaymentWithin3YearWindow,
      "Line 15c worksheet repayment reduction": line15cRepaymentReduction,
      "Line 15c worksheet remaining eligible taxable share": line15cRepaymentEligibleRemainingTaxableShare,
      "Line 15c worksheet basis adjustment": line15cBasisAdjustment,
    });
  audit.record("Form 8606", "16", "Roth conversion amount carried into Part II", line16, "Line 8");
  audit.record("Form 8606", "17", "Nontaxable portion of Roth conversions", line17, "Line 11");
  audit.record("Form 8606", "18", "Taxable amount of Roth conversions reported on Form 1040 Line 4b", line18, "Line 16 - Line 17", {
    "Line 16": line16,
    "Line 17": line17,
  });
  audit.record(
    "Form 8606",
    "19",
    "Nonqualified Roth IRA distributions included in the ordering rules",
    line19,
    "Validated Roth IRA distributions that must be tested under Part III after excluding qualified Roth distributions, Roth rollover distributions, Roth contributions returned by the due date, returned Roth excess contributions, and Roth qualified HSA funding distributions that are not entered on Line 19",
    {
      "Roth IRA distributions before Line 19 exclusions": rothDistributions,
      "Qualified Roth distributions excluded from Line 19": qualifiedRothDistributionsExcludedFromLine19,
      "Roth rolled over distributions": rothRolledOverDistributions,
      "Roth returned contributions by due date": rothReturnedContributionsByDueDate,
      "Returned Roth excess contributions": rothReturnedExcessContributions,
      "Roth qualified HSA funding distributions": rothQualifiedHsaFundingDistributions,
    }
  );
  audit.record(
    "Form 8606",
    "20",
    "Qualified first-time homebuyer expenses allocable to Roth distributions",
    line20,
    "Smaller of Line 19, qualified first-time homebuyer expenses, or the remaining $10,000 lifetime limit after prior qualified first-time homebuyer distributions",
    {
      "Line 19": line19,
      "Qualified first-time homebuyer expenses": d(input.qualifiedFirstTimeHomebuyerExpenses),
      "Prior qualified first-time homebuyer distributions": priorQualifiedFirstTimeHomebuyerDistributions,
      "Remaining lifetime homebuyer limit": remainingFirstTimeHomebuyerLimit,
    }
  );
  audit.record("Form 8606", "21", "Roth distributions remaining after the homebuyer exclusion", line21, "Line 19 - Line 20", {
    "Line 19": line19,
    "Line 20": line20,
  });
  audit.record(
    "Form 8606",
    "22",
    "Basis in regular Roth IRA contributions available for recovery",
    line22,
    hasContribPerYearChart
      ? priorYearLine25cBasisAdjustment.isZero()
        ? `Sum of remaining basis from per-year Roth contribution chart (${sortedContribChart!.length} contribution years, FIFO depletion applied)`
        : `Sum of remaining basis from per-year Roth contribution chart (${sortedContribChart!.length} contribution years, FIFO depletion applied) + prior-year Line 25c worksheet Line 5 basis adjustment`
      : priorYearLine25cBasisAdjustment.isZero()
        ? "Validated basis in regular Roth IRA contributions"
        : "Validated basis in regular Roth IRA contributions + prior-year Line 25c worksheet Line 5 basis adjustment",
    hasContribPerYearChart
      ? {
          ...Object.fromEntries(
            sortedContribChart!.map((entry) => [
              `${entry.year} contribution (${entry.contributionAmount} original)`,
              entry.basisRemaining,
            ])
          ),
          "Prior-year Line 25c worksheet Line 5": priorYearLine25cBasisAdjustment,
        }
      : {
          "Validated Roth contribution basis": rothContributionBasis,
          "Prior-year Line 25c worksheet Line 5": priorYearLine25cBasisAdjustment,
        }
  );
  audit.record("Form 8606", "23", "Roth distributions remaining after regular contribution basis", line23, "Line 21 - Line 22", {
    "Line 21": line21,
    "Line 22": line22,
  });
  audit.record(
    "Form 8606",
    "24",
    "Basis in Roth conversions and rollovers from qualified plans",
    line24,
    hasPerYearChart
      ? `Sum of remaining basis from per-year Roth conversion chart (${sortedChart!.length} conversion years, FIFO depletion applied)`
      : "Validated remaining basis from Roth conversions and qualified-plan rollovers under the Line 24 chart",
    hasPerYearChart
      ? Object.fromEntries(
          sortedChart!.map((entry) => [
            `${entry.year} conversion (${entry.conversionAmount} original)`,
            entry.basisRemaining,
          ])
        )
      : undefined
  );
  audit.record("Form 8606", "25a", "Taxable Roth IRA distributions before disaster and repayment adjustments", line25a, "Line 23 - Line 24", {
    "Line 23": line23,
    "Line 24": line24,
  });
  audit.record(
    "Form 8606",
    "25b",
    "Qualified disaster distribution exclusion for Roth IRAs",
    line25b,
    rothQualifiedDisasterDistributions.isZero()
      ? "$0 because there are no qualified disaster distributions to allocate"
      : rothQualifiedDisasterDistributions.eq(line21)
        ? "Line 25a because all Line 21 distributions are qualified disaster distributions"
        : "Line 25a × (qualified disaster distributions / Line 21)",
    {
      "Line 21": line21,
      "Line 25a": line25a,
      "Qualified disaster distributions": rothQualifiedDisasterDistributions,
    }
  );
  audit.record(
    "Form 8606",
    "25c",
    "Taxable Roth IRA distributions reported on Form 1040 Line 4b",
    line25c,
    line25cRepaymentReduction.isZero()
      ? "Line 25a - Line 25b"
      : "Line 25a - Line 25b - Line 25c worksheet repayments, limited so the result is not below zero",
    {
      "Line 25a": line25a,
      "Line 25b": line25b,
      "Line 25c worksheet eligible distributions": rothRepaymentEligibleDistributions,
      ...(line25cExceptionNumber === undefined ? {} : { "Line 25c worksheet exception number": line25cExceptionNumber }),
      "Line 25c worksheet eligible taxable share": line25cRepaymentEligibleTaxableShare,
      "Line 25c worksheet repayments": rothRepaymentsWithin3YearWindow,
      "Line 25c worksheet remaining eligible taxable share": line25cRepaymentEligibleRemainingTaxableShare,
      "Line 25c worksheet repayment reduction": line25cRepaymentReduction,
      "Line 25c worksheet basis adjustment": line25cBasisAdjustment,
    }
  );

  return {
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    outstandingRollovers,
    currentYearRepaymentsTreatedAsRollovers,
    qualifiedCharitableDistributions,
    rolledOverDistributions,
    returnedContributionsByDueDate,
    returnedExcessContributions,
    qualifiedHsaFundingDistributions,
    qualifiedDisasterDistributions,
    repaymentEligibleDistributions,
    line15cExceptionNumber,
    repaymentWithin3YearWindow,
    priorYearLine15cBasisAdjustment,
    line7Exclusions,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    line14,
    line15a,
    line15b,
    line15c,
    line15cRepaymentEligibleTaxableShare,
    line15cRepaymentEligibleRemainingTaxableShare,
    line15cRepaymentReduction,
    line15cBasisAdjustment,
    line16,
    line17,
    line18,
    qualifiedRothDistributionsExcludedFromLine19,
    rothRolledOverDistributions,
    rothReturnedContributionsByDueDate,
    rothReturnedExcessContributions,
    rothQualifiedHsaFundingDistributions,
    line19Exclusions,
    priorQualifiedFirstTimeHomebuyerDistributions,
    priorYearLine25cBasisAdjustment,
    rothContributionBasis,
    rothConversionBasis,
    rothQualifiedDisasterDistributions,
    rothRepaymentEligibleDistributions,
    line25cExceptionNumber,
    rothRepaymentsWithin3YearWindow,
    line19,
    line20,
    line21,
    line22,
    line23,
    line24,
    line25a,
    line25b,
    line25c,
    line25cRepaymentEligibleTaxableShare,
    line25cRepaymentEligibleRemainingTaxableShare,
    line25cRepaymentReduction,
    line25cBasisAdjustment,
    taxableTraditionalDistributions: line15c,
    taxableRothConversions: line18,
    taxableRothDistributions: line25c,
    rothContributionBasisByYearCarryforward,
    rothConversionBasisByYearCarryforward,
    lines: audit.getLines(),
  };
}

function clampExclusion(value: Decimal, ceiling: Decimal): Decimal {
  return Decimal.min(
    Decimal.max(new Decimal(0), value),
    Decimal.max(new Decimal(0), ceiling)
  );
}
