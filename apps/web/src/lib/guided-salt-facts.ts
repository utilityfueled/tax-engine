import Decimal from "decimal.js";
import type { GuidedFlowState } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

/** Cross-check only supported, actually classified non-W-2 source withholding. */
export function nonW2TaxAllocationErrors(state: GuidedFlowState): Record<string, string> {
  const investments = state.sectionData["income-investments"];
  const sources = [
    ...investments?.interestEntries ?? [], ...investments?.dividendEntries ?? [],
    ...investments?.brokerageEntries ?? [], ...state.sectionData["income-self-employment"]?.necEntries ?? [],
    ...state.sectionData["income-retirement"]?.entries ?? [],
    ...state.sectionData["income-unemployment"]?.entries ?? [],
  ];
  const oidWithholding = (investments?.oidEntries ?? []).flatMap(source => source.stateWithholding ?? []).reduce((sum, row) => !amountError(row.stateWithheld, "OID source withholding") ? sum.plus(parseGuidedCurrency(row.stateWithheld)) : sum, new Decimal(0));
  const stateTotal = sources.reduce((sum, source) => source.stateTaxReporting === "single" && !amountError(source.stateWithheld, "source withholding")
    ? sum.plus(parseGuidedCurrency(source.stateWithheld)) : sum, oidWithholding);
  const total = (state.sectionData["income-retirement"]?.entries ?? []).reduce((sum, source) => source.localTaxReporting === "single" && !amountError(source.localTaxWithheld, "local source withholding")
    ? sum.plus(parseGuidedCurrency(source.localTaxWithheld)) : sum, stateTotal);
  const allocation = state.sectionData.deductions?.nonW2IncomeTaxesDeductedElsewhere;
  if (!hasEnteredAmount(allocation) && !total.gt(0)) return {};
  const error = amountError(allocation, "non-W-2 withholding already deducted on other schedules");
  if (error) return { nonW2IncomeTaxesDeductedElsewhere: error };
  if (parseGuidedCurrency(allocation).gt(total)) return { nonW2IncomeTaxesDeductedElsewhere: "The amount deducted elsewhere exceeds the actual non-W-2 source withholding entered." };
  return {};
}
