/** Spec: state/oh-return-header-sources.yaml. New helper intentionally absent before genuine existing-API RED. */
import {expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {ohioReturnHeaderFixture,withOhioAkronHeaderOriginals} from '../../fixtures/oh-return-header-sources';
import {ohioReturnHeaderPublicReviewFixture} from '../../fixtures/oh-return-header-public-review';
import {julyHeaderPacket} from '../../fixtures/oh-business-part-year-header';
it('Ohio header derives actual2503 and FRAN without using mailing geography',()=>{
 const f=ohioReturnHeaderFixture(),before=structuredClone(f),r=calculateOhioReturnHeaderSource(f.input,f.header);
 expect(r.header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'resident'});expect(r.residentDays).toBe(365);expect(r.methodVersion).toBe('oh-2025-resident-header-v1');expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);expect(f).toEqual(before);
});
it('Ohio header derives actual7701 and SUMM without changing the current Ohio return',()=>{
 const f=ohioReturnHeaderFixture(),header=withOhioAkronHeaderOriginals(f.header),input={...f.input,ohioReturnHeaderSources:header},before=structuredClone(input);
 const actual=calculateOhioReturnHeaderSource(input,header);
 const result=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:calculateFederalTax(input)});
 expect(actual.header).toEqual({schoolDistrictNumber:'7701',ohioCounty:'SUMM',residency:'resident'});
 expect(actual.residentDays).toBe(365);
 expect(input.taxpayer.address.street).not.toBe(header.residence.originalAddress.street);
 expect(result.it1040.line3_ohioAgi.toFixed(0)).toBe('100000');
 expect(result.it1040.line10_taxAfterCredits.toFixed(0)).toBe('1323');
 expect(result.residentCredit?.line7_residentCredit.toFixed(0)).toBe('1000');
 expect(result.it1040.line14_ohioWithholding.toFixed(0)).toBe('2000');
 expect(result.it1040.line26_refund.toFixed(0)).toBe('677');
 expect(result.sd100).toBeNull();
 expect(input).toEqual(before);
});
it.each([
 ['one mismatched county',/county/i],
 ['two wrong counties',/county/i],
 ['wrong official page',/exact official 2025 district-list row/i],
 ['positive official rate',/exact official 2025 district-list row/i],
 ['taxing Finder classification',/district originals/i],
 ['mismatched Finder name',/district originals/i],
 ['unsupported 2026',/complete confirmed actual header/i],
] as const)('Ohio header rejects Akron originals with %s',(defect,error)=>{
 const f=ohioReturnHeaderFixture(),header=withOhioAkronHeaderOriginals(f.header);
 if(defect==='one mismatched county')header.countyOriginal.countyName='Franklin';
 if(defect==='two wrong counties'){header.countyOriginal.countyName='Franklin';header.finderOriginal.countyName='Franklin';}
 if(defect==='wrong official page')header.officialInventoryOriginal.printedPage=50;
 if(defect==='positive official rate')header.officialInventoryOriginal.rateDisplay='.0125';
 if(defect==='taxing Finder classification')header.finderOriginal.schoolIncomeTax='reported';
 if(defect==='mismatched Finder name')header.finderOriginal.districtName='Columbus CSD';
 if(defect==='unsupported 2026')header.taxYear=2026;
 const before=structuredClone({input:f.input,header});
 expect(()=>calculateOhioReturnHeaderSource(f.input,header)).toThrow(error);
 expect({input:f.input,header}).toEqual(before);
});
it('Ohio header does not widen the separate 212-day business residence method to Akron',()=>{
 const f=julyHeaderPacket(),header=withOhioAkronHeaderOriginals(f.header),before=structuredClone({input:f.withHeader,header});
 expect(()=>calculateOhioReturnHeaderSource(f.withHeader,header)).toThrow(/county|district originals/i);
 expect({input:f.withHeader,header}).toEqual(before);
});
it('Ohio header rejects a Finder lookup before the requested tax year',()=>{
 const {input,header:columbus}=ohioReturnHeaderFixture();
 const header=withOhioAkronHeaderOriginals(columbus);
 header.finderOriginal.lookupDate='2024-12-31';
 const before=structuredClone({input,header});
 expect(()=>calculateOhioReturnHeaderSource(input,header)).toThrow(/Finder lookup.*tax year/i);
 expect({input,header}).toEqual(before);
});
it('Ohio header rejects a shared Finder and county original reference despite case and spacing',()=>{
 const {input,header:columbus}=ohioReturnHeaderFixture();
 const header=withOhioAkronHeaderOriginals(columbus);
 header.finderOriginal.sourceReference='Fictional original document 987';
 header.countyOriginal.sourceReference='  FICTIONAL\toriginal  document 987  ';
 const before=structuredClone({input,header});
 expect(()=>calculateOhioReturnHeaderSource(input,header)).toThrow(/separate Finder and county original/i);
 expect({input,header}).toEqual(before);
});
it('Ohio header preserves an older independent county record with a current-year Finder lookup',()=>{
 const {input,header:columbus}=ohioReturnHeaderFixture();
 const header=withOhioAkronHeaderOriginals(columbus);
 header.finderOriginal.lookupDate='2025-01-01';
 header.countyOriginal.recordDate='1998-09-14';
 const before=structuredClone({input,header});
 expect(calculateOhioReturnHeaderSource(input,header).header).toEqual({
  schoolDistrictNumber:'7701',ohioCounty:'SUMM',residency:'resident',
 });
 expect({input,header}).toEqual(before);
});
const defects=['absent source','false confirmation','unknown year','wrong2026','wrong owner','wrong SSN','wrong birth','missing actual address','Finder address mismatch','county address mismatch','county name mismatch','gapped calendar','second residence','false complete calendar','invalid date','future Finder date','wrong Finder year','unknown district','wrong district name','taxing district','unknown tax status','noTax flag only','missing official row','wrong official hash','wrong official page','positive official rate','unknown county','stale federal','stale parent','wrong parent status','wrong parent year'] as const;
it.each(defects)('Ohio header retains and rejects inconsistent actual original %s',kind=>{
 const f=ohioReturnHeaderFixture(),h=structuredClone(f.header);let raw:unknown=h;
 if(kind==='absent source')raw=undefined;if(kind==='false confirmation')h.sourceFactsConfirmed=false;if(kind==='unknown year')Reflect.deleteProperty(h,'taxYear');if(kind==='wrong2026')h.taxYear=2026;if(kind==='wrong owner')h.owner.accountHolder='spouse';if(kind==='wrong SSN')h.owner.originalTaxpayer.ssn='900-71-0999';if(kind==='wrong birth')h.owner.originalTaxpayer.dateOfBirth='1991-01-15';
 if(kind==='missing actual address')h.residence.originalAddress.street='';if(kind==='Finder address mismatch')h.finderOriginal.originalAddress.street='Different actual residence';if(kind==='county address mismatch')h.countyOriginal.originalAddress.zip='43216';if(kind==='county name mismatch')h.finderOriginal.countyName='Delaware';
 if(kind==='gapped calendar'){const row=h.residence.periods[0];if(!row)throw Error('Actual calendar required');row.from='2025-01-02';}if(kind==='second residence')h.residence.periods.push({from:'2025-12-31',through:'2025-12-31',sourceReference:'PRIVATE-second retained residence'});if(kind==='false complete calendar')h.residence.allOhioResidentialPeriodsIncludedConfirmed=false;if(kind==='invalid date')h.countyOriginal.recordDate='2026-02-30';if(kind==='future Finder date')h.finderOriginal.lookupDate='2026-04-02';if(kind==='wrong Finder year')h.finderOriginal.taxYear=2026;
 if(kind==='unknown district')h.finderOriginal.districtCode='9998';if(kind==='wrong district name')h.finderOriginal.districtName='Columbus Grove LSD';if(kind==='taxing district'){h.finderOriginal.districtCode='0302';h.finderOriginal.districtName='Hillsdale LSD';h.officialInventoryOriginal.districtCode='0302';h.officialInventoryOriginal.districtName='Hillsdale LSD';}if(kind==='unknown tax status')h.finderOriginal.schoolIncomeTax='';if(kind==='noTax flag only')Reflect.deleteProperty(h,'finderOriginal');if(kind==='missing official row')Reflect.deleteProperty(h,'officialInventoryOriginal');if(kind==='wrong official hash')h.officialInventoryOriginal.publicationSha256='0'.repeat(64);if(kind==='wrong official page')h.officialInventoryOriginal.printedPage=49;if(kind==='positive official rate')h.officialInventoryOriginal.rateDisplay='.0125';if(kind==='unknown county')h.countyOriginal.countyName='';
 if(kind==='stale federal')f.input.taxpayer.primary.lastName='Different current same-money owner';if(kind==='stale parent')f.facts.sourceReference='Different current domicile original';if(kind==='wrong parent status'){const owner=f.facts.owners[0];if(!owner)throw Error('Actual Ohio owner required');owner.status='nonresident';}if(kind==='wrong parent year')f.facts.taxYear=2026;
 const before=structuredClone({input:f.input,raw});expect(()=>calculateOhioReturnHeaderSource(f.input,raw)).toThrow(/Ohio.*header|header.*source/i);expect({input:f.input,raw}).toEqual(before);
});
it('Ohio header distinct valid same-cell source originals have distinct commitments',()=>{
 const a=ohioReturnHeaderFixture(),b=ohioReturnHeaderFixture();b.header.finderOriginal.sourceReference='PRIVATE-separately supplied replacement Finder original';const ra=calculateOhioReturnHeaderSource(a.input,a.header),rb=calculateOhioReturnHeaderSource(b.input,b.header);expect(ra.header).toEqual(rb.header);expect(ra.sourceCommitment).not.toBe(rb.sourceCommitment);
});
it('Ohio header safe projection and audit omit private source originals',()=>{
 const f=ohioReturnHeaderFixture(),before=structuredClone(f),r=calculateOhioReturnHeaderSource(f.input,f.header),safe=JSON.stringify({header:r.header,audit:r.audit});
 for(const secret of [f.input.taxpayer.primary.ssn,f.header.residence.originalAddress.street,f.header.finderOriginal.sourceReference,f.header.countyOriginal.sourceReference,f.header.sourceReference,r.sourceCommitment])expect(safe).not.toContain(secret);expect(r.header).not.toHaveProperty('originalFederalSources');expect(f).toEqual(before);
});

