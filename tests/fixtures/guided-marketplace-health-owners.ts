import { emptyAdjustmentData, emptyCreditsData } from "@/lib/guided-interview-flow";
import { completeBusinessSection, completeW2Entry, startCompleteInterview } from "../guided-interview/complete-facts";
import { guidedMarketplaceHealthFacts, guidedMarketplaceCoverageFacts } from "./guided-marketplace-health";

/** Synthetic original sources: one actual business and one spouse shareholder. */
export function guidedMarketplaceHealthOwnersState() {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["self-employment", "w2-wages"], lifeEvents: ["self-employed-health-insurance"], stateCode: null });
  state.sectionData["income-self-employment"] = { ...structuredClone(completeBusinessSection), manualGrossReceipts: "30000" };
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, accountHolder: "spouse", employerName: "Actual Spouse Corporation", wages: "20000", socialSecurityWages: "17000", medicareWages: "17000" }] };
  const health = guidedMarketplaceHealthFacts();
  health.persons.push({ personId: "spouse", name: "Taylor Example", householdRole: "spouse", attainedAgeAtYearEnd: "33" });
  const primary = health.plans[0];
  if (!primary) throw new Error("Missing synthetic health plan");
  primary.payments.forEach(payment => {
    payment.ownerOrBusinessPaid = "500"; payment.advancePremiumTaxCredit = "0";
    payment.personAmounts.forEach(person => { person.amountPaid = "500"; person.advancePremiumTaxCredit = "0"; });
  });
  const spouse = structuredClone(primary);
  Object.assign(spouse, { planId: "spouse-plan", policyReference: "spouse-policy", accountHolder: "spouse", businessSourceId: "formW2:0", businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true, marketplacePolicySourceIds: ["form1095A:1"] });
  spouse.coveredPersons.forEach(person => { person.personId = "spouse"; });
  spouse.payments.forEach(payment => {
    payment.sourceId = `spouse-${payment.sourceId}`; payment.grossPremium = payment.ownerOrBusinessPaid = "250";
    payment.personAmounts.forEach(person => { person.personId = "spouse"; person.payer = "business_paid_or_reimbursed"; person.amountPaid = "250"; });
  });
  health.plans.push(spouse);
  const coverage = guidedMarketplaceCoverageFacts();
  coverage.taxFamilySize = "2";
  const first = coverage.policies[0];
  if (!first) throw new Error("Missing synthetic Marketplace policy");
  first.monthlyPremiums.forEach(month => { month.slcsp = "350"; month.advancePremiumTaxCredit = "0"; });
  coverage.policies.push({ ...structuredClone(first), policyNumber: "spouse-policy", monthlyPremiums: first.monthlyPremiums.map(month => ({ ...month, enrolleePremium: "250" })) });
  coverage.monthlyReconciliation.forEach(month => { month.enrolleePremium = "750"; month.slcsp = "700"; month.advancePremiumTaxCredit = "0"; });
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: health };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: coverage };
  return state;
}
