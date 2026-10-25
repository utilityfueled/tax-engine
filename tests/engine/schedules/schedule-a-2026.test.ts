// Spec: spec/federal/schedule-a-2026.yaml
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
const d = (v: string) => new Decimal(v);
const person = { taxYear: 2026, filingStatus: "single", primary: { firstName: "Test", lastName: "Taxpayer", ssn: "900-00-0001", dateOfBirth: "1980-01-01" }, address: { street: "1 Test", city: "Test", state: "TX", zip: "00000" } };
const donation = { organization: "Synthetic qualified public charity", type: "cash", amount: "1500", dateOfDonation: "2026-04-01", qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, isPrivateFoundation: false };
function calc(donations: Record<string, unknown>[] = [], agi = "100000", filingStatus: FilingStatus = "single", taxYear = 2026) {
  const input = TaxYearInputSchema.parse({ taxpayer: { ...person, filingStatus, taxYear }, donations });
  return calculateScheduleA(input, d(agi), filingStatus, taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025));
}
describe("2026 wagering deduction", () => {
  it.each([["1000", "1000", "0", "900"], ["1000", "2000", "0", "1000"], ["1000", "900", "100", "900"], ["1000", "0", "100", "90"], ["0", "1000", "0", "0"]])("applies the loss fraction before the winnings cap", (winnings, losses, expenses, expected) => {
    const input = TaxYearInputSchema.parse({ taxpayer: person });
    expect(calculateScheduleA(input, d("100000"), "single", FEDERAL_2026_CONSTANTS, { gamblingWinnings: d(winnings), gamblingLosses: d(losses), gamblingExpenses: d(expenses) }).gamblingLossDeduction.toString()).toBe(expected);
  });
  it("preserves 2025 deduction and refuses negative facts", () => {
    const input = TaxYearInputSchema.parse({ taxpayer: { ...person, taxYear: 2025 } });
    expect(calculateScheduleA(input, d("100000"), "single", getConstants(2025), { gamblingWinnings: d("1000"), gamblingLosses: d("1000") }).gamblingLossDeduction.toString()).toBe("1000");
    expect(() => calculateScheduleA(input, d("100000"), "single", getConstants(2025), { gamblingWinnings: d("1000"), gamblingLosses: d("-1") })).toThrow(/negative|nonnegative/i);
  });
});
describe("2026 nonitemizer charitable deduction", () => {
  it.each([["single", "1000"], ["married_filing_jointly", "1500"], ["married_filing_separately", "1000"], ["head_of_household", "1000"], ["qualifying_surviving_spouse", "1000"]] as const)("caps current eligible cash for %s", (status, expected) => {
    expect(calc([donation], "100000", status).nonitemizerCharitableDeduction.toString()).toBe(expected);
  });
  it.each([{ qualifiedOrganization: false }, { supportingOrganization: true }, { donorAdvisedFund: true }, { isPrivateFoundation: true }, { type: "property" }])("excludes %j", change => {
    expect(calc([{ ...donation, ...change }]).nonitemizerCharitableDeduction.toString()).toBe("0");
  });
  it("applies the cash AGI cap without the itemized floor", () => {
    expect(calc([donation], "100").nonitemizerCharitableDeduction.toString()).toBe("60");
    expect(calc([{ ...donation, amount: "200" }]).nonitemizerCharitableDeduction.toString()).toBe("200");
  });
  it("preserves 2025, and zero or negative AGI gives zero", () => {
    expect(calc([{ ...donation, dateOfDonation: "2025-04-01" }], "100000", "single", 2025).nonitemizerCharitableDeduction.toString()).toBe("0");
    expect(calc([donation], "0").nonitemizerCharitableDeduction.toString()).toBe("0");
    expect(calc([donation], "-100").nonitemizerCharitableDeduction.toString()).toBe("0");
  });
  it.each(["qualifiedOrganization", "supportingOrganization", "donorAdvisedFund"])("rejects unknown %s", key => {
    expect(() => calc([{ ...donation, [key]: undefined }])).toThrow(/qualification|eligib|unknown/i);
  });
  it("rejects negative gifts and invalid or other-year dates", () => {
    expect(() => calc([{ ...donation, amount: "-10" }])).toThrow();
    expect(() => calc([{ ...donation, dateOfDonation: "2025-01-01" }])).toThrow(/year/i);
    expect(() => calc([{ ...donation, dateOfDonation: "2026-02-30" }])).toThrow(/date/i);
  });
});
