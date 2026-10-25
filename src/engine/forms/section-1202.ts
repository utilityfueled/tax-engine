/** Pure source worksheet. Spec: spec/federal/section-1202.yaml.
 * Qualification, original amounts and issuer history are bound by the caller.
 */
import Decimal from 'decimal.js';
import type { FilingStatus } from '@/models/inputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface Section1202Allocation {
  sourceId: string;
  ordinaryEligibleGain: Decimal;
  empowermentEligibleGain: Decimal;
}
export interface Section1202Input {
  taxYear: number;
  filingStatus: FilingStatus;
  sourceFactsConfirmed: boolean;
  issuers: Array<{
    issuerId: string; sourceReference: string; allPriorUseAndCurrentDispositionsConfirmed: boolean;
    /** Prior eligible gain before applying its exclusion percentage. */
    priorEligibleGainUsed: Decimal;
    eligibleGainAllocations?: Section1202Allocation[];
  }>;
  lots: Array<{
    sourceId: string; issuerId: string; sourceReference: string; qualifiedStock: boolean;
    acquisitionMethod: 'original_issue' | 'gift' | 'inheritance' | 'partnership_distribution' | 'conversion' | 'section351_or_368';
    originalIssueDate: string; effectiveAcquiredDate: string; dateSold: string;
    recognizedGain: Decimal; basisIgnoringPostIssueAdditions: Decimal;
    /** Actual qualifying60percent component; explicit zero when none. */
    empowermentZoneGainThrough2018: Decimal;
  }>;
}

