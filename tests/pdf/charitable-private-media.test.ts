// Spec: spec/federal/charitable-private-media.yaml canonical-review.
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from "@/pdf/fill-schedule-a.js";
import { prepareCharitableReview } from "@/pdf/charitable-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { charitablePrivateMediaFixture } from "../fixtures/charitable-private-media.js";
it("preserves actual current and prior private media through canonical review", async () => {
  const input = charitablePrivateMediaFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.scheduleA.cashCharitable.toString()).toBe("4000.98");
  expect(result.scheduleA.nonCashCharitable.toString()).toBe("6001.02");
  expect(result.scheduleA.charitableCarryforwardDetail.map(row => [row.medium, row.amountUsed.toString()]))
    .toEqual([["cash", "3000.49"], ["noncash", "4000.51"]]);
  expect(result.carryforwards.charitableContributions.toString()).toBe("0");
  const doc = await fillScheduleA(redactReviewIdentifiers(input), result,
    "forms/blank/2025/f1040sa.pdf", prepareCharitableReview(input));
  const reopened = await PDFDocument.load(await doc.save());
  for (const [field, expected] of [[F.line11, "1000"], [F.line12, "2001"], [F.line13, "7001"],
    [F.line14, "10002"], [F.line17, "10002"], [F.ssn, undefined]] as const) {
    expect(reopened.getForm().getTextField(field).getText()).toBe(expected);
  }
  expect(JSON.stringify(input)).toBe(before);
  input.w2s[0].wages = "20000";
  expect(() => calculateFederalTax(input)).toThrow(/partial.*cash.*noncash|partial.*media/i);
});
