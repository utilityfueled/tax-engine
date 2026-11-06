import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildProviderModelBenchmark, buildProviderModelEvalFixturePack, buildProviderModelLiveEvalTemplate,
  parseProviderModelLiveEvalTemplate, renderProviderModelBenchmarkMarkdown, summarizeProviderModelLiveEvalTemplate,
  taxProviderModelEvalFixtures,
} from "../packages/engine/src/provider-model-eval";
import type { ProviderEvalFixture } from "../packages/engine/src/provider-eval-fixtures";

const args = process.argv.slice(2).filter(arg => arg !== "--");
function option(name: string) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const root = new URL("..", import.meta.url);
const artifacts = [
  ["docs/strategy/model-stack-eval.md", renderProviderModelBenchmarkMarkdown()],
  ["prompts/provider-model-eval/fixture-pack.json", `${JSON.stringify(buildProviderModelEvalFixturePack(), null, 2)}\n`],
  ["prompts/provider-model-eval/benchmark.json", `${JSON.stringify(buildProviderModelBenchmark(), null, 2)}\n`],
  ["prompts/provider-model-eval/live-run-template.json", `${JSON.stringify(buildProviderModelLiveEvalTemplate(), null, 2)}\n`],
] as const;

try {
  if (args.includes("--sync")) {
    for (const [name, contents] of artifacts) {
      await mkdir(new URL(`${path.dirname(name)}/`, root), { recursive: true });
      await writeFile(new URL(name, root), contents);
      console.log(`updated ${name}`);
    }
  } else if (args.includes("--check")) {
    for (const [name, contents] of artifacts) {
      if (await readFile(new URL(name, root), "utf8") !== contents) throw new Error(`Evaluation artifact is stale: ${name}`);
    }
    console.log("provider model eval artifacts are in sync");
  } else if (args.includes("--live-summary")) {
    const file = option("--live-run-file") ?? "prompts/provider-model-eval/live-run-template.json";
    const template = parseProviderModelLiveEvalTemplate(JSON.parse(await readFile(path.resolve(root.pathname, file), "utf8")));
    let fixtures = taxProviderModelEvalFixtures;
    const reviewedFile = option("--reviewed-fixtures-file");
    if (reviewedFile) {
      const pack = JSON.parse(await readFile(path.resolve(root.pathname, reviewedFile), "utf8")) as { fixtures: ProviderEvalFixture[] };
      if (!Array.isArray(pack.fixtures) || pack.fixtures.length !== fixtures.length) throw new Error("Reviewed pack must contain every frozen case.");
      const ids = new Set<string>();
      for (const fixture of pack.fixtures) {
        const original = fixtures.find(item => item.id === fixture.id);
        if (!original || ids.has(fixture.id) || JSON.stringify({ ...fixture, review: original.review }) !== JSON.stringify(original)) {
          throw new Error("Reviewed pack changed a frozen case. Revise the corpus and rerun all profiles before comparing.");
        }
        ids.add(fixture.id);
      }
      fixtures = pack.fixtures;
    }
    console.log(JSON.stringify(summarizeProviderModelLiveEvalTemplate(template, fixtures), null, 2));
  } else if (args.includes("--markdown")) {
    console.log(renderProviderModelBenchmarkMarkdown());
  } else {
    console.log(JSON.stringify(buildProviderModelBenchmark(), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
