import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "./marketplace-health.js";

/** Actual synthetic separate policies, business owners and payments; no calculated overrides. */
export function twoOwnerMarketplaceHealthInput(year: 2025 | 2026 = 2025, advances: "none" | "full" = "none") {
  const source = marketplaceHealthInput();
  const original = source.form7206?.plans?.[0];
  if (!original || !source.form7206 || !source.form8962) throw new Error("Missing synthetic policy source");
  const owners = ["primary", "spouse"] as const;
  const premiums = ["500", "250"];
  return TaxYearInputSchema.parse({ ...source,
    taxpayer: { ...source.taxpayer, taxYear: year, filingStatus: "married_filing_jointly",
      spouse: { firstName: "John", lastName: "Doe", ssn: "555-55-5555", dateOfBirth: "1991-01-02" } },
    scheduleC: { accountHolder: "primary", businessName: "Actual proprietor", grossReceipts: "30000", qbiMateriallyParticipated: true },
    scheduleF: { accountHolder: "spouse", principalCropOrActivity: "Actual farm", salesOfProductsRaised: "20000", qbiMateriallyParticipated: true },
    form1095A: owners.map((owner,index) => ({ ...source.form1095A[0], taxYear: year, policyNumber: `ACTUAL-${owner}-POLICY`,
      monthlyPremiums: source.form1095A[0].monthlyPremiums.map(month => ({ ...month, enrolleePremium: premiums[index], slcsp: "350", advancePremiumTaxCredit: advances === "full" ? premiums[index] : "0" })) })),
    form8962: { ...source.form8962, taxFamilySize: 2,
      monthlyReconciliation: source.form8962.monthlyReconciliation?.map(month => ({ ...month, enrolleePremium: "750", slcsp: "700", advancePremiumTaxCredit: advances === "full" ? "750" : "0" })) },
    form7206: { ...source.form7206, sourceTaxYear: year,
      persons: [{ personId: "primary", name: "Jane Doe", householdRole: "primary", attainedAgeAtYearEnd: year - 1990 },
        { personId: "spouse", name: "John Doe", householdRole: "spouse", attainedAgeAtYearEnd: year - 1991 }],
      plans: owners.map((owner,index) => ({ ...original, planId: `${owner}-medical`, policyReference: `Actual ${owner} policy`, accountHolder: owner,
        businessSourceId: index === 0 ? "scheduleC" : "scheduleF", marketplacePolicySourceIds: [`form1095A:${index}`],
        coveredPersons: [{ personId: owner, relationshipToOwner: "self" }],
        payments: original.payments?.map(payment => ({ ...payment, sourceId: `${owner}-${payment.sourceId}`, datePaid: payment.datePaid?.replace("2026-", `${year}-`), coverageTaxYear: year,
          grossPremium: premiums[index], ownerOrBusinessPaid: advances === "full" ? "0" : premiums[index], advancePremiumTaxCredit: advances === "full" ? premiums[index] : "0",
          personAmounts: [{ personId: owner, payer: "owner_after_tax", amountPaid: advances === "full" ? "0" : premiums[index], advancePremiumTaxCredit: advances === "full" ? premiums[index] : "0", excludedPublicSafetyOfficerAmount: "0", otherTaxFreeFunding: "0" }] })) })) },
  });
}
