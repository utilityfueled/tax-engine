import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildProviderModelBenchmark,
  buildProviderModelBenchmarkSnapshot,
  buildProviderModelEvalFixturePack,
  buildProviderModelLiveEvalTemplate,
  parseProviderModelLiveEvalTemplate,
  renderProviderModelBenchmarkMarkdown,
  summarizeProviderModelLiveEvalTemplate,
  taxProviderModelEvalFixtures
} from "../packages/engine/src/provider-model-eval";

const benchmark = buildProviderModelBenchmark();
const benchmarkSnapshot = buildProviderModelBenchmarkSnapshot(benchmark);
const fixturePack = buildProviderModelEvalFixturePack();
const liveEvalTemplate = buildProviderModelLiveEvalTemplate(benchmark);
const rootDir = new URL("..", import.meta.url);
const markdown = renderProviderModelBenchmarkMarkdown(benchmark);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

function getOptionValue(optionName: string) {
  const exactPrefix = `${optionName}=`;
  const inlineArgument = rawArgs.find((argument) => argument.startsWith(exactPrefix));

  if (inlineArgument) {
    return inlineArgument.slice(exactPrefix.length);
  }

  const optionIndex = rawArgs.indexOf(optionName);
  if (optionIndex === -1) {
    return null;
  }

  return rawArgs[optionIndex + 1] ?? null;
}

const artifactFiles = [
  {
    relativePath: "docs/strategy/model-stack-eval.md",
    outputPath: new URL("../docs/strategy/model-stack-eval.md", import.meta.url),
    contents: markdown,
    trailingNewline: false
  },
  {
    relativePath: "prompts/provider-model-eval/fixture-pack.json",
    outputPath: new URL("../prompts/provider-model-eval/fixture-pack.json", import.meta.url),
    contents: JSON.stringify(fixturePack, null, 2),
    trailingNewline: true
  },
  {
    relativePath: "prompts/provider-model-eval/benchmark.json",
    outputPath: new URL("../prompts/provider-model-eval/benchmark.json", import.meta.url),
    contents: JSON.stringify(benchmarkSnapshot, null, 2),
    trailingNewline: true
  },
  {
    relativePath: "prompts/provider-model-eval/live-run-template.json",
    outputPath: new URL("../prompts/provider-model-eval/live-run-template.json", import.meta.url),
    contents: JSON.stringify(liveEvalTemplate, null, 2),
    trailingNewline: true
  }
] as const;

async function writeArtifact(outputPath: URL, contents: string, trailingNewline = false) {
  const outputDir = new URL(".", outputPath);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, trailingNewline ? `${contents}\n` : contents);
  console.log(`updated ${path.relative(rootDir.pathname, outputPath.pathname)}`);
}

async function syncArtifacts() {
  for (const artifact of artifactFiles) {
    await writeArtifact(artifact.outputPath, artifact.contents, artifact.trailingNewline);
  }
}

async function checkArtifacts() {
  const mismatches: string[] = [];

  for (const artifact of artifactFiles) {
    const expected = artifact.trailingNewline ? `${artifact.contents}\n` : artifact.contents;

    try {
      const current = await readFile(artifact.outputPath, "utf8");

      if (current !== expected) {
        mismatches.push(artifact.relativePath);
      }
    } catch {
      mismatches.push(artifact.relativePath);
    }
  }

  if (mismatches.length === 0) {
    console.log("provider model eval artifacts are in sync");
    return;
  }

  console.error("provider model eval artifacts are out of sync:");
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }

  process.exitCode = 1;
}

async function summarizeLiveRunTemplate() {
  const relativePath = getOptionValue("--live-run-file") ?? "prompts/provider-model-eval/live-run-template.json";
  const resolvedPath = path.isAbsolute(relativePath)
    ? pathToFileURL(relativePath)
    : new URL(`../${relativePath}`, import.meta.url);
  const liveRunTemplate = parseProviderModelLiveEvalTemplate(
    JSON.parse(await readFile(resolvedPath, "utf8"))
  );
  const summary = summarizeProviderModelLiveEvalTemplate(liveRunTemplate);

  console.log(JSON.stringify(summary, null, 2));
}

