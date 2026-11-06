import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export function hsaExcessSource(overrides: Record<string, unknown> = {}) {
  return { sourceTaxYear: 2025, sourceFactsConfirmed: true, priorYearSourceTaxYear: 2024,
    priorYearExcessContributions: "0", priorYearAdditionalTax: "0", valueDec31: "10000",
    returnedExcessContributionsUnder9100Relief: "0", returnedExcessContributionEarningsUnder9100Relief: "0", ...overrides };
}
export function hsaOwnerInput(overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly",
      spouse: { firstName: "Alex", lastName: "Doe", ssn: "987-65-4321", dateOfBirth: "1990-01-01" } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0", federalWithheld: "50000" }],
    form8889ByOwner: {
      primary: { accountOwner: "primary", coverageByMonth: Array(12).fill("self_only"), contributionsMade: "5000", employerContributions: "0", useLastMonthRule: false },
      spouse: { accountOwner: "spouse", coverageByMonth: Array(12).fill("self_only"), contributionsMade: "5000", employerContributions: "0", useLastMonthRule: false },
    },
    form5329HsaByOwner: { primary: hsaExcessSource({ valueDec31: "100" }), spouse: hsaExcessSource() }, ...overrides });
}
