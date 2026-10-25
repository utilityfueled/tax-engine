import { emptyPersonalInfo, emptyW2Entry, emptyNecEntry, emptyScheduleCExpenses, emptyInterestEntry, emptyDividendEntry, emptyCapitalGainTransaction, emptyRentalPropertyEntry, startInterview, type PersonalInfoData, type SegmentationAnswers, type DependentEntryData, type W2EntryData, type RentalPropertyEntryData } from "@/lib/guided-interview-flow";

/** Explicit synthetic W-2 source facts; blank application fields stay unknown. */
export const completeW2Entry: W2EntryData = { ...emptyW2Entry, employerName: "Synthetic Employer", employerEin: "12-3456789", accountHolder: "primary", wages: "0", federalWithheld: "0", socialSecurityWages: "0", socialSecurityTips: "0", socialSecurityWithheld: "0", medicareWages: "0", medicareWithheld: "0", box10DependentCareBenefits: "0", stateTaxReporting: "none" };

/** Synthetic, explicitly supplied facts; never production defaults. */
export const completePersonalInfo: PersonalInfoData = {
  ...emptyPersonalInfo, standardDeductionFacts: { primaryBlind: false, spouseBlind: false, primaryCanBeClaimedAsDependent: false, spouseCanBeClaimedAsDependent: false, primaryDeceased: false, spouseDeceased: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false }, firstName: "Jordan", lastName: "Example", ssn: "111-22-3333",
  dateOfBirth: "1990-02-15", usResidencyMonths: "12", stateResidency: "full-year",
  addressLine1: "42 Example Road", city: "Columbus", state: "OH", zip: "43215",
  dependentCount: "0", dependents: [], livedWithSpouseAtAnyTimeDuringYear: true,
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  childTaxCredit: { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "0", form4563ExcludedIncome: "0" },
  spouse: { firstName: "Taylor", lastName: "Example", ssn: "222-33-4444", dateOfBirth: "1992-09-10", usResidencyMonths: "12", employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
};

export const completeDependent: DependentEntryData = {
  firstName: "Alex", lastName: "Example", ssn: "333-44-5555", dateOfBirth: "2015-06-01",
  relationship: "child", monthsLivedWithYou: "12", qualifiesForCTC: true,
  qualifiesForODC: false, qualifiesForEIC: false,
  ctcSsnEligible: true, odcTinEligible: true,
};

export function startCompleteInterview(segmentation: SegmentationAnswers) {
  const state = startInterview(segmentation, 2025);
  state.sectionData["personal-info"] = structuredClone(completePersonalInfo);
  return state;
}

export const completeAocEligibility = {
  completedFirstFourYearsBeforeYear: false,
  enrolledAtLeastHalfTime: true,
  pursuingDegreeOrCredential: true,
  felonyDrugConviction: false,
  studentTaxId: "111-22-3333", studentRole: "primary" as const,
  studentTinEligible: true, studentSsnEligible: true,
  institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true,
  institutionEin: "12-3456789",
  institutions: [{ name: "Synthetic College", address: "100 College Rd, Columbus OH 43215", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }],
};

/** Actual answers supplied by synthetic fixtures, never interview defaults. */
export const completeEducationClaimant = {
  primaryTinEligible: true, primarySsnEligible: true, spouseSsnEligible: true,
  canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false,
  aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: "0",
  refundableAocFacts: { fullTimeStudent: true, earnedIncome: "0", totalSupport: "10000", parentAlive: true },
};

export const completeHouseholdEmployee = { name: "Actual Employee", cashWages: "0", federalIncomeTaxWithheld: "0", isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false };

/** Complete fictional investment source facts for synthetic tests, never UI defaults. */
const sourceIdentity = { accountHolder: "primary" as const, payerTin: "12-3456789", stateTaxReporting: "none" as const, state: "", stateWithheld: "0" };
export const completeInterestSource = { ...emptyInterestEntry, ...sourceIdentity, payer: "Actual bank", interestIncome: "0", federalWithheld: "0", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0", foreignTaxPaid: "0", foreignCountry: "", taxExemptInterest: "0", privateActivityBondInterest: "0", marketDiscount: "0", bondPremium: "0", treasuryBondPremium: "0", taxExemptBondPremium: "0" };
export const completeDividendSource = { ...emptyDividendEntry, ...sourceIdentity, payer: "Actual fund", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0", federalWithheld: "0", section199ADividends: "0", foreignTaxPaid: "0", foreignCountry: "", section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0", nondividendDistributions: "0", exemptInterestDividends: "0", specifiedPrivateActivityBondInterest: "0", section897OrdinaryDividends: "0", section897CapitalGain: "0" };
export const completeTransactionSource = { ...emptyCapitalGainTransaction, description: "Actual security", dateAcquired: "2024-01-02", dateSold: "2025-02-03", proceeds: "0", costBasis: "0", holdingPeriod: "long" as const, basisReportedToIRS: false, digitalAsset: false, washSale: false, washSaleDisallowed: "0", adjustments: "0", sourceClassificationConfirmed: true };
export const completeBrokerageSource = { ...sourceIdentity, broker: "Actual broker", federalWithheld: "0", transactions: [completeTransactionSource] };

export const completeInterestEntry = completeInterestSource;
export const completeDividendEntry = completeDividendSource;

/** Explicit synthetic business source answers; application blanks stay unknown. */
export const completeNecSource = { ...emptyNecEntry, payerName: "Synthetic client", payerTin: "12-3456789", accountHolder: "primary" as const, nonemployeeCompensation: "0", federalWithheld: "0", stateTaxReporting: "none" as const, state: "", stateIncome: "0", stateWithheld: "0" };
export const completeBusinessExpenses = Object.fromEntries(Object.keys(emptyScheduleCExpenses).map(key => [key, "0"])) as typeof emptyScheduleCExpenses;
export const completeBusinessFacts = { accountHolder: "primary" as const, activityDescription: "Independent design services", businessCode: "541430", accountingMethod: "cash" as const, singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", contractLabor: "0", depreciation: "0", legalAndProfessional: "0", w2WagesPaid: "0", ubiaQualifiedProperty: "0", isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: "0", additionalWorksheetRequired: false, otherExpenseDescription: "Fictional qualified business expense", mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true };
export const completeBusinessSection = { necEntries: [], manualGrossReceipts: "0", expenses: completeBusinessExpenses, businessFacts: completeBusinessFacts, qbiMateriallyParticipated: true };

/** Explicit synthetic rental records; none of these answers are application defaults. */
export const completeRentalSource: RentalPropertyEntryData = {
  ...emptyRentalPropertyEntry, description: "100 Actual Rental Road, Columbus OH 43215", propertyType: "single_family",
  accountHolder: "primary", ownershipPercentage: "100", minimumOwnershipPercentage: "100", personalUseDays: "0", rentalDays: "300", sourceFactsConfirmed: true,
  heldForRental: true, amountsAreWholeProperty: true, isActiveParticipant: true, allInvestmentAtRisk: true,
  realEstateProfessional: false, substantialServices: false, selfRental: false, additionalWorksheetRequired: false,
  priorYearUnallowedLoss: "0", priorYearUnallowedCredits: "0", qualifiesForQBI: false, qbiMateriallyParticipated: false,
  advertising: "0", autoTravel: "0", cleaning: "0", commissions: "0", legalProfessional: "0", managementFees: "0", otherInterest: "0", supplies: "0",
  rents: "0", mortgageInterest: "0", taxes: "0", insurance: "0", repairs: "0", utilities: "0", depreciation: "0", otherExpenses: "0",
  depreciationWorksheetConfirmed: true, autoTravelWorksheetConfirmed: true, otherExpenseDescription: "Actual qualified miscellaneous costs",
};

/** Explicit synthetic ordinary mortgage facts; never defaults for imported sources. */
export const completeMortgageSource = {
  lender: "Actual Lender", mortgageInterest: "100", outstandingPrincipal: "250000", originationDate: "2020-01-01",
  sourceTaxYear: "2025", accountReference: "synthetic-loan-1", accountHolder: "primary" as const,
  propertyAddress: "123 Example Street, Columbus OH 43215", propertyUse: "main-home" as const,
  loanType: "original" as const, proceedsUse: "acquisition" as const,
  securedDebt: true, ownershipInterest: true, obligationToRepay: true, interestPaidByReturn: true,
  currentYearInterestOnly: true, rentalOrBusinessUse: false, mortgageCreditCertificate: false,
  specialCircumstances: false, maximumBalanceDuringYear: "250000", sourceFactsConfirmed: true,
  refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", propertyTaxPaid: "0",
  hasMortgageInsuranceAllocation: false,
};

/** Explicit ordinary 1099-R facts for synthetic checks, not application defaults. */
export const completeRetirementSource = {
  payer: "Actual retirement payer", payerTin: "12-3456789", accountHolder: "primary" as const,
  sourceTaxYear: "2025", accountReference: "synthetic-retirement-1", grossDistribution: "1000", taxableAmount: "1000", federalWithheld: "0", distributionCode: "7", isIraSepSimple: false,
  taxableAmountNotDetermined: false, taxableAmountConfirmed: true, employeeContributions: "0",
  capitalGainIncluded: "0", netUnrealizedAppreciation: "0", otherSourceAmount: "0", inPlanRothRolloverAmount: "0",
  stateTaxReporting: "none" as const, localTaxReporting: "none" as const,
  iraBasisConfirmedZero: true, eligibleGovernmental457bPlan: false, militaryPensionOrSurvivorBenefit: false,
  qualifiedJointSurvivorAnnuity: false, additionalWorksheetRequired: false, sourceFactsConfirmed: true,
  trumpAccount: false, excessContributionEarnings: "0",
};

/** Explicit synthetic SSA sources and resident/exclusion facts, never UI defaults. */
export const completeSocialSecuritySource = { sourceType: "ssa-1099" as const, sourceTaxYear: "2025", accountReference: "synthetic-ssa", beneficiaryRole: "primary" as const, recipient: "Jordan Example", beneficiaryTaxIdLast4: "3333", benefitsPaid: "0", benefitsRepaid: "0", netBenefits: "0", federalWithheld: "0", priorYearBenefits: false, sourceFactsConfirmed: true };
export const completeSocialSecurityTreatment = { residentTreatmentConfirmed: true, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", sourceFactsConfirmed: true };
