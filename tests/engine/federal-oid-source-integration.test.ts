// Specs: federal/schedule-b.yaml, schedule-a.yaml, form-6251.yaml, form-1099-oid.yaml.
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillForm6251,FORM_6251_FIELDS } from '@/pdf/fill-form-6251.js';
import { fillForm8960,FORM_8960_FIELDS } from '@/pdf/fill-form-8960.js';
import { fillScheduleA,SCHEDULE_A_FIELDS } from '@/pdf/fill-schedule-a.js';
import { fillScheduleB, SCHEDULE_B_FIELDS } from '@/pdf/fill-schedule-b.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { describe,it,expect } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema,Form1099OIDSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleB } from '@/engine/schedules/schedule-b.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { getConstants } from '@/models/constants.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { execFileSync } from '../helpers/file-stdin-exec.js';
import { savingsBondReissueReturnInput } from '../fixtures/savings-bond-reissue-return.js';
const source=(overrides:Record<string,unknown>={})=>Form1099OIDSchema.parse({payer:'Synthetic source',sourceId:'source',taxYear:2025,sourceFormRevision:'2024-01',sourceFactsConfirmed:true,recipientAmountsConfirmed:true,obligationType:'taxable',inflationIndexed:false,description:'Actual synthetic obligation',originalIssueDiscount:'0',otherPeriodicInterest:'0',earlyWithdrawalPenalty:'0',federalWithheld:'0',marketDiscount:'0',acquisitionPremium:'0',treasuryOID:'0',investmentExpenses:'0',bondPremium:'0',taxExemptOID:'0',stateWithholding:[],oidReportedNetOfAcquisitionPremium:false,interestReportedNetOfBondPremium:false,marketDiscountElection:false,bondPremiumElection:false,modernBondPremiumRulesApply:true,...overrides});
const fixture=(forms:ReturnType<typeof source>[])=>TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:'50000',federalWithheld:'0',stateTaxWithheld:'0',localTaxWithheld:'0'}],form1099OID:forms});
const audit=(r:ReturnType<typeof calculateFederalTax>,form:string,line:string)=>r.allLines.find(row=>row.form===form&&row.line===line)?.value.toString();
const oidWorksheet = (oid: string) => ({
 sourceReference: 'Fictional reconciled recipient OID worksheet',
 oid, periodicInterest: '0', acquisitionPremium: '0', bondPremium: '0', marketDiscount: '0',
});

