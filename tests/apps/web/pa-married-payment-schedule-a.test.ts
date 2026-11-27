/** Spec: state/pa-married-payment-sources.yaml, federal-schedule-a-5a. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from '@/lib/guided-interview-flow';
import { confirmGuidedPAMarriedOrdinarySources } from '@/lib/guided-pa-married-ordinary-sources';
import { updateGuidedPAMarriedPayments } from '@/lib/guided-pa-married-payments';
import { computeGuidedPreviewOutcome } from '@/lib/guided-preview-compute';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { paMarriedPaymentNativeBrowserFixture } from '../../fixtures/pa-married-payment-native-browser';
import { guidedPAMarriedNativeFixture } from '../../fixtures/guided-pa-married-native';
import { requiredNative } from '../../fixtures/pa-married-native-public';

vi.mock('server-only', () => ({}));

function pairedItemizedFixture() {
  const { state, expected } = paMarriedPaymentNativeBrowserFixture();
  requiredNative(state.sectionData['state-return']).paMarriedOrdinarySources = { ...expected, sourceFactsConfirmed: null };
  const itemized = updateSectionData(state, 'deductions', { ...emptyDeductionData, method: 'itemized' });
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(itemized));
  const paSources = confirmGuidedPAMarriedOrdinarySources(input, expected);
  const ready = updateSectionData(itemized, 'state-return', {
    ...requiredNative(itemized.sectionData['state-return']), paMarriedOrdinarySources: paSources,
  });
  return { input, itemized, paSources, ready };
}

function reopen(state: ReturnType<typeof pairedItemizedFixture>['ready']) {
  const records = new Map<string, string>();
  const storage: Storage = {
    get length() { return records.size; },
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: key => { records.delete(key); },
    clear: () => { records.clear(); },
    key: index => [...records.keys()][index] ?? null,
  };
  expect(saveGuidedFlowState(storage, 'paired-pa-payment-schedule-a', state)).toBe(true);
  return requiredNative(loadGuidedFlowState(storage, 'paired-pa-payment-schedule-a'));
}

it('uses the verified paid amounts in guided preview and the saved federal review PDF', async () => {
  const { input, ready } = pairedItemizedFixture();
  const reopened = reopen(ready);
  const federalBaseline = calculateFederalTax(input);
  expect(federalBaseline.deductionAmount.toFixed()).toBe('2456');
  const preview = computeGuidedPreviewOutcome(reopened);
  expect(preview.blockedBy).toBeNull();
  expect(preview.metrics?.state).toMatchObject({ kind: 'separate-returns', returns: [
    { accountHolder: 'primary', stateRefund: '327' }, { accountHolder: 'spouse', stateRefund: '80' },
  ] });
  expect.soft(preview.metrics?.taxableIncome).toBe(federalBaseline.taxableIncome.minus('330').toFixed());

  const workspace = createWorkspaceRecord('paired-pa-payment-schedule-a');
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, reopened);
  expect(download.includedForms).toEqual(expect.arrayContaining(['f1040sa-filled.pdf', 'pa-primary-40-review.pdf', 'pa-spouse-40-review.pdf']));
  const directory = await mkdtemp(join(tmpdir(), 'tax-engine-pa-schedule-a-'));
  try {
    const pdf = join(directory, 'review.pdf');
    await writeFile(pdf, download.contents, { mode: 0o600 });
    const page = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-I', '-B', '-c', `
import sys
from pypdf import PdfReader
for page in PdfReader(sys.argv[1]).pages:
    text = page.extract_text()
    if 'Itemized Deductions' in text and 'www.irs.gov/ScheduleA' in text:
        print(text)
`, pdf], { encoding: 'utf8', timeout: 10_000 });
    expect(page.match(/\b2,?786\b/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);

it('holds a previously used receipt after a saved edit or removal until reconfirmed', () => {
  const { input, itemized, paSources, ready } = pairedItemizedFixture();
  const pendingFirstTime = computeGuidedPreviewOutcome(reopen(itemized));
  expect(pendingFirstTime.blockedBy).toBeNull();
  expect(pendingFirstTime.metrics?.taxableIncome).toBe('77544');
  expect(pendingFirstTime.metrics?.state).toBeNull();

  const legacy = structuredClone(ready);
  delete requiredNative(legacy.sectionData['state-return']).lastConfirmedPAMarriedPaymentYear;
  const legacyReopened = reopen(legacy);
  const changedPayment = structuredClone(requiredNative(paSources.paymentSources));
  changedPayment.accounts[0].receipts[0].sourceReference = 'Revised actual source reference';
  const edited = updateSectionData(legacyReopened, 'state-return', {
    ...requiredNative(legacyReopened.sectionData['state-return']),
    paMarriedOrdinarySources: updateGuidedPAMarriedPayments(paSources, changedPayment),
  });
  const pendingChanged = computeGuidedPreviewOutcome(reopen(edited));
  expect.soft(pendingChanged.metrics).toBeNull();
  expect.soft(pendingChanged.blockedBy ?? '').toMatch(/confirm.*Pennsylvania.*payments/i);

  const { sources: knownNone } = guidedPAMarriedNativeFixture('M', 'whole');
  const removed = updateSectionData(ready, 'state-return', {
    ...requiredNative(ready.sectionData['state-return']), paMarriedOrdinarySources: { ...knownNone, sourceFactsConfirmed: null },
  });
  const reopened = reopen(removed);
  const pendingRemoved = computeGuidedPreviewOutcome(reopened);
  expect.soft(pendingRemoved.metrics).toBeNull();
  expect.soft(pendingRemoved.blockedBy ?? '').toMatch(/confirm.*Pennsylvania.*payments/i);

  const incompleteRestore = structuredClone(ready);
  delete requiredNative(requiredNative(incompleteRestore.sectionData['state-return']).paMarriedOrdinarySources).paymentSources;
  const missingProof = computeGuidedPreviewOutcome(reopen(incompleteRestore));
  expect(missingProof.metrics).toBeNull();
  expect(missingProof.blockedBy).toMatch(/actual complete payment history/);

  for (const damage of ['accounts', 'receipt'] as const) {
    const malformed = structuredClone(ready);
    const sources = requiredNative(requiredNative(malformed.sectionData['state-return']).paMarriedOrdinarySources);
    const packet = requiredNative(sources.paymentSources);
    if (damage === 'accounts') Object.assign(packet, { accounts: null });
    else Object.assign(packet.accounts[0].receipts[0].original, { date: null, amount: {} });
    const restored = updateSectionData(reopen(malformed), 'deductions', requiredNative(malformed.sectionData.deductions));
    expect(restored.sectionData['state-return']?.lastConfirmedPAMarriedPaymentYear).toBe(2025);
    expect(computeGuidedPreviewOutcome(restored).metrics).toBeNull();
  }

  const final = confirmGuidedPAMarriedOrdinarySources(input, knownNone);
  const reconfirmed = updateSectionData(reopened, 'state-return', {
    ...requiredNative(reopened.sectionData['state-return']), paMarriedOrdinarySources: final,
  });
  const reopenedNone = reopen(reconfirmed);
  expect(requiredNative(reopenedNone.sectionData['state-return']).lastConfirmedPAMarriedPaymentYear).toBeUndefined();
  const confirmedNone = computeGuidedPreviewOutcome(reopenedNone);
  expect(confirmedNone.blockedBy).toBeNull();
  expect(confirmedNone.metrics?.taxableIncome).toBe('77544');
  expect(confirmedNone.metrics?.state).toMatchObject({ kind: 'separate-returns', returns: [
    { accountHolder: 'primary', stateRefund: '0' }, { accountHolder: 'spouse', stateRefund: '0' },
  ] });
});

it('retains a saved paired payment hold when a known-none confirmation lacks federal originals', () => {
  const { input, ready } = pairedItemizedFixture();
  const { sources: knownNone } = guidedPAMarriedNativeFixture('M', 'whole');
  const claimed = confirmGuidedPAMarriedOrdinarySources(input, knownNone);
  const wrongYear = { ...claimed.originalFederalSources, taxpayer: { ...input.taxpayer, taxYear: 2026 } };

  for (const originalFederalSources of [undefined, {}, wrongYear]) {
    const restored = structuredClone(ready);
    requiredNative(restored.sectionData['state-return']).paMarriedOrdinarySources = {
      ...claimed, originalFederalSources: originalFederalSources ?? {},
    };
    if (originalFederalSources === undefined) {
      Reflect.deleteProperty(requiredNative(restored.sectionData['state-return']).paMarriedOrdinarySources, 'originalFederalSources');
    }
    const pending = reopen(restored);
    const afterRestore = computeGuidedPreviewOutcome(pending);
    expect.soft(afterRestore.metrics).toBeNull();
    expect.soft(afterRestore.blockedBy ?? '').toMatch(/confirm.*Pennsylvania.*payments/i);

    const unrelatedUpdate = updateSectionData(pending, 'deductions', requiredNative(pending.sectionData.deductions));
    const afterUpdate = reopen(unrelatedUpdate);
    const checked = computeGuidedPreviewOutcome(afterUpdate);
    expect.soft(requiredNative(afterUpdate.sectionData['state-return']).lastConfirmedPAMarriedPaymentYear).toBe(2025);
    expect.soft(checked.metrics).toBeNull();
    expect.soft(checked.blockedBy ?? '').toMatch(/confirm.*Pennsylvania.*payments/i);
  }
});

it('holds a known-none saved packet with stale same-year originals after unrelated changes', () => {
  const { input, ready } = pairedItemizedFixture();
  const { sources: knownNone } = guidedPAMarriedNativeFixture('M', 'whole');
  const claimed = confirmGuidedPAMarriedOrdinarySources(input, knownNone);
  const stale = TaxYearInputSchema.parse(claimed.originalFederalSources);
  stale.w2s[0].employer.name = 'Fictional stale employer with unchanged wages';
  const restored = structuredClone(ready);
  requiredNative(restored.sectionData['state-return']).paMarriedOrdinarySources = { ...claimed, originalFederalSources: stale };

  const pending = reopen(restored);
  expect(computeGuidedPreviewOutcome(pending).blockedBy).toMatch(/original household snapshot changed/);
  const unrelatedUpdate = updateSectionData(pending, 'deductions', requiredNative(pending.sectionData.deductions));
  const afterUpdate = reopen(unrelatedUpdate);
  expect.soft(requiredNative(afterUpdate.sectionData['state-return']).lastConfirmedPAMarriedPaymentYear).toBe(2025);
  const checked = computeGuidedPreviewOutcome(afterUpdate);
  expect.soft(checked.metrics).toBeNull();
  expect.soft(checked.blockedBy ?? '').toMatch(/original household snapshot changed/);
});
