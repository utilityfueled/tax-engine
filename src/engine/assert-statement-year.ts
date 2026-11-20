/** A supplied calendar year must agree with the return. Older undated rows are allowed. */
export function assertStatementYear(
  formName: string,
  statements: readonly { taxYear?: number }[],
  returnYear: number,
): void {
  const wrongYear = statements.find(statement => statement.taxYear !== undefined && statement.taxYear !== returnYear);
  if (wrongYear) {
    throw new Error(`${formName} source year ${wrongYear.taxYear} must match the ${returnYear} return`);
  }
}
