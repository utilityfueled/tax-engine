import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import { parse } from "yaml";
import { collectSpecFilePaths, loadSpecs, validateTestRef } from "../src/spec-validator.js";

interface CoverageInventoryEntry {
  key: string;
  jurisdiction: "federal" | "state";
  taxYear: number | null;
  sourceAuthority: string | null;
  specPath: string | null;
  enginePath: string | null;
  packetPath: string | null;
  specExists: boolean;
  engineExists: boolean;
  packetGenerationExists: boolean;
  testCoverageExists: boolean;
  efileBusinessRuleCoverageExists: boolean;
  status: "supported" | "partial" | "unsupported";
  knownGaps: string[];
}

interface SpecBusinessRuleValidation {
  testRef?: string;
}

const projectRoot = resolve(import.meta.dirname, "..");
const packetOverrides: Record<string, { packetPath: string | null; packetGenerationExists: boolean }> = {
  "state/oh-engine": {
    packetPath: "apps/web/src/lib/workspace-filled-return.ts",
    packetGenerationExists: true,
  },
  "state/pa-orchestrator": {
    packetPath: "apps/web/src/lib/workspace-filled-return.ts",
    packetGenerationExists: true,
  },
  "state/pa-nonresident-orchestrator": {
    packetPath: "apps/web/src/lib/workspace-filled-return.ts",
    packetGenerationExists: true,
  },
  "state/pa-use-tax": {
    packetPath: "src/pdf/fill-pa-40.ts",
    packetGenerationExists: true,
  },
  "state/pa-schedule-oc": {
    packetPath: "src/pdf/fill-pa-40.ts",
    packetGenerationExists: true,
  },
  "state/pa-schedule-rk1": {
    packetPath: "src/pdf/fill-pa-40.ts",
    packetGenerationExists: true,
  },
  "state/pa-working-pennsylvanians-tax-credit": {
    packetPath: "src/pdf/fill-pa-40.ts",
    packetGenerationExists: true,
  },
  "state/oh-return": {
    packetPath: "apps/web/src/lib/workspace-filled-return.ts",
    packetGenerationExists: true,
  },
  "state/oh-input-adapter": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-it-1040": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-schedule-adjustments": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-it-bus": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-schedule-of-withholding": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-lump-sum-retirement-credit": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-lump-sum-distribution-credit": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-school-district-lookup": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-school-district-name-index": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-schedule-credits": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-resident-credit": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-it-sd-2210": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
  "state/oh-sd-100": {
    packetPath: "src/pdf/fill-oh-reference-forms.ts",
    packetGenerationExists: true,
  },
};

const manualEntries: CoverageInventoryEntry[] = [
  {
    key: "federal/form-1040-es",
    jurisdiction: "federal",
    taxYear: 2025,
    sourceAuthority: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    specPath: null,
    enginePath: null,
    packetPath: null,
    specExists: false,
    engineExists: false,
    packetGenerationExists: false,
    testCoverageExists: false,
    efileBusinessRuleCoverageExists: false,
    status: "unsupported",
    knownGaps: [
      "Missing spec coverage",
      "Missing engine implementation",
      "Missing packet generation or inclusion rule",
      "Missing complete spec-linked regression coverage",
      "Missing e-file and business-rule validation coverage",
    ],
  },
];

function walkDirectory(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalize(relativePath: string) {
  return relativePath.replace(/\\/g, "/");
}

function isTsFile(path: string) {
  return extname(path) === ".ts";
}

function readYaml(path: string) {
  return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function findExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    const absoluteCandidate = resolve(projectRoot, candidate);
    if (existsSync(absoluteCandidate)) {
      return normalize(candidate);
    }
  }

  return null;
}

function inferEngineCandidates(jurisdiction: "federal" | "state", slug: string) {
  if (jurisdiction === "state") {
    return [`src/engine/state/${slug}.ts`];
  }

  if (slug.startsWith("schedule-")) {
    return [`src/engine/schedules/${slug}.ts`, `src/engine/forms/${slug}.ts`];
  }

  return [`src/engine/forms/${slug}.ts`, `src/engine/schedules/${slug}.ts`];
}

function inferPacketCandidates(jurisdiction: "federal" | "state", slug: string) {
  if (jurisdiction === "state") {
    return [
      `src/pdf/fill-${slug}.ts`,
      `src/pdf/fill-${slug.replace(/^oh-/, "")}.ts`,
    ];
  }

  return [`src/pdf/fill-${slug}.ts`];
}

function inferSpecTestCoverage(specPath: string) {
  const loaded = loadSpecs([specPath])[0];
  if (!loaded) {
    return false;
  }

  return loaded.spec.lines.length > 0 && loaded.spec.lines.every((line) => {
    if (!line.testRef) {
      return false;
    }

    return validateTestRef(line.testRef).valid;
  });
}

function inferSpecBusinessRuleCoverage(spec: Record<string, unknown>) {
  const validations = spec.businessRuleValidation;
  if (!Array.isArray(validations) || validations.length === 0) {
    return false;
  }

  return validations.every((validation) => {
    if (!validation || typeof validation !== "object") {
      return false;
    }

    const { testRef } = validation as SpecBusinessRuleValidation;
    if (typeof testRef !== "string" || testRef.length === 0) {
      return false;
    }

    return validateTestRef(testRef).valid;
  });
}

