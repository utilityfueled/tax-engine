/**
 * New Jersey NJ-1040 Pass-Through Business Alternative Income Tax credit.
 * Spec: spec/state/nj-1040-ptbait-credit.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NJ1040PTBAITCreditInput {
  taxYear: number;
  partnershipShare?: Decimal | string | number;
  sCorporationShare?: Decimal | string | number;
  estateOrTrustShare?: Decimal | string | number;
  totalCredit?: Decimal | string | number;
}

export interface NJ1040PTBAITCreditResult {
  partnershipShare: Decimal;
  sCorporationShare: Decimal;
  estateOrTrustShare: Decimal;
  line63Credit: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040PTBAITCredit(
  input: NJ1040PTBAITCreditInput
): NJ1040PTBAITCreditResult {
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 PTBAIT credit rules");

  const audit = new AuditTrail();
  const partnershipShare = d(input.partnershipShare);
  const sCorporationShare = d(input.sCorporationShare);
  const estateOrTrustShare = d(input.estateOrTrustShare);
  const totalCredit = d(input.totalCredit);

  const hasSourceBreakdown =
    partnershipShare.greaterThan(0) ||
    sCorporationShare.greaterThan(0) ||
    estateOrTrustShare.greaterThan(0);

  if (totalCredit.greaterThan(0) && hasSourceBreakdown) {
    throw new Error(
      "NJ-1040 PTBAIT credit expects either a source breakdown or a total credit, not both"
    );
  }

  audit.record(
    "NJ-1040",
    "partnership-share",
    "Partnership PTBAIT credit share",
    partnershipShare,
    "Supported partnership PTBAIT credit amount from Schedule NJ-BUS-1 Part II line 5"
  );

  audit.record(
    "NJ-1040",
    "s-corp-share",
    "S corporation PTBAIT credit share",
    sCorporationShare,
    "Supported S corporation PTBAIT credit amount from Schedule NJ-BUS-1 Part III line 5"
  );

  audit.record(
    "NJ-1040",
    "estate-trust-share",
    "Estate or trust PTBAIT credit share",
    estateOrTrustShare,
    "Supported estate or trust PTBAIT credit amount from Schedule NJK-1"
  );

  const line63Credit = totalCredit.greaterThan(0)
    ? totalCredit
    : sum(partnershipShare, sCorporationShare, estateOrTrustShare);

  audit.record(
    "NJ-1040",
    "63",
    "Pass-Through Business Alternative Income Tax credit",
    line63Credit,
    totalCredit.greaterThan(0)
      ? "Supported upstream PTBAIT total"
      : "Partnership share + S corporation share + estate/trust share",
    totalCredit.greaterThan(0)
      ? { "Supported upstream total": totalCredit }
      : {
          "Partnership share": partnershipShare,
          "S corporation share": sCorporationShare,
          "Estate or trust share": estateOrTrustShare,
        }
  );

  return {
    partnershipShare,
    sCorporationShare,
    estateOrTrustShare,
    line63Credit,
    lines: audit.getLines(),
  };
}
