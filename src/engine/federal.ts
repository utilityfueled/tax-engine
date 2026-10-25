/**
 * Federal tax calculation orchestrator.
 * Coordinates all schedules, forms, and worksheets to produce a complete Form 1040.
 *
 * Delegates to standalone schedule/form modules where available.
 */

import Decimal from "decimal.js";
import type {
  Form1099B,
  Form1099Div,
  Form1099K,
  Form1099G,
  Form1099Int,
  Form1099Misc,
  Form1099Nec,
  Form1099R,
  FormW2G,
  Form5329Input,
  Form8606Input,
  IllinoisStateReturnInput,
  TaxYearInput,
  W2,
} from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { d, sum, zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import {
  calculateCapitalGainsTax,
  calculateTaxFromBrackets,
} from "@/utils/tax-math.js";
import { calculateForm8812 } from "./forms/form-8812.js";
import { calculatePersonalCreditOrdering } from "./forms/personal-credit-ordering.js";
import { calculateChildCreditEligibility } from "./forms/child-credit-eligibility.js";
import { calculateForm8959 } from "./forms/form-8959.js";
import { calculateForm8960 } from "./forms/form-8960.js";
import {
  calculateForm1116,
  estimateForeignSourceIncome,
  estimateForeignSourceIncomeFrom1099Div,
  estimateForeignSourceIncomeFrom1099Int,
  estimateForeignSourceIncomeFromScheduleK1Form1041,
  type FTCCarryforwardEntry,
} from "./forms/form-1116.js";
import { calculateScheduleB } from "./schedules/schedule-b.js";
import { calculateScheduleC } from "./schedules/schedule-c.js";
import { calculateScheduleD, recomputeCarryforward } from "./schedules/schedule-d.js";
import { calculateScheduleE } from "./schedules/schedule-e.js";
import { calculateScheduleSE } from "./schedules/schedule-se.js";
import { calculateScheduleA } from "./schedules/schedule-a.js";
import { calculateSchedule1A } from "./schedules/schedule-1-a.js";
import { calculateItemizedDeductionLimit } from "./forms/itemized-deduction-limit.js";
import { calculateStandardDeduction } from "./forms/standard-deduction.js";
import { calculateStateTaxPaymentsInYear } from "./forms/state-tax-payment-year.js";
import { calculateForm6251 } from "./forms/form-6251.js";
import { calculateForm8801 } from "./forms/form-8801.js";
import { calculateForm8582 } from "./forms/form-8582.js";
import type { PassiveActivity } from "./forms/form-8582.js";
import { calculateForm2441 } from "./forms/form-2441.js";
import { calculateForm8863 } from "./forms/form-8863.js";
import { calculateForm8962 } from "./forms/form-8962.js";
import { calculateForm4137 } from "./forms/form-4137.js";
import { calculateForm8919 } from "./forms/form-8919.js";
import { calculateSchedule3, calculateExcessSSWithholding } from "./schedules/schedule-3.js";
import { calculateSchedule1 } from "./schedules/schedule-1.js";
import { calculateSchedule2 } from "./schedules/schedule-2.js";
import { calculateForm2210 } from "./forms/form-2210.js";
import { calculateForm3800 } from "./forms/form-3800.js";
import { calculateForm5695 } from "./forms/form-5695.js";
import { calculateForm8815, type Form8815Result } from "./forms/form-8815.js";
import { calculateForm8995 } from "./forms/form-8995.js";
import { calculateForm8995A } from "./forms/form-8995-a.js";
import type { QBIBusinessSource } from "./forms/form-8995-a.js";
import {
  calculateForm1099R,
  isIraForm1099RDistribution,
  resolveQualifiedRothDistributionAmount,
  resolveForm1099RTaxableAmount,
} from "./forms/form-1099-r.js";
import { calculateForm1099SA } from "./forms/form-1099-sa.js";
import type { Form8889Result } from "./forms/form-8889.js";
import { calculateForm5329 } from "./forms/form-5329.js";
import { calculateForm4797 } from "./forms/form-4797.js";
import {
  calculateForm8880,
  mergeW2RetirementContributionsIntoForm8880Input,
} from "./forms/form-8880.js";
import { calculateForm8606 } from "./forms/form-8606.js";
import type { Form8606Result } from "./forms/form-8606.js";
import { calculateSocialSecurityBenefitsWorksheet } from "./forms/social-security-benefits-worksheet.js";
import type { QBISource } from "./forms/form-8995.js";
import { calculateIraDeduction } from "./forms/ira-deduction-worksheet.js";
import { calculateScheduleR } from "./forms/schedule-r.js";
import { calculateForm8839 } from "./forms/form-8839.js";
import { calculateEic } from "./forms/schedule-eic.js";
import { calculateForm8936 } from "./forms/form-8936.js";
import { calculateScheduleH } from "./forms/schedule-h.js";
import { calculateForm2555 } from "./forms/form-2555.js";
import { calculateForm4684 } from "./forms/form-4684.js";
import { calculateForm4952 } from "./forms/form-4952.js";
import { calculateForm8615 } from "./forms/form-8615.js";
import { aggregateForm8814Results } from "./forms/form-8814.js";
import { calculateScheduleF } from "./schedules/schedule-f.js";
import { calculateForm461 } from "./forms/form-461.js";
import type { AggregatedForm8814 } from "./forms/form-8814.js";
import { calculateForm1099Q } from "./forms/form-1099-q.js";
import { calculateForm1099K } from "./forms/form-1099-k.js";
import { calculateForm1099C } from "./forms/form-1099-c.js";
import { calculateForm982 } from "./forms/form-982.js";
import { calculateSEHealthInsuranceWorksheet, type SEHealthInsuranceWorksheetResult } from "./forms/se-health-insurance-worksheet.js";
import { calculateScheduleJ } from "./forms/schedule-j.js";
import { calculateForm8915F, type Form8915FResult } from "./forms/form-8915-f.js";
import { calculateTaxableRefundWorksheet, type TaxableRefundWorksheetResult } from "./forms/taxable-refund-worksheet.js";
import { calculateForm1098E, type Form1098EResult } from "./forms/form-1098-e.js";
import { calculateSalesTaxDeduction, type SalesTaxDeductionResult } from "./forms/state-sales-tax-deduction-worksheet.js";
import { calculateForm8824Aggregate } from "./forms/form-8824.js";
import {
  calculateCryptoIncome,
  calculateCryptoLendingIncome,
  calculateCryptoDonations,
  calculateYieldRewards,
  initializeLots,
  matchLots,
  processCryptoLiquidations,
  processDeFiLPPositions,
  processDeFiTokenSwaps,
  processNFTTransactions,
  trackWashSaleCarryforward,
  type CryptoIncomeResult,
  type CryptoLendingResult,
  type CryptoDonationResult,
  type DeFiSwapResult,
  type LPPositionResult,
  type LiquidationResult,
  type MatchedDisposition,
  type NFTResult,
  type WashSaleCarryforwardResult,
  type YieldRewardResult,
} from "./forms/crypto-lot-matching.js";
import { calculateIllinoisReturn, type ILStateInput } from "./state/il-orchestrator.js";
import type { ILScheduleWITRecord } from "./state/il-schedule-il-wit.js";

export function calculateFederalTax(input: TaxYearInput): TaxReturnResult {
  const year = input.taxpayer.taxYear;
  const constants = getConstants(year);
  const filingStatus = input.taxpayer.filingStatus as FilingStatus;
  const audit = new AuditTrail();

  // ═══════════════════════════════════════════════════════════
  // Pre-aggregate input arrays in single passes to avoid
  // repeated iterations over the same arrays throughout the
  // calculation. Each array is walked once; every field needed
  // later is accumulated into a summary object.
  // ═══════════════════════════════════════════════════════════

  // ── W-2 aggregation (single pass) ──
  const w2Agg = (() => {
    let ssWages = new Decimal(0);
    let ssTips = new Decimal(0);
    let wages = new Decimal(0);
    let federalWithheld = new Decimal(0);
    let statePlusLocal = new Decimal(0);
    for (const w2 of input.w2s) {
      ssWages = ssWages.plus(d(w2.socialSecurityWages));
      ssTips = ssTips.plus(d(w2.socialSecurityTips));
      wages = wages.plus(d(w2.wages));
      federalWithheld = federalWithheld.plus(d(w2.federalWithheld));
      statePlusLocal = statePlusLocal.plus(d(w2.stateTaxWithheld)).plus(d(w2.localTaxWithheld));
    }
    return { ssWages, ssTips, wages, federalWithheld, statePlusLocal };
  })();

  // ── 1099-DIV aggregation (single pass) ──
  const divAgg = (() => {
    let exemptInterestDividends = new Decimal(0);
    let qualifiedDividends = new Decimal(0);
    let section199ADividends = new Decimal(0);
    let section1250Gain = new Decimal(0);
    let collectiblesGain = new Decimal(0);
    let foreignTaxPaid = new Decimal(0);
    let federalWithheld = new Decimal(0);
    for (const f of input.form1099Div) {
      exemptInterestDividends = exemptInterestDividends.plus(d(f.exemptInterestDividends));
      qualifiedDividends = qualifiedDividends.plus(d(f.qualifiedDividends));
      section199ADividends = section199ADividends.plus(d(f.section199ADividends));
      section1250Gain = section1250Gain.plus(d(f.section1250Gain));
      collectiblesGain = collectiblesGain.plus(d(f.collectiblesGain));
      foreignTaxPaid = foreignTaxPaid.plus(d(f.foreignTaxPaid));
      federalWithheld = federalWithheld.plus(d(f.federalWithheld));
    }
    return { exemptInterestDividends, qualifiedDividends, section199ADividends, section1250Gain, collectiblesGain, foreignTaxPaid, federalWithheld };
  })();

  // ── 1099-INT aggregation (single pass) ──
  const intAgg = (() => {
    let taxExemptInterest = new Decimal(0);
    let earlyWithdrawalPenalty = new Decimal(0);
    let foreignTaxPaid = new Decimal(0);
    let federalWithheld = new Decimal(0);
    for (const f of input.form1099Int) {
      taxExemptInterest = taxExemptInterest.plus(d(f.taxExemptInterest));
      earlyWithdrawalPenalty = earlyWithdrawalPenalty.plus(d(f.earlyWithdrawalPenalty));
      foreignTaxPaid = foreignTaxPaid.plus(d(f.foreignTaxPaid));
      federalWithheld = federalWithheld.plus(d(f.federalWithheld));
    }
    return { taxExemptInterest, earlyWithdrawalPenalty, foreignTaxPaid, federalWithheld };
  })();

  // ── 1099-MISC aggregation (single pass) ──
  const miscAgg = (() => {
    let otherIncome = new Decimal(0);
    let rents = new Decimal(0);
    let federalWithheld = new Decimal(0);
    for (const f of input.form1099Misc) {
      otherIncome = otherIncome.plus(d(f.otherIncome));
      rents = rents.plus(d(f.rents));
      federalWithheld = federalWithheld.plus(d(f.federalWithheld));
    }
    return { otherIncome, rents, federalWithheld };
  })();

  // ── 1099-NEC aggregation (single pass) ──
  const necAgg = (() => {
    let federalWithheld = new Decimal(0);
    for (const f of input.form1099Nec) {
      federalWithheld = federalWithheld.plus(d(f.federalWithheld));
    }
    return { federalWithheld };
  })();

  // ── Schedule K-1 aggregation (single pass over all 20+ needed fields) ──
  const k1Agg = (() => {
    let taxExemptInterest = new Decimal(0);
    let qualifiedDividends = new Decimal(0);
    let excessBusinessInterestPartnership = new Decimal(0);
    let investmentInterestExpense = new Decimal(0);
    let investmentIncome = new Decimal(0);
    let excessBusinessInterestIncomePartnership = new Decimal(0);
    let investmentExpenses = new Decimal(0);
    let charitableCash = new Decimal(0);
    let charitableCapitalGain30 = new Decimal(0);
    let charitableCapitalGain20 = new Decimal(0);
    let selfEmploymentEarnings = new Decimal(0);
    let guaranteedPayments = new Decimal(0);
    let section199AQualifiedReitDividends = new Decimal(0);
    let section199AQualifiedPTPIncome = new Decimal(0);
    let unrecapturedSection1250Gain = new Decimal(0);
    let collectiblesGain = new Decimal(0);
    let amtDepreciationAdjustment = new Decimal(0);
    let amtAdjustedGainOrLoss = new Decimal(0);
    let amtDepletion = new Decimal(0);
    let amtOtherItems = new Decimal(0);
    let foreignTaxPaid = new Decimal(0);
    let foreignTaxPassive = new Decimal(0);
    let foreignTaxGeneral = new Decimal(0);
    let passiveCount = 0;
    for (const k1 of input.scheduleK1) {
      const isSCorp = k1.entityType === "s_corporation";
      taxExemptInterest = taxExemptInterest.plus(d(k1.taxExemptInterest));
      qualifiedDividends = qualifiedDividends.plus(d(k1.qualifiedDividends));
      if (!isSCorp) excessBusinessInterestPartnership = excessBusinessInterestPartnership.plus(d(k1.excessBusinessInterest));
      investmentInterestExpense = investmentInterestExpense.plus(d(k1.investmentInterestExpense));
      investmentIncome = investmentIncome.plus(d(k1.investmentIncome));
      if (!isSCorp) excessBusinessInterestIncomePartnership = excessBusinessInterestIncomePartnership.plus(d(k1.excessBusinessInterestIncome));
      investmentExpenses = investmentExpenses.plus(d(k1.investmentExpenses));
      charitableCash = charitableCash.plus(d(k1.charitableCash));
      charitableCapitalGain30 = charitableCapitalGain30.plus(d(k1.charitableCapitalGain30));
      charitableCapitalGain20 = charitableCapitalGain20.plus(d(k1.charitableCapitalGain20));
      selfEmploymentEarnings = selfEmploymentEarnings.plus(d(k1.selfEmploymentEarnings));
      guaranteedPayments = guaranteedPayments.plus(d(k1.guaranteedPayments));
      section199AQualifiedReitDividends = section199AQualifiedReitDividends.plus(d(k1.section199AQualifiedReitDividends));
      section199AQualifiedPTPIncome = section199AQualifiedPTPIncome.plus(d(k1.section199AQualifiedPTPIncome));
      unrecapturedSection1250Gain = unrecapturedSection1250Gain.plus(d(k1.unrecapturedSection1250Gain));
      collectiblesGain = collectiblesGain.plus(d(k1.collectiblesGain));
      amtDepreciationAdjustment = amtDepreciationAdjustment.plus(d(k1.amtDepreciationAdjustment));
      amtAdjustedGainOrLoss = amtAdjustedGainOrLoss.plus(d(k1.amtAdjustedGainOrLoss));
      amtDepletion = amtDepletion.plus(d(k1.amtDepletion));
      amtOtherItems = amtOtherItems.plus(d(k1.amtOtherItems));
      const ftpVal = d(k1.foreignTaxPaid);
      foreignTaxPaid = foreignTaxPaid.plus(ftpVal);
      const category = k1.foreignTaxCategory ?? "general";
      if (category === "passive") foreignTaxPassive = foreignTaxPassive.plus(ftpVal);
      else foreignTaxGeneral = foreignTaxGeneral.plus(ftpVal);
      if (k1.isPassiveActivity) passiveCount++;
    }
    return {
      taxExemptInterest, qualifiedDividends,
      excessBusinessInterestPartnership, investmentInterestExpense,
      investmentIncome, excessBusinessInterestIncomePartnership,
      investmentExpenses, charitableCash, charitableCapitalGain30,
      charitableCapitalGain20, selfEmploymentEarnings, guaranteedPayments,
      section199AQualifiedReitDividends, section199AQualifiedPTPIncome,
      unrecapturedSection1250Gain, collectiblesGain,
      amtDepreciationAdjustment, amtAdjustedGainOrLoss, amtDepletion, amtOtherItems,
      foreignTaxPaid, foreignTaxPassive, foreignTaxGeneral, passiveCount,
    };
  })();

  // ═══════════════════════════════════════════════════════════
  // Phase 1: Income Assembly (Form 1040 Lines 1-9)
  // ═══════════════════════════════════════════════════════════

  const form1099R = calculateForm1099R(input.form1099R ?? [], {
    qcdAnnualLimit: constants.qcd.annualLimit,
  });
  audit.merge(form1099R.lines);
  const form4137 = input.form4137
    ? calculateForm4137(input.form4137, constants, {
      socialSecurityWagesAndTipsAlreadyReported: w2Agg.ssWages,
      socialSecurityTipsAlreadyReported: w2Agg.ssTips,
    })
    : undefined;
  if (form4137) {
    audit.merge(form4137.lines);
  }
  const form8919 = input.form8919
    ? calculateForm8919(input.form8919, constants, {
      socialSecurityWagesAndTipsAlreadyReported: w2Agg.ssWages,
      w2SocialSecurityTipsAlreadyReported: w2Agg.ssTips,
      form4137SocialSecurityTipsAlreadyReported: form4137?.line10 ?? new Decimal(0),
    })
    : undefined;
  if (form8919) {
    audit.merge(form8919.lines);
  }

  // Line 1: Wages
  const totalWagesBeforeExclusion = w2Agg.wages
    .plus(form4137?.unreportedTipIncome ?? new Decimal(0))
    .plus(form8919?.line6 ?? new Decimal(0))
    .plus(form1099R.disabilityPensionWages);

  audit.record("1040", "1a", "W-2 wages", w2Agg.wages, "Sum W-2 box 1");
  audit.record("1040", "1c", "Unreported tips", form4137?.unreportedTipIncome ?? new Decimal(0), "Supported Form 4137 tips not included in line 1a");
  audit.record("1040", "1g", "Wages from Form 8919", form8919?.line6 ?? new Decimal(0), "Form 8919 line 6");
  audit.record("1040", "1h", "Other earned income", form1099R.disabilityPensionWages, "Supported disability pensions before minimum retirement age");

  // ── Form 2555: Foreign Earned Income Exclusion ────────
  // Must be computed before Line 1 is finalized because the exclusion
  // reduces the wages amount entered on Form 1040 Line 1a.
  const form2555 = input.form2555
    ? calculateForm2555(input.form2555, constants)
    : undefined;
  if (form2555) {
    audit.merge(form2555.lines);
  }
  const form2555IncomeReduction = form2555?.totalIncomeReduction ?? new Decimal(0);
  const form2555HousingDeduction = form2555?.housingDeduction ?? new Decimal(0);

  // Adoption benefit exclusion must precede AGI. The completed Part III MAGI
  // worksheet is an actual input; final credit MAGI is calculated later from AGI.
  const calculateAdoption = (creditAgi: Decimal, taxLiabilityLimit: Decimal) => input.form8839
    ? calculateForm8839({
      ...input.form8839,
      taxYear: year, filingStatus, agi: creditAgi, taxLiabilityLimit,
      foreignEarnedIncomeExclusion: form2555 ? form2555IncomeReduction : d(input.form8839.foreignEarnedIncomeExclusion),
      foreignHousingExclusion: form2555 ? form2555HousingDeduction : d(input.form8839.foreignHousingExclusion),
      possessionIncomeExclusion: d(input.form8839.possessionIncomeExclusion),
      exclusionMagi: input.form8839.exclusionMagi === undefined ? undefined : d(input.form8839.exclusionMagi),
      carryforwards: input.form8839.carryforwards?.map(entry => ({...entry,amount:d(entry.amount)})),
      constants: constants.adoptionCredit,
    }) : undefined;
  if (year === 2026 && input.form8839?.children.some(child => child.sourceFactsComplete !== true)) {
    throw new Error("Adoption classification, employer benefits or prior lifetime history is unknown");
  }
  const reportedAdoptionBenefits = sum(...input.w2s.map(w2 => d(w2.box12CodeT)));
  if (reportedAdoptionBenefits.gt(0) && !input.form8839) throw new Error("Reported W-2 adoption benefits require actual Form 8839 facts");
  if (reportedAdoptionBenefits.gt(0) && input.form8839 && !reportedAdoptionBenefits.eq(sum(...input.form8839.children.map(child => d(child.employerBenefits))))) {
    throw new Error("Reported W-2 adoption benefits do not reconcile with actual child benefit amounts");
  }
  const hasAdoptionBenefitCalculation = input.form8839?.children.some(child =>
    d(child.employerBenefits).gt(0) || (child.isSpecialNeeds && child.employerPlanQualified === true)) ?? false;
  if (hasAdoptionBenefitCalculation && input.form8839?.exclusionMagi === undefined) {
    throw new Error("Adoption exclusion MAGI worksheet is unknown");
  }
  if (year === 2026 && input.form8839 && input.form8839.possessionIncomeExclusion === undefined) {
    throw new Error("2026 adoption possession-income exclusion is unknown");
  }
  // Only Part III exclusion is consumed here. Credit calculations and audit are
  // discarded until final AGI and actual credit limits are known.
  const adoptionBenefitResult = hasAdoptionBenefitCalculation
    ? calculateAdoption(d(input.form8839?.exclusionMagi), new Decimal(0)) : undefined;
  const taxableAdoptionBenefits = adoptionBenefitResult?.taxableEmployerBenefits ?? new Decimal(0);
  audit.record("1040", "1f", "Taxable adoption benefits", taxableAdoptionBenefits, "Signed Form 8839 line 31");
  const totalWages = zeroFloor(totalWagesBeforeExclusion.minus(form2555IncomeReduction)).plus(taxableAdoptionBenefits);
  audit.record("1040", "1", "Wages, salaries, tips", totalWages,
    [
      "Sum of all W-2 Box 1",
      taxableAdoptionBenefits.isZero() ? undefined : `signed taxable adoption benefits $${taxableAdoptionBenefits}`,
      form4137?.unreportedTipIncome.greaterThan(0)
        ? "supported Form 4137 unreported tip income"
        : undefined,
      form8919?.line6.greaterThan(0)
        ? "supported Form 8919 wages"
        : undefined,
      form1099R.disabilityPensionWages.isZero()
        ? undefined
        : form1099R.disabilityPensionPublicSafetyOfficerPremiumExclusion.greaterThan(0)
          ? "disability pensions taxable as wages before minimum retirement age, net of the retired public safety officer insurance premium exclusion"
          : "disability pensions taxable as wages before minimum retirement age",
      form2555IncomeReduction.greaterThan(0)
        ? `less Form 2555 foreign earned income exclusion and housing exclusion $${form2555IncomeReduction}`
        : undefined,
    ].filter((part): part is string => part !== undefined).join(" plus "),
    {
      w2Count: input.w2s.length.toString(),
      form4137UnreportedTipIncome: form4137?.unreportedTipIncome ?? new Decimal(0),
      form8919Wages: form8919?.line6 ?? new Decimal(0),
      disabilityPensionWages: form1099R.disabilityPensionWages,
      disabilityPensionPublicSafetyOfficerPremiumExclusion:
        form1099R.disabilityPensionPublicSafetyOfficerPremiumExclusion,
      form2555IncomeReduction,
    });

  // ── Form 8814: Parents' Election To Report Child's Interest and Dividends ──
  const form8814: AggregatedForm8814 | undefined = (input.form8814?.length ?? 0) > 0
    ? aggregateForm8814Results(input.form8814, constants)
    : undefined;
  if (form8814) {
    audit.merge(form8814.lines);
  }

  // Line 2a: Tax-exempt interest (informational, not included in total income)
  // Includes 1099-INT Box 8, 1099-DIV Box 12, 1099-OID Box 14 (net of Box 13), K-1 Box 18 Code A, K-1 1041 Box 14 Code A, and Form 8814 Line 1b
  const taxExemptOID = sum(
    ...(input.form1099OID ?? []).map((f) =>
      zeroFloor(d(f.taxExemptOID).minus(d(f.taxExemptBondPremium)))
    )
  );
  const taxExemptInterest = sum(
    intAgg.taxExemptInterest,
    divAgg.exemptInterestDividends,
    k1Agg.taxExemptInterest,
    ...(input.scheduleK1Form1041 ?? []).map((k) => d(k.taxExemptInterest)),
    taxExemptOID,
    form8814?.totalTaxExemptInterest ?? new Decimal(0)
  );
  audit.record("1040", "2a", "Tax-exempt interest", taxExemptInterest,
    "Sum 1099-INT Box 8 + 1099-DIV Box 12 + 1099-OID Box 14 + K-1 Box 18A + K-1 1041 Box 14A + Form 8814 Line 1b");

  // Lines 2b, 3a, 3b: Interest and dividends via Schedule B
  const preliminaryScheduleB = calculateScheduleB(input);
  const totalInterestBeforeSavingsBondExclusion = preliminaryScheduleB.totalInterest;

  // Qualified dividends (not on Schedule B — it only handles ordinary)
  // Form 8814 Line 9 qualified dividends flow to BOTH Lines 3a and 3b
  const form8814QualifiedDividends = form8814?.totalQualifiedDividends ?? new Decimal(0);
  const qualifiedDividends = sum(
    divAgg.qualifiedDividends,
    k1Agg.qualifiedDividends,
    ...(input.scheduleK1Form1041 ?? []).map((k) => d(k.qualifiedDividends)),
    form8814QualifiedDividends
  );
  audit.record("1040", "3a", "Qualified dividends", qualifiedDividends,
    "Sum 1099-DIV Box 1b + K-1 Box 6b + K-1 1041 Box 2b + Form 8814 Line 9");

  // Form 8814 Line 9 also adds to ordinary dividends (qualified dividends are a subset)
  const totalDividends = preliminaryScheduleB.totalOrdinaryDividends.plus(form8814QualifiedDividends);

  const form1099SA = calculateForm1099SA(input.form1099SA ?? []);
  audit.merge(form1099SA.lines);
  // ── Form 8606 calculation ──────────────────────────────────────────
  // Supports three modes:
  // 1. form8606ByOwner: Per-spouse Form 8606 on MFJ returns (each spouse's IRA basis computed independently)
  // 2. form8606: Single combined Form 8606 (backward-compatible, used for single filers or pre-split MFJ)
  // 3. Neither: No Form 8606, IRA taxable amounts come directly from Form 1099-R
  let form8606: Form8606Result | undefined;
  let form8606ByOwnerResults: Partial<Record<"primary" | "spouse", Form8606Result>> | undefined;
  let usedDefaultForm8606TraditionalDistributions = false;
  let usedDefaultForm8606RothConversions = false;
  let usedDefaultForm8606RothDistributions = false;
  let usedDefaultForm8606QualifiedRothDistributionsExcludedFromLine19 = false;
  let form8606OwnerDefaultsSuppressionReason: string | undefined;
  let form8606QualifiedHsaFundingSuppressionReason: string | undefined;
  // Hoisted default values used in audit trail (populated in single-form path)
  let defaultForm8606TraditionalDistributions = new Decimal(0);
  let defaultForm8606RothDistributions = new Decimal(0);
  let defaultForm8606QualifiedRothDistributionsExcludedFromLine19 = new Decimal(0);
  let defaultForm8606RothConversions = new Decimal(0);
  // When form8606ByOwner is used but one spouse has no Form 8606, that spouse's
  // IRA distributions are fully taxable. Track these separately so they add to iraTaxable.
  let nonForm8606OwnerIraTaxable = new Decimal(0);
  let ownerAmbiguousJointReturnIraGrossOutsideForm8606 = new Decimal(0);
  let ownerAmbiguousJointReturnIraTaxableOutsideForm8606 = new Decimal(0);

  if (input.form8606ByOwner !== undefined) {
    // ── Per-owner Form 8606 path ──────────────────────────────────
    const allForms = input.form1099R ?? [];
    const ownerSpecificMfJPath =
      input.taxpayer.filingStatus === "married_filing_jointly" && input.taxpayer.spouse !== undefined;
    const ownerAmbiguousForms = ownerSpecificMfJPath
      ? allForms.filter((f) => f.accountHolder === undefined)
      : [];
    const primaryForms = ownerSpecificMfJPath
      ? allForms.filter((f) => f.accountHolder === "primary")
      : allForms.filter((f) => f.accountHolder === "primary" || f.accountHolder === undefined);
    const spouseForms = allForms.filter((f) => f.accountHolder === "spouse");
    form8606ByOwnerResults = {};

    const primaryInput = input.form8606ByOwner.primary;
    const spouseInput = input.form8606ByOwner.spouse;

    if (primaryInput !== undefined) {
      const primaryHsa = input.form8889ByOwner?.primary ?? (input.form8889 ?? undefined);
      const defaults = deriveForm8606DefaultsForOwner(primaryForms, primaryHsa, {
        qcdAnnualLimit: constants.qcd.annualLimit,
      });
      const primaryResult = calculateForm8606ForOwner(primaryInput, defaults);
      form8606ByOwnerResults.primary = primaryResult;
      audit.merge(primaryResult.lines);
    }

    if (spouseInput !== undefined) {
      const spouseHsa = input.form8889ByOwner?.spouse ?? undefined;
      const defaults = deriveForm8606DefaultsForOwner(spouseForms, spouseHsa, {
        qcdAnnualLimit: constants.qcd.annualLimit,
      });
      const spouseResult = calculateForm8606ForOwner(spouseInput, defaults);
      form8606ByOwnerResults.spouse = spouseResult;
      audit.merge(spouseResult.lines);
    }

    // For owners WITHOUT Form 8606, their IRA distributions are fully taxable (no basis)
    if (primaryInput === undefined && primaryForms.length > 0) {
      const primaryIra = calculateForm1099R(primaryForms, {
        qcdAnnualLimit: constants.qcd.annualLimit,
      });
      nonForm8606OwnerIraTaxable = nonForm8606OwnerIraTaxable.plus(primaryIra.iraTaxable);
    }
    if (spouseInput === undefined && spouseForms.length > 0) {
      const spouseIra = calculateForm1099R(spouseForms, {
        qcdAnnualLimit: constants.qcd.annualLimit,
      });
      nonForm8606OwnerIraTaxable = nonForm8606OwnerIraTaxable.plus(spouseIra.iraTaxable);
    }
    if (ownerAmbiguousForms.length > 0) {
      const ambiguousIra = calculateForm1099R(ownerAmbiguousForms, {
        qcdAnnualLimit: constants.qcd.annualLimit,
      });
      ownerAmbiguousJointReturnIraGrossOutsideForm8606 = sum(
        ...ownerAmbiguousForms
          .filter((form) => isIraForm1099RDistribution(form) && !isPriorYearTaxableDistribution(form))
          .map((form) => d(form.grossDistribution))
      );
      ownerAmbiguousJointReturnIraTaxableOutsideForm8606 = ambiguousIra.iraTaxable;
      nonForm8606OwnerIraTaxable = nonForm8606OwnerIraTaxable.plus(ambiguousIra.iraTaxable);
    }

    // Combine per-owner results into a single form8606 for downstream use
    const results = [form8606ByOwnerResults.primary, form8606ByOwnerResults.spouse].filter(
      (r): r is Form8606Result => r !== undefined
    );
    if (results.length === 2) {
      form8606 = combineForm8606Results(results[0], results[1]);
    } else if (results.length === 1) {
      form8606 = results[0];
    }
  } else if (input.form8606 !== undefined) {
    // ── Single Form 8606 path (backward-compatible) ───────────────
    form8606OwnerDefaultsSuppressionReason = deriveForm8606OwnerDefaultsSuppressionReason(
      input.taxpayer,
      input.form1099R ?? []
    );
    const form8606OwnerDefaultsAreAmbiguous = form8606OwnerDefaultsSuppressionReason !== undefined;
    form8606QualifiedHsaFundingSuppressionReason = deriveForm8606QualifiedHsaFundingSuppressionReason(
      input.form8889,
      input.form8889ByOwner
    );
    defaultForm8606TraditionalDistributions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : deriveDefaultForm8606TraditionalDistributions(input.form1099R ?? []);
    const defaultForm8606QualifiedCharitableDistributions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : form1099R.iraQualifiedCharitableDistributions;
    const defaultForm8606RolledOverDistributions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : form1099R.iraRolledOverDistributions;
    defaultForm8606RothConversions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : form1099R.iraRothConversions;
    defaultForm8606RothDistributions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : deriveDefaultForm8606RothDistributions(input.form1099R ?? []);
    const defaultForm8606RothRolledOverDistributions = form8606OwnerDefaultsAreAmbiguous
      ? new Decimal(0)
      : deriveDefaultForm8606RothRolledOverDistributions(input.form1099R ?? []);
    const defaultForm8606TraditionalReturnedContributionsByDueDate =
      form8606OwnerDefaultsAreAmbiguous
        ? new Decimal(0)
        : deriveDefaultForm8606TraditionalReturnedContributionsByDueDate(input.form1099R ?? []);
    const defaultForm8606TraditionalReturnedExcessContributions =
      form8606OwnerDefaultsAreAmbiguous
        ? new Decimal(0)
        : deriveDefaultForm8606TraditionalReturnedExcessContributions(input.form1099R ?? []);
    const defaultForm8606RothReturnedContributionsByDueDate =
      form8606OwnerDefaultsAreAmbiguous
        ? new Decimal(0)
        : deriveDefaultForm8606RothReturnedContributionsByDueDate(input.form1099R ?? []);
    const defaultForm8606RothReturnedExcessContributions =
      form8606OwnerDefaultsAreAmbiguous
        ? new Decimal(0)
        : deriveDefaultForm8606RothReturnedExcessContributions(input.form1099R ?? []);
    defaultForm8606QualifiedRothDistributionsExcludedFromLine19 =
      form8606OwnerDefaultsAreAmbiguous
        ? new Decimal(0)
        : deriveDefaultForm8606QualifiedRothDistributionsExcludedFromLine19(input.form1099R ?? []);
    const defaultForm8606TraditionalQualifiedHsaFundingDistributions =
      deriveDefaultForm8606TraditionalQualifiedHsaFundingDistributions(input.form8889, input.form8889ByOwner);
    const defaultForm8606RothQualifiedHsaFundingDistributions =
      deriveDefaultForm8606RothQualifiedHsaFundingDistributions(input.form8889, input.form8889ByOwner);
    usedDefaultForm8606TraditionalDistributions = input.form8606.traditionalDistributions === undefined;
    usedDefaultForm8606RothConversions = input.form8606.rothConversions === undefined;
    usedDefaultForm8606RothDistributions = input.form8606.rothDistributions === undefined;
    usedDefaultForm8606QualifiedRothDistributionsExcludedFromLine19 =
      input.form8606.rothDistributions === undefined
      && input.form8606.qualifiedRothDistributionsExcludedFromLine19 === undefined;
    form8606 = calculateForm8606({
      ...input.form8606,
      traditionalDistributions:
        input.form8606.traditionalDistributions ?? defaultForm8606TraditionalDistributions.toString(),
      qualifiedCharitableDistributions:
        input.form8606.qualifiedCharitableDistributions ?? defaultForm8606QualifiedCharitableDistributions.toString(),
      rolledOverDistributions:
        input.form8606.rolledOverDistributions ?? defaultForm8606RolledOverDistributions.toString(),
      returnedContributionsByDueDate:
        input.form8606.returnedContributionsByDueDate
        ?? defaultForm8606TraditionalReturnedContributionsByDueDate.toString(),
      returnedExcessContributions:
        input.form8606.returnedExcessContributions
        ?? defaultForm8606TraditionalReturnedExcessContributions.toString(),
      qualifiedHsaFundingDistributions:
        input.form8606.qualifiedHsaFundingDistributions
        ?? defaultForm8606TraditionalQualifiedHsaFundingDistributions.toString(),
      rothConversions:
        input.form8606.rothConversions ?? defaultForm8606RothConversions.toString(),
      rothDistributions:
        input.form8606.rothDistributions ?? defaultForm8606RothDistributions.toString(),
      qualifiedRothDistributionsExcludedFromLine19:
        input.form8606.qualifiedRothDistributionsExcludedFromLine19
        ?? defaultForm8606QualifiedRothDistributionsExcludedFromLine19.toString(),
      rothRolledOverDistributions:
        input.form8606.rothRolledOverDistributions
        ?? defaultForm8606RothRolledOverDistributions.toString(),
      rothReturnedContributionsByDueDate:
        input.form8606.rothReturnedContributionsByDueDate
        ?? defaultForm8606RothReturnedContributionsByDueDate.toString(),
      rothReturnedExcessContributions:
        input.form8606.rothReturnedExcessContributions
        ?? defaultForm8606RothReturnedExcessContributions.toString(),
      rothQualifiedHsaFundingDistributions:
        input.form8606.rothQualifiedHsaFundingDistributions
        ?? defaultForm8606RothQualifiedHsaFundingDistributions.toString(),
    });
    audit.merge(form8606.lines);
  }
  const totalIraGrossDistributions = sum(
    ...(input.form1099R ?? [])
      .filter((form) => isIraForm1099RDistribution(form) && !isPriorYearTaxableDistribution(form))
      .map((form) => d(form.grossDistribution))
  );
  const form8606GrossDistributions = form8606
    ? form8606.line7
      .plus(form8606.line16)
      .plus(form8606.line7Exclusions)
      .plus(form8606.line19Exclusions)
      .plus(form8606.line19)
    : new Decimal(0);
  const iraGrossReported = form8606
    ? Decimal.max(totalIraGrossDistributions, form8606GrossDistributions)
    : form1099R.iraGrossReported;
  let iraTaxable = form8606
    ? form8606.taxableTraditionalDistributions
      .plus(form8606.taxableRothConversions)
      .plus(form8606.taxableRothDistributions)
      .plus(form1099R.iraReturnedContributionsByDueDateTaxableEarnings)
      .plus(nonForm8606OwnerIraTaxable)
    : form1099R.iraTaxable;
  audit.record("1040", "4a", "IRA distributions", iraGrossReported,
    iraGrossReported.isZero()
      ? "Blank because all IRA distributions are fully taxable or absent"
      : form8606
        ? "Gross IRA distributions reported from the larger of IRA Form 1099-R Box 1 totals or Form 8606 Lines 7 + 16 + 19 plus excluded QCDs, rollovers, returned contributions by due date, returned excess contributions, qualified HSA funding distributions, qualified Roth distributions, Roth rollovers, and Roth qualified HSA funding distributions"
        : form1099R.iraQualifiedCharitableDistributions.greaterThan(0)
          ? "Form 1099-R IRA gross distributions including qualified charitable distributions"
          : "Form 1099-R IRA gross distributions",
    form8606
      ? {
        "IRA Form 1099-R Box 1 total": totalIraGrossDistributions,
        "Form 8606 Line 7": form8606.line7,
        "Form 8606 Line 16": form8606.line16,
        "Form 8606 Line 19": form8606.line19,
        ...(usedDefaultForm8606TraditionalDistributions
          ? {
            "Defaulted Form 8606 Line 7 gross distributions from attached IRA 1099-R": defaultForm8606TraditionalDistributions,
          }
          : {}),
        ...(usedDefaultForm8606RothDistributions
          ? {
            "Defaulted Form 8606 Line 19 from attached Roth IRA 1099-R": defaultForm8606RothDistributions,
          }
          : {}),
        ...(usedDefaultForm8606QualifiedRothDistributionsExcludedFromLine19
          ? {
            "Defaulted Form 8606 qualified Roth distributions excluded from Line 19":
              defaultForm8606QualifiedRothDistributionsExcludedFromLine19,
          }
          : {}),
        ...(usedDefaultForm8606RothConversions
          ? {
            "Defaulted Form 8606 Line 8 from attached IRA 1099-R Roth conversions": defaultForm8606RothConversions,
          }
          : {}),
        ...(ownerAmbiguousJointReturnIraGrossOutsideForm8606.isZero()
          ? {}
          : {
            "Owner-ambiguous joint-return IRA gross distributions outside Form 8606":
              ownerAmbiguousJointReturnIraGrossOutsideForm8606,
          }),
        ...(form8606OwnerDefaultsSuppressionReason === undefined
          ? {}
          : {
            "Form 8606 owner-specific IRA defaults": form8606OwnerDefaultsSuppressionReason,
          }),
        ...(form8606QualifiedHsaFundingSuppressionReason === undefined
          ? {}
          : {
            "Form 8606 owner-specific HSA funding defaults": form8606QualifiedHsaFundingSuppressionReason,
          }),
        "Form 8606 qualified charitable distributions": form8606.qualifiedCharitableDistributions,
        "Form 8606 rolled over distributions": form8606.rolledOverDistributions,
        "Form 8606 returned contributions by due date": form8606.returnedContributionsByDueDate,
        "Form 8606 returned excess contributions": form8606.returnedExcessContributions,
        "Form 8606 qualified HSA funding distributions": form8606.qualifiedHsaFundingDistributions,
        "Form 8606 qualified Roth distributions excluded from Line 19": form8606.qualifiedRothDistributionsExcludedFromLine19,
        "Form 8606 Roth rolled over distributions": form8606.rothRolledOverDistributions,
        "Form 8606 Roth returned contributions by due date": form8606.rothReturnedContributionsByDueDate,
        "Form 8606 returned Roth excess contributions": form8606.rothReturnedExcessContributions,
        "Form 8606 Roth qualified HSA funding distributions": form8606.rothQualifiedHsaFundingDistributions,
      }
      : {
        "IRA Form 1099-R Box 1 total": totalIraGrossDistributions,
      });
  audit.record("1040", "4b", "Taxable IRA distributions", iraTaxable,
    form8606
      ? ownerAmbiguousJointReturnIraTaxableOutsideForm8606.isZero()
        ? form1099R.iraReturnedContributionsByDueDateTaxableEarnings.isZero()
          ? "Form 8606 Line 15c + Line 18 + Line 25c after excluding any QCDs, rollovers, returned contributions by due date, returned excess contributions, and qualified HSA funding distributions from Line 7"
          : "Form 8606 Line 15c + Line 18 + Line 25c, plus taxable Box 2a earnings from current-year IRA contributions returned by the due date that stay outside Form 8606 Line 7"
        : form1099R.iraReturnedContributionsByDueDateTaxableEarnings.isZero()
          ? "Form 8606 Line 15c + Line 18 + Line 25c, plus owner-ambiguous joint-return IRA amounts that stay outside both spouse-specific Form 8606 defaults"
          : "Form 8606 Line 15c + Line 18 + Line 25c, plus taxable Box 2a earnings from current-year IRA contributions returned by the due date and owner-ambiguous joint-return IRA amounts that stay outside both spouse-specific Form 8606 defaults"
      : form1099R.iraQualifiedCharitableDistributions.greaterThan(0)
        ? "Form 1099-R taxable IRA distributions after subtracting qualified charitable distributions"
        : "Form 1099-R taxable IRA distributions",
    form8606
      ? {
        "Form 8606 Line 15c": form8606.taxableTraditionalDistributions,
        "Form 8606 Line 18": form8606.taxableRothConversions,
        "Form 8606 Line 25c": form8606.taxableRothDistributions,
        ...(usedDefaultForm8606TraditionalDistributions
          ? {
            "Defaulted Form 8606 Line 7 gross distributions from attached IRA 1099-R": defaultForm8606TraditionalDistributions,
          }
          : {}),
        ...(usedDefaultForm8606RothConversions
          ? {
            "Defaulted Form 8606 Line 8 from attached IRA 1099-R Roth conversions": defaultForm8606RothConversions,
          }
          : {}),
        ...(ownerAmbiguousJointReturnIraTaxableOutsideForm8606.isZero()
          ? {}
          : {
            "Owner-ambiguous joint-return IRA taxable amount outside Form 8606":
              ownerAmbiguousJointReturnIraTaxableOutsideForm8606,
          }),
        ...(form8606OwnerDefaultsSuppressionReason === undefined
          ? {}
          : {
            "Form 8606 owner-specific IRA defaults": form8606OwnerDefaultsSuppressionReason,
          }),
        ...(form8606QualifiedHsaFundingSuppressionReason === undefined
          ? {}
          : {
            "Form 8606 owner-specific HSA funding defaults": form8606QualifiedHsaFundingSuppressionReason,
          }),
        "Taxable earnings from returned contributions by due date": form1099R.iraReturnedContributionsByDueDateTaxableEarnings,
      }
      : {
        "Form 1099-R taxable IRA distributions": form1099R.iraTaxable,
      });
  audit.record("1040", "5a", "Pensions and annuities", form1099R.pensionGrossReported,
    form1099R.pensionGrossReported.isZero()
      ? "Blank because all pension and annuity distributions are fully taxable or absent"
      : "Form 1099-R pension and annuity gross distributions");
  let pensionTaxable = form1099R.pensionTaxable;
  audit.record("1040", "5b", "Taxable pensions and annuities", pensionTaxable,
    "Form 1099-R taxable pensions and annuities");

  // ── Form 8915-F: Qualified Disaster Retirement Plan Distributions ──
  // Adjusts Lines 4b/5b by deferring current-year disaster distributions (3-year spread)
  // and including prior-year deferred amounts.
  let form8915FResult: Form8915FResult | undefined;
  let form982: ReturnType<typeof calculateForm982> | undefined;
  if (input.form8915F) {
    form8915FResult = calculateForm8915F(input.form8915F);
    audit.merge(form8915FResult.lines);

    // Current-year IRA/pension amounts already in iraTaxable/pensionTaxable via 1099-R pipeline.
    // Form 8915-F defers 2/3 and includes prior-year deferred 1/3 portions.
    const currentYearIraDeferred = sum(
      ...form8915FResult.currentYearDetail.map((r) =>
        roundDollar(r.deferredToFutureYears.times(r.iraFraction))
      )
    );
    const currentYearPensionDeferred = sum(
      ...form8915FResult.currentYearDetail.map((r) =>
        r.deferredToFutureYears.minus(roundDollar(r.deferredToFutureYears.times(r.iraFraction)))
      )
    );
    const priorYearIraIncludable = sum(
      ...form8915FResult.priorYearDetail.map((r) => r.iraPortionOfIncludable)
    );
    const priorYearPensionIncludable = sum(
      ...form8915FResult.priorYearDetail.map((r) => r.pensionPortionOfIncludable)
    );

    // Adjust IRA taxable: subtract deferred, add prior-year inclusions
    const iraAdjustment = priorYearIraIncludable.minus(currentYearIraDeferred);
    if (!iraAdjustment.isZero()) {
      iraTaxable = zeroFloor(iraTaxable.plus(iraAdjustment));
      audit.record("1040", "4b-8915F", "Form 8915-F IRA disaster distribution adjustment", iraAdjustment,
        "Prior-year IRA inclusions minus current-year IRA deferrals",
        {
          "Prior-year IRA includable": priorYearIraIncludable,
          "Current-year IRA deferred": currentYearIraDeferred,
          "Adjusted IRA taxable": iraTaxable,
        });
    }

    // Adjust pension taxable: subtract deferred, add prior-year inclusions
    const pensionAdjustment = priorYearPensionIncludable.minus(currentYearPensionDeferred);
    if (!pensionAdjustment.isZero()) {
      pensionTaxable = zeroFloor(pensionTaxable.plus(pensionAdjustment));
      audit.record("1040", "5b-8915F", "Form 8915-F pension disaster distribution adjustment", pensionAdjustment,
        "Prior-year pension inclusions minus current-year pension deferrals",
        {
          "Prior-year pension includable": priorYearPensionIncludable,
          "Current-year pension deferred": currentYearPensionDeferred,
          "Adjusted pension taxable": pensionTaxable,
        });
    }
  }

  const form8824 = (input.form8824 ?? []).length > 0
    ? calculateForm8824Aggregate(input.form8824 ?? [])
    : undefined;
  if (form8824) {
    audit.merge(form8824.lines);
  }

  const form4797 = calculateForm4797(input, {
    supportedForm8824Section1231GainOrLoss: form8824?.totalSection1231RecognizedGainOrLoss ?? new Decimal(0),
    supportedForm8824OrdinaryIncome: form8824?.totalOrdinaryIncome ?? new Decimal(0),
  });
  audit.merge(form4797.lines);

  // ── Crypto / Digital Asset Processing ─────────────────────
  // Process 1099-DA transactions: convert to Form 8949 entries via Form 1099-B path.
  // Also process mining/staking/airdrop income.
  let cryptoIncomeResult: CryptoIncomeResult | undefined;
  const cryptoInput = input.cryptoIncome;
  if (cryptoInput) {
    cryptoIncomeResult = calculateCryptoIncome({
      miningIncome: cryptoInput.miningIncome,
      stakingIncome: cryptoInput.stakingIncome,
      airdropIncome: cryptoInput.airdropIncome,
      isMiningBusiness: cryptoInput.isMiningBusiness,
      isStakingBusiness: cryptoInput.isStakingBusiness,
    });
    audit.merge(cryptoIncomeResult.lines);
  }

  // Convert 1099-DA transactions to 1099-B CapitalTransaction entries for Form 8949
  const form1099DAForms = input.form1099DA ?? [];

  // When the taxpayer provides lots and has 1099-DA transactions without broker-reported
  // basis, use lot matching to determine cost basis per the elected method.
  const cryptoBasisMethod = cryptoInput?.cryptoCostBasisMethod ?? "fifo";
  const userLots = cryptoInput?.lots ? initializeLots(cryptoInput.lots) : [];
  // Also include lots established from mining/staking/airdrop income events
  const allLots = [...userLots, ...(cryptoIncomeResult?.newLots ?? [])];

  // Process DeFi token swaps (DEX trades, wrapping, bridging) before 1099-DA lot matching
  // so that swap-created lots are available for further matching.
  let defiSwapResult: DeFiSwapResult | undefined;
  const tokenSwaps = cryptoInput?.tokenSwaps ?? [];
  if (tokenSwaps.length > 0) {
    defiSwapResult = processDeFiTokenSwaps(tokenSwaps, allLots, cryptoBasisMethod);
    audit.merge(defiSwapResult.lines);
    // Add lots created by swaps to the pool for 1099-DA lot matching
    allLots.push(...defiSwapResult.newLots);
  }

  // Process DeFi LP positions (enter/exit) — entry is non-taxable, exit generates Form 8949
  let lpResult: LPPositionResult | undefined;
  const lpPositions = cryptoInput?.lpPositions ?? [];
  if (lpPositions.length > 0) {
    lpResult = processDeFiLPPositions(lpPositions, allLots, cryptoBasisMethod);
    audit.merge(lpResult.lines);
    allLots.push(...lpResult.newLots);
  }

  // Process DeFi yield/liquidity mining rewards → ordinary income
  let yieldResult: YieldRewardResult | undefined;
  const yieldRewards = cryptoInput?.yieldRewards ?? [];
  if (yieldRewards.length > 0) {
    yieldResult = calculateYieldRewards(yieldRewards);
    audit.merge(yieldResult.lines);
    allLots.push(...yieldResult.newLots);
  }

  // Process NFT transactions (buy/sell/mint/airdrop/gift)
  let nftResult: NFTResult | undefined;
  const nftTransactions = cryptoInput?.nftTransactions ?? [];
  if (nftTransactions.length > 0) {
    nftResult = processNFTTransactions(nftTransactions);
    audit.merge(nftResult.lines);
    allLots.push(...nftResult.newLots);
  }

  // Process crypto lending interest income → ordinary income
  let lendingResult: CryptoLendingResult | undefined;
  const lendingIncome = cryptoInput?.lendingIncome ?? [];
  if (lendingIncome.length > 0) {
    lendingResult = calculateCryptoLendingIncome(lendingIncome);
    audit.merge(lendingResult.lines);
    allLots.push(...lendingResult.newLots);
  }

  // Process crypto collateral liquidations → Form 8949
  let liquidationResult: LiquidationResult | undefined;
  const liquidations = cryptoInput?.liquidations ?? [];
  if (liquidations.length > 0) {
    liquidationResult = processCryptoLiquidations(liquidations, allLots, cryptoBasisMethod);
    audit.merge(liquidationResult.lines);
  }

  // Process crypto charitable donations → Schedule A deduction
  let donationResult: CryptoDonationResult | undefined;
  const cryptoDonations = cryptoInput?.donations ?? [];
  if (cryptoDonations.length > 0) {
    donationResult = calculateCryptoDonations(cryptoDonations);
    audit.merge(donationResult.lines);
  }

  // Separate 1099-DA transactions needing lot matching from those with broker-reported basis
  const needsLotMatching = form1099DAForms.some((form) =>
    form.transactions.some((t) => !t.basisReportedToIRS && d(t.costBasis).isZero())
  );

  let lotMatchedBasis: Map<string, { costBasis: Decimal; dateAcquired: string }> | undefined;
  let lotMatchedDispositions: MatchedDisposition[] = [];
  if (needsLotMatching && allLots.length > 0) {
    const transactionsForMatching = form1099DAForms.flatMap((form) =>
      form.transactions
        .filter((t) => !t.basisReportedToIRS && d(t.costBasis).isZero())
        .map((t) => ({ transaction: t, broker: form.brokerName }))
    );
    const lotResult = matchLots(transactionsForMatching, allLots, cryptoBasisMethod);
    audit.merge(lotResult.lines);
    lotMatchedDispositions = lotResult.dispositions;
    // Index matched dispositions by broker+asset+dateSold for lookup
    lotMatchedBasis = new Map();
    for (const disp of lotResult.dispositions) {
      lotMatchedBasis.set(`${disp.description}|${disp.dateSold}`, {
        costBasis: disp.costBasis,
        dateAcquired: disp.dateAcquired,
      });
    }
  }

  // Merge 1099-DA + DeFi swap + LP exit + NFT sell + liquidation dispositions into Form 8949 / Schedule D
  const mapDispositionsToSyntheticTx = (disps: typeof defiSwapResult extends undefined ? never : NonNullable<typeof defiSwapResult>["dispositions"]) =>
    disps.map((disp) => ({
      description: disp.description,
      dateAcquired: disp.dateAcquired,
      dateSold: disp.dateSold,
      proceeds: disp.proceeds.toString(),
      costBasis: disp.costBasis.toString(),
      adjustments: disp.adjustments.toString(),
      basisReportedToIRS: false,
      holdingPeriod: disp.holdingPeriod,
      washSale: disp.washSale,
      washSaleDisallowed: disp.washSaleDisallowed.toString(),
      digitalAsset: true,
    }));

  const defiSwapTransactions = mapDispositionsToSyntheticTx(defiSwapResult?.dispositions ?? []);
  const lpExitTransactions = mapDispositionsToSyntheticTx(lpResult?.dispositions ?? []);
  const nftSellTransactions = mapDispositionsToSyntheticTx(nftResult?.dispositions ?? []);
  const liquidationTransactions = mapDispositionsToSyntheticTx(liquidationResult?.dispositions ?? []);

  const phase2Dispositions = [
    ...defiSwapTransactions,
    ...lpExitTransactions,
    ...nftSellTransactions,
    ...liquidationTransactions,
  ];

  const hasCryptoTransactions = form1099DAForms.length > 0 || phase2Dispositions.length > 0;
  const inputWithCrypto = hasCryptoTransactions
    ? {
      ...input,
      form1099B: [
        ...input.form1099B,
        ...form1099DAForms.map((form) => ({
          broker: form.brokerName,
          payerTin: form.brokerTin,
          accountHolder: form.accountHolder,
          stateWithheld: form.stateWithheld,
          state: form.state,
          transactions: form.transactions.map((t) => {
            const desc = `${t.digitalAssetName}${t.ticker ? ` (${t.ticker})` : ""}`;
            const matchKey = `${desc} via ${form.brokerName}|${t.dateSold}`;
            const matched = lotMatchedBasis?.get(matchKey);
            return {
              description: desc,
              dateAcquired: matched?.dateAcquired ?? t.dateAcquired,
              dateSold: t.dateSold,
              proceeds: t.proceeds,
              costBasis: matched ? matched.costBasis.toString() : t.costBasis,
              adjustments: t.adjustments,
              basisReportedToIRS: t.basisReportedToIRS,
              holdingPeriod: t.holdingPeriod,
              washSale: t.washSale,
              washSaleDisallowed: t.washSaleDisallowed,
              digitalAsset: true,
            };
          }),
        })),
        // Phase 2 DeFi/NFT/liquidation dispositions as synthetic 1099-B entries
        ...(phase2Dispositions.length > 0 ? [{
          broker: "DeFi/NFT/Crypto",
          stateWithheld: "0",
          transactions: phase2Dispositions,
        }] : []),
      ],
    }
    : input;

  // Line 7: Capital gains/losses via Schedule D (includes Form 8949)
  const schedD = calculateScheduleD(inputWithCrypto, filingStatus, constants, form4797, {
    form8824CapitalGainLoss: form8824?.totalCapitalRecognizedGainOrLoss ?? new Decimal(0),
  });
  audit.merge(schedD.lines);
  // Track wash sale carryforward for crypto dispositions (IRC §1091)
  // Include 1099-DA lot-matched dispositions so broker-reported wash sales
  // also flow through carryforward tracking.
  let washSaleCarryforward: WashSaleCarryforwardResult | undefined;
  const allCryptoDispositions: MatchedDisposition[] = [
    ...lotMatchedDispositions,
    ...(defiSwapResult?.dispositions ?? []),
    ...(lpResult?.dispositions ?? []),
    ...(nftResult?.dispositions ?? []),
    ...(liquidationResult?.dispositions ?? []),
  ];
  if (allCryptoDispositions.some((d) => d.washSale)) {
    washSaleCarryforward = trackWashSaleCarryforward(allCryptoDispositions, allLots);
    audit.merge(washSaleCarryforward.lines);
  }

  // Form 8814 Line 10 capital gain distributions add to Schedule D Line 13 / Line 7
  const form8814CapitalGains = form8814?.totalCapitalGains ?? new Decimal(0);
  const capitalGainLoss = schedD.capitalLossDeduction.plus(form8814CapitalGains);
  audit.record("1040", "7", "Capital gain or loss", capitalGainLoss,
    form8814CapitalGains.greaterThan(0)
      ? `Schedule D Line 21 + Form 8814 Line 10 capital gain distributions $${form8814CapitalGains}`
      : "Schedule D Line 21");

  // Schedule C: Self-employment income (net profit)
  const schedC = calculateScheduleC(input, input.scheduleC);
  // Add crypto business income (mining/staking + NFT creator sales) to Schedule C net profit
  const cryptoBusinessGross = sum(
    cryptoIncomeResult?.businessMiningGrossReceipts ?? new Decimal(0),
    cryptoIncomeResult?.businessStakingGrossReceipts ?? new Decimal(0),
    nftResult?.mintSaleIncome ?? new Decimal(0),
  );
  const cryptoBusinessExpenses = sum(
    cryptoIncomeResult?.businessMiningExpenses ?? new Decimal(0),
    cryptoIncomeResult?.businessStakingExpenses ?? new Decimal(0)
  );
  const cryptoBusinessNet = cryptoBusinessGross.minus(cryptoBusinessExpenses);
  const schedCNetProfit = schedC.netProfit.plus(cryptoBusinessNet);
  audit.merge(schedC.lines);
  if (cryptoBusinessNet.greaterThan(0)) {
    audit.record("Sched C", "crypto", "Crypto business income (mining/staking/NFT minting)",
      cryptoBusinessNet,
      "Digital asset business gross receipts minus expenses → Schedule C (IRS Notice 2014-21 Q&A 9, Rev. Rul. 2023-14)", {
        "Business mining gross receipts": cryptoIncomeResult?.businessMiningGrossReceipts ?? new Decimal(0),
        "Business mining expenses": cryptoIncomeResult?.businessMiningExpenses ?? new Decimal(0),
        "Business staking gross receipts": cryptoIncomeResult?.businessStakingGrossReceipts ?? new Decimal(0),
        "Business staking expenses": cryptoIncomeResult?.businessStakingExpenses ?? new Decimal(0),
        "NFT mint sale income": nftResult?.mintSaleIncome ?? new Decimal(0),
      });
  }
  audit.record("1040", "8-sched-c", "Business income (Schedule C)", schedCNetProfit, "Schedule C Line 31" +
    (cryptoBusinessNet.greaterThan(0) ? ` + crypto business net $${cryptoBusinessNet}` : ""));

  // Schedule F: Farm income (net profit)
  const schedF = calculateScheduleF(input.scheduleF);
  const schedFNetProfit = schedF.netFarmProfit;
  audit.merge(schedF.lines);
  audit.record("1040", "8-sched-f", "Farm income (Schedule F)", schedFNetProfit, "Schedule F Line 34");

  // Schedule E: Supplemental income (rental + partnership)
  const schedE = calculateScheduleE(input);
  audit.merge(schedE.lines);

  // ── IRC §280F(b)(2) recapture: aggregate from Schedule C and Schedule E Form 4562 ──
  const section280FRecapture = sum(
    schedC.form4562?.section280FRecaptureIncome ?? new Decimal(0),
    schedE.section280FRecaptureIncome,
  );
  if (section280FRecapture.greaterThan(0)) {
    audit.record("Form 4797", "Part IV §280F",
      "IRC §280F(b)(2) recapture — listed property business use dropped to ≤50%",
      section280FRecapture,
      "Sum of Form 4562 §280F recapture from Schedule C and Schedule E listed-property assets", {
        "Schedule C Form 4562 recapture": schedC.form4562?.section280FRecaptureIncome ?? new Decimal(0),
        "Schedule E Form 4562 recapture": schedE.section280FRecaptureIncome,
      });
  }

  // ── IRC §163(j) partnership EBIE release tracking ────────────────────────
  // Current slice: only partnership K-1 excess items release prior suspended
  // partnership EBIE. S-corp ETI/EBII are deferred until shareholder-level
  // Form 8990 support exists.
  // Step 1: Aggregate current-year per-partnership amounts from K-1s
  const section163jByEntity = new Map<string, {
    partnershipName: string;
    currentYearEBIE: Decimal;
    excessTaxableIncome: Decimal;
    excessBusinessInterestIncome: Decimal;
  }>();
  for (const k1 of input.scheduleK1) {
    if (k1.entityType === "s_corporation") {
      continue;
    }
    const existing = section163jByEntity.get(k1.partnershipEIN) ?? {
      partnershipName: k1.partnershipName,
      currentYearEBIE: new Decimal(0),
      excessTaxableIncome: new Decimal(0),
      excessBusinessInterestIncome: new Decimal(0),
    };
    existing.currentYearEBIE = existing.currentYearEBIE.plus(d(k1.excessBusinessInterest));
    existing.excessTaxableIncome = existing.excessTaxableIncome.plus(d(k1.excessTaxableIncome));
    existing.excessBusinessInterestIncome = existing.excessBusinessInterestIncome.plus(d(k1.excessBusinessInterestIncome));
    section163jByEntity.set(k1.partnershipEIN, existing);
  }

  // Step 2: Compute per-entity deduction from prior-year suspended EBIE
  const priorSuspendedEBIE = input.priorYear?.suspendedBusinessInterest ?? [];
  let totalSection163jDeduction = new Decimal(0);
  const section163jCarryforward: Array<{ partnershipName: string; partnershipEIN: string; amount: Decimal }> = [];

  // Process entities that have prior-year suspended EBIE
  const processedEINs = new Set<string>();
  for (const prior of priorSuspendedEBIE) {
    const priorAmount = d(prior.amount);
    if (priorAmount.isZero()) continue;
    processedEINs.add(prior.partnershipEIN);
    const current = section163jByEntity.get(prior.partnershipEIN);
    const eti = current?.excessTaxableIncome ?? new Decimal(0);
    const ebii = current?.excessBusinessInterestIncome ?? new Decimal(0);
    const capacity = eti.plus(ebii);
    const deducted = Decimal.min(priorAmount, capacity);
    const remaining = priorAmount.minus(deducted);
    const newEBIE = current?.currentYearEBIE ?? new Decimal(0);
    const totalSuspended = remaining.plus(newEBIE);

    if (deducted.greaterThan(0)) {
      totalSection163jDeduction = totalSection163jDeduction.plus(deducted);
      audit.record("§163(j)", prior.partnershipEIN, `§163(j) EBIE deduction — ${current?.partnershipName ?? prior.partnershipName}`,
        deducted,
        `min(prior suspended $${priorAmount}, ETI $${eti} + EBII $${ebii} = $${capacity}) per IRC §163(j)(4)(B)(ii)`, {
          "Partnership": current?.partnershipName ?? prior.partnershipName,
          "Prior-year suspended EBIE": priorAmount,
          "Current-year ETI (Partnership K-1 Box 20 Code AE)": eti,
          "Current-year EBII (Partnership K-1 Box 20 Code AF)": ebii,
          "Deductible amount": deducted,
          "Remaining suspended EBIE": remaining,
          "New current-year EBIE (Box 13 Code K)": newEBIE,
          "Total suspended carried forward": totalSuspended,
        });
    }

    if (totalSuspended.greaterThan(0)) {
      section163jCarryforward.push({
        partnershipName: current?.partnershipName ?? prior.partnershipName,
        partnershipEIN: prior.partnershipEIN,
        amount: totalSuspended,
      });
    }
  }

  // Step 3: Process entities with new current-year EBIE but no prior suspended balance
  for (const [ein, entity] of section163jByEntity) {
    if (processedEINs.has(ein)) continue;
    if (entity.currentYearEBIE.greaterThan(0)) {
      section163jCarryforward.push({
        partnershipName: entity.partnershipName,
        partnershipEIN: ein,
        amount: entity.currentYearEBIE,
      });
    }
  }

  // Audit trail for aggregate tracking
  const k1ExcessBusinessInterest = k1Agg.excessBusinessInterestPartnership;
  if (!k1ExcessBusinessInterest.isZero()) {
    audit.record("K-1", "13K", "Partnership K-1 Box 13 Code K excess business interest expense (§163(j))",
      k1ExcessBusinessInterest,
      totalSection163jDeduction.greaterThan(0)
        ? `Current-year EBIE added to per-entity suspended balance; $${totalSection163jDeduction} of prior suspended EBIE deducted this year`
        : "Suspended for future deduction when partner receives excess taxable income from the same partnership");
  }
  if (totalSection163jDeduction.greaterThan(0) && k1ExcessBusinessInterest.isZero()) {
    audit.record("§163(j)", "total", "Total §163(j) partnership EBIE deduction",
      totalSection163jDeduction,
      "Prior-year suspended EBIE deducted against current-year ETI/EBII from the same partnership(s)");
  }

  // Adjusted Schedule E total after §163(j) deduction — used for all income computations
  const adjustedScheduleETotal = schedE.totalSupplementalIncome.minus(totalSection163jDeduction);

  // Other income (1099-MISC)
  // Note: royalties (Box 2) flow through Schedule E Part I, not here
  // Crypto ordinary income → Schedule 1 Line 8z (or Schedule C if business)
  // Phase 1: mining/staking/airdrop hobby income
  // Phase 2: yield rewards, lending interest, NFT airdrop income
  const cryptoHobbyIncome = sum(
    cryptoIncomeResult?.hobbyMiningIncome ?? new Decimal(0),
    cryptoIncomeResult?.hobbyStakingIncome ?? new Decimal(0),
    cryptoIncomeResult?.airdropIncome ?? new Decimal(0),
    yieldResult?.totalOrdinaryIncome ?? new Decimal(0),
    lendingResult?.totalInterestIncome ?? new Decimal(0),
    nftResult?.airdropIncome ?? new Decimal(0),
  );
  if (cryptoHobbyIncome.greaterThan(0)) {
    audit.record("Sched 1", "8z-crypto", "Crypto hobby income (mining/staking/airdrop)",
      cryptoHobbyIncome,
      "Digital asset ordinary income → Schedule 1 Line 8z (IRS Notice 2014-21, Rev. Rul. 2019-24, Rev. Rul. 2023-14)");
  }
  const miscOtherIncome = sum(
    miscAgg.otherIncome,
    miscAgg.rents,
    cryptoHobbyIncome
  );

  // Gambling income: sum W-2G reportable winnings + any manual gambling winnings
  // from the Schedule A input. Both W-2G and manual winnings are taxable income
  // per IRC §61(a) and must be reported on Schedule 1 Line 8b.
  const w2gForms = input.formW2G ?? [];
  const w2gWinnings = sum(...w2gForms.map((f) => d(f.reportableWinnings)));
  const manualGamblingWinnings = d(input.scheduleA?.gamblingWinnings);
  const totalGamblingWinnings = w2gWinnings.plus(manualGamblingWinnings);

  // Form 1099-K: aggregate payment card/third-party network transactions
  // 1099-K is a reporting mechanism — income should already appear on the return
  // (Schedule C, Schedule F, etc.). The engine aggregates for withholding and audit trail.
  const form1099KResult = calculateForm1099K(input.form1099K ?? []);
  audit.merge(form1099KResult.lines);

  // Schedule SE for SE tax deduction
  // Pass Schedule C net profit (Line 31) and Schedule F net profit (Line 34)
  // so SE tax is assessed on net, not gross amounts.
  const schedSE = calculateScheduleSE(input, constants, schedCNetProfit, schedFNetProfit);
  audit.merge(schedSE.lines);
  const netSEEarnings = schedSE.netSEEarnings;

  // Educator expenses: computed in Schedule 1 with the split or aggregate path

  // SE health insurance: either computed from the Pub 535 worksheet or capped manual amount
  // Per IRS Schedule 1 Instructions, Line 17: "You can't deduct more than the net
  // profit you earned from the trade or business under which the insurance plan was
  // established (reduced by any deductions you claim on Schedule 1, lines 15 and 16)."
  const seCombinedNetProfit = schedCNetProfit.plus(schedFNetProfit);
  let seHealthInsurance: Decimal;
  let seHealthInsuranceWorksheetResult: SEHealthInsuranceWorksheetResult | undefined;
  if (input.seHealthInsuranceWorksheet) {
    // Compute from detailed Pub 535 worksheet inputs
    seHealthInsuranceWorksheetResult = calculateSEHealthInsuranceWorksheet(
      {
        ...input.seHealthInsuranceWorksheet,
        // Override net profit and SE deductions from computed values if not explicitly set
        netProfit: input.seHealthInsuranceWorksheet.netProfit ?? seCombinedNetProfit.toString(),
        deductibleSETax: input.seHealthInsuranceWorksheet.deductibleSETax ?? schedSE.deductibleHalf.toString(),
        seRetirementContributions: input.seHealthInsuranceWorksheet.seRetirementContributions
          ?? d(input.adjustments?.seRetirementContributions).toString(),
      },
      constants
    );
    seHealthInsurance = seHealthInsuranceWorksheetResult.deductibleAmount;
    audit.merge(seHealthInsuranceWorksheetResult.lines);
  } else {
    const seHealthInsuranceRaw = d(input.adjustments?.selfEmployedHealthInsurance);
    const seHealthInsuranceCap = zeroFloor(seCombinedNetProfit.minus(schedSE.deductibleHalf));
    seHealthInsurance = min(seHealthInsuranceRaw, seHealthInsuranceCap);
  }

  // Early withdrawal penalty: auto-sum from 1099-INT Box 2 + 1099-OID Box 3 + manual adjustments
  const earlyWithdrawalPenalty = sum(
    intAgg.earlyWithdrawalPenalty,
    ...(input.form1099OID ?? []).map((f) => d(f.earlyWithdrawalPenalty)),
    d(input.adjustments?.earlyWithdrawalPenalty)
  );

  // MFS filers cannot deduct alimony paid (pre-2019 divorce decrees)
  const alimonyPaid = d(input.adjustments?.alimonyPaid);

  // ── IRA Deduction Worksheet ────────────────────────────────
  // Per Pub 590-A, MAGI for IRA deduction = AGI computed without the IRA
  // deduction itself. We approximate MAGI from pre-Schedule-1 income
  // components minus non-IRA adjustments. Social Security taxable benefits
  // and a few Schedule-1-only income items are not yet computed at this
  // point but are typically small relative to total income for IRA
  // contributors. The manual adjustments.iraDeduction fallback remains
  // available when the worksheet is not provided.
  let computedIraDeduction: Decimal | undefined;
  let iraDeductionWorksheetResult: TaxReturnResult["iraDeductionWorksheet"];
  if (input.iraDeductionWorksheet) {
    const unemploymentForIraMagi = sum(
      ...(input.form1099G ?? []).map((f) => d(f.unemploymentCompensation))
    );
    const preSchedule1Income = sum(
      totalWages,
      totalInterestBeforeSavingsBondExclusion,
      totalDividends,
      iraTaxable,
      pensionTaxable,
      capitalGainLoss,
      schedCNetProfit,
      adjustedScheduleETotal,
      miscOtherIncome,
      unemploymentForIraMagi,
      totalGamblingWinnings,
      form4797.ordinaryGainOrLoss,
      section280FRecapture,
    );
    const preSchedule1NonIraAdjustments = sum(
      schedSE.deductibleHalf,
      seHealthInsurance,
      earlyWithdrawalPenalty,
      alimonyPaid,
      d(input.adjustments?.hsaDeduction),
      d(input.adjustments?.studentLoanInterest),
      d(input.adjustments?.educatorExpenses),
      d(input.adjustments?.primaryEducatorExpenses),
      d(input.adjustments?.spouseEducatorExpenses),
      d(input.adjustments?.archerMSADeduction),
      d(input.adjustments?.armedForcesMovingExpenses),
      d(input.adjustments?.businessExpenseAdjustments),
      d(input.adjustments?.otherAdjustmentsTotal),
    );
    const iraMagi = preSchedule1Income.minus(preSchedule1NonIraAdjustments);

    const ws = input.iraDeductionWorksheet;
    const primaryAge50OrOlder = ws.primaryAge50OrOlder ?? isAge50OrOlder(input.taxpayer.primary.dateOfBirth, year);
    const primaryResult = calculateIraDeduction({
      filingStatus,
      taxYear: year,
      magi: iraMagi,
      contributions: ws.primaryContributions,
      isActiveParticipant: ws.primaryIsActiveParticipant,
      isSpouseActiveParticipant: ws.spouseIsActiveParticipant ?? false,
      age50OrOlder: primaryAge50OrOlder,
      livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
    });
    audit.merge(primaryResult.lines);

    let spouseResult: ReturnType<typeof calculateIraDeduction> | undefined;
    let spouseDeduction = new Decimal(0);
    if (
      (filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse") &&
      d(ws.spouseContributions).greaterThan(0) &&
      input.taxpayer.spouse
    ) {
      const spouseAge50OrOlder = ws.spouseAge50OrOlder ?? isAge50OrOlder(input.taxpayer.spouse.dateOfBirth, year);
      spouseResult = calculateIraDeduction({
        filingStatus,
        taxYear: year,
        magi: iraMagi,
        contributions: ws.spouseContributions,
        isActiveParticipant: ws.spouseIsActiveParticipant ?? false,
        isSpouseActiveParticipant: ws.primaryIsActiveParticipant,
        age50OrOlder: spouseAge50OrOlder,
        livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
      });
      spouseDeduction = spouseResult.deductibleAmount;
      audit.merge(spouseResult.lines);
    }

    computedIraDeduction = primaryResult.deductibleAmount.plus(spouseDeduction);
    iraDeductionWorksheetResult = {
      magi: iraMagi,
      primary: primaryResult,
      spouse: spouseResult,
      totalDeduction: computedIraDeduction,
    };
  }

  // ── Form 1098-E aggregation (student loan interest) ──
  let form1098EResult: Form1098EResult | undefined;
  let combinedStudentLoanInterest: string | undefined;
  if ((input.form1098E ?? []).length > 0) {
    form1098EResult = calculateForm1098E(
      input.form1098E ?? [],
      input.adjustments?.studentLoanInterest
    );
    audit.merge(form1098EResult.lines);
    combinedStudentLoanInterest = form1098EResult.totalStudentLoanInterest.toString();
  }

  // Build the input for Schedule 1, overriding iraDeduction if the worksheet computed one
  // and studentLoanInterest if Form 1098-E aggregation produced a combined total
  const adjustmentOverrides: Record<string, string> = {};
  if (computedIraDeduction !== undefined) {
    adjustmentOverrides.iraDeduction = computedIraDeduction.toString();
  }
  if (combinedStudentLoanInterest !== undefined) {
    adjustmentOverrides.studentLoanInterest = combinedStudentLoanInterest;
  }
  const sched1Input = Object.keys(adjustmentOverrides).length > 0
    ? {
      ...input,
      adjustments: {
        ...(input.adjustments ?? {}),
        ...adjustmentOverrides,
      } as NonNullable<typeof input.adjustments>,
    }
    : input;

  // ── Taxable Refund Worksheet (Schedule 1 Line 1) ──
  let taxableRefundWorksheetResult: TaxableRefundWorksheetResult | undefined;
  let taxableStateRefund: Decimal | undefined;
  if (input.taxableRefundWorksheet) {
    taxableRefundWorksheetResult = calculateTaxableRefundWorksheet(
      input.form1099G ?? [],
      input.taxableRefundWorksheet,
      input.taxpayer.taxYear,
    );
    audit.merge(taxableRefundWorksheetResult.lines);
    taxableStateRefund = taxableRefundWorksheetResult.taxableRefund;
  }

  // Schedule 1 — formal line-by-line for audit trail
  const sched1 = calculateSchedule1(sched1Input, {
    schedCNetProfit: schedCNetProfit,
    schedFNetProfit: schedFNetProfit,
    schedETotal: adjustedScheduleETotal,
    capitalGainLoss: capitalGainLoss,
    seDeductibleHalf: schedSE.deductibleHalf,
    earlyWithdrawalPenalty,
    alimonyPaid,
    gamblingIncome: totalGamblingWinnings,
    form2555HousingDeduction,
    seHealthInsurance: seHealthInsuranceWorksheetResult?.deductibleAmount,
    taxableStateRefund,
  }, form4797);
  audit.merge(sched1.lines);
  // Form 8814 Line 12 other income flows to Schedule 1 Line 8z
  const form8814OtherIncome = form8814?.totalOtherIncome ?? new Decimal(0);
  if (form8814OtherIncome.greaterThan(0)) {
    audit.record("Sched 1", "8z", "Form 8814 other income", form8814OtherIncome,
      "Form 8814 Line 12 — interest/dividend income at ordinary rates from child(ren)'s election");
  }

  // ── Form 461: Excess Business Loss Limitation (IRC §461(l)) ──
  // Computed after Schedule 1 so SE deductions are known. The excess
  // is added back to other income on Schedule 1 Line 8p.
  const form461 = calculateForm461(
    {
      totalWages,
      scheduleCNetProfit: schedCNetProfit,
      scheduleFNetProfit: schedFNetProfit,
      form4797OrdinaryGainOrLoss: form4797.ordinaryGainOrLoss.plus(section280FRecapture),
      nonpassiveK1Income: schedE.totalNonpassiveIncome,
      nonpassiveK1Loss: schedE.totalNonpassiveLoss,
      otherBusinessIncome: miscOtherIncome,
      deductibleSETax: schedSE.deductibleHalf,
      seHealthInsurance: sched1.seHealthInsurance,
      seRetirementContributions: sched1.seRetirementContributions,
      priorYearEBLNol: d(input.priorYear?.excessBusinessLossNOL),
    },
    filingStatus,
    constants
  );
  audit.merge(form461.lines);
  const excessBusinessLossAddback = form461.line16ExcessBusinessLoss;
  if (excessBusinessLossAddback.greaterThan(0)) {
    audit.record("Sched 1", "8p", "Excess business loss (Form 461)", excessBusinessLossAddback,
      "IRC §461(l) disallowed excess added back as income");
  }

  // ── Form 1099-Q: Qualified Education Program Distributions ──
  const form1099QForms = input.form1099Q ?? [];
  const form1099Q = form1099QForms.length > 0
    ? calculateForm1099Q(form1099QForms, input.qualifiedEducationExpenses)
    : undefined;
  if (form1099Q) {
    audit.merge(form1099Q.lines);
  }
  const form1099QTaxableEarnings = form1099Q?.taxableEarnings ?? new Decimal(0);
  if (form1099QTaxableEarnings.greaterThan(0)) {
    audit.record("Sched 1", "8q", "Taxable distributions from QTP/Coverdell ESA",
      form1099QTaxableEarnings,
      "Form 1099-Q taxable earnings from distributions exceeding adjusted qualified education expenses");
  }

  // ── K-1 Form 1041: Estate/Trust Beneficiary Income ─────
  // Aggregate income items from trust/estate K-1s that route through
  // Schedule 1 or directly to Form 1040 lines not covered by Schedule B/D.
  const k1Form1041s = input.scheduleK1Form1041 ?? [];
  const k1Form1041OtherPortfolio = sum(
    ...k1Form1041s.map((k) => d(k.otherPortfolioIncome))
  );
  if (k1Form1041OtherPortfolio.greaterThan(0)) {
    audit.record("Sched 1", "8z", "K-1 1041 other portfolio income", k1Form1041OtherPortfolio,
      "K-1 (Form 1041) Box 5 — other portfolio and nonbusiness income from estates/trusts");
  }
  // Box 11 Code A: §67(e) excess deductions on termination (above-the-line adjustment)
  const k1Form1041Section67eDeductions = sum(
    ...k1Form1041s.filter((k) => k.isFinalK1).map((k) => d(k.finalYearSection67eDeductions))
  );
  if (k1Form1041Section67eDeductions.greaterThan(0)) {
    audit.record("Sched 1", "24z", "K-1 1041 §67(e) excess deductions on termination",
      k1Form1041Section67eDeductions.negated(),
      "K-1 (Form 1041) Box 11 Code A — §67(e) above-the-line deduction per IRC §642(h) / TD 9918");
  }
  // Box 11 Code E: NOL carryover from terminating estate/trust
  const k1Form1041FinalNOL = sum(
    ...k1Form1041s.filter((k) => k.isFinalK1).map((k) => d(k.finalYearNOLCarryover))
  );
  // Box 10: Estate tax deduction (IRC §691(c)) — flows to Schedule A
  const k1Form1041EstateTaxDeduction = sum(
    ...k1Form1041s.map((k) => d(k.estateTaxDeduction))
  );
  // Box 11 Code B: Non-miscellaneous itemized deductions from termination — flows to Schedule A
  const k1Form1041FinalNonMiscItemized = sum(
    ...k1Form1041s.filter((k) => k.isFinalK1).map((k) => d(k.finalYearNonMiscItemized))
  );
  // Box 12: AMT adjustment — flows to Form 6251
  const k1Form1041AmtAdjustment = sum(
    ...k1Form1041s.map((k) => d(k.amtAdjustment))
  );
  // Box 14 Code B: Foreign taxes paid — flows to Form 1116
  const k1Form1041ForeignTaxesPaid = sum(
    ...k1Form1041s.map((k) => d(k.foreignTaxesPaid))
  );
  // Summary for sub-result
  const k1Form1041Summary = k1Form1041s.length > 0 ? {
    numberOfK1s: k1Form1041s.length,
    totalInterest: sum(...k1Form1041s.map((k) => d(k.interestIncome))),
    totalOrdinaryDividends: sum(...k1Form1041s.map((k) => d(k.ordinaryDividends))),
    totalQualifiedDividends: sum(...k1Form1041s.map((k) => d(k.qualifiedDividends))),
    totalShortTermCapitalGain: sum(...k1Form1041s.map((k) => d(k.netShortTermCapitalGain))),
    totalLongTermCapitalGain: sum(...k1Form1041s.map((k) => d(k.netLongTermCapitalGain))),
    totalOtherPortfolioIncome: k1Form1041OtherPortfolio,
    totalEstateTaxDeduction: k1Form1041EstateTaxDeduction,
    totalSection67eDeductions: k1Form1041Section67eDeductions,
    totalTaxExemptInterest: sum(...k1Form1041s.map((k) => d(k.taxExemptInterest))),
    totalForeignTaxesPaid: k1Form1041ForeignTaxesPaid,
    totalQBI: sum(...k1Form1041s.map((k) => d(k.section199AQBI))),
    totalQualifiedReitDividends: sum(...k1Form1041s.map((k) => d(k.section199AQualifiedReitDividends))),
    totalQualifiedPTPIncome: sum(...k1Form1041s.map((k) => d(k.section199AQualifiedPTPIncome))),
  } : undefined;

  const otherIncome = sum(
    miscOtherIncome,
    sched1.taxableRefunds,
    sched1.otherGainsOrLosses,
    sched1.unemploymentCompensation,
    sched1.alimonyReceived,
    sched1.gamblingIncome,
    sched1.cancelledDebtIncome,
    sched1.hsaTaxableDistributions,
    form1099SA.hsaReturnedExcessContributionEarnings,
    form1099SA.hsaPostDeathEarnings,
    d(input.form5329?.supportedHsaReturnedExcessContributionEarningsUnder9100Relief),
    form8814OtherIncome,
    excessBusinessLossAddback,
    form1099QTaxableEarnings,
    section280FRecapture,
    k1Form1041OtherPortfolio
  );
  audit.record("1040", "8", "Other income", otherIncome,
    excessBusinessLossAddback.greaterThan(0)
      ? "Schedule 1 income + Form 461 excess business loss add-back + miscellaneous"
      : form1099QTaxableEarnings.greaterThan(0)
        ? "Schedule 1 income + Form 1099-Q taxable education program distribution earnings + miscellaneous"
        : form8814OtherIncome.greaterThan(0)
          ? "Schedule 1 taxable refund/Form 4797 ordinary/unemployment/alimony/gambling/HSA distribution amounts, Form 1099-SA excess-contribution and post-death earnings, Form 8814 Line 12 child election income, plus miscellaneous other income"
          : "Schedule 1 taxable refund/Form 4797 ordinary/unemployment/alimony/gambling/HSA distribution amounts, Form 1099-SA excess-contribution and post-death earnings, plus miscellaneous other income");

  const socialSecurityBenefitsGross = sum(
    ...(input.formSSA1099 ?? []).map((form) => d(form.netBenefits)),
    ...(input.formRRB1099 ?? []).map((form) => d(form.netSocialSecurityEquivalentBenefitPortion))
  );
  const socialSecurityBenefitsWorksheet = socialSecurityBenefitsGross.greaterThan(0)
    ? calculateSocialSecurityBenefitsWorksheet({
      filingStatus,
      benefitsReceived: socialSecurityBenefitsGross,
      otherIncome: sum(
        totalWages,
        totalInterestBeforeSavingsBondExclusion,
        totalDividends,
        iraTaxable,
        pensionTaxable,
        capitalGainLoss,
        schedCNetProfit,
        adjustedScheduleETotal,
        otherIncome
      ),
      taxExemptInterest,
      livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
      adjustments: {
        businessExpenseAdjustments: sched1.businessExpenseAdjustments,
        hsaDeduction: sched1.hsaDeduction,
        armedForcesMovingExpenses: sched1.armedForcesMovingExpenses,
        seDeduction: sched1.seDeduction,
        seRetirementContributions: sched1.seRetirementContributions,
        seHealthInsurance: sched1.seHealthInsurance,
        earlyWithdrawalPenalty: sched1.earlyWithdrawalPenalty,
        alimonyPaid: sched1.alimonyPaid,
        iraDeduction: sched1.iraDeduction,
        archerMSADeduction: sched1.archerMSADeduction,
        educatorExpenses: sched1.educatorExpenses,
        otherAdjustmentsTotal: sched1.otherAdjustmentsTotal,
        studentLoanInterest: sched1.studentLoanInterest,
      },
      lumpSumElection: input.socialSecurityLumpSumElection === undefined
        ? undefined
        : {
          currentYearExclusionsAdjustments: d(input.socialSecurityLumpSumElection.currentYearExclusionsAdjustments),
          earlierYears: input.socialSecurityLumpSumElection.earlierYears.map((earlierYear) => ({
            taxYear: earlierYear.taxYear,
            filingStatus: earlierYear.filingStatus,
            livedWithSpouseAtAnyTimeDuringYear: earlierYear.livedWithSpouseAtAnyTimeDuringYear,
            benefitsReceivedInEarlierYear: d(earlierYear.benefitsReceivedInEarlierYear),
            delayedBenefitsReceivedInCurrentYear: d(earlierYear.delayedBenefitsReceivedInCurrentYear),
            adjustedGrossIncome: d(earlierYear.adjustedGrossIncome),
            taxExemptInterest: d(earlierYear.taxExemptInterest),
            exclusionsAdjustments: d(earlierYear.exclusionsAdjustments),
            taxableBenefitsPreviouslyReported: d(earlierYear.taxableBenefitsPreviouslyReported),
          })),
        },
    })
    : undefined;
  if (socialSecurityBenefitsWorksheet) {
    audit.merge(socialSecurityBenefitsWorksheet.lines);
  }
  const socialSecurityBenefitsTaxable = socialSecurityBenefitsWorksheet?.taxableBenefits ?? new Decimal(0);
  audit.record("1040", "6a", "Social Security benefits", socialSecurityBenefitsGross,
    "Sum SSA-1099 Box 5 benefits and RRB-1099 tier 1 equivalent Box 5 benefits");
  audit.record("1040", "6b", "Taxable Social Security benefits", socialSecurityBenefitsTaxable,
    socialSecurityBenefitsWorksheet
      ? totalInterestBeforeSavingsBondExclusion.eq(preliminaryScheduleB.taxableInterest)
        ? "Social Security Benefits Worksheet Line 18"
        : "Social Security Benefits Worksheet Line 18 using pre-exclusion Schedule B Line 2 interest because Form 8815 reduced Form 1040 Line 2b"
      : "No Social Security benefits reported");

  const preliminaryTotalIncome = sum(
    totalWages,
    totalInterestBeforeSavingsBondExclusion,
    totalDividends,
    iraTaxable,
    pensionTaxable,
    socialSecurityBenefitsTaxable,
    capitalGainLoss,
    schedCNetProfit,
    adjustedScheduleETotal,
    otherIncome
  );

  // ═══════════════════════════════════════════════════════════
  // Phase 2: Adjustments to Income (Form 1040 Line 10)
  // ═══════════════════════════════════════════════════════════

  // K-1 Form 1041 Box 11 Code A (§67(e) excess deductions) is above-the-line
  const adjustments = sched1.totalAdjustments.plus(k1Form1041Section67eDeductions);
  audit.record("1040", "10", "Adjustments to income", adjustments,
    k1Form1041Section67eDeductions.greaterThan(0)
      ? "SE deduction + other adjustments + K-1 1041 §67(e) excess deductions"
      : "SE deduction + other adjustments");

  // Form 8815 uses AGI before applying the savings bond exclusion on Schedule B Line 3.
  const preliminaryAgi = preliminaryTotalIncome.minus(adjustments);

  // ── Form 8815: Savings Bond Interest Exclusion ──────────
  // Per IRS Form 8815 Instructions, Line 7: modified AGI = AGI + student loan
  // interest deduction + foreign earned income exclusion + other add-backs.
  // preliminaryAgi already has SLI subtracted, so we add it back for the MAGI.
  let form8815: Form8815Result | undefined;
  let savingsBondExclusion = new Decimal(0);
  if (input.savingsBondRedemptions && input.savingsBondRedemptions.length > 0) {
    const form8815MAGI = preliminaryAgi.plus(sched1.studentLoanInterest);
    form8815 = calculateForm8815(input.savingsBondRedemptions, form8815MAGI, filingStatus);
    savingsBondExclusion = form8815.excludableSavingsBondInterest;
    audit.merge(form8815.lines);
  }
  const schedB = calculateScheduleB(input, savingsBondExclusion);
  audit.merge(schedB.lines);
  const totalTaxableInterest = schedB.taxableInterest;
  audit.record("1040", "2b", "Taxable interest", totalTaxableInterest, "Schedule B Line 4");
  audit.record("1040", "3b", "Ordinary dividends", totalDividends, "Schedule B Part II total");

  // Line 9: Total income
  let totalIncome = sum(
    totalWages,
    totalTaxableInterest,
    totalDividends,
    iraTaxable,
    pensionTaxable,
    socialSecurityBenefitsTaxable,
    capitalGainLoss,
    schedCNetProfit,
    schedFNetProfit,
    adjustedScheduleETotal,
    otherIncome
  );
  audit.record("1040", "9", "Total income", totalIncome,
    totalSection163jDeduction.greaterThan(0)
      ? `Sum of Lines 1-8 (Schedule E reduced by $${totalSection163jDeduction} §163(j) partner-level EBIE deduction)`
      : "Sum of Lines 1-8");

  let agi = totalIncome.minus(adjustments);
  audit.record("1040", "11", "Adjusted gross income", agi,
    "Line 9 - Line 10");

  // ── Form 8582: Passive Activity Loss Limitations ────────
  // Build passive activities from K-1s marked as passive
  const passiveActivities: PassiveActivity[] = schedE.partnerships
    .filter((partnership) => partnership.isPassive)
    .map((partnership) => ({
      name: partnership.name,
      income: partnership.passiveIncome,
      loss: partnership.passiveLoss,
      isRentalRealEstate: partnership.isRentalRealEstate,
      isActiveParticipant: partnership.isRentalRealEstate, // simplified assumption
      isPubliclyTradedPartnership: partnership.isPubliclyTradedPartnership,
      ptpFullyDisposedInTaxableTransaction: partnership.ptpFullyDisposedInTaxableTransaction,
      ptpDispositionGainOrLoss: partnership.ptpDispositionGainOrLoss,
    }));

  // Add rental properties from Schedule E Part I as passive activities
  for (const rental of schedE.rentalProperties) {
    const net = rental.netRentalIncome;
    passiveActivities.push({
      name: rental.description,
      income: net.isPositive() ? net : new Decimal(0),
      loss: net.isNegative() ? net : new Decimal(0),
      isRentalRealEstate: true,
      isActiveParticipant: rental.isActiveParticipant,
    });
  }

  // Per IRS Form 8582 Instructions, the $25K rental allowance phase-out uses
  // "modified adjusted gross income" (MAGI), NOT regular AGI. MAGI is AGI:
  //   - Without regard to passive activity losses (add back net passive loss IN AGI)
  //   - Plus IRA deduction (add back)
  //   - Plus student loan interest deduction (add back)
  //   - Plus savings bond exclusion from Form 8815 (add back)
  //
  // Note: Schedule E Part II (K-1) net passive losses are already EXCLUDED from
  // totalPartnershipIncome (and hence from AGI) by schedule-e.ts. Only Part I
  // rental losses flow through totalRentalIncome into AGI and need to be added back.
  const partIRentalLossInAGI = schedE.rentalProperties.reduce(
    (acc, p) => acc.plus(p.netRentalIncome.isNegative() ? p.netRentalIncome : new Decimal(0)),
    new Decimal(0)
  );
  const rentalLossAddBack = partIRentalLossInAGI.isNegative()
    ? partIRentalLossInAGI.negated()
    : new Decimal(0);
  const form8582MAGI = agi
    .plus(rentalLossAddBack)
    .plus(d(input.adjustments?.iraDeduction))
    .plus(sched1.studentLoanInterest)
    .plus(savingsBondExclusion);

  const form8582 = calculateForm8582({
    activities: passiveActivities,
    agi: form8582MAGI,
    filingStatus,
    mfsLivedApartFromSpouseAllYear:
      filingStatus === "married_filing_separately"
        && input.taxpayer.livedWithSpouseAtAnyTimeDuringYear === false,
    priorYearSuspendedLosses: input.priorYear?.suspendedPassiveLosses?.map((s) => ({
      name: s.partnershipName,
      amount: d(s.amount),
    })),
    priorYearPTPSuspendedLosses: input.priorYear?.suspendedPTPLosses?.map((s) => ({
      name: s.partnershipName,
      amount: d(s.amount),
    })),
  });
  audit.merge(form8582.lines);

  // ── AGI correction: remove Part I rental suspended losses ──
  // Per IRS Form 1040 flow, Schedule E reports only the ALLOWED rental income/loss
  // (after Form 8582 limitation). Part I rental losses that are suspended by Form 8582
  // should NOT be in AGI. K-1 passive losses are already excluded by Schedule E's own
  // computation (totalPartnershipIncome excludes net passive loss).
  const k1PassiveCount = k1Agg.passiveCount;
  const partIRentalCount = schedE.rentalProperties.length;
  let partIRentalSuspended = new Decimal(0);
  for (let i = k1PassiveCount; i < k1PassiveCount + partIRentalCount; i++) {
    if (i < form8582.activityAllocations.length) {
      partIRentalSuspended = partIRentalSuspended.plus(form8582.activityAllocations[i].suspendedLoss);
    }
  }
  if (partIRentalSuspended.greaterThan(0)) {
    agi = agi.plus(partIRentalSuspended);
    audit.record("1040", "11-adj", "AGI corrected for Form 8582 suspended rental losses",
      agi, `Added back $${partIRentalSuspended} suspended Part I rental losses`);
  }

  // ── PTP disposition: released losses reduce AGI (IRC §469(g)(1)) ──
  // When a PTP is fully disposed of in a taxable transaction, accumulated
  // suspended losses become nonpassive and reduce AGI directly.
  const ptpReleasedTotal = form8582.ptpDispositionReleasedLosses.reduce(
    (acc, p) => acc.plus(p.totalReleased), new Decimal(0)
  );
  if (ptpReleasedTotal.greaterThan(0)) {
    agi = agi.minus(ptpReleasedTotal);
    totalIncome = totalIncome.minus(ptpReleasedTotal);
    audit.record("1040", "8-ptp-disposition", "PTP disposition released losses (nonpassive)",
      ptpReleasedTotal.negated(),
      `IRC §469(g)(1) — ${form8582.ptpDispositionReleasedLosses.length} PTP(s) fully disposed; $${ptpReleasedTotal} suspended losses released as nonpassive`,
      Object.fromEntries(form8582.ptpDispositionReleasedLosses.map((p) => [p.name, p.totalReleased.negated()]))
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: Deductions (Form 1040 Lines 12-15)
  // ═══════════════════════════════════════════════════════════

  const standardDeductionWorksheet = calculateStandardDeduction({
    taxpayer: input.taxpayer, facts: input.standardDeductionFacts, constants,
  });
  audit.merge(standardDeductionWorksheet.lines);
  const standardDeduction = standardDeductionWorksheet.standardDeduction;
  const deductionElection = input.deductionElection ?? "automatic";
  if (deductionElection === "standard" && !standardDeductionWorksheet.eligibleForStandardDeduction) {
    throw new Error("Standard deduction election is ineligible for the actual taxpayer facts");
  }

  // Form 4952: Investment interest expense deduction
  // Aggregate K-1 Box 13 Code D (investment interest expense),
  // Box 20 Code A (investment income), partnership-only Box 20 Code AF
  // (excess business interest income that also counts as Form 4952 investment
  // income in this supported slice), and Box 20 Code B (investment expenses)
  const k1InvestmentInterestExpense = k1Agg.investmentInterestExpense;
  const k1InvestmentIncome = k1Agg.investmentIncome;
  const k1PartnershipExcessBusinessInterestIncomeForForm4952 = k1Agg.excessBusinessInterestIncomePartnership;
  const k1InvestmentExpenses = k1Agg.investmentExpenses;
  const hasK1InvestmentAmounts = !k1InvestmentInterestExpense.isZero()
    || !k1InvestmentIncome.isZero()
    || !k1PartnershipExcessBusinessInterestIncomeForForm4952.isZero()
    || !k1InvestmentExpenses.isZero();

  // Compute Form 4952 when explicit input is provided OR K-1 investment amounts exist
  const form4952Input = input.form4952;
  const needsForm4952 = form4952Input !== undefined || hasK1InvestmentAmounts;
  const form4952 = needsForm4952
      ? calculateForm4952({
        investmentInterestExpense: d(form4952Input?.investmentInterestExpense).plus(k1InvestmentInterestExpense).toString(),
        priorYearDisallowed: d(form4952Input?.priorYearDisallowed).toString(),
        grossInvestmentIncome: d(form4952Input?.grossInvestmentIncome)
          .plus(k1InvestmentIncome)
          .plus(k1PartnershipExcessBusinessInterestIncomeForForm4952)
          .toString(),
        qualifiedDividendsIncluded: d(form4952Input?.qualifiedDividendsIncluded).toString(),
        netGainFromInvestmentProperty: d(form4952Input?.netGainFromInvestmentProperty).toString(),
        electedPreferentialIncome: d(form4952Input?.electedPreferentialIncome).toString(),
        investmentExpenses: d(form4952Input?.investmentExpenses).plus(k1InvestmentExpenses).toString(),
      })
    : undefined;
  if (form4952) {
    audit.merge(form4952.lines);
  }
  if (hasK1InvestmentAmounts) {
    audit.record("K-1", "inv", "K-1 investment amounts aggregated for Form 4952",
      k1InvestmentInterestExpense
        .plus(k1InvestmentIncome)
        .plus(k1PartnershipExcessBusinessInterestIncomeForForm4952)
        .plus(k1InvestmentExpenses),
      "Box 13 Code D (interest expense) + Box 20 Code A (income) + partnership Box 20 Code AF (EBII investment income) + Box 20 Code B (expenses)", {
        "Box 13 Code D (investment interest expense → Line 1)": k1InvestmentInterestExpense,
        "Box 20 Code A (investment income → Line 4a)": k1InvestmentIncome,
        "Partnership Box 20 Code AF (EBII → Line 4a)": k1PartnershipExcessBusinessInterestIncomeForForm4952,
        "Box 20 Code B (investment expenses → Line 4f)": k1InvestmentExpenses,
      });
  }

  // Form 4684: Casualty and theft losses (if provided)
  const form4684 = input.form4684 ? calculateForm4684(input.form4684, agi) : undefined;
  if (form4684) {
    audit.merge(form4684.lines);
  }

  // Aggregate K-1 Box 13 charitable contributions (Codes A, B, C) for Schedule A
  const k1CashCharitable = k1Agg.charitableCash;
  const k1AppreciatedProperty30 = k1Agg.charitableCapitalGain30;
  const k1AppreciatedProperty20 = k1Agg.charitableCapitalGain20;
  const hasK1Charitable = !k1CashCharitable.isZero()
    || !k1AppreciatedProperty30.isZero()
    || !k1AppreciatedProperty20.isZero();
  if (hasK1Charitable) {
    audit.record("K-1", "13", "K-1 Box 13 charitable contributions routed to Schedule A",
      k1CashCharitable.plus(k1AppreciatedProperty30).plus(k1AppreciatedProperty20),
      "Code A (cash 60%) + Code B (CG property 30%) + Code C (CG property 20%)", {
        "Code A (cash, 60% AGI limit)": k1CashCharitable,
        "Code B (capital gain property, 30% AGI limit)": k1AppreciatedProperty30,
        "Code C (capital gain property, 20% AGI limit)": k1AppreciatedProperty20,
      });
  }

  // ── Sales Tax Deduction Worksheet (Schedule A Line 5a alternative) ──
  let salesTaxResult: SalesTaxDeductionResult | undefined;
  let salesTaxDeductionAmount: Decimal | undefined;
  let salesTaxElectedForLine5a = false;
  if (input.salesTaxDeduction) {
    // Number of exemptions: 1 (primary) + 1 (spouse if MFJ/QSS) + dependents
    const spouseExemption = (filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse") ? 1 : 0;
    const dependentCount = input.taxpayer.dependents?.length ?? 0;
    const exemptions = 1 + spouseExemption + dependentCount;

    salesTaxResult = calculateSalesTaxDeduction(input.salesTaxDeduction, agi, exemptions);
    audit.merge(salesTaxResult.lines);
    salesTaxDeductionAmount = salesTaxResult.totalSalesTaxDeduction;

    // Determine whether to use sales tax or income tax
    if (input.salesTaxDeduction.autoCompare) {
      // Auto-compare: compute income taxes and use whichever is larger
      const incomeTaxes = w2Agg.statePlusLocal.plus(d(input.scheduleA?.additionalStateLocalIncomeTaxes))
        .plus(calculateStateTaxPaymentsInYear(input));
      salesTaxElectedForLine5a = salesTaxDeductionAmount.greaterThan(incomeTaxes);
      audit.record("Sales Tax WS", "cmp", "Income tax vs sales tax comparison",
        salesTaxElectedForLine5a ? salesTaxDeductionAmount : incomeTaxes,
        salesTaxElectedForLine5a
          ? `Sales tax $${salesTaxDeductionAmount} > income tax $${incomeTaxes} → elected sales tax`
          : `Income tax $${incomeTaxes} >= sales tax $${salesTaxDeductionAmount} → using income tax`);
    } else {
      // Unconditional election
      salesTaxElectedForLine5a = true;
    }
  }

  // Schedule A for itemized deductions
  const form4952DeductibleAmount = form4952?.deductibleAmount;
  const form4684DeductibleLoss = form4684?.deductibleLoss;
  const hasScheduleAExtra = input.scheduleA !== undefined
    || input.form2555 !== undefined
    || form4952DeductibleAmount !== undefined
    || form4684DeductibleLoss !== undefined
    || hasK1Charitable
    || salesTaxElectedForLine5a;
  const schedA = calculateScheduleA(
    input,
    agi,
    filingStatus,
    constants,
    !hasScheduleAExtra
      ? undefined
      : {
        medicalExpenses: d(input.scheduleA?.medicalExpenses),
        personalPropertyTaxes: d(input.scheduleA?.personalPropertyTaxes),
        saltMagiAdditions: form2555IncomeReduction.plus(form2555HousingDeduction),
        investmentInterestExpense: form4952DeductibleAmount ?? d(input.scheduleA?.investmentInterestExpense),
        casualtyLossDeduction: form4684DeductibleLoss,
        gamblingWinnings: totalGamblingWinnings,
        gamblingLosses: d(input.scheduleA?.gamblingLosses),
        gamblingExpenses: d(input.scheduleA?.gamblingExpenses),
        k1CashCharitable: hasK1Charitable ? k1CashCharitable : undefined,
        k1AppreciatedProperty30: hasK1Charitable ? k1AppreciatedProperty30 : undefined,
        k1AppreciatedProperty20: hasK1Charitable ? k1AppreciatedProperty20 : undefined,
        salesTaxDeduction: salesTaxElectedForLine5a ? salesTaxDeductionAmount : undefined,
        salesTaxElected: salesTaxElectedForLine5a,
      }
  );
  audit.merge(schedA.lines);
  // Add K-1 Form 1041 deductions to Schedule A
  let itemizedDeductions = schedA.totalItemized;
  // Box 10: Estate tax deduction (IRC §691(c)) — not subject to 2% floor
  if (k1Form1041EstateTaxDeduction.greaterThan(0)) {
    itemizedDeductions = itemizedDeductions.plus(k1Form1041EstateTaxDeduction);
    audit.record("Sched A", "16", "Estate tax deduction (IRC §691(c))", k1Form1041EstateTaxDeduction,
      "K-1 (Form 1041) Box 10 — IRC §691(c) deduction for estate tax on income in respect of decedent");
  }
  // Box 11 Code B: Non-miscellaneous itemized deductions from terminating trust/estate
  if (k1Form1041FinalNonMiscItemized.greaterThan(0)) {
    itemizedDeductions = itemizedDeductions.plus(k1Form1041FinalNonMiscItemized);
    audit.record("Sched A", "16b", "Final year non-misc itemized deductions (K-1 1041)", k1Form1041FinalNonMiscItemized,
      "K-1 (Form 1041) Box 11 Code B — non-miscellaneous itemized deductions on termination per IRC §642(h)");
  }
  // Add crypto charitable donations to itemized deductions (Schedule A)
  const cryptoDonationDeduction = donationResult?.totalDeduction ?? new Decimal(0);
  if (cryptoDonationDeduction.greaterThan(0)) {
    itemizedDeductions = itemizedDeductions.plus(cryptoDonationDeduction);
    audit.record("Sched A", "12-crypto", "Crypto charitable contributions (IRC §170)",
      cryptoDonationDeduction,
      `${donationResult!.longTermDonations.length} long-term (FMV) + ${donationResult!.shortTermDonations.length} short-term (basis) crypto donations`);
  }
  const hasK1Form1041ItemizedAdditions = k1Form1041EstateTaxDeduction.greaterThan(0) || k1Form1041FinalNonMiscItemized.greaterThan(0);
  const hasCryptoDonations = cryptoDonationDeduction.greaterThan(0);
  audit.record("Sched A", "17", "Total itemized deductions", itemizedDeductions,
    hasK1Form1041ItemizedAdditions || hasCryptoDonations
      ? "Medical + SALT + mortgage + charitable + crypto donations + K-1 1041 estate/trust deductions"
      : "Medical + SALT + mortgage + charitable");
  // Collect all Form 8889 results for auto-deriving Form 5329 Part VII HSA excess contributions
  const allForm8889Results: Form8889Result[] = [
    ...(sched1.form8889 ? [sched1.form8889] : []),
    ...(sched1.form8889ByOwner
      ? Object.values(sched1.form8889ByOwner).filter(
          (r): r is Form8889Result => r !== undefined
        )
      : []),
  ];
  const normalizedForm5329 = buildForm5329Input(
    input.form5329,
    input.taxpayer,
    input.form1099R ?? [],
    form8606,
    schedA.medicalDeduction,
    allForm8889Results
  );

  let deductionUsed: "itemized" | "standard" = deductionElection === "itemized"
    || !standardDeductionWorksheet.eligibleForStandardDeduction
    || (deductionElection === "automatic" && itemizedDeductions.greaterThan(standardDeduction.plus(schedA.nonitemizerCharitableDeduction)))
    ? "itemized" : "standard";
  let deductionAmount = deductionUsed === "itemized" ? itemizedDeductions : standardDeduction;

  if (input.schedule1A?.businessTips.length) {
    throw new Error("Schedule 1-A business tips require unsupported business-level QBI coordination");
  }
  const schedule1A = input.schedule1A ? calculateSchedule1A({
    taxpayer: input.taxpayer,
    agi,
    foreignExcludedIncome: form2555IncomeReduction.plus(form2555HousingDeduction),
    facts: input.schedule1A,
  }) : undefined;
  let nonitemizerCharitableDeduction = deductionUsed === "standard" ? schedA.nonitemizerCharitableDeduction : d("0");
  let additionalDeductions = (schedule1A?.totalDeduction ?? d("0")).plus(nonitemizerCharitableDeduction);
  if (schedule1A) audit.merge(schedule1A.lines);
  audit.record("1040", "13b", "Additional deductions from Schedule 1-A", schedule1A?.totalDeduction ?? d("0"),
    "Schedule 1-A line 38; no change to AGI or payroll taxes");

  // Line 13: Section 199A QBI Deduction (Form 8995)
  // Collect QBI sources from Schedule C, Schedule F, and K-1s.
  // Per IRS Form 8995 Instructions, QBI from Schedule C/F must be reduced by
  // SE-related deductions attributable to the business:
  // - Deductible half of SE tax (§164(f)) — allocated proportionally by SE earnings
  // - SE health insurance deduction (§162(l)) — attributable to Sched C/F business
  // - SE retirement contributions (§404) — not in input model, documented limitation
  const qbiSources: QBISource[] = [];
  const k1SEIncome = k1Agg.selfEmploymentEarnings;
  const k1GuaranteedPayments = k1Agg.guaranteedPayments;
  // Total positive SE earnings for proportional deductible-half allocation
  const totalPositiveSE = sum(
    zeroFloor(schedCNetProfit),
    zeroFloor(schedFNetProfit),
    zeroFloor(k1SEIncome),
    zeroFloor(k1GuaranteedPayments)
  );
  if (schedCNetProfit && !schedCNetProfit.isZero()) {
    // Allocate deductible half SE tax proportionally to Schedule C's contribution
    // to total positive SE earnings. SE health insurance is fully Schedule C's.
    let schedCQBIAdjustment = new Decimal(0);
    if (totalPositiveSE.greaterThan(0) && schedCNetProfit.greaterThan(0)) {
      const schedCShare = schedCNetProfit.dividedBy(totalPositiveSE);
      const allocatedDeductibleHalf = roundDollar(schedSE.deductibleHalf.times(schedCShare));
      schedCQBIAdjustment = allocatedDeductibleHalf.plus(seHealthInsurance);
    }
    const adjustedSchedCQBI = schedCNetProfit.minus(schedCQBIAdjustment);
    qbiSources.push({ name: input.scheduleC?.businessName ?? "Schedule C", qbi: adjustedSchedCQBI, materiallyParticipated: input.scheduleC?.qbiMateriallyParticipated });
  }
  if (schedFNetProfit && !schedFNetProfit.isZero()) {
    // Allocate deductible half SE tax proportionally to Schedule F's contribution
    let schedFQBIAdjustment = new Decimal(0);
    if (totalPositiveSE.greaterThan(0) && schedFNetProfit.greaterThan(0)) {
      const schedFShare = schedFNetProfit.dividedBy(totalPositiveSE);
      schedFQBIAdjustment = roundDollar(schedSE.deductibleHalf.times(schedFShare));
    }
    const adjustedSchedFQBI = schedFNetProfit.minus(schedFQBIAdjustment);
    qbiSources.push({ name: input.scheduleF?.principalCropOrActivity ?? "Schedule F", qbi: adjustedSchedFQBI, materiallyParticipated: input.scheduleF?.qbiMateriallyParticipated });
  }
  for (const k1 of input.scheduleK1) {
    const k1QBI = d(k1.section199AQBI);
    if (!k1QBI.isZero()) {
      qbiSources.push({ name: k1.partnershipName, qbi: k1QBI, materiallyParticipated: k1.qbiMateriallyParticipated });
    }
  }
  // K-1 Form 1041 Box 14 Code I: QBI from estates/trusts
  // Trust QBI is NOT self-employment income — no SE tax adjustment needed
  for (const k1 of k1Form1041s) {
    const k1QBI = d(k1.section199AQBI);
    if (!k1QBI.isZero()) {
      qbiSources.push({ name: k1.estateTrustName, qbi: k1QBI, materiallyParticipated: k1.qbiMateriallyParticipated });
    }
  }

  // Rental property QBI (Rev. Proc. 2019-38 safe harbor or case law qualification)
  // QBI is limited to the rental income actually included in taxable income after
  // Form 8582 passive loss limitation. Positive income is included in full.
  // Passive losses use the Form 8582-allowed amount (not total loss).
  for (let ri = 0; ri < schedE.rentalProperties.length; ri++) {
    const rental = schedE.rentalProperties[ri];
    const prop = (input.rentalProperties ?? [])[ri];
    if (!prop?.qualifiesForQBI) continue;

    let rentalQBI: Decimal;
    if (rental.netRentalIncome.isPositive()) {
      // Positive income: fully included as QBI
      rentalQBI = rental.netRentalIncome;
    } else {
      // Loss: use Form 8582 allowed amount (look up by property description)
      const alloc = form8582.activityAllocations.find((a) => a.name === rental.description);
      if (alloc) {
        // allowedLoss is the positive portion of the loss allowed into taxable income
        rentalQBI = alloc.allowedLoss.isZero() ? new Decimal(0) : alloc.allowedLoss.negated();
      } else {
        // No allocation found (should not happen for loss activities)
        rentalQBI = new Decimal(0);
      }
    }
    if (!rentalQBI.isZero()) {
      qbiSources.push({ name: rental.description, qbi: rentalQBI, materiallyParticipated: prop.qbiMateriallyParticipated });
      audit.record("1040", "13-QBI-rental", `Rental QBI: ${rental.description}`,
        rentalQBI,
        rentalQBI.isPositive()
          ? "Full net rental income (Rev. Proc. 2019-38 qualifying activity)"
          : `Form 8582-allowed rental loss of $${rentalQBI} (suspended portion excluded from QBI)`);
    }
  }

  // Aggregate qualified REIT dividends from 1099-DIV Box 5, K-1 1065/1120S, and K-1 1041 statements
  const qualifiedReitDividends = sum(
    divAgg.section199ADividends,
    k1Agg.section199AQualifiedReitDividends,
    ...k1Form1041s.map((k1) => d(k1.section199AQualifiedReitDividends))
  );

  // Aggregate qualified PTP income from K-1 1065/1120S and K-1 1041 statements
  const qualifiedPTPIncome = sum(
    k1Agg.section199AQualifiedPTPIncome,
    ...k1Form1041s.map((k1) => d(k1.section199AQualifiedPTPIncome))
  );

  // Build per-PTP sources with W-2/UBIA/SSTB detail for Form 8995-A
  const ptpSources: QBIBusinessSource[] = [];
  for (const k1 of input.scheduleK1) {
    const ptpIncome = d(k1.section199AQualifiedPTPIncome);
    if (!ptpIncome.isZero()) {
      ptpSources.push({
        name: `${k1.partnershipName} (PTP)`,
        qbi: ptpIncome,
        w2Wages: d(k1.section199APTPW2Wages ?? "0"),
        ubia: d(k1.section199APTPUBIA ?? "0"),
        isSST: k1.section199APTPIsSST ?? false,
      });
    }
  }
  // K-1 Form 1041 PTP sources
  for (const k1 of k1Form1041s) {
    const ptpIncome = d(k1.section199AQualifiedPTPIncome);
    if (!ptpIncome.isZero()) {
      ptpSources.push({
        name: `${k1.estateTrustName} (PTP)`,
        qbi: ptpIncome,
        w2Wages: new Decimal(0),
        ubia: new Decimal(0),
        isSST: false,
      });
    }
  }

  function computeQBI(selectedDeduction: Decimal, otherDeductions: Decimal) {
    let qbiDeduction = new Decimal(0);
    const taxableIncomeBeforeQBI = zeroFloor(agi.minus(selectedDeduction).minus(otherDeductions));
    let form8995Result: import("./forms/form-8995.js").Form8995Result | undefined;
    let form8995AResult: import("./forms/form-8995-a.js").Form8995AResult | undefined;

    const hasQBISources = qbiSources.length > 0 || qualifiedReitDividends.greaterThan(0) || !qualifiedPTPIncome.isZero() || d(input.priorYear?.qbiLossCarryforward).gt(0);
    if (hasQBISources && (year === 2026 || taxableIncomeBeforeQBI.greaterThan(0))) {
      const qbiThreshold = constants.qbi.simplifiedThreshold[filingStatus];
      const priorQBILoss = input.priorYear?.qbiLossCarryforward
        ? d(input.priorYear.qbiLossCarryforward)
        : undefined;

      if (taxableIncomeBeforeQBI.lte(qbiThreshold)) {
        // Simplified Form 8995: no W-2/UBIA limitations, no SSTB phase-out
        form8995Result = calculateForm8995({
          taxYear: year,
          priorYearActiveQBILoss: input.priorYear?.activeQbiLossCarryforward === undefined ? undefined : d(input.priorYear.activeQbiLossCarryforward),
          qbiSources,
          qualifiedReitDividends,
          qualifiedPTPIncome,
          priorYearQBILoss: priorQBILoss,
          taxableIncomeBeforeQBI,
          netCapitalGain: min(schedD.netLongTerm, schedD.netCapitalGainLoss),
          qualifiedDividends,
        });
        qbiDeduction = form8995Result.qbiDeduction;
      } else {
        // Detailed Form 8995-A: W-2/UBIA limitations and SSTB phase-out apply
        // Build per-business sources with W-2 wages, UBIA, and SSTB status
        const qbiBusinessSources: QBIBusinessSource[] = qbiSources.map((source) => {
          // Look up W-2/UBIA/SSTB metadata from original input
          let w2Wages = new Decimal(0);
          let ubia = new Decimal(0);
          let isSST = false;
          if (input.scheduleC && source.name === (input.scheduleC.businessName ?? "Schedule C")) {
            w2Wages = d(input.scheduleC.w2WagesPaid ?? "0");
            ubia = d(input.scheduleC.ubiaQualifiedProperty ?? "0");
            isSST = input.scheduleC.isSST ?? false;
          } else if (input.scheduleF && source.name === (input.scheduleF.principalCropOrActivity ?? "Schedule F")) {
            w2Wages = d(input.scheduleF.w2WagesPaid ?? "0");
            ubia = d(input.scheduleF.ubiaQualifiedProperty ?? "0");
            // Farms are not SSTBs under IRC §199A(d)(2)
          } else {
            // Rental property source: look up by property description
            const rental = (input.rentalProperties ?? []).find((rp) => rp.description === source.name);
            if (rental?.qualifiesForQBI) {
              w2Wages = d(rental.qbiW2Wages ?? "0");
              ubia = d(rental.qbiUBIA ?? "0");
              isSST = rental.qbiIsSST ?? false;
            } else {
              // K-1 source: look up by partnership name
              const k1 = input.scheduleK1.find((k) => k.partnershipName === source.name);
              if (k1) {
                w2Wages = d(k1.section199AW2Wages ?? "0");
                ubia = d(k1.section199AUBIA ?? "0");
                isSST = k1.section199AIsSST ?? false;
              } else {
                // K-1 Form 1041 source: look up by estate/trust name
                const k1_1041 = k1Form1041s.find((k) => k.estateTrustName === source.name);
                if (k1_1041) {
                  w2Wages = d(k1_1041.section199AW2Wages ?? "0");
                  ubia = d(k1_1041.section199AUBIA ?? "0");
                  isSST = k1_1041.section199AIsSST ?? false;
                }
              }
            }
          }
          return { name: source.name, qbi: source.qbi, w2Wages, ubia, isSST, materiallyParticipated: source.materiallyParticipated };
        });

        // Part IV aggregation elections from taxpayer input
        const aggregationElections = (input.priorYear?.qbiAggregationElections ?? []).map((e) => ({
          name: e.name,
          componentBusinessNames: e.componentBusinessNames,
        }));

        form8995AResult = calculateForm8995A({
          taxYear: year,
          priorYearActiveQBILoss: input.priorYear?.activeQbiLossCarryforward === undefined ? undefined : d(input.priorYear.activeQbiLossCarryforward),
          qbiSources: qbiBusinessSources,
          ptpSources: ptpSources.length > 0 ? ptpSources : undefined,
          qualifiedReitDividends,
          aggregationElections: aggregationElections.length > 0 ? aggregationElections : undefined,
          priorYearQBILoss: priorQBILoss,
          taxableIncomeBeforeQBI,
          netCapitalGain: min(schedD.netLongTerm, schedD.netCapitalGainLoss),
          qualifiedDividends,
          simplifiedThreshold: qbiThreshold,
          phaseInRange: constants.qbi.phaseInRange[filingStatus],
        });
        qbiDeduction = form8995AResult.qbiDeduction;
      }
    }
    return { qbiDeduction, form8995Result, form8995AResult };
  }
  let qbiCalculation = computeQBI(deductionAmount, additionalDeductions);
  let itemizedDeductionReduction = new Decimal(0);
  if (year === 2026) {
    const availableHistoricalNol = d(input.priorYear?.nolCarryforward ?? input.priorYear?.excessBusinessLossNOL).plus(k1Form1041FinalNOL);
    if (availableHistoricalNol.gt(0)) throw new Error("2026 NOL and deduction coordination is not yet supported");
    if (deductionUsed === "itemized") {
      const topBracket = constants.taxBrackets[filingStatus].find(bracket => bracket.rate.eq("0.37"));
      if (!topBracket) throw new Error("Missing 37% bracket for itemized limitation");
      const limitation = calculateItemizedDeductionLimit({
        taxYear: year, itemizedDeductions,
        taxableIncomeBeforeItemized: agi.minus(qbiCalculation.qbiDeduction).minus(schedule1A?.totalDeduction ?? d("0")),
        topBracketThreshold: topBracket.min,
      });
      audit.merge(limitation.lines);
      itemizedDeductionReduction = limitation.reduction;
      itemizedDeductions = limitation.allowedDeduction;
      if (deductionElection === "automatic" && standardDeductionWorksheet.eligibleForStandardDeduction
        && itemizedDeductions.lte(standardDeduction.plus(schedA.nonitemizerCharitableDeduction))) {
        deductionUsed = "standard";
        deductionAmount = standardDeduction;
        nonitemizerCharitableDeduction = schedA.nonitemizerCharitableDeduction;
        additionalDeductions = (schedule1A?.totalDeduction ?? d("0")).plus(nonitemizerCharitableDeduction);
        qbiCalculation = computeQBI(deductionAmount, additionalDeductions);
      } else {
        deductionAmount = itemizedDeductions;
      }
    }
  }
  const { qbiDeduction, form8995Result, form8995AResult } = qbiCalculation;
  if (form8995Result) audit.merge(form8995Result.lines);
  if (form8995AResult) audit.merge(form8995AResult.lines);
  audit.record("1040", "12", "Standard or itemized deduction", deductionAmount, `${deductionUsed} deduction selected after applicable limitations`);
  audit.record("1040", "nonitemizer-charity", "Charitable deduction with standard deduction", nonitemizerCharitableDeduction,
    "IRC 170(p); available only when the standard deduction is selected");
  audit.record("1040", "13", "Section 199A deduction", qbiDeduction,
    qbiDeduction.isZero() ? "No QBI sources or zero deduction" :
    form8995AResult ? `Form 8995-A: $${qbiDeduction}` : `Form 8995: $${qbiDeduction}`);

  // Line 14: Total deductions = Line 12 + Line 13
  const totalDeduction = deductionAmount.plus(qbiDeduction).plus(additionalDeductions);
  audit.record("1040", "14", "Total deductions", totalDeduction, "Line 12 + Line 13a QBI + Line 13b Schedule 1-A");

  // Line 15: Taxable income (preliminary, before NOL deduction)
  const rawTaxableIncome = agi.minus(totalDeduction); // before zero-floor, needed by carryforward worksheet
  const preNolTaxableIncome = zeroFloor(rawTaxableIncome);

  // ── IRC §172: Net Operating Loss Deduction ──────────────
  // For post-2017 NOLs, the deduction is limited to 80% of taxable income
  // computed without regard to the NOL deduction (IRC §172(a)(2)).
  // The available NOL comes from prior-year excess business losses (Form 461)
  // or a general NOL carryforward input when the taxpayer has NOLs from
  // sources outside this engine.
  // Available NOL from prior years plus any K-1 Form 1041 Box 11 Code E
  // (final year NOL carryover from a terminating estate/trust)
  const availableNOL = Decimal.max(
    new Decimal(0),
    d(input.priorYear?.nolCarryforward ?? input.priorYear?.excessBusinessLossNOL)
      .plus(k1Form1041FinalNOL)
  );
  const nolLimit = preNolTaxableIncome.times(new Decimal("0.8"));
  const nolDeduction = Decimal.min(availableNOL, nolLimit);

  let taxableIncome = preNolTaxableIncome;
  if (nolDeduction.greaterThan(0)) {
    taxableIncome = zeroFloor(preNolTaxableIncome.minus(nolDeduction));
    // Adjust AGI to reflect the NOL deduction for output purposes.
    // The NOL deduction enters Schedule 1 as negative other income, reducing AGI.
    agi = agi.minus(nolDeduction);
    audit.record("Sched 1", "8a", "Net operating loss deduction", nolDeduction.negated(),
      "IRC §172 NOL deduction limited to 80% of pre-NOL taxable income",
      {
        "Available NOL carryforward": availableNOL,
        "Pre-NOL taxable income": preNolTaxableIncome,
        "80% limitation": nolLimit,
        "NOL deduction claimed": nolDeduction,
      });
    audit.record("1040", "11-nol", "AGI adjusted for NOL deduction", agi,
      `Reduced by $${nolDeduction} NOL deduction on Schedule 1 Line 8a`);
  }
  audit.record("1040", "15", "Taxable income", taxableIncome,
    nolDeduction.greaterThan(0)
      ? "AGI - total deductions - NOL deduction"
      : "AGI - total deductions");

  // Recompute capital loss carryforward using the full IRS Capital Loss Carryover Worksheet.
  // Per IRS worksheet Lines 1-4, when raw taxable income is negative, some or all of the
  // deduction provided no tax benefit, so more loss carries forward.
  const adjustedCarryforward = recomputeCarryforward(schedD, rawTaxableIncome);

  // ═══════════════════════════════════════════════════════════
  // Phase 4: Tax Computation (Form 1040 Line 16)
  // ═══════════════════════════════════════════════════════════

  // QDCG Worksheet Line 3: "Enter the smaller of Schedule D line 15 or line 16.
  // If either line 15 or line 16 is blank or a loss, enter -0-."
  // When ST losses partially offset LT gains, netCapitalGainLoss < netLongTerm,
  // and only the net capital gain enters the preferential rate computation.
  // Form 8814 Line 10 capital gain distributions are long-term and must enter
  // the QDCG preferential-rate computation alongside Schedule D amounts.
  const netLTCG = zeroFloor(min(schedD.netLongTerm, schedD.netCapitalGainLoss)).plus(form8814CapitalGains);

  // Aggregate special-rate capital gains from 1099-DIV, K-1, home sale depreciation recapture,
  // and Form 4797 Part III unrecaptured section 1250 gain from business property sales
  const homeSaleDepreciationRecapture = schedD.homeSales?.totalDepreciationRecapture ?? new Decimal(0);
  const section1250Gain = sum(
    divAgg.section1250Gain,
    k1Agg.unrecapturedSection1250Gain,
    ...(input.scheduleK1Form1041 ?? []).map((k) => d(k.unrecapturedSection1250Gain)),
    homeSaleDepreciationRecapture,
    form4797.totalUnrecapturedSection1250Gain
  );
  const collectiblesGain = sum(
    divAgg.collectiblesGain,
    k1Agg.collectiblesGain,
    ...(input.scheduleK1Form1041 ?? []).map((k) => d(k.collectiblesGain))
  );

  // When Form 2555 is present, apply the Foreign Earned Income Tax Worksheet
  // stacking rule: compute tax as if excluded income were still included, then
  // subtract the tax on just the excluded amount. This ensures remaining income
  // is taxed at the higher bracket positions.
  let incomeTax: Decimal;
  let ordinaryTax: Decimal;
  let preferentialTax: Decimal;
  const form2555TotalExclusion = form2555?.totalExclusion ?? new Decimal(0);

  if (form2555 && form2555TotalExclusion.greaterThan(0)) {
    // Step 1: Tax on (taxable income + total exclusion) using QDCG worksheet
    const stackedIncome = taxableIncome.plus(form2555TotalExclusion);
    const taxWithExclusion = calculateCapitalGainsTax(
      stackedIncome, qualifiedDividends, netLTCG, filingStatus, constants,
      { section1250Gain, collectiblesGain }
    );
    // Step 2: Tax on just the excluded amount using ordinary brackets
    const taxOnExcluded = calculateTaxFromBrackets(
      form2555TotalExclusion, constants.taxBrackets[filingStatus]
    );
    // Step 3: Actual tax = step 1 - step 2 (floored at zero)
    incomeTax = zeroFloor(taxWithExclusion.tax.minus(taxOnExcluded));
    ordinaryTax = zeroFloor(taxWithExclusion.ordinaryTax.minus(taxOnExcluded));
    preferentialTax = taxWithExclusion.preferentialTax;
    audit.record("1040", "16", "Tax", incomeTax,
      `Foreign Earned Income Tax Worksheet stacking rule: tax on $${stackedIncome} minus tax on excluded $${form2555TotalExclusion}`,
      { stackedIncome, taxWithExclusion: taxWithExclusion.tax, taxOnExcluded, form2555TotalExclusion });
  } else {
    const result = calculateCapitalGainsTax(
      taxableIncome, qualifiedDividends, netLTCG, filingStatus, constants,
      { section1250Gain, collectiblesGain }
    );
    incomeTax = result.tax;
    ordinaryTax = result.ordinaryTax;
    preferentialTax = result.preferentialTax;
    audit.record("1040", "16", "Tax", incomeTax, "QDCG Worksheet (ordinary + preferential rates)");
  }

  // ── Form 8615: Kiddie Tax ────────────────────────────────
  // When Form 8615 input is provided, replace the income tax with the
  // Form 8615 computation that taxes net unearned income at the parent's rate.
  let form8615Result: ReturnType<typeof calculateForm8615> | undefined;
  if (input.form8615) {
    form8615Result = calculateForm8615(
      input.form8615,
      taxableIncome,
      filingStatus,
      constants
    );
    audit.merge(form8615Result.lines);
    if (form8615Result.applies) {
      incomeTax = form8615Result.tax;
      // Decompose into ordinary/preferential for downstream consumers — use the
      // Form 8615 total as "ordinary" since the parent-rate computation already
      // accounts for QDCG internally.
      ordinaryTax = form8615Result.tax;
      preferentialTax = new Decimal(0);
      audit.record("1040", "16", "Tax (Form 8615)", incomeTax,
        "Kiddie tax replaces normal Line 16 computation");
    }
  }

  // ── Form 8814 Line 15 tax addition to Line 16 ──────────
  const form8814Tax = form8814?.totalTax ?? new Decimal(0);
  if (form8814Tax.greaterThan(0)) {
    incomeTax = incomeTax.plus(form8814Tax);
    ordinaryTax = ordinaryTax.plus(form8814Tax);
    audit.record("1040", "16", "Tax (with Form 8814)", incomeTax,
      `Regular tax plus Form 8814 Line 15 tax $${form8814Tax} on child(ren)'s first $${constants.form8814.baseAmount} tier`);
  }

  // ── Schedule J: Farm Income Averaging (IRC §1301) ────────
  // When provided, Schedule J replaces incomeTax (Line 16) if the averaged
  // tax is lower. The regular tax WITHOUT Schedule J is preserved for
  // Form 6251 (AMT ignores income averaging).
  const taxWithoutScheduleJ = incomeTax;
  let scheduleJResult: ReturnType<typeof calculateScheduleJ> | undefined;
  if (input.scheduleJ) {
    scheduleJResult = calculateScheduleJ(
      input.scheduleJ,
      taxableIncome,
      incomeTax,
      filingStatus,
      constants,
      qualifiedDividends.greaterThan(0) || netLTCG.greaterThan(0)
        ? { qualifiedDividends, netLongTermCapitalGain: netLTCG, section1250Gain, collectiblesGain }
        : undefined
    );
    audit.merge(scheduleJResult.lines);
    if (scheduleJResult.isbeneficial) {
      incomeTax = scheduleJResult.line23;
      ordinaryTax = incomeTax;
      preferentialTax = new Decimal(0);
      audit.record("1040", "16", "Tax (Schedule J income averaging)", incomeTax,
        `Schedule J Line 23 replaces regular tax $${taxWithoutScheduleJ}`);
    }
  }

  // ── Aggregate K-1 Box 17 AMT items for Form 6251 ────────
  const k1AmtDepreciation = k1Agg.amtDepreciationAdjustment;
  const k1AmtDisposition = k1Agg.amtAdjustedGainOrLoss;
  const k1AmtDepletion = k1Agg.amtDepletion;
  const k1AmtOther = k1Agg.amtOtherItems;

  // Form 6251 feeds Schedule 2 Line 1, which in turn increases Form 1040 Line 18
  // before the saver's credit limitation on Form 8880 Line 11 is applied.
  const form6251 = calculateForm6251(
    {
      // Form 6251 starts from AGI less deductions even when Form 1040 floors at zero.
      taxableIncome: rawTaxableIncome.minus(nolDeduction),
      standardDeductionAmount: deductionUsed === "standard" ? deductionAmount : d("0"),
      seniorDeduction: schedule1A?.seniorDeduction,
      saltDeduction: schedA.saltDeduction,
      depletionAdjustment: k1AmtDepletion,
      dispositionAdjustment: k1AmtDisposition,
      depreciationAdjustment: k1AmtDepreciation,
      // IRC 56(b)(1)(E): restore the section 68 amount only when itemizing.
      otherAdjustments: k1AmtOther.plus(k1Form1041AmtAdjustment)
        .minus(deductionUsed === "itemized" ? itemizedDeductionReduction : d("0")),
      // Per Form 6251 instructions: if Schedule J is used, Form 6251 must
      // use the tax computed WITHOUT Schedule J (income averaging does not
      // apply to AMT).
      regularTax: taxWithoutScheduleJ,
      filingStatus,
      isItemizing: deductionUsed === "itemized",
      qualifiedDividends,
      netLongTermCapitalGain: netLTCG,
      section1250Gain,
      collectiblesGain,
    },
    constants
  );
  const amt = form6251.amt;
  audit.merge(form6251.lines);
  audit.record("Sched 2", "1", "Alternative Minimum Tax", amt, "Form 6251 Line 11");

  // ── Form 8959: Additional Medicare Tax ────────────────
  // Form 8959 Line 8 requires post-multiplier SE (Schedule SE Line 4a = earnings × 0.9235).
  // Using pre-multiplier netSEEarnings would overstate the SE contribution.
  const form8959 = calculateForm8959(input, schedSE.taxableEarnings, filingStatus, constants);
  const additionalMedicareTax = form8959.additionalMedicareTax;
  audit.merge(form8959.lines);

  // ── Line 27a: Earned Income Credit ──────────────────────
  // Computed before Form 2210 so EIC is included in refundable credits for
  // accurate estimated tax penalty calculation.
  // Per IRC §32(c)(2): earned income = wages + net SE earnings − deductible half of SE tax.
  const eicEarnedIncome = sum(totalWages, netSEEarnings).minus(schedSE.deductibleHalf);

  // Investment income for EIC disqualification: taxable + tax-exempt interest,
  // dividends, capital gain net income (≥ $0), net rental/royalty income (if positive)
  const eicInvestmentIncome = input.eic?.investmentIncomeOverride
    ? d(input.eic.investmentIncomeOverride)
    : sum(
        totalTaxableInterest,
        taxExemptInterest,
        totalDividends,
        Decimal.max(new Decimal(0), capitalGainLoss),
        Decimal.max(new Decimal(0), adjustedScheduleETotal),
      );

  // Qualifying EIC children from dependents
  const qualifyingEicChildren = input.taxpayer.dependents.filter((dep) => dep.qualifiesForEIC).length;

  // Compute primary filer's age at end of tax year
  const primaryBirth = new Date(input.taxpayer.primary.dateOfBirth);
  const eicYearEnd = new Date(year, 11, 31);
  const primaryAgeRaw = eicYearEnd.getFullYear() - primaryBirth.getFullYear();
  const primaryBirthdayThisYear = new Date(year, primaryBirth.getMonth(), primaryBirth.getDate());
  const primaryAge = primaryBirthdayThisYear <= eicYearEnd ? primaryAgeRaw : primaryAgeRaw - 1;

  // IRC §32(c)(1)(C): Filing Form 2555 disqualifies the taxpayer from EIC
  let eic: Decimal;
  let scheduleEIC: ReturnType<typeof calculateEic> | undefined;
  if (form2555) {
    eic = new Decimal(0);
    audit.record("1040", "27a", "Earned Income Credit", eic,
      "Disqualified: taxpayer filed Form 2555 (IRC §32(c)(1)(C))");
  } else {
    scheduleEIC = calculateEic({
      filingStatus,
      qualifyingChildren: qualifyingEicChildren,
      earnedIncome: eicEarnedIncome,
      agi,
      investmentIncome: eicInvestmentIncome,
      primaryAge,
      mfsEicEligible: input.eic?.mfsEligible ?? false,
    }, constants);
    audit.merge(scheduleEIC.lines);
    eic = scheduleEIC.credit;
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 5: Credits (Form 1040 Lines 19-21)
  // ═══════════════════════════════════════════════════════════

  // CTC calculation moved after Schedule 3 (needs tax liability after other credits)

  // ── Form 1116: Foreign Tax Credit (IRC §904(d) multi-category) ──────
  const foreignTaxFromDiv = divAgg.foreignTaxPaid;
  const foreignTaxFromInt = intAgg.foreignTaxPaid;
  const foreignTaxFromK1 = k1Agg.foreignTaxPaid;
  const foreignTaxPaid = foreignTaxFromDiv.plus(foreignTaxFromInt).plus(foreignTaxFromK1).plus(k1Form1041ForeignTaxesPaid);

  // Categorize K-1 foreign tax by IRC §904(d) category
  const foreignTaxK1Passive = k1Agg.foreignTaxPassive;
  const foreignTaxK1General = k1Agg.foreignTaxGeneral;

  // Per-category foreign tax totals
  // K-1 Form 1041 foreign taxes default to passive category (trust investment income)
  const passiveForeignTax = foreignTaxFromDiv.plus(foreignTaxFromInt).plus(foreignTaxK1Passive).plus(k1Form1041ForeignTaxesPaid);
  const generalForeignTax = foreignTaxK1General;

  // Per-category foreign source income estimation
  // When explicit foreignSourceIncome (Box 16 Codes D/E/F) is provided on a K-1,
  // use it instead of the heuristic sum of all K-1 income fields.
  const k1ForeignSourceIncomeForCategory = (category: "passive" | "general") =>
    input.scheduleK1
      .filter((k1) => (k1.foreignTaxCategory ?? "general") === category && d(k1.foreignTaxPaid).greaterThan(0))
      .map((k1) => {
        if (k1.foreignSourceIncome !== undefined) {
          return Decimal.max(new Decimal(0), d(k1.foreignSourceIncome));
        }
        return sum(
          ...[k1.ordinaryIncome, k1.netRentalIncome, k1.otherNetRentalIncome,
              k1.guaranteedPayments, k1.interestIncome, k1.ordinaryDividends,
              k1.royalties, k1.netShortTermCapitalGain, k1.netLongTermCapitalGain,
              k1.section1231Gain, k1.otherIncome]
            .map((v) => Decimal.max(new Decimal(0), d(v)))
        );
      });
  const passiveSourceIncome = sum(
    estimateForeignSourceIncomeFrom1099Div(input),
    estimateForeignSourceIncomeFrom1099Int(input),
    ...k1ForeignSourceIncomeForCategory("passive"),
    estimateForeignSourceIncomeFromScheduleK1Form1041(input),
  );
  const generalSourceIncome = sum(
    ...k1ForeignSourceIncomeForCategory("general"),
  );

  // Resolve per-category carryforward
  const perCategoryCarryforward = input.priorYear?.foreignTaxCreditCarryforwardByCategory;
  const legacyCarryforward = d(input.priorYear?.foreignTaxCreditCarryforward);
  const legacyCarryforwardByYear = (input.priorYear?.foreignTaxCreditCarryforwardByYear ?? [])
    .map((entry) => ({ taxYear: entry.taxYear, amount: d(entry.amount) }));

  // Determine which categories have activity (current-year tax or carryforward)
  const hasPassiveActivity = passiveForeignTax.greaterThan(0)
    || (perCategoryCarryforward?.passive ?? []).some((e) => d(e.amount).greaterThan(0));
  const hasGeneralActivity = generalForeignTax.greaterThan(0)
    || (perCategoryCarryforward?.general ?? []).some((e) => d(e.amount).greaterThan(0));
  const hasLegacyCarryforward = legacyCarryforward.greaterThan(0)
    || legacyCarryforwardByYear.length > 0;
  const isMultiCategory = hasPassiveActivity && hasGeneralActivity;

  let foreignTaxCredit: Decimal;
  let foreignTaxCreditCarryforward = new Decimal(0);
  const foreignTaxCreditCarryforwardByCategory: Record<string, Array<{ taxYear: number; amount: Decimal }>> = {};
  const hasForeignTaxActivity = foreignTaxPaid.greaterThan(0) || hasLegacyCarryforward
    || hasPassiveActivity || hasGeneralActivity;

  if (!hasForeignTaxActivity) {
    foreignTaxCredit = new Decimal(0);
  } else if (!isMultiCategory) {
    // Single category — backward-compatible path
    const foreignSourceIncome = estimateForeignSourceIncome(input);
    const priorYearCarryforwardByYear = perCategoryCarryforward
      ? [...(perCategoryCarryforward.passive ?? []), ...(perCategoryCarryforward.general ?? [])]
          .map((entry) => ({ taxYear: entry.taxYear, amount: d(entry.amount) }))
      : legacyCarryforwardByYear;
    const form1116 = calculateForm1116({
      foreignSourceIncome,
      totalTaxableIncome: taxableIncome,
      taxBeforeCredits: incomeTax,
      foreignTaxesPaid: foreignTaxPaid,
      filingStatus,
      currentTaxYear: input.taxpayer.taxYear,
      priorYearCarryforward: perCategoryCarryforward ? undefined : legacyCarryforward,
      priorYearCarryforwardByYear: priorYearCarryforwardByYear.length > 0 ? priorYearCarryforwardByYear : undefined,
      hasDisqualifyingForeignTaxSources: foreignTaxFromK1.greaterThan(0),
      deductionAmount,
      agi,
    });
    foreignTaxCredit = form1116.creditAllowed;
    foreignTaxCreditCarryforward = form1116.carryforward;
    audit.merge(form1116.lines);
    // Track carryforward under whichever category is active
    const activeCategory = hasPassiveActivity ? "passive" : "general";
    if (form1116.carryforwardByYear.length > 0) {
      foreignTaxCreditCarryforwardByCategory[activeCategory] = form1116.carryforwardByYear.map(
        (e) => ({ taxYear: e.taxYear, amount: e.amount })
      );
    }
  } else {
    // Multi-category — compute per-category Form 1116 and aggregate
    let totalCredit = new Decimal(0);
    let totalCarryforward = new Decimal(0);

    const categories: Array<{
      name: string;
      tax: Decimal;
      income: Decimal;
      carryforwardEntries: FTCCarryforwardEntry[];
      legacyCf: Decimal;
    }> = [
      {
        name: "passive",
        tax: passiveForeignTax,
        income: passiveSourceIncome,
        carryforwardEntries: (perCategoryCarryforward?.passive ?? [])
          .map((e) => ({ taxYear: e.taxYear, amount: d(e.amount) })),
        // When no per-category carryforward is provided, assign legacy to general (not passive)
        legacyCf: new Decimal(0),
      },
      {
        name: "general",
        tax: generalForeignTax,
        income: generalSourceIncome,
        carryforwardEntries: (perCategoryCarryforward?.general ?? [])
          .map((e) => ({ taxYear: e.taxYear, amount: d(e.amount) })),
        // When no per-category carryforward, assign legacy carryforward to general
        legacyCf: perCategoryCarryforward ? new Decimal(0) : legacyCarryforward,
      },
    ];

    for (const cat of categories) {
      const hasCatActivity = cat.tax.greaterThan(0)
        || cat.carryforwardEntries.length > 0
        || cat.legacyCf.greaterThan(0);
      if (!hasCatActivity) continue;

      // Merge legacy per-year entries into this category if no per-category carryforward was provided
      const carryforwardByYearEntries = cat.carryforwardEntries.length > 0
        ? cat.carryforwardEntries
        : (cat.legacyCf.greaterThan(0) && !perCategoryCarryforward)
          ? legacyCarryforwardByYear
          : [];

      const catResult = calculateForm1116({
        foreignSourceIncome: cat.income,
        totalTaxableIncome: taxableIncome,
        taxBeforeCredits: incomeTax,
        foreignTaxesPaid: cat.tax,
        filingStatus,
        currentTaxYear: input.taxpayer.taxYear,
        priorYearCarryforward: cat.carryforwardEntries.length > 0 ? undefined : cat.legacyCf,
        priorYearCarryforwardByYear: carryforwardByYearEntries.length > 0 ? carryforwardByYearEntries : undefined,
        hasDisqualifyingForeignTaxSources: true, // multi-category means simplified method is unavailable
        deductionAmount,
        agi,
      });

      totalCredit = totalCredit.plus(catResult.creditAllowed);
      totalCarryforward = totalCarryforward.plus(catResult.carryforward);

      // Relabel audit lines with category
      for (const line of catResult.lines) {
        line.form = `Form 1116 (${cat.name})`;
      }
      audit.merge(catResult.lines);

      if (catResult.carryforwardByYear.length > 0) {
        foreignTaxCreditCarryforwardByCategory[cat.name] = catResult.carryforwardByYear.map(
          (e) => ({ taxYear: e.taxYear, amount: e.amount })
        );
      }
    }

    foreignTaxCredit = totalCredit;
    foreignTaxCreditCarryforward = totalCarryforward;
  }

  // ── Form 8962: Premium Tax Credit ──────────────────────
  let netPremiumTaxCredit = new Decimal(0);
  let excessAPTCRepayment = new Decimal(0);
  let form8962: ReturnType<typeof calculateForm8962> | undefined;
  if (input.form1095A.length > 0 || input.form8962) {
    form8962 = calculateForm8962({
      taxYear: year,
      facts: input.form8962,
      // These compatibility proxies are never used for verified facts or2026.
      taxFamilySize: year === 2025 && !input.form8962 ? 1 + (input.taxpayer.spouse ? 1 : 0) + input.taxpayer.dependents.length : undefined,
      modifiedAGI: year === 2025 && !input.form8962 ? agi : undefined,
      filingStatus,
      form1095A: input.form1095A,
    });
    netPremiumTaxCredit = form8962.netPTC;
    excessAPTCRepayment = form8962.excessAPTCRepayment;
    audit.merge(form8962.lines);
  }

  const vehicleClaims = [...(input.form8936?.newCleanVehicles ?? []), ...(input.form8936?.previouslyOwnedCleanVehicles ?? [])];
  const verifiedVehicles = year === 2026 || vehicleClaims.some(vehicle => vehicle.datePlacedInService !== undefined);
  if (verifiedVehicles && vehicleClaims.some(vehicle => vehicle.sourceFactsComplete !== true)) {
    throw new Error("Original vehicle price, type, use or transfer facts are unknown");
  }
  const calculateVehicles = (taxLiabilityLimit: Decimal, incomeTaxBeforeCredits: Decimal) => input.form8936
    ? calculateForm8936({
      ...input.form8936, taxYear: year, filingStatus, agi,
      foreignEarnedIncomeExclusion: form2555 ? form2555IncomeReduction : input.form8936.foreignEarnedIncomeExclusion,
      foreignHousingDeduction: form2555 ? form2555HousingDeduction : input.form8936.foreignHousingDeduction,
      constants: constants.cleanVehicleCredit, taxLiabilityLimit, incomeTaxBeforeCredits,
    }) : undefined;
  // Transfer repayments are independent of credit limits and enter Part I before
  // credits. Discard this preliminary credit/audit; emit the final worksheet below.
  const vehicleReconciliation = calculateVehicles(new Decimal(0), new Decimal(0));
  if (vehicleReconciliation?.requiresTransferReconciliation) throw new Error("Actual vehicle transfer reconciliation facts are required");
  const newVehicleTransferRepayment = vehicleReconciliation?.transferredNewVehicleCreditRepayment ?? new Decimal(0);
  const usedVehicleTransferRepayment = vehicleReconciliation?.transferredPreviouslyOwnedCreditRepayment ?? new Decimal(0);
  const partIAdditions = sum(excessAPTCRepayment, newVehicleTransferRepayment, usedVehicleTransferRepayment);

  // ── Line 17-18: Tax before credits includes Schedule 2 Part I ──
  // Per IRS Form 1040: Line 17 = AMT + excess APTC (Schedule 2 Part I)
  // Line 18 = Line 16 + Line 17. Nonrefundable credits reduce Line 18.
  const taxBeforeCredits = incomeTax.plus(amt).plus(partIAdditions);
  audit.record("1040", "17", "Schedule 2 Part I", amt.plus(partIAdditions),
    `AMT $${amt} + APTC and actual vehicle transfer repayments $${partIAdditions}`);
  audit.record("1040", "18", "Tax before credits", taxBeforeCredits,
    `Line 16 $${incomeTax} + Line 17 $${amt.plus(partIAdditions)}`);

  // ── Form 2441: Dependent Care Credit ────────────────────
  // MFS filers cannot claim dependent care credit (IRC §21(e)(2))
  let dependentCareCredit = new Decimal(0);
  let form2441: ReturnType<typeof calculateForm2441> | undefined;
  if (input.dependentCare && filingStatus !== "married_filing_separately") {
    // Per IRS Form 2441 Instructions (Lines 4-5), SE earned income =
    // Schedule SE Line 3 (net SE earnings) minus Schedule 1 Line 15
    // (deductible half of SE tax). IRC §21(d)(1) → §32(c)(2)(A)(i)(II).
    if (year === 2026 && input.dependentCare.primaryEarnedIncome === undefined) {
      throw new Error("2026 dependent-care primary earned income is unknown");
    }
    const earnedIncome = input.dependentCare.primaryEarnedIncome === undefined
      ? sum(totalWages, netSEEarnings).minus(schedSE.deductibleHalf)
      : d(input.dependentCare.primaryEarnedIncome);
    form2441 = calculateForm2441({
      taxYear: year,
      filingStatus,
      eligibilityConfirmed: input.dependentCare.eligibilityConfirmed,
      spouseEarnedIncome: input.dependentCare.spouseEarnedIncome === undefined ? undefined : d(input.dependentCare.spouseEarnedIncome),
      excludedDependentCareBenefits: input.dependentCare.excludedDependentCareBenefits === undefined ? undefined : d(input.dependentCare.excludedDependentCareBenefits),
      taxLiabilityLimit: zeroFloor(taxBeforeCredits.minus(foreignTaxCredit)),
      careExpenses: d(input.dependentCare.expenses),
      qualifyingIndividuals: input.dependentCare.qualifyingIndividuals,
      earnedIncome,
      agi,
    });
    dependentCareCredit = form2441.credit;
    audit.merge(form2441.lines);
  }

  // ── Schedule R: Credit for the Elderly or the Disabled ──
  const scheduleR = input.scheduleR
    ? calculateScheduleR({
        filingStatus,
        agi,
        nontaxableSocialSecurity: zeroFloor(socialSecurityBenefitsGross.minus(socialSecurityBenefitsTaxable)),
        scheduleRInput: input.scheduleR,
        livedWithSpouse: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
        constants: constants.elderlyOrDisabledCredit,
      })
    : undefined;
  if (scheduleR) {
    audit.merge(scheduleR.lines);
  }
  const elderlyOrDisabledCredit = Decimal.min(scheduleR?.credit ?? new Decimal(0), zeroFloor(taxBeforeCredits.minus(foreignTaxCredit).minus(dependentCareCredit)));

  // ── Form 8863: actual education facts and Credit Limit Worksheet ──
  let educationNonrefundable = new Decimal(0);
  let educationRefundable = new Decimal(0);
  let form8863: ReturnType<typeof calculateForm8863> | undefined;
  if (input.educationExpenses) {
    const education = input.educationExpenses;
    if (year >= 2026 && education.possessionIncomeExclusion === undefined) throw new Error("Form8863 actual possession-income exclusion is unknown");
    if (year >= 2026) {
      for (const student of [...education.aocStudents, ...(education.llcStudents ?? [])]) {
        if (!d(student.qualifiedExpenses).gt(0) || !student.studentTaxId) continue;
        const id = student.studentTaxId.replaceAll("-", "");
        const actual = student.studentRole === "primary" ? [input.taxpayer.primary.ssn] : student.studentRole === "spouse" ? [input.taxpayer.spouse?.ssn] : input.taxpayer.dependents.map(dep => dep.ssn);
        if (!actual.some(tin => tin?.replaceAll("-", "") === id)) throw new Error("Form8863 student identity does not match the actual return household role");
      }
    }
    const educationPossession = d(education.possessionIncomeExclusion);
    if (!educationPossession.isFinite() || educationPossession.isNegative()) throw new Error("Form8863 possession exclusion must be finite and nonnegative");
    // Age is attained on the day before the birthday; January1 births attain
    // their next age on December31 of the preceding year.
    const dob = input.taxpayer.primary.dateOfBirth;
    const educationAge = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? year - Number(dob.slice(0, 4)) + (dob.slice(5) === "01-01" ? 1 : 0) : undefined;
    form8863 = calculateForm8863({
      ...education,
      taxYear: year,
      primarySsnEligible: education.primarySsnEligible ?? input.taxpayer.primary.employmentValidSsnIssuedByDueDate,
      spouseSsnEligible: education.spouseSsnEligible ?? input.taxpayer.spouse?.employmentValidSsnIssuedByDueDate,
      primaryTinEligible: education.primaryTinEligible ?? input.taxpayer.primary.tinIssuedByDueDate,
      primaryAgeAtYearEnd: educationAge,
      refundableAocFacts: education.refundableAocFacts ? {...education.refundableAocFacts,earnedIncome:d(education.refundableAocFacts.earnedIncome),totalSupport:d(education.refundableAocFacts.totalSupport)} : undefined,
      aocStudents: education.aocStudents.map(student => ({...student,qualifiedExpenses:d(student.qualifiedExpenses)})),
      llcStudents: education.llcStudents?.map(student => ({...student,qualifiedExpenses:d(student.qualifiedExpenses)})),
      llcExpenses: d(education.llcExpenses),
      magi: sum(agi,form2555?.totalExclusion ?? new Decimal(0),form2555?.housingDeduction ?? new Decimal(0),educationPossession),
      filingStatus,
      taxLiabilityLimit: zeroFloor(taxBeforeCredits.minus(sum(foreignTaxCredit,dependentCareCredit,elderlyOrDisabledCredit))),
    });
    educationNonrefundable = form8863.totalNonrefundable;
    educationRefundable = form8863.totalRefundable;
    audit.merge(form8863.lines);
  }

  // ── Excess Social Security Withholding ──────────────────
  const excessSSWithholding = calculateExcessSSWithholding(
    input.w2s,
    constants.selfEmploymentTax.socialSecurityWageBase,
    constants.selfEmploymentTax.socialSecurityRate.dividedBy(2), // employee portion = half
    { taxYear: year, filingStatus }
  );

  // ── Form 8880: Retirement Savings Contributions Credit ─
  const normalizedForm8880Input = mergeW2RetirementContributionsIntoForm8880Input(
    input.form8880,
    input.w2s,
    filingStatus
  );
  const form8880 = normalizedForm8880Input
    ? calculateForm8880({
      filingStatus,
      agi,
      taxYear: year,
      primaryDateOfBirth: input.taxpayer.primary.dateOfBirth,
      spouseDateOfBirth: input.taxpayer.spouse?.dateOfBirth,
      ...normalizedForm8880Input,
      taxLiabilityBeforeCredit: taxBeforeCredits,
      priorNonrefundableCredits: sum(foreignTaxCredit, dependentCareCredit, elderlyOrDisabledCredit, educationNonrefundable),
    })
    : undefined;
  const retirementSavingsCredit = form8880?.line12 ?? new Decimal(0);
  if (form8880) {
    audit.merge(form8880.lines);
  }

  const improvementTaxLiabilityLimit = zeroFloor(taxBeforeCredits.minus(sum(
    foreignTaxCredit, dependentCareCredit, elderlyOrDisabledCredit, educationNonrefundable, retirementSavingsCredit)));
  // Preliminary energy calculation determines the independent improvement credit
  // and available clean-energy amount; only final calculated lines are emitted.
  const preliminaryEnergy = calculateForm5695(input.energyCredits, {
    taxYear: year, taxLiabilityLimit: new Decimal(0), improvementTaxLiabilityLimit,
  });
  const vehicleTaxLiabilityLimit = zeroFloor(improvementTaxLiabilityLimit.minus(preliminaryEnergy.energyImprovementCredit));
  const form8936 = calculateVehicles(vehicleTaxLiabilityLimit, taxBeforeCredits);
  if (form8936?.requiresTransferReconciliation) throw new Error("Actual vehicle transfer reconciliation facts are required");
  if (form8936?.requiresForm3800) throw new Error("Business clean-vehicle credit requires supported Form 3800 attribution");
  if (form8936) audit.merge(form8936.lines);

  // ── Form 8812: Child Tax Credit (nonrefundable + refundable ACTC) ──
  const {qualifyingChildren, otherDependents} = calculateChildCreditEligibility(input);
  let childCreditPuertoRico = input.childTaxCredit?.puertoRicoExcludedIncome === undefined ? undefined : d(input.childTaxCredit.puertoRicoExcludedIncome);
  let childCreditForm4563 = input.childTaxCredit?.form4563ExcludedIncome === undefined ? undefined : d(input.childTaxCredit.form4563ExcludedIncome);
  let childCreditPossessionTotal = input.childTaxCredit?.possessionIncomeExclusion === undefined ? undefined : d(input.childTaxCredit.possessionIncomeExclusion);
  if (childCreditPuertoRico !== undefined && childCreditForm4563 !== undefined) {
    const componentTotal = childCreditPuertoRico.plus(childCreditForm4563);
    if (childCreditPossessionTotal !== undefined && !childCreditPossessionTotal.eq(componentTotal)) throw new Error("Child-credit possession amounts do not reconcile");
    childCreditPossessionTotal = componentTotal;
  }
  if (childCreditPossessionTotal?.isZero()) {
    if (childCreditPuertoRico?.gt(0) || childCreditForm4563?.gt(0)) throw new Error("Child-credit possession amounts do not reconcile");
    childCreditPuertoRico = new Decimal(0);
    childCreditForm4563 = new Decimal(0);
  }
  if (year === 2026 && qualifyingChildren + otherDependents > 0) {
    if (childCreditPossessionTotal === undefined) throw new Error("2026 child-credit possession-income exclusion is unknown");
    if (childCreditPuertoRico === undefined || childCreditForm4563 === undefined) throw new Error("2026 child-credit possession source split is unknown");
  }
  if (year === 2026 && qualifyingChildren > 0 && input.childTaxCredit?.bonaFidePuertoRicoResident === undefined) {
    throw new Error("2026 child-credit Puerto Rico residency is unknown");
  }
  const calculateChildCredit = (taxLiability: Decimal) => calculateForm8812({
    taxYear: year,
    filesForm2555: form2555 !== undefined,
    bonaFidePuertoRicoResident: input.childTaxCredit?.bonaFidePuertoRicoResident,
    payrollTaxes: sum(...input.w2s.map(w2 => d(w2.socialSecurityWithheld).plus(d(w2.medicareWithheld))))
      .plus(form8959.lines.find(line => line.line === "7")?.value ?? new Decimal(0))
      .minus(form8959.withholdingCredit)
      .plus((form8959.lines.find(line => line.line === "13")?.value ?? new Decimal(0)).div(2)),
    additionalPayrollTaxes: sum(schedSE.deductibleHalf, form4137?.line13 ?? new Decimal(0), form8919?.line13 ?? new Decimal(0)),
    earnedIncomeCredit: eic,
    excessSocialSecurityWithholding: excessSSWithholding,
    qualifyingChildren,
    otherDependents,
    adjustedGrossIncome: agi,
    puertoRicoExcludedIncome: childCreditPuertoRico,
    form4563ExcludedIncome: childCreditForm4563,
    foreignExcludedIncome: form2555IncomeReduction.plus(form2555HousingDeduction),
    agi: sum(agi, form2555IncomeReduction, form2555HousingDeduction, childCreditPossessionTotal ?? new Decimal(0)),
    // Per IRC §32(c)(2)(A)(i)(II) → §24(d)(1)(B)(i): earned income =
    // wages + net SE earnings - deductible half of SE tax (§164(f)).
    // IRS Form 8812 Lines 18a-18f: 18a(wages) + 18c(Sched C/F) - 18e(deductible half).
    // SE losses reduce earned income — no zero-floor on SE component.
    earnedIncome: sum(totalWages, netSEEarnings, d(input.childTaxCredit?.nonTaxableCombatPayElection)).minus(schedSE.deductibleHalf),
    taxLiability,
    filingStatus,
  }, constants);

  const potentialChildCredit = calculateChildCredit(new Decimal(0));
  const preliminaryAdoption = calculateAdoption(agi, new Decimal(0));
  const earlierPersonalCredits = sum(foreignTaxCredit, dependentCareCredit, elderlyOrDisabledCredit,
    educationNonrefundable, retirementSavingsCredit, preliminaryEnergy.energyImprovementCredit,
    form8936?.totalNewVehicleCredit ?? new Decimal(0), form8936?.totalPreviouslyOwnedCredit ?? new Decimal(0));
  const personalCreditLimits = calculatePersonalCreditOrdering({
    taxBeforeCredits, earlierCredits: earlierPersonalCredits,
    ctcBeforeLimitation: potentialChildCredit.ctcBeforeLimitation, potentialActc: potentialChildCredit.potentialActc,
    qualifyingChildren, filesForm2555: form2555 !== undefined,
    adoptionAvailable: preliminaryAdoption?.nonrefundableCreditAvailable ?? new Decimal(0),
    cleanEnergyAvailable: preliminaryEnergy.residentialCleanEnergyCreditBeforeLimit,
  });
  const form8839 = calculateAdoption(agi, personalCreditLimits.adoptionTaxLiability);
  if (form8839) audit.merge(form8839.lines);
  const adoptionCredit = form8839?.nonrefundableAdoptionCredit ?? new Decimal(0);
  const refundableAdoptionCredit = form8839?.refundableAdoptionCredit ?? new Decimal(0);
  const form5695 = calculateForm5695(input.energyCredits, {
    taxYear: year, taxLiabilityLimit: personalCreditLimits.cleanEnergyTaxLiability, improvementTaxLiabilityLimit,
  });
  audit.merge(form5695.lines);
  const form8812 = calculateChildCredit(personalCreditLimits.ctcTaxLiability);
  audit.merge(form8812.lines);
  const childTaxCredit = form8812.nonrefundableCTC;
  audit.record("1040", "19", "Child tax credit / ODC", childTaxCredit,
    `Nonrefundable CTC: ${childTaxCredit} (${qualifyingChildren} children, ${otherDependents} other dependents)`);


  const otherCredits = sum(earlierPersonalCredits, adoptionCredit, form5695.residentialCleanEnergyCredit);

  // ── Form 3800: General Business Credit ──────────────────
  // Computed after CTC so the limitation can use CTC + other personal credits.
  // K-1 Box 15 credits and form3800 input are the sources.
  const hasK1Box15Credits = input.scheduleK1.some((k1) =>
    d(k1.lowIncomeHousingCredit42j5).greaterThan(0) ||
    d(k1.lowIncomeHousingCreditOther).greaterThan(0) ||
    d(k1.qualifiedRehabilitationExpenditures).greaterThan(0) ||
    d(k1.otherRentalRealEstateCredits).greaterThan(0) ||
    d(k1.otherRentalCredits).greaterThan(0) ||
    d(k1.otherCredits).greaterThan(0)
  );
  const hasForm3800Input = input.form3800 !== undefined && (
    d(input.form3800.currentYearCredits).greaterThan(0) ||
    d(input.form3800.passiveActivityCredits).greaterThan(0) ||
    d(input.form3800.carryforward).greaterThan(0)
  );
  const hasGBCCarryforward = d(input.priorYear?.generalBusinessCreditCarryforward).greaterThan(0);

  let form3800: ReturnType<typeof calculateForm3800> | undefined;
  let generalBusinessCredit = new Decimal(0);
  if (hasK1Box15Credits || hasForm3800Input || hasGBCCarryforward) {
    // Carryforward from priorYear overrides form3800.carryforward if both provided
    const gbcCarryforward = hasGBCCarryforward
      ? d(input.priorYear?.generalBusinessCreditCarryforward)
      : d(input.form3800?.carryforward);

    form3800 = calculateForm3800({
      filingStatus,
      scheduleK1s: input.scheduleK1,
      currentYearCredits: d(input.form3800?.currentYearCredits),
      passiveActivityCredits: d(input.form3800?.passiveActivityCredits),
      carryforward: gbcCarryforward,
      regularTax: incomeTax,
      amt: form6251.amt,
      tentativeMinimumTax: form6251.tentativeMinimumTax,
      childTaxCredit,
      otherNonrefundableCredits: otherCredits,
    });
    generalBusinessCredit = form3800.allowableCredit;
    audit.merge(form3800.lines);
  }

  let priorYearMinimumTaxCredit = new Decimal(0);
  let form8801: ReturnType<typeof calculateForm8801> | undefined;
  if (input.form8801) {
    form8801 = calculateForm8801({
      priorYearFilingStatus: input.form8801.priorYearFilingStatus,
      priorYearTaxableIncome: d(input.form8801.priorYearTaxableIncome),
      priorYearExclusionItemAdjustments: d(input.form8801.priorYearExclusionItemAdjustments),
      priorYearAMT: d(input.form8801.priorYearAMT),
      priorYearRegularTax: d(input.form8801.priorYearRegularTax),
      unusedMinimumTaxCreditCarryforward: d(input.form8801.unusedMinimumTaxCreditCarryforward),
      currentYearRegularTaxBeforeCredits: zeroFloor(incomeTax.plus(partIAdditions).minus(sum(childTaxCredit,otherCredits,generalBusinessCredit))),
      currentYearTMT: form6251.tentativeMinimumTax,
    });
    priorYearMinimumTaxCredit = form8801.creditAllowed;
    audit.merge(form8801.lines);
  }
  const sched3 = calculateSchedule3(input, {
    foreignTaxCredit, childDependentCareCredit: dependentCareCredit, educationCredits: educationNonrefundable,
    retirementSavingsCredit, residentialCleanEnergyCredit: form5695.residentialCleanEnergyCredit,
    energyImprovementCredit: form5695.energyImprovementCredit, priorYearMinimumTaxCredit, generalBusinessCredit,
    adoptionCredit, elderlyOrDisabledCredit, newCleanVehicleCredit: form8936?.totalNewVehicleCredit,
    previouslyOwnedCleanVehicleCredit: form8936?.totalPreviouslyOwnedCredit, netPremiumTaxCredit,
    excessSocialSecurityWithholding: excessSSWithholding,
  });
  audit.merge(sched3.lines);
  const totalOtherCredits = sched3.totalNonrefundableCredits;
  audit.record("1040", "20", "Schedule 3 nonrefundable credits", totalOtherCredits, "Schedule 3 line 8");

  const totalCredits = childTaxCredit.plus(totalOtherCredits);
  audit.record("1040", "21", "Total credits", totalCredits, "Line 19 + Line 20");
  // Line 22 = max(0, Line 18 - Line 21). Credits reduce the combined base (income tax + AMT + excess APTC).
  const taxAfterCredits = zeroFloor(taxBeforeCredits.minus(totalCredits));
  audit.record("1040", "22", "Tax after credits", taxAfterCredits,
    `max(0, $${taxBeforeCredits} - $${totalCredits})`);

  // ═══════════════════════════════════════════════════════════
  // Phase 5b: Withholding & Estimated Payments (needed by Form 2210)
  // ═══════════════════════════════════════════════════════════

  const withholdingFrom1099 = sum(
    intAgg.federalWithheld,
    divAgg.federalWithheld,
    ...(input.form1099OID ?? []).map((f) => d(f.federalWithheld)),
    form1099R.federalWithholding,
    ...(input.formSSA1099 ?? []).map((f) => d(f.federalWithheld)),
    ...(input.formRRB1099 ?? []).map((f) => d(f.federalWithheld)),
    necAgg.federalWithheld,
    miscAgg.federalWithheld,
    ...(input.form1099G ?? []).map((f) => d(f.federalWithheld)),
    form1099KResult.federalWithholding
  );
  const k1FederalWithholding = [...input.scheduleK1, ...k1Form1041s].map(k1 => d(k1.federalIncomeTaxWithheld));
  if (k1FederalWithholding.some(value => !value.isFinite() || value.lt(0))) throw new Error("K-1 federal withholding must be finite and nonnegative");
  const withholdingFromOtherForms = sum(form8959.withholdingCredit, ...w2gForms.map(f => d(f.federalWithheld)), ...k1FederalWithholding);
  const federalWithholding = sum(w2Agg.federalWithheld, withholdingFrom1099, withholdingFromOtherForms);
  audit.record("1040", "25a", "Federal withholding from Forms W-2", w2Agg.federalWithheld, "Sum W-2 box 2");
  audit.record("1040", "25b", "Federal withholding from Forms 1099", withholdingFrom1099, "Forms 1099 including Form 1099-K, SSA-1099 and RRB-1099");
  audit.record("1040", "25c", "Federal withholding from other forms", withholdingFromOtherForms, "W-2G, reported K-1 federal withholding and Form 8959 line 24");
  audit.record(
    "1040",
    "25d",
    "Federal tax withheld",
    federalWithholding,
    "Lines 25a + 25b + 25c"
  );

  const priorReturnAppliedPayments = (input.adjustments?.priorYearAppliedCredits ?? []).filter(payment => payment.type === "federal");
  if (priorReturnAppliedPayments.some(payment => payment.sourceTaxYear !== year - 1)) {
    throw new Error("Federal prior-return applied credit has an invalid source year");
  }
  const currentEstimatedPayments = input.adjustments?.estimatedTaxPayments
    ?.filter((p) => p.type === "federal")
    .reduce((acc, p) => acc.plus(d(p.amount)), new Decimal(0)) ?? new Decimal(0);
  const estimatedPayments = currentEstimatedPayments.plus(sum(...priorReturnAppliedPayments.map(payment => d(payment.amount))));
  audit.record("1040", "26", "Estimated tax payments and prior-year applied credit", estimatedPayments, "Actual federal estimates + prior return overpayment applied to this return");

  // ═══════════════════════════════════════════════════════════
  // Phase 6: Additional Taxes — Schedule 2 Part II (Form 1040 Line 23)
  // AMT and excess APTC are in Schedule 2 Part I (already included in
  // taxBeforeCredits / Line 18, computed in Phase 4b).
  // ═══════════════════════════════════════════════════════════

  const selfEmploymentTax = schedSE.totalSETax;
  audit.record("Sched SE", "12", "Self-employment tax", selfEmploymentTax, "SS portion + Medicare portion");

  // ── Form 8960: Net Investment Income Tax ──────────────
  // Per IRS Form 8960 instructions, allowed passive losses (after Form 8582)
  // reduce NII. Suspended losses do NOT reduce NII.
  // Formula: netPassive + netRental + suspendedLoss = net allowed passive income.
  // netPassive/netRental include ALL losses; adding back suspendedLoss removes
  // the disallowed portion, leaving only allowed losses to reduce NII.
  const netAllowedPassive = sum(
    form8582.netPassive, form8582.netRental, form8582.suspendedLoss
  );
  const form8960 = calculateForm8960(
    {
      taxableInterest: totalTaxableInterest,
      ordinaryDividends: totalDividends,
      // Per IRS Form 8960 Instructions, Line 4b: "This amount is generally the
      // sum of Schedule D, line 7 and Schedule D, line 15. However, if either
      // amount is a loss, enter only the gain, if any."
      // Each category (ST/LT) is independently zero-floored before summing.
      // This prevents cross-category netting for NII purposes.
      netCapitalGain: zeroFloor(schedD.netShortTerm).plus(zeroFloor(schedD.netLongTerm)),
      otherInvestmentIncome: netAllowedPassive,
      magi: agi,
    },
    filingStatus,
    constants
  );
  const niitTax = form8960.niitTax;
  audit.merge(form8960.lines);

  const form5329 = normalizedForm5329 ? calculateForm5329(normalizedForm5329) : undefined;
  if (form5329) {
    audit.merge(form5329.lines);
  }
  const retirementPlanAdditionalTax = (form5329?.totalAdditionalTax ?? new Decimal(0))
    .plus(form1099Q?.netPenalty ?? new Decimal(0));

  // ── Form 2210: Estimated Tax Penalty ──────────────────
  // currentYearTax = 1040 Line 24 minus estimated tax penalty (excluded to avoid circularity).
  // taxAfterCredits already includes AMT + excess APTC (they're in Line 18 which credits reduce).
  // Line 24 = Line 22 (taxAfterCredits) + Schedule 2 Part II (SE + Medicare + NIIT).
  const form2210 = calculateForm2210({
    currentYearTax: taxAfterCredits.plus(sum(
      selfEmploymentTax,
      retirementPlanAdditionalTax,
      form8919?.line13 ?? new Decimal(0),
      additionalMedicareTax,
      niitTax,
      sched1.hsaAdditionalTax,
      sched1.hsaRecaptureTax
    )),
    withholding: federalWithholding.plus(excessSSWithholding),
    estimatedPayments,
    refundableCredits: sum(educationRefundable, refundableAdoptionCredit, netPremiumTaxCredit, form8812.actc, eic),
    priorYearTax: input.priorYear?.priorYearTax ? d(input.priorYear.priorYearTax) : undefined,
    priorYearAGI: input.priorYear?.priorYearAGI ? d(input.priorYear.priorYearAGI) : undefined,
    filingStatus,
  });
  audit.merge(form2210.lines);
  const estimatedTaxPenalty = form2210.penalty;

  // ── Schedule H: Household Employment Taxes ──────────
  const scheduleH = input.scheduleH
    ? calculateScheduleH({
        employees: input.scheduleH.employees.map((emp) => ({
          name: emp.name,
          cashWages: emp.cashWages,
          isSpouse: emp.isSpouse,
          isChildUnder21: emp.isChildUnder21,
          isParent: emp.isParent,
          parentCareExceptionApplies: emp.parentCareExceptionApplies,
          isUnder18NonPrincipal: emp.isUnder18NonPrincipal,
          federalIncomeTaxWithheld: emp.federalIncomeTaxWithheld,
        })),
        taxYear: year,
        futaApplies: input.scheduleH.futaApplies,
        futaSectionA: input.scheduleH.futaSectionA,
        stateUnemploymentContributions: input.scheduleH.stateUnemploymentContributions,
        futaStatePeriods: input.scheduleH.futaStatePeriods,
        stateUnemploymentContributionsPaidLate: input.scheduleH.stateUnemploymentContributionsPaidLate,
        futaCreditReduction: input.scheduleH.futaCreditReduction,
        constants: constants.householdEmployment,
      })
    : undefined;
  if (scheduleH) {
    audit.merge(scheduleH.lines);
  }

  // ── Schedule 2: Aggregate Additional Taxes ───────────
  const sched2 = calculateSchedule2({
    amt,
    excessAPTCRepayment,
    newVehicleTransferRepayment,
    usedVehicleTransferRepayment,
    selfEmploymentTax,
    unreportedSSTax: form4137?.line13,
    form8919Tax: form8919?.line13,
    penaltyTax: retirementPlanAdditionalTax,
    householdEmploymentTax: scheduleH?.totalTax,
    additionalMedicareTax,
    niitTax,
    hsaAdditionalTax: sched1.hsaAdditionalTax,
    hsaRecaptureTax: sched1.hsaRecaptureTax,
    estimatedTaxPenalty,
  });
  audit.merge(sched2.lines);

  // Line 23: Only Schedule 2 Part II; estimated-tax penalty belongs on line 38.
  // AMT and excess APTC (Part I) are already included in Line 17 → Line 18.
  const totalAdditionalTaxes = sched2.partIITotal;
  audit.record("1040", "23", "Other taxes", totalAdditionalTaxes, "Schedule 2 Part II only");

  // ═══════════════════════════════════════════════════════════
  // Phase 7: Total Tax (Form 1040 Line 24)
  // Line 24 = Line 22 (taxAfterCredits) + Line 23 (Schedule 2 Part II)
  // ═══════════════════════════════════════════════════════════

  const totalTax = taxAfterCredits.plus(totalAdditionalTaxes);
  audit.record("1040", "24", "Total tax", totalTax,
    `Line 22 $${taxAfterCredits} + Line 23 $${totalAdditionalTaxes}`);

  // ═══════════════════════════════════════════════════════════
  // Phase 8: Payments (Form 1040 Lines 25-33)
  // ═══════════════════════════════════════════════════════════

  // Line 27a: Earned Income Credit (computed earlier, before Form 2210)
  audit.record("1040", "27a", "Earned Income Credit", eic,
    `${qualifyingEicChildren} qualifying child(ren), earned $${eicEarnedIncome}`);

  // Line 28: Additional Child Tax Credit (refundable)
  const actc = form8812.actc;
  audit.record("1040", "28", "Additional Child Tax Credit", actc,
    "Form 8812 Line 27 (refundable ACTC)");

  audit.record("1040", "29", "Refundable American opportunity credit", educationRefundable, "Form 8863 line 8");
  audit.record("1040", "30", "Refundable adoption credit", refundableAdoptionCredit, "Form 8839 line 13; subject to applicable public-benefit limitations");
  audit.record("1040", "31", "Schedule 3 refundable credits and other payments", sched3.totalRefundableCredits,
    "Schedule 3 line 15; excludes American opportunity credit");
  const refundableCredits = sum(educationRefundable, refundableAdoptionCredit, sched3.totalRefundableCredits);

  const totalPayments = sum(federalWithholding, estimatedPayments, eic, actc, refundableCredits);
  audit.record("1040", "33", "Total payments", totalPayments, "Withholding + estimated + EIC + ACTC + refundable credits");

  // ═══════════════════════════════════════════════════════════
  // Phase 9: Refund or Amount Owed
  // ═══════════════════════════════════════════════════════════

  const difference = totalPayments.minus(totalTax);
  const overpayment = zeroFloor(difference);
  const refund = zeroFloor(difference.minus(estimatedTaxPenalty));
  const amountOwed = zeroFloor(difference.negated().plus(estimatedTaxPenalty));

  audit.record("1040", "34", "Overpayment before estimated-tax penalty", overpayment, "max(0, total payments - total tax)");
  audit.record("1040", "35a", "Refund after estimated-tax penalty", refund, "max(0, total payments - total tax - line 38 penalty)");
  audit.record("1040", "37", "Amount you owe", amountOwed, "max(0, total tax - total payments + line 38 penalty)");
  audit.record("1040", "38", "Estimated-tax penalty", estimatedTaxPenalty, "Form 2210; excluded from total tax");

  // ── Form 1040 Digital Asset Question ──────────
  // "At any time during 2025, did you: (a) receive (as a reward, award, or
  // payment for property or services); or (b) sell, exchange, gift, or otherwise
  // dispose of a digital asset?"
  const digitalAssetQuestion =
    form1099DAForms.length > 0
    || input.form1099B.some((f) => f.transactions.some((t) => t.digitalAsset))
    || tokenSwaps.length > 0
    || lpPositions.length > 0
    || yieldRewards.length > 0
    || nftTransactions.length > 0
    || lendingIncome.length > 0
    || liquidations.length > 0
    || cryptoDonations.length > 0
    || (cryptoInput !== undefined && (
      (cryptoInput.miningIncome ?? []).length > 0
      || (cryptoInput.stakingIncome ?? []).length > 0
      || (cryptoInput.airdropIncome ?? []).length > 0
    ));
  audit.record("1040", "digital-asset", "Digital asset question", new Decimal(digitalAssetQuestion ? 1 : 0),
    digitalAssetQuestion
      ? "Yes — taxpayer received, sold, exchanged, or disposed of digital assets"
      : "No digital asset activity reported");

  const baseResult: TaxReturnResult = {
    taxYear: year,
    filingStatus,
    digitalAssetQuestion,

    totalWages,
    totalInterest: totalTaxableInterest,
    taxExemptInterest,
    totalDividends,
    qualifiedDividends,
    iraDistributionsGross: iraGrossReported,
    iraDistributionsTaxable: iraTaxable,
    pensionDistributionsGross: form1099R.pensionGrossReported,
    pensionDistributionsTaxable: pensionTaxable,
    socialSecurityBenefitsGross,
    socialSecurityBenefitsTaxable,
    capitalGainLoss,
    otherIncome: otherIncome.minus(nolDeduction),
    nolDeduction,
    totalIncome: totalIncome.minus(nolDeduction),

    adjustmentsToIncome: adjustments,
    agi,

    standardDeduction,
    standardDeductionWorksheet,
    itemizedDeductions,
    ...(year === 2026 ? { itemizedDeductionReduction } : {}),
    deductionUsed,
    deductionAmount,
    taxableIncome,

    ordinaryTax,
    capitalGainsTax: preferentialTax,
    totalTaxBeforeCredits: incomeTax,

    childTaxCredit,
    foreignTaxCredit,
    otherCredits: totalOtherCredits,
    totalCredits,

    earnedIncomeCredit: eic,

    amt,
    selfEmploymentTax,
    additionalMedicareTax,
    niitTax,
    estimatedTaxPenalty,
    totalAdditionalTaxes,

    totalTax,
    totalPayments,
    totalWithholding: federalWithholding,
    estimatedTaxPayments: estimatedPayments,
    amountOwed,
    refund,

    carryforwards: (() => {
      // ── Form 982: Reduce tax attributes when COD income is excluded ──
      const form1099CForms = input.form1099C ?? [];
      const codExclusion = input.codExclusion;
      const form1099CResult = form1099CForms.length > 0
        ? calculateForm1099C(form1099CForms, codExclusion, filingStatus, constants)
        : undefined;
      const hasCodExclusions = form1099CResult && form1099CResult.totalExclusions.greaterThan(0);

      // Pre-reduction carryforward values
      let cfNol = zeroFloor(form461.nolCarryforward.minus(nolDeduction));
      let cfGbc = form3800?.carryforwardToNextYear ?? new Decimal(0);
      let cfMtc = form8801?.carryforwardToNextYear ?? new Decimal(0);
      let cfCapitalLoss = adjustedCarryforward.carryforwardShortTerm.plus(adjustedCarryforward.carryforwardLongTerm);
      const cfPassive = sum(...form8582.activityAllocations.filter((a) => a.suspendedLoss.greaterThan(0)).map((a) => a.suspendedLoss));
      let cfFtc = foreignTaxCreditCarryforward;

      if (hasCodExclusions && codExclusion) {
        form982 = calculateForm982({
          bankruptcyExclusion: form1099CResult.bankruptcyExclusion,
          insolvencyExclusion: form1099CResult.insolvencyExclusion,
          qualifiedPrincipalResidenceExclusion: form1099CResult.qualifiedPrincipalResidenceExclusion,
          qualifiedFarmExclusion: form1099CResult.qualifiedFarmExclusion,
          qualifiedRealPropertyBusinessExclusion: form1099CResult.qualifiedRealPropertyBusinessExclusion,
          electBasisReductionFirst: codExclusion.electBasisReductionFirst ?? false,
          attributes: {
            nolCarryforward: cfNol,
            generalBusinessCreditCarryforward: cfGbc,
            minimumTaxCreditCarryforward: cfMtc,
            capitalLossCarryforward: cfCapitalLoss,
            aggregateBasisOfProperty: d(codExclusion.aggregateBasisOfProperty),
            passiveActivityLossCarryforward: cfPassive,
            foreignTaxCreditCarryforward: cfFtc,
            basisOfDepreciableProperty: d(codExclusion.basisOfDepreciableProperty),
            basisOfPrincipalResidence: d(codExclusion.basisOfPrincipalResidence),
            basisOfDepreciableRealProperty: d(codExclusion.basisOfDepreciableRealProperty),
          },
        });
        audit.merge(form982.lines);
        cfNol = form982.reducedAttributes.nolCarryforward;
        cfGbc = form982.reducedAttributes.generalBusinessCreditCarryforward;
        cfMtc = form982.reducedAttributes.minimumTaxCreditCarryforward;
        cfCapitalLoss = form982.reducedAttributes.capitalLossCarryforward;
        cfFtc = form982.reducedAttributes.foreignTaxCreditCarryforward;
        // Note: passive loss reduction is applied to the aggregate; individual
        // activity allocations are not rebalanced — the aggregate reduction is
        // informational for the carryforward totals.
      }

      return {
        capitalLoss: cfCapitalLoss,
        shortTermCapitalLoss: adjustedCarryforward.carryforwardShortTerm,
        longTermCapitalLoss: adjustedCarryforward.carryforwardLongTerm,
        suspendedPassiveLosses: form8582.activityAllocations
          .filter((a) => a.suspendedLoss.greaterThan(0))
          .map((a) => ({ partnershipName: a.name, amount: a.suspendedLoss })),
        suspendedPTPLosses: form8582.ptpSuspendedLosses
          .filter((p) => p.netSuspended.greaterThan(0))
          .map((p) => ({ partnershipName: p.name, amount: p.netSuspended })),
        foreignTaxCreditCarryforward: cfFtc,
        foreignTaxCreditCarryforwardByCategory,
        qbiLossCarryforward: form8995Result?.qbiLossCarryforward ?? form8995AResult?.qbiLossCarryforward ?? new Decimal(0),
        investmentInterestExpense: form4952?.disallowedCarryforward ?? new Decimal(0),
        minimumTaxCredit: cfMtc,
        charitableContributions: schedA?.charitableCarryforward ?? new Decimal(0),
        charitableContributionsByYear: schedA?.charitableCarryforwardByYear ?? [],
        excessBusinessLossNOL: form461.nolCarryforward,
        nolCarryforward: cfNol,
        generalBusinessCredit: cfGbc,
        suspendedBusinessInterest: section163jCarryforward,
        partnerBasis: schedE.partnerships
          .filter((p) => p.basisResult !== undefined)
          .map((p) => ({
            partnershipName: p.name,
            partnershipEIN: p.ein,
            entityType: p.basisResult!.entityType,
            endingBasis: p.basisResult!.endingBasis,
            excessDistributionGain: p.basisResult!.excessDistributionGain,
            suspendedLosses: Object.fromEntries(
              p.basisResult!.lossCategories
                .filter((c) => c.suspended.greaterThan(0))
                .map((c) => [c.key, c.suspended])
            ),
          })),
        cryptoWashSaleDisallowed: washSaleCarryforward?.totalDisallowedLoss ?? new Decimal(0),
        disasterDistributionDeferrals: form8915FResult?.carryforwardDeferrals ?? [],
        excessContributions: {
          traditionalIRA: form5329?.line16 ?? new Decimal(0),
          rothIRA: form5329?.line24 ?? new Decimal(0),
          coverdellESA: form5329?.line32 ?? new Decimal(0),
          archerMSA: form5329?.line40 ?? new Decimal(0),
          hsa: form5329?.line48 ?? new Decimal(0),
          // ABLE section: total excess = max(0, Line 50 - Line 51) + Line 52
          able: form5329
            ? Decimal.max(new Decimal(0), form5329.line50.minus(form5329.line51)).plus(form5329.line52)
            : new Decimal(0),
        },
      };
    })(),

    // Sub-results
    scheduleA: schedA,
    schedule1: nolDeduction.greaterThan(0)
      ? { ...sched1, nolDeduction, totalAdditionalIncome: sched1.totalAdditionalIncome.minus(nolDeduction) }
      : sched1,
    scheduleB: schedB,
    scheduleC: schedC,
    scheduleD: schedD,
    scheduleF: schedF,
    scheduleE: schedE,
    scheduleSE: schedSE,
    form6251,
    form8582,
    form1099R,
    form2441,
    form1099SA,
    form4137,
    form8919,
    form4797,
    form5329,
    form8880,
    form8606,
    form8606ByOwner: form8606ByOwnerResults,
    form8889: sched1.form8889,
    form8889ByOwner: sched1.form8889ByOwner,
    seHealthInsuranceWorksheet: seHealthInsuranceWorksheetResult,
    socialSecurityBenefitsWorksheet,
    iraDeductionWorksheet: iraDeductionWorksheetResult,
    form8959,
    form8962,
    form8960,
    form982,
    form8824,
    form2210,
    form8815,
    form8812,
    form8863,
    schedule1A,
    nonitemizerCharitableDeduction,
    form8995: form8995Result,
    form8995A: form8995AResult,
    form8936,
    form8801,
    form4684,
    form4952,
    scheduleH,
    schedule2: sched2,
    schedule3: sched3,
    scheduleR,
    scheduleEIC,
    form2555,
    form8615: form8615Result,
    form8814,
    form8839,
    form5695,
    form461,
    scheduleJ: scheduleJResult,
    form3800,
    form1099Q,
    form1099K: form1099KResult.numberOfForms > 0 ? form1099KResult : undefined,
    form8915F: form8915FResult,
    form1098ESummary: form1098EResult,
    taxableRefundWorksheet: taxableRefundWorksheetResult,
    salesTaxDeduction: salesTaxResult,
    scheduleK1Form1041Summary: k1Form1041Summary,

    // Crypto / DeFi Phase 2 sub-results
    cryptoDeFiSwaps: defiSwapResult,
    cryptoLPPositions: lpResult,
    cryptoYieldRewards: yieldResult,
    cryptoNFT: nftResult,
    cryptoLending: lendingResult,
    cryptoLiquidations: liquidationResult,
    cryptoDonations: donationResult,
    cryptoWashSaleCarryforward: washSaleCarryforward,

    allLines: audit.getLines(),
  };

  const illinoisInput = input.stateReturns?.illinois;
  if (!illinoisInput) {
    return baseResult;
  }

  return {
    ...baseResult,
    stateReturns: {
      illinois: calculateIllinoisReturn(
        baseResult,
        normalizeIllinoisStateInput(illinoisInput, input),
      ),
    },
  };
}

function normalizeIllinoisStateInput(input: IllinoisStateReturnInput, taxInput: TaxYearInput): ILStateInput {
  const explicitIllinoisWithholding = d(input.ilWithholding);
  const derivedIllinoisScheduleILWITRecords =
    input.scheduleILWIT === undefined && explicitIllinoisWithholding.isZero()
      ? deriveIllinoisScheduleILWITRecordsFromInput(taxInput)
      : undefined;
  const derivedIllinoisWithholding = deriveIllinoisWithholdingFromInput(taxInput);
  const effectiveIllinoisWithholding =
    input.scheduleILWIT === undefined && explicitIllinoisWithholding.isZero()
      ? derivedIllinoisWithholding
      : explicitIllinoisWithholding;
  const normalizeDualColumnAmount = (amount: { columnA: string; columnB: string }) => ({
    columnA: d(amount.columnA),
    columnB: d(amount.columnB),
  });

  return {
    claimedAsDependent: input.claimedAsDependent,
    spouseClaimedAsDependent: input.spouseClaimedAsDependent,
    age65OrOlderCount: input.age65OrOlderCount,
    blindCount: input.blindCount,
    dependentCount: input.dependentCount,
    hasChildUnder12: input.hasChildUnder12,
    ilRefundSubtraction: d(input.ilRefundSubtraction),
    additionalRetirementIncome: d(input.additionalRetirementIncome),
    k1RetirementPaymentsSubtraction: d(input.k1RetirementPaymentsSubtraction),
    illinoisExemptTaxExemptInterest: d(input.illinoisExemptTaxExemptInterest),
    investmentCreditRecapture: d(input.investmentCreditRecapture),
    schedule1299CCredit: d(input.schedule1299CCredit),
    schedule1299C: input.schedule1299C ? {
      taxYear: input.schedule1299C.taxYear,
      credits: input.schedule1299C.credits.map((credit) => ({
        yearsLeftToCarry: credit.yearsLeftToCarry,
        carryforwardPeriodYears: credit.carryforwardPeriodYears,
        creditCode: credit.creditCode,
        creditYearEnding: credit.creditYearEnding,
        identifyingNumber: credit.identifyingNumber,
        creditEarnedOrCarried: d(credit.creditEarnedOrCarried),
        distributiveShareOrTransfer: d(credit.distributiveShareOrTransfer),
      })),
    } : undefined,
    scheduleM: input.scheduleM ? {
      taxYear: input.scheduleM.taxYear,
      filingStatus: input.scheduleM.filingStatus,
      recapture529OutOfStateDetail: input.scheduleM.recapture529OutOfStateDetail ? {
        priorDeductionsClaimed: d(input.scheduleM.recapture529OutOfStateDetail.priorDeductionsClaimed),
        priorYearRecaptures: d(input.scheduleM.recapture529OutOfStateDetail.priorYearRecaptures),
        transferAmount: d(input.scheduleM.recapture529OutOfStateDetail.transferAmount),
      } : undefined,
      recapture529NonqualifiedDetail: input.scheduleM.recapture529NonqualifiedDetail ? {
        priorDeductionsClaimed: d(input.scheduleM.recapture529NonqualifiedDetail.priorDeductionsClaimed),
        priorYearRecaptures: d(input.scheduleM.recapture529NonqualifiedDetail.priorYearRecaptures),
        withdrawalAmount: d(input.scheduleM.recapture529NonqualifiedDetail.withdrawalAmount),
      } : undefined,
      childTaxExemptInterest: d(input.scheduleM.childTaxExemptInterest),
      distributiveShareAdditions: d(input.scheduleM.distributiveShareAdditions),
      lloydsLoss: d(input.scheduleM.lloydsLoss),
      nonIL529Earnings: d(input.scheduleM.nonIL529Earnings),
      ilDepreciationAddition: d(input.scheduleM.ilDepreciationAddition),
      recapture529OutOfState: d(input.scheduleM.recapture529OutOfState),
      recapture529Nonqualified: d(input.scheduleM.recapture529Nonqualified),
      studentAssistanceCreditRecapture: d(input.scheduleM.studentAssistanceCreditRecapture),
      otherAdditions: d(input.scheduleM.otherAdditions),
      il529Contributions: d(input.scheduleM.il529Contributions),
      distributiveShareSubtractions: d(input.scheduleM.distributiveShareSubtractions),
      restorationClaimOfRight: d(input.scheduleM.restorationClaimOfRight),
      jobTrainingContributions: d(input.scheduleM.jobTrainingContributions),
      federalCreditRelatedExpenses: d(input.scheduleM.federalCreditRelatedExpenses),
      medicalDebtRelief: d(input.scheduleM.medicalDebtRelief),
      ilDepreciationSubtraction: d(input.scheduleM.ilDepreciationSubtraction),
      ableContributions: d(input.scheduleM.ableContributions),
      militaryPay: d(input.scheduleM.militaryPay),
      usGovernmentInterest: d(input.scheduleM.usGovernmentInterest),
      recoveryOfItemsDeducted: d(input.scheduleM.recoveryOfItemsDeducted),
      ridesharing: d(input.scheduleM.ridesharing),
      lifeInsurancePayment: d(input.scheduleM.lifeInsurancePayment),
      lloydsIncome: d(input.scheduleM.lloydsIncome),
      funeralTrustIncome: d(input.scheduleM.funeralTrustIncome),
      healthCareProviderLoanRepayment: d(input.scheduleM.healthCareProviderLoanRepayment),
      naziPersecutionReparations: d(input.scheduleM.naziPersecutionReparations),
      ilBondInterest: d(input.scheduleM.ilBondInterest),
      nonUSGovernmentBondInterest: d(input.scheduleM.nonUSGovernmentBondInterest),
      childUSGovernmentInterest: d(input.scheduleM.childUSGovernmentInterest),
      railroadIncome: d(input.scheduleM.railroadIncome),
      unjustImprisonmentCompensation: d(input.scheduleM.unjustImprisonmentCompensation),
      plan529DistributionsForCredits: d(input.scheduleM.plan529DistributionsForCredits),
      cannabisDisallowedDeductions: d(input.scheduleM.cannabisDisallowedDeductions),
      fertilityFraudAward: d(input.scheduleM.fertilityFraudAward),
    } : undefined,
    scheduleICR: input.scheduleICR ? {
      taxYear: input.scheduleICR.taxYear,
      residencyType: input.scheduleICR.residencyType,
      propertyTaxPaid: d(input.scheduleICR.propertyTaxPaid),
      propertyTaxProperties: input.scheduleICR.propertyTaxProperties.map((property) => ({
        county: property.county,
        propertyNumber: property.propertyNumber,
      })),
      propertyTaxBusinessDeduction: d(input.scheduleICR.propertyTaxBusinessDeduction),
      propertyTaxCreditClaimedOnOtherReturns: d(input.scheduleICR.propertyTaxCreditClaimedOnOtherReturns),
      k12EducationExpenses: d(input.scheduleICR.k12EducationExpenses),
      k12EducationExpenseWorksheet: input.scheduleICR.k12EducationExpenseWorksheet ? {
        taxYear: input.scheduleICR.k12EducationExpenseWorksheet.taxYear,
        students: input.scheduleICR.k12EducationExpenseWorksheet.students.map((student) => ({
          studentName: student.studentName,
          studentSSN: student.studentSSN,
          grade: student.grade,
          schoolName: student.schoolName,
          schoolCity: student.schoolCity,
          schoolType: student.schoolType,
          tuitionBookLabFees: d(student.tuitionBookLabFees),
        })),
      } : undefined,
      educationCreditClaimedOnOtherReturns: d(input.scheduleICR.educationCreditClaimedOnOtherReturns),
      volunteerEmergencyWorkerCount: input.scheduleICR.volunteerEmergencyWorkerCount,
      volunteerEmergencyWorkerCertificateNumbers: input.scheduleICR.volunteerEmergencyWorkerCertificateNumbers,
    } : undefined,
    scheduleG: input.scheduleG ? {
      taxYear: input.scheduleG.taxYear,
      wildlifePreservationFund: d(input.scheduleG.wildlifePreservationFund),
      alzheimersFund: d(input.scheduleG.alzheimersFund),
      assistanceToHomelessFund: d(input.scheduleG.assistanceToHomelessFund),
      diabetesResearchFund: d(input.scheduleG.diabetesResearchFund),
      hungerReliefFund: d(input.scheduleG.hungerReliefFund),
      ronaldMcDonaldHouseCharitiesFund: d(input.scheduleG.ronaldMcDonaldHouseCharitiesFund),
    } : undefined,
    scheduleCR: input.scheduleCR ? {
      taxYear: input.scheduleCR.taxYear,
      totalBaseIncome: d(input.scheduleCR.totalBaseIncome),
      nonIllinoisBaseIncome: d(input.scheduleCR.nonIllinoisBaseIncome),
      taxPaidToOtherStates: d(input.scheduleCR.taxPaidToOtherStates),
      taxEntries: input.scheduleCR.taxEntries?.map((entry) => ({
        jurisdiction: entry.jurisdiction,
        taxPaid: d(entry.taxPaid),
        incomeType: entry.incomeType,
        taxingAuthority: entry.taxingAuthority,
        dualResident: entry.dualResident,
      })),
    } : undefined,
    scheduleEEIC: input.scheduleEEIC ? {
      taxYear: input.scheduleEEIC.taxYear,
      dependents: input.scheduleEEIC.dependents.map((dep) => ({
        relationship: dep.relationship,
        isUnder12: dep.isUnder12,
        monthsInHome: dep.monthsInHome,
      })),
      qualifyingChildren: input.scheduleEEIC.qualifyingChildren?.map((child) => ({
        relationship: child.relationship,
        isUnder12: child.isUnder12,
        monthsInHome: child.monthsInHome,
      })),
      federalEIC: d(input.scheduleEEIC.federalEIC),
      expandedEITCWorksheetCredit: input.scheduleEEIC.expandedEITCWorksheetCredit === undefined
        ? undefined
        : d(input.scheduleEEIC.expandedEITCWorksheetCredit),
      expandedEITCWorksheet: input.scheduleEEIC.expandedEITCWorksheet ? {
        taxYear: input.scheduleEEIC.expandedEITCWorksheet.taxYear,
        filingStatus: input.scheduleEEIC.expandedEITCWorksheet.filingStatus,
        qualifyingChildCount: input.scheduleEEIC.expandedEITCWorksheet.qualifyingChildCount,
        form1040Line1z: d(input.scheduleEEIC.expandedEITCWorksheet.form1040Line1z),
        excludedMedicaidWaiverPayments: d(
          input.scheduleEEIC.expandedEITCWorksheet.excludedMedicaidWaiverPayments,
        ),
        electedNontaxableCombatPay: d(
          input.scheduleEEIC.expandedEITCWorksheet.electedNontaxableCombatPay,
        ),
        scheduleSELine3: d(input.scheduleEEIC.expandedEITCWorksheet.scheduleSELine3),
        scheduleSELine4bAnd5a: d(
          input.scheduleEEIC.expandedEITCWorksheet.scheduleSELine4bAnd5a,
        ),
        scheduleSELine13: d(input.scheduleEEIC.expandedEITCWorksheet.scheduleSELine13),
        part3NetFarmProfitOrLoss: d(
          input.scheduleEEIC.expandedEITCWorksheet.part3NetFarmProfitOrLoss,
        ),
        part3NetBusinessProfitOrLoss: d(
          input.scheduleEEIC.expandedEITCWorksheet.part3NetBusinessProfitOrLoss,
        ),
        statutoryEmployeeIncome: d(
          input.scheduleEEIC.expandedEITCWorksheet.statutoryEmployeeIncome,
        ),
        agi: d(input.scheduleEEIC.expandedEITCWorksheet.agi),
        investmentIncome: d(input.scheduleEEIC.expandedEITCWorksheet.investmentIncome),
        filedForm2555: input.scheduleEEIC.expandedEITCWorksheet.filedForm2555,
        taxpayerOrSpouseUsResidentHalfYear:
          input.scheduleEEIC.expandedEITCWorksheet.taxpayerOrSpouseUsResidentHalfYear,
        mainHomeInUSMoreThanHalfYear:
          input.scheduleEEIC.expandedEITCWorksheet.mainHomeInUSMoreThanHalfYear,
        canBeClaimedAsDependent:
          input.scheduleEEIC.expandedEITCWorksheet.canBeClaimedAsDependent,
        canBeQualifyingChildOfAnother:
          input.scheduleEEIC.expandedEITCWorksheet.canBeQualifyingChildOfAnother,
        separatedSpouseEitcEligible:
          input.scheduleEEIC.expandedEITCWorksheet.separatedSpouseEitcEligible,
        hasComplexInvestmentIncome:
          input.scheduleEEIC.expandedEITCWorksheet.hasComplexInvestmentIncome,
        primaryAge: input.scheduleEEIC.expandedEITCWorksheet.primaryAge,
        spouseAge: input.scheduleEEIC.expandedEITCWorksheet.spouseAge,
      } : undefined,
      allocationDecimal: input.scheduleEEIC.allocationDecimal === undefined
        ? undefined
        : d(input.scheduleEEIC.allocationDecimal),
    } : undefined,
    scheduleNR: input.scheduleNR ? {
      taxYear: input.scheduleNR.taxYear,
      residencyType: input.scheduleNR.residencyType,
      income: {
        wages: normalizeDualColumnAmount(input.scheduleNR.income.wages),
        interest: normalizeDualColumnAmount(input.scheduleNR.income.interest),
        dividends: normalizeDualColumnAmount(input.scheduleNR.income.dividends),
        taxableRefunds: normalizeDualColumnAmount(input.scheduleNR.income.taxableRefunds),
        alimony: normalizeDualColumnAmount(input.scheduleNR.income.alimony),
        businessIncome: normalizeDualColumnAmount(input.scheduleNR.income.businessIncome),
        capitalGains: normalizeDualColumnAmount(input.scheduleNR.income.capitalGains),
        otherGains: normalizeDualColumnAmount(input.scheduleNR.income.otherGains),
        iraDistributions: normalizeDualColumnAmount(input.scheduleNR.income.iraDistributions),
        pensions: normalizeDualColumnAmount(input.scheduleNR.income.pensions),
        rentalAndPartnership: normalizeDualColumnAmount(input.scheduleNR.income.rentalAndPartnership),
        farmIncome: normalizeDualColumnAmount(input.scheduleNR.income.farmIncome),
        unemployment: normalizeDualColumnAmount(input.scheduleNR.income.unemployment),
        socialSecurity: normalizeDualColumnAmount(input.scheduleNR.income.socialSecurity),
        otherIncome: normalizeDualColumnAmount(input.scheduleNR.income.otherIncome),
      },
      adjustments: {
        educatorExpenses: normalizeDualColumnAmount(input.scheduleNR.adjustments.educatorExpenses),
        certainBusinessExpenses: normalizeDualColumnAmount(input.scheduleNR.adjustments.certainBusinessExpenses),
        hsaDeduction: normalizeDualColumnAmount(input.scheduleNR.adjustments.hsaDeduction),
        movingExpenses: normalizeDualColumnAmount(input.scheduleNR.adjustments.movingExpenses),
        seTaxDeduction: normalizeDualColumnAmount(input.scheduleNR.adjustments.seTaxDeduction),
        sepSimpleDeduction: normalizeDualColumnAmount(input.scheduleNR.adjustments.sepSimpleDeduction),
        seHealthInsurance: normalizeDualColumnAmount(input.scheduleNR.adjustments.seHealthInsurance),
        earlyWithdrawalPenalty: normalizeDualColumnAmount(input.scheduleNR.adjustments.earlyWithdrawalPenalty),
        alimonyPaid: normalizeDualColumnAmount(input.scheduleNR.adjustments.alimonyPaid),
        iraDeduction: normalizeDualColumnAmount(input.scheduleNR.adjustments.iraDeduction),
        studentLoanInterest: normalizeDualColumnAmount(input.scheduleNR.adjustments.studentLoanInterest),
        archerMSA: normalizeDualColumnAmount(input.scheduleNR.adjustments.archerMSA),
        otherAdjustments: normalizeDualColumnAmount(input.scheduleNR.adjustments.otherAdjustments),
      },
      additionsSubtractions: {
        taxExemptInterest: normalizeDualColumnAmount(input.scheduleNR.additionsSubtractions.taxExemptInterest),
        otherAdditions: normalizeDualColumnAmount(input.scheduleNR.additionsSubtractions.otherAdditions),
        retirementSubtraction: normalizeDualColumnAmount(input.scheduleNR.additionsSubtractions.retirementSubtraction),
        ilRefundSubtraction: normalizeDualColumnAmount(input.scheduleNR.additionsSubtractions.ilRefundSubtraction),
        otherSubtractions: normalizeDualColumnAmount(input.scheduleNR.additionsSubtractions.otherSubtractions),
      },
      // IL-1040 computes Schedule NR Lines 47 and 49 from the current return
      // before invoking calculateScheduleNR, so the shared payload does not carry them.
      fullBaseIncome: d(0),
      totalExemptions: d(0),
    } : undefined,
    useTaxWorksheet: input.useTaxWorksheet ? {
      taxYear: input.useTaxWorksheet.taxYear,
      filingStatus: input.useTaxWorksheet.filingStatus,
      federalAGI: d(input.useTaxWorksheet.federalAGI),
      generalMerchandisePurchases: d(input.useTaxWorksheet.generalMerchandisePurchases),
      qualifyingFoodDrugMedicalPurchases: d(input.useTaxWorksheet.qualifyingFoodDrugMedicalPurchases),
      salesTaxPaidToOtherStates: d(input.useTaxWorksheet.salesTaxPaidToOtherStates),
    } : undefined,
    householdEmploymentTax: d(input.householdEmploymentTax),
    useTax: d(input.useTax),
    compassionateUseSurcharge: d(input.compassionateUseSurcharge),
    ilWithholding: effectiveIllinoisWithholding,
    scheduleILWIT: input.scheduleILWIT ? {
      records: input.scheduleILWIT.records.map((record) => ({
        taxpayer: record.taxpayer,
        formType: record.formType,
        payerId: record.payerId,
        federalAmount: d(record.federalAmount),
        illinoisAmount: d(record.illinoisAmount),
        illinoisWithheld: d(record.illinoisWithheld),
      })),
    } : derivedIllinoisScheduleILWITRecords && derivedIllinoisScheduleILWITRecords.length > 0
      ? {
          records: derivedIllinoisScheduleILWITRecords,
        }
      : undefined,
    estimatedPayments: d(input.estimatedPayments),
    passThroughWithholding: d(input.passThroughWithholding),
    passThroughEntityTaxCredit: d(input.passThroughEntityTaxCredit),
    voluntaryCharitableDonations: d(input.voluntaryCharitableDonations),
    refundAmountRequested: input.refundAmountRequested !== undefined
      ? d(input.refundAmountRequested)
      : undefined,
    refundMethod: input.refundMethod,
    directDeposit: input.directDeposit,
    creditForwardAmount: input.creditForwardAmount !== undefined
      ? d(input.creditForwardAmount)
      : undefined,
    firstYearIllinoisReturn: input.firstYearIllinoisReturn,
    healthInsuranceCheckbox: input.healthInsuranceCheckbox,
    il2210: input.il2210 ? {
      priorYearTax: d(input.il2210.priorYearTax),
      priorYearReturnFiled: input.il2210.priorYearReturnFiled,
      qualifiesAsFarmer: input.il2210.qualifiesAsFarmer,
      is65OrOlderAndPermanentlyInNursingHome: input.il2210.is65OrOlderAndPermanentlyInNursingHome,
      notRequiredToFilePriorYearReturn: input.il2210.notRequiredToFilePriorYearReturn,
      estimatedPaymentsByQuarter: input.il2210.estimatedPaymentsByQuarter.map((payment) => d(payment)) as [Decimal, Decimal, Decimal, Decimal],
      annualizedInstallmentMethod: input.il2210.annualizedInstallmentMethod ? {
        periods: input.il2210.annualizedInstallmentMethod.periods.map((period) => ({
          baseIncome: d(period.baseIncome),
          exemptions: d(period.exemptions),
          surcharges: d(period.surcharges),
          credits: d(period.credits),
          ilChildTaxCredit: d(period.ilChildTaxCredit),
        })) as [
          {
            baseIncome: Decimal;
            exemptions: Decimal;
            surcharges: Decimal;
            credits: Decimal;
            ilChildTaxCredit: Decimal;
          },
          {
            baseIncome: Decimal;
            exemptions: Decimal;
            surcharges: Decimal;
            credits: Decimal;
            ilChildTaxCredit: Decimal;
          },
          {
            baseIncome: Decimal;
            exemptions: Decimal;
            surcharges: Decimal;
            credits: Decimal;
            ilChildTaxCredit: Decimal;
          },
          {
            baseIncome: Decimal;
            exemptions: Decimal;
            surcharges: Decimal;
            credits: Decimal;
            ilChildTaxCredit: Decimal;
          },
        ],
      } : undefined,
    } : undefined,
  };
}

function deriveIllinoisWithholdingFromInput(input: TaxYearInput): Decimal {
  return sum(
    ...input.w2s
      .filter((w2) => isIllinoisStateCode(w2.state))
      .map((w2) => d(w2.stateTaxWithheld)),
    ...input.formW2G
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...(input.form1099R ?? [])
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099G
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099Misc
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099K
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099Nec
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099Int
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099Div
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
    ...input.form1099B
      .filter((form) => isIllinoisStateCode(form.state))
      .map((form) => d(form.stateWithheld)),
  );
}

function deriveIllinoisScheduleILWITRecordsFromInput(input: TaxYearInput): ILScheduleWITRecord[] | undefined {
  const records: ILScheduleWITRecord[] = [];
  let derivableWithholding = new Decimal(0);

  for (const w2 of input.w2s) {
    const record = deriveIllinoisScheduleILWITRecordFromW2(w2, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const w2StateWithholding = d(w2.stateTaxWithheld);
      if (w2StateWithholding.greaterThan(0) && w2.state?.trim().toUpperCase() === "IL") {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.formW2G) {
    const record = deriveIllinoisScheduleILWITRecordFromW2G(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const formW2GStateWithholding = d(form.stateWithheld);
      if (formW2GStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099R ?? []) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099R(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099RStateWithholding = d(form.stateWithheld);
      if (form1099RStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099G) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099G(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099GStateWithholding = d(form.stateWithheld);
      if (form1099GStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099Misc) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099Misc(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099MiscStateWithholding = d(form.stateWithheld);
      if (form1099MiscStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099K) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099K(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099KStateWithholding = d(form.stateWithheld);
      if (form1099KStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099Nec) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099Nec(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099NecStateWithholding = d(form.stateWithheld);
      if (form1099NecStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099Int) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099Int(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099IntStateWithholding = d(form.stateWithheld);
      if (form1099IntStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099Div) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099Div(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099DivStateWithholding = d(form.stateWithheld);
      if (form1099DivStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  for (const form of input.form1099B) {
    const record = deriveIllinoisScheduleILWITRecordFrom1099B(form, input.taxpayer.filingStatus as FilingStatus);
    if (record === undefined) {
      const form1099BStateWithholding = d(form.stateWithheld);
      if (form1099BStateWithholding.greaterThan(0) && isIllinoisStateCode(form.state)) {
        return undefined;
      }
      continue;
    }

    records.push(record);
    derivableWithholding = derivableWithholding.plus(record.illinoisWithheld);
  }

  const totalDerivedWithholding = deriveIllinoisWithholdingFromInput(input);
  if (!derivableWithholding.equals(totalDerivedWithholding)) {
    return undefined;
  }

  return records;
}

function deriveIllinoisScheduleILWITRecordFromW2(
  w2: W2,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const isIllinoisW2 = isIllinoisStateCode(w2.state);
  const illinoisWithheld = d(w2.stateTaxWithheld);
  if (!isIllinoisW2 || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = w2.employer.ein.trim();
  if (payerId.length === 0 || w2.stateWages === undefined) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && w2.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, w2.accountHolder),
    formType: "W-2",
    payerId,
    federalAmount: d(w2.wages),
    illinoisAmount: d(w2.stateWages),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFromW2G(
  form: FormW2G,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId || form.stateWinnings === undefined) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "W-2G",
    payerId,
    // 2025 IL-WIT instructions use Form W-2G Box 1 for Column C,
    // Box 14 for Column D, and Box 15 for Column E.
    federalAmount: d(form.reportableWinnings),
    illinoisAmount: d(form.stateWinnings),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099R(
  form: Form1099R,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId || form.stateDistribution === undefined) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-R",
    payerId,
    // 2025 IL-WIT instructions use Form 1099-R Box 1 for Column C,
    // Box 16 for Column D, and Box 14 for Column E.
    federalAmount: d(form.grossDistribution),
    illinoisAmount: d(form.stateDistribution),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099G(
  form: Form1099G,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  if (!isIllinoisDepartmentOfEmploymentSecurityPayer(form.payer)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  const federalAmount = d(form.unemploymentCompensation);
  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-G",
    payerId,
    federalAmount,
    // 2025 IL-WIT instructions use Form 1099-G Box 1 for both Columns C and D
    // when the issuer is the Illinois Department of Employment Security.
    illinoisAmount: federalAmount,
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099Misc(
  form: Form1099Misc,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId || form.stateIncome === undefined) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-MISC",
    payerId,
    federalAmount: d(form.rents).plus(d(form.royalties)).plus(d(form.otherIncome)),
    illinoisAmount: d(form.stateIncome),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099K(
  form: Form1099K,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.statePayerNumber?.trim();
  if (!payerId) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  const grossAmount = d(form.grossAmount);
  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-K",
    payerId,
    federalAmount: grossAmount,
    illinoisAmount: grossAmount,
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099Nec(
  form: Form1099Nec,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId || form.stateIncome === undefined) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-NEC",
    payerId,
    federalAmount: d(form.nonemployeeCompensation),
    illinoisAmount: d(form.stateIncome),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099Int(
  form: Form1099Int,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  const interestIncome = d(form.interestIncome);
  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-INT",
    payerId,
    federalAmount: interestIncome,
    illinoisAmount: interestIncome,
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099Div(
  form: Form1099Div,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-DIV",
    payerId,
    federalAmount: d(form.ordinaryDividends),
    illinoisAmount: d(form.qualifiedDividends),
    illinoisWithheld,
  };
}

function deriveIllinoisScheduleILWITRecordFrom1099B(
  form: Form1099B,
  filingStatus: FilingStatus,
): ILScheduleWITRecord | undefined {
  const illinoisWithheld = d(form.stateWithheld);
  if (!isIllinoisStateCode(form.state) || illinoisWithheld.lte(0)) {
    return undefined;
  }

  const payerId = form.payerTin?.trim();
  if (!payerId) {
    return undefined;
  }

  if (filingStatus === "married_filing_jointly" && form.accountHolder === undefined) {
    return undefined;
  }

  // The shared 1099-B schema stores detailed transactions, so infer the
  // schedule's Box 1d amount from total proceeds.
  const totalProceeds = sum(...form.transactions.map((transaction) => d(transaction.proceeds)));
  return {
    taxpayer: resolveIllinoisScheduleILWITTaxpayer(filingStatus, form.accountHolder),
    formType: "1099-B",
    payerId,
    federalAmount: totalProceeds,
    illinoisAmount: totalProceeds,
    illinoisWithheld,
  };
}

function resolveIllinoisScheduleILWITTaxpayer(
  filingStatus: FilingStatus,
  accountHolder?: "primary" | "spouse",
): "primary" | "spouse" {
  return filingStatus === "married_filing_jointly" && accountHolder === "spouse"
    ? "spouse"
    : "primary";
}

function isIllinoisStateCode(state?: string): boolean {
  return state?.trim().toUpperCase() === "IL";
}

function isIllinoisDepartmentOfEmploymentSecurityPayer(payer: string): boolean {
  const normalizedPayer = payer.trim().toUpperCase().replace(/[^A-Z]/g, " ");
  const collapsedPayer = normalizedPayer.replace(/\s+/g, " ").trim();

  return collapsedPayer.includes("ILLINOIS DEPARTMENT OF EMPLOYMENT SECURITY")
    || collapsedPayer.includes("DEPARTMENT OF EMPLOYMENT SECURITY");
}

function deriveDefaultForm8606TraditionalDistributions(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606TraditionalDistribution)
      .map(resolveTraditionalIraDistributionAmountForForm8606Default)
  );
}

function deriveForm8606OwnerDefaultsSuppressionReason(
  taxpayer: TaxYearInput["taxpayer"],
  forms: Form1099R[] = []
): string | undefined {
  if (taxpayer.filingStatus !== "married_filing_jointly" || taxpayer.spouse === undefined) {
    return undefined;
  }

  const defaultRelevantForms = forms.filter((form) => (
    shouldDefaultToForm8606TraditionalDistribution(form)
    || shouldDefaultToForm8606TraditionalReturnedContributionByDueDate(form)
    || shouldDefaultToForm8606TraditionalReturnedExcessContribution(form)
    || d(form.rothConversionAmount).greaterThan(0)
    || shouldDefaultToForm8606RothDistribution(form)
    || shouldDefaultToForm8606RothReturnedContributionByDueDate(form)
    || shouldDefaultToForm8606RothReturnedExcessContribution(form)
  ));

  if (defaultRelevantForms.length === 0) {
    return undefined;
  }

  const taggedOwners = defaultRelevantForms
    .map((form) => form.accountHolder)
    .filter((owner): owner is NonNullable<Form1099R["accountHolder"]> => owner !== undefined);
  const hasTaggedOwners = taggedOwners.length > 0;
  const hasUntaggedOwners = taggedOwners.length !== defaultRelevantForms.length;

  if (new Set(taggedOwners).size > 1) {
    return "Suppressed because separate spouse-specific Form 8606 defaults would mix primary and spouse IRA activity";
  }

  if (hasTaggedOwners && hasUntaggedOwners) {
    return "Suppressed because separate spouse-specific Form 8606 defaults would mix owner-tagged and untagged IRA activity";
  }

  return undefined;
}

function allocateProportionalTraditionalIraShare(
  amount: Decimal,
  subsetBase: Decimal,
  totalBase: Decimal
): Decimal {
  if (amount.isZero() || subsetBase.isZero() || totalBase.isZero()) {
    return new Decimal(0);
  }

  return Decimal.min(
    amount,
    Decimal.max(
      new Decimal(0),
      amount.times(subsetBase.dividedBy(totalBase))
    )
  );
}

function allocateProportionalRothIraShare(
  amount: Decimal,
  subsetBase: Decimal,
  totalBase: Decimal
): Decimal {
  if (amount.isZero() || subsetBase.isZero() || totalBase.isZero()) {
    return new Decimal(0);
  }

  return Decimal.min(
    amount,
    Decimal.max(
      new Decimal(0),
      amount.times(subsetBase.dividedBy(totalBase))
    )
  );
}

function resolveTraditionalIraDistributionAmountForForm8606Default(form: Form1099R): Decimal {
  return Decimal.max(
    new Decimal(0),
    d(form.grossDistribution).minus(
      Decimal.min(
        d(form.grossDistribution),
        Decimal.max(new Decimal(0), d(form.rothConversionAmount))
      )
    )
  );
}

function shouldDefaultToForm8606TraditionalDistribution(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form) || isPriorYearTaxableDistribution(form)) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return !upperCode.includes("J")
    && !upperCode.includes("N")
    && !upperCode.includes("Q")
    && !upperCode.includes("R")
    && !upperCode.includes("T");
}

function deriveDefaultForm8606TraditionalReturnedContributionsByDueDate(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606TraditionalReturnedContributionByDueDate)
      .map((form) => d(form.grossDistribution))
  );
}

function deriveDefaultForm8606TraditionalReturnedExcessContributions(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606TraditionalReturnedExcessContribution)
      .map((form) => d(form.grossDistribution))
  );
}

function deriveDefaultForm8606RothDistributions(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606RothDistribution)
      .map((form) => d(form.grossDistribution))
  );
}

function deriveDefaultForm8606QualifiedRothDistributionsExcludedFromLine19(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter((form) => shouldDefaultToForm8606RothDistribution(form))
      .map(resolveQualifiedRothDistributionAmount)
  );
}

function deriveDefaultForm8606RothRolledOverDistributions(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter((form) => shouldDefaultToForm8606RothDistribution(form))
      .map(resolveValidatedRothIraRolloverAmountForForm8606Default)
  );
}

function deriveDefaultForm8606RothReturnedContributionsByDueDate(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606RothReturnedContributionByDueDate)
      .map((form) => d(form.grossDistribution))
  );
}

function deriveDefaultForm8606RothReturnedExcessContributions(forms: Form1099R[] = []): Decimal {
  return sum(
    ...forms
      .filter(shouldDefaultToForm8606RothReturnedExcessContribution)
      .map((form) => d(form.grossDistribution))
  );
}

function deriveDefaultForm8606TraditionalQualifiedHsaFundingDistributions(
  form8889: TaxYearInput["form8889"] | undefined,
  form8889ByOwner: TaxYearInput["form8889ByOwner"] | undefined
): Decimal {
  if (deriveForm8606QualifiedHsaFundingSuppressionReason(form8889, form8889ByOwner) !== undefined) {
    return new Decimal(0);
  }

  return sum(
    ...[
      form8889,
      form8889ByOwner?.primary,
      form8889ByOwner?.spouse,
    ]
      .filter((candidate): candidate is NonNullable<typeof form8889> => candidate !== undefined)
      .filter((candidate) => candidate.qualifiedFundingDistributionSource === "traditional_ira")
      .map((candidate) => Decimal.max(new Decimal(0), d(candidate.qualifiedFundingDistribution)))
  );
}

function deriveDefaultForm8606RothQualifiedHsaFundingDistributions(
  form8889: TaxYearInput["form8889"] | undefined,
  form8889ByOwner: TaxYearInput["form8889ByOwner"] | undefined
): Decimal {
  if (deriveForm8606QualifiedHsaFundingSuppressionReason(form8889, form8889ByOwner) !== undefined) {
    return new Decimal(0);
  }

  return sum(
    ...[
      form8889,
      form8889ByOwner?.primary,
      form8889ByOwner?.spouse,
    ]
      .filter((candidate): candidate is NonNullable<typeof form8889> => candidate !== undefined)
      .filter((candidate) => candidate.qualifiedFundingDistributionSource === "roth_ira")
      .map((candidate) => Decimal.max(new Decimal(0), d(candidate.qualifiedFundingDistribution)))
  );
}

function deriveForm8606QualifiedHsaFundingSuppressionReason(
  form8889: TaxYearInput["form8889"] | undefined,
  form8889ByOwner: TaxYearInput["form8889ByOwner"] | undefined
): string | undefined {
  const mainFormQualifiedFundingDistribution = hasQualifiedFundingDistribution(form8889);
  const ownerSpecificQualifiedFundingStatements = [
    form8889ByOwner?.primary,
    form8889ByOwner?.spouse,
  ].filter(hasQualifiedFundingDistribution);

  if (
    mainFormQualifiedFundingDistribution
    && ownerSpecificQualifiedFundingStatements.length > 0
  ) {
    return "Suppressed because a main Form 8889 qualified funding distribution and an owner-specific Form 8889 statement both exist, and one Form 8606 cannot safely infer whether any qualified funding distribution belongs on that spouse's separate Form 8606 or another spouse-specific form";
  }

  if (
    form8889ByOwner?.primary !== undefined
    && form8889ByOwner.spouse !== undefined
    && ownerSpecificQualifiedFundingStatements.length > 0
  ) {
    return "Suppressed because owner-specific Form 8889 inputs exist for both spouses and one Form 8606 cannot safely infer whether any qualified funding distribution belongs on that spouse's separate Form 8606 or the other spouse's separate form";
  }

  return undefined;
}

function hasQualifiedFundingDistribution(
  form8889:
    | TaxYearInput["form8889"]
    | NonNullable<TaxYearInput["form8889ByOwner"]>["primary"]
    | NonNullable<TaxYearInput["form8889ByOwner"]>["spouse"]
    | undefined
): boolean {
  return form8889 !== undefined && d(form8889.qualifiedFundingDistribution).greaterThan(0);
}

function shouldDefaultToForm8606RothDistribution(form: Form1099R): boolean {
  if (
    !isRothIraDistributionForForm8606(form)
    || isPriorYearTaxableDistribution(form)
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  if (upperCode.includes("N") || upperCode.includes("Q") || upperCode.includes("R")) {
    return false;
  }

  if (upperCode.includes("T") && form.rothContributionOrConversionMadeBefore2021) {
    return false;
  }

  return upperCode.includes("J") || upperCode.includes("T");
}

function shouldDefaultToForm8606TraditionalReturnedContributionByDueDate(form: Form1099R): boolean {
  return isIraForm1099RDistribution(form)
    && isReturnedContributionByDueDate(form)
    && !isRothIraDistributionForForm8606(form);
}

function shouldDefaultToForm8606TraditionalReturnedExcessContribution(form: Form1099R): boolean {
  if (
    !isIraForm1099RDistribution(form)
    || isPriorYearTaxableDistribution(form)
    || !form.excessContributionReturnedWithoutEarnings
    || isRothIraDistributionForForm8606(form)
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode === "" || upperCode.includes("1") || upperCode.includes("7") || upperCode.includes("S");
}

function shouldDefaultToForm8606RothReturnedContributionByDueDate(form: Form1099R): boolean {
  return isRothIraDistributionForForm8606(form)
    && isReturnedContributionByDueDate(form);
}

function shouldDefaultToForm8606RothReturnedExcessContribution(form: Form1099R): boolean {
  return isRothIraDistributionForForm8606(form)
    && !isPriorYearTaxableDistribution(form)
    && form.excessContributionReturnedWithoutEarnings;
}

function isRothIraDistributionForForm8606(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form)) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("J")
    || upperCode.includes("N")
    || upperCode.includes("Q")
    || upperCode.includes("R")
    || upperCode.includes("T");
}

function resolveValidatedRothIraRolloverAmountForForm8606Default(form: Form1099R): Decimal {
  if (resolveQualifiedRothDistributionAmount(form).greaterThan(0)) {
    return new Decimal(0);
  }

  return Decimal.min(
    Decimal.max(new Decimal(0), d(form.rothIraRolledOverAmount)),
    d(form.grossDistribution)
  );
}

function deriveForm5329HsaDefaults(
  form8889Results: Form8889Result[]
): {
  contributionRoom: Decimal;
  distributions: Decimal;
  currentYearExcess: Decimal;
  supportedReturnedExcessContributionsByDueDate: Decimal;
} {
  let contributionRoom = new Decimal(0);
  let distributions = new Decimal(0);
  let currentYearExcess = new Decimal(0);
  let supportedReturnedExcessContributionsByDueDate = new Decimal(0);

  for (const result of form8889Results) {
    // Room per owner = max(0, limit - total contributions)
    // = max(0, Line 8 - Line 2 - Line 11)
    contributionRoom = contributionRoom.plus(
      Decimal.max(new Decimal(0), result.line8.minus(result.line2).minus(result.line11))
    );

    // Distributions per owner = Line 16 (taxable HSA distributions)
    distributions = distributions.plus(result.line16);

    // Excess per owner = max(0, total contributions - limit)
    // = max(0, Line 2 + Line 11 - Line 8)
    const rawOwnerExcess = Decimal.max(new Decimal(0), result.line2.plus(result.line11).minus(result.line8));
    currentYearExcess = currentYearExcess.plus(rawOwnerExcess);
    supportedReturnedExcessContributionsByDueDate = supportedReturnedExcessContributionsByDueDate.plus(
      Decimal.min(rawOwnerExcess, result.supportedReturnedExcessContributions)
    );
  }

  return {
    contributionRoom,
    distributions,
    currentYearExcess,
    supportedReturnedExcessContributionsByDueDate,
  };
}

function buildForm5329Input(
  input: TaxYearInput["form5329"] | undefined,
  taxpayer: TaxYearInput["taxpayer"],
  forms: Form1099R[] = [],
  form8606?: Form8606Result,
  supportedMedicalExpenseExceptionAmount: Decimal = new Decimal(0),
  form8889Results: Form8889Result[] = []
): Form5329Input | undefined {
  const defaults = deriveDefaultForm5329Amounts(
    forms,
    taxpayer,
    form8606,
    supportedMedicalExpenseExceptionAmount
  );
  const hsaDefaults = form8889Results.length > 0
    ? deriveForm5329HsaDefaults(form8889Results)
    : {
      contributionRoom: new Decimal(0),
      distributions: new Decimal(0),
      currentYearExcess: new Decimal(0),
      supportedReturnedExcessContributionsByDueDate: new Decimal(0),
    };
  const suppressAmbiguousMfJAggregate9100Relief =
    input?.hsaCurrentYearExcessContributions === undefined
    && taxpayer.filingStatus === "married_filing_jointly"
    && taxpayer.spouse !== undefined
    && form8889Results.length > 1;
  const defaultDistributionsNotSubjectToAdditionalTax = Decimal.max(
    new Decimal(0),
    defaults.distributionsNotSubjectToAdditionalTax
      .minus(
        input?.medicalExpenseExceptionAmount === undefined
          ? new Decimal(0)
          : defaults.supportedMedicalExpenseExceptionAmount
      )
      .minus(
        input?.deathDistributionExceptionAmount === undefined
          ? new Decimal(0)
          : defaults.supportedDeathDistributionAmount
      )
      .minus(
        input?.terminalIllnessExceptionAmount === undefined
          ? new Decimal(0)
          : defaults.supportedTerminalIllnessDistributionAmount
      )
  );
  const normalized: Form5329Input = {
    earlyDistributionsIncludedInIncome:
      input?.earlyDistributionsIncludedInIncome ?? defaults.earlyDistributionsIncludedInIncome.toString(),
    rothConversionRecaptureAmount:
      input?.rothConversionRecaptureAmount ?? "0",
    distributionsNotSubjectToAdditionalTax:
      input?.distributionsNotSubjectToAdditionalTax ?? defaultDistributionsNotSubjectToAdditionalTax.toString(),
    distributionExceptionNumber: input?.distributionExceptionNumber,
    substantiallyEqualPeriodicPaymentsExceptionAmount:
      input?.substantiallyEqualPeriodicPaymentsExceptionAmount ?? "0",
    deathDistributionExceptionAmount:
      input?.deathDistributionExceptionAmount ?? "0",
    qualifiedDomesticRelationsOrderDistributionAmount:
      input?.qualifiedDomesticRelationsOrderDistributionAmount ?? "0",
    medicalExpenseExceptionAmount:
      input?.medicalExpenseExceptionAmount ?? "0",
    unemployedHealthInsurancePremiumExceptionAmount:
      input?.unemployedHealthInsurancePremiumExceptionAmount ?? "0",
    qualifiedHigherEducationExpenseExceptionAmount:
      input?.qualifiedHigherEducationExpenseExceptionAmount ?? "0",
    qualifiedFirstTimeHomebuyerDistributionAmount:
      input?.qualifiedFirstTimeHomebuyerDistributionAmount ?? "0",
    priorQualifiedFirstTimeHomebuyerDistributions:
      input?.priorQualifiedFirstTimeHomebuyerDistributions ?? "0",
    irsLevyDistributionExceptionAmount:
      input?.irsLevyDistributionExceptionAmount ?? "0",
    qualifiedReservistDistributionExceptionAmount:
      input?.qualifiedReservistDistributionExceptionAmount ?? "0",
    eligibleGovernmental457bDistributionExceptionAmount:
      input?.eligibleGovernmental457bDistributionExceptionAmount ?? "0",
    pre1986EmployerPlanDistributionExceptionAmount:
      input?.pre1986EmployerPlanDistributionExceptionAmount ?? "0",
    section404kDividendDistributionExceptionAmount:
      input?.section404kDividendDistributionExceptionAmount ?? "0",
    section72qAnnuityExceptionAmount:
      input?.section72qAnnuityExceptionAmount ?? "0",
    federalPhasedRetirementAnnuityExceptionAmount:
      input?.federalPhasedRetirementAnnuityExceptionAmount ?? "0",
    permissibleEacaWithdrawalExceptionAmount:
      input?.permissibleEacaWithdrawalExceptionAmount ?? "0",
    qualifiedBirthOrAdoptionExceptionAmount:
      input?.qualifiedBirthOrAdoptionExceptionAmount ?? "0",
    terminalIllnessExceptionAmount:
      input?.terminalIllnessExceptionAmount ?? "0",
    returnedContributionByDueDateTaxableEarningsExceptionAmount:
      input?.returnedContributionByDueDateTaxableEarningsExceptionAmount ?? "0",
    domesticAbuseExceptionAmount:
      input?.domesticAbuseExceptionAmount ?? "0",
    emergencyPersonalExpenseExceptionAmount:
      input?.emergencyPersonalExpenseExceptionAmount ?? "0",
    supportedMedicalExpenseExceptionAmount:
      input?.supportedMedicalExpenseExceptionAmount
      ?? (input?.medicalExpenseExceptionAmount === undefined
        ? defaults.supportedMedicalExpenseExceptionAmount.toString()
        : "0"),
    supportedDeathDistributionAmount:
      input?.deathDistributionExceptionAmount === undefined
        ? defaults.supportedDeathDistributionAmount.toString()
        : "0",
    supportedTerminalIllnessDistributionAmount:
      input?.terminalIllnessExceptionAmount === undefined
        ? defaults.supportedTerminalIllnessDistributionAmount.toString()
        : "0",
    simpleIRADistributionsWithinFirstTwoYears:
      input?.simpleIRADistributionsWithinFirstTwoYears ?? defaults.simpleIRADistributionsWithinFirstTwoYears.toString(),
    supportedSeparationFromServiceAfterAge55Amount:
      defaults.supportedSeparationFromServiceAfterAge55Amount.toString(),
    supportedDisabilityDistributionAmount:
      defaults.supportedDisabilityDistributionAmount.toString(),
    supportedQualifiedDomesticRelationsOrderDistributionAmount:
      defaults.supportedQualifiedDomesticRelationsOrderDistributionAmount.toString(),
    supportedIncorrectEarlyDistributionAge59AndHalfAmount:
      defaults.supportedIncorrectEarlyDistributionAge59AndHalfAmount.toString(),
    supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome:
      defaults.supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome.toString(),
    supportedEligibleGovernmental457bDistributionsExcludedFromLine1:
      defaults.supportedEligibleGovernmental457bDistributionsExcludedFromLine1.toString(),
    supportedReturnedContributionByDueDateTaxableEarnings:
      defaults.supportedReturnedContributionByDueDateTaxableEarnings.toString(),
    supportedQualifiedFirstTimeHomebuyerDistribution:
      defaults.supportedQualifiedFirstTimeHomebuyerDistribution.toString(),
    supportedRepaymentEligibleTraditionalDistributionTaxableShare:
      defaults.supportedRepaymentEligibleTraditionalDistributionTaxableShare.toString(),
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber:
      defaults.supportedRepaymentEligibleTraditionalDistributionExceptionNumber,
    supportedRepaymentEligibleRothDistributionTaxableShare:
      defaults.supportedRepaymentEligibleRothDistributionTaxableShare.toString(),
    supportedRepaymentEligibleRothDistributionExceptionNumber:
      defaults.supportedRepaymentEligibleRothDistributionExceptionNumber,

    // Part II: pass through education account distribution inputs
    educationAccountDistributionsIncludedInIncome: input?.educationAccountDistributionsIncludedInIncome ?? "0",
    educationAccountDistributionsExcepted: input?.educationAccountDistributionsExcepted ?? "0",

    // Part III: pass through excess contribution inputs
    traditionalIRAPriorYearExcessContributions: input?.traditionalIRAPriorYearExcessContributions ?? "0",
    traditionalIRAContributionRoom: input?.traditionalIRAContributionRoom ?? "0",
    traditionalIRADistributionsIncludedInIncome: input?.traditionalIRADistributionsIncludedInIncome ?? "0",
    traditionalIRAPriorYearExcessReturned: input?.traditionalIRAPriorYearExcessReturned ?? "0",
    traditionalIRACurrentYearExcessContributions: input?.traditionalIRACurrentYearExcessContributions ?? "0",
    traditionalIRAValueDec31: input?.traditionalIRAValueDec31 ?? "0",

    // Part V: pass through Coverdell ESA excess contribution inputs
    coverdellESAPriorYearExcessContributions: input?.coverdellESAPriorYearExcessContributions ?? "0",
    coverdellESAContributionRoom: input?.coverdellESAContributionRoom ?? "0",
    coverdellESADistributions: input?.coverdellESADistributions ?? "0",
    coverdellESACurrentYearExcessContributions: input?.coverdellESACurrentYearExcessContributions ?? "0",
    coverdellESAValueDec31: input?.coverdellESAValueDec31 ?? "0",

    // Part VI: pass through Archer MSA excess contribution inputs
    archerMSAPriorYearExcessContributions: input?.archerMSAPriorYearExcessContributions ?? "0",
    archerMSAContributionRoom: input?.archerMSAContributionRoom ?? "0",
    archerMSADistributions: input?.archerMSADistributions ?? "0",
    archerMSACurrentYearExcessContributions: input?.archerMSACurrentYearExcessContributions ?? "0",
    archerMSAValueDec31: input?.archerMSAValueDec31 ?? "0",

    // Part VII: HSA excess contribution inputs — auto-derived from Form 8889 when available
    hsaPriorYearExcessContributions: input?.hsaPriorYearExcessContributions ?? "0",
    hsaContributionRoom: input?.hsaContributionRoom ?? hsaDefaults.contributionRoom.toString(),
    hsaDistributions: input?.hsaDistributions ?? hsaDefaults.distributions.toString(),
    hsaCurrentYearExcessContributions: input?.hsaCurrentYearExcessContributions
      ?? hsaDefaults.currentYearExcess.toString(),
    supportedHsaReturnedExcessContributionsByDueDate:
      input?.hsaCurrentYearExcessContributions === undefined
        ? input?.supportedHsaReturnedExcessContributionsByDueDate
          ?? hsaDefaults.supportedReturnedExcessContributionsByDueDate.toString()
        : "0",
    supportedHsaReturnedExcessContributionsUnder9100Relief:
      input?.hsaCurrentYearExcessContributions === undefined
        ? suppressAmbiguousMfJAggregate9100Relief
          ? "0"
          : input?.supportedHsaReturnedExcessContributionsUnder9100Relief ?? "0"
        : "0",
    supportedHsaReturnedExcessContributionEarningsUnder9100Relief:
      input?.supportedHsaReturnedExcessContributionEarningsUnder9100Relief ?? "0",
    hsaValueDec31: input?.hsaValueDec31 ?? "0",

    // Part VIII: pass through ABLE account excess contribution inputs
    ablePriorYearExcessContributions: input?.ablePriorYearExcessContributions ?? "0",
    ableReductions: input?.ableReductions ?? "0",
    ableCurrentYearExcessContributions: input?.ableCurrentYearExcessContributions ?? "0",
    ableValueDec31: input?.ableValueDec31 ?? "0",

    // Part IV: pass through Roth excess contribution inputs
    rothIRAPriorYearExcessContributions: input?.rothIRAPriorYearExcessContributions ?? "0",
    rothIRAContributionRoom: input?.rothIRAContributionRoom ?? "0",
    rothIRADistributions: input?.rothIRADistributions ?? "0",
    rothIRACurrentYearExcessContributions: input?.rothIRACurrentYearExcessContributions ?? "0",
    rothIRAValueDec31: input?.rothIRAValueDec31 ?? "0",

    // Part IX: pass through RMD excess accumulation inputs
    requiredMinimumDistribution: input?.requiredMinimumDistribution ?? "0",
    actualDistributionsForRMD: input?.actualDistributionsForRMD ?? "0",
    rmdShortfallCorrectedWithinWindow: input?.rmdShortfallCorrectedWithinWindow ?? false,
  };

  const defaultLine1Base = Decimal.max(
    new Decimal(0),
    defaults.earlyDistributionsIncludedInIncome.minus(
      defaults.supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome
    )
      .minus(defaults.supportedEligibleGovernmental457bDistributionsExcludedFromLine1)
  );

  return (
    input !== undefined
    || defaultLine1Base.greaterThan(0)
    || defaults.distributionsNotSubjectToAdditionalTax.greaterThan(0)
    || defaults.simpleIRADistributionsWithinFirstTwoYears.greaterThan(0)
  )
    ? normalized
    : undefined;
}

function deriveDefaultForm5329Amounts(
  forms: Form1099R[] = [],
  taxpayer: TaxYearInput["taxpayer"],
  form8606?: Form8606Result,
  supportedMedicalExpenseExceptionAmount: Decimal = new Decimal(0)
): {
  earlyDistributionsIncludedInIncome: Decimal;
  distributionsNotSubjectToAdditionalTax: Decimal;
  simpleIRADistributionsWithinFirstTwoYears: Decimal;
  supportedMedicalExpenseExceptionAmount: Decimal;
  supportedDeathDistributionAmount: Decimal;
  supportedTerminalIllnessDistributionAmount: Decimal;
  supportedSeparationFromServiceAfterAge55Amount: Decimal;
  supportedDisabilityDistributionAmount: Decimal;
  supportedQualifiedDomesticRelationsOrderDistributionAmount: Decimal;
  supportedIncorrectEarlyDistributionAge59AndHalfAmount: Decimal;
  supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome: Decimal;
  supportedEligibleGovernmental457bDistributionsExcludedFromLine1: Decimal;
  supportedReturnedContributionByDueDateTaxableEarnings: Decimal;
  supportedQualifiedFirstTimeHomebuyerDistribution: Decimal;
  supportedRepaymentEligibleTraditionalDistributionTaxableShare: Decimal;
  supportedRepaymentEligibleTraditionalDistributionExceptionNumber?: string;
  supportedRepaymentEligibleRothDistributionTaxableShare: Decimal;
  supportedRepaymentEligibleRothDistributionExceptionNumber?: string;
} {
  const returnedContributionTaxableEarnings = sum(
    ...forms.map(resolveReturnedContributionByDueDateTaxableAmountForForm5329)
  );

  const earlyRothDistributionForms = forms.filter((form) => isEarlyRothDistribution(form));
  const totalRothIraDistributions = deriveDefaultForm8606RothDistributions(forms);
  const rothEarlyDistributionGross = sum(...earlyRothDistributionForms.map((form) => d(form.grossDistribution)));
  const useForm8606ForRothEarlyDistributions =
    form8606 !== undefined
    && rothEarlyDistributionGross.greaterThan(0)
    && rothEarlyDistributionGross.eq(totalRothIraDistributions);
  const canUsePartialForm8606RothEarlyDistributionAllocation =
    form8606 !== undefined
    && totalRothIraDistributions.greaterThan(0)
    && rothEarlyDistributionGross.greaterThan(0)
    && rothEarlyDistributionGross.lessThan(totalRothIraDistributions);
  const rothEarlyDistributionsQualifyingForAge59AndHalfException = sum(
    ...earlyRothDistributionForms
      .filter((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer))
      .map((form) => d(form.grossDistribution))
  );
  const allRothEarlyDistributionsQualifyForAge59AndHalfException =
    earlyRothDistributionForms.length > 0
    && earlyRothDistributionForms.every((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer));
  const rothEarlyDistributionsIncludedInIncome = useForm8606ForRothEarlyDistributions
    ? form8606.line25c.plus(form8606.line20)
    : canUsePartialForm8606RothEarlyDistributionAllocation
      ? allocateProportionalRothIraShare(
        form8606.line25c.plus(form8606.line20),
        rothEarlyDistributionGross,
        totalRothIraDistributions
      )
    : sum(
      ...earlyRothDistributionForms
        .map(resolveTaxableAmountForForm5329)
    );
  const supportedIncorrectEarlyRothDistributionAge59AndHalfAmount = useForm8606ForRothEarlyDistributions
    ? allRothEarlyDistributionsQualifyForAge59AndHalfException
      ? rothEarlyDistributionsIncludedInIncome
      : rothEarlyDistributionsQualifyingForAge59AndHalfException.greaterThan(0)
        ? allocateProportionalRothIraShare(
          rothEarlyDistributionsIncludedInIncome,
          rothEarlyDistributionsQualifyingForAge59AndHalfException,
          totalRothIraDistributions
        )
        : new Decimal(0)
    : canUsePartialForm8606RothEarlyDistributionAllocation
      ? rothEarlyDistributionsQualifyingForAge59AndHalfException.greaterThan(0)
        ? allocateProportionalRothIraShare(
          rothEarlyDistributionsIncludedInIncome,
          rothEarlyDistributionsQualifyingForAge59AndHalfException,
          totalRothIraDistributions
        )
        : new Decimal(0)
    : sum(
      ...earlyRothDistributionForms
        .filter((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer))
        .map(resolveTaxableAmountForForm5329)
    );
  const rothExceptionAmount = supportedIncorrectEarlyRothDistributionAge59AndHalfAmount.greaterThan(0)
    ? new Decimal(0)
    : useForm8606ForRothEarlyDistributions
      ? form8606.line20
      : canUsePartialForm8606RothEarlyDistributionAllocation
        ? allocateProportionalRothIraShare(
          form8606.line20,
          rothEarlyDistributionGross,
          totalRothIraDistributions
        )
      : new Decimal(0);

  const totalTraditionalIraDistributions = deriveDefaultForm8606TraditionalDistributions(forms);
  const earlyTraditionalIraForms = forms.filter(
    isNonRothIraEarlyDistribution
  );
  const allTraditionalIraEarlyDistributionsQualifyForAge59AndHalfException =
    earlyTraditionalIraForms.length > 0
    && earlyTraditionalIraForms.every((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer));
  const earlyTraditionalIraDistributions = sum(
    ...earlyTraditionalIraForms
      .map(resolveTraditionalIraDistributionAmountForForm8606Default)
  );
  const earlyTraditionalIraDistributionsQualifyingForAge59AndHalfException = sum(
    ...earlyTraditionalIraForms
      .filter((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer))
      .map(resolveTraditionalIraDistributionAmountForForm8606Default)
  );
  const disabilityTraditionalIraForms = forms.filter(isSupportedTraditionalIraDisabilityDistribution);
  const disabilityTraditionalIraDistributions = sum(
    ...disabilityTraditionalIraForms.map(resolveTraditionalIraDistributionAmountForForm8606Default)
  );
  const useForm8606ForTraditionalEarlyDistributions =
    form8606 !== undefined
    && earlyTraditionalIraDistributions.greaterThan(0)
    && earlyTraditionalIraDistributions.eq(totalTraditionalIraDistributions);
  const canUsePartialForm8606TraditionalEarlyDistributionLine1Allocation =
    form8606 !== undefined
    && totalTraditionalIraDistributions.greaterThan(0)
    && earlyTraditionalIraDistributions.greaterThan(0)
    && earlyTraditionalIraDistributions.lessThan(totalTraditionalIraDistributions);
  const canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions =
    canUsePartialForm8606TraditionalEarlyDistributionLine1Allocation
    && form8606 !== undefined;
  const nonRothIraEarlyDistributions = useForm8606ForTraditionalEarlyDistributions
    ? form8606.line15c.plus(form8606.line15b)
    : canUsePartialForm8606TraditionalEarlyDistributionLine1Allocation && form8606
      ? allocateProportionalTraditionalIraShare(
        form8606.line15a,
        earlyTraditionalIraDistributions,
        totalTraditionalIraDistributions
      )
    : sum(
      ...earlyTraditionalIraForms
        .map(resolveTaxableAmountForForm5329)
    );
  const supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount = useForm8606ForTraditionalEarlyDistributions
    ? allTraditionalIraEarlyDistributionsQualifyForAge59AndHalfException
      ? form8606.line15c
      : earlyTraditionalIraDistributionsQualifyingForAge59AndHalfException.greaterThan(0)
        ? allocateProportionalTraditionalIraShare(
          form8606.line15c,
          earlyTraditionalIraDistributionsQualifyingForAge59AndHalfException,
          totalTraditionalIraDistributions
        )
        : new Decimal(0)
    : canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
      ? allocateProportionalTraditionalIraShare(
        form8606.line15a,
        earlyTraditionalIraDistributionsQualifyingForAge59AndHalfException,
        totalTraditionalIraDistributions
      )
    : sum(
      ...earlyTraditionalIraForms
      .filter((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer))
      .map(resolveTaxableAmountForForm5329)
    );
  const supportedTraditionalIraDisabilityDistributionAmount =
    form8606 !== undefined
    && disabilityTraditionalIraDistributions.greaterThan(0)
    && disabilityTraditionalIraDistributions.eq(totalTraditionalIraDistributions)
      ? form8606.line15c.plus(form8606.line15b)
      : canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
        ? allocateProportionalTraditionalIraShare(
          form8606.line15a,
          disabilityTraditionalIraDistributions,
          totalTraditionalIraDistributions
        )
        : sum(
          ...disabilityTraditionalIraForms.map(resolveTaxableAmountForForm5329)
        );
  const iraProhibitedTransactionEarlyDistributions = sum(
    ...forms
      .filter((form) => isIraProhibitedTransactionEarlyDistribution(form, taxpayer))
      .map(resolveTaxableAmountForForm5329)
  );
  const nonIraEarlyDistributionForms = forms.filter(
    (form) => !isIraForm1099RDistribution(form) && isStandardEarlyDistribution(form)
  );
  const nonIraEarlyDistributions = sum(
    ...nonIraEarlyDistributionForms
      .map(resolveTaxableAmountForForm5329)
  );
  const supportedIncorrectNonIraDistributionAge59AndHalfAmount = sum(
    ...nonIraEarlyDistributionForms
      .filter((form) => qualifiesForSupportedAge59AndHalfException(form, taxpayer))
      .map((form) =>
        Decimal.max(
          new Decimal(0),
          resolveTaxableAmountForForm5329(form).minus(
            resolveEligibleGovernmental457bDistributionExcludedFromForm5329(form)
          )
        )
      )
  );
  const supportedSeparationFromServiceAfterAge55Amount = sum(
    ...nonIraEarlyDistributionForms
      .filter((form) =>
        qualifiesForSupportedSeparationFromServiceException(form)
        && !qualifiesForSupportedAge59AndHalfException(form, taxpayer)
      )
      .map((form) =>
        Decimal.max(
          new Decimal(0),
          resolveTaxableAmountForForm5329(form).minus(
            resolveEligibleGovernmental457bDistributionExcludedFromForm5329(form)
          )
        )
      )
  );
  const supportedQualifiedDomesticRelationsOrderDistributionAmount = sum(
    ...nonIraEarlyDistributionForms
      .filter((form) =>
        qualifiesForSupportedQualifiedDomesticRelationsOrderException(form)
        && !qualifiesForSupportedAge59AndHalfException(form, taxpayer)
      )
      .map((form) =>
        Decimal.max(
          new Decimal(0),
          resolveTaxableAmountForForm5329(form).minus(
            resolveEligibleGovernmental457bDistributionExcludedFromForm5329(form)
          )
        )
      )
  );
  const supportedNonIraDisabilityDistributionLine1Amount = sum(
    ...forms
      .filter(isSupportedNonIraDisabilityDistribution)
      .map(resolveTaxableAmountForForm5329)
  );
  const supportedNonIraDisabilityDistributionAmount = sum(
    ...forms
      .filter(isSupportedNonIraDisabilityDistribution)
      .map(resolveSupportedAutomaticDistributionAmountForForm5329)
  );
  const supportedDeathDistributionLine1Amount = sum(
    ...forms
      .filter(isSupportedDeathDistribution)
      .map(resolveTaxableAmountForForm5329)
  );
  const supportedDeathDistributionAmount = sum(
    ...forms
      .filter(isSupportedDeathDistribution)
      .map(resolveSupportedAutomaticDistributionAmountForForm5329)
  );
  const supportedTerminalIllnessDistributionAmount = sum(
    ...nonIraEarlyDistributionForms
      .filter((form) =>
        qualifiesForSupportedTerminalIllnessException(form)
        && !qualifiesForSupportedAge59AndHalfException(form, taxpayer)
        && !qualifiesForSupportedSeparationFromServiceException(form)
        && !qualifiesForSupportedQualifiedDomesticRelationsOrderException(form)
      )
      .map((form) =>
        Decimal.max(
          new Decimal(0),
          resolveTaxableAmountForForm5329(form).minus(
            resolveEligibleGovernmental457bDistributionExcludedFromForm5329(form)
          )
        )
      )
  );
  const supportedEligibleGovernmental457bCode2DistributionsIncludedInIncome = sum(
    ...forms
      .filter(isEligibleGovernmental457bCode2Distribution)
      .map(resolveTaxableAmountForForm5329)
  );
  const supportedEligibleGovernmental457bDistributionsExcludedFromLine1 = sum(
    ...forms
      .filter(isEligibleGovernmental457bEarlyDistribution)
      .map(resolveEligibleGovernmental457bDistributionExcludedFromForm5329)
  );
  const partialTraditionalIraRepaymentEligibleDistributions = canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
    ? Decimal.min(form8606.repaymentEligibleDistributions, earlyTraditionalIraDistributions)
    : new Decimal(0);
  const partialTraditionalIraRepaymentEligibleTaxableShare = canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
    ? allocateProportionalTraditionalIraShare(
      form8606.line15cRepaymentEligibleTaxableShare,
      partialTraditionalIraRepaymentEligibleDistributions,
      form8606.repaymentEligibleDistributions
    )
    : new Decimal(0);
  const partialTraditionalIraRepaymentReduction = canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
    ? allocateProportionalTraditionalIraShare(
      form8606.line15cRepaymentReduction,
      partialTraditionalIraRepaymentEligibleTaxableShare,
      form8606.line15cRepaymentEligibleTaxableShare
    )
    : new Decimal(0);
  const partialRothIraRepaymentEligibleDistributions = canUsePartialForm8606RothEarlyDistributionAllocation
    ? allocateProportionalRothIraShare(
      form8606.rothRepaymentEligibleDistributions,
      rothEarlyDistributionGross,
      totalRothIraDistributions
    )
    : new Decimal(0);
  const partialRothIraRepaymentEligibleTaxableShare = canUsePartialForm8606RothEarlyDistributionAllocation
    ? allocateProportionalRothIraShare(
      form8606.line25cRepaymentEligibleTaxableShare,
      partialRothIraRepaymentEligibleDistributions,
      form8606.rothRepaymentEligibleDistributions
    )
    : new Decimal(0);
  const partialRothIraRepaymentReduction = canUsePartialForm8606RothEarlyDistributionAllocation
    ? allocateProportionalRothIraShare(
      form8606.line25cRepaymentReduction,
      partialRothIraRepaymentEligibleTaxableShare,
      form8606.line25cRepaymentEligibleTaxableShare
    )
    : new Decimal(0);

  const simpleNonRothIraEarlyDistributions = sum(
    ...earlyTraditionalIraForms
      .filter((form) => isSimpleIraFirstTwoYearDistribution(form))
      .map(resolveTraditionalIraDistributionAmountForForm8606Default)
  );
  const simpleRothIraEarlyDistributions = sum(
    ...earlyRothDistributionForms
      .filter((form) => isSimpleIraFirstTwoYearDistribution(form))
      .map((form) => d(form.grossDistribution))
  );
  const rothEarlyDistributionsSubjectToAdditionalTax = Decimal.max(
    new Decimal(0),
    rothEarlyDistributionsIncludedInIncome
      .minus(rothExceptionAmount)
      .minus(supportedIncorrectEarlyRothDistributionAge59AndHalfAmount)
  );
  const simpleIRADistributionsWithinFirstTwoYears = (
    useForm8606ForTraditionalEarlyDistributions
    && earlyTraditionalIraDistributions.greaterThan(0)
      ? nonRothIraEarlyDistributions.times(
        simpleNonRothIraEarlyDistributions.dividedBy(earlyTraditionalIraDistributions)
      )
      : canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
        ? allocateProportionalTraditionalIraShare(
          form8606.line15a,
          simpleNonRothIraEarlyDistributions,
          totalTraditionalIraDistributions
        )
      : simpleNonRothIraEarlyDistributions
  ).plus(
    (useForm8606ForRothEarlyDistributions || canUsePartialForm8606RothEarlyDistributionAllocation)
    && rothEarlyDistributionGross.greaterThan(0)
      ? rothEarlyDistributionsSubjectToAdditionalTax.times(
        simpleRothIraEarlyDistributions.dividedBy(rothEarlyDistributionGross)
      )
      : sum(
        ...earlyRothDistributionForms
          .filter((form) => isSimpleIraFirstTwoYearDistribution(form))
          .map(resolveTaxableAmountForForm5329)
      )
  );
  const supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome =
    useForm8606ForTraditionalEarlyDistributions
      ? form8606.line15b
      : canUsePartialForm8606TraditionalEarlyDistributionLine1Allocation && form8606
        ? allocateProportionalTraditionalIraShare(
          form8606.line15b,
          earlyTraditionalIraDistributions,
          totalTraditionalIraDistributions
        )
        : new Decimal(0);
  const supportedDisabilityDistributionAmount = supportedTraditionalIraDisabilityDistributionAmount
    .plus(supportedNonIraDisabilityDistributionAmount);
  const supportedIncorrectEarlyDistributionAge59AndHalfAmount =
    supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount
      .plus(supportedIncorrectNonIraDistributionAge59AndHalfAmount)
      .plus(supportedIncorrectEarlyRothDistributionAge59AndHalfAmount);
  const supportedRepaymentEligibleTraditionalDistributionTaxableShare =
    useForm8606ForTraditionalEarlyDistributions
    && supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount.isZero()
      ? form8606.line15cRepaymentEligibleRemainingTaxableShare
      : canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
        && supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount.isZero()
        ? Decimal.max(
          new Decimal(0),
          partialTraditionalIraRepaymentEligibleTaxableShare.minus(partialTraditionalIraRepaymentReduction)
        )
      : new Decimal(0);
  const supportedRepaymentEligibleTraditionalDistributionExceptionNumber =
    useForm8606ForTraditionalEarlyDistributions
    && supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount.isZero()
    && supportedRepaymentEligibleTraditionalDistributionTaxableShare.greaterThan(0)
      ? form8606.line15cExceptionNumber
      : canUsePartialForm8606BasisAllocationForTraditionalEarlyDistributions
        && supportedIncorrectTraditionalIraDistributionAge59AndHalfAmount.isZero()
        && supportedRepaymentEligibleTraditionalDistributionTaxableShare.greaterThan(0)
        ? form8606.line15cExceptionNumber
      : undefined;
  const supportedRepaymentEligibleRothDistributionTaxableShare =
    supportedIncorrectEarlyRothDistributionAge59AndHalfAmount.greaterThan(0)
      ? new Decimal(0)
      : useForm8606ForRothEarlyDistributions
        ? form8606.line25cRepaymentEligibleRemainingTaxableShare
        : canUsePartialForm8606RothEarlyDistributionAllocation
          ? Decimal.max(
            new Decimal(0),
            partialRothIraRepaymentEligibleTaxableShare.minus(partialRothIraRepaymentReduction)
          )
          : new Decimal(0);
  const supportedRepaymentEligibleRothDistributionExceptionNumber =
    supportedRepaymentEligibleRothDistributionTaxableShare.greaterThan(0)
      ? form8606?.line25cExceptionNumber
      : undefined;

  return {
    earlyDistributionsIncludedInIncome: nonRothIraEarlyDistributions
      .plus(supportedTraditionalIraDisabilityDistributionAmount)
      .plus(supportedDeathDistributionLine1Amount)
      .plus(iraProhibitedTransactionEarlyDistributions)
      .plus(nonIraEarlyDistributions)
      .plus(supportedNonIraDisabilityDistributionLine1Amount)
      .plus(supportedEligibleGovernmental457bCode2DistributionsIncludedInIncome)
      .plus(returnedContributionTaxableEarnings)
      .plus(rothEarlyDistributionsIncludedInIncome),
    distributionsNotSubjectToAdditionalTax: supportedSeparationFromServiceAfterAge55Amount
      .plus(supportedDisabilityDistributionAmount)
      .plus(supportedDeathDistributionAmount)
      .plus(supportedTerminalIllnessDistributionAmount)
      .plus(supportedQualifiedDomesticRelationsOrderDistributionAmount)
      .plus(supportedMedicalExpenseExceptionAmount)
      .plus(supportedIncorrectEarlyDistributionAge59AndHalfAmount)
      .plus(returnedContributionTaxableEarnings)
      .plus(rothExceptionAmount)
      .plus(supportedRepaymentEligibleTraditionalDistributionTaxableShare)
      .plus(supportedRepaymentEligibleRothDistributionTaxableShare),
    simpleIRADistributionsWithinFirstTwoYears,
    supportedMedicalExpenseExceptionAmount,
    supportedDeathDistributionAmount,
    supportedTerminalIllnessDistributionAmount,
    supportedSeparationFromServiceAfterAge55Amount,
    supportedDisabilityDistributionAmount,
    supportedQualifiedDomesticRelationsOrderDistributionAmount,
    supportedIncorrectEarlyDistributionAge59AndHalfAmount,
    supportedQualifiedDisasterRecoveryDistributionsIncludedInIncome,
    supportedEligibleGovernmental457bDistributionsExcludedFromLine1,
    supportedReturnedContributionByDueDateTaxableEarnings: returnedContributionTaxableEarnings,
    supportedQualifiedFirstTimeHomebuyerDistribution: rothExceptionAmount,
    supportedRepaymentEligibleTraditionalDistributionTaxableShare,
    supportedRepaymentEligibleTraditionalDistributionExceptionNumber,
    supportedRepaymentEligibleRothDistributionTaxableShare,
    supportedRepaymentEligibleRothDistributionExceptionNumber,
  };
}

function isStandardEarlyDistribution(form: Form1099R): boolean {
  if (isPriorYearTaxableDistribution(form) || isReturnedContributionByDueDate(form) || form.excessContributionReturnedWithoutEarnings) {
    return false;
  }

  if (form.disabilityPensionBeforeMinimumRetirementAge) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("1") || upperCode.includes("S");
}

function qualifiesForSupportedSeparationFromServiceException(form: Form1099R): boolean {
  return !form.iraSepSimple
    && !form.eligibleGovernmental457bPlan
    && (
      form.separationFromServiceAfterAge55ExceptionApplies
      || form.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
    );
}

function qualifiesForSupportedQualifiedDomesticRelationsOrderException(form: Form1099R): boolean {
  return !form.iraSepSimple
    && !form.eligibleGovernmental457bPlan
    && form.qualifiedDomesticRelationsOrderExceptionApplies;
}

function qualifiesForSupportedTerminalIllnessException(form: Form1099R): boolean {
  return !form.iraSepSimple
    && !form.eligibleGovernmental457bPlan
    && form.terminalIllnessExceptionApplies;
}

function isSupportedDisabilityDistribution(form: Form1099R): boolean {
  if (
    isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
    || form.disabilityPensionBeforeMinimumRetirementAge
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("3");
}

function isSupportedDeathDistribution(form: Form1099R): boolean {
  if (
    isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
    || form.disabilityPensionBeforeMinimumRetirementAge
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("4");
}

function isSupportedTraditionalIraDisabilityDistribution(form: Form1099R): boolean {
  return isSupportedDisabilityDistribution(form)
    && isIraForm1099RDistribution(form)
    && !isEarlyRothDistribution(form);
}

function isSupportedNonIraDisabilityDistribution(form: Form1099R): boolean {
  return isSupportedDisabilityDistribution(form) && !isIraForm1099RDistribution(form);
}

function isNonRothIraEarlyDistribution(form: Form1099R): boolean {
  return isIraForm1099RDistribution(form)
    && isStandardEarlyDistribution(form)
    && !isEarlyRothDistribution(form);
}

function isIraProhibitedTransactionEarlyDistribution(
  form: Form1099R,
  taxpayer: TaxYearInput["taxpayer"]
): boolean {
  if (
    !isIraForm1099RDistribution(form)
    || isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("5") && isKnownUnderAge59AndHalfOnFirstDayOfTaxYear(taxpayer, form.accountHolder);
}

function isKnownUnderAge59AndHalfOnFirstDayOfTaxYear(
  taxpayer: TaxYearInput["taxpayer"],
  accountHolder?: Form1099R["accountHolder"]
): boolean {
  const primaryUnderAge59AndHalf = isUnderAge59AndHalfOnFirstDayOfTaxYear(
    taxpayer.primary.dateOfBirth,
    taxpayer.taxYear
  );

  if (accountHolder === "primary") {
    return primaryUnderAge59AndHalf;
  }

  if (accountHolder === "spouse") {
    return taxpayer.spouse
      ? isUnderAge59AndHalfOnFirstDayOfTaxYear(taxpayer.spouse.dateOfBirth, taxpayer.taxYear)
      : false;
  }

  if (taxpayer.filingStatus !== "married_filing_jointly" || !taxpayer.spouse) {
    return primaryUnderAge59AndHalf;
  }

  const spouseUnderAge59AndHalf = isUnderAge59AndHalfOnFirstDayOfTaxYear(
    taxpayer.spouse.dateOfBirth,
    taxpayer.taxYear
  );

  return primaryUnderAge59AndHalf === spouseUnderAge59AndHalf
    ? primaryUnderAge59AndHalf
    : false;
}

function isKnownAge59AndHalfOrOlderOnFirstDayOfTaxYear(
  taxpayer: TaxYearInput["taxpayer"],
  accountHolder?: Form1099R["accountHolder"]
): boolean {
  const primaryAge59AndHalfOrOlder = !isUnderAge59AndHalfOnFirstDayOfTaxYear(
    taxpayer.primary.dateOfBirth,
    taxpayer.taxYear
  );

  if (accountHolder === "primary") {
    return primaryAge59AndHalfOrOlder;
  }

  if (accountHolder === "spouse") {
    return taxpayer.spouse
      ? !isUnderAge59AndHalfOnFirstDayOfTaxYear(taxpayer.spouse.dateOfBirth, taxpayer.taxYear)
      : false;
  }

  if (taxpayer.filingStatus !== "married_filing_jointly" || !taxpayer.spouse) {
    return primaryAge59AndHalfOrOlder;
  }

  const spouseAge59AndHalfOrOlder = !isUnderAge59AndHalfOnFirstDayOfTaxYear(
    taxpayer.spouse.dateOfBirth,
    taxpayer.taxYear
  );

  return primaryAge59AndHalfOrOlder === spouseAge59AndHalfOrOlder
    ? primaryAge59AndHalfOrOlder
    : false;
}

function isKnownAge59AndHalfOrOlderOnDate(
  taxpayer: TaxYearInput["taxpayer"],
  comparisonDate: string,
  accountHolder?: Form1099R["accountHolder"]
): boolean {
  const primaryAge59AndHalfOrOlder = !isUnderAge59AndHalfOnDate(
    taxpayer.primary.dateOfBirth,
    comparisonDate
  );

  if (accountHolder === "primary") {
    return primaryAge59AndHalfOrOlder;
  }

  if (accountHolder === "spouse") {
    return taxpayer.spouse
      ? !isUnderAge59AndHalfOnDate(taxpayer.spouse.dateOfBirth, comparisonDate)
      : false;
  }

  if (taxpayer.filingStatus !== "married_filing_jointly" || !taxpayer.spouse) {
    return primaryAge59AndHalfOrOlder;
  }

  const spouseAge59AndHalfOrOlder = !isUnderAge59AndHalfOnDate(
    taxpayer.spouse.dateOfBirth,
    comparisonDate
  );

  return primaryAge59AndHalfOrOlder === spouseAge59AndHalfOrOlder
    ? primaryAge59AndHalfOrOlder
    : false;
}

function isUnderAge59AndHalfOnFirstDayOfTaxYear(dateOfBirth: string, taxYear: number): boolean {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const firstDayOfTaxYear = new Date(Date.UTC(taxYear, 0, 1));
  return isBeforeAge59AndHalfDate(birthDate, firstDayOfTaxYear);
}

function isUnderAge59AndHalfOnDate(dateOfBirth: string, comparisonDate: string): boolean {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const comparison = new Date(`${comparisonDate}T00:00:00Z`);

  if (Number.isNaN(comparison.getTime())) {
    return true;
  }

  return isBeforeAge59AndHalfDate(birthDate, comparison);
}

function isBeforeAge59AndHalfDate(birthDate: Date, comparisonDate: Date): boolean {
  const age59AndHalfDate = addUtcYearsAndMonthsClamped(birthDate, 59, 6);

  return comparisonDate < age59AndHalfDate;
}

function addUtcYearsAndMonthsClamped(date: Date, yearsToAdd: number, monthsToAdd: number): Date {
  const sourceYear = date.getUTCFullYear() + yearsToAdd;
  const sourceMonth = date.getUTCMonth() + monthsToAdd;
  const targetYear = sourceYear + Math.floor(sourceMonth / 12);
  const targetMonth = ((sourceMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(date.getUTCDate(), lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function qualifiesForSupportedAge59AndHalfException(
  form: Form1099R,
  taxpayer: TaxYearInput["taxpayer"]
): boolean {
  if (
    isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
    || form.disabilityPensionBeforeMinimumRetirementAge
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  const isIncorrectlyReportedEarlyDistribution =
    upperCode.includes("1")
    || upperCode.includes("J")
    || upperCode.includes("S");

  return isIncorrectlyReportedEarlyDistribution
    && (
      form.distributionDate
        ? isKnownAge59AndHalfOrOlderOnDate(taxpayer, form.distributionDate, form.accountHolder)
        : isKnownAge59AndHalfOrOlderOnFirstDayOfTaxYear(taxpayer, form.accountHolder)
    );
}

function isSimpleIraFirstTwoYearDistribution(form: Form1099R): boolean {
  if (!isStandardEarlyDistribution(form)) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("S");
}

function isEligibleGovernmental457bEarlyDistribution(form: Form1099R): boolean {
  return form.eligibleGovernmental457bPlan
    && !isIraForm1099RDistribution(form)
    && (
      isStandardEarlyDistribution(form)
      || isEligibleGovernmental457bCode2Distribution(form)
      || isSupportedDisabilityDistribution(form)
      || isSupportedDeathDistribution(form)
    );
}

function isEligibleGovernmental457bCode2Distribution(form: Form1099R): boolean {
  if (
    !form.eligibleGovernmental457bPlan
    || isIraForm1099RDistribution(form)
    || isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
    || form.disabilityPensionBeforeMinimumRetirementAge
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  return upperCode.includes("2");
}

function isEarlyRothDistribution(form: Form1099R): boolean {
  if (
    !isIraForm1099RDistribution(form)
    || isPriorYearTaxableDistribution(form)
    || isReturnedContributionByDueDate(form)
    || form.excessContributionReturnedWithoutEarnings
  ) {
    return false;
  }

  const upperCode = form.distributionCode?.toUpperCase() ?? "";
  // Code T still needs Form 8606 when the five-year qualified-distribution
  // branch is unresolved, but it already certifies that an exception applies
  // for Form 5329 purposes.
  return upperCode.includes("J");
}

function resolveTaxableAmountForForm5329(form: Form1099R): Decimal {
  return resolveForm1099RTaxableAmount(form);
}

function resolveSupportedAutomaticDistributionAmountForForm5329(form: Form1099R): Decimal {
  const taxableAmount = resolveTaxableAmountForForm5329(form);

  if (!form.eligibleGovernmental457bPlan || isIraForm1099RDistribution(form)) {
    return taxableAmount;
  }

  return Decimal.min(
    taxableAmount,
    Decimal.max(new Decimal(0), d(form.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount))
  );
}

function resolveEligibleGovernmental457bDistributionExcludedFromForm5329(form: Form1099R): Decimal {
  if (!isEligibleGovernmental457bEarlyDistribution(form)) {
    return new Decimal(0);
  }

  const taxableAmount = resolveTaxableAmountForForm5329(form);
  const transferredQualifiedPlanTaxableAmount = Decimal.min(
    taxableAmount,
    Decimal.max(new Decimal(0), d(form.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount))
  );

  return Decimal.max(new Decimal(0), taxableAmount.minus(transferredQualifiedPlanTaxableAmount));
}

function resolveReturnedContributionByDueDateTaxableAmountForForm5329(form: Form1099R): Decimal {
  if (
    !isIraForm1099RDistribution(form)
    || !isReturnedContributionByDueDate(form)
    || form.taxableAmount === undefined
  ) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.taxableAmount));
}

function isPriorYearTaxableDistribution(form: Form1099R): boolean {
  return form.distributionCode?.toUpperCase().includes("P") ?? false;
}

function isReturnedContributionByDueDate(form: Form1099R): boolean {
  return isIraForm1099RDistribution(form)
    && (
      form.returnedContributionByDueDate
      || (
        !isPriorYearTaxableDistribution(form)
        && (form.distributionCode?.toUpperCase().includes("8") ?? false)
      )
    );
}

/** Returns true if the person is age 50 or older by December 31 of the tax year. */
function isAge50OrOlder(dateOfBirth: string, taxYear: number): boolean {
  const birth = new Date(dateOfBirth);
  const yearEnd = new Date(taxYear, 11, 31); // December 31
  const ageAtYearEnd = yearEnd.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(taxYear, birth.getMonth(), birth.getDate());
  return birthdayThisYear <= yearEnd ? ageAtYearEnd >= 50 : ageAtYearEnd - 1 >= 50;
}

/**
 * Combine two per-spouse Form 8606 results into a single combined result.
 * Sums all Decimal fields and merges audit lines.
 */
function combineForm8606Results(a: Form8606Result, b: Form8606Result): Form8606Result {
  return {
    line1: a.line1.plus(b.line1),
    line2: a.line2.plus(b.line2),
    line3: a.line3.plus(b.line3),
    line4: a.line4.plus(b.line4),
    line5: a.line5.plus(b.line5),
    line6: a.line6.plus(b.line6),
    outstandingRollovers: a.outstandingRollovers.plus(b.outstandingRollovers),
    currentYearRepaymentsTreatedAsRollovers: a.currentYearRepaymentsTreatedAsRollovers.plus(b.currentYearRepaymentsTreatedAsRollovers),
    qualifiedCharitableDistributions: a.qualifiedCharitableDistributions.plus(b.qualifiedCharitableDistributions),
    rolledOverDistributions: a.rolledOverDistributions.plus(b.rolledOverDistributions),
    returnedContributionsByDueDate: a.returnedContributionsByDueDate.plus(b.returnedContributionsByDueDate),
    returnedExcessContributions: a.returnedExcessContributions.plus(b.returnedExcessContributions),
    qualifiedHsaFundingDistributions: a.qualifiedHsaFundingDistributions.plus(b.qualifiedHsaFundingDistributions),
    qualifiedDisasterDistributions: a.qualifiedDisasterDistributions.plus(b.qualifiedDisasterDistributions),
    repaymentEligibleDistributions: a.repaymentEligibleDistributions.plus(b.repaymentEligibleDistributions),
    line15cExceptionNumber: a.line15cExceptionNumber ?? b.line15cExceptionNumber,
    repaymentWithin3YearWindow: a.repaymentWithin3YearWindow.plus(b.repaymentWithin3YearWindow),
    priorYearLine15cBasisAdjustment: a.priorYearLine15cBasisAdjustment.plus(b.priorYearLine15cBasisAdjustment),
    line7Exclusions: a.line7Exclusions.plus(b.line7Exclusions),
    line7: a.line7.plus(b.line7),
    line8: a.line8.plus(b.line8),
    line9: a.line9.plus(b.line9),
    line10: a.line10.plus(b.line10),
    line11: a.line11.plus(b.line11),
    line12: a.line12.plus(b.line12),
    line13: a.line13.plus(b.line13),
    line14: a.line14.plus(b.line14),
    line15a: a.line15a.plus(b.line15a),
    line15b: a.line15b.plus(b.line15b),
    line15c: a.line15c.plus(b.line15c),
    line15cRepaymentEligibleTaxableShare: a.line15cRepaymentEligibleTaxableShare.plus(b.line15cRepaymentEligibleTaxableShare),
    line15cRepaymentEligibleRemainingTaxableShare: a.line15cRepaymentEligibleRemainingTaxableShare.plus(b.line15cRepaymentEligibleRemainingTaxableShare),
    line15cRepaymentReduction: a.line15cRepaymentReduction.plus(b.line15cRepaymentReduction),
    line15cBasisAdjustment: a.line15cBasisAdjustment.plus(b.line15cBasisAdjustment),
    line16: a.line16.plus(b.line16),
    line17: a.line17.plus(b.line17),
    line18: a.line18.plus(b.line18),
    qualifiedRothDistributionsExcludedFromLine19: a.qualifiedRothDistributionsExcludedFromLine19.plus(b.qualifiedRothDistributionsExcludedFromLine19),
    rothRolledOverDistributions: a.rothRolledOverDistributions.plus(b.rothRolledOverDistributions),
    rothReturnedContributionsByDueDate: a.rothReturnedContributionsByDueDate.plus(b.rothReturnedContributionsByDueDate),
    rothReturnedExcessContributions: a.rothReturnedExcessContributions.plus(b.rothReturnedExcessContributions),
    rothQualifiedHsaFundingDistributions: a.rothQualifiedHsaFundingDistributions.plus(b.rothQualifiedHsaFundingDistributions),
    line19Exclusions: a.line19Exclusions.plus(b.line19Exclusions),
    priorQualifiedFirstTimeHomebuyerDistributions: a.priorQualifiedFirstTimeHomebuyerDistributions.plus(b.priorQualifiedFirstTimeHomebuyerDistributions),
    priorYearLine25cBasisAdjustment: a.priorYearLine25cBasisAdjustment.plus(b.priorYearLine25cBasisAdjustment),
    rothContributionBasis: a.rothContributionBasis.plus(b.rothContributionBasis),
    rothConversionBasis: a.rothConversionBasis.plus(b.rothConversionBasis),
    rothQualifiedDisasterDistributions: a.rothQualifiedDisasterDistributions.plus(b.rothQualifiedDisasterDistributions),
    rothRepaymentEligibleDistributions: a.rothRepaymentEligibleDistributions.plus(b.rothRepaymentEligibleDistributions),
    line25cExceptionNumber: a.line25cExceptionNumber ?? b.line25cExceptionNumber,
    rothRepaymentsWithin3YearWindow: a.rothRepaymentsWithin3YearWindow.plus(b.rothRepaymentsWithin3YearWindow),
    line19: a.line19.plus(b.line19),
    line20: a.line20.plus(b.line20),
    line21: a.line21.plus(b.line21),
    line22: a.line22.plus(b.line22),
    line23: a.line23.plus(b.line23),
    line24: a.line24.plus(b.line24),
    line25a: a.line25a.plus(b.line25a),
    line25b: a.line25b.plus(b.line25b),
    line25c: a.line25c.plus(b.line25c),
    line25cRepaymentEligibleTaxableShare: a.line25cRepaymentEligibleTaxableShare.plus(b.line25cRepaymentEligibleTaxableShare),
    line25cRepaymentEligibleRemainingTaxableShare: a.line25cRepaymentEligibleRemainingTaxableShare.plus(b.line25cRepaymentEligibleRemainingTaxableShare),
    line25cRepaymentReduction: a.line25cRepaymentReduction.plus(b.line25cRepaymentReduction),
    line25cBasisAdjustment: a.line25cBasisAdjustment.plus(b.line25cBasisAdjustment),
    taxableTraditionalDistributions: a.taxableTraditionalDistributions.plus(b.taxableTraditionalDistributions),
    taxableRothConversions: a.taxableRothConversions.plus(b.taxableRothConversions),
    taxableRothDistributions: a.taxableRothDistributions.plus(b.taxableRothDistributions),
    lines: [...a.lines, ...b.lines],
  };
}

/**
 * Derive Form 8606 defaults for a specific owner's 1099-R forms and HSA input.
 */
function deriveForm8606DefaultsForOwner(
  ownerForms: Form1099R[],
  ownerForm8889: TaxYearInput["form8889"] | undefined,
  options: { qcdAnnualLimit?: Decimal } = {},
): {
  traditionalDistributions: Decimal;
  qualifiedCharitableDistributions: Decimal;
  rolledOverDistributions: Decimal;
  rothConversions: Decimal;
  rothDistributions: Decimal;
  rothRolledOverDistributions: Decimal;
  traditionalReturnedContributionsByDueDate: Decimal;
  traditionalReturnedExcessContributions: Decimal;
  rothReturnedContributionsByDueDate: Decimal;
  rothReturnedExcessContributions: Decimal;
  qualifiedRothDistributionsExcludedFromLine19: Decimal;
  traditionalQualifiedHsaFundingDistributions: Decimal;
  rothQualifiedHsaFundingDistributions: Decimal;
} {
  const ownerIraResult = calculateForm1099R(ownerForms, {
    qcdAnnualLimit: options.qcdAnnualLimit,
  });
  return {
    traditionalDistributions: deriveDefaultForm8606TraditionalDistributions(ownerForms),
    qualifiedCharitableDistributions: ownerIraResult.iraQualifiedCharitableDistributions,
    rolledOverDistributions: ownerIraResult.iraRolledOverDistributions,
    rothConversions: ownerIraResult.iraRothConversions,
    rothDistributions: deriveDefaultForm8606RothDistributions(ownerForms),
    rothRolledOverDistributions: deriveDefaultForm8606RothRolledOverDistributions(ownerForms),
    traditionalReturnedContributionsByDueDate: deriveDefaultForm8606TraditionalReturnedContributionsByDueDate(ownerForms),
    traditionalReturnedExcessContributions: deriveDefaultForm8606TraditionalReturnedExcessContributions(ownerForms),
    rothReturnedContributionsByDueDate: deriveDefaultForm8606RothReturnedContributionsByDueDate(ownerForms),
    rothReturnedExcessContributions: deriveDefaultForm8606RothReturnedExcessContributions(ownerForms),
    qualifiedRothDistributionsExcludedFromLine19: deriveDefaultForm8606QualifiedRothDistributionsExcludedFromLine19(ownerForms),
    traditionalQualifiedHsaFundingDistributions:
      ownerForm8889 !== undefined && ownerForm8889.qualifiedFundingDistributionSource === "traditional_ira"
        ? Decimal.max(new Decimal(0), d(ownerForm8889.qualifiedFundingDistribution))
        : new Decimal(0),
    rothQualifiedHsaFundingDistributions:
      ownerForm8889 !== undefined && ownerForm8889.qualifiedFundingDistributionSource === "roth_ira"
        ? Decimal.max(new Decimal(0), d(ownerForm8889.qualifiedFundingDistribution))
        : new Decimal(0),
  };
}

/**
 * Build a Form 8606 result for one owner by merging explicit input with defaults.
 */
function calculateForm8606ForOwner(
  ownerInput: Form8606Input,
  defaults: ReturnType<typeof deriveForm8606DefaultsForOwner>,
): Form8606Result {
  return calculateForm8606({
    ...ownerInput,
    traditionalDistributions: ownerInput.traditionalDistributions ?? defaults.traditionalDistributions.toString(),
    qualifiedCharitableDistributions: ownerInput.qualifiedCharitableDistributions ?? defaults.qualifiedCharitableDistributions.toString(),
    rolledOverDistributions: ownerInput.rolledOverDistributions ?? defaults.rolledOverDistributions.toString(),
    returnedContributionsByDueDate: ownerInput.returnedContributionsByDueDate ?? defaults.traditionalReturnedContributionsByDueDate.toString(),
    returnedExcessContributions: ownerInput.returnedExcessContributions ?? defaults.traditionalReturnedExcessContributions.toString(),
    qualifiedHsaFundingDistributions: ownerInput.qualifiedHsaFundingDistributions ?? defaults.traditionalQualifiedHsaFundingDistributions.toString(),
    rothConversions: ownerInput.rothConversions ?? defaults.rothConversions.toString(),
    rothDistributions: ownerInput.rothDistributions ?? defaults.rothDistributions.toString(),
    qualifiedRothDistributionsExcludedFromLine19: ownerInput.qualifiedRothDistributionsExcludedFromLine19 ?? defaults.qualifiedRothDistributionsExcludedFromLine19.toString(),
    rothRolledOverDistributions: ownerInput.rothRolledOverDistributions ?? defaults.rothRolledOverDistributions.toString(),
    rothReturnedContributionsByDueDate: ownerInput.rothReturnedContributionsByDueDate ?? defaults.rothReturnedContributionsByDueDate.toString(),
    rothReturnedExcessContributions: ownerInput.rothReturnedExcessContributions ?? defaults.rothReturnedExcessContributions.toString(),
    rothQualifiedHsaFundingDistributions: ownerInput.rothQualifiedHsaFundingDistributions ?? defaults.rothQualifiedHsaFundingDistributions.toString(),
  });
}
