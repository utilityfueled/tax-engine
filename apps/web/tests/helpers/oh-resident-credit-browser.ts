/** Spec: state/oh-resident-credit-native-browser.yaml. Fictional originals; no calculated RC seed. */
import { nativeControlTag } from './native-control-snapshot';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { TaxYearInputSchema } from '../../../../src/models/inputs';
import { buildSectionRoute, type GuidedFlowState, type W2EntryData } from '../../src/lib/guided-interview-flow';
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from '../../src/lib/guided-interview-bridge';
import { confirmGuidedW2StateLocalSources } from '../../src/lib/guided-w2-state-local-facts';
import { snapshotGuidedOhioOriginals } from '../../src/lib/guided-ohio-residency-facts';
import type { OhioResidentCreditDraft } from '../../src/lib/guided-ohio-resident-credit-sources';
import { completeW2Entry } from '../../../../tests/guided-interview/complete-facts';
import {
  guidedResidentCreditFixture, residentCreditNativeFields, required,
  residentCreditAddLabel, residentCreditConfirmLabel,
} from '../../../../tests/fixtures/guided-oh-resident-credit-complete';

export { required, residentCreditAddLabel, residentCreditConfirmLabel };
export type Cohort = 'distinct' | 'cents';
/** Literal expectations pinned independently before any outputs; never read fixture.expected. */
export const cash = {
  distinct: { credit: '1000', tax: '1323', taxDisplay: '$1,323', refund: '677', refundDisplay: '$677', transfer: '250.00' },
  cents: { credit: '1001', tax: '1322', taxDisplay: '$1,322', refund: '678', refundDisplay: '$678', transfer: '250.25' },
} as const;
export const changedReference = 'PRIVATE-NATIVE-RC-SAME-CASH-REVIEWED-RECEIPT';
export const personalSecrets = ['900-71-0412', '900710412', 'PRIVATE-', '091000011000001', '091000011000002', 'VA-2026-POST-70001', 'VA-2026-POST-70002'];
export const parentConfirm = 'Confirm actual Ohio residency sources';

