// Specs: spec/federal/schedule-se.yaml and spec/federal/schedule-se-review-selection.yaml.
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFTextField, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleSE, SCHEDULE_SE_FIELDS } from '@/pdf/fill-schedule-se.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { SCHEDULE_1_FIELDS } from '@/pdf/mappings/2025/fill-schedule-1.js';
import { SCHEDULE_2_FIELDS } from '@/pdf/mappings/2025/fill-schedule-2.js';
import { SCHEDULE_F_FIELDS } from '@/pdf/fill-schedule-f.js';
import { complexMFJFixture, simpleW2Fixture } from '../fixtures/simple-w2.js';
const blank='forms/blank/2025/f1040sse.pdf';
const fixture=()=>TaxYearInputSchema.parse({...complexMFJFixture,w2s:[],form1099Nec:[],scheduleK1:[],
  scheduleC:{accountHolder:'spouse',grossReceipts:'100000'},
  scheduleF:{accountHolder:'primary',salesOfProductsRaised:'20000'},
});
const value=(doc:PDFDocument,name:string)=>doc.getForm().getTextField(name).getText();
const spouses=['primary','spouse'] as const;
const ownedRegular=(owner:typeof spouses[number],profit='433.13')=>TaxYearInputSchema.parse({
  ...complexMFJFixture,w2s:[],form1099Nec:[],scheduleK1:[],
  scheduleC:{accountHolder:owner,grossReceipts:profit},
  scheduleF:{accountHolder:owner==='primary'?'spouse':'primary',salesOfProductsRaised:'20000'},
});
const component=(folder:string,name:string)=>readFile(join(folder,name)).then(bytes=>PDFDocument.load(bytes));
describe('Schedule SE owner review forms',()=>{
  it('renders separate complete audited forms for both spouses',async()=>{
    const input=fixture();const result=calculateFederalTax(input);
    const doc=await fillScheduleSE(input,result,blank);
    const saved=await PDFDocument.load(await doc.save());
    expect(saved.getPageCount()).toBe(4);
    expect(value(saved,SCHEDULE_SE_FIELDS.name)).toBe('John Smith');
    expect(value(saved,SCHEDULE_SE_FIELDS.line1a)).toBe('20000');
    expect(value(saved,'topmostSubform[0].Page1[0].f1_21[0]')).toBe('2826');
    const spouseRoot='spouse_ScheduleSE.Page1[0].';
    expect(value(saved,`${spouseRoot}f1_1[0]`)).toBe('Jane Smith');
    expect(value(saved,`${spouseRoot}f1_5[0]`)).toBe('100000');
    expect(value(saved,`${spouseRoot}f1_19[0]`)).toBe('11451');
    expect(value(saved,`${spouseRoot}f1_20[0]`)).toBe('2678');
    expect(value(saved,`${spouseRoot}f1_21[0]`)).toBe('14129');
    expect(value(saved,`${spouseRoot}f1_22[0]`)).toBe('7065');
    // Reopened widgets and canonical fields must agree and retain appearances.
    const canonical=new Map(saved.getForm().getFields().filter(f=>f instanceof PDFTextField).map(f=>[f.ref.toString(),f]));
    let verifiedWidgets=0;
    for(const page of saved.getPages()) for(const ref of page.node.Annots()?.asArray()??[]) {
      const widget=saved.context.lookup(ref,PDFDict);
      const parent=widget.get(PDFName.of('Parent'));
      const selfField=canonical.get(ref.toString());
      const field=selfField ?? (parent?canonical.get(parent.toString()):undefined);
      if(!field || !field.getText())continue;
      const raw=(selfField?widget:parent?saved.context.lookup(parent,PDFDict):widget).get(PDFName.of('V'));
      expect(raw instanceof PDFString||raw instanceof PDFHexString?raw.decodeText():undefined).toBe(field.getText());
      expect(widget.get(PDFName.of('AP'))).toBeDefined();
      verifiedWidgets++;
    }
    expect(verifiedWidgets).toBeGreaterThan(20);
  });
  it('rejects contradictory aggregate or duplicate owner audits',async()=>{
    const input=fixture();const result=calculateFederalTax(input);const se=result.scheduleSE;
    if(!se)throw new Error('Synthetic SE result is required');
    await expect(fillScheduleSE(input,{...result,scheduleSE:{...se,totalSETax:new Decimal(1)}},blank)).rejects.toThrow(/reconcile|aggregate/i);
    const first=se.perTaxpayer[0];const line=first.lines.find(row=>row.line==='12');
    if(!line)throw new Error('Synthetic line12 required');
    await expect(fillScheduleSE(input,{...result,scheduleSE:{...se,perTaxpayer:[{...first,lines:[...first.lines,line]},...se.perTaxpayer.slice(1)]}},blank)).rejects.toThrow(/audit/i);
  });
  it.each(spouses)('attaches only the taxable spouse to the saved joint packet when %s is below the exact cutoff',async owner=>{
    const input=ownedRegular(owner),result=calculateFederalTax(input),original=JSON.stringify({input,result});
    const omitted=result.scheduleSE?.perTaxpayer.find(row=>row.accountHolder===owner);
    expect(omitted?.lines.find(row=>row.line==='4c')?.value.toFixed()).toBe('400');
    expect(omitted?.lines.find(row=>row.line==='4c')?.inputs['Exact adjusted earnings']?.toString()).toBe('399.995555');
    expect(omitted?.earningsSubjectToSETax.toFixed()).toBe('0');
    expect(omitted?.totalSETax.toFixed()).toBe('0');
    const dir=await mkdtemp(join(tmpdir(),'schedule-se-owner-review-'));
    try{
      const packet=await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
      const filename='f1040sse-filled.pdf';
      expect(packet.filledForms.filter(path=>path.endsWith(filename))).toEqual([join(dir,filename)]);
      const se=await component(dir,filename),s1=await component(dir,'f1040s1-filled.pdf'),s2=await component(dir,'f1040s2-filled.pdf');
      expect(se.getPageCount()).toBe(2);
      expect(value(se,SCHEDULE_SE_FIELDS.name)).toBe(owner==='primary'?'Jane Smith':'John Smith');
      expect(value(se,SCHEDULE_SE_FIELDS.ssn)).toBeUndefined();
      expect(value(se,SCHEDULE_SE_FIELDS.line1a)).toBe('20000');
      expect(value(se,SCHEDULE_SE_FIELDS.line2)).toBeUndefined();
      expect(value(se,SCHEDULE_SE_FIELDS.line4c)).toBe('18470');
      expect(value(se,SCHEDULE_SE_FIELDS.line6)).toBe('18470');
      expect(value(se,SCHEDULE_SE_FIELDS.line12)).toBe('2826');
      expect(value(se,SCHEDULE_SE_FIELDS.line13)).toBe('1413');
      expect(value(s1,SCHEDULE_1_FIELDS.line3)).toBe('433');
      expect(value(s1,SCHEDULE_1_FIELDS.line6)).toBe('20000');
      expect(value(s1,SCHEDULE_1_FIELDS.line15)).toBe('1413');
      expect(value(s2,SCHEDULE_2_FIELDS.line4)).toBe('2826');
      expect(JSON.stringify({input,result})).toBe(original);
      const retain=process.env.TAX_ENGINE_SE_OWNER_PDF_EVIDENCE;
      if(retain){const evidence=join(retain,owner);await mkdir(evidence,{recursive:true});for(const name of [filename,'f1040s1-filled.pdf','f1040s2-filled.pdf'])await copyFile(join(dir,name),join(evidence,name));}
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('retains both qualifying spouses when the boundary owner already used the Social Security wage base',async()=>{
    const input=ownedRegular('spouse','433.14');
    input.w2s=[{...simpleW2Fixture.w2s[0],accountHolder:'spouse',wages:'176100',socialSecurityWages:'176100',socialSecurityTips:'0'}];
    const result=calculateFederalTax(input),owner=result.scheduleSE?.perTaxpayer.find(row=>row.accountHolder==='spouse');
    expect(owner?.lines.find(row=>row.line==='4c')?.inputs['Exact adjusted earnings']?.toString()).toBe('400.00479');
    const doc=await fillScheduleSE(input,result,blank),saved=await PDFDocument.load(await doc.save()),root='spouse_ScheduleSE.Page1[0].';
    expect(saved.getPageCount()).toBe(4);
    expect(value(saved,SCHEDULE_SE_FIELDS.name)).toBe('John Smith');
    expect(value(saved,`${root}f1_1[0]`)).toBe('Jane Smith');
    expect(['f1_9[0]','f1_12[0]','f1_19[0]','f1_20[0]','f1_21[0]','f1_22[0]'].map(field=>value(saved,root+field))).toEqual(['400','400',undefined,'12','12','6']);
    expect(result.selfEmploymentTax.toFixed()).toBe('2838');
  });
  it('preserves the signed farm loss and omits the nonqualifying owner from Schedule SE',async()=>{
    const input=TaxYearInputSchema.parse({...ownedRegular('spouse','20000'),scheduleF:{accountHolder:'primary',salesOfProductsRaised:'2000',expenses:{feed:'3000'}}});
    const result=calculateFederalTax(input),dir=await mkdtemp(join(tmpdir(),'schedule-se-loss-review-'));
    try{
      await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:dir});
      const se=await component(dir,'f1040sse-filled.pdf'),s1=await component(dir,'f1040s1-filled.pdf'),sf=await component(dir,'f1040sf-filled.pdf');
      expect(se.getPageCount()).toBe(2);
      expect(value(se,SCHEDULE_SE_FIELDS.name)).toBe('Jane Smith');
      expect(value(se,SCHEDULE_SE_FIELDS.line12)).toBe('2826');
      expect(value(s1,SCHEDULE_1_FIELDS.line6)).toBe('(1000)');
      expect(value(sf,SCHEDULE_F_FIELDS.line34)).toBe('(1000)');
      const noTax=ownedRegular('spouse');
      noTax.scheduleF=input.scheduleF;
      const noTaxResult=calculateFederalTax(noTax);
      expect(noTaxResult.selfEmploymentTax.isZero()).toBe(true);
      const preview=await fillScheduleSE(noTax,noTaxResult,blank);
      expect(preview.getPageCount()).toBe(2);
      expect(value(preview,SCHEDULE_SE_FIELDS.line4c)).toBeUndefined();
      const emptyPacket=await fillReturn(redactReviewIdentifiers(noTax),redactReviewIdentifiers(noTaxResult),{blankFormsDir:'forms/blank/2025',outputDir:join(dir,'no-se')});
      expect(emptyPacket.filledForms.some(path=>path.endsWith('f1040sse-filled.pdf'))).toBe(false);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('rejects incomplete or contradictory audit lines for an omitted owner',async()=>{
    const input=ownedRegular('primary'),result=calculateFederalTax(input),se=result.scheduleSE;
    const omitted=se?.perTaxpayer.find(row=>row.accountHolder==='primary');
    if(!omitted)throw new Error('Actual below-threshold owner required');
    const line4c=omitted.lines.find(row=>row.line==='4c');
    if(!line4c)throw new Error('Actual line4c required');
    omitted.lines=omitted.lines.filter(row=>row.line!=='4c');
    await expect(fillScheduleSE(input,result,blank)).rejects.toThrow(/Schedule SE audit 4c/i);
    omitted.lines.push(line4c,{...line4c});
    await expect(fillScheduleSE(input,result,blank)).rejects.toThrow(/Schedule SE audit 4c/i);
    omitted.lines=omitted.lines.filter(row=>row.line!=='4c');
    omitted.lines.push(line4c);
    const line6=omitted.lines.find(row=>row.line==='6');
    if(!line6)throw new Error('Actual line6 required');
    line6.value=new Decimal(1);
    await expect(fillScheduleSE(input,result,blank)).rejects.toThrow(/Schedule SE result.*audit 6/i);
  });
});
