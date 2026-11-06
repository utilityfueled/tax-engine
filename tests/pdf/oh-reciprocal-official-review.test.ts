/** Spec: spec/state/oh-reciprocal-official-review.yaml. Controls before products/output. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {access,mkdtemp,mkdir,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import {assertPdfExportAllowed} from '@/pdf/export-policy.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {reciprocalPaperCases,reciprocalPhysicalFiles,reciprocalPositiveCentWithholdingFixture,reciprocalPositiveCentWithholdingCells,reciprocalOfficialReviewFixture,reciprocalPaperRequired,type ReciprocalPaperCase} from '../fixtures/oh-reciprocal-official-review.js';
import {reciprocalW2,rebindReciprocalOuter,explicitlyReplaceReciprocalW2,type ReciprocalOhioWagePacket} from '../fixtures/oh-reciprocal-wage-sources.js';
import {ohioOrdinaryOfficialReviewFixture} from '../fixtures/oh-ordinary-official-review.js';
const cases: [string,ReciprocalPaperCase][] = reciprocalPaperCases.map(c=>[c.name,c]);
const firstCase=()=>reciprocalPaperRequired(reciprocalPaperCases[0]);
function canonical(p:ReciprocalOhioWagePacket){return calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});}
async function outputDirectory(name:string){
 const temporary=await mkdtemp(join(tmpdir(),'oh-reciprocal-paper-'));
 const retained=process.env.OH_RECIPROCAL_OFFICIAL_ARTIFACT_DIR;
 const output=retained?join(retained,name):temporary;
 await mkdir(output,{recursive:true});
 return{output,cleanup:()=>rm(temporary,{recursive:true,force:true})};
}
it('actual reciprocal paper source preconditions retain independently supplied originals',()=>{
 for(const c of reciprocalPaperCases){
  const p=reciprocalOfficialReviewFixture(c),before=JSON.stringify(p),w=reciprocalW2(p),rows=reciprocalPaperRequired(w.stateLocalSources).stateRows;
  expect(w.wages).toBe(c.rawWages);
  expect(rows.map(row=>[row.state,row.wages,row.withheld])).toEqual(c.ohioFirst?[['OH',c.rawWages,c.rawOhioWithholding],['PA',c.rawWages,c.rawPennsylvaniaWithholding]]:[['PA',c.rawWages,c.rawPennsylvaniaWithholding],['OH',c.rawWages,c.rawOhioWithholding]]);
  const payroll=p.facts.reciprocalWageSources.payrollRows;
  expect(payroll).toHaveLength(12);
  expect(payroll.reduce((sum,row)=>sum.plus(row.wages),new Decimal(0)).toFixed(2)).toBe(c.rawWages);
  expect(payroll.reduce((sum,row)=>sum.plus(row.ohioWithheld),new Decimal(0)).toFixed(2)).toBe(c.rawOhioWithholding);
  expect(reciprocalPaperRequired(payroll[11]).wages).toBe(c.lastPayrollWages);
  expect(reciprocalPaperRequired(payroll[11]).ohioWithheld).toBe(c.lastPayrollOhioWithholding);
  expect(calculateFederalTax(p.input).agi.toFixed(2)).toBe(c.rawWages);
  const oh=canonical(p);
  expect(oh.it1040.line1_federalAgi.toString()).toBe(c.reportedWages);
  expect(oh.scheduleOfAdjustments.line47_totalDeductions.toString()).toBe(c.reportedWages);
  expect(oh.it1040.line2b_deductions.toString()).toBe(c.reportedWages);
  expect(oh.it1040.line3_ohioAgi.toString()).toBe('0');
  expect(oh.it1040.line4_exemptions.toString()).toBe('2400');
  expect(oh.it1040.line10_taxAfterCredits.toString()).toBe('0');
  expect(oh.it1040.line14_ohioWithholding.toString()).toBe(c.reportedOhioWithholding);
  expect(oh.it1040.line26_refund.toString()).toBe(c.reportedOhioWithholding);
  expect(oh.nonresidentCreditResult?.line1.toString()).toBe('0');
  expect(oh.nonresidentCreditResult?.line20.toString()).toBe('0');
  expect(JSON.stringify(p)).toBe(before);
 }
});
it.each(cases)('actual reciprocal paper public emits source-required official companions %s',async(_name,c)=>{
 const p=reciprocalOfficialReviewFixture(c),before=JSON.stringify(p),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input);
 const{output,cleanup}=await outputDirectory('public-'+c.name);
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);
  expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(c.physicalFiles).sort());
  expect(result.filledForms.map(path=>basename(path))).toContain('oh-it-1040-reference.pdf');
  expect(result.filledForms.map(path=>basename(path))).toContain('oh-schedule-adjustments-reference.pdf');
  expect(JSON.stringify(p)).toBe(before);
 }finally{await cleanup();}
});
const strictPhysicalPacket=String.raw`
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject,ContentStream
import sys,json
root=Path(sys.argv[1]);plans=json.loads(sys.argv[2]);cells=json.loads(sys.argv[3]);private=json.loads(sys.argv[4]);checked={}
def mult(m,n):
 a,b,c,d,e,f=m;g,h,i,j,k,l=n
 return[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def painted(page,r):
 matrix=[1,0,0,1,0,0];stack=[];found=[]
 for args,op in ContentStream(page['/Contents'],r).operations:
  if op==b'q':stack.append(matrix[:])
  elif op==b'Q':matrix=stack.pop()
  elif op==b'cm':matrix=mult(matrix,[float(v)for v in args])
  elif op==b'Do':
   xo=page.get('/Resources',{}).get('/XObject',{}).get(args[0])
   if xo is None:continue
   xo=xo.get_object()
   if xo.get('/Subtype')!='/Form' or '/BBox'not in xo:continue
   m=mult(matrix,[float(v)for v in xo.get('/Matrix',[1,0,0,1,0,0])]);a,b,c,d,e,f=m;l,bt,rt,t=[float(v)for v in xo['/BBox']]
   pts=[(a*x+c*y+e,b*x+d*y+f)for x,y in[(l,bt),(l,t),(rt,bt),(rt,t)]]
   rect=[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)]
   strings=[];ops=ContentStream(xo,r).operations
   for vals,operator in ops:
    if operator==b'Tj':strings.append(str(vals[0]))
    elif operator==b'TJ':strings.extend(str(v)for v in vals[0]if isinstance(v,str))
   found.append((rect,''.join(strings),any(op in[b'f',b'f*']for vals,op in ops)))
 return found
for name,pages in plans.items():
 file=root/name;r=PdfReader(file,strict=True);assert len(r.pages)==pages,(name,len(r.pages));assert not r.get_fields();assert '/AcroForm'not in r.trailer['/Root'];texts=[];objects=[]
 for page in r.pages:
  assert all(a.get_object().get('/Subtype')!='/Widget'for a in page.get('/Annots',[]))
  t=page.extract_text()or'';assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1;texts.append(t)
 ids={(gen,num)for gen,entries in r.xref.items()if gen!=65535 for num in entries if num};ids.update((0,num)for num in r.xref_objStm)
 for gen,num in sorted(ids):
  obj=r.get_object(IndirectObject(num,gen,r))
  if isinstance(obj,dict):
   assert not any(k in obj for k in['/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/FT'])
   assert obj.get('/S')!='/JavaScript' and obj.get('/Subtype')!='/Widget'
  objects.append(str(obj))
  if hasattr(obj,'get_data'):objects.append(repr(obj.get_data()))
 raw='\n'.join(objects+texts+[str(r.metadata)])
 for value in private:assert value not in raw,(name,'private marker',value)
 page_cells={};fieldValues={}
 for c in cells:
  if c['file']!=name:continue
  if c['page'] not in page_cells:page_cells[c['page']]=painted(r.pages[c['page']-1],r)
  matches=[t for rect,t,ink in page_cells[c['page']]if all(abs(a-b)<.02 for a,b in zip(rect,c['rect']))]
  assert len(matches)==1,(name,c,'saved appearance count',len(matches))
  assert matches[0].replace(',','').strip()==c['value'],(name,c,'saved physical value',matches[0])
  fieldValues[c['field']]=matches[0].replace(',','').strip()
 if name=='oh-it-1040-review.pdf':
  if 1 not in page_cells:page_cells[1]=painted(r.pages[0],r)
  for label,box in[('single',[330.723,406.407,338.898,419.275]),('nonresident',[179.555,407.416,187.73,420.284])]:
   marks=[ink for rect,t,ink in page_cells[1]if all(abs(a-b)<.02 for a,b in zip(rect,box))]
   assert marks==[True],(label,marks)
 checked[name]={'pages':len(r.pages),'ordinaryAndCompressedObjects':len(ids),'physicalCells':sum(1 for c in cells if c['file']==name),'texts':texts,'fieldValues':fieldValues}
assert set(checked)==set(plans) and sum(v['pages']for v in checked.values())==sum(plans.values())
print(json.dumps(checked))
`;
it.each(cases)('actual reciprocal paper saved physical cells and privacy %s',async(_name,c)=>{
 const p=reciprocalOfficialReviewFixture(c),before=JSON.stringify(p),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input);
 const{output,cleanup}=await outputDirectory('physical-'+c.name);
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);
  expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(c.physicalFiles).sort());
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictPhysicalPacket,output,JSON.stringify(c.physicalFiles),JSON.stringify(c.physicalCells),JSON.stringify([p.input.taxpayer.primary.ssn,'900700611','90-7000611','907000611','PRIVATE-','originalFederalSources','originalResidencySources','originalPaymentSources'])],{encoding:'utf8'}))as Record<string,{pages:number;physicalCells:number}>;
  expect(Object.values(report).reduce((n,row)=>n+row.pages,0)).toBe(c.expectedPhysicalPageCount);
  expect(Object.values(report).reduce((n,row)=>n+row.physicalCells,0)).toBe(c.expectedPhysicalCellCount);
  expect(JSON.stringify(p)).toBe(before);
 }finally{await cleanup();}
});
const sourceConflicts=['absent context','forged context','same-cash employer','same-cash recipient','same-cash Ohio row reference','stale federal AGI']as const;
it.each(sourceConflicts)('actual reciprocal paper rejects source conflict before output %s',async kind=>{
 const p=reciprocalOfficialReviewFixture(firstCase()),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),w=reciprocalW2(p);
 if(kind==='same-cash employer')w.employer.name='Different actual same-cash corporate employer';
 if(kind==='same-cash recipient')p.input.taxpayer.primary.lastName='DifferentOriginalRecipient';
 if(kind==='same-cash Ohio row reference')reciprocalPaperRequired(reciprocalPaperRequired(w.stateLocalSources).stateRows.find(row=>row.state==='OH')).sourceReference='Different same-cash actual Ohio original reference';
 if(kind==='stale federal AGI')federal.agi=federal.agi.plus('1');
 const before=JSON.stringify(p),dir=await mkdtemp(join(tmpdir(),'oh-reciprocal-conflict-')),out=join(dir,'must-not-exist');
 try{
  await expect(fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,out,{},kind==='absent context'?undefined:kind==='forged context'?{}as typeof context:context)).rejects.toThrow();
  await expect(access(out)).rejects.toThrow();expect(JSON.stringify(p)).toBe(before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
const canonicalConflicts:[string,(p:ReciprocalOhioWagePacket)=>void][]=[
 ['part-year residency excluded',p=>{reciprocalPaperRequired(p.facts.owners[0]).status='part_year_resident';}],
 ['married status excluded',p=>{p.input.taxpayer.filingStatus='married_filing_jointly';rebindReciprocalOuter(p);}],
 ['duplicate actual Ohio row',p=>{const rows=reciprocalPaperRequired(reciprocalW2(p).stateLocalSources).stateRows;rows.push(structuredClone(reciprocalPaperRequired(rows.find(row=>row.state==='OH'))));explicitlyReplaceReciprocalW2(p);}],
 ['wrong source year',p=>{p.facts.reciprocalWageSources.sourceTaxYear=2026;}],
 ['wrong owner',p=>{p.facts.reciprocalWageSources.accountHolder='spouse';}],
 ['wrong original recipient',p=>{p.facts.reciprocalWageSources.originalTaxpayer.ssn='900-70-0612';}],
 ['wrong domicile',p=>{p.facts.reciprocalWageSources.domicileOriginal.domicileState='VA';}],
 ['incomplete calendar',p=>{p.facts.reciprocalWageSources.domicileOriginal.from='2025-01-02';}],
 ['invalid payment date',p=>{reciprocalPaperRequired(p.facts.reciprocalWageSources.payrollRows[0]).paymentDate='2025-02-30';}],
 ['duplicate payroll',p=>{p.facts.reciprocalWageSources.payrollRows.push(structuredClone(reciprocalPaperRequired(p.facts.reciprocalWageSources.payrollRows[0])));}],
 ['mismatched payroll wages',p=>{reciprocalPaperRequired(p.facts.reciprocalWageSources.payrollRows[0]).wages='5000.01';}],
 ['mismatched payroll Ohio cash',p=>{reciprocalPaperRequired(p.facts.reciprocalWageSources.payrollRows[0]).ohioWithheld='166.71';}],
 ['unknown Ohio withholding',p=>{Reflect.deleteProperty(reciprocalPaperRequired(reciprocalPaperRequired(reciprocalW2(p).stateLocalSources).stateRows.find(row=>row.state==='OH')),'withheld');explicitlyReplaceReciprocalW2(p);}],
 ['special compensation unreviewed',p=>{Reflect.set(p.facts.reciprocalWageSources,'noSpecialCompensationConfirmed',false);}],
 ['PTE20 owner exception',p=>{p.facts.reciprocalWageSources.employerEntityOriginal.entityType='pass_through_20_percent_owner';}],
 ['nonemployee compensation',p=>{p.input.form1099Nec=[{taxYear:2025,accountHolder:'primary',payer:'Actual nonemployee original',nonemployeeCompensation:'100',federalWithheld:'0'}];rebindReciprocalOuter(p);}],
 ['retained zero interest original',p=>{p.input.form1099Int=[{taxYear:2025,accountHolder:'primary',payer:'Actual zero interest original',interestIncome:'0',usSavingsBondInterest:'0',federalWithheld:'0'}];rebindReciprocalOuter(p);}],
 ['retained cancelling SSA RRB originals',p=>{p.input.formSSA1099=[{recipient:'Actual separate SSA',netBenefits:'100',federalWithheld:'0'}];p.input.formRRB1099=[{recipient:'Actual separate RRB',netSocialSecurityEquivalentBenefitPortion:'-100',federalWithheld:'0'}];rebindReciprocalOuter(p);}],
 ['unknown current account inventory',p=>{Reflect.set(p.payments,'allPaymentsIncludedConfirmed',false);}],
 ['missing original capture',p=>{Reflect.deleteProperty(p.facts,'originalFederalSources');}],
];
it.each(canonicalConflicts)('actual reciprocal paper canonical source refuses %s',(_name,mutate)=>{
 const p=reciprocalOfficialReviewFixture(firstCase());mutate(p);const before=JSON.stringify(p);expect(()=>canonical(p)).toThrow();expect(JSON.stringify(p)).toBe(before);
});
it.each(['otherDeductions','ohioWithholdingOverride','nonresidentCredit']as const)('actual reciprocal paper rejects source conflict before output raw overlay %s',async field=>{
 const p=reciprocalOfficialReviewFixture(firstCase()),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),dir=await mkdtemp(join(tmpdir(),'oh-reciprocal-overlay-')),out=join(dir,'must-not-exist');
 try{await expect(fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,out,{[field]:'1'},context)).rejects.toThrow();await expect(access(out)).rejects.toThrow();}
 finally{await rm(dir,{recursive:true,force:true});}
});
it('actual reciprocal paper preserves established VA source method',async()=>{
 const input=ohioOrdinaryOfficialReviewFixture(),before=JSON.stringify(input),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input);
 const{output,cleanup}=await outputDirectory('va-before-after');
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{},context);
  expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(['oh-it-1040-review.pdf','oh-it-nrc-review.pdf','oh-schedule-credits-review.pdf','oh-schedule-of-withholding-review.pdf']);
  const oh=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
  expect(oh.it1040.line8c_totalTax.toString()).toBe('2323');expect(oh.nonresidentCreditResult?.line20.toString()).toBe('1858');expect(oh.it1040.line26_refund.toString()).toBe('535');expect(JSON.stringify(input)).toBe(before);
 }finally{await cleanup();}
});
it('actual reciprocal paper keeps 2026 public output denied',async()=>{
 expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow('Filing exports are unavailable');
 const p=reciprocalOfficialReviewFixture(firstCase()),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input);
 const changed=redactReviewIdentifiers(p.input);changed.taxpayer.taxYear=2026;const dir=await mkdtemp(join(tmpdir(),'oh-reciprocal-2026-')),out=join(dir,'must-not-exist');
 try{await expect(fillOhioReferenceForms(changed,federal,out,{},context)).rejects.toThrow();await expect(access(out)).rejects.toThrow();expect(p.input.taxpayer.taxYear).toBe(2025);}
 finally{await rm(dir,{recursive:true,force:true});}
});

/** PROPOSED SOURCE-FIRST ADDITIVE TWO CONTROLS ONLY; not applied or run. */
it.each(cases)('actual reciprocal paper nominal credit arithmetic preserves applied tax %s',async(_name,c)=>{
 const p=reciprocalOfficialReviewFixture(c),before=JSON.stringify(p),federal=calculateFederalTax(p.input),oh=canonical(p),resultBefore=JSON.stringify(oh),context=prepareOhioResidencyReview(p.input);
 expect(oh.scheduleOfCredits.line9_exemptionCredit.toString()).toBe('20');
 expect(oh.scheduleOfCredits.line10_totalFirstBatch.toString()).toBe('20');
 expect(oh.scheduleOfCredits.line40_totalNonrefundableCredits.toString()).toBe('0');
 expect(oh.it1040.line9_nonrefundableCredits.toString()).toBe('0');
 expect(oh.it1040.line10_taxAfterCredits.toString()).toBe('0');
 const{output,cleanup}=await outputDirectory('nominal-arithmetic-'+c.name);
 try{
  await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictPhysicalPacket,output,JSON.stringify(c.physicalFiles),JSON.stringify(c.physicalCells),JSON.stringify([p.input.taxpayer.primary.ssn,'900700611','90-7000611','907000611','PRIVATE-','originalFederalSources','originalResidencySources','originalPaymentSources'])],{encoding:'utf8'}))as Record<string,{fieldValues:Record<string,string>}>;
  function actual(file:string,field:string){const value=report[file]?.fieldValues[field];if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('Actual saved nominal credit field is missing');return new Decimal(value);}
  const credit=(field:string)=>actual('oh-schedule-credits-review.pdf',field),it=(field:string)=>actual('oh-it-1040-review.pdf',field);
  expect(credit('SchedC_L9').toString()).toBe('20');expect(credit('SchedC_L10').toString()).toBe('20');
  const literalSum=credit('SchedC_L10').plus(credit('SchedC_L36')).plus(credit('SchedC_L38')).plus(credit('SchedC_L39'));
  expect(literalSum.toString()).toBe('20');expect(credit('SchedC_L40').eq(literalSum)).toBe(true);expect(it('L9').eq(literalSum)).toBe(true);
  expect(it('L10').eq(Decimal.max(new Decimal('0'),it('L8C').minus(it('L9'))))).toBe(true);
  expect(it('L10').eq(oh.it1040.line10_taxAfterCredits)).toBe(true);
  expect(it('L14').toString()).toBe(c.reportedOhioWithholding);expect(it('L26').toString()).toBe(c.reportedOhioWithholding);
  expect(JSON.stringify(p)).toBe(before);expect(JSON.stringify(oh)).toBe(resultBefore);
 }finally{await cleanup();}
});

