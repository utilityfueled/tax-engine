import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CurrentMinimumTaxCreditSources } from '@/models/current-minimum-tax-credit-sources.js';

type IdentityInput = { taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
  primary: Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'> };
  form982AttributeSources?: TaxYearInput['form982AttributeSources'] };
const name = (value: string | undefined) => value?.trim().replace(/\s+/g, ' ').toLowerCase();
const ein = (value: string | undefined) => value?.replace(/\D/g, '');
function invalid(detail: string): never { throw new Error(`Current MTC source ${detail}`); }
function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^-?\d+(\.\d+)?$/.test(value)) invalid(`requires the actual ${label}, including known zero`);
  const result = new Decimal(value);
  if (!result.isFinite()) invalid(`requires finite ${label}`);
  return result;
}
function confirmed(value: { sourceTaxYear?: number; sourceReference?: string; sourceFactsConfirmed?: boolean } | undefined, year: number): void {
  if (!value || value.sourceTaxYear !== year || value.sourceFactsConfirmed !== true || !value.sourceReference?.trim()) invalid('requires confirmed actual same-year references');
}
function empty(value: unknown[] | undefined, label: string): void {
  if (!Array.isArray(value)) invalid(`requires an explicit complete ${label} inventory`);
  if (value.length) invalid(`${label} requires its additional exclusion-only source method`);
}
function equal(value: string | undefined, original: string | undefined, label: string): void {
  if (!amount(value, label).eq(new Decimal(original ?? '0'))) invalid(`${label} must match each original adjustment statement`);
}

/** Packet validation can occur before the full original return is assembled.
 * Passing originals additionally binds every actual consumed statement and
 * checks the bounded method; final calculation always supplies originals. */
