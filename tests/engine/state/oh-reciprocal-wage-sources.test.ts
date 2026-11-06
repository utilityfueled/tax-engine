import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
/** Spec: spec/state/oh-reciprocal-wage-sources.yaml. Existing APIs only before product. */
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {reciprocalOhioWageFixture,reciprocalW2,rebindReciprocalOuter,explicitlyReplaceReciprocalW2,type ReciprocalOhioWagePacket} from '../../fixtures/oh-reciprocal-wage-sources.js';
function run(packet:ReciprocalOhioWagePacket,overlay:Record<string,unknown>={}){
  return calculateOhioResidentReturnFromFederal({taxInput:packet.input,federalResult:calculateFederalTax(packet.input),overlay:{residency:packet.facts,...overlay}});
}
function firstPayroll(packet:ReciprocalOhioWagePacket){const row=packet.facts.reciprocalWageSources.payrollRows[0];if(!row)throw new Error('Fixture requires actual payroll');return row;}
function sourceLine(result:ReturnType<typeof run>){const value:unknown=Reflect.get(result.scheduleOfAdjustments,'line14_reciprocityWages');if(!Decimal.isDecimal(value))throw new Error('Canonical result must expose actual2025 deduction line14');return value;}
it.each(['second','first'] as const)('computes actual reciprocal withholding refund with Ohio row %s',position=>{
  const packet=reciprocalOhioWageFixture('60000.25','2000.60',position==='first');const before=JSON.stringify(packet);const precision=Decimal.precision;
  const rows=packet.facts.reciprocalWageSources.payrollRows;
  expect(rows.reduce((sum,row)=>sum.plus(row.wages),new Decimal(0)).toString()).toBe('60000.25');
  expect(rows.reduce((sum,row)=>sum.plus(row.ohioWithheld),new Decimal(0)).toString()).toBe('2000.6');
  expect(reciprocalW2(packet).wages).toBe('60000.25');
  expect(calculateFederalTax(packet.input).agi.toString()).toBe('60000.25');
  const result=run(packet);expect(sourceLine(result).toString()).toBe('60000');
  expect(result.scheduleOfAdjustments.line47_totalDeductions.toString()).toBe('60000');
  expect(result.it1040.line1_federalAgi.toString()).toBe('60000');
  expect(result.it1040.line3_ohioAgi.toString()).toBe('0');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');
  expect(result.it1040.line14_ohioWithholding.toString()).toBe('2001');expect(result.it1040.line26_refund.toString()).toBe('2001');
  expect(result.nonresidentCreditResult?.line1.toString()).toBe('0');expect(result.nonresidentCreditResult?.line8.toString()).toBe('0');expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');
  expect(result.residentCredit).toBeNull();
  expect(JSON.stringify(result.lines)).not.toContain(packet.input.taxpayer.primary.ssn);
  expect(JSON.stringify(result.lines)).not.toContain('PRIVATE-PAYROLL-');expect(JSON.stringify(packet)).toBe(before);expect(Decimal.precision).toBe(precision);
});
it.each([['60000.49','2000.49','60000','2000'],['60000.50','2000.50','60001','2001'],['60000.25','0','60000','0']] as const)('preserves raw original wage %s and withholding %s at the printed boundary',(wages,wh,reportedWages,reportedWH)=>{
  const packet=reciprocalOhioWageFixture(wages,wh);const before=JSON.stringify(packet);const result=run(packet);
  expect(reciprocalW2(packet).wages).toBe(wages);expect(sourceLine(result).toString()).toBe(reportedWages);
  expect(result.it1040.line1_federalAgi.toString()).toBe(reportedWages);expect(result.it1040.line3_ohioAgi.toString()).toBe('0');
  expect(result.it1040.line14_ohioWithholding.toString()).toBe(reportedWH);expect(result.it1040.line26_refund.toString()).toBe(reportedWH);expect(JSON.stringify(packet)).toBe(before);
});
const negatives:[string,(p:ReciprocalOhioWagePacket)=>void][]=[
  ['unconfirmed',p=>{Reflect.set(p.facts.reciprocalWageSources,'sourceFactsConfirmed',false);}],
  ['unknown-inventory',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'allIncomeOriginalsIncludedConfirmed');}],
  ['unknown-other-income',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'noOtherIncomeOrAdjustmentsConfirmed');}],
  ['wrong-year',p=>{p.facts.reciprocalWageSources.sourceTaxYear=2026;}],
  ['spouse-owner',p=>{p.facts.reciprocalWageSources.accountHolder='spouse';}],
  ['wrong-original-owner',p=>{p.facts.reciprocalWageSources.originalTaxpayer.ssn='900-70-0622';}],
  ['stale-current-employer',p=>{reciprocalW2(p).employer.name='Different actual same-dollar employer';rebindReciprocalOuter(p);}],
  ['unknown-Box8',p=>{Reflect.deleteProperty(reciprocalW2(p),'allocatedTips');explicitlyReplaceReciprocalW2(p);}],
  ['unknown-Ohio-withholding',p=>{const source=reciprocalW2(p).stateLocalSources;if(!source)throw new Error('Actual packet required');const row=source.stateRows.find(r=>r.state==='OH');if(!row)throw new Error('Actual OH row required');Reflect.deleteProperty(row,'withheld');explicitlyReplaceReciprocalW2(p);}],
  ['missing-W2-year',p=>{Reflect.deleteProperty(reciprocalW2(p),'taxYear');explicitlyReplaceReciprocalW2(p);}],
  ['missing-entity-proof',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources,'employerEntityOriginal');}],
  ['unknown-entity-method',p=>{Reflect.set(p.facts.reciprocalWageSources.employerEntityOriginal,'notPassThroughOrPEOConfirmed',false);}],
  ['PTE-owner-exception',p=>{p.facts.reciprocalWageSources.employerEntityOriginal.entityType='pass_through_20_percent_owner';}],
  ['payroll-sum',p=>{firstPayroll(p).wages='5000.01';}],
  ['payroll-WH-sum',p=>{firstPayroll(p).ohioWithheld='166.71';}],
  ['missing-payroll',p=>{p.facts.reciprocalWageSources.payrollRows=[];}],
  ['duplicate-payroll',p=>{p.facts.reciprocalWageSources.payrollRows.push(structuredClone(firstPayroll(p)));}],
  ['semantic-duplicate-payroll',p=>{const row=structuredClone(firstPayroll(p));row.sourceId='  private- payroll-1 ';p.facts.reciprocalWageSources.payrollRows.push(row);}],
  ['invalid-payroll-date',p=>{firstPayroll(p).paymentDate='2025-02-30';}],
  ['payroll-owner',p=>{firstPayroll(p).accountHolder='spouse';}],
  ['payroll-year',p=>{firstPayroll(p).sourceTaxYear=2026;}],
  ['outside-Ohio-services',p=>{firstPayroll(p).serviceState='VA';}],
  ['unknown-ordinary-services',p=>{Reflect.deleteProperty(p.facts.reciprocalWageSources.serviceOriginal,'allCompensationOrdinaryOhioEmployeeServicesConfirmed');}],
  ['domicile-original-mismatch',p=>{p.facts.reciprocalWageSources.domicileOriginal.domicileState='VA';}],
  ['domicile-gap',p=>{const owner=p.facts.owners[0];if(!owner)throw new Error('Owner required');const period=owner.periods[0];if(!period)throw new Error('Period required');period.from='2025-01-02';}],
  ['actual-Ohio-domicile',p=>{const owner=p.facts.owners[0];if(!owner)throw new Error('Owner required');const period=owner.periods[0];if(!period)throw new Error('Period required');period.domicileState='OH';}],
  ['raw-owner-allocation',p=>{const owner=p.facts.owners[0];if(!owner?.amounts)throw new Error('Amounts required');owner.amounts.wages.nonresidentOhioAmount='1';}],
  ['missing-original-snapshot',p=>{Reflect.deleteProperty(p.facts,'originalFederalSources');}],
  ['unknown-account-history',p=>{Reflect.set(p.payments,'allPaymentsIncludedConfirmed',false);}],
  ['actual-tax-payment-contradiction',p=>{p.payments.remainingTaxPayment={status:'expected_payment',sourceReference:'Explicit contradictory requested payment',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'100'};}],
];
it.each(negatives)('rejects incomplete or conflicting reciprocal original %s',(_name,mutate)=>{const p=reciprocalOhioWageFixture();mutate(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);});
it.each(['zeroSSA','cancelledSSA-RRB','zeroINT','otherNEC'] as const)('rejects retained unsupported original composition %s',kind=>{
  const p=reciprocalOhioWageFixture();
  if(kind==='zeroSSA'||kind==='cancelledSSA-RRB')p.input.formSSA1099=[{recipient:'Explicit separate fictional SSA',netBenefits:kind==='zeroSSA'?'0':'100',federalWithheld:'0'}];
  if(kind==='cancelledSSA-RRB')p.input.formRRB1099=[{recipient:'Explicit separate fictional RRB',netSocialSecurityEquivalentBenefitPortion:'-100',federalWithheld:'0'}];
  if(kind==='zeroINT')p.input.form1099Int=[{taxYear:2025,accountHolder:'primary',payer:'Actual separate zero original',interestIncome:'0',usSavingsBondInterest:'0',federalWithheld:'0'}];
  if(kind==='otherNEC')p.input.form1099Nec=[{taxYear:2025,accountHolder:'primary',payer:'Actual separate nonemployee original',nonemployeeCompensation:'100',federalWithheld:'0'}];
  rebindReciprocalOuter(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);
});
it('binds an explicit same-money original replacement without mutating inputs',()=>{
  const first=reciprocalOhioWageFixture();const before=buildOhioResidentReturnInput(first.input,calculateFederalTax(first.input),{residency:first.facts});
  const changed=reciprocalOhioWageFixture();const wages=reciprocalW2(changed);wages.employer.name='Explicit replacement current fictional corporate employer';
  changed.facts.reciprocalWageSources.employerEntityOriginal.employerName=wages.employer.name;explicitlyReplaceReciprocalW2(changed);const saved=JSON.stringify(changed);
  const after=buildOhioResidentReturnInput(changed.input,calculateFederalTax(changed.input),{residency:changed.facts});
  expect(before.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);expect(after.residencySourceDigest).not.toBe(before.residencySourceDigest);
  expect(run(changed).it1040.line26_refund.toString()).toBe('2001');expect(JSON.stringify(changed)).toBe(saved);
});
it('retains the existing raw reciprocal compensation guard without exemption proof',()=>{const p=reciprocalOhioWageFixture();Reflect.deleteProperty(p.facts,'reciprocalWageSources');expect(()=>run(p)).toThrow(/actual reciprocal-period Ohio compensation requires its separate exemption allocation sources/);});
it('preserves public2026 federal rulepack denial',()=>{
  const packet=reciprocalOhioWageFixture();
  // Separately authored fictional2026 federal originals; 2025 Ohio source facts
  // remain in the original packet and cannot qualify a2026 state calculation.
  const {ohioResidency:_residency,ohioPayments:_payments,...input}=structuredClone(packet.input);
  input.taxpayer.taxYear=2026;
  const w2=input.w2s[0];if(!w2?.stateLocalSources)throw new Error('Fixture requires actual current W2 rows');
  w2.taxYear=2026;w2.stateLocalSources.sourceTaxYear=2026;
  const {stateLocalSources:_rows,...original}=w2;
  w2.stateLocalSources.originalW2=structuredClone(original);
  const before=JSON.stringify(input);
  expect(()=>calculateFederalTax(input)).toThrow(/Tax year 2026 rule pack .* is incomplete; calculation is unavailable/);
  expect(JSON.stringify(input)).toBe(before);expect(packet.input.taxpayer.taxYear).toBe(2025);
});
it('retains the earlier actual W2-year mismatch denial without source repair',()=>{
  const packet=reciprocalOhioWageFixture();packet.input.taxpayer.taxYear=2026;const before=JSON.stringify(packet);
  expect(()=>calculateFederalTax(packet.input)).toThrow('W-2 actual row sources: confirm actual selected owner, original index and supported source year');
  expect(JSON.stringify(packet)).toBe(before);
});
it.each(['otherDeductions','nonresidentCredit','residentCredit','estimatedPayments','ohioWithholding'] as const)('rejects a bare reciprocal return override %s',field=>{const p=reciprocalOhioWageFixture();const before=JSON.stringify(p);expect(()=>run(p,{[field]:field==='otherDeductions'?'60000.25':'1'})).toThrow();expect(JSON.stringify(p)).toBe(before);});

