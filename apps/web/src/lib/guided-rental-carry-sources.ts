import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs';
import type { FilingStatus, PersonalInfoData, RentalPropertyEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

export interface RentalLossVintageData {
  taxYear?: string; originalLoss?: string; qualifiedOriginalLoss?: string; remainingLoss?: string; qualifiedRemainingLoss?: string;
  activelyParticipatedInLossYear?: boolean | null; materiallyParticipatedInCurrentYear?: boolean | null;
}
export interface RentalCarryoverData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  propertyDescription?: string; ownerName?: string; ownerTaxpayerIdLast4?: string; priorFilingStatus?: FilingStatus | '';
  sameTaxpayersConfirmed?: boolean | null; ownershipUnchangedConfirmed?: boolean | null; activityContinuesConfirmed?: boolean | null;
  ordinaryRentalLossesOnly?: boolean | null; ownerAmountsConfirmed?: boolean | null; allPriorLossesIncluded?: boolean | null;
  amtSourceReference?: string; amtBasisAndDepreciationMatch?: boolean | null; amtPriorLossMatches?: boolean | null; amtAllowedLossMatches?: boolean | null;
  vintages?: RentalLossVintageData[];
}
const normalized = (value?: string) => value?.trim().replace(/\s+/g, ' ').toLowerCase();
function filed(value: string | undefined, label: string): Decimal {
  if (!value?.trim()) throw new Error(`Enter the actual filed ${label}, including zero when the source establishes it.`);
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.isNegative() || !amount.isInteger()) throw new Error(`${label} must be an actual nonnegative filed whole-dollar amount; do not round an unverified source.`);
  return amount;
}
function year(value?: string) {
  if (!value || !/^\d{4}$/.test(value)) throw new Error('Enter the actual rental loss source year.');
  return Number(value);
}

