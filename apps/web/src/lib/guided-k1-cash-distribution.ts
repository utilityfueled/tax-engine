import { K1CashDistributionSourcesSchema, type K1CashDistributionSources } from '@/models/k1-cash-distribution-sources';
import type { K1CharitableReturnInput } from '@/engine/forms/k1-charitable-return-sources';
import type { GuidedFlowState } from './guided-interview-flow';
import type { QbiSourceEntry } from './guided-qbi-loss-data';

export type K1CashDistributionData = QbiSourceEntry<K1CashDistributionSources>;
/** Normalize supplied source spelling only; no calculated amount or default fact. */
export function normalizeGuidedK1CashDistribution(data: K1CashDistributionData | undefined): K1CashDistributionSources | undefined {
  if (data === undefined) return undefined;
  const source = Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (value === null || value === undefined || value === '') return [key, undefined];
    if (typeof value !== 'string') return [key, value];
    const text = value.trim();
    if (!text) return [key, undefined];
    if (key === 'sourceTaxYear') {
      if (!/^\d{4}$/.test(text)) throw new Error('Enter the actual cash-distribution source year.');
      return [key, Number(text)];
    }
    if (key === 'cashAmount') {
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error('Enter actual nonnegative distribution cash, including zero when known.');
      return [key, text.replaceAll(',', '')];
    }
    return [key, text];
  }));
  return K1CashDistributionSourcesSchema.parse(source);
}
/** Project existing actual status answers for the source binder. This does not
 * manufacture an EIC eligibility packet or require unrelated EIC facts. */
export function k1CashDistributionKnownTreatment(state: GuidedFlowState): Pick<K1CharitableReturnInput, 'standardDeductionFacts' | 'eic'> {
  const personal = state.sectionData['personal-info'], standard = personal?.standardDeductionFacts, claimant = personal?.eicClaimantEligibility;
  const bool = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;
  return {
    standardDeductionFacts: standard === undefined ? undefined : {
      nonresidentAlien: bool(standard.nonresidentAlien), dualStatusAlien: bool(standard.dualStatusAlien), residentJointElection: bool(standard.residentJointElection),
    },
    eic: claimant === undefined ? undefined : { claimantEligibility: {
      sourceTaxYear: /^\d{4}$/.test(claimant.sourceTaxYear?.trim() ?? '') ? Number(claimant.sourceTaxYear?.trim()) : undefined,
      sourceReference: claimant.sourceReference, sourceFactsConfirmed: bool(claimant.sourceFactsConfirmed),
      primaryNonresidentAlienDuringYear: bool(claimant.primaryNonresidentAlienDuringYear),
      spouseNonresidentAlienDuringYear: bool(claimant.spouseNonresidentAlienDuringYear), residentJointElection: bool(claimant.residentJointElection),
    } },
  };
}
