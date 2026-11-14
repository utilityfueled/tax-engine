// Spec: spec/federal/cod-principal-residence-sources.yaml.
import { expect, it, vi } from 'vitest';
import { calculateVerifiedAiAudit } from '@/lib/ai-tax-context';
import { createTaxExplanationRouteHandlers } from '@/lib/transient-tax-explanation-route';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { principalResidenceCodInput as fixture } from '../../fixtures/cod-principal-residence';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async original => ({ ...await original<typeof import('@/lib/rate-limit')>(),
  checkRateLimitForEnvironment: vi.fn().mockResolvedValue({ allowed: true }) }));
it('keeps original residence records out of a computed AI audit', () => {
  const raw = fixture(), receipt = calculateVerifiedAiAudit({ ownerScope:'synthetic-owner',workspaceId:'synthetic-return',workspaceRevision:'synthetic-revision' },raw);
  const rendered = JSON.stringify(receipt);
  expect(rendered).not.toContain('form982PrincipalResidenceSources');
  for (const value of [raw.form982PrincipalResidenceSources.sourceReference,raw.form982PrincipalResidenceSources.debt.accountReference,
    raw.form982PrincipalResidenceSources.debt.creditor,raw.form982PrincipalResidenceSources.debt.debtorName]) expect(rendered).not.toContain(value);
  expect(receipt.entries).toEqual(expect.arrayContaining([{ id:'audit:2025:1040:11',taxYear:2025,line:'11',value:'50000',explanation:'Adjusted gross income' },
    {id:'audit:2025:1040:24',taxYear:2025,line:'24',value:'3875',explanation:'Total tax'}]));
});
it('enforces retained-home original sources through the actual private POST', async () => {
  const workspace = createWorkspaceRecord('synthetic-residence-admission'); workspace.returnSummary.targetTaxYear = 2025;
  const providerRequest = buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain adjusted gross income.',now:'2026-11-14T19:30:00Z'});
  const fetchFn = vi.fn(() => { throw Error('No external request allowed'); }), accounting=vi.fn();
  const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'self-host'},rateLimitStore:new Map(),fetchFn,accounting});
  const request=(taxInput:unknown)=>new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',
    headers:{'content-type':'application/json',origin:'https://tax.example','x-real-ip':'127.0.0.1'},
    body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})});
  const missing=fixture(); missing.form982PrincipalResidenceSources.basis.allBasisChangesIncluded=false;
  for (const [input,status] of [[missing,400],[fixture(),200]] as const) {
    const response=await handler.POST(request(input));
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toContain('private'); expect(response.headers.get('cache-control')).toContain('no-store');
    const body=await response.text(); expect(body).not.toContain(input.form982PrincipalResidenceSources.debt.accountReference);
    if(status===200) expect(JSON.parse(body)).toMatchObject({provider:'mock-local'});
  }
  expect(fetchFn).not.toHaveBeenCalled(); expect(accounting).not.toHaveBeenCalled();
});
