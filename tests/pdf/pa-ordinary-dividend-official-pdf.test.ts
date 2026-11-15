/** Spec: spec/state/pa-schedule-b.yaml; official2025 PA40B pages1/3–5. */
import {expect,it} from 'vitest';
import {PDFDocument,PDFName,PDFDict,StandardFonts} from 'pdf-lib';
import Decimal from 'decimal.js';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fillReturn} from '@/pdf/fill-return.js';
import * as api from '@/pdf/fill-pa-schedule-b.js';
import {assertPAOrdinaryReturnReview,preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {assertReviewTemplateBytes} from '@/pdf/template-registry.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {calculatePAScheduleB} from '@/engine/state/pa-schedule-b.js';
import {paOrdinaryScheduleBPaperFixture as fixture} from '../fixtures/pa-ordinary-schedule-b-paper.js';
import {execFileSync} from '../helpers/file-stdin-exec';
const blank=join(process.cwd(),'forms/blank/2025/pa-schedule-b.pdf');
const hash='c6d8f5cdd63045e1e40b6deeced2c80b23006b7700befe3b8f0c430f2b40a0d4';
const renderer=()=>{if(!('fillPAOrdinaryScheduleB'in api)||typeof api.fillPAOrdinaryScheduleB!=='function')throw Error('Original-bound physical ScheduleB renderer absent');return api.fillPAOrdinaryScheduleB;};
const fields=()=>{if(!('PA_ORDINARY_B_FIELDS'in api))throw Error('Physical fields missing');return api.PA_ORDINARY_B_FIELDS as {name:string;ssn:string;owner:string;lines:readonly string[]};};
async function render(kind:Parameters<typeof fixture>[0]='ordinary'){
 const f=fixture(kind),before=structuredClone(f.input),token=preparePAOrdinaryReturnReview(f.input),doc=await renderer()(redactReviewIdentifiers(f.input),f.result,blank,token);if(!doc)throw Error('Actual original ScheduleB missing');expect(f.input).toEqual(before);return {...f,doc,token};
}
function pageText(bytes:Uint8Array):string[]{return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);print(json.dumps([p.extract_text() or '' for p in r.pages]))"],{input:bytes,encoding:'utf8',timeout:4000,killSignal:'SIGKILL'}));}
function strictFields(bytes:Uint8Array):{fields:Record<string,string>;widgets:Array<{name:string;value:string}>}{
 const script=`import io,json,sys
from pypdf import PdfReader
r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True)
def inspect(a):
 parts=[];value=None;seen=set()
 while a:
  a=a.get_object()
  if id(a) in seen:raise ValueError('Cyclic field parent')
  seen.add(id(a))
  if '/T' in a:parts.append(str(a['/T']))
  if value is None and '/V' in a:value=str(a['/V'])
  a=a.get('/Parent')
 return {'name':'.'.join(reversed(parts)),'value':value or ''}
print(json.dumps({'fields':{n:str(f.get('/V','')) for n,f in (r.get_fields() or {}).items()},'widgets':[inspect(a) for p in r.pages for a in p.get('/Annots',[]) if a.get_object().get('/Subtype')=='/Widget']}))`;
 return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',script],{input:bytes,encoding:'utf8',timeout:4000,killSignal:'SIGKILL'}));
}
it('routes actual resident dividend originals to official review paper',async()=>{
 const f=fixture(),token=preparePAOrdinaryReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-dividend-paper-'));
 try{const p=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token});expect(p.filledForms.some(p=>p.endsWith('pa-schedule-b-review.pdf'))).toBe(true);expect(p.filledForms.some(p=>p.endsWith('pa-schedule-b-reference.pdf'))).toBe(false);}finally{await rm(dir,{recursive:true,force:true});}
});
it('fills fourteen official fields with exact cents rounding and readable appearances',async()=>{
 for(const [kind,expected]of [['ordinary',['2000','0','0','0','0','2000','0','0','0','0','0','500','0','2500']],['cents',['2000','0','0','0','0','2000','0','0','0','0','0','501','0','2501']]]as const){
  const f=await render(kind),bytes=await f.doc.save(),doc=await PDFDocument.load(bytes),form=doc.getForm(),F=fields(),font=await doc.embedFont(StandardFonts.Helvetica);expect(F.lines).toHaveLength(14);expect(new Set(F.lines).size).toBe(14);expect(form.getFields().map(field=>field.getName()).filter(name=>/^(?:[1-8]|9[abc]|10|11|12)\. /.test(name)&&!name.endsWith('Description')).sort()).toEqual([...F.lines].sort());expect(doc.getPageCount()).toBe(5);
  F.lines.forEach((name,index)=>{const field=form.getTextField(name);expect(field.getText()).toBe(expected[index]);expect(field.acroField.getValue()?.decodeText()).toBe(expected[index]);for(const widget of field.acroField.getWidgets()){expect(widget.getAppearances()?.normal).toBeTruthy();const rect=widget.getRectangle(),raw=[...(field.acroField.getDefaultAppearance()??'').matchAll(/\/[^ ]+\s+([0-9.]+)\s+Tf/g)].at(-1)?.[1];if(raw===undefined)throw Error('Saved field font missing');const size=Number(raw);expect(size).toBeGreaterThanOrEqual(7);expect(font.widthOfTextAtSize(expected[index],size)).toBeLessThanOrEqual(rect.width-4);expect(font.heightAtSize(size)).toBeLessThanOrEqual(rect.height-2);}});
  const strict=strictFields(bytes);F.lines.forEach((name,index)=>{expect(strict.fields[name]).toBe(expected[index]);expect(strict.widgets.filter(widget=>widget.name===name).map(widget=>widget.value)).toEqual([expected[index]]);});
  expect(form.getCheckBox(F.owner).acroField.getWidgets().map(w=>w.getAppearanceState()?.toString())).toEqual(['/1','/Off','/Off']);expect(f.ordinary.pa40.dividends.toFixed()).toBe(expected[13]);expect(form.getTextField('4. Description').getText()??'').toBe('');expect(form.getTextField('8. Description').getText()??'').toBe('');
 }
});
it('rejects forged stale missing and contradictory source authority before template IO',async()=>{
 const f=fixture(),token=preparePAOrdinaryReturnReview(f.input),before=structuredClone(f.input),missing='/absent/pa-schedule-b.pdf';
 await expect(Reflect.apply(renderer(),undefined,[redactReviewIdentifiers(f.input),f.result,missing,Object.freeze({})])).rejects.toThrow(/original|context|prepared/i);
 f.result.stateReturns={pennsylvania:{...f.ordinary,scheduleB:{...f.ordinary.scheduleB,line12:f.ordinary.scheduleB.line12.plus(1)}}};await expect(renderer()(redactReviewIdentifiers(f.input),f.result,missing,token)).rejects.toThrow(/result|reconcile/i);f.result.stateReturns={pennsylvania:f.ordinary};
 f.input.form1099Div[0].payer='Equal-money altered fund';await expect(renderer()(f.input,f.result,missing,token)).rejects.toThrow(/original|changed/i);expect(before.form1099Div[0].payer).not.toBe(f.input.form1099Div[0].payer);
 const mutate=[(f:ReturnType<typeof fixture>)=>{f.residency.dividends[0].sourceTaxYear=2024;},(f:ReturnType<typeof fixture>)=>{f.residency.dividends[0].sourceFactsConfirmed=null;},(f:ReturnType<typeof fixture>)=>{f.input.form1099Div[0].accountHolder='spouse';},(f:ReturnType<typeof fixture>)=>{delete f.input.paOrdinaryReturnCompletionSources;}];for(const change of mutate){const x=fixture();change(x);expect(()=>preparePAOrdinaryReturnReview(x.input)).toThrow();}
 const x=fixture(),proof=preparePAOrdinaryReturnReview(x.input),projection=assertPAOrdinaryReturnReview(x.input,x.result,proof);if(!projection.scheduleB)throw Error('B projection missing');projection.scheduleB.lines[0]='999';expect(assertPAOrdinaryReturnReview(x.input,x.result,proof).scheduleB?.lines[0]).toBe('2000');
});
it('preserves real attachment suppression and reference fallbacks',async()=>{
 const no=fixture('no-adjustment');expect(api.shouldIncludePAScheduleBReferenceSummary(no.ordinary.scheduleB)).toBe(false);expect(await renderer()(no.input,no.result,'/absent/b.pdf',preparePAOrdinaryReturnReview(no.input))).toBeUndefined();
 const py=fixture('ordinary','part_year');expect(await renderer()(py.input,py.result,blank,preparePAOrdinaryReturnReview(py.input))).toBeDefined();
 const nr=fixture('ordinary','nonresident');expect(await renderer()(nr.input,nr.result,'/absent/b.pdf',preparePAOrdinaryReturnReview(nr.input))).toBeUndefined();
 const legacy=calculatePAScheduleB({taxYear:2025,federalDividendIncome:new Decimal(100),reductionAdjustments:[{description:'Actual adjustment outside physical cohort',amount:new Decimal(200)}],capitalGainDistributions:new Decimal(300)});expect(legacy.line6.toFixed()).toBe('-100');expect(legacy.line12.toFixed()).toBe('200');expect(api.shouldIncludePAScheduleBReferenceSummary(legacy)).toBe(true);
 const dir=await mkdtemp(join(tmpdir(),'pa-dividend-reference-'));try{const p=await fillReturn(redactReviewIdentifiers(py.input),py.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:preparePAOrdinaryReturnReview(py.input)});expect(p.filledForms.some(p=>p.endsWith('pa-schedule-b-reference.pdf'))).toBe(false);expect(p.filledForms.some(p=>p.endsWith('pa-schedule-b-review.pdf'))).toBe(true);}finally{await rm(dir,{recursive:true,force:true});}
});
it('keeps private sources out of interactive and flattened official review copies',async()=>{
 const f=await render(),F=fields(),bytes=await f.doc.save(),doc=await PDFDocument.load(bytes);expect(doc.getForm().getTextField(F.name).getText()).toBe('[REDACTED]');expect(doc.getForm().getTextField(F.ssn).getText()??'').toBe('');
 const secrets=[f.input.taxpayer.primary.firstName+' '+f.input.taxpayer.primary.lastName,f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/g,''),f.input.form1099Div[0].payer,f.input.form1099Div[0].payerTin,f.input.form1099Div[0].accountReference,f.residency.dividends[0].sourceReference];
 const check=(bytes:Uint8Array,doc:PDFDocument)=>{const pages=pageText(bytes),all=pages.join(' ')+doc.getForm().getFields().map(field=>field.acroField.dict.get(PDFName.of('V'))?.toString()??'').join(' ');for(const secret of secrets)if(secret)expect(all).not.toContain(secret);for(const p of pages)expect(p).toContain('FOR REVIEW ONLY - NOT FOR FILING');return pages;};check(bytes,doc);
 const dir=await mkdtemp(join(tmpdir(),'pa-dividend-flat-'));try{const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:f.token,flatten:true});const path=packet.filledForms.find(path=>path.endsWith('pa-schedule-b-review.pdf'));if(!path)throw Error('Flattened B missing');const flat=await readFile(path),flatDoc=await PDFDocument.load(flat);expect(flatDoc.getForm().getFields()).toHaveLength(0);for(const p of flatDoc.getPages())for(const ref of p.node.Annots()?.asArray()??[]){const annotation=flatDoc.context.lookup(ref);expect(annotation instanceof PDFDict&&annotation.get(PDFName.of('Subtype'))===PDFName.of('Widget')).toBe(false);}const pages=check(flat,flatDoc);expect(pages[0]).toContain('2500');const output=process.env.PA_ORDINARY_SCHEDULE_B_OUTPUT;if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'interactive.pdf'),bytes);await writeFile(join(output,'flattened.pdf'),flat);}}finally{await rm(dir,{recursive:true,force:true});}
});
it('pins the template and keeps year filing and disclosure gates closed',async()=>{
 const f=fixture(),token=preparePAOrdinaryReturnReview(f.input);f.input.taxpayer.taxYear=2026;f.result.taxYear=2026;await expect(renderer()(f.input,f.result,'/absent/b.pdf',token)).rejects.toThrow(/2026|mapping/i);expect(assertReviewTemplateBytes('pa-schedule-b.pdf',await readFile(blank),2025).sha256).toBe(hash);const bad=Buffer.from(await readFile(blank));bad[bad.length-10]^=1;expect(()=>assertReviewTemplateBytes('pa-schedule-b.pdf',bad,2025)).toThrow(/revision/i);
 const x=fixture();for(const [name,phrase]of [['pa-schedule-b-review.pdf','official form review'],['pa-schedule-b-reference.pdf','reference summary'],['old-pa-schedule-b-review.pdf','no Schedule B packet']]as const){const ready=assessReturnReadiness({taxInput:x.input,federalResult:x.result,includedForms:[name],stateCode:'PA',paOrdinaryReview:preparePAOrdinaryReturnReview(x.input)});expect(ready.findings.join(' ')).toContain(phrase);expect(ready.filingQualified).toBe(false);expect(ready.packetCompleteness).toBe('partial');}
});
it('does not certify physical B from a basename without exact finite original authority',()=>{
 const official='Schedule B is included as an original-bound official form review copy';
 const check=(f:ReturnType<typeof fixture>,proof:unknown)=>Reflect.apply(assessReturnReadiness,undefined,[{taxInput:redactReviewIdentifiers(f.input),federalResult:f.result,includedForms:['pa-schedule-b-review.pdf'],stateCode:'PA',paOrdinaryReview:proof}]);
 const valid=fixture(),token=preparePAOrdinaryReturnReview(valid.input);expect(check(valid,token).findings.join(' ')).toContain(official);
 for(const proof of [undefined,Object.freeze({})])expect(check(valid,proof).findings.join(' ')).not.toContain(official);
 const py=fixture('ordinary','part_year');expect(check(py,preparePAOrdinaryReturnReview(py.input)).findings.join(' ')).toContain(official);
 const stale=fixture(),staleToken=preparePAOrdinaryReturnReview(stale.input);stale.input.form1099Div[0].payer='Edited equal-dollar actual payer';expect(check(stale,staleToken).findings.join(' ')).not.toContain(official);
 const changed=fixture(),changedToken=preparePAOrdinaryReturnReview(changed.input);changed.result.stateReturns={pennsylvania:{...changed.ordinary,pa40:{...changed.ordinary.pa40,dividends:changed.ordinary.pa40.dividends.plus(1)}}};expect(check(changed,changedToken).findings.join(' ')).not.toContain(official);
});
it('binds printed BLine1 to the exact original federal dividend scalar before IO',async()=>{
 for(const kind of ['ordinary','cents']as const){const f=fixture(kind),token=preparePAOrdinaryReturnReview(f.input);f.result.totalDividends=f.result.totalDividends.plus('0.01');
 const ready=Reflect.apply(assessReturnReadiness,undefined,[{taxInput:redactReviewIdentifiers(f.input),federalResult:f.result,includedForms:['pa-schedule-b-review.pdf'],stateCode:'PA',paOrdinaryReview:token}]);expect(ready.findings.join(' ')).not.toContain('Schedule B is included as an original-bound official');
 await expect(renderer()(redactReviewIdentifiers(f.input),f.result,'/absent/b.pdf',token)).rejects.toThrow(/federal|3b/i);}
});
