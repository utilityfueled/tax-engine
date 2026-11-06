// Spec: spec/federal/schedule-a.yaml lines4-negative-agi-review.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillScheduleA, SCHEDULE_A_FIELDS } from "@/pdf/fill-schedule-a.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

it("preserves signed AGI without a negative medical threshold in the review form", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [], scheduleC: { businessName: "Actual loss source", accountHolder: "primary", grossReceipts: "0",
      qbiMateriallyParticipated: true, allInvestmentAtRisk: true, expenses: { otherExpenses: "100000" } },
    scheduleA: { medicalExpenses: "5000" },
  });
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe("-100000");
  const document = await fillScheduleA(input, result, "forms/blank/2025/f1040sa.pdf");
  const form = document.getForm();
  expect(form.getTextField(SCHEDULE_A_FIELDS.line2).getText()).toBe("(100000)");
  expect(form.getTextField(SCHEDULE_A_FIELDS.line3).getText() ?? "").toBe("");
  expect(form.getTextField(SCHEDULE_A_FIELDS.line4).getText()).toBe("5000");
});
