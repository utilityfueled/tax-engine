/** Private original-bound employee drafts. Spec: state/pa-ordinary-employee-sources.yaml. */
import { z } from 'zod';
import { W2StateLocalSourcesSchema } from './w2-state-local.js';
const answer = z.boolean().nullable();
const sourceYear = z.number().int().nullable();
const original = z.record(z.string(), z.unknown()).optional();
const state = W2StateLocalSourcesSchema.shape.stateRows.element.shape.state;
const expense = z.object({
  sourceReference: z.string(), receiptReference: z.string(), paidOn: z.string(),
  category: z.enum(['', 'union_dues', 'work_clothing', 'small_tools_supplies', 'occupational_license', 'overnight_meals', 'travel', 'home_office', 'moving', 'education', 'depreciation', 'other']),
  description: z.string(), amount: z.string(), ordinaryCustomaryConfirmed: answer,
  actuallyPaidConfirmed: answer, reasonableConfirmed: answer, necessaryConfirmed: answer,
  directlyRelatedConfirmed: answer, employerRequiredConfirmed: answer, notProvidedByEmployerConfirmed: answer,
  notEverydayClothingConfirmed: answer, requiredLicenseOrUnionMembershipConfirmed: answer,
  usefulLifeAtMostOneYearConfirmed: answer,
  reimbursementMethod: z.enum(['', 'none', 'exact_accounted_not_w2', 'fixed_allowance_not_w2', 'included_in_w2', 'unaccounted_partial', 'unaccounted_excess']),
  reimbursementReferences: z.array(z.string()),
}).strict();
const employer = z.object({
  originalIndex: z.number().int().nullable(), sourceTaxYear: sourceYear, sourceReference: z.string(), originalW2: original,
  sourceFactsConfirmed: answer, currentUncorrectedNonvoidOriginalConfirmed: answer,
  allOriginalBoxesKnownConfirmed: answer, ordinaryCashCompensationOnlyConfirmed: answer,
  employer: z.object({ name: z.string(), ein: z.string(), address: z.string(), telephone: z.string(), jobDuties: z.string() }).strict(),
  allocationMethod: z.enum(['', 'working_days', 'business_volume']),
  workplaceBasis: z.enum(['', 'suitable_PA', 'suitable_outside_PA']),
  specialInterstateOccupation: z.enum(['', 'none', 'railroad', 'motor_carrier', 'air_carrier', 'water_carrier']),
  employmentPeriods: z.array(z.object({ from: z.string(), through: z.string(), sourceReference: z.string() }).strict()),
  statement: z.object({
    documentReference: z.string(), documentAvailableConfirmed: answer, signed: answer,
    signerName: z.string(), signerRole: z.string(), signedOn: z.string(), fullCalendarAndOutsideDaysVerifiedConfirmed: answer,
    outsideWorkDates: z.array(z.string()), w2CorrectionExplanation: z.string(),
  }).strict(),
  calendar: z.array(z.object({
    date: z.string(), sourceReference: z.string(), kind: z.enum(['', 'working', 'nonworking']),
    nonworkingReason: z.enum(['', 'weekend_holiday', 'illness_disability', 'vacation_leave', 'other_employer']),
    travelClassification: z.enum(['', 'none', 'commute_only', 'transit_only', 'between_worksites']),
    locations: z.array(z.object({ state, compensatedWorkConfirmed: answer, employerRequiredOutsideWork: answer, transitOnly: answer }).strict()),
  }).strict()),
  payroll: z.array(z.object({ sourceReference: z.string(), paidOn: z.string(), serviceFrom: z.string(), serviceThrough: z.string(), grossCompensation: z.string() }).strict()),
  ue: z.object({
    sourceReference: z.string(), allExpenseAndReimbursementSourcesReviewedConfirmed: answer,
    otherExpenseClassesConfirmedNone: answer, expenses: z.array(expense),
    reimbursements: z.array(z.object({
      sourceReference: z.string(), paidOn: z.string(), amount: z.string(),
      method: z.enum(['', 'exact_accounted_not_w2', 'fixed_allowance_not_w2', 'included_in_w2', 'unaccounted_partial', 'unaccounted_excess']),
      expenseReferences: z.array(z.string()), includedInW2Confirmed: answer,
    }).strict()),
  }).strict(),
}).strict();
export const PAOrdinaryEmployeeSourcesSchema = z.object({
  sourceTaxYear: sourceYear, sourceReference: z.string(), sourceFactsConfirmed: answer, asOfDate: z.string(),
  owner: z.object({ accountHolder: z.enum(['', 'primary', 'spouse']), originalTaxpayer: z.object({ firstName: z.string(), lastName: z.string(), ssn: z.string() }).strict().optional() }).strict(),
  employers: z.array(employer),
}).strict();
export type PAOrdinaryEmployeeSources = z.infer<typeof PAOrdinaryEmployeeSourcesSchema>;