// RepairV2 additive controls: first48 prior bodies remain byte-exact.
it.each(['amendedPriorOverpayment','underpaymentPenalty','refundableHistoricPreservationCredit','refundableJobCreationCredit','passThroughEntityCredit','refundableMotionPictureCredit','filmTheaterCapitalImprovementCredit','ventureCapitalCredit'] as const)('denies additional unbound cash projection retaining genuine adapted context %s',field=>{
  const packet=reciprocalOhioWageFixture();const before=JSON.stringify(packet);
  const adapted=buildOhioResidentReturnInput(packet.input,calculateFederalTax(packet.input),{residency:packet.facts});
  const context=adapted.residencyReciprocalWageSource;if(!context)throw new Error('Actual genuine reciprocal source context required');
  expect(calculateOhioResidentReturn(adapted).it1040.line26_refund.toString()).toBe('2001');
  const changed={...adapted,[field]:'100'};
  expect(changed.residencyReciprocalWageSource).toBe(context);expect(changed.paymentSourceDigest).toBe(adapted.paymentSourceDigest);expect(changed.residencySourceDigest).toBe(adapted.residencySourceDigest);
  expect(()=>calculateOhioResidentReturn(changed)).toThrow();expect(JSON.stringify(packet)).toBe(before);
});
type AdaptedReciprocalReturn=ReturnType<typeof buildOhioResidentReturnInput>;
const changedPaymentMetadata:[string,(input:AdaptedReciprocalReturn)=>void][]=[
  ['payment commitment',input=>{input.paymentSourceDigest='f'.repeat(64);}],
  ['residency commitment',input=>{input.residencySourceDigest='e'.repeat(64);}],
  ['valuation date',input=>{input.paymentTiming={kind:'expected',valuationDate:'2026-04-14',asOfDate:'2026-04-01'};}],
  ['actual as-of',input=>{input.paymentTiming={kind:'expected',valuationDate:'2026-04-15',asOfDate:'2026-04-02'};}],
  ['timing kind',input=>{input.paymentTiming={kind:'filed',valuationDate:'2026-04-15',asOfDate:'2026-04-01'};}],
  ['missing chronology',input=>{delete input.paymentTiming;}],
  ['remaining tax coverage',input=>{input.paymentTaxCoverage={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'100'};}],
  ['payment method',input=>{input.paymentMethodVersion='ohio-it1040-actual-dated-payment-sources-v1';}],
  ['penalty method',input=>{input.computeUnderpaymentPenalty=false;}],
  ['prior liability',input=>{input.priorYearTaxLiability='100';}],
  ['prior timeliness',input=>{input.priorYearTimelyFiled=true;}],
  ['quarter schedule',input=>{input.estimatedPaymentSchedule=[{date:'2025-04-15',amount:new Decimal('100')}];}],
];
it.each(changedPaymentMetadata)('denies changed finite payment identity or chronology %s',(_name,mutate)=>{
  const packet=reciprocalOhioWageFixture();const before=JSON.stringify(packet);
  const adapted=buildOhioResidentReturnInput(packet.input,calculateFederalTax(packet.input),{residency:packet.facts});
  const context=adapted.residencyReciprocalWageSource;if(!context)throw new Error('Actual genuine reciprocal source context required');
  expect(calculateOhioResidentReturn(adapted).it1040.line26_refund.toString()).toBe('2001');
  const changed={...adapted};mutate(changed);expect(changed.residencyReciprocalWageSource).toBe(context);
  expect(()=>calculateOhioResidentReturn(changed)).toThrow();expect(JSON.stringify(packet)).toBe(before);
});
