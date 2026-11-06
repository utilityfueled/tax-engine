/** Spec: spec/federal/form-2210-schedule-ai-physical-review.yaml. Controls precede products/output. */
import {expect,it,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {access,mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {fillForm2210,FORM_2210_FIELDS as F} from '@/pdf/mappings/2025/fill-form-2210.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {prepareQbiLossReview} from '@/pdf/qbi-loss-review-context.js';
import type {PreparedForm2210Review} from '@/pdf/form-2210-review-context.js';
import {assertPdfExportAllowed} from '@/pdf/export-policy.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import {aiPhysicalFixture,aiPhysicalKinds,aiPhysicalOracles,aiPhysicalRequired as required,aiPhysicalSourceWidgets,aiPhysicalExpected,aiSourceBlankSHA256,aiOwnerLegend,aiPhysicalWorkspace,type AIPhysicalKind} from '../fixtures/form-2210-schedule-ai-physical-review.js';
vi.mock('server-only',()=>({}));
const blank=join(process.cwd(),'forms/blank/2025/f2210.pdf');
const pack=join(process.cwd(),'forms/blank');
async function directory(label:string){const temporary=await mkdtemp(join(tmpdir(),'ai-paper-'));const retained=process.env.TAX_ENGINE_AI_PHYSICAL_ARTIFACT_DIR;const output=retained?join(retained,label):temporary;await mkdir(output,{recursive:true});return{output,cleanup:()=>rm(temporary,{recursive:true,force:true})};}
async function prepared(input:TaxYearInput):Promise<PreparedForm2210Review>{
 // Runtime-only load keeps baseline existing-API RED controls collectible before this new product exists.
 const modulePath='@/pdf/'+'form-2210-review-context.js';
 const context=await import(/* @vite-ignore */modulePath) as {prepareForm2210Review:(input:TaxYearInput)=>PreparedForm2210Review};
 return context.prepareForm2210Review(input);
}
function qbi(input:TaxYearInput){return input.qbiLossSources?prepareQbiLossReview(input):undefined;}
const cases=aiPhysicalKinds.map(kind=>[kind,kind] as const);
it('AI physical canonical preconditions match independent originals',()=>{
 for(const kind of aiPhysicalKinds){const input=aiPhysicalFixture(kind),before=JSON.stringify(input),result=calculateFederalTax(input),oracle=aiPhysicalOracles[kind],ai=required(result.form2210);
  expect([result.agi,result.taxableIncome,result.totalTax].map(x=>x.toFixed())).toEqual([oracle.agi,oracle.taxable,oracle.tax]);
  expect(ai.sourceFactsVerified).toBe(true);expect(ai.requiresForm2210).toBe(true);expect(ai.requiredAnnualPayment.toFixed()).toBe(oracle.required);
  if(oracle.penalty!==null)expect(ai.penalty.toFixed()).toBe(oracle.penalty);
  expect(ai.installments.map(row=>row.required.toFixed())).toEqual(oracle.exactInstallments);
  expect(JSON.stringify(input)).toBe(before);
 }
});
it('AI physical literal matrix is bound to the exact printed source',async()=>{
 expect(createHash('sha256').update(await readFile(blank)).digest('hex')).toBe(aiSourceBlankSHA256);
 expect(aiPhysicalSourceWidgets).toHaveLength(144);expect(aiPhysicalSourceWidgets.filter(row=>!row.placeholder)).toHaveLength(120);
 expect(aiPhysicalSourceWidgets.filter(row=>row.placeholder)).toHaveLength(24);
 const source=await PDFDocument.load(await readFile(blank)),form=source.getForm();
 for(const row of aiPhysicalSourceWidgets){const field=form.getTextField(row.field);expect(field).toBeDefined();const r=required(field.acroField.getWidgets()[0]).getRectangle();for(const [i,value]of [r.x,r.y,r.x+r.width,r.y+r.height].entries())expect(value).toBeCloseTo(required(row.rect[i]),6);if(row.placeholder)expect(r.width).toBeCloseTo(1,6);}
 expect(aiOwnerLegend).toMatchObject({x:36,y:26,size:7});
});
it.each(cases)('AI physical source cells match independent printed originals %s',async(_name,kind)=>{
 const input=aiPhysicalFixture(kind),before=JSON.stringify(input),result=calculateFederalTax(input),doc=await fillForm2210(input,result,blank,qbi(input)),form=(await PDFDocument.load(await doc.save())).getForm(),values=aiPhysicalExpected(kind);
 for(const row of aiPhysicalSourceWidgets)expect(form.getTextField(row.field).getText()??'',row.field).toBe(required(required(values[row.column])[String(row.line)]));
 expect(form.getTextField(F.ssn).getText()??'').toBe(input.taxpayer.primary.ssn.replaceAll('-',''));expect(form.getCheckBox(F.boxC).isChecked()).toBe(true);expect(form.getTextField(F.line9).getText()).toBe(aiPhysicalOracles[kind].required);
 for(const [i,key]of ['line10a','line10b','line10c','line10d'].entries())expect(form.getTextField(F[key as 'line10a']).getText()).toBe(required(required(values[required('abcd'[i])])['27']));
 expect(JSON.stringify(input)).toBe(before);
});
it.each(cases)('AI physical redacted source cells require actual original context %s',async(_name,kind)=>{
 const input=aiPhysicalFixture(kind),before=JSON.stringify(input),result=calculateFederalTax(input),token=await prepared(input),doc=await fillForm2210(redactReviewIdentifiers(input),result,blank,qbi(input),token),form=(await PDFDocument.load(await doc.save())).getForm(),values=aiPhysicalExpected(kind);
 for(const row of aiPhysicalSourceWidgets)expect(form.getTextField(row.field).getText()??'',row.field).toBe(required(required(values[row.column])[String(row.line)]));
 expect(form.getTextField(F.ssn).getText()??'').toBe('');expect(form.getCheckBox(F.boxC).isChecked()).toBe(true);expect(form.getTextField(F.line9).getText()).toBe(aiPhysicalOracles[kind].required);
 for(const [i,key]of ['line10a','line10b','line10c','line10d'].entries())expect(form.getTextField(F[key as 'line10a']).getText()).toBe(required(required(values[required('abcd'[i])])['27']));
 expect(JSON.stringify(input)).toBe(before);
});
const strictReader=String.raw`
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream,IndirectObject
import json,sys,re,math
p=Path(sys.argv[1]);cells=json.loads(sys.argv[2]);private=json.loads(sys.argv[3]);owners=json.loads(sys.argv[4]);r=PdfReader(p,strict=True)
assert not r.get_fields() and '/AcroForm'not in r.trailer['/Root'];texts=[];pieces=[];seen=set();objectcount=0
def decode(b):
 for enc in['utf-8','latin1','utf-16-be','utf-16-le']:
  try:pieces.append(b.decode(enc))
  except UnicodeError:pass
 for h in re.findall(rb'<([0-9A-Fa-f\s]+)>',b):
  try:v=bytes.fromhex(h.decode())
  except ValueError:continue
  for enc in['utf-8','latin1','utf-16-be','utf-16-le']:
   try:pieces.append(v.decode(enc))
   except UnicodeError:pass
def walk(x):
 if isinstance(x,IndirectObject):return
 if isinstance(x,(str,bytes)):
  if isinstance(x,str):pieces.append(x)
  else:decode(x)
 elif isinstance(x,dict):
  assert not any(k in x for k in['/A','/AA','/OpenAction','/JS','/JavaScript','/EmbeddedFiles','/FT'])
  assert x.get('/S')!='/JavaScript' and x.get('/Subtype')!='/Widget'
  for k,v in x.items():walk(k);walk(v)
  if hasattr(x,'get_data'):decode(x.get_data())
 elif isinstance(x,(list,tuple)):
  for v in x:walk(v)
decode(p.read_bytes())
for page in r.pages:
 assert all(a.get_object().get('/Subtype')!='/Widget'for a in page.get('/Annots',[]))
 t=page.extract_text()or'';assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1;texts.append(t)
ids={(g,n)for g,entries in r.xref.items()if g!=65535 for n in entries if n};ids.update((0,n)for n in r.xref_objStm)
for g,n in sorted(ids):walk(r.get_object(IndirectObject(n,g,r)));objectcount+=1
pieces+=texts+[str(r.metadata)];joined='\n'.join(pieces)
for v in private:assert v not in joined,('private-marker',v)
def mul(m,n):
 a,b,c,d,e,f=m;g,h,i,j,k,l=n
 return[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def paint(page):
 m=[1,0,0,1,0,0];stack=[];out=[]
 for args,op in ContentStream(page['/Contents'],r).operations:
  if op==b'q':stack.append(m[:])
  elif op==b'Q':m=stack.pop()
  elif op==b'cm':m=mul(m,[float(x)for x in args])
  elif op==b'Do':
   ref=page.get('/Resources',{}).get('/XObject',{}).get(args[0])
   if ref is None:continue
   x=ref.get_object()
   if x.get('/Subtype')!='/Form'or'/BBox'not in x:continue
   a,b,c,d,e,f=mul(m,[float(v)for v in x.get('/Matrix',[1,0,0,1,0,0])]);l,bt,rt,t=[float(v)for v in x['/BBox']];pts=[(a*u+c*v+e,b*u+d*v+f)for u,v in[(l,bt),(l,t),(rt,bt),(rt,t)]];rect=[min(u for u,v in pts),min(v for u,v in pts),max(u for u,v in pts),max(v for u,v in pts)];s=[]
   for vals,operator in ContentStream(x,r).operations:
    if operator==b'Tj':s.append(str(vals[0]))
    elif operator==b'TJ':s.extend(str(v)for v in vals[0]if isinstance(v,str))
   out.append((rect,''.join(s)))
 return out
cache={};checked=[]
for c in cells:
 page=c['page']-1
 if page not in cache:cache[page]=paint(r.pages[page])
 found=[text for rect,text in cache[page]if all(abs(a-b)<.02 for a,b in zip(rect,c['rect']))]
 assert len(found)==1,(c,'appearance-count',len(found))
 assert found[0].replace(',','').strip()==c['value'],(c,'actual',found[0])
 checked.append(c)
if owners:
 labels=['REVIEW ONLY - PRIMARY PART II WORKSHEET','REVIEW ONLY - SPOUSE PART II WORKSHEET']
 for pageindex,label in zip([2,3],labels):
  assert texts[pageindex].count(label)==1,(pageindex,'owner-label-count')
  observed=[]
  def owner_position(text,cm,tm,font,size):
   if label not in text:return
   assert text.strip()==label,(pageindex,'unexpected-owner-label-fragment',text)
   x=float(cm[0])*float(tm[4])+float(cm[2])*float(tm[5])+float(cm[4]);y=float(cm[1])*float(tm[4])+float(cm[3])*float(tm[5])+float(cm[5])
   assert abs(float(cm[0])-1)<1e-6 and abs(float(cm[1]))<1e-6 and abs(float(cm[2]))<1e-6 and abs(float(cm[3])-1)<1e-6,(pageindex,'transformed-owner-scale',cm)
   assert abs(x-36)<.02 and abs(y-26)<.02,(pageindex,'actual-owner-baseline',x,y)
   assert font is not None and str(font.get('/BaseFont','')).endswith('Helvetica'),(pageindex,'actual-owner-font',font)
   assert abs(float(size)-7)<.001,(pageindex,'actual-owner-size',size)
   # Conservative full-em band, not a measured glyph bounding box. Actual visual review remains required.
   assert y-float(size)>18 and y+float(size)<35.977,(pageindex,'owner-em-band',y,size)
   assert x+len(label)*float(size)<514.336,(pageindex,'conservative-horizontal-owner-band')
   observed.append({'page':pageindex+1,'label':label,'x':x,'y':y,'font':str(font.get('/BaseFont')),'size':float(size),'boundKind':'conservative-em-band-not-glyph-bbox'})
  r.pages[pageindex].extract_text(visitor_text=owner_position)
  assert len(observed)==1,(pageindex,'actual-owner-position-count',len(observed))
 assert 'Schedule AI' in texts[3]
else:assert not any('SPOUSE PART II WORKSHEET'in t for t in texts)
assert not any('page 3 is not completed'in t for t in texts)
print(json.dumps({'pages':len(r.pages),'objects':objectcount,'cells':len(checked),'texts':texts,'sourceCells':checked}))
`;
function cells(kind:AIPhysicalKind){const values=aiPhysicalExpected(kind),rows=aiPhysicalSourceWidgets.filter(row=>!row.placeholder).map(row=>({page:3,field:row.field,rect:row.rect,value:required(required(values[row.column])[String(row.line)])}));if(kind.startsWith('two-owner')){const spouse=aiPhysicalExpected(kind,true);rows.push(...aiPhysicalSourceWidgets.filter(row=>!row.placeholder).map(row=>({page:4,field:row.field,rect:row.rect,value:required(required(spouse[row.column])[String(row.line)])})));}return rows;}
function scan(path:string,kind:AIPhysicalKind,input:TaxYearInput,privateOutput=true){const secrets=[...(privateOutput?[input.taxpayer.primary.ssn,input.taxpayer.primary.ssn.replaceAll('-',''),input.taxpayer.spouse?.ssn,input.taxpayer.spouse?.ssn.replaceAll('-','')]:[]),'Original private primary period ledger','Original private spouse period ledger','originalFederalSources'].filter((v):v is string=>Boolean(v));return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',strictReader,path,JSON.stringify(cells(kind)),JSON.stringify(secrets),JSON.stringify(kind.startsWith('two-owner'))],{encoding:'utf8'})) as {pages:number;objects:number;cells:number;texts:string[]};}
it.each(cases)('AI physical public dispatch includes only actual required annualized review %s',async(_name,kind)=>{
 const input=aiPhysicalFixture(kind),before=JSON.stringify(input),result=calculateFederalTax(input),d=await directory('public-'+kind);
 try{const actual=await fillReturn(input,result,{blankFormsDir:pack,outputDir:d.output,flatten:true,qbiLossReview:qbi(input)});expect(actual.filledForms.map(p=>basename(p))).toContain('f2210-filled.pdf');
 const report=scan(join(d.output,'f2210-filled.pdf'),kind,input,false);expect(report.objects).toBeGreaterThan(0);expect(report.cells).toBe(kind.startsWith('two-owner')?240:120);await writeFile(join(d.output,'strict-source-report.json'),JSON.stringify(report,null,2));expect(JSON.stringify(input)).toBe(before);
 }finally{await d.cleanup();}
});
it.each(cases)('AI physical redacted public dispatch binds actual original context %s',async(_name,kind)=>{
 const input=aiPhysicalFixture(kind),before=JSON.stringify(input),result=calculateFederalTax(input),token=await prepared(input),d=await directory('redacted-public-'+kind);
 try{const actual=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:pack,outputDir:d.output,flatten:true,qbiLossReview:qbi(input),form2210Review:token});expect(actual.filledForms.map(p=>basename(p))).toContain('f2210-filled.pdf');
 const report=scan(join(d.output,'f2210-filled.pdf'),kind,input);expect(report.objects).toBeGreaterThan(0);expect(report.cells).toBe(kind.startsWith('two-owner')?240:120);await writeFile(join(d.output,'strict-source-report.json'),JSON.stringify(report,null,2));expect(JSON.stringify(input)).toBe(before);
 }finally{await d.cleanup();}
});
const conflicts=['forged','serialized','wrong-owner-original','same-cash-employer','period-source-change','retained-line-change','retained-total-change','missing-owner','duplicate-owner','original-input-mutated-after-prepare']as const;
it.each(conflicts)('AI physical rejects stale originals and forged review contexts before output %s',async kind=>{
 const input=aiPhysicalFixture('two-owner'),original=structuredClone(input),before=JSON.stringify(input),result=calculateFederalTax(input),token=await prepared(input),qbiToken=qbi(input),temporary=await mkdtemp(join(tmpdir(),'ai-denied-')),output=join(temporary,'must-not-exist');let context=token;
 if(kind==='forged')context={}as PreparedForm2210Review;
 if(kind==='serialized')context=JSON.parse(JSON.stringify(token)) as PreparedForm2210Review;
 if(kind==='wrong-owner-original'){const wrong=structuredClone(input);required(wrong.taxpayer.spouse).firstName='Different actual spouse original';context=await prepared(wrong);}
 if(kind==='same-cash-employer')required(input.w2s[0]).employer.name='Different equal-cash original employer';
 if(kind==='period-source-change')required(required(required(input.form2210).selfEmploymentOwnerPeriods)[0]).sourceReference='Different actual original ledger';
 if(kind==='retained-line-change'){const row=required(required(result.form2210).lines.find(x=>x.line==='36a-primary'));row.value=row.value.plus(1);}
 if(kind==='retained-total-change')required(result.form2210).penalty=required(result.form2210).penalty.plus(1);
 if(kind==='missing-owner')required(input.form2210).selfEmploymentOwnerPeriods?.pop();
 if(kind==='duplicate-owner'){const a=required(required(input.form2210).selfEmploymentOwnerPeriods?.[0]);required(input.form2210).selfEmploymentOwnerPeriods=[a,structuredClone(a)];}
 if(kind==='original-input-mutated-after-prepare')required(input.scheduleC).businessName='Changed original business identity';
 try{const options={blankFormsDir:pack,outputDir:output,flatten:true,qbiLossReview:qbiToken,form2210Review:context};await expect(fillReturn(redactReviewIdentifiers(input),result,options)).rejects.toThrow(/prepared|context|original|source|retained|current|audit/i);await expect(access(output)).rejects.toThrow();
 if(kind==='original-input-mutated-after-prepare'){const valid=await fillForm2210(redactReviewIdentifiers(original),calculateFederalTax(original),blank,undefined,token);expect(valid.getForm().getCheckBox(F.boxC).isChecked()).toBe(true);}
 if(kind==='forged'||kind==='serialized')expect(JSON.stringify(input)).toBe(before);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
it('AI physical raw optional context remains compatible and missing template fails closed',async()=>{
 const input=aiPhysicalFixture('single'),before=JSON.stringify(input),result=calculateFederalTax(input);const doc=await fillForm2210(input,result,blank);expect(doc.getForm().getTextField(F.ssn).getText()).toBe('900700811');await expect(fillForm2210(input,result,join(process.cwd(),'NO-SUCH-TEMPLATE.pdf'))).rejects.toThrow();expect(JSON.stringify(input)).toBe(before);
});
it.each(['regular','withholding-exception']as const)('AI physical retains unrelated default omission %s',async mode=>{
 const input=aiPhysicalFixture('single');if(mode==='regular'){required(input.form2210).calculationMethod='regular';required(input.form2210).annualizedIncomePeriods=undefined;}else required(input.w2s[0]).federalWithheld='33361';
 const result=calculateFederalTax(input),d=await directory('omit-'+mode);expect(result.form2210?.requiresForm2210).toBe(false);
 try{const actual=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:pack,outputDir:d.output,flatten:true});expect(actual.filledForms.map(p=>basename(p))).not.toContain('f2210-filled.pdf');await expect(access(join(d.output,'f2210-filled.pdf'))).rejects.toThrow();}finally{await d.cleanup();}
});
it('AI physical readiness discloses actual review without filing promotion',async()=>{
 const input=aiPhysicalFixture('single-zero-penalty'),result=calculateFederalTax(input),token=await prepared(input),d=await directory('readiness');try{
 const actual=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:pack,outputDir:d.output,flatten:true,form2210Review:token});expect(actual.filledForms.map(p=>basename(p))).toContain('f2210-filled.pdf');expect(actual.form2210ReviewArtifact).toBeDefined();
 const included=assessReturnReadiness({taxInput:input,federalResult:result,includedForms:actual.filledForms,form2210ReviewArtifact:actual.form2210ReviewArtifact}),basenameOnly=assessReturnReadiness({taxInput:input,federalResult:result,includedForms:['f1040-filled.pdf','f2210-filled.pdf']}),absent=assessReturnReadiness({taxInput:input,federalResult:result,includedForms:['f1040-filled.pdf','f2210-reference-filled.pdf']});
 expect(included.packetCompleteness).toBe('partial');expect(included.filingQualified).toBe(false);expect(included.businessRuleValidation).toBe('not-validated');expect(included.findings.join(' ')).toMatch(/Form 2210.*Schedule AI.*review/i);expect(included.findings.join(' ')).not.toContain('Form 2210 is still suppressed');for(const denied of[basenameOnly,absent]){expect(denied.findings.join(' ')).toMatch(/suppressed|absent|missing|not included/i);expect(denied.packetCompleteness).toBe('partial');expect(denied.filingQualified).toBe(false);}
 expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow();expect(()=>assertPdfExportAllowed(2026,2026)).toThrow();
 }finally{await d.cleanup();}
});
it.each(['forged','serialized','wrong-current-source','missing-included-file']as const)('AI physical rejects unqualified saved-artifact readiness proof %s',async mode=>{
 const input=aiPhysicalFixture('single-zero-penalty'),result=calculateFederalTax(input),token=await prepared(input),d=await directory('readiness-denied-'+mode);try{
 const actual=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:pack,outputDir:d.output,flatten:true,form2210Review:token});expect(actual.form2210ReviewArtifact).toBeDefined();let proof=actual.form2210ReviewArtifact;
 if(mode==='forged')proof={}as NonNullable<typeof proof>;if(mode==='serialized')proof=JSON.parse(JSON.stringify(proof))as NonNullable<typeof proof>;if(mode==='wrong-current-source')required(input.w2s[0]).employer.name='Different equal-cash original employer';
 const readiness=assessReturnReadiness({taxInput:input,federalResult:calculateFederalTax(input),includedForms:mode==='missing-included-file'?['f1040-filled.pdf','f2210-reference-filled.pdf']:actual.filledForms,form2210ReviewArtifact:proof});expect(readiness.packetCompleteness).toBe('partial');expect(readiness.filingQualified).toBe(false);expect(readiness.businessRuleValidation).toBe('not-validated');expect(readiness.findings.join(' ')).toMatch(/suppressed|absent|missing|not included/i);
 }finally{await d.cleanup();}
});
it('AI physical actual workspace handoff preserves source-qualified review and denial',async()=>{
 const {workspace,state}=aiPhysicalWorkspace(),before=JSON.stringify({workspace,state}),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),result=calculateFederalTax(input);expect([result.agi.toFixed(),result.totalTax.toFixed(),result.form2210?.requiredAnnualPayment.toFixed(),result.form2210?.penalty.toFixed()]).toEqual(['200000','37067','33360','0']);expect(result.form2210?.requiresForm2210).toBe(true);
 const d=await directory('actual-workspace');try{const actual=await buildWorkspaceFilledReturnDownload(workspace,state);expect(actual.includedForms).toContain('f2210-filled.pdf');const path=join(d.output,'actual-workspace-review.pdf');await writeFile(path,actual.contents);const text=execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader;import sys;print("\\n".join((p.extract_text()or"")for p in PdfReader(sys.argv[1],strict=True).pages))',path],{encoding:'utf8'}).replace(/\s+/g,' ');expect(text).toContain('Schedule AI');expect(text).not.toContain('Neither is attached');expect(text).not.toContain('page 3 is not completed');expect(text).toMatch(/Form 2210.*Schedule AI.*review/i);expect(text).toContain('E-file and business-rule validation: not-validated.');expect(text).not.toContain('900-70-0811');expect(text).not.toContain('900700811');expect(text).not.toContain('PRIVATE original actual annualized payment history');expect(JSON.stringify({workspace,state})).toBe(before);expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow();}finally{await d.cleanup();}
});
