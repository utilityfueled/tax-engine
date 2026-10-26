import { buildGuidedCryptoDonations, cryptoDonationFactErrors } from './guided-crypto-donations';
import { buildGuidedRoyaltySources, royaltySourceFactErrors } from "./guided-royalty-sources";
import { buildGuidedQofFacts } from "./guided-qof-facts";
import { buildGuidedScheduleDInputs } from "./guided-schedule-d-sources";
import { buildGuidedQsbsSources } from "./guided-qsbs-sources";
import { buildGuidedInvestmentInterestInputs, investmentInterestFactErrors } from "./guided-investment-interest";
import { buildBrokerageWithholdingSource } from "./guided-brokerage-withholding";
import { buildForeignIncomeInput, foreignIncomeFactErrors } from "./guided-foreign-income";
import { buildGuidedNetOperatingLoss, netOperatingLossFactErrors } from "./guided-net-operating-loss";
import { buildCurrentLossOrigin, currentLossOriginFactErrors } from "./guided-current-loss-origin";
import { k1LossSourceFactErrors } from "./guided-k1-qbi-sources";
import { buildGuidedK1CharitableSources, k1CharitableSourceFactErrors } from "./guided-k1-charitable-sources";
import { buildGuidedCodNol, codNolFactErrors } from "./guided-cod-nol";
import { buildGuidedCharitableCarryover, charitableCarryoverFactErrors } from "./guided-charitable-carryover";
import { buildEstimatedTaxFacts, estimatedTaxFactErrors } from "./guided-estimated-tax-facts";
import { buildMinimumTaxCreditInput, minimumTaxCreditFactErrors } from "./guided-minimum-tax-credit";
import { buildGuidedForeignTaxElection, guidedForeignTaxFactErrors } from "./guided-foreign-tax-election";
import { foreignCreditKnownFacts } from './guided-foreign-tax-direct-credit';
import { buildGuidedPrivateActivityFacts } from "./guided-private-activity-facts";
import { buildPremiumTaxCreditInputs, premiumTaxCreditFactErrors } from "./guided-premium-tax-credit-facts";
import { buildGuidedChildElections } from "./guided-child-election-facts";
import { buildSchedule1AInput, schedule1AFactErrors } from "./guided-schedule-1-a-facts";
import { actualCompensationSourceYear } from "./guided-compensation-reporting";
import { buildTipIncomeInputs, tipIncomeFactErrors } from "./guided-tip-income-facts";
import { buildHealthInsuranceInput, healthInsuranceSourceErrors } from "./guided-health-insurance-facts";
import { buildHsaInputs, hsaFactErrors } from "./guided-hsa-facts";
import { buildEducatorSources, educatorFactErrors } from "./guided-educator-facts";
import { buildStudentLoanInputs, studentLoanFactErrors, studentLoanEducationSources, type StudentLoanEducationSources } from "./guided-student-loan-facts";
import { buildGuidedMortgageInputs } from "./guided-mortgage-worksheet";
import { buildStandardDeductionFacts } from "./guided-standard-deduction-facts";
import { buildActualEducationInput } from "./guided-education-facts";
import { buildEducationDistributionInputs, educationDistributionFactErrors } from "./guided-education-distributions";
import { buildSavingsBondInputs, savingsBondFactErrors } from "./guided-savings-bond-facts";
/**
 * Bridge between guided interview section data and the tax engine.
 *
 * Converts GuidedFlowState → TaxYearInput. Pure functions — no React, no side
 * effects.  The heavy preview computation (which pulls in the full tax engine
 * + decimal.js) lives in guided-preview-compute.ts so it can be loaded
 * on-demand via dynamic import without bloating the initial client bundle.
 */

import Decimal from "decimal.js";
import { buildGuidedNiitSources, guidedNiitFactErrors } from "./guided-niit-facts";
import { parseGuidedCurrency, hasGuidedCurrency, formatGuidedDollars, sumGuidedDisplayAmounts } from "./guided-currency";
import { childCreditExclusionValues, dependentFactErrors, personalFactErrors } from "./guided-taxpayer-facts";
import { allowsBlankEicChildIdentifier, type EicSeparatedSpouseData } from "./guided-eic-separated-spouse";
import { buildGuidedEicClaimantEligibility } from "./guided-eic-eligibility";
import { allowsBlankForm8862ChildIdentifier, type Form8862Data } from "./guided-form-8862";
import { buildVehicleCreditInput, vehicleFactErrors } from "./guided-vehicle-facts";
import { buildAdoptionInput, adoptionFactErrors } from "./guided-adoption-facts";
import { allPaymentFactErrors, assertKnownFacts, deductionFactErrors, educationFactErrors, hasEnteredAmount, paymentFactErrors, retirementFactErrors } from "./guided-required-facts";
import { nonitemizedElectionFactErrors } from "./guided-nonitemized-election";
import { adjustmentFactErrors, householdFactErrors, isDeductibleAlimony } from "./guided-adjustment-facts";
import { statePaymentFactErrors, sumAdditionalStateWithholding } from "./guided-state-facts";
import { buildCareBenefitsInput, careBenefitsFactErrors, guidedCareBenefitSources, type CareBenefitSource } from "./guided-dependent-care-benefits";
import { careFactErrors } from "./guided-credit-facts";
import { buildActualEnergyInput, energyFactErrors } from "./guided-energy-facts";
import { w2FactErrors } from "./guided-w2-facts";
import { businessFactErrors, hasBusinessSourceData, isStartedNec, sumKnownBusinessAmounts, type BusinessSourceData } from "./guided-business-facts";
import { isStartedRental, rentalFactErrors, rentalExpenseFields } from "./guided-rental-facts";
import { buildGuidedRentalCarryovers } from "./guided-rental-carry-sources";
import { paRentalAmountFields } from "./guided-pa-rental-facts";
import { isStartedUnemployment, unemploymentEntries, unemploymentFactErrors, governmentSourceTotal } from "./guided-unemployment-facts";
import { buildGuidedTaxRefund } from "./guided-tax-refund";
import { buildGovernmentPaymentSourceRecords } from "./guided-government-payment-inputs";
import { nonW2TaxAllocationErrors } from "./guided-salt-facts";
import { socialSecurityEntries, isStartedSocialSecurity, socialSecurityFactErrors, socialSecuritySourceTotal } from "./guided-social-security-facts";
import { isStartedRetirement } from "./guided-retirement-facts";
import { retirementSourceInput } from "./guided-retirement-source-inputs";
import { buildGuidedIraBasisSources, type GuidedIraBasisContext } from "./guided-ira-basis";
import { investmentFactErrors, isStartedInvestment, type InvestmentSourceData } from "./guided-investment-facts";
import { buildOidInputs, buildPaOidSources, isStartedOid, oidFactErrors } from "./guided-oid-facts";
import { buildDigitalAssetInputs, digitalAssetFactErrors, isStartedDigitalAsset } from "./guided-digital-asset-facts";

import type {
  AdjustmentData,
  BrokerageEntryData,
  CreditsData,
  DeductionData,
  DependentEntryData,
  DividendEntryData,
  FilingStatus,
  GuidedFlowState,
  InterestEntryData,
  NecEntryData,
  OtherTaxesData,
  PaymentData,
  PersonalInfoData,
  RentalPropertyEntryData,
  RetirementEntryData,
  ScheduleCExpenseData,
  SocialSecurityData,
  StateReturnData,
  UnemploymentData,
  W2SuggestedField,
  W2EntryData,
} from "./guided-interview-flow";

// ── Filing-status mapping ───────────────────────────────────────────────────

const engineFilingStatus: Record<FilingStatus, string> = {
  single: "single",
  mfj: "married_filing_jointly",
  mfs: "married_filing_separately",
  hoh: "head_of_household",
  qss: "qualifying_surviving_spouse",
};

export function mapFilingStatus(
  fs: FilingStatus,
): "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household" | "qualifying_surviving_spouse" {
  return engineFilingStatus[fs] as ReturnType<typeof mapFilingStatus>;
}

// ── Section-data → engine input converters ──────────────────────────────────

function toDecimalString(value: string | undefined): string {
  parseGuidedCurrency(value);
  return (value ?? "").trim().replace(/,/g, "") || "0";
}

function toOptionalDecimalString(value: string | undefined): string | undefined {
  return hasEnteredAmount(value) ? toDecimalString(value) : undefined;
}

const hasValue = hasGuidedCurrency;

function combineGivenNameWithMiddleInitial(
  firstName: string | undefined,
  middleName: string | undefined,
) {
  const first = firstName?.trim() ?? "";
  const middle = middleName?.trim() ?? "";

  if (!first) {
    return "";
  }

  if (!middle) {
    return first;
  }

  const middleInitial = middle.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return middleInitial ? `${first} ${middleInitial}` : first;
}

function getConfirmedW2FieldValue(
  entry: W2EntryData,
  field: W2SuggestedField,
): string {
  return entry.aiSuggestedFields?.[field]?.status === "pending-confirmation"
    ? ""
    : entry[field] ?? "";
}

