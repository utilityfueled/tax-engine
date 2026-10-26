import type { EicResidenceDays } from '@/models/form-8862-sources.js';

/** Actual nonoverlapping day records, not an entered eligibility result. */
export function calculateEicResidenceDays(input: { taxYear: number; sources: EicResidenceDays | undefined; maximumDays?: number }): number {
  const { sources } = input;
  const yearDays = (Date.UTC(input.taxYear + 1, 0, 1) - Date.UTC(input.taxYear, 0, 1)) / 86400000;
  const maximum = input.maximumDays ?? yearDays;
  if (!sources?.sourceReference?.trim() || sources.allDaysIncludedAndDistinctConfirmed !== true) throw new Error('EIC residence needs actual complete distinct-day source records');
  const days = (value: number | undefined): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('EIC actual residence days are unknown or outside the applicable alive period');
    return value;
  };
  let total = days(sources.actualUnitedStatesDays);
  if (sources.temporaryAbsences === undefined) throw new Error('EIC temporary absence history is unknown; record the actual list including none');
  const reasons = new Set(['school', 'vacation', 'business', 'medical', 'military', 'juvenile_detention']);
  for (const row of sources.temporaryAbsences) {
    if (!row.sourceReference?.trim() || !reasons.has(row.reason ?? '')) throw new Error('EIC temporary absence needs its actual supported circumstance and source reference');
    total += days(row.days);
  }
  const military = days(sources.militaryOutsideUnitedStatesDays);
  if (sources.extendedActiveDuty !== undefined && (!sources.extendedActiveDuty.sourceReference?.trim()
    || typeof sources.extendedActiveDuty.orderedOver90DaysOrIndefinite !== 'boolean')) throw new Error('EIC military order facts are unknown');
  if (military > 0 && sources.extendedActiveDuty?.orderedOver90DaysOrIndefinite !== true) throw new Error('EIC counted foreign military days need an actual extended active duty order');
  total += military;
  if (total > maximum || maximum > yearDays) throw new Error('EIC residence days exceed the applicable alive period');
  return total;
}