it('Ohio header public review excludes private originals from every saved object without provider transfer',async()=>{
 const f=ohioReturnHeaderPublicReviewFixture(),input={...f.input,ohioReturnHeaderSources:f.header},before=structuredClone(input);
 const request=vi.fn(()=>{throw Error('Header review cannot transfer actual originals to a provider');});vi.stubGlobal('fetch',request);
 const root=process.env.TAX_ENGINE_OH_HEADER_ARTIFACT_DIR;if(root)await mkdir(root,{recursive:true});
 const dir=await mkdtemp(join(root??tmpdir(),'oh-header-private-review-'));
 try{
  const header=calculateOhioReturnHeaderSource(input,f.header),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input);
  const rendered=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,dir,{},context);
  expect(rendered.filledForms.length).toBeGreaterThan(0);
  const secrets=[f.header.residence.originalAddress.street,f.header.finderOriginal.originalAddress.street,f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/-/g,''),f.header.sourceReference,f.header.residence.sourceReference,...f.header.residence.periods.map(p=>p.sourceReference),f.header.finderOriginal.sourceReference,f.header.countyOriginal.sourceReference,f.header.officialInventoryOriginal.sourceReference,header.sourceCommitment];
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',String.raw`
import json,sys
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject
payload=json.load(sys.stdin);pages=0;objects=0
for path in payload['paths']:
 r=PdfReader(path,strict=True);assert not r.get_fields();seen=set();strings=[]
 def walk(v):
  if isinstance(v,IndirectObject):
   key=(v.idnum,v.generation)
   if key in seen:return
   seen.add(key);target=v.get_object();assert target is not None;walk(target);return
  if isinstance(v,StreamObject):
   data=v.get_data();strings.append(data.decode('latin1'))
  if isinstance(v,DictionaryObject):
   assert str(v.get('/S','')) not in ('/JavaScript','/Launch','/SubmitForm','/ImportData','/GoToR')
   for k,child in v.items():strings.append(str(k));walk(child)
  elif isinstance(v,(ArrayObject,list)):
   for child in v:walk(child)
  elif isinstance(v,(str,bytes)):strings.append(v.decode('latin1') if isinstance(v,bytes) else str(v))
 for generation,entries in r.xref.items():
  for number in entries:
   if number:walk(IndirectObject(number,generation,r))
 for number in r.xref_objStm:walk(IndirectObject(number,0,r))
 for p in r.pages:
  pages+=1
  assert all(a.get_object().get('/Subtype')!='/Widget' for a in p.get('/Annots',[]))
  text=p.extract_text() or '';assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1;strings.append(text)
 combined='\n'.join(strings)
 for private in payload['secrets']:assert private not in combined,'Private header original leaked'
 assert 'ohioReturnHeaderSources' not in combined
 assert 'originalOhioResidencySources' not in combined
 objects+=len(seen)
