// Spec: spec/federal/section-1202-review-pdf.yaml.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Decimal from 'decimal.js';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8949, FORM_8949_FIELDS as F } from '@/pdf/fill-form-8949.js';
import { fillForm6251, FORM_6251_FIELDS as A } from '@/pdf/fill-form-6251.js';
import { SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareForm8949Review } from '@/pdf/form-8949-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { qsbsReturnInput } from '../fixtures/section-1202.js';
import { useTemporaryPdfOutput } from './temporary-output.js';
const outputDir = useTemporaryPdfOutput();
const blank = 'forms/blank/2025/f8949.pdf';
const copied = (name: string, copy: number) => name.replace('topmostSubform[0]', `topmostSubform[${copy}]`);
function inspected(bytes: Uint8Array): { pages: string[]; fields: Record<string, string>; widgets: { name: string; value: string; appearance: boolean }[][] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import io,json,sys
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read()))
fields={name:str(field.get('/V','')) for name,field in (reader.get_fields() or {}).items() if field.get('/FT') in ['/Tx','/Btn']}
pages=[]
for page in reader.pages:
 widgets=[]
 for reference in page.get('/Annots',[]):
  widget=reference.get_object()
  if widget.get('/Subtype')!='/Widget': continue
  node=widget; names=[]; value=None
  while node:
   if node.get('/T'): names.insert(0,str(node.get('/T')))
   if value is None and '/V' in node: value=str(node.get('/V'))
   parent=node.get('/Parent'); node=parent.get_object() if parent else None
  normal=widget.get('/AP',{}).get('/N')
  appearance=normal.get_object() if normal else None
  if appearance is not None and not hasattr(appearance,'get_data'):
   appearance=appearance.get(widget.get('/AS','/Off'))
   appearance=appearance.get_object() if appearance else None
  widgets.append({'name':'.'.join(names),'value':value or '', 'appearance':bool(appearance is not None and appearance.get_data())})
 pages.append(widgets)
