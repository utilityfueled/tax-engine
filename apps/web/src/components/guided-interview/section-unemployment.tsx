"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type UnemploymentData,
  emptyUnemploymentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

export function SectionUnemployment({
  data,
  onDataChange,
}: {
  data: UnemploymentData | undefined;
  onDataChange: (data: UnemploymentData) => void;
}) {
  const current = data ?? emptyUnemploymentData;

  return (
    <RetroShell title="Unemployment Compensation" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Enter your unemployment compensation.</p>
        <p className="guided-hint">
          If you received unemployment benefits, you should have a 1099-G from your state.
          Unemployment compensation is fully taxable as ordinary income on your federal return.
        </p>

        <div className="guided-form-grid">
          <CurrencyField
            label="Unemployment compensation (1099-G Box 1)"
            hint="Total unemployment benefits received during the year"
            value={current.compensation}
            onChange={(v) => onDataChange({ ...current, compensation: v })}
          />
          <CurrencyField
            label="Federal tax withheld (1099-G Box 4)"
            hint="Optional — only if you elected to have taxes withheld"
            value={current.federalWithheld}
            onChange={(v) => onDataChange({ ...current, federalWithheld: v })}
          />
        </div>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">About unemployment taxes</summary>
          <div className="guided-expand-body">
            <p>
              Unemployment compensation is reported on Form 1040 Line 7.
              Unlike wages, no Social Security or Medicare tax is withheld from unemployment.
              If you didn&apos;t elect voluntary withholding, you may owe taxes when you file.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
