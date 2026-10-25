/**
 * Form 1099-SA aggregation helper.
 * Spec: spec/federal/form-1099-sa.yaml
 *
 * Collapses HSA Form 1099-SA inputs into the Form 8889 distribution lines and
 * the Box 2 excess-contribution earnings that belong in other income.
 */

import Decimal from "decimal.js";
import type { Form1099SA, Form8889Input, Taxpayer } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum } from "@/utils/decimal.js";

interface Form1099SAOwnerSupport {
  hsaGrossDistributions: Decimal;
  hsaReturnedExcessContributions: Decimal;
  hsaReturnedExcessContributionEarnings: Decimal;
  hsaDisabilityExceptionDistributions: Decimal;
  hsaDeathDistributionDateOfDeathValue: Decimal;
  hsaOtherBeneficiaryDeathDistributionDateOfDeathValue: Decimal;
  hsaEstateDeathDistributionDateOfDeathValue: Decimal;
  hsaPostDeathEarnings: Decimal;
  hsaProhibitedTransactionDistributions: Decimal;
}

export interface Form1099SAResult {
  hsaGrossDistributions: Decimal;
  hsaReturnedExcessContributions: Decimal;
  hsaReturnedExcessContributionEarnings: Decimal;
  hsaDisabilityExceptionDistributions: Decimal;
  hsaDeathDistributionDateOfDeathValue: Decimal;
  hsaOtherBeneficiaryDeathDistributionDateOfDeathValue: Decimal;
  hsaEstateDeathDistributionDateOfDeathValue: Decimal;
  hsaPostDeathEarnings: Decimal;
  hsaProhibitedTransactionDistributions: Decimal;
  defaultAccountOwner?: Form8889Input["accountOwner"];
  unattributedRecordCount: number;
  accountOwnerSupport: Record<Form8889Input["accountOwner"], Form1099SAOwnerSupport>;
  unattributedSupport: Form1099SAOwnerSupport;
  lines: CalculatedLine[];
}

const DEFAULT_HSA_COVERAGE_BY_MONTH = Array.from({ length: 12 }, () => "none") as Form8889Input["coverageByMonth"];
const EMPTY_OWNER_SUPPORT: Form1099SAOwnerSupport = {
  hsaGrossDistributions: new Decimal(0),
  hsaReturnedExcessContributions: new Decimal(0),
  hsaReturnedExcessContributionEarnings: new Decimal(0),
  hsaDisabilityExceptionDistributions: new Decimal(0),
  hsaDeathDistributionDateOfDeathValue: new Decimal(0),
  hsaOtherBeneficiaryDeathDistributionDateOfDeathValue: new Decimal(0),
  hsaEstateDeathDistributionDateOfDeathValue: new Decimal(0),
  hsaPostDeathEarnings: new Decimal(0),
  hsaProhibitedTransactionDistributions: new Decimal(0),
};

function normalizeOwnerSupport(
  ownerSupport: Partial<Form1099SAOwnerSupport> | undefined
): Form1099SAOwnerSupport {
  return {
    hsaGrossDistributions: d(ownerSupport?.hsaGrossDistributions),
    hsaReturnedExcessContributions: d(ownerSupport?.hsaReturnedExcessContributions),
    hsaReturnedExcessContributionEarnings: d(ownerSupport?.hsaReturnedExcessContributionEarnings),
    hsaDisabilityExceptionDistributions: d(ownerSupport?.hsaDisabilityExceptionDistributions),
    hsaDeathDistributionDateOfDeathValue: d(ownerSupport?.hsaDeathDistributionDateOfDeathValue),
    hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
      d(ownerSupport?.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue),
    hsaEstateDeathDistributionDateOfDeathValue: d(ownerSupport?.hsaEstateDeathDistributionDateOfDeathValue),
    hsaPostDeathEarnings: d(ownerSupport?.hsaPostDeathEarnings),
    hsaProhibitedTransactionDistributions: d(ownerSupport?.hsaProhibitedTransactionDistributions),
  };
}

