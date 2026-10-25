/** Specs: oh-it-1040.yaml and oh-schedule-credits.yaml. Official2024/2025 Ohio booklets. */
import { describe, expect, it } from "vitest";
import { calculateOhioIT1040 } from "@/engine/state/oh-it-1040.js";
import { calculateOhioScheduleOfCredits } from "@/engine/state/oh-schedule-credits.js";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return.js";

describe("Ohio actual-year exemption and joint-credit limits", () => {
  it.each([
    ["2024 at later ceiling", 2024, "750000", "1900"],
    ["2024 above later ceiling", 2024, "1000000", "1900"],
    ["2025 first cents above old tier", 2025, "749999.01", "1900"],
    ["2025 last cent below ceiling", 2025, "749999.99", "1900"],
    ["2025 at ceiling", 2025, "750000", "0"],
    ["2025 above ceiling", 2025, "750000.01", "0"],
  ] as const)("uses the actual year and exact exemption ceiling: %s", (_label, taxYear, federalAgi, expected) => {
    const result = calculateOhioIT1040({ taxYear, filingStatus: "single", federalAgi, exemptions: 1 });
    expect(result.exemptionAmountPerPerson.toString()).toBe(expected);
    expect(result.line4_exemptions.toString()).toBe(expected);
    expect(result.magi.toString()).toBe(federalAgi);
  });

  it.each([
    ["2024 at later ceiling", 2024, "750000", "746200", "500"],
    ["2024 above later ceiling", 2024, "1000000", "996200", "500"],
    ["2025 below ceiling", 2025, "749999.99", "746199.99", "500"],
    ["2025 at ceiling before exemptions", 2025, "750000", "746200", "0"],
    ["2025 above ceiling before exemptions", 2025, "750000.01", "746200.01", "0"],
  ] as const)("separates the joint-credit eligibility ceiling from its rate base: %s", (_label, taxYear, magi, magiLessExemptions, expected) => {
    const result = calculateOhioScheduleOfCredits({ taxYear, filingStatus: "married_filing_jointly", federalAgi: magi, magi, magiLessExemptions, exemptions: 2, taxBeforeCredits: "10000", primaryQualifyingIncome: "500", spouseQualifyingIncome: "500" });
    // Statutory high-income rate5% of10,000 =500, below the650credit cap.
    expect(result.line12_jointFilingCredit.toString()).toBe(expected);
  });

  it("keeps historical exemptions and joint credit in the complete resident calculation", () => {
    const input = { filingStatus: "married_filing_jointly" as const, federalAgi: "1000000", exemptions: 2, primaryQualifyingIncome: "500000", spouseQualifyingIncome: "500000" };
    const historical = calculateOhioResidentReturn({ ...input, taxYear: 2024 });
    expect(historical.it1040.line4_exemptions.toString()).toBe("3800");
    // 2,394.32 +(1,000,000-3,800-100,000)*.035 =33,761.32; round then650credit.
    expect(historical.it1040.line8c_totalTax.toString()).toBe("33761");
    expect(historical.scheduleOfCredits.line12_jointFilingCredit.toString()).toBe("650");
    expect(historical.it1040.line10_taxAfterCredits.toString()).toBe("33111");
    const current = calculateOhioResidentReturn({ ...input, taxYear: 2025 });
    expect(current.it1040.line4_exemptions.toString()).toBe("0");
    expect(current.scheduleOfCredits.line12_jointFilingCredit.toString()).toBe("0");
    expect(current.it1040.line10_taxAfterCredits.toString()).toBe("30519");
  });
});
