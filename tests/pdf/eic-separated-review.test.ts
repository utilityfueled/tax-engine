// Spec: spec/federal/eic-separated-review.yaml.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillScheduleEIC, SCHEDULE_EIC_FIELDS as F } from '@/pdf/fill-schedule-eic.js';
import { fillForm1040 } from '@/pdf/fill-form-1040.js';
import { eicReviewChildren, eicReviewOriginalSourceInput, prepareEicReview, type PreparedEicReview } from '@/pdf/eic-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { eicSeparatedReviewInput } from '../fixtures/eic-separated-review.js';
function required<T>(v: T | undefined | null): T { if (v == null) throw new Error('Missing actual synthetic source'); return v; }
const noEic = 'topmostSubform[0].Page2[0].c2_13[0]';
const home = 'topmostSubform[0].Page1[0].c1_5[0]';

it('retains the actual self-only child attachment and truthful claimant boxes', async () => {
  const input = TaxYearInputSchema.parse(eicSeparatedReviewInput(false));
  input.taxpayer.primary.dateOfBirth = '2003-02-01';
  required(required(input.eic?.separatedSpouseSources).taxpayer).dateOfBirth = input.taxpayer.primary.dateOfBirth;
  required(required(input.eic?.claimantEligibility).primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = false;
  const child = required(input.taxpayer.dependents[0]); child.ssn = '';
  required(required(required(input.eic?.separatedSpouseSources).children)[0].original).ssn = '';
  const result = calculateFederalTax(input); expect(result.earnedIncomeCredit.toFixed()).toBe('649');
  const dir = await mkdtemp(join(tmpdir(), 'eic-actual-review-'));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
    expect(packet.filledForms.some(path => path.endsWith('f1040sei-filled.pdf'))).toBe(true);
    const childForm = (await PDFDocument.load(await readFile(join(dir, 'f1040sei-filled.pdf')))).getForm();
    expect(childForm.getTextField(F.child1Name).getText()).toBe('Alex Example');
    expect(childForm.getTextField(F.child1SSN).getText() ?? '').toBe('');
    const form = (await PDFDocument.load(await readFile(join(dir, 'f1040-filled.pdf')))).getForm();
    expect(form.getCheckBox(noEic).isChecked()).toBe(false); expect(form.getCheckBox(home).isChecked()).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('prints actual student disability and residence answers without changing sources', async () => {
  const input = TaxYearInputSchema.parse(eicSeparatedReviewInput());
  const child = required(input.taxpayer.dependents[0]); const row = required(required(input.eic?.separatedSpouseSources?.children)[0]);
  child.dateOfBirth = '2005-09-10'; child.monthsLivedWithYou = 6;
  required(row.original).dateOfBirth = child.dateOfBirth; required(row.original).monthsLivedWithYou = 6;
  row.fullTimeStudentForFiveMonths = false; row.permanentlyAndTotallyDisabled = true;
  input.taxpayer.spouse = { ...input.taxpayer.primary, firstName: 'Separate', lastName: 'Spouse', ssn: '777-88-9999' };
  const before = JSON.stringify(input); const result = calculateFederalTax(input); expect(result.earnedIncomeCredit.toFixed()).toBe('3409');
  const form = (await PDFDocument.load(await (await fillScheduleEIC(input, result, 'forms/blank/2025/f1040sei.pdf')).save())).getForm();
  expect(form.getTextField(F.child1Name).getText()).toBe('Alex Example');
  expect(form.getCheckBox(F.child1Line4aYes).isChecked()).toBe(false);
  expect(form.getCheckBox(F.child1Line4aNo).isChecked()).toBe(true);
  expect(form.getCheckBox(F.child1Line4bYes).isChecked()).toBe(true);
  expect(form.getTextField(F.child1Months).getText()).toBe('7');
  expect(form.getTextField(F.name).getText()).not.toContain('Separate Spouse');
  expect(JSON.stringify(input)).toBe(before);
});

it('rejects stale source result and serialized contexts before PDF IO', async () => {
  const input = TaxYearInputSchema.parse(eicSeparatedReviewInput()); const result = calculateFederalTax(input);
  const context = prepareEicReview(input); const redacted = redactReviewIdentifiers(input);
  const clone = eicReviewOriginalSourceInput(redacted, result, context);
  required(clone.taxpayer.dependents[0]).firstName = 'Private clone mutation';
  expect(eicReviewOriginalSourceInput(redacted, result, context).taxpayer.dependents[0]?.firstName).toBe('Alex');
  for (const change of [
    (value: typeof input) => { required(value.taxpayer.dependents[0]).firstName = 'Replaced'; },
    (value: typeof input) => { required(value.eic?.separatedSpouseSources).sourceTaxYear = 2024; },
    (value: typeof input) => { required(value.eic?.separatedSpouseSources).sourceFactsConfirmed = false; },
    (value: typeof input) => { required(required(value.eic?.separatedSpouseSources?.children)[0]).sourceReference = 'Different original'; },
  ]) {
    const stale = structuredClone(redacted); change(stale);
    await expect(fillScheduleEIC(stale, result, '/missing/never-read.pdf', context)).rejects.toThrow(/stale|conflict/i);
    await expect(fillForm1040(stale, result, '/missing/never-read.pdf', context)).rejects.toThrow(/stale|conflict/i);
  }
  for (const change of [
    (value: typeof result) => { value.earnedIncomeCredit = new Decimal(1); },
    (value: typeof result) => { value.agi = value.agi.plus(1); },
    (value: typeof result) => { required(value.allLines.find(row => row.form === '1040' && row.line === '27a')).value = new Decimal(1); },
  ]) {
    const stale = calculateFederalTax(input); change(stale);
    await expect(fillScheduleEIC(redacted, stale, '/missing/never-read.pdf', context)).rejects.toThrow(/retained calculation/i);
  }
  await expect(fillReturn(redacted, result, { blankFormsDir: '/missing', outputDir: '/missing',
    eicReview: JSON.parse(JSON.stringify(context)) as PreparedEicReview })).rejects.toThrow(/prepared context/i);
  await expect(fillScheduleEIC(redacted, result, '/missing/never-read.pdf')).rejects.toThrow(/original identifier/i);
  const next = structuredClone(input); next.taxpayer.taxYear = 2026;
  expect(() => eicReviewChildren(next)).toThrow(/2025/);
});

it('keeps source identifiers out of saved review pages', async () => {
  const input = TaxYearInputSchema.parse(eicSeparatedReviewInput()); const result = calculateFederalTax(input);
  const before = JSON.stringify(input), context = prepareEicReview(input), rendering = redactReviewIdentifiers(input);
  const doc = await fillScheduleEIC(rendering, redactReviewIdentifiers(result), 'forms/blank/2025/f1040sei.pdf', context);
  const dir = await mkdtemp(join(tmpdir(), 'eic-private-review-'));
  try {
    const path = join(dir, 'schedule-eic.pdf'); await writeFile(path, await doc.save());
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1]); fields=r.get_fields(); widgets=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  item=ref.get_object()
  if item.get('/Subtype')!='/Widget': continue
  parent=item.get('/Parent'); node=item if '/T' in item else parent.get_object() if parent else item
  if node.get('/T') in ('f1_03[0]','f1_06[0]'):
   widgets.append({'name':str(node['/T']),'value':str(node.get('/V','')),'appearance':bool(item.get('/AP',{}).get('/N'))})
print(json.dumps({'text':' '.join(page.extract_text() or '' for page in r.pages),'fields':{k:str(v.get('/V','')) for k,v in fields.items()},'widgets':widgets}))`, path], { encoding: 'utf8', timeout: 30_000 }));
    expect(checked.fields[F.child1Name]).toBe('Alex Example'); expect(checked.fields[F.child1SSN] ?? '').toBe('');
    expect(checked.widgets.some((row: { name: string; value: string; appearance: boolean }) => row.name === 'f1_03[0]' && row.value === 'Alex Example' && row.appearance)).toBe(true);
    for (const secret of [input.taxpayer.primary.ssn, input.taxpayer.primary.ssn.replace(/-/g, ''), '333-44-5555', '333445555',
      'actual separation and child sources', 'actual school and home records', 'dependent:0']) expect(checked.text).not.toContain(secret);
    expect(checked.text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
