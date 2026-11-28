// Spec: spec/federal/2026/ira-qcd-adjustment.yaml.
import Decimal from "decimal.js";
import { expect, it, vi } from "vitest";
import { calculateForm1099R, resolveForm1099RTaxableAmount } from "@/engine/forms/form-1099-r.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateSchedule1 } from "@/engine/schedules/schedule-1.js";
import { Form1099RSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const statement = {
  taxYear: 2026,
  payer: "Synthetic IRA Custodian",
  accountReference: "Synthetic traditional IRA",
  accountHolder: "primary",
  distributionCode: "Y7",
  grossDistribution: "6500",
  taxableAmount: "6500",
  taxableAmountNotDetermined: true,
  iraSepSimple: true,
  iraBasisConfirmedZero: true,
  trumpAccount: false,
  excessContributionEarnings: "0",
};
const qcdSource = {
  transferReference: "Custodian distribution and charity acknowledgment",
  distributionDate: "2026-10-30",
  recipientName: "Synthetic public charity",
  ordinaryTraditionalIraConfirmed: true,
  ageRequirementConfirmed: true,
  directTrusteeTransferConfirmed: true,
  eligibleRecipientAndAcknowledgmentConfirmed: true,
  transferAmount: "6500",
  adjustmentWorksheetReference: "Owner's completed Pub. 590-B adjustment worksheet",
  allOwnerTransfersAndContributionsConfirmed: true,
  unusedPriorDeductedContributions: "4000",
  currentDeductedContributions: "0",
};
const options = { taxYear: 2026, qcdAnnualLimit: new Decimal("111000") };

it("holds Code Y without an actual owner worksheet", () => {
  const original = Form1099RSchema.parse({ ...statement, qualifiedCharitableDistribution: "2500" });
  expect(() => calculateForm1099R([original], options)).toThrow(/QCD.*worksheet/i);
});

it("reconciles the published 2026 QCD adjustment", () => {
  const original = Form1099RSchema.parse({ ...statement, qcdSource });
  const result = calculateForm1099R([original], options);
  expect(result.iraQualifiedCharitableDistributions.eq("2500")).toBe(true);
  expect(result.iraTaxable.eq("4000")).toBe(true);
});

it("uses an actual as-of date for direct 2026 QCD aggregation", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
  try {
    const original = Form1099RSchema.parse({ ...statement, qcdSource });
    const future = Form1099RSchema.parse({ ...statement, qcdSource: { ...qcdSource, distributionDate: "2026-10-31" } });
    const earlier = { ...options, asOfDate: "2026-10-29" };
    const invalid = { ...options, asOfDate: "2026-02-30" };
    const later = { ...options, asOfDate: "2026-10-31" };
    expect.soft(() => calculateForm1099R([future], options)).toThrow(/QCD.*on or before/i);
    expect.soft(() => calculateForm1099R([original], earlier)).toThrow(/QCD.*on or before/i);
    expect.soft(() => calculateForm1099R([original], invalid)).toThrow(/QCD.*as-of date/i);
    expect.soft(() => calculateForm1099R([future], later)).toThrow(/QCD.*as-of date/i);
    expect(calculateForm1099R([original], options).iraQualifiedCharitableDistributions.toFixed()).toBe("2500");
  } finally {
    vi.useRealTimers();
  }
});

it("applies each owner adjustment once across multiple statements", () => {
  const primaryAmounts = ["3000", "3500"];
  const primary = primaryAmounts.map((amount, index) => Form1099RSchema.parse({
    ...statement,
    accountReference: `Synthetic IRA ${index + 1}`,
    grossDistribution: amount,
    taxableAmount: amount,
    qcdSource: { ...qcdSource, transferAmount: amount, transferReference: `Original trustee transfer ${index + 1}` },
  }));
  const spouse = Form1099RSchema.parse({
    ...statement, accountHolder: "spouse",
    grossDistribution: "112000.50", taxableAmount: "112000.50",
    qcdSource: {
      ...qcdSource,
      transferAmount: "112000.50",
      transferReference: "Separate spouse transfer",
      adjustmentWorksheetReference: "Spouse's completed worksheet",
      unusedPriorDeductedContributions: "0", currentDeductedContributions: "0.25",
    },
  });
  const result = calculateForm1099R([...primary, spouse], { ...options, hasJointSpouse: true });
  expect(result.iraQualifiedCharitableDistributions.eq("113499.75")).toBe(true);
  expect(result.iraTaxable.eq("5000.75")).toBe(true);
});

it("supports a documented partial Code 7 transfer while keeping the remainder taxable", () => {
  const original = Form1099RSchema.parse({
    ...statement, distributionCode: "7", grossDistribution: "7500.01", taxableAmount: undefined,
    qcdSource: { ...qcdSource, unusedPriorDeductedContributions: "0" },
  });
  const result = calculateForm1099R([original], options);
  expect(result.iraGrossReported.toString()).toBe("7500.01");
  expect(result.iraQualifiedCharitableDistributions.toString()).toBe("6500");
  expect(result.iraTaxable.toString()).toBe("1000.01");
});

