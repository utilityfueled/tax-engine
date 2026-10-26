import { ScheduleK1Schema, TaxYearInputSchema } from "@/models/inputs.js";
import { separateBusinessHealthInput } from "./marketplace-health-separate-business.js";

/** Fictional original sources. No calculated allowance is supplied. */
export function marketplaceHealthNegativeLimitInput(zeroAdvances = false) {
  const input = separateBusinessHealthInput();
  const farm = input.form7206?.plans?.find(plan => plan.businessSourceId === "scheduleF");
  if (!farm?.payments || !input.form8962?.monthlyReconciliation) throw new Error("Missing fictional source");
  for (const payment of farm.payments) {
    payment.grossPremium = "500";
    payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) person.amountPaid = "500";
  }
  if (zeroAdvances) {
    for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.advancePremiumTaxCredit = "0";
    for (const month of input.form8962.monthlyReconciliation) month.advancePremiumTaxCredit = "0";
    for (const plan of input.form7206?.plans ?? []) if (plan.marketplaceCoverage) for (const payment of plan.payments ?? []) {
      payment.advancePremiumTaxCredit = "0";
      payment.ownerOrBusinessPaid = payment.grossPremium;
      for (const person of payment.personAmounts ?? []) {
        person.advancePremiumTaxCredit = "0";
        person.amountPaid = payment.grossPremium;
      }
    }
  }
  return TaxYearInputSchema.parse(input);
}

/** Actual two-partnership sources for the existing K-1 guide route. */
export function partnershipHealthNegativeLimitInput() {
  const input = marketplaceHealthNegativeLimitInput();
  input.scheduleC = undefined; input.scheduleF = undefined;
  input.scheduleK1 = [5000, 20000].map((value, index) => ScheduleK1Schema.parse({ taxYear: 2025,
    partnershipName: `Actual ordinary partnership ${index + 1}`, partnershipEIN: `12-345678${index + 1}`,
    entityType: "partnership", accountHolder: "primary", ordinaryIncome: String(value), section199AQBI: String(value),
    section199AW2Wages: "0", section199AUBIA: "0", section199AIsSST: false, isPassiveActivity: false, qbiMateriallyParticipated: true,
    selfEmploymentFactsConfirmed: true, selfEmploymentEarnings: String(value), selfEmploymentNetEarningsAfterAdjustments: String(value), selfEmploymentIncomeType: "nonfarm" }));
  for (const [index, plan] of (input.form7206?.plans ?? []).entries()) {
    plan.businessSourceId = `scheduleK1:${index}`; plan.businessKind = "partnership"; plan.policyHolder = "business";
  }
  if (!input.form7206) throw new Error("Missing actual health sources");
  Object.assign(input.form7206, { partnershipGrossIncomeSources: { sourceTaxYear: 2025,
    sourceReference: "Actual partnership gross-income statements", sourceFactsConfirmed: true,
    statements: input.scheduleK1.map((original, index) => ({ businessSourceId: `scheduleK1:${index}`, accountHolder: "primary",
      sourceReference: `Original partnership ${index + 1} gross statement`, sourceFactsConfirmed: true,
      originalK1: { taxYear: original.taxYear, partnershipName: original.partnershipName, partnershipEIN: original.partnershipEIN,
        accountHolder: original.accountHolder, ordinaryIncome: original.ordinaryIncome, selfEmploymentEarnings: original.selfEmploymentEarnings,
        selfEmploymentIncomeType: original.selfEmploymentIncomeType }, grossIncome: index === 0 ? "10000" : "40000",
      ordinaryActivityOnlyConfirmed: true, allGrossIncomeIncludedConfirmed: true })) } });
  return input;
}
