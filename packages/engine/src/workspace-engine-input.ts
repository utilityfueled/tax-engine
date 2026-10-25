import Decimal from "decimal.js";
import { officialSampleDocumentFixtures } from "@tax-engine/contracts";
import type {
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary,
  WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";
import {
  type TaxYearInput,
  TaxYearInputSchema,
  W2Schema,
  Form1099IntSchema,
  Form1099OIDSchema,
  Form1099BSchema,
  Form1099GSchema,
  Form1099DivSchema,
  Form1099RSchema,
  Form1099SASchema,
  FormSSA1099Schema,
  Form1098ESchema,
  Form1095ASchema,
} from "../../../src/models/inputs";
import {
  extract1095ASummariesFromStructuredFacts,
  extract1098ESummariesFromStructuredFacts,
  extract1099BTransactionsFromStructuredFacts,
  extract1099DivSummariesFromStructuredFacts,
  extract1099GSummariesFromStructuredFacts,
  extract1099IntSummariesFromStructuredFacts,
  extract1099OIDSummariesFromStructuredFacts,
  extract1099RSummariesFromStructuredFacts,
  extract1099SASummariesFromStructuredFacts,
  extractSSA1099SummariesFromStructuredFacts,
  extractW2SummariesFromStructuredFacts
} from "./workspace-fixture-facts";

interface WorkspaceEngineInputFixture {
  taxInput: TaxYearInput;
  assumptions: string[];
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  sourceFactIdsByItemId: Record<string, string[]>;
}

interface PreviewContribution {
  kind:
    | "wages"
    | "capital-gains"
    | "investment-income"
    | "hsa"
    | "adjustments"
    | "government-payments"
    | "premium-tax-credit";
  itemId: WorkspaceReturnSummary["items"][number]["id"];
  assumptions: string[];
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  sourceFactIds: string[];
  apply(taxInput: TaxYearInput): void;
}

interface WagesPreviewSources {
  entries: TaxYearInput["w2s"];
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface CapitalGainsPreviewSources {
  sourceDocumentIds: string[];
  transactions: TaxYearInput["form1099B"][number]["transactions"];
  sourceFixtureIds: string[];
}

interface InterestPreviewSources {
  form1099IntEntries: TaxYearInput["form1099Int"];
  form1099OIDEntries: NonNullable<TaxYearInput["form1099OID"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface GovernmentPaymentsPreviewSources {
  entries: NonNullable<TaxYearInput["form1099G"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface DividendPreviewSources {
  entries: TaxYearInput["form1099Div"];
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface StudentLoanInterestPreviewSources {
  entries: NonNullable<TaxYearInput["form1098E"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface PremiumTaxCreditPreviewSources {
  entries: NonNullable<TaxYearInput["form1095A"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

interface RetirementPreviewSources {
  entries: NonNullable<TaxYearInput["form1099R"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  excludedEntryCount: number;
}

type HsaOwnerOffsets = Pick<Partial<NonNullable<TaxYearInput["form8889"]>>, "rolloverDistributions" | "qualifiedMedicalExpenses" | "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath">;

interface HsaPreviewSources {
  offsetsByOwner: Partial<Record<"primary" | "spouse", HsaOwnerOffsets>>;
  entries: NonNullable<TaxYearInput["form1099SA"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  hasConfirmedRolloverDistributions: boolean;
  confirmedRolloverDistributions: string;
  hasConfirmedQualifiedMedicalExpenses: boolean;
  confirmedQualifiedMedicalExpenses: string;
  hasConfirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: boolean;
  confirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: string;
}

interface SocialSecurityPreviewSources {
  entries: NonNullable<TaxYearInput["formSSA1099"]>;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
}

function createWorkspacePreviewTaxInput(taxYear: number, taxpayer?: TaxYearInput["taxpayer"]): TaxYearInput | null {
  if (!taxpayer || taxpayer.taxYear !== taxYear || !Array.isArray(taxpayer.dependents)) return null;
  const people = [taxpayer.primary, ...taxpayer.dependents];
  if (["married_filing_jointly", "married_filing_separately"].includes(taxpayer.filingStatus)) {
    if (!taxpayer.spouse) return null;
    people.push(taxpayer.spouse);
  }
  for (const person of people) {
    if (!person?.firstName?.trim() || !person.lastName?.trim()
      || !/^\d{3}-?\d{2}-?\d{4}$/.test(person.ssn) || person.ssn.replace(/-/g, "") === "000000000"
      || !/^\d{4}-\d{2}-\d{2}$/.test(person.dateOfBirth)) return null;
    const birthDate = new Date(`${person.dateOfBirth}T00:00:00Z`);
    if (!Number.isFinite(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== person.dateOfBirth
      || person.dateOfBirth > `${taxYear}-12-31` || person.dateOfBirth < "1850-01-01") return null;
  }
  const personIds = people.map((person) => person.ssn.replace(/-/g, ""));
  if (new Set(personIds).size !== personIds.length) return null;
  if (!taxpayer.address || [taxpayer.address.street, taxpayer.address.city, taxpayer.address.state, taxpayer.address.zip].some((value) => !value?.trim())) return null;
  if (taxpayer.dependents.some((person) => [person.qualifiesForCTC, person.qualifiesForODC, person.qualifiesForEIC].some((value) => typeof value !== "boolean"))) return null;
  const parsed = TaxYearInputSchema.safeParse({ taxpayer });
  return parsed.success ? parsed.data : null;
}

function getReadySourceDocuments(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>
) {
  const sourceDocuments = item.sourceDocumentIds
    .map((documentId) => documentsById.get(documentId))
    .filter((document): document is WorkspaceDocumentRecord => document !== undefined);

  if (
    sourceDocuments.length === 0
    || sourceDocuments.length !== item.sourceDocumentIds.length
    || sourceDocuments.some((document) => document.coverage !== "supported")
  ) {
    return null;
  }

  return sourceDocuments;
}

function getSourceFixtureIds(sourceDocuments: WorkspaceDocumentRecord[]) {
  return Array.from(new Set(
    sourceDocuments
      .map((document) => document.matchedFixtureId)
      .filter((fixtureId): fixtureId is string => typeof fixtureId === "string" && fixtureId.length > 0)
  ));
}

function formatCurrencyAmount(value: string) {
  const [integerPart, fractionalPart] = new Decimal(value).toFixed().split(".");
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return fractionalPart && fractionalPart.replace(/0+$/, "").length > 0
    ? `${formattedInteger}.${fractionalPart}`
    : formattedInteger;
}

function sumMonetaryValues(values: string[]) {
  return values.reduce((sum, value) => sum.plus(new Decimal(value)), new Decimal(0));
}

function isNonSpouseHsaDeathDistribution(
  entry: NonNullable<TaxYearInput["form1099SA"]>[number]
) {
  return (entry.distributionCode === "4" || entry.distributionCode === "6")
    && entry.beneficiaryRole !== "surviving_spouse";
}

function collectContributionSourceFactIds(
  item: WorkspaceReturnSummary["items"][number],
  structuredFacts: WorkspaceStructuredFactRecord[]
) {
  const relatedFactIds = new Set(item.relatedFactIds);
  const sourceDocumentIds = new Set(item.sourceDocumentIds);

  return structuredFacts
    .filter((fact) =>
      relatedFactIds.has(fact.factId)
      && fact.sourceDocumentIds.some((documentId) => sourceDocumentIds.has(documentId))
    )
    .map((fact) => fact.id);
}

function collectCapitalGainsPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): CapitalGainsPreviewSources | null {
  if (item.id !== "capital-gains") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const transactionsByDocument = sourceDocuments.map((document) =>
    extract1099BTransactionsFromStructuredFacts(structuredFacts, document.id).map((transaction) =>
      Form1099BSchema.shape.transactions.element.parse({
        description: transaction.description,
        dateAcquired: transaction.dateAcquired,
        dateSold: transaction.dateSold,
        proceeds: transaction.proceeds,
        costBasis: transaction.costBasis,
        adjustments: transaction.adjustments,
        basisReportedToIRS: transaction.basisReportedToIRS,
        holdingPeriod: transaction.holdingPeriod,
        digitalAsset: transaction.digitalAsset,
        washSale: transaction.washSale,
        washSaleDisallowed: transaction.washSaleDisallowed,
      })
    )
  );
  const transactions = transactionsByDocument.flat();

  if (transactions.length === 0 || transactionsByDocument.some((entries) => entries.length === 0)) {
    return null;
  }

  return {
    transactions,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectWagesPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): WagesPreviewSources | null {
  if (item.id !== "wages-and-withholding") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const summariesByDocument = sourceDocuments.map((document) => extractW2SummariesFromStructuredFacts(structuredFacts, document.id));
  if (summariesByDocument.some((entries) => entries.some((summary) => summary.socialSecurityWages === undefined || summary.medicareWages === undefined))) return null;
  const entriesByDocument = summariesByDocument.map((summaries) =>
    summaries.map((summary) =>
      W2Schema.parse({
        employer: {
          name: summary.employerName,
          ein: summary.employerEin
        },
        wages: summary.wages,
        federalWithheld: summary.federalWithheld,
        socialSecurityWages: summary.socialSecurityWages,
        ...(summary.socialSecurityTips !== undefined ? { socialSecurityTips: summary.socialSecurityTips } : {}),
        ...(summary.socialSecurityWithheld !== undefined
          ? { socialSecurityWithheld: summary.socialSecurityWithheld }
          : {}),
        medicareWages: summary.medicareWages,
        ...(summary.medicareWithheld !== undefined
          ? { medicareWithheld: summary.medicareWithheld }
          : {}),
        ...(summary.stateWages !== undefined ? { stateWages: summary.stateWages } : {}),
        ...(summary.state !== undefined ? { state: summary.state.trim().toUpperCase() } : {}),
        ...(summary.stateWithheld !== undefined
          ? { stateTaxWithheld: summary.stateWithheld }
          : {}),
        ...(summary.box10DependentCareBenefits !== undefined ? { box10DependentCareBenefits: summary.box10DependentCareBenefits } : {}),
        ...(summary.box12CodeW !== undefined ? { box12CodeW: summary.box12CodeW } : {}),
        ...(summary.accountHolder !== undefined ? { accountHolder: summary.accountHolder } : {}),
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectInterestPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): InterestPreviewSources | null {
  if (item.id !== "interest-income") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const form1099IntEntriesByDocument = sourceDocuments.map((document) =>
    extract1099IntSummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1099IntSchema.parse({
        payer: summary.payer,
        interestIncome: summary.interestIncome,
        earlyWithdrawalPenalty: summary.earlyWithdrawalPenalty,
        usSavingsBondInterest: summary.usSavingsBondInterest,
        federalWithheld: summary.federalWithheld,
        taxExemptInterest: summary.taxExemptInterest
      })
    )
  );
  const form1099OIDEntriesByDocument = sourceDocuments.map((document) =>
    extract1099OIDSummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1099OIDSchema.parse({
        payer: summary.payer,
        originalIssueDiscount: summary.originalIssueDiscount,
        otherPeriodicInterest: summary.otherPeriodicInterest,
        earlyWithdrawalPenalty: summary.earlyWithdrawalPenalty,
        federalWithheld: summary.federalWithheld,
        acquisitionPremium: summary.acquisitionPremium,
        treasuryOID: summary.treasuryOID,
        bondPremium: summary.bondPremium,
        taxExemptBondPremium: summary.taxExemptBondPremium,
        taxExemptOID: summary.taxExemptOID
      })
    )
  );
  const form1099IntEntries = form1099IntEntriesByDocument.flat();
  const form1099OIDEntries = form1099OIDEntriesByDocument.flat();
  const entriesByDocument = sourceDocuments.map((_, index) => ({
    form1099IntCount: form1099IntEntriesByDocument[index]?.length ?? 0,
    form1099OIDCount: form1099OIDEntriesByDocument[index]?.length ?? 0,
  }));

  if (
    (form1099IntEntries.length === 0 && form1099OIDEntries.length === 0)
    || entriesByDocument.some((documentEntries) => (
      documentEntries.form1099IntCount === 0 && documentEntries.form1099OIDCount === 0
    ))
  ) {
    return null;
  }

  return {
    form1099IntEntries,
    form1099OIDEntries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectGovernmentPaymentsPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): GovernmentPaymentsPreviewSources | null {
  if (item.id !== "government-payments") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const entriesByDocument = sourceDocuments.map((document) =>
    extract1099GSummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1099GSchema.parse({
        payer: summary.payer,
        unemploymentCompensation: summary.unemploymentCompensation,
        ...(summary.stateLocalIncomeTaxRefund !== undefined
          ? { stateLocalIncomeTaxRefund: summary.stateLocalIncomeTaxRefund }
          : {}),
        ...(summary.federalWithheld !== undefined
          ? { federalWithheld: summary.federalWithheld }
          : {}),
        ...(summary.stateWithheld !== undefined
          ? { stateWithheld: summary.stateWithheld }
          : {}),
        ...(summary.state !== undefined
          ? { state: summary.state }
          : {}),
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectDividendPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): DividendPreviewSources | null {
  if (item.id !== "dividend-income") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const entriesByDocument = sourceDocuments.map((document) =>
    extract1099DivSummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1099DivSchema.parse({
        payer: summary.payer,
        ordinaryDividends: summary.ordinaryDividends,
        qualifiedDividends: summary.qualifiedDividends,
        totalCapitalGainDistributions: summary.capitalGainDistributions,
        federalWithheld: summary.federalWithheld,
        section199ADividends: summary.section199ADividends,
        foreignTaxPaid: summary.foreignTaxPaid,
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectStudentLoanInterestPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): StudentLoanInterestPreviewSources | null {
  if (item.id !== "student-loan-interest") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const entriesByDocument = sourceDocuments.map((document) =>
    extract1098ESummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1098ESchema.parse({
        lender: summary.lender,
        studentLoanInterestReceived: summary.studentLoanInterestReceived,
        includesOriginationFeesOrCapitalizedInterest:
          summary.includesOriginationFeesOrCapitalizedInterest ?? false,
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectPremiumTaxCreditPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PremiumTaxCreditPreviewSources | null {
  if (item.id !== "premium-tax-credit") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const entriesByDocument = sourceDocuments.map((document) =>
    extract1095ASummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      Form1095ASchema.parse({
        marketplace: summary.marketplace,
        policyNumber: summary.policyNumber,
        monthlyPremiums: summary.monthlyPremiums
          .map((month) => ({
            month: month.month,
            enrolleePremium: month.enrolleePremium,
            slcsp: month.slcsp,
            advancePremiumTaxCredit: month.advancePremiumTaxCredit,
          }))
          .sort((left, right) => left.month - right.month),
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function collectRetirementPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): RetirementPreviewSources | null {
  if (item.id !== "retirement-distributions") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const summariesByDocument = sourceDocuments.map((document) =>
    extract1099RSummariesFromStructuredFacts(structuredFacts, document.id)
  );

  if (summariesByDocument.some((documentSummaries) => documentSummaries.length === 0)) {
    return null;
  }

  const includedSummariesByDocument = summariesByDocument.map((documentSummaries) =>
    documentSummaries.filter((summary) => summary.belongsOnCurrentYearReturn !== false)
  );
  const entriesByDocument = includedSummariesByDocument.map((documentSummaries) =>
    documentSummaries.map((summary) =>
      Form1099RSchema.parse({
        payer: summary.payer,
        grossDistribution: summary.grossDistribution,
        federalWithheld: summary.federalWithheld,
        distributionCode: summary.distributionCode,
        iraSepSimple: summary.iraSepSimple,
        ...(summary.taxableAmount !== undefined ? { taxableAmount: summary.taxableAmount } : {}),
        taxableAmountNotDetermined: summary.taxableAmountNotDetermined ?? false,
        ...(summary.employeeContributions !== undefined
          ? { employeeContributions: summary.employeeContributions }
          : {}),
        ...(summary.simplifiedMethodCostInPlan !== undefined
          ? { simplifiedMethodCostInPlan: summary.simplifiedMethodCostInPlan }
          : {}),
        ...(summary.simplifiedMethodExpectedPayments !== undefined
          ? { simplifiedMethodExpectedPayments: summary.simplifiedMethodExpectedPayments }
          : {}),
        ...(summary.simplifiedMethodAnnuityStartingDate !== undefined
          ? { simplifiedMethodAnnuityStartingDate: summary.simplifiedMethodAnnuityStartingDate }
          : {}),
        ...(summary.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate !== undefined
          ? { simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: summary.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate }
          : {}),
        ...(summary.simplifiedMethodSecondaryAnnuitantAgeAtStartingDate !== undefined
          ? { simplifiedMethodSecondaryAnnuitantAgeAtStartingDate: summary.simplifiedMethodSecondaryAnnuitantAgeAtStartingDate }
          : {}),
        ...(summary.simplifiedMethodPaymentsReceivedThisYear !== undefined
          ? { simplifiedMethodPaymentsReceivedThisYear: summary.simplifiedMethodPaymentsReceivedThisYear }
          : {}),
        ...(summary.simplifiedMethodPriorYearRecovered !== undefined
          ? { simplifiedMethodPriorYearRecovered: summary.simplifiedMethodPriorYearRecovered }
          : {}),
        ...(summary.retiredPublicSafetyOfficerInsurancePremiums !== undefined
          ? { retiredPublicSafetyOfficerInsurancePremiums: summary.retiredPublicSafetyOfficerInsurancePremiums }
          : {}),
        ...(summary.accountHolder ? { accountHolder: summary.accountHolder } : {}),
        ...(summary.eligibleGovernmental457bPlan !== undefined
          ? { eligibleGovernmental457bPlan: summary.eligibleGovernmental457bPlan }
          : {}),
        ...(summary.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount !== undefined
          ? {
            eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount:
              summary.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount
          }
          : {}),
        ...(summary.distributionDate !== undefined
          ? { distributionDate: summary.distributionDate }
          : {}),
        ...(summary.separationFromServiceAfterAge55ExceptionApplies
          ? { separationFromServiceAfterAge55ExceptionApplies: true }
          : {}),
        ...(summary.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
          ? { qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true }
          : {}),
        ...(summary.qualifiedDomesticRelationsOrderExceptionApplies
          ? { qualifiedDomesticRelationsOrderExceptionApplies: true }
          : {}),
        ...(summary.terminalIllnessExceptionApplies
          ? { terminalIllnessExceptionApplies: true }
          : {}),
        ...(summary.rothConversionAmount !== undefined
          ? { rothConversionAmount: summary.rothConversionAmount }
          : {}),
        ...(summary.rothIraRolledOverAmount !== undefined
          ? { rothIraRolledOverAmount: summary.rothIraRolledOverAmount }
          : {}),
        ...(summary.returnedContributionByDueDate ? { returnedContributionByDueDate: true } : {}),
        ...(summary.excessContributionReturnedWithoutEarnings
          ? { excessContributionReturnedWithoutEarnings: true }
          : {}),
        ...(summary.qualifiedCharitableDistribution
          ? { qualifiedCharitableDistribution: summary.qualifiedCharitableDistribution }
          : {}),
        ...(summary.qualifiedRothDistribution ? { qualifiedRothDistribution: true } : {}),
        ...(summary.rothContributionOrConversionMadeBefore2021
          ? { rothContributionOrConversionMadeBefore2021: true }
          : {}),
      })
    )
  );
  const entries = entriesByDocument.flat();

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments),
    excludedEntryCount: summariesByDocument.flat().length - entries.length,
  };
}

function collectHsaPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): HsaPreviewSources | null {
  if (item.id !== "hsa-distributions") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const summariesByDocument = sourceDocuments.map((document) =>
    extract1099SASummariesFromStructuredFacts(structuredFacts, document.id)
  );
  const entriesByDocument = summariesByDocument.map((summaries) =>
    summaries.map((summary) =>
      Form1099SASchema.safeParse({
        payer: summary.payer,
        grossDistribution: summary.grossDistribution,
        distributionCode: summary.distributionCode,
        accountType: summary.accountType,
        ...(summary.earningsOnExcessContributions
          ? { earningsOnExcessContributions: summary.earningsOnExcessContributions }
          : {}),
        ...(summary.fmvOnDateOfDeath ? { fmvOnDateOfDeath: summary.fmvOnDateOfDeath } : {}),
        ...(summary.beneficiaryRole ? { beneficiaryRole: summary.beneficiaryRole } : {}),
        ...(summary.deathDistributionTiming ? { deathDistributionTiming: summary.deathDistributionTiming } : {}),
        ...(summary.accountHolder ? { accountHolder: summary.accountHolder } : {}),
      })
    )
  );
  if (entriesByDocument.some(records => records.length === 0 || records.some(record => !record.success))) return null;
  const entries = entriesByDocument.flat().flatMap(record => record.success ? [record.data] : []);

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  const summaries = summariesByDocument.flat();
  const offsetsByOwner: HsaPreviewSources["offsetsByOwner"] = {};
  const offsetFields = ["rolloverDistributions", "qualifiedMedicalExpenses", "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath"] as const;
  for (const owner of ["primary", "spouse"] as const) {
    const owned = summaries.filter(summary => summary.accountHolder === owner);
    if (!owned.length) continue;
    const offsets: HsaOwnerOffsets = {};
    for (const field of offsetFields) {
      if (owned.every(summary => summary[field] !== undefined)) {
        offsets[field] = sumMonetaryValues(owned.map(summary => summary[field] as string)).toFixed();
      }
    }
    if (Object.keys(offsets).length) offsetsByOwner[owner] = offsets;
  }
  const confirmedRolloverSummaries = summaries.every(summary => summary.rolloverDistributions !== undefined) ? summaries : [];
  const confirmedQualifiedMedicalExpenseSummaries = summaries.every(summary => summary.qualifiedMedicalExpenses !== undefined) ? summaries : [];
  const confirmedDecedentQualifiedMedicalExpenseSummaries = summaries.every(summary => summary.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath !== undefined) ? summaries : [];

  return {
    offsetsByOwner,
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments),
    hasConfirmedRolloverDistributions: confirmedRolloverSummaries.length > 0,
    confirmedRolloverDistributions: sumMonetaryValues(
      confirmedRolloverSummaries.map((summary) => summary.rolloverDistributions ?? "0")
    ).toFixed(),
    hasConfirmedQualifiedMedicalExpenses: confirmedQualifiedMedicalExpenseSummaries.length > 0,
    confirmedQualifiedMedicalExpenses: sumMonetaryValues(
      confirmedQualifiedMedicalExpenseSummaries.map((summary) => summary.qualifiedMedicalExpenses ?? "0")
    ).toFixed(),
    hasConfirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath:
      confirmedDecedentQualifiedMedicalExpenseSummaries.length > 0,
    confirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: sumMonetaryValues(
      confirmedDecedentQualifiedMedicalExpenseSummaries.map((summary) =>
        summary.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath ?? "0"
      )
    ).toFixed(),
  };
}

function collectSocialSecurityPreviewSources(
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): SocialSecurityPreviewSources | null {
  if (item.id !== "social-security-benefits") {
    return null;
  }

  const sourceDocuments = getReadySourceDocuments(item, documentsById);

  if (!sourceDocuments) {
    return null;
  }

  const entriesByDocument = sourceDocuments.map((document) =>
    extractSSA1099SummariesFromStructuredFacts(structuredFacts, document.id).map((summary) =>
      FormSSA1099Schema.parse({
        recipient: summary.recipient,
        netBenefits: summary.netBenefits,
        federalWithheld: summary.federalWithheld,
      })
    )
  );
  const entries = entriesByDocument.flat();

  if (entries.length === 0 || entriesByDocument.some((documentEntries) => documentEntries.length === 0)) {
    return null;
  }

  return {
    entries,
    sourceDocumentIds: item.sourceDocumentIds,
    sourceFixtureIds: getSourceFixtureIds(sourceDocuments)
  };
}

function buildCapitalGainsContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectCapitalGainsPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";

  return {
    kind: "capital-gains",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1099-B ${uploadLabel} ${contributionVerb} ${previewSources.transactions.length} capital-gains transaction fact(s) with no withholding or carryforwards.`
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099B = [Form1099BSchema.parse({
        broker: "Official fixture-derived broker statement",
        transactions: previewSources.transactions
      })];
    }
  };
}

function buildWagesContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectWagesPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalWages = previewSources.entries
    .map((entry) => entry.wages);
  const totalWithholding = previewSources.entries
    .map((entry) => entry.federalWithheld);
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";

  return {
    kind: "wages",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form W-2 ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(sumMonetaryValues(totalWages).toFixed())} of wages and $${formatCurrencyAmount(sumMonetaryValues(totalWithholding).toFixed())} of federal withholding.`
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.w2s = previewSources.entries;
    }
  };
}

function buildInterestContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectInterestPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalInterest = previewSources.form1099IntEntries
    .map((entry) => entry.interestIncome);
  const totalWithholding = previewSources.form1099IntEntries
    .map((entry) => entry.federalWithheld);
  const totalPenalty = previewSources.form1099IntEntries
    .map((entry) => entry.earlyWithdrawalPenalty);
  const totalNetOid = previewSources.form1099OIDEntries
    .map((entry) => Decimal.max(
      new Decimal(0),
      new Decimal(entry.originalIssueDiscount).minus(new Decimal(entry.acquisitionPremium ?? "0"))
    ).toFixed());
  const totalNetOidCouponInterest = previewSources.form1099OIDEntries
    .map((entry) => Decimal.max(
      new Decimal(0),
      new Decimal(entry.otherPeriodicInterest ?? "0").minus(new Decimal(entry.bondPremium ?? "0"))
    ).toFixed());
  const totalOidWithholding = previewSources.form1099OIDEntries
    .map((entry) => entry.federalWithheld ?? "0");
  const totalOidPenalty = previewSources.form1099OIDEntries
    .map((entry) => entry.earlyWithdrawalPenalty ?? "0");
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const hasForm1099Int = previewSources.form1099IntEntries.length > 0;
  const hasForm1099OID = previewSources.form1099OIDEntries.length > 0;
  const formLabel = hasForm1099Int && hasForm1099OID
    ? "Forms 1099-INT and 1099-OID"
    : hasForm1099OID
      ? "Form 1099-OID"
      : "Form 1099-INT";
  const interestAmount = sumMonetaryValues([
    ...totalInterest,
    ...totalNetOid,
    ...totalNetOidCouponInterest,
  ]).toFixed();
  const withholdingAmount = sumMonetaryValues([
    ...totalWithholding,
    ...totalOidWithholding,
  ]).toFixed();
  const penaltyAmount = sumMonetaryValues([
    ...totalPenalty,
    ...totalOidPenalty,
  ]).toFixed();
  const hasOidPremiumAdjustments = previewSources.form1099OIDEntries.some((entry) =>
    new Decimal(entry.acquisitionPremium ?? "0").greaterThan(0)
    || new Decimal(entry.bondPremium ?? "0").greaterThan(0)
  );

  return {
    kind: "investment-income",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} ${formLabel} ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(interestAmount)} of taxable interest with ${withholdingAmount === "0" ? "no withholding" : `$${formatCurrencyAmount(withholdingAmount)} of withholding`} and ${penaltyAmount === "0" ? "no early-withdrawal penalty" : `$${formatCurrencyAmount(penaltyAmount)} of early-withdrawal penalty`}.`,
      ...(hasOidPremiumAdjustments
        ? [
          "This interest preview nets any confirmed Form 1099-OID acquisition premium and bond premium adjustments before Schedule B is recomputed."
        ]
        : [])
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099Int = previewSources.form1099IntEntries;
      taxInput.form1099OID = previewSources.form1099OIDEntries;
    }
  };
}

function buildGovernmentPaymentsContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectGovernmentPaymentsPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalUnemployment = previewSources.entries
    .map((entry) => entry.unemploymentCompensation);
  const totalRefunds = previewSources.entries
    .map((entry) => entry.stateLocalIncomeTaxRefund ?? "0");
  const totalFederalWithholding = previewSources.entries
    .map((entry) => entry.federalWithheld ?? "0");
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const unemploymentAmount = sumMonetaryValues(totalUnemployment).toFixed();
  const refundAmount = sumMonetaryValues(totalRefunds).toFixed();
  const withholdingAmount = sumMonetaryValues(totalFederalWithholding).toFixed();

  return {
    kind: "government-payments",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1099-G ${uploadLabel} ${contributionVerb} ${unemploymentAmount === "0" ? "no unemployment compensation" : `$${formatCurrencyAmount(unemploymentAmount)} of unemployment compensation`}, ${refundAmount === "0" ? "no state or local income tax refunds" : `$${formatCurrencyAmount(refundAmount)} of state or local income tax refunds`}, and ${withholdingAmount === "0" ? "no federal withholding" : `$${formatCurrencyAmount(withholdingAmount)} of federal withholding`}.`,
      ...(refundAmount === "0"
        ? []
        : [
          "This government-payments preview leaves the prior-year state-refund tax-benefit worksheet manual, so uploaded Form 1099-G Box 2 amounts stay non-taxable until prior-year itemized-deduction context is confirmed."
        ])
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099G = previewSources.entries;
    }
  };
}

function buildDividendContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectDividendPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const ordinaryDividends = previewSources.entries
    .map((entry) => entry.ordinaryDividends);
  const qualifiedDividends = previewSources.entries
    .map((entry) => entry.qualifiedDividends);
  const capitalGainDistributions = previewSources.entries
    .map((entry) => entry.totalCapitalGainDistributions);
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const ordinaryDividendAmount = sumMonetaryValues(ordinaryDividends).toFixed();
  const qualifiedDividendAmount = sumMonetaryValues(qualifiedDividends).toFixed();
  const capitalGainDistributionAmount = sumMonetaryValues(capitalGainDistributions).toFixed();

  return {
    kind: "investment-income",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1099-DIV ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(ordinaryDividendAmount)} of ordinary dividends, including $${formatCurrencyAmount(qualifiedDividendAmount)} of qualified dividends, plus $${formatCurrencyAmount(capitalGainDistributionAmount)} of capital gain distributions.`
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099Div = previewSources.entries;
    }
  };
}

function buildStudentLoanInterestContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectStudentLoanInterestPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalInterest = previewSources.entries.map((entry) => entry.studentLoanInterestReceived);
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const interestAmount = sumMonetaryValues(totalInterest).toFixed();
  const includesCapitalizedInterest = previewSources.entries.some(
    (entry) => entry.includesOriginationFeesOrCapitalizedInterest
  );

  return {
    kind: "adjustments",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1098-E ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(interestAmount)} of student loan interest.`,
      ...(includesCapitalizedInterest
        ? [
          "This student loan preview keeps any uploaded capitalized-interest indicator attached to Form 1098-E before Schedule 1 Line 21 is recomputed."
        ]
        : []),
      "This student loan preview assumes no additional below-threshold interest needs manual entry beyond the uploaded statements."
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1098E = previewSources.entries;
    }
  };
}

function buildPremiumTaxCreditContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectPremiumTaxCreditPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const monthlyPremiums = previewSources.entries.flatMap((entry) => entry.monthlyPremiums);
  const enrollmentPremiumAmount = sumMonetaryValues(
    monthlyPremiums.map((month) => month.enrolleePremium)
  ).toFixed();
  const slcspAmount = sumMonetaryValues(
    monthlyPremiums.map((month) => month.slcsp)
  ).toFixed();
  const advancePremiumTaxCreditAmount = sumMonetaryValues(
    monthlyPremiums.map((month) => month.advancePremiumTaxCredit ?? "0")
  ).toFixed();
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";

  return {
    kind: "premium-tax-credit",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1095-A ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(enrollmentPremiumAmount)} of marketplace enrollment premiums, $${formatCurrencyAmount(slcspAmount)} of SLCSP premiums, and ${advancePremiumTaxCreditAmount === "0" ? "no advance premium tax credit" : `$${formatCurrencyAmount(advancePremiumTaxCreditAmount)} of advance premium tax credit`}.`,
      "This premium tax credit preview still depends on the workspace's confirmed filing status, household income, and dependent roster because Form 8962 reconciles the uploaded policy amounts against household MAGI and tax family size."
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1095A = previewSources.entries;
    }
  };
}

function buildRetirementContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectRetirementPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalGross = previewSources.entries.map((entry) => entry.grossDistribution);
  const totalTaxable = previewSources.entries.map((entry) => entry.taxableAmount ?? "0");
  const totalWithholding = previewSources.entries.map((entry) => entry.federalWithheld ?? "0");
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const grossAmount = sumMonetaryValues(totalGross).toFixed();
  const statementReportedTaxableAmount = sumMonetaryValues(totalTaxable).toFixed();
  const withholdingAmount = sumMonetaryValues(totalWithholding).toFixed();
  const excludedStatementLabel = previewSources.excludedEntryCount === 1 ? "statement" : "statements";
  const hasSupportedRothRetirementMetadata = previewSources.entries.some((entry) =>
    entry.qualifiedRothDistribution || entry.rothContributionOrConversionMadeBefore2021
  );
  const hasSupportedSimplifiedMethodMetadata = previewSources.entries.some((entry) =>
    entry.simplifiedMethodCostInPlan !== undefined
    || entry.simplifiedMethodExpectedPayments !== undefined
    || entry.simplifiedMethodAnnuityStartingDate !== undefined
    || entry.simplifiedMethodPrimaryAnnuitantAgeAtStartingDate !== undefined
    || entry.simplifiedMethodSecondaryAnnuitantAgeAtStartingDate !== undefined
    || entry.simplifiedMethodPaymentsReceivedThisYear !== undefined
    || entry.simplifiedMethodPriorYearRecovered !== undefined
  );
  const hasSupportedPublicSafetyOfficerMetadata = previewSources.entries.some((entry) =>
    new Decimal(entry.retiredPublicSafetyOfficerInsurancePremiums ?? "0").greaterThan(0)
  );
  const hasSupportedForm5329RetirementMetadata = previewSources.entries.some((entry) =>
    entry.eligibleGovernmental457bPlan
    || entry.eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount !== undefined
    || entry.distributionDate !== undefined
    || entry.separationFromServiceAfterAge55ExceptionApplies
    || entry.qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies
    || entry.qualifiedDomesticRelationsOrderExceptionApplies
    || entry.terminalIllnessExceptionApplies
  );
  const hasSupportedForm8606RetirementMetadata = previewSources.entries.some((entry) =>
    entry.rothConversionAmount !== undefined
    || entry.rothIraRolledOverAmount !== undefined
    || entry.returnedContributionByDueDate
    || entry.excessContributionReturnedWithoutEarnings
  );
  const hasSupportedQualifiedCharitableDistributionMetadata = previewSources.entries.some((entry) =>
    new Decimal(entry.qualifiedCharitableDistribution ?? "0").greaterThan(0)
  );
  const taxableAmountUnknownCount = previewSources.entries.filter((entry) =>
    entry.taxableAmountNotDetermined || entry.taxableAmount === undefined
  ).length;
  const statementReportedTaxableAmountSummary = taxableAmountUnknownCount === 0
    ? `$${formatCurrencyAmount(statementReportedTaxableAmount)} of statement-reported taxable amount`
    : taxableAmountUnknownCount === previewSources.entries.length
      ? "statement-reported taxable amount not determined"
      : `$${formatCurrencyAmount(statementReportedTaxableAmount)} of statement-reported taxable amount on the remaining distributions, with ${taxableAmountUnknownCount} ${taxableAmountUnknownCount === 1 ? "statement" : "statements"} marked taxable amount not determined`;

  return {
    kind: "investment-income",
    itemId: item.id,
    assumptions: previewSources.entries.length === 0
      ? [
        `The confirmed ${taxYear} Form 1099-R ${uploadLabel} ${previewSources.sourceDocumentIds.length === 1 ? "was" : "were"} marked as not belonging on the current-year return, so no retirement distributions were included in this preview.`
      ]
      : [
        `The confirmed ${taxYear} Form 1099-R ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(grossAmount)} of gross retirement distributions, ${statementReportedTaxableAmountSummary}, and ${withholdingAmount === "0" ? "no withholding" : `$${formatCurrencyAmount(withholdingAmount)} of withholding`}.`,
        ...(hasSupportedSimplifiedMethodMetadata
          ? [
            "Confirmed Simplified Method pension-basis metadata from the upload is applied before the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(hasSupportedPublicSafetyOfficerMetadata
          ? [
            "Confirmed retired public safety officer insurance-premium metadata from the upload is applied before the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(hasSupportedForm5329RetirementMetadata
          ? [
            "Confirmed retirement distribution-date, early-distribution exception, and eligible governmental 457(b) metadata from the upload is applied before Form 5329 defaults and the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(hasSupportedRothRetirementMetadata
          ? [
            "Confirmed Roth-qualified or pre-2021 Roth contribution history metadata from the upload is applied before the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(hasSupportedForm8606RetirementMetadata
          ? [
            "Confirmed Roth conversion, rollover, and corrective-distribution metadata from the upload is applied before Form 8606 defaults and the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(hasSupportedQualifiedCharitableDistributionMetadata
          ? [
            "Confirmed qualified charitable distribution metadata from the upload is applied before the final retirement taxable lines are recomputed."
          ]
          : []),
        ...(previewSources.excludedEntryCount > 0
          ? [
            `${previewSources.excludedEntryCount} retirement ${excludedStatementLabel} marked as not belonging on the current-year return ${previewSources.excludedEntryCount === 1 ? "was" : "were"} excluded from this preview.`
          ]
          : [])
      ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099R = previewSources.entries;
    }
  };
}

function buildHsaContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectHsaPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalGross = previewSources.entries.map((entry) => entry.grossDistribution);
  const totalReturnedExcessEarnings = previewSources.entries
    .filter((entry) => entry.distributionCode === "2")
    .map((entry) => entry.earningsOnExcessContributions ?? "0");
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const grossAmount = sumMonetaryValues(totalGross).toFixed();
  const returnedExcessEarningsAmount = sumMonetaryValues(totalReturnedExcessEarnings).toFixed();
  const disabilityAmount = sumMonetaryValues(
    previewSources.entries
      .filter((entry) => entry.distributionCode === "3")
      .map((entry) => entry.grossDistribution)
  ).toFixed();
  const deathDistributionAmount = sumMonetaryValues(
    previewSources.entries
      .filter(isNonSpouseHsaDeathDistribution)
      .map((entry) => entry.fmvOnDateOfDeath ?? "0")
  ).toFixed();
  const postDeathEarningsAmount = previewSources.entries
    .filter(isNonSpouseHsaDeathDistribution)
    .reduce((sum, entry) => sum.plus(Decimal.max(
      new Decimal(0),
      new Decimal(entry.grossDistribution).minus(new Decimal(entry.fmvOnDateOfDeath ?? "0"))
    )), new Decimal(0))
    .toFixed();
  const prohibitedTransactionAmount = sumMonetaryValues(
    previewSources.entries
      .filter((entry) => entry.distributionCode === "5")
      .map((entry) => entry.grossDistribution)
  ).toFixed();
  const rolloverAmount = previewSources.confirmedRolloverDistributions;
  const qualifiedMedicalExpensesAmount = previewSources.confirmedQualifiedMedicalExpenses;
  const decedentQualifiedMedicalExpensesAmount =
    previewSources.confirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath;
  const hasAnyConfirmedMedicalExpenseOffset =
    previewSources.hasConfirmedQualifiedMedicalExpenses
    || previewSources.hasConfirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath;

  return {
    kind: "hsa",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form 1099-SA ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(grossAmount)} of HSA distributions.`,
      ...(returnedExcessEarningsAmount === "0"
        ? []
        : [
          `Confirmed Form 1099-SA Box 2 earnings on returned excess contributions add $${formatCurrencyAmount(returnedExcessEarningsAmount)} of other income.`
        ]),
      ...(disabilityAmount === "0"
        ? []
        : [
          `Confirmed Form 1099-SA disability coding automatically exempts $${formatCurrencyAmount(disabilityAmount)} from the HSA 20% additional-tax base before any remaining manual exception inputs.`
        ]),
      ...(deathDistributionAmount === "0"
        ? []
        : [
          `Confirmed Form 1099-SA death-distribution metadata uses $${formatCurrencyAmount(deathDistributionAmount)} of date-of-death fair market value on Form 8889 and routes ${postDeathEarningsAmount === "0" ? "no post-death earnings" : `$${formatCurrencyAmount(postDeathEarningsAmount)} of post-death earnings`} to other income.`
        ]),
      ...(prohibitedTransactionAmount === "0"
        ? []
        : [
          `Confirmed Form 1099-SA prohibited-transaction coding keeps $${formatCurrencyAmount(prohibitedTransactionAmount)} of deemed distributions out of the qualified medical-expense offset path.`
        ]),
      ...(previewSources.hasConfirmedRolloverDistributions
        ? [
          rolloverAmount === "0"
            ? "Confirmed HSA rollover review found no distributions to exclude on Form 8889 Line 14b."
            : `Confirmed HSA rollover review excludes $${formatCurrencyAmount(rolloverAmount)} of distributions on Form 8889 Line 14b.`
        ]
        : []),
      ...(previewSources.hasConfirmedQualifiedMedicalExpenses
        ? [
          qualifiedMedicalExpensesAmount === "0"
            ? "Confirmed qualified medical-expense review found no Form 8889 Line 15 offset."
            : `Confirmed qualified medical-expense review applies $${formatCurrencyAmount(qualifiedMedicalExpensesAmount)} on Form 8889 Line 15.`
        ]
        : []),
      ...(previewSources.hasConfirmedDecedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath
        ? [
          decedentQualifiedMedicalExpensesAmount === "0"
            ? "Confirmed decedent medical-expense review found no beneficiary-only Form 8889 Line 15 offset."
            : `Confirmed decedent medical-expense review applies $${formatCurrencyAmount(decedentQualifiedMedicalExpensesAmount)} on the beneficiary-only Form 8889 Line 15 branch.`
        ]
        : []),
      ...(!previewSources.hasConfirmedRolloverDistributions && !hasAnyConfirmedMedicalExpenseOffset
        ? [
          "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
        ]
        : !previewSources.hasConfirmedRolloverDistributions
          ? [
            "This HSA preview still leaves rollover offsets manual unless they are separately confirmed in the workspace ledger."
          ]
          : !hasAnyConfirmedMedicalExpenseOffset
            ? [
              "This HSA preview still leaves medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
            ]
            : [])
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.form1099SA = previewSources.entries;
      const offsets = previewSources.offsetsByOwner;
      if (Object.keys(offsets).length === 0) return;
      if (previewSources.entries.every(entry => entry.accountHolder === "primary")) {
        taxInput.form8889 = { accountOwner: "primary", ...offsets.primary } as TaxYearInput["form8889"];
      } else {
        taxInput.form8889ByOwner = {
          ...(offsets.primary ? { primary: { accountOwner: "primary", ...offsets.primary } } : {}),
          ...(offsets.spouse ? { spouse: { accountOwner: "spouse", ...offsets.spouse } } : {}),
        } as TaxYearInput["form8889ByOwner"];
      }
    }
  };
}

function buildSocialSecurityContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  const previewSources = collectSocialSecurityPreviewSources(item, documentsById, structuredFacts);

  if (!previewSources) {
    return null;
  }

  const totalBenefits = previewSources.entries.map((entry) => entry.netBenefits);
  const totalWithholding = previewSources.entries.map((entry) => entry.federalWithheld ?? "0");
  const uploadLabel = previewSources.sourceDocumentIds.length === 1 ? "upload" : "uploads";
  const contributionVerb = previewSources.sourceDocumentIds.length === 1 ? "contributes" : "contribute";
  const benefitsAmount = sumMonetaryValues(totalBenefits).toFixed();
  const withholdingAmount = sumMonetaryValues(totalWithholding).toFixed();

  return {
    kind: "investment-income",
    itemId: item.id,
    assumptions: [
      `The confirmed ${taxYear} Form SSA-1099 ${uploadLabel} ${contributionVerb} $${formatCurrencyAmount(benefitsAmount)} of net Social Security benefits and ${withholdingAmount === "0" ? "no withholding" : `$${formatCurrencyAmount(withholdingAmount)} of withholding`}.`,
      "This Social Security preview assumes no lump-sum election, prior-year repayment, or Railroad Retirement equivalent-benefit adjustment facts beyond the uploaded statement summary."
    ],
    sourceDocumentIds: previewSources.sourceDocumentIds,
    sourceFixtureIds: previewSources.sourceFixtureIds,
    sourceFactIds: collectContributionSourceFactIds(item, structuredFacts),
    apply(taxInput) {
      taxInput.formSSA1099 = previewSources.entries;
    }
  };
}

function buildPreviewContribution(
  taxYear: number,
  item: WorkspaceReturnSummary["items"][number],
  documentsById: Map<string, WorkspaceDocumentRecord>,
  structuredFacts: WorkspaceStructuredFactRecord[]
): PreviewContribution | null {
  switch (item.id) {
    case "wages-and-withholding":
      return buildWagesContribution(taxYear, item, documentsById, structuredFacts);
    case "capital-gains":
      return buildCapitalGainsContribution(taxYear, item, documentsById, structuredFacts);
    case "interest-income":
      return buildInterestContribution(taxYear, item, documentsById, structuredFacts);
    case "government-payments":
      return buildGovernmentPaymentsContribution(taxYear, item, documentsById, structuredFacts);
    case "dividend-income":
      return buildDividendContribution(taxYear, item, documentsById, structuredFacts);
    case "student-loan-interest":
      return buildStudentLoanInterestContribution(taxYear, item, documentsById, structuredFacts);
    case "premium-tax-credit":
      return buildPremiumTaxCreditContribution(taxYear, item, documentsById, structuredFacts);
    case "retirement-distributions":
      return buildRetirementContribution(taxYear, item, documentsById, structuredFacts);
    case "social-security-benefits":
      return buildSocialSecurityContribution(taxYear, item, documentsById, structuredFacts);
    case "hsa-distributions":
      return buildHsaContribution(taxYear, item, documentsById, structuredFacts);
    case "schedule-c-income":
      // A source NEC and free-text confirmation cannot establish the business
      // owner, actual expenses, participation, home office or loss limitations.
      // The complete guided business adapter collects and validates those facts.
      return null;
    default:
      return null;
  }
}

export function buildWorkspaceEngineInput(
  documents: WorkspaceDocumentRecord[],
  returnSummary: WorkspaceReturnSummary,
  structuredFacts: WorkspaceStructuredFactRecord[],
  taxpayer?: TaxYearInput["taxpayer"]
): WorkspaceEngineInputFixture | null {
  const targetTaxYear = returnSummary.targetTaxYear;

  if (returnSummary.status !== "ready-to-recompute" || targetTaxYear === null || returnSummary.taxYearState !== "single") {
    return null;
  }

  // A reconstructed/old summary is not authority to change source years or to
  // count duplicated documents and machine facts more than once.
  if (new Set(documents.map((document) => document.id)).size !== documents.length
    || new Set(structuredFacts.map((fact) => fact.id)).size !== structuredFacts.length
    || new Set(returnSummary.items.map((item) => item.id)).size !== returnSummary.items.length) return null;
  const selectedIds = new Set(returnSummary.items.flatMap((item) => item.sourceDocumentIds));
  for (const document of documents.filter((entry) => selectedIds.has(entry.id))) {
    const fixtureYear = officialSampleDocumentFixtures.find((fixture) => fixture.id === document.matchedFixtureId)?.taxYearHint;
    const year = document.taxYear === undefined ? fixtureYear : document.taxYear;
    if (year !== targetTaxYear || (fixtureYear != null && fixtureYear !== targetTaxYear)) return null;
  }
  for (const item of returnSummary.items) {
    if (item.status !== "ready" || new Set(item.sourceDocumentIds).size !== item.sourceDocumentIds.length) return null;
  }
  for (const fact of structuredFacts) {
    if (!fact.machineValue || !fact.sourceDocumentIds.some((id) => selectedIds.has(id))) continue;
    if (fact.sourceDocumentIds.length !== 1) return null;
    if ("accountHolder" in fact.machineValue && fact.machineValue.accountHolder === "spouse"
      && (!taxpayer?.spouse || taxpayer.filingStatus !== "married_filing_jointly")) return null;
    const machineValue = fact.machineValue;
    const hasMoney = (value: unknown, allowNegative = false) => typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && new Decimal(value).isFinite() && (allowNegative || new Decimal(value).gte(0));
    const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    if (machineValue.entryKind === "1099-sa-summary") {
      if (!["primary", "spouse"].includes(machineValue.accountHolder ?? "") || machineValue.accountType !== "hsa"
        || !hasText(machineValue.payer) || !hasMoney(machineValue.grossDistribution)) return null;
      if (machineValue.distributionCode === "2" && !hasMoney(machineValue.earningsOnExcessContributions)) return null;
      if ([machineValue.earningsOnExcessContributions, machineValue.fmvOnDateOfDeath, machineValue.rolloverDistributions,
        machineValue.qualifiedMedicalExpenses, machineValue.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath]
        .some(value => value !== undefined && !hasMoney(value))) return null;
    }
    if (machineValue.entryKind === "w2-summary"
      && (!hasText(machineValue.employerName) || !/^\d{2}-?\d{7}$/.test(machineValue.employerEin)
        || ![machineValue.wages, machineValue.federalWithheld, machineValue.socialSecurityWages, machineValue.socialSecurityTips, machineValue.socialSecurityWithheld, machineValue.medicareWages, machineValue.medicareWithheld, machineValue.box10DependentCareBenefits].every((value) => hasMoney(value)))) return null;
    if (machineValue.entryKind === "w2-summary") {
      // This document-only route has no Form 2441 source qualification facts.
      if (machineValue.box10DependentCareBenefits === undefined || new Decimal(machineValue.box10DependentCareBenefits).gt(0)) return null;
      if (fact.sourceType === "upload" && fact.id.includes(":parsed-") && machineValue.sourceFactsVersion !== 2) return null;
      if (taxpayer?.filingStatus === "married_filing_jointly" && !machineValue.accountHolder) return null;
      if (machineValue.stateTaxReporting === "none") {
        if (hasText(machineValue.state) || [machineValue.stateWages, machineValue.stateWithheld].some((value) => value !== undefined && (!hasMoney(value) || !new Decimal(value).isZero()))) return null;
      } else if (machineValue.stateTaxReporting !== "single" || !/^[A-Z]{2}$/.test(machineValue.state?.trim().toUpperCase() ?? "") || ![machineValue.stateWages, machineValue.stateWithheld].every((value) => hasMoney(value))) return null;
    }
    if (["1099-int-summary", "1099-div-summary", "1099-b-transaction"].includes(machineValue.entryKind)
      && fact.sourceType === "upload" && fact.id.includes(":parsed-")
      && (!("sourceFactsVersion" in machineValue) || machineValue.sourceFactsVersion !== 2)) return null;
    if (machineValue.entryKind === "1099-int-summary"
      && (!hasText(machineValue.payer) || ![machineValue.interestIncome, machineValue.earlyWithdrawalPenalty, machineValue.federalWithheld, machineValue.taxExemptInterest, machineValue.usSavingsBondInterest].every((value) => hasMoney(value)))) return null;
    if (machineValue.entryKind === "1099-div-summary"
      && (!hasText(machineValue.payer) || ![machineValue.ordinaryDividends, machineValue.qualifiedDividends, machineValue.capitalGainDistributions, machineValue.federalWithheld, machineValue.section199ADividends, machineValue.foreignTaxPaid].every((value) => hasMoney(value)))) return null;
    if (machineValue.entryKind === "1099-b-transaction") {
      const sold = machineValue.dateSold;
      const date = new Date(`${sold}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sold) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sold || !sold.startsWith(`${targetTaxYear}-`)) return null;
      const acquired = machineValue.dateAcquired;
      const acquiredDate = new Date(`${acquired}T00:00:00Z`);
      if (acquired !== "VARIOUS" && (!/^\d{4}-\d{2}-\d{2}$/.test(acquired) || !Number.isFinite(acquiredDate.getTime()) || acquiredDate.toISOString().slice(0, 10) !== acquired || acquired > sold)) return null;
      if (!hasText(machineValue.description) || ![machineValue.proceeds, machineValue.costBasis, machineValue.washSaleDisallowed].every((value) => hasMoney(value))
        || !hasMoney(machineValue.adjustments, true) || typeof machineValue.basisReportedToIRS !== "boolean" || typeof machineValue.washSale !== "boolean" || !["short", "long"].includes(machineValue.holdingPeriod ?? "")) return null;
      if (machineValue.washSale === false && machineValue.washSaleDisallowed !== undefined && new Decimal(machineValue.washSaleDisallowed).gt(0)) return null;
    }
  }

  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const contributions = returnSummary.items.map((item) =>
    buildPreviewContribution(targetTaxYear, item, documentsById, structuredFacts)
  );

  if (contributions.length === 0 || contributions.some((contribution) => contribution === null)) {
    return null;
  }

  const readyContributions = contributions as PreviewContribution[];
  const taxInput = createWorkspacePreviewTaxInput(targetTaxYear, taxpayer);
  if (!taxInput) return null;

  for (const contribution of readyContributions) {
    contribution.apply(taxInput);
  }

  const sourceDocumentIds = Array.from(new Set(
    readyContributions.flatMap((contribution) => contribution.sourceDocumentIds)
  ));
  const sourceFixtureIds = Array.from(new Set(
    readyContributions.flatMap((contribution) => contribution.sourceFixtureIds)
  ));
  const sourceFactIdsByItemId = Object.fromEntries(
    readyContributions.map((contribution) => [
      contribution.itemId,
      Array.from(new Set(contribution.sourceFactIds))
    ])
  );
  const includesParsedUploadFacts = readyContributions.some((contribution) =>
    contribution.sourceDocumentIds.length > 0 && contribution.sourceFixtureIds.length === 0
  );
  const assumptions = [
    readyContributions.every((contribution) => contribution.kind === "capital-gains")
      ? includesParsedUploadFacts
        ? "This engine run uses parsed upload transaction facts and official fixture transaction facts captured in the workspace ledger."
        : "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived transaction facts captured in the workspace ledger."
      : includesParsedUploadFacts
        ? "This engine run uses parsed upload facts and official fixture facts captured in the workspace ledger."
        : "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived facts captured in the workspace ledger.",
    ...readyContributions.flatMap((contribution) => contribution.assumptions)
  ];

  return {
    taxInput,
    assumptions: readyContributions.every((contribution) => contribution.kind === "capital-gains")
      ? [
          ...assumptions,
          "This preview only runs after the related capital-gains facts are fully confirmed in the interview loop."
        ]
      : assumptions,
    sourceDocumentIds,
    sourceFixtureIds,
    sourceFactIdsByItemId
  };
}