function stripPendingW2Suggestions(entry: W2EntryData): W2EntryData {
  return {
    ...entry,
    accountHolder: entry.aiSuggestedFields?.accountHolder?.status === "pending-confirmation" ? undefined : entry.accountHolder,
    state: getConfirmedW2FieldValue(entry, "state"),
    employerName: getConfirmedW2FieldValue(entry, "employerName"),
    employerEin: getConfirmedW2FieldValue(entry, "employerEin"),
    wages: getConfirmedW2FieldValue(entry, "wages"),
    federalWithheld: getConfirmedW2FieldValue(entry, "federalWithheld"),
    socialSecurityWages: getConfirmedW2FieldValue(entry, "socialSecurityWages"),
    socialSecurityTips: getConfirmedW2FieldValue(entry, "socialSecurityTips"),
    socialSecurityWithheld: getConfirmedW2FieldValue(entry, "socialSecurityWithheld"),
    medicareWages: getConfirmedW2FieldValue(entry, "medicareWages"),
    medicareWithheld: getConfirmedW2FieldValue(entry, "medicareWithheld"),
    stateWages: getConfirmedW2FieldValue(entry, "stateWages"),
    stateWithheld: getConfirmedW2FieldValue(entry, "stateWithheld"),
  };
}

export function buildW2Inputs(
  entries: W2EntryData[] | undefined,
) {
  if (!entries || entries.length === 0) return [];
  return entries
    .map(stripPendingW2Suggestions)
    .filter((e) => hasEnteredAmount(e.wages) || hasEnteredAmount(e.federalWithheld))
    .map((e) => ({
      employer: {
        name: e.employerName.trim(),
        ein: e.employerEin.trim(),
      },
      accountHolder: e.accountHolder || undefined,
      wages: toOptionalDecimalString(e.wages),
      federalWithheld: toOptionalDecimalString(e.federalWithheld),
      socialSecurityWages: toOptionalDecimalString(e.socialSecurityWages),
      socialSecurityTips: toOptionalDecimalString(e.socialSecurityTips),
      allocatedTips: toOptionalDecimalString(e.allocatedTips),
      taxYear: actualCompensationSourceYear(e.sourceTaxYear),
      box12CodeTP: toOptionalDecimalString(e.box12CodeTP),
      box12CodeTT: toOptionalDecimalString(e.box12CodeTT),
      treasuryTippedOccupationCodes: e.treasuryTippedOccupationCodes === undefined ? undefined : [...e.treasuryTippedOccupationCodes],
      socialSecurityWithheld: toOptionalDecimalString(e.socialSecurityWithheld),
      medicareWages: toOptionalDecimalString(e.medicareWages),
      medicareWithheld: toOptionalDecimalString(e.medicareWithheld),
      box10DependentCareBenefits: toOptionalDecimalString(e.box10DependentCareBenefits),
      box12CodeW: toOptionalDecimalString(e.box12CodeW),
      stateWages: e.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(e.stateWages),
      stateTaxWithheld: e.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(e.stateWithheld),
      state: e.state?.trim().toUpperCase() || undefined,
    }));
}

export function buildNecInputs(entries: NecEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter(isStartedNec)
    .map((e) => ({
      payer: e.payerName.trim(),
      accountHolder: e.accountHolder || undefined,
      payerTin: e.payerTin || undefined,
      taxYear: actualCompensationSourceYear(e.sourceTaxYear),
      cashTips: toOptionalDecimalString(e.cashTips),
      qualifiedOvertimeCompensation: toOptionalDecimalString(e.qualifiedOvertimeCompensation),
      treasuryTippedOccupationCodes: e.treasuryTippedOccupationCodes === undefined ? undefined : [...e.treasuryTippedOccupationCodes],
      nonemployeeCompensation: toOptionalDecimalString(e.nonemployeeCompensation),
      federalWithheld: toOptionalDecimalString(e.federalWithheld),
      state: e.state?.trim().toUpperCase() || undefined,
      stateWithheld: e.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(e.stateWithheld),
      stateIncome: e.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(e.stateIncome),
    }));
}

export function buildScheduleCInput(
  necEntries: NecEntryData[] | undefined,
  manualGrossReceipts: string | undefined,
  expenses: ScheduleCExpenseData | undefined,
  qbiMateriallyParticipated?: boolean | null,
  businessFacts?: BusinessSourceData,
) {
  const sources = (necEntries ?? []).filter(isStartedNec);
  if (!sources.length && !hasEnteredAmount(manualGrossReceipts) && !Object.values(expenses ?? {}).some(hasEnteredAmount) && !businessFacts) return undefined;
  const receiptAmounts = [...sources.map(entry => entry.nonemployeeCompensation), manualGrossReceipts]
    .map(value => hasEnteredAmount(value) ? parseGuidedCurrency(value) : null);
  const totalGross = receiptAmounts.every(value => value !== null)
    ? receiptAmounts.reduce((sum, value) => sum.plus(value), new Decimal(0)) : null;

  return {
    grossReceipts: totalGross?.toFixed(),
    accountHolder: businessFacts?.accountHolder === "primary" || businessFacts?.accountHolder === "spouse" ? businessFacts.accountHolder : undefined,
    principalBusinessActivity: businessFacts?.activityDescription?.trim() || undefined,
    allInvestmentAtRisk: businessFacts?.allInvestmentAtRisk ?? undefined,
    otherExpenseDescription: businessFacts?.otherExpenseDescription?.trim() || undefined,
    businessName: businessFacts?.businessName?.trim() || undefined,
    businessCode: businessFacts?.businessCode || undefined,
    ein: businessFacts?.ein?.trim() || undefined,
    accountingMethod: businessFacts?.accountingMethod || undefined,
    returnsAndAllowances: toOptionalDecimalString(businessFacts?.returnsAndAllowances),
    costOfGoodsSold: toOptionalDecimalString(businessFacts?.costOfGoodsSold),
    otherIncome: toOptionalDecimalString(businessFacts?.otherIncome),
    w2WagesPaid: toOptionalDecimalString(businessFacts?.w2WagesPaid),
    ubiaQualifiedProperty: toOptionalDecimalString(businessFacts?.ubiaQualifiedProperty),
    isSST: businessFacts?.isSST ?? undefined,
    qbiMateriallyParticipated: qbiMateriallyParticipated ?? undefined,
    expenses: expenses
      ? {
          employeeBenefitPrograms: toOptionalDecimalString(expenses.employeeBenefitPrograms),
          contractLabor: toOptionalDecimalString(businessFacts?.contractLabor),
          depreciation: toOptionalDecimalString(businessFacts?.depreciation),
          legalAndProfessional: toOptionalDecimalString(businessFacts?.legalAndProfessional),
          advertising: toOptionalDecimalString(expenses.advertising),
          carAndTruck: toOptionalDecimalString(expenses.carAndTruck),
          insurance: toOptionalDecimalString(expenses.insurance),
          officeExpense: toOptionalDecimalString(expenses.officeExpense),
          supplies: toOptionalDecimalString(expenses.supplies),
          travel: toOptionalDecimalString(expenses.travel),
          meals: toOptionalDecimalString(expenses.meals),
          utilities: toOptionalDecimalString(expenses.utilities),
          otherExpenses: toOptionalDecimalString(expenses.otherExpenses),
        }
      : undefined,
  };
}

// ── Investment income converters ──────────────────────────────────────────

function investmentSourceInput(entry: InvestmentSourceData) {
  return { payerTin: entry.payerTin?.trim() || undefined, accountReference: entry.accountReference?.trim() || undefined, accountHolder: entry.accountHolder === "primary" || entry.accountHolder === "spouse" ? entry.accountHolder : undefined, state: entry.state?.trim().toUpperCase() || undefined, stateWithheld: entry.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(entry.stateWithheld) };
}

export function buildInterestInputs(entries: InterestEntryData[] | undefined, taxYear?: number | null) {
  return (entries ?? []).filter(isStartedInvestment).map(entry => ({
    ...investmentSourceInput(entry), payer: entry.payer.trim(),
    interestIncome: toOptionalDecimalString(entry.interestIncome),
    federalWithheld: toOptionalDecimalString(entry.federalWithheld),
    earlyWithdrawalPenalty: toOptionalDecimalString(entry.earlyWithdrawalPenalty),
    usSavingsBondInterest: toOptionalDecimalString(entry.usSavingsBondInterest),
    foreignTaxPaid: toOptionalDecimalString(entry.foreignTaxPaid),
    foreignCountry: entry.foreignCountry?.trim() || undefined,
    taxExemptInterest: toOptionalDecimalString(entry.taxExemptInterest),
    privateActivityBondInterest: toOptionalDecimalString(entry.privateActivityBondInterest),
    privateActivityBondFacts: buildGuidedPrivateActivityFacts(entry, entry.privateActivityBondInterest, taxYear),
  }));
}

export function buildDividendInputs(entries: DividendEntryData[] | undefined, taxYear?: number | null) {
  return (entries ?? []).filter(isStartedInvestment).map(entry => ({
    ...investmentSourceInput(entry), payer: entry.payer.trim(),
    ordinaryDividends: toOptionalDecimalString(entry.ordinaryDividends),
    qualifiedDividends: toOptionalDecimalString(entry.qualifiedDividends),
    totalCapitalGainDistributions: toOptionalDecimalString(entry.capitalGainDistributions),
    federalWithheld: toOptionalDecimalString(entry.federalWithheld),
    section199ADividends: toOptionalDecimalString(entry.section199ADividends),
    foreignTaxPaid: toOptionalDecimalString(entry.foreignTaxPaid),
    foreignCountry: entry.foreignCountry?.trim() || undefined,
    section1250Gain: toOptionalDecimalString(entry.section1250Gain),
    section1202Gain: toOptionalDecimalString(entry.section1202Gain),
    collectiblesGain: toOptionalDecimalString(entry.collectiblesGain),
    nondividendDistributions: toOptionalDecimalString(entry.nondividendDistributions),
    exemptInterestDividends: toOptionalDecimalString(entry.exemptInterestDividends),
    specifiedPrivateActivityBondInterest: toOptionalDecimalString(entry.specifiedPrivateActivityBondInterest),
    privateActivityBondFacts: buildGuidedPrivateActivityFacts(entry, entry.specifiedPrivateActivityBondInterest, taxYear),
  }));
}

