import { describe, expect, it } from "vitest";
import { validateImplementationLinks } from "../../scripts/lib/coverage-implementation-links.js";

const link = {
  key: "federal/example",
  enginePath: "src/engine/forms/shared.ts",
  packetPath: "src/pdf/mappings/2025/fill-shared.ts",
  testRefs: ["tests/engine/shared.test.ts::uses actual sources"],
  note: "Shared code and historical review output only.",
};
const context = {
  specTestRefs: new Map([[link.key, new Set(link.testRefs)]]),
  isFile: (path: string) => path === link.enginePath || path === link.packetPath,
  validTestRef: (reference: string) => reference === link.testRefs[0],
};
const document = (entries: unknown[] = [link]) => ({ version: 1, purpose: "Implementation links only", entries });

describe("explicit coverage implementation links", () => {
  it("retains shared source links without supplying qualification or coverage flags", () => {
    const data = document(), before = structuredClone(data);
    expect(validateImplementationLinks(data, context).get(link.key)).toEqual(link);
    expect(data).toEqual(before);
    expect(validateImplementationLinks(document([{ ...link, packetPath: undefined }]), context).get(link.key)?.packetPath).toBeUndefined();
  });
  it("rejects duplicate or stale spec mappings instead of silently overriding or dropping them", () => {
    expect(() => validateImplementationLinks(document([link, link]), context)).toThrow(/Duplicate implementation link/);
    expect(() => validateImplementationLinks(document([{ ...link, key: "federal/absent" }]), context)).toThrow(/no matching spec/);
  });
  it("rejects missing files and directory-only paths before generating an inventory", () => {
    expect(() => validateImplementationLinks(document(), { ...context, isFile: () => false })).toThrow(/existing source file/);
    expect(() => validateImplementationLinks(document([{ ...link, enginePath: "src/engine/forms/missing.ts" }]), context)).toThrow(/existing source file/);
    expect(() => validateImplementationLinks(document([{ ...link, packetPath: "src/pdf/mappings/2025" }]), context)).toThrow();
  });
  it.each(["/tmp/shared.ts", "src/engine/../secret.ts", "src/engine/forms/../../secret.ts", "src\\engine\\shared.ts", "apps/web/src/lib/shared.ts"])("rejects non-engine and unsafe source path %s", enginePath => {
    expect(() => validateImplementationLinks(document([{ ...link, enginePath }]), context)).toThrow();
  });
  it("requires existing references from the mapped spec, not a different passing test", () => {
    expect(() => validateImplementationLinks(document([{ ...link, testRefs: [] }]), context)).toThrow();
    expect(() => validateImplementationLinks(document([{ ...link, testRefs: [...link.testRefs, ...link.testRefs] }]), context)).toThrow(/Duplicate implementation test reference/);
    expect(() => validateImplementationLinks(document([{ ...link, testRefs: ["tests/other.test.ts::unrelated"] }]), { ...context, validTestRef: () => true })).toThrow(/own spec/);
    expect(() => validateImplementationLinks(document(), { ...context, validTestRef: () => false })).toThrow(/own spec/);
  });
  it.each(["status", "efileBusinessRuleCoverageExists", "testCoverageExists", "filingQualified"])("rejects a supplied %s promotion flag", field => {
    expect(() => validateImplementationLinks(document([{ ...link, [field]: true }]), context)).toThrow();
  });
  it("fails unknown document versions and empty provenance", () => {
    expect(() => validateImplementationLinks({ ...document(), version: 2 }, context)).toThrow();
    expect(() => validateImplementationLinks(document([{ ...link, note: " " }]), context)).toThrow();
  });
});
