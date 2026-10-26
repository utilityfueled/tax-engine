/** Spec: spec/federal/form-8862-review.yaml. EIC-only source-bound review. */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { assertPdfExportAllowed, markReviewPdf } from '../../export-policy.js';
import { eicReviewOriginalSourceInput, type PreparedEicReview } from '../../eic-review-context.js';
import { loadReviewTemplate, setTextField, setCheckBox } from '../../pdf-utils.js';
const p1 = (name: string) => `topmostSubform[0].Page1[0].${name}`;
const p2 = (name: string) => `topmostSubform[0].Page2[0].${name}`;
/** Names and widget locations independently inspected in the final IRS PDF. */
export const FORM_8862_FIELDS = {
  name: p1('f1_01[0]'), ssn: p1('f1_02[0]'), line1: p1('Line1_CombField[0].f1_03[0]'),
  line2Eic: p1('Checkbox1_ReadOrder[0].c1_1[0]'), line2ChildCredits: p1('Checkbox2_ReadOrder[0].c1_2[0]'), line2Aotc: p1('Checkbox3_ReadOrder[0].c1_3[0]'),
  line3Yes: p1('c1_4[0]'), line3No: p1('c1_4[1]'), line4Yes: p1('c1_5[0]'), line4No: p1('c1_5[1]'),
  childNames: [p1('f1_04[0]'), p1('f1_05[0]'), p1('f1_06[0]')], line6Yes: p1('c1_6[0]'), line6No: p1('c1_6[1]'),
  childDays: [p1('Child1_CombField[0].f1_07[0]'), p1('Child2_CombField[0].f1_08[0]'), p1('Child3_CombField[0].f1_09[0]')],
  childBirth: [[p1('Child1_Birth_Ln8[0].f1_10[0]'), p1('Child1_Birth_Ln8[0].f1_11[0]')], [p1('Child2_Birth_Ln8[0].f1_14[0]'), p1('Child2_Birth_Ln8[0].f1_15[0]')], [p1('Child3_Birth_Ln8[0].f1_18[0]'), p1('Child3_Birth_Ln8[0].f1_19[0]')]],
  childDeath: [[p1('Child1_Death_Ln8[0].f1_12[0]'), p1('Child1_Death_Ln8[0].f1_13[0]')], [p1('Child2_Death_Ln8[0].f1_16[0]'), p1('Child2_Death_Ln8[0].f1_17[0]')], [p1('Child3_Death_Ln8[0].f1_20[0]'), p1('Child3_Death_Ln8[0].f1_21[0]')]],
  line9a: p2('Ln9a_CombField[0].f2_01[0]'), line9b: p2('Ln9b_CombField[0].f2_02[0]'), line10a: p2('f2_03[0]'), line10b: p2('f2_04[0]'),
  line11aYes: p2('c2_1[0]'), line11aNo: p2('c2_1[1]'), line11bYes: p2('c2_2[0]'), line11bNo: p2('c2_2[1]'),
} as const;
export async function fillForm8862(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string, review?: PreparedEicReview): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const original = eicReviewOriginalSourceInput(input, result, review);
  const current = result.scheduleEIC?.form8862;
  if (!original.eic?.recertificationSources || !current?.required || !current.currentFormRequirementsMet || !result.earnedIncomeCredit.gt(0)) throw new Error('Form8862 review requires actual completed current sources for a required positive EIC claim');
  const physical = current.physical;
  const children = (physical.childRows ?? []).map(row => {
    const index = Number(row.sourceId.slice('dependent:'.length)); const child = input.taxpayer.dependents[index];
    if (!child || !/^dependent:\d+$/.test(row.sourceId)) throw new Error('Form8862 original child index is missing from the rendering household');
    return { ...row, child };
  });
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm(), F = FORM_8862_FIELDS;
  const name = `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`
    + (input.taxpayer.filingStatus === 'married_filing_jointly' && input.taxpayer.spouse ? ` & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}` : '');
  setTextField(form, F.name, name); setTextField(form, F.ssn, input.taxpayer.primary.ssn.replaceAll('-', ''));
  setTextField(form, F.line1, String(physical.line1)); setCheckBox(form, F.line2Eic, true);
  setCheckBox(form, physical.line3IncomeOnly ? F.line3Yes : F.line3No, true);
  if (physical.line4OtherTaxpayerChild !== undefined) setCheckBox(form, physical.line4OtherTaxpayerChild ? F.line4Yes : F.line4No, true);
  if (physical.line6QualifyingChild !== undefined) setCheckBox(form, physical.line6QualifyingChild ? F.line6Yes : F.line6No, true);
  children.forEach((row, index) => {
    setTextField(form, F.childNames[index], `${row.child.firstName} ${row.child.lastName}`); setTextField(form, F.childDays[index], String(row.line7Days));
    for (const [date, fields] of [[row.line8Birth, F.childBirth[index]], [row.line8Death, F.childDeath[index]]] as const) if (date) {
      setTextField(form, fields[0], date.slice(0, 2)); setTextField(form, fields[1], date.slice(3, 5));
    }
  });
  for (const row of physical.claimantRows ?? []) {
    const primary = row.owner === 'primary'; setTextField(form, primary ? F.line9a : F.line9b, String(row.line9Days));
    setTextField(form, primary ? F.line10a : F.line10b, String(row.line10Age));
    setCheckBox(form, primary ? row.line11Dependent ? F.line11aYes : F.line11aNo : row.line11Dependent ? F.line11bYes : F.line11bNo, true);
  }
  const page = doc.addPage([612, 792]), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 744;
  const line = (text: string, heading = false) => { page.drawText(text, { x: 42, y, size: heading ? 13 : 10, font: heading ? bold : font }); y -= heading ? 25 : 18; };
  line('Current Form 8862 EIC source record', true); line(`Tax year ${physical.line1}; actual current sources and denial history reconciled.`);
  line('Parts III and IV are not completed by this EIC source method.');
  line(physical.line3IncomeOnly ? 'Income-only shortcut: only Part I and line 3 apply.' : 'Part II answers come from the actual claimant and child source records.'); y -= 8;
  for (const [index, row] of children.entries()) {
    line(`Child ${index + 1}: actual ${row.actualResidenceDays} days; printed ${row.line7Days} days.`);
    if (row.line8Birth || row.line8Death) line(`Birth during claim year: ${row.line8Birth ?? 'no'}; death: ${row.line8Death ?? 'no'}.`);
    if (current.requiredChildEvidenceSourceIds?.includes(row.sourceId)) {
      line('Attach the actual live-birth document copy for this child.');
      line('The source record confirms availability; no certificate is created here.');
    }
  }
  for (const row of physical.claimantRows ?? []) {
    line(`${row.owner === 'primary' ? 'Primary filer' : 'Spouse'}: ${row.line9Days} home days; age ${row.line10Age}; dependent answer ${row.line11Dependent ? 'Yes' : 'No'}.`);
    line(`Actual period: ${row.applicableYearStart} through ${row.applicableYearEnd}; ${row.applicableYearDays} days.`);
  }
  y -= 8; line('Original identifiers and source reference text are omitted from this summary.');
  line('This review record does not qualify the return for filing.');
  await markReviewPdf(doc); return doc;
}
