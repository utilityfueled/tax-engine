import { prepareProviderEvalReviewPackets } from "./lib/provider-eval-review-packet";

const args = process.argv.slice(2);
const [kind] = args;
if (args.length !== 1 || (kind !== "sources" && kind !== "decisions")) {
  console.error("Usage: node --import tsx scripts/prepare-provider-eval-review.ts sources|decisions");
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(prepareProviderEvalReviewPackets()[kind], null, 2)}\n`);
}
