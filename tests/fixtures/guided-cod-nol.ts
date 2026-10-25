import type { CodNolData } from '@/lib/guided-cod-nol';
import { actualCodNolInput } from './cod-nol';

/** Complete fictional records for tests; application controls start unknown. */
export function actualGuidedCodNol(amount = '40000'): CodNolData {
  const source = actualCodNolInput(amount.replace(/,/g, '')).form982NolSources;
  if (!source?.debts || !source.insolvency) throw new Error('Missing synthetic original sources');
  return { ...source, sourceTaxYear: String(source.sourceTaxYear),
    debts: source.debts.map(({ sourceId: _sourceId, ...row }) => ({ ...row, sourceTaxYear: String(row.sourceTaxYear),
      debtorName: 'Jordan Example', debtorSsnLast4: '3333', amountDischarged: amount })),
    insolvency: { ...source.insolvency, liabilities: source.insolvency.liabilities?.map(({ dischargedDebtSourceId: _sourceId, ...row }) => ({
      ...row, dischargedDebtStatementId: source.debts?.[0]?.statementId,
    })) },
  };
}
