// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostedAccountRecovery } from "@/components/hosted-account-recovery";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); history.replaceState(null, "", "/"); localStorage.clear(); sessionStorage.clear(); });
async function mount() {
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  await act(async () => root.render(<React.StrictMode><HostedAccountRecovery /></React.StrictMode>));
  return { container, async close() { await act(async () => root.unmount()); container.remove(); } };
}
async function input(container: HTMLElement, name: string, value: string) {
  const field = [...container.querySelectorAll("input")].find(element => element.name === name);
  if (!field) throw new Error(`Missing input ${name}`);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit(container: HTMLElement) { await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }

describe("account recovery browser controls", () => {
  it("removes the token from history, sends it only in the POST body and clears passwords after success", async () => {
    const token = "SyntheticResetToken123456";
    history.replaceState(null, "", `/account/recover#token=${token}`);
    localStorage.setItem("unrelated-return", "keep");
    const fetcher = vi.fn(async () => new Response('{"status":true}')); vi.stubGlobal("fetch", fetcher);
    const view = await mount();
    try {
      expect(location.hash).toBe(""); expect(view.container.innerHTML).not.toContain(token);
      expect(localStorage.getItem("unrelated-return")).toBe("keep"); expect(sessionStorage.length).toBe(0);
      await input(view.container, "newPassword", "Synthetic new password"); await input(view.container, "confirmPassword", "Synthetic new password");
      await submit(view.container);
      expect(fetcher).toHaveBeenCalledOnce();
      const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/auth/reset-password"); expect(options.referrerPolicy).toBe("no-referrer");
      expect(JSON.parse(String(options.body))).toEqual({ token, newPassword: "Synthetic new password" });
      expect(view.container.textContent).toContain("Your password has been changed");
      expect(view.container.querySelector('input[type="password"]')).toBeNull();
      expect(view.container.textContent).toContain("Sign in");
    } finally { await view.close(); }
  });
  it("shows the same request confirmation without displaying server details or storing the email", async () => {
    const fetcher = vi.fn(async () => new Response('{"message":"private backend account identity"}')); vi.stubGlobal("fetch", fetcher);
    const view = await mount();
    try {
      await input(view.container, "email", "synthetic@example.test"); await submit(view.container);
      expect(view.container.textContent).toContain("If an account matches that address");
      expect(view.container.textContent).not.toContain("private backend");
      expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
      expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe("/api/auth/request-password-reset");
    } finally { await view.close(); }
  });
  it("rejects mismatched passwords and invalid links without sending them, and contains server errors", async () => {
    const fetcher = vi.fn(async () => new Response('{"message":"secret recipient token"}', { status: 400 })); vi.stubGlobal("fetch", fetcher);
    history.replaceState(null, "", "/account/recover#token=SyntheticResetToken123456");
    const view = await mount();
    try {
      await input(view.container, "newPassword", "Synthetic new password"); await input(view.container, "confirmPassword", "Different valid password"); await submit(view.container);
      expect(fetcher).not.toHaveBeenCalled(); expect(view.container.textContent).toContain("Passwords must match");
      await input(view.container, "confirmPassword", "Synthetic new password"); await submit(view.container);
      expect(view.container.textContent).toContain("Request a new reset link"); expect(view.container.textContent).not.toContain("secret recipient");
    } finally { await view.close(); }
    history.replaceState(null, "", "/account/recover#token=invalid/secret");
    const invalid = await mount();
    try { expect(location.hash).toBe(""); expect(invalid.container.textContent).toContain("Request a new reset link"); expect(invalid.container.querySelector('input[type="password"]')).toBeNull(); }
    finally { await invalid.close(); }
  });
  it("cancels a pending request when the recovery screen closes", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => { signal = options.signal as AbortSignal; return new Promise(() => {}); }));
    const view = await mount();
    await input(view.container, "email", "synthetic@example.test"); await submit(view.container);
    expect(signal?.aborted).toBe(false); await view.close(); expect(signal?.aborted).toBe(true);
  });
});
