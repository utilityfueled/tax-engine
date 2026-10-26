// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml.
import React, { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SegmentationScreen } from '@/components/guided-interview/segmentation-screen';
import { buildSectionRoute, type SegmentationAnswers } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord, ingestFilesIntoWorkspace } from '@/lib/workspace-storage';
import { mountGuidedPanel } from './guided-panel-dom';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function key(value: string, target: EventTarget = window, options: KeyboardEventInit = {}) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, ...options })));
}

async function choose(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[value="${value}"]`);
  if (!input) throw new Error(`Missing actual setup option ${value}`);
  await act(async () => input.click());
  return input;
}

async function upload(container: HTMLElement, files: File[] | null) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Missing actual file selector');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

function pendingUpload() {
  let resolve: (message: string) => void = () => { throw new Error('Uninitialized upload'); };
  let reject: (error: unknown) => void = () => { throw new Error('Uninitialized upload'); };
  const promise = new Promise<string>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

it('selects and revises actual interview routes without assuming missing answers', async () => {
  const onComplete = vi.fn<(answers: SegmentationAnswers) => void>();
  const workspace = createWorkspaceRecord('synthetic-setup-route');
  const original = structuredClone(workspace);
  const dom = await mountGuidedPanel(<SegmentationScreen workspace={workspace} onComplete={onComplete} />);
  try {
    expect(dom.container.textContent).toContain('No documents uploaded yet');
    await key('Escape');
    await key('Enter', window, { ctrlKey: true });
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Upload Documents');
    await dom.click('Continue');
    await key('Enter');
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Filing Status');
    expect(dom.container.querySelector<HTMLButtonElement>('.launch-button')?.disabled).toBe(true);
    const filing = await choose(dom.container, 'hoh');
    await key('Enter', filing);
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Filing Status');
    await key('Enter');
    await choose(dom.container, 'w2-wages');
    await choose(dom.container, 'investments');
    await choose(dom.container, 'royalties');
    await choose(dom.container, 'investments');
    await dom.click('Continue');
    await choose(dom.container, 'k1-loss-sources');
    await choose(dom.container, 'current-year-loss');
    await choose(dom.container, 'k1-loss-sources');
    await key('Escape');
    expect(dom.container.querySelector<HTMLInputElement>('input[value="royalties"]')?.checked).toBe(true);
    expect(dom.container.querySelector<HTMLInputElement>('input[value="investments"]')?.checked).toBe(false);
    await dom.click('Continue');
    expect(dom.container.querySelector<HTMLInputElement>('input[value="current-year-loss"]')?.checked).toBe(true);
    expect(dom.container.querySelector<HTMLInputElement>('input[value="k1-loss-sources"]')?.checked).toBe(false);
    await dom.click('Continue');
    await dom.change('State of residence', 'MI');
    expect(dom.container.textContent).toContain('Michigan will add a state return section');
    await dom.change('State of residence', '');
    expect(dom.container.textContent).toContain('Leave this on skip for now');
    await dom.change('State of residence', 'OH');
    await dom.click('Back');
    await dom.click('Continue');
    expect(dom.control('State of residence').value).toBe('OH');
    await dom.click('Start My Return');
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({filingStatus:'hoh',incomeTypes:['w2-wages','royalties'],lifeEvents:['current-year-loss'],stateCode:'OH'});
    const selected = onComplete.mock.calls[0]?.[0];
    if (!selected) throw new Error('The actual completion action must return the selected route');
    expect(buildSectionRoute(selected).map(section => section.id)).toEqual(expect.arrayContaining(['income-w2','income-royalties','adjustments','state-return']));
    expect(buildSectionRoute(selected).map(section => section.id)).not.toContain('income-investments');
    expect(Object.keys(selected).sort()).toEqual(['filingStatus','incomeTypes','lifeEvents','stateCode']);
    expect(workspace).toEqual(original);
  } finally { await dom.dispose(); }

  const skipped = await mountGuidedPanel(<SegmentationScreen workspace={workspace} onComplete={onComplete} />);
  try {
    await key('Enter');
    await choose(skipped.container, 'single');
    await key('Enter');
    await key('Enter');
    await key('Enter');
    await key('Enter');
    expect(onComplete).toHaveBeenLastCalledWith({filingStatus:'single',incomeTypes:[],lifeEvents:[],stateCode:null});
    expect(window.scrollTo).toHaveBeenCalled();
  } finally { await skipped.dispose(); }
});

it('handles actual upload outcomes and document summaries before continuing', async () => {
  const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord('synthetic-setup-documents'), [
    {name:'fictional-original.pdf',size:12,detectedDocument:{taxYear:2025,kind:'w2',coverage:'supported',label:'Original W-2',notes:'Original',seededFactIds:['wages']}},
    {name:'fictional-review.pdf',size:13,detectedDocument:{taxYear:null,kind:'unknown',coverage:'unsupported',label:'Unclassified original',notes:'Next step: review original values',seededFactIds:[]}},
    {name:'fictional-help.pdf',size:14,detectedDocument:{taxYear:null,kind:'unknown',coverage:'unsupported',label:'Unclassified original',notes:'Original values unknown',seededFactIds:[]}},
    {name:'fictional-fourth.pdf',size:15},
    {name:'fictional-fifth.pdf',size:16},
  ]);
  const original = structuredClone(workspace);
  const deferred = pendingUpload();
  const onUpload = vi.fn<(files: File[]) => Promise<string>>()
    .mockImplementationOnce(() => deferred.promise)
    .mockResolvedValueOnce('')
    .mockRejectedValueOnce(new Error('The selected PDF could not be read.'))
    .mockRejectedValueOnce('non-Error upload failure')
    .mockResolvedValueOnce('The original document was retained for review.');
  const onComplete = vi.fn();
  const dom = await mountGuidedPanel(<SegmentationScreen workspace={workspace} onUploadDocuments={onUpload} onComplete={onComplete} />);
  const files = [new File(['synthetic a'], 'new-a.pdf', {type:'application/pdf'}),new File(['synthetic b'],'new-b.pdf',{type:'application/pdf'})];
  try {
    expect(dom.container.textContent).toContain('5 documents already stored locally.');
    expect(dom.container.textContent).toContain('Original W-2 · W2 · supported');
    expect(dom.container.textContent).toContain('Unclassified original · reviewed');
    expect(dom.container.textContent).toContain('AI help available');
    expect(dom.container.textContent).toContain('+ 1 more document already attached.');
    expect(dom.container.textContent).not.toContain('fictional-fifth.pdf');
    await upload(dom.container, null);
    expect(onUpload).not.toHaveBeenCalled();
    await dom.click('Upload documents');
    await upload(dom.container, files);
    expect(onUpload).toHaveBeenNthCalledWith(1, files);
    expect(dom.container.textContent).toContain('Uploading...');
    expect(dom.container.querySelector<HTMLButtonElement>('.launch-button')?.disabled).toBe(true);
    await dom.click('Continue');
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Upload Documents');
    await act(async () => deferred.resolve(''));
    expect(dom.container.querySelector('[role="status"]')?.textContent).toBe('Uploaded 2 documents.');
    await upload(dom.container, files.slice(0,1));
    expect(dom.container.querySelector('[role="status"]')?.textContent).toBe('Uploaded 1 document.');
    await upload(dom.container, files);
    expect(dom.container.querySelector('[role="alert"]')?.textContent).toBe('The selected PDF could not be read.');
    await upload(dom.container, files);
    expect(dom.container.querySelector('[role="alert"]')?.textContent).toBe('Could not upload the selected document(s). Please try again.');
    await upload(dom.container, files);
    expect(dom.container.querySelector('[role="status"]')?.textContent).toBe('The original document was retained for review.');
    expect(dom.container.querySelector<HTMLInputElement>('input[type="file"]')?.value).toBe('');
    await dom.click('Continue');
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Filing Status');
    expect(dom.container.querySelectorAll('input:checked')).toHaveLength(0);
    expect(onComplete).not.toHaveBeenCalled();
    expect(workspace).toEqual(original);
  } finally { await dom.dispose(); }
});

it('keeps keyboard navigation on the upload step while selected files are pending', async () => {
  const deferred = pendingUpload();
  const onUpload = vi.fn(() => deferred.promise);
  const dom = await mountGuidedPanel(<SegmentationScreen workspace={createWorkspaceRecord('synthetic-pending-upload')} onUploadDocuments={onUpload} onComplete={vi.fn()} />);
  try {
    await upload(dom.container, [new File(['synthetic'], 'pending.pdf', {type:'application/pdf'})]);
    expect(dom.container.querySelector<HTMLButtonElement>('.launch-button')?.disabled).toBe(true);
    await key('Enter');
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Upload Documents');
    await act(async () => deferred.resolve('Original retained'));
    await key('Enter');
    expect(dom.container.querySelector('[aria-current="step"]')?.textContent).toBe('Filing Status');
  } finally { await act(async () => deferred.resolve('Original retained')); await dom.dispose(); }
});
