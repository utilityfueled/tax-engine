/** Ohio R.C. 5747.01(A)(35). Spec: spec/state/oh-2026-venture-capital-gain-estimate.yaml. */
import type Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

interface GainIdentity {
  taxYear: number;
  ownerReference: string;
  holdingReference: string;
  certificateReference: string;
  factsConfirmed: boolean;
}

interface VentureGainInput {
  taxYear: number;
  calendarYearConfirmed: boolean;
  asOfDate: string;
  certificate: GainIdentity & {
    authority: "ohio-director-of-development-122.851(D)(2)";
    issuedDate: string;
    certifiedFrom: string;
    certifiedThrough: string;
    statusConfirmedCurrent: boolean;
    noRevocationOrRecaptureConfirmed: boolean;
    investeeClassificationConfirmed: boolean;
    underlyingInvestmentDate: string;
    disposalDate: string;
    investorGain: string;
    investorOhioGain: string;
  };
  recognition: GainIdentity & {
    sourceReference: string;
    acquiredDate: string;
    recognitionDate: string;
    directCashInterestConfirmed: boolean;
    oneUnderlyingInvestmentDisposalConfirmed: boolean;
    capitalGainReceivedConfirmed: boolean;
    nonbusinessIncomeConfirmed: boolean;
    fullyIncludedFederalAgiConfirmed: boolean;
    noOtherExclusionOrDeductionConfirmed: boolean;
    noCapitalLossNettingOrCarryoverConfirmed: boolean;
    recognizedFederalGain: string;
  };
}

interface VentureGainEstimate {
  deduction: Decimal;
  lines: CalculatedLine[];
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function amount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error("Ohio venture capital estimate requires actual nonnegative gains in dollars and cents.");
  }
  return d(value);
}

export function estimateOhio2026VentureCapitalGain(input: VentureGainInput): VentureGainEstimate {
  const { taxYear, asOfDate, certificate, recognition } = input;
  if (taxYear !== 2026 || input.calendarYearConfirmed !== true || !validDate(asOfDate)
    || certificate?.taxYear !== taxYear || recognition?.taxYear !== taxYear
    || certificate.authority !== "ohio-director-of-development-122.851(D)(2)" || certificate.factsConfirmed !== true
    || certificate.statusConfirmedCurrent !== true || certificate.noRevocationOrRecaptureConfirmed !== true
    || recognition.factsConfirmed !== true || !validReference(recognition.sourceReference)) {
    throw new Error("Ohio venture capital estimate requires the issued Director certificate and confirmed 2026 recognition facts.");
  }

  for (const field of ["ownerReference", "holdingReference", "certificateReference"] as const) {
    if (!validReference(certificate[field]) || certificate[field] !== recognition[field]) {
      throw new Error("Ohio venture capital certificate and gain record must identify the same owner, original holding and certificate.");
    }
  }

  const { issuedDate, certifiedFrom, certifiedThrough, underlyingInvestmentDate, disposalDate } = certificate;
  const { acquiredDate, recognitionDate } = recognition;
  if (![issuedDate, certifiedFrom, certifiedThrough, underlyingInvestmentDate, disposalDate, acquiredDate, recognitionDate].every(validDate)
    || issuedDate <= "2026-12-31" || issuedDate > asOfDate
    || !disposalDate.startsWith("2026-") || recognitionDate !== disposalDate
    || acquiredDate < certifiedFrom || acquiredDate > disposalDate
    || underlyingInvestmentDate < certifiedFrom || underlyingInvestmentDate > disposalDate
    || disposalDate > certifiedThrough) {
    throw new Error("Ohio venture capital estimate requires actual dates, with acquisition, investment and disposition within the certification period.");
  }

  if (certificate.investeeClassificationConfirmed !== true || recognition.directCashInterestConfirmed !== true
    || recognition.oneUnderlyingInvestmentDisposalConfirmed !== true || recognition.capitalGainReceivedConfirmed !== true
    || recognition.nonbusinessIncomeConfirmed !== true || recognition.fullyIncludedFederalAgiConfirmed !== true
    || recognition.noOtherExclusionOrDeductionConfirmed !== true || recognition.noCapitalLossNettingOrCarryoverConfirmed !== true) {
    throw new Error("Ohio venture capital estimate requires one certified direct cash interest and a fully included nonbusiness gain with no other adjustment.");
  }

  const gain = amount(certificate.investorGain);
  const ohioGain = amount(certificate.investorOhioGain);
  if (!gain.gt(0) || !gain.eq(amount(recognition.recognizedFederalGain)) || (!ohioGain.isZero() && !ohioGain.eq(gain))) {
    throw new Error("Ohio venture capital certificate must match the recognized gain and classify one underlying investment.");
  }

  const otherGain = gain.minus(ohioGain);
  const audit = new AuditTrail();
  const deduction = audit.record("Ohio 2026 venture capital estimate", "A35", "Certified venture capital gain deduction",
    ohioGain.plus(otherGain.times("0.50")), "100% of certified Ohio gain plus 50% of other certified gain", {
      "Certified Ohio gain": ohioGain, "Certified other gain": otherGain,
    });
  return { deduction, lines: audit.getLines() };
}
