/** Spec: state/oh-resident-credit-official-review.yaml. Original-bound static review only. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFButton, PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFName, PDFTextField, StandardFonts } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { buildOhioResidentReturnInput, type OhioOverlayInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { buildOhioResidentCreditSource } from '@/engine/state/oh-resident-credit-source.js';
import { calculateOhioReturnHeaderSource } from '@/engine/state/oh-return-header-source.js';
import { resolveOhioResidencyReview, type PreparedOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
import { resolveReviewTemplateDirectory } from '@/pdf/template-registry.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { d, roundDollar } from '@/utils/decimal.js';

const bundleHash = '4e6432e23df3bf181a8e9d7ee5d5bb7e2e96a6a21dd65fa39c625fb8a7e2f57c';
const residentCreditHash = 'ebd9960d6a8004d6803f0f22238f989043db794e9ebc9aa9fcb3d5588112cb48';
const brand = Symbol('prepared Ohio resident-credit official review');
export interface PreparedOhioResidentCreditOfficialReview {
  readonly [brand]: true;
}
interface Projection {
  readonly includeWithholding: boolean;
  readonly bundle: Readonly<Record<string, string>>;
  readonly residentCredit: Readonly<Record<string, string>>;
}
const prepared = new WeakMap<PreparedOhioResidentCreditOfficialReview, Projection>();
const printedItFields: Readonly<Record<string, string>> = {
  '1':'L1','2a':'L2A','2b':'L2B','3':'L3','4':'L4','5':'L5','6':'L6','7':'L7',
  '8a':'L8A','8b':'L8B','8c':'L8C','9':'L9','10':'L10','11':'L11','12':'L12','13':'L13',
  '14':'L14','15':'L15','16':'L16','17':'L17','19':'L19','20':'L20','21':'L21','22':'L22',
  '23':'L23','24':'L24','26':'L26',
};
function fail(message: string): never {
  throw new Error(`Ohio resident-credit official review: ${message}`);
}

/** Pure validation/projection: call before any public packet template or output I/O. */
export function prepareOhioResidentCreditOfficialReview(
  input: TaxYearInput, federal: TaxReturnResult, overlay: OhioOverlayInput = {},
  context?: PreparedOhioResidencyReview,
): PreparedOhioResidentCreditOfficialReview | undefined {
  assertPdfExportAllowed(input.taxpayer.taxYear, federal.taxYear);
  if (input.ohioReturnHeaderSources === undefined) return undefined;
  // The ordinary-business physical method owns its separately validated header branch.
  if (input.ohioResidency?.businessSources !== undefined) return undefined;
  const original = resolveOhioResidencyReview(input, federal, context);
  const header = calculateOhioReturnHeaderSource(original, original.ohioReturnHeaderSources);
  const facts = original.ohioResidency;
  // The factual header alone does not qualify any financial physical packet.
  if (facts?.residentCreditSources === undefined) return undefined;
  if (Object.keys(overlay).length) fail('caller overlays require their separate source composition');
  buildOhioResidentCreditSource(original, federal, facts);
  const result = calculateOhioResidentReturn(buildOhioResidentReturnInput(original, federal));
  const credit = result.residentCredit, w2 = original.w2s[0];
  if (!credit || !w2?.stateLocalSources || result.sd100 || !result.nonresidentCreditResult?.fullResidentOnly
      || !result.nonresidentCreditResult.line20.isZero() || result.schoolDistrictSource
      || !result.scheduleOfAdjustments.line14_totalAdditions.isZero()
      || !result.scheduleOfAdjustments.line47_totalDeductions.isZero()
      || !result.scheduleOfCredits.line40_totalNonrefundableCredits.eq(credit.line7_residentCredit)
      || !result.it1040.line16_refundableCredits.isZero()
      || !result.it1040.line11_underpaymentPenalty.isZero() || !result.it1040.line12_useTax.isZero()
      || !result.it1040.line15_estimatedPayments.isZero() || !result.it1040.line18_amendedPriorOverpayment.isZero()
      || !result.it1040.line21_latePaymentInterest.isZero() || !result.it1040.line24_creditCarryforward.isZero()
      || !result.it1040.line25_donations.isZero() || credit.stateDetails.length !== 1
      || credit.stateDetails[0]?.stateCode !== 'VA' || credit.stateDetails[0]?.incomeType !== 'compensation')
    fail('complete current finite resident-credit result required');
  const stateLocal = calculateW2StateLocalSources(original, 0, w2.stateLocalSources);
  const ohioRows = stateLocal.stateRows.filter(row => row.state === 'OH');
  const ohioRow = ohioRows[0];
  const stateOriginal = w2.stateLocalSources.stateRows.find(row => row.printedRow === ohioRow?.printedRow);
  if (ohioRows.length !== 1 || !ohioRow || !stateOriginal || stateOriginal.employerStateIDStatus !== 'reported')
    fail('the actual reported Ohio employer withholding account is required');
  const actualAccount = stateOriginal.employerStateID?.trim() ?? '';
  if (!/^\d{8,9}$/.test(actualAccount)) fail('the actual employer Ohio ID must have eight or nine digits');
  if (!result.it1040.line14_ohioWithholding.eq(roundDollar(ohioRow.withheld)))
    fail('current actual Ohio withholding differs from the canonical return');
  const display = redactReviewIdentifiers(original), primary = display.taxpayer.primary, address = display.taxpayer.address;
  const employerEin = w2.employer.ein.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(employerEin)) fail('the actual ordinary employer business EIN is required');
  const bundle: Record<string, string> = {
    TP_FN:primary.firstName.toUpperCase(), TP_LN:primary.lastName.toUpperCase(),
    ADDRESS1:address.street.toUpperCase(), ADDRESS2:address.apt?.toUpperCase() ?? '',
    CITY:address.city.toUpperCase(), STATE:address.state, ZIP:address.zip,
    SD_NUM:header.header.schoolDistrictNumber, COUNTY:header.header.ohioCounty, L4_EXEMPT:'1',
    L7a:result.it1040.line7_taxableNonbusinessIncome.toFixed(0),
    SchedW_A:result.it1040.line14_ohioWithholding.toFixed(0), SchedW_B_L1_PS:'P',
    SchedW_B_L1_EIN:employerEin, SchedW_B_L1_WAGE:roundDollar(d(w2.wages)).toFixed(0),
    SchedW_B_L1_FITW:roundDollar(d(w2.federalWithheld)).toFixed(0),
    // Actual2025 Schedule of Withholding: a nine-digit original prints only its first eight.
    SchedW_B_L1_OHID:actualAccount.slice(0, 8), SchedW_B_L1_OHWAGE:roundDollar(ohioRow.wages).toFixed(0),
    SchedW_B_L1_OHIT:roundDollar(ohioRow.withheld).toFixed(0),
  };
  const skipAmountDue = result.it1040.line19_netPayments.gt(result.it1040.line13_totalLiability);
  for (const line of result.it1040.lines) {
    const name = printedItFields[line.line];
    if (name && !(skipAmountDue && ['20','21','22'].includes(line.line))) bundle[name] = line.value.toFixed(0);
  }
  for (const name of ['L25A','L25B','L25C','L25D','L25E','L25F','L25G']) bundle[name] = '0';
  for (const line of result.scheduleOfCredits.lines)
    if (/^\d+$/.test(line.line)) bundle[`SchedC_L${line.line}`] = line.value.toFixed(0);
  const residentCredit: Record<string, string> = {
    'VA Income':credit.line1_totalDoubleTaxedIncome.toFixed(0), 'VA Tax':credit.line2_totalOtherStateTax.toFixed(0),
    SUM_A:credit.line1_totalDoubleTaxedIncome.toFixed(0), SUM_B:credit.line2_totalOtherStateTax.toFixed(0),
    OAGI:credit.line3_ohioAgi.toFixed(0), RATIO:credit.line4_apportionmentFraction.toFixed(4),
    SOC:credit.line5_taxAvailable.toFixed(0), LINE_6:credit.line6_ohioTaxOnOtherStateIncome.toFixed(0),
    LINE_7:credit.line7_residentCredit.toFixed(0),
  };
  const token = Object.freeze({ [brand]: true as const });
  prepared.set(token, { includeWithholding:ohioRow.withheld.gt(0), bundle:Object.freeze(bundle), residentCredit:Object.freeze(residentCredit) });
  return token;
}

