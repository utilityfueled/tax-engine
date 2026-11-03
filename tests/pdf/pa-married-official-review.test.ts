/** Spec: state/pa-married-official-review.yaml. Literal source-first paper values. */
import {it,expect,vi} from 'vitest';
import {PDFForm,PDFTextField,PDFStream,PDFName} from 'pdf-lib';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {preparePAMarriedReturnReview,resolvePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {fillPAMarriedOfficialReview} from '@/pdf/mappings/2025/fill-pa-married-official-review.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {paMarriedOfficialFixture,PA_MARRIED_PAPER_ORACLES} from '../fixtures/pa-married-official-review.js';

const blank=join(process.cwd(),'forms/blank/2025');
const readSaved=String.raw`
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,StreamObject,ArrayObject
import sys,json
seen=set();strings=[];results=[]
for path in json.loads(sys.argv[1]):
 r=PdfReader(path,strict=True);assert len(r.pages)==2;assert not r.get_fields();assert '/AcroForm' not in r.trailer['/Root']
 seen=set()
 def walk(x):
  if isinstance(x,IndirectObject):
   key=(x.idnum,x.generation)
   if key in seen:return
   seen.add(key);obj=x.get_object();assert obj is not None;walk(obj);return
  if isinstance(x,DictionaryObject):
   assert str(x.get('/Subtype',''))!='/Widget'
   for k,v in x.items():
    assert str(k) not in ['/JavaScript','/JS','/OpenAction','/AA'];walk(v)
   if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
  elif isinstance(x,(ArrayObject,list)):
   for v in x:walk(v)
  elif isinstance(x,str):strings.append(x)
 walk(r.trailer)
 for gen,entries in r.xref.items():
  if gen!=65535:
   for oid in entries:
    if oid:walk(IndirectObject(oid,gen,r))
 for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
 texts=[p.extract_text() or '' for p in r.pages]
 for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 results.append({'pages':texts,'objects':len(seen)})
alltext='\n'.join(strings+[t for result in results for t in result['pages']])
for private in ['900-70-0411','900700411','900-70-0412','900700412','91-0000411','910000411','91-0000412','910000412','Fictional native complete married household sources']:
 assert private not in alltext,private
print(json.dumps(results))
`;
type Snapshot={texts:Record<string,string>;statuses:Record<string,string>};
function observe(snapshots:Snapshot[]){
 const original=PDFForm.prototype.flatten;
 return vi.spyOn(PDFForm.prototype,'flatten').mockImplementation(function(this:PDFForm,options){
  const snapshot:Snapshot={texts:{},statuses:{}};
  for(const field of this.getFields()){
   if(field instanceof PDFTextField){
    const value=field.getText()??'';snapshot.texts[field.getName()]=value;
    for(const widget of field.acroField.getWidgets())if(value){const normal=widget.getAppearances()?.normal;expect(normal).toBeInstanceOf(PDFStream);if(!(normal instanceof PDFStream))throw Error('Actual appearance missing');expect(normal.getContents().length).toBeGreaterThan(0);}
   }else snapshot.statuses[field.getName()]=field.acroField.dict.get(PDFName.of('V'))?.toString()??'/Off';
  }
  snapshots.push(snapshot);original.call(this,options);
 });
}
it.each(PA_MARRIED_PAPER_ORACLES)('PA married official review preserves owned physical forms $mode $name',async oracle=>{
 const f=paMarriedOfficialFixture(oracle.mode,oracle.name),before=JSON.stringify(f.input),beforeResult=JSON.stringify(f.result);
 const token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);
 const directory=join(process.cwd(),'.local/upgrade-evidence/pa-married-official-saved',`${oracle.mode}-${oracle.name}`);await mkdir(directory,{recursive:true});
 try{
  const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);
  expect(docs.map(d=>d.filename)).toEqual(oracle.returns.flatMap(row=>[`pa-${row.owner}-40-review.pdf`,...(row.credit!=='0'?[`pa-${row.owner}-sp-review.pdf`]:[])]));
  const paths:string[]=[];
  for(const item of docs){const path=join(directory,item.filename);await writeFile(path,await item.doc.save({useObjectStreams:false}));paths.push(path);}
  const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',readSaved,JSON.stringify(paths)],{encoding:'utf8'}))as Array<{pages:string[];objects:number}>;
  for(const [index,row]of oracle.returns.entries()){
   const offset=oracle.name==='shared-sp'?index*2:index,snapshot=snapshots[offset];expect(snapshot).toBeDefined();if(!snapshot)throw Error('Actual source form snapshot missing');
   for(const [name,value]of Object.entries({[F.line1a]:row.wages,[F.line1c]:row.wages,[F.line9]:row.wages,[F.line11]:row.wages,[F.line12]:row.tax,[F.line13]:row.withholding,[F.line29]:row.refund,[F.line30]:row.refund,[F.line31]:'0'}))expect(snapshot.texts[name],`${row.owner} ${name}`).toBe(value);
   expect(snapshot.statuses[F.filingStatus]).toBe(oracle.mode==='J'?'/2':'/3');expect(snapshot.statuses[F.residencyStatus]).toBe('/1');
   expect(snapshot.texts[F.primaryFirstName]).toBe(row.owner==='spouse'?'ROBIN':'TAYLOR');
   expect(snapshot.texts[F.spouseFirstName]).toBe(row.owner==='spouse'?'TAYLOR':'ROBIN');
   expect(snapshot.texts[F.primarySSN]).toBe('');expect(snapshot.texts[F.spouseSSN]).toBe('');
   if(row.credit==='0'){expect(snapshot.texts[F.line20]).toBe('');expect(snapshot.texts[F.line21]).toBe('');expect(snapshot.statuses[F.taxForgiveness]).toBe('/Off');}
   else{
    expect(snapshot.texts[F.line20]).toBe(row.eligibility);expect(snapshot.texts[F.line21]).toBe(row.credit);expect(snapshot.statuses[F.taxForgiveness]).toBe('/2');
    const sp=snapshots[offset+1];if(!sp)throw Error('Actual SP canonical snapshot missing');
    expect(sp.statuses['SP-eligible-no']).toBe('/Yes');expect(sp.statuses['SP-married']).toBe('/Yes');
    expect(sp.statuses[oracle.mode==='J'?'SP-joint':'SP-separate']).toBe('/Yes');
    expect(sp.statuses['SP-certification']).toBe(oracle.mode==='M'?'/Yes':'/Off');
    expect(sp.texts['SP-dependents']).toBe('0');
    const column=oracle.mode==='J'?'A':'BC';
    for(const [line,value]of Object.entries({'11':row.eligibility,'12':row.tax,'13':'0','14':row.tax,'15':'0.90','16':row.credit}))expect(sp.texts[`SP-${line}-${column}`],`${row.owner} SP${line}`).toBe(value);
    if(oracle.mode==='J')expect(sp.texts['SP-1-A']).toBe('13001');
    else{expect(sp.texts['SP-1-B']).toBe(row.owner==='primary'?'10000':'3001');expect(sp.texts['SP-1-C']).toBe(row.owner==='primary'?'3001':'10000');}
    for(const col of oracle.mode==='J'?['A']:['B','C'])for(const line of [2,3,4,5,6,7,8,9,10])expect(sp.texts[`SP-${line}-${col}`]).toBe('0');
   }
   expect(saved[offset]?.objects).toBeGreaterThan(0);expect(saved[offset]?.pages.join('\n')).toContain(row.wages);
   if(oracle.mode==='J'&&oracle.name==='cents')expect(saved[offset]?.pages.join('\n')).toContain('PA does not issue refunds of $1 or less');
  }
  expect(JSON.stringify(f.input)).toBe(before);expect(JSON.stringify(f.result)).toBe(beforeResult);
  await writeFile(join(directory,'canonical-snapshots.json'),JSON.stringify(snapshots,null,2)+'\n');
 }finally{spy.mockRestore();}
});

