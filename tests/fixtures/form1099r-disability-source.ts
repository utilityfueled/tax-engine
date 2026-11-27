import type { TaxYearInput } from "@/models/inputs.js";
import { iraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";

interface Statement {
  taxYear: number;
  payer: string;
  payerTin: string;
  accountReference: string;
  accountHolder: "primary" | "spouse";
  grossDistribution: string;
  taxableAmount: string;
  taxableAmountNotDetermined?: boolean;
  federalWithheld: string;
}

export function disabilityPensionSource(
  statement: Statement,
  owner: TaxYearInput["taxpayer"]["primary"],
  firstPaymentDate: string,
  lastPaymentDate = firstPaymentDate,
) {
  const ownerFingerprint = iraEducationOwnerFingerprint(owner);
  if (!ownerFingerprint) throw new Error("Missing synthetic owner fingerprint");
  return {
    original: {
      taxYear: statement.taxYear,
      payer: statement.payer,
      payerTin: statement.payerTin,
      accountReference: statement.accountReference,
      accountHolder: statement.accountHolder,
      ownerFingerprint,
      ownerBirthDate: owner.dateOfBirth,
      grossDistribution: statement.grossDistribution,
      taxableAmount: statement.taxableAmount,
      taxableAmountNotDetermined: statement.taxableAmountNotDetermined,
      federalWithheld: statement.federalWithheld,
    },
    planReference: "Synthetic private plan reference X-019",
    employerDisabilityPensionConfirmed: true as const,
    allPaymentsCoveredConfirmed: true as const,
    minimumRetirementDate: `${statement.taxYear}-08-01`,
    firstPaymentDate,
    lastPaymentDate,
  };
}
