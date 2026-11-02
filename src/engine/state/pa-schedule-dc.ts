/**
 * Pennsylvania Schedule DC — Child and Dependent Care Enhancement Tax Credit
 * Spec: spec/state/pa-schedule-dc.yaml
 *
 * Historical 2024/2025 chart behavior is retained. For 2026 Pennsylvania
 * retains the 2022 section 21 percentage and requires actual underlying care
 * sources; the increased current federal percentage is not a state allowance.
 */

import Decimal from "decimal.js";
import { min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateForm2441, type Form2441Input } from "@/engine/forms/form-2441.js";

interface PAScheduleDCConstants {
  threshold: Decimal;
  lowIncomeCaps: {
    oneDependent: Decimal;
    twoOrMoreDependents: Decimal;
  };
  highIncomeCaps: {
    oneDependent: Decimal;
    twoOrMoreDependents: Decimal;
  };
}

const PA_SCHEDULE_DC_CONSTANTS: Record<number, PAScheduleDCConstants> = {
  2024: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
  2025: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
  2026: {
    threshold: new Decimal(43000),
    lowIncomeCaps: {
      oneDependent: new Decimal(1050),
      twoOrMoreDependents: new Decimal(2100),
    },
    highIncomeCaps: {
      oneDependent: new Decimal(600),
      twoOrMoreDependents: new Decimal(1200),
    },
  },
};

/** Actual ordinary sources; no expense or eligibility is inferred from a federal credit. */
export interface PAScheduleDC2026ConformitySources {
  sourceTaxYear: number;
  sourceReference: string;
  sourceFactsConfirmed: boolean;
  residentIndividualEligibilityConfirmed: boolean;
  eligibilityUnder2022Section21Confirmed: boolean;
  currentYearExpensesOnlyConfirmed: boolean;
  actualEarnedIncomeOnlyConfirmed: boolean;
  expensesNotClaimedOnAnotherReturnConfirmed: boolean;
  federal: Form2441Input;
}

export interface ScheduleDCInput {
  taxYear: number;
  /** Total qualifying persons from Schedule DC Section II / federal Form 2441 */
  qualifyingPersons: number;
  /** Pennsylvania taxable income used for the printed Schedule DC chart */
  paTaxableIncome: Decimal;
  /** Allowed federal child and dependent care credit from Form 2441 Line 9a */
  federalCredit: Decimal;
  /** Required actual source facts for the finite 2026 frozen-2022 method. */
  source2022Conformity?: PAScheduleDC2026ConformitySources;
}

export interface ScheduleDCResult {
  qualifyingPersons: number;
  federalCredit: Decimal;
  /** PA Schedule DC credit amount, transferable to PA-40 Line 23 */
  credit: Decimal;
  lines: CalculatedLine[];
}

