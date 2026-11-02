// Spec: state/pa-ordinary-source-pdf.yaml. All literal source facts precede PDF product edits.
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {join} from 'node:path';
import {execFileSync}from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {PDFDocument,PDFName,StandardFonts} from 'pdf-lib';
import {fillPA40,PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {assertPAWorkingCreditReview} from '@/pdf/pa-working-credit-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {paOrdinaryPdfFixture} from '../fixtures/pa-ordinary-source-pdf.js';
const blank=join(process.cwd(),'forms/blank/2025/pa-40.pdf');
const text=(doc:PDFDocument,name:string)=>doc.getForm().getTextField(name).getText()??'';
const button=(doc:PDFDocument,name:string)=>doc.getForm().getField(name).acroField.dict.get(PDFName.of('V'))?.toString();
const api=()=>import('@/pdf/pa-ordinary-return-review-context.js');
it('PA ordinary PDF prints all three actual residency tax oracles',async()=>{
 for(const [status,tax,selected,school]of [['resident','1539','/1','02745'],['part_year','799','/3','02745'],['nonresident','184','/2','99999']]as const){
  const f=paOrdinaryPdfFixture(status),doc=await fillPA40(f.input,f.result,blank);expect(text(doc,F.line12).replaceAll(',','')).toBe(tax);expect(button(doc,F.residencyStatus)).toBe(selected);expect(text(doc,F.schoolCode)).toBe(school);expect(button(doc,F.filingStatus)).toBe('/1');
  if(status==='part_year'){expect(text(doc,F.partYearFrom)).toBe('07/01');expect(text(doc,F.partYearTo)).toBe('12/31');}
  if(status==='nonresident')expect(text(doc,F.schoolDistrictName)).toBe('');expect(f.ordinary.readiness.filingEligible).toBe(false);
 }
});
it('PA ordinary PDF uses actual final choice and SP child count',async()=>{
 const f=paOrdinaryPdfFixture('final_children'),doc=await fillPA40(f.input,f.result,blank);expect(button(doc,F.filingStatus)).toBe('/4');expect(text(doc,F.finalReturn)).toBe('SEE REFERENCE');const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],{input:await doc.save(),encoding:'utf8'}));expect(pages[2]).toContain('Fictional permanently stopped PA-source income after2025');expect(text(doc,F.dependents)).toBe('1');expect(f.input.taxpayer.dependents).toHaveLength(1);
});
it('PA ordinary PDF prints actual refund credit donations and late timing',async()=>{
 for(const [kind,refund,net,penalty]of [['refund','700','1000','0'],['late','695','995','5']]as const){const f=paOrdinaryPdfFixture(kind),doc=await fillPA40(f.input,f.result,blank);expect(text(doc,F.line29).replaceAll(',','')).toBe(net);expect(text(doc,F.line30)).toBe(refund);expect(text(doc,F.line31)).toBe('200');expect(text(doc,F.line32Code)).toBe('A');expect(text(doc,F.line32)).toBe('100');expect(text(doc,F.line27)||'0').toBe(penalty);expect(text(doc,F.line27Code)).toBe(kind==='late'?'L':'');}
});
it('PA ordinary PDF separates verified working credit processing from paper totals',async()=>{
 const f=paOrdinaryPdfFixture('working'),doc=await fillPA40(f.input,f.result,blank);expect(f.ordinary.workingCredit.federalEarnedIncomeCredit.toString()).toBe('649');expect(f.ordinary.workingCredit.credit.toString()).toBe('65');expect(text(doc,F.line24)||'0').toBe('0');expect(text(doc,F.line29)||'0').toBe('0');expect(text(doc,F.line30)||'0').toBe('0');expect(doc.getPageCount()).toBe(3);
});
it('PA ordinary PDF prepared context rejects forgeries stale originals and tampered results before I O',async()=>{
 const {preparePAOrdinaryReturnReview}=await api();const f=paOrdinaryPdfFixture(),token=preparePAOrdinaryReturnReview(f.input),redacted=redactReviewIdentifiers(f.input),missing='/does-not-exist/pa40.pdf';
 await expect(fillPA40(redacted,f.result,blank,undefined,token)).resolves.toBeInstanceOf(PDFDocument);
 await expect(fillPA40(redacted,f.result,missing,undefined,{}as typeof token)).rejects.toThrow(/original|prepared|context/i);
 const altered=paOrdinaryPdfFixture();const alteredStates=altered.result.stateReturns;if(!alteredStates)throw new Error('PA source state result missing');alteredStates.pennsylvania= {...altered.ordinary,pa40:{...altered.ordinary.pa40,taxLiability:new Decimal(1)}};await expect(fillPA40(redactReviewIdentifiers(altered.input),altered.result,missing,undefined,token)).rejects.toThrow(/source|result|reconcile/i);
 f.input.w2s[0].wages='1';await expect(fillPA40(f.input,f.result,missing,undefined,token)).rejects.toThrow(/source|original|changed/i);
});
it('PA ordinary PDF packet uses honest type and preserves privacy review and year gates',async()=>{
 const {preparePAOrdinaryReturnReview}=await api();const f=paOrdinaryPdfFixture('refund'),token=preparePAOrdinaryReturnReview(f.input),redacted=redactReviewIdentifiers(f.input),dir=await mkdtemp(join(tmpdir(),'pa-ordinary-pdf-author-'));
 const packet=await fillReturn(redacted,f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token,purpose:'review'});const path=packet.filledForms.find(p=>p.endsWith('pa-40-filled.pdf'));expect(path).toBeDefined();if(!path)throw new Error('PA40 missing');const bytes=await readFile(path),doc=await PDFDocument.load(bytes);expect(text(doc,F.primarySSN)).toBe('');expect(text(doc,F.line30)).toBe('700');expect(Buffer.from(bytes).toString('latin1')).not.toContain(f.input.taxpayer.primary.ssn);
 const future=paOrdinaryPdfFixture();future.input.taxpayer.taxYear=2026;future.result.taxYear=2026;await expect(fillPA40(future.input,future.result,blank)).rejects.toThrow(/2026|mapping|review|source/i);
});

