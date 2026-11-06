// Spec: spec/federal/cod-ordinary-attribute-sources.yaml, closing reference entries.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { buildForm8801ReferenceSummary, fillForm8801Reference } from '@/pdf/fill-form-8801.js';
import { buildForm3800ReferenceSummary, fillForm3800Reference } from '@/pdf/fill-form-3800.js';
import { fillForm8582, FORM_8582_FIELDS } from '@/pdf/fill-form-8582.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareCodNolReview } from '@/pdf/cod-nol-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { sumSourceMoneyRatios } from '@/utils/sum-source-money-ratios.js';
import { d } from '@/utils/decimal.js';
import { actualCodAttributesInput, codAttributeRecord } from '../fixtures/cod-ordinary-attributes.js';

type Kind = 'minimum_tax_credit' | 'general_business_credit' | 'passive_loss';
function inputFor(kind: Kind, excluded = '300') {
  const input = actualCodAttributesInput(kind === 'passive_loss' ? '5000' : excluded);
  if (kind === 'passive_loss') {
    input.priorYear = { suspendedPassiveLosses: [{ partnershipName: 'Fictional retained passive activity', amount: '10000' }] };
    for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) ledger.records = [codAttributeRecord(kind, '10000')];
  } else {
    input.w2s[0]!.wages = '0'; input.w2s[0]!.federalWithheld = '0';
    input.form982AttributeSources.regular.records = [codAttributeRecord(kind, '3000')];
    if (kind === 'general_business_credit') input.priorYear = { generalBusinessCreditCarryforward: '3000' };
    else return TaxYearInputSchema.parse({ ...input, form8801: {
      priorYear: 2024, sourceFactsConfirmed: true, priorYearFilingStatus: 'single',
      priorYearForm6251Line1And2e: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
      priorYearMinimumTaxCreditNOLDeduction: '0', priorYearMinimumTaxForeignTaxCredit: '0', priorYearForm6251Line10: '0',
      unusedMinimumTaxCreditCarryforward: '3000', priorYearUnallowedQualifiedElectricVehicleCredit: '0',
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
    } });
  }
  return input;
}
function text(path: string) {
  return execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
    'from pypdf import PdfReader;import sys;print(" ".join(page.extract_text() for page in PdfReader(sys.argv[1]).pages))', path],
    { encoding: 'utf8', timeout: 5000 }).replace(/\s+/g, ' ');
}
async function saved(kind: Kind, filename: string, inspect: (text: string) => void) {
  const input = inputFor(kind), result = calculateFederalTax(input), directory = await mkdtemp(join(tmpdir(), 'cod-closing-reference-'));
  try {
    const files = (await fillReturn(redactReviewIdentifiers(input), result, { outputDir: directory,
      blankFormsDir: 'forms/blank', codNolReview: prepareCodNolReview(input) })).filledForms;
    const reference = files.find(file => file.endsWith(filename));
    expect(reference).toBeDefined(); const contents = text(reference!);
    expect(contents).toContain(REVIEW_PDF_NOTICE); inspect(contents);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
it('separates current Form8801 lines from the final minimum-credit carry after COD', async () => {
  const result = calculateFederalTax(inputFor('minimum_tax_credit'));
  expect(result.form8801!.carryforwardToNextYear.toFixed()).toBe('3000');
  expect(result.carryforwards.minimumTaxCredit.toFixed()).toBe('2900');
  const summary = buildForm8801ReferenceSummary(result.form8801!, result);
  expect(summary.lines.find(row => row.line === '26')?.description).toContain('before COD');
  expect(summary.totals).toContainEqual({ label: 'Minimum tax credit carry after COD', value: '2900' });
  await saved('minimum_tax_credit', 'f8801-reference-filled.pdf', contents => {
    expect(contents).toContain('Carryforward to next year before COD: 3000');
    expect(contents).toContain('Minimum tax credit attribute reduction: 100');
    expect(contents).toContain('Minimum tax credit carry after COD: 2900');
  });
});
it('separates current Form3800 lines from final general-credit carry including exact thirds', async () => {
  for (const excluded of ['300', '1']) {
    const result = calculateFederalTax(inputFor('general_business_credit', excluded));
    expect(result.form3800!.carryforwardToNextYear.toFixed()).toBe('3000');
    const expected = sumSourceMoneyRatios([{ amount: d('9000').minus(excluded), denominator: d('3') }]).toFixed();
    expect(result.carryforwards.generalBusinessCredit.toFixed()).toBe(expected);
    const summary = buildForm3800ReferenceSummary(result.form3800!, result);
    expect(summary.lines.find(row => row.line === 'Carryforward')?.description).toContain('before COD');
    expect(summary.totals).toContainEqual({ label: 'General business credit carry after COD', value: expected });
  }
  await saved('general_business_credit', 'f3800-reference-filled.pdf', contents => {
    expect(contents).toContain('Unused credit carried forward before COD: 3000');
    expect(contents).toContain('General business credit attribute reduction: 100');
    expect(contents).toContain('General business credit carry after COD: 2900');
  });
});
it('retains physical Form8582 current losses and prints the source-reconciled activity carry after COD', async () => {
  const input = inputFor('passive_loss'), result = calculateFederalTax(input);
  const doc = await fillForm8582(input, result, 'forms/blank/2025/f8582.pdf');
  expect(doc.getForm().getTextField(FORM_8582_FIELDS.part7.totalC).getText()).toBe('10000');
  expect(result.carryforwards.suspendedPassiveLosses[0]?.amount.toFixed()).toBe('5000');
  await saved('passive_loss', 'f8582-filled.pdf', contents => {
    expect(contents).toContain('Current Form 8582 values are before COD');
    expect(contents).toContain('Activity 1 passive loss before COD: 10000');
    expect(contents).toContain('Activity 1 passive loss attribute reduction: 5000');
    expect(contents).toContain('Activity 1 passive loss carry after COD: 5000');
  });
});
it('rejects missing duplicate stale and conflicting COD closing records before output', async () => {
  for (const kind of ['minimum_tax_credit', 'general_business_credit', 'passive_loss'] as const) for (const change of ['missing', 'duplicate', 'before', 'after', 'audit', 'current-form'] as const) {
    const input = inputFor(kind), result = calculateFederalTax(input), directory = await mkdtemp(join(tmpdir(), 'cod-closing-invalid-'));
    if (change === 'missing') result.codAttributeReduction = undefined;
    if (change === 'duplicate') result.codAttributeReduction!.regular.records.push(result.codAttributeReduction!.regular.records[0]!);
    if (change === 'before') result.codAttributeReduction!.regular.records[0]!.beforeReduction = d('3001');
    if (change === 'after') result.codAttributeReduction!.regular.records[0]!.remaining = d('2901');
    if (change === 'audit') result.allLines = result.allLines.filter(row => row.form !== 'Regular COD Attribute Worksheet');
    if (change === 'current-form') {
      if (kind === 'minimum_tax_credit') result.form8801!.carryforwardToNextYear = d('3001');
      else if (kind === 'general_business_credit') result.form3800!.carryforwardToNextYear = d('3001');
      else result.form8582!.activityAllocations[0]!.suspendedLoss = d('10001');
    }
    try {
      const render = () => kind === 'minimum_tax_credit' ? fillForm8801Reference(result.form8801!, directory, result)
        : kind === 'general_business_credit' ? fillForm3800Reference(result.form3800!, directory, result)
        : fillForm8582(input, result, join(directory, 'missing-template.pdf'));
      await expect(render(), `${kind}/${change}`).rejects.toThrow(/COD|reconcile|audit|source/i);
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

it('binds current attribute forms to the private source context before any output', async () => {
  for (const kind of ['minimum_tax_credit', 'general_business_credit', 'passive_loss'] as const) {
    const input = inputFor(kind), result = calculateFederalTax(input), context = prepareCodNolReview(input);
    const directory = await mkdtemp(join(tmpdir(), 'cod-closing-context-'));
    if (kind === 'minimum_tax_credit') result.form8801!.lines[0]!.value = d('1');
    else if (kind === 'general_business_credit') result.form3800!.lines[0]!.value = d('1');
    else result.form8582!.activityRows[0]!.sourcePriorYearSuspendedLoss = d('10001');
    try {
      await expect(fillReturn(redactReviewIdentifiers(input), result, { outputDir: directory,
        blankFormsDir: join(directory, 'missing-forms'), codNolReview: context })).rejects.toThrow(/source|context|reconcile/i);
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
it('retains historical non-COD credit reference labels and values', () => {
  for (const kind of ['minimum_tax_credit', 'general_business_credit'] as const) {
    const original = inputFor(kind), input = { ...original, form1099C: [], codExclusion: undefined,
      form982NolSources: undefined, form982AttributeSources: undefined };
    const result = calculateFederalTax(input);
    const summary = kind === 'minimum_tax_credit' ? buildForm8801ReferenceSummary(result.form8801!, result)
      : buildForm3800ReferenceSummary(result.form3800!, result);
    expect(JSON.stringify(summary)).not.toContain('COD');
    expect(summary.totals.at(-1)?.value).toBe('3000');
  }
});