export function buildBrokerageInputs(entries: BrokerageEntryData[] | undefined) {
  return (entries ?? []).filter(entry => isStartedInvestment(entry) || entry.transactions.some(isStartedInvestment)).map(entry => ({
    ...investmentSourceInput(entry), broker: entry.broker.trim(),
    ...buildBrokerageWithholdingSource(entry),
    transactions: entry.transactions.filter(isStartedInvestment).map(transaction => ({
      description: transaction.description.trim(), dateAcquired: transaction.dateAcquired, dateSold: transaction.dateSold,
      proceeds: toOptionalDecimalString(transaction.proceeds), costBasis: toOptionalDecimalString(transaction.costBasis),
      holdingPeriod: transaction.holdingPeriod || undefined,
      basisReportedToIRS: transaction.basisReportedToIRS ?? undefined, digitalAsset: transaction.digitalAsset ?? undefined,
      sourceDocumentType: "1099-b" as const, // This collector explicitly asks for actual1099-B statements.
      washSale: transaction.washSale ?? undefined, washSaleDisallowed: toOptionalDecimalString(transaction.washSaleDisallowed),
      adjustments: toOptionalDecimalString(transaction.adjustments),
    })),
  }));
}

export function buildDependents(
  countStr: string | undefined,
  detailedDependents?: DependentEntryData[],
  separatedSpouseSources?: EicSeparatedSpouseData,
  recertificationSources?: Form8862Data,
) {
  const entries = detailedDependents ?? [];
  const count = countStr ?? String(entries.length);
  if (!/^\d+$/.test(count) || Number(count) > 20 || Number(count) !== entries.length) {
    throw new Error("Enter complete details for every dependent.");
  }
  return entries.map((entry, index) => {
    const errors = dependentFactErrors(entry, index, undefined, allowsBlankEicChildIdentifier(separatedSpouseSources, entry, index)
      || allowsBlankForm8862ChildIdentifier(recertificationSources, entry, index));
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    return {
      ...entry,
      monthsLivedWithYou: Number(entry.monthsLivedWithYou),
      qualifiesForCTC: entry.qualifiesForCTC as boolean,
      qualifiesForODC: entry.qualifiesForODC as boolean,
      qualifiesForEIC: entry.qualifiesForEIC as boolean,
      ctcSsnEligible: entry.ctcSsnEligible ?? undefined,
      odcTinEligible: entry.odcTinEligible ?? undefined,
    };
  });
}

// ── Schedule A (itemized deductions) converter ──────────────────────────────

export function buildScheduleAInput(deductionData: DeductionData | undefined, stateReturnData?: StateReturnData) {
  if (!deductionData) return undefined;
  assertKnownFacts(deductionFactErrors({ ...deductionData, mortgageInterest: "", mortgageEntries: [], mortgageWorksheet: undefined }));
  const fields = {
    nonW2IncomeTaxesDeductedElsewhere: deductionData.nonW2IncomeTaxesDeductedElsewhere,
    gamblingWinnings: deductionData.gamblingWinnings,
    ...(deductionData.method === "itemized" ? {
      medicalExpenses: deductionData.medicalExpenses,
      additionalStateLocalIncomeTaxes: hasEnteredAmount(deductionData.stateLocalTaxes) || stateReturnData?.additionalStateWithholdingEntries?.length
        ? parseGuidedCurrency(deductionData.stateLocalTaxes).plus(sumAdditionalStateWithholding(stateReturnData)).toFixed() : undefined,
      realEstateTaxes: deductionData.realEstateTaxes,
      personalPropertyTaxes: deductionData.personalPropertyTaxes,
      investmentInterestExpense: deductionData.investmentInterestExpense,
      gamblingLosses: deductionData.gamblingLosses,
      gamblingExpenses: deductionData.gamblingExpenses,
    } : {}),
  };
  const values = Object.fromEntries(Object.entries(fields).filter(([, value]) => hasEnteredAmount(value)).map(([key, value]) => [key, toDecimalString(value)])) as Partial<Record<keyof typeof fields, string>>;
  return Object.keys(values).length ? values : undefined;
}

// ── Mortgage interest (Form 1098) converter ──────────────────────────────────

export function buildForm1098Inputs(deductionData: DeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown) {
  if (!deductionData || deductionData.method !== "itemized") return [];
  assertKnownFacts(deductionFactErrors({ ...deductionData, charitableContributions: "", donationEntries: [] }, taxYear, filingStatus, spouse));
  return buildGuidedMortgageInputs(deductionData, taxYear, filingStatus, spouse).form1098;
}

// ── Charitable donations converter ──────────────────────────────────────────

export function buildDonationsInput(deductionData: DeductionData | undefined, taxYear?: number | null) {
  if (!deductionData) return [];
  assertKnownFacts(deductionFactErrors({ ...deductionData, mortgageInterest: "", mortgageEntries: [], mortgageWorksheet: undefined }, taxYear));
  return (deductionData.donationEntries ?? []).map((entry) => ({
    organization: entry.organization.trim(),
    type: entry.type as "cash" | "appreciated_stock" | "property" | "other",
    amount: toDecimalString(entry.amount),
    dateOfDonation: entry.date,
    ...(entry.type !== "cash" ? { costBasis: toDecimalString(entry.costBasis), isLongTermCapitalGain: entry.isLongTermCapitalGain as boolean } : {}),
    ...(typeof entry.isPrivateFoundation === "boolean" ? { isPrivateFoundation: entry.isPrivateFoundation } : {}),
    ...(entry.recipientCategory != null ? { recipientCategory: entry.recipientCategory } : {}),
    qualifiedOrganization: entry.qualifiedOrganization ?? undefined,
    supportingOrganization: entry.supportingOrganization ?? undefined,
    donorAdvisedFund: entry.donorAdvisedFund ?? undefined,
    qualifiedAppreciatedStock: entry.qualifiedAppreciatedStock ?? undefined,
  }));
}

// ── Adjustments converter ───────────────────────────────────────────────────

export function buildAdjustmentsInput(adjustmentData: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, education: StudentLoanEducationSources = []) {
  if (!adjustmentData) return undefined;
  assertKnownFacts(adjustmentFactErrors(adjustmentData, filingStatus, taxYear, education));

  // The HSA deduction is calculated from the actual Form 8889 facts.
  const hsaDeduction = "0";
  // Actual loan records are forwarded separately; the saved gross amount is not additional interest.
  const studentLoanInterest = "0";
  // Actual Form7206 sources are forwarded separately and deducted once after canonical income limits.
  const selfEmployedHealthInsurance = "0";
  const educatorExpenses = toDecimalString(adjustmentData.educatorExpenses);
  const educatorExpenseSources = buildEducatorSources(adjustmentData.educatorExpenseSources, filingStatus, taxYear, adjustmentData.educatorExpenses);
  const alimony = hasEnteredAmount(adjustmentData.alimonyPaid) ? {
    alimonyPaid: isDeductibleAlimony(adjustmentData) ? toDecimalString(adjustmentData.alimonyPaid) : "0",
    ...(isDeductibleAlimony(adjustmentData) ? { alimonyRecipientSSN: adjustmentData.alimonyQualification?.recipientSsn } : {}),
  } : undefined;

  if (
    hsaDeduction === "0" &&
    studentLoanInterest === "0" &&
    selfEmployedHealthInsurance === "0" &&
    educatorExpenses === "0" && !educatorExpenseSources?.length && !alimony
  ) {
    return undefined;
  }

  return {
    hsaDeduction,
    studentLoanInterest,
    selfEmployedHealthInsurance,
    educatorExpenses,
    educatorExpenseSources,
    ...alimony,
  };
}

// ── Estimated payments converter ────────────────────────────────────────────

export function buildEstimatedPaymentsInput(paymentData: PaymentData | undefined) {
  if (!paymentData) return [];
  assertKnownFacts(paymentFactErrors(paymentData.estimatedPayments));
  return paymentData.estimatedPayments
    .map((entry) => ({
      date: entry.date,
      amount: toDecimalString(entry.amount),
      type: "federal" as const,
    }));
}

// ── Retirement income (1099-R) converter ──────────────────────────────────

export function buildRetirementInputs(entries: RetirementEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData, basisContext?: GuidedIraBasisContext) {
  if (!entries || entries.length === 0) return [];
  assertKnownFacts(retirementFactErrors(entries, false, filingStatus, taxYear, stateData, basisContext));
  return entries
    .filter(isStartedRetirement)
    .map(retirementSourceInput);
}

// ── Social Security (SSA-1099) converter ─────────────────────────────────

export function buildSocialSecurityInputs(data: SocialSecurityData | undefined) {
  assertKnownFacts(socialSecurityFactErrors(data));
  return socialSecurityEntries(data).filter(entry => isStartedSocialSecurity(entry) && entry.sourceType === "ssa-1099" && entry.beneficiaryRole !== "other").map(entry => ({
    recipient: entry.recipient!.trim(), netBenefits: toDecimalString(entry.netBenefits), federalWithheld: toDecimalString(entry.federalWithheld),
  }));
}

