/**
 * IRA Deduction Worksheet (Pub 590-A Worksheets 1-1 and 1-2).
 * Spec: spec/federal/ira-deduction-worksheet.yaml
 *
 * Computes the deductible portion of traditional IRA contributions based on
 * the taxpayer's MAGI, filing status, and employer plan participation status.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import { getConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface IraDeductionInput {
  filingStatus: FilingStatus;
  taxYear: number;
  /** Modified AGI for IRA deduction purposes (AGI without the IRA deduction) */
  magi: string | Decimal;
  /** Actual traditional IRA contributions made */
  contributions: string | Decimal;
  /** Whether this taxpayer is an active participant in an employer retirement plan */
  isActiveParticipant: boolean;
  /** Whether the other spouse is an active participant (relevant for MFJ) */
  isSpouseActiveParticipant: boolean;
  /** Whether the taxpayer is age 50 or older by the end of the tax year */
  age50OrOlder: boolean;
  /** Whether the taxpayer lived with their spouse at any time during the year.
   *  Affects MFS filers: those who lived apart all year are treated as single
   *  for IRA deduction phase-out purposes per Pub 590-A. When undefined for
   *  MFS filers, defaults to "lived with spouse" (conservative). */
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
}

export interface IraDeductionResult {
  contributionLimit: Decimal;
  contributions: Decimal;
  deductibleAmount: Decimal;
  nondeductibleAmount: Decimal;
  fullyPhasedOut: boolean;
  phaseOutApplied: boolean;
  lines: CalculatedLine[];
}

