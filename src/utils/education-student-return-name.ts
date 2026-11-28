function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

/** Form 8863 line 20 uses the name on the return for the otherwise matched student. */
export function educationStudentReturnName(
  studentName: string,
  person: { firstName: string; lastName: string } | undefined,
): string | undefined {
  const firstName = person?.firstName.trim();
  const lastName = person?.lastName.trim();
  if (!firstName || !lastName) return undefined;
  const returnName = `${firstName} ${lastName}`;
  return normalizeName(studentName) === normalizeName(returnName) ? returnName : undefined;
}
