/** Spec: state/pa-married-child-local-official-review.yaml. Actual source-bound saved forms. */
import {afterAll,expect,it,vi} from 'vitest';
import {PDFForm,PDFTextField,PDFName,PDFStream} from 'pdf-lib';
import {mkdir,writeFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {fictionalEmptyEicHistory} from '../fixtures/eic-disallowance';
import {fillReturn} from '@/pdf/fill-return';
import {hasEicReviewSources,prepareEicReview} from '@/pdf/eic-review-context';
import {execFileSync} from 'node:child_process';
import {preparePAMarriedReturnReview,resolvePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context';
import {fillPAMarriedOfficialReview} from '@/pdf/mappings/2025/fill-pa-married-official-review';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40';
import {CHILD_PAPER_CASES,CHILD_PAPER_RELATIONSHIPS,childLocalPaperFixture,childPaperResult,addChildPaperLocalRows} from '../fixtures/pa-married-child-local-official-review';
import {bindMarriedDependentCareFixture,paMarriedDependentCareFixture} from '../fixtures/pa-married-dependent-care';
const blank=join(process.cwd(),'forms/blank/2025'),retained=process.env.TAX_ENGINE_PA_MARRIED_CHILD_ARTIFACT_DIR,evidence=retained??await mkdtemp(join(tmpdir(),'pa-married-child-paper-'));
afterAll(async()=>{if(!retained)await rm(evidence,{recursive:true,force:true});});
const sourceChildRectangles=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-B','-c',"import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1],strict=True);print(json.dumps({str(a.idnum):[float(v)for v in a.get_object()['/Rect']]for a in r.pages[0]['/Annots']}))",join(blank,'pa-schedule-sp.pdf')],{encoding:'utf8'}))as Record<string,number[]>;
type Snapshot={texts:Record<string,string>;rects:Record<string,number[]>;statuses:Record<string,string>};
function capture(rows:Snapshot[]){const original=PDFForm.prototype.flatten;return vi.spyOn(PDFForm.prototype,'flatten').mockImplementation(function(this:PDFForm,options){const snapshot:Snapshot={texts:{},rects:{},statuses:{}};for(const field of this.getFields()){if(field instanceof PDFTextField){const value=field.getText()??'';snapshot.texts[field.getName()]=value;const widgets=field.acroField.getWidgets();if(field.getName().startsWith('SP-child-'))expect(widgets).toHaveLength(1);else expect(widgets.length).toBeGreaterThan(0);for(const widget of widgets){const r=widget.getRectangle();snapshot.rects[field.getName()]=[r.x,r.y,r.x+r.width,r.y+r.height];if(value){const normal=widget.getAppearances()?.normal;expect(normal).toBeInstanceOf(PDFStream);if(!(normal instanceof PDFStream))throw Error('Actual appearance required');expect(normal.getContents().length).toBeGreaterThan(0);}}}else snapshot.statuses[field.getName()]=field.acroField.dict.get(PDFName.of('V'))?.toString()??'/Off';}rows.push(snapshot);original.call(this,options);});}
async function save(name:string,docs:Awaited<ReturnType<typeof fillPAMarriedOfficialReview>>,snapshots:Snapshot[]){const dir=join(evidence,name);await mkdir(dir,{recursive:true});const paths=[];for(const item of docs){const path=join(dir,item.filename);await writeFile(path,await item.doc.save({useObjectStreams:false}));paths.push(path);}await writeFile(join(dir,'snapshots.json'),JSON.stringify(snapshots,null,2)+'\n');return paths;}
const audit=String.raw`
import json,sys
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,StreamObject,ArrayObject
out=[]
for path in json.loads(sys.argv[1]):
 r=PdfReader(path,strict=True);assert len(r.pages) in [1,2] and not r.get_fields();assert '/AcroForm' not in r.trailer['/Root'];seen=set();strings=[]
 def walk(x):
  if isinstance(x,IndirectObject):
   k=(x.idnum,x.generation)
   if k in seen:return
   seen.add(k);v=x.get_object();assert v is not None;walk(v)
  elif isinstance(x,DictionaryObject):
   assert str(x.get('/Subtype',''))!='/Widget'
   for k,v in x.items():
    assert str(k) not in ['/JavaScript','/JS','/OpenAction','/AA','/EmbeddedFiles','/Filespec'];strings.append(str(k));walk(v)
   if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
  elif isinstance(x,(ArrayObject,list)):
   for v in x:walk(v)
  elif isinstance(x,str):strings.append(str(x))
 walk(r.trailer)
 for gen,entries in r.xref.items():
  if gen!=65535:
   for oid in entries:
    if oid:walk(IndirectObject(oid,gen,r))
 for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
 texts=[p.extract_text() or '' for p in r.pages]
 for text in texts:assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 data='\n'.join(strings+texts)+open(path,'rb').read().decode('latin1','ignore')
 for marker in ['900-70-0311','900700311','900-70-0312','900700312','91-0000311','910000311','91-0000312','910000312','PRIVATE-','Fictional actual complete married household']+sum(([f'900-70-{i:04d}',f'90070{i:04d}'] for i in range(601,611)),[]):assert marker not in data,marker
 out.append({'path':path,'pages':texts,'objects':len(seen)})
print(json.dumps(out))
`;
function auditSaved(paths:string[]){return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-B','-c',audit,JSON.stringify(paths)],{encoding:'utf8'}))as Array<{path:string;pages:string[];objects:number}>;}
it.each(CHILD_PAPER_CASES)('actual child paper preserves literal J and M projections $name',async oracle=>{
 const f=childLocalPaperFixture(oracle,oracle.count===9),result=childPaperResult(f),before=JSON.stringify(f.input),beforeResult=JSON.stringify(result),token=preparePAMarriedReturnReview(f.input),rows:Snapshot[]=[],spy=capture(rows);
 try{
  const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),result,blank,token),hasSP=oracle.returns.some(r=>r.credit!=='0');expect(docs).toHaveLength(oracle.returns.length*(hasSP?2:1));const saved=auditSaved(await save(oracle.name,docs,rows));
  for(const [index,expected]of oracle.returns.entries()){
   const offset=index*(hasSP?2:1),pa=rows[offset];if(!pa)throw Error('Actual PA40 snapshot required');
   expect(pa.texts[F.line1a]).toBe(expected.wages);expect(pa.texts[F.line12]).toBe(expected.tax);expect(pa.texts[F.line13]).toBe(oracle.mode==='J'?expected.tax:oracle.withholding[index]);
   expect(pa.texts[F.line30]).toBe(oracle.refunds[index]);expect(pa.texts[F.dependents]).toBe(hasSP?String(oracle.count):'');expect(pa.texts[F.line21]).toBe(hasSP?expected.credit:'');
   expect(pa.texts[F.primaryFirstName]).toBe(expected.owner==='spouse'?'MORGAN':'AVERY');expect(pa.texts[F.spouseFirstName]).toBe(expected.owner==='spouse'?'AVERY':'MORGAN');
   if(hasSP){const sp=rows[offset+1];if(!sp)throw Error('Actual SP snapshot required');expect(sp.texts['SP-dependents']).toBe(String(oracle.count));const column=oracle.mode==='J'?'A':'BC';expect(sp.texts[`SP-15-${column}`]).toBe(oracle.percentage);expect(sp.texts[`SP-16-${column}`]).toBe(expected.credit);
    for(let i=0;i<oracle.count;i++){const child=f.input.taxpayer.dependents[i];expect(sp.texts[`SP-child-${i+1}-name`]).toBe(`${child.firstName} ${child.lastName}`.toUpperCase());expect(sp.texts[`SP-child-${i+1}-age`]).toBe('35');expect(sp.texts[`SP-child-${i+1}-relationship`]).toBe(CHILD_PAPER_RELATIONSHIPS[i%5]);expect(sp.texts).not.toHaveProperty(`SP-child-${i+1}-ssn`);for(const [column,kind]of ['name','age','relationship'].entries()){const actual=sp.rects[`SP-child-${i+1}-${kind}`],original=sourceChildRectangles[String(1012+i*4+column)];expect(actual).toHaveLength(4);for(let point=0;point<4;point++)expect(actual[point]).toBeCloseTo(original[point],6);}}
    expect(saved[offset+1]?.pages[0]).toContain('ASPEN');
   }
   expect(saved[offset]?.objects).toBeGreaterThan(0);
  }
  expect(JSON.stringify(f.input)).toBe(before);expect(JSON.stringify(result)).toBe(beforeResult);
 }finally{spy.mockRestore();}
});
it.each(['J','M']as const)('positive local W2 paper matches actual state-only physical pages $mode',async mode=>{
 const base=childLocalPaperFixture(mode==='J'?CHILD_PAPER_CASES[0]:CHILD_PAPER_CASES[1]);base.input.taxpayer.dependents=[];base.sources.dependentChildren=[];base.sources.coverage.allDependentSourcesKnownNoneConfirmed=true;base.sources.dispositions.forEach(row=>{row.refundRequested='0';});bindMarriedDependentCareFixture(base);base.input.paMarriedOrdinarySources=base.sources;
 const local=structuredClone(base);addChildPaperLocalRows(local);bindMarriedDependentCareFixture(local);local.input.paMarriedOrdinarySources=local.sources;
 const paths:string[][]=[];
 for(const [tag,f]of [['baseline',base],['local',local]]as const){const result=childPaperResult(f),token=preparePAMarriedReturnReview(f.input),rows:Snapshot[]=[],spy=capture(rows);try{paths.push(await save(`local-${mode}-${tag}`,await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),result,blank,token),rows));}finally{spy.mockRestore();}}
 expect(auditSaved(paths[0]).map(row=>row.pages)).toEqual(auditSaved(paths[1]).map(row=>row.pages));await writeFile(join(evidence,`local-${mode}-pairs.json`),JSON.stringify(paths,null,2)+'\n');
});
it('child local paper retains unsupported and stale boundaries',async()=>{
 const care=paMarriedDependentCareFixture();care.input.paMarriedOrdinarySources=care.sources;expect(()=>preparePAMarriedReturnReview(care.input)).toThrow(/care.*paper|care.*projection/i);
 const overflow=childLocalPaperFixture(CHILD_PAPER_CASES[4]);const child=structuredClone(overflow.input.taxpayer.dependents[0]);child.firstName='Overflow';child.ssn='900-70-0610';overflow.input.taxpayer.dependents.push(child);overflow.sources.dependentChildren?.push({...structuredClone(overflow.sources.dependentChildren[0]),originalIndex:9,sourceReference:'PRIVATE-TENTH',originalFederalDependent:structuredClone(child)});bindMarriedDependentCareFixture(overflow);expect(()=>preparePAMarriedReturnReview(overflow.input)).toThrow(/nine|9|continuation|overflow/i);
 const f=childLocalPaperFixture(),result=childPaperResult(f),token=preparePAMarriedReturnReview(f.input);expect(resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),result,token)).toHaveLength(1);f.input.taxpayer.dependents[0].firstName='Changed original';await expect(fillPAMarriedOfficialReview(f.input,result,'/missing',token)).rejects.toThrow(/original.*changed|packet.*changed/i);
 const next=childLocalPaperFixture();next.input.taxpayer.taxYear=2026;expect(()=>preparePAMarriedReturnReview(next.input)).toThrow(/2026|year|mapping/i);
 const long=childLocalPaperFixture();long.input.taxpayer.dependents[0].firstName='LONG'.repeat(80);bindMarriedDependentCareFixture(long);const lr=childPaperResult(long),lt=preparePAMarriedReturnReview(long.input);await expect(fillPAMarriedOfficialReview(long.input,lr,blank,lt)).rejects.toThrow(/fit|physical.*field/i);
});
it('child display text redacts original identifiers without changing actual originals',async()=>{
 const f=childLocalPaperFixture();f.input.taxpayer.dependents[0].firstName+=' '+f.input.taxpayer.dependents[0].ssn;bindMarriedDependentCareFixture(f);const result=childPaperResult(f),token=preparePAMarriedReturnReview(f.input),before=JSON.stringify(f.input),rows:Snapshot[]=[],spy=capture(rows);
 try{expect(JSON.stringify(resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),result,token))).not.toContain(f.input.taxpayer.dependents[0].ssn);const docs=await fillPAMarriedOfficialReview(redactReviewIdentifiers(f.input),result,blank,token);expect(rows[1]?.texts['SP-child-1-name']).toBe('ASPEN [REDACTED] PAPER');auditSaved(await save('private-child-name',docs,rows));expect(JSON.stringify(f.input)).toBe(before);}finally{spy.mockRestore();}
});

