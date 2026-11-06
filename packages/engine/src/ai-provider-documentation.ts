/** Public documentation refreshed 2026-10-25; never an authenticated account probe. */
export interface AiProviderDocumentation {
  model: string;
  provider: "openai" | "google";
  retrievedAt: string;
  modelSource: string;
  effortSource: string;
  lifecycleSource: string;
  endpoint: "responses" | "generateContent";
  structuredOutputsDocumented: true;
  configuredEfforts: readonly string[];
  releaseChannel: "stable" | "preview";
  shutdownDate: string | null;
  accountAvailability: "unverified";
}
const openai = "https://developers.openai.com/api/docs/";
const google = "https://ai.google.dev/gemini-api/docs/";
const documentedModels: Omit<AiProviderDocumentation, "retrievedAt" | "structuredOutputsDocumented" | "accountAvailability">[] = [
  { model: "gpt-6-luna", provider: "openai", modelSource: `${openai}models/gpt-6-luna`, effortSource: `${openai}models/gpt-6-luna`, lifecycleSource: `${openai}deprecations`,
    endpoint: "responses", configuredEfforts: ["high"], releaseChannel: "stable", shutdownDate: null },
  { model: "gpt-6.1-sol", provider: "openai", modelSource: `${openai}models/gpt-6.1-sol`, effortSource: `${openai}models/gpt-6.1-sol`, lifecycleSource: `${openai}deprecations`,
    endpoint: "responses", configuredEfforts: ["low", "high"], releaseChannel: "stable", shutdownDate: null },
  { model: "gpt-5-mini", provider: "openai", modelSource: `${openai}models/gpt-5-mini`, effortSource: `${openai}changelog`, lifecycleSource: `${openai}deprecations`,
    endpoint: "responses", configuredEfforts: ["minimal"], releaseChannel: "stable", shutdownDate: "2026-12-11" },
  { model: "gemini-3.8-flash", provider: "google", modelSource: `${google}models/gemini-3.8-flash`, effortSource: `${google}thinking`, lifecycleSource: `${google}deprecations`,
    endpoint: "generateContent", configuredEfforts: ["high"], releaseChannel: "stable", shutdownDate: null },
  { model: "gemini-3-flash-preview", provider: "google", modelSource: `${google}models/gemini-3-flash-preview`, effortSource: `${google}thinking`, lifecycleSource: `${google}deprecations`,
    endpoint: "generateContent", configuredEfforts: ["high"], releaseChannel: "preview", shutdownDate: null },
];
export const AI_PROVIDER_DOCUMENTATION: readonly AiProviderDocumentation[] = Object.freeze(documentedModels.map(value => Object.freeze({
  ...value, configuredEfforts: Object.freeze(value.configuredEfforts), retrievedAt: "2026-10-25", structuredOutputsDocumented: true, accountAvailability: "unverified",
})));

export function publicModelLifecycle(model: string, at: string) {
  const fact = AI_PROVIDER_DOCUMENTATION.find(item => item.model === model);
  if (!fact) throw new Error(`No current public provider documentation for ${model}.`);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(at) || !Number.isFinite(Date.parse(at))) throw new Error("Invalid provider lifecycle date.");
  const day = new Date(at).toISOString().slice(0, 10);
  // No shutdown hour is published. Stop conservatively at the start of that UTC date.
  const status = fact.shutdownDate === null ? "no-shutdown-announced"
    : day >= fact.shutdownDate ? "shutdown" : "scheduled-shutdown";
  return { status, shutdownDate: fact.shutdownDate, source: fact.lifecycleSource, retrievedAt: fact.retrievedAt };
}
