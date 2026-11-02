/** Source-derived ordinary PA residency/tax bases. Spec: spec/state/pa-residency-sources.yaml. */
import Decimal from "decimal.js";
import { calculateW2StateLocalSources } from "../forms/w2-state-local.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { W2Schema, type TaxYearInput } from "@/models/inputs.js";
import { PAResidencySourcesSchema, type PAResidencySources, type PAResidencyStatus } from "@/models/pa-residency.js";
import { PAReciprocitySourcesSchema } from "@/models/pa-reciprocity.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

const error = (detail: string): never => { throw new Error(`PA reciprocal sources: ${detail}`); };
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

export interface PAReciprocalCompensationResult {
 totalExcludedPACompensation:Decimal; paWithheldFromCoveredOriginals:Decimal;
 segments:Array<{originalIndex:number;payrollIndex:number;excludedPACompensation:Decimal;taxablePAServices:Decimal}>;
 originals:Array<{originalIndex:number;actualPAWithheld:Decimal;refundSupportStatus:"unknown_request"|"not_requested"|"no_PA_withholding"|"complete"|"pending_documents"}>;
 sourceCommitment:string; lines:CalculatedLine[];
}
/** Classifies actual employee sources only; no return settlement or extra withholding credit. */
export function calculatePAReciprocalCompensation(input:TaxYearInput, rawOrdinary:unknown, rawProof:unknown):PAReciprocalCompensationResult {
 const ordinary = PAResidencySourcesSchema.safeParse(rawOrdinary), parsed = PAReciprocitySourcesSchema.safeParse(rawProof);
 if (!ordinary.success || !parsed.success) return error("actual ordinary and reciprocal source packet shapes required");
 const source=ordinary.data, proof=parsed.data, year=input.taxpayer.taxYear;
 if (![2025,2026].includes(year) || source.sourceTaxYear!==year || proof.sourceTaxYear!==year || source.sourceFactsConfirmed!==true || proof.sourceFactsConfirmed!==true) return error("confirm both actual source years and headers");
 reference(source.sourceReference);reference(proof.sourceReference);
 const actual=input.taxpayer.primary, identity={firstName:actual.firstName,lastName:actual.lastName,ssn:actual.ssn};
 if(input.taxpayer.spouse || ["married_filing_jointly","married_filing_separately"].includes(input.taxpayer.filingStatus) || source.owner.accountHolder!=="primary" || proof.owner.accountHolder!=="primary" || !/^\d{9}$/.test(actual.ssn.replace(/\D/g,"")) || stable(source.owner.originalTaxpayer)!==stable(identity) || stable(proof.owner.originalTaxpayer)!==stable(identity)) return error("actual single owner identity must match both private originals");
 const residency=deriveResidency(source,year);
 if (!Array.isArray(input.w2s) || source.wages.length!==input.w2s.length) return error("complete unique original wage coverage required");
 const seen=new Set<number>(), identities=new Set<string>(), references=new Set<string>();
 const actualW2Rows=new Map<number,ReturnType<typeof calculateW2StateLocalSources>>();
 const relevant=new Map<string,{originalIndex:number;payrollIndex:number;pa:Decimal;state:string}>();
 for(const row of source.wages){
  const i=row.originalIndex;
  if(i===null || i<0 || i>=input.w2s.length || seen.has(i)) return error("unique complete actual original indices required"); seen.add(i);
  reference(row.sourceReference);if(references.has(row.sourceReference.trim())) return error("distinct actual original references required");references.add(row.sourceReference.trim());
  const w2=input.w2s[i];
  const packet=(w2 as typeof w2 & {stateLocalSources?:unknown}).stateLocalSources;
  if(packet!==undefined) actualW2Rows.set(i,calculateW2StateLocalSources(input,i,packet));
  const strictOriginal=packet===undefined?w2:Object.fromEntries(Object.entries(w2).filter(([key])=>key!=="stateLocalSources"));
  if(!W2Schema.strict().safeParse(strictOriginal).success || row.sourceTaxYear!==year || row.sourceFactsConfirmed!==true || row.currentUncorrectedNonvoidOriginalConfirmed!==true || row.allOriginalBoxesKnownConfirmed!==true || row.ordinaryCashCompensationOnlyConfirmed!==true || row.noPAFederalCompensationDifferencesConfirmed!==true || w2.accountHolder!=="primary" || (w2.taxYear!==undefined && w2.taxYear!==year) || stable(row.original)!==stable(w2)) return error("actual current ordinary wage original/year/owner/status changed or unknown");
  const originalIdentity=stable(semantic(w2,year));if(identities.has(originalIdentity)) return error("indistinguishable duplicate actual originals");identities.add(originalIdentity);
  for(const [key,value] of Object.entries(w2)) if(typeof value==="string" && /wages|withheld|tips|benefits|box12Code/i.test(key)) amount(value);
  for(const key of ["box12CodeD","box12CodeE","box12CodeF","box12CodeG","box12CodeH","box12CodeS","box12CodeW","box12CodeT","box10DependentCareBenefits","allocatedTips"] as const) if(w2[key]!==undefined && !amount(w2[key]).isZero()) return error("nonordinary PA wage adjustment needs actual method");
  if(w2.militaryService?.activeDuty===true || !row.payroll.length) return error("ordinary actual payroll source method required");
  let gross=new Decimal(0);const refs=new Set<string>();
  for(const [j,pay] of row.payroll.entries()){
   reference(pay.sourceReference);if(refs.has(pay.sourceReference.trim())) return error("duplicate actual payroll reference");refs.add(pay.sourceReference.trim());
   const paid=day(pay.paidOn,year),from=day(pay.serviceFrom,year),through=day(pay.serviceThrough,year);
   const period=residency.periods.findIndex(p=>p.from<=paid && paid<=p.through);
   if(from>through || period<0 || from<residency.periods[period].from || through>residency.periods[period].through) return error("cross-period/deferred payroll requires its actual source method");
   const total=amount(pay.grossCompensation),pa=amount(pay.paServicesCompensation),outside=amount(pay.outsidePAServicesCompensation);
   if(!pa.plus(outside).eq(total)) return error("actual payroll PA/outside amounts must reconcile gross");gross=gross.plus(total);
   const resident=residency.residentPeriods.some(p=>p.from<=paid && paid<=p.through), state=source.residency.domicilePeriods[period].state;
   if(!resident && ["IN","MD","NJ","OH","VA","WV"].includes(state) && pa.gt(0)) relevant.set(`${i}:${j}`,{originalIndex:i,payrollIndex:j,pa,state});
  }
  if(!gross.eq(amount(w2.wages))) return error("actual payroll does not reconcile original wages");
 }
 if(!relevant.size || proof.segments.length!==relevant.size) return error("complete reciprocal positive-service segment coverage required");
 const segmentKeys=new Set<string>();const statesByOriginal=new Map<number,Set<string>>();
 let totalExcludedPACompensation=new Decimal(0);
 const segments=proof.segments.map(s=>{
  const key=`${s.originalIndex}:${s.payrollIndex}`, current=relevant.get(key);
  if(!current || segmentKeys.has(key)) return error("duplicate, absent or out-of-period reciprocal segment proof");segmentKeys.add(key);reference(s.sourceReference);
  const wage=source.wages.find(w=>w.originalIndex===current.originalIndex);
  if(!wage || stable(s.actualPayroll)!==stable(wage.payroll[current.payrollIndex]) || s.reciprocalState!==current.state || s.sourceFactsConfirmed!==true || s.employeeCompensationOnlyConfirmed!==true || s.compensationLegallySubjectToEmployerWithholdingConfirmed!==true || s.earnedWhileReciprocalResidentConfirmed!==true || s.noPAResidentEarnedDeferredCompensationConfirmed!==true) return error("actual employee, legal withholding, earning-period and nondeferred sources required");
  let ohioException=false;
  if(current.state==="OH"){
   if(s.employerIsPASCorporation===null) return error("actual Ohio employer entity source required");
   if(s.employerIsPASCorporation){if(s.shareholderEmployee===null) return error("actual Ohio shareholder employee source required");
    if(s.shareholderEmployee){const ownership=amount(s.actualOwnershipPercent);if(ownership.gt(100)) return error("actual ownership must be0..100");ohioException=ownership.gte(20);}
   }
  }
  const excludedPACompensation=ohioException?new Decimal(0):current.pa;
  totalExcludedPACompensation=totalExcludedPACompensation.plus(excludedPACompensation);
  const states=statesByOriginal.get(current.originalIndex)??new Set<string>();states.add(current.state);statesByOriginal.set(current.originalIndex,states);
  return {originalIndex:current.originalIndex,payrollIndex:current.payrollIndex,excludedPACompensation,taxablePAServices:current.pa.minus(excludedPACompensation)};
 });
 if(proof.originals.length!==statesByOriginal.size) return error("complete once-only covered original proof required");
 const originalKeys=new Set<number>();let paWithheldFromCoveredOriginals=new Decimal(0);
 const originals=proof.originals.map(o=>{
  const i=o.originalIndex;
  if(i===null || !statesByOriginal.has(i) || originalKeys.has(i)) return error("unique covered actual original proof required");originalKeys.add(i);reference(o.sourceReference);
  const w2=input.w2s[i];
  const actualRows=actualW2Rows.get(i);
  const zeroOrOneState=actualRows===undefined?true:actualRows.stateRows.length<=1;
  if(o.sourceTaxYear!==year || o.sourceFactsConfirmed!==true || o.zeroOrOneStateRowOnActualOriginalConfirmed!==zeroOrOneState || o.noAdditionalPAStateRowOnOriginalConfirmed!==true || stable(o.originalW2)!==stable(w2)) return error("actual original year/content and truthful complete state-row source proof required");
  const reportedPARow=actualRows?.stateRows.find(row=>row.state==="PA");
  const hasPARow=actualRows===undefined?w2.state==="PA":reportedPARow!==undefined;
  const reportedPAWithheld=actualRows===undefined?amount(w2.stateTaxWithheld):reportedPARow?.withheld;
  const actualPAWithheld=amount(o.actualPAWithheld);
  if(o.paWithholdingStatus==="reported_PA_box17") {if(!hasPARow || reportedPAWithheld===undefined || !reportedPAWithheld.eq(actualPAWithheld)) return error("actual original PA withholding contradicts source");}
  else if(o.paWithholdingStatus==="no_PA_row_on_original") {if(hasPARow || !actualPAWithheld.isZero() || (actualRows===undefined && !w2.state && !amount(w2.stateTaxWithheld).isZero())) return error("actual no-PA-row status contradicts original withholding jurisdiction");}
  else return error("actual PA withholding source status required");
  paWithheldFromCoveredOriginals=paWithheldFromCoveredOriginals.plus(actualPAWithheld);
  const r=o.residentStateReturn;
  const complete=o.refundSupportFactsConfirmed===true && !!o.w2CopySourceReference.trim() && !!o.residencyStatementSourceReference.trim() && r.sourceTaxYear===year && r.filedConfirmed===true && !!r.sourceReference.trim() && stable(r.ownerOriginal)===stable(identity) && statesByOriginal.get(i)?.size===1 && statesByOriginal.get(i)?.has(r.state);
  const refundSupportStatus=o.refundRequested===null?"unknown_request":o.refundRequested===false?"not_requested":actualPAWithheld.isZero()?"no_PA_withholding":complete?"complete":"pending_documents";
  return {originalIndex:i,actualPAWithheld,refundSupportStatus} as PAReciprocalCompensationResult["originals"][number];
 });
 const originalInput=Object.fromEntries(Object.entries(input).filter(([key])=>!['paResidencySources','paReciprocitySources'].includes(key)));
 const sourceCommitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:"pa-reciprocal-employee-v1",year,input:originalInput,rawOrdinary,rawProof}))));
 const audit=new AuditTrail();audit.record("PA-Reciprocity","employee-exclusion","Actual reciprocal employee compensation exclusion",totalExcludedPACompensation,"Actual employee earning/residency periods; Ohio shareholder-employee exception; source-only, no return settlement qualification");
 return {totalExcludedPACompensation,paWithheldFromCoveredOriginals,segments,originals,sourceCommitment,lines:audit.getLines()};
}
