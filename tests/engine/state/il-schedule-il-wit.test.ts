/**
 * Tests for Illinois Schedule IL-WIT — Illinois Income Tax Withheld
 * Spec: spec/state/il-schedule-il-wit.yaml
 *
 * Source: Illinois Department of Revenue, 2025 Schedule IL-WIT Instructions
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  IL_SCHEDULE_IL_WIT_FORM_CODES,
  calculateILScheduleWIT,
  type ILScheduleWITInput,
  type ILScheduleWITRecord,
} from "@/engine/state/il-schedule-il-wit.js";

const d = (value: string | number) => new Decimal(value);

function makeRecord(overrides: Partial<ILScheduleWITRecord> = {}): ILScheduleWITRecord {
  return {
    taxpayer: "primary",
    formType: "W-2",
    payerId: "12-3456789",
    federalAmount: d(50000),
    illinoisAmount: d(50000),
    illinoisWithheld: d(2400),
    ...overrides,
  };
}

function makeInput(overrides: Partial<ILScheduleWITInput> = {}): ILScheduleWITInput {
  return {
    filingStatus: "single",
    records: [],
    ...overrides,
  };
}

describe("Illinois Schedule IL-WIT", () => {
  it("Schedule IL-WIT Step 1 - primary records are preserved in row order", () => {
    const result = calculateILScheduleWIT(makeInput({
      records: [
        makeRecord({ payerId: "11-1111111" }),
        makeRecord({ formType: "1099-G", payerId: "22-2222222", illinoisWithheld: d(75) }),
      ],
    }));

    expect(result.primaryRecords).toHaveLength(2);
    expect(result.primaryRecords[0]?.payerId).toBe("11-1111111");
    expect(result.primaryRecords[1]?.payerId).toBe("22-2222222");
    expect(result.spouseRecords).toHaveLength(0);
  });

  it("Schedule IL-WIT Step 1 - more than five W-2G forms from the same payer aggregate into one row", () => {
    const repeatedW2Gs = Array.from({ length: 6 }, (_, index) =>
      makeRecord({
        formType: "W-2G",
        payerId: "77-7777777",
        federalAmount: d(100 + index),
        illinoisAmount: d(90 + index),
        illinoisWithheld: d(10 + index),
      })
    );

    const result = calculateILScheduleWIT(makeInput({
      records: [
        ...repeatedW2Gs,
        makeRecord({ payerId: "11-1111111", illinoisWithheld: d(25) }),
      ],
    }));

    expect(result.primaryRecords).toHaveLength(2);
    expect(result.primaryRecords[0]).toMatchObject({
      formType: "W-2G",
      payerId: "77-7777777",
      federalAmount: d(615),
      illinoisAmount: d(555),
      illinoisWithheld: d(75),
    });
    expect(result.primaryRecords[1]?.payerId).toBe("11-1111111");
    expect(result.totalWithholding.toNumber()).toBe(100);
    expect(result.requiresAdditionalPrimarySchedule).toBe(false);
  });

  it("Schedule IL-WIT Step 2 - married filing separately rejects spouse withholding records", () => {
    expect(() => calculateILScheduleWIT(makeInput({
      filingStatus: "married_filing_separately",
      records: [makeRecord({ taxpayer: "spouse" })],
    }))).toThrow("Schedule IL-WIT spouse withholding records are not allowed for married filing separately");
  });

  it("Schedule IL-WIT Column A - 2025 supported form codes map to official Illinois values", () => {
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["W-2"]).toBe("W");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["W-2G"]).toBe("WG");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-R"]).toBe("R");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-G"]).toBe("G");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-MISC"]).toBe("M");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-OID"]).toBe("O");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-K"]).toBe("K");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-DIV"]).toBe("D");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-INT"]).toBe("I");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-B"]).toBe("B");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1042-S"]).toBe("S");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-NEC"]).toBe("N");
    expect(IL_SCHEDULE_IL_WIT_FORM_CODES["1099-DA"]).toBe("A");
  });

  it("Schedule IL-WIT Column B - payer IDs flow through to output rows", () => {
    const result = calculateILScheduleWIT(makeInput({
      records: [makeRecord({ payerId: "98-7654321" })],
    }));

    expect(result.primaryRecords[0]?.payerId).toBe("98-7654321");
  });

  it("Schedule IL-WIT Column C - federal amounts flow through to output rows", () => {
    const result = calculateILScheduleWIT(makeInput({
      records: [makeRecord({ federalAmount: d(61500) })],
    }));

    expect(result.primaryRecords[0]?.federalAmount.toNumber()).toBe(61500);
  });

  it("Schedule IL-WIT Column D - Illinois amounts flow through to output rows", () => {
    const result = calculateILScheduleWIT(makeInput({
      records: [makeRecord({ illinoisAmount: d(42000) })],
    }));

    expect(result.primaryRecords[0]?.illinoisAmount.toNumber()).toBe(42000);
  });

  it("Schedule IL-WIT Column E - zero Illinois withholding is rejected", () => {
    expect(() => calculateILScheduleWIT(makeInput({
      records: [makeRecord({ illinoisWithheld: d(0) })],
    }))).toThrow("Schedule IL-WIT record 1 must have positive Illinois withholding");
  });

  it("Schedule IL-WIT Line 11 - total Illinois withholding sums primary and spouse records", () => {
    const result = calculateILScheduleWIT(makeInput({
      filingStatus: "married_filing_jointly",
      records: [
        makeRecord({ taxpayer: "primary", illinoisWithheld: d(2400) }),
        makeRecord({ taxpayer: "primary", formType: "1099-G", illinoisWithheld: d(125) }),
        makeRecord({ taxpayer: "spouse", formType: "1099-R", payerId: "33-3333333", federalAmount: d(18000), illinoisAmount: d(18000), illinoisWithheld: d(900) }),
      ],
    }));

    expect(result.primaryWithholding.toNumber()).toBe(2525);
    expect(result.spouseWithholding.toNumber()).toBe(900);
    expect(result.totalWithholding.toNumber()).toBe(3425);
  });

  it("Schedule IL-WIT Line 11 - more than five primary records flags additional schedules required", () => {
    const records = Array.from({ length: 6 }, (_, index) =>
      makeRecord({
        payerId: `11-11111${index}`,
        illinoisWithheld: d(index + 1),
      })
    );

    const result = calculateILScheduleWIT(makeInput({ records }));

    expect(result.requiresAdditionalPrimarySchedule).toBe(true);
    expect(result.totalWithholding.toNumber()).toBe(21);
  });

  it("Schedule IL-WIT - audit trail records Line 11 inputs", () => {
    const result = calculateILScheduleWIT(makeInput({
      filingStatus: "married_filing_jointly",
      records: [
        makeRecord({ illinoisWithheld: d(100) }),
        makeRecord({ taxpayer: "spouse", payerId: "22-2222222", illinoisWithheld: d(50) }),
      ],
    }));

    const line11 = result.lines.find((line) => line.form === "Schedule IL-WIT" && line.line === "11");
    expect(line11?.inputs).toMatchObject({
      primaryWithholding: d(100),
      spouseWithholding: d(50),
    });
  });
});
