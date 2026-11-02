// Spec: spec/federal/k1-form461-classification.yaml#profitable-c-k1-proof.
import {expect,it} from 'vitest';
import {calculateCK1NecReceiptSources} from '@/engine/forms/c-k1-nec-receipt-sources.js';
import {calculateK1Form461Classification} from '@/engine/forms/k1-form461-classification.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {FEDERAL_2026_CONSTANTS} from '@/models/federal-2026-indexed.js';
import {d} from '@/utils/decimal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {cK1NecFixture,cK1OrdinaryFixture} from '../../fixtures/c-k1-ordinary.js';
it('requires actual C proof and preserves K1-only and loss boundaries',()=>{
 const baseline=cK1OrdinaryFixture();
 for(const patch of [{businessNameStatus:undefined},{businessEINStatus:undefined},{businessNameStatus:'blank_original' as const},{businessEINStatus:'not_issued' as const},{sourceTaxYear:2024},{sourceReference:''},{sourceFactsConfirmed:undefined},{sourceFactsConfirmed:false},{accountHolder:'spouse' as const},{businessName:'Other'},{businessEIN:'98-7654321'},{recipientName:'Other'},{recipientTaxpayerIdLast4:'9999'},{allIncomeDomesticConfirmed:undefined},{allIncomeDomesticConfirmed:false},{ordinaryBusinessOnlyConfirmed:false}]){
  const input=structuredClone(baseline);Object.assign(input.qbiLossSources!.form461Classification!.scheduleCSource!,patch);expect(()=>calculateFederalTax(input)).toThrow(/classification|source|ordinary|ScheduleC|proof/i);
 }
 for(const mutate of [(i:typeof baseline)=>{delete i.qbiLossSources!.form461Classification!.scheduleCSource;},(i:typeof baseline)=>{i.qbiLossSources!.form461Classification!.method='ordinary_k1_only';},(i:typeof baseline)=>{i.scheduleC!.grossReceipts='-1';},(i:typeof baseline)=>{i.scheduleK1[0].ordinaryIncome='-1';i.qbiLossSources!.activities![0].statement!.ordinaryIncome='-1';}]){const input=structuredClone(baseline);mutate(input);expect(()=>calculateFederalTax(input)).toThrow();}
 const changed=structuredClone(baseline);changed.scheduleC!.grossReceipts='50000';delete changed.form2210;const r=calculateFederalTax(changed);expect(r.form461!.line2ScheduleC.toFixed()).toBe('50000');
});

it('accepts an explicitly known blank sole proprietor name and no EIN without inventing identifiers',()=>{
 const input=cK1OrdinaryFixture(),proof=input.qbiLossSources!.form461Classification!.scheduleCSource!;
 delete input.scheduleC!.businessName;delete input.scheduleC!.ein;Object.assign(proof,{businessNameStatus:'blank_original',businessEINStatus:'not_issued'});delete proof.businessName;delete proof.businessEIN;
 const before=JSON.stringify(input),r=calculateFederalTax(input);expect(r.form461!.line2ScheduleC.toFixed()).toBe('40000');expect(r.totalTax.toFixed()).toBe('41851');expect(JSON.stringify(input)).toBe(before);
 const contradiction=structuredClone(input);contradiction.scheduleC!.ein='12-1111111';expect(()=>calculateFederalTax(contradiction)).toThrow(/source|identity|classification|ScheduleC/i);
});

it('calculates isolated 2026 sources while preserving the full return readiness gate',()=>{
 const original=cK1OrdinaryFixture();
 const retax=(value:unknown,key=''):unknown=>Array.isArray(value)?value.map(item=>retax(item)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,retax(v,k)])):(key==='sourceTaxYear'||key==='taxYear')&&typeof value==='number'?value+1:value;
 const raw=retax(original) as typeof original;raw.taxpayer.taxYear=2026;delete raw.form2210;const input=TaxYearInputSchema.parse(raw);
 const r=calculateK1Form461Classification(input,{scheduleE:calculateScheduleE(input),scheduleCNetProfit:d('40000'),capitalGainOrLoss:d(0),deductibleSETax:d('3883'),seHealthInsurance:d(0),seRetirementContributions:d(0)},FEDERAL_2026_CONSTANTS)!;
 expect([r.form461.line14NetBusinessAmount,r.form461.line15Threshold,r.form461.line16NetAfterThreshold,r.form461.line16ExcessBusinessLoss].map(x=>x.toFixed())).toEqual(['76117','512000','588117','0']);
 expect(()=>calculateFederalTax(input)).toThrow(/2026|complete|verified|ready|readiness|gate/i);
});