function deriveOwnerAttributionStatus(
  hsaForms: Form1099SA[],
  attributableOwners: Form8889Input["accountOwner"][],
  defaultAccountOwner: Form8889Input["accountOwner"] | undefined
): string {
  if (hsaForms.length === 0) {
    return "no_hsa_records";
  }

  if (defaultAccountOwner === "primary") {
    return "single_primary_owner";
  }

  if (defaultAccountOwner === "spouse") {
    return "single_spouse_owner";
  }

  if (attributableOwners.length === 0) {
    return "all_records_unattributed";
  }

  if (attributableOwners.length < hsaForms.length) {
    return "mixed_tagged_and_untagged_manual";
  }

  return "mixed_tagged_owners_manual";
}

function ownerSupportHasAnyValues(ownerSupport: Form1099SAOwnerSupport): boolean {
  const normalizedOwnerSupport = normalizeOwnerSupport(ownerSupport);
  return normalizedOwnerSupport.hsaGrossDistributions.greaterThan(0)
    || normalizedOwnerSupport.hsaReturnedExcessContributions.greaterThan(0)
    || normalizedOwnerSupport.hsaReturnedExcessContributionEarnings.greaterThan(0)
    || normalizedOwnerSupport.hsaDisabilityExceptionDistributions.greaterThan(0)
    || normalizedOwnerSupport.hsaDeathDistributionDateOfDeathValue.greaterThan(0)
    || normalizedOwnerSupport.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.greaterThan(0)
    || normalizedOwnerSupport.hsaEstateDeathDistributionDateOfDeathValue.greaterThan(0)
    || normalizedOwnerSupport.hsaPostDeathEarnings.greaterThan(0)
    || normalizedOwnerSupport.hsaProhibitedTransactionDistributions.greaterThan(0);
}

function isSurvivingSpouseInheritedHsaDistribution(form: Form1099SA): boolean {
  return form.beneficiaryRole === "surviving_spouse"
    && form.distributionCode !== "6";
}

function isNonSpouseDeathDistribution(form: Form1099SA): boolean {
  return (form.distributionCode === "4" || form.distributionCode === "6")
    && !isSurvivingSpouseInheritedHsaDistribution(form);
}

function isOtherBeneficiaryDeathDistribution(form: Form1099SA): boolean {
  return isNonSpouseDeathDistribution(form)
    && (form.beneficiaryRole === "other_beneficiary" || form.distributionCode === "6");
}

function resolveOwnerAttribution(
  form: Form1099SA
): Form8889Input["accountOwner"] | undefined {
  return form.accountHolder;
}

function summarizeHsaForms(forms: Form1099SA[]): {
  hsaGrossDistributions: Decimal;
  hsaReturnedExcessContributions: Decimal;
  hsaReturnedExcessContributionEarnings: Decimal;
  hsaDisabilityExceptionDistributions: Decimal;
  hsaDeathDistributionDateOfDeathValue: Decimal;
  hsaOtherBeneficiaryDeathDistributionDateOfDeathValue: Decimal;
  hsaEstateDeathDistributionDateOfDeathValue: Decimal;
  hsaPostDeathEarnings: Decimal;
  hsaProhibitedTransactionDistributions: Decimal;
} {
  const deathDistributionForms = forms.filter(isNonSpouseDeathDistribution);
  const otherBeneficiaryDeathDistributionForms = deathDistributionForms.filter(isOtherBeneficiaryDeathDistribution);
  const estateDeathDistributionForms = deathDistributionForms.filter((form) => form.beneficiaryRole === "estate");
  const ordinaryDistributionForms = forms.filter((form) => !isNonSpouseDeathDistribution(form));
  const code2Forms = forms.filter((form) => form.distributionCode === "2");
  const code3Forms = forms.filter((form) => form.distributionCode === "3");
  const code5Forms = forms.filter((form) => form.distributionCode === "5");

  const hsaDeathDistributionDateOfDeathValue = sum(
    ...deathDistributionForms.map((form) => d(form.fmvOnDateOfDeath))
  );
  const hsaOtherBeneficiaryDeathDistributionDateOfDeathValue = sum(
    ...otherBeneficiaryDeathDistributionForms.map((form) => d(form.fmvOnDateOfDeath))
  );
  const hsaEstateDeathDistributionDateOfDeathValue = sum(
    ...estateDeathDistributionForms.map((form) => d(form.fmvOnDateOfDeath))
  );

  return {
    hsaGrossDistributions: sum(
      ...ordinaryDistributionForms.map((form) => d(form.grossDistribution)),
      hsaDeathDistributionDateOfDeathValue
    ),
    hsaReturnedExcessContributions: sum(...code2Forms.map((form) => d(form.grossDistribution))),
    hsaReturnedExcessContributionEarnings: sum(...code2Forms.map((form) => d(form.earningsOnExcessContributions))),
    hsaDisabilityExceptionDistributions: sum(...code3Forms.map((form) => d(form.grossDistribution))),
    hsaDeathDistributionDateOfDeathValue,
    hsaOtherBeneficiaryDeathDistributionDateOfDeathValue,
    hsaEstateDeathDistributionDateOfDeathValue,
    hsaPostDeathEarnings: sum(
      ...deathDistributionForms.map((form) => Decimal.max(
        new Decimal(0),
        d(form.grossDistribution).minus(d(form.fmvOnDateOfDeath))
      ))
    ),
    hsaProhibitedTransactionDistributions: sum(...code5Forms.map((form) => d(form.grossDistribution))),
  };
}

