/** Bind the validated first-home return before removing the original account reference. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { assertPdfExportAllowed } from "./export-policy.js";
import { redactReviewIdentifiers } from "./redact-review-identifiers.js";

const brand = Symbol("prepared Form 5329 first-home review");
export interface PreparedForm5329FirstHomeReview { readonly [brand]: true }

const contexts = new WeakMap<PreparedForm5329FirstHomeReview, {
  originalDigest: string;
  redactedDigest: string;
  proof: ReturnType<typeof reviewProof>;
}>();

function digest(input: TaxYearInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function firstHomeAudit(result: TaxReturnResult) {
  return result.allLines.filter(row => row.form === "Form 5329 first home" && row.line === "09-source");
}

function reviewProof(result: TaxReturnResult) {
  return {
    taxYear: result.taxYear,
    filingStatus: result.filingStatus,
    iraDistributionsGross: result.iraDistributionsGross,
    iraDistributionsTaxable: result.iraDistributionsTaxable,
    form1099R: result.form1099R,
    form5329: result.form5329,
    sourceAudit: firstHomeAudit(result),
    partIAudit: result.allLines.filter(row => row.form === "Form 5329" && ["1", "2", "3", "4"].includes(row.line)),
    schedule2Line8: result.schedule2?.lines.filter(row => row.line === "8"),
  };
}

/** Both digests bind the input. The context retains only the calculated review proof. */
export function prepareForm5329FirstHomeReview(input: TaxYearInput): PreparedForm5329FirstHomeReview {
  assertPdfExportAllowed(input.taxpayer.taxYear, input.taxpayer.taxYear);
  if (input.form5329FirstHomeSource === undefined) throw new Error("Form 5329 first-home review requires the original source.");
  const calculation = calculateFederalTax(input);
  const proof = reviewProof(calculation);
  if (!proof.form5329 || proof.sourceAudit.length !== 1) {
    throw new Error("Form 5329 first-home review requires the completed source calculation.");
  }
  const token: PreparedForm5329FirstHomeReview = Object.freeze({ [brand]: true as const });
  contexts.set(token, {
    originalDigest: digest(input),
    redactedDigest: digest(redactReviewIdentifiers(input)),
    proof: redactReviewIdentifiers(proof),
  });
  return token;
}

export function requiresForm5329FirstHomeReview(input: TaxYearInput, result: TaxReturnResult): boolean {
  return input.form5329FirstHomeSource !== undefined
    || result.allLines.some(row => row.form === "Form 5329 first home" && row.line === "09-source");
}

/** Check the current sources and exact amounts before rendering the source-based result. */
export function assertForm5329FirstHomeReview(
  input: TaxYearInput, result: TaxReturnResult, token: PreparedForm5329FirstHomeReview,
): boolean {
  const context = contexts.get(token);
  if (!context) throw new Error("Form 5329 first-home review requires an original prepared context.");
  const inputDigest = digest(input);
  if (inputDigest !== context.originalDigest && inputDigest !== context.redactedDigest) {
    throw new Error("Form 5329 first-home review sources are stale or conflicting.");
  }
  if (!isDeepStrictEqual(redactReviewIdentifiers(reviewProof(result)), context.proof)) {
    throw new Error("Form 5329 first-home review calculation and audit do not reconcile.");
  }
  const part = context.proof.form5329!;
  return part.line2ExceptionNumber === "09" && part.line1.gt(0) && part.line2.eq(part.line1)
    && part.line3.isZero() && part.line4.isZero() && part.totalAdditionalTax.isZero();
}
