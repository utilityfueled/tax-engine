// Spec: spec/federal/form-172-operating-k1.yaml original-operating-review.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { prepareCharitableReview } from '@/pdf/charitable-review-context';
import { prepareQbiLossReview } from '@/pdf/qbi-loss-review-context';
import { buildNetOperatingLossReview } from '@/pdf/fill-net-operating-loss';
import { fillForm6251 } from '@/pdf/mappings/2025/fill-form-6251';
import { fillReturn } from '@/pdf/fill-return';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { operatingK1CharitableOriginInput, operatingK1OriginInput, requireOperatingSource as required } from '../fixtures/form-172-operating-k1';

it('binds operating K1 classification and loss output to original private sources', async () => {
  for (const input of [operatingK1CharitableOriginInput(), operatingK1OriginInput()]) {
    const result = calculateFederalTax(input), token = prepareQbiLossReview(input);
    const charitable = input.k1CharitableSources ? prepareCharitableReview(input) : undefined;
    const redacted = redactReviewIdentifiers(input);
    const rows = buildNetOperatingLossReview(redacted, result, undefined, undefined, charitable, token).join(' ');
    expect(rows).toContain(`Operating K1 1 allowed ordinary business income: ${input.k1CharitableSources ? '-40000' : '-60000'}`);
    for (const text of ['123456789', '123-45-6789', 'Fictional current operating participation records']) expect(rows).not.toContain(text);
    for (const change of [
      (source: typeof input) => { required(source.form172?.businessSources)[0].sourceReference = 'Changed actual reference'; },
      (source: typeof input) => { required(source.qbiLossSources?.activities)[0].recipientTaxpayerIdLast4 = '1111'; },
      (source: typeof input) => { source.qbiLossSources = undefined; },
    ]) {
      const changed = structuredClone(redacted); change(changed);
      await expect(fillReturn(changed, result, { blankFormsDir: '/not-an-operating-template', outputDir: '/not-an-operating-output',
        charitableReview: charitable, qbiLossReview: token })).rejects.toThrow(/source|stale|original|reconcile/i);
    }
    const current = required(result.form172?.k1Sources); current.rows[0].allowedOrdinary = current.rows[0].allowedOrdinary.plus(1);
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, charitable, token)).toThrow(/source|reconcile/i);
    await expect(fillForm6251(redacted, result, '/not-an-operating-template.pdf', undefined, undefined, charitable, token)).rejects.toThrow(/source|reconcile/i);
    current.rows[0].allowedOrdinary = current.rows[0].allowedOrdinary.minus(1);
    current.ordinaryBusinessIncome = d('0');
    expect(() => buildNetOperatingLossReview(redacted, result, undefined, undefined, charitable, token)).toThrow(/source|reconcile/i);
  }
});
