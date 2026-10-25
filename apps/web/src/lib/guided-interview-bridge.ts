/**
 * Bridge between guided interview section data and the tax engine.
 *
 * Converts GuidedFlowState → TaxYearInput. Pure functions — no React, no side
 * effects.  The heavy preview computation (which pulls in the full tax engine
 * + decimal.js) lives in guided-preview-compute.ts so it can be loaded
 * on-demand via dynamic import without bloating the initial client bundle.
 */

import Decimal from "decimal.js";
import { parseGuidedCurrency, hasGuidedCurrency, formatGuidedDollars } from "./guided-currency";
import { dependentFactErrors, personalFactErrors } from "./guided-taxpayer-facts";
import { allPaymentFactErrors, assertKnownFacts, deductionFactErrors, educationFactErrors, hasEnteredAmount, paymentFactErrors, retirementFactErrors } from "./guided-required-facts";
import { adjustmentFactErrors, householdFactErrors, isDeductibleAlimony } from "./guided-adjustment-facts";
import { statePaymentFactErrors, sumAdditionalStateWithholding } from "./guided-state-facts";
import { careFactErrors } from "./guided-credit-facts";

import type {
  AdjustmentData,
  BrokerageEntryData,
  CreditsData,
  DeductionData,
  DependentEntryData,
  DividendEntryData,
  EducationStudentData,
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
    : entry[field];
}

function stripPendingW2Suggestions(entry: W2EntryData): W2EntryData {
  return {
    ...entry,
    employerName: getConfirmedW2FieldValue(entry, "employerName"),
    employerEin: getConfirmedW2FieldValue(entry, "employerEin"),
    wages: getConfirmedW2FieldValue(entry, "wages"),
    federalWithheld: getConfirmedW2FieldValue(entry, "federalWithheld"),
    socialSecurityWages: getConfirmedW2FieldValue(entry, "socialSecurityWages"),
    socialSecurityWithheld: getConfirmedW2FieldValue(entry, "socialSecurityWithheld"),
    medicareWages: getConfirmedW2FieldValue(entry, "medicareWages"),
    medicareWithheld: getConfirmedW2FieldValue(entry, "medicareWithheld"),
    stateWages: getConfirmedW2FieldValue(entry, "stateWages"),
    stateWithheld: getConfirmedW2FieldValue(entry, "stateWithheld"),
  };
}

export function buildW2Inputs(
  entries: W2EntryData[] | undefined,
  defaultState?: string | null,
) {
  if (!entries || entries.length === 0) return [];
  return entries
    .map(stripPendingW2Suggestions)
    .filter((e) => hasValue(e.wages) || hasValue(e.federalWithheld))
    .map((e) => ({
      employer: {
        name: e.employerName.trim(),
        ein: e.employerEin.trim(),
      },
      wages: toDecimalString(e.wages),
      federalWithheld: toDecimalString(e.federalWithheld),
      socialSecurityWages: toDecimalString(e.socialSecurityWages),
      socialSecurityWithheld: toDecimalString(e.socialSecurityWithheld),
      medicareWages: toDecimalString(e.medicareWages),
      medicareWithheld: toDecimalString(e.medicareWithheld),
      stateWages: toDecimalString(e.stateWages),
      stateTaxWithheld: toDecimalString(e.stateWithheld),
      state: defaultState?.trim().toUpperCase() || undefined,
    }));
}

export function buildNecInputs(entries: NecEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter((e) => hasValue(e.nonemployeeCompensation))
    .map((e) => ({
      payer: e.payerName || "Client",
      payerTin: e.payerTin || undefined,
      nonemployeeCompensation: toDecimalString(e.nonemployeeCompensation),
      federalWithheld: toDecimalString(e.federalWithheld),
      stateWithheld: "0",
    }));
}