function buildKnownGaps(entry: Pick<
  CoverageInventoryEntry,
  "specExists" | "engineExists" | "packetGenerationExists" | "testCoverageExists" | "efileBusinessRuleCoverageExists"
>) {
  const knownGaps: string[] = [];

  if (!entry.specExists) {
    knownGaps.push("Missing spec coverage");
  }

  if (!entry.engineExists) {
    knownGaps.push("Missing engine implementation");
  }

  if (!entry.packetGenerationExists) {
    knownGaps.push("Missing packet generation or inclusion rule");
  }

  if (!entry.testCoverageExists) {
    knownGaps.push("Missing complete spec-linked regression coverage");
  }

  if (!entry.efileBusinessRuleCoverageExists) {
    knownGaps.push("Missing e-file and business-rule validation coverage");
  }

  return knownGaps;
}

function computeStatus(entry: Pick<
  CoverageInventoryEntry,
  "specExists" | "engineExists" | "packetGenerationExists" | "testCoverageExists" | "efileBusinessRuleCoverageExists"
>) {
  if (!entry.specExists || !entry.engineExists) {
    return "unsupported" as const;
  }

  if (
    entry.packetGenerationExists
    && entry.testCoverageExists
    && entry.efileBusinessRuleCoverageExists
  ) {
    return "supported" as const;
  }

  return "partial" as const;
}

function createEntryFromSpec(specPath: string): CoverageInventoryEntry {
  const relativeSpecPath = normalize(relative(projectRoot, specPath));
  const scope = relativeSpecPath.includes("/state/") ? "state" : "federal";
  const slug = basename(specPath).replace(/\.(yaml|yml)$/i, "");
  const inventoryKey = `${scope}/${slug}`;
  const spec = readYaml(specPath);
  const override = packetOverrides[inventoryKey];
  const enginePath = findExistingPath(inferEngineCandidates(scope, slug));
  const inferredPacketPath = findExistingPath(inferPacketCandidates(scope, slug));
  const packetPath = override?.packetPath ?? inferredPacketPath;
  const packetGenerationExists = override?.packetGenerationExists ?? packetPath !== null;
  const testCoverageExists = inferSpecTestCoverage(specPath);
  const efileBusinessRuleCoverageExists = inferSpecBusinessRuleCoverage(spec);

  const baseEntry: CoverageInventoryEntry = {
    key: inventoryKey,
    jurisdiction: scope,
    taxYear: typeof spec.taxYear === "number" ? spec.taxYear : null,
    sourceAuthority:
      typeof spec.irsReference === "string"
        ? spec.irsReference
        : typeof spec.reference === "string"
          ? spec.reference
          : null,
    specPath: relativeSpecPath,
    enginePath,
    packetPath,
    specExists: true,
    engineExists: enginePath !== null,
    packetGenerationExists,
    testCoverageExists,
    efileBusinessRuleCoverageExists,
    status: "partial",
    knownGaps: [],
  };

  baseEntry.status = computeStatus(baseEntry);
  baseEntry.knownGaps = buildKnownGaps(baseEntry);
  return baseEntry;
}

function createEntryFromEngine(enginePath: string): CoverageInventoryEntry {
  const relativeEnginePath = normalize(relative(projectRoot, enginePath));
  const jurisdiction = relativeEnginePath.includes("/state/") ? "state" : "federal";
  const slug = basename(enginePath, ".ts");
  const inventoryKey = `${jurisdiction}/${slug}`;
  const override = packetOverrides[inventoryKey];
  const packetPath = override?.packetPath ?? findExistingPath(inferPacketCandidates(jurisdiction, slug));
  const packetGenerationExists = override?.packetGenerationExists ?? packetPath !== null;

  const baseEntry: CoverageInventoryEntry = {
    key: inventoryKey,
    jurisdiction,
    taxYear: null,
    sourceAuthority: null,
    specPath: null,
    enginePath: relativeEnginePath,
    packetPath,
    specExists: false,
    engineExists: true,
    packetGenerationExists,
    testCoverageExists: false,
    efileBusinessRuleCoverageExists: false,
    status: "unsupported",
    knownGaps: [],
  };

  baseEntry.status = computeStatus(baseEntry);
  baseEntry.knownGaps = buildKnownGaps(baseEntry);
  return baseEntry;
}

function main() {
  const specPaths = collectSpecFilePaths(["spec"])
    .filter((filePath) => !normalize(relative(projectRoot, filePath)).startsWith("spec/coverage/"));
  const entries = new Map<string, CoverageInventoryEntry>();

  for (const specPath of specPaths) {
    const entry = createEntryFromSpec(specPath);
    entries.set(entry.key, entry);
  }

  for (const enginePath of walkDirectory(resolve(projectRoot, "src/engine")).filter(isTsFile)) {
    const relativeEnginePath = normalize(relative(projectRoot, enginePath));
    if (!/src\/engine\/(forms|schedules|state)\//.test(relativeEnginePath)) {
      continue;
    }

    const entry = createEntryFromEngine(enginePath);
    if (!entries.has(entry.key)) {
      entries.set(entry.key, entry);
    }
  }

  for (const entry of manualEntries) {
    if (!entries.has(entry.key)) {
      entries.set(entry.key, entry);
    }
  }

  const output = {
    inventoryVersion: 1,
    purpose: "Implementation traceability only; not legal review, filing qualification, or e-file support.",
    entries: [...entries.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };

  const outputPath = resolve(projectRoot, "spec/coverage/inventory-2025.json");
  const serialized = JSON.stringify(output, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== serialized) {
      console.error("Coverage inventory is missing or stale. Run pnpm spec:inventory.");
      process.exitCode = 1;
    }
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
  console.log(`Wrote ${relative(projectRoot, outputPath)} with ${output.entries.length} entries.`);
}

main();
