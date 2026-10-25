// Spec: spec/federal/schedule-1-a-return.yaml.
import { expect, it, vi } from "vitest";
// Draft constants are injected only for current-law integration tests. The
// production2026 rule pack remains incomplete and unavailable.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

it("deducts actual business tips once from taxable income and QBI without changing AGI or SE tax", () => {
  for (const year of [2025, 2026]) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0" }],
    form1099Nec: [{ taxYear: year, accountHolder: "primary", payer: "Actual service platform", nonemployeeCompensation: "10000", cashTips: "1000", treasuryTippedOccupationCodes: ["102"] }],
    scheduleC: { accountHolder: "primary", businessName: "Actual service", grossReceipts: "10000", qbiMateriallyParticipated: true },
  });
  const baseline = calculateFederalTax(input);
  const actual = TaxYearInputSchema.parse({ ...input, schedule1A: {
    sourceTaxYear: year, sourceReference: "Actual platform tip ledger", sourceFactsConfirmed: true, allSourcesIncluded: true,
    primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", seniorOwners: [], employeeTips: [], overtime: [], vehicleLoans: [],
    businessTips: [{ owner: "primary", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true,
      businessName: "Actual service", businessSourceId: "scheduleC", qualifiedReportedTips: "1000", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "1000" }] }],
  } });
  const result = calculateFederalTax(actual);
  // SE: round(10,000*.9235)=9,235; round(*.124)=1,145, round(*.029)=268;
  // half of1,413 rounds707. NetQBI9,293 minus allowabletips1,000 =8,293.
  expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(result.allLines.find(line => line.form === "Sched SE" && line.line === "12")?.value.toFixed()).toBe("1413");
  expect(result.totalWithholding.eq(baseline.totalWithholding)).toBe(true);
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("1000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("1659");
  expect(baseline.form8995?.qbiDeduction.toFixed()).toBe("1859");
  expect(baseline.taxableIncome.minus(result.taxableIncome).toFixed()).toBe("800");
  }
});
