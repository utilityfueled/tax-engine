/** Spec: state/pa-ordinary-schedule-a-paper.yaml, flattened attachment integration. */
import {it,expect,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from '../helpers/file-stdin-exec';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {fillReturn} from '@/pdf/fill-return';
import {PA_ORDINARY_A_FIELDS} from '@/pdf/mappings/2025/fill-pa-ordinary-schedule-a';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import {paOrdinaryBusinessFixture} from '../fixtures/pa-ordinary-business-sources';
import {guidedPACompleteOriginals} from '../fixtures/guided-pa-complete-originals';
import {stateOriginalsReviewWorkspace} from '../fixtures/guided-state-originals';
vi.mock('server-only',()=>({}));
function inspect(bytes:Uint8Array):{pages:number;fields:number;widgets:number;text:string}{
 return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',
  "import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);print(json.dumps({'pages':len(r.pages),'fields':len(r.get_fields() or {}),'widgets':sum(a.get_object().get('/Subtype')=='/Widget' for p in r.pages for a in p.get('/Annots',[])),'text':'\\n'.join(p.extract_text() or '' for p in r.pages)}))"],
  {input:bytes,encoding:'utf8'}));
}
function business(){
 const f=paOrdinaryBusinessFixture('part_year');Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});
 const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.sources),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};return {...f,ordinary,result};
}
it('flattens the physical interest attachment in the actual part-year business packet',async()=>{
 const f=business(),before=structuredClone(f.input),dir=await mkdtemp(join(tmpdir(),'pa-interest-business-merge-'));
 try{
  const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true,purpose:'review',paOrdinaryReview:preparePAOrdinaryReturnReview(f.input)});
  const attachment=packet.filledForms.find(p=>p.endsWith('pa-schedule-a-review.pdf'));if(!attachment)throw Error('Actual official interest attachment required');
  const bytes=await readFile(attachment),saved=inspect(bytes);expect(saved.pages).toBe(5);expect(saved.fields).toBe(0);expect(saved.widgets).toBe(0);
  expect(saved.text).toContain('120');expect(saved.text).toContain('80');expect(saved.text).toContain('40');expect(saved.text.match(/FOR REVIEW ONLY - NOT FOR FILING/g)).toHaveLength(5);
  expect(f.ordinary.pa40.interest.toFixed()).toBe('40');expect(f.ordinary.pa40.netBusinessIncome.toFixed()).toBe('6200');expect(f.ordinary.pa40.taxLiability.toFixed()).toBe('990');expect(f.input).toEqual(before);
  for(const secret of [f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/g,''),f.input.form1099Nec[0].payerTin])if(secret)expect(saved.text).not.toContain(secret);
 }finally{await rm(dir,{recursive:true,force:true});}
},120000);
it('merges the physical interest attachment through the actual complete part-year workspace export',async()=>{
 const state=guidedPACompleteOriginals('part_year'),before=structuredClone(state),download=await buildWorkspaceFilledReturnDownload(stateOriginalsReviewWorkspace(),state);
 expect(download.includedForms).toContain('pa-schedule-a-review.pdf');const saved=inspect(download.contents);expect(saved.fields).toBe(0);expect(saved.widgets).toBe(0);expect(saved.pages).toBeGreaterThanOrEqual(9);expect(saved.text).toContain('PA-40 Schedule A');expect(saved.text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
 const ssn=state.sectionData['personal-info']?.ssn;if(!ssn)throw Error('Actual original taxpayer identifier required');expect(saved.text).not.toContain(ssn);expect(saved.text).not.toContain(ssn.replace(/\D/g,''));expect(state).toEqual(before);
},120000);
it('retains interactive official interest fields when flatten is not requested',async()=>{
 const f=business(),dir=await mkdtemp(join(tmpdir(),'pa-interest-interactive-'));
 try{
  const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,purpose:'review',paOrdinaryReview:preparePAOrdinaryReturnReview(f.input)});
  const attachment=packet.filledForms.find(p=>p.endsWith('pa-schedule-a-review.pdf'));if(!attachment)throw Error('Actual official interest attachment required');
  const doc=await PDFDocument.load(await readFile(attachment)),form=doc.getForm();expect(form.getFields().length).toBeGreaterThanOrEqual(20);expect(form.getTextField(PA_ORDINARY_A_FIELDS.lines[15]).getText()).toBe('40');expect(form.getTextField(PA_ORDINARY_A_FIELDS.lines[15]).acroField.getWidgets()[0]?.getAppearances()?.normal).toBeTruthy();
 }finally{await rm(dir,{recursive:true,force:true});}
},120000);
