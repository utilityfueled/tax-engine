import { NextResponse } from "next/server";
import { resolveHostedWorkspaceActor } from "../../../../lib/hosted-auth";
import {
  getHostedEntitlementByOwnerId,
  upsertHostedReminderSettings
} from "../../../../lib/hosted-billing-db";
import { safeParseJsonBody } from "../../../../lib/safe-body-parser";

function isReminderPayload(value: unknown): value is {
  quarterlyEstimateEmail: boolean;
  filingDeadlineEmail: boolean;
  productUpdatesEmail: boolean;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.quarterlyEstimateEmail === "boolean"
    && typeof candidate.filingDeadlineEmail === "boolean"
    && typeof candidate.productUpdatesEmail === "boolean";
}

export async function POST(request: Request) {
  const actor = await resolveHostedWorkspaceActor({
    requestHeaders: request.headers
  });

  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required for reminder settings." },
      { status: 401 }
    );
  }

  const { entitlement } = await getHostedEntitlementByOwnerId(process.env, actor.id);

  if (!entitlement.reminderAutomationAccess) {
    return NextResponse.json(
      { error: "Plus is required to configure reminder automation." },
      { status: 403 }
    );
  }

  const parsed = await safeParseJsonBody(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  if (!isReminderPayload(parsed.data)) {
    return NextResponse.json(
      { error: "Invalid reminder settings payload." },
      { status: 400 }
    );
  }

  const record = await upsertHostedReminderSettings(process.env, actor.id, parsed.data);

  return NextResponse.json({ reminderSettings: record });
}
