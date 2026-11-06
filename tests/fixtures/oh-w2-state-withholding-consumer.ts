/** Explicit synthetic original controls; Ohio tax2323 is retained from OH18. */
import type { W2StateLocalSources } from "@/models/w2-state-local.js";
import { ohioPaymentFixture } from "./oh-payments.js";

export type OhioW2ConsumerInput = ReturnType<typeof ohioPaymentFixture>;
export function ohioConsumerW2(input: OhioW2ConsumerInput) {
  const w2 = input.w2s[0];
  if (!w2) throw new Error("Synthetic Ohio consumer requires one actual W2");
  return w2;
}
export function ohioConsumerPacket(input: OhioW2ConsumerInput) {
  const packet = ohioConsumerW2(input).stateLocalSources;
  if (!packet) throw new Error("Synthetic Ohio consumer requires canonical actual packet");
  return packet;
}
export function rebindOhioConsumerOuter(input: OhioW2ConsumerInput) {
  const { ohioResidency: _residency, ohioPayments: _payments, ...original } = input;
  input.ohioResidency.originalFederalSources = structuredClone(original);
  input.ohioPayments.originalFederalSources = structuredClone(original);
}
export function rebindOhioConsumerW2(input: OhioW2ConsumerInput) {
  const w2 = ohioConsumerW2(input);
  const { stateLocalSources: _packet, ...original } = w2;
  ohioConsumerPacket(input).originalW2 = structuredClone(original);
  rebindOhioConsumerOuter(input);
}
export function unusedOhioConsumerScalars(input: OhioW2ConsumerInput) {
  const w2 = ohioConsumerW2(input);
  for (const field of ["state", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld", "localityName", "locality"] as const) delete w2[field];
  ohioConsumerPacket(input).legacyScalarProjection = "unused";
  rebindOhioConsumerW2(input);
}
export function ohioActualW2WithholdingFixture(ohioWithheld: "1000" | "0" = "1000"): OhioW2ConsumerInput {
  const input = ohioPaymentFixture();
  const w2 = ohioConsumerW2(input);
  Object.assign(w2, { state: "PA", stateWages: "100000", stateTaxWithheld: "1535", localWages: "0", localTaxWithheld: "0", localityName: "" });
  const person = input.taxpayer.primary;
  const sources: W2StateLocalSources = {
    sourceTaxYear: 2025, sourceReference: "PRIVATE-SYNTHETIC-OH-W2-ORIGINAL", sourceFactsConfirmed: true,
    owner: { accountHolder: "primary", originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn } },
    originalW2: structuredClone(w2), currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
    stateReporting: "multiple", localReporting: "none", legacyScalarProjection: "first_entered_rows",
    stateRows: [
      { printedRow: 1, sourceReference: "PRIVATE-ACTUAL-PA-FIRST", state: "PA", employerStateIDStatus: "reported", employerStateID: "PRIVATE-PA-STATE-ID", wages: "100000", withheld: "1535" },
      { printedRow: 2, sourceReference: "PRIVATE-ACTUAL-OH-SECOND", state: "OH", employerStateIDStatus: "reported", employerStateID: "PRIVATE-OH-STATE-ID", wages: "100000", withheld: ohioWithheld },
    ], localRows: [],
  };
  w2.stateLocalSources = sources;
  input.ohioPayments.remainingTaxPayment.amountAppliedToTax = ohioWithheld === "0" ? "2323" : "1323";
  rebindOhioConsumerOuter(input);
  return input;
}
