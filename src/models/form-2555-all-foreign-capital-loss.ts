import { z } from 'zod';

const amount = z.string().regex(/^\d+(?:\.\d+)?$/);
const reference = z.string().trim().min(1);
/** Actual original worksheet; no missing facts, defaults, choices or coercion. */
export const Form2555AllForeignCapitalLossSchema = z.strictObject({
  taxYear: z.number().int(), accountHolder: z.enum(['primary', 'spouse']),
  businessName: reference, businessEin: z.string().regex(/^\d{2}-?\d{7}$/),
  sourceReference: reference, sourceFactsConfirmed: z.literal(true),
  businessIncomeSourceReference: reference, foreignServicesSourceReference: reference,
  expenseSourceReference: reference, allowanceSourceReference: reference,
  electionSourceReference: reference, historySourceReference: reference, allocationWorksheetReference: reference,
  allCurrentBusinessSourcesIncluded: z.literal(true), allGrossForeignServiceFeesConfirmed: z.literal(true),
  taxpayerServicesInQualifyingPeriodConfirmed: z.literal(true), noForeignEciOrRecharacterizationConfirmed: z.literal(true),
  activeAllAtRiskConfirmed: z.literal(true), currentCashSuppliesPaidAndUsedConfirmed: z.literal(true),
  noOtherExpenseOrPriorBusinessHistoryConfirmed: z.literal(true), actualValidExclusionElectionConfirmed: z.literal(true),
  noOtherActivityOrLossSourceConfirmed: z.literal(true),
  grossIncome: amount, currentBusinessExpenses: amount, reasonableServicesAllowance: amount,
  allocationMethod: z.literal('pub54_two_decimal_percentage'), allocationPercentage: amount, allocatedDeductions: amount,
  businessW2WagesPaid: amount, businessUbiaQualifiedProperty: amount, businessWithholding: amount,
  priorServiceReceipts: amount, priorBusinessExpenses: amount, priorQbiLoss: amount, priorActiveQbiLoss: amount,
  priorEblNol: amount, priorGeneralNol: amount, priorSuspendedLosses: amount, retirementContributions: amount,
});
export type Form2555AllForeignCapitalLoss = z.infer<typeof Form2555AllForeignCapitalLossSchema>;
