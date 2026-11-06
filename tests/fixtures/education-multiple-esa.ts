import { inKindCoordinationFixture } from './education-in-kind-coordination.js';

/** Original fictional receipts and the taxpayer's explicit allocation. */
export function multipleEsaFixture(year = 2025) {
  const input = inKindCoordinationFixture(year);
  const facts = input.qualifiedEducationExpenses!.sourceFacts!;
  const first = facts.expenses![0]!;
  facts.expenses = [
    { ...first, id: 'fall-tuition', amount: '4500', taxFreeAssistance: '500', educationCreditAmount: '500' },
    { ...first, id: 'spring-tuition', paidDate: `${year}-01-15`, amount: '3500', taxFreeAssistance: '500', educationCreditAmount: '500' },
  ];
  const benefit = facts.inKindBenefits![0]!;
  facts.inKindBenefits = [
    { ...benefit, id: 'fall-benefit', expenseId: 'fall-tuition', amount: '2500' },
    { ...benefit, id: 'spring-benefit', expenseId: 'spring-tuition', providedDate: `${year}-01-15`, amount: '1500' },
  ];
  facts.allocations = [
    { sourceId: 'prepaid', expenseId: 'fall-tuition', amount: '1000', creditAmount: '500' },
    { sourceId: 'esa', expenseId: 'fall-tuition', amount: '2500', creditAmount: '0' },
    { sourceId: 'prepaid', expenseId: 'spring-tuition', amount: '500', creditAmount: '500' },
    { sourceId: 'esa', expenseId: 'spring-tuition', amount: '2000', creditAmount: '0' },
  ];
  input.form1099Q[1]!.basis = '4200'; input.form1099Q[1]!.earnings = '1800';
  facts.coverdellAccounts![0]!.priorYearBasis = '4200';
  return input;
}
