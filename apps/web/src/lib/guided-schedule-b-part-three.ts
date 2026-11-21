import type { TaxYearInput } from "@/models/inputs";
import type { GuidedFlowState } from "./guided-interview-flow";

export type ScheduleBPartThreeDraft = NonNullable<TaxYearInput["scheduleBPartThree"]>;

function applicableAnswers(draft: ScheduleBPartThreeDraft): ScheduleBPartThreeDraft {
  const { hasForeignAccounts, fbarRequired, foreignAccountCountries, hasForeignTrust } = draft;
  return {
    ...(typeof hasForeignAccounts === "boolean" ? { hasForeignAccounts } : {}),
    ...(hasForeignAccounts === true && typeof fbarRequired === "boolean" ? { fbarRequired } : {}),
    ...(hasForeignAccounts === true && fbarRequired === true && Array.isArray(foreignAccountCountries)
      ? { foreignAccountCountries } : {}),
    ...(typeof hasForeignTrust === "boolean" ? { hasForeignTrust } : {}),
  };
}

function actualCountryNames(draft: ScheduleBPartThreeDraft["foreignAccountCountries"]): string[] | undefined {
  if (!Array.isArray(draft) || !draft.length) return undefined;
  const countries = draft.map(country => typeof country === "string" ? country.trim() : "");
  return countries.every(Boolean) ? countries : undefined;
}

export function scheduleBPartThreeMissingAnswer(draft: ScheduleBPartThreeDraft | undefined): string | undefined {
  if (typeof draft?.hasForeignAccounts !== "boolean") return "Answer the foreign financial account question.";
  if (draft.hasForeignAccounts) {
    if (typeof draft.fbarRequired !== "boolean") return "Answer whether FinCEN Form 114 was required.";
    if (draft.fbarRequired && !actualCountryNames(draft.foreignAccountCountries)) {
      return "Enter every foreign account country for Schedule B, line 7b.";
    }
  }
  return typeof draft.hasForeignTrust === "boolean" ? undefined : "Answer the foreign trust question.";
}

export function updateGuidedScheduleBPartThree(state: GuidedFlowState, draft: ScheduleBPartThreeDraft): GuidedFlowState {
  const year = state.taxYear;
  if (year !== 2025 && year !== 2026) return state;
  const review = state.sectionData.review;
  return {
    ...state,
    sectionData: {
      ...state.sectionData,
      review: {
        ...review,
        scheduleBPartThreeByYear: {
          ...review?.scheduleBPartThreeByYear,
          [year]: applicableAnswers(draft),
        },
      },
    },
  };
}

export function buildGuidedScheduleBPartThree(state: GuidedFlowState): ScheduleBPartThreeDraft | undefined {
  const year = state.taxYear;
  if (year !== 2025 && year !== 2026) return undefined;
  const draft = state.sectionData.review?.scheduleBPartThreeByYear?.[year];
  if (!draft) return undefined;

  const { foreignAccountCountries, ...answers } = applicableAnswers(draft);
  const countries = actualCountryNames(foreignAccountCountries);
  if (countries) return { ...answers, foreignAccountCountries: countries };
  return Object.keys(answers).length ? answers : undefined;
}
