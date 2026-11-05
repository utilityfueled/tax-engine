// Spec: spec/federal/rrta-tip-payroll.yaml.
import { it, expect } from 'vitest';
import { mkdtempSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm8959 } from '@/pdf/fill-form-8959.js';
import { rrtaTipInput } from '../fixtures/rrta-tip-payroll.js';
it('denies original RRTA direct mapping before template loading',async()=>{
 const input=rrtaTipInput(2025,'230000','0','270'),result=calculateFederalTax(input),before=structuredClone(input);
 await expect(fillForm8959(input,result,'/missing-rrta-template.pdf')).rejects.toThrow(/RRTA.*review.*unavailable/i);expect(input).toEqual(before);
});
it('denies original RRTA packet before any public packet output',async()=>{
 const parent=mkdtempSync(join(tmpdir(),'rrta-review-denial-')),outputDir=join(parent,'must-not-exist');
 try{const input=rrtaTipInput(2025,'230000','0','270'),result=calculateFederalTax(input),before=structuredClone(input);
 await expect(fillReturn(input,result,{blankFormsDir:'/missing-rrta-templates',outputDir,purpose:'review'})).rejects.toThrow(/RRTA.*review.*unavailable/i);
 expect(existsSync(outputDir)).toBe(false);expect(input).toEqual(before);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
it('denies retained RRTA result even when its source packet is removed',async()=>{
 const parent=mkdtempSync(join(tmpdir(),'rrta-retained-denial-')),outputDir=join(parent,'must-not-exist');
 try{const input=rrtaTipInput(2025,'230000','0','270'),result=calculateFederalTax(input);delete input.rrtaPayrollSources;
 await expect(fillForm8959(input,result,'/missing-rrta-template.pdf')).rejects.toThrow(/RRTA.*review.*unavailable/i);
 await expect(fillReturn(input,result,{blankFormsDir:'/missing-rrta-templates',outputDir,purpose:'review'})).rejects.toThrow(/RRTA.*review.*unavailable/i);expect(existsSync(outputDir)).toBe(false);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
it('preserves nonRRTA template admission',async()=>{
 const input=rrtaTipInput();input.w2s=input.w2s.slice(1);delete input.form4137;delete input.rrtaPayrollSources;delete input.schedule1A;
 const result=calculateFederalTax(input);await expect(fillForm8959(input,result,'/missing-ordinary-template.pdf')).rejects.toThrow(/ENOENT/);
});
