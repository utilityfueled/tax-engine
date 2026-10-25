/** Independent AMT charity carry. Spec: alternative-charitable-net-operating-loss.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { readCurrentPublicCashForNol } from "@/utils/charitable-nol-source.js";
import { roundDollar } from "@/utils/decimal.js";

export interface AlternativeCharitableNolCarryoverResult {
  taxYear: number;
  sourceContributions: Decimal;
  contributions: Decimal;
  tentativeCarryforward: Decimal;
  nonexcessContributions: Decimal;
  nolCarryforward: Decimal;
  counterfactualNolCarryforward: Decimal;
  reduction: Decimal;
  carryforward: Decimal;
  lines: CalculatedLine[];
}

export function calculateAlternativeCharitableNolCarryover(params: {
  input: TaxYearInput;
  tentativeCarryforward: Decimal;
  alternativeTaxNolAvailable: Decimal;
  nolCarryforward: Decimal;
  computeCarryover: (nonexcessContributions: Decimal) => Decimal;
}): AlternativeCharitableNolCarryoverResult {
  const { input } = params; const taxYear = input.taxpayer.taxYear;
  const history = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory;
  if (history?.sourceTaxYear !== taxYear - 1 || !history.sourceReference?.trim() || history.sourceFactsConfirmed !== true
    || history.allCarryoversIncluded !== true || !Array.isArray(history.priorRegularCarryovers) || !Array.isArray(history.priorAlternativeCarryovers)) {
    throw new Error("AMT charitable coordination requires complete independent prior regular and alternative charitable histories");
  }
  if (history.priorRegularCarryovers.length || history.priorAlternativeCarryovers.length) {
    throw new Error("Prior regular or alternative charitable histories require their separate category and vintage coordination method");
  }
  const sourceContributions = readCurrentPublicCashForNol(input);
  for (const value of [params.tentativeCarryforward, params.nolCarryforward, params.alternativeTaxNolAvailable]) {
    if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0) || !value.isInteger()) {
      throw new Error("Alternative charitable carry requires finite nonnegative canonical whole-dollar amounts");
    }
  }
  if (!params.alternativeTaxNolAvailable.gt(0) || params.nolCarryforward.gt(params.alternativeTaxNolAvailable)) {
    throw new Error("Alternative charitable carry requires the actual positive independent ATNOL source balance");
  }
  const contributions = roundDollar(sourceContributions);
  const tentativeCarryforward = params.tentativeCarryforward;
  if (tentativeCarryforward.gt(contributions)) throw new Error("Tentative alternative charitable carry exceeds actual contributions");
  const nonexcessContributions = contributions.minus(tentativeCarryforward);
  const nolCarryforward = params.nolCarryforward;
  const counterfactualNolCarryforward = params.computeCarryover(nonexcessContributions);
  if (!Decimal.isDecimal(counterfactualNolCarryforward) || !counterfactualNolCarryforward.isFinite()
    || !counterfactualNolCarryforward.isInteger() || counterfactualNolCarryforward.lt(0) || counterfactualNolCarryforward.gt(nolCarryforward)) {
    throw new Error("Alternative charitable comparison must reconcile with actual succeeding ATNOL carry");
  }
  const reduction = Decimal.min(tentativeCarryforward, nolCarryforward.minus(counterfactualNolCarryforward));
  const carryforward = tentativeCarryforward.minus(reduction);
  const audit = new AuditTrail(); const form = "Section170 Alternative NOL Carry Worksheet";
  audit.record(form, "nonexcess", "Current public cash retained in the alternative comparison", nonexcessContributions,
    "Rounded original cash less tentative current charity carry, including eligible2026 floor; keep regular AGI and actual NOLD in the AMT replay",
    { "Original source cash": sourceContributions, "Form-dollar cash": contributions, "Tentative alternative excess": tentativeCarryforward });
  audit.record(form, "reduction", "Alternative charitable carry used to preserve succeeding ATNOL", reduction,
    "Smaller of tentative carry or actual succeeding ATNOL carry less carry without excess gifts; retain actual current deduction and apply expiry",
    { "Actual ATNOL carry": nolCarryforward, "ATNOL carry without excess": counterfactualNolCarryforward });
  audit.record(form, "remaining", "Remaining alternative charitable carry", carryforward,
    "Tentative alternative carry less its independent170(d)(1)(B) reduction; never copy regular charity carry",
    { "Tentative alternative carry": tentativeCarryforward, "Reduction": reduction });
  return { taxYear, sourceContributions, contributions, tentativeCarryforward, nonexcessContributions,
    nolCarryforward, counterfactualNolCarryforward, reduction, carryforward, lines: audit.getLines() };
}
