/** Spec: spec/state/oh-school-district-official-review.yaml. Existing API controls first. */
import { expect, it, vi } from 'vitest';
import { PDFForm, PDFTextField, PDFDict, PDFName, PDFStream } from 'pdf-lib';
import { mkdtemp, access, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { schoolW2Packet, schoolRaw, bindSchoolDistrictFixture } from '../fixtures/oh-school-district-sources.js';
import { schoolOfficialFixture, schoolOfficialCases, schoolOfficialOracles } from '../fixtures/oh-school-district-official-review.js';

// This reader checks actual saved bytes and source physical field rectangles,
// including objects reachable only through xref/object streams. Source form keys
// are legacy labels; the expected printed-line dictionary is independently pinned.
const readPhysical = String.raw`
import json,sys,re
from pypdf import PdfReader
from pypdf.generic import IndirectObject, DictionaryObject, ArrayObject, StreamObject
r=PdfReader(sys.argv[1],strict=True)
assert len(r.pages)==int(sys.argv[2])
assert not r.get_fields()
assert '/AcroForm' not in r.trailer['/Root']
seen=set(); strings=[]
def walk(x):
 if isinstance(x,IndirectObject):
  key=(x.idnum,x.generation)
  if key in seen:return
  seen.add(key); y=x.get_object(); assert y is not None, ('unresolved',key); walk(y); return
 if isinstance(x,DictionaryObject):
  assert str(x.get('/Subtype',''))!='/Widget'
  for k,v in x.items():
   assert str(k) not in ['/JavaScript','/JS','/OpenAction','/AA'], ('active',str(k))
   walk(v)
  if isinstance(x,StreamObject): strings.append(x.get_data().decode('latin1','ignore'))
 elif isinstance(x,(list,ArrayObject)):
  for v in x:walk(v)
 elif isinstance(x,str):strings.append(x)
walk(r.trailer)
for gen, entries in r.xref.items():
 if gen==65535:continue
 for oid in entries:
  if oid:walk(IndirectObject(oid,gen,r))
for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
texts=[p.extract_text() or '' for p in r.pages]
for p,t in zip(r.pages,texts):
 assert 'FOR REVIEW ONLY - NOT FOR FILING' in t
 assert all(a.get_object().get('/Subtype')!='/Widget' for a in p.get('/Annots',[]))
alltext='\n'.join(texts+strings)
for token in [sys.argv[4],sys.argv[4].replace('-',''),'PRIVATE-']:
 assert token not in alltext, ('private',token)
source=PdfReader(sys.argv[3],strict=True)
first=int(sys.argv[5]); cells=[]
for index,page in enumerate(r.pages):
 physical=source.pages[first+index]; positions={}
 for a in physical.get('/Annots',[]):
  a=a.get_object()
  if a.get('/Subtype')!='/Widget':continue
  parent=a.get('/Parent'); owner=parent.get_object() if parent else a
  name=str(owner.get('/T',a.get('/T','')))
  positions[name]=[float(n) for n in a['/Rect']]
 values={name:'' for name in positions}
 from pypdf.generic import ContentStream
 def multiply(a,b):
  return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
 def bounds(box,matrix):
  x0,y0,x1,y1=map(float,box)
  pts=[(x*matrix[0]+y*matrix[2]+matrix[4],x*matrix[1]+y*matrix[3]+matrix[5]) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
  return min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)
 def forms(content,resources,matrix,depth=0):
  assert depth<20,'Unexpected recursive Form structure'
  stack=[]
  for args,op in ContentStream(content,r).operations:
   if op==b'q':stack.append(matrix)
   elif op==b'Q':matrix=stack.pop()
   elif op==b'cm':matrix=multiply(tuple(map(float,args)),matrix)
   elif op==b'Do':
    obj=resources['/XObject'][args[0]].get_object()
    if obj.get('/Subtype')!='/Form':continue
    actual=multiply(tuple(map(float,obj.get('/Matrix',[1,0,0,1,0,0]))),matrix)
    left,bottom,right,top=bounds(obj['/BBox'],actual)
    matches=[]
    for name,(x0,y0,x1,y1) in positions.items():
     if left>=min(x0,x1)-.2 and right<=max(x0,x1)+.2 and bottom>=min(y0,y1)-.2 and top<=max(y0,y1)+.2:matches.append(name)
    if matches:
     text=re.sub(r'\s+','',''.join(page.extract_xform_text(obj)))
     if text:
      assert len(matches)==1,('ambiguous actual Form cell',matches)
      values[matches[0]]+=text
    else:forms(obj,obj.get('/Resources',resources),actual,depth+1)
 forms(page['/Contents'],page['/Resources'],(1,0,0,1,0,0))
 cells.append(values)
print(json.dumps({'text':texts,'cells':cells,'objects':len(seen)}))
`;
type CanonicalSnapshot = { texts: Record<string, string>; statuses: Record<string, string>; widgets: number };
function observeCanonicalBeforeFlatten(snapshots: CanonicalSnapshot[]) {
  const original = PDFForm.prototype.flatten;
  return vi.spyOn(PDFForm.prototype, 'flatten').mockImplementation(function (this: PDFForm, options) {
    const snapshot: CanonicalSnapshot = { texts: {}, statuses: {}, widgets: 0 };
    for (const field of this.getFields()) {
      const value = field.acroField.dict.get(PDFName.of('V'));
      if (field instanceof PDFTextField) snapshot.texts[field.getName()] = field.getText() ?? '';
      else snapshot.statuses[field.getName()] = value?.toString() ?? '/Off';
      for (const widget of field.acroField.getWidgets()) {
        snapshot.widgets++;
        const normal = widget.getAppearances()?.normal;
        if (field instanceof PDFTextField && field.getText()) {
          expect(normal, `actual text AP ${field.getName()}`).toBeInstanceOf(PDFStream);
          if (!(normal instanceof PDFStream)) throw new Error('Actual text appearance stream missing');
          expect(normal.getContents().length).toBeGreaterThan(0);
        }
        const state = widget.getAppearanceState();
        if (state && state.toString() !== '/Off') {
          expect(normal, `actual selected status AP ${field.getName()}`).toBeInstanceOf(PDFDict);
          if (!(normal instanceof PDFDict)) throw new Error('Actual status appearance dictionary missing');
          const selected = normal.lookup(state);
          expect(selected).toBeInstanceOf(PDFStream);
          if (!(selected instanceof PDFStream)) throw new Error('Actual selected appearance stream missing');
          expect(selected.getContents().length).toBeGreaterThan(0);
        }
      }
    }
    snapshots.push(snapshot);
    original.call(this, options);
  });
}
type Physical = { text: string[]; cells: Record<string, string>[]; objects: number };
function physical(path: string, pages: number, ssn: string, first: number): Physical {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', readPhysical,
    path, String(pages), 'forms/blank/2025/oh-sd100-bundle.pdf', ssn, String(first)], { encoding: 'utf8' }));
}
async function outputDirectory(name: string) {
  const retained = process.env.TAX_ENGINE_SD_OFFICIAL_ARTIFACT_DIR;
  const directory = retained ? join(retained, name) : await mkdtemp(join(tmpdir(), `sd-official-${name}-`));
  if (retained) await mkdir(directory, { recursive: true });
  return { directory, retained: Boolean(retained) };
}
function cell(cells: Record<string, string>[], page: number, field: string, expected: string) {
  expect(cells[page]?.[field], `physical page${page + 1} ${field}`).toBe(expected);
}

