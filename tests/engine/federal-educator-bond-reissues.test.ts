/** Spec: spec/federal/educator-bond-reissue-coordination.yaml. */
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { educatorBondReissueInput, educatorHeldSuccessorInput, educatorSoleSuccessorInput } from "../fixtures/educator-bond-reissues.js";

it("uses actual historical successor interest for both educator owners", () => {
  const input = educatorBondReissueInput(false), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.scheduleB?.previouslyReportedSavingsBondInterest,
    result.schedule1?.educatorExpenses, result.form8815?.modifiedAGI, result.agi].map(value => value?.toFixed()))
    .toEqual(["400", "400", "100", "400", "79800", "79600"]);
  expect(result.allLines.filter(row => row.form === "Educator education exclusions" && row.line.endsWith(":bond-exclusion"))
    .map(row => row.value.toFixed())).toEqual(["250", "150"]);
  expect(JSON.stringify(input)).toBe(before);
});

it("keeps current transfer recognition outside educator reductions after reordering", () => {
  const input = educatorBondReissueInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.totalInterest, result.schedule1?.educatorExpenses, result.form8815?.modifiedAGI, result.agi]
    .map(value => value?.toFixed())).toEqual(["400", "100", "400", "79900", "79700"]);
  expect(result.form8815?.lines.find(row => row.line === "current-reissue-interest")?.value.toFixed()).toBe("100");
  expect(JSON.stringify(input)).toBe(before);
  input.savingsBondRedemptions?.reverse(); input.form8815?.reissueSources?.groups?.[0]?.successors?.reverse();
  const reordered = calculateFederalTax(input);
  expect([reordered.schedule1?.educatorExpenses, reordered.form8815?.excludableSavingsBondInterest, reordered.agi]
    .map(value => value?.toFixed())).toEqual(["400", "400", "79700"]);
});

it("retains exact recurring successor interest without an entered exclusion", () => {
  const input = educatorSoleSuccessorInput(), before = JSON.stringify(input), precision = Decimal.precision;
  const result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.totalInterest,
    result.schedule1?.educatorExpenses, result.form8815?.modifiedAGI, result.agi].map(value => value?.toFixed()))
    .toEqual(["1667", "1667", "333", "233", "81600", "80100"]);
  expect(result.allLines.find(row => row.form === "Educator education exclusions" && row.line === "spouse:bond-exclusion")?.inputs["Exact recipient exclusion"])
    .toBe("5000 / 3 (exact)");
  expect(input.adjustments?.educatorExpenseSources?.map(row => row.excludedSavingsBondInterest)).toEqual([undefined, undefined]);
  expect(JSON.stringify(input)).toBe(before); expect(Decimal.precision).toBe(precision);
});

it("binds the reduced exclusion only to its sole actual successor owner", () => {
  const input = educatorSoleSuccessorInput(true), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.excludableSavingsBondInterest, result.totalInterest, result.schedule1?.educatorExpenses,
    result.form8815?.modifiedAGI, result.agi].map(value => value?.toFixed())).toEqual(["834", "1166", "266", "81600", "80900"]);
  expect(JSON.stringify(input)).toBe(before);
  const source = input.adjustments?.educatorExpenseSources?.[1]; if (!source) throw new Error("Missing fictional educator");
  source.excludedSavingsBondInterest = "833";
  expect(() => calculateFederalTax(input)).toThrow(/reconcile.*educator|calculated.*exclusion/i);
});

it("excludes held successors while retaining taxable current transfers", () => {
  const input = educatorHeldSuccessorInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.totalInterest, result.schedule1?.educatorExpenses, result.form8815?.modifiedAGI, result.agi]
    .map(value => value?.toFixed())).toEqual(["150", "100", "550", "79650", "79550"]);
  expect(result.allLines.filter(row => row.form === "Educator education exclusions" && row.line.endsWith(":bond-exclusion"))
    .map(row => row.value.toFixed())).toEqual(["0", "150"]);
  expect(JSON.stringify(input)).toBe(before);
});

it("rejects missing contradicted and unsupported original sources", () => {
  for (const mode of ["unknown-history", "wrong-owner", "unknown-prior", "duplicate", "rounded", "partial-two-owners"] as const) {
    const input = educatorBondReissueInput(), facts = input.form8815, packet = facts?.reissueSources;
    const group = packet?.groups?.[0], successor = group?.successors?.[0], educator = input.adjustments?.educatorExpenseSources?.[0];
    if (!facts || !packet || !group || !successor || !educator) throw new Error("Missing fictional actual sources");
    if (mode === "unknown-history") packet.sourceFactsConfirmed = undefined;
    if (mode === "wrong-owner" && packet.primary) packet.primary.firstName = "Other";
    if (mode === "unknown-prior") successor.postReissuePriorInterestReported = undefined;
    if (mode === "duplicate") group.successors?.push(structuredClone(successor));
    if (mode === "rounded") educator.excludedSavingsBondInterest = "249.99";
    if (mode === "partial-two-owners" && facts.educationExpenses?.[0]) facts.educationExpenses[0].amountPaid = "500";
    expect(() => calculateFederalTax(input)).toThrow(/source|actual|history|owner|reconcile|full|allocation|duplicate/i);
  }
});
