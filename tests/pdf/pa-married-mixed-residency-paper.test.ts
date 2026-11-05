/** Spec: state/pa-married-mixed-residency-paper.yaml. */
import {expect,it,vi} from 'vitest';
import {PDFForm,PDFTextField,PDFName} from 'pdf-lib';
import {preparePAMarriedReturnReview,resolvePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {fillPAMarriedOfficialReview} from '@/pdf/mappings/2025/fill-pa-married-official-review.js';
import {PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {marriedOriginals} from '../fixtures/pa-married-ordinary-return.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {mixedPaperFixture} from '../fixtures/pa-married-mixed-residency-paper.js';
import {paMarriedOfficialFixture} from '../fixtures/pa-married-official-review.js';
function required<T>(value:T|null|undefined):T{if(value===undefined||value===null)throw Error('Actual fictional fact required');return value;}
function privateMarkers(value:unknown):string[]{
 const found=new Set<string>();function visit(item:unknown){if(!item||typeof item!=='object')return;for(const [key,child]of Object.entries(item)){if(typeof child==='string'&&child.trim()&&/(?:ssn|tin|ein|taxid|identifyingnumber|accountReference|sourceReference|confirmationNumber|returnId)$/i.test(key)){found.add(child);const digits=child.replace(/\D/g,'');if(/^[-.()\s\d]+$/.test(child)&&digits.length>=4)found.add(digits);}else visit(child);}}visit(value);return [...found];
}
const blank=process.cwd()+'/forms/blank/2025';
type Snapshot={texts:Record<string,string>;statuses:Record<string,string>};
function observe(snapshots:Snapshot[]){const original=PDFForm.prototype.flatten;return vi.spyOn(PDFForm.prototype,'flatten').mockImplementation(function(this:PDFForm,options){const snapshot:Snapshot={texts:{},statuses:{}};for(const field of this.getFields()){if(field instanceof PDFTextField)snapshot.texts[field.getName()]=field.getText()??'';else snapshot.statuses[field.getName()]=field.acroField.dict.get(PDFName.of('V'))?.toString()??'/Off';}snapshots.push(snapshot);original.call(this,options);});}
it('renders actual owned nonresident and part-year status dates school and cash',async()=>{
 for(const kind of ['nonresident','part_year']as const){const f=mixedPaperFixture(kind),before=JSON.stringify(f),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);
 try{const papers=resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),f.result,token);expect(papers.map(p=>p.projection.residency?.status)).toEqual(['resident',kind]);const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);expect(docs.map(d=>d.filename)).toEqual(['pa-primary-40-review.pdf','pa-spouse-40-review.pdf']);
 expect(snapshots[0].statuses[F.residencyStatus]).toBe('/1');expect(snapshots[1].statuses[F.residencyStatus]).toBe(kind==='nonresident'?'/2':'/3');expect(snapshots[1].statuses[F.filingStatus]).toBe('/3');expect(snapshots[1].texts[F.partYearFrom]).toBe(kind==='part_year'?'07/01':'');expect(snapshots[1].texts[F.partYearTo]).toBe(kind==='part_year'?'12/31':'');expect(snapshots[1].texts[F.schoolCode]).toBe(kind==='nonresident'?'99999':'02745');expect(snapshots[1].texts[F.schoolDistrictName]).toBe(kind==='nonresident'?'':'PITTSBURGH');expect(snapshots[1].texts[F.line1a]).toBe(kind==='nonresident'?'12000':'18000');expect(snapshots[1].texts[F.line13]).toBe(kind==='nonresident'?'368':'553');expect(snapshots[0].texts[F.line13]).toBe('1535');expect(JSON.stringify(f)).toBe(before);
 }finally{spy.mockRestore();}}
});
it('splits actual excluded worldwide wages onto SP6 on both separate worksheets',async()=>{
 for(const kind of ['nonresident','part_year']as const){const f=mixedPaperFixture(kind,true),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);
 try{const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);expect(docs).toHaveLength(4);const primary=snapshots[1],spouse=snapshots[3];
 for(const sp of [primary,spouse]){expect(sp.texts['SP-11-BC']).toBe('13001');expect(sp.texts['SP-15-BC']).toBe('0.90');}
 expect(primary.texts['SP-1-B']).toBe('10000');expect(primary.texts['SP-6-B']).toBe('0');expect(primary.texts['SP-1-C']).toBe(kind==='nonresident'?'1000':'2200');expect(primary.texts['SP-6-C']).toBe(kind==='nonresident'?'2001':'801');expect(spouse.texts['SP-1-B']).toBe(primary.texts['SP-1-C']);expect(spouse.texts['SP-6-B']).toBe(primary.texts['SP-6-C']);expect(spouse.texts['SP-1-C']).toBe('10000');expect(spouse.texts['SP-6-C']).toBe('0');expect(primary.texts['SP-16-BC']).toBe('276');expect(spouse.texts['SP-16-BC']).toBe(kind==='nonresident'?'28':'61');
 }finally{spy.mockRestore();}}
});
it('rejects stale forged and altered mixed results before template IO',async()=>{
 for(const kind of ['forged','source','timeline','school','owner','result','federal']as const){const f=mixedPaperFixture(),token=preparePAMarriedReturnReview(f.input);resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),f.result,token);if(kind==='source')f.sources.wages[1].sourceReference+=' changed';if(kind==='timeline')required(f.sources.residencySources).owners[1].residency.domicilePeriods[0].daysInPA=169;if(kind==='school')required(f.sources.residencySources).owners[1].residency.schoolDistrictName+=' changed';if(kind==='owner')required(f.input.taxpayer.spouse).lastName+=' changed';if(kind==='result')required(f.married.returns[1].residency).status='resident';if(kind==='federal')f.result.agi=f.result.agi.plus(1);await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,'/missing/mixed-template',kind==='forged'?{}as typeof token:token)).rejects.toThrow(/source|context|original|result|changed/);}
});
it('preserves existing resident projections and unavailable year guards',async()=>{
 for(const mode of ['J','M']as const){const f=paMarriedOfficialFixture(mode,'shared-sp'),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);try{await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);expect(snapshots[0].statuses[F.residencyStatus]).toBe('/1');expect(snapshots[1].texts[mode==='J'?'SP-1-A':'SP-1-B']).toBe(mode==='J'?'13001':'10000');}finally{spy.mockRestore();}}
 const f=mixedPaperFixture();f.input.taxpayer.taxYear=2026;expect(()=>preparePAMarriedReturnReview(f.input)).toThrow(/2026|year/);
});

