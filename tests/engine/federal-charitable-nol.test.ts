// Spec: spec/federal/charitable-net-operating-loss.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { charitableNolInput } from "../fixtures/charitable-nol.js";

it("reduces current charity carry by the separately refigured succeeding NOL carry increase", () => {
  for (const twoVintages of [false, true]) {
    const input = charitableNolInput();
    const first = input.netOperatingLoss?.vintages?.[0];
    if (!first || !input.netOperatingLoss?.vintages) throw new Error("Missing synthetic loss");
    if (twoVintages) input.netOperatingLoss.vintages.push({ ...first, sourceId: "loss2022", lossTaxYear: 2022 });
    const result = calculateFederalTax(input);
    expect(result.nolDeduction.toFixed()).toBe("32000");
    expect(result.agi.toFixed()).toBe("68000");
    expect(result.deductionAmount.toFixed()).toBe("40800");
    expect(result.carryforwards.nolCarryforward.toFixed()).toBe(twoVintages ? "148800" : "68000");
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(twoVintages ? "13824" : "3840");
    expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
      .toEqual([[2025, "cash_60", twoVintages ? "13824" : "3840"]]);
    expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe("19200");
    expect(result.carryforwards.amtCharitableContributionsByYear?.map(row => [row.taxYear, row.category, row.amount.toFixed()]))
      .toEqual([[2025, "cash_60", "19200"]]);
    const charity = result.netOperatingLoss?.charitableCarryover;
    expect(charity?.tentativeCarryforward.toFixed()).toBe("19200");
    expect(charity?.counterfactualNolCarryforward.toFixed()).toBe(twoVintages ? "143424" : "52640");
    expect(charity?.reduction.toFixed()).toBe(twoVintages ? "5376" : "15360");
    if (twoVintages) {
      expect(result.netOperatingLoss?.modifiedVintageIncome.map(row => [row.income.agi.toFixed(), row.income.charitableDeduction.toFixed(), row.income.taxableIncome.toFixed()]))
        .toEqual([["100000", "60000", "40000"], ["68000", "40800", "27200"]]);
    }
    expect(result.allLines.filter(row => row.form === "Section170 NOL Carry Worksheet" && row.line === "remaining")).toHaveLength(1);
  }
});
it("recomputes deduction choice and does not exchange an expiring NOL for charity carry", () => {
  for (const [year, election, expectedCharity, expectedNol, expectedExpired] of [
    [2017, "automatic", "15750", "30000", "0"],
    [2017, "itemized", "0", "30000", "0"],
    [2005, "itemized", "30000", "0", "30000"],
  ] as const) {
    const input = charitableNolInput("50000", "30000");
    const vintage = input.netOperatingLoss?.vintages?.[0];
    if (!vintage) throw new Error("Missing synthetic loss");
    Object.assign(vintage, { lossTaxYear: year, originalLoss: "50000", openingCarryforward: "50000", carrybackTreatment: "waived", carrybackSourceReference: "Actual waiver" });
    input.deductionElection = election;
    const result = calculateFederalTax(input);
    expect(result.nolDeduction.toFixed()).toBe("50000");
    expect(result.netOperatingLoss?.absorbed.toFixed()).toBe("20000");
    expect(result.netOperatingLoss?.expired.toFixed()).toBe(expectedExpired);
    expect(result.carryforwards.nolCarryforward.toFixed()).toBe(expectedNol);
    expect(result.carryforwards.charitableContributions.toFixed()).toBe(expectedCharity);
  }
});
it("reapplies the isolated2026 floor to the nonexcess source contribution", () => {
  const input = charitableNolInput("100000", "60000", 2026); input.deductionElection = "itemized";
  const result = calculateFederalTax(input);
  expect(result.nolDeduction.toFixed()).toBe("32400");
  expect(result.agi.toFixed()).toBe("67600");
  expect(result.deductionAmount.toFixed()).toBe("40222");
  expect(result.netOperatingLoss?.charitableCarryover?.tentativeCarryforward.toFixed()).toBe("19778");
  expect(result.netOperatingLoss?.charitableCarryover?.counterfactualNolCarryforward.toFixed()).toBe("51778");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("67600");
  expect(result.carryforwards.charitableContributions.toFixed()).toBe("3956");
});
it("preserves original cents and requires actual current public-cash carry sources", () => {
  const cents = charitableNolInput("100000", "60000.49"); const before = JSON.stringify(cents);
  const result = calculateFederalTax(cents);
  expect(JSON.stringify(cents)).toBe(before);
  expect(result.netOperatingLoss?.charitableCarryover?.sourceContributions.toFixed()).toBe("60000.49");
  expect(result.carryforwards.charitableContributions.toFixed()).toBe("3840");
  const unknown = charitableNolInput(); unknown.donations[0].qualifiedOrganization = undefined;
  expect(() => calculateFederalTax(unknown)).toThrow(/charitable.*qualification/i);
  const prior = charitableNolInput();
  if (!prior.priorYear) throw new Error("Missing synthetic prior source");
  prior.priorYear.charitableCarryforward = "1000";
  expect(() => calculateFederalTax(prior)).toThrow(/prior.*charit|charit.*prior/i);
  const property = charitableNolInput(); property.donations[0].type = "property";
  property.donations[0].isLongTermCapitalGain = false; property.donations[0].costBasis = property.donations[0].amount;
  expect(() => calculateFederalTax(property)).toThrow(/independent prior regular and alternative charitable histories/i);
  const amt = charitableNolInput();
  if (!amt.netOperatingLoss?.alternativeTax || !amt.netOperatingLoss.vintages?.[0]) throw new Error("Missing synthetic loss");
  amt.netOperatingLoss.alternativeTax.vintages = [{ ...amt.netOperatingLoss.vintages[0], section1411OriginalLoss: undefined }];
  expect(() => calculateFederalTax(amt)).toThrow(/AMT.*charit|charit.*AMT/i);
  const unknownAmt = charitableNolInput();
  if (!unknownAmt.netOperatingLoss?.alternativeTax) throw new Error("Missing synthetic alternative source");
  unknownAmt.netOperatingLoss.alternativeTax.vintages = undefined;
  expect(() => calculateFederalTax(unknownAmt)).toThrow(/separate actual complete AMT/i);
  const standard2026 = charitableNolInput("100000", "60000", 2026); standard2026.deductionElection = "standard";
  expect(() => calculateFederalTax(standard2026)).toThrow(/nonitemized charitable carry/i);
});
it("excludes known ineligible receipts from current charitable NOL coordination", () => {
  const input = charitableNolInput();
  input.donations.push({ ...input.donations[0], organization: "Synthetic nonqualified recipient", amount: "1000.10", qualifiedOrganization: false });
  const original = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.netOperatingLoss?.charitableCarryover?.sourceContributions.toString()).toBe("60000");
  expect(result.carryforwards.charitableContributions.toString()).toBe("3840");
  expect(JSON.stringify(input)).toBe(original);
});
