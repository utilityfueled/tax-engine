/** Actual ordinary traditional IRA sources. Spec: spec/federal/ira-basis-sources.yaml. */
import { Form8606Schema, type Form8606Input, type TaxYearInput } from '@/models/inputs.js';
import { IraBasisSourcesSchema } from '@/models/ira-basis-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

type Owner = 'primary' | 'spouse';
/** Source binding needs no fabricated address, income or unrelated return facts. */
export type IraBasisSourceContext = Pick<TaxYearInput, 'form1099R' | 'iraBasisSources' | 'form8606' | 'form8606ByOwner' | 'iraDeductionWorksheet' | 'adjustments' | 'form8889' | 'form8889ByOwner'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus' | 'primary' | 'spouse'>;
};
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const digits = (value: string) => value.replace(/-/g, '');
function fail(message: string): never { throw new Error(`IRA basis sources: ${message}`); }
function calendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function rejectPositive(values: Array<string | undefined>) {
  if (values.some(value => value !== undefined && (!/^\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite() || d(value).gt(0)))) {
    fail('current contributions, deductions or HSA funding require their separate actual method');
  }
}

export function calculateIraBasisSources(input: IraBasisSourceContext) {
  if (input.iraBasisSources === undefined) return undefined;
  const facts = IraBasisSourcesSchema.parse(input.iraBasisSources);
  if (facts.taxYear !== input.taxpayer.taxYear || !facts.sourceFactsConfirmed || !facts.allIraOwnersAndAccountsIncluded || !facts.allDistributionsIncluded) {
    fail('complete confirmed actual-year owner, account and distribution sources are required');
  }
  if (input.form8606 !== undefined || input.form8606ByOwner !== undefined) fail('reconcile legacy Form8606 overrides before using original source binding');
  const contribution = input.iraDeductionWorksheet;
  rejectPositive([contribution?.primaryContributions, contribution?.spouseContributions,
    contribution?.primaryRothContributions, contribution?.spouseRothContributions,
    input.adjustments?.iraDeduction, input.adjustments?.seRetirementContributions,
    input.form8889?.qualifiedFundingDistribution, input.form8889ByOwner?.primary?.qualifiedFundingDistribution,
    input.form8889ByOwner?.spouse?.qualifiedFundingDistribution]);
  const audit = new AuditTrail();
  const form8606ByOwner: Partial<Record<Owner, Form8606Input>> = {};
  const ownerSet = new Set<Owner>(); const accountIds = new Set<string>(); const accountIdentities = new Set<string>();
  const accounts = new Map<string, { owner: Owner; account: typeof facts.owners[number]['accounts'][number] }>();
  for (const record of facts.owners) {
    const owner = record.accountHolder;
    if (ownerSet.has(owner)) fail('duplicate owner worksheet');
    ownerSet.add(owner);
    if (owner === 'spouse' && input.taxpayer.filingStatus !== 'married_filing_jointly') fail('spouse source requires the actual joint return');
    const person = owner === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || !normalized(person.firstName) || !normalized(person.lastName) || !/^\d{9}$/.test(digits(person.ssn))
      || !calendarDate(person.dateOfBirth) || person.dateOfBirth > `${facts.taxYear}-12-31`
      || normalized(person.firstName) !== normalized(record.identity.firstName) || normalized(person.lastName) !== normalized(record.identity.lastName)
      || person.dateOfBirth !== record.identity.dateOfBirth || digits(person.ssn).slice(-4) !== record.identity.ssnLast4) {
      fail('complete actual household identity must match each owner worksheet');
    }
    if (Object.values(record.ordinaryFacts).some(value => value !== false)) fail('additional retirement facts require their separate actual method');
    const history = record.basisHistory;
    if (!history.allPriorRecordsReviewed || history.basisChangesSinceThatReturn) fail('complete prior basis history and intervening changes must be reconciled');
    let basis = d('0');
    if (history.method === 'prior_form_8606') {
      if (history.taxYear >= facts.taxYear || !history.mostRecentFormConfirmed || (history.taxYear < 2024 && !d(history.line15cWorksheetAdjustment).isZero())) {
        fail('most recent prior Form8606 year or actual worksheet adjustment conflicts');
      }
      basis = d(history.line14).plus(history.line15cWorksheetAdjustment);
    }
    for (const account of record.accounts) {
      const physical = `${digits(account.custodianTin)}|${normalized(account.accountReference)}`;
      if (account.taxYear !== facts.taxYear || accountIds.has(account.accountId) || accountIdentities.has(physical)) fail('current-year accounts must be unique across all actual owners');
      accountIds.add(account.accountId); accountIdentities.add(physical); accounts.set(account.accountId, { owner, account });
    }
    const yearEndValue = sum(...record.accounts.map(account => d(account.yearEndValue)));
    // Defaults below are justified by the explicit negative additional-method
    // answers above; no missing source amount or history is converted to zero.
    form8606ByOwner[owner] = Form8606Schema.parse({ priorYearBasis: basis.toFixed(), yearEndValue: yearEndValue.toFixed(), traditionalDistributions: '0' });
    audit.record('IRA basis sources', `${owner}-basis`, `${owner} actual prior traditional IRA basis`, basis,
      history.method === 'confirmed_zero' ? 'Explicit complete-history zero confirmation' : 'Actual prior Form8606 line14 plus applicable worksheet adjustment');
    audit.record('IRA basis sources', `${owner}-year-end`, `${owner} all traditional IRA year-end values`, yearEndValue,
      'Sum actual December31 traditional, SEP and SIMPLE account values before form rounding');
  }
  const seen = new Set<string>(); const distributionAccounts = new Set<string>();
  const grossByOwner = { primary: d('0'), spouse: d('0') };
  for (const source of facts.distributions) {
    if (seen.has(source.sourceId)) fail('duplicate original distribution source');
    if (distributionAccounts.has(source.accountId)) fail('reconcile multiple ordinary statements for one actual account');
    seen.add(source.sourceId);
    distributionAccounts.add(source.accountId);
    const original = input.form1099R?.[Number(source.sourceId.slice('form1099R:'.length))];
    const linked = accounts.get(source.accountId);
    if (!original || !linked || linked.owner !== source.accountHolder || original.accountHolder !== source.accountHolder
      || source.taxYear !== facts.taxYear || original.taxYear !== facts.taxYear
      || original.iraSepSimple !== true || source.iraSepSimple !== true || original.distributionCode?.trim().toUpperCase() !== '7' || source.distributionCode.trim().toUpperCase() !== '7'
      || normalized(original.payer) !== normalized(source.payer) || normalized(linked.account.custodian) !== normalized(source.payer)
      || !original.payerTin || digits(original.payerTin) !== digits(source.payerTin) || digits(linked.account.custodianTin) !== digits(source.payerTin)
      || !original.accountReference || normalized(original.accountReference) !== normalized(source.accountReference)
      || normalized(linked.account.accountReference) !== normalized(source.accountReference)
      || !d(original.grossDistribution).eq(source.grossDistribution)
      || original.taxableAmountNotDetermined !== source.taxableAmountNotDetermined
      || (original.taxableAmount === undefined ? source.taxableAmount !== null : source.taxableAmount === null || !d(original.taxableAmount).eq(source.taxableAmount))
      || (source.taxableAmount === null && !source.taxableAmountNotDetermined)
      || (source.taxableAmount !== null && d(source.taxableAmount).gt(source.grossDistribution))) {
      fail('original distribution year, owner, account, code or printed amounts are missing, stale or conflicting');
    }
    const person = source.accountHolder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || person.dateOfBirth > `${facts.taxYear - 59}-06-30`) fail('ordinary code7 conflicts with actual owner age');
    if (facts.taxYear === 2026 && (original.trumpAccount !== false || original.excessContributionEarnings === undefined
      || !d(original.excessContributionEarnings).isZero())) fail('actual2026 Trump account and excess-earnings boxes require their separate method unless confirmed false and zero');
    if (original.returnedContributionByDueDate || original.excessContributionReturnedWithoutEarnings || original.qualifiedRothDistribution
      || original.eligibleGovernmental457bPlan || original.disabilityPensionBeforeMinimumRetirementAge) fail('original special distribution metadata needs its separate actual method');
    rejectPositive([original.rothConversionAmount, original.qualifiedCharitableDistribution, original.rothIraRolledOverAmount, original.employeeContributions]);
    grossByOwner[source.accountHolder] = grossByOwner[source.accountHolder].plus(source.grossDistribution);
  }
  for (const [index, original] of (input.form1099R ?? []).entries()) {
    if (original.iraSepSimple && !seen.has(`form1099R:${index}`)) fail('every original IRA distribution needs a complete owner source link');
  }
  for (const owner of ownerSet) {
    const ownerInput = form8606ByOwner[owner];
    if (!ownerInput) fail('owner worksheet is missing');
    ownerInput.traditionalDistributions = grossByOwner[owner].toFixed();
    audit.record('IRA basis sources', `${owner}-gross`, `${owner} actual ordinary IRA gross distributions`, grossByOwner[owner],
      'Sum matched original gross amounts with Decimal before form rounding');
  }
  return { form8606ByOwner, lines: audit.getLines() };
}