print(json.dumps({'pages':pages,'objects':objects,'files':len(payload['paths'])}))
`],{input:JSON.stringify({paths:rendered.filledForms,secrets}),encoding:'utf8'}));
  expect(report.files).toBe(rendered.filledForms.length);expect(report.pages).toBeGreaterThan(0);expect(report.objects).toBeGreaterThan(0);
  const safe=JSON.stringify({header:header.header,audit:header.audit});for(const secret of secrets)expect(safe).not.toContain(secret);
  expect(request).not.toHaveBeenCalled();expect(input).toEqual(before);
 }finally{vi.unstubAllGlobals();if(!root)await rm(dir,{recursive:true,force:true});}
});

it('Ohio header rejects coherent bogus county originals without inventing jurisdiction',()=>{
 const f=ohioReturnHeaderFixture();f.header.finderOriginal.countyName='Narnia';f.header.countyOriginal.countyName='Narnia';const before=structuredClone(f);
 expect(()=>calculateOhioReturnHeaderSource(f.input,f.header)).toThrow(/county|supported/i);expect(f).toEqual(before);
});
it('Ohio header retains other actual county originals as unsupported',()=>{
 const f=ohioReturnHeaderFixture();f.header.finderOriginal.countyName='Delaware';f.header.countyOriginal.countyName='Delaware';const before=structuredClone(f);
 expect(()=>calculateOhioReturnHeaderSource(f.input,f.header)).toThrow(/county|supported/i);expect(f).toEqual(before);
});
