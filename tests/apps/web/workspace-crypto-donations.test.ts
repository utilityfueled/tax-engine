// Spec: spec/federal/guided-crypto-donations.yaml saved-review.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { actualCryptoDonationInterview } from '../../fixtures/guided-crypto-donations';
import { inspectCryptoDonationPdf } from '../../fixtures/crypto-donation-pdf-inspection';

vi.mock('server-only', () => ({}));
it('reopens the actual gift through the private saved return packet', async () => {
  const state = actualCryptoDonationInterview(), original = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-crypto-donation');
  workspace.returnSummary.targetTaxYear = 2025;
  const restored = JSON.parse(JSON.stringify(state)) as typeof state;
  const result = await buildWorkspaceFilledReturnDownload(workspace, restored);
  const read = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3',
    ['-c', inspectCryptoDonationPdf, resolve('forms/blank/2025/f1040sa.pdf')], { input: result.contents, encoding: 'utf8' })) as {
      pages: string[]; noncash: string[]; charitable: string[]; itemized: string[]; flattened: boolean;
    };
  expect(read.flattened).toBe(true);
  expect(read.noncash).toEqual(['20000']); expect(read.charitable).toEqual(['20000']); expect(read.itemized).toEqual(['20000']);
  for (const page of read.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  for (const value of ['111-22-3333', '111223333']) expect(read.pages.join('\n')).not.toContain(value);
  expect(restored).toEqual(original); expect(state).toEqual(original);
  const row = restored.sectionData.deductions?.cryptoDonations?.[0];
  if (!row) throw new Error('Missing original gift');
  row.costBasis = '';
  await expect(buildWorkspaceFilledReturnDownload(workspace, restored)).rejects.toThrow('Complete the required taxpayer facts before exporting.');
  restored.taxYear = 2026; row.costBasis = '1000'; row.dateDonated = '2026-06-01'; workspace.returnSummary.targetTaxYear = 2026;
  await expect(buildWorkspaceFilledReturnDownload(workspace, restored)).rejects.toThrow(/2026|unavailable|not.*ready/i);
});
