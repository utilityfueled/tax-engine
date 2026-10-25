// Literal statutory examples: spec/federal/section-1202.yaml.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateSection1202, type Section1202Input } from '@/engine/forms/section-1202.js';
const d = (value: string) => new Decimal(value);
function fixture(): Section1202Input {
  return { taxYear: 2026, filingStatus: 'single', sourceFactsConfirmed: true,
    issuers: [{ issuerId: 'synthetic-a', sourceReference: 'Private issuer history', allPriorUseAndCurrentDispositionsConfirmed: true, priorEligibleGainUsed: d('0') }],
    lots: [{ sourceId: 'lot-a', issuerId: 'synthetic-a', sourceReference: 'Private original stock source', qualifiedStock: true,
      acquisitionMethod: 'original_issue',
      originalIssueDate: '2008-01-02', effectiveAcquiredDate: '2008-01-02', dateSold: '2026-06-30',
      recognizedGain: d('1000'), basisIgnoringPostIssueAdditions: d('100'), empowermentZoneGainThrough2018: d('0') }],
  };
}
describe('Actual section1202 issuer and acquisition arithmetic', () => {
  it('requires actual transfer sources instead of rejecting a tacked date as impossible', () => {
    for (const method of ['gift', 'inheritance', 'partnership_distribution', 'conversion', 'section351_or_368', undefined]) {
      const input = fixture();
      Object.assign(input.lots[0], { acquisitionMethod: method, originalIssueDate: '2020-01-02', effectiveAcquiredDate: '2008-01-02' });
      expect(() => calculateSection1202(input)).toThrow(/transfer.*predecessor.*exchange/i);
    }
  });
  it('uses the actual acquisition cohort and strict five year boundary', () => {
    for (const [date, excluded, preference, rateGain] of [
      ['2009-02-17', '500', '35', '500'], ['2009-02-18', '750', '52.5', '250'],
      ['2010-09-27', '750', '52.5', '250'], ['2010-09-28', '1000', '0', '0'],
      ['2021-06-29', '1000', '0', '0'], ['2021-06-30', '0', '0', '0'], ['2025-07-05', '0', '0', '0'],
    ]) {
      const input = fixture(); input.lots[0].originalIssueDate = date; input.lots[0].effectiveAcquiredDate = date;
      const result = calculateSection1202(input);
      expect(result.exclusion.toString(), date).toBe(excluded);
      expect(result.amtPreference.toString(), date).toBe(preference);
      expect(result.section1202WorksheetComponent.toString(), date).toBe(rateGain);
    }
  });
  it('uses issuer history and aggregate original basis before exclusion percentage', () => {
    const input = fixture(); input.lots[0].recognizedGain = d('8000000');
    input.issuers[0].priorEligibleGainUsed = d('9000000');
    input.lots[0].basisIgnoringPostIssueAdditions = d('200000');
    expect(calculateSection1202(input).exclusion.toString()).toBe('1000000'); //2Meligible,50percent
    input.lots.push({ ...input.lots[0], sourceId: 'short-held-loss', originalIssueDate: '2025-07-05', effectiveAcquiredDate: '2025-07-05', recognizedGain: d('-100'), basisIgnoringPostIssueAdditions: d('100000') });
    expect(calculateSection1202(input).exclusion.toString()).toBe('1500000'); //3Maggregate basis alternative
    input.filingStatus = 'married_filing_separately'; input.issuers[0].priorEligibleGainUsed = d('0');
    expect(calculateSection1202(input).exclusion.toString()).toBe('2500000');
    input.filingStatus = 'married_filing_jointly';
    expect(calculateSection1202(input).exclusion.toString()).toBe('4000000');
    input.issuers[0].priorEligibleGainUsed = d('12000000');
    expect(calculateSection1202(input).exclusion.toString()).toBe('1500000'); //basis alternative survives prior dollar exhaustion
  });
  it('requires and validates actual mixed rate allocations when a cap binds', () => {
    const input = fixture(); input.issuers[0].priorEligibleGainUsed = d('9999000');
    input.lots[0].basisIgnoringPostIssueAdditions = d('0');
    input.lots.push({ ...input.lots[0], sourceId: 'lot-b', effectiveAcquiredDate: '2011-01-01', originalIssueDate: '2011-01-01' });
    expect(() => calculateSection1202(input)).toThrow(/allocation/i);
    input.issuers[0].eligibleGainAllocations = [
      { sourceId: 'lot-a', ordinaryEligibleGain: d('200'), empowermentEligibleGain: d('0') },
      { sourceId: 'lot-b', ordinaryEligibleGain: d('800'), empowermentEligibleGain: d('0') },
    ];
    const result = calculateSection1202(input);
    expect(result.exclusion.toString()).toBe('900');
    expect(result.section1202WorksheetComponent.toString()).toBe('100');
    expect(result.amtPreference.toString()).toBe('7');
    expect(result.recognizedGainAfterExclusion.toString()).toBe('1100');
    input.issuers[0].eligibleGainAllocations[1].ordinaryEligibleGain = d('801');
    expect(() => calculateSection1202(input)).toThrow(/allocation/i);
    input.issuers[0].eligibleGainAllocations[1].ordinaryEligibleGain = d('799');
    expect(() => calculateSection1202(input)).toThrow(/allocation/i);
    input.issuers[0].eligibleGainAllocations[1].sourceId = 'lot-a';
    expect(() => calculateSection1202(input)).toThrow(/allocation|duplicate/i);
  });
  it('preserves cents and keeps separate issuer caps', () => {
    const input = fixture(); input.lots[0].recognizedGain = d('10000000.03');
    input.issuers.push({ ...input.issuers[0], issuerId: 'synthetic-b' });
    input.lots.push({ ...input.lots[0], sourceId: 'lot-b', issuerId: 'synthetic-b', recognizedGain: d('123.45') });
    const result = calculateSection1202(input);
    expect(result.exclusion.toString()).toBe('5000061.725');
    expect(result.amtPreference.toString()).toBe('350004.32075');
    expect(result.recognizedGainAfterExclusion.toString()).toBe('5000061.755');
    expect(JSON.stringify(result.lines)).not.toContain('Private');
    expect(JSON.stringify(result.lines)).not.toContain('synthetic-a');
  });
  it('uses only the actual pre2019 empowerment gain', () => {
    const input = fixture(); input.lots[0].empowermentZoneGainThrough2018 = d('400');
    const result = calculateSection1202(input);
    expect(result.exclusion.toString()).toBe('540'); //600*.5+400*.6
    expect(result.section1202WorksheetComponent.toString()).toBe('460');
    expect(result.amtPreference.toString()).toBe('37.8');
    input.lots[0].effectiveAcquiredDate = '2000-12-21'; input.lots[0].originalIssueDate = '2000-12-21';
    expect(() => calculateSection1202(input)).toThrow(/empowerment/i);
    input.lots[0].effectiveAcquiredDate = '2000-12-22'; input.lots[0].originalIssueDate = '2000-12-22';
    expect(calculateSection1202(input).exclusion.toString()).toBe('540');
  });
  it('rejects incomplete conflicting and invalid source facts', () => {
    const changes: Array<(input: Section1202Input) => void> = [
      input => { input.taxYear = 2027; }, input => { input.sourceFactsConfirmed = false; },
      input => { input.issuers[0].allPriorUseAndCurrentDispositionsConfirmed = false; },
      input => { input.issuers[0].sourceReference = ''; }, input => { input.issuers[0].priorEligibleGainUsed = d('-1'); },
      input => { input.issuers[0].priorEligibleGainUsed = d('NaN'); }, input => { input.issuers.push({ ...input.issuers[0] }); },
      input => { input.lots.push({ ...input.lots[0] }); }, input => { input.lots[0].issuerId = 'unknown'; },
      input => { input.lots[0].originalIssueDate = '1993-08-10'; }, input => { input.lots[0].dateSold = '2026-02-30'; },
      input => { input.lots[0].dateSold = '2025-06-30'; }, input => { input.lots[0].effectiveAcquiredDate = '2026-07-01'; },
      input => { input.lots[0].basisIgnoringPostIssueAdditions = d('-1'); }, input => { input.lots[0].recognizedGain = d('Infinity'); },
      input => { input.lots[0].empowermentZoneGainThrough2018 = d('1000.01'); },
      input => { input.lots[0].qualifiedStock = undefined as unknown as boolean; },
      input => { input.lots[0].empowermentZoneGainThrough2018 = undefined as unknown as Decimal; },
    ];
    for (const change of changes) { const input = fixture(); change(input); expect(() => calculateSection1202(input)).toThrow(); }
    const knownIneligible = fixture(); knownIneligible.lots[0].qualifiedStock = false;
    expect(calculateSection1202(knownIneligible).exclusion.toString()).toBe('0');
  });
});
