// Spec: spec/federal/form-5329-first-home-source.yaml.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function original(year = 2025) {
  return {
    taxYear: year, payer: "Fictional traditional IRA custodian", accountHolder: "primary",
    accountReference: "traditional-ira-a", distributionCode: "1", distributionDate: `${year}-09-15`,
    grossDistribution: "7000", taxableAmount: "7000", taxableAmountNotDetermined: false,
    iraSepSimple: true, iraBasisConfirmedZero: true, trumpAccount: false, excessContributionEarnings: "0",
  };
}

function facts(year = 2025) {
  return {
    sourceTaxYear: year, owner: "primary", accountReference: "traditional-ira-a",
    sourceFactsConfirmed: true, distributionReceivedDate: `${year}-09-15`, singleDistributionReceiptConfirmed: true, distributionRolledOver: false,
    boughtOwnPrincipalResidence: true, purchaseCompleted: true, bindingContractDate: `${year}-10-20`,
    maritalStatusAtAcquisition: "unmarried", buyerHadNoPrincipalResidenceInterest: true,
    noFormerSection1034Suspension: true,
    qualifiedPayment: { date: `${year + 1}-01-13`, amount: "6500", kind: "purchase_price", paidFromMatchedDistribution: true },
    priorQualifiedFirstTimeHomebuyerDistributions: "4000",
  };
}

function returnInput(
  year = 2025,
  factChanges: Record<string, unknown> = {},
  formChanges: Record<string, unknown> = {},
  other: Record<string, unknown> = {},
) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    form1099R: [{ ...original(year), ...formChanges }],
    form5329FirstHomeSource: { ...facts(year), ...factChanges },
    ...other,
  });
}

it("uses actual calendar dates and accepts day 120 across tax years", () => {
  for (const year of [2025, 2026]) {
    const result = calculateFederalTax(returnInput(year));
    const partI = result.form5329!;
    expect([partI.line1, partI.line2, partI.line3, partI.line4].map(amount => amount.toFixed())).toEqual([
      "7000", "6000", "1000", "100",
    ]);
    expect(partI.line2ExceptionNumber).toBe("09");
    expect(result.iraDistributionsTaxable.toFixed()).toBe("7000");
    expect(result.allLines.find(row => row.form === "Form 5329 first home" && row.line === "09-source")?.value.toFixed()).toBe("6500");
  }
});

