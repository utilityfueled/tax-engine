import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { parseInput } from "@/ingest/loader.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const singleW2 = {
  ...simpleW2Fixture.w2s[0],
  wages: "20000",
  federalWithheld: "1500",
  socialSecurityWages: "20000",
  socialSecurityWithheld: "1240",
  medicareWages: "20000",
  medicareWithheld: "290",
};

const jointReturn = {
  ...simpleW2Fixture,
  taxpayer: {
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: { firstName: "Alex", lastName: "Doe", ssn: "444-55-6666", dateOfBirth: "1990-03-03" },
  },
  w2s: [
    {
      ...simpleW2Fixture.w2s[0],
      accountHolder: "primary",
      wages: "32000",
      federalWithheld: "2600",
      socialSecurityWages: "32000",
      socialSecurityWithheld: "1984",
      medicareWages: "32000",
      medicareWithheld: "464",
      box12CodeD: "600",
      box12CodeAA: "900",
    },
    {
      ...simpleW2Fixture.w2s[0],
      employer: { name: "Spouse Co", ein: "98-7654321" },
      accountHolder: "spouse",
      wages: "28000",
      federalWithheld: "2200",
      socialSecurityWages: "28000",
      socialSecurityWithheld: "1736",
      medicareWages: "28000",
      medicareWithheld: "406",
      box12CodeE: "900",
      box12CodeBB: "600",
    },
  ],
};

const earlyEmployerPlanReceipt = {
  taxYear: 2025,
  accountHolder: "primary",
  payer: "Former Employer 401(k)",
  grossDistribution: "1000",
  taxableAmount: "1000",
  federalWithheld: "0",
  distributionCode: "1",
  iraSepSimple: false,
};

