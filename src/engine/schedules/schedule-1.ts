/**
 * Schedule 1 — Additional Income and Adjustments to Income
 * Spec: spec/federal/schedule-1.yaml
 *
 * Part I: Additional income not on 1040 directly (business, rental, etc.)
 * Part II: Above-the-line adjustments (HSA, SE tax deduction, student loan, etc.)
 */

import Decimal from "decimal.js";
import type { Form8889Input, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { getConstants } from "@/models/constants.js";
import {
  calculateForm8889,
  mergeW2Box12CodeWIntoForm8889Input,
  type Form8889Result,
} from "@/engine/forms/form-8889.js";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { calculateForm4797, type Form4797Result } from "@/engine/forms/form-4797.js";
import { calculateSocialSecurityBenefitsWorksheet } from "@/engine/forms/social-security-benefits-worksheet.js";
import { calculateIraDeduction } from "@/engine/forms/ira-deduction-worksheet.js";
import { calculateForm1099C } from "@/engine/forms/form-1099-c.js";
import { calculateForm3903, type Form3903Result } from "@/engine/forms/form-3903.js";

export interface Schedule1Input {
  /** Schedule C net profit (Line 31) */
  schedCNetProfit?: Decimal;
  /** Schedule F net farm profit (Line 34) */
  schedFNetProfit?: Decimal;
  /** Schedule E total supplemental income (Line 41) */
  schedETotal?: Decimal;
  /** Schedule D capital gain or loss (Line 21) */
  capitalGainLoss?: Decimal;
  /** Schedule SE deductible half */
  seDeductibleHalf?: Decimal;
  /** Self-employed retirement plan contributions (SEP/SIMPLE/qualified) */
  seRetirementContributions?: Decimal;
  /** Taxable state refund from prior year */
  taxableStateRefund?: Decimal;
  /** Alimony received (pre-2019 agreements) */
  alimonyReceived?: Decimal;
  /** HSA deduction override, normally from Form 8889 Line 13 */
  hsaDeduction?: Decimal;
  /** Early withdrawal penalty (1099-INT Box 2 + manual) */
  earlyWithdrawalPenalty?: Decimal;
  /** Alimony paid (pre-2019 agreements) */
  alimonyPaid?: Decimal;
  /** Gambling income from W-2G forms and manual input */
  gamblingIncome?: Decimal;
  /** NOL deduction computed by the federal engine (IRC §172, limited to 80% of pre-NOL taxable income) */
  nolDeduction?: Decimal;
  /** Net Form2555line45, entered as negative Schedule1line8d. */
  form2555IncomeReduction?: Decimal;
  /** Form 2555 housing deduction for self-employed (Schedule 1 Line 24j) */
  form2555HousingDeduction?: Decimal;
  /** Pre-computed SE health insurance deduction from the Pub 535 worksheet (bypasses manual cap logic) */
  seHealthInsurance?: Decimal;
}

export interface Schedule1Result {
  // Part I
  taxableRefunds: Decimal; // Line 1
  businessIncome: Decimal; // Line 3
  otherGainsOrLosses: Decimal; // Line 4
  supplementalIncome: Decimal; // Line 5
  farmIncome: Decimal; // Line 6
  unemploymentCompensation: Decimal; // Line 7
  capitalGainLoss: Decimal; // Form 1040 Line 7 passthrough
  alimonyReceived: Decimal; // Line 2a
  nolDeduction: Decimal; // Line 8a (negative in other income)
  gamblingIncome: Decimal; // Line 8b
  cancelledDebtIncome: Decimal; // Line 8c
  foreignIncomeExclusion: Decimal; // Positive net Form2555line45, negative on8d
  hsaTaxableDistributions: Decimal; // Line 8f
  totalAdditionalIncome: Decimal; // Line 10

  // Part II
  businessExpenseAdjustments: Decimal; // Line 12
  hsaDeduction: Decimal; // Line 13
  armedForcesMovingExpenses: Decimal; // Line 14
  seDeduction: Decimal; // Line 15
  seRetirementContributions: Decimal; // Line 16
  seHealthInsurance: Decimal; // Line 17
  earlyWithdrawalPenalty: Decimal; // Line 18
  alimonyPaid: Decimal; // Line 19a
  iraDeduction: Decimal; // Line 20
  studentLoanInterest: Decimal; // Line 21
  archerMSADeduction: Decimal; // Line 23
  otherAdjustmentsTotal: Decimal; // Line 25
  educatorExpenses: Decimal; // Line 11
  totalAdjustments: Decimal; // Line 26

  lines: CalculatedLine[];
  form8889?: Form8889Result;
  form8889ByOwner?: Partial<Record<Form8889Input["accountOwner"], Form8889Result>>;
  hsaAdditionalTax: Decimal;
  hsaRecaptureTax: Decimal;
}

const MAX_STUDENT_LOAN_DEDUCTION = new Decimal(2500);
const MAX_EDUCATOR_EXPENSES = new Decimal(300);
const DEFAULT_DOCUMENT_ONLY_HSA_COVERAGE = Array.from({ length: 12 }, () => "none") as Form8889Input["coverageByMonth"];
const ZERO = new Decimal(0);

function calculateEducatorExpensesDeduction(
  adjustments: TaxYearInput["adjustments"],
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"]
): {
  amount: Decimal;
  formula: string;
  inputs: Record<string, Decimal | string>;
} {
  const aggregateEducatorExpenses = d(adjustments?.educatorExpenses);
  const primaryEducatorExpenses = d(adjustments?.primaryEducatorExpenses);
  const spouseEducatorExpenses = d(adjustments?.spouseEducatorExpenses);
  const hasSplitEducatorExpenses =
    primaryEducatorExpenses.greaterThan(0) || spouseEducatorExpenses.greaterThan(0);

  if (hasSplitEducatorExpenses) {
    const allowedPrimaryEducatorExpenses = min(primaryEducatorExpenses, MAX_EDUCATOR_EXPENSES);
    const allowedSpouseEducatorExpenses = filingStatus === "married_filing_jointly"
      ? min(spouseEducatorExpenses, MAX_EDUCATOR_EXPENSES)
      : ZERO;

    return {
      amount: allowedPrimaryEducatorExpenses.plus(allowedSpouseEducatorExpenses),
      formula: filingStatus === "married_filing_jointly"
        ? "min(primary educator expenses, $300) + min(spouse educator expenses, $300)"
        : "min(primary educator expenses, $300)",
      inputs: {
        "Primary educator expenses entered": primaryEducatorExpenses,
        "Primary educator expenses allowed": allowedPrimaryEducatorExpenses,
        "Spouse educator expenses entered": spouseEducatorExpenses,
        "Spouse educator expenses allowed": allowedSpouseEducatorExpenses,
        "Ignored aggregate educator expenses fallback": aggregateEducatorExpenses,
      },
    };
  }

  return {
    amount: min(aggregateEducatorExpenses, MAX_EDUCATOR_EXPENSES),
    formula: `min(${aggregateEducatorExpenses}, $300)`,
    inputs: {
      "Aggregate educator expenses entered": aggregateEducatorExpenses,
    },
  };
}

function normalizeForm8889InputWithDocumentSupport(
  input: Form8889Input | undefined,
  form1099SA: ReturnType<typeof calculateForm1099SA>,
  taxpayer: TaxYearInput["taxpayer"],
  w2s: TaxYearInput["w2s"]
): Form8889Input | undefined {
  return mergeW2Box12CodeWIntoForm8889Input(
    mergeForm1099SAIntoForm8889Input(input, form1099SA, taxpayer),
    w2s,
    taxpayer.filingStatus
  );
}

function buildDocumentOnlyForm8889Input(
  accountOwner: Form8889Input["accountOwner"],
  input: Form8889Input | undefined,
  form1099SA: ReturnType<typeof calculateForm1099SA>,
  taxpayer?: TaxYearInput["taxpayer"]
): Form8889Input | undefined {
  return mergeForm1099SAIntoForm8889Input(
    input ?? {
      accountOwner,
      coverageByMonth: DEFAULT_DOCUMENT_ONLY_HSA_COVERAGE,
      contributionsMade: "0",
    },
    form1099SA,
    taxpayer
  );
}

function ownerHasHsaDocumentSupport(
  ownerSupport: ReturnType<typeof calculateForm1099SA>["accountOwnerSupport"][Form8889Input["accountOwner"]]
): boolean {
  return ownerSupport.hsaGrossDistributions.greaterThan(0)
    || ownerSupport.hsaReturnedExcessContributions.greaterThan(0)
    || ownerSupport.hsaDisabilityExceptionDistributions.greaterThan(0)
    || ownerSupport.hsaDeathDistributionDateOfDeathValue.greaterThan(0)
    || ownerSupport.hsaProhibitedTransactionDistributions.greaterThan(0);
}

function ownerHasTaggedW2HsaContributionSupport(
  accountOwner: Form8889Input["accountOwner"],
  w2s: TaxYearInput["w2s"]
): boolean {
  return w2s.some((w2) => w2.accountHolder === accountOwner && d(w2.box12CodeW).greaterThan(0));
}

function ownerHasDocumentOnlyHsaSupport(
  accountOwner: Form8889Input["accountOwner"],
  form1099SA: ReturnType<typeof calculateForm1099SA>,
  w2s: TaxYearInput["w2s"]
): boolean {
  return ownerHasHsaDocumentSupport(form1099SA.accountOwnerSupport[accountOwner])
    || ownerHasTaggedW2HsaContributionSupport(accountOwner, w2s);
}

function calculateSupplementalOwnerForm8889(
  taxpayer: TaxYearInput["taxpayer"],
  accountOwner: Form8889Input["accountOwner"],
  form1099SA: ReturnType<typeof calculateForm1099SA>,
  w2s: TaxYearInput["w2s"],
  constants: ReturnType<typeof getConstants>
): Form8889Result | undefined {
  if (!ownerHasDocumentOnlyHsaSupport(accountOwner, form1099SA, w2s)) {
    return undefined;
  }

  const normalizedDocumentOnlyInput = buildDocumentOnlyForm8889Input(accountOwner, undefined, form1099SA, taxpayer);
  if (!normalizedDocumentOnlyInput) {
    return undefined;
  }

  const normalizedInput = mergeW2Box12CodeWIntoForm8889Input(
    normalizedDocumentOnlyInput,
    w2s,
    taxpayer.filingStatus
  );
  if (!normalizedInput) {
    return undefined;
  }

  return calculateForm8889(taxpayer, normalizedInput, constants);
}

function calculateStudentLoanInterestDeduction(
  rawInterest: Decimal,
  filingStatus: TaxYearInput["taxpayer"]["filingStatus"],
  modifiedAgi: Decimal,
  constants: ReturnType<typeof getConstants>
): {
  deduction: Decimal;
  phaseOutRatio: Decimal;
  phaseOutStart: Decimal;
  phaseOutEnd: Decimal;
} {
  const cappedInterest = min(Decimal.max(ZERO, rawInterest), MAX_STUDENT_LOAN_DEDUCTION);
  const phaseOutStart = constants.studentLoanInterestDeduction.phaseOutStart[filingStatus];
  const phaseOutEnd = constants.studentLoanInterestDeduction.phaseOutEnd[filingStatus];

  if (filingStatus === "married_filing_separately") {
    return {
      deduction: ZERO,
      phaseOutRatio: new Decimal(1),
      phaseOutStart,
      phaseOutEnd,
    };
  }

  if (cappedInterest.isZero() || modifiedAgi.lessThanOrEqualTo(phaseOutStart)) {
    return {
      deduction: roundDollar(cappedInterest),
      phaseOutRatio: ZERO,
      phaseOutStart,
      phaseOutEnd,
    };
  }

  if (modifiedAgi.greaterThanOrEqualTo(phaseOutEnd)) {
    return {
      deduction: ZERO,
      phaseOutRatio: new Decimal(1),
      phaseOutStart,
      phaseOutEnd,
    };
  }

  // The IRS worksheet says to round this ratio to at least three decimal
  // places, so keep full Decimal precision here instead of clamping to
  // exactly three decimals and prematurely zeroing the deduction near the
  // phase-out ceiling.
  const phaseOutRatio = modifiedAgi
    .minus(phaseOutStart)
    .dividedBy(phaseOutEnd.minus(phaseOutStart));
  const worksheetDeduction = Decimal.max(
    ZERO,
    cappedInterest.minus(cappedInterest.times(phaseOutRatio))
  );

  return {
    deduction: roundDollar(worksheetDeduction),
    phaseOutRatio,
    phaseOutStart,
    phaseOutEnd,
  };
}

export function calculateSchedule1(
  input: TaxYearInput,
  extra?: Schedule1Input,
  precomputedForm4797?: Form4797Result
): Schedule1Result {
  const audit = new AuditTrail();
  const adjustments = input.adjustments;
  const constants = getConstants(input.taxpayer.taxYear);
  const filingStatus = input.taxpayer.filingStatus;

  // ── Part I: Additional Income ─────────────────────────

  const taxableRefunds = extra?.taxableStateRefund ?? new Decimal(0);
  audit.record("Sched 1", "1", "Taxable refunds", taxableRefunds, "Prior-year state refund (if itemized)");

  const businessIncome = extra?.schedCNetProfit ?? new Decimal(0);
  audit.record("Sched 1", "3", "Business income or loss", businessIncome, "Schedule C Line 31");

  const form4797 = precomputedForm4797 ?? calculateForm4797(input);
  if (precomputedForm4797 === undefined) {
    audit.merge(form4797.lines);
  }
  const otherGainsOrLosses = form4797.ordinaryGainOrLoss;
  audit.record("Sched 1", "4", "Other gains or losses", otherGainsOrLosses,
    "Form 4797 Part I ordinary (Line 11 + Line 12) + Part II ordinary (recapture + short-term) + supported Form 8824 ordinary recapture", {
      "Form 4797 Line 11": form4797.line11,
      "Form 4797 Line 12": form4797.line12,
      "Form 4797 Part II ordinary": form4797.partIIOrdinaryTotal,
      "Form 4797 supported Form 8824 ordinary income": form4797.supportedForm8824OrdinaryIncome,
    });

  const supplementalIncome = extra?.schedETotal ?? new Decimal(0);
  audit.record("Sched 1", "5", "Supplemental income", supplementalIncome, "Schedule E Line 41");

  // Line 6: Farm income or loss (Schedule F Line 34)
  const farmIncome = extra?.schedFNetProfit ?? new Decimal(0);
  audit.record("Sched 1", "6", "Farm income or loss", farmIncome, "Schedule F Line 34");

  // Line 7: Unemployment compensation (Form 1099-G Box 1)
  const form1099Gs = input.form1099G ?? [];
  const unemploymentCompensation = sum(
    ...form1099Gs.map((f) => d(f.unemploymentCompensation))
  );
  audit.record("Sched 1", "7", "Unemployment compensation", unemploymentCompensation,
    form1099Gs.length > 0
      ? `Sum of ${form1099Gs.length} Form 1099-G Box 1 amount(s)`
      : "No Form 1099-G unemployment compensation reported");

  const capitalGainLoss = extra?.capitalGainLoss ?? new Decimal(0);

  const alimonyReceived = extra?.alimonyReceived ?? new Decimal(0);
  audit.record("Sched 1", "2a", "Alimony received", alimonyReceived, "Pre-2019 agreements only");

  // Line 8b: Gambling income (W-2G + manual)
  const gamblingIncome = extra?.gamblingIncome ?? new Decimal(0);
  audit.record("Sched 1", "8b", "Gambling income", gamblingIncome,
    gamblingIncome.greaterThan(0)
      ? "Total gambling winnings from W-2G forms and manual input"
      : "No gambling income reported");

  // Line 8c: Cancellation of debt income (Form 1099-C / Form 982)
  const form1099CForms = input.form1099C ?? [];
  const form1099CResult = form1099CForms.length > 0
    ? calculateForm1099C(form1099CForms, input.codExclusion, filingStatus, constants)
    : undefined;
  if (form1099CResult) {
    audit.merge(form1099CResult.lines);
  }
  const cancelledDebtIncome = form1099CResult?.taxableCodIncome ?? new Decimal(0);
  audit.record("Sched 1", "8c", "Cancellation of debt income", cancelledDebtIncome,
    form1099CForms.length > 0
      ? `Taxable COD income from ${form1099CForms.length} Form 1099-C document(s) after IRC §108 exclusions`
      : "No Form 1099-C cancellation of debt income reported");

  const form1099SA = calculateForm1099SA(input.form1099SA ?? []);
  const normalizedForm8889 = input.form8889ByOwner === undefined
    ? normalizeForm8889InputWithDocumentSupport(input.form8889, form1099SA, input.taxpayer, input.w2s)
    : undefined;
  const normalizedExplicitForm8889ByOwner = input.form8889ByOwner === undefined
    ? undefined
    : {
      primary: input.form8889ByOwner.primary === undefined
        ? undefined
        : normalizeForm8889InputWithDocumentSupport(
          input.form8889ByOwner.primary,
          form1099SA,
          input.taxpayer,
          input.w2s
        ),
      spouse: input.form8889ByOwner.spouse === undefined
        ? undefined
        : normalizeForm8889InputWithDocumentSupport(
          input.form8889ByOwner.spouse,
          form1099SA,
          input.taxpayer,
          input.w2s
        ),
    } satisfies Partial<Record<Form8889Input["accountOwner"], Form8889Input | undefined>>;
  const form8889 = extra?.hsaDeduction === undefined && normalizedForm8889
    ? calculateForm8889(input.taxpayer, normalizedForm8889, constants)
    : undefined;
  let form8889ByOwner: Partial<Record<Form8889Input["accountOwner"], Form8889Result>> | undefined;
  if (form8889) {
    audit.merge(form8889.lines);
  }

  if (extra?.hsaDeduction === undefined && normalizedExplicitForm8889ByOwner !== undefined) {
    const primaryExplicitResult = normalizedExplicitForm8889ByOwner.primary
      ? calculateForm8889(input.taxpayer, normalizedExplicitForm8889ByOwner.primary, constants)
      : undefined;
    const spouseExplicitResult = normalizedExplicitForm8889ByOwner.spouse
      ? calculateForm8889(input.taxpayer, normalizedExplicitForm8889ByOwner.spouse, constants)
      : undefined;

    if (primaryExplicitResult || spouseExplicitResult) {
      form8889ByOwner = {};

      if (primaryExplicitResult) {
        form8889ByOwner.primary = primaryExplicitResult;
        audit.merge(primaryExplicitResult.lines);
      }

      if (spouseExplicitResult) {
        form8889ByOwner.spouse = spouseExplicitResult;
        audit.merge(spouseExplicitResult.lines);
      }
    }
  }

  if (extra?.hsaDeduction === undefined) {
    const selectedAccountOwner = normalizedForm8889?.accountOwner;
    const explicitOwners = new Set<Form8889Input["accountOwner"]>(
      form8889ByOwner
        ? (Object.keys(form8889ByOwner) as Array<Form8889Input["accountOwner"]>)
        : []
    );
    const shouldBuildPrimaryStatement = (
      input.form8889ByOwner !== undefined
        ? !explicitOwners.has("primary")
        : selectedAccountOwner !== undefined
        ? selectedAccountOwner !== "primary"
        : ownerHasDocumentOnlyHsaSupport("primary", form1099SA, input.w2s)
    );
    const shouldBuildSpouseStatement = input.taxpayer.spouse !== undefined && (
      input.form8889ByOwner !== undefined
        ? !explicitOwners.has("spouse")
        : selectedAccountOwner !== undefined
        ? selectedAccountOwner !== "spouse"
        : ownerHasDocumentOnlyHsaSupport("spouse", form1099SA, input.w2s)
    );
    const primaryResult = shouldBuildPrimaryStatement
      ? calculateSupplementalOwnerForm8889(input.taxpayer, "primary", form1099SA, input.w2s, constants)
      : undefined;
    const spouseResult = shouldBuildSpouseStatement
      ? calculateSupplementalOwnerForm8889(input.taxpayer, "spouse", form1099SA, input.w2s, constants)
      : undefined;

    if (primaryResult || spouseResult) {
      form8889ByOwner ??= {};
      if (primaryResult && form8889ByOwner.primary === undefined) {
        form8889ByOwner.primary = primaryResult;
        audit.merge(primaryResult.lines);
      }
      if (spouseResult && form8889ByOwner.spouse === undefined) {
        form8889ByOwner.spouse = spouseResult;
        audit.merge(spouseResult.lines);
      }
    }
  }
  const ownerForm8889Results = form8889ByOwner
    ? (Object.values(form8889ByOwner).filter((result): result is Form8889Result => result !== undefined))
    : [];
  const combinedForm8889Results = [
    ...(form8889 ? [form8889] : []),
    ...ownerForm8889Results,
  ];
  const usingOwnerSpecificStatements = form8889 === undefined && ownerForm8889Results.length > 0;
  const usingSupplementalOwnerStatements = form8889 !== undefined && ownerForm8889Results.length > 0;
  const hsaTaxableDistributions = sum(...combinedForm8889Results.map((result) => result.line16.plus(result.line20)));
  audit.record(
    "Sched 1",
    "8f",
    "HSA income",
    hsaTaxableDistributions,
    usingSupplementalOwnerStatements
      ? "Sum the main supported Form 8889 Line 16 and Line 20 amounts plus any supplemental owner-specific supported Form 8889 statement amounts"
      : usingOwnerSpecificStatements
      ? "Sum each owner-specific supported Form 8889 statement's Line 16 taxable HSA distributions and Line 20 HSA recapture income"
      : "Form 8889 Line 16 + Line 20",
    {
      "Form 8889 Line 16": form8889?.line16 ?? new Decimal(0),
      "Form 8889 Line 20": form8889?.line20 ?? new Decimal(0),
      "Primary owner Form 8889 Line 16": form8889ByOwner?.primary?.line16 ?? new Decimal(0),
      "Primary owner Form 8889 Line 20": form8889ByOwner?.primary?.line20 ?? new Decimal(0),
      "Spouse owner Form 8889 Line 16": form8889ByOwner?.spouse?.line16 ?? new Decimal(0),
      "Spouse owner Form 8889 Line 20": form8889ByOwner?.spouse?.line20 ?? new Decimal(0),
    }
  );

  // Line 8a: NOL deduction (entered as negative, reduces total additional income)
  const nolDeduction = Decimal.max(new Decimal(0), extra?.nolDeduction ?? new Decimal(0));
  if (nolDeduction.greaterThan(0)) {
    audit.record("Sched 1", "8a", "Net operating loss deduction", nolDeduction.negated(),
      "IRC §172 NOL deduction limited to 80% of taxable income computed without the deduction",
      { "Available NOL deducted": nolDeduction });
  }

  const foreignIncomeExclusion = extra?.form2555IncomeReduction ?? new Decimal(0);
  if (!foreignIncomeExclusion.isFinite() || foreignIncomeExclusion.lt(0)) throw new Error("Form2555 net exclusion must be finite and nonnegative");
  if (extra?.form2555IncomeReduction !== undefined) {
    audit.record("Sched 1", "8d", "Foreign earned income and housing exclusion", foreignIncomeExclusion.negated(), "Negative net Form2555line45; gross wages remain on1040line1z");
  }
  const totalAdditionalIncome = sum(
    taxableRefunds,
    businessIncome,
    otherGainsOrLosses,
    supplementalIncome,
    farmIncome,
    unemploymentCompensation,
    capitalGainLoss,
    alimonyReceived,
    gamblingIncome,
    cancelledDebtIncome,
    hsaTaxableDistributions
  ).minus(nolDeduction).minus(foreignIncomeExclusion);
  audit.record("Sched 1", "10", "Total additional income", totalAdditionalIncome,
    nolDeduction.greaterThan(0)
      ? "Sum Lines 1-9 minus Line 8a NOL deduction → 1040 Line 8"
      : "Sum Lines 1-9 → 1040 Line 8");

  // ── Part II: Adjustments to Income ────────────────────

  const hsaDeductionFromSupportedForms = combinedForm8889Results.length > 0
    ? sum(...combinedForm8889Results.map((result) => result.line13))
    : undefined;
  const businessExpenseAdjustments = d(adjustments?.businessExpenseAdjustments);
  audit.record(
    "Sched 1",
    "12",
    "Business expense adjustments",
    businessExpenseAdjustments,
    "Validated manual Schedule 1 Line 12 total from deductible Form 2106 business expenses"
  );
  const hsaDeduction = extra?.hsaDeduction
    ?? hsaDeductionFromSupportedForms
    ?? d(adjustments?.hsaDeduction);
  audit.record(
    "Sched 1",
    "13",
    "HSA deduction",
    hsaDeduction,
    usingSupplementalOwnerStatements
      ? "Sum the main supported Form 8889 Line 13 amount plus any supplemental owner-specific supported Form 8889 statement amounts"
      : usingOwnerSpecificStatements
      ? "Sum each owner-specific supported Form 8889 statement's Line 13 amount"
      : "Form 8889",
    {
      "Single Form 8889 Line 13": form8889?.line13 ?? new Decimal(0),
      "Primary owner Form 8889 Line 13": form8889ByOwner?.primary?.line13 ?? new Decimal(0),
      "Spouse owner Form 8889 Line 13": form8889ByOwner?.spouse?.line13 ?? new Decimal(0),
      "Manual HSA adjustment fallback": d(adjustments?.hsaDeduction),
    }
  );
  const hsaAdditionalTax = sum(...combinedForm8889Results.map((result) => result.line17b));
  const hsaRecaptureTax = sum(...combinedForm8889Results.map((result) => result.line21));

  // Form 3903 moving expenses (Armed Forces only, 2018–2025)
  let form3903Result: Form3903Result | undefined;
  let armedForcesMovingExpenses: Decimal;
  if (input.form3903) {
    form3903Result = calculateForm3903(input.form3903);
    audit.merge(form3903Result.lines);
    armedForcesMovingExpenses = form3903Result.totalDeductible;
    audit.record(
      "Sched 1",
      "14",
      "Armed Forces moving expenses",
      armedForcesMovingExpenses,
      `Deductible moving expenses from Form 3903 (${input.form3903.moves.length} move${input.form3903.moves.length > 1 ? "s" : ""})`
    );
  } else {
    armedForcesMovingExpenses = d(adjustments?.armedForcesMovingExpenses);
    audit.record(
      "Sched 1",
      "14",
      "Armed Forces moving expenses",
      armedForcesMovingExpenses,
      "Validated manual Schedule 1 Line 14 amount for eligible active-duty military moves"
    );
  }

  const seDeduction = extra?.seDeductibleHalf ?? new Decimal(0);
  audit.record("Sched 1", "15", "Deductible SE tax", seDeduction, "Schedule SE Line 13 (50% of SE tax)");

  const seRetirementContributions = extra?.seRetirementContributions ?? new Decimal(0);
  audit.record("Sched 1", "16", "SE retirement contributions", seRetirementContributions, "SEP/SIMPLE/qualified plans");

  // Per IRS Schedule 1 Instructions, Line 17: "You can't deduct more than the net
  // profit you earned from the trade or business under which the insurance plan was
  // established (reduced by any deductions you claim on Schedule 1, lines 15 and 16)."
  // Cap = max(0, net_profit - deductible_SE_tax - SE_retirement_contributions)
  let seHealthInsurance: Decimal;
  if (extra?.seHealthInsurance !== undefined) {
    // Pre-computed from the Pub 535 Self-Employed Health Insurance Deduction Worksheet
    seHealthInsurance = extra.seHealthInsurance;
    audit.record("Sched 1", "17", "SE health insurance", seHealthInsurance,
      "Computed from Self-Employed Health Insurance Deduction Worksheet (Pub 535)");
  } else {
    const seHealthInsuranceRaw = d(adjustments?.selfEmployedHealthInsurance);
    if (extra?.schedCNetProfit !== undefined) {
      const cap = zeroFloor(
        extra.schedCNetProfit
          .minus(extra?.seDeductibleHalf ?? new Decimal(0))
          .minus(extra?.seRetirementContributions ?? new Decimal(0))
      );
      seHealthInsurance = min(seHealthInsuranceRaw, cap);
    } else {
      seHealthInsurance = seHealthInsuranceRaw;
    }
    audit.record("Sched 1", "17", "SE health insurance", seHealthInsurance,
      extra?.schedCNetProfit !== undefined
        ? `min(${seHealthInsuranceRaw}, cap=${zeroFloor(extra.schedCNetProfit.minus(extra?.seDeductibleHalf ?? new Decimal(0)).minus(extra?.seRetirementContributions ?? new Decimal(0)))})`
        : `${seHealthInsuranceRaw} (cap not applied — no business profit context)`);
  }

  // IRA deduction is computed below after all other adjustments are available for MAGI

  const archerMSADeduction = d(adjustments?.archerMSADeduction);
  audit.record("Sched 1", "23", "Archer MSA deduction", archerMSADeduction, "Validated manual Archer MSA deduction input");

  const educatorExpensesDeduction = calculateEducatorExpensesDeduction(adjustments, filingStatus);
  const educatorExpenses = educatorExpensesDeduction.amount;
  audit.record(
    "Sched 1",
    "11",
    "Educator expenses",
    educatorExpenses,
    educatorExpensesDeduction.formula,
    educatorExpensesDeduction.inputs
  );

  const otherAdjustmentsTotal = d(adjustments?.otherAdjustmentsTotal);
  audit.record(
    "Sched 1",
    "25",
    "Total other adjustments",
    otherAdjustmentsTotal,
    "Supported manual total of other Schedule 1 Part II adjustments reported on Lines 24a through 24z"
  );

  const earlyWithdrawalPenalty = extra?.earlyWithdrawalPenalty ?? d(adjustments?.earlyWithdrawalPenalty);
  audit.record("Sched 1", "18", "Early withdrawal penalty", earlyWithdrawalPenalty, "1099-INT Box 2 + manual adjustments");

  const alimonyPaid = extra?.alimonyPaid ?? d(adjustments?.alimonyPaid);
  audit.record("Sched 1", "19a", "Alimony paid", alimonyPaid, "Pre-2019 divorce/separation agreements only");

  // ── Income components shared by IRA and student loan MAGI ─────────
  const form1099R = calculateForm1099R(input.form1099R ?? [], {
    qcdAnnualLimit: constants.qcd.annualLimit,
  });
  const magiWages = sum(
    ...input.w2s.map((w2) => d(w2.wages)),
    form1099R.disabilityPensionWages
  );
  const magiInterest = sum(
    ...input.form1099Int.map((form) => d(form.interestIncome)),
    ...input.scheduleK1.map((k1) => d(k1.interestIncome))
  );
  const magiDividends = sum(
    ...input.form1099Div.map((form) => d(form.ordinaryDividends)),
    ...input.scheduleK1.map((k1) => d(k1.ordinaryDividends))
  );
  const magiMiscOtherIncome = sum(
    ...input.form1099Misc.map((form) => d(form.otherIncome))
  );
  const magiOtherIncome = sum(
    magiMiscOtherIncome,
    taxableRefunds,
    unemploymentCompensation,
    alimonyReceived,
    gamblingIncome,
    cancelledDebtIncome,
    hsaTaxableDistributions,
    form1099SA.hsaReturnedExcessContributionEarnings,
    form1099SA.hsaPostDeathEarnings
  );
  const socialSecurityBenefitsGross = sum(
    ...(input.formSSA1099 ?? []).map((form) => d(form.netBenefits)),
    ...(input.formRRB1099 ?? []).map((form) => d(form.netSocialSecurityEquivalentBenefitPortion))
  );
  const magiTaxExemptInterest = sum(
    ...input.form1099Int.map((form) => d(form.taxExemptInterest)),
    ...input.form1099Div.map((form) => d(form.exemptInterestDividends))
  );

  // ── Line 20: IRA deduction ────────────────────────────────────────
  const adjustmentsExcludingIraAndStudentLoan = sum(
    businessExpenseAdjustments,
    hsaDeduction,
    armedForcesMovingExpenses,
    seDeduction,
    seRetirementContributions,
    seHealthInsurance,
    earlyWithdrawalPenalty,
    alimonyPaid,
    archerMSADeduction,
    educatorExpenses,
    otherAdjustmentsTotal
  );

  let iraDeduction: Decimal;
  if (input.iraDeductionWorksheet) {
    const ws = input.iraDeductionWorksheet;
    // IRA MAGI per Pub 590-A: AGI before IRA deduction plus student loan
    // interest add-back equals total income minus adjustments excluding both
    // IRA and student loan. Social Security taxable benefits are excluded
    // because they depend on the IRA deduction (circular); for the typical
    // working-age taxpayer subject to IRA phase-out this is negligible.
    const iraMagi = sum(
      magiWages,
      magiInterest,
      magiDividends,
      form1099R.iraTaxable,
      form1099R.pensionTaxable,
      capitalGainLoss,
      businessIncome,
      supplementalIncome,
      farmIncome,
      magiOtherIncome
    ).minus(adjustmentsExcludingIraAndStudentLoan);

    const primaryResult = calculateIraDeduction({
      filingStatus,
      taxYear: input.taxpayer.taxYear,
      magi: iraMagi,
      contributions: ws.primaryContributions,
      isActiveParticipant: ws.primaryIsActiveParticipant,
      isSpouseActiveParticipant: ws.spouseIsActiveParticipant ?? false,
      age50OrOlder: ws.primaryAge50OrOlder ?? false,
      livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
    });
    audit.merge(primaryResult.lines);

    let spouseIraDeduction = ZERO;
    const isMfjForIra = filingStatus === "married_filing_jointly";
    if (isMfjForIra && d(ws.spouseContributions).greaterThan(0)) {
      const spouseResult = calculateIraDeduction({
        filingStatus,
        taxYear: input.taxpayer.taxYear,
        magi: iraMagi,
        contributions: d(ws.spouseContributions),
        isActiveParticipant: ws.spouseIsActiveParticipant ?? false,
        isSpouseActiveParticipant: ws.primaryIsActiveParticipant,
        age50OrOlder: ws.spouseAge50OrOlder ?? false,
        livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
      });
      audit.merge(spouseResult.lines);
      spouseIraDeduction = spouseResult.deductibleAmount;
    }

    iraDeduction = primaryResult.deductibleAmount.plus(spouseIraDeduction);
    audit.record("Sched 1", "20", "IRA deduction", iraDeduction,
      isMfjForIra && spouseIraDeduction.greaterThan(0)
        ? "Primary + Spouse IRA deduction from Pub 590-A worksheet"
        : "IRA deduction from Pub 590-A worksheet",
      {
        "IRA MAGI": iraMagi,
        "Primary contributions": d(ws.primaryContributions),
        "Primary deductible": primaryResult.deductibleAmount,
        "Primary active participant": ws.primaryIsActiveParticipant ? "Yes" : "No",
        ...(isMfjForIra && spouseIraDeduction.greaterThan(0) ? {
          "Spouse contributions": d(ws.spouseContributions),
          "Spouse deductible": spouseIraDeduction,
          "Spouse active participant": (ws.spouseIsActiveParticipant ?? false) ? "Yes" : "No",
        } : {}),
      }
    );
  } else {
    iraDeduction = d(adjustments?.iraDeduction);
    audit.record("Sched 1", "20", "IRA deduction", iraDeduction, "Subject to plan participation/income limits");
  }

  // ── Line 21: Student loan interest ────────────────────────────────
  const studentLoanRaw = d(adjustments?.studentLoanInterest);
  const adjustmentsExcludingStudentLoan = adjustmentsExcludingIraAndStudentLoan.plus(iraDeduction);
  const socialSecurityBenefitsTaxable = socialSecurityBenefitsGross.greaterThan(0)
    ? calculateSocialSecurityBenefitsWorksheet({
      filingStatus,
      benefitsReceived: socialSecurityBenefitsGross,
      otherIncome: sum(
        magiWages,
        magiInterest,
        magiDividends,
        form1099R.iraTaxable,
        form1099R.pensionTaxable,
        capitalGainLoss,
        businessIncome,
        supplementalIncome,
        farmIncome,
        magiOtherIncome
      ),
      taxExemptInterest: magiTaxExemptInterest,
      livedWithSpouseAtAnyTimeDuringYear: input.taxpayer.livedWithSpouseAtAnyTimeDuringYear,
      adjustments: {
        businessExpenseAdjustments,
        hsaDeduction,
        armedForcesMovingExpenses,
        seDeduction,
        seRetirementContributions,
        seHealthInsurance,
        earlyWithdrawalPenalty,
        alimonyPaid,
        iraDeduction,
        archerMSADeduction,
        educatorExpenses,
        otherAdjustmentsTotal,
        studentLoanInterest: ZERO,
      },
    }).taxableBenefits
    : ZERO;
  const supportedStudentLoanModifiedAgi = sum(
    magiWages,
    magiInterest,
    magiDividends,
    form1099R.iraTaxable,
    form1099R.pensionTaxable,
    socialSecurityBenefitsTaxable,
    capitalGainLoss,
    businessIncome,
    supplementalIncome,
    farmIncome,
    magiOtherIncome
  ).minus(adjustmentsExcludingStudentLoan);
  const {
    deduction: studentLoanInterest,
    phaseOutRatio: studentLoanPhaseOutRatio,
    phaseOutStart: studentLoanPhaseOutStart,
    phaseOutEnd: studentLoanPhaseOutEnd,
  } = calculateStudentLoanInterestDeduction(
    studentLoanRaw,
    filingStatus,
    supportedStudentLoanModifiedAgi,
    constants
  );
  const studentLoanCappedInterest = min(
    Decimal.max(ZERO, studentLoanRaw),
    MAX_STUDENT_LOAN_DEDUCTION
  );
  const studentLoanWorksheetDeductionBeforeRounding = studentLoanPhaseOutRatio.isZero()
    ? studentLoanCappedInterest
    : Decimal.max(
      ZERO,
      studentLoanCappedInterest.minus(studentLoanCappedInterest.times(studentLoanPhaseOutRatio))
    );
  audit.record(
    "Sched 1",
    "21",
    "Student loan interest",
    studentLoanInterest,
    filingStatus === "married_filing_separately"
      ? "No deduction allowed for married filing separately"
      : studentLoanPhaseOutRatio.isZero()
      ? `Smaller of qualified interest paid or $2,500 because supported modified AGI does not exceed the 2025 phase-out threshold`
      : studentLoanInterest.isZero()
      ? "Reduced to $0 because supported modified AGI reaches the 2025 phase-out ceiling"
      : "Qualified interest paid reduced by the 2025 modified-AGI phase-out worksheet",
    {
      "Qualified student loan interest paid": studentLoanRaw,
      "Capped student loan interest before phase-out": studentLoanCappedInterest,
      "Supported modified AGI before student loan deduction": supportedStudentLoanModifiedAgi,
      "2025 phase-out threshold": studentLoanPhaseOutStart,
      "2025 phase-out ceiling": studentLoanPhaseOutEnd,
      "Phase-out ratio": studentLoanPhaseOutRatio,
      "Worksheet deduction before whole-dollar rounding": studentLoanWorksheetDeductionBeforeRounding,
    }
  );

  // Form 2555 housing deduction (self-employed only) — Schedule 1 Line 24j
  const form2555HousingDeduction = extra?.form2555HousingDeduction ?? new Decimal(0);
  if (form2555HousingDeduction.greaterThan(0)) {
    audit.record("Sched 1", "24j", "Form 2555 housing deduction",
      form2555HousingDeduction,
      "Self-employed foreign housing deduction from Form2555 PartIX line50");
  }

  const totalAdjustments = sum(
    businessExpenseAdjustments,
    hsaDeduction,
    armedForcesMovingExpenses,
    seDeduction,
    seRetirementContributions,
    seHealthInsurance,
    iraDeduction,
    studentLoanInterest,
    archerMSADeduction,
    educatorExpenses,
    otherAdjustmentsTotal,
    earlyWithdrawalPenalty,
    alimonyPaid,
    form2555HousingDeduction
  );
  audit.record("Sched 1", "26", "Total adjustments", totalAdjustments, "Sum Lines 11-25 → 1040 Line 10");

  return {
    taxableRefunds,
    businessIncome,
    otherGainsOrLosses,
    supplementalIncome,
    farmIncome,
    unemploymentCompensation,
    capitalGainLoss,
    alimonyReceived,
    nolDeduction,
    gamblingIncome,
    cancelledDebtIncome,
    foreignIncomeExclusion,
    hsaTaxableDistributions,
    totalAdditionalIncome,
    businessExpenseAdjustments,
    hsaDeduction,
    armedForcesMovingExpenses,
    seDeduction,
    seRetirementContributions,
    seHealthInsurance,
    earlyWithdrawalPenalty,
    alimonyPaid,
    iraDeduction,
    studentLoanInterest,
    archerMSADeduction,
    otherAdjustmentsTotal,
    educatorExpenses,
    totalAdjustments,
    lines: audit.getLines(),
    form8889,
    form8889ByOwner,
    hsaAdditionalTax,
    hsaRecaptureTax,
  };
}
