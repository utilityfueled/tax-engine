/** Spec: state/oh-business-part-year-header.yaml. Existing public API before products; default budget unchanged. */
import {expect,it,vi} from 'vitest';
import {access,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {prepareOhioResidencyReview,type PreparedOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms';
import {prepareOhioBusinessOfficialReview} from '@/pdf/mappings/2025/fill-oh-business-official-review';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {julyCases,julyRequired,julyHeaderPacket,julyPaperCells,julyPlans,julyStatuses,julyWeightStrikes} from '../fixtures/oh-business-part-year-header';
import {julyAdditionalBlankStatuses,julyPrivateDescriptions,julyPrivateDescriptionPacket} from '../fixtures/oh-business-part-year-header';
import {businessPaperFixture,businessPaperCases,businessPaperPlans} from '../fixtures/oh-business-official-review';
import {ohioReturnHeaderFixture} from '../fixtures/oh-return-header-sources';
const cases=julyCases.map(c=>[c.name,c]as const);
async function directory(name:string){const temporary=await mkdtemp(join(tmpdir(),'oh-july212-')),retained=process.env.OH_BUSINESS_JULY_HEADER_ARTIFACT_DIR,root=retained?join(retained,name):temporary;return{root,cleanup:()=>rm(temporary,{recursive:true,force:true})};}
it('July business literal physical matrix keeps780 source-derived cells and exact dates',()=>{
 let count=0;for(const c of julyCases){const cells=julyPaperCells(c);expect(cells).toHaveLength(390);count+=cells.length;const values=Object.fromEntries(cells.map(row=>[row.file+':'+row.field,row.value]));expect(values['oh-it-1040-review.pdf:COUNTY']).toBe('FRAN');expect(values['oh-it-1040-review.pdf:SD_NUM']).toBe('2503');expect(values['oh-it-1040-review.pdf:PRIM_NON_RES_STATE']).toBe('VA');expect(values['oh-it-nrc-review.pdf:prim-end']).toBe('07 31 25');expect(values['oh-it-1040-review.pdf:L9']).toBe(c.NRC);expect(values['oh-it-1040-review.pdf:L10']).toBe('0');expect(values['oh-schedule-credits-review.pdf:SchedC_L1']).toBe(c.tax);expect(values['oh-schedule-credits-review.pdf:SchedC_L11']).toBe(c.tax);expect(julyStatuses().filter(row=>row.field==='CHK_PRIM_RES'&&row.selected).map(row=>row.APOnValues)).toEqual([['/2']]);}expect(count).toBe(780);
});
const publicCases=julyCases.flatMap(c=>['RAW','redacted-original-token'].map(mode=>[c.name+'-'+mode,c,mode]as const));
it.each(publicCases)('July business existing public review emits actual212-day companions %s',async(_name,c,mode)=>{
 const f=julyHeaderPacket(c),input=f.withHeader,before=structuredClone(f),federal=calculateFederalTax(input),context=mode==='RAW'?undefined:prepareOhioResidencyReview(input),{root,cleanup}=await directory('public-'+c.name+'-'+mode);try{
  const result=await fillOhioReferenceForms(mode==='RAW'?input:redactReviewIdentifiers(input),federal,root,{},context);expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(julyPlans).sort());expect(result.filledForms.map(path=>basename(path))).toContain('oh-it-1040-reference.pdf');expect(f).toEqual(before);
 }finally{await cleanup();}
});
const strictSaved=String.raw`
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject,ContentStream
import sys,json,re
root=Path(sys.argv[1]);plans=json.loads(sys.argv[2]);cells=json.loads(sys.argv[3]);private=json.loads(sys.argv[4]);strike_regions=json.loads(sys.argv[5]);statuses=json.loads(sys.argv[6]);reports={}
def mult(m,n):
 a,b,c,d,e,f=m;g,h,i,j,k,l=n
 return[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def painted(page,r):
 matrix=[1,0,0,1,0,0];stack=[];found=[];segments=[];pending=[];point=None;stroke=(0,0,0)
 def xy(x,y):
  a,b,c,d,e,f=matrix;return[a*float(x)+c*float(y)+e,b*float(x)+d*float(y)+f]
 for args,op in ContentStream(page['/Contents'],r).operations:
  if op==b'q':stack.append((matrix[:],stroke))
  elif op==b'Q':matrix,stroke=stack.pop()
  elif op==b'cm':matrix=mult(matrix,[float(v)for v in args])
  elif op==b'RG':stroke=tuple(float(v)for v in args)
  elif op==b'G':stroke=(float(args[0]),)*3
  elif op==b'm':point=xy(*args)
  elif op==b'l' and point is not None:
   end=xy(*args);pending.append((point,end));point=end
  elif op in [b'S',b's',b'B',b'B*',b'b',b'b*']:
   segments.extend((p,q,stroke)for p,q in pending);pending=[];point=None
  elif op in [b'n',b'f',b'f*']:pending=[];point=None
  elif op==b'Do':
   xo=page.get('/Resources',{}).get('/XObject',{}).get(args[0])
   if xo is None:continue
   xo=xo.get_object()
   if xo.get('/Subtype')!='/Form' or '/BBox'not in xo:continue
   m=mult(matrix,[float(v)for v in xo.get('/Matrix',[1,0,0,1,0,0])]);a,b,c,d,e,f=m;l,bt,rt,t=[float(v)for v in xo['/BBox']]
   pts=[(a*x+c*y+e,b*x+d*y+f)for x,y in[(l,bt),(l,t),(rt,bt),(rt,t)]];rect=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)]
   strings=[];ops=ContentStream(xo,r).operations;fill=(0,0,0);fillstack=[];ink=False
   for vals,operator in ops:
    if operator==b'q':fillstack.append(fill)
    elif operator==b'Q':fill=fillstack.pop()
    elif operator==b'rg':fill=tuple(float(v)for v in vals)
    elif operator==b'g':fill=(float(vals[0]),)*3
    elif operator==b'k':
     c,m,y,k=[float(v)for v in vals];fill=(1-min(1,c+k),1-min(1,m+k),1-min(1,y+k))
    elif operator in [b'f',b'f*',b'B',b'B*',b'b',b'b*'] and min(fill)<.95:ink=True
    if operator==b'Tj':strings.append(str(vals[0]))
    elif operator==b'TJ':strings.extend(str(v)for v in vals[0]if isinstance(v,str))
   found.append((rect,''.join(strings),ink or any(text.strip()for text in strings)))
 return found,segments
for name,count in plans.items():
 r=PdfReader(root/name,strict=True);assert len(r.pages)==count;assert not r.get_fields();assert '/AcroForm'not in r.trailer['/Root'];texts=[];objects=[]
 for page in r.pages:
  assert all(a.get_object().get('/Subtype')!='/Widget'for a in page.get('/Annots',[]));t=page.extract_text()or'';assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1;texts.append(t)
 ids={(gen,num)for gen,entries in r.xref.items()if gen!=65535 for num in entries if num};ids.update((0,num)for num in r.xref_objStm)
 for gen,num in sorted(ids):
  obj=r.get_object(IndirectObject(num,gen,r))
  if isinstance(obj,dict):
   assert not any(k in obj for k in ['/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/EmbeddedFile','/FT']);assert obj.get('/S')not in ['/JavaScript','/Launch','/GoToR','/SubmitForm','/ImportData'];assert obj.get('/Subtype')!='/Widget'
  objects.append(str(obj))
  def decode(v):
   if isinstance(v,bytes):
    for enc in ['utf-8','latin1','utf-16-be','utf-16-le']:
     try:objects.append(v.decode(enc))
     except UnicodeError:pass
   elif isinstance(v,dict):
    for child in v.values():decode(child)
   elif isinstance(v,(list,tuple)):
    for child in v:decode(child)
   elif isinstance(v,str):objects.append(v)
  decode(obj)
  if hasattr(obj,'get_data'):decode(obj.get_data())
 raw='\n'.join(objects+texts+[str(r.metadata)])
 for marker in private:assert marker not in raw,(name,'private source marker')
 assert not re.search(r'\b\d{3}-\d{2}-\d{4}\b',raw),(name,'SSN format')
 appearances={};actual={}
 for cell in cells:
  if cell['file']!=name:continue
  page=cell['page']
  if page not in appearances:appearances[page]=painted(r.pages[page-1],r)[0]
  matches=[value for rect,value,ink in appearances[page]if all(abs(a-b)<.02 for a,b in zip(rect,cell['rect']))]
  assert len(matches)==1,(name,cell,'appearance count',len(matches));assert matches[0].replace(',','').strip()==cell['value'],(name,cell,'saved value',matches[0]);actual[str(page)+':'+cell['field']]=matches[0]
 if name=='oh-it-nrc-review.pdf':
  marks,segments=painted(r.pages[2],r)
  for region in strike_regions:
   left,bottom,right,top=region['rect'];assert any(min(p[0],q[0])<=left+1 and max(p[0],q[0])>=right-1 and bottom<=p[1]<=top and bottom<=q[1]<=top and max(color)<.2 for p,q,color in segments),(name,'missing visibly struck original weight',region)
  assert texts[2].count('.20')>=2 and '.60'in texts[2]
  owner=[ink for rect,text,ink in marks if all(abs(a-b)<.02 for a,b in zip(rect,[340.164,661.33,351.392,672.865]))];assert owner==[True],('primary owner AP',owner)
 for status in statuses:
  if status['file']!=name:continue
  states=[ink for rect,t,ink in painted(r.pages[status['page']-1],r)[0]if all(abs(a-b)<.02 for a,b in zip(rect,status['rect']))]
  assert states==[status['selected']],(name,'actual grouped status',status,states)
 reports[name]={'pages':len(r.pages),'cells':sum(1 for c in cells if c['file']==name),'objects':len(ids),'texts':texts,'fieldValues':actual}
assert set(reports)==set(plans)
print(json.dumps(reports))
`;
it.each(cases)('July business saved physical cells and private source boundaries %s',async(_name,c)=>{
 const f=julyHeaderPacket(c),input=f.withHeader,before=structuredClone(f),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input),{root,cleanup}=await directory('physical-'+c.name),request=vi.fn(()=>{throw Error('Original sources cannot transfer to provider');});vi.stubGlobal('fetch',request);
 try{await mkdir(root,{recursive:true});const result=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,root,{},context);expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(julyPlans).sort());
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictSaved,root,JSON.stringify(julyPlans),JSON.stringify(julyPaperCells(c)),JSON.stringify(['900-74-0421','900740421','90-7400421','907400421',f.header.residence.originalAddress.street,'PRIVATE-','ohioReturnHeaderSources','originalFederalSources','originalOhioResidencySources','originalBusinessSourcePacket']),JSON.stringify(julyWeightStrikes),JSON.stringify(julyStatuses())],{encoding:'utf8'}))as Record<string,{pages:number;cells:number}>;
  expect(Object.values(report).reduce((n,row)=>n+row.pages,0)).toBe(11);expect(Object.values(report).reduce((n,row)=>n+row.cells,0)).toBe(390);expect(request).not.toHaveBeenCalled();expect(f).toEqual(before);
 }finally{vi.unstubAllGlobals();await cleanup();}
});
const conflicts=['bad header hash','same-cell stale header parent','stale currentC','missing current business originals','forged context','serialized context','same-cash invoice original','stale federal result']as const;
it.each(conflicts)('July business public source conflicts deny before output %s',async kind=>{
 const f=julyHeaderPacket(),input=f.withHeader,federal=calculateFederalTax(input);let context=prepareOhioResidencyReview(input);
 if(kind==='bad header hash')julyRequired(input.ohioReturnHeaderSources).officialInventoryOriginal.publicationSha256='0'.repeat(64);
 if(kind==='same-cell stale header parent')julyRequired(input.ohioResidency).sourceReference='PRIVATE-NEW-SAME-CELLS-PARENT';if(kind==='stale currentC')julyRequired(input.scheduleC).businessName='Same cash replaced current business';if(kind==='missing current business originals')Reflect.deleteProperty(julyRequired(input.ohioResidency),'originalFederalSources');
 if(kind==='forged context')context={}as PreparedOhioResidencyReview;if(kind==='serialized context')context=JSON.parse(JSON.stringify(context))as PreparedOhioResidencyReview;
 if(kind==='same-cash invoice original')julyRequired(julyRequired(input.ohioResidency?.businessSources).receiptOriginals[0]).originalDocumentId='PRIVATE-NEW-SAME-CASH-INVOICE';if(kind==='stale federal result')Reflect.set(federal,'agi',federal.agi.plus('1'));
 if(kind==='bad header hash'||kind==='same-cell stale header parent')context=prepareOhioResidencyReview(input);
 const before=structuredClone(input),{root,cleanup}=await directory('denied-'+kind.replaceAll(' ','-')),output=join(root,'never-created');try{
  await expect(fillOhioReferenceForms(input,federal,output,{},context,resolve('PRIVATE-NONEXISTENT-TEMPLATES'))).rejects.toThrow(/header|source|context|original|stale|calculation/i);await expect(access(output)).rejects.toThrow();expect(input).toEqual(before);
 }finally{await cleanup();}
});
it('July business old181-day no-header public companions remain unchanged',async()=>{
 const old=julyRequired(businessPaperCases.find(c=>c.name==='py100k')),f=businessPaperFixture(old),before=structuredClone(f),{root,cleanup}=await directory('old181-py');try{const result=await fillOhioReferenceForms(f.input,calculateFederalTax(f.input),root);expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(businessPaperPlans(old)).sort());expect(Object.values(businessPaperPlans(old)).reduce((a,b)=>a+b,0)).toBe(9);expect(result.filledForms.map(path=>basename(path))).not.toContain('oh-it-1040-review.pdf');expect(f).toEqual(before);}finally{await cleanup();}
});
it('July business fullresident original header and refund677 stay unchanged',()=>{const f=ohioReturnHeaderFixture(),before=structuredClone(f),header=calculateOhioReturnHeaderSource(f.input,f.header),oh=calculateOhioResidentReturnFromFederal({taxInput:f.input,federalResult:calculateFederalTax(f.input)});expect(header.residentDays).toBe(365);expect(header.methodVersion).toBe('oh-2025-resident-header-v1');expect(oh.it1040.line26_refund.toString()).toBe('677');expect(f).toEqual(before);});
it('July business212-day source without header stays physically unsupported',()=>{const f=julyHeaderPacket(),before=structuredClone(f);expect(prepareOhioBusinessOfficialReview(f.canonical,calculateFederalTax(f.canonical))).toBeUndefined();expect(f).toEqual(before);});

