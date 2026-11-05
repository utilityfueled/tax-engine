/** Spec: state/oh-2026-return-draft.yaml. No zero or confirmation defaults. */
import { z } from 'zod';
import { W2StateLocalSourcesSchema } from './w2-state-local.js';
export const Ohio2026OrdinaryStateSchema = W2StateLocalSourcesSchema.shape.stateRows.element.shape.state.exclude(['']);
const reference = z.string().trim().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
export const Ohio2026OrdinarySourcesSchema = z.object({
  taxYear: z.literal(2026), sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  originalFederalSources: z.record(z.string(), z.unknown()),
  allIncomeAndAdjustmentOriginalsIncludedConfirmed: z.literal(true),
  noOtherIncomeOrAdjustmentSourcesConfirmed: z.literal(true),
  noQualifyingEitcChildrenConfirmed: z.literal(true),
  noOtherOhioCreditSourcesConfirmed: z.literal(true),
  noOtherStateTaxOnOhioResidentIncomeConfirmed: z.literal(true),
  noTaxingSchoolDistrictResidencyConfirmed: z.literal(true),
  noOtherPaymentOrRefundableCreditSourcesConfirmed: z.literal(true),
  employmentOriginals: z.array(z.object({
    w2Index: z.number().int().nonnegative(), sourceReference: reference, sourceTaxYear: z.literal(2026),
    accountHolder: z.enum(['primary', 'spouse']), employerTin: reference, employerName: reference,
    entityType: z.literal('c_corporation'), ordinaryEmployeeCompensationConfirmed: z.literal(true),
    allServiceAndPaymentPeriodsIncludedConfirmed: z.literal(true),
    serviceRows: z.array(z.object({
      sourceId: reference, sourceReference: reference, from: date, to: date, paymentDate: date,
      serviceState: Ohio2026OrdinaryStateSchema, wages: money,
    }).strict()).min(1).max(366),
  }).strict()).min(1).max(20),
}).strict();
export type Ohio2026OrdinarySources = z.infer<typeof Ohio2026OrdinarySourcesSchema>;