export function buildRailroadSocialSecurityInputs(data: SocialSecurityData | undefined) {
  assertKnownFacts(socialSecurityFactErrors(data));
  return socialSecurityEntries(data).filter(entry => isStartedSocialSecurity(entry) && entry.sourceType === "rrb-1099" && entry.beneficiaryRole !== "other").map(entry => ({
    recipient: entry.recipient!.trim(), netSocialSecurityEquivalentBenefitPortion: toDecimalString(entry.netBenefits), federalWithheld: toDecimalString(entry.federalWithheld),
  }));
}

function buildSocialSecurityElectionInput(data: SocialSecurityData | undefined) {
  if (data?.lumpSumMethod !== "election") return undefined;
  return {
    currentYearExclusionsAdjustments: toDecimalString(data.currentYearExclusionsAdjustments),
    earlierYears: (data.earlierYears ?? []).map(year => ({
      taxYear: Number(year.taxYear), filingStatus: mapFilingStatus(year.filingStatus as FilingStatus),
      livedWithSpouseAtAnyTimeDuringYear: year.livedWithSpouseAtAnyTimeDuringYear ?? undefined,
      benefitsReceivedInEarlierYear: toDecimalString(year.benefitsReceivedInEarlierYear),
      delayedBenefitsReceivedInCurrentYear: toDecimalString(year.delayedBenefitsReceivedInCurrentYear),
      adjustedGrossIncome: toDecimalString(year.adjustedGrossIncome), taxExemptInterest: toDecimalString(year.taxExemptInterest),
      exclusionsAdjustments: toDecimalString(year.exclusionsAdjustments), taxableBenefitsPreviouslyReported: toDecimalString(year.taxableBenefitsPreviouslyReported),
    })),
  };
}

// ── Unemployment (1099-G) converter ──────────────────────────────────────

export function buildUnemploymentInputs(data: UnemploymentData | undefined, context?: { taxYear?: number | null; filingStatus?: FilingStatus | null; personalInfo?: PersonalInfoData; stateData?: StateReturnData; deductions?: DeductionData }) {
  assertKnownFacts(unemploymentFactErrors(data, context?.filingStatus, context?.taxYear, context?.personalInfo, context?.stateData, context?.deductions));
  return buildGovernmentPaymentSourceRecords(unemploymentEntries(data).filter(isStartedUnemployment));
}

// ── Rental property (Schedule E) converter ─────────────────────────────────

export function buildRentalPropertyInputs(entries: RentalPropertyEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter(isStartedRental)
    .map((e) => ({
      description: e.description?.trim() ?? "",
      propertyType: e.propertyType || undefined,
      accountHolder: e.accountHolder || undefined,
      sourceFactsConfirmed: e.sourceFactsConfirmed ?? undefined,
      paIncomeExpenses: e.paIncomeExpenses ? {
        ...e.paIncomeExpenses,
        taxYear: /^\d{4}$/.test(e.paIncomeExpenses.taxYear ?? "") ? Number(e.paIncomeExpenses.taxYear) : undefined,
        factsConfirmed: e.paIncomeExpenses.factsConfirmed ?? undefined,
        amountsBeforeOwnershipAllocation: e.paIncomeExpenses.amountsBeforeOwnershipAllocation ?? undefined,
        expensesAreRentalUseOnly: e.paIncomeExpenses.expensesAreRentalUseOnly ?? undefined,
        paRulesApplied: e.paIncomeExpenses.paRulesApplied ?? undefined,
        ...Object.fromEntries(paRentalAmountFields.map(([field]) => [field, toOptionalDecimalString(e.paIncomeExpenses?.[field])])) as Record<typeof paRentalAmountFields[number][0], string | undefined>,
      } : undefined,
      paClassification: e.paClassification ? {
        ...e.paClassification,
        factsConfirmed: e.paClassification.factsConfirmed ?? undefined,
        averageCustomerUseDays: toOptionalDecimalString(e.paClassification.averageCustomerUseDays),
        forProfit: e.heldForRental ?? undefined,
        significantServices: e.substantialServices ?? undefined,
      } : undefined,
      ownershipPercentage: toOptionalDecimalString(e.ownershipPercentage),
      personalUseDays: /^\d+$/.test(e.personalUseDays ?? "") ? Number(e.personalUseDays) : undefined,
      rentalDays: /^\d+$/.test(e.rentalDays ?? "") ? Number(e.rentalDays) : undefined,
      isActiveParticipant: e.isActiveParticipant ?? undefined,
      allInvestmentAtRisk: e.allInvestmentAtRisk ?? undefined,
      rents: toOptionalDecimalString(e.rents),
      ...Object.fromEntries(rentalExpenseFields.map(([field]) => [field, toOptionalDecimalString(e[field])])) as Record<typeof rentalExpenseFields[number][0], string | undefined>,
      otherExpenseDescription: e.otherExpenseDescription?.trim() || undefined,
      qualifiesForQBI: e.qualifiesForQBI ?? undefined,
      qbiMateriallyParticipated: e.qbiMateriallyParticipated ?? undefined,
      qbiW2Wages: toOptionalDecimalString(e.qbiW2Wages),
      qbiUBIA: toOptionalDecimalString(e.qbiUBIA),
      qbiIsSST: e.qbiIsSST ?? undefined,
    }));
}

// ── Credits converters ────────────────────────────────────────────────────

export function buildDependentCareInput(creditsData: CreditsData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, sources?: CareBenefitSource[]) {
  if (!creditsData) return undefined;
  const { dependentCare } = creditsData;
  assertKnownFacts(careFactErrors(dependentCare, filingStatus, { data: creditsData.dependentCareBenefits, year: taxYear, sources }));
  if (!hasEnteredAmount(dependentCare.expenses)) return undefined;

  const qualifyingIndividuals = Number.parseInt(dependentCare.qualifyingIndividuals, 10);
  if (Number.isNaN(qualifyingIndividuals) || qualifyingIndividuals < 1) return undefined;

  return {
    expenses: toDecimalString(dependentCare.expenses),
    qualifyingIndividuals,
    primaryEarnedIncome: toDecimalString(dependentCare.primaryEarnedIncome),
    ...(hasEnteredAmount(dependentCare.spouseEarnedIncome) ? { spouseEarnedIncome: toDecimalString(dependentCare.spouseEarnedIncome) } : {}),
    ...(hasEnteredAmount(dependentCare.excludedDependentCareBenefits) ? { excludedDependentCareBenefits: toDecimalString(dependentCare.excludedDependentCareBenefits) } : {}),
    eligibilityConfirmed: dependentCare.eligibilityConfirmed as boolean,
    priorYearExpenseCredit: toDecimalString(dependentCare.priorYearExpenseCredit),
    sourceFactsConfirmed: dependentCare.sourceFactsConfirmed as boolean,
    receivedBenefits: dependentCare.receivedBenefits as boolean,
    usesDeemedIncome: dependentCare.usesDeemedIncome as boolean,
    providers: dependentCare.providers?.map(provider => ({
      name: provider.name.trim(), address: provider.address.trim(),
      identifierType: provider.identifierType as "tin" | "tax_exempt" | "foreign_no_us_tin" | "employer_furnished" | "withheld",
      ...(provider.taxId?.trim() ? { taxId: provider.taxId.trim() } : {}),
      ...(provider.dueDiligenceStatement?.trim() ? { dueDiligenceStatement: provider.dueDiligenceStatement.trim() } : {}),
      householdEmployee: provider.householdEmployee as boolean, amountPaid: toDecimalString(provider.amountPaid),
    })),
    qualifyingPersons: dependentCare.qualifyingPersons?.map(person => ({
      firstName: person.firstName.trim(), lastName: person.lastName.trim(),
      identifierType: person.identifierType as "tax_id" | "died",
      ...(person.taxId?.trim() ? { taxId: person.taxId.trim() } : {}),
      over12Disabled: person.over12Disabled as boolean, qualifyingPersonConfirmed: person.qualifyingPersonConfirmed as boolean,
      qualifiedExpenses: toDecimalString(person.qualifiedExpenses),
    })),
  };
}

export { buildActualEducationInput as buildEducationInput } from "./guided-education-facts";

export function buildEnergyCreditsInput(creditsData: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null) {
  return buildActualEnergyInput(creditsData?.energy, taxYear, filingStatus);
}

// ── Household employment tax (Schedule H) converter ─────────────────────────