it.each(schoolOfficialCases)('SD official fixture independently preserves school and state cash %s', kind => {
  const input = schoolOfficialFixture(kind), before = JSON.stringify(input), federal = calculateFederalTax(input);
  const result = calculateOhioResidentReturnFromFederal({ taxInput: input, federalResult: federal });
  const sd = result.sd100, oracle = schoolOfficialOracles[kind];
  if (!sd) throw new Error('Actual school result required');
  expect(federal.agi.toString()).toBe('80000');
  expect(result.it1040.line14_ohioWithholding.toString()).toBe('3000');
  expect(sd.line4_exemptions.toString()).toBe('2150');
  expect(sd.line5_magiLessExemptions.toString()).toBe('77850');
  expect(sd.line7_earnedIncomeTax.toString()).toBe('1000');
  expect(sd.line11_sdWithholding.toString()).toBe(oracle.withheld);
  expect(sd.line12_estimatedPayments.toString()).toBe(oracle.credited);
  expect(sd.line13_totalPayments.toString()).toBe(oracle.payments);
  expect(sd.line19_overpayment.toString()).toBe(oracle.overpayment);
  expect(sd.line20_creditCarryforward.toString()).toBe(oracle.outgoing);
  expect(sd.line21_refund.toString()).toBe(oracle.refund);
  expect(JSON.stringify(input)).toBe(before);
});

