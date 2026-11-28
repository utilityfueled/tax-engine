import { describe, expect, it } from "vitest";
import { evaluationRequestContent, prepareProviderEvalCase } from "../../packages/engine/src/provider-eval-application";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { providerEvalCorpusDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";
import { prepareProviderEvalReviewPackets } from "../../scripts/lib/provider-eval-review-packet";

describe("independent provider evaluation review handoff", () => {
  it("prepares every frozen case for independent source-first review", () => {
    const { sources, decisions } = prepareProviderEvalReviewPackets();
    for (const packet of [sources, decisions]) {
      expect(packet.corpusDigest).toBe(providerEvalCorpusDigest());
      expect(packet.cases.filter(item => item.split === "development")).toHaveLength(160);
      expect(packet.cases.filter(item => item.split === "held-out")).toHaveLength(80);
    }
    expect(sources.cases).toEqual(taxProviderModelEvalFixtures.map(fixture => ({
      id: fixture.id,
      fixtureDigest: providerEvalFixtureDigest(fixture),
      task: fixture.task,
      split: fixture.split,
      taxYear: fixture.taxYear,
      ruleVersion: fixture.ruleVersion,
      input: fixture.input,
      sourceIds: fixture.sourceIds,
      requestedFields: Object.entries(fixture.expected.fields).map(([name, field]) => ({ name, kind: field.kind })),
      requestedAuditIds: Object.keys(fixture.expected.engineValues),
      ...(fixture.requestContext ? { requestContext: fixture.requestContext } : {}),
    })));
    expect(decisions.cases).toEqual(sources.cases.map(source => ({
      id: source.id,
      fixtureDigest: source.fixtureDigest,
      task: source.task,
      split: source.split,
      taxYear: source.taxYear,
      ruleVersion: source.ruleVersion,
      disposition: null,
      fields: {},
      category: null,
      engineValues: {},
      sourceReferences: [],
      notes: "",
    })));
    expect(taxProviderModelEvalFixtures.every(fixture => fixture.review.status === "pending")).toBe(true);
    expect(prepareProviderEvalReviewPackets()).toEqual({ sources, decisions });
  });
  it("gives reviewers the same requested fields and audit IDs as the provider", () => {
    const { sources } = prepareProviderEvalReviewPackets();
    for (const fixture of taxProviderModelEvalFixtures) {
      if (prepareProviderEvalCase(fixture).kind === "preflight") continue;
      const request = evaluationRequestContent(fixture);
      const source = sources.cases.find(item => item.id === fixture.id);
      expect(source).toMatchObject({
        requestedFields: request.context.requestedFields,
        requestedAuditIds: request.requestedAuditIds,
      });
    }
  });
});
