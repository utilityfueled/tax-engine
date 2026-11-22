/** Final annual Form 8889 physical source. See spec/federal/form-8889-2026-template.yaml. */
import { createHash } from "node:crypto";
import type { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa.js";
import { calculateForm8889, mergeW2Box12CodeWIntoForm8889Input } from "@/engine/forms/form-8889.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import type { Form8889Input, TaxYearInput } from "@/models/inputs.js";
import { d, max, roundDollar } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly, setCheckBox, setTextField } from "../../pdf-utils.js";

const page = "topmostSubform[0].Page1[0].";
const schedule1Income = "Schedule 1 (Form 1040) line 8f";

export const FORM_8889_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f8889--2026.pdf",
  sourceRevision: "Created 4/30/26",
  retrievedAt: "2026-11-19T05:03:41Z",
  sha256: "e206d84f0ce3b2a4add7a97e5de8f873b11bd0a16e34e7cd98f9c4dcc87a178d",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedLine3FullYearUnder55: Object.freeze({ selfOnly: "4400", family: "8750" }),
  printedReferences: Object.freeze({
    line16: schedule1Income,
    line17b: "Schedule 2 (Form 1040) line 13c",
    line20: schedule1Income,
    line21: "Schedule 2 (Form 1040) line 13d",
  }),
  fields: Object.freeze({
    name: `${page}f1_1[0]`,
    ssn: `${page}f1_2[0]`,
    selfOnly: `${page}c1_1[0]`,
    family: `${page}c1_1[1]`,
    line2: `${page}f1_3[0]`,
    line3: `${page}f1_4[0]`,
    line4: `${page}f1_5[0]`,
    line5: `${page}f1_6[0]`,
    line6: `${page}f1_7[0]`,
    line7: `${page}f1_8[0]`,
    line8: `${page}f1_9[0]`,
    line9: `${page}f1_10[0]`,
    line10: `${page}f1_11[0]`,
    line11: `${page}f1_12[0]`,
    line12: `${page}f1_13[0]`,
    line13: `${page}f1_14[0]`,
    line14a: `${page}f1_15[0]`,
    line14b: `${page}f1_16[0]`,
    line14c: `${page}f1_17[0]`,
    line15: `${page}f1_18[0]`,
    line16: `${page}f1_19[0]`,
    line17a: `${page}c1_2[0]`,
    line17b: `${page}f1_20[0]`,
    line18: `${page}f1_21[0]`,
    line19: `${page}f1_22[0]`,
    line20: `${page}f1_23[0]`,
    line21: `${page}f1_24[0]`,
  }),
});

interface OrdinaryHsaSourceConfirmation {
  taxYear: number;
  accountOwner: Form8889Input["accountOwner"];
  /** Checked the owner's actual eligibility and same coverage on each month's first day. */
  fullYearEligibilityConfirmed: boolean;
  coverage: Exclude<Form8889Input["coverageByMonth"][number], "none">;
  /** Checked the complete originals, contribution timing, and absence of special activity. */
  ordinaryActivityConfirmed: boolean;
  personalContributions: string;
  employerContributions: string;
  grossDistributions: string;
  qualifiedMedicalExpenses: string;
}

const dollarsAndCents = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const ordinaryAmounts = ["line2", "line3", "line4", "line5", "line6", "line8", "line9", "line10",
  "line11", "line12", "line13", "line14a", "line14b", "line14c", "line15", "line16", "line17b"] as const;
const ordinaryExcludedAmounts = [
  "archerMSAContributions", "qualifiedFundingDistribution", "excludedDistributions", "rolloverDistributions",
  "prohibitedTransactionDistributions", "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath",
  "distributionsNotSubjectToAdditionalTax", "distributionsAfterAge65", "disabilityExceptionTaxableDistributions",
  "lastMonthRuleContributions", "recaptureQualifiedFundingDistribution", "supported1099SAReturnedExcessContributions",
  "supported1099SAReturnedExcessContributionEarnings", "supported1099SADeathDistributionDateOfDeathValue",
  "supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue", "supported1099SAEstateDeathDistributionDateOfDeathValue",
  "supported1099SADisabilityExceptionDistributions", "supported1099SAAutomaticExceptionDistributions",
  "supported1099SAProhibitedTransactionDistributions",
] as const satisfies readonly (keyof Form8889Input)[];

