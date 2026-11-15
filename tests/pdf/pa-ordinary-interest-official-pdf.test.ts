import {PDFDocument,PDFName,StandardFonts} from 'pdf-lib';
import {fillPAOrdinaryScheduleA,PA_ORDINARY_A_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-ordinary-schedule-a.js';
import {assertPAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {assertReviewTemplateBytes} from '@/pdf/template-registry.js';
import {assessReturnReadiness} from '@/utils/return-readiness.js';
import {paOrdinaryOIDFixture} from '../fixtures/pa-ordinary-oid-sources.js';
import {execFileSync} from '../helpers/file-stdin-exec';
/** Spec: spec/state/pa-ordinary-schedule-a-paper.yaml */
import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {paOrdinaryReturnFixture} from '../fixtures/pa-ordinary-return.js';
async function packet(status:'resident'|'part_year'|'nonresident'){
 const f=paOrdinaryReturnFixture(status);Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});
 const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.sources),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};
 const token=preparePAOrdinaryReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-ordinary-interest-paper-'));
 try{return await fillReturn(redactReviewIdentifiers(f.input),result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token});}finally{await rm(dir,{recursive:true,force:true});}
}
describe('actual2025 original-bound PA Schedule A paper',()=>{
 it('renders the adjustment-triggered original part-year Schedule A as an official review copy',async()=>{const result=await packet('part_year');expect(result.filledForms.some(path=>path.endsWith('pa-schedule-a-review.pdf'))).toBe(true);expect(result.filledForms.some(path=>path.endsWith('pa-schedule-a-reference.pdf'))).toBe(false);});
 it('does not attach Schedule A for ordinary resident interest without an adjustment',async()=>{const result=await packet('resident');expect(result.filledForms.some(path=>/pa-schedule-a-/.test(path))).toBe(false);});
 it('does not attach Schedule A for the complete ordinary nonresident source route',async()=>{const result=await packet('nonresident');expect(result.filledForms.some(path=>/pa-schedule-a-/.test(path))).toBe(false);});
});

