/** Original QSBS sources. Spec: spec/federal/section-1202-sources.yaml. */
import Decimal from 'decimal.js';
import { Section1202SourcesSchema, type TaxYearInput } from '@/models/inputs.js';
import { d, sum } from '@/utils/decimal.js';
import { calculateSection1202 } from './section-1202.js';

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
function amount(value: string | undefined, label: string, signed = false): Decimal {
  if (value === undefined || !/^-?\d+(?:\.\d+)?$/.test(value) || !d(value).isFinite() || (!signed && d(value).lt(0))) {
    throw new Error(`Section1202 actual ${label} must be known and finite`);
  }
  return d(value);
}
function actualDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Section1202 actual source calendar date is invalid');
  }
  return value;
}
function oneYearLater(value: string): string {
  const original = new Date(`${actualDate(value)}T00:00:00Z`), year = original.getUTCFullYear() + 1;
  const lastDay = new Date(Date.UTC(year, original.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, original.getUTCMonth(), Math.min(original.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}
type Identity = { firstName: string; lastName: string; ssnLast4: string };
function identity(original: TaxYearInput['taxpayer']['primary'], record: Identity | undefined) {
  if (!record || normalized(record.firstName) !== normalized(original.firstName) || normalized(record.lastName) !== normalized(original.lastName)
    || record.ssnLast4 !== original.ssn.replace(/-/g, '').slice(-4)) throw new Error('Section1202 source household identity must match the actual return');
}
function household(input: TaxYearInput, source: { primary: Identity; spouse?: Identity }) {
  identity(input.taxpayer.primary, source.primary);
  if (input.taxpayer.filingStatus === 'married_filing_jointly') {
    if (!input.taxpayer.spouse) throw new Error('Section1202 actual joint spouse is missing');
    identity(input.taxpayer.spouse, source.spouse);
  } else if (source.spouse) throw new Error('Section1202 source spouse conflicts with the actual return');
}

export function calculateSection1202Sources(input: TaxYearInput) {
  const reported = input.form1099Div.some(row => d(row.section1202Gain).gt(0));
  if (!input.section1202Sources) {
    if (reported) throw new Error('Section1202 gain requires actual issuer, original acquisition and ownership sources');
    return undefined;
  }
  const facts = Section1202SourcesSchema.parse(input.section1202Sources);
  if (facts.taxYear !== input.taxpayer.taxYear || facts.sourceFactsConfirmed !== true || facts.allSourcesIncluded !== true
    || facts.preExclusionAmountsConfirmed !== true || !facts.issuers.length || !facts.lots.length) {
    throw new Error('Section1202 requires complete confirmed actual-year sources before exclusion');
  }
  household(input, facts);
  const issuers = facts.issuers.map(issuer => {
    if (!issuer.membershipUnchangedConfirmed) throw new Error('Section1202 changed household history requires the actual prior-member allocation worksheet');
    const years = new Set<number>();
    const used = issuer.priorReturns.map(record => {
      if (record.taxYear < 1998 || record.taxYear >= facts.taxYear || years.has(record.taxYear) || record.filingStatus !== input.taxpayer.filingStatus) {
        throw new Error('Section1202 actual prior return history year or membership conflicts');
      }
      years.add(record.taxYear); household(input, record);
      return amount(record.eligibleGainUsed, 'prior eligible gain');
    });
    if (!sum(...used).eq(amount(issuer.priorEligibleGainUsed, 'complete prior eligible gain'))) throw new Error('Section1202 prior issuer history must reconcile before exclusion percentage');
    return { issuerId: issuer.issuerId, sourceReference: issuer.sourceReference,
      allPriorUseAndCurrentDispositionsConfirmed: issuer.allPriorUseAndCurrentDispositionsConfirmed,
      priorEligibleGainUsed: amount(issuer.priorEligibleGainUsed, 'prior eligible gain'),
      eligibleGainAllocations: issuer.eligibleGainAllocations?.map(row => ({ sourceId: row.sourceId,
        ordinaryEligibleGain: amount(row.ordinaryEligibleGain, 'ordinary allocation'), empowermentEligibleGain: amount(row.empowermentEligibleGain, 'empowerment allocation') })),
    };
  });
  const brokerSources = new Set<string>();
  const fundTotals = new Map<number, Decimal>();
  const bindings: Array<{ lotId: string; originalSourceId: string; issuerName: string; sourceKind: 'broker' | 'fund' }> = [];
  const lots = facts.lots.map(lot => {
    const issuer = facts.issuers.find(row => row.issuerId === lot.issuerId);
    if (!issuer) throw new Error('Section1202 lot issuer is missing from actual history');
    if (lot.accountHolder === 'spouse' && (input.taxpayer.filingStatus !== 'married_filing_jointly' || !input.taxpayer.spouse)) throw new Error('Section1202 source spouse is absent from the actual return');
    const recognizedGain = amount(lot.recognizedGain, 'recognized gain', true);
    const basis = amount(lot.basisIgnoringPostIssueAdditions, 'basis ignoring additions');
    const empowerment = amount(lot.empowermentZoneGainThrough2018, 'empowerment attribution');
    if (empowerment.gt(0) && !lot.empowermentQualificationAndAttributionConfirmed) throw new Error('Section1202 actual empowerment qualification and attribution are required');
    const qualification = lot.qualification;
    if (!qualification.allPredecessorAndControlledGroupAssetsIncluded) throw new Error('Section1202 complete predecessor and controlled-group asset sources are required');
    if (qualification.offsettingPositionPresent) throw new Error('Section1202 offsetting position requires its separate election and holding-period sources');
    const originalIssue = actualDate(lot.originalIssueDate);
    const effectiveAcquired = actualDate(lot.effectiveAcquiredDate);
    const sold = actualDate(lot.dateSold);
    const assetLimit = d(originalIssue <= '2025-07-04' ? '50000000' : '75000000');
    let qualifiedStock = originalIssue > '1993-08-10' && qualification.domesticCCorporationAtIssue
      && ['money', 'property_not_stock', 'services_not_underwriter'].includes(qualification.consideration)
      && amount(qualification.maxGrossAssetsBeforeIssue, 'maximum gross assets').lte(assetLimit)
      && amount(qualification.grossAssetsImmediatelyAfterIssue, 'gross assets after issue').lte(assetLimit)
      && qualification.cCorporationThroughoutHolding && qualification.activeBusinessRequirementSatisfied && qualification.redemptionRestrictionsSatisfied;
    // Validate both original asset amounts even if another known fact is disqualifying.
    amount(qualification.maxGrossAssetsBeforeIssue, 'maximum gross assets');
    amount(qualification.grossAssetsImmediatelyAfterIssue, 'gross assets after issue');
    const brokerId = /^form1099B:(0|[1-9]\d*):transaction:(0|[1-9]\d*)$/.exec(lot.sourceId);
    const fundId = /^form1099Div:(0|[1-9]\d*)$/.exec(lot.sourceId);
    if (brokerId) {
      if (brokerSources.has(lot.sourceId)) throw new Error('Section1202 duplicate original brokerage source');
      brokerSources.add(lot.sourceId);
      const form = input.form1099B[Number(brokerId[1])], trade = form?.transactions[Number(brokerId[2])];
      if (!form || !trade || lot.passThrough || normalized(form.broker) !== normalized(lot.payerName)
        || (form.accountHolder !== undefined && form.accountHolder !== lot.accountHolder)
        || (form.taxYear !== undefined && form.taxYear !== facts.taxYear)
        || trade.description !== lot.securityDescription || trade.dateAcquired !== effectiveAcquired || trade.dateSold !== sold || trade.washSale !== lot.washSale) {
        throw new Error('Section1202 original brokerage identity, owner or dates are stale or conflicting');
      }
      if (trade.holdingPeriod !== (sold > oneYearLater(effectiveAcquired) ? 'long' : 'short')) throw new Error('Section1202 original holding period conflicts with actual acquisition and sale dates');
      for (const key of ['proceeds', 'costBasis', 'adjustments', 'washSaleDisallowed'] as const) {
        if (!amount(lot[key], `original ${key}`, key === 'adjustments').eq(amount(trade[key], `brokerage ${key}`, key === 'adjustments'))) {
          throw new Error('Section1202 original brokerage amounts must reconcile');
        }
      }
      const gain = amount(trade.proceeds, 'proceeds').minus(amount(trade.costBasis, 'cost basis'))
        .plus(amount(trade.adjustments, 'adjustments', true)).plus(trade.washSale ? amount(trade.washSaleDisallowed, 'wash loss') : d('0'));
      if (!gain.eq(recognizedGain)) throw new Error('Section1202 original recognized gain must reconcile before exclusion');
      if (basis.gt(amount(trade.costBasis, 'cost basis'))) throw new Error('Section1202 basis ignoring additions exceeds the original adjusted basis');
      bindings.push({ lotId: lot.lotId, originalSourceId: lot.sourceId, issuerName: issuer.issuerName, sourceKind: 'broker' });
    } else if (fundId) {
      const index = Number(fundId[1]), form = input.form1099Div[index], pass = lot.passThrough;
      if (!form || !pass || normalized(form.payer) !== normalized(lot.payerName)
        || (form.accountHolder !== undefined && form.accountHolder !== lot.accountHolder)) throw new Error('Section1202 original fund identity and ownership sources are required');
      if (!pass.unchangedOwnershipProportionConfirmed) throw new Error('Section1202 changing entity interests require the actual original ownership allocation worksheet');
      const share = amount(pass.ownershipPercentage, 'entity ownership percentage');
      if (share.lte(0) || share.gt(100)) throw new Error('Section1202 actual ownership percentage must be greater than zero and at most100');
      if (!amount(pass.entityRecognizedGain, 'entity recognized gain', true).times(share).div(100).eq(recognizedGain)
        || !amount(pass.entityBasisIgnoringPostIssueAdditions, 'entity original basis').times(share).div(100).eq(basis)
        || !amount(pass.fundSection1202Gain, 'original fund2c').eq(amount(form.section1202Gain, 'fund2c'))
        || !amount(pass.fundCapitalGainDistributions, 'original fund2a').eq(amount(form.totalCapitalGainDistributions, 'fund2a'))) {
        throw new Error('Section1202 original fund gain, basis and ownership amounts must reconcile');
      }
      if (recognizedGain.lt(0)) throw new Error('Section1202 fund gain partition cannot be negative');
      qualifiedStock = qualifiedStock && actualDate(pass.ownerInterestAcquiredDate) <= effectiveAcquired && pass.heldContinuouslyThroughSale;
      // Always validate the date even if a corporate source is disqualifying.
      actualDate(pass.ownerInterestAcquiredDate);
      fundTotals.set(index, (fundTotals.get(index) ?? d('0')).plus(recognizedGain));
      bindings.push({ lotId: lot.lotId, originalSourceId: lot.sourceId, issuerName: issuer.issuerName, sourceKind: 'fund' });
    } else throw new Error('Section1202 original source method requires its separate complete source worksheet');
    return { sourceId: lot.lotId, issuerId: lot.issuerId, sourceReference: lot.sourceReference, qualifiedStock,
      acquisitionMethod: lot.acquisitionMethod, originalIssueDate: originalIssue, effectiveAcquiredDate: effectiveAcquired, dateSold: sold,
      recognizedGain, basisIgnoringPostIssueAdditions: basis, empowermentZoneGainThrough2018: empowerment };
  });
  input.form1099Div.forEach((form, index) => {
    const gain = amount(form.section1202Gain, 'reported fund2c');
    if (gain.gt(amount(form.totalCapitalGainDistributions, 'reported fund2a'))) throw new Error('Section1202 reported fund gain exceeds actual total distributions');
    if (!gain.eq(fundTotals.get(index) ?? d('0'))) throw new Error('Section1202 every reported fund source needs its complete actual issuer partition');
  });
  return { ...calculateSection1202({ taxYear: facts.taxYear, filingStatus: input.taxpayer.filingStatus,
    sourceFactsConfirmed: facts.sourceFactsConfirmed, issuers, lots }), bindings };
}

export type Section1202SourceResult = NonNullable<ReturnType<typeof calculateSection1202Sources>>;
