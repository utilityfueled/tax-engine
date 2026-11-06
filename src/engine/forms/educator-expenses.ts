/** Schedule 1 line 11; spec/federal/educator-expense-limits.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";
import type { BondSourceRatio } from "./savings-bond-reissue-sources.js";
import type { EducatorBondCalculationContext } from "./educator-bond-sources.js";
import { displaySavingsBondRatio, reportSavingsBondRatios, sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";
const ZERO = new Decimal(0);

export interface EducatorExpenseResult {
  amount: Decimal;
  formula: string;
  inputs: Record<string, Decimal | string>;
  sourceFactsVerified?: boolean;
  itemizedCalculationComplete: boolean;
  itemizedDeduction?: Decimal;
  sourceRecords?: Array<{
    accountHolder: "primary" | "spouse"; eligibleHours: Decimal; qualifiedExpenses: Decimal;
    reductions: Decimal; netExpenses: Decimal; deduction: Decimal;
    itemizedEligibleHours: Decimal; itemizedNetExpenses?: Decimal; itemizedDeduction?: Decimal;
  }>;
}

export function calculateEducatorExpensesDeduction(
  adjustments: TaxYearInput["adjustments"],
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"],
  taxYear: number,
  bondContext?: EducatorBondCalculationContext,
): EducatorExpenseResult {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error(`Educator expense limit is not supported for tax year ${taxYear}`);
  // 2026 Rev. Proc. 2025-32 section4.12; 2025 Schedule1 line11.
  const perPersonLimit = new Decimal(taxYear === 2026 ? "350" : "300");
  const actualSources = adjustments?.educatorExpenseSources;
  if (actualSources?.length) {
    const tokens = JSON.stringify(actualSources).match(/"-?\d+(?:\.\d+)?"/g) ?? [];
    const digits = tokens.reduce((total, value) => total + value.length, 0);
    const D = Decimal.clone({ precision: Math.max(80, digits * 4 + 32) });
    const ratio = (value: Decimal): BondSourceRatio => ({ numerator: value, denominator: new D(1) });
    const subtract = (left: BondSourceRatio, right: BondSourceRatio) => sumSavingsBondRatios([left, { numerator: right.numerator.negated(), denominator: right.denominator }]);
    const floor = (value: BondSourceRatio) => value.numerator.lt(0) ? ratio(new D(0)) : value;
    const display = (value: BondSourceRatio) => value.numerator.div(value.denominator);
    const preBond = bondContext?.purpose === "form8815_magi";
    const exactReturnSources = actualSources.some(source => source.savingsBondReductionMethod === "return_sources");
    const owners = new Set<string>();
    const expenseIds = new Set<string>();
    const inputs: Record<string, Decimal | string> = {};
    const amount = (value: string | undefined, name: string) => {
      if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value) || !d(value).isFinite() || d(value).lt(0)) throw new Error(`Educator source requires actual nonnegative ${name}; unknown is not zero.`);
      return new D(value);
    };
    const sourceRecords = actualSources.map(source => {
      if (!source.accountHolder || owners.has(source.accountHolder)) throw new Error("Educator sources require one actual worksheet per owner; duplicate owner.");
      owners.add(source.accountHolder);
      if (source.accountHolder === "spouse" && filingStatus !== "married_filing_jointly") throw new Error("Spouse educator sources require a joint return.");
      if (source.taxYear !== taxYear || source.schoolYear === undefined || !/^\d{4}-\d{4}$/.test(source.schoolYear)) throw new Error("Educator source requires the actual tax year and school year.");
      const start = Number(source.schoolYear.slice(0, 4));
      const end = Number(source.schoolYear.slice(5));
      if (end !== start + 1 || (start !== taxYear && end !== taxYear)) throw new Error("Educator school year must overlap the actual tax year.");
      if (source.sourceFactsConfirmed !== true) throw new Error("Educator source facts need confirmation after their last edit.");
      if (!source.schools?.length) throw new Error("Educator source requires actual school roles and hours.");
      let eligibleHours = new D(0);
      let itemizedEligibleHours = new D(0);
      for (const school of source.schools) {
        if (!school.name.trim() || school.role === undefined || typeof school.schoolEligible !== "boolean") throw new Error("Educator source requires actual school and role eligibility.");
        if (taxYear >= 2026 && school.level === undefined) throw new Error("2026 educator sources require the actual school level; unknown is not K12");
        const hours = amount(school.hoursWorked, "school-year hours");
        let eligibleSchool = school.schoolEligible && school.level !== "other";
        if (school.level === "early_childhood") {
          eligibleSchool = eligibleSchool && taxYear >= 2026;
          if (taxYear >= 2026) {
            if (school.earlyChildhoodNonresidentChildrenUnder6 === undefined
              || !Number.isInteger(school.earlyChildhoodNonresidentChildrenUnder6) || school.earlyChildhoodNonresidentChildrenUnder6 < 0
              || typeof school.operatedAtPublicExpense !== "boolean" || typeof school.receivesFeePaymentOrGrant !== "boolean") {
              throw new Error("Early-childhood educator sources require actual nonresident children under6 and facility funding facts");
            }
            eligibleSchool &&= school.earlyChildhoodNonresidentChildrenUnder6 > 2
              && (school.operatedAtPublicExpense || school.receivesFeePaymentOrGrant);
          }
        }
        const broadRole = school.role === "coach" || school.role === "interscholastic_sports_administrator";
        if (eligibleSchool && school.role !== "other") {
          if (!broadRole) eligibleHours = eligibleHours.plus(hours);
          if (taxYear >= 2026) itemizedEligibleHours = itemizedEligibleHours.plus(hours);
        }
      }
      if (source.expenses === undefined) throw new Error("Educator source requires actual paid expense records, including an empty list for none.");
      let qualifiedExpenses = new D(0);
      let itemizedNetExpenses = new D(0);
      let itemizedComplete = true;
      let overlappingReimbursements = new D(0);
      let overlappingTaxFreeFunding = new D(0);
      const reimbursement = amount(source.reimbursementsNotInWages, "reimbursementsNotInWages");
      const derivedBond = source.savingsBondReductionMethod === "return_sources";
      const declaredBond = derivedBond && source.excludedSavingsBondInterest === undefined ? undefined
        : amount(source.excludedSavingsBondInterest, "excludedSavingsBondInterest");
      if (derivedBond && !preBond && bondContext?.purpose !== "full_exclusion_sources")
        throw new Error("Derived educator exclusion requires its actual return bond source calculation.");
      const bondReduction = preBond ? ratio(new D(0)) : derivedBond && bondContext?.purpose === "full_exclusion_sources"
        ? bondContext.ownerInterest[source.accountHolder] : ratio(declaredBond ?? new D(0));
      if (derivedBond && !preBond && declaredBond !== undefined && !subtract(ratio(declaredBond), bondReduction).numerator.isZero())
        throw new Error("Reconcile the declared educator bond reduction with the exact source ratio; a rounding allocation is not an original.");
      const educationReductionRatio = sumSavingsBondRatios([bondReduction,
        ratio(amount(source.nontaxableQualifiedTuitionProgramAmount, "nontaxableQualifiedTuitionProgramAmount")),
        ratio(amount(source.nontaxableCoverdellEarnings, "nontaxableCoverdellEarnings"))]);
      for (const expense of source.expenses) {
        const expenseId = expense.sourceId.trim();
        if (!expenseId || expenseIds.has(expenseId)) throw new Error("Educator source has a duplicate or missing expense ID.");
        expenseIds.add(expenseId);
        const parsedDate = new Date(`${expense.datePaid}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.datePaid) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== expense.datePaid || !expense.datePaid.startsWith(`${taxYear}-`)) throw new Error("Educator expenses require an actual payment date in the tax year.");
        if (!expense.description.trim() || !expense.category) throw new Error("Educator expenses require an actual description and category.");
        const cost = amount(expense.amount, "paid expense amount");
        for (const field of ["ordinaryAndNecessary", "qualifyingUse", "deductedElsewhere", "healthOrPhysicalEducation"] as const) if (typeof expense[field] !== "boolean") throw new Error(`Educator expense requires actual ${field} qualification.`);
        if (expense.healthOrPhysicalEducation && typeof expense.athleticSupplies !== "boolean") throw new Error("Educator health or PE supplies require actual athletic-supply classification.");
        const expenseEligible = expense.category !== "other" && expense.ordinaryAndNecessary && !expense.deductedElsewhere;
        const narrowExpenseEligible = expenseEligible && expense.qualifyingUse
          && !(expense.category !== "professional_development" && expense.healthOrPhysicalEducation && !expense.athleticSupplies);
        if (narrowExpenseEligible) qualifiedExpenses = qualifiedExpenses.plus(cost);
        if (taxYear >= 2026 && itemizedEligibleHours.gte(900) && expenseEligible && cost.gt(0)) {
          const broaderUse = expense.qualifyingUse || expense.instructionalActivity;
          if (!expense.qualifyingUse && typeof expense.instructionalActivity !== "boolean") itemizedComplete = false;
          if (broaderUse) {
            // Zero narrow-source reductions establish unfunded classroom costs.
            // Wider instructional costs or material reductions require their own
            // actual allocations; the section62 blanket reduction is not assumed
            // to establish which section162 receipt was funded.
            const canUseKnownZero = expense.qualifyingUse && reimbursement.isZero() && educationReductionRatio.numerator.isZero() && !(derivedBond && preBond);
            if ((expense.itemizedReimbursements === undefined || expense.itemizedTaxFreeFunding === undefined) && !canUseKnownZero) itemizedComplete = false;
            else {
              const itemizedReimbursement = amount(expense.itemizedReimbursements ?? "0", "itemized reimbursement");
              const itemizedTaxFreeFunding = amount(expense.itemizedTaxFreeFunding ?? "0", "itemized tax-free funding");
              const funding = itemizedReimbursement.plus(itemizedTaxFreeFunding);
              if (funding.gt(cost)) throw new Error("Educator itemized expense funding exceeds actual paid cost");
              itemizedNetExpenses = itemizedNetExpenses.plus(cost.minus(funding));
              if (narrowExpenseEligible) {
                overlappingReimbursements = overlappingReimbursements.plus(itemizedReimbursement);
                overlappingTaxFreeFunding = overlappingTaxFreeFunding.plus(itemizedTaxFreeFunding);
              }
            }
          }
        }
      }
      if (taxYear >= 2026 && itemizedEligibleHours.gte(900) && qualifiedExpenses.gt(0) && itemizedComplete) {
        if (!overlappingReimbursements.eq(reimbursement)) throw new Error("Reconcile educator reimbursements between the actual above-line worksheet and overlapping itemized receipts");
        if (!preBond && subtract(ratio(overlappingTaxFreeFunding), educationReductionRatio).numerator.gt(0)) throw new Error("Reconcile actual tax-free funding of above-line educator receipts with the education-benefit reduction worksheet");
      }
      const reductionsRatio = sumSavingsBondRatios([ratio(reimbursement), educationReductionRatio]);
      const netExpensesRatio = eligibleHours.gte(900) ? floor(subtract(ratio(qualifiedExpenses), reductionsRatio)) : ratio(new D(0));
      const deductionRatio = subtract(netExpensesRatio, ratio(perPersonLimit)).numerator.gt(0) ? ratio(perPersonLimit) : netExpensesRatio;
      const reductions = display(reductionsRatio), netExpenses = display(netExpensesRatio), deduction = display(deductionRatio);
      const itemizedDeductionRatio = itemizedComplete ? floor(subtract(ratio(itemizedNetExpenses), deductionRatio)) : undefined;
      const itemizedDeduction = itemizedDeductionRatio ? display(itemizedDeductionRatio) : undefined;
      inputs[`${source.accountHolder} actual eligible hours`] = eligibleHours;
      inputs[`${source.accountHolder} qualified costs`] = qualifiedExpenses;
      inputs[`${source.accountHolder} reimbursements and exclusions`] = reductions;
      inputs[`${source.accountHolder} net expenses`] = netExpenses;
      inputs[`${source.accountHolder} allowed deduction`] = deduction;
      if (derivedBond || preBond) {
        inputs[`${source.accountHolder} exact bond reduction`] = displaySavingsBondRatio(bondReduction);
        inputs[`${source.accountHolder} exact allowed deduction`] = displaySavingsBondRatio(deductionRatio);
      }
      const legacy = source.accountHolder === "primary" ? adjustments?.primaryEducatorExpenses : adjustments?.spouseEducatorExpenses;
      if (!preBond && d(legacy).gt(0) && !subtract(ratio(new D(legacy ?? "0")), netExpensesRatio).numerator.isZero()) throw new Error("Reconcile the legacy educator net expenses with actual source facts.");
      inputs[`${source.accountHolder} itemized eligible hours`] = itemizedEligibleHours;
      if (itemizedDeduction !== undefined) inputs[`${source.accountHolder} remaining itemized expense`] = itemizedDeduction;
      return { accountHolder: source.accountHolder, eligibleHours, qualifiedExpenses, reductions, netExpenses, deduction,
        itemizedEligibleHours, itemizedNetExpenses: itemizedComplete ? itemizedNetExpenses : undefined, itemizedDeduction,
        netExpensesRatio, deductionRatio, itemizedDeductionRatio };
    });
    for (const owner of ["primary", "spouse"] as const) if (!owners.has(owner) && d(owner === "primary" ? adjustments?.primaryEducatorExpenses : adjustments?.spouseEducatorExpenses).gt(0)) throw new Error("Reconcile the legacy educator owner amount with actual sources.");
    const totalNet = sumSavingsBondRatios(sourceRecords.map(source => source.netExpensesRatio));
    if (!preBond && d(adjustments?.educatorExpenses).gt(0) && !subtract(ratio(new D(adjustments?.educatorExpenses ?? "0")), totalNet).numerator.isZero()) throw new Error("Reconcile the legacy educator aggregate with actual net sources.");
    const itemizedCalculationComplete = sourceRecords.every(source => source.itemizedDeduction !== undefined);
    const reported = (values: BondSourceRatio[]) => exactReturnSources ? reportSavingsBondRatios(values) : display(sumSavingsBondRatios(values));
    return { amount: reported(sourceRecords.map(source => source.deductionRatio)), formula: `Sum each eligible owner's min(actual qualified costs less reimbursements and education exclusions, $${perPersonLimit})${preBond ? "; Form8815 MAGI omits only the bond exclusion reduction" : exactReturnSources ? "; retain exact ratios and round the completed line" : ""}`, inputs, sourceFactsVerified: true, sourceRecords,
      itemizedCalculationComplete, itemizedDeduction: itemizedCalculationComplete ? reported(sourceRecords.map(source => source.itemizedDeductionRatio ?? ratio(new D(0)))) : undefined };
  }
  const aggregateEducatorExpenses = zeroFloor(d(adjustments?.educatorExpenses));
  const primaryEducatorExpenses = zeroFloor(d(adjustments?.primaryEducatorExpenses));
  const spouseEducatorExpenses = zeroFloor(d(adjustments?.spouseEducatorExpenses));
  const hasSplitEducatorExpenses =
    primaryEducatorExpenses.greaterThan(0) || spouseEducatorExpenses.greaterThan(0);
  if (taxYear === 2026 && (aggregateEducatorExpenses.gt(0) || hasSplitEducatorExpenses)) throw new Error("Actual educator source facts are required for a positive 2026 deduction.");

  if (hasSplitEducatorExpenses) {
    const allowedPrimaryEducatorExpenses = min(primaryEducatorExpenses, perPersonLimit);
    const allowedSpouseEducatorExpenses = filingStatus === "married_filing_jointly"
      ? min(spouseEducatorExpenses, perPersonLimit)
      : ZERO;

    return {
      itemizedCalculationComplete: true, itemizedDeduction: ZERO,
      amount: allowedPrimaryEducatorExpenses.plus(allowedSpouseEducatorExpenses),
      formula: filingStatus === "married_filing_jointly"
        ? `min(primary educator expenses, $${perPersonLimit}) + min(spouse educator expenses, $${perPersonLimit})`
        : `min(primary educator expenses, $${perPersonLimit})`,
      inputs: {
        "Primary educator expenses entered": primaryEducatorExpenses,
        "Primary educator expenses allowed": allowedPrimaryEducatorExpenses,
        "Spouse educator expenses entered": spouseEducatorExpenses,
        "Spouse educator expenses allowed": allowedSpouseEducatorExpenses,
        "Ignored aggregate educator expenses fallback": aggregateEducatorExpenses,
      },
    };
  }

  return {
    itemizedCalculationComplete: true, itemizedDeduction: ZERO,
    amount: min(aggregateEducatorExpenses, perPersonLimit),
    formula: `min(${aggregateEducatorExpenses}, $${perPersonLimit})`,
    inputs: {
      "Aggregate educator expenses entered": aggregateEducatorExpenses,
    },
  };
}
