import { describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument } from "pdf-lib";
import { createPdfFieldBatch } from "@/pdf/pdf-utils.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillSchedule1 } from "@/pdf/mappings/2025/fill-schedule-1.js";
import { fillSchedule2 } from "@/pdf/mappings/2025/fill-schedule-2.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Spec: spec/federal/pdf-review-policy.yaml#mapped-write-batch
describe("mapped PDF field batches", () => {
  it.each([1, 2] as const)("preserves schedule %s header writes on the early return", async schedule => {
    const result = calculateFederalTax(simpleW2Fixture);
    result.schedule1 = undefined; result.schedule2 = undefined;
    const fill = schedule === 1 ? fillSchedule1 : fillSchedule2;
    const doc = await fill(simpleW2Fixture, result, `forms/blank/2025/f1040s${schedule}.pdf`);
    const reopened = (await PDFDocument.load(await doc.save())).getForm();
    const root = schedule === 1 ? "topmostSubform" : "form1";
    expect(reopened.getTextField(`${root}[0].Page1[0].f1_01[0]`).getText())
      .toBe(`${simpleW2Fixture.taxpayer.primary.firstName} ${simpleW2Fixture.taxpayer.primary.lastName}`);
  });
  it("saves text, exact money and both checkbox states with one lookup pass", async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage(); const form = doc.getForm();
    form.createTextField("person.name").addToPage(page);
    form.createTextField("amount").addToPage(page);
    form.createCheckBox("yes").addToPage(page);
    const no = form.createCheckBox("no"); no.addToPage(page); no.check();
    const lookup = vi.spyOn(form, "getFields");
    const batch = createPdfFieldBatch(form);
    batch.setText("person.name", "Example");
    batch.setCurrency("amount", new Decimal("-1234.50"));
    batch.setCheckBox("yes", true); batch.setCheckBox("no", false);
    batch.apply(); expect(lookup).toHaveBeenCalledTimes(1); lookup.mockRestore();
    const reopened = (await PDFDocument.load(await doc.save())).getForm();
    expect(reopened.getTextField("person.name").getText()).toBe("Example");
    expect(reopened.getTextField("amount").getText()).toBe("(1235)");
    expect(reopened.getCheckBox("yes").isChecked()).toBe(true);
    expect(reopened.getCheckBox("no").isChecked()).toBe(false);
  });

  it.each(["missing text", "wrong text", "missing checkbox", "wrong checkbox"])("rejects %s including empty writes before changing other fields", async mode => {
    const doc = await PDFDocument.create(); const form = doc.getForm();
    form.createTextField("amount").setText("retained"); form.createCheckBox("eligible");
    const batch = createPdfFieldBatch(form); batch.setText("amount", "replacement");
    if (mode === "missing text") batch.setText("absent", "");
    if (mode === "wrong text") batch.setText("eligible", "");
    if (mode === "missing checkbox") batch.setCheckBox("absent", false);
    if (mode === "wrong checkbox") batch.setCheckBox("amount", false);
    expect(() => batch.apply()).toThrow(/mapped.*field/i);
    expect(form.getTextField("amount").getText()).toBe("retained");
  });

  it("resolves fields at application time and never retains an index across documents", async () => {
    const first = (await PDFDocument.create()).getForm(); const second = (await PDFDocument.create()).getForm();
    const original = first.createTextField("amount"); original.setText("old");
    const a = createPdfFieldBatch(first); a.setText("amount", "first");
    first.removeField(original); first.createTextField("amount");
    second.createTextField("amount"); const b = createPdfFieldBatch(second); b.setText("amount", "second");
    b.apply(); a.apply();
    expect(first.getTextField("amount").getText()).toBe("first");
    expect(second.getTextField("amount").getText()).toBe("second");
  });

  it("preserves write order, clears empty amounts and closes after application", async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage(); const form = doc.getForm();
    form.createTextField("amount").addToPage(page); const batch = createPdfFieldBatch(form);
    batch.setText("amount", "before"); batch.setCurrency("amount", new Decimal(0)); batch.apply();
    expect(form.getTextField("amount").getText()).toBeUndefined();
    expect(() => batch.apply()).toThrow(/already applied/i);
    expect(() => batch.setText("amount", "after")).toThrow(/already applied/i);
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getForm().getTextField("amount").getText()).toBeUndefined();
  });
});
