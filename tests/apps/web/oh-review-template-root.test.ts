/** Spec: state/oh-review-template-root.yaml. Actual existing APIs; source contract before products. */
import { expect, it, vi } from 'vitest';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { fillOhioOrdinaryOfficialReview } from '@/pdf/mappings/2025/fill-oh-ordinary-official-review.js';
import { fillOhioSchoolDistrictOfficialReview } from '@/pdf/mappings/2025/fill-oh-school-district-official-review.js';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord, syncGuidedFlowToWorkspace } from '@/lib/workspace-storage';
import { buildGuidedSyntheticDocuments, buildGuidedFactAnswers } from '@/lib/guided-interview-bridge';
import { guidedReciprocalWageFixture } from '../../fixtures/guided-oh-reciprocal-wages-complete.js';
import { reciprocalOfficialReviewFixture, reciprocalPaperCases, reciprocalPaperRequired } from '../../fixtures/oh-reciprocal-official-review.js';
import { schoolOfficialFixture } from '../../fixtures/oh-school-district-official-review.js';
vi.mock('server-only', () => ({}));

const root = resolve(import.meta.dirname, '../../..');
const web = join(root, 'apps/web');
const blank = join(root, 'forms/blank');
const inputs = [
  ['refund', reciprocalPaperRequired(reciprocalPaperCases[0])],
  ['known-zero', reciprocalPaperRequired(reciprocalPaperCases[1])],
] as const;
const roots = [['pack', blank], ['version', join(blank, '2025')]] as const;
async function withCwd<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const before = process.cwd();
  process.chdir(directory);
  try { return await action(); } finally { process.chdir(before); }
}
async function temporary(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'oh-template-root-'));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function expectPhysicalFiles(paths: string[], names: string[]) {
  expect(paths.map(path => basename(path)).filter(name => name.endsWith('-review.pdf')).sort()).toEqual([...names].sort());
  for (const path of paths.filter(path => basename(path).endsWith('-review.pdf'))) {
    const bytes = await readFile(path);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  }
}
// Reflect invokes the real API with the proposed additive sixth argument before
// its TypeScript declaration exists. There is no stub, product wrapper or fallback.
async function explicitReference(input: TaxYearInput, output: string, sourceRoot: string) {
  const federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  const packet: Awaited<ReturnType<typeof fillOhioReferenceForms>> = await Reflect.apply(
    fillOhioReferenceForms, undefined, [redactReviewIdentifiers(input), federal, output, {}, context, sourceRoot],
  );
  return packet;
}

it('actual public Ohio review under web cwd retains required physical companions', async () => {
  const f = guidedReciprocalWageFixture(), before = JSON.stringify(f.state);
  const workspace = syncGuidedFlowToWorkspace(
    createWorkspaceRecord('actual-oh-template-root-review', { now: '2026-03-13T00:00:00.000Z' }),
    buildGuidedSyntheticDocuments(f.state), buildGuidedFactAnswers(f.state), f.state,
  );
  const download = await withCwd(web, () => buildWorkspaceFilledReturnDownload(workspace, f.state));
  for (const name of ['oh-it-1040-review.pdf', 'oh-it-nrc-review.pdf', 'oh-schedule-adjustments-review.pdf', 'oh-schedule-credits-review.pdf', 'oh-schedule-of-withholding-review.pdf'])
    expect(download.includedForms).toContain(name);
  expect(Buffer.from(download.contents).subarray(0, 5).toString()).toBe('%PDF-');
  expect((await PDFDocument.load(download.contents)).getPageCount()).toBeGreaterThan(9);
  expect(JSON.stringify(f.state)).toBe(before);
});

it.each(inputs)('default public Ohio root remains compatible %s', async (_name, c) => {
  const p = reciprocalOfficialReviewFixture(c), before = JSON.stringify(p);
  await temporary(async output => {
    const packet = await withCwd(root, () => fillOhioReferenceForms(redactReviewIdentifiers(p.input), calculateFederalTax(p.input), output, {}, prepareOhioResidencyReview(p.input)));
    await expectPhysicalFiles(packet.filledForms, Object.keys(c.physicalFiles));
  });
  expect(JSON.stringify(p)).toBe(before);
});

const explicitCases = inputs.flatMap(([name, c]) => roots.map(([label, path]) => [name, label, c, path] as const));
it.each(explicitCases)('explicit public Ohio root under web cwd %s %s', async (_name, _label, c, path) => {
  const p = reciprocalOfficialReviewFixture(c), before = JSON.stringify(p);
  await temporary(async output => {
    const packet = await withCwd(web, () => explicitReference(p.input, output, path));
    await expectPhysicalFiles(packet.filledForms, Object.keys(c.physicalFiles));
  });
  expect(JSON.stringify(p)).toBe(before);
});

it.each(roots)('explicit school physical root under web cwd %s', async (_label, path) => {
  const input = schoolOfficialFixture(), before = JSON.stringify(input);
  await temporary(async output => {
    const packet = await withCwd(web, () => explicitReference(input, output, path));
    await expectPhysicalFiles(packet.filledForms, ['oh-sd-100-review.pdf', 'oh-sd-withholding-review.pdf']);
  });
  expect(JSON.stringify(input)).toBe(before);
});

const physical = [
  ['ordinary', () => reciprocalOfficialReviewFixture(reciprocalPaperRequired(reciprocalPaperCases[0])).input, fillOhioOrdinaryOfficialReview, 'oh-it1040-bundle.pdf'],
  ['school', () => schoolOfficialFixture(), fillOhioSchoolDistrictOfficialReview, 'oh-sd100-bundle.pdf'],
] as const;
const assetCases = physical.flatMap(([name, fixture, fill, filename]) => (['missing', 'tampered'] as const).map(kind => [name, kind, fixture, fill, filename] as const));
it.each(assetCases)('direct physical template denial before output %s %s', async (_name, kind, fixture, fill, filename) => {
  const input = fixture(), before = JSON.stringify(input), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  await temporary(async directory => {
    const assetRoot = join(directory, 'assets'), output = join(directory, 'must-not-exist');
    await mkdir(join(assetRoot, '2025'), { recursive: true });
    if (kind === 'tampered') await writeFile(join(assetRoot, '2025', filename), '%PDF-tampered-unapproved-source');
    await withCwd(root, async () => {
      await expect(Reflect.apply(fill, undefined, [redactReviewIdentifiers(input), federal, output, {}, context, assetRoot]))
        .rejects.toThrow(kind === 'missing' ? /ENOENT/ : /source revision changed/);
    });
    await expect(access(output)).rejects.toThrow();
  });
  expect(JSON.stringify(input)).toBe(before);
});

it.each(physical)('current source denial precedes explicit asset access %s', async (_name, fixture, fill) => {
  const input = fixture(), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  input.taxpayer.primary.lastName += 'Changed';
  const before = JSON.stringify(input);
  await temporary(async directory => {
    const output = join(directory, 'must-not-exist');
    await expect(Reflect.apply(fill, undefined, [redactReviewIdentifiers(input), federal, output, {}, context, join(directory, 'nonexistent-assets')]))
      .rejects.toThrow(/source|original|identity|context|match|stale/i);
    await expect(access(output)).rejects.toThrow();
  });
  expect(JSON.stringify(input)).toBe(before);
});
