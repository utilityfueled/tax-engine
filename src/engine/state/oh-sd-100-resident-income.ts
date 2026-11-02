/** 2025 earned-income resident worksheet only; canonical source admission is separate. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { min, roundDollar, zeroFloor } from "@/utils/decimal.js";

type Owner = "primary" | "spouse" | "joint";
type Money = Decimal | string;
type FilingStatus = "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household" | "qualifying_surviving_spouse";
type AnnualAmount = { status: "known"; amount: Money } | { status: "not-provided" };
type Allocation = { owner: Owner } & (
  | { method: "specific"; residentAmount: Money; annual: AnnualAmount }
  | { method: "prorated"; annualAmount: Money; specificIdentification: "unavailable" }
);

export interface OhioSDResidentIncomeInput {
  taxYear: number;
  districtCode: string;
  filingStatus: FilingStatus;
  annualMAGI: Money;
  residency: ReadonlyArray<{
    owner: "primary" | "spouse";
    periods: ReadonlyArray<{ from: string; through: string; districtCode: string }>;
  }>;
  wages: Allocation;
  selfEmployment: Allocation;
  /** Remaining MAGI sources, with independently established classification/completeness. */
  magiComponents: ReadonlyArray<{ id: string; sign: "add" | "subtract"; allocation: Allocation }>;
}

export interface OhioSDResidentIncomeResult {
  methodVersion: "oh-2025-sd-earned-resident-v1";
  residentDays: number;
  residencyFactor: Decimal;
  line29: Decimal;
  line30: Decimal;
  line31: Decimal;
  line32: Decimal;
  line33: Decimal;
  lines: CalculatedLine[];
}

const DAY = 86_400_000;
const START = Date.UTC(2025, 0, 1);
const AFTER_YEAR = Date.UTC(2026, 0, 1);
const STATUSES: readonly string[] = ["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"];

function calendarDay(value: string): number {
  if (typeof value !== "string" || !/^2025-\d{2}-\d{2}$/.test(value)) throw new Error("Actual residency date must belong to 2025");
  const day = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value) throw new Error("Invalid actual residency date");
  return day;
}

function amount(value: Money, signed: boolean): Decimal {
  if (typeof value !== "string" && !Decimal.isDecimal(value)) throw new Error("Monetary amounts must be Decimal or string");
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isInteger() || (!signed && parsed.isNegative())) throw new Error("Amounts must be finite reported whole dollars with the permitted sign");
  return parsed;
}

/**
 * Does not infer residence from withholding/locality, classify income, qualify a
 * district or accept a rate override. Different joint owner timelines remain
 * outside the published method. Unknown annual source amounts stay unknown.
 */
