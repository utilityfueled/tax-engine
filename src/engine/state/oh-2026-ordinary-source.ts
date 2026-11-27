import {Ohio2026EarnedSchoolDraftSourcesSchema} from '@/models/ohio-2026-earned-school-draft.js';
import {calculateOhio2026SchoolDraftSource,readOhio2026SchoolSource,type Ohio2026SchoolSourceContext} from './oh-2026-school-source.js';
/** Spec: state/oh-2026-return-draft.yaml. Finite current employee originals only. */
import Decimal from 'decimal.js';
import {validateOhio2026ActualBalancePaymentSources} from './oh-2026-payment-source.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Form1099DivSchema, Form1099IntSchema, TaxpayerSchema, W2Schema, StandardDeductionFactsSchema, type TaxYearInput } from '@/models/inputs.js';
import { OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD, Ohio2026PaPartYearReciprocalSourcesSchema } from '@/models/ohio-2026-part-year-reciprocal-wage-sources.js';
import {
  Ohio2026BankInterestEmployeeSourcesSchema, ohio2026BankInterestMethodByResidency, type Ohio2026BankInterestEmployeeSources,
  Ohio2026CashDividendEmployeeSourcesSchema, ohio2026CashDividendMethodByResidency, type Ohio2026CashDividendEmployeeSources,
  Ohio2026OrdinarySourcesSchema, Ohio2026OrdinaryStateSchema, Ohio2026PaReciprocalSourcesSchema,
  OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD, Ohio2026PartYearBankInterestAndDividendsSourcesSchema,
  type Ohio2026PartYearBankInterestAndDividendsSources,
  Ohio2026TreasuryCouponEmployeeSourcesSchema, Ohio2026UnemploymentEmployeeSourcesSchema, Ohio2026UnemploymentOriginalSchema,
  Ohio2026VaResidentCreditSourcesSchema, type Ohio2026TreasuryCouponEmployeeSources, type Ohio2026UnemploymentEmployeeSources,
} from '@/models/ohio-2026-return-draft.js';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioResidencyFacts } from '@/models/ohio-residency.js';
import { OhioPaymentFactsSchema } from '@/models/ohio-payments.js';
import { FEDERAL_2026_INDEXED } from '@/models/federal-2026-indexed.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import { allocateOhioUnemploymentReceipts, assertOhio2026PrimaryResidencyDeclaration } from './oh-residency-source.js';
import { calculateOhio2026PartYearPaReciprocalWageSource, calculateOhio2026ReciprocalWageSource, readOhio2026ReciprocalWageSource, type Ohio2026ReciprocalWageContext } from './oh-2026-reciprocal-source.js';
import { calculateOhio2026ResidentCreditSource, readOhio2026ResidentCreditSource, type Ohio2026ResidentCreditSourceContext } from './oh-2026-resident-credit-source.js';
import { roundDollar } from '@/utils/decimal.js';
import { isIncompleteDividendAccountReference } from '@/utils/dividend-account-reference.js';

const federalDocumentCollections: ReadonlySet<string> = new Set([
  'form1099Int', 'form1099Div', 'form1099B', 'form1099DA', 'form1099Nec',
  'form1099Misc', 'form1099G', 'form1099OID', 'formW2G', 'form1099K', 'form1099C',
  'form1099Q', 'scheduleK1', 'scheduleK1Form1041', 'form1098', 'form1098E',
  'form1095A', 'donations', 'rentalProperties', 'savingsBondRedemptions',
  'form6252', 'form8814', 'homeSales', 'form8824',
] satisfies Array<keyof TaxYearInput>);

