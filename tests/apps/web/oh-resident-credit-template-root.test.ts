/** Spec: state/oh-resident-credit-template-root.yaml. Source-first existing API integration controls. */
import { expect, it } from 'vitest';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { fillOhioResidentCreditOfficialReview, prepareOhioResidentCreditOfficialReview } from '@/pdf/mappings/2025/fill-oh-resident-credit-official-review.js';
import { ohioResidentCreditOfficialReviewFixture, type ResidentCreditPhysicalCase } from '../../fixtures/oh-resident-credit-official-review.js';

const repository = resolve(import.meta.dirname, '../../..');
const web = join(repository, 'apps/web');
const blank = join(repository, 'forms/blank');
const roots = [['pack', blank], ['year', join(blank, '2025')]] as const;
const cohorts = ['distinct', 'cents'] as const;
const officialPages = {
  'oh-it-1040-review.pdf': 2,
  'oh-it-rc-review.pdf': 1,
  'oh-schedule-credits-review.pdf': 2,
  'oh-schedule-of-withholding-review.pdf': 2,
} as const;
function fixture(kind: ResidentCreditPhysicalCase = 'distinct') {
  const input = ohioResidentCreditOfficialReviewFixture(kind);
  const federal = calculateFederalTax(input);
  const context = prepareOhioResidencyReview(input);
  return { input, federal, context };
}
function token(f: ReturnType<typeof fixture>) {
  const prepared = prepareOhioResidentCreditOfficialReview(f.input, f.federal, {}, f.context);
  if (!prepared) throw Error('Actual existing source-complete RC projection required');
  return prepared;
}
async function underCwd<T>(directory: string, action: () => Promise<T>) {
  const before = process.cwd();
  process.chdir(directory);
  try { return await action(); } finally { process.chdir(before); }
}
async function temporary(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'oh-rc-template-root-'));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function physical(paths: string[]) {
  const selected = paths.filter(path => path.endsWith('-review.pdf'));
  expect(selected.map(path => basename(path)).sort()).toEqual(Object.keys(officialPages).sort());
  let total = 0;
  for (const [name, count] of Object.entries(officialPages)) {
    const path = selected.find(path => basename(path) === name);
    if (!path) throw Error(`Actual required source companion absent: ${name}`);
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBe(count); total += pages;
  }
  expect(total).toBe(7);
}
// Proposed additive roots are exercised through actual functions, not mock wrappers.
async function publicPacket(f: ReturnType<typeof fixture>, output: string, sourceRoot: string) {
  const result: Awaited<ReturnType<typeof fillOhioReferenceForms>> = await Reflect.apply(
    fillOhioReferenceForms, undefined, [redactReviewIdentifiers(f.input), f.federal, output, {}, f.context, sourceRoot],
  );
  return result;
}
async function directPacket(prepared: ReturnType<typeof token>, output: string, sourceRoot: string) {
  const result: string[] = await Reflect.apply(fillOhioResidentCreditOfficialReview, undefined, [prepared, output, sourceRoot]);
  return result;
}
it.each(cohorts)('RC template root actual source baseline %s', kind => {
  const f = fixture(kind), before = structuredClone(f.input);
  const result = calculateOhioResidentReturnFromFederal({ taxInput: f.input, federalResult: f.federal });
  expect(result.residentCredit?.line7_residentCredit.toFixed(0)).toBe(kind === 'cents' ? '1001' : '1000');
  expect(result.it1040.line10_taxAfterCredits.toFixed(0)).toBe(kind === 'cents' ? '1322' : '1323');
  expect(result.it1040.line14_ohioWithholding.toFixed(0)).toBe('2000');
  expect(result.it1040.line26_refund.toFixed(0)).toBe(kind === 'cents' ? '678' : '677');
  expect(f.input).toEqual(before);
});
it('RC default repository root remains compatible', async () => {
  const f = fixture(), before = structuredClone(f.input);
  await temporary(async out => {
    const packet = await underCwd(repository, () => fillOhioReferenceForms(redactReviewIdentifiers(f.input), f.federal, out, {}, f.context));
    await physical(packet.filledForms);
  });
  expect(f.input).toEqual(before);
});
const publicCases = cohorts.flatMap(kind => roots.map(([name, path]) => [kind, name, path] as const));
it.each(publicCases)('RC public web cwd uses supplied root %s %s', async (kind, _name, sourceRoot) => {
  const f = fixture(kind), before = structuredClone(f.input);
  await temporary(async out => { const packet = await underCwd(web, () => publicPacket(f, out, sourceRoot)); await physical(packet.filledForms); });
  expect(f.input).toEqual(before);
});
it.each(roots)('RC direct prepared web cwd uses supplied root %s', async (_name, sourceRoot) => {
  const f = fixture(), before = structuredClone(f.input), prepared = token(f);
  await temporary(async out => { const paths = await underCwd(web, () => directPacket(prepared, out, sourceRoot)); await physical(paths); });
  expect(f.input).toEqual(before);
});
const sourceCases = ['oh-it1040-bundle.pdf', 'oh-it-rc.pdf'].flatMap(name => (['missing', 'tampered'] as const).map(kind => [name, kind] as const));
it.each(sourceCases)('RC supplied source denies without alternate fallback %s %s', async (name, kind) => {
  const f = fixture(), before = structuredClone(f.input), prepared = token(f);
  await temporary(async dir => {
    const supplied = join(dir, 'templates'), year = join(supplied, '2025'), out = join(dir, 'must-not-exist');
    await mkdir(year, { recursive: true });
    for (const asset of ['oh-it1040-bundle.pdf', 'oh-it-rc.pdf'])
      if (asset !== name) await copyFile(join(blank, '2025', asset), join(year, asset));
    if (kind === 'tampered') await writeFile(join(year, name), '%PDF-unapproved-fixture-asset');
    await underCwd(repository, async () => {
      await expect(directPacket(prepared, out, supplied)).rejects.toThrow(kind === 'missing' ? /ENOENT/ : /source revision changed/);
    });
    await expect(access(out)).rejects.toThrow();
  });
  expect(f.input).toEqual(before);
});
it.each(['owner', 'payer'] as const)('RC stale source precedes explicit asset I O %s', async kind => {
  const f = fixture();
  if (kind === 'owner') f.input.taxpayer.primary.lastName += ' current changed actual owner';
  else { const w2 = f.input.w2s[0]; if (!w2) throw Error('Existing actual employer required'); w2.employer.name += ' current changed actual employer'; }
  const before = structuredClone(f.input);
  await temporary(async dir => {
    const out = join(dir, 'must-not-exist');
    await expect(underCwd(web, () => publicPacket(f, out, join(dir, 'nonexistent-source'))))
      .rejects.toThrow(/original.*differ|source.*differ|context.*match|stale/i);
    await expect(access(out)).rejects.toThrow();
  });
  expect(f.input).toEqual(before);
});
it('RC root cannot qualify an invented prepared token', async () => {
  await temporary(async dir => {
    const out = join(dir, 'must-not-exist');
    await expect(Reflect.apply(fillOhioResidentCreditOfficialReview, undefined, [{}, out, blank])).rejects.toThrow(/valid current private prepared projection/);
    await expect(access(out)).rejects.toThrow();
  });
});
it('RC root cannot qualify unavailable2026', async () => {
  const f = fixture(); f.input.taxpayer.taxYear = 2026; f.federal.taxYear = 2026;
  const before = structuredClone(f.input);
  await temporary(async dir => {
    const out = join(dir, 'must-not-exist');
    await expect(publicPacket(f, out, join(blank, '2025'))).rejects.toThrow(/2026/);
    await expect(access(out)).rejects.toThrow();
  });
  expect(f.input).toEqual(before);
});
