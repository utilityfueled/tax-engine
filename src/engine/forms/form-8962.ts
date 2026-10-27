/** Form 8962 — Premium Tax Credit. Spec: spec/federal/form-8962.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculateForm8962SharedPolicy, type Form8962AllocationInput, type Form8962SharedPolicyResult } from "./form-8962-shared-policy.js";
import { calculateForm8962Contribution } from "./form-8962-contribution.js";
import { calculateForm8962MarriageSources, type Form8962MarriageSourceResult } from "./form-8962-marriage-sources.js";
import { calculateForm8962MarriageWorksheets, type Form8962MarriageWorksheetResult } from "./form-8962-marriage-worksheets.js";

/** Actual completed household and coverage worksheets; never inferred from AGI alone. */
export interface Form8962Facts {
  taxFamilySize: number;
  fplRegion: "contiguous" | "alaska" | "hawaii";
  taxpayerModifiedAGI: string;
  requiredFilingDependentsModifiedAGI: string;
  householdFactsConfirmed: boolean;
  canBeClaimedAsDependent: boolean;
  marriedFilingSeparatelyExceptionConfirmed?: boolean;
  belowPovertyException: "none" | "marketplace_estimate" | "lawfully_present_ineligible_medicaid";
  marketplaceEstimatedIncomeWithinEligibilityRange?: boolean;
  marketplaceInformationAccurate?: boolean;
  coverageFactsConfirmed: boolean;
  allocationRequired: boolean;
  alternativeMarriageCalculationElected: boolean;
  selfEmployedHealthInsuranceCoordinationRequired: boolean;
  lawfulPresenceReconciliationRequired?: boolean;
  qsehraAffected: boolean;
  monthlyReconciliation: {
    month: number;
    enrolleePremium: string;
    slcsp: string;
    advancePremiumTaxCredit: string;
    coverageEligible: boolean;
    incomeBasedSepEnrollment: boolean;
    qsehraAffordable?: boolean;
    qsehraMonthlyPermittedBenefit?: string;
  }[];
}

export interface Form8962Input {
  taxYear?: number;
  facts?: TaxYearInput["form8962"];
  /** Historical 2025 preview only; cannot establish eligibility exceptions. */
  taxFamilySize?: number;
  modifiedAGI?: Decimal;
  filingStatus: FilingStatus;
  form1095A: TaxYearInput["form1095A"];
  /** Actual return source identity, not a supplied validation flag or calculated allocation. */
  allocationHousehold?: Pick<Form8962AllocationInput, "taxpayer" | "standardDeductionFacts" | "form7206">;
  /** Canonical engine context; never a TaxYearInput source flag or supplied amount. */
  healthInsuranceCoordination?: "pub974-simplified-2025" | "pub974-simplified-2026" | "pub974-alternative-reentry-2026" | "ordinary-full-advance-repayment" | "ordinary-reported-advance-repayment" | "ordinary-actual-cash-zero-credit";
  /** Computed WorksheetX/Y/Z result, never a taxpayer-provided Form8962 fact. */
  healthInsuranceRepaymentLimit?: Decimal;
  /** Internal Pub974 auxiliary calculation while an ordered claim remains; never final. */
  orderedDeductionInterim?: boolean;
}

export interface Form8962Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  sharedPolicyAllocation?: Form8962SharedPolicyResult;
  /** Actual ordinary joint eligibility; the separately validated marriage method may allow pre-marriage columns. */
  taxpayerEligible: boolean;
  marriageCalculation?: Form8962MarriageWorksheetResult;
  /** True only for the separately identified auxiliary Pub974 worksheet. */
  orderedDeductionInterim?: true;
  calculationMethod: "annual" | "monthly";
  familySize: number;
  modifiedAGI: Decimal; // Household income, line 3
  federalPovertyLine: Decimal;
  fplPercentage: Decimal; // Diagnostic only; never used to interpolate the applicable figure.
  fplPercentageForTable: Decimal; // Line 5 (fraction dropped; 401 above 400%).
  contributionRate: Decimal; // Line 7
  expectedContribution: Decimal; // Line 8a
  monthlyContribution: Decimal; // Line 8b
  annualPremium: Decimal;
  annualSLCSP: Decimal;
  annualAdvancePTC: Decimal;
  ptcAllowed: Decimal; // Line 24
  advancePTCTotal: Decimal; // Line 25
  netPTC: Decimal; // Line 26 -> Schedule 3 line 9
  excessAPTC: Decimal; // Line 27, before any historical repayment limitation
  repaymentCap: Decimal | null; // Line 28; null when no cap applies
  excessAPTCRepayment: Decimal; // Line 29 -> Schedule 2 line 1a
  lines: CalculatedLine[];
}

