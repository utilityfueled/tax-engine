import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface SampleDocument {
  id: string;
  kind: string;
  title: string;
  sourcePage: string;
  downloadUrl: string;
  notes: string;
}

const rootDir = process.cwd();
const registryPath = path.join(rootDir, "sample-documents", "registry.json");
const outputDir = path.join(rootDir, "sample-documents", "downloads");

async function main() {
  const registryRaw = await readFile(registryPath, "utf8");
  const documents = JSON.parse(registryRaw) as SampleDocument[];

  await mkdir(outputDir, { recursive: true });

  for (const document of documents) {
    const response = await fetch(document.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${document.id} from ${document.downloadUrl}: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const extension = contentType.includes("pdf") ? "pdf" : "bin";
    const outputPath = path.join(outputDir, `${document.id}.${extension}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    await writeFile(outputPath, buffer);
    console.log(`downloaded ${document.id} -> ${path.relative(rootDir, outputPath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
