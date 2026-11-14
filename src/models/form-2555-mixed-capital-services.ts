import { z } from 'zod';

// No defaults or coercion: absent original amounts and confirmations stay unknown.
const amount = z.string().regex(/^\d+(?:\.\d+)?$/);
const reference = z.string().trim().min(1);
export const Form2555MixedCapitalServicesSchema = z.object({
  taxYear: z.number().int(), accountHolder: z.enum(['primary', 'spouse']),
  businessName: reference, businessEin: z.string().regex(/^\d{2}-?\d{7}$/),
  sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  businessIncomeSourceReference: reference,
  allCurrentBusinessSourcesIncluded: z.literal(true), locationSeparatedServiceFeesOnlyConfirmed: z.literal(true),
  taxpayerForeignServicesInQualifyingPeriodConfirmed: z.literal(true), noForeignEciOrRecharacterizationConfirmed: z.literal(true),
  noPriorServicesOrExpenseHistoryConfirmed: z.literal(true), allExpensesDirectlyAttributedConfirmed: z.literal(true),
  foreignServiceSourceReference: reference, domesticServiceSourceReference: reference,
  foreignGrossIncome: amount, domesticGrossIncome: amount,
  businessW2WagesPaid: amount, businessUbiaQualifiedProperty: amount,
  foreignBusinessExpenses: amount, domesticBusinessExpenses: amount, unallocatedBusinessExpenses: amount,
  foreignExpenseSourceReference: reference, domesticExpenseSourceReference: reference,
  foreignReasonableServicesAllowance: amount, domesticReasonableServicesAllowance: amount,
  reasonableAllowancesConfirmed: z.literal(true), allowanceSourceReference: reference,
}).strict();

export type Form2555MixedCapitalServices = z.infer<typeof Form2555MixedCapitalServicesSchema>;
