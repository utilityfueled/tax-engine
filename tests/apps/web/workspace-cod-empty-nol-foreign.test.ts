// Spec: spec/federal/cod-empty-nol-foreign.yaml workspace.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedStateOriginals, buildGuidedPennsylvaniaOverrides } from '@/lib/guided-state-engine-inputs';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import {completeWorkspacePACodForeignState,incompleteWorkspacePACodForeignState}from '../../fixtures/workspace-pa-cod-foreign-sources';
import { prepareCodNolReview, codNolReviewOriginalSourceInput } from '@/pdf/cod-nol-review-context';
import { preparePAWorkingCreditReview } from '@/pdf/pa-working-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { fillReturn } from '@/pdf/fill-return';
import { d } from '@/utils/decimal';
import { readdir } from 'node:fs/promises';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { guidedCodEmptyNolForeignState } from '../../fixtures/guided-cod-empty-nol-foreign';
vi.mock('server-only', () => ({}));

// Explicit test-only artifact retention; ordinary temp cleanup remains unchanged.
async function retainWorkspaceCodArtifact(name:string,contents:Uint8Array){
  const directory=process.env.TAX_ENGINE_PDF_TEST_ARTIFACT_DIR;
  if(!directory)return;
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,name),contents);
}


it('reopens actual independent foreign histories in the partial workspace packet', async () => {
  for (const [method, regular, alternative] of [['ordinary', '112', '300'], ['deduction', '327', '145']] as const) {
    const state = guidedCodEmptyNolForeignState(method), before = structuredClone(state);
    const workspace = createWorkspaceRecord(`synthetic-foreign-${method}`); workspace.returnSummary.targetTaxYear = 2025;
    const result = await buildWorkspaceFilledReturnDownload(workspace, state);
    const directory = await mkdtemp(join(tmpdir(), 'cod-foreign-workspace-'));
    try {
      const path = join(directory, 'actual-review.pdf'); await writeFile(path, result.contents);
      await retainWorkspaceCodArtifact(`cod-foreign-${method}.pdf`,result.contents);
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
      const foreignElection=state.sectionData['other-taxes']?.foreignTaxElection;
      if(!foreignElection)throw new Error('Missing existing fictional foreign tax election source');
      foreignElection.sourceFactsConfirmed = null;
      await expect(buildWorkspaceFilledReturnDownload(workspace, state)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});


// Spec: cod-empty-nol-foreign.yaml reference-state-attachment.
it('preserves the actual Pennsylvania attachment without relaxing federal output binding', async () => {
  const state = completeWorkspacePACodForeignState();
  const original = structuredClone(state);
  const workspace = createWorkspaceRecord('synthetic-foreign-pa');
  workspace.returnSummary.targetTaxYear = 2025;
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.taxpayer.address.state).toBe('PA');
  expect(input.taxpayer.stateResidency).toBe('full-year');
  // Additive literal source-to-return checks; original federal/token assertions below remain unchanged.
  const actualInput=buildGuidedStateOriginals(input,state);
  const actualPA=calculatePAOrdinaryReturn(actualInput,actualInput.paOrdinaryReturnFacts,actualInput.paOrdinaryReturnCompletionSources);
  expect(actualPA.pa40.totalPATaxableIncome.toFixed()).toBe('100000');
  expect(actualPA.pa40.interest.toFixed()).toBe('5000');
  expect(actualPA.pa40.taxLiability.toFixed()).toBe('3070');
  expect(actualPA.pa40.stateWithholding.toFixed()).toBe('4000');
  expect(actualPA.pa40.residentCredit.toFixed()).toBe('0');
  expect(actualPA.scheduleSP.eligibilityIncome.toFixed()).toBe('100000');
  expect(actualPA.refundDisposition.refund.toFixed()).toBe('930');
  expect(actualPA.readiness.filingEligible).toBe(false);
  const federal = calculateFederalTax(input), token = prepareCodNolReview(input);
  const paWorkingCreditReview = preparePAWorkingCreditReview(input);
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
    await retainWorkspaceCodArtifact('cod-foreign-pa.pdf',download.contents);
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
      blankFormsDir: 'forms/blank', codNolReview: token, paWorkingCreditReview })).rejects.toThrow(/reconcile/i);
    expect(await readdir(output).catch(() => [])).toEqual([]);
    expect(state).toEqual(original);
    await expect(buildWorkspaceFilledReturnDownload(workspace)).rejects.toThrow(/guided interview/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Spec: state/workspace-pa-cod-foreign-sources.yaml source-admission.
it('retains the original incomplete PA COD workspace as a source admission negative',async()=>{
 const state=incompleteWorkspacePACodForeignState(),before=structuredClone(state),workspace=createWorkspaceRecord('synthetic-incomplete-pa-cod');workspace.returnSummary.targetTaxYear=2025;
 await expect(buildWorkspaceFilledReturnDownload(workspace,state)).rejects.toThrow(/actual Pennsylvania ordinary and completion source packets/i);
 expect(state).toEqual(before);
});
it('new explicit PA source supplements preserve every preexisting canonical federal original',()=>{
 const complete=completeWorkspacePACodForeignState(),incomplete=incompleteWorkspacePACodForeignState();
 expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(complete))).toEqual(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(incomplete)));
});
it.each(['legal','foreign-receipt','payment-history','filing-date','completion','refund-election']as const)('PA COD actual source gaps reject without snapshot refresh or PDF export: %s',async kind=>{
 const state=completeWorkspacePACodForeignState(),data=state.sectionData['state-return'];if(!data?.paResidencySources?.personalDebtDischarges?.[0]||!data.paResidencySources.foreignBankTaxSources?.[0]?.payments[0]||!data.paOrdinaryReturnFacts||!data.paOrdinaryReturnCompletionSources)throw Error('Missing new explicit fictional source fixture');
 if(kind==='legal')data.paResidencySources.personalDebtDischarges[0].qualification.legallyDischargedConfirmed=null;
 if(kind==='foreign-receipt')data.paResidencySources.foreignBankTaxSources[0].payments[0].amount='99';
 if(kind==='payment-history')data.paOrdinaryReturnFacts.payments.allPaymentsIncludedConfirmed=null;
 if(kind==='filing-date')data.paOrdinaryReturnFacts.timing.date='';
 if(kind==='completion')data.paOrdinaryReturnCompletionSources.care.status='unknown';
 if(kind==='refund-election')data.paOrdinaryReturnFacts.disposition.refundRequested='929';
 const before=structuredClone(state),workspace=createWorkspaceRecord('synthetic-pa-cod-source-gap-'+kind);workspace.returnSummary.targetTaxYear=2025;
 await expect(buildWorkspaceFilledReturnDownload(workspace,state)).rejects.toThrow();expect(state).toEqual(before);
});