function dollars(value: string | Decimal | null | undefined, label: string, signed = false): Decimal {
  if (value == null || value === "") throw new Error(`Form 8962 requires actual ${label}`);
  const amount = new Decimal(value);
  if (!amount.isFinite() || (!signed && amount.isNegative())) throw new Error(`Form 8962 ${label} must be finite${signed ? "" : " and nonnegative"}`);
  return amount;
}
function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Form 8962 requires an actual month from 1 through 12");
}
interface Month {
  month: number; premium: Decimal; slcsp: Decimal; advance: Decimal;
  eligible: boolean; qsehraAffordable: boolean; qsehraBenefit: Decimal;
}

export function calculateForm8962(input: Form8962Input): Form8962Result {
  const year = input.taxYear ?? 2025;
  if (year !== 2025 && year !== 2026) throw new Error("Form 8962 supports tax year 2025 or 2026 only");
  const facts = input.facts;
  if (year === 2026 && !facts) throw new Error("Form 8962 2026 requires actual household and monthly coverage facts");
  const verified = facts !== undefined;
  let sharedPolicyAllocation: Form8962SharedPolicyResult | undefined;
  let marriageSources: Form8962MarriageSourceResult | undefined;
  if (facts?.allocationRequired === true || facts?.sharedPolicyAllocations !== undefined) {
    if (!input.allocationHousehold) throw new Error("Form8962 allocation requires actual household source context and allocation worksheet");
    if (input.allocationHousehold.taxpayer.taxYear !== year || input.allocationHousehold.taxpayer.filingStatus !== input.filingStatus) throw new Error("Form8962 allocation household source context conflicts with the return year or status");
    sharedPolicyAllocation = calculateForm8962SharedPolicy({ ...input.allocationHousehold, form1095A: input.form1095A, form8962: facts });
  }
  if (facts?.alternativeMarriageCalculationElected === true || facts?.marriageSources !== undefined) {
    if (!input.allocationHousehold) throw new Error("Form8962 marriage requires actual household source context and completed worksheets");
    if (input.allocationHousehold.taxpayer.taxYear !== year || input.allocationHousehold.taxpayer.filingStatus !== input.filingStatus) throw new Error("Form8962 marriage household source context conflicts with the return year or status");
    marriageSources = calculateForm8962MarriageSources({ ...input.allocationHousehold, form1095A: input.form1095A, form8962: facts });
  }
  if (facts) {
    if (facts.householdFactsConfirmed !== true || facts.coverageFactsConfirmed !== true) throw new Error("Form 8962 household and coverage facts must be confirmed");
    for (const flag of ["allocationRequired", "alternativeMarriageCalculationElected", "selfEmployedHealthInsuranceCoordinationRequired", "lawfulPresenceReconciliationRequired"] as const) {
      if (flag === "allocationRequired" && sharedPolicyAllocation) continue;
      if (flag === "alternativeMarriageCalculationElected" && marriageSources) continue;
      if (flag === "selfEmployedHealthInsuranceCoordinationRequired" && facts[flag] === true
        && (input.healthInsuranceCoordination === "ordinary-actual-cash-zero-credit" || input.healthInsuranceCoordination === "ordinary-full-advance-repayment" || input.healthInsuranceCoordination === "ordinary-reported-advance-repayment" || input.healthInsuranceCoordination === `pub974-simplified-${year}`
          || (year === 2026 && input.healthInsuranceCoordination === "pub974-alternative-reentry-2026"))) continue;
      if (facts[flag] !== false) throw new Error(`Form 8962 requires completed ${flag} worksheets or confirmed absence`);
    }
    if (typeof facts.canBeClaimedAsDependent !== "boolean" || typeof facts.qsehraAffected !== "boolean") throw new Error("Form 8962 dependency and QSEHRA facts must be confirmed");
    if (!["none", "marketplace_estimate", "lawfully_present_ineligible_medicaid"].includes(facts.belowPovertyException ?? "")) throw new Error("Form 8962 below-poverty exception facts are unknown");
    if (input.filingStatus === "married_filing_separately" && typeof facts.marriedFilingSeparatelyExceptionConfirmed !== "boolean") throw new Error("Form 8962 separate filing exception must be confirmed or denied");
  }
  const familySize = facts ? facts.taxFamilySize : input.taxFamilySize;
  if (familySize === undefined || !Number.isSafeInteger(familySize) || familySize < 1) throw new Error("Form 8962 requires a positive actual tax family size");
  const region = facts ? facts.fplRegion : "contiguous";
  if (region === undefined || !["contiguous", "alaska", "hawaii"].includes(region)) throw new Error("Form 8962 requires an actual FPL region");
  const taxpayerMAGI = dollars(facts ? facts.taxpayerModifiedAGI : input.modifiedAGI, "taxpayer modified AGI", true);
  const dependentMAGI = facts ? dollars(facts.requiredFilingDependentsModifiedAGI, "required-filing dependents modified AGI", true) : new Decimal(0);
  const modifiedAGI = zeroFloor(taxpayerMAGI.plus(dependentMAGI));
  if (input.orderedDeductionInterim && (input.healthInsuranceCoordination !== `pub974-simplified-${year}` || !facts)) throw new Error("Pub974 auxiliary400 requires actual health-coordination sources.");
  const { federalPovertyLine, fplPercentage, fplPercentageForTable, contributionRate: rate, expectedContribution, monthlyContribution } = calculateForm8962Contribution({
    taxYear: year, fplRegion: region, familySize, householdIncome: modifiedAGI, orderedDeductionInterim: input.orderedDeductionInterim,
  });

  const sourceMonths = new Map<number, { premium: Decimal; slcsp: Decimal; advance: Decimal; policyCount: number }>();
  const policyIds = new Set<string>();
  for (const form of input.form1095A) {
    // The schema records missingness before legacy amount defaults are applied.
    const source = form as typeof form & { taxYear?: number; sourceFactsComplete?: boolean };
    if (verified && (source.sourceFactsComplete !== true || !form.marketplace.trim() || !form.policyNumber.trim())) throw new Error("Form 8962 original source statement facts are incomplete");
    if (verified && source.taxYear !== year) throw new Error("Form 8962 source statement tax year does not match");
    const identity = JSON.stringify([form.marketplace.trim(), form.policyNumber.trim()]);
    if (policyIds.has(identity)) throw new Error("Form 8962 duplicate policy statement; replace corrected statements instead of adding them");
    policyIds.add(identity);
    const seen = new Set<number>();
    if (verified && form.monthlyPremiums.length === 0) throw new Error("Form 8962 source statement needs actual covered months");
    for (const row of form.monthlyPremiums) {
      assertMonth(row.month);
      if (seen.has(row.month)) throw new Error("Form 8962 duplicate month in source statement");
      seen.add(row.month);
      // Original allocation sources were independently validated above. Their
      // printed blank benchmark never becomes a made-up numeric zero here.
      if (sharedPolicyAllocation) continue;
      const premium = dollars(row.enrolleePremium, "source enrollment premium");
      const slcsp = dollars(row.slcsp, "source SLCSP premium");
      const advance = dollars(row.advancePremiumTaxCredit, "source advance PTC");
      const previous = sourceMonths.get(row.month);
      sourceMonths.set(row.month, {
        premium: premium.plus(previous?.premium ?? 0), slcsp: slcsp.plus(previous?.slcsp ?? 0),
        advance: advance.plus(previous?.advance ?? 0), policyCount: (previous?.policyCount ?? 0) + 1,
      });
    }
  }
  // PartIV amounts replace only the calculation sources; original statements
  // remain intact for identity and source reconciliation and review.
  if (sharedPolicyAllocation) for (const row of sharedPolicyAllocation.householdMonths) {
    sourceMonths.set(row.month, { premium: row.premium, slcsp: row.slcsp, advance: row.advance, policyCount: row.policyIndexes.length });
  }
  const months: Month[] = [];
  if (facts) {
    const seen = new Set<number>();
    if (!facts.monthlyReconciliation) throw new Error("Form 8962 actual monthly reconciliation facts are required");
    for (const row of facts.monthlyReconciliation) {
      assertMonth(row.month);
      if (seen.has(row.month)) throw new Error("Form 8962 duplicate reconciliation month");
      seen.add(row.month);
      const original = sourceMonths.get(row.month);
      if (!original) throw new Error("Form 8962 reconciliation month has no source statement");
      const premium = dollars(row.enrolleePremium, "eligible enrollment premium");
      const slcsp = dollars(row.slcsp, "corrected SLCSP premium");
      const advance = dollars(row.advancePremiumTaxCredit, "monthly advance PTC");
      if (!advance.eq(original.advance)) throw new Error("Form 8962 monthly APTC does not reconcile to source statements");
      if (premium.gt(original.premium)) throw new Error("Form 8962 eligible premium exceeds source enrollment premiums");
      if (sharedPolicyAllocation && (!premium.eq(original.premium) || !slcsp.eq(original.slcsp))) throw new Error("Form8962 shared-policy reconciliation must equal the actual source-derived allocation");
      if (typeof row.coverageEligible !== "boolean" || typeof row.incomeBasedSepEnrollment !== "boolean") throw new Error("Form 8962 monthly coverage eligibility facts must be confirmed");
      if (facts.qsehraAffected && typeof row.qsehraAffordable !== "boolean") throw new Error("Form 8962 requires actual monthly QSEHRA affordability");
      const qsehraBenefit = facts.qsehraAffected ? dollars(row.qsehraMonthlyPermittedBenefit, "monthly QSEHRA permitted benefit") : new Decimal(0);
      if (!facts.qsehraAffected && (row.qsehraAffordable === true || (row.qsehraMonthlyPermittedBenefit !== undefined && !dollars(row.qsehraMonthlyPermittedBenefit, "monthly QSEHRA benefit").isZero()))) throw new Error("Form 8962 QSEHRA source facts conflict");
      months.push({ month: row.month, premium, slcsp, advance,
        eligible: row.coverageEligible && !(year === 2026 && row.incomeBasedSepEnrollment),
        qsehraAffordable: row.qsehraAffordable === true, qsehraBenefit });
    }
    if (seen.size !== sourceMonths.size) throw new Error("Form 8962 requires reconciliation for every source month");
  } else {
    for (const [month, source] of sourceMonths) {
      if (source.policyCount > 1) throw new Error("Form 8962 multiple policies require actual corrected household benchmark facts");
      months.push({ month, ...source, eligible: true, qsehraAffordable: false, qsehraBenefit: new Decimal(0) });
    }
  }
  months.sort((left, right) => left.month - right.month);
  const totalAdvances = months.reduce((total, month) => total.plus(month.advance), new Decimal(0));
  if (fplPercentageForTable.lt(100) && facts?.belowPovertyException === "marketplace_estimate" && (typeof facts.marketplaceEstimatedIncomeWithinEligibilityRange !== "boolean" || typeof facts.marketplaceInformationAccurate !== "boolean")) throw new Error("Form 8962 below-poverty marketplace estimate and information accuracy facts must be confirmed");
  const belowPovertyEligible = facts?.belowPovertyException === "marketplace_estimate"
    ? facts.marketplaceEstimatedIncomeWithinEligibilityRange === true && facts.marketplaceInformationAccurate === true && totalAdvances.gt(0)
    : year === 2025 && facts?.belowPovertyException === "lawfully_present_ineligible_medicaid";
  const taxpayerEligible = facts?.canBeClaimedAsDependent !== true
    && (input.filingStatus !== "married_filing_separately" || facts?.marriedFilingSeparatelyExceptionConfirmed === true)
    && (fplPercentageForTable.gte(100) || belowPovertyEligible)
    && (year !== 2026 || fplPercentageForTable.lte(400));
  const first = months[0];
  const fullYearUnchanged = !sharedPolicyAllocation && input.form1095A.length > 0 && input.form1095A.every(form => {
    const firstMonth = form.monthlyPremiums[0];
    return firstMonth !== undefined && form.monthlyPremiums.length === 12 && form.monthlyPremiums.every(row =>
      new Decimal(row.enrolleePremium).eq(firstMonth.enrolleePremium) && row.slcsp !== null && firstMonth.slcsp !== null && new Decimal(row.slcsp).eq(firstMonth.slcsp));
  })
    && months.length === 12 && first !== undefined && months.every(month => month.premium.eq(first.premium) && month.slcsp.eq(first.slcsp) && month.eligible === first.eligible);
  const calculationMethod = fullYearUnchanged && !sharedPolicyAllocation && !marriageSources ? "annual" : "monthly";
  const audit = new AuditTrail();
  if (sharedPolicyAllocation) audit.merge(sharedPolicyAllocation.lines);
  const record = (line: string, description: string, amount: Decimal, formula: string) => audit.record("Form 8962", line, description, amount, formula);
  record("1", "Tax family size", new Decimal(familySize), verified ? "Actual confirmed tax-family worksheet" : "Unverified historical family-size input");
  record("2a", "Taxpayer modified AGI", taxpayerMAGI, verified ? "Actual Worksheet 1-1" : "Unverified historical modified AGI");
  record("2b", "Required-filing dependents modified AGI", dependentMAGI, verified ? "Actual Worksheet 1-2" : "Unknown historical dependent MAGI; preview only");
  record("3", "Household income", modifiedAGI, "max(0, line 2a + line 2b)");
  record("4", "Federal poverty line", federalPovertyLine, `${year - 1} HHS ${region} guideline for actual family size`);
  record("5", "Household income percentage for applicable figure", fplPercentageForTable, input.orderedDeductionInterim ? "Pub974 ordered auxiliary worksheet only:400 above poverty threshold; actual household income retained" : "401 if line 3 > 4 times line 4; otherwise drop fractional percentage");
  // Keep calculated diagnostic contributions available, but do not print skipped form lines.
  if (taxpayerEligible) {
    record("7", "Applicable figure", rate, `${year} applicable figure at whole-number line 5, rounded to four decimals`);
    record("8a", "Annual contribution", expectedContribution, "round(line 3 times line 7)");
    record("8b", "Monthly contribution", monthlyContribution, "round(line 8a / 12)");
  }
  let annualPremium = new Decimal(0), annualSLCSP = new Decimal(0), annualAdvancePTC = new Decimal(0), ptcAllowed = new Decimal(0);
  if (calculationMethod === "annual") {
    annualPremium = roundDollar(months.reduce((total, month) => total.plus(month.premium), new Decimal(0)));
    annualSLCSP = roundDollar(months.reduce((total, month) => total.plus(month.slcsp), new Decimal(0)));
    annualAdvancePTC = roundDollar(totalAdvances);
    const maximum = zeroFloor(annualSLCSP.minus(expectedContribution));
    const tentative = min(annualPremium, maximum);
    if (taxpayerEligible && first?.eligible) {
      ptcAllowed = facts?.qsehraAffected
        ? roundDollar(months.reduce((total, month) => total.plus(month.qsehraAffordable ? 0 : zeroFloor(tentative.minus(month.qsehraBenefit.times(12)))), new Decimal(0)).div(12))
        : tentative;
      record("11a", "Annual enrollment premiums", annualPremium, "Sum actual eligible enrollment premiums");
      record("11b", "Annual corrected household SLCSP", annualSLCSP, "Sum correct monthly household benchmark, without duplicated policy benchmarks");
      record("11c", "Annual contribution", expectedContribution, "Line 8a");
      record("11d", "Annual maximum premium assistance", maximum, "max(0, line 11b - line 11c)");
      record("11e", "Annual allowed premium tax credit", ptcAllowed, "min(line 11a, line 11d), adjusted by actual QSEHRA Worksheet N/Q");
    }
    record("11f", "Annual advance premium tax credit", annualAdvancePTC, "Sum all source advance payments");
  } else {
    for (const month of months) {
      const line = String(month.month + 11);
      const premium = roundDollar(month.premium), slcsp = roundDollar(month.slcsp), advance = roundDollar(month.advance);
      annualPremium = annualPremium.plus(premium); annualSLCSP = annualSLCSP.plus(slcsp); annualAdvancePTC = annualAdvancePTC.plus(advance);
      if (taxpayerEligible && month.eligible) {
        const maximum = zeroFloor(slcsp.minus(monthlyContribution));
        const tentative = min(premium, maximum);
        const allowed = month.qsehraAffordable ? new Decimal(0) : roundDollar(zeroFloor(tentative.minus(month.qsehraBenefit)));
        ptcAllowed = ptcAllowed.plus(allowed);
        record(`${line}a`, "Monthly eligible enrollment premium", premium, "Actual coverage-family enrollment premium");
        record(`${line}b`, "Monthly corrected household SLCSP", slcsp, "Actual household benchmark; do not sum duplicate policy benchmarks");
        record(`${line}c`, "Monthly contribution", monthlyContribution, "Line 8b, once for the tax family");
        record(`${line}d`, "Monthly maximum premium assistance", maximum, `max(0, line ${line}b - line ${line}c)`);
        record(`${line}e`, "Monthly allowed premium tax credit", allowed, `min(line ${line}a, line ${line}d), adjusted by actual QSEHRA`);
      }
      record(`${line}f`, "Monthly advance premium tax credit", advance, "All source advance payments, including ineligible coverage");
    }
  }
  const advancePTCTotal = annualAdvancePTC;
  const netPTC = zeroFloor(ptcAllowed.minus(advancePTCTotal));
  const excessAPTC = zeroFloor(advancePTCTotal.minus(ptcAllowed));
  const capAmounts = input.filingStatus === "single" ? ["375", "975", "1625"] as const : ["750", "1950", "3250"] as const;
  const worksheetLimit = input.healthInsuranceRepaymentLimit;
  if (worksheetLimit !== undefined && (year !== 2025 || input.healthInsuranceCoordination !== "pub974-simplified-2025" || !Decimal.isDecimal(worksheetLimit) || !worksheetLimit.isFinite() || worksheetLimit.lt(0))) throw new Error("Form8962 requires an actual computed2025 Pub974 repayment limit.");
  const repaymentCap = worksheetLimit ?? (year === 2026 || fplPercentageForTable.gte(400) ? null : new Decimal(capAmounts[fplPercentageForTable.lt(200) ? 0 : fplPercentageForTable.lt(300) ? 1 : 2]));
  const excessAPTCRepayment = repaymentCap === null ? excessAPTC : min(excessAPTC, repaymentCap);
  record("24", "Allowed premium tax credit", ptcAllowed, "Annual column e or sum of monthly column e");
  record("25", "Advance premium tax credit", advancePTCTotal, "Annual column f or sum of monthly column f");
  record("26", "Net premium tax credit", netPTC, "max(0, line 24 - line 25) -> Schedule 3 line 9");
  record("27", "Excess advance premium tax credit before limitation", excessAPTC, "max(0, line 25 - line 24)");
  if (repaymentCap !== null && excessAPTC.gt(0)) record("28", "Historical repayment limitation", repaymentCap, worksheetLimit === undefined ? "2025 Table 5; no repayment limitation applies in 2026" : "Actual Pub974 WorksheetX/Y/Z limitation replaces Table5");
  record("29", "Excess advance premium tax credit repayment", excessAPTCRepayment, "Line 27 limited by line 28 where applicable -> Schedule 2 line 1a");
  const marriageCalculation = marriageSources ? calculateForm8962MarriageWorksheets({
    ...marriageSources, taxYear: year, fplRegion: region, householdIncome: modifiedAGI,
    healthInsuranceRepaymentLimit: worksheetLimit, orderedDeductionInterim: input.orderedDeductionInterim,
  }) : undefined;
  if (marriageCalculation && (!marriageCalculation.ordinaryCredit.eq(ptcAllowed)
    || !marriageCalculation.ordinaryRepayment.eq(excessAPTCRepayment)
    || !marriageCalculation.advancePTCTotal.eq(advancePTCTotal))) throw new Error("Form8962 marriage comparison does not reconcile to the actual ordinary monthly calculation");
  // Retain actual joint Part I. Worksheets I-V replace only the completed monthly
  // calculation and transfers, including Step 8's zero additional credit rule.
  const lines = marriageCalculation && marriageSources ? [
    ...audit.getLines().filter(row => row.form !== "Form 8962" || /^(1|2a|2b|3|4|5|7|8a|8b)$/.test(row.line)),
    ...marriageSources.lines,
    ...marriageCalculation.lines,
    ...audit.getLines().filter(row => row.form === "Form 8962" && /^\d+f$/.test(row.line)
      && !marriageCalculation.lines.some(candidate => candidate.form === row.form && candidate.line === row.line)),
  ] : audit.getLines();
  return { taxYear: year, sourceFactsVerified: verified, sharedPolicyAllocation, taxpayerEligible, marriageCalculation, orderedDeductionInterim: input.orderedDeductionInterim ? true : undefined, calculationMethod, familySize, modifiedAGI,
    federalPovertyLine, fplPercentage, fplPercentageForTable, contributionRate: rate, expectedContribution, monthlyContribution,
    annualPremium, annualSLCSP, annualAdvancePTC, ptcAllowed, advancePTCTotal, netPTC, excessAPTC, repaymentCap, excessAPTCRepayment,
    ...(marriageCalculation ? { ptcAllowed: marriageCalculation.ptcAllowed, advancePTCTotal: marriageCalculation.advancePTCTotal,
      netPTC: marriageCalculation.netPTC, excessAPTC: marriageCalculation.excessAPTC, repaymentCap: marriageCalculation.repaymentCap,
      excessAPTCRepayment: marriageCalculation.excessAPTCRepayment } : {}),
    lines };
}
