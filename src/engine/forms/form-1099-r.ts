/**
 * Form 1099-R aggregation helper.
 * Spec: spec/federal/form-1099-r.yaml
 *
 * Collapses retirement distribution inputs into the Form 1040 IRA and
 * pension/annuity reporting lines. This first slice supports basic gross
 * versus taxable reporting, direct rollovers, and Box 4 withholding.
 */

import Decimal from "decimal.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import type { Form1099R, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface SimplifiedMethodPayerCarryforward {
  payer: string;
  planIdentifier?: string;
  costInPlan: Decimal;
  priorYearRecovery: Decimal;
  currentYearExclusion: Decimal;
  cumulativeRecovery: Decimal;
  remainingCost: Decimal;
  fullyRecovered: boolean;
}

export interface Form1099RResult {
  iraGrossReported: Decimal;
  iraTaxable: Decimal;
  iraQualifiedCharitableDistributions: Decimal;
  iraRothConversions: Decimal;
  iraRecharacterizedContributions: Decimal;
  iraRolledOverDistributions: Decimal;
  iraReturnedContributionsByDueDate: Decimal;
  iraReturnedContributionsByDueDateTaxableEarnings: Decimal;
  iraReturnedExcessContributions: Decimal;
  disabilityPensionWages: Decimal;
  disabilityPensionPublicSafetyOfficerPremiumExclusion: Decimal;
  pensionGrossReported: Decimal;
  pensionTaxable: Decimal;
  pensionPublicSafetyOfficerPremiumExclusion: Decimal;
  federalWithholding: Decimal;
  /** Per-payer Simplified Method cost recovery carryforward for automated year-over-year tracking */
  simplifiedMethodCarryforward: SimplifiedMethodPayerCarryforward[];
  lines: CalculatedLine[];
}

const DIRECT_ROLLOVER_CODES = new Set(["G", "H"]);
// Code S itself identifies a SIMPLE IRA distribution even if the checkbox is missing.
const IMPLICIT_IRA_REPORTING_CODES = new Set(["J", "N", "Q", "R", "S", "T", "Y"]);
const RETIRED_PUBLIC_SAFETY_OFFICER_PREMIUM_CAP = new Decimal(3000);
const SIMPLIFIED_METHOD_DATE_1986_07_02 = Date.UTC(1986, 6, 2);
const SIMPLIFIED_METHOD_DATE_1996_11_19 = Date.UTC(1996, 10, 19);
const SIMPLIFIED_METHOD_DATE_1998_01_01 = Date.UTC(1998, 0, 1);

interface SimplifiedMethodExpectedPaymentsResolution {
  expectedPayments?: number;
  source?: string;
}

function getUpperDistributionCode(form: Form1099R): string {
  return form.distributionCode?.toUpperCase() ?? "";
}

function hasImplicitIraReportingCode(form: Form1099R): boolean {
  return [...getUpperDistributionCode(form)].some((char) => IMPLICIT_IRA_REPORTING_CODES.has(char));
}

export function isIraForm1099RDistribution(form: Form1099R): boolean {
  return form.iraSepSimple || hasImplicitIraReportingCode(form);
}

function isRecharacterizedIraContribution(form: Form1099R): boolean {
  const upperCode = getUpperDistributionCode(form);
  return upperCode.includes("N") || upperCode.includes("R");
}

function hasQualifiedCharitableDistributionCode(form: Form1099R): boolean {
  return getUpperDistributionCode(form).includes("Y");
}

function getNormalizedDistributionCodes(form: Form1099R): string[] {
  return [...new Set(getUpperDistributionCode(form).replace(/\s+/g, "").split("").filter(Boolean))];
}

function hasStandaloneQualifiedRothDistributionCode(form: Form1099R): boolean {
  const normalizedCodes = getNormalizedDistributionCodes(form);
  return normalizedCodes.length === 1 && (normalizedCodes[0] === "J" || normalizedCodes[0] === "T");
}

type QcdOwner = NonNullable<Form1099R["accountHolder"]>;

interface RetirementAggregationOptions {
  qcdAnnualLimit?: Decimal;
  taxYear?: number;
  hasValidatedIraBasisSources?: boolean;
  isJointReturn?: boolean;
  hasJointSpouse?: boolean;
  qcdReturnContext?: Pick<TaxYearInput, "taxpayer" | "form8606" | "form8606ByOwner" | "iraBasisSources"
    | "adjustments" | "iraDeductionWorksheet" | "donations">;
}

function hasQcdClaim(form: Form1099R): boolean {
  return form.qcdSource !== undefined || hasQualifiedCharitableDistributionCode(form)
    || !d(form.qualifiedCharitableDistribution).isZero();
}

function actualCalendarDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return date;
}

function qcdAgeEligible(dateOfBirth: string | undefined, transferDate: Date): boolean {
  const birth = actualCalendarDate(dateOfBirth);
  if (!birth) return false;
  const year = birth.getUTCFullYear() + 70;
  const month = birth.getUTCMonth() + 6;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const attainment = new Date(Date.UTC(year, month, Math.min(birth.getUTCDate(), lastDay)));
  return transferDate >= attainment;
}

function sameOriginalQcdStatement(source: Form1099R, other: Form1099R): boolean {
  if (other.iraSepSimple !== true || other.taxYear !== source.taxYear || other.accountHolder !== source.accountHolder
    || other.accountReference?.trim().toLowerCase() !== source.accountReference?.trim().toLowerCase()) return false;
  const sourceTin = source.payerTin?.replace(/[-\s]/gu, "");
  const otherTin = other.payerTin?.replace(/[-\s]/gu, "");
  if (sourceTin && otherTin) return sourceTin === otherTin;
  return other.payer.trim().toLowerCase() === source.payer.trim().toLowerCase();
}