function hasSpecialHsaActivity(input: TaxYearInput, worksheet: Form8889Input): boolean {
  const { form5329: legacyExcess, form5329HsaByOwner } = input;
  const { accountOwner } = worksheet;
  const otherOwner = accountOwner === "primary" ? "spouse" : "primary";
  const excess = form5329HsaByOwner?.[accountOwner];
  const excessAmounts = [
    excess?.priorYearExcessContributions, excess?.priorYearAdditionalTax, excess?.excessEmployerContributionsAlreadyInWages,
    excess?.returnedExcessContributionsUnder9100Relief, excess?.returnedExcessContributionEarningsUnder9100Relief,
    legacyExcess?.hsaPriorYearExcessContributions, legacyExcess?.hsaCurrentYearExcessContributions,
    legacyExcess?.supportedHsaReturnedExcessContributionsByDueDate, legacyExcess?.supportedHsaReturnedExcessContributionsUnder9100Relief,
    legacyExcess?.supportedHsaReturnedExcessContributionEarningsUnder9100Relief,
  ];
  const unknownExcessHistory = excess !== undefined && (excess.sourceFactsConfirmed !== true
    || excess.sourceTaxYear !== 2026 || excess.priorYearSourceTaxYear !== 2025
    || excess.priorYearExcessContributions === undefined || excess.priorYearAdditionalTax === undefined);
  return worksheet.spouseFamilyCoverageMonths.length > 0 || worksheet.bothSpousesHaveHsas || worksheet.spouseAllocatedLimit !== undefined
    || worksheet.useLastMonthRule === true || worksheet.qualifiedFundingDistributionSource !== undefined
    || worksheet.lastMonthRuleRedeterminedLimit !== undefined || worksheet.priorYearRedeterminedLimitWorksheet !== undefined
    || worksheet.testingPeriodFailureDueToDeathOrDisability || ordinaryExcludedAmounts.some(key => !d(worksheet[key]).isZero())
    || form5329HsaByOwner?.[otherOwner] !== undefined || unknownExcessHistory || excessAmounts.some(value => !d(value).isZero());
}

