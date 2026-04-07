"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReturnWorkspaceRecord, WorkspaceDeploymentMode } from "@tax-engine/contracts";
import {
  buildReturnAssistantReply,
  type ReturnAssistantContext,
  type ReturnAssistantReply,
} from "@/lib/workspace-assistant";
import {
  ProviderWorkspaceRequestError,
  requestProviderWorkspaceHelp
} from "@/lib/provider-workspace-request";
import { isGuidedSyntheticDocument } from "@/lib/workspace-status-copy";

interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
  reply?: ReturnAssistantReply;
  provider?: string | null;
  actionLabel?: string;
  actionHref?: string;
}

export function decodeDisplayEntities(text: string) {
  return text
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function shouldShowQuickPrompts(messageCount: number, draft: string) {
  return messageCount === 0 && draft.trim().length === 0;
}

export function formatSelectedDocumentCount(count: number) {
  if (count === 0) {
    return "No documents selected.";
  }

  return `${count} document${count === 1 ? "" : "s"} selected for AI context.`;
}

export function ReturnHelpDock({
  workspace,
  mode,
  currentSectionId = null,
  currentSectionLabel = null,
  onOpenGuided,
  onUploadDocuments,
  deploymentMode,
}: {
  workspace: ReturnWorkspaceRecord;
  mode: "workspace" | "guided";
  currentSectionId?: string | null;
  currentSectionLabel?: string | null;
  onOpenGuided?: () => void;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  deploymentMode: WorkspaceDeploymentMode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentsCollapsed, setDocumentsCollapsed] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const previousDocumentIdsRef = useRef<string[]>([]);

  const context: ReturnAssistantContext = {
    mode,
    currentSectionId,
    currentSectionLabel,
  };
  const overview = useMemo(
    () => buildReturnAssistantReply(workspace, context, ""),
    [workspace, context],
  );

  const quickPrompts = mode === "workspace"
    ? [
        "How should I start this return?",
        "What can you fill from my uploads?",
      ]
    : [
        "What can you fill from my uploads?",
        currentSectionId === "income-w2" ? "How do I use my W-2 here?" : "What should I do in this section?",
      ];
  const helperDocuments = useMemo(
    () => workspace.documents
      .filter((document) => !isGuidedSyntheticDocument(document))
      .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
    [workspace.documents]
  );
  const showQuickPrompts = shouldShowQuickPrompts(messages.length, draft);
  const selectedDocumentSummary = formatSelectedDocumentCount(selectedDocumentIds.length);

  useEffect(() => {
    const currentIds = helperDocuments.map((document) => document.id);

    setSelectedDocumentIds((existing) => {
      const retained = existing.filter((id) => currentIds.includes(id));
      const isInitialLoad = previousDocumentIdsRef.current.length === 0 && existing.length === 0;
      const newIds = currentIds.filter((id) => !previousDocumentIdsRef.current.includes(id));

      previousDocumentIdsRef.current = currentIds;

      if (isInitialLoad) {
        return currentIds;
      }

      return [...retained, ...newIds];
    });
  }, [helperDocuments]);

  async function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      return;
    }

    const priorMessages = messages.slice(-6).map((message) => ({
      role: message.role,
      text: message.text
    }));

    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
    ]);
    setDraft("");
    setOpen(true);
    setPending(true);

    try {
      const result = await requestProviderWorkspaceHelp(workspace, trimmed, {
        selectedDocumentIds,
        ...(deploymentMode === "self-host"
          ? { workspaceStorageModeOverride: "local-browser" as const }
          : {}),
        assistantContext: {
          mode,
          currentSectionId,
          currentSectionLabel,
          conversation: priorMessages
        }
      });

      const answer = result.response.answer
        ?? buildReturnAssistantReply(workspace, context, trimmed).summary;
      const budgetLabel = "budget" in result.response
        && result.response.budget
        && typeof result.response.budget === "object"
        && result.response.budget !== null
        && "totalRemainingCents" in result.response.budget
        ? ` Remaining AI budget: $${(((result.response.budget as { totalRemainingCents: number }).totalRemainingCents) / 100).toFixed(2)}.`
        : "";

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: `${answer}${budgetLabel}`,
          provider: result.response.provider
        }
      ]);
    } catch (error) {
      let text = error instanceof Error
        ? error.message
        : "Could not reach the AI helper right now.";
      let actionLabel: string | undefined;
      let actionHref: string | undefined;

      if (error instanceof ProviderWorkspaceRequestError) {
        if (error.code === "auth_required") {
          text = "Sign in and choose a paid plan to use the AI assistant.";
          actionLabel = "Sign in";
          actionHref = error.signInUrl ?? "/account?mode=sign-in";
        } else if (error.code === "paid_plan_required") {
          text = "The AI assistant is available on paid hosted plans only.";
          actionLabel = "View plans";
          actionHref = error.billingUrl ?? "/billing";
        } else if (error.code === "ai_budget_exhausted") {
          text = "Your included AI helper budget is exhausted. Buy more AI credits to continue.";
          actionLabel = "Open billing";
          actionHref = error.billingUrl ?? "/billing";
        }
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text,
          provider: null,
          ...(actionLabel && actionHref ? { actionLabel, actionHref } : {})
        }
      ]);
    } finally {
      setPending(false);
    }
  }

  async function handleDocumentUpload(files: File[]) {
    if (!onUploadDocuments || files.length === 0) {
      return;
    }

    setUploadPending(true);
    setDocumentMessage(null);

    try {
      const message = await onUploadDocuments(files);
      setDocumentMessage(message);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : "Could not upload the selected documents.");
    } finally {
      setUploadPending(false);
    }
  }

  function toggleSelectedDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  return (
    <div className="return-help-dock">
      {open && (
        <section className="return-help-panel" aria-label="Return help panel">
          <div className="return-help-header">
            <div>
              <p className="return-help-eyebrow">HELP</p>
              <h2 className="return-help-title">Return Helper</h2>
              <p className="return-help-meta">
                {currentSectionLabel
                  ? `Context: ${currentSectionLabel}`
                  : "Context: full return workspace"}
              </p>
            </div>
            <button
              type="button"
              className="utility-button utility-button-small"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="return-help-thread">
            {messages.length === 0 ? (
              <div className="return-help-message return-help-message-assistant">
                <strong>{overview.title}</strong>
                <p>{overview.summary}</p>
                {overview.bullets.length > 0 ? (
                  <ul className="return-help-bullets">
                    {overview.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {overview.action === "open-guided" && onOpenGuided ? (
                  <button
                    type="button"
                    className="launch-button"
                    onClick={onOpenGuided}
                  >
                    Start guided interview
                  </button>
                ) : null}
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  className={`return-help-message ${message.role === "assistant" ? "return-help-message-assistant" : "return-help-message-user"}`}
                  key={`${message.role}:${index}:${message.text}`}
                >
                  {message.role === "assistant" && message.reply ? (
                    <>
                      <strong>{message.reply.title}</strong>
                      <p>{message.reply.summary}</p>
                      {message.reply.bullets.length > 0 ? (
                        <ul className="return-help-bullets">
                          {message.reply.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                      {message.reply.action === "open-guided" && onOpenGuided ? (
                        <button
                          type="button"
                          className="launch-button"
                          onClick={onOpenGuided}
                        >
                          Start guided interview
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p>{decodeDisplayEntities(message.text)}</p>
                      {message.actionLabel && message.actionHref ? (
                        <a
                          className="utility-button utility-button-small"
                          href={message.actionHref}
                        >
                          {message.actionLabel}
                        </a>
                      ) : null}
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {showQuickPrompts ? (
            <div className="return-help-actions">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="utility-button utility-button-small"
                  onClick={() => submitQuestion(prompt)}
                  disabled={pending}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {(helperDocuments.length > 0 || onUploadDocuments) ? (
            <section className="return-help-documents" aria-label="Document context for AI helper">
              <div className="return-help-documents-header">
                <div>
                  <strong className="return-help-documents-title">Document context</strong>
                  {!documentsCollapsed ? (
                    <p className="return-help-documents-copy">
                      Select uploaded files or upload one or more PDFs to focus the helper on how they relate to this section.
                    </p>
                  ) : null}
                </div>
                <div className="return-help-documents-actions">
                  {onUploadDocuments && !documentsCollapsed ? (
                    <>
                      <button
                        type="button"
                        className="utility-button utility-button-small"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={uploadPending}
                      >
                        {uploadPending ? "Uploading..." : "Upload docs"}
                      </button>
                      <input
                        ref={uploadInputRef}
                        className="guided-doc-upload-input"
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          void handleDocumentUpload(files);
                          event.target.value = "";
                        }}
                      />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={`return-help-documents-toggle${documentsCollapsed ? " return-help-documents-toggle-collapsed" : ""}`}
                    onClick={() => setDocumentsCollapsed((current) => !current)}
                    aria-expanded={!documentsCollapsed}
                    aria-label={documentsCollapsed ? "Expand document context" : "Collapse document context"}
                  >
                    <span className="return-help-documents-toggle-icon" aria-hidden="true">
                      <span className="return-help-documents-toggle-sheet" />
                      <span className="return-help-documents-toggle-arrow" />
                    </span>
                    <span className="return-help-documents-toggle-label">
                      {documentsCollapsed ? "Upload docs" : "Minimize"}
                    </span>
                  </button>
                </div>
              </div>
              {!documentsCollapsed ? (
                <>
                  {helperDocuments.length > 0 ? (
                    <div className="return-help-document-list">
                      {helperDocuments.map((document) => {
                        const selected = selectedDocumentIds.includes(document.id);

                        return (
                          <button
                            key={document.id}
                            type="button"
                            className={`return-help-document-chip${selected ? " return-help-document-chip-selected" : ""}`}
                            onClick={() => toggleSelectedDocument(document.id)}
                            aria-pressed={selected}
                          >
                            <span className="return-help-document-chip-title">{document.label}</span>
                            <span className="return-help-document-chip-meta">
                              {document.name} · {document.coverage}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="return-help-documents-copy">
                      No uploaded documents yet. Add one or more PDFs here and the helper will include them in context.
                    </p>
                  )}
                  {documentMessage ? (
                    <p className="return-help-document-status">{documentMessage}</p>
                  ) : null}
                </>
              ) : (
                <p className="return-help-documents-copy">
                  {selectedDocumentSummary}
                </p>
              )}
            </section>
          ) : null}

          <form
            className="return-help-input-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion(draft);
            }}
          >
            <input
              className="return-help-input"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask the AI helper about this return..."
              aria-label="Ask for help with your return"
            />
            <button
              className="chat-send-button"
              type="submit"
              disabled={pending}
              aria-label={pending ? "AI helper is thinking" : "Ask the AI helper"}
            >
              {pending ? (
                <span className="chat-send-button-thinking" aria-hidden="true">
                  <span className="chat-send-button-dot" />
                  <span className="chat-send-button-dot" />
                  <span className="chat-send-button-dot" />
                </span>
              ) : "Ask"}
            </button>
          </form>

          <p className="return-help-disclaimer">
            Suggestions can use uploaded document data from this return, but you must review
            and confirm any AI-suggested field before relying on it. Any helper document context
            is processed transiently, can include multiple selected files in a single request, and
            is not stored in our database or durable hosted storage.
            Viva La Tax is software, not a licensed tax preparer or tax advice service.
          </p>
        </section>
      )}

      <button
        type="button"
        className="launch-button return-help-launch"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide help" : "Need help?"}
      </button>
    </div>
  );
}
