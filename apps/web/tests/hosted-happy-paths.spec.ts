import { fillRequiredTaxpayerFacts } from "./guided-fixtures";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import Stripe from "stripe";
import { expect, test } from "@playwright/test";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER_MONTHLY?.trim() ?? "";
const plusPriceId = process.env.STRIPE_PRICE_ID_PLUS_MONTHLY?.trim() ?? "";
const aiTopUpPriceId = process.env.STRIPE_PRICE_ID_AI_HELPER_TOP_UP?.trim() ?? "";
const runRealStripeWebhookSmoke = process.env.TAX_ENGINE_REAL_STRIPE_WEBHOOK_SMOKE === "true";

const hasHostedE2eConfig = Boolean(
  stripeSecretKey
  && stripeWebhookSecret
  && databaseUrl
  && starterPriceId
  && plusPriceId
);
const hasHostedAiTopUpE2eConfig = hasHostedE2eConfig && Boolean(aiTopUpPriceId);

const normalizedDatabaseUrl = normalizeDatabaseUrl(databaseUrl);
const stripe = hasHostedE2eConfig
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2026-09-30.endive"
    })
  : null;
const pool = hasHostedE2eConfig
  ? new Pool({
      connectionString: normalizedDatabaseUrl,
      ssl: resolvePoolSsl(normalizedDatabaseUrl)
    })
  : null;

