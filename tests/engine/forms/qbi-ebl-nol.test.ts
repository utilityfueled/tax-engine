// Spec: spec/federal/qbi-ebl-nol.yaml.
import { expect, it } from 'vitest';
import { calculateQbiEblNol } from '@/engine/forms/qbi-ebl-nol.js';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss.js';
import { actualEblNolInput } from '../../fixtures/qbi-ebl-nol.js';
import { d } from '@/utils/decimal.js';
function completed(input=actualEblNolInput()) {
  return calculateNetOperatingLoss({taxYear:2025,filingStatus:input.taxpayer.filingStatus,taxpayer:input.taxpayer,facts:input.netOperatingLoss!,context:{
    taxableIncomeWithoutNolQbiAndSection250:d('37500'),modifiedTaxableIncomeWithoutNolQbiAndSection250:d('50000'),
    carryoverContexts:[{sourceId:'loss2021',priorNolDeductions:d('0'),modifiedTaxableIncomeBeforeTwentyPercentReduction:d('50000')}],
  }});
}
it('binds qualified EBL history to the original regular NOL without changing sources',()=>{
  const input=actualEblNolInput(),before=JSON.stringify(input),result=calculateQbiEblNol(input);
  expect(result.sourceFactsVerified).toBe(true);expect(result.calculationComplete).toBe(false);
  expect(result.vintages[0].qualifiedOpeningCarryforward.toFixed()).toBe('60000');
  expect(JSON.stringify(input)).toBe(before);
});
it('separates actual deduction from modified absorption and preserves immutable replay',()=>{
  const input=actualEblNolInput(),regular=completed(input),before=JSON.stringify({input,regular});
  const result=calculateQbiEblNol(input,{regular});
  expect(result.currentQualifiedDeduction.toFixed()).toBe('24000');
  expect(result.vintages.map(row=>[row.deduction?.toFixed(),row.qualifiedDeduction?.toFixed(),row.absorbed?.toFixed(),row.qualifiedAbsorbed?.toFixed(),row.remainingCarryforward?.toFixed(),row.qualifiedRemainingCarryforward?.toFixed()])).toEqual([['30000','24000','40000','32000','35000','28000']]);
  expect(calculateQbiEblNol(input,{regular})).toEqual(result);
  expect(JSON.stringify({input,regular})).toBe(before);
});
it('keeps current COD reduction separate and rejects an unestablished mixed allocation',()=>{
  const input=actualEblNolInput(),regular=completed(input),cod={sourceId:'loss2021',lossTaxYear:2021,originalLoss:d('100000'),beforeReduction:d('35000'),attributeReduction:d('10000'),expiredAfterReduction:d('0'),remainingCarryforward:d('25000')};
  expect(()=>calculateQbiEblNol(input,{regular,codVintages:[cod]})).toThrow(/mixed.*attribute|allocation method/i);
  const full=calculateQbiEblNol(input,{regular,codVintages:[{...cod,attributeReduction:d('35000'),remainingCarryforward:d('0')}]});
  expect(full.currentQualifiedDeduction.toFixed()).toBe('24000');expect(full.vintages[0].qualifiedAttributeReduction?.toFixed()).toBe('28000');
  expect(full.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('0');
  const history=input.qbiLossSources!.excessBusinessLossHistories![0];
  history.originalQualifiedLoss='100000';history.qualifiedOpeningCarryforward='75000';history.history![0].qualifiedNolAbsorption='20000';history.history![0].qualifiedAttributeReduction='5000';
  const all=calculateQbiEblNol(input,{regular,codVintages:[cod]});
  expect(all.currentQualifiedDeduction.toFixed()).toBe('30000');expect(all.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('25000');
});
it('rejects missing or contradictory histories and stale canonical balances',()=>{
  const absent=actualEblNolInput();delete absent.qbiLossSources!.excessBusinessLossHistories;
  expect(()=>calculateQbiEblNol(absent)).toThrow(/complete.*history|histories/i);
  const duplicate=actualEblNolInput();duplicate.qbiLossSources!.excessBusinessLossHistories!.push(structuredClone(duplicate.qbiLossSources!.excessBusinessLossHistories![0]));
  expect(()=>calculateQbiEblNol(duplicate)).toThrow(/once|duplicate|history/i);
  const stale=actualEblNolInput();stale.netOperatingLoss!.vintages![0].sourceReference='Replacement equal-money loss';
  expect(()=>calculateQbiEblNol(stale)).toThrow(/snapshot|original.*source/i);
  const invalid=actualEblNolInput();invalid.qbiLossSources!.excessBusinessLossHistories![0].history![0].qualifiedAttributeReduction='5001';
  expect(()=>calculateQbiEblNol(invalid)).toThrow(/character|history|reconcile/i);
  const input=actualEblNolInput(),regular=completed(input);regular.vintages[0].deduction=d('80000');
  expect(()=>calculateQbiEblNol(input,{regular})).toThrow(/canonical|conserve/i);
  const owner=actualEblNolInput();owner.qbiLossSources!.excessBusinessLossHistories![0].recipientName='Other taxpayer';
  expect(()=>calculateQbiEblNol(owner)).toThrow(/identity|owner/i);
});
