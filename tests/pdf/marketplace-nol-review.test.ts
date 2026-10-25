// Spec: spec/federal/marketplace-net-operating-loss.yaml review-packet.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { marketplaceNolInput } from "../fixtures/marketplace-nol.js";

it("retains the final health and separate loss ledgers in one redacted review packet", async () => {
  const input = marketplaceNolInput();
  const vintage = input.netOperatingLoss?.vintages?.[0];
  if (!vintage || !input.netOperatingLoss?.alternativeTax) throw new Error("Missing synthetic loss source");
  input.netOperatingLoss.alternativeTax.vintages = [{ ...vintage, sourceId: "amt2021", section1411OriginalLoss: undefined }];
  const result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), "marketplace-nol-review-"));
  try {
    const packet = await fillReturn(redactReviewIdentifiers(input), result, { blankFormsDir: "forms/blank/2025", outputDir: directory });
    const health = packet.filledForms.filter(path => /form-7206-/.test(path));
    const loss = packet.filledForms.filter(path => path.endsWith("nol-carry-review.pdf"));
    expect(health).toHaveLength(1); expect(loss).toHaveLength(1);
    const read = (path: string) => JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys,json; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", path],
      { encoding: "utf8", timeout: 5000 })) as string[];
    const healthPages = read(health[0]), lossPages = read(loss[0]);
    const healthText = healthPages.join(" ").replace(/\s+/g, " "), lossText = lossPages.join(" ").replace(/\s+/g, " ");
    expect(healthText).toContain("Return-level Schedule 1 line 17 transfer: $635");
    expect(healthText).toContain("Final Form 8962 credit: $5304");
    expect(lossText).toContain("Regular NOL: claimed 61240; absorbed 61240; expired 0; remaining 38760");
    expect(lossText).toContain("Alternative NOL: claimed 80314; absorbed 83070; expired 0; remaining 16930");
    for (const page of [...healthPages,...lossPages]) {
      expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
      expect(page).not.toMatch(/123.?45.?6789|6789/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
