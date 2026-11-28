import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/public-federal-return.js";
import { calculateForm6198 } from "@/engine/forms/form-6198.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed } from "@/pdf/export-policy.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// Exercise the federal calculation path without enabling the public 2026 rule pack.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const partII2026 = {
  taxYear: 2026,
  activityName: "Example operating partnership",
  entityEin: "12-3456789",
  accountHolder: "primary",
  recipientName: "Jane Doe",
  recipientTaxpayerIdLast4: "6789",
  originalK1Reference: "Original 2026 Schedule K-1",
  openingBasisReference: "Prior closing and current opening outside-basis worksheet",
  changeWorksheetReference: "Current Part II ledger including risk-protected debt in opening basis",
  ordinaryNonpassivePartIIConfirmed: true,
  noPriorAtRiskLossOrRecaptureConfirmed: true,
  noQbiOrSelfEmploymentAmountsConfirmed: true,
  box1Loss: "-6000.00",
  openingAdjustedBasis: "12000.00",
  increases: "0.00",
  decreases: "8000.00",
} as const;

const legacyForm = {
  activityName: partII2026.activityName,
  ordinaryIncome: "-6000.00",
  gainLossFromDispositions: "0",
  otherIncomeGains: "0",
  otherDeductionsLosses: "0",
  adjustedBasisAtEffectiveDate: "12000.00",
  priorYearAmountAtRisk: "4000.00",
  currentYearIncreases: "0.00",
  currentYearDecreases: "8000.00",
};

function input(form6198: Record<string, unknown>, taxYear = 2026, overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    scheduleK1: [{ taxYear, partnershipName: partII2026.activityName, partnershipEIN: partII2026.entityEin,
      accountHolder: "primary", entityType: "partnership", ordinaryIncome: "-6000.00", isPassiveActivity: false,
      beginningBasis: "12000.00", form6198, section199AQBI: "0", selfEmploymentEarnings: "0",
      selfEmploymentNetEarningsAfterAdjustments: "0", selfEmploymentFactsConfirmed: true, selfEmploymentIncomeType: "nonfarm",
      ...overrides }],
  });
}

it("transfers the source-backed Form 6198 limit through Schedule E and federal income", () => {
  const canonical = input({ partII2026 });
  const result = calculateScheduleE(canonical);
  expect.soft(result.partnerships[0].nonpassiveLoss.toFixed()).toBe("-4000");
  expect.soft(result.partnerships[0].suspendedAtRiskLoss.toFixed()).toBe("-2000");
  expect.soft(result.lines.filter(line => line.form === "Form 6198").map(line => [line.line, line.value.toFixed()])).toEqual([
    ["6", "12000"], ["7", "0"], ["8", "12000"], ["9", "8000"], ["10a", "4000"], ["10b", "4000"], ["20", "4000"], ["21", "4000"],
  ]);
  const federal = calculateFederalTax(canonical);
  expect.soft(federal.otherIncome.toFixed()).toBe("-4000");
  expect.soft(federal.agi.toFixed()).toBe("81000");
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow();

  const cents = input({ partII2026: { ...partII2026, increases: "0.01", decreases: "8000.02" } });
  const exact = calculateScheduleE(cents).partnerships[0];
  expect(exact.atRiskAmount?.toFixed(2)).toBe("3999.99");
  expect(exact.suspendedAtRiskLoss.toFixed(2)).toBe("-2000.01");
});

