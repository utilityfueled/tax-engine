// Spec: spec/federal/schedule-e-passive-distribution-review.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleE } from '@/pdf/fill-schedule-e.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { prepareScheduleEReview, scheduleEReviewPassiveDistributionSources, type PreparedScheduleEReview } from '@/pdf/schedule-e-review-context.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { k1PassiveDistributionFixture, passiveDistributionSource } from '../fixtures/k1-passive-distribution.js';
import { cashDistributionSource } from '../fixtures/k1-cash-distribution.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
const blank='forms/blank/2025/f1040se.pdf';
const field=(suffix:string)=>`topmostSubform[0].Page2[0].${suffix}`;
const read=(doc:PDFDocument,suffix:string)=>doc.getForm().getTextField(field(suffix)).getText()??'';
async function reopened(input:ReturnType<typeof k1PassiveDistributionFixture>) {
 return PDFDocument.load(await(await fillScheduleE(input,calculateFederalTax(input),blank)).save());
}
it('keeps released ordinary losses separate from capital distribution income',async()=>{
 for(const [prior,loss,net] of [['1500','1000','(1000)'],['400','400','(400)'],['0','','']]) {
  const input=k1PassiveDistributionFixture(prior),r=calculateFederalTax(input),doc=await reopened(input);
  expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1000');expect(r.form8582?.passiveIncome.toFixed()).toBe('1000');
  for(const [suffix,value] of Object.entries({'Table_Line28g-k[0].RowA[0].f2_15[0]':loss,'Table_Line28g-k[0].RowA[0].f2_16[0]':'','f2_36[0]':'','f2_40[0]':loss,'f2_45[0]':'','f2_46[0]':loss,'f2_47[0]':net,'f2_78[0]':net,'Line42_ReadOrder[0].f2_79[0]':''}))expect(read(doc,suffix),`${prior}:${suffix}`).toBe(value);
  expect(doc.getPageCount()).toBe(2);expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);
 }
});
it('prints the independently rounded ordinary component at a combined-income boundary',async()=>{
 for(const [ordinary,cash,printed,net] of [['50.40','1080.65','50','(350)'],['50.60','1080.85','51','(349)']]) {
  const input=k1PassiveDistributionFixture('400'),k=input.scheduleK1[0],q=input.qbiLossSources!.activities![0];
  Object.assign(k,{ordinaryIncome:ordinary,section199AQBI:ordinary,distributions:cash});
  Object.assign(q.statement!,{ordinaryIncome:ordinary,section199AQBI:ordinary});
  Object.assign(k.form6198!,{ordinaryIncome:ordinary,gainLossFromDispositions:'1000.25',currentYearDecreases:cash});
  cashDistributionSource(input).cashAmount=cash;charitableStatement(input).atRisk!.currentYearDecreases=cash;q.atRisk!.currentYearDecreases=cash;
  const r=calculateFederalTax(input),doc=await reopened(input);
  expect(r.form8582?.passiveIncome.toFixed()).toBe('1051');expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1000.25');
  for(const [suffix,value] of Object.entries({'Table_Line28g-k[0].RowA[0].f2_15[0]':'400','Table_Line28g-k[0].RowA[0].f2_16[0]':printed,'f2_36[0]':printed,'f2_40[0]':'400','f2_45[0]':printed,'f2_46[0]':'400','f2_47[0]':net,'f2_78[0]':net}))expect(read(doc,suffix),`${ordinary}:${suffix}`).toBe(value);
  expect(doc.getPageCount()).toBe(2);
 }
});
it('keeps original K1 and passive indexes distinct in physical rows',async()=>{
 const input=k1PassiveDistributionFixture('400'),other=structuredClone(input.scheduleK1[0]);
 Object.assign(other,{partnershipName:'Fictional distinct nonpassive business',partnershipEIN:'99-7654321',ordinaryIncome:'25',section199AQBI:'0',isPassiveActivity:false,qbiMateriallyParticipated:true,charitableCash:'0',distributions:'0',beginningBasis:'1000'});
 Object.assign(other.form6198!,{activityName:other.partnershipName,ordinaryIncome:'25',gainLossFromDispositions:'0',currentYearDecreases:'0'});
 const source=structuredClone(input.qbiLossSources!.activities![0]);
 Object.assign(source,{k1SourceId:'scheduleK1:0',entityName:other.partnershipName,entityEIN:other.partnershipEIN,priorPassiveLoss:'0'});
 Object.assign(source.statement!,{ordinaryIncome:'25',section199AQBI:'0',isPassiveActivity:false,qbiMateriallyParticipated:true});source.basis!.beginningBasis='1000';source.atRisk!.currentYearDecreases='0';
 const history=structuredClone(input.priorYear!.suspendedPassiveLosses![0]);history.partnershipName=other.partnershipName;history.amount='0';history.qbiLossTracking!.vintages=[];
 input.priorYear!.suspendedPassiveLosses!.push(history);input.scheduleK1.unshift(other);
 charitableStatement(input).k1SourceId='scheduleK1:1';input.qbiLossSources!.activities![0].k1SourceId='scheduleK1:1';input.qbiLossSources!.activities!.unshift(source);
 const doc=await reopened(input);
 for(const [suffix,value] of Object.entries({'Table_Line28g-k[0].RowA[0].f2_19[0]':'25','Table_Line28g-k[0].RowB[0].f2_20[0]':'400','Table_Line28g-k[0].RowB[0].f2_21[0]':'','f2_45[0]':'25','f2_46[0]':'400','f2_47[0]':'(375)','f2_78[0]':'(375)'}))expect(read(doc,suffix),suffix).toBe(value);
});
it('rejects stale passive distribution context before template access',async()=>{
 const input=k1PassiveDistributionFixture(),result=calculateFederalTax(input),token=prepareScheduleEReview(input);
 for(const change of [
  (x:typeof input)=>{passiveDistributionSource(x).assets![0].fairMarketValue='100000.01';},
  (x:typeof input)=>{x.taxpayer.primary.ssn='999999999';},
  (x:typeof input)=>{x.priorYear!.suspendedPassiveLosses![0].amount='1499';},
 ]){const changed=structuredClone(input);change(changed);await expect(fillScheduleE(changed,result,'/missing-template.pdf',token)).rejects.toThrow(/Schedule E.*stale|Schedule E.*conflicting/);}
 const copied=scheduleEReviewPassiveDistributionSources(input,result,token);
 expect(copied[0].ordinaryTransferExclusion.toFixed()).toBe('1000');
 copied[0].ordinaryTransferExclusion=new Decimal('0');copied[0].sourceIncome=new Decimal('0');
 expect(scheduleEReviewPassiveDistributionSources(input,result,token)[0].ordinaryTransferExclusion.toFixed()).toBe('1000');
 const redacted=redactReviewIdentifiers(input);
 await expect(fillScheduleE(redacted,redactReviewIdentifiers(result),'/missing-template.pdf',{} as PreparedScheduleEReview)).rejects.toThrow(/original.*context/);
 await expect(fillScheduleE(redacted,redactReviewIdentifiers(result),'/missing-template.pdf')).rejects.toThrow(/identity|original.*source|Schedule E/);
 const changes=[{...result,form8582:{...result.form8582!,activityRows:result.form8582!.activityRows.map(row=>({...row,sourceCurrentIncome:row.sourceCurrentIncome.plus('.01')}))}},
  {...result,scheduleD:{...result.scheduleD!,netCapitalGainLoss:new Decimal('999')}},
  {...result,schedule1:{...result.schedule1!,supplementalIncome:new Decimal('0')}}];
 for(const stale of changes)await expect(fillScheduleE(input,stale,'/missing-template.pdf',token)).rejects.toThrow(/Schedule E.*reconcile/);
});
it('rejects removed passive source attachments against retained results before output access',async()=>{
 const input=k1PassiveDistributionFixture(),result=calculateFederalTax(input);
 for(const remove of [
  (changed:typeof input)=>{charitableStatement(changed).cashDistribution=undefined;},
  (changed:typeof input)=>{changed.k1CharitableSources=undefined;},
 ]) {
  const changed=structuredClone(input);remove(changed);
  await expect(fillScheduleE(changed,result,'/missing-template.pdf')).rejects.toThrow(/Schedule E.*source/);
  await expect(fillReturn(changed,result,{blankFormsDir:'/missing-templates',outputDir:'/missing-output'})).rejects.toThrow(/Schedule E.*source/);
 }
});
it('saves and reopens the redacted complete passive distribution packet',async()=>{
 const input=k1PassiveDistributionFixture(),result=calculateFederalTax(input),before=JSON.stringify(input),dir=await mkdtemp(join(tmpdir(),'passive-schedule-e-packet-'));
 try {
  const packet=await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{scheduleEReview:prepareScheduleEReview(input),charitableReview:prepareCharitableReview(input),qbiLossReview:prepareQbiLossReview(input),blankFormsDir:'forms/blank/2025',outputDir:dir,flatten:false});
  const byName=(name:string)=>{const path=packet.filledForms.find(path=>path.endsWith(`/${name}`));if(!path)throw new Error(`Missing ${name}`);return path;};
  const doc=await PDFDocument.load(await readFile(byName('f1040se-filled.pdf')));
  expect(read(doc,'Table_Line28g-k[0].RowA[0].f2_16[0]')).toBe('');expect(read(doc,'Table_Line28g-k[0].RowA[0].f2_15[0]')).toBe('1000');expect(read(doc,'f2_47[0]')).toBe('(1000)');expect(read(doc,'f2_78[0]')).toBe('(1000)');
  for(const name of ['f1040se-filled.pdf','f8582-filled.pdf','f8949-filled.pdf','f1040sd-filled.pdf','k1-charitable-reference-filled.pdf','qbi-loss-reference-filled.pdf']) {
   const path=byName(name),pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:10000}));
   for(const page of pages){expect(page.split(REVIEW_PDF_NOTICE),name).toHaveLength(2);for(const secret of ['123456789','6789','asset-1','activity-1','Fictional complete entity activity and valuation report'])expect(page,name).not.toContain(secret);}
  }
  expect(JSON.stringify(input)).toBe(before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
