/**
 * Output types for tax calculations.
 * Every calculated value includes an audit trail.
 */

import Decimal from "decimal.js";

/** A single calculated line with audit trail */
export interface CalculatedLine {
  form: string;
  line: string;
  description: string;
  value: Decimal;
  formula: string;
  inputs: Record<string, Decimal | string>;
  confidence?: "validated" | "best-effort";
}

// Re-export result types from engine modules
export type { ScheduleAResult } from "@/engine/schedules/schedule-a.js";
export type { Schedule1Result } from "@/engine/schedules/schedule-1.js";
export type { ScheduleCResult } from "@/engine/schedules/schedule-c.js";
export type { ScheduleDResult } from "@/engine/schedules/schedule-d.js";
export type { ScheduleFResult } from "@/engine/schedules/schedule-f.js";
export type { ScheduleSEResult } from "@/engine/schedules/schedule-se.js";
export type { Form8949Result } from "@/engine/forms/form-8949.js";
export type { Form2441Result } from "@/engine/forms/form-2441.js";
export type { Form1099SAResult } from "@/engine/forms/form-1099-sa.js";
export type { Form4562Result } from "@/engine/forms/form-4562.js";
export type { Form4797Result } from "@/engine/forms/form-4797.js";
export type { Form8919Result } from "@/engine/forms/form-8919.js";
export type { Form5329Result } from "@/engine/forms/form-5329.js";
export type { Form8880Result } from "@/engine/forms/form-8880.js";
export type { Form8606Result } from "@/engine/forms/form-8606.js";
export type { Form8889Result } from "@/engine/forms/form-8889.js";
export type { Form8936Result } from "@/engine/forms/form-8936.js";
export type { Form8839Result } from "@/engine/forms/form-8839.js";
export type { Form8801Result } from "@/engine/forms/form-8801.js";
export type { Form4684Result } from "@/engine/forms/form-4684.js";
export type { Form4952Result } from "@/engine/forms/form-4952.js";
export type { Form6198Result } from "@/engine/forms/form-6198.js";
export type { Form982Result } from "@/engine/forms/form-982.js";
export type { Form8824AggregateResult } from "@/engine/forms/form-8824.js";
export type { Form8962Result } from "@/engine/forms/form-8962.js";
export type { Form2555Result } from "@/engine/forms/form-2555.js";
export type { Form461Result } from "@/engine/forms/form-461.js";
export type { Form3800Result } from "@/engine/forms/form-3800.js";
export type { Form1099KResult } from "@/engine/forms/form-1099-k.js";
export type { PartnerBasisScheduleResult } from "@/engine/forms/partner-basis-schedule.js";
export type {
  LPPositionResult,
  YieldRewardResult,
  NFTResult,
  CryptoLendingResult,
  LiquidationResult,
  CryptoDonationResult,
  WashSaleCarryforwardResult,
  DeFiSwapResult,
} from "@/engine/forms/crypto-lot-matching.js";
export type { ScheduleHResult } from "@/engine/forms/schedule-h.js";
export type { EicResult } from "@/engine/forms/schedule-eic.js";
export type { Schedule2Result } from "@/engine/schedules/schedule-2.js";
export type { Schedule3Result } from "@/engine/schedules/schedule-3.js";
export type { SocialSecurityBenefitsWorksheetResult } from "@/engine/forms/social-security-benefits-worksheet.js";
export type { SEHealthInsuranceWorksheetResult } from "@/engine/forms/se-health-insurance-worksheet.js";
export type { Form8959Result } from "@/engine/forms/form-8959.js";
export type { Form8960Result } from "@/engine/forms/form-8960.js";

// Illinois state engine result types
export type { IL1040Result } from "@/engine/state/il-1040.js";
export type { ScheduleEEICResult } from "@/engine/state/il-schedule-e-eic.js";
export type { ScheduleICRResult } from "@/engine/state/il-schedule-icr.js";
export type { ScheduleGResult } from "@/engine/state/il-schedule-g.js";
export type { ScheduleMResult } from "@/engine/state/il-schedule-m.js";
export type { ScheduleCRResult } from "@/engine/state/il-schedule-cr.js";
export type { Schedule1299CResult } from "@/engine/state/il-schedule-1299-c.js";
export type { ScheduleNRResult } from "@/engine/state/il-schedule-nr.js";
export type { ILScheduleWITResult } from "@/engine/state/il-schedule-il-wit.js";
export type { IL2210Result } from "@/engine/state/il-2210.js";
export type { UseTaxWorksheetResult } from "@/engine/state/il-use-tax.js";