it("retains the full taxable transfer if the adjustment exceeds the capped amount", () => {
  const original = Form1099RSchema.parse({ ...statement, qcdSource: {
    ...qcdSource, unusedPriorDeductedContributions: "6500.01",
  } });
  const result = calculateForm1099R([original], options);
  expect(result.iraQualifiedCharitableDistributions.isZero()).toBe(true);
  expect(result.iraTaxable.toString()).toBe("6500");
});

it.each([
  [{ unusedPriorDeductedContributions: undefined }, /contribution amounts/i],
  [{ currentDeductedContributions: undefined }, /contribution amounts/i],
  [{ currentDeductedContributions: "-0.01" }, /contribution amounts/i],
  [{ ageRequirementConfirmed: false }, /confirmations/i],
  [{ allOwnerTransfersAndContributionsConfirmed: false }, /confirmations/i],
  [{ recipientName: "   " }, /recipient/i],
  [{ distributionDate: "2026-02-30" }, /date/i],
  [{ distributionDate: "2025-12-31" }, /date/i],
  [{ transferAmount: "6500.01" }, /transfer amount/i],
  [{ transferAmount: "6499.99" }, /transfer amount/i],
] as const)("holds an incomplete or conflicting worksheet %j", (changes, error) => {
  const original = Form1099RSchema.parse({ ...statement, qcdSource: { ...qcdSource, ...changes } });
  expect(() => calculateForm1099R([original], options)).toThrow(error);
});

it.each([
  [{ distributionCode: "Y4" }, /separate method/i],
  [{ distributionCode: "YK" }, /separate method/i],
  [{ distributionCode: "7Y" }, /separate method/i],
  [{ distributionCode: "7", qualifiedCharitableDistribution: "6500" }, /manual QCD/i],
  [{ iraSepSimple: false }, /IRA classification/i],
  [{ iraBasisConfirmedZero: false }, /zero nondeductible IRA basis/i],
  [{ accountHolder: "spouse" }, /actual return owner/i],
  [{ accountReference: undefined }, /account/i],
  [{ distributionDate: "2026-10-29" }, /date/i],
  [{ excessContributionReturnedWithoutEarnings: true }, /separate method/i],
] as const)("holds a missing, conflicting or specialized original source %j", (changes, error) => {
  const original = Form1099RSchema.parse({ ...statement, ...changes, qcdSource });
  expect(() => calculateForm1099R([original], options)).toThrow(error);
});

it("rejects a duplicated underlying transfer with relabeled evidence", () => {
  const first = Form1099RSchema.parse({ ...statement, qcdSource });
  const second = Form1099RSchema.parse({ ...statement, qcdSource: {
    ...qcdSource, transferReference: "Relabeled copy of original transfer",
  } });
  expect(() => calculateForm1099R([first, second], options)).toThrow(/duplicate.*transfer/i);
});

it("holds a duplicate original Code 7 statement with different or absent transfer details", () => {
  const original = {
    ...statement, payerTin: "12-3456789", distributionCode: "7", grossDistribution: "10000", taxableAmount: "10000",
  };
  const first = Form1099RSchema.parse({ ...original, qcdSource: { ...qcdSource, transferAmount: "4000" } });
  const second = Form1099RSchema.parse({ ...original, payerTin: "123456789", payer: "IRA custodian's alternate name", qcdSource: {
    ...qcdSource, transferAmount: "2500", transferReference: "Another transfer reference",
  } });
  const ordinaryCopy = Form1099RSchema.parse({ ...original, payerTin: undefined });
  expect(() => calculateForm1099R([first, second], options)).toThrow(/duplicate original.*1099-R/i);
  expect(() => calculateForm1099R([first, ordinaryCopy], options)).toThrow(/duplicate original.*1099-R/i);
});

it("rejects duplicate transfer references and incompatible copies of an owner worksheet", () => {
  const first = Form1099RSchema.parse({ ...statement, qcdSource });
  const second = Form1099RSchema.parse({ ...statement, accountReference: "Separate IRA record", qcdSource });
  expect(() => calculateForm1099R([first, second], options)).toThrow(/duplicate.*transfer/i);
  second.qcdSource = { ...qcdSource, transferReference: "Separate IRA transfer", unusedPriorDeductedContributions: "3999.99" };
  expect(() => calculateForm1099R([first, second], options)).toThrow(/owner.*worksheet/i);
});

it("never treats a dated Code Y as a full exclusion in standalone or per-statement paths", () => {
  const original = Form1099RSchema.parse(statement);
  expect(() => calculateForm1099R([original])).toThrow(/QCD.*worksheet/i);
  expect(() => resolveForm1099RTaxableAmount(original)).toThrow(/QCD.*worksheet/i);
});

