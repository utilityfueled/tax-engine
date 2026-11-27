import { z } from "zod";
import type { AiTokenUsage } from "./ai-pricing";

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const promptBlockReason = z.enum(["BLOCK_REASON_UNSPECIFIED", "SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"]);

export const geminiTextResponseSchema = z.object({
  modelVersion: z.unknown().optional(),
  candidates: z.array(z.object({
    finishReason: z.string(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional(),
  })).max(1).optional(),
  promptFeedback: z.object({ blockReason: promptBlockReason.optional() }).optional(),
  usageMetadata: z.object({
    promptTokenCount: tokenCount,
    candidatesTokenCount: tokenCount.optional(),
    cachedContentTokenCount: tokenCount.optional(),
    thoughtsTokenCount: tokenCount.optional(),
    totalTokenCount: tokenCount.optional(),
    toolUsePromptTokenCount: z.literal(0).optional(),
    serviceTier: z.enum(["unspecified", "standard"]).optional(),
  }),
});

/** Read standard-tier text usage for the hosted and evaluation transports. */
export function readGeminiTextResponse(response: z.infer<typeof geminiTextResponseSchema>) {
  const candidate = response.candidates?.[0];
  const reason = response.promptFeedback?.blockReason;
  const promptBlocked = reason !== undefined && reason !== "BLOCK_REASON_UNSPECIFIED";
  if ((candidate && promptBlocked) || (!candidate && !promptBlocked)) throw new Error("Gemini returned inconsistent candidate feedback.");

  const { promptTokenCount, candidatesTokenCount, cachedContentTokenCount = 0, thoughtsTokenCount = 0, totalTokenCount } = response.usageMetadata;
  if (candidatesTokenCount === undefined && (!promptBlocked || totalTokenCount === undefined)) {
    throw new Error("Gemini did not report a candidate token count or a total for a blocked prompt.");
  }
  const candidateTokens = candidatesTokenCount ?? 0;
  if (promptBlocked && candidateTokens !== 0) throw new Error("Gemini reported candidate tokens for a blocked prompt.");

  const outputTokens = BigInt(candidateTokens) + BigInt(thoughtsTokenCount);
  if (outputTokens > BigInt(Number.MAX_SAFE_INTEGER) || cachedContentTokenCount > promptTokenCount) {
    throw new Error("Gemini returned invalid token counts.");
  }
  // Cached tokens are included in the prompt count. This text request never uses tools.
  if (totalTokenCount !== undefined && BigInt(totalTokenCount) !== BigInt(promptTokenCount) + outputTokens) {
    throw new Error("Gemini returned an inconsistent total token count.");
  }

  const outputText = candidate?.content?.parts.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
  const usage: AiTokenUsage = { inputTokens: promptTokenCount, outputTokens: Number(outputTokens), cachedInputTokens: cachedContentTokenCount };
  return { completed: candidate?.finishReason === "STOP" && Boolean(outputText.trim()), outputText, usage };
}
