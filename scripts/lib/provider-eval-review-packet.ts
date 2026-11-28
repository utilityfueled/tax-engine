import { providerEvalRequestedAuditIds, providerEvalRequestedFields } from "../../packages/engine/src/provider-eval-application";
import { taxProviderModelEvalFixtures } from "../../packages/engine/src/provider-eval-fixtures";
import { providerEvalCorpusDigest, providerEvalFixtureDigest } from "../../packages/engine/src/provider-eval-provenance";

export function prepareProviderEvalReviewPackets() {
  const version = 1;
  const corpusDigest = providerEvalCorpusDigest();
  const sources = taxProviderModelEvalFixtures.map(fixture => ({
    id: fixture.id,
    fixtureDigest: providerEvalFixtureDigest(fixture),
    task: fixture.task,
    split: fixture.split,
    taxYear: fixture.taxYear,
    ruleVersion: fixture.ruleVersion,
    input: fixture.input,
    sourceIds: fixture.sourceIds,
    requestedFields: providerEvalRequestedFields(fixture),
    requestedAuditIds: providerEvalRequestedAuditIds(fixture),
    ...(fixture.requestContext ? { requestContext: fixture.requestContext } : {}),
  }));
  const decisions = sources.map(({ id, fixtureDigest, task, split, taxYear, ruleVersion }) => ({
    id, fixtureDigest, task, split, taxYear, ruleVersion,
    disposition: null,
    fields: {},
    category: null,
    engineValues: {},
    sourceReferences: [],
    notes: "",
  }));
  return {
    sources: { version, corpusDigest, cases: sources },
    decisions: { version, corpusDigest, cases: decisions },
  };
}
