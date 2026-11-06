/** Spec: spec/state/oh-reciprocal-wages-independent.yaml. Frozen before product inspection. */
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {reciprocalOhioWageFixture,reciprocalW2,rebindReciprocalOuter,explicitlyReplaceReciprocalW2,type ReciprocalOhioWagePacket} from '../../fixtures/oh-reciprocal-wage-sources.js';

function run(p:ReciprocalOhioWagePacket,overlay:Record<string,unknown>={}) {
  return calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input),overlay:{residency:p.facts,...overlay}});
}
function payroll(p:ReciprocalOhioWagePacket,index=0) {
  const row=p.facts.reciprocalWageSources.payrollRows[index];
  if(!row)throw new Error('Independent original payroll row required');return row;
}
function owner(p:ReciprocalOhioWagePacket) {
  const value=p.facts.owners[0];if(!value)throw new Error('Independent original owner required');return value;
}
function ohioRow(p:ReciprocalOhioWagePacket) {
  const row=reciprocalW2(p).stateLocalSources?.stateRows.find(x=>x.state==='OH');
  if(!row)throw new Error('Independent issued Ohio row required');return row;
}
const rawCases=[['63333.33','2476.49','63333','2476'],['63333.50','2476.50','63334','2477'],['63333.99','2476.99','63334','2477'],['60000.25','0','60000','0']] as const;
const positions=rawCases.flatMap(row=>[...(['first','second'] as const)].map(position=>[row,position] as const));
it.each(positions)('reports independent reciprocal originals %s with Ohio row %s',(raw,position)=>{
  const [wages,wh,reportedWages,reportedWH]=raw;
  const p=reciprocalOhioWageFixture(wages,wh,position==='first');const before=JSON.stringify(p);const precision=Decimal.precision;
  const result=run(p);const deduction:unknown=Reflect.get(result.scheduleOfAdjustments,'line14_reciprocityWages');
  expect(Decimal.isDecimal(deduction)).toBe(true);expect(String(deduction)).toBe(reportedWages);
  expect(calculateFederalTax(p.input).agi.eq(wages)).toBe(true);expect(reciprocalW2(p).wages).toBe(wages);
  expect(result.scheduleOfAdjustments.line47_totalDeductions.toString()).toBe(reportedWages);
  expect(result.it1040.line1_federalAgi.toString()).toBe(reportedWages);
  expect(result.it1040.line3_ohioAgi.toString()).toBe('0');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');
  expect(result.it1040.line14_ohioWithholding.toString()).toBe(reportedWH);expect(result.it1040.line26_refund.toString()).toBe(reportedWH);
  expect(result.nonresidentCreditResult?.line1.toString()).toBe('0');expect(result.nonresidentCreditResult?.line8.toString()).toBe('0');expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');
  expect(result.residentCredit).toBeNull();expect(JSON.stringify(result.lines)).not.toContain('PRIVATE-');expect(JSON.stringify(result.lines)).not.toContain(p.input.taxpayer.primary.ssn);
  expect(JSON.stringify(p)).toBe(before);expect(Decimal.precision).toBe(precision);
});
it('aggregates independent actual payroll cents before one reported deduction and withholding',()=>{
  const p=reciprocalOhioWageFixture();p.facts.reciprocalWageSources.payrollRows.forEach((row,index)=>{row.wages=index===11?'4995.85':'5000.40';row.ohioWithheld=index===11?'1996.20':'0.40';});
  const before=JSON.stringify(p);const result=run(p);
  expect(result.scheduleOfAdjustments.line47_totalDeductions.toString()).toBe('60000');expect(result.it1040.line14_ohioWithholding.toString()).toBe('2001');
  expect(result.it1040.line26_refund.toString()).toBe('2001');expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');expect(JSON.stringify(p)).toBe(before);
});
const denied:[string,(p:ReciprocalOhioWagePacket)=>void][]=[
  ['missing entire exemption',p=>{Reflect.deleteProperty(p.facts,'reciprocalWageSources');}],
  ['unknown current confirmation',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'sourceFactsConfirmed');}],
  ['false all originals',p=>{p.facts.reciprocalWageSources.allIncomeOriginalsIncludedConfirmed=false;}],
  ['unknown no special compensation',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'noSpecialCompensationConfirmed');}],
  ['missing actual domicile record',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'domicileOriginal');}],
  ['stale actual taxpayer name',p=>{p.input.taxpayer.primary.firstName='Explicit different actual current owner';rebindReciprocalOuter(p);}],
  ['stale employer EIN',p=>{reciprocalW2(p).employer.ein='90-7000622';explicitlyReplaceReciprocalW2(p);}],
  ['stale current issued row ref',p=>{ohioRow(p).sourceReference='Explicit replaced issued Ohio row';rebindReciprocalOuter(p);}],
  ['missing actual Ohio withheld even zero',p=>{ohioRow(p).withheld='0';Reflect.deleteProperty(ohioRow(p),'withheld');explicitlyReplaceReciprocalW2(p);}],
  ['negative actual Ohio withholding',p=>{ohioRow(p).withheld='-1';explicitlyReplaceReciprocalW2(p);}],
  ['missing original state rows',p=>{Reflect.deleteProperty(reciprocalW2(p),'stateLocalSources');rebindReciprocalOuter(p);}],
  ['missing current W2 owner',p=>{Reflect.deleteProperty(reciprocalW2(p),'accountHolder');explicitlyReplaceReciprocalW2(p);}],
  ['actual payroll paid next year',p=>{payroll(p).paymentDate='2026-01-31';}],
  ['actual payroll before source period',p=>{payroll(p).servicePeriodFrom='2024-12-31';}],
  ['invalid actual payment day',p=>{payroll(p).paymentDate='2025-02-30';}],
  ['negative original payroll',p=>{payroll(p).wages='-1';}],
  ['semantic duplicate payment identity with reconciled totals',p=>{const first=payroll(p);first.wages='2500.01';first.ohioWithheld='83.36';const duplicate=structuredClone(first);duplicate.sourceId=' private- payroll-1 ';duplicate.sourceReference='Different label cannot create another original';p.facts.reciprocalWageSources.payrollRows.push(duplicate);}],
  ['missing actual payroll source ref',p=>{payroll(p).sourceReference='';}],
  ['missing actual corporate document date',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources.employerEntityOriginal,'documentDate');}],
  ['invalid actual corporate document day',p=>{p.facts.reciprocalWageSources.employerEntityOriginal.documentDate='2026-02-30';}],
  ['false actual service confirmation',p=>{p.facts.reciprocalWageSources.serviceOriginal.allCompensationOrdinaryOhioEmployeeServicesConfirmed=false;}],
  ['mismatched actual full service total',p=>{p.facts.reciprocalWageSources.serviceOriginal.totalCompensation='60000.24';}],
  ['actual nonreciprocal residence',p=>{p.facts.reciprocalWageSources.domicileOriginal.domicileState='VA';const period=owner(p).periods[0];if(!period)throw new Error('Actual original period required');period.domicileState='VA';}],
  ['raw Ohio wage allocation already removed',p=>{const amounts=owner(p).amounts;if(!amounts)throw new Error('Actual original allocation required');amounts.wages.nonresidentOhioAmount='0';}],
  ['missing actual account proof',p=>{Reflect.deleteProperty(p.input,'ohioPayments');}],
  ['false actual complete account proof',p=>{p.payments.allPaymentsIncludedConfirmed=false;}],
  ['retained explicit zero nonemployee source',p=>{p.input.form1099Nec=[{taxYear:2025,accountHolder:'primary',payer:'Independent actual retained zero NEC',nonemployeeCompensation:'0',federalWithheld:'0'}];rebindReciprocalOuter(p);}],
  ['retained explicit zero interest source',p=>{p.input.form1099Int=[{taxYear:2025,accountHolder:'primary',payer:'Independent actual retained zero bank',interestIncome:'0',usSavingsBondInterest:'0',federalWithheld:'0'}];rebindReciprocalOuter(p);}],
];
it.each(denied)('denies independently incomplete current source %s',(_name,mutate)=>{const p=reciprocalOhioWageFixture();mutate(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);});
it('binds a coherent independently supplied same-cash employer replacement',()=>{
  const old=reciprocalOhioWageFixture();const first=buildOhioResidentReturnInput(old.input,calculateFederalTax(old.input),{residency:old.facts});
  const p=reciprocalOhioWageFixture();const w2=reciprocalW2(p);w2.employer.name='Independently replaced actual ordinary corporation';
  p.facts.reciprocalWageSources.employerEntityOriginal.employerName=w2.employer.name;explicitlyReplaceReciprocalW2(p);const before=JSON.stringify(p);
  const next=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input),{residency:p.facts});
  expect(first.residencySourceDigest).toMatch(/^[0-9a-f]{64}$/);expect(next.residencySourceDigest).not.toBe(first.residencySourceDigest);expect(run(p).it1040.line26_refund.toString()).toBe('2001');expect(JSON.stringify(p)).toBe(before);
});
it.each(['otherDeductions','nonresidentCredit','residentCredit','ohioWithholding','estimatedPayments'])('denies independent financial overlay %s',field=>{const p=reciprocalOhioWageFixture();expect(()=>run(p,{[field]:'1'})).toThrow();});
it('denies a stale federal result despite equal source packet',()=>{const p=reciprocalOhioWageFixture();const federal=calculateFederalTax(p.input);federal.agi=federal.agi.plus('1');expect(()=>buildOhioResidentReturnInput(p.input,federal,{residency:p.facts})).toThrow();});

it.each(['useTax','refundableCredits','donations','creditCarryforward','latePaymentInterest'] as const)('denies changed cash projection retaining genuine adapted source context %s',field=>{
  const p=reciprocalOhioWageFixture();const adapted=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input),{residency:p.facts});
  const context=adapted.residencyReciprocalWageSource;if(!context)throw new Error('Actual genuine reciprocal source context required');
  const sourceCommitment=context.sourceCommitment;const residencyCommitment=adapted.residencySourceDigest;const paymentCommitment=adapted.paymentSourceDigest;
  expect(calculateOhioResidentReturn(adapted).it1040.line26_refund.toString()).toBe('2001');
  const changed={...adapted,[field]:'100'};
  expect(changed.residencyReciprocalWageSource).toBe(context);expect(context.sourceCommitment).toBe(sourceCommitment);expect(changed.residencySourceDigest).toBe(residencyCommitment);expect(changed.paymentSourceDigest).toBe(paymentCommitment);
  expect(()=>calculateOhioResidentReturn(changed)).toThrow();
});