it('PA married official review rejects changed authority before IO',async()=>{
 for(const kind of ['forged','missing','same-cash-name','changed-owner','changed-federal','changed-result','stripped-packet','stripped-result','string-money']as const){
  const f=paMarriedOfficialFixture(),token=preparePAMarriedReturnReview(f.input);
  expect(resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),f.result,token)).toHaveLength(2);
  let supplied:typeof token=token;
  if(kind==='forged')supplied={}as typeof token;
  if(kind==='missing')supplied=undefined as unknown as typeof token;
  if(kind==='same-cash-name')f.input.w2s[0].employer.name+=' changed';
  if(kind==='changed-owner')f.input.taxpayer.primary.firstName+=' changed';
  if(kind==='changed-federal')f.result.agi=f.result.agi.plus(1);
  if(kind==='changed-result')f.married.returns[0].pa40.stateWithholding=f.married.returns[0].pa40.stateWithholding.plus(1);
  if(kind==='stripped-packet')delete f.input.paMarriedOrdinarySources;
  if(kind==='string-money'){const _actual=f.married.returns[0].pa40.stateWithholding;f.married.returns[0].pa40.stateWithholding='1535' as unknown as typeof _actual;}
  if(kind==='stripped-result')delete (f.result.stateReturns as Record<string,unknown>).pennsylvania;
  await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,'/missing/template/directory',supplied),kind).rejects.toThrow(/source|context|original|prepared|result|changed|packet/i);
 }
});
it('PA married official review rejects changed template bytes',async()=>{
 const f=paMarriedOfficialFixture('J','shared-sp'),token=preparePAMarriedReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-married-bad-revision-'));
 try{
  await mkdir(dir,{recursive:true});
  for(const name of ['pa-40.pdf','pa-schedule-sp.pdf'])await writeFile(join(dir,name),await readFile(join(blank,name)));
  await writeFile(join(dir,'pa-schedule-sp.pdf'),Buffer.concat([await readFile(join(dir,'pa-schedule-sp.pdf')),Buffer.from('\n% changed revision\n')]));
  await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,dir,token)).rejects.toThrow(/revision|hash|template/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('PA married official review retains current public paper guards and unavailable years',async()=>{
 const f=paMarriedOfficialFixture(),token=preparePAMarriedReturnReview(f.input);
 await expect(fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:'/missing',outputDir:'/missing'})).rejects.toThrow(/married|prepared|owned/i);
 f.input.taxpayer.taxYear=2026;f.result.taxYear=2026;
 await expect(fillPAMarriedOfficialReview(f.input,f.result,'/missing',token)).rejects.toThrow(/2026|year|source|mapping/i);
});
