import { emptyMinimumTaxCredit, type MinimumTaxCreditData } from '@/lib/guided-minimum-tax-credit';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import type { CodNolData } from '@/lib/guided-cod-nol';
import { guidedCodOrdinaryAttributesState } from './guided-cod-ordinary-attributes';
import { actualCurrentMtcInput } from './current-minimum-tax-credit';

/** All zeros and false answers below are explicit fictional source facts. */
export function guidedCurrentMtcState(reversal = false) {
  const source = actualCurrentMtcInput({ reversal, priorAvailable: reversal ? '70000' : '0', splitPrior: reversal });
  const state = guidedCodOrdinaryAttributesState();
  const editable = (value: unknown): unknown => Array.isArray(value) ? value.map(editable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, editable(child)]))
      : typeof value === 'number' ? String(value) : value;
  const original = source.form982NolSources!;
  state.sectionData['income-w2']!.entries[0]!.wages = source.w2s[0]!.wages;
  state.sectionData['income-w2']!.entries[0]!.federalWithheld = source.w2s[0]!.federalWithheld;
  state.sectionData.deductions!.method = 'standard';
  const prior = state.sectionData.adjustments!.netOperatingLossSources!;
  prior.alternativeTax!.regularBasisAndLossLimitsSameAsAlternativeConfirmed = false;
  state.sectionData.adjustments!.codNolSources = {
    ...editable(original) as object,
    debts: original.debts!.map(({ sourceId: _sourceId, ...row }) => ({ ...row, sourceTaxYear: String(row.sourceTaxYear) })),
    insolvency: { ...original.insolvency, liabilities: original.insolvency!.liabilities!.map(({ dischargedDebtSourceId: _id, ...row }) => ({
      ...row, dischargedDebtStatementId: original.debts![0]!.statementId,
    })) }, attributeSources: editable(source.form982AttributeSources),
  } as CodNolData;
  const statement = state.sectionData.adjustments.codNolSources.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!;
  Object.assign(statement, { standaloneOriginal: { sourceReference: 'Fictional complete original K1 with all other boxes zero',
    entityType: 'partnership', allOtherAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true, isPassiveActivity: false } });
  if (source.form8801) {
    state.sectionData.credits = structuredClone(emptyCreditsData);
    state.sectionData.credits!.minimumTaxCredit = { ...structuredClone(emptyMinimumTaxCredit),
      ...editable(source.form8801) as Partial<MinimumTaxCreditData>, sourceTaxYear: '2025', priorYear: '2024',
      sourceReference: 'Fictional actual2024 Form8801 and original worksheets', sourceFactsConfirmed: true,
      allSourcesIncluded: true, sameTaxpayersAsPriorYear: true, primaryName: 'Jane Doe', primaryTaxIdLast4: '6789',
      priorYearFilingStatus: 'single',
    };
  }
  return state;
}
