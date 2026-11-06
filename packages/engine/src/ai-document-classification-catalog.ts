/** Descriptive application IDs, distinct from parsed upload kinds or calculation support.
 * Form labels follow official identities (irs.gov/forms-instructions and the public
 * sample-documents registry); non-form labels describe document structure only.
 * In particular: irs.gov/forms-pubs/about-form-w-2-c identifies the correction form.
 * No record migration, alias normalization, tax-year inference or fact application.
 */
export const AI_DOCUMENT_CLASSIFICATION_LABELS = Object.freeze({
  w2: "Form W-2 Wage and Tax Statement",
  w2c: "Form W-2c Corrected Wage and Tax Statement",
  "1098": "Form 1098 Mortgage Interest Statement",
  "1098-t": "Form 1098-T Tuition Statement",
  "1098-e": "Form 1098-E Student Loan Interest Statement",
  "1099-nec": "Form 1099-NEC Nonemployee Compensation",
  "1099-misc": "Form 1099-MISC Miscellaneous Information",
  "1099-k": "Form 1099-K Payment Card and Third Party Network Transactions",
  "1099-r": "Form 1099-R Retirement Distributions",
  "rrb-1099-r": "Form RRB-1099-R Railroad Retirement Pension Distributions",
  "rrb-1099": "Form RRB-1099 Railroad Retirement Benefits",
  "ssa-1099": "Form SSA-1099 Social Security Benefit Statement",
  "1099-int": "Form 1099-INT Interest Income",
  "1099-oid": "Form 1099-OID Original Issue Discount",
  "1099-div": "Form 1099-DIV Dividends and Distributions",
  "1099-b": "Form 1099-B Broker Transactions",
  "1099-da": "Form 1099-DA Digital Asset Proceeds",
  "1099-g": "Form 1099-G Certain Government Payments",
  "1095-a": "Form 1095-A Health Insurance Marketplace Statement",
  "1095-b": "Form 1095-B Health Coverage",
  "1095-c": "Form 1095-C Employer-Provided Health Insurance Offer and Coverage",
  "1099-sa": "Form 1099-SA Health Savings or Medical Savings Account Distributions",
  "5498-sa": "Form 5498-SA Health Savings or Medical Savings Account Information",
  "1099-q": "Form 1099-Q Payments From Qualified Education Programs",
  "k1-1065": "Schedule K-1 (Form 1065), partnership",
  "k1-1120s": "Schedule K-1 (Form 1120-S), S corporation",
  "k1-1041": "Schedule K-1 (Form 1041), estate or trust",
  "1040": "Form 1040 U.S. Individual Income Tax Return",
  "1040-es": "Form 1040-ES Estimated Tax for Individuals",
  "schedule-c": "Schedule C (Form 1040) Profit or Loss From Business",
  "schedule-d": "Schedule D (Form 1040) Capital Gains and Losses",
  "pay-statement": "Paystub or payroll earnings statement, not a completed W-2",
  "bank-statement": "Bank account transaction or balance statement",
  "credit-card-statement": "Credit card transaction or balance statement",
  "paid-receipt": "Receipt showing a completed payment",
  "unpaid-invoice": "Invoice requesting payment without completed-payment evidence",
  invoice: "Invoice whose payment status is not established",
  "property-tax-bill": "Property tax bill or assessment, not proof of payment",
  "foreign-interest-statement": "Foreign interest statement without a U.S. tax form identity",
  "combined-brokerage": "Combined brokerage packet with multiple separately identified form sections",
  "blank-w2": "Blank W-2 template without completed source facts",
  unsupported: "Identified non-tax-source material, such as an advertisement",
  "other-document": "Identified document outside this vocabulary; describe it without inventing a form ID",
  unknown: "Insufficient or conflicting evidence to identify the document; requires abstain",
} as const);
export type AiDocumentClassificationId = keyof typeof AI_DOCUMENT_CLASSIFICATION_LABELS;
export const AI_DOCUMENT_CLASSIFICATION_IDS = Object.freeze(Object.keys(AI_DOCUMENT_CLASSIFICATION_LABELS)) as readonly [AiDocumentClassificationId, ...AiDocumentClassificationId[]];
export const AI_DOCUMENT_CLASSIFICATION_SCOPE = Object.freeze({
  purpose: "descriptive-only", appliesSourceFacts: false, confirmsTaxpayerFacts: false,
  establishesCalculationSupport: false, establishesTaxYear: false, filingEligible: false,
} as const);
export const AI_DOCUMENT_CLASSIFICATION_DESCRIPTION = [
  "Use one exact canonical ID for descriptive classification, never a freeform form title.",
  "Put the human-readable source title in title. An ID does not establish upload/calculation support, source confirmation or tax year.",
  "unknown requires disposition abstain; abstain requires unknown. A recognized but unsupported form can be described with its ID.",
  "Use other-document for an identified unlisted document; use unsupported for identified non-tax-source material.",
  ...Object.entries(AI_DOCUMENT_CLASSIFICATION_LABELS).map(([id, label]) => `${id}: ${label}`),
].join("\n");
