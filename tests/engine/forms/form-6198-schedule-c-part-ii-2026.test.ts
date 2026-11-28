import Decimal from "decimal.js";
import { expect, it, vi } from "vitest";
import { calculateForm6198ScheduleCPartII2026 } from "@/engine/forms/form-6198-schedule-c-part-ii-2026.js";
import { calculateFederalTax } from "@/engine/public-federal-return.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { ordinaryExpenseSources, scheduleCSourceFixture } from "../../fixtures/schedule-c-source-facts.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// Exercise the calculation independently of the incomplete public 2026 rule pack.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

// Spec: spec/federal/2026/form-6198-schedule-c-part-ii.yaml.
const context = {
  taxYear: 2026,
  primaryOwner: { firstName: "Avery", lastName: "Source", ssn: "900-11-4321" },
  business: {
    accountHolder: "primary", activityDescription: "Equipment repair",
    originalScheduleCReference: "2026 repair business return workpaper",
    materiallyParticipated: true, allInvestmentAtRisk: false,
  },
} as const;

const original = {
  taxYear: 2026,
  accountHolder: "primary",
  primaryOwnerName: "Avery Source",
  primaryOwnerTaxpayerIdLast4: "4321",
  activityDescription: "Equipment repair",
  originalScheduleCReference: "2026 repair business return workpaper",
  continuingDomesticSoleProprietorshipConfirmed: true,
  oneOrdinaryScheduleCLossOnlyConfirmed: true,
  noPriorAtRiskLossOrRecaptureConfirmed: true,
  completePartIIOriginalsConfirmed: true,
  currentOrdinaryLoss: "-6000.57",
  openingBasisReference: "Opening fixed-asset basis ledger before activity liabilities",
  openingAdjustedAssetBasisBeforeLiabilities: "12000.12",
  increasesReference: "Current capital contributions ledger",
  increases: "300.30",
  decreasesReference: "Current withdrawals and nonrecourse opening-basis reconciliation",
  decreases: "8300.10",
} as const;

const actualLoss = new Decimal("-6000.57");

it("returns the signed allowed loss and current suspension with an exact line audit", () => {
  const result = calculateForm6198ScheduleCPartII2026(original, actualLoss, context);
  expect(result.allowedLoss.toFixed()).toBe("-4000.32");
  expect(result.currentSuspendedLoss.toFixed()).toBe("2000.25");
  expect(result.atRiskAmount.toFixed()).toBe("4000.32");
  expect(result.lines.map(({ line, value }) => [line, value.toFixed()])).toEqual([
    ["1", "-6000.57"], ["5", "-6000.57"], ["6", "12000.12"], ["7", "300.3"], ["8", "12300.42"],
    ["9", "8300.1"], ["10a", "4000.32"], ["10b", "4000.32"], ["20", "4000.32"], ["21", "-4000.32"],
  ]);
  const audit = JSON.stringify(result.lines);
  expect(audit).not.toContain(original.primaryOwnerName);
  expect(audit).not.toContain(original.primaryOwnerTaxpayerIdLast4);
  expect(audit).not.toContain(original.originalScheduleCReference);
});

it("admits an entirely covered loss without creating a suspension", () => {
  const result = calculateForm6198ScheduleCPartII2026({ ...original, decreases: "0" }, actualLoss, context);
  expect(result.allowedLoss.toFixed()).toBe("-6000.57");
  expect(result.currentSuspendedLoss.toFixed()).toBe("0");
});

it("distinguishes exact zero capacity from a one-cent negative amount", () => {
  const boundary = { ...original, openingAdjustedAssetBasisBeforeLiabilities: "100000000000000000000", increases: "0.01" };
  const zero = calculateForm6198ScheduleCPartII2026({ ...boundary, decreases: "100000000000000000000.01" }, actualLoss, context);
  expect(zero.atRiskAmount.toFixed()).toBe("0");
  expect(zero.allowedLoss.toFixed()).toBe("0");
  expect(zero.currentSuspendedLoss.toFixed()).toBe("6000.57");
  expect(zero.lines.find(row => row.line === "21")?.value.toFixed()).toBe("0");
  const positive = calculateForm6198ScheduleCPartII2026({ ...boundary, decreases: "100000000000000000000" }, actualLoss, context);
  expect(positive.allowedLoss.toFixed()).toBe("-0.01");
  expect(positive.currentSuspendedLoss.toFixed()).toBe("6000.56");
  expect(() => calculateForm6198ScheduleCPartII2026({ ...boundary, decreases: "100000000000000000000.02" }, actualLoss, context))
    .toThrow(/negative.*Part III.*recapture/i);
});