it.each(['nonresident','part_year']as const)('binds actual owner identity even when primary is the %s spouse',async kind=>{
 const f=mixedPaperFixture(kind,false,true),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);
 try{await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);expect(snapshots[0].statuses[F.residencyStatus]).toBe(kind==='nonresident'?'/2':'/3');expect(snapshots[0].texts[F.primaryFirstName]).toBe('MORGAN');expect(snapshots[0].texts[F.line1a]).toBe(kind==='nonresident'?'12000':'18000');expect(snapshots[1].statuses[F.residencyStatus]).toBe('/1');expect(snapshots[1].texts[F.line1a]).toBe('50000');}finally{spy.mockRestore();}
});
it('renders an actual move-out period without inferring December31 PA residence',async()=>{
 const f=mixedPaperFixture('part_year',false,false,true),token=preparePAMarriedReturnReview(f.input),snapshots:Snapshot[]=[],spy=observe(snapshots);
 try{await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);const p=snapshots[1];expect(p.statuses[F.residencyStatus]).toBe('/3');expect(p.texts[F.partYearFrom]).toBe('01/01');expect(p.texts[F.partYearTo]).toBe('06/30');expect(p.texts[F.schoolCode]).toBe('99999');expect(p.texts[F.schoolDistrictName]).toBe('');expect(p.texts[F.line1a]).toBe('21000');expect(p.texts[F.line12]).toBe('645');}finally{spy.mockRestore();}
});
const inspectSaved=String.raw`
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject
import json,sys
results=[];allstrings=[]
for path in json.loads(sys.argv[1]):
 r=PdfReader(path,strict=True);seen=set();strings=[]
 def walk(x):
  if isinstance(x,IndirectObject):
   key=(x.idnum,x.generation)
   if key in seen:return
   seen.add(key);walk(x.get_object());return
  if isinstance(x,DictionaryObject):
   assert str(x.get('/Subtype',''))!='/Widget'
   for k,v in x.items():assert str(k) not in ['/AcroForm','/JS','/JavaScript','/OpenAction','/AA'];walk(v)
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
 texts=[page.extract_text() or '' for page in r.pages]
 for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 allstrings+=strings+texts
 results.append({'path':path,'pages':texts,'objects':len(seen),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]})
text='\n'.join(allstrings).lower()
for value in json.loads(sys.argv[2]):assert value.lower() not in text,value
print(json.dumps(results))
`;
it('saves private static mixed review pages with actual canonical appearances',async()=>{
 const retained=process.env.TAX_ENGINE_PA_MIXED_PAPER_ARTIFACT_DIR,dir=retained??await mkdtemp(join(tmpdir(),'pa-mixed-paper-'));await mkdir(dir,{recursive:true});const paths:string[]=[],snapshots:Snapshot[]=[],privateValues=new Set<string>();
 try{
  for(const [name,f]of [['nr',mixedPaperFixture()],['py',mixedPaperFixture('part_year')],['reverse-nr',mixedPaperFixture('nonresident',false,true)],['reverse-py',mixedPaperFixture('part_year',false,true)],['move-out',mixedPaperFixture('part_year',false,false,true)],['sp-nr',mixedPaperFixture('nonresident',true)],['sp-py',mixedPaperFixture('part_year',true)]]as const){
   for(const value of privateMarkers(f.input))privateValues.add(value);const token=preparePAMarriedReturnReview(f.input),spy=observe(snapshots);try{const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),f.result,blank,token);for(const d of docs){const path=join(dir,name+'-'+d.filename);await writeFile(path,await d.doc.save({useObjectStreams:false}));paths.push(path);}}finally{spy.mockRestore();}
  }
  const values=['900-70-0311','900700311','900-70-0312','900700312','91-0000311','910000311','91-0000312','910000312','Fictional complete separate spouse calendar records','Fictional mixed nonresident actual payroll'];
  const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',inspectSaved,JSON.stringify(paths),JSON.stringify([...values,...privateValues])],{encoding:'utf8',maxBuffer:4*1024*1024}))as Array<{pages:string[];objects:number;sizes:number[][]}>;
  expect(saved).toHaveLength(18);for(const row of saved){expect(row.pages).toHaveLength(2);expect(row.objects).toBeGreaterThan(0);expect(row.sizes).toEqual([[612,792],[612,792]]);}
  await writeFile(join(dir,'saved-object-review.json'),JSON.stringify(saved,null,2)+'\n');await writeFile(join(dir,'canonical-fields.json'),JSON.stringify(snapshots,null,2)+'\n');
 }finally{if(!retained)await rm(dir,{recursive:true,force:true});}
});
it.each(['nonresident','part_year']as const)('public dispatch includes actual redacted federal companions for %s positive SP',async kind=>{
 const f=mixedPaperFixture(kind,true),token=preparePAMarriedReturnReview(f.input),retained=process.env.TAX_ENGINE_PA_MIXED_PUBLIC_ARTIFACT_DIR,dir=retained?join(retained,kind):await mkdtemp(join(tmpdir(),'pa-mixed-public-')),before=JSON.stringify(f);await mkdir(dir,{recursive:true});
 try{const {filledForms:docs}=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:blank,outputDir:dir,paMarriedReview:token,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true});expect(docs.map(p=>p.split('/').pop())).toContain('f1040-filled.pdf');expect(docs.map(p=>p.split('/').pop())).toContain('pa-spouse-sp-review.pdf');const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',inspectSaved,JSON.stringify(docs),JSON.stringify(privateMarkers(f.input))],{encoding:'utf8',maxBuffer:4*1024*1024}));expect(saved.find((row:{path:string})=>row.path.endsWith('/f1040-filled.pdf')).pages).toHaveLength(2);expect(f.input.taxpayer.filingStatus).toBe('married_filing_jointly');expect(JSON.stringify(f)).toBe(before);await writeFile(join(dir,'public-saved-object-review.json'),JSON.stringify(saved,null,2)+'\n');
 }finally{if(!retained)await rm(dir,{recursive:true,force:true});}
});

