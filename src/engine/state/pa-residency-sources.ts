import {calculatePAOrdinaryRoyaltySources,type PAOrdinaryRoyaltySourcesResult} from './pa-ordinary-royalty-sources.js';
import {calculatePARetirementSources,type PARetirementSourcesResult}from './pa-retirement-sources.js';
/** Source-derived ordinary PA residency/tax bases. Spec: spec/state/pa-residency-sources.yaml. */
import Decimal from "decimal.js";
import {calculatePAOrdinaryBrokerageSources,type PAOrdinaryBrokerageSourcesResult} from "./pa-ordinary-brokerage-sources.js";
import type {PAScheduleDResult} from "./pa-schedule-d.js";
import {calculatePAPersonalDebtAndForeignBankSources,type PAPersonalDebtAndForeignBankSourcesResult} from "./pa-personal-debt-foreign-sources.js";
import {calculatePAOrdinaryDigitalSources,type PAOrdinaryDigitalSourcesResult} from "./pa-ordinary-digital-sources.js";
import {calculatePAOrdinaryBusinessSources} from "./pa-ordinary-business-sources.js";
import type {PAScheduleCResult} from "./pa-schedule-c.js";
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from "./pa-ordinary-source-precision.js";
import {calculatePAOrdinaryOIDSources,type PAOrdinaryOIDSourcesResult} from "./pa-ordinary-oid-sources.js";
import { calculatePAOrdinaryEmployeeSources, type PAOrdinaryEmployeeSourcesResult } from "./pa-ordinary-employee-sources.js";
import { validateGuidedPAUnionDues } from "./pa-guided-union-dues.js";
import { calculateW2StateLocalSources } from "../forms/w2-state-local.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Form1099DivSchema, Form1099IntSchema, W2Schema, type TaxYearInput } from "@/models/inputs.js";
import { PAResidencySourcesSchema, type PAResidencySources, type PAResidencyStatus } from "@/models/pa-residency.js";
import { roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { calculatePAReciprocalCompensation } from "./pa-reciprocity.js";
import {calculatePAScheduleA,type PAScheduleAResult} from "./pa-schedule-a.js";
import {calculatePAScheduleB,type PAScheduleBResult} from "./pa-schedule-b.js";
import type { CalculatedLine } from "@/models/outputs.js";


const error = (detail: string): never => { throw new Error(`PA ordinary residency sources: ${detail}`); };
const reciprocalCompensationStates = new Set(["IN", "MD", "NJ", "OH", "VA", "WV"]);
function isPA2026OutboundDomicileChange(year: number, residency: PAResidencySources["residency"]): boolean {
  const periods = residency.domicilePeriods;
  return year === 2026 && periods.length === 2 && periods[0].state === "PA" && periods[1].state === "NY";
}

/** Completion accounts do not distinguish reciprocal-state residents from other account holders. */
export function validatePAOutboundNonresidentJurisdictions(input: TaxYearInput, jurisdictions: ReadonlyArray<{ state: string }>): void {
  const residency = input.paResidencySources?.residency;
  if (residency?.status === "nonresident" && isPA2026OutboundDomicileChange(input.taxpayer.taxYear, residency)
    && jurisdictions.some(({ state }) => reciprocalCompensationStates.has(state))) {
    error("the PA-to-New York nonresident draft has a reciprocal-state jurisdiction account; reconcile actual income-tax residency and reciprocal payroll first");
  }
}

function reference(value: unknown): void { if (typeof value !== "string" || !value.trim()) error("confirm the actual source reference"); }
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
  const statutoryNonresident = paAbodes.length === 0 && covers(outsideAbodes, first, last) && totalDays <= 30;
  let derived: PAResidencyStatus;
  let floridaMoveResident = false;
  let outboundMoveNonresident = false;
  if (periods.length === 1) {
    if (r.domicilePeriods[0].state === "PA") derived = statutoryNonresident ? "nonresident" : "resident";
    else if (paAbodes.length > 0 && totalDays > 183) {
      if (!covers(paAbodes, first, last)) return error("partial-year statutory-abode composition needs its actual residency method");
      derived = "resident";
    } else derived = "nonresident";
  } else {
    if (r.moveAbandonmentNewDomicileAndPresenceConfirmed !== true || r.domicilePeriods.filter(p => p.state === "PA").length !== 1) return error("one actual PA domicile move requires abandonment, new domicile and physical-presence sources");
    const paIndex = r.domicilePeriods.findIndex(p => p.state === "PA"), pa = periods[paIndex], outside = periods[paIndex === 0 ? 1 : 0];
    const matchingPAAbode = covers(paAbodes, pa.from, pa.through) && !paAbodes.some(p => p.from <= outside.through && p.through >= outside.from);
    if (paAbodes.length > 0 && totalDays >= 183) {
      // The Department's one-move guidance includes day 183. Section 301(p) uses more than 183 days.
      floridaMoveResident = year === 2026 && totalDays > 183 && r.status === "resident" && paIndex === 1
        && r.domicilePeriods[0].state === "FL" && r.dec31PrincipalResidenceState === "PA" && matchingPAAbode
        && covers(outsideAbodes, outside.from, outside.through) && outsideAbodes.every(p => p.through < pa.from);
      if (!floridaMoveResident) return error("one-move residency with a PA permanent abode and 183 or more confirmed PA days requires a separate residency method");
    }
    outboundMoveNonresident = isPA2026OutboundDomicileChange(year, r) && statutoryNonresident
      && outsideAbodes.length === 1 && r.dec31PrincipalResidenceState === "NY";
    if (!matchingPAAbode && !outboundMoveNonresident) return error("mixed statutory-abode/part-year residency requires its separate actual source method");
    derived = outboundMoveNonresident ? "nonresident" : floridaMoveResident ? "resident" : "part_year";
  }
  if (derived !== r.status) return error("claimed residency contradicts actual domicile, abode or day sources");
  // Principal residence for the actual school-district source is not inferred from domicile.
  if (!/^[A-Z]{2}$/.test(r.dec31PrincipalResidenceState)) return error("actual December31 principal-residence state is required");
  if (r.dec31PrincipalResidenceState === "PA") {
    if (!/^\d{5}$/.test(r.schoolDistrictCode) || r.schoolDistrictCode === "99999" || !r.schoolDistrictName.trim()) return error("actual December31 PA school district source is required");
  } else if (r.schoolDistrictCode !== "99999") return error("actual outside-PA December31 principal residence uses instructed school code99999");
  const residentPeriods = derived === "resident" ? [{ from: first, through: last }] : derived === "nonresident" ? [] : periods.filter((_, i) => r.domicilePeriods[i].state === "PA");
  return { status: derived, periods, residentPeriods, floridaMoveResident, outboundMoveNonresident, totalDays };
}

