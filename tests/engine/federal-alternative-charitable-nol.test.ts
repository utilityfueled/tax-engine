// Spec: spec/federal/alternative-charitable-net-operating-loss.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { alternativeCharitableNolInput } from "../fixtures/alternative-charitable-nol.js";

it("keeps regular AGI and independently calculates positive AMT charitable carry", () => {
  const input = alternativeCharitableNolInput(2025, true); const original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(JSON.stringify(input)).toBe(original);
  expect([result.nolDeduction, result.agi, result.deductionAmount].map(value => value.toFixed()))
    .toEqual(["32000", "68000", "40800"]);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe("3840");
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe("19200");
  const amt = result.netOperatingLoss?.alternativeTax;
  expect([amt?.amtiBeforeAtnol, amt?.modifiedAmtiBeforeAtnol, amt?.deduction, amt?.absorbed, amt?.carryforward]
    .map(value => value?.toFixed())).toEqual(["59200", "59200", "53280", "53280", "46720"]);
  const charity = result.netOperatingLoss?.alternativeCharitableCarryover;
  expect([charity?.nonexcessContributions, charity?.counterfactualNolCarryforward, charity?.reduction, charity?.carryforward]
    .map(value => value?.toFixed())).toEqual(["40800", "46720", "0", "19200"]);
});

it("refigures only alternative carry absorption when no regular loss remains", () => {
  const input = alternativeCharitableNolInput(); const original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(JSON.stringify(input)).toBe(original);
  expect([result.nolDeduction, result.agi, result.deductionAmount].map(value => value.toFixed())).toEqual(["0", "97000", "58200"]);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe("1800");
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe("180");
  expect(result.carryforwards.amtCharitableContributionsByYear?.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
    .toEqual([[2025, "cash_60", "180"]]);
  const amt = result.netOperatingLoss?.alternativeTax;
  expect([amt?.amtiBeforeAtnol, amt?.modifiedAmtiBeforeAtnol, amt?.deduction, amt?.absorbed, amt?.carryforward]
    .map(value => value?.toFixed())).toEqual(["38800", "40000", "34920", "36000", "64000"]);
  const comparison = result.netOperatingLoss?.alternativeCharitableCounterfactual;
  expect([comparison?.income.amti, comparison?.calculation.deduction, comparison?.calculation.absorbed,
    comparison?.calculation.carryforward].map(value => value?.toFixed())).toEqual(["41800", "34920", "37620", "62380"]);
  expect(result.allLines.filter(row => row.form === "Section170 Alternative NOL Carry Worksheet" && row.line === "remaining")).toHaveLength(1);
});

it("does not reduce charity for an alternative loss that expires this year", () => {
  const input = alternativeCharitableNolInput();
  const vintage = input.netOperatingLoss?.alternativeTax?.vintages?.[0];
  if (!vintage) throw new Error("Missing synthetic alternative loss");
  Object.assign(vintage, { lossTaxYear: 2005, carrybackTreatment: "waived", carrybackSourceReference: "Actual filed waiver" });
  const result = calculateFederalTax(input); const amt = result.netOperatingLoss?.alternativeTax;
  expect([amt?.deduction, amt?.absorbed, amt?.expired, amt?.carryforward].map(value => value?.toFixed()))
    .toEqual(["34920", "36000", "64000", "0"]);
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe("1800");
  const comparison = result.netOperatingLoss?.alternativeCharitableCounterfactual?.calculation;
  expect([comparison?.absorbed, comparison?.expired, comparison?.carryforward].map(value => value?.toFixed()))
    .toEqual(["37620", "62380", "0"]);
});

it("reapplies the isolated2026 floor without replacing the actual AMT deduction", () => {
  const result = calculateFederalTax(alternativeCharitableNolInput(2026));
  expect([result.agi, result.deductionAmount].map(value => value.toFixed())).toEqual(["97000", "57715"]);
  expect(result.carryforwards.charitableContributions.toFixed()).toBe("2285");
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe("228");
  const amt = result.netOperatingLoss?.alternativeTax;
  expect([amt?.amtiBeforeAtnol, amt?.modifiedAmtiBeforeAtnol, amt?.deduction, amt?.absorbed, amt?.carryforward]
    .map(value => value?.toFixed())).toEqual(["39285", "40500", "35357", "36450", "63550"]);
  const comparison = result.netOperatingLoss?.alternativeCharitableCounterfactual;
  expect([comparison?.income.amti, comparison?.calculation.deduction, comparison?.calculation.absorbed,
    comparison?.calculation.carryforward].map(value => value?.toFixed())).toEqual(["42785", "35357", "38507", "61493"]);
});

it("requires independent prior charity histories and preserves unknown source facts", () => {
  const input = alternativeCharitableNolInput();
  const parsed = TaxYearInputSchema.parse(input);
  expect(parsed.netOperatingLoss?.alternativeTax).toHaveProperty("charitableCarryoverHistory.priorRegularCarryovers", []);
  expect(parsed.netOperatingLoss?.alternativeTax).toHaveProperty("charitableCarryoverHistory.priorAlternativeCarryovers", []);
  for (const patch of [undefined, {}, { sourceTaxYear: 2023 }, { sourceFactsConfirmed: false },
    { priorRegularCarryovers: undefined }, { priorAlternativeCarryovers: undefined },
    { priorAlternativeCarryovers: [{ taxYear: 2024, category: "cash_60", amount: "100", sourceReference: "Actual prior AMT carry" }] }]) {
    const changed = alternativeCharitableNolInput(); const alt = changed.netOperatingLoss?.alternativeTax;
    if (!alt) throw new Error("Missing synthetic history");
    const original = "charitableCarryoverHistory" in alt ? alt.charitableCarryoverHistory : undefined;
    Object.assign(alt, { charitableCarryoverHistory: patch === undefined || Object.keys(patch).length === 0 ? patch : { ...original, ...patch } });
    expect(() => calculateFederalTax(changed)).toThrow(/charit.*histor|histor.*charit/i);
  }
});
