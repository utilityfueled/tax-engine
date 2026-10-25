import Decimal from "decimal.js";
import type { Form1099SA, Form8889Input } from "@/models/inputs";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, isActualDate } from "./guided-required-facts";

export interface HsaMedicalEligibility {
  qualifiedExpense: boolean | null;
  beneficiaryEligible: boolean | null;
  incurredAfterHsaEstablished: boolean | null;
  notReimbursedElsewhere: boolean | null;
  notDeductedOnScheduleA: boolean | null;
}
export interface HsaDistributionEvent {
  id: string;
  distributionDate: string;
  grossDistribution: string;
  medicalExpenses: string;
  medicalEligibility?: HsaMedicalEligibility;
  rolloverAmount: string;
  rolloverReceivedDate?: string;
  rolloverToSameOwnerHsa?: boolean | null;
  noOtherRolloverInPrior12Months?: boolean | null;
}
export interface HsaDistributionSource {
  id: string;
  sourceTaxYear: string;
  accountOwner: "" | "primary" | "spouse";
  payer: string;
  payerTin: string;
  accountReference: string;
  accountType: "" | "hsa" | "archer_msa" | "ma_msa";
  distributionCode: "" | "1" | "2" | "3" | "4" | "5" | "6";
  grossDistribution: string;
  earningsOnExcessContributions: string;
  trusteeToTrusteeTransfer: boolean | null;
  sourceFactsConfirmed: boolean | null;
  events: HsaDistributionEvent[];
}

const medicalFields = ["qualifiedExpense", "beneficiaryEligible", "incurredAfterHsaEstablished", "notReimbursedElsewhere", "notDeductedOnScheduleA"] as const;
const day = (date: string) => new Date(`${date}T00:00:00Z`).getTime() / 86_400_000;
function qualifiedMedical(event: HsaDistributionEvent): Decimal {
  return medicalFields.every(field => event.medicalEligibility?.[field] === true) ? parseGuidedCurrency(event.medicalExpenses) : new Decimal(0);
}
function qualifiedRollover(event: HsaDistributionEvent): Decimal {
  if (!isActualDate(event.rolloverReceivedDate) || event.rolloverToSameOwnerHsa !== true || event.noOtherRolloverInPrior12Months !== true) return new Decimal(0);
  const days = day(event.rolloverReceivedDate!) - day(event.distributionDate);
  return days >= 0 && days <= 60 ? parseGuidedCurrency(event.rolloverAmount) : new Decimal(0);
}

