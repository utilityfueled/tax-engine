// Spec: spec/federal/form-1099-r-disability-source.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { parseInput } from "@/ingest/loader.js";
import type { Form1099R } from "@/models/inputs.js";
import { disabilityPensionSource } from "../fixtures/form1099r-disability-source.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const owner = { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1969-01-15" };
const statement = {
  taxYear: 2025,
  accountHolder: "primary",
  payer: "Synthetic disability payer",
  payerTin: "11-2345678",
  accountReference: "Synthetic private pension account M-281",
  distributionCode: "3",
  iraSepSimple: false,
  grossDistribution: "6000.10",
  taxableAmount: "4200.05",
  taxableAmountNotDetermined: false,
  federalWithheld: "125.37",
} as const;

function parsed(taxYear: number, ...form1099R: object[]) {
  return parseInput({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear, primary: owner },
    w2s: simpleW2Fixture.w2s.map(w2 => ({ ...w2, taxYear })),
    form1099R,
  });
}

function filedLine(result: ReturnType<typeof calculateFederalTax>, id: string) {
  return result.allLines.find(line => line.form === "1040" && line.line === id)?.value.toFixed();
}

it("holds missing payment timing despite any saved placement flag", () => {
  for (const value of [undefined, false, true]) {
    for (const taxYear of [2025, 2026]) {
      const input = () => parsed(taxYear, {
        ...statement, taxYear, distributionDate: `${taxYear}-07-15`,
        disabilityPensionBeforeMinimumRetirementAge: value,
      });
      expect(() => calculateFederalTax(input())).toThrow(/Code 3.*documented.*payment/i);
    }
  }
  const unknown = parsed(2025, { ...statement, taxableAmount: undefined });
  expect(unknown.form1099R?.[0]?.taxableAmount).toBeUndefined();
  expect(() => calculateFederalTax(unknown)).toThrow(/Code 3.*actual Box 2a/i);
  expect(() => calculateFederalTax(parsed(2025, {
    ...statement, taxableAmount: "0", taxableAmountNotDetermined: true,
  }))).toThrow(/Code 3.*(?:documented.*payment|determined Box 2a)/i);
});

it("reports sourced disability pensions before and beginning the day after minimum retirement", () => {
  for (const taxYear of [2025, 2026]) {
    const original = { ...statement, taxYear };
    const first = disabilityPensionSource(original, owner, `${taxYear}-01-05`, `${taxYear}-07-31`);
    const later = { ...original, accountReference: "Synthetic private pension account N-282" };
    const second = disabilityPensionSource(later, owner, `${taxYear}-08-02`);
    const input = parsed(taxYear,
      { ...original, disabilityPensionBeforeMinimumRetirementAge: false, disabilityPensionSource: first },
      { ...later, disabilityPensionBeforeMinimumRetirementAge: true, disabilityPensionSource: second },
    );
    expect(input.form1099R?.map(form => form.disabilityPensionBeforeMinimumRetirementAge)).toEqual([true, false]);
    const retirement = calculateForm1099R(input.form1099R, { taxYear });
    expect(retirement.disabilityPensionWages.toFixed()).toBe("4200.05");
    expect(retirement.pensionGrossReported.toFixed()).toBe("6000.1");
    expect(retirement.pensionTaxable.toFixed()).toBe("4200.05");
    expect(retirement.federalWithholding.toFixed()).toBe("250.74");
    const audit = JSON.stringify(retirement.lines);
    for (const privateValue of [first.planReference, original.accountReference, first.original.ownerFingerprint,
      owner.ssn, original.payerTin, original.payer]) {
      expect(audit).not.toContain(privateValue);
    }
    if (taxYear === 2026) {
      expect(() => calculateFederalTax(input)).toThrow(/2026.*rule pack.*incomplete/i);
    } else {
      const federal = calculateFederalTax(input);
      expect(filedLine(federal, "1h")).toBe("4200.05");
      expect(filedLine(federal, "5a")).toBe("6000.1");
      expect(filedLine(federal, "5b")).toBe("4200.05");
      expect(filedLine(federal, "25b")).toBe("250.74");
      expect(JSON.stringify(federal.allLines)).not.toContain(first.planReference);
      expect(JSON.stringify(federal.allLines)).not.toContain(original.accountReference);
    }
  }
});

