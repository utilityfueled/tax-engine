// Spec: spec/federal/marketplace-health-owner-income.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";

it("applies zero-advance2025 owner limits to the joint credit and separate QBI", () => {
  for (const [profit, maximum, deduction, agi, credit, primaryQbi, spouseQbi] of [
    ["1000", "3929", "1488", "45908", "7041", "929", "559"],
    ["5000", "7646", "1678", "49435", "6601", "1119", "559"],
  ]) {
    const input = twoOwnerMarketplaceHealthInput();
    if (!input.scheduleC || !input.scheduleF) throw new Error("Missing actual synthetic businesses");
    input.scheduleC.grossReceipts = profit; input.scheduleF.salesOfProductsRaised = "50000";
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe(maximum);
    expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("7322");
    expect(result.schedule1?.seHealthInsurance.toFixed()).toBe(deduction);
    expect(result.agi.toFixed()).toBe(agi);
    expect(result.form8962?.ptcAllowed.toFixed()).toBe(credit);
    const qbi = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC", "scheduleF"].includes(row.line));
    expect(qbi.map(row => row.inputs["SE health insurance"].toString())).toEqual([primaryQbi, spouseQbi]);
    expect(result.allLines.filter(row => row.form === "Form 8962" && row.line === "24")).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it("recomputes limited owners after the actual ordered spouse IRA", () => {
  const input = twoOwnerMarketplaceHealthInput();
  if (!input.scheduleC || !input.scheduleF) throw new Error("Missing actual synthetic businesses");
  input.scheduleC.grossReceipts = "1000"; input.scheduleF.salesOfProductsRaised = "50000";
  input.iraDeductionWorksheet = { primaryContributions: "0", primaryIsActiveParticipant: false, primaryCompensation: "929",
    spouseContributions: "7000", spouseIsActiveParticipant: true, spouseCompensation: "46467",
    primarySection501c18Contributions: "0", primaryRothContributions: "0", spouseSection501c18Contributions: "0", spouseRothContributions: "0", sourceFactsConfirmed: true };
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("45908");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("7000");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("7992");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1008");
  expect(result.agi.toFixed()).toBe("39388");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("7738");
  const owner = result.allLines.filter(row => row.form === "Pub974 Owner Allocation" && row.line.endsWith(":deduction"));
  expect(owner.map(row => row.value.toDecimalPlaces(2).toFixed())).toEqual(["672", "336"]);
  expect(result.allLines.filter(row => row.form === "Pub974 Ordered Deductions" && row.line === "ira")).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
});
