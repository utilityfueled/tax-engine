/** Form 2210 Schedule AI. Spec: spec/federal/form-2210-schedule-ai.yaml. */
import Decimal from 'decimal.js';
import { getConstants, type FilingStatus } from '@/models/constants.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateRegularIncomeTax } from '@/utils/tax-math.js';

const FORM = 'Form 2210 Schedule AI', COLUMNS = ['a', 'b', 'c', 'd'] as const;
const MULTIPLIERS = ['4', '2.4', '1.5', '1'], PERCENTS = ['0.225', '0.45', '0.675', '0.9'];
const WAGE_LIMIT_TWELFTHS = [3, 5, 8, 12];
const SOCIAL_SECURITY = ['0.496', '0.2976', '0.186', '0.124'], MEDICARE = ['0.116', '0.0696', '0.0435', '0.029'];
const MONEY = /^\d+(\.\d+)?$/, SIGNED = /^-?\d+(\.\d+)?$/;

export interface Form2210ScheduleAiInput {
  taxYear: number; filingStatus: FilingStatus; requiredAnnualPayment: Decimal; standardDeduction: Decimal;
  facts: NonNullable<TaxYearInput['form2210']>;
}
export interface Form2210ScheduleAiResult { installments: Decimal[]; lines: CalculatedLine[] }

function amount(value: string | undefined, label: string, signed = false): Decimal {
  if (value === undefined || !(signed ? SIGNED : MONEY).test(value)) throw new Error(`Form 2210 Schedule AI requires the actual ${label}`);
  return new Decimal(value);
}

export function calculateForm2210ScheduleAi(input: Form2210ScheduleAiInput): Form2210ScheduleAiResult {
  const { taxYear, filingStatus, facts } = input, periods = facts.annualizedIncomePeriods;
  if (periods?.length !== 4) throw new Error('Form 2210 Schedule AI requires all four actual cumulative periods');
  if (filingStatus === 'married_filing_jointly' && typeof facts.bothSpousesSelfEmployed !== 'boolean') {
    throw new Error('Form 2210 Schedule AI requires the actual answer on whether both spouses were self-employed');
  }
  if (facts.bothSpousesSelfEmployed === true) throw new Error('Form 2210 Schedule AI needs a separate PartII for each self-employed spouse');
  const constants = getConstants(taxYear), wageBase = constants.selfEmploymentTax.socialSecurityWageBase, audit = new AuditTrail();
  const installments: Decimal[] = [], line24 = input.requiredAnnualPayment.times('0.25');
  let priorInstallments = new Decimal(0), line25 = new Decimal(0);
  periods.forEach((period, index) => {
    const column = COLUMNS[index]!, multiplier = MULTIPLIERS[index]!;
    if (amount(period.qualifiedDividends, 'period qualified dividends').gt(0) || amount(period.netCapitalGain, 'period net capital gain').gt(0)) {
      throw new Error('Form 2210 Schedule AI with qualified dividends or net capital gain needs its separate period worksheet method');
    }
    const annualized = amount(period.adjustedGrossIncome, 'period adjusted gross income', true).times(multiplier);
    const itemized = amount(period.itemizedDeductions, 'period itemized deductions').times(multiplier);
    const deduction = Decimal.max(itemized, input.standardDeduction);
    const line13 = Decimal.max(0, annualized.minus(deduction).minus(amount(period.qbiDeduction, 'period QBI deduction')));
    const tax = calculateRegularIncomeTax(line13, filingStatus, constants);
    const profit = amount(period.netProfitFromSelfEmployment, 'period self-employment profit', true);
    const line28 = profit.lt(400) ? new Decimal(0) : profit.times('0.9235');
    const line31 = Decimal.max(0, wageBase.times(WAGE_LIMIT_TWELFTHS[index]!).div(12).minus(amount(period.socialSecurityWages, 'period social security wages')));
    const line36 = Decimal.min(line28, line31).times(SOCIAL_SECURITY[index]!).plus(line28.times(MEDICARE[index]!));
    const line17 = tax.plus(line36).plus(amount(period.otherTaxes, 'period other taxes'));
    const line19 = Decimal.max(0, line17.minus(amount(period.credits, 'period credits')));
    const line21 = line19.times(PERCENTS[index]!), line23 = Decimal.max(0, line21.minus(priorInstallments));
    const line26 = line24.plus(line25), line27 = Decimal.min(line23, line26);
    for (const [line, value, description] of [['3', annualized, 'Annualized income'], ['8', deduction, 'Larger annualized itemized or standard deduction'],
      ['13', line13, 'Annualized taxable income'], ['14', tax, 'Tax on annualized income'], ['36', line36, 'Annualized self-employment tax'],
      ['19', line19, 'Annualized tax after credits'], ['21', line21, 'Applicable percentage of tax'], ['27', line27, 'Required installment']] as const) {
      audit.record(FORM, `${line}${column}`, description, value, `Schedule AI line${line}`);
    }
    installments.push(line27);
    priorInstallments = priorInstallments.plus(line27);
    line25 = line26.minus(line27);
  });
  return { installments, lines: audit.getLines() };
}