function addOwnerSupport(
  left: Form1099SAOwnerSupport,
  right: Form1099SAOwnerSupport
): Form1099SAOwnerSupport {
  return {
    hsaGrossDistributions: left.hsaGrossDistributions.plus(right.hsaGrossDistributions),
    hsaReturnedExcessContributions: left.hsaReturnedExcessContributions.plus(right.hsaReturnedExcessContributions),
    hsaReturnedExcessContributionEarnings: left.hsaReturnedExcessContributionEarnings
      .plus(right.hsaReturnedExcessContributionEarnings),
    hsaDisabilityExceptionDistributions: left.hsaDisabilityExceptionDistributions
      .plus(right.hsaDisabilityExceptionDistributions),
    hsaDeathDistributionDateOfDeathValue: left.hsaDeathDistributionDateOfDeathValue
      .plus(right.hsaDeathDistributionDateOfDeathValue),
    hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
      left.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue
        .plus(right.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue),
    hsaEstateDeathDistributionDateOfDeathValue: left.hsaEstateDeathDistributionDateOfDeathValue
      .plus(right.hsaEstateDeathDistributionDateOfDeathValue),
    hsaPostDeathEarnings: left.hsaPostDeathEarnings.plus(right.hsaPostDeathEarnings),
    hsaProhibitedTransactionDistributions: left.hsaProhibitedTransactionDistributions
      .plus(right.hsaProhibitedTransactionDistributions),
  };
}

function canSafelyDefaultUnattributedSupportToPrimary(taxpayer?: Taxpayer): boolean {
  return taxpayer === undefined || taxpayer.spouse === undefined;
}

