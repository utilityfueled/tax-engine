"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { requireBrowserStorage } from "@/lib/browser-storage";
import { hostedDocumentCacheId, hostedGuidedDraftId, hostedGuidedModeKey } from "@/lib/hosted-workspace-browser-state";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";

type HostedBackupSource = {
  ownerScopeKey: string;
  current?: { workspace: ReturnWorkspaceRecord; revision: string };
};

/** Passwords and decrypted contents stay in memory and are never sent to a server. */
export function WorkspaceRecoveryControls({ workspaceId, hosted }: { workspaceId?: string; hosted?: HostedBackupSource }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setPassword(""); setFile(null); setBusy(false); setMessage(null); setRestoredId(null);
    if (fileInput.current) fileInput.current.value = "";
    return () => { controller.current?.abort(); controller.current = null; };
  }, [hosted?.ownerScopeKey, workspaceId]);

  async function run() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setMessage(null); setRestoredId(null);
    try {
      const storage = requireBrowserStorage();
      const { exportWorkspaceRecovery, importWorkspaceRecovery } = await import("@/lib/workspace-recovery");
      abort.signal.throwIfAborted();
      if (workspaceId) {
        let hostedSnapshot;
        if (hosted) {
          const { loadPersistedWorkspace } = await import("@/lib/workspace-persistence");
          const loaded = await loadPersistedWorkspace({ deploymentMode: "hosted", workspaceId, browserStorage: storage });
          if (loaded.adapter.ownerScope?.scopeKey !== hosted.ownerScopeKey || !loaded.workspace || !loaded.workspaceRevision) {
            throw new Error("Sign in to the account that owns this return before making a backup.");
          }
          const current = hosted.current?.revision === loaded.workspaceRevision ? hosted.current : null;
          if (!current && !loaded.localMirrorMatched) {
            throw new Error("This browser has no verified private copy of the saved return. Use the device where you entered the facts and uploaded the documents.");
          }
          hostedSnapshot = { workspace: current?.workspace ?? loaded.workspace,
            draftId: hostedGuidedDraftId(hosted.ownerScopeKey, workspaceId, loaded.workspaceRevision),
            guidedMode: storage.getItem(hostedGuidedModeKey(hosted.ownerScopeKey, workspaceId)),
            documentCacheWorkspaceId: hostedDocumentCacheId(hosted.ownerScopeKey, workspaceId) };
        }
        const archive = await exportWorkspaceRecovery(storage, workspaceId, password, { signal: abort.signal, hostedSnapshot });
        abort.signal.throwIfAborted();
        const url = URL.createObjectURL(archive);
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `tax-return-${workspaceId}.recovery.json`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Encrypted backup downloaded. Keep its password separately; it cannot be recovered for you.");
      } else {
        if (!file) throw new Error("Choose an encrypted recovery file.");
        const restored = await importWorkspaceRecovery(storage, file, password, { signal: abort.signal });
        abort.signal.throwIfAborted();
        setRestoredId(restored.workspaceId);
        setMessage(`Restored ${restored.documentCount} original document(s) into a new local return. Review its facts before recalculating.`);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
      }
    } catch (error) {
      if (controller.current === abort) {
        setMessage(abort.signal.aborted ? "Recovery operation cancelled." : error instanceof Error ? error.message : "Recovery could not finish. Your existing returns were not replaced.");
      }
    } finally {
      if (controller.current === abort) {
        setPassword(""); setBusy(false); controller.current = null;
      }
    }
  }
  return (
    <details className="workspace-recovery" style={{ marginTop: "12px" }}>
      <summary>{workspaceId ? "Back up this return" : "Restore an encrypted backup"}</summary>
      <p className="document-meta">
        {workspaceId
          ? "Includes your private answers and original documents. The backup is encrypted on this device and is separate from a redacted review download."
          : "Restores private answers and original documents as a new local return. The file and password stay on this device."}
      </p>
      {!workspaceId ? <div className="form-field">
        <label htmlFor={`${id}-file`}>Encrypted recovery file</label>
        <input ref={fileInput} id={`${id}-file`} type="file" accept=".json,application/json" disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </div> : null}
      <div className="form-field">
        <label htmlFor={`${id}-password`}>Backup password (at least 12 characters)</label>
        <input id={`${id}-password`} type="password" autoComplete={workspaceId ? "new-password" : "current-password"}
          minLength={12} maxLength={1024} value={password} disabled={busy}
          onChange={(event) => setPassword(event.target.value)} />
      </div>
      <button type="button" className="utility-button" disabled={busy || password.length < 12 || (!workspaceId && !file)}
        onClick={() => void run()}>{busy ? "Working…" : workspaceId ? "Download encrypted backup" : "Restore as new local return"}</button>
      {busy ? <button type="button" className="utility-button" onClick={() => controller.current?.abort()}>Cancel</button> : null}
      {message ? <p className="status-inline" role="status">{message}</p> : null}
      {restoredId ? <Link className="utility-button" href={`/returns/${restoredId}?local=1`}>Open restored return</Link> : null}
    </details>
  );
}
