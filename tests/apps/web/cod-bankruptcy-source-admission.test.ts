// Spec: spec/federal/cod-bankruptcy-source-admission.yaml.
import { expect, it, vi } from 'vitest';
import { calculateVerifiedAiAudit } from '@/lib/ai-tax-context';
import { createTaxExplanationRouteHandlers } from '@/lib/transient-tax-explanation-route';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { simpleW2Fixture } from '../../fixtures/simple-w2';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async original => ({ ...await original<typeof import('@/lib/rate-limit')>(),
  checkRateLimitForEnvironment: vi.fn().mockResolvedValue({ allowed: true }) }));
const incomplete = { ...simpleW2Fixture, form1099C: [{ creditor: 'Fictional Bank', amountDischarged: '50000',
  interestIncluded: '0', personallyLiable: true, identifiableEventCode: 'A', fmvOfProperty: '0' }], codExclusion: { bankruptcy: true } };
it('rejects an incomplete bankruptcy claim before a server-verified audit exists', () => {
  expect(() => calculateVerifiedAiAudit({ ownerScope: 'synthetic-owner', workspaceId: 'synthetic-return', workspaceRevision: 'synthetic-revision' }, incomplete)).toThrow();
});
it('rejects source-incomplete bankruptcy through actual calculation POST before provider or accounting', async () => {
  const workspace = createWorkspaceRecord('synthetic-bankruptcy-admission'); workspace.returnSummary.targetTaxYear = 2025;
  const providerRequest = buildProviderWorkspaceRequest(workspace, { task: 'workspace-help', question: 'Explain adjusted gross income.', now: '2026-11-14T19:30:00Z' });
  const fetchFn = vi.fn(() => { throw Error('No external request allowed'); }), accounting = vi.fn();
  const handler = createTaxExplanationRouteHandlers({ env: { TAX_ENGINE_DEPLOYMENT_MODE: 'self-host' }, rateLimitStore: new Map(), fetchFn, accounting });
  const request = (taxInput: unknown) => new Request('https://tax.example/api/workspace/tax-explanation', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://tax.example', 'x-real-ip': '127.0.0.1' }, body: JSON.stringify({
      version: 1, confirmed: true, workspaceId: workspace.id, workspaceRevision: workspace.updatedAt, taxYear: 2025, taxInput, providerRequest,
    }),
  });
  for (const codExclusion of [incomplete.codExclusion,
    { insolvency: { totalLiabilities: '100000', totalAssets: '0' }, electBasisReductionFirst: true },
    { qualifiedPrincipalResidence: { dischargedAmount: '50000' } }, { qualifiedFarmExclusion: '50000' },
    { qualifiedRealPropertyBusinessExclusion: '50000' }, { qualifiedPrincipalResidence: { dischargedAmount: '-1' } },
    { qualifiedFarmExclusion: '-1' }, { qualifiedRealPropertyBusinessExclusion: '-1' }]) {
    const rejected = await handler.POST(request({ ...incomplete, codExclusion }));
    expect(rejected.status, JSON.stringify(codExclusion)).toBe(400); expect(rejected.headers.get('cache-control')).toContain('private');
    expect(rejected.headers.get('cache-control')).toContain('no-store');
    expect(await rejected.text()).not.toContain('Fictional Bank');
    expect(fetchFn).not.toHaveBeenCalled(); expect(accounting).not.toHaveBeenCalled();
  }
  const ordinary = await handler.POST(request(simpleW2Fixture));
  expect(ordinary.status).toBe(200); expect(await ordinary.json()).toMatchObject({ provider: 'mock-local' });
  expect(fetchFn).not.toHaveBeenCalled(); expect(accounting).not.toHaveBeenCalled();
});
