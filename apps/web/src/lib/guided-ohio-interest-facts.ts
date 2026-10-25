import Decimal from "decimal.js";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid";
import type { GuidedFlowState } from "./guided-interview-flow";
import { isStartedInvestment, type InvestmentData } from "./guided-investment-facts";
import { buildOidInputs } from "./guided-oid-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError } from "./guided-required-facts";

export interface OhioInterestAllocation {
  taxYear: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
  federalTaxExemptInterest: string;
  nonOhioStateLocalInterest: string;
  ohioStateLocalInterest: string;
  otherInterestExemptFromOhio: string;
  federalInterestTaxableByOhio: string;
}

export const ohioInterestAmounts = [
  ["federalTaxExemptInterest", "Federal tax-exempt interest total from source records"],
  ["nonOhioStateLocalInterest", "Other states' and local governments' obligations"],
  ["ohioStateLocalInterest", "Ohio and Ohio local-government obligations"],
  ["otherInterestExemptFromOhio", "Federal or territory obligations also exempt from Ohio tax"],
  ["federalInterestTaxableByOhio", "Federal or territory obligations taxable by Ohio"],
] as const;

export const emptyOhioInterestAllocation: OhioInterestAllocation = {
  taxYear: "", sourceReference: "", sourceFactsConfirmed: null, federalTaxExemptInterest: "",
  nonOhioStateLocalInterest: "", ohioStateLocalInterest: "", otherInterestExemptFromOhio: "", federalInterestTaxableByOhio: "",
};

export function requiresOhioInterestAllocation(investments: InvestmentData | undefined): boolean {
  const positive = (value: string | undefined) => {
    if (!value?.trim() || amountError(value, "interest")) return false;
    return parseGuidedCurrency(value).gt(0);
  };
  return Boolean(investments?.interestEntries.some(entry => positive(entry.taxExemptInterest))
    || investments?.dividendEntries.some(entry => positive(entry.exemptInterestDividends))
    || investments?.oidEntries?.some(entry => entry.obligationType === "tax_exempt"
      && (positive(entry.taxExemptOID) || positive(entry.otherPeriodicInterest))));
}

/** Classify only the actual federal-exempt total; no issuer is inferred from an address. */
export function ohioInterestFactErrors(data: OhioInterestAllocation | undefined, taxYear: number | null | undefined,
  required: boolean, actualFederalTaxExemptInterest?: Decimal): Record<string, string> {
  if (!data) return required || actualFederalTaxExemptInterest?.gt(0)
    ? { ohioInterestAllocation: "Enter the actual Ohio issuer allocation for federal tax-exempt interest." } : {};
  const errors: Record<string, string> = {};
  if (!/^\d{4}$/.test(data.taxYear) || taxYear == null || data.taxYear !== String(taxYear)) errors["ohio-interest-year"] = "Enter the actual interest-source tax year, matching this return.";
  if (!data.sourceReference.trim()) errors["ohio-interest-source"] = "Identify the actual issuer allocation statements or worksheet.";
  if (data.sourceFactsConfirmed !== true) errors["ohio-interest-confirmation"] = "Confirm the issuer classifications after the last source edit.";
  for (const [field, label] of ohioInterestAmounts) {
    const error = amountError(data[field], label);
    if (error) errors[`ohio-interest-${field}`] = error;
  }
  if (!ohioInterestAmounts.some(([field]) => errors[`ohio-interest-${field}`])) {
    const total = parseGuidedCurrency(data.federalTaxExemptInterest);
    const allocated = ohioInterestAmounts.slice(1).reduce((sum, [field]) => sum.plus(parseGuidedCurrency(data[field])), new Decimal(0));
    if (!allocated.eq(total) || (actualFederalTaxExemptInterest !== undefined && !total.eq(actualFederalTaxExemptInterest))) {
      errors["ohio-interest-reconciliation"] = "Reconcile the issuer allocations and total to the current federal tax-exempt interest source records, before rounding.";
    }
  }
  return errors;
}

/** Validate the worksheet against the same actual INT/DIV/OID sources available to this interview. */
export function guidedOhioInterestFactErrors(state: GuidedFlowState): Record<string, string> {
  if (state.segmentation.stateCode !== "OH") return {};
  const data = state.sectionData["state-return"]?.ohioInterestAllocation;
  const investments = state.sectionData["income-investments"];
  const required = requiresOhioInterestAllocation(investments);
  if (!data && !required) return {};
  try {
    let total = new Decimal(0);
    for (const [entries, field] of [[investments?.interestEntries ?? [], "taxExemptInterest"],
      [investments?.dividendEntries ?? [], "exemptInterestDividends"]] as const) {
      for (const entry of entries) {
        if (!isStartedInvestment(entry)) continue;
        const value = (entry as unknown as Record<string, string | undefined>)[field];
        if (amountError(value, "source exempt interest")) throw new Error("Incomplete source amount");
        total = total.plus(parseGuidedCurrency(value));
      }
    }
    if (investments?.oidEntries?.length) {
      const sources = buildOidInputs(investments.oidEntries, state.segmentation.filingStatus, state.taxYear, "OH");
      if (state.taxYear == null) throw new Error("Unknown tax year");
      total = total.plus(calculateForm1099OID(sources, state.taxYear).taxExemptInterest);
    }
    return ohioInterestFactErrors(data, state.taxYear, required, total);
  } catch {
    return { ...ohioInterestFactErrors(data, state.taxYear, required),
      "ohio-interest-current-sources": "Complete the current interest, dividend and OID source facts before reconciling Ohio's allocation." };
  }
}
