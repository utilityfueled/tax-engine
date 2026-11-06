/** Spec: state/oh-resident-credit-official-review.yaml. Existing APIs only before new helper. */
import {expect,it,vi} from 'vitest';
import {access,copyFile,mkdir,mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {PDFForm,PDFTextField,PDFStream,PDFDict} from 'pdf-lib';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {calculateOhioReturnHeaderSource} from '@/engine/state/oh-return-header-source';
import {prepareOhioResidentCreditOfficialReview,fillOhioResidentCreditOfficialReview,type PreparedOhioResidentCreditOfficialReview} from '@/pdf/mappings/2025/fill-oh-resident-credit-official-review';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {ohioNonResidentCreditHeaderReferenceFixture,ohioResidentCreditRawWithholdingFixture,residentCreditRawWithholdingCells,ohioResidentCreditOfficialReviewFixture,residentCreditPhysicalCash,residentCreditPhysicalCells,residentCreditPhysicalFiles,replaceResidentCreditPhysicalEmployerAccount,requireResidentCreditOriginal,type ResidentCreditPhysicalCase} from '../fixtures/oh-resident-credit-official-review';
const cohorts=['distinct','cents'] as const;
function fixture(kind:ResidentCreditPhysicalCase='distinct'){const input=ohioResidentCreditOfficialReviewFixture(kind),federal=calculateFederalTax(input);return{input,federal};}
it.each(cohorts)('Ohio resident credit physical existing source baseline %s',kind=>{
 const {input,federal}=fixture(kind),before=structuredClone(input),cash=residentCreditPhysicalCash[kind];
 const header=calculateOhioReturnHeaderSource(input,input.ohioReturnHeaderSources),ohio=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 expect(header.header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'resident'});expect(header.residentDays).toBe(365);
 expect(federal.agi.eq('100000')).toBe(true);expect(ohio.it1040.line3_ohioAgi.toFixed(0)).toBe('100000');expect(ohio.it1040.line7_taxableNonbusinessIncome.toFixed(0)).toBe('98100');
 expect(ohio.residentCredit?.line4_apportionmentFraction.toFixed(4)).toBe('0.6000');expect(ohio.residentCredit?.line6_ohioTaxOnOtherStateIncome.toFixed(0)).toBe('1394');expect(ohio.residentCredit?.line7_residentCredit.toFixed(0)).toBe(cash.credit);
 expect(ohio.it1040.line10_taxAfterCredits.toFixed(0)).toBe(cash.tax);expect(ohio.it1040.line14_ohioWithholding.toFixed(0)).toBe('2000');expect(ohio.it1040.line26_refund.toFixed(0)).toBe(cash.refund);
 expect(requireResidentCreditOriginal(input.w2s[0]?.stateLocalSources).stateRows.find(row=>row.state==='OH')?.employerStateID).toBe(kind==='cents'?'071004129':'07100412');expect(input).toEqual(before);
});
type LogicalSnapshot={text:Record<string,string>;widgets:Array<{name:string;rect:number[];state:string;hasAppearance:boolean}>};
function logicalObserver(snapshots:LogicalSnapshot[]){
 const original=PDFForm.prototype.flatten;
 return vi.spyOn(PDFForm.prototype,'flatten').mockImplementation(function(this:PDFForm,options){
  const snapshot:LogicalSnapshot={text:{},widgets:[]};
  for(const field of this.getFields()){
   if(field instanceof PDFTextField)snapshot.text[field.getName()]=field.getText()??'';
   for(const widget of field.acroField.getWidgets()){
    const rectangle=widget.getRectangle(),state=widget.getAppearanceState(),normal=widget.getAppearances()?.normal;
    const selected=normal instanceof PDFDict&&state?normal.lookup(state):normal;
    const hasAppearance=selected instanceof PDFStream&&selected.getContents().length>0;
    snapshot.widgets.push({name:field.getName(),rect:[rectangle.x,rectangle.y,rectangle.x+rectangle.width,rectangle.y+rectangle.height],state:state?.toString()??'/Off',hasAppearance});
   }
  }
  snapshots.push(snapshot);original.call(this,options);
 });
}
// Independent saved paint reader. It follows nested Form transforms, every xref and all string/stream objects.
const reader=String.raw`from pypdf import PdfReader
from pypdf.generic import DictionaryObject,ArrayObject,IndirectObject,StreamObject,TextStringObject,ByteStringObject,ContentStream
import json,sys,re,hashlib
files=json.loads(sys.argv[1]);cells=json.loads(sys.argv[2]);out=[]
source_paths={
 'bundle':('forms/blank/2025/oh-it1040-bundle.pdf','4e6432e23df3bf181a8e9d7ee5d5bb7e2e96a6a21dd65fa39c625fb8a7e2f57c'),
 'rc':('forms/blank/2025/oh-it-rc.pdf','ebd9960d6a8004d6803f0f22238f989043db794e9ebc9aa9fcb3d5588112cb48')}
source_readers={}
for key,(path,expected_hash) in source_paths.items():
 with open(path,'rb') as source:assert hashlib.sha256(source.read()).hexdigest()==expected_hash,'Original appearance source differs'
 source_readers[key]=PdfReader(path,strict=True)
source_pages={'oh-it-1040-review.pdf':('bundle',[0,1]),'oh-it-rc-review.pdf':('rc',[0]),'oh-schedule-credits-review.pdf':('bundle',[6,7]),'oh-schedule-of-withholding-review.pdf':('bundle',[10,11])}
def operation_signature(stream,reader):
 return [(op.decode('latin1'),[str(value) for value in args]) for args,op in ContentStream(stream,reader).operations]
def original_button_states(cell):
 key,pages=source_pages[cell['file']];source=source_readers[key];found=[]
 for ref in source.pages[pages[cell['page']-1]].get('/Annots',[]):
  widget=ref.get_object();assert widget is not None,'Original source widget unresolved'
  parent=widget.get('/Parent');parent=parent.get_object() if parent is not None else widget
  name=widget.get('/T',parent.get('/T'));rect=list(map(float,widget['/Rect']))
  if name==cell['name'] and all(abs(a-b)<.0001 for a,b in zip(rect,cell['rect'])):found.append(widget)
 assert len(found)==1,'Original button widget inventory differs'
 normal=found[0]['/AP']['/N'];assert isinstance(normal,DictionaryObject) and not isinstance(normal,StreamObject),'Original button state dictionary required'
 states={str(state):operation_signature(stream.get_object(),source) for state,stream in normal.items()}
 if '/Off' not in states:
  # Exact source has five unselected spouse widgets without an Off stream. The
  # pinned library's default unchecked appearance contains only the perimeter.
  widget=found[0];assert cell['name'] in ['CHK_SP_DEC','CHK_SP_RES','CHK_SP_NON_RES_STMT'],'Unexpected missing source Off'
  assert str(widget.get('/AS'))=='/Off' and widget.get('/BS') is None and widget.get('/Border') is None,'Missing-Off source boundary changed'
  assert set(widget.get('/MK',{}))=={'/CA'} and str(widget['/MK']['/CA'])=='4','Missing-Off appearance characteristics changed'
  width=format(abs(float(widget['/Rect'][2])-float(widget['/Rect'][0])),'.12g');height=format(abs(float(widget['/Rect'][3])-float(widget['/Rect'][1])),'.12g')
  identity=('cm',['1','0','0','1','0','0'])
  states['/Off']=[identity,identity,('q',[]),('RG',['0','0','0']),('w',['0']),('d',['[]','0']),identity,identity,identity,('m',['0','0']),('l',['0',height]),('l',[width,height]),('l',[width,'0']),('h',[]),('S',[]),('Q',[])]
 assert len({json.dumps(signature) for signature in states.values()})==len(states),'Original button appearances indistinguishable'
 return states
def multiply(a,b):
 return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
def collect_bytes(raw,strings):
 strings.append(raw.decode('latin1'))
 for encoding in ['utf-8','utf-16','utf-16-be','utf-16-le']:
  try:strings.append(raw.decode(encoding))
  except UnicodeError:pass
def transformed(box,m):
 x0,y0,x1,y1=map(float,box);points=[(x*m[0]+y*m[2]+m[4],x*m[1]+y*m[3]+m[5]) for x,y in [(x0,y0),(x0,y1),(x1,y0),(x1,y1)]]
 return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
for entry in files:
 r=PdfReader(entry['path'],strict=True);seen=set();strings=[];actions=[0]
 def walk(v):
  if isinstance(v,IndirectObject):
   key=(v.idnum,v.generation)
   if key in seen:return
   seen.add(key);target=v.get_object();assert target is not None,'Unresolved indirect PDF target';walk(target);return
  if isinstance(v,TextStringObject):strings.append(str(v));return
  if isinstance(v,ByteStringObject):
   collect_bytes(bytes(v),strings)
   return
  if isinstance(v,DictionaryObject):
   for k,item in v.items():
    if str(k) in ['/A','/AA','/OpenAction','/JS','/JavaScript','/Launch','/SubmitForm']:actions[0]+=1
    walk(item)
   if isinstance(v,StreamObject):collect_bytes(v.get_data(),strings)
  elif isinstance(v,ArrayObject):
   for item in v:walk(item)
 walk(r.trailer)
 for generation,objects in r.xref.items():
  for oid in objects:
   if oid:walk(IndirectObject(oid,generation,r))
 for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
 assert not r.get_fields(),'Unexpected fields';assert actions[0]==0,'Unexpected actions'
 texts=[page.extract_text() or '' for page in r.pages]
 for page,text in zip(r.pages,texts):
  assert not page.get('/Annots',[]),'Unexpected annotation'
  assert 'FOR REVIEW ONLY - NOT FOR FILING' in text,'Missing per-page notice'
 combined='\n'.join(texts+strings+[str(r.metadata)])
 for token in ['900-71-0412','900710412','PRIVATE-','091000011000001','091000011000002','VA-2026-POST-70001','VA-2026-POST-70002','originalResidentCreditSourcePacket','originalFederalSources']:
  assert token not in combined,'Personal/source privacy sentinel retained'
 observed=[]
 for pageIndex,page in enumerate(r.pages):
  selected=[c for c in cells if c['file']==entry['name'] and c['page']==pageIndex+1];values=[{'text':'','paint':False} for c in selected]
  def forms(content,resources,matrix,depth=0):
   assert depth<24,'Unexpected Form recursion';stack=[]
   for args,op in ContentStream(content,r).operations:
    if op==b'q':stack.append(matrix)
    elif op==b'Q':matrix=stack.pop()
    elif op==b'cm':matrix=multiply(tuple(map(float,args)),matrix)
    elif op==b'Do':
     obj=resources['/XObject'][args[0]].get_object();assert obj is not None,'Missing XObject'
     if obj.get('/Subtype')!='/Form':continue
     actual=multiply(tuple(map(float,obj.get('/Matrix',[1,0,0,1,0,0]))),matrix);bounds=transformed(obj['/BBox'],actual)
     matches=[i for i,c in enumerate(selected) if all(abs(a-b)<=.3 for a,b in zip(bounds,[min(c['rect'][0],c['rect'][2]),min(c['rect'][1],c['rect'][3]),max(c['rect'][0],c['rect'][2]),max(c['rect'][1],c['rect'][3])]))]
     if matches:
      assert len(matches)==1,'Ambiguous physical cell';index=matches[0];text=re.sub(r'\s+','',''.join(page.extract_xform_text(obj)))
      if selected[index]['type']=='/Tx':values[index]['text']+=text
      else:
       actual_signature=operation_signature(obj,r);states=original_button_states(selected[index]);matching=[state for state,signature in states.items() if signature==actual_signature]
       assert len(matching)==1,'Saved button appearance differs from exact original states'
       values[index]['paint']=values[index]['paint'] or matching[0]!='/Off'
     else:forms(obj,obj.get('/Resources',resources),actual,depth+1)
  forms(page['/Contents'],page['/Resources'],(1,0,0,1,0,0))
  observed.extend([{'name':c['name'],'page':pageIndex+1,'rect':c['rect'],**v} for c,v in zip(selected,values)])
 out.append({'name':entry['name'],'pages':len(r.pages),'objects':len(seen),'fields':0,'annotations':0,'actions':0,'cells':observed})
print(json.dumps(out))`;
type PhysicalReport={name:string;pages:number;objects:number;fields:number;annotations:number;actions:number;cells:Array<{name:string;page:number;rect:number[];text:string;paint:boolean}>};
it.each(cohorts)('Ohio resident credit physical existing API emits complete original-bound official companions %s',async kind=>{
 const {input,federal}=fixture(kind),before=structuredClone(input),context=prepareOhioResidencyReview(input),dir=await mkdtemp(join(tmpdir(),'oh-resident-physical-')),snapshots:LogicalSnapshot[]=[],spy=logicalObserver(snapshots);
 try{
  const packet=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,dir,{},context),names=packet.filledForms.map(path=>basename(path));
  for(const name of Object.keys(residentCreditPhysicalFiles))expect(names).toContain(name);
  expect(names).not.toContain('oh-it-nrc-review.pdf');
  const entries=Object.entries(residentCreditPhysicalFiles).map(([name,pages])=>({name,pages,path:join(dir,name)}));
  const reports=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',reader,JSON.stringify(entries),JSON.stringify(residentCreditPhysicalCells)],{encoding:'utf8'})) as PhysicalReport[];
  expect(reports).toHaveLength(4);expect(reports.flatMap(row=>row.cells)).toHaveLength(336);
  for(const expected of residentCreditPhysicalCells){
   const report=requireResidentCreditOriginal(reports.find(row=>row.name===expected.file)),cell=requireResidentCreditOriginal(report.cells.find(row=>row.page===expected.page&&row.name===expected.name&&row.rect.every((n,index)=>n===expected.rect[index]))),value=expected[kind];
   if(expected.type==='/Tx')expect(cell.text,`${kind} actual saved ${expected.file}/${expected.page}/${expected.name}`).toBe(value.replace(/\s+/g,''));
   else expect(cell.paint,`${kind} actual selected mark ${expected.name}`).toBe(value!=='/Off');
   const logical=requireResidentCreditOriginal(snapshots.find(row=>expected.file==='oh-it-rc-review.pdf'?'SUM_A' in row.text:'SD_NUM' in row.text));
   if(expected.type==='/Tx')expect(logical.text[expected.name]??'',`actual canonical ${expected.name}`).toBe(value);
   else{
    const bounds=(rect:readonly number[])=>[Math.min(rect[0]??0,rect[2]??0),Math.min(rect[1]??0,rect[3]??0),Math.max(rect[0]??0,rect[2]??0),Math.max(rect[1]??0,rect[3]??0)];
    const widget=requireResidentCreditOriginal(logical.widgets.find(row=>row.name===expected.name&&bounds(row.rect).every((n,index)=>Math.abs(n-(bounds(expected.rect)[index]??0))<.3)));
    expect(widget.state).toBe(value);if(value!=='/Off')expect(widget.hasAppearance).toBe(true);
   }
  }
  for(const entry of entries)expect(reports.find(row=>row.name===entry.name)?.pages).toBe(entry.pages);
  expect(input).toEqual(before);
  const retain=process.env.TAX_ENGINE_OH_RC_OFFICIAL_REVIEW_OUTPUT_DIR;
  if(retain){const out=join(retain,kind);await mkdir(out,{recursive:true});for(const entry of entries)await copyFile(entry.path,join(out,entry.name));await writeFile(join(out,'safe-physical-reader-report.json'),JSON.stringify(reports,null,2));}
 }finally{spy.mockRestore();const retain=process.env.TAX_ENGINE_OH_RC_OFFICIAL_REVIEW_OUTPUT_DIR;if(retain){const out=join(retain,kind);await mkdir(out,{recursive:true});for(const name of await readdir(dir))if(name.endsWith('.pdf'))await copyFile(join(dir,name),join(out,name));}await rm(dir,{recursive:true,force:true});}
});
const conflicts=['forged context','redacted without context','stale federal','changed same-money owner','changed same-money payer','changed same-money receipt','changed header original reference','absent RC with retained header','missing header source record','header false confirmation','header wrong county','header district9999','stale header federal original','stale header residency original','stale header payment original','other retained zero-income form','unsupported spouse','unsupported2026','nonresident source'] as const;
it.each(conflicts)('Ohio resident credit physical rejects conflicting actual original before output %s',async kind=>{
 const {input,federal}=fixture(),context=prepareOhioResidencyReview(input),header=requireResidentCreditOriginal(input.ohioReturnHeaderSources),facts=requireResidentCreditOriginal(input.ohioResidency),source=requireResidentCreditOriginal(facts.residentCreditSources);
 if(kind==='stale federal')federal.agi=federal.agi.plus(1);
 if(kind==='changed same-money owner')input.taxpayer.primary.lastName='Changed current actual owner';
 if(kind==='changed same-money payer')requireResidentCreditOriginal(input.w2s[0]).employer.name='Changed current actual payer';
 if(kind==='changed same-money receipt')requireResidentCreditOriginal(source.completedAccount.payments[1]).sourceReference='PRIVATE-CHANGED-SAME-MONEY-RECEIPT';
 if(kind==='changed header original reference')header.sourceReference='PRIVATE-CHANGED-SAME-CELL-HEADER';
 if(kind==='absent RC with retained header')Reflect.deleteProperty(facts,'residentCreditSources');
 if(kind==='missing header source record')Reflect.deleteProperty(header,'sourceReference');
 if(kind==='header false confirmation')Reflect.set(header,'sourceFactsConfirmed',false);
 if(kind==='header wrong county'){header.finderOriginal.countyName='Narnia';header.countyOriginal.countyName='Narnia';}
 if(kind==='header district9999')header.finderOriginal.districtCode='9999';
 if(kind==='stale header federal original')Reflect.set(header.originalFederalSources,'unreviewed',true);
 if(kind==='stale header residency original')header.originalOhioResidencySources.sourceReference='PRIVATE-OLD-DOMICILE';
 if(kind==='stale header payment original')header.originalOhioPaymentSources.sourceReference='PRIVATE-OLD-PAYMENTS';
 if(kind==='other retained zero-income form')Reflect.set(input,'form1099Int',[{taxYear:2025,accountHolder:'primary',payerName:'Actual retained zero interest original',box1:'0'}]);
 if(kind==='unsupported spouse')input.taxpayer.spouse={...input.taxpayer.primary,firstName:'Actual other owner'};
 if(kind==='unsupported2026')input.taxpayer.taxYear=2026;
 if(kind==='nonresident source')requireResidentCreditOriginal(facts.owners[0]).status='nonresident';
 const before=structuredClone(input),dir=await mkdtemp(join(tmpdir(),'oh-resident-denial-')),output=join(dir,'must-not-exist');
 const token=kind==='forged context'?{} as typeof context:kind==='redacted without context'?undefined:context;
 // These fresh-context controls must fail on their facts, not solely the old token comparison.
 const freshKinds=['missing header source record','header false confirmation','header wrong county','header district9999','stale header federal original','stale header residency original','stale header payment original'] as readonly string[];
 const actualToken=freshKinds.includes(kind)?prepareOhioResidencyReview(input):token;
 try{await expect(fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{},actualToken)).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(input).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});