it('PA ordinary PDF legacy working context rejects distinct ordinary zero credit',()=>{const f=paOrdinaryPdfFixture();expect(f.ordinary.workingCredit.credit.toString()).toBe('0');expect(()=>assertPAWorkingCreditReview(f.input,f.result)).toThrow(/ordinary|context|source/i);});

it('PA ordinary PDF actual roots prevent stripped result or missing source fallback',async()=>{const f=paOrdinaryPdfFixture(),missing='/does-not-exist/pa40.pdf';const stripped={...f.result,stateReturns:{pennsylvania:{...f.ordinary}}};delete(stripped.stateReturns.pennsylvania as unknown as Record<string,unknown>).methodVersion;await expect(fillPA40(f.input,stripped,missing)).rejects.toThrow(/ordinary|source|context/i);const incomplete={...f.input,paOrdinaryReturnFacts:undefined};await expect(fillPA40(incomplete,f.result,missing)).rejects.toThrow(/ordinary|source|context/i);});

it('PA ordinary PDF known private source identifiers stay out of final reason reference',async()=>{
 const {preparePAOrdinaryReturnReview,assertPAOrdinaryReturnReview}=await api();const f=paOrdinaryPdfFixture('final_children');
 const primary=f.input.taxpayer.primary.ssn,child=f.input.taxpayer.dependents[0].ssn,payer=f.input.form1099Int[0].payerTin,account=f.input.form1099Int[0].accountReference;if(!payer||!account)throw new Error('Actual canonical payer originals required');
 const privateValues=[primary,primary.replace(/\D/g,''),primary.replaceAll('-',' '),child,child.replace(/\D/g,''),payer,payer.replace(/\D/g,''),account];
 f.facts.filing.finalReturnReason='Stopped PA income; retain this complete nonprivate explanation. Private identifiers '+privateValues.join(' / ');
 if(!f.input.paResidencySources)throw new Error('Actual residency originals required');f.input.paResidencySources.residency.schoolDistrictName=child;
 const before=structuredClone(f.input);f.result.stateReturns={pennsylvania:calculatePAOrdinaryReturn(f.input,f.facts,f.sources)};
 const token=preparePAOrdinaryReturnReview(f.input),render=assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),f.result,token);
 for(const value of privateValues)expect(render.finalReturnReason).not.toContain(value);
 expect(render.residency.schoolDistrictName).toBe('[REDACTED]');expect(render.finalReturnReason).toContain('retain this complete nonprivate explanation');expect(render.finalReturnReason).toContain('[REDACTED]');
 const doc=await fillPA40(redactReviewIdentifiers(f.input),f.result,blank,undefined,token),pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],{input:await doc.save(),encoding:'utf8'}));
 const printed=pages.join('\n')+'\n'+doc.getForm().getFields().map(field=>field.acroField.dict.get(PDFName.of('V'))?.toString()??'').join('\n');
 for(const value of privateValues)expect(printed).not.toContain(value);expect(printed).toContain('retain this complete nonprivate explanation');expect(printed).toContain('[REDACTED]');expect(text(doc,F.finalReturn)).toBe('SEE REFERENCE');expect(f.input).toEqual(before);expect(f.facts.filing.finalReturnReason).toContain(primary);
});

