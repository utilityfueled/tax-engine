/** Literal synthetic current account originals retained before any output. */
import type { OhioPaymentFacts } from "@/models/ohio-payments.js";
import { actualOhioPayment } from "./oh-payments.js";
import { ohioActualW2WithholdingFixture } from "./oh-w2-state-withholding-consumer.js";

export function ohioActualDatedPaymentFixture() {
  const input = ohioActualW2WithholdingFixture();
  const estimate = actualOhioPayment(input, "200", "2025-05-15");
  const facts: OhioPaymentFacts = {
    ...input.ohioPayments, paymentRows: [estimate],
    currentTiming: { kind: "expected", expectedDate: "2026-04-15", asOfDate: "2026-02-01" },
    remainingTaxPayment: {
      status: "actual_payment", sourceReference: "PRIVATE-ACTUAL-DATED-BALANCE-ORIGINAL", sourceFactsConfirmed: true,
      date: "2026-02-01", amountAppliedToTax: "1123", accountHolder: "primary",
      original: { accountName: "Avery Payment", accountSsn: input.taxpayer.primary.ssn, taxYear: 2025,
        returnType: "it1040", kind: "balance", date: "2026-02-01", amount: "1151", confirmationNumber: "PRIVATE-ACTUAL-FEB1-BALANCE" },
    },
  };
  return { ...input, ohioPayments: facts };
}
export type OhioActualDatedInput = ReturnType<typeof ohioActualDatedPaymentFixture>;
export function rebindOhioDatedOriginals(input: OhioActualDatedInput) {
  const { ohioResidency: _residency, ohioPayments: _payments, ...original } = input;
  input.ohioResidency.originalFederalSources = structuredClone(original);
  input.ohioPayments.originalFederalSources = structuredClone(original);
}
export function ohioActualBalance(input: OhioActualDatedInput) {
  const balance = input.ohioPayments.remainingTaxPayment;
  if (balance.status !== "actual_payment") throw new Error("Literal dated fixture needs actual balance receipt");
  return balance;
}
export function ohioActualEstimate(input: OhioActualDatedInput) {
  const row = input.ohioPayments.paymentRows[0];
  if (!row) throw new Error("Literal dated fixture needs actual estimated receipt");
  return row;
}

export function ohioDatedW2(input: OhioActualDatedInput) {
  const w2=input.w2s[0];
  if(!w2)throw new Error("Literal dated fixture requires original W2");
  return w2;
}
export function rebindOhioDatedW2(input: OhioActualDatedInput) {
  const w2=ohioDatedW2(input),packet=w2.stateLocalSources;
  if(!packet)throw new Error("Literal dated fixture requires actual canonical W2 packet");
  const {stateLocalSources:_packet,...original}=w2;
  packet.originalW2=structuredClone(original);
  rebindOhioDatedOriginals(input);
}
