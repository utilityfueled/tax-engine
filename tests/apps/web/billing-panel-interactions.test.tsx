// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPagePanel } from "../../../apps/web/src/components/billing-page-panel";

let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn();
const base = { currentPlanId: null, currentStatus: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, aiBudget: null, aiTopUpPriceCents: 1500, aiTopUpCreditCents: 1000, aiTopUpEnabled: true, aiHelperAvailable: false };
const budget = { ownerId: "synthetic", cycleKey: "test", includedBudgetCents: 1000, includedUsedCents: 0, includedRemainingCents: 1000, purchasedBudgetCents: 0, purchasedUsedCents: 0, purchasedRemainingCents: 0, totalRemainingCents: 1000 };
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing rendered control"); return value; }
function button(label: string) { return required([...container.querySelectorAll("button")].find(element => element.textContent === label)); }
async function click(label: string) { await act(async () => button(label).click()); }
async function render(props: Partial<ComponentProps<typeof BillingPagePanel>> & { aiHelperAvailable?: boolean } = {}) { await act(async () => root.render(<BillingPagePanel {...base} {...props} />)); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); fetchMock.mockResolvedValue(Response.json({ error: "Service unavailable" }, { status: 503 })); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("billing actions and exact displayed credit", () => {
  it("does not offer extra credits or claim live AI access before qualification", async () => {
    await render({ currentPlanId: "starter", currentStatus: "active", aiBudget: budget });
    expect(container.textContent).toContain("AI helper is unavailable while qualification is pending");
    expect(container.textContent).not.toContain("Paid AI helper with workspace-aware explanations");
    expect([...container.querySelectorAll("button")].some(element => element.textContent?.startsWith("Buy "))).toBe(false);
  });
  it("shows exact large and zero credit balances without binary floating-point division", async () => {
    await render({ currentPlanId: "starter", currentStatus: "active", aiBudget: { ...budget, totalRemainingCents: 9007199254740893, purchasedRemainingCents: 0 }, aiHelperAvailable: true });
    expect(container.textContent).toContain("$90071992547408.93"); expect(container.textContent).toContain("$0.00");
  });
  it("offers plans to an unsubscribed account while keeping the portal disabled", async () => {
    await render(); expect(button("Choose Starter").disabled).toBe(false); expect(button("Choose Plus").disabled).toBe(false); expect(button("Manage Billing").disabled).toBe(true); expect(container.textContent).toContain("not subscribed");
  });
  it.each(["starter", "plus"] as const)("posts an explicit %s checkout request and blocks duplicate clicks while pending", async plan => {
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise); await render();
    await click(plan === "starter" ? "Choose Starter" : "Choose Plus");
    expect([...container.querySelectorAll("button")].every(element => element.disabled)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]; expect(url).toBe("/api/billing/checkout");
    expect(JSON.parse(init.body)).toEqual({ planId: plan, successUrl: `${window.location.origin}/billing?checkout=success`, cancelUrl: `${window.location.origin}/billing?checkout=cancel` });
    await act(async () => pending.resolve(Response.json({ error: "Try again later" }, { status: 503 })));
    expect(container.textContent).toContain("Try again later"); expect(button("Choose Starter").disabled).toBe(false);
  });
  it.each([{ error: "Payment service unavailable" }, { error: " " }, { error: 42 }, null])("contains malformed checkout error payload %j", async payload => {
    fetchMock.mockResolvedValue(Response.json(payload, { status: 503 })); await render(); await click("Choose Starter");
    expect(container.textContent).toContain(payload?.error === "Payment service unavailable" ? "Payment service unavailable" : "Could not open Stripe Checkout.");
    expect(button("Choose Starter").disabled).toBe(false);
  });
  it.each([new Error("Network unavailable"), "rejected"])("recovers from checkout transport failure %s", async error => {
    fetchMock.mockRejectedValue(error); await render(); await click("Choose Starter");
    expect(container.textContent).toContain(error instanceof Error ? "Network unavailable" : "Could not open Stripe Checkout.");
  });
  it("handles an unreadable checkout response", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 502 })); await render(); await click("Choose Starter"); expect(container.textContent).toContain("Could not open Stripe Checkout.");
  });
  it.each([true, false])("shows renewal state and disables new subscriptions for an active account (%s)", async cancelAtPeriodEnd => {
    await render({ currentPlanId: "plus", currentStatus: "active", cancelAtPeriodEnd, currentPeriodEnd: "2026-12-01T12:00:00Z", aiBudget: budget, aiHelperAvailable: true });
    expect(container.textContent).toContain(cancelAtPeriodEnd ? "ends " : "renews ");
    const choices = [...container.querySelectorAll("button")].filter(element => element.textContent === "Manage Existing Subscription"); expect(choices).toHaveLength(2); expect(choices.every(element => element.disabled)).toBe(true); expect(button("Manage Billing").disabled).toBe(false);
  });
  it("allows choosing a plan after cancellation while retaining portal access", async () => {
    await render({ currentPlanId: "starter", currentStatus: "canceled" }); expect(button("Choose Starter").disabled).toBe(false); expect(button("Manage Billing").disabled).toBe(false);
  });
  it("bounds portal retries and restores its button after invalid JSON", async () => {
    const pending = deferred<Response>(); fetchMock.mockReturnValue(pending.promise); await render({ currentPlanId: "starter", currentStatus: "active" }); await click("Manage Billing"); expect(button("Opening Portal...").disabled).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/billing/portal"); expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ returnUrl: `${window.location.origin}/billing` });
    await act(async () => pending.resolve(new Response("not json", { status: 502 }))); expect(container.textContent).toContain("Could not open the Stripe billing portal."); expect(button("Manage Billing").disabled).toBe(false);
  });
  it("posts a qualified extra-credit checkout without changing the displayed balance on failure", async () => {
    await render({ currentPlanId: "starter", currentStatus: "active", aiBudget: budget, aiHelperAvailable: true }); await click("Buy $10.00 AI credit pack for $15.00");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/billing/ai-credits/checkout"); expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ successUrl: `${window.location.origin}/billing?checkout=ai-top-up-success`, cancelUrl: `${window.location.origin}/billing?checkout=ai-top-up-cancel` });
    expect(container.textContent).toContain("Service unavailable"); expect(container.textContent).toContain("$10.00"); expect(button("Buy $10.00 AI credit pack for $15.00").disabled).toBe(false);
  });
  it("requires a managed subscription even when extra-credit sales are qualified", async () => {
    await render({ currentPlanId: "starter", currentStatus: "canceled", aiBudget: budget, aiHelperAvailable: true }); expect(button("Buy $10.00 AI credit pack for $15.00").disabled).toBe(true);
  });
});
