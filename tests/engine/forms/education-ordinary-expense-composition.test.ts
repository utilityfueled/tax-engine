// Spec: spec/federal/education-ordinary-expense-composition.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { inKindCreditFixture } from '../../fixtures/education-in-kind-credit.js';
import { ordinaryEducationExpenseFixture, ordinaryEducationCashReceiptFixture, ordinaryEducationEsaFixture,
  ordinaryEducationRefundFixture, required } from '../../fixtures/education-ordinary-expense-composition.js';

type Input = ReturnType<typeof ordinaryEducationExpenseFixture>;
const calculate = (input: Input) => calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses,
  { taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, educationExpenses: input.educationExpenses });
const amounts = (input: Input) => {
  const result = calculate(input);
  return [result.taxFreeEarnings, result.taxableEarnings, result.penaltyExceptionAmount, result.netPenalty].map(value => value.toFixed());
};

it('qualifies ordinary receipts without inventing prepaid membership', () => {
  for (const year of [2025, 2026]) for (const category of ['postsecondary_books', 'postsecondary_computer', 'postsecondary_special_needs'] as const) {
    const input = ordinaryEducationExpenseFixture(year);
    required(input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]).category = category;
    const before = structuredClone(input);
    expect(amounts(input)).toEqual(['600', '200', '0', '20']);
    expect(input).toEqual(before);
  }
  const cash = ordinaryEducationCashReceiptFixture(), before = structuredClone(cash);
  expect(amounts(cash)).toEqual(['2075', '725', '225', '50']);
  expect(required(cash.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits).map(row => row.expenseId)).toEqual(['tuition']);
  expect(cash).toEqual(before);
  cash.form1099Q.reverse(); required(cash.qualifiedEducationExpenses?.sourceFacts?.expenses).reverse();
  required(cash.qualifiedEducationExpenses?.sourceFacts?.allocations).reverse();
  expect(amounts(cash)).toEqual(['2075', '725', '225', '50']);
});

it('conserves actual ESA choices across ordinary and cash-only receipts', () => {
  const input = ordinaryEducationEsaFixture(), before = structuredClone(input), result = calculate(input);
  expect(amounts(input)).toEqual(['1700', '1300', '0', '130']);
  expect(result.perDistribution.map(row => row.taxableEarnings.toFixed())).toEqual(['400', '400', '500']);
  expect(input).toEqual(before);
  const facts = required(input.qualifiedEducationExpenses?.sourceFacts), receipt = required(facts.expenses?.[0]);
  required(facts.expenses).push({ ...receipt, id: 'esa-only-computer', category: 'postsecondary_computer', amount: '1000', taxFreeAssistance: '0' });
  required(facts.allocations).push({ sourceId: 'esa', expenseId: 'esa-only-computer', amount: '1000', creditAmount: '0' },
    { sourceId: 'cash-qtp', expenseId: 'esa-only-computer', amount: '0', creditAmount: '0' });
  expect(amounts(input)).toEqual(['1900', '1100', '0', '110']);
  input.form1099Q.reverse(); required(facts.expenses).reverse(); required(facts.allocations).reverse();
  expect(amounts(input)).toEqual(['1900', '1100', '0', '110']);
});

it('uses confirmed current refund chronology without rewriting the original benefit', () => {
  const input = ordinaryEducationRefundFixture(), before = structuredClone(input);
  expect(amounts(input)).toEqual(['500', '300', '0', '30']);
  expect(input).toEqual(before);
  expect(input.form1099Q[0]?.grossDistribution).toBe('4000');
  expect(input.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]?.amount).toBe('4000');
  Object.assign(required(input.qualifiedEducationExpenses?.sourceFacts), { expenseRefunds: [
    { id: 'refund-one', expenseId: 'tuition', amount: '249.99', receivedDate: '2025-09-15', receivedByBeneficiary: true,
      disposition: 'cash_retained', sourceReference: 'fictional first refund', sourceFactsConfirmed: true },
    { id: 'refund-two', expenseId: 'tuition', amount: '250.01', receivedDate: '2025-10-15', receivedByBeneficiary: true,
      disposition: 'cash_retained', sourceReference: 'fictional second refund', sourceFactsConfirmed: true },
  ] });
  expect(amounts(input)).toEqual(['500', '300', '0', '30']);
});

