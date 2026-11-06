import { describe, expect, it, vi } from 'vitest';
// Isolated2026 arithmetic; actual readiness remains a separate closed gate.
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { assertPdfExportAllowed } from '@/pdf/export-policy';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateNetOperatingLoss } from '@/engine/forms/net-operating-loss';
import { calculateAlternativeTaxNol } from '@/engine/forms/alternative-tax-net-operating-loss';
import { d } from '@/utils/decimal';
import { hasCompleteEmptyForeignNolSources } from '@/engine/forms/empty-nol-foreign-sources';
import { newMarriageOwnerInputs } from '@/utils/nol-new-marriage-sources';
import { calculateFederalTax } from '@/engine/federal';
import { newMarriageNolSourceFixture, newMarriagePre2018SourceFixture } from '../fixtures/net-operating-loss-new-marriage';
// Spec: spec/federal/net-operating-loss-new-marriage.yaml; independent originals precede implementation.
describe('Actual new-marriage NOL owner sources', () => {
  it('uses only the actual loss owner income with independent AMT originals', () => {
    const result = calculateFederalTax(newMarriageNolSourceFixture());
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('10000');
    expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('10000');
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('0');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('20000');
    expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('0');
    expect(result.agi.toFixed()).toBe('90000');
    const zero = calculateFederalTax(newMarriageNolSourceFixture('0', '100000', '50000', '20000'));
    expect(zero.netOperatingLoss?.deduction.toFixed()).toBe('0'); expect(zero.netOperatingLoss?.carryforward.toFixed()).toBe('50000');
    expect(zero.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('0'); expect(zero.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('20000');
  });
  it('uses the full personal owner maximum with one actual joint percentage ceiling', () => {
    const result = calculateFederalTax(newMarriageNolSourceFixture('40000', '60000', '50000', '0'));
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('24250'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('24250');
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('25750'); expect(result.agi.toFixed()).toBe('75750');
    const joint = calculateFederalTax(newMarriageNolSourceFixture('90000', '0', '100000', '100000'));
    expect(joint.netOperatingLoss?.deduction.toFixed()).toBe('46800'); expect(joint.netOperatingLoss?.carryforward.toFixed()).toBe('53200');
    expect(joint.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('81000'); expect(joint.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('19000');
  });
  it('keeps the pre2018 owner cap and source conservation', () => {
    const result = calculateFederalTax(newMarriagePre2018SourceFixture());
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('24250'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('24250');
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('5750'); expect(result.agi.toFixed()).toBe('75750');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('10000');
  });
  it('rejects unknown or contradictory actual owner sources', () => {
    const missingOwner = newMarriageNolSourceFixture(); missingOwner.w2s[0]!.accountHolder = undefined as never;
    expect(() => calculateFederalTax(missingOwner)).toThrow(/actual owner/);
    const missingCurrent = newMarriageNolSourceFixture(); missingCurrent.netOperatingLoss.currentOwnerSources.sourceFactsConfirmed = false;
    expect(() => calculateFederalTax(missingCurrent)).toThrow(/current owner sources/);
    const community = newMarriageNolSourceFixture(); community.netOperatingLoss.currentOwnerSources.communityPropertyApplies = true;
    expect(() => calculateFederalTax(community)).toThrow(/noncommunity/);
    const hidden = newMarriageNolSourceFixture(); hidden.netOperatingLoss.returnMembership = 'same_spouses_joint' as never; hidden.netOperatingLoss.membershipUnchangedConfirmed = true;
    expect(() => calculateFederalTax(hidden)).toThrow(/cannot be hidden/);
    const noAmt = newMarriageNolSourceFixture(); noAmt.netOperatingLoss.alternativeTax.newMarriageHistory = undefined as never;
    expect(() => calculateFederalTax(noAmt)).toThrow(/same-couple|independent/);
    const differentAmt = newMarriageNolSourceFixture(); differentAmt.netOperatingLoss.alternativeTax.newMarriageHistory.years[0]!.marriedToEachOther = true;
    expect(() => calculateFederalTax(differentAmt)).toThrow(/marital|reunion|consistent/);
  });
  it('requires the actual original owner and new-marriage years', () => {
    const missing = newMarriageNolSourceFixture(); missing.netOperatingLoss.newMarriageHistory.years.pop();
    expect(() => calculateFederalTax(missing)).toThrow(/every relevant|current marriage/);
    const unrelated = newMarriageNolSourceFixture(); unrelated.netOperatingLoss.vintages[0]!.filingUnitOrigin.ownerPersonId = 'someone-else';
    expect(() => calculateFederalTax(unrelated)).toThrow(/actual current filing-unit/);
    const reunion = newMarriageNolSourceFixture(); reunion.netOperatingLoss.newMarriageHistory.years[0]!.marriedToEachOther = true;
    expect(() => calculateFederalTax(reunion)).toThrow(/reunion|contradicts/);
  });

  it('independently refigures modified owner capital losses and alternative income', () => {
    const base = newMarriageNolSourceFixture('50000', '200000', '100000', '70000');
    base.netOperatingLoss.currentOwnerSources.expenseAllocations = [{ kind: 'priorYear', field: 'shortTermCapitalLoss', primaryAmount: '-3000', spouseAmount: '0', sourceReference: 'Actual primary capital carry' }];
    const input = TaxYearInputSchema.parse({ ...base, priorYear: { shortTermCapitalLoss: '-3000' } });
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('32750'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('34250');
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('65750'); expect(result.agi.toFixed()).toBe('214250');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('48500');
    expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe('50000'); expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('20000');
  });
  it('recomputes actual raw itemized expenses and preserves source cents', () => {
    const base = newMarriageNolSourceFixture('40000', '60000', '50000', '0');
    base.netOperatingLoss.currentOwnerSources.primaryDeductionElection = 'itemized'; base.netOperatingLoss.currentOwnerSources.spouseDeductionElection = 'itemized';
    base.netOperatingLoss.currentOwnerSources.expenseAllocations = [{ kind: 'scheduleA', field: 'medicalExpenses', primaryAmount: '20000', spouseAmount: '0', sourceReference: 'Actual primary medical payments' }];
    const input = TaxYearInputSchema.parse({ ...base, deductionElection: 'itemized', scheduleA: { medicalExpenses: '20000' } });
    // Owner MFS base40000-(20000-7.5%*40000)=23000. Joint initial base87500 ->80%70000.
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('23000'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('23000');
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('27000');
    const split = structuredClone(input); split.netOperatingLoss!.currentOwnerSources!.expenseAllocations![0]!.primaryAmount = '19999.99';
    expect(() => calculateFederalTax(split)).toThrow(/exact conserving/);
    const cents = newMarriageNolSourceFixture('40000.24', '60000', '50000', '0');
    cents.w2s.push({ ...cents.w2s[0]!, wages: '0.25' });
    expect(calculateFederalTax(cents).netOperatingLoss?.deduction.toFixed()).toBe('24250');
    cents.w2s[2]!.wages = '0.26';
    expect(calculateFederalTax(cents).netOperatingLoss?.deduction.toFixed()).toBe('24251');
  });
  it('requires canonical owner contexts for standalone current calculations', () => {
    const input = newMarriageNolSourceFixture('40000', '60000', '50000', '20000');
    const params = { taxYear: 2025, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer, facts: input.netOperatingLoss };
    expect(() => calculateNetOperatingLoss({ ...params, context: { taxableIncomeWithoutNolQbiAndSection250: d('68500') } })).toThrow(/canonical personal-owner income/);
    const alternative = calculateNetOperatingLoss({ ...params, facts: { ...params.facts, ...params.facts.alternativeTax } });
    expect(() => calculateAlternativeTaxNol({ taxYear: 2025, sources: alternative, amtiBeforeAtnol: d('100000'), modifiedAmtiBeforeAtnol: d('100000') })).toThrow(/canonical personal-owner AMTI/);
  });
  it('reconciles independently named AMT people without copying regular balances', () => {
    const input = newMarriageNolSourceFixture('50000', '200000', '100000', '70000');
    const alternate = input.netOperatingLoss.alternativeTax;
    const rename = (value: unknown): unknown => {
      if (value === 'jane') return 'amt-owner-a'; if (value === 'alex') return 'amt-owner-b';
      if (Array.isArray(value)) return value.map(rename);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rename(child)]));
      return value;
    };
    input.netOperatingLoss.alternativeTax = rename(alternate) as typeof alternate;
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('34250'); expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('65750');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('50000'); expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('20000');
  });

  it('retains actual regular AGI in owner current and modified AMTI', () => {
    const base = newMarriageNolSourceFixture('40000', '60000', '50000', '30000');
    base.netOperatingLoss.currentOwnerSources.primaryDeductionElection = 'itemized'; base.netOperatingLoss.currentOwnerSources.spouseDeductionElection = 'itemized';
    base.netOperatingLoss.currentOwnerSources.expenseAllocations = [{ kind: 'scheduleA', field: 'medicalExpenses', primaryAmount: '20000', spouseAmount: '0', sourceReference: 'Actual owner medical payments' }];
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...base, deductionElection: 'itemized', scheduleA: { medicalExpenses: '20000' } }));
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('23000');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('21275');
    expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe('21275');
    expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('8725');
  });
  it('keeps personal FIFO limits for mixed vintages and distinct owners', () => {
    const mixed = newMarriagePre2018SourceFixture();
    mixed.w2s[0]!.wages = '50000'; mixed.w2s[1]!.wages = '200000';
    const newer = newMarriageNolSourceFixture('50000', '200000', '100000', '70000');
    mixed.netOperatingLoss.vintages[0]!.originalLoss = '20000'; mixed.netOperatingLoss.vintages[0]!.openingCarryforward = '20000';
    mixed.netOperatingLoss.vintages[0]!.filingUnitOrigin.originalReturnLoss = '20000'; mixed.netOperatingLoss.vintages[0]!.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '20000';
    mixed.netOperatingLoss.alternativeTax.vintages[0]!.originalLoss = '15000'; mixed.netOperatingLoss.alternativeTax.vintages[0]!.openingCarryforward = '15000';
    mixed.netOperatingLoss.alternativeTax.vintages[0]!.filingUnitOrigin.originalReturnLoss = '15000'; mixed.netOperatingLoss.alternativeTax.vintages[0]!.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '15000';
    mixed.netOperatingLoss.vintages.push(newer.netOperatingLoss.vintages[0]!); mixed.netOperatingLoss.alternativeTax.vintages.push(newer.netOperatingLoss.alternativeTax.vintages[0]!);
    const result = calculateFederalTax(mixed);
    expect(result.netOperatingLoss?.vintages.map(row => row.deduction?.toFixed())).toEqual(['20000', '14250']);
    expect(result.netOperatingLoss?.vintages.map(row => row.absorbed?.toFixed())).toEqual(['20000', '14250']);
    expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('85750');
    expect(result.netOperatingLoss?.alternativeTax.vintages.map(row => row.deduction.toFixed())).toEqual(['15000', '35000']);
    expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('35000');
    const different = newMarriageNolSourceFixture('200000', '50000', '100000', '70000');
    for (const [ledger, amount] of [[different.netOperatingLoss, '200000'], [different.netOperatingLoss.alternativeTax, '60000']] as const) {
      const row = structuredClone(ledger.vintages[0]!); row.sourceId += '-other'; row.lossTaxYear = 2022; row.originalLoss = amount; row.openingCarryforward = amount;
      row.filingUnitOrigin = { ownerPersonId: 'alex', returnSourceId: 'alex2022', originalReturnLoss: amount, separateComputations: [{ personId: 'alex', netOperatingLoss: amount, sourceReference: 'Actual second owner individual loss' }] };
      row.history = row.history.filter(part => part.taxYear > 2022).map(part => ({ ...part, filingUnitUses: part.filingUnitUses.map(use => ({ ...use, returnSourceId: `alex${part.taxYear}`, owners: use.owners.map(owner => ({ ...owner, personId: 'alex' })) })) }));
      ledger.vintages.push(row);
    }
    const distinct = calculateFederalTax(different);
    expect(distinct.netOperatingLoss?.vintages.map(row => row.deduction?.toFixed())).toEqual(['100000', '34250']);
    expect(distinct.netOperatingLoss?.vintages.map(row => row.absorbed?.toFixed())).toEqual(['100000', '34250']);
    expect(distinct.netOperatingLoss?.carryforward.toFixed()).toBe('165750');
    expect(distinct.netOperatingLoss?.alternativeTax.vintages.map(row => row.deduction.toFixed())).toEqual(['70000', '50000']);
    expect(distinct.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('10000');
  });

  it('recomputes owned ordinary investment retirement and business sources', () => {
    const base = newMarriageNolSourceFixture('40000', '60000', '100000', '70000');
    const investment = TaxYearInputSchema.parse({ ...base,
      form1099Int: [{ payer: 'Actual bank', interestIncome: '1000', accountHolder: 'primary', privateActivityBondInterest: '0' }],
      form1099Div: [{ payer: 'Other owner fund', ordinaryDividends: '500', accountHolder: 'spouse' }],
      form1099R: [{ payer: 'Actual non-IRA pension', grossDistribution: '5000', taxableAmount: '5000', distributionCode: '7', accountHolder: 'primary' }] });
    const result = calculateFederalTax(investment);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('30250');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('46000');
    const business = calculateFederalTax(TaxYearInputSchema.parse({ ...base, scheduleC: { accountHolder: 'primary', grossReceipts: '10000', qbiMateriallyParticipated: true } }));
    expect(business.netOperatingLoss?.deduction.toFixed()).toBe('33543');
    expect(business.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('49293');
  });
  it('keeps selected year arithmetic separate from release gates', () => {
    const result = calculateFederalTax(newMarriageNolSourceFixture('40000', '60000', '50000', '20000', 2026));
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('23900'); expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('26100');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('20000');
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow(/unavailable/);
  });

  it('retains individual IRA claims and inherent expense owners', () => {
    const base = newMarriageNolSourceFixture('40000', '60000', '100000', '70000');
    const input = TaxYearInputSchema.parse({ ...base, iraDeductionWorksheet: { sourceFactsConfirmed: true, primaryContributions: '7000', spouseContributions: '6000',
      primaryCompensation: '40000', spouseCompensation: '60000', primaryIsActiveParticipant: false, spouseIsActiveParticipant: false,
      primaryRothContributions: '0', spouseRothContributions: '0', primarySection501c18Contributions: '0', spouseSection501c18Contributions: '0' } });
    const result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('17250'); expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('33000');
    const crossed = TaxYearInputSchema.parse({ ...base, adjustments: { primaryEducatorExpenses: '200' },
      netOperatingLoss: { ...base.netOperatingLoss, currentOwnerSources: { ...base.netOperatingLoss.currentOwnerSources,
        expenseAllocations: [{ kind: 'adjustments', field: 'primaryEducatorExpenses', primaryAmount: '0', spouseAmount: '200', sourceReference: 'Contradicts actual named owner' }] } } });
    expect(() => calculateFederalTax(crossed)).toThrow(/inherent.*owner/);
  });

  it('preserves independently empty histories without inventing an owner allowance', () => {
    const input = TaxYearInputSchema.parse(newMarriageNolSourceFixture('40000', '60000', '0', '0'));
    expect(hasCompleteEmptyForeignNolSources(input)).toBe(true);
    expect(newMarriageOwnerInputs(input)).toBeUndefined();
    const missing = structuredClone(input); missing.netOperatingLoss!.alternativeTax!.newMarriageHistory = undefined;
    expect(() => hasCompleteEmptyForeignNolSources(missing)).toThrow(/same-couple|independent/);
    const different = structuredClone(input); different.netOperatingLoss!.alternativeTax!.newMarriageHistory!.years![0]!.marriedToEachOther = true;
    expect(() => hasCompleteEmptyForeignNolSources(different)).toThrow(/marital|contradicts|reunion/);
  });

  it('retains positive modified owner capacity when current income is negative', () => {
    const base = newMarriageNolSourceFixture('1000', '200000', '100000', '70000');
    base.netOperatingLoss.currentOwnerSources.primaryDeductionElection = 'itemized'; base.netOperatingLoss.currentOwnerSources.spouseDeductionElection = 'itemized';
    base.netOperatingLoss.currentOwnerSources.expenseAllocations = [
      { kind: 'priorYear', field: 'shortTermCapitalLoss', primaryAmount: '-3000', spouseAmount: '0', sourceReference: 'Actual owner capital carry' },
      { kind: 'scheduleA', field: 'additionalStateLocalIncomeTaxes', primaryAmount: '0', spouseAmount: '20000', sourceReference: 'Actual other-owner tax payments' }];
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...base, deductionElection: 'standard', priorYear: { shortTermCapitalLoss: '-3000' }, scheduleA: { additionalStateLocalIncomeTaxes: '20000' } }));
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('0'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('1000'); expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('99000');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('0'); expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe('1000'); expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('69000');
  });

  it('calculates verified empty personal ledgers without owner contexts', () => {
    const raw = newMarriageNolSourceFixture('50000', '200000', '0', '0');
    const input = TaxYearInputSchema.parse(raw), result = calculateFederalTax(input);
    expect(result.netOperatingLoss?.calculationComplete).toBe(true);
    expect(result.netOperatingLoss?.deduction.toFixed()).toBe('0'); expect(result.netOperatingLoss?.absorbed.toFixed()).toBe('0'); expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('0');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('0'); expect(result.netOperatingLoss?.alternativeTax.absorbed.toFixed()).toBe('0'); expect(result.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('0');
    expect(result.agi.toFixed()).toBe('250000');
    const independent = calculateFederalTax(newMarriageNolSourceFixture('50000', '200000', '0', '70000'));
    expect(independent.netOperatingLoss?.deduction.toFixed()).toBe('0'); expect(independent.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('50000'); expect(independent.netOperatingLoss?.alternativeTax.carryforward.toFixed()).toBe('20000');
    const missingRegular = structuredClone(input); missingRegular.netOperatingLoss!.vintages = undefined;
    expect(() => calculateFederalTax(missingRegular)).toThrow(/original vintages|actual vintage/);
    const missingAlternative = structuredClone(input); missingAlternative.netOperatingLoss!.alternativeTax!.vintages = undefined;
    expect(() => calculateFederalTax(missingAlternative)).toThrow(/AMT|alternative|vintage/);
  });

});
