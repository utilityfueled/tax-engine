/**
 * Form 1099-R aggregation helper.
 * Spec: spec/federal/form-1099-r.yaml
 *
 * Collapses retirement distribution inputs into the Form 1040 IRA and
 * pension/annuity reporting lines. This first slice supports basic gross
 * versus taxable reporting, direct rollovers, and Box 4 withholding.
 */

import Decimal from "decimal.js";
import type { Form1099R } from "@/models/inputs.js";
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
  options: { qcdAnnualLimit?: Decimal } = {}
): Form1099RResult {
  const audit = new AuditTrail();
  const iraForms = forms.filter(isIraForm1099RDistribution);
  const disabilityPensionForms = forms.filter(isDisabilityPensionTaxableAsWages);
  const pensionForms = forms.filter((form) => !isIraForm1099RDistribution(form) && !isDisabilityPensionTaxableAsWages(form));

  const qcdLimitResolution = resolveQualifiedCharitableDistributionLimit(
    iraForms,
    options.qcdAnnualLimit
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
  const iraQualifiedCharitableDistributions = qcdLimitResolution.qualifiedCharitableDistributions;
  const qcdExcess = qcdLimitResolution.qcdExcess;

  // Per-form taxable amounts already subtracted each form's QCD.  Add back the
  // aggregate excess so the capped QCD is the only exclusion that flows through.
  const iraTaxable = sum(...iraForms.map(resolveForm1099RTaxableAmount)).plus(qcdExcess);
  const pensionSimplifiedMethodForms = pensionForms.filter(usesSimplifiedMethodForTaxableAmount);

  // ── Payer-level Simplified Method aggregation (Pub 575) ──────────
  // Group Simplified Method forms by payer+plan so same-plan forms share
  // a single exclusion calculation with aggregated payments.
  const payerGroupExclusionOverrides = buildPayerGroupedSimplifiedMethodExclusions(pensionSimplifiedMethodForms);

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
  const disabilityPensionTaxableBeforePublicSafetyOfficerExclusion = sum(
    ...disabilityPensionForms.map(resolveForm1099RTaxableAmount)
  );
  const disabilityPensionRetiredPublicSafetyOfficerInsurancePremiums = sum(
    ...disabilityPensionForms.map(resolveRetiredPublicSafetyOfficerInsurancePremiums)
  );
  const disabilityPensionPublicSafetyOfficerPremiumExclusion = Decimal.min(
    RETIRED_PUBLIC_SAFETY_OFFICER_PREMIUM_CAP,
    disabilityPensionRetiredPublicSafetyOfficerInsurancePremiums,
    disabilityPensionTaxableBeforePublicSafetyOfficerExclusion
  );
  const pensionRetiredPublicSafetyOfficerInsurancePremiums = sum(
    ...pensionForms.map(resolveRetiredPublicSafetyOfficerInsurancePremiums)
  );
  const pensionTaxableBeforePublicSafetyOfficerExclusion = sum(
    ...pensionForms.map((form) =>
      resolveForm1099RTaxableAmountWithPayerGrouping(form, payerGroupExclusionOverrides.formOverrides)
    )
  );
  const pensionPublicSafetyOfficerPremiumExclusion = Decimal.min(
    Decimal.max(
      new Decimal(0),
      RETIRED_PUBLIC_SAFETY_OFFICER_PREMIUM_CAP.minus(disabilityPensionPublicSafetyOfficerPremiumExclusion)
    ),
    pensionRetiredPublicSafetyOfficerInsurancePremiums,
    pensionTaxableBeforePublicSafetyOfficerExclusion
  );
  const disabilityPensionWages = Decimal.max(
    new Decimal(0),
    disabilityPensionTaxableBeforePublicSafetyOfficerExclusion.minus(disabilityPensionPublicSafetyOfficerPremiumExclusion)
  );
  const pensionTaxable = Decimal.max(
    new Decimal(0),
    pensionTaxableBeforePublicSafetyOfficerExclusion.minus(pensionPublicSafetyOfficerPremiumExclusion)
  );
  const iraGrossReported = shouldReportGross(iraForms)
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
    shouldReportGross(iraForms)
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
    qcdExcess.greaterThan(0) && qcdLimitResolution.ownerAwareLimitApplication !== undefined
      ? `Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts capped separately per known IRA owner at annual limit $${qcdAnnualLimit} (IRC §408(d)(8)(A)); $${qcdExcess} excess QCD added back to taxable`
      : qcdExcess.greaterThan(0)
      ? `Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts capped at annual limit $${qcdAnnualLimit} (IRC §408(d)(8)(A)); $${qcdExcess} excess QCD added back to taxable`
      : "Sum taxable IRA/SEP/SIMPLE distributions from Box 2a, taxable earnings on validated current-year IRA contributions returned by the due date, validated excess-contribution returns without earnings, or Box 1 unless direct rollover, then subtract excludable QCD amounts without going below zero",
    {
      "IRA forms": iraForms.length.toString(),
      "Qualified charitable distributions (capped)": iraQualifiedCharitableDistributions,
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
  const qualifiedCharitableDistribution = resolveQualifiedCharitableDistribution(form);
  const taxableAmountBeforeQcd = resolveTaxableAmountBeforeQcd(form);

  return Decimal.max(new Decimal(0), taxableAmountBeforeQcd.minus(qualifiedCharitableDistribution));
}

function resolveTaxableAmountBeforeQcd(form: Form1099R): Decimal {
  if (isPriorYearTaxableDistribution(form)) {
    return new Decimal(0);
  }

  if (isRecharacterizedIraContribution(form)) {
    return new Decimal(0);
  }

  if (isQualifiedRothIraDistribution(form)) {
    return new Decimal(0);
  }

  if (isQualifiedDesignatedRothAccountDistribution(form)) {
    return new Decimal(0);
  }

  if (isDesignatedRothDirectRolloverToRothIra(form)) {
    return new Decimal(0);
  }

  if (resolveQualifiedRothDistributionAmount(form).greaterThan(0)) {
    return new Decimal(0);
  }

  if (isCodeTSafeHarborDistribution(form)) {
    return new Decimal(0);
  }

  if (usesSimplifiedMethodForTaxableAmount(form)) {
    return Decimal.max(
      new Decimal(0),
      d(form.grossDistribution).minus(resolveSimplifiedMethodCurrentYearExcludableAmount(form))
    );
  }

  if (form.taxableAmount !== undefined) {
    return Decimal.max(new Decimal(0), d(form.taxableAmount));
  }

  if (isSection1035ExchangeWithBlankBox2a(form)) {
    return new Decimal(0);
  }

  if (hasDirectRolloverCode(form.distributionCode)) {
    return new Decimal(0);
  }

  if (isReturnedContributionByDueDate(form)) {
    return new Decimal(0);
  }

  if (isNontaxableExcessContributionReturn(form)) {
    return new Decimal(0);
  }

  if (!isIraForm1099RDistribution(form) && d(form.employeeContributions).greaterThan(0)) {
    return Decimal.max(new Decimal(0), d(form.grossDistribution).minus(d(form.employeeContributions)));
  }

  return Decimal.max(new Decimal(0), d(form.grossDistribution));
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

  return form.taxableAmount === undefined || form.taxableAmountNotDetermined;
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
