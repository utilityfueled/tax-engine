// Spec: spec/federal/form-1099-q-in-kind-room-board.yaml.
import { expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareEducationReview, type PreparedEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm5329, FORM_5329_FIELDS as F } from '@/pdf/fill-form-5329.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { inKindRoomBoardFixture } from '../fixtures/education-in-kind-room-board.js';

function multipleStudentInput() {
  const input = inKindRoomBoardFixture(2025), facts = input.qualifiedEducationExpenses?.sourceFacts;
  const form = input.form1099Q?.[0], beneficiary = facts?.beneficiaries?.[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0];
  if (!facts || !form || !beneficiary || !expense || !benefit) throw new Error('Missing source');
  facts.beneficiaries?.push({ ...beneficiary, id: 'other', studentTaxId: '222-33-4444' });
  input.form1099Q?.push({ ...form, sourceId: 'other', accountId: 'other', beneficiaryId: 'other', recipientOwner: 'other', recipientId: 'other-student' });
  facts.expenses?.push({ ...expense, id: 'other', beneficiaryId: 'other', roomBoardAllowance: '1000' });
  facts.inKindBenefits?.push({ ...benefit, id: 'other', sourceId: 'other', expenseId: 'other' });
  facts.allocations?.push({ sourceId: 'other', expenseId: 'other', amount: '4000', creditAmount: '0' });
  return input;
}

it('preserves distinct actual students across review redaction without accepting stale evidence', () => {
  const input = multipleStudentInput();
  const result = calculateFederalTax(input).form1099Q;
  if (!result) throw new Error('Missing result');
  expect(result.perDistribution.map(row => row.taxFreeEarnings.toFixed())).toEqual(['600', '200']);
  const context = prepareEducationReview(input), redacted = redactReviewIdentifiers(input), renderedResult = redactReviewIdentifiers(result);
  expect(JSON.stringify(context)).toBe('{}');
  const shown = buildForm1099QReferenceSummary(redacted.form1099Q ?? [], renderedResult, redacted.qualifiedEducationExpenses, context);
  expect(shown.sourceLines.filter(row => row.description.includes('room-and-board expense after school limit')).map(row => row.value)).toEqual(['3000', '1000']);
  for (const identity of [input.taxpayer.primary.ssn, '222-33-4444']) expect(JSON.stringify(shown)).not.toContain(identity);
  expect(() => buildForm1099QReferenceSummary(redacted.form1099Q ?? [], renderedResult, redacted.qualifiedEducationExpenses)).toThrow(/actual.*identit|prepared|beneficiar/);
  expect(() => buildForm1099QReferenceSummary(redacted.form1099Q ?? [], renderedResult, redacted.qualifiedEducationExpenses, {} as PreparedEducationReview)).toThrow(/context/);
  const changed = structuredClone(redacted.qualifiedEducationExpenses), changedExpense = changed?.sourceFacts?.expenses?.[0];
  if (!changedExpense) throw new Error('Missing source');
  changedExpense.schoolOwnedHousingCharge = '1';
  expect(() => buildForm1099QReferenceSummary(redacted.form1099Q ?? [], renderedResult, changed, context)).toThrow(/stale|conflict/);
  expect(() => buildForm1099QReferenceSummary(redacted.form1099Q ?? [], { ...renderedResult, taxableEarnings: renderedResult.taxableEarnings.plus(1) }, redacted.qualifiedEducationExpenses, context)).toThrow(/calculation|audit/);
  const alias = structuredClone(input), aliasBeneficiary = alias.qualifiedEducationExpenses?.sourceFacts?.beneficiaries?.[1], aliasForm = alias.form1099Q?.[1];
  if (!aliasBeneficiary || !aliasForm) throw new Error('Missing alias');
  aliasBeneficiary.studentTaxId = input.taxpayer.primary.ssn; aliasForm.recipientOwner = 'primary';
  expect(() => prepareEducationReview(alias)).toThrow(/beneficiar.*identit|student.*identit/);
  expect(() => buildForm1099QReferenceSummary(alias.form1099Q ?? [], result, alias.qualifiedEducationExpenses)).toThrow(/beneficiar.*identit|student.*identit/);
});

it('validates education evidence before packet I/O and preserves redacted owner amounts', async () => {
  const input = multipleStudentInput(), result = calculateFederalTax(input);
  const context = prepareEducationReview(input), redacted = redactReviewIdentifiers(input), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'education-room-board-context-'));
  try {
    const changed = structuredClone(redacted), expense = changed.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
    if (!expense || !rendered.form1099Q) throw new Error('Missing source');
    expense.schoolOwnedHousingCharge = '1';
    const missingTemplates = { blankFormsDir: join(directory, 'absent-templates'), outputDir: directory };
    await expect(fillReturn(changed, rendered, { ...missingTemplates, educationReview: context })).rejects.toThrow(/stale|conflict/);
    await expect(fillReturn(redacted, { ...rendered, form1099Q: { ...rendered.form1099Q, taxableEarnings: rendered.form1099Q.taxableEarnings.plus(1) } },
      { ...missingTemplates, educationReview: context })).rejects.toThrow(/calculation|audit/);
    await expect(fillReturn(redacted, rendered, { ...missingTemplates, educationReview: {} as PreparedEducationReview })).rejects.toThrow(/context/);
    expect(await readdir(directory)).toEqual([]);
    const packet = await fillReturn(redacted, rendered, { blankFormsDir: 'forms/blank/2025', outputDir: directory, educationReview: context });
    expect(packet.filledForms.some(path => path.endsWith('f1099q-reference-filled.pdf'))).toBe(true);
    expect(packet.filledForms.filter(path => path.includes('f5329'))).toHaveLength(1);
    const pdf = await PDFDocument.load(await readFile(join(directory, 'f5329-primary-filled.pdf'))), form = pdf.getForm();
    expect(form.getTextField(F.line5).getText()).toBe('200');
    expect(form.getTextField(F.line8).getText()).toBe('20');
    expect(form.getTextField(F.ssn).getText() ?? '').toBe('');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('rejects a prepared education context for a changed rendering taxpayer before I/O', async () => {
  const input = inKindRoomBoardFixture(2025), result = calculateFederalTax(input), context = prepareEducationReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'education-owner-binding-'));
  try {
    for (const redacted of [false, true]) {
      const changed = redacted ? redactReviewIdentifiers(input) : structuredClone(input);
      changed.taxpayer.primary.ssn = '777-88-9999';
      if (!redacted) expect(() => calculateFederalTax(changed)).toThrow(/recipient|beneficiary|identity/);
      const rendered = redacted ? redactReviewIdentifiers(result) : result;
      await expect(fillReturn(changed, rendered, { blankFormsDir: join(directory, 'absent'), outputDir: directory, educationReview: context }))
        .rejects.toThrow(/stale|conflict|identity/);
      await expect(fillForm5329(changed, rendered, join(directory, 'absent.pdf'), 'primary', context))
        .rejects.toThrow(/stale|conflict|identity/);
      await expect(fillForm5329(changed, rendered, join(directory, 'absent.pdf'), 'primary'))
        .rejects.toThrow(/recipient|beneficiary|identity/);
    }
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
