/** Spec: state/oh-2026-return-draft.yaml. Not a qualified final2026 return. */
import Decimal from 'decimal.js';
import {calculateOhio2026ActualBalancePayment} from './oh-2026-payment-source.js';
import { ohio2026BankInterestMethodByResidency, ohio2026CashDividendMethodByResidency, type Ohio2026ActualBalancePaymentProjection } from '@/models/ohio-2026-return-draft.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { OHIO_2026_BASELINE } from '@/models/ohio-2026-baseline.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
import { calculateOhio2026Baseline } from './oh-2026-baseline.js';
import { calculateOhio2026ResidentCredit } from './oh-2026-resident-credit.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import {
  calculateOhio2026BankInterestEmployeeSource, calculateOhio2026CashDividendEmployeeSource,
  calculateOhio2026TreasuryCouponEmployeeSource, calculateOhio2026UnemploymentEmployeeSource,
  readOhio2026OrdinarySource, type Ohio2026OrdinaryContext,
} from './oh-2026-ordinary-source.js';

export interface Ohio2026ReturnDraftResult {
  taxYear: 2026;
  ruleVersion: Ohio2026OrdinaryContext['methodId'];
  baselineRuleVersion: string;
  calculationStatus: 'incomplete';
  reviewStatus: 'independent-review-pending';
  filingQualified: false;
  sourceCommitment: string;
  federalAgi: Decimal;
  ohioAgi: Decimal;
  reciprocalWageExclusion?: Decimal;
  treasuryCouponDeduction?: Decimal;
  residentCredit?: Decimal;
  exemptions: Decimal;
  taxBeforeCredits: Decimal;
  seniorCitizenCredit?: Decimal;
  personalExemptionCredit: Decimal;
  jointFilingCredit: Decimal;
  earnedIncomeCredit: Decimal;
  nonresidentRatio: Decimal;
  nonresidentCredit: Decimal;
  incomeTax: Decimal;
  withholding: Decimal;
  underpaymentPenalty: Decimal;
  latePaymentInterest: Decimal;
  amountDue: Decimal;
  refund: Decimal;
  actualBalancePayment?: Ohio2026ActualBalancePaymentProjection;
  limitations: string[];
  lines: CalculatedLine[];
}
/** Private documentary draft for the separate ordinary unemployment cohort. */
export function calculateOhio2026UnemploymentReturnDraft(input: TaxYearInput, sources: unknown): Ohio2026ReturnDraftResult {
  return calculateOhio2026ReturnDraft(input, sources, calculateOhio2026UnemploymentEmployeeSource(input, sources));
}
/** Private documentary draft for one separately qualified direct Treasury coupon. */
export function calculateOhio2026TreasuryCouponReturnDraft(input: TaxYearInput, sources: unknown): Ohio2026ReturnDraftResult {
  return calculateOhio2026ReturnDraft(input, sources, calculateOhio2026TreasuryCouponEmployeeSource(input, sources));
}
/** Private documentary draft for one ordinary bank account and actual dated credits. */
export function calculateOhio2026BankInterestReturnDraft(input: TaxYearInput, sources: unknown): Ohio2026ReturnDraftResult {
  return calculateOhio2026ReturnDraft(input, sources, calculateOhio2026BankInterestEmployeeSource(input, sources));
}
/** Private documentary draft for one actual Form 1099-DIV and its cash receipts. */
export function calculateOhio2026CashDividendReturnDraft(input: TaxYearInput, sources: unknown): Ohio2026ReturnDraftResult {
  return calculateOhio2026ReturnDraft(input, sources, calculateOhio2026CashDividendEmployeeSource(input, sources));
}
/** Calculate solely from the current opaque source context; caller scalars cannot qualify. */
export function calculateOhio2026ReturnDraft(input: TaxYearInput, sources: unknown, context: Ohio2026OrdinaryContext): Ohio2026ReturnDraftResult {
  const actual = readOhio2026OrdinarySource(context, input, sources);
  const federalAgi = new Decimal(actual.federalAgi);
  const reciprocal = actual.reciprocalWageExclusion !== undefined;
  const { partYearReciprocalOhioAgi } = actual;
  const partYearReciprocal = partYearReciprocalOhioAgi !== undefined;
  const unemployment = context.methodId === 'oh-2026-unemployment-employee-draft-v1';
  const { bankInterestOhioAllocation, cashDividendOhioAllocation } = actual;
  const bankInterest = bankInterestOhioAllocation !== undefined;
  const cashDividend = cashDividendOhioAllocation !== undefined;
  const fullYearBankInterest = context.methodId === ohio2026BankInterestMethodByResidency.full_year_resident;
  const nonresidentBankInterest = context.methodId === ohio2026BankInterestMethodByResidency.nonresident;
  const fullYearCashDividend = context.methodId === ohio2026CashDividendMethodByResidency.full_year_resident;
  const nonresidentCashDividend = context.methodId === ohio2026CashDividendMethodByResidency.nonresident;
  const treasuryCouponDeduction = actual.treasuryCoupon ? new Decimal(actual.treasuryCoupon.deduction) : undefined;
  const ohioAgi = partYearReciprocal ? new Decimal(partYearReciprocalOhioAgi)
    : actual.treasuryCoupon ? new Decimal(actual.treasuryCoupon.ohioAgi) : federalAgi.minus(actual.reciprocalWageExclusion ?? '0');
  const baselineInput = { taxYear: 2026, filingStatus: actual.filingStatus, ohioAdjustedGrossIncome: ohioAgi,
    businessIncomeDeduction: '0', qualifyingCapitalGainsAndPayrollDeduction: '0', taxableBusinessIncome: '0',
    eligibleExemptions: actual.eligibleExemptions, primaryQualifyingIncome: actual.primaryQualifyingIncome,
    ...(actual.spouseQualifyingIncome === undefined ? {} : { spouseQualifyingIncome: actual.spouseQualifyingIncome }) };
  const beforeCredits = calculateOhio2026Baseline({ ...baselineInput, precedingCredits: '0' });
  const magiLessExemptions = beforeCredits.modifiedAdjustedGrossIncome.minus(beforeCredits.exemptions);
  const seniorCitizenCredit = actual.seniorCreditEligibleByAge && magiLessExemptions.lt('100000')
    ? Decimal.min(beforeCredits.totalTax, '50') : new Decimal(0);
  const personalExemptionCredit = magiLessExemptions.lt('30000')
    ? Decimal.min(beforeCredits.totalTax.minus(seniorCitizenCredit), new Decimal('20').times(actual.eligibleExemptions)) : new Decimal(0);
  const baseline = calculateOhio2026Baseline({ ...baselineInput, precedingCredits: seniorCitizenCredit.plus(personalExemptionCredit) });
  // Source admission establishes zero EITC using actual no-child facts and the
  // indexed2026 cutoff, rather than defaulting an unavailable federal result.
  const earnedIncomeCredit = new Decimal(0);
  // The full-year investment methods already reconciled domicile and income.
  const nrc = (reciprocal && !partYearReciprocal) || actual.treasuryCoupon || fullYearBankInterest || fullYearCashDividend
    ? { line19: new Decimal(0), line20: new Decimal(0), lines: [] } : calculateOhioITNRC({ taxYear: 2026, filingStatus: actual.filingStatus,
    federalAgi, ohioAgi, taxRemainingBeforeResidencyCredits: baseline.taxAfterJointCredit,
    residencyFacts: actual.residency });
  // Part B (lines 10–15) applies only to part-year residents in the investment drafts.
  const nrcLines = nonresidentBankInterest || nonresidentCashDividend
    ? nrc.lines.filter(({ form, line }) => form !== 'OH-IT-NRC' || !/^1[0-5]$/.test(line))
    : nrc.lines;
  const taxAfterNrc = baseline.taxAfterJointCredit.minus(nrc.line20);
  const resident = actual.residentCreditIncome === undefined ? undefined : calculateOhio2026ResidentCredit({
    ohioAgi, taxAvailable: taxAfterNrc, virginiaIncome: actual.residentCreditIncome, virginiaTaxPaid: actual.residentCreditTaxPaid ?? '',
  });
  const incomeTax = taxAfterNrc.minus(resident?.credit ?? '0');
  const withholding = new Decimal(actual.withholding);
  const actualBalancePayment = actual.actualBalancePayment ? calculateOhio2026ActualBalancePayment(input, incomeTax, withholding, actual.originalWithholding ?? '') : undefined;
  if (!actualBalancePayment && withholding.lt(incomeTax)) throw new Error('Ohio2026 ordinary actual sources: actual withholding coverage requires its separate payment method');
  const underpaymentPenalty = new Decimal(0), latePaymentInterest = new Decimal(0), amountDue = actualBalancePayment ? incomeTax.minus(withholding) : new Decimal(0);
  const refund = actualBalancePayment ? new Decimal(0) : roundDollar(withholding.minus(incomeTax));
  const audit = new AuditTrail();
  if (partYearReciprocal && actual.reciprocalWageExclusion !== undefined) {
    audit.record('OH2026 enacted PA part-year reciprocal draft', 'reciprocal-exclusion', 'Actual Pennsylvania-resident Ohio compensation excluded once',
      new Decimal(actual.reciprocalWageExclusion), 'Sum exact ordinary Ohio wages earned and paid while domiciled in PA under RC5747.01(A)(33) and RC5747.05(A)(2). Exclude them from the Ohio AGI and NRC allocation.');
  } else if (reciprocal) audit.record('OH2026 enacted PA reciprocal draft', 'reciprocal-exclusion', 'Actual reciprocal compensation excluded once', federalAgi,
    'Current complete full-year PA ordinary employee originals; RC5747.05(A)(2). Ohio AGI0; excluded compensation creates neither NRC nor resident credit. No final2026 form qualification.');
  if (treasuryCouponDeduction) audit.record('OH2026 enacted Treasury coupon draft', 'direct-treasury-coupon', 'Direct United States Treasury coupon exempt from Ohio income tax', treasuryCouponDeduction,
    'Subtract the exact source-qualified direct Treasury coupon from unrounded federal income included in AGI before rounding the Ohio amount; RC5747.01(A)(3) and 31 USC3124(a).');
  if (bankInterest && (fullYearBankInterest || nonresidentBankInterest)) {
    audit.record('OH2026 enacted bank interest draft', 'ohio-bank-interest', 'Ordinary bank interest allocated to Ohio', new Decimal(bankInterestOhioAllocation),
      fullYearBankInterest
        ? 'All exact reconciled Box 1 bank credits are allocated to Ohio for the full-year resident under RC5747.20(A).'
        : 'All exact reconciled Box 1 bank credits fall outside verified Ohio domicile under RC5747.20(B)(6).');
  }
  if (cashDividend) audit.record('OH2026 enacted cash dividend draft', 'ohio-ordinary-cash-dividends', 'Ordinary cash dividends allocated to Ohio', new Decimal(cashDividendOhioAllocation),
    'Sum exact reconciled Box 1a cash distributions received while domiciled in Ohio under RC5747.20(A), (B)(6), and (C).');
  if (actual.seniorCreditEligibleByAge) audit.record('OH2026 enacted ordinary draft', 'senior-credit', 'Senior citizen credit', seniorCitizenCredit,
    'One nonrefundable $50 per return, limited to available tax, if actual MAGI less exemptions is below $100,000; RC5747.055(F), RC5747.98');
  const agiDescription = unemployment ? 'Actual ordinary wages and gross Box 1 unemployment in federal and Ohio AGI'
    : treasuryCouponDeduction ? 'Actual ordinary wages and direct Treasury coupon in federal AGI'
    : bankInterest ? 'Actual ordinary wages and gross Box 1 bank interest in federal and Ohio AGI'
    : cashDividend ? 'Actual ordinary wages and gross Box 1a cash dividends in federal and Ohio AGI'
    : reciprocal ? 'Actual completed wage-only federal AGI before reciprocal exclusion' : 'Actual completed wage-only federal and Ohio AGI';
  const agiFormula = unemployment ? 'Round the sum of current ordinary W2 wages and gross Form 1099-G Box 1; allocate actual receipts by domicile under RC5747.20'
    : treasuryCouponDeduction ? 'Round the sum of current ordinary W2 wages and the matched direct Treasury coupon in Form 1099-INT Box 3'
    : bankInterest ? 'Round the sum of ordinary W2 wages and matched Form 1099-INT Box 1; allocate actual bank credits by domicile under RC5747.20'
    : cashDividend ? 'Round the sum of ordinary W2 wages and matched Form 1099-DIV Box 1a; allocate actual cash dividends by domicile under RC5747.20'
    : 'Round sum current source-qualified ordinary W2 wages; no other actual sources admitted';
  for (const [line, label, value, formula] of [
    ['AGI', agiDescription, federalAgi, agiFormula],
    ['personal-credit', 'Personal exemption credit', personalExemptionCredit, 'min(tax remaining after senior credit,20*actual eligible count) only if statutory MAGI less exemptions<30000; RC5747.022'],
    ['joint-credit', 'Joint filing credit after preceding credits', baseline.jointFilingCredit, 'Actual each-owner qualifying wages, corrected MAGI and remaining-tax tier/cap; RC5747.05(E)'],
    ['earned-income-credit', 'Actual zero earned income credit', earnedIncomeCredit, 'Complete no-qualifying-child sources and AGI at or above indexed2026 phaseout; no unavailable credit default'],
    ['income-tax', resident ? 'Income tax after actual NRC and resident credit' : 'Income tax after actual NRC', incomeTax, resident ? 'Tax after preceding statutory credits minus actual source NRC and resident credit; RC5747.98' : 'Tax after preceding statutory credits minus actual source NRC; RC5747.98'],
    ['withholding', 'Actual Ohio compensation withholding', withholding, 'Sum only admitted original OH state rows once, then round whole-dollar total; RC5747.08(H)'],
    ['underpayment-penalty', 'No current installment underpayment', underpaymentPenalty, actualBalancePayment ? 'Actual liability minus withholding at most500; RC5747.09(B); no estimate obligation in finite source method' : 'Actual equal-quarter compensation withholding covers current liability; RC5747.09; other payment methods unsupported'],
    ['late-interest', 'No unpaid tax or late payment interest', latePaymentInterest, actualBalancePayment ? 'Actual fully matched original balance receipt by Apr15,2027; no overdue interval; RC5747.08(G)' : 'Complete ordinary timely chronology and no unpaid tax; no unknown date default'],
    ['amount-due', actualBalancePayment ? 'Reported return balance, separately paid on actual account' : 'No remaining amount due', amountDue, actualBalancePayment ? 'Income tax minus withholding; actual balance receipt is not withholding or an estimated payment' : 'Source-qualified withholding covers current income tax; no other liability admitted'],
    ['refund', 'Actual ordinary overpayment', refund, actualBalancePayment ? 'Actual balance due branch has no overpayment/refund' : 'Whole-dollar withholding minus income tax, with source-established zero other balance/elections'],
  ] as const) audit.record('OH2026 enacted ordinary draft', line, label, value, formula);
  if (actualBalancePayment) {
    audit.record('OH2026 actual payment draft', 'actual-balance-payment', 'Actual timely balance payment applied', actualBalancePayment.actualBalancePaymentApplied, 'Matched original account balance receipt, separate from reported return amount due');
    audit.record('OH2026 actual payment draft', 'outstanding-tax-balance', 'Source-qualified account outstanding tax balance', actualBalancePayment.outstandingTaxBalance, 'Fresh balance minus exact actual applied payment');
  }
  return { ...(actualBalancePayment ? {actualBalancePayment} : {}), taxYear: 2026, ruleVersion: context.methodId, baselineRuleVersion: OHIO_2026_BASELINE.metadata.ruleVersion,
    calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false,
    sourceCommitment: context.sourceCommitment, federalAgi, ohioAgi, ...(treasuryCouponDeduction ? { treasuryCouponDeduction } : {}),
    ...(reciprocal ? { reciprocalWageExclusion: new Decimal(actual.reciprocalWageExclusion ?? '0'), residentCredit: new Decimal(0) } : {}), ...(resident ? { residentCredit: resident.credit } : {}), exemptions: baseline.exemptions,
    taxBeforeCredits: baseline.totalTax, ...(actual.seniorCreditEligibleByAge ? { seniorCitizenCredit } : {}), personalExemptionCredit, jointFilingCredit: baseline.jointFilingCredit, earnedIncomeCredit,
    nonresidentRatio: nrc.line19, nonresidentCredit: nrc.line20, incomeTax, withholding, underpaymentPenalty, latePaymentInterest, amountDue, refund,
    limitations: [
      unemployment ? 'Single ordinary employee under 65 with one actual state unemployment original and a complete domicile timeline. No dependents, EITC-qualifying children, state adjustments, or other credit sources.'
        : treasuryCouponDeduction ? 'Single full-year Ohio resident and ordinary employee under 65 with one actual direct Treasury note or bond coupon and its Ohio deduction. No dependents, EITC-qualifying children, other adjustments, or other credit sources.'
        : context.methodId === ohio2026BankInterestMethodByResidency.part_year_resident ? 'Single part-year Ohio resident and ordinary employee under 65 with one actual bank deposit account. No dependents, EITC-qualifying children, state adjustments, or other credit sources.'
        : bankInterest ? 'Single ordinary employee under 65 with documented Ohio residency status and one actual bank deposit account. No dependents, EITC-qualifying children, state adjustments, or other credit sources.'
        : cashDividend ? 'Single ordinary employee under 65 with documented Ohio residency and one ordinary domestic corporate cash dividend original. No dependents, EITC-qualifying children, state adjustments, or other credit sources.'
        : actual.seniorCreditEligibleByAge
        ? 'Finite single/MFJ ordinary employee cohort with confirmed complete Ohio senior credit history; no dependents, EITC-qualifying children, state adjustments or other credit sources.'
        : 'Finite single/MFJ current ordinary employee cohort only; no dependents or EITC-qualifying children, under65 adults, no other state adjustments or credit sources.',
      context.methodId==='oh-2026-earned-school-employee-draft-v1' ? 'Actual independently source-qualified earned-school residence; school liability and payments remain separate from IT1040 in the distinct parent composition.' : resident ? 'Finite single full-year Ohio employee credit for completed paid2026 VA763 liability; Virginia tax calculation, unsettled accounts and other jurisdictions require separate methods.'
        : partYearReciprocal ? 'Single ordinary Ohio employee with one documented move between Pennsylvania and Ohio. Pennsylvania-period withholding stays outside Ohio settlement.'
        : reciprocal ? 'Finite single full-year PA ordinary employee reciprocal compensation only; mixed, other-domicile, part-year, joint and specialized compensation remain separate methods.' : 'Actual no taxing-school-district residence and no other-state tax on Ohio-resident income; reciprocal and specialized income methods remain separate.',
      actualBalancePayment ? 'Finite first Ohio return with documentary timely actual balance at most500 under both raw and reported admission limits; outstanding balance is receipt arithmetic, not an external account observation. Other payment methods remain unavailable.' : 'Ordinary first Ohio return with equal-quarter withholding covering liability; other payments, prior returns/carries, penalties and balance elections require separate current methods.',
      'Final2026 form identity/numbering, independent human review, complete selected-state scope and filing qualification remain unavailable.',
    ], lines: [...baseline.lines, ...nrcLines, ...(resident?.lines ?? []), ...audit.getLines()] };
}
