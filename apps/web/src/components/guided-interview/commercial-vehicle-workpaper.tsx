"use client";

import { useState, type ChangeEvent } from "react";
import type { GuidedCommercialScheduleCContext } from "@/lib/guided-commercial-vehicle-schedule-c";
import {
  parseCommercialVehicleWorkpaperRecords,
  reviewCommercialVehicleWorkpaper,
  type GuidedCommercialVehicleWorkpaperRecords,
} from "@/lib/guided-commercial-vehicle-workpaper";
import type { CommercialVehicleOriginal } from "@/lib/guided-vehicle-facts";

const MAX_WORKPAPER_BYTES = 1024 * 1024;

export function CommercialVehicleWorkpaper({
  original,
  context,
  onChange,
}: {
  original: CommercialVehicleOriginal;
  context: GuidedCommercialScheduleCContext;
  onChange: (workpaper: CommercialVehicleOriginal["workpaper"]) => void;
}) {
  const [pending, setPending] = useState<GuidedCommercialVehicleWorkpaperRecords>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const saved = original.workpaper;
  const records = saved?.records;
  const { fingerprint } = reviewCommercialVehicleWorkpaper(original, context);
  const confirmed = fingerprint !== undefined && fingerprint === saved?.reviewedFingerprint;

  async function readWorkpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setPending(undefined);
    setError("");
    if (file.size > MAX_WORKPAPER_BYTES) {
      setError("Choose a commercial vehicle workpaper JSON file up to 1 MB.");
      return;
    }
    setLoading(true);
    try {
      const parsed = parseCommercialVehicleWorkpaperRecords(JSON.parse(await file.text()));
      setPending(parsed);
    } catch {
      setError("Choose a valid commercial vehicle workpaper JSON file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset className="guided-fieldset">
      <legend>Commercial vehicle workpaper</legend>
      <p className="guided-hint">Import a JSON workpaper prepared from your original vehicle, depreciation and credit records. The guided draft keeps the structured records.</p>
      <label className="guided-field">
        <span className="guided-field-label">Commercial vehicle workpaper file</span>
        <input className="guided-input" type="file" accept=".json,application/json" disabled={loading} onChange={(event) => void readWorkpaper(event)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {pending && <button type="button" className="utility-button" onClick={() => {
        onChange({ records: pending });
        setPending(undefined);
      }}>Save imported workpaper</button>}
      {records && (
        <>
          <p className="guided-hint" role="status">{confirmed ? "Workpaper confirmed." : "Compare the saved workpaper with your original records before confirming."}</p>
          <button type="button" className="utility-button" disabled={!fingerprint || confirmed || loading || pending !== undefined}
            onClick={() => onChange({ records, reviewedFingerprint: fingerprint })}>Confirm workpaper against originals</button>
          <button type="button" className="utility-button" disabled={loading} onClick={() => {
            setPending(undefined);
            setError("");
            onChange(undefined);
          }}>Remove saved workpaper</button>
        </>
      )}
    </fieldset>
  );
}
