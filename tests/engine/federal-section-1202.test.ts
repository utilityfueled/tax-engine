// Spec: spec/federal/section-1202-return.yaml. Literal derived source examples.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateForm8949 } from '@/engine/forms/form-8949.js';
import { calculateScheduleD } from '@/engine/schedules/schedule-d.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { getConstants } from '@/models/constants.js';
import { qsbsInput, qsbsReturnInput } from '../fixtures/section-1202.js';
import { actualNolInput } from '../fixtures/net-operating-loss.js';
const schedule = (input: ReturnType<typeof qsbsInput>) => calculateScheduleD(input, input.taxpayer.filingStatus, getConstants(input.taxpayer.taxYear));
it('applies the verified Q adjustment once to the original broker row', () => {
    const input = qsbsReturnInput();
    const form = calculateForm8949(input);
    const row = required(form.longTermBoxE.transactions[0]);
    expect([row.proceeds, row.costBasis, row.adjustment, row.gainLoss].map(value => value.toFixed())).toEqual(['1100.35', '100.1', '-500.125', '500.125']);
    expect(row.adjustmentCode).toBe('Q');
    expect(row.dateAcquired).toBe('2008-01-02');
    expect(schedule(input).netLongTerm.toFixed()).toBe('500.125');
    expect(schedule(input).section1202Exclusion.toFixed()).toBe('500.125');
    expect(calculateFederalTax(input).capitalGainLoss.toFixed()).toBe('500.125');
});
it('retains full fund distributions and separate issuer Q rows', () => {
    const input = qsbsReturnInput('fund');
    const form = calculateForm8949(input);
    const row = required(form.longTermBoxF.transactions[0]);
    expect(row.description).toBe('Synthetic eligible corporation');
    expect([row.dateAcquired, row.dateSold, row.adjustmentCode]).toEqual(['', '', 'Q']);
    expect([row.proceeds, row.costBasis, row.adjustment, row.gainLoss].map(value => value.toFixed())).toEqual(['0', '0', '-500.125', '-500.125']);
    const result = schedule(input);
    expect(result.lines.find(line => line.form === 'Sched D' && line.line === '13')?.value.toFixed()).toBe('1500.5');
    expect(result.netLongTerm.toFixed()).toBe('1000.375');
    expect(result.lines.find(line => line.form === 'Sched D' && line.line === '18')?.value.toFixed()).toBe('500');
});
it('nets actual collectible and carry losses against the partial exclusion component', () => {
    const input = qsbsReturnInput(), facts = required(input.scheduleDSpecialGainSources);
    const collectible = { ...required(required(input.form1099B[0]).transactions[0]), description: 'Actual collectible', proceeds: '100', costBasis: '300' };
    required(input.form1099B[0]).transactions.push(collectible);
    facts.longTermAssets.push({ ...required(facts.longTermAssets[0]), ...collectible, sourceId: 'form1099B:0:transaction:1', character: 'collectible' });
    input.priorYear = { ...input.priorYear, shortTermCapitalLoss: '-100', longTermCapitalLoss: '-50' };
    facts.priorShortTermCapitalLoss = '-100';
    facts.priorLongTermCapitalLoss = '-50';
    const result = schedule(input);
    expect(result.netCapitalGainLoss.toFixed()).toBe('150.125');
    expect(result.lines.find(line => line.form === '28% Rate Gain Worksheet' && line.line === '1')?.value.toFixed()).toBe('-200');
    expect(result.lines.find(line => line.form === '28% Rate Gain Worksheet' && line.line === '2')?.value.toFixed()).toBe('500.125');
    expect(result.specialGainWorksheets?.collectiblesGain.toFixed()).toBe('150');
});
it('adds the actual QSBS preference to AMTI without changing capital gain character', () => {
    const result = calculateFederalTax(qsbsReturnInput());
    expect(result.form6251?.lines.find(line => line.line === '2h')?.value.toFixed()).toBe('35');
    expect(result.form6251?.amti.toFixed()).toBe('85535.125');
    expect(result.capitalGainLoss.toFixed()).toBe('500.125');
    expect(result.scheduleD?.specialGainWorksheets?.collectiblesGain.toFixed()).toBe('500');
    const modern = qsbsReturnInput();
    required(required(modern.section1202Sources).lots[0]).originalIssueDate = '2011-01-02';
    required(required(modern.section1202Sources).lots[0]).effectiveAcquiredDate = '2011-01-02';
    required(required(modern.form1099B[0]).transactions[0]).dateAcquired = '2011-01-02';
    required(required(modern.scheduleDSpecialGainSources).longTermAssets[0]).dateAcquired = '2011-01-02';
    const newer = calculateFederalTax(modern);
    expect(newer.capitalGainLoss.toFixed()).toBe('0');
    expect(newer.form6251?.lines.find(line => line.line === '2h')?.value.toFixed()).toBe('0');
});
it('keeps known ineligible gain taxable without a Q adjustment', () => {
    const input = qsbsReturnInput();
    required(required(input.section1202Sources).lots[0]).qualification.domesticCCorporationAtIssue = false;
    expect(required(calculateForm8949(input).longTermBoxE.transactions[0]).adjustmentCode).toBe('');
    expect(schedule(input).section1202Exclusion.toFixed()).toBe('0');
    expect(calculateFederalTax(input).capitalGainLoss.toFixed()).toBe('1000.25');
});
it('rejects missing and conflicting original QSBS return facts', () => {
    const bare = qsbsReturnInput('fund');
    bare.section1202Sources = undefined;
    expect(() => schedule(bare)).toThrow(/1202.*source/i);
    const missing = qsbsInput();
    expect(() => schedule(missing)).toThrow(/1202.*ScheduleD|QSBS.*source/i);
    const contradictory = qsbsReturnInput();
    required(required(contradictory.scheduleDSpecialGainSources).longTermAssets[0]).character = 'ordinary';
    expect(() => schedule(contradictory)).toThrow(/1202|QSBS/i);
    const incompleteYear = qsbsReturnInput();
    incompleteYear.taxpayer.taxYear = 2026;
    expect(() => calculateFederalTax(incompleteYear)).toThrow(/incomplete|not.*ready/i);
});
it('restores the full exclusion once in modified AMT carry income', () => {
    const source = qsbsReturnInput();
    const trade = required(required(source.form1099B[0]).transactions[0]), lot = required(required(source.section1202Sources).lots[0]);
    trade.proceeds = '1100';
    trade.costBasis = '100';
    lot.proceeds = '1100';
    lot.costBasis = '100';
    lot.basisIgnoringPostIssueAdditions = '100';
    lot.recognizedGain = '1000';
    Object.assign(required(required(source.scheduleDSpecialGainSources).longTermAssets[0]), { proceeds: '1100', costBasis: '100' });
    required(source.scheduleDSpecialGainSources).priorShortTermCapitalLoss = '-700';
    const input = actualNolInput('118750', { priorYear: { shortTermCapitalLoss: '-700' }, form1099B: source.form1099B,
        section1202Sources: source.section1202Sources, scheduleDSpecialGainSources: source.scheduleDSpecialGainSources });
    const regular = required(required(required(input.netOperatingLoss).vintages)[0]);
    required(required(input.netOperatingLoss).alternativeTax).vintages = [{ ...regular, sourceId: 'amt2021', originalLoss: '200000', openingCarryforward: '200000', section1411OriginalLoss: undefined }];
    const result = calculateFederalTax(input);
    expect(result.capitalGainLoss.toFixed()).toBe('-200');
    expect(result.netOperatingLoss?.modifiedIncome.taxableIncome.toFixed()).toBe('103300');
    expect(result.netOperatingLoss?.alternativeTax.amtiBeforeAtnol.toFixed()).toBe('118585');
    expect(result.netOperatingLoss?.alternativeTax.modifiedAmtiBeforeAtnol.toFixed()).toBe('119050');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('106727');
    expect(result.form6251?.amti.toFixed()).toBe(new Decimal('118585').minus('106727').toFixed());
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing complete synthetic QSBS source");
  return value;
}