describe('OID actual source return integration',()=>{
 it('reports verified gross OID and elected premium reductions without changing net interest',()=>{
  for (const taxYear of [2025, 2026]) {
   const original = source({ taxYear, obligationType: 'treasury', treasuryOID: '600.25', acquisitionPremium: '100.15',
    otherPeriodicInterest: '400.25', bondPremium: '75.20', bondPremiumElection: true });
   const input = fixture([original]);
   input.taxpayer.taxYear = taxYear;
   const scheduleB = calculateScheduleB(input);
   expect(scheduleB.isRequired).toBe(true);
   expect(scheduleB.interestPayers.map(row => row.amount.toFixed())).toEqual(['825.15']);
   expect(scheduleB.interestReportingRows?.map(row => [row.name, row.amount.toFixed()])).toEqual([
    ['Synthetic source (OID)', '1000.5'], ['Subtotal', '1000.5'], ['OID Adjustment', '-100.15'], ['ABP Adjustment', '-75.2'],
   ]);
   expect(scheduleB.taxableInterest.toFixed()).toBe('825.15');
   if (taxYear === 2025) {
    const federal = calculateFederalTax(input);
    expect(federal.form1099OID?.treasuryInterest.toFixed()).toBe('825.15');
    expect(audit(federal, '1040', '2b')).toBe('825.15');
   }
  }

  const fullyOffset = calculateScheduleB(fixture([source({ originalIssueDiscount: '100', acquisitionPremium: '100' })]));
  expect(fullyOffset.isRequired).toBe(true);
  expect(fullyOffset.interestPayers).toEqual([]);
  expect(fullyOffset.interestReportingRows?.map(row => row.amount.toString())).toEqual(['100', '100', '-100']);
  expect(fullyOffset.taxableInterest.isZero()).toBe(true);
 });

 it('discloses the applied source reductions after reconciling recipient and accrual records',()=>{
  const input = savingsBondReissueReturnInput();
  input.form1099OID = [source({ originalIssueDiscount: '600', acquisitionPremium: '100', otherPeriodicInterest: '100',
   marketDiscount: '20', marketDiscountElection: true, bondPremium: '50', bondPremiumElection: true,
   recipientAdjustments: { sourceReference: 'Fictional actual basis worksheet', oid: '0', periodicInterest: '0',
    acquisitionPremium: '-25', bondPremium: '0', marketDiscount: '0' },
   bondPremiumWorksheet: { priorInterestInclusions: '0', priorPremiumDeductions: '0', priorCarryforward: '25',
    disposedDuringYear: false, periods: [{ endDate: '2025-12-31', qualifiedStatedInterest: '100', amortization: '50' }] },
  })];
  const result = calculateFederalTax(input);
  const scheduleB = result.scheduleB!;
  expect(scheduleB.interestPayers.map(row => row.amount.toFixed())).toEqual(['500', '-100', '570']);
  expect(scheduleB.interestReportingRows?.map(row => [row.name, row.amount.toFixed()])).toEqual([
   ['Fictional Treasury original', '500'], ['Synthetic source (OID)', '720'], ['Subtotal', '1220'],
   ['U.S. savings bond interest previously reported', '-100'], ['OID Adjustment', '-75'], ['ABP Adjustment', '-75'],
  ]);
  expect(scheduleB.totalInterest.toFixed()).toBe('970');
  expect(audit(result, '1040', '2b')).toBe('570');
 });

 it('keeps already-net and historical OID on their existing Schedule B paths',()=>{
  const cases = [
   source({ originalIssueDiscount: '500', otherPeriodicInterest: '30', oidReportedNetOfAcquisitionPremium: true,
    interestReportedNetOfBondPremium: true, bondPremiumElection: true }),
   Form1099OIDSchema.parse({ payer: 'Historical source', originalIssueDiscount: '600', acquisitionPremium: '100',
    otherPeriodicInterest: '100', bondPremium: '70' }),
   source({ originalIssueDiscount: '500', otherPeriodicInterest: '30', bondPremium: '20', bondPremiumElection: false }),
  ];
  for (const original of cases) {
   const scheduleB = calculateScheduleB(fixture([original]));
   expect(scheduleB.taxableInterest.toFixed()).toBe('530');
   expect(scheduleB.isRequired).toBe(false);
   expect(scheduleB.interestReportingRows).toBeUndefined();
  }
  const alreadyNetOid = { originalIssueDiscount: '530', oidReportedNetOfAcquisitionPremium: true,
   recipientAdjustments: oidWorksheet('-50') };
  const net = calculateScheduleB(fixture([source(alreadyNetOid)]));
  expect(net.totalInterest.toFixed()).toBe('480');
  expect(net.isRequired).toBe(false);
  expect(net.interestReportingRows).toBeUndefined();
  const independentAbp = calculateScheduleB(fixture([source({ ...alreadyNetOid, otherPeriodicInterest: '40',
   bondPremium: '10', bondPremiumElection: true })]));
  expect(independentAbp.interestReportingRows?.map(row => [row.name, row.amount.toFixed()])).toEqual([
   ['Synthetic source (OID)', '520'], ['Subtotal', '520'], ['ABP Adjustment', '-10'],
  ]);
  expect(independentAbp.totalInterest.toFixed()).toBe('510');
 });

 it('reports upward and downward OID worksheet changes from original boxes in 2025 and 2026',()=>{
  const cases = [
   { originalIssueDiscount: '0', obligationType: 'treasury', treasuryOID: '600.25',
    recipientAdjustments: oidWorksheet('-50'), expectedAdjustment: '-50', expectedNet: '950.5' },
   { originalIssueDiscount: '600.25', recipientAdjustments: oidWorksheet('50'),
    interestReportedNetOfBondPremium: true, bondPremiumElection: true,
    expectedAdjustment: '50', expectedNet: '1050.5' },
   { originalIssueDiscount: '600.25', acquisitionPremium: '100', recipientAdjustments: oidWorksheet('-50'),
    expectedAdjustment: '-150', expectedNet: '850.5' },
   { originalIssueDiscount: '600.25', acquisitionPremium: '100', recipientAdjustments: oidWorksheet('50'),
    expectedAdjustment: '-50', expectedNet: '950.5' },
  ];
  for (const taxYear of [2025, 2026]) {
   for (const { expectedAdjustment, expectedNet, ...statement } of cases) {
    const input = fixture([source({ taxYear, otherPeriodicInterest: '400.25', ...statement })]);
    input.taxpayer.taxYear = taxYear;
    const scheduleB = calculateScheduleB(input);
    expect(scheduleB.isRequired).toBe(true);
    expect(scheduleB.interestReportingRows?.map(row => [row.name, row.amount.toFixed()])).toEqual([
     ['Synthetic source (OID)', '1000.5'], ['Subtotal', '1000.5'], ['OID Adjustment', expectedAdjustment],
    ]);
    expect(scheduleB.interestPayers[0]?.amount.toFixed()).toBe(expectedNet);
    expect(scheduleB.taxableInterest.toFixed()).toBe(expectedNet);
    if (taxYear === 2025) {
     const federal = calculateFederalTax(input);
     expect(audit(federal, '1040', '2b')).toBe(expectedNet);
     if (statement.obligationType === 'treasury') expect(federal.form1099OID?.treasuryInterest.toFixed()).toBe(expectedNet);
    }
   }
  }
  const unchanged = calculateScheduleB(fixture([source({ originalIssueDiscount: '600', acquisitionPremium: '50',
   recipientAdjustments: oidWorksheet('50') })]));
  expect(unchanged.taxableInterest.toFixed()).toBe('600');
  expect(unchanged.isRequired).toBe(false);
  expect(unchanged.interestReportingRows).toBeUndefined();
 });

 it('keeps opposing OID statement changes separate below the Schedule B subtotal',()=>{
  const input = fixture([
   source({ originalIssueDiscount: '400', recipientAdjustments: oidWorksheet('-50') }),
   source({ payer: 'Other source', sourceId: 'other', originalIssueDiscount: '500', recipientAdjustments: oidWorksheet('50') }),
  ]);
  const scheduleB = calculateScheduleB(input);
  expect(scheduleB.isRequired).toBe(true);
  expect(scheduleB.interestReportingRows?.map(row => [row.name, row.amount.toFixed()])).toEqual([
   ['Synthetic source (OID)', '400'], ['Other source (OID)', '500'], ['Subtotal', '900'],
   ['OID Adjustment', '-50'], ['OID Adjustment', '50'],
  ]);
  expect(scheduleB.taxableInterest.toFixed()).toBe('900');
 });

 it('includes Schedule B gross amounts and reductions in a 2025 review packet below $1,500',async()=>{
  const input = fixture([source({ originalIssueDiscount: '600', acquisitionPremium: '100', otherPeriodicInterest: '300',
   bondPremium: '75', bondPremiumElection: true })]);
  const federal = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), 'oid-schedule-b-review-'));
  try {
   const packet = await fillReturn(input, federal, { blankFormsDir: 'forms/blank/2025', outputDir });
   const scheduleBPath = join(outputDir, 'f1040sb-filled.pdf');
   expect(packet.filledForms).toContain(scheduleBPath);
   const doc = await PDFDocument.load(await readFile(scheduleBPath));
   const form = doc.getForm(), fields = SCHEDULE_B_FIELDS;
   const rows = fields.interestPayerName.slice(0, 4).map((field, index) =>
    [form.getTextField(field).getText(), form.getTextField(fields.interestPayerAmount[index]).getText()]);
   expect(rows).toEqual([
    ['Synthetic source (OID)', '900'], ['Subtotal', '900'], ['OID Adjustment', '(100)'], ['ABP Adjustment', '(75)'],
   ]);
   expect([fields.line2, fields.line4].map(field => form.getTextField(field).getText())).toEqual(['725', '725']);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
 });

 it('prints original zero OID and its positive adjustment on the 2025 review PDF',async()=>{
  const input = fixture([source({ recipientAdjustments: oidWorksheet('125') })]);
  const result = calculateFederalTax(input);
  const outputDir = await mkdtemp(join(tmpdir(), 'oid-schedule-b-refigured-'));
  try {
   const packet = await fillReturn(input, result, { blankFormsDir: 'forms/blank/2025', outputDir });
   const scheduleBPath = join(outputDir, 'f1040sb-filled.pdf');
   expect(packet.filledForms).toContain(scheduleBPath);
   const form = (await PDFDocument.load(await readFile(scheduleBPath))).getForm();
   const fields = SCHEDULE_B_FIELDS;
   const rows = fields.interestPayerName.slice(0, 3).map((field, index) =>
    [form.getTextField(field).getText(), form.getTextField(fields.interestPayerAmount[index]).getText()]);
   expect(rows).toEqual([['Synthetic source (OID)', '0'], ['Subtotal', '0'], ['OID Adjustment', '125']]);
   expect(form.getTextField(fields.line2).getText()).toBe('125');
  } finally { await rm(outputDir, { recursive: true, force: true }); }
 });

 it('carries the Schedule B subtotal and adjustments after all interest payer rows',async()=>{
  const input = fixture([source({ originalIssueDiscount: '600', acquisitionPremium: '100', otherPeriodicInterest: '300',
   bondPremium: '75', bondPremiumElection: true })]);
  input.form1099Int = Array.from({ length: 14 }, (_, index) => ({
   payer: `Bank ${index + 1}`, interestIncome: '10', taxExemptInterest: '0',
  }));
  const federal = calculateFederalTax(input);
  const doc = await fillScheduleB(input, federal, 'forms/blank/2025/f1040sb.pdf');
  const bytes = await doc.save();
  const saved = await PDFDocument.load(bytes);
  expect(saved.getPageCount()).toBe(2);
  expect(saved.getForm().getTextField(SCHEDULE_B_FIELDS.line2).getText()).toBe('865');
  const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', [
   '-c', "import io,json,sys; from pypdf import PdfReader; print(json.dumps([p.extract_text() for p in PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=True).pages]))",
  ], { input: bytes, encoding: 'utf8' }));
  expect(pages[1].replace(/\s+/g, ' ')).toMatch(/Synthetic source \(OID\) 900 Subtotal 1040 OID Adjustment \(100\) ABP Adjustment \(75\)/);
  expect(pages[1]).toContain('FOR REVIEW ONLY - NOT FOR FILING');
 });

 it('routes verified OID amounts to their actual federal lines once',()=>{
  const input=fixture([
   source({originalIssueDiscount:'100.11',earlyWithdrawalPenalty:'10',federalWithheld:'12.70',stateWithholding:[{state:'PA',statePayerId:'actual',stateWithheld:'20'}]}),
   source({sourceId:'treasury',obligationType:'treasury',treasuryOID:'200.22',acquisitionPremium:'20',otherPeriodicInterest:'30'}),
   source({sourceId:'municipal',obligationType:'tax_exempt',taxExemptOID:'300',acquisitionPremium:'30',otherPeriodicInterest:'400',bondPremium:'50',specifiedPrivateActivityBond:true}),
  ]);
  const r=calculateFederalTax(input);
  expect(calculateScheduleB(input).taxableInterest.toString()).toBe('310.33');
  expect(audit(r,'1040','2b')).toBe('310.33');
  expect(audit(r,'1040','2a')).toBe('620');
  expect(audit(r,'1040','25b')).toBe('12.7');
  expect(audit(r,'Sched 1','18')).toBe('10');
  expect(audit(r,'Form 6251','2g')).toBe('620');
  expect(r.agi.toString()).toBe('50300.33');
  expect(r.form1099OID?.treasuryInterest.toString()).toBe('210.22');
  expect(r.scheduleA?.saltDeduction.toString()).toBe('20');
 });
 it('deducts only allowable excess premium and preserves its carry',()=>{
  const input=fixture([source({otherPeriodicInterest:'100',bondPremium:'150',bondPremiumElection:true,bondPremiumWorksheet:{priorInterestInclusions:'20',priorPremiumDeductions:'5',priorCarryforward:'10',disposedDuringYear:false,periods:[{endDate:'2025-12-31',qualifiedStatedInterest:'100',amortization:'150'}]}})]);
  const r=calculateFederalTax(input);
  // Actual excess60: prior inclusions20 minus prior deduction5 allows15; carry45.
  expect(r.form1099OID?.bondPremiumDeduction.toString()).toBe('15');
  expect(r.form1099OID?.bondPremiumCarryforward.toString()).toBe('45');
  expect(r.agi.toString()).toBe('50000');
  const sa=calculateScheduleA(input,new Decimal(50000),'single',getConstants(2025),{gamblingWinnings:new Decimal(40),gamblingLosses:new Decimal(40)});
  expect(sa.otherItemizedDeductions.toString()).toBe('55');
  const otherDeductionsAudit=sa.lines.filter(row=>row.form==='Sched A'&&row.line==='16');
  expect(otherDeductionsAudit).toHaveLength(1);
  expect(otherDeductionsAudit[0]?.value.toString()).toBe('55');
  expect(sa.totalItemized.toString()).toBe('55');
 });
 it('routes allowable TIPS ordinary loss to itemized deductions and preserves its carry',()=>{
  const input=fixture([source({obligationType:'treasury',inflationIndexed:true,treasuryOID:'-200',tipsDeflationFacts:{allInstrumentInterestReportedHere:true,priorInterestInclusions:'100',priorOrdinaryLosses:'0',priorCarryforward:'0'}})]);
  input.scheduleA={ additionalStateLocalIncomeTaxes:'16000' };
  const result=calculateFederalTax(input);
  expect(result.form1099OID?.deflationOrdinaryLoss.toString()).toBe('100');
  expect(result.form1099OID?.deflationCarryforward.toString()).toBe('100');
  expect(result.scheduleB?.interestReportingRows).toBeUndefined();
  expect(result.scheduleA?.oidOrdinaryLossDeduction.toString()).toBe('100');
  expect(result.scheduleA?.otherItemizedDeductions.toString()).toBe('100');
  expect(result.agi.toString()).toBe('50000');
  expect(result.taxableIncome.toString()).toBe('33900');
  expect(audit(result,'1040','2b')).toBe('0');
 });
 it('deducts actual TIPS loss for NIIT only when itemized',()=>{
  const input=fixture([source({obligationType:'treasury',inflationIndexed:true,treasuryOID:'-2000',tipsDeflationFacts:{allInstrumentInterestReportedHere:true,priorInterestInclusions:'1000',priorOrdinaryLosses:'0',priorCarryforward:'0'}}),source({sourceId:'other',originalIssueDiscount:'10000'})]);
  input.w2s[0]={...input.w2s[0],wages:'200000',federalWithheld:'60000'};
  const standard=calculateFederalTax(input);
  expect(standard.deductionUsed).toBe('standard');
  expect(standard.form8960.netInvestmentIncome.toString()).toBe('10000');
  expect(standard.form8960.niitTax.toString()).toBe('380');
  input.scheduleA={ additionalStateLocalIncomeTaxes:'16000' };
  const itemized=calculateFederalTax(input);
  expect(itemized.deductionUsed).toBe('itemized');
  expect(itemized.agi.toString()).toBe('210000');
  expect(itemized.form8960.netInvestmentIncome.toString()).toBe('9000');
  expect(itemized.form8960.niitTax.toString()).toBe('342');
  expect(audit(itemized,'Form 8960','10')).toBe('1000');
  expect(itemized.form1099OID?.deflationCarryforward.toString()).toBe('1000');
 });
 it('maps actual TIPS loss and NIIT modification to the review forms',async()=>{
  const input=fixture([source({obligationType:'treasury',inflationIndexed:true,treasuryOID:'-2000',tipsDeflationFacts:{allInstrumentInterestReportedHere:true,priorInterestInclusions:'1000',priorOrdinaryLosses:'0',priorCarryforward:'0'}}),source({sourceId:'other',originalIssueDiscount:'10000'})]);
  input.w2s[0]={...input.w2s[0],wages:'200000',federalWithheld:'60000'};
  input.scheduleA={ additionalStateLocalIncomeTaxes:'16000' };
  const result=calculateFederalTax(input);
  const sa=await PDFDocument.load(await(await fillScheduleA(input,result,'forms/blank/2025/f1040sa.pdf')).save());
  expect(sa.getForm().getTextField(SCHEDULE_A_FIELDS.line16).getText()).toBe('1000');
  expect(sa.getForm().getTextField(SCHEDULE_A_FIELDS.line16Desc).getText()).toBe('TIPS ordinary loss');
  const niit=await PDFDocument.load(await(await fillForm8960(input,result,'forms/blank/2025/f8960.pdf')).save());
  expect(niit.getForm().getTextField(FORM_8960_FIELDS.line8).getText()).toBe('10000');
  expect(niit.getForm().getTextField(FORM_8960_FIELDS.line10).getText()).toBe('1000');
  expect(niit.getForm().getTextField(FORM_8960_FIELDS.line11).getText()).toBe('1000');
  expect(niit.getForm().getTextField(FORM_8960_FIELDS.line12).getText()).toBe('9000');
 });
 it('maps the audited excess premium into the review form line16',async()=>{
  const input=fixture([source({otherPeriodicInterest:'100',bondPremium:'150',bondPremiumElection:true,bondPremiumWorksheet:{priorInterestInclusions:'20',priorPremiumDeductions:'5',priorCarryforward:'0',disposedDuringYear:false,periods:[{endDate:'2025-12-31',qualifiedStatedInterest:'100',amortization:'150'}]}})]);
  const result=calculateFederalTax(input);
  const doc=await PDFDocument.load(await (await fillScheduleA(input,result,'forms/blank/2025/f1040sa.pdf')).save());
  expect(doc.getForm().getTextField(SCHEDULE_A_FIELDS.line16).getText()).toBe('15');
  expect(doc.getForm().getTextField(SCHEDULE_A_FIELDS.line16Desc).getText()).toBe('Excess bond premium');
 });

 it('maps actual OID preference to the review Form6251 line2g',async()=>{
  const input=fixture([source({obligationType:'tax_exempt',taxExemptOID:'300',specifiedPrivateActivityBond:true})]);
  const result=calculateFederalTax(input);
  const doc=await PDFDocument.load(await (await fillForm6251(input,result,'forms/blank/2025/f6251.pdf')).save());
  expect(doc.getForm().getTextField(FORM_6251_FIELDS.line2g).getText()).toBe('300');
 });

});
