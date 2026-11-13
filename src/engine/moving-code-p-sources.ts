import { W2Schema, type Form3903Input, type W2 } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import type { Form3903Result } from "./forms/form-3903.js";

type CodePOriginal = Pick<W2, "box12CodeP" | "taxYear" | "accountHolder">;

/** A printed Code P original and a separately documented omission are different sources. */
export function assertMovingCodePReconciliation(
  w2s: readonly CodePOriginal[], year: number, hasJointSpouse: boolean,
  moving: Form3903Input | undefined, result: Form3903Result | undefined,
  requireOriginalForEveryPositiveMove = false,
): void {
  const reported = w2s.flatMap(w2 => {
    if (w2.box12CodeP === undefined) return [];
    const amount = W2Schema.shape.box12CodeP.parse(w2.box12CodeP);
    if (year !== 2026 || w2.taxYear !== year) throw new Error("Use the actual matching 2026 W-2 for entered Code P.");
    if (w2.accountHolder !== "primary" && (w2.accountHolder !== "spouse" || !hasJointSpouse)) {
      throw new Error("Identify the actual W-2 Code P owner.");
    }
    return d(amount).isZero() ? [] : [{ owner: w2.accountHolder, amount: d(amount) }];
  });
  if (!moving || moving.taxYear !== 2026 || !result) {
    if (reported.length) throw new Error("A positive W-2 Code P amount requires the matching moving records.");
    return;
  }
  const moves = moving.moves.map((move, index) => ({ move, result: result.moveResults[index] }));
  for (const owner of ["primary", "spouse"] as const) {
    const originals = reported.filter(original => original.owner === owner);
    const reimbursed = moves.filter(({ move, result }) => move.accountHolder === owner && result.line4.gt(0));
    if (!originals.length && !reimbursed.some(({ move }) => move.omittedTaxableExcess !== undefined)
      && (!requireOriginalForEveryPositiveMove || !reimbursed.length)) continue;
    if (originals.length !== 1 || reimbursed.length !== 1) {
      throw new Error("Reconcile one positive moving record with one positive original Code P amount per owner. Other allocations need their own source records.");
    }
    const { move, result } = reimbursed[0];
    const omitted = d(move.omittedTaxableExcess);
    if (result.line3.decimalPlaces() > 2 && originals[0].amount.gt(result.line3)) {
      throw new Error("Form 3903 mileage leaves a fraction of a cent. The original Code P needs a separate method to reconcile payroll cents.");
    }
    if ((requireOriginalForEveryPositiveMove && move.omittedTaxableExcess === undefined)
      || !originals[0].amount.plus(omitted).eq(result.line4)
      || originals[0].amount.gt(result.line3)) {
      throw new Error("Reconcile Form 3903 Line 4 to the actual Code P and any separately documented taxable excess omitted from W-2 Box 1.");
    }
  }
}
