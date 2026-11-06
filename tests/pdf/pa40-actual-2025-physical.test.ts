/** Spec: state/pa-40.yaml#actual-2025-physical; diagnostic values do not qualify taxpayer sources. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Decimal from 'decimal.js';
import { PDFDocument, PDFName, PDFTextField, PDFDict, PDFRawStream, decodePDFRawStream, StandardFonts } from 'pdf-lib';
import { it, expect } from 'vitest';
import { PA_40_FIELDS as F, projectPA40DiagnosticFields } from '@/pdf/mappings/2025/fill-pa-40.js';
import { REVIEW_TEMPLATES_2025 } from '@/pdf/mappings/2025/template-manifest.js';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';
import { calculatePAReturn, type PAOrchestratorResult } from '@/engine/state/pa-orchestrator.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { paOrdinaryResidencyFixture } from '../fixtures/pa-residency-sources.js';

type RenderFacts={filingStatus?:'S'|'J'|'M'|'F';residency?:{status:'resident'|'part_year'|'nonresident';schoolCode:string;schoolDistrictName:string;from?:string;through?:string};requestedRefund?:string};
const project=projectPA40DiagnosticFields as (doc:PDFDocument,tp:TaxYearInput['taxpayer'],result:PAOrchestratorResult,facts?:RenderFacts)=>Promise<PDFDocument>;
const blank='forms/blank/2025/pa-40.pdf';
function fieldText(doc:PDFDocument,name:string){const field=doc.getForm().getField(name);if(!(field instanceof PDFTextField))throw new Error('Expected text field');return field.getText()??'';}
async function saved(facts?:RenderFacts,mutate?:(r:PAOrchestratorResult)=>void,name='case'){
 const {input}=paOrdinaryResidencyFixture('resident');
 input.w2s[0].wages='75000';input.w2s[0].stateWages='75000';input.w2s[0].stateTaxWithheld='3000';input.form1099Int=[];
 const result=calculatePAReturn(input);mutate?.(result);
 const doc=await project(await PDFDocument.load(await readFile(blank)),input.taxpayer,result,facts);
 const bytes=await doc.save();
 if(process.env.TAX_PA40_PHYSICAL_ARTIFACT_DIR){await mkdir(process.env.TAX_PA40_PHYSICAL_ARTIFACT_DIR,{recursive:true});await writeFile(join(process.env.TAX_PA40_PHYSICAL_ARTIFACT_DIR,`${name}.pdf`),bytes);}
 return PDFDocument.load(bytes);
}
function selected(doc:PDFDocument,name:string,value:string){const field=doc.getForm().getField(name);expect(field.acroField.dict.get(PDFName.of('V'))?.toString()).toBe('/'+value);const widgets=field.acroField.getWidgets();let on=0;for(const w of widgets){const own=w.getOnValue()?.toString();const expected=own==='/'+value?own:'/Off';expect(w.getAppearanceState()?.toString()).toBe(expected);if(expected!=='/Off')on++;expect(w.dict.has(PDFName.of('AP'))).toBe(true);}expect(on).toBe(1);}
it('PA40 actual2025 physical - pins the correct official year and canonical fields',async()=>{
 const bytes=await readFile(blank);const hash=createHash('sha256').update(bytes).digest('hex');expect(hash).toBe('fcd7648601f3ce5a7a258be49c54aa1c604e1c61c1fe9175351451ac6087d8b3');expect(REVIEW_TEMPLATES_2025['pa-40.pdf'].sha256).toBe(hash);
 const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBe(2);expect(doc.getForm().getFields()).toHaveLength(105);
 expect(doc.getForm().getFields().reduce((n,f)=>n+f.acroField.getWidgets().length,0)).toBe(119);
 expect(()=>assertPdfExportAllowed(2026,2026)).toThrow(/No qualified review/);expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow(/unavailable/);
});
it.each([['S','1'],['J','2'],['M','3'],['F','4']] as const)('PA40 actual2025 physical - saves filing %s as its actual exclusive widget',async(code,value)=>{selected(await saved({filingStatus:code},undefined,`filing-${code}`),F.filingStatus,value);});
it.each([['resident','1'],['nonresident','2'],['part_year','3']] as const)('PA40 actual2025 physical - saves actual %s residency and school source',async(status,value)=>{
 const doc=await saved({residency:{status,schoolCode:status==='nonresident'?'99999':'02745',schoolDistrictName:status==='nonresident'?'NON-PENNSYLVANIA':'PITTSBURGH',...(status==='part_year'?{from:'2025-07-01',through:'2025-12-31'}:{})}},undefined,`residency-${status}`);
 selected(doc,F.residencyStatus,value);expect(fieldText(doc,F.schoolCode)).toBe(status==='nonresident'?'99999':'02745');expect(fieldText(doc,F.partYearFrom)).toBe(status==='part_year'?'07/01':'');expect(fieldText(doc,F.partYearTo)).toBe(status==='part_year'?'12/31':'');
});
it('PA40 actual2025 physical - prints known zero and leaves unknown refund intent blank',async()=>{const doc=await saved(undefined,undefined,'unknown-refund');expect(fieldText(doc,F.line25)).toBe('0');expect(fieldText(doc,F.line27)).toBe('');expect(fieldText(doc,F.line27Code)).toBe('');expect(fieldText(doc,F.line29)).toBe('697');expect(fieldText(doc,F.line30)).toBe('');expect(fieldText(doc,F.line31)).toBe('');});
it('PA40 actual2025 physical - retains explicit requested refund and rejects excess',async()=>{expect(fieldText(await saved({requestedRefund:'697'},undefined,'requested-refund'),F.line30)).toBe('697');await expect(saved({requestedRefund:'698'})).rejects.toThrow(/refund|overpayment/i);});
it.each([['E','5','0','0'],['L','0','3','2'],['B','5','3','2']] as const)('PA40 actual2025 physical - saves actual component code %s',async(code,estimate,late,interest)=>{const doc=await saved(undefined,result=>{result.pa40.underpaymentPenalty=new Decimal(estimate);result.pa40.lateFilingOrPaymentPenalty=new Decimal(late);result.pa40.latePaymentInterest=new Decimal(interest);result.pa40.penaltiesAndInterest=new Decimal(estimate).plus(late).plus(interest);},`penalty-${code}`);expect(fieldText(doc,F.line27Code)).toBe(code);});
it('PA40 actual2025 physical - keeps review notice unobscured by decorative pushbuttons',async()=>{
 const doc=await saved(undefined,undefined,'notice');for(const field of doc.getForm().getFields()){if(field.acroField.dict.get(PDFName.of('FT'))?.toString()!=='/Btn'||field.acroField.getFlags()!==65536)continue;for(const widget of field.acroField.getWidgets()){const r=widget.getRectangle();if(r.y<18&&r.y+r.height>3)expect(widget.getFlags()&2).toBe(2);}}
});

it('PA40 actual2025 physical - fits complete occupation text in its saved appearance',async()=>{
 const doc=await saved(undefined,undefined,'occupation-fit');const field=doc.getForm().getTextField(F.yourOccupation);expect(field.getText()).toBe('Software Engineer');const widget=field.acroField.getWidgets()[0];if(!widget)throw new Error('Occupation widget missing');const ap=widget.dict.lookup(PDFName.of('AP'),PDFDict).lookup(PDFName.of('N'));if(!(ap instanceof PDFRawStream))throw new Error('Saved appearance missing');const text=new TextDecoder().decode(decodePDFRawStream(ap).decode());const match=/\/Helvetica\s+([0-9.]+)\s+Tf/.exec(text);if(!match)throw new Error('Actual saved font size missing');const font=await doc.embedFont(StandardFonts.Helvetica);expect(font.widthOfTextAtSize('Software Engineer',Number(match[1]))).toBeLessThanOrEqual(widget.getRectangle().width-2);
});

it('PA40 actual2025 physical - retains official on appearances after default save',async()=>{
 const original=await PDFDocument.load(await readFile(blank));for(const known of [false,true]){const output=await saved(known?{filingStatus:'J',residency:{status:'nonresident',schoolCode:'99999',schoolDistrictName:'NON-PENNSYLVANIA'}}:undefined,undefined,known?'original-appearances-known':'original-appearances-unknown');
 for(const name of [F.filingStatus,F.residencyStatus]){
  const before=original.getForm().getField(name).acroField.getWidgets();const after=output.getForm().getField(name).acroField.getWidgets();expect(after).toHaveLength(before.length);
  for(let i=0;i<before.length;i++){const widget=before[i];const savedWidget=after[i];if(!widget||!savedWidget)throw new Error('Official widget missing');const on=widget.getOnValue();if(!on)throw new Error('Original on appearance missing');const source=widget.dict.lookup(PDFName.of('AP'),PDFDict).lookup(PDFName.of('N'),PDFDict).lookup(on);const target=savedWidget.dict.lookup(PDFName.of('AP'),PDFDict).lookup(PDFName.of('N'),PDFDict).lookup(on);if(!(source instanceof PDFRawStream)||!(target instanceof PDFRawStream))throw new Error('Official stream missing');expect(createHash('sha256').update(target.contents).digest('hex')).toBe(createHash('sha256').update(source.contents).digest('hex'));}
 }
 }
});
