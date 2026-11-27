/** Spec: spec/federal/form-8995-a-2026-audit.yaml. */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm8995A, type Form8995AInput } from "@/engine/forms/form-8995-a.js";

const d = (amount: number | string) => new Decimal(amount);

function calculate(overrides: Partial<Form8995AInput> = {}) {
  return calculateForm8995A({
    taxYear: 2026,
    qbiSources: [],
    taxableIncomeBeforeQBI: d(300000),
    netCapitalGain: d(0),
    qualifiedDividends: d(0),
    simplifiedThreshold: d(201750),
    phaseInRange: d(75000),
    ...overrides,
  });
}

function audited(result: ReturnType<typeof calculate>, line: string) {
  return result.lines.find(row => row.form === "8995-A" && row.line === line);
}

function auditValues(result: ReturnType<typeof calculate>, lines: string[]) {
  return lines.map(line => audited(result, line)?.value.toFixed());
}

const business = { name: "Fictional active trade", qbi: d(1200), w2Wages: d(0), ubia: d(0), isSST: false };

describe("2026 draft Form 8995-A audit", () => {
  it("audits signed REIT and PTP losses while preserving stored magnitudes", () => {
    const input = {
      qualifiedReitDividends: d(10),
      ptpSources: [{ ...business, name: "Fictional PTP", qbi: d(-60) }],
      priorYearReitPtpLoss: d(60),
      priorYearQBILoss: d(70),
    };
    const result = calculate(input);

    expect(auditValues(result, ["28", "29", "30", "42"])).toEqual(["-50", "-60", "0", "-110"]);
    expect(result.priorYearReitPtpLoss.toFixed()).toBe("60");
    expect(result.reitPtpLossCarryforward.toFixed()).toBe("110");
    expect(result.qbiLossCarryforward.toFixed()).toBe("70");

    const historical = calculate({ ...input, taxYear: 2025 });
    expect(auditValues(historical, ["29", "40", "42"])).toEqual(["60", "110", undefined]);
  });

  it("describes the actual deductions in the pre-QBI taxable income", () => {
    const line = audited(calculate(), "33");

    expect(line?.value.toFixed()).toBe("300000");
    expect(line?.formula).toContain("Schedule 1-A");
    expect(line?.formula).toContain("nonitemizer charitable deduction");
    expect(line?.formula).toContain("section 68");
  });

  it("routes the ordinary and minimum deductions separately in the draft audit", () => {
    const result = calculate({ qbiSources: [{ ...business, materiallyParticipated: true, w2Wages: d(400) }] });

    expect(auditValues(result, ["37", "38", "39", "40", "41"])).toEqual(["200", "0", "200", "400", "400"]);
    expect(result.qbiDeduction.toFixed()).toBe("400");
    expect(audited(result, "41")?.formula).toContain("Form 1040 line 13b");

    const belowThreshold = calculate({ qbiSources: [{ ...business, qbi: d("999.99"), w2Wages: d(400) }] });
    expect(auditValues(belowThreshold, ["39", "40", "41"])).toEqual(["200", "0", "200"]);
  });

  it("omits an undetermined minimum without changing the deduction", () => {
    const ordinary = { ...business, qbi: d(5000), w2Wages: d(2000) };
    const unknown = calculate({ qbiSources: [ordinary] });

    expect(auditValues(unknown, ["39", "40", "41"])).toEqual(["1000", undefined, "1000"]);
    expect(unknown.qbiDeduction.toFixed()).toBe("1000");
    expect(audited(unknown, "41")?.formula).toContain("eligibility unresolved");

    const active = calculate({ qbiSources: [{ ...ordinary, materiallyParticipated: true }] });
    const inactive = calculate({ qbiSources: [{ ...ordinary, materiallyParticipated: false }] });
    expect(auditValues(active, ["39", "40", "41"])).toEqual(["1000", "400", "1000"]);
    expect(auditValues(inactive, ["39", "40", "41"])).toEqual(["1000", "0", "1000"]);

    const unknownCarry = calculate({
      qbiSources: [{ ...ordinary, materiallyParticipated: true }], priorYearQBILoss: d(50),
    });
    expect(auditValues(unknownCarry, ["39", "40", "41"])).toEqual(["990", undefined, "990"]);
    expect(() => calculate({ qbiSources: [business] })).toThrow("QBI material participation is unknown");
    expect(() => calculate({
      qbiSources: [{ ...business, materiallyParticipated: true }], priorYearQBILoss: d(50),
    })).toThrow("Active QBI carryover loss is unknown");
  });

  it("preserves direct cooperative calculations pending review of the annual form", () => {
    const result = calculate({
      qbiSources: [{ ...business, materiallyParticipated: true }],
      patronageSources: [{
        cooperativeName: "Fictional cooperative", qbiAllocableToQualifiedPayments: d(1200),
        w2WagesAllocableToQualifiedPayments: d(0), cooperativeDPAD: d(100),
      }],
    });

    expect(result.qbiDeduction.toFixed()).toBe("500");
    expect(auditValues(result, ["37", "38", "39", "40", "41"])).toEqual(["400", "100", "500", undefined, undefined]);
  });
});