it("requires actual same-owner K-1, basis and complete Part II records", () => {
  for (const change of [{ openingBasisReference: "" }, { increases: undefined }, { decreases: undefined },
    { ordinaryNonpassivePartIIConfirmed: false }, { noPriorAtRiskLossOrRecaptureConfirmed: false },
    { noQbiOrSelfEmploymentAmountsConfirmed: false }, { taxYear: 2025 }]) {
    expect.soft(() => input({ partII2026: { ...partII2026, ...change } })).toThrow();
  }
  for (const change of [{ box1Loss: "-5999.99" }, { openingAdjustedBasis: "11999.99" },
    { entityEin: "98-7654321" }, { recipientTaxpayerIdLast4: "4321" }, { recipientName: "Janet Doe" },
    { activityName: "Other activity" }, { accountHolder: "spouse" }]) {
    expect.soft(() => calculateScheduleE(input({ partII2026: { ...partII2026, ...change } }))).toThrow(/Form 6198.*original/i);
  }
  for (const duplicate of [{ ...legacyForm }, { currentYearDecreases: "0" }]) {
    expect.soft(() => calculateScheduleE(input({ partII2026, ...duplicate }))).toThrow(/Form 6198.*legacy/i);
  }
  expect.soft(() => calculateScheduleE(input({ partII2026 }, 2026, { atRiskAmount: "1000" }))).toThrow(/Form 6198.*manual/i);
  expect.soft(() => calculateScheduleE(input({ partII2026 }, 2026, { taxYear: undefined }))).toThrow(/Form 6198.*original/i);
  expect.soft(() => calculateScheduleE(input({ partII2026 }, 2025))).toThrow(/Form 6198.*2026/i);
  expect(() => calculateScheduleE(input({ partII2026 }, 2026, { royalties: "1" }))).toThrow(/Form 6198.*ordinary/i);
});

it("suspends the full ordinary loss when actual Part II capacity is exactly zero", () => {
  const canonical = input({ partII2026: { ...partII2026, decreases: "12000.00" } });
  const result = calculateScheduleE(canonical);
  expect.soft(result.partnerships[0].atRiskAmount?.toFixed()).toBe("0");
  expect.soft(result.partnerships[0].nonpassiveLoss.toFixed()).toBe("0");
  expect.soft(result.partnerships[0].suspendedAtRiskLoss.toFixed()).toBe("-6000");
  expect.soft(result.lines.filter(line => line.form === "Form 6198").slice(-4)
    .map(line => [line.line, line.value.toFixed()])).toEqual([
    ["10a", "0"], ["10b", "0"], ["20", "0"], ["21", "0"],
  ]);
  const federal = calculateFederalTax(canonical);
  expect.soft(federal.otherIncome.toFixed()).toBe("0");
  expect(federal.agi.toFixed()).toBe("85000");
});

it("holds negative Part II capacity for separate review before the worksheet floor", () => {
  const canonical = input({ partII2026: { ...partII2026, decreases: "12000.01" } });
  expect.soft(() => calculateScheduleE(canonical)).toThrow(/Form 6198.*Part III.*recapture/i);
  expect(() => calculateFederalTax(canonical)).toThrow(/Form 6198.*Part III.*recapture/i);
});

it("separates original outside-basis and at-risk suspended amounts", () => {
  const canonical = input({ partII2026: { ...partII2026, openingAdjustedBasis: "5000.00", decreases: "2000.00",
    currentOutsideBasis: { reference: "Completed adjusted outside-basis worksheet", availableForLosses: "5000.00" },
  } }, 2026, { beginningBasis: "5000.00" });
  const result = calculateScheduleE(canonical);
  const partnership = result.partnerships[0];
  expect.soft(partnership.basisAdjustedNetAmount.toFixed(2)).toBe("-5000.00");
  expect.soft(partnership.basisResult?.suspendedLossCarryforward.ordinary.toFixed(2)).toBe("1000.00");
  expect.soft(partnership.atRiskAmount?.toFixed(2)).toBe("3000.00");
  expect.soft(partnership.suspendedAtRiskLoss.toFixed(2)).toBe("-2000.00");
  expect.soft(partnership.nonpassiveLoss.toFixed(2)).toBe("-3000.00");
  expect.soft(result.lines.find(line => line.form === "Form 6198" && line.line === "21")?.value.toFixed(2)).toBe("3000.00");
  const federal = calculateFederalTax(canonical);
  expect.soft(federal.otherIncome.toFixed()).toBe("-3000");
  expect(federal.agi.toFixed()).toBe("82000");
});