export function buildGuidedRentalCarryovers(entries: RentalPropertyEntryData[] | undefined, taxYear?: number | null,
  filingStatus?: FilingStatus | null, personal?: PersonalInfoData): NonNullable<TaxYearInput['priorYear']>['suspendedPassiveLosses'] {
  return (entries ?? []).flatMap(entry => {
    const data = entry.priorLossSources;
    if (!data && !entry.priorYearUnallowedLoss?.trim()) return [];
    const priorLoss = filed(entry.priorYearUnallowedLoss, 'owner prior unallowed rental loss');
    if (!data && priorLoss.isZero()) return [];
    if (!data) throw new Error('Enter the actual filed rental loss and QBI history before using a prior suspended loss.');
    if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal || year(data.sourceTaxYear) !== taxYear - 1) throw new Error('Match the rental carry packet to the actual immediately prior return year and current household.');
    if (!data.sourceReference?.trim() || data.sourceFactsConfirmed !== true) throw new Error('Review the original rental carry packet after the latest source edits.');
    if (!entry.description?.trim() || data.propertyDescription?.trim() !== entry.description.trim()) throw new Error('Match the original carry activity exactly to this actual property address or legal description.');
    if (entry.accountHolder !== 'primary' && entry.accountHolder !== 'spouse') throw new Error('Identify the actual individual rental owner; joint allocations need their separate source method.');
    if (entry.accountHolder === 'spouse' && filingStatus !== 'mfj') throw new Error('The spouse rental carry requires the actual joint return.');
    const owner = entry.accountHolder === 'spouse' ? personal.spouse : personal;
    const middle = entry.accountHolder === 'primary' ? personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() : undefined;
    const name = owner ? [owner.firstName?.trim(), middle, owner.lastName?.trim()].filter(Boolean).join(' ') : '';
    const taxpayerId = owner?.ssn?.replace(/-/g, '');
    if (!name || !taxpayerId || !/^\d{9}$/.test(taxpayerId) || normalized(data.ownerName) !== normalized(name)
      || !/^\d{4}$/.test(data.ownerTaxpayerIdLast4 ?? '') || data.ownerTaxpayerIdLast4 !== taxpayerId.slice(-4)) throw new Error('Match the original rental owner name and taxpayer ID last four to the actual household.');
    if (data.priorFilingStatus !== filingStatus || data.sameTaxpayersConfirmed !== true || data.ownershipUnchangedConfirmed !== true
      || data.activityContinuesConfirmed !== true || data.ordinaryRentalLossesOnly !== true) throw new Error('Changed household, ownership, grouping, disposition or special rental losses need their separate historical allocation method.');
    if (data.ownerAmountsConfirmed !== true || data.allPriorLossesIncluded !== true) throw new Error('Confirm all filed prior losses for this owner; these amounts are already the owner share, not full-property amounts.');
    if (entry.allInvestmentAtRisk !== true) throw new Error('Prior rental losses need actual at-risk qualification or a separate Form 6198 source method.');
    if (typeof entry.isActiveParticipant !== 'boolean' || typeof entry.qualifiesForQBI !== 'boolean') throw new Error('Answer current participation and QBI qualification from the actual activity records.');
    if (!data.amtSourceReference?.trim() || data.amtBasisAndDepreciationMatch !== true || data.amtPriorLossMatches !== true || data.amtAllowedLossMatches !== true) throw new Error('Complete the separate AMT source comparison. Unknown or differing basis, depreciation, prior loss or current allowed loss needs its actual AMT passive worksheet method.');
    if (!Array.isArray(data.vintages)) throw new Error('Enter the actual loss vintages, including an explicit empty list only when no prior loss exists.');
    const years = new Set<number>();
    const vintages = data.vintages.map(row => {
      const taxYearOfLoss = year(row.taxYear);
      if (taxYearOfLoss >= taxYear || years.has(taxYearOfLoss)) throw new Error('Each prior rental loss year must be earlier than the current return and appear once.');
      years.add(taxYearOfLoss);
      const original = filed(row.originalLoss, 'original suspended loss'), originalQualified = filed(row.qualifiedOriginalLoss, 'original qualified suspended loss');
      const remaining = filed(row.remainingLoss, 'remaining suspended loss'), remainingQualified = filed(row.qualifiedRemainingLoss, 'remaining qualified suspended loss');
      if (originalQualified.gt(original) || remaining.gt(original) || remainingQualified.gt(remaining) || remainingQualified.gt(originalQualified)
        || remaining.minus(remainingQualified).gt(original.minus(originalQualified))) throw new Error('Reconcile original and remaining qualified/nonqualified rental loss balances.');
      if (taxYearOfLoss < 2018 && (!originalQualified.isZero() || !remainingQualified.isZero())) throw new Error('Pre-2018 rental losses cannot have a qualified QBI portion.');
      if (remaining.gt(0) && (typeof row.activelyParticipatedInLossYear !== 'boolean'
        || (entry.isActiveParticipant && !row.activelyParticipatedInLossYear))) throw new Error('The active-rental allowance requires actual active participation in both the loss year and current year. Mixed prior participation needs a separate grouping method.');
      if (taxYear === 2026 && remainingQualified.gt(0) && typeof row.materiallyParticipatedInCurrentYear !== 'boolean') throw new Error('Answer actual current material participation for each qualified prior rental loss.');
      return { taxYear: taxYearOfLoss, originalLoss: original.toFixed(0), qualifiedOriginalLoss: originalQualified.toFixed(0),
        remainingLoss: remaining.toFixed(0), qualifiedRemainingLoss: remainingQualified.toFixed(0), materiallyParticipatedInCurrentYear: row.materiallyParticipatedInCurrentYear ?? undefined };
    });
    if (!vintages.reduce((total, row) => total.plus(row.remainingLoss), new Decimal(0)).eq(priorLoss)) throw new Error('Actual vintage remaining balances must equal the filed owner prior rental loss.');
    return [{ partnershipName: entry.description.trim(), amount: priorLoss.toFixed(0), qbiLossTracking: {
      sourceTaxYear: year(data.sourceTaxYear), sourceReference: data.sourceReference.trim(), sourceFactsConfirmed: true, vintages,
    } }];
  });
}
export function rentalCarrySourceErrors(entries: RentalPropertyEntryData[] | undefined, taxYear?: number | null,
  filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  try { buildGuidedRentalCarryovers(entries, taxYear, filingStatus, personal); return {}; }
  catch (error) { return { rentalCarry: error instanceof Error ? error.message : 'Reconcile actual rental carry sources.' }; }
}
export function updateRentalCarrySources(previous: RentalCarryoverData, patch: Partial<RentalCarryoverData>): RentalCarryoverData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
