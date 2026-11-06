import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateScheduleE } from '@/engine/schedules/schedule-e.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

// Spec: spec/federal/k1-royalty-classification.yaml. Actual fictional K-1 boxes.
function source(k1: Record<string, unknown>) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '2000', federalWithheld: '0', socialSecurityWages: '2000', socialSecurityWithheld: '124', medicareWages: '2000', medicareWithheld: '29' }],
    scheduleK1: [{ partnershipName: 'Fictional portfolio entity', partnershipEIN: '44-4444444', ordinaryIncome: '0', isPassiveActivity: true, ...k1 }], eic: {},
  });
}
it('routes portfolio royalties to PartI for both entity and activity classes', () => {
  for (const entityType of ['partnership', 's_corporation']) for (const isPassiveActivity of [true, false]) {
    const result = calculateScheduleE(source({ entityType, isPassiveActivity, ordinaryIncome: '5000', royalties: '3000.25' }));
    expect(result.totalRentalIncome.toFixed()).toBe('3000.25');
    expect(result.totalPartnershipIncome.toFixed()).toBe('5000');
    expect(result.totalSupplementalIncome.toFixed()).toBe('8000.25');
    expect(result.lines.find(row => row.form === 'Sched E' && row.line === '4')?.value.toFixed()).toBe('3000.25');
  }
});
it('does not use royalty income to release passive activity losses', () => {
  const input = source({ ordinaryIncome: '-10000', royalties: '12000' }); const before = JSON.stringify(input);
  const result = calculateScheduleE(input);
  expect(result.totalRentalIncome.toFixed()).toBe('12000');
  expect(result.totalPassiveIncome.toFixed()).toBe('0');
  expect(result.totalPassiveLoss.toFixed()).toBe('-10000');
  expect(result.totalSupplementalIncome.toFixed()).toBe('12000');
  expect(result.suspendedPassiveLosses[0]?.amount.toFixed()).toBe('-10000');
  expect(JSON.stringify(input)).toBe(before);
});
it('keeps royalty basis increases while transferring only allowed activity loss', () => {
  const result = calculateScheduleE(source({ isPassiveActivity: false, beginningBasis: '0', ordinaryIncome: '-2000', royalties: '1000' }));
  expect(result.totalRentalIncome.toFixed()).toBe('1000');
  expect(result.totalPartnershipIncome.toFixed()).toBe('-1000');
  expect(result.totalSupplementalIncome.toFixed()).toBe('0');
  expect(result.partnerships[0]?.basisResult?.totalAllowedLosses.toFixed()).toBe('1000');
  expect(result.partnerships[0]?.basisResult?.totalSuspendedLosses.toFixed()).toBe('1000');
});
it('preserves legacy manual at-risk capacity without inferring royalty membership', () => {
  const result = calculateScheduleE(source({ isPassiveActivity: false, ordinaryIncome: '-10000', royalties: '12000', atRiskAmount: '1000' }));
  expect(result.totalRentalIncome.toFixed()).toBe('12000');
  expect(result.totalPartnershipIncome.toFixed()).toBe('-1000');
  expect(result.totalSupplementalIncome.toFixed()).toBe('11000');
  expect(result.partnerships[0]?.suspendedAtRiskLoss.toFixed()).toBe('-9000');
});
it('preserves royalty income through canonical passive loss and EIC calculations', () => {
  const result = calculateFederalTax(source({ ordinaryIncome: '-10000', royalties: '12000' }));
  expect(result.agi.toFixed()).toBe('14000');
  expect(result.form8582?.passiveIncome.toFixed()).toBe('0');
  expect(result.form8582?.suspendedLoss.toFixed()).toBe('10000');
  expect(result.allLines.find(row => row.form === '1040' && row.line === '27a')?.value.toFixed()).toBe('0');
});

function actualAtRisk(ordinaryIncome: string, otherIncomeGains: string, capacity: string) {
  return { activityName: 'Actual single activity from supplied Form6198', ordinaryIncome, otherIncomeGains,
    gainLossFromDispositions: '0', otherDeductionsLosses: '0', adjustedBasisAtEffectiveDate: capacity,
    priorYearAmountAtRisk: '0', currentYearIncreases: '0', currentYearDecreases: '0' };
}

it('preserves actual Form6198 royalty income offsets without changing passive character', () => {
  for (const [ordinary, royalty, capacity, line3, expectedLoss, suspended] of [
    ['-10000','12000','1000','12000','-10000','0'],
    ['-4600','3100','600','3100','-3700','-900'],
    ['-4600','3100','600','0','-600','-4000'],
  ]) {
    const input = source({ isPassiveActivity: false, beginningBasis:'20000', ordinaryIncome:ordinary, royalties:royalty,
      form6198:actualAtRisk(ordinary, line3, capacity) });
    const result = calculateScheduleE(input);
    expect(result.totalPartnershipIncome.toFixed()).toBe(expectedLoss);
    expect(result.totalRoyaltyIncome.toFixed()).toBe(royalty);
    expect(result.partnerships[0].suspendedAtRiskLoss.toFixed()).toBe(suspended);
  }
  const passive = calculateScheduleE(source({ ordinaryIncome:'-4600',royalties:'3100',beginningBasis:'20000',form6198:actualAtRisk('-4600','3100','600') }));
  expect(passive.partnerships[0].passiveLoss.toFixed()).toBe('-3700');
  expect(passive.totalSupplementalIncome.toFixed()).toBe('3100');
  expect(passive.suspendedPassiveLosses[0].amount.toFixed()).toBe('-3700');
});

it('requires complete reconciled actual Form6198 sources for royalty loss offsets', () => {
  const input = source({ isPassiveActivity:false,beginningBasis:'0',ordinaryIncome:'-4600',royalties:'3100',form6198:actualAtRisk('-3100','3100','600') });
  const before = JSON.stringify(input), result = calculateScheduleE(input);
  expect(result.totalPartnershipIncome.toFixed()).toBe('-3100');
  expect(result.totalSupplementalIncome.toFixed()).toBe('0');
  expect(result.partnerships[0].basisResult?.totalSuspendedLosses.toFixed()).toBe('1500');
  expect(JSON.stringify(input)).toBe(before);
  for (const key of ['ordinaryIncome','gainLossFromDispositions','otherIncomeGains','otherDeductionsLosses','adjustedBasisAtEffectiveDate','priorYearAmountAtRisk','currentYearIncreases','currentYearDecreases'] as const) {
    const changed = structuredClone(input), actual = changed.scheduleK1[0].form6198;
    if (!actual) throw new Error('The fixture must contain actual Form6198 sources');
    delete actual[key];
    const parsed = TaxYearInputSchema.parse(changed);
    expect(parsed.scheduleK1[0].form6198?.[key]).toBeUndefined();
    expect(() => calculateScheduleE(parsed)).toThrow(/actual.*6198|6198.*actual/i);
  }
  for (const changes of [
    { ordinaryIncome:'-4600' }, { otherIncomeGains:'3000' }, { gainLossFromDispositions:'100' },
    { otherDeductionsLosses:'100' }, { activityName:'' }, { currentYearDecreases:'1000' },
  ]) {
    const changed=structuredClone(input), actual=changed.scheduleK1[0].form6198;
    if (!actual) throw new Error('The fixture must contain actual Form6198 sources');
    Object.assign(actual,changes);
    expect(() => calculateScheduleE(changed)).toThrow(/6198|recapture/i);
  }
  const extra=structuredClone(input);extra.scheduleK1[0].netRentalIncome='-1';
  expect(() => calculateScheduleE(extra)).toThrow(/6198|categories/i);
});