// SP instructions require federal1040 pages1/2 for adult/adopted/foster children.
it.each(CHILD_PAPER_CASES.slice(0,4))('public child review includes unchanged federal companion $name',async oracle=>{
 const f=childLocalPaperFixture(oracle,true),result=childPaperResult(f),before=JSON.stringify(f.input),token=preparePAMarriedReturnReview(f.input),outputDir=join(evidence,'public-'+oracle.name);await mkdir(outputDir,{recursive:true});
 const actual=await fillReturn(redactReviewIdentifiers(f.input),redactReviewIdentifiers(result),{purpose:'review',blankFormsDir:join(process.cwd(),'forms/blank'),outputDir,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true,paMarriedReview:token,eicReview:hasEicReviewSources(f.input)?prepareEicReview(f.input):undefined});
 expect(actual.filledForms.filter(path=>basename(path)==='f1040-filled.pdf')).toHaveLength(1);
 const inspected=auditSaved(actual.filledForms),federal=inspected.find(row=>basename(row.path)==='f1040-filled.pdf');expect(federal?.pages).toHaveLength(2);for(const child of f.input.taxpayer.dependents)expect(federal?.pages.join(' ').toUpperCase()).toContain(child.firstName.toUpperCase());
 expect(actual.filledForms.filter(path=>basename(path).startsWith('pa-'))).toHaveLength(oracle.returns.length*2);expect(JSON.stringify(f.input)).toBe(before);
 await writeFile(join(outputDir,'saved-paths.json'),JSON.stringify(actual.filledForms,null,2)+'\n');
});
it('public child review preserves greater-than-four federal attachment denial',async()=>{const f=childLocalPaperFixture(CHILD_PAPER_CASES[4]),result=childPaperResult(f),token=preparePAMarriedReturnReview(f.input);await expect(fillReturn(redactReviewIdentifiers(f.input),redactReviewIdentifiers(result),{purpose:'review',blankFormsDir:join(process.cwd(),'forms/blank'),outputDir:join(evidence,'denied-nine-public'),flatten:true,paMarriedReview:token,eicReview:hasEicReviewSources(f.input)?prepareEicReview(f.input):undefined})).rejects.toThrow(/more than four|attachment mapping/i);});

