// Spec: spec/state/pa-ordinary-digital-mixed-private-saved-pdf.yaml.
import {it,expect} from 'vitest';
import {join} from 'node:path';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {PDFDocument,PDFName,PDFTextField} from 'pdf-lib';
import {fillReturn} from '@/pdf/fill-return';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {prepareForm8949Review} from '@/pdf/form-8949-review-context';
import {PA_ORDINARY_D_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-ordinary-schedule-d';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {mixedPrivateDigitalFixture,mixedPrivateKeys} from '../fixtures/pa-digital-cod-mixed-private-independent';
it('keeps all six mixed debt and receipt references out of the saved complete packet D',async()=>{
 const {input,ordinary,result,secrets}=mixedPrivateDigitalFixture(mixedPrivateKeys),before=JSON.stringify(input);
 expect(ordinary.pa40.taxLiability.toFixed()).toBe('3071');expect(ordinary.pa40.totalPayments.toFixed()).toBe('4000');expect(ordinary.pa40.netOverpayment.toFixed()).toBe('929');
 const token=preparePAOrdinaryReturnReview(input),capitalGainReview=prepareForm8949Review(input),dir=await mkdtemp(join(tmpdir(),'pa-digital-mixed-private-'));
 try{
  const packet=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token,capitalGainReview});
  expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-d-filled.pdf'))).toBe(true);
  const bytes=await readFile(join(dir,'pa-schedule-d-filled.pdf'));
  const output=process.env.PA_DIGITAL_SCHEDULE_D_OUTPUT;if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'mixed-debt-private-source-fields.pdf'),bytes);}
  const saved=await PDFDocument.load(bytes),texts:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);print(json.dumps([p.extract_text() or '' for p in r.pages]))"],{input:bytes,encoding:'utf8'}));
  const printed=texts.join(' '),values=saved.getForm().getFields().map(field=>field instanceof PDFTextField?(field.getText()??''):(field.acroField.dict.get(PDFName.of('V'))?.toString()??'')).join(' ');
  const literal='0.001 Complete mixed actual safe prefix [REDACTED] [REDACTED] [REDACTED] [REDACTED] [REDACTED] [REDACTED] COMPLETE MIXED ACTUAL SAFE END';
  expect.soft(printed.replace(/\s/g,'')).toContain(literal.replace(/\s/g,''));
  for(const secret of secrets)expect.soft((printed+' '+values).replace(/\s/g,'')).not.toContain(secret.replace(/\s/g,''));
  const get=(name:string)=>saved.getForm().getTextField(name).getText()??'';
  expect(get(F.rows[0].description)).toBe('SEE REFERENCE');expect(get(F.rows[0].proceeds)).toBe('100');expect(get(F.rows[0].basis)).toBe('80');expect(get(F.rows[0].gain)).toBe('20');expect(get(F.line3)).toBe('20');expect(get(F.line12)).toBe('20');expect(get(F.ssn)).toBe('');expect(saved.getPageCount()).toBe(6);
  for(const page of texts)expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');expect(JSON.stringify(input)).toBe(before);expect(ordinary.readiness.filingEligible).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
