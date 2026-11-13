/** Spec: state/pa-ordinary-employee-sources.yaml#taxablePayrollReimbursements. */
import { expect, it } from 'vitest';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';

function includedAllowance(status: 'resident' | 'part_year' | 'nonresident', amount = '3500') {
  const f = paOrdinaryEmployeeFixture(status);
  const row = f.packet.employers[0];
  const w2 = f.input.w2s[0];
  const wage = f.residency.wages[0];
  if (!row || !w2 || !wage || !row.payroll[0]) throw new Error('Fictional originals are incomplete');
  const gross = amount === '3500' ? '33500' : '30500';
  w2.wages = gross;
  w2.socialSecurityWages = gross;
  w2.medicareWages = gross;
  w2.socialSecurityWithheld = amount === '3500' ? '2077' : '1891';
  w2.medicareWithheld = amount === '3500' ? '485.75' : '442.25';
  w2.state = 'PA';
  w2.stateWages = gross;
  row.originalW2 = structuredClone(w2);
  wage.original = structuredClone(w2);
  for (const day of row.calendar) for (const location of day.locations) location.state = 'PA';
  row.statement.outsideWorkDates = [];
  row.statement.w2CorrectionExplanation = '';
  const statement = { ...row.statement, taxablePayrollInclusionVerifiedConfirmed: true };
  row.statement = statement;
  const pay = { ...row.payroll[0], grossCompensation: gross, cashWagesBeforeReimbursements: '30000' };
  row.payroll = [pay];
  wage.payroll = [{ ...wage.payroll[0], grossCompensation: gross, paServicesCompensation: gross, outsidePAServicesCompensation: '0' }];
  const allowance = {
    sourceReference: 'Fictional employer taxable allowance paystub entry', paidOn: pay.paidOn,
    amount, method: 'included_in_w2', includedInW2Confirmed: true,
    taxablePayroll: { payrollSourceReference: pay.sourceReference, federalBox1InclusionConfirmed: true },
    expenseReferences: row.ue.expenses.map(expense => expense.sourceReference),
  };
  row.ue.reimbursements = [allowance];
  for (const expense of row.ue.expenses) {
    expense.amount = '300';
    expense.reimbursementMethod = 'included_in_w2';
    expense.reimbursementReferences = [allowance.sourceReference];
  }
  return { ...f, row, wage, w2, allowance, pay, statement };
}

it('PA fully wage-included reimbursement stays in wages and eligible receipts reach UE and NRH', () => {
  for (const status of ['resident', 'part_year', 'nonresident'] as const) {
    for (const [amount, gross, net, tax] of [['3500', '33500', '30500', '936'], ['500', '30500', '27500', '844']] as const) {
      const f = includedAllowance(status, amount);
      const result = calculatePAResidencySources(f.input, f.residency);
      const employee = calculatePAOrdinaryEmployeeSources(f.input, f.packet).perEmployer[0];
      if (!employee) throw new Error('Expected source-qualified employer');
      expect(result.reportedCompensation.toFixed()).toBe(gross);
      expect(result.totalOrdinaryPATaxableIncome.toFixed()).toBe(net);
      expect(result.taxBeforeCredits.toFixed()).toBe(tax);
      expect([employee.scheduleUE.lineH, employee.scheduleUE.lineI, employee.scheduleUE.lineJ].map(value => value.toFixed())).toEqual(['3000', '0', '3000']);
      expect([employee.scheduleNRH.line13, employee.scheduleNRH.line16, employee.scheduleNRH.line17, employee.scheduleNRH.line19].map(value => value.toFixed())).toEqual(['3000', '3000', gross, '0']);
    }
  }
});

it('PA fully wage-included reimbursement requires actual Box 16 and payroll reconciliation', () => {
  const cases = [
    (f: ReturnType<typeof includedAllowance>) => { f.w2.stateWages = '33499.99'; f.row.originalW2 = structuredClone(f.w2); f.row.statement.w2CorrectionExplanation = 'Cannot substitute a correction for original inclusion'; },
    (f: ReturnType<typeof includedAllowance>) => { f.w2.state = 'NY'; f.row.originalW2 = structuredClone(f.w2); f.row.statement.w2CorrectionExplanation = 'A different state is not PA Box 16'; },
    (f: ReturnType<typeof includedAllowance>) => { f.statement.taxablePayrollInclusionVerifiedConfirmed = false; },
    (f: ReturnType<typeof includedAllowance>) => { f.allowance.taxablePayroll.federalBox1InclusionConfirmed = false; },
    (f: ReturnType<typeof includedAllowance>) => { f.allowance.paidOn = '2025-09-16'; },
    (f: ReturnType<typeof includedAllowance>) => {
      f.row.statement.signedOn = '2025-09-17';
      f.pay.paidOn = '2025-09-18';
      f.allowance.paidOn = f.pay.paidOn;
    },
    (f: ReturnType<typeof includedAllowance>) => { f.pay.cashWagesBeforeReimbursements = '29999.99'; },
    (f: ReturnType<typeof includedAllowance>) => { f.allowance.taxablePayroll.payrollSourceReference = 'Different paystub'; },
    (f: ReturnType<typeof includedAllowance>) => {
      const day = f.row.calendar[10], location = day?.locations[0];
      if (!day || !location) throw new Error('Fictional compensable workday is missing');
      location.state = 'NY';
      location.employerRequiredOutsideWork = false;
      f.row.statement.outsideWorkDates = [day.date];
    },
  ];
  for (const edit of cases) {
    const f = includedAllowance('resident');
    edit(f);
    expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/wage|payroll|reimbursement|work|original/i);
  }
});

it('PA taxable payroll does not admit the same original receipt or allowance under another employer', () => {
  for (const sharedOriginal of ['receipt', 'allowance']) {
    const f = includedAllowance('resident');
    const w2 = structuredClone(f.w2);
    w2.employer = { name: 'Separate fictional employer', ein: '12-3459876' };
    const second = { ...structuredClone(f.row), originalIndex: 1, sourceReference: 'Second original employer set', originalW2: w2, employer: { ...f.row.employer, ...w2.employer } };
    for (const expense of second.ue.expenses) {
      if (sharedOriginal === 'allowance') expense.receiptReference += ' different original';
      if (sharedOriginal === 'receipt') expense.reimbursementReferences = ['Second original allowance'];
    }
    if (sharedOriginal === 'receipt') second.ue.reimbursements[0].sourceReference = 'Second original allowance';
    f.input.w2s.push(w2);
    f.packet.employers.push(second);
    expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(/duplicate.*original/i);
  }
});

it('PA taxable payroll rejects a different parent payroll reference even when amounts match', () => {
  const f = includedAllowance('resident');
  f.wage.payroll[0].sourceReference = 'Equal amounts from a different original payroll';
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/same original payroll/i);
});
