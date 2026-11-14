// Spec: spec/federal/form-1099-da-market-discount-independent.yaml verified-context-privacy.
import { expect, it, vi } from 'vitest';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { marketDiscountInput } from '../../fixtures/form-1099-da-market-discount';

vi.mock('server-only', () => ({}));

it('keeps original debt proof out of the genuine verified AI context', () => {
  const input = marketDiscountInput();
  const original = JSON.stringify(input);
  const scope = { ownerScope: 'synthetic-owner', workspaceId: 'synthetic-debt-return', workspaceRevision: 'synthetic-revision' };
  const audit = calculateVerifiedAiAudit(scope, input);
  expect(audit.entries.find(row => row.line === '11')?.value).toBe('85200.02');
  const resolved = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit });
  expect(resolved.status).toBe('available');
  const serialized = JSON.stringify(resolved);
  const form = input.form1099DA[0];
  const proof = form.transactions[0].marketDiscountSource;
  if (!proof) throw new Error('Missing fictional original debt proof');
  for (const secret of [input.taxpayer.primary.ssn, form.sourceId, form.accountReference,
    proof.sourceReference, proof.securityIdentifier, proof.originalDispositionReference,
    proof.interestReportingReconciliation.sourceReference]) {
    expect(secret).toBeTruthy();
    expect(serialized).not.toContain(secret);
  }
  expect(JSON.stringify(input)).toBe(original);
});