export function hsaDistributionFactErrors(records: HsaDistributionSource[] | undefined, owner: "primary" | "spouse", taxYear: number, dateOfBirth?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!records?.length) return { hsaDistributionSources: "Enter the actual Form 1099-SA records and distribution details for this owner." };
  if (![2025, 2026].includes(taxYear)) errors.hsaDistributionYear = "Select a supported actual return year.";
  if (dateOfBirth !== undefined && !isActualDate(dateOfBirth)) errors.hsaDistributionBirthDate = "Enter the actual account owner's date of birth before applying an age exception.";
  const age65Year = Number(dateOfBirth?.slice(0, 4)) + 65;
  if (taxYear === age65Year && dateOfBirth?.endsWith("-02-29")) errors.hsaDistributionLeapBirthday = "The age-65 boundary for this leap-day birthday needs its qualified date determination before calculating.";
  const ids = new Set<string>();
  const eventIds = new Set<string>();
  const statements = new Set<string>();
  const validRollovers: string[] = [];
  for (const [index, record] of records.entries()) {
    const prefix = `hsaDistribution-${index}`;
    const add = (field: string, message: string) => { errors[`${prefix}-${field}`] = message; };
    if (!record.id || ids.has(record.id)) add("id", "Keep each original Form 1099-SA only once, with a unique source identifier.");
    ids.add(record.id);
    if (record.sourceTaxYear !== String(taxYear)) add("year", "Enter the actual statement tax year; it must match this return.");
    if (record.accountOwner !== owner) add("owner", "Reconcile the actual source recipient with this HSA owner.");
    if (!record.payer.trim()) add("payer", "Enter the actual payer name.");
    if (!/^\d{9}$/.test(record.payerTin.replace(/-/g, ""))) add("payerTin", "Enter the actual nine-digit payer TIN.");
    if (!record.accountReference.trim()) add("accountReference", "Enter the statement's actual account reference; a masked reference is sufficient.");
    const fingerprint = [record.sourceTaxYear, record.accountOwner, record.payerTin.replace(/-/g, ""), record.accountReference.trim(), record.distributionCode].join("|");
    if (statements.has(fingerprint)) add("duplicate", "These records identify the same account, year and code. Reconcile original and corrected statements before counting either twice.");
    statements.add(fingerprint);
    if (record.accountType !== "hsa") add("accountType", "Confirm the actual HSA checkbox. Archer and Medicare Advantage MSAs need their separate source worksheets.");
    if (!["1", "3"].includes(record.distributionCode)) add("code", "Contribution returns, death and prohibited-transaction codes need their separate source worksheets; preserve the reported code.");
    if (record.trusteeToTrusteeTransfer !== false) add("transfer", "Confirm this is a reported distribution, not a trustee-to-trustee transfer.");
    if (record.sourceFactsConfirmed !== true) add("confirmation", "Check these source records and expense allocations after the last edit.");
    for (const field of ["grossDistribution", "earningsOnExcessContributions"] as const) {
      const error = amountError(record[field], field === "grossDistribution" ? "Box 1 gross distribution" : "Box 2 earnings, including known zero");
      if (error) add(field, error);
    }
    if (!errors[`${prefix}-earningsOnExcessContributions`] && parseGuidedCurrency(record.earningsOnExcessContributions).gt(0)) add("earningsCode", "Positive Box 2 earnings require the actual contribution-return treatment; do not reinterpret them as ordinary distributions.");
    if (!Array.isArray(record.events)) { add("events", "Enter actual dated distributions from the account history."); continue; }
    let total = new Decimal(0);
    let allGrossKnown = true;
    for (const [eventIndex, event] of record.events.entries()) {
      const eventKey = `event-${eventIndex}`;
      if (!event.id || eventIds.has(event.id)) add(`${eventKey}-id`, "Keep each dated distribution once, with a unique identifier.");
      eventIds.add(event.id);
      if (!isActualDate(event.distributionDate) || !event.distributionDate.startsWith(`${taxYear}-`) || (dateOfBirth !== undefined && isActualDate(dateOfBirth) && event.distributionDate < dateOfBirth)) add(`${eventKey}-date`, "Enter the actual distribution date in this return year, after the owner's birth date.");
      const validAmounts = ["grossDistribution", "medicalExpenses", "rolloverAmount"].every(field => {
        const error = amountError(event[field as "grossDistribution" | "medicalExpenses" | "rolloverAmount"], field);
        if (error) add(`${eventKey}-${field}`, error);
        return !error;
      });
      if (!amountError(event.grossDistribution, "gross distribution")) total = total.plus(parseGuidedCurrency(event.grossDistribution));
      else allGrossKnown = false;
      if (!validAmounts) continue;
      const gross = parseGuidedCurrency(event.grossDistribution);
      const medical = parseGuidedCurrency(event.medicalExpenses);
      const rollover = parseGuidedCurrency(event.rolloverAmount);
      if (medical.plus(rollover).gt(gross)) add(`${eventKey}-allocation`, "Medical and rollover amounts assigned to this distribution cannot exceed its actual gross amount or use the same dollars twice.");
      if (medical.gt(0) && medicalFields.some(field => typeof event.medicalEligibility?.[field] !== "boolean")) add(`${eventKey}-medical`, "Answer every medical expense eligibility question; a blank answer is unknown.");
      if (rollover.gt(0)) {
        if (!isActualDate(event.rolloverReceivedDate)) add(`${eventKey}-rolloverDate`, "Enter the actual date the receiving HSA received the rollover.");
        for (const field of ["rolloverToSameOwnerHsa", "noOtherRolloverInPrior12Months"] as const) if (typeof event[field] !== "boolean") add(`${eventKey}-${field}`, "Confirm the actual rollover ownership and preceding twelve-month history.");
        if (isActualDate(event.distributionDate) && qualifiedRollover(event).gt(0)) validRollovers.push(event.distributionDate);
      }
    }
    if (allGrossKnown && !errors[`${prefix}-grossDistribution`] && !total.eq(parseGuidedCurrency(record.grossDistribution))) add("reconciliation", "Actual dated distributions must sum exactly to this statement's Box 1 gross amount.");
  }
  // Multiple successful rollovers in one calendar year conflict with the actual
  // preceding-twelve-month confirmations; split source records cannot bypass it.
  if (validRollovers.length > 1) errors.hsaDistributionRolloverHistory = "Reconcile the multiple rollovers for this owner; no more than one HSA rollover is allowed in a twelve-month period.";
  return errors;
}

export function buildHsaDistributionInputs(records: HsaDistributionSource[], owner: "primary" | "spouse", taxYear: number, dateOfBirth: string): { form1099SA: Form1099SA[]; form8889: Partial<Form8889Input> } {
  const errors = hsaDistributionFactErrors(records, owner, taxYear, dateOfBirth);
  if (Object.keys(errors).length) throw new Error(`Missing required HSA distribution facts: ${Object.values(errors).join(" ")}`);
  const birthday65 = `${Number(dateOfBirth.slice(0, 4)) + 65}${dateOfBirth.slice(4)}`;
  let medical = new Decimal(0);
  let rollover = new Decimal(0);
  let after65 = new Decimal(0);
  let disability = new Decimal(0);
  for (const record of records) for (const event of record.events) {
    const eventMedical = qualifiedMedical(event);
    const eventRollover = qualifiedRollover(event);
    medical = medical.plus(eventMedical);
    rollover = rollover.plus(eventRollover);
    const taxable = parseGuidedCurrency(event.grossDistribution).minus(eventMedical).minus(eventRollover);
    if (record.distributionCode === "3") disability = disability.plus(taxable);
    else if (event.distributionDate >= birthday65) after65 = after65.plus(taxable);
  }
  return {
    form1099SA: records.map(record => ({ payer: record.payer.trim(), grossDistribution: parseGuidedCurrency(record.grossDistribution).toString(), earningsOnExcessContributions: parseGuidedCurrency(record.earningsOnExcessContributions).toString(), distributionCode: record.distributionCode as "1" | "3", accountType: "hsa", accountHolder: owner, trusteeToTrusteeTransfer: false })),
    form8889: { qualifiedMedicalExpenses: medical.toString(), rolloverDistributions: rollover.toString(), distributionsAfterAge65: after65.toString(), disabilityExceptionTaxableDistributions: disability.toString() },
  };
}
