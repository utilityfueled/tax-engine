import { Form172OriginSourcesSchema, type TaxYearInput } from '@/models/inputs';
import type { GuidedFlowState } from './guided-interview-flow';
import { hasBusinessSourceData } from './guided-business-facts';
import { buildGuidedNetOperatingLoss } from './guided-net-operating-loss';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { buildGuidedCodNol } from './guided-cod-nol';
import { buildCurrentCapitalSources, invalidateCurrentCapitalSources, type CurrentCapitalSourceData } from './guided-current-capital-origin';

export interface CurrentLossBusinessData {
  sourceId?: string; accountHolder?: '' | 'primary' | 'spouse'; businessName?: string;
  sourceReference?: string; sourceFactsConfirmed?: boolean | null;
  materiallyParticipated?: boolean | null; allInvestmentAtRisk?: boolean | null; financialTradingBusiness?: boolean | null;
}
export interface CurrentLossAlternativeData {
  sourceReference?: string; sourceFactsConfirmed?: boolean | null; currentYearAdjustmentsCompleteConfirmed?: boolean | null;
  regularBasisAndLossLimitsSameAsAlternativeConfirmed?: boolean | null; regularDepreciationSameAsAlternativeConfirmed?: boolean | null;
}
export interface CurrentLossOriginData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: boolean | null; allCurrentYearSourcesIncluded?: boolean | null;
  farmingLossIncluded?: boolean | null; cancelledDebtIncluded?: boolean | null; estateOrTrustLossIncluded?: boolean | null;
  businessSources?: CurrentLossBusinessData[]; alternativeTax?: CurrentLossAlternativeData;
  capitalSources?: CurrentCapitalSourceData;
}

/** Only actual source facts. Canonical Form172 calculates all amounts and source-method limits. */
export function buildCurrentLossOrigin(data: CurrentLossOriginData | undefined, state: GuidedFlowState): TaxYearInput['form172'] {
  if (!data) return undefined;
  const { taxYear, segmentation, sectionData } = state;
  if ((taxYear !== 2025 && taxYear !== 2026) || data.sourceTaxYear !== String(taxYear)
    || !segmentation.filingStatus || !data.sourceReference?.trim() || data.sourceFactsConfirmed !== true
    || data.allCurrentYearSourcesIncluded !== true) throw new Error('Confirm the actual current loss source year, reference and complete current records.');
  const prior = buildGuidedNetOperatingLoss(sectionData.adjustments?.netOperatingLossSources, taxYear, segmentation.filingStatus, sectionData['personal-info'], sectionData.deductions, sectionData.adjustments?.k1LossSources);
  if (!prior) throw new Error('Enter the complete actual prior regular and independent AMT carry histories, including explicit empty lists when none.');
  if (data.farmingLossIncluded !== false || data.estateOrTrustLossIncluded !== false) {
    throw new Error('Confirm the actual farming and estate facts. Those positive origin methods require separate source calculations.');
  }
  const cod = buildGuidedCodNol(sectionData.adjustments?.codNolSources, state);
  if (data.cancelledDebtIncluded !== Boolean(cod)) {
    throw new Error('The current canceled-debt classification must match the actual validated cancellation and insolvency source packet.');
  }
  const se = sectionData['income-self-employment'];
  const hasBusiness = hasBusinessSourceData(se);
  if (!Array.isArray(data.businessSources) || data.businessSources.length !== (hasBusiness ? 1 : 0)) {
    throw new Error('The complete current business source list must match the actual entered activity, including an explicit empty list when none.');
  }
  const businessSources = data.businessSources.map(source => {
    const business = se?.businessFacts;
    if (source.sourceId !== 'scheduleC' || !source.businessName?.trim() || source.businessName.trim() !== business?.businessName?.trim()
      || !source.accountHolder || source.accountHolder !== business?.accountHolder
      || (source.accountHolder === 'spouse' && (segmentation.filingStatus !== 'mfj' || !sectionData['personal-info']?.spouse))
      || !source.sourceReference?.trim() || source.sourceFactsConfirmed !== true) {
      throw new Error('Bind the actual current Schedule C identity, owner and activity reference; separate or mismatched businesses cannot be combined.');
    }
    if (source.materiallyParticipated !== true || se?.qbiMateriallyParticipated !== true
      || source.allInvestmentAtRisk !== true || business?.allInvestmentAtRisk !== true || source.financialTradingBusiness !== false) {
      throw new Error('The current origin method requires actual active participation, all-at-risk and nontrading business facts. Other methods remain separate.');
    }
    return { ...source, accountHolder: source.accountHolder, businessName: source.businessName.trim(), sourceReference: source.sourceReference.trim(),
      sourceFactsConfirmed: true, materiallyParticipated: true, allInvestmentAtRisk: true, financialTradingBusiness: false };
  });
  const alternative = data.alternativeTax;
  if (!alternative?.sourceReference?.trim() || alternative.sourceFactsConfirmed !== true
    || alternative.currentYearAdjustmentsCompleteConfirmed !== true || alternative.regularBasisAndLossLimitsSameAsAlternativeConfirmed !== true
    || alternative.regularDepreciationSameAsAlternativeConfirmed !== true) {
    throw new Error('Enter and confirm the independent current AMT basis, depreciation, adjustments and loss-limit comparison. Known differences need their separate source method.');
  }
  return Form172OriginSourcesSchema.parse({ sourceTaxYear: taxYear, sourceReference: data.sourceReference.trim(),
    sourceFactsConfirmed: data.sourceFactsConfirmed, allCurrentYearSourcesIncluded: data.allCurrentYearSourcesIncluded,
    farmingLossIncluded: data.farmingLossIncluded, cancelledDebtIncluded: data.cancelledDebtIncluded, estateOrTrustLossIncluded: data.estateOrTrustLossIncluded,
    businessSources, alternativeTax: { ...alternative, sourceReference: alternative.sourceReference.trim() },
    capitalSources: buildCurrentCapitalSources(data.capitalSources, state).capitalSources,
  });
}
export function currentLossOriginFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    const data = state.sectionData.adjustments?.currentLossOrigin;
    if (!data && state.segmentation.lifeEvents.includes('current-year-loss')) throw new Error('Enter the actual current loss origin sources, or remove the current-year loss event if it does not apply.');
    buildCurrentLossOrigin(data, state); return {};
  } catch (error) { return { currentLossOrigin: error instanceof Error ? error.message : 'Reconcile the actual current-year loss sources.' }; }
}
export function invalidateCurrentLossOrigin(data: CurrentLossOriginData): CurrentLossOriginData {
  return { ...data, sourceFactsConfirmed: null,
    ...(data.capitalSources ? { capitalSources: invalidateCurrentCapitalSources(data.capitalSources) } : {}),
    ...(data.businessSources ? { businessSources: data.businessSources.map(source => ({ ...source, sourceFactsConfirmed: null })) } : {}),
    ...(data.alternativeTax ? { alternativeTax: { ...data.alternativeTax, sourceFactsConfirmed: null } } : {}) };
}
export function updateCurrentLossOrigin(previous: CurrentLossOriginData, patch: Partial<CurrentLossOriginData>): CurrentLossOriginData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateCurrentLossOrigin(next) : next;
}
