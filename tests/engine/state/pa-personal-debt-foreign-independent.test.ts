// Spec: spec/state/pa-personal-debt-foreign-independent.yaml. Independent literal source controls.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAPersonalDebtAndForeignBankSources} from '@/engine/state/pa-personal-debt-foreign-sources';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculateFederalTax} from '@/engine/federal';
import {paPersonalCodForeignFixture} from '../../fixtures/pa-personal-debt-foreign-sources';
type Fixture=ReturnType<typeof paPersonalCodForeignFixture>;
function present<T>(v:T|null|undefined):T{if(v===null||v===undefined)throw new Error('Missing explicit independent fixture original');return v;}
const compute=(f:Fixture)=>calculatePAPersonalDebtAndForeignBankSources(f.input,{personalDebtDischarges:f.personalDebtDischarges,foreignBankTaxSources:f.foreignBankTaxSources});
const debt=(f:Fixture)=>present(present(present(f.input.form982NolSources).debts)[0]);
it('independent complete personal COD preserves gross interest no country credit and literal PA return',()=>{
 const f=paPersonalCodForeignFixture(),before=JSON.stringify(f),fed=calculateFederalTax(f.input),r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
 expect(r.pa40.interest.toFixed()).toBe('5000');expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('100000');
 expect(r.pa40.taxLiability.toFixed()).toBe('3070');expect(r.pa40.stateWithholding.toFixed()).toBe('4000');
 expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.pa40.otherDeductions.toFixed()).toBe('0');
 expect(r.refundDisposition.refund.toFixed()).toBe('930');expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('100000');
 expect(fed.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');
 expect(fed.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('145');
 expect(r.readiness.filingEligible).toBe(false);expect(JSON.stringify(f)).toBe(before);
});
it('independent tax receipt timing cannot allocate interest or create SP debt income',()=>{
 for(const [status,interest,total,tax] of [['resident','5000','100000','3070'],['part_year','2000','73000','2241'],['nonresident','0','6000','184']] as const){
  const f=paPersonalCodForeignFixture(status);present(present(f.foreignBankTaxSources[0]).payments[0]).paidOn='2025-01-02';
  const r=calculatePAResidencySources(f.input,f.sources),p=calculatePAOrdinaryReturnFacts(f.input,f.facts);
  expect(r.interest.toFixed()).toBe(interest);expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe(total);expect(r.taxBeforeCredits.toFixed()).toBe(tax);
  expect(r.personalDebtSources?.spDebtEligibilityIncome.toFixed()).toBe('0');
  expect(p.paTaxableIncome.plus(p.spNontaxableIncome).toFixed()).toBe('100000');
  expect(p.spOtherIncomeByLine['10']?.toFixed()).toBe('0');
 }
});
it('independent cancelled charges reconcile included interest only once',()=>{
 const f=paPersonalCodForeignFixture();f.input.form1099C[0].interestIncluded='30';debt(f).interestIncluded='30';
 const row=present(f.personalDebtDischarges[0]);row.original=structuredClone(f.input.form1099C[0]);
 Object.assign(row.statement,{principalCancelled:'250',interestCancelled:'30',feesCancelled:'20'});
 const r=compute(f);expect(r.personalDischargedAmount.toFixed()).toBe('300');
 expect(r.paTaxableDebtIncome.toFixed()).toBe('0');expect(r.spDebtEligibilityIncome.toFixed()).toBe('0');
});
it('independent foreign payment aggregation retains long source cents and shared Decimal outputs',()=>{
 const f=paPersonalCodForeignFixture(),h='1'+'0'.repeat(145),n=h+'.51';
 f.input.form1099Int[0].foreignTaxPaid=n;const row=present(f.foreignBankTaxSources[0]);row.original=structuredClone(f.input.form1099Int[0]);
 const a=present(row.payments[0]);a.amount=h+'.49';row.payments.push({...a,receiptNumber:'INDEPENDENT-SECOND-RECEIPT',amount:'0.02'});
 const before=JSON.stringify(f),precision=Decimal.precision,r=compute(f);
 expect(r.foreignTaxNotDeducted.toFixed()).toBe(n);expect(r.foreignTaxNotDeducted.constructor).toBe(Decimal);
 expect(Decimal.precision).toBe(precision);expect(JSON.stringify(f)).toBe(before);
});
it('independent private identity references stay out of all public helper values',()=>{
 const f=paPersonalCodForeignFixture(),out=JSON.stringify(compute(f)),row=present(f.personalDebtDischarges[0]);
 for(const secret of [f.input.taxpayer.primary.ssn,row.sourceReference,row.statement.accountReference,row.statement.statementId,row.qualification.useSourceReference,present(present(f.foreignBankTaxSources[0]).payments[0]).receiptNumber]){
  expect(secret).toBeTruthy();expect(out).not.toContain(secret);
 }
});
it('independent distinct foreign bank originals retain separate actual payment receipts',()=>{
 const f=paPersonalCodForeignFixture(),b=structuredClone(f.input.form1099Int[0]);
 Object.assign(b,{payer:'Independent fictional bank B',payerTin:'98-7654321',accountReference:'Independent fictional bank B account'});
 f.input.form1099Int.push(b);const row=structuredClone(present(f.foreignBankTaxSources[0]));
 Object.assign(row,{originalIndex:1,original:structuredClone(b),sourceReference:'Independent fictional bank B statement'});
 present(row.payments[0]).receiptNumber='INDEPENDENT-BANK-B-RECEIPT';f.foreignBankTaxSources.push(row);
 expect(compute(f).foreignTaxNotDeducted.toFixed()).toBe('200');
});
it('independent reused foreign tax receipt never counts twice across originals',()=>{
 const f=paPersonalCodForeignFixture(),b=structuredClone(f.input.form1099Int[0]);
 Object.assign(b,{payer:'Independent fictional bank B',payerTin:'98-7654321',accountReference:'Independent fictional bank B account'});f.input.form1099Int.push(b);
 const row=structuredClone(present(f.foreignBankTaxSources[0]));Object.assign(row,{originalIndex:1,original:structuredClone(b)});f.foreignBankTaxSources.push(row);
 expect(()=>compute(f)).toThrow(/duplicated/);
});
it('independent equal-money COD original change cannot refresh retained PA evidence',()=>{
 const f=paPersonalCodForeignFixture(),before=JSON.stringify(f.personalDebtDischarges);
 f.input.form1099C[0].debtDescription='Independent amended current original description';
 expect(()=>compute(f)).toThrow(/original changed/);expect(JSON.stringify(f.personalDebtDischarges)).toBe(before);
});
it('independent successful income classification cannot substitute missing other completion sources',()=>{
 const f=paPersonalCodForeignFixture();expect(compute(f).paTaxableDebtIncome.toFixed()).toBe('0');
 f.completion.care.status='unknown';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow();
});
it.each(['accountHolder','debtorName','debtorSsnLast4'] as const)('independent COD rejects contradictory federal debtor identity: %s',key=>{
 const f=paPersonalCodForeignFixture(),d=debt(f);
 if(key==='accountHolder')d.accountHolder='spouse';else if(key==='debtorName')d.debtorName='Independent Different Debtor';else d.debtorSsnLast4='9999';
 expect(()=>compute(f)).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
});
it.each(['unsecuredPersonalDebtConfirmed','noPropertyTransferConfirmed'] as const)('independent COD rejects explicit retained contradictory security or transfer facts: %s',key=>{
 const f=paPersonalCodForeignFixture();debt(f)[key]=false;
 expect(()=>compute(f)).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
});
it('independent personal use confirmation cannot overwrite retained actual business proceeds records',()=>{
 const f=paPersonalCodForeignFixture();
 debt(f).personalDebt={sourceReference:'Independent fictional original proceeds ledger showing business use',sourceFactsConfirmed:true,proceedsUse:'business'};
 expect(()=>compute(f)).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
});
it.each(['personallyLiable','fmvOfProperty'] as const)('independent COD rejects conflicting current original debt boxes: %s',key=>{
 const f=paPersonalCodForeignFixture(),d=debt(f);
 if(key==='personallyLiable')d.personallyLiable=false;else d.fmvOfProperty='10';
 // Original1099C remains personallyLiable true/FMV0; these are contradictory current records, not a property-transfer inference.
 expect(()=>compute(f)).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
});
it('independent personal unsecured classification needs explicit security evidence in either source method',()=>{
 const f=paPersonalCodForeignFixture();delete f.input.form982NolSources;
 // PA qualifiers cover no-business collateral, personal use and no transfer,
 // but none states no personal collateral; unsecured status remains unknown.
 expect(()=>compute(f)).toThrow();expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
});
