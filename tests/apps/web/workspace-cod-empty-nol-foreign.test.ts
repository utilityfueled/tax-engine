// Spec: spec/federal/cod-empty-nol-foreign.yaml workspace.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedPennsylvaniaOverrides } from '@/lib/guided-state-engine-inputs';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator';
import { prepareCodNolReview, codNolReviewOriginalSourceInput } from '@/pdf/cod-nol-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { d } from '@/utils/decimal';
import { readdir } from 'node:fs/promises';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCodEmptyNolForeignState } from '../../fixtures/guided-cod-empty-nol-foreign';
vi.mock('server-only', () => ({}));

it('reopens actual independent foreign histories in the partial workspace packet', async () => {
  for (const [method, regular, alternative] of [['ordinary', '112', '300'], ['deduction', '327', '145']] as const) {
    const state = guidedCodEmptyNolForeignState(method), before = structuredClone(state);
    const workspace = createWorkspaceRecord(`synthetic-foreign-${method}`); workspace.returnSummary.targetTaxYear = 2025;
    const result = await buildWorkspaceFilledReturnDownload(workspace, state);
    const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-workspace-'));
    try {
      const path = join(directory, 'actual-review.pdf'); await writeFile(path, result.contents);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain(`Regular total foreign credit carry after COD Value: ${regular}`);
      expect(text).toContain(`Alternative total foreign credit carry after COD Value: ${alternative}`);
      expect(text).toContain('before COD');
      expect(text).toContain('Packet completeness status: partial.');
      for (const secret of ['123-45-6789', '123456789', 'Private synthetic account A', 'Original statement-A', '112233445']) expect(text).not.toContain(secret);
      expect(state).toEqual(before);
      state.sectionData['other-taxes']!.foreignTaxElection!.sourceFactsConfirmed = null;
      await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});


// Spec: cod-empty-nol-foreign.yaml reference-state-attachment.
it('preserves the actual Pennsylvania attachment without relaxing federal output binding', async () => {
  const state = guidedCodEmptyNolForeignState('deduction');
  state.segmentation.stateCode = 'PA';
  Object.assign(state.sectionData['personal-info']!, { state: 'PA', city: 'Pittsburgh', zip: '15222', stateResidency: 'full-year' });
  const wage = state.sectionData['income-w2']!.entries[0]!;
  Object.assign(wage, { stateTaxReporting: 'single', state: 'PA', stateWages: wage.wages, stateWithheld: '4000' });
  const original = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-foreign-pa');
  workspace.returnSummary.targetTaxYear = 2025;
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.taxpayer.address.state).toBe('PA');
  expect(input.taxpayer.stateResidency).toBe('full-year');
  const federal = calculateFederalTax(input), token = prepareCodNolReview(input);
  expect(federal.stateReturns?.pennsylvania).toBeUndefined();
  const pennsylvania = calculatePAReturn(input, buildGuidedPennsylvaniaOverrides(state));
  const combined = { ...federal, stateReturns: { ...federal.stateReturns, pennsylvania } };
  // This state-owned object is added by the real workspace adapter, after the
  // federal result and without changing any federal current-tax amount/audit.
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  expect(codNolReviewOriginalSourceInput(redactReviewIdentifiers(input), combined, token)).toEqual(input);
  expect(codNolReviewOriginalSourceInput(redactReviewIdentifiers(input), redactReviewIdentifiers(combined), token)).toEqual(input);
  expect(download.includedForms).toContain('pa-40-filled.pdf');
  const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-pa-'));
  try {
    const path = join(directory, 'actual-pa-review.pdf'); await writeFile(path, download.contents);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path],
    { encoding: 'utf8', timeout: 30000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('PA-40 Pennsylvania Income Tax Return');
    expect(text).toContain('Regular total foreign credit carry after COD Value: 327');
    expect(text).toContain('Alternative total foreign credit carry after COD Value: 145');
    pages.forEach(page => expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
    const output = join(directory, 'tampered');
    combined.foreignTaxCredit = d('1');
    await expect(fillReturn(redactReviewIdentifiers(input), combined, { outputDir: output,
      blankFormsDir: 'forms/blank', codNolReview: token })).rejects.toThrow(/reconcile/i);
    expect(await readdir(output).catch(() => [])).toEqual([]);
    expect(state).toEqual(original);
    await expect(buildWorkspaceFilledReturnDownload(workspace)).rejects.toThrow(/guided interview/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
