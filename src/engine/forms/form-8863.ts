/**
 * Form 8863 — Education Credits
 * Spec: spec/federal/form-8863.yaml
 *
 * Two credits:
 * - American Opportunity Credit (AOC): up to $2,500/student, 40% refundable
 * - Lifetime Learning Credit (LLC): 20% of up to $10K, per-return
 *
 * Both phase out at Single $80K-$90K, MFJ $160K-$180K.
 * MFS gets neither credit.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { zeroFloor, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface AOCStudent {
  name: string;
  qualifiedExpenses: Decimal;
  /**
   * Number of prior tax years the AOC was claimed for this student.
   * The AOC is limited to 4 tax years total (including the current year).
   * If priorYearsClaimed >= 4, this student is ineligible and yields $0.
   */
  priorYearsClaimed?: number;
}

export interface Form8863Input {
  aocStudents: AOCStudent[];
  llcExpenses: Decimal; // total LLC-eligible expenses
  magi: Decimal;
  filingStatus: FilingStatus;
}

export interface Form8863Result {
  aocPerStudent: Array<{ name: string; tentativeCredit: Decimal }>;
  aocTotalTentative: Decimal; // Line 2
  aocAfterPhaseOut: Decimal; // Line 7
  aocNonrefundable: Decimal; // Line 8 (60%)
  aocRefundable: Decimal; // Line 14 (40%)

  llcTentative: Decimal;
  llcAfterPhaseOut: Decimal; // Line 10

  totalNonrefundable: Decimal; // Line 19
  totalRefundable: Decimal; // = aocRefundable

  lines: CalculatedLine[];
}

interface AOCStudentResult {
  name: string;
  tentativeCredit: Decimal;
  qualifiedExpenses: Decimal;
  priorYearsClaimed: number;
  currentYearEligible: boolean;
}

const AOC_FIRST_TIER = new Decimal(2000);
const AOC_SECOND_TIER = new Decimal(2000);
const AOC_SECOND_RATE = new Decimal(0.25);
const LLC_EXPENSE_LIMIT = new Decimal(10000);
const LLC_RATE = new Decimal(0.20);

function getPhaseOutRange(filingStatus: FilingStatus): { start: Decimal; end: Decimal } {
  if (filingStatus === "married_filing_jointly") {
    return { start: new Decimal(160000), end: new Decimal(180000) };
  }
  // Single, HoH, QSS — same range per IRC §25A(d)(2): "joint return" only
  return { start: new Decimal(80000), end: new Decimal(90000) };
}

function computePhaseOutFactor(magi: Decimal, filingStatus: FilingStatus): Decimal {
  // MFS: no credit
  if (filingStatus === "married_filing_separately") return new Decimal(0);

  const { start, end } = getPhaseOutRange(filingStatus);
  if (magi.lte(start)) return new Decimal(1);
  if (magi.gte(end)) return new Decimal(0);

  const range = end.minus(start);
  const excess = magi.minus(start);
  return new Decimal(1).minus(excess.dividedBy(range));
}

function computeAOCForStudent(expenses: Decimal): Decimal {
  const firstTier = min(expenses, AOC_FIRST_TIER);
  const remainder = zeroFloor(expenses.minus(AOC_FIRST_TIER));
  const secondTier = roundDollar(min(remainder, AOC_SECOND_TIER).times(AOC_SECOND_RATE));
  return firstTier.plus(secondTier);
}

export function calculateForm8863(input: Form8863Input): Form8863Result {
  const audit = new AuditTrail();

  // ── AOC (Part III → Part I) ─────────────────────────────

  const aocPerStudent: AOCStudentResult[] = input.aocStudents.map((s) => {
    // AOC is limited to 4 tax years total per student; if the student has
    // already claimed it in 4 or more prior years they are ineligible.
    const priorYearsClaimed = s.priorYearsClaimed ?? 0;
    const currentYearEligible = priorYearsClaimed < 4;
    const tentativeCredit = currentYearEligible
      ? computeAOCForStudent(s.qualifiedExpenses)
      : new Decimal(0);
    return {
      name: s.name,
      tentativeCredit,
      qualifiedExpenses: s.qualifiedExpenses,
      priorYearsClaimed,
      currentYearEligible,
    };
  });

  for (const s of aocPerStudent) {
    audit.record("Form 8863", "1", `AOC for ${s.name}`, s.tentativeCredit,
      s.currentYearEligible
        ? "100% of first $2K + 25% of next $2K"
        : "Ineligible: AOC already claimed in 4 prior tax years", {
        "Qualified expenses": s.qualifiedExpenses,
        "Prior AOC years claimed": new Decimal(s.priorYearsClaimed),
        "Current-year AOC eligible": s.currentYearEligible ? "yes" : "no",
      });
  }

  const aocTotalTentative = aocPerStudent.reduce(
    (acc, s) => acc.plus(s.tentativeCredit), new Decimal(0)
  );
  audit.record("Form 8863", "2", "AOC total tentative", aocTotalTentative,
    "Sum of all students");

  const phaseOutFactor = computePhaseOutFactor(input.magi, input.filingStatus);

  const aocAfterPhaseOut = roundDollar(aocTotalTentative.times(phaseOutFactor));
  audit.record("Form 8863", "7", "AOC after phase-out", aocAfterPhaseOut,
    `Tentative × ${phaseOutFactor.toFixed(4)} phase-out factor`);

  const aocNonrefundable = roundDollar(aocAfterPhaseOut.times(new Decimal(0.6)));
  audit.record("Form 8863", "8", "Nonrefundable AOC (60%)", aocNonrefundable,
    "60% of Line 7");

  const aocRefundable = roundDollar(aocAfterPhaseOut.times(new Decimal(0.4)));
  audit.record("Form 8863", "14", "Refundable AOC (40%)", aocRefundable,
    "40% of Line 7");

  // ── LLC (Part II) ───────────────────────────────────────

  const llcQualifying = min(input.llcExpenses, LLC_EXPENSE_LIMIT);
  const llcTentative = roundDollar(llcQualifying.times(LLC_RATE));

  const llcAfterPhaseOut = roundDollar(llcTentative.times(phaseOutFactor));
  audit.record("Form 8863", "10", "Lifetime Learning Credit", llcAfterPhaseOut,
    `20% × min(${input.llcExpenses}, $10K) × phase-out`);

  // ── Totals ──────────────────────────────────────────────

  const totalNonrefundable = aocNonrefundable.plus(llcAfterPhaseOut);
  audit.record("Form 8863", "19", "Total nonrefundable education credit", totalNonrefundable,
    "Nonrefundable AOC + LLC → Schedule 3 Line 3");

  return {
    aocPerStudent,
    aocTotalTentative,
    aocAfterPhaseOut,
    aocNonrefundable,
    aocRefundable,
    llcTentative,
    llcAfterPhaseOut,
    totalNonrefundable,
    totalRefundable: aocRefundable,
    lines: audit.getLines(),
  };
}
