import type { TaxYearInput } from "@/models/inputs.js";
import { validateQofDispositionFacts } from "@/engine/forms/qof-disposition-facts.js";
import { calculateQofInclusion } from "@/engine/forms/qof-inclusion.js";
import type { QofInvestmentSource } from "@/models/qof-investment-sources.js";

export interface QofDispositionData {
  sourceTaxYear: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
  allInvestmentsReviewed: boolean | null;
  disposedOfQofInvestment: boolean | null;
  deferredGainHeldAtYearEnd?: boolean | null;
  investments?: QofInvestmentData[];
}
export type QofInvestmentData = { [K in keyof QofInvestmentSource]: K extends "sourceFactsConfirmed" | "entireInvestment" ? boolean | null : string };
export const emptyQofInvestment: QofInvestmentData = { sourceId: "", sourceReference: "", sourceFactsConfirmed: null, qofEin: "", description: "", investmentDate: "",
  interestType: "", gainCharacter: "", originalDeferredGain: "", remainingDeferredGain: "", event: "", eventDate: "", entireInvestment: null,
  fairMarketValue: "", fullyTaxableDispositionGain: "", proceeds: "", basisBeforeInclusion: "" };
export const emptyQofDispositionFacts: QofDispositionData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null,
  allInvestmentsReviewed: null, disposedOfQofInvestment: null,
};
export function buildGuidedQofFacts(data: QofDispositionData | undefined, taxYear?: number | null): TaxYearInput["qofDispositionFacts"] {
  if (!data) return undefined;
  if (!Number.isInteger(taxYear) || !/^\d{4}$/.test(data.sourceTaxYear.trim())) throw new Error("QOF sources require the actual return and original source year.");
  const investments = data.investments?.map(row => Object.fromEntries(Object.entries(row)
    .filter(([, value]) => value !== null && value !== "" && !(typeof value === "string" && !value.trim()))
    .map(([key, value]) => [key, typeof value === "string" && key !== "sourceReference" && key !== "description" ? value.trim().replace(/,/g, "") : value])) as QofInvestmentSource);
  const facts = { sourceTaxYear: Number(data.sourceTaxYear), sourceReference: data.sourceReference,
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allInvestmentsReviewed: data.allInvestmentsReviewed ?? undefined,
    disposedOfQofInvestment: data.disposedOfQofInvestment ?? undefined,
    ...(data.deferredGainHeldAtYearEnd !== undefined && data.deferredGainHeldAtYearEnd !== null ? { deferredGainHeldAtYearEnd: data.deferredGainHeldAtYearEnd } : {}),
    ...(investments?.length ? { investments } : {}) };
  validateQofDispositionFacts(facts, taxYear as number);
  calculateQofInclusion({ taxpayer: { taxYear: taxYear as number }, qofDispositionFacts: facts });
  return facts;
}
export function qofDispositionFactErrors(data: QofDispositionData | undefined, taxYear?: number | null): Record<string, string> {
  try { buildGuidedQofFacts(data, taxYear); return {}; }
  catch (error) { return { qofDisposition: error instanceof Error ? error.message : "Complete the actual QOF investment sources." }; }
}
