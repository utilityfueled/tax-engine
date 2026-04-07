/**
 * New York IT-227 Voluntary Contributions.
 * Computes Part 2 line 1, which flows to Form IT-201 line 60.
 * Spec: spec/state/ny-it227-voluntary-contributions.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

export interface NYIT227ContributionEntry {
  lineNumber: number;
  amount: Decimal | string | number;
}

export interface NYIT227Contribution {
  lineNumber: number;
  description: string;
  amount: Decimal;
}

export interface NYIT227Input {
  taxYear: number;
  filingStatus: FilingStatus;
  contributions: NYIT227ContributionEntry[];
}

export interface NYIT227Result {
  contributions: NYIT227Contribution[];
  totalVoluntaryContributions: Decimal;
  lines: CalculatedLine[];
}

const LINE_DESCRIPTIONS: Record<number, string> = {
  1: "Return a Gift to Wildlife",
  2: "Missing and Exploited Children",
  3: "Breast Cancer Research",
  4: "Alzheimer's Fund",
  5: "Olympic Fund",
  6: "Prostate Cancer",
  7: "9/11 Memorial",
  8: "Volunteer Firefighting",
  9: "Teen Health Education",
  10: "Veterans Remembrance",
  11: "Homeless Veterans",
  12: "Mental Illness Anti-Stigma",
  13: "Women's Cancers Fund",
  14: "Autism Fund",
  15: "Veterans' Homes",
  16: "Love Your Library Fund",
  17: "Lupus Fund",
  18: "Military Family Fund",
  19: "CUNY Fund",
  20: "Life Pass It On Fund",
  21: "ALS Research and Education",
  22: "School-Based Health Centers",
  23: "Gifts to Food Banks Fund",
  24: "Home Delivered Meals for Seniors",
  25: "Gift to The Arts Fund",
  26: "Leukemia, Lymphoma, and Myeloma Fund",
  27: "New York State Campaign Finance Fund",
  28: "William B. Hoyt Memorial Children and Family Trust Fund",
  29: "Firearm Violence Research Fund",
  30: "Substance Use Disorder Education and Recovery Fund",
  31: "Retired and Rescued Thoroughbred Race Horse Aftercare",
  32: "Retired and Rescued Standardbred Race Horse Aftercare",
  33: "Gifts for the State Library System",
  34: "Gift for Lyme and Tick-Borne Diseases Education, Research, and Prevention",
  35: "Diabetes Research and Education Fund",
  36: "Childhood Cancer Research Fund",
};

function normalizeContributionAmount(amount: Decimal | string | number, description: string): Decimal {
  const decimalAmount = d(amount);
  if (decimalAmount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return roundDollar(decimalAmount);
}

function validateSpecialLineAmount(
  filingStatus: FilingStatus,
  lineNumber: number,
  amount: Decimal
): void {
  if (lineNumber === 5) {
    const isMFJ = filingStatus === "married_filing_jointly";
    const allowed = isMFJ ? ["0", "2", "4"] : ["0", "2"];
    if (!allowed.includes(amount.toString())) {
      throw new Error(
        "NY IT-227 line 5 Olympic Fund contribution must be $0 or $2 ($4 maximum on MFJ returns)"
      );
    }
  }

  if (lineNumber === 27) {
    const isMFJ = filingStatus === "married_filing_jointly";
    const allowed = isMFJ ? ["0", "40", "80"] : ["0", "40"];
    if (!allowed.includes(amount.toString())) {
      throw new Error(
        isMFJ
          ? "NY IT-227 line 27 Campaign Finance Fund contribution must be $0, $40, or $80 on married filing jointly returns"
          : "NY IT-227 line 27 Campaign Finance Fund contribution must be $0 or $40"
      );
    }
  }
}

export function calculateNYIT227(input: NYIT227Input): NYIT227Result {
  if (input.taxYear !== 2025) {
    throw new Error(`NY IT-227 voluntary contributions not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const seenLines = new Set<number>();
  const contributions: NYIT227Contribution[] = [];
  let total = new Decimal(0);

  for (const entry of input.contributions) {
    const description = LINE_DESCRIPTIONS[entry.lineNumber];
    if (!description) {
      throw new Error(`NY IT-227 line ${entry.lineNumber} is not supported; valid lines are 1 through 36`);
    }
    if (seenLines.has(entry.lineNumber)) {
      throw new Error(`NY IT-227 line ${entry.lineNumber} may only be entered once`);
    }
    seenLines.add(entry.lineNumber);

    const amount = normalizeContributionAmount(
      entry.amount,
      `NY IT-227 line ${entry.lineNumber} contribution`
    );
    validateSpecialLineAmount(input.filingStatus, entry.lineNumber, amount);

    contributions.push({
      lineNumber: entry.lineNumber,
      description,
      amount,
    });
    total = total.plus(amount);

    audit.record(
      "NY-IT227",
      String(entry.lineNumber),
      description,
      amount,
      "Whole-dollar voluntary contribution amount",
      {
        "Filing status": input.filingStatus,
      }
    );
  }

  audit.record(
    "NY-IT227",
    "Part2-1",
    "Total voluntary contributions",
    total,
    "Add Part 1 lines 1 through 36"
  );

  return {
    contributions,
    totalVoluntaryContributions: total,
    lines: audit.getLines(),
  };
}
