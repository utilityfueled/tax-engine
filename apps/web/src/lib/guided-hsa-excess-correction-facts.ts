import { HsaTimelyPersonalContributionReturnSchema } from "@/models/inputs";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import type { PersonalInfoData } from "./guided-interview-flow";
import type { HsaAccountData } from "./guided-hsa-facts";
import type { HsaDistributionSource } from "./guided-hsa-distribution-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { isActualDate } from "./guided-required-facts";

/** Original trustee/account facts, not a computed excess or a planned withdrawal. */
export interface HsaTimelyExcessCorrection {
  contributionReference?: string;
  returnReference?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  recipientSsn?: string;
  payerTin?: string;
  accountReference?: string;
  contributionTaxYear?: string;
  contributionDate?: string;
  contributionAmount?: string;
  returnReceivedDate?: string;
  returnedPrincipal?: string;
  postedGross?: string;
  postedEarnings?: string;
  hsaAccountConfirmed?: boolean | null;
  completePersonalContributionInventoryConfirmed?: boolean | null;
  personalContributionConfirmed?: boolean | null;
  postedAndNotReversed?: boolean | null;
  allAttributableIncomeReturned?: boolean | null;
  onlyCorrectionForOwner?: boolean | null;
  ordinaryCalendarYearTaxpayer?: boolean | null;
  noSpecialRelief?: boolean | null;
}
export const correctionTextFields = [
  ["contributionReference", "Original contribution record reference"], ["returnReference", "Posted correction record reference"],
  ["recipientFirstName", "Original recipient first name"], ["recipientLastName", "Original recipient last name"],
  ["recipientSsn", "Original recipient full SSN"], ["payerTin", "Correction trustee TIN"],
  ["accountReference", "Correction account reference"], ["contributionTaxYear", "Original contribution designation year"],
  ["contributionDate", "Actual original contribution date"], ["returnReceivedDate", "Actual date the owner received the correction"],
] as const;
export const correctionMoneyFields = [
  ["contributionAmount", "Original personal contribution before its return"],
  ["returnedPrincipal", "Posted returned contribution principal"], ["postedGross", "Posted gross amount received"],
  ["postedEarnings", "Posted attributable earnings received, including known zero"],
] as const;
export const correctionBooleanFields = [
  ["hsaAccountConfirmed", "The originals identify an HSA, not an Archer or Medicare Advantage MSA"],
  ["completePersonalContributionInventoryConfirmed", "The original contribution record covers all personal contributions for this owner and year"],
  ["personalContributionConfirmed", "The original was a personal contribution, not employer or payroll funding"],
  ["postedAndNotReversed", "The owner actually received this posted return and it has not been reversed"],
  ["allAttributableIncomeReturned", "The trustee returned all net income attributable to this excess"],
  ["onlyCorrectionForOwner", "This is the owner's only contribution correction and the originals cover all personal contributions"],
  ["ordinaryCalendarYearTaxpayer", "The owner is an ordinary calendar-year taxpayer, with no short or final-year return"],
  ["noSpecialRelief", "No late correction, amended-return relief, special deadline or other correction treatment applies"],
] as const;
export type HsaCorrectionRecipient = Pick<PersonalInfoData, "firstName" | "lastName" | "ssn" | "dateOfBirth">;
export function hsaCorrectionRecipient(personal: PersonalInfoData | undefined, owner: "primary" | "spouse"): HsaCorrectionRecipient | undefined {
  return owner === "primary" ? personal : personal?.spouse;
}
const tin = (value?: string) => (value ?? "").replace(/-/g, "");
const name = (value?: string) => (value ?? "").trim().toLocaleUpperCase("en-US");
const validMoney = (value: string | undefined): value is string => typeof value === "string" && /^\d{1,12}(?:\.\d{1,2})?$/.test(value);