it('rejects unlinked nonzero NEC while preserving explicit zero sources',()=>{
 const source={taxYear:2025,payer:'Different actual business payer',accountHolder:'primary' as const,nonemployeeCompensation:'100000',federalWithheld:'0',stateWithheld:'0'};
 const input=cK1OrdinaryFixture();input.form1099Nec=[source];expect(()=>calculateFederalTax(input)).toThrow(/source|business|classification|ordinary/i);
 const zero=cK1OrdinaryFixture();zero.form1099Nec=[{...source,nonemployeeCompensation:'0'}];expect(calculateFederalTax(zero).totalTax.toFixed()).toBe('41851');
});

it('rejects missing stale duplicate and unreconciled actual NEC receipt sources',()=>{
 const base=cK1NecFixture();
 for(const mutate of [(i:typeof base)=>{delete i.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts;},(i:typeof base)=>{i.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.otherGrossReceiptsNotOnNec='14999.91';},(i:typeof base)=>{delete i.form1099Nec[0].taxYear;},(i:typeof base)=>{i.form1099Nec[0].payer='Other actual payer';},(i:typeof base)=>{i.form1099Nec[0].payerTin='98-7654321';},(i:typeof base)=>{const p=i.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;p.rows!.push(structuredClone(p.rows![0]));},(i:typeof base)=>{i.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows=[];}]){const input=structuredClone(base);mutate(input);expect(()=>calculateFederalTax(input)).toThrow(/NEC|receipt|source|business|classif/i);}
 for(const patch of [{payerTinStatus:undefined},{sourceReference:''},{sourceTaxYear:2024},{sourceFactsConfirmed:undefined},{sameBusinessConfirmed:undefined},{includedOnceConfirmed:false},{currentOriginalNoCorrectionsOrVoidsConfirmed:undefined},{allUnmodeledBoxesZeroOrBlankConfirmed:undefined},{original:undefined}]){const input=structuredClone(base);Object.assign(input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0],patch);expect(()=>calculateFederalTax(input)).toThrow(/NEC|receipt|source|business|classif/i);}
 const duplicate=cK1NecFixture();delete duplicate.form2210;duplicate.form1099Nec.push(structuredClone(duplicate.form1099Nec[0]));duplicate.scheduleC!.grossReceipts='65000.10';const packet=duplicate.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Different reference for identical original'});expect(()=>calculateFederalTax(duplicate)).toThrow(/duplicate|original|NEC/i);
 const presentation=structuredClone(duplicate);Object.assign(presentation.form1099Nec[1],{payer:'  ACTUAL  ORDINARY CLIENT ',payerTin:'12 4444444',nonemployeeCompensation:'25000.100'});presentation.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![1].original={...presentation.form1099Nec[1]};expect(()=>calculateFederalTax(presentation)).toThrow(/duplicate|original|NEC/i);
 const blank=cK1NecFixture(),row=blank.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0];delete blank.form1099Nec[0].payerTin;delete row.original!.payerTin;row.payerTinStatus='blank_original';expect(calculateFederalTax(blank).totalTax.toFixed()).toBe('41851');
});