function resolve2026QcdSources(
  forms: Form1099R[],
  options: RetirementAggregationOptions,
) {
  const input = options.qcdReturnContext;
  if (input?.form8606 !== undefined || input?.form8606ByOwner !== undefined || input?.iraBasisSources !== undefined) {
    throw new Error("2026 Form 1099-R QCD with Form 8606 requires separate IRA basis coordination");
  }
  if (input && (d(input.adjustments?.iraDeduction).gt(0) || d(input.iraDeductionWorksheet?.primaryContributions).gt(0)
    || d(input.iraDeductionWorksheet?.spouseContributions).gt(0))) {
    throw new Error("2026 Form 1099-R QCD with a current IRA deduction requires separate Pub. 590-B coordination");
  }
  const includedForms = new Set<Form1099R>();
  const transferReferences = new Set<string>();
  const underlyingTransfers = new Set<string>();
  const byOwner = new Map<QcdOwner, { worksheet: string; prior: Decimal; current: Decimal; transfers: Decimal }>();

  for (const form of forms.filter(hasQcdClaim)) {
    const source = form.qcdSource;
    const code = getUpperDistributionCode(form).replace(/\s+/gu, "");
    if (code !== "Y7" && code !== "7") {
      throw new Error("2026 Form 1099-R QCD Code Y outside ordinary Y7 and non-Code-7 methods require a separate method");
    }
    if (!source) {
      throw new Error("2026 Form 1099-R QCD requires an actual owner worksheet and transfer source; a manual QCD amount is insufficient");
    }
    if (!d(form.qualifiedCharitableDistribution).isZero()) {
      throw new Error("2026 Form 1099-R QCD cannot combine the actual owner worksheet with a manual QCD amount");
    }
    if (form.iraSepSimple !== true) throw new Error("2026 Form 1099-R QCD requires the actual IRA classification");
    if (options.hasValidatedIraBasisSources || form.returnedContributionByDueDate || form.excessContributionReturnedWithoutEarnings
      || form.qualifiedRothDistribution || !d(form.rothConversionAmount).isZero() || !d(form.rothIraRolledOverAmount).isZero()
      || !d(form.capitalGainIncluded).isZero()) {
      throw new Error("2026 Form 1099-R QCD with IRA basis, conversion or another distribution classification requires a separate method");
    }
    // For ordinary Y7, apply the same original IRA evidence requirements as Code 7.
    assert2026IraTaxability({ ...form, distributionCode: "7" }, false, options.hasJointSpouse === true);
    const owner = form.accountHolder;
    if (owner === undefined) throw new Error("2026 Form 1099-R QCD requires an actual return owner");
    const payer = form.payer.trim();
    const account = form.accountReference?.trim();
    const transfer = source.transferReference?.trim();
    const recipient = source.recipientName?.trim();
    const worksheet = source.adjustmentWorksheetReference?.trim();
    if (!payer || !account || !transfer || !recipient || !worksheet) {
      throw new Error("2026 Form 1099-R QCD requires the actual payer, IRA account, recipient, transfer reference and owner worksheet reference");
    }
    if (source.ordinaryTraditionalIraConfirmed !== true || source.ageRequirementConfirmed !== true
      || source.directTrusteeTransferConfirmed !== true || source.eligibleRecipientAndAcknowledgmentConfirmed !== true
      || source.allOwnerTransfersAndContributionsConfirmed !== true) {
      throw new Error("2026 Form 1099-R QCD requires all eligibility, acknowledgment and owner worksheet confirmations");
    }
    const transferDate = actualCalendarDate(source.distributionDate);
    if (!transferDate || transferDate.getUTCFullYear() !== 2026
      || (form.distributionDate !== undefined && form.distributionDate !== source.distributionDate)) {
      throw new Error("2026 Form 1099-R QCD requires a valid distribution date matching the original date when supplied");
    }
    if (input && !qcdAgeEligible(input.taxpayer[owner]?.dateOfBirth, transferDate)) {
      throw new Error("2026 Form 1099-R QCD owner must have attained age 70½ by the actual distribution date");
    }
    const amount = d(source.transferAmount);
    const beforeQcd = resolveTaxableAmountBeforeQcd(form);
    if (!amount.isFinite() || !amount.gt(0) || amount.gt(beforeQcd) || (code === "Y7" && !amount.eq(beforeQcd))) {
      throw new Error("2026 Form 1099-R QCD transfer amount must reconcile to the otherwise taxable original distribution");
    }
    const prior = d(source.unusedPriorDeductedContributions);
    const current = d(source.currentDeductedContributions);
    if (!source.unusedPriorDeductedContributions?.trim() || !source.currentDeductedContributions?.trim()
      || !prior.isFinite() || prior.lt(0) || !current.isFinite() || current.lt(0)) {
      throw new Error("2026 Form 1099-R QCD requires both actual nonnegative contribution amounts, including known zero");
    }
    if (input && current.gt(0)) {
      throw new Error("2026 Form 1099-R QCD with a current IRA deduction requires separate Pub. 590-B coordination");
    }
    const underlyingTransfer = JSON.stringify([owner, payer.toLowerCase(), account.toLowerCase(), source.distributionDate,
      amount.toString()]);
    if (transferReferences.has(transfer.toLowerCase()) || underlyingTransfers.has(underlyingTransfer)) {
      throw new Error("2026 Form 1099-R QCD has a duplicate original transfer");
    }
    transferReferences.add(transfer.toLowerCase());
    underlyingTransfers.add(underlyingTransfer);
    includedForms.add(form);

    const summary = byOwner.get(owner);
    if (summary && (summary.worksheet !== worksheet || !summary.prior.eq(prior) || !summary.current.eq(current))) {
      throw new Error("2026 Form 1099-R QCD has inconsistent copies of the same owner worksheet");
    }
    byOwner.set(owner, { worksheet, prior, current, transfers: (summary?.transfers ?? d(0)).plus(amount) });
  }

  for (const source of includedForms) {
    if (forms.filter(other => sameOriginalQcdStatement(source, other)).length > 1) {
      throw new Error("2026 QCD requires reconciliation of a duplicate original Form 1099-R statement");
    }
  }

  const limit = FEDERAL_2026_CONSTANTS.qcd.annualLimit;
  const ownerAmounts = [...byOwner].map(([owner, summary]) => {
    const capped = Decimal.min(summary.transfers, limit);
    const adjusted = Decimal.max(0, capped.minus(summary.prior).minus(summary.current));
    return { owner, ...summary, capped, adjusted };
  });
  if (input) {
    const ownersTakingExclusions = new Set(ownerAmounts.filter(summary => summary.adjusted.gt(0)).map(summary => summary.owner));
    const cashReceiptKeys = new Set(input.donations
      .filter(donation => donation.type === "cash" && donation.qualifiedOrganization !== false && d(donation.amount).gt(0))
      .map(donation => JSON.stringify([donation.organization.trim().toLowerCase(), donation.dateOfDonation])));
    for (const form of includedForms) {
      const source = form.qcdSource;
      if (form.accountHolder !== undefined && ownersTakingExclusions.has(form.accountHolder)
        && cashReceiptKeys.has(JSON.stringify([source?.recipientName?.trim().toLowerCase(), source?.distributionDate]))) {
        throw new Error("2026 Form 1099-R QCD and an overlapping cash gift must reconcile to distinct sources before a deduction");
      }
    }
  }

  return {
    includedForms,
    ownerAmounts,
    limit,
    totalTransfers: sum(...ownerAmounts.map(summary => summary.transfers)),
    exclusion: sum(...ownerAmounts.map(summary => summary.adjusted)),
  };
}

function resolveQualifiedCharitableDistributionLimit(
  iraForms: Form1099R[],
  qcdAnnualLimit?: Decimal
): {
  uncappedQualifiedCharitableDistributions: Decimal;
  qualifiedCharitableDistributions: Decimal;
  qcdExcess: Decimal;
  ownerAwareLimitApplication?: string;
} {
  const uncappedQualifiedCharitableDistributions = sum(
    ...iraForms.map(resolveQualifiedCharitableDistribution)
  );

  if (!qcdAnnualLimit) {
    return {
      uncappedQualifiedCharitableDistributions,
      qualifiedCharitableDistributions: uncappedQualifiedCharitableDistributions,
      qcdExcess: new Decimal(0),
    };
  }

  const fullyOwnerAttributedIraForms = iraForms.length > 0
    && iraForms.every((form) => form.accountHolder !== undefined);

  if (!fullyOwnerAttributedIraForms) {
    const qualifiedCharitableDistributions = Decimal.min(
      uncappedQualifiedCharitableDistributions,
      qcdAnnualLimit
    );
    return {
      uncappedQualifiedCharitableDistributions,
      qualifiedCharitableDistributions,
      qcdExcess: uncappedQualifiedCharitableDistributions.minus(qualifiedCharitableDistributions),
    };
  }

  const ownerSummaries = (
    ["primary", "spouse"] as const
  ).map((owner) => {
    const ownerQualifiedCharitableDistributions = sum(
      ...iraForms
        .filter((form) => form.accountHolder === owner)
        .map(resolveQualifiedCharitableDistribution)
    );
    return {
      owner,
      uncapped: ownerQualifiedCharitableDistributions,
      capped: Decimal.min(ownerQualifiedCharitableDistributions, qcdAnnualLimit),
    };
  }).filter((summary) => summary.uncapped.greaterThan(0));

  const qualifiedCharitableDistributions = sum(...ownerSummaries.map((summary) => summary.capped));
  const ownerAwareLimitApplication = ownerSummaries.length > 1
    ? ownerSummaries
      .map((summary) => `${summary.owner}: ${summary.uncapped.toString()} -> ${summary.capped.toString()}`)
      .join("; ")
    : undefined;

  return {
    uncappedQualifiedCharitableDistributions,
    qualifiedCharitableDistributions,
    qcdExcess: uncappedQualifiedCharitableDistributions.minus(qualifiedCharitableDistributions),
    ownerAwareLimitApplication,
  };
}

