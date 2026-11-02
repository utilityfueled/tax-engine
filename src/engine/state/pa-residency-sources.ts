/** Source-derived ordinary PA residency/tax bases. Spec: spec/state/pa-residency-sources.yaml. */
import Decimal from "decimal.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Form1099IntSchema, W2Schema, type TaxYearInput } from "@/models/inputs.js";
import { PAResidencySourcesSchema, type PAResidencySources, type PAResidencyStatus } from "@/models/pa-residency.js";
import { roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

const error = (detail: string): never => { throw new Error(`PA ordinary residency sources: ${detail}`); };
function reference(value: unknown): void { if (typeof value !== "string" || !value.trim()) error("confirm the actual source reference"); }
function amount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return error("actual nonnegative monetary amount is missing or invalid; enter known zero explicitly");
  const result = new Decimal(value); if (!result.isFinite()) return error("nonfinite source amount"); return result;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function semantic(value: unknown, year: number, key = ""): unknown {
  if (Array.isArray(value)) return [...new Map(value.map(v => { const item = semantic(v, year); return [stable(item), item]; })).values()].sort((a, b) => stable(a).localeCompare(stable(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !["accountHolder", "taxYear", "privateActivityBondFacts", ...(year === 2025 ? ["box12CodeTP", "box12CodeTT", "treasuryTippedOccupationCodes"] : [])].includes(k))
    .map(([k, v]) => [k, semantic(v, year, k)] as const)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "0" && !(Array.isArray(v) && v.length === 0)));
  if (typeof value === "string") {
    if (/ein|tin|ssn/i.test(key)) return value.replace(/\D/g, "");
    if (/^-?\d+(\.\d+)?$/.test(value)) return new Decimal(value).toString();
    return value.trim().replace(/\s+/g, " ").toUpperCase();
  }
  return value;
}
function day(value: string, year: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !value.startsWith(`${year}-`)) return error("actual calendar date must be in the selected year");
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return error("actual calendar date is impossible");
  return stamp / 86400000;
}
type Period = { from: string; through: string };
function checkedPeriods(periods: Period[], year: number): Array<{ from: number; through: number }> {
  let last = -Infinity;
  return periods.map(p => { const from = day(p.from, year); const through = day(p.through, year);
    if (from > through || from <= last) return error("source periods overlap or are not in actual chronological order");
    last = through; return { from, through }; });
}
function covers(periods: Array<{ from: number; through: number }>, from: number, through: number): boolean {
  let next = from;
  for (const p of periods) { if (p.through < next) continue; if (p.from > next) return false; next = p.through + 1; if (next > through) return true; }
  return false;
}
function deriveResidency(source: PAResidencySources, year: number) {
  const r = source.residency; reference(r.sourceReference);
  if (r.factsConfirmed !== true || r.status === "") return error("confirm actual complete domicile, abode and presence facts");
  const first = day(`${year}-01-01`, year), last = day(`${year}-12-31`, year);
  const periods = checkedPeriods(r.domicilePeriods, year);
  if (!periods.length || periods[0].from !== first || periods.at(-1)?.through !== last || periods.some((p, i) => i > 0 && p.from !== periods[i - 1].through + 1)) return error("actual domicile timeline must cover the whole selected year without gaps");
  if (periods.length > 2) return error("multiple domicile moves require their separate actual residency method");
  const paAbodes = checkedPeriods(r.paPermanentAbodePeriods, year), outsideAbodes = checkedPeriods(r.outsidePAPermanentAbodePeriods, year);
  let totalDays = 0;
  r.domicilePeriods.forEach((p, i) => { reference(p.state); if (!/^[A-Z]{2}$/.test(p.state) || !Number.isInteger(p.daysInPA) || p.daysInPA === null || p.daysInPA < 0 || p.daysInPA > periods[i].through - periods[i].from + 1) error("actual state and physical-presence day worksheet required for every domicile period"); totalDays += p.daysInPA as number; });
  let derived: PAResidencyStatus;
  if (periods.length === 1) {
    if (r.domicilePeriods[0].state === "PA") derived = paAbodes.length === 0 && covers(outsideAbodes, first, last) && totalDays <= 30 ? "nonresident" : "resident";
    else if (paAbodes.length > 0 && totalDays > 183) {
      if (!covers(paAbodes, first, last)) return error("partial-year statutory-abode composition needs its actual residency method");
      derived = "resident";
    } else derived = "nonresident";
  } else {
    if (r.moveAbandonmentNewDomicileAndPresenceConfirmed !== true || r.domicilePeriods.filter(p => p.state === "PA").length !== 1) return error("one actual PA domicile move requires abandonment, new domicile and physical-presence sources");
    const paIndex = r.domicilePeriods.findIndex(p => p.state === "PA"), pa = periods[paIndex], outside = periods[paIndex === 0 ? 1 : 0];
    if (!covers(paAbodes, pa.from, pa.through) || paAbodes.some(p => p.from <= outside.through && p.through >= outside.from)) return error("mixed statutory-abode/part-year residency requires its separate actual source method");
    derived = "part_year";
  }
  if (derived !== r.status) return error("claimed residency contradicts actual domicile, abode or day sources");
  // Principal residence for the actual school-district source is not inferred from domicile.
  if (!/^[A-Z]{2}$/.test(r.dec31PrincipalResidenceState)) return error("actual December31 principal-residence state is required");
  if (r.dec31PrincipalResidenceState === "PA") {
    if (!/^\d{5}$/.test(r.schoolDistrictCode) || r.schoolDistrictCode === "99999" || !r.schoolDistrictName.trim()) return error("actual December31 PA school district source is required");
  } else if (r.schoolDistrictCode !== "99999") return error("actual outside-PA December31 principal residence uses instructed school code99999");
  const residentPeriods = derived === "resident" ? [{ from: first, through: last }] : derived === "nonresident" ? [] : periods.filter((_, i) => r.domicilePeriods[i].state === "PA");
  return { status: derived, periods, residentPeriods };
}

