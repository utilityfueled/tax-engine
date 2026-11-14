/** Disabled December 2025 physical candidates. Spec: spec/federal/form-1062-2026-template.yaml. */
import { createHash } from "node:crypto";
import type Decimal from "decimal.js";
import { calculateForm1062, type Form1062Input } from "@/engine/forms/form-1062.js";
import { calculateForm1062ScheduleA, type Form1062ScheduleAInput } from "@/engine/forms/form-1062-schedule-a.js";

const page = "topmostSubform[0].Page1[0].";
const parentLines = ["1", "2", "3", "4a", "4b", "4c", "4d", "4z", "5", "6", "7", "8", "9", "10", "11",
  "12a", "12b", "12c", "12d", "12z", "13", "14", "15"] as const;
const parentAmounts = Object.freeze(Object.fromEntries(parentLines.map((line, index) =>
  [`line${line}`, `${page}f1_${index + 4}[0]`],
)) as Record<`line${typeof parentLines[number]}`, string>);

export const FORM_1062_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  sources: Object.freeze({
    form1062: Object.freeze({
      file: "f1062.pdf",
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1062.pdf",
      revision: "December 2025, Created 12/12/25",
      posted: "2026-04-15",
      retrievedAt: "2026-11-14T02:38:15.831304Z",
      sha256: "4ff34ba9f4f25a995557c49c0ed001f41e0efd75c3e79ec1a9513e7e8a912ade",
    }),
    scheduleA: Object.freeze({
      file: "f1062sa.pdf",
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1062sa.pdf",
      revision: "December 2025, Created 9/22/25",
      posted: "2026-04-15",
      retrievedAt: "2026-11-14T02:38:16.570258Z",
      sha256: "dc50ba9b52db27a01492962b7349b71070812956c56feff376928dcd17a4953d",
    }),
  }),
  fields: Object.freeze({
    form1062: Object.freeze({
      name: `${page}f1_1[0]`,
      identifyingNumber: `${page}f1_2[0]`,
      scheduleACount: `${page}f1_3[0]`,
      ...parentAmounts,
    }),
    scheduleA: Object.freeze({
      name: `${page}f1_1[0]`,
      identifyingNumber: `${page}f1_2[0]`,
      form1120S: `${page}c1_1[0]`,
      form1065: `${page}c1_2[0]`,
      form8865: `${page}c1_3[0]`,
      entityEin: `${page}f1_3[0]`,
      entityName: `${page}f1_4[0]`,
      line1: `${page}f1_5[0]`,
      exchange: `${page}c1_4[0]`,
      installmentSale: `${page}c1_5[0]`,
      sale: `${page}c1_6[0]`,
      line3: `${page}f1_6[0]`,
      line4Yes: `${page}c1_7[0]`,
      line4No: `${page}c1_7[1]`,
      line5Yes: `${page}c1_8[0]`,
      line5No: `${page}c1_8[1]`,
      line6Yes: `${page}c1_9[0]`,
      line6No: `${page}c1_9[1]`,
      line7Yes: `${page}c1_10[0]`,
      line7No: `${page}c1_10[1]`,
      line8Yes: `${page}c1_11[0]`,
      line8No: `${page}c1_11[1]`,
      line9: `${page}f1_7[0]`,
      line10: `${page}f1_8[0]`,
      line11: `${page}f1_9[0]`,
      line12: `${page}f1_10[0]`,
      line13: `${page}f1_11[0]`,
    }),
  }),
});

interface CandidateBytes {
  form1062: Uint8Array;
  scheduleA: Uint8Array;
}

interface RedactedFields {
  form1062: Record<string, string>;
  schedulesA: Record<string, string | boolean>[];
}

function exactAmount(value: Decimal): string {
  return value.toFixed(Math.max(2, value.decimalPlaces()));
}

function projectSchedule(sale: Form1062ScheduleAInput): Record<string, string | boolean> {
  const { lines } = calculateForm1062ScheduleA(sale);
  const fields = FORM_1062_2026_CANDIDATE.fields.scheduleA;
  const [year, month, day] = sale.saleDate.split("-");
  return {
    [fields.form1120S]: sale.transactionType === "s_corporation_sale",
    [fields.form1065]: sale.transactionType === "partnership_sale",
    [fields.form8865]: false,
    [fields.exchange]: false,
    [fields.installmentSale]: false,
    [fields.sale]: true,
    [fields.line3]: `${month}/${day}/${year}`,
    [fields.line4Yes]: true, [fields.line4No]: false,
    [fields.line5Yes]: true, [fields.line5No]: false,
    [fields.line6Yes]: true, [fields.line6No]: false,
    [fields.line7Yes]: true, [fields.line7No]: false,
    [fields.line8Yes]: true, [fields.line8No]: false,
    ...Object.fromEntries(lines.map(({ line, value }) => [fields[`line${line}` as keyof typeof fields], exactAmount(value)])),
  };
}

/** Project only redacted diagnostic fields for the exact pinned blank templates. */
export function projectForm1062CandidateFields(input: Form1062Input, bytes: CandidateBytes): RedactedFields {
  for (const kind of ["form1062", "scheduleA"] as const) {
    const source = FORM_1062_2026_CANDIDATE.sources[kind];
    if (createHash("sha256").update(bytes[kind]).digest("hex") !== source.sha256) {
      throw new Error(`Unreviewed Form 1062 candidate template revision: ${source.file}.`);
    }
  }
  const result = calculateForm1062(input);
  const fields = FORM_1062_2026_CANDIDATE.fields.form1062;
  const sales = input.sale === undefined ? input.sales.map(({ scheduleA }) => scheduleA) : [input.sale];
  return {
    form1062: {
      [fields.scheduleACount]: String(result.scheduleACount),
      ...Object.fromEntries(result.lines.map(({ line, value }) => [fields[`line${line}` as keyof typeof fields], exactAmount(value)])),
    },
    schedulesA: sales.map(projectSchedule),
  };
}