it("requires the same 2026 primary owner, business and exact Schedule C loss", () => {
  const factError = /primary owner.*Schedule C activity.*loss/i;
  const check = (facts: unknown, loss = actualLoss, current = context) =>
    expect(() => calculateForm6198ScheduleCPartII2026(facts, loss, current)).toThrow(factError);
  check({ ...original, primaryOwnerName: "Avery Different" });
  check({ ...original, primaryOwnerTaxpayerIdLast4: "4322" });
  check({ ...original, originalScheduleCReference: "Other workpaper" });
  check({ ...original, activityDescription: "Other activity" });
  check({ ...original, currentOrdinaryLoss: "-6000.56" });
  check({ ...original, currentOrdinaryLoss: "-0" }, new Decimal(0));
  const normalized = { ...original, primaryOwnerName: "AVERY  SOURCE", activityDescription: " Equipment   REPAIR " };
  expect(calculateForm6198ScheduleCPartII2026(normalized, actualLoss, context).allowedLoss.toFixed()).toBe("-4000.32");

  expect(() => calculateForm6198ScheduleCPartII2026(original, actualLoss, { ...context, taxYear: 2025 })).toThrow(/2026/);
  for (const business of [
    { ...context.business, accountHolder: "spouse" as const },
    { ...context.business, materiallyParticipated: false },
    { ...context.business, allInvestmentAtRisk: true },
    { ...context.business, originalScheduleCReference: undefined },
    { ...context.business, activityDescription: undefined },
  ]) {
    expect(() => calculateForm6198ScheduleCPartII2026(original, actualLoss, { ...context, business })).toThrow(factError);
  }
});

it("requires original line references and explicit known amounts and exclusions", () => {
  const incomplete = [
    { ...original, accountHolder: "spouse" }, { ...original, taxYear: 2025 },
    { ...original, openingAdjustedAssetBasisBeforeLiabilities: undefined },
    { ...original, increases: "" }, { ...original, decreases: "-1" },
    { ...original, openingBasisReference: "  " }, { ...original, increasesReference: undefined },
    { ...original, decreasesReference: "" },
    { ...original, continuingDomesticSoleProprietorshipConfirmed: false },
    { ...original, oneOrdinaryScheduleCLossOnlyConfirmed: false },
    { ...original, noPriorAtRiskLossOrRecaptureConfirmed: false },
    { ...original, completePartIIOriginalsConfirmed: false },
    { ...original, partIII: { previousLoss: "0" } },
  ];
  for (const source of incomplete) {
    expect(() => calculateForm6198ScheduleCPartII2026(source, actualLoss, context)).toThrow(/complete original Part II/i);
  }
});

function canonicalSource() {
  const fixture = scheduleCSourceFixture(2026);
  return {
    ...fixture,
    taxpayer: { ...fixture.taxpayer, primary: { ...fixture.taxpayer.primary, ssn: context.primaryOwner.ssn } },
    w2s: simpleW2Fixture.w2s.map(w2 => ({ ...w2, socialSecurityTips: "0" })),
    scheduleC: {
      ...fixture.scheduleC!, grossReceipts: "1000", expenses: { bankCharges: "7000.57", otherExpenses: "0" },
      principalBusinessActivity: original.activityDescription, qbiMateriallyParticipated: true, allInvestmentAtRisk: false,
      form6198PartII2026: original,
      sourceFacts: {
        ...fixture.scheduleC?.sourceFacts, sourceReference: original.originalScheduleCReference, interest: undefined,
        ordinaryExpenses: {
          ...ordinaryExpenseSources, remainingOtherExpenses: "0",
          rows: [{ category: "bankCharges", amount: "7000.57", sourceReference: "Original current expense record", sourceFactsConfirmed: true }],
        },
      },
    },
  };
}

