// Spec: spec/federal/qbi-ebl-nol.yaml.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualEblNolInput } from '../fixtures/qbi-ebl-nol.js';
import { k1QbiLossSourceInput } from '../fixtures/k1-qbi-loss-sources.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
function fullOpening() {
  const input=actualEblNolInput(),regular=input.netOperatingLoss!.vintages![0],history=input.qbiLossSources!.excessBusinessLossHistories![0];
  regular.openingCarryforward='100000';regular.history=[];history.originalNol=structuredClone(regular);
  history.qualifiedOpeningCarryforward='80000';history.history=[];return input;
}
it('preserves omitted legacy EBL totals while rejecting an explicit contradictory zero',()=>{
  const input=fullOpening();expect(input.priorYear?.excessBusinessLossNOL).toBeUndefined();
  expect(calculateFederalTax(input).nolDeduction.toFixed()).toBe('67400');
  input.priorYear={...input.priorYear,excessBusinessLossNOL:'0'};
  expect(()=>calculateFederalTax(input)).toThrow(/Legacy EBL.*reconcile/);
});
it('transfers only actual regular EBL deductions into current QBI through final and AMT replay',()=>{
  const input=fullOpening(),before=JSON.stringify(input),result=calculateFederalTax(input);
  expect(result.nolDeduction.toFixed()).toBe('67400');expect(result.agi.toFixed()).toBe('32600');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('53920');
  expect(result.qbiEblNol?.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('26080');
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('32600');
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('0');
  expect(result.carryforwards.qbiSuspendedLosses).toEqual([]);
  expect(JSON.stringify(input)).toBe(before);
  const k1=k1QbiLossSourceInput();Object.assign(k1.scheduleK1[0],{ordinaryIncome:'100000',section199AQBI:'100000'});
  Object.assign(k1.scheduleK1[0].form6198!,{ordinaryIncome:'100000',currentYearIncreases:'100000'});
  const source=k1.qbiLossSources!.activities![0];source.recipientName='Jane Doe';
  Object.assign(source.statement!,{ordinaryIncome:'100000',section199AQBI:'100000'});source.atRisk!.currentYearIncreases='100000';
  input.scheduleK1=k1.scheduleK1;input.qbiLossSources!.activities=k1.qbiLossSources!.activities;input.priorYear=k1.priorYear;
  input.netOperatingLoss!.alternativeTax!.vintages=[{...structuredClone(input.netOperatingLoss!.vintages![0]),sourceId:'independent-alt',originKind:'individual_nol',originalLoss:'20000',openingCarryforward:'20000'}];
  const mixed=calculateFederalTax(input);
  expect(mixed.nolDeduction.toFixed()).toBe('100000');expect(mixed.agi.toFixed()).toBe('100000');
  expect(mixed.form8995?.qbiDeduction.toFixed()).toBe('4000');
  // Add the actual regular100000 NOLD back for AMT; preserve the actual4000 QBI deduction.
  expect(mixed.netOperatingLoss?.alternativeTax.amtiBeforeAtnol.toFixed()).toBe('196000');
  expect(mixed.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('20000');
  expect(mixed.form6251?.amti.toFixed()).toBe('176000');
  expect(mixed.carryforwards.qbiLossCarryforward.toFixed()).toBe('0');
});
it('uses modified absorption only for EBL qualified closure and never twice in current QBI',()=>{
  const input=fullOpening();input.priorYear={...input.priorYear,shortTermCapitalLoss:'-3000'};
  const result=calculateFederalTax(input);
  expect(result.nolDeduction.toFixed()).toBe('65000');expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('67400');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('52000');
  expect(result.qbiEblNol?.vintages[0].qualifiedAbsorbed?.toFixed()).toBe('53920');
  expect(result.qbiEblNol?.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('26080');
});
it('reduces wholly qualified EBL attributes only after current deduction and keeps missing history closed',()=>{
  const input=fullOpening(),history=input.qbiLossSources!.excessBusinessLossHistories![0];
  history.originalQualifiedLoss='100000';history.qualifiedOpeningCarryforward='100000';
  const cod=actualCodNolInput('5000');
  Object.assign(input,{form1099C:cod.form1099C,codExclusion:cod.codExclusion,form982NolSources:cod.form982NolSources});
  input.netOperatingLoss!.alternativeTax!.vintages=[{...structuredClone(input.netOperatingLoss!.vintages![0]),sourceId:'independent-alt',originKind:'individual_nol'}];
  const result=calculateFederalTax(input);
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('67400');
  expect(result.qbiEblNol?.vintages[0].qualifiedAttributeReduction?.toFixed()).toBe('5000');
  expect(result.qbiEblNol?.vintages[0].qualifiedRemainingCarryforward?.toFixed()).toBe('27600');
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('27600');
  const missing=fullOpening();delete missing.qbiLossSources!.excessBusinessLossHistories;
  expect(()=>calculateFederalTax(missing)).toThrow(/EBL.*histor/i);
});
