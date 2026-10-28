/** Actual prior ordinary QBI carry; separate from still-suspended EBL character.
 * Spec: net-operating-loss-joint-ebl.yaml ordinary-prior-source. */
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { validateNolFilingUnitTimeline } from '@/utils/nol-filing-unit-timeline.js';

type SourceInput = Pick<TaxYearInput, 'qbiLossSources' | 'netOperatingLoss'> & {
  priorYear?: Pick<NonNullable<TaxYearInput['priorYear']>, 'qbiLossCarryforward' | 'activeQbiLossCarryforward'>;
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
    primary: Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
    spouse?: Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
  };
};
function fail(detail: string): never { throw new Error(`Prior ordinary QBI carry requires ${detail}`); }
function amount(value: string | undefined, label: string): string {
  if (value === undefined || !/^\d+$/.test(value) || !d(value).isFinite()) fail(`the actual nonnegative filed whole-dollar ${label}, including known zero`);
  return d(value).toFixed();
}
function name(value: string | undefined): string { return value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ?? ''; }

/** Source-only callers derive the legacy field; canonical callers reconcile it.
 * Neither route accepts an entered current deduction or outgoing carry. */
export function calculateQbiPriorCarrySources(input: SourceInput, reconcileLegacy = true):
  { qbiLossCarryforward: string; activeQbiLossCarryforward?: string } | undefined {
  const facts = input.netOperatingLoss, record = input.qbiLossSources?.priorQbiCarry;
  const required = input.taxpayer.filingStatus === 'married_filing_jointly'
    && facts?.returnMembership === 'changed_membership'
    && facts.vintages?.some(row => row.originKind === 'excess_business_loss');
  if (!record && !required) return undefined;
  if (!record) fail('a separate actual preceding-year return record; suspended EBL history does not establish ordinary carry');
  if (input.taxpayer.filingStatus !== 'married_filing_jointly' || facts?.returnMembership !== 'changed_membership') {
    fail('the separately supported filing-unit source method for this supplied original record');
  }
  if (record.sourceFactsConfirmed !== true || !record.sourceReference?.trim()
    || record.sourceTaxYear !== input.taxpayer.taxYear - 1 || !record.returnSourceId?.trim()
    || !['form_8995_line_16', 'form_8995a_schedule_c_line_6', 'completed_prior_return_no_carry'].includes(record.formKind ?? '')) {
    fail('confirmed actual preceding-year form, amount and original return identity');
  }
  const timeline = validateNolFilingUnitTimeline(input.taxpayer, facts?.filingUnitHistory);
  const prior = timeline.returns.get(record.returnSourceId);
  if (!prior || prior.taxYear !== record.sourceTaxYear || prior.filingStatus !== 'married_filing_jointly'
    || prior.members.length !== 2 || timeline.current.members.length !== 2
    || prior.members.some(id => !timeline.current.members.includes(id))) {
    fail('the same actual married couple on the preceding and current joint returns; changed owners need their separate method');
  }
  for (const [personId, printedName, suffix] of [
    [prior.primaryPersonId, record.primaryName, record.primaryTaxpayerIdLast4],
    [prior.spousePersonId, record.spouseName, record.spouseTaxpayerIdLast4],
  ] as const) {
    const person = personId ? timeline.persons.get(personId) : undefined;
    if (!person || !name(printedName) || name(printedName) !== name(person.name) || suffix !== person.taxpayerIdLast4) {
      fail('both actual prior-return owner identities to match the original filing unit');
    }
  }
  const total = amount(record.lossCarryforward, 'ordinary loss carry');
  if (record.formKind === 'completed_prior_return_no_carry' && !d(total).isZero()) fail('zero for a completed prior-return no-carry record');
  const active = record.activeLossCarryforward === undefined ? undefined : amount(record.activeLossCarryforward, 'active-character carry');
  if (active !== undefined && (!record.activeSourceReference?.trim() || d(active).gt(total))
    || active === undefined && record.activeSourceReference !== undefined) {
    fail('an independent active-character amount and reference, no greater than the ordinary carry');
  }
  if (reconcileLegacy) {
    const legacy = input.priorYear;
    if (legacy?.qbiLossCarryforward === undefined || !d(legacy.qbiLossCarryforward).eq(total)) fail('the canonical prior balance to match its actual ordinary carry source');
    if ((legacy.activeQbiLossCarryforward === undefined) !== (active === undefined)
      || active !== undefined && !d(legacy.activeQbiLossCarryforward).eq(active)) fail('the canonical active portion to match its independent source, preserving unknown');
  }
  return { qbiLossCarryforward: total, ...(active !== undefined ? { activeQbiLossCarryforward: active } : {}) };
}
