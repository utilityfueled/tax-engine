import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "./marketplace-health.js";
import { simpleW2Fixture } from "./simple-w2.js";

/** Original fictional shareholder W2s, policies and payments; no calculated overrides. */
export function separateOwnerMarketplaceHealthInput(separateOwner: "primary" | "spouse" = "primary") {
  const source = marketplaceHealthInput();
  const original = source.form7206?.plans?.[0];
  if (!original || !source.form7206 || !source.form8962) throw new Error("Missing fictional original source");
  const owners = ["primary", "spouse", separateOwner] as const;
  const premiums = ["500", "250", "200"];
  const wages = ["46000", "43000", "12400"];
  const medicare = ["40000", "40000", "10000"];
  const socialSecurityWithheld = ["2480", "2480", "620"];
  const medicareWithheld = ["580", "580", "145"];
  return TaxYearInputSchema.parse({ ...source,
    taxpayer: { ...source.taxpayer, taxYear: 2025, filingStatus: "married_filing_jointly",
      spouse: { firstName: "John", lastName: "Doe", ssn: "555-55-5555", dateOfBirth: "1991-01-02" } },
    scheduleC: undefined,
    w2s: owners.map((accountHolder, index) => ({ ...simpleW2Fixture.w2s[0], taxYear: 2025, accountHolder,
      employer: { name: `Original Corporation ${index + 1}`, ein: ["12-3456789", "23-4567890", "34-5678901"][index] },
      wages: wages[index], federalWithheld: index === 0 ? "20000" : "0", socialSecurityWages: medicare[index], socialSecurityTips: "0",
      medicareWages: medicare[index], socialSecurityWithheld: socialSecurityWithheld[index], medicareWithheld: medicareWithheld[index] })),
    form1095A: owners.slice(0, 2).map((owner, index) => ({ ...source.form1095A[0], taxYear: 2025, policyNumber: `ACTUAL-${owner}-SPECIFIED`,
      monthlyPremiums: source.form1095A[0].monthlyPremiums.map(month => ({ ...month, enrolleePremium: premiums[index], slcsp: "500", advancePremiumTaxCredit: "0" })) })),
    form8962: { ...source.form8962, taxFamilySize: 2,
      monthlyReconciliation: source.form8962.monthlyReconciliation?.map(month => ({ ...month, enrolleePremium: "750", slcsp: "1000", advancePremiumTaxCredit: "0" })) },
    form7206: { ...source.form7206, sourceTaxYear: 2025,
      marketplaceCreditAllocation: { sourceTaxYear: 2025, sourceReference: "Original consistent monthly enrollment credit choice", sourceFactsConfirmed: true,
        method: "monthly_eligible_plan_enrollment", sameMethodForAllCalculationsConfirmed: true },
      persons: [{ personId: "primary", name: "Jane Doe", householdRole: "primary", attainedAgeAtYearEnd: 35 },
        { personId: "spouse", name: "John Doe", householdRole: "spouse", attainedAgeAtYearEnd: 34 }],
      plans: owners.map((owner, index) => ({ ...original, planId: `original-plan-${index}`, policyReference: `Original policy ${index + 1}`, accountHolder: owner,
        businessSourceId: `formW2:${index}`, businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
        marketplaceCoverage: index < 2, premiumTaxCreditInvolved: index < 2, marketplacePolicySourceIds: index < 2 ? [`form1095A:${index}`] : undefined,
        allCoveredPersonsInCoverageFamilyConfirmed: index < 2 ? true : undefined,
        coveredPersons: [{ personId: owner, relationshipToOwner: "self" }],
        payments: original.payments?.map(payment => ({ ...payment, sourceId: `plan-${index}-${payment.sourceId}`,
          datePaid: payment.datePaid?.replace("2026-", "2025-"), coverageTaxYear: 2025, grossPremium: premiums[index], ownerOrBusinessPaid: premiums[index], advancePremiumTaxCredit: "0",
          personAmounts: [{ personId: owner, payer: "business_paid_or_reimbursed", amountPaid: premiums[index], advancePremiumTaxCredit: "0", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] })) })) },
  });
}