function federalInput(changes: Record<string, unknown> = {}, dateOfBirth = "1956-04-30") {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer, taxYear: 2026,
      primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth },
    },
    form1099R: [{ ...statement, qcdSource }],
    ...changes,
  });
}

it("carries the verified QCD into the parsed federal return", () => {
  const result = calculateFederalTax(federalInput());
  expect(result.iraDistributionsGross.toString()).toBe("6500");
  expect(result.iraDistributionsTaxable.toString()).toBe("4000");
  expect(result.agi.toString()).toBe("89000");
});

it("uses the federal caller date for the actual 2026 QCD transfer", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 28, 12));
  try {
    const actual = federalInput();
    const future = federalInput({
      form1099R: [{ ...statement, qcdSource: { ...qcdSource, distributionDate: "2026-12-31" } }],
    }, "1956-06-10");
    expect.soft(() => calculateFederalTax(future)).toThrow(/QCD.*on or before/i);
    expect.soft(() => calculateFederalTax(actual, { asOfDate: "2026-10-29" })).toThrow(/QCD.*on or before/i);
    expect.soft(() => calculateFederalTax(future, { asOfDate: "2026-12-31" })).toThrow(/QCD.*as-of date/i);
    expect(calculateFederalTax(actual, { asOfDate: "2026-10-30" }).iraDistributionsTaxable.toFixed()).toBe("4000");
  } finally {
    vi.useRealTimers();
  }
});

it("checks the actual owner age at transfer and closes Schedule 1's standalone fallback", () => {
  expect(() => calculateFederalTax(federalInput({}, "1956-05-01"))).toThrow(/age.*distribution date/i);
  const missingFacts = federalInput({ form1099R: [{ ...statement, taxYear: undefined }] });
  expect(() => calculateSchedule1(missingFacts)).toThrow(/QCD.*worksheet/i);
});

it("holds separately supplied Form 8606 methods before replacing the QCD result", () => {
  expect(() => calculateFederalTax(federalInput({ form8606: { yearEndValue: "0" } }))).toThrow(/QCD.*8606/i);
  expect(() => calculateFederalTax(federalInput({ form8606ByOwner: { primary: { yearEndValue: "0" } } }))).toThrow(/QCD.*8606/i);
});

it("keeps historical QCD and ordinary 2026 Code 7 behavior", () => {
  const historical = Form1099RSchema.parse({ ...statement, taxYear: 2025 });
  expect(calculateForm1099R([historical], { taxYear: 2025 }).iraTaxable.isZero()).toBe(true);
  const ordinary = Form1099RSchema.parse({ ...statement, distributionCode: "7" });
  expect(calculateForm1099R([ordinary], options).iraTaxable.toString()).toBe("6500");
});

it("holds an unreconciled current return IRA deduction without changing the confirmed standalone worksheet", () => {
  const source = { ...qcdSource, currentDeductedContributions: "1000.01" };
  expect(() => calculateFederalTax(federalInput({ form1099R: [{ ...statement, qcdSource: source }] }))).toThrow(/QCD.*current.*IRA deduction/i);
  expect(() => calculateFederalTax(federalInput({ adjustments: { iraDeduction: "1000.01" } }))).toThrow(/QCD.*current.*IRA deduction/i);
  expect(calculateForm1099R([Form1099RSchema.parse({ ...statement, qcdSource: source })], options)
    .iraQualifiedCharitableDistributions.toString()).toBe("1499.99");
});

it("holds an overlapping deductible cash gift for either election", () => {
  const gift = {
    organization: " synthetic PUBLIC charity ", type: "cash", amount: "6500", dateOfDonation: "2026-10-30",
    qualifiedOrganization: true, supportingOrganization: false, donorAdvisedFund: false, recipientCategory: "fifty-percent",
  };
  for (const deductionElection of ["standard", "itemized"]) {
    expect(() => calculateFederalTax(federalInput({ deductionElection, donations: [gift] })))
      .toThrow(/QCD.*cash gift.*reconcile/i);
  }
  const separate = calculateFederalTax(federalInput({
    deductionElection: "standard", donations: [{ ...gift, dateOfDonation: "2026-10-31", amount: "400" }],
  }));
  expect(separate.iraDistributionsTaxable.toString()).toBe("4000");
  expect(separate.nonitemizerCharitableDeduction.toString()).toBe("400");
});

it("rejects manual Form 8606 QCD numbers without an actual transfer", () => {
  const noQcdSource = [{ ...statement, distributionCode: "7" }];
  expect(() => calculateFederalTax(federalInput({
    form1099R: noQcdSource, form8606: { yearEndValue: "0", qualifiedCharitableDistributions: "1000" },
  }))).toThrow(/QCD.*8606.*worksheet/i);
});
