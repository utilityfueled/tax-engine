import type { GuidedFlowState } from './guided-interview-flow';
import { buildStandardDeductionFacts } from './guided-standard-deduction-facts';

/** Source-only consistency; the canonical standard worksheet independently checks eligibility. */
export function nonitemizedElectionFactErrors(state: GuidedFlowState): Record<string, string> {
  if (state.sectionData.deductions?.method !== 'nonitemized') return {};
  try {
    if (state.taxYear !== 2026) throw new Error('The nonitemized election is available only for 2026.');
    const status = state.segmentation.filingStatus, personal = state.sectionData['personal-info'];
    if (!status || !personal) throw new Error('Complete the actual filing status and standard-deduction facts first.');
    const facts = buildStandardDeductionFacts(personal.standardDeductionFacts, status, state.taxYear, personal);
    const unavailable = (status === 'mfs' && facts.spouseItemizes === true) || facts.shortTaxYear === true
      || ((facts.dualStatusAlien === true || facts.nonresidentAlien === true) && !(status === 'mfj' && facts.residentJointElection === true));
    if (!unavailable) throw new Error('This choice requires actual facts that make the standard deduction unavailable. Otherwise choose standard or itemized.');
    return {};
  } catch (error) { return { nonitemizedElection: error instanceof Error ? error.message : 'Complete the actual deduction election and eligibility facts.' }; }
}
