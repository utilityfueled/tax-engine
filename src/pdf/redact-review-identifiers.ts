import Decimal from "decimal.js";

/** Render-only copy: calculate and validate against complete facts first.
 * This covers structured person identifiers and ambiguous payer/broker TINs in
 * both inputs and state result records. Explicit business EINs remain available
 * for source reconciliation. Eligibility flags and exact money are unchanged.
 * It is not a general free-text anonymizer or a replacement for access control.
 */
export function redactReviewIdentifiers<T>(value: T): T {
  if (value === null || typeof value !== "object" || Decimal.isDecimal(value)) return value;
  if (Array.isArray(value)) return value.map(item => redactReviewIdentifiers(item)) as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    typeof item === "string" && /(?:ssn(?:last4)?|tin|taxid|taxpayerIdLast4|identifyingnumber(?:last4)?|accountReference)$/i.test(key)
      ? "" : redactReviewIdentifiers(item),
  ])) as T;
}