async function loadExactSource(sourceDirectory: string, filename: string, hash: string, pageCount: number) {
  const bytes = await readFile(join(sourceDirectory, filename));
  if (createHash('sha256').update(bytes).digest('hex') !== hash) fail('official source revision changed');
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== pageCount) fail('official source page inventory changed');
  const form = doc.getForm();
  for (const field of form.getFields()) {
    if (field instanceof PDFButton || field instanceof PDFDropdown) {
      for (const widget of field.acroField.getWidgets()) {
        const ref = doc.context.getObjectRef(widget.dict);
        if (!ref) fail('authoring control widget reference missing');
        for (const page of doc.getPages()) page.node.removeAnnot(ref);
      }
      form.acroForm.removeField(field.acroField);
      continue;
    }
    field.acroField.dict.delete(PDFName.of('AA')); field.acroField.dict.delete(PDFName.of('DV'));
    if (field instanceof PDFTextField) field.setText('');
    else if (field instanceof PDFCheckBox) field.uncheck();
    else fail('unexpected official source field type');
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('A')); widget.dict.delete(PDFName.of('AA'));
    }
  }
  doc.catalog.delete(PDFName.of('OpenAction')); doc.catalog.delete(PDFName.of('AA')); doc.catalog.delete(PDFName.of('Names'));
  return doc;
}
function setText(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getTextField(name);
  const max = field.getMaxLength();
  if (max !== undefined && value.length > max) fail('actual printed value exceeds the original source field constraint');
  field.setText(value); field.setFontSize(0);
  if ((field.getText() ?? '') !== value) fail('actual printed value was not retained');
}
function selectStatus(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getField(name);
  field.acroField.dict.set(PDFName.of('V'), PDFName.of(value));
  let selected = 0;
  for (const widget of field.acroField.getWidgets()) {
    const normal = widget.getAppearances()?.normal;
    if (!(normal instanceof PDFDict)) fail('actual status appearance missing');
    const on = normal.has(PDFName.of(value));
    if (on) {
      const rect = widget.getRectangle();
      if (rect.width < 0 || rect.height < 0) widget.setRectangle({
        x:Math.min(rect.x, rect.x + rect.width), y:Math.min(rect.y, rect.y + rect.height),
        width:Math.abs(rect.width), height:Math.abs(rect.height),
      });
      selected++;
    }
    widget.setAppearanceState(PDFName.of(on ? value : 'Off'));
  }
  if (selected !== 1) fail('actual selected status widget inventory changed');
}
function flattenSource(doc: PDFDocument, bundle: boolean) {
  const form = doc.getForm(), pages = new Set(doc.getPages().map(page => page.ref.toString()));
  let orphanCount = 0;
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    for (let index = widgets.length - 1; index >= 0; index--) {
      const widget = widgets[index];
      if (!widget) fail('official source widget missing');
      const page = widget.P();
      if (page && !pages.has(page.toString())) {
        if (!bundle || !['2436 0 R','2365 0 R','2344 0 R'].includes(page.toString())
            || doc.context.lookup(page, PDFDict).get(PDFName.of('Type'))?.toString() !== '/Template')
          fail('unexpected unrendered source widget');
        field.acroField.removeWidget(index); orphanCount++;
      }
    }
  }
  if (orphanCount !== (bundle ? 103 : 0)) fail('official non-page template inventory changed');
  form.flatten({ updateFieldAppearances:false });
  doc.catalog.delete(PDFName.of('AcroForm')); doc.catalog.delete(PDFName.of('Names'));
  for (const page of doc.getPages()) { page.node.delete(PDFName.of('Annots')); page.node.delete(PDFName.of('AA')); }
}

