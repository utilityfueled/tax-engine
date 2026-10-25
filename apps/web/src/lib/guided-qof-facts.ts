import type { TaxYearInput } from "@/models/inputs.js";
import { validateQofDispositionFacts } from "@/engine/forms/qof-disposition-facts.js";

export interface QofDispositionData {
  sourceTaxYear: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
  allInvestmentsReviewed: boolean | null;
  disposedOfQofInvestment: boolean | null;
}
export const emptyQofDispositionFacts: QofDispositionData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null,
  allInvestmentsReviewed: null, disposedOfQofInvestment: null,
};
export function buildGuidedQofFacts(data: QofDispositionData | undefined, taxYear?: number | null): TaxYearInput["qofDispositionFacts"] {
  if (!data) return undefined;
  if (!Number.isInteger(taxYear) || !/^\d{4}$/.test(data.sourceTaxYear.trim())) throw new Error("QOF sources require the actual return and original source year.");
  const facts = { sourceTaxYear: Number(data.sourceTaxYear), sourceReference: data.sourceReference,
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allInvestmentsReviewed: data.allInvestmentsReviewed ?? undefined,
    disposedOfQofInvestment: data.disposedOfQofInvestment ?? undefined };
  validateQofDispositionFacts(facts, taxYear as number);
  return facts;
}
export function qofDispositionFactErrors(data: QofDispositionData | undefined, taxYear?: number | null): Record<string, string> {
  try { buildGuidedQofFacts(data, taxYear); return {}; }
  catch (error) { return { qofDisposition: error instanceof Error ? error.message : "Complete the actual QOF investment sources." }; }
}
