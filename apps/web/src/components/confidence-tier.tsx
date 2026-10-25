import {
  getConfidenceTierInfo,
  type ConfidenceTier,
  type ConfidenceTierInfo,
} from "../lib/confidence-tier";
import { RetroShell } from "./retro-shell";

/* ── Badge ── */

const TIER_CSS: Record<ConfidenceTier, string> = {
  dedicated: "confidence-badge confidence-dedicated",
  "best-effort": "confidence-badge confidence-best-effort",
  "not-applicable": "confidence-badge confidence-not-applicable",
};

const TIER_ICON: Record<ConfidenceTier, string> = {
  dedicated: "—",      // implementation category, not qualification
  "best-effort": "⚠",  // warning sign
  "not-applicable": "—", // em dash
};

export function ConfidenceBadge({ stateCode }: { stateCode: string }) {
  const info = getConfidenceTierInfo(stateCode);
  return (
    <span className={TIER_CSS[info.tier]}>
      <span aria-hidden="true">{TIER_ICON[info.tier]}</span>
      {info.label}
    </span>
  );
}

/* ── State name lookup ── */

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};

function stateName(code: string): string {
  return STATE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/* ── Disclaimer banner (only renders for best-effort states) ── */

export function DisclaimerBanner({ stateCode }: { stateCode: string }) {
  const info = getConfidenceTierInfo(stateCode);
  if (!info.disclaimer) return null;

  return (
    <div className="confidence-disclaimer" role="note" aria-label="Draft estimate disclaimer">
      <strong className="confidence-disclaimer-heading">Draft Estimate</strong>
      <p className="confidence-disclaimer-body">{info.disclaimer}</p>
      {info.missingCreditsNote && (
        <p className="confidence-disclaimer-body">{info.missingCreditsNote}</p>
      )}
    </div>
  );
}

/* ── State return panel (composite: badge + disclaimer inside RetroShell) ── */

export function StateReturnPanel({ stateCodes }: { stateCodes: string[] }) {
  if (stateCodes.length === 0) return null;

  const entries: Array<{ code: string; info: ConfidenceTierInfo }> = stateCodes.map(
    (code) => ({ code: code.toUpperCase(), info: getConfidenceTierInfo(code) })
  );

  return (
    <RetroShell title="State Returns" eyebrow="CONFIDENCE" panelId="workspace-state-returns">
      <p className="panel-text">
        Review limitations for {entries.length === 1 ? "the" : "each"} detected filing{" "}
        {entries.length === 1 ? "state" : "states"}.
      </p>
      <ul className="stack-list">
        {entries.map(({ code, info }) => (
          <li className="interview-card" key={code}>
            <div className="document-card-top">
              <strong>{stateName(code)}</strong>
              <ConfidenceBadge stateCode={code} />
            </div>
            <p className="document-meta">{info.description}</p>
            {info.disclaimer && (
              <div className="confidence-disclaimer" role="note" aria-label="Draft estimate disclaimer" style={{ marginTop: 10 }}>
                <strong className="confidence-disclaimer-heading">Draft Estimate</strong>
                <p className="confidence-disclaimer-body">{info.disclaimer}</p>
                {info.missingCreditsNote && (
                  <p className="confidence-disclaimer-body">{info.missingCreditsNote}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </RetroShell>
  );
}
