/** Spec: state/oh-2026-return-draft.yaml#pa-part-year-reciprocal-sources. */
import { z } from 'zod';
import { Ohio2026OrdinarySourcesSchema } from './ohio-2026-return-draft.js';
import { OhioReciprocalWageSourcesSchema } from './ohio-reciprocal-wage-sources.js';

export const OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD = 'oh-2026-pa-part-year-reciprocal-employee-draft-v1';

const domicilePeriodOriginal = OhioReciprocalWageSourcesSchema.shape.domicileOriginal
  .omit({ completeYearDomicileConfirmed: true }).extend({
    sourceTaxYear: z.literal(2026),
    domicileState: z.enum(['OH', 'PA']),
    completeDomicilePeriodConfirmed: z.literal(true),
  });
const payrollRow = OhioReciprocalWageSourcesSchema.shape.payrollRows.element.extend({
  pennsylvaniaWithheld: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/),
});
const partYearReciprocalWageSources = OhioReciprocalWageSourcesSchema.omit({ domicileOriginal: true }).extend({
  sourceTaxYear: z.literal(2026),
  domicileOriginals: z.array(domicilePeriodOriginal).length(2),
  payrollRows: z.array(payrollRow).min(2).max(366),
});

export const Ohio2026PaPartYearReciprocalSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: z.literal(OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD),
  partYearReciprocalWageSources,
});
