// Spec: spec/federal/schedule-se-crp-cash-farm.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { complexMFJFixture, simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { healthFacts } from "../../fixtures/form7206.js";
import { annualFarmBenefit, cashFarmPayments, farmPayment } from "../../fixtures/schedule-se-crp.js";

const single = (scheduleF: unknown, extra = {}) => TaxYearInputSchema.parse({
  ...simpleW2Fixture, w2s: [], formSSA1099: [annualFarmBenefit()], scheduleF, ...extra,
});

it("requires actual dated receipts and benefit facts that reconcile to the taxable total", () => {
  const receipt = farmPayment("crp-a", "1000");
  const valid = cashFarmPayments("1000", [receipt]);
  const invalid = [
    { ...valid, agriculturalProgramPayments: undefined },
    { ...valid, agriculturalProgramPayments: "1000.01" },
    { ...valid, accountingMethod: "accrual" },
    { ...valid, materiallyParticipated: false },
    { ...valid, qbiMateriallyParticipated: false },
    { ...valid, agriculturalPaymentSources: { ...valid.agriculturalPaymentSources, allGrossPaymentsTaxableConfirmed: false } },
    ...[
      [receipt, receipt],
      [{ ...receipt, receivedDate: "2024-12-31" }],
      [{ ...receipt, receivedDate: "2025-02-29" }],
      [{ ...receipt, benefitAtReceipt: undefined }],
      [{ ...receipt, benefitAtReceipt: "other" }],
      [{ ...receipt, benefitSourceReference: " " }],
      [{ ...receipt, noAttributableScheduleFDeductionsConfirmed: false }],
      [{ ...receipt, program: "crp-cost-share" }],
      [{ ...receipt, accountHolder: "spouse" }],
      [{ ...receipt, taxableAmount: "-1000" }],
    ].map(payments => ({ ...valid, agriculturalPaymentSources: { ...valid.agriculturalPaymentSources, payments } })),
  ];
  for (const farm of invalid) expect(() => calculateScheduleSE(single(farm), getConstants(2025))).toThrow();
  for (const annual of [[], [annualFarmBenefit("spouse")], [annualFarmBenefit("primary", 2024)],
    [annualFarmBenefit(), annualFarmBenefit()]]) {
    expect(() => calculateScheduleSE(single(valid, { formSSA1099: annual }), getConstants(2025))).toThrow(/annual.*SSA-1099/i);
  }
  const repaid = calculateScheduleSE(single(valid, { formSSA1099: [annualFarmBenefit("primary", 2025, "0")] }), getConstants(2025));
  expect(repaid.excludedCashFarmCrp.toFixed()).toBe("1000");

  const legacy = single({ agriculturalProgramPayments: "1000" });
  const result = calculateScheduleSE(legacy, getConstants(2025));
  expect(result.netSEEarnings.toFixed()).toBe("1000");
  expect(result.sourceFactsVerified).toBe(false);
  expect(() => calculateScheduleSE({ ...legacy, taxpayer: { ...legacy.taxpayer, taxYear: 2026 } }, FEDERAL_2026_CONSTANTS)).toThrow(/agricultural.*source/i);
  const knownZero = calculateScheduleSE(single(cashFarmPayments("0", [])), getConstants(2025));
  expect(knownZero.sourceFactsVerified).toBe(true);
});

it("excludes only the same owner's qualifying taxable receipts from net earnings", () => {
  const receipts = [
    farmPayment("qualifying", "2400"),
    { ...farmPayment("before-benefit", "600", "2025-01-07"), benefitAtReceipt: "none", annualBenefitStatementSourceId: undefined },
    { sourceId: "other-program", sourceReference: "Synthetic other payment", receivedDate: "2025-04-02", taxableAmount: "2000", accountHolder: "primary", program: "other" },
  ];
  const farm = { ...cashFarmPayments("5000", receipts), salesOfProductsRaised: "2000", expenses: { feed: "2000" } };
  const input = TaxYearInputSchema.parse({ ...complexMFJFixture, w2s: [], form1099Nec: [], scheduleK1: [],
    formSSA1099: [annualFarmBenefit()], scheduleF: farm, scheduleC: { grossReceipts: "3000", accountHolder: "primary" },
  });
  const result = calculateScheduleSE(input, getConstants(2025));
  expect(result.sourceFactsVerified).toBe(true);
  expect(result.perTaxpayer.map(row => row.accountHolder)).toEqual(["primary"]);
  const line = (number: string) => result.lines.find(row => row.line === number)?.value.toFixed();
  expect(["1a", "1b", "2", "3", "4a", "12", "13"].map(line)).toEqual(["5000", "2400", "3000", "5600", "5172", "791", "396"]);
  const nextFarm = { ...farm, agriculturalPaymentSources: { ...farm.agriculturalPaymentSources, sourceTaxYear: 2026,
    payments: receipts.map(row => ({ ...row, receivedDate: row.receivedDate.replace("2025-", "2026-") })),
  } };
  const next = calculateScheduleSE(TaxYearInputSchema.parse({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 },
    formSSA1099: [annualFarmBenefit("primary", 2026)], scheduleF: nextFarm }), FEDERAL_2026_CONSTANTS);
  expect(next.totalSETax.toFixed()).toBe("791");
  expect(next.sourceFactsVerified).toBe(true);
});

