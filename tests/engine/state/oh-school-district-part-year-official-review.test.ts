/** Spec: state/oh-school-district-part-year-official-review.yaml. Source first; actual APIs/default budget. */
import {expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,access,rm,readdir,writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {prepareOhioResidencyReview,type PreparedOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms';
import {fillOhioSchoolDistrictOfficialReview} from '@/pdf/mappings/2025/fill-oh-school-district-official-review';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {schoolPyHeaderPacket,schoolPyPaperCases,schoolPyPaperCells,schoolPyStatuses,schoolPyPlans,sdPyRequired} from '../../fixtures/oh-school-district-part-year-official-review';
import {schoolOfficialFixture,schoolOfficialCases,schoolOfficialOracles} from '../../fixtures/oh-school-district-official-review';
import {ohioReturnHeaderFixture} from '../../fixtures/oh-return-header-sources';
async function directory(name:string){const temporary=await mkdtemp(join(tmpdir(),'oh-sd-py-paper-')),retained=process.env.OH_SD_PY_PAPER_ARTIFACT_DIR,root=retained?join(retained,name):temporary;return{root,cleanup:()=>rm(temporary,{recursive:true,force:true})};}
it('SD PY paper existing no-header canonical precondition remains exact',()=>{
 const f=schoolPyHeaderPacket(),before=structuredClone(f),federal=calculateFederalTax(f.canonical),result=calculateOhioResidentReturnFromFederal({taxInput:f.canonical,federalResult:federal}),sd=sdPyRequired(result.sd100);
 expect(federal.agi.toString()).toBe('60000');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('811');expect(result.it1040.line26_refund.toString()).toBe('1189');expect(sd.line7_earnedIncomeTax.toString()).toBe('500');expect(sd.line21_refund.toString()).toBe('100');expect(f).toEqual(before);
});
it('SD PY paper existing header API derives actual ASHL and0302 without mailing inference',()=>{
 const f=schoolPyHeaderPacket(),before=structuredClone(f),h=calculateOhioReturnHeaderSource(f.withHeader,f.header);
 expect(h.header).toEqual({schoolDistrictNumber:'0302',ohioCounty:'ASHL',residency:'part_year_resident'});expect(h.methodVersion).toBe('oh-2025-py-school-header-212-v1');expect(h.residentDays).toBe(212);expect(h.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);expect(f.withHeader.taxpayer.address.state).toBe('VA');expect(f).toEqual(before);
});
it('SD PY paper existing canonical API accepts separate current header without rebinding originals',()=>{
 const f=schoolPyHeaderPacket(),before=structuredClone(f),result=calculateOhioResidentReturnFromFederal({taxInput:f.withHeader,federalResult:calculateFederalTax(f.withHeader)});
 expect(sdPyRequired(result.sd100).line21_refund.toString()).toBe('100');expect(result.it1040.line26_refund.toString()).toBe('1189');expect(f).toEqual(before);
});
it('SD PY paper literal source matrices preserve complete field and status inventories',()=>{
 for(const c of schoolPyPaperCases){const cells=schoolPyPaperCells(c);expect(cells).toHaveLength(165);expect(new Set(cells.map(v=>v.file+':'+v.page+':'+v.field)).size).toBe(165);expect(cells.find(v=>v.field==='COUNTY')?.value).toBe('ASHL');expect(cells.find(v=>v.field==='res_factor1')?.value).toBe('.4191');expect(cells.find(v=>v.field==='L22')?.value).toBe(c.refund);expect(cells.find(v=>v.field==='SchedW_B_L1_EIN')?.value).toBe('91-7400302');}
 expect(schoolPyStatuses).toHaveLength(22);expect(schoolPyStatuses.filter(v=>v.selected).map(v=>[v.field,v.APOnValues])).toEqual([['CHK_FILING_STATUS',['/1']],['PRIMARY_CHK0',['/1']],['PRIMARY_CHK1',['/1']]]);
});
// Pinned-source rectangle reader adapted from existing independent business reader;
// parses each saved page once, exact current cells/status ink, all object streams and UTF encodings.
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
 for status in statuses:
  if status['file']!=name:continue
  states=[ink for rect,t,ink in painted(r.pages[status['page']-1],r)[0]if all(abs(a-b)<.02 for a,b in zip(rect,status['rect']))]
  if status['selected']:assert states==[True],(name,'selected actual status',status,states)
  else:assert not any(states),(name,'blank actual status',status,states)
 reports[name]={'pages':len(r.pages),'cells':sum(1 for c in cells if c['file']==name),'objects':len(ids),'texts':texts,'fieldValues':actual}
assert set(reports)==set(plans)
print(json.dumps(reports))
`;
const publicCases=schoolPyPaperCases.flatMap(c=>['RAW','redacted-original-token'].map(mode=>[c.name+'-'+mode,c,mode]as const));
it.each(publicCases)('SD PY paper existing public API emits saved actual212-day companions %s',async(name,c,mode)=>{
 const f=schoolPyHeaderPacket(c),input=f.withHeader,before=structuredClone(f),federal=calculateFederalTax(input),context=mode==='RAW'?undefined:prepareOhioResidencyReview(input),{root,cleanup}=await directory(name),request=vi.fn(()=>{throw Error('Private originals cannot transfer to provider');});vi.stubGlobal('fetch',request);
 try{await mkdir(root,{recursive:true});const result=await fillOhioReferenceForms(mode==='RAW'?input:redactReviewIdentifiers(input),federal,root,{},context);expect(result.filledForms.map(v=>basename(v)).filter(v=>v.startsWith('oh-sd-')&&v.endsWith('-review.pdf')).sort()).toEqual(Object.keys(schoolPyPlans).sort());expect(result.filledForms.map(v=>basename(v))).toContain('oh-sd-100-reference.pdf');
 const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictSaved,root,JSON.stringify(schoolPyPlans),JSON.stringify(schoolPyPaperCells(c)),JSON.stringify(['900-74-0302','900740302','PRIVATE-',f.header.residence.originalAddress.street,'ohioReturnHeaderSources','originalFederalSources','originalOhioResidencySources']), '[]',JSON.stringify(schoolPyStatuses)],{encoding:'utf8'}))as Record<string,{pages:number;cells:number}>;
 expect(Object.values(report).reduce((a,b)=>a+b.pages,0)).toBe(4);expect(Object.values(report).reduce((a,b)=>a+b.cells,0)).toBe(165);await writeFile(join(root,'strict-source-report.json'),JSON.stringify(report,null,2));expect(request).not.toHaveBeenCalled();expect(f).toEqual(before);
 }finally{vi.unstubAllGlobals();await cleanup();}
});
const conflicts=['bad header hash','wrong county','coherent bogus county','Finder address mismatch','same-cell stale parent','changed current W2 identity','changed payroll original','wrong residence date','missing federal original','forged context','serialized context','stale federal result']as const;
it.each(conflicts)('SD PY paper source conflicts deny before physical output %s',async kind=>{
 const f=schoolPyHeaderPacket(),input=f.withHeader,federal=calculateFederalTax(input);let context=prepareOhioResidencyReview(input);
 if(kind==='bad header hash')sdPyRequired(input.ohioReturnHeaderSources).officialInventoryOriginal.publicationSha256='0'.repeat(64);
 if(kind==='wrong county')sdPyRequired(input.ohioReturnHeaderSources).countyOriginal.countyName='Franklin';
 if(kind==='coherent bogus county'){sdPyRequired(input.ohioReturnHeaderSources).countyOriginal.countyName='Narnia';sdPyRequired(input.ohioReturnHeaderSources).finderOriginal.countyName='Narnia';}
 if(kind==='Finder address mismatch')sdPyRequired(input.ohioReturnHeaderSources).finderOriginal.originalAddress.street='Different real supplied home';
 if(kind==='same-cell stale parent')sdPyRequired(input.ohioResidency).sourceReference='PRIVATE-PY-SAME-MONEY-NEW-PARENT';
 if(kind==='changed current W2 identity')sdPyRequired(input.w2s[0]).employer.name='Different actual same-cash employer';
 if(kind==='changed payroll original')sdPyRequired(sdPyRequired(sdPyRequired(input.ohioSchoolDistrict).partYearWageSources).payrollOriginals[0]).sourceReference='PRIVATE-PY-SAME-CASH-NEW-PAYROLL';
 if(kind==='wrong residence date')sdPyRequired(sdPyRequired(input.ohioReturnHeaderSources).residence.periods[0]).through='2025-07-30';
 if(kind==='missing federal original')Reflect.deleteProperty(sdPyRequired(input.ohioSchoolDistrict),'originalFederalSources');
 // Deliberate complete original capture after changed header-only originals: actual preparer captures,
 // it does not validate the new header. The physical method must reject the factual contradiction.
 if(['bad header hash','wrong county','coherent bogus county','Finder address mismatch','same-cell stale parent','wrong residence date'].includes(kind))context=prepareOhioResidencyReview(input);
 if(kind==='forged context')context={}as PreparedOhioResidencyReview;if(kind==='serialized context')context=JSON.parse(JSON.stringify(context))as PreparedOhioResidencyReview;if(kind==='stale federal result')federal.agi=federal.agi.plus('1');
 const before=structuredClone(input),{root,cleanup}=await directory('denied-'+kind.replaceAll(' ','-')),output=join(root,'must-not-exist');try{await expect(fillOhioSchoolDistrictOfficialReview(redactReviewIdentifiers(input),federal,output,{},context,join(root,'must-not-read-template'))).rejects.toThrow(/header|county|source|original|context|stale|calculation|residen/i);await expect(access(output)).rejects.toThrow();expect(input).toEqual(before);}finally{await cleanup();}
});
it('SD PY paper old no-header source stays omitted before template access',async()=>{
 const f=schoolPyHeaderPacket(),input=f.canonical,before=structuredClone(input),{root,cleanup}=await directory('old-no-header');try{await mkdir(root,{recursive:true});const output=join(root,'not-created'),paths=await fillOhioSchoolDistrictOfficialReview(input,calculateFederalTax(input),output,{},prepareOhioResidencyReview(input),join(root,'nonexistent-template'));expect(paths).toEqual([]);await expect(access(output)).rejects.toThrow();expect(await readdir(root)).toEqual([]);expect(input).toEqual(before);}finally{await cleanup();}
});
it('SD PY paper preserves old full-year source result and header method',()=>{
 for(const c of schoolOfficialCases){const input=schoolOfficialFixture(c),before=structuredClone(input),result=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:calculateFederalTax(input)});expect(sdPyRequired(result.sd100).line7_earnedIncomeTax.toString()).toBe('1000');expect(sdPyRequired(result.sd100).line21_refund.toString()).toBe(schoolOfficialOracles[c].refund);expect(input).toEqual(before);}
 const f=ohioReturnHeaderFixture(),before=structuredClone(f);expect(calculateOhioReturnHeaderSource(f.input,f.header).header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'resident'});expect(f).toEqual(before);
});
