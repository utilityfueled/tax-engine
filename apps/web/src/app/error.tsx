"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="workspace-grid">
      <div className="panel">
        <div className="panel-header">
          <span className="eyebrow">SYSTEM ERROR</span>
          <span className="window-led" style={{ background: "var(--danger)" }} />
        </div>
        <div className="panel-body" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p
            style={{
              fontFamily: "var(--font-display-pixel), monospace",
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              margin: "0 0 8px",
              lineHeight: 1
            }}
          >
            500
          </p>
          <p
            style={{
              fontFamily: "var(--font-display-pixel), monospace",
              fontSize: "1.4rem",
              margin: "0 0 16px",
              color: "var(--danger)"
            }}
          >
            $ process exited unexpectedly
          </p>
          <p className="panel-text" style={{ maxWidth: 520, margin: "0 auto 28px", color: "var(--muted)" }}>
            Something went wrong. Your data is safe — please try again or return to the home page.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={reset} className="launch-button">
              Try Again
            </button>
            <Link href="/" className="utility-button" style={{ textDecoration: "none" }}>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