it("keeps taxable farm profit and uses adjusted earned income for ACTC", () => {
  const input = single({ ...cashFarmPayments("2400"), salesOfProductsRaised: "3200" }, {
    taxpayer: { ...simpleW2Fixture.taxpayer, dependents: complexMFJFixture.taxpayer.dependents },
  });
  const result = calculateFederalTax(input);
  expect(result.scheduleF?.netFarmProfit.toFixed()).toBe("5600");
  expect(result.schedule1?.lines.find(line => line.line === "6")?.value.toFixed()).toBe("5600");
  expect(result.selfEmploymentTax.toFixed()).toBe("452");
  expect(result.scheduleSE?.deductibleHalf.toFixed()).toBe("226");
  expect(result.form8812?.lines.find(line => line.line === "18a")?.value.toFixed()).toBe("2974");
  expect(result.form8812?.actc.toFixed()).toBe("71");
  expect(result.allLines.find(line => line.form === "QBI Source Deductions" && line.line === "scheduleF")?.value.toFixed()).toBe("5374");
  for (const expenses of [{}, { advertising: "5000" }, { advertising: "5100" }]) {
    expect(() => calculateFederalTax(single(input.scheduleF, { scheduleC: { grossReceipts: "5000", expenses } }))).toThrow(/CRP.*gross income/i);
  }
});

it("uses the farm profit after the exclusion for the actual Form 7206 limit", () => {
  const result = calculateFederalTax(single(cashFarmPayments("2000"), { form7206: healthFacts("scheduleF", "1000") }));
  expect(result.scheduleF?.netFarmProfit.toFixed()).toBe("2000");
  expect(result.form7206?.deductionToSchedule1.toFixed()).toBe("0");
  expect(() => calculateFederalTax(single(cashFarmPayments("2000"), { adjustments: { selfEmployedHealthInsurance: "1000" } }))).toThrow(/actual Form7206/i);
});

it("uses post-exclusion earnings in the official EIC table", () => {
  const taxpayer = {
    ...simpleW2Fixture.taxpayer,
    primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1990-01-01" },
    dependents: [{ firstName: "Child", lastName: "Test", dateOfBirth: "2015-06-15", ssn: "333-33-3333",
      relationship: "son", monthsLivedWithYou: 12, qualifiesForCTC: true, qualifiesForEIC: true }],
  };
  const result = calculateFederalTax(single({ ...cashFarmPayments("2400"), salesOfProductsRaised: "3200" }, { taxpayer }));
  expect(result.agi.toFixed()).toBe("5374");
  expect(result.earnedIncomeCredit.toFixed()).toBe("1012");
});

it("distinguishes the special $434 attachment threshold from the ordinary $400 exact test", () => {
  const c = getConstants(2025);
  for (const [preExclusion, receipt, expected] of [
    ["433.99", "10", "none"], ["434", "10", "crp-zero"], ["434", "0.87", "crp-zero"],
    ["434", "0.86", "regular-tax"], ["434", "434", "crp-zero"],
  ]) {
    const input = single({ ...cashFarmPayments(receipt), salesOfProductsRaised: preExclusion === "433.99" ? "423.99"
      : receipt === "10" ? "424" : receipt === "0.87" ? "433.13" : receipt === "0.86" ? "433.14" : "0" });
    const result = calculateScheduleSE(input, c);
    expect(result.perTaxpayer[0]?.reviewAttachment).toBe(expected);
    expect(result.totalSETax.toFixed()).toBe(expected === "regular-tax" ? "62" : "0");
  }
});
