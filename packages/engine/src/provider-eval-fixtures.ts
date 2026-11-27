import type { SyntheticEvalRequestContext } from "./provider-eval-request-contexts";
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
  requestContext?: SyntheticEvalRequestContext;
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

function freezeFixtureTree<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freezeFixtureTree(child);
  }
  Object.freeze(value);
  return value;
}

// Every scenario is individually authored. No task/year/amount variant expansion.
// These are synthetic drafts. Published held-out cases are not a secret benchmark.
export const taxProviderModelEvalFixtures: ProviderEvalFixture[] = freezeFixtureTree(structuredClone(standaloneProviderEvalScenarios));