/** Complete tax return result */
export interface TaxReturnResult {
  taxYear: number;
  filingStatus: string;

  // Form 1040 digital asset question (Line 1a checkbox)
  digitalAssetQuestion: boolean;

  // Income
  totalWages: Decimal;
  totalInterest: Decimal;
  taxExemptInterest: Decimal;
  totalDividends: Decimal;
  qualifiedDividends: Decimal;
  iraDistributionsGross: Decimal;
  iraDistributionsTaxable: Decimal;
  pensionDistributionsGross: Decimal;
  pensionDistributionsTaxable: Decimal;
  socialSecurityBenefitsGross: Decimal;
  socialSecurityBenefitsTaxable: Decimal;
  capitalGainLoss: Decimal;
  otherIncome: Decimal;
  nolDeduction: Decimal;
  totalIncome: Decimal;

  // Adjustments
  adjustmentsToIncome: Decimal;
  agi: Decimal;

  // Deductions
  standardDeduction: Decimal;
  itemizedDeductions: Decimal;
  deductionUsed: "standard" | "itemized";
  deductionAmount: Decimal;
  taxableIncome: Decimal;

  // Tax computation
  ordinaryTax: Decimal;
  capitalGainsTax: Decimal;
  totalTaxBeforeCredits: Decimal;

  // Credits
  childTaxCredit: Decimal;
  foreignTaxCredit: Decimal;
  otherCredits: Decimal;
  totalCredits: Decimal;

  // Refundable credits
  earnedIncomeCredit: Decimal;

  // Additional taxes
  amt: Decimal;
  selfEmploymentTax: Decimal;
  additionalMedicareTax: Decimal;
  niitTax: Decimal;
  estimatedTaxPenalty: Decimal;
  totalAdditionalTaxes: Decimal;

  // Final
  totalTax: Decimal;
  totalPayments: Decimal;
  totalWithholding: Decimal;
  estimatedTaxPayments: Decimal;
  amountOwed: Decimal;
  refund: Decimal;

  // Carryforwards
  carryforwards: {
    capitalLoss: Decimal;
    shortTermCapitalLoss: Decimal;
    longTermCapitalLoss: Decimal;
    suspendedPassiveLosses: Array<{ partnershipName: string; amount: Decimal }>;
    /** Per-PTP suspended losses under IRC §469(k).
     *  PTP losses can only offset income from the same PTP, not other passive income. */
    suspendedPTPLosses: Array<{ partnershipName: string; amount: Decimal }>;
    foreignTaxCreditCarryforward: Decimal;
    /** Per-category FTC carryforward for multi-category IRC §904(d) tracking.
     *  Each category has independent per-year FIFO reconciliation. */
    foreignTaxCreditCarryforwardByCategory: Record<string, Array<{ taxYear: number; amount: Decimal }>>;
    qbiLossCarryforward: Decimal;
    investmentInterestExpense: Decimal;
    minimumTaxCredit: Decimal;
    charitableContributions: Decimal;
    /** Per-year charitable contribution carryforward entries after FIFO reconciliation with 5-year expiration */
    charitableContributionsByYear: Array<{ taxYear: number; amount: Decimal }>;
    /** NOL carryforward from excess business loss limitation (IRC §461(l)) */
    excessBusinessLossNOL: Decimal;
    /** Remaining NOL carryforward after the current-year IRC §172 deduction */
    nolCarryforward: Decimal;
    /** Unused general business credit carried forward (IRC §39, 20-year limit) */
    generalBusinessCredit: Decimal;
    /** Per-partnership suspended excess business interest expense under IRC
     *  §163(j). Includes prior-year suspended amounts minus current-year
     *  deductions plus current-year new partnership EBIE from K-1 Box 13 Code K. */
    suspendedBusinessInterest: Array<{ partnershipName: string; partnershipEIN: string; amount: Decimal }>;
    /** Per-entity partner/shareholder basis schedule results.
     *  Only populated when beginningBasis is provided on the K-1. */
    partnerBasis: Array<{
      partnershipName: string;
      partnershipEIN: string;
      entityType: "partnership" | "s_corporation";
      endingBasis: Decimal;
      excessDistributionGain: Decimal;
      suspendedLosses: Record<string, Decimal>;
    }>;
    /** Wash sale disallowed losses on crypto that carry forward to replacement lot basis (IRC §1091) */
    cryptoWashSaleDisallowed: Decimal;
    /** Form 5329 excess contribution carryforwards (6% excise tax base for next year).
     *  Each value is the total remaining excess after current-year reductions.
     *  Feed these into next year's Form 5329 prior-year excess inputs. */
    excessContributions: {
      traditionalIRA: Decimal;
      rothIRA: Decimal;
      coverdellESA: Decimal;
      archerMSA: Decimal;
      hsa: Decimal;
      able: Decimal;
    };
  };