export function calculateOhioSDResidentIncome(input: OhioSDResidentIncomeInput): OhioSDResidentIncomeResult {
  if (input.taxYear !== 2025) throw new Error("Ohio SD resident income tax year unavailable");
  if ("residencyFactor" in input) throw new Error("Caller residency factor override unavailable");
  if (!/^\d{4}$/.test(input.districtCode) || input.districtCode === "9999") throw new Error("Actual selected school district required");
  if (!STATUSES.includes(input.filingStatus)) throw new Error("Actual filing status unavailable");
  const joint = input.filingStatus === "married_filing_jointly";
  const annualMAGI = amount(input.annualMAGI, false);
  if (input.residency.length !== (joint ? 2 : 1)) throw new Error("Complete actual owner residency required");
  const calendars = new Map<string, string[]>();
  for (const owner of input.residency) {
    if ((owner.owner !== "primary" && owner.owner !== "spouse") || (!joint && owner.owner !== "primary") || calendars.has(owner.owner)) throw new Error("Invalid or duplicate actual residency owner");
    const periods = owner.periods.map(period => ({ start: calendarDay(period.from), end: calendarDay(period.through), district: period.districtCode })).sort((a, b) => a.start - b.start);
    let cursor = START;
    const calendar: string[] = [];
    for (const period of periods) {
      if (!/^\d{4}$/.test(period.district) || period.start !== cursor || period.end < period.start) throw new Error("Residency calendar has missing days, overlap or invalid district");
      for (let day = period.start; day <= period.end; day += DAY) calendar.push(period.district);
      cursor = period.end + DAY;
    }
    if (cursor !== AFTER_YEAR || calendar.length !== 365) throw new Error("Complete actual 365-day residency calendar required");
    calendars.set(owner.owner, calendar);
  }
  const primary = calendars.get("primary");
  if (!primary) throw new Error("Actual primary residency required");
  if (joint) {
    const spouse = calendars.get("spouse");
    if (!spouse || primary.some((district, i) => district !== spouse[i])) throw new Error("Different joint actual residency timelines need separate official method");
  }
  const residentDays = primary.filter(district => district === input.districtCode).length;
  const residencyFactor = new Decimal(residentDays.toString()).div("365").toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const allocate = (source: Allocation, role: "wages" | "se" | "other"): Decimal => {
    if (!["primary", "spouse", "joint"].includes(source.owner) || (!joint && source.owner !== "primary")) throw new Error("Source ownership inconsistent with actual filing owners");
    const signed = role === "se";
    if (source.method === "prorated") {
      if (source.specificIdentification !== "unavailable" || "residentAmount" in source || "annual" in source) throw new Error("Proration requires explicitly unavailable specific identification, without contradictory specific amount");
      return roundDollar(amount(source.annualAmount, signed).times(residencyFactor));
    }
    if (source.method !== "specific" || "annualAmount" in source || "specificIdentification" in source) throw new Error("Actual specific resident allocation required");
    const resident = amount(source.residentAmount, signed);
    if (!source.annual || (source.annual.status !== "known" && source.annual.status !== "not-provided")) throw new Error("Annual source status must be known or explicitly not provided");
    if (source.annual.status === "known") {
      const annual = amount(source.annual.amount, signed);
      if (role === "wages" && resident.greaterThan(annual)) throw new Error("Resident wages exceed known annual wages");
      if (residentDays === 365 && !resident.equals(annual)) throw new Error("Full-year resident amount conflicts with known annual amount");
    } else if ("amount" in source.annual) {
      throw new Error("Unknown annual source cannot contain a contradictory amount");
    }
    if (residentDays === 0 && !resident.isZero()) throw new Error("Nonzero specific resident income contradicts zero resident days");
    return resident;
  };
  const line29 = allocate(input.wages, "wages");
  const line30 = allocate(input.selfEmployment, "se");
  const line31 = zeroFloor(line29.plus(line30));
  let residentMAGI = line29.plus(line30);
  const identities = new Set<string>();
  for (const component of input.magiComponents) {
    if (typeof component.id !== "string" || !component.id.trim() || identities.has(component.id)) throw new Error("Missing or duplicate MAGI source identity");
    identities.add(component.id);
    if (component.sign !== "add" && component.sign !== "subtract") throw new Error("Explicit MAGI source addition/deduction required");
    const resident = allocate(component.allocation, "other");
    residentMAGI = component.sign === "add" ? residentMAGI.plus(resident) : residentMAGI.minus(resident);
  }
  // Full-year line32 expressly uses actual line3; the mixed component method
  // belongs to part-year allocation and cannot replace that printed rule.
  const line32 = residentDays === 365 ? annualMAGI : min(annualMAGI, zeroFloor(residentMAGI));
  const line33 = min(line31, line32);
  const audit = new AuditTrail();
  for (const [line, value, formula] of [
    ["29", line29, "specific resident wages or reported annual wages × reported residency factor"],
    ["30", line30, "specific signed resident net SE or reported annual net SE × reported residency factor"],
    ["31", line31, "max(0,line29+line30)"],
    ["32", line32, residentDays === 365 ? "actual annual MAGI (SD100 line3), full-year instruction" : "min(annualMAGI,max(0,net specifically identified and separately prorated resident MAGI))"],
    ["33", line33, "min(line31,line32)"],
  ] as const) audit.record("OH-SD-100-Resident-Income", line, `Earned-income resident worksheet line ${line}`, value, formula, { residencyFactor });
  return { methodVersion: "oh-2025-sd-earned-resident-v1", residentDays, residencyFactor, line29, line30, line31, line32, line33, lines: audit.getLines() };
}
