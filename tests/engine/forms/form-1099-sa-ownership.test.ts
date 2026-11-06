// Spec: spec/federal/form-1099-sa.yaml, lines 1/2/4
import { expect, it } from "vitest";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa";
import { calculateFederalTax } from "@/engine/federal";
import { Form1099SASchema, type Form1099SA } from "@/models/inputs";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

const inherited = { payer: "Actual inherited HSA", grossDistribution: "2400", earningsOnExcessContributions: "0", distributionCode: "1", accountType: "hsa", beneficiaryRole: "surviving_spouse" } as const;
const jointTaxpayer = { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly" as const, spouse: { firstName: "Pat", lastName: "Example", ssn: "987-65-4321", dateOfBirth: "1959-01-01" } };

it("uses actual primary ownership for a surviving spouse and applies that person age", () => {
  const source = Form1099SASchema.parse({ ...inherited, accountHolder: "primary" });
  const result = calculateFederalTax({ ...simpleW2Fixture, taxpayer: jointTaxpayer, form1099SA: [source] });
  expect(result.form1099SA?.defaultAccountOwner).toBe("primary");
  expect(result.form8889?.line14a.toFixed()).toBe("2400");
  // The primary survivor is under 65; the current spouse's age cannot exempt their distribution.
  expect(result.form8889?.line17b.toFixed()).toBe("480");
  expect(result.form8889ByOwner?.spouse).toBeUndefined();
});

it("keeps missing HSA owner unknown for every surviving spouse distribution code", () => {
  for (const code of ["1", "2", "3", "4", "5"] as const) {
    const source = Form1099SASchema.parse({ ...inherited, distributionCode: code, ...(code === "4" ? { fmvOnDateOfDeath: "2000" } : {}) });
    const result = calculateForm1099SA([source]);
    expect(result.defaultAccountOwner, code).toBeUndefined();
    expect(result.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe("0");
    expect(result.unattributedSupport.hsaGrossDistributions.toFixed()).toBe("2400");
  }
});

it("retains actual owner attribution for returned excess and disability distributions", () => {
  for (const owner of ["primary", "spouse"] as const) {
    const result = calculateForm1099SA([
      Form1099SASchema.parse({ ...inherited, distributionCode: "2", accountHolder: owner, grossDistribution: "400.10", earningsOnExcessContributions: "25.20" }),
      Form1099SASchema.parse({ ...inherited, distributionCode: "3", accountHolder: owner, grossDistribution: "900.30" }),
    ]);
    expect(result.defaultAccountOwner).toBe(owner);
    expect(result.accountOwnerSupport[owner].hsaReturnedExcessContributionEarnings.toFixed()).toBe("25.2");
    const merged = mergeForm1099SAIntoForm8889Input(undefined, result, jointTaxpayer);
    expect(merged).toMatchObject({ accountOwner: owner, distributionsReceived: "1300.4", supported1099SAReturnedExcessContributions: "400.1", supported1099SADisabilityExceptionDistributions: "900.3" });
  }
});

it("rejects stale explicit spouse ownership instead of relabeling the source as primary", () => {
  const result = calculateForm1099SA([{ ...inherited, accountHolder: "spouse" }]);
  for (const draft of [undefined, { accountOwner: "primary" as const }, { accountOwner: "spouse" as const }]) {
    expect(() => mergeForm1099SAIntoForm8889Input(draft, result, simpleW2Fixture.taxpayer)).toThrow(/actual spouse|spouse.*context/i);
  }
  expect(result.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe("2400");
});

it("requires actual owners before a 2026 return consumes even zero HSA source records", () => {
  for (const grossDistribution of ["0", "2400"]) {
    const result = calculateForm1099SA([{ ...inherited, grossDistribution } as Form1099SA]);
    expect(() => mergeForm1099SAIntoForm8889Input(undefined, result, { ...simpleW2Fixture.taxpayer, taxYear: 2026 })).toThrow(/actual.*owner|owner.*required/i);
  }
});
