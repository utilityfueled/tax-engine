/**
 * Form 1099-K — Payment Card and Third Party Network Transactions.
 * Spec: spec/federal/form-1099-k.yaml
 *
 * Aggregates payment card and third-party network income from all
 * Form 1099-K documents, routes amounts by income type (business,
 * farm, rental, other), and flows withholding to Form 1040 Line 25d.
 *
 * Form 1099-K does NOT represent additional income — it is a reporting
 * mechanism for income that should already appear elsewhere on the return.
 * The engine provides a reconciliation summary for audit trail purposes.
 */

import Decimal from "decimal.js";
import type { Form1099K } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form1099KResult {
  /** Total gross amount from all 1099-K forms (sum of Box 1a) */
  grossAmount: Decimal;
  /** Total card-not-present transactions (sum of Box 1b, informational) */
  cardNotPresent: Decimal;
  /** Federal income tax withheld (sum of Box 4) → Form 1040 Line 25d */
  federalWithholding: Decimal;
  /** State income tax withheld (sum of Box 8) */
  stateWithholding: Decimal;
  /** Gross amount routed to Schedule C (business income type) */
  businessGross: Decimal;
  /** Gross amount routed to Schedule F (farm income type) */
  farmGross: Decimal;
  /** Gross amount routed to Schedule E (rental income type) */
  rentalGross: Decimal;
  /** Gross amount routed to Schedule 1 Line 8z (other income type) */
  otherGross: Decimal;
  /** Number of 1099-K forms processed */
  numberOfForms: number;

  lines: CalculatedLine[];
}

export function calculateForm1099K(
  forms: Form1099K[],
): Form1099KResult {
  const audit = new AuditTrail();

  if (forms.length === 0) {
    return {
      grossAmount: ZERO,
      cardNotPresent: ZERO,
      federalWithholding: ZERO,
      stateWithholding: ZERO,
      businessGross: ZERO,
      farmGross: ZERO,
      rentalGross: ZERO,
      otherGross: ZERO,
      numberOfForms: 0,
      lines: [],
    };
  }

  // ── Aggregate all 1099-K amounts ────────────────────────
  const grossAmount = sum(...forms.map((f) => d(f.grossAmount)));
  const cardNotPresent = sum(...forms.map((f) => d(f.cardNotPresent)));
  const federalWithholding = sum(...forms.map((f) => d(f.federalWithheld)));
  const stateWithholding = sum(...forms.map((f) => d(f.stateWithheld)));

  audit.record(
    "Form 1099-K",
    "1a",
    "Gross amount of payment card/third-party network transactions",
    grossAmount,
    forms.length > 1
      ? `Sum of ${forms.length} Form 1099-K Box 1a amounts`
      : "Form 1099-K Box 1a amount",
    {
      "Number of 1099-K forms": new Decimal(forms.length),
      "Card not present (Box 1b)": cardNotPresent,
    }
  );

  audit.record(
    "Form 1099-K",
    "4",
    "Federal income tax withheld",
    federalWithholding,
    "Sum of all Form 1099-K Box 4 amounts"
  );

  if (stateWithholding.greaterThan(0)) {
    audit.record(
      "Form 1099-K",
      "8",
      "State income tax withheld",
      stateWithholding,
      "Sum of all Form 1099-K Box 8 amounts"
    );
  }

  // ── Route by income type ────────────────────────────────
  const businessGross = sum(
    ...forms.filter((f) => f.incomeType === "business").map((f) => d(f.grossAmount))
  );
  const farmGross = sum(
    ...forms.filter((f) => f.incomeType === "farm").map((f) => d(f.grossAmount))
  );
  const rentalGross = sum(
    ...forms.filter((f) => f.incomeType === "rental").map((f) => d(f.grossAmount))
  );
  const otherGross = sum(
    ...forms.filter((f) => f.incomeType === "other").map((f) => d(f.grossAmount))
  );

  if (businessGross.greaterThan(0)) {
    audit.record(
      "Form 1099-K",
      "business",
      "1099-K gross routed to Schedule C",
      businessGross,
      "Sum of 1099-K Box 1a for business income type"
    );
  }

  if (farmGross.greaterThan(0)) {
    audit.record(
      "Form 1099-K",
      "farm",
      "1099-K gross routed to Schedule F",
      farmGross,
      "Sum of 1099-K Box 1a for farm income type"
    );
  }

  if (rentalGross.greaterThan(0)) {
    audit.record(
      "Form 1099-K",
      "rental",
      "1099-K gross routed to Schedule E",
      rentalGross,
      "Sum of 1099-K Box 1a for rental income type"
    );
  }

  if (otherGross.greaterThan(0)) {
    audit.record(
      "Form 1099-K",
      "other",
      "1099-K gross routed to Schedule 1 Line 8z",
      otherGross,
      "Sum of 1099-K Box 1a for other income type"
    );
  }

  return {
    grossAmount,
    cardNotPresent,
    federalWithholding,
    stateWithholding,
    businessGross,
    farmGross,
    rentalGross,
    otherGross,
    numberOfForms: forms.length,
    lines: audit.getLines(),
  };
}