export function buildScheduleHInput(otherTaxesData: OtherTaxesData | undefined) {
  if (!otherTaxesData) return undefined;
  assertKnownFacts(householdFactErrors(otherTaxesData));
  if (!otherTaxesData.householdEmployees?.length) return undefined;
  return {
    employees: otherTaxesData.householdEmployees.map((employee) => ({ ...employee, name: employee.name.trim(), cashWages: toDecimalString(employee.cashWages), federalIncomeTaxWithheld: toDecimalString(employee.federalIncomeTaxWithheld), isSpouse: employee.isSpouse as boolean, isChildUnder21: employee.isChildUnder21 as boolean, isParent: employee.isParent as boolean, parentCareExceptionApplies: employee.parentCareExceptionApplies ?? undefined, isUnder18NonPrincipal: employee.isUnder18NonPrincipal as boolean })),
    futaApplies: otherTaxesData.futaApplies as boolean,
    ...(otherTaxesData.futaApplies ? { futaSectionA: otherTaxesData.futaSectionA as boolean,
      ...(otherTaxesData.futaSectionA === false ? {
        futaStatePeriods: (otherTaxesData.futaStatePeriods ?? []).map((period) => ({ state: period.state, periodStart: period.periodStart, periodEnd: period.periodEnd, taxableWages: toDecimalString(period.taxableWages), contributionsPaidTimely: toDecimalString(period.contributionsPaidTimely), experienceRate: period.hasAssignedExperienceRate ? parseGuidedCurrency(period.experienceRatePercent).div(100).toFixed() : null })),
        stateUnemploymentContributionsPaidLate: toDecimalString(otherTaxesData.stateUnemploymentContributionsPaidLate), futaCreditReduction: toDecimalString(otherTaxesData.futaCreditReduction),
      } : {}),
    } : {}),
  };
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildTaxInputFromGuidedData(state: GuidedFlowState) {
  const { segmentation, sectionData } = state;

  if (!segmentation.filingStatus || !Number.isInteger(state.taxYear) || state.taxYear == null) return null;

  const personalInfo = sectionData["personal-info"] as PersonalInfoData | undefined;
  if (!personalInfo?.dateOfBirth || Object.keys(personalFactErrors(personalInfo, segmentation.filingStatus, state.taxYear)).length) return null;
  const w2Data = sectionData["income-w2"] as { entries: W2EntryData[] } | undefined;
  const seData = sectionData["income-self-employment"];
  const investData = sectionData["income-investments"];
  const retirementData = sectionData["income-retirement"];
  const rentalData = sectionData["income-rental"] as { entries: RentalPropertyEntryData[] } | undefined;
  const socialSecurityData = sectionData["income-social-security"] as SocialSecurityData | undefined;
  const unemploymentData = sectionData["income-unemployment"] as UnemploymentData | undefined;
  const deductionData = sectionData["deductions"] as DeductionData | undefined;
  const adjustmentData = sectionData["adjustments"] as AdjustmentData | undefined;
  const creditsData = sectionData["credits"] as CreditsData | undefined;
  const otherTaxesData = sectionData["other-taxes"] as OtherTaxesData | undefined;
  const paymentData = sectionData["payments"] as PaymentData | undefined;
  const stateReturnData = sectionData["state-return"] as StateReturnData | undefined;

  const careBenefitSources = guidedCareBenefitSources(w2Data?.entries, seData?.businessFacts, seData?.expenses);
  let loanEducation: StudentLoanEducationSources = [];
  try {
    assertKnownFacts(royaltySourceFactErrors(state));
    assertKnownFacts(tipIncomeFactErrors(state));
    assertKnownFacts(schedule1AFactErrors(state));
    assertKnownFacts(w2FactErrors(w2Data?.entries, segmentation.filingStatus, state.taxYear));
    assertKnownFacts(investmentFactErrors(investData, segmentation.filingStatus, state.taxYear, stateReturnData, segmentation.stateCode, personalInfo));
    assertKnownFacts(businessFactErrors(seData, segmentation.filingStatus, w2Data?.entries, stateReturnData, state.taxYear));
    assertKnownFacts(rentalFactErrors(rentalData?.entries, segmentation.filingStatus, state.taxYear, segmentation.stateCode, personalInfo));
    assertKnownFacts(nonitemizedElectionFactErrors(state));
    assertKnownFacts(deductionFactErrors(deductionData, state.taxYear, segmentation.filingStatus, personalInfo.spouse));
    assertKnownFacts(investmentInterestFactErrors(deductionData, investData?.childElections, state.taxYear));
    assertKnownFacts(charitableCarryoverFactErrors(deductionData?.charitableCarryoverSources, state.taxYear, segmentation.filingStatus, personalInfo));
    assertKnownFacts(nonW2TaxAllocationErrors(state));
    assertKnownFacts(allPaymentFactErrors(paymentData, state.taxYear));
    assertKnownFacts(estimatedTaxFactErrors(paymentData, state.taxYear));
    assertKnownFacts(minimumTaxCreditFactErrors(creditsData?.minimumTaxCredit, state.taxYear, segmentation.filingStatus, personalInfo));
    assertKnownFacts(retirementFactErrors(retirementData?.entries, true, segmentation.filingStatus, state.taxYear, stateReturnData, { data: retirementData?.basisSources, personal: personalInfo, adjustments: adjustmentData }));
    assertKnownFacts(socialSecurityFactErrors(socialSecurityData, segmentation.filingStatus, state.taxYear, personalInfo, adjustmentData));
    assertKnownFacts(unemploymentFactErrors(unemploymentData, segmentation.filingStatus, state.taxYear, personalInfo, stateReturnData, deductionData));
    assertKnownFacts(savingsBondFactErrors(creditsData?.savingsBondEducation, state.taxYear, segmentation.filingStatus, investData?.interestEntries, personalInfo));
    assertKnownFacts(educationFactErrors(creditsData, state.taxYear, segmentation.filingStatus, personalInfo));
    assertKnownFacts(educationDistributionFactErrors(creditsData?.educationDistributions, state.taxYear, segmentation.filingStatus,
      buildActualEducationInput(creditsData, state.taxYear, segmentation.filingStatus, personalInfo)));
    if (adjustmentData?.studentLoanFacts) loanEducation = studentLoanEducationSources(creditsData, segmentation.filingStatus, state.taxYear, personalInfo, adjustmentData.studentLoanFacts);
    assertKnownFacts(studentLoanFactErrors(adjustmentData, segmentation.filingStatus, state.taxYear, loanEducation, segmentation.lifeEvents.includes("student-loans")));
    assertKnownFacts(healthInsuranceSourceErrors(state));
    assertKnownFacts(foreignIncomeFactErrors(state));
    assertKnownFacts(netOperatingLossFactErrors(adjustmentData?.netOperatingLossSources, state.taxYear, segmentation.filingStatus, personalInfo, segmentation.lifeEvents.includes("net-operating-loss"), deductionData, adjustmentData?.k1LossSources));
    assertKnownFacts(k1LossSourceFactErrors(state));
    assertKnownFacts(k1CharitableSourceFactErrors(state));
    assertKnownFacts(cryptoDonationFactErrors(deductionData?.cryptoDonations, state.taxYear));
    assertKnownFacts(currentLossOriginFactErrors(state));
    assertKnownFacts(codNolFactErrors(state));
    assertKnownFacts(premiumTaxCreditFactErrors(state));
    assertKnownFacts(adjustmentFactErrors(adjustmentData, segmentation.filingStatus, state.taxYear, loanEducation));
    assertKnownFacts(educatorFactErrors(adjustmentData, segmentation.filingStatus, state.taxYear, segmentation.lifeEvents.includes("educator-expenses")));
    assertKnownFacts(hsaFactErrors(adjustmentData?.hsaAccounts, segmentation.filingStatus, state.taxYear, w2Data?.entries ?? [], personalInfo, segmentation.lifeEvents.includes("hsa-contributions")));
    assertKnownFacts(householdFactErrors(otherTaxesData, state.taxYear));
    assertKnownFacts(guidedNiitFactErrors(otherTaxesData?.niitSources, retirementData?.entries, state.taxYear, segmentation.filingStatus));
    assertKnownFacts(guidedForeignTaxFactErrors(otherTaxesData?.foreignTaxElection, investData, state.taxYear, segmentation.filingStatus, foreignCreditKnownFacts(state)));
    assertKnownFacts(statePaymentFactErrors(stateReturnData, state.taxYear, segmentation.stateCode));
    assertKnownFacts(careBenefitsFactErrors(creditsData?.dependentCareBenefits, state.taxYear, segmentation.filingStatus, careBenefitSources));
    assertKnownFacts(careFactErrors(creditsData?.dependentCare, segmentation.filingStatus, { data: creditsData?.dependentCareBenefits, year: state.taxYear, sources: careBenefitSources }));
    assertKnownFacts(energyFactErrors(creditsData?.energy, state.taxYear, segmentation.filingStatus));
    assertKnownFacts(vehicleFactErrors(creditsData?.vehicles, state.taxYear, segmentation.filingStatus));
    assertKnownFacts(adoptionFactErrors(creditsData?.adoption, state.taxYear, segmentation.filingStatus, personalInfo));
  } catch { return null; }

  const stateCode = segmentation.stateCode;
  const w2s = buildW2Inputs(w2Data?.entries);
  const necs = buildNecInputs(seData?.necEntries);
  const scheduleC = buildScheduleCInput(seData?.necEntries, seData?.manualGrossReceipts, seData?.expenses, seData?.qbiMateriallyParticipated, seData?.businessFacts);
  const form1099Int = buildInterestInputs(investData?.interestEntries, state.taxYear);
  const form1099OID = buildOidInputs(investData?.oidEntries, segmentation.filingStatus, state.taxYear, stateCode);
  const form1099Div = buildDividendInputs(investData?.dividendEntries, state.taxYear);
  const form1099B = buildBrokerageInputs(investData?.brokerageEntries);
  const form1099DA = buildDigitalAssetInputs(investData?.digitalAssetEntries, segmentation.filingStatus, state.taxYear, personalInfo, form1099B);
  const form1099R = buildRetirementInputs(retirementData?.entries, segmentation.filingStatus, state.taxYear, stateReturnData, { data: retirementData?.basisSources, personal: personalInfo, adjustments: adjustmentData });
  const iraBasisSources = buildGuidedIraBasisSources(retirementData?.basisSources, retirementData?.entries, state.taxYear, segmentation.filingStatus, personalInfo, adjustmentData);
  const rentalProperties = buildRentalPropertyInputs(rentalData?.entries);
  const rentalCarryovers = buildGuidedRentalCarryovers(rentalData?.entries, state.taxYear, segmentation.filingStatus, personalInfo);
  const scheduleDInputs = buildGuidedScheduleDInputs(investData, state.taxYear, segmentation.filingStatus, personalInfo);
  const formSSA1099 = buildSocialSecurityInputs(socialSecurityData);
  const formRRB1099 = buildRailroadSocialSecurityInputs(socialSecurityData);
  const form1099G = buildUnemploymentInputs(unemploymentData, { taxYear: state.taxYear, filingStatus: segmentation.filingStatus, personalInfo, stateData: stateReturnData, deductions: deductionData });
  const scheduleA = buildScheduleAInput(deductionData, stateReturnData);
  const mortgageInputs = buildGuidedMortgageInputs(deductionData, state.taxYear, segmentation.filingStatus, personalInfo.spouse);
  let royaltyInputs: ReturnType<typeof buildGuidedRoyaltySources>;
  try { royaltyInputs = buildGuidedRoyaltySources(state, "form1099Misc" in mortgageInputs ? mortgageInputs.form1099Misc : undefined); } catch { return null; }
  const donations = buildDonationsInput(deductionData, state.taxYear);
  const adjustments = buildAdjustmentsInput(adjustmentData, state.segmentation.filingStatus, state.taxYear, loanEducation);
  const studentLoans = buildStudentLoanInputs(adjustmentData?.studentLoanFacts, segmentation.filingStatus, state.taxYear, loanEducation, adjustmentData?.studentLoanInterest);
  const ira = adjustmentData?.iraContributions;
  const iraDeductionWorksheet = ira ? {
    sourceFactsConfirmed: ira.sourceFactsConfirmed ?? undefined,
    primaryContributions: toDecimalString(ira.primaryContributions),
    primaryIsActiveParticipant: ira.primaryIsActiveParticipant as boolean,
    primaryCompensation: toOptionalDecimalString(ira.primaryCompensation),
    primaryRothContributions: toOptionalDecimalString(ira.primaryRothContributions),
    primarySection501c18Contributions: toOptionalDecimalString(ira.primarySection501c18Contributions),
    ...(personalInfo.spouse && (segmentation.filingStatus === "mfj" || segmentation.filingStatus === "mfs") ? {
      spouseIsActiveParticipant: ira.spouseIsActiveParticipant as boolean,
    } : {}),
    ...(segmentation.filingStatus === "mfj" ? {
      spouseCompensation: toOptionalDecimalString(ira.spouseCompensation),
      spouseRothContributions: toOptionalDecimalString(ira.spouseRothContributions),
      spouseSection501c18Contributions: toOptionalDecimalString(ira.spouseSection501c18Contributions),
    } : {}),
    ...(hasEnteredAmount(ira.spouseContributions) ? { spouseContributions: toDecimalString(ira.spouseContributions) } : {}),
  } : undefined;
  const dependentCare = buildDependentCareInput(creditsData, segmentation.filingStatus, state.taxYear, careBenefitSources);
  const dependentCareBenefits = buildCareBenefitsInput(creditsData?.dependentCareBenefits, state.taxYear, segmentation.filingStatus, careBenefitSources);
  const educationExpenses = buildActualEducationInput(creditsData, state.taxYear, segmentation.filingStatus, personalInfo);
  const savingsBondInputs = buildSavingsBondInputs(creditsData?.savingsBondEducation, state.taxYear, segmentation.filingStatus, investData?.interestEntries, personalInfo);
  const educationDistributions = buildEducationDistributionInputs(creditsData?.educationDistributions, state.taxYear, segmentation.filingStatus, educationExpenses);
  const energyCredits = buildEnergyCreditsInput(creditsData, state.taxYear, segmentation.filingStatus);
  const scheduleH = buildScheduleHInput(otherTaxesData);
  const estimatedPayments = [
    ...buildEstimatedPaymentsInput(paymentData),
    ...(stateReturnData?.stateEstimatedPayments ?? []).map((entry) => ({ date: entry.date, amount: toDecimalString(entry.amount), type: "state" as const, state: entry.state })),
  ];
  const extensionPayments = (paymentData?.extensionPayments ?? []).map((entry) => ({ date: entry.date, amount: toDecimalString(entry.amount), type: "federal" as const }));
  const priorYearAppliedCredits = (paymentData?.priorYearAppliedCredits ?? []).map((entry) => ({ sourceTaxYear: Number(entry.sourceTaxYear), amount: toDecimalString(entry.amount), type: "federal" as const }));
  const paymentAdjustments = { estimatedTaxPayments: estimatedPayments, extensionPayments, priorYearAppliedCredits };
  const form172 = buildCurrentLossOrigin(adjustmentData?.currentLossOrigin, state);
  const codSources = buildGuidedCodNol(adjustmentData?.codNolSources, state);
  const k1Sources = buildGuidedK1CharitableSources(state);
  const cryptoDonations = buildGuidedCryptoDonations(deductionData?.cryptoDonations, state.taxYear);
  const currentCapitalCarry = form172?.capitalSources?.priorCapitalLosses;

  return {
    taxpayer: {
      taxYear: state.taxYear,
      filingStatus: mapFilingStatus(segmentation.filingStatus),
      primary: {
        firstName: combineGivenNameWithMiddleInitial(
          personalInfo?.firstName,
          personalInfo?.middleName
        ),
        lastName: personalInfo.lastName,
        ssn: personalInfo.ssn,
        dateOfBirth: personalInfo.dateOfBirth,
        usResidencyMonths: Number(personalInfo.usResidencyMonths),
        employmentValidSsnIssuedByDueDate: personalInfo.employmentValidSsnIssuedByDueDate ?? undefined,
        tinIssuedByDueDate: personalInfo.tinIssuedByDueDate ?? undefined,
      },
      spouse: (segmentation.filingStatus === "mfj" || segmentation.filingStatus === "mfs") && personalInfo.spouse
        ? { ...personalInfo.spouse, usResidencyMonths: Number(personalInfo.spouse.usResidencyMonths), employmentValidSsnIssuedByDueDate: personalInfo.spouse.employmentValidSsnIssuedByDueDate ?? undefined, tinIssuedByDueDate: personalInfo.spouse.tinIssuedByDueDate ?? undefined } : undefined,
      livedWithSpouseAtAnyTimeDuringYear: personalInfo?.livedWithSpouseAtAnyTimeDuringYear,
      stateResidency: personalInfo.stateResidency,
      address: {
        street: personalInfo.addressLine1,
        apt: personalInfo.addressLine2 || undefined,
        city: personalInfo.city,
        state: personalInfo.state,
        zip: personalInfo.zip,
      },
      dependents: buildDependents(personalInfo?.dependentCount, personalInfo?.dependents, personalInfo?.eicSeparatedSpouseSources, personalInfo?.eicRecertificationSources),
    },
    w2s,
    form2210: buildEstimatedTaxFacts(paymentData, state.taxYear),
    form2555: buildForeignIncomeInput(adjustmentData?.foreignIncome, state),
    netOperatingLoss: buildGuidedNetOperatingLoss(adjustmentData?.netOperatingLossSources, state.taxYear, segmentation.filingStatus, personalInfo, deductionData, adjustmentData?.k1LossSources),
    ...(cryptoDonations !== undefined ? { cryptoIncome: { donations: cryptoDonations } } : {}),
    scheduleK1: k1Sources?.scheduleK1,
    qbiLossSources: k1Sources?.qbiLossSources,
    k1CharitableSources: k1Sources?.k1CharitableSources,
    form172,
    ...codSources,
    section1202Sources: buildGuidedQsbsSources(investData, state.taxYear, segmentation.filingStatus, personalInfo),
    form8801: buildMinimumTaxCreditInput(creditsData?.minimumTaxCredit, state.taxYear, segmentation.filingStatus, personalInfo),
    schedule1A: buildSchedule1AInput(sectionData["additional-deductions"]?.schedule1A, state),
    form4137ByOwner: buildTipIncomeInputs(sectionData["additional-deductions"]?.tipIncomeAccounts, segmentation.filingStatus, state.taxYear, w2Data?.entries),
    ...buildHsaInputs(adjustmentData?.hsaAccounts, personalInfo),
    form7206: buildHealthInsuranceInput(adjustmentData?.healthInsuranceFacts, segmentation.filingStatus, state.taxYear, adjustmentData?.selfEmployedHealthInsurance),
    form1099Nec: necs,
    scheduleC: scheduleC ?? undefined,
    form1099Int,
    form8814: buildGuidedChildElections(investData?.childElections, state.taxYear),
    qofDispositionFacts: buildGuidedQofFacts(investData?.qofDispositionFacts, state.taxYear),
    ...scheduleDInputs,
    priorYear: scheduleDInputs.priorYear || currentCapitalCarry || rentalCarryovers.length || k1Sources?.suspendedPassiveLosses.length ? {
      ...scheduleDInputs.priorYear,
      ...(currentCapitalCarry ? { shortTermCapitalLoss: currentCapitalCarry.shortTermCapitalLoss, longTermCapitalLoss: currentCapitalCarry.longTermCapitalLoss } : {}),
      ...(rentalCarryovers.length || k1Sources?.suspendedPassiveLosses.length ? { suspendedPassiveLosses: [...rentalCarryovers, ...(k1Sources?.suspendedPassiveLosses ?? [])] } : {}),
    } : undefined,
    form1099OID,
    paResidentReturn: stateCode === "PA" && form1099OID.length ? { scheduleA: { oidSources: buildPaOidSources(investData?.oidEntries) } } : undefined,
    form1099Div,
    form1099B,
    form1099DA,
    form1099R,
    iraBasisSources,
    form8960Sources: buildGuidedNiitSources(otherTaxesData?.niitSources, retirementData?.entries, state.taxYear, segmentation.filingStatus),
    foreignTaxElection: buildGuidedForeignTaxElection(otherTaxesData?.foreignTaxElection, investData, state.taxYear, segmentation.filingStatus, foreignCreditKnownFacts(state)),
    formSSA1099,
    formRRB1099,
    socialSecurityFacts: formSSA1099.length + formRRB1099.length ? { puertoRicoIncomeExclusion: toDecimalString(socialSecurityData?.puertoRicoIncomeExclusion), americanSamoaIncomeExclusion: toDecimalString(socialSecurityData?.americanSamoaIncomeExclusion), sourceFactsConfirmed: socialSecurityData?.sourceFactsConfirmed ?? undefined } : undefined,
    socialSecurityLumpSumElection: formSSA1099.length + formRRB1099.length ? buildSocialSecurityElectionInput(socialSecurityData) : undefined,
    form1099G,
    taxableRefundWorksheet: buildGuidedTaxRefund(unemploymentData?.taxRefund, unemploymentEntries(unemploymentData).filter(isStartedUnemployment), state.taxYear, segmentation.filingStatus, personalInfo, deductionData),
    rentalProperties,
    scheduleA,
    ...mortgageInputs,
    ...royaltyInputs,
    donations,
    charitableCarryoverSources: buildGuidedCharitableCarryover(deductionData?.charitableCarryoverSources, state.taxYear, segmentation.filingStatus, personalInfo),
    childTaxCredit: personalInfo.childTaxCredit ? {
      bonaFidePuertoRicoResident: personalInfo.childTaxCredit.bonaFidePuertoRicoResident ?? undefined,
      ...(hasEnteredAmount(personalInfo.childTaxCredit.possessionIncomeExclusion) || hasEnteredAmount(personalInfo.childTaxCredit.puertoRicoExcludedIncome) || hasEnteredAmount(personalInfo.childTaxCredit.form4563ExcludedIncome) ? childCreditExclusionValues(personalInfo.childTaxCredit) : {}),
      ...(hasEnteredAmount(personalInfo.childTaxCredit.nonTaxableCombatPayElection) ? { nonTaxableCombatPayElection: toDecimalString(personalInfo.childTaxCredit.nonTaxableCombatPayElection) } : {}),
    } : undefined,
    dependentCare,
    dependentCareBenefits,
    eic: buildGuidedEicClaimantEligibility(personalInfo, segmentation.filingStatus, state.taxYear),
    standardDeductionFacts: buildStandardDeductionFacts(personalInfo?.standardDeductionFacts, segmentation.filingStatus, state.taxYear, personalInfo),
    deductionElection: deductionData?.method ?? "automatic",
    ...buildGuidedInvestmentInterestInputs(deductionData, investData?.childElections, state.taxYear),
    educationExpenses,
    ...educationDistributions,
    ...savingsBondInputs,
    ...buildPremiumTaxCreditInputs(creditsData?.premiumTaxCredit, state.taxYear, segmentation.filingStatus, personalInfo),
    ...studentLoans,
    energyCredits,
    form8936: buildVehicleCreditInput(creditsData?.vehicles, state.taxYear, segmentation.filingStatus),
    form8839: buildAdoptionInput(creditsData?.adoption, state.taxYear, segmentation.filingStatus, personalInfo),
    scheduleH,
    iraDeductionWorksheet,
    adjustments: adjustments
      ? {
          ...adjustments,
          ...paymentAdjustments,
        }
      : estimatedPayments.length + extensionPayments.length + priorYearAppliedCredits.length > 0
        ? paymentAdjustments
        : undefined,
  };
}

// ── Preview metrics ─────────────────────────────────────────────────────────

export interface StatePreviewMetrics {
  stateCode: string;
  stateName: string;
  stateTax: string;
  stateRefund: string;
  stateAmountOwed: string;
  stateWithholding: string;
}

export interface GuidedPreviewMetrics {
  totalIncome: string;
  agi: string;
  taxableIncome: string;
  totalTax: string;
  totalPayments: string;
  refund: string;
  amountOwed: string;
  selfEmploymentTax?: string;
  additionalMedicareTax?: string;
  netInvestmentIncomeTax?: string;
  state: StatePreviewMetrics | null;
}

// ── Guided → workspace fact sync ─────────────────────────────────────────

/**
 * Maps guided section data → seeded fact IDs and answer text.
 * Returns only facts that have meaningful data entered.
 */
export function buildGuidedFactAnswers(
  state: GuidedFlowState,
): { factId: string; answerText: string }[] {
  const answers: { factId: string; answerText: string }[] = [];

  // W-2 wages → "wages" and "withholding" facts
  const w2Data = state.sectionData["income-w2"] as { entries: W2EntryData[] } | undefined;
  if (w2Data?.entries) {
    const filled = w2Data.entries
      .map(stripPendingW2Suggestions)
      .filter((e) => hasValue(e.wages) || hasValue(e.federalWithheld));
    if (filled.length > 0) {
      const totalWages = filled.reduce((sum, e) => sum.plus(numVal(e.wages)), new Decimal(0));
      const totalWithheld = filled.reduce((sum, e) => sum.plus(numVal(e.federalWithheld)), new Decimal(0));
      answers.push({
        factId: "wages",
        answerText: `${filled.length} W-2(s) confirmed. Total wages: $${fmtNum(totalWages)}.`,
      });
      answers.push({
        factId: "withholding",
        answerText: `Federal withholding from ${filled.length} W-2(s): $${fmtNum(totalWithheld)}.`,
      });
    }
  }

  const seData = state.sectionData["income-self-employment"];
  if (seData && hasBusinessSourceData(seData)) {
    const receipts = sumKnownBusinessAmounts([seData.manualGrossReceipts, ...seData.necEntries.filter(isStartedNec).map(entry => entry.nonemployeeCompensation)]);
    answers.push({ factId: "nonemployee-compensation", answerText: receipts === null ? "Business income source amounts still need review." : `Business gross receipts entered: $${fmtNum(receipts)}.` });
    answers.push({ factId: "schedule-c-expense-review", answerText: seData.businessFacts?.expensesReconciled === true ? "Business expense amounts and qualification checked against source records." : "Business expense amounts and qualification still need source review." });
  }

  // Record source totals only when every contributing amount is known.
  const investData = state.sectionData["income-investments"];
  const sourceTotal = (values: Array<string | undefined>) => {
    if (!values.every(hasEnteredAmount)) return null;
    const total = sumGuidedDisplayAmounts(values);
    return total.isFinite() ? total : null;
  };
  if (investData) {
    const interest = investData.interestEntries.filter(isStartedInvestment);
    if (interest.length) {
      const total = sourceTotal(interest.flatMap(entry => [entry.interestIncome, entry.usSavingsBondInterest]));
      answers.push({ factId: "taxable-interest", answerText: total === null ? "Interest source records entered; some taxable amounts still need review." : `Taxable interest entered: $${fmtNum(total)}.` });
    }
    const dividends = investData.dividendEntries.filter(isStartedInvestment);
    if (dividends.length) {
      for (const [field, factId, label] of [["ordinaryDividends", "ordinary-dividends", "Ordinary dividends"], ["qualifiedDividends", "qualified-dividends", "Qualified dividends"], ["capitalGainDistributions", "capital-gain-distributions", "Capital gain distributions"]] as const) {
        const total = sourceTotal(dividends.map(entry => entry[field]));
        answers.push({ factId, answerText: total === null ? `${label} source records entered; some amounts still need review.` : `${label} entered: $${fmtNum(total)}.` });
      }
    }
    const transactions = investData.brokerageEntries.flatMap(entry => entry.transactions.filter(isStartedInvestment));
    const digitalTransactions = investData.digitalAssetEntries?.filter(isStartedDigitalAsset).flatMap(entry => entry.transactions ?? []) ?? [];
    if (transactions.length || digitalTransactions.length) {
      const total = sourceTotal([...transactions, ...digitalTransactions].map(entry => entry.proceeds));
      answers.push({ factId: "broker-proceeds", answerText: total === null ? "Broker source records entered; some proceeds still need review." : `Broker proceeds entered: $${fmtNum(total)}.` });
      answers.push({ factId: "cost-basis-review", answerText: transactions.every(transaction => transaction.sourceClassificationConfirmed === true) && digitalTransactions.every(row => row.basisFactsConfirmed === true) ? "Cost basis and sale classifications reviewed against source records in the guided interview." : "Cost basis and sale classifications still need source review." });
    }
  }

  // Retirement → "retirement-distribution-review"
  const retData = state.sectionData["income-retirement"];
  if (retData?.entries) {
    const filled = retData.entries.filter(isStartedRetirement);
    if (filled.length > 0) {
      const totalTaxable = sourceTotal(filled.map(entry => entry.taxableAmount));
      const complete = Object.keys(retirementFactErrors(filled, true, state.segmentation.filingStatus, state.taxYear, state.sectionData["state-return"], { data: retData.basisSources, personal: state.sectionData["personal-info"], adjustments: state.sectionData.adjustments })).length === 0;
      answers.push({
        factId: "retirement-distribution-review",
        answerText: complete && retData.basisSources ? `${filled.length} retirement source record(s) confirmed with actual separate-owner IRA basis history and account values. Taxable IRA amounts are calculated through Form 8606; original printed amounts are preserved.` : totalTaxable === null ? `${filled.length} retirement source record(s) entered; taxable amounts still need review.` : `${filled.length} retirement source record(s) ${complete ? "confirmed" : "entered; source facts need review"}. Taxable amount entered: $${fmtNum(totalTaxable)}.`,
      });
    }
  }

  // Social Security → "social-security-benefits-review"
  const ssData = state.sectionData["income-social-security"];
  const ssEntries = socialSecurityEntries(ssData).filter(isStartedSocialSecurity);
  if (ssEntries.length) {
    const total = socialSecuritySourceTotal(ssEntries, "netBenefits");
    const complete = Object.keys(socialSecurityFactErrors(ssData, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments)).length === 0;
    answers.push({ factId: "social-security-benefits-review", answerText: total === null ? "Benefit source records entered; some net amounts still need review." : `${ssEntries.length} benefit source record(s) ${complete ? "confirmed" : "entered; source facts need review"}. Net benefits belonging to this return: $${fmtNum(total)}.` });
  }

  // Unemployment → "government-payments-review"
  const unemplData = state.sectionData["income-unemployment"];
  const governmentEntries = unemploymentEntries(unemplData).filter(isStartedUnemployment);
  if (governmentEntries.length) {
    const total = governmentSourceTotal(governmentEntries, "compensation");
    const complete = Object.keys(unemploymentFactErrors(unemplData, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData["state-return"], state.sectionData.deductions)).length === 0;
    answers.push({ factId: "government-payments-review", answerText: total === null ? "Government-payment source records entered; amounts and ownership need review." : `${governmentEntries.length} government-payment source record(s) ${complete ? "confirmed" : "entered; source facts need review"}. Original unemployment compensation: $${fmtNum(total)}.` });
  }

  return answers;
}

const numVal = parseGuidedCurrency;
const fmtNum = formatGuidedDollars;

/**
 * Build synthetic WorkspaceDocumentRecords from guided interview data.
 * These represent the user-entered data as if they had uploaded documents.
 */
export function buildGuidedSyntheticDocuments(
  state: GuidedFlowState,
): import("@tax-engine/contracts").WorkspaceDocumentRecord[] {
  type DocRecord = import("@tax-engine/contracts").WorkspaceDocumentRecord;
  const docs: DocRecord[] = [];
  const now = new Date().toISOString();

  const w2Data = state.sectionData["income-w2"] as { entries: W2EntryData[] } | undefined;
  if (w2Data?.entries?.map(stripPendingW2Suggestions).some((e) => hasValue(e.wages) || hasValue(e.federalWithheld))) {
    docs.push({
      id: "guided:w2",
      name: "Guided Interview — W-2",
      size: 0,
      uploadedAt: now,
      kind: "w2",
      coverage: "supported",
      label: "W-2 (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["wages", "withholding"],
    });
  }

  const seData = state.sectionData["income-self-employment"];
  if (seData?.necEntries?.some(isStartedNec)) {
    docs.push({
      id: "guided:1099-nec",
      name: "Guided Interview — 1099-NEC",
      size: 0,
      uploadedAt: now,
      kind: "1099-nec",
      coverage: Object.keys(businessFactErrors(seData, state.segmentation.filingStatus, state.sectionData["income-w2"]?.entries, state.sectionData["state-return"], state.taxYear)).length ? "partially-supported" : "supported",
      label: "1099-NEC (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    });
  }
  if (seData && (hasEnteredAmount(seData.manualGrossReceipts) || Object.values(seData.expenses).some(hasEnteredAmount) || seData.businessFacts)) {
    docs.push({
      id: "guided:schedule-c",
      name: "Guided Interview — Schedule C",
      size: 0,
      uploadedAt: now,
      kind: "schedule-c-support",
      coverage: Object.keys(businessFactErrors(seData, state.segmentation.filingStatus, state.sectionData["income-w2"]?.entries, state.sectionData["state-return"], state.taxYear)).length ? "partially-supported" : "supported",
      label: "Schedule C (guided interview)",
      notes: "Manual Schedule C gross receipts and expenses entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    });
  }

  const investData = state.sectionData["income-investments"];

  if (investData?.oidEntries?.some(isStartedOid)) {
    docs.push({ id: "guided:1099-oid", name: "Guided Interview — 1099-OID", size: 0, uploadedAt: now,
      kind: "1099-oid", coverage: Object.keys(oidFactErrors(investData.oidEntries, state.segmentation.filingStatus, state.taxYear, state.segmentation.stateCode, state.sectionData["state-return"])).length ? "partially-supported" : "supported",
      label: "1099-OID (guided interview)", notes: "Actual instrument boxes and recipient worksheets entered via guided interview.", matchedFixtureId: null, seededFactIds: [] });
  }

  if (investData?.digitalAssetEntries?.some(isStartedDigitalAsset)) {
    docs.push({ id: "guided:1099-da", name: "Guided Interview — 1099-DA", size: 0, uploadedAt: now,
      kind: "1099-da", coverage: Object.keys(digitalAssetFactErrors(investData.digitalAssetEntries, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], investData.brokerageEntries, state.sectionData["state-return"], state.segmentation.stateCode)).length ? "partially-supported" : "supported",
      label: "1099-DA (guided interview)", notes: "Actual original digital-asset statements and independent acquisition/basis records entered via guided interview.", matchedFixtureId: null, seededFactIds: ["broker-proceeds", "cost-basis-review"] });
  }

  if (investData?.interestEntries?.some(isStartedInvestment)) {
    docs.push({
      id: "guided:1099-int",
      name: "Guided Interview — 1099-INT",
      size: 0,
      uploadedAt: now,
      kind: "1099-int",
      coverage: Object.keys(investmentFactErrors({ interestEntries: investData.interestEntries, dividendEntries: [], brokerageEntries: [] }, state.segmentation.filingStatus, state.taxYear)).length ? "partially-supported" : "supported",
      label: "1099-INT (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["taxable-interest"],
    });
  }

  if (investData?.dividendEntries?.some(isStartedInvestment)) {
    docs.push({
      id: "guided:1099-div",
      name: "Guided Interview — 1099-DIV",
      size: 0,
      uploadedAt: now,
      kind: "1099-div",
      coverage: Object.keys(investmentFactErrors({ interestEntries: [], dividendEntries: investData.dividendEntries, brokerageEntries: [] }, state.segmentation.filingStatus, state.taxYear)).length ? "partially-supported" : "supported",
      label: "1099-DIV (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["ordinary-dividends", "qualified-dividends", "capital-gain-distributions"],
    });
  }

  if (investData?.brokerageEntries?.some((e) => isStartedInvestment(e) || e.transactions.some(isStartedInvestment))) {
    docs.push({
      id: "guided:1099-b",
      name: "Guided Interview — 1099-B",
      size: 0,
      uploadedAt: now,
      kind: "1099-b",
      coverage: Object.keys(investmentFactErrors({ interestEntries: [], dividendEntries: [], brokerageEntries: investData.brokerageEntries }, state.segmentation.filingStatus, state.taxYear)).length ? "partially-supported" : "supported",
      label: "1099-B (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["broker-proceeds", "cost-basis-review"],
    });
  }

  const retData = state.sectionData["income-retirement"];
  if (retData?.entries?.some(isStartedRetirement)) {
    docs.push({
      id: "guided:1099-r",
      name: "Guided Interview — 1099-R",
      size: 0,
      uploadedAt: now,
      kind: "1099-r",
      coverage: Object.keys(retirementFactErrors(retData.entries, true, state.segmentation.filingStatus, state.taxYear, state.sectionData["state-return"], { data: retData.basisSources, personal: state.sectionData["personal-info"], adjustments: state.sectionData.adjustments })).length ? "partially-supported" : "supported",
      label: "1099-R (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["retirement-distribution-review"],
    });
  }

  const ssData = state.sectionData["income-social-security"] as SocialSecurityData | undefined;
  if (socialSecurityEntries(ssData).some(isStartedSocialSecurity)) {
    docs.push({
      id: "guided:ssa-1099",
      name: "Guided Interview — Social Security benefit statements",
      size: 0,
      uploadedAt: now,
      kind: "ssa-1099",
      coverage: Object.keys(socialSecurityFactErrors(ssData, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments)).length ? "partially-supported" : "supported",
      label: "SSA-1099 / RRB-1099 (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["social-security-benefits-review"],
    });
  }

  const unemplData = state.sectionData["income-unemployment"] as UnemploymentData | undefined;
  if (unemploymentEntries(unemplData).some(isStartedUnemployment)) {
    docs.push({
      id: "guided:1099-g",
      name: "Guided Interview — 1099-G",
      size: 0,
      uploadedAt: now,
      kind: "1099-g",
      coverage: Object.keys(unemploymentFactErrors(unemplData, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData["state-return"], state.sectionData.deductions)).length ? "partially-supported" : "supported",
      label: "1099-G (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["government-payments-review"],
    });
  }

  return docs.map((document) => ({ ...document, taxYear: state.taxYear ?? null }));
}
