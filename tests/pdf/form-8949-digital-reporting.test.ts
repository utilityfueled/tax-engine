// Spec: spec/federal/form-8949-digital-reporting.yaml.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8949, FORM_8949_FIELDS as F } from '@/pdf/fill-form-8949.js';
import { fillScheduleD, SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { prepareForm8949Review, form8949ReviewCalculation } from '@/pdf/form-8949-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { reportingCategoriesInput } from '../fixtures/form-8949-reporting.js';
import { actualDigitalAssetSource } from '../fixtures/digital-asset-sources.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { useTemporaryPdfOutput } from './temporary-output.js';
const outputDir = useTemporaryPdfOutput();

const copied = (field: string, copy: number) => field.replace('topmostSubform[0]', `topmostSubform[${copy}]`);
const blank = 'forms/blank/2025/f8949.pdf';

it('prints combined digital and other categories in the six ScheduleD rows', async () => {
  const input = reportingCategoriesInput();
  const result = calculateFederalTax(input);
  const document = await fillScheduleD(input, result, 'forms/blank/2025/f1040sd.pdf');
  const form = (await PDFDocument.load(await document.save())).getForm();
  for (const [fields, expected] of [
    [[D.line1bProceeds, D.line1bCostBasis, D.line1bAdjustments, D.line1bGainLoss], ['501', '380', '', '120']],
    [[D.line2Proceeds, D.line2CostBasis, D.line2Adjustments, D.line2GainLoss], ['701', '831', '5', '(125)']],
    [[D.line3Proceeds, D.line3CostBasis, D.line3Adjustments, D.line3GainLoss], ['901', '601', '', '300']],
    [[D.line8bProceeds, D.line8bCostBasis, D.line8bAdjustments, D.line8bGainLoss], ['5001', '3800', '', '1200']],
    [[D.line9Proceeds, D.line9CostBasis, D.line9Adjustments, D.line9GainLoss], ['7001', '8301', '50', '(1250)']],
    [[D.line10Proceeds, D.line10CostBasis, D.line10Adjustments, D.line10GainLoss], ['9001', '6001', '', '3000']],
  ]) fields.forEach((field, index) => expect(form.getTextField(field).getText() ?? '', field).toBe(expected[index]));
  for (const [field, expected] of [[D.line7, '295'], [D.line15, '2950'], [D.line16, '3246']]) expect(form.getTextField(field).getText()).toBe(expected);
  for (const field of [D.line1aProceeds, D.line8aProceeds]) expect(form.getTextField(field).getText()).toBeUndefined();
});

it('retains all categories and digital continuation rows after reopening', async () => {
  const input = reportingCategoriesInput(true);
  const prepared = prepareForm8949Review(input);
  const document = await fillForm8949(redactReviewIdentifiers(input), blank, prepared);
  const bytes = await document.save();
  const reopened = await PDFDocument.load(bytes); const form = reopened.getForm();
  expect(reopened.getPageCount()).toBe(14);
  const short = [F.boxA, F.boxB, F.boxC, F.boxG, F.boxG, F.boxH, F.boxI];
  const long = [F.boxD, F.boxE, F.boxF, F.boxJ, F.boxK, F.boxL];
  for (let copy = 0; copy < 7; copy++) {
    for (const field of [F.boxA, F.boxB, F.boxC, F.boxG, F.boxH, F.boxI]) expect(form.getCheckBox(copied(field, copy)).isChecked()).toBe(field === short[copy]);
    for (const field of [F.boxD, F.boxE, F.boxF, F.boxJ, F.boxK, F.boxL]) expect(form.getCheckBox(copied(field, copy)).isChecked()).toBe(field === long[copy]);
    for (const field of [F.ssn1, F.ssn2]) expect(form.getTextField(copied(field, copy)).getText() ?? '').toBe('');
  }
  const descriptions: string[] = [];
  for (let copy = 0; copy < 7; copy++) for (const row of [...F.page1Rows, ...F.page2Rows]) {
    const description = form.getTextField(copied(row.description, copy)).getText();
    if (description) descriptions.push(description);
  }
  expect(descriptions.sort()).toEqual(input.form1099B[0].transactions.map(row => row.description).sort());
  expect(form.getTextField(copied(F.page1TotalProceeds, 3)).getText()).toBe('4404');
  expect(form.getTextField(copied(F.page1TotalCostBasis, 3)).getText()).toBe('3302');
  expect(form.getTextField(copied(F.page1TotalGainLoss, 3)).getText()).toBe('1102');
  expect(form.getTextField(copied(F.page1Rows[0].description, 4)).getText()).toBe('Original G disposition 12');
  expect(form.getTextField(copied(F.page1TotalProceeds, 4)).getText()).toBe('400');
  expect(form.getTextField(copied(F.page1TotalGainLoss, 4)).getText()).toBe('100');
  const independent: { pageCount: number; fields: Record<string, string>; widgetNames: string[]; pageText: string[] } = JSON.parse(execFileSync(
    process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import io,json,sys
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read()))
fields={name:str(field.get('/V','')) for name,field in (reader.get_fields() or {}).items() if field.get('/FT') in ['/Tx','/Btn']}
names=[]
for page in reader.pages:
 for reference in page.get('/Annots',[]):
  node=reference.get_object()
  if node.get('/Subtype')!='/Widget': continue
  parts=[]
  while node:
   if node.get('/T'): parts.insert(0,str(node.get('/T')))
   parent=node.get('/Parent'); node=parent.get_object() if parent else None
  names.append('.'.join(parts))
print(json.dumps({'pageCount':len(reader.pages),'fields':fields,'widgetNames':names,'pageText':[page.extract_text() or '' for page in reader.pages]}))
`], { input: bytes, encoding: 'utf8' }));
  expect(independent.pageCount).toBe(14);
  expect(new Set(independent.widgetNames).size).toBe(independent.widgetNames.length);
  for (const name of independent.widgetNames) expect(name in independent.fields, name).toBe(true);
  for (let copy = 0; copy < 7; copy++) {
    // The registered IRS template's six export states are /1 through /6.
    for (const [index, field] of [F.boxA, F.boxB, F.boxC, F.boxG, F.boxH, F.boxI].entries()) expect(independent.fields[copied(field, copy)]).toBe(field === short[copy] ? `/${index + 1}` : '/Off');
    for (const [index, field] of [F.boxD, F.boxE, F.boxF, F.boxJ, F.boxK, F.boxL].entries()) expect(independent.fields[copied(field, copy)]).toBe(field === long[copy] ? `/${index + 1}` : '/Off');
  }
  for (const text of independent.pageText) expect(text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
  expect(Object.values(independent.fields).join(' ')).not.toContain('123456789');
});

it('rejects stale digital source context and unavailable year mappings', async () => {
  const input = reportingCategoriesInput(); const prepared = prepareForm8949Review(input);
  const changed = { ...input, form1099DA: [] };
  // Even a changed source container is not the source that was prepared.
  expect(() => form8949ReviewCalculation(changed, prepared)).toThrow(/stale|source/);
  const changedYear = { ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } };
  await expect(fillForm8949(changedYear, blank, prepared)).rejects.toThrow(/2026|qualified/);
});

it('includes actual raw digital dispositions and reconciles the complete review packet', async () => {
  const source = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099DA: [actualDigitalAssetSource] });
  const calculation = calculateFederalTax(source);
  const prepared = prepareForm8949Review(source);
  const redacted = redactReviewIdentifiers(source);
  const original = form8949ReviewCalculation(source, prepared);
  expect(original.totalShortTermGainLoss.toString()).toBe('10.25');
  expect(original.shortTermBoxH.transactions).toHaveLength(1);
  expect(source.form1099B).toHaveLength(0);
  const packet = await fillReturn(redacted, calculation, { outputDir, blankFormsDir: 'forms/blank/2025', capitalGainReview: prepared });
  expect(packet.filledForms.some(file => file.endsWith('f8949-filled.pdf'))).toBe(true);
  const form = (await PDFDocument.load(await readFile(join(outputDir, 'f8949-filled.pdf')))).getForm();
  expect(form.getCheckBox(F.boxH).isChecked()).toBe(true);
  expect(form.getTextField(F.page1Rows[0].proceeds).getText()).toBe('100');
  expect(form.getTextField(F.page1Rows[0].costBasis).getText()).toBe('90');
  expect(form.getTextField(F.page1Rows[0].gainLoss).getText()).toBe('10');
  for (const change of ['basis', 'withholding', 'year', 'crypto'] as const) {
    const changed = structuredClone(source);
    if (change === 'basis') changed.form1099DA[0].transactions[0].costBasis = '90.25';
    if (change === 'withholding') changed.form1099DA[0].federalWithheld = '0.11';
    if (change === 'year') changed.form1099DA[0].taxYear = 2026;
    if (change === 'crypto') changed.cryptoIncome = TaxYearInputSchema.parse({ ...source, cryptoIncome: { lots: [] } }).cryptoIncome;
    expect(() => form8949ReviewCalculation(changed, prepared)).toThrow(/stale|source/);
  }
  const tampered = { ...calculation, allLines: calculation.allLines.map(line => line.form === 'Form 8949' && line.line === 'Part I Box H'
    ? { ...line, inputs: { ...line.inputs, proceeds: new Decimal('101.49'), cost: new Decimal('91.24') } } : line) };
  await expect(fillReturn(redacted, tampered, { outputDir, blankFormsDir: 'forms/blank/2025', capitalGainReview: prepared })).rejects.toThrow(/reconcile|audit/);
  await expect(fillReturn(source, calculation, { outputDir, blankFormsDir: 'forms/blank/2025', purpose: 'filing' })).rejects.toThrow(/Filing exports/);
});
