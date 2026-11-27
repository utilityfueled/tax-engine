import { z } from "zod";

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const openAiUsageSchema = z.object({
  input_tokens: tokenCount,
  output_tokens: tokenCount,
  total_tokens: tokenCount.optional(),
  input_tokens_details: z.object({
    cached_tokens: tokenCount.optional(),
    cache_write_tokens: tokenCount.optional(),
    cache_write_tokens_details: z.object({
      ttl_30m_tokens: tokenCount,
      ttl_12h_tokens: tokenCount,
    }).optional(),
  }).optional(),
  output_tokens_details: z.object({
    reasoning_tokens: tokenCount.optional(),
  }).optional(),
}).refine(usage => (usage.output_tokens_details?.reasoning_tokens ?? 0) <= usage.output_tokens, {
  message: "OpenAI reasoning tokens exceed the reported output token count.",
  path: ["output_tokens_details", "reasoning_tokens"],
});
