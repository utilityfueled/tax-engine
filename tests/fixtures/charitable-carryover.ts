import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";
/** Synthetic public-cash vintages with explicitly zero intervening use/NOL reductions. */
export function syntheticPublicCashHistory(entries: { taxYear: number; amount: string }[], identity = { name: "Jane Doe", last4: "6789" }) {
  return {
    sourceTaxYear: 2025, sourceReference: "Synthetic public-cash source packet", sourceFactsConfirmed: true,
    allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: "continuous_individual" as const,
    membershipUnchangedConfirmed: true, primaryName: identity.name, primaryTaxpayerIdLast4: identity.last4,
    vintages: entries.map(row => ({ sourceId: `synthetic-cash-${row.taxYear}`, contributionYear: row.taxYear,
      category: "cash_60" as const, medium: "cash" as const, sourceReference: "Synthetic origin return",
      originalExcess: row.amount, originNolReduction: "0", openingCarryforward: row.amount,
      adjustedThroughTaxYear: 2024, allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
      history: Array.from({ length: 2024 - row.taxYear }, (_, index) => ({ taxYear: row.taxYear + index + 1,
        treatedAsPaid: "0", nolReduction: "0", sourceReference: "Synthetic intervening return, no use or reduction" })),
    })),
  };
}
export function charitableCarryoverFixture() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    charitableCarryoverSources: {
      sourceTaxYear: 2025, sourceReference: "Synthetic filed worksheet", sourceFactsConfirmed: true, allCarryoversIncluded: true,
      calendarYearTaxpayer: true, returnMembership: "continuous_individual", membershipUnchangedConfirmed: true,
      primaryName: "Jane Doe", primaryTaxpayerIdLast4: "6789", vintages: [{
        sourceId: "prior-property", contributionYear: 2024, category: "capital_gain_30", medium: "noncash",
        sourceReference: "Synthetic original worksheet", originalExcess: "5000", originNolReduction: "0", openingCarryforward: "5000",
        adjustedThroughTaxYear: 2024, allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true, history: [],
      }],
    },
    donations: [{ organization: "Synthetic public charity", type: "cash", amount: "6000", dateOfDonation: "2025-05-01", qualifiedOrganization: true, isPrivateFoundation: false },
      { organization: "Synthetic private charity", type: "cash", amount: "3000", dateOfDonation: "2025-05-01", qualifiedOrganization: true, isPrivateFoundation: true }],
  });
}
