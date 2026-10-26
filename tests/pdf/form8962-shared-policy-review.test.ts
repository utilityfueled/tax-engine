// Spec: spec/federal/form-8962-shared-policy-review.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { d } from '@/utils/decimal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm8962SharedPolicy, FORM_8962_FIELDS as F, buildForm8962ReferenceSummary, fillForm8962Reference } from '@/pdf/fill-form-8962.js';
import { preparePremiumTaxCreditReview, type PreparedPremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { sharedNoAdvanceFixture } from '../fixtures/shared-no-advance-policy.js';
import { sharedPolicyFixture } from '../fixtures/shared-policy.js';

const blank = 'forms/blank/2025/f8962.pdf';
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
it('maps actual PartIV and monthly values in saved independent-reader fields', async () => {
  const input = sharedPolicyFixture(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const dir = mkdtempSync(join(tmpdir(), 'tax-shared-policy-review-'));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false, premiumTaxCreditReview: prepared });
    const path = packet.filledForms.find(file => file.endsWith('/f8962-filled.pdf')); expect(path).toBeTruthy();
    if (!path) throw new Error('Missing physical8962');
    const saved = inspect(path); expect(saved.pages).toHaveLength(2);
    expect(saved.fields[F.name]).toBe('Jane Doe'); expect(saved.fields[F.ssn]).toBe('');
    expect(saved.fields[F.line1]).toBe('1'); expect(saved.fields[F.line7]).toBe('0.0196');
    expect(saved.fields[F.line8a]).toBe('588'); expect(saved.fields[F.line8b]).toBe('49');
    for (const [column, amount] of ['500', '450', '49', '401', '401', '250'].entries()) expect(saved.fields[F.monthly[0][column]]).toBe(amount);
    for (const field of F.annual) expect(saved.fields[field]).toBe('');
    expect(saved.fields[F.line24]).toBe('4812'); expect(saved.fields[F.line25]).toBe('3000'); expect(saved.fields[F.line26]).toBe('1812');
    expect(saved.fields[F.line27]).toBe(''); expect(saved.fields[F.line29]).toBe('');
    expect(saved.fields[F.allocations[0][0]]).toBe('TUAL-POLICY-100');
    expect(saved.fields[F.allocations[0][1]]).toBe('');
    expect(saved.fields[F.allocations[0][2]]).toBe('01'); expect(saved.fields[F.allocations[0][3]]).toBe('12');
    for (const field of F.allocations[0].slice(4)) expect(saved.fields[field]).toBe('0.50');
    for (const field of [F.line9Yes, F.line10No, F.line34Yes]) expect(saved.fields[field]).not.toBe('/Off');
    for (const page of saved.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
    expect(saved.widgets.find(widget => widget.name === F.monthly[0][4])).toMatchObject({ value: '401', appearance: true });
    expect(packet.filledForms.some(file => file.endsWith('/f8962-reference-filled.pdf'))).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('retains every allocation period and original cents without exposing private identifiers', async () => {
  const input = sharedPolicyFixture();
  for (const [index, row] of input.form1095A[0].monthlyPremiums.entries()) {
    row.enrolleePremium = '1000.49'; const fraction = index % 2 ? '1' : '0';
    const policy = input.form8962!.sharedPolicyAllocations!.policies![0];
    policy.original!.monthlyPremiums![index].enrolleePremium = row.enrolleePremium;
    policy.monthlyAllocations![index].fraction = fraction;
    Object.assign(input.form8962!.monthlyReconciliation![index], { enrolleePremium: d(row.enrolleePremium).times(fraction).toFixed(), slcsp: d(row.slcsp).times(fraction).toFixed(), advancePremiumTaxCredit: d(row.advancePremiumTaxCredit!).times(fraction).toFixed() });
  }
  const result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const redacted = redactReviewIdentifiers(input), hidden = redactReviewIdentifiers(result);
  const context = { input: redacted, prepared };
  const summary = buildForm8962ReferenceSummary(redacted.form1095A, hidden, context);
  expect(summary.allocations).toHaveLength(12); expect(summary.policies[0].annualEnrollmentPremium).toBe('12005.88');
  const dir = mkdtempSync(join(tmpdir(), 'tax-shared-periods-'));
  try {
    const doc = await fillForm8962SharedPolicy(redacted, hidden, blank, prepared), path = join(dir, 'actual.pdf');
    writeFileSync(path, await doc.save()); const saved = inspect(path);
    expect(saved.fields[F.line34No]).not.toBe('/Off'); expect(saved.fields[F.line34Yes]).toBe('/Off');
    expect(saved.fields[F.allocations[0][4]]).toBe('0.00'); expect(saved.fields[F.allocations[1][4]]).toBe('1.00');
    const reference = inspect(await fillForm8962Reference(redacted.form1095A, hidden, dir, context));
    const text = reference.pages.join(' '); expect(text).toContain('12005.88');
    expect(text).toContain('Allocation 12:'); expect(text).toContain('Original monthly source');
    for (const secret of ['123456789', '234567890', '123-45-6789', '234-56-7890', 'Actual signed agreement']) expect(text).not.toContain(secret);
    for (const page of reference.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it('rejects stale sources altered calculations missing and forged review tokens', async () => {
  const input = sharedPolicyFixture(), result = calculateFederalTax(input), prepared = preparePremiumTaxCreditReview(input);
  const hidden = redactReviewIdentifiers(result), redacted = redactReviewIdentifiers(input);
  await expect(fillForm8962SharedPolicy(redacted, hidden, blank)).rejects.toThrow();
  await expect(fillForm8962SharedPolicy(redacted, hidden, blank, {} as PreparedPremiumTaxCreditReview)).rejects.toThrow(/prepared|original/i);
  for (const change of [(x: typeof input) => { x.w2s[0].wages = '30001'; }, (x: typeof input) => { x.taxpayer.primary.firstName = 'Changed'; },
    (x: typeof input) => { x.form1095A[0].policyNumber = 'Replacement'; }, (x: typeof input) => { x.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = '500.01'; },
    (x: typeof input) => { x.form8962!.sharedPolicyAllocations!.policies![0].monthlyAllocations![0].fraction = '.49'; }]) {
    const changed = structuredClone(input); change(changed);
    await expect(fillForm8962SharedPolicy(changed, result, blank, prepared)).rejects.toThrow(/stale|conflicting/i);
  }
  if (!result.form8962?.sharedPolicyAllocation) throw new Error('Missing allocation');
  const altered = { ...result, form8962: { ...result.form8962, sharedPolicyAllocation: { ...result.form8962.sharedPolicyAllocation,
    periods: result.form8962.sharedPolicyAllocation.periods.map(period => ({ ...period, fraction: d('.49') })) } } };
  await expect(fillForm8962SharedPolicy(input, altered, blank, prepared)).rejects.toThrow(/calculation|reconcil/i);
  const alteredAudit = { ...result, allLines: result.allLines.map(row => row.form === 'Form 8962' && row.line === '24' ? { ...row, value: d(1) } : row) };
  const dir = mkdtempSync(join(tmpdir(), 'tax-shared-stale-'));
  try { await expect(fillReturn(input, alteredAudit, { blankFormsDir: 'forms/blank/2025', outputDir: dir, premiumTaxCreditReview: prepared })).rejects.toThrow(/calculation|reconcil/i); expect(readdirSync(dir)).toEqual([]); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  expect(() => buildForm8962ReferenceSummary([], result, { input, prepared })).toThrow(/source|policy/i);
});
it('retains year and filing gates for shared-policy review', async () => {
  const input = sharedPolicyFixture(), result = calculateFederalTax(input);
  await expect(fillForm8962SharedPolicy({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 }, blank)).rejects.toThrow(/2026|year/i);
  await expect(fillReturn(input, result, { purpose: 'filing', blankFormsDir: 'forms/blank/2025', outputDir: '/unused' })).rejects.toThrow(/filing/i);
});

it('saves the actual default allocation method and rejects replaced enrollment sources', async () => {
  const input=sharedPolicyFixture(), original=input.form1095A[0], policy=input.form8962!.sharedPolicyAllocations!.policies![0];
  original.coveredIndividuals!.push({name:'Pat Other',ssn:'345-67-8901',firstMonth:1,lastMonth:12});policy.original=structuredClone(original);
  policy.coveredFamilyAssignments!.push({ssn:'345-67-8901',family:'other_return'});policy.agreementConfirmed=false;policy.agreementReference=undefined;policy.monthlyAllocations=undefined;
  policy.defaultAllocation={sourceReference:'Private original enrollment reference',enrollingTaxpayerSsn:'123-45-6789',allCoveredPeopleEnrolledByTaxpayerConfirmed:true};
  input.form8962!.monthlyReconciliation!.forEach(row=>Object.assign(row,{enrolleePremium:'330',slcsp:'297',advancePremiumTaxCredit:'165'}));
  const result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result);
  const context={input:redacted,prepared},summary=buildForm8962ReferenceSummary(redacted.form1095A,hidden,context);
  expect(summary.allocations?.[0]).toMatchObject({fraction:'0.33',method:'default_enrollee_count'});
  expect(summary.introduction).not.toContain('Part IV agreement');
  const dir=mkdtempSync(join(tmpdir(),'tax-default-allocation-review-'));
  try{
    const doc=await fillForm8962SharedPolicy(redacted,hidden,blank,prepared),path=join(dir,'default.pdf');writeFileSync(path,await doc.save());
    const saved=inspect(path);for(const field of F.allocations[0].slice(4))expect(saved.fields[field]).toBe('0.33');
    expect(saved.fields[F.line24]).toBe('2976');expect(saved.fields[F.line25]).toBe('1980');expect(saved.fields[F.line26]).toBe('996');
    const reference=inspect(await fillForm8962Reference(redacted.form1095A,hidden,dir,context)),text=reference.pages.join(' ');
    expect(text.replace(/\s+/g,' ')).toContain('Default allocation from actual enrollees');
    for(const secret of ['Private original enrollment reference','123-45-6789','234-56-7890','345-67-8901'])expect(text).not.toContain(secret);
    for(const page of [...saved.pages,...reference.pages])expect(page).toContain(REVIEW_PDF_NOTICE);
    const changed=structuredClone(input);changed.form8962!.sharedPolicyAllocations!.policies![0].defaultAllocation!.enrollingTaxpayerSsn='234-56-7890';
    await expect(fillForm8962SharedPolicy(changed,result,blank,prepared)).rejects.toThrow(/stale|conflict/i);
  }finally{rmSync(dir,{recursive:true,force:true});}
});


it('retains no-advance ratio columns and actual blank original in private review',async()=>{
 const input=sharedNoAdvanceFixture();input.form1095A[0].monthlyPremiums.forEach(row=>{row.slcsp=null;});input.form8962!.sharedPolicyAllocations!.policies![0].original=structuredClone(input.form1095A[0]);
 const result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result),context={input:redacted,prepared};
 const summary=buildForm8962ReferenceSummary(redacted.form1095A,hidden,context);expect(summary.policies[0].annualSLCSP).toBeNull();expect(summary.allocatedMonths?.[0]?.originalSlcsp).toBeNull();expect(summary.allocations?.[0]).toMatchObject({fraction:'0.67',method:'no_advance_benchmark'});
 const dir=mkdtempSync(join(tmpdir(),'tax-no-advance-review-'));
 try{
  const packet=await fillReturn(input,result,{blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false,premiumTaxCreditReview:prepared});const path=packet.filledForms.find(file=>file.endsWith('/f8962-filled.pdf'));if(!path)throw new Error('Missing physical8962');const saved=inspect(path);
  expect(saved.fields[F.allocations[0][4]]).toBe('0.67');expect(saved.fields[F.allocations[0][5]]).toBe('');expect(saved.fields[F.allocations[0][6]]).toBe('');expect(saved.fields[F.monthly[0][0]]).toBe('1000');expect(saved.fields[F.monthly[0][1]]).toBe('1200');expect(saved.fields[F.line24]).toBe('12000');expect(saved.fields[F.line25]).toBe('0');
  const reference=inspect(await fillForm8962Reference(redacted.form1095A,hidden,dir,context)),text=reference.pages.join(' ').replace(/\s+/g,' ');expect(text).toContain('printed blank');expect(text).toContain('No advance credit');expect(text).toContain('1200 / 1800');expect(text).not.toContain('SLCSP and advance fractions 0.67');
  for(const secret of ['Actual Jane benchmark lookup','Actual Robin benchmark lookup','123-45-6789','234-56-7890'])expect(text).not.toContain(secret);for(const page of [...saved.pages,...reference.pages])expect(page).toContain(REVIEW_PDF_NOTICE);
  const changed=structuredClone(input);changed.form8962!.sharedPolicyAllocations!.policies![0].noAdvanceAllocation!.monthlyBenchmarks![0].otherReturnSlcsp='600.01';await expect(fillForm8962SharedPolicy(changed,result,blank,prepared)).rejects.toThrow(/stale|conflict/i);
  await expect(fillForm8962SharedPolicy(redacted,hidden,blank)).rejects.toThrow();const originalBlankChanged=structuredClone(input);originalBlankChanged.form1095A[0].monthlyPremiums[0].slcsp='0';await expect(fillForm8962SharedPolicy(originalBlankChanged,result,blank,prepared)).rejects.toThrow(/stale|conflict/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
