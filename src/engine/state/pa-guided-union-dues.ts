/** Shared source checks for the guided 2025 Schedule UE union-dues packet. */
import { W2Schema, type TaxYearInput } from '@/models/inputs.js';
import { PAOrdinaryEmployeeSourcesSchema, type PAOrdinaryEmployeeSources } from '@/models/pa-ordinary-employee-sources.js';
import type { PAResidencySources } from '@/models/pa-residency.js';

type Employer = PAOrdinaryEmployeeSources['employers'][number];

export function unionDuesWageSource(input: TaxYearInput | null, data: PAResidencySources) {
  if (input?.taxpayer.taxYear !== 2025 || input.taxpayer.spouse || input.w2s.length !== 1
    || data.sourceTaxYear !== 2025 || data.owner.accountHolder !== 'primary' || data.residency.status !== 'resident'
    || data.residency.domicilePeriods.length !== 1 || data.residency.domicilePeriods[0].state !== 'PA'
    || data.wages.length !== 1) return;
  const wage = data.wages[0];
  const original = input.w2s[0];
  if (wage.originalIndex !== 0 || original.accountHolder !== 'primary' || wage.sourceFactsConfirmed !== true
    || wage.sourceTaxYear !== 2025 || wage.noPAFederalCompensationDifferencesConfirmed !== true
    || !wage.payroll.length || wage.payroll.some(pay => !/^0+(?:\.0+)?$/.test(pay.outsidePAServicesCompensation))) return;
  return { wage, original };
}

export function originalPayroll(wage: PAResidencySources['wages'][number]): Employer['payroll'] {
  return wage.payroll.map(({ sourceReference, paidOn, serviceFrom, serviceThrough, grossCompensation }) =>
    ({ sourceReference, paidOn, serviceFrom, serviceThrough, grossCompensation }));
}

export function originalOwner(input: TaxYearInput) {
  const { firstName, lastName, ssn } = input.taxpayer.primary;
  return { firstName, lastName, ssn };
}

export function isGuidedPAUnionDues(packet: PAOrdinaryEmployeeSources): boolean {
  if (!PAOrdinaryEmployeeSourcesSchema.safeParse(packet).success || packet.collectionMethod !== 'guided_union_dues_2025'
    || packet.employers.length !== 1) return false;
  const row = packet.employers[0];
  return packet.sourceTaxYear === 2025 && packet.owner.accountHolder === 'primary'
    && row.allocationMethod === 'working_days' && row.workplaceBasis === 'suitable_PA' && row.specialInterstateOccupation === 'none'
    && row.employmentPeriods.length === 1 && row.statement.outsideWorkDates.length === 0
    && row.calendar.every(day => day.travelClassification === 'none' && day.nonworkingReason !== 'other_employer'
      && day.locations.every(location => location.state === 'PA' && location.compensatedWorkConfirmed === true && location.transitOnly === false))
    && row.ue.reimbursements.length === 0 && row.ue.outsideBox16MealsPerDiem === undefined
    && row.ue.expenses.every(expense => expense.category === 'union_dues' && expense.reimbursementMethod === 'none');
}

export function assertGuidedPAUnionDuesPacket(packet: PAOrdinaryEmployeeSources): void {
  if (!isGuidedPAUnionDues(packet)) throw new Error('Complete actual Pennsylvania-only original employment and union dues sources.');
  const row = packet.employers[0];
  if (row.ue.expenses.length === 0) throw new Error('Enter an original union dues receipt, including an actual zero if shown on the original.');
  const references = row.ue.expenses.map(expense => expense.receiptReference.trim().toLowerCase());
  if (new Set(references).size !== references.length) throw new Error('Duplicate original union dues receipt. Record each receipt once.');
  if (row.payroll.some(pay => pay.paidOn > row.statement.signedOn) || row.ue.expenses.some(expense => expense.paidOn > row.statement.signedOn)) {
    throw new Error('Signed employer verification must cover the submitted payroll and dues dates.');
  }
}

export function validateGuidedPAUnionDues(input: TaxYearInput, data: PAResidencySources): PAOrdinaryEmployeeSources {
  const parent = unionDuesWageSource(input, data);
  const packet = data.employeeSources;
  if (!parent || !packet) throw new Error('Complete actual Pennsylvania-only original employment and union dues sources.');
  assertGuidedPAUnionDuesPacket(packet);
  const row = packet.employers[0];
  const sourceW2 = W2Schema.strict().safeParse(row.originalW2);
  const currentW2 = W2Schema.strict().safeParse(parent.original);
  const owner = originalOwner(input);
  const savedOwner = packet.owner.originalTaxpayer;
  if (!sourceW2.success || !currentW2.success || JSON.stringify(sourceW2.data) !== JSON.stringify(currentW2.data)
    || !savedOwner || savedOwner.firstName !== owner.firstName || savedOwner.lastName !== owner.lastName || savedOwner.ssn !== owner.ssn
    || row.originalIndex !== parent.wage.originalIndex || row.sourceReference !== parent.wage.sourceReference
    || row.employer.name !== parent.original.employer.name || row.employer.ein !== parent.original.employer.ein
    || JSON.stringify(row.payroll) !== JSON.stringify(originalPayroll(parent.wage))) {
    throw new Error('The original W-2, owner or payroll changed. Review and re-enter the union dues packet against the current originals.');
  }
  return packet;
}
