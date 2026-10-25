/** Current cash carry coordination. Spec: charitable-net-operating-loss.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

export interface CharitableNolCarryoverResult {
  taxYear: number;
  sourceContributions: Decimal;
  contributions: Decimal;
  tentativeCarryforward: Decimal;
  nonexcessContributions: Decimal;
  nolCarryforward: Decimal;
  counterfactualNolCarryforward: Decimal;
  reduction: Decimal;
  carryforward: Decimal;
  /** Known-empty ATNOL history only; never copied from the reduced regular carry. */
  alternativeTaxCarryforward: Decimal;
  lines: CalculatedLine[];
}

export function calculateCharitableNolCarryover(params: {
  input: TaxYearInput;
  tentativeCarryforward: Decimal;
  nolCarryforward: Decimal;
  alternativeTaxNolAvailable: Decimal;
  computeCarryover: (nonexcessContributions: Decimal) => Decimal;
}): CharitableNolCarryoverResult {
  const { input } = params;
  const taxYear = input.taxpayer.taxYear;
  if (![2025, 2026].includes(taxYear)) throw new Error("Charitable NOL carry supports actual2025 or2026 contributions");
  if (d(input.priorYear?.charitableCarryforward).gt(0)
    || input.priorYear?.charitableCarryforwardByYear.some(row => d(row.amount).gt(0))) {
    throw new Error("Prior charitable carry requires its separate category and NOL coordination history");
  }
  if (input.scheduleK1.some(row => [row.charitableCash, row.charitableCapitalGain30, row.charitableCapitalGain20].some(value => !d(value).isZero()))
    || (input.cryptoIncome?.donations.length ?? 0) > 0) {
    throw new Error("Mixed charitable source categories require their separate NOL carry allocation");
  }
  const sourceContributions = sum(...input.donations.map(row => {
    const amount = d(row.amount);
    if (!amount.isFinite() || amount.lt(0)) throw new Error("Charitable carry requires finite nonnegative original gifts");
    if (amount.isZero()) return amount;
    if (row.type !== "cash") throw new Error("Charitable carry currently requires actual current public-cash contributions");
    const date = new Date(`${row.dateOfDonation}T00:00:00Z`);
    if (row.qualifiedOrganization !== true || row.isPrivateFoundation !== false || !row.organization.trim()
      || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.dateOfDonation
      || date.getUTCFullYear() !== taxYear) {
      throw new Error("Charitable carry requires actual current public qualification, recipient and payment date");
    }
    return amount;
  }));
  if ([params.tentativeCarryforward, params.nolCarryforward, params.alternativeTaxNolAvailable].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Charitable NOL carry requires finite nonnegative canonical amounts");
  }
  if (!params.alternativeTaxNolAvailable.isZero()) throw new Error("Positive AMT NOL and charitable carry require their independent source coordination worksheet");
  const contributions = roundDollar(sourceContributions);
  const tentativeCarryforward = roundDollar(params.tentativeCarryforward);
  if (tentativeCarryforward.gt(contributions)) throw new Error("Tentative charitable carry exceeds actual contributions");
  const nonexcessContributions = contributions.minus(tentativeCarryforward);
  const nolCarryforward = roundDollar(params.nolCarryforward);
  const counterfactualNolCarryforward = params.computeCarryover(nonexcessContributions);
  if (!Decimal.isDecimal(counterfactualNolCarryforward) || !counterfactualNolCarryforward.isFinite()
    || counterfactualNolCarryforward.lt(0) || counterfactualNolCarryforward.gt(nolCarryforward)
    || !counterfactualNolCarryforward.isInteger()) {
    throw new Error("Charitable counterfactual NOL carry must reconcile with actual succeeding carry");
  }
  const reduction = Decimal.min(tentativeCarryforward, nolCarryforward.minus(counterfactualNolCarryforward));
  const carryforward = tentativeCarryforward.minus(reduction);
  const audit = new AuditTrail();
  audit.record("Section170 NOL Carry Worksheet", "nonexcess", "Contributions retained in the counterfactual", nonexcessContributions,
    "Whole-dollar original current public cash less tentative current excess, including eligible2026floor; receipts stay unchanged",
    { "Original source cash": sourceContributions, "Form-dollar cash": contributions, "Tentative excess": tentativeCarryforward });
  audit.record("Section170 NOL Carry Worksheet", "reduction", "Charitable carry used to preserve succeeding regular NOL", reduction,
    "Smaller of tentative excess or actual NOL carry minus refigured carry without that excess; apply172percentage limits and expiry",
    { "Actual NOL carry": nolCarryforward, "NOL carry without excess": counterfactualNolCarryforward });
  audit.record("Section170 NOL Carry Worksheet", "remaining", "Remaining regular charitable carry", carryforward,
    "Tentative excess less170(d)(1)(B) reduction", { "Tentative excess": tentativeCarryforward, "Reduction": reduction });
  audit.record("Section170 NOL Carry Worksheet", "alternative", "Separate charitable carry with known no ATNOL", tentativeCarryforward,
    "No alternative NOL is available in the supported source cohort; do not copy the regular NOL-related reduction");
  return { taxYear, sourceContributions, contributions, tentativeCarryforward, nonexcessContributions,
    nolCarryforward, counterfactualNolCarryforward, reduction, carryforward,
    alternativeTaxCarryforward: tentativeCarryforward, lines: audit.getLines() };
}
