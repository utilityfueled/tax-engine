/** Independent controls: spec/state/oh-canonical-business-independent.yaml. */
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioCanonicalBusinessSource, readOhioCanonicalBusinessSource, type OhioCanonicalBusinessContext } from '@/engine/state/oh-business-source.js';
import { calculateOhio2026Baseline } from '@/engine/state/oh-2026-baseline.js';
import { calculateOhioITNRC } from '@/engine/state/oh-it-nrc.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { canonicalOhioBusinessFixture } from '../../fixtures/oh-canonical-business-sources.js';
// Values independently derived with Python Decimal100, never candidate expectation imports.
const oracle2025 = [
  ['100000','7065','92935','92935','0','31250','0','0','0.0000','0','0'],
  ['400000','16275','383725','250000','133725','125000','0','3955','1.0000','3955','0'],
  ['1000000','24309','975691','250000','725691','312500','62500','21771','0.9138','19894','1877'],
] as const;
const oracle2026 = [
  ['100000','7065','92935','92935','0','31250','0','0','0.0000','0','0'],
  ['400000','16796','383204','250000','133204','125000','0','3939','1.0000','3939','0'],
  ['1000000','24830','975170','250000','725170','312500','62500','21755','0.9138','19880','1875'],
] as const;
type Packet = ReturnType<typeof canonicalOhioBusinessFixture>;
function first<T>(rows: readonly T[]): T { const item=rows[0]; if(item===undefined) throw new Error('Independent fixture lacks original row'); return item; }
function b(p:Packet){return first(p.facts.businessSources.facts.businesses);}
function o(p:Packet){return first(p.facts.owners);}
function deduction(p:Packet){return first(p.facts.businessSources.federalDeductionSources);}
function receipt(p:Packet){return first(p.facts.businessSources.receiptOriginals);}
function rebind(p:Packet){p.facts.originalFederalSources=structuredClone(p.input);}
function run(p:Packet){return calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input),overlay:{residency:p.facts}});}
const cases2025=oracle2025.flatMap(row=>(['nonresident','part_year_resident'] as const).map(status=>[row[0],status,row] as const));
it.each(cases2025)('source-oracle actual2025 %s %s',(profit,status,row)=>{
 const p=canonicalOhioBusinessFixture(2025,profit,status),original=JSON.stringify(p),precision=Decimal.precision;
 const f=calculateFederalTax(p.input),context=calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,federalResult:f});
 const v=readOhioCanonicalBusinessSource(context,p.facts,row[2]),r=run(p),n=r.nonresidentCreditResult;
 if(!n)throw new Error('Independent source requires NRC');
 expect([f.adjustmentsToIncome.toFixed(),f.agi.toFixed(),v.worksheet.businessIncomeDeduction.toFixed(),v.ohioAgi.toFixed(),v.worksheet.columnC.toFixed(),n.line5.toFixed(),r.it1040.line8c_totalTax.toFixed(),n.line19.toFixed(4),n.line20.toFixed(),r.it1040.line10_taxAfterCredits.toFixed()]).toEqual(row.slice(1));
 expect(n.line14.toFixed()).toBe('0');expect(n.line6.toFixed()).toBe('0');
 const factor=first(v.worksheet.businesses);expect([factor.propertyRatio.toFixed(),factor.propertyWeight.toFixed(),factor.payrollWeight.toFixed(),factor.salesRatio.toFixed(),factor.salesWeight.toFixed(),factor.apportionmentRatio.toFixed()]).toEqual(['0.5','0.25','0','0.25','0.75','0.3125']);
 expect(v.worksheet.columnA.toFixed()).toBe(profit);expect(v.worksheet.qualifiedYearPack).toBe(false);
 const audit=JSON.stringify(r.lines);for(const secret of [p.input.taxpayer.primary.ssn,p.input.taxpayer.primary.firstName,p.input.taxpayer.address.street,receipt(p).originalDocumentId,deduction(p).original.documentId])expect(audit).not.toContain(secret);
 expect(JSON.stringify(p)).toBe(original);expect(Decimal.precision).toBe(precision);
});
it('factor-once actual raw ledger and AGI cap',()=>{
 const p=canonicalOhioBusinessFixture(2025,'100000','part_year_resident'),f=calculateFederalTax(p.input);
 const v=readOhioCanonicalBusinessSource(calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,federalResult:f}),p.facts,'92935');
 expect(v.worksheet.columnC.toFixed()).toBe('31250');expect(v.worksheet.businessIncomeDeduction.toFixed()).toBe('92935');
 expect(v.worksheet.businessIncomeBeforeDeductionCap.toFixed()).toBe('92935');expect(v.deductibleHalf.toFixed()).toBe('7065');expect(v.residentFederalDeductions.toFixed()).toBe('0');
});
const cases2026=oracle2026.flatMap(row=>(['nonresident','part_year_resident'] as const).map(status=>[row[0],status,row] as const));
it.each(cases2026)('draft-closed source2026 %s %s',(profit,status,row)=>{
 const p=canonicalOhioBusinessFixture(2026,profit,status),before=JSON.stringify(p);
 const v=readOhioCanonicalBusinessSource(calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,draft2026:true}),p.facts,row[2]);
 const base=calculateOhio2026Baseline({taxYear:2026,filingStatus:'single',ohioAdjustedGrossIncome:v.ohioAgi,businessIncomeDeduction:v.worksheet.businessIncomeDeduction,qualifyingCapitalGainsAndPayrollDeduction:'0',taxableBusinessIncome:v.worksheet.businessIncomeBeforeDeductionCap.minus(v.worksheet.businessIncomeDeduction),eligibleExemptions:1,precedingCredits:'0',primaryQualifyingIncome:'0'});
 const context=calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,draft2026:true});
 const n=calculateOhioITNRC({taxYear:2026,filingStatus:'single',federalAgi:v.federalAgi,ohioAgi:v.ohioAgi,taxRemainingBeforeResidencyCredits:base.totalTax,residencyFacts:p.facts,businessSource:context});
 expect([v.deductibleHalf.toFixed(),v.federalAgi.toFixed(),v.worksheet.businessIncomeDeduction.toFixed(),v.ohioAgi.toFixed(),v.worksheet.columnC.toFixed(),n.line5.toFixed(),base.totalTax.toFixed(),n.line19.toFixed(4),n.line20.toFixed(),base.totalTax.minus(n.line20).toFixed()]).toEqual(row.slice(1));
 expect(base.filingQualified).toBe(false);expect(v.draft2026).toBe(true);expect(TAX_CONSTANTS[2026]).toBeUndefined();expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();expect(()=>calculateFederalTax(p.input)).toThrow(/incomplete; calculation is unavailable/);expect(JSON.stringify(p)).toBe(before);
});
it('raw-cents-identity exact draft cents are originals',()=>{
 const p=canonicalOhioBusinessFixture(2026,'400000');if(!p.input.scheduleC)throw new Error('Actual C required');
 p.input.scheduleC.grossReceipts='400000.04';b(p).originalBusiness=structuredClone(p.input.scheduleC) as NonNullable<Packet['facts']['businessSources']['facts']['businesses'][number]['originalBusiness']>;
 first(b(p).sales.rows).grossReceipt='400000.04';first(b(p).sales.rows).ohioBenefitReceipt='100000.01';receipt(p).grossReceipt='400000.04';receipt(p).ohioBenefitReceipt='100000.01';rebind(p);
 const context=calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,draft2026:true});const v=readOhioCanonicalBusinessSource(context,p.facts,'383204.04');
 expect(v.worksheet.columnA.toFixed()).toBe('400000.04');expect(v.worksheet.columnC.toFixed()).toBe('125000');expect(first(v.worksheet.businesses).salesRatio.toFixed()).toBe('0.25');expect(v.deductibleHalf.toFixed()).toBe('16796');
 const altered=structuredClone(p.facts);first(altered.businessSources.receiptOriginals).grossReceipt='400000.05';expect(()=>readOhioCanonicalBusinessSource(context,altered,'383204.04')).toThrow();
});
const negative: [string,(p:Packet)=>void][]=[
 ['stale-current-C-identity',p=>{if(p.input.scheduleC)p.input.scheduleC.ein='90-7000422';rebind(p);}],
 ['stale-original-snapshot',p=>{p.input.taxpayer.primary.lastName='ChangedOriginal';}],
 ['wrong-current-owner',p=>{if(p.input.scheduleC)p.input.scheduleC.accountHolder='spouse';rebind(p);}],
 ['wrong-original-owner',p=>{Reflect.set(b(p).originalBusiness,'accountHolder','spouse');}],
 ['wrong-packet-year',p=>{p.facts.businessSources.taxYear=2026;}],
 ['wrong-invoice-year',p=>{receipt(p).sourceTaxYear=2026;}],
 ['wrong-invoice-owner',p=>{Reflect.set(receipt(p),'accountHolder','spouse');}],
 ['wrong-benefit-cent',p=>{receipt(p).ohioBenefitReceipt='250000.01';}],
 ['wrong-gross-cent',p=>{receipt(p).grossReceipt='1000000.01';}],
 ['invalid-invoice-day',p=>{receipt(p).date='2025-02-29';}],
 ['invoice-out-of-year',p=>{receipt(p).date='2024-12-15';}],
 ['void-invoice',p=>{Reflect.set(receipt(p),'currentUncorrectedNonvoidConfirmed',false);}],
 ['unknown-benefit',p=>{Reflect.set(receipt(p),'purchaserBenefitSitusingConfirmed',false);}],
 ['invented-worksheet-scalar',p=>{Reflect.set(p.facts.businessSources,'federalAgi','975691');}],
 ['invented-tax-scalar',p=>{Reflect.set(p.facts.businessSources,'nonresidentCredit','19894');}],
 ['unknown-payroll',p=>{Reflect.deleteProperty(b(p).payroll,'qualifyingEmployeeCompensationConfirmed');}],
 ['actual-nonzero-payroll',p=>{b(p).payroll.everywhere='1';}],
 ['unknown-current-C-gross',p=>{if(p.input.scheduleC)Reflect.deleteProperty(p.input.scheduleC,'grossReceipts');rebind(p);}],
 ['unknown-inventory',p=>{if(p.input.scheduleC)Reflect.deleteProperty(p.input.scheduleC,'costOfGoodsSold');rebind(p);}],
 ['negative-C',p=>{if(p.input.scheduleC)p.input.scheduleC.expenses={...p.input.scheduleC.expenses,otherExpenses:'1000001'};rebind(p);}],
 ['unknown-deduction-completeness',p=>{Reflect.set(p.facts.businessSources,'allFederalDeductionSourcesIncludedConfirmed',false);}],
 ['unknown-deduction-accruals',p=>{Reflect.set(deduction(p).original,'allUnderlyingDeductionAccrualsIncludedConfirmed',false);}],
 ['deduction-date-outside-year',p=>{deduction(p).original.date='2026-01-01';}],
 ['wrong-deduction-document-year',p=>{deduction(p).original.sourceTaxYear=2026;}],
 ['wrong-deduction-document-owner',p=>{Reflect.set(deduction(p).original,'accountHolder','spouse');}],
 ['unknown-deduction-date',p=>{Reflect.deleteProperty(deduction(p).original,'date');}],
 ['unsupported-personal-deduction',p=>{Reflect.set(deduction(p),'deductionKind','ira_deduction');}],
 ['bare-resident-deduction',p=>{o(p).amounts.federalAdjustments.residentAmount='24309';}],
 ['one-cent-deduction-mismatch',p=>{deduction(p).original.amount='24309.01';}],
 ['resident-date-contradicts-scalar',p=>{deduction(p).original.date='2025-05-01';}],
 ['timeline-gap',p=>{first(o(p).periods).to='2025-06-29';}],
 ['nonempty-netzero-other-income',p=>{p.input.form1099Misc=[{payer:'Distinct plus original',accountHolder:'primary',otherIncome:'100'},{payer:'Distinct minus original',accountHolder:'primary',otherIncome:'-100'}];rebind(p);}],
 ['unknown-business-completeness',p=>{Reflect.set(p.facts.businessSources.facts,'allBusinessesIncludedConfirmed',false);}],
 ['unknown-special-industry',p=>{Reflect.set(b(p),'noSpecialIndustryOrAlternativeAllocationConfirmed',false);}],
];
it.each(negative)('original-guards %s',(_name,mutate)=>{const p=canonicalOhioBusinessFixture(2025,'1000000','part_year_resident');mutate(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);});
it('original-guards normalized duplicate invoice documents',()=>{
 const p=canonicalOhioBusinessFixture();const x=structuredClone(receipt(p));x.receiptId='SecondDistinctReceipt';x.originalDocumentId=`  ${x.originalDocumentId.toUpperCase()}  `;x.grossReceipt='500000';x.ohioBenefitReceipt='125000';receipt(p).grossReceipt='500000';receipt(p).ohioBenefitReceipt='125000';p.facts.businessSources.receiptOriginals.push(x);const a=first(b(p).sales.rows);a.grossReceipt='500000';a.ohioBenefitReceipt='125000';b(p).sales.rows.push({receiptId:x.receiptId,sourceReference:x.sourceReference,grossReceipt:x.grossReceipt,ohioBenefitReceipt:x.ohioBenefitReceipt,purchaserBenefitSitusingConfirmed:true});expect(()=>run(p)).toThrow(/duplicated/);
});
it('opaque-private cannot clone or forge source authority',()=>{
 const p=canonicalOhioBusinessFixture(),f=calculateFederalTax(p.input),context=calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,federalResult:f});
 expect(Object.isFrozen(context)).toBe(true);expect(JSON.stringify(context)).not.toContain(p.input.taxpayer.primary.ssn);
 expect(()=>readOhioCanonicalBusinessSource(structuredClone(context),p.facts,'975691')).toThrow();expect(()=>readOhioCanonicalBusinessSource({methodId:'ohio-canonical-ordinary-c-v1',taxYear:2025,sourceCommitment:context.sourceCommitment} as OhioCanonicalBusinessContext,p.facts,'975691')).toThrow();
 expect(()=>readOhioCanonicalBusinessSource(context,p.facts,'975692')).toThrow();const changed=structuredClone(p.facts);changed.sourceReference+=' changed current original';expect(()=>readOhioCanonicalBusinessSource(context,changed,'975691')).toThrow();
 const stale=calculateFederalTax(p.input);stale.agi=new Decimal('975692');expect(()=>calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,federalResult:stale})).toThrow(/differs/);
});
it('raw-cents-identity equal-money complete current replacement changes commitment',()=>{
 const p=canonicalOhioBusinessFixture(),before=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input),{residency:p.facts});
 if(!p.input.scheduleC)throw new Error('Actual C required');p.input.scheduleC.ein='90-7000999';b(p).originalBusiness=structuredClone(p.input.scheduleC) as NonNullable<Packet['facts']['businessSources']['facts']['businesses'][number]['originalBusiness']>;rebind(p);
 const after=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input),{residency:p.facts});expect(after.residencySourceDigest).not.toBe(before.residencySourceDigest);expect(run(p).it1040.line10_taxAfterCredits.toFixed()).toBe('1877');
});
it('original-guards supplied business scalar cannot replace current derivation',()=>{const p=canonicalOhioBusinessFixture();expect(()=>calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input),overlay:{residency:p.facts,qualifyingBusinessIncome:'1000000'}})).toThrow(/supplied business income override/);});
// Unhandled source families must be rejected even when their federal totals cancel.
it('original-guards retained Social Security sources netzero do not become source-free',()=>{
 const p=canonicalOhioBusinessFixture();p.input.formSSA1099=[{recipient:'Actual retained benefit statement A',netBenefits:'100',federalWithheld:'0'}];p.input.formRRB1099=[{recipient:'Actual retained repayment statement B',netSocialSecurityEquivalentBenefitPortion:'-100',federalWithheld:'0'}];rebind(p);expect(()=>run(p)).toThrow();
});
it('original-guards draft positive retained Social Security cannot disappear',()=>{
 const p=canonicalOhioBusinessFixture(2026);p.input.formSSA1099=[{recipient:'Actual separate benefit source',netBenefits:'100',federalWithheld:'0'}];rebind(p);expect(()=>calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,draft2026:true})).toThrow();
});