it('PA ordinary PDF full sanitized school source survives official fifteen character field',async()=>{
 const {preparePAOrdinaryReturnReview}=await api(),f=paOrdinaryPdfFixture();if(!f.input.paResidencySources)throw new Error('Actual complete school originals required');
 f.input.paResidencySources.residency.schoolDistrictName='Pittsburgh '+f.input.taxpayer.primary.ssn;const before=structuredClone(f.input);f.result.stateReturns={pennsylvania:calculatePAOrdinaryReturn(f.input,f.facts,f.sources)};
 const token=preparePAOrdinaryReturnReview(f.input),doc=await fillPA40(redactReviewIdentifiers(f.input),f.result,blank,undefined,token);expect(text(doc,F.schoolDistrictName)).toBe('SEE REFERENCE');expect(text(doc,F.schoolCode)).toBe('02745');
 const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],{input:await doc.save(),encoding:'utf8'}));expect(pages[2]).toContain('PA-40 School District name - REVIEW REFERENCE ONLY');expect(pages[2]).toContain('Pittsburgh [REDACTED]');expect(pages.join('\n')).not.toContain(f.input.taxpayer.primary.ssn);expect(pages.join('\n')).not.toContain(f.input.taxpayer.primary.ssn.replace(/\D/g,''));expect(f.input).toEqual(before);
});

it('PA ordinary PDF school reference marker fits its original appearance clipping area',async()=>{
 const {preparePAOrdinaryReturnReview}=await api(),f=paOrdinaryPdfFixture();if(!f.input.paResidencySources)throw new Error('Actual school original required');f.input.paResidencySources.residency.schoolDistrictName='Pittsburgh '+f.input.taxpayer.primary.ssn;f.result.stateReturns={pennsylvania:calculatePAOrdinaryReturn(f.input,f.facts,f.sources)};
 const doc=await fillPA40(redactReviewIdentifiers(f.input),f.result,blank,undefined,preparePAOrdinaryReturnReview(f.input)),font=await doc.embedFont(StandardFonts.Helvetica),saved=await doc.save();
 const appearance:{width:number;height:number;fontSize:number;text:string}=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,re,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);w=next(a.get_object() for p in r.pages for a in p.get('/Annots',[]) if a.get_object().get('/T')=='Name of School District');rect=w['/Rect'];ap=w['/AP']['/N'].get_object().get_data().decode('latin1');size=float(re.findall(r'/Helvetica ([0-9.]+) Tf',ap)[-1]);print(json.dumps({'width':float(rect[2]-rect[0]),'height':float(rect[3]-rect[1]),'fontSize':size,'text':str(w['/V'])}))"],{input:saved,encoding:'utf8'}));
 expect(appearance.width).toBeCloseTo(77.619,3);expect(appearance.height).toBeCloseTo(12.270,3);expect(appearance.text).toBe('SEE REFERENCE');expect(font.widthOfTextAtSize(appearance.text,appearance.fontSize)).toBeLessThanOrEqual(appearance.width-2);expect(font.heightAtSize(appearance.fontSize)).toBeLessThanOrEqual(appearance.height-2);
});
