import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderModelBenchmark,
  buildProviderModelEvalFixturePack,
  buildProviderModelBenchmarkSnapshot,
  buildProviderModelLiveEvalTemplate,
  parseProviderModelLiveEvalTemplate,
  renderProviderModelBenchmarkMarkdown,
  providerModelPricingSnapshot,
  providerModelCandidates,
  recommendProviderModelStack,
  summarizeProviderModelLiveEvalTemplate,
  taxProviderModelEvalFixtures
} from "@tax-engine/engine";

describe("provider model eval harness", () => {
  it("covers the required tax-workflow task types with committed redacted fixtures", () => {
    expect(taxProviderModelEvalFixtures.map((fixture) => fixture.task)).toEqual([
      "workspace-summary",
      "interview-assist",
      "unsupported-route",
      "explanation-draft"
    ]);

    for (const fixture of taxProviderModelEvalFixtures) {
      const serializedPayload = JSON.stringify(fixture.payload);

      expect(fixture.estimatedInputTokens).toBeGreaterThan(0);
      expect(fixture.estimatedOutputTokens).toBeGreaterThan(0);

      for (const blockedTerm of fixture.blockedTerms) {
        expect(serializedPayload).not.toContain(blockedTerm);
      }
    }
  });

  it("keeps a committed provider-safe fixture pack synchronized for later live evals", () => {
    const fixturePack = buildProviderModelEvalFixturePack();
    const checkedInFixturePack = readFileSync(
      new URL("../../prompts/provider-model-eval/fixture-pack.json", import.meta.url),
      "utf8"
    );
    const serializedFixturePack = JSON.stringify(fixturePack, null, 2);

    expect(fixturePack).toMatchObject({
      version: 1,
      pricingRetrievedAt: providerModelPricingSnapshot.retrievedAt,
      fixtureCount: 4,
      taskTypes: [
        "workspace-summary",
        "interview-assist",
        "unsupported-route",
        "explanation-draft"
      ]
    });

    for (const blockedTerm of taxProviderModelEvalFixtures.flatMap((fixture) => fixture.blockedTerms)) {
      expect(serializedFixturePack).not.toContain(blockedTerm);
    }

    expect(`${serializedFixturePack}\n`).toBe(checkedInFixturePack);
  });

  it("keeps a committed provider-safe benchmark snapshot synchronized with the harness output", () => {
    const benchmarkSnapshot = buildProviderModelBenchmarkSnapshot();
    const checkedInBenchmarkSnapshot = readFileSync(
      new URL("../../prompts/provider-model-eval/benchmark.json", import.meta.url),
      "utf8"
    );
    const serializedBenchmarkSnapshot = JSON.stringify(benchmarkSnapshot, null, 2);

    expect(benchmarkSnapshot).toMatchObject({
      version: 1,
      sourcePath: "../../prompts/provider-model-eval/benchmark.json",
      fixturePackPath: "../../prompts/provider-model-eval/fixture-pack.json",
      fixtureCount: 4,
      taskTypes: [
        "workspace-summary",
        "interview-assist",
        "unsupported-route",
        "explanation-draft"
      ],
      pricingSnapshot: providerModelPricingSnapshot,
      roleRubric: {
        primary: {
          taskWeights: {
            "workspace-summary": 0.35,
            "interview-assist": 0.35,
            "unsupported-route": 0.1,
            "explanation-draft": 0.2
          },
          metricWeights: {
            taskFit: 0.45,
            structuredOutput: 0.1,
            latency: 0.2,
            price: 0.25
          }
        },
        fallback: {
          taskWeights: {
            "workspace-summary": 0.1,
            "interview-assist": 0.1,
            "unsupported-route": 0.45,
            "explanation-draft": 0.35
          },
          metricWeights: {
            taskFit: 0.65,
            structuredOutput: 0.1,
            latency: 0.05,
            price: 0.2
          }
        },
        lowCost: {
          taskWeights: {
            "workspace-summary": 0.35,
            "interview-assist": 0.35,
            "unsupported-route": 0.15,
            "explanation-draft": 0.15
          },
          metricWeights: {
            taskFit: 0.15,
            structuredOutput: 0.1,
            latency: 0.25,
            price: 0.5
          }
        }
      }
    });

    for (const blockedTerm of taxProviderModelEvalFixtures.flatMap((fixture) => fixture.blockedTerms)) {
      expect(serializedBenchmarkSnapshot).not.toContain(blockedTerm);
    }

    expect(`${serializedBenchmarkSnapshot}\n`).toBe(checkedInBenchmarkSnapshot);
  });

  it("keeps a committed live-run worksheet synchronized for future API benchmarks", () => {
    const liveEvalTemplate = buildProviderModelLiveEvalTemplate();
    const checkedInLiveEvalTemplate = readFileSync(
      new URL("../../prompts/provider-model-eval/live-run-template.json", import.meta.url),
      "utf8"
    );
    const serializedLiveEvalTemplate = JSON.stringify(liveEvalTemplate, null, 2);

    expect(liveEvalTemplate).toMatchObject({
      version: 1,
      sourcePath: "../../prompts/provider-model-eval/live-run-template.json",
      benchmarkPath: "../../prompts/provider-model-eval/benchmark.json",
      fixturePackPath: "../../prompts/provider-model-eval/fixture-pack.json",
      candidateCount: 4,
      fixtureCount: 4
    });

    for (const blockedTerm of taxProviderModelEvalFixtures.flatMap((fixture) => fixture.blockedTerms)) {
      expect(serializedLiveEvalTemplate).not.toContain(blockedTerm);
    }

    expect(`${serializedLiveEvalTemplate}\n`).toBe(checkedInLiveEvalTemplate);
  });

  it("rejects malformed live-run worksheets before summarizing them", () => {
    const liveEvalTemplate = buildProviderModelLiveEvalTemplate();
    const malformedTemplate = {
      ...liveEvalTemplate,
      entries: [
        {
          ...liveEvalTemplate.entries[0],
          tier: "low-cost"
        }
      ]
    };

    expect(() => parseProviderModelLiveEvalTemplate(malformedTemplate)).toThrowError(
      /Invalid provider model live-eval file:/
    );
    expect(() => parseProviderModelLiveEvalTemplate(malformedTemplate)).toThrowError(
      /entries\[0\]\.tier: must match model gpt-5\.2 tier premium/
    );
    expect(() => parseProviderModelLiveEvalTemplate(malformedTemplate)).toThrowError(
      /entries: must contain candidateCount \* fixtureCount entries \(16\)/
    );
  });

  it("keeps the benchmark recommendation aligned to the current stack defaults", () => {
    const recommendation = recommendProviderModelStack();

    expect(recommendation.primary.modelId).toBe("gpt-5-mini");
    expect(recommendation.fallback.modelId).toBe("gpt-5.2");
    expect(recommendation.lowCost.modelId).toBe("gpt-5-nano");
  });

  it("pins the committed pricing snapshot used by the benchmark", () => {
    expect(providerModelPricingSnapshot).toEqual({
      retrievedAt: "2026-03-12",
      pricingSourceUrl: "https://platform.openai.com/docs/pricing",
      modelSourceUrls: [
        "https://platform.openai.com/docs/models",
        "https://platform.openai.com/docs/models/gpt-5.2",
        "https://platform.openai.com/docs/models/gpt-5.1",
        "https://platform.openai.com/docs/models/gpt-5-mini",
        "https://platform.openai.com/docs/models/gpt-5-nano"
      ]
    });

    expect(providerModelCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelId: "gpt-5.2",
          pricing: {
            inputUsdPerMillionTokens: 1.75,
            cachedInputUsdPerMillionTokens: 0.175,
            outputUsdPerMillionTokens: 14
          },
          evaluation: {
            taskScores: {
              "workspace-summary": 10,
              "interview-assist": 10,
              "unsupported-route": 10,
              "explanation-draft": 10
            },
            structuredOutputScore: 10,
            latencyScore: 3,
            priceScore: 2
          }
        }),
        expect.objectContaining({
          modelId: "gpt-5.1",
          pricing: {
            inputUsdPerMillionTokens: 1.25,
            cachedInputUsdPerMillionTokens: 0.125,
            outputUsdPerMillionTokens: 10
          },
          evaluation: {
            taskScores: {
              "workspace-summary": 9,
              "interview-assist": 8,
              "unsupported-route": 9,
              "explanation-draft": 9
            },
            structuredOutputScore: 8,
            latencyScore: 5,
            priceScore: 3
          }
        }),
        expect.objectContaining({
          modelId: "gpt-5-mini",
          pricing: {
            inputUsdPerMillionTokens: 0.25,
            cachedInputUsdPerMillionTokens: 0.025,
            outputUsdPerMillionTokens: 2
          },
          evaluation: {
            taskScores: {
              "workspace-summary": 8,
              "interview-assist": 9,
              "unsupported-route": 7,
              "explanation-draft": 8
            },
            structuredOutputScore: 9,
            latencyScore: 8,
            priceScore: 9
          }
        }),
        expect.objectContaining({
          modelId: "gpt-5-nano",
          pricing: {
            inputUsdPerMillionTokens: 0.05,
            cachedInputUsdPerMillionTokens: 0.005,
            outputUsdPerMillionTokens: 0.4
          },
          evaluation: {
            taskScores: {
              "workspace-summary": 5,
              "interview-assist": 6,
              "unsupported-route": 4,
              "explanation-draft": 5
            },
            structuredOutputScore: 7,
            latencyScore: 10,
            priceScore: 10
          }
        })
      ])
    );
  });

  it("orders estimated benchmark cost from current premium to lowest-cost tiers", () => {
    const benchmark = buildProviderModelBenchmark();

    expect(benchmark.pricingSnapshot).toEqual(providerModelPricingSnapshot);
    expect(benchmark.roleRubric.primary.metricWeights.price).toBe(0.25);
    expect(benchmark.roleRubric.fallback.taskWeights["unsupported-route"]).toBe(0.45);
    expect(benchmark.roleRubric.lowCost.metricWeights.price).toBe(0.5);

    const gpt52 = benchmark.candidates.find((candidate) => candidate.modelId === "gpt-5.2");
    const gpt51 = benchmark.candidates.find((candidate) => candidate.modelId === "gpt-5.1");
    const gpt5Mini = benchmark.candidates.find((candidate) => candidate.modelId === "gpt-5-mini");
    const gpt5Nano = benchmark.candidates.find((candidate) => candidate.modelId === "gpt-5-nano");

    expect(gpt52).toBeDefined();
    expect(gpt51).toBeDefined();
    expect(gpt5Mini).toBeDefined();
    expect(gpt5Nano).toBeDefined();

    expect(gpt52!.estimatedPackCostUsd).toBeGreaterThan(gpt51!.estimatedPackCostUsd);
    expect(gpt51!.estimatedPackCostUsd).toBeGreaterThan(gpt5Mini!.estimatedPackCostUsd);
    expect(gpt5Mini!.estimatedPackCostUsd).toBeGreaterThan(gpt5Nano!.estimatedPackCostUsd);

    expect(gpt52!.estimatedCachedPackCostUsd).toBeLessThan(gpt52!.estimatedPackCostUsd);
    expect(gpt51!.estimatedCachedPackCostUsd).toBeLessThan(gpt51!.estimatedPackCostUsd);
    expect(gpt5Mini!.estimatedCachedPackCostUsd).toBeLessThan(gpt5Mini!.estimatedPackCostUsd);
    expect(gpt5Nano!.estimatedCachedPackCostUsd).toBeLessThan(gpt5Nano!.estimatedPackCostUsd);

    expect(gpt52!.estimatedCachedPackCostUsd).toBeGreaterThan(gpt51!.estimatedCachedPackCostUsd);
    expect(gpt51!.estimatedCachedPackCostUsd).toBeGreaterThan(gpt5Mini!.estimatedCachedPackCostUsd);
    expect(gpt5Mini!.estimatedCachedPackCostUsd).toBeGreaterThan(gpt5Nano!.estimatedCachedPackCostUsd);

    expect(gpt52!.taskFitScores.fallback).toBeGreaterThan(gpt51!.taskFitScores.fallback);
    expect(gpt51!.taskFitScores.fallback).toBeGreaterThan(gpt5Mini!.taskFitScores.fallback);
    expect(gpt5Mini!.scores.primary).toBeGreaterThan(gpt52!.scores.primary);
    expect(gpt5Nano!.scores.lowCost).toBeGreaterThan(gpt5Mini!.scores.lowCost);
  });

  it("summarizes partially completed live runs into comparable model metrics", () => {
    const template = buildProviderModelLiveEvalTemplate();
    const scoredTemplate = {
      ...template,
      entries: template.entries.map((entry) => {
        if (entry.modelId !== "gpt-5-mini") {
          return entry;
        }

        const latencyByFixtureId: Record<string, number> = {
          "workspace-summary-supported": 900,
          "interview-assist-withholding": 1100,
          "unsupported-route-side-gig": 1500,
          "explanation-draft-ready-preview": 1000
        };
        const taskQualityByFixtureId: Record<string, number> = {
          "workspace-summary-supported": 8,
          "interview-assist-withholding": 9,
          "unsupported-route-side-gig": 7,
          "explanation-draft-ready-preview": 8
        };
        const structuredOutputByFixtureId: Record<string, number> = {
          "workspace-summary-supported": 9,
          "interview-assist-withholding": 8,
          "unsupported-route-side-gig": 8,
          "explanation-draft-ready-preview": 9
        };

        return {
          ...entry,
          requiredSignalResults: entry.requiredSignalResults.map((result, index) => ({
            ...result,
            passed: entry.fixtureId === "unsupported-route-side-gig" && index === 2 ? false : true
          })),
          latencyMs: latencyByFixtureId[entry.fixtureId],
          taskQualityScore: taskQualityByFixtureId[entry.fixtureId],
          structuredOutputReliabilityScore: structuredOutputByFixtureId[entry.fixtureId],
          hallucinationObserved: false,
          privacyLeakObserved: false,
          unsupportedBoundaryHeld: entry.task === "unsupported-route" ? true : null,
          notes: "Scored from a local live API run."
        };
      })
    };

    const summary = summarizeProviderModelLiveEvalTemplate(scoredTemplate);
    const gpt5Mini = summary.candidates.find((candidate) => candidate.modelId === "gpt-5-mini");
    const gpt52 = summary.candidates.find((candidate) => candidate.modelId === "gpt-5.2");

    expect(summary).toMatchObject({
      version: 1,
      sourcePath: "../../prompts/provider-model-eval/live-run-template.json",
      benchmarkPath: "../../prompts/provider-model-eval/benchmark.json",
      fixturePackPath: "../../prompts/provider-model-eval/fixture-pack.json",
      candidateCount: 4,
      fixtureCount: 4,
      entryCount: 16,
      completedEntryCount: 4,
      pendingEntryCount: 12,
      readyForRecommendation: false,
      recommendationCoverage: {
        primary: {
          ready: false,
          completedModelIds: ["gpt-5-mini"],
          missingModelIds: ["gpt-5.2", "gpt-5.1"]
        },
        fallback: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5.2", "gpt-5.1"]
        },
        lowCost: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5-nano"]
        }
      },
      provisionalRecommendation: {
        primary: {
          modelId: "gpt-5-mini"
        },
        fallback: null,
        lowCost: null
      }
    });

    expect(gpt5Mini).toMatchObject({
      completedEntryCount: 4,
      pendingEntryCount: 0,
      averageLatencyMs: 1125,
      averageTaskQualityScore: 8,
      averageStructuredOutputReliabilityScore: 8.5,
      requiredSignalPassRate: 0.917,
      hallucinationRate: 0,
      privacyLeakRate: 0,
      unsupportedBoundaryHoldRate: 1
    });

    expect(gpt52).toMatchObject({
      completedEntryCount: 0,
      pendingEntryCount: 4,
      averageLatencyMs: null,
      averageTaskQualityScore: null,
      averageStructuredOutputReliabilityScore: null,
      requiredSignalPassRate: null,
      hallucinationRate: null,
      privacyLeakRate: null,
      unsupportedBoundaryHoldRate: null
    });
  });

  it("does not unlock live recommendations from touched-but-unscored worksheet rows", () => {
    const template = buildProviderModelLiveEvalTemplate();
    const touchedTemplate = {
      ...template,
      entries: template.entries.map((entry) => ({
        ...entry,
        notes: "Row reviewed but not scored yet."
      }))
    };

    const summary = summarizeProviderModelLiveEvalTemplate(touchedTemplate);

    expect(summary).toMatchObject({
      completedEntryCount: 16,
      pendingEntryCount: 0,
      readyForRecommendation: false,
      recommendationCoverage: {
        primary: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5.2", "gpt-5.1", "gpt-5-mini"]
        },
        fallback: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5.2", "gpt-5.1"]
        },
        lowCost: {
          ready: false,
          completedModelIds: [],
          missingModelIds: ["gpt-5-nano"]
        }
      },
      provisionalRecommendation: {
        primary: null,
        fallback: null,
        lowCost: null
      }
    });
  });

  it("turns completed live runs into provisional role picks and applies safety gates", () => {
    const template = buildProviderModelLiveEvalTemplate();
    const scoredTemplate = {
      ...template,
      entries: template.entries.map((entry) => {
        const scoringByModelId: Record<
          string,
          {
            latencyMs: number;
            taskQualityScore: number;
            structuredOutputReliabilityScore: number;
            hallucinationObserved: boolean;
            privacyLeakObserved: boolean;
            unsupportedBoundaryHeld: boolean | null;
          }
        > = {
          "gpt-5.2": {
            latencyMs: 1800,
            taskQualityScore: 10,
            structuredOutputReliabilityScore: 9,
            hallucinationObserved: false,
            privacyLeakObserved: false,
            unsupportedBoundaryHeld: entry.task === "unsupported-route" ? false : null
          },
          "gpt-5.1": {
            latencyMs: 1300,
            taskQualityScore: entry.task === "unsupported-route" ? 9 : 8,
            structuredOutputReliabilityScore: 8,
            hallucinationObserved: false,
            privacyLeakObserved: false,
            unsupportedBoundaryHeld: entry.task === "unsupported-route" ? true : null
          },
          "gpt-5-mini": {
            latencyMs: 900,
            taskQualityScore: entry.task === "unsupported-route" ? 7 : 9,
            structuredOutputReliabilityScore: 9,
            hallucinationObserved: false,
            privacyLeakObserved: false,
            unsupportedBoundaryHeld: entry.task === "unsupported-route" ? true : null
          },
          "gpt-5-nano": {
            latencyMs: 650,
            taskQualityScore: entry.task === "unsupported-route" ? 5 : 6,
            structuredOutputReliabilityScore: 7,
            hallucinationObserved: false,
            privacyLeakObserved: false,
            unsupportedBoundaryHeld: entry.task === "unsupported-route" ? true : null
          }
        };
        const scoring = scoringByModelId[entry.modelId];

        return {
          ...entry,
          requiredSignalResults: entry.requiredSignalResults.map((result) => ({
            ...result,
            passed: true
          })),
          latencyMs: scoring.latencyMs,
          taskQualityScore: scoring.taskQualityScore,
          structuredOutputReliabilityScore: scoring.structuredOutputReliabilityScore,
          hallucinationObserved: scoring.hallucinationObserved,
          privacyLeakObserved: scoring.privacyLeakObserved,
          unsupportedBoundaryHeld: scoring.unsupportedBoundaryHeld,
          notes: "Scored from a complete local live API benchmark."
        };
      })
    };

    const summary = summarizeProviderModelLiveEvalTemplate(scoredTemplate);

    expect(summary).toMatchObject({
      completedEntryCount: 16,
      pendingEntryCount: 0,
      readyForRecommendation: true,
      recommendationCoverage: {
        primary: {
          ready: true,
          completedModelIds: ["gpt-5.2", "gpt-5.1", "gpt-5-mini"],
          missingModelIds: []
        },
        fallback: {
          ready: true,
          completedModelIds: ["gpt-5.2", "gpt-5.1"],
          missingModelIds: []
        },
        lowCost: {
          ready: true,
          completedModelIds: ["gpt-5-nano"],
          missingModelIds: []
        }
      },
      provisionalRecommendation: {
        primary: {
          modelId: "gpt-5-mini"
        },
        fallback: {
          modelId: "gpt-5.1"
        },
        lowCost: {
          modelId: "gpt-5-nano"
        }
      }
    });
  });

  it("keeps the checked-in markdown benchmark report synchronized with the harness output", () => {
    const benchmark = buildProviderModelBenchmark();
    const checkedInReport = readFileSync(
      new URL("../../docs/strategy/model-stack-eval.md", import.meta.url),
      "utf8"
    );
    const renderedReport = renderProviderModelBenchmarkMarkdown(benchmark);

    for (const blockedTerm of taxProviderModelEvalFixtures.flatMap((fixture) => fixture.blockedTerms)) {
      expect(renderedReport).not.toContain(blockedTerm);
    }

    expect(renderedReport).toBe(checkedInReport);
  });
});