describe("Form 8880 sources on parsed 2025 returns", () => {
  // spec/federal/form-8880.yaml, 6-age-cutoff-2025
  it.each([
    ["2007-12-31", "2000", "428"],
    ["2008-01-01", "2000", "428"],
    ["2008-01-02", "0", "0"],
  ])("applies the January 1, 2008 birth cutoff on a parsed 2025 return for %s", (dateOfBirth, expectedLine6a, expectedCredit) => {
    const input = parseInput({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth },
      },
      w2s: [singleW2],
      form8880: { primaryElectiveDeferrals: "2000" },
    });
    const { form8880 } = calculateFederalTax(input);

    expect(form8880?.line6a.toFixed()).toBe(expectedLine6a);
    expect(form8880?.line12.toFixed()).toBe(expectedCredit);
  });

  // spec/federal/form-8880.yaml, 2-parsed-w2-fallback
  it.each([
    { label: "omitted", contributions: {}, expectedLine2a: "3000", expectedCredit: "428" },
    { label: "explicit zero", contributions: { primaryElectiveDeferrals: "0" }, expectedLine2a: "0", expectedCredit: "0" },
  ])("selects the single taxpayer's Line 2 amount when the input is $label", ({ contributions, expectedLine2a, expectedCredit }) => {
    const input = parseInput({
      ...simpleW2Fixture,
      w2s: [{ ...singleW2, box12CodeD: "1200", box12CodeAA: "1800" }],
      form8880: contributions,
    });
    const { form8880 } = calculateFederalTax(input);

    expect(form8880?.line2a.toFixed()).toBe(expectedLine2a);
    expect(form8880?.line12.toFixed()).toBe(expectedCredit);
  });

  it.each([
    {
      label: "both omitted",
      contributions: {},
      expected: ["1500", "1500", "300"],
    },
    {
      label: "primary explicitly zero",
      contributions: { primaryElectiveDeferrals: "0" },
      expected: ["0", "1500", "150"],
    },
    {
      label: "spouse explicitly zero",
      contributions: { spouseElectiveDeferrals: "0" },
      expected: ["1500", "0", "150"],
    },
    {
      label: "both explicitly zero",
      contributions: { primaryElectiveDeferrals: "0", spouseElectiveDeferrals: "0" },
      expected: ["0", "0", "0"],
    },
  ])("applies the parsed Form 8880 Line 2 Box 12 fallback independently for each column when $label", ({ contributions, expected }) => {
    const input = parseInput({ ...jointReturn, form8880: contributions });
    const { form8880 } = calculateFederalTax(input);

    expect([form8880?.line2a.toFixed(), form8880?.line2b.toFixed(), form8880?.line12.toFixed()]).toEqual(expected);
  });

  // spec/federal/form-8880.yaml, 2-code-g-source
  it.each(["1800", "-1800"])("requires the confirmed Line 2 total for a 2025 W-2 with Code G amount %s", (box12CodeG) => {
    const input = parseInput({ ...simpleW2Fixture, w2s: [{ ...singleW2, box12CodeG }], form8880: {} });

    expect(() => calculateFederalTax(input)).toThrow(/confirmed eligible contribution total.*Code G/);
  });

  it.each([["700", "350"], ["0", "0"]])("uses confirmed Line 2 amount %s when a 2025 W-2 has Code G", (amount, credit) => {
    const input = parseInput({
      ...simpleW2Fixture,
      w2s: [{ ...singleW2, box12CodeG: "1800" }],
      form8880: { primaryElectiveDeferrals: amount },
    });
    const { form8880 } = calculateFederalTax(input);

    expect(form8880?.line2a.toFixed()).toBe(amount);
    expect(form8880?.line12.toFixed()).toBe(credit);
  });

  it("requires a confirmed total in the affected spouse column", () => {
    const raw = {
      ...jointReturn,
      w2s: jointReturn.w2s.map(w2 => w2.accountHolder === "spouse" ? { ...w2, box12CodeG: "2000" } : w2),
    };
    const unresolved = parseInput({ ...raw, form8880: { primaryElectiveDeferrals: "1500" } });
    const resolved = parseInput({ ...raw, form8880: { spouseElectiveDeferrals: "1800" } });

    expect(() => calculateFederalTax(unresolved)).toThrow(/confirmed eligible contribution total.*Code G/);
    const { form8880 } = calculateFederalTax(resolved);
    expect([form8880?.line2a.toFixed(), form8880?.line2b.toFixed(), form8880?.line12.toFixed()]).toEqual(["1500", "1800", "330"]);
  });

  // spec/federal/form-8880.yaml, 2-w2-source-year
  it("holds the omitted Line 2 fallback for an explicitly different W-2 year", () => {
    const input = parseInput({
      ...simpleW2Fixture,
      w2s: [{ ...singleW2, taxYear: 2024, box12CodeD: "1800" }],
      form8880: {},
    });

    expect(() => calculateFederalTax(input)).toThrow(/fallback requires a 2025 W-2/);
  });

  it("uses an explicit eligible total without a 2025 W-2 fallback", () => {
    const input = parseInput({
      ...simpleW2Fixture,
      w2s: [{ ...singleW2, taxYear: 2024, box12CodeD: "1800" }],
      form8880: { primaryElectiveDeferrals: "700" },
    });

    expect(calculateFederalTax(input).form8880?.line2a.toFixed()).toBe("700");
  });

  // spec/federal/form-8880.yaml, 4-confirmed-current-receipt-2025
  it.each([
    { label: "both omitted", reductions: {} },
    { label: "both omitted and Box 2a zero", reductions: {}, taxableAmount: "0" },
    { label: "primary only", reductions: { primaryRecentDistributions: "1000" } },
    { label: "spouse only", reductions: { spouseRecentDistributions: "1000" } },
    {
      label: "negative amount",
      reductions: { primaryRecentDistributions: "1000", spouseRecentDistributions: "-0.01" },
    },
  ])("requires complete confirmed reductions for an original 2025 early employer-plan receipt with $label", ({ reductions, taxableAmount = "1000" }) => {
    const input = parseInput({ ...jointReturn, form1099R: [{ ...earlyEmployerPlanReceipt, taxableAmount }], form8880: reductions });

    expect(() => calculateFederalTax(input)).toThrow(/confirmed nonnegative.*Line 4 totals/);
  });

  it("uses the confirmed joint Line 4 totals for a covered 2025 receipt", () => {
    const input = parseInput({
      ...jointReturn,
      form1099R: [earlyEmployerPlanReceipt],
      form8880: { primaryRecentDistributions: "1000", spouseRecentDistributions: "1000" },
    });
    const { agi, form8880 } = calculateFederalTax(input);

    expect(agi.toFixed()).toBe("61000");
    expect([form8880?.line4a.toFixed(), form8880?.line4b.toFixed(), form8880?.line12.toFixed()]).toEqual(["1000", "1000", "100"]);
  });

  it("uses only the primary Line 4 total on a non-joint 2025 return", () => {
    const input = parseInput({
      ...simpleW2Fixture,
      w2s: [singleW2],
      form1099R: [earlyEmployerPlanReceipt],
      form8880: { primaryElectiveDeferrals: "2000", primaryRecentDistributions: "1000" },
    });
    const { form8880 } = calculateFederalTax(input);

    expect([form8880?.line4a.toFixed(), form8880?.line4b.toFixed(), form8880?.line12.toFixed()]).toEqual(["1000", "0", "500"]);
  });

  it("accepts confirmed zeros after exclusions even when a 2025 employer-plan statement reports a gross receipt", () => {
    const input = parseInput({
      ...jointReturn,
      form1099R: [{ ...earlyEmployerPlanReceipt, taxableAmount: "0" }],
      form8880: { primaryRecentDistributions: "0", spouseRecentDistributions: "0" },
    });
    const { form8880 } = calculateFederalTax(input);

    expect([form8880?.line4a.toFixed(), form8880?.line4b.toFixed(), form8880?.line12.toFixed()]).toEqual(["0", "0", "300"]);
  });

  it("keeps the Line 4 intake for a separately coded nontaxable direct rollover", () => {
    const input = parseInput({
      ...jointReturn,
      form1099R: [{ ...earlyEmployerPlanReceipt, taxableAmount: "0", distributionCode: "G" }],
      form8880: {},
    });

    expect(calculateFederalTax(input).form8880?.line12.toFixed()).toBe("300");
  });

  it("keeps the prior omitted-input defaults when parsing an older year", () => {
    const input = parseInput({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2024 },
      form8880: {},
    });

    expect(input.form8880?.primaryElectiveDeferrals).toBe("0");
    expect(input.form8880?.spouseElectiveDeferrals).toBe("0");
    expect(input.form8880 && "primaryRecentDistributions" in input.form8880 && input.form8880.primaryRecentDistributions).toBe("0");
    expect(input.form8880 && "spouseRecentDistributions" in input.form8880 && input.form8880.spouseRecentDistributions).toBe("0");
  });
});
