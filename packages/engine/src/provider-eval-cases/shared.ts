import { syntheticEvalRequestContexts } from "../provider-eval-request-contexts";
import type { AiTask } from "../ai-task-registry";
import type { ProviderEvalFixture } from "../provider-eval-fixtures";
export type Fields = ProviderEvalFixture["expected"]["fields"];
export const money = (value: string) => ({ kind: "money" as const, value });
export const date = (value: string) => ({ kind: "date" as const, value });
export const text = (value: string) => ({ kind: "text" as const, value });
export function draft(task: AiTask, id: string, input: string, reviewCriteria: string[], fields: Fields = {}, options: {
  heldOut?: boolean; abstain?: boolean; category?: string; engineValues?: Record<string, string>;
  tags?: string[]; year?: 2025 | 2026;
} = {}): ProviderEvalFixture {
  const taxYear = options.year ?? 2026;
  const sourceId = `case-${id}:source`;
  return { id: `case-${id}`, version: 1, task, split: options.heldOut ? "held-out" : "development", taxYear,
    ruleVersion: `${taxYear}-synthetic-audit-no-filing`, tags: ["individually-authored-draft", ...(options.tags ?? [])],
    input: `Synthetic ${taxYear} case for ${task}. Source ${sourceId}. Filing export is unavailable.\n${input}`,
    sourceIds: [sourceId], reviewCriteria,
    ...(syntheticEvalRequestContexts[id] ? { requestContext: syntheticEvalRequestContexts[id] } : {}),
    expected: { disposition: options.abstain ? "abstain" : "answer", fields, category: options.category ?? null,
      engineValues: options.engineValues ?? {} },
    review: { author: "codex-representative-draft", status: "pending", reviewer: null, reviewedAt: null } };
}