export function calculateForm1099R(
  forms: Form1099R[] = [],
  options: RetirementAggregationOptions = {},
): Form1099RResult {
  const hasJointSpouse = options.hasJointSpouse === true;
  const isJointReturn = options.isJointReturn ?? hasJointSpouse;
  const hasActualQcdSources = forms.some(form => form.qcdSource !== undefined);
  const use2026Rules = options.taxYear === 2026 || (options.taxYear === undefined
    && (hasActualQcdSources || forms.some(form => form.taxYear === 2026 && hasQcdClaim(form))));
  if (hasActualQcdSources && !use2026Rules) {
    throw new Error("Actual Form 1099-R QCD worksheets require the matching 2026 return");
  }
  const qcdReturn = options.qcdReturnContext;
  if (use2026Rules && qcdReturn && [
    qcdReturn.form8606, qcdReturn.form8606ByOwner?.primary, qcdReturn.form8606ByOwner?.spouse,
  ].some(form => !d(form?.qualifiedCharitableDistributions).isZero())) {
    throw new Error("2026 QCD manual Form 8606 numbers require separate reconciliation with the actual owner worksheet");
  }
  const currentQcd = use2026Rules && forms.some(hasQcdClaim) ? resolve2026QcdSources(forms, options) : undefined;

  if (use2026Rules) {
    for (const form of forms) {
      if (form.trumpAccount === true) throw new Error("2026 Form 1099-R Trump account distributions require a separate method");
      if (form.excessContributionEarnings !== undefined && !d(form.excessContributionEarnings).isZero()) {
        throw new Error("2026 Form 1099-R Box 7d earnings require a separate method");
      }
      if (form.qualifiedLumpSumReporting === "form_4972") {
        throw new Error("The Form 4972 election requires a separate qualified lump-sum method");
      }
      if (form.qualifiedLumpSumReporting === "ordinary_pension" && !getUpperDistributionCode(form).includes("A")) {
        throw new Error("2026 Form 1099-R ordinary lump-sum reporting decision requires Code A");
      }
      if (currentQcd?.includedForms.has(form)) continue;
      if (isIraForm1099RDistribution(form)) {
        assert2026IraTaxability(form, options.hasValidatedIraBasisSources === true, options.hasJointSpouse === true);
      } else {
        assert2026PensionTaxability(form);
      }
    }
  } else if (options.taxYear !== undefined
    && forms.some(form => form.taxYear !== undefined && form.taxYear !== options.taxYear)) {
    throw new Error(`Form 1099-R source year must match the ${options.taxYear} return`);
  }
  if (options.taxYear === 2025) {
    const datedDistributions = forms.filter(form => form.taxYear === 2025
      && form.iraSepSimple === false && d(form.grossDistribution).gt(0));
    if (datedDistributions.some(form => !form.distributionCode?.trim())) {
      throw new Error("2025 Form 1099-R requires the actual Box 7 distribution code");
    }
    const unresolvedPension = datedDistributions.find(form => {
      if (form.taxableAmount !== undefined) return false;
      const code = form.distributionCode?.trim();
      const box2b = form.taxableAmountNotDetermined;
      const ordinaryPensionNeedsAmount = (code === "1" || code === "7")
        && (box2b === true || (box2b === false && !d(form.employeeContributions).gt(0)));
      return (code === "4" || ordinaryPensionNeedsAmount)
        && resolveTaxableAmountBeforeQcdSource(form).source === "historical-preview";
    });
    if (unresolvedPension) {
      if (unresolvedPension.distributionCode?.trim() === "4") {
        throw new Error("2025 Form 1099-R Code 4 survivor pension requires the actual Box 2a or a supported taxable-amount worksheet");
      }
      throw new Error(unresolvedPension.taxableAmountNotDetermined
        ? "2025 Form 1099-R pension with checked Box 2b and missing Box 2a requires a supported taxable-amount worksheet"
        : "2025 Form 1099-R pension with unchecked Box 2b and missing Box 2a requires the actual taxable amount or a supported taxable-amount worksheet");
    }
  }
  const audit = new AuditTrail();
  const iraForms = forms.filter(isIraForm1099RDistribution);
  const disabilityPensionForms = forms.filter(isDisabilityPensionTaxableAsWages);
  const pensionForms = forms.filter((form) => !isIraForm1099RDistribution(form) && !isDisabilityPensionTaxableAsWages(form));

  const qcdLimitResolution = resolveQualifiedCharitableDistributionLimit(
    currentQcd ? [] : iraForms,
    options.qcdAnnualLimit,
  );
  const uncappedIraQualifiedCharitableDistributions =
    qcdLimitResolution.uncappedQualifiedCharitableDistributions;
  const iraQualifiedRothDistributions = sum(...iraForms.map(resolveQualifiedRothDistributionAmount));
  const iraRothConversions = sum(...iraForms.map(resolveRothConversionAmount));
  const iraRecharacterizedContributions = sum(...iraForms.map(resolveRecharacterizedIraContributionAmount));
  const iraRolledOverDistributions = sum(...iraForms.map(resolveExcludableRolloverAmount));
  const iraReturnedContributionsByDueDate = sum(...iraForms.map(resolveReturnedContributionByDueDateAmount));
  const iraReturnedContributionsByDueDateTaxableEarnings = sum(...iraForms.map(resolveReturnedContributionByDueDateTaxableAmount));
  const iraReturnedExcessContributions = sum(...iraForms.map(resolveReturnedExcessContributionAmount));

  // ── QCD annual limit enforcement (IRC §408(d)(8)(A)) ──────────
  // Each IRA owner may exclude up to the annual limit in QCDs per year.
  // Excess QCDs beyond the limit are taxable IRA income.
  const qcdAnnualLimit = options.qcdAnnualLimit;
  const iraQualifiedCharitableDistributions = currentQcd?.exclusion ?? qcdLimitResolution.qualifiedCharitableDistributions;
  const qcdExcess = qcdLimitResolution.qcdExcess;

  // The current owner worksheet excludes only its net allowable amount.
  // Historical per-statement amounts instead add back their cap excess.
  const iraTaxable = currentQcd
    ? sum(...iraForms.map(resolveTaxableAmountBeforeQcd)).minus(currentQcd.exclusion)
    : sum(...iraForms.map(resolveForm1099RTaxableAmount)).plus(qcdExcess);
  const pensionSimplifiedMethodForms = pensionForms.filter(usesSimplifiedMethodForTaxableAmount);

  // ── Payer-level Simplified Method aggregation (Pub 575) ──────────
  // Group Simplified Method forms by payer+plan so same-plan forms share
  // a single exclusion calculation with aggregated payments.
  const payerGroupExclusionOverrides = buildPayerGroupedSimplifiedMethodExclusions(pensionSimplifiedMethodForms);
  for (const group of payerGroupExclusionOverrides.payerGroups) {
    if (group.forms.length < 2 ||
      !group.forms.some((form) => resolveRetiredPublicSafetyOfficerInsurancePremiums(form).gt(0))) continue;
    if (isJointReturn && hasJointSpouse && new Set(group.forms.map((form) => form.accountHolder)).size > 1) {
      throw new Error("Retired public safety officer premiums require a Simplified Method group with one verified owner");
    }
    const payerTins = new Set(group.forms
      .map((form) => form.payerTin?.replace(/[-\s]/gu, "") ?? "")
      .filter((tin) => /^\d{9}$/u.test(tin)));
    if (payerTins.size > 1) {
      throw new Error("Retired public safety officer premiums require review when a Simplified Method group has conflicting payer TINs");
    }
  }

  const pensionSimplifiedMethodExpectedPayments = pensionSimplifiedMethodForms.map(resolveSimplifiedMethodExpectedPayments);
  const pensionSimplifiedMethodExpectedPaymentSources = pensionSimplifiedMethodForms.map(
    resolveSimplifiedMethodExpectedPaymentsSource
  );
  const pensionSimplifiedMethodPayerLevelExpectedPaymentDetails = pensionSimplifiedMethodForms.map((form) => ({
    payer: form.payer,
    expectedPayments: resolveSimplifiedMethodExpectedPayments(form),
    source: resolveSimplifiedMethodExpectedPaymentsSource(form),
  }));
  const pensionQualifiedDesignatedRothDistributions = sum(
    ...pensionForms.map(resolveQualifiedDesignatedRothDistributionAmount)
  );
  const pensionDesignatedRothDirectRollovers = sum(
    ...pensionForms.map(resolveDesignatedRothDirectRolloverAmount)
  );
  const pensionSection1035ExchangeBlankBox2aDistributions = sum(
    ...pensionForms.map(resolveSection1035ExchangeBlankBox2aAmount)
  );
  const pensionSimplifiedMethodPriorYearRecovery = sum(
    ...payerGroupExclusionOverrides.payerGroups.map((g) => g.priorYearRecovery)
  );
  const pensionSimplifiedMethodCurrentYearExclusion = sum(
    ...payerGroupExclusionOverrides.payerGroups.map((g) => g.payerLevelExclusion)
  );
  const disabilityPensionSources = disabilityPensionForms.map((form) =>
    pensionTaxableSource(form, resolveForm1099RTaxableAmount(form)));
  const pensionSources = pensionForms.map((form) => pensionTaxableSource(
    form,
    resolveForm1099RTaxableAmountWithPayerGrouping(form, payerGroupExclusionOverrides.formOverrides),
  ));
  const disabilityPensionTaxableBeforePublicSafetyOfficerExclusion =
    sum(...disabilityPensionSources.map((source) => source.taxableAmount));
  const pensionTaxableBeforePublicSafetyOfficerExclusion = sum(...pensionSources.map((source) => source.taxableAmount));
  const pensionRetiredPublicSafetyOfficerInsurancePremiums = sum(...pensionSources.map((source) => source.premiums));
  const {
    disabilityExclusion: disabilityPensionPublicSafetyOfficerPremiumExclusion,
    pensionExclusion: pensionPublicSafetyOfficerPremiumExclusion,
  } = calculatePublicSafetyOfficerPremiumExclusions(
    disabilityPensionSources, pensionSources, isJointReturn, hasJointSpouse,
  );
  const disabilityPensionWages = Decimal.max(
    new Decimal(0),
    disabilityPensionTaxableBeforePublicSafetyOfficerExclusion.minus(disabilityPensionPublicSafetyOfficerPremiumExclusion)
  );
  const pensionTaxable = Decimal.max(
    new Decimal(0),
    pensionTaxableBeforePublicSafetyOfficerExclusion.minus(pensionPublicSafetyOfficerPremiumExclusion)
  );
  const shouldReportIraGross = currentQcd ? currentQcd.exclusion.gt(0) || shouldReportGross(
    iraForms.filter(form => !currentQcd.includedForms.has(form))
  ) : shouldReportGross(iraForms);
  const iraGrossReported = shouldReportIraGross
    ? sum(...iraForms.map((form) => d(form.grossDistribution)))
    : new Decimal(0);
  const pensionGrossReported = (
    pensionPublicSafetyOfficerPremiumExclusion.greaterThan(0)
    || shouldReportGross(pensionForms, { includeTaxableAmountNotDetermined: true })
  )
    ? sum(...pensionForms.map((form) => d(form.grossDistribution)))
    : new Decimal(0);
  const federalWithholding = sum(...forms.map((form) => d(form.federalWithheld)));

  audit.record(
    "Form 1099-R",
    "1",
    "IRA gross distributions reported on Form 1040 Line 4a",
    iraGrossReported,
    shouldReportIraGross
      ? "Sum Box 1 for IRA/SEP/SIMPLE Forms 1099-R because at least one IRA distribution is not fully taxable, is a direct rollover, is a validated Roth conversion, or is a Roth IRA distribution that must stay visible on Form 1040 Line 4a"
      : "Blank on Form 1040 Line 4a because all IRA distributions are fully taxable or absent",
    {
      "IRA forms": iraForms.length.toString(),
      "Recharacterized IRA contributions": iraRecharacterizedContributions,
    }
  );
  audit.record(
    "Form 1099-R",
    "2",
    "IRA taxable distributions reported on Form 1040 Line 4b",
    iraTaxable,
    currentQcd
      ? "Include otherwise taxable IRA distributions, less only the allowable 2026 QCD after each owner's indexed cap and contribution adjustment (IRC §408(d)(8)(A))"
      : qcdExcess.greaterThan(0) && qcdLimitResolution.ownerAwareLimitApplication !== undefined
      ? `Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts capped separately per known IRA owner at annual limit $${qcdAnnualLimit} (IRC §408(d)(8)(A)); $${qcdExcess} excess QCD added back to taxable`
      : qcdExcess.greaterThan(0)
      ? `Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts capped at annual limit $${qcdAnnualLimit} (IRC §408(d)(8)(A)); $${qcdExcess} excess QCD added back to taxable`
      : "Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts without going below zero",
    {
      "IRA forms": iraForms.length.toString(),
      "Qualified charitable distributions (capped)": iraQualifiedCharitableDistributions,
      ...(currentQcd ? {
        "Documented QCD transfers": currentQcd.totalTransfers,
        "QCD annual limit per IRA owner": currentQcd.limit,
        "Documented QCD transfers remaining taxable": currentQcd.totalTransfers.minus(currentQcd.exclusion),
        ...Object.fromEntries(currentQcd.ownerAmounts.flatMap(summary => [
          [`QCD ${summary.owner} transfers after owner limit`, summary.capped],
          [`QCD ${summary.owner} unused prior deducted contributions`, summary.prior],
          [`QCD ${summary.owner} current deducted contributions`, summary.current],
          [`QCD ${summary.owner} allowed exclusion`, summary.adjusted],
        ])),
      } : {}),
      ...(qcdExcess.greaterThan(0) ? {
        "Uncapped qualified charitable distributions": uncappedIraQualifiedCharitableDistributions,
        "QCD annual limit": qcdAnnualLimit ?? new Decimal(0),
        "QCD excess added back to taxable": qcdExcess,
      } : {}),
      ...(qcdLimitResolution.ownerAwareLimitApplication === undefined ? {} : {
        "QCD owner-aware limit application": qcdLimitResolution.ownerAwareLimitApplication,
      }),
      "Validated qualified Roth IRA code J distributions": iraQualifiedRothDistributions,
      "Validated Roth conversion amounts": iraRothConversions,
      "Recharacterized IRA contributions": iraRecharacterizedContributions,
      "Excludable rollover amount": iraRolledOverDistributions,
      "Returned contributions by due date": iraReturnedContributionsByDueDate,
      "Taxable earnings on returned contributions by due date": iraReturnedContributionsByDueDateTaxableEarnings,
      "Returned excess contributions": iraReturnedExcessContributions,
    }
  );
  audit.record(
    "Form 1099-R",
    "3",
    "Pension and annuity gross distributions reported on Form 1040 Line 5a",
    pensionGrossReported,
    pensionPublicSafetyOfficerPremiumExclusion.greaterThan(0)
      ? "Sum Box 1 for non-IRA Forms 1099-R because the retired public safety officer insurance premium exclusion makes the pension distributions not fully taxable"
      : shouldReportGross(pensionForms, { includeTaxableAmountNotDetermined: true })
      ? "Sum Box 1 for non-IRA Forms 1099-R because at least one pension distribution is not fully taxable, is a direct rollover, is a validated qualified designated Roth account distribution, or has taxable amount not determined checked"
      : "Blank on Form 1040 Line 5a because all pension distributions are fully taxable or absent",
    {
      "Pension forms": pensionForms.length.toString(),
      "Disability pensions taxed as wages": disabilityPensionForms.length.toString(),
      "Validated qualified designated Roth account distributions": pensionQualifiedDesignatedRothDistributions,
      "Designated Roth direct rollovers to Roth IRAs": pensionDesignatedRothDirectRollovers,
      "Supported section 1035 exchanges with blank Box 2a": pensionSection1035ExchangeBlankBox2aDistributions,
      "Retired public safety officer premium exclusion": pensionPublicSafetyOfficerPremiumExclusion,
    }
  );
  audit.record(
    "Form 1099-R",
    "4",
    "Pension and annuity taxable distributions reported on Form 1040 Line 5b",
    pensionTaxable,
    pensionPublicSafetyOfficerPremiumExclusion.greaterThan(0)
      ? pensionSimplifiedMethodForms.length > 0
        ? "Sum taxable non-IRA distributions from Box 2a, or from validated Simplified Method worksheet inputs when Box 2a is blank or Box 2b says taxable amount not determined, or from $0 taxable for validated qualified designated Roth account Box 7 code B distributions, or from $0 taxable for supported Box 7 code 6 section 1035 exchanges when Box 2a is blank, or from $0 taxable for direct-rollover codes when Box 2a is blank, or from Box 1 minus Box 5 when employee contributions are provided on non-rollover distributions, otherwise Box 1, then subtract the retired public safety officer insurance premium exclusion"
        : "Sum taxable non-IRA distributions from Box 2a, or from $0 taxable for validated qualified designated Roth account Box 7 code B distributions, or from $0 taxable for supported Box 7 code 6 section 1035 exchanges when Box 2a is blank, or from $0 taxable for direct-rollover codes when Box 2a is blank, or from Box 1 minus Box 5 when employee contributions are provided on non-rollover distributions, otherwise Box 1, then subtract the retired public safety officer insurance premium exclusion"
      : pensionSimplifiedMethodForms.length > 0
        ? "Sum taxable non-IRA distributions from Box 2a, or from validated Simplified Method worksheet inputs when Box 2a is blank or Box 2b says taxable amount not determined, or from $0 taxable for validated qualified designated Roth account Box 7 code B distributions, or from $0 taxable for supported Box 7 code 6 section 1035 exchanges when Box 2a is blank, or from $0 taxable for direct-rollover codes when Box 2a is blank, or from Box 1 minus Box 5 when employee contributions are provided on non-rollover distributions, otherwise Box 1"
        : "Sum taxable non-IRA distributions from Box 2a, or from $0 taxable for validated qualified designated Roth account Box 7 code B distributions, or from $0 taxable for supported Box 7 code 6 section 1035 exchanges when Box 2a is blank, or from $0 taxable for direct-rollover codes when Box 2a is blank, or from Box 1 minus Box 5 when employee contributions are provided on non-rollover distributions, otherwise Box 1",
    {
      "Pension forms": pensionForms.length.toString(),
      "Disability pensions taxed as wages": disabilityPensionWages,
      "Validated qualified designated Roth account distributions": pensionQualifiedDesignatedRothDistributions,
      "Designated Roth direct rollovers to Roth IRAs": pensionDesignatedRothDirectRollovers,
      "Supported section 1035 exchanges with blank Box 2a": pensionSection1035ExchangeBlankBox2aDistributions,
      "Validated retired public safety officer insurance premiums": pensionRetiredPublicSafetyOfficerInsurancePremiums,
      "Disability-pension public safety officer premium exclusion": disabilityPensionPublicSafetyOfficerPremiumExclusion,
      "Retired public safety officer premium exclusion": pensionPublicSafetyOfficerPremiumExclusion,
      ...(pensionSimplifiedMethodForms.length > 0
        ? {
          "Simplified Method forms": pensionSimplifiedMethodForms.length.toString(),
          "Simplified Method expected payments": formatSimplifiedMethodExpectedPaymentsAuditInput(
            pensionSimplifiedMethodExpectedPayments
          ),
          "Simplified Method expected-payments source": formatSimplifiedMethodExpectedPaymentsSourceAuditInput(
            pensionSimplifiedMethodExpectedPaymentSources
          ),
          "Simplified Method payer-level expected-payments detail": formatSimplifiedMethodPayerLevelExpectedPaymentsAuditInput(
            pensionSimplifiedMethodPayerLevelExpectedPaymentDetails
          ),
          "Simplified Method prior-year recovery": pensionSimplifiedMethodPriorYearRecovery,
          "Simplified Method current-year excludable amount": pensionSimplifiedMethodCurrentYearExclusion,
        }
        : {}),
    }
  );
  audit.record(
    "Form 1099-R",
    "5",
    "Federal income tax withheld from retirement distributions",
    federalWithholding,
    "Sum Form 1099-R Box 4 withholding",
    { "1099-R forms": forms.length.toString() }
  );

  // ── Simplified Method per-payer carryforward ──────────
  // Uses payer-level aggregated groups so same-plan multi-form cases
  // emit exactly one carryforward entry per payer-plan combination.
  const simplifiedMethodCarryforward: SimplifiedMethodPayerCarryforward[] =
    payerGroupExclusionOverrides.payerGroups.map((group) => {
      const cumulativeRecovery = group.priorYearRecovery.plus(group.payerLevelExclusion);
      const remainingCost = Decimal.max(new Decimal(0), group.costInPlan.minus(cumulativeRecovery));
      return {
        payer: group.payer,
        planIdentifier: group.planIdentifier,
        costInPlan: group.costInPlan,
        priorYearRecovery: group.priorYearRecovery,
        currentYearExclusion: group.payerLevelExclusion,
        cumulativeRecovery,
        remainingCost,
        fullyRecovered: cumulativeRecovery.greaterThanOrEqualTo(group.costInPlan),
      };
    });

  return {
    iraGrossReported,
    iraTaxable,
    iraQualifiedCharitableDistributions,
    iraRothConversions,
    iraRecharacterizedContributions,
    iraRolledOverDistributions,
    iraReturnedContributionsByDueDate,
    iraReturnedContributionsByDueDateTaxableEarnings,
    iraReturnedExcessContributions,
    disabilityPensionWages,
    disabilityPensionPublicSafetyOfficerPremiumExclusion,
    pensionGrossReported,
    pensionTaxable,
    pensionPublicSafetyOfficerPremiumExclusion,
    federalWithholding,
    simplifiedMethodCarryforward,
    lines: audit.getLines(),
  };
}