it.each(schoolOfficialCases)('SD original source review emits exact official printed companions %s', async kind => {
  const input = schoolOfficialFixture(kind), before = JSON.stringify(input), federal = calculateFederalTax(input);
  const context = prepareOhioResidencyReview(input), { directory, retained } = await outputDirectory(kind);
  const snapshots: CanonicalSnapshot[] = [], observer = observeCanonicalBeforeFlatten(snapshots);
  try {
    const result = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, directory, {}, context);
    const names = result.filledForms.map(path => basename(path)), oracle = schoolOfficialOracles[kind];
    expect(names).toContain('oh-sd-100-reference.pdf');
    expect(names).toContain('oh-sd-100-review.pdf');
    expect(names.filter(name => ['oh-sd-100-review.pdf', 'oh-sd-withholding-review.pdf'].includes(name))).toHaveLength(oracle.files);
    const doc = physical(join(directory, 'oh-sd-100-review.pdf'), 3, input.taxpayer.primary.ssn, 0);
    expect(doc.objects).toBeGreaterThan(0);
    const values = { L1:'80000', L2:'0', L3:'80000', L4:'2150', L5:'77850', L6:'0', L7:'1000', L8:'1000', L9:'0', L10:'1000',
      L11:oracle.withheld, L12:oracle.credited, L14:oracle.payments, L15:'', L16:oracle.payments,
      L17:oracle.overpayment === '0' ? '0' : '', L18:oracle.overpayment === '0' ? '0' : '', L19:oracle.overpayment === '0' ? '0' : '',
      L20:oracle.overpayment, L21:oracle.outgoing, L22:oracle.refund };
    const canonical = snapshots.find(snapshot => 'L1' in snapshot.texts && 'COLA30' in snapshot.texts);
    expect(canonical, 'actual source canonical field inventory before flatten').toBeDefined();
    if (!canonical) throw new Error('Actual SD canonical source snapshot required');
    expect(canonical.widgets).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(values)) {
      expect(canonical.texts[name], `canonical ${name}`).toBe(value);
      cell(doc.cells, 1, name, value);
    }
    expect(canonical.texts.TP_SSN).toBe('');
    expect(canonical.texts.COLA37, 'actual printed34 rate retained before flatten').toBe('.0125');
    expect(canonical.statuses.PRIMARY_CHK0).toBe('/1');
    expect(canonical.statuses.CHK_FILING_STATUS).toBe('/1');
    for (const [name, value] of Object.entries({ COLASD2:'0302', COLA30:'80000', COLA31:'0', COLA32:'80000', COLA35:'80000',
      COLA36:'80000', COLA37:'.0125', COLA38:'1000', COLA39:'0', COLA40:'1000', LINE41:'1000' })) cell(doc.cells, 2, name, value);
    for (const name of ['COLASD', 'COLA23', 'COLB30', 'COLB38']) cell(doc.cells, 2, name, '');
    cell(doc.cells, 0, 'SD_NUM0', '0302'); cell(doc.cells, 0, 'day0', '365'); cell(doc.cells, 0, 'res_factor0', '1.0000');
    cell(doc.cells, 0, 'TP_SSN', ''); cell(doc.cells, 1, 'SIGN_DATE', '');
    if (oracle.files === 2) {
      const wh = physical(join(directory, 'oh-sd-withholding-review.pdf'), 1, input.taxpayer.primary.ssn, 3);
      for (const [name, value] of Object.entries({ TotalWithholding:oracle.withheld, SchedW_B_L1_PS:'P', SchedW_B_L1_SD:'0302',
        SchedW_B_L1_EIN:'91-0000302', SchedW_B_L1_WAGE:'80000', SchedW_B_L1_FITW:'10000', SchedW_B_L1_OHID:'12345678',
        SchedW_B_L1_OHWAGE:'80000', SchedW_B_L1_OHIT:oracle.withheld })) cell(wh.cells, 0, name, value);
      cell(wh.cells, 0, 'SchedW_B_L2_SD', '');
      expect(wh.text.join(' ')).not.toContain('3000');
    }
    expect(JSON.stringify(input)).toBe(before);
  } finally { observer.mockRestore(); if (!retained) await rm(directory, { recursive: true, force: true }); }
});

it.each(['forged context', 'changed original', 'missing district', 'unresolved local', 'stale federal', 'inconsistent account'] as const)(
  'SD official source conflict rejects before output %s', async kind => {
    const input = schoolOfficialFixture(), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
    if (kind === 'changed original') { const w2 = input.w2s[0]; if (!w2) throw new Error('Actual W2 required'); w2.employer.name = 'Changed equal-money employer'; }
    if (kind === 'missing district') delete schoolRaw(input).ohioSchoolDistrict;
    if (kind === 'unresolved local') { const row = input.ohioSchoolDistrict.w2Sources[0]?.localRows[0]; if (!row) throw new Error('Actual local row required'); row.classification = 'unresolved'; }
    if (kind === 'stale federal') federal.agi = federal.agi.plus(1);
    if (kind === 'inconsistent account') input.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '1';
    const dir = await mkdtemp(join(tmpdir(), 'sd-official-denied-')), output = join(dir, 'must-not-exist');
    try {
      await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), federal, output, {}, kind === 'forged context' ? {} as typeof context : context)).rejects.toThrow();
      await expect(access(output)).rejects.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

it('SD official employer identity prints actual first eight digits', async () => {
  const input = schoolOfficialFixture(), row = schoolW2Packet(input).stateRows[0];
  if (!row) throw new Error('Actual Ohio employer state row required');
  row.employerStateID = '123456789'; bindSchoolDistrictFixture(input);
  const federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
  const { directory, retained } = await outputDirectory('nine-digit-employer');
  try {
    await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, directory, {}, context);
    const wh = physical(join(directory, 'oh-sd-withholding-review.pdf'), 1, input.taxpayer.primary.ssn, 3);
    cell(wh.cells, 0, 'SchedW_B_L1_OHID', '12345678');
  } finally { if (!retained) await rm(directory, { recursive: true, force: true }); }
});
