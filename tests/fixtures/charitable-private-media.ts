import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";
import { syntheticPublicCashHistory } from "./charitable-carryover.js";
export function privateCharitableVintage(year: number, medium: "cash" | "noncash", amount: string) {
  const original = syntheticPublicCashHistory([{ taxYear: year, amount }]).vintages[0];
  return { ...original, sourceId: `actual-private-${year}-${medium}`, category: "other_30" as const, medium };
}
/** Actual fictional media, complete origin histories and current receipt values. */
export function charitablePrivateMediaFixture() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, deductionElection: "itemized",
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", federalWithheld: "25000" }],
    charitableCarryoverSources: { ...syntheticPublicCashHistory([]), vintages: [
      privateCharitableVintage(2024, "cash", "3000.49"), privateCharitableVintage(2024, "noncash", "4000.51"),
    ] },
    donations: [
      { organization: "Synthetic private recipient", type: "cash", amount: "1000.49", dateOfDonation: "2025-05-01", qualifiedOrganization: true, isPrivateFoundation: true, recipientCategory: "private-nonoperating" },
      { organization: "Synthetic private recipient", type: "property", amount: "2000.51", costBasis: "2000.51", isLongTermCapitalGain: false, dateOfDonation: "2025-05-01", qualifiedOrganization: true, isPrivateFoundation: true, recipientCategory: "private-nonoperating" },
    ],
  });
}
