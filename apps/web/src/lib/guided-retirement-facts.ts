import type { FilingStatus, RetirementEntryData, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { buildGuidedIraBasisSources, type GuidedIraBasisContext } from "./guided-ira-basis";
import { isStartedRetirement } from "./guided-retirement-source-inputs";
export { isStartedRetirement } from "./guided-retirement-source-inputs";

export interface RetirementSourceData {
  sourceTaxYear?: string;
  payerTin?: string;
  accountReference?: string;
  accountHolder?: "primary" | "spouse" | "";
  taxableAmountNotDetermined?: boolean | null;
  taxableAmountConfirmed?: boolean | null;
  employeeContributions?: string;
  capitalGainIncluded?: string;
  netUnrealizedAppreciation?: string;
  otherSourceAmount?: string;
  inPlanRothRolloverAmount?: string;
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  stateWithheld?: string;
  stateDistribution?: string;
  localTaxReporting?: "none" | "single" | "multiple" | "";
  locality?: string;
  localTaxWithheld?: string;
  localDistribution?: string;
  iraBasisConfirmedZero?: boolean | null;
  eligibleGovernmental457bPlan?: boolean | null;
  governmental457bTransferredTaxableAmount?: string;
  directRolloverConfirmed?: boolean | null;
  militaryPensionOrSurvivorBenefit?: boolean | null;
  qualifiedJointSurvivorAnnuity?: boolean | null;
  trumpAccount?: boolean | null;
  excessContributionEarnings?: string;
  additionalWorksheetRequired?: boolean | null;
  otherRetirementWorksheetRequired?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
}

export const retirementSourceAmounts = [
  ["employeeContributions", "Employee contributions / insurance premiums (Box 5)"],
  ["capitalGainIncluded", "Capital gain included in Box 2a (Box 3)"],
  ["netUnrealizedAppreciation", "Net unrealized appreciation (Box 6)"],
  ["otherSourceAmount", "Other source amount (Box 8 / 2026 Box 8a)"],
  ["inPlanRothRolloverAmount", "Amount allocable to in-plan Roth rollover within five years (Box 10)"],
] as const;

export function retirementFactErrors(entries: RetirementEntryData[] | undefined, requireTaxableAmount = true, filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData, basisContext?: GuidedIraBasisContext): Record<string, string> {
  const errors: Record<string, string> = {};
  let basisBound = false;
  if (basisContext?.data) {
    try {
      basisBound = !!buildGuidedIraBasisSources(basisContext.data, entries, taxYear, filingStatus, basisContext.personal, basisContext.adjustments);
    } catch (error) { errors['retirement-basis-sources'] = error instanceof Error ? error.message : 'Complete and reconcile actual IRA basis sources.'; }
  }
  const sourceIds = new Set<string>();
  (entries ?? []).forEach((entry, index) => {
    if (!isStartedRetirement(entry)) return;
    const boundIra = basisBound && entry.isIraSepSimple === true;
    const fail = (key: string, message: string) => { errors[`retirement-${index}-${key}`] = message; };
    if (!entry.payer.trim()) fail("payer", "Enter the actual retirement payer.");
    if (!/^\d{9}$/.test(entry.payerTin?.replace(/-/g, "") ?? "")) fail("payer-tin", "Enter the actual nine-digit payer TIN from the source form.");
    if (!entry.accountReference?.trim()) fail("account", "Enter a local account reference that distinguishes this retirement statement.");
    const sourceId = `${entry.payerTin}|${entry.accountReference?.trim().toLowerCase()}`;
    if (entry.accountReference?.trim() && sourceIds.has(sourceId)) fail("duplicate", "Reconcile duplicate or corrected statements for this retirement account before calculating.");
    sourceIds.add(sourceId);
    if (!["2025", "2026"].includes(entry.sourceTaxYear ?? "") || (taxYear != null && entry.sourceTaxYear !== String(taxYear))) fail("year", "Confirm the actual retirement statement year matches this return.");
    if (!["primary", "spouse"].includes(entry.accountHolder ?? "")) fail("owner", "Confirm the actual retirement distribution recipient.");
    if (filingStatus && filingStatus !== "mfj" && entry.accountHolder === "spouse") fail("owner", "A spouse's retirement income requires a joint return or their separate return.");
    const code = entry.distributionCode.trim().toUpperCase();
    if (!/^[1-9ABCDEFGHJKLMNPQRSTUWY]{1,2}$/.test(code)) fail("code", "Enter the actual Form 1099-R distribution code from Box 7 (2026 Box 7a).");
    else if (!["1", "2", "4", "7", "G", "H", "1D", "2D", "4D", "7D", "D1", "D2", "D4", "D7"].includes(code)) fail("code", "This distribution code needs its actual basis, Roth, disability, QCD or other special worksheet; the ordinary guided route cannot calculate it yet.");
    if (code.includes("D") && (entry.isIraSepSimple !== false || entry.eligibleGovernmental457bPlan !== false)) fail("nonqualified-plan", "Code D identifies a nonqualified source; reconcile the actual IRA and governmental-plan classifications.");
    if (entry.requiresIraConfirmation) fail("isIraSepSimple", "Reconfirm the actual IRA checkbox; older versions prefilled an unchecked answer.");
    if (entry.requiresCodeConfirmation) fail("code", "Reconfirm the saved distribution code from the actual Form 1099-R; older versions prefilled code 7.");
    for (const [field, label] of [["grossDistribution", "gross distribution"], ...((requireTaxableAmount && !boundIra) || hasEnteredAmount(entry.taxableAmount) ? [["taxableAmount", "taxable amount; unknown amounts need their actual worksheet"]] : []), ["federalWithheld", "federal tax withheld"], ...retirementSourceAmounts] as [keyof RetirementEntryData, string][]) {
      const message = amountError(entry[field] as string | undefined, label); if (message) fail(field, message);
    }
    if (hasEnteredAmount(entry.taxableAmount) && !amountError(entry.taxableAmount, "taxable amount") && !amountError(entry.grossDistribution, "gross distribution") && parseGuidedCurrency(entry.taxableAmount).gt(parseGuidedCurrency(entry.grossDistribution))) fail("taxableAmount", "Taxable amount cannot exceed gross distribution; review the source form.");
    for (const field of ["isIraSepSimple", "taxableAmountNotDetermined", "eligibleGovernmental457bPlan", "militaryPensionOrSurvivorBenefit", "qualifiedJointSurvivorAnnuity"] as const) if (typeof entry[field] !== "boolean") fail(field, "Confirm the actual retirement source checkbox or classification; blank is not no.");
    if (requireTaxableAmount && !boundIra && entry.taxableAmountConfirmed !== true) fail("taxable-confirmation", "Confirm taxability from the actual source and applicable basis records; Box 2a or a default zero alone cannot establish it.");
    if (entry.isIraSepSimple === true && !boundIra && entry.iraBasisConfirmedZero !== true) fail("ira-basis", "An IRA with unknown or positive nondeductible basis requires the actual Form 8606 owner worksheet before calculation.");
    if (entry.eligibleGovernmental457bPlan === true) {
      if (entry.isIraSepSimple !== false) fail("457-plan", "A governmental 457(b) distribution cannot also be an IRA distribution.");
      const message = amountError(entry.governmental457bTransferredTaxableAmount, "457(b) taxable amount attributable to transferred qualified-plan funds");
      if (message) fail("457-transfer", message);
      else if (!amountError(entry.taxableAmount, "taxable amount") && parseGuidedCurrency(entry.governmental457bTransferredTaxableAmount).gt(parseGuidedCurrency(entry.taxableAmount))) fail("457-transfer", "The transferred-fund taxable amount cannot exceed this distribution's taxable amount.");
    }
    if (entry.eligibleGovernmental457bPlan === false && hasEnteredAmount(entry.governmental457bTransferredTaxableAmount) && (amountError(entry.governmental457bTransferredTaxableAmount, "457(b) transferred amount") || !parseGuidedCurrency(entry.governmental457bTransferredTaxableAmount).isZero())) fail("457-transfer", "Reconcile saved 457(b) transferred funds with the answer that this is not a governmental 457(b) plan.");
    if (entry.isIraSepSimple === true && entry.militaryPensionOrSurvivorBenefit === true) fail("military-plan", "An IRA distribution is not a U.S. military pension or survivor benefit. Reconcile the actual source classification.");
    if (entry.isIraSepSimple === false && entry.taxableAmountNotDetermined === true) fail("taxable-worksheet", "A pension with taxable amount not determined needs the actual Simplified Method or General Rule worksheet; this ordinary route cannot use a guessed Box 2a.");
    for (const field of ["capitalGainIncluded", "netUnrealizedAppreciation", "otherSourceAmount", "inPlanRothRolloverAmount"] as const) if (!amountError(entry[field], field) && parseGuidedCurrency(entry[field]).gt(0)) fail(field, "Preserve this actual source amount; it needs its additional retirement worksheet before calculation.");
    if (entry.isIraSepSimple === true && !amountError(entry.employeeContributions, "employee contributions") && parseGuidedCurrency(entry.employeeContributions).gt(0)) fail("ira-employee-contributions", "Positive IRA contribution/basis amounts need their actual Form 8606 history.");
    if (["G", "H"].includes(code)) {
      if (entry.directRolloverConfirmed !== true) fail("rollover", "Confirm the actual direct rollover destination and completion from source records.");
      if (!amountError(entry.taxableAmount, "taxable amount") && !parseGuidedCurrency(entry.taxableAmount).isZero()) fail("rollover-taxable", "Taxable rollover or conversion amounts need the actual conversion and basis worksheet.");
    }
    if (entry.sourceTaxYear === "2026") {
      if (entry.trumpAccount !== false) fail("trump-account", "Confirm the actual Box 7c checkbox. Trump-account distributions require their separate source worksheet and are not supported by this ordinary route.");
      const message = amountError(entry.excessContributionEarnings, "Box 7d earnings on excess contributions");
      if (message) fail("excess-earnings", message);
      else if (parseGuidedCurrency(entry.excessContributionEarnings).gt(0)) fail("excess-earnings", "Earnings on excess contributions need their actual return-of-contributions worksheet.");
    }
    for (const location of ["state", "local"] as const) {
      const reporting = location === "state" ? entry.stateTaxReporting : entry.localTaxReporting;
      const identity = location === "state" ? entry.state?.trim().toUpperCase() : entry.locality?.trim();
      const withheld = location === "state" ? entry.stateWithheld : entry.localTaxWithheld;
      const distribution = location === "state" ? entry.stateDistribution : entry.localDistribution;
      if (reporting === "single") {
        if (!identity || (location === "state" && !/^[A-Z]{2}$/.test(identity))) fail(`${location}-identity`, `Enter the actual ${location} identity from the retirement form.`);
        for (const [value, label] of [[withheld, `${location} tax withheld`], [distribution, `${location} distribution`]]) { const message = amountError(value, label!); if (message) fail(`${location}-${label}`, message); }
      } else if (reporting === "none") {
        if (identity || [withheld, distribution].some(value => hasEnteredAmount(value) && (amountError(value, "source amount") || !parseGuidedCurrency(value).isZero()))) fail(`${location}-reporting`, `Reconcile saved ${location} amounts with the answer that no ${location} section was reported.`);
      } else fail(`${location}-reporting`, reporting === "multiple" ? `Multiple ${location} retirement records need their separate source allocations.` : `Confirm actual ${location} reporting on the source form.`);
    }
    if (entry.stateTaxReporting === "single" && stateData?.additionalStateWithholdingEntries?.some(other => other.documentType === "1099-R" && other.payer.trim().toLowerCase() === entry.payer.trim().toLowerCase() && other.state === entry.state && other.taxYear === entry.sourceTaxYear)) fail("duplicate-withholding", "This retirement source withholding was also entered as additional state withholding. Reconcile it before counting the payment twice.");
    if (boundIra ? entry.otherRetirementWorksheetRequired !== false : entry.additionalWorksheetRequired !== false) fail("additional-worksheet", boundIra ? "Confirm whether another retirement method beyond the ordinary IRA basis records is needed." : "Confirm whether basis, Roth/conversion, QCD, contribution returns, disaster relief, penalty exceptions or other retirement worksheets are needed. Those unresolved facts must be completed before the ordinary route can calculate.");
    if (entry.sourceFactsConfirmed !== true) fail("confirmation", "Confirm the complete retirement source facts after the last edit.");
  });
  return errors;
}
