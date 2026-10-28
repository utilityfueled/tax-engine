import { calculateK1CharitableReturnSources, type K1CharitableReturnInput } from '@/engine/forms/k1-charitable-return-sources';
import type { GuidedFlowState } from './guided-interview-flow';
import { buildGuidedK1Sources } from './guided-k1-qbi-sources';
import { parseGuidedK1CharitableSources, type K1CharitableSourcesData } from './guided-k1-charitable-data';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { buildGuidedCharitableCarryover } from './guided-charitable-carryover';
import { k1CashDistributionKnownTreatment } from './guided-k1-cash-distribution';
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;

export function buildGuidedK1CharitableSources(state: GuidedFlowState) {
  const data = state.sectionData.deductions?.k1CharitableSources;
  const existing = buildGuidedK1Sources(state.sectionData.adjustments?.k1LossSources, state);
  if (!data) return existing ? { ...existing, k1CharitableSources: undefined } : undefined;
  const parsed = parseGuidedK1CharitableSources(data, existing?.scheduleK1.length ?? 0);
  if (!parsed) return undefined;
  const { taxYear, segmentation, sectionData } = state, personal = sectionData['personal-info'];
  if ((taxYear !== 2025 && taxYear !== 2026) || !segmentation.filingStatus || !personal) throw new Error('Confirm the actual household, filing status and year for K-1 charitable sources.');
  if (existing && parsed.independentCount) throw new Error('Add and link every actual K-1 activity in the separate qualified-loss sources before combining these charitable statements.');
  const scheduleK1 = [...(existing?.scheduleK1 ?? [])];
  for (const [index, original] of parsed.originals) scheduleK1[index] = original;
  const seen = new Set<string>();
  for (const original of scheduleK1) {
    const key = `${original.taxYear}:${original.accountHolder}:${original.partnershipEIN.replaceAll('-', '')}`;
    if (seen.has(key)) throw new Error('Duplicate original K-1 entity, year and owner requires its separate activity source method.');
    seen.add(key);
  }
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const taxpayer: K1CharitableReturnInput['taxpayer'] = { taxYear, filingStatus: statuses[segmentation.filingStatus],
    primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
    ...(segmentation.filingStatus === 'mfj' && personal.spouse ? { spouse: personal.spouse } : {}) };
  const hasFirstAdmission = parsed.packet.statements?.some(statement => statement.basis?.priorBasisSuspensions?.some(row => row.section170AdmissionSources !== undefined));
  const alternativeHistory = sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources;
  const admissionHistories: Pick<K1CharitableReturnInput, 'charitableCarryoverSources' | 'netOperatingLoss'> = hasFirstAdmission ? {
    charitableCarryoverSources: buildGuidedCharitableCarryover(sectionData.deductions?.charitableCarryoverSources, taxYear, segmentation.filingStatus, personal),
    ...(alternativeHistory ? { netOperatingLoss: { alternativeTax: { charitableCarryoverHistory: {
      alternativeCarryoverSources: buildGuidedCharitableCarryover(alternativeHistory, taxYear, segmentation.filingStatus, personal),
    } } } } : {}),
  } : {};
  calculateK1CharitableReturnSources({ taxpayer, scheduleK1, k1CharitableSources: parsed.packet,
    deductionElection: sectionData.deductions?.method, qbiLossSources: existing?.qbiLossSources, ...admissionHistories, ...k1CashDistributionKnownTreatment(state) });
  return { scheduleK1, k1CharitableSources: parsed.packet, qbiLossSources: existing?.qbiLossSources,
    suspendedPassiveLosses: existing?.suspendedPassiveLosses ?? [], priorQbiCarry: existing?.priorQbiCarry };
}
export function k1CharitableSourceFactErrors(state: GuidedFlowState): Record<string, string> {
  if (!state.sectionData.deductions?.k1CharitableSources) return {};
  try { buildGuidedK1CharitableSources(state); return {}; }
  catch (error) { return { k1CharitableSources: error instanceof Error ? error.message : 'Reconcile the actual K-1 charitable sources.' }; }
}
export function invalidateK1CharitableSources(data: K1CharitableSourcesData): K1CharitableSourcesData {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'sourceFactsConfirmed' ? null : visit(item)]));
    return value;
  };
  return { ...visit(data) as K1CharitableSourcesData, sourceFactsConfirmed: null };
}
export function updateK1CharitableSources(previous: K1CharitableSourcesData, patch: Partial<K1CharitableSourcesData>): K1CharitableSourcesData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateK1CharitableSources(next) : next;
}
