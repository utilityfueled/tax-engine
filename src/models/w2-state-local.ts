/** Actual original-bound W-2 state/local drafts. Missing is never a verified zero. */
import { z } from "zod";
const answer = z.boolean().nullable();
const year = z.number().int().nullable();
const position = z.number().int().nullable();
export const W2StateLocalSourcesSchema = z.object({
  sourceTaxYear: year, sourceReference: z.string(), sourceFactsConfirmed: answer,
  owner: z.object({ accountHolder: z.enum(["", "primary", "spouse"]), originalTaxpayer: z.object({ firstName: z.string(), lastName: z.string(), ssn: z.string() }).strict().optional() }).strict(),
  originalW2: z.record(z.string(), z.unknown()).optional(),
  currentUncorrectedNonvoidOriginalConfirmed: answer, allOriginalBoxesKnownConfirmed: answer,
  singleOriginalWithoutContinuationConfirmed: answer, allOriginalPagesAndCopiesCheckedConfirmed: answer,
  stateReporting: z.enum(["", "none", "single", "multiple"]), localReporting: z.enum(["", "none", "single", "multiple"]),
  legacyScalarProjection: z.enum(["", "unused", "first_entered_rows"]),
  stateRows: z.array(z.object({ printedRow: position, sourceReference: z.string(), state: z.enum(["", "PA", "OH"]),
    employerStateIDStatus: z.enum(["", "reported", "blank_original"]), employerStateID: z.string(), wages: z.string(), withheld: z.string() }).strict()),
  localRows: z.array(z.object({ printedRow: position, sourceReference: z.string(), localityNameStatus: z.enum(["", "reported", "blank_original"]), localityName: z.string(), wages: z.string(), withheld: z.string() }).strict()),
}).strict();
export type W2StateLocalSources = z.infer<typeof W2StateLocalSourcesSchema>;
