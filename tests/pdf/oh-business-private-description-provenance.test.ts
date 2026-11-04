/** Spec: state/oh-business-private-description-provenance.yaml. Independent source-first controls. */
import {expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,rm,access,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {prepareOhioBusinessOfficialReview} from '@/pdf/mappings/2025/fill-oh-business-official-review';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms';
import {businessPrivateDescriptionFixture} from '../fixtures/oh-business-official-review';
const kinds=['ssn-formatted','ssn-compact']as const;
const cases=kinds.flatMap(kind=>(['redacted-no-token','token-from-redacted']as const).map(mode=>({name:kind+' '+mode,kind,mode})));
it('Ohio business provenance complete actual originals replay before adversarial rendering',()=>{
 for(const kind of kinds){
  const p=businessPrivateDescriptionFixture(kind),before=structuredClone(p),federal=calculateFederalTax(p.input);
  const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(p.input,federal));
  expect(federal.agi.toString()).toBe('92935');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');
  expect(p.input.scheduleC?.principalBusinessActivity).toBe(p.rawDescription);
  expect(p.rawDescription.length).toBeLessThanOrEqual(35);
  expect(prepareOhioBusinessOfficialReview(p.input,federal,{},prepareOhioResidencyReview(p.input))).toBeDefined();
  expect(p).toEqual(before);
 }
});
const strictPrivacy=String.raw`
import json,sys
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
payload=json.load(sys.stdin);objects=0;pages=0;alltext=[]
for path in payload['paths']:
 r=PdfReader(path,strict=True);assert not r.get_fields();seen=set();strings=[]
 def recordbytes(data):
  for encoding in ('utf-8','latin1','utf-16-le','utf-16-be'):
   try:strings.append(data.decode(encoding))
   except UnicodeError:pass
 def walk(v):
  if isinstance(v,IndirectObject):
   key=(v.idnum,v.generation)
   if key in seen:return
   seen.add(key);target=v.get_object();assert target is not None;walk(target);return
  if isinstance(v,StreamObject):
   recordbytes(v.get_data())
   if v.get('/Subtype')=='/Form':
    for operands,operator in ContentStream(v,r).operations:walk(operands)
  if isinstance(v,DictionaryObject):
   assert str(v.get('/S',''))not in('/JavaScript','/Launch','/SubmitForm','/ImportData','/GoToR')
   for key,child in v.items():strings.append(str(key));walk(child)
  elif isinstance(v,(ArrayObject,list,tuple)):
   for child in v:walk(child)
  elif isinstance(v,str):strings.append(v)
  elif isinstance(v,bytes):recordbytes(v)
 for generation,entries in r.xref.items():
  for number in entries:
   if number:walk(IndirectObject(number,generation,r))
 for number in r.xref_objStm:walk(IndirectObject(number,0,r))
 for page in r.pages:
  pages+=1;assert all(a.get_object().get('/Subtype')!='/Widget'for a in page.get('/Annots',[]))
  text=page.extract_text()or'';assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1;strings.append(text);alltext.append(text)
  for operands,operator in ContentStream(page['/Contents'],r).operations:walk(operands)
 combined='\n'.join(strings)
 for secret in payload['secrets']:assert secret not in combined,'Known original identifier survived saved review output'
 objects+=len(seen)
if payload['requireMaskedDescription']:
 assert payload['expected']in' '.join(' '.join(alltext).split()),'Actual description did not retain masked source display'
print(json.dumps({'objects':objects,'pages':pages,'files':len(payload['paths'])}))
`;
const referenceNames=['oh-it-1040-reference.pdf','oh-it-nrc-reference.pdf','oh-it-bus-reference.pdf','oh-schedule-adjustments-reference.pdf','oh-it-sd-2210-reference.pdf'].sort();
const officialNames=['oh-it-1040-review.pdf','oh-it-nrc-review.pdf','oh-schedule-business-income-review.pdf','oh-schedule-adjustments-review.pdf','oh-schedule-credits-review.pdf'].sort();
const sourcePrivacyDenial=/^Ohio ordinary business official review: actual private-original masking provenance is required for this physical method[.]?$/;
it.each(cases)('Ohio business private description provenance remains private %s',async c=>{
 const p=businessPrivateDescriptionFixture(c.kind),before=structuredClone(p),federal=calculateFederalTax(p.input);
 const actual=calculateOhioResidentReturn(buildOhioResidentReturnInput(p.input,federal));
 expect(federal.agi.toString()).toBe('92935');expect(actual.it1040.line10_taxAfterCredits.toString()).toBe('0');
 const display=redactReviewIdentifiers(p.input),displayBefore=structuredClone(display);
 const token=c.mode==='token-from-redacted'?prepareOhioResidencyReview(display):undefined;
 const request=vi.fn(()=>{throw Error('Private review must not transfer originals');});vi.stubGlobal('fetch',request);
 const root=process.env.OH_BUSINESS_PRIVATE_PROVENANCE_ARTIFACT_DIR;if(root)await mkdir(root,{recursive:true});
 const parent=await mkdtemp(join(root??tmpdir(),'oh-private-provenance-'+c.kind+'-'+c.mode+'-')),output=join(parent,'saved-output');
 try{
  let packet:Awaited<ReturnType<typeof fillOhioReferenceForms>>;
  try{packet=await fillOhioReferenceForms(display,federal,output,{},token);}
  catch(error){
   await writeFile(join(parent,'actual-outcome.json'),JSON.stringify({case:c.name,path:'thrown-before-packet',accepted:false}));
   expect(error).toBeInstanceOf(Error);if(!(error instanceof Error))throw new Error('Actual privacy denial must identify its source provenance',{cause:error});
   expect(error.message).toMatch(sourcePrivacyDenial);await expect(access(output)).rejects.toThrow();
   expect(request).not.toHaveBeenCalled();expect(display).toEqual(displayBefore);expect(p).toEqual(before);
   await writeFile(join(parent,'actual-outcome.json'),JSON.stringify({case:c.name,path:'precise-pre-IO-provenance-denial',accepted:true}));return;
  }
  const names=packet.filledForms.map(path=>basename(path)).sort(),hasNrc=names.includes('oh-it-nrc-review.pdf');
  await writeFile(join(parent,'actual-outcome.json'),JSON.stringify({case:c.name,path:hasNrc?'official-paper-returned':'reference-only-returned',names,privacyChecked:false}));
  expect(names.filter(name=>name.endsWith('-reference.pdf'))).toEqual(referenceNames);
  expect(names.filter(name=>!name.endsWith('-reference.pdf'))).toEqual(hasNrc?officialNames:[]);
  const ssn=p.input.taxpayer.primary.ssn;
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictPrivacy],{input:JSON.stringify({paths:packet.filledForms,secrets:[ssn,ssn.replace(/\D/g,''),p.privateMarker],expected:p.expectedDescription,requireMaskedDescription:hasNrc}),encoding:'utf8'}))as{objects:number;pages:number;files:number};
  expect(report.objects).toBeGreaterThan(0);expect(report.pages).toBeGreaterThan(0);expect(report.files).toBe(packet.filledForms.length);
  expect(request).not.toHaveBeenCalled();expect(display).toEqual(displayBefore);expect(p).toEqual(before);
  await writeFile(join(parent,'actual-outcome.json'),JSON.stringify({case:c.name,path:hasNrc?'masked-official-paper':'safe-reference-only',names,privacyChecked:true}));
 }finally{vi.unstubAllGlobals();if(!root)await rm(parent,{recursive:true,force:true});}
});