function isDisabilityPensionTaxableAsWages(form: Form1099R): boolean {
  return !isIraForm1099RDistribution(form) && form.disabilityPensionBeforeMinimumRetirementAge;
}

function resolveRetiredPublicSafetyOfficerInsurancePremiums(form: Form1099R): Decimal {
  if (isIraForm1099RDistribution(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.retiredPublicSafetyOfficerInsurancePremiums));
}

function pensionTaxableSource(form: Form1099R, taxableAmount: Decimal) {
  return {
    accountHolder: form.accountHolder,
    taxableAmount,
    premiums: resolveRetiredPublicSafetyOfficerInsurancePremiums(form),
  };
}

function calculatePublicSafetyOfficerPremiumExclusions(
  disabilityPensions: ReturnType<typeof pensionTaxableSource>[],
  pensions: ReturnType<typeof pensionTaxableSource>[],
  isJointReturn: boolean,
  hasJointSpouse: boolean,
) {
  const premiumSources = [...disabilityPensions, ...pensions].filter((source) => source.premiums.gt(0));
  if (premiumSources.length === 0) {
    return { disabilityExclusion: new Decimal(0), pensionExclusion: new Decimal(0) };
  }
  if (isJointReturn) {
    if (!hasJointSpouse) {
      throw new Error("Retired public safety officer premiums on a joint return require the actual spouse's identity");
    }
    if (premiumSources.some((source) => source.accountHolder !== "primary" && source.accountHolder !== "spouse")) {
      throw new Error("Retired public safety officer premiums on a joint return require the actual owner of each Form 1099-R with positive premiums");
    }
  }

  const qualifyingPremiums = (
    sources: ReturnType<typeof pensionTaxableSource>[],
    owner: Form1099R["accountHolder"],
  ): Decimal => sum(...sources
    .filter((source) => owner === undefined || source.accountHolder === owner)
    .map((source) => Decimal.min(source.premiums, source.taxableAmount)));

  const owners = isJointReturn ? (["primary", "spouse"] as const) : [undefined];
  const exclusions = owners.map((owner) => {
    const disabilityExclusion = Decimal.min(
      RETIRED_PUBLIC_SAFETY_OFFICER_PREMIUM_CAP,
      qualifyingPremiums(disabilityPensions, owner),
    );
    const pensionExclusion = Decimal.min(
      RETIRED_PUBLIC_SAFETY_OFFICER_PREMIUM_CAP.minus(disabilityExclusion),
      qualifyingPremiums(pensions, owner),
    );
    return { disabilityExclusion, pensionExclusion };
  });
  return {
    disabilityExclusion: sum(...exclusions.map((owner) => owner.disabilityExclusion)),
    pensionExclusion: sum(...exclusions.map((owner) => owner.pensionExclusion)),
  };
}

