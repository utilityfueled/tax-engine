import { assertUniqueDirectReitDividend, resolveQualifiedReitBox5 } from "@/engine/qbi-reit-dividend-source.js";
import { Form1099DivSchema } from "@/models/inputs.js";
import { parseGuidedCurrency, parseGuidedDisplayAmount } from "./guided-currency";
import type { DividendEntryData } from "./guided-interview-flow";
import { amountError, currentLocalCivilDate, guidedAmountChanged } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

export interface GuidedDirectReitDividendFacts {
  sourceTaxYear?: string;
  sourceReference?: string;
  sourceAsOfDate?: string;
  sourceFactsConfirmed?: boolean | null;
  securityIdentifier?: string;
  issuerName?: string;
  originalBox5Amount?: string;
  acquiredOn?: string;
  exDividendOn?: string;
  paidOn?: string;
  heldThrough?: string;
  positionEnded?: boolean | null;
  diminishedRiskDays?: string;
  relatedPaymentAmount?: string;
  singleDirectReitDistributionConfirmed?: boolean | null;
}

export function showGuidedDirectReitDividend(entry: DividendEntryData, taxYear?: number | null): boolean {
  return entry.directReitDividendFacts !== undefined || (taxYear === 2026 && parseGuidedDisplayAmount(entry.section199ADividends).gt(0));
}

export function buildGuidedDirectReitDividend(entry: DividendEntryData, taxYear: number | null | undefined, jointReturn: boolean, seen: Set<string>) {
  if (taxYear !== 2026) return undefined;
  const reportedBox5 = parseGuidedCurrency(entry.section199ADividends);
  const facts = entry.directReitDividendFacts;
  if (facts === undefined && reportedBox5.isZero()) return undefined;
  if (!facts) throw new Error("Complete the original direct REIT distribution facts for 2026 Box 5.");
  if (facts.sourceTaxYear !== String(taxYear)) throw new Error("Enter the return year shown on the original REIT distribution records.");
  if (typeof facts.positionEnded !== "boolean") throw new Error("Confirm whether the position was sold or still held on the recorded date.");
  if (typeof facts.diminishedRiskDays !== "string" || !/^\d{1,2}$/.test(facts.diminishedRiskDays.trim())) {
    throw new Error("Enter the actual number of diminished-risk days, including zero when confirmed.");
  }
  const originalAmountError = amountError(facts.originalBox5Amount, "original Box 5 dividend amount");
  const obligationAmountError = amountError(facts.relatedPaymentAmount, "portion subject to a related-payment obligation");
  if (originalAmountError || obligationAmountError) throw new Error(originalAmountError ?? obligationAmountError);
  const packet = {
    sourceTaxYear: taxYear,
    sourceReference: facts.sourceReference?.trim() ?? "",
    sourceAsOfDate: facts.sourceAsOfDate ?? "",
    sourceFactsConfirmed: facts.sourceFactsConfirmed === true,
    securityIdentifier: facts.securityIdentifier?.trim() ?? "",
    issuerName: facts.issuerName?.trim() ?? "",
    originalBox5Amount: parseGuidedCurrency(facts.originalBox5Amount).toFixed(),
    acquiredOn: facts.acquiredOn ?? "",
    exDividendOn: facts.exDividendOn ?? "",
    paidOn: facts.paidOn ?? "",
    heldThrough: facts.heldThrough ?? "",
    positionEnded: facts.positionEnded,
    diminishedRiskDays: Number(facts.diminishedRiskDays),
    relatedPaymentAmount: parseGuidedCurrency(facts.relatedPaymentAmount).toFixed(),
    singleDirectReitDistributionConfirmed: facts.singleDirectReitDistributionConfirmed === true,
  };
  const statement = Form1099DivSchema.parse({
    taxYear: /^\d{4}$/.test(entry.sourceTaxYear?.trim() ?? "") ? Number(entry.sourceTaxYear) : undefined,
    payer: entry.payer.trim(),
    accountHolder: entry.accountHolder || undefined,
    payerTin: entry.payerTin?.trim() || undefined,
    accountReference: entry.accountReference?.trim() || undefined,
    ordinaryDividends: parseGuidedCurrency(entry.ordinaryDividends).toFixed(),
    qualifiedDividends: parseGuidedCurrency(entry.qualifiedDividends).toFixed(),
    section199ADividends: reportedBox5.toFixed(),
    directReitDividendFacts: packet,
  });
  resolveQualifiedReitBox5(statement, taxYear, currentLocalCivilDate());
  assertUniqueDirectReitDividend(statement, jointReturn, seen);
  return packet;
}

export function invalidateGuidedDirectReitDividend(entry: DividendEntryData): DividendEntryData {
  const facts = entry.directReitDividendFacts;
  return facts?.sourceFactsConfirmed != null ? { ...entry, directReitDividendFacts: { ...facts, sourceFactsConfirmed: null } } : entry;
}

export function invalidateEditedGuidedDirectReitDividend(before: DividendEntryData | undefined, after: DividendEntryData): DividendEntryData {
  if (!before || before === after || !after.directReitDividendFacts) return after;
  const { originalBox5Amount: priorOriginalAmount, relatedPaymentAmount: priorRelatedAmount, ...priorFacts } = before.directReitDividendFacts ?? {};
  const { originalBox5Amount, relatedPaymentAmount, ...facts } = after.directReitDividendFacts;
  const identity = (entry: DividendEntryData) => [entry.payer, entry.payerTin, entry.accountReference, entry.accountHolder, entry.sourceTaxYear];
  return guidedSourceValuesChanged(identity(before), identity(after))
    || guidedAmountChanged(before.ordinaryDividends, after.ordinaryDividends)
    || guidedAmountChanged(before.qualifiedDividends, after.qualifiedDividends)
    || guidedAmountChanged(before.section199ADividends, after.section199ADividends)
    || guidedAmountChanged(priorOriginalAmount, originalBox5Amount)
    || guidedAmountChanged(priorRelatedAmount, relatedPaymentAmount)
    || guidedSourceValuesChanged(priorFacts, facts)
    ? invalidateGuidedDirectReitDividend(after) : after;
}
