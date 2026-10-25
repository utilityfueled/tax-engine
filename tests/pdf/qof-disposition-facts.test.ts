// Spec: spec/federal/qof-disposition-facts.yaml.
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleD, SCHEDULE_D_FIELDS as F } from "@/pdf/fill-schedule-d.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

it("maps only the actual confirmed QOF answer on ScheduleD", async () => {
  const original = { sourceTaxYear: 2025, sourceReference: "Actual reviewed investment sources", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false };
  const result = calculateFederalTax(simpleW2Fixture);
  for (const facts of [undefined, original]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, qofDispositionFacts: facts });
    const pdf = await fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf");
    const form = (await PDFDocument.load(await pdf.save())).getForm();
    expect(form.getCheckBox(F.qofDispositionYes).isChecked()).toBe(false);
    expect(form.getCheckBox(F.qofDispositionNo).isChecked()).toBe(facts !== undefined);
  }
  for (const patch of [{ sourceTaxYear: 2024 }, { disposedOfQofInvestment: true }, { sourceFactsConfirmed: false }]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, qofDispositionFacts: { ...original, ...patch } });
    await expect(fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf")).rejects.toThrow(/QOF|8997/);
  }
});
