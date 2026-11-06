// Spec: spec/federal/schedule-1-return.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillSchedule1, SCHEDULE_1_FIELDS as F } from "@/pdf/fill-schedule-1.js";
import { schedule1SourceInput } from "../fixtures/schedule1-source.js";
import { d } from "@/utils/decimal.js";
describe("Schedule1 source review mapping", () => {
  it("prints canonical source totals and rejects a contradictory audit", async () => {
    const input = schedule1SourceInput();
    const result = calculateFederalTax(input);
    const pdf = await fillSchedule1(input, result, "forms/blank/2025/f1040s1.pdf");
    const form = pdf.getForm();
    for (const [field, expected] of [[F.line3,"10000"],[F.line5,"3000"],[F.line6,"2000"],
      [F.line8v,"100"],[F.line8z,"600"],[F.line9,"700"],[F.line10,"15700"],[F.line24k,"700"],
      [F.line25,"700"],[F.line26,result.adjustmentsToIncome.toString()]] as const) {
      expect(form.getTextField(field).getText(), field).toBe(expected);
    }
    expect(form.getTextField(F.line8q).getText() ?? "").toBe("");
    const changed = { ...result, allLines: result.allLines.map(line => line.form === "Sched 1" && line.line === "10"
      ? { ...line, value: d("1") } : line) };
    await expect(fillSchedule1(input, changed, "forms/blank/2025/f1040s1.pdf")).rejects.toThrow(/reconcil|audit/i);
    const changed1040 = { ...result, allLines: result.allLines.map(line => line.form === "1040" && line.line === "8"
      ? { ...line, value: d("1") } : line) };
    await expect(fillSchedule1(input, changed1040, "forms/blank/2025/f1040s1.pdf")).rejects.toThrow(/reconcil|audit/i);
  });
});
