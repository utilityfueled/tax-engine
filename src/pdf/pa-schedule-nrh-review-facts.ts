import type { PAOrdinaryReturnResult } from '@/engine/state/pa-ordinary-return.js';
import type { TaxYearInput } from '@/models/inputs.js';

export interface PAScheduleNRHReviewFacts {
  calendarDays: number;
  weekendsAndHolidays: number;
  illnessAndDisability: number;
  vacationAndLeave: number;
  nonworkingDays: number;
  workingDays: number;
  paWorkingDays: number;
  fraction: string;
  grossCompensation: string;
  apportionedCompensation: string;
}

/** Only the verified no-expense Part C route of the standing form. */
export function projectPAScheduleNRHReview(
  original: TaxYearInput,
  result: PAOrdinaryReturnResult,
): PAScheduleNRHReviewFacts | undefined {
  const employer = original.paResidencySources?.employeeSources?.employers;
  const employees = result.employeeSources?.perEmployer;
  if (result.taxYear !== 2025 || result.residencyStatus !== 'nonresident' ||
      original.w2s.length !== 1 || employer?.length !== 1 || employees?.length !== 1) return;
  const row = employer[0], employee = employees[0], nrh = employee.scheduleNRH;
  const [period] = row.employmentPeriods;
  if (employee.residentPeriod !== false || employee.originalIndex !== 0 || row.originalIndex !== 0 ||
      row.allocationMethod !== 'working_days' || row.employmentPeriods.length !== 1 ||
      period.from !== '2025-01-01' || period.through !== '2025-12-31' ||
      row.ue.expenses.length || row.ue.reimbursements.length || row.ue.outsideBox16MealsPerDiem ||
      !employee.scheduleUE.totalExpenses.isZero() || !employee.scheduleUE.employerReimbursements.isZero() ||
      !nrh || !nrh.line9.gt(0) || !nrh.line12.gt(0) || !row.statement.w2CorrectionExplanation.trim() ||
      !nrh.line17.isZero() || !nrh.line19.isZero() || !nrh.line21.isZero() ||
      !nrh.line12.eq(nrh.line18) || !nrh.line12.eq(nrh.line20) || !nrh.line12.eq(nrh.line22) ||
      !nrh.line12.eq(result.pa40.compensation) || !nrh.line22.eq(result.pa40.netCompensation) ||
      !result.pa40.unreimbursedExpenses.isZero()) return;

  let weekendsAndHolidays = 0, illnessAndDisability = 0, vacationAndLeave = 0;
  for (const day of row.calendar) {
    if (day.kind === 'working') continue;
    switch (day.nonworkingReason) {
      case 'weekend_holiday': weekendsAndHolidays++; break;
      case 'illness_disability': illnessAndDisability++; break;
      case 'vacation_leave': vacationAndLeave++; break;
      default: return;
    }
  }
  const { calendarDays, nonworkingDays, workingDays, paWorkingDays } = employee;
  if (calendarDays !== 365 || row.calendar.length !== calendarDays ||
      nonworkingDays !== weekendsAndHolidays + illnessAndDisability + vacationAndLeave ||
      workingDays !== calendarDays - nonworkingDays || paWorkingDays <= 0 || paWorkingDays > workingDays) return;

  return {
    calendarDays, weekendsAndHolidays, illnessAndDisability, vacationAndLeave,
    nonworkingDays, workingDays, paWorkingDays, fraction: nrh.workingDayFraction.toFixed(6),
    grossCompensation: nrh.line9.toFixed(0), apportionedCompensation: nrh.line12.toFixed(0),
  };
}