it('binds reordered distinct originals and retains every zero Box1 source',()=>{
 const input=cK1NecFixture(),packet=input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!,first=input.form1099Nec[0];first.nonemployeeCompensation='10000.03';const second={...first,payer:'Second actual ordinary client',payerTin:'12-5555555',nonemployeeCompensation:'15000.07'};input.form1099Nec.push(second);packet.rows![0].original={...first};packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Second actual original',original:{...second}});packet.rows!.reverse();expect(calculateFederalTax(input).totalTax.toFixed()).toBe('41851');
 const stale=structuredClone(input);stale.form1099Nec.reverse();expect(()=>calculateFederalTax(stale)).toThrow(/source|snapshot|NEC/i);
 const zero={...second,payer:'Actual zero statement',nonemployeeCompensation:'0'};input.form1099Nec.push(zero);expect(()=>calculateFederalTax(input)).toThrow(/complete|NEC|source/i);packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:2',sourceReference:'Actual zero original',original:{...zero}});expect(calculateFederalTax(input).totalTax.toFixed()).toBe('41851');
 const duplicate=cK1NecFixture();delete duplicate.form2210;delete duplicate.form1099Nec[0].payerTin;const copy={...duplicate.form1099Nec[0],payerTin:''};duplicate.form1099Nec.push(copy);duplicate.scheduleC!.grossReceipts='65000.10';const p=duplicate.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;p.rows![0].payerTinStatus='blank_original';p.rows![0].original={...duplicate.form1099Nec[0]};p.rows!.push({...structuredClone(p.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Different reference same blank TIN original',original:{...copy}});expect(()=>calculateFederalTax(duplicate)).toThrow(/duplicate|original|NEC/i);
});

it('rejects negative monetary and extra contradictory original NEC facts',()=>{
 for(const key of ['federalWithheld','stateWithheld','stateIncome'] as const){const input=cK1NecFixture();input.form1099Nec[0][key]='-1';input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].original={...input.form1099Nec[0]};expect(()=>calculateCK1NecReceiptSources(input)).toThrow(/NEC|negative|nonnegative|original/i);}
 const extra=cK1NecFixture();extra.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].original!.corrected=true;expect(()=>calculateCK1NecReceiptSources(extra)).toThrow(/NEC|snapshot|original/i);
});

it('rejects malformed reported payer TIN while preserving actual original blank',()=>{
 for(const payerTin of ['unknown','12345678','12345678x']){const input=cK1NecFixture();input.form1099Nec[0].payerTin=payerTin;input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].original={...input.form1099Nec[0]};expect(()=>calculateCK1NecReceiptSources(input)).toThrow(/TIN|original|NEC/i);}
});

it('rejects duplicate originals differing only by empty or reordered occupation arrays',()=>{
 for(const year of [2025,2026] as const)for(const [firstCodes,secondCodes] of [[undefined,[]],[['101','201'],['201','101']]] as [string[]|undefined,string[]][]) {
  const input=cK1NecFixture(),first=input.form1099Nec[0];input.taxpayer.taxYear=year;first.taxYear=year;first.nonemployeeCompensation='12500.05';first.treasuryTippedOccupationCodes=firstCodes;const second={...first,treasuryTippedOccupationCodes:secondCodes};input.form1099Nec.push(second);const packet=input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;packet.sourceTaxYear=year;packet.rows![0].sourceTaxYear=year;packet.rows![0].original={...first};packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Different reference identical actual original',original:{...second}});expect(()=>calculateCK1NecReceiptSources(input)).toThrow(/duplicate|original|NEC/i);
 }
});
it('preserves rejection of repeated raw NEC occupation codes without weakening the source schema',()=>{
 const input=cK1NecFixture();input.form1099Nec[0].treasuryTippedOccupationCodes=['101','101'];input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!.rows![0].original={...input.form1099Nec[0]};expect(()=>calculateCK1NecReceiptSources(input)).toThrow(/snapshot|original|NEC/i);
});

it('rejects duplicate 2025 paper originals differing only by supplemental compensation metadata',()=>{
 for(const change of [{treasuryTippedOccupationCodes:['201']},{cashTips:'1'},{qualifiedOvertimeCompensation:'1'}]) {
  const input=cK1NecFixture(),first=input.form1099Nec[0];first.nonemployeeCompensation='12500.05';first.treasuryTippedOccupationCodes=['101'];const second={...first,...change};input.form1099Nec.push(second);const packet=input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;packet.rows![0].original={...first};packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Distinct reference same 2025 paper original',original:{...second}});expect(()=>calculateCK1NecReceiptSources(input)).toThrow(/duplicate|original|NEC/i);
 }
});

it('retains actual 2026 printed compensation boxes in isolated original identity without opening readiness',()=>{
 const input=cK1NecFixture(),first=input.form1099Nec[0];input.taxpayer.taxYear=2026;first.taxYear=2026;first.nonemployeeCompensation='12500.05';first.treasuryTippedOccupationCodes=['101'];const second={...first,treasuryTippedOccupationCodes:['201']};input.form1099Nec.push(second);const packet=input.qbiLossSources!.form461Classification!.scheduleCSource!.necReceipts!;packet.sourceTaxYear=2026;packet.rows![0].sourceTaxYear=2026;packet.rows![0].original={...first};packet.rows!.push({...structuredClone(packet.rows![0]),necSourceId:'form1099Nec:1',sourceReference:'Actual different printed occupation box original',original:{...second}});expect(calculateCK1NecReceiptSources(input)!.grossReceipts.toFixed()).toBe('40000');
});