export interface PAResidencySourcesResult {
  residencyStatus: PAResidencyStatus; schoolDistrictCode: string;
  compensation: Decimal; interest: Decimal; reportedCompensation: Decimal; reportedInterest: Decimal; excludedNonPACompensation: Decimal;
  excludedNonPAInterest: Decimal; totalOrdinaryPATaxableIncome: Decimal; taxBeforeCredits: Decimal;
  sourceCommitment: string; lines: CalculatedLine[];
}

export function calculatePAResidencySources(input: TaxYearInput, rawSources: unknown): PAResidencySourcesResult {
  const parsed = PAResidencySourcesSchema.safeParse(rawSources);
  if (!parsed.success) return error("actual source packet shape is incomplete or contains unsupported facts");
  const source = parsed.data, year = input.taxpayer?.taxYear;
  if (![2025, 2026].includes(year) || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true) return error("confirm actual sources for the supported selected year");
  reference(source.sourceReference);
  if (source.owner.accountHolder !== "primary" || input.taxpayer.filingStatus === "married_filing_jointly" || input.taxpayer.filingStatus === "married_filing_separately" || input.taxpayer.spouse !== undefined) return error("spouse/joint/separate/mixed residency requires its actual per-owner successor method");
  const owner = source.owner.originalTaxpayer, actual = input.taxpayer.primary;
  if (!owner || !/^\d{9}$/.test(owner.ssn.replace(/\D/g, "")) || stable(owner) !== stable({ firstName: actual.firstName, lastName: actual.lastName, ssn: actual.ssn })) return error("actual original owner identity does not match the current taxpayer");
  if (source.otherPAIncomeClassesConfirmedNone !== true || source.otherPAAdjustmentsConfirmedNone !== true) return error("confirm complete ordinary source scope; unknown other classes/adjustments are not zero");
  for (const key of ["w2s", "form1099Int", "form1099Div", "form1099B", "form1099Nec", "form1099Misc", "scheduleK1"] as const) if (!Array.isArray(input[key])) return error("complete current canonical document arrays are required before source derivation");
  for (const key of ["form1099Div", "form1099B", "form1099Nec", "form1099Misc", "scheduleK1", "form1099R", "formW2G", "form1099G", "form1099K", "form1099DA", "form1099OID", "form1099C", "form1099Q", "form1099SA", "formSSA1099", "formRRB1099", "rentalProperties", "homeSales", "savingsBondRedemptions", "scheduleK1Form1041", "paPassThroughStatements", "paScheduleJStatements", "paScheduleGLStatements"] as const) {
    const rows = input[key]; if (Array.isArray(rows) && rows.length) return error("additional retained income originals need their actual PA class source method");
  }
  if (input.scheduleC !== undefined || input.scheduleF !== undefined || input.cryptoIncome !== undefined || input.form4797 !== undefined || input.form6252.length || input.form6781 !== undefined || input.form8824.length) return error("additional retained income source needs its actual PA class source method");
  if (input.paResidentReturn !== undefined || input.paNonresidentReturn !== undefined) return error("retained PA override packet must be reconciled by the source-bound integration method");
  const residency = deriveResidency(source, year);
  const residentAt = (date: number) => residency.residentPeriods.some(p => p.from <= date && date <= p.through);
  const domicilePeriodAt = (date: number) => residency.periods.findIndex(p => p.from <= date && date <= p.through);
  let compensation = new Decimal(0), excludedCompensation = new Decimal(0), interest = new Decimal(0), excludedInterest = new Decimal(0);
  const verifyRows = (rows: PAResidencySources["wages"] | PAResidencySources["interest"], originals: unknown[], kind: "wage" | "interest") => {
    if (rows.length !== originals.length) return error("every current original must have exactly one source row, including known zero originals");
    const indices = new Set<number>(), identities = new Set<string>(), refs = new Set<string>();
    for (const row of rows) {
      const index = row.originalIndex;
      if (index === null || index < 0 || index >= originals.length || indices.has(index)) return error("unique complete original-index coverage is required");
      indices.add(index); reference(row.sourceReference);
      if (refs.has(row.sourceReference.trim())) return error("actual distinct original references are required"); refs.add(row.sourceReference.trim());
      if (row.sourceTaxYear !== year || row.sourceFactsConfirmed !== true || row.currentUncorrectedNonvoidOriginalConfirmed !== true || row.allOriginalBoxesKnownConfirmed !== true || !row.original) return error("actual original year/status/all-box facts must be explicitly confirmed");
      const current = originals[index] as Record<string, unknown>;
      if (!(kind === "wage" ? W2Schema.strict() : Form1099IntSchema.strict()).safeParse(current).success) return error("original source shape contains missing or unsupported facts/status");
      const monetaryKeys = kind === "wage" ? ["wages", "federalWithheld", "socialSecurityWages", "socialSecurityTips", "allocatedTips", "socialSecurityWithheld", "medicareWages", "medicareWithheld", "box10DependentCareBenefits", "stateTaxWithheld", "localWages", "localTaxWithheld", "stateWages", "box12CodeW", "box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE", "box12CodeT", "box12CodeTP", "box12CodeTT"]
        : ["interestIncome", "earlyWithdrawalPenalty", "usSavingsBondInterest", "federalWithheld", "foreignTaxPaid", "taxExemptInterest", "privateActivityBondInterest", "paDirectObligationInterest", "stateWithheld"];
      for (const key of monetaryKeys) if (current[key] !== undefined) amount(current[key]);
      if (stable(row.original) !== stable(current) || (current.taxYear !== undefined && current.taxYear !== year) || current.accountHolder !== "primary") return error("current original identity, source year, owner or content changed; reconfirm actual sources");
      const identity = stable(semantic(current, year)); if (identities.has(identity)) return error("indistinguishable duplicate original statements cannot be established by indices or free-text references"); identities.add(identity);
    }
  };
  verifyRows(source.wages, input.w2s, "wage"); verifyRows(source.interest, input.form1099Int, "interest");
  for (const row of source.wages) {
    if (row.ordinaryCashCompensationOnlyConfirmed !== true || row.noPAFederalCompensationDifferencesConfirmed !== true || !row.payroll.length) return error("actual ordinary cash payroll and PA/federal compensation facts required");
    const w2 = input.w2s[row.originalIndex as number];
    for (const key of ["box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeW", "box12CodeT", "box10DependentCareBenefits", "allocatedTips"] as const) if (w2[key] !== undefined && !amount(w2[key]).isZero()) return error("retained nonordinary PA/federal wage adjustment requires its actual source method");
    if (w2.militaryService?.activeDuty === true) return error("military compensation requires its actual PA source method");
    let gross = new Decimal(0), included = new Decimal(0), excluded = new Decimal(0);
    const references = new Set<string>();
    for (const payroll of row.payroll) {
      reference(payroll.sourceReference); if (references.has(payroll.sourceReference.trim())) return error("duplicate payroll-source reference"); references.add(payroll.sourceReference.trim());
      const paid = day(payroll.paidOn, year), from = day(payroll.serviceFrom, year), through = day(payroll.serviceThrough, year);
      if (from > through || domicilePeriodAt(from) !== domicilePeriodAt(through) || domicilePeriodAt(paid) !== domicilePeriodAt(from)) return error("cross-period or deferred compensation requires its actual source method");
      const total = amount(payroll.grossCompensation), pa = amount(payroll.paServicesCompensation), outside = amount(payroll.outsidePAServicesCompensation);
      if (!pa.plus(outside).eq(total)) return error("actual payroll PA/outside amounts must exactly reconcile gross; no missing residual");
      if (!residentAt(paid) && ["IN", "MD", "NJ", "OH", "VA", "WV"].includes(source.residency.domicilePeriods[domicilePeriodAt(paid)].state) && pa.gt(0)) return error("reciprocal compensation requires actual employee and owner exception sources before admission");
      gross = gross.plus(total); included = included.plus(residentAt(paid) ? total : pa); excluded = excluded.plus(residentAt(paid) ? 0 : outside);
    }
    if (!gross.eq(amount(w2.wages))) return error("actual payroll ledger does not reconcile current original W2 compensation");
    if (w2.state === "PA" && !amount(w2.stateWages).eq(included)) return error("PA payroll and original reported compensation differ; actual NRH/source correction required");
    compensation = compensation.plus(included); excludedCompensation = excludedCompensation.plus(excluded);
  }
  for (const row of source.interest) {
    if (row.ordinaryPersonalBankInterestConfirmed !== true || !row.credits.length) return error("actual nonbusiness bank-interest classification and dated credit ledger required");
    const original = input.form1099Int[row.originalIndex as number];
    for (const key of ["earlyWithdrawalPenalty", "usSavingsBondInterest", "foreignTaxPaid", "taxExemptInterest", "privateActivityBondInterest", "paDirectObligationInterest"] as const) if (original[key] !== undefined && !amount(original[key]).isZero()) return error("nonordinary interest boxes require their actual PA class/basis method");
    let gross = new Decimal(0); const references = new Set<string>();
    for (const credit of row.credits) {
      reference(credit.sourceReference); if (references.has(credit.sourceReference.trim())) return error("duplicate dated interest source reference"); references.add(credit.sourceReference.trim());
      const value = amount(credit.amount), received = day(credit.creditedOn, year); gross = gross.plus(value);
      if (residentAt(received)) interest = interest.plus(value); else excludedInterest = excludedInterest.plus(value);
    }
    if (!gross.eq(amount(original.interestIncome))) return error("actual dated bank credits do not reconcile original Box1");
  }
  const reportedCompensation = roundDollar(compensation), reportedInterest = roundDollar(interest);
  const taxable = reportedCompensation.plus(reportedInterest), tax = roundDollar(taxable.times("0.0307"));
  // The collector packet is the sole excluded key; all actual canonical facts remain privately bound.
  const originalInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "paResidencySources"));
  const commitment = bytesToHex(sha256(new TextEncoder().encode(stable({ version: "pa-ordinary-residency-v1", year, input: originalInput, rawSources }))));
  const audit = new AuditTrail();
  audit.record("PA-Residency-Sources", "compensation", "Actual ordinary taxable PA compensation", compensation, "Resident-period all-source plus nonresident-period actual PA services; complete original payroll reconciliation");
  audit.record("PA-Residency-Sources", "interest", "Actual ordinary taxable PA bank interest", interest, "Actual dated personal bank credits during resident periods; nonresident ordinary bank credits excluded");
  audit.record("PA-Residency-Sources", "reported-compensation", "Reported ordinary PA compensation", reportedCompensation, "Aggregate exact actual compensation class, then round once to whole dollars");
  audit.record("PA-Residency-Sources", "reported-interest", "Reported ordinary PA interest", reportedInterest, "Aggregate exact actual ordinary interest class, then round once to whole dollars");
  audit.record("PA-Residency-Sources", "ordinary-tax", "Ordinary PA tax before credits and payments", tax, "Sum reported whole-dollar classes, multiply by3.07%, then whole-dollar tax rounding; no credit/payment/penalty qualification");
  return { residencyStatus: residency.status, schoolDistrictCode: source.residency.schoolDistrictCode,
    compensation, interest, reportedCompensation, reportedInterest, excludedNonPACompensation: excludedCompensation, excludedNonPAInterest: excludedInterest,
    totalOrdinaryPATaxableIncome: taxable, taxBeforeCredits: tax, sourceCommitment: commitment, lines: audit.getLines() };
}
