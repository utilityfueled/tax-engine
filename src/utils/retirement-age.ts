export function isBeforeAge59AndHalfDate(birthDate: Date, comparisonDate: Date): boolean {
  const targetMonthOffset = birthDate.getUTCMonth() + 6;
  const targetYear = birthDate.getUTCFullYear() + 59 + Math.floor(targetMonthOffset / 12);
  const targetMonth = targetMonthOffset % 12;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(birthDate.getUTCDate(), lastDayOfMonth);
  return comparisonDate < new Date(Date.UTC(targetYear, targetMonth, targetDay));
}
