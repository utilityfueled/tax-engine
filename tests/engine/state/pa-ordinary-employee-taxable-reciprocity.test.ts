/** Spec: state/pa-ordinary-employee-sources.yaml#taxablePayrollReimbursements. */
import { expect, it } from 'vitest';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';
import { paOrdinaryReturnReciprocalFixture } from '../../fixtures/pa-ordinary-return';
import { paReciprocityFixture } from '../../fixtures/pa-reciprocity';

it('defers the ordinary return when wages with an included allowance are excluded by reciprocity', () => {
  const employee = paOrdinaryEmployeeFixture('nonresident');
  const complete = paOrdinaryReturnReciprocalFixture();
  const { reciprocalSources } = paReciprocityFixture();
  const [employer] = employee.packet.employers;
  const [w2] = employee.input.w2s;
  const [wage] = employee.residency.wages;
  const [reciprocalW2] = reciprocalSources.originals;
  const [reciprocalPayroll] = reciprocalSources.segments;
  const [expense] = employer.ue.expenses;
  const [originalPaystub] = employer.payroll;
  const [originalServicePayroll] = wage.payroll;

  Object.assign(w2, {
    wages: '18353.25', federalWithheld: '1300', socialSecurityWages: '18353.25',
    socialSecurityWithheld: '1137.90', medicareWages: '18353.25', medicareWithheld: '266.12',
    state: 'PA', stateWages: '18353.25', stateTaxWithheld: '0',
  });
  employer.originalW2 = structuredClone(w2);
  wage.original = structuredClone(w2);
  for (const day of employer.calendar) {
    for (const location of day.locations) {
      location.state = 'PA';
      location.employerRequiredOutsideWork = null;
    }
  }
  employer.statement = {
    ...employer.statement, outsideWorkDates: [], w2CorrectionExplanation: '',
    taxablePayrollInclusionVerifiedConfirmed: true,
  } as typeof employer.statement;
  const paystub = { ...originalPaystub, grossCompensation: '18353.25', cashWagesBeforeReimbursements: '18333.13' };
  employer.payroll = [paystub];
  const payroll = {
    ...originalServicePayroll, grossCompensation: '18353.25',
    paServicesCompensation: '18353.25', outsidePAServicesCompensation: '0',
  };
  wage.payroll = [payroll];
  employer.ue.expenses = [expense];
  const allowance = {
    sourceReference: 'Fictional employer wage-included allowance line', paidOn: paystub.paidOn,
    amount: '20.12', method: 'included_in_w2', includedInW2Confirmed: true,
    taxablePayroll: { payrollSourceReference: paystub.sourceReference, federalBox1InclusionConfirmed: true },
    expenseReferences: [expense.sourceReference],
  };
  employer.ue.reimbursements = [allowance];
  Object.assign(expense, {
    amount: '222.51', reimbursementMethod: 'included_in_w2',
    reimbursementReferences: [allowance.sourceReference],
  });

  employee.residency.residency.domicilePeriods[0].state = 'OH';
  employee.residency.residency.dec31PrincipalResidenceState = 'OH';
  reciprocalSources.owner = structuredClone(employee.residency.owner);
  reciprocalW2.originalW2 = structuredClone(w2);
  reciprocalW2.actualPAWithheld = '0';
  reciprocalW2.residentStateReturn.ownerOriginal = structuredClone(employee.residency.owner.originalTaxpayer);
  reciprocalPayroll.actualPayroll = structuredClone(payroll);
  const input = Object.assign(complete.input, {
    w2s: employee.input.w2s, paResidencySources: employee.residency, paReciprocitySources: reciprocalSources,
  });
  complete.facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  complete.sources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);

  // This packet previously exported raw employee UE $223 and NRH net $18,130 alongside PA-40 compensation $0.
  expect(() => calculatePAOrdinaryReturn(input, complete.facts, complete.sources))
    .toThrow(/wage.included.*reciprocal|reciprocal.*wage.included/i);
});
