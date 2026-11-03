/** Spec: state/oh-return-header-sources.yaml. Actual documents; no location, year or tax defaults. */
import {z} from 'zod';
import {OhioResidencyFactsSchema} from './ohio-residency.js';
import {OhioPaymentFactsSchema} from './ohio-payments.js';
const reference=z.string().trim().min(1);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const address=z.object({street:reference,apt:z.string().optional(),city:reference,state:reference,zip:reference}).strict();
export const OHIO_HEADER_2025_BOOKLET_SHA256='931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e';
export const OhioReturnHeaderSourcesSchema=z.object({
 taxYear:z.literal(2025),sourceReference:reference,asOfDate:date,sourceFactsConfirmed:z.literal(true),
 owner:z.object({accountHolder:z.enum(['primary','spouse']),originalTaxpayer:z.object({firstName:reference,lastName:reference,ssn:reference,dateOfBirth:date}).strict()}).strict(),
 originalFederalSources:z.record(z.string(),z.unknown()),
 originalOhioResidencySources:OhioResidencyFactsSchema,
 originalOhioPaymentSources:OhioPaymentFactsSchema,
 residence:z.object({sourceReference:reference,originalAddress:address,periods:z.array(z.object({from:date,through:date,sourceReference:reference}).strict()).min(1),allOhioResidentialPeriodsIncludedConfirmed:z.literal(true)}).strict(),
 finderOriginal:z.object({sourceReference:reference,taxYear:z.literal(2025),lookupDate:date,originalAddress:address,districtCode:z.string().regex(/^\d{4}$/),districtName:reference,countyName:reference,schoolIncomeTax:z.enum(['none','reported']),officialResultMatchedConfirmed:z.literal(true)}).strict(),
 countyOriginal:z.object({sourceReference:reference,taxYear:z.literal(2025),recordDate:date,originalAddress:address,countyName:reference}).strict(),
 officialInventoryOriginal:z.object({sourceReference:reference,taxYear:z.literal(2025),publication:reference,publicationSha256:z.string().regex(/^[a-f0-9]{64}$/),printedPage:z.number().int().positive(),districtCode:z.string().regex(/^\d{4}$/),districtName:reference,rateDisplay:reference,taxBaseDisplay:reference,officialRowReviewedConfirmed:z.literal(true)}).strict(),
}).strict();
export type OhioReturnHeaderSources=z.infer<typeof OhioReturnHeaderSourcesSchema>;