export function calculateIraDeduction(input: IraDeductionInput): IraDeductionResult {
  const audit = new AuditTrail();
  const constants = getConstants(input.taxYear);
  const ira = constants.iraDeduction;

  const magi = d(input.magi);
  const contributions = Decimal.max(new Decimal(0), d(input.contributions));

  // Contribution limit: $7,000 base + $1,000 catch-up if age 50+
  const contributionLimit = input.age50OrOlder
    ? ira.contributionLimit.plus(ira.catchUpContribution)
    : ira.contributionLimit;

  // Cap contributions at the limit for deduction purposes
  const eligibleContributions = Decimal.min(contributions, contributionLimit);

  audit.record(
    "IRA Deduction Worksheet",
    "contributionLimit",
    "Maximum allowable IRA contribution",
    contributionLimit,
    input.age50OrOlder
      ? "$7,000 base + $1,000 catch-up for age 50+"
      : "$7,000 base limit (under age 50)",
  );

  // Determine the applicable phase-out scenario.
  // Per Pub 590-A, MFS filers who lived apart from their spouse for the entire
  // year are treated as single for IRA deduction purposes.  When
  // livedWithSpouseAtAnyTimeDuringYear is undefined for MFS filers, default to
  // "lived with spouse" (conservative — triggers the more restrictive $0-$10K
  // phase-out rather than the single $79K-$89K range).
  const isMfj = input.filingStatus === "married_filing_jointly" || input.filingStatus === "qualifying_surviving_spouse";
  const isMfs = input.filingStatus === "married_filing_separately";
  const mfsLivedApart = isMfs && input.livedWithSpouseAtAnyTimeDuringYear === false;

  // MFS lived-apart filers use single thresholds; all other MFS use the $0-$10K range
  const effectiveStatusForPhaseOut: FilingStatus = mfsLivedApart ? "single" : input.filingStatus;

  // "Effectively married" for the spouse-active-participant rule: MFJ/QSS, or MFS who lived with spouse
  const effectivelyMarried = isMfj || (isMfs && !mfsLivedApart);

  // Phase-out is needed when:
  // 1. Taxpayer is an active participant in an employer plan, OR
  // 2. Taxpayer is not active but is effectively married and spouse IS active
  const needsPhaseOut = input.isActiveParticipant || (effectivelyMarried && input.isSpouseActiveParticipant);

  if (!needsPhaseOut) {
    // Neither spouse is an active participant (or single/HoH with no plan,
    // or MFS lived apart with non-active spouse): full deduction
    audit.record(
      "IRA Deduction Worksheet",
      "deductibleAmount",
      "Deductible traditional IRA contribution",
      eligibleContributions,
      mfsLivedApart
        ? "Full deduction — MFS lived apart from spouse all year, treated as single, not an active participant"
        : "Full deduction — not an active participant in an employer plan",
      {
        "Contributions": contributions,
        "Contribution limit": contributionLimit,
        "MAGI": magi,
      },
    );

    return {
      contributionLimit,
      contributions,
      deductibleAmount: eligibleContributions,
      nondeductibleAmount: Decimal.max(new Decimal(0), contributions.minus(eligibleContributions)),
      fullyPhasedOut: false,
      phaseOutApplied: false,
      lines: audit.getLines(),
    };
  }

  // Determine phase-out start and range
  let phaseOutStart: Decimal;
  let phaseOutRange: Decimal;
  let phaseOutReason: string;

  if (input.isActiveParticipant) {
    // Active participant: use effective filing status (MFS lived-apart → single thresholds)
    phaseOutStart = ira.activeParticipantPhaseOutStart[effectiveStatusForPhaseOut];
    phaseOutRange = ira.activeParticipantPhaseOutRange[effectiveStatusForPhaseOut];
    phaseOutReason = mfsLivedApart
      ? "active participant in employer plan (MFS lived apart, treated as single per Pub 590-A)"
      : "active participant in employer plan";
  } else if (isMfs) {
    // MFS non-participant whose spouse is active and who lived with spouse:
    // same $0-$10K phase-out as MFS active participant per Pub 590-A
    phaseOutStart = ira.activeParticipantPhaseOutStart["married_filing_separately"];
    phaseOutRange = ira.activeParticipantPhaseOutRange["married_filing_separately"];
    phaseOutReason = "MFS not an active participant but spouse is (lived with spouse)";
  } else {
    // MFJ/QSS non-participant married to active participant: $236K-$246K
    phaseOutStart = ira.spouseActiveParticipantPhaseOutStart;
    phaseOutRange = ira.spouseActiveParticipantPhaseOutRange;
    phaseOutReason = "not an active participant but spouse is";
  }

  const excess = magi.minus(phaseOutStart);

  // Below phase-out start: full deduction
  if (excess.lessThanOrEqualTo(0)) {
    audit.record(
      "IRA Deduction Worksheet",
      "deductibleAmount",
      "Deductible traditional IRA contribution",
      eligibleContributions,
      `Full deduction — MAGI at or below phase-out start (${phaseOutReason})`,
      {
        "MAGI": magi,
        "Phase-out start": phaseOutStart,
        "Contributions": contributions,
        "Contribution limit": contributionLimit,
      },
    );

    return {
      contributionLimit,
      contributions,
      deductibleAmount: eligibleContributions,
      nondeductibleAmount: Decimal.max(new Decimal(0), contributions.minus(eligibleContributions)),
      fullyPhasedOut: false,
      phaseOutApplied: false,
      lines: audit.getLines(),
    };
  }

  // At or above phase-out ceiling: $0 deduction
  if (excess.greaterThanOrEqualTo(phaseOutRange)) {
    const zero = new Decimal(0);
    audit.record(
      "IRA Deduction Worksheet",
      "deductibleAmount",
      "Deductible traditional IRA contribution",
      zero,
      `$0 — MAGI at or above phase-out ceiling (${phaseOutReason})`,
      {
        "MAGI": magi,
        "Phase-out start": phaseOutStart,
        "Phase-out range": phaseOutRange,
        "Phase-out ceiling": phaseOutStart.plus(phaseOutRange),
      },
    );

    return {
      contributionLimit,
      contributions,
      deductibleAmount: zero,
      nondeductibleAmount: contributions,
      fullyPhasedOut: true,
      phaseOutApplied: true,
      lines: audit.getLines(),
    };
  }

  // Partial phase-out: apply the IRS worksheet formula
  // Step 1: ratio = excess / phaseOutRange
  const ratio = excess.dividedBy(phaseOutRange);

  // Step 2: raw reduction = ratio × contributionLimit
  const rawReduction = ratio.times(contributionLimit);

  // Step 3: round up to next $10 multiple (IRS: "round to next highest multiple of $10")
  const roundedReduction = ceilToMultipleOf10(rawReduction);

  // Step 4: reduced limit = contributionLimit - roundedReduction, with $200 floor
  const reducedLimitRaw = contributionLimit.minus(roundedReduction);
  const reducedLimit = Decimal.max(new Decimal(200), reducedLimitRaw);

  // Deduction is the smaller of the reduced limit and actual contributions
  const deductibleAmount = Decimal.min(reducedLimit, contributions);

  audit.record(
    "IRA Deduction Worksheet",
    "deductibleAmount",
    "Deductible traditional IRA contribution after phase-out",
    deductibleAmount,
    `Partial phase-out: (MAGI - start) / range × limit, rounded up to $10, with $200 floor (${phaseOutReason})`,
    {
      "MAGI": magi,
      "Phase-out start": phaseOutStart,
      "Excess over start": excess,
      "Phase-out range": phaseOutRange,
      "Ratio": ratio,
      "Contribution limit": contributionLimit,
      "Raw reduction": rawReduction,
      "Rounded reduction (ceil $10)": roundedReduction,
      "Reduced limit (with $200 floor)": reducedLimit,
      "Contributions": contributions,
    },
  );

  return {
    contributionLimit,
    contributions,
    deductibleAmount,
    nondeductibleAmount: Decimal.max(new Decimal(0), contributions.minus(deductibleAmount)),
    fullyPhasedOut: false,
    phaseOutApplied: true,
    lines: audit.getLines(),
  };
}

/** Round up to the next multiple of $10. If already an exact multiple, keep it. */
function ceilToMultipleOf10(value: Decimal): Decimal {
  const ten = new Decimal(10);
  return value.dividedBy(ten).ceil().times(ten);
}