export function readCurrentMinimumTaxCreditSources(input: IdentityInput, originals?: TaxYearInput): CurrentMinimumTaxCreditSources | undefined {
  const facts = input.form982AttributeSources?.currentMinimumTaxCredit?.sourceYearCalculation;
  if (!facts) return undefined;
  const year = input.taxpayer.taxYear, primary = input.taxpayer.primary;
  confirmed(facts, year);
  if (![2025, 2026].includes(year) || facts.allAdjustmentSourcesIncluded !== true
    || facts.filingStatus !== input.taxpayer.filingStatus || facts.taxpayerIdLast4 !== primary.ssn.replace(/\D/g, '').slice(-4)
    || !/^\d{4}$/.test(facts.taxpayerIdLast4 ?? '') || name(facts.taxpayerName) !== name(`${primary.firstName} ${primary.lastName}`)) invalid('requires the actual complete owner, year and filing status');
  if (facts.filedForm2555 !== false || facts.filedForm1040NR !== false || facts.capitalGainsRequired !== false
    || !amount(facts.unallowedQualifiedElectricVehicleCredit, 'unallowed legacy vehicle credit').isZero()) invalid('requires the separate actual foreign, capital or legacy-credit method');
  const nol = facts.minimumTaxCreditNolHistory, foreign = facts.exclusionOnlyForeignHistory;
  confirmed(nol, year); confirmed(foreign, year);
  if (nol?.allCarryoversAndCarrybacksIncluded !== true || foreign?.allCurrentAndHistoricalSourcesIncluded !== true) invalid('requires independently complete MTCNOL and MTFTCE histories');
  empty(nol.carryoverSources, 'MTCNOL carryover'); empty(nol.carrybackSources, 'MTCNOL carryback');
  empty(foreign.currentSources, 'MTFTCE current'); empty(foreign.carryoverSources, 'MTFTCE carryover'); empty(foreign.carrybackSources, 'MTFTCE carryback');
  if (!Array.isArray(facts.k1Statements) || !Array.isArray(facts.trustStatements)) invalid('requires explicit complete original adjustment inventories');
  const ids = new Set<string>(), entities = new Set<string>();
  for (const row of [...facts.k1Statements, ...facts.trustStatements]) {
    confirmed(row, year);
    const identity = `${row.accountHolder}:${ein(row.entityEin)}`;
    if (!row.sourceId?.trim() || ids.has(row.sourceId) || !name(row.entityName) || !/^\d{9}$/.test(ein(row.entityEin) ?? '')
      || !['primary', 'spouse'].includes(row.accountHolder ?? '') || entities.has(identity)) invalid('has missing or duplicate original adjustment identity');
    ids.add(row.sourceId); entities.add(identity);
  }
  for (const row of facts.k1Statements) {
    if (row.accountHolder === 'spouse' && input.taxpayer.filingStatus !== 'married_filing_jointly') invalid('spouse original requires the actual joint return owner');
    if (row.standaloneOriginal && (!row.standaloneOriginal.sourceReference?.trim()
      || !['partnership', 's_corporation'].includes(row.standaloneOriginal.entityType ?? '')
      || row.standaloneOriginal.allOtherAmountsZeroConfirmed !== true || row.standaloneOriginal.domesticContinuingNonPtpConfirmed !== true
      || row.standaloneOriginal.isPassiveActivity !== false)) invalid('standalone K1 requires actual complete zero-other-box, nonpassive and domestic continuing original facts');
    amount(row.depreciationAdjustment, 'depreciation'); amount(row.dispositionAdjustment, 'disposition'); amount(row.depletionAdjustment, 'depletion');
    if (!amount(row.otherAdjustment, 'other adjustment').isZero()) invalid('unclassified other adjustment requires its original exclusion/deferral breakdown');
  }
  for (const row of facts.trustStatements) {
    if (!amount(row.adjustment, 'trust adjustment').isZero() || !amount(row.exclusionCodeJ, 'trust exclusion codeJ').isZero()) invalid('nonzero trust adjustment requires its original exclusion/deferral method');
  }
  if (!originals) return facts;
  if (facts.k1Statements.length !== originals.scheduleK1.length || facts.trustStatements.length !== (originals.scheduleK1Form1041?.length ?? 0)) invalid('inventory must include every original adjustment statement exactly once');
  for (const original of originals.scheduleK1) {
    const rows = facts.k1Statements.filter(row => ein(row.entityEin) === ein(original.partnershipEIN) && row.accountHolder === original.accountHolder);
    if (rows.length !== 1 || original.taxYear !== year || name(rows[0]?.entityName) !== name(original.partnershipName)) invalid('must bind the actual original K1 owner, year and entity');
    const row = rows[0]!;
    if (row.standaloneOriginal) {
      if (original.entityType !== row.standaloneOriginal.entityType || original.isPassiveActivity !== false
        || original.isPubliclyTradedPartnership || original.isForeignPartnership || original.form6198 || original.priorSuspendedLosses
        || Object.entries(original).some(([key, value]) => typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)
          && !['amtDepreciationAdjustment', 'amtAdjustedGainOrLoss', 'amtDepletion', 'amtOtherItems'].includes(key)
          && !['partnershipEIN', 'partnershipName'].includes(key) && !new Decimal(value).isZero())) invalid('standalone K1 source conflicts with its actual original type, activity or other amounts');
    }
    equal(row.depreciationAdjustment, original.amtDepreciationAdjustment, 'K1 depreciation');
    equal(row.dispositionAdjustment, original.amtAdjustedGainOrLoss, 'K1 disposition');
    equal(row.depletionAdjustment, original.amtDepletion, 'K1 depletion'); equal(row.otherAdjustment, original.amtOtherItems, 'K1 other adjustment');
  }
  for (const original of originals.scheduleK1Form1041 ?? []) {
    const rows = facts.trustStatements.filter(row => ein(row.entityEin) === ein(original.estateTrustEIN));
    if (rows.length !== 1 || name(rows[0]?.entityName) !== name(original.estateTrustName)) invalid('must bind the actual original trust entity');
    equal(rows[0]!.adjustment, original.amtAdjustment, 'trust adjustment');
  }
  if (originals.form2555 || originals.standardDeductionFacts?.nonresidentAlien === true || originals.foreignTaxElection
    || [...originals.form1099Int.map(row => row.foreignTaxPaid), ...originals.form1099Div.map(row => row.foreignTaxPaid),
      ...originals.scheduleK1.map(row => row.foreignTaxPaid), ...(originals.scheduleK1Form1041 ?? []).map(row => row.foreignTaxesPaid),
      originals.priorYear?.foreignTaxCreditCarryforward,
      ...(originals.priorYear?.foreignTaxCreditCarryforwardByYear ?? []).map(row => row.amount),
      ...Object.values(originals.priorYear?.foreignTaxCreditCarryforwardByCategory ?? {}).flatMap(rows => rows.map(row => row.amount)),
      ...Object.values(originals.priorYear?.amtForeignTaxCreditCarryforwardByCategory ?? {}).flatMap(rows => rows?.map(row => row.amount) ?? []),
    ].some(value => value !== undefined && !new Decimal(value).isZero())) invalid('actual foreign originals conflict with the empty MTFTCE method');
  if (originals.form1099B.length || originals.section1202Sources || originals.amtCapitalGains
    || [...originals.form1099Div.flatMap(row => [row.qualifiedDividends, row.totalCapitalGainDistributions, row.section1202Gain]),
      ...originals.scheduleK1.flatMap(row => [row.netLongTermCapitalGain, row.qualifiedDividends]),
      ...(originals.scheduleK1Form1041 ?? []).flatMap(row => [row.netLongTermCapitalGain, row.qualifiedDividends]),
    ].some(value => value !== undefined && !new Decimal(value).isZero())) invalid('actual capital originals require their separate exclusion-only worksheet');
  return facts;
}
