/** Spec: spec/state/pa-ordinary-employee-sources.yaml. Existing imports capture real positive-behavior failures before new modules. */
import { expect, it } from 'vitest';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { calculatePAOrdinaryReturnFacts } from '@/engine/state/pa-ordinary-return-facts';
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources, updateGuidedPAResidencySources } from '@/lib/guided-pa-residency-facts';
import { paOrdinaryEmployeeFixture, paOrdinaryEmployeeReturnFixture } from '../../fixtures/pa-ordinary-employee-sources';

function employer(f: ReturnType<typeof paOrdinaryEmployeeFixture>) {
  const row = f.packet.employers[0];
  if (!row) throw new Error('Fictional control requires an employer original');
  return row;
}

it('actual employee sources preserve all three residency tax boundaries', () => {
  for (const [status, gross, ue, net, tax] of [['resident', '75000', '1000', '74000', '2272'], ['part_year', '27000', '360', '26640', '818'], ['nonresident', '27000', '360', '26640', '818']] as const) {
    const f = paOrdinaryEmployeeFixture(status), before = structuredClone(f), result = calculatePAResidencySources(f.input, f.residency);
    expect(result.reportedCompensation.toFixed()).toBe(gross);
    expect(result.unreimbursedEmployeeExpenses.toFixed()).toBe(ue);
    expect(result.totalOrdinaryPATaxableIncome.toFixed()).toBe(net);
    expect(result.taxBeforeCredits.toFixed()).toBe(tax);
    expect(f).toEqual(before);
  }
});

it('actual employee sources require an actual reason before correcting original PA wages', () => {
  const f = paOrdinaryEmployeeFixture(); f.input.w2s[0].state = 'PA'; f.input.w2s[0].stateWages = '75000';
  employer(f).originalW2 = structuredClone(f.input.w2s[0]); f.residency.wages[0].original = structuredClone(f.input.w2s[0]);
  employer(f).statement.w2CorrectionExplanation = '';
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/actual|source|original|correct|statement/i);
});

it('actual employee sources reject a free legacy PA wage override beside the actual calendar', () => {
  const f = paOrdinaryEmployeeFixture(); f.residency.wages[0].payroll[0].paServicesCompensation = '27001'; f.residency.wages[0].payroll[0].outsidePAServicesCompensation = '47999';
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/actual|source|payroll|reconcil|calendar/i);
});

it('actual employee sources preserve original NJ reciprocal employee rejection', () => {
  const f = paOrdinaryEmployeeFixture(); f.residency.residency.domicilePeriods[0].state = 'NJ'; f.residency.residency.dec31PrincipalResidenceState = 'NJ';
  f.input.w2s[0].state = 'NJ'; f.input.w2s[0].stateTaxWithheld = '2500'; employer(f).originalW2 = structuredClone(f.input.w2s[0]); f.residency.wages[0].original = structuredClone(f.input.w2s[0]);
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/reciprocal|source|employee|actual/i);
  expect(f.input.w2s[0].wages).toBe('75000'); expect(f.input.w2s[0].stateTaxWithheld).toBe('2500');
});

it('actual employee sources reject employment crossing an actual domicile move', () => {
  const f = paOrdinaryEmployeeFixture('part_year'); f.residency.residency.domicilePeriods[0].through = '2025-06-30'; f.residency.residency.domicilePeriods[1].from = '2025-07-01';
  f.residency.residency.paPermanentAbodePeriods[0].from = '2025-07-01'; f.residency.residency.outsidePAPermanentAbodePeriods[0].through = '2025-06-30';
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/period|actual|source|method/i);
});

it('actual employee sources bind new actual proof only during explicit guide confirmation', () => {
  const f = paOrdinaryEmployeeFixture(), draft = structuredClone(f.residency); Reflect.deleteProperty(employer(f), 'originalW2');
  const draftEmployer = draft.employeeSources.employers[0]; if (!draftEmployer) throw new Error('Actual draft employer is missing'); Reflect.deleteProperty(draftEmployer, 'originalW2');
  expect(() => buildGuidedPAResidencySources(f.input, draft)).toThrow(/actual|source|original/i);
  const confirmed = confirmGuidedPAResidencySources(f.input, draft), before = structuredClone(confirmed);
  expect(Reflect.get(confirmed, 'employeeSources')).toMatchObject({ employers: [{ originalW2: f.input.w2s[0] }] });
  f.input.w2s[0].employer.name = 'Equal-money edited employer'; expect(() => buildGuidedPAResidencySources(f.input, confirmed)).toThrow(/actual|source|original/i);
  expect(confirmed).toEqual(before);
  expect(updateGuidedPAResidencySources(confirmed, {}).sourceFactsConfirmed).toBeNull();
});

it('actual employee sources preserve literal50000 wages and actual April15 estimate400', () => {
  const f = paOrdinaryEmployeeReturnFixture('nonresident', 'payroll'), before = structuredClone(f);
  const facts = calculatePAOrdinaryReturnFacts(f.input, f.facts), result = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
  expect(result.pa40.compensation.toFixed()).toBe('50000');
  expect(result.pa40.unreimbursedExpenses.toFixed()).toBe('0');
  expect(result.pa40.totalPATaxableIncome.toFixed()).toBe('50000');
  expect(result.pa40.taxLiability.toFixed()).toBe('1535');
  expect(result.pa40.estimatedPayments.toFixed()).toBe('400');
  expect(result.pa40.taxDue.toFixed()).toBe('1135');
  expect(facts.quarterlyEstimatedPayments.map(amount => amount.toFixed())).toEqual(['400', '0', '0', '0']);
  expect(facts.spOutsidePAIncome.toFixed()).toBe('25000');
  expect(result.readiness.filingEligible).toBe(false);
  expect(f).toEqual(before);
});

it('actual employee sources preserve actual UE and NRH ordinary principal without promotion', () => {
  for (const [status, gross, expense, net, tax] of [['resident', '75000', '1000', '74000', '2272'], ['part_year', '27000', '360', '26640', '818'], ['nonresident', '27000', '360', '26640', '818']] as const) {
    const f = paOrdinaryEmployeeReturnFixture(status), result = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
    expect(result.pa40.compensation.toFixed()).toBe(gross);
    expect(result.pa40.unreimbursedExpenses.toFixed()).toBe(expense);
    expect(result.pa40.totalPATaxableIncome.toFixed()).toBe(net);
    expect(result.pa40.taxLiability.toFixed()).toBe(tax);
    expect(result.pa40.taxDue.toFixed()).toBe(tax);
    expect(result.readiness.filingEligible).toBe(false);
    expect(result.readiness.formStatus).toBe('actual_2025_review_only');
  }
});
