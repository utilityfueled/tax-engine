import { w2FederalEconomicIdentity } from "@/engine/forms/w2-state-local";
import { W2Schema } from "@/models/inputs";
import { W2StateLocalSourcesSchema } from "@/models/w2-state-local";
import { compensationReportingErrors } from "./guided-compensation-reporting";
import type { EicCombatPayElection, FilingStatus, W2EntryData } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency, parseGuidedDisplayAmount } from "./guided-currency";

/** Existing modeled Box12 originals: missing is not an actual zero for a source packet. */
export const W2_SOURCE_BOX12_FIELDS = ["box12CodeW", "box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE", "box12CodeT"] as const;
const REQUIRED_FEDERAL_AMOUNTS = [
  ["wages", "Box 1 wages"], ["federalWithheld", "Box 2 withholding"],
  ["socialSecurityWages", "Box 3 Social Security wages"], ["socialSecurityWithheld", "Box 4 Social Security withholding"],
  ["medicareWages", "Box 5 Medicare wages"], ["medicareWithheld", "Box 6 Medicare withholding"],
  ["socialSecurityTips", "Box 7 Social Security tips"], ["box10DependentCareBenefits", "Box 10 dependent-care benefits"],
] as const;
const FEDERAL_IDENTITY_AMOUNTS = [
  ...REQUIRED_FEDERAL_AMOUNTS.map(([field]) => field), "allocatedTips", ...W2_SOURCE_BOX12_FIELDS,
  "box12CodeP", "box12CodeQ", "box12CodeTP", "box12CodeTT",
] as const;

function guidedW2FederalIdentity(entry: W2EntryData): string | undefined {
  try {
    const amounts = Object.fromEntries(FEDERAL_IDENTITY_AMOUNTS.map(field => [field, parseGuidedCurrency(entry[field]).toFixed()]));
    return `${entry.accountHolder || "primary"}:${w2FederalEconomicIdentity({
      employer: { name: entry.employerName, ein: entry.employerEin },
      ...amounts,
      treasuryTippedOccupationCodes: entry.treasuryTippedOccupationCodes,
    }, 2026)}`;
  } catch {
    // The amount validators handle malformed entries independently of source equality.
    return undefined;
  }
}

export function isStartedW2(entry: W2EntryData): boolean {
  return Object.entries(entry).some(([key, value]) => key !== "aiSuggestedFields" && ((typeof value === "string" && value.trim() !== "") || Array.isArray(value) || key === "stateLocalSources" && value !== undefined));
}

export function enteredCodeP(entry: W2EntryData): string | undefined {
  if (!hasEnteredAmount(entry.box12CodeP)) return undefined;
  parseGuidedCurrency(entry.box12CodeP);
  return W2Schema.shape.box12CodeP.parse(entry.box12CodeP?.trim().replaceAll(",", ""));
}

function reportedCodeQ(entry: W2EntryData) {
  const text = entry.box12CodeQ?.trim();
  if (!text || !parseGuidedDisplayAmount(text).isFinite()) return undefined;
  return W2Schema.shape.box12CodeQ.safeParse(text.replaceAll(",", "")).data;
}

const combatPayOwners = ["primary", "spouse"] as const;

export function reportedCombatPayOwners(entries: W2EntryData[] | undefined) {
  const owners = new Set<typeof combatPayOwners[number]>();
  for (const entry of entries ?? []) {
    const owner = entry.accountHolder;
    const amount = reportedCodeQ(entry);
    if ((owner === "primary" || owner === "spouse") && parseGuidedCurrency(amount).gt(0)) owners.add(owner);
  }
  return combatPayOwners.filter(owner => owners.has(owner));
}

