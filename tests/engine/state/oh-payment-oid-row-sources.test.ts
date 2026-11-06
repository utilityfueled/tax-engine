/** Spec: spec/state/guided-investment-source-year-oh-oid.yaml; original literals fixed before output. */
import {expect,it} from 'vitest';
import {buildOhioPaymentSource} from '@/engine/state/oh-payment-source.js';
import {calculateOhioScheduleOfWithholding} from '@/engine/state/oh-schedule-of-withholding.js';
import {actualOidStateRows,actualOidStateSource,ohioOidStateSourceFixture,rebindOidPaymentOriginals} from '../../fixtures/investment-source-year-oh-oid';
function first(input:ReturnType<typeof ohioOidStateSourceFixture>){const row=input.form1099OID[0];if(!row)throw new Error('Explicit synthetic OID original required');return row;}
it('Ohio actual OID payment evidence admits actual separate state rows without a scalar',()=>{
 for(const rows of [actualOidStateRows,[...actualOidStateRows].reverse()]){const input=ohioOidStateSourceFixture(rows),before=structuredClone(input);expect(first(input)).not.toHaveProperty('stateWithheld');expect(buildOhioPaymentSource(input,input.ohioPayments).estimatedPayments.toString()).toBe('0');expect(calculateOhioScheduleOfWithholding({form1099OIDs:input.form1099OID}).line6_totalOhioWithholding.toFixed(2)).toBe('10.11');expect(input).toEqual(before);}
});
it('Ohio OID known noOhio withholding uses complete original rows',()=>{
 for(const rows of [[],[{state:'OH',statePayerId:'',stateWithheld:'0'}],[{state:'PA',statePayerId:'ActualPA',stateWithheld:'99.99'}]]){const input=ohioOidStateSourceFixture(rows);expect(buildOhioPaymentSource(input,input.ohioPayments).estimatedPayments.toString()).toBe('0');expect(calculateOhioScheduleOfWithholding({form1099OIDs:input.form1099OID}).line6_totalOhioWithholding.toString()).toBe('0');}
});
it('Ohio OID original row withholding preserves cents beyond Number precision',()=>{
 const input=ohioOidStateSourceFixture([{state:'OH',statePayerId:'actual',stateWithheld:'9007199254740993.01'}]);input.form1099OID.push({...actualOidStateSource([{state:'OH',statePayerId:'actual2',stateWithheld:'0.02'}]),sourceId:'PRIVATE-SECOND-ACTUAL-OID'});rebindOidPaymentOriginals(input);
 expect(buildOhioPaymentSource(input,input.ohioPayments).estimatedPayments.toString()).toBe('0');expect(calculateOhioScheduleOfWithholding({form1099OIDs:input.form1099OID}).line6_totalOhioWithholding.toFixed(2)).toBe('9007199254740993.03');
});
it.each(['owner','missing-owner','year','missing-year','missing-rows','unverified','missing-id','negative-other-state','unknown-other-state','duplicate-states','extra-state','nonfinite','duplicate-source'] as const)('Ohio actual OID source rejects unresolved %s',kind=>{
 const input=ohioOidStateSourceFixture(),source=first(input);
 if(kind==='owner')source.accountHolder='spouse';if(kind==='missing-owner')delete source.accountHolder;if(kind==='year')source.taxYear=2024;if(kind==='missing-year')delete source.taxYear;
 if(kind==='missing-rows')delete source.stateWithholding;if(kind==='unverified'){delete source.sourceFormRevision;delete source.sourceFactsConfirmed;}
 if(kind==='missing-id')Reflect.deleteProperty(source.stateWithholding?.[0]??{},'statePayerId');
 if(kind==='negative-other-state')source.stateWithholding=[{state:'PA',statePayerId:'actual',stateWithheld:'-0.01'}];
 if(kind==='unknown-other-state')source.stateWithholding=[{state:'ZZ',statePayerId:'actual',stateWithheld:'1'}];
 if(kind==='duplicate-states')source.stateWithholding=[actualOidStateRows[0],actualOidStateRows[0]];
 if(kind==='extra-state')source.stateWithholding=[...actualOidStateRows,{state:'NY',statePayerId:'actual',stateWithheld:'1'}];
 if(kind==='nonfinite')source.stateWithholding=[{state:'OH',statePayerId:'actual',stateWithheld:'Infinity'}];
 if(kind==='duplicate-source')input.form1099OID.push(structuredClone(source));rebindOidPaymentOriginals(input);
 expect(()=>buildOhioPaymentSource(input,input.ohioPayments)).toThrow();
});
it('Ohio OID original edits require fresh bound account originals and preserve private source strings',()=>{
 const input=ohioOidStateSourceFixture();first(input).payer='Changed same-money OID original';const before=structuredClone(input);expect(()=>buildOhioPaymentSource(input,input.ohioPayments)).toThrow(/snapshot/);expect(input).toEqual(before);expect(JSON.stringify(input)).toContain('PRIVATE-ACTUAL-PA-ID');
});