  // Sub-results (from engine modules)
  scheduleA?: import("@/engine/schedules/schedule-a.js").ScheduleAResult;
  schedule1?: import("@/engine/schedules/schedule-1.js").Schedule1Result;
  scheduleB?: import("@/engine/schedules/schedule-b.js").ScheduleBResult;
  scheduleC?: import("@/engine/schedules/schedule-c.js").ScheduleCResult;
  scheduleD?: import("@/engine/schedules/schedule-d.js").ScheduleDResult;
  scheduleF?: import("@/engine/schedules/schedule-f.js").ScheduleFResult;
  scheduleE?: import("@/engine/schedules/schedule-e.js").ScheduleEResult;
  scheduleSE?: import("@/engine/schedules/schedule-se.js").ScheduleSEResult;
  form6251?: import("@/engine/forms/form-6251.js").Form6251Result;
  form8582?: import("@/engine/forms/form-8582.js").Form8582Result;
  form1099R?: import("@/engine/forms/form-1099-r.js").Form1099RResult;
  form2441?: import("@/engine/forms/form-2441.js").Form2441Result;
  form1099SA?: import("@/engine/forms/form-1099-sa.js").Form1099SAResult;
  form4137?: import("@/engine/forms/form-4137.js").Form4137Result;
  form8919?: import("@/engine/forms/form-8919.js").Form8919Result;
  form4797?: import("@/engine/forms/form-4797.js").Form4797Result;
  form5329?: import("@/engine/forms/form-5329.js").Form5329Result;
  form8880?: import("@/engine/forms/form-8880.js").Form8880Result;
  form8606?: import("@/engine/forms/form-8606.js").Form8606Result;
  form8606ByOwner?: Partial<Record<
    "primary" | "spouse",
    import("@/engine/forms/form-8606.js").Form8606Result
  >>;
  form8889?: import("@/engine/forms/form-8889.js").Form8889Result;
  form8889ByOwner?: Partial<Record<
    import("@/models/inputs.js").Form8889Input["accountOwner"],
    import("@/engine/forms/form-8889.js").Form8889Result
  >>;
  seHealthInsuranceWorksheet?: import("@/engine/forms/se-health-insurance-worksheet.js").SEHealthInsuranceWorksheetResult;
  socialSecurityBenefitsWorksheet?: import("@/engine/forms/social-security-benefits-worksheet.js").SocialSecurityBenefitsWorksheetResult;
  iraDeductionWorksheet?: {
    magi: Decimal;
    primary: import("@/engine/forms/ira-deduction-worksheet.js").IraDeductionResult;
    spouse?: import("@/engine/forms/ira-deduction-worksheet.js").IraDeductionResult;
    totalDeduction: Decimal;
  };
  form8959?: import("@/engine/forms/form-8959.js").Form8959Result;
  form8962?: import("@/engine/forms/form-8962.js").Form8962Result;
  form8960?: import("@/engine/forms/form-8960.js").Form8960Result;
  form982?: import("@/engine/forms/form-982.js").Form982Result;
  form8824?: import("@/engine/forms/form-8824.js").Form8824AggregateResult;
  form2210?: import("@/engine/forms/form-2210.js").Form2210Result;
  form8815?: import("@/engine/forms/form-8815.js").Form8815Result;
  form8812?: import("@/engine/forms/form-8812.js").Form8812Result;
  schedule1A?: import("@/engine/schedules/schedule-1-a.js").Schedule1AResult;
  form8995?: import("@/engine/forms/form-8995.js").Form8995Result;
  form8995A?: import("@/engine/forms/form-8995-a.js").Form8995AResult;
  form8936?: import("@/engine/forms/form-8936.js").Form8936Result;
  form8801?: import("@/engine/forms/form-8801.js").Form8801Result;
  form4684?: import("@/engine/forms/form-4684.js").Form4684Result;
  form4952?: import("@/engine/forms/form-4952.js").Form4952Result;
  scheduleH?: import("@/engine/forms/schedule-h.js").ScheduleHResult;
  schedule2?: import("@/engine/schedules/schedule-2.js").Schedule2Result;
  schedule3?: import("@/engine/schedules/schedule-3.js").Schedule3Result;
  scheduleR?: import("@/engine/forms/schedule-r.js").ScheduleRResult;
  scheduleEIC?: import("@/engine/forms/schedule-eic.js").EicResult;
  form2555?: import("@/engine/forms/form-2555.js").Form2555Result;
  form8615?: import("@/engine/forms/form-8615.js").Form8615Result;
  form8814?: import("@/engine/forms/form-8814.js").AggregatedForm8814;
  form8839?: import("@/engine/forms/form-8839.js").Form8839Result;
  form461?: import("@/engine/forms/form-461.js").Form461Result;
  scheduleJ?: import("@/engine/forms/schedule-j.js").ScheduleJResult;
  form3800?: import("@/engine/forms/form-3800.js").Form3800Result;
  form1099Q?: import("@/engine/forms/form-1099-q.js").Form1099QResult;
  form1099K?: import("@/engine/forms/form-1099-k.js").Form1099KResult;
  partnerBasisSchedules?: import("@/engine/forms/partner-basis-schedule.js").PartnerBasisScheduleResult[];
  form8915F?: import("@/engine/forms/form-8915-f.js").Form8915FResult;
  taxableRefundWorksheet?: import("@/engine/forms/taxable-refund-worksheet.js").TaxableRefundWorksheetResult;
  /** State and local general sales tax deduction worksheet result */
  salesTaxDeduction?: import("@/engine/forms/state-sales-tax-deduction-worksheet.js").SalesTaxDeductionResult;
  /** Form 1098-E student loan interest aggregation summary */
  form1098ESummary?: import("@/engine/forms/form-1098-e.js").Form1098EResult;
  /** K-1 Form 1041 trust/estate beneficiary income aggregation summary */
  scheduleK1Form1041Summary?: {
    numberOfK1s: number;
    totalInterest: import("decimal.js").default;
    totalOrdinaryDividends: import("decimal.js").default;
    totalQualifiedDividends: import("decimal.js").default;
    totalShortTermCapitalGain: import("decimal.js").default;
    totalLongTermCapitalGain: import("decimal.js").default;
    totalOtherPortfolioIncome: import("decimal.js").default;
    totalEstateTaxDeduction: import("decimal.js").default;
    totalSection67eDeductions: import("decimal.js").default;
    totalTaxExemptInterest: import("decimal.js").default;
    totalForeignTaxesPaid: import("decimal.js").default;
    totalQBI: import("decimal.js").default;
    totalQualifiedReitDividends: import("decimal.js").default;
    totalQualifiedPTPIncome: import("decimal.js").default;
  };
  // Crypto / DeFi Phase 2 sub-results
  cryptoLPPositions?: import("@/engine/forms/crypto-lot-matching.js").LPPositionResult;
  cryptoYieldRewards?: import("@/engine/forms/crypto-lot-matching.js").YieldRewardResult;
  cryptoNFT?: import("@/engine/forms/crypto-lot-matching.js").NFTResult;
  cryptoLending?: import("@/engine/forms/crypto-lot-matching.js").CryptoLendingResult;
  cryptoLiquidations?: import("@/engine/forms/crypto-lot-matching.js").LiquidationResult;
  cryptoDonations?: import("@/engine/forms/crypto-lot-matching.js").CryptoDonationResult;
  cryptoWashSaleCarryforward?: import("@/engine/forms/crypto-lot-matching.js").WashSaleCarryforwardResult;
  cryptoDeFiSwaps?: import("@/engine/forms/crypto-lot-matching.js").DeFiSwapResult;

  stateReturns?: {
    illinois?: import("@/engine/state/il-1040.js").IL1040Result;
    pennsylvania?:
      | import("@/engine/state/pa-orchestrator.js").PAOrchestratorResult
      | import("@/engine/state/pa-nonresident-orchestrator.js").PANonresidentOrchestratorResult;
    newJersey?: import("@/engine/state/nj-1040.js").NJ1040Result;
    newYork?: import("@/engine/state/ny-it201-full-return.js").NYIT201FullReturnResult;
  };

  // Audit trail
  allLines: CalculatedLine[];
}
