import { Form1099QSchema } from '@/models/inputs.js';
import { inKindCreditFixture } from './education-in-kind-credit.js';

/** Confirmed synthetic source choices, never a default election. */
export function inKindCoordinationFixture(year = 2026, esa = true) {
  const input = inKindCreditFixture(year);
  input.adjustments = undefined;
  const facts = input.qualifiedEducationExpenses?.sourceFacts;
  const expense = facts?.expenses?.[0], allocation = facts?.allocations?.[0], source = input.form1099Q[0];
  if (!facts || !expense || !allocation || !source) throw new Error('Missing original synthetic sources');
  expense.taxFreeAssistance = '1000'; allocation.amount = '2000';
  if (esa) {
    expense.amount = '8000'; allocation.amount = '1000';
    input.form1099Q.push(Form1099QSchema.parse({...source,sourceId:'esa',accountId:'actual-esa-account',accountType:'coverdell_esa',
      distributionMedium:'cash',grossDistribution:'6000',earnings:'1200',basis:'4800'}));
    facts.allocations?.push({sourceId:'esa',expenseId:'tuition',amount:'5000',creditAmount:'0'});
    facts.coverdellAccounts = [{accountId:'actual-esa-account',priorYearBasis:'4800',currentYearContributions:'0',
      yearEndValue:'0',outstandingRollovers:'0',rolloverBasisReceived:'0'}];
  }
  return input;
}
