import Decimal from 'decimal.js';
import { Form2555MixedCapitalServicesSchema } from '@/models/form-2555-mixed-capital-services.js';

interface OriginalBusinessSource {
  taxYear: number; accountHolder: string; businessName: string; businessEin?: string;
  source: unknown; grossIncome: Decimal; costOfGoodsSold: Decimal; otherIncome: Decimal;
  businessIncomeSourceReference: string;
  businessW2WagesPaid?: string; businessUbiaQualifiedProperty?: string;
  currentForeignEarned: Decimal; priorServicesReceived: Decimal;
  foreignBusinessExpenses?: Decimal; foreignExpenseSourceReference?: string; reasonableForeignAllowance?: string;
}
const normalizedName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizedEin = (value: string | undefined) => value?.replace(/-/g, '');

/** Source validation only. Canonical federal code applies the cap and expense sum. */
export function resolveForm2555MixedCapitalServices(original: OriginalBusinessSource) {
  const facts = Form2555MixedCapitalServicesSchema.parse(original.source);
  if (facts.businessIncomeSourceReference !== original.businessIncomeSourceReference.trim())
    throw new Error('Form2555 mixed capital original business income source reference does not reconcile');
  if (facts.taxYear !== original.taxYear || facts.accountHolder !== original.accountHolder
    || normalizedName(facts.businessName) !== normalizedName(original.businessName)
    || normalizedEin(facts.businessEin) !== normalizedEin(original.businessEin))
    throw new Error('Form2555 mixed capital statement must match the actual business year owner and identity');
  if (!original.costOfGoodsSold.isZero() || !original.otherIncome.isZero() || !original.priorServicesReceived.isZero())
    throw new Error('Form2555 mixed capital service fees exclude inventory other income and prior services');
  if (original.businessW2WagesPaid === undefined || original.businessUbiaQualifiedProperty === undefined
    || !new Decimal(facts.businessW2WagesPaid).isZero() || !new Decimal(facts.businessUbiaQualifiedProperty).isZero()
    || !new Decimal(original.businessW2WagesPaid).eq(facts.businessW2WagesPaid)
    || !new Decimal(original.businessUbiaQualifiedProperty).eq(facts.businessUbiaQualifiedProperty))
    throw new Error('Form2555 mixed capital business W2 wages and UBIA require actual known-zero originals or a separate allocation method');

  const foreign = new Decimal(facts.foreignGrossIncome), domestic = new Decimal(facts.domesticGrossIncome);
  const foreignExpenses = new Decimal(facts.foreignBusinessExpenses), domesticExpenses = new Decimal(facts.domesticBusinessExpenses);
  const foreignAllowance = new Decimal(facts.foreignReasonableServicesAllowance), domesticAllowance = new Decimal(facts.domesticReasonableServicesAllowance);
  if (!foreign.plus(domestic).eq(original.grossIncome) || domestic.isZero())
    throw new Error('Form2555 mixed capital original foreign and domestic gross must reconcile to the actual business');
  if (!new Decimal(facts.unallocatedBusinessExpenses).isZero())
    throw new Error('Form2555 mixed capital common or unallocated expenses need a separate attribution method');
  if (foreignExpenses.gt(foreign) || domesticExpenses.gt(domestic))
    throw new Error('Form2555 mixed capital domestic or foreign business loss needs its separate method');
  if (!original.foreignBusinessExpenses?.eq(foreignExpenses)
    || facts.foreignExpenseSourceReference !== original.foreignExpenseSourceReference?.trim())
    throw new Error('Form2555 mixed capital foreign expense originals do not reconcile');
  if (original.reasonableForeignAllowance === undefined
    || !foreignAllowance.eq(new Decimal(original.reasonableForeignAllowance))
    || !foreignAllowance.eq(original.currentForeignEarned)
    || foreignAllowance.gt(foreign) || domesticAllowance.gt(domestic))
    throw new Error('Form2555 mixed capital actual current service allowances do not reconcile');

  return { foreign, foreignBusinessExpenses: foreignExpenses,
    capitalMaterialEarned: foreignAllowance.plus(domesticAllowance),
    mixedCapitalTotalExpenses: foreignExpenses.plus(domesticExpenses) };
}
