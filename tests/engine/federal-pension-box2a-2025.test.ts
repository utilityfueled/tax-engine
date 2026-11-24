// Spec: spec/federal/form-1099-r.yaml, 2025-box2a-ordinary.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm1099R, getForm1099RTaxabilitySource } from "@/engine/forms/form-1099-r.js";
import { parseInput } from "@/ingest/loader.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

type Statement = NonNullable<TaxYearInput["form1099R"]>[number];

const scenarios = [
  { code: "1", dateOfBirth: "1990-01-15", age: 35, costInPlan: "36000", additionalTax: "480" },
  { code: "7", dateOfBirth: "1960-01-15", age: 65, costInPlan: "26000", additionalTax: undefined },
];

function parsed(scenario: (typeof scenarios)[number], overrides: Partial<Statement> = {}) {
  return parseInput({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: scenario.dateOfBirth },
    },
    form1099R: [{
      taxYear: 2025,
      payer: "Fictional qualified employer retirement annuity",
      accountHolder: "primary",
      distributionCode: scenario.code,
      iraSepSimple: false,
      grossDistribution: "6000",
      taxableAmountNotDetermined: true,
      federalWithheld: "125",
      ...overrides,
    }],
  });
}

function line(result: ReturnType<typeof calculateFederalTax>, form: string, id: string) {
  return result.allLines.find(entry => entry.form === form && entry.line === id)?.value.toString();
}

const missingWorksheet = "2025 Form 1099-R pension with checked Box 2b and missing Box 2a requires a supported taxable-amount worksheet";

it.each(scenarios)("holds a dated 2025 Code $code pension with checked Box 2b and omitted Box 2a", scenario => {
  const input = parsed(scenario);
  const statement = input.form1099R?.[0];
  expect(statement?.taxableAmountNotDetermined).toBe(true);
  expect(statement?.taxableAmount).toBeUndefined();
  expect(() => calculateFederalTax(input)).toThrow(missingWorksheet);
});

it.each(scenarios)("holds a dated 2025 Code $code pension with unchecked Box 2b and omitted Box 2a", scenario => {
  for (const employeeContributions of [undefined, "0"]) {
    const input = parsed(scenario, { taxableAmountNotDetermined: false, employeeContributions });
    expect(input.form1099R?.[0]?.taxableAmountNotDetermined).toBe(false);
    expect(input.form1099R?.[0]?.taxableAmount).toBeUndefined();
    expect(() => calculateFederalTax(input)).toThrow(/unchecked Box 2b and missing Box 2a/);
  }
});

it.each(scenarios)("preserves the historical positive Box 5 exception for Code $code", scenario => {
  const employeeContributions = "1200";
  const unchecked = parsed(scenario, { employeeContributions, taxableAmountNotDetermined: false });
  const result = calculateFederalTax(unchecked);
  expect(line(result, "1040", "5b")).toBe("4800");
  expect(line(result, "1040", "25b")).toBe("125");
  expect(() => calculateFederalTax(parsed(scenario, { employeeContributions }))).toThrow(missingWorksheet);
});

it("preserves the original schema rejection for an incomplete Simplified Method worksheet", () => {
  expect(() => parsed(scenarios[1], { simplifiedMethodCostInPlan: "26000", simplifiedMethodPaymentsReceivedThisYear: 12 }))
    .toThrow("Simplified Method expected payments are required");
});

it.each(scenarios)("uses a complete Simplified Method worksheet for dated 2025 Code $code", scenario => {
  for (const taxableAmountNotDetermined of [true, false]) {
    const input = parsed(scenario, {
      taxableAmountNotDetermined,
      simplifiedMethodCostInPlan: scenario.costInPlan,
      simplifiedMethodAnnuityStartingDate: "2025-01-15",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: scenario.age,
      simplifiedMethodPaymentsReceivedThisYear: 12,
    });
    const statement = input.form1099R?.[0];
    if (!statement) throw new Error("The parsed pension original is required");
    expect(getForm1099RTaxabilitySource(statement).source).toBe("supported-method");
    const result = calculateFederalTax(input);
    expect(line(result, "1040", "5a")).toBe("6000");
    expect(line(result, "1040", "5b")).toBe("4800");
    expect(line(result, "1040", "25b")).toBe("125");
    expect(line(result, "Form 5329", "4")).toBe(scenario.additionalTax);
  }
});

it.each(["6000", "4800", "0"])("preserves a printed Box 2a amount of %s", taxableAmount => {
  for (const taxableAmountNotDetermined of [true, false]) {
    const result = calculateFederalTax(parsed(scenarios[1], { taxableAmount, taxableAmountNotDetermined }));
    expect(line(result, "1040", "5b")).toBe(taxableAmount);
    expect(line(result, "1040", "25b")).toBe("125");
  }
});

it("preserves source-year validation, unknown checkbox facts and the direct worksheet preview", () => {
  expect(() => calculateFederalTax(parsed(scenarios[1], { taxYear: 2024 }))).toThrow("Form 1099-R source year must match the 2025 return");
  const undated = calculateFederalTax(parsed(scenarios[1], { taxYear: undefined }));
  expect(line(undated, "1040", "5b")).toBe("6000");
  const checkboxUnknown = calculateFederalTax(parsed(scenarios[1], { taxableAmountNotDetermined: undefined }));
  expect(line(checkboxUnknown, "1040", "5b")).toBe("6000");
  expect(calculateForm1099R(parsed(scenarios[1]).form1099R).pensionTaxable.toString()).toBe("6000");
});

it.each(["6", "G"])("preserves known Code %s treatment with blank Box 2a", distributionCode => {
  for (const taxableAmountNotDetermined of [true, false]) {
    const result = calculateFederalTax(parsed(scenarios[1], { distributionCode, taxableAmountNotDetermined, federalWithheld: "0" }));
    expect(line(result, "1040", "5b")).toBe("0");
    expect(line(result, "Form 5329", "4")).toBeUndefined();
  }
});
