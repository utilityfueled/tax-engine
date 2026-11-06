// Spec: spec/federal/form-8862-review.yaml. Explicit fictional sources.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8862, FORM_8862_FIELDS as F } from '@/pdf/fill-form-8862.js';
import { fillScheduleEIC, SCHEDULE_EIC_FIELDS as S } from '@/pdf/fill-schedule-eic.js';
import { fillForm1040 } from '@/pdf/fill-form-1040.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareEicReview, eicReviewOriginalSourceInput, type PreparedEicReview } from '@/pdf/eic-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { source, packet, filer, denial, child, home, known } from '../fixtures/form-8862.js';
import { form8862ReviewInput } from '../fixtures/form-8862-review.js';
const template = 'forms/blank/2025/f8862.pdf';
it('uses actual current child presence for printed claimant restrictions', async () => {
  const current = source(); child(current, false);
  current.taxpayer.primary.dateOfBirth = '2003-02-01'; known(filer(current).originalTaxpayer).dateOfBirth = '2003-02-01';
  known(known(current.eic?.claimantEligibility).primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = false;
  let input = form8862ReviewInput(current), result = calculateFederalTax(input);
  expect(result.scheduleEIC?.form8862?.ssnCountedChildSourceIds).toEqual([]); expect(result.earnedIncomeCredit.toFixed()).toBe('649');
  let form = (await PDFDocument.load(await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save())).getForm();
  expect(form.getCheckBox('topmostSubform[0].Page2[0].c2_13[0]').isChecked()).toBe(false);
  expect(form.getCheckBox('topmostSubform[0].Page1[0].c1_5[0]').isChecked()).toBe(false);
  known(current.eic?.claimantEligibility).primaryQualifyingChildOfAnotherTaxpayer = true;
  input = form8862ReviewInput(current); result = calculateFederalTax(input); expect(result.earnedIncomeCredit.toFixed()).toBe('0');
  form = (await PDFDocument.load(await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save())).getForm();
  expect(form.getCheckBox('topmostSubform[0].Page2[0].c2_13[0]').isChecked()).toBe(true);
  known(current.eic?.claimantEligibility).primaryQualifyingChildOfAnotherTaxpayer = false;
  current.taxpayer.dependents = []; packet(current).children = [];
  known(known(current.eic?.claimantEligibility).primaryChildless).mainHomeInUnitedStatesMoreThanHalfYear = true;
  input = form8862ReviewInput(current); result = calculateFederalTax(input); expect(result.earnedIncomeCredit.toFixed()).toBe('0');
  form = (await PDFDocument.load(await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save())).getForm();
  expect(form.getCheckBox('topmostSubform[0].Page2[0].c2_13[0]').isChecked()).toBe(true);
  const candidate = child(current); candidate.livedWithTaxpayerInUnitedStatesMoreThanHalfYear = false; candidate.homeDays = home(180);
  known(current.taxpayer.dependents[0]).qualifiesForEIC = true;
  input = form8862ReviewInput(current); result = calculateFederalTax(input);
  expect(result.scheduleEIC?.form8862?.qualifyingChildPresent).toBe(false); expect(result.earnedIncomeCredit.toFixed()).toBe('0');
  form = (await PDFDocument.load(await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save())).getForm();
  expect(form.getCheckBox('topmostSubform[0].Page2[0].c2_13[0]').isChecked()).toBe(true);
  // The income-only shortcut may leave current child sources unknown. The
  // actual legacy child path still applies, rather than an invented empty list.
  known(denial(current)).reason = 'income_only'; delete packet(current).children; delete packet(current).allCandidateChildrenIncluded;
  input = form8862ReviewInput(current); result = calculateFederalTax(input); expect(result.earnedIncomeCredit.toFixed()).toBe('3409');
  form = (await PDFDocument.load(await (await fillForm1040(input, result, 'forms/blank/2025/f1040.pdf')).save())).getForm();
  expect(form.getCheckBox('topmostSubform[0].Page2[0].c2_13[0]').isChecked()).toBe(false);
});
it('maps the income-only shortcut and both actual claimant rows', async () => {
  const current = source(true); known(denial(current)).reason = 'income_only'; delete packet(current).children; delete packet(current).allCandidateChildrenIncluded;
  for (const row of known(packet(current).filers)) delete row.homeDays;
  let input = form8862ReviewInput(current), result = calculateFederalTax(input);
  let form = (await PDFDocument.load(await (await fillForm8862(input, result, template)).save())).getForm();
  expect(form.getTextField(F.line1).getText()).toBe('2025'); expect(form.getCheckBox(F.line2Eic).isChecked()).toBe(true);
  expect(form.getCheckBox(F.line2ChildCredits).isChecked()).toBe(false); expect(form.getCheckBox(F.line2Aotc).isChecked()).toBe(false);
  expect(form.getCheckBox(F.line3Yes).isChecked()).toBe(true); expect(form.getCheckBox(F.line4No).isChecked()).toBe(false);
  expect(form.getTextField(F.line9a).getText() ?? '').toBe(''); expect(form.getTextField(F.line10a).getText() ?? '').toBe('');
  const joint = source(true); known(joint.taxpayer.spouse).dateOfBirth = '1984-04-01'; known(filer(joint, 1).originalTaxpayer).dateOfBirth = '1984-04-01';
  filer(joint, 1).homeDays = home(183); input = form8862ReviewInput(joint); result = calculateFederalTax(input);
  form = (await PDFDocument.load(await (await fillForm8862(input, result, template)).save())).getForm();
  expect(form.getTextField(F.line9a).getText()).toBe('365'); expect(form.getTextField(F.line9b).getText()).toBe('183');
  expect(form.getTextField(F.line10a).getText()).toBe('40'); expect(form.getTextField(F.line10b).getText()).toBe('41');
  expect(form.getCheckBox(F.line11aNo).isChecked()).toBe(true); expect(form.getCheckBox(F.line11bNo).isChecked()).toBe(true);
});
it('retains actual birth death days and required evidence alongside the printed child convention', async () => {
  const current = source(); const row = child(current, false), original = known(current.taxpayer.dependents[0]);
  original.dateOfBirth = '2025-10-01'; original.monthsLivedWithYou = 2; Object.assign(known(row.original), { dateOfBirth: original.dateOfBirth, monthsLivedWithYou: 2 });
  row.deathDate = '2025-11-30'; row.specialResidencePeriodClaimed = true; row.homeDays = home(31);
  row.bornAndDeceasedRecord = { sourceReference: 'Fictional confidential live birth reference', recordType: 'hospital_record', showsLiveBirth: true, copyAvailableForReturnAttachment: true };
  const input = form8862ReviewInput(current), before = JSON.stringify(input), result = calculateFederalTax(input), context = prepareEicReview(input), rendering = redactReviewIdentifiers(input);
  const doc = await fillForm8862(rendering, redactReviewIdentifiers(result), template, context);
  const form = (await PDFDocument.load(await doc.save())).getForm();
  expect(form.getTextField(F.childNames[0]).getText()).toBe('Alex Example'); expect(form.getTextField(F.childDays[0]).getText()).toBe('365');
  expect(form.getTextField(F.childBirth[0][0]).getText()).toBe('10'); expect(form.getTextField(F.childBirth[0][1]).getText()).toBe('01');
  expect(form.getTextField(F.childDeath[0][0]).getText()).toBe('11'); expect(form.getTextField(F.childDeath[0][1]).getText()).toBe('30');
  const schedule = (await PDFDocument.load(await (await fillScheduleEIC(rendering, redactReviewIdentifiers(result), 'forms/blank/2025/f1040sei.pdf', context)).save())).getForm();
  expect(schedule.getTextField(S.child1SSN).getText()).toBe('Died'); expect(schedule.getTextField(S.child1Months).getText()).toBe('12');
  const dir = await mkdtemp(join(tmpdir(), 'actual-8862-review-'));
  try {
    const path = join(dir, '8862.pdf'); await writeFile(path, await doc.save());
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);fields=r.get_fields();widgets=[]
for p in r.pages:
 for ref in p.get('/Annots',[]):
  a=ref.get_object()
  if a.get('/Subtype')!='/Widget':continue
  n=a if '/T' in a else a['/Parent'].get_object()
  if n.get('/T') in ('f1_04[0]','f1_07[0]'):widgets.append({'name':str(n['/T']),'value':str(n.get('/V','')),'appearance':bool(a.get('/AP',{}).get('/N'))})
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in fields.items()},'widgets':widgets}))`, path], { encoding: 'utf8', timeout: 30_000 }));
    expect(checked.fields[F.childDays[0]]).toBe('365'); expect(checked.widgets).toContainEqual({ name: 'f1_07[0]', value: '365', appearance: true });
    expect(checked.pages).toHaveLength(4); for (const page of checked.pages) expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');
    expect(checked.pages[3]).toContain('actual 31 days'); expect(checked.pages[3]).toContain('printed 365 days');
    expect(checked.pages[3]).toContain('Attach the actual live-birth document copy');
    for (const secret of [input.taxpayer.primary.ssn, input.taxpayer.primary.ssn.replaceAll('-', ''), 'dependent:0', 'Fictional confidential live birth reference']) expect(checked.pages.join('\n')).not.toContain(secret);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('rejects changed current sources and forged printed results before PDF IO', async () => {
  const input = form8862ReviewInput(), result = calculateFederalTax(input), context = prepareEicReview(input), rendering = redactReviewIdentifiers(input);
  const clone = eicReviewOriginalSourceInput(rendering, result, context); known(clone.eic?.recertificationSources).sourceReference = 'Private mutation';
  expect(eicReviewOriginalSourceInput(rendering, result, context).eic?.recertificationSources?.sourceReference).not.toBe('Private mutation');
  for (const mutate of [(next: typeof rendering) => { known(next.eic?.recertificationSources).sourceTaxYear = 2024; },
    (next: typeof rendering) => { known(known(next.eic?.recertificationSources).filers?.[0]?.homeDays).actualUnitedStatesDays = 364; },
    (next: typeof rendering) => { delete known(next.eic).recertificationSources; },
    (next: typeof rendering) => { known(next.eic?.disallowanceSources).sourceReference = 'Changed actual history'; }]) {
    const next = structuredClone(rendering); mutate(next); await expect(fillForm8862(next, result, '/missing.pdf', context)).rejects.toThrow(/stale|conflict/);
  }
  for (const mutate of [(next: typeof result) => { known(next.scheduleEIC?.form8862).physical.line3IncomeOnly = true; },
    (next: typeof result) => { known(next.allLines.find(row => row.form === '8862')).value = new Decimal(0); }]) {
    const next = calculateFederalTax(input); mutate(next); await expect(fillForm8862(rendering, next, '/missing.pdf', context)).rejects.toThrow(/retained calculation/);
  }
  await expect(fillForm8862(rendering, result, '/missing.pdf', JSON.parse(JSON.stringify(context)) as PreparedEicReview)).rejects.toThrow(/prepared context/);
  const removed = structuredClone(input); delete known(removed.eic).recertificationSources;
  await expect(fillReturn(removed, result, { blankFormsDir: '/missing', outputDir: '/missing' })).rejects.toThrow(/original.*sources/);
});
it('includes current recertification only for an actual required positive claim', async () => {
  const current = source(), input = form8862ReviewInput(current), result = calculateFederalTax(input);
  const dir = await mkdtemp(join(tmpdir(), 'current-8862-packet-'));
  try {
    let packetResult = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
    expect(packetResult.filledForms.some(path => path.endsWith('f8862-filled.pdf'))).toBe(true);
    known(known(current.eic?.disallowanceSources).filers?.[0]).denials = [];
    const noRequired = form8862ReviewInput(current);
    packetResult = await fillReturn(noRequired, calculateFederalTax(noRequired), { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false });
    expect(packetResult.filledForms.some(path => path.endsWith('f8862-filled.pdf'))).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
