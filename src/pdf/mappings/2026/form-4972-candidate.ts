/**
 * Final 2026 Form 4972 physical mapping candidate, Created 11/6/26.
 * Spec: spec/federal/form-4972-2026-template.yaml.
 */
import { StandardFonts, type PDFDocument } from "pdf-lib";
import { calculateForm4972, type Form4972Input } from "@/engine/forms/form-4972.js";
import { d, roundDollar } from "@/utils/decimal.js";

const page1 = "topmostSubform[0].Page1[0].";
const page3 = "topmostSubform[0].Page3[0].";
const nuaWorksheetFields = Array.from({ length: 8 }, (_, offset) =>
  `${page3}NUAWorksheet_ReadOrder[0].f3_${String(offset + 4).padStart(2, "0")}[0]`);
type NuaAnnotation = { line: "6" | "8"; text: string };
const page1Money = {
  line6: `${page1}f1_03[0]`,
  line7: `${page1}f1_04[0]`,
  line8: `${page1}f1_05[0]`,
  line9: `${page1}f1_06[0]`,
  line10: `${page1}f1_07[0]`,
  line11: `${page1}f1_08[0]`,
  line12: `${page1}f1_09[0]`,
  line13: `${page1}f1_10[0]`,
  line14: `${page1}Line14_ReadOrder[0].f1_11[0]`,
  line15: `${page1}f1_12[0]`,
  line16: `${page1}f1_13[0]`,
  line17: `${page1}f1_14[0]`,
  line18: `${page1}f1_15[0]`,
  line19: `${page1}f1_16[0]`,
  line21: `${page1}f1_19[0]`,
  line22: `${page1}f1_20[0]`,
  line23: `${page1}f1_21[0]`,
  line24: `${page1}f1_22[0]`,
  line25: `${page1}f1_23[0]`,
  line26: `${page1}f1_24[0]`,
  line27: `${page1}f1_25[0]`,
  line28: `${page1}f1_26[0]`,
  line29: `${page1}f1_27[0]`,
  line30: `${page1}f1_28[0]`,
};

export const FORM_4972_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f4972.pdf",
  sourceRevision: "Created 11/6/26",
  retrievedAt: "2026-11-13",
  sha256: "2968f25a528882666de3dab99ed9cf48ea8841e0fdbf6f409a71a4b419d4aa99",
  instructionsPages: Object.freeze([2, 3, 4]),
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  fields: Object.freeze({
    ...page1Money,
    name: `${page1}f1_01[0]`,
    identifyingNumber: `${page1}f1_02[0]`,
    line1Yes: `${page1}c1_1[0]`,
    line1No: `${page1}c1_1[1]`,
    line2Yes: `${page1}c1_2[0]`,
    line2No: `${page1}c1_2[1]`,
    line3Yes: `${page1}c1_3[0]`,
    line3No: `${page1}c1_3[1]`,
    line4Yes: `${page1}c1_4[0]`,
    line4No: `${page1}c1_4[1]`,
    line5aYes: `${page1}c1_5[0]`,
    line5aNo: `${page1}c1_5[1]`,
    line5bYes: `${page1}c1_6[0]`,
    line5bNo: `${page1}c1_6[1]`,
    line20Whole: `${page1}Line20_ReadOrder[0].f1_17[0]`,
    line20Fraction: `${page1}Line20_ReadOrder[0].f1_18[0]`,
  }),
  instructionFields: Object.freeze([
    `${page3}Col3[0].A[0].f3_01[0]`,
    `${page3}Col3[0].B[0].f3_02[0]`,
    `${page3}Col3[0].C[0].f3_03[0]`,
    ...nuaWorksheetFields,
    ...Array.from({ length: 7 }, (_, offset) => `${page3}DeathBenefitsWorksheet_ReadOrder[0].f3_${offset + 12}[0]`),
  ]),
});

const reconciliationError = "Form 4972 cannot reconcile the elected parts in whole dollars";

function displayedRatio(ratio: ReturnType<typeof d>, base: ReturnType<typeof d>, result: ReturnType<typeof d>) {
  const displayed = [3, 4, 5, 6].map(places => ratio.toFixed(places)).find(candidate =>
    roundDollar(base.times(candidate)).eq(result));
  if (!displayed) throw new Error(reconciliationError);
  return displayed.split(".");
}

