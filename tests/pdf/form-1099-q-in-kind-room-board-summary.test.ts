// Spec: spec/federal/form-1099-q-in-kind-room-board.yaml. Synthetic reference only.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { buildForm1099QReferenceSummary, fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { inKindRoomBoardFixture } from '../fixtures/education-in-kind-room-board.js';

it('binds school sources and reopens exact review amounts', async () => {
  const input = inKindRoomBoardFixture(2025), forms = input.form1099Q ?? [], summary = input.qualifiedEducationExpenses;
  const expense = summary?.sourceFacts?.expenses?.[0];
  if (!expense) throw new Error('Missing source');
  expense.schoolOwnedHousingCharge = '2500';
  const result = calculateForm1099Q(forms, summary, { taxYear: 2025 });
  const shown = buildForm1099QReferenceSummary(forms, result, summary);
  expect(shown.sourceLines.find(row => row.line === 'prepaid:in-kind-room-board:tuition')?.value).toBe('3000');
  expect(shown.forms[0]?.box1GrossDistribution).toBe('4000');
  for (const mutation of ['allowance', 'housing', 'enrollment', 'amount', 'missing-audit', 'audit-value', 'audit-input']) {
    const changed = structuredClone(summary), next = changed?.sourceFacts?.expenses?.[0];
    if (!next) throw new Error('Missing source');
    if (mutation === 'allowance') next.roomBoardAllowance = '2999';
    // Unchanged maximum and aggregate result still cannot authorize a changed source fact.
    if (mutation === 'housing') next.schoolOwnedHousingCharge = '2499';
    if (mutation === 'enrollment') next.halfTimeStudent = false;
    if (mutation === 'amount') next.amount = '4001';
    const altered = { ...result, lines: result.lines.flatMap(row => {
      if (row.line !== 'prepaid:in-kind-room-board:tuition') return [row];
      if (mutation === 'missing-audit') return [];
      if (mutation === 'audit-value') return [{ ...row, value: row.value.plus(1) }];
      if (mutation === 'audit-input') return [{ ...row, inputs: { ...row.inputs, 'School allowance': '3000' } }];
      return [row];
    }) };
    expect(() => buildForm1099QReferenceSummary(forms, altered, changed)).toThrow(/audit|room|board|in-kind/);
  }
  const directory = await mkdtemp(join(tmpdir(), 'in-kind-room-board-'));
  try {
    const path = await fillForm1099QReference(forms, result, summary, directory);
    expect((await readFile(path)).byteLength).toBeGreaterThan(1000);
    const extracted = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8' })) as string[];
    expect(extracted.length).toBeGreaterThan(0);
    for (const page of extracted) expect(page).toContain(REVIEW_PDF_NOTICE);
    const text = extracted.join('\n');
    for (const amount of ['4000', '3000', '600', '200', '20']) expect(text).toContain(amount);
    for (const privateValue of [input.taxpayer.primary.ssn, 'Synthetic actual tuition credit application', 'prepaid-account']) expect(text).not.toContain(privateValue);
    expect(text).toContain('School allowance'); expect(text).toContain('School-owned housing charge');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
