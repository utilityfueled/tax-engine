/** Spec: state/oh-reciprocal-wage-sources.yaml. Finite actual2025 employee originals. */
import { z } from 'zod';
const ref = z.string().trim().min(1);
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const year = z.number().int().min(2025).max(2026);
const holder = z.enum(['primary','spouse']);
const period = { from: date, to: date, documentDate: date };
export const OhioReciprocalWageSourcesSchema = z.object({
  sourceTaxYear: year, sourceReference: ref, sourceFactsConfirmed: z.literal(true),
  allIncomeOriginalsIncludedConfirmed: z.literal(true), noOtherIncomeOrAdjustmentsConfirmed: z.literal(true), noSpecialCompensationConfirmed: z.literal(true),
  accountHolder: holder, originalTaxpayer: z.object({firstName: ref,lastName: ref,ssn: ref}).strict(),
  w2Index: z.literal(0), originalW2: z.record(z.string(),z.unknown()),
  domicileOriginal: z.object({sourceId: ref,sourceTaxYear: year,accountHolder: holder,name: ref,ssn: ref,...period,domicileState: z.string().regex(/^[A-Z]{2}$/),completeYearDomicileConfirmed: z.literal(true)}).strict(),
  employerEntityOriginal: z.object({sourceId: ref,sourceTaxYear: year,employerTin: ref,employerName: ref,entityType: z.enum(['c_corporation','pass_through_20_percent_owner']),...period,notPassThroughOrPEOConfirmed: z.literal(true)}).strict(),
  serviceOriginal: z.object({sourceId: ref,sourceTaxYear: year,accountHolder: holder,employerTin: ref,...period,allCompensationOrdinaryOhioEmployeeServicesConfirmed: z.literal(true),totalCompensation: money}).strict(),
  payrollRows: z.array(z.object({sourceId: ref,sourceReference: ref,accountHolder: holder,sourceTaxYear: year,employerTin: ref,servicePeriodFrom: date,servicePeriodTo: date,paymentDate: date,serviceState: z.string().regex(/^[A-Z]{2}$/),wages: money,ohioWithheld: money}).strict()).min(1),
}).strict();
export type OhioReciprocalWageSources = z.infer<typeof OhioReciprocalWageSourcesSchema>;