it("keeps original and allowed losses distinct in canonical Schedule C", () => {
  const input = TaxYearInputSchema.parse(canonicalSource());
  const result = calculateScheduleC(input);
  expect(input.scheduleC?.form6198PartII2026).toEqual(original);
  expect(result.tentativeProfit.toFixed()).toBe("-6000.57");
  expect(result.netProfit.toFixed()).toBe("-4000.32");
  expect(result.form6198PartII2026?.currentSuspendedLoss.toFixed()).toBe("2000.25");
  expect(result.lines.find(row => row.form === "Form 6198" && row.line === "5")?.value.toFixed()).toBe("-6000.57");
  expect(result.lines.filter(row => row.form === "Sched C" && row.line === "31").map(row => row.value.toFixed())).toEqual(["-4000.32"]);
});

it("uses the exact allowed Schedule C loss once in federal income", () => {
  const input = TaxYearInputSchema.parse(canonicalSource());
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe("80999.68");
  expect(result.scheduleC.netProfit.toFixed()).toBe("-4000.32");
  expect(result.scheduleC.form6198PartII2026?.currentSuspendedLoss.toFixed()).toBe("2000.25");
});

it("suspends the full canonical loss when the original proves zero capacity", () => {
  const raw = canonicalSource();
  const result = calculateScheduleC(TaxYearInputSchema.parse({
    ...raw, scheduleC: { ...raw.scheduleC, form6198PartII2026: { ...original, decreases: "12300.42" } },
  }));
  expect(result.netProfit.toFixed()).toBe("0");
  expect(result.form6198PartII2026?.currentSuspendedLoss.toFixed()).toBe("6000.57");
});

it("holds incompatible receipt statements without posting a second receipt", () => {
  const raw = canonicalSource();
  const statement = { payer: "Synthetic client", taxYear: 2026, accountHolder: "primary", nonemployeeCompensation: "1000" } as const;
  const valid = TaxYearInputSchema.parse({ ...raw, form1099Nec: [statement] });
  expect(calculateScheduleC(valid).netProfit.toFixed()).toBe("-4000.32");
  for (const contradictory of [
    { ...statement, accountHolder: "spouse" },
    { ...statement, taxYear: undefined },
    { ...statement, nonemployeeCompensation: "1000.01" },
  ]) {
    expect(() => calculateScheduleC(TaxYearInputSchema.parse({ ...raw, form1099Nec: [contradictory] })))
      .toThrow(/separate Schedule C allocation/i);
  }
  const settlement = { pse: "Synthetic payment platform", taxYear: 2026, accountHolder: "primary", grossAmount: "1000" };
  expect(() => calculateScheduleC(TaxYearInputSchema.parse({ ...raw, form1099K: [settlement] }))).toThrow(/separate Schedule C allocation/i);
});

it("holds missing or conflicting canonical original provenance and special allocations", () => {
  const raw = canonicalSource();
  const { scheduleC } = raw;
  const input = TaxYearInputSchema.parse(raw);
  const run = (business: Omit<typeof scheduleC, "sourceFacts"> & { sourceFacts?: typeof scheduleC.sourceFacts }) =>
    calculateScheduleC(TaxYearInputSchema.parse({ ...raw, scheduleC: business }));
  expect(() => run({ ...scheduleC, sourceFacts: undefined })).toThrow(/requires verified ordinary Schedule C source/i);
  expect(() => run({ ...scheduleC, sourceFacts: { ...scheduleC.sourceFacts, sourceReference: "Contradictory original" } })).toThrow(/primary owner.*Schedule C activity.*loss/i);
  expect(() => run({ ...scheduleC, principalBusinessActivity: "Other activity" })).toThrow(/primary owner.*Schedule C activity.*loss/i);
  expect(() => run({ ...scheduleC, qbiMateriallyParticipated: false })).toThrow(/primary owner.*Schedule C activity.*loss/i);
  expect(() => run({ ...scheduleC, allInvestmentAtRisk: true })).toThrow(/primary owner.*Schedule C activity.*loss/i);
  expect(() => run({ ...scheduleC, grossReceipts: "8000" })).toThrow(/primary owner.*Schedule C activity.*loss/i);
  expect(() => calculateScheduleC(input, { ...input.scheduleC, form6198PartII2026: undefined })).toThrow(/retained canonical Schedule C/i);
  expect(() => calculateScheduleC(TaxYearInputSchema.parse({ ...raw, form4562: { taxYear: 2026, otherDepreciation: "1" } })))
    .toThrow(/separate Schedule C allocation/i);
  expect(TaxYearInputSchema.safeParse({ ...raw, taxpayer: { ...raw.taxpayer, taxYear: 2025 } }).success).toBe(false);
});