const blank=join(process.cwd(),'forms/blank/2025/pa-schedule-a.pdf');
const expectedPY=['120','0','0','120','0','0','0','80','80','40','0','0','0','0','0','40'];
const expectedR=['1120','0','0','1120','0','0','1000','0','1000','120','0','0','0','0','0','120'];
function source(kind:'part_year'|'resident-treasury'='part_year'){
 const f=kind==='resident-treasury'?(()=>{const x=paOrdinaryOIDFixture('resident','treasury');return {input:x.input,facts:x.facts,sources:x.completion};})():paOrdinaryReturnFixture('part_year');
 Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});
 const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.sources),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};return {...f,ordinary,result};
}
async function render(kind:Parameters<typeof source>[0]='part_year'){
 const f=source(kind),token=preparePAOrdinaryReturnReview(f.input),doc=await fillPAOrdinaryScheduleA(redactReviewIdentifiers(f.input),f.result,blank,token);if(!doc)throw Error('Actual ordinary Schedule A review missing');return {...f,doc,token};
}
function pageText(bytes:Uint8Array):string[]{return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);print(json.dumps([p.extract_text() or '' for p in r.pages]))"],{input:bytes,encoding:'utf8'}));}
async function retain(name:string,bytes:Uint8Array){const output=process.env.PA_ORDINARY_SCHEDULE_A_OUTPUT;if(output){await mkdir(output,{recursive:true});await writeFile(join(output,name+'.pdf'),bytes);}}
it.each([['part_year',expectedPY],['resident-treasury',expectedR]] as const)('fills all sixteen official fields with saved appearances and readable geometry: %s',async(kind,expected)=>{
 const f=await render(kind),bytes=await f.doc.save(),doc=await PDFDocument.load(bytes),form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica);
 expect(doc.getPageCount()).toBe(5);F.lines.forEach((name,index)=>{const field=form.getTextField(name);expect(field.getText()).toBe(expected[index]);expect(field.acroField.getValue()?.decodeText()).toBe(expected[index]);for(const widget of field.acroField.getWidgets()){expect(widget.getAppearances()?.normal).toBeTruthy();const rect=widget.getRectangle();const sizes=[...(field.acroField.getDefaultAppearance()??'').matchAll(/\/[^ ]+\s+([0-9.]+)\s+Tf/g)],raw=sizes.at(-1)?.[1];if(raw===undefined)throw Error('Actual saved font size missing');const size=Number(raw);expect(size).toBeGreaterThanOrEqual(7);expect(font.widthOfTextAtSize(expected[index],size)).toBeLessThanOrEqual(rect.width-4);expect(font.heightAtSize(size)).toBeLessThanOrEqual(rect.height-2);}});
 expect(form.getTextField(F.name).getText()).toBe('[REDACTED]');expect(form.getTextField(F.ssn).getText()??'').toBe('');expect(form.getCheckBox(F.owner).acroField.getWidgets().map(widget=>widget.getAppearanceState()?.toString())).toEqual(['/1','/Off','/Off']);
 expect(f.ordinary.pa40.interest.toFixed()).toBe(expected[15]);expect(f.ordinary.readiness.filingEligible).toBe(false);expect(f.ordinary.pa40.interest.constructor.name).toBe('Decimal');for(const page of pageText(bytes))expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');await retain(kind,bytes);
});
it('retains original-only authority and rejects stale sources results and forged tokens before template IO',async()=>{
 const f=source(),token=preparePAOrdinaryReturnReview(f.input),original=structuredClone(f.input);
 await expect(Reflect.apply(fillPAOrdinaryScheduleA,undefined,[redactReviewIdentifiers(f.input),f.result,'/absent/a.pdf',Object.freeze({})])).rejects.toThrow(/original.*context|prepared|invalid/i);
 f.result.stateReturns={pennsylvania:{...f.ordinary,pa40:{...f.ordinary.pa40,interest:f.ordinary.pa40.interest.plus(1)}}};await expect(fillPAOrdinaryScheduleA(redactReviewIdentifiers(f.input),f.result,'/absent/a.pdf',token)).rejects.toThrow(/result|reconcile/i);
 f.result.stateReturns={pennsylvania:f.ordinary};f.input.form1099Int[0].payer='Changed actual source';await expect(fillPAOrdinaryScheduleA(f.input,f.result,'/absent/a.pdf',token)).rejects.toThrow(/changed|original/i);expect(original.form1099Int[0].payer).not.toBe(f.input.form1099Int[0].payer);
});
it('returned paper projections cannot mutate opaque original authority',()=>{const f=source(),token=preparePAOrdinaryReturnReview(f.input),facts=assertPAOrdinaryReturnReview(f.input,f.result,token);if(!facts.scheduleA)throw Error('Actual ScheduleA missing');facts.scheduleA.lines[0]='999';expect(assertPAOrdinaryReturnReview(f.input,f.result,token).scheduleA?.lines[0]).toBe('120');});
it('keeps names identifiers original references and payer data out of saved field trees and page text',async()=>{
 const f=await render('resident-treasury'),before=structuredClone(f.input),bytes=await f.doc.save(),doc=await PDFDocument.load(bytes),all=pageText(bytes).join(' ')+doc.getForm().getFields().map(field=>field.acroField.dict.get(PDFName.of('V'))?.toString()??'').join(' ');
 const secrets=[f.input.taxpayer.primary.firstName,f.input.taxpayer.primary.firstName+' '+f.input.taxpayer.primary.lastName,f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/g,''),f.input.form1099OID[0].payer,f.input.form1099OID[0].payerTin,f.input.form1099OID[0].sourceId,f.input.form1099Misc[0].accountReference];for(const value of secrets)if(value)expect(all).not.toContain(value);expect(f.input).toEqual(before);
});
it('rejects unavailable2026 and altered official template bytes',async()=>{
 const f=source(),token=preparePAOrdinaryReturnReview(f.input);f.input.taxpayer.taxYear=2026;f.result.taxYear=2026;await expect(fillPAOrdinaryScheduleA(f.input,f.result,'/absent/a.pdf',token)).rejects.toThrow(/2026|mapping/i);
 const bytes=await readFile(blank);expect(assertReviewTemplateBytes('pa-schedule-a.pdf',bytes,2025).sha256).toBe('dd32da96a856d033725e772c9a7dc4339131b4abe776e4caa4e7de722c0cbfce');const bad=Buffer.from(bytes);bad[bad.length-10]^=1;expect(()=>assertReviewTemplateBytes('pa-schedule-a.pdf',bad,2025)).toThrow(/revision/i);
});
it('recognizes only the actual official review basename and keeps reference and filing boundaries',()=>{const f=source();for(const [name,phrase] of [['pa-schedule-a-review.pdf','official form review'],['pa-schedule-a-reference.pdf','reference summary'],['old-pa-schedule-a-review.pdf','no Schedule A packet']] as const){const r=assessReturnReadiness({taxInput:f.input,federalResult:f.result,includedForms:[name],stateCode:'PA'});expect(r.findings.join(' ')).toContain(phrase);expect(r.filingQualified).toBe(false);}});

it('retains the existing reference for actual ordinary taxable OID outside the finite physical cohort',async()=>{
 const f=paOrdinaryOIDFixture('part_year','taxable');f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'10',sourceReference:'Fictional independently computed current principal10'};Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.completion});const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.completion),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};const token=preparePAOrdinaryReturnReview(f.input);
 expect(ordinary.pa40.interest.toFixed()).toBe('340');expect(ordinary.pa40.taxLiability.toFixed()).toBe('809');expect(await fillPAOrdinaryScheduleA(redactReviewIdentifiers(f.input),result,'/absent/a.pdf',token)).toBeUndefined();const dir=await mkdtemp(join(tmpdir(),'pa-interest-reference-fallback-'));
 try{const packet=await fillReturn(redactReviewIdentifiers(f.input),result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token});expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-a-reference.pdf'))).toBe(true);expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-a-review.pdf'))).toBe(false);}finally{await rm(dir,{recursive:true,force:true});}
});
