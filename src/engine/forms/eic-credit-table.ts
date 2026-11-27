/** Final 2025 and draft 2026 EIC tables. Spec: spec/federal/eic-credit-table.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { FEDERAL_2026_INDEXED } from "@/models/federal-2026-indexed.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

export function calculateEicCreditTable(params: {
  income: Decimal;
  filingStatus: FilingStatus;
  qualifyingChildren: number;
  lookup: "earned" | "agi";
}, constants: YearConstants) {
  const draft2026 = constants.taxYear === 2026;
  if (constants.taxYear !== 2025 && !draft2026) throw new Error("An EIC table is available for final 2025 and draft 2026 calculations only.");
  if (!params.income.isFinite() || !Number.isInteger(params.qualifyingChildren) || params.qualifyingChildren < 0) throw new Error("EIC table needs finite actual income and a whole nonnegative child count.");
  const children = Math.min(params.qualifyingChildren, 3);
  const joint = params.filingStatus === "married_filing_jointly";
  const indexed2026 = FEDERAL_2026_INDEXED.eitc;
  const limit = draft2026
    ? (joint ? indexed2026.completedPhaseOutMFJ : indexed2026.completedPhaseOutSingleHoH)[children]
    : d((joint ? ["26214", "57554", "64430", "68675"] : ["19104", "50434", "57310", "61555"])[children]);
  const income = roundDollar(params.income);
  const audit = new AuditTrail();
  let credit = d(0);
  if (income.gt(0) && income.lt(limit)) {
    const lower = income.div(50).floor().times(50);
    const upper = Decimal.min(lower.plus(50), limit);
    const midpoint = lower.plus(upper).div(2);
    const rules = constants.eitc;
    const earnedCeiling = rules.earnedIncomeAmount[children];
    const maximum = roundDollar(rules.creditRate[children].times(earnedCeiling));
    const phaseOutStart = (joint ? rules.phaseOutStartMFJ : rules.phaseOutStartSingleHoH)[children];
    // Full maximum in an interval containing the phase-in ceiling, or
    // straddling (not starting at) the phase-out start, matches both tables.
    const phaseIn = upper.gt(earnedCeiling) ? maximum : rules.creditRate[children].times(midpoint);
    const reduction = lower.gte(phaseOutStart) ? rules.phaseOutRate[children].times(Decimal.max(0, midpoint.minus(phaseOutStart))) : d(0);
    credit = roundDollar(Decimal.max(0, Decimal.min(phaseIn, maximum.minus(reduction))));
    audit.record("EIC Table", `${params.lookup}:interval`, draft2026 ? "Draft 2026 EIC income interval" : "Published2025 income interval", midpoint,
      draft2026 ? "Draft 2026 table interval with the printed partial-interval cutoff"
        : "Final2025 table interval; last eligible interval ends at the published limit", {
        "Lower inclusive": Decimal.max(1, lower), "Upper exclusive": upper,
        "Published maximum": maximum, "Column": `${joint ? "Joint" : "Nonjoint"}, ${children} children`,
      });
  }
  audit.record("EIC Table", `${params.lookup}:credit`, draft2026 ? "Draft 2026 EIC table amount" : "Published2025 EIC table amount", credit,
    draft2026 ? "November 24 draft Form 1040 instructions, including the partial-interval footnotes. Retain exact source income."
      : "Final2025 Pub596 table, including partial-row footnotes; source amount retained", {
      "Original income": params.income, "Whole-dollar lookup income": income, "Income limit": limit,
    });
  return { credit, lines: audit.getLines() };
}
