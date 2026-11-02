/** Synthetic original source facts; spec/federal/form-7206-return.yaml. */
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";
import { healthFacts } from "./form7206.js";
function source() {
  return { taxYear: 2025, accountHolder: "primary", foreignEarnedIncome: "120000", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "0", isSelfEmployed: false, sourceFactsConfirmed: true, eligibilityConfirmed: true, electionsValidConfirmed: true,
    claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false, housingExpensesQualificationConfirmed: true,
    employerProvidedForeignEarnedIncome: "120000", deductionsAllocableToExcludedIncome: "0", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "0",
    priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0", incomeSourceMappingConfirmed: true,
    partIV: { wages: "120000", businessPersonalServices: "0", partnershipPersonalServices: "0", noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0", allowanceCostOfLiving: "0", allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0", allowanceQuarters: "0", allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "120000", foreignEmploymentIncomeNotOnW2: "0", foreignBusinessIncomeAlreadyReported: "0", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" },
    sourceMapping: { sourceReference: "Actual foreign-service payroll ledger", sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
      rows: [{ sourceId: "formW2:0", sourceTaxYear: 2025, accountHolder: "primary", sourceReference: "Original employer W2 and foreign-service allocation", payerName: "Actual Employer", payerEin: "12-3456789", foreignEarnedIncome: "120000", priorYearIncomeReceived: "0" }] } };
}
function businessReturn(foreign: string, allocable: string, patch: Record<string, unknown> = {}, wages = false) {
  const form = source(), gross = (patch.grossReceipts as string | undefined) ?? "100000";
  Object.assign(form, { foreignEarnedIncome: foreign, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0", partIV: { ...form.partIV, wages: "0", businessPersonalServices: foreign },
    incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignBusinessIncomeAlreadyReported: foreign }, deductionsAllocableToExcludedIncome: allocable });
  form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleC", payerName: "Actual Services", payerEin: "12-3456789", foreignEarnedIncome: foreign, businessGrossReceipts: gross, businessReturnsAndAllowances: "0", businessCostOfGoodsSold: "0", businessOtherIncome: "0", capitalMaterialIncomeFactor: false } as never];
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: wages ? simpleW2Fixture.w2s : [], form2555: form,
    scheduleC: { accountHolder: "primary", businessName: "Actual Services", ein: "12-3456789", grossReceipts: gross, returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", materialParticipation: true, qbiMateriallyParticipated: true, ...patch } });
}

export function domesticFSignedHealthFixture() {
 const value=businessReturn("2787","3355",{grossReceipts:"200000",expenses:{supplies:"190000"}});
 Object.assign(value.form2555!.sourceMapping!.rows[0]!,{capitalMaterialIncomeFactor:true,reasonableServicesAllowance:"3000",reasonableAllowanceConfirmed:true,allBusinessIncomeForeignConfirmed:true});
 return TaxYearInputSchema.parse({...value,
  adjustments:{...value.adjustments,seRetirementContributions:"0"},
  scheduleF:{accountHolder:"primary",principalCropOrActivity:"Domestic vegetables",ein:"12-2222222",salesOfProductsRaised:"1000",qbiMateriallyParticipated:true},
  form7206:{...healthFacts("scheduleF","100"),domesticFarmSources:{sourceTaxYear:2025,sourceReference:"Original US-only farm activity and income ledger",sourceFactsConfirmed:true,businessSourceId:"scheduleF",accountHolder:"primary",principalCropOrActivity:"Domestic vegetables",ein:"12-2222222",allIncomeDomesticConfirmed:true,noSelfEmployedRetirementDeductionConfirmed:true}}
 });
}
