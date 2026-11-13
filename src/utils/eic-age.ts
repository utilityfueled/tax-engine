function calendarDate(value: string, label: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`EIC ${label} needs an actual calendar date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`EIC ${label} needs an actual calendar date`);
  }
  return parsed;
}

/** IRC 32(c)(1)(A)(ii)(II) and IRS Publication 596, Rule 11. */
export function meetsEicChildlessAgeTest(
  birth: string,
  death: string | null | undefined,
  year: number,
  strict: boolean,
  who: string
): boolean {
  const born = calendarDate(birth, `${who} birth date`);
  const yearEnd = calendarDate(`${year}-12-31`, "tax year end");
  if (born > yearEnd) throw new Error(`EIC ${who} birth date is after the return year`);
  if (strict && death === undefined) throw new Error(`EIC ${who} death status is unknown; confirm alive at year end or supply the actual death date`);
  const reference = death == null ? yearEnd : calendarDate(death, `${who} death date`);
  if (reference < born || reference.getUTCFullYear() !== year) throw new Error(`EIC ${who} death date must be within the return year and on or after birth`);
  const twentyFive = new Date(Date.UTC(born.getUTCFullYear() + 25, born.getUTCMonth(), born.getUTCDate()));
  twentyFive.setUTCDate(twentyFive.getUTCDate() - 1);
  const sixtyFive = new Date(Date.UTC(born.getUTCFullYear() + 65, born.getUTCMonth(), born.getUTCDate()));
  return reference >= twentyFive && reference < sixtyFive;
}
