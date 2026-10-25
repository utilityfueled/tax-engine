import { incomeCases } from "./provider-eval-cases/income";
import { expenseCases } from "./provider-eval-cases/expenses";
import { classificationCases } from "./provider-eval-cases/classification";
import { summaryCases } from "./provider-eval-cases/summary";
import { interviewCases } from "./provider-eval-cases/interview";
import { unsupportedCases } from "./provider-eval-cases/unsupported";
import { explanationCases } from "./provider-eval-cases/explanation";
import { reconciliationCases } from "./provider-eval-cases/reconciliation";
/** 240 individual drafts, thirty per task, with a fixed ten held-out cases per task. */
export const standaloneProviderEvalScenarios = [
  ...incomeCases, ...expenseCases, ...classificationCases, ...summaryCases,
  ...interviewCases, ...unsupportedCases, ...explanationCases, ...reconciliationCases,
];
