// Spec: spec/federal/schedule-e-physical-review.yaml. Literal printed field controls.
import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import Decimal from 'decimal.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareScheduleEReview,type PreparedScheduleEReview } from '@/pdf/schedule-e-review-context.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillScheduleE } from '@/pdf/fill-schedule-e.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { parsedRoyaltyPropertyFixture,royaltyPropertyFixture } from '../fixtures/royalty-property.js';
const blank='forms/blank/2025/f1040se.pdf';
const p1=(name:string)=>`topmostSubform[0].Page1[0].${name}`;
const p2=(name:string)=>`topmostSubform[0].Page2[0].${name}`;
const read=(doc:PDFDocument,name:string)=>doc.getForm().getTextField(name).getText()??'';
async function reopened(input:ReturnType<typeof parsedRoyaltyPropertyFixture>){return PDFDocument.load(await(await fillScheduleE(input,calculateFederalTax(input),blank)).save());}
it('reopens actual royalty columns and printed totals without filling farming reconciliation',async()=>{
 const doc=await reopened(parsedRoyaltyPropertyFixture());
 for(const [field,value] of Object.entries({
  'Table_Line1b[0].RowA[0].f1_6[0]':'6','Table_Line1a[0].RowA[0].f1_3[0]':'',
  'Table_Line2[0].RowA[0].f1_9[0]':'','Table_Income[0].Line4[0].f1_19[0]':'12000',
  'Table_Expenses[0].Line10[0].f1_37[0]':'49','Table_Expenses[0].Line11[0].f1_40[0]':'951',
  'Table_Expenses[0].Line20[0].f1_68[0]':'1000','Table_Expenses[0].Line21[0].f1_71[0]':'11001',
  'f1_77[0]':'','f1_78[0]':'12000','f1_81[0]':'1000','f1_82[0]':'11001','f1_84[0]':'11001',
 }))expect(read(doc,p1(field)),field).toBe(value);
 expect(read(doc,p2('f2_78[0]'))).toBe('11001');expect(read(doc,p2('Line42_ReadOrder[0].f2_79[0]'))).toBe('');
 expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
});
it('prints allowed rental losses and the actual Part II total widgets',async()=>{
 const raw=royaltyPropertyFixture(); const input=TaxYearInputSchema.parse({...raw,form1099Misc:[],royaltyPropertySources:undefined,
 rentalProperties:[{description:'Actual rental',propertyType:'single_family',rentalDays:365,personalUseDays:0,rents:'10000',insurance:'12000',isActiveParticipant:true}],
 scheduleK1:[{partnershipName:'Passive entity',partnershipEIN:'44-4444444',ordinaryIncome:'500',isPassiveActivity:true}]});
 const result=calculateFederalTax(input);expect(result.form8582?.suspendedLoss.toFixed()).toBe('1500');
 const doc=await reopened(input);
 for(const [field,value] of Object.entries({'Table_Expenses[0].Line22[0].f1_74[0]':'500','f1_77[0]':'10000','f1_81[0]':'12000','f1_83[0]':'500','f1_84[0]':'(500)'}))expect(read(doc,p1(field)),field).toBe(value);
 for(const [field,value] of Object.entries({'f2_35[0]':'','f2_36[0]':'500','f2_39[0]':'','f2_45[0]':'500','f2_46[0]':'','f2_47[0]':'500','f2_78[0]':'','Line42_ReadOrder[0].f2_79[0]':''}))expect(read(doc,p2(field)),field).toBe(value);
});
it('prints a prior passive loss released against positive current income',async()=>{
 const raw=royaltyPropertyFixture();const input=TaxYearInputSchema.parse({...raw,form1099Misc:[],royaltyPropertySources:undefined,
 scheduleK1:[{partnershipName:'Passive entity',partnershipEIN:'44-4444444',ordinaryIncome:'2000',isPassiveActivity:true}],
 priorYear:{suspendedPassiveLosses:[{partnershipName:'Passive entity',amount:'1000'}]}});
 const doc=await reopened(input);
 for(const [field,value] of Object.entries({'Table_Line28g-k[0].RowA[0].f2_15[0]':'1000','Table_Line28g-k[0].RowA[0].f2_16[0]':'2000','f2_40[0]':'1000','f2_36[0]':'2000','f2_45[0]':'2000','f2_46[0]':'1000','f2_47[0]':'1000','f2_78[0]':'1000'}))expect(read(doc,p2(field)),field).toBe(value);
});
it('retains all actual property columns on a continuation page',async()=>{
 const raw=royaltyPropertyFixture();const original=raw.form1099Misc[0],property=raw.royaltyPropertySources.properties[0];
 raw.form1099Misc=[0,1,2,3].map(index=>({...original,sourceId:`source-${index}`,accountReference:`private-account-${index}`,royalties:'100.01'}));
 raw.royaltyPropertySources.properties=raw.form1099Misc.map((source,index)=>({...structuredClone(property),propertyId:`private-property-${index}`,
 incomeSources:[{sourceIndex:index,allocatedGross:'100.01',original:source}],expenses:[{...property.expenses[0],sourceId:`receipt-${index}`,amountPaid:'10.01'}]}));
 const input=TaxYearInputSchema.parse(raw),result=calculateFederalTax(input);
 const doc=await PDFDocument.load(await(await fillScheduleE(redactReviewIdentifiers(input),redactReviewIdentifiers(result),blank,prepareScheduleEReview(input))).save());expect(doc.getPageCount()).toBe(3);
 const pages=await textPages(doc);expect(pages[2]).toMatch(/100\s+10\s+10\s+90/);
 for(const page of pages){expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);expect(page).not.toMatch(/private-property|private-account|Private legal|royalty-account|123456789/);}
 expect(read(doc,p1('f1_78[0]'))).toBe('400');expect(read(doc,p1('f1_81[0]'))).toBe('40');expect(read(doc,p1('f1_84[0]'))).toBe('360');
});
it('binds original royalty facts before redaction and rejects stale retained results',async()=>{
 const input=parsedRoyaltyPropertyFixture(),result=calculateFederalTax(input),token=prepareScheduleEReview(input);
 for(const mutate of [(x:typeof input)=>{x.royaltyPropertySources!.properties![0].propertyReference='Changed record';},(x:typeof input)=>{x.royaltyPropertySources!.properties![0].expenses![0].amountPaid='49.26';},(x:typeof input)=>{x.w2s[0].wages='200001';}]){const stale=structuredClone(input);mutate(stale);await expect(fillScheduleE(stale,result,'/not-a-real-template',token)).rejects.toThrow(/Schedule E.*stale|Schedule E.*reconcil/i);}
 await expect(fillScheduleE(input,result,'/not-a-real-template',{} as PreparedScheduleEReview)).rejects.toThrow(/original.*context/);
 const changed={...result,scheduleE:{...result.scheduleE!,totalRoyaltyIncome:new Decimal('7')}};
 await expect(fillScheduleE(input,changed,'/not-a-real-template')).rejects.toThrow(/Schedule E.*reconcil|Schedule E.*stale/i);
 await expect(fillScheduleE(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'/not-a-real-template')).rejects.toThrow(/royalt|original.*context|Schedule E/i);
});