function shouldReportGross(
  forms: Form1099R[],
  options: { includeTaxableAmountNotDetermined?: boolean } = {}
): boolean {
  return forms.some((form) => {
    if (isPriorYearTaxableDistribution(form)) {
      return false;
    }

    return (
      (options.includeTaxableAmountNotDetermined && form.taxableAmountNotDetermined) ||
      resolveRothConversionAmount(form).greaterThan(0) ||
      resolveQualifiedCharitableDistribution(form).greaterThan(0) ||
      isRothIraDistributionRequiringGrossReporting(form) ||
      hasDirectRolloverCode(form.distributionCode) ||
      !resolveForm1099RTaxableAmount(form).eq(d(form.grossDistribution))
    );
  });
}

export function resolveForm1099RTaxableAmount(form: Form1099R): Decimal {
  if (form.qcdSource !== undefined || (form.taxYear === 2026 && hasQcdClaim(form))) {
    throw new Error("2026 Form 1099-R QCD taxable amount requires the complete owner worksheet");
  }
  const qualifiedCharitableDistribution = resolveQualifiedCharitableDistribution(form);
  const taxableAmountBeforeQcd = resolveTaxableAmountBeforeQcd(form);

  return Decimal.max(new Decimal(0), taxableAmountBeforeQcd.minus(qualifiedCharitableDistribution));
}

