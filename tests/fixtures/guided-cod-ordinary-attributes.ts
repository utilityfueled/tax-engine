import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import type { CodNolData } from '@/lib/guided-cod-nol';
import { startCompleteInterview, completeW2Entry } from '../guided-interview/complete-facts';
import { actualCodBasisCapInput } from './cod-ordinary-attributes';
import { actualGuidedNolSources } from './guided-net-operating-loss';
import { charitableCodGuidedSources } from './charitable-cod-guided-sources';

/** All entries are explicit fictional original facts, never application defaults. */
export function guidedCodOrdinaryAttributesState() {
  const source = actualCodBasisCapInput(), original = source.form982NolSources!;
  const editable = (value: unknown): unknown => Array.isArray(value) ? value.map(editable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]))
      : typeof value === 'number' ? String(value) : value;
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['cancelled-debt'], stateCode: null });
  Object.assign(state.sectionData['personal-info']!, { firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789' });
  const wage = source.w2s[0]!;
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: wage.wages, federalWithheld: wage.federalWithheld,
    socialSecurityWages: wage.socialSecurityWages, socialSecurityWithheld: wage.socialSecurityWithheld,
    medicareWages: wage.medicareWages, medicareWithheld: wage.medicareWithheld }] };
  const prior = structuredClone(actualGuidedNolSources);
  Object.assign(prior, { primaryName: 'Jane Doe', primaryTaxpayerIdLast4: '6789', vintages: [] });
  prior.alternativeTax!.vintages = [];
  const cod = { ...editable(original) as object, debts: original.debts!.map(({ sourceId: _sourceId, ...row }) => ({ ...row, sourceTaxYear: String(row.sourceTaxYear) })),
    insolvency: { ...original.insolvency, liabilities: original.insolvency!.liabilities!.map(({ dischargedDebtSourceId: _id, ...row }) => ({
      ...row, dischargedDebtStatementId: original.debts![0]!.statementId,
    })) }, attributeSources: editable(source.form982AttributeSources),
  } as CodNolData;
  state.sectionData.adjustments = { ...emptyAdjustmentData, netOperatingLossSources: prior, codNolSources: cod };
  state.sectionData.payments = charitableCodGuidedSources().payments;
  return state;
}
