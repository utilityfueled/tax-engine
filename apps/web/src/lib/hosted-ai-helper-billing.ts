import type { HostedPlanId } from "@tax-engine/contracts";
import Decimal from "decimal.js";
import { calculateAiCost } from "@tax-engine/engine/src/ai-pricing";
import { AI_TASKS } from "@tax-engine/engine/src/ai-task-registry";

type HostedAiBillingEnvironment = Record<string, string | undefined>;

export interface HostedAiUsageEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  providerCostUsd: string;
  usageKind: "reported" | "estimated";
  pricingEffectiveFrom: string;
}

const DEFAULT_INCLUDED_AI_BUDGET_CENTS = 1_000;
const DEFAULT_AI_TOP_UP_CREDIT_CENTS = 1_000;
const DEFAULT_AI_TOP_UP_PRICE_CENTS = 1_500;
const DEFAULT_MAX_OUTPUT_TOKENS = AI_TASKS["workspace-summary"].maxOutputTokens;

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

  try {
    const parsed = new Decimal(trimmed);
    return parsed.isFinite() && parsed.isInteger() && parsed.abs().lte(Number.MAX_SAFE_INTEGER) ? parsed.toNumber() : null;
  } catch {
    return null;
  }
}

function approximateTokenCount(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(serialized.length / 4));
}

function configuredPrice(raw: string | undefined): Decimal | null {
  if (!raw?.trim()) return null;
  const price = new Decimal(raw);
  if (!price.isFinite() || price.isNegative()) throw new Error("Invalid explicit AI price.");
  return price;
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
    outputTokens,
    cachedInputTokens = 0,
    at = new Date().toISOString()
  }: {
    requestPayload: unknown;
    responseText?: string | null;
    modelId: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number;
    at?: string;
  },
  env: HostedAiBillingEnvironment = process.env
): HostedAiUsageEstimate {
  const resolvedInputTokens = inputTokens ?? approximateTokenCount(requestPayload);
  const resolvedOutputTokens = outputTokens
    ?? approximateTokenCount(responseText ?? "") ;
  if ([resolvedInputTokens, resolvedOutputTokens, cachedInputTokens].some(count => !Number.isSafeInteger(count) || count < 0)
    || cachedInputTokens > resolvedInputTokens) throw new Error("Invalid AI token usage.");
  const configuredInput = configuredPrice(env.TAX_ENGINE_AI_HELPER_INPUT_USD_PER_MILLION);
  const configuredOutput = configuredPrice(env.TAX_ENGINE_AI_HELPER_OUTPUT_USD_PER_MILLION);
  if ((configuredInput === null) !== (configuredOutput === null)) throw new Error("Both explicit AI prices are required.");
  let cost;
  if (configuredInput && configuredOutput) {
    if (cachedInputTokens > 0) throw new Error("Explicit custom pricing needs a cache price before cached usage can be charged.");
    const providerCost = new Decimal(resolvedInputTokens).times(configuredInput)
      .plus(new Decimal(resolvedOutputTokens).times(configuredOutput)).div("1000000");
    const charge = Decimal.max("1", providerCost.times("100").ceil());
    if (charge.gt(Number.MAX_SAFE_INTEGER)) throw new Error("AI charge exceeds ledger range.");
    cost = { providerCostUsd: providerCost.toFixed(), retailChargeCents: charge.toNumber(), pricingEffectiveFrom: "explicit-configuration" };
  } else {
    cost = calculateAiCost(modelId, at, { inputTokens: resolvedInputTokens, outputTokens: resolvedOutputTokens, cachedInputTokens });
  }

  return {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    estimatedCostCents: cost.retailChargeCents,
    providerCostUsd: cost.providerCostUsd,
    pricingEffectiveFrom: cost.pricingEffectiveFrom,
    usageKind: inputTokens != null && outputTokens != null ? "reported" : "estimated",
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
    outputTokens: maxOutputTokens ?? resolveHostedAiMaxOutputTokens(env)
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
  return configured !== null && configured > 0 && configured <= 16384
    ? Math.floor(configured)
    : DEFAULT_MAX_OUTPUT_TOKENS;
}