export function buildScheduleCInput(
  necEntries: NecEntryData[] | undefined,
  manualGrossReceipts: string | undefined,
  expenses: ScheduleCExpenseData | undefined,
  qbiMateriallyParticipated?: boolean | null,
) {
  const necGross = (necEntries ?? []).reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.nonemployeeCompensation)), new Decimal(0));
  const totalGross = necGross.plus(parseGuidedCurrency(manualGrossReceipts));
  if (totalGross.isZero() && !expenses) return undefined;

  return {
    grossReceipts: totalGross.toFixed(),
    qbiMateriallyParticipated: qbiMateriallyParticipated ?? undefined,
    expenses: expenses
      ? {
          advertising: toDecimalString(expenses.advertising),
          carAndTruck: toDecimalString(expenses.carAndTruck),
          insurance: toDecimalString(expenses.insurance),
          officeExpense: toDecimalString(expenses.officeExpense),
          supplies: toDecimalString(expenses.supplies),
          travel: toDecimalString(expenses.travel),
          meals: toDecimalString(expenses.meals),
          utilities: toDecimalString(expenses.utilities),
          otherExpenses: toDecimalString(expenses.otherExpenses),
        }
      : undefined,
  };
}

// ── Investment income converters ──────────────────────────────────────────

export function buildInterestInputs(entries: InterestEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter((e) => hasValue(e.interestIncome))
    .map((e) => ({
      payer: e.payer || "Financial Institution",
      interestIncome: toDecimalString(e.interestIncome),
      federalWithheld: toDecimalString(e.federalWithheld),
    }));
}

export function buildDividendInputs(entries: DividendEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter((e) => hasValue(e.ordinaryDividends) || hasValue(e.capitalGainDistributions))
    .map((e) => ({
      payer: e.payer || "Brokerage",
      ordinaryDividends: toDecimalString(e.ordinaryDividends),
      qualifiedDividends: toDecimalString(e.qualifiedDividends),
      totalCapitalGainDistributions: toDecimalString(e.capitalGainDistributions),
      federalWithheld: toDecimalString(e.federalWithheld),
      section199ADividends: toDecimalString(e.section199ADividends),
      foreignTaxPaid: toDecimalString(e.foreignTaxPaid),
    }));
}

