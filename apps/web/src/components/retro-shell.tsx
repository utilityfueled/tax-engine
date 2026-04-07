"use client";

import { useId, useState, type ReactNode } from "react";

export function RetroShell({
  title,
  eyebrow,
  panelId,
  children,
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  eyebrow: string;
  panelId?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const autoId = useId();
  const headingId = panelId ? `${panelId}-heading` : `panel${autoId}-heading`;
  const bodyId = panelId ? `${panelId}-body` : `panel${autoId}-body`;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
      className={`panel${collapsed ? " panel-collapsed" : ""}`}
      id={panelId}
      aria-labelledby={headingId}
    >
      <div className="panel-header">
        <span className="eyebrow" aria-hidden="true">{eyebrow}</span>
        <div className="panel-header-actions">
          {collapsible ? (
            <button
              type="button"
              className="panel-toggle"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              onClick={() => setCollapsed((current) => !current)}
            >
              {collapsed ? "Expand" : "Minimize"}
            </button>
          ) : null}
          <span className="window-led" aria-hidden="true" />
        </div>
      </div>
      <h2 className="panel-title" id={headingId}>{title}</h2>
      {!collapsed ? <div className="panel-body" id={bodyId}>{children}</div> : null}
    </section>
  );
}