export function combatPayElectionErrors(entries: W2EntryData[] | undefined, election: EicCombatPayElection | undefined, filingStatus: FilingStatus | null | undefined) {
  const errors: Record<string, string> = {};
  const owners = reportedCombatPayOwners(entries);
  if (owners.length) {
    for (const [index, entry] of (entries ?? []).entries()) {
      if (isStartedW2(entry) && !hasEnteredAmount(entry.box12CodeQ)) {
        errors[`w2-${index}-box12CodeQ`] = "Check the original W-2 for Code Q. Enter zero if the original has no Code Q.";
      }
    }
  }
  for (const owner of owners) {
    if (typeof election?.[owner] !== "boolean") errors[`combatPayElection-${owner}`] = owner === "primary"
      ? "Choose whether to include your nontaxable combat pay in the Earned Income Credit."
      : "Confirm whether your spouse elects to include their nontaxable combat pay in the Earned Income Credit.";
  }
  if (election?.spouse !== undefined && filingStatus !== "mfj") errors["combatPayElection-spouse"] = "A spouse combat pay choice belongs on a joint return.";
  for (const owner of combatPayOwners) {
    if (election?.[owner] === true && !owners.includes(owner)) errors[`combatPayElection-${owner}`] = "An election to include combat pay requires a current W-2 reporting it for that filer.";
  }
  return errors;
}

export function retainCombatPayElection(previous: W2EntryData[] | undefined, next: W2EntryData[], election: EicCombatPayElection | undefined) {
  if (!election) return undefined;
  const retained: EicCombatPayElection = {};
  const originals = (entries: W2EntryData[] | undefined, owner: keyof EicCombatPayElection) => (entries ?? [])
    .filter(entry => entry.accountHolder === owner && hasEnteredAmount(entry.box12CodeQ))
    .map(entry => JSON.stringify([entry.sourceTaxYear, entry.employerEin, entry.box12CodeQ])).sort();
  for (const owner of reportedCombatPayOwners(next)) {
    if (typeof election[owner] === "boolean" && JSON.stringify(originals(previous, owner)) === JSON.stringify(originals(next, owner))) retained[owner] = election[owner];
  }
  return Object.keys(retained).length ? retained : undefined;
}