function stable(value: unknown): unknown {
  if (Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
const digest = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
const identity = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const tin = (value: string) => value.replace(/\D/g, '');
function fail(message: string): never { throw new Error(`Ohio2026 ordinary actual sources: ${message}`); }
function day(value: string): number {
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) fail('valid actual source date required');
  return n;
}
function cash(value: unknown): Decimal {
  if (typeof value !== 'string' || !/^\d{1,15}(?:\.\d{1,2})?$/.test(value)) fail('complete finite nonnegative exact original cash required');
  return new Decimal(value);
}
function qualifyUnemployment(input: TaxYearInput, facts: OhioResidencyFacts, original: Ohio2026UnemploymentEmployeeSources['unemploymentOriginal']) {
  const [owner] = facts.owners;
  if (input.taxpayer.filingStatus !== 'single' || owner?.accountHolder !== 'primary')
    fail('ordinary Box 1 unemployment requires a single primary owner');
  if (!Array.isArray(input.form1099G) || input.form1099G.length !== 1) fail('one confirmed current government unemployment original required');
  const form = Ohio2026UnemploymentOriginalSchema.safeParse(input.form1099G[0]);
  if (!form.success) fail('one confirmed current government unemployment original required');
  const primary = input.taxpayer.primary;
  if (original.sourceId !== form.data.sourceId || tin(original.recipient.ssn) !== tin(primary.ssn)
    || identity(original.recipient.firstName) !== identity(primary.firstName) || identity(original.recipient.lastName) !== identity(primary.lastName))
    fail('actual original unemployment recipient and reference differ');
  const box1 = cash(form.data.unemploymentCompensation);
  const otherAmounts = [form.data.stateLocalIncomeTaxRefund, form.data.stateOrLocalTaxRefund, form.data.rtaaPayments,
    form.data.taxableGrants, form.data.agriculturePayments, form.data.marketGain, form.data.familyLeaveBenefits,
    form.data.currentYearRepaid, form.data.priorYearRepaid, form.data.unrecoveredAfterTaxContributions, form.data.stateWithheld];
  if (!box1.gt(0) || !box1.isInteger() || cash(form.data.federalWithheld).gt(box1)
    || otherAmounts.some(amount => amount !== undefined && !cash(amount).isZero())) fail('unsupported original amounts require their separate Box 1 unemployment method');
  const { unemploymentPaymentSource: payment, unemploymentPaymentSchedule: schedule } = facts;
  const evidence = payment ?? schedule;
  if (!evidence || (payment && schedule) || evidence.originalSourceId !== form.data.sourceId) fail('one complete Box 1 receipt proof matching the current original required');
  const receipts = 'payments' in evidence ? evidence.payments : [evidence];
  for (const receipt of receipts) cash(receipt.amount);
  return { box1, residentAmount: allocateOhioUnemploymentReceipts(receipts, owner.periods, facts.taxYear, box1) };
}

const maskedAccountReference = /(?:(?:^|[\s-])(?:[*•●∙⋅·]+|\.{3,}|…)|(?:^|\s)x{4,})(?:[\s-]*\d+)?$/iu;
const accountEndingLabel = /(?:^|\s)(?:(?:ending|ends)\s+in|last\s+(?:four|4)(?:\s+digits)?)[\s:#-]*(?:(?:…|\.{3,})\s*)?\d+$/iu;
const bareAccountSuffix = /^\d{1,4}$/u;

function isIncompleteInvestmentAccount(reference: string): boolean {
  return maskedAccountReference.test(reference) || accountEndingLabel.test(reference) || bareAccountSuffix.test(reference);
}

function qualifyTreasuryCoupon(input: TaxYearInput, facts: OhioResidencyFacts, original: Ohio2026TreasuryCouponEmployeeSources['treasuryCouponOriginal']): Decimal {
  const [owner] = facts.owners;
  if (input.taxpayer.filingStatus !== 'single' || owner?.accountHolder !== 'primary' || owner.status !== 'full_year_resident')
    fail('direct Treasury coupon requires a single primary full-year Ohio resident');
  if (facts.unemploymentPaymentSource || facts.unemploymentPaymentSchedule)
    fail('retained unemployment receipts require their separate method');
  if (!Array.isArray(input.form1099Int) || input.form1099Int.length !== 1) fail('one current original Form 1099-INT required');
  const rawForm = input.form1099Int[0];
  const parsed = Form1099IntSchema.strict().safeParse(rawForm);
  if (!rawForm || !parsed.success) fail('one current original Form 1099-INT required');
  const form = parsed.data;
  if (form.taxYear !== original.sourceTaxYear || form.accountHolder !== original.recipient.accountHolder
    || !form.payerTin || !/^\d{2}-?\d{7}$/.test(form.payerTin) || !form.accountReference)
    fail('current original Form 1099-INT with payer TIN, recipient and account required');
  const primary = input.taxpayer.primary;
  const { recipient, security, receipt } = original;
  if (tin(recipient.ssn) !== tin(primary.ssn) || identity(recipient.firstName) !== identity(primary.firstName)
    || identity(recipient.lastName) !== identity(primary.lastName) || tin(original.custodianTin) !== tin(form.payerTin)
    || identity(original.custodianName) !== identity(form.payer) || original.accountReference !== form.accountReference)
    fail('actual Form 1099-INT recipient, custodian or account differs');
  if (security.cusip !== receipt.cusip || security.accountReference !== original.accountReference || receipt.accountReference !== original.accountReference)
    fail('actual Treasury security and receipt do not match the custodian account or CUSIP');
  if (isIncompleteInvestmentAccount(original.accountReference))
    fail('a stable account reference is required to match the Form 1099-INT, security, and receipt');
  if (new Set([original.sourceReference, security.sourceReference, receipt.sourceReference].map(identity)).size !== 3)
    fail('distinct original Form 1099-INT, security and receipt references required');
  day(receipt.paidOn);
  if (receipt.paidOn < '2026-01-01' || receipt.paidOn > '2026-12-31') fail('actual Treasury coupon payment must be in current calendar 2026');
  const otherAmounts = [rawForm.interestIncome, rawForm.earlyWithdrawalPenalty, rawForm.federalWithheld, rawForm.foreignTaxPaid,
    rawForm.taxExemptInterest, rawForm.privateActivityBondInterest, rawForm.stateWithheld];
  if (otherAmounts.includes(undefined)) fail('unknown original boxes must be documented for the Form 1099-INT Treasury coupon method');
  if (form.foreignCountry !== undefined || form.state !== undefined || form.privateActivityBondFacts !== undefined
    || otherAmounts.some(amount => !cash(amount).isZero())
    || Object.values(original.otherBoxAmounts).some(amount => !cash(amount).isZero())
    || (form.paDirectObligationInterest !== undefined && !cash(form.paDirectObligationInterest).isZero()))
    fail('other interest or withholding requires its separate Form 1099-INT method');
  const coupon = cash(receipt.amount);
  if (!coupon.gt(0) || !coupon.eq(cash(form.usSavingsBondInterest))) fail('actual Treasury cash coupon does not reconcile to Box 3');
  return coupon;
}

/** Spec: state/oh-2026-return-draft.yaml#bank-interest-method-residency. */
function qualifyBankInterest(input: TaxYearInput, facts: OhioResidencyFacts,
  source: Ohio2026BankInterestEmployeeSources | Ohio2026PartYearBankInterestAndDividendsSources) {
  const [owner] = facts.owners;
  const { bankInterestOriginal: original } = source;
  if (input.taxpayer.filingStatus !== 'single' || owner?.accountHolder !== 'primary')
    fail('bank interest requires a single primary ordinary employee');
  const partYearCombined = source.methodId === OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD && owner.status === 'part_year_resident';
  if (!partYearCombined && source.methodId !== ohio2026BankInterestMethodByResidency[owner.status])
    fail('bank interest method and confirmed primary domicile differ');
  if (facts.unemploymentPaymentSource || facts.unemploymentPaymentSchedule)
    fail('retained unemployment receipts require their separate method');
  if (!Array.isArray(input.form1099Int) || input.form1099Int.length !== 1) fail('one current original Form 1099-INT required');
  const [rawForm] = input.form1099Int;
  const parsed = Form1099IntSchema.strict().safeParse(rawForm);
  if (!parsed.success || !rawForm) fail('one current original Form 1099-INT required');
  const form = parsed.data;
  if (form.taxYear !== original.sourceTaxYear || form.accountHolder !== original.recipient.accountHolder
    || !form.payerTin || !/^\d{2}-?\d{7}$/.test(form.payerTin) || !form.accountReference)
    fail('current original Form 1099-INT with payer TIN, recipient and account required');
  const primary = input.taxpayer.primary;
  const { recipient, accountReference } = original;
  if (tin(recipient.ssn) !== tin(primary.ssn) || identity(recipient.firstName) !== identity(primary.firstName)
    || identity(recipient.lastName) !== identity(primary.lastName) || tin(original.payerTin) !== tin(form.payerTin)
    || identity(original.payerName) !== identity(form.payer) || accountReference !== form.accountReference)
    fail('actual Form 1099-INT recipient, bank or account differs');
  if (isIncompleteInvestmentAccount(accountReference)) fail('a stable account reference is required to match the Form 1099-INT and bank credits');
  // A generic form default cannot document a blank box on the bound original.
  const otherAmounts = [rawForm.earlyWithdrawalPenalty, rawForm.usSavingsBondInterest, rawForm.federalWithheld,
    rawForm.foreignTaxPaid, rawForm.taxExemptInterest, rawForm.privateActivityBondInterest, rawForm.stateWithheld];
  if (otherAmounts.includes(undefined)) fail('unknown original boxes must be documented for the Form 1099-INT bank interest method');
  if (form.foreignCountry !== undefined || form.state !== undefined || form.privateActivityBondFacts !== undefined
    || otherAmounts.some(amount => !cash(amount).isZero())
    || Object.values(original.otherBoxAmounts).some(amount => !cash(amount).isZero())
    || (form.paDirectObligationInterest !== undefined && !cash(form.paDirectObligationInterest).isZero()))
    fail('other interest or withholding requires its separate Form 1099-INT method');

  const box1 = cash(form.interestIncome);
  if (!box1.gt(0)) fail('positive Box 1 ordinary bank interest required');
  return { box1, residentAmount: reconcileInvestmentCredits(original, owner, box1) };
}

/** Spec: state/oh-2026-return-draft.yaml#ordinary-cash-dividend. */
function qualifyCashDividends(input: TaxYearInput, facts: OhioResidencyFacts,
  source: Ohio2026CashDividendEmployeeSources | Ohio2026PartYearBankInterestAndDividendsSources) {
  const [owner] = facts.owners;
  const { cashDividendOriginal: original } = source;
  if (input.taxpayer.filingStatus !== 'single' || owner?.accountHolder !== 'primary')
    fail('cash dividends require a single primary ordinary employee');
  const partYearCombined = source.methodId === OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD && owner.status === 'part_year_resident';
  if (!partYearCombined && source.methodId !== ohio2026CashDividendMethodByResidency[owner.status])
    fail('cash dividend method and confirmed primary domicile differ');
  if (facts.unemploymentPaymentSource || facts.unemploymentPaymentSchedule)
    fail('retained unemployment receipts require their separate method');
  const rawForm = input.form1099Div?.[0];
  const parsed = Form1099DivSchema.strict().safeParse(rawForm);
  if (!Array.isArray(input.form1099Div) || input.form1099Div.length !== 1 || !parsed.success || !rawForm)
    fail('one current original Form 1099-DIV required');
  const form = parsed.data;
  if (form.taxYear !== original.sourceTaxYear || form.accountHolder !== original.recipient.accountHolder
    || !form.payerTin || !/^\d{2}-?\d{7}$/.test(form.payerTin) || !form.accountReference)
    fail('current original Form 1099-DIV with payer TIN, recipient and account required');
  const primary = input.taxpayer.primary;
  const { recipient, accountReference } = original;
  if (tin(recipient.ssn) !== tin(primary.ssn) || identity(recipient.firstName) !== identity(primary.firstName)
    || identity(recipient.lastName) !== identity(primary.lastName) || tin(original.payerTin) !== tin(form.payerTin)
    || identity(original.payerName) !== identity(form.payer) || accountReference !== form.accountReference)
    fail('actual Form 1099-DIV recipient, payer or account differs');
  if (isIncompleteDividendAccountReference(accountReference)) fail('a stable account reference is required to match the Form 1099-DIV and cash dividend credits');
  // Require actual known-zero boxes from the bound original before schema defaults.
  const otherAmounts = [rawForm.qualifiedDividends, rawForm.totalCapitalGainDistributions, rawForm.section1250Gain,
    rawForm.section1202Gain, rawForm.collectiblesGain, rawForm.nondividendDistributions, rawForm.federalWithheld,
    rawForm.section199ADividends, rawForm.foreignTaxPaid, rawForm.exemptInterestDividends,
    rawForm.specifiedPrivateActivityBondInterest, rawForm.stateWithheld];
  if (form.foreignCountry !== undefined || form.state !== undefined || form.directReitDividendFacts !== undefined
    || form.privateActivityBondFacts !== undefined || otherAmounts.some(amount => amount === undefined || !cash(amount).isZero())
    || (form.paExemptInterestDividendAllocation !== undefined && !cash(form.paExemptInterestDividendAllocation).isZero()))
    fail('other dividend reporting or unknown original boxes require their separate Form 1099-DIV method');
  const box1a = cash(form.ordinaryDividends);
  if (!box1a.gt(0)) fail('positive Box 1a ordinary cash dividends required');
  return { box1a, residentAmount: reconcileInvestmentCredits(original, owner, box1a) };
}

function reconcileInvestmentCredits(
  original: Ohio2026BankInterestEmployeeSources['bankInterestOriginal'] | Ohio2026CashDividendEmployeeSources['cashDividendOriginal'],
  owner: OhioResidencyFacts['owners'][number], expectedBox: Decimal,
): Decimal {
  const dividend = 'completeActualCashDistributionsConfirmed' in original;
  const kind = dividend ? 'cash dividend' : 'bank';
  const references = new Set([identity(original.sourceReference)]);
  let annualAmount = new Decimal(0);
  let residentAmount = new Decimal(0);
  for (const credit of original.credits) {
    if (credit.accountReference !== original.accountReference) fail(`actual ${kind} credit account differs from ${dividend ? 'Form 1099-DIV' : 'Form 1099-INT'}`);
    const reference = identity(credit.sourceReference);
    if (references.has(reference)) fail(`distinct original ${kind} credit references required`);
    references.add(reference);
    day(credit.creditedOn);
    if (credit.creditedOn < '2026-01-01' || credit.creditedOn > '2026-12-31') fail(`actual ${kind} credit must be in current calendar 2026`);
    const period = owner.periods.find(row => row.from <= credit.creditedOn && credit.creditedOn <= row.to);
    if (!period) fail(`actual ${kind} credit date must be covered by confirmed domicile`);
    if ('domicileStateAtCredit' in credit && credit.domicileStateAtCredit !== period.domicileState)
      fail('cash dividend domicile at payment differs from the confirmed timeline');
    const amount = cash(credit.amount);
    if (!amount.gt(0)) fail(`positive actual ${kind} credits required`);
    annualAmount = annualAmount.plus(amount);
    if (period.domicileState === 'OH') residentAmount = residentAmount.plus(amount);
  }
  if (!annualAmount.eq(expectedBox)) fail(`actual ${kind} credits do not reconcile to ${dividend ? 'Box 1a' : 'Box 1'}`);
  return residentAmount;
}

interface Projection {
  filingStatus: 'single' | 'married_filing_jointly';
  federalAgi: string; reciprocalWageExclusion?: string; residentCreditIncome?: string; residentCreditTaxPaid?: string; withholding: string; eligibleExemptions: number;
  treasuryCoupon?: { deduction: string; ohioAgi: string };
  bankInterestOhioAllocation?: string;
  cashDividendOhioAllocation?: string;
  partYearReciprocalOhioAgi?: string;
  primaryQualifyingIncome: string; spouseQualifyingIncome?: string;
  seniorCreditEligibleByAge?: true;
  actualBalancePayment?: true;
  originalWithholding?: string;
  residency: OhioResidencyFacts;
}
export interface Ohio2026OrdinaryContext {
  readonly methodId: 'oh-2026-ordinary-employee-draft-v1' | 'oh-2026-pa-reciprocal-employee-draft-v1' | 'oh-2026-va-resident-credit-employee-draft-v1'
    | 'oh-2026-earned-school-employee-draft-v1' | 'oh-2026-unemployment-employee-draft-v1' | 'oh-2026-treasury-coupon-employee-draft-v1'
    | Ohio2026BankInterestEmployeeSources['methodId'] | Ohio2026CashDividendEmployeeSources['methodId']
    | typeof OHIO_2026_PART_YEAR_BANK_INTEREST_AND_DIVIDENDS_METHOD | typeof OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD;
  readonly sourceCommitment: string;
}
const contexts = new WeakMap<Ohio2026OrdinaryContext, { currentDigest: string; projection: Projection }>();
export function readOhio2026OrdinarySource(context: Ohio2026OrdinaryContext, taxInput: TaxYearInput, sources: unknown): Projection {
  const { scheduleBPartThree: _disclosure, ...input } = taxInput;
  const stored = contexts.get(context);
  if (!stored || stored.currentDigest !== digest({ input, sources })) fail('current original context is missing stale or forged');
  return structuredClone(stored.projection);
}
/** Derive exact source amounts; no caller tax/credit/payment projections are accepted. */
export function calculateOhio2026OrdinarySource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw);
}
/** Private ordinary employee method with a separately bound actual Box 1 original. */
export function calculateOhio2026UnemploymentEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { unemployment: true });
}
/** Private ordinary employee method with separately bound actual direct Treasury coupon evidence. */
export function calculateOhio2026TreasuryCouponEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { treasuryCoupon: true });
}