/** Additional actual blank-AP coverage, preserving the original eight grouped status checks. */
const strictAdditionalBlankStatuses=strictSaved.slice(0,strictSaved.indexOf('for name,count in plans.items():'))+String.raw`
checked=0;cache={};readers={}
assert len(statuses)==33
for status in statuses:
 name=status['file'];page=status['page'];key=(name,page)
 if name not in readers:readers[name]=PdfReader(root/name,strict=True)
 if key not in cache:cache[key]=painted(readers[name].pages[page-1],readers[name])[0]
 states=[ink for rect,text,ink in cache[key]if all(abs(a-b)<.02 for a,b in zip(rect,status['rect']))]
 # A source widget may have no explicit Off appearance. No painted On ink is required.
 assert not any(states),(name,'blank status was visibly selected',status,states)
 checked+=1
assert checked==33
print(json.dumps({'checked':checked,'files':sorted(readers)}))
`;
it.each(cases)('July business saved additional33 blank statuses remain unselected %s',async(_name,c)=>{
 const f=julyHeaderPacket(c),before=structuredClone(f),input=f.withHeader,federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input),{root,cleanup}=await directory('blank-statuses-'+c.name);
 try{await mkdir(root,{recursive:true});const result=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,root,{},context);expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(julyPlans).sort());
  expect(julyAdditionalBlankStatuses).toHaveLength(33);expect(julyStatuses()).toHaveLength(8);
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictAdditionalBlankStatuses,root,JSON.stringify(julyPlans),'[]','[]','[]',JSON.stringify(julyAdditionalBlankStatuses)],{encoding:'utf8'}))as{checked:number;files:string[]};
  expect(report.checked).toBe(33);expect(report.files).toEqual(['oh-it-1040-review.pdf','oh-it-nrc-review.pdf']);expect(f).toEqual(before);
 }finally{await cleanup();}
});
const strictJulyProvenancePrivacy=strictSaved.slice(strictSaved.indexOf('def mult'),strictSaved.indexOf('for name,count in plans.items():'))+String.raw`
import json,sys
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
payload=json.load(sys.stdin);objects=0;pages=0;alltext=[];description_sinks=0
for path in payload['paths']:
 r=PdfReader(path,strict=True);assert not r.get_fields();assert '/AcroForm'not in r.trailer['/Root'];seen=set();strings=[]
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
   assert not any(key in v for key in ['/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/EmbeddedFile','/FT'])
   assert v.get('/Subtype')!='/Widget'
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
 if payload['requireMaskedDescription'] and Path(path).name==payload['descriptionCell']['file']:
  cell=payload['descriptionCell'];marks,_=painted(r.pages[cell['page']-1],r)
  matches=[value for rect,value,ink in marks if all(abs(a-b)<.02 for a,b in zip(rect,cell['rect']))]
  assert len(matches)==1,('Actual NRC3bn appearance count',len(matches))
  assert matches[0].strip()==payload['expected'],('Actual NRC3bn source-pinned description is not exactly masked',matches[0])
  description_sinks+=1
 combined='\n'.join(strings)
 for secret in payload['secrets']:assert secret not in combined,'Known original identifier survived saved review output'
 objects+=len(seen)
if payload['requireMaskedDescription']:
 assert description_sinks==1,'Exactly one actual source-pinned NRC3bn description must be checked'
 assert payload['expected']in' '.join(' '.join(alltext).split()),'Actual description did not retain masked source display'
print(json.dumps({'objects':objects,'pages':pages,'files':len(payload['paths'])}))
`;
const julySafeReferenceNames=['oh-it-1040-reference.pdf','oh-it-nrc-reference.pdf','oh-it-bus-reference.pdf','oh-schedule-adjustments-reference.pdf','oh-it-sd-2210-reference.pdf'].sort();
const julyMissingIdentityDenials=new Set([
 'Ohio actual return header sources: complete confirmed actual header originals are required',
 'Ohio actual return header sources: actual current owner identity and date of birth must match',
]);
const julyProvenanceCases=julyPrivateDescriptions.flatMap(row=>(['redacted-no-token','token-from-redacted']as const).map(mode=>[row.kind+' '+mode,row.kind,mode]as const));
it('July business212 private provenance RAW description source preconditions',()=>{
 for(const row of julyPrivateDescriptions){const f=julyPrivateDescriptionPacket(row.kind),before=structuredClone(f),input=f.withHeader,federal=calculateFederalTax(input),actual=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
  expect(f.rawDescription.length).toBeLessThanOrEqual(35);expect(input.scheduleC?.principalBusinessActivity).toBe(f.rawDescription);expect(input.taxpayer.primary.ssn).toBe('900-74-0421');expect(federal.agi.toString()).toBe('92935');expect(actual.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(calculateOhioReturnHeaderSource(input,input.ohioReturnHeaderSources).residentDays).toBe(212);expect(prepareOhioBusinessOfficialReview(input,federal)).toBeDefined();expect(f).toEqual(before);
 }
});
it.each(julyProvenanceCases)('July business212 private provenance remains private %s',async(_name,kind,mode)=>{
 const f=julyPrivateDescriptionPacket(kind),before=structuredClone(f),input=f.withHeader,federal=calculateFederalTax(input);
 expect(f.rawDescription.length).toBeLessThanOrEqual(35);expect(prepareOhioBusinessOfficialReview(input,federal)).toBeDefined();
 const display=redactReviewIdentifiers(input),displayBefore=structuredClone(display);expect(display.taxpayer.primary.ssn).toBe('');expect(display.scheduleC?.principalBusinessActivity).toBe(f.rawDescription);
 const context=mode==='token-from-redacted'?prepareOhioResidencyReview(display):undefined,{root,cleanup}=await directory('provenance-'+kind+'-'+mode),output=join(root,'provenance-output'),request=vi.fn(()=>{throw Error('Private original descriptions cannot transfer to provider');});vi.stubGlobal('fetch',request);
 try{
  let packet:Awaited<ReturnType<typeof fillOhioReferenceForms>>;
  try{packet=await fillOhioReferenceForms(display,federal,output,{},context);}
  catch(error){
   expect(error).toBeInstanceOf(Error);if(!(error instanceof Error))throw Error('Actual source denial must be identified',{cause:error});expect(julyMissingIdentityDenials.has(error.message)).toBe(true);await expect(access(output)).rejects.toThrow();expect(request).not.toHaveBeenCalled();expect(display).toEqual(displayBefore);expect(f).toEqual(before);
   await mkdir(root,{recursive:true});await writeFile(join(root,'actual-provenance-outcome.json'),JSON.stringify({kind,mode,path:'exact-header-identity-denial-before-output',privacyChecked:true,renderedOrMasked:false}));return;
  }
  const names=packet.filledForms.map(path=>basename(path)).sort(),hasOfficial=names.includes('oh-it-nrc-review.pdf');
  await writeFile(join(root,'actual-provenance-outcome.json'),JSON.stringify({kind,mode,path:hasOfficial?'official-paper-returned':'reference-only-returned',privacyChecked:false}));
  expect(names.filter(name=>name.endsWith('-reference.pdf'))).toEqual(julySafeReferenceNames);expect(names.filter(name=>!name.endsWith('-reference.pdf'))).toEqual(hasOfficial?Object.keys(julyPlans).sort():[]);
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictJulyProvenancePrivacy],{input:JSON.stringify({paths:packet.filledForms,secrets:['900-74-0421','900740421','90-7400421','907400421',f.header.residence.originalAddress.street,'PRIVATE-','originalFederalSources','originalOhioResidencySources','originalBusinessSourcePacket','ohioReturnHeaderSources'],expected:f.expectedDescription,descriptionCell:julyRequired(julyPaperCells(julyRequired(julyCases[0])).find(row=>row.file==='oh-it-nrc-review.pdf'&&row.field==='3bn')),requireMaskedDescription:hasOfficial}),encoding:'utf8'}))as{objects:number;pages:number;files:number};
  expect(report.objects).toBeGreaterThan(0);expect(report.pages).toBeGreaterThan(0);expect(report.files).toBe(packet.filledForms.length);expect(request).not.toHaveBeenCalled();expect(display).toEqual(displayBefore);expect(f).toEqual(before);
  await writeFile(join(root,'actual-provenance-outcome.json'),JSON.stringify({kind,mode,path:hasOfficial?'masked-official-paper':'safe-reference-only',names,privacyChecked:true}));
 }finally{vi.unstubAllGlobals();await cleanup();}
});
