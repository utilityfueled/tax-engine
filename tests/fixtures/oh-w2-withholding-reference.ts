/** Synthetic complete originals fixed before candidate output; spec/state/oh-w2-withholding-reference.yaml. */
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { OhioPaymentFactsSchema } from "@/models/ohio-payments.js";
import { ohioPaymentFixture } from "./oh-payments.js";
import { ohioActualW2WithholdingFixture } from "./oh-w2-state-withholding-consumer.js";
import { actualDigitalAssetSource } from "./digital-asset-sources.js";
export function ohioConsumerW2(input: TaxYearInput) { const w2 = input.w2s[0]; if (!w2) throw new Error("Actual synthetic W2 required"); return w2; }
export function ohioConsumerPacket(input: TaxYearInput) { const packet = ohioConsumerW2(input).stateLocalSources; if (!packet) throw new Error("Actual synthetic packet required"); return packet; }
export function ohioConsumerOHRow(input: TaxYearInput) { const row = ohioConsumerPacket(input).stateRows.find(row => row.state === "OH"); if (!row) throw new Error("Actual synthetic Ohio row required"); return row; }
type Snapshots = { ohioResidency: { originalFederalSources: Record<string, unknown> }; ohioPayments: { originalFederalSources: Record<string, unknown> } };
export function rebindOhioConsumerW2(input: TaxYearInput & Snapshots) {
  const { stateLocalSources: _s, ...originalW2 } = ohioConsumerW2(input); ohioConsumerPacket(input).originalW2 = structuredClone(originalW2);
  const { ohioResidency: _r, ohioPayments: _p, ...original } = input;
  input.ohioResidency.originalFederalSources = structuredClone(original); input.ohioPayments.originalFederalSources = structuredClone(original);
}
export function unusedOhioConsumerScalars(input: TaxYearInput & Snapshots) {
  for (const key of ["state", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld", "localityName", "locality"] as const) delete ohioConsumerW2(input)[key];
  ohioConsumerPacket(input).legacyScalarProjection = "unused"; rebindOhioConsumerW2(input);
}
export const statuses = ["full_year_resident", "part_year_resident", "nonresident"] as const;
export function ohioReferenceFixture(status: typeof statuses[number] = "full_year_resident", mode: "pa_first" | "oh_first" | "unused" | "zero" | "no_oh" | "cents" = "pa_first") {
  const input = ohioActualW2WithholdingFixture(mode === "zero" || mode === "no_oh" ? "0" : "1000");
  input.ohioResidency = ohioPaymentFixture(status).ohioResidency;
  const packet = ohioConsumerPacket(input), w2 = ohioConsumerW2(input);
  if (mode === "oh_first") { packet.stateRows.reverse(); packet.stateRows.forEach((row, i) => { row.printedRow = i + 1; }); Object.assign(w2, { state: "OH", stateTaxWithheld: "1000" }); }
  if (mode === "no_oh") { packet.stateRows = packet.stateRows.filter(row => row.state === "PA"); packet.stateReporting = "single"; }
  if (mode === "cents") { ohioConsumerOHRow(input).withheld = "1000.51"; }
  rebindOhioConsumerW2(input);
  if (mode === "unused") unusedOhioConsumerScalars(input);
  const principal = mode === "zero" || mode === "no_oh" ? ({ full_year_resident: "2323", part_year_resident: "929", nonresident: "465" }[status]) : status === "full_year_resident" ? mode === "cents" ? "1322" : "1323" : null;
  const payments = OhioPaymentFactsSchema.parse({ ...input.ohioPayments, remainingTaxPayment: principal === null ? { status: "no_remaining_tax", sourceReference: "Actual synthetic no remaining tax", sourceFactsConfirmed: true } : { status: "expected_payment", sourceReference: "Actual synthetic payment endpoint", sourceFactsConfirmed: true, date: "2026-04-15", amountAppliedToTax: principal } });
  return { ...input, ohioPayments: payments };
}
export function allOhioSourceFamilies(): TaxYearInput {
  const base = ohioReferenceFixture();
  const { ohioPayments: _p, ohioResidency: _r, ...original } = base;
  ohioConsumerOHRow(base).withheld = "1000.01";
  const input = TaxYearInputSchema.parse({ ...original,
    formW2G: [{ payer: "Synthetic casino", reportableWinnings: "0", federalWithheld: "0", state: "OH", stateWithheld: "2.02" }],
    form1099G: [{ payer: "Synthetic agency", unemploymentCompensation: "0", stateOrLocalTaxRefund: "0", federalWithheld: "0", state: "OH", stateWithheld: "3.03" }],
    form1099K: [{ pse: "Synthetic payments", grossAmount: "0", incomeType: "other", state: "OH", stateWithheld: "4.04" }],
    form1099R: [{ payer: "Synthetic pension", grossDistribution: "0", taxableAmount: "0", federalWithheld: "0", state: "OH", stateWithheld: "5.05", distributionCode: "7", iraSepSimple: false }],
    form1099Nec: [{ payer: "Synthetic client", nonemployeeCompensation: "0", federalWithheld: "0", state: "OH", stateWithheld: "6.06", stateIncome: "0" }],
    form1099Misc: [{ payer: "Synthetic payer", otherIncome: "0", federalWithheld: "0", state: "OH", stateWithheld: "7.07", stateIncome: "0" }],
    form1099Int: [{ payer: "Synthetic bank", interestIncome: "0", state: "OH", stateWithheld: "8.08" }],
    form1099Div: [{ payer: "Synthetic fund", ordinaryDividends: "0", state: "OH", stateWithheld: "9.09" }],
    form1099B: [{ broker: "Synthetic broker", transactions: [], state: "OH", stateWithheld: "10.10" }],
    form1099OID: [{ payer: "Synthetic OID", sourceId: "actual-oid", taxYear: 2025, sourceFormRevision: "2024-01", sourceFactsConfirmed: true, recipientAmountsConfirmed: true, obligationType: "taxable", inflationIndexed: false, description: "Synthetic bond", originalIssueDiscount: "0", otherPeriodicInterest: "0", earlyWithdrawalPenalty: "0", federalWithheld: "0", marketDiscount: "0", acquisitionPremium: "0", treasuryOID: "0", investmentExpenses: "0", bondPremium: "0", taxExemptOID: "0", oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false, stateWithholding: [{ state: "OH", statePayerId: "PRIVATE-OID-ID", stateWithheld: "11.11" }] }],
    form1099DA: [{ ...actualDigitalAssetSource, stateTaxReporting: "single", state: "OH", stateWithheld: "12.12", stateIdentificationNumber: "PRIVATE-DA-ID" }],
  });
  const w2 = ohioConsumerW2(input); const { stateLocalSources: _s, ...w2Original } = w2;
  ohioConsumerPacket(input).originalW2 = structuredClone(w2Original);
  return input;
}