print(json.dumps({'pages':[(page.extract_text() or '') for page in reader.pages],'fields':fields,'widgets':pages}))
`], { input: bytes, encoding: 'utf8' }));
}
function mixed() {
  const source = qsbsReturnInput('fund');
  const trade = (description: string, holdingPeriod: 'short' | 'long', basisReportedToIRS: boolean) => ({
    description, holdingPeriod, basisReportedToIRS, dateAcquired: holdingPeriod === 'short' ? '2025-01-02' : '2023-01-02', dateSold: '2025-06-30',
    proceeds: '100.25', costBasis: '50.10', adjustments: '0', washSale: false, washSaleDisallowed: '0',
  });
  return TaxYearInputSchema.parse({ ...source, form1099B: [{ broker: 'Actual other broker', accountHolder: 'primary', transactions: [
    ...Array.from({ length: 23 }, (_, i) => trade(`Actual A trade ${i + 1}`, 'short', true)),
    trade('Actual B trade', 'short', false), trade('Actual D trade', 'long', true), trade('Actual E trade', 'long', false),
  ] }] });
}
it('retains every category and overflow transaction in interactive continuation pages', async () => {
  const source = mixed(); const prepared = prepareForm8949Review(source);
  const doc = await fillForm8949(redactReviewIdentifiers(source), blank, prepared);
  const bytes = await doc.save(); const reopened = await PDFDocument.load(bytes); const form = reopened.getForm();
  expect(reopened.getPageCount()).toBe(8);
  expect(form.getTextField(F.page1TotalProceeds).getText()).toBe('1103');
  expect(form.getTextField(F.page1TotalCostBasis).getText()).toBe('551');
  expect(form.getTextField(F.page1TotalGainLoss).getText()).toBe('552');
  expect(form.getTextField(copied(F.page1Rows[0].description, 1)).getText()).toBe('Actual A trade 12');
  expect(form.getTextField(copied(F.page1Rows[0].description, 2)).getText()).toBe('Actual A trade 23');
  expect(form.getTextField(copied(F.page1Rows[0].description, 3)).getText()).toBe('Actual B trade');
  expect(form.getTextField(copied(F.page1TotalProceeds, 2)).getText()).toBe('100');
  expect(form.getTextField(copied(F.page2Rows[0].code, 2)).getText()).toBe('Q');
  expect(form.getTextField(copied(F.page2Rows[0].adjustment, 2)).getText()).toBe('(500)');
  expect(form.getTextField(copied(F.page2Rows[0].proceeds, 2)).getText() ?? '').toBe('');
  for (const [copy, checked] of [[0, F.boxA], [1, F.boxA], [2, F.boxA], [3, F.boxB], [0, F.boxD], [1, F.boxE], [2, F.boxF]] as const) {
    expect(form.getCheckBox(copied(checked, copy)).isChecked()).toBe(true);
  }
  const audit = inspected(bytes);
  const descriptions = audit.widgets.flat().filter(row => /\.Row\d+\[0\]\.f[12]_\d+\[0\]$/.test(row.name) && /Actual .*trade|Synthetic eligible corporation/.test(row.value));
  expect(descriptions).toHaveLength(27); expect(new Set(descriptions.map(row => row.value)).size).toBe(27);
  expect(new Set(audit.widgets.flat().map(row => row.name)).size).toBe(audit.widgets.flat().length);
  for (const page of audit.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const widgets of audit.widgets) for (const row of widgets) {
    expect(audit.fields[row.name], row.name).toBe(row.value);
    expect(row.appearance, row.name).toBe(true);
  }
  for (let copy = 0; copy < 4; copy++) for (const name of [F.ssn1, F.ssn2]) expect(form.getTextField(copied(name, copy)).getText() ?? '').toBe('');
  expect(Object.values(audit.fields).join(' ')).not.toContain('123456789');
});
it('includes fund-only issuer rows and their ScheduleD10 transfer in the review packet', async () => {
  const source = qsbsReturnInput('fund'); const result = calculateFederalTax(source);
  const packet = await fillReturn(redactReviewIdentifiers(source), result, {
    blankFormsDir: 'forms/blank/2025', outputDir: join(outputDir, 'fund'), capitalGainReview: prepareForm8949Review(source),
  });
  expect(packet.filledForms.some(path => path.endsWith('f8949-filled.pdf'))).toBe(true);
  const form = (await PDFDocument.load(await readFile(join(outputDir, 'fund/f8949-filled.pdf')))).getForm();
  expect(form.getCheckBox(F.boxF).isChecked()).toBe(true);
  expect(form.getTextField(F.page2Rows[0].description).getText()).toBe('Synthetic eligible corporation');
  expect(form.getTextField(F.page2Rows[0].code).getText()).toBe('Q');
  expect(form.getTextField(F.page2Rows[0].adjustment).getText()).toBe('(500)');
  const schedule = (await PDFDocument.load(await readFile(join(outputDir, 'fund/f1040sd-filled.pdf')))).getForm();
  expect(schedule.getTextField(D.line10Adjustments).getText()).toBe('(500)');
  expect(schedule.getTextField(D.line10GainLoss).getText()).toBe('(500)');
  expect(schedule.getTextField(D.line13).getText()).toBe('1501');
  expect(schedule.getTextField(D.line15).getText()).toBe('1000');
  const amt = (await PDFDocument.load(await readFile(join(outputDir, 'fund/f6251-filled.pdf')))).getForm();
  expect(amt.getTextField(A.line2h).getText()).toBe('35');
});
it('reconciles actual QSBS preference before exporting Form6251', async () => {
  const source = qsbsReturnInput(); const result = calculateFederalTax(source); const prepared = prepareForm8949Review(source);
  const redacted = redactReviewIdentifiers(source);
  const doc = await fillForm6251(redacted, result, 'forms/blank/2025/f6251.pdf', prepared);
  expect((await PDFDocument.load(await doc.save())).getForm().getTextField(A.line2h).getText()).toBe('35');
  if (!result.form6251) throw new Error('Missing actual AMT calculation');
  for (const value of [undefined, new Decimal(34)]) {
    const tampered = { ...result, form6251: { ...result.form6251, lines: result.form6251.lines.flatMap(row => row.line === '2h' ? value === undefined ? [] : [{ ...row, value }] : [row]) } };
    await expect(fillForm6251(redacted, tampered, 'forms/blank/2025/f6251.pdf', prepared)).rejects.toThrow(/QSBS|1202|2h|reconcile/);
  }
  const changed = structuredClone(redacted);
  if (!changed.section1202Sources?.lots[0]) throw new Error('Missing actual source lot');
  changed.section1202Sources.lots[0].qualification.activeBusinessRequirementSatisfied = false;
  await expect(fillForm8949(changed, blank, prepared)).rejects.toThrow(/source|stale/);
  await expect(fillForm8949(redacted, blank, {} as typeof prepared)).rejects.toThrow(/context|prepared/);
  const changedIdentity = { ...source, taxpayer: { ...source.taxpayer, primary: { ...source.taxpayer.primary, ssn: '987-65-4321' } } };
  await expect(fillForm8949(changedIdentity, blank, prepared)).rejects.toThrow(/source|identity|stale/);
  expect(source.taxpayer.primary.ssn).toBe('123-45-6789');
});
it('keeps missing-source and year qualification gates closed', async () => {
  const source = qsbsReturnInput('fund');
  expect(() => prepareForm8949Review({ ...source, section1202Sources: undefined })).toThrow(/source/);
  const prepared = prepareForm8949Review(source);
  expect(() => prepareForm8949Review(redactReviewIdentifiers(source))).toThrow(/identity/);
  await expect(fillForm8949({ ...source, taxpayer: { ...source.taxpayer, taxYear: 2026 } }, blank, prepared)).rejects.toThrow(/2026|qualified/);
  await expect(fillReturn(source, calculateFederalTax(source), { outputDir, blankFormsDir: 'forms/blank/2025', purpose: 'filing', capitalGainReview: prepared })).rejects.toThrow(/Filing exports/);
});
