import type { HostedPlanId } from "@tax-engine/contracts";
import { providerModelCandidates } from "@tax-engine/engine/src/provider-model-eval";

type HostedAiBillingEnvironment = Record<string, string | undefined>;

export interface HostedAiUsageEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

const DEFAULT_INCLUDED_AI_BUDGET_CENTS = 1_000;
const DEFAULT_AI_TOP_UP_CREDIT_CENTS = 1_000;
const DEFAULT_AI_TOP_UP_PRICE_CENTS = 1_500;
const DEFAULT_MAX_OUTPUT_TOKENS = 700;

function readConfiguredNumber(
  rawValue: string | undefined
) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function approximateTokenCount(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(serialized.length / 4));
}

function resolveModelPricing(modelId: string, env: HostedAiBillingEnvironment) {
  const configuredInput = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_INPUT_USD_PER_MILLION);
  const configuredOutput = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_OUTPUT_USD_PER_MILLION);

  if (configuredInput !== null && configuredInput >= 0 && configuredOutput !== null && configuredOutput >= 0) {
    return {
      inputUsdPerMillionTokens: configuredInput,
      outputUsdPerMillionTokens: configuredOutput
    };
  }

  const candidate = providerModelCandidates.find((entry) => entry.modelId === modelId)
    ?? providerModelCandidates.find((entry) => entry.modelId === "gpt-5.2");

  return {
    inputUsdPerMillionTokens: candidate?.pricing.inputUsdPerMillionTokens ?? 1.75,
    outputUsdPerMillionTokens: candidate?.pricing.outputUsdPerMillionTokens ?? 14
  };
}

export function resolveHostedAiIncludedBudgetCents(
  planId: HostedPlanId | null | undefined,
  env: HostedAiBillingEnvironment = process.env
) {
  if (planId !== "starter" && planId !== "plus") {
    return 0;
  }

  const configured = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_INCLUDED_BUDGET_CENTS);
  return configured !== null && configured >= 0
    ? configured
    : DEFAULT_INCLUDED_AI_BUDGET_CENTS;
}

export function resolveHostedAiTopUpCreditCents(
  env: HostedAiBillingEnvironment = process.env
) {
  const configured = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_TOP_UP_CREDIT_CENTS);
  return configured !== null && configured > 0
    ? configured
    : DEFAULT_AI_TOP_UP_CREDIT_CENTS;
}

export function resolveHostedAiTopUpPriceCents(
  env: HostedAiBillingEnvironment = process.env
) {
  const configured = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_TOP_UP_PRICE_CENTS);
  return configured !== null && configured > 0
    ? configured
    : DEFAULT_AI_TOP_UP_PRICE_CENTS;
}

export function resolveHostedAiBudgetCycleKey(
  subscription: {
    currentPeriodEnd?: string | null;
    planId?: HostedPlanId | null;
    status?: string | null;
  }
) {
  if (!subscription.planId || !subscription.currentPeriodEnd) {
    return "self-host";
  }

  return `${subscription.planId}:${subscription.currentPeriodEnd}`;
}

export function estimateHostedAiUsageCost(
  {
    requestPayload,
    responseText,
    modelId,
    inputTokens,
    outputTokens
  }: {
    requestPayload: unknown;
    responseText?: string | null;
    modelId: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
  env: HostedAiBillingEnvironment = process.env
): HostedAiUsageEstimate {
  const pricing = resolveModelPricing(modelId, env);
  const resolvedInputTokens = inputTokens ?? approximateTokenCount(requestPayload);
  const resolvedOutputTokens = outputTokens
    ?? approximateTokenCount(responseText ?? "") ;
  const estimatedCostUsd = (
    (resolvedInputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens
    + (resolvedOutputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
  );

  return {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    estimatedCostCents: Math.max(1, Math.ceil(estimatedCostUsd * 100))
  };
}

export function estimateHostedAiReserveCostCents(
  {
    requestPayload,
    modelId,
    maxOutputTokens
  }: {
    requestPayload: unknown;
    modelId: string;
    maxOutputTokens?: number;
  },
  env: HostedAiBillingEnvironment = process.env
) {
  return estimateHostedAiUsageCost({
    requestPayload,
    modelId,
    inputTokens: approximateTokenCount(requestPayload),
    outputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  }, env).estimatedCostCents;
}

export function resolveHostedAiHelperModelId(
  env: HostedAiBillingEnvironment = process.env
) {
  return env.MODEL_PROVIDER_MODEL?.trim() || "gpt-5-mini";
}

export function resolveHostedAiMaxOutputTokens(
  env: HostedAiBillingEnvironment = process.env
) {
  const configured = readConfiguredNumber(env.TAX_ENGINE_AI_HELPER_MAX_OUTPUT_TOKENS);
  return configured !== null && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_OUTPUT_TOKENS;
}
