/** Spec: spec/federal/form-8863-2026-template.yaml. Private transfer verification. */
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import { markReviewPdf } from "../../export-policy.js";
import { FORM_8863_2026_CANDIDATE, projectForm88632026Transfers } from "./form-8863-candidate.js";

export async function renderPrivateForm88632026TransferReview(
  input: TaxYearInput,
  workpapers: unknown,
  template: Uint8Array,
): Promise<Uint8Array> {
  const { fields, sha256 } = FORM_8863_2026_CANDIDATE;
  if (createHash("sha256").update(template).digest("hex") !== sha256) {
    throw new Error("Unreviewed Form 8863 2026 template revision");
  }
  const { transfers } = projectForm88632026Transfers(input, workpapers);
  const [refundable, nonrefundable] = transfers;
  if (transfers.length !== 2 || refundable?.line !== "8" || nonrefundable?.line !== "19") {
    throw new Error("Form 8863 review requires verified transfer lines 8 and 19");
  }

  const pdf = await PDFDocument.load(template);
  const form = pdf.getForm();
  form.getTextField(fields.line8).setText(refundable.amount);
  form.getTextField(fields.line19).setText(nonrefundable.amount);
  await markReviewPdf(pdf);
  return pdf.save();
}
