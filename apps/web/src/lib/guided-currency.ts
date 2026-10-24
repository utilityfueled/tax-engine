import Decimal from "decimal.js";

/** Blank optional monetary fields are zero; malformed supplied facts are errors. */
export function parseGuidedCurrency(value: string | undefined): Decimal {
  const text = (value ?? "").trim();
  if (text === "") return new Decimal(0);
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
    throw new Error("Enter a valid decimal amount.");
  }
  const amount = new Decimal(text.replace(/,/g, ""));
  if (!amount.isFinite()) throw new Error("Enter a finite decimal amount.");
  return amount;
}

export function hasGuidedCurrency(value: string | undefined): boolean {
  return !parseGuidedCurrency(value).isZero();
}

export function formatGuidedDollars(amount: Decimal): string {
  // Formatting is not a calculation input. No conversion through JS Number.
  const [whole, cents] = amount.toFixed(2, Decimal.ROUND_HALF_UP).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === "00" ? grouped : `${grouped}.${cents}`;
}
