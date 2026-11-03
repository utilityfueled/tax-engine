/** Spec: state/oh-school-district-official-review.yaml. Static redacted review only. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFTextField, PDFCheckBox, PDFButton, PDFDropdown, StandardFonts } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { resolveOhioResidencyReview, type PreparedOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { buildOhioResidentReturnInput, type OhioOverlayInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
import { d, roundDollar } from '@/utils/decimal.js';

const sourceHash = '4b065c66f85d9f732e52bc45c78f5ba2d9439c10a9ee1da5dbb95a35bea38a5e';
const templateCounts: Record<string, number> = { '1380 0 R': 53, '1462 0 R': 53, '1296 0 R': 16 };
// Official printed labels control; the source keeps legacy names from older revisions.
const printedFields: Record<string, string> = {
  '1':'L1','2':'L2','3':'L3','4':'L4','5':'L5','6':'L6','7':'L7','8':'L8','9':'L9','10':'L10',
  '11':'L11','12':'L12','13':'L14','15':'L16','16':'L17','17':'L18','18':'L19','19':'L20','20':'L21','21':'L22',
};
function text(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getTextField(name);
  field.setText(value); field.setFontSize(0);
  if ((field.getText() ?? '') !== value) throw new Error('Ohio school official canonical value was not retained.');
}
function selectActualStatus(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getField(name);
  field.acroField.dict.set(PDFName.of('V'), PDFName.of(value));
  let selected = 0;
  for (const widget of field.acroField.getWidgets()) {
    const normal = widget.getAppearances()?.normal;
    if (!(normal instanceof PDFDict)) throw new Error('Ohio school official status appearance missing.');
    const on = normal.has(PDFName.of(value));
    widget.setAppearanceState(PDFName.of(on ? value : 'Off'));
    if (on) selected++;
  }
  if (selected !== 1) throw new Error('Ohio school official status source inventory changed.');
}
async function loadOfficialSource() {
  const bytes = await readFile(join('forms','blank','2025','oh-sd100-bundle.pdf'));
  if (createHash('sha256').update(bytes).digest('hex') !== sourceHash) throw new Error('Ohio school official source revision changed.');
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== 5) throw new Error('Ohio school official page inventory changed.');
  const form = doc.getForm(), realPages = new Set(doc.getPages().map(page => page.ref.toString()));
  const removed: Record<string, number> = {};
  // Exact source has three non-page templates, not missing rendered page widgets.
  // Validate all122 identities before removing only their widgets; never reattach.
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    for (let index = widgets.length - 1; index >= 0; index--) {
      const widget = widgets[index]; if (!widget) throw new Error('Ohio school source widget missing.');
      const page = widget.P();
      if (!page) throw new Error('Ohio school source widget page missing.');
      if (!realPages.has(page.toString())) {
        const key = page.toString();
        if (!(key in templateCounts) || doc.context.lookup(page, PDFDict).get(PDFName.of('Type'))?.toString() !== '/Template')
          throw new Error('Unexpected Ohio school non-page widget.');
        removed[key] = (removed[key] ?? 0) + 1; field.acroField.removeWidget(index);
      }
    }
    if (!field.acroField.getWidgets().length) form.acroForm.removeField(field.acroField);
  }
  for (const [key, count] of Object.entries(templateCounts)) {
    if (removed[key] !== count) throw new Error('Ohio school template widget inventory changed.');
  }
  for (const field of form.getFields()) {
    if (field instanceof PDFButton || field instanceof PDFDropdown) {
      // Authoring controls and UPC-only selectors are never taxpayer source facts.
      for (const widget of field.acroField.getWidgets()) {
        const ref = doc.context.getObjectRef(widget.dict);
        if (!ref) throw new Error('Ohio school authoring widget reference missing.');
        for (const page of doc.getPages()) page.node.removeAnnot(ref);
      }
      form.acroForm.removeField(field.acroField); continue;
    }
    field.acroField.dict.delete(PDFName.of('AA')); field.acroField.dict.delete(PDFName.of('DV'));
    if (field instanceof PDFTextField) field.setText('');
    else if (field instanceof PDFCheckBox) field.uncheck();
    else throw new Error('Unexpected Ohio school source field type.');
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('A')); widget.dict.delete(PDFName.of('AA'));
    }
  }
  doc.catalog.delete(PDFName.of('OpenAction')); doc.catalog.delete(PDFName.of('AA')); doc.catalog.delete(PDFName.of('Names'));
  return doc;
}
/** Current private replay and actual printed-row qualification precede template/output I/O. */
export async function fillOhioSchoolDistrictOfficialReview(
  input: TaxYearInput, federal: TaxReturnResult, outputDir: string,
  overlay: OhioOverlayInput, context?: PreparedOhioResidencyReview,
): Promise<string[]> {
  assertPdfExportAllowed(input.taxpayer.taxYear, federal.taxYear);
  if (!input.ohioSchoolDistrict || Object.keys(overlay).length) return [];
  const original = resolveOhioResidencyReview(input, federal, context);
  const adapted = buildOhioResidentReturnInput(original, federal), result = calculateOhioResidentReturn(adapted);
  const sd = result.sd100, source = result.schoolDistrictSource, facts = original.ohioSchoolDistrict;
  const w2 = original.w2s[0], coverage = facts?.w2Sources[0];
  if (!sd || !source || !facts || original.w2s.length !== 1 || !w2?.stateLocalSources || !coverage || facts.w2Sources.length !== 1
      || original.taxpayer.dependents.length || coverage.w2Index !== 0) return [];
  const declaredSchool = coverage.localRows.filter(row => row.classification === 'school_district');
  if (declaredSchool.length !== 1) return []; // Multiple same-district originals need their separately reviewed printed-row method.
  const declared = declaredSchool[0]; if (!declared) throw new Error('Actual school local classification missing.');
  const checked = calculateW2StateLocalSources(original, 0, w2.stateLocalSources);
  const local = w2.stateLocalSources.localRows.find(row => row.printedRow === declared.printedRow);
  const states = checked.stateRows.filter(row => row.state === 'OH');
  if (!local || states.length !== 1) return [];
  const state = states[0]; if (!state) throw new Error('Actual Ohio employer state row missing.');
  const rawState = w2.stateLocalSources.stateRows.find(row => row.printedRow === state.printedRow);
  if (!rawState) throw new Error('Actual Ohio employer state original missing.');
  let ohioId = '';
  if (rawState.employerStateIDStatus === 'reported') {
    const actual = rawState.employerStateID?.trim() ?? '';
    if (!/^\d{8,9}$/.test(actual)) throw new Error('Ohio school official review needs the actual eight or nine digit employer Ohio ID.');
    ohioId = actual.slice(0, 8);
  }
  if (!sd.line11_sdWithholding.eq(local.withheld)) throw new Error('Ohio school official local withholding differs from fresh return.');
  const detail = sd.districtDetails[0];
  if (sd.districtDetails.length !== 1 || !detail || detail.districtNumber !== '0302' || detail.taxType !== 'earned_income')
    throw new Error('Ohio school official district result differs from its actual source cohort.');
  const display = redactReviewIdentifiers(original), primary = display.taxpayer.primary, address = display.taxpayer.address;
  const doc = await loadOfficialSource();
  // Pinned2025 source COLA37 incorrectly allows4chars; the official table's
  // exact0302 decimal .0125 needs5. Only this marked review-copy field changes.
  const rateField = doc.getForm().getTextField('COLA37');
  if (rateField.getMaxLength() !== 4 || !detail.rate.eq('0.0125'))
    throw new Error('Ohio school official rate source representation changed.');
  const rateText = detail.rate.toFixed(4).replace(/^0(?=\.)/, '');
  if (rateText !== '.0125') throw new Error('Ohio school official rate notation changed.');
  rateField.setMaxLength(5);
  for (const [name, value] of Object.entries({ TP_FN:primary.firstName.toUpperCase(), TP_LN:primary.lastName.toUpperCase(),
    ADDRESS1:address.street.toUpperCase(), ADDRESS2:address.apt?.toUpperCase() ?? '', CITY:address.city.toUpperCase(), STATE:address.state,
    ZIP:address.zip, SD_NUM0:'0302', RES_END0:'12-31', day0:'365', res_factor0:source.residentIncome.residencyFactor.toFixed(4),
  })) text(doc, name, value);
  const skipAmountDue = sd.line15_netPayments.gt(sd.line10_totalLiability);
  for (const line of sd.lines) {
    const name = printedFields[line.line];
    if (name && !(skipAmountDue && ['16','17','18'].includes(line.line))) text(doc, name, line.value.toFixed(0));
  }
  const income = source.residentIncome;
  for (const [name, value] of Object.entries({ COLASD2:'0302', COLA30:income.line29.toFixed(0), COLA31:income.line30.toFixed(0),
    COLA32:income.line31.toFixed(0), COLA35:income.line32.toFixed(0), COLA36:income.line33.toFixed(0),
    COLA37:rateText, COLA38:detail.grossTax.toFixed(0),
    COLA39:detail.seniorCredit.toFixed(0), COLA40:detail.taxAfterCredits.toFixed(0),
    LINE41:sd.line7_earnedIncomeTax.toFixed(0),
  })) text(doc, name, value);
  const hasWithholding = sd.line11_sdWithholding.gt(0);
  if (hasWithholding) for (const [name, value] of Object.entries({ TotalWithholding:sd.line11_sdWithholding.toFixed(0), SchedW_B_L1_PS:'P',
    SchedW_B_L1_SD:'0302', SchedW_B_L1_EIN:display.w2s[0]?.employer.ein ?? '', SchedW_B_L1_WAGE:roundDollar(d(w2.wages)).toFixed(0),
    SchedW_B_L1_FITW:roundDollar(d(w2.federalWithheld)).toFixed(0), SchedW_B_L1_OHID:ohioId,
    SchedW_B_L1_OHWAGE:roundDollar(d(local.wages)).toFixed(0), SchedW_B_L1_OHIT:sd.line11_sdWithholding.toFixed(0),
  })) text(doc, name, value);
  await doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  selectActualStatus(doc, 'CHK_FILING_STATUS', '1'); selectActualStatus(doc, 'PRIMARY_CHK0', '1');
  doc.getForm().flatten({ updateFieldAppearances: false });
  doc.catalog.delete(PDFName.of('AcroForm')); doc.catalog.delete(PDFName.of('Names'));
  for (const page of doc.getPages()) { page.node.delete(PDFName.of('Annots')); page.node.delete(PDFName.of('AA')); }
  const plans = [{ pages:[0,1,2], name:'oh-sd-100-review.pdf' }, ...(hasWithholding ? [{ pages:[3], name:'oh-sd-withholding-review.pdf' }] : [])];
  const prepared: Array<{ path:string; bytes:Uint8Array }> = [];
  for (const plan of plans) {
    const clean = await PDFDocument.create();
    for (const page of await clean.copyPages(doc, plan.pages)) clean.addPage(page);
    clean.setTitle('Ohio 2025 school district redacted review'); clean.setAuthor('Tax Engine'); clean.setCreator('Tax Engine'); clean.setProducer('Tax Engine');
    await markReviewPdf(clean); prepared.push({ path:join(outputDir, plan.name), bytes:await clean.save() });
  }
  await mkdir(outputDir, { recursive:true });
  for (const file of prepared) await writeFile(file.path, file.bytes);
  return prepared.map(file => file.path);
}
