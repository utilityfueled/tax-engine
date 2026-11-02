/** Spec: spec/federal/form-1040-pdf-explicit-zero.yaml. Printed2025 form instructions only. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Decimal from 'decimal.js';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm1040, FORM_1040_FIELDS as F } from '@/pdf/fill-form-1040.js';
import { formatCurrency } from '@/pdf/pdf-utils.js';
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from '@/pdf/export-policy.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const blank='forms/blank/2025/f1040.pdf';
const original={...simpleW2Fixture,w2s:[]}; // Actual synthetic zero income, not an unknown amount.
const page2='topmostSubform[0].Page2[0].';
const cells={line15:{name:page2+'f2_06[0]',rect:{x:504,y:636.001,width:72,height:11.999}},
  line22:{name:page2+'f2_14[0]',rect:{x:504,y:552.002,width:72,height:11.999}}};

describe('Form1040 actual printed zero instructions',()=>{
  it('retains actual zero at both required printed cells after saving and reopening',async()=>{
    expect(createHash('sha256').update(await readFile(blank)).digest('hex')).toBe('3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982');
    const result=calculateFederalTax(original);
    expect(result.taxableIncome.toFixed()).toBe('0');
    expect(result.allLines.find(row=>row.form==='1040'&&row.line==='22')?.value.toFixed()).toBe('0');
    const doc=await fillForm1040(original,result,blank);const bytes=await doc.save();const saved=await PDFDocument.load(bytes);
    for(const key of ['line15','line22'] as const){
      const source=cells[key];expect(F[key]).toBe(source.name);
      const field=saved.getForm().getTextField(source.name);expect.soft(field.getText()).toBe('0');
      expect.soft(field.acroField.getValue()?.decodeText()).toBe('0');
      const widgets=field.acroField.getWidgets();expect(widgets).toHaveLength(1);
      const widget=widgets[0];if(!widget)throw new Error('missing original widget');
      const rect=widget.getRectangle();for(const dimension of ['x','y','width','height'] as const)expect(rect[dimension]).toBeCloseTo(source.rect[dimension],3);
      expect(widget.P()).toEqual(saved.getPages()[1]?.ref);
      const normal=widget.getAppearances()?.normal;expect(normal).toBeInstanceOf(PDFRawStream);
      if(!(normal instanceof PDFRawStream))throw new Error('missing actual zero appearance');
      expect(decodePDFRawStream(normal).decode().length).toBeGreaterThan(0);
    }
    if(process.env.TAX_ZERO_ARTIFACT_DIR){await mkdir(process.env.TAX_ZERO_ARTIFACT_DIR,{recursive:true});await writeFile(join(process.env.TAX_ZERO_ARTIFACT_DIR,'form1040-actual-zero.pdf'),bytes);}
  });
  it('preserves existing nonzero rounding and unrelated blank-zero semantics',async()=>{
    const result=calculateFederalTax(original);
    // Explicit mapper-contract values, not represented as a recomputed return.
    const mapper={...result,taxableIncome:new Decimal('250.49'),allLines:result.allLines.map(row=>row.form==='1040'&&row.line==='22'?{...row,value:new Decimal('26.50')}:row)};
    const saved=await PDFDocument.load(await(await fillForm1040(original,mapper,blank)).save());
    expect(saved.getForm().getTextField(F.line15).getText()).toBe('250');
    expect(saved.getForm().getTextField(F.line22).getText()).toBe('27');
    expect(saved.getForm().getTextField(F.line2a).getText()??'').toBe('');
    expect(formatCurrency(new Decimal(0))).toBe('');
  });
  it('preserves missing-line and year rejection without manufacturing zero',async()=>{
    const result=calculateFederalTax(original);
    const missing={...result,allLines:result.allLines.filter(row=>!(row.form==='1040'&&row.line==='22'))};
    await expect(fillForm1040(original,missing,blank)).rejects.toThrow('Missing audited Form 1040 line 22');
    await expect(fillForm1040({...original,taxpayer:{...original.taxpayer,taxYear:2026}},{...result,taxYear:2026},'missing-2026.pdf')).rejects.toThrow(/No qualified review/);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(()=>assertPdfExportAllowed(2025,2025,'filing')).toThrow(/unavailable/);
  });
});
