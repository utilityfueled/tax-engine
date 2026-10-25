import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { taxProviderModelEvalFixtures, type ProviderEvalFixture } from "./provider-eval-fixtures";

/** Documented model IDs as of 2026-10-25; an arbitrary alias suffix is not proof of identity.
 * Sources: developers.openai.com/api/docs/models/{gpt-6-luna,gpt-6.1-sol,gpt-5-mini}
 * and ai.google.dev/gemini-api/docs/models/{gemini-3.8-flash,gemini-3-flash-preview}.
 * This mapping establishes neither account availability nor a signed provider receipt.
 */
export const PROVIDER_EVAL_MODEL_IDENTITIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "gpt-6-luna": Object.freeze(["gpt-6-luna"]),
  "gpt-6.1-sol": Object.freeze(["gpt-6.1-sol"]),
  "gpt-5-mini": Object.freeze(["gpt-5-mini", "gpt-5-mini-2025-08-07"]),
  "gemini-3.8-flash": Object.freeze(["gemini-3.8-flash"]),
  "gemini-3-flash-preview": Object.freeze(["gemini-3-flash-preview"]),
});
export function matchesProviderEvalModel(requested: string, reported: string | null | undefined): boolean {
  return typeof reported === "string" && PROVIDER_EVAL_MODEL_IDENTITIES[requested]?.includes(reported) === true;
}

/** Browser-compatible content identity; this is not a signature or live-service authorization. */
export function providerEvalDigest(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Evaluation digest requires JSON content.");
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}
function fixtureContent({ review: _review, ...content }: ProviderEvalFixture) { return content; }
export function providerEvalFixtureDigest(fixture: ProviderEvalFixture): string {
  return providerEvalDigest(fixtureContent(fixture));
}
export function providerEvalCorpusDigest(): string {
  return providerEvalDigest(taxProviderModelEvalFixtures.map(fixtureContent));
}
export function hasCurrentProviderEvalProvenance(
  evidence: { planDigest: string; corpusDigest: string; fixtureDigest?: string } | undefined,
  fixture: ProviderEvalFixture,
  currentCorpusDigest = providerEvalCorpusDigest(),
): boolean {
  const current = taxProviderModelEvalFixtures.find(item => item.id === fixture.id);
  if (!evidence || !current || !/^[a-f0-9]{64}$/.test(evidence.planDigest)) return false;
  const currentFixtureDigest = providerEvalFixtureDigest(current);
  return evidence.corpusDigest === currentCorpusDigest
    && evidence.fixtureDigest === currentFixtureDigest
    && providerEvalFixtureDigest(fixture) === currentFixtureDigest;
}