export function control(page: Page, label: string): Locator {
  return page.locator('label').filter({ has: page.getByText(label, { exact: true }) }).locator('input,select');
}
export async function enter(page: Page, label: string, value: string) {
  const field = control(page, label);
  const tagName = await nativeControlTag(field);
  if (tagName === 'SELECT') await field.selectOption(value);
  else { await field.fill(value); await field.press('Tab'); }
}
export async function saved(page: Page, id: string): Promise<GuidedFlowState> {
  return page.evaluate(id => {
    const raw = localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`);
    if (!raw) throw Error('Actual saved native flow required');
    return JSON.parse(raw) as GuidedFlowState;
  }, id);
}
export async function packet(page: Page, id: string): Promise<OhioResidentCreditDraft> {
  return required((await saved(page, id)).sectionData['state-return']?.ohioResidency?.residentCreditSources);
}
export function captures(draft: OhioResidentCreditDraft) {
  return {
    originalW2: draft.originalW2,
    originalFederalSources: draft.originalFederalSources,
    originalResidentCreditSourcePacket: draft.originalResidentCreditSourcePacket,
    originalW2UndefinedPaths: draft.originalW2UndefinedPaths,
  };
}
export function noCaptures(draft: OhioResidentCreditDraft) {
  expect(draft.originalW2).toBeUndefined();
  expect(draft.originalFederalSources).toBeUndefined();
  expect(draft.originalResidentCreditSourcePacket).toBeUndefined();
  expect(draft.originalW2UndefinedPaths).toBeUndefined();
}
export async function seedUnrelated(page: Page, cohort: Cohort) {
  const facts = guidedResidentCreditFixture(cohort), state = structuredClone(facts.state);
  delete required(state.sectionData['state-return']?.ohioResidency).residentCreditSources;
  const person = facts.input.taxpayer.primary, address = facts.input.taxpayer.address;
  Object.assign(required(state.sectionData['personal-info']), {
    firstName: person.firstName, middleName: '', lastName: person.lastName, ssn: person.ssn,
    dateOfBirth: person.dateOfBirth, stateResidency: 'full-year', addressLine1: address.street,
    addressLine2: '', city: address.city, state: 'OH', zip: address.zip,
  });
  const w2 = required(facts.input.w2s[0]);
  const entry: W2EntryData = {
    ...structuredClone(completeW2Entry), employerName: w2.employer.name, employerEin: w2.employer.ein,
    accountHolder: 'primary', sourceTaxYear: '2025', wages: w2.wages, federalWithheld: w2.federalWithheld,
    stateTaxReporting: 'multiple', state: 'VA', stateWages: '60000', stateWithheld: '1200',
    localWages: '0', localTaxWithheld: '0', localityName: '', stateLocalSources: structuredClone(required(w2.stateLocalSources)),
  };
  const keys = ['socialSecurityWages', 'socialSecurityTips', 'allocatedTips', 'socialSecurityWithheld',
    'medicareWages', 'medicareWithheld', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD',
    'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB',
    'box12CodeEE', 'box12CodeT'] as const;
  Object.assign(entry, Object.fromEntries(keys.map(key => [key, required(w2[key])])));
  state.sectionData['income-w2'] = { entries: [entry] };
  // Sole explicit setup of unrelated complete W2 proof. No RC/helper confirmation is invoked.
  entry.stateLocalSources = confirmGuidedW2StateLocalSources(required(buildGuidedW2SourceContext(state)), 0, entry.stateLocalSources);
  const original = TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
  const residency = structuredClone(facts.residency);
  delete residency.residentCreditSources;
  delete residency.originalFederalSources;
  residency.sourceFactsConfirmed = null;
  const payments = structuredClone(facts.payments);
  payments.originalFederalSources = snapshotGuidedOhioOriginals(original);
  state.sectionData['state-return'] = { stateEstimatedPayments: [], additionalStateWithholding: '', ohioResidency: residency, ohioPayments: payments };
  expect(state.sectionData['state-return'].ohioResidency).not.toHaveProperty('residentCreditSources');
  expect(original.w2s).toHaveLength(1);
  expect(required(original.w2s[0]).wages).toBe('100000');
  const route = buildSectionRoute(state.segmentation), index = route.findIndex(section => section.id === 'state-return');
  if (index < 0) throw Error('Actual Ohio state-return route required');
  state.phase = 'interview'; state.currentSectionIndex = index; state.completedSections = route.slice(0, index).map(section => section.id);
  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = required(new URL(page.url()).pathname.split('/').at(-1));
  await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
  // This is the ONLY storage write. All resident-credit origination/editing is actual DOM entry.
  await page.evaluate(({ id, state }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
  }, { id, state });
  await page.reload();
  return { id, facts, original, seed: JSON.parse(JSON.stringify(state)) as GuidedFlowState };
}
export function stateSummary(active: Locator) {
  return active.locator('.guided-ticker-breakdown').filter({ has: active.page().getByText('Ohio (OH)', { exact: true }) });
}
export async function confirmedMoney(active: Locator, cohort: Cohort) {
  const summary = stateSummary(active), expected = cash[cohort];
  await expect(summary).toHaveCount(1);
  for (const [label, value] of [['State Tax', expected.taxDisplay], ['State Payments', '$2,000'], ['State Refund', expected.refundDisplay]]) {
    await expect(summary.getByText(label, { exact: true }).locator('..').locator('.guided-ticker-breakdown-value')).toHaveText(value);
  }
  for (const secret of personalSecrets) await expect(summary).not.toContainText(secret);
}
export async function pendingMoney(active: Locator) {
  // Once an actual child packet is present but unconfirmed, no qualified state preview may be displayed.
  await expect(stateSummary(active)).toHaveCount(0);
}
export async function confirm(page: Page, id: string) {
  await page.getByRole('button', { name: parentConfirm, exact: true }).click();
  await expect.poll(async () => (await saved(page, id)).sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).toBe(true);
  await page.getByRole('button', { name: residentCreditConfirmLabel, exact: true }).click();
  await expect.poll(async () => (await packet(page, id)).sourceFactsConfirmed).toBe(true);
  expect((await saved(page, id)).sectionData['state-return']?.ohioResidency?.sourceFactsConfirmed).toBe(true);
}
export async function typeOriginals(page: Page, facts: ReturnType<typeof guidedResidentCreditFixture>) {
  for (const name of ['Review actual Virginia payments', 'Review actual Virginia received refunds']) await page.getByRole('button', { name, exact: true }).click();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add actual Virginia service period', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add actual Virginia payment record', exact: true }).click();
  await page.getByRole('button', { name: 'Add actual Virginia received refund record', exact: true }).click();
  for (const i of [2, 3]) await page.getByRole('button', { name: `Add actual bank and agency originals for Virginia payment ${i}`, exact: true }).click();
  // Reviewed raw fixture is a factual entry inventory, not an output or calculation oracle.
  for (const [label, , value] of residentCreditNativeFields(facts)) await enter(page, label, value === '100000' ? '100,000' : value === '2500' ? '2,500' : value);
}
export function pin(draft: OhioResidentCreditDraft, cohort: Cohort, reference: string) {
  expect(draft.sourceTaxYear).toBe('2025'); expect(draft.sourceFactsConfirmed).toBe(true);
  expect(draft.paymentsReviewed).toBe(true); expect(draft.refundsReviewed).toBe(true);
  expect(draft.originalW2).toBeDefined(); expect(draft.originalFederalSources).toBeDefined();
  expect(draft.originalResidentCreditSourcePacket).toBeDefined();
  const rows = required(draft.completedAccount.payments);
  expect(rows).toHaveLength(3);
  expect(required(rows[0]).amount.replaceAll(',', '')).toBe('1200');
  for (const [index, trace, posting] of [[1, '091000011000001', 'VA-2026-POST-70001'], [2, '091000011000002', 'VA-2026-POST-70002']] as const) {
    const row = required(rows[index]), proof = required(row.transactionOriginals);
    expect(row.amount.replaceAll(',', '')).toBe(cash[cohort].transfer);
    expect(proof.bankTransferOriginal.achTraceNumber).toBe(trace);
    expect(proof.agencyPostingOriginal.postingId).toBe(posting);
    expect(proof.bankTransferOriginal.settlementDate).toBe('2026-02-16');
    expect(proof.agencyPostingOriginal.postingDate).toBe('2026-02-17');
  }
  expect(required(rows[1]).sourceReference).toBe(reference);
  expect(required(draft.completedAccount.refunds)[0]?.amount.replaceAll(',', '')).toBe('700.00');
  const canonical = required(draft.originalResidentCreditSourcePacket);
  expect(canonical.sourceTaxYear).toBe(2025); expect(canonical.filedReturn.federalAgi).toBe('100000');
  expect(canonical.filedReturn.incomeTaxBeforeCredits).toBe(cohort === 'cents' ? '2500.5' : '2500');
  expect(canonical.completedAccount.unappliedPayments).toBe('0');
}
export async function geometry(page: Page, info: TestInfo, phase: string, scope: Locator, anchor: Locator) {
  await expect(scope).toHaveCount(1); await anchor.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })); await expect(anchor).toBeVisible();
  const bounds = await scope.evaluate(root => {
    const issues: Array<{ tag: string; left: number; right: number }> = [];
    for (const node of [root, ...root.querySelectorAll('label,input,select,button,fieldset,[role="alert"]')]) {
      const box = node.getBoundingClientRect();
      if (box.width && box.height && getComputedStyle(node).visibility !== 'hidden' && (box.left < -1 || box.right > innerWidth + 1)) issues.push({ tag: node.tagName, left: box.left, right: box.right });
    }
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, issues };
  });
  const usable = await anchor.evaluate(node => {
    const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { top: box.top, bottom: box.bottom, height: innerHeight, uncovered: hit === node || Boolean(hit && node.contains(hit)) };
  });
  await writeFile(info.outputPath(`${phase}-geometry.json`), JSON.stringify({ bounds, usable }, null, 2));
  await page.screenshot({ path: info.outputPath(`${phase}.png`) });
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width); expect(bounds.issues).toEqual([]);
  expect(usable.top).toBeGreaterThanOrEqual(-1); expect(usable.bottom).toBeLessThanOrEqual(usable.height + 1); expect(usable.uncovered).toBe(true);
}

type PdfFacts = { pages: string[]; fields: number; widgets: number; actions: number; annotations: number; resolved: number; streams: string; strings: string[]; stringObjects: number; metadata: string };
// Independent strict structural traversal; no PDF author products or calculations called here.
const strictReader = String.raw`from pypdf import PdfReader
from pypdf.generic import DictionaryObject,ArrayObject,IndirectObject,StreamObject,TextStringObject,ByteStringObject
import json,sys
r=PdfReader(sys.argv[1],strict=True)
seen=set();counts={'actions':0,'resolved':0,'stringObjects':0};streams=[];strings=[]
def walk(v):
 if isinstance(v,IndirectObject):
  key=(v.idnum,v.generation)
  if key in seen:return
  seen.add(key);counts['resolved']+=1
  target=v.get_object()
  if target is None:raise ValueError('Unresolved indirect PDF object '+str(key))
  walk(target);return
 if isinstance(v,TextStringObject):
  counts['stringObjects']+=1;strings.append(str(v));return
 if isinstance(v,ByteStringObject):
  counts['stringObjects']+=1;raw=bytes(v);strings.append(raw.decode('latin1'))
  for encoding in ['utf-8','utf-16','utf-16-be','utf-16-le']:
   try:strings.append(raw.decode(encoding))
   except UnicodeError:pass
  return
 if isinstance(v,DictionaryObject):
  for k,x in v.items():
   if str(k) in ['/A','/AA','/OpenAction','/JS','/JavaScript','/Launch','/SubmitForm']:counts['actions']+=1
   walk(x)
  if isinstance(v,StreamObject):streams.append(v.get_data().decode('latin1'))
 elif isinstance(v,ArrayObject):
  for x in v:walk(x)
for generation,objects in r.xref.items():
 for obj in objects:
  if obj:walk(IndirectObject(obj,generation,r))
for obj in r.xref_objStm:walk(IndirectObject(obj,0,r))
pages=[p.extract_text() or '' for p in r.pages]
annotations=[a.get_object() for p in r.pages for a in p.get('/Annots',[])]
print(json.dumps({'pages':pages,'fields':len(r.get_fields() or {}),'widgets':sum(a.get('/Subtype')=='/Widget' for a in annotations),'annotations':len(annotations),'actions':counts['actions'],'resolved':counts['resolved'],'streams':'\n'.join(streams),'strings':strings,'stringObjects':counts['stringObjects'],'metadata':str(r.metadata)}))`;
function block(text: string, title: string) {
  const start = text.indexOf(title + '\nREFERENCE SUMMARY ONLY'); expect(start, title).toBeGreaterThanOrEqual(0);
  const tail = text.slice(start), next = tail.slice(title.length).search(/Ohio [^\n]+\nREFERENCE SUMMARY ONLY/);
  return next < 0 ? tail : tail.slice(0, title.length + next);
}
function line(text: string, id: string, value: string) {
  const rows = [...text.matchAll(/Line ([^:\n]+): ([\s\S]*?)\nValue: ([^\n]+)/g)].filter(match => match[1] === id);
  expect(rows, `actual reference line ${id}`).toHaveLength(1); expect(required(rows[0])[3]?.trim()).toBe(value);
}
export async function reviewDownload(page: Page, info: TestInfo, cohort: Cohort, phase: 'initial' | 'reopened') {
  const endpoint = new URL('/api/workspace/filled-return', page.url()).href;
  const disclosure = 'Download an experimental reference PDF for the forms and reference summaries we currently generate. It is not filing-ready, may omit supporting schedules or e-file checks, and Social Security numbers are redacted by design.';
  await expect(page.getByText(disclosure, { exact: true })).toBeVisible();
  const responseWait = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'POST');
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
  const response = await responseWait;
  expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('application/pdf');
  expect(response.headers()['x-tax-engine-export-purpose']).toBe('review'); expect(response.headers()['cache-control']).toContain('no-store');
  const included = required(response.headers()['x-tax-engine-included-forms']).split(',');
  for (const name of ['oh-it-1040-reference.pdf', 'oh-schedule-credits-reference.pdf', 'oh-resident-credit-reference.pdf']) expect(included).toContain(name);
  expect(included).not.toContain('oh-it-nrc-reference.pdf');
  const file = info.outputPath(`${phase}-actual-resident-credit-review.pdf`);
  await (await downloadWait).saveAs(file);
  const bytes = await readFile(file); expect(bytes).toEqual(await response.body());
  const parsed = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', strictReader, file], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 })) as PdfFacts;
  expect(parsed.pages.length).toBeGreaterThan(2); expect(parsed.resolved).toBeGreaterThan(0);
  expect(parsed.fields).toBe(0); expect(parsed.widgets).toBe(0); expect(parsed.actions).toBe(0); expect(parsed.annotations).toBe(0);
  for (const text of parsed.pages) expect(text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
  const text = parsed.pages.join('\n'), combined = text + '\n' + parsed.streams + '\n' + parsed.strings.join('\n') + '\n' + parsed.metadata;
  expect(text).toContain('It is not an official filled Ohio filing form.');
  for (const secret of [...personalSecrets, changedReference, 'originalResidentCreditSourcePacket', 'originalFederalSources']) expect(combined.includes(secret), 'Personal/source identifier absent from all decoded PDF objects').toBe(false);
  const it = block(text, 'Ohio IT 1040'), rc = block(text, 'Ohio Resident Credit'), expected = cash[cohort];
  for (const [id, value] of [['1', '100000'], ['3', '100000'], ['9', expected.credit], ['10', expected.tax], ['14', '2000'], ['26', expected.refund]]) line(it, id, value);
  for (const [id, value] of [['1', '60000'], ['2', expected.credit], ['3', '100000'], ['4', '0.6'], ['5', '2323'], ['6', '1394'], ['7', expected.credit]]) line(rc, id, value);
  const projection = { credit: expected.credit, tax: expected.tax, payments: '2000', requestedRefund: expected.refund, limit: '1394', referenceOnly: true };
  const report = { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, included, pages: parsed.pages.length, resolvedObjects: parsed.resolved, standaloneStringObjects: parsed.stringObjects, decodedStandaloneStringCandidates: parsed.strings.length, fields: parsed.fields, widgets: parsed.widgets, actions: parsed.actions, annotations: parsed.annotations, projection, purpose: 'review', filingQualified: false };
  await writeFile(info.outputPath(`${phase}-actual-review-evidence.json`), JSON.stringify(report, null, 2));
  return { endpoint, projection };
}
export async function openWorkspace(page: Page) {
  await page.locator('.guided-nav').getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.guided-nav').getByRole('button', { name: 'Open Full Return', exact: true }).click();
  await expect(page.locator('.guided-interview-shell')).toHaveCount(0);
}
