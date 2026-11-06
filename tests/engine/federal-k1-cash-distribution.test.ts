// Spec: spec/federal/k1-cash-distribution-gain.yaml
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { fillForm8949 } from '@/pdf/fill-form-8949.js';
import { k1CashDistributionFixture, cashDistributionSource } from '../fixtures/k1-cash-distribution.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
it('transfers actual distribution gain once through Form8949 ScheduleD and AGI', () => {
  for (const scorp of [false, true]) {
    const input = k1CashDistributionFixture(2025, scorp), original = JSON.stringify(input), c = calculateForm8949(input), r = calculateFederalTax(input);
    expect(c.longTermBoxF.transactions).toHaveLength(1);
    expect(c.longTermBoxF.totalGainLoss.toFixed()).toBe('1');
    expect(c.longTermBoxF.totalProceeds.toFixed()).toBe(scorp ? '1' : '31');
    expect(c.longTermBoxF.totalCostBasis.toFixed()).toBe(scorp ? '0' : '30');
    expect(r.scheduleD?.netLongTerm.toFixed()).toBe('1');
    expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1');
    expect(r.agi.toFixed()).toBe('100001');
    expect(r.scheduleE?.partnerships[0].netAmount.toFixed()).toBe('0');
    expect(r.scheduleE?.partnerships[0].basisResult?.totalIncomeItems.toFixed()).toBe('0');
    expect(r.allLines.filter(row => row.form === 'Form 8949' && row.line === 'Part II Box F')).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(original);
    cashDistributionSource(input).acquisitionDate = '2024-12-31';
    const short = calculateFederalTax(input);
    expect(short.scheduleD?.netShortTerm.toFixed()).toBe('1');
    expect(short.scheduleD?.netLongTerm.toFixed()).toBe('0');
  }
});
it('preserves exact source cents and portfolio tax character', () => {
  const input = k1CashDistributionFixture(); input.w2s[0].wages = '250000'; input.w2s[0].federalWithheld = '80000';
  input.scheduleK1[0].distributions = '1030.25'; cashDistributionSource(input).cashAmount = '1030.25';
  input.scheduleK1[0].form6198!.gainLossFromDispositions = '1000.25';
  input.scheduleK1[0].form6198!.currentYearDecreases = '1030.25'; charitableStatement(input).atRisk!.currentYearDecreases = '1030.25';
  const r = calculateFederalTax(input);
  expect(r.agi.toFixed()).toBe('251000.25');
  expect(r.scheduleD?.netCapitalGainLoss.toFixed()).toBe('1000.25');
  expect(r.allLines.find(row => row.form === 'Form 8960' && row.line === '5a')?.value.toFixed()).toBe('1000.25');
  expect(r.allLines.find(row => row.form === 'Form 8960' && row.line === '12')?.value.toFixed()).toBe('1000.25');
  expect(r.allLines.find(row => row.form === 'Form 8960' && row.line === '17')?.value.toFixed()).toBe('38');
  cashDistributionSource(input).activityCharacter = 'single_nonpassive_business';
  expect(() => calculateFederalTax(input)).toThrow(/business.*activity method/);
});
it('keeps future calculation and review gates closed', async () => {
  const input = k1CashDistributionFixture(2026);
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.gain.toFixed()).toBe('1');
  expect(() => calculateFederalTax(input)).toThrow(/Tax year 2026 rule pack .*incomplete/);
  await expect(fillForm8949(input, 'missing.pdf')).rejects.toThrow(/No qualified review PDF mapping/);
});
it('reconciles actual owner residency without assigning the other spouse status', () => {
  for (const scorp of [false, true]) {
    const single = k1CashDistributionFixture(2025, scorp);
    single.standardDeductionFacts = { ...single.standardDeductionFacts, nonresidentAlien: true, dualStatusAlien: false, residentJointElection: false };
    expect(() => calculateFederalTax(single)).toThrow(/owner.*residency|tax treatment/);
    single.standardDeductionFacts.residentJointElection = true;
    expect(() => calculateK1CharitableReturnSources(single)).toThrow(/owner.*residency|tax treatment/);
    const joint = k1CashDistributionFixture(2025, scorp);
    joint.taxpayer.filingStatus = 'married_filing_jointly';
    joint.taxpayer.spouse = { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '1990-01-01' };
    joint.eic = { primaryIsFullTimeStudent: false, claimantEligibility: {
      sourceTaxYear: 2025, sourceReference: 'Fictional actual owner residency history', sourceFactsConfirmed: true,
      primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: true, residentJointElection: false,
    } };
    expect(calculateK1CharitableReturnSources(joint)?.statements[0].distributionGain?.gain.toFixed()).toBe('1');
    joint.scheduleK1[0].accountHolder = 'spouse';
    Object.assign(charitableStatement(joint).basis!, { accountHolder: 'spouse', recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333' });
    expect(() => calculateK1CharitableReturnSources(joint)).toThrow(/owner.*residency|tax treatment/);
    joint.eic.claimantEligibility!.residentJointElection = true;
    joint.standardDeductionFacts!.residentJointElection = true;
    expect(calculateK1CharitableReturnSources(joint)?.statements[0].distributionGain?.gain.toFixed()).toBe('1');
    joint.standardDeductionFacts!.residentJointElection = false;
    expect(() => calculateK1CharitableReturnSources(joint)).toThrow(/election.*conflict/);
  }
});