it('raw-cents-identity actual2025 raw receipts cents reconcile whole net profit',()=>{
 const p=canonicalOhioBusinessFixture(2025,'400000');if(!p.input.scheduleC)throw new Error('Actual C required');
 p.input.scheduleC.grossReceipts='400000.04';p.input.scheduleC.expenses={...p.input.scheduleC.expenses,otherExpenses:'0.04'};
 b(p).originalBusiness=structuredClone(p.input.scheduleC) as NonNullable<Packet['facts']['businessSources']['facts']['businesses'][number]['originalBusiness']>;
 first(b(p).sales.rows).grossReceipt='400000.04';first(b(p).sales.rows).ohioBenefitReceipt='100000.01';receipt(p).grossReceipt='400000.04';receipt(p).ohioBenefitReceipt='100000.01';rebind(p);
 const f=calculateFederalTax(p.input),context=calculateOhioCanonicalBusinessSource({taxInput:p.input,residencyFacts:p.facts,federalResult:f}),v=readOhioCanonicalBusinessSource(context,p.facts,'383725');
 expect(f.scheduleC?.grossReceipts.toFixed()).toBe('400000.04');expect(f.scheduleC?.netProfit.toFixed()).toBe('400000');expect(v.worksheet.columnC.toFixed()).toBe('125000');expect(first(v.worksheet.businesses).salesRatio.toFixed()).toBe('0.25');expect(run(p).it1040.line10_taxAfterCredits.toFixed()).toBe('0');
});
it('original-guards normalized duplicate invoice identities',()=>{
 const p=canonicalOhioBusinessFixture();const x=structuredClone(receipt(p));x.receiptId=` ${x.receiptId.toUpperCase()} `;x.originalDocumentId='DistinctOriginalDocument';x.grossReceipt='500000';x.ohioBenefitReceipt='125000';receipt(p).grossReceipt='500000';receipt(p).ohioBenefitReceipt='125000';p.facts.businessSources.receiptOriginals.push(x);const a=first(b(p).sales.rows);a.grossReceipt='500000';a.ohioBenefitReceipt='125000';b(p).sales.rows.push({receiptId:x.receiptId,sourceReference:x.sourceReference,grossReceipt:x.grossReceipt,ohioBenefitReceipt:x.ohioBenefitReceipt,purchaserBenefitSitusingConfirmed:true});expect(()=>run(p)).toThrow();
});
