/** Spec: state/oh-2026-return-draft.yaml. No zero or confirmation defaults. */
import { z } from 'zod';
import { OhioReciprocalWageSourcesSchema } from './ohio-reciprocal-wage-sources.js';
import { Ohio2026ResidentCreditSourcesSchema } from './ohio-2026-resident-credit-sources.js';
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
  seniorCreditHistory: z.array(z.object({
    accountHolder: z.enum(['primary', 'spouse']), dateOfBirth: date, sourceReference: reference,
    completeOhioCreditHistoryConfirmed: z.literal(true),
    noPriorSeniorLumpSumElectionConfirmed: z.literal(true),
    noRetirementCreditCarryforwardConfirmed: z.literal(true),
  }).strict()).min(1).max(2).optional(),
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

/** Current ordinary Box 1 only. Box 2 has two existing input aliases. */
export const Ohio2026UnemploymentOriginalSchema = z.object({
  payer: reference, payerTin: reference.optional(), accountHolder: z.literal('primary'),
  sourceId: reference, accountReference: reference, taxYear: z.literal(2026), sourceFormRevision: z.literal('2026-12'),
  sourceFactsComplete: z.literal(true), sourceFactsConfirmed: z.literal(true), actualReceiptConfirmed: z.literal(true),
  additionalWorksheetRequired: z.literal(false), programType: z.literal('government-unemployment'),
  unemploymentCompensation: money, stateLocalIncomeTaxRefund: money.optional(), stateOrLocalTaxRefund: money.optional(),
  federalWithheld: money, rtaaPayments: money, taxableGrants: money, agriculturePayments: money, marketGain: money,
  familyLeaveBenefits: money, tradeOrBusinessRefund: z.literal(false), currentYearRepaid: money, priorYearRepaid: money,
  unrecoveredAfterTaxContributions: money, stateTaxReporting: z.literal('none'), stateWithheld: money.optional(),
}).strict().refine(form => form.stateLocalIncomeTaxRefund !== undefined || form.stateOrLocalTaxRefund !== undefined);

export const Ohio2026UnemploymentEmployeeSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: z.literal('oh-2026-unemployment-employee-draft-v1'),
  unemploymentOriginal: z.object({
    sourceId: reference, sourceReference: reference,
    recipient: z.object({ firstName: reference, lastName: reference, ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/) }).strict(),
    currentUncorrectedNonvoidOriginalConfirmed: z.literal(true), allOriginalBoxesKnownConfirmed: z.literal(true),
    ordinaryNoncontributoryStateUnemploymentConfirmed: z.literal(true), noStateWithholdingConfirmed: z.literal(true),
  }).strict(),
}).strict();
export type Ohio2026UnemploymentEmployeeSources = z.infer<typeof Ohio2026UnemploymentEmployeeSourcesSchema>;

/** Separate current Form 1099-INT and actual direct Treasury coupon evidence. */
const treasuryCusip = z.string().regex(/^912[0-9A-Z]{5}[0-9]$/);
export const Ohio2026TreasuryCouponEmployeeSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: z.literal('oh-2026-treasury-coupon-employee-draft-v1'),
  treasuryCouponOriginal: z.object({
    sourceReference: reference, sourceTaxYear: z.literal(2026),
    custodianName: reference, custodianTin: z.string().regex(/^\d{2}-?\d{7}$/), accountReference: reference,
    recipient: z.object({
      accountHolder: z.literal('primary'), firstName: reference, lastName: reference, ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/),
    }).strict(),
    currentUncorrectedNonvoidOriginalConfirmed: z.literal(true), allOriginalBoxesKnownConfirmed: z.literal(true),
    noOtherOriginalReportingConfirmed: z.literal(true),
    security: z.object({
      sourceReference: reference, cusip: treasuryCusip, accountReference: reference,
      issuer: z.literal('us_treasury'), type: z.enum(['treasury_note', 'treasury_bond']),
      directBeneficialHoldingConfirmed: z.literal(true), conventionalFixedCouponConfirmed: z.literal(true),
    }).strict(),
    receipt: z.object({
      sourceReference: reference, cusip: treasuryCusip, accountReference: reference,
      paidOn: date, amount: money, currency: z.literal('USD'),
      actualGrossCashCouponConfirmed: z.literal(true), noTimingBasisOrReportingAdjustmentsConfirmed: z.literal(true),
    }).strict(),
  }).strict(),
}).strict();
export type Ohio2026TreasuryCouponEmployeeSources = z.infer<typeof Ohio2026TreasuryCouponEmployeeSourcesSchema>;

export const ohio2026BankInterestMethodByResidency = {
  full_year_resident: 'oh-2026-full-year-bank-interest-employee-draft-v1',
  part_year_resident: 'oh-2026-part-year-bank-interest-employee-draft-v1',
  nonresident: 'oh-2026-nonresident-bank-interest-employee-draft-v1',
} as const;
export const Ohio2026BankInterestMethodSchema = z.enum(ohio2026BankInterestMethodByResidency);
const currentInvestmentOriginal = {
  sourceTaxYear: z.literal(2026), sourceReference: reference,
  payerName: reference, payerTin: z.string().regex(/^\d{2}-?\d{7}$/), accountReference: reference,
  recipient: z.object({
    accountHolder: z.literal('primary'), firstName: reference, lastName: reference, ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/),
  }).strict(),
  currentUncorrectedNonvoidOriginalConfirmed: z.literal(true), allOriginalBoxesKnownConfirmed: z.literal(true),
  noOtherOriginalReportingConfirmed: z.literal(true),
};
const availableInvestmentCredit = z.object({
  sourceReference: reference, accountReference: reference, creditedOn: date, amount: money,
  availableOnCreditDateConfirmed: z.literal(true),
});

