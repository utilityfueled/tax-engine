// Spec: state/pa-personal-debt-foreign-sources.yaml. No new product dependency.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {paPersonalCodForeignFixture} from '../../fixtures/pa-personal-debt-foreign-sources';
it('fictional PA supplement preserves original federal deduction carry327 and145',()=>{const f=paPersonalCodForeignFixture(),federal=calculateFederalTax(f.input);expect(federal.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('327');expect(federal.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0]?.amount.toFixed()).toBe('145');expect(f.input.netOperatingLoss?.vintages).toEqual([]);});
