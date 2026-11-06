/** Fictional original statements and paid costs; no calculated deduction input. */
import { AdjustmentsSchema, SavingsBondRedemptionSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { savingsBondReissueReturnInput } from "./savings-bond-reissue-return.js";

export function educatorBondSource(owner: "primary" | "spouse", cost: string, exclusion?: string) {
  return {
    accountHolder: owner, taxYear: 2025, schoolYear: "2024-2025", sourceFactsConfirmed: true,
    schools: [{ name: `Fictional ${owner} school`, role: "teacher", level: "k12", schoolEligible: true, hoursWorked: "1000" }],
    expenses: [{ sourceId: `${owner}-receipt`, datePaid: "2025-05-01", description: "Fictional classroom books", category: "classroom", amount: cost,
      ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false }],
    reimbursementsNotInWages: "0", excludedSavingsBondInterest: exclusion,
    nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0",
  };
}
export function educatorBondMagiInput() {
  const input = savingsBondReissueReturnInput(), w2 = input.w2s[0];
  if (!input.form8815 || !w2) throw new Error("Missing fictional source fixtures");
  delete input.form8815.reissueSources;
  input.form8815.priorYearInterestIncludedInCurrentStatements = "0";
  w2.wages = "149650"; w2.federalWithheld = "25000";
  input.savingsBondRedemptions = [SavingsBondRedemptionSchema.parse({ sourceId: "ordinary-original", proceeds: "3500", bondType: "paper_ee", faceValue: "6000", priorYearInterestReported: "0",
    issueDate: "2005-01-01", redemptionDate: "2025-06-01", ownerDateOfBirth: input.taxpayer.primary.dateOfBirth, registeredOwner: "taxpayer", ownershipConfirmed: true })];
  input.form1099Int = [{ payer: "Fictional Treasury", accountHolder: "primary", interestIncome: "0", usSavingsBondInterest: "500", taxExemptInterest: "0", privateActivityBondInterest: "0" }];
  input.adjustments = AdjustmentsSchema.parse({ educatorExpenseSources: [educatorBondSource("primary", "600", "490")] });
  return input;
}
export function educatorBondThirdsInput() {
  const input = educatorBondMagiInput(), bond = input.savingsBondRedemptions?.[0], w2 = input.w2s[0], statement = input.form1099Int[0];
  if (!bond || !w2 || !statement) throw new Error("Missing fictional original bond");
  w2.wages = "80000"; statement.usSavingsBondInterest = "1000";
  Object.assign(bond, { proceeds: "4000", registeredOwner: "taxpayer_and_spouse", ageTestOwner: "taxpayer", incomeOwnership: {
    sourceReference: "Fictional actual purchase and prior reporting records", sourceFactsConfirmed: true,
    communityProperty: false, ownershipUnchangedSinceIssueConfirmed: true,
    taxpayerPurchaseFunds: "1000", spousePurchaseFunds: "2000", taxpayerPriorYearInterestReported: "0", spousePriorYearInterestReported: "0",
  } });
  return TaxYearInputSchema.parse({ ...input, adjustments: { educatorExpenseSources: [
    { ...educatorBondSource("primary", "400"), savingsBondReductionMethod: "return_sources" },
    { ...educatorBondSource("spouse", "800"), savingsBondReductionMethod: "return_sources" },
  ] } });
}