export function hsaTimelyCorrectionErrors(record: HsaDistributionSource, taxYear: number, recipient?: HsaCorrectionRecipient): Record<string, string> {
  const errors: Record<string, string> = {};
  const facts = record.excessCorrection;
  if (record.distributionCode !== "2") return facts ? { savedCorrection: "Saved correction originals cannot be reinterpreted as another distribution code. Reconcile the actual source." } : errors;
  if (!facts) return { correctionOriginals: "Contribution returns require the original contribution and posted trustee correction facts; code 2 alone does not establish timely treatment." };
  if (taxYear !== 2026 || record.sourceTaxYear !== "2026" || facts.contributionTaxYear !== "2026") errors.correctionYear = "This correction worksheet requires actual 2026 contributions returned and received in 2026.";
  if (!record.sourceReference?.trim() || record.sourceReference.trim() !== facts.returnReference?.trim()) errors.correctionStatementReference = "Reconcile the independently entered original statement reference with the posted return original.";
  if (!/^\d{9}$/.test(tin(record.recipientSsn)) || tin(record.recipientSsn) !== tin(facts.recipientSsn)) errors.correctionStatementRecipient = "Reconcile the original statement recipient SSN with the actual correction recipient.";
  for (const [field, label] of correctionTextFields) if (!facts[field]?.trim()) errors[field] = `Enter the actual ${label}.`;
  for (const [field, label] of correctionMoneyFields) if (!validMoney(facts[field])) errors[field] = `Enter the actual nonnegative ${label} with at most twelve integer digits and two decimal places; blank is unknown.`;
  for (const [field, label] of correctionBooleanFields) if (facts[field] !== true) errors[field] = `Confirm from the originals: ${label}. Other correction treatments need their separate worksheet.`;
  if (!recipient || !/^\d{9}$/.test(tin(facts.recipientSsn)) || tin(facts.recipientSsn) !== tin(recipient.ssn) || !name(recipient.firstName) || !name(recipient.lastName) || name(facts.recipientFirstName) !== name(recipient.firstName) || name(facts.recipientLastName) !== name(recipient.lastName)) errors.correctionRecipient = "Reconcile the original full recipient identity with the actual current household owner.";
  if (!/^\d{9}$/.test(tin(facts.payerTin)) || tin(facts.payerTin) !== tin(record.payerTin) || !facts.accountReference?.trim() || facts.accountReference.trim() !== record.accountReference.trim()) errors.correctionAccount = "The correction and statement must identify the same trustee and actual account.";
  if (facts.contributionReference?.trim() === facts.returnReference?.trim()) errors.correctionReferences = "Distinguish the original contribution record from the posted return record.";
  if (!isActualDate(facts.contributionDate) || !facts.contributionDate?.startsWith("2026-") || !isActualDate(facts.returnReceivedDate) || !facts.returnReceivedDate?.startsWith("2026-") || facts.returnReceivedDate < facts.contributionDate || (recipient?.dateOfBirth !== undefined && facts.contributionDate < recipient.dateOfBirth)) errors.correctionDates = "Enter the actual 2026 contribution and received-return dates in order, after the owner's birth date. A request, future payment, next-year return or special deadline is not this same-year route.";
  // Guide admission uses the current local civil day; canonical calculations never read a clock.
  const now = new Date();
  const reviewDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!isActualDate(reviewDate) || (facts.contributionDate ?? "") > reviewDate || (facts.returnReceivedDate ?? "") > reviewDate) errors.correctionPosting = "The original contribution and posted return must actually have occurred on or before today's local calendar date. A future posting or payment cannot establish received treatment.";
  if (correctionMoneyFields.every(([field]) => validMoney(facts[field]))) {
    const principal = parseGuidedCurrency(facts.returnedPrincipal);
    if (!principal.gt(0) || principal.gt(parseGuidedCurrency(facts.contributionAmount))) errors.correctionPrincipal = "The posted principal must be positive and cannot exceed the original personal contribution.";
    if (!principal.plus(parseGuidedCurrency(facts.postedEarnings)).eq(parseGuidedCurrency(facts.postedGross))) errors.correctionSplit = "Posted gross must equal the actual returned principal plus all attributable earnings exactly; a loss needs its separate worksheet.";
    if (!validMoney(record.grossDistribution) || !validMoney(record.earningsOnExcessContributions) || !parseGuidedCurrency(facts.postedGross).eq(parseGuidedCurrency(record.grossDistribution)) || !parseGuidedCurrency(facts.postedEarnings).eq(parseGuidedCurrency(record.earningsOnExcessContributions))) errors.correctionBoxes = "Reconcile the posted gross and earnings exactly with original Form 1099-SA Boxes 1 and 2.";
  }
  if (record.events?.length !== 1 || record.events.some(event => event.distributionDate !== facts.returnReceivedDate || !validMoney(event.grossDistribution) || !validMoney(facts.postedGross) || !parseGuidedCurrency(event.grossDistribution).eq(parseGuidedCurrency(facts.postedGross)) || !validMoney(event.medicalExpenses) || !parseGuidedCurrency(event.medicalExpenses).isZero() || !validMoney(event.rolloverAmount) || !parseGuidedCurrency(event.rolloverAmount).isZero())) errors.correctionEvent = "Enter the one actual received-return event with matching posted date/gross and known zero medical and rollover allocations.";
  return errors;
}

