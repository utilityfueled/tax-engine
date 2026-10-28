// Spec: spec/federal/qbi-loss-review.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_8995_FIELDS as F } from '@/pdf/fill-form-8995.js';
import { buildQbiLossReview, fillQbiLossReview } from '@/pdf/mappings/2025/qbi-loss-review.js';
import { prepareQbiLossReview, qbiLossReviewOriginalSourceInput, type PreparedQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { k1QbiLossSourceInput } from '../fixtures/k1-qbi-loss-sources.js';
import { actualEblNolInput } from '../fixtures/qbi-ebl-nol.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

function inspect(path: string): { pages: string[]; fields: Record<string, string>; widgets: { name: string; value: string; appearance: boolean }[] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);widgets=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  w=ref.get_object()
  if w.get('/Subtype')!='/Widget':continue
  node=w;names=[];value=None
  while node:
   if node.get('/T'):names.insert(0,str(node.get('/T')))
   if value is None and '/V' in node:value=str(node.get('/V'))
   parent=node.get('/Parent');node=parent.get_object() if parent else None
  ap=w.get('/AP',{}).get('/N');appearance=bool(ap and (ap.get_object().get_data() if hasattr(ap.get_object(),'get_data') else ap))
  widgets.append({'name':'.'.join(names),'value':value or '', 'appearance':appearance})
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages], 'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'widgets':widgets}))
`, path], { encoding: 'utf8', timeout: 10000 }));
}
function ebl() {
  const input = actualEblNolInput(), regular = input.netOperatingLoss!.vintages![0], history = input.qbiLossSources!.excessBusinessLossHistories![0];
  regular.openingCarryforward = '100000'; regular.history = []; history.originalNol = structuredClone(regular);
  history.qualifiedOpeningCarryforward = '80000'; history.history = []; input.priorYear = { ...input.priorYear, shortTermCapitalLoss: '-3000' };
  return input;
}
it('retains a completed prior QBI carry without a K1 source packet', async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, priorYear: { qbiLossCarryforward: '2000' } });
  const result = calculateFederalTax(input), dir = mkdtempSync(join(tmpdir(), 'tax-qbi-prior-carry-'));
  expect(result.form8995?.qbiDeduction.toFixed()).toBe('0');
  expect(result.form8995?.qbiLossCarryforward.toFixed()).toBe('2000');
  expect(input.qbiLossSources).toBeUndefined();
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir });
    const physical = packet.filledForms.find(path => path.endsWith('/f8995-filled.pdf'));
    if (!physical) throw new Error('Missing completed prior-QBI-carry form');
    const form = inspect(physical);
    expect(form.fields[F.line3]).toBe('2000'); expect(form.fields[F.line4]).toBe('0'); expect(form.fields[F.line16]).toBe('2000');
    expect(packet.filledForms.some(path => path.endsWith('/qbi-loss-reference-filled.pdf'))).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('prints the physical REIT and PTP zero floor without losing its carry', async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleK1: [{
    partnershipName: 'Existing PTP source', partnershipEIN: '12-3456789', ordinaryIncome: '0',
    section199AQualifiedPTPIncome: '-2000', isPassiveActivity: false,
  }] });
  const result = calculateFederalTax(input), dir = mkdtempSync(join(tmpdir(), 'tax-qbi-ptp-carry-'));
  expect(result.form8995?.reitPTPAmount.toFixed()).toBe('-2000');
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir });
    const physical = packet.filledForms.find(path => path.endsWith('/f8995-filled.pdf'));
    if (!physical) throw new Error('Missing completed REIT/PTP loss form');
    const form = inspect(physical);
    expect(form.fields[F.line6]).toBe('(2000)'); expect(form.fields[F.line8]).toBe('0'); expect(form.fields[F.line17]).toBe('2000');
    expect(form.widgets.find(row => row.name === F.line8)).toMatchObject({ value: '0', appearance: true });
    expect(result.form8995?.reitPTPAmount.toFixed()).toBe('-2000');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('retains a saved zero-deduction QBI packet and separate loss limits', async () => {
  const input = k1QbiLossSourceInput(), result = calculateFederalTax(input), context = prepareQbiLossReview(input);
  expect(result.form8995?.qbiDeduction.toFixed()).toBe('0');
  const dir = mkdtempSync(join(tmpdir(), 'tax-qbi-packet-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, qbiLossReview: context });
    const physical = packet.filledForms.find(path => path.endsWith('/f8995-filled.pdf'));
    const reference = packet.filledForms.find(path => path.endsWith('/qbi-loss-reference-filled.pdf'));
    if (!physical || !reference) throw new Error('Missing completed zero-deduction QBI packet');
    const form = inspect(physical), pages = inspect(reference).pages;
    expect(form.fields[F.business1QBI]).toBe('(48000)'); expect(form.fields[F.line2]).toBe('(48000)');
    expect(form.fields[F.line4]).toBe('0'); expect(form.fields[F.line16]).toBe('48000');
    expect(form.widgets.find(row => row.name === F.line4)).toMatchObject({ value: '0', appearance: true });
    expect(form.widgets.find(row => row.name === F.line16)).toMatchObject({ value: '48000', appearance: true });
    expect(form.fields[F.ssn]).toBe('');
    const text = pages.join(' ');
    expect(text).toContain('Activity 1, primary taxpayer'); expect(text).toContain('Current QBI after loss limits: $-48000');
    expect(text).toContain('465, origin 2025: suspended $40000; qualified $32000');
    expect(text).toContain('Ordinary QBI loss carryforward: $48000');
    expect(text).toContain('Independent regular NOL source history was not supplied.');
    expect(text).not.toContain('Regular NOL carryforward: $0');
    expect(text).toContain('Independent AMT NOL source history was not supplied.');
    for (const page of [...form.pages, ...pages]) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const flat = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: true, qbiLossReview: context });
    expect(inspect(flat.filledForms.find(path => path.endsWith('/f8995-filled.pdf'))!).widgets).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('keeps actual regular EBL deduction distinct from modified absorption and carry', async () => {
  const input = ebl(), result = calculateFederalTax(input), rows = buildQbiLossReview(input, result);
  expect(rows.join(' ')).toContain('Actual regular NOL deduction: $65000; qualified current deduction: $52000');
  expect(rows.join(' ')).toContain('Modified absorption: $67400; qualified absorption: $53920');
  expect(rows.join(' ')).toContain('Remaining regular carry: $32600; qualified remaining carry: $26080');
  expect(rows.join(' ')).toContain('Ordinary QBI loss carryforward: $52000');
  expect(rows.join(' ')).toContain('Independent AMT NOL carryforward: $0');
  const dir = mkdtempSync(join(tmpdir(), 'tax-qbi-ebl-packet-'));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir: dir, qbiLossReview: prepareQbiLossReview(input) });
    const physical = packet.filledForms.find(path => path.endsWith('/f8995-filled.pdf'));
    const reference = packet.filledForms.find(path => path.endsWith('/qbi-loss-reference-filled.pdf'));
    if (!physical || !reference) throw new Error('Missing actual EBL source packet');
    expect(inspect(physical).fields[F.line3]).toBe('52000'); expect(inspect(physical).fields[F.line16]).toBe('52000');
    expect(inspect(reference).pages.join(' ')).toContain('Modified absorption: $67400; qualified absorption: $53920');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('shows current461 character separately from the ordinary QBI carry', () => {
  const input = k1QbiLossSourceInput(), k1 = input.scheduleK1[0], source = input.qbiLossSources!.activities![0];
  Object.assign(k1, { ordinaryIncome: '-330000', section199AQBI: '-264000', beginningBasis: '500000' });
  Object.assign(k1.form6198!, { ordinaryIncome: '-330000', priorYearAmountAtRisk: '500000' });
  Object.assign(source.statement!, { ordinaryIncome: '-330000', section199AQBI: '-264000' });
  source.basis!.beginningBasis = '500000'; source.atRisk!.priorYearAmountAtRisk = '500000';
  input.qbiLossSources!.form461Classification = { sourceTaxYear: 2025, sourceReference: 'Actual complete business classification', sourceFactsConfirmed: true,
    method: 'ordinary_k1_only', allNonEmployeeBusinessSourcesIncluded: true, capitalIncomeIsNonbusiness: true, otherBusinessIncome: '0', otherBusinessDeductions: '0' };
  const rows = buildQbiLossReview(input, calculateFederalTax(input)).join(' ');
  expect(rows).toContain('Current QBI after loss limits: $-250400');
  expect(rows).toContain('461(l), origin 2025: suspended $17000; qualified $13600');
  expect(rows).toContain('Current section461 regular NOL origin: $17000');
  expect(rows).toContain('Independent regular NOL source history was not supplied.');
  expect(rows).toContain('Ordinary QBI loss carryforward: $250400');
});
it('binds original identity and every retained loss ledger before redaction', () => {
  const input = k1QbiLossSourceInput(), result = calculateFederalTax(input), context = prepareQbiLossReview(input);
  const original = qbiLossReviewOriginalSourceInput(input, result, context); original.scheduleK1[0].partnershipName = 'Changed clone';
  expect(qbiLossReviewOriginalSourceInput(input, result, context).scheduleK1[0].partnershipName).toBe('Actual ordinary activity');
  for (const change of [(x: typeof input) => { x.scheduleK1[0].partnershipEIN = '98-7654321'; },
    (x: typeof input) => { x.qbiLossSources!.sourceReference = 'Equal-money replacement'; },
    (x: typeof input) => { x.scheduleK1[0].ordinaryIncome = '-99999.99'; },
    (x: typeof input) => { x.qbiLossSources = undefined; }]) {
    const changed = structuredClone(input); change(changed); expect(() => buildQbiLossReview(changed, result, context)).toThrow(/stale|conflicting/);
  }
  expect(() => buildQbiLossReview(redactReviewIdentifiers(input), result, {} as PreparedQbiLossReview)).toThrow(/original prepared/);
  expect(() => buildQbiLossReview(redactReviewIdentifiers(input), result)).toThrow();
  expect(() => buildQbiLossReview(input, { ...result, agi: result.agi.plus(1) }, context)).toThrow(/calculation/);
  expect(() => buildQbiLossReview(input, { ...result, carryforwards: { ...result.carryforwards, qbiLossCarryforward: d(0) } }, context)).toThrow(/calculation/);
  const altered = { ...result, allLines: result.allLines.map(row => row.form === 'QBI Loss Character' ? { ...row, value: d(0) } : row) };
  expect(() => buildQbiLossReview(input, altered, context)).toThrow(/calculation/);
  expect(() => buildQbiLossReview(input, result, JSON.parse(JSON.stringify(context)) as PreparedQbiLossReview)).toThrow(/original prepared/);
  const prior = ebl(), priorResult = calculateFederalTax(prior), priorContext = prepareQbiLossReview(prior);
  if (!priorResult.qbiEblNol) throw new Error('Missing EBL calculation');
  expect(() => buildQbiLossReview(prior, { ...priorResult, qbiEblNol: { ...priorResult.qbiEblNol,
    vintages: priorResult.qbiEblNol.vintages.map(row => ({ ...row, qualifiedRemainingCarryforward: d(1) })) } }, priorContext)).toThrow(/calculation/);
});
it('paginates actual activities without leaking private source identifiers', async () => {
  const input = k1QbiLossSourceInput(), k1 = input.scheduleK1[0], facts = input.qbiLossSources!.activities![0], prior = input.priorYear!.suspendedPassiveLosses[0];
  input.scheduleK1 = []; input.qbiLossSources!.activities = []; input.priorYear!.suspendedPassiveLosses = [];
  for (let index = 0; index < 8; index++) {
    const name = `Private activity ${index}`, ein = `12-${String(index + 1).padStart(7, '0')}`;
    const next = structuredClone(k1), source = structuredClone(facts);
    Object.assign(next, { partnershipName: name, partnershipEIN: ein, ordinaryIncome: '-1000.10', section199AQBI: '-800.08' });
    Object.assign(next.form6198!, { activityName: name, ordinaryIncome: '-1000.10', priorYearAmountAtRisk: '600' });
    Object.assign(source, { k1SourceId: `scheduleK1:${index}`, entityName: name, entityEIN: ein });
    Object.assign(source.statement!, { ordinaryIncome: '-1000.10', section199AQBI: '-800.08' }); source.atRisk!.priorYearAmountAtRisk = '600';
    input.scheduleK1.push(next); input.qbiLossSources.activities.push(source); input.priorYear.suspendedPassiveLosses.push({ ...structuredClone(prior), partnershipName: name });
  }
  const before = JSON.stringify(input), result = calculateFederalTax(input), context = prepareQbiLossReview(input), dir = mkdtempSync(join(tmpdir(), 'tax-qbi-pages-'));
  try {
    const doc = await fillQbiLossReview(redactReviewIdentifiers(input), redactReviewIdentifiers(result), context);
    const path = join(dir, 'reference.pdf'); writeFileSync(path, await doc.save()); const saved = inspect(path), text = saved.pages.join(' ');
    expect(saved.pages.length).toBeGreaterThan(2); expect(text.match(/Activity \d+, primary taxpayer/g)).toHaveLength(8);
    expect(text).toContain('Original ordinary income or loss: $-1000.10'); expect(text).toContain('Original section199A QBI: $-800.08');
    for (const secret of ['123456789', '6789', '12-0000001', 'Private activity', 'Original K1 and199A attachment', 'Actual year-end outside-basis worksheet']) expect(text).not.toContain(secret);
    for (const page of saved.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    expect(saved.widgets).toEqual([]); expect(JSON.stringify(input)).toBe(before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('retains year and filing restrictions for loss review', async () => {
  const input = k1QbiLossSourceInput(), result = calculateFederalTax(input);
  expect(() => buildQbiLossReview({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 })).toThrow(/2026|year/);
  await expect(fillReturn(input, result, { purpose: 'filing', blankFormsDir: 'forms/blank/2025', outputDir: '/unused' })).rejects.toThrow(/filing|qualified/i);
});
