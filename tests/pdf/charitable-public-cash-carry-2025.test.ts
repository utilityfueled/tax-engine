// Spec: spec/federal/charitable-public-cash-carry-2025.yaml canonical-review.
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from "@/pdf/fill-schedule-a.js";
import { prepareCharitableReview } from "@/pdf/charitable-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { syntheticPublicCashHistory } from "../fixtures/charitable-carryover.js";
it("preserves the mixed cash and property sources through canonical review output", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000" }],
    charitableCarryoverSources: syntheticPublicCashHistory([{ taxYear: 2024, amount: "20000" }]),
    donations: [{ organization: "Synthetic public charity", type: "appreciated_stock", amount: "40000",
      costBasis: "10000", dateOfDonation: "2025-05-01", qualifiedOrganization: true,
      isPrivateFoundation: false, isLongTermCapitalGain: true }],
  });
  const original = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.agi.toString()).toBe("50000");
  expect(result.deductionUsed).toBe("itemized");
  expect(result.scheduleA.charitableCurrentNoncash.toString()).toBe("5000");
  expect(result.scheduleA.charitablePriorYearUsed.toString()).toBe("20000");
  expect(result.scheduleA.charitableTotal.toString()).toBe("25000");
  expect(result.carryforwards.charitableContributions.toString()).toBe("35000");
  expect(result.scheduleA.charitableCarryforwardByYear.map(row => ({
    year: row.taxYear, category: row.category, amount: row.amount.toString(),
  }))).toEqual([{ year: 2025, category: "capital_gain_30", amount: "35000" }]);
  const doc = await fillScheduleA(redactReviewIdentifiers(input), result,
    "forms/blank/2025/f1040sa.pdf", prepareCharitableReview(input));
  const reopened = await PDFDocument.load(await doc.save());
  for (const [field, expected] of [[F.line11, undefined], [F.line12, "5000"], [F.line13, "20000"],
    [F.line14, "25000"], [F.line17, "25000"], [F.ssn, undefined]] as const) {
    expect(reopened.getForm().getTextField(field).getText()).toBe(expected);
  }
  expect(reopened.getForm().getCheckBox(F.line18Checkbox).isChecked()).toBe(false);
  expect(JSON.stringify(input)).toBe(original);
});