it('denies unreconciled independently rounded mixed SP lines before template IO',async()=>{
 const f=mixedPaperFixture('nonresident',true),w=f.input.w2s[1],row=f.sources.wages[1];w.wages='3001.25';w.socialSecurityWages='3001.25';w.medicareWages='3001.25';w.socialSecurityWithheld='186.08';w.medicareWithheld='43.52';w.stateWages='1000.75';row.payroll[0].grossCompensation='3001.25';row.payroll[0].paServicesCompensation='1000.75';row.payroll[0].outsidePAServicesCompensation='2000.50';row.original=structuredClone(w);f.sources.originalFederalSources=marriedOriginals(f.input);
 const married=calculatePAMarriedOrdinaryReturn(f.input,f.sources),result={...calculateFederalTax(f.input),stateReturns:{pennsylvania:married}},token=preparePAMarriedReturnReview(f.input);
 expect(married.returns[0].scheduleSP.eligibilityIncome.toFixed(0)).toBe('13001');await expect(fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),result,'/missing/mixed-template',token)).rejects.toThrow(/rounded SP|rounding successor/);
});

it('denies original private display markers on the actual mixed public route before IO',async()=>{
 const f=mixedPaperFixture('nonresident',true);f.input.taxpayer.address.street=f.sources.residencySources?.sourceReference??'';f.sources.originalFederalSources=marriedOriginals(f.input);
 const married=calculatePAMarriedOrdinaryReturn(f.input,f.sources),result={...calculateFederalTax(f.input),stateReturns:{pennsylvania:married}},token=preparePAMarriedReturnReview(f.input),before=JSON.stringify(f.input);
 await expect(fillReturn(redactReviewIdentifiers(f.input),result,{blankFormsDir:'/missing/mixed-private-template',outputDir:'/missing/mixed-private-output',paMarriedReview:token})).rejects.toThrow(/private original identifier/);expect(JSON.stringify(f.input)).toBe(before);
});