/** Source-first knownzero omitted-path regression; other38 controls remain. */
it('actual reciprocal known-zero omits Schedule W without touching its path',async()=>{
 const c=reciprocalPaperRequired(reciprocalPaperCases.find(row=>row.name==='known-zero'));
 const p=reciprocalOfficialReviewFixture(c),before=JSON.stringify(p),w=reciprocalW2(p),rows=reciprocalPaperRequired(w.stateLocalSources).stateRows;
 expect(reciprocalPaperRequired(rows.find(row=>row.state==='OH')).withheld).toBe('0.00');
 expect(reciprocalPaperRequired(rows.find(row=>row.state==='PA')).withheld).toBe('1842.02');
 const oh=canonical(p),resultBefore=JSON.stringify(oh),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input);
 expect(oh.it1040.line14_ohioWithholding.toString()).toBe('0');expect(oh.it1040.line26_refund.toString()).toBe('0');
 const{output,cleanup}=await outputDirectory('known-zero-no-schedule-w');
 const isolated=await mkdtemp(join(tmpdir(),'oh-reciprocal-preserve-wh-path-'));
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);
  expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(c.physicalFiles).sort());
  await expect(access(join(output,'oh-schedule-of-withholding-review.pdf'))).rejects.toMatchObject({code:'ENOENT'});
  const sentinelPath=join(isolated,'oh-schedule-of-withholding-review.pdf'),sentinel=Buffer.from('UNRELATED EXISTING OHIO WITHHOLDING OUTPUT PATH - PRESERVE EXACTLY');
  await writeFile(sentinelPath,sentinel);const existing=await stat(sentinelPath,{bigint:true});
  const second=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,isolated,{},context);
  expect(second.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(c.physicalFiles).sort());
  expect(second.filledForms).not.toContain(sentinelPath);expect(await readFile(sentinelPath)).toEqual(sentinel);
  const retained=await stat(sentinelPath,{bigint:true});
  expect([retained.ino,retained.size,retained.mtimeNs,retained.ctimeNs]).toEqual([existing.ino,existing.size,existing.mtimeNs,existing.ctimeNs]);
  expect(JSON.stringify(p)).toBe(before);expect(JSON.stringify(oh)).toBe(resultBefore);
 }finally{await cleanup();await rm(isolated,{recursive:true,force:true});}
});

