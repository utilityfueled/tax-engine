/** Source-preserving B-category allocation; spec/federal/charitable-private-media.yaml. */
import Decimal from "decimal.js";
import { d } from "@/utils/decimal.js";

export function allocateCharitablePrivateMedia(cash: Decimal, noncash: Decimal, allowed: Decimal): {
  cash: Decimal; noncash: Decimal;
} {
  if ([cash, noncash, allowed].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))
    || allowed.gt(cash.plus(noncash))) throw new Error("Private charitable allowance must reconcile to finite nonnegative cash and noncash sources");
  if (allowed.isZero()) return { cash: d("0"), noncash: d("0") };
  if (cash.isZero()) return { cash: d("0"), noncash: allowed };
  if (noncash.isZero()) return { cash: allowed, noncash: d("0") };
  if (allowed.eq(cash.plus(noncash))) return { cash, noncash };
  throw new Error("Partial private charitable cash/noncash allowance requires a separate source allocation method");
}
