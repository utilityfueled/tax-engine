// Spec: spec/federal/schedule-se.yaml review-mapping; official 2025 field positions.
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFTextField, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleSE, SCHEDULE_SE_FIELDS } from '@/pdf/fill-schedule-se.js';
import { complexMFJFixture } from '../fixtures/simple-w2.js';
const blank='forms/blank/2025/f1040sse.pdf';
const fixture=()=>TaxYearInputSchema.parse({...complexMFJFixture,w2s:[],form1099Nec:[],scheduleK1:[],
  scheduleC:{accountHolder:'spouse',grossReceipts:'100000'},
  scheduleF:{accountHolder:'primary',salesOfProductsRaised:'20000'},
});
const value=(doc:PDFDocument,name:string)=>doc.getForm().getTextField(name).getText();
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
});
