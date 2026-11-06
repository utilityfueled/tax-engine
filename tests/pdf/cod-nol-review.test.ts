// Spec: spec/federal/cod-nol-reductions.yaml review/review-conservation.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildNetOperatingLossReview, fillNetOperatingLossReview } from '@/pdf/fill-net-operating-loss.js';
import { buildForm982ReferenceSummary } from '@/pdf/fill-form-982.js';
import { prepareCodNolReview, type PreparedCodNolReview } from '@/pdf/cod-nol-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
import { currentOriginInput } from '../fixtures/form-172-origin.js';
import { d } from '@/utils/decimal.js';
import { PDFDocument } from 'pdf-lib';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('preserves independent COD carry reductions in the redacted review packet', async () => {
  const source = actualCodNolInput(), result = calculateFederalTax(source);
  const token = prepareCodNolReview(source), redacted = redactReviewIdentifiers(source);
  const rows = buildNetOperatingLossReview(redacted, result, undefined, token), text = rows.join(' ');
  expect(text).toContain('Form982 line2 excluded insolvency amount 40000');
  expect(text).toContain('Regular COD: before 132600; reduction 40000; expiry 0; remaining 92600');
  expect(text).toContain('Alternative COD: before 110000; reduction 40000; expiry 0; remaining 70000');
  expect(text).toContain('2021: before 32600; reduction 32600; expiry 0; remaining 0');
  for (const secret of ['Original statement-A', 'Original account-A', '12-3456789', '6789', 'form1099C:0', 'loss2021']) expect(text).not.toContain(secret);
  const summary = buildForm982ReferenceSummary(result);
  expect(summary.exclusions).toContainEqual({ line: '1b', description: 'Insolvency exclusion', value: '40000' });
  expect(summary.reductions).toEqual(expect.arrayContaining([expect.objectContaining({ line: '6', value: '40000' })]));
  const directory = await mkdtemp(join(tmpdir(), 'cod-nol-review-'));
  try {
    const output = await fillNetOperatingLossReview(redacted, result, directory, undefined, token);
    expect((await PDFDocument.load(await readFile(output))).getPageCount()).toBe(1);
    await mkdir(join(directory, 'packet'));
    const packet = await fillReturn(redacted, result, { outputDir: join(directory, 'packet'), blankFormsDir: 'forms/blank/2025', codNolReview: token });
    expect(packet.filledForms.some(path => path.endsWith('f982-reference-filled.pdf'))).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
  const current = currentOriginInput(), debt = actualCodNolInput('1000');
  Object.assign(current, { form1099C: debt.form1099C, codExclusion: debt.codExclusion, form982NolSources: debt.form982NolSources });
  if (!current.form172) throw new Error('Missing fixture'); current.form172.cancelledDebtIncluded = true;
  const currentResult = calculateFederalTax(current), currentToken = prepareCodNolReview(current);
  const currentRows = buildNetOperatingLossReview(redactReviewIdentifiers(current), currentResult, undefined, currentToken).join(' ');
  expect(currentRows).toContain('Current regular PartI loss 80000');
  expect(currentRows).toContain('Regular COD: before 80000; reduction 1000; expiry 0; remaining 79000');
  expect(currentRows).toContain('Alternative COD: before 75000; reduction 1000; expiry 0; remaining 74000');
  const expiring = actualCodNolInput('5000');
  if (!expiring.netOperatingLoss?.vintages?.[0] || !expiring.netOperatingLoss.alternativeTax?.vintages?.[0]) throw new Error('Missing actual histories');
  for (const vintage of [expiring.netOperatingLoss.vintages[0], expiring.netOperatingLoss.alternativeTax.vintages[0]]) {
    Object.assign(vintage, { lossTaxYear: 2005, carrybackTreatment: 'waived', carrybackSourceReference: 'Actual timely original waiver' });
  }
  const expiringResult = calculateFederalTax(expiring), expiryToken = prepareCodNolReview(expiring);
  const expiryRows = buildNetOperatingLossReview(redactReviewIdentifiers(expiring), expiringResult, undefined, expiryToken).join(' ');
  expect(expiryRows).toContain('Regular NOL before COD: claimed 100000; absorbed 84250; expired 15750; remaining 100000');
  expect(expiryRows).toContain('before-COD loss calculations and final after-COD balances are shown separately');
  expect(expiryRows).toContain('2005: before 15750; reduction 5000; expiry 10750; remaining 0');
  expect(buildForm982ReferenceSummary(expiringResult).totals).toContainEqual({ label: 'Regular residual expiry after COD', value: '10750' });
});
it('rejects altered COD sources and retained carry calculations before rendering', async () => {
  const source = actualCodNolInput(), result = calculateFederalTax(source), token = prepareCodNolReview(source), redacted = redactReviewIdentifiers(source);
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/original|source|context|creditor/i);
  expect(() => prepareCodNolReview(redacted)).toThrow(/original|source|creditor|owner/i);
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, {} as PreparedCodNolReview)).toThrow(/context/i);
  expect(() => buildNetOperatingLossReview(redacted, result, undefined, prepareCodNolReview(actualCodNolInput('39000')))).toThrow(/stale|source/i);
  for (const mutate of [
    (input: typeof source) => { if (input.form982NolSources?.debts?.[0]) input.form982NolSources.debts[0].amountDischarged = '40001'; },
    (input: typeof source) => { if (input.form982NolSources?.insolvency?.assets?.[0]) input.form982NolSources.insolvency.assets[0].amount = '9999'; },
    (input: typeof source) => { if (input.netOperatingLoss?.vintages?.[0]) input.netOperatingLoss.vintages[0].originalLoss = '100001'; },
    (input: typeof source) => { input.w2s[0].wages = '100001'; },
    (input: typeof source) => { input.taxpayer.primary.lastName = 'Different'; },
  ]) { const changed = structuredClone(redacted); mutate(changed); expect(() => buildNetOperatingLossReview(changed, result, undefined, token)).toThrow(/stale|source/i); }
  for (const mutate of [
    (value: typeof result) => { if (value.codNolReduction?.regular?.vintages[0]) value.codNolReduction.regular.vintages[0].attributeReduction = d('32601'); },
    (value: typeof result) => { if (value.codNolReduction?.regular?.vintages[0]) value.codNolReduction.regular.vintages[0].expiredAfterReduction = d('1'); },
    (value: typeof result) => { if (value.codNolReduction?.alternativeTax) value.codNolReduction.alternativeTax.carryforward = d('70001'); },
    (value: typeof result) => { value.carryforwards.nolCarryforward = d('92601'); },
    (value: typeof result) => { if (value.netOperatingLoss?.vintages[0]) value.netOperatingLoss.vintages[0].remainingCarryforward = d('32601'); },
    (value: typeof result) => { const row = value.allLines.find(row => row.form === 'Form 982' && row.line === '6'); if (row) row.inputs['Remaining regular NOL'] = d('92601'); },
  ]) { const changed = calculateFederalTax(source); mutate(changed); expect(() => buildNetOperatingLossReview(redacted, changed, undefined, token)).toThrow(/reconcile/i); }
  const directory = await mkdtemp(join(tmpdir(), 'cod-nol-reject-'));
  try {
    result.carryforwards.alternativeTaxNolCarryforward = d('70001');
    await expect(fillReturn(redacted, result, { outputDir: directory, blankFormsDir: 'forms/blank/2025', codNolReview: token })).rejects.toThrow(/reconcile/i);
    expect(await readdir(directory)).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
