/** Private actual PA originals/drafts. No amount, date, answer or source year defaults to a fact. */
import { z } from "zod";

const answer = z.boolean().nullable();
const sourceYear = z.number().int().nullable();
const period = z.object({ from: z.string(), through: z.string() }).strict();
const original = z.record(z.string(), z.unknown()).optional();
const payroll = z.object({
  sourceReference: z.string(), paidOn: z.string(), serviceFrom: z.string(), serviceThrough: z.string(),
  grossCompensation: z.string(), paServicesCompensation: z.string(), outsidePAServicesCompensation: z.string(),
}).strict();
const wageSource = z.object({
  originalIndex: z.number().int().nullable(), sourceTaxYear: sourceYear, sourceReference: z.string(),
  sourceFactsConfirmed: answer, original,
  ordinaryCashCompensationOnlyConfirmed: answer, noPAFederalCompensationDifferencesConfirmed: answer,
  currentUncorrectedNonvoidOriginalConfirmed: answer, allOriginalBoxesKnownConfirmed: answer,
  payroll: z.array(payroll),
}).strict();
const interestSource = z.object({
  originalIndex: z.number().int().nullable(), sourceTaxYear: sourceYear, sourceReference: z.string(),
  sourceFactsConfirmed: answer, original, ordinaryPersonalBankInterestConfirmed: answer,
  currentUncorrectedNonvoidOriginalConfirmed: answer, allOriginalBoxesKnownConfirmed: answer,
  credits: z.array(z.object({ creditedOn: z.string(), amount: z.string(), sourceReference: z.string() }).strict()),
}).strict();

export const PAResidencySourcesSchema = z.object({
  sourceTaxYear: sourceYear, sourceReference: z.string(), sourceFactsConfirmed: answer,
  owner: z.object({
    accountHolder: z.enum(["", "primary", "spouse"]),
    originalTaxpayer: z.object({ firstName: z.string(), lastName: z.string(), ssn: z.string() }).strict().optional(),
  }).strict(),
  residency: z.object({
    status: z.enum(["", "resident", "part_year", "nonresident"]), sourceReference: z.string(), factsConfirmed: answer,
    domicilePeriods: z.array(period.extend({ state: z.string(), daysInPA: z.number().int().nullable() }).strict()),
    paPermanentAbodePeriods: z.array(period), outsidePAPermanentAbodePeriods: z.array(period),
    moveAbandonmentNewDomicileAndPresenceConfirmed: answer,
    dec31PrincipalResidenceState: z.string(), schoolDistrictCode: z.string(), schoolDistrictName: z.string(),
  }).strict(),
  wages: z.array(wageSource), interest: z.array(interestSource),
  otherPAIncomeClassesConfirmedNone: answer, otherPAAdjustmentsConfirmedNone: answer,
}).strict();

export type PAResidencySources = z.infer<typeof PAResidencySourcesSchema>;
export type PAResidencyStatus = Exclude<PAResidencySources["residency"]["status"], "">;
