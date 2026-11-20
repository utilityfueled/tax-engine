import type { ScheduleK1, ScheduleK1Form1041 } from "@/models/inputs.js";

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
/** A fiscal period may begin before the return year, but cannot begin after it. */
export function getFutureScheduleK1SourceIssue(
  returnYear: number | undefined,
  passThroughs: readonly ScheduleK1[],
  beneficiaries: readonly ScheduleK1Form1041[] = [],
): string | undefined {
  if (returnYear === undefined) return undefined;
  for (const [form, sources] of [
    ["Schedule K-1 (partnership or S corporation)", passThroughs],
    ["Schedule K-1 (Form 1041)", beneficiaries],
  ] as const) {
    const future = sources.find(source => source.taxYear !== undefined && source.taxYear > returnYear);
    if (future) {
      return `${form} source year ${future.taxYear} is after the ${returnYear} return year; reconcile the original period`;
    }
  }
}
