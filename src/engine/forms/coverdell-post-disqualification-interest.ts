// Spec: spec/federal/form-1099-q-post-disqualification-interest.yaml.
import Decimal from 'decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import type { Form1099Int, Form1099Q, Taxpayer } from '@/models/inputs.js';
import { CoverdellPostDisqualificationInterestSchema } from '@/models/coverdell-post-disqualification-interest.js';

const zeroFields = ['earlyWithdrawalPenalty', 'usSavingsBondInterest', 'federalWithheld', 'foreignTaxPaid',
  'taxExemptInterest', 'privateActivityBondInterest', 'paDirectObligationInterest', 'stateWithheld'] as const;
function actual(value: string | undefined, label: string): Decimal {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw Error(`Coverdell converted bank interest requires actual nonnegative ${label}, including known zero`);
  const result = new Decimal(value);
  if (!result.isFinite()) throw Error(`Coverdell converted bank interest requires finite ${label}`);
  return result;
}
const taxId = (value: string | undefined) => value && /^\d{3}-?\d{2}-?\d{4}$/.test(value) ? value.replaceAll('-', '') : undefined;
const tin = (value: string | undefined) => value?.trim().replaceAll('-', '');
function originalIdentity(form: Partial<Form1099Int>): string {
  return JSON.stringify([form.taxYear, form.accountHolder, tin(form.payerTin), form.accountReference?.trim()]);
}
/** Validate separate already-reported interest; never create an original or add income. */
export function calculateCoverdellPostDisqualificationInterest(form: Form1099Q, options: {
  taxYear: number; taxpayer?: Taxpayer; beneficiaryTaxId?: string;
  originalInterestStatements?: Form1099Int[]; allDistributionStatements: Form1099Q[];
}): { interest: Decimal; originalIntIndex: number } {
  const parsed = CoverdellPostDisqualificationInterestSchema.safeParse(form.postDisqualificationInterestSources);
  if (!parsed.success) throw Error('Coverdell converted bank interest requires complete actual custodian, owner, ledger and original interest sources');
  const facts = parsed.data, year = options.taxYear;
  if (facts.sourceTaxYear !== year || facts.sourceId !== form.sourceId || facts.accountId !== form.accountId
    || facts.beneficiaryId !== form.beneficiaryId || form.taxYear !== year || form.accountType !== 'coverdell_esa'
    || form.distributionCode !== '6' || form.prohibitedTransactionKind !== 'account_disqualification'
    || form.prohibitedTransactionNoPostDisqualificationActivityConfirmed !== false
    || form.prohibitedTransactionDate !== `${year}-01-01` || facts.custodianConversionDate !== `${year}-01-01`
    || form.recipientOwner !== 'primary' || form.recipientNotBeneficiary !== false) {
    throw Error('Coverdell converted bank interest requires the actual January1 whole-account event and primary-beneficiary cash conversion');
  }
  const primaryId = taxId(options.taxpayer?.primary.ssn), beneficiaryId = taxId(options.beneficiaryTaxId);
  if (!primaryId || primaryId !== beneficiaryId || options.taxpayer?.taxYear !== year) {
    throw Error('Coverdell converted deposit ownership must match the actual primary beneficiary and return year');
  }
  for (const key of ['otherIncome', 'realizedGains', 'realizedLosses', 'contributions', 'withdrawals', 'transfers', 'fees'] as const)
    if (!actual(facts[key], key).isZero()) throw Error('Coverdell converted bank interest requires all other actual income, gain, loss and flows to be known zero');
  const opening = actual(facts.openingCash, 'opening cash'), interest = actual(facts.taxableBankInterest, 'taxable bank interest');
  if (!opening.eq(actual(form.prohibitedTransactionJanuary1Value, 'January1 deemed value')) || !interest.gt(0)
    || !actual(facts.closingCash, 'closing cash').eq(sumSourceMoney(opening, interest))) {
    throw Error('Coverdell converted bank interest requires exact full-year cash conservation and positive original interest; zero uses verified no-activity sources');
  }
  const originals = options.originalInterestStatements, snapshot = facts.originalInterestSnapshot;
  const original = originals?.[facts.originalIntIndex];
  if (!Array.isArray(originals) || !original || original.taxYear !== year || snapshot.taxYear !== year
    || original.accountHolder !== 'primary' || originalIdentity(original) !== originalIdentity(snapshot)
    || !/^\d{9}$/.test(tin(original.payerTin) ?? '') || original.payer.trim() !== snapshot.payer
    || !original.accountReference?.trim() || original.foreignCountry?.trim() || original.state?.trim()
    || original.privateActivityBondFacts !== undefined
    || !actual(original.interestIncome, 'original Box1 interest').eq(interest)
    || !actual(snapshot.interestIncome, 'snapshot Box1 interest').eq(interest)) {
    throw Error('Coverdell converted bank interest must match its complete actual same-year domestic bank original and snapshot');
  }
  for (const key of zeroFields)
    if (!actual(original[key], `original ${key}`).isZero() || !actual(snapshot[key], `snapshot ${key}`).isZero())
      throw Error('Coverdell converted bank interest requires all other original INT boxes to be actual zero');
  // Optional year/owner cannot prove a second statement for this bank account
  // independent. Require a distinct actual bank TIN or distinct known account.
  const independentlyDistinct = (row: Form1099Int): boolean => {
    const otherTin = tin(row.payerTin), otherAccount = row.accountReference?.trim();
    return (/^\d{9}$/.test(otherTin ?? '') && otherTin !== tin(original.payerTin))
      || Boolean(otherAccount && otherAccount !== original.accountReference?.trim());
  };
  if (originals.filter(row => !independentlyDistinct(row)).length !== 1) {
    throw Error('Coverdell converted bank interest requires one unique original bank account statement, without duplicate or partial allocation');
  }
  for (const other of options.allDistributionStatements) {
    if (other === form || other.sourceId === form.sourceId) continue;
    const candidate = other.postDisqualificationInterestSources;
    if (candidate && (candidate.originalIntIndex === facts.originalIntIndex
      || originalIdentity(candidate.originalInterestSnapshot) === originalIdentity(snapshot))) {
      throw Error('Coverdell converted bank original cannot be assigned to another terminated account');
    }
  }
  return { interest, originalIntIndex: facts.originalIntIndex };
}
