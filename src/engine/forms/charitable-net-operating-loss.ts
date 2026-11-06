/** Current single-category carry coordination. Spec: charitable-net-operating-loss.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar } from "@/utils/decimal.js";
import { readCurrentCharitableSourceForNol, type CharitableNolContributionLimit, type CurrentCharitableNolSource } from "@/utils/charitable-nol-source.js";

export interface CharitableNolCarryoverResult {
  taxYear: number;
  category: CurrentCharitableNolSource["category"];
  medium: CurrentCharitableNolSource["medium"];
  sourceDigest: string;
  sourceContributions: Decimal;
  contributions: Decimal;
  tentativeCarryforward: Decimal;
  nonexcessContributions: Decimal;
  nolCarryforward: Decimal;
  counterfactualNolCarryforward: Decimal;
  reduction: Decimal;
  carryforward: Decimal;
  /** Known-empty ATNOL history only; never copied from the reduced regular carry. */
  alternativeTaxCarryforward?: Decimal;
  lines: CalculatedLine[];
}

export function calculateCharitableNolCarryover(params: {
  input: TaxYearInput;
  tentativeCarryforward: Decimal;
  nolCarryforward: Decimal;
  alternativeTaxNolAvailable: Decimal;
  computeCarryover: (limit: CharitableNolContributionLimit) => Decimal;
}): CharitableNolCarryoverResult {
  const { input } = params;
  const taxYear = input.taxpayer.taxYear;
  const source = readCurrentCharitableSourceForNol(input);
  const sourceContributions = source.amount;
  if ([params.tentativeCarryforward, params.nolCarryforward, params.alternativeTaxNolAvailable].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Charitable NOL carry requires finite nonnegative canonical amounts");
  }
  const contributions = roundDollar(sourceContributions);
  const tentativeCarryforward = roundDollar(params.tentativeCarryforward);
  if (tentativeCarryforward.gt(contributions)) throw new Error("Tentative charitable carry exceeds actual contributions");
  const nonexcessContributions = contributions.minus(tentativeCarryforward);
  const nolCarryforward = roundDollar(params.nolCarryforward);
  const counterfactualNolCarryforward = params.computeCarryover({ category: source.category, medium: source.medium, sourceDigest: source.sourceDigest, amount: nonexcessContributions, ledger: "regular" });
  if (!Decimal.isDecimal(counterfactualNolCarryforward) || !counterfactualNolCarryforward.isFinite()
    || counterfactualNolCarryforward.lt(0) || counterfactualNolCarryforward.gt(nolCarryforward)
    || !counterfactualNolCarryforward.isInteger()) {
    throw new Error("Charitable counterfactual NOL carry must reconcile with actual succeeding carry");
  }
  const reduction = Decimal.min(tentativeCarryforward, nolCarryforward.minus(counterfactualNolCarryforward));
  const carryforward = tentativeCarryforward.minus(reduction);
  const audit = new AuditTrail();
  audit.record("Section170 NOL Carry Worksheet", "nonexcess", "Contributions retained in the counterfactual", nonexcessContributions,
    "Whole-dollar original current qualified contribution value less tentative current excess, including eligible2026floor; receipts stay unchanged",
    { "Original source value": sourceContributions, "Form-dollar qualified value": contributions, "Tentative excess": tentativeCarryforward });
  audit.record("Section170 NOL Carry Worksheet", "reduction", "Charitable carry used to preserve succeeding regular NOL", reduction,
    "Smaller of tentative excess or actual NOL carry minus refigured carry without that excess; apply172percentage limits and expiry",
    { "Actual NOL carry": nolCarryforward, "NOL carry without excess": counterfactualNolCarryforward });
  audit.record("Section170 NOL Carry Worksheet", "remaining", "Remaining regular charitable carry", carryforward,
    "Tentative excess less170(d)(1)(B) reduction", { "Tentative excess": tentativeCarryforward, "Reduction": reduction });
  if (params.alternativeTaxNolAvailable.isZero()) audit.record("Section170 NOL Carry Worksheet", "alternative", "Separate charitable carry with known no ATNOL", tentativeCarryforward,
    "No alternative NOL is available in the supported source cohort; do not copy the regular NOL-related reduction");
  return { taxYear, category: source.category, medium: source.medium, sourceDigest: source.sourceDigest, sourceContributions, contributions, tentativeCarryforward, nonexcessContributions,
    nolCarryforward, counterfactualNolCarryforward, reduction, carryforward,
    alternativeTaxCarryforward: params.alternativeTaxNolAvailable.isZero() ? tentativeCarryforward : undefined, lines: audit.getLines() };
}
