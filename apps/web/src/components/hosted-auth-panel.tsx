"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RetroShell } from "@/components/retro-shell";

type AuthMode =
  | "sign-in"
  | "sign-up";

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
  }

  return fallback;
}

export function HostedAuthPanel({
  initialMode
}: {
  initialMode: AuthMode;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitLabel = useMemo(() => {
    return mode === "sign-up" ? "Create Hosted Account" : "Sign In";
  }, [mode]);

  async function submit() {
    if (mode === "sign-up" && !acceptedTerms) {
      setError("You must accept the Terms of Service before creating an account.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const endpoint = mode === "sign-up"
        ? "/api/auth/sign-up/email"
        : "/api/auth/sign-in/email";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...(mode === "sign-up" ? { name: name.trim() || email.trim() } : {}),
          email: email.trim(),
          password,
          ...(mode === "sign-up" ? { acceptedTerms: true } : {}),
          callbackURL: "/billing"
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          extractErrorMessage(
            payload,
            mode === "sign-up"
              ? "Could not create the hosted account."
              : "Could not sign in."
          )
        );
      }

      window.location.assign("/billing");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Authentication failed. Please try again."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <RetroShell
      title={mode === "sign-up" ? "Create A Hosted Account" : "Sign In To Hosted Billing"}
      eyebrow="ACCOUNT"
      panelId="hosted-auth"
    >
      <div className="auth-panel">
        <div className="auth-intro">
          <p className="panel-text">
            Hosted mode keeps billing, workspace shells, and account details in the database.
            Raw uploads and extracted tax form contents stay on your device unless they are
            being processed transiently for AI assistance.
          </p>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-in"}
            className={mode === "sign-in" ? "launch-button auth-mode-button" : "utility-button auth-mode-button"}
            onClick={() => setMode("sign-in")}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign-up"}
            className={mode === "sign-up" ? "launch-button auth-mode-button" : "utility-button auth-mode-button"}
            onClick={() => setMode("sign-up")}
          >
            Create Account
          </button>
        </div>

        <form
          className="auth-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === "sign-up" ? (
            <label className="auth-field">
              <span>Name</span>
              <input
                className="auth-input"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="auth-field">
            <span>Email</span>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              className="auth-input"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "sign-up" ? (
            <label className="consent-toggle auth-consent">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                I accept the <Link href="/terms">Terms of Service</Link> and acknowledge the{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
          ) : null}
          <div className="auth-submit-row">
            <button
              type="submit"
              className="launch-button"
              disabled={
                pending
                || email.trim().length === 0
                || password.length < 8
                || (mode === "sign-up" && (name.trim().length === 0 || !acceptedTerms))
              }
            >
              {pending ? "Working..." : submitLabel}
            </button>
            <p className="auth-caption">
              {mode === "sign-up"
                ? "Create an account only if you want hosted reminders, billing, AI helper usage, or synced workspace shells."
                : "Sign in only if you want to manage a hosted software account."}
            </p>
          </div>
        </form>

        {error ? (
          <p className="answer-note" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </RetroShell>
  );
}
