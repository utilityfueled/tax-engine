import { describe, expect, it, vi } from "vitest";
import { readWorkspaceAiOptOut, workspaceAiPreferenceId, writeWorkspaceAiOptOut } from "../../../apps/web/src/lib/workspace-ai-preferences";
describe("workspace AI privacy preference", () => {
  it("never inherits a local or other hosted owner's opt-in for the same workspace", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    writeWorkspaceAiOptOut("shared", false, storage);
    const ownerA = workspaceAiPreferenceId("shared", "owner-a");
    const ownerB = workspaceAiPreferenceId("shared", "owner-b");
    expect(ownerA).toBe('hosted-ai:["owner-a","shared"]');
    expect(readWorkspaceAiOptOut(ownerA, storage)).toBe(true);
    writeWorkspaceAiOptOut(ownerA, false, storage);
    expect(readWorkspaceAiOptOut(ownerA, storage)).toBe(false);
    expect(readWorkspaceAiOptOut(ownerB, storage)).toBe(true);
    expect(workspaceAiPreferenceId("shared")).toBe("shared");
    expect(workspaceAiPreferenceId("shared", null)).toBeNull();
    expect(readWorkspaceAiOptOut(null, storage)).toBe(true);
    expect(() => writeWorkspaceAiOptOut(null, false, storage)).toThrow();
    expect(workspaceAiPreferenceId("a:b", "owner")).not.toBe(workspaceAiPreferenceId("b", "owner:a"));
  });
  it("defaults to local help and scopes explicit opt-in to the workspace", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readWorkspaceAiOptOut("one", storage)).toBe(true);
    writeWorkspaceAiOptOut("one", false, storage);
    expect(readWorkspaceAiOptOut("one", storage)).toBe(false);
    expect(readWorkspaceAiOptOut("two", storage)).toBe(true);
    writeWorkspaceAiOptOut("one", true, storage);
    expect(readWorkspaceAiOptOut("one", storage)).toBe(true);
  });
  it("fails closed for corrupted, inaccessible and absent storage", () => {
    expect(readWorkspaceAiOptOut("one", { getItem: () => "false", setItem: vi.fn() })).toBe(true);
    const unavailable = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readWorkspaceAiOptOut("one", unavailable)).toBe(true);
    expect(() => writeWorkspaceAiOptOut("one", false, unavailable)).toThrow();
    expect(readWorkspaceAiOptOut("one")).toBe(true);
    expect(() => writeWorkspaceAiOptOut("", false)).toThrow();
  });
  it("keeps a failed opt-out local even when storage retains an earlier opt-in", () => {
    const storage = { getItem: () => "external-enabled", setItem: () => { throw new Error("quota"); } };
    expect(readWorkspaceAiOptOut("previously-enabled", storage)).toBe(false);
    expect(() => writeWorkspaceAiOptOut("previously-enabled", true, storage)).toThrow();
    expect(readWorkspaceAiOptOut("previously-enabled", storage)).toBe(true);
  });
});