export function calculateScheduleDC(input: ScheduleDCInput): ScheduleDCResult {
  const constants = PA_SCHEDULE_DC_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`PA Schedule DC constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  if (input.taxYear === 2026) {
    // Spec: 2026-conformity / 2026-source-boundary. The current federal
    // percentage is not Pennsylvania's frozen 2022 section 21 percentage.
    const source = input.source2022Conformity;
    if (!source || source.sourceTaxYear !== 2026 || typeof source.sourceReference !== "string"
      || !source.sourceReference.trim() || source.sourceFactsConfirmed !== true
      || source.residentIndividualEligibilityConfirmed !== true
      || source.eligibilityUnder2022Section21Confirmed !== true
      || source.currentYearExpensesOnlyConfirmed !== true
      || source.actualEarnedIncomeOnlyConfirmed !== true
      || source.expensesNotClaimedOnAnotherReturnConfirmed !== true) {
      throw new Error("2026 PA Schedule DC requires the complete actual frozen-2022 conformity sources");
    }
    const federal = source.federal;
    if (!federal || federal.taxYear !== 2026 || federal.eligibilityConfirmed !== true
      || federal.earnedIncomeFactsVerified !== true || !federal.filingStatus
      || !["single", "head_of_household", "qualifying_surviving_spouse", "married_filing_jointly"].includes(federal.filingStatus)
      || federal.dependentCareBenefits !== undefined
      || !Number.isInteger(input.qualifyingPersons) || input.qualifyingPersons < 0
      || input.qualifyingPersons !== federal.qualifyingIndividuals) {
      throw new Error("2026 PA Schedule DC requires actual ordinary eligibility, filing status, person count and individual earned-income facts");
    }
    const amounts = [input.federalCredit, input.paTaxableIncome, federal.careExpenses,
      federal.earnedIncome, federal.agi, federal.excludedDependentCareBenefits,
      federal.priorYearExpenseCredit, federal.taxLiabilityLimit,
      ...(federal.filingStatus === "married_filing_jointly" ? [federal.spouseEarnedIncome] : [])];
    if (amounts.some(amount => !Decimal.isDecimal(amount) || !amount.isFinite())
      || !federal.excludedDependentCareBenefits?.isZero()
      || !federal.priorYearExpenseCredit?.isZero()
      || !federal.taxLiabilityLimit || federal.taxLiabilityLimit.isNegative()) {
      throw new Error("2026 PA Schedule DC requires finite actual amounts, known zero benefits/prior credit and an actual liability worksheet");
    }
    const currentFederal = calculateForm2441(federal);
    const tentative = currentFederal.lines.find(line => line.line === "9a")?.value;
    if (!tentative || !input.federalCredit.eq(tentative)
      || !currentFederal.credit.eq(tentative)
      || roundDollar(federal.taxLiabilityLimit).lt(tentative)) {
      throw new Error("2026 PA Schedule DC requires exact actual federal 9a reconciliation and a nonbinding liability worksheet");
    }
    const rate = Decimal.max("0.20", new Decimal("0.35").minus(
      zeroFloor(federal.agi.minus(15000)).dividedBy(2000).ceil().times("0.01"),
    ));
    const credit = roundDollar(currentFederal.earnedIncomeLimit.times(rate));
    audit.record("PA-Schedule-DC", "1", "Qualifying persons", new Decimal(input.qualifyingPersons), "Actual same-year Form 2441 qualifying count reconciled to the source packet");
    audit.record("PA-Schedule-DC", "2026_expense_base", "Actual earned-income-limited current care expense base", currentFederal.earnedIncomeLimit, "Actual ordinary paid care and separate earned income; frozen section 21 expense and earned-income limits; no section 129 or prior-year expenses");
    audit.record("PA-Schedule-DC", "2026_percentage", "Frozen 2022 applicable percentage", rate, "Fiscal Code 1602-W and 1603-W(c): 35% less one percentage point per $2,000 or fraction above actual federal AGI $15,000, minimum 20%");
    audit.record("PA-Schedule-DC", "2", "Child and dependent care enhancement tax credit", credit, "Actual current expense base multiplied by the frozen 2022 percentage, rounded to a whole dollar; current federal percentage and PA-income chart do not replace these sources");
    return { qualifyingPersons: input.qualifyingPersons, federalCredit: input.federalCredit, credit, lines: audit.getLines() };
  }
  const qualifyingPersons = Math.max(0, Math.trunc(input.qualifyingPersons));

  audit.record(
    "PA-Schedule-DC",
    "1",
    "Qualifying persons",
    new Decimal(qualifyingPersons),
    "Total qualifying persons from Schedule DC Section II",
  );

  const chartCap =
    qualifyingPersons <= 0
      ? new Decimal(0)
      : qualifyingPersons === 1
        ? input.paTaxableIncome.lte(constants.threshold)
          ? constants.lowIncomeCaps.oneDependent
          : constants.highIncomeCaps.oneDependent
        : input.paTaxableIncome.lte(constants.threshold)
          ? constants.lowIncomeCaps.twoOrMoreDependents
          : constants.highIncomeCaps.twoOrMoreDependents;
  const credit = min(zeroFloor(input.federalCredit), chartCap);
  audit.record(
    "PA-Schedule-DC",
    "2",
    "Child and dependent care enhancement tax credit",
    credit,
    `Federal Form 2441 Line 9a credit floored at 0 and capped at $${chartCap.toString()} based on ${qualifyingPersons} qualifying person(s) and PA taxable income of $${input.paTaxableIncome.toString()}`,
  );

  return {
    qualifyingPersons,
    federalCredit: input.federalCredit,
    credit,
    lines: audit.getLines(),
  };
}
