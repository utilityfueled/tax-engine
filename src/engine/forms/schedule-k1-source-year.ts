import type { ScheduleK1, ScheduleK1Form1041 } from "@/models/inputs.js";

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