export function calculateOhio2026BankInterestEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { bankInterest: true });
}
export function calculateOhio2026CashDividendEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { cashDividend: true });
}
export function calculateOhio2026PartYearBankInterestAndDividendsSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { bankInterest: true, cashDividend: true });
}
/** Separate admitted method; caller scalars cannot bypass either documentary proof. */
export function calculateOhio2026PaReciprocalEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { reciprocal: calculateOhio2026ReciprocalWageSource(input, raw) });
}
/** Separately qualify documented move-period reciprocity. */
export function calculateOhio2026PartYearPaReciprocalEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { reciprocal: calculateOhio2026PartYearPaReciprocalWageSource(input, raw) });
}
/** Both full current original proofs must succeed; no publicly bindable projection. */
export function calculateOhio2026VaResidentCreditEmployeeSource(input: TaxYearInput, raw: unknown): Ohio2026OrdinaryContext {
  return qualifyEmployee(input, raw, { residentCredit: calculateOhio2026ResidentCreditSource(input, raw) });
}
/** Distinct actual school proof; never manufactures an ordinary no-school packet. */
export function calculateOhio2026EarnedSchoolEmployeeSource(input:TaxYearInput,raw:unknown):Ohio2026OrdinaryContext {
 const parsed=Ohio2026EarnedSchoolDraftSourcesSchema.safeParse(raw);
 if(!parsed.success)fail('complete distinct earned-school parent packet required');
 const school=calculateOhio2026SchoolDraftSource(input,parsed.data.schoolSources);
 return qualifyEmployee(input,raw,{school});
}
function qualifyEmployee(taxInput: TaxYearInput, raw: unknown, { reciprocal, residentCredit, school, unemployment, treasuryCoupon, bankInterest, cashDividend }: {
  reciprocal?: Ohio2026ReciprocalWageContext; residentCredit?: Ohio2026ResidentCreditSourceContext;
  school?: Ohio2026SchoolSourceContext; unemployment?: true; treasuryCoupon?: true; bankInterest?: true; cashDividend?: true;
} = {}): Ohio2026OrdinaryContext {
  const { scheduleBPartThree: _disclosure, ...input } = taxInput;
  const partYearExclusion = reciprocal ? readOhio2026ReciprocalWageSource(reciprocal, input, raw) : undefined;
  const partYearReciprocal = partYearExclusion !== undefined;
  const paidResident = residentCredit ? readOhio2026ResidentCreditSource(residentCredit, input, raw) : undefined;
  if (reciprocal && residentCredit) fail('reciprocal and resident credit methods cannot overlap');
  const schema = school ? Ohio2026EarnedSchoolDraftSourcesSchema
    : partYearReciprocal ? Ohio2026PaPartYearReciprocalSourcesSchema : reciprocal ? Ohio2026PaReciprocalSourcesSchema
    : residentCredit ? Ohio2026VaResidentCreditSourcesSchema : unemployment ? Ohio2026UnemploymentEmployeeSourcesSchema
    : treasuryCoupon ? Ohio2026TreasuryCouponEmployeeSourcesSchema
    : bankInterest && cashDividend ? Ohio2026PartYearBankInterestAndDividendsSourcesSchema
    : bankInterest ? Ohio2026BankInterestEmployeeSourcesSchema : cashDividend ? Ohio2026CashDividendEmployeeSourcesSchema : Ohio2026OrdinarySourcesSchema;
  const parsed = schema.safeParse(raw);
  const resident = OhioResidencyFactsSchema.safeParse(input.ohioResidency);
  const payment = OhioPaymentFactsSchema.safeParse(input.ohioPayments);
  if (!parsed.success || !resident.success || !payment.success) fail('complete confirmed current source packets required');
  const source = parsed.data, facts = resident.data, payments = payment.data;
  if(school){const whole=Ohio2026EarnedSchoolDraftSourcesSchema.parse(raw);readOhio2026SchoolSource(school,input,whole.schoolSources);if(digest(whole.employmentOriginals)!==digest(whole.schoolSources.employmentOriginals))fail('school and state actual employment originals differ');}
  const taxpayer = TaxpayerSchema.strict().safeParse(input.taxpayer);
  const standard = StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts);
  if (!taxpayer.success || !standard.success || input.taxpayer.taxYear !== 2026 || facts.taxYear !== 2026 || payments.taxYear !== 2026) fail('actual current2026 taxpayer and source year required');
  const filingStatus = input.taxpayer.filingStatus;
  if (!['single', 'married_filing_jointly'].includes(filingStatus)) fail('other filing statuses need their separate actual method');
  if (!Array.isArray(input.taxpayer.dependents) || input.taxpayer.dependents.length) fail('actual no-dependent and no EITC-child cohort required');
  const holders: Array<'primary' | 'spouse'> = filingStatus === 'married_filing_jointly' ? ['primary', 'spouse'] : ['primary'];
  if (filingStatus === 'single' && input.taxpayer.spouse || filingStatus === 'married_filing_jointly' && !input.taxpayer.spouse) fail('actual filing owner composition differs');
  if (input.taxpayer.spouse && tin(input.taxpayer.primary.ssn) === tin(input.taxpayer.spouse.ssn)) fail('distinct actual joint owners required');
  const sf = standard.data;
  if (sf.primaryCanBeClaimedAsDependent !== false || sf.primaryDeathDate !== null || sf.nonresidentAlien !== false || sf.dualStatusAlien !== false || sf.shortTaxYear !== false
    || filingStatus === 'married_filing_jointly' && (sf.spouseCanBeClaimedAsDependent !== false || sf.spouseDeathDate !== null)) fail('actual completed owner exemption and calendar eligibility required');
  const ownerBirthDates = new Map<'primary' | 'spouse', string>();
  for (const holder of holders) {
    const person = holder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || !/^\d{9}$/.test(tin(person.ssn))) fail('actual current owner identity required');
    day(person.dateOfBirth);
    if (person.dateOfBirth === '1962-01-01' || person.dateOfBirth > '2008-12-31') fail('actual ordinary adult age within the supported range required');
    ownerBirthDates.set(holder, person.dateOfBirth);
  }
  const seniorCreditEligibleByAge = [...ownerBirthDates.values()].some(birthDate => birthDate <= '1961-12-31');
  const seniorCreditHistory = 'seniorCreditHistory' in source ? source.seniorCreditHistory : undefined;
  if (seniorCreditEligibleByAge) {
    if (treasuryCoupon) fail('direct Treasury coupon requires an ordinary employee under 65');
    if (bankInterest) fail('bank interest requires an ordinary employee under 65');
    if (cashDividend) fail('cash dividends require an ordinary employee under 65');
    if (reciprocal || residentCredit || payments.remainingTaxPayment.status !== 'no_remaining_tax') fail('Ohio senior credit requires the ordinary withholding-only method');
    if (!seniorCreditHistory || seniorCreditHistory.length !== holders.length
      || new Set(seniorCreditHistory.map(row => row.accountHolder)).size !== holders.length
      || seniorCreditHistory.some(row => ownerBirthDates.get(row.accountHolder) !== row.dateOfBirth)) fail('complete owner-bound Ohio senior credit history required');
  } else if (seniorCreditHistory) fail('Ohio senior credit history requires an eligible owner');
  const { ohioResidency: _residency, ohioPayments: _payments, ...originals } = input;
  for (const snapshot of [source.originalFederalSources, facts.originalFederalSources, payments.originalFederalSources]) {
    if (!snapshot || digest(snapshot) !== digest(originals)) fail('current complete original source snapshot is missing or changed');
  }
  const allowed = new Set(['taxpayer', 'w2s', 'standardDeductionFacts', 'ohioResidency', 'ohioPayments']);
  if (unemployment) allowed.add('form1099G');
  if (treasuryCoupon || bankInterest) allowed.add('form1099Int');
  if (cashDividend) allowed.add('form1099Div');
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || allowed.has(key)) continue;
    if(school)continue; // The current opaque school proof has independently checked every original key.
    if (federalDocumentCollections.has(key) && Array.isArray(value) && value.length === 0) continue;
    fail('retained other originals require their separate actual method even at zero');
  }
  if (!Array.isArray(input.w2s) || !input.w2s.length || input.w2s.length > 20 || source.employmentOriginals.length !== input.w2s.length) fail('complete bounded current W2 and employment inventory required');
  if (facts.allFederalSourcesIncludedConfirmed !== true || facts.noBusinessIncomeConfirmed !== true || facts.businessSources || !reciprocal && facts.reciprocalWageSources || facts.residentCreditSources
    || (school ? facts.schoolDistrictStatus !== 'actual_district_sources_required' : facts.schoolDistrictStatus !== 'no_ohio_taxing_district_residency')) fail('business reciprocal resident-credit or school sources require their separate method');
  if (facts.owners.length !== holders.length || new Set(facts.owners.map(o => o.accountHolder)).size !== holders.length || holders.some(h => !facts.owners.some(o => o.accountHolder === h))) fail('complete actual current residency owners required');
  if (facts.owners.some(owner => owner.periods.some(period => !Ohio2026OrdinaryStateSchema.safeParse(period.domicileState).success))) fail('actual domestic domicile state required');
  const unemploymentAmounts = 'unemploymentOriginal' in source ? qualifyUnemployment(input, facts, source.unemploymentOriginal) : undefined;
  const coupon = 'treasuryCouponOriginal' in source ? qualifyTreasuryCoupon(input, facts, source.treasuryCouponOriginal) : undefined;
  const bank = 'bankInterestOriginal' in source ? qualifyBankInterest(input, facts, source) : undefined;
  const dividend = 'cashDividendOriginal' in source ? qualifyCashDividends(input, facts, source) : undefined;
  const federalInterestDividends = coupon ?? (bank?.box1 ?? new Decimal(0)).plus(dividend?.box1a ?? 0);
  const residentInterestDividends = coupon ?? (bank?.residentAmount ?? new Decimal(0)).plus(dividend?.residentAmount ?? 0);
  const wageTotals = { primary: new Decimal(0), spouse: new Decimal(0) };
  const residentWages = { primary: new Decimal(0), spouse: new Decimal(0) };
  const nonresidentWages = { primary: new Decimal(0), spouse: new Decimal(0) };
  let withholding = new Decimal(0);
  const indexes = new Set<number>(), documentIds = new Set<string>();
  for (const employment of source.employmentOriginals) {
    const index = employment.w2Index, w2 = input.w2s[index];
    if (indexes.has(index) || !w2 || !W2Schema.strict().safeParse(w2).success || w2.taxYear !== 2026 || w2.accountHolder !== employment.accountHolder || !holders.includes(employment.accountHolder)) fail('each current original W2 owner year and index required once');
    indexes.add(index);
    const owner = facts.owners.find(o => o.accountHolder === employment.accountHolder);
    if (!owner || !/^\d{9}$/.test(tin(w2.employer.ein)) || tin(employment.employerTin) !== tin(w2.employer.ein) || identity(employment.employerName) !== identity(w2.employer.name)) fail('actual current employer identity differs');
    const actual = calculateW2StateLocalSources(input, index, w2.stateLocalSources);
    if ((!school && (actual.localRows.length || !cash(w2.localTaxWithheld).isZero() || !cash(w2.localWages).isZero()))
      || actual.stateRows.some(row => row.state !== 'OH' && !(residentCredit && row.state === 'VA')
        && !(partYearReciprocal && row.state === 'PA') && !row.withheld.isZero())) fail('local school or other-state tax source requires its separate method');
    withholding = withholding.plus(actual.stateRows.filter(row => row.state === 'OH').reduce((sum, row) => sum.plus(row.withheld), new Decimal(0)));
    for (const key of ['socialSecurityTips', 'allocatedTips', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT'] as const) if (!cash(w2[key]).isZero()) fail('actual nonspecial W2 boxes including known zero required');
    for (const key of ['federalWithheld', 'socialSecurityWages', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld'] as const) cash(w2[key]);
    if (w2.box12CodeQ !== undefined && cash(w2.box12CodeQ).gt(0)) fail('reported combat pay requires its separate military compensation method');
    if (w2.militaryService || (w2.box12CodeP !== undefined && !cash(w2.box12CodeP).isZero()) || w2.box12CodeTP !== undefined || w2.box12CodeTT !== undefined || w2.treasuryTippedOccupationCodes !== undefined) fail('special compensation requires its separate source method');
    let wages = new Decimal(0), next = day('2026-01-01');
    for (const row of [...employment.serviceRows].sort((a, b) => a.from.localeCompare(b.from))) {
      const id = identity(row.sourceId), document = identity(row.sourceReference);
      if (documentIds.has(`id:${id}`) || documentIds.has(`ref:${document}`)) fail('duplicate actual payroll originals');
      documentIds.add(`id:${id}`); documentIds.add(`ref:${document}`);
      const from = day(row.from), to = day(row.to), paid = day(row.paymentDate);
      if (from !== next || to < from || row.to > '2026-12-31' || row.paymentDate > '2026-12-31' || paid < to) fail('complete unique current-year service and payment periods required');
      const period = owner.periods.find(p => row.from >= p.from && row.to <= p.to && row.paymentDate >= p.from && row.paymentDate <= p.to);
      if (!period) fail('actual compensation crossing domicile periods needs its separate timing method');
      if (!reciprocal && period.domicileState !== 'OH' && ['IN', 'KY', 'MI', 'PA', 'WV'].includes(period.domicileState)) fail('actual reciprocal compensation requires its separate current method');
      const value = cash(row.wages);
      wages = wages.plus(value);
      if (period.domicileState === 'OH') residentWages[employment.accountHolder] = residentWages[employment.accountHolder].plus(value);
      else if (row.serviceState === 'OH' && !partYearReciprocal) nonresidentWages[employment.accountHolder] = nonresidentWages[employment.accountHolder].plus(value);
      next = to + 86400000;
    }
    if (next !== day('2027-01-01') || !wages.eq(cash(w2.wages))) fail('complete actual service wages differ from original W2');
    wageTotals[employment.accountHolder] = wageTotals[employment.accountHolder].plus(wages);
  }
  for (const owner of facts.owners) {
    if (!owner.amounts || owner.stateAdditions === undefined || owner.stateDeductions === undefined || owner.stateAdditions.length || owner.stateDeductions.length) fail('complete actual zero state adjustment and category sources required');
    for (const category of ohioNrcCategories) {
      const row = owner.amounts[category];
      const actualFederal = category === 'wages' ? wageTotals[owner.accountHolder] : category === 'unemployment' ? unemploymentAmounts?.box1 ?? 0
        : category === 'interestDividends' ? federalInterestDividends : 0;
      const actualResident = category === 'wages' ? residentWages[owner.accountHolder] : category === 'unemployment' ? unemploymentAmounts?.residentAmount ?? 0
        : category === 'interestDividends' ? residentInterestDividends : 0;
      if (!cash(row.federalAmount).eq(actualFederal)
        || !cash(row.residentAmount).eq(actualResident)
        || !cash(row.nonresidentOhioAmount).eq(category === 'wages' ? nonresidentWages[owner.accountHolder] : 0)) fail('current actual source categories and service allocation differ');
    }
  }
  const federalWages = wageTotals.primary.plus(wageTotals.spouse);
  const federalAgi = roundDollar(federalWages.plus(unemploymentAmounts?.box1 ?? 0).plus(federalInterestDividends));
  // Apply the exact statutory subtractions before rounding Ohio AGI.
  const ohioAgi = partYearReciprocal ? roundDollar(federalWages.minus(partYearExclusion))
    : coupon ? roundDollar(federalWages) : federalAgi;
  const cutoff = filingStatus === 'married_filing_jointly' ? FEDERAL_2026_INDEXED.eitc.completedPhaseOutMFJ[0] : FEDERAL_2026_INDEXED.eitc.completedPhaseOutSingleHoH[0];
  if (!cutoff || federalAgi.lt(cutoff)) fail('actual EITC requires its separate eligible-income method');
  calculateOhioITNRC({ taxYear: 2026, filingStatus, federalAgi, ohioAgi, taxRemainingBeforeResidencyCredits: '0', residencyFacts: facts,
    expectedFederalCategories: Object.fromEntries(ohioNrcCategories.map(category => [category,
      category === 'wages' ? roundDollar(federalWages) : category === 'unemployment' ? unemploymentAmounts?.box1 ?? '0'
        : category === 'interestDividends' ? roundDollar(federalInterestDividends) : '0'])) });
  if (schema === Ohio2026OrdinarySourcesSchema || partYearReciprocal || unemployment || treasuryCoupon || bankInterest || cashDividend) {
    assertOhio2026PrimaryResidencyDeclaration(input.taxpayer, facts);
  }
  const timing = payments.currentTiming;
  const valuationDate = timing.kind === 'filed' ? timing.filedDate : timing.expectedDate;
  day(valuationDate); day(timing.asOfDate);
  // A timely filed return can be observed after the filing deadline.
  if (timing.asOfDate < '2027-01-01' || valuationDate < '2027-01-01' || valuationDate > '2027-04-15'
    || timing.kind === 'filed' && valuationDate > timing.asOfDate || timing.kind === 'expected' && valuationDate < timing.asOfDate) fail('actual timely current filing chronology required');
  const actualBalancePayment = payments.remainingTaxPayment.status === 'actual_payment';
  if (actualBalancePayment) {
    if (reciprocal || residentCredit || unemployment || treasuryCoupon || bankInterest || cashDividend) fail('actual small balance payment needs the ordinary employee method');
    validateOhio2026ActualBalancePaymentSources(input);
  } else {
  if (payments.paymentRows.length || payments.priorReturn.status !== 'no_return' || payments.priorCreditCarryforward.status !== 'none' || payments.remainingTaxPayment.status !== 'no_remaining_tax'
    || !cash(payments.balanceFacts.useTax).isZero() || !cash(payments.balanceFacts.outgoingCarryforward).isZero() || !cash(payments.balanceFacts.donations).isZero()) fail('actual ordinary withholding-only coverage and zero balance elections required');
  }
  const currentDigest = digest({ input, sources: raw });
  const methodId = 'methodId' in source ? source.methodId : 'oh-2026-ordinary-employee-draft-v1';
  const context: Ohio2026OrdinaryContext = Object.freeze({ methodId, sourceCommitment: currentDigest });
  contexts.set(context, { currentDigest, projection: { ...(actualBalancePayment ? {actualBalancePayment: true as const, originalWithholding: withholding.toFixed()} : {}), filingStatus: filingStatus as Projection['filingStatus'], federalAgi: federalAgi.toFixed(), ...(reciprocal ? { reciprocalWageExclusion: partYearExclusion ?? federalAgi.toFixed() } : {}), ...(paidResident ? { residentCreditIncome: paidResident.income, residentCreditTaxPaid: paidResident.taxPaid } : {}), withholding: roundDollar(withholding).toFixed(), eligibleExemptions: holders.length,
    ...(partYearReciprocal ? { partYearReciprocalOhioAgi: ohioAgi.toFixed() } : {}),
    ...(coupon ? { treasuryCoupon: { deduction: coupon.toFixed(), ohioAgi: ohioAgi.toFixed() } } : {}),
    ...(bank ? { bankInterestOhioAllocation: bank.residentAmount.toFixed() } : {}),
    ...(dividend ? { cashDividendOhioAllocation: dividend.residentAmount.toFixed() } : {}),
    ...(seniorCreditEligibleByAge ? { seniorCreditEligibleByAge: true as const } : {}), primaryQualifyingIncome: wageTotals.primary.toFixed(),
    ...(filingStatus === 'married_filing_jointly' ? { spouseQualifyingIncome: wageTotals.spouse.toFixed() } : {}), residency: structuredClone(facts) } });
  return context;
}
