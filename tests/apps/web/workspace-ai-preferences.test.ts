import { describe, expect, it, vi } from "vitest";
import { readWorkspaceAiOptOut, writeWorkspaceAiOptOut } from "../../../apps/web/src/lib/workspace-ai-preferences";
describe("workspace AI privacy preference", () => {
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
