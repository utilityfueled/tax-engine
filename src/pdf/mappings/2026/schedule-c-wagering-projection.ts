/** Source values for the disabled final 2026 Schedule C physical candidate. */
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { ScheduleCProfessionalWageringSchema, type TaxYearInput } from '@/models/inputs.js';
import { d, roundDollar } from '@/utils/decimal.js';
import { SCHEDULE_C_2026_CANDIDATE } from './schedule-c-candidate.js';

export function projectScheduleC2026WageringFields(input: TaxYearInput): Record<string, string> {
  const ledger = ScheduleCProfessionalWageringSchema.safeParse(input.scheduleC?.professionalWagering);
  if (!ledger.success) throw new Error('The actual Schedule C wagering ledger is required');
  if (input.stateReturns?.illinois || input.paResidencySources || input.ohioResidency) {
    throw new Error('This Schedule C wagering candidate requires separate state composition');
  }
  if (!d(ledger.data.otherwiseDeductibleWageringExpenses).isZero()) {
    throw new Error('This Schedule C wagering candidate requires separate treatment for mixed Part V expense categories');
  }

  const result = calculateScheduleC(input, input.scheduleC);
  const gross = roundDollar(result.grossIncome);
  const deductible = roundDollar(result.totalExpenses);
  const net = roundDollar(result.netProfit);
  if (!gross.minus(deductible).eq(net)) {
    throw new Error('This Schedule C candidate cannot reconcile the rounded wagering amounts');
  }

  const fields = SCHEDULE_C_2026_CANDIDATE.fields;
  const grossDollars = gross.toFixed(0);
  const deductionDollars = deductible.toFixed(0);
  const profitDollars = net.toFixed(0);
  return {
    [fields.line1]: grossDollars,
    [fields.line3]: grossDollars,
    [fields.line5]: grossDollars,
    [fields.line7]: grossDollars,
    ...(!deductible.isZero() ? {
      [fields.otherExpense1Description]: 'Wagering losses',
      [fields.otherExpense1Amount]: deductionDollars,
      [fields.line48]: deductionDollars,
      [fields.line27b]: deductionDollars,
      [fields.line28]: deductionDollars,
    } : {}),
    [fields.line29]: profitDollars,
    [fields.line31]: profitDollars,
  };
}
