// Spec: spec/federal/nonitemized-charitable-election.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm1040 } from '@/pdf/fill-form-1040.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { nonitemizedCharityFixture } from '../fixtures/nonitemized-charity.js';
it('keeps the new election out of unsupported historical and future export paths', async () => {
  const input = nonitemizedCharityFixture();
  expect(() => calculateFederalTax(input)).toThrow(/not.*ready|incomplete|unavailable|not.*available/i);
  const historical = calculateFederalTax(simpleW2Fixture);
  await expect(fillReturn(input, { ...historical, taxYear: 2026, deductionUsed: 'nonitemized' }, { outputDir: 'tmp/should-not-be-written' })).rejects.toThrow(/2026.*unavailable|no.*2026|2026.*not/i);
  const forged = { ...historical, deductionUsed: 'nonitemized' as const };
  await expect(fillReturn(simpleW2Fixture, forged, { outputDir: 'tmp/should-not-be-written', blankFormsDir: 'missing-nonitemized-template' })).rejects.toThrow(/nonitemized.*2026|2025.*nonitemized/i);
  await expect(fillForm1040(simpleW2Fixture, forged, 'missing-nonitemized-template')).rejects.toThrow(/nonitemized.*2026|2025.*nonitemized/i);
});
