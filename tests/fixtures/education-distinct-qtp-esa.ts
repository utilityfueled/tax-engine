import { multipleEsaFixture } from './education-multiple-esa.js';

/** Separate fictional original statements; no combined earnings ratio. */
export function distinctQtpEsaFixture(year = 2025) {
  const input = multipleEsaFixture(year);
  const facts = input.qualifiedEducationExpenses!.sourceFacts!;
  const first = input.form1099Q[0]!;
  Object.assign(first, { grossDistribution: '2500', earnings: '500', basis: '2000' });
  input.form1099Q.splice(1, 0, { ...first, sourceId: 'prepaid-spring', accountId: 'prepaid-spring-account',
    grossDistribution: '1500', earnings: '600', basis: '900' });
  facts.inKindBenefits![1]!.sourceId = 'prepaid-spring';
  facts.allocations![2]!.sourceId = 'prepaid-spring';
  return input;
}
