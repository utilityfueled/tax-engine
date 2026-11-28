/**
 * Final 2026 Schedule 8812 physical mapping candidate, Created 8/18/26.
 * Spec: spec/federal/schedule-8812-2026-template.yaml.
 * Internal wage-only projection. Public review and filing stay disabled.
 */
import { z } from "zod";
import { calculateForm8812, type Form8812Result } from "@/engine/forms/form-8812.js";
import { FEDERAL_2026_CONSTANTS, FEDERAL_2026_INDEXED } from "@/models/federal-2026-indexed.js";
import { FilingStatusSchema } from "@/models/inputs.js";
import { d, min, roundDollar, sumStrings, zeroFloor } from "@/utils/decimal.js";

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
const confirmedZero = z.string().regex(/^0{1,12}(?:\.0{1,2})?$/u);
const sourceReference = z.string().trim().min(1);
const ordinaryW2Payroll = z.strictObject({
  sourceReference,
  box3: dollarsAndCents,
  box4: dollarsAndCents,
  box5: dollarsAndCents,
  box6: dollarsAndCents,
  box7: confirmedZero,
});
const partIIBSources = z.strictObject({
  taxYear: z.literal(2026),
  sourceReference,
  originalWorkpapersConfirmed: z.literal(true),
  noAdditionalMedicareOrRrtaConfirmed: z.literal(true),
  schedule1Line15: confirmedZero,
  schedule2Line16c: confirmedZero,
  schedule2Line17c: confirmedZero,
  form1040Line27a: dollarsAndCents,
  form1040SeparationCheckboxConfirmed: z.boolean().optional(),
  scheduleEicChildResidenceConfirmed: z.boolean().optional(),
  schedule3Line11: confirmedZero,
  reportedLine24: z.string().regex(/^\d{1,12}$/u),
});
const wageSources = z.strictObject({
  taxYear: z.literal(2026),
  parentForm: z.literal("1040"),
  annualSourcesConfirmed: z.literal(true),
  wageOnlyNoExclusionsOrWorksheetBConfirmed: z.literal(true),
  nonPuertoRicoResidentConfirmed: z.literal(true),
  filingStatus: FilingStatusSchema,
  qualifyingChildren: z.number().int().min(0),
  qualifyingChildSourcesConfirmed: z.literal(true),
  otherDependents: z.number().int().min(0),
  otherDependentSourcesConfirmed: z.boolean().optional(),
  adjustedGrossIncome: dollarsAndCents,
  worksheetALine5: dollarsAndCents,
  worksheetAConfirmed: z.literal(true),
  // A supported bypass never reads or validates Part II-B originals.
  partIIB: z.unknown().optional(),
  w2s: z.array(z.strictObject({
    taxYear: z.literal(2026),
    owner: z.enum(["primary", "spouse"]),
    employerEin: z.string().regex(/^\d{2}-?\d{7}$/u),
    box1: dollarsAndCents,
    codeQ: dollarsAndCents,
    ordinaryPayroll: z.unknown().optional(),
  })).min(1).max(40),
});

function readPartIIB({ partIIB, w2s, filingStatus }: z.infer<typeof wageSources>) {
  const workpapers = partIIBSources.safeParse(partIIB);
  if (!workpapers.success) throw new Error("Schedule 8812 Part II-B requires confirmed original 2026 source workpapers and known supported taxes and offsets");
  const original = workpapers.data;
  const earnedIncomeCredit = d(original.form1040Line27a);
  if (earnedIncomeCredit.gt(FEDERAL_2026_INDEXED.eitc.maximumCredit[3])) {
    throw new Error("Schedule 8812 Part II-B Form 1040 line 27a exceeds the published 2026 earned income credit maximum");
  }
  const excessSocialSecurityWithholding = d(original.schedule3Line11);
  if (!roundDollar(earnedIncomeCredit.plus(excessSocialSecurityWithholding)).eq(original.reportedLine24)) {
    throw new Error("Schedule 8812 Part II-B original offsets do not reconcile to the reported line 24");
  }
  if (filingStatus === "married_filing_separately" && earnedIncomeCredit.gt(0)
    && (original.form1040SeparationCheckboxConfirmed !== true || original.scheduleEicChildResidenceConfirmed !== true)) {
    throw new Error("Schedule 8812 Part II-B separate-return earned income credit requires the same-return Form 1040 separation checkbox and Schedule EIC qualifying-child residence for more than half the year");
  }

  const { socialSecurityWageBase } = FEDERAL_2026_CONSTANTS.selfEmploymentTax;
  const payroll = w2s.map(w2 => {
    const source = ordinaryW2Payroll.safeParse(w2.ordinaryPayroll);
    if (!source.success) throw new Error("Schedule 8812 Part II-B requires original ordinary W-2 payroll boxes for each owner and employer");
    const { box3, box4, box5, box6 } = source.data;
    const medicareWages = d(box5);
    if (medicareWages.lt(w2.box1) || medicareWages.gt("200000") || !d(box3).eq(min(medicareWages, socialSecurityWageBase))
      || !d(box3).times("0.062").toDecimalPlaces(2).eq(box4) || !medicareWages.times("0.0145").toDecimalPlaces(2).eq(box6)) {
      throw new Error("Schedule 8812 Part II-B original W-2 payroll wages and taxes must reconcile to ordinary withholding");
    }
    return { owner: w2.owner, box4, box5, box6 };
  });
  const maximumSocialSecurityWithholding = socialSecurityWageBase.times("0.062");
  for (const owner of ["primary", "spouse"] as const) {
    if (sumStrings(...payroll.filter(w2 => w2.owner === owner).map(w2 => w2.box4)).gt(maximumSocialSecurityWithholding)) {
      throw new Error("Schedule 8812 Part II-B W-2 payroll conflicts with the confirmed zero excess Social Security withholding");
    }
  }
  if (sumStrings(...payroll.map(w2 => w2.box5)).gt(FEDERAL_2026_CONSTANTS.additionalMedicareTax.threshold[filingStatus])) {
    throw new Error("Schedule 8812 Part II-B W-2 payroll requires a separate Additional Medicare Tax worksheet");
  }
  return {
    payrollTaxes: sumStrings(...payroll.flatMap(w2 => [w2.box4, w2.box6])),
    additionalPayrollTaxes: sumStrings(original.schedule1Line15, original.schedule2Line16c, original.schedule2Line17c),
    earnedIncomeCredit, excessSocialSecurityWithholding,
  };
}

