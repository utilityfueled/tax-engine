// Spec: spec/federal/form-8839-history-review.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm8839, FORM_8839_FIELDS as F } from '@/pdf/fill-form-8839.js';
import { FORM_1040_FIELDS } from '@/pdf/fill-form-1040.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { prepareAdoptionReview, type PreparedAdoptionReview } from '@/pdf/adoption-review-context.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { foreignAdoptionHistoryChild } from '../fixtures/form-8839-prior-benefits.js';

const blank = 'forms/blank/2025/f8839.pdf';
function actual(current = '2000', prior = '8000') {
  const child = foreignAdoptionHistoryChild(); child.employerBenefits = current; child.priorYearForeignBenefits = prior;
  if (!child.priorYearForeignBenefitHistory?.records?.[0]) throw new Error('Missing synthetic history');
  child.priorYearForeignBenefitHistory.records[0].originalEmployerBenefits = prior;
  child.priorYearForeignBenefitHistory.records[0].benefitsAllocatedToChild = prior;
  const payroll = d('100000').plus(current);
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, firstName: 'Jordan', lastName: 'Example' } },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2025, accountHolder: 'primary', wages: '100000', box12CodeT: current,
      socialSecurityWages: payroll.toFixed(), socialSecurityWithheld: payroll.times('.062').toFixed(),
      medicareWages: payroll.toFixed(), medicareWithheld: payroll.times('.0145').toFixed() }],
    form8839: { eligibilityConfirmed: true, children: [child], exclusionMagi: payroll.toFixed(),
      foreignEarnedIncomeExclusion: '0', foreignHousingExclusion: '0', possessionIncomeExclusion: '0', carryforwards: [] },
  });
}
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
`, path], { encoding: 'utf8', timeout: 5000 }));
}
it('retains a saved benefits-only packet and distinct physical and signed lines', async () => {
  const input = actual(), result = calculateFederalTax(input);
  expect(result.form8839?.adoptionCredit.toFixed()).toBe('0');
  const dir = mkdtempSync(join(tmpdir(), 'tax-adoption-packet-'));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
    const path = packet.filledForms.find(file => file.endsWith('/f8839-filled.pdf')); expect(path).toBeTruthy();
    if (!path) throw new Error('Missing actual benefits-only form');
    const saved = inspect(path);
    expect(saved.pages).toHaveLength(3);
    expect(saved.fields[F.line22[0]]).toBe('10000'); expect(saved.fields[F.line30]).toBe('10000'); expect(saved.fields[F.line31]).toBe('0');
    expect(saved.fields[F.line20CheckboxYes]).not.toBe('/Off');
    expect(saved.pages[2]).toContain('Historical worksheet line 9: $8000');
    expect(saved.pages[2]).toContain('Signed Form 1040 line 1f: $-8000');
    for (const page of saved.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
    const widget = saved.widgets.find(row => row.name === F.line31); expect(widget).toMatchObject({ value: '0', appearance: true });
    const returnPath = packet.filledForms.find(file => file.endsWith('/f1040-filled.pdf')); if (!returnPath) throw new Error('Missing1040');
    expect(inspect(returnPath).fields[FORM_1040_FIELDS.line1f]).toBe('(8000)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('preserves source cents and private identity through redacted review rendering', async () => {
  const input = actual('100.40', '100.40'), result = calculateFederalTax(input), context = prepareAdoptionReview(input);
  const redacted = redactReviewIdentifiers(input), hidden = redactReviewIdentifiers(result);
  expect(redacted.form8839?.children[0].priorYearForeignBenefitHistory?.childIdentifyingNumberLast4).toBe('');
  const doc = await fillForm8839(redacted, hidden, blank, context);
  const dir = mkdtempSync(join(tmpdir(), 'tax-adoption-private-'));
  try {
    const path = join(dir, 'review.pdf'); writeFileSync(path, await doc.save()); const saved = inspect(path), text = saved.pages.join(' ');
    expect(saved.fields[F.ssn]).toBe(''); expect(saved.fields[F.child1IdNumber]).toBe('');
    expect(saved.fields[F.line22[0]]).toBe('201'); expect(saved.fields[F.line31]).toBe('0');
    expect(text).toContain('Actual prior benefits allocated: $100.40'); expect(text).toContain('Historical worksheet line 9: $101');
    for (const secret of ['123456789', '345678901', '8901', 'fictional-prior-employer-statement', 'Fictional finality-year benefits worksheet', '12-3456789']) expect(text).not.toContain(secret);
    expect(input.form8839?.children[0].priorYearForeignBenefits).toBe('100.40');
    const flattened = await fillReturn(redacted, hidden, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: true, adoptionReview: context });
    const flat = flattened.filledForms.find(file => file.endsWith('/f8839-filled.pdf')); if (!flat) throw new Error('Missing flattened8839');
    expect(inspect(flat).widgets).toEqual([]); expect(readFileSync(flat).length).toBeGreaterThan(1000);
    const tiny = actual('0', '0.10'), tinyResult = calculateFederalTax(tiny);
    const tinyPacket = await fillReturn(tiny, tinyResult, { blankFormsDir: 'forms/blank/2025', outputDir: dir });
    const tinyPath = tinyPacket.filledForms.find(file => file.endsWith('/f8839-filled.pdf')); if (!tinyPath) throw new Error('Missing actual sub-dollar history');
    expect(inspect(tinyPath).pages.join(' ')).toContain('Actual prior benefits allocated: $0.10');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('rejects stale original facts forged contexts and changed transfer audits', async () => {
  const input = actual(), result = calculateFederalTax(input), context = prepareAdoptionReview(input);
  for (const change of [(x: typeof input) => { x.w2s[0].wages = '100001'; }, (x: typeof input) => { x.taxpayer.primary.firstName = 'Changed'; },
    (x: typeof input) => { const h = x.form8839?.children[0].priorYearForeignBenefitHistory; if (h?.records?.[0]) h.records[0].benefitsAllocatedToChild = '7999'; },
    (x: typeof input) => { if (x.form8839) { x.form8839.children[0].priorYearForeignBenefitHistory = undefined; x.form8839.children[0].priorYearForeignBenefits = '0'; } }]) {
    const changed = structuredClone(input); change(changed); await expect(fillForm8839(changed, result, blank, context)).rejects.toThrow(/stale|conflicting/);
  }
  await expect(fillForm8839(redactReviewIdentifiers(input), result, blank, {} as PreparedAdoptionReview)).rejects.toThrow(/original prepared/);
  if (!result.form8839) throw new Error('Missing8839');
  const changedPhysical = { ...result, form8839: { ...result.form8839, taxableEmployerBenefits: d(1) } };
  await expect(fillForm8839(input, changedPhysical, blank, context)).rejects.toThrow(/calculation/);
  const changedTransfer = { ...result, allLines: result.allLines.map(row => row.form === '1040' && row.line === '1f' ? { ...row, value: d(0) } : row) };
  await expect(fillForm8839(input, changedTransfer, blank, context)).rejects.toThrow(/calculation/);
  await expect(fillForm8839(redactReviewIdentifiers(input), redactReviewIdentifiers(result), blank)).rejects.toThrow();
});
it('retains year and filing gates for historical benefit review', async () => {
  const input = actual(), result = calculateFederalTax(input);
  await expect(fillForm8839({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 }, blank)).rejects.toThrow(/2026|year/);
  await expect(fillReturn(input, result, { purpose: 'filing', blankFormsDir: 'forms/blank/2025', outputDir: '/unused' })).rejects.toThrow(/filing|qualified/i);
});
it('paginates complete statements beside an actual zero-history child', async () => {
  const input = actual(), child = input.form8839?.children[0], history = child?.priorYearForeignBenefitHistory;
  if (!input.form8839 || !history?.records?.[0]) throw new Error('Missing original history');
  const statement = history.records[0];
  history.records = Array.from({ length: 80 }, (_, index) => ({ ...statement, sourceId: `private-source-${index}`,
    employerEin: `12-${String(index + 1).padStart(7, '0')}`, originalEmployerBenefits: '100', benefitsAllocatedToChild: '100' }));
  const second = foreignAdoptionHistoryChild(); second.childFirstName = 'Alex'; second.childName = 'Alex Example'; second.childIdentifyingNumber = '456-78-9012';
  second.employerBenefits = '0'; second.priorYearForeignBenefits = '0';
  if (!second.priorYearForeignBenefitHistory) throw new Error('Missing actual zero history');
  Object.assign(second.priorYearForeignBenefitHistory, { childNameOnSource: 'Alex Example', childIdentifyingNumberLast4: '9012', records: [] });
  input.form8839.children.push(second);
  const result = calculateFederalTax(input), doc = await fillForm8839(input, result, blank);
  const dir = mkdtempSync(join(tmpdir(), 'tax-adoption-continuation-'));
  try {
    const path = join(dir, 'review.pdf'); writeFileSync(path, await doc.save()); const saved = inspect(path), text = saved.pages.join(' ');
    expect(saved.pages.length).toBeGreaterThan(4); expect(text.match(/Prior statement \d+, year 2024/g)).toHaveLength(80);
    expect(text).toContain('Child 2: actual current benefits $0.00'); expect(text).toContain('Actual prior benefits allocated: $0.00');
    expect(text).not.toContain('Historical worksheet child 2'); expect(text).toContain('Historical worksheet line 9: $8000');
    for (const page of saved.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
