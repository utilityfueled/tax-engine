/**
 * Final 2026 Schedule 8812 physical mapping candidate, Created 8/18/26.
 * Spec: spec/federal/schedule-8812-2026-template.yaml.
 * Internal wage-only projection. Public review and filing stay disabled.
 */
import { z } from "zod";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { FilingStatusSchema } from "@/models/inputs.js";
import { d, roundDollar, sumStrings } from "@/utils/decimal.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const SCHEDULE_8812_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040s8.pdf",
  sourceRevision: "Created 8/18/26",
  retrievedAt: "2026-11-13T01:11:08Z",
  sha256: "05b96bd809b37cfd0c223ac0909d2d82645eb8bfd6244701189f40ab8a4ab45c",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  reservedField: "line15Reserved",
  // These are printed source references, not calculated inputs or engine routes.
  printedReferences: Object.freeze({
    line1: Object.freeze(["Form 1040 / 1040-SR / 1040-NR line 11b"]),
    line22: Object.freeze(["Schedule 1 line 15", "Schedule 2 line 16c", "Schedule 2 line 17c"]),
  }),
  printedAmounts: Object.freeze({ line5: "$2,200", line7: "$500", line16b: "$1,700" }),
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    ssn: `${page1}f1_2[0]`,
    line1: `${page1}f1_3[0]`,
    line2a: `${page1}f1_4[0]`,
    line2b: `${page1}f1_5[0]`,
    line2c: `${page1}f1_6[0]`,
    line2d: `${page1}f1_7[0]`,
    line3: `${page1}f1_8[0]`,
    line4: `${page1}f1_9[0]`,
    line5: `${page1}f1_10[0]`,
    line6: `${page1}Line6ReadOrder[0].f1_11[0]`,
    line7: `${page1}f1_12[0]`,
    line8: `${page1}f1_13[0]`,
    line9: `${page1}f1_14[0]`,
    line10: `${page1}f1_15[0]`,
    line11: `${page1}f1_16[0]`,
    line12: `${page1}f1_17[0]`,
    line12No: `${page1}c1_1[0]`,
    line12Yes: `${page1}c1_1[1]`,
    line13: `${page1}f1_18[0]`,
    line14: `${page1}f1_19[0]`,
    line15Reserved: `${page2}f2_1[0]`,
    line16a: `${page2}f2_2[0]`,
    line16bCount: `${page2}f2_3[0]`,
    line16b: `${page2}f2_4[0]`,
    line17: `${page2}f2_5[0]`,
    line18a: `${page2}f2_6[0]`,
    line18b: `${page2}f2_7[0]`,
    line19No: `${page2}c2_1[0]`,
    line19Yes: `${page2}c2_1[1]`,
    line19: `${page2}f2_8[0]`,
    line20: `${page2}f2_9[0]`,
    nextNo: `${page2}c2_2[0]`,
    nextYes: `${page2}c2_2[1]`,
    line21: `${page2}f2_10[0]`,
    line22: `${page2}f2_11[0]`,
    line23: `${page2}f2_12[0]`,
    line24: `${page2}f2_13[0]`,
    line25: `${page2}f2_14[0]`,
    line26: `${page2}f2_15[0]`,
    line27: `${page2}f2_16[0]`,
  }),
});

const dollarsAndCents = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const wageSources = z.strictObject({
  taxYear: z.literal(2026),
  parentForm: z.literal("1040"),
  annualSourcesConfirmed: z.literal(true),
  wageOnlyNoExclusionsOrWorksheetBConfirmed: z.literal(true),
  nonPuertoRicoResidentConfirmed: z.literal(true),
  filingStatus: FilingStatusSchema,
  qualifyingChildren: z.number().int().min(0).max(2),
  qualifyingChildSourcesConfirmed: z.literal(true),
  otherDependents: z.number().int().min(0),
  otherDependentSourcesConfirmed: z.boolean().optional(),
  adjustedGrossIncome: dollarsAndCents,
  worksheetALine5: dollarsAndCents,
  worksheetAConfirmed: z.literal(true),
  w2s: z.array(z.strictObject({
    taxYear: z.literal(2026),
    owner: z.enum(["primary", "spouse"]),
    employerEin: z.string().regex(/^\d{2}-?\d{7}$/u),
    box1: dollarsAndCents,
    codeQ: dollarsAndCents,
  })).min(1).max(40),
});