// Exact inert values inserted by PAResidentReturnSchema around a retained OID source.
// This does not qualify any other legacy method or replace actual source proof.
const oidLegacySchemaZeroKeys = new Set<string>(["unreimbursedExpenses", "otherDeductions", "creditFromPriorYear", "extensionPayment", "estimatedPayments", "nonresidentTaxWithheld", "nontaxableIncome", "additionalEligibilityIncome", "spouseEligibilityIncome", "estateTrustIncome", "otherCredits", "priorYearPATaxableIncome", "priorYearTaxForgivenessCredit", "useTax", "lateFilingOrPaymentPenalty", "latePaymentInterest"]);
const floridaMoveSourceKeys = new Set<keyof PAResidencySources>(["sourceTaxYear", "sourceReference", "sourceFactsConfirmed", "owner", "residency", "wages", "interest", "otherPAIncomeClassesConfirmedNone", "otherPAAdjustmentsConfirmedNone"]);

function reconcileOIDOverride(input:TaxYearInput,source:PAResidencySources,amount:(value:unknown)=>Decimal):void {
  if(input.paNonresidentReturn!==undefined)return error('retained PA nonresident override needs its actual source integration');
  const legacy=input.paResidentReturn;if(legacy===undefined)return;
  if(!source.oidAndMiscSources||Object.entries(legacy).some(([key,value])=>key!=='scheduleA'&&(!oidLegacySchemaZeroKeys.has(key)||value!=='0'))||!legacy.scheduleA||Object.keys(legacy.scheduleA).some(key=>key!=='oidSources'))return error('only the actual original-bound OID classification can reconcile a retained PA override');
  const rows=legacy.scheduleA.oidSources;if(!rows||rows.length!==input.form1099OID.length||new Set(rows.map(row=>row.sourceId)).size!==rows.length)return error('retained OID classification needs exact current original coverage');
  for(const row of rows){reference(row.sourceReference);const index=input.form1099OID.findIndex(original=>original.sourceId===row.sourceId),proof=source.oidAndMiscSources.oid.find(candidate=>candidate.originalIndex===index);
    if(index<0||!proof||row.factsConfirmed!==true||row.strippedBond!==false||row.strippedBondExemptInterest!==undefined||!amount(row.bondPremiumNettedOnStatement).isZero()||!amount(row.paBondPremiumAmortization).isZero()||row.paTaxTreatment!==(proof.classification==='direct_us_treasury'?'us_government':'taxable'))return error('retained PA OID classification contradicts the current actual investment source');
  }
}

export interface PAResidencySourcesResult {
  residencyStatus: PAResidencyStatus; schoolDistrictCode: string;
  compensation: Decimal; interest: Decimal; reportedCompensation: Decimal; reportedInterest: Decimal;
  dividends: Decimal; reportedDividends: Decimal; excludedNonPADividends: Decimal;
  scheduleA:PAScheduleAResult; scheduleB:PAScheduleBResult; excludedNonPACompensation: Decimal; excludedReciprocalCompensation: Decimal;
  excludedNonPAInterest: Decimal; totalOrdinaryPATaxableIncome: Decimal; taxBeforeCredits: Decimal;
  netBusinessIncome:Decimal;reportedBusinessIncome:Decimal;excludedNonPABusinessIncome:Decimal;actualPABusinessEarnedIncome:Decimal;businessPAWithholding:Decimal;
  scheduleC?:PAScheduleCResult;worldwideScheduleC?:PAScheduleCResult;
  royaltySources?:PAOrdinaryRoyaltySourcesResult;
  oidSources?:PAOrdinaryOIDSourcesResult;
  digitalSources?:PAOrdinaryDigitalSourcesResult;
  retirementSources?:PARetirementSourcesResult;
  brokerageSources?:PAOrdinaryBrokerageSourcesResult;
  reportedCapitalGainOrLoss:Decimal; scheduleD?:PAScheduleDResult;
  personalDebtSources?:PAPersonalDebtAndForeignBankSourcesResult;
  employeeSources?: PAOrdinaryEmployeeSourcesResult; unreimbursedEmployeeExpenses: Decimal; excludedNonPAEmployeeExpenses: Decimal; actualPAServiceCompensation?: Decimal;
  sourceCommitment: string; lines: CalculatedLine[];
}

