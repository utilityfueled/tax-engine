import type { AiTask } from "./ai-task-registry";
import { standaloneProviderEvalScenarios } from "./provider-eval-scenarios";

export interface ProviderEvalFixture {
  id: string;
  version: 1;
  task: AiTask;
  split: "development" | "held-out";
  taxYear: 2025 | 2026;
  ruleVersion: string;
  tags: string[];
  input: string;
  sourceIds: string[];
  /** Human assessment criteria, never sent to a model or used as a generated judge. */
  reviewCriteria: string[];
  expected: {
    disposition: "answer" | "abstain";
    fields: Record<string, { kind: "money" | "date" | "text"; value: string }>;
    category: string | null;
    engineValues: Record<string, string>;
  };
  review: { author: string; status: "pending" | "reviewed"; reviewer: string | null; reviewedAt: string | null };
}

// Every scenario is individually authored. No task/year/amount variant expansion.
// These are synthetic drafts. Published held-out cases are not a secret benchmark.
export const taxProviderModelEvalFixtures: ProviderEvalFixture[] = standaloneProviderEvalScenarios;
