/** Spec: spec/federal/educator-bond-rational-magi.yaml. Literal source-derived controls. */
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateSavingsBondIncomeOwnership } from "@/engine/forms/savings-bond-income-ownership.js";
import { displaySavingsBondRatio } from "@/utils/savings-bond-ratios.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { educatorBondMagiInput, educatorBondThirdsInput } from "../../fixtures/educator-bond-rational-magi.js";

describe("exact educator ownership and Form8815 MAGI", () => {
  it("retains unchanged one-third ownership without rounding the source share", () => {
    const input = educatorBondThirdsInput(), bond = input.savingsBondRedemptions?.[0];
    if (!bond) throw new Error("Missing fictional bond");
    const before = JSON.stringify(input);
    const result = calculateSavingsBondIncomeOwnership(bond);
    expect(result.currentInterest.toFixed()).toBe("1000");
    expect(result.primaryInterest.toFixed(4)).toBe("333.3333");
    expect(result.spouseInterest.toFixed(4)).toBe("666.6667");
    expect(displaySavingsBondRatio(result.primaryInterestRatio)).toBe("1000 / 3 (exact)");
    expect(displaySavingsBondRatio(result.spouseInterestRatio)).toBe("2000 / 3 (exact)");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("calculates bond MAGI before the final educator reduction", () => {
    const input = educatorBondMagiInput(), before = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect(result.form8815?.modifiedAGI.toFixed()).toBe("149850");
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("490");
    expect(result.totalInterest.toFixed()).toBe("10");
    expect(result.adjustmentsToIncome.toFixed()).toBe("110");
    expect(result.agi.toFixed()).toBe("149550");
    expect(JSON.stringify(input)).toBe(before);
    const stale = educatorBondMagiInput(), source = stale.adjustments?.educatorExpenseSources?.[0];
    if (!source) throw new Error("Missing educator source");
    source.excludedSavingsBondInterest = "487";
    expect(() => calculateFederalTax(stale)).toThrow(/reconcile.*educator|calculated.*exclusion/i);
  });
  it("derives exact owner reductions without an entered recurring exclusion", () => {
    const input = educatorBondThirdsInput(), before = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1000");
    expect(result.adjustmentsToIncome.toFixed()).toBe("200");
    expect(result.agi.toFixed()).toBe("79800");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("uses the determined final educator deduction in the earlier IRA worksheet", () => {
    const input = TaxYearInputSchema.parse({ ...educatorBondThirdsInput(), iraDeductionWorksheet: {
      sourceFactsConfirmed: true, spouseContributions: "0",
      primaryContributions: "1000", primaryIsActiveParticipant: true, spouseIsActiveParticipant: false,
      primaryCompensation: "80000", spouseCompensation: "0", primaryRothContributions: "0", spouseRothContributions: "0",
      primarySection501c18Contributions: "0", spouseSection501c18Contributions: "0",
    } });
    const result = calculateFederalTax(input);
    expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("80800");
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe("200");
    expect(result.form8815?.modifiedAGI.toFixed()).toBe("79400");
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1000");
    expect(result.agi.toFixed()).toBe("78800");
  });
  it("requires the actual complete full-exclusion sources and exact optional declarations", () => {
    const missing = educatorBondThirdsInput(); delete missing.form8815;
    expect(() => calculateFederalTax(missing)).toThrow(/actual.*bond|Form8815/i);
    const legacy = educatorBondThirdsInput();
    for (const source of legacy.adjustments?.educatorExpenseSources ?? []) delete source.savingsBondReductionMethod;
    expect(() => calculateFederalTax(legacy)).toThrow(/unknown.*zero|actual.*excludedSavingsBondInterest/i);
    const rounded = educatorBondThirdsInput(), sources = rounded.adjustments?.educatorExpenseSources;
    if (!sources?.[0] || !sources[1]) throw new Error("Missing fictional educators");
    sources[0].excludedSavingsBondInterest = "333.33"; sources[1].excludedSavingsBondInterest = "666.67";
    expect(() => calculateFederalTax(rounded)).toThrow(/exact|rounding|reconcile/i);
    const partial = educatorBondThirdsInput(), w2 = partial.w2s[0];
    if (!w2) throw new Error("Missing original W2");
    w2.wages = "160000";
    expect(() => calculateFederalTax(partial)).toThrow(/full.*exclu|unresolved.*allocation/i);
  });
  it("reports the exact completed owner deduction once and preserves actual zero", () => {
    const input = educatorBondThirdsInput(), bond = input.savingsBondRedemptions?.[0], statement = input.form1099Int[0];
    if (!bond?.incomeOwnership || !statement) throw new Error("Missing fictional original");
    bond.proceeds = "4001"; statement.usSavingsBondInterest = "1001";
    bond.incomeOwnership.taxpayerPurchaseFunds = "1500"; bond.incomeOwnership.spousePurchaseFunds = "1500";
    for (const source of input.adjustments?.educatorExpenseSources ?? []) {
      const receipt = source.expenses?.[0]; if (!receipt) throw new Error("Missing fictional cost"); receipt.amount = "600";
    }
    const result = calculateFederalTax(input);
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1001");
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe("199");
    expect(result.agi.toFixed()).toBe("79801");
    bond.proceeds = "3000"; statement.usSavingsBondInterest = "0";
    expect(calculateFederalTax(input).schedule1?.educatorExpenses.toFixed()).toBe("600");
    delete bond.priorYearInterestReported;
    expect(() => calculateFederalTax(input)).toThrow(/actual|source|prior/i);
  });
  it("keeps actual full-exclusion cents separate from printed bond totals", () => {
    const input = educatorBondThirdsInput(), bond = input.savingsBondRedemptions?.[0], statement = input.form1099Int[0];
    if (!bond || !statement) throw new Error("Missing fictional original");
    bond.proceeds = "4000.50"; statement.usSavingsBondInterest = "1000.50";
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.form8815?.totalInterest.toFixed()).toBe("1001");
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1001");
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe("200");
    expect(result.allLines.find(line => line.form === "Educator education exclusions" && line.line === "primary:bond-exclusion")?.inputs["Exact recipient exclusion"]).toBe("667 / 2 (exact)");
    expect(result.allLines.find(line => line.form === "Educator education exclusions" && line.line === "spouse:bond-exclusion")?.inputs["Exact recipient exclusion"]).toBe("667");
    expect(JSON.stringify(input)).toBe(before);
    const partial = structuredClone(input), expense = partial.form8815?.educationExpenses?.[0];
    if (!expense) throw new Error("Missing actual education expense");
    expense.amountPaid = "4000";
    expect(() => calculateFederalTax(partial)).toThrow(/full|allocation/i);
  });
  it("reconciles raw statement cents before separately reporting Schedule B", () => {
    const input = educatorBondThirdsInput(), bond = input.savingsBondRedemptions?.[0], statement = input.form1099Int[0];
    if (!bond || !statement) throw new Error("Missing fictional original");
    bond.proceeds = "4000.49"; statement.usSavingsBondInterest = "1000.49";
    const result = calculateFederalTax(input);
    expect(result.scheduleB?.interestPayers[0]?.amount.toFixed()).toBe("1000.49");
    expect(result.scheduleB?.totalInterest.toFixed()).toBe("1000");
    expect(result.totalInterest.toFixed()).toBe("0");
    expect(result.schedule1?.educatorExpenses.toFixed()).toBe("200");
    expect(result.agi.toFixed()).toBe("79800");
    statement.usSavingsBondInterest = "1000.48";
    expect(() => calculateFederalTax(input)).toThrow(/statement|Box 3|reconcile/i);
  });
});
