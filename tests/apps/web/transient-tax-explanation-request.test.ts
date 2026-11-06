// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { requestTaxCalculationExplanation } from "@/lib/transient-tax-explanation-request";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { writeWorkspaceAiOptOut } from "@/lib/workspace-ai-preferences";
import { simpleW2Fixture } from "../../fixtures/simple-w2";
const workspace = () => { const value = createWorkspaceRecord("private-calculation-source"); value.returnSummary.targetTaxYear = 2025; return value; };
beforeEach(() => localStorage.clear());
it("sends no private facts while local-only preference is active even if a caller requests AI", async () => {
  const fetchFn = vi.fn();
  const result = await requestTaxCalculationExplanation(workspace(), "Explain AGI", simpleW2Fixture, { confirmed: true, optedOut: false, fetchFn });
  expect(result.response.provider).toBe("mock-local"); expect(fetchFn).not.toHaveBeenCalled();
});
it("uses a distinct same-origin envelope after explicit opt-in, carries cancellation and leaves the AI packet free of input fields", async () => {
  const value = workspace(); writeWorkspaceAiOptOut(value.id, false);
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ provider: "mock-local" })), controller = new AbortController();
  const result = await requestTaxCalculationExplanation(value, "Explain AGI", simpleW2Fixture, { confirmed: true, fetchFn, signal: controller.signal });
  expect(fetchFn.mock.calls[0][0]).toBe("/api/workspace/tax-explanation"); expect(fetchFn.mock.calls[0][1].signal).toBe(controller.signal);
  const body = JSON.parse(fetchFn.mock.calls[0][1].body);
  expect(body).toMatchObject({ version: 1, confirmed: true, taxYear: 2025, taxInput: { taxpayer: { primary: { ssn: "123-45-6789" } } } });
  expect(body.providerRequest).not.toHaveProperty("taxInput"); expect(JSON.stringify(result.request)).not.toContain("123-45-6789");
  expect(body.providerRequest.requestId).not.toContain(value.id);
});
it("rejects year conflicts and surfaces private route errors without retrying", async () => {
  const value = workspace(); writeWorkspaceAiOptOut(value.id, false);
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ error: "Confirm taxpayer facts." }, { status: 400 }));
  const otherYear = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } };
  await expect(requestTaxCalculationExplanation(value, "Explain AGI", otherYear, { confirmed: true, fetchFn })).rejects.toThrow(/matching return year/);
  expect(fetchFn).not.toHaveBeenCalled();
  await expect(requestTaxCalculationExplanation(value, "Explain AGI", simpleW2Fixture, { confirmed: true, fetchFn })).rejects.toMatchObject({ status: 400, message: "Confirm taxpayer facts." });
  expect(fetchFn).toHaveBeenCalledOnce();
});
it("uses the confirmed input year for a guided-only return without a document-derived year", async () => {
  const value = workspace(); value.returnSummary.targetTaxYear = null; writeWorkspaceAiOptOut(value.id, false);
  const fetchFn = vi.fn().mockResolvedValue(Response.json({ provider: "mock-local" }));
  await requestTaxCalculationExplanation(value, "Explain AGI", simpleW2Fixture, { confirmed: true, fetchFn });
  const body = JSON.parse(fetchFn.mock.calls[0][1].body);
  expect(body.taxYear).toBe(2025); expect(body.providerRequest.workspace.returnSummary.targetTaxYear).toBe(2025);
  expect(value.returnSummary.targetTaxYear).toBeNull();
});
