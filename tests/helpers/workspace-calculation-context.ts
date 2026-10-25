import Decimal from "decimal.js";
import type { WorkspaceStructuredFactRecord } from "@tax-engine/contracts";
import type { WorkspaceEngineCalculationContext, WorkspaceSourceBinding, WorkspaceSourceCollection } from "@tax-engine/engine";
import { type TaxYearInput, type Taxpayer } from "../../src/models/inputs";

/**
 * Explicit fictional return facts for the existing numerical workspace scenarios.
 * These supplements are test data, never application defaults: no dependents,
 * blindness, foreign/short-year restrictions, other income or tax benefits.
 * The original document ledger is left untouched. Cases requiring special actual
 * source worksheets supply those separately rather than treating prose as facts.
 */
export function workspaceScenarioContext(facts: WorkspaceStructuredFactRecord[], taxpayer: Taxpayer): WorkspaceEngineCalculationContext {
  const raw: Record<string, unknown> = { taxpayer, standardDeductionFacts: { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeathDate: null, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeathDate: null, spouseItemizes: false, claimSpouseAdditionalDeduction: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false },
    socialSecurityFacts: { sourceFactsConfirmed: true, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0" },
    priorYear: { priorYearAGI: "100000", priorYearTax: "15000", shortTermCapitalLoss: "0", longTermCapitalLoss: "0" },
    form2210: { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearJointReturn: false, priorYearTaxForForm2210: "15000", priorYearAgiForForm2210: "100000", priorYearTaxComputationConfirmed: true, priorYearCreditPayments: [], returnPayments: [] } };
  const bindings: WorkspaceSourceBinding[] = [];
  const append = (fact: WorkspaceStructuredFactRecord, key: WorkspaceSourceCollection, value: unknown, transactionIndex?: number) => {
    const records = (raw[key] ??= []) as unknown[];
    bindings.push({ sourceFactId: fact.id, inputCollection: key, inputIndex: records.length, ...(transactionIndex === undefined ? {} : { transactionIndex }), sourceFactsConfirmed: true });
    records.push(value);
  };
  for (const fact of facts) {
    const source = fact.machineValue; if (!source) continue;
    const { entryKind, ...values } = source;
    if (source.entryKind === "1099-r-summary" && source.belongsOnCurrentYearReturn === false) {
      raw.form1099R ??= []; bindings.push({ sourceFactId: fact.id, inputCollection: "form1099R", inputIndex: -1, excludedFromCurrentReturn: true, sourceFactsConfirmed: true }); continue;
    }
    switch (entryKind) {
      case "w2-summary": {
        const w2 = source as Extract<typeof source, { entryKind: "w2-summary" }>;
        append(fact, "w2s", { accountHolder: "primary", box12CodeW: "0", box12CodeD: "0", box12CodeE: "0", box12CodeF: "0", box12CodeG: "0", box12CodeH: "0", box12CodeS: "0", box12CodeAA: "0", box12CodeBB: "0", box12CodeEE: "0", box12CodeT: "0", stateWages: "0", localWages: "0", localTaxWithheld: "0", ...values, employer: { name: w2.employerName, ein: w2.employerEin }, stateTaxWithheld: w2.stateWithheld ?? "0" }); break;
      }
      case "1099-int-summary": append(fact, "form1099Int", { foreignTaxPaid: "0", stateWithheld: "0", ...values }); break;
      case "1099-div-summary": append(fact, "form1099Div", { section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0", nondividendDistributions: "0", exemptInterestDividends: "0", stateWithheld: "0", ...values, totalCapitalGainDistributions: source.entryKind === "1099-div-summary" ? source.capitalGainDistributions : undefined }); break;
      case "1099-b-transaction": append(fact, "form1099B", { broker: "Fictional broker supplied with complete scenario records", accountHolder: "primary", stateWithheld: "0", transactions: [values] }, 0); break;
      case "1099-nec-summary": append(fact, "form1099Nec", { stateWithheld: "0", ...values }); break;
      case "1099-g-summary": {
        append(fact, "form1099G", { sourceId: fact.id, accountReference: "Fictional government statement", payerTin: "12-3456789", taxYear: taxpayer.taxYear, sourceFormRevision: "2024-03", accountHolder: "primary", programType: "government-unemployment", rtaaPayments: "0", taxableGrants: "0", agriculturePayments: "0", marketGain: "0", tradeOrBusinessRefund: false, currentYearRepaid: "0", priorYearRepaid: "0", unrecoveredAfterTaxContributions: "0", actualReceiptConfirmed: true, additionalWorksheetRequired: false, sourceFactsConfirmed: true, stateTaxReporting: "single", refundTaxYear: 2024, refundExpenseTaxYear: 2024, ...values });
        raw.taxableRefundWorksheet = { priorTaxYear: 2024, priorYearItemized: false, priorYearStandardDeduction: "14600", priorYearFilingStatus: "single" }; break;
      }
      case "1099-oid-summary": append(fact, "form1099OID", values); break;
      case "1099-r-summary": append(fact, "form1099R", { accountHolder: "primary", stateWithheld: "0", stateTaxWithheld: "0", stateDistribution: "0", localTaxWithheld: "0", employeeContributions: "0", eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0", rothConversionAmount: "0", rothIraRolledOverAmount: "0", qualifiedCharitableDistribution: "0", retiredPublicSafetyOfficerInsurancePremiums: "0", taxableAmountNotDetermined: false, eligibleGovernmental457bPlan: false, rothContributionOrConversionMadeBefore2021: false, qualifiedRothDistribution: false, qualifiedJointSurvivorAnnuity: false, returnedContributionByDueDate: false, excessContributionReturnedWithoutEarnings: false, separationFromServiceAfterAge55ExceptionApplies: false, qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false, qualifiedDomesticRelationsOrderExceptionApplies: false, terminalIllnessExceptionApplies: false, disabilityPensionBeforeMinimumRetirementAge: false, militaryPensionOrSurvivorBenefit: false, ...values }); break;
      case "1099-sa-summary": append(fact, "form1099SA", values); break;
      case "ssa-1099-summary": append(fact, "formSSA1099", values); break;
      case "1098-e-summary": append(fact, "form1098E", values); break;
      case "1095-a-summary": append(fact, "form1095A", values); break;
    }
  }
  const hsaSources = facts.flatMap(fact => fact.machineValue?.entryKind === "1099-sa-summary" ? [fact.machineValue] : []);
  const w2Sources = facts.flatMap(fact => fact.machineValue?.entryKind === "w2-summary" && fact.machineValue.box12CodeW && new Decimal(fact.machineValue.box12CodeW).gt(0) ? [fact.machineValue] : []);
  const owners = [...new Set([...hsaSources, ...w2Sources].flatMap(source => source.accountHolder ? [source.accountHolder] : []))];
  const byOwner: Record<string, unknown> = {};
  for (const owner of owners) {
    const owned = hsaSources.filter(source => source.accountHolder === owner);
    const actual: Record<string, unknown> = { accountOwner: owner, coverageByMonth: Array.from({ length: 12 }, () => "self_only"), isDependent: false, medicareMonths: [], useLastMonthRule: false, contributionsMade: "0", employerContributions: w2Sources.filter(source => source.accountHolder === owner).reduce((sum, source) => sum.plus(source.box12CodeW!), new Decimal(0)).toFixed(), qualifiedFundingDistribution: "0" };
    for (const key of ["rolloverDistributions", "qualifiedMedicalExpenses", "decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath"] as const) {
      if (owned.every(source => source[key] !== undefined)) actual[key] = owned.reduce((sum, source) => sum.plus(source[key] as string), new Decimal(0)).toFixed();
    }
    byOwner[owner] = actual;
  }
  if (owners.length === 1 && owners[0] === "primary") raw.form8889 = byOwner.primary;
  else if (owners.length) raw.form8889ByOwner = byOwner;
  return { taxInput: raw as unknown as TaxYearInput, allReturnFactsConfirmed: true, sourceBindings: bindings };
}

/** Explicit additional fictional borrower records, separate from the old PDF boxes. */
export function qualifiedWorkspaceLoanContext(facts: WorkspaceStructuredFactRecord[], taxpayer: Taxpayer): WorkspaceEngineCalculationContext {
  const context = workspaceScenarioContext(facts, taxpayer);
  context.taxInput.form1098E = context.taxInput.form1098E.map((form, index) => ({ ...form,
    sourceId: form.sourceId ?? `actual-loan-statement:${index}`, taxYear: taxpayer.taxYear,
    borrowerId: form.borrowerId ?? "actual-primary-borrower", accountHolder: form.accountHolder ?? "primary",
    box2ExcludesOriginationFeesOrCapitalizedInterest: false,
  }));
  context.taxInput.studentLoanInterestFacts = {
    sourceTaxYear: taxpayer.taxYear, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
    puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0",
    loans: context.taxInput.form1098E.map((form, index) => ({
      sourceId: `actual-loan:${index}`, borrowerId: form.borrowerId, accountHolder: form.accountHolder, lender: form.lender,
      sourceKind: "form1098e", form1098ESourceId: form.sourceId, loanOriginationDate: "2015-08-01",
      interestPaid: form.studentLoanInterestReceived, additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
      legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self",
      expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0",
      qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [],
    })),
  };
  return context;
}
