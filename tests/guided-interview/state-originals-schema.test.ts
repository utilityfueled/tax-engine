import {it,expect} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {ohioPaymentFixture} from '../fixtures/oh-payments.js';
import {paReciprocityFixture} from '../fixtures/pa-reciprocity.js';
// Spec: state/guided-state-originals.yaml#canonical-originals
it('state originals canonical schema retains actual private source packets',()=>{
 const ohio=ohioPaymentFixture();const round=TaxYearInputSchema.parse(ohio) as unknown as Record<string,unknown>;
 expect(round.ohioResidency).toEqual(ohio.ohioResidency);expect(round.ohioPayments).toEqual(ohio.ohioPayments);
 const pa=paReciprocityFixture();const input={...pa.input,paResidencySources:pa.residencySources,paReciprocitySources:pa.reciprocalSources};
 const parsed=TaxYearInputSchema.parse(input) as unknown as Record<string,unknown>;
 expect(parsed.paResidencySources).toEqual(pa.residencySources);expect(parsed.paReciprocitySources).toEqual(pa.reciprocalSources);
});
// Spec: state/guided-state-originals.yaml#reject-malformed
it('state originals canonical schema rejects malformed packets',()=>{
 for(const key of ['ohioResidency','ohioPayments','paResidencySources','paReciprocitySources'])expect(TaxYearInputSchema.safeParse({...paReciprocityFixture().input,[key]:{taxYear:'unknown'}}).success,key).toBe(false);
});
