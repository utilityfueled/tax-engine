// Spec: spec/federal/foreign-tax-ordinary-credit.yaml,6251-transfer.
import {expect,it} from 'vitest';
import {calculateForm6251,type Form6251Input} from '@/engine/forms/form-6251.js';
import {getConstants} from '@/models/constants.js';
import {d} from '@/utils/decimal.js';
it('uses separate ordinary regular and AMT credits without a direct election cap',()=>{
  const input:Form6251Input={taxableIncome:d('200000'),saltDeduction:d('10000'),regularTax:d('30000'),filingStatus:'single',isItemizing:true,
    ordinaryForeignTaxCredits:{regular:d('900'),amt:d('700')}};
  const result=calculateForm6251(input,getConstants(2025));
  const line=(id:string)=>result.lines.find(row=>row.line===id)?.value.toFixed();
  expect(line('7')).toBe('31694');expect(line('8')).toBe('700');expect(line('9')).toBe('30994');expect(line('10')).toBe('29100');expect(result.amt.toFixed()).toBe('1894');
  const noAmt=calculateForm6251({...input,regularTax:d('40000')},getConstants(2025));
  expect(noAmt.lines.find(row=>row.line==='8')?.value.toFixed()).toBe('700');expect(noAmt.tentativeMinimumTax.toFixed()).toBe('30994');expect(noAmt.amt.toFixed()).toBe('0');
  for(const credits of[{regular:d('30001'),amt:d('700')},{regular:d('900'),amt:d('31695')},{regular:d('-1'),amt:d('0')},{regular:d('900.01'),amt:d('0')},{regular:d('0'),amt:d('NaN')}]){
    expect(()=>calculateForm6251({...input,ordinaryForeignTaxCredits:credits},getConstants(2025))).toThrow(/credit|actual/i);
  }
  expect(()=>calculateForm6251({...input,directCreditElectionForeignTaxCredit:d('100')},getConstants(2025))).toThrow(/method|election|credit/i);
});
