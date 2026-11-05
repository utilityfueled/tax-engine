// Spec: state/pa-married-payment-native.yaml.
import { TaxYearInputSchema } from '@/models/inputs';
import { it, expect, vi } from 'vitest';
import { saveGuidedFlowState, loadGuidedFlowState, getGuidedFlowStorageKey } from '@/lib/guided-interview-flow';
import { buildGuidedPAMarriedOrdinarySources } from '@/lib/guided-pa-married-ordinary-sources';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { ensureWorkspace, getWorkspace } from '@/lib/workspace-storage';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '@/lib/workspace-recovery';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { PAMarriedOrdinarySourcesSchema } from '@/models/pa-married-ordinary-sources';
import { guidedPAMarriedNativeFixture } from '../../fixtures/guided-pa-married-native';
import { paMarriedPaymentsFixture } from '../../fixtures/pa-married-payments';
function storage(): Storage { const v = new Map<string, string>(); return { getItem: k => v.get(k) ?? null, setItem: (k, x) => { v.set(k, x); }, removeItem: k => { v.delete(k); }, clear: () => v.clear(), key: n => [...v.keys()][n] ?? null, get length() { return v.size; } }; }
it('PA married payment originals survive saved workspace and encrypted recovery', async () => {
    const f = guidedPAMarriedNativeFixture(), payment = paMarriedPaymentsFixture(), sources = PAMarriedOrdinarySourcesSchema.parse(payment.sources), packet = required(sources.paymentSources);
    packet.sourceReference = 'fictional-private-payment-document';
    packet.sourceFactsConfirmed = null;
    sources.sourceFactsConfirmed = null;
    packet.accounts[0].originalAccount.availablePriorCredit = '';
    packet.accounts[1].originalAccount.availablePriorCredit = '0.00';
    packet.accounts[0].receipts[0].original.amount = '1,0';
    packet.accounts[0].originalAccount.allPaymentsCompleteConfirmed = null;
    f.state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '', paMarriedOrdinarySources: sources };
    const before = structuredClone(sources), local = storage();
    ensureWorkspace(local, 'payment-draft');
    ensureWorkspace(local, 'unrelated');
    saveGuidedFlowState(local, 'payment-draft', f.state);
    const restored = required(loadGuidedFlowState(local, 'payment-draft'));
    expect(required(restored.sectionData['state-return']).paMarriedOrdinarySources).toEqual(before);
    const federal = buildTaxInputFromGuidedData(restored);
    expect(federal).not.toBeNull();
    expect(() => buildGuidedPAMarriedOrdinarySources(TaxYearInputSchema.parse(federal), required(restored.sectionData['state-return']).paMarriedOrdinarySources)).toThrow();
    expect(local.getItem(getGuidedFlowStorageKey('unrelated'))).toBeNull();
    const documents = { read: vi.fn(async () => null), write: vi.fn(async () => { }), remove: vi.fn(async () => { }) }, archive = await exportWorkspaceRecovery(local, 'payment-draft', 'fictional-private-payment-passphrase', { documents });
    expect(await archive.text()).not.toMatch(/fictional-private-payment-document|originalAccount|confirmationNumber|availablePriorCredit|900-70/);
    const imported = await importWorkspaceRecovery(local, archive, 'fictional-private-payment-passphrase', { documents });
    expect(imported.workspaceId).not.toBe('payment-draft');
    expect(local.getItem(getGuidedFlowStorageKey(imported.workspaceId))).toBe(local.getItem(getGuidedFlowStorageKey('payment-draft')));
    expect(required(required(loadGuidedFlowState(local, imported.workspaceId)).sectionData['state-return']).paMarriedOrdinarySources).toEqual(before);
    const privateWorkspace = { ...required(getWorkspace(local, 'payment-draft')), guidedFlowRaw: JSON.stringify(f.state), paMarriedOrdinarySources: sources };
    const shell = sanitizeWorkspaceForHostedStorage(privateWorkspace);
    expect(JSON.stringify(shell)).not.toMatch(/fictional-private-payment-document|originalAccount|confirmationNumber|paMarriedOrdinarySources|guidedFlowRaw/);
    expect(sources).toEqual(before);
});
it('PA legacy saved household sources do not acquire inferred payment accounts', () => { const f = guidedPAMarriedNativeFixture(), local = storage(); delete f.sources.paymentSources; saveGuidedFlowState(local, 'legacy-payment-draft', f.state); expect(required(required(required(loadGuidedFlowState(local, 'legacy-payment-draft')).sectionData['state-return']).paMarriedOrdinarySources).paymentSources).toBeUndefined(); });

function required<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw Error("Expected actual fixture fact");return value;}
