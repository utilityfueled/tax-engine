// Spec: spec/federal/k1-qbi-loss-sources.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { validateK1QbiLossSources } from '@/engine/forms/k1-qbi-loss-sources.js';
import { k1QbiLossSourceInput } from '../../fixtures/k1-qbi-loss-sources.js';

it('binds exact original K1 identity and statement without calculated overrides', () => {
  const input=k1QbiLossSourceInput(), before=JSON.stringify(input), result=validateK1QbiLossSources(input);
  expect(result).toHaveLength(1);
  expect(result[0].sourceId).toBe('scheduleK1:0'); expect(result[0].k1Index).toBe(0);
  expect(result[0].ordinaryIncome.toFixed()).toBe('-100000'); expect(result[0].qualifiedBusinessIncome.toFixed()).toBe('-80000');
  expect(result[0].passiveHistory.vintages).toEqual([]); expect(result[0].priorPassiveLoss.toFixed()).toBe('0');
  expect(JSON.stringify(input)).toBe(before);
  for(const field of ['taxYear','accountHolder','partnershipEIN','ordinaryIncome','section199AQBI','section199AIsSST'] as const){
    const changed=k1QbiLossSourceInput();
    const original=changed.scheduleK1[0];
    if(field==='taxYear') original.taxYear=2024;
    else if(field==='accountHolder') original.accountHolder='spouse';
    else if(field==='partnershipEIN') original.partnershipEIN='98-7654321';
    else if(field==='ordinaryIncome') original.ordinaryIncome='-100000.01';
    else if(field==='section199AQBI') original.section199AQBI='-80000.01';
    else original.section199AIsSST=true;
    expect(()=>validateK1QbiLossSources(changed)).toThrow(/source|original|statement|owner|year|match/i);
  }
});

it('requires actual opening facts and preserves independent passive character', () => {
  const input=k1QbiLossSourceInput(), source=input.qbiLossSources!.activities![0];
  input.scheduleK1[0].isPassiveActivity=true;input.scheduleK1[0].qbiMateriallyParticipated=false;
  source.statement!.isPassiveActivity=true;source.statement!.qbiMateriallyParticipated=false;
  source.priorPassiveLoss='40000';
  input.priorYear!.suspendedPassiveLosses[0].amount='40000';
  input.priorYear!.suspendedPassiveLosses[0].qbiLossTracking!.vintages=[{taxYear:2023,originalLoss:'50000',qualifiedOriginalLoss:'40000',remainingLoss:'40000',qualifiedRemainingLoss:'32000',materiallyParticipatedInCurrentYear:false}];
  const result=validateK1QbiLossSources(input);
  expect(result[0].priorPassiveLoss.toFixed()).toBe('40000');
  expect(result[0].passiveHistory.vintages[0].qualifiedOriginalLoss).toBe('40000');
  expect(result[0].passiveHistory.vintages[0].materiallyParticipatedInCurrentYear).toBe(false);
  for(const field of ['beginningBasis','form6198'] as const){
    const changed=k1QbiLossSourceInput();
    if(field==='beginningBasis') changed.scheduleK1[0].beginningBasis='100001';
    else changed.scheduleK1[0].form6198!.priorYearAmountAtRisk='60001';
    expect(()=>validateK1QbiLossSources(changed)).toThrow(/basis|risk|original|match/i);
  }
  const badHistory=k1QbiLossSourceInput();badHistory.priorYear!.suspendedPassiveLosses[0].amount='1';
  expect(()=>validateK1QbiLossSources(badHistory)).toThrow(/history|passive|opening/i);
});

it('keeps missing source facts distinct from explicit zero and false', () => {
  const missing=TaxYearInputSchema.parse({...k1QbiLossSourceInput(),qbiLossSources:{activities:[{statement:{},basis:{},atRisk:{}}]}});
  expect(missing.qbiLossSources?.sourceFactsConfirmed).toBeUndefined();
  expect(missing.qbiLossSources?.activities?.[0].statement?.section199AQBI).toBeUndefined();
  expect(()=>validateK1QbiLossSources(missing)).toThrow(/source|confirm|year/i);
  const legacy=k1QbiLossSourceInput();delete legacy.qbiLossSources;
  expect(validateK1QbiLossSources(legacy)).toEqual([]);
  const absentYear=k1QbiLossSourceInput();delete absentYear.scheduleK1[0].taxYear;
  expect(()=>validateK1QbiLossSources(absentYear)).toThrow(/year/i);
  const unknown=k1QbiLossSourceInput();delete unknown.qbiLossSources!.activities![0].basis!.priorSuspendedLoss;
  expect(()=>validateK1QbiLossSources(unknown)).toThrow(/amount|prior|basis/i);
  const absentConfirmation=k1QbiLossSourceInput();delete absentConfirmation.qbiLossSources!.activities![0].sameRegularAmtTreatmentConfirmed;
  expect(()=>validateK1QbiLossSources(absentConfirmation)).toThrow(/AMT|alternative/i);
});

