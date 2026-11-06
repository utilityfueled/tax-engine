import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction.js';
import {actualW2ConsumerFixture} from '../fixtures/w2-state-local-consumers.js';
// Spec: federal/w2-state-local-canonical.yaml#retain-original
it('canonical W2 actual rows retain original facts through input parsing',()=>{for(const year of [2025,2026]){const f=actualW2ConsumerFixture(year);const parsed=TaxYearInputSchema.parse(f.input);expect((parsed.w2s[0] as typeof parsed.w2s[0]&{stateLocalSources?:unknown}).stateLocalSources).toEqual(f.sources);expect(calculateStateLocalIncomeTaxDeduction(parsed).total.toString()).toBe('5660');}});
// Spec: federal/w2-state-local-canonical.yaml#reject-malformed
it('canonical W2 actual rows reject malformed source packets',()=>{const f=actualW2ConsumerFixture();const malformed={...f.input,w2s:[{...f.input.w2s[0],stateLocalSources:{sourceTaxYear:'unknown'}}]};expect(TaxYearInputSchema.safeParse(malformed).success).toBe(false);});
