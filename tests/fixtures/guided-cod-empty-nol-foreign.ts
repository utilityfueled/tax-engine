import { emptyOtherTaxesData } from '@/lib/guided-interview-flow';
import type { CodNolData } from '@/lib/guided-cod-nol';
import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { completeInterestEntry } from '../guided-interview/complete-facts';
import { guidedCodOrdinaryAttributesState } from './guided-cod-ordinary-attributes';
import { codEmptyNolForeignInput } from './cod-empty-nol-foreign';

/** Explicit synthetic originals; no tax outputs are used to fill the guide. */
export function guidedCodEmptyNolForeignState(method: 'ordinary' | 'deduction' = 'deduction') {
  const source = codEmptyNolForeignInput(method), state = guidedCodOrdinaryAttributesState();
  const editable = (value: unknown): unknown => Array.isArray(value) ? value.map(editable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]))
      : typeof value === 'number' ? String(value) : value;
  const wage = source.w2s[0]!, annual = source.foreignTaxElection!, cod = source.form982NolSources!;
  Object.assign(state.sectionData['income-w2']!.entries[0]!, { wages: wage.wages, federalWithheld: wage.federalWithheld,
    socialSecurityWages: wage.socialSecurityWages, socialSecurityWithheld: wage.socialSecurityWithheld,
    medicareWages: wage.medicareWages, medicareWithheld: wage.medicareWithheld });
  state.sectionData['income-investments'] = { interestEntries: source.form1099Int.map(row => ({ ...completeInterestEntry, ...row })), dividendEntries: [], brokerageEntries: [] };
  state.segmentation.incomeTypes = ['w2-wages', 'investments'];
  state.sectionData['other-taxes'] = { ...emptyOtherTaxesData, householdEmployees: [], foreignTaxElection: editable(annual) as ForeignTaxElectionData };
  state.sectionData.adjustments!.netOperatingLossSources = editable(source.netOperatingLoss) as NetOperatingLossData;
  state.sectionData.adjustments!.codNolSources = {
    ...editable(cod) as object,
    debts: cod.debts!.map(({ sourceId: _id, ...row }) => ({ ...row, sourceTaxYear: String(row.sourceTaxYear) })),
    insolvency: { ...cod.insolvency, liabilities: cod.insolvency!.liabilities!.map(({ dischargedDebtSourceId: _id, ...row }) => ({
      ...row, dischargedDebtStatementId: cod.debts![0]!.statementId,
    })) }, attributeSources: editable(source.form982AttributeSources),
  } as CodNolData;
  return state;
}
