import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';

type PriorCapitalLoss = Pick<NonNullable<TaxYearInput['priorYear']>,
  'shortTermCapitalLoss' | 'longTermCapitalLoss' | 'capitalLossSources'>;

/** Validate the worksheet amounts before they're used by Schedule D lines 6 and 14. */
export function assertCapitalLossCarryoverSources(
  input: PriorCapitalLoss | undefined,
  { taxYear, jointReturn, requireSources = false }: { taxYear: number; jointReturn: boolean; requireSources?: boolean },
): void {
  const sources = input?.capitalLossSources;
  if (!sources && !requireSources) return;
  const shortTerm = d(input?.shortTermCapitalLoss);
  const longTerm = d(input?.longTermCapitalLoss);
  if (!sources?.length) {
    if (shortTerm.isZero() && longTerm.isZero()) return;
    throw new Error('Enter the actual prior capital loss worksheets and owners for the amounts carried over.');
  }

  const references = new Set<string>();
  const owners = new Set<string>();
  let sourceShortTerm = new Decimal(0);
  let sourceLongTerm = new Decimal(0);
  for (const source of sources) {
    const reference = source.sourceReference.trim().toLowerCase();
    if (source.sourceTaxYear !== taxYear - 1 || !reference || source.sourceFactsConfirmed !== true) {
      throw new Error('The prior capital loss worksheet must be confirmed from the immediately preceding tax year.');
    }
    if (references.has(reference) || owners.has(source.owner)) {
      throw new Error('Enter each prior capital loss worksheet and owner once.');
    }
    references.add(reference);
    owners.add(source.owner);
    if ((!jointReturn && source.owner !== 'primary') || (source.owner === 'joint'
      && (source.priorReturnType !== 'joint' || source.sameJointFilersConfirmed !== true || sources.length !== 1))) {
      throw new Error('Prior capital loss must belong to the current taxpayer or joint filing unit. Use only the owner’s share from a prior joint return when filing separately.');
    }
    const short = d(source.shortTermCapitalLoss);
    const long = d(source.longTermCapitalLoss);
    if (!short.isFinite() || !long.isFinite() || short.gt(0) || long.gt(0)) {
      throw new Error('Enter actual prior capital loss worksheet amounts as zero or negative values.');
    }
    sourceShortTerm = sourceShortTerm.plus(short);
    sourceLongTerm = sourceLongTerm.plus(long);
  }
  if (!sourceShortTerm.eq(shortTerm) || !sourceLongTerm.eq(longTerm)) {
    throw new Error('The prior capital loss worksheets must reconcile to both short-term and long-term carryover amounts.');
  }
}