/** Render one redacted internal candidate and leave it outside all export registries. */
export async function fillForm88892026OrdinaryCandidate(
  input: TaxYearInput,
  source: OrdinaryHsaSourceConfirmation,
  blank: Uint8Array,
): Promise<PDFDocument> {
  const candidate = FORM_8889_2026_CANDIDATE;
  if (input.taxpayer.taxYear !== candidate.taxYear || source.taxYear !== candidate.taxYear) {
    throw new Error("Form 8889 candidate requires a 2026 return and confirmed 2026 sources");
  }
  if (source.fullYearEligibilityConfirmed !== true || source.ordinaryActivityConfirmed !== true) {
    throw new Error("Full-year eligibility and ordinary HSA activity must be confirmed");
  }
  const { accountOwner: owner } = source;
  const otherOwner = owner === "primary" ? "spouse" : "primary";
  const worksheet = input.form8889 ?? input.form8889ByOwner?.[owner];
  if (!worksheet || worksheet.accountOwner !== owner || input.form8889ByOwner?.[otherOwner]
    || (input.form8889 && input.form8889ByOwner)
    || (owner === "spouse" && (input.taxpayer.filingStatus !== "married_filing_jointly" || !input.taxpayer.spouse))) {
    throw new Error("Form 8889 candidate requires one confirmed owner and that owner's HSA worksheet");
  }
  const birthDate = input.taxpayer[owner]?.dateOfBirth;
  if (!birthDate || !z.iso.date().safeParse(birthDate).success || birthDate <= "1971-12-31") {
    throw new Error("Form 8889 candidate requires a confirmed birth date and an owner under 55 at year-end");
  }
  if (birthDate > "2026-01-01") {
    throw new Error("Form 8889 candidate requires an owner eligible on January 1, 2026");
  }
  const coverage = worksheet.coverageByMonth[0];
  if ((coverage !== "self_only" && coverage !== "family") || worksheet.coverageByMonth.length !== 12
    || source.coverage !== coverage || worksheet.coverageByMonth.some(month => month !== coverage)) {
    throw new Error("Form 8889 candidate requires twelve months of identical eligible self-only or family coverage");
  }
  const { standardDeductionFacts } = input;
  const dependent = owner === "primary" ? standardDeductionFacts?.primaryCanBeClaimedAsDependent : standardDeductionFacts?.spouseCanBeClaimedAsDependent;
  const deathDate = owner === "primary" ? standardDeductionFacts?.primaryDeathDate : standardDeductionFacts?.spouseDeathDate;
  if (worksheet.medicareMonths.length || worksheet.isDependent || dependent || deathDate) {
    throw new Error("Form 8889 candidate requires an owner eligible throughout 2026");
  }

  if (hasSpecialHsaActivity(input, worksheet)) {
    throw new Error("Form 8889 candidate requires ordinary HSA activity without special amounts or carryovers");
  }

  const { personalContributions, employerContributions, grossDistributions, qualifiedMedicalExpenses } = source;
  if (![personalContributions, employerContributions, grossDistributions, qualifiedMedicalExpenses,
    worksheet.contributionsMade, worksheet.qualifiedMedicalExpenses].every(value => dollarsAndCents.safeParse(value).success)) {
    throw new Error("Form 8889 candidate requires each actual contribution and distribution amount");
  }
  if (!d(personalContributions).eq(worksheet.contributionsMade) || !d(qualifiedMedicalExpenses).eq(worksheet.qualifiedMedicalExpenses)) {
    throw new Error("Actual personal contributions and qualified HSA payments must reconcile to the worksheet");
  }

  const statements = input.form1099SA ?? [];
  if (!statements.length || statements.some(statement => statement.taxYear !== 2026 || statement.accountHolder !== owner
    || statement.accountType !== "hsa" || statement.distributionCode !== "1" || !statement.payer.trim()
    || !dollarsAndCents.safeParse(statement.grossDistribution).success || !d(statement.grossDistribution).gt(0)
    || !d(statement.earningsOnExcessContributions).isZero() || statement.fmvOnDateOfDeath !== undefined
    || statement.trusteeToTrusteeTransfer || statement.beneficiaryRole || statement.deathDistributionTiming)) {
    throw new Error("Form 8889 candidate requires dated and attributed ordinary Form 1099-SA originals");
  }
  const support = calculateForm1099SA(statements, candidate.taxYear);
  const worksheetSupport = d(worksheet.supported1099SAGrossDistributions);
  if (!support.accountOwnerSupport[owner].hsaGrossDistributions.eq(grossDistributions)
    || (worksheet.distributionsReceived !== undefined && !d(worksheet.distributionsReceived).eq(grossDistributions))
    || (!worksheetSupport.isZero() && !worksheetSupport.eq(grossDistributions))) {
    throw new Error("Form 8889 candidate distributions must reconcile to Form 1099-SA Box 1");
  }
  if (d(qualifiedMedicalExpenses).gt(grossDistributions)) {
    throw new Error("Actual qualified HSA payments cannot exceed the ordinary distributions");
  }

  const w2s = input.w2s;
  if (w2s.some(w2 => !d(w2.box12CodeW).isZero() && (w2.taxYear !== 2026 || w2.accountHolder !== owner
    || !dollarsAndCents.safeParse(w2.box12CodeW).success))) {
    throw new Error("Form 8889 candidate requires actual current owner-attributed W-2 code W contributions");
  }
  const bound = mergeW2Box12CodeWIntoForm8889Input(
    mergeForm1099SAIntoForm8889Input(worksheet, support, input.taxpayer), w2s, input.taxpayer.filingStatus,
  );
  if (!bound || !d(bound.supportedW2EmployerContributions).eq(employerContributions)
    || (worksheet.employerContributions !== undefined && !d(worksheet.employerContributions).eq(employerContributions))
    || (!d(worksheet.supportedW2EmployerContributions).isZero() && !d(worksheet.supportedW2EmployerContributions).eq(employerContributions))) {
    throw new Error("Form 8889 candidate employer contributions must reconcile to current W-2 code W");
  }

  const result = calculateForm8889(input.taxpayer, bound, FEDERAL_2026_CONSTANTS);
  const printedLimit = coverage === "self_only" ? candidate.printedLine3FullYearUnder55.selfOnly : candidate.printedLine3FullYearUnder55.family;
  if (!result.line3.eq(printedLimit) || d(personalContributions).plus(employerContributions).gt(printedLimit)) {
    throw new Error("Form 8889 candidate requires contributions within the printed annual limit");
  }

  const bytes = Uint8Array.from(blank);
  if (createHash("sha256").update(bytes).digest("hex") !== candidate.sha256) {
    throw new Error("Unreviewed Form 8889 candidate template revision");
  }
  const displayedNet = roundDollar(result.line14c).minus(roundDollar(result.line15));
  if (!roundDollar(result.line16).eq(max(d(0), displayedNet))) {
    throw new Error("Form 8889 candidate cannot reconcile displayed lines 14c, 15, and 16");
  }
  const doc = await loadPdfDocumentQuietly(bytes);
  const form = doc.getForm();
  const { fields } = candidate;
  setCheckBox(form, fields.selfOnly, coverage === "self_only");
  setCheckBox(form, fields.family, coverage === "family");
  setCheckBox(form, fields.line17a, result.line17aHasException);
  for (const line of ordinaryAmounts) setTextField(form, fields[line], roundDollar(result[line]).toFixed(0));
  await markReviewPdf(doc);
  return doc;
}
