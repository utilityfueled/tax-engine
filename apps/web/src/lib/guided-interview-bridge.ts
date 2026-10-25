import { buildStandardDeductionFacts } from "./guided-standard-deduction-facts";
import { buildActualEducationInput } from "./guided-education-facts";
/**
 * Bridge between guided interview section data and the tax engine.
 *
 * Converts GuidedFlowState → TaxYearInput. Pure functions — no React, no side
 * effects.  The heavy preview computation (which pulls in the full tax engine
 * + decimal.js) lives in guided-preview-compute.ts so it can be loaded
 * on-demand via dynamic import without bloating the initial client bundle.
 */

import Decimal from "decimal.js";
import { parseGuidedCurrency, hasGuidedCurrency, formatGuidedDollars, sumGuidedDisplayAmounts } from "./guided-currency";
import { childCreditExclusionValues, dependentFactErrors, personalFactErrors } from "./guided-taxpayer-facts";
import { buildVehicleCreditInput, vehicleFactErrors } from "./guided-vehicle-facts";
import { buildAdoptionInput, adoptionFactErrors } from "./guided-adoption-facts";
import { allPaymentFactErrors, assertKnownFacts, deductionFactErrors, educationFactErrors, hasEnteredAmount, paymentFactErrors, retirementFactErrors } from "./guided-required-facts";
import { adjustmentFactErrors, householdFactErrors, isDeductibleAlimony } from "./guided-adjustment-facts";
import { statePaymentFactErrors, sumAdditionalStateWithholding } from "./guided-state-facts";
import { careFactErrors } from "./guided-credit-facts";
import { energyFactErrors } from "./guided-energy-facts";
import { w2FactErrors } from "./guided-w2-facts";
import { businessFactErrors, hasBusinessSourceData, isStartedNec, sumKnownBusinessAmounts, type BusinessSourceData } from "./guided-business-facts";
import { isStartedRental, rentalFactErrors, rentalExpenseFields } from "./guided-rental-facts";
import { investmentFactErrors, isStartedInvestment, type InvestmentSourceData } from "./guided-investment-facts";

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
      socialSecurityWithheld: toOptionalDecimalString(e.socialSecurityWithheld),
      medicareWages: toOptionalDecimalString(e.medicareWages),
      medicareWithheld: toOptionalDecimalString(e.medicareWithheld),
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
  return { payerTin: entry.payerTin?.trim() || undefined, accountHolder: entry.accountHolder === "primary" || entry.accountHolder === "spouse" ? entry.accountHolder : undefined, state: entry.state?.trim().toUpperCase() || undefined, stateWithheld: entry.stateTaxReporting === "none" ? "0" : toOptionalDecimalString(entry.stateWithheld) };
}

export function buildInterestInputs(entries: InterestEntryData[] | undefined) {
  return (entries ?? []).filter(isStartedInvestment).map(entry => ({
    ...investmentSourceInput(entry), payer: entry.payer.trim(),
    interestIncome: toOptionalDecimalString(entry.interestIncome),
    federalWithheld: toOptionalDecimalString(entry.federalWithheld),
    earlyWithdrawalPenalty: toOptionalDecimalString(entry.earlyWithdrawalPenalty),
    usSavingsBondInterest: toOptionalDecimalString(entry.usSavingsBondInterest),
    foreignTaxPaid: toOptionalDecimalString(entry.foreignTaxPaid),
    foreignCountry: entry.foreignCountry?.trim() || undefined,
    taxExemptInterest: toOptionalDecimalString(entry.taxExemptInterest),
  }));
}

export function buildDividendInputs(entries: DividendEntryData[] | undefined) {
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
  }));
}

export function buildBrokerageInputs(entries: BrokerageEntryData[] | undefined) {
  return (entries ?? []).filter(entry => isStartedInvestment(entry) || entry.transactions.some(isStartedInvestment)).map(entry => ({
    ...investmentSourceInput(entry), broker: entry.broker.trim(),
    transactions: entry.transactions.filter(isStartedInvestment).map(transaction => ({
      description: transaction.description.trim(), dateAcquired: transaction.dateAcquired, dateSold: transaction.dateSold,
      proceeds: toOptionalDecimalString(transaction.proceeds), costBasis: toOptionalDecimalString(transaction.costBasis),
      holdingPeriod: transaction.holdingPeriod || undefined,
      basisReportedToIRS: transaction.basisReportedToIRS ?? undefined, digitalAsset: transaction.digitalAsset ?? undefined,
      washSale: transaction.washSale ?? undefined, washSaleDisallowed: toOptionalDecimalString(transaction.washSaleDisallowed),
      adjustments: toOptionalDecimalString(transaction.adjustments),
    })),
  }));
}

