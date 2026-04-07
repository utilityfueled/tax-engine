import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not Found — Viva La Tax"
};

export default function NotFound() {
  return (
    <div className="workspace-grid">
      <div className="panel">
        <div className="panel-header">
          <span className="eyebrow">SYSTEM MESSAGE</span>
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
            404
          </p>
          <p
            style={{
              fontFamily: "var(--font-display-pixel), monospace",
              fontSize: "1.4rem",
              margin: "0 0 16px",
              color: "var(--danger)"
            }}
          >
            $ ERROR: file not found
          </p>
          <p className="panel-text" style={{ maxWidth: 480, margin: "0 auto 28px", color: "var(--muted)" }}>
            This page doesn&apos;t exist. It might have been moved or deleted.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" className="launch-button" style={{ textDecoration: "none" }}>
              Back to Home
            </Link>
            <Link href="/help" className="utility-button" style={{ textDecoration: "none" }}>
              Help Center
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