it.each([undefined,'PRIVATE-OH-RC-STATE-ID','1234567','1234567890','ABCDEFGH'] as const)('Ohio resident credit physical rejects incomplete actual employer account before output %s',async value=>{
 const {input,federal}=fixture();replaceResidentCreditPhysicalEmployerAccount(input,value);const before=structuredClone(input),dir=await mkdtemp(join(tmpdir(),'oh-resident-account-')),output=join(dir,'must-not-exist');
 // Raw current originals let the public API perform its own preparation/validation; no invalid prerequisite outside the assertion.
 try{await expect(fillOhioReferenceForms(input,federal,output,{})).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(input).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});
it.each(['useTax','creditCarryforward','donations','amendedPriorOverpayment'] as const)('Ohio resident credit physical rejects caller cash before output %s',async key=>{
 const {input,federal}=fixture(),context=prepareOhioResidencyReview(input),dir=await mkdtemp(join(tmpdir(),'oh-resident-cash-')),output=join(dir,'must-not-exist');
 try{await expect(fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{[key]:'10'},context)).rejects.toThrow();await expect(access(output)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}
});
it('Ohio resident credit physical preserves reference-only output without actual header',async()=>{
 const {input,federal}=fixture();Reflect.deleteProperty(input,'ohioReturnHeaderSources');const context=prepareOhioResidencyReview(input),before=structuredClone(input),dir=await mkdtemp(join(tmpdir(),'oh-resident-reference-'));
 try{const packet=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,dir,{},context),names=packet.filledForms.map(path=>basename(path));expect(names).toContain('oh-resident-credit-reference.pdf');for(const name of Object.keys(residentCreditPhysicalFiles))expect(names).not.toContain(name);expect(input).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});

it.each(['zero','positive_cents'] as const)('Ohio resident credit raw withholding new source baseline %s',kind=>{
 const input=ohioResidentCreditRawWithholdingFixture(kind),before=structuredClone(input),federal=calculateFederalTax(input),ohio=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 expect(federal.agi.toFixed(0)).toBe('40000');expect(ohio.it1040.line4_exemptions.toFixed(0)).toBe('2400');expect(ohio.it1040.line7_taxableNonbusinessIncome.toFixed(0)).toBe('37600');
 expect(ohio.residentCredit?.line4_apportionmentFraction.toFixed(4)).toBe('1.0000');expect(ohio.residentCredit?.line5_taxAvailable.toFixed(0)).toBe('660');expect(ohio.residentCredit?.line7_residentCredit.toFixed(0)).toBe('660');
 expect(ohio.it1040.line10_taxAfterCredits.toFixed(0)).toBe('0');expect(ohio.it1040.line14_ohioWithholding.toFixed(0)).toBe('0');expect(ohio.it1040.line11_underpaymentPenalty.toFixed(0)).toBe('0');expect(ohio.it1040.line26_refund.toFixed(0)).toBe('0');
 expect(requireResidentCreditOriginal(requireResidentCreditOriginal(input.w2s[0]).stateLocalSources).stateRows.find(row=>row.state==='OH')?.withheld).toBe(kind==='zero'?'0.00':'0.49');
 expect(calculateOhioReturnHeaderSource(input,input.ohioReturnHeaderSources).header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'resident'});expect(input).toEqual(before);
});
it.each(['zero','positive_cents'] as const)('Ohio resident credit raw withholding physical scope %s',async kind=>{
 const input=ohioResidentCreditRawWithholdingFixture(kind),before=structuredClone(input),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input),dir=await mkdtemp(join(tmpdir(),'oh-rc-raw-wh-'));
 try{
  const packet=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,dir,{},context),names=packet.filledForms.map(path=>basename(path)),include=kind==='positive_cents';
  const files=Object.entries(residentCreditPhysicalFiles).filter(([name])=>include||name!=='oh-schedule-of-withholding-review.pdf');
  for(const [name]of files)expect(names).toContain(name);
  if(!include)expect(names).not.toContain('oh-schedule-of-withholding-review.pdf');expect(names).not.toContain('oh-it-nrc-review.pdf');
  const cells=residentCreditRawWithholdingCells(kind),entries=files.map(([name,pages])=>({name,pages,path:join(dir,name)}));
  const reports=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',reader,JSON.stringify(entries),JSON.stringify(cells)],{encoding:'utf8'})) as PhysicalReport[];
  expect(reports).toHaveLength(include?4:3);expect(reports.flatMap(row=>row.cells)).toHaveLength(include?336:225);
  for(const expected of cells){
   const report=requireResidentCreditOriginal(reports.find(row=>row.name===expected.file)),cell=requireResidentCreditOriginal(report.cells.find(row=>row.page===expected.page&&row.name===expected.name&&row.rect.every((n,index)=>n===expected.rect[index])));
   if(expected.type==='/Tx')expect(cell.text,`${kind} saved ${expected.file}/${expected.name}`).toBe(expected.expected.replace(/\s+/g,''));else expect(cell.paint,`${kind} selected ${expected.name}`).toBe(expected.expected!=='/Off');
  }
  for(const entry of entries)expect(reports.find(row=>row.name===entry.name)?.pages).toBe(entry.pages);expect(input).toEqual(before);
 }finally{
  const retain=process.env.TAX_ENGINE_OH_RC_OFFICIAL_REVIEW_OUTPUT_DIR;if(retain){const out=join(retain,'raw-'+kind);await mkdir(out,{recursive:true});for(const name of await readdir(dir))if(name.endsWith('.pdf'))await copyFile(join(dir,name),join(out,name));}await rm(dir,{recursive:true,force:true});
 }
});

