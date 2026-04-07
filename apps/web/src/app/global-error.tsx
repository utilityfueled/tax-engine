"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="app-shell-body">
        <main className="app-shell-main">
          <section className="hero account-hero">
            <p className="hero-kicker">ERROR</p>
            <h1>Something went wrong.</h1>
            <p className="hero-copy">
              An unexpected application error occurred. The failure was recorded
              for investigation.
            </p>
            <div className="hero-actions">
              <button className="launch-button workspace-link" onClick={() => reset()} type="button">
                Try Again
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
