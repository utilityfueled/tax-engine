/** Fictional current2026 PA employee originals; no real taxpayer or filed return. */
import type { OhioReciprocalWageSources } from '@/models/ohio-reciprocal-wage-sources.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from './oh-2026-ordinary-return.js';

export function ohio2026PaReciprocalFixture(withholding = '1000') {
  const ordinary = ohio2026OrdinaryFixture('nonresident', '50000', '50000');
  const w2 = ordinary.input.w2s[0];
  const owner = ordinary.input.ohioResidency?.owners[0];
  const employment = ordinary.sources.employmentOriginals[0];
  if (!w2 || !owner || !employment || !w2.stateLocalSources) throw new Error('Complete fictional source fixture required');
  const state = w2.stateLocalSources.stateRows[0];
  if (!state) throw new Error('Actual fictional OH original row required');
  w2.stateTaxWithheld = withholding;
  state.withheld = withholding;
  const { stateLocalSources: _sources, ...originalW2 } = w2;
  w2.stateLocalSources.originalW2 = structuredClone(originalW2);
  owner.periods = [{ from: '2026-01-01', to: '2026-12-31', domicileState: 'PA' }];
  employment.serviceRows = [{ sourceId: 'FICTIONAL-2026-OH-PAYROLL', sourceReference: 'FICTIONAL-2026-OH-PAYROLL-ORIGINAL',
    from: '2026-01-01', to: '2026-12-31', paymentDate: '2026-12-31', serviceState: 'OH', wages: '50000' }];
  const period = { from: '2026-01-01', to: '2026-12-31', documentDate: '2026-12-31' };
  const person = ordinary.input.taxpayer.primary;
  const reciprocal: OhioReciprocalWageSources = {
    sourceTaxYear: 2026, sourceReference: 'FICTIONAL-COMPLETE-2026-PA-EMPLOYEE', sourceFactsConfirmed: true,
    allIncomeOriginalsIncludedConfirmed: true, noOtherIncomeOrAdjustmentsConfirmed: true, noSpecialCompensationConfirmed: true,
    accountHolder: 'primary', originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn },
    w2Index: 0, originalW2: structuredClone(w2),
    domicileOriginal: { sourceId: 'FICTIONAL-PA-DOMICILE', sourceTaxYear: 2026, accountHolder: 'primary',
      name: `${person.firstName} ${person.lastName}`, ssn: person.ssn, ...period, domicileState: 'PA', completeYearDomicileConfirmed: true },
    employerEntityOriginal: { sourceId: 'FICTIONAL-EMPLOYER-ENTITY', sourceTaxYear: 2026, employerTin: w2.employer.ein,
      employerName: w2.employer.name, entityType: 'c_corporation', ...period, notPassThroughOrPEOConfirmed: true },
    serviceOriginal: { sourceId: 'FICTIONAL-EMPLOYEE-SERVICES', sourceTaxYear: 2026, accountHolder: 'primary',
      employerTin: w2.employer.ein, ...period, allCompensationOrdinaryOhioEmployeeServicesConfirmed: true, totalCompensation: '50000' },
    payrollRows: [{ sourceId: 'FICTIONAL-RECIPROCAL-PAYROLL', sourceReference: 'FICTIONAL-RECIPROCAL-PAYROLL-ORIGINAL',
      accountHolder: 'primary', sourceTaxYear: 2026, employerTin: w2.employer.ein,
      servicePeriodFrom: '2026-01-01', servicePeriodTo: '2026-12-31', paymentDate: '2026-12-31', serviceState: 'OH', wages: '50000', ohioWithheld: withholding }],
  };
  if (!ordinary.input.ohioResidency) throw new Error('Actual fictional residency required');
  ordinary.input.ohioResidency.reciprocalWageSources = structuredClone(reciprocal);
  rebindOhio2026Ordinary(ordinary);
  return { input: ordinary.input, sources: { ...ordinary.sources,
    methodId: 'oh-2026-pa-reciprocal-employee-draft-v1' as const, reciprocalWageSources: reciprocal } };
}
