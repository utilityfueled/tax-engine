import type { Metadata } from "next";
import Link from "next/link";

import {
  OFFICIAL_SUPPORT_EMAIL,
  OFFICIAL_SUPPORT_MAILTO
} from "@/lib/support";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Get help using Viva La Tax, experimental tax software for draft returns.",
  openGraph: {
    title: "Help Center — Viva La Tax",
    description:
      "Get help using Viva La Tax, experimental tax software for draft returns.",
  },
};

const faqItems = [
  {
    q: "How does Viva La Tax work?",
    a: "Upload your tax documents (W-2s, 1099s, etc.) or enter your info step by step. The engine assembles draft federal and state returns and shows you the calculation trail so you can review it yourself.",
  },
  {
    q: "Is this really free?",
    a: "The self-hosted software is free to use. Paid hosted plans are for software conveniences such as synced workspace shells, reminder tooling, and AI helper usage budgets, not for tax advice or licensed tax preparation.",
  },
  {
    q: "Is my data safe?",
    a: "In local mode, your return data is stored in your browser by default. In hosted mode, we store account, billing, reminder, and privacy-safe workspace metadata, but not raw tax forms in durable hosted storage. If you use optional AI helper or document-analysis features, selected data may be sent transiently to configured providers. We do not sell your data or use it for advertising.",
  },
  {
    q: "What tax situations do you support?",
    a: "We support most individual federal tax situations including W-2 wages, self-employment (Schedule C), investments and capital gains (Schedule D), rental income (Schedule E), retirement distributions, HSA, education credits, child tax credit, crypto/digital assets, and many more. We cover all 50 states plus DC.",
  },
  {
    q: "How accurate is this?",
    a: "The software is experimental. We use specs, IRS references, and more than 14,000 automated tests to improve coverage, but that is not a promise of correctness, completeness, or filing readiness. You should independently review every result before relying on it.",
  },
  {
    q: "What's the difference between 'Validated' and 'Best-effort' state returns?",
    a: "Validated states (CA, NY, NJ, IL, PA, OH) use dedicated state engines with deeper automated coverage. Best-effort states use a generic engine with published rates and common adjustments. Both tiers still require independent review before filing.",
  },
  {
    q: "Can I file my return electronically?",
    a: "Not yet. Viva La Tax currently generates your completed return as a PDF you can print and mail, or use with an e-file service. E-file integration is on our roadmap.",
  },
  {
    q: "Do you support crypto and digital assets?",
    a: "Yes. We support Form 1099-DA, capital gains from crypto trades (with FIFO, LIFO, HIFO, and specific ID lot matching), mining and staking income, airdrops, DeFi LP positions, NFT transactions, and more. You can also upload CSV exports from major exchanges.",
  },
  {
    q: "What if my tax situation isn't supported?",
    a: "We'll tell you upfront if we detect a situation we can't fully handle. You can export your data and continue with other software, or take the draft bundle to your own licensed professional outside this product.",
  },
  {
    q: "How do I self-host Viva La Tax?",
    a: "Viva La Tax ships as a Docker container. Run `docker compose up` and you'll have a local instance running on your machine. See the README in the repository you cloned for detailed setup instructions.",
  },
  {
    q: "I found a bug or want to contribute. Where do I go?",
    a: "Use the Issues and Pull Requests tabs in the repository you cloned this project from. We welcome community contributions.",
  },
  {
    q: "Where can I find your privacy policy and terms of service?",
    a: "Our Privacy Policy is at /privacy and our Terms of Service is at /terms. Local mode stores returns in your browser by default, optional AI features can route selected data through configured providers, we never sell your data, and the software is provided as-is under AGPL-3.0-only.",
  },
];

const supportedDocs = [
  "W-2",
  "1099-INT",
  "1099-DIV",
  "1099-B",
  "1099-NEC",
  "1099-R",
  "1099-G",
  "1099-SA",
  "1099-DA (crypto)",
  "1098-E",
  "1095-A",
  "SSA-1099",
  "Schedule K-1",
];

export default function HelpPage() {
  return (
    <main className="workspace-grid">
      <section className="hero">
        <h1>Help Center</h1>
        <p className="hero-copy">
          Everything you need to know about using Viva La Tax as experimental tax software.
        </p>
        <div className="hero-actions">
          <Link href="/" className="utility-button">
            Back to Home
          </Link>
        </div>
      </section>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">GETTING STARTED</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title">Getting Started</h2>
        <div className="panel-body">
          <div className="help-steps">
            <div className="help-step">
              <span className="help-step-number">1</span>
              <div>
                <strong>Start your return</strong>
                <p>Click &quot;Start Your Tax Return&quot; on the home page. You&apos;ll answer a few questions about your filing status, income types, and state so the app can assemble a draft return.</p>
              </div>
            </div>
            <div className="help-step">
              <span className="help-step-number">2</span>
              <div>
                <strong>Enter your information</strong>
                <p>Walk through each section step by step — income, deductions, credits. Upload documents or enter numbers manually. Your estimated result updates in real time.</p>
              </div>
            </div>
            <div className="help-step">
              <span className="help-step-number">3</span>
              <div>
                <strong>Review and download</strong>
                <p>Review your draft return with line-by-line explanations. Download filled PDF reference forms and independently verify them before filing.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">SUPPORTED DOCUMENTS</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title">Supported Documents</h2>
        <div className="panel-body">
          <p style={{ marginBottom: "1rem" }}>Upload or enter data from any of these document types:</p>
          <div className="help-doc-grid">
            {supportedDocs.map((doc) => (
              <span key={doc} className="help-doc-badge">{doc}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">FREQUENTLY ASKED QUESTIONS</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title">Frequently Asked Questions</h2>
        <div className="panel-body">
          <div className="help-faq-list">
            {faqItems.map((item, i) => (
              <details key={i} className="help-faq-item">
                <summary className="help-faq-question">{item.q}</summary>
                <p className="help-faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">NEED MORE HELP?</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <h2 className="panel-title">Need More Help?</h2>
        <div className="panel-body">
          <p>
            Viva La Tax is open-source software built in public.
            If you need help with the official hosted service, email{" "}
            <a href={OFFICIAL_SUPPORT_MAILTO}>{OFFICIAL_SUPPORT_EMAIL}</a>.
            If you are running your own copy, use the support channels in the repository you cloned or contact your own deployment operator.
          </p>
          <ul style={{ marginTop: "1rem", paddingLeft: "1.5rem" }}>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong>Hosted Viva La Tax:</strong> Billing, account, privacy, and general product questions go to{" "}
              <a href={OFFICIAL_SUPPORT_MAILTO}>{OFFICIAL_SUPPORT_EMAIL}</a>.
            </li>
            <li style={{ marginBottom: "0.5rem" }}>
              <strong>Self-hosted copies:</strong> Check the README for setup, contribution, and support guidance, or contact your own deployment operator.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
