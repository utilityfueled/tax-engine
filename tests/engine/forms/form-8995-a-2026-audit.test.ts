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
const limitedTrade = { ...business, qbi: d(100000), w2Wages: d(20000), materiallyParticipated: true };

describe("2026 draft Form 8995-A audit", () => {
  it("audits the printed phase-in calculation and transfers", () => {
    const result = calculate({
      qbiSources: [limitedTrade], taxableIncomeBeforeQBI: d(239250), qualifiedReitDividends: d(1000),
    });

    expect(auditValues(result, ["2:1", "3:1", "10:1", "11:1", "12:1", "13:1", "15:1"])).toEqual([
      "100000", "20000", "10000", "10000", "15000", "15000", "15000",
    ]);
    expect(auditValues(result, ["17:1", "18:1", "19:1", "20", "21", "22", "23", "24", "25:1", "26:1"])).toEqual([
      "20000", "10000", "10000", "239250", "201750", "37500", "75000", "0.5", "5000", "15000",
    ]);
    expect(audited(result, "2:1")?.inputs["Business ordinal"]).toBe("1");
    expect(JSON.stringify(result.lines.filter(row => row.form === "8995-A"))).not.toContain(limitedTrade.name);
    expect(audited(result, `biz-${limitedTrade.name}`)).toBeUndefined();
    expect(auditValues(result, ["16", "27", "31", "32", "41"])).toEqual(["15000", "15000", "200", "15200", "15200"]);
    expect(audited(result, "32")?.formula).toBe("Add lines 27 and 31");
    expect(result.qbiDeduction.toFixed()).toBe("15200");

    const atUpperThreshold = calculate({ qbiSources: [limitedTrade], taxableIncomeBeforeQBI: d(276750) });
    expect(auditValues(atUpperThreshold, ["24", "25:1", "26:1", "12:1", "27"])).toEqual([
      "1", "10000", "10000", "10000", "10000",
    ]);
  });

  it("skips Part III when the income or wage limit does not require it", () => {
    const phaseInRows = ["phase-in", "12:1", "17:1", "18:1", "19:1", "20", "21", "22", "23", "24", "25:1", "26:1"];
    for (const { taxableIncome, wages, component } of [
      { taxableIncome: 201750, wages: 20000, component: "20000" },
      { taxableIncome: 239250, wages: 40000, component: "20000" },
      { taxableIncome: 276751, wages: 20000, component: "10000" },
    ]) {
      const result = calculate({
        taxableIncomeBeforeQBI: d(taxableIncome), qbiSources: [{ ...limitedTrade, w2Wages: d(wages) }],
      });
      expect(auditValues(result, phaseInRows)).toEqual(phaseInRows.map(() => undefined));
      expect(auditValues(result, ["15:1", "16", "27", "32"])).toEqual(Array<string>(4).fill(component));
    }
  });

  it("uses distinct business rows when only one business needs Part III", () => {
    const result = calculate({
      qbiSources: [limitedTrade, { ...limitedTrade, qbi: d(50000) }], taxableIncomeBeforeQBI: d(239250),
    });

    expect(auditValues(result, ["2:1", "2:2", "12:1", "12:2", "15:1", "15:2", "26:2", "27"])).toEqual([
      "100000", "50000", "15000", undefined, "15000", "10000", undefined, "25000",
    ]);
    expect(audited(result, "2:2")?.inputs["Business ordinal"]).toBe("2");
    expect(result.lines.filter(row => row.form === "8995-A" && row.line === "24")).toHaveLength(1);

    const historical = calculate({
      taxYear: 2025, qbiSources: [limitedTrade], taxableIncomeBeforeQBI: d(222300),
      simplifiedThreshold: d(197300), phaseInRange: d(50000),
    });
    expect(auditValues(historical, ["phase-in", "16", "24", "27", "32"])).toEqual(["0.5", "15000", undefined, undefined, "15000"]);
    expect(audited(historical, `biz-${limitedTrade.name}`)?.description).toBe("Line 1 QBI");
  });

  it("keeps business labels in named results and uses ordinals throughout the draft audit", () => {
    const marker = "Synthetic audit marker";
    const names = ["store", "warehouse", "closed trade", "group", "PTP"].map(label => `${marker} ${label}`);
    const [store, warehouse, closedTrade, group, partnership] = names;
    const input = {
      taxableIncomeBeforeQBI: d(239250),
      qbiSources: [
        { ...limitedTrade, name: store, qbi: d(60000), w2Wages: d(12000) },
        { ...limitedTrade, name: warehouse, qbi: d(50000), w2Wages: d(8000) },
        { ...business, name: closedTrade, qbi: d(-10000), materiallyParticipated: true },
      ],
      aggregationElections: [{ name: group, componentBusinessNames: [store, warehouse] }],
      ptpSources: [{ ...business, name: partnership, qbi: d(700) }, { ...business, name: partnership, qbi: d(-100) }],
      qualifiedReitDividends: d(400),
    };
    const result = calculate(input);
    const scheduleC = result.lines.filter(row => row.form === "8995-A Schedule C" && row.line.startsWith("1:"));

    expect(JSON.stringify(result.lines)).not.toContain(marker);
    expect(scheduleC.map(row => [row.inputs["Business ordinal"], row.value.toFixed()])).toEqual([["1", "100000"], ["2", "0"]]);
    expect(audited(result, "aggregation:1")?.inputs["Group ordinal"]).toBe("1");
    expect(audited(result, "ptp:1")?.inputs["PTP ordinal"]).toBe("1");
    expect(audited(result, "ptp:2")?.inputs["PTP ordinal"]).toBe("2");
    expect(auditValues(result, ["aggregation:1", "ptp:1", "ptp:2", "27", "31", "41"])).toEqual([
      "110000", "700", "-100", "15000", "200", "15200",
    ]);
    expect(result.businesses.map(row => row.name)).toEqual([group, closedTrade]);
    expect(result.aggregationGroups).toMatchObject([{ name: group, componentBusinessNames: [store, warehouse] }]);
    expect(result.ptpBusinesses.map(row => row.name)).toEqual([partnership, partnership]);
    expect(result.qbiDeduction.toFixed()).toBe("15200");

    const historical = calculate({
      ...input, taxYear: 2025, taxableIncomeBeforeQBI: d(222300), simplifiedThreshold: d(197300), phaseInRange: d(50000),
    });
    const held = calculate({
      ...input, patronageSources: [{
        cooperativeName: "Fictional cooperative", qbiAllocableToQualifiedPayments: d(0),
        w2WagesAllocableToQualifiedPayments: d(0), cooperativeDPAD: d(0),
      }],
    });
    for (const legacy of [historical, held]) {
      expect(audited(legacy, "phase-in")?.value.toFixed()).toBe("0.5");
      expect(legacy.lines.find(row => row.form === "8995-A Schedule C" && row.line === "1:0")?.description)
        .toBe(`Adjusted qualified income: ${group}`);
      expect(audited(legacy, `agg-${group}`)?.formula).toContain(`${store} + ${warehouse}`);
      expect(legacy.lines.filter(row => row.line === `ptp-${partnership}`)).toHaveLength(2);
      expect(legacy.qbiDeduction.toFixed()).toBe("15200");
    }
  });

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
    expect(auditValues(result, ["phase-in", "16", "27", "32"])).toEqual(["1", "0", undefined, "0"]);
  });
});
