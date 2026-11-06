import { TaxYearInputSchema } from "@/models/inputs.js";
import { separateBusinessHealthInput } from "./marketplace-health-separate-business.js";

/** Actual fictional premiums; all amounts remain original source records. */
export function marketplaceNonspecifiedStopInput(spouse = false) {
  const input = separateBusinessHealthInput();
  const health = input.form7206, credit = input.form8962;
  const farm = health?.plans?.find(plan => plan.businessSourceId === "scheduleF");
  if (!health?.plans || !farm || !credit || !input.scheduleF) throw new Error("Missing synthetic source");
  const proprietor = structuredClone(farm);
  proprietor.planId = "proprietor-nonspecified";
  proprietor.policyReference = "Actual separate proprietor medical policy";
  proprietor.businessSourceId = "scheduleC";
  for (const payment of proprietor.payments ?? []) {
    payment.sourceId = `proprietor-${payment.sourceId}`;
    payment.grossPremium = "500";
    payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) person.amountPaid = "500";
  }
  health.plans.push(proprietor);
  if (spouse) {
    input.taxpayer.filingStatus = "married_filing_jointly";
    input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: "Alex", ssn: "999-88-7777" };
    input.scheduleF.accountHolder = "spouse";
    farm.accountHolder = "spouse";
    for (const person of farm.coveredPersons ?? []) person.relationshipToOwner = "spouse";
    credit.taxFamilySize = 2;
  }
  return TaxYearInputSchema.parse(input);
}