export function calculatePAResidencySources(input: TaxYearInput, rawSources: unknown): PAResidencySourcesResult {
  const Money=Decimal.clone({precision:ordinarySourcePrecision(input,rawSources),rounding:Decimal.ROUND_HALF_UP});
function amount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return error("actual nonnegative monetary amount is missing or invalid; enter known zero explicitly");
  const result = new Money(value); if (!result.isFinite()) return error("nonfinite source amount"); return result;
}
  const parsed = PAResidencySourcesSchema.safeParse(rawSources);
  if (!parsed.success) return error("actual source packet shape is incomplete or contains unsupported facts");
  const source = parsed.data, year = input.taxpayer?.taxYear;
  if (source.employeeSources?.collectionMethod === "guided_union_dues_2025") validateGuidedPAUnionDues(input, source);
  if (![2025, 2026].includes(year) || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true) return error("confirm actual sources for the supported selected year");
  reference(source.sourceReference);
  if (source.owner.accountHolder !== "primary" || input.taxpayer.filingStatus === "married_filing_jointly" || input.taxpayer.filingStatus === "married_filing_separately" || input.taxpayer.spouse !== undefined) return error("spouse/joint/separate/mixed residency requires its actual per-owner successor method");
  const owner = source.owner.originalTaxpayer, actual = input.taxpayer.primary;
  if (!owner || !/^\d{9}$/.test(owner.ssn.replace(/\D/g, "")) || stable(owner) !== stable({ firstName: actual.firstName, lastName: actual.lastName, ssn: actual.ssn })) return error("actual original owner identity does not match the current taxpayer");
  if (source.otherPAIncomeClassesConfirmedNone !== true || source.otherPAAdjustmentsConfirmedNone !== true) return error("confirm complete ordinary source scope; unknown other classes/adjustments are not zero");
  for (const key of ["w2s", "form1099Int", "form1099Div", "form1099B", "form1099Nec", "form1099Misc", "scheduleK1"] as const) if (!Array.isArray(input[key])) return error("complete current canonical document arrays are required before source derivation");
  const personalDebtSources=calculatePAPersonalDebtAndForeignBankSources(input,{personalDebtDischarges:source.personalDebtDischarges,foreignBankTaxSources:source.foreignBankTaxSources});
  for (const key of ["scheduleK1", "formW2G", "form1099G", "form1099K", "form1099Q", "form1099SA", "formSSA1099", "formRRB1099", "rentalProperties", "homeSales", "savingsBondRedemptions", "scheduleK1Form1041", "paPassThroughStatements", "paScheduleJStatements", "paScheduleGLStatements"] as const) {
    const rows = input[key]; if (Array.isArray(rows) && rows.length) return error("additional retained income originals need their actual PA class source method");
  }
  if (input.scheduleF !== undefined || input.cryptoIncome !== undefined || input.form4797 !== undefined || input.form6252.length || input.form6781 !== undefined || input.form8824.length) return error("additional retained income source needs its actual PA class source method");

  reconcileOIDOverride(input,source,amount);
  const residency = deriveResidency(source, year);
  if (residency.outboundMoveNonresident) {
    if (input.taxpayer.stateResidency !== undefined && input.taxpayer.stateResidency !== "nonresident") {
      return error("reconcile the conflicting retained residency selection with the confirmed annual PA nonresident claim");
    }
    const r = source.residency, [abode] = r.outsidePAPermanentAbodePeriods;
    if (abode.state !== r.domicilePeriods[1].state || !abode.sourceReference?.trim()) {
      return error("enter the actual New York state and original reference for the sole year-round outside-PA permanent abode");
    }
    const reviews = r.outboundTaxResidencePeriods;
    if (reviews?.length !== r.domicilePeriods.length || reviews.some((row, index) => {
      const domicile = r.domicilePeriods[index];
      return row.from !== domicile.from || row.through !== domicile.through || !row.sourceReference.trim()
        || row.noReciprocalStateIncomeTaxResidenceConfirmed !== true;
    })) {
      return error("confirm from original records that the owner had no reciprocal-state income-tax residence in each exact domicile and payroll period");
    }
    if (input.paReciprocitySources !== undefined) return error("reconcile the retained reciprocal payroll sources before using the PA-to-New York nonresident draft");
  }
  if (residency.floridaMoveResident) {
    if (input.taxpayer.filingStatus !== "single" || input.w2s.length !== 1 || input.w2s[0].taxYear !== 2026) return error("the Florida move requires a single owner with one actual 2026 W-2");
    if (input.taxpayer.stateResidency !== undefined && input.taxpayer.stateResidency !== "full-year") return error("reconcile the conflicting retained residency selection with the confirmed full-year PA claim");
    if (source.residency.domicilePeriods.some(p => p.daysInPA === 0)) return error("PA services in both domicile periods require actual PA physical presence in each period");
    const hasSpecializedSources = Object.entries(source).some(([key, value]) => !floridaMoveSourceKeys.has(key as keyof PAResidencySources)
      && value !== undefined && (!Array.isArray(value) || value.length > 0));
    if (source.interest.length || input.form1099Int.length || hasSpecializedSources || input.paReciprocitySources !== undefined || input.paResidentReturn !== undefined) return error("the Florida move requires complete wage-only originals and no other PA adjustments");
  }
  const royaltySources=calculatePAOrdinaryRoyaltySources(input,source.royaltySources,residency);
  const remainingMisc=input.form1099Misc.map((original,index)=>({original,index})).filter(row=>!royaltySources.coveredOriginalIndices.includes(row.index));
  if((input.form1099OID.length||remainingMisc.length)&&source.oidAndMiscSources===undefined)return error("retained OID/MISC originals require their complete actual source method");
  const projectedInput={...input,form1099Misc:remainingMisc.map(row=>row.original)};
  let projectedOID=source.oidAndMiscSources;
  if(projectedOID&&royaltySources.coveredOriginalIndices.length){
    if(projectedOID.miscWithholding.some(row=>!remainingMisc.some(original=>original.index===row.originalIndex)))return error("OID/MISC and royalty source original coverage overlaps or is outside current originals");
    projectedOID={...projectedOID,miscWithholding:projectedOID.miscWithholding.map(row=>({...row,originalIndex:remainingMisc.findIndex(original=>original.index===row.originalIndex)}))};
  }
  const retirementSources=calculatePARetirementSources(input,source.retirementSources,residency);
  const business=calculatePAOrdinaryBusinessSources(
    source.businesses?.some(b=>b.pendingNYAccountSources!==undefined)
      ? {...input,paResidencySources:source} : input,
    source.businesses,residency);
  const digitalSources=calculatePAOrdinaryDigitalSources(input,source.digitalSources,residency);
  const brokerageSources=calculatePAOrdinaryBrokerageSources(input,source.brokerageSources,{status:residency.status,residentPeriods:residency.residentPeriods.map(p=>({from:new Date(p.from*86400000).toISOString().slice(0,10),through:new Date(p.through*86400000).toISOString().slice(0,10)}))});
  const hasBrokerage=source.brokerageSources!==undefined||input.form1099B.length>0;
  const reportedCapitalGainOrLoss=hasBrokerage?new Money(brokerageSources.rawGainOrLoss).plus(digitalSources.rawGainOrLoss).toDecimalPlaces(0,Decimal.ROUND_HALF_UP):digitalSources.reportedGainOrLoss;
  let scheduleD=brokerageSources.scheduleD??digitalSources.scheduleD;
  if(hasBrokerage&&digitalSources.scheduleD&&scheduleD){
    const capitalAudit=new AuditTrail();capitalAudit.record("PA-Schedule-D","digital-assets","Actual digital asset question",new Decimal(1),"Actual original direct digital disposition requires Yes");
    for(const line of ["1","3","12","12-taxpayer","12-pa40"])capitalAudit.record("PA-Schedule-D",line,"Actual combined same-owner capital class",publicOrdinaryMoney(reportedCapitalGainOrLoss),"Exact qualified security and digital source gains combined before one whole-dollar class rounding");
    scheduleD={...scheduleD,digitalAssetQuestionYes:true,line1:publicOrdinaryMoney(reportedCapitalGainOrLoss),line3:publicOrdinaryMoney(reportedCapitalGainOrLoss),line12:publicOrdinaryMoney(reportedCapitalGainOrLoss),taxpayerLine12:publicOrdinaryMoney(reportedCapitalGainOrLoss),reportableNetGainOrLoss:publicOrdinaryMoney(reportedCapitalGainOrLoss),lines:publicOrdinaryLines(capitalAudit.getLines())};
  }
  const residentAt = (date: number) => residency.residentPeriods.some(p => p.from <= date && date <= p.through);
  const domicilePeriodAt = (date: number) => residency.periods.findIndex(p => p.from <= date && date <= p.through);
  let compensation = new Money(0), excludedCompensation = new Money(0), interest = new Money(0), excludedInterest = new Money(0);
  const employeeSources = source.employeeSources === undefined ? undefined : calculatePAOrdinaryEmployeeSources(input, source.employeeSources);
  const actualEmployees = new Map(employeeSources?.perEmployer.map(row => [row.originalIndex, row]));
  if (employeeSources?.perEmployer.some(employee => employee.outsideBox16MealsPerDiem !== undefined)
    && (residency.status !== 'resident' || source.residency.domicilePeriods[0]?.state !== 'PA')) return error('excluded meals per diem requires a full-year Pennsylvania resident domiciliary');
  let unreimbursedEmployeeExpenses = new Money(0), excludedNonPAEmployeeExpenses = new Money(0), actualPAServiceCompensation = new Money(0), employeeNetTotal = new Money(0);
  const actualW2Rows = new Map<number, ReturnType<typeof calculateW2StateLocalSources>>();
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
      const packet = kind === "wage" ? current.stateLocalSources : undefined;
      if (packet !== undefined) actualW2Rows.set(index, calculateW2StateLocalSources(input, index, packet));
      const strictOriginal = packet === undefined ? current : Object.fromEntries(Object.entries(current).filter(([key]) => key !== "stateLocalSources"));
      if (!(kind === "wage" ? W2Schema.strict() : Form1099IntSchema.strict()).safeParse(strictOriginal).success) return error("original source shape contains missing or unsupported facts/status");
      const monetaryKeys = kind === "wage" ? ["wages", "federalWithheld", "socialSecurityWages", "socialSecurityTips", "allocatedTips", "socialSecurityWithheld", "medicareWages", "medicareWithheld", "box10DependentCareBenefits", "stateTaxWithheld", "localWages", "localTaxWithheld", "stateWages", "box12CodeW", "box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE", "box12CodeP", "box12CodeT", "box12CodeTP", "box12CodeTT"]
        : ["interestIncome", "earlyWithdrawalPenalty", "usSavingsBondInterest", "federalWithheld", "foreignTaxPaid", "taxExemptInterest", "privateActivityBondInterest", "paDirectObligationInterest", "stateWithheld"];
      for (const key of monetaryKeys) if (current[key] !== undefined) amount(current[key]);
      if (stable(row.original) !== stable(current) || (current.taxYear !== undefined && current.taxYear !== year) || current.accountHolder !== "primary") return error("current original identity, source year, owner or content changed; reconfirm actual sources");
      const identity = stable(semantic(current, year)); if (identities.has(identity)) return error("indistinguishable duplicate original statements cannot be established by indices or free-text references"); identities.add(identity);
    }
  };
  verifyRows(source.wages, input.w2s, "wage"); verifyRows(source.interest, input.form1099Int, "interest");
  const reciprocalPacket = (input as TaxYearInput & { paReciprocitySources?: unknown }).paReciprocitySources;
  const reciprocal = reciprocalPacket === undefined ? undefined : calculatePAReciprocalCompensation(input, source, reciprocalPacket);
  let excludedReciprocalCompensation = new Money(0);
  for (const row of source.wages) {
    if (row.ordinaryCashCompensationOnlyConfirmed !== true || !row.payroll.length) return error("actual ordinary cash payroll and PA/federal compensation facts required");
    const w2 = input.w2s[row.originalIndex as number];
    for (const key of ["box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeW", "box12CodeP", "box12CodeT", "box10DependentCareBenefits", "allocatedTips"] as const) if (w2[key] !== undefined && !amount(w2[key]).isZero()) return error("retained nonordinary PA/federal wage adjustment requires its actual source method");
    if (w2.box12CodeQ !== undefined && amount(w2.box12CodeQ).gt(0)) return error("reported combat pay requires its actual military compensation method");
    if (w2.militaryService?.activeDuty === true) return error("military compensation requires its actual PA source method");
    const employee = actualEmployees.get(row.originalIndex as number);
    const employeeOriginal = source.employeeSources?.employers.find(actual => actual.originalIndex === row.originalIndex);
    const hasTaxableReimbursements = employeeOriginal?.ue.reimbursements.some(record => record.method === "included_in_w2");
    const perDiem = employee?.outsideBox16MealsPerDiem;
    const hasPAOnlyExcess = perDiem?.rawAdditionalPACompensation.gt(0) ?? false;
    if (row.noPAFederalCompensationDifferencesConfirmed !== !hasPAOnlyExcess) return error("actual PA/federal compensation difference attestation must reconcile to the retained ordinary sources");
    if (perDiem && reciprocalPacket !== undefined) return error("excluded meals per diem with reciprocal compensation requires a separate source method");
    if (employee) {
      if (employee.payroll.length !== row.payroll.length || employee.employmentPeriods.some(period => domicilePeriodAt(day(period.from, year)) !== domicilePeriodAt(day(period.through, year))) || (residency.status === "part_year" && new Set(employee.employmentPeriods.map(period => domicilePeriodAt(day(period.from, year)))).size !== 1)) return error("actual employee employment crossing domicile periods requires its separate method");
      for (const [index, payroll] of row.payroll.entries()) {
        const derived = employee.payroll[index];
        if (!derived || payroll.paidOn !== derived.paidOn || payroll.serviceFrom !== derived.serviceFrom || payroll.serviceThrough !== derived.serviceThrough || !amount(payroll.grossCompensation).eq(derived.grossCompensation) || !amount(payroll.paServicesCompensation).eq(derived.paServicesCompensation) || !amount(payroll.outsidePAServicesCompensation).eq(derived.outsidePAServicesCompensation)) return error("actual calendar-derived payroll amounts/dates do not reconcile retained PA payroll; no free source override");
        if ((hasTaxableReimbursements || perDiem) && payroll.sourceReference !== employeeOriginal?.payroll[index]?.sourceReference) return error("verified reimbursement requires the same original payroll in the employee and residency sources");
      }
    }
    let gross = new Money(0), included = new Money(0), excluded = new Money(0), reciprocalExcluded = new Money(0);
    const references = new Set<string>();
    const paidDomicilePeriods = new Set<number>();
    for (const [payrollIndex, payroll] of row.payroll.entries()) {
      reference(payroll.sourceReference); if (references.has(payroll.sourceReference.trim())) return error("duplicate payroll-source reference"); references.add(payroll.sourceReference.trim());
      const paid = day(payroll.paidOn, year), from = day(payroll.serviceFrom, year), through = day(payroll.serviceThrough, year);
      if (from > through || domicilePeriodAt(from) !== domicilePeriodAt(through) || domicilePeriodAt(paid) !== domicilePeriodAt(from)) return error("cross-period or deferred compensation requires its actual source method");
      const total = amount(payroll.grossCompensation), pa = amount(payroll.paServicesCompensation), outside = amount(payroll.outsidePAServicesCompensation);
      if (!pa.plus(outside).eq(total)) return error("actual payroll PA/outside amounts must exactly reconcile gross; no missing residual");
      if (residency.floridaMoveResident) {
        if (!outside.isZero()) return error("the Florida move requires original compensation entirely from PA services");
        if (total.gt(0)) paidDomicilePeriods.add(domicilePeriodAt(paid));
      }
      if (!residentAt(paid) && reciprocalCompensationStates.has(source.residency.domicilePeriods[domicilePeriodAt(paid)].state) && pa.gt(0)) {
        const classification = reciprocal?.segments.find(s => s.originalIndex === row.originalIndex && s.payrollIndex === payrollIndex);
        if (!classification || !classification.excludedPACompensation.plus(classification.taxablePAServices).eq(pa)) return error("reciprocal compensation requires actual employee and owner exception sources before admission");
        reciprocalExcluded = reciprocalExcluded.plus(classification.excludedPACompensation);
      }
      gross = gross.plus(total); included = included.plus(residentAt(paid) ? total : pa); excluded = excluded.plus(residentAt(paid) ? 0 : outside);
    }
    if (!gross.eq(amount(w2.wages))) return error("actual payroll ledger does not reconcile current original W2 compensation");
    const actualRows = actualW2Rows.get(row.originalIndex as number);
    if (residency.outboundMoveNonresident && (actualRows
      ? actualRows.stateRows.some(row => reciprocalCompensationStates.has(row.state))
      : reciprocalCompensationStates.has(w2.state ?? ""))) {
      return error("reconcile the original reciprocal-state W-2 row before using the PA-to-New York nonresident draft");
    }
    if (residency.floridaMoveResident) {
      if (paidDomicilePeriods.size !== residency.periods.length) return error("the Florida move requires original PA payroll in both domicile periods");
      if (actualRows === undefined) {
        if (w2.state !== "PA" || w2.stateWages === undefined || w2.stateTaxWithheld === undefined) return error("the Florida move requires actual PA W-2 Boxes 16 and 17");
      } else if (actualRows.stateRows.length !== 1 || actualRows.stateRows[0].state !== "PA") {
        return error("the Florida move requires one actual PA W-2 state row");
      }
    }
    const reportedPAWages = actualRows === undefined ? (w2.state === "PA" ? amount(w2.stateWages) : undefined) : actualRows.stateRows.find(state => state.state === "PA")?.wages;
    if (reportedPAWages !== undefined && !reportedPAWages.eq(included)) {
      if (!employee) return error("PA payroll and original reported compensation differ; actual NRH/source correction required");
      if (!employeeOriginal) return error("actual original employer correction proof is missing");
      reference(employeeOriginal.statement.w2CorrectionExplanation);
    }
    if (employee) {
      if (hasTaxableReimbursements && reciprocalExcluded.gt(0)) return error("wage-included reimbursement with a reciprocal compensation exclusion requires its own source method");
      const firstPay = row.payroll[0]; if (!firstPay) return error("actual employee payroll is missing");
      const residentJob = residentAt(day(firstPay.paidOn, year));
      employee.residentPeriod = residentJob;
      const eligible = residentJob ? employee.scheduleUE.netUnreimbursedExpenses : employee.scheduleNRH?.line16;
      if (!eligible) return error("nonresident employee compensation requires its actual Schedule NRH");
      const reportedJobGross = roundDollar(included.minus(reciprocalExcluded)).plus(perDiem?.additionalPACompensation ?? 0);
      const deduction = Money.min(reportedJobGross, eligible);
      unreimbursedEmployeeExpenses = unreimbursedEmployeeExpenses.plus(deduction);
      employeeNetTotal = employeeNetTotal.plus(Money.max(0, reportedJobGross.minus(deduction)));
      const worldwideDeduction = Money.min(roundDollar(gross), employee.scheduleUE.netUnreimbursedExpenses);
      excludedNonPAEmployeeExpenses = excludedNonPAEmployeeExpenses.plus(Money.min(roundDollar(excluded.plus(reciprocalExcluded)), Money.max(0, worldwideDeduction.minus(deduction))));
      actualPAServiceCompensation = actualPAServiceCompensation.plus(Money.max(0, new Money(employee.rawPAServiceCompensation).plus(perDiem?.rawAdditionalPACompensation ?? 0).minus(employee.rawPAAllowableExpenses).minus(reciprocalExcluded)));
    }
    compensation = compensation.plus(included.minus(reciprocalExcluded)).plus(perDiem?.rawAdditionalPACompensation ?? 0); excludedCompensation = excludedCompensation.plus(excluded); excludedReciprocalCompensation = excludedReciprocalCompensation.plus(reciprocalExcluded);
  }
  for (const row of source.interest) {
    if (row.ordinaryPersonalBankInterestConfirmed !== true || !row.credits.length) return error("actual nonbusiness bank-interest classification and dated credit ledger required");
    const original = input.form1099Int[row.originalIndex as number];
    for (const key of ["earlyWithdrawalPenalty", "usSavingsBondInterest", "taxExemptInterest", "privateActivityBondInterest", "paDirectObligationInterest"] as const) if (original[key] !== undefined && !amount(original[key]).isZero()) return error("nonordinary interest boxes require their actual PA class/basis method");
    let gross = new Money(0); const references = new Set<string>();
    for (const credit of row.credits) {
      reference(credit.sourceReference); if (references.has(credit.sourceReference.trim())) return error("duplicate dated interest source reference"); references.add(credit.sourceReference.trim());
      const value = amount(credit.amount), received = day(credit.creditedOn, year); gross = gross.plus(value);
      if (residentAt(received)) interest = interest.plus(value); else excludedInterest = excludedInterest.plus(value);
    }
    if (!gross.eq(amount(original.interestIncome))) return error("actual dated bank credits do not reconcile original Box1");
  }
  // Each actual personal distribution original is covered exactly once, including known zero.
  const dividendSources=source.dividends??[];
  if(dividendSources.length!==input.form1099Div.length)return error("complete actual dividend original coverage is required");
  const dividendIndices=new Set<number>(),dividendIdentities=new Set<string>(),dividendReferences=new Set<string>();
  let ordinaryDividends=new Money(0),capitalDistributions=new Money(0),dividends=new Money(0),excludedNonPADividends=new Money(0);
  for(const row of dividendSources){
    reference(row.sourceReference);const index=row.originalIndex;
    if(index===null||index<0||index>=input.form1099Div.length||dividendIndices.has(index))return error("unique complete dividend original indices are required");
    dividendIndices.add(index);
    if(dividendReferences.has(row.sourceReference.trim()))return error("duplicate actual dividend source reference");dividendReferences.add(row.sourceReference.trim());
    if(row.sourceTaxYear!==year||row.sourceFactsConfirmed!==true||row.ordinaryPersonalDividendIncomeConfirmed!==true||row.capitalDistributionsFromRegulatedInvestmentCompanyConfirmed!==true||row.noOtherPADividendAdjustmentsConfirmed!==true||row.currentUncorrectedNonvoidOriginalConfirmed!==true||row.allOriginalBoxesKnownConfirmed!==true||!row.original)return error("actual ordinary personal dividend classification and complete current original facts are required");
    const current=input.form1099Div[index];
    if(!Form1099DivSchema.strict().safeParse(current).success||stable(row.original)!==stable(current)||current.taxYear!==year||current.accountHolder!=="primary")return error("actual dividend original owner/year/identity is missing or stale");
    reference(current.payer);
    const economicIdentity=stable(semantic(current,year));if(dividendIdentities.has(economicIdentity))return error("duplicate economic dividend original");dividendIdentities.add(economicIdentity);
    for(const key of ["ordinaryDividends","qualifiedDividends","totalCapitalGainDistributions","section1250Gain","section1202Gain","collectiblesGain","nondividendDistributions","federalWithheld","section199ADividends","foreignTaxPaid","exemptInterestDividends","specifiedPrivateActivityBondInterest","stateWithheld"] as const)amount(current[key]);
    const paExemptAllocation=current.paExemptInterestDividendAllocation===undefined&&amount(current.exemptInterestDividends).isZero()&&row.noOtherPADividendAdjustmentsConfirmed===true?new Money(0):amount(current.paExemptInterestDividendAllocation);
    if(amount(current.qualifiedDividends).gt(amount(current.ordinaryDividends)))return error("qualified dividend subset contradicts actual original ordinary income");
    for(const key of ["section1250Gain","section1202Gain","collectiblesGain","nondividendDistributions","section199ADividends","foreignTaxPaid","exemptInterestDividends","specifiedPrivateActivityBondInterest"] as const)if(!amount(current[key]).isZero())return error("actual special dividend source class or adjustment requires its successor");
    if(!paExemptAllocation.isZero())return error("actual PA dividend allocation contradicts this qualified zero-Box12 source method");
    if(amount(current.stateWithheld).gt(0)&&current.state!=="PA")return error("actual outside or unknown jurisdiction dividend withholding requires its source successor");
    if(!row.credits.length)return error("actual complete dated dividend distribution ledger is required");
    let originalOrdinary=new Money(0),originalCapital=new Money(0);const refs=new Set<string>();
    for(const credit of row.credits){reference(credit.sourceReference);if(refs.has(credit.sourceReference.trim()))return error("duplicate actual dividend distribution source reference");refs.add(credit.sourceReference.trim());
      const received=day(credit.creditedOn,year),ordinary=amount(credit.ordinaryDividends),capital=amount(credit.capitalGainDistributions);
      originalOrdinary=originalOrdinary.plus(ordinary);originalCapital=originalCapital.plus(capital);
      if(residentAt(received))dividends=dividends.plus(ordinary).plus(capital);else excludedNonPADividends=excludedNonPADividends.plus(ordinary).plus(capital);
    }
    if(!originalOrdinary.eq(amount(current.ordinaryDividends))||!originalCapital.eq(amount(current.totalCapitalGainDistributions)))return error("actual dated distributions do not reconcile complete current original Box1a and Box2a");
    ordinaryDividends=ordinaryDividends.plus(originalOrdinary);capitalDistributions=capitalDistributions.plus(originalCapital);
  }
  const oidSources=projectedOID===undefined?undefined:calculatePAOrdinaryOIDSources(projectedInput,projectedOID,residency.residentPeriods.map(p=>({from:new Date(p.from*86400000).toISOString().slice(0,10),through:new Date(p.through*86400000).toISOString().slice(0,10)})));
  if(oidSources){interest=interest.plus(oidSources.taxableInterest);excludedInterest=excludedInterest.plus(oidSources.excludedNonresidentInterest);}
  const governmentInterest=oidSources?.worldwideExemptInterest??new Money(0);
  const scheduleA=calculatePAScheduleA({taxYear:year,federalInterestIncome:interest.plus(excludedInterest).plus(governmentInterest),usGovernmentInterest:governmentInterest,reductionAdjustments:excludedInterest.gt(0)?[{description:"Non-Residency Period Interest",amount:excludedInterest}]:[]});
  const scheduleB=calculatePAScheduleB({taxYear:year,federalDividendIncome:ordinaryDividends,capitalGainDistributions:capitalDistributions,reductionAdjustments:excludedNonPADividends.gt(0)?[{description:"Non-Residency Period Ordinary and Capital Gain Distributions",amount:excludedNonPADividends}]:[]});
  const publicScheduleB:PAScheduleBResult={...scheduleB,
    line1:publicOrdinaryMoney(scheduleB.line1),
    line2:publicOrdinaryMoney(scheduleB.line2),
    line3:publicOrdinaryMoney(scheduleB.line3),
    line4:publicOrdinaryMoney(scheduleB.line4),
    line5:publicOrdinaryMoney(scheduleB.line5),
    line6:publicOrdinaryMoney(scheduleB.line6),
    line7:publicOrdinaryMoney(scheduleB.line7),
    line8:publicOrdinaryMoney(scheduleB.line8),
    line9a:publicOrdinaryMoney(scheduleB.line9a),
    line9b:publicOrdinaryMoney(scheduleB.line9b),
    line9c:publicOrdinaryMoney(scheduleB.line9c),
    line10:publicOrdinaryMoney(scheduleB.line10),
    line11:publicOrdinaryMoney(scheduleB.line11),
    line12:publicOrdinaryMoney(scheduleB.line12),
    additionAdjustments:scheduleB.additionAdjustments.map(entry=>({...entry,amount:publicOrdinaryMoney(entry.amount)})),reductionAdjustments:scheduleB.reductionAdjustments.map(entry=>({...entry,amount:publicOrdinaryMoney(entry.amount)})),lines:publicOrdinaryLines(scheduleB.lines)};
  const reportedCompensation = roundDollar(compensation), reportedInterest = scheduleA.line16,reportedDividends=scheduleB.line12;
  if (employeeSources && !reportedCompensation.minus(unreimbursedEmployeeExpenses).eq(employeeNetTotal)) return error("actual per-employer versus aggregate printed compensation precision requires its separate method");
  const taxable = Money.max(0,new Money(reportedCompensation).minus(unreimbursedEmployeeExpenses)).plus(reportedInterest).plus(reportedDividends).plus(Money.max(business.reportedBusinessIncome,0)).plus(Money.max(reportedCapitalGainOrLoss,0)).plus(royaltySources.reportedIncome), tax = roundDollar(taxable.times("0.0307"));
  // The collector packet is the sole excluded key; all actual canonical facts remain privately bound.
  const originalInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "paResidencySources"));
  const commitment = bytesToHex(sha256(new TextEncoder().encode(stable({ version: "pa-ordinary-residency-v1", year, input: originalInput, rawSources }))));
  const audit = new AuditTrail();
  if (residency.floridaMoveResident) audit.record("PA-Residency-Sources", "florida-move-residency", "Confirmed PA physical-presence days", new Money(residency.totalDays), "One Florida-to-PA domicile move, confirmed permanent PA abode and more than 183 PA days; apply the full-year PA wage basis");
  if (residency.outboundMoveNonresident) audit.record("PA-Residency-Sources", "outbound-move-statutory-nonresident", "Confirmed PA physical-presence days", new Money(residency.totalDays), "One PA-to-New York domicile move, a year-round outside permanent abode, no PA permanent abode and no more than 30 PA days; apply PA-source rules for the whole year");
  audit.record("PA-Residency-Sources", "compensation", "Actual ordinary taxable PA compensation", compensation, "Resident-period all-source plus nonresident-period actual PA services, less actual reciprocal employee exclusions; complete original payroll reconciliation");
  audit.record("PA-Residency-Sources", "interest", "Actual ordinary taxable PA bank interest", interest, "Actual dated personal bank credits during resident periods; nonresident ordinary bank credits excluded");
  audit.record("PA-Residency-Sources", "reported-compensation", "Reported ordinary PA compensation", reportedCompensation, "Aggregate exact actual compensation class, then round once to whole dollars");
  audit.record("PA-Residency-Sources", "reported-interest", "Reported ordinary PA interest", reportedInterest, "Replay official Schedule A line totals, preserving included/excluded source cents separately");
  audit.merge(scheduleA.lines);audit.merge(scheduleB.lines);audit.merge(business.lines);
  if (employeeSources) audit.merge(employeeSources.lines);
  audit.merge(retirementSources.lines);audit.merge(royaltySources.lines);
  if(hasBrokerage)audit.merge(brokerageSources.lines);
  if(source.personalDebtDischarges!==undefined||source.foreignBankTaxSources!==undefined)audit.merge(personalDebtSources.lines);
  audit.record("PA-Residency-Sources","dividends","Actual ordinary PA personal dividend distributions",dividends,"Actual received/credited distributions during confirmed resident periods; exact outside-period distributions excluded");
  audit.record("PA-Residency-Sources", "ordinary-tax", "Ordinary PA tax before credits and payments", tax, "Sum reported whole-dollar classes, multiply by3.07%, then whole-dollar tax rounding; no credit/payment/penalty qualification");
  return { residencyStatus:residency.status,schoolDistrictCode:source.residency.schoolDistrictCode,
    ...((source.personalDebtDischarges!==undefined||source.foreignBankTaxSources!==undefined)?{personalDebtSources}:{}),
    ...(hasBrokerage?{brokerageSources}:{}),reportedCapitalGainOrLoss:publicOrdinaryMoney(reportedCapitalGainOrLoss),...(scheduleD?{scheduleD}:{}),
    compensation:publicOrdinaryMoney(compensation),interest:publicOrdinaryMoney(interest),reportedCompensation:publicOrdinaryMoney(reportedCompensation),reportedInterest:publicOrdinaryMoney(reportedInterest),dividends:publicOrdinaryMoney(dividends),reportedDividends:publicOrdinaryMoney(reportedDividends),excludedNonPADividends:publicOrdinaryMoney(excludedNonPADividends),scheduleA,scheduleB:publicScheduleB,
    ...(employeeSources?{employeeSources,actualPAServiceCompensation:publicOrdinaryMoney(actualPAServiceCompensation)}:{}),unreimbursedEmployeeExpenses:publicOrdinaryMoney(unreimbursedEmployeeExpenses),excludedNonPAEmployeeExpenses:publicOrdinaryMoney(excludedNonPAEmployeeExpenses),
    netBusinessIncome:business.netBusinessIncome,reportedBusinessIncome:business.reportedBusinessIncome,excludedNonPABusinessIncome:business.excludedNonPABusinessIncome,actualPABusinessEarnedIncome:business.actualPABusinessEarnedIncome,businessPAWithholding:business.paWithholding,...(business.scheduleC?{scheduleC:business.scheduleC,worldwideScheduleC:business.worldwideScheduleC}:{}),
    excludedNonPACompensation:publicOrdinaryMoney(excludedCompensation),excludedReciprocalCompensation:publicOrdinaryMoney(excludedReciprocalCompensation),excludedNonPAInterest:publicOrdinaryMoney(excludedInterest),totalOrdinaryPATaxableIncome:publicOrdinaryMoney(taxable),taxBeforeCredits:publicOrdinaryMoney(tax),oidSources,...(source.digitalSources!==undefined||input.form1099DA.length?{digitalSources}:{}),...(source.retirementSources!==undefined||input.form1099R?.length?{retirementSources}:{}),...(source.royaltySources!==undefined?{royaltySources}:{}),sourceCommitment:commitment,lines:publicOrdinaryLines([...audit.getLines(),...(oidSources?.lines??[]),...digitalSources.lines]) };
}
