/** Spec: spec/state/pa-ordinary-schedule-b-residency-paper.yaml; primary PA40B2025 pp3–5. */
import {expect,it,vi} from 'vitest';
import {PDFDocument,PDFDict,PDFName,StandardFonts} from 'pdf-lib';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as federal from '@/engine/federal.js';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {fillPAOrdinaryScheduleB,PA_ORDINARY_B_FIELDS as F,shouldIncludePAScheduleBReferenceSummary} from '@/pdf/fill-pa-schedule-b.js';
import * as review from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {flattenForm} from '@/pdf/pdf-utils.js';
import {assertReviewTemplateBytes} from '@/pdf/template-registry.js';
import {paOrdinaryScheduleBResidencyPaperFixture as fixture,PA_B_RESIDENCY_ORACLES as oracle} from '../fixtures/pa-ordinary-schedule-b-residency-paper.js';
import {paOrdinaryScheduleBPaperFixture} from '../fixtures/pa-ordinary-schedule-b-paper.js';
import {simpleW2Fixture} from '../fixtures/simple-w2.js';
import {execFileSync} from '../helpers/file-stdin-exec.js';
const blank=join(process.cwd(),'forms/blank/2025/pa-schedule-b.pdf'),forms=join(process.cwd(),'forms/blank/2025');
const description='Nonresident-period dividends and capital gain distributions';
const suppress=(...args:Parameters<typeof review.hasPAOrdinaryScheduleBReviewAuthority>)=>{
 if(!('hasPAOrdinaryScheduleBNonresidentSuppressionAuthority'in review)||typeof review.hasPAOrdinaryScheduleBNonresidentSuppressionAuthority!=='function')throw Error('Spec requires source-bound finite nonresident suppression authority');
 return Reflect.apply(review.hasPAOrdinaryScheduleBNonresidentSuppressionAuthority,undefined,args);
};
async function render(kind:Parameters<typeof fixture>[0]='ordinary'){
 const f=fixture(kind),token=review.preparePAOrdinaryReturnReview(f.input),doc=await fillPAOrdinaryScheduleB(redactReviewIdentifiers(f.input),f.result,blank,token);if(!doc)throw Error('Spec requires original-bound PY paper');return {...f,token,doc};
}
function strict(bytes:Uint8Array){return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',`import io,json,sys
from pypdf import PdfReader
r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True)
def widget(a):
 a=a.get_object();parts=[];value=None;seen=set()
 while a:
  if id(a) in seen:raise ValueError('Cyclic field parent')
  seen.add(id(a))
  if '/T' in a:parts.append(str(a['/T']))
  if value is None and '/V' in a:value=str(a['/V'])
  a=a.get('/Parent');a=a.get_object() if a else None
 return {'name':'.'.join(reversed(parts)),'value':value or ''}
