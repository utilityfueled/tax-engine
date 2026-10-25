/** Actual current-year loss origin. Spec: spec/federal/form-172-return.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Schedule1Result } from "@/engine/schedules/schedule-1.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import { calculateForm172Origin, type Form172OriginInput, type Form172OriginResult } from "./form-172-origin.js";
import type { NetOperatingLossReturnResult } from "./net-operating-loss-return.js";

export interface Form172ReturnContext {
  agi: Decimal;
  totalIncome: Decimal;
  totalWages: Decimal;
  taxableInterest: Decimal;
  ordinaryDividends: Decimal;
  iraTaxable: Decimal;
  pensionTaxable: Decimal;
  taxableSocialSecurity: Decimal;
  capitalGainLoss: Decimal;
  deductionUsed: "standard" | "itemized";
  deductionAmount: Decimal;
  qbiDeduction: Decimal;
  additionalDeductions: Decimal;
  nonitemizerCharitableDeduction: Decimal;
  schedule1: Schedule1Result;
  currentExcessBusinessLoss: Decimal;
  alternativeTaxIncome: Decimal;
  alternativeTaxPrivateActivityInterest: Decimal;
  investmentIncome: Decimal;
  unverifiedAnnuitySourceIds: string[];
  priorLoss: NetOperatingLossReturnResult;
}
interface Form172SourceValidation { taxYear: number; sourceFactsVerified: true; calculationComplete: false }
export interface Form172ReturnResult {
  taxYear: number;
  sourceFactsVerified: true;
  calculationComplete: true;
  regular: Form172OriginResult;
  alternativeTax: Form172OriginResult;
  investment: Form172OriginResult;
  section1411OriginalLoss: Decimal;
  currentExcessBusinessLoss: Decimal;
  alternativeExcessBusinessLoss: Decimal;
  newRegularCarryforward: Decimal;
  newAlternativeCarryforward: Decimal;
  regularClosingCarryforward: Decimal;
  alternativeClosingCarryforward: Decimal;
  lines: CalculatedLine[];
}

function actualNonnegative(value: string | undefined, label: string): Decimal {
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Form172 ${label} must be finite and nonnegative`);
  return result;
}

export function calculateForm172Return(input: TaxYearInput): Form172SourceValidation;
export function calculateForm172Return(input: TaxYearInput, context: Form172ReturnContext): Form172ReturnResult;
export function calculateForm172Return(input: TaxYearInput, context?: Form172ReturnContext): Form172SourceValidation | Form172ReturnResult {
  const facts = input.form172;
  const year = input.taxpayer.taxYear;
  if (!facts || ![2025, 2026].includes(year) || facts.sourceTaxYear !== year || !facts.sourceReference?.trim()
    || facts.sourceFactsConfirmed !== true || facts.allCurrentYearSourcesIncluded !== true
    || !Array.isArray(facts.businessSources)) throw new Error("Form172 requires complete actual current origin year, source reference and confirmations");
  if (!input.netOperatingLoss) throw new Error("Form172 requires the complete actual prior regular and separate AMT carry packet, including known empty histories");
  if (facts.farmingLossIncluded !== false || facts.cancelledDebtIncluded !== false || facts.estateOrTrustLossIncluded !== false) {
    throw new Error("Form172 farming, cancelled-debt and estate origin methods require their actual separate source worksheets");
  }
  const alternative = facts.alternativeTax;
  if (alternative?.sourceFactsConfirmed !== true || !alternative.sourceReference?.trim()
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true
    || alternative.regularDepreciationSameAsAlternativeConfirmed !== true) {
    throw new Error("Form172 requires independent actual current AMT basis, depreciation and loss-limit facts");
  }
  const business = input.scheduleC;
  if (facts.businessSources.length !== (business ? 1 : 0)) throw new Error("Form172 current business source list must match the actual Schedule C");
  if (business) {
    const source = facts.businessSources[0];
    if (!source) throw new Error("Form172 current business source is missing");
    if (source.sourceId !== "scheduleC" || !source.businessName?.trim() || source.businessName.trim() !== business.businessName?.trim()
      || !source.accountHolder || source.accountHolder !== business.accountHolder
      || (source.accountHolder === "spouse" && (!input.taxpayer.spouse || input.taxpayer.filingStatus !== "married_filing_jointly"))
      || !source.sourceReference?.trim() || source.sourceFactsConfirmed !== true) {
      throw new Error("Form172 current business source must bind its actual identity and owner");
    }
    if (source.materiallyParticipated !== true || business.qbiMateriallyParticipated !== true
      || source.allInvestmentAtRisk !== true || business.allInvestmentAtRisk !== true || source.financialTradingBusiness !== false) {
      throw new Error("Form172 current origin requires actual active, all-at-risk, nontrading business facts; other methods remain separate");
    }
  } else if (input.form1099Nec.length) throw new Error("Form172 NEC business income requires its actual Schedule C source classification");

  // Reject actual unsupported records before netting so offsetting sources cannot
  // make a missing classification look like a known zero.
  for (const key of ["scheduleF", "scheduleK1", "scheduleK1Form1041", "rentalProperties", "form1099Misc", "form1099C", "codExclusion",
    "form1099Q", "formW2G", "form1099K", "form1099OID", "form4797", "form4684", "form8824", "homeSales", "cryptoIncome",
    "form2555", "form8814", "form8839", "form6252", "form6781", "form8915F"] as const) {
    const value = input[key];
    if (Array.isArray(value) ? value.length > 0 : value !== undefined) throw new Error(`Form172 requires the separate current origin classification method for ${key}`);
  }
  if (input.form1099B.some(form => form.transactions.length > 0) || input.form1099DA.length
    || [input.priorYear?.capitalLossCarryforward, input.priorYear?.shortTermCapitalLoss, input.priorYear?.longTermCapitalLoss].some(value => !d(value).isZero())
    || input.form1099Div.some(form => [form.totalCapitalGainDistributions, form.section1202Gain, form.section1250Gain, form.collectiblesGain].some(value => !d(value).isZero()))) {
    throw new Error("Form172 capital source classifications and section1202 origin require their separate completed method");
  }
  if (input.donations.length || !d(input.priorYear?.charitableCarryforward).isZero()
    || input.priorYear?.charitableCarryforwardByYear?.some(row => !d(row.amount).isZero())) {
    throw new Error("Form172 current origin and charitable itemized carry require their separate regular and alternative coordination");
  }
  if (input.form461 && [input.form461.otherBusinessIncome, input.form461.otherBusinessDeductions,
    input.form461.noncapitalNonbusinessIncome, input.form461.noncapitalNonbusinessLoss].some(value => !d(value).isZero())) {
    throw new Error("Form172 other business income and deduction classifications require their separate original sources");
  }
  // Keep actual source signs; a negative investment amount cannot bypass the
  // unimplemented capital/ordinary-loss classifications through aggregate netting.
  for (const form of input.form1099Int) {
    actualNonnegative(form.interestIncome, "interest source");
    actualNonnegative(form.usSavingsBondInterest, "Treasury interest source");
    actualNonnegative(form.earlyWithdrawalPenalty, "early-withdrawal penalty source");
  }
  for (const form of input.form1099Div) actualNonnegative(form.ordinaryDividends, "dividend source");
  if (!context) return { taxYear: year, sourceFactsVerified: true, calculationComplete: false };

  for (const [key, value] of Object.entries(context)) {
    if (Decimal.isDecimal(value) && !value.isFinite()) throw new Error(`Form172 requires finite actual canonical ${key}`);
  }
  if (context.deductionUsed !== "standard") throw new Error("Form172 current itemized deduction classifications require their separate source method");
  if (!context.capitalGainLoss.isZero() || !context.additionalDeductions.isZero() || !context.nonitemizerCharitableDeduction.isZero()) {
    throw new Error("Form172 capital, Schedule1A and nonitemizer charitable deductions require their separate origin coordination method");
  }
  if (context.unverifiedAnnuitySourceIds.length) throw new Error("Form172 investment origin requires the actual pension/annuity source classification");
  const prior = context.priorLoss;
  if (!prior.calculationComplete || prior.sourceFactsVerified !== true || prior.alternativeTax.sourceFactsVerified !== true) {
    throw new Error("Form172 requires completed separate actual prior regular and alternative carry results");
  }
  const sched1 = context.schedule1;
  const expectedAdditionalIncome = sum(sched1.businessIncome, sched1.unemploymentCompensation, sched1.alimonyReceived,
    context.currentExcessBusinessLoss).minus(prior.deduction);
  if (!sched1.totalAdditionalIncome.eq(expectedAdditionalIncome)) throw new Error("Form172 has unclassified actual additional income or losses");
  const nonbusinessIncome = sum(context.taxableInterest, context.ordinaryDividends, context.iraTaxable,
    context.pensionTaxable, context.taxableSocialSecurity, sched1.alimonyReceived);
  const businessIncome = sum(context.totalWages, sched1.businessIncome, sched1.unemploymentCompensation);
  if (!businessIncome.plus(nonbusinessIncome).plus(context.currentExcessBusinessLoss).minus(prior.deduction).eq(context.totalIncome)) {
    throw new Error("Form172 actual business and nonbusiness income must conserve final return income");
  }
  const nonbusinessAdjustments = sum(sched1.hsaDeduction, sched1.archerMSADeduction, sched1.seRetirementContributions,
    sched1.earlyWithdrawalPenalty, sched1.alimonyPaid, sched1.iraDeduction, sched1.studentLoanInterest);
  const businessAdjustments = sum(sched1.educatorExpenses, sched1.businessExpenseAdjustments,
    sched1.armedForcesMovingExpenses, sched1.seDeduction, sched1.seHealthInsurance);
  if (!sched1.otherAdjustmentsTotal.isZero() || !sum(nonbusinessAdjustments, businessAdjustments).eq(sched1.totalAdjustments)
    || !context.totalIncome.minus(sched1.totalAdjustments).eq(context.agi)) {
    throw new Error("Form172 actual deduction classifications must conserve final adjustments and AGI");
  }
  for (const value of [nonbusinessIncome, nonbusinessAdjustments, businessAdjustments, context.investmentIncome,
    context.currentExcessBusinessLoss, context.alternativeTaxPrivateActivityInterest]) {
    if (value.lt(0)) throw new Error("Form172 nonbusiness income, deductions and source addbacks require nonnegative actual classifications");
  }
  const zero = d("0");
  const partI = (agi: Decimal, deduction: Decimal, nonbusinessDeduction: Decimal, ordinaryIncome: Decimal, oldNol: Decimal): Form172OriginResult => {
    const args: Form172OriginInput = { taxYear: year, filingStatus: input.taxpayer.filingStatus,
      adjustedGrossIncome: roundDollar(agi), deductionAmount: roundDollar(deduction),
      nonbusinessDeductions: roundDollar(nonbusinessDeduction), nonbusinessOrdinaryIncome: roundDollar(ordinaryIncome),
      nonbusinessCapitalLosses: zero, nonbusinessCapitalGains: zero, businessCapitalLosses: zero, businessCapitalGains: zero,
      netCapitalGainOrLoss: zero, section1202Exclusion: zero, otherYearNolDeduction: roundDollar(oldNol) };
    return calculateForm172Origin(args);
  };
  const regular = partI(context.agi, context.deductionAmount, context.deductionAmount.plus(nonbusinessAdjustments), nonbusinessIncome, prior.deduction);
  const expectedAlternativeIncome = sum(context.agi, prior.deduction, context.alternativeTaxPrivateActivityInterest)
    .minus(prior.alternativeTax.deduction).minus(context.qbiDeduction);
  if (!context.alternativeTaxIncome.eq(expectedAlternativeIncome)) {
    throw new Error("Form172 alternative origin requires its separately classified actual AMT adjustments");
  }
  // The actual6251 amount already restored regularNOL and standard deduction.
  // Restore ATNOLD and disallowed199A once; never copy regular PartI or its carry.
  const alternativeTax = partI(context.alternativeTaxIncome.plus(prior.alternativeTax.deduction).plus(context.qbiDeduction), zero,
    nonbusinessAdjustments, nonbusinessIncome.plus(context.alternativeTaxPrivateActivityInterest), zero);
  // All supported business losses are active and nontrading. Ordinary investment
  // income and its nonbusiness early-withdrawal deduction are re-run under172(d),
  // whose nonbusiness limit prevents them from generating a new investment NOL.
  const investment = partI(context.investmentIncome.minus(sched1.earlyWithdrawalPenalty), zero,
    sched1.earlyWithdrawalPenalty, context.investmentIncome, zero);
  const section1411OriginalLoss = Decimal.min(regular.netOperatingLoss, investment.netOperatingLoss);
  const currentExcessBusinessLoss = roundDollar(context.currentExcessBusinessLoss);
  const newRegularCarryforward = regular.netOperatingLoss.plus(currentExcessBusinessLoss);
  const newAlternativeCarryforward = alternativeTax.netOperatingLoss.plus(currentExcessBusinessLoss);
  const regularClosingCarryforward = prior.carryforward.plus(newRegularCarryforward);
  const alternativeClosingCarryforward = prior.alternativeTax.carryforward.plus(newAlternativeCarryforward);
  const audit = new AuditTrail();
  audit.record("Current Form172 source reconciliation", "current-regular", "New regular NOL carry", newRegularCarryforward,
    "Completed regular PartI origin plus current Form461 disallowance once", { "PartI origin": regular.netOperatingLoss, "Current EBL": currentExcessBusinessLoss });
  audit.record("Current Form172 source reconciliation", "current-alternative", "New alternative NOL carry", newAlternativeCarryforward,
    "Independent alternative PartI origin plus same-basis current Form461 disallowance once", { "PartI origin": alternativeTax.netOperatingLoss, "Current EBL": currentExcessBusinessLoss });
  audit.record("Current Form172 source reconciliation", "investment-origin", "Originating section1411 loss", section1411OriginalLoss,
    "Smaller of actual regular PartI loss and independently computed investment-only172 loss; actual active nontrading business is excluded");
  audit.record("Current Form172 source reconciliation", "regular-closing", "Total regular loss carry after current origin", regularClosingCarryforward,
    "Unused actual prior carry plus current PartI and currentEBL, retaining distinct origin characters", { "Prior closing carry": prior.carryforward });
  audit.record("Current Form172 source reconciliation", "alternative-closing", "Total alternative loss carry after current origin", alternativeClosingCarryforward,
    "Unused independent AMT carry plus current alternative PartI and currentEBL", { "Prior closing carry": prior.alternativeTax.carryforward });
  return { taxYear: year, sourceFactsVerified: true, calculationComplete: true, regular, alternativeTax, investment, section1411OriginalLoss,
    currentExcessBusinessLoss, alternativeExcessBusinessLoss: currentExcessBusinessLoss, newRegularCarryforward, newAlternativeCarryforward,
    regularClosingCarryforward, alternativeClosingCarryforward,
    lines: [...regular.lines, ...alternativeTax.lines.map(line => ({ ...line, form: "Alternative172 Part I" })),
      ...investment.lines.map(line => ({ ...line, form: "Section1411 origin172" })), ...audit.getLines()] };
}
