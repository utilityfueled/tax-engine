/**
 * Ohio Schedule of Withholding — supports IT 1040 line 14.
 * Spec: spec/state/oh-schedule-of-withholding.yaml
 *
 * Aggregates Ohio state income tax withholding from supported income
 * statements. Only amounts explicitly tagged for Ohio belong on IT 1040 line
 * 14; other-state and school-district withholding are excluded.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type {
  Form1099G,
  Form1099K,
  Form1099Misc,
  Form1099Nec,
  Form1099R,
  FormW2G,
  W2,
} from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

export interface OhioScheduleOfWithholdingInput {
  w2s?: W2[];
  formW2Gs?: FormW2G[];
  form1099Gs?: Form1099G[];
  form1099Ks?: Form1099K[];
  form1099Rs?: Form1099R[];
  form1099Necs?: Form1099Nec[];
  form1099Miscs?: Form1099Misc[];
}

export interface OhioScheduleOfWithholdingResult {
  line1_w2OhioWithholding: Decimal;
  line2_w2gOhioWithholding: Decimal;
  line3_1099gOhioWithholding: Decimal;
  line4_1099kOhioWithholding: Decimal;
  line5_1099rOhioWithholding: Decimal;
  line5a_1099NecOhioWithholding: Decimal;
  line5b_1099MiscOhioWithholding: Decimal;
  line6_totalOhioWithholding: Decimal;
  lines: CalculatedLine[];
}

function isOhioStateCode(state: string | undefined): boolean {
  return state?.trim().toUpperCase() === "OH";
}

function sumOhioAmounts<T extends { state?: string }>(
  statements: T[] | undefined,
  getAmount: (statement: T) => Decimal | string | number | undefined,
): Decimal {
  let total = new Decimal(0);

  for (const statement of statements ?? []) {
    if (!isOhioStateCode(statement.state)) {
      continue;
    }

    total = total.plus(d(getAmount(statement)));
  }

  return total;
}

export function calculateOhioScheduleOfWithholding(
  input: OhioScheduleOfWithholdingInput,
): OhioScheduleOfWithholdingResult {
  const audit = new AuditTrail();

  const line1 = sumOhioAmounts(
    input.w2s,
    (statement) => statement.stateTaxWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "1",
    "Ohio withholding from W-2 statements",
    line1,
    "Sum W-2 box 17 amounts where state = OH",
  );

  const line2 = sumOhioAmounts(
    input.formW2Gs,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "2",
    "Ohio withholding from W-2G statements",
    line2,
    "Sum W-2G box 15 amounts where state = OH",
  );

  const line3 = sumOhioAmounts(
    input.form1099Gs,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "3",
    "Ohio withholding from 1099-G statements",
    line3,
    "Sum 1099-G box 11 amounts where state = OH",
  );

  const line4 = sumOhioAmounts(
    input.form1099Ks,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "4",
    "Ohio withholding from 1099-K statements",
    line4,
    "Sum 1099-K box 8 amounts where state = OH",
  );

  const line5 = sumOhioAmounts(
    input.form1099Rs,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "5",
    "Ohio withholding from 1099-R statements",
    line5,
    "Sum 1099-R box 14 amounts where state = OH",
  );

  const line5a = sumOhioAmounts(
    input.form1099Necs,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "5a",
    "Ohio withholding from 1099-NEC statements",
    line5a,
    "Sum 1099-NEC box 5 amounts where state = OH",
  );

  const line5b = sumOhioAmounts(
    input.form1099Miscs,
    (statement) => statement.stateWithheld,
  );
  audit.record(
    "OH-SCHEDULE-WH",
    "5b",
    "Ohio withholding from 1099-MISC statements",
    line5b,
    "Sum 1099-MISC box 16 amounts where state = OH",
  );

  const line6 = sum(line1, line2, line3, line4, line5, line5a, line5b);
  audit.record(
    "OH-SCHEDULE-WH",
    "6",
    "Total Ohio withholding for IT 1040 line 14",
    line6,
    "Line 1 + Line 2 + Line 3 + Line 4 + Line 5 + Line 5a + Line 5b",
    {
      "Line 1": line1,
      "Line 2": line2,
      "Line 3": line3,
      "Line 4": line4,
      "Line 5": line5,
      "Line 5a": line5a,
      "Line 5b": line5b,
    },
  );

  return {
    line1_w2OhioWithholding: line1,
    line2_w2gOhioWithholding: line2,
    line3_1099gOhioWithholding: line3,
    line4_1099kOhioWithholding: line4,
    line5_1099rOhioWithholding: line5,
    line5a_1099NecOhioWithholding: line5a,
    line5b_1099MiscOhioWithholding: line5b,
    line6_totalOhioWithholding: line6,
    lines: audit.getLines(),
  };
}
