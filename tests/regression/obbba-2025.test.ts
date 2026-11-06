/**
 * Specs: spec/federal/schedule-a.yaml#5e, spec/federal/form-8812.yaml#12
 * Literal expected values derived from the 2025 IRS worksheets, independently
 * of engine constants. Review status: independent human review pending.
 */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const c = getConstants(2025);
const d = (amount: string) => new Decimal(amount);
const emptyTaxes = { ...simpleW2Fixture, w2s: [], form1098: [] };

describe("2025 SALT independent worksheet fixtures", () => {
  it.each<[FilingStatus, string, string, string]>([
    ["single", "100000", "20000", "20000"],
    ["single", "499999", "60000", "40000"],
    ["single", "500000", "60000", "40000"],
    ["single", "500010", "60000", "39997"],
    ["single", "550000", "60000", "25000"],
    ["single", "600000", "60000", "10000"],
    ["head_of_household", "700000", "60000", "10000"],
    ["qualifying_surviving_spouse", "100000", "50000", "40000"],
    ["married_filing_jointly", "500000", "60000", "40000"],
    ["married_filing_separately", "249999", "30000", "20000"],
    ["married_filing_separately", "250000", "30000", "20000"],
    ["married_filing_separately", "250020", "30000", "19997"],
    ["married_filing_separately", "300000", "30000", "12500"],
    ["married_filing_separately", "350000", "30000", "5000"],
    ["married_filing_separately", "400000", "4500", "4500"],
    ["single", "-500", "0", "0"],
    ["single", "100000", "12345.49", "12345"],
    ["single", "100000", "12345.50", "12346"],
  ])("%s MAGI %s paid %s allows %s", (status, agi, taxes, expected) => {
    const result = calculateScheduleA(emptyTaxes, d(agi), status, c, { personalPropertyTaxes: d(taxes) });
    expect(result.saltDeduction.toFixed(0)).toBe(expected);
  });

  it("adds foreign exclusions and housing deduction back before phase-down", () => {
    const result = calculateScheduleA(emptyTaxes, d("450000"), "single", c, {
      personalPropertyTaxes: d("60000"), saltMagiAdditions: d("100000"),
    });
    expect(result.saltDeduction.toString()).toBe("25000");
  });
});

it("2025 SALT audit follows the published line numbers", () => {
  const input = { ...simpleW2Fixture, w2s: simpleW2Fixture.w2s.map((w2) => ({ ...w2, stateTaxWithheld: "2000", localTaxWithheld: "610" })), form1098: [{
    lender: "Synthetic lender", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0", pointsPaid: "0", mortgageInterestReceived: "0",
    outstandingMortgagePrincipal: "0", propertyTax: "9000",
  }] };
  const result = calculateScheduleA(input, d("100000"), "single", c, { personalPropertyTaxes: d("11000") });
  const line = (id: string) => result.lines.find((entry) => entry.line === id)?.value.toString();
  expect(line("5b")).toBe("9000");
  expect(line("5c")).toBe("11000");
  expect(line("5d")).toBe("22610");
  expect(line("5e")).toBe("22610");
});

describe("2025 CTC independent worksheet fixtures", () => {
  it.each([
    ["100000", 1, 0, "2200"],
    ["200000", 1, 0, "2200"],
    ["200001", 1, 0, "2150"],
    ["201000", 1, 0, "2150"],
    ["201001", 1, 0, "2100"],
    ["240000", 1, 0, "200"],
    ["244000", 1, 0, "0"],
    ["100000", 2, 1, "4900"],
    ["100000", 0, 1, "500"],
  ] as const)("AGI %s, %i children, %i other dependents yields %s", (agi, qualifyingChildren, otherDependents, expected) => {
    const result = calculateForm8812({ qualifyingChildren, otherDependents, agi: d(agi),
      earnedIncome: d(agi), taxLiability: d("10000"), filingStatus: "single" }, c);
    expect(result.ctcBeforeLimitation.toString()).toBe(expected);
    expect(result.nonrefundableCTC.toString()).toBe(expected);
  });

  it("retains the separate $1,700 ACTC cap", () => {
    const result = calculateForm8812({ qualifyingChildren: 1, otherDependents: 0,
      agi: d("20000"), earnedIncome: d("20000"), taxLiability: d("0"), filingStatus: "single" }, c);
    expect(result.ctcBeforeLimitation.toString()).toBe("2200");
    expect(result.actc.toString()).toBe("1700");
  });
});
