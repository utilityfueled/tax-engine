/** Spec: spec/state/oh-business-official-review.yaml. Frozen before product/runtime. */
import {expect,it} from 'vitest';
import {prepareOhioBusinessOfficialReview,stageOhioBusinessOfficialReview,writeOhioBusinessOfficialReview,type PreparedOhioBusinessOfficialReview,type StagedOhioBusinessOfficialReview} from '@/pdf/mappings/2025/fill-oh-business-official-review.js';
import {access,mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {prepareOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {fillOhioReferenceForms} from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {assertPdfExportAllowed} from '@/pdf/export-policy.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {businessPaperCases,businessPaperFixture,businessPaperCells,businessPaperPlans,businessPaperRequired,businessPaperWeightStrikeRegions,businessPaperGroupStatuses,businessPrivateDescriptionCases,businessPrivateDescriptionFixture,type BusinessPaperPacket,type BusinessPaperCase} from '../fixtures/oh-business-official-review.js';
import {guidedOhioBusinessFixture} from '../fixtures/guided-ohio-business-sources.js';
import {buildGuidedStateOriginals} from '../../apps/web/src/lib/guided-state-engine-inputs';
const cases:[string,BusinessPaperCase][]=businessPaperCases.map(c=>[c.name,c]);
const first=()=>businessPaperFixture(businessPaperRequired(businessPaperCases[0]));
function canonical(p:BusinessPaperPacket){return calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});}
async function directory(name:string){const temporary=await mkdtemp(join(tmpdir(),'oh-business-paper-')),retained=process.env.OH_BUSINESS_OFFICIAL_ARTIFACT_DIR,output=retained?join(retained,name):temporary;await mkdir(output,{recursive:true});return{output,cleanup:()=>rm(temporary,{recursive:true,force:true})};}
it('actual business paper current source preconditions remain independent',()=>{
 for(const c of businessPaperCases){
  const p=businessPaperFixture(c),before=structuredClone(p),federal=calculateFederalTax(p.input),oh=canonical(p),b=businessPaperRequired(p.facts.businessSources),row=businessPaperRequired(b.facts.businesses[0]);
  expect(p.input.taxpayer.taxYear).toBe(2025);expect(p.input.taxpayer.filingStatus).toBe('single');expect(p.input.w2s).toEqual([]);
  expect(p.input.scheduleC?.principalBusinessActivity).toBe('Fictional Current Ordinary Services');expect(federal.scheduleC?.netProfit.toString()).toBe(c.profit);
  expect(federal.scheduleSE?.deductibleHalf.toString()).toBe(c.halfSE);expect(federal.agi.toString()).toBe(c.federalAGI);
  expect(p.facts.owners[0]?.status).toBe(c.status);expect(b.receiptOriginals[0]?.date).toBe('2025-12-15');expect(b.federalDeductionSources[0]?.original.date).toBe('2025-12-31');
  expect(row.property.ownedBeginning).toEqual({ohio:'10000',everywhere:'20000'});expect(row.payroll.ohio).toBe('0');expect(row.payroll.everywhere).toBe('0');
  expect(oh.it1040.line2b_deductions.toString()).toBe(c.BID);expect(oh.it1040.line3_ohioAgi.toString()).toBe(c.ohioAGI);expect(oh.it1040.line4_exemptions.toString()).toBe('1900');expect(oh.it1040.line5_ohioTaxableIncome.toString()).toBe(c.taxable);
  expect(oh.it1040.line8b_businessTax.toString()).toBe(c.tax);expect(oh.nonresidentCreditResult?.line19.toFixed(4)).toBe(c.nrcRatio);expect(oh.nonresidentCreditResult?.line20.toString()).toBe(c.NRC);expect(oh.it1040.line10_taxAfterCredits.toString()).toBe('0');
  expect(oh.it1040.line11_underpaymentPenalty.toString()).toBe('0');expect(oh.it1040.line14_ohioWithholding.toString()).toBe('0');expect(oh.it1040.line15_estimatedPayments.toString()).toBe('0');expect(p.payments.remainingTaxPayment.status).toBe('no_remaining_tax');expect(p.input.ohioReturnHeaderSources).toBeUndefined();expect(p).toEqual(before);
 }
});
it.each(cases)('actual business paper existing public API emits source-required companions %s',async(_name,c)=>{
 const p=businessPaperFixture(c),before=structuredClone(p),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),{output,cleanup}=await directory('public-'+c.name);
 try{const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);expect(result.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf')).sort()).toEqual(Object.keys(businessPaperPlans(c)).sort());expect(result.filledForms.map(path=>basename(path))).toContain('oh-it-1040-reference.pdf');expect(result.filledForms.map(path=>basename(path))).toContain('oh-it-bus-reference.pdf');expect(p).toEqual(before);}finally{await cleanup();}
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
  if hasattr(obj,'get_data'):objects.append(repr(obj.get_data()))
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
it.each(cases)('actual business paper saved physical cells privacy and weights %s',async(_name,c)=>{
 const p=businessPaperFixture(c),before=structuredClone(p),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),{output,cleanup}=await directory('physical-'+c.name),plans=businessPaperPlans(c),cells=businessPaperCells(c);
 try{const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);expect(result.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf')).sort()).toEqual(Object.keys(plans).sort());
  const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictSaved,output,JSON.stringify(plans),JSON.stringify(cells),JSON.stringify([p.input.taxpayer.primary.ssn,'900700411','90-7000411','907000411','PRIVATE-','originalFederalSources','originalBusinessSourcePacket','originalBusinessUndefinedPaths','originalResidencySources','originalPaymentSources']),JSON.stringify(businessPaperWeightStrikeRegions),JSON.stringify(businessPaperGroupStatuses(c))],{encoding:'utf8'}))as Record<string,{pages:number;cells:number}>;
  expect(Object.values(report).reduce((n,row)=>n+row.pages,0)).toBe(c.status==='nonresident'?11:9);expect(Object.values(report).reduce((n,row)=>n+row.cells,0)).toBe(cells.length);expect(p).toEqual(before);
 }finally{await cleanup();}
});
const conflicts=['missing canonical federal originals','forged context','serialized context','same-cash invoice identity','same-cash original deduction date','same-cash current C identity','stale federal result']as const;
it.each(conflicts)('actual business paper rejects source conflict before output %s',async kind=>{
 const p=first(),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),b=businessPaperRequired(p.facts.businessSources);
 if(kind==='same-cash invoice identity')businessPaperRequired(b.receiptOriginals[0]).originalDocumentId='PRIVATE-CHANGED-SAME-CASH-INVOICE';
 if(kind==='same-cash original deduction date')businessPaperRequired(b.federalDeductionSources[0]).original.date='2025-12-30';
 if(kind==='same-cash current C identity')businessPaperRequired(p.input.scheduleC).businessCode='541690';
 if(kind==='stale federal result')federal.agi=federal.agi.plus('1');
 if(kind==='missing canonical federal originals')Reflect.deleteProperty(p.facts,'originalFederalSources');
 const before=structuredClone(p),dir=await mkdtemp(join(tmpdir(),'oh-business-paper-deny-')),output=join(dir,'must-not-exist');
 try{await expect(fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},kind==='missing canonical federal originals'?undefined:kind==='forged context'?{}as typeof context:kind==='serialized context'?JSON.parse(JSON.stringify(context))as typeof context:context)).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(p).toEqual(before);}finally{await rm(dir,{recursive:true,force:true});}
});
function rebindFederal(p:BusinessPaperPacket){const{ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,ohioReturnHeaderSources:_h,...source}=p.input;p.facts.originalFederalSources=structuredClone(source);p.payments.originalFederalSources=structuredClone(source);}
const sourceConflicts:[string,(p:BusinessPaperPacket)=>void][]=[
 ['unknown payroll',p=>{Reflect.deleteProperty(businessPaperRequired(businessPaperRequired(p.facts.businessSources).facts.businesses[0]).payroll,'ohio');}],
 ['negative actual property',p=>{businessPaperRequired(businessPaperRequired(p.facts.businessSources).facts.businesses[0]).property.ownedBeginning.ohio='-1';}],
 ['excess precision original receipt',p=>{businessPaperRequired(businessPaperRequired(p.facts.businessSources).receiptOriginals[0]).grossReceipt='100000.001';}],
 ['retained second business',p=>{const b=businessPaperRequired(p.facts.businessSources);b.facts.businesses.push(structuredClone(businessPaperRequired(b.facts.businesses[0])));}],
 ['actual full-year resident owner outside finite method',p=>{const owner=businessPaperRequired(p.facts.owners[0]);owner.status='full_year_resident';owner.periods=[{from:'2025-01-01',to:'2025-12-31',domicileState:'OH'}];}],
 ['duplicate invoice',p=>{const b=businessPaperRequired(p.facts.businessSources);b.receiptOriginals.push(structuredClone(businessPaperRequired(b.receiptOriginals[0])));}],
 ['wrong current year',p=>{businessPaperRequired(p.facts.businessSources).taxYear=2026;}],
 ['wrong owner',p=>{businessPaperRequired(businessPaperRequired(p.facts.businessSources).receiptOriginals[0]).accountHolder='spouse';}],
 ['unconfirmed ordinary activity',p=>{Reflect.set(businessPaperRequired(businessPaperRequired(p.facts.businessSources).facts.businesses[0]),'ordinarySoleProprietorshipConfirmed',false);}],
 ['retained zero interest original',p=>{p.input.form1099Int=[{accountHolder:'primary',taxYear:2025,payer:'Actual separately retained zero interest original',interestIncome:'0',usSavingsBondInterest:'0',federalWithheld:'0'}];rebindFederal(p);}],
 ['retained cancelling SSA RRB sources',p=>{p.input.formSSA1099=[{recipient:'Actual separate SSA original',netBenefits:'100',federalWithheld:'0'}];p.input.formRRB1099=[{recipient:'Actual separate RRB original',netSocialSecurityEquivalentBenefitPortion:'-100',federalWithheld:'0'}];rebindFederal(p);}],
 ['missing actual payment inventory',p=>{Reflect.set(p.payments,'allPaymentsIncludedConfirmed',false);}],
 ['missing federal snapshot',p=>{Reflect.deleteProperty(p.facts,'originalFederalSources');}],
];
it.each(sourceConflicts)('actual business paper canonical source refuses %s',(_name,mutate)=>{const p=first();mutate(p);const before=structuredClone(p);expect(()=>canonical(p)).toThrow();expect(p).toEqual(before);});
it.each(['otherDeductions','ohioWithholdingOverride','nonresidentCredit']as const)('actual business paper rejects raw overlay before output %s',async field=>{const p=first(),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),dir=await mkdtemp(join(tmpdir(),'oh-business-paper-overlay-')),output=join(dir,'must-not-exist');try{await expect(fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{[field]:'1'},context)).rejects.toThrow();await expect(access(output)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}});
it('actual business paper PY omits unsupported header and withholding paths',async()=>{const c=businessPaperRequired(businessPaperCases.find(row=>row.name==='py400k')),p=businessPaperFixture(c),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),{output,cleanup}=await directory('py-omission');const names=['oh-it-1040-review.pdf','oh-schedule-of-withholding-review.pdf'],sentinel=Buffer.from('Existing caller path must remain untouched');try{for(const n of names)await writeFile(join(output,n),sentinel);const result=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);for(const n of names){expect(result.filledForms.map(path=>basename(path))).not.toContain(n);expect(await readFile(join(output,n))).toEqual(sentinel);}expect(p.input.ohioReturnHeaderSources).toBeUndefined();}finally{await cleanup();}});
const newBasenames=['oh-schedule-business-income-review.pdf','OH-SCHEDULE-BUSINESS-INCOME-REVIEW.PDF','oh-schedule-business-income-review.pdf.backup','fake-oh-schedule-business-income-review.pdf','oh-schedule-business-income-filled.pdf']as const;
it.each(newBasenames)('actual business paper cover identifies only known BUS basename %s',name=>{const p=first(),federalResult=calculateFederalTax(p.input),value=assessReturnReadiness({taxInput:p.input,federalResult,includedForms:[name],stateCode:'OH'}),known=name.toLowerCase()==='oh-schedule-business-income-review.pdf';expect(value.findings.some(x=>x.startsWith('Ohio packet includes official-form review copies'))).toBe(known);expect(value.filingQualified).toBe(false);expect(value.businessRuleValidation).toBe('not-validated');expect(value.packetCompleteness).toBe(known?'partial':'unsupported');});
it('actual business paper preserves year filing and nonzero liability boundaries',async()=>{expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow(/Filing exports are unavailable/);expect(()=>assertPdfExportAllowed(2026,2026,'review')).toThrow();const f=guidedOhioBusinessFixture('nonresident','1000000'),input=buildGuidedStateOriginals(f.input,f.state),federal=calculateFederalTax(input),context=prepareOhioResidencyReview(input),{output,cleanup}=await directory('nonzero-unqualified');try{const result=await fillOhioReferenceForms(redactReviewIdentifiers(input),federal,output,{},context);expect(result.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf'))).toEqual([]);expect(f.expected.taxAfterNRC).toBe('1877');}finally{await cleanup();}});
it.each(['missing','tampered']as const)('actual business paper refuses source templates before output %s',async kind=>{const p=first(),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),dir=await mkdtemp(join(tmpdir(),'oh-business-paper-assets-')),root=join(dir,'blank'),year=join(root,'2025'),output=join(dir,'must-not-exist');try{if(kind==='tampered'){await mkdir(year,{recursive:true});await writeFile(join(year,'oh-it1040-bundle.pdf'),'Not the pinned source');await writeFile(join(year,'oh-it-nrc.pdf'),'Not the pinned source');}await expect(fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context,root)).rejects.toThrow();await expect(access(output)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}});

const previousReviewNames=['oh-it-1040-review.pdf','oh-it-nrc-review.pdf','oh-it-rc-review.pdf','oh-schedule-adjustments-review.pdf','oh-schedule-credits-review.pdf','oh-schedule-of-withholding-review.pdf','oh-sd-100-review.pdf','oh-sd-withholding-review.pdf']as const;
it.each(previousReviewNames)('actual business paper preserves prior exact review basename %s',name=>{const p=first(),value=assessReturnReadiness({taxInput:p.input,federalResult:calculateFederalTax(p.input),includedForms:[name],stateCode:'OH'});expect(value.findings.some(x=>x.startsWith('Ohio packet includes official-form review copies'))).toBe(true);expect(value.packetCompleteness).toBe('partial');expect(value.businessRuleValidation).toBe('not-validated');expect(value.filingQualified).toBe(false);});
const fixtureSourceRoot=resolve(import.meta.dirname,'../..');
it.each(['pack-root','year-root','web-cwd']as const)('actual business paper resolves unchanged pinned template scope %s',async scope=>{const p=first(),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),savedCwd=process.cwd(),{output,cleanup}=await directory('template-'+scope);try{if(scope==='web-cwd')process.chdir(join(fixtureSourceRoot,'apps/web'));const root=join(fixtureSourceRoot,'forms/blank',...(scope==='year-root'?['2025']:[]));const packet=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context,root);expect(packet.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf')).sort()).toEqual(Object.keys(businessPaperPlans(businessPaperRequired(businessPaperCases[0]))).sort());}finally{process.chdir(savedCwd);await cleanup();}});

it.each(['forged','serialized','copied']as const)('actual business paper local projection token denies %s before source IO',async kind=>{const p=first(),actual=businessPaperRequired(prepareOhioBusinessOfficialReview(p.input,calculateFederalTax(p.input),{},prepareOhioResidencyReview(p.input))),token=kind==='forged'?{}as PreparedOhioBusinessOfficialReview:kind==='serialized'?JSON.parse(JSON.stringify(actual))as PreparedOhioBusinessOfficialReview:{...actual};await expect(stageOhioBusinessOfficialReview(token,'/must-not-read-for-invalid-business-projection')).rejects.toThrow(/valid actual private prepared projection required/);});
it.each(['forged','prepared-token']as const)('actual business paper local staged token denies %s before output IO',async kind=>{const p=first(),actual=businessPaperRequired(prepareOhioBusinessOfficialReview(p.input,calculateFederalTax(p.input),{},prepareOhioResidencyReview(p.input))),token=(kind==='forged'?{}:actual)as unknown as StagedOhioBusinessOfficialReview,dir=await mkdtemp(join(tmpdir(),'oh-business-invalid-staged-')),output=join(dir,'must-not-exist');try{await expect(writeOhioBusinessOfficialReview(token,output)).rejects.toThrow(/valid actual staged private packet required/);await expect(access(output)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}});
it('actual business paper opaque preparation retains exact private sources',()=>{const p=first(),before=structuredClone(p),token=businessPaperRequired(prepareOhioBusinessOfficialReview(p.input,calculateFederalTax(p.input),{},prepareOhioResidencyReview(p.input)));expect(Object.isFrozen(token)).toBe(true);expect(JSON.stringify(token)).toBe('{}');expect(p).toEqual(before);});

it('actual business paper private description originals remain canonical',()=>{for(const kind of businessPrivateDescriptionCases){const p=businessPrivateDescriptionFixture(kind),before=structuredClone(p),federal=calculateFederalTax(p.input),result=canonical(p);expect(p.input.scheduleC?.principalBusinessActivity).toBe(p.rawDescription);expect(p.rawDescription.length).toBeLessThanOrEqual(35);expect(businessPaperRequired(p.facts.businessSources).facts.businesses[0]?.originalBusiness).toEqual(p.input.scheduleC);expect(federal.agi.toString()).toBe('92935');expect(result.it1040.line2b_deductions.toString()).toBe('92935');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(prepareOhioBusinessOfficialReview(p.input,federal,{},prepareOhioResidencyReview(p.input))).toBeDefined();expect(p).toEqual(before);}});
const privateDescriptionReader=String.raw`
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import IndirectObject,ContentStream
import sys,json
r=PdfReader(Path(sys.argv[1]),strict=True);assert len(r.pages)==3;page=r.pages[2];marker=sys.argv[2];expected=sys.argv[3];values=[]
for args,op in ContentStream(page['/Contents'],r).operations:
 if op!=b'Do':continue
 obj=page['/Resources']['/XObject'][args[0]].get_object()
 if obj.get('/Subtype')!='/Form':continue
 text=''.join(str(vals[0])for vals,operator in ContentStream(obj,r).operations if operator==b'Tj')
 if expected in text or marker.upper()in text:values.append(text)
assert expected in values,('actual source description display',values)
ids={(g,n)for g,entries in r.xref.items()if g!=65535 for n in entries if n};ids.update((0,n)for n in r.xref_objStm)
for g,n in ids:
 obj=r.get_object(IndirectObject(n,g,r));rendered=str(obj)
 if hasattr(obj,'get_data'):rendered+=' '+repr(obj.get_data())
 assert marker.upper()not in rendered.upper(),('private actual identifier',g,n)
print(json.dumps({'objects':len(ids),'maskedDescription':expected}))
`;
it.each(businessPrivateDescriptionCases)('actual business paper saved description masks actual private source %s',async kind=>{const p=businessPrivateDescriptionFixture(kind),before=structuredClone(p),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input),{output,cleanup}=await directory('private-description-'+kind);try{const packet=await fillOhioReferenceForms(redactReviewIdentifiers(p.input),federal,output,{},context);expect(packet.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf')).sort()).toEqual(Object.keys(businessPaperPlans(businessPaperRequired(businessPaperCases[0]))).sort());const report=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',privateDescriptionReader,join(output,'oh-it-nrc-review.pdf'),p.privateMarker,p.expectedDescription],{encoding:'utf8'}))as{objects:number;maskedDescription:string};expect(report.objects).toBeGreaterThan(0);expect(report.maskedDescription).toBe(p.expectedDescription);expect(p).toEqual(before);}finally{await cleanup();}});

it('actual business paper complete raw originals retain optional review context',async()=>{const p=first(),before=structuredClone(p),federal=calculateFederalTax(p.input),{output,cleanup}=await directory('optional-context-raw');try{const packet=await fillOhioReferenceForms(p.input,federal,output);expect(packet.filledForms.map(path=>basename(path)).filter(x=>x.endsWith('-review.pdf')).sort()).toEqual(Object.keys(businessPaperPlans(businessPaperRequired(businessPaperCases[0]))).sort());expect(p).toEqual(before);}finally{await cleanup();}});