function assert2026IraTaxability(form: Form1099R, basisPacketBound: boolean, hasJointSpouse: boolean): void {
  if (form.taxYear !== 2026) throw new Error("Form 1099-R IRA source year must match the 2026 return");
  const code = getUpperDistributionCode(form).replace(/\s+/g, "");
  if (!/^[1-9ABCDEFGHJKLMNPQRSTUWY]{1,2}$/u.test(code) || (code.length === 2 && code[0] === code[1])) {
    throw new Error("2026 Form 1099-R IRA requires the actual Box 7a distribution code");
  }
  if (code.includes("A")) throw new Error("2026 Form 1099-R Code A requires a non-IRA qualified plan");
  if (!/^[1247S]$/u.test(code) || isReturnedContributionByDueDate(form) || isNontaxableExcessContributionReturn(form)) return;
  // The packet only binds original Code 7 records with the IRA checkbox set.
  if (basisPacketBound && code === "7" && form.iraSepSimple === true) {
    if (form.iraBasisConfirmedZero !== undefined) {
      throw new Error("Reconcile the ordinary IRA basis confirmation with the bound Form 8606 owner packet");
    }
    return;
  }
  if (form.accountHolder !== "primary" && !(form.accountHolder === "spouse" && hasJointSpouse)) {
    throw new Error("2026 Form 1099-R IRA requires an actual return owner");
  }
  if (form.trumpAccount !== false) throw new Error("2026 ordinary IRA requires the actual Box 7c classification");
  if (!form.excessContributionEarnings?.trim()) throw new Error("2026 ordinary IRA requires a known zero for Box 7d");
  if (form.iraBasisConfirmedZero !== true || !d(form.employeeContributions).isZero()) {
    throw new Error("2026 Form 1099-R requires confirmed zero nondeductible IRA basis or a validated Form 8606 owner packet");
  }
  const gross = d(form.grossDistribution);
  if (!form.grossDistribution.trim() || !gross.isFinite() || gross.lt(0)
    || (form.taxableAmount !== undefined && (!form.taxableAmount.trim() || !d(form.taxableAmount).eq(gross)))) {
    throw new Error("2026 ordinary zero-basis IRA requires valid Box 1 and a consistent Box 2a when entered");
  }
}

function assert2026PensionTaxability(form: Form1099R): void {
  if (form.taxYear !== undefined && form.taxYear !== 2026) {
    throw new Error("Form 1099-R pension source year must match the 2026 return");
  }

  const code = getUpperDistributionCode(form).replace(/\s+/g, "");
  if (!/^[1-9ABCDEFGHJKLMNPQRSTUWY]{1,2}$/u.test(code) || (code.length === 2 && code[0] === code[1])) {
    throw new Error("2026 Form 1099-R pension requires the actual Box 7a distribution code");
  }
  const qualifiedLumpSum = code.includes("A");
  if ((code.includes("6") && !/^(?:6W?|W6)$/u.test(code))
    || (code.includes("H") && !/^(?:H4?|4H)$/u.test(code))
    || (code.includes("P") && !/^(?:P[124B]?|[124B]P)$/u.test(code))
    || (qualifiedLumpSum && !/^(?:A[47]|[47]A)$/u.test(code))) {
    throw new Error("2026 Form 1099-R pension requires a valid Box 7a code combination");
  }
  if (qualifiedLumpSum) {
    if (form.taxYear !== 2026) throw new Error("2026 Form 1099-R Code A requires the actual source year");
    if (form.iraSepSimple !== false) throw new Error("2026 Form 1099-R Code A requires a confirmed non-IRA source");
    if (form.qualifiedLumpSumReporting !== "ordinary_pension") {
      throw new Error("2026 Form 1099-R Code A requires the actual lump-sum reporting decision");
    }
  }

  const gross = d(form.grossDistribution);
  const taxable = form.taxableAmount === undefined ? undefined : d(form.taxableAmount);
  if (!form.grossDistribution.trim() || form.taxableAmount?.trim() === "" || !gross.isFinite() || gross.lt(0)
    || (taxable && (!taxable.isFinite() || taxable.lt(0) || taxable.gt(gross)))) {
    throw new Error("2026 Form 1099-R pension requires valid Box 1 and Box 2a amounts");
  }
  if (form.capitalGainIncluded !== undefined) {
    if (!/^\d+(?:\.\d{1,2})?$/u.test(form.capitalGainIncluded)) {
      throw new Error("2026 Form 1099-R requires Box 3 to reconcile to determined Box 2a");
    }
    const gain = d(form.capitalGainIncluded);
    if (qualifiedLumpSum && (!taxable || form.taxableAmountNotDetermined || gain.gt(taxable))) {
      throw new Error("2026 Form 1099-R Code A requires Box 3 to reconcile to determined Box 2a");
    }
    if (!qualifiedLumpSum && !gain.isZero()) {
      throw new Error("2026 Form 1099-R Box 3 on a source other than Code A requires a separate method");
    }
  }
  if (qualifiedLumpSum && (taxable === undefined || form.taxableAmountNotDetermined !== false)) {
    throw new Error("2026 Form 1099-R Code A requires a determined Box 2a and confirmed unchecked Box 2b for ordinary reporting");
  }

  if (isPriorYearTaxableDistribution(form)) return;
  if (code.includes("6") || isDesignatedRothDirectRolloverToRothIra(form)
    || isQualifiedDesignatedRothAccountDistribution(form)) {
    if (taxable?.gt(0) || usesSimplifiedMethodForTaxableAmount(form)) {
      throw new Error("2026 Form 1099-R pension has contradictory facts for its tax-free distribution code");
    }
    return;
  }

  if (usesSimplifiedMethodForTaxableAmount(form)) {
    const cost = d(form.simplifiedMethodCostInPlan);
    const priorRecovery = form.simplifiedMethodPriorYearRecovered;
    const payments = form.simplifiedMethodPaymentsReceivedThisYear;
    if (form.simplifiedMethodCostInPlan?.trim() && cost.isFinite() && cost.gte(0) && priorRecovery?.trim() && d(priorRecovery).isFinite()
      && d(priorRecovery).gte(0) && payments !== undefined && Number.isInteger(payments) && payments >= 0) return;
  } else if (gross.isZero()) {
    return;
  } else if (taxable !== undefined && !form.taxableAmountNotDetermined) {
    if (form.taxableAmountNotDetermined !== false || form.iraSepSimple !== false) {
      throw new Error("2026 ordinary Form 1099-R pension requires confirmed unchecked Box 2b and Box 7b");
    }
    return;
  }
  throw new Error("2026 Form 1099-R pension requires a determined Box 2a or a complete supported Simplified Method worksheet");
}

type RetirementTaxabilitySource = "determined-box2a" | "supported-method" | "historical-preview";
type ResolverSource = RetirementTaxabilitySource | "code-method";
interface RetirementTaxabilityResolution { amount: Decimal; source: ResolverSource }

/** Provenance from the same resolver branch; never a second tax-method allowlist. */
export function getForm1099RTaxabilitySource(form: Form1099R): {
  source: RetirementTaxabilitySource; recognizedDistributionCode: boolean; currentYear: boolean;
  iraKind?: "traditional" | "roth"; iraConversionAmount: Decimal;
} {
  const code = getUpperDistributionCode(form).replace(/\s+/g, "");
  const recognizedDistributionCode = /^[1-9ABCDEFGHJKLMNPQRSTUWY]{1,2}$/u.test(code)
    && !(code.length === 2 && code[0] === code[1]);
  const resolved = resolveTaxableAmountBeforeQcdSource(form).source;
  const source = resolved === "code-method"
    ? (recognizedDistributionCode ? "supported-method" : "historical-preview") : resolved;
  return { source, recognizedDistributionCode, currentYear: !isPriorYearTaxableDistribution(form), iraConversionAmount: resolveRothConversionAmount(form),
    iraKind: isIraForm1099RDistribution(form) ? (isRothIraDistributionRequiringGrossReporting(form) ? "roth" : "traditional") : undefined };
}

function resolveTaxableAmountBeforeQcd(form: Form1099R): Decimal {
  return resolveTaxableAmountBeforeQcdSource(form).amount;
}