export function calculateForm1099SA(forms: Form1099SA[] = []): Form1099SAResult {
  const audit = new AuditTrail();
  // Trustee-to-trustee transfers are not reportable Form 1099-SA distributions.
  // Ignore them defensively in case an internal caller bypassed schema validation.
  const hsaForms = forms.filter(
    (form) => form.accountType === "hsa" && form.trusteeToTrusteeTransfer !== true
  );
  const ownerAttributions = hsaForms.map((form) => resolveOwnerAttribution(form));
  const attributableOwners = ownerAttributions.filter(
    (owner): owner is Form8889Input["accountOwner"] => owner !== undefined
  );
  const distinctAccountOwners = new Set<Form8889Input["accountOwner"]>(attributableOwners);
  const defaultAccountOwner = attributableOwners.length === hsaForms.length && distinctAccountOwners.size === 1
    ? [...distinctAccountOwners][0]
    : undefined;
  const ownerAttributionStatus = deriveOwnerAttributionStatus(
    hsaForms,
    attributableOwners,
    defaultAccountOwner
  );
  const aggregate = summarizeHsaForms(hsaForms);
  const unattributedSupport = summarizeHsaForms(
    hsaForms.filter((form) => resolveOwnerAttribution(form) === undefined)
  );
  const accountOwnerSupport = {
    primary: summarizeHsaForms(
      hsaForms.filter((form) => resolveOwnerAttribution(form) === "primary")
    ),
    spouse: summarizeHsaForms(
      hsaForms.filter((form) => resolveOwnerAttribution(form) === "spouse")
    ),
  } satisfies Record<Form8889Input["accountOwner"], ReturnType<typeof summarizeHsaForms>>;
  const deathDistributionForms = hsaForms.filter(isNonSpouseDeathDistribution);
  const ordinaryDistributionForms = hsaForms.filter((form) => !isNonSpouseDeathDistribution(form));
  const code2Forms = hsaForms.filter((form) => form.distributionCode === "2");
  const code3Forms = hsaForms.filter((form) => form.distributionCode === "3");
  const code5Forms = hsaForms.filter((form) => form.distributionCode === "5");

  audit.record(
    "Form 1099-SA",
    "1",
    "HSA gross distributions available for Form 8889 Line 14a",
    aggregate.hsaGrossDistributions,
    "Sum Form 1099-SA Box 1 for ordinary HSA records, including surviving-spouse inherited accounts attributed only by actual return owner, plus Box 4 fair market value for nonspouse or estate death-distribution records",
    {
      "Ordinary HSA forms": ordinaryDistributionForms.length.toString(),
      "Nonspouse or estate death-distribution HSA forms": deathDistributionForms.length.toString(),
      "Unattributed HSA forms": hsaForms
        .filter((form) => resolveOwnerAttribution(form) === undefined)
        .length
        .toString(),
      "Account owner attribution status": ownerAttributionStatus,
      "Default Form 8889 account owner": defaultAccountOwner ?? (
        ownerSupportHasAnyValues(unattributedSupport) ? "manual_or_ambiguous" : "mixed_or_unknown"
      ),
    }
  );
  audit.record(
    "Form 1099-SA",
    "2",
    "Returned excess contributions excluded on Form 8889 Line 14b",
    aggregate.hsaReturnedExcessContributions,
    "Sum Form 1099-SA Box 1 for HSA records with Box 3 code 2",
    { "Code 2 HSA forms": code2Forms.length.toString() }
  );
  audit.record(
    "Form 1099-SA",
    "3",
    "Earnings on returned excess contributions reported as other income",
    aggregate.hsaReturnedExcessContributionEarnings,
    "Sum Form 1099-SA Box 2 for HSA records with Box 3 code 2",
    {
      "Code 2 HSA forms": code2Forms.length.toString(),
      "Primary-owner Box 2 returned-excess earnings":
        accountOwnerSupport.primary.hsaReturnedExcessContributionEarnings,
      "Spouse-owner Box 2 returned-excess earnings":
        accountOwnerSupport.spouse.hsaReturnedExcessContributionEarnings,
      "Unattributed Box 2 returned-excess earnings":
        unattributedSupport.hsaReturnedExcessContributionEarnings,
    }
  );
  audit.record(
    "Form 1099-SA",
    "4",
    "Disability distributions exempt from the Form 8889 additional tax",
    aggregate.hsaDisabilityExceptionDistributions,
    "Sum Form 1099-SA Box 1 for HSA records with Box 3 code 3",
    { "Code 3 HSA forms": code3Forms.length.toString() }
  );
  audit.record(
    "Form 1099-SA",
    "5",
    "Fair market value at date of death for HSA death distributions",
    aggregate.hsaDeathDistributionDateOfDeathValue,
    "Sum Form 1099-SA Box 4 for nonspouse or estate HSA records with Box 3 codes 4 or 6",
    {
      "Nonspouse or estate death-distribution HSA forms": deathDistributionForms.length.toString(),
      "Other-beneficiary death-distribution amount":
        aggregate.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toString(),
      "Estate death-distribution amount": aggregate.hsaEstateDeathDistributionDateOfDeathValue.toString(),
    }
  );
  audit.record(
    "Form 1099-SA",
    "6",
    "Post-death earnings reported as other income",
    aggregate.hsaPostDeathEarnings,
    "Sum of max(0, Form 1099-SA Box 1 - Box 4) for nonspouse or estate HSA records with Box 3 codes 4 or 6",
    {
      "Nonspouse or estate death-distribution HSA forms": deathDistributionForms.length.toString(),
      "Primary-owner post-death earnings": accountOwnerSupport.primary.hsaPostDeathEarnings,
      "Spouse-owner post-death earnings": accountOwnerSupport.spouse.hsaPostDeathEarnings,
      "Unattributed post-death earnings": unattributedSupport.hsaPostDeathEarnings,
    }
  );
  audit.record(
    "Form 1099-SA",
    "7",
    "Prohibited-transaction deemed distributions that cannot be matched with qualified medical expenses",
    aggregate.hsaProhibitedTransactionDistributions,
    "Sum Form 1099-SA Box 1 for HSA records with Box 3 code 5",
    {
      "Code 5 HSA forms": code5Forms.length.toString(),
      "Primary-owner code 5 deemed distributions": accountOwnerSupport.primary.hsaProhibitedTransactionDistributions,
      "Spouse-owner code 5 deemed distributions": accountOwnerSupport.spouse.hsaProhibitedTransactionDistributions,
      "Unattributed code 5 deemed distributions": unattributedSupport.hsaProhibitedTransactionDistributions,
    }
  );

  return {
    hsaGrossDistributions: aggregate.hsaGrossDistributions,
    hsaReturnedExcessContributions: aggregate.hsaReturnedExcessContributions,
    hsaReturnedExcessContributionEarnings: aggregate.hsaReturnedExcessContributionEarnings,
    hsaDisabilityExceptionDistributions: aggregate.hsaDisabilityExceptionDistributions,
    hsaDeathDistributionDateOfDeathValue: aggregate.hsaDeathDistributionDateOfDeathValue,
    hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
      aggregate.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue,
    hsaEstateDeathDistributionDateOfDeathValue: aggregate.hsaEstateDeathDistributionDateOfDeathValue,
    hsaPostDeathEarnings: aggregate.hsaPostDeathEarnings,
    hsaProhibitedTransactionDistributions: aggregate.hsaProhibitedTransactionDistributions,
    defaultAccountOwner,
    unattributedRecordCount: hsaForms.length - attributableOwners.length,
    accountOwnerSupport: {
      primary: {
        hsaGrossDistributions: accountOwnerSupport.primary.hsaGrossDistributions,
        hsaReturnedExcessContributions: accountOwnerSupport.primary.hsaReturnedExcessContributions,
        hsaReturnedExcessContributionEarnings: accountOwnerSupport.primary.hsaReturnedExcessContributionEarnings,
        hsaDisabilityExceptionDistributions: accountOwnerSupport.primary.hsaDisabilityExceptionDistributions,
        hsaDeathDistributionDateOfDeathValue: accountOwnerSupport.primary.hsaDeathDistributionDateOfDeathValue,
        hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
          accountOwnerSupport.primary.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue,
        hsaEstateDeathDistributionDateOfDeathValue:
          accountOwnerSupport.primary.hsaEstateDeathDistributionDateOfDeathValue,
        hsaPostDeathEarnings: accountOwnerSupport.primary.hsaPostDeathEarnings,
        hsaProhibitedTransactionDistributions: accountOwnerSupport.primary.hsaProhibitedTransactionDistributions,
      },
      spouse: {
        hsaGrossDistributions: accountOwnerSupport.spouse.hsaGrossDistributions,
        hsaReturnedExcessContributions: accountOwnerSupport.spouse.hsaReturnedExcessContributions,
        hsaReturnedExcessContributionEarnings: accountOwnerSupport.spouse.hsaReturnedExcessContributionEarnings,
        hsaDisabilityExceptionDistributions: accountOwnerSupport.spouse.hsaDisabilityExceptionDistributions,
        hsaDeathDistributionDateOfDeathValue: accountOwnerSupport.spouse.hsaDeathDistributionDateOfDeathValue,
        hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
          accountOwnerSupport.spouse.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue,
        hsaEstateDeathDistributionDateOfDeathValue:
          accountOwnerSupport.spouse.hsaEstateDeathDistributionDateOfDeathValue,
        hsaPostDeathEarnings: accountOwnerSupport.spouse.hsaPostDeathEarnings,
        hsaProhibitedTransactionDistributions: accountOwnerSupport.spouse.hsaProhibitedTransactionDistributions,
      },
    },
    unattributedSupport: {
      hsaGrossDistributions: unattributedSupport.hsaGrossDistributions,
      hsaReturnedExcessContributions: unattributedSupport.hsaReturnedExcessContributions,
      hsaReturnedExcessContributionEarnings: unattributedSupport.hsaReturnedExcessContributionEarnings,
      hsaDisabilityExceptionDistributions: unattributedSupport.hsaDisabilityExceptionDistributions,
      hsaDeathDistributionDateOfDeathValue: unattributedSupport.hsaDeathDistributionDateOfDeathValue,
      hsaOtherBeneficiaryDeathDistributionDateOfDeathValue:
        unattributedSupport.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue,
      hsaEstateDeathDistributionDateOfDeathValue:
        unattributedSupport.hsaEstateDeathDistributionDateOfDeathValue,
      hsaPostDeathEarnings: unattributedSupport.hsaPostDeathEarnings,
      hsaProhibitedTransactionDistributions: unattributedSupport.hsaProhibitedTransactionDistributions,
    },
    lines: audit.getLines(),
  };
}

