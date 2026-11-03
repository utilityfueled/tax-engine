/** Spec: spec/state/pa-ordinary-employee-sources.yaml packetCompleteness. */
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { assessReturnReadiness } from '@/utils/return-readiness';
import { paOrdinaryEmployeeReturnFixture } from '../fixtures/pa-ordinary-employee-sources';

const ue = 'Pennsylvania Schedule UE is included as a reference summary, not an official PA Schedule UE filing copy.';
const nrh = 'Pennsylvania Schedule NRH is included as a reference summary, not an official PA Schedule NRH filing copy.';
function packet(status: 'resident' | 'part_year' | 'nonresident', mode: 'nrh' | 'payroll' = 'nrh') {
  const f = paOrdinaryEmployeeReturnFixture(status, mode);
  const federalResult = calculateFederalTax(f.input);
  const ordinary = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
  federalResult.stateReturns = { ...federalResult.stateReturns, pennsylvania: ordinary };
  return { f, federalResult, ordinary };
}
for (const status of ['resident', 'part_year', 'nonresident'] as const) {
  it(`ordinary employee ${status} reference artifacts remain partial without legacy inputs`, () => {
    const { f, federalResult } = packet(status);
    expect(f.input.paResidentReturn).toBeUndefined();
    expect(f.input.paNonresidentReturn).toBeUndefined();
    const assessment = assessReturnReadiness({ taxInput: f.input, federalResult, stateCode: 'PA', includedForms: ['pa-40-filled.pdf', 'pa-schedule-ue-reference.pdf', ...(status === 'resident' ? [] : ['pa-schedule-nrh-reference.pdf'])] });
    expect(assessment.packetCompleteness).toBe('partial');
    expect(assessment.findings).toContain(ue);
    if (status !== 'resident') expect(assessment.findings).toContain(nrh);
    else expect(assessment.findings).not.toContain(nrh);
    expect(assessment.filingQualified).toBe(false);
    expect(assessment.businessRuleValidation).toBe('not-validated');
  });
  it(`ordinary employee ${status} missing required artifacts remains partial`, () => {
    const { f, federalResult } = packet(status);
    const assessment = assessReturnReadiness({ taxInput: f.input, federalResult, stateCode: 'PA', includedForms: ['pa-40-filled.pdf'] });
    expect(assessment.packetCompleteness).toBe('partial');
    expect(assessment.findings).toContain('Pennsylvania Schedule UE applies, but no complete set of employer Schedule UE packet artifacts was generated.');
    if (status !== 'resident') expect(assessment.findings).toContain('Pennsylvania Schedule NRH applies, but no complete set of employer Schedule NRH packet artifacts was generated.');
    expect(assessment.filingQualified).toBe(false);
    expect(assessment.businessRuleValidation).toBe('not-validated');
  });
}
it('actual zero UE still requires the nonresident allocation reference', () => {
  const { f, federalResult } = packet('nonresident', 'payroll');
  const assessment = assessReturnReadiness({ taxInput: f.input, federalResult, stateCode: 'PA', includedForms: ['pa-40-filled.pdf', 'pa-schedule-nrh-reference.pdf'] });
  expect(assessment.packetCompleteness).toBe('partial');
  expect(assessment.findings).toContain(nrh);
  expect(assessment.findings).not.toContain(ue);
  expect(assessment.findings.some(value => value.includes('Schedule UE applies'))).toBe(false);
  expect(assessment.filingQualified).toBe(false);
});
it('one reference artifact cannot cover two employee projections in a readiness-only control', () => {
  const { f, federalResult, ordinary } = packet('nonresident');
  const employee = ordinary.employeeSources?.perEmployer[0];
  if (!employee || !ordinary.employeeSources) throw new Error('Readiness control requires an actual employee projection');
  // This shape-only duplication tests artifact completeness; it is not source admission.
  ordinary.employeeSources.perEmployer.push(employee);
  const assessment = assessReturnReadiness({ taxInput: f.input, federalResult, stateCode: 'PA', includedForms: ['pa-40-filled.pdf', 'pa-schedule-ue-reference.pdf', 'pa-schedule-nrh-reference.pdf'] });
  expect(assessment.packetCompleteness).toBe('partial');
  expect(assessment.findings).not.toContain(ue);
  expect(assessment.findings).not.toContain(nrh);
  expect(assessment.findings).toContain('Pennsylvania Schedule UE applies, but no complete set of employer Schedule UE packet artifacts was generated.');
  expect(assessment.findings).toContain('Pennsylvania Schedule NRH applies, but no complete set of employer Schedule NRH packet artifacts was generated.');
  expect(assessment.filingQualified).toBe(false);
});
