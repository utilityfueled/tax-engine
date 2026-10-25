// Spec: spec/federal/schedule-a-review-election.yaml
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from "@/pdf/fill-schedule-a.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
it("maps only the actual election to itemize below the standard deduction", async () => {
  for (const [election, amount, checked] of [
    ["itemized", "12000", true], ["automatic", "12000", false], ["standard", "12000", false],
    ["itemized", "15750", false], ["itemized", "20000", false],
  ] as const) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, deductionElection: election,
      donations: [{ organization: "Synthetic qualified recipient", type: "cash", amount,
        dateOfDonation: "2025-05-01", qualifiedOrganization: true, isPrivateFoundation: false }] });
    const result = calculateFederalTax(input);
    expect(result.standardDeduction.toString()).toBe("15750");
    expect(result.itemizedDeductions.toString()).toBe(amount);
    const doc = await fillScheduleA(input, result, "forms/blank/2025/f1040sa.pdf");
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getForm().getCheckBox(F.line18Checkbox).isChecked()).toBe(checked);
  }
});
