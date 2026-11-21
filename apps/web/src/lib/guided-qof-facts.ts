import type { TaxYearInput } from "@/models/inputs.js";
import { validateQofDispositionFacts } from "@/engine/forms/qof-disposition-facts.js";
import { calculateQofInclusion } from "@/engine/forms/qof-inclusion.js";
import type { QofInvestmentSource } from "@/models/qof-investment-sources.js";
import type { GuidedFlowState } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

export interface QofDispositionData {
  sourceTaxYear: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
  allInvestmentsReviewed: boolean | null;
  disposedOfQofInvestment: boolean | null;
  deferredGainHeldAtYearEnd?: boolean | null;
  investments?: QofInvestmentData[];
}
export type QofInvestmentData = { [K in keyof QofInvestmentSource]: K extends "sourceFactsConfirmed" | "entireInvestment" | "noSpecialGainCode" | "saleGainAllCapitalConfirmed" ? boolean | null : string };
export const emptyQofInvestment: QofInvestmentData = { sourceId: "", sourceReference: "", sourceFactsConfirmed: null, qofEin: "", description: "", investmentDate: "",
  interestType: "", gainCharacter: "", originalDeferredGain: "", remainingDeferredGain: "", event: "", eventDate: "", entireInvestment: null, noSpecialGainCode: null, saleGainAllCapitalConfirmed: null,
  fairMarketValue: "", fullyTaxableDispositionGain: "", proceeds: "", basisBeforeInclusion: "" };
const QOF_MONEY = new Set(["originalDeferredGain", "remainingDeferredGain", "fairMarketValue", "fullyTaxableDispositionGain", "proceeds", "basisBeforeInclusion"]);
export const emptyQofDispositionFacts: QofDispositionData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null,
  allInvestmentsReviewed: null, disposedOfQofInvestment: null,
};

export function guidedQofDiscovery(state: GuidedFlowState): { answer: boolean | null; needsDetails: boolean; detailIssue?: string; worksheetIssue?: string } {
  const { taxYear } = state;
  if (taxYear !== 2025 && taxYear !== 2026) return { answer: null, needsDetails: false };
  const savedFacts = state.sectionData["income-investments"]?.qofDispositionFacts;
  const sourceYear = typeof savedFacts?.sourceTaxYear === "string" ? savedFacts.sourceTaxYear.trim() : undefined;
  const differentYear = Boolean(sourceYear && sourceYear !== String(taxYear));
  const current = taxYear === 2026 && !differentYear ? savedFacts : undefined;
  const recordsReportGain = current?.disposedOfQofInvestment === true || current?.deferredGainHeldAtYearEnd === true
    || (Array.isArray(current?.investments) && current.investments.length > 0);
  const recordedNo = current?.disposedOfQofInvestment === false && current.deferredGainHeldAtYearEnd === false;
  const disclosure = taxYear === 2026 ? state.sectionData.review?.qof2026Disclosure : undefined;
  const answer = typeof disclosure === "boolean" ? disclosure : recordsReportGain ? true : recordedNo ? false : null;
  const validationIssue = differentYear ? `The saved Qualified Opportunity Fund worksheet does not match tax year ${taxYear}.`
    : savedFacts && !recordsReportGain ? qofDispositionFactErrors(savedFacts, taxYear).qofDisposition : undefined;
  const worksheetIssue = validationIssue ? `${validationIssue} Correct the saved worksheet or remove it if it does not apply.` : undefined;
  const needsDetails = answer === true || recordsReportGain || Boolean(worksheetIssue);
  const answerIssue = answer === true && !recordsReportGain
    ? "Enter your 2026 Qualified Opportunity Fund disposition or year-end deferred gain records."
    : answer === false && recordsReportGain
      ? "The investment records show a Qualified Opportunity Fund disposition or held gain. Correct those records or change the answer in Personal information."
      : undefined;
  return { answer, needsDetails, detailIssue: worksheetIssue ?? answerIssue, worksheetIssue };
}

export function buildGuidedQofFacts(data: QofDispositionData | undefined, taxYear?: number | null): TaxYearInput["qofDispositionFacts"] {
  if (!data) return undefined;
  if (!Number.isInteger(taxYear) || typeof data.sourceTaxYear !== "string" || !/^\d{4}$/.test(data.sourceTaxYear.trim())) {
    throw new Error("QOF sources require the actual return and original source year.");
  }
  const investments = data.investments?.map(row => Object.fromEntries(Object.entries(row)
    .filter(([, value]) => value !== null && value !== "" && !(typeof value === "string" && !value.trim()))
    .map(([key, value]) => [key, typeof value === "string" ? QOF_MONEY.has(key) ? parseGuidedCurrency(value).toFixed() : value.trim() : value])) as QofInvestmentSource);
  const facts = { sourceTaxYear: Number(data.sourceTaxYear), sourceReference: data.sourceReference,
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allInvestmentsReviewed: data.allInvestmentsReviewed ?? undefined,
    disposedOfQofInvestment: data.disposedOfQofInvestment ?? undefined,
    ...(data.deferredGainHeldAtYearEnd !== undefined && data.deferredGainHeldAtYearEnd !== null ? { deferredGainHeldAtYearEnd: data.deferredGainHeldAtYearEnd } : {}),
    ...(investments?.length ? { investments } : {}) };
  validateQofDispositionFacts(facts, taxYear as number);
  calculateQofInclusion({ taxpayer: { taxYear: taxYear as number }, qofDispositionFacts: facts });
  return facts;
}
export function qofDispositionFactErrors(data: QofDispositionData | undefined, taxYear?: number | null, sectionStarted = true): Record<string, string> {
  // All remaining deferred gain reaches inclusion in 2026, so silence cannot mean none.
  if (taxYear === 2026 && !data && sectionStarted) return { qofDisposition: "Answer whether you held QOF deferred gain on December 31, 2026." };
  try { buildGuidedQofFacts(data, taxYear); return {}; }
  catch (error) { return { qofDisposition: error instanceof Error ? error.message : "Complete the actual QOF investment sources." }; }
}