if (args.has("--markdown")) {
  console.log(markdown);
}

if (args.has("--write-doc")) {
  const artifact = artifactFiles.find((entry) => entry.relativePath === "docs/strategy/model-stack-eval.md");
  if (!artifact) {
    throw new Error("Missing markdown benchmark artifact configuration.");
  }
  await writeArtifact(artifact.outputPath, artifact.contents, artifact.trailingNewline);
}

if (args.has("--fixtures-json")) {
  console.log(JSON.stringify(fixturePack, null, 2));
}

if (args.has("--write-fixtures")) {
  const artifact = artifactFiles.find(
    (entry) => entry.relativePath === "prompts/provider-model-eval/fixture-pack.json"
  );
  if (!artifact) {
    throw new Error("Missing fixture-pack artifact configuration.");
  }
  await writeArtifact(artifact.outputPath, artifact.contents, artifact.trailingNewline);
}

if (args.has("--benchmark-json")) {
  console.log(JSON.stringify(benchmarkSnapshot, null, 2));
}

if (args.has("--write-benchmark")) {
  const artifact = artifactFiles.find(
    (entry) => entry.relativePath === "prompts/provider-model-eval/benchmark.json"
  );
  if (!artifact) {
    throw new Error("Missing benchmark artifact configuration.");
  }
  await writeArtifact(artifact.outputPath, artifact.contents, artifact.trailingNewline);
}

if (args.has("--live-template-json")) {
  console.log(JSON.stringify(liveEvalTemplate, null, 2));
}

if (args.has("--write-live-template")) {
  const artifact = artifactFiles.find(
    (entry) => entry.relativePath === "prompts/provider-model-eval/live-run-template.json"
  );
  if (!artifact) {
    throw new Error("Missing live-run template artifact configuration.");
  }
  await writeArtifact(artifact.outputPath, artifact.contents, artifact.trailingNewline);
}

if (args.has("--sync")) {
  await syncArtifacts();
}

if (args.has("--check")) {
  await checkArtifacts();
}

if (args.has("--live-summary")) {
  try {
    await summarizeLiveRunTemplate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (args.has("--json")) {
  console.log(JSON.stringify(benchmark, null, 2));
}

if (args.size > 0) {
  process.exit(process.exitCode ?? 0);
}

console.log("Tax workflow model eval harness");
console.log(`Pricing snapshot: ${benchmark.pricingSnapshot.retrievedAt}`);
console.log(`Pricing source: ${benchmark.pricingSnapshot.pricingSourceUrl}`);
console.log("");

console.log("Fixtures");
for (const fixture of taxProviderModelEvalFixtures) {
  console.log(
    `- ${fixture.id} | task=${fixture.task} | input≈${fixture.estimatedInputTokens} tok | output≈${fixture.estimatedOutputTokens} tok`
  );
}

console.log("");
console.log("Candidates");
for (const candidate of benchmark.candidates) {
  console.log(
    `- ${candidate.modelId} | tier=${candidate.tier} | cold≈$${candidate.estimatedPackCostUsd.toFixed(6)} | cached≈$${candidate.estimatedCachedPackCostUsd.toFixed(6)} | primary=${candidate.scores.primary} | fallback=${candidate.scores.fallback} | low-cost=${candidate.scores.lowCost}`
  );
}

console.log("");
console.log("Recommendation");
console.log(
  `- primary: ${benchmark.recommendation.primary.modelId} (${benchmark.recommendation.primary.rationale})`
);
console.log(
  `- fallback: ${benchmark.recommendation.fallback.modelId} (${benchmark.recommendation.fallback.rationale})`
);
console.log(
  `- low-cost: ${benchmark.recommendation.lowCost.modelId} (${benchmark.recommendation.lowCost.rationale})`
);
