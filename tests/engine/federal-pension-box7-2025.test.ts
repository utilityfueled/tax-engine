// Spec: spec/federal/form-1099-r.yaml, 2025-box7-ordinary.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { parseInput } from "@/ingest/loader.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const pension = {
  taxYear: 2025,
  payer: "Fictional employer retirement plan",
  accountHolder: "primary" as const,
  grossDistribution: "6000",
  taxableAmount: "6000",
  taxableAmountNotDetermined: false,
  iraSepSimple: false,
  federalWithheld: "125",
};

type Statement = NonNullable<TaxYearInput["form1099R"]>[number];

function parsed(original: Partial<Statement> = {}, dateOfBirth = "1990-01-15") {
  return parseInput({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth },
    },
    form1099R: [{ ...pension, ...original }],
  });
}

function line(result: ReturnType<typeof calculateFederalTax>, form: string, id: string) {
  return result.allLines.find(entry => entry.form === form && entry.line === id)?.value.toString();
}

it.each([
  { name: "omitted", code: undefined },
  { name: "empty", code: "" },
  { name: "whitespace only", code: " \t " },
])("holds a dated 2025 Form 1099-R when Box 7 is $name", ({ code }) => {
  const input = parsed({ distributionCode: code });
  expect(input.form1099R?.[0]?.distributionCode).toBe(code);
  expect(() => calculateFederalTax(input)).toThrow("2025 Form 1099-R requires the actual Box 7 distribution code");
});

it("uses the actual 2025 Box 7 Code 1 before assessing additional tax", () => {
  const result = calculateFederalTax(parsed({ distributionCode: "1" }));
  expect(line(result, "1040", "5b")).toBe("6000");
  expect(line(result, "1040", "25b")).toBe("125");
  expect(line(result, "Form 5329", "4")).toBe("600");
  expect(result.totalTax.toString()).toBe("12075");
});

it("keeps an actual 2025 Code G rollover nontaxable", () => {
  const result = calculateFederalTax(parsed({ distributionCode: "G", taxableAmount: "0", federalWithheld: "0" }));
  expect(line(result, "1040", "5a")).toBe("6000");
  expect(line(result, "1040", "5b")).toBe("0");
  expect(line(result, "Form 5329", "4")).toBeUndefined();
});

it("keeps actual Code 7 IRA reporting and pension Simplified Method recovery", () => {
  const ira = calculateFederalTax(parsed({ distributionCode: "7", iraSepSimple: true }, "1960-01-15"));
  expect(line(ira, "1040", "4b")).toBe("6000");
  expect(line(ira, "1040", "5b")).toBe("0");

  const annuity = calculateFederalTax(parsed({
    distributionCode: "7", taxableAmount: undefined, taxableAmountNotDetermined: true,
    simplifiedMethodCostInPlan: "26000", simplifiedMethodExpectedPayments: 260,
    simplifiedMethodPaymentsReceivedThisYear: 12,
  }, "1960-01-15"));
  expect(line(annuity, "1040", "5b")).toBe("4800");
  expect(line(annuity, "1040", "25b")).toBe("125");
});

it("preserves year validation and compatibility for an undated or zero distribution", () => {
  expect(() => calculateFederalTax(parsed({ taxYear: 2024 }))).toThrow("Form 1099-R source year must match the 2025 return");
  const undated = calculateFederalTax(parsed({ taxYear: undefined }));
  expect(line(undated, "1040", "5b")).toBe("6000");

  const zero = calculateFederalTax(parsed({ grossDistribution: "0", taxableAmount: "0", federalWithheld: "0" }));
  expect(line(zero, "1040", "5b")).toBe("0");
});

it("keeps the direct legacy calculation without a federal return year", () => {
  const result = calculateForm1099R(parsed().form1099R);
  expect(result.pensionTaxable.toString()).toBe("6000");
  expect(result.federalWithholding.toString()).toBe("125");
});