it("holds equality mixed payment periods and stale original evidence", () => {
  const source = disabilityPensionSource(statement, owner, "2025-07-31");
  for (const malformed of [
    { ...source, firstPaymentDate: "2025-08-01", lastPaymentDate: "2025-08-01" },
    { ...source, lastPaymentDate: "2025-08-02" },
    { ...source, firstPaymentDate: "2025-07-32" },
    { ...source, firstPaymentDate: "2024-12-31" },
    { ...source, firstPaymentDate: "2025-08-02" },
    { ...source, allPaymentsCoveredConfirmed: false },
    { ...source, employerDisabilityPensionConfirmed: false },
    { ...source, planReference: " " },
    { ...source, original: { ...source.original, accountReference: "Another account" } },
    { ...source, original: { ...source.original, ownerFingerprint: "a".repeat(64) } },
    { ...source, original: { ...source.original, ownerBirthDate: "1968-01-15" } },
    { ...source, original: { ...source.original, taxableAmount: "4200.04" } },
    { ...source, original: { ...source.original, federalWithheld: "125.36" } },
  ]) {
    expect(() => calculateFederalTax(parsed(2025, { ...statement, disabilityPensionSource: malformed }))).toThrow(/Code 3.*(?:payment|original|owner)|Input: expected true|Too small/i);
  }
  expect(() => calculateFederalTax(parsed(2025, {
    ...statement, disabilityPensionSource: source, distributionDate: "2025-07-30",
  }))).toThrow(/Code 3.*payment/i);
  expect(() => calculateFederalTax(parsed(2025, {
    ...statement, disabilityPensionSource: source, iraSepSimple: undefined,
  }))).toThrow(/Code 3.*supported original/i);
  const imported = parsed(2025, { ...statement, disabilityPensionSource: source });
  const original = imported.form1099R?.[0];
  if (!original) throw new Error("Missing synthetic disability pension original");
  expect(() => calculateForm1099R([{ ...original, taxableAmount: "4200.04" }], { taxYear: 2025 }))
    .toThrow(/Code 3.*original/i);
  expect(() => calculateForm1099R([{ ...original, disabilityPensionBeforeMinimumRetirementAge: false }], { taxYear: 2025 }))
    .toThrow(/Code 3.*placement/i);
});

it("holds a typed return whose owner changed after import", () => {
  const source = disabilityPensionSource(statement, owner, "2025-07-31");
  const input = parsed(2025, { ...statement, disabilityPensionSource: source });
  for (const primary of [{ ...owner, dateOfBirth: "1969-01-16" }, { ...owner, ssn: "100-20-3456" }]) {
    expect(() => calculateFederalTax({ ...input, taxpayer: { ...input.taxpayer, primary } }))
      .toThrow(/Code 3.*owner/i);
  }
});

it("carries only the sourced wage payment into earned income", () => {
  const run = (date: string) => calculateFederalTax({
    ...parsed(2025, { ...statement, disabilityPensionSource: disabilityPensionSource(statement, owner, date) }),
    w2s: [],
  });
  const wages = run("2025-07-31");
  const pension = run("2025-08-02");
  expect(wages.agi.toFixed()).toBe("4200.05");
  expect(pension.agi.toFixed()).toBe("4200.05");
  expect(pension.totalWages.toFixed()).toBe("0");
  expect(wages.totalWages.toFixed()).toBe("4200.05");
  expect(pension.earnedIncomeCredit.toFixed()).toBe("0");
  expect(wages.earnedIncomeCredit.toFixed()).toBe("323");
});

