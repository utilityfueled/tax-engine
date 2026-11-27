import { Form8911Sources2026Schema, type Form8911Sources2026 } from "@/models/inputs";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date";
import { parseGuidedCurrency } from "./guided-currency";
import type { FilingStatus } from "./guided-interview-flow";
import { amountError, guidedAmountChanged } from "./guided-required-facts";

export interface GuidedPersonalEvChargerPort {
  owner: "" | "primary" | "spouse";
  invoiceReference: string;
  placedInServiceReference: string;
  censusTractSourceReference: string;
  censusTractGeoid: string;
  placedInServiceDate: string;
  invoiceGrossCost: string;
  nonqualifyingInvoiceCost: string;
  rebatesAndOtherBasisReductions: string;
  originalUseBeganWithTaxpayer: boolean | null;
  oneNewChargingPortConfirmed: boolean | null;
  domesticMainHomeConfirmed: boolean | null;
  personalUseOnlyConfirmed: boolean | null;
  invoiceReconciledConfirmed: boolean | null;
  censusTractMatchesLocationConfirmed: boolean | null;
  sourceFactsConfirmed: boolean | null;
  confirmedFilingStatus: FilingStatus | null;
}

interface GuidedPersonalEvAdditionalPort extends GuidedPersonalEvChargerPort {
  portReference: string;
}

export interface GuidedPersonalEvCharger extends GuidedPersonalEvChargerPort {
  additionalPortSources?: {
    firstPortReference: string;
    independentCostsConfirmed: boolean | null;
    ports: GuidedPersonalEvAdditionalPort[];
  };
}

export const personalEvChargerQuestions = [
  ["oneNewChargingPortConfirmed", "Does this record cover exactly one new port installed to charge an electric car or truck?"],
  ["originalUseBeganWithTaxpayer", "Did the selected owner begin the original use of the port?"],
  ["domesticMainHomeConfirmed", "Was the port installed at the owner's main home in one of the 50 states or D.C.?"],
  ["personalUseOnlyConfirmed", "Has the port remained installed at that home and used only for personal charging throughout the 2026 period covered by your records?"],
  ["invoiceReconciledConfirmed", "Did the selected owner incur the reconciled invoice costs, and are all offsets documented?"],
  ["censusTractMatchesLocationConfirmed", "Does the census record identify the actual charger installation location?"],
] as const;

export const personalEvChargerLastEligibleServiceDate = "2026-06-30";

const confirmations = {
  originalUseBeganWithTaxpayer: null,
  oneNewChargingPortConfirmed: null,
  domesticMainHomeConfirmed: null,
  personalUseOnlyConfirmed: null,
  invoiceReconciledConfirmed: null,
  censusTractMatchesLocationConfirmed: null,
  sourceFactsConfirmed: null,
  confirmedFilingStatus: null,
} as const;

export const emptyGuidedPersonalEvCharger: GuidedPersonalEvChargerPort = {
  owner: "",
  invoiceReference: "",
  placedInServiceReference: "",
  censusTractSourceReference: "",
  censusTractGeoid: "",
  placedInServiceDate: "",
  invoiceGrossCost: "",
  nonqualifyingInvoiceCost: "",
  rebatesAndOtherBasisReductions: "",
  ...confirmations,
};

const referenceFields = ["invoiceReference", "placedInServiceReference", "censusTractSourceReference"] as const;
const amountFields = [
  ["invoiceGrossCost", "gross invoice cost"],
  ["nonqualifyingInvoiceCost", "nonqualifying invoice cost"],
  ["rebatesAndOtherBasisReductions", "rebates and other basis reductions"],
] as const;

export function invalidatePersonalEvChargerSource(data: GuidedPersonalEvCharger): GuidedPersonalEvCharger {
  const additional = data.additionalPortSources;
  return {
    ...data, ...confirmations,
    ...(additional ? { additionalPortSources: {
      ...additional, independentCostsConfirmed: null, ports: additional.ports.map(port => ({ ...port, ...confirmations })),
    } } : {}),
  };
}

function portOriginalChanged(previous: GuidedPersonalEvChargerPort, next: GuidedPersonalEvChargerPort): boolean {
  return previous.owner !== next.owner
    || previous.placedInServiceDate !== next.placedInServiceDate
    || previous.censusTractGeoid !== next.censusTractGeoid
    || referenceFields.some(field => previous[field] !== next[field])
    || amountFields.some(([field]) => guidedAmountChanged(previous[field], next[field]));
}

function invalidateEditedPort<T extends GuidedPersonalEvChargerPort>(previous: T, next: T, referenceChanged: boolean): T {
  if (referenceChanged || portOriginalChanged(previous, next)) return { ...next, ...confirmations };
  return personalEvChargerQuestions.some(([field]) => previous[field] !== next[field])
    ? { ...next, sourceFactsConfirmed: null, confirmedFilingStatus: null }
    : next;
}

