import { Form1099OIDSchema, type Form1099OID, type PAScheduleA } from "@/models/inputs";
import { calculateForm1099OID } from "@/engine/forms/form-1099-oid";
import { calculatePAOIDSources } from "@/engine/state/pa-oid-sources";
import type { FilingStatus, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, assertKnownFacts, hasEnteredAmount } from "./guided-required-facts";

export const oidAmountFields = [
  ["originalIssueDiscount", "Box 1 original issue discount"], ["otherPeriodicInterest", "Box 2 other periodic interest"],
  ["earlyWithdrawalPenalty", "Box 3 early withdrawal penalty"], ["federalWithheld", "Box 4 federal tax withheld"],
  ["marketDiscount", "Box 5 market discount"], ["acquisitionPremium", "Box 6 acquisition premium"],
  ["treasuryOID", "Box 8 Treasury original issue discount"], ["investmentExpenses", "Box 9 investment expenses"],
  ["bondPremium", "Box 10 bond premium"], ["taxExemptOID", "Box 11 tax-exempt original issue discount"],
] as const;
export const oidAdjustmentFields = ["oid", "periodicInterest", "acquisitionPremium", "bondPremium", "marketDiscount"] as const;
export type OidStateRow = { state: string; statePayerId: string; stateWithheld: string };
export type OidPAFacts = {
  sourceReference?: string; factsConfirmed?: boolean | null; paTaxTreatment?: "taxable" | "pennsylvania" | "us_government" | "";
  strippedBond?: boolean | null; strippedBondExemptInterest?: string; bondPremiumNettedOnStatement?: string; paBondPremiumAmortization?: string;
};
export type OidEntryData = Partial<Record<typeof oidAmountFields[number][0], string>> & {
  payer?: string; payerTin?: string; sourceId?: string; accountHolder?: "primary" | "spouse" | "joint" | "";
  taxYear?: string; sourceFormRevision?: "2024-01" | ""; sourceFactsConfirmed?: boolean | null; recipientAmountsConfirmed?: boolean | null;
  obligationType?: "taxable" | "treasury" | "tax_exempt" | ""; inflationIndexed?: boolean | null; specifiedPrivateActivityBond?: boolean | null; description?: string;
  oidReportedNetOfAcquisitionPremium?: boolean | null; interestReportedNetOfBondPremium?: boolean | null;
  marketDiscountElection?: boolean | null; bondPremiumElection?: boolean | null; modernBondPremiumRulesApply?: boolean | null;
  stateTaxReporting?: "none" | "single" | "multiple" | ""; stateWithholding?: OidStateRow[];
  recipientAdjustmentsNeeded?: boolean | null;
  recipientAdjustments?: Partial<Record<typeof oidAdjustmentFields[number], string>> & { sourceReference?: string };
  usesBondPremiumWorksheet?: boolean | null;
  bondPremiumWorksheet?: { priorInterestInclusions?: string; priorPremiumDeductions?: string; priorCarryforward?: string; disposedDuringYear?: boolean | null; periods?: Array<{ endDate: string; qualifiedStatedInterest: string; amortization: string }> };
  tipsDeflationFacts?: { allInstrumentInterestReportedHere?: boolean | null; priorInterestInclusions?: string; priorOrdinaryLosses?: string; priorCarryforward?: string };
  paFacts?: OidPAFacts;
};
export function isStartedOid(value: unknown): boolean {
  if (typeof value === "string") return !!value.trim();
  if (typeof value === "boolean") return true;
  if (value && typeof value === "object") return Object.values(value).some(isStartedOid);
  return false;
}
/** Preserve source facts while invalidating confirmations affected by an edit. */
export function updateOidEntry(entry: OidEntryData, patch: Partial<OidEntryData>): OidEntryData {
  const confirmationOnly = Object.keys(patch).every(key => key === "sourceFactsConfirmed" || key === "recipientAmountsConfirmed"
    || (key === "paFacts" && Object.keys(patch.paFacts ?? {}).every(field => field === "factsConfirmed")));
  const next = { ...entry, ...patch, ...(patch.paFacts ? { paFacts: { ...entry.paFacts, ...patch.paFacts } } : {}) };
  return confirmationOnly ? next : { ...next, sourceFactsConfirmed: null, recipientAmountsConfirmed: null,
    ...(next.paFacts ? { paFacts: { ...next.paFacts, factsConfirmed: null } } : {}) };
}
function money(value: string | undefined): string {
  if (typeof value !== "string" || !hasEnteredAmount(value)) throw new Error("Enter the actual source amount, including zero.");
  // Decimal validates the amount; preserve source precision without Number conversion.
  parseGuidedCurrency(value);
  return value.trim().replace(/,/g, "");
}
function boolean(value: boolean | null | undefined): boolean | undefined { return value ?? undefined; }
function toSource(entry: OidEntryData): Form1099OID {
  const adjustments = entry.recipientAdjustments;
  const premium = entry.bondPremiumWorksheet;
  const tips = entry.tipsDeflationFacts;
  return Form1099OIDSchema.parse({
    ...Object.fromEntries(oidAmountFields.map(([key]) => [key, money(entry[key])])),
    payer: entry.payer?.trim(), payerTin: entry.payerTin?.trim() || undefined, sourceId: entry.sourceId?.trim(), accountHolder: entry.accountHolder,
    taxYear: Number(entry.taxYear), sourceFormRevision: entry.sourceFormRevision, sourceFactsConfirmed: entry.sourceFactsConfirmed,
    recipientAmountsConfirmed: entry.recipientAmountsConfirmed, obligationType: entry.obligationType, description: entry.description?.trim(),
    inflationIndexed: boolean(entry.inflationIndexed), specifiedPrivateActivityBond: boolean(entry.specifiedPrivateActivityBond),
    oidReportedNetOfAcquisitionPremium: boolean(entry.oidReportedNetOfAcquisitionPremium), interestReportedNetOfBondPremium: boolean(entry.interestReportedNetOfBondPremium),
    marketDiscountElection: boolean(entry.marketDiscountElection), bondPremiumElection: boolean(entry.bondPremiumElection), modernBondPremiumRulesApply: boolean(entry.modernBondPremiumRulesApply),
    stateWithholding: entry.stateWithholding?.map(row => ({ state: row.state.trim().toUpperCase(), statePayerId: row.statePayerId.trim(), stateWithheld: money(row.stateWithheld) })) ?? [],
    recipientAdjustments: entry.recipientAdjustmentsNeeded && adjustments ? { sourceReference: adjustments.sourceReference?.trim(), ...Object.fromEntries(oidAdjustmentFields.map(key => [key, money(adjustments[key])])) } : undefined,
    bondPremiumWorksheet: entry.usesBondPremiumWorksheet && premium ? { priorInterestInclusions: money(premium.priorInterestInclusions), priorPremiumDeductions: money(premium.priorPremiumDeductions), priorCarryforward: money(premium.priorCarryforward), disposedDuringYear: boolean(premium.disposedDuringYear), periods: premium.periods?.map(period => ({ ...period, qualifiedStatedInterest: money(period.qualifiedStatedInterest), amortization: money(period.amortization) })) } : undefined,
    tipsDeflationFacts: tips ? { allInstrumentInterestReportedHere: boolean(tips.allInstrumentInterestReportedHere), priorInterestInclusions: money(tips.priorInterestInclusions), priorOrdinaryLosses: money(tips.priorOrdinaryLosses), priorCarryforward: money(tips.priorCarryforward) } : undefined,
  });
}
function toPA(entry: OidEntryData): NonNullable<PAScheduleA["oidSources"]>[number] {
  const pa = entry.paFacts;
  if (!pa || !entry.sourceId?.trim() || !pa.sourceReference?.trim()) throw new Error("Enter the actual PA OID source and worksheet references.");
  return { sourceId: entry.sourceId.trim(), sourceReference: pa.sourceReference.trim(), factsConfirmed: pa.factsConfirmed as boolean,
    paTaxTreatment: pa.paTaxTreatment as "taxable" | "pennsylvania" | "us_government", strippedBond: pa.strippedBond as boolean,
    bondPremiumNettedOnStatement: money(pa.bondPremiumNettedOnStatement), paBondPremiumAmortization: money(pa.paBondPremiumAmortization),
    ...(hasEnteredAmount(pa.strippedBondExemptInterest) ? { strippedBondExemptInterest: money(pa.strippedBondExemptInterest) } : {}) };
}
export function oidFactErrors(entries: OidEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateCode?: string | null, stateData?: StateReturnData): Record<string, string> {
  const errors: Record<string, string> = {};
  const sources: Form1099OID[] = [];
  (entries ?? []).forEach((entry, index) => {
    if (!isStartedOid(entry)) return;
    const prefix = `oid-${index}`;
    const required = (condition: boolean, field: string, message: string) => { if (!condition) errors[`${prefix}-${field}`] = message; };
    for (const field of ["payer", "sourceId", "description"] as const) required(!!entry[field]?.trim(), field, "Enter the actual payer, source reference and instrument description.");
    required(["primary", "spouse"].includes(entry.accountHolder ?? "") && (entry.accountHolder !== "spouse" || filingStatus === "mfj"), "owner", "Identify the actual taxpayer owner; joint or nominee amounts need separate recipient allocations.");
    required(/^\d{4}$/.test(entry.taxYear ?? "") && Number(entry.taxYear) === taxYear && (taxYear === 2025 || taxYear === 2026), "year", "Enter the actual source year matching this return.");
    required(entry.sourceFormRevision === "2024-01", "revision", "Confirm the January2024 source box layout.");
    required(entry.sourceFactsConfirmed === true, "confirmed", "Review and confirm these actual source facts.");
    required(entry.recipientAmountsConfirmed === true, "recipient", "Confirm the recipient amounts after holding-period, basis and nominee reconciliation.");
    required(["taxable", "treasury", "tax_exempt"].includes(entry.obligationType ?? ""), "obligation", "Identify the actual obligation type.");
    for (const field of ["inflationIndexed", "oidReportedNetOfAcquisitionPremium", "interestReportedNetOfBondPremium", "recipientAdjustmentsNeeded", "usesBondPremiumWorksheet"] as const) required(typeof entry[field] === "boolean", field, "Confirm this source classification from actual records.");
    for (const [key, label] of oidAmountFields) {
      if (key !== "treasuryOID") { const error = amountError(entry[key], label); if (error) errors[`${prefix}-${key}`] = error; }
      else { try { money(entry[key]); } catch { errors[`${prefix}-${key}`] = "Enter the actual signed Treasury OID amount, including zero."; } }
    }
    if (entry.recipientAdjustmentsNeeded === false && isStartedOid(entry.recipientAdjustments)) errors[`${prefix}-recipientAdjustments`] = "Reconcile the saved recipient worksheet with the answer that no adjustments apply.";
    if (entry.recipientAdjustmentsNeeded === true && !entry.recipientAdjustments?.sourceReference?.trim()) errors[`${prefix}-recipientAdjustments`] = "Enter the actual recipient worksheet and its reference.";
    if (entry.usesBondPremiumWorksheet === false && isStartedOid(entry.bondPremiumWorksheet)) errors[`${prefix}-premiumWorksheet`] = "Reconcile the saved premium history with the answer that no worksheet applies.";
    if (entry.usesBondPremiumWorksheet === true && !entry.bondPremiumWorksheet?.periods?.length) errors[`${prefix}-premiumWorksheet`] = "Enter the actual premium history and accrual periods.";
    const count = entry.stateTaxReporting === "none" ? 0 : entry.stateTaxReporting === "single" ? 1 : entry.stateTaxReporting === "multiple" ? 2 : -1;
    required(count >= 0 && (entry.stateWithholding?.length ?? 0) === count, "state", "Confirm the actual number of state rows and enter each source row separately.");
    for (const [rowIndex, row] of (entry.stateWithholding ?? []).entries()) {
      required(/^[A-Z]{2}$/.test(row.state.trim().toUpperCase()) && typeof row.statePayerId === "string" && !amountError(row.stateWithheld, "Box14 state withholding"), `state-${rowIndex}`, "Enter the actual state, payer ID (including an actual blank) and withholding amount.");
      if (stateData?.additionalStateWithholdingEntries?.some(extra => extra.documentType.toUpperCase() === "1099-OID" && extra.payer.trim().toLowerCase() === entry.payer?.trim().toLowerCase() && extra.state.toUpperCase() === row.state.trim().toUpperCase())) errors[`${prefix}-duplicate-state`] = "This OID state withholding is already entered; reconcile the duplicate additional withholding record.";
    }
    const needsPA = stateCode?.toUpperCase() === "PA" || isStartedOid(entry.paFacts);
    if (needsPA) {
      const pa = entry.paFacts;
      required(!!pa?.sourceReference?.trim() && pa.factsConfirmed === true && ["taxable", "pennsylvania", "us_government"].includes(pa.paTaxTreatment ?? "") && typeof pa.strippedBond === "boolean", "pa", "Enter and confirm the separate PA source worksheet, issuer treatment and stripped-bond facts.");
      for (const field of ["bondPremiumNettedOnStatement", "paBondPremiumAmortization"] as const) { const error = amountError(pa?.[field], field); if (error) errors[`${prefix}-pa-${field}`] = error; }
    }
    if (Object.keys(errors).some(key => key.startsWith(`${prefix}-`))) return;
    if (taxYear !== 2025 && taxYear !== 2026) return;
    try {
      const source = toSource(entry);
      const result = calculateForm1099OID([source], taxYear);
      if (result.deflationOrdinaryLoss.gt(0)) throw new Error("Excess TIPS ordinary loss needs its return-line integration before this source can be calculated.");
      if (needsPA) calculatePAOIDSources([source], [toPA(entry)], taxYear);
      sources.push(source);
    } catch (error) { errors[`${prefix}-source`] = error instanceof Error ? error.message : "Complete the actual OID source worksheets."; }
  });
  if (sources.length && !Object.keys(errors).length && (taxYear === 2025 || taxYear === 2026)) {
    try { calculateForm1099OID(sources, taxYear); } catch (error) { errors["oid-sources"] = error instanceof Error ? error.message : "Reconcile OID source identities."; }
  }
  return errors;
}
export function buildOidInputs(entries: OidEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateCode?: string | null): Form1099OID[] {
  assertKnownFacts(oidFactErrors(entries, filingStatus, taxYear, stateCode));
  return (entries ?? []).filter(isStartedOid).map(toSource);
}
export function buildPaOidSources(entries: OidEntryData[] | undefined): NonNullable<PAScheduleA["oidSources"]> {
  return (entries ?? []).filter(isStartedOid).map(toPA);
}
