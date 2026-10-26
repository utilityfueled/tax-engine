// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml private-review.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { buildForm1099QReferenceSummary, fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { roomBoardPriorUseFixture } from '../fixtures/education-room-board-prior-use.js';
it('binds historical period originals and prints separate prior and current limits', async () => {
  const { input } = roomBoardPriorUseFixture(), forms = input.form1099Q ?? [], result = calculateForm1099Q(forms, input.qualifiedEducationExpenses, { taxYear: 2025 });
  const token = prepareEducationReview(input), shown = buildForm1099QReferenceSummary(forms, result, input.qualifiedEducationExpenses, token);
  expect(shown.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Academic period 1: Prior qualified cost before assistance', value: '5000' });
  expect(shown.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Academic period 1: Remaining period limit', value: '1000' });
  for (const mutation of ['history-ref', 'receipt-ref', 'same-net', 'missing', 'beneficiary']) {
    const summary = structuredClone(input.qualifiedEducationExpenses), history = summary?.sourceFacts?.roomBoardPriorUses?.[0], receipt = summary?.sourceFacts?.roomBoardPriorUseExpenses?.[0];
    if (!history || !receipt) throw new Error('Missing actual prior history');
    if (mutation === 'history-ref') history.sourceReference = 'Replaced original history';
    if (mutation === 'receipt-ref') receipt.sourceReference = 'Replaced original receipt';
    if (mutation === 'same-net') { receipt.amount = '5001'; receipt.refundedAmount = '1'; }
    if (mutation === 'missing') summary.sourceFacts.roomBoardPriorUses = [];
    if (mutation === 'beneficiary') history.beneficiaryName = 'Other student';
    expect(() => buildForm1099QReferenceSummary(forms, result, summary, token)).toThrow(/source|audit|history|prior/i);
    expect(() => buildForm1099QReferenceSummary(forms, result, summary)).toThrow(/source|audit|history|prior|period/i);
  }
  const directory = await mkdtemp(join(tmpdir(), 'room-board-prior-review-'));
  try {
    const path = await fillForm1099QReference(forms, result, input.qualifiedEducationExpenses, directory, token);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 30000 }));
    pages.forEach(page => expect(page).toContain(REVIEW_PDF_NOTICE)); const text = pages.join('\n');
    for (const value of ['5000', '4000', '1000', '1800', '180', 'Remaining period limit']) expect(text).toContain(value);
    for (const secret of [input.taxpayer.primary.ssn, 'fictional-institution', 'Fictional filed prior period worksheet', 'Fictional actual prior room receipt', 'prepaid-account']) expect(text).not.toContain(secret);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
