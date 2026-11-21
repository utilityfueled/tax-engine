import { scheduleBPartThreeMissingAnswer, type ScheduleBPartThreeDraft } from "@/lib/guided-schedule-b-part-three";
import { BooleanFact, TextFact } from "./fact-fields";

export function ScheduleBPartThreeDetails({ year, jointReturn, data, onChange }: {
  year: 2025 | 2026;
  jointReturn: boolean;
  data?: ScheduleBPartThreeDraft;
  onChange: (draft: ScheduleBPartThreeDraft) => void;
}) {
  const countries = Array.isArray(data?.foreignAccountCountries) && data.foreignAccountCountries.length
    ? data.foreignAccountCountries : [""];
  const instructions = year === 2025
    ? "https://www.irs.gov/pub/irs-prior/i1040sb--2025.pdf#page=2"
    : "https://www.irs.gov/pub/irs-pdf/i1040sb.pdf#page=2";
  const missingAnswer = scheduleBPartThreeMissingAnswer(data);

  return (
    <details className="guided-expand">
      <summary className="guided-expand-trigger">Foreign accounts and trusts (Schedule B)</summary>
      <div className="guided-expand-body">
        {jointReturn && <p className="guided-hint">Include accounts and trusts for both spouses on this joint return.</p>}
        <p className="guided-hint"><a href={instructions} target="_blank" rel="noreferrer">{year} IRS Schedule B instructions</a></p>
        <BooleanFact
          label={`During ${year}, did you have a financial interest in or signature authority over a financial account in a foreign country?`}
          value={data?.hasForeignAccounts}
          onChange={answer => onChange({ ...data, hasForeignAccounts: answer ?? undefined })}
        />
        {data?.hasForeignAccounts === true && (
          <BooleanFact
            label={`Were you required to file FinCEN Form 114 (FBAR) for ${year}?`}
            value={data.fbarRequired}
            onChange={answer => onChange({ ...data, fbarRequired: answer ?? undefined })}
          />
        )}
        {data?.hasForeignAccounts === true && data.fbarRequired === true && (
          <fieldset className="guided-fieldset">
            <legend className="guided-fieldset-legend">Countries to list on Schedule B, line 7b</legend>
            {countries.map((country, index) => (
              <div key={index} className="guided-field-row">
                <TextFact
                  label={`Foreign account country ${index + 1}`}
                  value={typeof country === "string" ? country : ""}
                  onChange={value => onChange({ ...data, foreignAccountCountries: countries.map((name, row) => row === index ? value : name) })}
                />
                {countries.length > 1 && (
                  <button
                    type="button"
                    className="guided-card-remove"
                    aria-label={`Remove foreign account country ${index + 1}`}
                    onClick={() => onChange({ ...data, foreignAccountCountries: countries.filter((_, row) => row !== index) })}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="utility-button" onClick={() => onChange({ ...data, foreignAccountCountries: [...countries, ""] })}>
              Add country
            </button>
          </fieldset>
        )}
        <BooleanFact
          label={`During ${year}, did you receive a distribution from a foreign trust, or were you a grantor of or transferor to one?`}
          value={data?.hasForeignTrust}
          onChange={answer => onChange({ ...data, hasForeignTrust: answer ?? undefined })}
        />
        {missingAnswer && <p className="guided-hint" role="status">{missingAnswer}</p>}
      </div>
    </details>
  );
}