it("requires matching current outside-basis proof when any ordinary loss is basis-limited", () => {
  const original = { ...partII2026, openingAdjustedBasis: "5000.01", decreases: "2000.00" };
  expect.soft(() => calculateScheduleE(input({ partII2026: original }, 2026, { beginningBasis: "5000.01" })))
    .toThrow(/Form 6198.*current outside.basis/i);
  const proof = { reference: "Completed adjusted outside-basis worksheet", availableForLosses: "5000.00" };
  const mismatched = input({ partII2026: { ...original, currentOutsideBasis: proof } }, 2026, { beginningBasis: "5000.01" });
  expect.soft(() => calculateScheduleE(mismatched)).toThrow(/Form 6198.*current outside.basis/i);
  const matching = input({ partII2026: { ...original, currentOutsideBasis: { ...proof, availableForLosses: "5000.01" } } },
    2026, { beginningBasis: "5000.01" });
  const partnership = calculateScheduleE(matching).partnerships[0];
  expect.soft(partnership.basisResult?.suspendedLossCarryforward.ordinary.toFixed(2)).toBe("999.99");
  expect.soft(partnership.nonpassiveLoss.toFixed(2)).toBe("-3000.01");
  expect.soft(partnership.suspendedAtRiskLoss.toFixed(2)).toBe("-2000.00");
  expect.soft(() => input({ partII2026: { ...partII2026, currentOutsideBasis: { ...proof, reference: "" } } })).toThrow();
  expect(() => calculateScheduleE(input({ partII2026: { ...partII2026, currentOutsideBasis: proof } })))
    .toThrow(/Form 6198.*current outside.basis/i);
});

it("keeps an entirely basis-disallowed loss out of the at-risk carry", () => {
  const canonical = input({ partII2026: { ...partII2026, openingAdjustedBasis: "0", decreases: "0",
    currentOutsideBasis: { reference: "Completed adjusted outside-basis worksheet", availableForLosses: "0" },
  } }, 2026, { beginningBasis: "0" });
  const partnership = calculateScheduleE(canonical).partnerships[0];
  expect.soft(partnership.basisResult?.suspendedLossCarryforward.ordinary.toFixed()).toBe("6000");
  expect.soft(partnership.suspendedAtRiskLoss.toFixed()).toBe("0");
  expect.soft(partnership.nonpassiveLoss.toFixed()).toBe("0");
  expect(calculateFederalTax(canonical).agi.toFixed()).toBe("85000");
});

it("holds duplicate original sources and standalone legacy calculation", () => {
  const canonical = input({ partII2026 });
  const original = canonical.scheduleK1[0];
  const duplicate = TaxYearInputSchema.parse({ ...canonical, scheduleK1: [original,
    { ...original, partnershipEIN: "123456789", taxYear: undefined, form6198: undefined }] });
  expect.soft(() => calculateScheduleE(duplicate)).toThrow(/Form 6198.*single original/i);
  expect.soft(() => calculateScheduleE({ ...canonical, qbiLossSources: { activities: [{ k1SourceId: "scheduleK1:0" }] } }))
    .toThrow(/Form 6198.*competing activity source/i);
  expect(() => calculateForm6198({ activityName: "", partII2026 })).toThrow(/Form 6198.*matching return context/i);
});

it("holds the ambiguous regular 2026 legacy worksheet and preserves 2025", () => {
  const ambiguous = input(legacyForm);
  expect.soft(() => calculateScheduleE(ambiguous)).toThrow(/Form 6198.*original.*Part II/i);
  expect.soft(() => calculateFederalTax(ambiguous)).toThrow(/Form 6198.*original.*Part II/i);
  const historical = calculateScheduleE(input(legacyForm, 2025)).partnerships[0];
  expect(historical.nonpassiveLoss.toFixed()).toBe("0");
  expect(historical.suspendedAtRiskLoss.toFixed()).toBe("-6000");
  const undated = calculateScheduleE(input(legacyForm, 2026, { taxYear: undefined })).partnerships[0];
  expect(undated.suspendedAtRiskLoss.toFixed()).toBe("-6000");
  const unambiguous = calculateScheduleE(input({ ...legacyForm, adjustedBasisAtEffectiveDate: "0", currentYearDecreases: "0" }));
  expect(unambiguous.partnerships[0].nonpassiveLoss.toFixed()).toBe("-4000");
});
