import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveDeploymentMode } from "../../../../lib/deployment-mode";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import { containsUnsafeDirectIdentifier } from "../../../../lib/provider-request-privacy";
import {
  checkRateLimitForEnvironment,
  rateLimitUnavailableResponse,
  rateLimitTiers,
  resolveClientIdentifier
} from "../../../../lib/rate-limit";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";
import type { ProviderInterviewAssistResponse } from "../../../../lib/provider-interview-request";
import { providerRateLimitStore } from "../shared-rate-limit";

const interviewSummaryInput = z.object({
  task: z.literal("interview-assist"),
  requestId: z.string(),
  requestedAt: z.string(),
  interview: z.object({
    questions: z.array(z.object({
      id: z.string(),
      prompt: z.string(),
      status: z.enum(["pending", "answered"]),
    })),
  }),
  redactions: z.array(z.unknown()),
  replacementCount: z.number(),
});

function buildSummary(request: z.infer<typeof interviewSummaryInput>): ProviderInterviewAssistResponse {
  const pendingQuestions = request.interview.questions.filter((question) => question.status === "pending");
  const nextQuestion = pendingQuestions[0] ?? null;

  return {
    requestId: request.requestId,
    provider: "mock-local",
    recommendedNextQuestionId: nextQuestion?.id ?? null,
    pendingQuestionCount: pendingQuestions.length,
    summary: pendingQuestions.length === 0
      ? "All queued interview confirmations are complete."
      : `Need follow-up on ${pendingQuestions.length} interview confirmation(s). Start with: ${nextQuestion?.prompt ?? "review the queue"}`,
    redactionCount: request.redactions.length
  };
}

export async function POST(request: Request) {
  const env = process.env;
  const clientId = resolveClientIdentifier(request.headers);
  const rateCheck = await checkRateLimitForEnvironment(
    providerRateLimitStore,
    `provider:${clientId}`,
    rateLimitTiers.provider,
    env
  );

  if (rateCheck.unavailable) return rateLimitUnavailableResponse();

  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(
      (rateCheck.retryAfterMs ?? rateLimitTiers.provider.windowMs) / 1000
    );

    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) }
      }
    );
  }

  if (resolveDeploymentMode(env) === "hosted") {
    const actor = await resolveHostedWorkspaceActor({
      env,
      requestHeaders: request.headers
    });

    if (!actor) {
      return NextResponse.json(
        { error: "Authentication required for provider requests in hosted mode." },
        { status: 401 }
      );
    }
  }

  const parsed = await safeParseJsonBody(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const input = interviewSummaryInput.safeParse(parsed.data);
  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid provider interview request." },
      { status: 400 }
    );
  }

  if (containsUnsafeDirectIdentifier(parsed.data)) {
    return NextResponse.json(
      { error: "Provider interview request contains unredacted direct identifiers." },
      { status: 400 }
    );
  }

  return NextResponse.json(buildSummary(input.data));
}