export function mergeForm1099SAIntoForm8889Input(
  input: (Partial<Form8889Input> & { accountOwner?: Form8889Input["accountOwner"] }) | undefined,
  form1099SA: Form1099SAResult,
  taxpayer?: Taxpayer
): Form8889Input | undefined {
  if (taxpayer && !taxpayer.spouse && (input?.accountOwner === "spouse"
    || form1099SA.defaultAccountOwner === "spouse"
    || ownerSupportHasAnyValues(form1099SA.accountOwnerSupport.spouse))) {
    throw new Error("HSA spouse-owned sources require actual spouse taxpayer context; reconcile ownership instead of relabeling the source.");
  }
  if (taxpayer && taxpayer.taxYear >= 2026 && form1099SA.unattributedRecordCount > 0) {
    throw new Error("Actual account owner is required for every 2026 HSA source record.");
  }
  const canDefaultUnattributedSupportToPrimary = canSafelyDefaultUnattributedSupportToPrimary(taxpayer);
  const hasUnattributedSupport = ownerSupportHasAnyValues(form1099SA.unattributedSupport);
  const inferredAccountOwner = input?.accountOwner
    ?? form1099SA.defaultAccountOwner
    ?? (
      hasUnattributedSupport && canDefaultUnattributedSupportToPrimary
        ? "primary"
        : undefined
    );
  const requestedAccountOwner = inferredAccountOwner;
  const selectedAccountOwner = requestedAccountOwner;
  const requestedOwnerSupport = requestedAccountOwner === undefined
    ? EMPTY_OWNER_SUPPORT
    : normalizeOwnerSupport(form1099SA.accountOwnerSupport[requestedAccountOwner]);
  const ownerSupport = selectedAccountOwner === "primary" && canDefaultUnattributedSupportToPrimary
    ? addOwnerSupport(requestedOwnerSupport, normalizeOwnerSupport(form1099SA.unattributedSupport))
    : requestedOwnerSupport;
  const supportedAutomaticExceptionAmount = ownerSupport.hsaDeathDistributionDateOfDeathValue
    .plus(ownerSupport.hsaDisabilityExceptionDistributions);
  const requestedExceptionAmount = Decimal.max(
    new Decimal(0),
    d(input?.distributionsNotSubjectToAdditionalTax)
  );
  const autoExceptionAmount = requestedExceptionAmount.greaterThanOrEqualTo(
    supportedAutomaticExceptionAmount
  )
    ? requestedExceptionAmount
    : supportedAutomaticExceptionAmount.plus(requestedExceptionAmount);
  const shouldBuildForm8889 = input !== undefined || ownerSupport.hsaGrossDistributions.greaterThan(0);

  if (!shouldBuildForm8889) {
    return undefined;
  }

  return {
    accountOwner: selectedAccountOwner ?? "primary",
    coverageByMonth: input?.coverageByMonth ?? DEFAULT_HSA_COVERAGE_BY_MONTH,
    useLastMonthRule: input?.useLastMonthRule,
    spouseFamilyCoverageMonths: input?.spouseFamilyCoverageMonths ?? [],
    contributionsMade: input?.contributionsMade ?? "0",
    archerMSAContributions: input?.archerMSAContributions ?? "0",
    bothSpousesHaveHsas: input?.bothSpousesHaveHsas ?? false,
    spouseAllocatedLimit: input?.spouseAllocatedLimit,
    employerContributions: input?.employerContributions,
    supportedW2EmployerContributions: input?.supportedW2EmployerContributions ?? "0",
    qualifiedFundingDistribution: input?.qualifiedFundingDistribution ?? "0",
    qualifiedFundingDistributionSource: input?.qualifiedFundingDistributionSource,
    distributionsReceived: input?.distributionsReceived ?? ownerSupport.hsaGrossDistributions.toString(),
    excludedDistributions: input?.excludedDistributions,
    rolloverDistributions: input?.rolloverDistributions ?? "0",
    prohibitedTransactionDistributions: input?.prohibitedTransactionDistributions
      ?? ownerSupport.hsaProhibitedTransactionDistributions.toString(),
    qualifiedMedicalExpenses: input?.qualifiedMedicalExpenses ?? "0",
    decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath:
      input?.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath ?? "0",
    distributionsNotSubjectToAdditionalTax: autoExceptionAmount.toString(),
    distributionsAfterAge65: input?.distributionsAfterAge65 ?? "0",
    lastMonthRuleContributions: input?.lastMonthRuleContributions ?? "0",
    lastMonthRuleRedeterminedLimit: input?.lastMonthRuleRedeterminedLimit,
    priorYearRedeterminedLimitWorksheet: input?.priorYearRedeterminedLimitWorksheet,
    recaptureQualifiedFundingDistribution: input?.recaptureQualifiedFundingDistribution ?? "0",
    testingPeriodFailureDueToDeathOrDisability: input?.testingPeriodFailureDueToDeathOrDisability ?? false,
    supported1099SAGrossDistributions: ownerSupport.hsaGrossDistributions.toString(),
    supported1099SAReturnedExcessContributions: ownerSupport.hsaReturnedExcessContributions.toString(),
    supported1099SAReturnedExcessContributionEarnings: ownerSupport.hsaReturnedExcessContributionEarnings.toString(),
    supported1099SADeathDistributionDateOfDeathValue: ownerSupport.hsaDeathDistributionDateOfDeathValue.toString(),
    supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue:
      ownerSupport.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toString(),
    supported1099SAEstateDeathDistributionDateOfDeathValue:
      ownerSupport.hsaEstateDeathDistributionDateOfDeathValue.toString(),
    supported1099SADisabilityExceptionDistributions:
      ownerSupport.hsaDisabilityExceptionDistributions.toString(),
    supported1099SAAutomaticExceptionDistributions: ownerSupport.hsaDeathDistributionDateOfDeathValue
      .plus(ownerSupport.hsaDisabilityExceptionDistributions)
      .toString(),
    supported1099SAProhibitedTransactionDistributions: ownerSupport.hsaProhibitedTransactionDistributions.toString(),
    medicareMonths: input?.medicareMonths ?? [],
    isDependent: input?.isDependent ?? false,
  };
}