/** Source-first positive raw cents must not be mistaken for source-known-zero. */
it('actual positive Ohio withholding cents retain Schedule W despite reported zero',async()=>{
 const c=reciprocalPaperRequired(reciprocalPaperCases.find(row=>row.name==='known-zero'));
 const p=reciprocalPositiveCentWithholdingFixture(),w=reciprocalW2(p),sources=reciprocalPaperRequired(w.stateLocalSources),before=JSON.stringify(p);
 expect(reciprocalPaperRequired(sources.stateRows.find(row=>row.state==='OH')).withheld).toBe('0.49');
 expect(reciprocalPaperRequired(sources.stateRows.find(row=>row.state==='PA')).withheld).toBe('1842.02');
 expect(w.stateTaxWithheld).toBe('0.49');expect(w.wages).toBe('60000.50');
 const payroll=p.facts.reciprocalWageSources.payrollRows;
 expect(payroll.map(row=>row.ohioWithheld)).toEqual(['0.00','0.00','0.00','0.00','0.00','0.00','0.00','0.00','0.00','0.00','0.00','0.49']);
 expect(payroll.reduce((total,row)=>total.plus(row.ohioWithheld),new Decimal('0')).toFixed(2)).toBe('0.49');
 expect(payroll.reduce((total,row)=>total.plus(row.wages),new Decimal('0')).toFixed(2)).toBe('60000.50');
 expect(reciprocalPaperRequired(payroll[11]).wages).toBe('5000.28');
 const{stateLocalSources:_stateLocal,...original}=w;
 expect(sources.originalW2).toEqual(original);expect(p.facts.reciprocalWageSources.originalW2).toEqual(w);
 expect(reciprocalPaperRequired(p.facts.originalFederalSources).w2s).toEqual(p.input.w2s);expect(p.payments.originalFederalSources.w2s).toEqual(p.input.w2s);
 const federal=calculateFederalTax(p.input),oh=canonical(p),resultBefore=JSON.stringify(oh),context=prepareOhioResidencyReview(p.input);
 expect(oh.it1040.line14_ohioWithholding.toString()).toBe('0');expect(oh.it1040.line26_refund.toString()).toBe('0');
 const{output,cleanup}=await outputDirectory('positive-cent-ohio-withholding');
 try{
  const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);
  expect(result.filledForms.map(path=>basename(path)).filter(name=>name.endsWith('-review.pdf')).sort()).toEqual(Object.keys(reciprocalPhysicalFiles).sort());
  const cells=[...c.physicalCells,...reciprocalPositiveCentWithholdingCells];expect(cells).toHaveLength(168);
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictPhysicalPacket,output,JSON.stringify(reciprocalPhysicalFiles),JSON.stringify(cells),JSON.stringify([p.input.taxpayer.primary.ssn,'900700611','90-7000611','907000611','PRIVATE-','originalFederalSources','originalResidencySources','originalPaymentSources'])],{encoding:'utf8'}))as Record<string,{pages:number;physicalCells:number}>;
  expect(Object.values(report).reduce((n,row)=>n+row.pages,0)).toBe(9);expect(Object.values(report).reduce((n,row)=>n+row.physicalCells,0)).toBe(168);
  expect(JSON.stringify(p)).toBe(before);expect(JSON.stringify(oh)).toBe(resultBefore);
 }finally{await cleanup();}
});