export function hsaTimelyCorrectionAccountErrors(account: HsaAccountData, personal?: PersonalInfoData): Record<string, string> {
  const corrections = (account.distributions ?? []).filter(source => source.distributionCode === "2");
  if (!corrections.length) return account.correctionsRequired === true ? { corrections: "Returned contributions or relief need the actual correction worksheet before calculating." } : {};
  const errors: Record<string, string> = {};
  if (account.correctionsRequired !== true || corrections.length !== 1 || account.distributions?.length !== 1 || account.hasDistributions !== true) errors.corrections = "Confirm the actual correction and keep this owner's one correction original only once.";
  const recipient = account.accountOwner ? hsaCorrectionRecipient(personal, account.accountOwner) : undefined;
  const birthDate = recipient?.dateOfBirth ?? "";
  if (!recipient || !isActualDate(birthDate) || birthDate > "2026-12-31" || Number(birthDate.slice(0, 4)) <= 1971 || personal?.standardDeductionFacts?.shortTaxYear !== false || personal?.standardDeductionFacts?.primaryDeceased !== false || (account.accountOwner === "spouse" && personal?.standardDeductionFacts?.spouseDeceased !== false)) errors.correctionCohort = "This correction route requires the actual living, under-55 owner and an ordinary full calendar-year return.";
  if (account.contributionTaxYear !== "2026" || account.coverageByMonth?.length !== 12 || account.coverageByMonth.some(value => value !== "self_only") || account.medicareByMonth?.length !== 12 || account.medicareByMonth.some(value => value !== false) || account.otherDisqualifyingCoverageByMonth?.length !== 12 || account.otherDisqualifyingCoverageByMonth.some(value => value !== false) || account.canBeClaimedAsDependent !== false || account.useLastMonthRule !== false || account.testingPeriodFailure !== false) errors.correctionEligibility = "This complete ordinary correction requires twelve eligible self-only months with no dependent, Medicare, other coverage or testing-period treatment.";
  for (const field of ["employerW2Contributions", "employerPriorYearContributions", "employerFollowingYearContributions", "excessEmployerContributionsAlreadyInWages", "archerMsaContributions", "qualifiedFundingDistribution", "priorYearExcessContributions", "priorYearAdditionalTax"] as const) if (!validMoney(account[field]) || !parseGuidedCurrency(account[field]).isZero()) errors[`correction-${field}`] = "Employer, payroll, prior excess and other funding need their separate correction worksheet; enter known zero only when supported.";
  const facts = corrections[0]?.excessCorrection;
  if (!facts || !validMoney(facts.contributionAmount) || !validMoney(facts.returnedPrincipal) || !validMoney(account.contributionsMade) || !parseGuidedCurrency(facts.contributionAmount).minus(parseGuidedCurrency(facts.returnedPrincipal)).eq(parseGuidedCurrency(account.contributionsMade)) || !parseGuidedCurrency(account.contributionsMade).eq(FEDERAL_2026_CONSTANTS.hsa.selfOnlyContributionLimit)) errors.correctionNet = "Reconcile original personal contributions minus returned principal to the entered net personal contributions and the complete 2026 self-only limit. Do not deduct returned principal or remove otherwise deductible contributions.";
  // Distribution-level validation separately checks every actual original and recipient.
  return errors;
}

/** Called only after the original/owner/account checks above; parsing retains all canonical requirements. */
export function buildHsaTimelyCorrectionOriginal(record: HsaDistributionSource, owner: "primary" | "spouse") {
  const facts = record.excessCorrection;
  if (!facts || record.distributionCode !== "2") return undefined;
  return HsaTimelyPersonalContributionReturnSchema.parse({
    contributionTaxYear: Number(facts.contributionTaxYear), accountOwner: owner,
    recipientFirstName: facts.recipientFirstName, recipientLastName: facts.recipientLastName, recipientSsn: facts.recipientSsn,
    contributionSourceReference: facts.contributionReference, distributionSourceReference: facts.returnReference,
    payerTin: facts.payerTin, accountReference: facts.accountReference, contributionDate: facts.contributionDate,
    receivedDate: facts.returnReceivedDate, originalPersonalContributions: facts.contributionAmount,
    returnedPrincipal: facts.returnedPrincipal, postedGross: facts.postedGross, postedEarnings: facts.postedEarnings,
    hsaAccountConfirmed: facts.hsaAccountConfirmed, personalContributionConfirmed: facts.personalContributionConfirmed,
    completePersonalContributionInventoryConfirmed: facts.completePersonalContributionInventoryConfirmed,
    onlyCorrectionForOwner: facts.onlyCorrectionForOwner, postedAndNotReversed: facts.postedAndNotReversed,
    allAttributableIncomeReturned: facts.allAttributableIncomeReturned, ordinaryCalendarYearTaxpayer: facts.ordinaryCalendarYearTaxpayer,
    noSpecialRelief: facts.noSpecialRelief, sourceFactsConfirmed: record.sourceFactsConfirmed,
  });
}