export function invalidateEditedPersonalEvCharger(previous: GuidedPersonalEvCharger | undefined, next: GuidedPersonalEvCharger): GuidedPersonalEvCharger {
  if (!previous) return next;
  const previousAdditional = previous.additionalPortSources;
  const additional = next.additionalPortSources;
  const firstReferenceChanged = Boolean(previousAdditional && additional
    && previousAdditional.firstPortReference !== additional.firstPortReference);
  const updated = invalidateEditedPort(previous, next, firstReferenceChanged);
  if (!additional) return updated;

  let originalsChanged = firstReferenceChanged || portOriginalChanged(previous, next)
    || previousAdditional?.ports.length !== additional.ports.length;
  const ports = additional.ports.map((port, index) => {
    const before = previousAdditional?.ports[index];
    if (!before) return { ...port, ...confirmations };
    const referenceChanged = before.portReference !== port.portReference;
    if (referenceChanged || portOriginalChanged(before, port)) originalsChanged = true;
    return invalidateEditedPort(before, port, referenceChanged);
  });
  return { ...updated, additionalPortSources: {
    ...additional, ports, independentCostsConfirmed: originalsChanged ? null : additional.independentCostsConfirmed,
  } };
}

function readPersonalEvChargerPort(data: GuidedPersonalEvChargerPort, taxYear?: number | null, filingStatus?: FilingStatus | null): Form8911Sources2026 | string {
  if (taxYear !== 2026) return "This worksheet covers 2026 records. Return to 2026 or remove the retained charging port.";
  if (data.owner !== "primary" && !(data.owner === "spouse" && filingStatus === "mfj")) {
    return "Choose the actual charging port owner on this return.";
  }
  if (referenceFields.some(field => typeof data[field] !== "string" || !data[field].trim())) {
    return "Enter the actual invoice, placed-in-service and census tract records.";
  }
  if (typeof data.censusTractGeoid !== "string" || !/^\d{11}$/.test(data.censusTractGeoid.trim())) {
    return "Enter the full 11-digit 2020 census tract GEOID from the location record.";
  }
  if (!isActualDate(data.placedInServiceDate) || !data.placedInServiceDate.startsWith("2026-")
    || data.placedInServiceDate > currentLocalCivilDate()) {
    return "Enter the actual 2026 date the port was ready and available for use.";
  }
  for (const [field, label] of amountFields) {
    const error = amountError(data[field], label);
    if (error) return error;
  }
  if (personalEvChargerQuestions.some(([field]) => data[field] === false)) {
    return "These records need separate review before a charging port credit can be calculated.";
  }
  if (personalEvChargerQuestions.some(([field]) => data[field] !== true)) return "Confirm each charging port fact from your written records.";
  if (!filingStatus || data.sourceFactsConfirmed !== true || data.confirmedFilingStatus !== filingStatus) {
    return "Confirm that the original records belong to the selected owner for this return.";
  }
  const original = Form8911Sources2026Schema.safeParse({
    taxYear: 2026,
    owner: data.owner,
    invoiceReference: data.invoiceReference.trim(),
    placedInServiceReference: data.placedInServiceReference.trim(),
    censusTractSourceReference: data.censusTractSourceReference.trim(),
    censusTractGeoid: data.censusTractGeoid.trim(),
    placedInServiceDate: data.placedInServiceDate,
    invoiceGrossCost: parseGuidedCurrency(data.invoiceGrossCost).toFixed(),
    nonqualifyingInvoiceCost: parseGuidedCurrency(data.nonqualifyingInvoiceCost).toFixed(),
    rebatesAndOtherBasisReductions: parseGuidedCurrency(data.rebatesAndOtherBasisReductions).toFixed(),
    originalUseBeganWithTaxpayer: true,
    oneNewChargingPortConfirmed: true,
    domesticMainHomeConfirmed: true,
    personalUseOnlyConfirmed: true,
    invoiceReconciledConfirmed: true,
    censusTractMatchesLocationConfirmed: true,
  });
  return original.success ? original.data : original.error.issues[0]?.message ?? "Reconcile the original charging port records.";
}

function readPersonalEvCharger(data: GuidedPersonalEvCharger, taxYear?: number | null, filingStatus?: FilingStatus | null): Form8911Sources2026 | string {
  const first = readPersonalEvChargerPort(data, taxYear, filingStatus);
  if (typeof first === "string" || data.additionalPortSources === undefined) return first;
  const additional = data.additionalPortSources;
  if (additional?.independentCostsConfirmed !== true || !Array.isArray(additional.ports) || additional.ports.length === 0) {
    return "Confirm independent original invoices and costs for each charging port. Shared costs require separate review.";
  }
  const ports = [];
  for (const [index, port] of additional.ports.entries()) {
    if (!port || typeof port !== "object") return "Enter the original records for each additional charging port.";
    const source = readPersonalEvChargerPort(port, taxYear, filingStatus);
    if (typeof source === "string") return `Charging port ${index + 2}. ${source}`;
    ports.push({ ...source, portReference: port.portReference });
  }
  const original = Form8911Sources2026Schema.safeParse({ ...first, additionalPortSources: { ...additional, ports } });
  return original.success ? original.data : original.error.issues[0]?.message ?? "Reconcile the original charging port records.";
}

export function personalEvChargerFactError(data: GuidedPersonalEvCharger, taxYear?: number | null, filingStatus?: FilingStatus | null): string | undefined {
  const source = readPersonalEvCharger(data, taxYear, filingStatus);
  return typeof source === "string" ? source : undefined;
}

export function buildGuidedPersonalEvCharger(data: GuidedPersonalEvCharger | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null): Form8911Sources2026 | undefined {
  if (!data) return;
  const source = readPersonalEvCharger(data, taxYear, filingStatus);
  if (typeof source === "string") throw new Error(source);
  return source;
}
