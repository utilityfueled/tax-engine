/** Spec: state/oh-2026-return-draft.yaml. Not a qualified final2026 return. */
import Decimal from 'decimal.js';
import {calculateOhio2026ActualBalancePayment} from './oh-2026-payment-source.js';
import type {Ohio2026ActualBalancePaymentProjection} from '@/models/ohio-2026-return-draft.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { OHIO_2026_BASELINE } from '@/models/ohio-2026-baseline.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
import { calculateOhio2026Baseline } from './oh-2026-baseline.js';
import { calculateOhio2026ResidentCredit } from './oh-2026-resident-credit.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import { readOhio2026OrdinarySource, type Ohio2026OrdinaryContext } from './oh-2026-ordinary-source.js';

export interface Ohio2026ReturnDraftResult {
  taxYear: 2026;
  ruleVersion: 'oh-2026-ordinary-employee-draft-v1' | 'oh-2026-pa-reciprocal-employee-draft-v1' | 'oh-2026-va-resident-credit-employee-draft-v1';
  baselineRuleVersion: string;
  calculationStatus: 'incomplete';
  reviewStatus: 'independent-review-pending';
  filingQualified: false;
  sourceCommitment: string;
  federalAgi: Decimal;
  ohioAgi: Decimal;
  reciprocalWageExclusion?: Decimal;
  residentCredit?: Decimal;
  exemptions: Decimal;
  taxBeforeCredits: Decimal;
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
/** Calculate solely from the current opaque source context; caller scalars cannot qualify. */
export function calculateOhio2026ReturnDraft(input: TaxYearInput, sources: unknown, context: Ohio2026OrdinaryContext): Ohio2026ReturnDraftResult {
  const actual = readOhio2026OrdinarySource(context, input, sources);
  const federalAgi = new Decimal(actual.federalAgi);
  const reciprocal = actual.reciprocalWageExclusion !== undefined;
  const ohioAgi = federalAgi.minus(actual.reciprocalWageExclusion ?? '0');
  const baselineInput = { taxYear: 2026, filingStatus: actual.filingStatus, ohioAdjustedGrossIncome: ohioAgi,
    businessIncomeDeduction: '0', qualifyingCapitalGainsAndPayrollDeduction: '0', taxableBusinessIncome: '0',
    eligibleExemptions: actual.eligibleExemptions, primaryQualifyingIncome: actual.primaryQualifyingIncome,
    ...(actual.spouseQualifyingIncome === undefined ? {} : { spouseQualifyingIncome: actual.spouseQualifyingIncome }) };
  const beforeCredits = calculateOhio2026Baseline({ ...baselineInput, precedingCredits: '0' });
  const personalExemptionCredit = beforeCredits.modifiedAdjustedGrossIncome.minus(beforeCredits.exemptions).lt('30000')
    ? Decimal.min(beforeCredits.totalTax, new Decimal('20').times(actual.eligibleExemptions)) : new Decimal(0);
  const baseline = calculateOhio2026Baseline({ ...baselineInput, precedingCredits: personalExemptionCredit });
  // Source admission establishes zero EITC using actual no-child facts and the
  // indexed2026 cutoff, rather than defaulting an unavailable federal result.
  const earnedIncomeCredit = new Decimal(0);
  const nrc = reciprocal ? { line19: new Decimal(0), line20: new Decimal(0), lines: [] } : calculateOhioITNRC({ taxYear: 2026, filingStatus: actual.filingStatus,
    federalAgi, ohioAgi, taxRemainingBeforeResidencyCredits: baseline.taxAfterJointCredit,
    residencyFacts: actual.residency });
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
  if (reciprocal) audit.record('OH2026 enacted PA reciprocal draft', 'reciprocal-exclusion', 'Actual reciprocal compensation excluded once', federalAgi,
    'Current complete full-year PA ordinary employee originals; RC5747.05(A)(2). Ohio AGI0; excluded compensation creates neither NRC nor resident credit. No final2026 form qualification.');
  for (const [line, label, value, formula] of [
    ['AGI', reciprocal ? 'Actual completed wage-only federal AGI before reciprocal exclusion' : 'Actual completed wage-only federal and Ohio AGI', federalAgi, 'Round sum current source-qualified ordinary W2 wages; no other actual sources admitted'],
    ['personal-credit', 'Personal exemption credit', personalExemptionCredit, 'min(tax,20*actual eligible count) only if statutory MAGI less exemptions<30000; RC5747.022'],
    ['joint-credit', 'Joint filing credit after personal credit', baseline.jointFilingCredit, 'Actual each-owner qualifying wages, corrected MAGI and remaining-tax tier/cap; RC5747.05(E)'],
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
    sourceCommitment: context.sourceCommitment, federalAgi, ohioAgi, ...(reciprocal ? { reciprocalWageExclusion: new Decimal(actual.reciprocalWageExclusion ?? '0'), residentCredit: new Decimal(0) } : {}), ...(resident ? { residentCredit: resident.credit } : {}), exemptions: baseline.exemptions,
    taxBeforeCredits: baseline.totalTax, personalExemptionCredit, jointFilingCredit: baseline.jointFilingCredit, earnedIncomeCredit,
    nonresidentRatio: nrc.line19, nonresidentCredit: nrc.line20, incomeTax, withholding, underpaymentPenalty, latePaymentInterest, amountDue, refund,
    limitations: [
      'Finite single/MFJ current ordinary employee cohort only; no dependents or EITC-qualifying children, under65 adults, no other state adjustments or credit sources.',
      resident ? 'Finite single full-year Ohio employee credit for completed paid2026 VA763 liability; Virginia tax calculation, unsettled accounts and other jurisdictions require separate methods.' : reciprocal ? 'Finite single full-year PA ordinary employee reciprocal compensation only; mixed, other-domicile, part-year, joint and specialized compensation remain separate methods.' : 'Actual no taxing-school-district residence and no other-state tax on Ohio-resident income; reciprocal and specialized income methods remain separate.',
      actualBalancePayment ? 'Finite first Ohio return with documentary timely actual balance at most500 under both raw and reported admission limits; outstanding balance is receipt arithmetic, not an external account observation. Other payment methods remain unavailable.' : 'Ordinary first Ohio return with equal-quarter withholding covering liability; other payments, prior returns/carries, penalties and balance elections require separate current methods.',
      'Final2026 form identity/numbering, independent human review, complete selected-state scope and filing qualification remain unavailable.',
    ], lines: [...baseline.lines, ...nrc.lines, ...(resident?.lines ?? []), ...audit.getLines()] };
}