print(json.dumps({'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()},'widgets':[widget(a) for p in r.pages for a in p.get('/Annots',[]) if a.get_object().get('/Subtype')=='/Widget'],'pages':[p.extract_text() or '' for p in r.pages]}))`],{input:bytes,encoding:'utf8',timeout:4000,killSignal:'SIGKILL'})) as {fields:Record<string,string>;widgets:Array<{name:string;value:string}>;pages:string[]};}
function lines(doc:PDFDocument){return F.lines.map(name=>doc.getForm().getTextField(name).getText());}
async function packet(f:ReturnType<typeof fixture>,token:ReturnType<typeof review.preparePAOrdinaryReturnReview>){const dir=await mkdtemp(join(tmpdir(),'pa-b-residency-'));try{return await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:forms,outputDir:dir,paOrdinaryReview:token});}finally{await rm(dir,{recursive:true,force:true});}}
it('projects the exact part-year source allocation into fourteen official fields',async()=>{
 const f=fixture(),before=structuredClone(f.input),token=review.preparePAOrdinaryReturnReview(f.input),doc=await fillPAOrdinaryScheduleB(redactReviewIdentifiers(f.input),f.result,blank,token);expect(doc).toBeDefined();if(!doc)throw Error('PY paper absent');
 expect(lines(doc)).toEqual(oracle.ordinary);expect(doc.getForm().getTextField('4. Description').getText()).toBe(description);expect(doc.getForm().getTextField('8. Description').getText()??'').toBe('');expect(f.result.totalDividends.toFixed()).toBe('2000');expect(f.ordinary.pa40.dividends.toFixed()).toBe('1300');expect(f.input).toEqual(before);
 const p=await packet(f,token);expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-review.pdf'))).toBe(true);expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-reference.pdf'))).toBe(false);
});
it('preserves signed Line6 when only outside-period capital distributions exist',async()=>{
 const f=await render('signed');expect(lines(f.doc)).toEqual(oracle.signed);expect(f.ordinary.pa40.dividends.toFixed()).toBe('0');expect(shouldIncludePAScheduleBReferenceSummary(f.ordinary.scheduleB)).toBe(true);const value=strict(await f.doc.save());expect(value.fields[F.lines[5]]).toBe('-500');
});
it('preserves actual cents rounding and the confirmed residency date boundary',async()=>{
 const cents=await render('cents');expect(lines(cents.doc)).toEqual(oracle.cents);expect(cents.result.totalDividends.toFixed()).toBe('0.98');expect(cents.ordinary.pa40.dividends.toFixed()).toBe('1');
 const before=await render(),after=await render('boundary');expect(lines(before.doc)).toEqual(oracle.ordinary);expect(lines(after.doc)).toEqual(oracle.boundary);expect(after.ordinary.sourceCommitment).not.toBe(before.ordinary.sourceCommitment);expect(after.ordinary.pa40.dividends.toFixed()).toBe('2500');
});
it('suppresses the finite nonresident attachment only with exact original context',async()=>{
 const f=fixture('ordinary','nonresident'),token=review.preparePAOrdinaryReturnReview(f.input);expect(f.ordinary.pa40.dividends.toFixed()).toBe('0');expect(suppress(redactReviewIdentifiers(f.input),f.result,token)).toBe(true);expect(await fillPAOrdinaryScheduleB(redactReviewIdentifiers(f.input),f.result,'/absent/b.pdf',token)).toBeUndefined();
 const p=await packet(f,token);expect(p.filledForms.some(path=>/pa-schedule-b-(?:review|reference)\.pdf$/.test(path))).toBe(false);
 for(const bad of [undefined,Object.freeze({})])expect(Reflect.apply(suppress,undefined,[f.input,f.result,bad])).toBe(false);
 f.input.form1099Div[0].payer='Equal-money edited actual payer';expect(suppress(f.input,f.result,token)).toBe(false);
 const g=fixture('ordinary','nonresident'),proof=review.preparePAOrdinaryReturnReview(g.input);g.result.totalDividends=g.result.totalDividends.plus('0.01');expect(suppress(redactReviewIdentifiers(g.input),g.result,proof)).toBe(false);await expect(fillPAOrdinaryScheduleB(redactReviewIdentifiers(g.input),g.result,'/absent/b.pdf',proof)).rejects.toThrow(/federal|3b/i);
});
it('keeps private part-year sources out of strict interactive and flattened paper',async()=>{
 const output=process.env.PA_ORDINARY_B_RESIDENCY_OUTPUT;
 for(const kind of ['ordinary','signed','cents']as const){const f=await render(kind),bytes=await f.doc.save(),parsed=strict(bytes),form=f.doc.getForm(),font=await f.doc.embedFont(StandardFonts.Helvetica);expect(f.doc.getPageCount()).toBe(5);F.lines.forEach((name,index)=>{expect(parsed.fields[name]).toBe(oracle[kind][index]);expect(parsed.widgets.filter(row=>row.name===name).map(row=>row.value)).toEqual([oracle[kind][index]]);});expect(parsed.fields['4. Description']).toBe(description);
 for(const name of [...F.lines,'4. Description']){const field=form.getTextField(name),text=field.getText()??'',match=[...(field.acroField.getDefaultAppearance()??'').matchAll(/\/[^ ]+\s+([0-9.]+)\s+Tf/g)].at(-1);expect(match).toBeDefined();const size=Number(match?.[1]);expect(size).toBeGreaterThanOrEqual(7);for(const widget of field.acroField.getWidgets()){expect(widget.getAppearances()?.normal).toBeTruthy();expect(font.widthOfTextAtSize(text,size)).toBeLessThanOrEqual(widget.getRectangle().width-4);expect(font.heightAtSize(size)).toBeLessThanOrEqual(widget.getRectangle().height-2);}}
 const secrets=[f.input.taxpayer.primary.firstName+' '+f.input.taxpayer.primary.lastName,f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/g,''),f.input.form1099Div[0].payer,f.input.form1099Div[0].payerTin,f.input.form1099Div[0].accountReference,f.residency.dividends[0].sourceReference,...f.residency.dividends[0].credits.flatMap(row=>[row.sourceReference,row.creditedOn])];
 const check=(text:string)=>{for(const secret of secrets)if(secret)expect(text).not.toContain(secret);};check(JSON.stringify(parsed));expect(form.getTextField(F.name).getText()).toBe('[REDACTED]');expect(form.getTextField(F.ssn).getText()??'').toBe('');for(const page of parsed.pages)expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');
 await flattenForm(form);const flat=await f.doc.save(),flatDoc=await PDFDocument.load(flat),flatParsed=strict(flat);expect(flatDoc.getForm().getFields()).toHaveLength(0);for(const page of flatDoc.getPages())for(const ref of page.node.Annots()?.asArray()??[]){const annotation=flatDoc.context.lookup(ref);expect(annotation instanceof PDFDict&&annotation.get(PDFName.of('Subtype'))===PDFName.of('Widget')).toBe(false);}check(JSON.stringify(flatParsed));expect(flatParsed.pages[0]).toContain(oracle[kind][5]);expect(flatParsed.pages[0]).toContain(oracle[kind][13]);expect(flatParsed.pages[0]).toContain(description);
 if(output){await mkdir(output,{recursive:true});await writeFile(join(output,kind+'-interactive.pdf'),bytes);await writeFile(join(output,kind+'-flattened.pdf'),flat);}
 }
});
it('rejects stale unknown unsupported and contradictory part-year source proof',async()=>{
 const f=fixture(),token=review.preparePAOrdinaryReturnReview(f.input),redacted=redactReviewIdentifiers(f.input);
 await expect(Reflect.apply(fillPAOrdinaryScheduleB,undefined,[redacted,f.result,'/absent/b.pdf',Object.freeze({})])).rejects.toThrow(/original|context|prepared/i);
 f.result.totalDividends=f.result.totalDividends.plus('0.01');await expect(fillPAOrdinaryScheduleB(redacted,f.result,'/absent/b.pdf',token)).rejects.toThrow(/federal|3b/i);
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.residency.dividends[0].sourceFactsConfirmed=null;},(f:ReturnType<typeof fixture>)=>{f.residency.dividends[0].credits[0].creditedOn='2025-02-30';},(f:ReturnType<typeof fixture>)=>{Reflect.set(f.input.form1099Div[0],'accountHolder','joint');},(f:ReturnType<typeof fixture>)=>{f.input.form1099Div[0].section199ADividends='1';},(f:ReturnType<typeof fixture>)=>{delete f.input.paOrdinaryReturnCompletionSources;}]){const g=fixture();change(g);expect(()=>review.preparePAOrdinaryReturnReview(g.input)).toThrow();}
 const g=fixture(),proof=review.preparePAOrdinaryReturnReview(g.input);g.result.stateReturns={pennsylvania:{...g.ordinary,scheduleB:{...g.ordinary.scheduleB,line4:g.ordinary.scheduleB.line4.plus(1)}}};await expect(fillPAOrdinaryScheduleB(redactReviewIdentifiers(g.input),g.result,'/absent/b.pdf',proof)).rejects.toThrow(/result|reconcile/i);
 const h=fixture(),hp=review.preparePAOrdinaryReturnReview(h.input),projection=review.assertPAOrdinaryReturnReview(h.input,h.result,hp);if(!projection.scheduleB)throw Error('Missing PY projection');projection.scheduleB.lines[3]='999';expect(review.assertPAOrdinaryReturnReview(h.input,h.result,hp).scheduleB?.lines[3]).toBe('1200');h.input.taxpayer.taxYear=2026;h.result.taxYear=2026;await expect(fillPAOrdinaryScheduleB(h.input,h.result,'/absent/b.pdf',hp)).rejects.toThrow(/2026|mapping/i);
 const blankBytes=await readFile(blank),bad=Buffer.from(blankBytes);bad[bad.length-10]^=1;expect(()=>assertReviewTemplateBytes('pa-schedule-b.pdf',bad,2025)).toThrow(/revision/i);
});
it('preserves attachment suppression and unknown reference fallback',async()=>{
 const no=paOrdinaryScheduleBPaperFixture('no-adjustment');expect(shouldIncludePAScheduleBReferenceSummary(no.ordinary.scheduleB)).toBe(false);expect(await fillPAOrdinaryScheduleB(no.input,no.result,'/absent/b.pdf',review.preparePAOrdinaryReturnReview(no.input))).toBeUndefined();
 const raw=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,address:{...simpleW2Fixture.taxpayer.address,state:'PA'}},w2s:simpleW2Fixture.w2s.map(w=>({...w,state:'PA',stateWages:'85000',stateTaxWithheld:'2610'})),form1099Div:[{payer:'Fictional legacy fund',ordinaryDividends:'2000',totalCapitalGainDistributions:'500'}]});
 const state=calculatePAReturn(raw),result=federal.calculateFederalTax(raw);result.stateReturns={pennsylvania:Object.assign(state,{residencyStatus:'nonresident'})};expect(suppress(raw,result)).toBe(false);
 const dir=await mkdtemp(join(tmpdir(),'pa-b-unknown-'));try{const p=await fillReturn(raw,result,{blankFormsDir:forms,outputDir:dir});expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-reference.pdf'))).toBe(true);expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-review.pdf'))).toBe(false);}finally{await rm(dir,{recursive:true,force:true});}
});
it('reports part-year paper and nonresident nonapplicability only from known source authority',()=>{
 const ready=(f:ReturnType<typeof fixture>,token:unknown,forms:string[])=>Reflect.apply(assessReturnReadiness,undefined,[{taxInput:redactReviewIdentifiers(f.input),federalResult:f.result,includedForms:forms,stateCode:'PA',paOrdinaryReview:token}]);
 const py=fixture(),pt=review.preparePAOrdinaryReturnReview(py.input),nr=fixture('ordinary','nonresident'),nt=review.preparePAOrdinaryReturnReview(nr.input),spy=vi.spyOn(federal,'calculateFederalTax');
 try{const p=ready(py,pt,['pa-schedule-b-review.pdf']),n=ready(nr,nt,[]);expect(p.findings.join(' ')).toContain('Schedule B is included as an original-bound official');expect(n.findings.join(' ')).toContain('Schedule B is not required');expect(n.findings.join(' ')).not.toContain('Schedule B applies');for(const item of [p,n]){expect(item.filingQualified).toBe(false);expect(item.packetCompleteness).toBe('partial');}
 for(const proof of [undefined,Object.freeze({})]){expect(ready(nr,proof,[]).findings.join(' ')).toContain('Schedule B applies');expect(ready(py,proof,['pa-schedule-b-review.pdf']).findings.join(' ')).not.toContain('Schedule B is included as an original-bound official');}
 nr.result.totalDividends=nr.result.totalDividends.plus('0.01');expect(ready(nr,nt,[]).findings.join(' ')).toContain('Schedule B applies');expect(spy).not.toHaveBeenCalled();
 }finally{spy.mockRestore();}
});