it('Ohio resident credit physical rejects forged helper tokens before output',async()=>{
 const {input,federal}=fixture(),before=structuredClone(input),context=prepareOhioResidencyReview(input),token=requireResidentCreditOriginal(prepareOhioResidentCreditOfficialReview(input,federal,{},context));
 const dir=await mkdtemp(join(tmpdir(),'oh-rc-token-denial-')),impostors:unknown[]=[{}, {...token}, Object.create(token)];
 try{for(const [index,impostor]of impostors.entries()){const output=join(dir,'must-not-exist-'+index);await expect(fillOhioResidentCreditOfficialReview(impostor as PreparedOhioResidentCreditOfficialReview,output)).rejects.toThrow();await expect(access(output)).rejects.toThrow();}expect(input).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});
it.each(['0','10'] as const)('Ohio resident credit physical prepare rejects caller overlay %s',amount=>{
 const {input,federal}=fixture(),before=structuredClone(input),context=prepareOhioResidencyReview(input);
 expect(()=>prepareOhioResidentCreditOfficialReview(input,federal,{useTax:amount},context)).toThrow();expect(input).toEqual(before);
});
it('Ohio resident credit physical preserves valid nonRC header reference semantics',async()=>{
 const input=ohioNonResidentCreditHeaderReferenceFixture(),before=structuredClone(input),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input),ohio=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 expect(ohio.residentCredit).toBeNull();expect(ohio.it1040.line10_taxAfterCredits.toFixed(0)).toBe('2323');expect(ohio.it1040.line14_ohioWithholding.toFixed(0)).toBe('3000');expect(ohio.it1040.line26_refund.toFixed(0)).toBe('677');
 expect(calculateOhioReturnHeaderSource(input,input.ohioReturnHeaderSources).header).toEqual({schoolDistrictNumber:'2503',ohioCounty:'FRAN',residency:'resident'});
 expect(prepareOhioResidentCreditOfficialReview(input,federal,{},context)).toBeUndefined();
 const dir=await mkdtemp(join(tmpdir(),'oh-nonrc-header-reference-'));
 try{const packet=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,dir,{},context),names=packet.filledForms.map(path=>basename(path));expect(names).toContain('oh-it-1040-reference.pdf');for(const name of Object.keys(residentCreditPhysicalFiles))expect(names).not.toContain(name);expect(input).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});
