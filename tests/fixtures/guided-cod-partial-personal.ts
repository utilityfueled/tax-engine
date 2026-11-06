import type { CodNolData } from '@/lib/guided-cod-nol';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { emptyOtherTaxesData } from '@/lib/guided-interview-flow';
import { guidedCodOrdinaryAttributesState } from './guided-cod-ordinary-attributes';
import { partialPersonalBasisInput } from './cod-partial-personal';

/** Original-to-guide conversion only. No calculated result supplies a fact. */
export function guidedCodPartialPersonalState() {
  const source = partialPersonalBasisInput(), state = guidedCodOrdinaryAttributesState();
  const editable = (value: unknown): unknown => Array.isArray(value) ? value.map(editable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]))
      : typeof value === 'number' ? String(value) : value;
  const wage = source.w2s[0]!, cod = source.form982NolSources;
  Object.assign(state.sectionData['income-w2']!.entries[0]!, { wages: wage.wages, federalWithheld: wage.federalWithheld,
    socialSecurityWages: wage.socialSecurityWages, socialSecurityWithheld: wage.socialSecurityWithheld,
    medicareWages: wage.medicareWages, medicareWithheld: wage.medicareWithheld });
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, householdEmployees: [] };
  state.sectionData.adjustments!.netOperatingLossSources = editable(source.netOperatingLoss) as NetOperatingLossData;
  state.sectionData.adjustments!.codNolSources = {
    ...editable(cod) as object,
    debts: cod.debts.map(({ sourceId: _id, ...row }) => ({ ...row, sourceTaxYear: String(row.sourceTaxYear) })),
    insolvency: { ...cod.insolvency, liabilities: cod.insolvency!.liabilities!.map(({ dischargedDebtSourceId, ...row }) => ({
      ...row, ...(dischargedDebtSourceId ? { dischargedDebtStatementId: cod.debts.find(debt => debt.sourceId === dischargedDebtSourceId)!.statementId } : {}),
    })) }, attributeSources: editable(source.form982AttributeSources),
  } as CodNolData;
  return state;
}