function projectElectionAmounts(source: Form4972Input) {
  const exact = calculateForm4972(source);
  const rounded = (value: string) => roundDollar(d(value)).toFixed(0);
  const capitalGain = rounded(source.capitalGain);
  const netUnrealizedAppreciation = rounded(source.netUnrealizedAppreciation);
  const includesNua = source.sourceKind !== "death_beneficiary" && source.nuaTreatment === "include"
    && d(source.netUnrealizedAppreciation).gt(0);
  if ((exact.line6 && capitalGain === "0") || (includesNua && netUnrealizedAppreciation === "0")) throw new Error(reconciliationError);
  const printed = calculateForm4972({
    ...source,
    grossDistribution: rounded(source.grossDistribution),
    taxableAmount: rounded(source.taxableAmount),
    capitalGain,
    netUnrealizedAppreciation,
    actuarialValue: rounded(source.actuarialValue),
  });
  const sameLines = exact.lines.length === printed.lines.length && exact.lines.every((line, index) =>
    line.line === printed.lines[index].line && (line.line === "20" || roundDollar(line.value).eq(roundDollar(printed.lines[index].value))));
  const {
    line6, line7, line8, line10, line11, line12, line13, line14, line15, line16, line17, line19,
    line21, line22, line23, line24, line25, line26, line27, line28, line29, line30,
  } = Object.fromEntries(
    exact.lines.map(({ line, value }) => [`line${line}`, roundDollar(value)]),
  );
  const shownAllowance = line16 ?? d(0);
  const shownIncludedNua = includesNua ? d(netUnrealizedAppreciation) : d(0);
  const roundedFormulasAgree = (!line6 || (line6.gt(0) && roundDollar(line6.times("0.20")).eq(line7)))
    && (!line13 || (line13.minus(line15).eq(line16) && roundDollar(line14.times("0.20")).eq(line15)))
    && (!line8 || (roundDollar(d(source.taxableAmount)).plus(shownIncludedNua).minus(line6 ?? d(0)).eq(line8)
      && line10.plus(line11).eq(line12)
      && line12.minus(shownAllowance).eq(line17) && line19.times("0.10").eq(line23)
      && line24.times(10).eq(line25)));
  const annuityAgrees = !line22 || (line11.minus(line21).eq(line22) && line22.times("0.10").eq(line26)
    && line27.times(10).eq(line28) && line25.minus(line28).eq(line29));
  if (!sameLines || !roundedFormulasAgree
    || !annuityAgrees
    || (line30 && !(line7 ?? d(0)).plus(line29).eq(line30))
    || !roundDollar(printed.ordinaryPensionTransfer).eq(roundDollar(exact.ordinaryPensionTransfer))) {
    throw new Error(reconciliationError);
  }

  const text: Record<string, string> = {};
  for (const { line, value } of exact.lines) {
    if (line === "9" || line === "20" || (line === "18" && source.sourceKind !== "death_beneficiary")) continue;
    const key = `line${line}`;
    if (!Object.hasOwn(page1Money, key)) throw new Error(`Unmapped Form 4972 line ${line}`);
    text[page1Money[key as keyof typeof page1Money]] = roundDollar(value).toFixed(0);
  }
  if (line21) {
    const [whole, fraction] = displayedRatio(line11.dividedBy(line12), shownAllowance, line21);
    const { fields } = FORM_4972_2026_CANDIDATE;
    text[fields.line20Whole] = whole;
    text[fields.line20Fraction] = fraction;
  }

  const annotations: NuaAnnotation[] = [];
  let ordinaryNua = shownIncludedNua;
  if (exact.nuaWorksheet) {
    const printedWorksheet = printed.nuaWorksheet;
    const [a, b, , box6, capital, ordinary, total] = exact.nuaWorksheet.map(row => roundDollar(row.value));
    if (!printedWorksheet || !exact.nuaWorksheet.every((row, index) =>
      row.line === "C" || roundDollar(row.value).eq(roundDollar(printedWorksheet[index].value)))
      || !box6.minus(capital).eq(ordinary) || !a.plus(capital).eq(total)) throw new Error(reconciliationError);
    const [whole, fraction] = displayedRatio(a.dividedBy(b), box6, capital);
    const values = [a.toFixed(0), b.toFixed(0), whole, fraction, box6.toFixed(0), capital.toFixed(0), ordinary.toFixed(0), total.toFixed(0)];
    nuaWorksheetFields.forEach((field, index) => { text[field] = values[index]; });
    annotations.push({ line: "6", text: `NUA ${capital.toFixed(0)}` });
    ordinaryNua = ordinary;
  }
  if (line8 && includesNua) annotations.push({ line: "8", text: `NUA ${ordinaryNua.toFixed(0)}` });
  return { text, annotations };
}

export async function drawForm49722026Annotations(pdf: PDFDocument, annotations: readonly NuaAnnotation[]) {
  if (!annotations.length) return;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPage(0);
  const size = 7;
  for (const { line, text } of annotations) {
    const width = font.widthOfTextAtSize(text, size);
    if (width > 60) throw new Error("Form 4972 appreciation annotation exceeds the printed space");
    page.drawText(text, { x: 481 - width, y: line === "6" ? 485 : 389, font, size });
  }
}

export function projectForm49722026OwnPlan(source: Form4972Input) {
  if (source.sourceKind === "death_beneficiary") {
    throw new Error("The Form 4972 physical candidate requires the participant's own plan");
  }
  const { fields } = FORM_4972_2026_CANDIDATE;
  return {
    ...projectElectionAmounts(source),
    checked: [fields.line1Yes, fields.line2No, fields.line3No, fields.line4Yes, fields.line5aNo],
  };
}

export function projectForm49722026DeathBeneficiary(source: Form4972Input, answers: {
  recipientIsParticipantForThisDistribution?: boolean;
  recipientUsedForm4972ForOwnPlanAfter1986?: boolean;
}) {
  if (source.sourceKind !== "death_beneficiary") throw new Error("Form 4972 requires a death-beneficiary distribution");
  if (answers.recipientIsParticipantForThisDistribution !== false) {
    throw new Error("Form 4972 requires confirmation of the beneficiary recipient's relationship to this distribution");
  }
  if (typeof answers.recipientUsedForm4972ForOwnPlanAfter1986 !== "boolean") {
    throw new Error("Form 4972 requires the recipient's actual own-plan history to complete question 5a");
  }
  const { fields } = FORM_4972_2026_CANDIDATE;
  const ownPlanHistory = answers.recipientUsedForm4972ForOwnPlanAfter1986 ? fields.line5aYes : fields.line5aNo;
  return {
    ...projectElectionAmounts(source),
    checked: [fields.line1Yes, fields.line2No, fields.line3Yes, fields.line4No, ownPlanHistory, fields.line5bNo],
  };
}
