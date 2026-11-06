import { distinctQtpEsaFixture } from './education-distinct-qtp-esa.js';

/** Four fictional original accounts; ESA expense sharing is statutory, not selected per-account tax. */
export function tuitionAccountGroupFixture(year = 2025, sharedExpense = true) {
  const input = distinctQtpEsaFixture(year), facts = input.qualifiedEducationExpenses!.sourceFacts!;
  const esa = input.form1099Q[2]!;
  Object.assign(esa, { grossDistribution: '4000', earnings: '800', basis: '3200' });
  input.form1099Q.push({ ...esa, sourceId: 'esa-second', accountId: 'esa-second-account', grossDistribution: '2000', earnings: '1200', basis: '800' });
  const history = facts.coverdellAccounts![0]!;
  history.priorYearBasis = '3200';
  facts.coverdellAccounts!.push({ ...history, accountId: 'esa-second-account', priorYearBasis: '800' });
  facts.allocations = [
    { sourceId: 'prepaid', expenseId: 'fall-tuition', amount: '1000', creditAmount: '500' },
    { sourceId: 'esa', expenseId: 'fall-tuition', amount: '1500', creditAmount: '0' },
    { sourceId: 'esa-second', expenseId: 'fall-tuition', amount: '1000', creditAmount: '0' },
    { sourceId: 'prepaid-spring', expenseId: 'spring-tuition', amount: '500', creditAmount: '500' },
    { sourceId: 'esa', expenseId: 'spring-tuition', amount: '1500', creditAmount: '0' },
    { sourceId: 'esa-second', expenseId: 'spring-tuition', amount: '500', creditAmount: '0' },
  ];
  if (sharedExpense) {
    facts.expenses = [{ ...facts.expenses![0]!, id: 'tuition-invoice', amount: '8000', taxFreeAssistance: '1000', educationCreditAmount: '1000' }];
    facts.inKindBenefits!.forEach(benefit => { benefit.expenseId = 'tuition-invoice'; benefit.providedDate = `${year}-08-15`; });
    facts.allocations = [
      { sourceId: 'prepaid', expenseId: 'tuition-invoice', amount: '1000', creditAmount: '500' },
      { sourceId: 'prepaid-spring', expenseId: 'tuition-invoice', amount: '500', creditAmount: '500' },
      { sourceId: 'esa', expenseId: 'tuition-invoice', amount: '3000', creditAmount: '0' },
      { sourceId: 'esa-second', expenseId: 'tuition-invoice', amount: '1500', creditAmount: '0' },
    ];
  }
  return input;
}
