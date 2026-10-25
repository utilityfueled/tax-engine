"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RetroShell } from "@/components/retro-shell";
import { isRecoveryToken } from "@/lib/hosted-recovery-contract";

export function HostedAccountRecovery() {
  const initialized = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const candidate = fragment.get("token");
      // Remove both query and fragment before any user action or request.
      window.history.replaceState(null, "", window.location.pathname);
      if (candidate && fragment.getAll("token").length === 1 && isRecoveryToken(candidate)) setToken(candidate);
      else if (candidate !== null) setError("That link cannot be used. Request a new reset link.");
      setReady(true);
    }
    return () => {
      controller.current?.abort(); controller.current = null;
      if (requestTimer.current) clearTimeout(requestTimer.current);
    };
  }, []);

  async function submit() {
    if (!ready || pending) return;
    setError(""); setNotice("");
    if (token && (password.length < 8 || password.length > 128 || password !== confirmation)) {
      setError("Passwords must match and contain between 8 and 128 characters."); return;
    }
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const timeout = setTimeout(() => active.abort(), 30_000);
    requestTimer.current = timeout;
    setPending(true);
    try {
      const response = await fetch(token ? "/api/auth/reset-password" : "/api/auth/request-password-reset", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        cache: "no-store", referrerPolicy: "no-referrer", signal: active.signal,
        body: JSON.stringify(token ? { token, newPassword: password } : { email: email.trim() }),
      });
      if (active.signal.aborted) return;
      if (!response.ok) {
        setError(response.status === 429 ? "Too many requests. Try again later."
          : response.status >= 500 ? "Account recovery is unavailable. Please try again later."
          : token ? "That link cannot be used. Request a new reset link." : "Check the email address and try again.");
        return;
      }
      if (token) { setToken(null); setPassword(""); setConfirmation(""); setFinished(true); setNotice("Your password has been changed. Sign in with your new password."); }
      else { setEmail(""); setNotice("If an account matches that address, you’ll receive a reset link."); }
    } catch {
      if (!active.signal.aborted) setError("Account recovery is unavailable. Please try again later.");
      else if (controller.current === active) setError("The request was cancelled or timed out. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (requestTimer.current === timeout) requestTimer.current = null;
      if (controller.current === active) { controller.current = null; setPending(false); }
    }
  }

  function requestAnotherLink() {
    controller.current?.abort(); controller.current = null;
    if (requestTimer.current) clearTimeout(requestTimer.current);
    requestTimer.current = null;
    setPending(false); setToken(null); setPassword(""); setConfirmation(""); setError(""); setNotice("");
  }

  return <RetroShell title={token ? "Choose a new password" : "Recover your account"} eyebrow="ACCOUNT" panelId="account-recovery">
    <p className="panel-text">Resetting your password signs you out on other devices. It does not restore tax facts saved only in a browser. Use your encrypted return backup to recover those facts.</p>
    {!finished && ready ? <form className="auth-form-grid" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {token ? <>
        <label className="auth-field"><span>New password</span><input className="auth-input" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="auth-field"><span>Confirm new password</span><input className="auth-input" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      </> : <label className="auth-field"><span>Account email</span><input className="auth-input" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} /></label>}
      <div className="auth-submit-row"><button type="submit" className="launch-button" disabled={pending}>{pending ? "Working…" : token ? "Change password" : "Send reset link"}</button>
        {token ? <button type="button" className="utility-button" onClick={requestAnotherLink}>Request a new reset link</button> : null}</div>
    </form> : null}
    {error ? <p className="answer-note" role="alert">{error}</p> : null}
    {notice ? <p className="answer-note" role="status">{notice}</p> : null}
    <Link href="/account" className="utility-button workspace-link">Sign in</Link>
  </RetroShell>;
}
