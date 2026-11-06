/** Spec: spec/state/oh-canonical-business-sources.yaml#draft2026-internal. */
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioCanonicalBusinessSource, readOhioCanonicalBusinessSource } from '@/engine/state/oh-business-source.js';
import { calculateOhio2026Baseline } from '@/engine/state/oh-2026-baseline.js';
import { calculateOhioITNRC } from '@/engine/state/oh-it-nrc.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { canonicalOhioBusinessFixture, canonicalOhioBusinessExpectations } from '../../fixtures/oh-canonical-business-sources.js';
const cases = canonicalOhioBusinessExpectations.filter(row => row.year === 2026).flatMap(row => (['nonresident', 'part_year_resident'] as const).map(status => [row.profit, status] as const));
it.each(cases)('derives actual2026 ordinary business under explicit draft methods with %s %s sources', (profit, status) => {
  const packet = canonicalOhioBusinessFixture(2026, profit, status);
  const original = JSON.stringify(packet);
  const context = calculateOhioCanonicalBusinessSource({ taxInput: packet.input, residencyFacts: packet.facts, draft2026: true });
  const value = readOhioCanonicalBusinessSource(context, packet.facts, packet.expected.federalAGI);
  expect(value.deductibleHalf.toFixed()).toBe(packet.expected.halfSE);
  expect(value.federalAgi.toFixed()).toBe(packet.expected.federalAGI);
  expect(value.worksheet.businessIncomeDeduction.toFixed()).toBe(packet.expected.BID);
  expect(value.worksheet.columnC.toFixed()).toBe(packet.expected.sectionIII18);
  expect(value.worksheet.ohioBusinessAfterDeduction.toFixed()).toBe(packet.expected.sectionI5);
  const base = calculateOhio2026Baseline({ taxYear: 2026, filingStatus: 'single', ohioAdjustedGrossIncome: value.ohioAgi,
    businessIncomeDeduction: value.worksheet.businessIncomeDeduction, qualifyingCapitalGainsAndPayrollDeduction: '0', taxableBusinessIncome: value.worksheet.businessIncomeBeforeDeductionCap.minus(value.worksheet.businessIncomeDeduction),
    eligibleExemptions: 1, precedingCredits: '0', primaryQualifyingIncome: '0' });
  expect(base.totalTax.toFixed()).toBe(packet.expected.taxBeforeNRC);
  const nrc = calculateOhioITNRC({ taxYear: 2026, filingStatus: 'single', federalAgi: value.federalAgi, ohioAgi: value.ohioAgi,
    taxRemainingBeforeResidencyCredits: base.totalTax, residencyFacts: packet.facts, businessSource: context });
  expect(nrc.line19.toFixed(4)).toBe(packet.expected.nonresidentRatio);
  expect(nrc.line20.toFixed()).toBe(packet.expected.NRC);
  expect(base.totalTax.minus(nrc.line20).toFixed()).toBe(packet.expected.taxAfterNRC);
  expect(TAX_CONSTANTS[2026]).toBeUndefined();
  expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
  expect(() => calculateFederalTax(packet.input)).toThrow(/incomplete; calculation is unavailable/);
  expect(JSON.stringify(packet)).toBe(original);
});
