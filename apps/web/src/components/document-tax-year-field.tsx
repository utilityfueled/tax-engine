"use client";

import { useId, useState } from "react";

export function DocumentTaxYearField({
  taxYear,
  fixture,
  onConfirm,
}: {
  taxYear: number | null | undefined;
  fixture: boolean;
  onConfirm: (year: number | null) => Promise<void>;
}) {
  const id = useId();
  const [value, setValue] = useState(taxYear?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = value.trim() === "" ? null : Number(value);
  const valid = year === null || (/^\d{4}$/.test(value.trim()) && Number.isInteger(year) && year >= 1900 && year <= 2100);

  return (
    <div className="field-group">
      <label htmlFor={id}>Tax year shown on this document</label>
      <input id={id} inputMode="numeric" value={value} disabled={fixture || saving}
        aria-describedby={`${id}-help`}
        onChange={(event) => { setValue(event.target.value); setError(null); }} />
      <p className="document-meta" id={`${id}-help`}>
        {fixture ? "Official sample year." : "Enter the year printed on the form. Leave blank if it is unknown; the filename does not establish the tax year."}
      </p>
      {!fixture && <button type="button" className="utility-button utility-button-small"
        disabled={saving || !valid || year === (taxYear ?? null)}
        onClick={async () => {
          if (!valid) return;
          setSaving(true);
          try { await onConfirm(year); }
          catch { setError("Could not save this document's tax year. Please try again."); }
          finally { setSaving(false); }
        }}>
        {saving ? "Saving…" : "Confirm document year"}
      </button>}
      {!valid && <p role="alert">Enter a four-digit year between 1900 and 2100.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