it("requires original IRA identity and complete homebuyer facts", () => {
  for (const changes of [
    { accountHolder: undefined }, { accountHolder: "spouse" }, { accountReference: "different-ira" },
    { payer: " " }, { trumpAccount: true }, { excessContributionEarnings: "0.01" },
    { distributionDate: undefined }, { distributionDate: "2025-09-16" }, { taxYear: undefined },
    { iraBasisConfirmedZero: undefined }, { employeeContributions: "0.01" },
    { taxableAmountNotDetermined: undefined }, { taxableAmount: "6500" }, { distributionCode: "J" },
    { iraSepSimple: undefined }, { returnedContributionByDueDate: true },
  ]) {
    expect.soft(() => calculateFederalTax(returnInput(2025, {}, changes)), JSON.stringify(changes)).toThrow();
  }
  for (const changes of [
    { sourceFactsConfirmed: undefined }, { priorQualifiedFirstTimeHomebuyerDistributions: undefined },
    { priorQualifiedFirstTimeHomebuyerDistributions: "-1" }, { buyerHadNoPrincipalResidenceInterest: false },
    { boughtOwnPrincipalResidence: false }, { noFormerSection1034Suspension: undefined },
    { maritalStatusAtAcquisition: "married" }, { maritalStatusAtAcquisition: "married", spouseHadNoPrincipalResidenceInterest: false },
  ]) {
    expect(() => calculateFederalTax(returnInput(2025, changes))).toThrow();
  }
  const spouseHistory = calculateFederalTax(returnInput(2025, {
    maritalStatusAtAcquisition: "married", spouseHadNoPrincipalResidenceInterest: true,
  }));
  expect(spouseHistory.form5329?.line2.toFixed()).toBe("6000");

  const olderTaxpayer = { ...simpleW2Fixture.taxpayer,
    primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1966-03-15" } };
  expect(() => calculateFederalTax(returnInput(2025, {}, {}, { taxpayer: olderTaxpayer }))).toThrow(/under age 59/);
  const youngerTaxpayer = { ...olderTaxpayer, primary: { ...olderTaxpayer.primary, dateOfBirth: "1966-03-16" } };
  expect(calculateFederalTax(returnInput(2025, {}, {}, { taxpayer: youngerTaxpayer })).form5329?.line2.toFixed()).toBe("6000");
  expect(() => calculateFederalTax(returnInput(2025, { sourceTaxYear: 2026 }))).toThrow(/matching tax year/);
  expect(() => calculateFederalTax(returnInput(2025, {}, {}, { form1099R: [original(), original()] }))).toThrow(/one Form 1099-R/);
  expect(() => calculateFederalTax(returnInput(2025, {}, {}, { form5329: { qualifiedFirstTimeHomebuyerDistributionAmount: "3500" } }))).toThrow(/separate Part I/);
  expect(() => calculateFederalTax(returnInput(2025, {}, {}, { scheduleA: { medicalExpenses: "12000" } }))).toThrow(/competing Part I exception/);
});

it("rejects unsupported purchase timing and rollover facts", () => {
  for (const [payment, contract] of [
    ["2026-01-14", "2025-10-20"],
    ["2025-08-20", "2025-08-01"],
    ["2025-10-10", "2025-10-20"],
    ["2025-11-31", "2025-10-20"],
  ]) {
    expect(() => calculateFederalTax(returnInput(2025, {
      bindingContractDate: contract, qualifiedPayment: { ...facts().qualifiedPayment, date: payment },
    }))).toThrow();
  }
  expect(() => calculateFederalTax(returnInput(2025, { purchaseCompleted: false }))).toThrow();
  expect(() => calculateFederalTax(returnInput(2025, { distributionRolledOver: true }))).toThrow();
  expect(() => calculateFederalTax(returnInput(2025, {
    qualifiedPayment: { ...facts().qualifiedPayment, amount: "7000.01" },
  }))).toThrow(/cannot exceed/);
});

it("requires confirmed same-distribution funding and ordinary closing costs", () => {
  for (const confirmed of [undefined, false]) {
    expect(() => calculateFederalTax(returnInput(2025, { singleDistributionReceiptConfirmed: confirmed }))).toThrow();
    expect(() => calculateFederalTax(returnInput(2025, {
      qualifiedPayment: { ...facts().qualifiedPayment, paidFromMatchedDistribution: confirmed },
    }))).toThrow();
    expect(() => calculateFederalTax(returnInput(2025, {
      qualifiedPayment: {
        ...facts().qualifiedPayment, kind: "settlement_financing_or_closing", usualOrReasonableForAcquisition: confirmed,
      },
    }))).toThrow();
  }
});

it("applies the actual individual lifetime cap without reducing taxable IRA income", () => {
  const underCap = calculateFederalTax(returnInput(2025, {
    qualifiedPayment: {
      ...facts().qualifiedPayment, amount: "5500.75", kind: "settlement_financing_or_closing", usualOrReasonableForAcquisition: true,
    },
    priorQualifiedFirstTimeHomebuyerDistributions: "0.00",
  }, { employeeContributions: "0.00" }));
  expect(underCap.iraDistributionsTaxable.toFixed()).toBe("7000");
  expect(underCap.form5329?.line2.toFixed()).toBe("5500.75");
  expect(underCap.form5329?.line4.toFixed()).toBe("149.925");
  const atCap = calculateFederalTax(returnInput(2025, { priorQualifiedFirstTimeHomebuyerDistributions: "10000" }));
  expect(atCap.form5329?.line2.isZero()).toBe(true);
  expect(atCap.form5329?.line2ExceptionNumber).toBeUndefined();
  expect(atCap.form5329?.line4.toFixed()).toBe("700");
});

it("preserves uncoupled legacy manual Code 09", () => {
  const result = calculateFederalTax(returnInput(2025, {}, {}, {
    form5329FirstHomeSource: undefined,
    form5329: { earlyDistributionsIncludedInIncome: "7000", qualifiedFirstTimeHomebuyerDistributionAmount: "1000" },
  }));
  expect(result.form5329?.line2ExceptionNumber).toBe("09");
  expect(result.form5329?.line2.toFixed()).toBe("1000");
  expect(result.form5329?.line4.toFixed()).toBe("600");
});

it("preserves the actual 2026 full calculation hold", async () => {
  const { getConstants } = await vi.importActual<typeof import("@/models/constants.js")>("@/models/constants.js");
  expect(() => getConstants(2026)).toThrow(/rule pack .* is incomplete/);
});
