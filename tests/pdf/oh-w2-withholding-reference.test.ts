/** Spec: spec/state/oh-w2-withholding-reference.yaml; saved PDFs and strict reader controls. */
import { expect, it } from "vitest";
import { mkdtemp, rm, mkdir, copyFile, access, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillOhioReferenceForms } from "@/pdf/mappings/2025/fill-oh-reference-forms.js";
import { prepareOhioResidencyReview } from "@/engine/state/oh-residency-source.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local.js";
import { ohioReferenceFixture, statuses, ohioConsumerPacket, ohioConsumerOHRow, ohioConsumerW2, rebindOhioConsumerW2, allOhioSourceFamilies } from "../fixtures/oh-w2-withholding-reference.js";
function requiredFile(paths: string[], ending: string) { const file = paths.find(path => path.endsWith(ending)); if (!file) throw new Error(`Expected actual saved reference ${ending}`); return file; }
function strictTexts(paths: string[]): Record<string, string> {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "from pypdf import PdfReader\nimport sys,json\ntexts={}\nfor path in sys.argv[1:]:\n r=PdfReader(path,strict=True)\n assert not r.get_fields()\n for p in r.pages:\n  assert all(a.get_object().get('/Subtype')!='/Widget' for a in p.get('/Annots',[]))\n texts[path]='\\n'.join(p.extract_text() or '' for p in r.pages)\nprint(json.dumps(texts))", ...paths], { encoding: "utf8" })) as Record<string, string>;
}
function strictText(path: string) { return strictTexts([path])[path]; }
async function retain(paths: string[], name: string) {
  const root = process.env.OH_W2_REFERENCE_ARTIFACT_DIR; if (!root) return;
  await mkdir(join(root, name), { recursive: true });
  for (const path of paths) await copyFile(path, join(root, name, basename(path)));
}
it.each(statuses)("OH actual W2 references save all three residencies from private originals", async status => {
  for (const mode of ["pa_first", "oh_first", "unused", "zero", "no_oh"] as const) {
    const input = ohioReferenceFixture(status, mode), before = structuredClone(input), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input);
    const dir = await mkdtemp(join(tmpdir(), "oh-w2-reference-"));
    try {
      const packet = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, dir, {}, context);
      const wh = packet.filledForms.find(p => p.endsWith("/oh-schedule-of-withholding-reference.pdf"));
      const positive = mode !== "zero" && mode !== "no_oh";
      expect(Boolean(wh), `${status}/${mode}`).toBe(positive);
      const texts = strictTexts(packet.filledForms);
      for (const file of packet.filledForms) {
        const text = texts[file]; expect(text).toContain("REFERENCE SUMMARY ONLY");
        for (const secret of [input.taxpayer.primary.ssn, "PRIVATE-SYNTHETIC-OH-W2-ORIGINAL", "PRIVATE-OH-STATE-ID", "PRIVATE-ACTUAL-PA-FIRST"]) expect(text).not.toContain(secret);
        expect((await readFile(file)).length).toBeGreaterThan(1000);
      }
      if (wh) { const text = texts[wh]; expect(text).toContain("Value: 1000"); expect(text).toContain(calculateW2StateLocalSources(input, 0, ohioConsumerPacket(input)).sourceCommitment); expect(text).toContain("Reported Ohio IT1040 line14"); }
      const it1040 = requiredFile(packet.filledForms, "/oh-it-1040-reference.pdf");
      expect(texts[it1040]).toContain("Line 14: Ohio income tax withheld");
      await retain(packet.filledForms, `${status}-${mode}`); expect(input).toEqual(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
it("OH source cents remain exact beside already reported whole-dollar line14", async () => {
  const input = ohioReferenceFixture("full_year_resident", "cents"), dir = await mkdtemp(join(tmpdir(), "oh-w2-cents-"));
  try { const packet = await fillOhioReferenceForms(redactReviewIdentifiers(input), calculateFederalTax(input), dir, {}, prepareOhioResidencyReview(input)); const wh = requiredFile(packet.filledForms, "/oh-schedule-of-withholding-reference.pdf"); const text = strictText(wh); expect(text).toContain("Value: 1000.51"); expect(text).toContain("Value: 1001"); await retain(packet.filledForms, "source-cents"); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
it("OH saved support retains all eleven arrays and original digital source once", async () => {
  const input = allOhioSourceFamilies(), dir = await mkdtemp(join(tmpdir(), "oh-w2-all-"));
  try { const packet = await fillOhioReferenceForms(redactReviewIdentifiers(input), calculateFederalTax(input), dir, {}, prepareOhioResidencyReview(input)); const wh = requiredFile(packet.filledForms, "/oh-schedule-of-withholding-reference.pdf"); const text = strictText(wh); expect(text).toContain("Value: 1077.78"); for (const form of ["W-2", "W-2G", "1099-G", "1099-K", "1099-R", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-B", "1099-OID", "1099-DA"]) expect(text).toContain(form); await retain(packet.filledForms, "all-sources"); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
it.each(["staleSource", "staleFederal", "forgedContext", "noPrivateContext", "unknown", "local", "credit", "override"] as const)("OH actual source %s rejects before PDF I/O", async kind => {
  const input = ohioReferenceFixture(), federal = calculateFederalTax(input), context = prepareOhioResidencyReview(input), dir = await mkdtemp(join(tmpdir(), "oh-w2-reject-")), output = join(dir, "never-created");
  if (kind === "staleSource") ohioConsumerW2(input).employer.name = "Different same-money original";
  if (kind === "staleFederal") federal.agi = federal.agi.plus(1);
  if (kind === "unknown") ohioConsumerOHRow(input).withheld = "";
  if (kind === "local") { const packet = ohioConsumerPacket(input); packet.localReporting = "single"; packet.localRows = [{ printedRow: 1, sourceReference: "PRIVATE-LOCAL", localityNameStatus: "reported", localityName: "Actual unresolved locality", wages: "100000", withheld: "1" }]; packet.legacyScalarProjection = "unused"; for (const key of ["state", "stateWages", "stateTaxWithheld", "localWages", "localTaxWithheld", "locality", "localityName"] as const) delete ohioConsumerW2(input)[key]; rebindOhioConsumerW2(input); }
  const overlay = kind === "credit" ? { residentCredit: "1" } : kind === "override" ? { ohioWithholdingOverride: "9999" } : {};
  const selectedContext = kind === "forgedContext" ? {} as typeof context : kind === "noPrivateContext" ? undefined : kind === "local" ? prepareOhioResidencyReview(input) : context;
  try { await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), federal, output, overlay, selectedContext)).rejects.toThrow(); await expect(access(output)).rejects.toThrow(); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
