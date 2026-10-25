// Spec: spec/federal/crypto-charitable-integration.yaml
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateCryptoDonations } from "@/engine/forms/crypto-lot-matching.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateCharitableContributionWorksheet } from "@/engine/forms/charitable-contribution-worksheet.js";
import { d } from "@/utils/decimal.js";
import { CryptoDonationSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const gift = (overrides: Record<string, unknown> = {}) => ({
  asset: "BTC", quantity: "1", dateAcquired: "2023-01-01", dateDonated: "2026-06-01",
  fairMarketValueAtDonation: "40000", costBasis: "10000", charityName: "Actual public charity",
  isQualifiedOrganization: true, recipientCategory: "fifty-percent", capitalAsset: true,
  sourceFactsConfirmed: true, fullOwnershipInterestDonated: true, noGoodsOrServicesReceived: true,
  substantiationRequirementsMet: true, appraisalRequired: true, qualifiedAppraisalObtained: true,
  ...overrides,
});
const input = (year: number, gifts: ReturnType<typeof gift>[], extra: Record<string, unknown> = {}) => TaxYearInputSchema.parse({
  ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", socialSecurityWages: "100000", medicareWages: "100000", federalWithheld: "40000" }],
  deductionMethod: "itemized", cryptoIncome: { donations: gifts }, ...extra,
});
describe("Crypto charitable source integration", () => {
  it("values gifts before limitations using actual property facts", () => {
    const short = calculateCryptoDonations([CryptoDonationSchema.parse(gift({ dateAcquired: "2026-01-01", fairMarketValueAtDonation: "8000", costBasis: "12000" }))], 2026);
    expect(short.totalDeduction.toString()).toBe("8000");
    const anniversary = calculateCryptoDonations([CryptoDonationSchema.parse(gift({ dateAcquired: "2024-01-01", dateDonated: "2025-01-01" }))], 2025);
    expect(anniversary.shortTermDonations).toHaveLength(1); // A leap year does not turn the anniversary into more than a year.
    expect(anniversary.totalDeduction.toString()).toBe("10000");
    const disqualified = calculateCryptoDonations([CryptoDonationSchema.parse(gift({ isQualifiedOrganization: false }))], 2026);
    expect(disqualified.totalDeduction.toString()).toBe("0");
    const foundation = calculateFederalTax(input(2026, [gift({ recipientCategory: "other-qualified", costBasis: "25000" })]));
    expect(foundation.scheduleA?.nonCashCharitable.toString()).toBe("19500"); // Basis-reduced capital property keeps the20% category, then500floor.
    expect(foundation.carryforwards.charitableContributionsByYear).toEqual([{ taxYear: 2026, category: "capital_gain_20", amount: d("5500") }]);
  });
  it("preserves unknown qualification and rejects incomplete current sources", () => {
    expect(CryptoDonationSchema.parse(gift({ isQualifiedOrganization: undefined })).isQualifiedOrganization).toBeUndefined();
    for (const field of ["isQualifiedOrganization", "recipientCategory", "capitalAsset", "sourceFactsConfirmed", "fullOwnershipInterestDonated", "noGoodsOrServicesReceived", "substantiationRequirementsMet", "appraisalRequired", "qualifiedAppraisalObtained"]) {
      expect(() => calculateFederalTax(input(2026, [gift({ [field]: undefined })]))).toThrow(/crypto.*source|crypto.*qualified|crypto.*appraisal|crypto.*qualification/i);
    }
    expect(() => calculateFederalTax(input(2026, [gift({ dateDonated: "2025-06-01" })]))).toThrow(/year/i);
    expect(() => calculateFederalTax(input(2026, [gift({ costBasis: "-1" })]))).toThrow(/nonnegative/i);
  });
  it("applies shared percentage limits and the 2026 floor once", () => {
    const result = calculateFederalTax(input(2026, [gift()]));
    expect(result.cryptoDonations?.totalDeduction.toString()).toBe("40000"); // Tentative source value only.
    expect(result.scheduleA?.nonCashCharitable.toString()).toBe("29500");
    expect(result.itemizedDeductions.toString()).toBe("29500");
    expect(result.carryforwards.charitableContributions.toString()).toBe("10500");
    expect(result.allLines.filter(line => line.form === "Sched A" && line.line === "12-crypto")).toHaveLength(0);
    const combined = calculateFederalTax(input(2026, [gift({ fairMarketValueAtDonation: "20000" })], {
      donations: [{ organization: "Actual public charity", qualifiedOrganization: true, isPrivateFoundation: false, type: "property", amount: "20000", costBasis: "10000", dateOfDonation: "2026-05-01", isLongTermCapitalGain: true }],
    }));
    expect(combined.scheduleA?.nonCashCharitable.toString()).toBe("29500");
    expect(combined.carryforwards.charitableContributions.toString()).toBe("10500");
    const standard = calculateFederalTax(input(2026, [gift({ fairMarketValueAtDonation: "1000", appraisalRequired: false })], { deductionMethod: "standard" }));
    expect(standard.scheduleA?.nonitemizerCharitableDeduction.toString()).toBe("0");
  });
  it("uses the final 2025 category ordering without a 2026 floor", () => {
    // Official Pub526 example:2000publiccash,28000publiccapitalproperty,5000privatecash,50000AGI.
    const published = calculateCharitableContributionWorksheet({ taxYear: 2025, contributionBase: d("50000"), amounts: {
      cashPublic: d("2000"), noncashPublic: d("0"), capitalGainPublic: d("28000"), cashPrivate: d("5000"), noncashPrivate: d("0"), capitalGainPrivate: d("0"),
    } });
    expect(published.cashDeduction.toString()).toBe("2000");
    expect(published.nonCashDeduction.toString()).toBe("15000");
    expect(published.carryforwards).toEqual([{ taxYear: 2025, category: "capital_gain_30", amount: d("13000") }, { taxYear: 2025, category: "other_30", medium: "cash", amount: d("5000") }]);
    const result = calculateFederalTax(input(2025, [gift({ dateDonated: "2025-06-01" })], {
      donations: [{ organization: "Actual public charity", qualifiedOrganization: true, isPrivateFoundation: false, type: "cash", amount: "30000", dateOfDonation: "2025-05-01" }],
    }));
    expect(result.scheduleA?.cashCharitable.toString()).toBe("30000");
    expect(result.scheduleA?.nonCashCharitable.toString()).toBe("20000");
    expect(result.itemizedDeductions.toString()).toBe("50000");
    expect(result.carryforwards.charitableContributions.toString()).toBe("20000");
  });
});
