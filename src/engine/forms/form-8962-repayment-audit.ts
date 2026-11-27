import type Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { AuditTrail } from '@/utils/audit.js';

export function recordForm8962DraftReconciliation(
  audit: AuditTrail,
  netCredit: Decimal,
  repayment: Decimal,
  netCreditFormula?: string,
): void {
  if (repayment.gt(0)) {
    audit.record('Form 8962', '27', 'Excess advance premium tax credit repayment', repayment,
      'Line 25 minus line 24 -> Schedule 2 line 1a');
  } else {
    const formula = netCreditFormula ?? (netCredit.isZero()
      ? 'Lines 24 and 25 are equal'
      : 'Line 24 minus line 25 -> Schedule 3 line 9');
    audit.record('Form 8962', '26', 'Net premium tax credit', netCredit, formula);
  }
}

/** Final Form 7206 methods already require zero allowed credit and full reported repayment. */
export function assertForm8962RepaymentAudit(
  lines: readonly CalculatedLine[],
  taxYear: number,
  reportedAdvances: Decimal,
  error: string,
): void {
  const requireLine = (number: string, value: Decimal | number) => {
    const rows = lines.filter(row => row.form === 'Form 8962' && row.line === number);
    if (rows.length !== 1 || !rows[0].value.eq(value)) throw new Error(error);
  };
  requireLine('24', 0);
  requireLine('25', reportedAdvances);
  if (taxYear === 2026) {
    const [required, blank] = reportedAdvances.isZero() ? ['26', '27'] : ['27', '26'];
    requireLine(required, reportedAdvances);
    if (lines.some(row => row.form === 'Form 8962' && [blank, '28', '29'].includes(row.line))) throw new Error(error);
  } else {
    requireLine('29', reportedAdvances);
  }
}