/** Current Box 1 and dated credits from one ordinary domestic deposit account. */
export const Ohio2026BankInterestEmployeeSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: Ohio2026BankInterestMethodSchema,
  bankInterestOriginal: z.object({
    ...currentInvestmentOriginal,
    otherBoxAmounts: z.object({
      earlyWithdrawalPenalty: money,
      usSavingsBondInterest: money,
      federalWithheld: money,
      foreignTaxPaid: money,
      taxExemptInterest: money,
      privateActivityBondInterest: money,
      stateWithheld: money,
    }).strict(),
    cashMethodOrdinaryDomesticDepositConfirmed: z.literal(true),
    completeActualBankCreditsConfirmed: z.literal(true),
    credits: z.array(availableInvestmentCredit.strict()).min(1).max(366),
  }).strict(),
}).strict();
export type Ohio2026BankInterestEmployeeSources = z.infer<typeof Ohio2026BankInterestEmployeeSourcesSchema>;

export const ohio2026CashDividendMethodByResidency = {
  full_year_resident: 'oh-2026-full-year-cash-dividend-employee-draft-v1',
  part_year_resident: 'oh-2026-part-year-cash-dividend-employee-draft-v1',
  nonresident: 'oh-2026-nonresident-cash-dividend-employee-draft-v1',
} as const;
export const Ohio2026CashDividendMethodSchema = z.enum(ohio2026CashDividendMethodByResidency);

/** Current Box 1a and dated receipts from directly held domestic corporate shares. */
export const Ohio2026CashDividendEmployeeSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: Ohio2026CashDividendMethodSchema,
  cashDividendOriginal: z.object({
    ...currentInvestmentOriginal,
    completeAccountReferenceConfirmed: z.literal(true),
    cashMethodOrdinaryDirectDomesticHoldingConfirmed: z.literal(true),
    completeActualCashDistributionsConfirmed: z.literal(true),
    credits: z.array(availableInvestmentCredit.extend({
      domicileStateAtCredit: Ohio2026OrdinaryStateSchema,
    }).strict()).min(1).max(366),
  }).strict(),
}).strict();
export type Ohio2026CashDividendEmployeeSources = z.infer<typeof Ohio2026CashDividendEmployeeSourcesSchema>;

/** Both current investment originals are required by this distinct part-year method. */
export const OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD = 'oh-2026-part-year-bank-interest-and-cash-dividend-employee-draft-v1';
export const Ohio2026PartYearBankInterestAndDividendsSourcesSchema = Ohio2026BankInterestEmployeeSourcesSchema.extend({
  methodId: z.literal(OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD),
  cashDividendOriginal: Ohio2026CashDividendEmployeeSourcesSchema.shape.cashDividendOriginal,
});
export type Ohio2026PartYearBankInterestAndDividendsSources = z.infer<typeof Ohio2026PartYearBankInterestAndDividendsSourcesSchema>;

/** Separate current documentary method; ordinary packets keep their strict schema. */
export const Ohio2026PaReciprocalSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({ seniorCreditHistory: true }).extend({
  methodId: z.literal('oh-2026-pa-reciprocal-employee-draft-v1'),
  reciprocalWageSources: OhioReciprocalWageSourcesSchema.extend({
    sourceTaxYear: z.literal(2026), payrollRows: OhioReciprocalWageSourcesSchema.shape.payrollRows.max(366),
  }),
}).strict();

/** Distinct paid Virginia originals; incompatible no-other-tax confirmations cannot coexist. */
export const Ohio2026VaResidentCreditSourcesSchema = Ohio2026OrdinarySourcesSchema.omit({
  noOtherOhioCreditSourcesConfirmed: true,
  noOtherStateTaxOnOhioResidentIncomeConfirmed: true,
  seniorCreditHistory: true,
}).extend({
  methodId: z.literal('oh-2026-va-resident-credit-employee-draft-v1'),
  noOtherStateTaxBeyondDocumentedVirginiaConfirmed: z.literal(true),
  noOtherOhioCreditBeyondDocumentedResidentCreditConfirmed: z.literal(true),
  residentCreditSources: Ohio2026ResidentCreditSourcesSchema,
}).strict();

/** Spec: state/oh-2026-actual-balance-payment.yaml. Documentary reported-balance projection, not a tax credit or external account observation. */
export interface Ohio2026ActualBalancePaymentProjection {
  methodVersion: 'oh-2026-actual-timely-small-balance-v1';
  status: 'actual_paid_on_time';
  actualPaymentDate: string;
  actualBalancePaymentApplied: import('decimal.js').default;
  outstandingTaxBalance: import('decimal.js').default;
}
