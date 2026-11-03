import {PAOrdinaryRoyaltySourcesSchema} from './pa-ordinary-royalty-sources.js';
/** Private actual PA originals/drafts. No amount, date, answer or source year defaults to a fact. */
import { z } from "zod";
import {PAPersonalDebtDischargeSourceSchema,PAForeignBankTaxSourceSchema} from "./pa-personal-debt-foreign-sources.js";
import {PAOrdinaryDigitalSourcesSchema} from "./pa-ordinary-digital-sources.js";
import {PAOrdinaryBusinessSourceSchema} from "./pa-ordinary-business-sources.js";
import {PAOrdinaryOIDSourcesSchema} from "./pa-ordinary-oid-sources.js";
import { PAOrdinaryEmployeeSourcesSchema } from "./pa-ordinary-employee-sources.js";
import {PAOrdinaryDividendSourceSchema} from "./pa-ordinary-investment-sources.js";

import {PARetirementSourcesSchema}from "./pa-retirement-sources.js";

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
  // Absence is compatible only when no original1099DIV exists; replay enforces complete coverage.
  dividends: z.array(PAOrdinaryDividendSourceSchema).optional(),
  // Absent only when no actual Schedule C/NEC original exists; replay enforces coverage.
  businesses: z.array(PAOrdinaryBusinessSourceSchema).optional(),
  royaltySources: PAOrdinaryRoyaltySourcesSchema.optional(),
  oidAndMiscSources: PAOrdinaryOIDSourcesSchema.optional(),
  employeeSources: PAOrdinaryEmployeeSourcesSchema.optional(),
  digitalSources: PAOrdinaryDigitalSourcesSchema.optional(),
  retirementSources: PARetirementSourcesSchema.optional(),
  personalDebtDischarges: z.array(PAPersonalDebtDischargeSourceSchema).optional(),
  foreignBankTaxSources: z.array(PAForeignBankTaxSourceSchema).optional(),
  otherPAIncomeClassesConfirmedNone: answer, otherPAAdjustmentsConfirmedNone: answer,
}).strict();

export type PAResidencySources = z.infer<typeof PAResidencySourcesSchema>;
export type PAResidencyStatus = Exclude<PAResidencySources["residency"]["status"], "">;
