import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export function charityReportingFixture() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", federalWithheld: "30000" }],
    donations: [
      { organization: "Synthetic cash recipient", type: "cash", amount: "20000.49", dateOfDonation: "2025-03-15", qualifiedOrganization: true, isPrivateFoundation: false },
      { organization: "Synthetic property recipient", type: "property", amount: "10000.51", costBasis: "11000", dateOfDonation: "2025-04-15", isLongTermCapitalGain: false, qualifiedOrganization: true, isPrivateFoundation: false },
    ],
    priorYear: { ...simpleW2Fixture.priorYear, charitableCarryforward: "1234.49",
      charitableCarryforwardByYear: [{ taxYear: 2024, category: "cash_60", amount: "1234.49" }] },
  });
}