it.each((['childFirst','childLast','primaryFirst','spouseLast','street','apt','city','occupation','childUnformatted','childSource','childEmployer','childSourceLower']as const).map(field=>({field})))('public child packet refuses private original display before emission $field',async({field})=>{
 const f=childLocalPaperFixture(),marker=f.input.taxpayer.dependents[0].ssn;
 if(field==='childUnformatted')f.input.taxpayer.dependents[0].firstName+=' '+marker.replace(/-/g,'');
 if(field==='childSourceLower')f.input.taxpayer.dependents[0].firstName+=' '+f.sources.dependentChildren?.[0].sourceReference.toLowerCase();
 if(field==='childSource')f.input.taxpayer.dependents[0].firstName+=' '+f.sources.dependentChildren?.[0].sourceReference;
 if(field==='childEmployer')f.input.taxpayer.dependents[0].firstName+=' '+f.input.w2s[0].employer.ein;
 if(field==='childFirst')f.input.taxpayer.dependents[0].firstName+=' '+marker;
 if(field==='childLast')f.input.taxpayer.dependents[0].lastName+=' '+marker;
 if(field==='primaryFirst')f.input.taxpayer.primary.firstName+=' '+marker;
 if(field==='spouseLast'){if(!f.input.taxpayer.spouse)throw Error('Actual spouse required');f.input.taxpayer.spouse.lastName+=' '+marker;}
 if(field==='street')f.input.taxpayer.address.street+=' '+marker;
 if(field==='apt')f.input.taxpayer.address.apt=marker;
 if(field==='city')f.input.taxpayer.address.city+=' '+marker;
 if(field==='occupation')f.input.taxpayer.primary.occupation=marker;
 for(const owner of f.sources.owners){const person=owner.accountHolder==='primary'?f.input.taxpayer.primary:f.input.taxpayer.spouse;if(!person)throw Error('Actual owner required');owner.originalTaxpayer={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};}
 if(f.input.eic)f.input.eic.disallowanceSources=fictionalEmptyEicHistory(f.input.taxpayer);
 bindMarriedDependentCareFixture(f);const result=childPaperResult(f),token=preparePAMarriedReturnReview(f.input),outputDir=join(evidence,'denied-private-display-'+field),before=JSON.stringify(f.input);
 await expect(fillReturn(redactReviewIdentifiers(f.input),redactReviewIdentifiers(result),{purpose:'review',blankFormsDir:join(process.cwd(),'forms/blank'),outputDir,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true,paMarriedReview:token,eicReview:hasEicReviewSources(f.input)?prepareEicReview(f.input):undefined})).rejects.toThrow(/private.*display|display.*projection/i);
 await expect(access(outputDir)).rejects.toThrow();expect(JSON.stringify(f.input)).toBe(before);
});

it('public child relationship private text remains an unqualified original',()=>{const f=childLocalPaperFixture();f.input.taxpayer.dependents[0].relationship+=' '+f.input.taxpayer.dependents[0].ssn;bindMarriedDependentCareFixture(f);expect(()=>childPaperResult(f)).toThrow(/relationship|child.*source/i);});