it('rejects stale duplicate incomplete and unsupported original sources', () => {
  const badId=k1QbiLossSourceInput();badId.qbiLossSources!.activities![0].k1SourceId='scheduleK1:00';
  expect(()=>validateK1QbiLossSources(badId)).toThrow(/identity|index|source/i);
  const duplicate=k1QbiLossSourceInput();duplicate.qbiLossSources!.activities!.push(structuredClone(duplicate.qbiLossSources!.activities![0]));
  expect(()=>validateK1QbiLossSources(duplicate)).toThrow(/once|duplicate|complete/i);
  const missing=k1QbiLossSourceInput();missing.qbiLossSources!.activities=[];
  expect(()=>validateK1QbiLossSources(missing)).toThrow(/complete|every|source/i);
  const other=k1QbiLossSourceInput();other.scheduleK1[0].netRentalIncome='1';
  expect(()=>validateK1QbiLossSources(other)).toThrow(/ordinary|other|separate/i);
  const priorBasis=k1QbiLossSourceInput();priorBasis.qbiLossSources!.activities![0].basis!.priorSuspendedLoss='1';
  expect(()=>validateK1QbiLossSources(priorBasis)).toThrow(/prior.*basis|separate/i);
  const priorAtRisk=k1QbiLossSourceInput();priorAtRisk.qbiLossSources!.activities![0].atRisk!.priorSuspendedLoss='1';
  expect(()=>validateK1QbiLossSources(priorAtRisk)).toThrow(/prior.*risk|separate/i);
  const ptp=k1QbiLossSourceInput();ptp.scheduleK1[0].isPubliclyTradedPartnership=true;
  expect(()=>validateK1QbiLossSources(ptp)).toThrow(/PTP|separate/i);
  const changedIdentity=k1QbiLossSourceInput();changedIdentity.taxpayer.primary.lastName='Changed';
  expect(()=>validateK1QbiLossSources(changedIdentity)).toThrow(/identity|recipient/i);
});


it('requires actual partnership self-employment facts rather than legacy defaults', () => {
  const valid=k1QbiLossSourceInput();
  expect(validateK1QbiLossSources(valid)).toHaveLength(1);
  for(const field of ['selfEmploymentEarnings','selfEmploymentNetEarningsAfterAdjustments','selfEmploymentIncomeType','selfEmploymentFactsConfirmed'] as const){
    const missing=k1QbiLossSourceInput(); delete missing.scheduleK1[0][field];
    expect(()=>validateK1QbiLossSources(missing)).toThrow(/self.employment|Box14|partner.*earnings/i);
  }
  const changed=k1QbiLossSourceInput(); changed.scheduleK1[0].selfEmploymentEarnings='-100000.01';
  expect(()=>validateK1QbiLossSources(changed)).toThrow(/self.employment|Box14|match/i);
  const unknown=k1QbiLossSourceInput(); delete unknown.qbiLossSources!.activities![0].statement!.selfEmploymentEarnings;
  expect(()=>validateK1QbiLossSources(unknown)).toThrow(/self.employment|Box14|amount/i);
  const signed=k1QbiLossSourceInput();
  Object.assign(signed.scheduleK1[0],{selfEmploymentEarnings:'-100000.01',selfEmploymentNetEarningsAfterAdjustments:'-60000.01'});
  Object.assign(signed.qbiLossSources!.activities![0].statement!,{selfEmploymentEarnings:'-100000.01',selfEmploymentNetEarningsAfterAdjustments:'-60000.01'});
  const before=JSON.stringify(signed);expect(validateK1QbiLossSources(signed)).toHaveLength(1);expect(JSON.stringify(signed)).toBe(before);
  const corporation=k1QbiLossSourceInput();corporation.scheduleK1[0].entityType='s_corporation';corporation.qbiLossSources!.activities![0].entityType='s_corporation';
  expect(validateK1QbiLossSources(corporation)).toHaveLength(1);
  corporation.scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments='1';
  expect(()=>validateK1QbiLossSources(corporation)).toThrow(/S.corporation|self.employment/i);
});