export function buildDependents(
  countStr: string | undefined,
  detailedDependents?: DependentEntryData[],
) {
  const entries = detailedDependents ?? [];
  const count = countStr ?? String(entries.length);
  if (!/^\d+$/.test(count) || Number(count) > 20 || Number(count) !== entries.length) {
    throw new Error("Enter complete details for every dependent.");
  }
  return entries.map((entry, index) => {
    const errors = dependentFactErrors(entry, index);
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
  assertKnownFacts(deductionFactErrors(deductionData));
  const fields = {
    gamblingWinnings: deductionData.gamblingWinnings,
    ...(deductionData.method === "itemized" ? {
      medicalExpenses: deductionData.medicalExpenses,
      additionalStateLocalIncomeTaxes: hasEnteredAmount(deductionData.stateLocalTaxes) || stateReturnData?.additionalStateWithholdingEntries?.length
        ? parseGuidedCurrency(deductionData.stateLocalTaxes).plus(sumAdditionalStateWithholding(stateReturnData)).toFixed() : undefined,
      realEstateTaxes: deductionData.realEstateTaxes,
      personalPropertyTaxes: deductionData.personalPropertyTaxes,
      investmentInterestExpense: deductionData.investmentInterestExpense,
      gamblingLosses: deductionData.gamblingLosses,
    } : {}),
  };
  const values = Object.fromEntries(Object.entries(fields).filter(([, value]) => hasEnteredAmount(value)).map(([key, value]) => [key, toDecimalString(value)])) as Partial<Record<keyof typeof fields, string>>;
  return Object.keys(values).length ? values : undefined;
}

// ── Mortgage interest (Form 1098) converter ──────────────────────────────────

export function buildForm1098Inputs(deductionData: DeductionData | undefined) {
  if (!deductionData || deductionData.method !== "itemized") return [];
  assertKnownFacts(deductionFactErrors({ ...deductionData, charitableContributions: "", donationEntries: [] }));
  return (deductionData.mortgageEntries ?? []).map((entry) => ({
    lender: entry.lender.trim(),
    mortgageInterestReceived: toDecimalString(entry.mortgageInterest),
    outstandingMortgagePrincipal: toDecimalString(entry.outstandingPrincipal),
    mortgageOriginationDate: entry.originationDate,
  }));
}

// ── Charitable donations converter ──────────────────────────────────────────

export function buildDonationsInput(deductionData: DeductionData | undefined) {
  if (!deductionData) return [];
  assertKnownFacts(deductionFactErrors({ ...deductionData, mortgageInterest: "", mortgageEntries: [] }));
  return (deductionData.donationEntries ?? []).map((entry) => ({
    organization: entry.organization.trim(),
    type: entry.type as "cash" | "appreciated_stock" | "property" | "other",
    amount: toDecimalString(entry.amount),
    dateOfDonation: entry.date,
    ...(entry.type !== "cash" ? { costBasis: toDecimalString(entry.costBasis), isLongTermCapitalGain: entry.isLongTermCapitalGain as boolean } : {}),
    isPrivateFoundation: entry.isPrivateFoundation as boolean,
    qualifiedOrganization: entry.qualifiedOrganization ?? undefined,
    supportingOrganization: entry.supportingOrganization ?? undefined,
    donorAdvisedFund: entry.donorAdvisedFund ?? undefined,
    qualifiedAppreciatedStock: entry.qualifiedAppreciatedStock ?? undefined,
  }));
}

// ── Adjustments converter ───────────────────────────────────────────────────

export function buildAdjustmentsInput(adjustmentData: AdjustmentData | undefined) {
  if (!adjustmentData) return undefined;
  assertKnownFacts(adjustmentFactErrors(adjustmentData));

  const hsaDeduction = toDecimalString(adjustmentData.hsaDeduction);
  const studentLoanInterest = toDecimalString(adjustmentData.studentLoanInterest);
  const selfEmployedHealthInsurance = toDecimalString(adjustmentData.selfEmployedHealthInsurance);
  const educatorExpenses = toDecimalString(adjustmentData.educatorExpenses);
  const alimony = hasEnteredAmount(adjustmentData.alimonyPaid) ? {
    alimonyPaid: isDeductibleAlimony(adjustmentData) ? toDecimalString(adjustmentData.alimonyPaid) : "0",
    ...(isDeductibleAlimony(adjustmentData) ? { alimonyRecipientSSN: adjustmentData.alimonyQualification?.recipientSsn } : {}),
  } : undefined;

  if (
    hsaDeduction === "0" &&
    studentLoanInterest === "0" &&
    selfEmployedHealthInsurance === "0" &&
    educatorExpenses === "0" && !alimony
  ) {
    return undefined;
  }

  return {
    hsaDeduction,
    studentLoanInterest,
    selfEmployedHealthInsurance,
    primaryEducatorExpenses: educatorExpenses,
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

export function buildRetirementInputs(entries: RetirementEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  assertKnownFacts(retirementFactErrors(entries, false));
  return entries
    .filter((e) => hasEnteredAmount(e.grossDistribution) || hasEnteredAmount(e.taxableAmount))
    .map((e) => ({
      payer: e.payer.trim(),
      grossDistribution: toDecimalString(e.grossDistribution),
      taxableAmount: hasEnteredAmount(e.taxableAmount) ? toDecimalString(e.taxableAmount) : undefined,
      federalWithheld: toDecimalString(e.federalWithheld),
      isIraSepSimple: e.isIraSepSimple,
      distributionCode: e.distributionCode,
    }));
}

// ── Social Security (SSA-1099) converter ─────────────────────────────────

export function buildSocialSecurityInputs(data: SocialSecurityData | undefined) {
  if (!data || !hasValue(data.netBenefits)) return [];
  return [{
    netBenefits: toDecimalString(data.netBenefits),
    federalWithheld: toDecimalString(data.federalWithheld),
  }];
}

// ── Unemployment (1099-G) converter ──────────────────────────────────────

export function buildUnemploymentInputs(data: UnemploymentData | undefined) {
  if (!data || !hasValue(data.compensation)) return [];
  return [{
    payer: "State Unemployment",
    unemploymentCompensation: toDecimalString(data.compensation),
    federalWithheld: toDecimalString(data.federalWithheld),
  }];
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

export function buildDependentCareInput(creditsData: CreditsData | undefined) {
  if (!creditsData) return undefined;
  const { dependentCare } = creditsData;
  assertKnownFacts(careFactErrors(dependentCare));
  if (!hasValue(dependentCare.expenses)) return undefined;

  const qualifyingIndividuals = Number.parseInt(dependentCare.qualifyingIndividuals, 10);
  if (Number.isNaN(qualifyingIndividuals) || qualifyingIndividuals < 1) return undefined;

  return {
    expenses: toDecimalString(dependentCare.expenses),
    qualifyingIndividuals,
    primaryEarnedIncome: toDecimalString(dependentCare.primaryEarnedIncome),
    ...(hasEnteredAmount(dependentCare.spouseEarnedIncome) ? { spouseEarnedIncome: toDecimalString(dependentCare.spouseEarnedIncome) } : {}),
    excludedDependentCareBenefits: toDecimalString(dependentCare.excludedDependentCareBenefits),
    eligibilityConfirmed: dependentCare.eligibilityConfirmed as boolean,
  };
}

export { buildActualEducationInput as buildEducationInput } from "./guided-education-facts";

export function buildEnergyCreditsInput(creditsData: CreditsData | undefined) {
  if (!creditsData) return undefined;
  const { energy } = creditsData;
  assertKnownFacts(energyFactErrors(energy));
  const improvements = energy.qualifiedImprovements ?? [];
  const properties = energy.cleanEnergyProperties ?? [];
  const carryforward = hasEnteredAmount(energy.priorYearCarryforward);
  if (!improvements.length && !properties.length && !carryforward) return undefined;
  return {
    ...(improvements.length ? { qualifiedImprovements: improvements.map((entry) => ({
      category: entry.category as Exclude<typeof entry.category, "">,
      qualifiedCost: toDecimalString(entry.qualifiedCost),
      installationCompletedDate: entry.installationCompletedDate,
      qualificationConfirmed: entry.qualificationConfirmed as boolean,
      ...(entry.manufacturerQualifiedId?.trim() ? { manufacturerQualifiedId: entry.manufacturerQualifiedId.trim() } : {}),
    })) } : {}),
    ...(properties.length ? { cleanEnergyProperties: properties.map((entry) => ({
      category: entry.category as Exclude<typeof entry.category, "">,
      qualifiedCost: toDecimalString(entry.qualifiedCost),
      installationCompletedDate: entry.installationCompletedDate,
      qualificationConfirmed: entry.qualificationConfirmed as boolean,
      ...(hasEnteredAmount(entry.fuelCellKilowattCapacity) ? { fuelCellKilowattCapacity: toDecimalString(entry.fuelCellKilowattCapacity) } : {}),
    })) } : {}),
    ...(typeof energy.residenceEligibilityConfirmed === "boolean" ? { residenceEligibilityConfirmed: energy.residenceEligibilityConfirmed } : {}),
    ...(carryforward ? { priorYearCarryforward: toDecimalString(energy.priorYearCarryforward), carryforwardSourceTaxYear: Number(energy.carryforwardSourceTaxYear), carryforwardConfirmed: energy.carryforwardConfirmed as boolean } : {}),
  };
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
  const investData = sectionData["income-investments"] as
    | { interestEntries: InterestEntryData[]; dividendEntries: DividendEntryData[]; brokerageEntries: BrokerageEntryData[] }
    | undefined;
  const retirementData = sectionData["income-retirement"] as { entries: RetirementEntryData[] } | undefined;
  const rentalData = sectionData["income-rental"] as { entries: RentalPropertyEntryData[] } | undefined;
  const socialSecurityData = sectionData["income-social-security"] as SocialSecurityData | undefined;
  const unemploymentData = sectionData["income-unemployment"] as UnemploymentData | undefined;
  const deductionData = sectionData["deductions"] as DeductionData | undefined;
  const adjustmentData = sectionData["adjustments"] as AdjustmentData | undefined;
  const creditsData = sectionData["credits"] as CreditsData | undefined;
  const otherTaxesData = sectionData["other-taxes"] as OtherTaxesData | undefined;
  const paymentData = sectionData["payments"] as PaymentData | undefined;
  const stateReturnData = sectionData["state-return"] as StateReturnData | undefined;

  try {
    assertKnownFacts(w2FactErrors(w2Data?.entries, segmentation.filingStatus));
    assertKnownFacts(investmentFactErrors(investData, segmentation.filingStatus, state.taxYear, stateReturnData));
    assertKnownFacts(businessFactErrors(seData, segmentation.filingStatus, w2Data?.entries, stateReturnData));
    assertKnownFacts(rentalFactErrors(rentalData?.entries, segmentation.filingStatus, state.taxYear));
    assertKnownFacts(deductionFactErrors(deductionData, state.taxYear));
    assertKnownFacts(allPaymentFactErrors(paymentData, state.taxYear));
    assertKnownFacts(retirementFactErrors(retirementData?.entries));
    assertKnownFacts(educationFactErrors(creditsData, state.taxYear, segmentation.filingStatus, personalInfo));
    assertKnownFacts(adjustmentFactErrors(adjustmentData, segmentation.filingStatus, state.taxYear));
    assertKnownFacts(householdFactErrors(otherTaxesData, state.taxYear));
    assertKnownFacts(statePaymentFactErrors(stateReturnData, state.taxYear, segmentation.stateCode));
    assertKnownFacts(careFactErrors(creditsData?.dependentCare, segmentation.filingStatus));
    assertKnownFacts(energyFactErrors(creditsData?.energy, state.taxYear));
    assertKnownFacts(vehicleFactErrors(creditsData?.vehicles, state.taxYear, segmentation.filingStatus));
    assertKnownFacts(adoptionFactErrors(creditsData?.adoption, state.taxYear, segmentation.filingStatus));
  } catch { return null; }

  const stateCode = personalInfo?.state || segmentation.stateCode || null;
  const w2s = buildW2Inputs(w2Data?.entries);
  const necs = buildNecInputs(seData?.necEntries);
  const scheduleC = buildScheduleCInput(seData?.necEntries, seData?.manualGrossReceipts, seData?.expenses, seData?.qbiMateriallyParticipated, seData?.businessFacts);
  const form1099Int = buildInterestInputs(investData?.interestEntries);
  const form1099Div = buildDividendInputs(investData?.dividendEntries);
  const form1099B = buildBrokerageInputs(investData?.brokerageEntries);
  const form1099R = buildRetirementInputs(retirementData?.entries);
  const rentalProperties = buildRentalPropertyInputs(rentalData?.entries);
  const formSSA1099 = buildSocialSecurityInputs(socialSecurityData);
  const form1099G = buildUnemploymentInputs(unemploymentData);
  const scheduleA = buildScheduleAInput(deductionData, stateReturnData);
  const form1098 = buildForm1098Inputs(deductionData);
  const donations = buildDonationsInput(deductionData);
  const adjustments = buildAdjustmentsInput(adjustmentData);
  const ira = adjustmentData?.iraContributions;
  const iraDeductionWorksheet = ira ? {
    primaryContributions: toDecimalString(ira.primaryContributions),
    primaryIsActiveParticipant: ira.primaryIsActiveParticipant as boolean,
    primaryAge50OrOlder: state.taxYear - Number(personalInfo.dateOfBirth.slice(0, 4)) >= 50,
    ...(personalInfo.spouse && (segmentation.filingStatus === "mfj" || segmentation.filingStatus === "mfs") ? {
      spouseIsActiveParticipant: ira.spouseIsActiveParticipant as boolean,
      spouseAge50OrOlder: state.taxYear - Number(personalInfo.spouse.dateOfBirth.slice(0, 4)) >= 50,
    } : {}),
    ...(hasEnteredAmount(ira.spouseContributions) ? { spouseContributions: toDecimalString(ira.spouseContributions) } : {}),
  } : undefined;
  const dependentCare = buildDependentCareInput(creditsData);
  const educationExpenses = buildActualEducationInput(creditsData, state.taxYear, segmentation.filingStatus, personalInfo);
  const energyCredits = buildEnergyCreditsInput(creditsData);
  const scheduleH = buildScheduleHInput(otherTaxesData);
  const estimatedPayments = [
    ...buildEstimatedPaymentsInput(paymentData),
    ...(stateReturnData?.stateEstimatedPayments ?? []).map((entry) => ({ date: entry.date, amount: toDecimalString(entry.amount), type: "state" as const, state: entry.state })),
  ];
  const extensionPayments = (paymentData?.extensionPayments ?? []).map((entry) => ({ date: entry.date, amount: toDecimalString(entry.amount), type: "federal" as const }));
  const priorYearAppliedCredits = (paymentData?.priorYearAppliedCredits ?? []).map((entry) => ({ sourceTaxYear: Number(entry.sourceTaxYear), amount: toDecimalString(entry.amount), type: "federal" as const }));
  const paymentAdjustments = { estimatedTaxPayments: estimatedPayments, extensionPayments, priorYearAppliedCredits };

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
        state: stateCode,
        zip: personalInfo.zip,
      },
      dependents: buildDependents(personalInfo?.dependentCount, personalInfo?.dependents),
    },
    w2s,
    form1099Nec: necs,
    scheduleC: scheduleC ?? undefined,
    form1099Int,
    form1099Div,
    form1099B,
    form1099R,
    formSSA1099,
    form1099G,
    rentalProperties,
    scheduleA,
    form1098,
    donations,
    childTaxCredit: personalInfo.childTaxCredit ? {
      bonaFidePuertoRicoResident: personalInfo.childTaxCredit.bonaFidePuertoRicoResident ?? undefined,
      ...(hasEnteredAmount(personalInfo.childTaxCredit.possessionIncomeExclusion) || hasEnteredAmount(personalInfo.childTaxCredit.puertoRicoExcludedIncome) || hasEnteredAmount(personalInfo.childTaxCredit.form4563ExcludedIncome) ? childCreditExclusionValues(personalInfo.childTaxCredit) : {}),
      ...(hasEnteredAmount(personalInfo.childTaxCredit.nonTaxableCombatPayElection) ? { nonTaxableCombatPayElection: toDecimalString(personalInfo.childTaxCredit.nonTaxableCombatPayElection) } : {}),
    } : undefined,
    dependentCare,
    standardDeductionFacts: buildStandardDeductionFacts(personalInfo?.standardDeductionFacts, segmentation.filingStatus, state.taxYear, personalInfo),
    deductionElection: deductionData?.method ?? "automatic",
    educationExpenses,
    energyCredits,
    form8936: buildVehicleCreditInput(creditsData?.vehicles, state.taxYear, segmentation.filingStatus),
    form8839: buildAdoptionInput(creditsData?.adoption, state.taxYear, segmentation.filingStatus),
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
    if (transactions.length) {
      const total = sourceTotal(transactions.map(entry => entry.proceeds));
      answers.push({ factId: "broker-proceeds", answerText: total === null ? "Broker source records entered; some proceeds still need review." : `Broker proceeds entered: $${fmtNum(total)}.` });
      answers.push({ factId: "cost-basis-review", answerText: transactions.every(transaction => transaction.sourceClassificationConfirmed === true) ? "Cost basis and sale classifications reviewed against source records in the guided interview." : "Cost basis and sale classifications still need source review." });
    }
  }

  // Retirement → "retirement-distribution-review"
  const retData = state.sectionData["income-retirement"] as { entries: RetirementEntryData[] } | undefined;
  if (retData?.entries) {
    const filled = retData.entries.filter((e) => hasValue(e.grossDistribution) || hasValue(e.taxableAmount));
    if (filled.length > 0) {
      const totalTaxable = filled.reduce((sum, e) => sum.plus(numVal(e.taxableAmount)), new Decimal(0));
      answers.push({
        factId: "retirement-distribution-review",
        answerText: `${filled.length} 1099-R(s) confirmed. Taxable: $${fmtNum(totalTaxable)}.`,
      });
    }
  }

  // Social Security → "social-security-benefits-review"
  const ssData = state.sectionData["income-social-security"] as SocialSecurityData | undefined;
  if (ssData && hasValue(ssData.netBenefits)) {
    answers.push({
      factId: "social-security-benefits-review",
      answerText: `SSA-1099 confirmed. Net benefits: $${fmtNum(numVal(ssData.netBenefits))}.`,
    });
  }

  // Unemployment → "government-payments-review"
  const unemplData = state.sectionData["income-unemployment"] as UnemploymentData | undefined;
  if (unemplData && hasValue(unemplData.compensation)) {
    answers.push({
      factId: "government-payments-review",
      answerText: `1099-G confirmed. Unemployment: $${fmtNum(numVal(unemplData.compensation))}.`,
    });
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
      coverage: Object.keys(businessFactErrors(seData, state.segmentation.filingStatus, state.sectionData["income-w2"]?.entries, state.sectionData["state-return"])).length ? "partially-supported" : "supported",
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
      coverage: Object.keys(businessFactErrors(seData, state.segmentation.filingStatus, state.sectionData["income-w2"]?.entries, state.sectionData["state-return"])).length ? "partially-supported" : "supported",
      label: "Schedule C (guided interview)",
      notes: "Manual Schedule C gross receipts and expenses entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    });
  }

  const investData = state.sectionData["income-investments"] as
    | { interestEntries: InterestEntryData[]; dividendEntries: DividendEntryData[]; brokerageEntries: BrokerageEntryData[] }
    | undefined;

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

  const retData = state.sectionData["income-retirement"] as { entries: RetirementEntryData[] } | undefined;
  if (retData?.entries?.some((e) => hasValue(e.grossDistribution) || hasValue(e.taxableAmount))) {
    docs.push({
      id: "guided:1099-r",
      name: "Guided Interview — 1099-R",
      size: 0,
      uploadedAt: now,
      kind: "1099-r",
      coverage: "supported",
      label: "1099-R (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["retirement-distribution-review"],
    });
  }

  const ssData = state.sectionData["income-social-security"] as SocialSecurityData | undefined;
  if (ssData && hasValue(ssData.netBenefits)) {
    docs.push({
      id: "guided:ssa-1099",
      name: "Guided Interview — SSA-1099",
      size: 0,
      uploadedAt: now,
      kind: "ssa-1099",
      coverage: "supported",
      label: "SSA-1099 (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["social-security-benefits-review"],
    });
  }

  const unemplData = state.sectionData["income-unemployment"] as UnemploymentData | undefined;
  if (unemplData && hasValue(unemplData.compensation)) {
    docs.push({
      id: "guided:1099-g",
      name: "Guided Interview — 1099-G",
      size: 0,
      uploadedAt: now,
      kind: "1099-g",
      coverage: "supported",
      label: "1099-G (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["government-payments-review"],
    });
  }

  return docs.map((document) => ({ ...document, taxYear: state.taxYear ?? null }));
}
