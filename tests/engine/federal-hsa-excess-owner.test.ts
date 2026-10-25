// Spec: spec/federal/form-5329-hsa-owner.yaml
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { hsaExcessSource, hsaOwnerInput } from "../fixtures/hsa-excess-owner.js";

describe("Actual separate-owner HSA5329", () => {
  it("keeps spouse room and account values separate", () => {
    const result = calculateFederalTax(hsaOwnerInput());
    expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("700");
    expect(result.form5329HsaByOwner?.spouse?.line47.toString()).toBe("700");
    expect(result.form5329HsaByOwner?.primary?.line49.toString()).toBe("6");
    expect(result.form5329HsaByOwner?.spouse?.line49.toString()).toBe("42");
    expect(result.allLines.find(l => l.form === "Sched 2" && l.line === "8")?.value.toString()).toBe("48");
    expect(result.carryforwards.hsaExcessByOwner?.primary?.toString()).toBe("700");
    expect(result.carryforwards.hsaExcessByOwner?.spouse?.toString()).toBe("700");
    const facts = hsaOwnerInput();
    const reduced = calculateFederalTax(TaxYearInputSchema.parse({ ...facts,
      form8889ByOwner: { ...facts.form8889ByOwner, spouse: { ...facts.form8889ByOwner?.spouse, contributionsMade: "1000" } },
      form5329HsaByOwner: { primary: hsaExcessSource({ priorYearExcessContributions: "1000", priorYearAdditionalTax: "60" }), spouse: hsaExcessSource() } }));
    expect(reduced.form5329HsaByOwner?.primary?.line46.toString()).toBe("1000");
    expect(reduced.form5329HsaByOwner?.spouse?.line43.toString()).toBe("3300");
    expect(reduced.form5329HsaByOwner?.primary?.line49.toString()).toBe("102");
  });
  it("deducts absorbed prior excess before adjusted gross income", () => {
    const facts = hsaOwnerInput();
    const input = TaxYearInputSchema.parse({ ...facts,
      form8889ByOwner: { primary: { ...facts.form8889ByOwner?.primary, contributionsMade: "2000" } },
      form5329HsaByOwner: { primary: hsaExcessSource({ priorYearExcessContributions: "3000", priorYearAdditionalTax: "180" }) } });
    const result = calculateFederalTax(input);
    expect(result.form5329HsaByOwner?.primary?.line43.toString()).toBe("2300");
    expect(result.form5329HsaByOwner?.primary?.line46.toString()).toBe("700");
    expect(result.form8889ByOwner?.primary?.line13.toString()).toBe("4300");
    expect(result.schedule1?.hsaDeduction.toString()).toBe("4300");
    expect(result.agi.toString()).toBe("80700");
    const complete = calculateFederalTax(TaxYearInputSchema.parse({ ...input,
      form5329HsaByOwner: { primary: hsaExcessSource({ priorYearExcessContributions: "2000", priorYearAdditionalTax: "120" }) } }));
    expect(complete.form5329HsaByOwner?.primary?.line49.toString()).toBe("0");
    expect(complete.form5329HsaByOwner?.primary?.requiresForm5329).toBe(true);
    expect(complete.form8889ByOwner?.primary?.line13.toString()).toBe("4000");
    const ordinary = calculateFederalTax(TaxYearInputSchema.parse({ ...input,
      form8889ByOwner: { primary: { ...input.form8889ByOwner?.primary, contributionsMade: "3600.10" } },
      form5329HsaByOwner: { primary: hsaExcessSource() } }));
    expect(ordinary.form8889ByOwner?.primary?.line13.toString()).toBe("3600.1");
    expect(ordinary.form5329HsaByOwner?.primary?.line43.toString()).toBe("699.9");
  });
  it("keeps actual prior tax and missing source facts distinct", () => {
    const input = hsaOwnerInput({ form5329HsaByOwner: { primary: hsaExcessSource({ priorYearExcessContributions: "1000", priorYearAdditionalTax: "0" }), spouse: hsaExcessSource() } });
    expect(calculateFederalTax(input).form5329HsaByOwner?.primary?.line42.toString()).toBe("0");
    for (const missing of ["valueDec31", "priorYearAdditionalTax", "priorYearExcessContributions", "returnedExcessContributionsUnder9100Relief", "returnedExcessContributionEarningsUnder9100Relief"]) {
      const incomplete = hsaExcessSource({ [missing]: undefined });
      expect(() => calculateFederalTax(hsaOwnerInput({ form5329HsaByOwner: { primary: incomplete, spouse: hsaExcessSource() } }))).toThrow(/HSA.*source|5329.*actual/i);
    }
  });
  it("applies only the same owner's actual correction and reports its earnings", () => {
    const result = calculateFederalTax(hsaOwnerInput({ form5329HsaByOwner: {
      primary: hsaExcessSource({ returnedExcessContributionsUnder9100Relief: "700", returnedExcessContributionEarningsUnder9100Relief: "25", reliefRequirementsConfirmed: true }),
      spouse: hsaExcessSource(),
    } }));
    expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
    expect(result.form5329HsaByOwner?.spouse?.line47.toString()).toBe("700");
    expect(result.form5329HsaByOwner?.spouse?.line49.toString()).toBe("42");
    expect(result.schedule1?.totalOtherIncome.toString()).toBe("25");
    expect(result.totalIncome.toString()).toBe("85025");
    const timely = calculateFederalTax(hsaOwnerInput({ form1099SA: [{ payer: "Actual HSA trustee", grossDistribution: "725", earningsOnExcessContributions: "25",
      distributionCode: "2", accountHolder: "primary", accountType: "hsa" }] }));
    expect(timely.form8889ByOwner?.primary?.line14a.toString()).toBe("725");
    expect(timely.form8889ByOwner?.primary?.line14b.toString()).toBe("725");
    expect(timely.form8889ByOwner?.primary?.supportedReturnedExcessContributionPrincipal.toString()).toBe("700");
    expect(timely.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
    expect(timely.form5329HsaByOwner?.spouse?.line47.toString()).toBe("700");
    expect(timely.totalIncome.toString()).toBe("85025");
    expect(() => calculateFederalTax(hsaOwnerInput({ form1099SA: [{ payer: "Actual HSA trustee", grossDistribution: "725",
      distributionCode: "2", accountHolder: "primary", accountType: "hsa" }] }))).toThrow(/Box.?2.*actual|actual.*Box.?2/i);
    const noEarnings = calculateFederalTax(hsaOwnerInput({ form1099SA: [{ payer: "Actual HSA trustee", grossDistribution: "700", earningsOnExcessContributions: "0",
      distributionCode: "2", accountHolder: "primary", accountType: "hsa" }] }));
    expect(noEarnings.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
    expect(noEarnings.totalIncome.toString()).toBe("85000");
  });
  it("rejects ambiguous aggregate or incomplete owner sources", () => {
    expect(() => calculateFederalTax(hsaOwnerInput({ form1099SA: [{ payer: "Actual HSA trustee", grossDistribution: "700", earningsOnExcessContributions: "0",
      distributionCode: "2", accountType: "hsa" }] }))).toThrow(/actual.*owner|owner.*actual/i);
    const correctionInput = hsaOwnerInput({ form1099SA: [{ payer: "Actual HSA trustee", grossDistribution: "725", earningsOnExcessContributions: "25",
      distributionCode: "2", accountHolder: "primary", accountType: "hsa" }] });
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...correctionInput,
      form8889ByOwner: { ...correctionInput.form8889ByOwner, primary: { ...correctionInput.form8889ByOwner?.primary, excludedDistributions: "0" } } }))).toThrow(/gross.*distribution|distribution.*gross/i);
    expect(() => calculateFederalTax(hsaOwnerInput({ form5329: { hsaCurrentYearExcessContributions: "1", hsaValueDec31: "10000" } }))).toThrow(/aggregate.*HSA|HSA.*aggregate/i);
    expect(() => calculateFederalTax(hsaOwnerInput({ form5329HsaByOwner: { primary: hsaExcessSource() } }))).toThrow(/spouse.*source|source.*spouse/i);
    expect(() => calculateFederalTax(hsaOwnerInput({ form5329HsaByOwner: { primary: hsaExcessSource({ sourceTaxYear: 2024 }), spouse: hsaExcessSource() } }))).toThrow(/year/i);
    expect(() => calculateFederalTax(hsaOwnerInput({ form5329HsaByOwner: { primary: hsaExcessSource({ returnedExcessContributionsUnder9100Relief: "100" }), spouse: hsaExcessSource() } }))).toThrow(/relief/i);
    expect(() => calculateFederalTax(hsaOwnerInput({ form5329: { earlyDistributionsIncludedInIncome: "1000" } }))).toThrow(/owner allocation/i);
    const input = hsaOwnerInput();
    const year2026 = { ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 },
      form5329HsaByOwner: { primary: hsaExcessSource({ sourceTaxYear: 2026, priorYearSourceTaxYear: 2025 }),
        spouse: hsaExcessSource({ sourceTaxYear: 2026, priorYearSourceTaxYear: 2025 }) } };
    const result2026 = calculateFederalTax(TaxYearInputSchema.parse(year2026));
    expect(result2026.form5329HsaByOwner?.primary?.line47.toString()).toBe("600");
    expect(result2026.form5329HsaByOwner?.spouse?.line49.toString()).toBe("36");
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...year2026, form5329HsaByOwner: undefined }))).toThrow(/actual separate owner sources/i);
  });
  it("reconciles excess employer contributions with actual W2 income", () => {
    const input = hsaOwnerInput();
    const source = { ...input,
      form8889ByOwner: { ...input.form8889ByOwner, primary: { ...input.form8889ByOwner?.primary, contributionsMade: "0", employerContributions: "5000" } } };
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(source))).toThrow(/employer.*wages|wages.*employer/i);
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...source,
      form5329HsaByOwner: { ...input.form5329HsaByOwner, primary: hsaExcessSource({ excessEmployerContributionsAlreadyInWages: "200" }) } }));
    expect(result.form5329HsaByOwner?.primary?.taxableExcessEmployerContributions.toString()).toBe("500");
    expect(result.totalIncome.toString()).toBe("85500");
    expect(result.schedule1?.totalOtherIncome.toString()).toBe("500");
  });
});
