/** Spec: state/pa-ordinary-business-sources.yaml packet. Actual source-derived all3 reference PDFs. */
import {expect,it} from 'vitest';
import {execFileSync} from '../helpers/file-stdin-exec';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {fillReturn} from '@/pdf/fill-return';
import {paOrdinaryBusinessFixture} from '../fixtures/pa-ordinary-business-sources';
const pages=(bytes:Uint8Array):string[]=>JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);assert not (r.get_fields() or {});annotations=[a.get_object() for p in r.pages for a in p.get('/Annots',[])];assert all(a.get('/Subtype')!='/Widget' for a in annotations);print(json.dumps([p.extract_text() or '' for p in r.pages]))"],{input:bytes,encoding:'utf8'}));
it.each([['resident','15200','2005'],['part_year','6200','990'],['nonresident','6200','375']]as const)('business saved PDF uses actual selected Schedule C for %s',async(status,net,tax)=>{
 const f=paOrdinaryBusinessFixture(status),input=Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources}),before=structuredClone(input);
 const ordinary=calculatePAOrdinaryReturn(input,f.facts,f.sources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};
 const parent=process.env.TAX_ENGINE_BUSINESS_ARTIFACT_DIR??await mkdtemp(join(tmpdir(),'pa-business-source-'));await mkdir(parent,{recursive:true});const dir=join(parent,status);await mkdir(dir,{recursive:true});
 const packet=await fillReturn(redactReviewIdentifiers(input),result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true,purpose:'review',paOrdinaryReview:preparePAOrdinaryReturnReview(input)});
 const c=packet.filledForms.find(p=>p.endsWith('pa-schedule-c-reference.pdf')),pa=packet.filledForms.find(p=>p.endsWith('pa-40-filled.pdf'));expect(c).toBeDefined();expect(pa).toBeDefined();if(!c||!pa)throw Error('Actual source-derived PA40 and C reference required');
 const ctext=pages(await readFile(c)).join('\n');expect(ctext).toContain('Line 39 net profit or loss');expect(ctext).toContain('$'+net);expect(ctext).toContain('REFERENCE SUMMARY ONLY');
 const patext=pages(await readFile(pa)).join('\n').replaceAll(',','');expect(patext).toContain(tax);
 const merged=await PDFDocument.create();for(const path of packet.filledForms){const doc=await PDFDocument.load(await readFile(path));for(const page of await merged.copyPages(doc,doc.getPageIndices()))merged.addPage(page);}
 const bytes=await merged.save(),all=pages(bytes).join('\n');for(const value of [input.taxpayer.primary.ssn,input.taxpayer.primary.ssn.replace(/\D/g,''),input.form1099Nec[0].payerTin])if(value)expect(all).not.toContain(value);
 expect(merged.getForm().getFields()).toHaveLength(0);await writeFile(join(parent,'business-'+status+'-review.pdf'),bytes);expect(input).toEqual(before);expect(ordinary.readiness.filingEligible).toBe(false);
},120000);