function money(value: Decimal, label: string, signed = false) {
  if (!Decimal.isDecimal(value) || !value.isFinite() || (!signed && value.lt(0))) throw new Error(`Section1202 requires actual finite ${label}`);
  return value;
}
function date(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Section1202 requires actual calendar dates');
  }
  return parsed;
}
function anniversary(value: string, years: number) {
  const original = date(value), targetYear = original.getUTCFullYear() + years;
  const lastDay = new Date(Date.UTC(targetYear, original.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, original.getUTCMonth(), Math.min(original.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

export function calculateSection1202(input: Section1202Input) {
  if (![2025, 2026].includes(input.taxYear) || input.sourceFactsConfirmed !== true) throw new Error('Section1202 requires the confirmed supported source year');
  if (!['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_surviving_spouse'].includes(input.filingStatus)) throw new Error('Section1202 actual filing status is required');
  const issuerIds = new Set<string>(), lotIds = new Set<string>();
  for (const issuer of input.issuers) {
    if (!issuer.issuerId?.trim() || issuerIds.has(issuer.issuerId) || !issuer.sourceReference?.trim() || issuer.allPriorUseAndCurrentDispositionsConfirmed !== true) {
      throw new Error('Section1202 issuer identity and complete actual history are required without duplicates');
    }
    issuerIds.add(issuer.issuerId); money(issuer.priorEligibleGainUsed, 'prior eligible gain used');
  }
  const sources = input.lots.map(lot => {
    if (!lot.sourceId?.trim() || lotIds.has(lot.sourceId) || !issuerIds.has(lot.issuerId) || !lot.sourceReference?.trim() || typeof lot.qualifiedStock !== 'boolean') {
      throw new Error('Section1202 original lot identity, issuer and actual qualification are required without duplicates');
    }
    lotIds.add(lot.sourceId);
    if (lot.acquisitionMethod !== 'original_issue') throw new Error('Section1202 transfer requires the actual predecessor, ownership and exchange-cap worksheet');
    date(lot.originalIssueDate); date(lot.effectiveAcquiredDate); date(lot.dateSold);
    if (!lot.dateSold.startsWith(`${input.taxYear}-`) || lot.effectiveAcquiredDate > lot.dateSold || lot.originalIssueDate > lot.dateSold
      || lot.effectiveAcquiredDate < lot.originalIssueDate || (lot.qualifiedStock && lot.originalIssueDate <= '1993-08-10')) {
      throw new Error('Section1202 original issue, effective acquisition or disposition dates conflict');
    }
    const recognizedGain = money(lot.recognizedGain, 'recognized gain', true);
    const basis = money(lot.basisIgnoringPostIssueAdditions, 'basis ignoring post-issue additions');
    const empowerment = money(lot.empowermentZoneGainThrough2018, 'empowerment attribution');
    if (empowerment.gt(zeroFloor(recognizedGain)) || (empowerment.gt(0)
      && (!lot.qualifiedStock || lot.effectiveAcquiredDate <= '2000-12-21' || lot.effectiveAcquiredDate > '2009-02-17'))) {
      throw new Error('Section1202 actual empowerment attribution conflicts with acquisition or gain');
    }
    const held = lot.effectiveAcquiredDate <= '2025-07-04' && lot.dateSold > anniversary(lot.effectiveAcquiredDate, 5);
    const eligibleGain = lot.qualifiedStock && held ? zeroFloor(recognizedGain) : d('0');
    const empowermentEligibleGain = eligibleGain.gt(0) ? empowerment : d('0');
    const ordinaryEligibleGain = eligibleGain.minus(empowermentEligibleGain);
    const rate = lot.effectiveAcquiredDate <= '2009-02-17' ? d('0.5') : lot.effectiveAcquiredDate <= '2010-09-27' ? d('0.75') : d('1');
    return { ...lot, basis, eligibleGain, ordinaryEligibleGain, empowermentEligibleGain, rate };
  });
  const audit = new AuditTrail();
  const lotResults: Array<{ sourceId: string; issuerId: string; eligibleGainTakenIntoAccount: Decimal; exclusion: Decimal; section1202WorksheetComponent: Decimal; amtPreference: Decimal; recognizedGainAfterExclusion: Decimal }> = [];
  const issuers = input.issuers.map((issuer, index) => {
    const lots = sources.filter(lot => lot.issuerId === issuer.issuerId);
    const basis = sum(...lots.filter(lot => lot.qualifiedStock).map(lot => lot.basis));
    const dollarLimit = zeroFloor(d(input.filingStatus === 'married_filing_separately' ? '5000000' : '10000000').minus(issuer.priorEligibleGainUsed));
    const basisLimit = basis.times('10');
    const availableEligibleGain = sum(...lots.map(lot => lot.eligibleGain));
    const eligibleGainLimit = Decimal.min(availableEligibleGain, Decimal.max(dollarLimit, basisLimit));
    const rates = new Set(lots.flatMap(lot => [
      ...(lot.ordinaryEligibleGain.gt(0) ? [lot.rate.toString()] : []), ...(lot.empowermentEligibleGain.gt(0) ? ['0.6'] : []),
    ]));
    const allocations = new Map<string, Section1202Allocation>();
    if (issuer.eligibleGainAllocations) {
      for (const entry of issuer.eligibleGainAllocations) {
        const lot = lots.find(row => row.sourceId === entry.sourceId);
        if (!lot || allocations.has(entry.sourceId) || money(entry.ordinaryEligibleGain, 'ordinary allocation').gt(lot.ordinaryEligibleGain)
          || money(entry.empowermentEligibleGain, 'empowerment allocation').gt(lot.empowermentEligibleGain)) {
          throw new Error('Section1202 eligible gain allocation is duplicated or exceeds its actual source component');
        }
        allocations.set(entry.sourceId, entry);
      }
      if (allocations.size !== lots.length || !sum(...[...allocations.values()].flatMap(entry => [entry.ordinaryEligibleGain, entry.empowermentEligibleGain])).eq(eligibleGainLimit)) {
        throw new Error('Section1202 allocation must include all issuer lots and reconcile to its eligible gain limit');
      }
    } else {
      if (eligibleGainLimit.lt(availableEligibleGain) && rates.size > 1) throw new Error('Section1202 binding mixed-rate issuer limit requires the actual eligible gain allocation');
      let remaining = eligibleGainLimit;
      for (const lot of lots) {
        const ordinaryEligibleGain = Decimal.min(lot.ordinaryEligibleGain, remaining); remaining = remaining.minus(ordinaryEligibleGain);
        const empowermentEligibleGain = Decimal.min(lot.empowermentEligibleGain, remaining); remaining = remaining.minus(empowermentEligibleGain);
        allocations.set(lot.sourceId, { sourceId: lot.sourceId, ordinaryEligibleGain, empowermentEligibleGain });
      }
    }
    for (const lot of lots) {
      const allocation = allocations.get(lot.sourceId);
      if (!allocation) throw new Error('Section1202 actual source allocation is missing');
      const eligibleGainTakenIntoAccount = allocation.ordinaryEligibleGain.plus(allocation.empowermentEligibleGain);
      const exclusion = allocation.ordinaryEligibleGain.times(lot.rate).plus(allocation.empowermentEligibleGain.times('0.6'));
      const section1202WorksheetComponent = eligibleGainTakenIntoAccount.minus(exclusion);
      const amtPreference = lot.effectiveAcquiredDate <= '2010-09-27' ? exclusion.times('0.07') : d('0');
      lotResults.push({ sourceId: lot.sourceId, issuerId: issuer.issuerId, eligibleGainTakenIntoAccount, exclusion,
        section1202WorksheetComponent, amtPreference, recognizedGainAfterExclusion: lot.recognizedGain.minus(exclusion) });
    }
    audit.record('Section 1202', `issuer:${index + 1}:limit`, 'Issuer eligible gain limit', eligibleGainLimit,
      'Smaller of eligible gain and greater of remaining dollar limit or ten times qualified disposed-stock basis',
      { 'Remaining dollar limit': dollarLimit, 'Ten-times basis limit': basisLimit, 'Eligible gain': availableEligibleGain });
    return { issuerId: issuer.issuerId, dollarLimit, basisLimit, eligibleGainLimit, eligibleGainUsedThisYear: eligibleGainLimit };
  });
  const exclusion = sum(...lotResults.map(lot => lot.exclusion));
  const section1202WorksheetComponent = sum(...lotResults.map(lot => lot.section1202WorksheetComponent));
  const amtPreference = sum(...lotResults.map(lot => lot.amtPreference));
  audit.record('Section 1202', 'exclusion', 'Actual section1202 exclusion', exclusion, 'Sum actual allocated eligible gain times date-specific percentage');
  audit.record('Section 1202', '28-rate', 'Section1202 component of28percent worksheet', section1202WorksheetComponent, 'Eligible gain taken into account less exclusion; zero for100percent cohort');
  audit.record('Section 1202', 'amt', 'Section1202 alternative minimum tax preference', amtPreference, 'Seven percent of excluded gain acquired on or before2010-09-27');
  return { issuers, lots: lotResults, exclusion, section1202WorksheetComponent, amtPreference,
    recognizedGainAfterExclusion: sum(...lotResults.map(lot => lot.recognizedGainAfterExclusion)), lines: audit.getLines() };
}
