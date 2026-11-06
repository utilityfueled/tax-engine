// Spec: spec/federal/workspace-digital-asset-sources.yaml.
import { expect, it } from 'vitest';
import type { WorkspaceDocumentRecord, WorkspaceReturnSummary, WorkspaceStructuredFactRecord } from '@tax-engine/contracts';
import { buildWorkspaceEngineInput } from '@tax-engine/engine';
import { calculateFederalTax } from '@/engine/federal.js';
import { parseUploadedDocumentText } from '../../apps/web/src/lib/uploaded-document-detection.js';
import { actualDigitalAssetSource } from '../fixtures/digital-asset-sources.js';
import { workspaceScenarioContext } from '../helpers/workspace-calculation-context.js';
import { workspaceTaxpayerFixture } from '../helpers/workspace-taxpayer.js';

const text = '2025 Form1099-DA\nShort-Term Transactions\nBTC / ACTUALDTIF\n06/01/25 0.001 100.49 01/15/25 90.24 10.25';
function scenario() {
  const parsed = parseUploadedDocumentText(text, 'original1099-da.pdf')!;
  const machineValue = parsed.detectedFacts.find(row => row.machineValue)?.machineValue;
  const fact: WorkspaceStructuredFactRecord = { id: 'doc-da:parsed-1099-da-transaction-1', factId: 'broker-proceeds', label: 'Original digital disposition', value: 'Original recipient statement', sourceType: 'upload', sourceDocumentIds: ['doc-da'], confidence: 'high', machineValue };
  const document: WorkspaceDocumentRecord = { id: 'doc-da', name: 'original1099-da.pdf', size: 100, uploadedAt: '2026-02-01T00:00:00Z', kind: '1099-da', coverage: 'partially-supported', label: 'Original1099DA', notes: 'Missing source eligibility supplied separately', taxYear: 2025, seededFactIds: ['broker-proceeds'] };
  const summary: WorkspaceReturnSummary = { status: 'ready-to-recompute', targetTaxYear: 2025, taxYearState: 'single', answeredFactCount: 1, totalFactCount: 1, readyItemCount: 1, itemCount: 1, blockers: [], items: [{ id: 'capital-gains', label: 'Capital gains', status: 'ready', engineTargets: ['Form8949'], relatedFactIds: ['broker-proceeds'], sourceDocumentIds: ['doc-da'], answeredFactCount: 1, factCount: 1 }] };
  const context = workspaceScenarioContext([], workspaceTaxpayerFixture());
  const original = structuredClone(actualDigitalAssetSource);
  Object.assign(original.transactions[0], { digitalAssetName: 'BTC', digitalAssetCode: 'ACTUALDTIF', reportedDateAcquired: '2025-01-15', reportedCostBasis: '90.24', gainOrLoss: '10.25' });
  context.taxInput.form1099DA = [original];
  context.sourceBindings = [{ sourceFactId: fact.id, sourceFactsConfirmed: true, inputCollection: 'form1099DA', inputIndex: 0, transactionIndex: 0 }];
  return { document, fact, summary, context };
}
it('preserves digital source type and only original reported amounts', () => {
  const { fact } = scenario();
  expect(fact.machineValue).toMatchObject({ entryKind: '1099-da-transaction', transactionEvidence: 'individual', digitalAssetName: 'BTC', digitalAssetCode: 'ACTUALDTIF', quantity: '0.001', reportedDateAcquired: '2025-01-15', reportedCostBasis: '90.24', proceeds: '100.49', gainOrLoss: '10.25' });
  expect(fact.machineValue).not.toHaveProperty('costBasis'); expect(fact.machineValue).not.toHaveProperty('basisReportedToIRS');
  expect(fact.machineValue).not.toHaveProperty('federalWithheld'); expect(fact.machineValue).not.toHaveProperty('accountHolder');
  const loss = parseUploadedDocumentText(text.replace('100.49 01/15/25 90.24 10.25', '80.49 01/15/25 90.24 -9.75'), 'original1099-da.pdf')!;
  expect(loss.detectedFacts.find(row => row.machineValue)?.machineValue).toMatchObject({ gainOrLoss: '-9.75' });
});
it('calculates a complete original DA context without replacing source evidence', () => {
  const { document, fact, summary, context } = scenario(); const original = JSON.stringify(fact);
  const ready = buildWorkspaceEngineInput([document], summary, [fact], undefined, context);
  expect(ready).not.toBeNull(); expect(ready?.taxInput.form1099B).toEqual([]);
  expect(ready?.taxInput.form1099DA[0].transactions[0].reportedCostBasis).toBe('90.24');
  const result = calculateFederalTax(ready!.taxInput);
  expect(result.capitalGainLoss.toFixed()).toBe('10.25'); expect(result.totalWithholding.toFixed()).toBe('0.1');
  expect(JSON.stringify(fact)).toBe(original);
  const blank = parseUploadedDocumentText(text.replace('01/15/25 90.24 10.25', '-- -- --'), 'original1099-da.pdf')!;
  fact.machineValue = blank.detectedFacts.find(row => row.machineValue)?.machineValue;
  expect(fact.machineValue).toMatchObject({ reportedCostBasis: null, reportedDateAcquired: null });
  context.taxInput.form1099DA[0].transactions[0].reportedCostBasis = null;
  context.taxInput.form1099DA[0].transactions[0].reportedDateAcquired = null;
  const completed = buildWorkspaceEngineInput([document], summary, [fact], undefined, context);
  expect(completed).not.toBeNull(); expect(calculateFederalTax(completed!.taxInput).capitalGainLoss.toFixed()).toBe('10.25');
});
it('rejects sparse summaries contradictory sources and unbound incomplete DA facts', () => {
  const test = scenario(); const preview = () => buildWorkspaceEngineInput([test.document], test.summary, [test.fact], undefined, test.context);
  expect(buildWorkspaceEngineInput([test.document], test.summary, [test.fact])).toBeNull();
  const value = test.fact.machineValue as unknown as Record<string, unknown>;
  value.transactionEvidence = 'summary'; expect(preview()).toBeNull(); value.transactionEvidence = 'individual';
  value.reportedCostBasis = '90.25'; expect(preview()).toBeNull(); value.reportedCostBasis = '90.24';
  value.gainOrLoss = '10.24'; expect(preview()).toBeNull(); value.gainOrLoss = '10.25';
  const source = test.context.taxInput.form1099DA[0];
  source.transactions[0].reportedCostBasis = null; expect(preview()).toBeNull(); source.transactions[0].reportedCostBasis = '90.24';
  const unbound = structuredClone(source); unbound.sourceId = 'Other actual statement'; delete unbound.federalWithheld;
  test.context.taxInput.form1099DA.push(unbound); expect(preview()).toBeNull(); test.context.taxInput.form1099DA.pop();
  test.context.sourceBindings[0].inputCollection = 'form1099B'; expect(preview()).toBeNull();
  test.fact.machineValue = { entryKind: '1099-b-transaction', sourceFactsVersion: 2, description: 'BTC', dateAcquired: '2025-01-15', dateSold: '2025-06-01', proceeds: '100.49', costBasis: '90.24', adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'short', basisReportedToIRS: false, digitalAsset: true };
  test.context.taxInput.form1099DA = [];
  test.context.taxInput.form1099B = [{ broker: 'Digital broker', federalWithheld: '0', stateWithheld: '0', transactions: [{ ...test.fact.machineValue, digitalAsset: true, adjustments: '0', washSale: false, washSaleDisallowed: '0', holdingPeriod: 'short', basisReportedToIRS: false }] }];
  expect(preview()).toBeNull();
});
