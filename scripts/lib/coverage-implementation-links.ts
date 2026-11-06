import { z } from "zod";

const linkSchema = z.object({
  key: z.string().regex(/^(federal|state)\/[a-z0-9][a-z0-9-]*$/),
  enginePath: z.string().regex(/^src\/engine\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/),
  packetPath: z.string().regex(/^src\/pdf\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/).optional(),
  testRefs: z.array(z.string().trim().min(1)).min(1),
  note: z.string().trim().min(1),
}).strict();
const documentSchema = z.object({
  version: z.literal(1),
  purpose: z.string().trim().min(1),
  entries: z.array(linkSchema),
}).strict();

export type CoverageImplementationLink = z.infer<typeof linkSchema>;

/** Explicit code links never supply test coverage, business rules or readiness. */
export function validateImplementationLinks(
  document: unknown,
  context: {
    specTestRefs: ReadonlyMap<string, ReadonlySet<string>>;
    isFile: (path: string) => boolean;
    validTestRef: (reference: string) => boolean;
  },
): ReadonlyMap<string, CoverageImplementationLink> {
  const links = new Map<string, CoverageImplementationLink>();
  for (const link of documentSchema.parse(document).entries) {
    if (links.has(link.key)) throw new Error(`Duplicate implementation link: ${link.key}`);
    const specRefs = context.specTestRefs.get(link.key);
    if (!specRefs) throw new Error(`Implementation link has no matching spec: ${link.key}`);
    for (const path of [link.enginePath, link.packetPath]) {
      if (path && !context.isFile(path)) throw new Error(`Implementation link is not an existing source file: ${path}`);
    }
    if (new Set(link.testRefs).size !== link.testRefs.length) throw new Error(`Duplicate implementation test reference: ${link.key}`);
    for (const reference of link.testRefs) {
      if (!specRefs.has(reference) || !context.validTestRef(reference)) {
        throw new Error(`Implementation test reference must resolve in its own spec: ${link.key}: ${reference}`);
      }
    }
    links.set(link.key, link);
  }
  return links;
}
