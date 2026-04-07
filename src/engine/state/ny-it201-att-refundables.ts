/**
 * New York IT-201-ATT Part 1 Section D refundable credits.
 * Computes line 18, which flows to Form IT-201 line 71.
 * Spec: spec/state/ny-it201-att-refundables.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface NYIT201ATTRefundableCreditEntry {
  code: string;
  amount: Decimal | string | number;
}

export interface NYIT201ATTRefundableCreditsInput {
  taxYear: number;
  farmersSchoolTaxCredit?: Decimal | string | number;
  otherRefundableCredits?: Decimal | string | number;
  otherRefundableCreditEntries?: NYIT201ATTRefundableCreditEntry[];
  nysClaimOfRightCredit?: Decimal | string | number;
  nycClaimOfRightCredit?: Decimal | string | number;
  yonkersClaimOfRightCredit?: Decimal | string | number;
  mctmtClaimOfRightCredit?: Decimal | string | number;
}

export interface NYIT201ATTRefundableCreditsResult {
  farmersSchoolTaxCredit: Decimal;
  otherRefundableCredits: Decimal;
  frontPageSubtotal: Decimal;
  carryforwardFromFrontPage: Decimal;
  nysClaimOfRightCredit: Decimal;
  nycClaimOfRightCredit: Decimal;
  yonkersClaimOfRightCredit: Decimal;
  mctmtClaimOfRightCredit: Decimal;
  totalOtherRefundableCredits: Decimal;
  lines: CalculatedLine[];
}

const MAX_CODED_REFUNDABLE_CREDIT_ENTRIES = 12;

function sumDetailedOtherRefundableCredits(
  entries: NYIT201ATTRefundableCreditEntry[]
): Decimal {
  if (entries.length > MAX_CODED_REFUNDABLE_CREDIT_ENTRIES) {
    throw new Error(
      "NY IT-201-ATT line 12 supports at most 12 coded refundable credit entries"
    );
  }

  return entries.reduce((total, entry, index) => {
    if (!entry.code.trim()) {
      throw new Error(
        `NY IT-201-ATT line 12${String.fromCharCode(97 + index)} code is required`
      );
    }
    return total.plus(d(entry.amount));
  }, new Decimal(0));
}

export function calculateNYIT201ATTRefundableCredits(
  input: NYIT201ATTRefundableCreditsInput
): NYIT201ATTRefundableCreditsResult {
  if (input.taxYear !== 2025) {
    throw new Error(
      `NY IT-201-ATT refundable credits not available for tax year ${input.taxYear}`
    );
  }

  const audit = new AuditTrail();

  const farmersSchoolTaxCredit = d(input.farmersSchoolTaxCredit);
  audit.record(
    "NY-IT201-ATT",
    "11",
    "Farmers' school tax credit",
    farmersSchoolTaxCredit,
    "Passthrough amount"
  );

  const otherRefundableCredits =
    input.otherRefundableCreditEntries && input.otherRefundableCreditEntries.length > 0
      ? sumDetailedOtherRefundableCredits(input.otherRefundableCreditEntries)
      : d(input.otherRefundableCredits);
  audit.record(
    "NY-IT201-ATT",
    "12",
    "Other refundable credits",
    otherRefundableCredits,
    input.otherRefundableCreditEntries && input.otherRefundableCreditEntries.length > 0
      ? "Sum of coded line 12 entries"
      : "Direct line 12 passthrough"
  );

  const frontPageSubtotal = sum(farmersSchoolTaxCredit, otherRefundableCredits);
  audit.record(
    "NY-IT201-ATT",
    "13",
    "Front-page refundable credit subtotal",
    frontPageSubtotal,
    "Line 11 + Line 12",
    {
      "Farmers' school tax credit (line 11)": farmersSchoolTaxCredit.toString(),
      "Other refundable credits (line 12)": otherRefundableCredits.toString(),
    }
  );

  const carryforwardFromFrontPage = frontPageSubtotal;
  audit.record(
    "NY-IT201-ATT",
    "14",
    "Amount from line 13 on the front page",
    carryforwardFromFrontPage,
    "Line 13"
  );

  const nysClaimOfRightCredit = d(input.nysClaimOfRightCredit);
  audit.record(
    "NY-IT201-ATT",
    "15",
    "New York State claim of right credit",
    nysClaimOfRightCredit,
    "Passthrough amount"
  );

  const nycClaimOfRightCredit = d(input.nycClaimOfRightCredit);
  audit.record(
    "NY-IT201-ATT",
    "16",
    "New York City claim of right credit",
    nycClaimOfRightCredit,
    "Passthrough amount"
  );

  const yonkersClaimOfRightCredit = d(input.yonkersClaimOfRightCredit);
  audit.record(
    "NY-IT201-ATT",
    "17",
    "Yonkers claim of right credit",
    yonkersClaimOfRightCredit,
    "Passthrough amount"
  );

  const mctmtClaimOfRightCredit = d(input.mctmtClaimOfRightCredit);
  audit.record(
    "NY-IT201-ATT",
    "17a",
    "MCTMT claim of right credit",
    mctmtClaimOfRightCredit,
    "Passthrough amount"
  );

  const totalOtherRefundableCredits = sum(
    carryforwardFromFrontPage,
    nysClaimOfRightCredit,
    nycClaimOfRightCredit,
    yonkersClaimOfRightCredit,
    mctmtClaimOfRightCredit
  );
  audit.record(
    "NY-IT201-ATT",
    "18",
    "Total refundable credits for Form IT-201 line 71",
    totalOtherRefundableCredits,
    "Line 14 + Line 15 + Line 16 + Line 17 + Line 17a",
    {
      "Line 14 carryforward": carryforwardFromFrontPage.toString(),
      "New York State claim of right credit (line 15)": nysClaimOfRightCredit.toString(),
      "New York City claim of right credit (line 16)": nycClaimOfRightCredit.toString(),
      "Yonkers claim of right credit (line 17)": yonkersClaimOfRightCredit.toString(),
      "MCTMT claim of right credit (line 17a)": mctmtClaimOfRightCredit.toString(),
    }
  );

  return {
    farmersSchoolTaxCredit,
    otherRefundableCredits,
    frontPageSubtotal,
    carryforwardFromFrontPage,
    nysClaimOfRightCredit,
    nycClaimOfRightCredit,
    yonkersClaimOfRightCredit,
    mctmtClaimOfRightCredit,
    totalOtherRefundableCredits,
    lines: audit.getLines(),
  };
}
