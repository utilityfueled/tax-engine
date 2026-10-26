// Spec: spec/federal/form-172-operating-k1.yaml; independent literal current-source controls.
import { expect, it } from 'vitest';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin';
import { calculateFederalTax } from '@/engine/federal';
import { operatingK1CharitableOriginInput, operatingK1OriginInput, requireOperatingSource as required } from '../fixtures/form-172-operating-k1';

it('classifies actual basis-limited ordinary K1 and charitable amounts separately', () => {
  for (const scorp of [false, true]) {
    const input = operatingK1CharitableOriginInput();
    if (scorp) {
      Object.assign(input.scheduleK1[0], { entityType: 's_corporation', beginningDebtBasis: '0', additionalLoansToScorp: '0', priorDebtBasisReduction: '0' });
      required(input.qbiLossSources?.activities)[0].entityType = 's_corporation';
      const statement = required(input.k1CharitableSources?.statements)[0]; required(statement.basis).entityType = 's_corporation';
      required(statement.receipts)[0].originalBox = '12';
    }
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('10000');
    expect(result.schedule1?.supplementalIncome.toFixed()).toBe('-40000');
    expect(result.form172?.regular.partI[6].toFixed()).toBe('26000');
    expect(result.form172?.regular.partI[7].toFixed()).toBe('30000');
    expect(result.form172?.regular.partI[9].toFixed()).toBe('0');
    expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('16000');
    expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('0');
    expect(result.form6251?.amti.toFixed()).toBe('4000');
    expect(result.form172?.section1411OriginalLoss.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('4000');
    expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('4000');
    const basis = required(result.scheduleE?.partnerships[0].basisResult);
    expect(basis.lossCategories.find(row => row.key === 'ordinary')?.suspended.toFixed()).toBe('40000');
    expect(basis.lossCategories.find(row => row.key === 'charitable')?.suspended.toFixed()).toBe('10000');
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('adds the actual ordinary K1 EBL only once after current origin', () => {
  const result = calculateFederalTax(operatingK1CharitableOriginInput(true));
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe('187000');
  expect(result.agi.toFixed()).toBe('-288000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('293000');
  expect(result.form172?.newRegularCarryforward.toFixed()).toBe('480000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('288000');
  expect(result.form172?.newAlternativeCarryforward.toFixed()).toBe('475000');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('10000');
});
it('requires actual current operating identities and complete independent histories', () => {
  for (const mutate of [
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(x.form172).businessSources = []; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.form172).businessSources)[0].businessName = 'Different actual entity'; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.form172).businessSources)[0].materiallyParticipated = undefined; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.form172).businessSources)[0].financialTradingBusiness = true; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.form172).businessSources)[0].accountHolder = 'spouse'; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { x.qbiLossSources = undefined; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(x.qbiLossSources).form461Classification = undefined; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(x.priorYear).suspendedPassiveLosses = []; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.qbiLossSources?.activities)[0].atRisk).priorLossHistory = undefined; },
    (x: ReturnType<typeof operatingK1CharitableOriginInput>) => { required(required(x.form172).alternativeTax).regularBasisAndLossLimitsSameAsAlternativeConfirmed = false; },
  ]) {
    const input = operatingK1CharitableOriginInput(); mutate(input);
    expect(() => calculateFederalTax(input)).toThrow();
  }
});
it('preserves no-gift standard and known-zero ordinary source choices', () => {
  const input = operatingK1OriginInput(), result = calculateFederalTax(input);
  const unknownRisk = operatingK1OriginInput(); required(required(unknownRisk.form172).businessSources)[0].allInvestmentAtRisk = undefined;
  expect(() => calculateFederalTax(unknownRisk)).toThrow(/actual|source/i);
  expect(result.agi.toFixed()).toBe('-35000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('40000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('35000');
  expect(result.form172?.charitableSources).toBeUndefined();
  const zero = operatingK1OriginInput(), q = required(zero.qbiLossSources?.activities)[0];
  zero.scheduleK1[0].ordinaryIncome = '0'; zero.scheduleK1[0].section199AQBI = '0';
  required(zero.scheduleK1[0].form6198).ordinaryIncome = '0';
  Object.assign(required(q.statement), { ordinaryIncome: '0', section199AQBI: '0' });
  const known = calculateFederalTax(zero);
  expect(known.agi.toFixed()).toBe('25000');
  expect(known.form172?.regular.netOperatingLoss.toFixed()).toBe('0');
});

it('conserves ordinary K1 classification beside direct receipts and positive business income', () => {
  const input = operatingK1CharitableOriginInput(), ordinary = operatingK1OriginInput();
  input.scheduleK1 = ordinary.scheduleK1; input.qbiLossSources = ordinary.qbiLossSources; input.k1CharitableSources = undefined;
  required(input.form172).businessSources = required(ordinary.form172).businessSources;
  required(input.priorYear).suspendedPassiveLosses = required(ordinary.priorYear).suspendedPassiveLosses;
  input.donations = currentCharitableOriginInput().donations; input.donations[0].amount = '1000';
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('-10000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('30000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('10000');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('1000');
  expect(result.carryforwards.amtCharitableContributions?.toFixed()).toBe('1000');
  const positive = operatingK1CharitableOriginInput(), source = required(positive.qbiLossSources?.activities)[0];
  Object.assign(positive.scheduleK1[0], { ordinaryIncome: '80000', section199AQBI: '80000' });
  Object.assign(required(source.statement), { ordinaryIncome: '80000', section199AQBI: '80000' });
  required(positive.scheduleK1[0].form6198).ordinaryIncome = '80000';
  const income = calculateFederalTax(positive);
  expect(income.agi.toFixed()).toBe('130000');
  expect(income.form172?.k1Sources?.ordinaryBusinessIncome.toFixed()).toBe('80000');
  expect(income.form172?.regular.netOperatingLoss.toFixed()).toBe('0');
});