function needsPartIIB(result: Form8812Result): boolean {
  const refundableCap = result.lines.find(({ line }) => line === "16b")?.value;
  const available = result.lines.find(({ line }) => line === "17")?.value;
  return refundableCap?.gte("5100") === true && available?.gt(result.fifteenPercent) === true;
}

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
  // Line 18a rounds the complete earned-income amount, including the amount on 18b.
  const printedInput = { ...input, agi: roundDollar(wages), adjustedGrossIncome: roundDollar(wages),
    earnedIncome: roundDollar(input.earnedIncome), nontaxableCombatPay: roundDollar(combatPay) };
  // These zeros establish whether the printed branch needs originals. They never back an active Part II-B projection.
  const branchOnly = { payrollTaxes: zero, additionalPayrollTaxes: zero, earnedIncomeCredit: zero, excessSocialSecurityWithholding: zero };
  let exact = calculateForm8812({ ...input, ...branchOnly }, FEDERAL_2026_CONSTANTS);
  let printed = calculateForm8812({ ...printedInput, ...branchOnly }, FEDERAL_2026_CONSTANTS);
  const exactActcWorksheet = qualifyingChildren > 0 && exact.unusedCTC.gt(0);
  const partIIB = needsPartIIB(printed);
  if (partIIB !== needsPartIIB(exact)) throw new Error("Exact Schedule 8812 Part II-B branch cannot reconcile to the printed rounded worksheet");
  if (partIIB) {
    const payroll = readPartIIB(parsed.data);
    exact = calculateForm8812({ ...input, ...payroll }, FEDERAL_2026_CONSTANTS);
    printed = calculateForm8812({ ...printedInput, ...payroll }, FEDERAL_2026_CONSTANTS);
    const netPayroll = payroll.payrollTaxes.plus(payroll.additionalPayrollTaxes).minus(payroll.earnedIncomeCredit).minus(payroll.excessSocialSecurityWithholding);
    if (!roundDollar(zeroFloor(netPayroll)).eq(printed.payrollAlternative)) {
      throw new Error("Exact Schedule 8812 payroll offsets cannot reconcile to the printed rounded worksheet");
    }
  }
  if (!exact.ctcBeforeLimitation.eq(printed.ctcBeforeLimitation) || !exact.nonrefundableCTC.eq(printed.nonrefundableCTC)
    || !exact.actc.eq(printed.actc) || (exactActcWorksheet && exact.earnedIncomeExcess.gt(0) !== printed.earnedIncomeExcess.gt(0))) {
    throw new Error("Exact Schedule 8812 amounts cannot reconcile to the printed rounded worksheet");
  }

  const { fields } = SCHEDULE_8812_2026_CANDIDATE;
  const audit = new Map(printed.lines.map(line => [line.line, line.value]));
  const text: Record<string, string> = {};
  const checked: string[] = [];
  const write = (lines: readonly ("1" | "2a" | "2b" | "2c" | "2d" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "16a" | "16b" | "17" | "18a" | "18b" | "19" | "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27")[]) => {
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
  checked.push(earnedIncomeExceedsMinimum ? fields.line19Yes : fields.line19No, audit.get("16b")?.gte("5100") ? fields.nextYes : fields.nextNo);
  if (earnedIncomeExceedsMinimum) write(["19"]);
  if (partIIB) write(["21", "22", "23", "24", "25", "26"]);
  return { text, checked };
}