it("preserves the bound after-retirement Simplified Method and original box states", () => {
  const annuitant = { ...owner, dateOfBirth: "1960-08-01" };
  const simplifiedMethod = {
    simplifiedMethodCostInPlan: "26000",
    simplifiedMethodAnnuityStartingDate: "2025-08-02",
    simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65,
    simplifiedMethodPaymentsReceivedThisYear: 5,
    simplifiedMethodPriorYearRecovered: "0",
  };
  const base = { ...statement, grossDistribution: "6000", federalWithheld: "125" };
  const source = disabilityPensionSource(base, annuitant, "2025-08-02", "2025-12-02");
  type Worksheet = NonNullable<NonNullable<Form1099R["disabilityPensionSource"]>["simplifiedMethod"]>;
  const read = (boxes: { taxableAmount?: string; taxableAmountNotDetermined?: boolean },
    worksheet: Worksheet = simplifiedMethod, boundWorksheet: Worksheet = simplifiedMethod) =>
    parseInput({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, primary: annuitant },
      form1099R: [{
        ...base, ...boxes, ...worksheet,
        disabilityPensionSource: {
          ...source, ...(boxes.taxableAmountNotDetermined && { simplifiedMethod: boundWorksheet }),
          original: { ...source.original, ...boxes },
        },
      }],
    });
  for (const printedTaxable of [undefined, "5800"]) {
    const input = read({ taxableAmount: printedTaxable, taxableAmountNotDetermined: true });
    expect(input.form1099R?.[0]?.taxableAmount).toBe(printedTaxable);
    const result = calculateFederalTax(input);
    expect(filedLine(result, "1h")).toBe("0");
    expect(filedLine(result, "5a")).toBe("6000");
    expect(filedLine(result, "5b")).toBe("5500");
    expect(filedLine(result, "25b")).toBe("125");
  }
  const unknown = read({ taxableAmount: "5800", taxableAmountNotDetermined: undefined });
  expect(unknown.form1099R?.[0]?.taxableAmountNotDetermined).toBeUndefined();
  expect(filedLine(calculateFederalTax(unknown), "5b")).toBe("5800");
  expect(() => calculateFederalTax(read(
    { taxableAmount: undefined, taxableAmountNotDetermined: true },
    { ...simplifiedMethod, simplifiedMethodPriorYearRecovered: "100" },
  ))).toThrow(/Code 3.*worksheet/i);
  const laterWorksheet = { ...simplifiedMethod, simplifiedMethodAnnuityStartingDate: "2026-01-02" };
  expect(() => calculateFederalTax(read(
    { taxableAmount: undefined, taxableAmountNotDetermined: true }, laterWorksheet, laterWorksheet,
  ))).toThrow(/Code 3.*worksheet/i);
  const undatedWorksheet = {
    ...simplifiedMethod, simplifiedMethodAnnuityStartingDate: undefined, simplifiedMethodExpectedPayments: 260,
  };
  const emptyWorksheet = { ...simplifiedMethod, simplifiedMethodPaymentsReceivedThisYear: 0 };
  for (const unsupportedWorksheet of [undatedWorksheet, emptyWorksheet]) {
    expect.soft(() => calculateFederalTax(read(
      { taxableAmount: undefined, taxableAmountNotDetermined: true }, unsupportedWorksheet, unsupportedWorksheet,
    ))).toThrow(/Code 3.*worksheet/i);
  }
});

it("holds calculation before the documented payment was received", () => {
  const source = disabilityPensionSource(statement, owner, "2025-07-31");
  const input = parsed(2025, { ...statement, disabilityPensionSource: source });
  expect(() => calculateFederalTax(input, { asOfDate: "2025-07-30" })).toThrow(/Code 3.*observation date/i);
  expect(() => calculateFederalTax(input, { asOfDate: "2025-02-30" })).toThrow(/Code 3.*observation date/i);
  expect(filedLine(calculateFederalTax(input, { asOfDate: "2025-07-31" }), "1h")).toBe("4200.05");
});

it("keeps confirmed zero and undated legacy placements", () => {
  const zero = calculateFederalTax(parsed(2025, { ...statement, taxableAmount: "0" }));
  expect(filedLine(zero, "5b")).toBe("0");
  expect(filedLine(zero, "25b")).toBe("125.37");
  const legacy = calculateFederalTax(parsed(2025, {
    ...statement, taxYear: undefined, disabilityPensionBeforeMinimumRetirementAge: true,
  }));
  expect(filedLine(legacy, "1h")).toBe("4200.05");
  expect(filedLine(legacy, "5b")).toBe("0");
});