/** Materialize only a locally prepared immutable projection; stage every byte before output creation. */
export async function fillOhioResidentCreditOfficialReview(
  token: PreparedOhioResidentCreditOfficialReview, outputDir: string,
  blankFormsDir = join('forms', 'blank'),
): Promise<string[]> {
  const projection = prepared.get(token);
  if (!projection) fail('valid current private prepared projection required');
  const sourceDirectory = resolveReviewTemplateDirectory(blankFormsDir, 2025);
  const bundle = await loadExactSource(sourceDirectory, 'oh-it1040-bundle.pdf', bundleHash, 13);
  const residentCredit = await loadExactSource(sourceDirectory, 'oh-it-rc.pdf', residentCreditHash, 1);
  if (residentCredit.getForm().getTextField('RATIO').getMaxLength() !== 6) fail('actual IT RC ratio source constraint changed');
  for (const [name, value] of Object.entries(projection.bundle)) setText(bundle, name, value);
  for (const [name, value] of Object.entries(projection.residentCredit)) setText(residentCredit, name, value);
  await bundle.getForm().updateFieldAppearances(await bundle.embedFont(StandardFonts.Helvetica));
  await residentCredit.getForm().updateFieldAppearances(await residentCredit.embedFont(StandardFonts.Helvetica));
  selectStatus(bundle, 'CHK_PRIM_RES', '1'); selectStatus(bundle, 'CHK_FILING_STATUS', '1');
  flattenSource(bundle, true); flattenSource(residentCredit, false);
  const plans = [
    { source:bundle, pages:[0,1], name:'oh-it-1040-review.pdf' },
    { source:residentCredit, pages:[0], name:'oh-it-rc-review.pdf' },
    { source:bundle, pages:[6,7], name:'oh-schedule-credits-review.pdf' },
    ...(projection.includeWithholding ? [{ source:bundle, pages:[10,11], name:'oh-schedule-of-withholding-review.pdf' }] : []),
  ];
  const files: Array<{ path:string; bytes:Uint8Array }> = [];
  for (const plan of plans) {
    const clean = await PDFDocument.create();
    for (const page of await clean.copyPages(plan.source, plan.pages)) clean.addPage(page);
    clean.setTitle('Ohio 2025 resident-credit redacted review'); clean.setAuthor('Tax Engine');
    clean.setCreator('Tax Engine'); clean.setProducer('Tax Engine');
    await markReviewPdf(clean);
    files.push({ path:join(outputDir, plan.name), bytes:await clean.save() });
  }
  await mkdir(outputDir, { recursive:true });
  for (const file of files) await writeFile(file.path, file.bytes);
  return files.map(file => file.path);
}
