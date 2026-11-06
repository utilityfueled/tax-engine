/** Explicit NEW FICTIONAL actual-paper originals; no production source defaults.
 * Spec: state/oh-school-district-official-review.yaml.
 */
import {
  schoolDistrictSourcesFixture, schoolDistrictEstimatedFixture, schoolDistrictZeroWithholdingFixture,
  schoolDistrictPriorReturn, schoolW2Packet, bindSchoolDistrictFixture, addSchoolMunicipalRow,
} from './oh-school-district-sources.js';

export const schoolOfficialCases = ['base', 'estimates', 'outgoing', 'prior', 'zero-withholding', 'municipal-first'] as const;
export type SchoolOfficialCase = typeof schoolOfficialCases[number];
export const schoolOfficialOracles: Record<SchoolOfficialCase, {
  withheld: string; credited: string; payments: string; overpayment: string; outgoing: string; refund: string; files: number;
}> = {
  base: { withheld: '1100', credited: '0', payments: '1100', overpayment: '100', outgoing: '0', refund: '100', files: 2 },
  estimates: { withheld: '600', credited: '400', payments: '1000', overpayment: '0', outgoing: '0', refund: '0', files: 2 },
  outgoing: { withheld: '1100', credited: '0', payments: '1100', overpayment: '100', outgoing: '25', refund: '75', files: 2 },
  prior: { withheld: '1100', credited: '100', payments: '1200', overpayment: '200', outgoing: '0', refund: '200', files: 2 },
  'zero-withholding': { withheld: '0', credited: '1000', payments: '1000', overpayment: '0', outgoing: '0', refund: '0', files: 1 },
  'municipal-first': { withheld: '1100', credited: '0', payments: '1100', overpayment: '100', outgoing: '0', refund: '100', files: 2 },
};
export function schoolOfficialFixture(kind: SchoolOfficialCase = 'base') {
  const input = kind === 'estimates' ? schoolDistrictEstimatedFixture()
    : kind === 'zero-withholding' ? schoolDistrictZeroWithholdingFixture() : schoolDistrictSourcesFixture();
  // Newly authored actual fictional employer Ohio account number, independently
  // supplied for paper; old mathematical fixture and all monetary originals stay exact.
  const state = schoolW2Packet(input).stateRows[0];
  if (!state) throw new Error('Actual fictional Ohio state row required');
  state.employerStateID = '12345678';
  if (kind === 'outgoing') input.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward = '25';
  if (kind === 'prior') {
    input.ohioSchoolDistrict.payments.priorReturn = schoolDistrictPriorReturn(input, '1000', '100', '100');
    input.ohioSchoolDistrict.payments.priorCreditCarryforward = {
      status: 'actual_credit', sourceReference: 'PRIVATE-EXPLICIT-FICTIONAL-2024-SD-CARRY',
      accountHolder: 'primary', accountSsn: input.taxpayer.primary.ssn,
      electedAmount: '100', availableForThisReturn: '100', appliedToThisReturnConfirmed: true,
    };
    input.ohioSchoolDistrict.payments.account.priorCreditApplied = '100';
  }
  if (kind === 'municipal-first') addSchoolMunicipalRow(input, true);
  bindSchoolDistrictFixture(input);
  return input;
}