export function buildBrokerageInputs(entries: BrokerageEntryData[] | undefined) {
  if (!entries || entries.length === 0) return [];
  return entries
    .filter((e) => e.transactions.some((t) => hasValue(t.proceeds) || hasValue(t.costBasis)))
    .map((e) => ({
      broker: e.broker || "Broker",
      transactions: e.transactions
        .filter((t) => hasValue(t.proceeds) || hasValue(t.costBasis))
        .map((t) => ({
          description: t.description || "Securities",
          dateAcquired: t.dateAcquired,
          dateSold: t.dateSold,
          proceeds: toDecimalString(t.proceeds),
          costBasis: toDecimalString(t.costBasis),
          holdingPeriod: t.holdingPeriod,
          basisReportedToIRS: t.basisReportedToIRS,
          digitalAsset: t.digitalAsset,
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
    .filter((e) => hasValue(e.rents))
    .map((e) => ({
      description: e.description || "Rental Property",
      propertyType: e.propertyType,
      rents: toDecimalString(e.rents),
      mortgageInterest: toDecimalString(e.mortgageInterest),
      taxes: toDecimalString(e.taxes),
      insurance: toDecimalString(e.insurance),
      repairs: toDecimalString(e.repairs),
      utilities: toDecimalString(e.utilities),
      depreciation: toDecimalString(e.depreciation),
      otherExpenses: toDecimalString(e.otherExpenses),
      qbiMateriallyParticipated: e.qbiMateriallyParticipated ?? undefined,
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

export function buildEducationInput(creditsData: CreditsData | undefined) {
  if (!creditsData) return undefined;
  assertKnownFacts(educationFactErrors(creditsData));
  const { education } = creditsData;

  const filledStudents = education.aocStudents.filter(
    (s: EducationStudentData) => hasEnteredAmount(s.qualifiedExpenses)
  );
  const hasLlc = hasValue(education.llcExpenses);

  if (filledStudents.length === 0 && !hasLlc) return undefined;

  return {
    aocStudents: filledStudents.map((s: EducationStudentData) => ({
      name: s.name.trim(),
      qualifiedExpenses: toDecimalString(s.qualifiedExpenses),
      priorYearsClaimed: Number(s.priorYearsClaimed),
      completedFirstFourYearsBeforeYear: s.completedFirstFourYearsBeforeYear ?? undefined,
      enrolledAtLeastHalfTime: s.enrolledAtLeastHalfTime ?? undefined,
      pursuingDegreeOrCredential: s.pursuingDegreeOrCredential ?? undefined,
      felonyDrugConviction: s.felonyDrugConviction ?? undefined,
      studentSsnEligible: s.studentSsnEligible ?? undefined,
      institutionEin: s.institutionEin?.trim() || undefined,
    })),
    llcExpenses: hasLlc ? toDecimalString(education.llcExpenses) : undefined,
    refundableAocEligible: education.refundableAocEligible ?? undefined,
    primarySsnEligible: education.primarySsnEligible ?? undefined,
    spouseSsnEligible: education.spouseSsnEligible ?? undefined,
  };
}

export function buildEnergyCreditsInput(creditsData: CreditsData | undefined) {
  if (!creditsData) return undefined;
  const { energy } = creditsData;

  const solarElectricCost = toDecimalString(energy.solarElectricCost);
  const solarWaterHeatingCost = toDecimalString(energy.solarWaterHeatingCost);
  const insulationCost = toDecimalString(energy.insulationCost);
  const exteriorDoorsWindowsCost = toDecimalString(energy.exteriorDoorsWindowsCost);
  const roofCost = toDecimalString(energy.roofCost);
  const energyEfficientHvacCost = toDecimalString(energy.energyEfficientHvacCost);
  const waterHeaterHeatPumpCost = toDecimalString(energy.waterHeaterHeatPumpCost);

  if (
    solarElectricCost === "0" &&
    solarWaterHeatingCost === "0" &&
    insulationCost === "0" &&
    exteriorDoorsWindowsCost === "0" &&
    roofCost === "0" &&
    energyEfficientHvacCost === "0" &&
    waterHeaterHeatPumpCost === "0"
  ) {
    return undefined;
  }

  // Map guided interview fields to engine schema.
  // The engine's Part II lumps doors/windows/roof into insulationCost and
  // HVAC + water-heater/heat-pump into energyPropertyCost.
  const part2InsulationCost = new Decimal(insulationCost).plus(exteriorDoorsWindowsCost).plus(roofCost).toFixed();
  const part2EnergyPropertyCost = new Decimal(energyEfficientHvacCost).plus(waterHeaterHeatPumpCost).toFixed();

  return {
    solarElectricCost: solarElectricCost !== "0" ? solarElectricCost : undefined,
    solarWaterHeatingCost: solarWaterHeatingCost !== "0" ? solarWaterHeatingCost : undefined,
    insulationCost: part2InsulationCost !== "0" ? part2InsulationCost : undefined,
    energyPropertyCost: part2EnergyPropertyCost !== "0" ? part2EnergyPropertyCost : undefined,
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
  const seData = sectionData["income-self-employment"] as
    | { necEntries: NecEntryData[]; manualGrossReceipts: string; expenses: ScheduleCExpenseData; qbiMateriallyParticipated?: boolean | null }
    | undefined;
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
    assertKnownFacts(deductionFactErrors(deductionData, state.taxYear));
    assertKnownFacts(allPaymentFactErrors(paymentData, state.taxYear));
    assertKnownFacts(retirementFactErrors(retirementData?.entries));
    assertKnownFacts(educationFactErrors(creditsData, state.taxYear, segmentation.filingStatus));
    assertKnownFacts(adjustmentFactErrors(adjustmentData, segmentation.filingStatus, state.taxYear));
    assertKnownFacts(householdFactErrors(otherTaxesData, state.taxYear));
    assertKnownFacts(statePaymentFactErrors(stateReturnData, state.taxYear, segmentation.stateCode));
    assertKnownFacts(careFactErrors(creditsData?.dependentCare, segmentation.filingStatus));
  } catch { return null; }

  const stateCode = personalInfo?.state || segmentation.stateCode || null;
  const w2s = buildW2Inputs(w2Data?.entries, stateCode);
  const necs = buildNecInputs(seData?.necEntries);
  const scheduleC = buildScheduleCInput(seData?.necEntries, seData?.manualGrossReceipts, seData?.expenses, seData?.qbiMateriallyParticipated);
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
  const educationExpenses = buildEducationInput(creditsData);
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
      },
      spouse: (segmentation.filingStatus === "mfj" || segmentation.filingStatus === "mfs") && personalInfo.spouse
        ? { ...personalInfo.spouse, usResidencyMonths: Number(personalInfo.spouse.usResidencyMonths) } : undefined,
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
    dependentCare,
    educationExpenses,
    energyCredits,
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

  // 1099-NEC → "nonemployee-compensation" and "schedule-c-expense-review"
  const seData = state.sectionData["income-self-employment"] as
    | { necEntries: NecEntryData[]; manualGrossReceipts: string; expenses: ScheduleCExpenseData }
    | undefined;
  if (seData) {
    const filled = seData.necEntries.filter((e) => hasValue(e.nonemployeeCompensation));
    const necTotal = filled.reduce((sum, e) => sum.plus(numVal(e.nonemployeeCompensation)), new Decimal(0));
    const manualGross = numVal(seData.manualGrossReceipts);

    if (filled.length > 0 || manualGross.gt(0)) {
      const summaryParts: string[] = [];

      if (filled.length > 0) {
        summaryParts.push(`${filled.length} 1099-NEC(s) confirmed: $${fmtNum(necTotal)}`);
      }

      if (manualGross.gt(0)) {
        summaryParts.push(`manual Schedule C gross receipts: $${fmtNum(manualGross)}`);
      }

      answers.push({
        factId: "nonemployee-compensation",
        answerText: `${summaryParts.join("; ")}.`,
      });
      answers.push({
        factId: "schedule-c-expense-review",
        answerText: "Schedule C expenses entered via guided interview.",
      });
    } else if (Object.values(seData.expenses).some((value) => hasValue(value))) {
      answers.push({
        factId: "schedule-c-expense-review",
        answerText: "Schedule C expenses entered via guided interview.",
      });
    }
  }

  // Interest → "taxable-interest"
  const investData = state.sectionData["income-investments"] as
    | { interestEntries: InterestEntryData[]; dividendEntries: DividendEntryData[]; brokerageEntries: BrokerageEntryData[] }
    | undefined;
  if (investData?.interestEntries) {
    const filled = investData.interestEntries.filter((e) => hasValue(e.interestIncome));
    if (filled.length > 0) {
      const total = filled.reduce((sum, e) => sum.plus(numVal(e.interestIncome)), new Decimal(0));
      answers.push({
        factId: "taxable-interest",
        answerText: `Taxable interest confirmed: $${fmtNum(total)}.`,
      });
    }
  }

  // Dividends → "ordinary-dividends", "qualified-dividends", "capital-gain-distributions"
  if (investData?.dividendEntries) {
    const filled = investData.dividendEntries.filter(
      (e) => hasValue(e.ordinaryDividends) || hasValue(e.capitalGainDistributions),
    );
    if (filled.length > 0) {
      const totalOrd = filled.reduce((sum, e) => sum.plus(numVal(e.ordinaryDividends)), new Decimal(0));
      const totalQual = filled.reduce((sum, e) => sum.plus(numVal(e.qualifiedDividends)), new Decimal(0));
      const totalCG = filled.reduce((sum, e) => sum.plus(numVal(e.capitalGainDistributions)), new Decimal(0));
      answers.push({
        factId: "ordinary-dividends",
        answerText: `Ordinary dividends confirmed: $${fmtNum(totalOrd)}.`,
      });
      if (totalQual.gt(0)) {
        answers.push({
          factId: "qualified-dividends",
          answerText: `Qualified dividends confirmed: $${fmtNum(totalQual)}.`,
        });
      }
      if (totalCG.gt(0)) {
        answers.push({
          factId: "capital-gain-distributions",
          answerText: `Capital gain distributions confirmed: $${fmtNum(totalCG)}.`,
        });
      }
    }
  }

  // Brokerage → "broker-proceeds" and "cost-basis-review"
  if (investData?.brokerageEntries) {
    const filled = investData.brokerageEntries.filter((e) =>
      e.transactions.some((t) => hasValue(t.proceeds) || hasValue(t.costBasis)),
    );
    if (filled.length > 0) {
      const totalProceeds = filled.reduce(
        (sum, b) => sum.plus(b.transactions.reduce((tSum, t) => tSum.plus(numVal(t.proceeds)), new Decimal(0))),
        new Decimal(0),
      );
      answers.push({
        factId: "broker-proceeds",
        answerText: `Broker proceeds confirmed: $${fmtNum(totalProceeds)}.`,
      });
      answers.push({
        factId: "cost-basis-review",
        answerText: "Cost basis and holding periods entered via guided interview.",
      });
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

  const seData = state.sectionData["income-self-employment"] as
    | { necEntries: NecEntryData[]; manualGrossReceipts: string; expenses: ScheduleCExpenseData }
    | undefined;
  if (seData?.necEntries?.some((e) => hasValue(e.nonemployeeCompensation))) {
    docs.push({
      id: "guided:1099-nec",
      name: "Guided Interview — 1099-NEC",
      size: 0,
      uploadedAt: now,
      kind: "1099-nec",
      coverage: "supported",
      label: "1099-NEC (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    });
  }
  if (seData && (hasValue(seData.manualGrossReceipts) || Object.values(seData.expenses).some((value) => hasValue(value)))) {
    docs.push({
      id: "guided:schedule-c",
      name: "Guided Interview — Schedule C",
      size: 0,
      uploadedAt: now,
      kind: "schedule-c-support",
      coverage: "supported",
      label: "Schedule C (guided interview)",
      notes: "Manual Schedule C gross receipts and expenses entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    });
  }

  const investData = state.sectionData["income-investments"] as
    | { interestEntries: InterestEntryData[]; dividendEntries: DividendEntryData[]; brokerageEntries: BrokerageEntryData[] }
    | undefined;

  if (investData?.interestEntries?.some((e) => hasValue(e.interestIncome))) {
    docs.push({
      id: "guided:1099-int",
      name: "Guided Interview — 1099-INT",
      size: 0,
      uploadedAt: now,
      kind: "1099-int",
      coverage: "supported",
      label: "1099-INT (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["taxable-interest"],
    });
  }

  if (investData?.dividendEntries?.some((e) => hasValue(e.ordinaryDividends) || hasValue(e.capitalGainDistributions))) {
    docs.push({
      id: "guided:1099-div",
      name: "Guided Interview — 1099-DIV",
      size: 0,
      uploadedAt: now,
      kind: "1099-div",
      coverage: "supported",
      label: "1099-DIV (guided interview)",
      notes: "Entered via guided interview.",
      matchedFixtureId: null,
      seededFactIds: ["ordinary-dividends", "qualified-dividends", "capital-gain-distributions"],
    });
  }

  if (investData?.brokerageEntries?.some((e) => e.transactions.some((t) => hasValue(t.proceeds) || hasValue(t.costBasis)))) {
    docs.push({
      id: "guided:1099-b",
      name: "Guided Interview — 1099-B",
      size: 0,
      uploadedAt: now,
      kind: "1099-b",
      coverage: "supported",
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
