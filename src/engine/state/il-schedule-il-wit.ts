/**
 * Illinois Schedule IL-WIT — Illinois Income Tax Withheld
 * Spec: spec/state/il-schedule-il-wit.yaml
 *
 * Models the withholding rows directly and computes the IL-1040 Line 25 total.
 * The supported slice returns taxpayer/spouse subtotals plus flags when more
 * than five rows are needed for either person.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { sum } from "@/utils/decimal.js";

export type ILScheduleWITFormType =
  | "W-2"
  | "W-2G"
  | "1099-R"
  | "1099-G"
  | "1099-MISC"
  | "1099-OID"
  | "1099-K"
  | "1099-DIV"
  | "1099-INT"
  | "1099-B"
  | "1042-S"
  | "1099-NEC"
  | "1099-DA";

export const IL_SCHEDULE_IL_WIT_FORM_CODES: Record<ILScheduleWITFormType, string> = {
  "W-2": "W",
  "W-2G": "WG",
  "1099-R": "R",
  "1099-G": "G",
  "1099-MISC": "M",
  "1099-OID": "O",
  "1099-K": "K",
  "1099-DIV": "D",
  "1099-INT": "I",
  "1099-B": "B",
  "1042-S": "S",
  "1099-NEC": "N",
  "1099-DA": "A",
};

export interface ILScheduleWITRecord {
  taxpayer: "primary" | "spouse";
  formType: ILScheduleWITFormType;
  payerId: string;
  federalAmount: Decimal;
  illinoisAmount: Decimal;
  illinoisWithheld: Decimal;
}

export interface ILScheduleWITOutputRecord extends ILScheduleWITRecord {
  formCode: string;
  sourceRecordCount: number;
}

interface NormalizedScheduleWITRecord extends ILScheduleWITRecord {
  sourceRecordCount: number;
}

export interface ILScheduleWITInput {
  filingStatus: FilingStatus;
  records: ILScheduleWITRecord[];
}

export interface ILScheduleWITResult {
  primaryRecords: ILScheduleWITOutputRecord[];
  spouseRecords: ILScheduleWITOutputRecord[];
  primaryWithholding: Decimal;
  spouseWithholding: Decimal;
  totalWithholding: Decimal;
  requiresAdditionalPrimarySchedule: boolean;
  requiresAdditionalSpouseSchedule: boolean;
  lines: CalculatedLine[];
}

function validateRecord(record: ILScheduleWITRecord, index: number, filingStatus: FilingStatus): void {
  if (record.taxpayer === "spouse" && filingStatus === "married_filing_separately") {
    throw new Error("Schedule IL-WIT spouse withholding records are not allowed for married filing separately");
  }

  if (record.taxpayer === "spouse" && filingStatus !== "married_filing_jointly") {
    throw new Error("Schedule IL-WIT spouse withholding records are only allowed for married filing jointly");
  }

  if (record.illinoisWithheld.lte(0)) {
    throw new Error(`Schedule IL-WIT record ${index + 1} must have positive Illinois withholding`);
  }

  if (record.federalAmount.lt(0)) {
    throw new Error(`Schedule IL-WIT record ${index + 1} federal amount cannot be negative`);
  }

  if (record.illinoisAmount.lt(0)) {
    throw new Error(`Schedule IL-WIT record ${index + 1} Illinois amount cannot be negative`);
  }
}

function toOutputRecord(record: NormalizedScheduleWITRecord): ILScheduleWITOutputRecord {
  return {
    ...record,
    formCode: IL_SCHEDULE_IL_WIT_FORM_CODES[record.formType],
  };
}

function collapseSamePayerW2Gs(records: ILScheduleWITRecord[]): NormalizedScheduleWITRecord[] {
  const w2gCounts = new Map<string, number>();
  const aggregatedByKey = new Map<string, NormalizedScheduleWITRecord>();
  const emittedAggregationKeys = new Set<string>();

  records.forEach((record) => {
    if (record.formType !== "W-2G") {
      return;
    }

    const key = `${record.taxpayer}:${record.payerId}`;
    w2gCounts.set(key, (w2gCounts.get(key) ?? 0) + 1);

    const existing = aggregatedByKey.get(key);
    if (existing) {
      aggregatedByKey.set(key, {
        ...existing,
        federalAmount: existing.federalAmount.plus(record.federalAmount),
        illinoisAmount: existing.illinoisAmount.plus(record.illinoisAmount),
        illinoisWithheld: existing.illinoisWithheld.plus(record.illinoisWithheld),
        sourceRecordCount: existing.sourceRecordCount + 1,
      });
      return;
    }

    aggregatedByKey.set(key, {
      ...record,
      sourceRecordCount: 1,
    });
  });

  return records.reduce<NormalizedScheduleWITRecord[]>((normalized, record) => {
    if (record.formType !== "W-2G") {
      normalized.push({ ...record, sourceRecordCount: 1 });
      return normalized;
    }

    const key = `${record.taxpayer}:${record.payerId}`;
    if ((w2gCounts.get(key) ?? 0) <= 5) {
      normalized.push({ ...record, sourceRecordCount: 1 });
      return normalized;
    }

    if (!emittedAggregationKeys.has(key)) {
      const aggregatedRecord = aggregatedByKey.get(key);
      if (aggregatedRecord) {
        normalized.push(aggregatedRecord);
        emittedAggregationKeys.add(key);
      }
    }

    return normalized;
  }, []);
}

function getAuditLineNumber(taxpayer: "primary" | "spouse", index: number): string {
  if (taxpayer === "primary") {
    return index < 5 ? String(index + 1) : `attachment-primary-${index - 4}`;
  }

  return index < 5 ? String(index + 6) : `attachment-spouse-${index - 4}`;
}

export function calculateILScheduleWIT(input: ILScheduleWITInput): ILScheduleWITResult {
  input.records.forEach((record, index) => validateRecord(record, index, input.filingStatus));

  const normalizedRecords = collapseSamePayerW2Gs(input.records);
  const primaryRecords = normalizedRecords
    .filter((record) => record.taxpayer === "primary")
    .map(toOutputRecord);
  const spouseRecords = normalizedRecords
    .filter((record) => record.taxpayer === "spouse")
    .map(toOutputRecord);

  const primaryWithholding = sum(...primaryRecords.map((record) => record.illinoisWithheld));
  const spouseWithholding = sum(...spouseRecords.map((record) => record.illinoisWithheld));
  const totalWithholding = sum(primaryWithholding, spouseWithholding);

  const requiresAdditionalPrimarySchedule = primaryRecords.length > 5;
  const requiresAdditionalSpouseSchedule = spouseRecords.length > 5;

  const audit = new AuditTrail();
  const FORM = "Schedule IL-WIT";

  primaryRecords.forEach((record, index) => {
    audit.record(
      FORM,
      getAuditLineNumber("primary", index),
      `Primary withholding record ${index + 1}`,
      record.illinoisWithheld,
      "Column E Illinois withholding from the listed record",
      {
        taxpayer: record.taxpayer,
        formType: record.formType,
        formCode: record.formCode,
        payerId: record.payerId,
        federalAmount: record.federalAmount,
        illinoisAmount: record.illinoisAmount,
        illinoisWithheld: record.illinoisWithheld,
        sourceRecordCount: new Decimal(record.sourceRecordCount),
      },
    );
  });

  spouseRecords.forEach((record, index) => {
    audit.record(
      FORM,
      getAuditLineNumber("spouse", index),
      `Spouse withholding record ${index + 1}`,
      record.illinoisWithheld,
      "Column E Illinois withholding from the listed record",
      {
        taxpayer: record.taxpayer,
        formType: record.formType,
        formCode: record.formCode,
        payerId: record.payerId,
        federalAmount: record.federalAmount,
        illinoisAmount: record.illinoisAmount,
        illinoisWithheld: record.illinoisWithheld,
        sourceRecordCount: new Decimal(record.sourceRecordCount),
      },
    );
  });

  audit.record(
    FORM,
    "11",
    "Total Illinois income tax withheld",
    totalWithholding,
    "Sum of Illinois withholding from all primary and spouse records",
    {
      primaryWithholding,
      spouseWithholding,
      primaryRecordCount: new Decimal(primaryRecords.length),
      spouseRecordCount: new Decimal(spouseRecords.length),
      requiresAdditionalPrimarySchedule: requiresAdditionalPrimarySchedule ? "yes" : "no",
      requiresAdditionalSpouseSchedule: requiresAdditionalSpouseSchedule ? "yes" : "no",
    },
  );

  return {
    primaryRecords,
    spouseRecords,
    primaryWithholding,
    spouseWithholding,
    totalWithholding,
    requiresAdditionalPrimarySchedule,
    requiresAdditionalSpouseSchedule,
    lines: audit.getLines(),
  };
}
