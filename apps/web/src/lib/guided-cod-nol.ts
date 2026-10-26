import Decimal from 'decimal.js';
import { Form982NolSourcesSchema, type Form982NolSources } from '@/models/cod-nol-sources';
import { calculateCodNolReduction, type CodNolSourceInput } from '@/engine/forms/cod-nol-reductions';
import type { GuidedFlowState } from './guided-interview-flow';
import { buildGuidedNetOperatingLoss } from './guided-net-operating-loss';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

type Editable<T> = { [K in keyof T]: T[K] extends boolean | undefined ? boolean | null | undefined
  : T[K] extends number | undefined ? string | undefined : T[K] };
type OriginalDebt = NonNullable<Form982NolSources['debts']>[number];
type OriginalInsolvency = NonNullable<Form982NolSources['insolvency']>;
export type CodDebtData = Editable<Omit<OriginalDebt, 'sourceId'>>;
export type CodInsolvencyItemData = Omit<NonNullable<OriginalInsolvency['assets']>[number], 'dischargedDebtSourceId'> & {
  dischargedDebtStatementId?: string;
};
export type CodInsolvencyData = Editable<Omit<OriginalInsolvency, 'assets' | 'liabilities'>> & {
  assets?: CodInsolvencyItemData[]; liabilities?: CodInsolvencyItemData[];
};
export type CodNolData = Editable<Omit<Form982NolSources, 'debts' | 'insolvency'>> & {
  debts?: CodDebtData[]; insolvency?: CodInsolvencyData;
};
const statuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
function amount(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}, including zero when shown by the source.`);
  const actual = parseGuidedCurrency(value);
  if (!actual.isFinite() || actual.isNegative()) throw new Error(`Enter the actual nonnegative ${label}.`);
  return actual.toFixed();
}
function year(value: string | undefined): number {
  if (!value || !/^\d{4}$/.test(value)) throw new Error('Enter the actual source tax year.');
  return Number(value);
}
function boolean(value: boolean | null | undefined): boolean | undefined { return value ?? undefined; }

/** Source-only validation; the canonical return calculates every loss and carry amount. */
export function buildGuidedCodNol(data: CodNolData | undefined, state: GuidedFlowState) {
  if (!data) return undefined;
  const { taxYear, segmentation, sectionData } = state, personal = sectionData['personal-info'];
  if ((taxYear !== 2025 && taxYear !== 2026) || !segmentation.filingStatus || !personal) {
    throw new Error('Confirm the actual year, filing status and household before entering cancellation sources.');
  }
  const prior = buildGuidedNetOperatingLoss(sectionData.adjustments?.netOperatingLossSources, taxYear, segmentation.filingStatus, personal, sectionData.deductions, sectionData.adjustments?.k1LossSources);
  if (!prior) throw new Error('Enter the actual independent regular and AMT loss carry histories, including explicit empty histories when none.');
  if (data.title11Case !== false || data.electBasisReductionFirst !== false || data.otherExclusionsOrExceptionsApply !== false) {
    throw new Error('Confirm the actual bankruptcy, basis-first election and other exclusion answers. Positive or unknown answers require their separate debt method.');
  }
  if (!data.debts?.length || !data.insolvency) throw new Error('Enter all actual original debt statements and the complete insolvency worksheet.');
  const identities = new Map<string, string>();
  const debts = data.debts.map((debt, index) => {
    const id = debt.statementId?.trim();
    if (!id) throw new Error('Enter the actual original statement identity.');
    if (identities.has(id)) throw new Error('Duplicate original debt statement identity.');
    const sourceId = `form1099C:${index}`; identities.set(id, sourceId);
    return { ...debt, sourceId, statementId: id, sourceTaxYear: year(debt.sourceTaxYear),
      amountDischarged: amount(debt.amountDischarged, 'Box 2 canceled debt'), interestIncluded: amount(debt.interestIncluded, 'Box 3 interest'),
      fmvOfProperty: amount(debt.fmvOfProperty, 'Box 7 property value'), personallyLiable: boolean(debt.personallyLiable),
      unsecuredPersonalDebtConfirmed: boolean(debt.unsecuredPersonalDebtConfirmed), noPropertyTransferConfirmed: boolean(debt.noPropertyTransferConfirmed),
      sourceFactsConfirmed: boolean(debt.sourceFactsConfirmed) };
  });
  const items = (rows: CodInsolvencyItemData[] | undefined, kind: 'assets' | 'liabilities') => {
    if (!Array.isArray(rows)) throw new Error(`Enter the complete actual ${kind} list, or explicitly record none.`);
    return rows.map(({ dischargedDebtStatementId, ...row }) => {
      const sourceId = dischargedDebtStatementId === undefined ? undefined : identities.get(dischargedDebtStatementId.trim());
      if (dischargedDebtStatementId !== undefined && (!sourceId || kind === 'assets')) throw new Error('Reconcile the actual discharged statement linked to each liability.');
      return { ...row, amount: amount(row.amount, `${kind} amount`), ...(sourceId ? { dischargedDebtSourceId: sourceId } : {}) };
    });
  };
  const assets = items(data.insolvency.assets, 'assets'), liabilities = items(data.insolvency.liabilities, 'liabilities');
  const facts = Form982NolSourcesSchema.parse({ ...data, sourceTaxYear: year(data.sourceTaxYear),
    sourceFactsConfirmed: boolean(data.sourceFactsConfirmed), allDischargesIncluded: boolean(data.allDischargesIncluded),
    communityPropertyApplies: boolean(data.communityPropertyApplies), regularAndAlternativeExclusionSameConfirmed: boolean(data.regularAndAlternativeExclusionSameConfirmed),
    debts, insolvency: { ...data.insolvency, sourceFactsConfirmed: boolean(data.insolvency.sourceFactsConfirmed),
      immediatelyBeforeDischargeConfirmed: boolean(data.insolvency.immediatelyBeforeDischargeConfirmed), allAssetsIncluded: boolean(data.insolvency.allAssetsIncluded),
      exemptAndRetirementAssetsIncluded: boolean(data.insolvency.exemptAndRetirementAssetsIncluded), allLiabilitiesIncluded: boolean(data.insolvency.allLiabilitiesIncluded), assets, liabilities } });
  const form1099C = debts.map(debt => {
    if (debt.personallyLiable === undefined || !debt.creditor?.trim()) throw new Error('Enter the actual creditor and Box 5 personal-liability answer.');
    return { creditor: debt.creditor.trim(), amountDischarged: debt.amountDischarged, interestIncluded: debt.interestIncluded,
      fmvOfProperty: debt.fmvOfProperty, debtDescription: debt.debtDescription, personallyLiable: debt.personallyLiable, identifiableEventCode: debt.identifiableEventCode };
  });
  const sum = (rows: typeof assets) => rows.reduce((total, row) => total.plus(row.amount), new Decimal(0)).toFixed();
  const codExclusion = { bankruptcy: data.title11Case, electBasisReductionFirst: data.electBasisReductionFirst,
    qualifiedFarmExclusion: '0', qualifiedRealPropertyBusinessExclusion: '0', insolvency: { totalAssets: sum(assets), totalLiabilities: sum(liabilities) } };
  const middleInitial = personal.middleName?.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const input: CodNolSourceInput = { taxpayer: { taxYear, filingStatus: statuses[segmentation.filingStatus], primary: {
    firstName: `${personal.firstName.trim()}${middleInitial ? ` ${middleInitial}` : ''}`, lastName: personal.lastName, ssn: personal.ssn,
  } }, netOperatingLoss: prior, form1099C, codExclusion, form982NolSources: facts };
  calculateCodNolReduction(input);
  return { form1099C, codExclusion, form982NolSources: facts };
}
export function codNolFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    const data = state.sectionData.adjustments?.codNolSources;
    if (!data && state.segmentation.lifeEvents.includes('cancelled-debt')) throw new Error('Enter the actual canceled-debt and insolvency records, or remove that event if it does not apply.');
    buildGuidedCodNol(data, state); return {};
  } catch (error) { return { codNolSources: error instanceof Error ? error.message : 'Reconcile the actual canceled-debt sources.' }; }
}
export function invalidateGuidedCodNol(data: CodNolData): CodNolData {
  return { ...data, sourceFactsConfirmed: null, ...(data.debts ? { debts: data.debts.map(row => ({ ...row, sourceFactsConfirmed: null })) } : {}),
    ...(data.insolvency ? { insolvency: { ...data.insolvency, sourceFactsConfirmed: null } } : {}) };
}
export function updateGuidedCodNol(previous: CodNolData, patch: Partial<CodNolData>): CodNolData {
  const next = { ...previous, ...patch };
  return guidedSourceValuesChanged(previous, next) ? invalidateGuidedCodNol(next) : next;
}