function resolveTaxableAmountBeforeQcdSource(form: Form1099R): RetirementTaxabilityResolution {
  if (isPriorYearTaxableDistribution(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isRecharacterizedIraContribution(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isQualifiedRothIraDistribution(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isQualifiedDesignatedRothAccountDistribution(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isDesignatedRothDirectRolloverToRothIra(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (resolveQualifiedRothDistributionAmount(form).greaterThan(0)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isCodeTSafeHarborDistribution(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (usesSimplifiedMethodForTaxableAmount(form)) {
    return { amount: Decimal.max(
      new Decimal(0),
      d(form.grossDistribution).minus(resolveSimplifiedMethodCurrentYearExcludableAmount(form))
    ), source: "supported-method" };
  }

  if (form.taxableAmount !== undefined) {
    return { amount: Decimal.max(new Decimal(0), d(form.taxableAmount)), source: form.taxableAmountNotDetermined ? "historical-preview" : "determined-box2a" };
  }

  if (isSection1035ExchangeWithBlankBox2a(form)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (hasDirectRolloverCode(form.distributionCode)) {
    return { amount: new Decimal(0), source: "code-method" };
  }

  if (isReturnedContributionByDueDate(form)) {
    return { amount: new Decimal(0), source: "supported-method" };
  }

  if (isNontaxableExcessContributionReturn(form)) {
    return { amount: new Decimal(0), source: "supported-method" };
  }

  if (!isIraForm1099RDistribution(form) && d(form.employeeContributions).greaterThan(0)) {
    return { amount: Decimal.max(new Decimal(0), d(form.grossDistribution).minus(d(form.employeeContributions))), source: "historical-preview" };
  }

  return { amount: Decimal.max(new Decimal(0), d(form.grossDistribution)), source: "historical-preview" };
}

function isNontaxableExcessContributionReturn(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form) || !form.excessContributionReturnedWithoutEarnings) {
    return false;
  }

  if (!form.distributionCode) {
    return true;
  }

  const upperCode = form.distributionCode.toUpperCase();
  return upperCode.includes("1") || upperCode.includes("7") || upperCode.includes("S");
}

function resolveExcludableRolloverAmount(form: Form1099R): Decimal {
  if (!isIraForm1099RDistribution(form) || !hasDirectRolloverCode(form.distributionCode)) {
    return new Decimal(0);
  }

  return Decimal.max(
    new Decimal(0),
    d(form.grossDistribution).minus(resolveTaxableAmountBeforeQcd(form))
  );
}

function resolveRothConversionAmount(form: Form1099R): Decimal {
  if (!form.iraSepSimple || form.rothConversionAmount === undefined) {
    return new Decimal(0);
  }

  return Decimal.min(
    Decimal.max(new Decimal(0), d(form.rothConversionAmount)),
    d(form.grossDistribution)
  );
}

function resolveRecharacterizedIraContributionAmount(form: Form1099R): Decimal {
  if (!isIraForm1099RDistribution(form) || !isRecharacterizedIraContribution(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveReturnedExcessContributionAmount(form: Form1099R): Decimal {
  if (!isNontaxableExcessContributionReturn(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveReturnedContributionByDueDateAmount(form: Form1099R): Decimal {
  if (!isReturnedContributionByDueDate(form) || isPriorYearTaxableDistribution(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveReturnedContributionByDueDateTaxableAmount(form: Form1099R): Decimal {
  if (!isReturnedContributionByDueDate(form) || isPriorYearTaxableDistribution(form) || form.taxableAmount === undefined) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.taxableAmount));
}

function resolveQualifiedCharitableDistribution(form: Form1099R): Decimal {
  if (!isIraForm1099RDistribution(form)) {
    return new Decimal(0);
  }

  if (hasQualifiedCharitableDistributionCode(form)) {
    return Decimal.max(new Decimal(0), d(form.grossDistribution));
  }

  return Decimal.min(
    Decimal.max(new Decimal(0), d(form.qualifiedCharitableDistribution)),
    d(form.grossDistribution)
  );
}

export function resolveQualifiedRothDistributionAmount(form: Form1099R): Decimal {
  if (
    !isIraForm1099RDistribution(form)
    || !form.qualifiedRothDistribution
    || !hasStandaloneQualifiedRothDistributionCode(form)
  ) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveQualifiedDesignatedRothDistributionAmount(form: Form1099R): Decimal {
  if (!isQualifiedDesignatedRothAccountDistribution(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveDesignatedRothDirectRolloverAmount(form: Form1099R): Decimal {
  if (!isDesignatedRothDirectRolloverToRothIra(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function resolveSection1035ExchangeBlankBox2aAmount(form: Form1099R): Decimal {
  if (!isSection1035ExchangeWithBlankBox2a(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
}

function usesSimplifiedMethodForTaxableAmount(form: Form1099R): boolean {
  if (isIraForm1099RDistribution(form) || !hasValidatedSimplifiedMethodInputs(form)) {
    return false;
  }

  return form.taxableAmount === undefined || form.taxableAmountNotDetermined === true;
}

function hasValidatedSimplifiedMethodInputs(form: Form1099R): boolean {
  if (!hasSupportedSimplifiedMethodAnnuityStartingDate(form)) {
    return false;
  }

  return form.simplifiedMethodCostInPlan !== undefined
    && resolveSimplifiedMethodExpectedPayments(form).greaterThan(0)
    && form.simplifiedMethodPaymentsReceivedThisYear !== undefined;
}

function resolveSimplifiedMethodPriorYearRecovery(form: Form1099R): Decimal {
  if (!hasValidatedSimplifiedMethodInputs(form)) {
    return new Decimal(0);
  }

  return Decimal.max(new Decimal(0), d(form.simplifiedMethodPriorYearRecovered ?? "0"));
}

function resolveSimplifiedMethodCurrentYearExcludableAmount(form: Form1099R): Decimal {
  if (!usesSimplifiedMethodForTaxableAmount(form)) {
    return new Decimal(0);
  }

  const costInPlan = Decimal.max(new Decimal(0), d(form.simplifiedMethodCostInPlan ?? "0"));
  const expectedPayments = resolveSimplifiedMethodExpectedPayments(form);
  const paymentsReceived = new Decimal(form.simplifiedMethodPaymentsReceivedThisYear ?? 0);
  const currentYearTentativeExclusion = costInPlan.div(expectedPayments).times(paymentsReceived);
  const remainingUnrecoveredCost = Decimal.max(
    new Decimal(0),
    costInPlan.minus(resolveSimplifiedMethodPriorYearRecovery(form))
  );

  return Decimal.min(currentYearTentativeExclusion, remainingUnrecoveredCost);
}

function hasDirectRolloverCode(code?: string): boolean {
  if (!code) {
    return false;
  }

  return [...code.toUpperCase()].some((char) => DIRECT_ROLLOVER_CODES.has(char));
}

function isSection1035ExchangeWithBlankBox2a(form: Form1099R): boolean {
  return !isIraForm1099RDistribution(form)
    && form.taxableAmount === undefined
    && getUpperDistributionCode(form).includes("6");
}

function isReturnedContributionByDueDate(form: Form1099R): boolean {
  return isIraForm1099RDistribution(form)
    && (
      form.returnedContributionByDueDate
      || (
        !isPriorYearTaxableDistribution(form)
        && getUpperDistributionCode(form).includes("8")
      )
    );
}

function isQualifiedRothIraDistribution(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form) || !form.distributionCode) {
    return false;
  }

  return getUpperDistributionCode(form).includes("Q");
}

function isQualifiedDesignatedRothAccountDistribution(form: Form1099R): boolean {
  return !isIraForm1099RDistribution(form)
    && form.qualifiedRothDistribution
    && getUpperDistributionCode(form).includes("B");
}

function isDesignatedRothDirectRolloverToRothIra(form: Form1099R): boolean {
  return !isIraForm1099RDistribution(form)
    && getUpperDistributionCode(form).includes("H");
}

function isRothIraDistributionRequiringGrossReporting(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form) || !form.distributionCode) {
    return false;
  }

  const upperCode = getUpperDistributionCode(form);
  return upperCode.includes("J") || upperCode.includes("Q") || upperCode.includes("T");
}

function isCodeTSafeHarborDistribution(form: Form1099R): boolean {
  if (!isIraForm1099RDistribution(form) || !form.distributionCode) {
    return false;
  }

  return getUpperDistributionCode(form).includes("T") && form.rothContributionOrConversionMadeBefore2021;
}

function isPriorYearTaxableDistribution(form: Form1099R): boolean {
  return getUpperDistributionCode(form).includes("P");
}

function resolveSimplifiedMethodExpectedPayments(form: Form1099R): Decimal {
  if (form.simplifiedMethodExpectedPayments !== undefined) {
    return new Decimal(form.simplifiedMethodExpectedPayments);
  }

  const derived = deriveSimplifiedMethodExpectedPayments(form);
  return derived.expectedPayments === undefined ? new Decimal(0) : new Decimal(derived.expectedPayments);
}

function resolveSimplifiedMethodExpectedPaymentsSource(form: Form1099R): string {
  if (form.simplifiedMethodExpectedPayments !== undefined) {
    return "validated worksheet input";
  }

  return deriveSimplifiedMethodExpectedPayments(form).source ?? "unsupported";
}

function hasSupportedSimplifiedMethodAnnuityStartingDate(form: Form1099R): boolean {
  const annuityStartingDate = parseSimplifiedMethodAnnuityStartingDate(form.simplifiedMethodAnnuityStartingDate);
  return annuityStartingDate === undefined || annuityStartingDate.getTime() >= SIMPLIFIED_METHOD_DATE_1986_07_02;
}

function deriveSimplifiedMethodExpectedPayments(form: Form1099R): SimplifiedMethodExpectedPaymentsResolution {
  const annuityStartingDate = parseSimplifiedMethodAnnuityStartingDate(form.simplifiedMethodAnnuityStartingDate);
  const primaryAge = form.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate;
  if (annuityStartingDate === undefined || primaryAge === undefined) {
    return {};
  }

  const annuityStartingTime = annuityStartingDate.getTime();
  if (annuityStartingTime < SIMPLIFIED_METHOD_DATE_1986_07_02) {
    return {};
  }

  if (annuityStartingTime < SIMPLIFIED_METHOD_DATE_1996_11_19) {
    return {
      expectedPayments: lookupSimplifiedMethodSingleLifeExpectedPayments(primaryAge, "1986_to_1996"),
      source: "IRS Table 1 (annuity starting date after July 1, 1986 and before November 19, 1996)",
    };
  }

  if (annuityStartingTime < SIMPLIFIED_METHOD_DATE_1998_01_01) {
    return {
      expectedPayments: lookupSimplifiedMethodSingleLifeExpectedPayments(primaryAge, "1996_to_1997"),
      source: "IRS Table 1 (annuity starting date after November 18, 1996 and before 1998)",
    };
  }

  const secondaryAge = form.simplifiedMethodSecondaryAnnuitantAgeAtStartingDate;
  if (secondaryAge !== undefined) {
    return {
      expectedPayments: lookupSimplifiedMethodJointLifeExpectedPayments(primaryAge + secondaryAge),
      source: "IRS Table 2 (annuity starting date in 1998 or later)",
    };
  }

  return {
    expectedPayments: lookupSimplifiedMethodSingleLifeExpectedPayments(primaryAge, "1998_or_later"),
    source: "IRS Table 1 (annuity starting date in 1998 or later)",
  };
}

function parseSimplifiedMethodAnnuityStartingDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function lookupSimplifiedMethodSingleLifeExpectedPayments(
  age: number,
  period: "1986_to_1996" | "1996_to_1997" | "1998_or_later"
): number {
  if (period === "1986_to_1996") {
    if (age <= 55) {
      return 300;
    }
    if (age <= 60) {
      return 260;
    }
    if (age <= 65) {
      return 240;
    }
    if (age <= 70) {
      return 170;
    }
    return 120;
  }

  if (age <= 55) {
    return 360;
  }
  if (age <= 60) {
    return 310;
  }
  if (age <= 65) {
    return 260;
  }
  if (age <= 70) {
    return 210;
  }
  return 160;
}

function lookupSimplifiedMethodJointLifeExpectedPayments(combinedAge: number): number {
  if (combinedAge <= 110) {
    return 410;
  }
  if (combinedAge <= 120) {
    return 360;
  }
  if (combinedAge <= 130) {
    return 310;
  }
  if (combinedAge <= 140) {
    return 260;
  }
  return 210;
}

function formatSimplifiedMethodExpectedPaymentsAuditInput(expectedPayments: Decimal[]): string {
  if (expectedPayments.length === 0) {
    return "0";
  }

  return expectedPayments.map((value) => value.toString()).join(", ");
}

function formatSimplifiedMethodExpectedPaymentsSourceAuditInput(sources: string[]): string {
  if (sources.length === 0) {
    return "none";
  }

  return [...new Set(sources)].join("; ");
}

function formatSimplifiedMethodPayerLevelExpectedPaymentsAuditInput(
  details: Array<{ payer: string; expectedPayments: Decimal; source: string }>
): string {
  if (details.length === 0) {
    return "none";
  }

  return details
    .map((detail) => `${detail.payer}: ${detail.expectedPayments.toString()} (${detail.source})`)
    .join("; ");
}

// ── Payer-level Simplified Method grouping and aggregation ──────────
// IRS Pub 575 treats all payments from a single plan as a single stream.
// When multiple Forms 1099-R from the same payer use the Simplified Method,
// we group only forms that share the same plan parameters and recovery state,
// then sum payments, compute one payer-level exclusion, and distribute
// proportionally to forms in that same payer-plan group.

interface PayerGroupInfo {
  payer: string;
  planIdentifier?: string;
  costInPlan: Decimal;
  expectedPayments: Decimal;
  priorYearRecovery: Decimal;
  totalPayments: Decimal;
  payerLevelExclusion: Decimal;
  forms: Form1099R[];
}

interface PayerGroupedSimplifiedMethodResult {
  formOverrides: Map<Form1099R, Decimal>;
  payerGroups: PayerGroupInfo[];
}

function buildPayerGroupedSimplifiedMethodExclusions(
  simplifiedMethodForms: Form1099R[]
): PayerGroupedSimplifiedMethodResult {
  const formOverrides = new Map<Form1099R, Decimal>();
  const payerGroups: PayerGroupInfo[] = [];

  if (simplifiedMethodForms.length === 0) {
    return { formOverrides, payerGroups };
  }

  // Group by payer + explicit plan identifier when provided; otherwise fall
  // back to payer + costInPlan + expectedPayments + priorYearRecovery so
  // same-payer forms only combine when they represent the same Simplified
  // Method plan and the same cumulative recovery state.
  const groupMap = new Map<string, Form1099R[]>();
  for (const form of simplifiedMethodForms) {
    const cost = d(form.simplifiedMethodCostInPlan ?? "0").toString();
    const expectedPayments = resolveSimplifiedMethodExpectedPayments(form).toString();
    const priorYearRecovery = resolveSimplifiedMethodPriorYearRecovery(form).toString();
    const planIdentifier = form.simplifiedMethodPlanIdentifier?.trim();
    const key = planIdentifier
      ? `${form.payer}||plan-id||${planIdentifier}`
      : `${form.payer}||${cost}||${expectedPayments}||${priorYearRecovery}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(form);
    } else {
      groupMap.set(key, [form]);
    }
  }

  for (const forms of groupMap.values()) {
    const representative = forms[0];
    const costInPlan = Decimal.max(new Decimal(0), d(representative.simplifiedMethodCostInPlan ?? "0"));
    const expectedPayments = resolveSimplifiedMethodExpectedPayments(representative);
    const priorYearRecovery = resolveSimplifiedMethodPriorYearRecovery(representative);

    // Sum payments across all forms from this payer-plan
    const totalPayments = sum(
      ...forms.map((f) => new Decimal(f.simplifiedMethodPaymentsReceivedThisYear ?? 0))
    );

    // Compute single payer-level exclusion
    const tentativeExclusion = expectedPayments.greaterThan(0)
      ? costInPlan.div(expectedPayments).times(totalPayments)
      : new Decimal(0);
    const remainingUnrecoveredCost = Decimal.max(new Decimal(0), costInPlan.minus(priorYearRecovery));
    const payerLevelExclusion = Decimal.min(tentativeExclusion, remainingUnrecoveredCost);

    payerGroups.push({
      payer: representative.payer,
      planIdentifier: representative.simplifiedMethodPlanIdentifier?.trim() || undefined,
      costInPlan,
      expectedPayments,
      priorYearRecovery,
      totalPayments,
      payerLevelExclusion,
      forms,
    });

    // For multi-form groups, distribute the payer-level exclusion proportionally
    // to each form based on its share of total payments.
    if (forms.length > 1) {
      for (const form of forms) {
        const formPayments = new Decimal(form.simplifiedMethodPaymentsReceivedThisYear ?? 0);
        const formShare = totalPayments.greaterThan(0)
          ? payerLevelExclusion.times(formPayments).div(totalPayments)
          : new Decimal(0);
        formOverrides.set(form, formShare);
      }
    }
  }

  return { formOverrides, payerGroups };
}

function resolveForm1099RTaxableAmountWithPayerGrouping(
  form: Form1099R,
  payerExclusionOverrides: Map<Form1099R, Decimal>
): Decimal {
  const override = payerExclusionOverrides.get(form);
  if (override !== undefined && usesSimplifiedMethodForTaxableAmount(form)) {
    return Decimal.max(new Decimal(0), d(form.grossDistribution).minus(override));
  }
  return resolveForm1099RTaxableAmount(form);
}