export function w2FactErrors(entries: W2EntryData[] | undefined, filingStatus?: FilingStatus | null, returnYear?: number | null, options?: { forSourceConfirmation?: boolean }): Record<string, string> {
  const errors: Record<string, string> = {};
  const federalOriginals = new Map<string, number>();
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!isStartedW2(entry)) continue;
    const prefix = `w2-${index}`;
    for (const [key, error] of Object.entries(compensationReportingErrors(entry, returnYear))) errors[`${prefix}-${key}`] = error;
    if (entry.requiresSourceYearConfirmation && !entry.sourceTaxYear?.trim()) {
      errors[`${prefix}-sourceTaxYear`] = "Enter the tax year printed on this W-2 after changing the return year.";
    }
    if (!entry.employerName.trim()) errors[`${prefix}-employerName`] = "Enter the actual W-2 employer name.";
    if (!/^\d{2}-?\d{7}$/.test(entry.employerEin.trim())) errors[`${prefix}-employerEin`] = "Enter the actual employer EIN from Box b.";
    if (filingStatus === "mfj" && !["primary", "spouse"].includes(entry.accountHolder ?? "")) errors[`${prefix}-accountHolder`] = "Identify whose W-2 this is on the joint return.";
    if (entry.accountHolder === "spouse" && filingStatus && filingStatus !== "mfj") errors[`${prefix}-accountHolder`] = "A spouse's W-2 belongs on a joint return or their own return.";
    for (const [field, label] of REQUIRED_FEDERAL_AMOUNTS) {
      const error = amountError(entry[field], label);
      if (error) errors[`${prefix}-${field}`] = error;
    }
    if (hasEnteredAmount(entry.allocatedTips)) { const error = amountError(entry.allocatedTips, "Box 8 allocated tips"); if (error) errors[`${prefix}-allocatedTips`] = error; }
    if (hasEnteredAmount(entry.box12CodeW)) { const error = amountError(entry.box12CodeW, "Box 12 code W"); if (error) errors[`${prefix}-box12CodeW`] = error; }
    if (hasEnteredAmount(entry.box12CodeP)) {
      try { enteredCodeP(entry); }
      catch { errors[`${prefix}-box12CodeP`] = "Enter the actual nonnegative Box 12 Code P in dollars and cents."; }
      if (returnYear !== 2026 || entry.sourceTaxYear?.trim() !== "2026") errors[`${prefix}-sourceTaxYear`] = "Use the actual matching 2026 W-2 for entered Code P.";
      if (entry.accountHolder !== "primary" && (entry.accountHolder !== "spouse" || filingStatus !== "mfj")) {
        errors[`${prefix}-accountHolder`] = "Identify the actual W-2 Code P owner.";
      }
    }
    if (hasEnteredAmount(entry.box12CodeQ)) {
      const amount = reportedCodeQ(entry);
      if (amount === undefined) errors[`${prefix}-box12CodeQ`] = "Enter actual nonnegative Box 12 Code Q in dollars and cents.";
      else if (parseGuidedCurrency(amount).gt(0)) {
        if (!returnYear || entry.sourceTaxYear?.trim() !== String(returnYear)) {
          errors[`${prefix}-sourceTaxYear`] = "Enter the original W-2 year for Box 12 Code Q and match it to this return.";
        }
        if (entry.accountHolder !== "primary" && (entry.accountHolder !== "spouse" || filingStatus !== "mfj")) {
          errors[`${prefix}-accountHolder`] = "Identify the actual W-2 Code Q owner.";
        }
      }
    }
    if (entry.stateLocalSources !== undefined) {
      for (const key of [...W2_SOURCE_BOX12_FIELDS, "allocatedTips"] as const) {
        const error = amountError(entry[key], key === "allocatedTips" ? "actual Box 8 allocated tips" : `actual Box 12 code ${key.slice(9)}`);
        if (error) errors[`${prefix}-${key}`] = error;
      }
      const packet = W2StateLocalSourcesSchema.safeParse(entry.stateLocalSources);
      if (!packet.success) errors[`${prefix}-stateLocalSources`] = "Complete the actual state and local row packet.";
      else if (!options?.forSourceConfirmation && (packet.data.sourceFactsConfirmed !== true || packet.data.sourceTaxYear !== returnYear || packet.data.stateReporting !== entry.stateTaxReporting)) errors[`${prefix}-stateLocalSources`] = "Confirm the complete actual state and local rows for this original year and reporting mode.";
    } else if (entry.stateTaxReporting === "single") {
      if (!/^[A-Z]{2}$/.test(entry.state?.trim().toUpperCase() ?? "")) errors[`${prefix}-state`] = "Enter the actual two-letter state from Box 15.";
      for (const [field, label] of [["stateWages", "Box 16 state wages"], ["stateWithheld", "Box 17 state withholding"]] as const) {
        const error = amountError(entry[field], label);
        if (error) errors[`${prefix}-${field}`] = error;
      }
    } else if (entry.stateTaxReporting === "none") {
      if (entry.state?.trim()) errors[`${prefix}-state`] = "Reconcile the recorded state with the answer that the W-2 has no state section.";
      for (const field of ["stateWages", "stateWithheld"] as const) {
        if (hasEnteredAmount(entry[field]) && (amountError(entry[field], "state amount") || !parseGuidedCurrency(entry[field]).isZero())) errors[`${prefix}-${field}`] = "Reconcile the recorded amount with the answer that the W-2 has no state section.";
      }
    } else {
      errors[`${prefix}-stateTaxReporting`] = entry.stateTaxReporting === "multiple"
        ? "Multiple-state W-2 allocation needs separate state records; this interview cannot collapse them into one state."
        : "Confirm whether the actual W-2 reports no state, one state or multiple states.";
    }
    for (const [field, suggestion] of Object.entries(entry.aiSuggestedFields ?? {})) {
      if (suggestion?.status === "pending-confirmation") errors[`${prefix}-${field}`] = `Confirm the source value for ${field} before calculating.`;
    }
    if (returnYear !== 2026 || options?.forSourceConfirmation) continue;
    const identity = guidedW2FederalIdentity(entry);
    if (!identity) continue;
    const firstIndex = federalOriginals.get(identity);
    if (firstIndex === undefined) federalOriginals.set(identity, index);
    else errors[`${prefix}-duplicate`] = `W-2 #${index + 1} has the same federal W-2 facts as W-2 #${firstIndex + 1}. Compare the originals and reconcile the entries before continuing.`;
  }
  return errors;
}
