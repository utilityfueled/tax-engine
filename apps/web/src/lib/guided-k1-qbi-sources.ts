import { ScheduleK1Schema, type TaxYearInput } from '@/models/inputs';
import { validateK1QbiLossSources, type K1QbiLossSourceInput } from '@/engine/forms/k1-qbi-loss-sources';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule';
import { calculateScheduleE } from '@/engine/schedules/schedule-e';
import { calculateK1OrdinarySelfEmployment } from '@/engine/forms/k1-ordinary-self-employment';
import { calculateK1PassiveDistributionSources } from '@/engine/forms/k1-passive-distribution-sources';
import { calculateQbiEblNol } from '@/engine/forms/qbi-ebl-nol';
import { d } from '@/utils/decimal';
import type { GuidedFlowState } from './guided-interview-flow';
import { parseGuidedQbiLossPacket, qbiSourceValues, type K1LossSourcesData } from './guided-qbi-loss-data';
import { buildGuidedNetOperatingLoss } from './guided-net-operating-loss';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { parseGuidedK1CharitableSources } from './guided-k1-charitable-data';
import { k1CashDistributionKnownTreatment } from './guided-k1-cash-distribution';
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;

/** Only original facts and canonical source-limit calculations, without an income assumption. */
export function buildGuidedK1Sources(data: K1LossSourcesData | undefined, state: GuidedFlowState) {
  if (!data) return undefined;
  const { taxYear, segmentation, sectionData } = state, personal = sectionData['personal-info'];
  if ((taxYear !== 2025 && taxYear !== 2026) || !segmentation.filingStatus || !personal) throw new Error('Confirm the actual household, filing status and year for K-1 histories.');
  const packet = parseGuidedQbiLossPacket(data);
  if (!packet || !Array.isArray(data.activities) || !Array.isArray(packet.activities)) throw new Error('Record every actual K-1, including an explicit empty list when none.');
  const charitable = parseGuidedK1CharitableSources(sectionData.deductions?.k1CharitableSources, packet.activities.length);
  if (charitable?.independentCount) throw new Error('Link every charitable K-1 to its actual qualified-loss activity before combining the complete source packets.');
  const middle = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const taxpayer: K1QbiLossSourceInput['taxpayer'] = { taxYear, filingStatus: statuses[segmentation.filingStatus],
    primary: { firstName: [personal.firstName.trim(), middle].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn },
    ...(segmentation.filingStatus === 'mfj' && personal.spouse ? { spouse: personal.spouse } : {}) };
  const scheduleK1 = packet.activities.map((source, index) => {
    const entered = data.activities?.[index];
    const charitableOriginal = charitable?.originals.get(index);
    const otherFields = ['netShortTermCapitalGain', 'netLongTermCapitalGain', 'interestIncome', 'ordinaryDividends', 'qualifiedDividends'] as const;
    const assignedOtherAmounts = charitableOriginal && otherFields.some(field => !d(charitableOriginal[field]).isZero());
    const assignment = charitable?.packet.statements?.find(row => row.k1SourceId === `scheduleK1:${index}`)?.atRisk?.activityAllocation;
    // The original collector supplies each actual separate amount and confirms
    // unlisted boxes. Preserve the older zero answers; never reinterpret true.
    const zeroConfirmed = charitableOriginal ? assignedOtherAmounts
      ? entered?.allOtherAmountsZeroConfirmed === false && entered.allOtherNonCharitableAmountsZeroConfirmed === false
        && assignment?.sourceFactsConfirmed === true
      : entered?.allOtherNonCharitableAmountsZeroConfirmed === true && entered.allOtherAmountsZeroConfirmed !== true
      : entered?.allOtherAmountsZeroConfirmed === true;
    if (!zeroConfirmed || entered?.domesticNonPtpConfirmed !== true
      || (source.entityType === 's_corporation' && entered.noScorpDebtBasisOrElectionConfirmed !== true)) {
      throw new Error('Confirm actual zero other K-1 boxes and the continuing domestic non-PTP source. S-corporation loan basis and elections require separate actual facts.');
    }
    const statement = source.statement;
    if (!statement || statement.ordinaryIncome === undefined || statement.section199AQBI === undefined
      || statement.section199AW2Wages === undefined || statement.section199AUBIA === undefined
      || typeof statement.isPassiveActivity !== 'boolean' || typeof statement.section199AIsSST !== 'boolean'
      || typeof statement.qbiMateriallyParticipated !== 'boolean' || !source.basis || !source.atRisk) {
      throw new Error('Enter each actual ordinary, 199A, participation, opening-basis and at-risk source field.');
    }
    if (source.entityType === 'partnership' && (statement.selfEmploymentEarnings === undefined
      || statement.selfEmploymentIncomeType === undefined || !source.selfEmploymentTreatment)) {
      throw new Error('Enter original partnership Box 14 and the actual current adjustment and independent prior SE history.');
    }
    // A linked attachment carries the actual original worksheet. The common source
    // validator below reconciles it to the independent QBI/basis/risk history.
    if (charitableOriginal) return charitableOriginal;
    const original = ScheduleK1Schema.parse({ taxYear: source.sourceTaxYear, partnershipName: source.entityName,
      partnershipEIN: source.entityEIN, entityType: source.entityType, accountHolder: source.accountHolder, ...statement,
      selfEmploymentFactsConfirmed: source.selfEmploymentTreatment?.sourceFactsConfirmed,
      beginningBasis: source.basis.beginningBasis, priorSuspendedLosses: { ordinary: source.basis.priorSuspendedLoss },
      // These zeros follow the explicit original-statement and ordinary-only answers above.
      federalIncomeTaxWithheld: '0', foreignSourceIncome: '0', njPassThroughBusinessAlternativeIncomeTaxCredit: '0',
    });
    const basis = calculatePartnerBasisSchedule(original);
    const ordinaryAfterBasis = d(original.ordinaryIncome).lt(0)
      ? (basis.lossCategories.find(row => row.key === 'ordinary')?.allowed ?? d(0)).negated() : d(original.ordinaryIncome);
    original.form6198 = { activityName: original.partnershipName, ordinaryIncome: ordinaryAfterBasis.toFixed(),
      gainLossFromDispositions: '0', otherIncomeGains: '0', otherDeductionsLosses: '0',
      adjustedBasisAtEffectiveDate: source.atRisk.adjustedBasisAtEffectiveDate ?? '', priorYearAmountAtRisk: source.atRisk.priorYearAmountAtRisk ?? '',
      currentYearIncreases: source.atRisk.currentYearIncreases ?? '', currentYearDecreases: source.atRisk.currentYearDecreases ?? '' };
    return original;
  });
  const suspendedPassiveLosses: NonNullable<TaxYearInput['priorYear']>['suspendedPassiveLosses'] = packet.activities.map((source, index) => ({
    partnershipName: scheduleK1[index].partnershipName, amount: source.priorPassiveLoss ?? '',
    qbiLossTracking: qbiSourceValues(data.activities?.[index]?.passiveHistory) as NonNullable<TaxYearInput['priorYear']>['suspendedPassiveLosses'][number]['qbiLossTracking'],
  }));
  const sourceInput = { taxpayer, scheduleK1, qbiLossSources: packet, k1CharitableSources: charitable?.packet, priorYear: { suspendedPassiveLosses }, ...k1CashDistributionKnownTreatment(state) };
  validateK1QbiLossSources(sourceInput);
  const scheduleE = calculateScheduleE({ ...sourceInput, rentalProperties: [], form1099Misc: [] });
  calculateK1OrdinarySelfEmployment(sourceInput, scheduleE);
  // This validated route has actual business capital. It cannot assert the
  // different ordinary-only461 method; supplied classifications still reject.
  const passiveDistribution = calculateK1PassiveDistributionSources(sourceInput, scheduleE);
  if (scheduleK1.length && !passiveDistribution.rows.length) {
    const classification = packet.form461Classification;
    if (!classification || classification.sourceTaxYear !== taxYear || !classification.sourceReference?.trim()
      || classification.sourceFactsConfirmed !== true || classification.method !== 'ordinary_k1_only'
      || classification.allNonEmployeeBusinessSourcesIncluded !== true || classification.capitalIncomeIsNonbusiness !== true
      || classification.otherBusinessIncome === undefined || classification.otherBusinessDeductions === undefined
      || !d(classification.otherBusinessIncome).isZero() || !d(classification.otherBusinessDeductions).isZero()) {
      throw new Error('Confirm the actual ordinary K-1-only business classification and known-zero other business amounts. Current Form461 amounts are calculated from the return.');
    }
  }
  const netOperatingLoss = buildGuidedNetOperatingLoss(sectionData.adjustments?.netOperatingLossSources, taxYear, segmentation.filingStatus,
    personal, sectionData.deductions, data);
  calculateQbiEblNol({ taxpayer, qbiLossSources: packet, netOperatingLoss });
  return { scheduleK1, qbiLossSources: packet, suspendedPassiveLosses };
}
export function k1LossSourceFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    const data = state.sectionData.adjustments?.k1LossSources;
    if (!data && state.segmentation.lifeEvents.includes('k1-loss-sources')) {
      throw new Error('Enter the actual K-1 and qualified loss sources, or remove that setup choice.');
    }
    if (!data && state.sectionData.adjustments?.netOperatingLossSources?.vintages?.some(row => row.originKind === 'excess_business_loss')) {
      throw new Error('Enter the original qualified EBL history linked to each actual regular NOL source.');
    }
    buildGuidedK1Sources(data, state); return {};
  } catch (error) { return { k1LossSources: error instanceof Error ? error.message : 'Reconcile actual K-1 and qualified loss sources.' }; }
}
export function invalidateK1LossSources(data: K1LossSourcesData): K1LossSourcesData {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'sourceFactsConfirmed' ? null : visit(item)]));
    return value;
  };
  return { ...visit(data) as K1LossSourcesData, sourceFactsConfirmed: null };
}
export function updateK1LossSources(previous: K1LossSourcesData, patch: Partial<K1LossSourcesData>): K1LossSourcesData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateK1LossSources(next) : next;
}
