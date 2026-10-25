import { z } from "zod";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema, type EducationExpenses, type TaxYearInput } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import type { FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

export type EducationSourceRecord = Record<string, string | boolean | null | undefined>;
export interface EducationStatementDraft { fields: EducationSourceRecord; transfer: EducationSourceRecord }
export interface EducationDistributionData {
  taxYear?: string;
  sourceFactsConfirmed?: boolean | null;
  allDistributionsReconciled?: boolean | null;
  exceptionsDistinctFromCreditConfirmed?: boolean | null;
  forms?: EducationStatementDraft[];
  beneficiaries?: EducationSourceRecord[];
  expenses?: EducationSourceRecord[];
  allocations?: EducationSourceRecord[];
  loanBorrowers?: EducationSourceRecord[];
  coverdellAccounts?: EducationSourceRecord[];
  penaltyExceptions?: EducationSourceRecord[];
}
export type EducationSourceCollection = "beneficiaries" | "expenses" | "allocations" | "loanBorrowers" | "coverdellAccounts" | "penaltyExceptions";
export interface EducationSourceField {
  key: string; label: string; kind: "text" | "date" | "money" | "integer" | "boolean" | "choice";
  choices?: ReadonlyArray<readonly [string, string]>; signed?: boolean;
  link?: "beneficiary" | "expense" | "source" | "borrower";
  when?: (record: EducationSourceRecord) => boolean;
}
const text = (key: string, label: string): EducationSourceField => ({ key, label, kind: "text" });
const money = (key: string, label: string, signed = false): EducationSourceField => ({ key, label, kind: "money", signed });
const bool = (key: string, label: string): EducationSourceField => ({ key, label, kind: "boolean" });
const integer = (key: string, label: string): EducationSourceField => ({ key, label, kind: "integer" });
const date = (key: string, label: string): EducationSourceField => ({ key, label, kind: "date" });
const choice = (key: string, label: string, choices: EducationSourceField["choices"]): EducationSourceField => ({ key, label, kind: "choice", choices });
const link = (key: string, label: string, kind: EducationSourceField["link"]): EducationSourceField => ({ key, label, kind: "choice", link: kind });
const only = (field: EducationSourceField, predicate: EducationSourceField["when"]): EducationSourceField => ({ ...field, when: predicate });
const category = (...values: string[]) => (record: EducationSourceRecord) => values.includes(String(record.category));
const transferKind = (...values: string[]) => (record: EducationSourceRecord) => values.includes(String(record.kind));
const owners = [["primary", "You"], ["spouse", "Spouse"], ["other", "Someone outside this return"]] as const;
export const educationStatementFields: EducationSourceField[] = [
  text("payerName", "Plan or custodian name"), text("accountId", "Account label (use the same label for the same account)"),
  integer("taxYear", "Statement tax year"), choice("accountType", "Program type", [["529", "529 qualified tuition program"], ["coverdell_esa", "Coverdell ESA"]]),
  only(choice("distributionMedium", "Actual 529 distribution form (needed for educator coordination)", [["cash", "Cash distribution"], ["in_kind_prepaid_tuition", "Prepaid tuition or in-kind benefit"]]), record => record.accountType === "529"),
  link("beneficiaryId", "Statement designated beneficiary", "beneficiary"), choice("recipientOwner", "Statement recipient", owners),
  only(text("recipientId", "Other recipient label (no tax identification number)"), record => record.recipientOwner === "other"),
  money("grossDistribution", "Box 1 gross distribution"), money("earnings", "Box 2 earnings (leave blank if not reported)", true), money("basis", "Box 3 basis (leave blank if not reported)"),
  bool("isTrusteeToTrustee", "Box 4a checked"), bool("isQtpToRoth", "Box 4b QTP-to-Roth transfer checked"), bool("recipientNotBeneficiary", "Box 6 recipient is not the beneficiary"),
  choice("distributionCode", "Optional Box 7 distribution code", [["1", "1 - ordinary distribution"], ["2", "2 - excess contribution, current-year earnings"], ["3", "3 - excess contribution, prior-year earnings"], ["4", "4 - disability"], ["5", "5 - death"], ["6", "6 - prohibited transaction"]]),
  date("distributionDate", "Actual distribution date (required for transfers or dated exceptions)"), bool("allDistributionsAfterJuly42025", "For expanded 2025 expenses, all statement distributions occurred after July 4"),
  bool("finalDistribution", "This is the final account distribution (required for negative earnings)"),
  ...[text("returnedContributionId", "Returned contribution label (reuse for the same deposit)"), integer("returnedContributionTaxYear", "Tax year designated for the returned contribution"), date("returnedContributionDate", "Original contribution paid date"), money("returnedContributionOriginalAmount", "Original contribution amount"), money("returnedContributionPrincipal", "Actual principal returned"), money("returnedContributionNetIncome", "Custodian's net income attributable to returned principal (signed)", true), money("returnedContributionIncomePreviouslyReported", "Earnings from this correction already reported for its contribution year"), bool("returnedContributionNetIncomeConfirmed", "Actual custodian net-income calculation checked"), bool("returnedContributionBasisReconciled", "Account basis and net contributions reconciled after this return")].map(field => only(field, record => record.distributionCode === "2" || record.distributionCode === "3")),
  ...[choice("prohibitedTransactionKind", "Actual prohibited transaction type", [["account_disqualification", "Account disqualification"], ["pledged_portion", "A portion pledged as security"]]), date("prohibitedTransactionDate", "Actual prohibited transaction date"), text("prohibitedTransactionSourceReference", "Prohibited transaction source record reference"), money("prohibitedTransactionBasis", "Actual basis associated with the deemed distribution"), bool("prohibitedTransactionSourceConfirmed", "Prohibited transaction source records checked")].map(field => only(field, record => record.distributionCode === "6")),
  only(money("prohibitedTransactionJanuary1Value", "Account value on January 1 of the transaction year"), record => record.distributionCode === "6" && record.prohibitedTransactionKind === "account_disqualification"),
  ...[money("prohibitedTransactionQualifiedEducationExpenses", "Beneficiary's total qualified education expenses, including eligible 529 contributions"), bool("prohibitedTransactionNoPostDisqualificationActivityConfirmed", "Full-year records confirm no income, gains or losses after January 1"), text("prohibitedTransactionPostDisqualificationSourceReference", "Source record for the full-year account activity review")].map(field => only(field, record => record.distributionCode === "6" && record.prohibitedTransactionKind === "account_disqualification")),
  only(money("prohibitedTransactionPledgedAmount", "Actual account amount pledged as security"), record => record.distributionCode === "6" && record.prohibitedTransactionKind === "pledged_portion"),
  bool("sourceFactsConfirmed", "Statement facts checked against the actual source"),
];
export const educationTransferFields: EducationSourceField[] = [
  choice("kind", "Transfer or recontribution treatment", [["none", "No transfer or recontribution"], ["qtp", "Transfer to another 529 plan"], ["coverdell", "Rollover to another Coverdell ESA"], ["able", "Rollover to an ABLE account"], ["roth", "Direct transfer to the beneficiary's Roth IRA"], ["refund_recontribution", "Recontribution of a refunded education expense"]]),
  ...[money("amount", "Actual transfer or recontribution amount"), date("receivedDate", "Destination received date"), bool("sameBeneficiary", "Destination has the same beneficiary"), bool("eligibleFamilyMember", "Destination beneficiary is an eligible family member")].map(field => only(field, record => Boolean(record.kind) && record.kind !== "none")),
  only(bool("priorRolloverWithin12Months", "A prior applicable rollover occurred within 12 months"), transferKind("qtp", "coverdell")),
  only(integer("destinationBeneficiaryAge", "Destination Coverdell beneficiary age"), transferKind("coverdell")), only(bool("destinationSpecialNeeds", "Destination Coverdell beneficiary has special needs"), transferKind("coverdell")),
  only(money("coverdellTransferredBasis", "Actual Coverdell basis included in this rollover"), transferKind("coverdell")),
  only(text("destinationAccountId", "Destination account label"), transferKind("qtp", "able")),
  only(bool("destinationAccountEligible", "Destination ABLE account eligibility confirmed"), transferKind("able")), only(money("otherAbleContributions", "Other contributions to this ABLE account this year"), transferKind("able")),
  ...[date("accountOpenedDate", "529 account opened date"), money("contributionsAndEarningsBeforeFiveYears", "Reconciled eligible funds before the included Roth transfers"), integer("beneficiaryAgeAtYearEnd", "Beneficiary age at year-end"), money("beneficiaryTaxableCompensation", "Beneficiary taxable compensation"), money("otherIraContributions", "Other IRA contributions for the beneficiary this year"), money("previousRothRollovers", "Prior-year 529-to-Roth rollovers")].map(field => only(field, transferKind("roth"))),
  ...[text("refundSourceId", "Refund source label (reuse for the same refund)"), date("refundDate", "Expense refund received date"), money("refundedExpenseAmount", "Actual amount of this expense refund")].map(field => only(field, transferKind("refund_recontribution"))),
];
export const educationExpenseCategories = [
  ["postsecondary_tuition", "Eligible postsecondary tuition and fees"], ["postsecondary_books", "Required postsecondary books, supplies and equipment"], ["postsecondary_special_needs", "Postsecondary special-needs services"], ["postsecondary_room_board", "Postsecondary room and board"], ["postsecondary_computer", "Postsecondary computer and internet"],
  ["k12_tuition", "K-12 tuition"], ["k12_curriculum", "K-12 curriculum"], ["k12_books", "K-12 books and instructional materials"], ["k12_online", "K-12 online educational materials"], ["k12_tutoring", "K-12 tutoring"], ["k12_testing", "K-12 testing"], ["k12_dual_enrollment", "K-12 dual enrollment"], ["k12_disability_therapy", "K-12 disability therapies"],
  ["coverdell_k12_other", "Other qualified Coverdell K-12 expenses"], ["qtp_contribution", "Coverdell contribution to a same-beneficiary 529 plan"], ["apprenticeship", "Registered apprenticeship"], ["student_loan", "Qualified student-loan payment"], ["credential_enrollment", "Recognized credential enrollment"], ["credential_testing", "Recognized credential testing"], ["credential_continuing_education", "Required continuing credential education"],
] as const;
export const educationCollectionFields: Record<EducationSourceCollection, EducationSourceField[]> = {
  beneficiaries: [text("name", "Beneficiary name"), text("studentTaxId", "Beneficiary tax ID (only needed to coordinate an education credit)"), money("outsideK12QualifiedDistributions", "Qualified K-12 distributions from plans outside these records")],
  expenses: [link("beneficiaryId", "Expense beneficiary", "beneficiary"), choice("category", "Expense category", educationExpenseCategories), date("paidDate", "Expense paid date"), money("amount", "Actual expense paid"), money("refundedAmount", "Refunded expense amount"), money("taxFreeAssistance", "Tax-free assistance allocated to this expense"), money("educationCreditAmount", "Expense allocated to AOTC or lifetime learning credit"), money("otherTaxBenefitAmount", "Expense used for another tax benefit"), bool("qualificationConfirmed", "Applicable expense eligibility checked"),
    ...[bool("halfTimeStudent", "Student enrolled at least half time"), money("roomBoardAllowance", "Institution's applicable room-and-board allowance"), money("schoolOwnedHousingCharge", "Actual institution-owned housing charge (0 if none)")].map(field => only(field, category("postsecondary_room_board"))),
    ...[bool("tutorUnrelated", "Tutor is unrelated to the student"), bool("tutoringOutsideHome", "Tutoring takes place outside the home"), bool("tutorQualified", "Tutor meets the statutory credential requirements")].map(field => only(field, category("k12_tutoring"))),
    ...[bool("studentHasDisability", "Student has a disability"), bool("providerLicensedOrAccredited", "Therapy provider is licensed or accredited")].map(field => only(field, category("k12_disability_therapy"))),
    ...[bool("credentialRecognized", "Credential meets the recognized-program rules"), bool("requiredForCredential", "Expense is required for the credential")].map(field => only(field, record => String(record.category).startsWith("credential_"))),
    only(text("destinationAccountId", "Destination 529 account label"), category("qtp_contribution")),
    ...[link("borrowerId", "Loan borrower", "borrower"), bool("beneficiaryOrSibling", "Borrower is the beneficiary or an eligible sibling"), money("studentLoanInterestAmount", "Actual interest included in this loan payment"), money("studentLoanInterestDeducted", "Interest claimed for deduction before income phase-out")].map(field => only(field, category("student_loan")))],
  allocations: [link("expenseId", "Expense to allocate", "expense"), link("sourceId", "Distribution funding this expense", "source"), money("amount", "Net expense allocated to this distribution"), money("creditAmount", "Separate credit expense affecting this distribution"), money("loanInterestAmount", "Actual interest in this loan-payment allocation (loans only)")],
  loanBorrowers: [text("name", "Loan borrower label"), choice("owner", "Loan borrower on this return", owners), money("priorQualifiedDistributions", "Prior qualified 529 payments toward this borrower's loans"), money("otherCurrentQualifiedDistributions", "Other current qualified 529 payments toward this borrower's loans")],
  coverdellAccounts: [text("accountId", "Coverdell account label (must match statements)"), money("priorYearBasis", "Actual prior-year account basis"), money("currentYearContributions", "Current-year contributions, excluding rollovers and returned excess"), money("yearEndValue", "Actual year-end account value"), money("outstandingRollovers", "Outstanding year-end rollovers"), money("rolloverBasisReceived", "Actual basis received in rollovers (0 if none)")],
  penaltyExceptions: [link("sourceId", "Distribution with an additional-tax exception", "source"), choice("kind", "Exception reason", [["scholarship", "Scholarship or other eligible assistance"], ["military_academy", "Eligible military academy attendance"], ["death", "Beneficiary death"], ["disability", "Beneficiary disability"]]), money("qualifyingAmount", "Actual qualifying source amount"), money("distributionAmount", "Distinct nonqualified distribution allocated to this exception"), bool("eligibilityConfirmed", "Exception eligibility checked"), only(date("eventDate", "Beneficiary death date"), record => record.kind === "death"), only(bool("paidToBeneficiaryOrEstate", "Death distribution paid to an eligible beneficiary or estate"), record => record.kind === "death")],
};
const allFields = [...educationStatementFields, ...educationTransferFields, ...Object.values(educationCollectionFields).flat()];
const moneyKeys = new Set(allFields.filter(field => field.kind === "money").map(field => field.key));
const integerKeys = new Set(allFields.filter(field => field.kind === "integer").map(field => field.key));
const booleanKeys = new Set(allFields.filter(field => field.kind === "boolean").map(field => field.key));
function normalized(record: EducationSourceRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) continue;
    if (booleanKeys.has(key)) { if (typeof value !== "boolean") throw new Error("Choose each applicable yes or no source answer."); result[key] = value; }
    else if (moneyKeys.has(key)) { if (typeof value !== "string") throw new Error("Enter the actual source amount."); result[key] = parseGuidedCurrency(value).toFixed(); }
    else if (integerKeys.has(key)) { if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) throw new Error("Enter the actual whole-number year or age."); result[key] = Number(value); }
    else result[key] = typeof value === "string" ? value.trim() : value;
  }
  return result;
}
function collect(data: EducationDistributionData, year?: number | null, status?: FilingStatus | null, educationExpenses?: EducationExpenses): Pick<TaxYearInput, "form1099Q" | "qualifiedEducationExpenses"> {
  if ((year !== 2025 && year !== 2026) || !status || data.taxYear !== String(year)) throw new Error("Choose the actual return year and filing status, and match the education source year.");
  if (!Array.isArray(data.forms)) throw new Error("Add the actual distribution statements or explicitly confirm none.");
  const forms = data.forms.map(entry => Form1099QSchema.parse({ ...normalized(entry.fields), transfer: normalized(entry.transfer) }));
  if (status !== "mfj" && forms.some(form => form.recipientOwner === "spouse")) throw new Error("A spouse's education-distribution income requires that spouse's own return or a joint return.");
  const facts = Object.fromEntries((Object.keys(educationCollectionFields) as EducationSourceCollection[]).map(key => [key, data[key]?.map(normalized)]));
  const summary = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: { ...facts, taxYear: year, sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allDistributionsReconciled: data.allDistributionsReconciled ?? undefined, exceptionsDistinctFromCreditConfirmed: data.exceptionsDistinctFromCreditConfirmed ?? undefined } });
  if (!educationExpenses && summary.sourceFacts?.expenses?.some(expense => parseGuidedCurrency(expense.educationCreditAmount).gt(0))) throw new Error("Link each credit allocation to one actual education-credit student before calculating.");
  calculateForm1099Q(forms, summary, { taxYear: year, educationExpenses });
  return { form1099Q: forms, qualifiedEducationExpenses: summary };
}
export function educationDistributionFactErrors(data?: EducationDistributionData, year?: number | null, status?: FilingStatus | null, educationExpenses?: EducationExpenses): Record<string, string> {
  if (!data) return {};
  try { collect(data, year, status, educationExpenses); return {}; }
  catch (error) {
    return { educationDistributions: error instanceof z.ZodError ? "Complete the statement amounts, account and recipient choices, and linked source records. Leave a value blank only when the actual statement does not report it."
      : error instanceof Error ? error.message : "Complete the actual education distribution sources before calculating." };
  }
}
export function buildEducationDistributionInputs(data?: EducationDistributionData, year?: number | null, status?: FilingStatus | null, educationExpenses?: EducationExpenses): Partial<Pick<TaxYearInput, "form1099Q" | "qualifiedEducationExpenses">> {
  if (!data) return {};
  return collect(data, year, status, educationExpenses);
}