export function projectSchedule8812WageOnly2026(sources: unknown): { text: Record<string, string>; checked: string[] } {
  const parsed = wageSources.safeParse(sources);
  if (!parsed.success) throw new Error("Schedule 8812 requires confirmed 2026 wage-only source records");
  const { filingStatus, qualifyingChildren, otherDependents, otherDependentSourcesConfirmed, adjustedGrossIncome, worksheetALine5, w2s } = parsed.data;
  if ((otherDependents === 0 && qualifyingChildren === 0) || (otherDependents > 0 && otherDependentSourcesConfirmed !== true)) {
    throw new Error("Schedule 8812 requires confirmed eligible dependent sources");
  }
  const employerOwners = w2s.map(w2 => `${w2.owner}/${w2.employerEin.replace("-", "")}`);
  if (new Set(employerOwners).size !== w2s.length || (filingStatus !== "married_filing_jointly" && w2s.some(w2 => w2.owner === "spouse"))) {
    throw new Error("Schedule 8812 requires distinct W-2 sources per employer and return owner");
  }
  const wages = sumStrings(...w2s.map(w2 => w2.box1));
  if (!wages.eq(adjustedGrossIncome)) throw new Error("Schedule 8812 Form 1040 line 11b must reconcile to original W-2 Box 1 wages");
  const combatPay = sumStrings(...w2s.map(w2 => w2.codeQ));
  const zero = d(0);
  const input = {
    taxYear: 2026, filingStatus, qualifyingChildren, otherDependents,
    agi: wages, adjustedGrossIncome: wages, puertoRicoExcludedIncome: zero, form4563ExcludedIncome: zero,
    foreignExcludedIncome: zero, earnedIncome: wages.plus(combatPay), nontaxableCombatPay: combatPay,
    taxLiability: d(worksheetALine5), filesForm2555: false, bonaFidePuertoRicoResident: false,
  };
  const exact = calculateForm8812(input, FEDERAL_2026_CONSTANTS);
  // Line 18a rounds the complete earned-income amount, including the amount on 18b.
  const printed = calculateForm8812({ ...input, agi: roundDollar(wages), adjustedGrossIncome: roundDollar(wages),
    earnedIncome: roundDollar(input.earnedIncome), nontaxableCombatPay: roundDollar(combatPay) }, FEDERAL_2026_CONSTANTS);
  const exactActcWorksheet = qualifyingChildren > 0 && exact.unusedCTC.gt(0);
  if (!exact.ctcBeforeLimitation.eq(printed.ctcBeforeLimitation) || !exact.nonrefundableCTC.eq(printed.nonrefundableCTC)
    || !exact.actc.eq(printed.actc) || (exactActcWorksheet && exact.earnedIncomeExcess.gt(0) !== printed.earnedIncomeExcess.gt(0))) {
    throw new Error("Exact Schedule 8812 amounts cannot reconcile to the printed rounded worksheet");
  }

  const { fields } = SCHEDULE_8812_2026_CANDIDATE;
  const audit = new Map(printed.lines.map(line => [line.line, line.value]));
  const text: Record<string, string> = {};
  const checked: string[] = [];
  const write = (lines: readonly ("1" | "2a" | "2b" | "2c" | "2d" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "16a" | "16b" | "17" | "18a" | "18b" | "19" | "20" | "27")[]) => {
    for (const line of lines) {
      const value = audit.get(line);
      if (value === undefined) throw new Error(`Missing Schedule 8812 line ${line} calculation`);
      text[fields[`line${line}`]] = roundDollar(value).toFixed(0);
    }
  };
  write(["1", "2a", "2b", "2c", "2d", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  if (printed.ctcBeforeLimitation.isZero()) return { text, checked: [fields.line12No] };
  checked.push(fields.line12Yes);
  write(["12", "13", "14", "16a"]);
  if (printed.unusedCTC.isZero()) return { text, checked };
  text[fields.line16bCount] = String(qualifyingChildren);
  write(["16b"]);
  if (qualifyingChildren === 0) return { text, checked };
  write(["17", "18a", "18b", "20", "27"]);
  const earnedIncomeExceedsMinimum = printed.earnedIncomeExcess.gt(0);
  checked.push(earnedIncomeExceedsMinimum ? fields.line19Yes : fields.line19No, fields.nextNo);
  if (earnedIncomeExceedsMinimum) write(["19"]);
  return { text, checked };
}
