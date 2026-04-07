import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

interface CoverageInventoryEntry {
  key: string;
  packetGenerationExists: boolean;
  status: "supported" | "partial" | "unsupported";
  knownGaps: string[];
}

interface CoverageInventory {
  generatedAt: string;
  entries: CoverageInventoryEntry[];
}

const inventory = JSON.parse(
  readFileSync(new URL("../../spec/coverage/inventory-2025.json", import.meta.url), "utf8"),
) as CoverageInventory;

describe("coverage inventory", () => {
  it("loads the regenerated 2025 coverage inventory", () => {
    expect(new Date(inventory.generatedAt).toString()).not.toBe("Invalid Date");
    expect(inventory.entries.length).toBeGreaterThan(0);
  });

  it("records the Pennsylvania resident orchestrator packet path as implemented", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-orchestrator");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
  });

  it("records the Pennsylvania Schedule F packet as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-f");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Form 6198 packet gap as closed", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/form-6198");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records Form 2441 as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/form-2441");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records Form 4137 as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/form-4137");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the IRA deduction worksheet packet gap as closed", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/ira-deduction-worksheet");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the SE health insurance worksheet packet gap as closed", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/se-health-insurance-worksheet");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule NRH packet as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-nrh");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule SP packet as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-sp");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule E packet as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-e");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule SD packet as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-sd");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Use Tax packet inclusion on PA-40 as validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-use-tax");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule OC packet inclusion on PA-40 as validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-oc");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Schedule RK-1 packet inclusion on PA-40 as validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-schedule-rk1");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the Pennsylvania Working Pennsylvanians Tax Credit packet inclusion on PA-40 as validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "state/pa-working-pennsylvanians-tax-credit");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records Form 2555 as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/form-2555");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records Form 4684 as business-rule validated", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/form-4684");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });

  it("records the partner basis schedule packet gap as closed", () => {
    const entry = inventory.entries.find((candidate) => candidate.key === "federal/partner-basis-schedule");

    expect(entry).toBeDefined();
    expect(entry?.packetGenerationExists).toBe(true);
    expect(entry?.status).toBe("supported");
    expect(entry?.knownGaps).not.toContain("Missing packet generation or inclusion rule");
    expect(entry?.knownGaps).not.toContain("Missing e-file and business-rule validation coverage");
  });
});
