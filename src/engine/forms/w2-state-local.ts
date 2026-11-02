/** Original-bound source mapping only. Spec: spec/federal/w2-state-local.yaml. */
import Decimal from "decimal.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { W2Schema, type TaxYearInput } from "@/models/inputs.js";
import { W2StateLocalSourcesSchema } from "@/models/w2-state-local.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
const error = (detail: string): never => { throw new Error(`W-2 actual row sources: ${detail}`); };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function amount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return error("actual nonnegative amount required; enter verified zero explicitly");
  const result = new Decimal(value); if (!result.isFinite()) return error("nonfinite original amount"); return result;
}
function reference(value: string): void { if (!value.trim()) error("actual private original or printed-row reference required"); }
function originalOnly(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "stateLocalSources")); }
function semantic(value: unknown, year: number, key = ""): unknown {
  if (Array.isArray(value)) return [...new Map(value.map(v => { const normalized = semantic(v, year); return [stable(normalized), normalized]; })).values()].sort((a, b) => stable(a).localeCompare(stable(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !["stateLocalSources", "accountHolder", "taxYear", "state", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld", "locality", "localityName", ...(year === 2025 ? ["box12CodeTP", "box12CodeTT", "treasuryTippedOccupationCodes"] : [])].includes(k))
    .map(([k, v]) => [k, semantic(v, year, k)] as const).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "0" && !(Array.isArray(v) && !v.length)));
  if (typeof value === "string") { if (/ein|ssn|tin/i.test(key)) return value.replace(/\D/g, ""); if (/^-?\d+(\.\d+)?$/.test(value)) return new Decimal(value).toString(); return value.trim().replace(/\s+/g, " ").toUpperCase(); }
  return value;
}
function checkCount(mode: string, count: number): void {
  if (!(mode === "none" && count === 0 || mode === "single" && count === 1 || mode === "multiple" && count === 2)) error("actual none/single/multiple reporting must match complete zero/one/two printed rows");
}
function knownText(status: string, value: string): void {
  if (!(status === "reported" && value.trim() || status === "blank_original" && !value.trim())) error("reported or actual blank-original identity must be explicit and consistent; unknown is not blank");
}
export interface W2StateLocalSourcesResult {
  federalWages: Decimal; federalWithheld: Decimal;
  stateRows: Array<{ printedRow: number; state: "PA" | "OH"; wages: Decimal; withheld: Decimal }>;
  localRows: Array<{ printedRow: number; localityNameStatus: "reported" | "blank_original"; wages: Decimal; withheld: Decimal }>;
  totalStateWithheld: Decimal; totalLocalWithheld: Decimal; sourceCommitment: string; lines: CalculatedLine[];
}
/** Does not calculate state/local liability, deductibility, resident credit or filing eligibility. */
export function calculateW2StateLocalSources(input: TaxYearInput, index: number, rawSources: unknown): W2StateLocalSourcesResult {
  const parsed = W2StateLocalSourcesSchema.safeParse(rawSources);
  if (!parsed.success) return error("complete actual source packet shape required");
  const source = parsed.data, year = input.taxpayer.taxYear, w2 = input.w2s[index];
  if (!Number.isInteger(index) || index < 0 || !w2 || ![2025, 2026].includes(year) || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true) return error("confirm actual selected owner, original index and supported source year");
  reference(source.sourceReference);
  if (source.currentUncorrectedNonvoidOriginalConfirmed !== true || source.allOriginalBoxesKnownConfirmed !== true || source.singleOriginalWithoutContinuationConfirmed !== true || source.allOriginalPagesAndCopiesCheckedConfirmed !== true) return error("actual current nonvoid/uncorrected original, all boxes/copies and no continuation must be checked; additional/corrected sources need their actual method");
  const holder = source.owner.accountHolder;
  const owner = holder === "primary" ? input.taxpayer.primary : holder === "spouse" ? input.taxpayer.spouse : undefined;
  if (!owner || w2.accountHolder !== holder || holder === "spouse" && input.taxpayer.filingStatus !== "married_filing_jointly" || !/^\d{9}$/.test(owner.ssn.replace(/\D/g, "")) || stable(source.owner.originalTaxpayer) !== stable({ firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn })) return error("actual original owner identity does not match the current taxpayer");
  const current = originalOnly(w2 as Record<string, unknown>);
  const canonicalPacket = (w2 as typeof w2 & { stateLocalSources?: unknown }).stateLocalSources;
  if (canonicalPacket !== undefined && stable(canonicalPacket) !== stable(rawSources)) return error("caller proof contradicts the actual retained canonical source packet");
  if (!W2Schema.strict().safeParse(current).success || stable(source.originalW2) !== stable(current) || w2.taxYear !== undefined && w2.taxYear !== year) return error("current full original identity, year or content changed; explicitly reconfirm actual source");
  const identity = stable(semantic(current, year));
  for (const [otherIndex, other] of input.w2s.entries()) if (otherIndex !== index && stable(semantic(other, year)) === identity && (!other.accountHolder || other.accountHolder === holder)) return error("indistinguishable duplicate federal economic originals or continuation copies require their actual source method, not extra W-2 income");
  for (const [key, value] of Object.entries(current)) if (typeof value === "string" && /wages|withheld|tips|benefits|box12Code/i.test(key)) amount(value);
  checkCount(source.stateReporting, source.stateRows.length); checkCount(source.localReporting, source.localRows.length);
  const checkedPositions = (rows: Array<{ printedRow: number | null; sourceReference: string }>) => {
    let last = 0; for (const row of rows) { reference(row.sourceReference); if (row.printedRow === null || ![1, 2].includes(row.printedRow) || row.printedRow <= last) return error("actual unique printed row positions must be entered in original order"); last = row.printedRow; }
  };
  checkedPositions(source.stateRows); checkedPositions(source.localRows);
  const states = new Set<string>();
  const stateRows = source.stateRows.map(row => {
    if (!row.state || states.has(row.state)) return error("actual distinct PA/OH state rows required; repeated/other-state rows need their source method"); states.add(row.state);
    knownText(row.employerStateIDStatus, row.employerStateID);
    return { printedRow: row.printedRow as number, state: row.state, wages: amount(row.wages), withheld: amount(row.withheld) };
  });
  const localIdentities = new Set<string>();
  const localRows = source.localRows.map(row => {
    knownText(row.localityNameStatus, row.localityName);
    const wages = amount(row.wages), withheld = amount(row.withheld);
    const localIdentity = stable({ name: row.localityName.trim().replace(/\s+/g, " ").toUpperCase(), wages: wages.toString(), withheld: withheld.toString() });
    if (localIdentities.has(localIdentity)) return error("indistinguishable duplicated local rows cannot establish additional withholding through references or row numbers"); localIdentities.add(localIdentity);
    return { printedRow: row.printedRow as number, localityNameStatus: row.localityNameStatus as "reported" | "blank_original", wages, withheld };
  });
  const eq = (value: unknown, expected: Decimal) => value === undefined ? expected.isZero() : amount(value).eq(expected);
  const blank = (value: unknown) => value === undefined || typeof value === "string" && !value.trim();
  if (source.legacyScalarProjection === "unused") {
    if (!blank(w2.state) || !eq(w2.stateWages, new Decimal(0)) || !eq(w2.stateTaxWithheld, new Decimal(0)) || !eq(w2.localWages, new Decimal(0)) || !eq(w2.localTaxWithheld, new Decimal(0)) || !blank(w2.localityName) || !blank(w2.locality)) return error("unused legacy scalar projection contradicts retained state/local facts; reconcile explicitly");
  } else if (source.legacyScalarProjection === "first_entered_rows") {
    const state = stateRows[0], local = localRows[0], localOriginal = source.localRows[0];
    if ((state ? w2.state !== state.state : !blank(w2.state)) || !eq(w2.stateWages, state?.wages ?? new Decimal(0)) || !eq(w2.stateTaxWithheld, state?.withheld ?? new Decimal(0)) || !eq(w2.localWages, local?.wages ?? new Decimal(0)) || !eq(w2.localTaxWithheld, local?.withheld ?? new Decimal(0))) return error("legacy state/local scalar projection must match actual first entered rows exactly");
    const expected = localOriginal?.localityName ?? "";
    for (const label of [w2.localityName, w2.locality]) if (label !== undefined && label !== expected) return error("legacy scalar locality identity conflicts with actual original row");
    if (expected && w2.localityName === undefined && w2.locality === undefined) return error("actual first-row legacy locality projection missing");
  } else return error("actual legacy scalar projection disposition must be explicit");
  const totalStateWithheld = stateRows.reduce((sum, row) => sum.plus(row.withheld), new Decimal(0));
  const totalLocalWithheld = localRows.reduce((sum, row) => sum.plus(row.withheld), new Decimal(0));
  const sourceCommitment = bytesToHex(sha256(new TextEncoder().encode(stable({ version: "w2-state-local-source-v1", year, index, input, rawSources }))));
  const audit = new AuditTrail();
  audit.record("W2-State-Local-Sources", "reported-state-withholding", "Actual distinct reported state withholding", totalStateWithheld, "Sum each admitted printed row once; no extra legacy scalar credit or state liability claim");
  audit.record("W2-State-Local-Sources", "reported-local-withholding", "Actual distinct reported local withholding", totalLocalWithheld, "Actual printed source amounts only; no inferred jurisdiction, rate, resident credit or deductibility");
  return { federalWages: amount(w2.wages), federalWithheld: amount(w2.federalWithheld), stateRows, localRows, totalStateWithheld, totalLocalWithheld, sourceCommitment, lines: audit.getLines() };
}
