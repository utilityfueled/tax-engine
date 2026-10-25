import Decimal from "decimal.js";

// Exact ledger costs must not inherit the engine's/default significant-digit rounding.
const Money = Decimal.clone({ precision: 80 });

export interface AiPrice {
  model: string;
  effectiveFrom: string;
  retrievedAt: string;
  source: string;
  input: string;
  output: string;
  cachedInput: string;
  cacheWrite30m?: string;
  cacheWrite12h?: string;
  storagePerMillionTokenHours?: string;
  longContextThreshold?: number;
  regionalUplift: string;
}
const openai = "https://developers.openai.com/api/docs/pricing";
const google = "https://ai.google.dev/gemini-api/docs/pricing";
export const AI_PRICES: readonly AiPrice[] = Object.freeze([
  { model: "gpt-5.2", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: "https://developers.openai.com/api/docs/models/gpt-5.2",
    input: "1.75", output: "14", cachedInput: "0.175", regionalUplift: "1" },
  { model: "gemini-3-flash-preview", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: "https://ai.google.dev/gemini-api/docs/pricing.md",
    input: "0.50", output: "3", cachedInput: "0.05", storagePerMillionTokenHours: "1", regionalUplift: "1" },
  { model: "gpt-6-luna", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: openai,
    input: "0.10", output: "0.50", cachedInput: "0.01", cacheWrite30m: "0.125", cacheWrite12h: "0.25", longContextThreshold: 272000, regionalUplift: "1.10" },
  { model: "gpt-6.1-sol", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: openai,
    input: "2", output: "10", cachedInput: "0.10", cacheWrite30m: "2.50", cacheWrite12h: "5", longContextThreshold: 272000, regionalUplift: "1.10" },
  { model: "gemini-3.8-flash", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: google,
    input: "0.75", output: "3.75", cachedInput: "0.075", storagePerMillionTokenHours: "0.50", regionalUplift: "1" },
  { model: "gemini-3.8-flash", effectiveFrom: "2027-01-01", retrievedAt: "2026-10-24", source: google,
    input: "1.50", output: "7.50", cachedInput: "0.15", storagePerMillionTokenHours: "1", regionalUplift: "1" },
  { model: "gpt-5-mini", effectiveFrom: "2026-10-24", retrievedAt: "2026-10-24", source: "https://developers.openai.com/api/docs/models/gpt-5-mini",
    input: "0.25", output: "2", cachedInput: "0.025", regionalUplift: "1" },
].map(price => Object.freeze(price)));

export function getAiPrice(model: string, at: string): AiPrice {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(at) || !Number.isFinite(Date.parse(at))) throw new Error("Invalid pricing date.");
  const utcDay = new Date(at).toISOString().slice(0, 10);
  const price = AI_PRICES.filter(entry => entry.model === model && entry.effectiveFrom <= utcDay)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!price) throw new Error(`No verified pricing for ${model} at ${at}.`);
  return price;
}

export interface AiTokenUsage {
  inputTokens: number;
  /** Total billed output, including reasoning. Do not add reasoning a second time. */
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWrite30mTokens?: number;
  cacheWrite12hTokens?: number;
  cachedTokenHours?: string;
  regionalProcessing?: boolean;
}

/** Standard text pricing only. Tools, images and other service tiers are not enabled. */
export function calculateAiCost(model: string, at: string, usage: AiTokenUsage) {
  const price = getAiPrice(model, at);
  if (usage.regionalProcessing && price.source === google) throw new Error("Regional Google pricing is not configured.");
  const tokenCounts = [usage.inputTokens, usage.outputTokens, usage.cachedInputTokens ?? 0, usage.cacheWrite30mTokens ?? 0, usage.cacheWrite12hTokens ?? 0];
  if (tokenCounts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Token usage must be nonnegative safe integers.");
  const [input, output, cached, write30m, write12h] = tokenCounts;
  if (cached + write30m + write12h > input) throw new Error("Cache token counts exceed total input.");
  if ((write30m && !price.cacheWrite30m) || (write12h && !price.cacheWrite12h)) throw new Error("Unsupported cache-write price.");
  const storage = new Money(usage.cachedTokenHours ?? "0");
  if (!storage.isFinite() || storage.isNegative() || (!storage.isZero() && !price.storagePerMillionTokenHours)) throw new Error("Unsupported cache storage usage.");
  const long = price.longContextThreshold !== undefined && input > price.longContextThreshold;
  const inputCost = new Money(input - cached - write30m - write12h).times(price.input)
    .plus(new Money(cached).times(price.cachedInput))
    .plus(new Money(write30m).times(price.cacheWrite30m ?? "0"))
    .plus(new Money(write12h).times(price.cacheWrite12h ?? "0"))
    .times(long ? "2" : "1");
  const outputCost = new Money(output).times(price.output).times(long ? "1.5" : "1");
  const providerCostUsd = inputCost.plus(outputCost)
    .plus(storage.times(price.storagePerMillionTokenHours ?? "0"))
    .div("1000000").times(usage.regionalProcessing ? price.regionalUplift : "1");
  const retailCharge = Money.max("1", providerCostUsd.times("100").ceil());
  if (retailCharge.gt(Number.MAX_SAFE_INTEGER)) throw new Error("Charge exceeds the supported ledger range.");
  return { providerCostUsd: providerCostUsd.toFixed(), retailChargeCents: retailCharge.toNumber(), pricingEffectiveFrom: price.effectiveFrom };
}
