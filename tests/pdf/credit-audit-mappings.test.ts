// Source: final 2025 IRS Schedule 3 and Schedule 8812, refreshed 2026-10-25.
// Mapping checks consume audited values; they do not independently qualify law.
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateSchedule3 } from "@/engine/schedules/schedule-3.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { getConstants } from "@/models/constants.js";
import { fillSchedule3, SCHEDULE_3_FIELDS } from "@/pdf/fill-schedule-3.js";
import { fillForm8812, FORM_8812_FIELDS } from "@/pdf/fill-form-8812.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { d } from "@/utils/decimal.js";

describe("credit review PDFs copy the actual audited lines", () => {
  it("keeps Schedule3 line7 separate from line8 and includes extension payments", async () => {
    const input = { ...simpleW2Fixture, adjustments: { extensionPayments: [{ date: "2026-04-15", amount: "600", type: "federal" as const }] } };
    const schedule3 = calculateSchedule3(input, { foreignTaxCredit: d(100), generalBusinessCredit: d(200), priorYearMinimumTaxCredit: d(300), netPremiumTaxCredit: d(400), excessSocialSecurityWithholding: d(500) });
    const doc = await fillSchedule3(input, { ...calculateFederalTax(simpleW2Fixture), schedule3 }, "forms/blank/2025/f1040s3.pdf");
    const fields = doc.getForm();
    for (const [key, amount] of [["line6a", "200"], ["line6b", "300"], ["line7", "500"], ["line8", "600"], ["line9", "400"], ["line10", "600"], ["line11", "500"], ["line15", "1500"]] as const) {
      expect(fields.getTextField(SCHEDULE_3_FIELDS[key]).getText(), key).toBe(amount);
    }
  });

  it("copies verified counts, credit limits and Puerto Rico payroll instead of reconstructing them from W2 totals", async () => {
    const input = { ...simpleW2Fixture, childTaxCredit: { bonaFidePuertoRicoResident: true, possessionIncomeExclusion: "0" } };
    const form8812 = calculateForm8812({ taxYear: 2025, qualifyingChildren: 1, otherDependents: 0, agi: d(10000), earnedIncome: d(0), taxLiability: d(137), filingStatus: "single", bonaFidePuertoRicoResident: true, payrollTaxes: d(900), additionalPayrollTaxes: d(50), earnedIncomeCredit: d(100), excessSocialSecurityWithholding: d(0) }, getConstants(2025));
    const doc = await fillForm8812(input, { ...calculateFederalTax(simpleW2Fixture), agi: d(10000), form8812 }, "forms/blank/2025/f1040s8.pdf");
    const fields = doc.getForm();
    for (const [key, amount] of [["line4", "1"], ["line5", "2200"], ["line13", "137"], ["line16a", "2063"], ["line16b", "1700"], ["line17", "1700"], ["line21", "900"], ["line22", "50"], ["line23", "950"], ["line24", "100"], ["line25", "850"], ["line26", "850"], ["line27", "850"]] as const) {
      expect(fields.getTextField(FORM_8812_FIELDS[key]).getText(), key).toBe(amount);
    }
    expect(fields.getTextField(FORM_8812_FIELDS.line18a).getText() ?? "").toBe("");
    expect(fields.getTextField(FORM_8812_FIELDS.line15).getText()).toBeUndefined();
    expect(fields.getCheckBox(FORM_8812_FIELDS.nextNo).isChecked()).toBe(true);
    expect(fields.getCheckBox(FORM_8812_FIELDS.line19No).isChecked()).toBe(true);
  });

  it("refuses a missing or duplicate monetary audit instead of silently recalculating it", async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    const form8812 = result.form8812;
    expect(form8812).toBeDefined();
    if (!form8812) throw new Error("Missing synthetic calculation");
    await expect(fillForm8812(simpleW2Fixture, { ...result, form8812: { ...form8812, lines: form8812.lines.filter(line => line.line !== "13") } }, "forms/blank/2025/f1040s8.pdf")).rejects.toThrow(/audit/i);
    await expect(fillForm8812(simpleW2Fixture, { ...result, form8812: { ...form8812, lines: [...form8812.lines, form8812.lines[0]] } }, "forms/blank/2025/f1040s8.pdf")).rejects.toThrow(/audit/i);
  });
});