test.describe.serial("Hosted app happy paths", () => {
  test.skip(!hasHostedE2eConfig, "Hosted E2E requires Stripe and database env configuration.");
  test.setTimeout(180_000);

  test.afterAll(async () => {
    await pool?.end();
  });

  test("starter signup, checkout smoke, webhook activation, and hosted return flow all work", async ({ page }) => {
    const account = createHostedAccountFixture("starter");

    await signUpHostedAccount(page, account);
    const ownerId = await waitForHostedOwnerId(account.email);

    const checkout = await openStripeCheckout(page, "starter");
    await assertStripeCheckoutPage(page, {
      planName: "Starter",
      accountEmail: account.email
    });
    await completeStripeCheckoutWithSandboxCard(page);
    await expect(page).toHaveURL(/\/billing\?checkout=success/i, {
      timeout: 90_000
    });
    expect(checkout.planId).toBe("starter");
    expect(checkout.checkoutUrl).toContain("checkout.stripe.com");
    expect(checkout.sessionId).toMatch(/^cs_/i);

    const checkoutSession = await stripe!.checkout.sessions.retrieve(checkout.sessionId!);
    expect(checkoutSession.status).toBe("complete");
    expect(checkoutSession.metadata?.hostedOwnerId).toBe(ownerId);
    expect(checkoutSession.metadata?.planId).toBe("starter");
    expect(checkoutSession.customer).toBeTruthy();
    expect(checkoutSession.subscription).toBeTruthy();

    await postHostedStripeLifecycleWebhooks(page, {
      ownerId,
      planId: "starter",
      customerId: String(checkoutSession.customer),
      sessionId: checkout.sessionId!,
      subscriptionId: String(checkoutSession.subscription)
    });

    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: /hosted plans/i })).toBeVisible();
    await expect(
      page.locator(".summary-stat").filter({ hasText: /current plan/i }).getByText(/^starter$/i)
    ).toBeVisible();
    await expect(
      page.locator(".summary-stat").filter({ hasText: /status/i }).getByText(/^active$/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /manage billing/i })).toBeEnabled();

    await page.goto("/returns/new");
    await expect.poll(() => getWorkspaceIdFromUrl(page.url())).not.toBe("new");
    const workspaceId = getWorkspaceIdFromUrl(page.url());
    await page.goto(`/returns/${workspaceId}`);

    await completeHostedGuidedReturnSmoke(page);

    await page.goto("/");
    await expect(
      page.getByRole("listitem").filter({ hasText: `Tax Return ${workspaceId}` })
    ).toBeVisible();

    const workspaceShell = await waitForHostedWorkspaceShell(ownerId, workspaceId);
    expect(workspaceShell).toMatch(/"answerText":\s*null/);
    expect(workspaceShell).not.toContain("123-45-6789");
    expect(workspaceShell).not.toContain("Ari");
    expect(workspaceShell).not.toContain("Example");
  });

  test("managed billing opens the Stripe customer portal for an active hosted subscriber", async ({ page }) => {
    const account = createHostedAccountFixture("starter");

    await signUpHostedAccount(page, account);
    const ownerId = await waitForHostedOwnerId(account.email);

    const checkout = await openStripeCheckout(page, "starter");
    await assertStripeCheckoutPage(page, {
      planName: "Starter",
      accountEmail: account.email
    });
    await completeStripeCheckoutWithSandboxCard(page);
    await expect(page).toHaveURL(/\/billing\?checkout=success/i, {
      timeout: 90_000
    });

    const checkoutSession = await stripe!.checkout.sessions.retrieve(checkout.sessionId!);
    expect(checkoutSession.status).toBe("complete");
    expect(checkoutSession.subscription).toBeTruthy();

    await postHostedStripeLifecycleWebhooks(page, {
      ownerId,
      planId: "starter",
      customerId: String(checkoutSession.customer),
      sessionId: checkout.sessionId!,
      subscriptionId: String(checkoutSession.subscription)
    });

    await page.goto("/billing");
    await expect(page.getByRole("button", { name: /manage billing/i })).toBeEnabled();
    const portal = await page.evaluate(async () => {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/billing`
        })
      });

      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null)
      };
    }) as {
      ok: boolean;
      status: number;
      body: {
        url?: string;
        error?: string;
      } | null;
    };

    expect(portal.ok, portal.body?.error ?? `portal failed with status ${portal.status}`).toBe(true);
    expect(portal.body?.url).toMatch(/^https:\/\/billing\.stripe\.com\/p\/session\//i);

    await page.goto(portal.body!.url!);
    await expect(page).toHaveURL(/billing\.stripe\.com\/p\/session\//i, {
      timeout: 60_000
    });

    await expect(page.getByText(/starter|manage|subscription|payment method/i).first()).toBeVisible();
  });

  test("plus plan shows active hosted billing without reminder controls", async ({ page }) => {
    const account = createHostedAccountFixture("plus");

    await signUpHostedAccount(page, account);
    const ownerId = await waitForHostedOwnerId(account.email);

    await postHostedStripeLifecycleWebhooks(page, {
      ownerId,
      planId: "plus",
      customerId: createStripeLikeId("cus"),
      sessionId: createStripeLikeId("cs"),
      subscriptionId: createStripeLikeId("sub")
    });

    await page.goto("/billing");
    await expect(
      page.locator(".summary-stat").filter({ hasText: /current plan/i }).getByText(/^plus$/i)
    ).toBeVisible();
    await expect(
      page.locator(".summary-stat").filter({ hasText: /status/i }).getByText(/^active$/i)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /manage billing/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /save reminder settings/i })).toHaveCount(0);
  });

  test("active hosted subscribers can buy an AI helper credit pack", async ({ page }) => {
    test.skip(!hasHostedAiTopUpE2eConfig, "AI helper top-up E2E requires STRIPE_PRICE_ID_AI_HELPER_TOP_UP.");

    const account = createHostedAccountFixture("starter");

    await signUpHostedAccount(page, account);
    const ownerId = await waitForHostedOwnerId(account.email);

    const subscriptionCheckout = await openStripeCheckout(page, "starter");
    await assertStripeCheckoutPage(page, {
      planName: "Starter",
      accountEmail: account.email
    });
    await completeStripeCheckoutWithSandboxCard(page);
    await expect(page).toHaveURL(/\/billing\?checkout=success/i, {
      timeout: 90_000
    });

    const subscriptionSession = await stripe!.checkout.sessions.retrieve(subscriptionCheckout.sessionId!);
    expect(subscriptionSession.status).toBe("complete");
    expect(subscriptionSession.customer).toBeTruthy();
    expect(subscriptionSession.subscription).toBeTruthy();

    await postHostedStripeLifecycleWebhooks(page, {
      ownerId,
      planId: "starter",
      customerId: String(subscriptionSession.customer),
      sessionId: subscriptionCheckout.sessionId!,
      subscriptionId: String(subscriptionSession.subscription)
    });

    await page.goto("/billing");
    const topUpButton = page.getByRole("button", { name: /buy .* ai credit pack/i });
    await expect(topUpButton).toBeEnabled();
    await topUpButton.click();
    await page.waitForURL(/checkout\.stripe\.com/i, {
      timeout: 60_000
    });
    await expect(page.getByText(/\$15\.00/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /pay/i })).toBeVisible();

    await completeStripePaymentWithSandboxCard(page);
    await expect(page).toHaveURL(/\/billing\?checkout=ai-top-up-success/i, {
      timeout: 90_000
    });

    const paymentSessions = await stripe!.checkout.sessions.list({
      customer: String(subscriptionSession.customer),
      limit: 10
    });
    const topUpSession = paymentSessions.data.find((session) =>
      session.mode === "payment"
      && session.metadata?.purchaseKind === "ai-credit-pack"
    );

    expect(topUpSession).toBeTruthy();
    expect(topUpSession?.status).toBe("complete");
    expect(topUpSession?.amount_total).toBe(1500);

    await postHostedAiCreditWebhook(page, {
      ownerId,
      customerId: String(subscriptionSession.customer),
      sessionId: String(topUpSession!.id),
      amountPaidCents: 1500,
      creditedBudgetCents: 1000
    });

    const aiPurchase = await waitForHostedAiCreditPurchase(String(topUpSession!.id));
    expect(aiPurchase?.amount_paid_cents).toBe(1500);
    expect(aiPurchase?.credited_budget_cents).toBe(1000);

    await page.goto("/billing");
    await expect(
      page.locator(".summary-stat").filter({ hasText: /top-up remaining/i }).getByText(/^\$10\.00$/i)
    ).toBeVisible();
    await expect(
      page.locator(".summary-stat").filter({ hasText: /total remaining/i }).getByText(/^\$20\.00$/i)
    ).toBeVisible();
  });

  test("real Stripe-delivered webhooks activate a hosted subscription after checkout success", async ({ page }) => {
    test.skip(!runRealStripeWebhookSmoke, "Enable TAX_ENGINE_REAL_STRIPE_WEBHOOK_SMOKE=true to verify Stripe-delivered webhooks.");

    const account = createHostedAccountFixture("starter");

    await signUpHostedAccount(page, account);
    const ownerId = await waitForHostedOwnerId(account.email);

    const checkout = await openStripeCheckout(page, "starter");
    await assertStripeCheckoutPage(page, {
      planName: "Starter",
      accountEmail: account.email
    });
    await completeStripeCheckoutWithSandboxCard(page);
    await expect(page).toHaveURL(/\/billing\?checkout=success/i, {
      timeout: 90_000
    });

    const checkoutSession = await stripe!.checkout.sessions.retrieve(checkout.sessionId!);
    expect(checkoutSession.status).toBe("complete");
    expect(checkoutSession.customer).toBeTruthy();
    expect(checkoutSession.subscription).toBeTruthy();

    const subscription = await waitForHostedSubscriptionStatus(ownerId, "active");
    expect(subscription?.plan_id).toBe("starter");
    expect(subscription?.stripe_customer_id).toBe(String(checkoutSession.customer));
    expect(subscription?.stripe_subscription_id).toBe(String(checkoutSession.subscription));
  });
});

function createHostedAccountFixture(planName: "starter" | "plus") {
  const suffix = randomUUID().slice(0, 8);

  return {
    name: `Hosted ${planName} ${suffix}`,
    email: `hosted-${planName}-${suffix}@utilityfueled.dev`,
    password: `Hosted-${planName}-Password-2026!`
  };
}

async function signUpHostedAccount(
  page: import("@playwright/test").Page,
  account: {
    name: string;
    email: string;
    password: string;
  }
) {
  await page.goto("/account?mode=sign-up");
  await page.getByRole("textbox", { name: /^name$/i }).fill(account.name);
  await page.getByRole("textbox", { name: /^email$/i }).fill(account.email);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("checkbox", { name: /i accept the terms of service/i }).check();
  await page.getByRole("button", { name: /create hosted account/i }).click();
  await expect(page).toHaveURL(/\/billing(?:\?.*)?$/i);
}

async function openStripeCheckout(
  page: import("@playwright/test").Page,
  planId: "starter" | "plus"
) {
  await expect(
    page.getByRole("button", {
      name: planId === "starter" ? /choose starter/i : /choose plus/i
    })
  ).toBeVisible();

  const payload = await page.evaluate(async (requestedPlanId) => {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        planId: requestedPlanId,
        successUrl: `${window.location.origin}/billing?checkout=success`,
        cancelUrl: `${window.location.origin}/billing?checkout=cancel`
      })
    });

    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null)
    };
  }, planId) as {
    ok: boolean;
    status: number;
    body: {
      planId: string | null;
      sessionId: string | null;
      checkoutUrl: string | null;
      error?: string;
    } | null;
  };

  expect(payload.ok, payload.body?.error ?? `checkout failed with status ${payload.status}`).toBe(true);
  expect(payload.body?.checkoutUrl).toBeTruthy();

  await page.goto(payload.body!.checkoutUrl!);
  await page.waitForURL(/checkout\.stripe\.com/i, {
    timeout: 60_000
  });

  return payload.body!;
}

async function postHostedStripeLifecycleWebhooks(
  page: import("@playwright/test").Page,
  input: {
    ownerId: string;
    planId: "starter" | "plus";
    customerId: string;
    sessionId: string;
    subscriptionId: string;
  }
) {
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  const currentPeriodEnd = nowUnixSeconds + (30 * 24 * 60 * 60);

  const checkoutEvent = {
    id: createStripeLikeId("evt"),
    object: "event",
    type: "checkout.session.completed",
    created: nowUnixSeconds,
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        customer: input.customerId,
        subscription: input.subscriptionId,
        metadata: {
          hostedOwnerId: input.ownerId,
          planId: input.planId,
          workspaceId: ""
        }
      }
    }
  };

  const subscriptionEvent = {
    id: createStripeLikeId("evt"),
    object: "event",
    type: "customer.subscription.updated",
    created: nowUnixSeconds,
    data: {
      object: {
        id: input.subscriptionId,
        object: "subscription",
        customer: input.customerId,
        status: "active",
        cancel_at_period_end: false,
        current_period_end: currentPeriodEnd,
        metadata: {
          hostedOwnerId: input.ownerId,
          planId: input.planId,
          workspaceId: ""
        }
      }
    }
  };

  for (const payload of [checkoutEvent, subscriptionEvent]) {
    const serializedPayload = JSON.stringify(payload);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: serializedPayload,
      secret: stripeWebhookSecret,
      timestamp: nowUnixSeconds
    });

    const response = await page.request.post("/api/billing/webhook", {
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      data: serializedPayload
    });

    expect(response.ok()).toBe(true);
  }

  await expect.poll(async () => {
    const subscription = await getHostedSubscriptionByOwnerId(input.ownerId);
    return subscription?.status ?? null;
  }).toBe("active");
}

async function postHostedAiCreditWebhook(
  page: import("@playwright/test").Page,
  input: {
    ownerId: string;
    customerId: string;
    sessionId: string;
    amountPaidCents: number;
    creditedBudgetCents: number;
  }
) {
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    id: createStripeLikeId("evt"),
    object: "event",
    type: "checkout.session.completed",
    created: nowUnixSeconds,
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        customer: input.customerId,
        amount_total: input.amountPaidCents,
        currency: "usd",
        metadata: {
          purchaseKind: "ai-credit-pack",
          hostedOwnerId: input.ownerId,
          aiCreditCents: String(input.creditedBudgetCents)
        }
      }
    }
  };
  const serializedPayload = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: serializedPayload,
    secret: stripeWebhookSecret,
    timestamp: nowUnixSeconds
  });

  const response = await page.request.post("/api/billing/webhook", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature
    },
    data: serializedPayload
  });

  expect(response.ok()).toBe(true);
}

async function waitForHostedOwnerId(email: string) {
  await expect.poll(async () => {
    const result = await pool!.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1 LIMIT 1;',
      [email]
    );

    return result.rows[0]?.id ?? null;
  }).not.toBeNull();

  const result = await pool!.query<{ id: string }>(
    'SELECT id FROM "user" WHERE email = $1 LIMIT 1;',
    [email]
  );

  return String(result.rows[0]!.id);
}

async function getHostedSubscriptionByOwnerId(ownerId: string) {
  const result = await pool!.query<{
    plan_id: string | null;
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string;
  }>(
    `
      SELECT plan_id, status, stripe_customer_id, stripe_subscription_id
      FROM hosted_billing_subscriptions
      WHERE owner_id = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `,
    [ownerId]
  );

  return result.rows[0] ?? null;
}

async function waitForHostedSubscriptionStatus(ownerId: string, status: string) {
  await expect.poll(async () => {
    const subscription = await getHostedSubscriptionByOwnerId(ownerId);
    return subscription?.status ?? null;
  }, {
    timeout: 90_000
  }).toBe(status);

  return getHostedSubscriptionByOwnerId(ownerId);
}

async function waitForHostedWorkspaceShell(ownerId: string, workspaceId: string) {
  await expect.poll(async () => {
    const result = await pool!.query<{ workspace: string }>(
      `
        SELECT workspace::text AS workspace
        FROM hosted_workspace_shells
        WHERE owner_id = $1 AND workspace_id = $2
        LIMIT 1;
      `,
      [ownerId, workspaceId]
    );

    return result.rows[0]?.workspace ?? null;
  }).not.toBeNull();

  const result = await pool!.query<{ workspace: string }>(
    `
      SELECT workspace::text AS workspace
      FROM hosted_workspace_shells
      WHERE owner_id = $1 AND workspace_id = $2
      LIMIT 1;
    `,
    [ownerId, workspaceId]
  );

  return String(result.rows[0]!.workspace);
}

async function waitForHostedAiCreditPurchase(checkoutSessionId: string) {
  await expect.poll(async () => {
    const result = await pool!.query<{
      checkout_session_id: string;
      amount_paid_cents: number;
      credited_budget_cents: number;
    }>(
      `
        SELECT checkout_session_id, amount_paid_cents, credited_budget_cents
        FROM hosted_ai_credit_purchases
        WHERE checkout_session_id = $1
        LIMIT 1;
      `,
      [checkoutSessionId]
    );

    return result.rows[0] ?? null;
  }).not.toBeNull();

  const result = await pool!.query<{
    checkout_session_id: string;
    amount_paid_cents: number;
    credited_budget_cents: number;
  }>(
    `
      SELECT checkout_session_id, amount_paid_cents, credited_budget_cents
      FROM hosted_ai_credit_purchases
      WHERE checkout_session_id = $1
      LIMIT 1;
    `,
    [checkoutSessionId]
  );

  return result.rows[0] ?? null;
}

async function completeHostedGuidedReturnSmoke(
  page: import("@playwright/test").Page
) {
  const startGuidedButton = page.getByRole("button", {
    name: /start guided interview|get step-by-step help/i
  });

  if (await startGuidedButton.isVisible().catch(() => false)) {
    await startGuidedButton.click();
  }

  const segmentationHeading = page.getByText(/let's tailor your return/i);
  const personalInfoHeading = page.getByRole("heading", { name: /about you/i });

  if (!await personalInfoHeading.isVisible().catch(() => false)) {
    await expect(segmentationHeading).toBeVisible();

    const segmentationNav = page.locator(".guided-segmentation .guided-nav");

    await expect(page.getByRole("heading", { name: /upload documents/i })).toBeVisible();
    await segmentationNav.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByRole("heading", { name: /filing status/i })).toBeVisible();
    await page.getByRole("radio", { name: /single/i }).check();
    await segmentationNav.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByRole("heading", { name: /income types/i })).toBeVisible();
    await page.getByRole("checkbox", { name: /w-2 wages/i }).check();
    await segmentationNav.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByRole("heading", { name: /life events/i })).toBeVisible();
    await segmentationNav.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByRole("heading", { name: /state of residence/i })).toBeVisible();
    await segmentationNav.getByRole("button", { name: /start my return/i }).click();
  }

  await expect(personalInfoHeading).toBeVisible();
  await fillRequiredTaxpayerFacts(page);
  await page.getByRole("textbox", { name: /first name/i }).fill("Ari");
  await page.getByRole("textbox", { name: /last name/i }).fill("Example");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/w-2 #1/i)).toBeVisible();
  const interviewNav = page.locator(".guided-interview-phase .guided-nav");
  const wagesInput = page.locator('input[placeholder="0.00"]').first();
  await wagesInput.fill("72000");
  await expect(page.getByText(/live ticker/i)).toBeVisible();
  await expect(page.getByText(/estimated/i).first()).toBeVisible();

  await interviewNav.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /deductions/i })).toBeVisible();
  await page.locator('input[name="deduction-method"][value="standard"]').check();
  await interviewNav.getByRole("button", { name: /^continue$/i }).click();

  await expect(page.getByRole("heading", { name: /tax credits/i })).toBeVisible();
  await interviewNav.getByRole("button", { name: /^continue$/i }).click();

  await expect(page.getByRole("heading", { name: /payments & withholding/i })).toBeVisible();
  await interviewNav.getByRole("button", { name: /^continue$/i }).click();
  const skipThisSectionButton = page.getByRole("button", { name: /skip this section/i });
  if (await skipThisSectionButton.isVisible().catch(() => false)) {
    await skipThisSectionButton.click();
  }

  await expect(page.getByRole("heading", { name: /review & summary/i })).toBeVisible();
  await interviewNav.getByRole("button", { name: /^continue$/i }).click();

  await expect(
    page.getByText(/your return is ready to review|some guided sections still need review/i)
  ).toBeVisible();
  await page.getByRole("button", { name: /open full return/i }).click();
  await expect(page.getByRole("button", { name: /start guided interview/i })).toBeVisible();
}

async function assertStripeCheckoutPage(
  page: import("@playwright/test").Page,
  input: {
    planName: string;
    accountEmail: string;
  }
) {
  await expect(page).toHaveURL(/checkout\.stripe\.com/i);
  await expect(
    page.getByRole("heading", { name: new RegExp(`subscribe to viva la tax ${input.planName}`, "i") })
  ).toBeVisible();
  await expect(page.getByText(/billed monthly|per month/i).first()).toBeVisible();
  await expect(page.getByText(input.accountEmail, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /subscribe/i })).toBeVisible();
}

async function completeStripeCheckoutWithSandboxCard(
  page: import("@playwright/test").Page
) {
  const saveInfo = page.getByLabel(/save my information for faster checkout/i);

  if (await saveInfo.count()) {
    await saveInfo.uncheck().catch(() => {});
  }

  await page.getByLabel(/card number/i).fill("4242 4242 4242 4242");
  await page.getByLabel(/expiration/i).fill("12 / 34");
  await page.getByLabel(/^security code$|^cvc$/i).first().fill("123");

  const cardholderName = page.getByLabel(/cardholder name/i);

  if (await cardholderName.count()) {
    await cardholderName.fill("Ari Example");
  }

  const country = page.getByLabel(/country or region/i);

  if (await country.count()) {
    await country.selectOption({ label: "United States" }).catch(() => {});
  }

  const postalCode = page.getByLabel(/^zip$|zip|postal code/i).first();

  if (await postalCode.count()) {
    await postalCode.fill("10001");
  }

  await page.getByRole("button", { name: /subscribe/i }).click();
}

async function completeStripePaymentWithSandboxCard(
  page: import("@playwright/test").Page
) {
  const saveInfo = page.getByLabel(/save my information for faster checkout/i);

  if (await saveInfo.count()) {
    await saveInfo.uncheck().catch(() => {});
  }

  await page.getByLabel(/card number/i).fill("4242 4242 4242 4242");
  await page.getByLabel(/expiration/i).fill("12 / 34");
  await page.getByLabel(/^security code$|^cvc$/i).first().fill("123");

  const cardholderName = page.getByLabel(/cardholder name/i);

  if (await cardholderName.count()) {
    await cardholderName.fill("Ari Example");
  }

  const country = page.getByLabel(/country or region/i);

  if (await country.count()) {
    await country.selectOption({ label: "United States" }).catch(() => {});
  }

  const postalCode = page.getByLabel(/^zip$|zip|postal code/i).first();

  if (await postalCode.count()) {
    await postalCode.fill("10001");
  }

  await page.getByRole("button", { name: /pay/i }).click();
}

function getWorkspaceIdFromUrl(url: string) {
  return new URL(url).pathname.split("/").at(-1) ?? "";
}

function createStripeLikeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function normalizeDatabaseUrl(connectionString: string) {
  if (!connectionString) {
    return connectionString;
  }

  try {
    const parsed = new URL(connectionString);

    if (parsed.searchParams.get("sslrootcert") === "system") {
      parsed.searchParams.delete("sslrootcert");
    }

    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function resolvePoolSsl(connectionString: string) {
  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get("sslmode");
    const requiresTls = parsed.hostname.endsWith(".psdb.cloud")
      || sslMode === "require"
      || sslMode === "verify-ca"
      || sslMode === "verify-full";

    return requiresTls
      ? { rejectUnauthorized: true }
      : undefined;
  } catch {
    return undefined;
  }
}