it('binds non-tuition credit character to the actual credit student', () => {
  const input = inKindCreditFixture(2025), facts = required(input.qualifiedEducationExpenses?.sourceFacts);
  input.adjustments = undefined;
  Object.assign(required(facts.expenses?.[0]), { category: 'postsecondary_books', taxFreeAssistance: '1000',
    creditExpenseTreatment: 'llc_required_institution_charge', creditExpenseSourceReference: 'fictional required institutional book charge',
    creditExpenseQualificationConfirmed: true });
  required(facts.allocations?.[0]).amount = '2000';
  expect(amounts(input)).toEqual(['400', '400', '200', '20']);
  const aoc = structuredClone(input), education = required(aoc.educationExpenses);
  education.aocStudents = [{ ...required(education.llcStudents?.[0]), priorYearsClaimed: 0,
    completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false }];
  education.llcStudents = []; education.llcExpenses = '0';
  required(aoc.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]).creditExpenseTreatment = 'aotc_required_course_materials';
  expect(amounts(aoc)).toEqual(['400', '400', '200', '20']);
  for (const invalid of [undefined, false]) {
    const changed = structuredClone(input);
    Object.assign(required(changed.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]), { creditExpenseQualificationConfirmed: invalid });
    expect(() => calculate(changed)).toThrow();
  }
  for (const kind of ['wrong-program', 'services-as-materials', 'missing-reference']) {
    const changed = structuredClone(input), receipt = required(changed.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]);
    if (kind === 'wrong-program') Object.assign(receipt, { creditExpenseTreatment: 'aotc_required_course_materials' });
    if (kind === 'services-as-materials') Object.assign(receipt, { category: 'postsecondary_special_needs', creditExpenseTreatment: 'aotc_required_course_materials' });
    if (kind === 'missing-reference') Object.assign(receipt, { creditExpenseSourceReference: undefined });
    expect(() => calculate(changed), kind).toThrow();
  }
});

it('rejects missing or contradictory original expense composition facts', () => {
  const cash = ordinaryEducationCashReceiptFixture(), facts = required(cash.qualifiedEducationExpenses?.sourceFacts);
  Object.assign(required(facts.expenses?.[1]), { qualificationConfirmed: false });
  required(facts.allocations?.[2]).amount = '0';
  expect(amounts(cash)).toEqual(['1825', '975', '225', '75']);
  required(facts.expenses?.[1]).qualificationConfirmed = undefined;
  expect(() => calculate(cash)).toThrow();
  for (const kind of ['unknown-ledger', 'unknown-completeness', 'false-confirmation', 'wrong-date', 'wrong-year', 'wrong-recipient', 'missing-reference', 'duplicate', 'cent', 'unlinked', 'recontribution', 'benefit-correction']) {
    const input = ordinaryEducationRefundFixture(), packet = required(input.qualifiedEducationExpenses?.sourceFacts);
    const refunds = (packet as typeof packet & { expenseRefunds: Array<Record<string, unknown>> }).expenseRefunds;
    const row = required(refunds[0]);
    if (kind === 'unknown-ledger') Object.assign(packet, { expenseRefunds: undefined });
    if (kind === 'unknown-completeness') Object.assign(required(packet.expenses?.[0]), { refundHistoryCompleteConfirmed: undefined });
    if (kind === 'false-confirmation') row.sourceFactsConfirmed = false;
    if (kind === 'wrong-date') row.receivedDate = '2025-02-30';
    if (kind === 'wrong-year') row.receivedDate = '2026-09-15';
    if (kind === 'wrong-recipient') row.receivedByBeneficiary = false;
    if (kind === 'missing-reference') row.sourceReference = undefined;
    if (kind === 'duplicate') refunds.push({ ...row });
    if (kind === 'cent') row.amount = '500.01';
    if (kind === 'unlinked') row.expenseId = 'missing-receipt';
    if (kind === 'recontribution') row.disposition = 'qtp_recontribution';
    if (kind === 'benefit-correction') row.disposition = 'benefit_correction';
    const before = structuredClone(input);
    expect(() => calculate(input), kind).toThrow(); expect(input).toEqual(before);
  }
  const exact = ordinaryEducationExpenseFixture(), exactFacts = required(exact.qualifiedEducationExpenses?.sourceFacts);
  required(exactFacts.expenses?.[0]).taxFreeAssistance = '1000.00000000000000000000000000000000000000001';
  required(exactFacts.allocations?.[0]).amount = '2999.99999999999999999999999999999999999999999';
  const precision = Decimal.precision;
  expect(amounts(exact)).toEqual(['600', '200', '0', '20']); expect(Decimal.precision).toBe(precision);
  required(exactFacts.allocations?.[0]).amount = '3000';
  expect(() => calculate(exact)).toThrow();
  const over = ordinaryEducationCashReceiptFixture();
  Object.assign(required(over.form1099Q[1]), { grossDistribution: '5999.99', basis: '3999.99' });
  expect(() => calculate(over)).toThrow();
});
