import { describe, expect, it, vi } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs";
import { redactProviderPayload } from "@tax-engine/engine/src/provider-payload-redactor";
import { collectTransientTaxIdentifiers } from "@/lib/transient-tax-identifiers";
import { complexMFJFixture } from "../../fixtures/simple-w2";
vi.mock("server-only", () => ({}));

describe("private calculation source identities", () => {
  it("covers actual household, payer, care, adoption and bond source identities without exporting facts", () => {
    const facts = TaxYearInputSchema.parse({ ...structuredClone(complexMFJFixture),
      dependentCare: { expenses: "1000", providers: [{ name: "Synthetic Care Center", address: "44 Private Lane", identifierType: "tin", taxId: "44-5555555", householdEmployee: false, amountPaid: "1000" }] },
      form8839: { children: [{ childFirstName: "Hazel", childLastName: "Adoptee", childIdentifyingNumber: "900-72-1234" }] },
      form8815: { educationExpenses: [{ sourceId: "private-source-abc", beneficiaryName: "Synthetic Beneficiary", beneficiaryTaxId: "900-73-1234", relationship: "taxpayer", institutionName: "Synthetic Academy", institutionAddress: "99 Private Avenue", expenseType: "tuition_and_required_fees", paidTaxYear: 2025, amountPaid: "1000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] },
    });
    const before = JSON.stringify(facts), directIdentifiers = collectTransientTaxIdentifiers(facts);
    const identities = ["John", "Smith", "Tommy", "Bellevue", "Big Corp", "National Bank", "Vanguard", "Fidelity", "Wells Fargo", "Consulting Client", "Real Estate Fund LP", "United Way", "Synthetic Care Center", "44 Private Lane", "Hazel", "Adoptee", "900-72-1234", "Synthetic Beneficiary", "Synthetic Academy", "99 Private Avenue", "private-source-abc"];
    const redacted = redactProviderPayload({ question: identities.join(" | ") }, { directIdentifiers });
    for (const identity of identities) expect(redacted.payload.question).not.toContain(identity);
    expect(JSON.stringify(facts)).toBe(before);
    expect(directIdentifiers.some(identifier => identifier.value === "200000")).toBe(false);
  });
  it("covers legacy payer and recipient keys without a name suffix", () => {
    const facts = TaxYearInputSchema.parse({ ...structuredClone(complexMFJFixture),
      form1099K: [{ pse: "Harbor Payments", grossAmount: "0" }],
      form1099C: [{ creditor: "Mira Credit", amountDischarged: "0" }],
      formSSA1099: [{ recipient: "Leslie Recipient", netBenefits: "0" }],
    });
    const question = "Explain Harbor Payments and Mira Credit for Leslie Recipient.";
    const redacted = redactProviderPayload({ question }, { directIdentifiers: collectTransientTaxIdentifiers(facts) });
    for (const identity of ["Harbor Payments", "Mira Credit", "Leslie Recipient"]) expect(redacted.payload.question).not.toContain(identity);
  });
});
