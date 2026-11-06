// Specs: spec/federal/schedule-h.yaml and spec/federal/2026/schedule-h.yaml
import { describe, expect, it } from "vitest";
import { calculateScheduleH } from "@/engine/forms/schedule-h.js";
import { getConstants } from "@/models/constants.js";
import Decimal from "decimal.js";
import { ScheduleHSchema } from "@/models/inputs.js";

const employee = { name: "Actual Employee", cashWages: "0", federalIncomeTaxWithheld: "0", isSpouse: false, isChildUnder21: false, isParent: false, isUnder18NonPrincipal: false };
// Official Publication 926 (2026) values; whole-return 2026 readiness stays closed.
const constants = { ...getConstants(2025).householdEmployment, cashWageThreshold: new Decimal(3000), socialSecurityWageBase: new Decimal(184500) };
const period = { state: "OH", periodStart: "2026-01-01", periodEnd: "2026-12-31", taxableWages: "7000", experienceRate: "0.03", contributionsPaidTimely: "210" };

describe("Schedule H independent tax bases", () => {
  it("retains FUTA and withholding below the Social Security wage threshold", () => {
    const result = calculateScheduleH({ employees: [{ ...employee, cashWages: "1000.01", federalIncomeTaxWithheld: "100.01" }, { ...employee, name: "Second Employee", cashWages: "999.99" }], futaApplies: true, futaSectionA: true, constants });
    expect(result.line1.toFixed(2)).toBe("0.00");
    expect(result.line7.toFixed(2)).toBe("100.01");
    expect(result.futaTax.toFixed(2)).toBe("12.00");
    expect(result.totalTax.toFixed(2)).toBe("112.01");
  });
  it("keeps an unrelated minor in the FUTA base and all actual withholding", () => {
    const result = calculateScheduleH({ employees: [{ ...employee, cashWages: "5000", isUnder18NonPrincipal: true, federalIncomeTaxWithheld: "20" }, { ...employee, name: "Spouse", cashWages: "10000", isSpouse: true, federalIncomeTaxWithheld: "100" }], futaApplies: true, futaSectionA: true, constants });
    expect(result.line1.toFixed()).toBe("0");
    expect(result.line7.toFixed()).toBe("120");
    expect(result.futaTax.toFixed()).toBe("30");
  });
  it("taxes qualifying parent childcare wages while retaining the FUTA exemption", () => {
    const result = calculateScheduleH({ employees: [{ ...employee, cashWages: "10000", isParent: true, parentCareExceptionApplies: true }], futaApplies: true, futaSectionA: true, constants });
    expect(result.line2.toFixed()).toBe("1240");
    expect(result.line4.toFixed()).toBe("290");
    expect(result.futaTax.toFixed()).toBe("0");
    expect(() => calculateScheduleH({ employees: [{ ...employee, cashWages: "10000", isParent: true }], futaApplies: false, futaSectionA: true, constants })).toThrow(/parent/i);
  });
  it("matches the IRS 2026 Mary Brown payroll example", () => {
    const result = calculateScheduleH({ employees: [{ ...employee, cashWages: "3360" }], futaApplies: false, futaSectionA: true, constants });
    expect(result.line2.toFixed(2)).toBe("416.64");
    expect(result.line4.toFixed(2)).toBe("97.44");
    expect(result.line7.toFixed()).toBe("0");
    expect(result.totalTax.toFixed(2)).toBe("514.08");
  });
  it("applies additional experience-rate credit and the late contribution worksheet", () => {
    const input = { employees: [{ ...employee, cashWages: "7000" }], futaApplies: true, futaSectionA: false, constants, futaStatePeriods: [period], stateUnemploymentContributionsPaidLate: "0", futaCreditReduction: "0" };
    expect(calculateScheduleH(input).futaTax.toFixed()).toBe("42"); // Additional168 + paid210 = max378; gross420.
    const late = calculateScheduleH({ ...input, futaStatePeriods: [{ ...period, contributionsPaidTimely: "0" }], stateUnemploymentContributionsPaidLate: "210" });
    expect(late.futaTax.toFixed()).toBe("63"); // 420-(168+.90*210).
    expect(calculateScheduleH({ ...input, futaCreditReduction: "84" }).futaTax.toFixed()).toBe("126");
  });
  it("rejects an ambiguous legacy credit aggregate and unknown FUTA or employee facts", () => {
    expect(() => calculateScheduleH({ employees: [employee], futaApplies: true, futaSectionA: false, constants, stateUnemploymentContributions: "100" })).toThrow(/period|Section B/i);
    expect(() => calculateScheduleH({ employees: [employee], futaApplies: undefined, futaSectionA: true, constants })).toThrow(/FUTA/i);
    expect(() => calculateScheduleH({ employees: [{ ...employee, isSpouse: undefined }], futaApplies: false, futaSectionA: true, constants })).toThrow(/employee|exclusion/i);
  });
  it("keeps omitted schema eligibility answers unknown", () => {
    const parsed = ScheduleHSchema.parse({ employees: [{ cashWages: "0" }] });
    expect(parsed.futaApplies).toBeUndefined();
    expect(parsed.futaSectionA).toBeUndefined();
    expect(parsed.employees[0].isSpouse).toBeUndefined();
    expect(parsed.futaCreditReduction).toBeUndefined();
  });
  it("validates actual periods and caps late and reduction credits", () => {
    const input = { taxYear: 2026, employees: [{ ...employee, cashWages: "7000" }], futaApplies: true, futaSectionA: false, constants, futaStatePeriods: [{ ...period, experienceRate: null, contributionsPaidTimely: "0" }], stateUnemploymentContributionsPaidLate: "999", futaCreditReduction: "0" };
    expect(calculateScheduleH(input).futaTax.toFixed(2)).toBe("79.80"); // min(378,999)*90%=340.20.
    expect(calculateScheduleH({ ...input, futaCreditReduction: "999" }).futaTax.toFixed()).toBe("420");
    for (const change of [{ state: "ZZ" }, { periodStart: "2026-02-30" }, { periodEnd: "2025-12-31" }, { taxableWages: "-1" }, { experienceRate: "1.01" }, { contributionsPaidTimely: "-1" }]) expect(() => calculateScheduleH({ ...input, futaStatePeriods: [{ ...period, ...change }] })).toThrow(/actual|period|state/i);
    expect(() => calculateScheduleH({ ...input, futaStatePeriods: [period, period] })).toThrow(/overlap/i);
    expect(() => calculateScheduleH({ ...input, stateUnemploymentContributionsPaidLate: "-1" })).toThrow(/nonnegative/i);
    expect(() => calculateScheduleH({ ...input, employees: [{ ...employee, cashWages: "-1" }] })).toThrow(/nonnegative/i);
  });
});
