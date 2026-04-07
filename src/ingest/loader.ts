/**
 * Load and validate tax input data from JSON files or objects.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";

/**
 * Load tax data from a directory of JSON files.
 * Expects a taxpayer.json and optional form-specific files.
 */
export function loadFromDirectory(dirPath: string): TaxYearInput {
  const readJson = (filename: string): unknown => {
    const filePath = join(dirPath, filename);
    if (!existsSync(filePath)) return undefined;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  };

  const taxpayer = readJson("taxpayer.json");
  if (!taxpayer) {
    throw new Error(`taxpayer.json not found in ${dirPath}`);
  }

  const raw = {
    taxpayer,
    w2s: readJson("w2s.json") ?? [],
    form1099Int: readJson("1099-int.json") ?? [],
    form1099Div: readJson("1099-div.json") ?? [],
    form1099B: readJson("1099-b.json") ?? [],
    form1099Nec: readJson("1099-nec.json") ?? [],
    form1099Misc: readJson("1099-misc.json") ?? [],
    form1099R: readJson("1099-r.json"),
    form1099SA: readJson("1099-sa.json"),
    formSSA1099: readJson("ssa-1099.json"),
    formRRB1099: readJson("rrb-1099.json"),
    socialSecurityLumpSumElection: readJson("social-security-lump-sum-election.json"),
    form8606: readJson("8606.json"),
    form8606ByOwner: readJson("8606-by-owner.json"),
    form8889: readJson("8889.json"),
    form8889ByOwner: readJson("8889-by-owner.json"),
    scheduleK1: readJson("k1s.json") ?? [],
    form1098: readJson("1098.json") ?? [],
    form1095A: readJson("1095-a.json") ?? [],
    donations: readJson("donations.json") ?? [],
    priorYear: readJson("prior-year.json"),
    adjustments: readJson("adjustments.json"),
  };

  return TaxYearInputSchema.parse(raw);
}

/**
 * Validate and parse tax input from a raw object.
 */
export function parseInput(raw: unknown): TaxYearInput {
  return TaxYearInputSchema.parse(raw);
}