async function textPages(doc:PDFDocument):Promise<string[]> {
 const dir=await mkdtemp(join(tmpdir(),'schedule-e-readable-'));
 try {const path=join(dir,'review.pdf');await writeFile(path,await doc.save());return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:10000}));}
 finally {await rm(dir,{recursive:true,force:true});}
}
it('saves a redacted zero-net property in the full review packet',async()=>{
 const raw=royaltyPropertyFixture();raw.form1099Misc[0].royalties='1000';
 const property=raw.royaltyPropertySources.properties[0];property.incomeSources[0].original.royalties='1000';property.incomeSources[0].allocatedGross='1000';property.expenses=[{...property.expenses[0],amountPaid:'1000'}];
 const input=TaxYearInputSchema.parse(raw),result=calculateFederalTax(input),token=prepareScheduleEReview(input),dir=await mkdtemp(join(tmpdir(),'schedule-e-zero-'));
 try {
  const packet=await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{scheduleEReview:token,blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false});
  const path=packet.filledForms.find(path=>path.endsWith('/f1040se-filled.pdf'));expect(path).toBeDefined();
  const doc=await PDFDocument.load(await readFile(path!));expect(read(doc,p1('f1_78[0]'))).toBe('1000');expect(read(doc,p1('f1_81[0]'))).toBe('1000');expect(read(doc,p1('f1_84[0]'))).toBe('');
  expect(read(doc,p1('f1_2[0]'))).toBe('');
  for(const page of await textPages(doc)){expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);expect(page).not.toMatch(/royalty-original|royalty-account|Private legal|private-property|123456789/);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('retains the fifth K1 on an independently readable continuation',async()=>{
 const raw=royaltyPropertyFixture(),input=TaxYearInputSchema.parse({...raw,royaltyPropertySources:undefined,form1099Misc:[],scheduleK1:Array.from({length:5},(_,index)=>({partnershipName:`Entity ${index+1}`,partnershipEIN:`44-444444${index}`,isPassiveActivity:false,ordinaryIncome:'1000'}))});
 const doc=await reopened(input);expect(doc.getPageCount()).toBe(3);expect(read(doc,p2('f2_47[0]'))).toBe('5000');expect(read(doc,p2('f2_78[0]'))).toBe('5000');
 const pages=await textPages(doc);expect(pages[2]).toContain('Entity 5');expect(pages[2]).toContain('1000');expect(pages[2]).not.toContain('5000');expect(pages[2].split(REVIEW_PDF_NOTICE)).toHaveLength(2);
});
it('prints completed rental depreciation and amortization at actual ownership',async()=>{
 const raw=royaltyPropertyFixture(),input=TaxYearInputSchema.parse({...raw,royaltyPropertySources:undefined,form1099Misc:[],rentalProperties:[{
  description:'Actual rental',propertyType:'single_family',rents:'18000',ownershipPercentage:'50',depreciation:'99999',otherExpenses:'100',
  form4562:{section179TotalCost:'0',section179ElectedCost:'0',section179CarryoverFromPriorYear:'0',section179BusinessIncomeLimit:'0',
   specialDepreciationAllowance:'0',section168f1Depreciation:'0',otherDepreciation:'0',macrsPre2025AssetsDepreciation:'2500',macrsCurrentYearGdsDepreciation:'0',macrsCurrentYearAdsDepreciation:'0',listedPropertyDepreciation:'0',currentYearAmortization:'150',priorYearAmortization:'50'}}]});
 const doc=await reopened(input);for(const [field,value] of Object.entries({'Table_Income[0].Line3[0].f1_16[0]':'9000','Table_Expenses[0].Line18[0].f1_61[0]':'1250','Table_Expenses[0].Line19[0].f1_64[0]':'150','Table_Expenses[0].Line20[0].f1_68[0]':'1400','Table_Expenses[0].Line21[0].f1_71[0]':'7600','f1_80[0]':'1250','f1_81[0]':'1400'}))expect(read(doc,p1(field)),field).toBe(value);
});
it('separates a fully absorbed nonpassive section179 amount into its actual column',async()=>{
 const raw=royaltyPropertyFixture(),input=TaxYearInputSchema.parse({...raw,royaltyPropertySources:undefined,form1099Misc:[],scheduleK1:[{partnershipName:'Actual active entity',partnershipEIN:'44-4444444',isPassiveActivity:false,ordinaryIncome:'1000',section179Deduction:'200'}]});
 const doc=await reopened(input);for(const [field,value] of Object.entries({'Table_Line28g-k[0].RowA[0].f2_18[0]':'200','Table_Line28g-k[0].RowA[0].f2_19[0]':'1000','f2_39[0]':'1000','f2_43[0]':'200','f2_45[0]':'1000','f2_46[0]':'200','f2_47[0]':'800','f2_78[0]':'800'}))expect(read(doc,p2(field)),field).toBe(value);
});