it('keeps a negative printed final sum reference-only without inventing penny allocation',async()=>{
 const f=fixture('outside-cents'),token=review.preparePAOrdinaryReturnReview(f.input),schedule=f.ordinary.scheduleB;
 expect([schedule.line1,schedule.line2,schedule.line3,schedule.line4,schedule.line5,schedule.line6,schedule.line7,schedule.line8,schedule.line9a,schedule.line9b,schedule.line9c,schedule.line10,schedule.line11,schedule.line12].map(value=>value.toFixed(0))).toEqual(oracle.outsideCents);expect(f.ordinary.pa40.dividends.toFixed()).toBe('0');expect(schedule.line6.plus(schedule.line10).toFixed()).toBe('-1');
 const doc=await fillPAOrdinaryScheduleB(redactReviewIdentifiers(f.input),f.result,blank,token),output=process.env.PA_ORDINARY_B_RESIDENCY_OUTPUT;if(doc&&output){await mkdir(output,{recursive:true});await writeFile(join(output,'outside-cents-invalid-physical.pdf'),await doc.save());}expect(doc).toBeUndefined();
 expect(review.hasPAOrdinaryScheduleBReviewAuthority(f.input,f.result,token)).toBe(false);const p=await packet(f,token);expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-reference.pdf'))).toBe(true);expect(p.filledForms.some(path=>path.endsWith('pa-schedule-b-review.pdf'))).toBe(false);
 const ready=assessReturnReadiness({taxInput:redactReviewIdentifiers(f.input),federalResult:f.result,includedForms:['pa-schedule-b-reference.pdf'],stateCode:'PA',paOrdinaryReview:token});expect(ready.findings.join(' ')).toContain('Schedule B is included as a reference summary');expect(ready.filingQualified).toBe(false);expect(ready.packetCompleteness).toBe('partial');
 const nr=fixture('outside-cents','nonresident'),nrToken=review.preparePAOrdinaryReturnReview(nr.input);expect(suppress(redactReviewIdentifiers(nr.input),nr.result,nrToken)).toBe(true);const np=await packet(nr,nrToken);expect(np.filledForms.some(path=>/pa-schedule-b-(?:review|reference)\.pdf$/.test(path))).toBe(false);
});
